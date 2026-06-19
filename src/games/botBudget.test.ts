import { describe, expect, it } from 'vitest'
import { hasSeatedHuman, tryReserve } from './botBudget'

describe('hasSeatedHuman (Guard 5 — bots only spend when a human is playing)', () => {
  const players = {
    h: { isBot: false }, // human seat
    b: { isBot: true }, // bot seat
  }

  it('true when a seated human is connected', () => {
    expect(hasSeatedHuman(['h', 'b'], players, new Set(['h']))).toBe(true)
  })

  it('false when only bots are seated (even if connected ids exist)', () => {
    // The only connected id is a Stage (not seated in `order`); bots never count.
    expect(hasSeatedHuman(['b'], players, new Set(['stage', 'b']))).toBe(false)
  })

  it('false when the human seat is NOT connected (ghost) — only bots/stage remain', () => {
    expect(hasSeatedHuman(['h', 'b'], players, new Set(['stage', 'b']))).toBe(false)
  })

  it('false for an empty room', () => {
    expect(hasSeatedHuman([], players, new Set(['stage']))).toBe(false)
  })
})

describe('tryReserve (daily bot budget — reserves per attempt)', () => {
  it('allows under cap and rolls the day forward', () => {
    expect(tryReserve(undefined, 'd1', 1, 5)).toEqual({ cell: { day: 'd1', used: 1 }, allowed: true })
    expect(tryReserve({ day: 'd1', used: 4 }, 'd1', 1, 5)).toEqual({ cell: { day: 'd1', used: 5 }, allowed: true })
  })

  it('denies when adding n would exceed the cap (used unchanged)', () => {
    expect(tryReserve({ day: 'd1', used: 5 }, 'd1', 1, 5)).toEqual({ cell: { day: 'd1', used: 5 }, allowed: false })
  })

  it('resets used to 0 on a new UTC day', () => {
    expect(tryReserve({ day: 'd1', used: 5 }, 'd2', 1, 5)).toEqual({ cell: { day: 'd2', used: 1 }, allowed: true })
  })
})
