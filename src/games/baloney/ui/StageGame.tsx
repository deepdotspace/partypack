/**
 * StageGame — the TV view for every in-game Baloney phase (LOBBY is handled
 * by Stage.tsx), in the gold-dots world's language: the question rides a big
 * TILTED BLACK Banner (fibbage3-board), player content sits on cream
 * ContentCards, and system calls-to-action run on magenta/cyan accent strips.
 * Reads authoritative state from useBaloney; sends nothing (display only).
 *
 * The marquee moment is REVEAL: lie cards land one at a time (fewest-fooled
 * first) with the author's NamePlate, a magenta BALONEY! stamp, and the fooled
 * players' VoterTags piling onto the card — then THE TRUTH slams in last as a
 * giant magenta-bordered cream card with its ribbon (fibbage3-truth-reveal).
 * All juice is reduced-motion-aware.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Baloney } from '../useBaloney'
import { roundMultiplier } from '../scoring'
import type { AnswerOption, GameState } from '../types'
import { Banner } from '../../../shared/Banner'
import { ContentCard } from '../../../shared/ContentCard'
import { PlayerToken, NamePlate } from '../../../shared/PlayerToken'
import { Avatar } from '../../../shared/Avatar'
import { ScoreRows, type ScoreRowData } from '../../../shared/ScoreRows'
import { TimerBadge } from '../../../shared/TimerBadge'
import { VoterTags, type VoterTag } from '../../../shared/VoterTags'
import type { Mood } from '../../../shared/Host'
import { SCROLL_FADE } from '../../../shared/shells'
import { burst, cannons, springy, stampIn } from '../../../shared/motion'
import { sound } from '../../../shared/sound'

const INK = '#131313'
const CREAM = '#FFFDF5'
const MAGENTA = '#FF2E97'
const CYAN = '#27E1FF'

/** The mascot's reaction to the current phase (consumed by Stage.tsx). */
export function moodFor(game: Baloney): Mood {
  const s = game.state
  if (!s) return 'idle'
  switch (s.phase) {
    case 'INTRO':
      return 'excited'
    case 'PROMPT':
    case 'WRITE':
      return 'thinking'
    case 'VOTE':
      return 'sly'
    case 'REVEAL':
      return 'shock'
    case 'SCORE':
      return 'proud'
    case 'PODIUM':
      return 'celebrate'
    default:
      return 'idle'
  }
}

/** Stage-only timer SFX: tick each of the last 10 seconds, buzzer on expiry.
 *  Early phase advances change `endsAt` before zero, so no false buzzers. */
function useTimerSfx(endsAt: number | null): void {
  const last = useRef<number | null>(null)
  useEffect(() => {
    last.current = null
    if (endsAt == null) return
    const id = setInterval(() => {
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (last.current === secs) return
      const prev = last.current
      last.current = secs
      if (prev == null) return // don't tick/buzz on first observation
      if (secs > 0 && secs <= 10) sound.countTick()
      else if (secs === 0 && prev > 0) sound.buzzer()
    }, 150)
    return () => clearInterval(id)
  }, [endsAt])
}

export function StageGame({ game }: { game: Baloney }) {
  const s = game.state
  // Sound: phase-change cues on the shared screen (Stage only). Reveal gets a
  // drum-roll, podium a fanfare; everything else a soft whoosh.
  const lastPhase = useRef<string>('')
  useEffect(() => {
    if (!s) return
    if (lastPhase.current && lastPhase.current !== s.phase) {
      if (s.phase === 'REVEAL') sound.drumroll()
      else if (s.phase === 'PODIUM') sound.fanfare()
      else sound.whoosh()
    }
    lastPhase.current = s.phase
  }, [s?.phase])
  useTimerSfx(s?.phaseEndsAt ?? null)
  if (!s) return null
  return <Body game={game} />
}

function roundLabel(s: GameState): string {
  return s.roundIndex === s.config.totalRounds - 1 ? 'Final Round' : `Round ${s.roundIndex + 1}`
}

