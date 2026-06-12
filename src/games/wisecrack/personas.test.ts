import { describe, expect, it } from 'vitest'
import { PERSONAS, buildBotSystemPrompt, pickCandidate } from './personas'

describe('personas', () => {
  it('has 6 distinct personas with names + examples', () => {
    expect(PERSONAS).toHaveLength(6)
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(6)
    for (const p of PERSONAS) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.voiceRules.length).toBeGreaterThan(0)
      expect(p.examples.length).toBeGreaterThan(0)
    }
  })

  it('system prompt switches edge mode and embeds persona voice', () => {
    const clean = buildBotSystemPrompt('vex', false)
    const spicy = buildBotSystemPrompt('vex', true)
    expect(clean).toContain('Vex')
    expect(clean).toMatch(/PG-13/)
    expect(spicy).toMatch(/AFTER DARK/i)
  })
})

describe('pickCandidate', () => {
  const PROMPT = 'A rejected name for a hurricane: ___'

  it('picks one clean line from a multi-line response', () => {
    const raw = 'Hurricane Greg\nHurricane That\'s Just Bees\nHurricane Brenda From Accounting'
    const out = pickCandidate(raw, PROMPT)
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toContain('\n')
  })

  it('strips numbering and wrapping quotes', () => {
    const raw = '1. "Hurricane Greg"\n2. "Hurricane Steve"'
    const out = pickCandidate(raw, PROMPT)
    expect(out.startsWith('"')).toBe(false)
    expect(out).toMatch(/^Hurricane/)
  })

  it('rejects slop, emoji, and over-long lines', () => {
    const raw = 'As an AI, here are some options 😂\n' + 'x'.repeat(200)
    expect(pickCandidate(raw, PROMPT)).toBe('')
  })

  it('prefers a specific line (proper noun) over a generic one', () => {
    const raw = 'a storm\nHurricane Brenda From Accounting'
    expect(pickCandidate(raw, PROMPT)).toBe('Hurricane Brenda From Accounting')
  })
})
