/**
 * GameEngine-contract tests for the baloney module: recap timing, registry
 * listing/delisting, DO-managed field carry-through, and the declarative bot
 * hooks (incl. the rejected-lie re-roll loop and validity pre-screening).
 */
import { describe, expect, it } from 'vitest'
import { baloneyEngine } from './index'
import { initialState, reduce, type BaloneyCtx } from './engine'
import type { RawInput } from '../spine'
import { QUESTION_POOL } from './content/questions'
import { BOT_PERSONAS } from './personas'
import { MAX_BOTS, type GameState, type Question } from './types'

const CONTENT = baloneyEngine.content as Question[]

function ctx(now: number, connected: string[] = []): BaloneyCtx {
  return { now, connected, content: CONTENT }
}

function step(state: GameState, inputs: RawInput[], now: number, connected: string[] = []): GameState {
  return reduce(state, inputs, ctx(now, connected)) ?? state
}

function lobby3(seed = 1, totalRounds = 1): GameState {
  let s = initialState(seed, { totalRounds })
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

const lie = (userId: string, text: string): RawInput => ({ userId, action: 'SUBMIT_LIE', data: { text } })

/** Drive a started game to PODIUM with everyone lying and voting. */
function driveToPodium(start: GameState): GameState {
  let s = start
  let clock = 10_000
  let guard = 0
  while (s.phase !== 'PODIUM' && guard++ < 300) {
    clock += 100
    if (s.phase === 'WRITE') {
      s = step(s, s.order.map((id, i) => lie(id, `Decoy ${i} round ${s.roundIndex}`)), clock)
    } else if (s.phase === 'VOTE') {
      const inputs: RawInput[] = []
      for (const id of s.order) {
        const pick = s.options.find((o) => !o.authorIds.includes(id))
        if (pick) inputs.push({ userId: id, action: 'VOTE', data: { optionId: pick.id } })
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

describe('baloneyEngine.content', () => {
  it('ships the full four-pack question pool with unique ids', () => {
    expect(CONTENT.length).toBeGreaterThanOrEqual(40)
    expect(new Set(CONTENT.map((q) => q.id)).size).toBe(CONTENT.length)
    for (const q of CONTENT) {
      expect(q.prompt).toContain('___')
      expect(q.answer.length).toBeGreaterThan(0)
    }
  })
})

describe('baloneyEngine.recap', () => {
  it('is null before PODIUM (lobby and mid-game)', () => {
    let s = lobby3()
    expect(baloneyEngine.recap(s)).toBeNull()
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('INTRO')
    expect(baloneyEngine.recap(s)).toBeNull()
  })

  it('reports the winner + payload (standings + best baloney) at PODIUM', () => {
    let s = lobby3(5)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = driveToPodium(s)
    expect(s.phase).toBe('PODIUM')
    const rec = baloneyEngine.recap(s)
    expect(rec).not.toBeNull()
    const top = s.summary!.standings[0]
    expect(rec!.winnerName).toBe(top.name)
    expect(rec!.winnerColor).toBe(top.color)
    expect(rec!.winnerScore).toBe(top.score)
    const payload = JSON.parse(rec!.payload) as {
      standings: { name: string; color: string; score: number }[]
      bestLie: { text: string; fooled: number } | null
    }
    expect(payload.standings).toHaveLength(3)
    expect(payload.standings[0].name).toBe(top.name)
    expect(payload.bestLie).not.toBeNull() // everyone got fooled in the driver
    expect(payload.bestLie!.fooled).toBeGreaterThan(0)
  })
})

describe('baloneyEngine.registryRow', () => {
  function publicLobby(): GameState {
    let s = lobby3()
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { isPublic: true } }], 1100, ['p0', 'p1', 'p2'])
    return s
  }

  it('lists a public open lobby with a connected seated player', () => {
    const s = publicLobby()
    expect(baloneyEngine.registryRow(s, ['p0', 'p1', 'p2'])).toEqual({ name: 'P0', playerCount: 3 })
  })

  it('playerCount counts only LIVE connected humans, not ghost (disconnected) seats', () => {
    const s = publicLobby() // 3 seated
    expect(baloneyEngine.registryRow(s, ['p0'])).toEqual({ name: 'P0', playerCount: 1 })
  })

  it('delists when `connected` excludes all seated players', () => {
    const s = publicLobby()
    expect(baloneyEngine.registryRow(s, [])).toBeNull()
    expect(baloneyEngine.registryRow(s, ['someone-else'])).toBeNull()
  })

  it('never lists a private lobby or a started game', () => {
    let s = lobby3()
    expect(baloneyEngine.registryRow(s, ['p0'])).toBeNull() // isPublic defaults false
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { isPublic: true } }], 1100, ['p0', 'p1', 'p2'])
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200, ['p0', 'p1', 'p2'])
    expect(s.phase).toBe('INTRO')
    expect(baloneyEngine.registryRow(s, ['p0', 'p1', 'p2'])).toBeNull()
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

describe('baloneyEngine.bots', () => {
  function writePhaseWithBots(): GameState {
    let s = lobby3(21)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }, { userId: 'p0', action: 'ADD_BOT' }], 1100)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // INTRO → PROMPT
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // PROMPT → WRITE
    expect(s.phase).toBe('WRITE')
    return s
  }

  it('needsGeneration: one task per bot, persona + the question prompt as task', () => {
    const s = writePhaseWithBots()
    const tasks = baloneyEngine.bots!.needsGeneration(s)
    const botIds = s.order.filter((id) => s.players[id]?.isBot)
    expect(tasks.map((t) => t.botId).sort()).toEqual([...botIds].sort())
    for (const t of tasks) {
      expect(t.persona).toBeTruthy()
      expect(t.task).toBe(s.question!.prompt)
    }
  })

  it('submitInput folds back as a SUBMIT_LIE the reducer accepts, clearing the task', () => {
    let s = writePhaseWithBots()
    const [t] = baloneyEngine.bots!.needsGeneration(s)
    const inp = baloneyEngine.bots!.submitInput(t.botId, 'a damp pigeon', s)
    expect(inp.action).toBe('SUBMIT_LIE')
    s = step(s, [{ userId: t.botId, action: inp.action, data: inp.data as Record<string, unknown> }], 2000)
    expect(s.lies[t.botId]).toBe('a damp pigeon')
    expect(baloneyEngine.bots!.needsGeneration(s).some((x) => x.botId === t.botId)).toBe(false)
  })

  it('the re-roll loop: a truth-matching bot lie is rejected and the bot re-lists', () => {
    let s = writePhaseWithBots()
    const [t] = baloneyEngine.bots!.needsGeneration(s)
    const inp = baloneyEngine.bots!.submitInput(t.botId, s.question!.answer, s)
    s = step(s, [{ userId: t.botId, action: inp.action, data: inp.data as Record<string, unknown> }], 2000)
    expect(s.lies[t.botId]).toBeUndefined()
    expect(s.rejections[t.botId]).toBe('TRUTH')
    // …so the hub sees the task again next tick and re-rolls (max 2, then fallback).
    expect(baloneyEngine.bots!.needsGeneration(s).some((x) => x.botId === t.botId)).toBe(true)
  })

  it('pickCandidate cleans model output and pre-screens truth/forbidden via validation', () => {
    const b = baloneyEngine.bots!
    const q = QUESTION_POOL.find((x) => x.id === 'b-eiffel')! // answer: Paris, forbidden: France
    expect(b.pickCandidate('"Lyon"\n', q.prompt)).toBe('Lyon')
    expect(b.pickCandidate('1. Marseille', q.prompt)).toBe('Marseille')
    expect(b.pickCandidate('Paris', q.prompt)).toBeNull() // the truth → re-roll
    expect(b.pickCandidate('paris, france!', q.prompt)).toBeNull() // acceptable variant → re-roll
    expect(b.pickCandidate('France', q.prompt)).toBeNull() // forbidden → re-roll
    expect(b.pickCandidate('', q.prompt)).toBeNull()
    expect(b.pickCandidate('x'.repeat(200), q.prompt)).toBeNull() // over MAX_LIE_LENGTH
  })

  it('fallback is a deterministic in-voice canned decoy from the persona', () => {
    const b = baloneyEngine.bots!
    const gizmo = BOT_PERSONAS.find((p) => p.id === 'gizmo')!
    const out = b.fallback('gizmo', 'Some prompt ___.')
    expect(gizmo.fallbackLies).toContain(out)
    expect(b.fallback('gizmo', 'Some prompt ___.')).toBe(out) // stable
  })

  it('buildSystemPrompt/buildUserPrompt are persona- and task-faithful', () => {
    const b = baloneyEngine.bots!
    expect(b.buildSystemPrompt('braxton', initialState(1))).toMatch(/Braxton/)
    expect(b.buildUserPrompt('A prompt: ___')).toContain('A prompt: ___')
    expect(b.buildUserPrompt('A prompt: ___')).toContain('Output only the answer')
  })

  it('heuristicVotes: bots vote a real option, never their own lie, and stop once cast', () => {
    let s = writePhaseWithBots()
    // everyone (humans + bots) lies → advances to VOTE
    s = step(s, s.order.map((id, i) => lie(id, `Decoy number ${i}`)), 3000)
    expect(s.phase).toBe('VOTE')
    const votes = baloneyEngine.bots!.heuristicVotes(s)
    const botIds = s.order.filter((id) => s.players[id]?.isBot)
    expect(votes.map((v) => v.botId).sort()).toEqual([...botIds].sort())
    for (const v of votes) {
      const data = v.data as { optionId: string }
      const option = s.options.find((o) => o.id === data.optionId)!
      expect(option).toBeDefined()
      expect(option.authorIds).not.toContain(v.botId)
      // fold it in — the reducer accepts it, and the bot stops re-voting
      s = step(s, [{ userId: v.botId, action: v.action, data: v.data as Record<string, unknown> }], 3100)
    }
    if (s.phase === 'VOTE') {
      expect(baloneyEngine.bots!.heuristicVotes(s)).toHaveLength(0)
    }
  })

  it('maxTokens matches the original baloney cap; MAX_BOTS is engine-enforced at 3', () => {
    expect(baloneyEngine.bots!.maxTokens).toBe(64)
    expect(MAX_BOTS).toBe(3)
  })
})
