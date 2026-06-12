/**
 * Pitch Stage — the TV / shared screen, on the shared indigo world
 * (`<World kind="indigo-burst">`; all three games share one background and are
 * told apart by accent — Pitch = tangerine/violet). The lobby is a
 * PlayerToken ring around the PITCH logo lockup (white block, ink border,
 * PATENT PENDING stamp) with the QR + big code beside it; in-game phases live
 * in ui/StageGame behind its persistent left rail. Read-only display: host
 * controls live on the host's phone (Play.tsx). Chrome (phase crossfade,
 * mute, leave, reconnect banner) comes from StageShell; the mascot / chat
 * feed / emote overlay ride in its `overlay` slot.
 *
 * Music plays on every device (stage bed here at full volume; controllers run
 * their own quieter bed) — phase mapping via shared/music's trackForPhase.
 */
import { QRCodeSVG } from 'qrcode.react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { GameViewProps } from '../roomApi'
import { usePitch, type Pitch } from './usePitch'
import { MAX_PLAYERS, MIN_PLAYERS } from './types'
import { GAMES } from '../registry'
import { Host } from '../../shared/Host'
import { Emotes } from '../../shared/Emotes'
import { StageShell } from '../../shared/shells'
import { World } from '../../shared/World'
import { Banner } from '../../shared/Banner'
import { CodeBadge } from '../../shared/CodeBadge'
import { PlayerToken } from '../../shared/PlayerToken'
import { springy } from '../../shared/motion'
import { useMusic } from '../../shared/music'
import { StageGame, moodFor } from './ui/StageGame'
import { StageChat } from './ui/StageChat'

const META = GAMES.pitch

export default function PitchStage({ code, room }: GameViewProps) {
  const game = usePitch(room, code, 'stage')
  const phase = game.state?.phase ?? 'LOBBY'
  const inLobby = !game.state || phase === 'LOBBY'
  useMusic(phase, true)

  return (
    <StageShell
      accent={META.accent}
      accent2={META.accent2}
      code={code}
      phaseKey={phase}
      connected={game.connected}
      showCodePill={false} // lobby pins a CodeBadge top-right; in-game the rail carries it
      leaveLabel={inLobby ? 'Exit' : 'End'}
      overlay={
        <>
          {/* The blueprint world — persistent across phase crossfades; paints
              over the shell's midnight Backdrop (same layer, later in DOM). */}
          <World kind="indigo-burst" />
          {/* Floating mascot — clear of the top-left Exit control; in-game it
              steps right so the rail's audience box + code stay visible. */}
          <div className={`pointer-events-none fixed bottom-4 z-10 ${inLobby ? 'left-4' : 'left-60'}`}>
            <Host mood={moodFor(game)} size={inLobby ? 104 : 116} />
          </div>
          <StageChat chat={game.chat} />
          <Emotes emotes={game.emotes} />
        </>
      }
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
    </StageShell>
  )
}

/** The lobby — PlayerTokens ring the PITCH logo lockup on the drafting table;
 *  the QR + big code sit in the join strip below (scan OR type). */
