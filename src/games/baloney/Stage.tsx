/**
 * Baloney Stage — the TV / shared screen, on the shared indigo world
 * (all three games share one background, told apart by accent: ink banners for
 * system text, cream cards for player content, magenta/cyan as stamp accents).
 * The lobby rings PlayerTokens
 * around the BALONEY logo lockup; in-game phases live in ui/StageGame.
 * Read-only display: host controls live on the host's phone (Play.tsx).
 *
 * Chrome is owned here (not StageShell — that frame is midnight-velvet):
 * CodeBadge + mute top-right, leave top-left, phase crossfade, reconnect
 * banner, and the persistent mascot / chat feed / emote overlay.
 *
 * Music plays on every device (shared/music) — this surface uses the full
 * 'stage' bed volume.
 */
import { QRCodeSVG } from 'qrcode.react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { GameViewProps } from '../roomApi'
import { useBaloney, type Baloney } from './useBaloney'
import { MAX_PLAYERS, MIN_PLAYERS } from './types'
import { GAMES } from '../registry'
import { World } from '../../shared/World'
import { CodeBadge } from '../../shared/CodeBadge'
import { PlayerToken } from '../../shared/PlayerToken'
import { ContentCard } from '../../shared/ContentCard'
import { Banner } from '../../shared/Banner'
import { Host } from '../../shared/Host'
import { Emotes } from '../../shared/Emotes'
import { MuteToggle } from '../../shared/sound'
import { LeaveButton, DisconnectBanner } from '../../shared/shells'
import { phaseCrossfade } from '../../shared/motion'
import { useMusic } from '../../shared/music'
import { StageGame, moodFor } from './ui/StageGame'
import { StageChat } from './ui/StageChat'

const META = GAMES.baloney

export default function BaloneyStage({ code, room }: GameViewProps) {
  const game = useBaloney(room, code, 'stage')
  return <StageView game={game} code={code} />
}

