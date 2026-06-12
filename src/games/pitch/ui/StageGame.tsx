/**
 * StageGame — the TV view for every in-game Pitch phase (LOBBY is handled by
 * Stage.tsx). Reads authoritative state from usePitch; sends nothing (display
 * only). Pitch's world is the BLUEPRINT drafting table (patentlystupid refs):
 * a persistent LEFT RAIL carries the round's brief ("Problem:") on a cream
 * card, the audience count, and the room code — the main area is the show.
 * Player content lives on white ink-bordered napkin cards in marker ink;
 * system text rides tilted black banners; big titles are chunky outlined
 * white display caps. All motion is reduced-motion-aware.
 *
 * Pitch's signature transition: the PROMPT brief reveal keeps ONE wipe from
 * the original's Transition.tsx — the iris (clock-wipe) open — recreated as a
 * clip-path entrance inside the shell's phase container (it composes with the
 * shell's crossfade; clip-path is GPU-friendly).
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Pitch } from '../usePitch'
import type { GameState, InventionOption } from '../types'
import { roundMultiplier } from '../scoring'
import type { Mood } from '../../../shared/Host'
import { Avatar } from '../../../shared/Avatar'
import { Banner } from '../../../shared/Banner'
import { CodeBadge } from '../../../shared/CodeBadge'
import { ContentCard } from '../../../shared/ContentCard'
import { PlayerToken, NamePlate } from '../../../shared/PlayerToken'
import { ScoreRows } from '../../../shared/ScoreRows'
import { TimerBadge } from '../../../shared/TimerBadge'
import { VoterTags } from '../../../shared/VoterTags'
import { SCROLL_FADE } from '../../../shared/shells'
import { burst, cannons, springy, stampIn } from '../../../shared/motion'
import { sound } from '../../../shared/sound'

const INK = '#131313'

/** Chunky white display caps with an ink outline — the blueprint world's big
 *  title voice (the "INVENT SOMETHING" of patentlystupid-brief). Faked with
 *  layered text-shadows so it works on plain HTML text. */
const OUTLINE_SHADOW = [
  `-3px -3px 0 ${INK}`, `3px -3px 0 ${INK}`, `-3px 3px 0 ${INK}`, `3px 3px 0 ${INK}`,
  `-3px 0 0 ${INK}`, `3px 0 0 ${INK}`, `0 -3px 0 ${INK}`, `0 3px 0 ${INK}`,
  '6px 7px 0 rgba(0,0,0,0.55)',
].join(', ')

