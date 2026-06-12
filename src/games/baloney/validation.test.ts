import { describe, it, expect } from 'vitest'
import { validateLie, MAX_LIE_LENGTH } from './validation'
import type { Question } from './types'

const q: Question = {
  id: 'q1',
  category: 'Geography',
  difficulty: 'easy',
  prompt: 'The capital of France is ___.',
  answer: 'Paris',
  acceptableAnswers: ['Paris, France'],
  forbiddenAnswers: ['your mom', 'idk'],
}

describe('validateLie', () => {
  it('accepts a plausible lie', () => {
    expect(validateLie('London', q)).toBeNull()
  })
  it('rejects empty / whitespace', () => {
    expect(validateLie('', q)).toBe('EMPTY')
    expect(validateLie('   ', q)).toBe('EMPTY')
  })
  it('rejects overly long answers', () => {
    expect(validateLie('x'.repeat(MAX_LIE_LENGTH + 1), q)).toBe('TOO_LONG')
  })
  it('rejects the truth (and variants, case/article-insensitive)', () => {
    expect(validateLie('Paris', q)).toBe('TRUTH')
    expect(validateLie('  paris ', q)).toBe('TRUTH')
    expect(validateLie('paris, france', q)).toBe('TRUTH')
  })
  it('rejects forbidden answers', () => {
    expect(validateLie('IDK', q)).toBe('FORBIDDEN')
    expect(validateLie('your mom!', q)).toBe('FORBIDDEN')
  })
  it('rejects resubmitting your own identical lie', () => {
    expect(validateLie('London', q, 'london')).toBe('DUPLICATE_OWN')
  })
  it('allows changing your lie to something new', () => {
    expect(validateLie('Berlin', q, 'london')).toBeNull()
  })
})