/** The full Stage composition for a live (or mocked) game object. */
export function StageView({ game, code }: { game: Baloney; code: string }) {
  const phase = game.state?.phase ?? 'LOBBY'
  const inLobby = !game.state || phase === 'LOBBY'
  useMusic(phase, true)
  const reduce = useReducedMotion()

  return (
    // h-dvh + overflow-hidden: the TV owns the screen and never scrolls; each
    // phase body is h-full and compresses to fit 1280×720.
    <div className="relative h-dvh overflow-hidden">
      <World kind="indigo-burst" />
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          variants={phaseCrossfade(true)}
          initial={reduce ? { opacity: 0 } : 'initial'}
          animate={reduce ? { opacity: 1 } : 'animate'}
          exit={reduce ? { opacity: 0 } : 'exit'}
          className="h-full"
        >
          {inLobby ? (
            <div data-testid="stage-lobby" data-phase="LOBBY" className="h-full">
              <StageLobby game={game} code={code} />
            </div>
          ) : (
            <div data-testid="stage-playing" data-phase={phase} className="h-full">
              <StageGame game={game} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Persistent overlays — outside the phase crossfade. */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-10">
        <Host mood={moodFor(game)} size={inLobby ? 104 : 132} />
      </div>
      <StageChat chat={game.chat} />
      <Emotes emotes={game.emotes} />

      {/* Top-right chrome: the always-visible ink code box + mute. */}
      <div className="fixed right-3 top-3 z-30 flex items-center gap-2">
        <CodeBadge code={code} />
        <MuteToggle className="border-2 border-[#131313] !bg-[#FFFDF5] !text-[#131313] shadow-[3px_3px_0_rgba(0,0,0,0.35)]" />
      </div>
      <LeaveButton label={inLobby ? 'Exit' : 'End'} />
      <DisconnectBanner connected={game.connected} />
    </div>
  )
}

/** Fixed 8 ring slots (percent offsets from center) — seats keep their spot as
 *  players come and go, like chairs around the logo. Ordered to fill the top
 *  arc first so a 2-3 player room still reads as a ring. */
const RING_SLOTS: { x: number; y: number }[] = [
  { x: -38, y: -28 },
  { x: 38, y: -28 },
  { x: -46, y: 8 },
  { x: 46, y: 8 },
  { x: -30, y: 38 },
  { x: 30, y: 38 },
  { x: -12, y: -40 },
  { x: 12, y: 42 },
]

/** The lobby — PlayerTokens ringed around the BALONEY lockup (fibbage3-lobby),
 *  with the QR + giant code on a join strip below. */
export function StageLobby({ game, code }: { game: Baloney; code: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // The QR carries ?g=baloney so the FIRST scan can bind a fresh room.
  const joinUrl = `${origin}/play/${code}?g=baloney`
  const joinHost = typeof window !== 'undefined' ? window.location.host : 'partypack.app.space'
  const isPublic = game.state?.config.isPublic ?? false
  const enough = game.players.length >= MIN_PLAYERS
  const reduce = useReducedMotion()

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-2 overflow-hidden px-8 py-5">
      {/* The ring: logo lockup center, tokens pinned on fixed seats around it. */}
      <div className="relative mx-auto h-[min(46vh,26rem)] w-full max-w-4xl shrink-0">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <LogoLockup />
        </div>
        <AnimatePresence>
          {game.players.map((p) => {
            const slot = RING_SLOTS[p.joinedOrder % RING_SLOTS.length]
            return (
              <motion.div
                key={p.userId}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="absolute flex flex-col items-center"
                // Center on the slot via motion x/y — a raw style.transform
                // would be clobbered when framer animates `scale`.
                style={{
                  left: `calc(50% + ${slot.x}%)`,
                  top: `calc(50% + ${slot.y}%)`,
                  x: '-50%',
                  y: '-50%',
                }}
              >
                <PlayerToken name={p.name} color={p.color} seat={p.joinedOrder} size="md" />
                {p.isBot && (
                  <span className="mt-0.5 bg-[#131313] px-1.5 font-body text-[10px] uppercase tracking-wide text-[#FFFDF5]">
                    🤖 bot
                  </span>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
        {game.players.length === 0 && (
          <p className="absolute inset-x-0 top-[82%] text-center font-display text-lg uppercase text-[#131313]/70">
            Waiting for players…
          </p>
        )}
      </div>

      {/* Join strip — QR on a cream card, the giant code on an ink banner. */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-6">
        <ContentCard tilt={-1.5} className="p-3">
          <QRCodeSVG value={joinUrl} size={128} bgColor="#FFFDF5" fgColor="#131313" />
        </ContentCard>
        <Banner tilt={1.2} className="px-8 py-4 text-center">
          <span className="block font-body text-sm font-bold lowercase tracking-wide text-[#FFFDF5]/90">
            join at <span className="text-[#FFD23F]">{joinHost}</span>
          </span>
          <span data-testid="stage-code" className="block font-display text-6xl leading-tight tracking-[0.12em] text-[#FFD23F] sm:text-7xl">
            {code}
          </span>
          {isPublic && (
            <span className="mt-1 inline-block bg-[#FF2E97] px-2.5 py-0.5 font-display text-xs uppercase tracking-[0.2em] text-[#131313]">
              Public room
            </span>
          )}
        </Banner>
      </div>

      {/* How-to beats + status — ink text straight on the gold. */}
      <div className="grid w-full max-w-3xl shrink-0 gap-2 text-left sm:grid-cols-3 sm:gap-6">
        {META.howTo.map((line, i) => (
          <div key={i} className="flex items-start gap-2.5 sm:flex-col sm:gap-1">
            <span className="font-display text-lg text-[#131313]">{i + 1}.</span>
            <p className="font-body text-sm font-semibold leading-snug text-[#131313]/85">{line}</p>
          </div>
        ))}
      </div>
      <p className="shrink-0 font-display text-sm uppercase tracking-wide text-[#131313]/80">
        {game.players.length > 0 && `${game.players.length} / ${MAX_PLAYERS} players · `}
        {!enough ? `Need ${MIN_PLAYERS - game.players.length} more to start` : 'Host: tap Start on your phone'}
      </p>
    </div>
  )
}

/** The BALONEY logo lockup — white block, ink border, magenta wordmark, and a
 *  tilted "100% BALONEY" stamp riding the corner. */
function LogoLockup() {
  return (
    <div className="relative">
      <ContentCard tilt={-2} className="px-10 py-6 text-center sm:px-14 sm:py-8">
        <span className="block font-body text-xs font-bold uppercase tracking-[0.4em] text-[#131313]/70">
          Late Night Presents
        </span>
        <span className="block font-display text-6xl uppercase leading-none text-[#FF2E97] sm:text-7xl">
          {META.title}
        </span>
        <span className="mt-1.5 block font-marker text-base text-[#1A1A1A]/80">{META.tagline}</span>
      </ContentCard>
      <span
        className="absolute -right-7 -top-4 rotate-12 border-[3px] border-[#131313] bg-[#FF2E97] px-2.5 py-1 font-display text-sm uppercase tracking-wide text-[#131313]"
        style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}
      >
        100% Baloney
      </span>
    </div>
  )
}
