import { describe, expect, it } from 'vitest'
import { initialState, reduce, type WisecrackCtx } from './engine'
import { MAX_BOTS, MAX_PLAYERS, type GameState, type Prompt, type RawInput } from './types'

function pool(n: number): Prompt[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    text: `Prompt ${i}: ___`,
    tags: [],
    safety: 'clean' as const,
  }))
}

const PROMPTS = pool(30)

function step(state: GameState, inputs: RawInput[], now: number): GameState {
  const ctx: WisecrackCtx = { now, connected: [], content: PROMPTS }
  return reduce(state, inputs, ctx) ?? state
}

function join(state: GameState, ids: string[], now: number): GameState {
  return step(
    state,
    ids.map((userId) => ({ userId, action: 'JOIN', data: { name: userId.toUpperCase(), cid: `cid-${userId}` } })),
    now,
  )
}

/** Drive a started game to PODIUM, always making author[0] sweep each matchup. */
function driveToPodium(start: GameState): GameState {
  let state = start
  let clock = 10_000
  let guard = 0
  while (state.phase !== 'PODIUM' && guard++ < 300) {
    clock += 100
    if (state.phase === 'WRITE' || state.phase === 'FINAL_WRITE') {
      const inputs: RawInput[] = []
      for (const m of state.matchups)
        for (const a of m.authorIds)
          inputs.push({ userId: a, action: 'SUBMIT_ANSWER', data: { matchupId: m.id, text: `${a}:${m.id}` } })
      state = step(state, inputs, clock)
    } else if (state.phase === 'VOTE') {
      const m = state.matchups[state.voteIndex]
      const voters = state.order.filter((p) => !m.authorIds.includes(p))
      state = step(
        state,
        voters.map((v) => ({ userId: v, action: 'VOTE', data: { matchupId: m.id, authorId: m.authorIds[0] } })),
        clock,
      )
    } else if (state.phase === 'FINAL_VOTE') {
      const m = state.matchups[0]
      const inputs: RawInput[] = []
      for (const v of state.order) {
        const targets = m.authorIds.filter((a) => a !== v)
        for (let i = 0; i < state.config.finalVotes; i++)
          inputs.push({ userId: v, action: 'VOTE', data: { matchupId: m.id, authorId: targets[i % targets.length] } })
      }
      state = step(state, inputs, clock)
    } else {
      // timed-only phase: jump past the deadline
      const now = (state.phaseEndsAt ?? clock) + 1
      clock = now
      state = step(state, [], now)
    }
  }
  return state
}

describe('engine — lobby & host authority', () => {
  it('initial state is a wisecrack LOBBY (spine fields present)', () => {
    const s = initialState(1)
    expect(s.game).toBe('wisecrack')
    expect(s.phase).toBe('LOBBY')
    expect(s.registryId).toBeNull()
  })

  it('first player to JOIN becomes host; players get distinct colors', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    expect(s.hostUserId).toBe('p0')
    expect(s.order).toEqual(['p0', 'p1', 'p2'])
    const colors = s.order.map((id) => s.players[id].color)
    expect(new Set(colors).size).toBe(3)
  })

  it('rejects START_GAME from a non-host', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p1', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('LOBBY')
  })

  it('rejects START_GAME with fewer than 3 players', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('LOBBY')
  })

  it('host START_GAME with ≥3 players enters INTRO and assigns matchups', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('INTRO')
    // 3 players × 2 prompts / 2 = 3 matchups, each with 2 distinct authors
    expect(s.matchups).toHaveLength(3)
    for (const m of s.matchups) {
      expect(m.authorIds).toHaveLength(2)
      expect(m.authorIds[0]).not.toBe(m.authorIds[1])
      expect(m.promptText).toMatch(/Prompt/)
    }
  })

  it('captures the room code from the first JOIN that carries one (and ignores a `game` field)', () => {
    let s = initialState(1)
    s = step(
      s,
      [{ userId: 'p0', action: 'JOIN', data: { name: 'P0', cid: 'cid-p0', roomCode: 'abcd', game: 'wisecrack' } }],
      1000,
    )
    expect(s.roomCode).toBe('ABCD')
    expect(s.players['p0']).toBeDefined()
  })
})

