/**
 * Build the shuffled invention board for the VOTE phase. Pure module. Copied
 * verbatim from the original Pitch.
 *
 * Every submitted invention becomes exactly one option (no merging, no truth).
 * Option ids are assigned in a deterministic canonical order (by author userId)
 * so they're stable across rebuilds of the same round, then the array is
 * shuffled with a seed so the order on the board isn't predictable.
 */

import type { Invention, InventionOption } from './types'
import { seededShuffle, hashString } from './text'

export function buildInventionOptions(
  /** contestant userId -> their invention (only those who submitted). */
  inventions: Record<string, Invention>,
  /** Stable seed for the shuffle (e.g. brief id + round). */
  seed: string,
): InventionOption[] {
  // Canonical order: sort by author userId so id assignment is deterministic
  // regardless of submission order, then assign ids.
  const options: InventionOption[] = Object.entries(inventions)
    .filter(([, inv]) => inv.name.trim().length > 0 && inv.pitch.trim().length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([userId, inv], i) => ({
      id: `inv-${i}`,
      userId,
      name: inv.name,
      pitch: inv.pitch,
    }))

  return seededShuffle(options, hashString(seed))
}
