/**
 * App Worker — Hono-based Cloudflare Worker for DeepSpace apps.
 *
 * Each app owns its RecordRoom DOs. Schemas are baked in at deploy time.
 *
 * Handles:
 *   - WebSocket → app's own RecordRoom DO (real-time data)
 *   - Auth proxy → auth-worker (same-origin cookies)
 *   - Integration proxy → api-worker (LLM, search, etc.)
 *   - Server actions (app-defined, bypass user RBAC)
 *   - Scoped R2 file storage
 *   - HMAC-authenticated cron
 *   - Static asset serving with SPA fallback
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyJwt, apiWorkerFetch, platformWorkerFetch, authWorkerFetch } from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import { RecordRoom, YjsRoom, CanvasRoom, PresenceRoom, CronRoom, JobRoom, GameRoom } from 'deepspace/worker'
import type { Job, JobContext, ActionTools, ActionResult, DOManifest, DOBindings, GameInput } from 'deepspace/worker'
import { actions } from './src/actions/index.js'
import { tasks as cronTasks, runTask as runCronTask } from './src/cron.js'
import { runJob } from './src/jobs.js'
import { schemas } from './src/schemas.js'
import { integrations } from './src/integrations.js'
import { ENGINES } from './src/games/engines.js'
import type { GameBots, GameEngine, BotTask } from './src/games/engines.js'
import { isGameId } from './src/games/registry.js'
import type { HubGameState, RawInput, ReduceCtx } from './src/games/spine.js'
import {
  BOT_MODEL,
  BOT_CALL_CAP,
  BOT_CALL_TIMEOUT_MS,
  ROOM_BOT_LIFETIME,
  DAILY_BOT_CAP,
  tryReserve,
  hasSeatedHuman,
  type BudgetCell,
} from './src/games/botBudget.js'

// =============================================================================
// DO Manifest — declares all Durable Objects for dynamic deploy bindings
// =============================================================================

export const __DO_MANIFEST__ = [
  { binding: 'RECORD_ROOMS', className: 'AppRecordRoom', sqlite: true },
  { binding: 'YJS_ROOMS', className: 'AppYjsRoom', sqlite: true },
  { binding: 'CANVAS_ROOMS', className: 'AppCanvasRoom', sqlite: true },
  { binding: 'PRESENCE_ROOMS', className: 'AppPresenceRoom', sqlite: true },
  { binding: 'CRON_ROOMS', className: 'AppCronRoom', sqlite: true },
  { binding: 'JOB_ROOMS', className: 'AppJobRoom', sqlite: true },
  { binding: 'GAME_ROOMS', className: 'AppGameRoom', sqlite: true },
  { binding: 'BUDGET_ROOM', className: 'AppBudgetRoom', sqlite: true },
] as const satisfies DOManifest

// =============================================================================
// Durable Objects — extend to customize behavior
// =============================================================================

export class AppRecordRoom extends RecordRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, schemas, { ownerUserId: env.OWNER_USER_ID })
  }
}

export class AppYjsRoom extends YjsRoom<Env> {}
export class AppCanvasRoom extends CanvasRoom<Env> {}
export class AppPresenceRoom extends PresenceRoom<Env> {}

/**
 * AppCronRoom — runs scheduled tasks defined in src/cron.ts.
 *
 * Tasks are configured at construction time. The DO alarm fires at the
 * next interval / cron-expression match, calls `onTask(name)`, and
 * records the execution in its `cron_history` table. Admin clients can
 * watch via the `useCronMonitor('app:<APP_NAME>')` hook.
 */
export class AppCronRoom extends CronRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, { tasks: cronTasks })
  }

  protected async onTask(taskName: string): Promise<void> {
    await runCronTask(taskName, this.env)
  }
}

/**
 * AppJobRoom — durable background-job queue defined in src/jobs.ts.
 *
 * Use this for any work that needs to outlive an HTTP response: AI
 * generation, exports, renders, scheduled side effects. The DO alarm
 * picks up queued jobs and calls `onJob(job, ctx)`; crashes mid-run are
 * recovered automatically. Clients enqueue and subscribe via the
 * `useJobs('app:<APP_NAME>')` hook; server-side code uses the
 * `enqueueJob` helper from 'deepspace/worker'.
 */
export class AppJobRoom extends JobRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
  }

  protected async onJob(job: Job, ctx: JobContext): Promise<unknown> {
    return await runJob(job, ctx, this.env)
  }
}

/**
 * AppBudgetRoom — the global daily bot-spend budget DO (Guard 6, the abuse
 * backstop). A single instance (idFromName('global')) shared by every game
 * room across ALL THREE games. Before each owner-billed bot generation the
 * GameRoom asks it to reserve(1). Because a DO serializes its requests
 * through the input gate, the read-modify-write here is atomic — no race
 * overspend even under high concurrency (this is why KV would be wrong and a
 * DO is right). DAILY_BOT_CAP bounds worst-case daily spend regardless of how
 * many rooms exist; it resets at UTC midnight. On deny the caller uses a
 * canned fallback and never makes a call.
 *
 * Intentionally a MINIMAL Durable Object (not a GameRoom subclass). The
 * counter math lives in the pure, unit-testable `tryReserve` helper.
 */
export class AppBudgetRoom {
  constructor(private state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const n = Math.max(0, Math.min(8, Number(new URL(req.url).searchParams.get('n') ?? '1') || 0))
    const day = new Date().toISOString().slice(0, 10) // UTC day (Date is fine in a DO)
    const cur = await this.state.storage.get<BudgetCell>('c')
    const { cell, allowed } = tryReserve(cur, day, n, DAILY_BOT_CAP)
    if (allowed) await this.state.storage.put('c', cell)
    return Response.json({ allowed, used: cell.used, cap: DAILY_BOT_CAP })
  }
}

/** Hub room state: a bound game's state, or the pre-state before any game JOINs. */
type HubState = HubGameState | { game: null }

