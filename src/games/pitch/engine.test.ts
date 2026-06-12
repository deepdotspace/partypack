import { describe, expect, it } from 'vitest'
import { initialState, reduce, type PitchCtx } from './engine'
import { VOTE_POINTS, WINNER_BONUS } from './scoring'
import { MAX_BOTS, MAX_PLAYERS, type Brief, type GameState, type RawInput } from './types'

function pool(n: number): Brief[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    prompt: `Brief ${i}: invent a thing.`,
    tag: 'gadget',
  }))
}

const BRIEFS = pool(12)

function step(state: GameState, inputs: RawInput[], now: number, connected: string[] = []): GameState {
  const ctx: PitchCtx = { now, connected, content: BRIEFS }
  return reduce(state, inputs, ctx) ?? state
}

function join(state: GameState, ids: string[], now: number): GameState {
  return step(
    state,
    ids.map((userId) => ({ userId, action: 'JOIN', data: { name: userId.toUpperCase(), cid: `cid-${userId}` } })),
    now,
  )
}

const submit = (userId: string, name: string, pitch: string): RawInput => ({
  userId,
  action: 'SUBMIT',
  data: { name, pitch },
})
const vote = (userId: string, optionId: string): RawInput => ({ userId, action: 'VOTE', data: { optionId } })

/** Jump past the current phase deadline (timed-only phases). */
function expire(state: GameState): GameState {
  return step(state, [], (state.phaseEndsAt ?? 0) + 1)
}

/** Start a 3-player game and drive it to the first VOTE: everyone submits. */
function driveToVote(seed = 123, rounds = 1): GameState {
  let s = initialState(seed)
  s = join(s, ['p0', 'p1', 'p2'], 1000)
  s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { totalRounds: rounds } }], 1000)
  s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
  expect(s.phase).toBe('INTRO')
  s = expire(s) // INTRO -> PROMPT (draws the brief)
  expect(s.phase).toBe('PROMPT')
  expect(s.brief).not.toBeNull()
  s = expire(s) // PROMPT -> WRITE
  expect(s.phase).toBe('WRITE')
  // all three (host included) invent → auto VOTE
  s = step(
    s,
    [
      submit('p0', 'HostCo', 'the host plays too'),
      submit('p1', 'NeverLost', 'magnetic sock clips'),
      submit('p2', 'SockGPS', 'tiny trackers in every toe'),
    ],
    20000,
  )
  expect(s.phase).toBe('VOTE')
  return s
}

/** Drive a started game to PODIUM, always making p0 sweep each round. */
function driveToPodium(start: GameState): GameState {
  let s = start
  let clock = 10_000
  let guard = 0
  while (s.phase !== 'PODIUM' && guard++ < 300) {
    clock += 100
    if (s.phase === 'WRITE') {
      s = step(s, s.order.map((id) => submit(id, `${id}-co`, `${id}'s pitch r${s.roundIndex}`)), clock)
    } else if (s.phase === 'VOTE') {
      const target = s.options.find((o) => o.userId === 'p0')!
      const others = s.options.find((o) => o.userId !== 'p0')!
      const inputs = s.order.map((v) => vote(v, v === 'p0' ? others.id : target.id))
      s = step(s, inputs, clock)
    } else {
      const now = (s.phaseEndsAt ?? clock) + 1
      clock = now
      s = step(s, [], now)
    }
  }
  return s
}

describe('engine — lobby & host authority', () => {
  it('initial state is a pitch LOBBY (spine fields present)', () => {
    const s = initialState(1)
    expect(s.game).toBe('pitch')
    expect(s.phase).toBe('LOBBY')
    expect(s.registryId).toBeNull()
  })

  it('first player to JOIN becomes host (and plays); players get distinct colors', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    expect(s.hostUserId).toBe('p0')
    expect(s.players['p0'].role).toBe('host')
    expect(s.order).toEqual(['p0', 'p1', 'p2']) // the host is SEATED — host plays
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

  it('host SET_CONFIG clamps rounds to the 1-5 range, lobby-only, host-only', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p1', action: 'SET_CONFIG', data: { totalRounds: 5 } }], 1000)
    expect(s.config.totalRounds).toBe(3) // non-host rejected
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { totalRounds: 99 } }], 1000)
    expect(s.config.totalRounds).toBe(5) // clamped
    s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { totalRounds: 2 } }], 1000)
    expect(s.config.totalRounds).toBe(2)
  })

  it('captures the room code from the first JOIN that carries one (and ignores a `game` field)', () => {
    let s = initialState(1)
    s = step(
      s,
      [{ userId: 'p0', action: 'JOIN', data: { name: 'P0', cid: 'cid-p0', roomCode: 'abcd', game: 'pitch' } }],
      1000,
    )
    expect(s.roomCode).toBe('ABCD')
    expect(s.players['p0']).toBeDefined()
  })
})

