import { describe, it, expect } from 'vitest'
import { buildInventionOptions } from './shuffle'
import type { Invention } from './types'

const inv = (name: string, pitch: string): Invention => ({ name, pitch })

describe('buildInventionOptions', () => {
  it('creates exactly one option per submitted invention', () => {
    const opts = buildInventionOptions({ p1: inv('SockLink', 'finds the other sock'), p2: inv('NapScore', 'rates your nap') }, 'seed')
    expect(opts).toHaveLength(2)
  })

  it('preserves the author, name, and pitch of each invention', () => {
    const opts = buildInventionOptions({ p1: inv('SockLink', 'finds the other sock') }, 'seed')
    expect(opts[0]).toMatchObject({ userId: 'p1', name: 'SockLink', pitch: 'finds the other sock' })
  })

  it('drops inventions with an empty name or pitch', () => {
    const opts = buildInventionOptions({ p1: inv('  ', 'no name'), p2: inv('OK', '  '), p3: inv('Good', 'and valid') }, 'seed')
    expect(opts).toHaveLength(1)
    expect(opts[0].userId).toBe('p3')
  })

  it('assigns ids in canonical author order regardless of submission order', () => {
    const a = buildInventionOptions({ p3: inv('C', 'c'), p1: inv('A', 'a'), p2: inv('B', 'b') }, 'seed')
    const byUser = Object.fromEntries(a.map((o) => [o.userId, o.id]))
    // p1 sorts first → inv-0, p2 → inv-1, p3 → inv-2.
    expect(byUser).toEqual({ p1: 'inv-0', p2: 'inv-1', p3: 'inv-2' })
  })

  it('is deterministic for a given seed', () => {
    const subs = { p1: inv('A', 'a'), p2: inv('B', 'b'), p3: inv('C', 'c') }
    const a = buildInventionOptions(subs, 'seed')
    const b = buildInventionOptions(subs, 'seed')
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id))
    expect(a.map((o) => o.userId)).toEqual(b.map((o) => o.userId))
  })
})
