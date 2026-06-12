/**
 * engine.reduce — the pure orchestrator the hub DO runs each tick.
 *
 *   reduce(state, inputs, ctx) -> nextState | undefined   (undefined = no change)
 *
 * It applies buffered inputs (with host-authority + role checks), then advances
 * the phase machine on early-completion predicates, host SKIP, or timer expiry.
 * `ctx` is the spine's ReduceCtx: `now` is injected epoch-ms, `connected` is
 * the live socket roster, and `content` is the FULL prompt pool (core + spicy,
 * stable-ordered) — the active pool is derived in here from `config.allowSpicy`
 * at draw time, so the no-leak draw mechanism (only the cursor + drawn text are
 * broadcast) keeps working. No React / no SDK imports.
 *
 * Spine contract: the DO writes `recapId` / `registryId` onto the state; this
 * reducer is clone-based (structuredClone of prev), so those fields are carried
 * through unchanged on every returned state.
 */
import { assignPrompts } from './assignPrompts'
import { cleanChat } from './chat'
import { colorForSeat, PLAYER_COLORS } from '../../shared/colors'
import type { ReduceCtx } from '../spine'
import { PERSONAS, type Persona } from './personas'
import { allAnswersIn, allFinalVotesIn, allVotersVoted, phaseSeconds } from './phases'
import { mulberry32, shuffle } from './rng'
import { scoreFinal, scoreMatchup } from './scoring'
import { SAFETY_QUIP, validateAnswer } from './validation'
import {
  AUDIENCE_WEIGHT,
  CHAT_MIN_INTERVAL_MS,
  CHAT_RING_MAX,
  DEFAULT_CONFIG,
  EMOTE_MIN_INTERVAL_MS,
  EMOTE_RING_MAX,
  EMOTES,
  MAX_BOTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type GameConfig,
  type GameState,
  type GameSummary,
  type MatchupResult,
  type Phase,
  type PlayerRole,
  type Prompt,
  type RawInput,
} from './types'

/** The wisecrack reduce context: spine ctx with the full prompt pool as content. */
export type WisecrackCtx = ReduceCtx<Prompt[]>

export function initialState(seed: number, configOverride: Partial<GameConfig> = {}): GameState {
  return {
    game: 'wisecrack',
    phase: 'LOBBY',
    hostUserId: null,
    config: { ...DEFAULT_CONFIG, ...configOverride },
    seed: seed >>> 0,
    roomCode: '',
    players: {},
    order: [],
    roundIndex: 0,
    promptCursor: 0,
    promptText: {},
    matchups: [],
    voteIndex: 0,
    results: [],
    lastRoundDeltas: {},
    phaseEndsAt: null,
    winnerUserId: null,
    bestMatchup: null,
    summary: null,
    registryId: null,
    chat: [],
    emotes: [],
    lastChatAt: {},
    lastEmoteAt: {},
  }
}

