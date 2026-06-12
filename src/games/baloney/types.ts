/**
 * Baloney engine types — the authoritative shared shapes for the baloney game
 * module (Fibbage-style trivia bluffing). Ported from the standalone baloney
 * app; GameState now extends the hub spine (`game: 'baloney'` + DO-managed
 * recapId/registryId fields) and the lobby/identity/host/spectator layers
 * follow the wisecrack skeleton.
 *
 * `src/games/baloney/*` is PURE: no React, no `deepspace` imports. The hub
 * DO (`AppGameRoom`) reduces over these and mirrors the result to clients.
 *
 * Identity model (deliberate deltas from the original baloney, locked at port
 * time):
 *  - The original had a non-contestant MC (the Stage) claiming host via
 *    CLAIM_HOST. Here the host model is wisecrack's: `hostUserId` = the FIRST
 *    player to JOIN, and the host is a full contestant (writes a lie, votes).
 *    There is no CLAIM_HOST; the Stage is a pure display and never JOINs.
 *  - Spectators (mid-game / overflow joiners) watch + chat + emote but do NOT
 *    vote: a spectator vote would mint fool-points out of thin air for lie
 *    authors and skew truth-points balance. (Wisecrack's 0.5-weight audience
 *    vote stays a wisecrack-only mechanic.)
 *  - ≥2 seated players required to start (host included). That yields the same
 *    minimum answer board as the original's MIN_CONTESTANTS=2 with a
 *    non-playing host: 1 truth + up to 2 lies.
 */

import type { HubGameState } from '../spine'
import type { ChatMsg, Emote } from '../../shared/types'

// Wire shapes + chat/emote limits live on the shared spine — re-exported here
// so engine internals and ported tests keep importing from './types'.
export type { RawInput } from '../spine'
export type { ChatMsg, Emote } from '../../shared/types'
export {
  CHAT_MAX_LEN,
  CHAT_MIN_INTERVAL_MS,
  CHAT_RING_MAX,
  EMOTE_MIN_INTERVAL_MS,
  EMOTE_RING_MAX,
  EMOTES,
} from '../../shared/types'

export type Phase =
  | 'LOBBY' // waiting for players; host can begin
  | 'INTRO' // "Round N" splash
  | 'PROMPT' // the question is read out
  | 'WRITE' // players invent their lie
  | 'VOTE' // players pick the answer they think is true
  | 'REVEAL' // the marquee moment — who fooled whom, then the truth
  | 'SCORE' // leaderboard re-rank
  | 'PODIUM' // winner + best baloney; host can play again

export interface Question {
  id: string
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  /** The prompt text; contains a visible blank "___". */
  prompt: string
  /** The truth. */
  answer: string
  /** Truth variants — also used to reject a player lie that accidentally matches the truth. */
  acceptableAnswers: string[]
  /** Too-obvious / joke answers to reject at submit time (Fibbage's guard). */
  forbiddenAnswers: string[]
  source?: string
}

export interface GameConfig {
  totalRounds: number // host-set, 1-5 (default 3)
  introMs: number
  promptMs: number
  writeMs: number
  voteMs: number
  revealMs: number
  scoreMs: number
  isPublic: boolean // default false; when true the open lobby is listed for matchmaking
}

/** host = first joiner (plays + runs the room); contestant = plays; spectator = watches + chats only (no vote). */
export type PlayerRole = 'host' | 'contestant' | 'spectator'

export interface PlayerState {
  userId: string // server-stamped connection id (anon-<uuid> for anonymous play) — the trusted key
  cid: string // client-minted localStorage id, so a client recognizes itself in the broadcast
  name: string
  color: string // from the fixed roster — player's chosen profile color, else next free
  score: number
  joinedOrder: number
  role: PlayerRole
  isBot?: boolean // an AI "liar" filling a seat so solo players can play
  persona?: string // persona id (see ./personas.ts) — only set when isBot
}

