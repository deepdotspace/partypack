# Party Pack

Three party games on one room code, no sign-up required. Players join from their phones; an optional TV stage shows the action on a big screen.

Live at **[partypack.app.space](https://partypack.app.space)**

---

## The games

| Game | Players | What you do |
|---|---|---|
| **Wisecrack** | 3–8 | Fill in the blank with the funniest answer. Rivals go head-to-head; the room votes. |
| **Baloney** | 2–8 | Read a weird-but-true trivia question, write a convincing lie, then spot the real answer. |
| **Pitch** | 3–8 | Invent a name and one-line pitch for a product nobody asked for, then convince the room to buy yours. |

All three games are anonymous: no accounts, no passwords, no email addresses. A 4-letter room code is the only gate.

---

## How to play

1. One person clicks **Host** on any game poster at partypack.app.space — this creates a room with a fresh 4-letter code.
2. The host shares that code. Everyone else types it into the JOIN strip and hits Join.
3. For the big-screen experience, open `/stage/CODE` on a TV or laptop in the room. The stage shows the game in broadcast-style with phase-paced reveals; phones are the controllers.

Room codes are 4 letters from a 24-character alphabet (no I or O, to avoid 1/0 mix-ups on a TV read).

---

## Architecture

One Durable Object (DO) per room. All three games run inside the same `AppGameRoom` class; the DO delegates every rule to the matching engine from a dispatch table.

```
Browser (phone)          Browser (TV)
   useGameRoom()  <--WebSocket--> AppGameRoom DO
                                       |
                   ┌───────────────────┤
                   |   onTick(state, inputs, tick)
                   |       1. fold in pending bot inputs
                   |       2. ENGINES[state.game].reduce(state, allInputs, ctx)
                   |       3. driveBots(view, engine)  ← fire-and-forget
                   |       4. syncRegistry(view)       ← upsert/delete rooms row
                   |       5. persistRecap(view)       ← write games row at PODIUM
                   └───────────────────────────────────
                   
                   AppBudgetRoom DO (singleton)
                       tryReserve(n, DAILY_BOT_CAP)    ← atomic read-modify-write
```

**Pre-state and binding.** Every room starts in a `{ game: null }` pre-state. The first JOIN that carries a valid `?g=<gameId>` and a registered engine calls `engine.initialState(seed)` and binds the room to that engine permanently. Later joiners need no `?g=` parameter — the broadcast state carries the bound game id.

**Pure reducer engines.** Each game module exports a `GameEngine`:

- `initialState(seed)` — deterministic starting state seeded for shuffles.
- `reduce(prev, inputs[], ctx)` — a pure function. Returns the next state or `undefined` for no-change idle ticks. Must carry the DO-managed spine fields (`registryId`, `recapId`) through unchanged; clone-based reducers get this for free.
- `content` — the engine's content pool (questions, prompts, briefs), passed back via `ctx.content` each tick.
- `bots` — `GameBots` hooks, or `null` for a game without AI players.
- `recap(state)` — the finished-game summary when at PODIUM; the DO writes it to the `games` collection once per session.
- `registryRow(state, connected)` — the public-rooms listing row, or `null` to delist. Non-null only for an open LOBBY with a free seat and at least one connected human player.

**GameBots.** The DO drives all bot mechanics (fire-and-forget LLM calls, in-flight deduplication, fallback on failure or timeout, heuristic free votes). The engine supplies the game knowledge via `GameBots`: which bots need a generation, how to build prompts, how to validate and extract a candidate, what the fallback line is, how to wrap a result as a reducer input.

**Shared design system.** All three games render inside `StageShell` (TV, full-bleed) and `ControllerShell` (phone, centered column) from `src/shared/shells.tsx`. Colors, motion tokens, SFX, and background music are shared across games via `src/shared/`.

---

## Local development

One-time login (opens a browser tab):

```sh
npx deepspace login
```

Dev server (Vite + Cloudflare Worker in-process, HMR on localhost:5173):

```sh
npx deepspace dev
```

Run tests:

```sh
npx deepspace test          # smoke + api + 3 full-game E2E playthroughs
npm run test:unit           # vitest only (267 unit tests across all three engines)
```

Deploy to partypack.app.space:

```sh
npx deepspace deploy
```

Type check:

```sh
npm run type-check          # tsc --noEmit
```

---

## Tests

**Unit tests (vitest):** 267 tests across the three game engines — reducer correctness, scoring, shuffles, validation, chat, bot hooks, recap timing, registry listing/delisting, and DO-managed field carry-through.

**E2E specs (Playwright):** one full-game anonymous playthrough per game (`wisecrack.spec.ts`, `baloney.spec.ts`, `pitch.spec.ts`), each spinning up a Stage + 3 phone contexts in separate browser contexts and driving the game to the podium. Plus `smoke.spec.ts` (landing loads, three posters, join strip, 404) and `api.spec.ts` (auth proxy, WebSocket endpoint).

---

## AI bots and cost guardrails

The host can seat up to 3 AI bots per room so a short group can play without waiting for strangers. Bots are billed to the app owner (not to players), using claude-opus-4-8. Six guards limit spend:

1. **Per-call output cap** — each engine sets `bots.maxTokens` (64 tokens for Baloney/Pitch — a quip is a few words).
2. **Server-built prompts** — system and user prompts are assembled 100% server-side; no client input reaches a prompt builder.
3. **One in-flight generation per bot per task** — the DO deduplicates; after 2 rejected re-rolls it falls back to a canned line.
4. **MAX_BOTS per room** — enforced inside each engine's reducer on ADD_BOT.
5. **At least one connected human** — bots never hold WebSocket connections; if no humans are connected the DO skips all LLM calls.
6. **DAILY_BOT_CAP = 2000** — a singleton `AppBudgetRoom` DO serializes a daily counter. Every generation must reserve a slot before the call. At UTC midnight the counter resets. This is the hard ceiling regardless of how many rooms exist.

The per-game-session cap (`BOT_CALL_CAP = 50`) and per-room lifetime cap (`ROOM_BOT_LIFETIME = 300`) add inner layers so a single play-again-looping room can't exhaust the daily budget alone.

---

## Adding a game

Party Pack is designed for forking. The hub DO knows nothing about game rules — it only calls the contracts. Adding game #4 means writing a module that fulfils `GameEngine` and `GameBots`, registering it in two lookup tables, and adding the two lazy UI views.

See **[docs/ADD_A_GAME.md](docs/ADD_A_GAME.md)** for the full walkthrough.

---

## License

MIT — see [LICENSE](LICENSE).

## Credits

Background music by Kevin MacLeod (incompetech.com), CC BY 4.0. Sound effects synthesized at runtime via the Web Audio API (no assets). Full attribution in [CREDITS.md](CREDITS.md).

---

Built with the [DeepSpace SDK](https://docs.deep.space).
