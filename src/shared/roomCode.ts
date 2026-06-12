/**
 * Room codes — a 4-letter join code that IS the GameRoom id.
 * Pure + injectable RNG so it's unit-testable (no Math.random in tests).
 */

// No vowels-only confusables removed beyond ambiguous letters; we drop I/O to
// avoid 1/0 mix-ups on a TV read. 24 letters → 24^4 ≈ 331k codes, plenty for v1.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const ROOM_CODE_LENGTH = 4

export type Rng = () => number

/** Generate a random N-letter room code. Pass a seeded rng in tests. */
export function makeRoomCode(rng: Rng = Math.random, length = ROOM_CODE_LENGTH): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)]
  }
  return out
}

/** True when a (user-typed) code is a valid room code, case-insensitively. */
export function isValidRoomCode(code: string): boolean {
  const c = code.trim().toUpperCase()
  if (c.length !== ROOM_CODE_LENGTH) return false
  for (const ch of c) {
    if (!ALPHABET.includes(ch)) return false
  }
  return true
}

/** Normalize user input toward a canonical code (uppercase, trimmed). */
export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase()
}
