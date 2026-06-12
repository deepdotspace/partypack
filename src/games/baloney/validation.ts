/**
 * Lie validation — the "Lie Detector". Pure module.
 *
 * Returns `null` if the lie is accepted, or a typed rejection reason. Duplicate
 * handling against OTHER players' lies happens at shuffle time (a merge, not a
 * rejection) — here we only catch a player duplicating their own prior lie,
 * matching the truth, hitting the forbidden list, or being empty/too long.
 */

import type { LieRejection, Question } from './types'
import { normalize } from './text'

export const MAX_LIE_LENGTH = 90

export function validateLie(
  raw: string,
  question: Question,
  /** This player's previously-accepted lie this round, if any (for re-submits). */
  ownPrevious?: string,
): LieRejection | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return 'EMPTY'
  if (trimmed.length > MAX_LIE_LENGTH) return 'TOO_LONG'

  const n = normalize(trimmed)
  if (n.length === 0) return 'EMPTY'

  // Matches the truth → reject (you can't "lie" the real answer).
  if (n === normalize(question.answer)) return 'TRUTH'
  if (question.acceptableAnswers.some((a) => normalize(a) === n)) return 'TRUTH'

  // Too-obvious / joke answers the author flagged.
  if (question.forbiddenAnswers.some((f) => normalize(f) === n)) return 'FORBIDDEN'

  // Resubmitting the exact same lie is a no-op rejection (keeps the first).
  if (ownPrevious !== undefined && normalize(ownPrevious) === n) return 'DUPLICATE_OWN'

  return null
}
