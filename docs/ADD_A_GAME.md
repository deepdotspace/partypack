# Adding a game to Party Pack

This guide walks through adding a fourth game ("Doodle", a drawing-guess game) as a concrete example. Every claim here is verified against the existing code — the contracts, type signatures, and conventions are copied from the source, not from memory.

---

## 1. Add a registry entry

Edit `src/games/registry.ts`. Add `'doodle'` to the `GameId` union and add a `GameMeta` record to `GAMES`.

```ts
// src/games/registry.ts

export type GameId = 'wisecrack' | 'baloney' | 'pitch' | 'doodle'

// In GAMES:
doodle: {
  id: 'doodle',
  title: 'Doodle',
  tagline: 'Draw it. Guess it. Own it.',
  blurb: 'You get a secret word, 45 seconds, and a terrible finger. Everyone else guesses.',
  accent: 'cyan',        // primary accent token — must be a token with --color-* and --glow-* CSS vars
  accent2: 'violet',     // secondary accent token
  minPlayers: 3,
  maxPlayers: 8,
  howTo: [
    'You get a secret word. Draw it with your finger in 45 seconds.',
    'Everyone else types guesses in real time.',
    'First correct guess earns the guesser and the artist a point.',
  ],
},
```

The `accent` / `accent2` string values must be token names from the LATE NIGHT design system that have corresponding `--color-<token>` and `--glow-<token>` CSS variables in `src/styles.css`. The existing games use: `lime`, `magenta`, `tangerine`, `gold`, `cyan`, `violet`. Pick from those or add your own tokens first.

Also update `isGameId` at the bottom of the file:

```ts
export function isGameId(x: unknown): x is GameId {
  return x === 'wisecrack' || x === 'baloney' || x === 'pitch' || x === 'doodle'
}
```

---

## 2. Module layout

Create `src/games/doodle/`. Model it on `src/games/baloney/` — the cleanest mid-size example in the repo. A minimal new game needs:

```
src/games/doodle/
  types.ts       — GameState (extends HubGameState), phases, config, player shape
  engine.ts      — initialState, reduce, and the phase-transition machine
  index.ts       — the GameEngine + GameBots objects the dispatch table uses
  personas.ts    — bot persona data (if your game has bots)
  validation.ts  — input sanitization helpers (pure)
  scoring.ts     — scoring helpers (pure)
  shuffle.ts     — seeded-random helpers (pure)
  text.ts        — string normalization, rng utilities (pure)
  Play.tsx       — the phone view (imports ControllerShell)
  Stage.tsx      — the TV view (imports StageShell)
  useYourGame.ts — client hook wrapping the room object from the route
```

The `src/games/baloney/content/` sub-folder holds the question pool; add something equivalent (prompt packs, word lists, etc.) to keep content separate from logic.

Keep every file in `src/games/doodle/` **pure**: no `deepspace` imports, no React, no Cloudflare bindings in `types.ts`, `engine.ts`, `index.ts`, or any helper. The hub DO owns all I/O. The UI files (`Play.tsx`, `Stage.tsx`) are the only places React and the SDK belong.

---

## 3. The engine contract

### `HubGameState` — the spine every GameState extends

`src/games/spine.ts` defines the minimum shape the hub DO reads:

```ts
export interface HubGameState {
  game: GameId
  phase: string
  roomCode?: string          // captured from the first client JOIN (engine-managed)
  registryId?: string | null // recordId of the public-registry row (DO-managed)
  recapId?: string | null    // recordId of the podium recap (DO-managed)
}
```

Your `GameState` must extend `HubGameState`:

```ts
// src/games/doodle/types.ts
import type { HubGameState } from '../spine'

export interface GameState extends HubGameState {
  game: 'doodle'
  phase: Phase
  // ... your fields
}
```

**Spine contract (critical).** The DO writes `registryId` and `recapId` onto the state. Your reducer must carry those fields through unchanged. Clone-based reducers (`structuredClone(prev)` at the top of `reduce`) do this automatically — this is the pattern all three existing engines use. Never overwrite or delete those fields inside `reduce`.

