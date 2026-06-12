/**
 * Baloney Play — the phone (Controller). Anonymous: pick a name → join →
 * lobby → live game. No sign-in; identity is a localStorage cid (see
 * shared/identity + useBaloney). Pre-game screens render inside the quiet
 * ControllerShell over the dimmed gold-dots world; in-game phases use the
 * BroadcastFrame (top bar + standings rail + inline chat). Music plays here
 * too, at the quieter 'controller' volume (ControllerShell pre-game,
 * BroadcastFrame in-game). The host is a full player here (writes a lie +
 * votes) and additionally gets Start / rounds / bots / Skip controls.
 * Arriving with ?bots=1 (the landing's PLAY SOLO path) auto-fills AI liars
 * once the player becomes host of the lobby.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GameViewProps } from '../roomApi'
import { useBaloney, type Baloney } from './useBaloney'
import { MAX_PLAYERS, MIN_PLAYERS } from './types'
import { GAMES } from '../registry'
import { PLAYER_COLORS } from '../../shared/colors'
import { World } from '../../shared/World'
import { Banner } from '../../shared/Banner'
import { ContentCard } from '../../shared/ContentCard'
import { PlayerToken } from '../../shared/PlayerToken'
import { ChatBox } from '../../shared/ChatBox'
import { NeonButton } from '../../shared/primitives'
import { ControllerShell, DisconnectBanner, SCROLL_FADE } from '../../shared/shells'
import { useSoloBots } from '../../shared/useSoloBots'
import { ControllerGame } from './ui/ControllerGame'
import { BroadcastFrame } from './ui/BroadcastFrame'

const META = GAMES.baloney

const INK = '#131313'
const CREAM = '#FFFDF5'

export default function BaloneyPlay({ code, room }: GameViewProps) {
  const game = useBaloney(room, code, 'play')
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
        <World kind="indigo-burst" dim />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Banner tilt={-1.5} className="px-5 py-2 text-sm uppercase tracking-[0.25em]">
            Joining {META.title}
          </Banner>
          <h1
            className="mt-4 font-display text-7xl uppercase tracking-[0.08em] text-[#FFD23F]"
            style={{ textShadow: '4px 4px 0 rgba(0,0,0,0.45)' }}
          >
            {code}
          </h1>
          <p className="mt-2 font-body text-sm font-semibold text-[#FFFDF5]/85">{META.tagline}</p>
          <p className="mt-6 font-body font-semibold text-[#FFFDF5]/85">What should we call you?</p>
          <ContentCard tilt={-1} className="mt-3 w-full px-2 py-1">
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
              className="w-full bg-transparent px-3 py-3 text-center font-marker text-3xl text-[#1A1A1A] placeholder:text-[#1A1A1A]/35 focus:outline-none"
            />
          </ContentCard>
          <NeonButton
            testId="join-game-btn"
            color="magenta"
            onClick={() => game.send.join(name.trim() || 'Player')}
            disabled={!game.connected || !name.trim()}
            className="mt-5 w-full px-8 py-4 text-2xl"
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

export function Lobby({ game, code, isSpectator }: { game: Baloney; code: string; isSpectator: boolean }) {
  const totalRounds = game.state?.config.totalRounds ?? 3
  const isPublic = game.state?.config.isPublic ?? false
  const enoughPlayers = game.players.length >= MIN_PLAYERS
  const canAddBot = game.players.length < MAX_PLAYERS
  const fillWithBots = () => {
    const need = Math.max(0, MIN_PLAYERS - game.players.length)
    for (let i = 0; i < need; i++) game.send.addBot()
  }
  // PLAY SOLO (?bots=1): once this player is host of the lobby, seat AI liars.
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
      {/* Two-zone lobby: identity + roster scroll (soft-faded edge) so an
          8-player roster never pushes host controls off-screen; the host
          controls stay pinned + always visible. The page root stays h-dvh. */}
      <div className="flex min-h-0 flex-1 flex-col pt-3">
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto" style={SCROLL_FADE}>
          {isSpectator && <SpectatorChip />}
          <Banner testId="lobby-joined" tilt={-1.5} className="px-7 py-2.5 text-3xl uppercase">
            {isSpectator ? "You're watching" : "You're in!"}
          </Banner>

          {game.me && (
            <div className="mt-3">
              <PlayerToken name={game.me.name} color={game.me.color} seat={game.me.joinedOrder} size="lg" you mood="happy" />
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
                  className={`h-8 w-8 rounded-full border-2 border-[#131313] transition-transform active:scale-90 disabled:opacity-25 ${active ? 'ring-2 ring-[#FFFDF5] ring-offset-2 ring-offset-transparent' : ''}`}
                  style={{ backgroundColor: c }}
                />
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-center gap-x-5 gap-y-3 pb-2">
            {game.players.map((p) => (
              <div key={p.userId} className="flex flex-col items-center gap-1">
                <PlayerToken name={p.name} color={p.color} seat={p.joinedOrder} size="sm" you={p.userId === game.myId} />
                {p.isBot && (
                  <span className="bg-[#131313] px-1.5 font-body text-[10px] uppercase tracking-wide text-[#FFFDF5]/85">🤖 bot</span>
                )}
                {game.isHost && p.userId !== game.myId && (
                  <button
                    onClick={() => (p.isBot ? game.send.removeBot(p.userId) : game.send.kick(p.userId))}
                    className="font-body text-xs font-semibold text-[#FF6B6B] hover:text-[#FF3B3B]"
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
            {/* Rounds picker — 1-5 (engine-clamped to the same range). */}
            <div className="flex items-center justify-between rounded-xl bg-[#131313]/80 px-5 py-3" style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.3)' }}>
              <span className="font-display text-sm uppercase text-[#FFFDF5]">Rounds</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    data-testid={`rounds-${n}`}
                    onClick={() => game.send.setConfig({ totalRounds: n })}
                    className="h-9 w-9 rounded-full font-display text-base transition-colors"
                    style={
                      totalRounds === n
                        ? { backgroundColor: '#27E1FF', color: INK }
                        : { border: `1px solid ${CREAM}55`, color: `${CREAM}B3` }
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {!enoughPlayers ? (
              <NeonButton testId="fill-bots-btn" color="magenta" onClick={fillWithBots} className="w-full px-6 py-4 text-lg">
                🤖 Add a liar to play now
              </NeonButton>
            ) : (
              canAddBot && (
                <NeonButton testId="add-bot-btn" variant="outline" color="smoke" onClick={() => game.send.addBot()} className="w-full px-5 py-3 text-base normal-case">
                  + Add a liar 🤖
                </NeonButton>
              )
            )}
            <Toggle testId="public-toggle" label="Public room (anyone can join)" on={isPublic} onClick={() => game.send.setConfig({ isPublic: !isPublic })} />
            <NeonButton testId="start-btn" color="gold" onClick={() => game.send.start()} disabled={!enoughPlayers} className="w-full px-8 py-5 text-3xl">
              {enoughPlayers ? 'Start the show' : `Need ${MIN_PLAYERS} players`}
            </NeonButton>
          </div>
        ) : (
          <p className="shrink-0 pt-2 text-center font-body font-semibold text-[#FFFDF5]/85">Waiting for the host to start…</p>
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

/** A host settings toggle row (pill switch) — ink slab on the dimmed gold. */
function Toggle({ label, on, onClick, testId }: { label: string; on: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl bg-[#131313]/80 px-5 py-3.5 text-left font-body text-sm font-semibold text-[#FFFDF5] transition-colors active:scale-[0.99]"
      style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.3)' }}
    >
      <span>{label}</span>
      <span
        className="ml-3 flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors"
        style={{ backgroundColor: on ? '#27E1FF' : 'rgba(255,253,245,0.25)' }}
      >
        <span className="h-5 w-5 rounded-full bg-[#131313] transition-transform" style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
      </span>
    </button>
  )
}

/** Persistent "you're audience" badge — spectators watch + chat (no voting in baloney). */
function SpectatorChip() {
  return (
    <div
      data-testid="spectator-chip"
      className="fixed left-1/2 top-14 z-40 -translate-x-1/2 rounded-full border-2 border-[#27E1FF]/60 bg-[#131313]/85 px-4 py-1.5 font-body text-sm text-[#27E1FF] backdrop-blur"
    >
      👀 Spectating
    </div>
  )
}
