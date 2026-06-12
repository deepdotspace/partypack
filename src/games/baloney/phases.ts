/**
 * Phase timing + the chat gate. Pure helpers the engine composes. Timings are
 * the original baloney's GameConfig ms values; timers are epoch-ms deadlines
 * (set by the engine as now + duration).
 */
import type { GameConfig, Phase } from './types'

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

/**
 * Phases where chat is allowed — off during WRITE/VOTE to stop collusion
 * ("don't pick London, that one's mine"). Ported from the original baloney;
 * emotes stay allowed everywhere (a 🔥 can't leak a lie).
 */
const CHAT_PHASES: ReadonlySet<Phase> = new Set<Phase>(['LOBBY', 'INTRO', 'REVEAL', 'SCORE', 'PODIUM'])
export function chatAllowed(phase: Phase): boolean {
  return CHAT_PHASES.has(phase)
}

/** Every seated player has an accepted lie this round. */
export function allLiesIn(lies: Record<string, string>, order: string[]): boolean {
  return order.length > 0 && order.every((id) => lies[id] !== undefined)
}

/** Every seated player has cast a vote (spectators never vote in baloney). */
export function allVotesIn(votes: Record<string, string>, order: string[]): boolean {
  return order.length > 0 && order.every((id) => votes[id] !== undefined)
}
