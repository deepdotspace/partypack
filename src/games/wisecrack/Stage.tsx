/**
 * Wisecrack Stage — the TV / shared screen, set in the indigo-burst world.
 * Lobby = the Jackbox ring: PlayerTokens circled around the WISECRACK logo
 * lockup, CodeBadge top-right, QR + how-to + start cue along the bottom.
 * In-game phases live in ui/StageGame. Read-only display: host controls live
 * on the host's phone (Play.tsx). Chrome (phase crossfade, code pill, mute,
 * leave, reconnect banner) comes from StageShell; the world layer, mascot,
 * chat feed and emote overlay ride in its `overlay` slot.
 *
 * Music: every device plays the bed now — the Stage at full volume
 * (shared/music's trackForPhase maps lobby/game/win).
 */
import { QRCodeSVG } from 'qrcode.react'
import { AnimatePresence, motion } from 'framer-motion'
import type { GameViewProps } from '../roomApi'
import { useWisecrack, type Wisecrack } from './useWisecrack'
import { MAX_PLAYERS, MIN_PLAYERS } from './types'
import { GAMES } from '../registry'
import { World } from '../../shared/World'
import { PlayerToken, NamePlate } from '../../shared/PlayerToken'
import { ContentCard } from '../../shared/ContentCard'
import { Banner } from '../../shared/Banner'
import { CodeBadge } from '../../shared/CodeBadge'
import { Host } from '../../shared/Host'
import { Emotes } from '../../shared/Emotes'
import { StageShell } from '../../shared/shells'
import { popIn } from '../../shared/motion'
import { useMusic } from '../../shared/music'
import { StageGame, moodFor } from './ui/StageGame'
import { StageChat } from './ui/StageChat'
import { DisplayText, LogoLockup, seatOf } from './ui/bits'

const META = GAMES.wisecrack

export default function WisecrackStage({ code, room }: GameViewProps) {
  const game = useWisecrack(room, code, 'stage')
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
      showCodePill={!inLobby} // the lobby renders its own CodeBadge
      leaveLabel={inLobby ? 'Exit' : 'End'}
      overlay={
        <>
          {/* The indigo-burst world — painted over the shell's midnight
              Backdrop (same -z-10 layer, later in DOM). */}
          <World kind="indigo-burst" />
          {/* Floating mascot — clear of the top-left Exit control. */}
          <div className="pointer-events-none fixed bottom-4 left-4 z-10">
            <Host mood={moodFor(game)} size={inLobby ? 104 : 132} />
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

/** Ellipse position (percent) for ring seat `i` of `n`, starting at 12 o'clock. */
function ringPos(i: number, n: number): { left: string; top: string } {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1)
  return {
    left: `${50 + 40 * Math.cos(angle)}%`,
    top: `${50 + 35 * Math.sin(angle)}%`,
  }
}

/** The avatar-ring lobby (quiplash1-lobby): players circle the logo lockup. */
export function StageLobby({ game, code }: { game: Wisecrack; code: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // The QR carries ?g=wisecrack so the FIRST scan can bind a fresh room.
  const joinUrl = `${origin}/play/${code}?g=wisecrack`
  const joinHost = typeof window !== 'undefined' ? window.location.host : 'partypack.app.space'
  const isPublic = game.state?.config.isPublic ?? false
  const enough = game.players.length >= MIN_PLAYERS
  const n = game.players.length

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden px-8 pb-6 pt-4">
      {/* Top strip: capacity (left, past the Exit control) + CodeBadge (right,
          past the shell's mute toggle). */}
      <div className="flex items-start justify-between pl-24 pr-14">
        <div className="flex items-center gap-3">
          <NamePlate tilt={-2} className="px-3.5 py-1.5 text-base">
            {n === 0 ? 'Waiting for players…' : `${n} / ${MAX_PLAYERS} players`}
          </NamePlate>
          {isPublic && (
            <NamePlate tilt={1.5} className="px-3 py-1.5 text-sm">
              <span className="text-[#FFD23F]">Public room</span>
            </NamePlate>
          )}
        </div>
        <CodeBadge code={code} />
      </div>

      {/* The ring — logo lockup center, PlayerTokens around the ellipse. */}
      <div className="relative mx-auto w-full max-w-5xl flex-1">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <LogoLockup tagline={META.tagline} />
        </div>
        <AnimatePresence>
          {game.players.map((p, i) => (
            <motion.div
              key={p.userId}
              variants={popIn}
              initial="hidden"
              animate="show"
              exit="hidden"
              layout
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={ringPos(i, n)}
            >
              <PlayerToken name={p.name} color={p.color} seat={seatOf(game.state!, p.userId)} size="md" />
              {p.isBot && (
                <NamePlate tilt={2} className="mx-auto mt-1 w-fit px-1.5 py-px text-[9px]">
                  <span className="text-[#C6FF3D]">🤖 bot</span>
                </NamePlate>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Bottom band: QR join card · how-to banner · start cue. */}
      <div className="mx-auto flex w-full max-w-5xl items-end justify-between gap-6">
        <ContentCard tilt={-2} className="flex shrink-0 items-center gap-4 px-4 py-3">
          <QRCodeSVG value={joinUrl} size={104} bgColor="#FFFDF5" fgColor="#131313" />
          <div className="text-left">
            <p className="font-body text-xs font-bold uppercase tracking-[0.18em] text-[#1A1A1A]/75">
              Scan or join at
            </p>
            <p className="font-body text-sm font-bold lowercase text-[#1A1A1A]">{joinHost}</p>
            <p data-testid="stage-code" className="font-display text-4xl leading-tight tracking-[0.14em] text-[#1A1A1A]">
              {code}
            </p>
          </div>
        </ContentCard>

        <div className="hidden min-w-0 flex-col gap-2 md:flex">
          {META.howTo.map((line, i) => (
            <Banner key={i} tilt={i % 2 === 0 ? -1 : 1} className="px-4 py-1.5 font-body text-sm font-semibold">
              <span className="mr-2 font-display text-[#FFD23F]">{i + 1}</span>
              {line}
            </Banner>
          ))}
        </div>

        <div className="shrink-0 pb-1 text-right">
          <DisplayText className="text-xl">
            {!enough ? `Need ${MIN_PLAYERS - n} more to start` : 'Host: tap Start on your phone'}
          </DisplayText>
        </div>
      </div>
    </div>
  )
}
