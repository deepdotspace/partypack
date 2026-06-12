/**
 * /recap/:id — the public, shareable recap of a finished game (any of the
 * three). The GameRoom DO writes one `games` row at the podium; this page is
 * the screenshot-shaped artifact that row links to (the podium's "share"
 * link points here). Game-aware: badge + accents come from the registry via
 * `record.data.game`, and the highlight block renders the game-specific
 * payload (wisecrack: top matchup · baloney: best baloney · pitch: invention
 * of the night).
 */
import { Link, useParams } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { useQuery } from 'deepspace'
import { GAMES, isGameId, type GameId } from '../../games/registry'
import { Backdrop } from '../../shared/Backdrop'
import { Eyebrow, NeonButton, ACCENT_HEX, Card } from '../../shared/primitives'

interface GameRow {
  game: string
  roomCode: string
  winnerName: string
  winnerColor: string
  winnerScore: number
  payload: string
  finishedAt: number
}

/** Union of the three games' recap payloads (see each game's `recap()` in src/games/<id>/index.ts). */
interface RecapPayload {
  standings: { name: string; color: string; score: number }[]
  /** wisecrack — the bit of the night. */
  topMatchup?: { promptText: string; answers: { name: string; color: string; text: string; votes: number }[] } | null
  /** baloney — the most-fooling lie. */
  bestLie?: { prompt: string; text: string; authors: { name: string; color: string }[]; fooled: number } | null
  /** pitch — the most-voted invention. */
  topInvention?: { name: string; pitch: string; byName: string; byColor: string; votes: number; briefPrompt: string } | null
}

export default function Recap() {
  const { id } = useParams()
  const { records, status } = useQuery<GameRow>('games')
  const row = records.find((r) => r.recordId === id)
  const gameId: GameId = row && isGameId(row.data.game) ? row.data.game : 'wisecrack'
  const meta = GAMES[gameId]
  const hex = ACCENT_HEX[meta.accent as keyof typeof ACCENT_HEX]
  const hex2 = ACCENT_HEX[meta.accent2 as keyof typeof ACCENT_HEX]

  return (
    // h-dvh + overflow-hidden: the recap owns the screen and never page-scrolls;
    // the centered column scrolls INSIDE only if a long standings list needs it.
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-y-auto px-5 py-8">
      <Backdrop />
      <Link
        to="/"
        className="mb-8 font-display text-3xl uppercase text-stage"
        style={{ WebkitTextStroke: '2px #0d0921', paintOrder: 'stroke fill', textShadow: '4px 4px 0 rgba(13,9,33,0.85)' }}
      >
        Party Pack
      </Link>

      {status === 'loading' && <p className="font-body text-smoke">Loading recap…</p>}

      {status !== 'loading' && !row && (
        <div className="text-center" data-testid="recap-not-found">
          <p className="font-body text-xl text-smoke">That recap has rolled off the air.</p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-[1.25rem] bg-gold px-7 py-3.5 font-display text-lg uppercase text-velvet transition-transform active:scale-95"
            style={{ boxShadow: 'var(--glow-gold)' }}
          >
            Play Party Pack
          </Link>
        </div>
      )}

      {row && (
        <>
          <Card accent={meta.accent as 'lime'} glow className="w-full max-w-2xl p-7 sm:p-8">
            {/* Game badge + date */}
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hex, boxShadow: `0 0 10px ${hex}` }} />
                <Eyebrow color={meta.accent as 'gold'} className="!text-xs">
                  {meta.title} · Party Pack
                </Eyebrow>
              </span>
              <span className="font-body text-xs text-smoke">
                {new Date(row.data.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            {/* Winner */}
            <div className="mt-5 flex flex-col items-center text-center">
              <Crown className="h-12 w-12" style={{ color: row.data.winnerColor }} />
              <h1 data-testid="recap-winner" className="mt-1 font-display text-5xl uppercase" style={{ color: row.data.winnerColor }}>
                {row.data.winnerName}
              </h1>
              <p className="mt-1 font-body text-lg text-smoke">
                wins with <span className="font-semibold text-stage">{row.data.winnerScore}</span> points
              </p>
            </div>

            {/* Standings */}
            <div className="mt-6 space-y-2">
              {safeParse(row.data.payload).standings.map((p, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[1rem] bg-velvet/60 px-4 py-2.5">
                  <span className="w-6 font-display text-lg text-smoke">{i + 1}</span>
                  <span className="h-6 w-6 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="min-w-0 flex-1 truncate text-left font-body font-semibold text-stage">{p.name}</span>
                  <span className="font-score text-xl font-extrabold" style={{ color: hex2 }}>
                    {p.score}
                  </span>
                </div>
              ))}
            </div>

            <Highlight gameId={gameId} payload={safeParse(row.data.payload)} hex={hex} hex2={hex2} />
          </Card>

          <Link to="/" className="mt-8">
            <NeonButton color={meta.accent as 'lime'} className="px-8 py-4 text-xl">
              Play Party Pack
            </NeonButton>
          </Link>
        </>
      )}
    </div>
  )
}