/**
 * AppGameRoom — ONE Durable Object class hosting all three party games. It
 * owns no game rules: each tick it looks up the room's engine in ENGINES and
 * delegates the pure reduce, the bot hooks, the podium recap, and the public-
 * room registry row to it.
 *
 * A room is born in the `{ game: null }` pre-state. The first JOIN carrying a
 * valid, REGISTERED `data.game` binds the room to that engine — and the same
 * input batch then reduces against the fresh initial state, so that JOIN also
 * seats the first player. With zero engines registered (or an unknown game
 * id) the room stays in pre-state and broadcasts `{ game: null }`, which the
 * client renders as room-not-found.
 *
 * It also DRIVES the AI bots generically (fire-and-forget after reduce; never
 * awaited — an LLM call is 1-10s and must not block the serial tick loop),
 * behind all six spend guards (see src/games/botBudget.ts). Bots act through
 * the SAME inputs a human would send, staged in `pendingBotInputs` for the
 * next tick — the pure reducers never see the network.
 *
 * Low tickRate — these are timer-paced turn games, not 60fps sims. maxPlayers
 * is the WS-connection ceiling (seats + stage displays + spectators); each
 * engine enforces its own seat caps server-side. Headroom matters: a phone
 * reconnecting leaves its old socket counted until that close fires, so a room
 * with churn briefly holds more connections than seats.
 */
export class AppGameRoom extends GameRoom<Env> {
  /** Synthetic inputs (bot answers/votes) to fold into the next tick's reduce. */
  private pendingBotInputs: RawInput[] = []
  /** In-flight LLM generations, keyed `${botId}:${task}` (Guard 3: one per bot per task). */
  private botInFlight = new Set<string>()
  /** `${botId}:${task}` -> attempts (caps re-rolls when the engine rejects a result). */
  private botAttempts = new Map<string, number>()
  /** Per-game-session LLM-call budget (Guard 3b, cost backstop); reset at LOBBY. */
  private botCalls = 0
  /** Per-room lifetime generation counter (Guard 5b); never reset. */
  private roomBotGens = 0
  /** Signature of the last-written registry state (in-memory throttle). */
  private regSig = ''

  constructor(state: DurableObjectState, env: Env) {
    super(state, env, { tickRate: 2, minPlayers: 1, maxPlayers: 24 })
  }

  /**
   * Delist this room's public-rooms row the instant the LAST seated human
   * leaves. The registry is normally kept in sync every tick (syncRegistry in
   * onTick), but the SDK halts the tick loop on the final disconnect
   * (GameRoom.onDisconnect calls stopGame once players hits 0), so onTick can
   * never run the delete for an abandoned lobby — the row would orphan and the
   * landing would advertise a dead room. We do the delete here instead.
   *
   * getPlayers() is the live human socket roster (bots hold no sockets); the
   * leaving player is already removed before this hook fires, so length 0
   * means the room just emptied.
   */
  protected override onPlayerLeave(): void {
    if (this.getPlayers().length !== 0) return // not the last one out
    const gs = this.getGameState()
    const registryId = gs.registryId
    if (typeof registryId !== 'string') return // not listed → nothing to delist
    this.regSig = '' // clear the in-memory throttle so a revived room re-lists
    // Null the id so a later re-list CREATEs a fresh row instead of UPDATEing a
    // now-deleted one. stopGame() runs right after this (we're empty) and
    // persists the state, carrying the null through.
    this.setGameState({ ...gs, registryId: null })
    // waitUntil keeps the DO alive past the now-stopped tick loop until the
    // delete settles. Best-effort: a rare miss stops being re-stamped, so the
    // landing's freshness window hides it (and a cron sweep can reclaim it).
    this.state.waitUntil(
      this.recordOp('records.delete', { collection: 'rooms', recordId: registryId }).catch(() => {}),
    )
  }

  protected async onTick(
    state: Record<string, unknown>,
    inputs: GameInput[],
    _tick: number,
  ): Promise<Record<string, unknown> | undefined> {
    // Fold in any bot moves that resolved since the last tick (synthetic inputs
    // the bot driver queued — answers from the LLM, votes from the heuristic).
    const queued = this.pendingBotInputs
    this.pendingBotInputs = []
    const clientInputs = inputs as unknown as RawInput[]
    const allInputs = queued.length ? [...queued, ...clientInputs] : clientInputs

    // --- Pre-state: no game bound to this room yet. ---
    let gs = this.coerceState(state)
    let justInitialized = false
    if (gs.game === null) {
      const join = allInputs.find((i) => {
        if (i.action !== 'JOIN') return false
        const g = (i.data as { game?: unknown } | undefined)?.game
        return isGameId(g) && Boolean(ENGINES[g])
      })
      if (!join) {
        // Broadcast { game: null } once so clients render room-not-found,
        // then stay silent on idle pre-state ticks.
        return (state as { game?: unknown }).game === null ? undefined : { game: null }
      }
      const g = (join.data as { game: string }).game as keyof typeof ENGINES
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      gs = ENGINES[g]!.initialState(seed)
      justInitialized = true
      // Fall through WITH the full batch: the binding JOIN seats player one.
    }

    const eng = ENGINES[gs.game]
    if (!eng) return { game: null } // engine de-registered between deploys — back to pre-state

    const now = Date.now()
    // Freeze re-base: when every player leaves, the SDK halts the tick loop; on
    // resume the next tick fires with a fresh clock far past phaseEndsAt, which
    // would fast-forward a timed phase through the time nobody was here. Shift
    // the deadline forward by the frozen gap — `+= gap` exactly preserves the
    // time that was left, so no cap is needed. The 3s threshold ignores normal
    // ~500ms ticks; we then stamp lastTickAt for the next tick's gap check.
    const timed = gs as { phaseEndsAt?: number; lastTickAt?: number }
    if (typeof timed.lastTickAt === 'number' && typeof timed.phaseEndsAt === 'number') {
      const gap = now - timed.lastTickAt
      if (gap > 3000) timed.phaseEndsAt += gap
    }
    timed.lastTickAt = now

    const ctx: ReduceCtx = {
      now,
      connected: this.getPlayers().map((p) => p.userId),
      content: eng.content,
    }
    const next = eng.reduce(gs, allInputs, ctx)
    const view = next ?? gs

    // Drive any bots: fire LLM generations (fire-and-forget) / queue heuristic
    // votes as synthetic inputs for a later tick. NEVER awaited here.
    this.driveBots(view, eng)

    let result: HubGameState | undefined = next

    // A return to LOBBY (PLAY_AGAIN) starts a fresh game session — clear the
    // recap once-guard so the next podium persists its own recap.
    if (view.phase === 'LOBBY' && view.recapId) {
      result = result ?? (structuredClone(gs) as HubGameState)
      delete (result as unknown as Record<string, unknown>).recapId
    }

    // Persist the shareable recap once per game session, server-side, the
    // moment the engine reports a podium (anonymous clients can't write
    // records, so the DO does it as the app). `recapId` on the state is the
    // once-guard; a failed write leaves it unset so we retry next tick.
    const rec = view.recapId ? null : eng.recap(view)
    if (rec) {
      const id = await this.persistRecap(view, rec)
      if (id) {
        result = result ?? (structuredClone(gs) as HubGameState)
        result.recapId = id
      }
    }

    // Keep the public-rooms registry in sync EVERY tick — even idle ones — so
    // an abandoned lobby (all players disconnected) is delisted.
    const reg = await this.syncRegistry(result ?? view, eng, ctx.connected)
    if (reg.changed) {
      result = result ?? (structuredClone(gs) as HubGameState)
      result.registryId = reg.registryId
    }

    return (
      (result as Record<string, unknown> | undefined) ??
      (justInitialized ? (gs as unknown as Record<string, unknown>) : undefined)
    )
  }

