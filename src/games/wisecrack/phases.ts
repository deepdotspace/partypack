/**
 * Phase timing + transition predicates. Pure helpers the engine composes.
 * Timers are epoch-ms deadlines (set by the engine as now + duration); these
 * predicates decide when a phase can auto-advance EARLY (before the timer).
 */
import { votersFor } from './assignPrompts'
import type { GameConfig, Matchup, Phase } from './types'

/** Phase duration in seconds, or null when the phase waits on an action (no timer). */
export function phaseSeconds(phase: Phase, config: GameConfig): number | null {
  switch (phase) {
    case 'LOBBY':
    case 'PODIUM':
      return null
    case 'INTRO':
    case 'FINAL_INTRO':
      return config.introSeconds
    case 'WRITE':
    case 'FINAL_WRITE':
      return config.writeSeconds
    case 'VOTE':
    case 'FINAL_VOTE':
      return config.voteSeconds
    case 'REVEAL':
    case 'FINAL_REVEAL':
      return config.revealSeconds
    case 'SCORE':
      return config.scoreSeconds
  }
}

/** Every author has submitted a (non-empty) answer for every matchup this round. */
export function allAnswersIn(matchups: Matchup[]): boolean {
  for (const m of matchups) {
    for (const a of m.authorIds) {
      const ans = m.answers[a]
      if (!ans || ans.trim().length === 0) return false
    }
  }
  return true
}

/** Every eligible voter (non-author) has cast a vote on this matchup. */
export function allVotersVoted(matchup: Matchup, allPlayers: string[]): boolean {
  const voters = votersFor(matchup.authorIds, allPlayers)
  if (voters.length === 0) return true
  return voters.every((v) => (matchup.votes[v]?.length ?? 0) >= 1)
}

/** Every player has spent all their distributable votes in the Last Lash final. */
export function allFinalVotesIn(matchup: Matchup, allPlayers: string[], finalVotes: number): boolean {
  // A player can't vote for their own answer, so the most anyone can cast is
  // finalVotes; we wait until everyone who CAN vote has spent them all.
  return allPlayers.every((p) => (matchup.votes[p]?.length ?? 0) >= finalVotes)
}
