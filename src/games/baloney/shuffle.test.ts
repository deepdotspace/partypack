import { describe, it, expect } from 'vitest'
import { buildAnswerOptions } from './shuffle'
import type { Question } from './types'

const q: Question = {
  id: 'q1',
  category: 'Geography',
  difficulty: 'easy',
  prompt: 'The capital of France is ___.',
  answer: 'Paris',
  acceptableAnswers: [],
  forbiddenAnswers: [],
}

describe('buildAnswerOptions', () => {
  it('includes exactly one truth option carrying no authors', () => {
    const opts = buildAnswerOptions(q, { p1: 'London', p2: 'Rome' }, 'seed')
    const truths = opts.filter((o) => o.isTruth)
    expect(truths).toHaveLength(1)
    expect(truths[0].text).toBe('Paris')
    expect(truths[0].authorIds).toEqual([])
  })

  it('creates one option per distinct lie + the truth', () => {
    const opts = buildAnswerOptions(q, { p1: 'London', p2: 'Rome' }, 'seed')
    expect(opts).toHaveLength(3)
  })

  it('merges identical lies (jinx) into one option crediting both authors', () => {
    const opts = buildAnswerOptions(q, { p1: 'London', p2: 'london!', p3: 'Rome' }, 'seed')
    const lies = opts.filter((o) => !o.isTruth)
    expect(lies).toHaveLength(2)
    const london = lies.find((o) => o.text.toLowerCase().startsWith('london'))!
    expect(london.authorIds.sort()).toEqual(['p1', 'p2'])
  })

  it('drops empty lies', () => {
    const opts = buildAnswerOptions(q, { p1: '  ', p2: 'Rome' }, 'seed')
    expect(opts.filter((o) => !o.isTruth)).toHaveLength(1)
  })

  it('is deterministic for a given seed', () => {
    const a = buildAnswerOptions(q, { p1: 'London', p2: 'Rome', p3: 'Berlin' }, 'seed')
    const b = buildAnswerOptions(q, { p1: 'London', p2: 'Rome', p3: 'Berlin' }, 'seed')
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id))
    expect(a.map((o) => o.text)).toEqual(b.map((o) => o.text))
  })
})