**`phase === 'LOBBY'` convention.** The hub DO reads `view.phase === 'LOBBY'` in two places:
- It resets the per-game-session bot-call budget counter (`botCalls = 0`) when the room returns to LOBBY.
- It also clears `recapId` from the state when the room returns to LOBBY (so PLAY_AGAIN generates a fresh recap next podium).

Name your pre-game phase `'LOBBY'`.

**`roomCode` convention.** The engine must capture `data.roomCode` from the first client JOIN input and store it on the state. The DO reads `view.roomCode` when writing recap and registry rows. The existing pattern:

```ts
case 'JOIN': {
  if (!draft.roomCode && typeof data.roomCode === 'string') {
    draft.roomCode = data.roomCode.slice(0, 8).toUpperCase()
  }
  // ...
}
```

### `GameEngine` — the full contract

```ts
// from src/games/engines.ts

export interface GameEngine {
  initialState(seed: number): HubGameState

  reduce(prev: HubGameState, inputs: RawInput[], ctx: ReduceCtx): HubGameState | undefined

  content: unknown  // your content pool — passed back as ctx.content each tick

  bots: GameBots | null  // null for a game without AI players

  recap(
    state: HubGameState,
  ): { winnerName: string; winnerColor: string; winnerScore: number; payload: string } | null

  registryRow(state: HubGameState, connected: string[]): { name: string; playerCount: number } | null
}
```

### `reduce` semantics

```ts
// from src/games/spine.ts

export interface RawInput {
  userId: string   // server-stamped — the DO sets this; never trust data.userId
  action: string
  data?: Record<string, unknown>
  tick?: number
}

export interface ReduceCtx<Content = unknown> {
  now: number         // wall clock epoch-ms injected by the DO
  connected: string[] // userIds with a live WebSocket (bots never connect)
  content: Content    // your engine's content pool, passed back verbatim
}
```

`reduce` is called every DO tick with the full input batch for that tick. Return the next state (a new object — never mutate `prev`) or `undefined` to signal no change (the DO skips the broadcast on `undefined`). The pattern all three engines follow is `structuredClone(prev)` at entry, then mutate the clone, return it if `changed`, else `undefined`.

### `recap`

Return non-null exactly at PODIUM when there is a winner. The DO writes one record to the `games` collection and sets `state.recapId` as the once-guard. Your engine must NOT reset `recapId` on PLAY_AGAIN — the DO handles that. The `payload` field is a JSON string; include whatever the recap page needs to display standings and a highlight moment.

```ts
recap(state) {
  const s = state as GameState
  if (s.phase !== 'PODIUM' || !s.summary) return null
  const winner = s.summary.standings[0]
  return {
    winnerName: winner?.name ?? '—',
    winnerColor: winner?.color ?? '#27E1FF',
    winnerScore: winner?.score ?? 0,
    payload: JSON.stringify({
      standings: s.summary.standings.map((p) => ({ name: p.name, color: p.color, score: p.score })),
      // game-specific highlight moment:
      bestGuess: s.summary.bestGuess ?? null,
    }),
  }
}
```

### `registryRow`

Return non-null only for an open, public LOBBY with a free seat and at least one connected seated player. The `connected` array comes from the DO's live socket roster — bots never hold sockets, so every id in `connected` is a human. The DO upserts or deletes the `rooms` collection row based on what you return here, every tick.

```ts
registryRow(state, connected) {
  const s = state as GameState
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
}
```

### MAX_BOTS — engine-enforced seat cap (spend Guard 4)

The hub DO never counts bot seats. Enforce `MAX_BOTS` inside `reduce` on the `ADD_BOT` action:

```ts
case 'ADD_BOT': {
  if (!isHost || draft.phase !== 'LOBBY') return noop()
  if (draft.order.length >= MAX_PLAYERS) return noop()
  if (draft.order.filter((id) => draft.players[id]?.isBot).length >= MAX_BOTS) return noop()
  // ... seat the bot
}
```

Keep `MAX_BOTS` at 3 or lower. Each generation is one API call billed to the owner.