  protected onHydrateState(stored: Record<string, unknown>): Record<string, unknown> {
    return this.coerceState(stored) as unknown as Record<string, unknown>
  }

  /**
   * Treat an empty blob, an unknown game id, or a game whose engine isn't
   * registered in this build as the pre-state. Engines own their internal
   * state versioning (a stale shape within the same game id is theirs to
   * coerce in reduce/initialState).
   */
  private coerceState(raw: Record<string, unknown>): HubState {
    const g = (raw as { game?: unknown }).game
    if (isGameId(g) && ENGINES[g] && typeof (raw as { phase?: unknown }).phase === 'string') {
      return raw as unknown as HubGameState
    }
    return { game: null }
  }

  /**
   * Act for bot players via the engine's hooks. Heuristic moves (votes) are
   * free and queued directly; generations go through every spend guard and
   * resolve into synthetic inputs on a later tick. Pure `reduce` never sees
   * the network — it only consumes the synthetic inputs.
   */
  private driveBots(view: HubGameState, eng: GameEngine): void {
    const bots = eng.bots
    if (!bots) return
    if (view.phase === 'LOBBY') {
      // Fresh per-session budget (covers PLAY_AGAIN replays too).
      this.botCalls = 0
      this.botAttempts.clear()
      return
    }

    // Free heuristic moves. Exact duplicates still pending are dropped
    // (and reducers reject double votes anyway).
    for (const v of bots.heuristicVotes(view)) {
      const dataJson = JSON.stringify(v.data ?? null)
      const dup = this.pendingBotInputs.some(
        (i) => i.userId === v.botId && i.action === v.action && JSON.stringify(i.data ?? null) === dataJson,
      )
      if (!dup) {
        this.pendingBotInputs.push({ userId: v.botId, action: v.action, data: v.data as Record<string, unknown> })
      }
    }

    // LLM generations.
    const tasks = bots.needsGeneration(view)
    if (tasks.length === 0) return
    // Guard 5: require at least one SEATED, connected, non-bot human before any
    // bot generates (a Stage holds a write socket without taking a seat, so "any
    // connection" kept bots billing the owner on a TV with nobody playing).
    const connectedIds = new Set(this.getPlayers().map((p) => p.userId))
    const seated = view as unknown as { order?: string[]; players?: Record<string, { isBot?: boolean }> }
    if (!hasSeatedHuman(seated.order ?? [], seated.players ?? {}, connectedIds)) return

    for (const t of tasks) {
      const key = `${t.botId}:${t.task}`
      if (this.botInFlight.has(key)) continue
      // Also skip if a synthetic input from this bot is already queued for the
      // next tick — re-firing before the engine consumes it double-bills.
      if (this.pendingBotInputs.some((i) => i.userId === t.botId)) continue
      this.botInFlight.add(key)
      const submit = (text: string) => {
        const inp = bots.submitInput(t.botId, text, view)
        this.pendingBotInputs.push({ userId: t.botId, action: inp.action, data: inp.data as Record<string, unknown> })
        this.botInFlight.delete(key)
      }
      // If the engine already rejected this bot's result for this task (it
      // reappeared in needsGeneration), cap the re-rolls: after 2 attempts
      // stop calling AI and let a canned line stand.
      const tries = this.botAttempts.get(key) ?? 0
      this.botAttempts.set(key, tries + 1)
      // Guards 3b + 5b: session call cap / room lifetime cap → canned line, no call.
      if (tries >= 2 || this.botCalls >= BOT_CALL_CAP || this.roomBotGens >= ROOM_BOT_LIFETIME) {
        submit(bots.fallback(t.persona, t.task))
        continue
      }
      this.botCalls++
      // Fire-and-forget — the result folds back as a synthetic input later;
      // any failure path lands on the canned fallback so phases never hang.
      this.generate(bots, t, view)
        .then((text) => submit(text || bots.fallback(t.persona, t.task)))
        .catch(() => submit(bots.fallback(t.persona, t.task)))
    }
  }

