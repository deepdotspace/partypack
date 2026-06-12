/**
 * The hub landing. One coherent world, deliberately clean — and it never
 * scrolls: this is a game screen, not a website. The page root is h-dvh +
 * overflow-hidden and every zone compresses (clamped type, clamped gaps,
 * internally-scrolling rooms list) so the whole show fits any viewport.
 *
 *   - A single royal-blue sunburst world (no black, no multi-color spotlights).
 *   - Every surface is the same white ink-bordered card. Per-game color shows
 *     up in exactly one place: the game's wordmark (plus a small dot in the
 *     open-rooms list). Gold is reserved for the primary actions (JOIN, HOST,
 *     Play online · any game).
 *   - Posters carry the wordmark, the tagline, a player-count chip, and three
 *     actions. On phones the same posters render as compact rows (wordmark +
 *     tagline + the three actions in one strip) so all three games still fit
 *     one screen. The how-to lines live in the game lobbies, not here.
 *   - One-line footer, pinned to the bottom of the viewport.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useQuery } from 'deepspace'
import { GAME_LIST, GAMES, isGameId, type GameId, type GameMeta } from '../games/registry'
import { prefetchGameChunks } from '../games/views'
import { World } from '../shared/World'
import { ACCENT_HEX, NeonButton } from '../shared/primitives'
import { dealContainer, dealCard, haptic } from '../shared/motion'
import { sound, MuteToggle } from '../shared/sound'
import { isValidRoomCode, makeRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '../shared/roomCode'

const INK = '#131313'
const CREAM = '#FFFDF5'
/** The house card look: white, ink border, hard offset shadow. */
const CARD: React.CSSProperties = {
  backgroundColor: CREAM,
  border: `4px solid ${INK}`,
  borderRadius: '1.25rem',
  boxShadow: '8px 8px 0 rgba(13, 9, 33, 0.55)',
}
/** Deterministic per-poster tilt, by registry order. */
const POSTER_TILT = [-1.4, 1.1, -1.0] as const
/** Vertical gap between zones — compresses on short viewports. */
const ZONE_GAP = 'gap-[clamp(0.375rem,1.4vh,1.25rem)]'

interface RoomRow {
  game: string
  roomCode: string
  name: string
  playerCount: number
}

export default function Landing() {
  const open = useOpenRooms()
  // Warm the game chunks while the visitor reads the page, so HOST/JOIN never
  // waits on a network fetch (and never races a fresh deploy's chunk graph).
  useEffect(() => prefetchGameChunks(), [])
  return (
    // h-dvh (not vh) so mobile URL bars don't push the footer off-screen;
    // overflow-hidden because the landing must never scroll.
    <div className="relative h-dvh overflow-hidden">
      <World kind="indigo-burst" />
      <MuteToggle className="fixed right-3 top-3 z-40" />
      <div
        className={`mx-auto flex h-full w-full max-w-5xl flex-col items-center px-4 pb-2 pt-[clamp(1.5rem,4.5vh,3.25rem)] sm:px-8 ${ZONE_GAP}`}
      >
        <Marquee />
        <JoinStrip />
        <Posters open={open} />
        <OpenRooms open={open} />
        <Footer />
      </div>
    </div>
  )
}

/** Joinable public lobbies only. The DO deletes started/empty/private rows,
 *  but guard against stale ones via the envelope's updatedAt. Newest first. */
