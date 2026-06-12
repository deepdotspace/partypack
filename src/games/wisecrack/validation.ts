/**
 * Answer validation (the only submission guard — comedy has no "truth" to match
 * against, unlike Baloney). Empty or over-long answers are rejected; the client
 * surfaces the reason. A timed-out player gets a safety quip instead (engine).
 */
import { MAX_ANSWER_LEN } from './types'

export type ValidationResult = { ok: true; text: string } | { ok: false; reason: 'EMPTY' | 'LONG' }

export function validateAnswer(raw: string): ValidationResult {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (text.length === 0) return { ok: false, reason: 'EMPTY' }
  if (text.length > MAX_ANSWER_LEN) return { ok: false, reason: 'LONG' }
  return { ok: true, text }
}

export const SAFETY_QUIP = '(no answer)'
