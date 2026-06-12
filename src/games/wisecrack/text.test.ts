import { describe, expect, it } from 'vitest'
import { normalize, sameAnswer } from './text'

describe('normalize', () => {
  it('folds case and trims', () => {
    expect(normalize('  Banana  ')).toBe('banana')
    expect(normalize('BANANA')).toBe('banana')
  })

  it('collapses internal whitespace', () => {
    expect(normalize('a   big   boat')).toBe('big boat') // leading article dropped
  })

  it('strips leading articles', () => {
    expect(normalize('The Titanic')).toBe('titanic')
    expect(normalize('a dog')).toBe('dog')
    expect(normalize('an apple')).toBe('apple')
  })

  it('strips punctuation and diacritics', () => {
    expect(normalize('Café!')).toBe('cafe')
    expect(normalize('"Hello," he said.')).toBe('hello he said')
  })

  it('returns empty string for blank-ish input', () => {
    expect(normalize('   ')).toBe('')
    expect(normalize('!!!')).toBe('')
  })
})

describe('sameAnswer (JINX detection)', () => {
  it('matches across case / punctuation / articles', () => {
    expect(sameAnswer('The Banana!', 'banana')).toBe(true)
    expect(sameAnswer('a BIG boat', 'Big Boat')).toBe(true)
  })

  it('distinguishes genuinely different answers', () => {
    expect(sameAnswer('banana', 'apple')).toBe(false)
  })

  it('two empty answers are NOT a jinx', () => {
    expect(sameAnswer('', '')).toBe(false)
    expect(sameAnswer('  ', '!!')).toBe(false)
  })
})
