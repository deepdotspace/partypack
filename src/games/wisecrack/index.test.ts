/**
 * GameEngine-contract tests for the wisecrack module: recap timing, registry
 * listing/delisting, DO-managed field carry-through, in-reduce content
 * filtering (spicy toggle), and the declarative bot hooks.
 */
import { describe, expect, it } from 'vitest'
import { wisecrackEngine } from './index'
import { initialState, reduce, type WisecrackCtx } from './engine'
import type { RawInput } from '../spine'
import { MAX_BOTS, type GameState, type Prompt } from './types'

function pool(n: number, safety: 'clean' | 'spicy' = 'clean', tag = ''): Prompt[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${safety}${tag}${i}`,
    text: `${safety.toUpperCase()} prompt ${tag}${i}: ___`,
    tags: [],
    safety,
  }))
}

const CONTENT: Prompt[] = [...pool(20, 'clean'), ...pool(20, 'spicy')].sort((a, b) =>
  a.id.localeCompare(b.id),
)

function ctx(now: number, connected: string[] = []): WisecrackCtx {
  return { now, connected, content: CONTENT }
}

function step(state: GameState, inputs: RawInput[], now: number, connected: string[] = []): GameState {
  return reduce(state, inputs, ctx(now, connected)) ?? state
}

function lobby3(seed = 1): GameState {
  let s = initialState(seed)
  s = step(
    s,
    ['p0', 'p1', 'p2'].map((userId) => ({
      userId,
      action: 'JOIN',
      data: { name: userId.toUpperCase(), cid: `cid-${userId}`, roomCode: 'WXYZ' },
    })),
    1000,
  )
  return s
}

/** Drive a started game to PODIUM, always making author[0] sweep each matchup. */
function driveToPodium(start: GameState): GameState {
  let s = start
  let clock = 10_000
  let guard = 0
  while (s.phase !== 'PODIUM' && guard++ < 300) {
    clock += 100
    if (s.phase === 'WRITE' || s.phase === 'FINAL_WRITE') {
      const inputs: RawInput[] = []
      for (const m of s.matchups)
        for (const a of m.authorIds)
          inputs.push({ userId: a, action: 'SUBMIT_ANSWER', data: { matchupId: m.id, text: `${a}:${m.id}` } })
      s = step(s, inputs, clock)
    } else if (s.phase === 'VOTE') {
      const m = s.matchups[s.voteIndex]
      const voters = s.order.filter((p) => !m.authorIds.includes(p))
      s = step(
        s,
        voters.map((v) => ({ userId: v, action: 'VOTE', data: { matchupId: m.id, authorId: m.authorIds[0] } })),
        clock,
      )
    } else if (s.phase === 'FINAL_VOTE') {
      const m = s.matchups[0]
      const inputs: RawInput[] = []
      for (const v of s.order) {
        const targets = m.authorIds.filter((a) => a !== v)
        for (let i = 0; i < s.config.finalVotes; i++)
          inputs.push({ userId: v, action: 'VOTE', data: { matchupId: m.id, authorId: targets[i % targets.length] } })
      }
      s = step(s, inputs, clock)
    } else {
      const now = (s.phaseEndsAt ?? clock) + 1
      clock = now
      s = step(s, [], now)
    }
  }
  return s
}

describe('wisecrackEngine.recap', () => {
  it('is null before PODIUM (lobby and mid-game)', () => {
    let s = lobby3()
    expect(wisecrackEngine.recap(s)).toBeNull()
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('INTRO')
    expect(wisecrackEngine.recap(s)).toBeNull()
  })

  it('reports the winner + payload at PODIUM', () => {
    let s = lobby3(5)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = driveToPodium(s)
    expect(s.phase).toBe('PODIUM')
    const rec = wisecrackEngine.recap(s)
    expect(rec).not.toBeNull()
    const top = s.summary!.standings[0]
    expect(rec!.winnerName).toBe(top.name)
    expect(rec!.winnerColor).toBe(top.color)
    expect(rec!.winnerScore).toBe(top.score)
    const payload = JSON.parse(rec!.payload) as {
      standings: { name: string; color: string; score: number }[]
      topMatchup: unknown
    }
    expect(payload.standings).toHaveLength(3)
    expect(payload.standings[0].name).toBe(top.name)
    expect(payload.topMatchup).not.toBeNull()
  })
})

describe('wisecrackEngine.registryRow', () => {
  function publicLobby(): GameState {
    let s = lobby3()
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { isPublic: true } }], 1100, ['p0', 'p1', 'p2'])
    return s
  }

  it('lists a public open lobby with a connected seated player', () => {
    const s = publicLobby()
    expect(wisecrackEngine.registryRow(s, ['p0', 'p1', 'p2'])).toEqual({ name: 'P0', playerCount: 3 })
  })

  it('delists when `connected` excludes all seated players', () => {
    const s = publicLobby()
    expect(wisecrackEngine.registryRow(s, [])).toBeNull()
    expect(wisecrackEngine.registryRow(s, ['someone-else'])).toBeNull()
  })

  it('never lists a private lobby or a started game', () => {
    let s = lobby3()
    expect(wisecrackEngine.registryRow(s, ['p0'])).toBeNull() // isPublic defaults false
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { isPublic: true } }], 1100, ['p0', 'p1', 'p2'])
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200, ['p0', 'p1', 'p2'])
    expect(s.phase).toBe('INTRO')
    expect(wisecrackEngine.registryRow(s, ['p0', 'p1', 'p2'])).toBeNull()
  })
})

describe('spine contract — DO-managed fields carried through reduce', () => {
  it('carries recapId / registryId / roomCode unchanged on every new state', () => {
    let s = lobby3()
    // Simulate the DO writing its fields onto the broadcast state.
    s = { ...s, recapId: 'rec-123', registryId: 'reg-456' }
    // An input-driven change…
    s = step(s, [{ userId: 'p3', action: 'JOIN', data: { name: 'P3', cid: 'cid-p3' } }], 5000)
    expect(s.players['p3']).toBeDefined()
    expect(s.recapId).toBe('rec-123')
    expect(s.registryId).toBe('reg-456')
    expect(s.roomCode).toBe('WXYZ')
    // …and a phase-machine change (START_GAME → INTRO).
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 6000)
    expect(s.phase).toBe('INTRO')
    expect(s.recapId).toBe('rec-123')
    expect(s.registryId).toBe('reg-456')
    // …and PLAY_AGAIN's reset never touches them either.
    let p = driveToPodium(s)
    p = step(p, [{ userId: p.hostUserId!, action: 'PLAY_AGAIN' }], 999_999)
    expect(p.phase).toBe('LOBBY')
    expect(p.recapId).toBe('rec-123') // the DO clears this at LOBBY, not the engine
    expect(p.registryId).toBe('reg-456')
  })
})

describe('content filtering inside reduce (spicy toggle)', () => {
  function drawnTexts(s: GameState): string[] {
    return Object.values(s.promptText)
  }

  it('spicy OFF (default): only clean prompts are ever drawn', () => {
    let s = lobby3(17)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = driveToPodium(s) // draws rounds 1-2 + the final
    const texts = drawnTexts(s)
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every((t) => t.startsWith('CLEAN'))).toBe(true)
  })

  it('spicy ON: the active pool includes the after-dark prompts', () => {
    // Content with a single clean prompt: any multi-prompt draw MUST hit spicy.
    const content = [...pool(1, 'clean'), ...pool(20, 'spicy')].sort((a, b) => a.id.localeCompare(b.id))
    let s = lobby3(17)
    s = reduce(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { allowSpicy: true } }], {
      now: 1100,
      connected: [],
      content,
    }) ?? s
    s = reduce(s, [{ userId: 'p0', action: 'START_GAME' }], { now: 1200, connected: [], content }) ?? s
    expect(s.phase).toBe('INTRO')
    const texts = drawnTexts(s)
    expect(texts.length).toBeGreaterThanOrEqual(3)
    expect(texts.some((t) => t.startsWith('SPICY'))).toBe(true)
  })

  it("the engine's bundled content is the FULL pool (spicy included)", () => {
    const content = wisecrackEngine.content as Prompt[]
    expect(content.some((p) => p.safety === 'spicy')).toBe(true)
    expect(content.some((p) => p.safety === 'clean')).toBe(true)
  })
})

describe('wisecrackEngine.bots', () => {
  function writePhaseWithBots(): GameState {
    let s = lobby3(21)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }, { userId: 'p0', action: 'ADD_BOT' }], 1100)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // INTRO → WRITE
    expect(s.phase).toBe('WRITE')
    return s
  }

  it('needsGeneration: one task per bot (serialized), persona + prompt text', () => {
    const s = writePhaseWithBots()
    const tasks = wisecrackEngine.bots!.needsGeneration(s)
    const botIds = s.order.filter((id) => s.players[id]?.isBot)
    expect(tasks.map((t) => t.botId).sort()).toEqual([...botIds].sort()) // exactly one per bot
    for (const t of tasks) {
      expect(t.persona).toBeTruthy()
      expect(t.task).toContain('___') // the prompt text, not a matchup id
    }
  })

  it('submitInput folds back as a valid SUBMIT_ANSWER the reducer accepts', () => {
    let s = writePhaseWithBots()
    const [t] = wisecrackEngine.bots!.needsGeneration(s)
    const inp = wisecrackEngine.bots!.submitInput(t.botId, 'a damp pigeon', s)
    expect(inp.action).toBe('SUBMIT_ANSWER')
    s = step(s, [{ userId: t.botId, action: inp.action, data: inp.data as Record<string, unknown> }], 2000)
    const m = s.matchups.find((x) => x.answers[t.botId])
    expect(m?.answers[t.botId]).toBe('a damp pigeon')
    // the answered matchup no longer surfaces; the bot's NEXT matchup does
    const again = wisecrackEngine.bots!.needsGeneration(s).filter((x) => x.botId === t.botId)
    for (const nxt of again) expect(nxt.task).not.toBe(t.task)
  })

  it('heuristicVotes: bots vote in VOTE, never for themselves, and stop once cast', () => {
    let s = writePhaseWithBots()
    // everyone answers → advances to VOTE
    const inputs: RawInput[] = []
    for (const m of s.matchups)
      for (const a of m.authorIds)
        inputs.push({ userId: a, action: 'SUBMIT_ANSWER', data: { matchupId: m.id, text: `${a}:${m.id}` } })
    s = step(s, inputs, 3000)
    expect(s.phase).toBe('VOTE')
    const m = s.matchups[s.voteIndex]
    const votes = wisecrackEngine.bots!.heuristicVotes(s)
    for (const v of votes) {
      expect(m.authorIds).not.toContain(v.botId)
      const data = v.data as { matchupId: string; authorId: string }
      expect(data.matchupId).toBe(m.id)
      expect(m.authorIds).toContain(data.authorId)
      expect(data.authorId).not.toBe(v.botId)
      // fold it in — the reducer accepts it, and the bot stops re-voting
      s = step(s, [{ userId: v.botId, action: v.action, data: data as unknown as Record<string, unknown> }], 3100)
    }
    if (s.phase === 'VOTE') {
      const after = wisecrackEngine.bots!.heuristicVotes(s)
      expect(after.filter((v) => votes.some((x) => x.botId === v.botId))).toHaveLength(0)
    }
  })

  it('fallback is a canned line; pickCandidate cleans model output; maxTokens matches wisecrack2', () => {
    const b = wisecrackEngine.bots!
    expect(b.fallback('margo', 'A prompt: ___').length).toBeGreaterThan(0)
    expect(b.pickCandidate('1. "Hurricane Greg"\n2. "Hurricane Steve"', 'A prompt: ___')).toMatch(/^Hurricane/)
    expect(b.pickCandidate('', 'A prompt: ___')).toBeNull()
    expect(b.maxTokens).toBe(90)
    expect(b.buildSystemPrompt('vex', initialState(1))).toMatch(/PG-13/)
    expect(b.buildUserPrompt('A prompt: ___')).toContain('A prompt: ___')
  })

  it('MAX_BOTS is engine-enforced at 3', () => {
    expect(MAX_BOTS).toBe(3)
  })
})