  /**
   * One owner-billed generation via the integrations proxy, behind the global
   * budget (Guard 6). Prompts are built 100% server-side by the engine
   * (Guard 2); output is capped by the engine's maxTokens (Guard 1). Returns
   * the picked candidate, or null on deny/failure/timeout (caller substitutes
   * a canned fallback). Handles both response shapes ({success,data} envelope
   * or the raw Anthropic body).
   */
  private async generate(bots: GameBots, t: BotTask, view: HubGameState): Promise<string | null> {
    // Guard 6: reserve from the global daily budget BEFORE the billed call.
    if (!(await this.reserve(1))) return null
    this.roomBotGens++
    try {
      const fetchJson = apiWorkerFetch(this.env, '/api/integrations/anthropic/chat-completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.env.APP_OWNER_JWT}`, // owner-billed; bots have no caller
        },
        body: JSON.stringify({
          model: BOT_MODEL,
          max_tokens: bots.maxTokens,
          temperature: 1, // high temp = joke variety; both source games shipped with this
          system: bots.buildSystemPrompt(t.persona, view),
          messages: [{ role: 'user', content: bots.buildUserPrompt(t.task) }],
        }),
      }).then((res) => res.json())
      // Bound a slow Opus call so it can't stall the round (the call may still
      // complete + bill, but the bot falls back to a canned line meanwhile).
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), BOT_CALL_TIMEOUT_MS))
      const json = (await Promise.race([fetchJson, timeout])) as {
        success?: boolean
        data?: { content?: Array<{ type?: string; text?: string }> }
        content?: Array<{ type?: string; text?: string }>
      } | null
      if (!json || json.success === false) return null
      const payload = json.data ?? json
      const raw = payload?.content?.find((b) => b.type === 'text')?.text ?? ''
      return bots.pickCandidate(raw, t.task)
    } catch {
      return null
    }
  }

  /** Reserve `n` from the singleton budget DO. Returns true only if allowed. */
  private async reserve(n: number): Promise<boolean> {
    try {
      const stub = this.env.BUDGET_ROOM.get(this.env.BUDGET_ROOM.idFromName('global'))
      const r = (await (await stub.fetch(`https://b/reserve?n=${n}`, { method: 'POST' })).json()) as {
        allowed?: boolean
      }
      return r.allowed === true
    } catch {
      return false
    }
  }

  /** Run a RecordRoom tool as the app (RBAC-bypass). Returns the new recordId for create. */
  private async recordOp(tool: string, params: Record<string, unknown>): Promise<string | undefined> {
    const stub = this.env.RECORD_ROOMS.get(this.env.RECORD_ROOMS.idFromName(`app:${this.env.APP_NAME}`))
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': this.env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({ tool, params }),
      }),
    )
    const json = (await res.json()) as { success?: boolean; data?: { recordId?: string } }
    return json.success ? json.data?.recordId : undefined
  }

  /** Write the finished-game recap to the `games` collection (with the game id). */
  private async persistRecap(
    view: HubGameState,
    rec: { winnerName: string; winnerColor: string; winnerScore: number; payload: string },
  ): Promise<string | undefined> {
    try {
      return await this.recordOp('records.create', {
        collection: 'games',
        data: {
          game: view.game,
          roomCode: view.roomCode ?? '',
          winnerName: rec.winnerName,
          winnerColor: rec.winnerColor,
          winnerScore: rec.winnerScore,
          payload: rec.payload,
          finishedAt: Date.now(),
        },
      })
    } catch {
      return undefined
    }
  }

  /**
   * Upsert/remove this room's row in the public `rooms` registry, driven by
   * the engine's registryRow (non-null only for an open, public, connected
   * lobby — so abandoned rooms disappear). Returns whether `registryId`
   * changed (so the caller persists it on the state).
   */
  private async syncRegistry(
    view: HubGameState,
    eng: GameEngine,
    connected: string[],
  ): Promise<{ changed: boolean; registryId: string | null }> {
    const row = eng.registryRow(view, connected)
    // ~15s heartbeat bucket: an idle-but-ALIVE public lobby re-stamps its row
    // (the records.update path bumps the envelope updatedAt) so the landing can
    // use a short staleness window without hiding live lobbies that are just
    // waiting for more players. An abandoned room stops ticking, so its row
    // stops re-stamping and the window drops it.
    const beat = Math.floor(Date.now() / 15_000)
    const sig = row ? `on|${view.game}|${row.playerCount}|${row.name}|${beat}` : 'off'
    const unchanged = { changed: false, registryId: view.registryId ?? null }
    if (sig === this.regSig) return unchanged
    this.regSig = sig
    try {
      if (row) {
        const data = { game: view.game, roomCode: view.roomCode ?? '', name: row.name, playerCount: row.playerCount }
        if (view.registryId) {
          await this.recordOp('records.update', { collection: 'rooms', recordId: view.registryId, data })
          return unchanged
        }
        const id = (await this.recordOp('records.create', { collection: 'rooms', data })) ?? null
        if (!id) {
          this.regSig = '' // create failed — clear the throttle so we retry next tick
          return unchanged
        }
        // Race guard: the input gate is open across the outbound create fetch, so
        // the LAST human can leave mid-create. onPlayerLeave couldn't delete this
        // row (its id didn't exist yet), so do it here — never leave a freshly
        // created row with nobody in it.
        if (this.getPlayers().length === 0) {
          this.regSig = ''
          this.state.waitUntil(
            this.recordOp('records.delete', { collection: 'rooms', recordId: id }).catch(() => {}),
          )
          return { changed: true, registryId: null }
        }
        return { changed: true, registryId: id }
      }
      if (view.registryId) {
        await this.recordOp('records.delete', { collection: 'rooms', recordId: view.registryId })
        return { changed: true, registryId: null }
      }
      return unchanged
    } catch {
      this.regSig = '' // allow a retry on the next change
      return unchanged
    }
  }
}

// =============================================================================
// Types
// =============================================================================

