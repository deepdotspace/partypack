/**
 * Round scoring. Pure module. Copied verbatim from the original Pitch.
 *
 *   +1000 × multiplier × (votes received)  to each invention's author
 *   + 500 × multiplier                      bonus to the round winner
 *
 * The round winner is the author of the most-voted invention. Ties are broken
 * by canonical order (the `inv-N` id, assigned by sorted author userId before
 * the board is shuffled) so the result is deterministic. A player can't vote
 * for their own invention (enforced at the VOTE input), so nobody scores off
 * their own option.
 */

import type { InventionOption, RoundResult } from './types'

export const VOTE_POINTS = 1000
export const WINNER_BONUS = 500

/** Round multiplier: round 2 doubles, the final round triples, else 1×. */
export function roundMultiplier(roundIndex: number, totalRounds: number): number {
  if (roundIndex === totalRounds - 1) return 3
  if (roundIndex === 1) return 2
  return 1
}

export function scoreRound(
  options: InventionOption[],
  /** voter userId -> chosen optionId. */
  votes: Record<string, string>,
  multiplier: number,
): RoundResult {
  const votesByOption: Record<string, string[]> = {}
  for (const o of options) votesByOption[o.id] = []
  for (const [voter, optionId] of Object.entries(votes)) {
    if (votesByOption[optionId]) votesByOption[optionId].push(voter)
  }

  const deltas: Record<string, number> = {}
  const add = (userId: string, n: number) => {
    deltas[userId] = (deltas[userId] ?? 0) + n
  }

  // Each author earns per vote their invention received.
  for (const o of options) {
    const received = votesByOption[o.id]?.length ?? 0
    if (received > 0) add(o.userId, VOTE_POINTS * multiplier * received)
  }

  // Round winner: most votes, ties broken by canonical option order (inv-N id).
  let roundWinnerUserId: string | null = null
  let bestCount = 0
  for (const o of [...options].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const count = votesByOption[o.id]?.length ?? 0
    if (count > bestCount) {
      bestCount = count
      roundWinnerUserId = o.userId
    }
  }
  if (roundWinnerUserId) add(roundWinnerUserId, WINNER_BONUS * multiplier)

  return { deltas, votesByOption, roundWinnerUserId }
}
