import { describe, expect, it } from 'vitest'
import { scoreFinal, scoreMatchup } from './scoring'
import type { Matchup } from './types'

function h2h(answers: Record<string, string>, votes: Record<string, string[]>): Matchup {
  const authorIds = Object.keys(answers)
  return {
    id: 'm1',
    promptId: 'q1',
    promptText: 'The worst superpower: ___',
    authorIds,
    answers,
    safety: {},
    votes,
  }
}

describe('scoreMatchup (head-to-head)', () => {
  it('splits points by vote share', () => {
    const m = h2h({ a: 'funny', b: 'lame' }, { v1: ['a'], v2: ['a'], v3: ['a'], v4: ['b'] })
    const r = scoreMatchup(m, 0)
    expect(r.voteCounts).toEqual({ a: 3, b: 1 })
    expect(r.totalVotes).toBe(4)
    expect(r.deltas).toEqual({ a: 750, b: 250 })
    expect(r.winnerId).toBe('a')
    expect(r.quiplashAuthorId).toBeNull()
    expect(r.jinx).toBe(false)
  })

  it('applies the round-2 multiplier (2×)', () => {
    const m = h2h({ a: 'funny', b: 'lame' }, { v1: ['a'], v2: ['a'], v3: ['a'], v4: ['b'] })
    const r = scoreMatchup(m, 1)
    expect(r.deltas).toEqual({ a: 1500, b: 500 })
  })

  it('QUIPLASH sweep: 100% of votes adds the bonus', () => {
    const m = h2h({ a: 'great', b: 'meh' }, { v1: ['a'], v2: ['a'], v3: ['a'] })
    const r = scoreMatchup(m, 0)
    expect(r.quiplashAuthorId).toBe('a')
    expect(r.deltas).toEqual({ a: 1000 + 500, b: 0 }) // base 1000 + bonus 500
    expect(r.winnerId).toBe('a')
  })

  it('JINX: identical answers → nobody scores', () => {
    const m = h2h({ a: 'A Banana!', b: 'banana' }, { v1: ['a'], v2: ['b'] })
    const r = scoreMatchup(m, 0)
    expect(r.jinx).toBe(true)
    expect(r.deltas).toEqual({ a: 0, b: 0 })
    expect(r.winnerId).toBeNull()
    expect(r.quiplashAuthorId).toBeNull()
  })

  it('zero votes → no points, no winner, no sweep', () => {
    const m = h2h({ a: 'x', b: 'y' }, {})
    const r = scoreMatchup(m, 0)
    expect(r.totalVotes).toBe(0)
    expect(r.deltas).toEqual({ a: 0, b: 0 })
    expect(r.winnerId).toBeNull()
    expect(r.quiplashAuthorId).toBeNull()
  })

  it('tie → split evenly, no winner, no sweep', () => {
    const m = h2h({ a: 'x', b: 'y' }, { v1: ['a'], v2: ['b'] })
    const r = scoreMatchup(m, 0)
    expect(r.deltas).toEqual({ a: 500, b: 500 })
    expect(r.winnerId).toBeNull()
    expect(r.quiplashAuthorId).toBeNull()
  })

  it('weights audience (spectator) votes down: 1 contestant vote ties 2 spectator votes', () => {
    // a: one contestant vote (weight 1). b: two spectator votes (weight 0.5 each = 1.0).
    const m = h2h({ a: 'x', b: 'y' }, { c1: ['a'], s1: ['b'], s2: ['b'] })
    const weightOf = (vid: string) => (vid.startsWith('s') ? 0.5 : 1)
    const r = scoreMatchup(m, 0, weightOf)
    expect(r.voteCounts).toEqual({ a: 1, b: 1 })
    expect(r.winnerId).toBeNull() // a tie despite b having more raw votes
    expect(r.deltas).toEqual({ a: 500, b: 500 })
  })

  it('a sweep of only audience (spectator) votes does NOT earn the QUIPLASH bonus', () => {
    // All votes for `a`, but every voter is a spectator → no full-weight backer.
    const m = h2h({ a: 'x', b: 'y' }, { s1: ['a'], s2: ['a'] })
    const weightOf = (vid: string) => (vid.startsWith('s') ? 0.5 : 1)
    const r = scoreMatchup(m, 0, weightOf)
    expect(r.winnerId).toBe('a')
    expect(r.quiplashAuthorId).toBeNull() // swept, but only by the audience
    expect(r.deltas).toEqual({ a: 1000, b: 0 }) // full vote-share, no +500 bonus
  })

  it('a sweep with at least one contestant vote still earns the QUIPLASH bonus', () => {
    const m = h2h({ a: 'x', b: 'y' }, { c1: ['a'], s1: ['a'] })
    const weightOf = (vid: string) => (vid.startsWith('s') ? 0.5 : 1)
    const r = scoreMatchup(m, 0, weightOf)
    expect(r.quiplashAuthorId).toBe('a')
    expect(r.deltas).toEqual({ a: 1000 + 500, b: 0 })
  })
})

describe('scoreFinal (Last Lash, distributable)', () => {
  function fin(votes: Record<string, string[]>): Matchup {
    return {
      id: 'f',
      promptId: 'qf',
      promptText: 'Make a worse holiday: ___',
      authorIds: ['a', 'b', 'c'],
      answers: { a: 'A', b: 'B', c: 'C' },
      safety: {},
      votes,
    }
  }

  it('counts distributable votes (stacking allowed) and uses 3× at the final', () => {
    // roundIndex 2 → mult 3. a=5, b=3, c=1, total 9.
    const r = scoreFinal(
      fin({
        v1: ['a', 'a', 'a'],
        v2: ['a', 'a', 'b'],
        v3: ['b', 'b', 'c'],
      }),
      2,
    )
    expect(r.voteCounts).toEqual({ a: 5, b: 3, c: 1 })
    expect(r.totalVotes).toBe(9)
    expect(r.deltas).toEqual({ a: 1667, b: 1000, c: 333 })
    expect(r.winnerId).toBe('a')
    expect(r.quiplashAuthorId).toBeNull() // no sweep bonus in the final
  })

  it('a tie at the top yields no single winner', () => {
    const r = scoreFinal(fin({ v1: ['a', 'b', 'c'], v2: ['a', 'b', 'c'], v3: ['a', 'b', 'c'] }), 2)
    expect(r.voteCounts).toEqual({ a: 3, b: 3, c: 3 })
    expect(r.winnerId).toBeNull()
  })
})