export interface Env extends DOBindings<typeof __DO_MANIFEST__> {
  ASSETS: Fetcher
  /**
   * Upstream platform-worker. In production this is a [[services]] binding;
   * in `deepspace dev` the binding is absent and the helper falls back to
   * `PLATFORM_WORKER_URL` (written into .dev.vars by the CLI).
   *
   * R2 lives on the platform side, not the app: the `/api/files/*` route
   * below proxies to platform-worker `/internal/files/*` which serves a
   * shared `APP_FILES` bucket scoped per-app via the `?scope=` query:
   *   - `?scope=app`  → apps/<APP_NAME>/…       (per-app shared)
   *   - `?scope=self` → apps/<APP_NAME>/users/<userId>/…  (per-user, default)
   *
   * Apps don't need a local R2 binding for the standard flow. If you need
   * a wholly separate bucket, add `[[r2_buckets]]` to wrangler.toml AND a
   * field here — but prefer the proxied path so the platform retains
   * unified moderation / quota / cleanup hooks.
   */
  PLATFORM_WORKER?: Fetcher
  PLATFORM_WORKER_URL?: string
  APP_IDENTITY_TOKEN: string
  /**
   * Upstream api-worker. Same pattern as PLATFORM_WORKER above —
   * binding in prod, URL fallback in dev.
   */
  API_WORKER?: Fetcher
  API_WORKER_URL?: string
  AUTH_JWT_PUBLIC_KEY: string
  AUTH_JWT_ISSUER: string
  AUTH_WORKER_URL: string
  APP_NAME: string
  OWNER_USER_ID: string
  /**
   * Long-lived JWT minted for the app owner at deploy time. Server-side
   * code (actions, cron, AI helpers) uses this to authenticate to the
   * api-worker for developer-billed calls — the owner is billed because
   * they are the JWT subject.
   */
  APP_OWNER_JWT: string
  /**
   * Singleton budget DO (one instance, idFromName('global')). The GameRoom
   * driver asks it to reserve(1) before every owner-billed bot generation; it
   * serializes requests so the daily-cap read-modify-write is race-free. This
   * is the load-bearing abuse backstop (Guard 6). Already typed via the DO
   * manifest's DOBindings; declared explicitly here for documentation.
   */
  BUDGET_ROOM: DurableObjectNamespace
  /**
   * When set to "true", the app worker exposes /api/debug/* (set-role,
   * sql, query, records, status) by forwarding to the RecordRoom DO's
   * debug handler. Tests need this for role elevation and state cleanup.
   *
   * The CLI writes this to .dev.vars on `deepspace dev`/`deepspace test`
   * but never to production secrets, so deployed apps don't expose
   * debug routes by default.
   */
  ALLOW_DEBUG_ROUTES?: string
}

export type AppContext = { Bindings: Env }

// =============================================================================
// App
// =============================================================================

const app = new Hono<AppContext>()
app.use('/api/*', cors())

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

async function resolveAuth(req: Request, env: Env): Promise<VerifyResult | null> {
  const header = req.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  return (await verifyJwt(jwtConfig(env), token)).result
}

// ---------------------------------------------------------------------------
// Social OAuth redirect + code exchange
// ---------------------------------------------------------------------------

app.get('/api/auth/social-redirect', (c) => {
  const provider = c.req.query('provider')
  if (!provider) return c.json({ error: 'Missing provider' }, 400)

  const appOrigin = new URL(c.req.url).origin
  const authOrigin = new URL(c.env.AUTH_WORKER_URL).origin

  return c.redirect(
    `${authOrigin}/login/social?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(appOrigin)}`,
  )
})

