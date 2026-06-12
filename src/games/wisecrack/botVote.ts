/**
 * Bot voting — PURE heuristic (no AI: voting via LLM per matchup would be too
 * many calls). A bot votes for a non-self answer, preferring real answers over
 * auto-filled safety quips. The GameRoom DO calls these and injects the result
 * as a synthetic VOTE input; `rng` is seeded per (bot, matchup) for variety.
 */
import type { Matchup } from './types'

/** Pick one author for a head-to-head VOTE (never self). Returns null if the bot authored both. */
export function pickBotVote(matchup: Matchup, botId: string, rng: () => number): string | null {
  const options = matchup.authorIds.filter((a) => a !== botId)
  if (options.length === 0) return null
  const real = options.filter((a) => !matchup.safety[a])
  const pool = real.length > 0 ? real : options
  return pool[Math.floor(rng() * pool.length)] ?? pool[0]
}

/** Distribute `n` Last-Lash votes across non-self authors (stacking allowed). */
export function pickBotFinalVotes(matchup: Matchup, botId: string, n: number, rng: () => number): string[] {
  const options = matchup.authorIds.filter((a) => a !== botId)
  if (options.length === 0) return []
  const real = options.filter((a) => !matchup.safety[a])
  const pool = real.length > 0 ? real : options
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(pool[Math.floor(rng() * pool.length)] ?? pool[0])
  return out
}
