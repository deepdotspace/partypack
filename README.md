# Party Pack

Three party games on one room code, no sign-up. Players join from their phones; an optional TV stage shows the action on the big screen.

**Live: [partypack.app.space](https://partypack.app.space)** · MIT · Built on the [DeepSpace SDK](https://docs.deep.space)

## Quick start

Deploy your own copy in three commands:

```sh
npm install
npx deepspace login     # one-time, opens a browser tab
npx deepspace deploy    # → <name>.app.space
```

Auth, the database, real-time sync, and hosting all come from DeepSpace, so there's nothing else to configure. Your subdomain is the `name` field in `wrangler.toml`; change it for your own deployment.

Run it locally instead:

```sh
npm install
npx deepspace login
npx deepspace dev       # http://localhost:5173
```

## Commands

| Command | What it does |
|---|---|
| `npx deepspace dev` | Local dev server (Vite + Worker, HMR on `:5173`) |
| `npx deepspace deploy` | Deploy to `<name>.app.space` |
| `npx deepspace test` | Smoke + API + one full E2E playthrough per game |
| `npm run test:unit` | Unit tests only (285 vitest, all three engines) |
| `npm run type-check` | `tsc --noEmit` |

## The games

| Game | Players | What you do |
|---|---|---|
| **Wisecrack** | 3–8 | Fill in the blank with the funniest answer; the room votes. |
| **Baloney** | 2–8 | Write a convincing lie to a real trivia question, then spot the truth. |
| **Pitch** | 3–8 | Invent a product nobody asked for and sell the room on it. |

All anonymous: no accounts, no email. A 4-letter room code is the only gate.

## How to play

1. One person clicks **Host** on a game poster. This mints a room with a 4-letter code.
2. Everyone else types that code into the **Join** strip.
3. Optional: open `/stage/CODE` on a TV for the big-screen, broadcast-style view. Phones are the controllers.

Room codes use a 24-letter alphabet (no `I`/`O`, to avoid 1/0 mix-ups on a TV read).

## How it works

One Durable Object per room. All three games run inside the same `AppGameRoom`; it owns the tick loop and delegates every rule to the engine bound to that room.

```
phone ─┐                          AppGameRoom DO (one per room)
       ├─ WebSocket ─► onTick():  fold bot inputs → ENGINES[game].reduce()
 TV  ──┘                          → driveBots() → sync rooms list → save recap
                                  AppBudgetRoom DO (singleton): daily bot cap
```

- **Binding:** a room starts `{ game: null }`; the first JOIN carrying `?g=<id>` binds it to one engine for life. Later joiners need no parameter, since the broadcast state carries the game id.
- **Engines are pure reducers:** each game is a self-contained module exporting a `GameEngine` (`initialState`, `reduce`, `content`, `recap`, `registryRow`) plus optional `GameBots`. The hub DO stays game-agnostic.
- **Shared shell:** every game renders through `StageShell` (TV) and `ControllerShell` (phone); colors, motion tokens, SFX, and music live in `src/shared/`.

## AI bots

The host can seat up to 3 AI bots (`claude-opus-4-8`) so a small group can play without waiting for strangers. Bots are billed to the app owner, behind six spend guards:

- **Output cap** per call (e.g. 64 tokens; a quip is a few words)
- **Server-built prompts** only: no client input reaches a prompt
- **One in-flight call per bot**, with a canned fallback after two re-rolls
- **MAX_BOTS per room**, enforced in the reducer
- **At least one connected human:** no humans connected, no LLM calls
- **`DAILY_BOT_CAP = 2000`:** a singleton budget DO; a hard ceiling across all rooms, reset at UTC midnight

Per-session (`BOT_CALL_CAP = 50`) and per-room (`ROOM_BOT_LIFETIME = 300`) caps add inner limits.

## Adding a game

The hub knows nothing about game rules; it only calls the contracts. Game #4 is a module that fulfils `GameEngine` + `GameBots`, two lookup-table entries, and two lazy UI views. Full walkthrough: **[docs/ADD_A_GAME.md](docs/ADD_A_GAME.md)**.

## Tests

- **285 unit tests** (vitest): reducers, scoring, shuffles, validation, chat, bot hooks, recap and registry timing.
- **E2E** (Playwright): one full anonymous playthrough per game (a Stage plus three phones driven to the podium), plus smoke and API specs.

## License & credits

MIT, see [LICENSE](LICENSE). Background music by Kevin MacLeod (incompetech.com), CC BY 4.0; sound effects synthesized at runtime via the Web Audio API. Full attribution in [CREDITS.md](CREDITS.md).