describe('engine — round flow (brief draw)', () => {
  it('START_GAME → INTRO, then the timer reveals a brief drawn from ctx.content', () => {
    let s = initialState(7)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    expect(s.phase).toBe('INTRO')
    expect(s.brief).toBeNull() // not drawn yet
    s = expire(s)
    expect(s.phase).toBe('PROMPT')
    expect(BRIEFS.some((b) => b.id === s.brief?.id)).toBe(true)
    expect(s.usedBriefIds).toEqual([s.brief!.id])
  })

  it('brief selection is deterministic for a seed and dedupes across rounds', () => {
    const run = () => {
      let s = initialState(42)
      s = join(s, ['p0', 'p1', 'p2'], 1000)
      s = step(s, [{ userId: 'p0', action: 'SET_CONFIG', data: { totalRounds: 3 } }], 1000)
      s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
      return driveToPodium(s)
    }
    const a = run()
    const b = run()
    expect(a.usedBriefIds).toHaveLength(3)
    expect(new Set(a.usedBriefIds).size).toBe(3) // no repeats within a game
    expect(a.usedBriefIds).toEqual(b.usedBriefIds) // same seed → same draw
  })
})

describe('engine — write phase', () => {
  function writePhase(): GameState {
    let s = initialState(3)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = expire(s) // -> PROMPT
    s = expire(s) // -> WRITE
    expect(s.phase).toBe('WRITE')
    return s
  }

  it('stores an invention only when BOTH name and pitch are non-empty', () => {
    let s = writePhase()
    s = step(s, [submit('p1', 'NameOnly', '   ')], 20000) // empty pitch → rejected
    expect(s.inventions['p1']).toBeUndefined()
    s = step(s, [submit('p1', 'NameOnly', 'now with a pitch')], 20500)
    expect(s.inventions['p1']).toEqual({ name: 'NameOnly', pitch: 'now with a pitch' })
  })

  it('a resubmit replaces the stored invention (change-it flow)', () => {
    let s = writePhase()
    s = step(s, [submit('p1', 'Draft', 'first take')], 20000)
    s = step(s, [submit('p1', 'Final', 'second take')], 20500)
    expect(s.inventions['p1']).toEqual({ name: 'Final', pitch: 'second take' })
  })

  it('a spectator cannot submit an invention', () => {
    let s = writePhase()
    s = step(s, [{ userId: 'spec', action: 'JOIN', data: { name: 'Spec', cid: 'cid-spec' } }], 20000)
    expect(s.players['spec'].role).toBe('spectator')
    s = step(s, [submit('spec', 'Nope', 'not seated')], 20100)
    expect(s.inventions['spec']).toBeUndefined()
  })

  it('WRITE times out: only submitted inventions make the board (no safety fill)', () => {
    let s = writePhase()
    s = step(s, [submit('p1', 'OnlyOne', 'the sole pitch')], 20000)
    s = expire(s)
    expect(s.phase).toBe('VOTE')
    expect(s.options).toHaveLength(1)
    expect(s.options[0].userId).toBe('p1')
  })

  it('a round where NOBODY submits skips through VOTE to an empty REVEAL', () => {
    let s = writePhase()
    s = expire(s)
    expect(s.phase).toBe('REVEAL') // empty board → no eligible voters → straight through
    expect(s.options).toHaveLength(0)
    expect(s.result?.roundWinnerUserId).toBeNull()
  })
})

