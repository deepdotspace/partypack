/**
 * Pitch Play — the phone (Controller). Anonymous: pick a name → join →
 * lobby → live game. No sign-in; identity is a localStorage cid (see
 * shared/identity + usePitch). Every screen sits on the dimmed blueprint
 * world (the same show as the TV, house lights down). Pre-game screens render
 * inside the quiet ControllerShell; in-game phases use the BroadcastFrame
 * (top bar + standings rail + inline chat). Music plays here too — the
 * controller bed runs quieter than the stage (shared/music).
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GameViewProps } from '../roomApi'
import { usePitch, type Pitch } from './usePitch'
import { MAX_PLAYERS, MIN_PLAYERS } from './types'
import { GAMES } from '../registry'
import { PLAYER_COLORS } from '../../shared/colors'
import { PlayerBadge } from '../../shared/PlayerBadge'
import { ChatBox } from '../../shared/ChatBox'
import { Eyebrow, NeonButton } from '../../shared/primitives'
import { ControllerShell, DisconnectBanner, accentVar, accentGlow, SCROLL_FADE } from '../../shared/shells'
import { World } from '../../shared/World'
import { useSoloBots } from '../../shared/useSoloBots'
import { ControllerGame } from './ui/ControllerGame'
import { BroadcastFrame } from './ui/BroadcastFrame'

const META = GAMES.pitch

export default function PitchPlay({ code, room }: GameViewProps) {
  const game = usePitch(room, code, 'play')
  const [name, setName] = useState('')
  const [searchParams] = useSearchParams()

  // Prefill from the remembered name once it's available.
  useEffect(() => {
    if (game.myName && !name) setName(game.myName)
  }, [game.myName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Quick Play opens a fresh room with ?public=1 — once we're the host, flip it
  // public so it's listed for matchmaking. Fires once (the guard goes false after).
  const wantPublic = searchParams.get('public') === '1'
  useEffect(() => {
    if (wantPublic && game.isHost && game.state?.phase === 'LOBBY' && !game.state.config.isPublic) {
      game.send.setConfig({ isPublic: true })
    }
  }, [wantPublic, game.isHost, game.state?.phase, game.state?.config.isPublic]) // eslint-disable-line react-hooks/exhaustive-deps

  // Not seated yet → pick a name and join (no account needed). The screen
  // names the GAME (title + accent) so joiners know what they're walking into.
  if (!game.joined) {
    return (
      <ControllerShell accent={META.accent} code={code} connected={game.connected}>
        {/* The dimmed blueprint world — overrides the shell's midnight Backdrop
            (same fixed -z-10 layer, later in DOM). */}
        <World kind="indigo-burst" dim />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Eyebrow>Joining {META.title}</Eyebrow>
          <h1
            className="mt-2 font-display text-7xl uppercase tracking-[0.08em]"
            style={{ color: accentVar(META.accent), textShadow: accentGlow(META.accent) }}
          >
            {code}
          </h1>
          <p className="mt-2 font-body text-sm text-smoke">{META.tagline}</p>
          <p className="mt-5 font-body text-smoke">What should we call you?</p>
          <input
            data-testid="name-input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            maxLength={16}
            placeholder="Your name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim() && game.connected) game.send.join(name.trim())
            }}
            className="mt-3 w-full rounded-[1.5rem] border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-4 text-center font-body text-2xl font-semibold text-stage transition-colors placeholder:text-smoke/45 focus:border-violet focus:shadow-[var(--glow-violet)] focus:outline-none"
          />
          <NeonButton
            testId="join-game-btn"
            color="tangerine"
            onClick={() => game.send.join(name.trim() || 'Player')}
            disabled={!game.connected || !name.trim()}
            className="mt-4 w-full px-8 py-4 text-2xl"
          >
            {game.connected ? 'Join the game' : 'Connecting…'}
          </NeonButton>
        </div>
      </ControllerShell>
    )
  }

  const isSpectator = game.me?.role === 'spectator'

  // Seated → in-game phases render the live Controller; lobby falls through below.
  const phase = game.state?.phase ?? 'LOBBY'
  if (phase !== 'LOBBY') {
    return (
      <div data-testid="controller-playing" data-phase={phase}>
        {isSpectator && <SpectatorChip />}
        {/* BroadcastFrame owns the in-game chrome: top bar (with Leave) + standings
            rail + stage + the inline reflow chat panel. */}
        <BroadcastFrame game={game} stage={<ControllerGame game={game} />} />
        <DisconnectBanner connected={game.connected} />
      </div>
    )
  }

  return <Lobby game={game} code={code} isSpectator={isSpectator} />
}

