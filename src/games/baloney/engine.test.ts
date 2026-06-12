/**
 * Engine tests — baloney's round logic (ported from the original's
 * engine.test.ts) re-targeted at the hub spine: JOIN-seated players, host =
 * first joiner who PLAYS (no CLAIM_HOST / non-contestant MC), spectators who
 * cannot write or vote, cid rebinding, host handoff, chat gate, bots.
 */
import { describe, expect, it } from 'vitest'
import { initialState, reduce, type BaloneyCtx } from './engine'
import { MAX_BOTS, MAX_PLAYERS, type GameState, type Question, type RawInput } from './types'

const POOL: Question[] = [
  {
    id: 'q-paris',
    category: 'Geography',
    difficulty: 'easy',
    prompt: 'The capital of France is ___.',
    answer: 'Paris',
    acceptableAnswers: ['Paris, France'],
    forbiddenAnswers: ['your mom', 'idk'],
  },
  {
    id: 'q-mars',
    category: 'Space',
    difficulty: 'easy',
    prompt: 'The red planet is ___.',
    answer: 'Mars',
    acceptableAnswers: [],
    forbiddenAnswers: ['the moon'],
  },
  {
    id: 'q-au',
    category: 'Science',
    difficulty: 'medium',
    prompt: 'The chemical symbol for gold is ___.',
    answer: 'Au',
    acceptableAnswers: [],
    forbiddenAnswers: ['gold'],
  },
]

function ctx(now: number, connected: string[] = []): BaloneyCtx {
  return { now, connected, content: POOL }
}

function step(state: GameState, inputs: RawInput[], now: number, connected: string[] = []): GameState {
  return reduce(state, inputs, ctx(now, connected)) ?? state
}

function join(state: GameState, ids: string[], now: number): GameState {
  return step(
    state,
    ids.map((userId) => ({ userId, action: 'JOIN', data: { name: userId.toUpperCase(), cid: `cid-${userId}`, roomCode: 'WXYZ' } })),
    now,
  )
}

const lie = (userId: string, text: string): RawInput => ({ userId, action: 'SUBMIT_LIE', data: { text } })
const vote = (userId: string, optionId: string): RawInput => ({ userId, action: 'VOTE', data: { optionId } })

/** Lobby with 3 seated players (p0 = host, who PLAYS). */
function lobby3(seed = 123, totalRounds = 1): GameState {
  let s = initialState(seed, { totalRounds })
  s = join(s, ['p0', 'p1', 'p2'], 1000)
  return s
}

/** Start and advance to WRITE (INTRO and PROMPT are timer-only). */
function toWrite(s: GameState): GameState {
  s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
  expect(s.phase).toBe('INTRO')
  s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // INTRO -> PROMPT
  expect(s.phase).toBe('PROMPT')
  s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // PROMPT -> WRITE
  expect(s.phase).toBe('WRITE')
  return s
}

/** Everyone lies (host included; p0 & p2 jinx on London) → auto-advance to VOTE. */
function toVote(s: GameState): GameState {
  s = toWrite(s)
  s = step(s, [lie('p0', 'London'), lie('p1', 'Rome'), lie('p2', 'London')], 20_000)
  expect(s.phase).toBe('VOTE')
  return s
}