---

## 4. GameBots — what the hub provides vs. what you must provide

### What the hub does for you

The DO in `worker.ts` drives all bot mechanics between ticks, fire-and-forget:

- Calls `bots.needsGeneration(view)` every tick to get the pending task list.
- Deduplicates against already-in-flight generations (one per `botId:task` key).
- Calls the integrations proxy with `bots.buildSystemPrompt(persona, view)` and `bots.buildUserPrompt(task)` as the Anthropic chat-completion body.
- Enforces `BOT_CALL_TIMEOUT_MS = 25000` — if the Opus call is slow the bot falls back to the canned line and the phase does not stall.
- On any failure (network error, timeout, budget deny) calls `bots.fallback(persona, task)` and submits that instead.
- Calls `bots.pickCandidate(raw, task)` on the model output. If `pickCandidate` returns `null` (bad format or pre-validation failure), the hub re-rolls up to 2 more times before falling back.
- Wraps a finished result as a `RawInput` via `bots.submitInput(botId, text, view)` and queues it for the next tick's reduce.
- Calls `bots.heuristicVotes(view)` every tick and queues the returned moves as synthetic inputs.

### What you must provide

```ts
// from src/games/engines.ts

export interface GameBots {
  needsGeneration(state: HubGameState): BotTask[]
  buildSystemPrompt(persona: string, state: HubGameState): string
  buildUserPrompt(task: string): string
  pickCandidate(raw: string, task: string): string | null
  fallback(persona: string, task: string): string
  submitInput(botId: string, text: string, state: HubGameState): { action: string; data: unknown }
  heuristicVotes(state: HubGameState): Array<{ botId: string; action: string; data: unknown }>
  maxTokens: number
}

export interface BotTask {
  botId: string
  persona: string
  task: string  // doubles as the in-flight/dedupe key suffix — must be unique per generation unit
}
```

**`needsGeneration`** — return tasks for bots that still need an LLM result in the current state. Called every tick; must be derived purely from state (no side effects). The hub deduplicates against in-flight and already-queued work.

**`pickCandidate`** — extract one usable string from the raw model output; return `null` if the output is malformed or you want a re-roll. **Pre-screen with your own validation** before returning. If your engine's `reduce` would reject the value (e.g. it matches the truth in Baloney), return `null` here so the hub re-rolls instead of burning an attempt on a guaranteed rejection.

**`fallback`** — a canned in-voice line for the bot's persona, used when the budget is exhausted, the call fails, or all re-rolls are used. Must be guaranteed-valid: it will be submitted directly to `reduce` via `submitInput` with no further validation by the hub.

**`submitInput`** — wrap the finished text as the synthetic input the reducer will consume. You own the action name and data shape. The hub passes this back through `reduce` like any other input. Your reducer must handle it correctly (validate, accept or reject).

**`maxTokens`** — keep this small. A party-game quip is 5-15 words. Baloney/Pitch use 64. This directly bounds per-call cost.

---

## 5. Recap and registry integration

The hub writes to two collections automatically. You do not need to call any SDK from your engine.

**`games` collection** (defined in `src/schemas/games-schema.ts`): one record per completed game. Written by the DO at the first tick where `eng.recap(view)` returns non-null and `view.recapId` is not yet set. Publicly readable (anonymous shareable links).

**`rooms` collection** (defined in `src/schemas/rooms-schema.ts`): one row per open, joinable public lobby. Written/updated every tick based on `eng.registryRow(view, connected)`. Deleted (and `registryId` cleared) when you return `null`. The landing page reads this collection via `useQuery('rooms')` to show open rooms.

---

## 6. Stage and Play views

Both views receive `GameViewProps` from the route:

```ts
// src/games/roomApi.ts

export interface GameViewProps {
  code: string   // normalized 4-letter room code
  room: RoomApi  // the route-owned useGameRoom connection
}
```

Mount your views inside the shared shells. The shells handle the Backdrop, the room-code pill, the leave button, the mute toggle, the disconnect banner, and phase crossfades.

### Stage (TV)

