/**
 * Text normalization + a tiny seeded PRNG. Pure module.
 *
 * normalize() decides when two answers "count as the same" — used to (a) reject
 * a lie that matches the truth, (b) merge identical lies into one option, and
 * (c) match a player's lie against forbidden answers. It must be forgiving of
 * case, spacing, punctuation, accents, and leading articles, but not so
 * aggressive that genuinely different answers collide.
 */

const LEADING_ARTICLE = /^(a|an|the)\s+/

export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_ARTICLE, '')
    .trim()
}

/** True if two free-text answers are "the same" for game purposes. */
export function answersMatch(a: string, b: string): boolean {
  return normalize(a) === normalize(b)
}

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
