/**
 * Pack loading. Bundles first-party packs and exposes a stable, deterministic
 * prompt pool. Stable ordering (by id) matters: the engine recomputes
 * shuffle(pool, seed) each draw, so the input order must not vary.
 *
 * The hub passes `getPromptPool(true)` (the FULL pool, spicy included) as the
 * engine's static `content`; reduce derives the active pool from
 * `config.allowSpicy` per draw. `getPromptPool(false)` stays available for
 * tests / credits UI.
 */
import type { Prompt } from '../types'
import type { Pack } from './pack-schema'
import core from './packs/wisecrack-core.json'
import spicy from './packs/wisecrack-spicy.json'

const PACKS: Pack[] = [core as Pack, spicy as Pack]

/** The prompt pool, filtered by the spicy toggle, in stable (id-sorted) order. */
export function getPromptPool(allowSpicy = false): Prompt[] {
  const out: Prompt[] = []
  for (const pack of PACKS) {
    for (const q of pack.prompts) {
      if (allowSpicy || q.safety === 'clean') out.push(q)
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** Pack metadata for a credits / "Sources" screen. */
export const PACK_META = PACKS.map(({ prompts, ...meta }) => ({ ...meta, count: prompts.length }))