describe('engine — write phase', () => {
  it('fills safety quips for players who time out', () => {
    let s = initialState(2)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    // INTRO → WRITE by timer
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    expect(s.phase).toBe('WRITE')
    // only p0 answers their matchups; everyone else times out
    const inputs: RawInput[] = []
    for (const m of s.matchups)
      if (m.authorIds.includes('p0'))
        inputs.push({ userId: 'p0', action: 'SUBMIT_ANSWER', data: { matchupId: m.id, text: 'real answer' } })
    s = step(s, inputs, 2000)
    // force the write timer to expire → safety fill + advance to VOTE
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    expect(['VOTE', 'REVEAL']).toContain(s.phase)
    // every matchup has 2 answers; timed-out ones are safety quips
    for (const m of s.matchups) {
      expect(Object.keys(m.answers)).toHaveLength(2)
      for (const a of m.authorIds) expect(m.answers[a].length).toBeGreaterThan(0)
    }
  })
})

describe('engine — full game to podium', () => {
  it('plays 3 rounds end-to-end, scores, and names a winner', () => {
    let s = initialState(5)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = driveToPodium(s)

    expect(s.phase).toBe('PODIUM')
    expect(s.winnerUserId).not.toBeNull()
    // someone scored (author[0] swept matchups)
    const totalScore = Object.values(s.players).reduce((sum, p) => sum + p.score, 0)
    expect(totalScore).toBeGreaterThan(0)
    // summary persisted for the recap card
    expect(s.summary).not.toBeNull()
    expect(s.summary!.standings).toHaveLength(3)
    expect(s.summary!.standings[0].score).toBeGreaterThanOrEqual(s.summary!.standings[1].score)
    expect(s.summary!.topMatchup).not.toBeNull()
  })

  it('host can SKIP to force a transition', () => {
    let s = initialState(9)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('INTRO')
    s = step(s, [{ userId: 'p0', action: 'SKIP' }], 1100)
    expect(s.phase).toBe('WRITE')
  })

  it('PLAY_AGAIN from the host resets to a fresh lobby keeping players', () => {
    let s = initialState(3)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = driveToPodium(s)
    expect(s.phase).toBe('PODIUM')
    s = step(s, [{ userId: 'p0', action: 'PLAY_AGAIN' }], 999_999)
    expect(s.phase).toBe('LOBBY')
    expect(s.order).toHaveLength(3)
    expect(Object.values(s.players).every((p) => p.score === 0)).toBe(true)
  })
})

describe('engine — host handoff on disconnect', () => {
  function ctx(connected: string[]): WisecrackCtx {
    return { now: 2000, connected, content: PROMPTS }
  }
  it('reassigns the host to the next connected seat when the host drops', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    expect(s.hostUserId).toBe('p0')
    // p0 disconnects → host passes to p1
    s = reduce(s, [], ctx(['p1', 'p2'])) ?? s
    expect(s.hostUserId).toBe('p1')
  })
  it('keeps the host while they remain connected', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = reduce(s, [], ctx(['p0', 'p1', 'p2'])) ?? s
    expect(s.hostUserId).toBe('p0')
  })
})

describe('engine — roles, kick, audience', () => {
  it('first joiner is host, others are contestants; cid is stored', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    expect(s.players['p0'].role).toBe('host')
    expect(s.players['p1'].role).toBe('contestant')
    expect(s.players['p0'].cid).toBe('cid-p0')
  })

  it('a player who joins mid-game becomes a spectator (not seated, cannot submit)', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = step(s, [{ userId: 'spec', action: 'JOIN', data: { name: 'Spec', cid: 'cid-spec' } }], 1100)
    expect(s.players['spec'].role).toBe('spectator')
    expect(s.order).not.toContain('spec')
    // spectator can't submit an answer
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // → WRITE
    const before = JSON.stringify(s.matchups)
    s = step(s, [{ userId: 'spec', action: 'SUBMIT_ANSWER', data: { matchupId: s.matchups[0]?.id, text: 'nope' } }], 5000)
    expect(JSON.stringify(s.matchups)).toBe(before)
  })

  it('host can kick in the lobby; non-host cannot', () => {
    let s = initialState(2)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p1', action: 'KICK', data: { targetUserId: 'p2' } }], 1000)
    expect(s.players['p2']).toBeDefined() // non-host kick rejected
    s = step(s, [{ userId: 'p0', action: 'KICK', data: { targetUserId: 'p2' } }], 1000)
    expect(s.players['p2']).toBeUndefined()
    expect(s.order).not.toContain('p2')
  })
})