function Lobby({ game, code, isSpectator }: { game: Pitch; code: string; isSpectator: boolean }) {
  const isPublic = game.state?.config.isPublic ?? false
  const totalRounds = game.state?.config.totalRounds ?? 3
  const enoughPlayers = game.players.length >= MIN_PLAYERS
  const canAddBot = game.players.length < MAX_PLAYERS
  const fillWithBots = () => {
    const need = Math.max(0, MIN_PLAYERS - game.players.length)
    for (let i = 0; i < need; i++) game.send.addBot()
  }
  // PLAY SOLO (?bots=1): once this player is host of the lobby, auto-fill
  // the room with AI inventors — fires exactly once.
  useSoloBots(game.isHost, game.state?.phase ?? 'LOBBY', fillWithBots)

  return (
    <ControllerShell
      accent={META.accent}
      code={code}
      myName={game.me?.name}
      myColor={game.me?.color}
      connected={game.connected}
    >
      <World kind="indigo-burst" dim />
      {/* Two-zone lobby: the identity + roster zone scrolls (soft-faded edge) so
          an 8-player roster never pushes the host controls off-screen; the host
          controls stay pinned + always visible. The page root stays h-dvh. */}
      <div className="flex min-h-0 flex-1 flex-col pt-3">
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto" style={SCROLL_FADE}>
          {isSpectator && <SpectatorChip />}
          <Eyebrow>{META.title}</Eyebrow>
          <h1 data-testid="lobby-joined" className="mt-1 font-display text-4xl uppercase text-tangerine">
            {isSpectator ? "You're watching" : "You're in!"}
          </h1>

          {game.me && (
            <div className="mt-3">
              <PlayerBadge name={game.me.name} color={game.me.color} you size="md" />
            </div>
          )}

          {/* Profile color picker */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {PLAYER_COLORS.map((c) => {
              const taken = game.players.some((p) => p.color === c && p.userId !== game.myId)
              const active = game.me?.color === c
              return (
                <button
                  key={c}
                  aria-label={`Pick color ${c}`}
                  disabled={taken}
                  onClick={() => game.send.setColor(c)}
                  className={`h-8 w-8 rounded-full transition-transform active:scale-90 disabled:opacity-25 ${active ? 'ring-2 ring-stage ring-offset-2 ring-offset-velvet' : ''}`}
                  style={{ backgroundColor: c }}
                />
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-center gap-x-4 gap-y-2 pb-2">
            {game.players.map((p) => (
              <div key={p.userId} className="flex flex-col items-center gap-1">
                <PlayerBadge name={p.name} color={p.color} you={p.userId === game.myId} size="sm" />
                {p.isBot && (
                  <span className="font-body text-[10px] uppercase tracking-wide text-smoke/70">🤖 bot</span>
                )}
                {game.isHost && p.userId !== game.myId && (
                  <button
                    onClick={() => (p.isBot ? game.send.removeBot(p.userId) : game.send.kick(p.userId))}
                    className="font-body text-xs text-siren/80 hover:text-siren"
                  >
                    {p.isBot ? 'remove' : 'kick'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {game.isHost ? (
          <div className="w-full shrink-0 space-y-2.5 pt-2">
            {!enoughPlayers ? (
              <NeonButton testId="fill-bots-btn" color="tangerine" onClick={fillWithBots} className="w-full px-6 py-4 text-lg">
                🤖 Add inventors to play now
              </NeonButton>
            ) : (
              canAddBot && (
                <NeonButton testId="add-bot-btn" variant="outline" color="smoke" onClick={() => game.send.addBot()} className="w-full px-5 py-3 text-base normal-case">
                  + Add an inventor 🤖
                </NeonButton>
              )
            )}
            {/* Rounds picker — host-set, the original Pitch's lobby control. */}
            <div className="flex w-full items-center justify-between rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3">
              <span className="font-body text-sm text-stage">Rounds</span>
              <div className="flex items-center gap-2">
                {[2, 3, 5].map((n) => (
                  <button
                    key={n}
                    data-testid={`rounds-${n}`}
                    onClick={() => game.send.setConfig({ totalRounds: n })}
                    className="h-10 w-10 rounded-full font-display text-lg transition-colors"
                    style={
                      totalRounds === n
                        ? { backgroundColor: 'var(--color-violet)', color: 'var(--color-stage)' }
                        : { border: '1px solid var(--color-border)', color: 'var(--color-smoke)' }
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <Toggle testId="public-toggle" label="Public room (anyone can join)" on={isPublic} onClick={() => game.send.setConfig({ isPublic: !isPublic })} />
            <NeonButton testId="start-btn" color="gold" onClick={() => game.send.start()} disabled={!enoughPlayers} className="w-full px-8 py-5 text-3xl">
              {enoughPlayers ? 'Start the show' : `Need ${MIN_PLAYERS} players`}
            </NeonButton>
          </div>
        ) : (
          <p className="shrink-0 pt-2 text-center font-body text-smoke">Waiting for the host to start…</p>
        )}
        <ChatBox
          chat={game.chat}
          emotes={game.emotes}
          myCid={game.me?.cid ?? null}
          accent={META.accent}
          onSendChat={game.send.chat}
          onSendEmote={game.send.emote}
        />
      </div>
    </ControllerShell>
  )
}

/** A host settings toggle row (pill switch). */
function Toggle({ label, on, onClick, testId }: { label: string; on: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3.5 text-left font-body text-sm text-stage transition-colors active:scale-[0.99]"
    >
      <span>{label}</span>
      <span
        className="ml-3 flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors"
        style={{ backgroundColor: on ? 'var(--color-tangerine)' : 'rgba(184,166,201,0.25)' }}
      >
        <span className="h-5 w-5 rounded-full bg-velvet transition-transform" style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
      </span>
    </button>
  )
}

/** Persistent "you're audience" badge — spectators watch, chat, and emote (no votes in Pitch). */
function SpectatorChip() {
  return (
    <div
      data-testid="spectator-chip"
      className="fixed left-1/2 top-14 z-40 -translate-x-1/2 rounded-full border-2 border-violet/50 bg-plum/80 px-4 py-1.5 font-body text-sm text-violet backdrop-blur"
    >
      👀 Spectating
    </div>
  )
}
