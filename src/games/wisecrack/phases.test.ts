import { describe, expect, it } from 'vitest'
import { allAnswersIn, allFinalVotesIn, allVotersVoted, phaseSeconds } from './phases'
import { DEFAULT_CONFIG, type Matchup } from './types'

function m(authorIds: string[], answers: Record<string, string>, votes: Record<string, string[]> = {}): Matchup {
  return { id: 'm', promptId: 'q', promptText: 't', authorIds, answers, safety: {}, votes }
}

describe('phaseSeconds', () => {
  it('LOBBY and PODIUM have no timer', () => {
    expect(phaseSeconds('LOBBY', DEFAULT_CONFIG)).toBeNull()
    expect(phaseSeconds('PODIUM', DEFAULT_CONFIG)).toBeNull()
  })
  it('maps timed phases to config values', () => {
    expect(phaseSeconds('WRITE', DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.writeSeconds)
    expect(phaseSeconds('VOTE', DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.voteSeconds)
    expect(phaseSeconds('FINAL_REVEAL', DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.revealSeconds)
  })
})

describe('allAnswersIn', () => {
  it('false until every author of every matchup has answered', () => {
    const ms = [m(['a', 'b'], { a: 'x' }), m(['c', 'd'], { c: 'y', d: 'z' })]
    expect(allAnswersIn(ms)).toBe(false)
    ms[0].answers.b = 'w'
    expect(allAnswersIn(ms)).toBe(true)
  })
  it('treats blank answers as missing', () => {
    expect(allAnswersIn([m(['a', 'b'], { a: 'x', b: '  ' })])).toBe(false)
  })
})

describe('allVotersVoted', () => {
  const players = ['a', 'b', 'c', 'd']
  it('false until all non-authors vote', () => {
    const mm = m(['a', 'b'], { a: 'x', b: 'y' }, { c: ['a'] })
    expect(allVotersVoted(mm, players)).toBe(false)
    mm.votes.d = ['b']
    expect(allVotersVoted(mm, players)).toBe(true)
  })
  it('authors are not required to vote', () => {
    const mm = m(['a', 'b'], { a: 'x', b: 'y' }, { c: ['a'], d: ['a'] })
    expect(allVotersVoted(mm, players)).toBe(true) // a and b never vote
  })
})

describe('allFinalVotesIn', () => {
  it('waits until everyone spends all distributable votes', () => {
    const players = ['a', 'b', 'c']
    const mm = m(['a', 'b', 'c'], { a: 'A', b: 'B', c: 'C' }, { a: ['b', 'b', 'c'], b: ['a', 'c', 'c'] })
    expect(allFinalVotesIn(mm, players, 3)).toBe(false) // c hasn't voted
    mm.votes.c = ['a', 'a', 'b']
    expect(allFinalVotesIn(mm, players, 3)).toBe(true)
  })
})
