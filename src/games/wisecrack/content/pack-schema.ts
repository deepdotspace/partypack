/**
 * Prompt-pack schema — shared envelope shape with Baloney. A Wisecrack pack
 * carries comedic fill-in-the-blank prompts; community packs are drop-in JSON
 * files of this shape (the forkability superpower — documented in the README).
 */
import type { Prompt } from '../types'

export interface Pack {
  packId: string // stable, namespaced e.g. "wisecrack.core.v1"
  title: string
  description: string
  language: string // e.g. "en"
  license: string // governs THIS file e.g. "MIT"
  attribution: string // shown in-game credits
  sourceUrl: string | null
  authors: string[]
  isCommunity: boolean
  version: number
  prompts: Prompt[]
}

/** Runtime validation — returns a list of human-readable problems ([] = valid). */
export function validatePack(pack: unknown): string[] {
  const errors: string[] = []
  const p = pack as Partial<Pack>
  if (!p || typeof p !== 'object') return ['pack is not an object']
  for (const key of ['packId', 'title', 'license'] as const) {
    if (typeof p[key] !== 'string' || !(p[key] as string).trim()) errors.push(`missing "${key}"`)
  }
  if (!Array.isArray(p.prompts)) {
    errors.push('missing "prompts" array')
    return errors
  }
  const ids = new Set<string>()
  p.prompts.forEach((q, i) => {
    const where = `prompts[${i}]`
    if (!q || typeof q !== 'object') return errors.push(`${where} is not an object`)
    if (typeof q.id !== 'string' || !q.id.trim()) errors.push(`${where} missing id`)
    else if (ids.has(q.id)) errors.push(`${where} duplicate id "${q.id}"`)
    else ids.add(q.id)
    if (typeof q.text !== 'string' || !q.text.includes('___')) errors.push(`${where} text must contain a "___" blank`)
    if (q.safety !== 'clean' && q.safety !== 'spicy') errors.push(`${where} safety must be 'clean' | 'spicy'`)
    if (!Array.isArray(q.tags)) errors.push(`${where} tags must be an array`)
  })
  return errors
}