export function reduce(prev: GameState, inputs: RawInput[], ctx: WisecrackCtx): GameState | undefined {
  const draft: GameState = structuredClone(prev)
  let changed = false
  let forceAdvance = false

  for (const input of inputs) {
    const r = applyInput(draft, input, ctx)
    changed = changed || r.changed
    forceAdvance = forceAdvance || r.forceAdvance
  }

  // Host handoff: if the host has disconnected, pass the host bit to the first
  // still-connected seat so START / SKIP / PLAY_AGAIN never strand the room.
  if (draft.hostUserId && !ctx.connected.includes(draft.hostUserId)) {
    const next = draft.order.find((id) => ctx.connected.includes(id))
    if (next && next !== draft.hostUserId) {
      const old = draft.players[draft.hostUserId]
      if (old) old.role = 'contestant'
      draft.hostUserId = next
      if (draft.players[next]) draft.players[next].role = 'host'
      changed = true
    }
  }

  // Phase auto-advance: forced (host SKIP), early-completion, or timer expiry.
  // LOBBY/PODIUM have no timer and no early predicate, and SKIP is rejected
  // there, so this loop is naturally a no-op in those phases.
  let steps = 0
  while ((forceAdvance || earlyComplete(draft) || timerExpired(draft, ctx.now)) && steps++ < 32) {
    const terminal: boolean = draft.phase === 'PODIUM'
    if (terminal) break
    advance(draft, ctx)
    changed = true
    forceAdvance = false
  }

  return changed ? draft : undefined
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function applyInput(
  draft: GameState,
  input: RawInput,
  ctx: WisecrackCtx,
): { changed: boolean; forceAdvance: boolean } {
  const { userId, action } = input
  const data = input.data ?? {}
  const isHost = userId === draft.hostUserId

  switch (action) {
    case 'JOIN': {
      // NOTE: JOIN data may also carry a `game` field — the hub's room-binding
      // key, consumed by the DO before this reducer runs. Ignored here.
      const name = sanitizeName(typeof data.name === 'string' ? data.name : '', draft.order.length)
      const cid = typeof data.cid === 'string' ? data.cid.slice(0, 64) : ''
      if (!draft.roomCode && typeof data.roomCode === 'string') {
        draft.roomCode = data.roomCode.slice(0, 8).toUpperCase()
      }

      // Already seated under this connection id → refresh name/cid/color.
      const existing = draft.players[userId]
      if (existing) {
        let changed = false
        if (name && existing.name !== name) { existing.name = name; changed = true }
        if (cid && existing.cid !== cid) { existing.cid = cid; changed = true }
        const reqColor = typeof data.color === 'string' ? data.color : ''
        if (draft.phase === 'LOBBY' && reqColor && reqColor !== existing.color) {
          const free = pickColor(draft, reqColor, userId)
          if (free !== existing.color) { existing.color = free; changed = true }
        }
        return { changed, forceAdvance: false }
      }

      // Reconnect (any phase): a refresh hands the player a NEW connection id but
      // the same cid — rebind their existing seat instead of orphaning it. Remap
      // every reference (order, host, in-flight matchups, rate-limit maps) from
      // the old id so the returning player keeps their seat, score, and authorship.
      if (cid) {
        // Seat-steal guard: cids are broadcast in state, so possession of one
        // proves nothing. Only rebind a seat whose owner has no live socket and
        // is human (bots never hold sockets — without the isBot check a crafted
        // JOIN could take over a bot's seat).
        const oldId = Object.keys(draft.players).find(
          (id) =>
            id !== userId &&
            draft.players[id]?.cid === cid &&
            !ctx.connected.includes(id) &&
            !draft.players[id]?.isBot,
        )
        if (oldId) {
          const p = draft.players[oldId]
          delete draft.players[oldId]
          p.userId = userId
          if (name) p.name = name
          draft.players[userId] = p
          draft.order = draft.order.map((id) => (id === oldId ? userId : id))
          if (draft.hostUserId === oldId) draft.hostUserId = userId
          for (const m of draft.matchups) {
            m.authorIds = m.authorIds.map((a) => (a === oldId ? userId : a))
            if (oldId in m.answers) { m.answers[userId] = m.answers[oldId]; delete m.answers[oldId] }
            if (oldId in m.safety) { m.safety[userId] = m.safety[oldId]; delete m.safety[oldId] }
            if (oldId in m.votes) { m.votes[userId] = m.votes[oldId]; delete m.votes[oldId] }
            for (const vid of Object.keys(m.votes)) m.votes[vid] = m.votes[vid].map((a) => (a === oldId ? userId : a))
          }
          if (oldId in draft.lastChatAt) { draft.lastChatAt[userId] = draft.lastChatAt[oldId]; delete draft.lastChatAt[oldId] }
          if (oldId in draft.lastEmoteAt) { draft.lastEmoteAt[userId] = draft.lastEmoteAt[oldId]; delete draft.lastEmoteAt[oldId] }
          if (oldId in draft.lastRoundDeltas) { draft.lastRoundDeltas[userId] = draft.lastRoundDeltas[oldId]; delete draft.lastRoundDeltas[oldId] }
          if (draft.winnerUserId === oldId) draft.winnerUserId = userId
          if (draft.summary) {
            if (draft.summary.winnerUserId === oldId) draft.summary.winnerUserId = userId
            draft.summary.standings = draft.summary.standings.map((st) => (st.userId === oldId ? { ...st, userId } : st))
          }
          return { changed: true, forceAdvance: false }
        }
      }

      // New arrival. Role: the very first joiner hosts (and plays); others are
      // contestants in the lobby with room, otherwise spectators (watch + chat +
      // audience-vote). Spectators are NOT seated in `order` so they're never
      // authors/contestant-voters and don't gate the round.
      const isFirst = !draft.hostUserId
      const full = draft.order.length >= MAX_PLAYERS
      const role: PlayerRole = isFirst ? 'host' : draft.phase !== 'LOBBY' || full ? 'spectator' : 'contestant'
      const requested = typeof data.color === 'string' ? data.color : ''
      const joinedOrder = Object.keys(draft.players).length
      draft.players[userId] = {
        userId,
        cid,
        name,
        color: pickColor(draft, requested),
        score: 0,
        joinedOrder,
        role,
      }
      if (role !== 'spectator') draft.order.push(userId)
      if (isFirst) draft.hostUserId = userId
      return { changed: true, forceAdvance: false }
    }

    case 'SET_CONFIG': {
      if (!isHost || draft.phase !== 'LOBBY') return noop()
      draft.config = clampConfig({ ...draft.config, ...(data as Partial<GameConfig>) })
      return { changed: true, forceAdvance: false }
    }

    case 'START_GAME': {
      if (!isHost) return noop()
      if (draft.phase === 'LOBBY' && draft.order.length >= MIN_PLAYERS) {
        draft.roundIndex = 0
        draft.promptCursor = 0
        enterPhase(draft, 'INTRO', ctx)
        return { changed: true, forceAdvance: false }
      }
      return noop()
    }

    case 'PLAY_AGAIN': {
      if (!isHost || draft.phase !== 'PODIUM') return noop()
      resetForNewGame(draft)
      return { changed: true, forceAdvance: false }
    }

    case 'SKIP': {
      if (!isHost) return noop()
      if (draft.phase === 'LOBBY' || draft.phase === 'PODIUM') return noop()
      return { changed: false, forceAdvance: true }
    }

    case 'SUBMIT_ANSWER': {
      if (draft.phase !== 'WRITE' && draft.phase !== 'FINAL_WRITE') return noop()
      if (draft.players[userId]?.role === 'spectator') return noop() // watchers don't write
      const matchupId = String(data.matchupId ?? '')
      const m = draft.matchups.find((x) => x.id === matchupId)
      if (!m || !m.authorIds.includes(userId)) return noop()
      const res = validateAnswer(typeof data.text === 'string' ? data.text : '')
      if (!res.ok) return noop()
      m.answers[userId] = res.text
      m.safety[userId] = false
      return { changed: true, forceAdvance: false }
    }

    case 'VOTE': {
      const matchupId = String(data.matchupId ?? '')
      const authorId = String(data.authorId ?? '')
      if (draft.phase === 'VOTE') {
        const m = draft.matchups[draft.voteIndex]
        if (!m || m.id !== matchupId) return noop()
        // Any player who isn't an author may vote — contestants AND spectators
        // (audience). Spectator votes are weighted down at scoring time.
        if (!draft.players[userId] || m.authorIds.includes(userId)) return noop()
        if (!m.authorIds.includes(authorId)) return noop()
        m.votes[userId] = [authorId] // single, replaceable
        return { changed: true, forceAdvance: false }
      }
      if (draft.phase === 'FINAL_VOTE') {
        const m = draft.matchups[0]
        if (!m || m.id !== matchupId) return noop()
        if (!m.authorIds.includes(authorId) || authorId === userId) return noop() // no self-vote
        const cast = m.votes[userId] ?? []
        if (cast.length >= draft.config.finalVotes) return noop()
        m.votes[userId] = [...cast, authorId]
        return { changed: true, forceAdvance: false }
      }
      return noop()
    }

    case 'UNVOTE': {
      if (draft.phase !== 'FINAL_VOTE') return noop()
      const m = draft.matchups[0]
      const authorId = String(data.authorId ?? '')
      if (!m) return noop()
      const cast = m.votes[userId] ?? []
      const i = cast.indexOf(authorId)
      if (i < 0) return noop()
      cast.splice(i, 1)
      m.votes[userId] = cast
      return { changed: true, forceAdvance: false }
    }

    case 'KICK': {
      // Host removes a disruptive player — lobby only (mid-game removal would
      // tangle in-flight matchups). Target by server userId (the trusted key).
      if (!isHost || draft.phase !== 'LOBBY') return noop()
      const target = String(data.targetUserId ?? '')
      if (!draft.players[target] || target === draft.hostUserId) return noop()
      delete draft.players[target]
      draft.order = draft.order.filter((id) => id !== target)
      return { changed: true, forceAdvance: false }
    }

    case 'ADD_BOT': {
      // Host seats an AI comedian so a solo/short room can play. Lobby only.
      // MAX_BOTS (spend Guard 4) is enforced HERE, engine-side — the hub DO
      // never counts seats.
      if (!isHost || draft.phase !== 'LOBBY') return noop()
      if (draft.order.length >= MAX_PLAYERS) return noop()
      if (draft.order.filter((id) => draft.players[id]?.isBot).length >= MAX_BOTS) return noop()
      const persona = assignBotPersona(draft)
      let n = 1
      while (draft.players[`bot-${n}`]) n++
      const userId = `bot-${n}`
      draft.players[userId] = {
        userId,
        cid: userId, // bots have no client; cid mirrors the id
        name: persona.name,
        color: pickColor(draft, ''),
        score: 0,
        joinedOrder: Object.keys(draft.players).length,
        role: 'contestant',
        isBot: true,
        persona: persona.id,
      }
      draft.order.push(userId)
      return { changed: true, forceAdvance: false }
    }

    case 'REMOVE_BOT': {
      // Host removes a bot (specific target, else the most-recently-added). Lobby only.
      if (!isHost || draft.phase !== 'LOBBY') return noop()
      const target = String(data.targetUserId ?? '')
      let id = target && draft.players[target]?.isBot ? target : ''
      if (!id) {
        const bots = draft.order.filter((x) => draft.players[x]?.isBot)
        id = bots[bots.length - 1] ?? ''
      }
      if (!id || !draft.players[id]?.isBot) return noop()
      delete draft.players[id]
      draft.order = draft.order.filter((x) => x !== id)
      return { changed: true, forceAdvance: false }
    }

    case 'CHAT': {
      const p = draft.players[userId]
      if (!p) return noop() // only seated players (incl. spectators) chat
      const text = cleanChat(typeof data.text === 'string' ? data.text : '')
      if (!text) return noop()
      if (ctx.now - (draft.lastChatAt[userId] ?? 0) < CHAT_MIN_INTERVAL_MS) return noop()
      draft.chat.push({ id: `${p.cid}-${ctx.now}`, cid: p.cid, name: p.name, color: p.color, text, ts: ctx.now })
      if (draft.chat.length > CHAT_RING_MAX) draft.chat.splice(0, draft.chat.length - CHAT_RING_MAX)
      draft.lastChatAt[userId] = ctx.now
      return { changed: true, forceAdvance: false }
    }

    case 'EMOTE': {
      const p = draft.players[userId]
      if (!p) return noop()
      const emoji = String(data.emoji ?? '')
      if (!(EMOTES as readonly string[]).includes(emoji)) return noop()
      if (ctx.now - (draft.lastEmoteAt[userId] ?? 0) < EMOTE_MIN_INTERVAL_MS) return noop()
      draft.emotes.push({ id: `${p.cid}-${ctx.now}`, cid: p.cid, color: p.color, emoji, ts: ctx.now })
      if (draft.emotes.length > EMOTE_RING_MAX) draft.emotes.splice(0, draft.emotes.length - EMOTE_RING_MAX)
      draft.lastEmoteAt[userId] = ctx.now
      return { changed: true, forceAdvance: false }
    }

    default:
      return noop()
  }
}

function noop() {
  return { changed: false, forceAdvance: false }
}

// ---------------------------------------------------------------------------
// Transition machine
// ---------------------------------------------------------------------------

function earlyComplete(draft: GameState): boolean {
  switch (draft.phase) {
    case 'WRITE':
    case 'FINAL_WRITE':
      return draft.matchups.length > 0 && allAnswersIn(draft.matchups)
    case 'VOTE': {
      const m = draft.matchups[draft.voteIndex]
      return !!m && allVotersVoted(m, draft.order)
    }
    case 'FINAL_VOTE': {
      const m = draft.matchups[0]
      return !!m && allFinalVotesIn(m, draft.order, draft.config.finalVotes)
    }
    default:
      return false
  }
}

function timerExpired(draft: GameState, now: number): boolean {
  return draft.phaseEndsAt != null && now >= draft.phaseEndsAt
}

/** Perform the transition out of the current phase. */
function advance(draft: GameState, ctx: WisecrackCtx): void {
  const finalRound = draft.config.totalRounds - 1
  switch (draft.phase) {
    case 'INTRO':
      enterPhase(draft, 'WRITE', ctx)
      break
    case 'WRITE':
      fillSafetyAnswers(draft)
      draft.voteIndex = 0
      enterPhase(draft, 'VOTE', ctx)
      break
    case 'VOTE':
      // reveal this matchup's result (spectator/audience votes weighted down)
      draft.results[draft.voteIndex] = scoreMatchup(draft.matchups[draft.voteIndex], draft.roundIndex, voterWeight(draft))
      enterPhase(draft, 'REVEAL', ctx)
      break
    case 'REVEAL':
      if (draft.voteIndex < draft.matchups.length - 1) {
        draft.voteIndex += 1
        enterPhase(draft, 'VOTE', ctx)
      } else {
        applyRoundScores(draft)
        enterPhase(draft, 'SCORE', ctx)
      }
      break
    case 'SCORE':
      if (draft.roundIndex < finalRound - 1) {
        draft.roundIndex += 1
        enterPhase(draft, 'INTRO', ctx)
      } else {
        draft.roundIndex = finalRound
        enterPhase(draft, 'FINAL_INTRO', ctx)
      }
      break
    case 'FINAL_INTRO':
      enterPhase(draft, 'FINAL_WRITE', ctx)
      break
    case 'FINAL_WRITE':
      fillSafetyAnswers(draft)
      enterPhase(draft, 'FINAL_VOTE', ctx)
      break
    case 'FINAL_VOTE':
      draft.results = [scoreFinal(draft.matchups[0], draft.roundIndex, voterWeight(draft))]
      applyRoundScores(draft)
      enterPhase(draft, 'FINAL_REVEAL', ctx)
      break
    case 'FINAL_REVEAL':
      enterPhase(draft, 'PODIUM', ctx)
      break
  }
}

/** Set phase + deadline, and run per-phase entry effects. */
function enterPhase(draft: GameState, phase: Phase, ctx: WisecrackCtx): void {
  draft.phase = phase
  const secs = phaseSeconds(phase, draft.config)
  draft.phaseEndsAt = secs == null ? null : ctx.now + secs * 1000

  switch (phase) {
    case 'INTRO': {
      // Assign this round's matchups (and reset the round's results buffer).
      const k = draft.config.promptsPerPlayer
      const need = Math.floor((draft.order.length * k) / 2)
      const ids = drawPromptIds(draft, ctx, need)
      const rng = mulberry32(draft.seed + draft.roundIndex * 7919 + 1)
      const assignments = assignPrompts(draft.order, ids, k, rng)
      draft.matchups = assignments.map((a, i) => ({
        id: `r${draft.roundIndex}m${i}`,
        promptId: a.promptId,
        promptText: draft.promptText[a.promptId] ?? '',
        authorIds: a.authorIds,
        answers: {},
        safety: {},
        votes: {},
      }))
      draft.results = []
      draft.voteIndex = 0
      break
    }
    case 'FINAL_INTRO': {
      const [id] = drawPromptIds(draft, ctx, 1)
      draft.matchups = [
        {
          id: `final`,
          promptId: id,
          promptText: draft.promptText[id] ?? '',
          authorIds: [...draft.order],
          answers: {},
          safety: {},
          votes: {},
        },
      ]
      draft.results = []
      draft.voteIndex = 0
      break
    }
    case 'PODIUM':
      finishGame(draft, ctx)
      break
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The active prompt pool: ctx.content filtered by the spicy toggle. Content is
 * the full pack list in stable (id-sorted) order, so the filtered pool's order
 * is stable too — shuffle(pool, seed) reproduces the same deck every draw.
 */
function activePool(draft: GameState, ctx: WisecrackCtx): Prompt[] {
  return ctx.content.filter((p) => draft.config.allowSpicy || p.safety === 'clean')
}

/** Deterministically draw the next `count` prompt ids from shuffle(activePool, seed). */
function drawPromptIds(draft: GameState, ctx: WisecrackCtx, count: number): string[] {
  const deck = shuffle(activePool(draft, ctx), mulberry32(draft.seed))
  const slice = deck.slice(draft.promptCursor, draft.promptCursor + count)
  if (slice.length < count) {
    throw new Error(`drawPromptIds: prompt pool exhausted (need ${count}, have ${slice.length})`)
  }
  for (const p of slice) draft.promptText[p.id] = p.text
  draft.promptCursor += count
  return slice.map((p) => p.id)
}

/** Fill any missing author answers with a safety quip so a matchup always has options. */
function fillSafetyAnswers(draft: GameState): void {
  if (draft.phase !== 'WRITE' && draft.phase !== 'FINAL_WRITE') return
  for (const m of draft.matchups) {
    for (const a of m.authorIds) {
      if (!m.answers[a] || m.answers[a].trim().length === 0) {
        m.answers[a] = SAFETY_QUIP
        m.safety[a] = true
      }
    }
  }
}

function applyRoundScores(draft: GameState): void {
  const deltas: Record<string, number> = {}
  for (const res of draft.results) {
    for (const [uid, pts] of Object.entries(res.deltas)) {
      deltas[uid] = (deltas[uid] ?? 0) + pts
      if (draft.players[uid]) draft.players[uid].score += pts
    }
    // Track the most-voted matchup of the whole night (resolved now, while these
    // author ids are still current).
    const bestVotes = draft.bestMatchup
      ? draft.bestMatchup.answers.reduce((n, a) => n + a.votes, 0)
      : -1
    if (res.totalVotes > bestVotes) draft.bestMatchup = topMatchupEntry(draft, res)
  }
  draft.lastRoundDeltas = deltas
}

/** Resolve a matchup result into the recap's "bit of the night" shape. */
function topMatchupEntry(draft: GameState, res: MatchupResult): GameSummary['topMatchup'] {
  return {
    promptText: res.promptText,
    answers: res.authorIds.map((a) => ({
      name: draft.players[a]?.name ?? '?',
      color: draft.players[a]?.color ?? '#fff',
      text: res.answers[a] ?? '',
      votes: res.voteCounts[a] ?? 0,
    })),
  }
}

function finishGame(draft: GameState, ctx: WisecrackCtx): void {
  const standings = draft.order
    .map((uid) => draft.players[uid])
    .filter(Boolean)
    .map((p) => ({ userId: p.userId, name: p.name, color: p.color, score: p.score }))
    .sort((a, b) => b.score - a.score)
  draft.winnerUserId = standings.length > 0 ? standings[0].userId : null

  draft.summary = {
    winnerUserId: draft.winnerUserId,
    finishedAtTick: ctx.now,
    standings,
    // "Bit of the night" accumulated across all rounds (see applyRoundScores).
    topMatchup: draft.bestMatchup,
  }
}

function resetForNewGame(draft: GameState): void {
  for (const uid of Object.keys(draft.players)) draft.players[uid].score = 0
  // Promote spectators who stuck around to contestants for the next game, in join
  // order — but never past the seat cap (extras stay spectators).
  const waiting = Object.values(draft.players)
    .filter((p) => p.role === 'spectator' && !draft.order.includes(p.userId))
    .sort((a, b) => a.joinedOrder - b.joinedOrder)
  for (const p of waiting) {
    if (draft.order.length >= MAX_PLAYERS) break
    p.role = 'contestant'
    draft.order.push(p.userId)
  }
  draft.phase = 'LOBBY'
  draft.roundIndex = 0
  draft.promptCursor = 0
  draft.promptText = {}
  draft.matchups = []
  draft.results = []
  draft.voteIndex = 0
  draft.lastRoundDeltas = {}
  draft.phaseEndsAt = null
  draft.winnerUserId = null
  draft.bestMatchup = null
  draft.summary = null
  // NOTE: recapId / registryId are DO-managed (spine contract) — never reset
  // here. The hub clears recapId itself when the room returns to LOBBY.
}

/** Vote weight by voter role — spectators (audience) count for less. */
function voterWeight(draft: GameState): (voterId: string) => number {
  return (voterId: string) => (draft.players[voterId]?.role === 'spectator' ? AUDIENCE_WEIGHT : 1)
}

/** Pick a persona for a new bot: a seed-shuffled order, first not already in use (then wraps). */
function assignBotPersona(draft: GameState): Persona {
  const used = new Set(
    Object.values(draft.players)
      .filter((p) => p.isBot && p.persona)
      .map((p) => p.persona),
  )
  const order = shuffle(PERSONAS, mulberry32(draft.seed + 104729))
  return order.find((p) => !used.has(p.id)) ?? order[used.size % order.length]
}

/** Pick a roster color: the requested one if free, else the next free, else by seat. */
function pickColor(draft: GameState, requested: string, exceptUserId?: string): string {
  const used = new Set(
    Object.values(draft.players)
      .filter((p) => p.userId !== exceptUserId)
      .map((p) => p.color),
  )
  if (requested && (PLAYER_COLORS as readonly string[]).includes(requested) && !used.has(requested)) {
    return requested
  }
  const free = PLAYER_COLORS.find((c) => !used.has(c))
  return free ?? colorForSeat(Object.keys(draft.players).length)
}

function sanitizeName(raw: string, seat: number): string {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 16)
  return name.length > 0 ? name : `Player ${seat + 1}`
}

function clampConfig(c: GameConfig): GameConfig {
  const clamp = (n: number, lo: number, hi: number, d: number) =>
    Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d
  return {
    totalRounds: clamp(c.totalRounds, 2, 5, DEFAULT_CONFIG.totalRounds),
    promptsPerPlayer: clamp(c.promptsPerPlayer, 1, 2, DEFAULT_CONFIG.promptsPerPlayer),
    introSeconds: clamp(c.introSeconds, 1, 15, DEFAULT_CONFIG.introSeconds),
    writeSeconds: clamp(c.writeSeconds, 15, 180, DEFAULT_CONFIG.writeSeconds),
    voteSeconds: clamp(c.voteSeconds, 5, 90, DEFAULT_CONFIG.voteSeconds),
    revealSeconds: clamp(c.revealSeconds, 2, 20, DEFAULT_CONFIG.revealSeconds),
    scoreSeconds: clamp(c.scoreSeconds, 2, 20, DEFAULT_CONFIG.scoreSeconds),
    finalVotes: clamp(c.finalVotes, 1, 5, DEFAULT_CONFIG.finalVotes),
    allowSpicy: Boolean(c.allowSpicy),
    isPublic: Boolean(c.isPublic),
  }
}