describe('engine — lobby & host authority (host plays)', () => {
  it('initial state is a baloney LOBBY (spine fields present)', () => {
    const s = initialState(1)
    expect(s.game).toBe('baloney')
    expect(s.phase).toBe('LOBBY')
    expect(s.registryId).toBeNull()
  })

  it('first player to JOIN becomes host AND is seated as a player', () => {
    const s = lobby3()
    expect(s.hostUserId).toBe('p0')
    expect(s.order).toEqual(['p0', 'p1', 'p2']) // host occupies seat 0
    expect(s.players['p0'].role).toBe('host')
    const colors = s.order.map((id) => s.players[id].color)
    expect(new Set(colors).size).toBe(3)
  })

  it('captures the room code from the first JOIN (and ignores a `game` field)', () => {
    let s = initialState(1)
    s = step(s, [{ userId: 'p0', action: 'JOIN', data: { name: 'P0', cid: 'c0', roomCode: 'abcd', game: 'baloney' } }], 1000)
    expect(s.roomCode).toBe('ABCD')
    expect(s.players['p0']).toBeDefined()
  })

  it('rejects START_GAME from a non-host', () => {
    let s = lobby3()
    s = step(s, [{ userId: 'p1', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('LOBBY')
  })

  it('rejects START_GAME with fewer than 2 seated players', () => {
    let s = initialState(1)
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('LOBBY')
  })

  it('2 seated players (host + 1) can start — same minimum board as the original', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('INTRO')
  })

  it('host can kick in the lobby; non-host cannot; host can never be kicked', () => {
    let s = lobby3()
    s = step(s, [{ userId: 'p1', action: 'KICK', data: { targetUserId: 'p2' } }], 1100)
    expect(s.players['p2']).toBeDefined()
    s = step(s, [{ userId: 'p0', action: 'KICK', data: { targetUserId: 'p0' } }], 1100)
    expect(s.players['p0']).toBeDefined()
    s = step(s, [{ userId: 'p0', action: 'KICK', data: { targetUserId: 'p2' } }], 1100)
    expect(s.players['p2']).toBeUndefined()
    expect(s.order).not.toContain('p2')
  })

  it('SET_CONFIG clamps rounds to 1-5 and is host/lobby-only', () => {
    let s = lobby3()
    s = step(s, [{ userId: 'p1', action: 'SET_CONFIG', data: { totalRounds: 5 } }], 1100)
    expect(s.config.totalRounds).toBe(1) // non-host rejected (lobby3 sets 1)
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { totalRounds: 99 } }], 1200)
    expect(s.config.totalRounds).toBe(5) // clamped
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { totalRounds: 0 } }], 1300)
    expect(s.config.totalRounds).toBe(1) // clamped low
  })
})

