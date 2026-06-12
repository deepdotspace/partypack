/**
 * engine.reduce — the pure orchestrator the hub DO runs each tick.
 *
 *   reduce(state, inputs, ctx) -> nextState | undefined   (undefined = no change)
 *
 * It applies buffered inputs (with host-authority + role checks), then advances
 * the phase machine on early-completion predicates, host SKIP, or timer expiry.
 * `ctx` is the spine's ReduceCtx: `now` is injected epoch-ms, `connected` is
 * the live socket roster, and `content` is the FULL brief pool — the round's
 * brief is drawn in here with the original Pitch's seeded pick + used-brief
 * dedupe. No React / no SDK imports.
 *
 * The lobby / identity / host / spectator / chat layers are byte-similar to
 * wisecrack's engine (the spine skeleton); the round machine (INTRO → PROMPT →
 * WRITE → VOTE → REVEAL → SCORE) is the original Pitch's, transplanted onto it.
 * Deliberate delta: the host PLAYS (first joiner, invents + votes — no
 * CLAIM_HOST MC), and spectators chat/emote but never vote.
 *
 * Spine contract: the DO writes `recapId` / `registryId` onto the state; this
 * reducer is clone-based (structuredClone of prev), so those fields are carried
 * through unchanged on every returned state.
 */
import { cleanChat } from './chat'
import { colorForSeat, PLAYER_COLORS } from '../../shared/colors'
import type { ReduceCtx } from '../spine'
import { BOT_PERSONAS, type BotPersona } from './bots'
import { allInventionsIn, allVotesIn, phaseMs } from './phases'
import { roundMultiplier, scoreRound } from './scoring'
import { buildInventionOptions } from './shuffle'
import { makeRng, seededShuffle } from './text'
import { validateInvention } from './validation'
import {
  CHAT_MIN_INTERVAL_MS,
  CHAT_RING_MAX,
  DEFAULT_CONFIG,
  EMOTE_MIN_INTERVAL_MS,
  EMOTE_RING_MAX,
  EMOTES,
  MAX_BOTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Brief,
  type GameConfig,
  type GameState,
  type Phase,
  type PlayerRole,
  type RawInput,
} from './types'

/** The pitch reduce context: spine ctx with the full brief pool as content. */
export type PitchCtx = ReduceCtx<Brief[]>

export function initialState(seed: number, configOverride: Partial<GameConfig> = {}): GameState {
  return {
    game: 'pitch',
    phase: 'LOBBY',
    hostUserId: null,
    config: { ...DEFAULT_CONFIG, ...configOverride },
    seed: seed >>> 0,
    roomCode: '',
    players: {},
    order: [],
    roundIndex: 0,
    brief: null,
    usedBriefIds: [],
    inventions: {},
    options: [],
    votes: {},
    result: null,
    phaseEndsAt: null,
    winnerUserId: null,
    bestInvention: null,
    summary: null,
    registryId: null,
    chat: [],
    emotes: [],
    lastChatAt: {},
    lastEmoteAt: {},
  }
}

