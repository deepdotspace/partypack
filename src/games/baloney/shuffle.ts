/**
 * Build the shuffled answer board for the VOTE phase. Pure module.
 *
 * - Identical lies (by normalize()) merge into ONE option crediting every author
 *   (the "jinx" — both liars share the fooling points).
 * - The truth is added as a non-author option.
 * - Option ids are assigned in a deterministic canonical order (so they're
 *   stable across rebuilds of the same round), then the array is shuffled with a
 *   seed so the truth's position isn't predictable.
 */

import type { AnswerOption, Question } from './types'
import { normalize, seededShuffle, hashString } from './text'

const TRUTH_ID = 'truth'

export function buildAnswerOptions(
  question: Question,
  /** contestant userId -> raw lie text (only those who submitted). */
  lies: Record<string, string>,
  /** Stable seed for the shuffle (e.g. question id + round). */
  seed: string,
): AnswerOption[] {
  // Group lies by their normalized form, preserving first-seen display text.
  const groups = new Map<string, { text: string; authorIds: string[] }>()
  for (const [userId, raw] of Object.entries(lies)) {
    const text = raw.trim()
    if (text.length === 0) continue
    const key = normalize(text)
    if (key.length === 0) continue
    const existing = groups.get(key)
    if (existing) existing.authorIds.push(userId)
    else groups.set(key, { text, authorIds: [userId] })
  }

  // Canonical order: sort lie groups by normalized key so id assignment is
  // deterministic regardless of submission order, then assign ids.
  const lieOptions: AnswerOption[] = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, g], i) => ({
      id: `lie-${i}`,
      text: g.text,
      isTruth: false,
      authorIds: g.authorIds,
    }))

  const truthOption: AnswerOption = {
    id: TRUTH_ID,
    text: question.answer,
    isTruth: true,
    authorIds: [],
  }

  return seededShuffle([...lieOptions, truthOption], hashString(seed))
}

export { TRUTH_ID }