export interface AnswerOption {
  /** Stable within a round (canonical order pre-shuffle). */
  id: string
  text: string
  isTruth: boolean
  /** Empty for the truth; >1 entry when identical lies were merged (a "jinx"). */
  authorIds: string[]
}

/** Why a submitted lie was rejected. */
export type LieRejection = 'EMPTY' | 'TOO_LONG' | 'TRUTH' | 'FORBIDDEN' | 'DUPLICATE_OWN'

export interface RoundResult {
  /** Per-player score change for this round. */
  deltas: Record<string, number>
  /** optionId -> userIds who voted for it. */
  votesByOption: Record<string, string[]>
  truthOptionId: string
  /** The lie that fooled the most people this round (null if no lies). */
  bestLieOptionId: string | null
}

/** Running "best baloney" — the most-fooling lie seen so far across ALL rounds,
 *  resolved (names/colors) when recorded so PLAY_AGAIN churn can't orphan it. */
export interface BestLie {
  prompt: string
  text: string
  authors: { name: string; color: string }[]
  fooled: number
}

/** A finished-game record for the shareable recap card (persisted by the DO at PODIUM). */
export interface GameSummary {
  winnerUserId: string | null
  finishedAtTick: number
  standings: { userId: string; name: string; color: string; score: number }[]
  bestLie: BestLie | null
}

// KNOWN LIMITATION (mirrors the original baloney AND wisecrack's equivalent
// note): GameRoom broadcasts one authoritative state to every connection, so
// during WRITE/VOTE the wire carries `question.answer`, everyone's `lies`, and
// the options board with `isTruth`/`authorIds` — even though the UI hides them
// until REVEAL. A player using devtools could read the truth early. The SDK
// has no per-connection redaction hook; hiding just the `isTruth` flag would
// be theater (the answer text sits in `question`, and the truth is the only
// option with empty authorIds). The original baloney shipped exactly this
// shape; for the friends-in-a-room threat model it is accepted. Do NOT add
// unverified custom broadcast plumbing to "fix" it.
export interface GameState extends HubGameState {
  game: 'baloney'
  phase: Phase
  hostUserId: string | null
  config: GameConfig
  seed: number // set once at room init; seeds question picks + board shuffles
  roomCode: string // captured from the first client JOIN; the DO stamps it onto recap + registry rows
  players: Record<string, PlayerState>
  order: string[] // seated userIds in join order (host = order[0]); spectators excluded
  roundIndex: number // 0-based; the final round is `totalRounds - 1`
  question: Question | null // this round's question (drawn from ctx.content)
  usedQuestionIds: string[] // dedupe across rounds (reset when the pool runs dry)
  lies: Record<string, string> // current round: contestant userId -> accepted lie text
  rejections: Record<string, LieRejection> // current round: userId -> last rejection (cleared on accept)
  options: AnswerOption[] // built when entering VOTE (truth + lies, seeded shuffle)
  votes: Record<string, string> // current round: voter userId -> chosen optionId
  result: RoundResult | null // computed when entering REVEAL
  bestLie: BestLie | null // running most-fooling lie across the whole game
  phaseEndsAt: number | null // epoch-ms deadline; null = no timer (LOBBY/PODIUM)
  winnerUserId: string | null
  summary: GameSummary | null
  registryId: string | null // recordId of this room's public-registry row (DO-managed), if listed
  chat: ChatMsg[] // capped ring buffer, newest last
  emotes: Emote[] // capped ring buffer of recent reactions
  lastChatAt: Record<string, number> // userId -> last accepted chat ts (rate limit)
  lastEmoteAt: Record<string, number> // userId -> last accepted emote ts
}

export const DEFAULT_CONFIG: GameConfig = {
  totalRounds: 3,
  introMs: 3500,
  promptMs: 4500,
  writeMs: 50000,
  voteMs: 25000,
  revealMs: 10000,
  scoreMs: 7000,
  isPublic: false,
}

/** Host plays, so 2 seated players (host + 1) already make a real board. */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8
/** Per-room AI seat cap (spend Guard 4) — enforced inside reduce on ADD_BOT. */
export const MAX_BOTS = 3