```tsx
import { StageShell } from '../../shared/shells'
import { GAMES } from '../registry'
import type { GameViewProps } from '../roomApi'

export default function Stage({ code, room }: GameViewProps) {
  const state = room.state as GameState | undefined
  const meta = GAMES.doodle

  return (
    <StageShell
      accent={meta.accent}
      accent2={meta.accent2}
      code={code}
      phaseKey={state?.phase ?? 'loading'}   // keys the AnimatePresence crossfade
    >
      {/* phase-specific content here */}
    </StageShell>
  )
}
```

`StageShell` takes `accent` / `accent2` as token names (`'cyan'`, `'violet'`, etc.), not hex values. Use `accentVar(token)` / `accentGlow(token)` from `src/shared/shells.tsx` when you need the CSS variable in inline styles.

**Stage design rule:** the Stage is maximal. It owns the full viewport, shows all players, and drives the narrative (phase splashes, countdowns, reveals, leaderboards). It never takes input.

### Play (phone controller)

```tsx
import { ControllerShell } from '../../shared/shells'
import { GAMES } from '../registry'
import type { GameViewProps } from '../roomApi'

export default function Play({ code, room }: GameViewProps) {
  const state = room.state as GameState | undefined
  const meta = GAMES.doodle
  // resolve "me" from state.players by matching cid from localStorage

  return (
    <ControllerShell
      accent={meta.accent}
      code={code}
      myName={me?.name}
      myColor={me?.color}
      connected={room.connected}
      dataPhase={state?.phase}
    >
      {/* one task per screen */}
    </ControllerShell>
  )
}
```

**Controller design rule:** the controller is monastic. One task per screen, giant tap targets (`min-h-[56px]` buttons), no decoration that competes with the task. Players are reading a phone 1–5 m from a TV while talking.

### Sending inputs

The route owns the `useGameRoom` connection and passes the `room` object down. Send inputs from `Play.tsx`:

```ts
room.send({ action: 'SUBMIT_GUESS', data: { text: guess } })
```

The DO stamps `userId` server-side before handing it to `reduce` — never include `userId` in `data`.

### Shared identity model

Players are anonymous. Each device mints a `cid` in localStorage via `readCid(role)` from `src/shared/identity.ts`. Send `cid` in the JOIN payload; the engine uses it to rebind the seat when a player reconnects with a new connection id. The pattern is in `engine.ts` JOIN handling — copy it verbatim.

---

## 7. Register in ENGINES and VIEWS

### ENGINES

Edit `src/games/engines.ts`. Import your engine and add it to the dispatch table:

```ts
import { doodleEngine } from './doodle'

export const ENGINES: Partial<Record<GameId, GameEngine>> = {
  wisecrack: wisecrackEngine,
  baloney: baloneyEngine,
  pitch: pitchEngine,
  doodle: doodleEngine,    // add this line
}
```

### VIEWS

Edit `src/games/views.ts`. Add the lazy imports:

```ts
export const VIEWS: Record<GameId, GameViews> = {
  wisecrack: { ... },
  baloney: { ... },
  pitch: { ... },
  doodle: {
    Stage: lazy(() => import('./doodle/Stage')),
    Play: lazy(() => import('./doodle/Play')),
  },
}
```

After this step the landing page will render a Doodle poster with a HOST button, and the join/dispatch flow will route to your new views.

---

## 8. Testing

### Unit tests

Write vitest specs for every pure helper and for the reducer. The convention in this repo is one `*.test.ts` file per source module:

- `engine.test.ts` — the main spec. Use the pattern from `src/games/baloney/engine.test.ts`: a `step()` helper that runs `reduce` with a `ctx`, a `join()` helper that seats a batch of players, and per-action `describe` blocks. Cover at minimum:
  - JOIN seats players; first joiner gets host role.
  - `roomCode` is captured from the first JOIN.
  - Game starts when MIN_PLAYERS are seated and host sends START_GAME.
  - Every phase transitions on early-completion predicate AND on timer expiry.
  - LOBBY/PODIUM have no timer (`phaseEndsAt === null`).
  - `registryId` and `recapId` survive every phase transition unchanged.
  - PLAY_AGAIN resets to LOBBY; scores are zeroed; `recapId` is NOT touched by the engine (the DO does that).
  - Bot ADD_BOT is capped at MAX_BOTS.
