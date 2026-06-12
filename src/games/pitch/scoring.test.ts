import { describe, it, expect } from 'vitest'
import { scoreRound, roundMultiplier, VOTE_POINTS, WINNER_BONUS } from './scoring'
import type { InventionOption } from './types'

// Canonical order is by id (inv-0 < inv-1 < inv-2). Board order is irrelevant
// to scoring; we shuffle a bit here to prove order-independence.
const options: InventionOption[] = [
  { id: 'inv-1', userId: 'p2', name: 'Rome', pitch: 'a city in a can' },
  { id: 'inv-0', userId: 'p1', name: 'London', pitch: 'fog, but cozy' },
  { id: 'inv-2', userId: 'p3', name: 'Berlin', pitch: 'techno on demand' },
]

describe('roundMultiplier', () => {
  it('is 1x for round 1, 2x for round 2, 3x for the final', () => {
    expect(roundMultiplier(0, 3)).toBe(1)
    expect(roundMultiplier(1, 3)).toBe(2)
    expect(roundMultiplier(2, 3)).toBe(3)
  })

  it('a single-round game is the final (3x)', () => {
    expect(roundMultiplier(0, 1)).toBe(3)
  })
})

describe('scoreRound', () => {
  it('awards each author per vote their invention received', () => {
    // p1's invention (inv-0) gets 2 votes, p2's (inv-1) gets 1.
    const r = scoreRound(options, { p2: 'inv-0', p3: 'inv-0', p1: 'inv-1' }, 1)
    // p1 also wins the round (most votes) → +WINNER_BONUS.
    expect(r.deltas.p1).toBe(VOTE_POINTS * 2 + WINNER_BONUS)
    expect(r.deltas.p2).toBe(VOTE_POINTS)
  })

  it('applies the round multiplier', () => {
    const r = scoreRound(options, { p2: 'inv-0' }, 3)
    // inv-0 is the sole vote-getter → p1 wins too.
    expect(r.deltas.p1).toBe(VOTE_POINTS * 3 + WINNER_BONUS * 3)
  })

  it('names the round winner (most-voted invention author)', () => {
    const r = scoreRound(options, { p2: 'inv-0', p3: 'inv-0', p1: 'inv-1' }, 1)
    expect(r.roundWinnerUserId).toBe('p1')
  })

  it('breaks a winner tie by canonical option order (lowest inv id)', () => {
    // inv-0 (p1) and inv-1 (p2) each get one vote → p1 wins on tiebreak.
    const r = scoreRound(options, { p3: 'inv-0', p1: 'inv-1' }, 1)
    expect(r.roundWinnerUserId).toBe('p1')
    expect(r.deltas.p1).toBe(VOTE_POINTS + WINNER_BONUS)
    expect(r.deltas.p2).toBe(VOTE_POINTS)
  })

  it('has no winner and no deltas when nobody voted', () => {
    const r = scoreRound(options, {}, 1)
    expect(r.roundWinnerUserId).toBeNull()
    expect(r.deltas).toEqual({})
  })

  it('records who voted for what', () => {
    const r = scoreRound(options, { p2: 'inv-0', p3: 'inv-1' }, 1)
    expect(r.votesByOption['inv-0']).toEqual(['p2'])
    expect(r.votesByOption['inv-1']).toEqual(['p3'])
  })
})