describe('engine — vote & scoring (host plays)', () => {
  it('builds the invention board on entering VOTE (one option per invention)', () => {
    const s = driveToVote()
    expect(s.options).toHaveLength(3)
    expect(new Set(s.options.map((o) => o.userId))).toEqual(new Set(['p0', 'p1', 'p2']))
    const hostOpt = s.options.find((o) => o.userId === 'p0')!
    expect(hostOpt.name).toBe('HostCo') // the HOST's invention is on the board
    expect(hostOpt.pitch).toBe('the host plays too')
  })

  it('cannot vote for your own invention', () => {
    let s = driveToVote()
    const mine = s.options.find((o) => o.userId === 'p1')!
    s = step(s, [vote('p1', mine.id)], 21000)
    expect(s.votes['p1']).toBeUndefined()
  })

  it('a spectator cannot vote (Pitch keeps scoring players-only)', () => {
    let s = driveToVote()
    s = step(s, [{ userId: 'spec', action: 'JOIN', data: { name: 'Spec', cid: 'cid-spec' } }], 21000)
    const opt = s.options[0]
    s = step(s, [vote('spec', opt.id)], 21100)
    expect(s.votes['spec']).toBeUndefined()
  })

  it('scores the round correctly and crowns a winner — host votes count like any player', () => {
    let s = driveToVote(123, 1) // single round → final multiplier 3×
    const opt = (userId: string) => s.options.find((o) => o.userId === userId)!
    // p0 (host) votes p2's; p1 & p2 vote p0's → p0 gets 2 votes (round winner).
    s = step(s, [vote('p0', opt('p2').id), vote('p1', opt('p0').id), vote('p2', opt('p0').id)], 21000)
    expect(s.phase).toBe('REVEAL')
    expect(s.players['p0'].score).toBe(VOTE_POINTS * 3 * 2 + WINNER_BONUS * 3) // 2 votes + winner bonus
    expect(s.players['p2'].score).toBe(VOTE_POINTS * 3) // 1 vote (from the host)
    expect(s.players['p1'].score).toBe(0)
    expect(s.result?.roundWinnerUserId).toBe('p0')

    s = expire(s) // REVEAL -> SCORE
    expect(s.phase).toBe('SCORE')
    s = expire(s) // SCORE -> PODIUM (last round)
    expect(s.phase).toBe('PODIUM')
    expect(s.winnerUserId).toBe('p0')
  })

  it('host SKIP forces WRITE to end early', () => {
    let s = initialState(9)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = expire(s) // -> PROMPT
    s = expire(s) // -> WRITE
    s = step(s, [submit('p1', 'Solo', 'only one in'), { userId: 'p0', action: 'SKIP' }], 22000)
    expect(s.phase).toBe('VOTE') // advanced despite p0/p2 not submitting
  })

  it('non-host SKIP is rejected; SKIP is rejected in LOBBY/PODIUM', () => {
    let s = initialState(9)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'SKIP' }], 1100)
    expect(s.phase).toBe('LOBBY')
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    s = step(s, [{ userId: 'p1', action: 'SKIP' }], 1300)
    expect(s.phase).toBe('INTRO')
  })
})

describe('engine — full game to podium', () => {
  it('plays 3 rounds end-to-end, scores, and names a winner with a summary', () => {
    let s = initialState(5)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = driveToPodium(s)

    expect(s.phase).toBe('PODIUM')
    expect(s.winnerUserId).toBe('p0') // p0 swept every round
    const totalScore = Object.values(s.players).reduce((sum, p) => sum + p.score, 0)
    expect(totalScore).toBeGreaterThan(0)
    expect(s.summary).not.toBeNull()
    expect(s.summary!.standings).toHaveLength(3)
    expect(s.summary!.standings[0].score).toBeGreaterThanOrEqual(s.summary!.standings[1].score)
    // the winning-invention showcase spans all rounds
    expect(s.summary!.topInvention).not.toBeNull()
    expect(s.summary!.topInvention!.byName).toBe('P0')
    expect(s.summary!.topInvention!.votes).toBe(2)
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
    expect(s.usedBriefIds).toEqual([])
    expect(s.brief).toBeNull()
    expect(s.summary).toBeNull()
  })
})

describe('engine — host handoff on disconnect', () => {
  function ctx(connected: string[]): PitchCtx {
    return { now: 2000, connected, content: BRIEFS }
  }

  it('reassigns the host to the next connected seat when the host drops', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    expect(s.hostUserId).toBe('p0')
    s = reduce(s, [], ctx(['p1', 'p2'])) ?? s
    expect(s.hostUserId).toBe('p1')
    expect(s.players['p1'].role).toBe('host')
    expect(s.players['p0'].role).toBe('contestant')
  })

  it('keeps the host while they remain connected', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = reduce(s, [], ctx(['p0', 'p1', 'p2'])) ?? s
    expect(s.hostUserId).toBe('p0')
  })

  it('hands off MID-ROUND and the new host can SKIP the phase', () => {
    let s = driveToVote() // p0 hosted into VOTE
    // p0 drops mid-vote → host passes to p1…
    s = reduce(s, [], { now: 21000, connected: ['p1', 'p2'], content: BRIEFS }) ?? s
    expect(s.hostUserId).toBe('p1')
    // …and p1's SKIP now works (host authority moved).
    s = reduce(s, [{ userId: 'p1', action: 'SKIP' }], { now: 21100, connected: ['p1', 'p2'], content: BRIEFS }) ?? s
    expect(s.phase).toBe('REVEAL')
  })
})

