/**
 * Pitch engine types — the authoritative shared shapes for the pitch game
 * module. Round logic ported from the original Pitch repo; the lobby /
 * identity / host / spectator layers mirror wisecrack's spine skeleton.
 *
 * `src/games/pitch/*` is PURE: no React, no `deepspace` imports. The hub
 * DO (`AppGameRoom`) reduces over these and mirrors the result to clients.
 *
 * Identity model (deliberate deltas from the original Pitch, locked):
 *  - HOST PLAYS. The original had a non-contestant MC claiming host via
 *    CLAIM_HOST; here the host is wisecrack's model — the FIRST player to
 *    JOIN, and a full contestant (invents + votes). No CLAIM_HOST.
 *  - SPECTATORS (overflow / mid-game joiners) watch + chat + emote but do
 *    NOT vote in Pitch — scoring stays clean (wisecrack's 0.5-weight
 *    audience-vote mechanic stays wisecrack-only).
 *  - The Stage (TV view) is a pure display and never JOINs.
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
  | 'LOBBY' // waiting for players; host can start
  | 'INTRO' // "Round N" splash
  | 'PROMPT' // the brief reveal — brief-as-hero on the Stage
  | 'WRITE' // players invent their product (name + pitch)
  | 'VOTE' // players vote for the best invention (never their own)
  | 'REVEAL' // vote counts fly in, then the round winner ("SOLD!")
  | 'SCORE' // leaderboard re-rank
  | 'PODIUM' // overall winner; host can play again

/** A creative brief players invent against. No "answer" — pure prompt. */
export interface Brief {
  id: string
  /** The brief text players invent a product for. */
  prompt: string
  /** Loose category (gadget / app / sport / …) — surfaced as a chip. */
  tag: string
}

/** A player's invention for the current round: a product name + one-line pitch. */
export interface Invention {
  name: string
  pitch: string
}

/** Timings carried verbatim from the original Pitch (ms, see its phases.ts). */
export interface GameConfig {
  totalRounds: number // host-set in the lobby; original Pitch range 1-5
  introMs: number
  promptMs: number
  writeMs: number
  voteMs: number
  revealMs: number
  scoreMs: number
  isPublic: boolean // when true the open lobby is listed for matchmaking
}

/** host = first joiner (plays + runs the room); contestant = plays; spectator = watches + chats only. */
export type PlayerRole = 'host' | 'contestant' | 'spectator'

export interface PlayerState {
  userId: string // server-stamped connection id (anon-<uuid> for anonymous play) — the trusted key
  cid: string // client-minted localStorage id, so a client recognizes itself in the broadcast
  name: string
  color: string // from the fixed roster — player's chosen profile color, else next free
  score: number
  joinedOrder: number
  role: PlayerRole
  isBot?: boolean // an AI "inventor" filling a seat so solo players can play
  persona?: string // persona id (see ./bots.ts) — only set when isBot
}

/** One invention on the VOTE board — every submitted invention becomes an option. */
export interface InventionOption {
  /** Stable within a round (`inv-N`, assigned in canonical author order). */
  id: string
  /** The author of this invention. */
  userId: string
  name: string
  pitch: string
}

export interface RoundResult {
  /** Per-player score change for this round. */
  deltas: Record<string, number>
  /** optionId -> userIds who voted for it. */
  votesByOption: Record<string, string[]>
  /** The author of the most-voted invention this round (null if no votes). */
  roundWinnerUserId: string | null
}

/** The most-voted invention seen so far across ALL rounds (the recap showcase). */
export interface TopInvention {
  name: string
  pitch: string
  byName: string
  byColor: string
  votes: number
  briefPrompt: string
}

/** A finished-game record for the shareable recap card (persisted by the DO at PODIUM). */
export interface GameSummary {
  winnerUserId: string | null
  finishedAtTick: number
  standings: { userId: string; name: string; color: string; score: number }[]
  topInvention: TopInvention | null
}

export interface GameState extends HubGameState {
  game: 'pitch'
  phase: Phase
  hostUserId: string | null
  /** cid of the first host, so they reclaim the host bit after a brief blip. */
  originalHostCid?: string
  config: GameConfig
  seed: number // set once at room init; seeds brief draws + board shuffles
  roomCode: string // captured from the first client JOIN; the DO stamps it onto recap + registry rows
  players: Record<string, PlayerState>
  order: string[] // userIds in join order (host = order[0]); spectators NOT seated here
  roundIndex: number // 0-based; the final round is `totalRounds - 1`
  brief: Brief | null
  usedBriefIds: string[] // per-game dedupe; resets when the pool is exhausted
  /** Current round: contestant userId -> their invention (name + pitch). */
  inventions: Record<string, Invention>
  /** Built when entering VOTE (one option per invention, seeded shuffle). */
  options: InventionOption[]
  /** Current round: voter userId -> chosen optionId (replaceable until reveal). */
  votes: Record<string, string>
  /** Computed when entering REVEAL; drives SCORE's deltas too. */
  result: RoundResult | null
  phaseEndsAt: number | null // epoch-ms deadline; null = no timer (LOBBY/PODIUM)
  winnerUserId: string | null
  // Running "invention of the night" — the most-voted invention across ALL
  // rounds (result is per-round, so the summary needs this accumulator).
  // Resolved (names/colors) when recorded, at reveal time.
  bestInvention: TopInvention | null
  summary: GameSummary | null
  registryId: string | null // recordId of this room's public-registry row (DO-managed), if listed
  chat: ChatMsg[] // capped ring buffer, newest last
  emotes: Emote[] // capped ring buffer of recent reactions
  lastChatAt: Record<string, number> // userId -> last accepted chat ts (rate limit)
  lastEmoteAt: Record<string, number> // userId -> last accepted emote ts
}

/** Original Pitch timings (its phases.ts), plus the hub's public-lobby flag. */
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

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 8
/** Per-room AI seat cap (spend Guard 4) — enforced inside reduce on ADD_BOT. */
export const MAX_BOTS = 3
