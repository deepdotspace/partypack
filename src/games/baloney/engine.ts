/**
 * engine.reduce — the pure orchestrator the hub DO runs each tick.
 *
 *   reduce(state, inputs, ctx) -> nextState | undefined   (undefined = no change)
 *
 * It applies buffered inputs (with host-authority + role checks), then advances
 * the phase machine on early-completion predicates, host SKIP, or timer expiry.
 * `ctx` is the spine's ReduceCtx: `now` is injected epoch-ms, `connected` is
 * the live socket roster, and `content` is the full QUESTION_POOL (the round's
 * question is drawn from it deterministically with used-question dedupe). No
 * React / no SDK imports.
 *
 * The lobby/identity/host/spectator/chat layers are the wisecrack skeleton
 * (JOIN seats players, cid rebinding in any phase, host = first joiner with
 * auto-handoff, spectators watch + chat); the round logic (validation, board
 * build, scoring, question picks) is the original baloney's, transplanted
 * verbatim from its src/game modules. Host PLAYS here (deliberate delta from
 * the original's non-contestant MC) and spectators do NOT vote — see types.ts.
 *
 * Spine contract: the DO writes `recapId` / `registryId` onto the state; this
 * reducer is clone-based (structuredClone of prev), so those fields are carried
 * through unchanged on every returned state.
 */
import { cleanChat } from './chat'
import { colorForSeat, PLAYER_COLORS } from '../../shared/colors'
import type { ReduceCtx } from '../spine'
import { BOT_PERSONAS, type BotPersona } from './personas'
import { allLiesIn, allVotesIn, chatAllowed, phaseMs } from './phases'
import { roundMultiplier, scoreRound } from './scoring'
import { buildAnswerOptions } from './shuffle'
import { makeRng, seededShuffle } from './text'
import { validateLie } from './validation'
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
  type GameConfig,
  type GameState,
  type Phase,
  type PlayerRole,
  type Question,
  type RawInput,
} from './types'

/** The baloney reduce context: spine ctx with the full question pool as content. */
export type BaloneyCtx = ReduceCtx<Question[]>

export function initialState(seed: number, configOverride: Partial<GameConfig> = {}): GameState {
  return {
    game: 'baloney',
    phase: 'LOBBY',
    hostUserId: null,
    config: { ...DEFAULT_CONFIG, ...configOverride },
    seed: seed >>> 0,
    roomCode: '',
    players: {},
    order: [],
    roundIndex: 0,
    question: null,
    usedQuestionIds: [],
    lies: {},
    rejections: {},
    options: [],
    votes: {},
    result: null,
    bestLie: null,
    phaseEndsAt: null,
    winnerUserId: null,
    summary: null,
    registryId: null,
    chat: [],
    emotes: [],
    lastChatAt: {},
    lastEmoteAt: {},
  }
}

