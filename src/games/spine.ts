/**
 * Game spine — the engine-agnostic types every game engine reduces over.
 *
 * PURE MODULE: no React, no SDK imports. Each game's `src/games/<id>/` module
 * extends these shapes; the hub DO in worker.ts only ever sees the spine.
 * RawInput matches wisecrack2's proven wire shape exactly (the DO stamps
 * userId; tick is optional and SDK-supplied for client inputs).
 */

import type { GameId } from './registry'

export type { ChatMsg, Emote } from '../shared/types'

/** The raw input shape the DO hands to `reduce` (userId server-stamped). */
export interface RawInput {
  userId: string
  action: string
  data?: Record<string, unknown>
  tick?: number
}

/** Per-tick context injected by the DO: wall clock, live roster, content pool. */
export interface ReduceCtx<Content = unknown> {
  now: number
  /** userIds with a live websocket this tick (bots never connect). */
  connected: string[]
  /** The engine's own content pool (prompt/question/brief data), passed back verbatim. */
  content: Content
}

/**
 * The minimal state every game's GameState extends. The hub DO dispatches on
 * `game`, drives bots/recap/registry off `phase` and the DO-managed fields.
 *
 * Conventions every engine port must keep (mirrors wisecrack2):
 *  - `phase === 'LOBBY'` names the pre-game phase (the DO resets the per-game
 *    bot-call budget there).
 *  - `roomCode` is captured by the engine from the first JOIN's data; the DO
 *    reads it when stamping recap + registry rows.
 *  - `registryId` / `recapId` are written by the DO, never by the engine —
 *    but the engine's reduce MUST carry them through unchanged (clone-based
 *    reducers do this for free).
 */
export interface HubGameState {
  game: GameId
  phase: string
  /** Room code captured from the first client JOIN (engine-managed). */
  roomCode?: string
  /** recordId of this room's public-registry row, if listed (DO-managed). */
  registryId?: string | null
  /** recordId of the persisted podium recap, set once per game session (DO-managed). */
  recapId?: string | null
}
