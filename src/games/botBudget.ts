/**
 * Bot spend guards — pure constants + counter math shared by the hub DO and
 * the budget DO. Copied from baloney's proven guard spec (its bots.ts), with
 * the per-game-session call cap from wisecrack2. PURE MODULE: no React, no
 * SDK, no Cloudflare bindings — `tryReserve` is unit-testable without a DO.
 *
 * The six guards (enforced across worker.ts + each game engine):
 *  1. Per-call output cap   — each engine's `bots.maxTokens` bounds one call.
 *  2. Server-built prompts  — system/user prompts are built 100% server-side.
 *  3. One in-flight gen per bot per task + BOT_CALL_CAP per game session.
 *  4. MAX_BOTS              — per-room seat cap, enforced inside each engine.
 *  5. ≥1 connected human before any generation + ROOM_BOT_LIFETIME per room.
 *  6. DAILY_BOT_CAP         — the global daily backstop (AppBudgetRoom).
 */

/**
 * Funniest model (human chose opus for quality over haiku's price).
 * Live-verified against the anthropic/chat-completion integration 2026-06-10.
 */
export const BOT_MODEL = 'claude-opus-4-8'

/**
 * Per-GAME-SESSION call cap (Guard 3b). Reset each time the room returns to
 * LOBBY — covers PLAY_AGAIN replays. A full 8-seat game legitimately uses
 * ~35 calls; typical solo game ~10.
 */
export const BOT_CALL_CAP = 50

/** Bound a slow Opus call so it can't stall a round (caller falls back). */
export const BOT_CALL_TIMEOUT_MS = 25000

/**
 * Per-room lifetime generation cap (Guard 5b) — bounds a play-again-looping
 * room. Best-effort: the counter lives in DO memory and resets if the room
 * hibernates (all sockets gone). Guard 6's budget DO is the durable bound.
 */
export const ROOM_BOT_LIFETIME = 300

/**
 * Global daily generation cap — the load-bearing abuse backstop (Guard 6).
 * Bounds worst-case daily spend regardless of how many rooms exist; resets at
 * UTC midnight inside AppBudgetRoom. The single number to tune if the games
 * get popular — raising it is a conscious choice.
 */
export const DAILY_BOT_CAP = 2000

/** A single budget cell: the UTC day it covers + how many generations were used. */
export interface BudgetCell {
  day: string
  used: number
}

/**
 * Pure counter math for the daily budget DO (extracted so it's unit-testable
 * without a DO runtime). Resets to 0 when the stored cell is from an earlier
 * UTC day; denies when adding `n` would exceed `cap`. On deny, the cell is
 * returned unchanged (rolled to today) so used never overcounts.
 */
export function tryReserve(
  cur: BudgetCell | undefined,
  day: string,
  n: number,
  cap: number,
): { cell: BudgetCell; allowed: boolean } {
  const used = cur && cur.day === day ? cur.used : 0
  if (used + n > cap) {
    return { cell: { day, used }, allowed: false }
  }
  return { cell: { day, used: used + n }, allowed: true }
}

/**
 * Guard 5: a bot may only generate (spend) when a real human is actually
 * playing — i.e. at least one SEATED, currently-connected, non-bot player. A
 * Stage (TV) holds a write socket without taking a seat, so gating on "any
 * connection" let a game left running on a TV keep billing the owner for AI
 * with nobody playing. `order` = seated ids; `connectedIds` = live socket ids.
 */
export function hasSeatedHuman(
  order: string[],
  players: Record<string, { isBot?: boolean } | undefined>,
  connectedIds: ReadonlySet<string>,
): boolean {
  return order.some((id) => connectedIds.has(id) && !players[id]?.isBot)
}