describe('engine — question draw', () => {
  it('draws the round question deterministically from ctx.content with dedupe', () => {
    let a = lobby3(7, 3)
    a = step(a, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    a = step(a, [], (a.phaseEndsAt ?? 0) + 1)
    expect(a.question).not.toBeNull()
    expect(POOL.some((q) => q.id === a.question!.id)).toBe(true)
    expect(a.usedQuestionIds).toEqual([a.question!.id])

    // Same seed → same first question.
    let b = lobby3(7, 3)
    b = step(b, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    b = step(b, [], (b.phaseEndsAt ?? 0) + 1)
    expect(b.question!.id).toBe(a.question!.id)
  })

  it('never repeats a question across rounds while the pool lasts', () => {
    let s = lobby3(11, 3)
    s = driveToPodium(s)
    expect(s.phase).toBe('PODIUM')
    expect(new Set(s.usedQuestionIds).size).toBe(3) // 3 rounds, 3 distinct questions
  })
})

describe('engine — write phase (the Lie Detector)', () => {
  it('accepts a plausible lie from anyone seated, including the host', () => {
    let s = toWrite(lobby3())
    s = step(s, [lie('p0', 'London')], 20_000)
    expect(s.lies['p0']).toBe('London')
    expect(s.rejections['p0']).toBeUndefined()
  })

  it('rejects a lie that matches the truth (and records the reason)', () => {
    let s = toWrite(lobby3())
    const truth = s.question!.answer
    s = step(s, [lie('p1', truth)], 20_000)
    expect(s.rejections['p1']).toBe('TRUTH')
    expect(s.lies['p1']).toBeUndefined()
  })

  it('rejects forbidden answers and empty lies', () => {
    let s = toWrite(lobby3())
    const forbidden = s.question!.forbiddenAnswers[0]
    s = step(s, [lie('p1', forbidden)], 20_000)
    expect(s.rejections['p1']).toBe('FORBIDDEN')
    s = step(s, [lie('p1', '   ')], 20_100)
    expect(s.rejections['p1']).toBe('EMPTY')
  })

  it('a spectator cannot submit a lie', () => {
    let s = lobby3()
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = step(s, [{ userId: 'spec', action: 'JOIN', data: { name: 'Spec', cid: 'cid-spec' } }], 1100)
    expect(s.players['spec'].role).toBe('spectator')
    expect(s.order).not.toContain('spec')
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // WRITE
    s = step(s, [lie('spec', 'Berlin')], 20_000)
    expect(s.lies['spec']).toBeUndefined()
  })

  it('WRITE waits for ALL seated players, then advances early once all are in', () => {
    let s = toWrite(lobby3())
    s = step(s, [lie('p0', 'London')], 20_000)
    expect(s.phase).toBe('WRITE')
    s = step(s, [lie('p1', 'Rome')], 21_000)
    expect(s.phase).toBe('WRITE') // still waiting on p2
    s = step(s, [lie('p2', 'Berlin')], 22_000)
    expect(s.phase).toBe('VOTE')
  })

  it('WRITE timer expiry advances with only the submitted lies on the board', () => {
    let s = toWrite(lobby3())
    s = step(s, [lie('p1', 'Rome')], 20_000)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    expect(s.phase).toBe('VOTE')
    expect(s.options).toHaveLength(2) // truth + Rome (p0/p2 never submitted)
  })

  it('host SKIP forces WRITE to end early', () => {
    let s = toWrite(lobby3())
    s = step(s, [lie('p1', 'Rome'), { userId: 'p0', action: 'SKIP' }], 20_000)
    expect(s.phase).toBe('VOTE')
  })

  it('non-host SKIP is rejected', () => {
    let s = toWrite(lobby3())
    s = step(s, [{ userId: 'p1', action: 'SKIP' }], 20_000)
    expect(s.phase).toBe('WRITE')
  })
})

describe('engine — vote & board', () => {
  it('builds the answer board on entering VOTE (truth + 2 lies, jinx merged)', () => {
    const s = toVote(lobby3())
    expect(s.options).toHaveLength(3)
    const london = s.options.find((o) => o.text === 'London')!
    expect(london.authorIds.sort()).toEqual(['p0', 'p2'])
    const truth = s.options.filter((o) => o.isTruth)
    expect(truth).toHaveLength(1)
    expect(truth[0].authorIds).toEqual([])
  })

  it('cannot vote for your own (merged) lie', () => {
    let s = toVote(lobby3())
    const london = s.options.find((o) => o.text === 'London')!
    s = step(s, [vote('p0', london.id)], 25_000)
    expect(s.votes['p0']).toBeUndefined()
  })

  it('a spectator cannot vote (deliberate delta from wisecrack audience voting)', () => {
    // Spectators are minted by joining mid-game.
    let s = toVote(lobby3())
    s = step(s, [{ userId: 'late', action: 'JOIN', data: { name: 'Late', cid: 'cid-late' } }], 25_000)
    expect(s.players['late'].role).toBe('spectator')
    const truth = s.options.find((o) => o.isTruth)!
    s = step(s, [vote('late', truth.id)], 25_100)
    expect(s.votes['late']).toBeUndefined()
  })

  it('vote is single and replaceable', () => {
    let s = toVote(lobby3())
    const truth = s.options.find((o) => o.isTruth)!
    const rome = s.options.find((o) => o.text === 'Rome')!
    s = step(s, [vote('p0', rome.id)], 25_000)
    expect(s.votes['p0']).toBe(rome.id)
    s = step(s, [vote('p0', truth.id)], 25_100)
    expect(s.votes['p0']).toBe(truth.id)
  })
})

describe('engine — scoring (host plays and can win)', () => {
  it('scores the round, applies the final-round multiplier, and crowns the host', () => {
    let s = toVote(lobby3()) // totalRounds = 1 → this round is the final (3×)
    const truth = s.options.find((o) => o.isTruth)!
    const london = s.options.find((o) => o.text === 'London')!
    const rome = s.options.find((o) => o.text === 'Rome')!
    // host finds the truth; p1 fooled by London (p0+p2 jinx); p2 fooled by Rome (p1)
    s = step(s, [vote('p0', truth.id), vote('p1', london.id), vote('p2', rome.id)], 25_000)
    expect(s.phase).toBe('REVEAL')
    expect(s.players['p0'].score).toBe(3000 + 1500) // truth + fooled p1
    expect(s.players['p1'].score).toBe(1500) // Rome fooled p2
    expect(s.players['p2'].score).toBe(1500) // London (jinx) fooled p1

    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // REVEAL -> SCORE
    expect(s.phase).toBe('SCORE')
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // SCORE -> PODIUM (last round)
    expect(s.phase).toBe('PODIUM')
    expect(s.winnerUserId).toBe('p0') // the HOST won as a player
    expect(s.summary!.standings[0].userId).toBe('p0')
  })

  it('tracks the most-fooling lie across the game as "best baloney"', () => {
    let s = toVote(lobby3())
    const london = s.options.find((o) => o.text === 'London')!
    const truth = s.options.find((o) => o.isTruth)!
    // p1 falls for London (p0+p2's jinx); the others find the truth
    s = step(s, [vote('p1', london.id), vote('p0', truth.id), vote('p2', truth.id)], 25_000)
    expect(s.phase).toBe('REVEAL')
    expect(s.bestLie).not.toBeNull()
    expect(s.bestLie!.text).toBe('London')
    expect(s.bestLie!.fooled).toBe(1)
    expect(s.bestLie!.authors.map((a) => a.name).sort()).toEqual(['P0', 'P2'])
    expect(s.bestLie!.prompt).toBe(s.question!.prompt)
    // it lands in the podium summary
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    expect(s.phase).toBe('PODIUM')
    expect(s.summary!.bestLie?.text).toBe('London')
  })
})

describe('engine — host handoff & reconnect mid-round', () => {
  it('reassigns the host to the next connected seat when the host drops mid-WRITE', () => {
    let s = toWrite(lobby3())
    expect(s.hostUserId).toBe('p0')
    s = step(s, [], 20_000, ['p1', 'p2']) // p0 disconnected
    expect(s.hostUserId).toBe('p1')
    expect(s.players['p1'].role).toBe('host')
    expect(s.players['p0'].role).toBe('contestant')
    // the new host's SKIP works
    s = step(s, [{ userId: 'p1', action: 'SKIP' }], 20_100, ['p1', 'p2'])
    expect(s.phase).toBe('VOTE')
  })

  it('a mid-round refresh (new connection id, same cid) keeps the seat, lie, and vote', () => {
    let s = toVote(lobby3())
    const rome = s.options.find((o) => o.text === 'Rome')!
    s = step(s, [vote('p0', rome.id)], 25_000)
    // p0 refreshes: same cid, brand-new server connection id.
    s = step(s, [{ userId: 'p0b', action: 'JOIN', data: { name: 'P0', cid: 'cid-p0' } }], 25_100)
    expect(s.players['p0']).toBeUndefined()
    expect(s.players['p0b']).toBeDefined()
    expect(s.order).toEqual(['p0b', 'p1', 'p2'])
    expect(s.hostUserId).toBe('p0b')
    expect(s.lies['p0b']).toBe('London')
    expect(s.votes['p0b']).toBe(rome.id)
    // board authorship remapped too
    const london = s.options.find((o) => o.text === 'London')!
    expect(london.authorIds.sort()).toEqual(['p0b', 'p2'])
  })
})

describe('engine — chat & emotes', () => {
  it('CHAT works in the lobby (sanitized + rate-limited) but is OFF during WRITE/VOTE', () => {
    let s = lobby3()
    s = step(s, [{ userId: 'p0', action: 'CHAT', data: { text: '  hey   team ' } }], 2000)
    expect(s.chat).toHaveLength(1)
    expect(s.chat[0].text).toBe('hey team')
    // rate limit
    s = step(s, [{ userId: 'p0', action: 'CHAT', data: { text: 'again' } }], 2100)
    expect(s.chat).toHaveLength(1)
    // anti-collusion gate
    s = toWrite(s)
    s = step(s, [{ userId: 'p1', action: 'CHAT', data: { text: 'mine is London!' } }], 30_000)
    expect(s.chat).toHaveLength(1)
  })

  it('EMOTE only accepts an allowed emoji and stays available in every phase', () => {
    let s = toWrite(lobby3())
    s = step(s, [{ userId: 'p0', action: 'EMOTE', data: { emoji: '🔥' } }], 30_000)
    expect(s.emotes).toHaveLength(1)
    s = step(s, [{ userId: 'p0', action: 'EMOTE', data: { emoji: '<script>' } }], 40_000)
    expect(s.emotes).toHaveLength(1)
  })

  it('a non-player (e.g. the Stage) cannot chat', () => {
    let s = lobby3()
    s = step(s, [{ userId: 'stage-anon', action: 'CHAT', data: { text: 'hi' } }], 2000)
    expect(s.chat).toHaveLength(0)
  })
})

describe('engine — bots', () => {
  it('host can add a bot; it is seated with a persona + name and is flagged isBot', () => {
    let s = initialState(21)
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1100)
    const bots = Object.values(s.players).filter((p) => p.isBot)
    expect(bots).toHaveLength(1)
    expect(bots[0].persona).toBeTruthy()
    expect(s.order).toContain(bots[0].userId)
  })

  it('non-host cannot add bots; cap is MAX_BOTS with distinct personas', () => {
    let s = lobby3()
    s = step(s, [{ userId: 'p1', action: 'ADD_BOT' }], 1100)
    expect(Object.values(s.players).some((p) => p.isBot)).toBe(false)
    for (let i = 0; i < 10; i++) s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1200 + i)
    const bots = Object.values(s.players).filter((p) => p.isBot)
    expect(bots).toHaveLength(MAX_BOTS)
    expect(new Set(bots.map((b) => b.persona)).size).toBe(MAX_BOTS)
  })

  it('a solo host + 1 bot clears the 2-player floor and can play a full round', () => {
    let s = initialState(21, { totalRounds: 1 })
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1100)
    expect(s.order).toHaveLength(2)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    expect(s.phase).toBe('INTRO')
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    expect(s.phase).toBe('WRITE')
    const botId = s.order.find((id) => s.players[id].isBot)!
    s = step(s, [lie('p0', 'Lyon'), lie(botId, 'Marseille')], 20_000)
    expect(s.phase).toBe('VOTE') // the bot's SUBMIT_LIE advanced the round
    expect(s.lies[botId]).toBe('Marseille')
  })

  it("an invalid bot lie is rejected exactly like a human's (re-roll loop hook)", () => {
    let s = initialState(21, { totalRounds: 1 })
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1100)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1)
    const botId = s.order.find((id) => s.players[id].isBot)!
    const truth = s.question!.answer
    s = step(s, [lie(botId, truth)], 20_000)
    expect(s.lies[botId]).toBeUndefined() // rejected → still listed for generation
    expect(s.rejections[botId]).toBe('TRUTH')
  })

  it('host can remove a specific bot in the lobby', () => {
    let s = initialState(21)
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }], 1100)
    const botId = Object.values(s.players).find((p) => p.isBot)!.userId
    s = step(s, [{ userId: 'p0', action: 'REMOVE_BOT', data: { targetUserId: botId } }], 1200)
    expect(s.players[botId]).toBeUndefined()
    expect(s.order).not.toContain(botId)
  })
})

