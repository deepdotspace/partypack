/**
 * Deterministic hash / PRNG / shuffle helpers — copied verbatim from the
 * original Pitch's text.ts (only the helpers Pitch actually uses; the
 * normalize/answersMatch pair was Baloney-shaped and is not needed here).
 * Pure module.
 */

/** Deterministic 32-bit hash of a string (FNV-1a). Used to seed shuffles. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — small, fast, seedable PRNG. Returns a function yielding [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic Fisher–Yates shuffle (returns a new array; does not mutate). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice()
  const rng = makeRng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