describe('engine — reconnect (cid rebind)', () => {
  it('a mid-game refresh (new connection id, same cid) keeps the seat, not a new orphan', () => {
    let s = initialState(11)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    const orderBefore = [...s.order]
    // p1 refreshes: same cid, brand-new server connection id.
    s = step(s, [{ userId: 'p1b', action: 'JOIN', data: { name: 'P1', cid: 'cid-p1' } }], 1100)
    expect(s.players['p1']).toBeUndefined() // old seat removed
    expect(s.players['p1b']).toBeDefined() // rebound onto the new id
    expect(s.order).toEqual(orderBefore.map((id) => (id === 'p1' ? 'p1b' : id))) // same position
    expect(s.order).toHaveLength(3) // NOT a 4th orphaned seat
    expect(s.players['p1b'].role).toBe('contestant')
    // in-flight matchup authorship is remapped to the new id
    expect(s.matchups.some((m) => m.authorIds.includes('p1'))).toBe(false)
  })

  it('a host refresh rebinds the host bit to the new connection id', () => {
    let s = initialState(11)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0b', action: 'JOIN', data: { name: 'P0', cid: 'cid-p0' } }], 1100)
    expect(s.hostUserId).toBe('p0b')
    expect(s.order[0]).toBe('p0b')
    expect(s.order).toHaveLength(3)
  })
})

describe('engine — "bit of the night" spans all rounds', () => {
  it('picks a scored earlier-round matchup when the final got no votes', () => {
    let s = initialState(7)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
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
      } else {
        // FINAL_VOTE lands here too → everyone abstains, the final scores zero votes.
        const now = (s.phaseEndsAt ?? clock) + 1
        clock = now
        s = step(s, [], now)
      }
    }
    expect(s.phase).toBe('PODIUM')
    const top = s.summary!.topMatchup
    expect(top).not.toBeNull()
    // Came from a real earlier round (votes > 0), not the zero-vote final.
    expect(top!.answers.reduce((n, a) => n + a.votes, 0)).toBeGreaterThan(0)
  })
})

describe('engine — PLAY_AGAIN seat cap', () => {
  it('promotes lingering spectators but never past the seat cap', () => {
    let s = initialState(13)
    const contestants = Array.from({ length: MAX_PLAYERS }, (_, i) => `c${i}`)
    s = join(s, contestants, 1000)
    expect(s.order).toHaveLength(MAX_PLAYERS)
    s = step(s, [{ userId: contestants[0], action: 'START_GAME' }], 1000)
    // two latecomers become spectators (room already full)
    s = step(
      s,
      [
        { userId: 's0', action: 'JOIN', data: { name: 'S0', cid: 'cid-s0' } },
        { userId: 's1', action: 'JOIN', data: { name: 'S1', cid: 'cid-s1' } },
      ],
      1100,
    )
    expect(s.players['s0'].role).toBe('spectator')
    s = driveToPodium(s)
    s = step(s, [{ userId: contestants[0], action: 'PLAY_AGAIN' }], 999_999)
    expect(s.phase).toBe('LOBBY')
    expect(s.order).toHaveLength(MAX_PLAYERS) // capped — spectators NOT seated
    expect(s.players['s0'].role).toBe('spectator')
  })
})

