/**
 * Round scoring. Pure module.
 *
 *   +1000 × multiplier  to each player who voted for the TRUTH
 *   + 500 × multiplier × (voters fooled)  to each author of a lie
 *
 * Merged lies (jinx) credit every author the full fooling amount. A player
 * never scores for their own lie (the client hides it; we also can't vote it).
 */

import type { AnswerOption, RoundResult } from './types'

export const TRUTH_POINTS = 1000
export const FOOL_POINTS = 500

/** Round multiplier: round 2 doubles, the final round triples, else 1×. */
export function roundMultiplier(roundIndex: number, totalRounds: number): number {
  if (roundIndex === totalRounds - 1) return 3
  if (roundIndex === 1) return 2
  return 1
}

export function scoreRound(
  options: AnswerOption[],
  /** voter userId -> chosen optionId. */
  votes: Record<string, string>,
  multiplier: number,
): RoundResult {
  const truth = options.find((o) => o.isTruth)
  const truthOptionId = truth?.id ?? ''

  const votesByOption: Record<string, string[]> = {}
  for (const o of options) votesByOption[o.id] = []
  for (const [voter, optionId] of Object.entries(votes)) {
    if (votesByOption[optionId]) votesByOption[optionId].push(voter)
  }

  const deltas: Record<string, number> = {}
  const add = (userId: string, n: number) => {
    deltas[userId] = (deltas[userId] ?? 0) + n
  }

  // Truth-finders.
  for (const voter of votesByOption[truthOptionId] ?? []) {
    add(voter, TRUTH_POINTS * multiplier)
  }

  // Lie authors earn per voter fooled.
  for (const o of options) {
    if (o.isTruth) continue
    const fooled = votesByOption[o.id]?.length ?? 0
    if (fooled === 0) continue
    for (const author of o.authorIds) {
      add(author, FOOL_POINTS * multiplier * fooled)
    }
  }

  // Best lie of the round (most votes; ties broken by canonical option order).
  let bestLieOptionId: string | null = null
  let bestCount = 0
  for (const o of options) {
    if (o.isTruth) continue
    const count = votesByOption[o.id]?.length ?? 0
    if (count > bestCount) {
      bestCount = count
      bestLieOptionId = o.id
    }
  }

  return { deltas, votesByOption, truthOptionId, bestLieOptionId }
}
