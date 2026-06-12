import { describe, expect, it } from 'vitest'
import { cleanChat } from './chat'
import { CHAT_MAX_LEN } from './types'

describe('cleanChat', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanChat('  hey   there  ')).toBe('hey there')
  })

  it('returns empty for blank input', () => {
    expect(cleanChat('   ')).toBe('')
    expect(cleanChat('')).toBe('')
  })

  it('caps to the max length', () => {
    expect(cleanChat('x'.repeat(CHAT_MAX_LEN + 50)).length).toBe(CHAT_MAX_LEN)
  })

  it('masks profanity at word boundaries, preserving the first letter', () => {
    expect(cleanChat('what the shit')).toBe('what the s***')
    expect(cleanChat('SHIT happens')).toBe('S*** happens')
  })

  it('does not mask substrings inside clean words', () => {
    expect(cleanChat('classic dictionary assassin')).toBe('classic dictionary assassin')
  })
})