export function reduce(prev: GameState, inputs: RawInput[], ctx: BaloneyCtx): GameState | undefined {
  const draft: GameState = structuredClone(prev)
  let changed = false
  let forceAdvance = false

  for (const input of inputs) {
    const r = applyInput(draft, input, ctx)
    changed = changed || r.changed
    forceAdvance = forceAdvance || r.forceAdvance
  }

  // Host authority. RECLAIM first: if the original host is back and connected
  // (a brief disconnect handed the bit to a friend), give it back — so a host
  // whose phone backgrounded for a moment doesn't permanently lose START /
  // SKIP / PLAY_AGAIN. Otherwise HAND OFF: if the current host is gone, pass
  // the bit to the first still-connected seat so the room never strands.
  const reclaimId = draft.originalHostCid
    ? draft.order.find(
        (id) => draft.players[id]?.cid === draft.originalHostCid && ctx.connected.includes(id),
      )
    : undefined
  if (reclaimId && reclaimId !== draft.hostUserId) {
    const prev = draft.hostUserId ? draft.players[draft.hostUserId] : undefined
    if (prev) prev.role = 'contestant'
    draft.hostUserId = reclaimId
    draft.players[reclaimId].role = 'host'
    changed = true
  } else if (draft.hostUserId && !ctx.connected.includes(draft.hostUserId)) {
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
  ctx: BaloneyCtx,
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
      // every reference (order, host, in-flight round maps, rate-limit maps) from
      // the old id so the returning player keeps their seat, score, and authorship.
      if (cid) {
        // A same-cid JOIN from a new connection id IS a reconnect: only that
        // device persists the cid in localStorage. Rebind its seat even if the
        // old socket still shows connected — a backgrounded phone's old socket
        // lingers half-open (its close fires late), and requiring the old id to
        // be absent stranded the returning player as a ghost spectator whose
        // taps were silently rejected. We keep only the isBot guard (bots hold
        // no sockets; without it a crafted JOIN could seize a bot seat). cids
        // are already broadcast in state, so the old "must be disconnected"
        // check never provided real protection (an attacker could grab a cid
        // and time any blip) — reconnect reliability matters more.
        const oldId = Object.keys(draft.players).find(
          (id) => id !== userId && draft.players[id]?.cid === cid && !draft.players[id]?.isBot,
        )
        if (oldId) {
          const p = draft.players[oldId]
          delete draft.players[oldId]
          p.userId = userId
          if (name) p.name = name
          draft.players[userId] = p
          draft.order = draft.order.map((id) => (id === oldId ? userId : id))
          if (draft.hostUserId === oldId) draft.hostUserId = userId
          if (oldId in draft.lies) { draft.lies[userId] = draft.lies[oldId]; delete draft.lies[oldId] }
          if (oldId in draft.rejections) { draft.rejections[userId] = draft.rejections[oldId]; delete draft.rejections[oldId] }
          if (oldId in draft.votes) { draft.votes[userId] = draft.votes[oldId]; delete draft.votes[oldId] }
          for (const o of draft.options) o.authorIds = o.authorIds.map((a) => (a === oldId ? userId : a))
          if (draft.result) {
            if (oldId in draft.result.deltas) { draft.result.deltas[userId] = draft.result.deltas[oldId]; delete draft.result.deltas[oldId] }
            for (const oid of Object.keys(draft.result.votesByOption)) {
              draft.result.votesByOption[oid] = draft.result.votesByOption[oid].map((v) => (v === oldId ? userId : v))
            }
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
      // contestants in the lobby with room, otherwise spectators (watch + chat,
      // NO vote — see types.ts). Spectators are NOT seated in `order` so they
      // never write/vote and don't gate the round.
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
      if (isFirst) {
        draft.hostUserId = userId
        if (cid) draft.originalHostCid = cid // remembered so the host can reclaim after a blip
      }
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
        startGame(draft, ctx)
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

    case 'SUBMIT_LIE': {
      // The host plays too — only spectators (and unseated ids) are rejected.
      if (draft.phase !== 'WRITE' || !draft.question) return noop()
      const p = draft.players[userId]
      if (!p || p.role === 'spectator' || !draft.order.includes(userId)) return noop()
      const text = typeof data.text === 'string' ? data.text : ''
      // The original baloney's Lie Detector, verbatim: empty / >90 chars /
      // matches truth or acceptable / forbidden list / own duplicate. Bots go
      // through this same gate — a rejected bot lie stays unanswered, which
      // re-lists the bot in needsGeneration (the hub's re-roll loop).
      const rejection = validateLie(text, draft.question, draft.lies[userId])
      if (rejection) {
        draft.rejections[userId] = rejection
      } else {
        draft.lies[userId] = text.trim()
        delete draft.rejections[userId]
      }
      return { changed: true, forceAdvance: false }
    }

    case 'VOTE': {
      // Seated players only — spectators do NOT vote in baloney (their votes
      // would mint fool-points and skew the truth/fool balance; wisecrack's
      // weighted audience vote stays wisecrack-only).
      if (draft.phase !== 'VOTE') return noop()
      const p = draft.players[userId]
      if (!p || p.role === 'spectator' || !draft.order.includes(userId)) return noop()
      const optionId = typeof data.optionId === 'string' ? data.optionId : ''
      const option = draft.options.find((o) => o.id === optionId)
      // Can't vote for your own lie. Vote is single + replaceable (original rule).
      if (!option || option.authorIds.includes(userId)) return noop()
      if (draft.votes[userId] === optionId) return noop()
      draft.votes[userId] = optionId
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
      // Host seats an AI liar so a solo/short room can play. Lobby only.
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
      // Baloney extra (anti-collusion, from the original): chat is OFF during
      // WRITE/VOTE so nobody can flag their own lie or torpedo someone else's.
      if (!chatAllowed(draft.phase)) return noop()
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
      return allLiesIn(draft.lies, draft.order)
    case 'VOTE':
      return allVotesIn(draft.votes, draft.order)
    default:
      return false
  }
}

function timerExpired(draft: GameState, now: number): boolean {
  return draft.phaseEndsAt != null && now >= draft.phaseEndsAt
}

/** Perform the transition out of the current phase. */
function advance(draft: GameState, ctx: BaloneyCtx): void {
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
function enterPhase(draft: GameState, phase: Phase, ctx: BaloneyCtx): void {
  draft.phase = phase
  const ms = phaseMs(phase, draft.config)
  draft.phaseEndsAt = ms == null ? null : ctx.now + ms
  if (phase === 'PODIUM') finishGame(draft, ctx)
}

function startGame(draft: GameState, ctx: BaloneyCtx): void {
  for (const id of draft.order) draft.players[id].score = 0
  draft.roundIndex = 0
  draft.usedQuestionIds = []
  draft.winnerUserId = null
  draft.bestLie = null
  draft.summary = null
  clearRound(draft)
  enterPhase(draft, 'INTRO', ctx)
}

function clearRound(draft: GameState): void {
  draft.lies = {}
  draft.rejections = {}
  draft.options = []
  draft.votes = {}
  draft.result = null
}

function startRound(draft: GameState, ctx: BaloneyCtx): void {
  clearRound(draft)
  draft.question = pickQuestion(draft, ctx.content)
  if (draft.question) draft.usedQuestionIds.push(draft.question.id)
  enterPhase(draft, 'PROMPT', ctx)
}

/**
 * Deterministic seeded pick with used-question dedupe — the original baloney's
 * mechanism verbatim: filter the pool by usedQuestionIds (resetting when it
 * runs dry), then index with a per-round rng seeded from (seed ^ round).
 */
function pickQuestion(draft: GameState, pool: Question[]): Question | null {
  if (pool.length === 0) return null
  let unused = pool.filter((q) => !draft.usedQuestionIds.includes(q.id))
  if (unused.length === 0) {
    draft.usedQuestionIds = []
    unused = pool
  }
  const rng = makeRng((draft.seed ^ (draft.roundIndex * 0x9e3779b1)) >>> 0)
  return unused[Math.floor(rng() * unused.length)]
}

function enterVote(draft: GameState, ctx: BaloneyCtx): void {
  if (draft.question) {
    draft.options = buildAnswerOptions(draft.question, draft.lies, `${draft.question.id}:${draft.roundIndex}:${draft.seed}`)
  }
  draft.votes = {}
  enterPhase(draft, 'VOTE', ctx)
}

function enterReveal(draft: GameState, ctx: BaloneyCtx): void {
  const mult = roundMultiplier(draft.roundIndex, draft.config.totalRounds)
  draft.result = scoreRound(draft.options, draft.votes, mult)
  for (const [userId, delta] of Object.entries(draft.result.deltas)) {
    const p = draft.players[userId]
    if (p) p.score += delta
  }
  // Track the most-fooling lie of the whole night (resolved now, while the
  // author ids are still current — names/colors survive PLAY_AGAIN churn).
  const bestId = draft.result.bestLieOptionId
  if (bestId) {
    const option = draft.options.find((o) => o.id === bestId)
    const fooled = draft.result.votesByOption[bestId]?.length ?? 0
    if (option && fooled > (draft.bestLie?.fooled ?? 0)) {
      draft.bestLie = {
        prompt: draft.question?.prompt ?? '',
        text: option.text,
        authors: option.authorIds.map((a) => ({
          name: draft.players[a]?.name ?? '?',
          color: draft.players[a]?.color ?? '#fff',
        })),
        fooled,
      }
    }
  }
  enterPhase(draft, 'REVEAL', ctx)
}

function finishGame(draft: GameState, ctx: BaloneyCtx): void {
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
    // "Best baloney" accumulated across all rounds (see enterReveal).
    bestLie: draft.bestLie,
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
  draft.question = null
  draft.usedQuestionIds = []
  clearRound(draft)
  draft.phaseEndsAt = null
  draft.winnerUserId = null
  draft.bestLie = null
  draft.summary = null
  // NOTE: recapId / registryId are DO-managed (spine contract) — never reset
  // here. The hub clears recapId itself when the room returns to LOBBY.
}

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
    totalRounds: clamp(c.totalRounds, 1, 5, DEFAULT_CONFIG.totalRounds),
    // Phase timings ship as constants (the original exposed no UI for them);
    // clamped here anyway so a crafted SET_CONFIG can't freeze a phase.
    introMs: clamp(c.introMs, 1000, 15000, DEFAULT_CONFIG.introMs),
    promptMs: clamp(c.promptMs, 1000, 15000, DEFAULT_CONFIG.promptMs),
    writeMs: clamp(c.writeMs, 15000, 180000, DEFAULT_CONFIG.writeMs),
    voteMs: clamp(c.voteMs, 5000, 90000, DEFAULT_CONFIG.voteMs),
    revealMs: clamp(c.revealMs, 2000, 30000, DEFAULT_CONFIG.revealMs),
    scoreMs: clamp(c.scoreMs, 2000, 20000, DEFAULT_CONFIG.scoreMs),
    isPublic: Boolean(c.isPublic),
  }
}
