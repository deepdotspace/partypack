/**
 * Engine dispatch table — the server-side contract each game module fulfils.
 *
 * The hub DO (AppGameRoom in worker.ts) owns NO game rules: it looks up the
 * room's engine here and delegates reduce / bots / recap / registry to it.
 * Game ports register by importing their engine and adding one line to
 * ENGINES below. The hub compiles and runs with ZERO engines registered —
 * a join to any room then yields the `{ game: null }` pre-state, which the
 * client renders as room-not-found.
 *
 * PURE-ISH MODULE: no React. May be imported by the worker; engines it
 * references must themselves be pure (no SDK / network — the DO owns I/O).
 */

import type { GameId } from './registry'
import type { HubGameState, RawInput, ReduceCtx } from './spine'
import { wisecrackEngine } from './wisecrack'
import { baloneyEngine } from './baloney'
import { pitchEngine } from './pitch'

/** One pending LLM generation for one bot (e.g. an answer for one matchup). */
export interface BotTask {
  botId: string
  /** Persona id — resolved to a system prompt by buildSystemPrompt. */
  persona: string
  /**
   * The generation unit (typically the prompt/question text). Doubles as the
   * in-flight/dedupe key suffix, so it must be unique per generation unit
   * within a game session (botId + task identifies one call).
   */
  task: string
}

/**
 * Engine-side bot driver hooks. The hub DO supplies the mechanics (fire-and-
 * forget calls, in-flight tracking, pending-input queue, budget guards,
 * canned fallback on error/timeout); the engine supplies the game knowledge.
 * All prompt text is built here, server-side — client input never reaches a
 * prompt builder (Guard 2).
 */
export interface GameBots {
  /**
   * Tasks still needing a generation for the given state. Called every tick;
   * must be derived purely from state (the hub dedupes against in-flight and
   * already-queued work).
   */
  needsGeneration(state: HubGameState): BotTask[]
  buildSystemPrompt(persona: string, state: HubGameState): string
  buildUserPrompt(task: string): string
  /** Extract a usable candidate from the raw LLM text; null → canned fallback. */
  pickCandidate(raw: string, task: string): string | null
  /** In-voice canned line for budget-deny / error / timeout — phases never hang. */
  fallback(persona: string, task: string): string
  /** Wrap a finished generation as the synthetic input the reducer consumes. */
  submitInput(botId: string, text: string, state: HubGameState): { action: string; data: unknown }
  /**
   * Free (no-LLM) bot moves for the current state — votes, picks. Called every
   * tick; the hub queues them as synthetic inputs and drops exact duplicates
   * still pending, so reducers must also reject double-votes (they already do).
   */
  heuristicVotes(state: HubGameState): Array<{ botId: string; action: string; data: unknown }>
  /** Per-call output token cap (Guard 1). Keep tiny — a quip is a few words. */
  maxTokens: number
}

export interface GameEngine {
  /** Fresh game state seeded for deterministic shuffles. */
  initialState(seed: number): HubGameState
  /**
   * The pure per-tick reducer. Returns the next state, or undefined to keep
   * the current one (idle tick). MUST carry the DO-managed spine fields
   * (registryId / recapId) through unchanged — see spine.ts.
   */
  reduce(prev: HubGameState, inputs: RawInput[], ctx: ReduceCtx): HubGameState | undefined
  /** The engine's content pool, passed back via ReduceCtx.content each tick. */
  content: unknown
  /**
   * Bot hooks, or null for games without AI bots. NOTE for ports: MAX_BOTS
   * (Guard 4) stays engine-enforced — clamp ADD_BOTS inside reduce.
   */
  bots: GameBots | null
  /**
   * The shareable podium recap, or null when there's nothing to persist yet
   * (not at podium). The hub writes it to the `games` collection exactly once
   * per game session (guarded by state.recapId) the first tick it's non-null.
   * `payload` is the JSON-stringified game-specific recap body.
   */
  recap(
    state: HubGameState,
  ): { winnerName: string; winnerColor: string; winnerScore: number; payload: string } | null
  /**
   * This room's public-registry row, or null to delist (not joinable).
   * Mirror wisecrack2's listing rule: non-null only for a public, open LOBBY
   * with at least one CONNECTED player and a free seat — `connected` is the
   * live socket roster (bots never hold sockets), passed by the hub so state
   * doesn't need to track connectivity. The hub upserts / deletes the `rooms`
   * row whenever the returned row (or null) changes.
   */
  registryRow(state: HubGameState, connected: string[]): { name: string; playerCount: number } | null
}

/**
 * The dispatch table. Game ports register here via explicit imports.
 */
export const ENGINES: Partial<Record<GameId, GameEngine>> = {
  wisecrack: wisecrackEngine,
  baloney: baloneyEngine,
  pitch: pitchEngine,
}
