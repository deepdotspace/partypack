/**
 * Scoring — pure. Points are proportional to vote share, scaled by the round
 * multiplier (R1 1× / R2 2× / final 3×). A 100% sweep adds the QUIPLASH bonus;
 * two identical answers are a JINX (nobody scores). The Last Lash final uses
 * distributable votes and no sweep bonus.
 */
import { sameAnswer } from './text'
import {
  QUIPLASH_BONUS,
  ROUND_POINT_BASE,
  roundMultiplier,
  type Matchup,
  type MatchupResult,
} from './types'

function emptyCounts(authorIds: string[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const a of authorIds) c[a] = 0
  return c
}

/**
 * Score a head-to-head matchup (rounds 1–2). `weightOf` weights each voter's
 * vote (default 1); spectators/audience pass a fraction (see AUDIENCE_WEIGHT).
 */
export function scoreMatchup(
  matchup: Matchup,
  roundIndex: number,
  weightOf: (voterId: string) => number = () => 1,
): MatchupResult {
  const mult = roundMultiplier(roundIndex)
  const [a, b] = matchup.authorIds
  const base: Omit<MatchupResult, 'voteCounts' | 'totalVotes' | 'deltas' | 'winnerId' | 'quiplashAuthorId'> = {
    matchupId: matchup.id,
    promptText: matchup.promptText,
    authorIds: matchup.authorIds,
    answers: matchup.answers,
    jinx: false,
  }

  // JINX — identical answers, nobody scores.
  if (sameAnswer(matchup.answers[a] ?? '', matchup.answers[b] ?? '')) {
    return {
      ...base,
      jinx: true,
      voteCounts: emptyCounts(matchup.authorIds),
      totalVotes: 0,
      deltas: { [a]: 0, [b]: 0 },
      winnerId: null,
      quiplashAuthorId: null,
    }
  }

  const counts = emptyCounts(matchup.authorIds)
  // Full-weight (contestant/host) votes per author. A QUIPLASH sweep must be
  // backed by at least one real player — a sweep made only of fractional
  // audience votes doesn't earn the bonus.
  const fullWeight = emptyCounts(matchup.authorIds)
  for (const [voterId, picks] of Object.entries(matchup.votes)) {
    const w = weightOf(voterId)
    for (const authorId of picks) {
      if (authorId in counts) {
        counts[authorId] += w
        if (w >= 1) fullWeight[authorId] += 1
      }
    }
  }
  const total = counts[a] + counts[b]

  const deltas: Record<string, number> = { [a]: 0, [b]: 0 }
  let quiplashAuthorId: string | null = null
  if (total > 0) {
    deltas[a] = Math.round((counts[a] / total) * ROUND_POINT_BASE * mult)
    deltas[b] = Math.round((counts[b] / total) * ROUND_POINT_BASE * mult)
    // Sweep: one author took every vote, with at least one full-weight backer.
    if (counts[a] === total && counts[b] === 0 && fullWeight[a] > 0) quiplashAuthorId = a
    else if (counts[b] === total && counts[a] === 0 && fullWeight[b] > 0) quiplashAuthorId = b
    if (quiplashAuthorId) deltas[quiplashAuthorId] += QUIPLASH_BONUS * mult
  }

  let winnerId: string | null = null
  if (counts[a] > counts[b]) winnerId = a
  else if (counts[b] > counts[a]) winnerId = b

  return { ...base, voteCounts: counts, totalVotes: total, deltas, winnerId, quiplashAuthorId }
}

/** Score the Last Lash final — everyone authored; votes are distributable; no sweep bonus. */
export function scoreFinal(
  matchup: Matchup,
  roundIndex: number,
  weightOf: (voterId: string) => number = () => 1,
): MatchupResult {
  const mult = roundMultiplier(roundIndex)
  const counts = emptyCounts(matchup.authorIds)
  for (const [voterId, picks] of Object.entries(matchup.votes)) {
    const w = weightOf(voterId)
    for (const authorId of picks) {
      if (authorId in counts) counts[authorId] += w
    }
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0)

  const deltas: Record<string, number> = {}
  for (const a of matchup.authorIds) {
    deltas[a] = total > 0 ? Math.round((counts[a] / total) * ROUND_POINT_BASE * mult) : 0
  }

  // Winner = unique max votes (null on a tie).
  let winnerId: string | null = null
  let best = -1
  let tied = false
  for (const a of matchup.authorIds) {
    if (counts[a] > best) {
      best = counts[a]
      winnerId = a
      tied = false
    } else if (counts[a] === best) {
      tied = true
    }
  }
  if (tied || best <= 0) winnerId = null

  return {
    matchupId: matchup.id,
    promptText: matchup.promptText,
    authorIds: matchup.authorIds,
    answers: matchup.answers,
    voteCounts: counts,
    totalVotes: total,
    deltas,
    winnerId,
    jinx: false,
    quiplashAuthorId: null,
  }
}
