import { describe, it, expect } from 'vitest'
import { seededShuffle, hashString, makeRng } from './text'

describe('seededShuffle', () => {
  it('is deterministic for a given seed', () => {
    const a = seededShuffle([1, 2, 3, 4, 5], 42)
    const b = seededShuffle([1, 2, 3, 4, 5], 42)
    expect(a).toEqual(b)
  })
  it('produces a permutation (no loss, no dupes)', () => {
    const out = seededShuffle([1, 2, 3, 4, 5, 6], 7)
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('does not mutate the input', () => {
    const input = [1, 2, 3]
    seededShuffle(input, 1)
    expect(input).toEqual([1, 2, 3])
  })
})

describe('hashString / makeRng', () => {
  it('hashString is stable', () => {
    expect(hashString('paris')).toBe(hashString('paris'))
    expect(hashString('paris')).not.toBe(hashString('london'))
  })
  it('makeRng yields values in [0, 1) and is deterministic', () => {
    const r1 = makeRng(123)
    const r2 = makeRng(123)
    for (let i = 0; i < 50; i++) {
      const v = r1()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      expect(v).toBe(r2())
    }
  })
})