export function reduce(prev: GameState, inputs: RawInput[], ctx: PitchCtx): GameState | undefined {
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
  ctx: PitchCtx,
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
      // every reference (order, host, in-flight round data, rate-limit maps) from
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
          if (oldId in draft.inventions) { draft.inventions[userId] = draft.inventions[oldId]; delete draft.inventions[oldId] }
          for (const o of draft.options) if (o.userId === oldId) o.userId = userId
          if (oldId in draft.votes) { draft.votes[userId] = draft.votes[oldId]; delete draft.votes[oldId] }
          if (draft.result) {
            const res = draft.result
            if (oldId in res.deltas) { res.deltas[userId] = res.deltas[oldId]; delete res.deltas[oldId] }
            for (const oid of Object.keys(res.votesByOption)) {
              res.votesByOption[oid] = res.votesByOption[oid].map((v) => (v === oldId ? userId : v))
            }
            if (res.roundWinnerUserId === oldId) res.roundWinnerUserId = userId
          }
          if (oldId in draft.lastChatAt) { draft.lastChatAt[userId] = draft.lastChatAt[oldId]; delete draft.lastChatAt[oldId] }
          if (oldId in draft.lastEmoteAt) { draft.lastEmoteAt[userId] = draft.lastEmoteAt[oldId]; delete draft.lastEmoteAt[oldId] }
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
      // emote — Pitch spectators do NOT vote). Spectators are NOT seated in
      // `order` so they're never authors/voters and don't gate the round.
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
        for (const uid of Object.keys(draft.players)) draft.players[uid].score = 0
        draft.roundIndex = 0
        draft.usedBriefIds = []
        draft.bestInvention = null
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

    case 'SUBMIT': {
      // Submit (or replace) an invention. Host included — the host plays.
      if (draft.phase !== 'WRITE') return noop()
      const p = draft.players[userId]
      if (!p || p.role === 'spectator') return noop() // watchers don't invent
      const rawName = typeof data.name === 'string' ? data.name : ''
      const rawPitch = typeof data.pitch === 'string' ? data.pitch : ''
      const invention = validateInvention(rawName, rawPitch)
      // Store only when BOTH name and pitch are non-empty — an invalid bot
      // submission is rejected here exactly like a human one, so the hub's
      // needsGeneration re-lists the bot for another roll.
      if (!invention) return noop()
      draft.inventions[userId] = invention
      return { changed: true, forceAdvance: false }
    }

    case 'VOTE': {
      if (draft.phase !== 'VOTE') return noop()
      const p = draft.players[userId]
      // Spectators do NOT vote in Pitch (documented decision — scoring stays
      // clean; wisecrack's weighted audience vote stays wisecrack-only).
      if (!p || p.role === 'spectator') return noop()
      const optionId = String(data.optionId ?? '')
      const option = draft.options.find((o) => o.id === optionId)
      // Can't vote for your own invention.
      if (!option || option.userId === userId) return noop()
      if (draft.votes[userId] === optionId) return noop()
      draft.votes[userId] = optionId // single, replaceable until the reveal
      return { changed: true, forceAdvance: false }
    }

    case 'KICK': {
      // Host removes a disruptive player — lobby only (mid-game removal would
      // tangle the in-flight round). Target by server userId (the trusted key).
      if (!isHost || draft.phase !== 'LOBBY') return noop()
      const target = String(data.targetUserId ?? '')
      if (!draft.players[target] || target === draft.hostUserId) return noop()
      delete draft.players[target]
      draft.order = draft.order.filter((id) => id !== target)
      return { changed: true, forceAdvance: false }
    }

    case 'ADD_BOT': {
      // Host seats an AI inventor so a solo/short room can play. Lobby only.
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
// Transition machine (the original Pitch's round loop)
// ---------------------------------------------------------------------------

function earlyComplete(draft: GameState): boolean {
  switch (draft.phase) {
    case 'WRITE':
      return allInventionsIn(draft)
    case 'VOTE':
      return allVotesIn(draft)
    default:
      return false
  }
}

function timerExpired(draft: GameState, now: number): boolean {
  return draft.phaseEndsAt != null && now >= draft.phaseEndsAt
}

/** Perform the transition out of the current phase. */
function advance(draft: GameState, ctx: PitchCtx): void {
  switch (draft.phase) {
    case 'INTRO':
      startRound(draft, ctx)
      break
    case 'PROMPT':
      enterPhase(draft, 'WRITE', ctx)
      break
    case 'WRITE':
      enterVote(draft, ctx)
      break
    case 'VOTE':
      enterReveal(draft, ctx)
      break
    case 'REVEAL':
      enterPhase(draft, 'SCORE', ctx)
      break
    case 'SCORE':
      if (draft.roundIndex + 1 < draft.config.totalRounds) {
        draft.roundIndex += 1
        enterPhase(draft, 'INTRO', ctx)
      } else {
        enterPhase(draft, 'PODIUM', ctx)
      }
      break
  }
}

/** Set phase + deadline, and run per-phase entry effects. */
function enterPhase(draft: GameState, phase: Phase, ctx: PitchCtx): void {
  draft.phase = phase
  const ms = phaseMs(phase, draft.config)
  draft.phaseEndsAt = ms == null ? null : ctx.now + ms

  if (phase === 'PODIUM') finishGame(draft, ctx)
}

/** Clear the per-round buffers, draw this round's brief, and reveal it. */
function startRound(draft: GameState, ctx: PitchCtx): void {
  clearRound(draft)
  draft.brief = pickBrief(draft, ctx.content)
  if (draft.brief) draft.usedBriefIds.push(draft.brief.id)
  enterPhase(draft, 'PROMPT', ctx)
}

function clearRound(draft: GameState): void {
  draft.inventions = {}
  draft.options = []
  draft.votes = {}
  draft.result = null
}

/**
 * Deterministic seeded brief pick with per-game dedupe (the original Pitch's
 * mechanism): draw from the briefs not yet used this game; when the pool is
 * exhausted, reset the dedupe and draw from the full pool again.
 */
function pickBrief(draft: GameState, pool: Brief[]): Brief | null {
  if (pool.length === 0) return null
  let unused = pool.filter((b) => !draft.usedBriefIds.includes(b.id))
  if (unused.length === 0) {
    draft.usedBriefIds = []
    unused = pool
  }
  const rng = makeRng((draft.seed ^ (draft.roundIndex * 0x9e3779b1)) >>> 0)
  return unused[Math.floor(rng() * unused.length)]
}

function enterVote(draft: GameState, ctx: PitchCtx): void {
  if (draft.brief) {
    draft.options = buildInventionOptions(draft.inventions, `${draft.brief.id}:${draft.roundIndex}:${draft.seed}`)
  }
  draft.votes = {}
  enterPhase(draft, 'VOTE', ctx)
}

function enterReveal(draft: GameState, ctx: PitchCtx): void {
  const mult = roundMultiplier(draft.roundIndex, draft.config.totalRounds)
  draft.result = scoreRound(draft.options, draft.votes, mult)
  for (const [userId, delta] of Object.entries(draft.result.deltas)) {
    const p = draft.players[userId]
    if (p) p.score += delta
  }
  recordBestInvention(draft)
  enterPhase(draft, 'REVEAL', ctx)
}

/** Track the most-voted invention of the whole night (resolved now, while the
 *  author's name/color are current) — the recap's showcase. */
function recordBestInvention(draft: GameState): void {
  const res = draft.result
  if (!res || !res.roundWinnerUserId) return
  const option = draft.options.find((o) => o.userId === res.roundWinnerUserId)
  if (!option) return
  const votes = res.votesByOption[option.id]?.length ?? 0
  if (votes <= (draft.bestInvention?.votes ?? 0)) return
  const author = draft.players[option.userId]
  draft.bestInvention = {
    name: option.name,
    pitch: option.pitch,
    byName: author?.name ?? '?',
    byColor: author?.color ?? '#fff',
    votes,
    briefPrompt: draft.brief?.prompt ?? '',
  }
}

function finishGame(draft: GameState, ctx: PitchCtx): void {
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
    // "Invention of the night" accumulated across all rounds (see recordBestInvention).
    topInvention: draft.bestInvention,
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
  draft.brief = null
  draft.usedBriefIds = []
  clearRound(draft)
  draft.phaseEndsAt = null
  draft.winnerUserId = null
  draft.bestInvention = null
  draft.summary = null
  // NOTE: recapId / registryId are DO-managed (spine contract) — never reset
  // here. The hub clears recapId itself when the room returns to LOBBY.
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a persona for a new bot: a seed-shuffled order, first not already in use (then wraps). */
function assignBotPersona(draft: GameState): BotPersona {
  const used = new Set(
    Object.values(draft.players)
      .filter((p) => p.isBot && p.persona)
      .map((p) => p.persona),
  )
  const order = seededShuffle(BOT_PERSONAS, (draft.seed + 104729) >>> 0)
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
    totalRounds: clamp(c.totalRounds, 1, 5, DEFAULT_CONFIG.totalRounds), // the original Pitch's host range
    introMs: clamp(c.introMs, 1000, 15000, DEFAULT_CONFIG.introMs),
    promptMs: clamp(c.promptMs, 1000, 15000, DEFAULT_CONFIG.promptMs),
    writeMs: clamp(c.writeMs, 15000, 180000, DEFAULT_CONFIG.writeMs),
    voteMs: clamp(c.voteMs, 5000, 90000, DEFAULT_CONFIG.voteMs),
    revealMs: clamp(c.revealMs, 2000, 20000, DEFAULT_CONFIG.revealMs),
    scoreMs: clamp(c.scoreMs, 2000, 20000, DEFAULT_CONFIG.scoreMs),
    isPublic: Boolean(c.isPublic),
  }
}
