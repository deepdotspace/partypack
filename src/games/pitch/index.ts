/**
 * Pitch engine module — the GameEngine the hub DO dispatches to.
 *
 * PURE: no React, no SDK, no network. The hub (worker.ts AppGameRoom) owns all
 * I/O; this module supplies the rules (reduce), the content pool (the brief
 * deck), the bot knowledge (invention prompts to build, inputs to fold back,
 * heuristic votes), the podium recap, and the public-registry listing rule.
 * Ported from the original Pitch repo, re-expressed declaratively against the
 * GameEngine / GameBots contracts (mirrors the wisecrack module).
 */
import type { GameBots, GameEngine } from '../engines'
import type { HubGameState, RawInput, ReduceCtx } from '../spine'
import {
  BOT_MAX_TOKENS,
  buildInventUserPrompt,
  getPersona,
  parseInvention,
  serializeInvention,
  BOT_PERSONAS,
} from './bots'
import { BRIEF_POOL } from './briefs'
import { initialState, reduce } from './engine'
import { hashString, makeRng } from './text'
import { MAX_PLAYERS, type Brief, type GameState } from './types'

const asPitch = (s: HubGameState): GameState => s as GameState

/**
 * Bot hooks. Pitch has at most ONE generation unit per bot per round (the
 * round's brief), so needsGeneration is naturally serialized: a bot is listed
 * while it has no stored invention during WRITE, and drops off the tick after
 * its submission folds in. An invention travels the hub's string pipeline as
 * the canonical "Name — pitch" line (see bots.ts serializeInvention);
 * submitInput parses it back into the { name, pitch } pair the reducer
 * validates — an unparseable/invalid result is rejected by reduce, so the bot
 * re-lists and the hub re-rolls (max 2) before settling on `fallback`.
 */
const bots: GameBots = {
  needsGeneration(state) {
    const s = asPitch(state)
    if (s.phase !== 'WRITE' || !s.brief) return []
    const tasks: { botId: string; persona: string; task: string }[] = []
    for (const botId of s.order) {
      const bot = s.players[botId]
      if (!bot?.isBot || s.inventions[botId]) continue
      tasks.push({ botId, persona: bot.persona ?? '', task: s.brief.prompt })
    }
    return tasks
  },

  buildSystemPrompt(persona) {
    // The persona prompts carry the full voice + anti-slop rules verbatim
    // (including the "For a product pitch:" instructions) — nothing to add.
    return (getPersona(persona) ?? BOT_PERSONAS[0]).systemPrompt
  },

  buildUserPrompt(task) {
    return buildInventUserPrompt(task)
  },

  pickCandidate(raw) {
    // Parse the model's "Name — pitch" line; re-serialize to the canonical
    // form so submitInput's parse round-trips. null → the hub re-rolls/cans.
    const inv = parseInvention(raw)
    return inv ? serializeInvention(inv) : null
  },

  fallback(persona, task) {
    // In-voice canned invention, picked deterministically per (persona, task)
    // so retries don't flap. Always parses (em-dash canonical form).
    const p = getPersona(persona) ?? BOT_PERSONAS[0]
    const pool = p.fallbackInventions
    return serializeInvention(pool[hashString(`${persona}:${task}`) % pool.length])
  },

  submitInput(botId, text) {
    // Decode the canonical "Name — pitch" line back into the reducer's
    // { name, pitch } submission. If somehow unparseable, send empties —
    // reduce rejects them safely and the re-roll/fallback path takes over.
    const inv = parseInvention(text)
    return { action: 'SUBMIT', data: { name: inv?.name ?? '', pitch: inv?.pitch ?? '' } }
  },

  heuristicVotes(state) {
    const s = asPitch(state)
    const out: Array<{ botId: string; action: string; data: unknown }> = []
    if (s.phase !== 'VOTE') return out
    for (const botId of s.order) {
      const bot = s.players[botId]
      if (!bot?.isBot || s.votes[botId]) continue
      const options = s.options.filter((o) => o.userId !== botId)
      if (options.length === 0) continue
      const rng = makeRng(hashString(`${s.seed}:r${s.roundIndex}:${botId}`))
      const choice = options[Math.floor(rng() * options.length)] ?? options[0]
      out.push({ botId, action: 'VOTE', data: { optionId: choice.id } })
    }
    return out
  },

  maxTokens: BOT_MAX_TOKENS, // 96 — a product name + one-line pitch (Guard 1)
}

export const pitchEngine: GameEngine = {
  initialState(seed) {
    return initialState(seed)
  },

  reduce(prev, inputs: RawInput[], ctx: ReduceCtx) {
    return reduce(asPitch(prev), inputs, {
      now: ctx.now,
      connected: ctx.connected,
      content: ctx.content as Brief[],
    })
  },

  // The FULL brief pool, passed back via ReduceCtx.content; the engine draws
  // with a seeded pick + used-brief dedupe (pickBrief).
  content: BRIEF_POOL,

  bots,

  recap(state) {
    // Non-null exactly at PODIUM with a summary; the hub's recapId once-guard
    // keeps it to one write per game session.
    const s = asPitch(state)
    if (s.phase !== 'PODIUM' || !s.summary) return null
    const winner = s.summary.standings[0]
    const payload = {
      standings: s.summary.standings.map((p) => ({ name: p.name, color: p.color, score: p.score })),
      // The winning invention showcase — the most-voted invention of the night.
      topInvention: s.summary.topInvention ?? null,
    }
    return {
      winnerName: winner?.name ?? '?',
      winnerColor: winner?.color ?? '#FF8A3D',
      winnerScore: winner?.score ?? 0,
      payload: JSON.stringify(payload),
    }
  },

  registryRow(state, connected) {
    // The hub listing rule: a public, open LOBBY with a free seat and at
    // least one CONNECTED seated player (bots never hold sockets).
    const s = asPitch(state)
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
