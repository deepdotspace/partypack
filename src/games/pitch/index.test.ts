/**
 * GameEngine-contract tests for the pitch module: recap timing, registry
 * listing/delisting, DO-managed field carry-through, the bundled brief pool,
 * and the declarative bot hooks (incl. the {name, pitch} string round-trip
 * through the hub's single-string bot pipeline).
 */
import { describe, expect, it } from 'vitest'
import { pitchEngine } from './index'
import { initialState, reduce, type PitchCtx } from './engine'
import type { RawInput } from '../spine'
import { BOT_MAX_TOKENS, parseInvention } from './bots'
import { MAX_BOTS, type Brief, type GameState } from './types'

function pool(n: number): Brief[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    prompt: `Brief ${i}: invent a thing.`,
    tag: 'gadget',
  }))
}

const CONTENT = pool(12)

function ctx(now: number, connected: string[] = []): PitchCtx {
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

const submit = (userId: string, name: string, pitch: string): RawInput => ({
  userId,
  action: 'SUBMIT',
  data: { name, pitch },
})

/** Drive a started game to PODIUM, always making p0 sweep each round. */
function driveToPodium(start: GameState): GameState {
  let s = start
  let clock = 10_000
  let guard = 0
  while (s.phase !== 'PODIUM' && guard++ < 300) {
    clock += 100
    if (s.phase === 'WRITE') {
      s = step(s, s.order.map((id) => submit(id, `${id}-co`, `${id}'s pitch`)), clock)
    } else if (s.phase === 'VOTE') {
      const target = s.options.find((o) => o.userId === 'p0')!
      const other = s.options.find((o) => o.userId !== 'p0')!
      s = step(
        s,
        s.order.map((v) => ({ userId: v, action: 'VOTE', data: { optionId: v === 'p0' ? other.id : target.id } })),
        clock,
      )
    } else {
      clock = (s.phaseEndsAt ?? clock) + 1
      s = step(s, [], clock)
    }
  }
  return s
}

describe('pitchEngine.recap', () => {
  it('is null before PODIUM (lobby and mid-game)', () => {
    let s = lobby3()
    expect(pitchEngine.recap(s)).toBeNull()
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('INTRO')
    expect(pitchEngine.recap(s)).toBeNull()
  })

  it('reports the winner + payload (incl. the winning invention) at PODIUM', () => {
    let s = lobby3(5)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = driveToPodium(s)
    expect(s.phase).toBe('PODIUM')
    const rec = pitchEngine.recap(s)
    expect(rec).not.toBeNull()
    const top = s.summary!.standings[0]
    expect(rec!.winnerName).toBe(top.name)
    expect(rec!.winnerColor).toBe(top.color)
    expect(rec!.winnerScore).toBe(top.score)
    const payload = JSON.parse(rec!.payload) as {
      standings: { name: string; color: string; score: number }[]
      topInvention: { name: string; pitch: string; byName: string; votes: number } | null
    }
    expect(payload.standings).toHaveLength(3)
    expect(payload.standings[0].name).toBe(top.name)
    // the winning invention showcase
    expect(payload.topInvention).not.toBeNull()
    expect(payload.topInvention!.byName).toBe('P0')
    expect(payload.topInvention!.name).toBe('p0-co')
    expect(payload.topInvention!.votes).toBe(2)
  })
})

describe('pitchEngine.registryRow', () => {
  function publicLobby(): GameState {
    let s = lobby3()
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { isPublic: true } }], 1100, ['p0', 'p1', 'p2'])
    return s
  }

  it('lists a public open lobby with a connected seated player', () => {
    const s = publicLobby()
    expect(pitchEngine.registryRow(s, ['p0', 'p1', 'p2'])).toEqual({ name: 'P0', playerCount: 3 })
  })

  it('delists when `connected` excludes all seated players', () => {
    const s = publicLobby()
    expect(pitchEngine.registryRow(s, [])).toBeNull()
    expect(pitchEngine.registryRow(s, ['someone-else'])).toBeNull()
  })

  it('never lists a private lobby or a started game', () => {
    let s = lobby3()
    expect(pitchEngine.registryRow(s, ['p0'])).toBeNull() // isPublic defaults false
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { isPublic: true } }], 1100, ['p0', 'p1', 'p2'])
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200, ['p0', 'p1', 'p2'])
    expect(s.phase).toBe('INTRO')
    expect(pitchEngine.registryRow(s, ['p0', 'p1', 'p2'])).toBeNull()
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

describe('pitchEngine.content', () => {
  it('bundles the full first-party brief pool with unique ids', () => {
    const briefs = pitchEngine.content as Brief[]
    expect(briefs.length).toBeGreaterThanOrEqual(50)
    expect(new Set(briefs.map((b) => b.id)).size).toBe(briefs.length)
    for (const b of briefs) {
      expect(b.prompt.length).toBeGreaterThan(10)
      expect(b.tag.length).toBeGreaterThan(0)
    }
  })
})