/** The game-specific "moment of the night" block. */
function Highlight({ gameId, payload, hex, hex2 }: { gameId: GameId; payload: RecapPayload; hex: string; hex2: string }) {
  if (gameId === 'wisecrack' && payload.topMatchup) {
    const m = payload.topMatchup
    return (
      <HighlightFrame hex={hex2} label="Bit of the night">
        <p className="mt-2 font-body text-xl font-semibold text-stage">{m.promptText}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {m.answers.map((a, i) => (
            <div key={i} className="rounded-[1rem] px-3 py-2.5" style={{ border: `2px solid ${a.color}` }}>
              <p className="font-body font-semibold text-stage">{a.text}</p>
              <p className="font-body text-xs" style={{ color: a.color }}>
                {a.name} · {a.votes} {a.votes === 1 ? 'vote' : 'votes'}
              </p>
            </div>
          ))}
        </div>
      </HighlightFrame>
    )
  }
  if (gameId === 'baloney' && payload.bestLie) {
    const l = payload.bestLie
    return (
      <HighlightFrame hex={hex2} label="Best baloney">
        <p className="mt-2 font-body text-base text-smoke">{l.prompt}</p>
        <p className="mt-2 font-body text-xl font-semibold text-stage">“{l.text}”</p>
        <p className="mt-2 font-body text-sm" style={{ color: hex }}>
          {l.authors.map((a) => a.name).join(' + ') || 'Somebody'} fooled {l.fooled} {l.fooled === 1 ? 'player' : 'players'}
        </p>
      </HighlightFrame>
    )
  }
  if (gameId === 'pitch' && payload.topInvention) {
    const inv = payload.topInvention
    return (
      <HighlightFrame hex={hex2} label="Invention of the night">
        <p className="mt-2 font-body text-base text-smoke">{inv.briefPrompt}</p>
        <p className="mt-2 font-display text-2xl uppercase" style={{ color: hex }}>
          {inv.name}
        </p>
        <p className="mt-1 font-body text-lg font-semibold text-stage">“{inv.pitch}”</p>
        <p className="mt-2 font-body text-sm" style={{ color: inv.byColor }}>
          by {inv.byName} · {inv.votes} {inv.votes === 1 ? 'vote' : 'votes'}
        </p>
      </HighlightFrame>
    )
  }
  return null
}

function HighlightFrame({ hex, label, children }: { hex: string; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-[1.25rem] p-5" style={{ border: `1px solid ${hex}4d` }}>
      <p className="font-body text-xs font-bold uppercase tracking-[0.3em]" style={{ color: hex }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function safeParse(s: string): RecapPayload {
  try {
    return JSON.parse(s) as RecapPayload
  } catch {
    return { standings: [] }
  }
}
