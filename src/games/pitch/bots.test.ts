import { describe, it, expect } from 'vitest'
import {
  BOT_MAX_TOKENS,
  BOT_PERSONAS,
  buildInventUserPrompt,
  parseInvention,
  serializeInvention,
} from './bots'

describe('bots — data integrity', () => {
  it('ships exactly 8 personas with unique ids and 4-6 fallback inventions each', () => {
    expect(BOT_PERSONAS).toHaveLength(8)
    expect(new Set(BOT_PERSONAS.map((p) => p.id)).size).toBe(8)
    for (const p of BOT_PERSONAS) {
      expect(p.systemPrompt.length).toBeGreaterThan(100)
      expect(p.fallbackInventions.length).toBeGreaterThanOrEqual(4)
      expect(p.fallbackInventions.length).toBeLessThanOrEqual(6)
      // Each fallback is a usable { name, pitch } — non-empty both sides.
      for (const inv of p.fallbackInventions) {
        expect(inv.name.trim().length).toBeGreaterThan(0)
        expect(inv.pitch.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('every fallback survives the serialize → parse round-trip intact', () => {
    // The hub pipeline carries inventions as a single string; a fallback that
    // doesn't round-trip would degrade to a rejected submission.
    for (const p of BOT_PERSONAS) {
      for (const inv of p.fallbackInventions) {
        const parsed = parseInvention(serializeInvention(inv))
        expect(parsed).toEqual({ name: inv.name, pitch: inv.pitch })
      }
    }
  })

  it('buildInventUserPrompt carries the brief and only the task', () => {
    const out = buildInventUserPrompt('Invent a gadget that finds the other sock.')
    expect(out).toContain('Invent a gadget that finds the other sock.')
    expect(out).toContain('Output exactly "Name: pitch."')
  })

  it('output cap matches the original Pitch (96 — a name + one-line pitch)', () => {
    expect(BOT_MAX_TOKENS).toBe(96)
  })
})

describe('parseInvention — split AI text into name + pitch', () => {
  it('splits on an em dash (the prompted format)', () => {
    expect(parseInvention('SockHarbor — a dock where socks come home.')).toEqual({
      name: 'SockHarbor',
      pitch: 'a dock where socks come home.',
    })
  })

  it('splits on a plain hyphen with spaces', () => {
    expect(parseInvention('The Eventually - it just confirms you are still here.')).toEqual({
      name: 'The Eventually',
      pitch: 'it just confirms you are still here.',
    })
  })

  it('splits on a colon', () => {
    expect(parseInvention('Momentum.ai: scalable downtime as a service.')).toEqual({
      name: 'Momentum.ai',
      pitch: 'scalable downtime as a service.',
    })
  })

  it('splits on the first newline when there is no dash', () => {
    expect(parseInvention('Echo Jar\nbottles your best shower ideas.')).toEqual({
      name: 'Echo Jar',
      pitch: 'bottles your best shower ideas.',
    })
  })

  it('only splits on the FIRST separator (pitch may contain dashes)', () => {
    const r = parseInvention('GripMaster — folds a sheet — perfectly, every time.')
    expect(r?.name).toBe('GripMaster')
    expect(r?.pitch).toBe('folds a sheet — perfectly, every time.')
  })

  it('strips surrounding quotes from both sides', () => {
    expect(parseInvention('"SockHarbor" — "it brings them home."')).toEqual({
      name: 'SockHarbor',
      pitch: 'it brings them home.',
    })
  })

  it('returns null on empty, separator-less, or one-sided text', () => {
    expect(parseInvention('')).toBeNull()
    expect(parseInvention('   ')).toBeNull()
    expect(parseInvention('JustAName')).toBeNull() // no separator → fallback
    expect(parseInvention('— only a pitch')).toBeNull() // empty name
    expect(parseInvention('OnlyAName — ')).toBeNull() // empty pitch
  })
})