function StageLobby({ game, code }: { game: Pitch; code: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // The QR carries ?g=pitch so the FIRST scan can bind a fresh room.
  const joinUrl = `${origin}/play/${code}?g=pitch`
  const joinHost = typeof window !== 'undefined' ? window.location.host : 'partypack.app.space'
  const isPublic = game.state?.config.isPublic ?? false
  const enough = game.players.length >= MIN_PLAYERS

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-8 pb-5 pt-5">
      {/* Room code — top-right, under the fixed mute control. */}
      <div className="absolute right-4 top-14 z-20">
        <CodeBadge code={code} />
      </div>

      <Banner tilt={-1} className="px-5 py-1.5 text-xs tracking-[0.3em]">
        LATE NIGHT PRESENTS
      </Banner>

      {/* The ring — inventors pinned around the logo lockup. */}
      <div className="relative mt-1 h-[clamp(19rem,52vh,26rem)] w-full max-w-3xl">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <LogoLockup isPublic={isPublic} />
        </div>
        <TokenRing game={game} />
      </div>

      {/* Join strip — QR card + the big code + how-to beats. */}
      <div className="mt-2 flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
        <div
          className="shrink-0 border-4 border-[#131313] bg-[#FFFDF5] p-2.5"
          style={{ rotate: '-1.5deg', boxShadow: '6px 6px 0 rgba(0,0,0,0.45)' }}
        >
          <QRCodeSVG value={joinUrl} size={124} bgColor="#FFFDF5" fgColor="#131313" />
        </div>
        <div className="text-center">
          <Banner tilt={1} className="inline-block px-4 py-1.5 text-xs font-normal tracking-[0.18em]">
            JOIN AT <span className="text-[#FFD23F]">{joinHost}</span>
          </Banner>
          <p
            data-testid="stage-code"
            className="mt-2 font-display text-7xl leading-none tracking-[0.12em] text-[#FFFDF5]"
            style={{ textShadow: '-3px -3px 0 #131313, 3px -3px 0 #131313, -3px 3px 0 #131313, 3px 3px 0 #131313, 6px 7px 0 rgba(0,0,0,0.55)' }}
          >
            {code}
          </p>
        </div>
        {/* How-to beats — marker notes on a pinned sheet. */}
        <div
          className="hidden max-w-xs shrink-0 bg-[#FFFDF5] px-5 py-3.5 font-marker text-sm leading-snug text-[#1A1A1A] lg:block"
          style={{ rotate: '1.2deg', border: '3px solid #131313', boxShadow: '5px 5px 0 rgba(0,0,0,0.45)' }}
        >
          {META.howTo.map((line, i) => (
            <p key={i} className="flex gap-2 py-0.5">
              <span className="font-display text-tangerine">{i + 1}.</span>
              <span>{line}</span>
            </p>
          ))}
        </div>
      </div>

      <Banner tilt={-0.8} className="mt-4 px-5 py-1.5 text-sm font-normal">
        {game.players.length === 0
          ? 'Waiting for inventors…'
          : !enough
            ? `${game.players.length} / ${MAX_PLAYERS} inventors · need ${MIN_PLAYERS - game.players.length} more to start`
            : `${game.players.length} / ${MAX_PLAYERS} inventors · host: tap Start on your phone`}
      </Banner>
    </div>
  )
}

/** The PITCH logo lockup — white block, ink border, tangerine wordmark, with
 *  a PATENT PENDING stamp riding its edge. */
function LogoLockup({ isPublic }: { isPublic: boolean }) {
  return (
    <div className="relative">
      <div
        className="flex flex-col items-center border-4 border-[#131313] bg-[#FFFDF5] px-12 py-6"
        style={{ rotate: '-1deg', boxShadow: '8px 8px 0 rgba(0,0,0,0.5)' }}
      >
        <span
          className="font-display text-7xl uppercase leading-none text-tangerine"
          style={{ textShadow: '3px 3px 0 #131313' }}
        >
          {META.title}
        </span>
        <span className="mt-2 font-marker text-base text-[#1A1A1A]">{META.tagline}</span>
      </div>
      <span
        className="absolute -right-8 -top-4 border-[3px] border-tangerine bg-[#FFFDF5] px-2.5 py-0.5 font-display text-sm uppercase tracking-[0.16em] text-tangerine"
        style={{ rotate: '7deg', boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}
      >
        Patent pending
      </span>
      {isPublic && (
        <span
          className="absolute -bottom-3.5 left-1/2 w-max -translate-x-1/2 bg-[#131313] px-2.5 py-0.5 font-display text-xs uppercase tracking-[0.18em] text-[#FFD23F]"
          style={{ rotate: '-1.5deg', boxShadow: '2.5px 2.5px 0 rgba(0,0,0,0.35)' }}
        >
          Public room
        </span>
      )}
    </div>
  )
}

/** Inventors arranged on an ellipse around the logo (quiplash1-lobby ring). */
function TokenRing({ game }: { game: Pitch }) {
  const reduce = useReducedMotion()
  const n = game.players.length
  return (
    <AnimatePresence>
      {game.players.map((p, i) => {
        const ang = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
        const x = 50 + 41 * Math.cos(ang)
        const y = 50 + 42 * Math.sin(ang)
        return (
          <div
            key={p.userId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <motion.div
              initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              transition={springy}
            >
              <PlayerToken
                name={p.isBot ? `🤖 ${p.name}` : p.name}
                color={p.color}
                seat={p.joinedOrder}
                mood="idle"
                size="md"
              />
            </motion.div>
          </div>
        )
      })}
    </AnimatePresence>
  )
}