function Body({ game }: { game: Baloney }) {
  const s = game.state!

  switch (s.phase) {
    case 'INTRO': {
      const mult = roundMultiplier(s.roundIndex, s.config.totalRounds)
      return (
        <Center>
          <AccentStrip color={CYAN}>
            {s.roundIndex === s.config.totalRounds - 1 ? 'The last one' : `Round ${s.roundIndex + 1} of ${s.config.totalRounds}`}
          </AccentStrip>
          <SlamBanner big>{roundLabel(s)}</SlamBanner>
          {mult > 1 && (
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: -6 }}
              transition={{ ...springy, delay: 0.15 }}
              className="mt-6 border-[3px] border-[#131313] bg-[#FF2E97] px-7 py-2 font-display text-3xl uppercase text-[#131313]"
              style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.35)' }}
            >
              {mult}× points
            </motion.div>
          )}
          <p className="mt-7 font-display text-2xl uppercase text-[#131313]/85">One truth. Everyone else is lying.</p>
        </Center>
      )
    }

    case 'PROMPT':
      return (
        <Center>
          {s.question && <AccentStrip color={CYAN}>{s.question.category}</AccentStrip>}
          {s.question && <QuestionBanner text={s.question.prompt} slam />}
          <p className="mt-9 font-display text-xl uppercase text-[#131313]/85">Cook up your most convincing lie…</p>
        </Center>
      )

    case 'WRITE': {
      const inCount = game.players.filter((p) => s.lies[p.userId] !== undefined).length
      return (
        <Shell endsAt={s.phaseEndsAt}>
          {s.question && <QuestionBanner text={s.question.prompt} />}
          <Ticker>Type your lie on your phone</Ticker>
          <p className="mt-6 font-display text-3xl uppercase text-[#131313] tabular-nums">
            {inCount} / {game.players.length} lies in
          </p>
          {/* Roster — tokens flip to a happy face the moment a lie locks. */}
          <div className="mt-8 flex w-full max-w-5xl flex-wrap items-start justify-center gap-x-8 gap-y-5">
            {game.players.map((p) => {
              const done = s.lies[p.userId] !== undefined
              return (
                <motion.div key={p.userId} layout animate={{ scale: done ? [1, 1.08, 1] : 1, opacity: done ? 1 : 0.62 }}>
                  <PlayerToken name={p.name} color={p.color} seat={p.joinedOrder} mood={done ? 'happy' : 'idle'} size="md" />
                </motion.div>
              )
            })}
          </div>
        </Shell>
      )
    }

    case 'VOTE': {
      const voted = game.players.filter((p) => s.votes[p.userId] !== undefined).length
      return (
        <Shell endsAt={s.phaseEndsAt}>
          {s.question && <QuestionBanner text={s.question.prompt} />}
          <AccentStrip color={MAGENTA} className="mt-5">
            Which one is the truth?
          </AccentStrip>
          {/* The board — staggered cream pills with alternating tilts, dealt in. */}
          <div className="mt-8 grid w-full max-w-5xl gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {s.options.map((o, i) => (
              <BoardPill key={o.id} text={o.text} index={i} />
            ))}
          </div>
          <p className="mt-8 font-display text-2xl uppercase text-[#131313] tabular-nums">
            {voted} / {game.players.length} voted
          </p>
        </Shell>
      )
    }

    case 'REVEAL':
      return <Reveal game={game} />

    case 'SCORE':
      return (
        <Shell endsAt={s.phaseEndsAt}>
          <div className="shrink-0">
            <SlamBanner>Scores</SlamBanner>
          </div>
          {/* 8 rows with answer pills is the tallest case — scroll INSIDE this
              bounded column (soft fade) as a last resort; page stays h-dvh. */}
          <div className="mt-5 min-h-0 w-full max-w-3xl overflow-y-auto px-1 py-1" style={SCROLL_FADE}>
            <ScoreRows rows={scoreRowsFor(game, true)} />
          </div>
        </Shell>
      )

    case 'PODIUM':
      return <Podium game={game} />

    default:
      return null
  }
}

/** Standings → ScoreRows data (fibbagexl-scores: this round's lie rides the
 *  white pill in the middle of each player's color row). */