function useOpenRooms(): RoomRow[] {
  const { records } = useQuery<RoomRow>('rooms')
  const fresh = Date.now() - 15 * 60 * 1000
  return records
    .filter((r) => {
      const d = r.data
      if (!d?.roomCode || !isGameId(d.game)) return false
      return d.playerCount < GAMES[d.game].maxPlayers && new Date(r.updatedAt).getTime() > fresh
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((r) => r.data)
}

/** The fullest open room of one game (the per-game Play Online target). */
function fullestRoom(open: RoomRow[], game: GameId): RoomRow | undefined {
  return open.filter((r) => r.game === game).sort((a, b) => b.playerCount - a.playerCount)[0]
}

/* ------------------------------------------------------------------ */
/* 1 · Marquee                                                         */
/* ------------------------------------------------------------------ */

function Marquee() {
  return (
    <header className="flex shrink-0 flex-col items-center text-center">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.32em] text-white/85 sm:text-sm">
        Three games · one room code
      </p>
      {/* Idle float is a CSS keyframe (compositor; tilt baked into it) — an
          infinite framer y-loop would tick on the main thread forever.
          The clamp is height-aware (vh term) so the wordmark shrinks before
          the page would ever need to scroll. */}
      <h1
        className="anim-marquee-float mt-0.5 select-none whitespace-nowrap font-display uppercase leading-[0.92] text-stage sm:mt-1"
        style={{
          fontSize: 'clamp(2.25rem, min(12vw, 9.5vh), 7rem)',
          WebkitTextStroke: '3px #0d0921',
          paintOrder: 'stroke fill',
          textShadow: '6px 6px 0 rgba(13, 9, 33, 0.6)',
          transform: 'rotate(-1.5deg)',
        }}
      >
        Party Pack
      </h1>
      <p className="mt-1 max-w-md font-body text-xs leading-tight text-white/85 sm:mt-1.5 sm:text-base sm:leading-normal">
        Free, open source, no sign-ups. <span className="font-semibold text-white">Grab your phones.</span>
      </p>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* 2 · JOIN strip                                                      */
/* ------------------------------------------------------------------ */

function JoinStrip() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  function join(e: React.FormEvent) {
    e.preventDefault()
    const c = normalizeRoomCode(code)
    if (!isValidRoomCode(c)) {
      setError("Room codes are 4 letters. Check the host's screen.")
      return
    }
    sound.whoosh()
    navigate(`/play/${c}`)
  }

  return (
    <section className="w-full max-w-md shrink-0">
      <form onSubmit={join} className="flex items-stretch gap-2 p-2" style={CARD}>
        <input
          data-testid="join-code-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError('')
          }}
          maxLength={ROOM_CODE_LENGTH}
          placeholder="CODE"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Room code"
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-1.5 text-center font-display text-xl leading-none tracking-[0.35em] text-[#131313] placeholder:text-[#131313]/25 focus:outline-none sm:text-3xl"
        />
        <NeonButton type="submit" color="gold" testId="join-btn" className="px-6 text-lg sm:px-7 sm:text-2xl">
          Join
        </NeonButton>
      </form>
      <p
        className={`mt-1 text-center font-body text-xs sm:text-sm ${error ? 'font-semibold text-white' : 'text-white/70'}`}
      >
        {error || 'Got a code from a friend? Punch it in.'}
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 3 · Game posters                                                    */
/* ------------------------------------------------------------------ */

function Posters({ open }: { open: RoomRow[] }) {
  return (
    // flex-1 + justify-center: this zone soaks up whatever height is left, so
    // tall screens get breathing room around the posters instead of scroll.
    <section className="flex min-h-0 w-full flex-1 flex-col justify-center">
      <motion.div
        variants={dealContainer}
        initial="hidden"
        animate="show"
        className="grid w-full grid-cols-1 gap-2 md:grid-cols-3 md:gap-5"
      >
        {GAME_LIST.map((g, i) => (
          <Poster key={g.id} game={g} tilt={POSTER_TILT[i % POSTER_TILT.length]} open={open} />
        ))}
      </motion.div>
      {/* One shared caption disambiguating the quiet pair on every poster. */}
      <p className="mt-1.5 whitespace-nowrap text-center font-body text-[11px] text-white/75 md:mt-2.5 md:text-xs">
        Play online = join strangers<span className="hidden sm:inline"> in a public room</span> · Solo = you vs. AI
        comedians
      </p>
    </section>
  )
}

/**
 * One game, two shapes from a single DOM (so every testid exists exactly
 * once): a compact row on phones — title + players up top, tagline, then
 * HOST / Play online / Solo in one 3-up strip — and the classic tall poster
 * from md up (HOST full-width, the quiet pair beneath).
 */
function Poster({ game, tilt, open }: { game: GameMeta; tilt: number; open: RoomRow[] }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const hex = ACCENT_HEX[game.accent as keyof typeof ACCENT_HEX] ?? '#ffd23f'
  const openCount = open.filter((r) => r.game === game.id).length

  function host() {
    sound.pop()
    haptic()
    navigate(`/play/${makeRoomCode()}?g=${game.id}`)
  }

  // Play online, game-scoped: hop into the fullest open room of THIS game; if
  // the night is quiet, open a fresh PUBLIC room so the next online player
  // lands with you.
  function playOnline() {
    sound.whoosh()
    haptic()
    const best = fullestRoom(open, game.id)
    if (best) navigate(`/play/${best.roomCode}`)
    else navigate(`/play/${makeRoomCode()}?g=${game.id}&public=1`)
  }

  // Solo: host a room that auto-fills with AI players (shared/useSoloBots
  // reads ?bots=1 in the game lobby).
  function solo() {
    sound.pop()
    haptic()
    navigate(`/play/${makeRoomCode()}?g=${game.id}&bots=1`)
  }

  return (
    <motion.article
      variants={dealCard}
      data-testid={`poster-${game.id}`}
      onHoverStart={() => sound.pop()}
      whileHover={reduce ? undefined : { rotate: 0, scale: 1.02 }}
      className="flex flex-col p-2 text-left md:p-4 md:text-center"
      style={{ ...CARD, rotate: reduce ? 0 : `${tilt}deg` }}
    >
      {/* Phone: title + players share the top line, tagline wraps under.
          Desktop (md): column order title → tagline → players, centered. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 md:flex-col md:items-center">
        <h2
          className="font-display text-2xl uppercase leading-none md:text-4xl"
          style={{ color: hex, WebkitTextStroke: `1.5px ${INK}`, paintOrder: 'stroke fill', textShadow: `2.5px 2.5px 0 ${INK}` }}
        >
          {game.title}
        </h2>
        <p className="font-body text-[10px] font-bold uppercase tracking-wider text-[#131313]/55 md:order-3 md:mt-1 md:text-xs">
          {game.minPlayers} to {game.maxPlayers} players
        </p>
        <p className="w-full font-body text-xs font-semibold leading-tight text-[#131313] md:order-2 md:mt-2 md:text-[15px] md:leading-snug">
          {game.tagline}
        </p>
      </div>

      {/* Phone: HOST + the quiet pair in one 3-up strip.
          Desktop: HOST spans the row, the quiet pair sits beneath. */}
      <div className="mt-1.5 grid flex-1 grid-cols-3 content-end gap-1.5 md:mt-3.5 md:grid-cols-2 md:gap-2.5">
        <NeonButton
          color="gold"
          onClick={host}
          testId={`host-${game.id}`}
          className="w-full px-2 py-1.5 text-base leading-none md:col-span-2 md:py-2.5 md:text-2xl"
        >
          Host
        </NeonButton>
        <QuietButton onClick={playOnline} testId={`quick-play-${game.id}`}>
          Play online{openCount > 0 ? ` · ${openCount}` : ''}
        </QuietButton>
        <QuietButton onClick={solo} testId={`solo-${game.id}`}>
          Solo vs. AI
        </QuietButton>
      </div>
    </motion.article>
  )
}

/** The quiet secondary action on a white card: ink outline, ink text. */
function QuietButton({
  children,
  onClick,
  testId,
  className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  testId?: string
  className?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`whitespace-nowrap rounded-xl border-2 border-[#131313]/30 px-1.5 py-1.5 font-body text-xs font-bold leading-none text-[#131313] transition-colors hover:border-[#131313] hover:bg-[#131313]/5 active:scale-[0.98] md:px-3 md:py-2 md:text-sm ${className}`}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* 4 · Open rooms + Play online                                        */
/* ------------------------------------------------------------------ */

function OpenRooms({ open }: { open: RoomRow[] }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<GameId | 'all'>('all')
  const shown = filter === 'all' ? open : open.filter((r) => r.game === filter)

  // Play online, any game: hop into the fullest open room; if the night is
  // quiet, open a fresh PUBLIC wisecrack room so the next online player lands
  // with you.
  function playOnline() {
    sound.whoosh()
    const best = [...open].sort((a, b) => b.playerCount - a.playerCount)[0]
    if (best) navigate(`/play/${best.roomCode}`)
    else navigate(`/play/${makeRoomCode()}?g=wisecrack&public=1`)
  }

  return (
    <section data-testid="open-rooms" className="w-full max-w-2xl shrink-0">
      <div className="flex flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3.5" style={CARD}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="whitespace-nowrap font-display text-sm uppercase leading-none text-[#131313] sm:text-lg">
            Open rooms
          </h3>
          <NeonButton
            color="gold"
            onClick={playOnline}
            testId="quick-play-btn"
            className="whitespace-nowrap px-2.5 py-1.5 text-[10px] leading-none sm:px-5 sm:text-sm"
          >
            Play online · any game{open.length > 0 ? ` · ${open.length}` : ''}
          </NeonButton>
        </div>

        {/* Game filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} testId="room-filter-all" />
          {GAME_LIST.map((g) => (
            <FilterChip
              key={g.id}
              label={g.title}
              active={filter === g.id}
              onClick={() => setFilter(g.id)}
              testId={`room-filter-${g.id}`}
            />
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="truncate font-body text-xs text-[#131313]/60 sm:text-sm">
            {filter === 'all'
              ? 'No open rooms right now. Host one and yours shows up here.'
              : `No open ${GAMES[filter].title} rooms. Play online on its poster starts one.`}
          </p>
        ) : (
          // Caps at ~3 visible rows; longer lists scroll INSIDE the card so
          // the page itself never grows.
          <div className="max-h-[8.25rem] divide-y divide-[#131313]/10 overflow-y-auto overscroll-contain">
            {shown.slice(0, 6).map((r) => {
              const meta = GAMES[r.game as keyof typeof GAMES]
              const hex = ACCENT_HEX[meta.accent as keyof typeof ACCENT_HEX]
              return (
                <div key={r.roomCode} className="flex items-center gap-3 py-1.5">
                  <span className="h-3 w-3 shrink-0 rounded-full border border-[#131313]/30" style={{ backgroundColor: hex }} />
                  <span className="font-display text-sm uppercase text-[#131313]">{meta.title}</span>
                  <span className="min-w-0 flex-1 truncate font-body text-sm font-semibold text-[#131313]/70">
                    {r.name}'s room
                  </span>
                  <span className="font-display text-sm text-[#131313]/60 tabular-nums">
                    {r.playerCount}/{meta.maxPlayers}
                  </span>
                  <QuietButton
                    className="px-3"
                    onClick={() => {
                      sound.pop()
                      navigate(`/play/${r.roomCode}`)
                    }}
                  >
                    Join
                  </QuietButton>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

/** A pill chip that scopes the open-rooms list to one game. Ink only. */
function FilterChip({
  label,
  active,
  onClick,
  testId,
}: {
  label: string
  active: boolean
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={() => {
        sound.click()
        onClick()
      }}
      className={`rounded-full border-2 px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider transition-colors sm:px-3.5 sm:text-xs ${
        active
          ? 'border-[#131313] bg-[#131313] text-[#FFFDF5]'
          : 'border-[#131313]/25 text-[#131313]/70 hover:border-[#131313]/60'
      }`}
    >
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* 5 · Footer                                                          */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="shrink-0 text-center">
      <p className="whitespace-nowrap font-body text-[11px] text-white/80 sm:text-sm">
        <span className="hidden sm:inline">Open source. </span>
        <a
          href="https://github.com/deepdotspace/partypack"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
        >
          Fork it and build game #4
        </a>
        {' '}· Made with DeepSpace
      </p>
    </footer>
  )
}