describe('pitchEngine.bots', () => {
  function writePhaseWithBots(): GameState {
    let s = lobby3(21)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }, { userId: 'p0', action: 'ADD_BOT' }], 1100)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // INTRO → PROMPT
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // PROMPT → WRITE
    expect(s.phase).toBe('WRITE')
    return s
  }

  it('needsGeneration: one task per bot without a submission, task = the brief text', () => {
    const s = writePhaseWithBots()
    const tasks = pitchEngine.bots!.needsGeneration(s)
    const botIds = s.order.filter((id) => s.players[id]?.isBot)
    expect(tasks.map((t) => t.botId).sort()).toEqual([...botIds].sort()) // exactly one per bot
    for (const t of tasks) {
      expect(t.persona).toBeTruthy()
      expect(t.task).toBe(s.brief!.prompt) // the brief text, not an id
    }
  })

  it('pickCandidate parses "Name — pitch" model output; null on unusable text', () => {
    const b = pitchEngine.bots!
    const picked = b.pickCandidate('  "SockHarbor" — a dock where socks come home.  ', 'task')
    expect(picked).toBe('SockHarbor — a dock where socks come home.')
    expect(b.pickCandidate('', 'task')).toBeNull()
    expect(b.pickCandidate('JustOneWord', 'task')).toBeNull() // no separator → re-roll/fallback
  })

  it('submitInput folds back as a SUBMIT with the parsed {name, pitch} the reducer accepts', () => {
    let s = writePhaseWithBots()
    const [t] = pitchEngine.bots!.needsGeneration(s)
    const inp = pitchEngine.bots!.submitInput(t.botId, 'Echo Jar — bottles your shower ideas.', s)
    expect(inp.action).toBe('SUBMIT')
    expect(inp.data).toEqual({ name: 'Echo Jar', pitch: 'bottles your shower ideas.' })
    s = step(s, [{ userId: t.botId, action: inp.action, data: inp.data as Record<string, unknown> }], 30000)
    expect(s.inventions[t.botId]).toEqual({ name: 'Echo Jar', pitch: 'bottles your shower ideas.' })
    // the satisfied bot no longer surfaces in needsGeneration
    expect(pitchEngine.bots!.needsGeneration(s).some((x) => x.botId === t.botId)).toBe(false)
  })

  it('an unusable generation is REJECTED by reduce, so the bot re-lists (hub re-roll path)', () => {
    let s = writePhaseWithBots()
    const [t] = pitchEngine.bots!.needsGeneration(s)
    const inp = pitchEngine.bots!.submitInput(t.botId, 'no separator here', s)
    s = step(s, [{ userId: t.botId, action: inp.action, data: inp.data as Record<string, unknown> }], 30000)
    expect(s.inventions[t.botId]).toBeUndefined()
    expect(pitchEngine.bots!.needsGeneration(s).some((x) => x.botId === t.botId)).toBe(true)
  })

  it('fallback is an in-voice canned invention that parses AND passes the reducer', () => {
    let s = writePhaseWithBots()
    const [t] = pitchEngine.bots!.needsGeneration(s)
    const canned = pitchEngine.bots!.fallback(t.persona, t.task)
    const inv = parseInvention(canned)
    expect(inv).not.toBeNull()
    const inp = pitchEngine.bots!.submitInput(t.botId, canned, s)
    s = step(s, [{ userId: t.botId, action: inp.action, data: inp.data as Record<string, unknown> }], 30000)
    expect(s.inventions[t.botId]).toEqual(inv) // a valid canned invention always lands
  })

  it('heuristicVotes: bots vote in VOTE, never for their own option, and stop once cast', () => {
    let s = writePhaseWithBots()
    // everyone (host + bots) submits → advances to VOTE
    s = step(s, s.order.map((id) => submit(id, `${id}-co`, `${id}'s pitch`)), 30000)
    expect(s.phase).toBe('VOTE')
    const votes = pitchEngine.bots!.heuristicVotes(s)
    const botIds = s.order.filter((id) => s.players[id]?.isBot)
    expect(votes.map((v) => v.botId).sort()).toEqual([...botIds].sort())
    for (const v of votes) {
      const data = v.data as { optionId: string }
      const option = s.options.find((o) => o.id === data.optionId)!
      expect(option).toBeDefined()
      expect(option.userId).not.toBe(v.botId) // never self
      // fold it in — the reducer accepts it, and the bot stops re-voting
      s = step(s, [{ userId: v.botId, action: v.action, data: v.data as Record<string, unknown> }], 30100)
    }
    if (s.phase === 'VOTE') {
      expect(pitchEngine.bots!.heuristicVotes(s)).toHaveLength(0)
    }
  })

  it('prompts are built server-side; maxTokens matches the original Pitch (96)', () => {
    const b = pitchEngine.bots!
    expect(b.buildSystemPrompt('gizmo', initialState(1))).toContain('Gizmo')
    expect(b.buildUserPrompt('Invent a gadget.')).toContain('Invent a gadget.')
    expect(b.maxTokens).toBe(BOT_MAX_TOKENS)
    expect(b.maxTokens).toBe(96)
  })

  it('MAX_BOTS is engine-enforced at 3', () => {
    expect(MAX_BOTS).toBe(3)
  })
})
