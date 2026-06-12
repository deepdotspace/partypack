/**
 * BroadcastFrame — Wisecrack's in-game /play view. A thin wrapper that hands its
 * game-specific TopBar, standings, and "bit of the night" footer to the shared
 * GameShell (the bordered console with a left score sidebar + a right chat that
 * reflows the stage). Music plays here too (controller volume) — ControllerShell
 * only covers pre-game screens.
 */
import { type ReactNode } from 'react'
import type { Wisecrack } from '../useWisecrack'
import { type GameState, roundMultiplier } from '../types'
import { useCountdown } from '../../../shared/Timer'
import { useMusic } from '../../../shared/music'
import { GameShell } from '../../../shared/GameShell'

export function BroadcastFrame({ game, stage }: { game: Wisecrack; stage: ReactNode }) {
  useMusic(game.state?.phase ?? 'LOBBY', true, 'controller')
  return (
    <GameShell
      accent="lime"
      topBar={<TopBar game={game} />}
      standings={<RailList game={game} />}
      standingsStrip={<RailStrip game={game} />}
      railFooter={
        game.state?.bestMatchup ? (
          <>
            <p className="font-body text-[10px] font-bold uppercase tracking-[0.25em] text-gold/80">Bit of the night</p>
            <p className="mt-1 line-clamp-2 font-body text-xs text-[#FFFDF5]/70">{game.state.bestMatchup.promptText}</p>
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
  INTRO: 'Get ready', WRITE: 'Writing', VOTE: 'Vote', REVEAL: 'Reveal', SCORE: 'Scores',
  FINAL_INTRO: 'Last Lash', FINAL_WRITE: 'Last Lash', FINAL_VOTE: 'Last Lash', FINAL_REVEAL: 'Last Lash',
  PODIUM: 'Results', LOBBY: 'Lobby',
}

function progress(s: GameState): { needed: number; locked: number; verb: string } {
  if (s.phase === 'WRITE' || s.phase === 'FINAL_WRITE') {
    const needed = s.matchups.reduce((n, m) => n + m.authorIds.length, 0)
    const locked = s.matchups.reduce((n, m) => n + m.authorIds.filter((a) => m.answers[a] && !m.safety[a]).length, 0)
    return { needed, locked, verb: 'in' }
  }
  if (s.phase === 'VOTE') {
    const m = s.matchups[s.voteIndex]
    const voters = s.order.filter((id) => m && !m.authorIds.includes(id))
    const cast = m ? voters.filter((id) => m.votes[id]).length : 0
    return { needed: voters.length, locked: cast, verb: 'voted' }
  }
  return { needed: 0, locked: 0, verb: '' }
}

export function TopBar({ game }: { game: Wisecrack }) {
  const s = game.state
  const secs = useCountdown(s?.phaseEndsAt ?? null)
  if (!s) return null
  const { needed, locked, verb } = progress(s)
  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-lg uppercase text-lime">{PHASE_LABEL[s.phase] ?? s.phase}</span>
        <span className="hidden font-body text-sm text-[#FFFDF5]/70 sm:inline">
          Round {Math.min(s.roundIndex + 1, s.config.totalRounds)}/{s.config.totalRounds} · {roundMultiplier(s.roundIndex)}×
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        {needed > 0 && (
          <span className="font-body text-sm font-semibold text-gold tabular-nums">{locked}/{needed} {verb}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {Number.isFinite(secs) && (
          <span className="font-display text-2xl tabular-nums" style={{ color: secs <= 5 ? 'var(--color-coral)' : 'var(--color-gold)' }}>{secs}</span>
        )}
        <span className="hidden font-display text-base tracking-[0.12em] text-lime sm:inline">{s.roomCode}</span>
      </div>
    </>
  )
}

function statusFor(game: Wisecrack, id: string): { text: string; on: boolean } {
  const s = game.state!
  if (s.phase === 'WRITE' || s.phase === 'FINAL_WRITE') {
    const mine = s.matchups.filter((m) => m.authorIds.includes(id))
    const done = mine.length > 0 && mine.every((m) => m.answers[id] && !m.safety[id])
    return done ? { text: '✓', on: true } : { text: '✍️', on: false }
  }
  if (s.phase === 'VOTE') {
    const m = s.matchups[s.voteIndex]
    if (m?.authorIds.includes(id)) return { text: '🎤', on: true }
    return m?.votes[id] ? { text: '🗳️', on: true } : { text: '…', on: false }
  }
  const d = s.lastRoundDeltas[id] ?? 0
  return d > 0 ? { text: `+${d}`, on: true } : { text: '', on: false }
}

function ranked(game: Wisecrack) {
  const s = game.state!
  return s.order.map((id) => s.players[id]).filter(Boolean).sort((a, b) => b.score - a.score)
}

/** Desktop rail: a clean list separated by hairline dividers — no boxes. */
function RailList({ game }: { game: Wisecrack }) {
  return (
    <div className="flex flex-col">
      {ranked(game).map((p, i) => {
        const st = statusFor(game, p.userId)
        const you = p.userId === game.myId
        return (
          <div key={p.userId} className="flex items-center gap-2.5 border-b border-[rgba(255,253,245,0.14)] py-2.5 last:border-0">
            <span className="w-4 font-display text-sm text-[#FFFDF5]/70 tabular-nums">{i + 1}</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="min-w-0 flex-1 truncate font-body text-sm font-semibold" style={{ color: you ? p.color : 'var(--color-stage)' }}>
              {p.name}{you && <span className="text-[#FFFDF5]/70"> (you)</span>}
            </span>
            {st.text && <span className="font-body text-xs" style={{ color: st.on ? p.color : 'rgba(255,253,245,0.7)' }}>{st.text}</span>}
            <span className="font-score text-base text-gold tabular-nums">{p.score}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Mobile rail: a horizontal scrolling row of compact chips. */
function RailStrip({ game }: { game: Wisecrack }) {
  return (
    <div className="flex gap-4">
      {ranked(game).map((p, i) => {
        const st = statusFor(game, p.userId)
        const you = p.userId === game.myId
        return (
          <div key={p.userId} className="flex shrink-0 items-center gap-1.5">
            <span className="font-display text-xs text-[#FFFDF5]/70 tabular-nums">{i + 1}</span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="font-body text-xs font-semibold" style={{ color: you ? p.color : 'var(--color-stage)' }}>{p.name}</span>
            {st.text && <span className="font-body text-xs" style={{ color: st.on ? p.color : 'rgba(255,253,245,0.7)' }}>{st.text}</span>}
            <span className="font-score text-xs text-gold tabular-nums">{p.score}</span>
          </div>
        )
      })}
    </div>
  )
}

