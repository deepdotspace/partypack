/**
 * Phase timing + transition predicates. Pure helpers the engine composes.
 * Timers are epoch-ms deadlines (set by the engine as now + duration); these
 * predicates decide when a phase can auto-advance EARLY (before the timer).
 * Durations are the original Pitch's ms values (carried on GameConfig).
 */
import type { GameConfig, GameState, Phase } from './types'

/** Phase duration in ms, or null when the phase waits on an action (no timer). */
export function phaseMs(phase: Phase, config: GameConfig): number | null {
  switch (phase) {
    case 'LOBBY':
    case 'PODIUM':
      return null
    case 'INTRO':
      return config.introMs
    case 'PROMPT':
      return config.promptMs
    case 'WRITE':
      return config.writeMs
    case 'VOTE':
      return config.voteMs
    case 'REVEAL':
      return config.revealMs
    case 'SCORE':
      return config.scoreMs
  }
}

/** Every seated player (host included — the host plays) has a stored invention. */
export function allInventionsIn(state: GameState): boolean {
  return state.order.length > 0 && state.order.every((id) => state.inventions[id] !== undefined)
}

/**
 * Eligible voters for the current board: seated players with at least one
 * option that isn't their own (you can't vote for your own invention, so the
 * sole author on a one-option board is never waited on). Spectators don't
 * vote in Pitch, so they never gate the round.
 */
export function eligibleVoters(state: GameState): string[] {
  return state.order.filter((id) => state.options.some((o) => o.userId !== id))
}

/** Every eligible voter has cast a vote on this round's board. */
export function allVotesIn(state: GameState): boolean {
  return eligibleVoters(state).every((id) => state.votes[id] !== undefined)
}