describe('engine — bots', () => {
  it('host can add a bot; it is seated with a persona + name and is flagged isBot', () => {
    let s = initialState(21)
    s = join(s, ['p0'], 1000) // solo host
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1100)
    const bots = Object.values(s.players).filter((p) => p.isBot)
    expect(bots).toHaveLength(1)
    expect(bots[0].persona).toBeTruthy()
    expect(bots[0].name.length).toBeGreaterThan(0)
    expect(s.order).toContain(bots[0].userId)
  })

  it('non-host cannot add bots; ADD_BOT is lobby-only', () => {
    let s = initialState(21)
    s = join(s, ['p0', 'p1'], 1000)
    s = step(s, [{ userId: 'p1', action: 'ADD_BOT' }], 1100)
    expect(Object.values(s.players).some((p) => p.isBot)).toBe(false)
  })

  it('a solo host can fill with bots and start (bots count toward the 3-player floor)', () => {
    let s = initialState(21)
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }, { userId: 'p0', action: 'ADD_BOT' }], 1100)
    expect(s.order).toHaveLength(3) // host + 2 bots
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    expect(s.phase).toBe('INTRO')
  })

  it('adding bots never exceeds MAX_BOTS (spend Guard 4); personas stay distinct', () => {
    let s = initialState(21)
    s = join(s, ['p0'], 1000)
    for (let i = 0; i < 10; i++) s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1100 + i)
    const bots = Object.values(s.players).filter((p) => p.isBot)
    expect(bots).toHaveLength(MAX_BOTS) // capped at 3, NOT the 8-player seat cap
    expect(s.order).toHaveLength(1 + MAX_BOTS)
    const personas = bots.map((b) => b.persona)
    expect(new Set(personas).size).toBe(MAX_BOTS) // 3 bots, 3 distinct personas
  })

  it('host can remove a specific bot', () => {
    let s = initialState(21)
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1100)
    const botId = Object.values(s.players).find((p) => p.isBot)!.userId
    s = step(s, [{ userId: 'p0', action: 'REMOVE_BOT', data: { targetUserId: botId } }], 1200)
    expect(s.players[botId]).toBeUndefined()
    expect(s.order).not.toContain(botId)
  })
})

describe('engine — chat & emotes', () => {
  it('CHAT appends a sanitized line with author identity, then rate-limits', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'CHAT', data: { text: '  hello  shit ' } }], 2000)
    expect(s.chat).toHaveLength(1)
    expect(s.chat[0].text).toBe('hello s***')
    expect(s.chat[0].name).toBe('P0')
    // within the interval → dropped
    s = step(s, [{ userId: 'p0', action: 'CHAT', data: { text: 'again' } }], 2100)
    expect(s.chat).toHaveLength(1)
    // after the interval → accepted
    s = step(s, [{ userId: 'p0', action: 'CHAT', data: { text: 'again' } }], 9000)
    expect(s.chat).toHaveLength(2)
  })

  it('EMOTE only accepts an allowed emoji', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'EMOTE', data: { emoji: '🔥' } }], 2000)
    expect(s.emotes).toHaveLength(1)
    s = step(s, [{ userId: 'p0', action: 'EMOTE', data: { emoji: '<script>' } }], 4000)
    expect(s.emotes).toHaveLength(1) // rejected
  })

  it('a non-player (e.g. the Stage) cannot chat', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'stage-anon', action: 'CHAT', data: { text: 'hi' } }], 2000)
    expect(s.chat).toHaveLength(0)
  })
})

describe('engine — seat-steal guard (cids are public in broadcast state)', () => {
  it("JOIN with a CONNECTED player's cid gets its own seat — no takeover", () => {
    let s = initialState(11)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    const live: WisecrackCtx = { now: 1100, connected: ['p0', 'p1', 'p2'], content: PROMPTS }
    s = reduce(s, [{ userId: 'evil', action: 'JOIN', data: { name: 'EVIL', cid: 'cid-p1' } }], live) ?? s
    expect(s.players['p1']).toBeDefined() // victim keeps the seat
    expect(s.players['p1'].name).toBe('P1')
    expect(s.hostUserId).toBe('p0') // host bit untouchable the same way
    expect(s.players['evil']).toBeDefined() // attacker seated fresh
    expect(s.players['evil'].score).toBe(0) // no inherited score
    expect(s.order).toHaveLength(4)
  })

  it("a DISCONNECTED player's seat still rebinds (legit refresh unaffected)", () => {
    let s = initialState(11)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    const live: WisecrackCtx = { now: 1100, connected: ['p0', 'p2', 'p1b'], content: PROMPTS }
    s = reduce(s, [{ userId: 'p1b', action: 'JOIN', data: { name: 'P1', cid: 'cid-p1' } }], live) ?? s
    expect(s.players['p1']).toBeUndefined()
    expect(s.players['p1b']).toBeDefined()
    expect(s.order).toHaveLength(3)
  })
})
