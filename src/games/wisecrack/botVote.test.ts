import { describe, expect, it } from 'vitest'
import { pickBotVote, pickBotFinalVotes } from './botVote'
import type { Matchup } from './types'

function mk(authorIds: string[], safety: Record<string, boolean> = {}): Matchup {
  return {
    id: 'm',
    promptId: 'q',
    promptText: 'x: ___',
    authorIds,
    answers: Object.fromEntries(authorIds.map((a) => [a, `${a}-ans`])),
    safety,
    votes: {},
  }
}

describe('pickBotVote', () => {
  it('never votes for itself', () => {
    const m = mk(['a', 'bot-1'])
    for (let i = 0; i < 10; i++) expect(pickBotVote(m, 'bot-1', () => i / 10)).toBe('a')
  })

  it('returns null when the bot authored both sides', () => {
    const m = mk(['bot-1', 'bot-1'])
    expect(pickBotVote(m, 'bot-1', () => 0)).toBeNull()
  })

  it('prefers a real answer over an auto-filled safety quip', () => {
    const m = mk(['a', 'b'], { a: true }) // a was auto-filled
    expect(pickBotVote(m, 'bot-1', () => 0)).toBe('b')
  })
})

describe('pickBotFinalVotes', () => {
  it('casts n votes, never for itself', () => {
    const m = mk(['a', 'b', 'bot-1'])
    const v = pickBotFinalVotes(m, 'bot-1', 3, () => 0.5)
    expect(v).toHaveLength(3)
    expect(v.every((x) => x !== 'bot-1')).toBe(true)
  })

  it('returns nothing when there is no one else to vote for', () => {
    const m = mk(['bot-1'])
    expect(pickBotFinalVotes(m, 'bot-1', 3, () => 0)).toEqual([])
  })
})