describe('engine — PLAY_AGAIN', () => {
  it('resets to a fresh lobby keeping players, zeroed scores, no stale round data', () => {
    let s = lobby3(5, 1)
    s = driveToPodium(s)
    expect(s.phase).toBe('PODIUM')
    s = step(s, [{ userId: 'p0', action: 'PLAY_AGAIN' }], 999_999)
    expect(s.phase).toBe('LOBBY')
    expect(s.order).toHaveLength(3)
    expect(Object.values(s.players).every((p) => p.score === 0)).toBe(true)
    expect(s.question).toBeNull()
    expect(s.usedQuestionIds).toEqual([])
    expect(s.summary).toBeNull()
    expect(s.bestLie).toBeNull()
  })

  it('promotes lingering spectators but never past the seat cap', () => {
    let s = initialState(13, { totalRounds: 1 })
    const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => `c${i}`)
    s = join(s, seats, 1000)
    expect(s.order).toHaveLength(MAX_PLAYERS)
    s = step(s, [{ userId: 'c0', action: 'START_GAME' }], 1000)
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
    s = step(s, [{ userId: 'c0', action: 'PLAY_AGAIN' }], 999_999)
    expect(s.phase).toBe('LOBBY')
    expect(s.order).toHaveLength(MAX_PLAYERS) // capped — spectators NOT seated
    expect(s.players['s0'].role).toBe('spectator')
  })
})

