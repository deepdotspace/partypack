/**
 * assignPrompts — the one algorithm Wisecrack adds over Baloney.
 *
 * Distribute prompts so each is held by exactly TWO distinct players, every
 * player authors the same number of prompts (±1 only when N·k is odd), and the
 * voters for a matchup are everyone except its two authors.
 *
 * Construction: a circulant near-k-regular graph on the (shuffled) players.
 * Offset-d edges {i, (i+d) mod N} add degree 2 to every vertex when d ≠ N/2;
 * a final (near-)perfect matching contributes the last degree when k is odd.
 * Pure + seeded (pass a deterministic rng).
 */
import type { Rng } from './rng'
import { shuffle } from './rng'

export interface PromptAssignment {
  promptId: string
  authorIds: [string, string]
}

/** Index-pair edges of a near-k-regular graph on n vertices (0..n-1). */
function regularPairs(n: number, k: number): [number, number][] {
  const edges: [number, number][] = []
  let remaining = k
  let d = 1
  // Double-cover offsets (each adds degree 2 to every vertex).
  while (remaining >= 2 && d < n - d) {
    for (let i = 0; i < n; i++) edges.push([i, (i + d) % n])
    remaining -= 2
    d++
  }
  // One leftover degree → a (near-)perfect matching.
  if (remaining === 1) {
    if (n % 2 === 0) {
      const h = n / 2
      for (let i = 0; i < h; i++) edges.push([i, i + h])
    } else {
      for (let i = 0; i + 1 < n; i += 2) edges.push([i, i + 1]) // last vertex unpaired
    }
  }
  return edges
}

export function assignPrompts(
  players: string[],
  promptSupply: string[],
  promptsPerPlayer: number,
  rng: Rng,
): PromptAssignment[] {
  const n = players.length
  if (n < 2) return []
  const seats = shuffle(players, rng)
  const edges = regularPairs(n, promptsPerPlayer)
  if (promptSupply.length < edges.length) {
    throw new Error(
      `assignPrompts: need ${edges.length} prompts for ${n} players × ${promptsPerPlayer}, got ${promptSupply.length}`,
    )
  }
  return edges.map(([a, b], i) => ({
    promptId: promptSupply[i],
    authorIds: [seats[a], seats[b]] as [string, string],
  }))
}

/** Voters for a matchup = all players except its authors. */
export function votersFor(authorIds: string[], allPlayers: string[]): string[] {
  return allPlayers.filter((p) => !authorIds.includes(p))
}
