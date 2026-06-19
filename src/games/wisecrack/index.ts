/**
 * Wisecrack engine module — the GameEngine the hub DO dispatches to.
 *
 * PURE: no React, no SDK, no network. The hub (worker.ts AppGameRoom) owns all
 * I/O; this module supplies the rules (reduce), the content pool, the bot
 * knowledge (prompts to build, inputs to fold back, heuristic votes), the
 * podium recap, and the public-registry listing rule. Ported from wisecrack2
 * (its worker's game-specific driveBots / persistRecap / syncRegistry logic,
 * re-expressed declaratively against the GameEngine / GameBots contracts).
 */
import type { GameBots, GameEngine } from '../engines'
import type { HubGameState, RawInput, ReduceCtx } from '../spine'
import { getPromptPool } from './content/loader'
import { initialState, reduce } from './engine'
import { pickBotFinalVotes, pickBotVote } from './botVote'
import { BOT_FALLBACKS, buildBotSystemPrompt, buildBotUserPrompt, pickCandidate } from './personas'
import { mulberry32 } from './rng'
import { MAX_PLAYERS, type GameState, type Prompt } from './types'

/** Deterministic 32-bit string hash (seeds per-bot RNG so votes vary but are stable). */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const asWisecrack = (s: HubGameState): GameState => s as GameState

/**
 * Bot hooks. Generation is serialized PER BOT: needsGeneration reports only a
 * bot's FIRST unanswered matchup, because submitInput is handed back only
 * (botId, text, state) — with at most one generation outstanding per bot, the
 * "first unanswered matchup authored by this bot" is unambiguous, so a line
 * written for prompt A can never land on prompt B. The next matchup surfaces
 * on the tick after the previous answer folds in.
 */
const bots: GameBots = {
  needsGeneration(state) {
    const s = asWisecrack(state)
    if (s.phase !== 'WRITE' && s.phase !== 'FINAL_WRITE') return []
    const tasks: { botId: string; persona: string; task: string }[] = []
    const claimed = new Set<string>()
    for (const m of s.matchups) {
      for (const botId of m.authorIds) {
        const bot = s.players[botId]
        if (!bot?.isBot || m.answers[botId] || claimed.has(botId)) continue
        claimed.add(botId)
        tasks.push({ botId, persona: bot.persona ?? '', task: m.promptText })
      }
    }
    return tasks
  },

  buildSystemPrompt(persona, state) {
    return buildBotSystemPrompt(persona, Boolean(asWisecrack(state).config.allowSpicy))
  },

  buildUserPrompt(task) {
    return buildBotUserPrompt(task)
  },

  pickCandidate(raw, task) {
    return pickCandidate(raw, task) || null
  },

  fallback(persona, task) {
    return BOT_FALLBACKS[hashStr(`${persona}:${task}`) % BOT_FALLBACKS.length]
  },

  submitInput(botId, text, state) {
    // Locate the bot's first unanswered matchup (unique — see serialization
    // note above). If the phase has moved on, return a no-op-shaped input;
    // reduce rejects it safely.
    const s = asWisecrack(state)
    const m = s.matchups.find((x) => x.authorIds.includes(botId) && !x.answers[botId])
    return { action: 'SUBMIT_ANSWER', data: { matchupId: m?.id ?? '', text } }
  },

  heuristicVotes(state) {
    const s = asWisecrack(state)
    const out: Array<{ botId: string; action: string; data: unknown }> = []
    const botIds = s.order.filter((id) => s.players[id]?.isBot)
    if (botIds.length === 0) return out

    if (s.phase === 'VOTE') {
      const m = s.matchups[s.voteIndex]
      if (!m) return out
      for (const botId of botIds) {
        if (m.authorIds.includes(botId) || m.votes[botId]) continue
        const rng = mulberry32(hashStr(`${s.seed}:${m.id}:${botId}`))
        const choice = pickBotVote(m, botId, rng)
        if (choice) out.push({ botId, action: 'VOTE', data: { matchupId: m.id, authorId: choice } })
      }
      return out
    }

    if (s.phase === 'FINAL_VOTE') {
      const m = s.matchups[0]
      if (!m) return out
      for (const botId of botIds) {
        const cast = m.votes[botId]?.length ?? 0
        const need = s.config.finalVotes - cast
        if (need <= 0) continue
        // The hub drops exact-duplicate pending inputs, so identical picks in
        // one batch collapse to one queued vote — the remainder re-emerges on
        // later ticks (cast reseeds the rng) until all votes are spent.
        const rng = mulberry32(hashStr(`${s.seed}:final:${botId}:${cast}`))
        for (const authorId of pickBotFinalVotes(m, botId, need, rng)) {
          out.push({ botId, action: 'VOTE', data: { matchupId: m.id, authorId } })
        }
      }
      return out
    }

    return out
  },

  maxTokens: 90, // ~2 short candidates; keeps output cost down (Guard 1)
}

export const wisecrackEngine: GameEngine = {
  initialState(seed) {
    return initialState(seed)
  },

  reduce(prev, inputs: RawInput[], ctx: ReduceCtx) {
    return reduce(asWisecrack(prev), inputs, {
      now: ctx.now,
      connected: ctx.connected,
      content: ctx.content as Prompt[],
    })
  },

  // The FULL pool (spicy included), stable-ordered; reduce filters per config.
  content: getPromptPool(true),

  bots,

  recap(state) {
    // Non-null exactly when wisecrack2's worker persisted: at PODIUM with a
    // summary. The hub's recapId once-guard keeps it to one write per session.
    const s = asWisecrack(state)
    if (s.phase !== 'PODIUM' || !s.summary) return null
    const winner = s.summary.standings[0]
    const payload = {
      standings: s.summary.standings.map((p) => ({ name: p.name, color: p.color, score: p.score })),
      topMatchup: s.summary.topMatchup ?? null,
    }
    return {
      winnerName: winner?.name ?? '?',
      winnerColor: winner?.color ?? '#C6FF3D',
      winnerScore: winner?.score ?? 0,
      payload: JSON.stringify(payload),
    }
  },

  registryRow(state, connected) {
    // wisecrack2's listing rule: a public, open LOBBY with a free seat and at
    // least one live, CONNECTED, non-bot player. playerCount reflects LIVE
    // humans (bots hold no sockets; a disconnected "ghost" seat isn't in
    // `connected`), so the landing never advertises a dead or over-counted room.
    const s = asWisecrack(state)
    const liveCount = s.order.filter((id) => connected.includes(id) && !s.players[id]?.isBot).length
    const shouldList =
      s.config.isPublic &&
      s.phase === 'LOBBY' &&
      liveCount > 0 &&
      s.order.length < MAX_PLAYERS // free-seat gate stays on total seats (bots occupy seats)
    if (!shouldList) return null
    const hostName = (s.hostUserId && s.players[s.hostUserId]?.name) || 'Open room'
    return { name: hostName, playerCount: liveCount }
  },
}