/** Drive a started-or-lobby game to PODIUM (everyone lies + votes truth-or-first). */
function driveToPodium(start: GameState): GameState {
  let s = start
  if (s.phase === 'LOBBY') s = step(s, [{ userId: s.hostUserId ?? 'p0', action: 'START_GAME' }], 1000)
  let clock = 10_000
  let guard = 0
  while (s.phase !== 'PODIUM' && guard++ < 300) {
    clock += 100
    if (s.phase === 'WRITE') {
      s = step(s, s.order.map((id, i) => lie(id, `Lie ${i} r${s.roundIndex}`)), clock)
    } else if (s.phase === 'VOTE') {
      const inputs: RawInput[] = []
      for (const id of s.order) {
        const pick = s.options.find((o) => !o.authorIds.includes(id))
        if (pick) inputs.push(vote(id, pick.id))
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

describe('engine — seat-steal guard (cids are public in broadcast state)', () => {
  it("JOIN with a CONNECTED player's cid gets its own seat — no takeover", () => {
    let s = initialState(11)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'evil', action: 'JOIN', data: { name: 'EVIL', cid: 'cid-p1' } }], 1100, ['p0', 'p1', 'p2'])
    expect(s.players['p1']).toBeDefined() // victim keeps the seat
    expect(s.players['p1'].name).toBe('P1')
    expect(s.hostUserId).toBe('p0')
    expect(s.players['evil']).toBeDefined() // attacker seated fresh
    expect(s.players['evil'].score).toBe(0)
    expect(s.order).toHaveLength(4)
  })

  it("a DISCONNECTED player's seat still rebinds (legit refresh unaffected)", () => {
    let s = initialState(11)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p1b', action: 'JOIN', data: { name: 'P1', cid: 'cid-p1' } }], 1100, ['p0', 'p2', 'p1b'])
    expect(s.players['p1']).toBeUndefined()
    expect(s.players['p1b']).toBeDefined()
    expect(s.order).toHaveLength(3)
  })
})