app.get('/api/auth/oauth-complete', async (c) => {
  const code = c.req.query('code')
  const appOrigin = new URL(c.req.url).origin

  if (!code) return c.redirect(appOrigin)

  const res = await authWorkerFetch(c.env, '/api/auth/exchange-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!res.ok) return c.redirect(appOrigin)
  const data = (await res.json()) as { sessionToken?: string }
  if (!data.sessionToken) return c.redirect(appOrigin)
  const sessionToken = data.sessionToken

  return new Response(null, {
    status: 302,
    headers: {
      Location: appOrigin,
      'Set-Cookie': `__Secure-better-auth.session_token=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  })
})

app.all('/api/auth/sign-out', async (c) => {
  try {
    await authWorkerFetch(c.env, '/api/auth/sign-out', {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
    })
  } catch {
    // Still expire the app-scoped cookie below. A network/auth-worker
    // failure must not leave the browser immediately signed back in.
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': '__Secure-better-auth.session_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  })
})

// ---------------------------------------------------------------------------
// Auth proxy → auth-worker (same-origin cookies)
// ---------------------------------------------------------------------------

app.all('/api/auth/*', async (c) => {
  const url = new URL(c.req.url)
  const res = await authWorkerFetch(c.env, url.pathname + url.search, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })
  const headers = new Headers(res.headers)
  const setCookie = headers.get('set-cookie')
  if (setCookie) {
    headers.set('set-cookie', setCookie.replace(/;\s*Domain=[^;]*/gi, ''))
  }
  return new Response(res.body, { status: res.status, headers })
})

// ---------------------------------------------------------------------------
// Debug proxy → app's RecordRoom DO
//
// Forwards /api/debug/* (set-role, sql, query, records, user-role, status)
// to the DO's debug handler. The DO ships these endpoints unconditionally,
// so we gate the proxy on env.ALLOW_DEBUG_ROUTES === "true". The CLI
// writes that env var to .dev.vars on `deepspace dev`/`deepspace test`,
// never to deploy secrets — so production apps return 404 here.
// ---------------------------------------------------------------------------

app.all('/api/debug/*', async (c) => {
  if (c.env.ALLOW_DEBUG_ROUTES !== 'true') {
    return c.notFound()
  }
  const stub = c.env.RECORD_ROOMS.get(c.env.RECORD_ROOMS.idFromName(`app:${c.env.APP_NAME}`))
  // Forward verbatim, preserving method, headers, body, and the full URL
  // (the DO's debug handler dispatches on url.pathname).
  return stub.fetch(c.req.raw)
})

// ---------------------------------------------------------------------------
// Integrations proxy → api-worker
// ---------------------------------------------------------------------------

app.get('/api/integrations', async (c) => {
  try {
    const res = await apiWorkerFetch(c.env, '/api/integrations')
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Failed to fetch integration catalog' }, 502)
  }
})

// OAuth: per-user connection status. Always user-billed — must forward caller's JWT.
app.get('/api/integrations/status', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Sign in required' }, 401)
  const token = c.req.header('Authorization')?.slice(7)
  try {
    const res = await apiWorkerFetch(c.env, '/api/integrations/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Status proxy failed' }, 502)
  }
})

// OAuth: disconnect a provider for the calling user. Always user-billed.
app.delete('/api/integrations/oauth/:provider/disconnect', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Sign in required' }, 401)
  const token = c.req.header('Authorization')?.slice(7)
  const provider = c.req.param('provider')
  try {
    const res = await apiWorkerFetch(
      c.env,
      `/api/integrations/oauth/${encodeURIComponent(provider)}/disconnect`,
      {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Disconnect proxy failed' }, 502)
  }
})

app.all('/api/integrations/:name/:endpoint', async (c) => {
  const integrationName = c.req.param('name')
  const billingMode = integrations[integrationName]?.billing ?? 'developer'

  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth && billingMode === 'user') {
    return c.json({ error: 'Sign in required for this integration' }, 401)
  }

  const target = `/api/integrations/${integrationName}/${c.req.param('endpoint')}`

  const headers: Record<string, string> = {
    'Content-Type': c.req.header('Content-Type') ?? 'application/json',
  }

  // Pick the JWT whose subject is the user we want billed:
  //   - developer-billed → the app owner (via APP_OWNER_JWT)
  //   - user-billed      → the caller (forward their Bearer token)
  // The api-worker bills the JWT subject; it does not accept any
  // client-supplied billing override.
  if (billingMode === 'developer') {
    headers['Authorization'] = `Bearer ${c.env.APP_OWNER_JWT}`
  } else {
    const token = c.req.header('Authorization')?.slice(7)
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'
  const body = hasBody ? await c.req.text() : undefined

  try {
    const res = await apiWorkerFetch(c.env, target, {
      method: c.req.method,
      headers,
      body,
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Integration proxy failed' }, 502)
  }
})

// ---------------------------------------------------------------------------
// WebSocket routes
// ---------------------------------------------------------------------------

// The DO reads identity (userId, userName, userEmail, userImageUrl, role)
// off the URL it receives and trusts it. Anything the client put on the URL
// is stripped on every code path; identity is re-applied only from a
// verified JWT. Three states: no token = anonymous (the SDK's
// allowAnonymous flow), invalid token = 401, valid token = JWT identity.
function wsRoute(
  doNamespace: (env: Env) => DurableObjectNamespace,
  extraParams?: (auth: VerifyResult) => Record<string, string>,
) {
  return async (c: any) => {
    const id = c.req.param('roomId') ?? c.req.param('docId') ?? c.req.param('scopeId')
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')

    let auth: VerifyResult | null = null
    if (token) {
      auth = (await verifyJwt(jwtConfig(c.env), token)).result
      if (!auth) return new Response('Unauthorized', { status: 401 })
    }

    const doUrl = new URL(c.req.url)
    doUrl.searchParams.delete('token')
    for (const k of ['userId', 'userName', 'userEmail', 'userImageUrl', 'role']) {
      doUrl.searchParams.delete(k)
    }

    if (auth) {
      doUrl.searchParams.set('userId', auth.userId)
      if (auth.claims.name) doUrl.searchParams.set('userName', auth.claims.name)
      if (auth.claims.email) doUrl.searchParams.set('userEmail', auth.claims.email)
      if (auth.claims.image) doUrl.searchParams.set('userImageUrl', auth.claims.image)
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams(auth))) {
          doUrl.searchParams.set(k, v)
        }
      }
    }

    const ns = doNamespace(c.env)
    const stub = ns.get(ns.idFromName(id))
    return stub.fetch(new Request(doUrl.toString(), c.req.raw))
  }
}

app.get(
  '/ws/:roomId',
  wsRoute((env) => env.RECORD_ROOMS),
)

type DocsYjsRole = 'admin' | 'member' | 'viewer'

interface DocumentRecordForAccess {
  ownerId?: string
  collaborators?: string
  editors?: string
}

type DocumentAccessLookup =
  | { kind: 'found'; doc: DocumentRecordForAccess }
  | { kind: 'not-docs-room' }
  | { kind: 'error' }

function parseAccessList(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

async function getDocumentForAccess(
  env: Env,
  docId: string,
): Promise<DocumentAccessLookup> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.APP_NAME}`))
  try {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({
          tool: 'records.get',
          params: { collection: 'documents', recordId: docId },
        }),
      }),
    )
    const json = (await res.json()) as {
      success?: boolean
      error?: string
      data?: { record?: { data?: DocumentRecordForAccess } }
    }
    if (json.success && json.data?.record?.data) {
      return { kind: 'found', doc: json.data.record.data }
    }
    if (
      json.error === 'Record not found' ||
      json.error?.startsWith('Schema not registered for collection: documents')
    ) {
      return { kind: 'not-docs-room' }
    }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

async function resolveDocsYjsRole(
  env: Env,
  docId: string,
  userId: string,
): Promise<DocsYjsRole | null> {
  const lookup = await getDocumentForAccess(env, docId)
  if (lookup.kind === 'not-docs-room') return 'member'
  if (lookup.kind === 'error') return null
  const { doc } = lookup
  if (doc.ownerId === userId || userId === env.OWNER_USER_ID) return 'admin'

  const editors = parseAccessList(doc.editors)
  if (editors.includes(userId)) return 'member'

  const collaborators = parseAccessList(doc.collaborators)
  if (collaborators.includes(userId)) return 'viewer'

  return null
}

app.get('/ws/yjs/:docId', async (c) => {
  const docId = c.req.param('docId')
  const url = new URL(c.req.url)
  const token = url.searchParams.get('token')
  const auth = token ? (await verifyJwt(jwtConfig(c.env), token)).result : null
  if (!auth) return new Response('Unauthorized', { status: 401 })

  const role = await resolveDocsYjsRole(c.env, docId, auth.userId)
  if (!role) return new Response('Forbidden', { status: 403 })

  const doUrl = new URL(c.req.url)
  doUrl.searchParams.set('userId', auth.userId)
  doUrl.searchParams.set('role', role)
  doUrl.searchParams.delete('token')

  const stub = c.env.YJS_ROOMS.get(c.env.YJS_ROOMS.idFromName(docId))
  return stub.fetch(new Request(doUrl.toString(), c.req.raw))
})

app.get(
  '/ws/canvas/:docId',
  wsRoute(
    (env) => env.CANVAS_ROOMS,
    () => ({ role: 'member' }),
  ),
)

app.get(
  '/ws/presence/:scopeId',
  wsRoute(
    (env) => env.PRESENCE_ROOMS,
    (auth) => ({
      ...(auth.claims.name ? { userName: auth.claims.name } : {}),
      ...(auth.claims.email ? { userEmail: auth.claims.email } : {}),
      ...(auth.claims.image ? { userImageUrl: auth.claims.image } : {}),
    }),
  ),
)

app.get(
  '/ws/cron/:roomId',
  wsRoute(
    (env) => env.CRON_ROOMS,
    // Authenticated users get write access (trigger / pause / resume).
    // Anonymous connections fall through with no role and become viewers,
    // which CronRoom enforces as read-only. Apps that want stricter access
    // (e.g. owner-only) should replace this with an inline handler that
    // resolves role from app state — see the /ws/yjs route for the pattern.
    () => ({ role: 'member' }),
  ),
)

app.get(
  '/ws/jobs/:roomId',
  wsRoute((env) => env.JOB_ROOMS),
)

// Game room — party-game model: anyone with the 4-letter room code is a player
// (role=member), authenticated OR anonymous. The room code is the only gate, so
// nobody has to sign in. Identity comes ONLY from a verified JWT; anonymous
// players get an anon-<uuid> from the DO and self-identify via a localStorage
// `cid` sent in JOIN. (The generic wsRoute only grants role for authed
// connections, which would force anon → read-only viewer — hence this inline
// handler that sets role=member before the auth branch.)
app.get('/ws/game/:roomId', async (c) => {
  const id = c.req.param('roomId')
  const url = new URL(c.req.url)
  const token = url.searchParams.get('token')

  let auth: VerifyResult | null = null
  if (token) {
    auth = (await verifyJwt(jwtConfig(c.env), token)).result
    if (!auth) return new Response('Unauthorized', { status: 401 })
  }

  const doUrl = new URL(c.req.url)
  doUrl.searchParams.delete('token')
  for (const k of ['userId', 'userName', 'userEmail', 'userImageUrl', 'role']) {
    doUrl.searchParams.delete(k)
  }
  doUrl.searchParams.set('role', 'member') // the crux: members can write; anon included
  if (auth) {
    doUrl.searchParams.set('userId', auth.userId)
    if (auth.claims.name) doUrl.searchParams.set('userName', auth.claims.name)
    if (auth.claims.image) doUrl.searchParams.set('userImageUrl', auth.claims.image)
  }

  const ns = c.env.GAME_ROOMS
  const stub = ns.get(ns.idFromName(id))
  return stub.fetch(new Request(doUrl.toString(), c.req.raw))
})

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

app.post('/api/actions/:name', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const name = c.req.param('name')
  const action = actions[name]
  if (!action) return c.json({ error: 'Action not found' }, 404)
  const params = await c.req.json<Record<string, unknown>>()
  const callerJwt = c.req.header('Authorization')!.slice(7)
  const tools = createActionTools(c.env, auth.userId, callerJwt)
  const result = await action({ userId: auth.userId, params, tools, env: c.env, callerJwt })
  return c.json(result as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// AI chat — multi-turn tool-use via Vercel AI SDK + DeepSpace proxy
// ---------------------------------------------------------------------------

// Routes implementation lives in `src/ai/chat-routes.ts` to keep this file
// focused on app-level wiring. `resolveAuth` is passed in to avoid a runtime
// circular import (chat-routes imports `Env`/`AppContext` as types only).

// ---------------------------------------------------------------------------
// Scoped R2 files → platform-worker
//
// The app has no local R2 binding by design; the platform-worker holds a
// shared `APP_FILES` bucket and scopes keys per-app via the `?scope=`
// query string:
//
//   POST   /api/files/upload?scope=app    → uploads under apps/<APP_NAME>/
//   POST   /api/files/upload              → uploads under apps/<APP_NAME>/users/<userId>/
//   GET    /api/files                     → list (same scoping)
//   GET    /api/files/<key>               → public read (no auth)
//   DELETE /api/files/<key>               → delete (auth required, scope-checked)
//
// Use `?scope=app` for content that belongs to the app as a whole (library
// preview images, AI-generated assets, etc.). Use the default user scope
// for per-user uploads (avatars, project assets). All write paths require
// a signed user JWT; reads are public.
// ---------------------------------------------------------------------------

app.all('/api/files/*', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  const userId = auth?.userId ?? null

  const url = new URL(c.req.url)
  const platformUrl = new URL(c.req.url)
  platformUrl.pathname = url.pathname.replace('/api/files', '/internal/files')

  const headers = new Headers(c.req.raw.headers)
  // Strip any caller-supplied identity before re-asserting from the verified
  // JWT. platform-worker trusts `x-user-id` (gated by the HMAC'd app-identity
  // token) to scope `?scope=self` keys, so leaking a spoofed header here would
  // let an unauthenticated browser read another user's files.
  headers.delete('x-user-id')
  headers.set('x-app-identity-token', c.env.APP_IDENTITY_TOKEN)
  headers.set('x-app-name', c.env.APP_NAME)
  if (userId) headers.set('x-user-id', userId)

  const resp = await platformWorkerFetch(
    c.env,
    new Request(platformUrl.toString(), {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
    }),
  )

  // Rewrite URLs in JSON responses to use the app's origin
  const contentType = resp.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await resp.json()) as Record<string, unknown>
    const rewriteUrl = (u: string) => u.replace(/^https?:\/\/[^/]+/, url.origin)
    if (typeof body.url === 'string') body.url = rewriteUrl(body.url)
    if (Array.isArray(body.files)) {
      for (const f of body.files as Array<Record<string, unknown>>) {
        if (typeof f.url === 'string') f.url = rewriteUrl(f.url)
      }
    }
    return c.json(body, resp.status as any)
  }

  return new Response(resp.body, { status: resp.status, headers: resp.headers })
})

// ---------------------------------------------------------------------------
// /_deepspace/* — same-origin proxy to api-worker for authenticated SDK
// hooks. Attaches APP_IDENTITY_TOKEN + APP_NAME so the browser never sees
// the platform secret. Every request requires a signed user JWT.
//
// SECURITY: exact (method, path) allowlist — not a prefix match. A prefix
// match leaks deploy/CLI surfaces like POST /api/subscriptions/sync into the
// browser context, where an XSS or compromised user session can become a
// confused deputy. Adding a new browser hook in the SDK requires explicitly
// extending the BROWSER_PROXY_ROUTES tuple below.
// ---------------------------------------------------------------------------

interface ProxyRoute {
  method: string
  path: string
  /** Skip the user-JWT gate. Default false. Pricing tables are public. */
  publicRead?: boolean
  /** Inject `?appName=...` (from env) into the forwarded URL. Default false. */
  injectAppName?: boolean
}

const BROWSER_PROXY_ROUTES: ReadonlyArray<ProxyRoute> = [
  // useSubscription — read state, subscribe, manage billing.
  { method: 'GET',  path: '/_deepspace/subscriptions/me' },
  { method: 'POST', path: '/_deepspace/subscriptions/checkout' },
  { method: 'POST', path: '/_deepspace/subscriptions/portal' },
  // useCheckout (one-time charges)
  { method: 'POST', path: '/_deepspace/charges/create' },
  { method: 'GET',  path: '/_deepspace/charges/me' },
]

app.all('/_deepspace/*', async (c) => {
  const url = new URL(c.req.url)
  const method = c.req.method
  const route = BROWSER_PROXY_ROUTES.find(
    (r) => r.method === method && r.path === url.pathname,
  )
  if (!route) {
    return c.json({ error: 'not_found' }, 404)
  }

  // Public-read routes (pricing tables) skip the JWT gate. Everything else
  // requires a signed-in user.
  let auth: Awaited<ReturnType<typeof resolveAuth>> | null = null
  if (!route.publicRead) {
    auth = await resolveAuth(c.req.raw, c.env)
    if (!auth?.userId) return c.json({ error: 'unauthorized' }, 401)
  }

  // Inject appName into the query string when the route needs it. We can't
  // rely on the HMAC header for routes the platform serves without HMAC
  // (e.g. /plans is public). Use URLSearchParams.set so we OVERWRITE any
  // caller-supplied appName — otherwise a request to
  // `/_deepspace/subscriptions/plans?appName=other_app` would forward a
  // duplicate-key query string and the platform would pick whichever value
  // its parser sees first.
  const forwardedParams = new URLSearchParams(url.search)
  if (route.injectAppName) {
    forwardedParams.set('appName', c.env.APP_NAME)
  }
  const queryString = forwardedParams.toString()
  const apiPath =
    url.pathname.replace('/_deepspace/', '/api/') + (queryString ? `?${queryString}` : '')

  const headers = new Headers(c.req.raw.headers)
  headers.delete('x-user-id')
  headers.set('x-app-identity-token', c.env.APP_IDENTITY_TOKEN)
  headers.set('x-app-name', c.env.APP_NAME)
  if (auth?.userId) headers.set('x-user-id', auth.userId)

  return apiWorkerFetch(c.env, apiPath, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : c.req.raw.body,
  })
})

