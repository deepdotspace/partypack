/**
 * Wisecrack engine types — the authoritative shared shapes for the wisecrack
 * game module. Ported from wisecrack2; GameState now extends the hub spine
 * (`game: 'wisecrack'` + DO-managed recapId/registryId fields).
 *
 * `src/games/wisecrack/*` is PURE: no React, no `deepspace` imports. The hub
 * DO (`AppGameRoom`) reduces over these and mirrors the result to clients.
 *
 * Identity model (documented decision):
 *  - A player joins by sending `JOIN { name }` from the Controller (/play).
 *    The Stage (the TV view) is a pure display and never JOINs, so it is
 *    never a seat — you can put the Stage on any TV anonymously.
 *  - `hostUserId` = the first player to JOIN (the "VIP"). The host is a normal
 *    player (writes + votes) who additionally may send START_GAME / SKIP.
 *  - Voters for a matchup = all joined players except its 2 authors.
 *  - ≥3 players required to start (a 2-author matchup then has ≥1 voter).
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
  | 'LOBBY'
  | 'INTRO'
  | 'WRITE'
  | 'VOTE'
  | 'REVEAL'
  | 'SCORE'
  | 'FINAL_INTRO'
  | 'FINAL_WRITE'
  | 'FINAL_VOTE'
  | 'FINAL_REVEAL'
  | 'PODIUM'

/** A comedic prompt with a blank. Content packs carry these. */
export interface Prompt {
  id: string
  text: string // contains a visible blank "___"
  tags: string[]
  safety: 'clean' | 'spicy'
}

export interface GameConfig {
  totalRounds: number // default 3 (2 head-to-head + 1 Last Lash). Final = last index.
  promptsPerPlayer: number // default 2 (rounds 1–2)
  introSeconds: number // default 4
  writeSeconds: number // default 60
  voteSeconds: number // default 20 (per matchup)
  revealSeconds: number // default 6 (per matchup)
  scoreSeconds: number // default 7
  finalVotes: number // default 3 (distributable, Last Lash)
  allowSpicy: boolean // default false
  isPublic: boolean // default false; when true the open lobby is listed for matchmaking
}

/** host = first joiner (plays + runs the room); contestant = plays; spectator = watches + chats + audience-votes only. */
export type PlayerRole = 'host' | 'contestant' | 'spectator'

export interface PlayerState {
  userId: string // server-stamped connection id (anon-<uuid> for anonymous play) — the trusted key
  cid: string // client-minted localStorage id, so a client recognizes itself in the broadcast
  name: string
  color: string // from the fixed roster — player's chosen profile color, else next free
  score: number
  joinedOrder: number
  role: PlayerRole
  isBot?: boolean // an AI "comedian" filling a seat so solo players can play
  persona?: string // persona id (see ./personas.ts) — only set when isBot
}

// KNOWN LIMITATION: GameRoom broadcasts one authoritative state to every
// connection, so a matchup's `answers` and `authorIds` are on the wire during
// WRITE/VOTE even though the UI hides them (authors shown only at REVEAL). A
// player using devtools could read opponents' answers / authorship early. The
// SDK has no per-connection redaction hook, and a proper fix (a public state
// projection + private per-player slice, or opaque answer-slot ids) is a
// deliberate follow-up; for the friends-in-a-room threat model this is
// accepted. Do NOT add unverified custom broadcast plumbing to "fix" it.
export interface Matchup {
  id: string
  promptId: string
  promptText: string
  authorIds: string[] // exactly 2 for R1/R2; all players for the final
  answers: Record<string, string> // userId -> answer text (safety quip fills blanks)
  safety: Record<string, boolean> // userId -> true when auto-filled (no answer)
  votes: Record<string, string[]> // voterId -> [authorId, ...] (>1 only in the final)
}

export interface MatchupResult {
  matchupId: string
  promptText: string
  authorIds: string[]
  answers: Record<string, string>
  voteCounts: Record<string, number> // authorId -> vote count
  totalVotes: number
  deltas: Record<string, number> // authorId -> points earned this matchup
  winnerId: string | null // more votes; null on a tie or jinx
  jinx: boolean // both authors gave the same answer → nobody scores
  quiplashAuthorId: string | null // author who swept 100% of the vote (bonus)
}

/** A finished-game record for the shareable recap card (persisted by the DO at PODIUM). */
export interface GameSummary {
  winnerUserId: string | null
  finishedAtTick: number
  standings: { userId: string; name: string; color: string; score: number }[]
  topMatchup: {
    promptText: string
    answers: { name: string; color: string; text: string; votes: number }[]
  } | null
}

export interface GameState extends HubGameState {
  game: 'wisecrack'
  phase: Phase
  hostUserId: string | null
  /** cid of the first host, so they reclaim the host bit after a brief blip. */
  originalHostCid?: string
  config: GameConfig
  seed: number // set once at room init; seeds all deterministic shuffles
  roomCode: string // captured from the first client JOIN; the DO stamps it onto recap + registry rows
  players: Record<string, PlayerState>
  order: string[] // userIds in join order (host = order[0])
  roundIndex: number // 0-based; final round when roundIndex === config.totalRounds - 1
  // Prompts are drawn from a deterministic shuffle(activePool, seed) recomputed
  // server-side from ctx.content + config.allowSpicy; only the cursor + already-
  // drawn text are broadcast, so future prompts never leak onto the wire.
  promptCursor: number
  promptText: Record<string, string> // promptId -> text snapshot for drawn prompts
  matchups: Matchup[] // this round's matchups
  voteIndex: number // which matchup the Stage is currently voting on
  results: MatchupResult[] // computed at REVEAL for the current round
  lastRoundDeltas: Record<string, number> // userId -> points gained last SCORE
  phaseEndsAt: number | null // epoch-ms deadline; null = no timer
  winnerUserId: string | null
  // Running "bit of the night" — the most-voted matchup seen so far across ALL
  // rounds (draft.results is per-round, so the summary needs this accumulator to
  // span the whole game). Resolved (names/colors) when recorded, at round end.
  bestMatchup: GameSummary['topMatchup']
  summary: GameSummary | null
  registryId: string | null // recordId of this room's public-registry row (DO-managed), if listed
  chat: ChatMsg[] // capped ring buffer, newest last
  emotes: Emote[] // capped ring buffer of recent reactions
  lastChatAt: Record<string, number> // userId -> last accepted chat ts (rate limit)
  lastEmoteAt: Record<string, number> // userId -> last accepted emote ts
}

export const DEFAULT_CONFIG: GameConfig = {
  totalRounds: 3,
  promptsPerPlayer: 2,
  introSeconds: 4,
  writeSeconds: 60,
  voteSeconds: 20,
  revealSeconds: 6,
  scoreSeconds: 7,
  finalVotes: 3,
  allowSpicy: false,
  isPublic: false,
}

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 8
/** Per-room AI seat cap (spend Guard 4) — enforced inside reduce on ADD_BOT. */
export const MAX_BOTS = 3
export const MAX_ANSWER_LEN = 80

/** Spectators may vote (audience), but their votes count at reduced weight. */
export const AUDIENCE_WEIGHT = 0.5

/** Points base per matchup at 100% vote share, before the round multiplier. */
export const ROUND_POINT_BASE = 1000
/** Flat bonus (× round multiplier) for a 100% sweep ("QUIPLASH!"). */
export const QUIPLASH_BONUS = 500

/** Round multiplier: round 1 = 1×, round 2 = 2×, final = 3×. */
export function roundMultiplier(roundIndex: number): number {
  return roundIndex + 1
}