/** The mascot's reaction to the current phase (consumed by Stage.tsx). */
export function moodFor(game: Pitch): Mood {
  const s = game.state
  if (!s) return 'idle'
  switch (s.phase) {
    case 'INTRO':
      return 'excited'
    case 'PROMPT':
      return 'thinking'
    case 'WRITE':
      return 'thinking'
    case 'VOTE':
      return 'sly'
    case 'REVEAL':
      return 'laugh'
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

export function StageGame({ game }: { game: Pitch }) {
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

function Body({ game }: { game: Pitch }) {
  const s = game.state!

  switch (s.phase) {
    case 'INTRO': {
      const mult = roundMultiplier(s.roundIndex, s.config.totalRounds)
      const final = s.roundIndex === s.config.totalRounds - 1
      return (
        <Frame s={s}>
          <Banner tilt={-1.5} className="px-5 py-2 text-sm tracking-[0.2em]">
            {final ? 'THE FINALE' : `ROUND ${s.roundIndex + 1} OF ${s.config.totalRounds}`}
          </Banner>
          <OutlineTitle slam className="mt-5 text-7xl">
            {final ? 'Final Round' : `Round ${s.roundIndex + 1}`}
          </OutlineTitle>
          {mult > 1 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springy, delay: 0.15 }}
              className="mt-7 border-4 border-tangerine bg-[#131313] px-7 py-2 font-display text-3xl uppercase text-tangerine"
              style={{ rotate: '-3deg', boxShadow: '5px 5px 0 rgba(0,0,0,0.45)' }}
            >
              {mult}× points
            </motion.div>
          )}
          <Banner tilt={1} className="mt-8 px-6 py-2.5 text-lg font-normal">
            A new brief is coming. Get inventing.
          </Banner>
        </Frame>
      )
    }

    case 'PROMPT':
      // The brief-as-hero reveal — Pitch's signature iris-wipe moment, drawn
      // like a drafting-table instruction sheet (patentlystupid-brief).
      return (
        <Frame s={s}>
          <IrisIn>
            <div className="flex flex-col items-center text-center">
              <p
                className="font-marker text-2xl text-tangerine"
                style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.6)', rotate: '-2deg' }}
              >
                Round {s.roundIndex + 1}
              </p>
              <OutlineTitle className="mt-1 text-7xl">The Brief</OutlineTitle>
              {s.brief && (
                <NamePlate tilt={1.5} className="mt-4 px-3 py-1 text-xs tracking-[0.2em]">
                  {s.brief.tag}
                </NamePlate>
              )}
              <BriefSheet text={s.brief?.prompt ?? ''} />
              <Banner tilt={-1} className="mt-8 px-6 py-2.5 text-lg font-normal">
                Invent something brilliant…
              </Banner>
            </div>
          </IrisIn>
        </Frame>
      )

    case 'WRITE': {
      const inCount = s.order.filter((id) => s.inventions[id] !== undefined).length
      return (
        <Frame s={s} endsAt={s.phaseEndsAt}>
          <Banner tilt={-1.2} className="px-7 py-3 text-xl sm:text-2xl">
            ✏️ Draft your invention on your phone
          </Banner>
          <OutlineTitle className="mt-6 text-6xl tabular-nums">
            {inCount} / {s.order.length}
          </OutlineTitle>
          <Banner tilt={1} className="mt-2 px-4 py-1.5 text-xs tracking-[0.22em]">
            DRAFTS LOCKED IN
          </Banner>
          {/* Inventor status ring — tokens flip to HAPPY as drafts lock. */}
          <div className="mt-10 flex w-full max-w-4xl flex-wrap items-start justify-center gap-x-8 gap-y-5">
            {game.players.map((p) => {
              const done = s.inventions[p.userId] !== undefined
              return (
                <motion.div
                  key={p.userId}
                  layout
                  animate={{ scale: done ? [1, 1.12, 1] : 1, opacity: done ? 1 : 0.7 }}
                >
                  <PlayerToken name={p.name} color={p.color} seat={p.joinedOrder} mood={done ? 'happy' : 'idle'} size="md" />
                </motion.div>
              )
            })}
          </div>
        </Frame>
      )
    }

    case 'VOTE': {
      const votedCount = s.order.filter((id) => s.votes[id] !== undefined).length
      return (
        <Frame s={s} endsAt={s.phaseEndsAt}>
          {/* The tangerine VOTE NOW! strip (patentlystupid-vote's headline). */}
          <div
            className="border-[3px] border-[#131313] bg-tangerine px-8 py-2.5 font-display text-4xl uppercase text-[#131313]"
            style={{ rotate: '-1.5deg', boxShadow: '5px 5px 0 rgba(0,0,0,0.45)' }}
          >
            Vote now!
          </div>
          <p className="mt-3 font-marker text-lg text-[#FFFDF5]" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.65)' }}>
            Which would you actually buy? Vote on your phone.
          </p>
          {/* Inventions pinned to the blueprint board — napkins, authors hidden. */}
          <div className="mt-9 grid w-full max-w-4xl grid-cols-2 gap-x-12 gap-y-10 px-2">
            {s.options.map((o, i) => (
              <Napkin key={o.id} option={o} index={i} />
            ))}
          </div>
          <Banner tilt={1} className="mt-9 px-4 py-1.5 text-sm font-normal tabular-nums">
            {votedCount} / {s.order.length} votes in
          </Banner>
        </Frame>
      )
    }

    case 'REVEAL':
      return <Reveal s={s} />

    case 'SCORE': {
      const rows = s.order
        .map((id) => s.players[id])
        .filter(Boolean)
        .map((p) => ({
          id: p.userId,
          name: p.name,
          color: p.color,
          score: p.score,
          answer: s.options.find((o) => o.userId === p.userId)?.name,
          delta: s.result?.deltas[p.userId] ?? 0,
        }))
      return (
        <Frame s={s} endsAt={s.phaseEndsAt}>
          <OutlineTitle className="shrink-0 text-5xl">Scores</OutlineTitle>
          {/* 8 rows with invention pills is the tallest case — scroll INSIDE
              this bounded column (soft fade); the page stays h-dvh. */}
          <div className="mt-5 min-h-0 w-full max-w-3xl overflow-y-auto px-1 py-1" style={SCROLL_FADE}>
            <ScoreRows rows={rows} />
          </div>
        </Frame>
      )
    }

    case 'PODIUM':
      return <Podium game={game} />

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Reveal — staged napkin reveals: voters pile on, author unmasked, FUNDED! last
// ---------------------------------------------------------------------------

