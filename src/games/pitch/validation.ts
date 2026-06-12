/**
 * Invention validation. Pure module. Copied verbatim from the original Pitch.
 *
 * An invention is a product NAME plus a one-line PITCH. Both must be non-empty
 * after trimming. Lengths are capped (the engine also clamps on store), so an
 * over-long entry isn't rejected — it's accepted and truncated. Returns the
 * trimmed/clamped invention if valid, or `null` if either field is empty.
 */

import type { Invention } from './types'

export const MAX_NAME_LENGTH = 40
export const MAX_PITCH_LENGTH = 120

/** Trim + clamp a raw name/pitch pair. Returns null if either is empty. */
export function validateInvention(rawName: string, rawPitch: string): Invention | null {
  const name = rawName.trim().slice(0, MAX_NAME_LENGTH)
  const pitch = rawPitch.trim().slice(0, MAX_PITCH_LENGTH)
  if (name.length === 0 || pitch.length === 0) return null
  return { name, pitch }
}
