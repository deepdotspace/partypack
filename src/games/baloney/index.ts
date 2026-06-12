/**
 * Baloney engine module — the GameEngine the hub DO dispatches to.
 *
 * PURE: no React, no SDK, no network. The hub (worker.ts AppGameRoom) owns all
 * I/O; this module supplies the rules (reduce), the content pool, the bot
 * knowledge (lie prompts to build, inputs to fold back, heuristic votes), the
 * podium recap, and the public-registry listing rule. Ported from the
 * standalone baloney (its worker's driveBots/decideLie logic, re-expressed
 * declaratively against the GameEngine / GameBots contracts; its worker
 * persisted no recap, so the recap payload is built from the podium summary
 * the same way wisecrack's is).
 */
import type { GameBots, GameEngine } from '../engines'
import type { HubGameState, RawInput, ReduceCtx } from '../spine'
import { QUESTION_POOL } from './content/questions'
import { initialState, reduce } from './engine'
import { BOT_MAX_TOKENS, BOT_PERSONAS, buildLieUserPrompt, extractLieLine } from './personas'
import { makeRng, hashString } from './text'
import { validateLie } from './validation'
import { MAX_PLAYERS, type GameState, type Question } from './types'

const asBaloney = (s: HubGameState): GameState => s as GameState

/** Resolve a bot task (= the question prompt text) back to its pool question. */
function questionForTask(task: string): Question | undefined {
  return QUESTION_POOL.find((q) => q.prompt === task)
}

/**
 * Bot hooks. One generation unit per bot per round: the task is the round's
 * question prompt. The engine validates a bot's SUBMIT_LIE exactly like a
 * human's — a rejected lie (truth / forbidden / duplicate) leaves the bot
 * without an accepted lie, so it reappears in needsGeneration and the hub
 * re-rolls (max 2 attempts) before falling back to a canned decoy. The canned
 * decoys are persona-voiced non-answers that don't collide with any pack's
 * truth/forbidden lists, so a fallback always passes the Lie Detector.
 */
const bots: GameBots = {
  needsGeneration(state) {
    const s = asBaloney(state)
    if (s.phase !== 'WRITE' || !s.question) return []
    const tasks: { botId: string; persona: string; task: string }[] = []
    for (const botId of s.order) {
      const bot = s.players[botId]
      if (!bot?.isBot || s.lies[botId] !== undefined) continue
      tasks.push({ botId, persona: bot.persona ?? '', task: s.question.prompt })
    }
    return tasks
  },

  buildSystemPrompt(persona) {
    return BOT_PERSONAS.find((p) => p.id === persona)?.systemPrompt ?? BOT_PERSONAS[0].systemPrompt
  },

  buildUserPrompt(task) {
    return buildLieUserPrompt(task)
  },

  pickCandidate(raw, task) {
    // Clean the model output to one line, then pre-screen it with the same
    // Lie Detector the engine applies — a candidate that matches the truth /
    // acceptable / forbidden lists returns null so the hub re-rolls instead
    // of burning an attempt on a guaranteed engine rejection.
    const text = extractLieLine(raw)
    if (!text) return null
    const q = questionForTask(task)
    if (q && validateLie(text, q) !== null) return null
    return text
  },

  fallback(persona, task) {
    const p = BOT_PERSONAS.find((x) => x.id === persona) ?? BOT_PERSONAS[0]
    return p.fallbackLies[hashString(`${persona}:${task}`) % p.fallbackLies.length]
  },

  submitInput(_botId, text) {
    // The round has exactly one open question, so the input needs no id —
    // reduce validates against the current question (and rejects safely if
    // the phase has moved on).
    return { action: 'SUBMIT_LIE', data: { text } }
  },

  heuristicVotes(state) {
    // Free (no-LLM) bot votes: a seeded-random option that isn't the bot's own
    // lie. Seed varies by round board + bot so picks differ but stay stable
    // across ticks (the hub drops exact-duplicate pending inputs; the reducer
    // ignores re-votes for the same option).
    const s = asBaloney(state)
    const out: Array<{ botId: string; action: string; data: unknown }> = []
    if (s.phase !== 'VOTE' || s.options.length === 0) return out
    for (const botId of s.order) {
      const bot = s.players[botId]
      if (!bot?.isBot || s.votes[botId] !== undefined) continue
      const choices = s.options.filter((o) => !o.authorIds.includes(botId))
      if (choices.length === 0) continue
      const rng = makeRng(hashString(`${s.seed}:${s.roundIndex}:${botId}`))
      const pick = choices[Math.floor(rng() * choices.length)]
      out.push({ botId, action: 'VOTE', data: { optionId: pick.id } })
    }
    return out
  },

  maxTokens: BOT_MAX_TOKENS, // 64 — a lie is a few words (original baloney's cap)
}

export const baloneyEngine: GameEngine = {
  initialState(seed) {
    return initialState(seed)
  },

  reduce(prev, inputs: RawInput[], ctx: ReduceCtx) {
    return reduce(asBaloney(prev), inputs, {
      now: ctx.now,
      connected: ctx.connected,
      content: ctx.content as Question[],
    })
  },

  // The full question pool (all four packs), stable module order — seeded
  // question picks reproduce identically on server and in tests.
  content: QUESTION_POOL,

  bots,

  recap(state) {
    // Non-null exactly at PODIUM with a summary; the hub's recapId once-guard
    // keeps it to one write per game session. The original baloney persisted
    // no recap, so the payload mirrors wisecrack's shape: standings + the
    // night's signature moment ("best baloney" = the most-fooling lie).
    const s = asBaloney(state)
    if (s.phase !== 'PODIUM' || !s.summary) return null
    const winner = s.summary.standings[0]
    const payload = {
      standings: s.summary.standings.map((p) => ({ name: p.name, color: p.color, score: p.score })),
      bestLie: s.summary.bestLie ?? null,
    }
    return {
      winnerName: winner?.name ?? '?',
      winnerColor: winner?.color ?? '#FF3D8A',
      winnerScore: winner?.score ?? 0,
      payload: JSON.stringify(payload),
    }
  },

  registryRow(state, connected) {
    // The hub listing rule: a public, open LOBBY with a free seat and at
    // least one CONNECTED seated player (bots never hold sockets).
    const s = asBaloney(state)
    const anyConnected = s.order.some((id) => connected.includes(id))
    const shouldList =
      s.config.isPublic &&
      s.phase === 'LOBBY' &&
      s.order.length > 0 &&
      s.order.length < MAX_PLAYERS &&
      anyConnected
    if (!shouldList) return null
    const hostName = (s.hostUserId && s.players[s.hostUserId]?.name) || 'Open room'
    return { name: hostName, playerCount: s.order.length }
  },
}