function Reveal({ s }: { s: GameState }) {
  const result = s.result
  const reduce = useReducedMotion()
  const nameFor = (id: string) => s.players[id]?.name ?? '?'

  // Order: inventions by ascending votes, the round winner floated to the very
  // end — building to the "FUNDED!" moment (the original Pitch's pacing).
  const winnerId = result?.roundWinnerUserId ?? null
  const ordered: InventionOption[] = [...s.options].sort(
    (a, b) => (result?.votesByOption[a.id]?.length ?? 0) - (result?.votesByOption[b.id]?.length ?? 0),
  )
  if (winnerId) {
    const wi = ordered.findIndex((o) => o.userId === winnerId)
    if (wi >= 0) ordered.push(ordered.splice(wi, 1)[0])
  }

  // Reveal one card at a time (reduced motion: all at once).
  const [shown, setShown] = useState(reduce ? ordered.length : 1)
  useEffect(() => {
    if (shown >= ordered.length) return
    const id = setTimeout(() => setShown((n) => n + 1), 1400)
    return () => clearTimeout(id)
  }, [shown, ordered.length])
  // Sound the card that just appeared — a sting + confetti for the round winner.
  useEffect(() => {
    const row = ordered[shown - 1]
    if (!row) return
    if (winnerId && row.userId === winnerId) {
      sound.ding()
      burst(['#FF8A3D', '#9D5CFF', '#FFD23F'])
    } else {
      sound.pop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  return (
    <Frame s={s} endsAt={s.phaseEndsAt}>
      <Banner tilt={-1.2} className="shrink-0 px-6 py-2 text-lg tracking-[0.14em]">
        THE VOTES ARE IN
      </Banner>
      {/* The invention reveal stack (up to 8 cards, dealt one at a time) is the
          only genuinely-unbounded zone — it scrolls INSIDE this bounded frame
          as a last resort; the page root stays h-dvh/overflow-hidden. */}
      <div className="mt-4 min-h-0 w-full max-w-2xl flex-1 space-y-6 overflow-y-auto px-2 pb-2">
        {s.options.length === 0 && (
          <Banner tilt={1} className="mx-auto w-max px-6 py-3 text-lg font-normal">
            Nobody pitched. The market stays empty.
          </Banner>
        )}
        <AnimatePresence>
          {ordered.slice(0, shown).map((o) => {
            const voters = result?.votesByOption[o.id] ?? []
            const isWinner = winnerId !== null && o.userId === winnerId
            const tags = voters
              .map((v) => s.players[v])
              .filter(Boolean)
              .map((p) => ({ name: p.name, color: p.color, seat: p.joinedOrder }))
            return (
              <motion.div
                key={o.id}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: isWinner ? 0.55 : 0.85, y: 18 }}
                animate={{ opacity: 1, scale: isWinner ? 1.03 : 1, y: 0 }}
                transition={springy}
                className="relative"
              >
                <ContentCard tilt={isWinner ? 0 : voters.length % 2 === 0 ? -1.2 : 1.2} className="px-6 pb-6 pt-4 text-left">
                  <p className="font-display text-2xl uppercase leading-tight text-[#131313]">{o.name}</p>
                  <p className="mt-1 text-lg leading-snug">{o.pitch}</p>
                </ContentCard>
                {/* Everyone who voted for it piles onto the top edge. */}
                <VoterTags voters={tags} />
                {voters.length === 0 && (
                  <span className="absolute -bottom-3 left-5 bg-[#131313] px-2 py-0.5 font-body text-xs font-bold uppercase text-[#FFFDF5]/85" style={{ rotate: '-2deg' }}>
                    no votes
                  </span>
                )}
                {/* The author, unmasked. */}
                <NamePlate tilt={2} className="absolute -bottom-3.5 right-5 max-w-[55%] px-2.5 py-0.5 text-xs">
                  by {nameFor(o.userId)}
                </NamePlate>
                {isWinner && <FundedStamp />}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Frame>
  )
}

/** The round-winner stamp — tangerine FUNDED! slams onto the napkin. */
function FundedStamp() {
  const reduce = useReducedMotion()
  useEffect(() => {
    sound.stamp()
  }, [])
  return (
    <motion.span
      variants={reduce ? undefined : stampIn}
      initial={reduce ? { opacity: 0 } : 'hidden'}
      animate={reduce ? { opacity: 1 } : 'show'}
      className="pointer-events-none absolute -right-4 -top-5 z-20 border-4 border-[#131313] bg-tangerine px-4 py-1 font-display text-2xl uppercase text-[#131313]"
      style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.45)' }}
    >
      Funded!
    </motion.span>
  )
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function Podium({ game }: { game: Pitch }) {
  const s = game.state!
  const standings = s.summary?.standings ?? []
  const winner = standings[0]
  const winnerSeat = winner ? (s.players[winner.userId]?.joinedOrder ?? 0) : 0
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!reduce) cannons(['#FF8A3D', '#9D5CFF', '#FFD23F'])
  }, [reduce])
  const rows = standings.map((p) => ({ id: p.userId, name: p.name, color: p.color, score: p.score }))
  return (
    <Frame s={s} scroll>
      <Banner tilt={-1.2} className="px-5 py-1.5 text-sm tracking-[0.2em]">
        THAT'S THE SHOW
      </Banner>
      {winner && (
        // Compact winner row — avatar beside the name — so all 8 standings fit
        // the 16:9 frame without the podium scrolling.
        <motion.div
          initial={reduce ? { opacity: 0 } : { y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={springy}
          className="mt-1 flex items-center gap-4"
        >
          <Avatar seat={winnerSeat} color={winner.color} mood="celebrate" size={64} />
          <div className="text-left">
            <OutlineTitle slam className="text-3xl">
              {winner.name}
            </OutlineTitle>
            <Banner tilt={1} className="mt-1 inline-block px-4 py-1 text-sm font-normal">
              wins with {winner.score} points
            </Banner>
          </div>
        </motion.div>
      )}
      {/* Standings + the winning-invention napkin side by side — keeps the
          whole podium on screen at 16:9 (napkin drops below on narrow). */}
      <div className={`mt-3 grid w-full items-center gap-x-10 gap-y-4 pb-2 ${s.summary?.topInvention ? 'max-w-4xl lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]' : 'max-w-xl'}`}>
        <ScoreRows rows={rows} />
        {s.summary?.topInvention && (
          <div className="relative">
            <NamePlate tilt={-1.5} className="absolute -top-3.5 left-1/2 z-10 w-max max-w-[90%] -translate-x-1/2 px-3 py-1 text-xs tracking-[0.18em]">
              INVENTION OF THE NIGHT
            </NamePlate>
            <ContentCard tilt={1.2} className="px-6 pb-4 pt-6 text-center">
              <p className="font-display text-2xl uppercase leading-tight text-[#131313]">{s.summary.topInvention.name}</p>
              <p className="mt-1 text-lg leading-snug">{s.summary.topInvention.pitch}</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-[#131313]" style={{ backgroundColor: s.summary.topInvention.byColor }} />
                by {s.summary.topInvention.byName} · {s.summary.topInvention.votes} {s.summary.topInvention.votes === 1 ? 'vote' : 'votes'}
              </p>
            </ContentCard>
          </div>
        )}
      </div>
    </Frame>
  )
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * Frame — the drafting-table layout every in-game phase sits in: the
 * persistent left rail (brief / audience / room code) + the main board.
 * `scroll` lets tall phases (PODIUM) scroll instead of clipping.
 */
function Frame({
  s,
  endsAt = null,
  scroll = false,
  children,
}: {
  s: GameState
  endsAt?: number | null
  scroll?: boolean
  children: React.ReactNode
}) {
  // No timer (PODIUM) → drop the header band entirely so its 3.5rem isn't
  // wasted height in the no-scroll budget.
  const showHeader = endsAt !== null
  return (
    <div className="flex h-full min-h-0 items-stretch">
      <Rail s={s} />
      <div className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col px-8 pb-5 ${scroll ? 'overflow-y-auto pt-4' : 'overflow-hidden'}`}>
        {/* Timer sits clear of the fixed mute control (top-right). */}
        {showHeader && (
          <header className="flex min-h-[3.5rem] shrink-0 items-start justify-end pr-14 pt-2.5">
            <TimerBadge endsAt={endsAt} size={58} />
          </header>
        )}
        <div className={`flex min-h-0 flex-1 flex-col items-center text-center ${scroll ? 'justify-start' : 'justify-center'}`}>
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The blueprint rail (patentlystupid-presentation's left column): the round's
 * PROBLEM on a small cream card, round/multiplier, then audience count and the
 * room code pinned at the bottom.
 */
function Rail({ s }: { s: GameState }) {
  const audience = Object.values(s.players).filter((p) => p.role === 'spectator').length
  const mult = roundMultiplier(Math.min(s.roundIndex, s.config.totalRounds - 1), s.config.totalRounds)
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r-2 border-white/15 px-4 pb-5 pt-14">
      <div>
        <p className="font-display text-base uppercase tracking-[0.14em] text-tangerine" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.55)' }}>
          Problem:
        </p>
        {s.brief ? (
          <ContentCard tilt={-1.5} className="mt-2 px-3.5 py-3 text-base leading-snug" style={{ borderWidth: 3 }}>
            {s.brief.prompt}
          </ContentCard>
        ) : (
          <Banner tilt={-1} className="mt-2 px-3 py-2 text-xs font-normal normal-case">
            Brief incoming…
          </Banner>
        )}
      </div>
      <Banner tilt={1} className="w-max px-3 py-1.5 text-xs tracking-[0.14em]">
        ROUND {Math.min(s.roundIndex + 1, s.config.totalRounds)}/{s.config.totalRounds} · {mult}×
      </Banner>
      <div className="mt-auto flex flex-col items-start gap-3">
        <div className="bg-[#131313] px-3.5 py-2 text-center" style={{ rotate: '-1deg', boxShadow: '3px 3px 0 rgba(0,0,0,0.4)' }}>
          <p className="font-body text-[10px] font-bold uppercase tracking-[0.25em] text-[#FFFDF5]/85">Audience</p>
          <p className="font-display text-2xl leading-none text-[#FFFDF5]">{audience}</p>
        </div>
        <CodeBadge code={s.roomCode} />
      </div>
    </aside>
  )
}

/** Chunky outlined display title (white fill, ink outline, hard drop). */
function OutlineTitle({ children, slam, className = '' }: { children: React.ReactNode; slam?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.h1
      initial={slam && !reduce ? { scale: 1.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={springy}
      className={`font-display uppercase leading-none text-[#FFFDF5] ${className}`}
      style={{ textShadow: OUTLINE_SHADOW }}
    >
      {children}
    </motion.h1>
  )
}

/** Pitch's signature transition — the iris (clock-wipe) open from the
 *  original's Transition.tsx, as a clip-path entrance. Reduced motion: fade. */
function IrisIn({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { clipPath: 'circle(0% at 50% 50%)' }}
      animate={reduce ? { opacity: 1 } : { clipPath: 'circle(150% at 50% 50%)' }}
      transition={reduce ? { duration: 0.18 } : { duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** The brief on its instruction sheet — cream card, marker ink, drafting
 *  corner ticks + a dashed underline (the annotation flavor of the ref). */
function BriefSheet({ text }: { text: string }) {
  const tick = 'absolute h-4 w-4 border-[#131313]/60'
  return (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="mt-6 w-full max-w-3xl"
    >
      <ContentCard tilt={-1} className="relative px-12 py-9">
        <span aria-hidden className={`${tick} left-2.5 top-2.5 border-l-2 border-t-2`} />
        <span aria-hidden className={`${tick} right-2.5 top-2.5 border-r-2 border-t-2`} />
        <span aria-hidden className={`${tick} bottom-2.5 left-2.5 border-b-2 border-l-2`} />
        <span aria-hidden className={`${tick} bottom-2.5 right-2.5 border-b-2 border-r-2`} />
        <p className="text-3xl leading-snug sm:text-4xl">{text}</p>
        <div aria-hidden className="mx-auto mt-5 w-2/3 border-b-2 border-dashed border-[#131313]/35" />
      </ContentCard>
    </motion.div>
  )
}

/** One invention pinned to the VOTE board: a black plate carries the NAME in
 *  display caps, the one-line pitch sits in marker on the napkin. Authors stay
 *  hidden until the reveal. Alternating tilt keeps the grid loose. */
function Napkin({ option, index }: { option: InventionOption; index: number }) {
  const reduce = useReducedMotion()
  const even = index % 2 === 0
  return (
    <motion.div
      data-testid="stage-option"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.92, rotate: even ? -4 : 4 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ ...springy, delay: reduce ? 0 : index * 0.09 }}
      className={`relative ${even ? '' : 'translate-y-3'}`}
    >
      <NamePlate tilt={even ? -2 : 2} className="absolute -top-3.5 left-4 z-10 w-max max-w-[85%] px-3 py-1 text-base">
        {option.name}
      </NamePlate>
      <ContentCard tilt={even ? -1.6 : 1.4} className="px-6 pb-5 pt-7 text-left">
        <p className="text-xl leading-snug">{option.pitch}</p>
      </ContentCard>
    </motion.div>
  )
}
