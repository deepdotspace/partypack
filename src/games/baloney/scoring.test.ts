import { describe, it, expect } from 'vitest'
import { scoreRound, roundMultiplier, TRUTH_POINTS, FOOL_POINTS } from './scoring'
import type { AnswerOption } from './types'

const options: AnswerOption[] = [
  { id: 'truth', text: 'Paris', isTruth: true, authorIds: [] },
  { id: 'lie-0', text: 'London', isTruth: false, authorIds: ['p1', 'p3'] }, // jinx
  { id: 'lie-1', text: 'Rome', isTruth: false, authorIds: ['p2'] },
]

describe('roundMultiplier', () => {
  it('is 1x for round 1, 2x for round 2, 3x for the final', () => {
    expect(roundMultiplier(0, 3)).toBe(1)
    expect(roundMultiplier(1, 3)).toBe(2)
    expect(roundMultiplier(2, 3)).toBe(3)
  })
})

describe('scoreRound', () => {
  it('awards truth-finders the truth points', () => {
    const r = scoreRound(options, { p2: 'truth' }, 1)
    expect(r.deltas.p2).toBe(TRUTH_POINTS)
  })

  it('awards lie authors per voter fooled', () => {
    // p2 fooled by London (authored by p1 & p3)
    const r = scoreRound(options, { p2: 'lie-0' }, 1)
    expect(r.deltas.p1).toBe(FOOL_POINTS) // 1 fooled
    expect(r.deltas.p3).toBe(FOOL_POINTS)
  })

  it('credits every author of a merged (jinx) lie fully', () => {
    // both p2 and a hypothetical voter pick London → 2 fooled
    const r = scoreRound(options, { p2: 'lie-0', pX: 'lie-0' }, 1)
    expect(r.deltas.p1).toBe(FOOL_POINTS * 2)
    expect(r.deltas.p3).toBe(FOOL_POINTS * 2)
  })

  it('applies the round multiplier', () => {
    const r = scoreRound(options, { p2: 'truth' }, 3)
    expect(r.deltas.p2).toBe(TRUTH_POINTS * 3)
  })

  it('identifies the best lie of the round', () => {
    const r = scoreRound(options, { p2: 'lie-0', pX: 'lie-0', pY: 'lie-1' }, 1)
    expect(r.bestLieOptionId).toBe('lie-0') // 2 votes vs 1
  })

  it('records who voted for what', () => {
    const r = scoreRound(options, { p2: 'truth', p3: 'lie-1' }, 1)
    expect(r.votesByOption['truth']).toEqual(['p2'])
    expect(r.votesByOption['lie-1']).toEqual(['p3'])
  })
})
