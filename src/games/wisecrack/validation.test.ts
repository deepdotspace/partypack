import { describe, expect, it } from 'vitest'
import { validateAnswer } from './validation'
import { MAX_ANSWER_LEN } from './types'

describe('validateAnswer', () => {
  it('accepts a normal answer and trims/collapses whitespace', () => {
    const r = validateAnswer('  a  giraffe  in  a  trenchcoat ')
    expect(r).toEqual({ ok: true, text: 'a giraffe in a trenchcoat' })
  })

  it('rejects empty / whitespace-only', () => {
    expect(validateAnswer('')).toEqual({ ok: false, reason: 'EMPTY' })
    expect(validateAnswer('    ')).toEqual({ ok: false, reason: 'EMPTY' })
  })

  it('rejects answers over the length cap', () => {
    const long = 'x'.repeat(MAX_ANSWER_LEN + 1)
    expect(validateAnswer(long)).toEqual({ ok: false, reason: 'LONG' })
  })

  it('accepts an answer exactly at the cap', () => {
    const exact = 'x'.repeat(MAX_ANSWER_LEN)
    expect(validateAnswer(exact)).toEqual({ ok: true, text: exact })
  })
})