describe('engine — roles, kick, spectators', () => {
  it('a player who joins mid-game becomes a spectator (not seated)', () => {
    let s = initialState(1)
    s = join(s, ['p0', 'p1', 'p2'], 1000)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1000)
    s = step(s, [{ userId: 'spec', action: 'JOIN', data: { name: 'Spec', cid: 'cid-spec' } }], 1100)
    expect(s.players['spec'].role).toBe('spectator')
    expect(s.order).not.toContain('spec')
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

  it('PLAY_AGAIN promotes lingering spectators but never past the seat cap', () => {
    let s = initialState(13)
    const contestants = Array.from({ length: MAX_PLAYERS }, (_, i) => `c${i}`)
    s = join(s, contestants, 1000)
    expect(s.order).toHaveLength(MAX_PLAYERS)
    s = step(s, [{ userId: contestants[0], action: 'START_GAME' }], 1000)
    s = step(
      s,
      [
        { userId: 's0', action: 'JOIN', data: { name: 'S0', cid: 'cid-s0' } },
        { userId: 's1', action: 'JOIN', data: { name: 'S1', cid: 'cid-s1' } },
      ],
      1100,
    )
    expect(s.players['s0'].role).toBe('spectator')
    // drive to podium with c0 sweeping
    let clock = 10_000
    let guard = 0
    while (s.phase !== 'PODIUM' && guard++ < 300) {
      clock += 100
      if (s.phase === 'WRITE') {
        s = step(s, s.order.map((id) => submit(id, `${id}-co`, 'a pitch')), clock)
      } else if (s.phase === 'VOTE') {
        const target = s.options.find((o) => o.userId === 'c0')!
        const other = s.options.find((o) => o.userId !== 'c0')!
        s = step(s, s.order.map((v) => vote(v, v === 'c0' ? other.id : target.id)), clock)
      } else {
        clock = (s.phaseEndsAt ?? clock) + 1
        s = step(s, [], clock)
      }
    }
    expect(s.phase).toBe('PODIUM')
    s = step(s, [{ userId: contestants[0], action: 'PLAY_AGAIN' }], 999_999)
    expect(s.phase).toBe('LOBBY')
    expect(s.order).toHaveLength(MAX_PLAYERS) // capped — spectators NOT seated
    expect(s.players['s0'].role).toBe('spectator')
  })
})

describe('engine — reconnect (cid rebind)', () => {
  it('a mid-round refresh (new connection id, same cid) keeps seat, invention, and vote', () => {
    let s = driveToVote(11)
    const orderBefore = [...s.order]
    const myOption = s.options.find((o) => o.userId === 'p1')!
    // p1 votes, then refreshes: same cid, brand-new server connection id.
    const target = s.options.find((o) => o.userId === 'p0')!
    s = step(s, [vote('p1', target.id)], 21000)
    s = step(s, [{ userId: 'p1b', action: 'JOIN', data: { name: 'P1', cid: 'cid-p1' } }], 21100)
    expect(s.players['p1']).toBeUndefined() // old seat removed
    expect(s.players['p1b']).toBeDefined() // rebound onto the new id
    expect(s.order).toEqual(orderBefore.map((id) => (id === 'p1' ? 'p1b' : id))) // same position
    expect(s.order).toHaveLength(3) // NOT a 4th orphaned seat
    expect(s.inventions['p1b']).toBeDefined() // authorship remapped
    expect(s.options.find((o) => o.id === myOption.id)!.userId).toBe('p1b')
    expect(s.votes['p1b']).toBe(target.id) // the cast vote follows the seat
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

  it('an invalid bot SUBMIT is rejected like a human one (no empty inventions)', () => {
    let s = initialState(21)
    s = join(s, ['p0'], 1000)
    s = step(s, [{ userId: 'p0', action: 'ADD_BOT' }, { userId: 'p0', action: 'ADD_BOT' }], 1100)
    s = step(s, [{ userId: 'p0', action: 'START_GAME' }], 1200)
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // -> PROMPT
    s = step(s, [], (s.phaseEndsAt ?? 0) + 1) // -> WRITE
    expect(s.phase).toBe('WRITE')
    s = step(s, [submit('bot-1', '', '')], 30000)
    expect(s.inventions['bot-1']).toBeUndefined()
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
