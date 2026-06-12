import { describe, expect, it } from 'vitest'
import { getPromptPool, PACK_META } from './loader'
import { validatePack } from './pack-schema'
import core from './packs/wisecrack-core.json'
import spicy from './packs/wisecrack-spicy.json'

describe('content packs', () => {
  it('both packs are valid', () => {
    expect(validatePack(core)).toEqual([])
    expect(validatePack(spicy)).toEqual([])
  })

  it('ships ~60 clean prompts in a stable, de-duplicated pool', () => {
    const pool = getPromptPool(false)
    expect(pool.every((p) => p.safety === 'clean')).toBe(true)
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length)
    expect(pool.length).toBeGreaterThanOrEqual(60)
    expect(pool.map((p) => p.id)).toEqual([...pool.map((p) => p.id)].sort())
  })

  it('spicy toggle adds the after-dark prompts on top of the clean ones', () => {
    const clean = getPromptPool(false)
    const all = getPromptPool(true)
    expect(all.length).toBeGreaterThan(clean.length)
    expect(all.some((p) => p.safety === 'spicy')).toBe(true)
    // clean pool never leaks spicy content
    expect(clean.some((p) => p.safety === 'spicy')).toBe(false)
  })

  it('every prompt has a blank', () => {
    for (const p of getPromptPool(true)) expect(p.text).toContain('___')
  })

  it('reports pack metadata with a count', () => {
    expect(PACK_META[0].count).toBeGreaterThan(0)
    expect(PACK_META[0].packId).toBe('wisecrack.core.v1')
  })
})