// ---------------------------------------------------------------------------
// Static assets (SPA fallback)
// ---------------------------------------------------------------------------

app.get('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw)
  if (response.status === 404) {
    const url = new URL(c.req.url)
    url.pathname = '/index.html'
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw))
  }
  return response
})

// =============================================================================
// Action Tools — route to app's own RecordRoom DO
// =============================================================================

function createActionTools(env: Env, userId: string, callerJwt: string): ActionTools {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.APP_NAME}`))

  // Internal helper — DO returns `ActionResult<unknown>`. Callers below
  // cast to the precisely-typed result for each operation. The cast is
  // safe because the wire shape is set by the SDK's tools-api handler.
  async function execTool<TData>(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult<TData>> {
    const res = await stub.fetch(new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-App-Action': 'true',
      },
      body: JSON.stringify({ tool, params }),
    }))
    return res.json() as Promise<ActionResult<TData>>
  }

  async function callIntegration<T>(
    endpoint: string,
    data?: unknown,
  ): Promise<ActionResult<T>> {
    const integrationName = endpoint.split('/')[0]
    const billingMode = integrations[integrationName]?.billing ?? 'developer'

    // Use the owner JWT for developer-billed calls, the caller's JWT otherwise.
    // The api-worker bills the JWT subject — no client-supplied override.
    const jwt = billingMode === 'developer' ? env.APP_OWNER_JWT : callerJwt

    const res = await apiWorkerFetch(env, `/api/integrations/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(data ?? {}),
    })
    return res.json() as Promise<ActionResult<T>>
  }

  return {
    create: (collection, data) => execTool('records.create', { collection, data }),
    update: (collection, recordId, data) =>
      execTool('records.update', { collection, recordId, data }),
    remove: (collection, recordId) => execTool('records.delete', { collection, recordId }),
    get: (collection, recordId) => execTool('records.get', { collection, recordId }),
    query: (collection, options) => execTool('records.query', { collection, ...options }),
    integration: callIntegration,
    registerUser: (opts) => execTool('users.register', { ...opts }),
  }
}

export default app