function scoreRowsFor(game: Baloney, withLies: boolean): ScoreRowData[] {
  const s = game.state!
  return game.players.map((p) => ({
    id: p.userId,
    name: p.name,
    color: p.color,
    score: p.score,
    answer: withLies ? s.lies[p.userId] : undefined,
    delta: s.result?.deltas[p.userId] ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// Reveal — the marquee moment
// ---------------------------------------------------------------------------

function Reveal({ game }: { game: Baloney }) {
  const s = game.state!
  const result = s.result
  const reduce = useReducedMotion()
  const tagFor = (id: string): VoterTag => {
    const p = s.players[id]
    return { name: p?.name ?? '?', color: p?.color ?? '#b8a6c9', seat: p?.joinedOrder ?? 0 }
  }
  const nameFor = (id: string) => s.players[id]?.name ?? '?'

  // Order: lies by ascending votes, truth last — the dramatic reveal order.
  const ordered: AnswerOption[] = [...s.options]
    .filter((o) => !o.isTruth)
    .sort((a, b) => (result?.votesByOption[a.id]?.length ?? 0) - (result?.votesByOption[b.id]?.length ?? 0))
  const truth = s.options.find((o) => o.isTruth)
  if (truth) ordered.push(truth)

  // Reveal one card at a time (reduced motion: all at once).
  const [shown, setShown] = useState(reduce ? ordered.length : 1)
  useEffect(() => {
    if (shown >= ordered.length) return
    const id = setTimeout(() => setShown((n) => n + 1), 1400)
    return () => clearTimeout(id)
  }, [shown, ordered.length])
  // Sound the card that just appeared: ding for the truth, stamp for a busted
  // lie, pop for a lie nobody fell for.
  useEffect(() => {
    const row = ordered[shown - 1]
    if (!row) return
    if (row.isTruth) sound.ding()
    else if ((result?.votesByOption[row.id]?.length ?? 0) > 0) sound.stamp()
    else sound.pop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  // Height-budgeted for a TV (no scrolling): lies land on a 2-up grid, then
  // THE TRUTH gets the full width below them.
  const lies = ordered.filter((o) => !o.isTruth)
  const shownLies = Math.min(shown, lies.length)
  const truthShown = !!truth && shown > lies.length

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-hidden px-8 py-5">
      {s.question && <QuestionBanner text={s.question.prompt} small />}
      <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center gap-6 pt-5">
        {/* The lie grid is the only genuinely-unbounded zone (up to 6 lies).
            It scrolls INSIDE this bounded column as a last resort — the page
            root is h-dvh/overflow-hidden, so the page itself never scrolls. */}
        <div className="grid min-h-0 grid-cols-1 gap-x-10 gap-y-6 overflow-y-auto sm:grid-cols-2">
          <AnimatePresence>
            {lies.slice(0, shownLies).map((o) => {
              const voters = result?.votesByOption[o.id] ?? []
              return (
                <LieCard
                  key={o.id}
                  text={o.text}
                  authors={o.authorIds.map(nameFor).join(' & ')}
                  voters={voters.map(tagFor)}
                  busted={voters.length > 0}
                />
              )
            })}
          </AnimatePresence>
        </div>
        <div className="mx-auto w-full max-w-3xl shrink-0">
          <AnimatePresence>
            {truthShown && truth && (
              <TruthCard key={truth.id} text={truth.text} voters={(result?.votesByOption[truth.id] ?? []).map(tagFor)} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/** A revealed lie: cream card + fooled-voter tags piling on, the author's
 *  NamePlate hanging beneath, and the magenta BALONEY! stamp when it hit. */
function LieCard({ text, authors, voters, busted }: { text: string; authors: string; voters: VoterTag[]; busted: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={springy}
      className="relative"
    >
      <ContentCard tilt={-0.8} className="relative px-6 py-3.5 text-center">
        <VoterTags voters={voters} />
        <p className="truncate font-marker text-2xl leading-snug">{text}</p>
        {busted && (
          <motion.span
            variants={reduce ? undefined : stampIn}
            initial={reduce ? { opacity: 0 } : 'hidden'}
            animate={reduce ? { opacity: 1 } : 'show'}
            className="pointer-events-none absolute -right-4 -top-5 rotate-6 border-[3px] border-[#131313] bg-[#FF2E97] px-2.5 py-0.5 font-display text-lg uppercase tracking-wider text-[#131313]"
            style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}
          >
            Baloney!
          </motion.span>
        )}
        {!busted && voters.length === 0 && (
          <span className="pointer-events-none absolute -right-3 -top-4 rotate-3 bg-[#131313] px-2 py-0.5 font-display text-xs uppercase tracking-wide text-[#FFFDF5]/80">
            no takers
          </span>
        )}
      </ContentCard>
      <div className="absolute inset-x-0 -bottom-3.5 flex justify-center">
        <NamePlate tilt={1.5} className="max-w-[60%] px-3 py-0.5 text-sm">
          {authors}'s lie
        </NamePlate>
      </div>
    </motion.div>
  )
}

/** THE TRUTH — a giant magenta-bordered cream card scaling in, "the truth"
 *  ribbon riding its bottom edge, truth-finders piling on top. */
function TruthCard({ text, voters }: { text: string; voters: VoterTag[] }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.3 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className="relative"
    >
      <ContentCard
        tilt={0}
        className="relative px-8 py-6 text-center"
        style={{ border: `5px solid ${MAGENTA}`, boxShadow: `8px 8px 0 rgba(0,0,0,0.45)` }}
      >
        <VoterTags voters={voters} />
        <p className="font-display text-3xl uppercase leading-tight text-[#131313] sm:text-4xl">{text}</p>
      </ContentCard>
      <div className="absolute inset-x-0 -bottom-5 flex justify-center">
        <span
          className="rotate-[-1.5deg] border-[3px] border-[#131313] bg-[#FF2E97] px-7 py-1 font-display text-xl lowercase tracking-wide text-[#131313]"
          style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}
        >
          the truth
        </span>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function Podium({ game }: { game: Baloney }) {
  const s = game.state!
  const standings = s.summary?.standings ?? []
  const winner = standings[0]
  const winnerSeat = winner ? (s.players[winner.userId]?.joinedOrder ?? 0) : 0
  const best = s.summary?.bestLie
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!reduce) cannons(['#FF2E97', '#27E1FF', '#FFD23F'])
  }, [reduce])
  return (
    // Height-budgeted: a compact winner row + a standings/best-baloney 2-up grid
    // fits 1280×720; an internal scroller is the last-resort safety valve (the
    // page root is h-dvh/overflow-hidden).
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-y-auto px-8 py-5 text-center">
      <AccentStrip color={CYAN}>That's the show</AccentStrip>
      {winner && (
        <div className="flex shrink-0 items-center gap-4">
          <motion.div initial={reduce ? { opacity: 0 } : { y: -40, opacity: 0, scale: 0.5 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={springy}>
            <Avatar seat={winnerSeat} color={winner.color} mood="celebrate" size={84} />
          </motion.div>
          <div className="text-left">
            <NamePlate tilt={-1.5} className="px-5 py-1 text-xl">
              {winner.name}
            </NamePlate>
            <p className="mt-1 font-display text-base uppercase text-[#131313]/85">wins with {winner.score} points</p>
          </div>
        </div>
      )}
      <div className={`grid w-full items-center gap-x-10 gap-y-4 ${best ? 'max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]' : 'max-w-xl'}`}>
        <ScoreRows rows={standings.map((p) => ({ id: p.userId, name: p.name, color: p.color, score: p.score }))} />
        {/* "Best baloney" — the night's most-fooling lie, framed like evidence. */}
        {best && (
          <ContentCard tilt={1.2} className="px-5 py-3 text-left">
            <p className="font-body text-xs font-bold uppercase tracking-[0.3em] text-[#FF2E97]">Best baloney</p>
            <p className="mt-0.5 line-clamp-1 font-body text-sm font-semibold text-[#1A1A1A]/70">{best.prompt}</p>
            <p className="mt-1 line-clamp-2 font-marker text-xl leading-snug">“{best.text}”</p>
            <p className="mt-0.5 font-body text-sm font-bold text-[#1A1A1A]">
              {best.authors.map((a) => a.name).join(' & ')} · fooled {best.fooled} {best.fooled === 1 ? 'player' : 'players'}
            </p>
          </ContentCard>
        )}
      </div>
      {/* Celebrate the winner with one more burst once the list settles. */}
      <WinnerBurst color={winner?.color} />
    </div>
  )
}

function WinnerBurst({ color }: { color?: string }) {
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce || !color) return
    const id = setTimeout(() => burst([color, '#FFD23F']), 900)
    return () => clearTimeout(id)
  }, [color, reduce])
  return null
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-8 py-5 text-center">{children}</div>
}

function Shell({ children, endsAt }: { children: React.ReactNode; endsAt: number | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-5">
      {/* Timer diamond — inset past the fixed CodeBadge + mute cluster top-right. */}
      <header className="flex min-h-[3.5rem] shrink-0 items-center justify-end pr-44">
        <TimerBadge endsAt={endsAt} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden text-center">{children}</div>
    </div>
  )
}

/** The system call-to-action strip — accent color, ink letterspaced caps,
 *  slight tilt (the green "CHOOSE AN ANSWER" band on fibbage3-board). */
export function AccentStrip({
  children,
  color = MAGENTA,
  className = '',
}: {
  children: React.ReactNode
  color?: string
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`inline-block border-[3px] border-[#131313] px-5 py-1.5 font-display text-base uppercase tracking-[0.3em] text-[#131313] ${className}`}
      style={{ backgroundColor: color, rotate: reduce ? '0deg' : '-1deg', boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}
    >
      {children}
    </motion.div>
  )
}

/** The question slab — THE tilted black banner (fibbage3-board), cream display
 *  text, slams in when `slam`. */
function QuestionBanner({ text, slam = false, small = false }: { text: string; slam?: boolean; small?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : slam ? { scale: 1.3, opacity: 0 } : { y: -16, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={springy}
      className={`w-full ${small ? 'max-w-3xl' : 'max-w-4xl'} ${slam ? 'mt-6' : ''}`}
    >
      <Banner tilt={-1.8} className={`text-center ${small ? 'px-6 py-3 text-xl sm:text-2xl' : 'px-8 py-5 text-2xl sm:text-3xl'}`}>
        {text}
      </Banner>
    </motion.div>
  )
}

/** Big black title banner ("ROUND 2" / "SCORES"). */
function SlamBanner({ children, big = false }: { children: React.ReactNode; big?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springy}
      className="mt-4"
    >
      <Banner tilt={-2} className={`px-10 uppercase ${big ? 'py-5 text-6xl sm:text-7xl' : 'py-4 text-5xl'}`}>
        {children}
      </Banner>
    </motion.div>
  )
}

/** The "enter lies now" ticker (fibbagexl-lie-entry) — a magenta band whose
 *  call-to-action scrolls forever. CSS keyframe scroll (compositor), not a
 *  framer loop; the stylesheet's reduced-motion query freezes it. */
function Ticker({ children }: { children: string }) {
  const reduce = useReducedMotion()
  const copy = `${children} · `.toUpperCase()
  return (
    <div
      className="mt-7 w-full max-w-4xl overflow-hidden border-y-[3px] border-[#131313] bg-[#FF2E97] py-2"
      style={{ rotate: reduce ? '0deg' : '0.8deg', boxShadow: '4px 4px 0 rgba(0,0,0,0.3)' }}
    >
      <div className="anim-ticker flex w-max whitespace-nowrap font-display text-xl tracking-[0.2em] text-[#131313]">
        <span>{copy.repeat(4)}</span>
        <span>{copy.repeat(4)}</span>
      </div>
    </div>
  )
}

/** One answer on the big VOTE board — a cream pill, dealt in with an
 *  alternating tilt; odd columns drop slightly for the staggered grid. */
function BoardPill({ text, index }: { text: string; index: number }) {
  const reduce = useReducedMotion()
  const tilt = index % 2 === 0 ? -1.4 : 1.4
  return (
    <motion.div
      data-testid="stage-option"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 34, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...springy, delay: reduce ? 0 : 0.12 * index }}
      style={{ marginTop: reduce ? 0 : index % 2 === 1 ? 14 : 0 }}
    >
      <ContentCard tilt={tilt} className="px-5 py-4 text-center">
        <span className="font-marker text-2xl leading-snug">{text}</span>
      </ContentCard>
    </motion.div>
  )
}