- `scoring.test.ts`, `validation.test.ts`, `shuffle.test.ts`, `text.test.ts` — one `describe` block per exported function.
- `index.test.ts` — contract tests on the `GameEngine` object: `recap` returns non-null exactly at PODIUM with a summary; `registryRow` lists only open public lobbies with connected players; bot hooks (`needsGeneration`, `pickCandidate`, `fallback`, `submitInput`) behave correctly including the re-roll loop (a bot that generates a rejected candidate reappears in `needsGeneration`).

Run unit tests:

```sh
npm run test:unit
```

### E2E spec

Add `tests/doodle.spec.ts` modeled on `tests/baloney.spec.ts`. The spec should:

1. Create a Stage page and 3+ phone browser contexts (each its own `browser.newContext()`).
2. Navigate the Stage to `/stage/CODE?g=doodle`.
3. Navigate phone 1 to `/play/CODE?g=doodle` (this binds the room); later phones need no `?g=`.
4. Join from each phone; host starts the game.
5. Drive every actionable phase with a polling loop: submit answers when the input is visible, vote when ballot cards appear.
6. Assert `sawAnswerLocked`, `sawVoteBoard`, `sawReveal`, and `podium` all become `true`.
7. Assert the podium renders a winner on both the Stage and the phones.
8. Take `stage.screenshot(...)` per phase into `docs/shots/`.

Run E2E tests:

```sh
npx deepspace test e2e
```

---

## 9. Common pitfalls

**Early-advance predicates must wait on bots.** The `earlyComplete` predicate (e.g. "all answers submitted") must check `state.order` — which includes bot ids. A bot's answer is queued as a synthetic input for the next tick; if your predicate fires the moment human answers are in, the round advances before bots have submitted, and they never submit at all. The fix: check that every `order` member has an entry in the relevant record (`lies`, `answers`, etc.) — bots write their synthetic input just like a human would.

**Seeded shuffles for determinism.** Use a seeded RNG (see `src/games/baloney/text.ts`'s `makeRng`) for any shuffle that affects game outcome. `Math.random()` in a reducer means server and test see different orderings. The pattern: seed with `(state.seed ^ roundIndex * constant) >>> 0`, pick from the array with the rng.

**Clone-based reducer = safe spine carry-through.** `structuredClone(prev)` at the top of `reduce` means `registryId` and `recapId` flow through every returned state automatically. If you use any other pattern (e.g. spread), manually include those fields in every return path.

**Phase transitions must be idempotent.** The while-loop in the existing engines advances until no predicate fires. If an `advance` function sets a phase and also satisfies the next phase's early predicate, it advances again in the same tick — this is intentional (e.g. WRITE→VOTE when all answers are already in). Write `earlyComplete` so it only fires when there is real work to advance past.

**Spectators cannot gate a round.** Players who join mid-game or after the seats are full become spectators. They must not appear in `order` (the seated array) and must not be checked in early-completion predicates. The `order` array is seated contestants only; `players` holds everyone including spectators.

**`data.userId` is untrusted.** The DO stamps `userId` on `RawInput` from the verified JWT (or the anonymous-id the DO assigned). Never read `input.data.userId` to determine identity. Use `input.userId`.

**cid rebinding on reconnect.** Mobile browsers disconnect on background. When a player reconnects they get a new WebSocket connection id, but their `cid` from localStorage is the same. Implement cid rebinding in JOIN (copy the pattern from `baloney/engine.ts`'s JOIN handler) so reconnecting players keep their seat, score, and any in-flight round work (lies, votes, etc.).

**Read the engine code comments.** Each existing engine's `engine.ts` has inline comments explaining the non-obvious choices — early-advance races, host handoff, spectator role enforcement, the `registryId`/`recapId` note in `resetForNewGame`. Read them before porting from memory.
