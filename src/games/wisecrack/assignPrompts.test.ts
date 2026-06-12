import { describe, expect, it } from 'vitest'
import { assignPrompts, votersFor } from './assignPrompts'
import { mulberry32 } from './rng'

function players(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`)
}
function prompts(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `q${i}`)
}

describe('assignPrompts', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    for (const k of [1, 2]) {
      it(`N=${n}, k=${k}: 2 distinct authors, balanced ±1, voters correct`, () => {
        const rng = mulberry32(n * 100 + k)
        const ps = players(n)
        const matchups = assignPrompts(ps, prompts(n * k), k, rng)

        // exactly floor(N*k/2) matchups
        expect(matchups.length).toBe(Math.floor((n * k) / 2))

        // every matchup has exactly 2 distinct authors
        for (const m of matchups) {
          expect(m.authorIds).toHaveLength(2)
          expect(m.authorIds[0]).not.toBe(m.authorIds[1])
          expect(ps).toContain(m.authorIds[0])
          expect(ps).toContain(m.authorIds[1])
        }

        // authorship counts: each player k, except one player at k-1 when N*k is odd
        const counts = new Map<string, number>(ps.map((p) => [p, 0]))
        for (const m of matchups) for (const a of m.authorIds) counts.set(a, counts.get(a)! + 1)
        const vals = [...counts.values()].sort()
        if ((n * k) % 2 === 0) {
          expect(vals.every((v) => v === k)).toBe(true)
        } else {
          // exactly one player short by 1
          expect(vals.filter((v) => v === k - 1)).toHaveLength(1)
          expect(vals.filter((v) => v === k)).toHaveLength(n - 1)
        }

        // prompts are distinct and drawn from the supply
        const used = matchups.map((m) => m.promptId)
        expect(new Set(used).size).toBe(used.length)

        // voters = everyone except the 2 authors
        for (const m of matchups) {
          const voters = votersFor(m.authorIds, ps)
          expect(voters).toHaveLength(n - 2)
          for (const a of m.authorIds) expect(voters).not.toContain(a)
        }
      })
    }
  }

  it('k=2: no player is paired with the same partner twice', () => {
    const rng = mulberry32(42)
    const ps = players(6)
    const matchups = assignPrompts(ps, prompts(12), 2, rng)
    const seen = new Set<string>()
    for (const m of matchups) {
      const key = [...m.authorIds].sort().join('|')
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('is deterministic for a fixed seed', () => {
    const a = assignPrompts(players(5), prompts(10), 2, mulberry32(7))
    const b = assignPrompts(players(5), prompts(10), 2, mulberry32(7))
    expect(a).toEqual(b)
  })

  it('throws when there are not enough prompts', () => {
    expect(() => assignPrompts(players(6), prompts(2), 2, mulberry32(1))).toThrow()
  })
})
