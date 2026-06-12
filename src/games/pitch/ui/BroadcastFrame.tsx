/**
 * BroadcastFrame — Pitch's in-game /play view. A thin wrapper around the shared
 * GameShell (bordered console · left score sidebar · reflowing right chat) with
 * Pitch's accents + phase labels/statuses. Runs the controller music bed —
 * music plays on every device, the phone just sits quieter than the TV.
 */
import { type ReactNode } from 'react'
import type { Pitch } from '../usePitch'
import { type GameState } from '../types'
import { roundMultiplier } from '../scoring'
import { useCountdown } from '../../../shared/Timer'
import { useMusic } from '../../../shared/music'
import { GameShell } from '../../../shared/GameShell'

export function BroadcastFrame({ game, stage }: { game: Pitch; stage: ReactNode }) {
  useMusic(game.state?.phase ?? 'LOBBY', true, 'controller')
  return (
    <GameShell
      accent="tangerine"
      topBar={<TopBar game={game} />}
      standings={<RailList game={game} />}
      standingsStrip={<RailStrip game={game} />}
      railFooter={
        game.state?.bestInvention ? (
          <>
            <p className="font-body text-[10px] font-bold uppercase tracking-[0.25em] text-tangerine/80">Invention of the night</p>
            <p className="mt-1 line-clamp-2 font-body text-xs text-smoke">{game.state.bestInvention.name}</p>
          </>
        ) : undefined
      }
      chat={{
        chat: game.chat,
        emotes: game.emotes,
        myCid: game.me?.cid ?? null,
        onSendChat: game.send.chat,
        onSendEmote: game.send.emote,
      }}
    >
      {stage}
    </GameShell>
  )
}

// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<string, string> = {
  INTRO: 'Get ready', PROMPT: 'The brief', WRITE: 'Inventing', VOTE: 'Vote',
  REVEAL: 'Reveal', SCORE: 'Scores', PODIUM: 'Results', LOBBY: 'Lobby',
}

function progress(s: GameState): { needed: number; locked: number; verb: string } {
  if (s.phase === 'WRITE') {
    const locked = s.order.filter((id) => s.inventions[id] !== undefined).length
    return { needed: s.order.length, locked, verb: 'pitched' }
  }
  if (s.phase === 'VOTE') {
    const voters = s.order.filter((id) => s.options.some((o) => o.userId !== id))
    const cast = voters.filter((id) => s.votes[id] !== undefined).length
    return { needed: voters.length, locked: cast, verb: 'voted' }
  }
  return { needed: 0, locked: 0, verb: '' }
}

export function TopBar({ game }: { game: Pitch }) {
  const s = game.state
  const secs = useCountdown(s?.phaseEndsAt ?? null)
  if (!s) return null
  const { needed, locked, verb } = progress(s)
  const mult = roundMultiplier(Math.min(s.roundIndex, s.config.totalRounds - 1), s.config.totalRounds)
  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-lg uppercase text-tangerine">{PHASE_LABEL[s.phase] ?? s.phase}</span>
        <span className="hidden font-body text-sm text-smoke sm:inline">
          Round {Math.min(s.roundIndex + 1, s.config.totalRounds)}/{s.config.totalRounds} · {mult}×
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        {needed > 0 && (
          <span className="font-body text-sm font-semibold text-violet tabular-nums">{locked}/{needed} {verb}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {Number.isFinite(secs) && (
          <span className="font-display text-2xl tabular-nums" style={{ color: secs <= 5 ? 'var(--color-coral)' : 'var(--color-violet)' }}>{secs}</span>
        )}
        <span className="hidden font-display text-base tracking-[0.12em] text-tangerine sm:inline">{s.roomCode}</span>
      </div>
    </>
  )
}

function statusFor(game: Pitch, id: string): { text: string; on: boolean } {
  const s = game.state!
  if (s.phase === 'WRITE') {
    return s.inventions[id] !== undefined ? { text: '✓', on: true } : { text: '💡', on: false }
  }
  if (s.phase === 'VOTE') {
    if (!s.options.some((o) => o.userId !== id)) return { text: '🎤', on: true }
    return s.votes[id] !== undefined ? { text: '🗳️', on: true } : { text: '…', on: false }
  }
  const d = s.result?.deltas[id] ?? 0
  return d > 0 ? { text: `+${d}`, on: true } : { text: '', on: false }
}

function ranked(game: Pitch) {
  const s = game.state!
  return s.order.map((id) => s.players[id]).filter(Boolean).sort((a, b) => b.score - a.score)
}

/** Desktop rail: a clean list separated by hairline dividers — no boxes. */
function RailList({ game }: { game: Pitch }) {
  return (
    <div className="flex flex-col">
      {ranked(game).map((p, i) => {
        const st = statusFor(game, p.userId)
        const you = p.userId === game.myId
        return (
          <div key={p.userId} className="flex items-center gap-2.5 border-b border-[var(--color-border)]/50 py-2.5 last:border-0">
            <span className="w-4 font-display text-sm text-smoke tabular-nums">{i + 1}</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="min-w-0 flex-1 truncate font-body text-sm font-semibold" style={{ color: you ? p.color : 'var(--color-stage)' }}>
              {p.name}{you && <span className="text-smoke"> (you)</span>}
            </span>
            {st.text && <span className="font-body text-xs" style={{ color: st.on ? p.color : 'var(--color-smoke)' }}>{st.text}</span>}
            <span className="font-score text-base text-violet tabular-nums">{p.score}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Mobile rail: a horizontal scrolling row of compact chips. */
function RailStrip({ game }: { game: Pitch }) {
  return (
    <div className="flex gap-4">
      {ranked(game).map((p, i) => {
        const st = statusFor(game, p.userId)
        const you = p.userId === game.myId
        return (
          <div key={p.userId} className="flex shrink-0 items-center gap-1.5">
            <span className="font-display text-xs text-smoke tabular-nums">{i + 1}</span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="font-body text-xs font-semibold" style={{ color: you ? p.color : 'var(--color-stage)' }}>{p.name}</span>
            {st.text && <span className="font-body text-xs" style={{ color: st.on ? p.color : 'var(--color-smoke)' }}>{st.text}</span>}
            <span className="font-score text-xs text-violet tabular-nums">{p.score}</span>
          </div>
        )
      })}
    </div>
  )
}

