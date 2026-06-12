/**
 * StageGame — the TV view for every in-game Wisecrack phase (LOBBY is handled
 * by Stage.tsx). Reads authoritative state from useWisecrack; sends nothing
 * (display only). The indigo-burst world skin: prompts as big outlined display
 * type straight on the burst, player content on tilted white ContentCards,
 * system lines on black Banners, reveals as physical voter-tag pile-ons.
 * The phase crossfade + mascot + mute chrome live in the shared StageShell.
 */
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Wisecrack } from '../useWisecrack'
import { roundMultiplier, type GameState, type Matchup, type MatchupResult, type PlayerState } from '../types'
import type { Mood } from '../../../shared/Host'
import { Avatar } from '../../../shared/Avatar'
import { PlayerToken, NamePlate } from '../../../shared/PlayerToken'
import { ContentCard } from '../../../shared/ContentCard'
import { Banner } from '../../../shared/Banner'
import { ScoreRows, type ScoreRowData } from '../../../shared/ScoreRows'
import { TimerBadge } from '../../../shared/TimerBadge'
import { VoterTags, type VoterTag } from '../../../shared/VoterTags'
import { SCROLL_FADE } from '../../../shared/shells'
import { springy, cannons } from '../../../shared/motion'
import { sound } from '../../../shared/sound'
import { CountBadge, DisplayText, OrBadge, Slam, StampBadge, seatOf, useAfter, GOLD, LIME, SIREN } from './bits'

/** The mascot's reaction to the current phase (consumed by Stage.tsx). */
export function moodFor(game: Wisecrack): Mood {
  const s = game.state
  if (!s) return 'idle'
  switch (s.phase) {
    case 'INTRO':
    case 'FINAL_INTRO':
      return 'excited'
    case 'WRITE':
    case 'FINAL_WRITE':
      return 'thinking'
    case 'VOTE':
    case 'FINAL_VOTE':
      return 'sly'
    case 'REVEAL':
      return s.results[s.voteIndex]?.jinx ? 'shock' : 'laugh'
    case 'FINAL_REVEAL':
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

export function StageGame({ game }: { game: Wisecrack }) {
  const s = game.state
  // Sound: phase-change cues on the shared screen (Stage only). Reveal gets a
  // drum-roll, podium a fanfare; everything else a soft whoosh.
  const lastPhase = useRef<string>('')
  useEffect(() => {
    if (!s) return
    if (lastPhase.current && lastPhase.current !== s.phase) {
      if (s.phase === 'REVEAL' || s.phase === 'FINAL_REVEAL') sound.drumroll()
      else if (s.phase === 'PODIUM') sound.fanfare()
      else sound.whoosh()
    }
    lastPhase.current = s.phase
  }, [s?.phase])
  useTimerSfx(s?.phaseEndsAt ?? null)
  if (!s) return null
  return <Body game={game} />
}

function Body({ game }: { game: Wisecrack }) {
  const s = game.state!

  switch (s.phase) {
    case 'INTRO':
      return (
        <IntroCard
          eyebrow={`Round ${s.roundIndex + 1} of ${s.config.totalRounds}`}
          title={`Round ${s.roundIndex + 1}`}
          stamp={`${roundMultiplier(s.roundIndex)}× points`}
          stampColor={GOLD}
          line="Write your funniest answer on your phone."
        />
      )

    case 'FINAL_INTRO':
      return (
        <IntroCard
          eyebrow="The Finale"
          title="Last Lash"
          stamp="Triple points"
          stampColor={LIME}
          line={`One prompt. Everyone answers. ${s.config.finalVotes} votes each.`}
        />
      )

    case 'WRITE':
    case 'FINAL_WRITE':
      return <WriteStage game={game} />

    case 'VOTE': {
      const m = game.currentMatchup
      if (!m) return null
      return (
        <Shell endsAt={s.phaseEndsAt} corner={`Matchup ${s.voteIndex + 1} of ${s.matchups.length}`}>
          <DisplayText className="mx-auto max-w-4xl shrink-0 text-3xl sm:text-4xl lg:text-5xl">{m.promptText}</DisplayText>
          <div className="relative mt-8 flex w-full max-w-5xl shrink-0 items-center justify-center">
            <Slam dir="left" className="z-0 min-w-0 flex-1">
              <VoteCard text={m.answers[m.authorIds[0]] ?? ''} tilt={-3.5} />
            </Slam>
            <OrBadge className="z-10 -mx-6" />
            <Slam dir="right" className="z-0 min-w-0 flex-1">
              <VoteCard text={m.answers[m.authorIds[1]] ?? ''} tilt={3.5} />
            </Slam>
          </div>
          <Banner tilt={-1} className="mt-8 shrink-0 text-xl sm:text-2xl">
            Pick your favorite on your phone now!
          </Banner>
        </Shell>
      )
    }

    case 'REVEAL': {
      const res = s.results[s.voteIndex]
      const m = game.currentMatchup
      if (!res || !m) return null
      return <RevealStage state={s} result={res} matchup={m} />
    }

    case 'SCORE':
      return (
        <Shell endsAt={s.phaseEndsAt}>
          <Banner tilt={-1.5} className="mb-8 px-10 text-4xl uppercase">Scores</Banner>
          <ScoreRows rows={scoreRowsFor(s)} className="max-w-3xl" />
        </Shell>
      )

    case 'FINAL_VOTE': {
      const m = s.matchups[0]
      if (!m) return null
      return (
        <Shell endsAt={s.phaseEndsAt} corner="Last Lash">
          <DisplayText className="mx-auto max-w-4xl shrink-0 text-2xl sm:text-3xl">{m.promptText}</DisplayText>
          {/* Up to 8 answers in the final — the grid scrolls INSIDE this bounded
              column (soft fade) as a last resort; the page root stays h-dvh. */}
          <div className="mt-5 grid min-h-0 w-full max-w-5xl grid-cols-1 gap-4 overflow-y-auto px-1 py-1 sm:grid-cols-2" style={SCROLL_FADE}>
            {m.authorIds.map((a, i) => (
              <Slam key={a} dir={i % 2 ? 'right' : 'left'}>
                <ContentCard tilt={i % 2 ? 1.8 : -1.8} className="grid min-h-[5rem] place-items-center px-6 py-4">
                  <p className="text-xl leading-snug sm:text-2xl">{m.answers[a] ?? ''}</p>
                </ContentCard>
              </Slam>
            ))}
          </div>
          <Banner tilt={1} className="mt-5 shrink-0 text-lg sm:text-xl">
            Spend your {s.config.finalVotes} votes on your phone!
          </Banner>
        </Shell>
      )
    }

    case 'FINAL_REVEAL': {
      const res = s.results[0]
      if (!res) return null
      return <FinalRevealStage state={s} result={res} />
    }

    case 'PODIUM':
      return <Podium game={game} />

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Phase bodies
// ---------------------------------------------------------------------------

/** Round / finale title card — a big tilted banner with a stamped multiplier. */
function IntroCard({ eyebrow, title, stamp, stampColor, line }: { eyebrow: string; title: string; stamp: string; stampColor: string; line: string }) {
  const showStamp = useAfter(550)
  const showLine = useAfter(1100)
  return (
    <Center>
      <DisplayText className="text-lg tracking-[0.3em] sm:text-xl">{eyebrow}</DisplayText>
      <motion.div initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springy} className="mt-4">
        <Banner tilt={-2} className="px-12 py-5 text-6xl uppercase sm:text-7xl">{title}</Banner>
      </motion.div>
      <div className="mt-8 h-16">
        {showStamp && <StampBadge text={stamp} color={stampColor} className="text-3xl" />}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: showLine ? 1 : 0 }}>
        <DisplayText className="mt-4 text-2xl">{line}</DisplayText>
      </motion.div>
    </Center>
  )
}

/** WRITE / FINAL_WRITE — the prompt (or call-to-write) huge on the burst, an
 *  "answer on your phones" banner, and a token row flipping happy per lock-in. */
function WriteStage({ game }: { game: Wisecrack }) {
  const s = game.state!
  const isFinal = s.phase === 'FINAL_WRITE'
  const needed = s.matchups.reduce((n, m) => n + m.authorIds.length, 0)
  const inCount = s.matchups.reduce((n, m) => n + m.authorIds.filter((a) => m.answers[a] && !m.safety[a]).length, 0)
  return (
    <Shell endsAt={s.phaseEndsAt} corner={isFinal ? 'Last Lash' : `Round ${s.roundIndex + 1}`}>
      {isFinal && s.matchups[0] ? (
        <DisplayText className="mx-auto max-w-4xl text-4xl sm:text-5xl lg:text-6xl">{s.matchups[0].promptText}</DisplayText>
      ) : (
        <DisplayText className="mx-auto max-w-4xl text-4xl sm:text-5xl lg:text-6xl">Write your funniest answers</DisplayText>
      )}
      <Banner tilt={-1.2} className="mt-10 text-xl sm:text-2xl">
        Answer on your phones · <span className="text-[#FFD23F] tabular-nums">{inCount} / {needed}</span> in
      </Banner>
      <div className="mt-12 flex w-full max-w-5xl flex-wrap items-start justify-center gap-x-7 gap-y-4">
        {game.players.map((p) => {
          const done = s.matchups
            .filter((m) => m.authorIds.includes(p.userId))
            .every((m) => m.answers[p.userId] && !m.safety[p.userId])
          return (
            <motion.div key={p.userId} layout animate={{ scale: done ? [1, 1.12, 1] : 1, opacity: done ? 1 : 0.65 }}>
              <PlayerToken name={p.name} color={p.color} seat={seatOf(s, p.userId)} mood={done ? 'happy' : 'idle'} size="md" />
            </motion.div>
          )
        })}
      </div>
    </Shell>
  )
}

/** Reveal beats (ms after mount): card A slams, card B slams, tallies + voter
 *  tags pile on, then the verdict (winner pulse / QUIPLASH stamp / JINX). */
const REVEAL_CARD_A = 200
const REVEAL_CARD_B = 1000
const REVEAL_TALLY = 1900

function verdictDelay(maxTags: number): number {
  // After the last tag lands, capped so the verdict beats the phase clock.
  return REVEAL_TALLY + Math.min(maxTags * 650 + 400, 2600)
}

function RevealStage({ state, result, matchup }: { state: GameState; result: MatchupResult; matchup: Matchup }) {
  const [a, b] = matchup.authorIds
  const votersA = votersFor(state, matchup, a)
  const votersB = votersFor(state, matchup, b)
  const showTally = useAfter(REVEAL_TALLY)
  const verdictAt = verdictDelay(Math.max(votersA.length, votersB.length))
  const showVerdict = useAfter(verdictAt)

  return (
    <Shell endsAt={state.phaseEndsAt} corner={`Matchup ${state.voteIndex + 1} of ${state.matchups.length}`}>
      <DisplayText className="mx-auto max-w-4xl text-2xl sm:text-3xl">{result.promptText}</DisplayText>
      {/* Verdict strip — fixed height so the cards don't jump when it lands. */}
      <div className="mt-4 flex h-16 items-center justify-center">
        {showVerdict && result.jinx && <VerdictStamp text="JINX! Nobody scores" color={SIREN} />}
        {showVerdict && result.quiplashAuthorId && <QuiplashMoment />}
      </div>
      <div className="mt-10 grid w-full max-w-5xl grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-2">
        <RevealCard
          state={state}
          result={result}
          authorId={a}
          voters={showTally ? votersA : []}
          tilt={-2.5}
          dir="left"
          delayMs={REVEAL_CARD_A}
          showTally={showTally}
          showVerdict={showVerdict}
        />
        <RevealCard
          state={state}
          result={result}
          authorId={b}
          voters={showTally ? votersB : []}
          tilt={2.5}
          dir="right"
          delayMs={REVEAL_CARD_B}
          showTally={showTally}
          showVerdict={showVerdict}
        />
      </div>
    </Shell>
  )
}

/** One reveal card: white answer card, author plate, vote tally, tag pile-on. */
function RevealCard({
  state,
  result,
  authorId,
  voters,
  tilt,
  dir,
  delayMs,
  showTally,
  showVerdict,
}: {
  state: GameState
  result: MatchupResult
  authorId: string
  voters: VoterTag[]
  tilt: number
  dir: 'left' | 'right'
  delayMs: number
  showTally: boolean
  showVerdict: boolean
}) {
  const reduce = useReducedMotion()
  const author: PlayerState | undefined = state.players[authorId]
  const winner = result.winnerId === authorId
  const shown = useAfter(reduce ? 0 : delayMs)
  useEffect(() => {
    if (shown) sound.pop()
  }, [shown])
  useEffect(() => {
    if (showVerdict && winner && !result.quiplashAuthorId) sound.ding()
  }, [showVerdict, winner, result.quiplashAuthorId])
  if (!shown) return <div className="min-h-[10rem]" />
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.94, rotate: dir === 'left' ? -6 : 6 }}
      animate={{
        opacity: 1,
        y: 0,
        rotate: 0,
        scale: showVerdict && winner && !reduce ? [1, 1.06, 1.03] : 1,
      }}
      transition={springy}
      className="relative"
    >
      <ContentCard tilt={tilt} className="flex min-h-[10rem] flex-col items-center justify-center px-7 py-8 text-center">
        <p className="text-3xl leading-snug sm:text-4xl">{result.answers[authorId] ?? ''}</p>
        <NamePlate tilt={tilt > 0 ? 2 : -2} className="mt-4 px-3 py-1 text-sm">
          {author?.name ?? '?'}
        </NamePlate>
      </ContentCard>
      {/* Voter tags pile along the card's top edge (the physical reveal). */}
      <VoterTags voters={voters} />
      {showTally && (
        <CountBadge
          n={Math.round(result.voteCounts[authorId] ?? 0)}
          className={`absolute -bottom-5 ${dir === 'left' ? '-left-4' : '-right-4'}`}
        />
      )}
    </motion.div>
  )
}

/** The clean-sweep moment: lime QUIPLASH stamp + cannons (stamp SFX is in the badge). */
function QuiplashMoment() {
  useEffect(() => {
    cannons([LIME, GOLD])
  }, [])
  return <VerdictStamp text="QUIPLASH!" color={LIME} />
}

function VerdictStamp({ text, color }: { text: string; color: string }) {
  return <StampBadge text={text} color={color} className="text-3xl sm:text-4xl" />
}

/** FINAL_REVEAL — Thriplash-style ranked answer cards, dealt top votes first. */
function FinalRevealStage({ state, result }: { state: GameState; result: MatchupResult }) {
  const reduce = useReducedMotion()
  const ranked = [...result.authorIds].sort((x, y) => (result.voteCounts[y] ?? 0) - (result.voteCounts[x] ?? 0))
  const winnerShownAt = reduce ? 0 : 600 + ranked.length * 550
  const showCrown = useAfter(winnerShownAt)
  useEffect(() => {
    if (showCrown && result.winnerId) {
      cannons([LIME, GOLD])
      sound.ding()
    }
  }, [showCrown, result.winnerId])
  return (
    <Shell endsAt={state.phaseEndsAt} corner="Last Lash">
      <DisplayText className="mx-auto max-w-4xl shrink-0 text-2xl sm:text-3xl">{result.promptText}</DisplayText>
      {/* The ranked card stack (up to 8 in the final) scrolls INSIDE this
          bounded column as a last resort; the page root stays h-dvh. */}
      <div className="mt-5 grid min-h-0 w-full max-w-3xl gap-3 overflow-y-auto px-1 py-1" style={SCROLL_FADE}>
        {ranked.map((authorId, i) => {
          const author = state.players[authorId]
          const winner = result.winnerId === authorId
          return (
            <motion.div
              key={authorId}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: winner && showCrown && !reduce ? 1.03 : 1 }}
              transition={{ ...springy, delay: reduce ? 0 : 0.5 + i * 0.55 }}
              className="relative"
            >
              <ContentCard
                tilt={i % 2 ? 1.2 : -1.2}
                selected={winner && showCrown}
                accent={LIME}
                className="flex items-center gap-5 px-6 py-3 text-left"
              >
                <p className="min-w-0 flex-1 text-xl leading-snug">{result.answers[authorId] ?? ''}</p>
                <NamePlate tilt={i % 2 ? 1.5 : -1.5} className="shrink-0 px-2.5 py-0.5 text-xs">
                  {author?.name ?? '?'}
                </NamePlate>
              </ContentCard>
              <CountBadge n={Math.round(result.voteCounts[authorId] ?? 0)} className="absolute -right-4 -top-4 h-12 w-12" />
            </motion.div>
          )
        })}
      </div>
    </Shell>
  )
}

function Podium({ game }: { game: Wisecrack }) {
  const s = game.state!
  const standings = s.summary?.standings ?? []
  const winner = standings[0]
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!reduce) cannons()
  }, [reduce])
  return (
    // Height-budgeted: a compact winner row + a standings/highlight 2-up grid
    // fits 1280×720; an internal scroller is the last-resort safety valve (the
    // PAGE root is h-dvh + overflow-hidden, so this never grows the page).
    <div data-testid="stage-podium" className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-y-auto px-8 py-5 text-center">
      {winner && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={springy}
          className="flex shrink-0 items-center gap-4"
        >
          <Avatar seat={seatOf(s, winner.userId)} color={winner.color} mood="celebrate" size={88} />
          <div className="text-left">
            <Banner tilt={-1.5} className="px-8 py-2.5 text-3xl uppercase">
              <span style={{ color: GOLD }}>{winner.name} wins!</span>
            </Banner>
            <DisplayText className="mt-1.5 text-base">{winner.score.toLocaleString()} points · that's the show</DisplayText>
          </div>
        </motion.div>
      )}
      <div className={`grid w-full items-center gap-x-10 gap-y-4 ${s.summary?.topMatchup ? 'max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]' : 'max-w-xl'}`}>
        <ScoreRows rows={standings.map((p) => ({ id: p.userId, name: p.name, color: p.color, score: p.score }))} />
        {s.summary?.topMatchup && (
          <ContentCard tilt={-1} className="px-6 py-4 text-left">
            <p className="font-body text-xs font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/70">Bit of the night</p>
            <p className="mt-1 line-clamp-2 text-base leading-snug">{s.summary.topMatchup.promptText}</p>
            <div className="mt-2.5 grid gap-2.5">
              {s.summary.topMatchup.answers.slice(0, 2).map((ans, i) => (
                <div key={i} className="rounded-lg border-[3px] border-[#131313] px-3 py-2" style={{ backgroundColor: `${ans.color}26` }}>
                  <p className="line-clamp-2 text-base leading-snug">{ans.text}</p>
                  <p className="font-body text-xs font-bold uppercase" style={{ color: '#1A1A1A' }}>
                    {ans.name} · {Math.round(ans.votes)} votes
                  </p>
                </div>
              ))}
            </div>
          </ContentCard>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col items-center justify-center px-8 py-5 text-center">{children}</div>
}

/** Phase frame: an optional corner label (ink plate, top-left past the Leave
 *  control) + the TimerBadge diamond (top-right, inset past code pill + mute). */
function Shell({ children, endsAt, corner }: { children: React.ReactNode; endsAt: number | null; corner?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-5">
      <header className="flex min-h-[4rem] shrink-0 items-center justify-between pl-24 pr-44">
        <div>{corner && <NamePlate tilt={-2} className="px-3.5 py-1.5 text-base">{corner}</NamePlate>}</div>
        <TimerBadge endsAt={endsAt} size={72} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden text-center">{children}</div>
    </div>
  )
}

/** One huge dueling answer card (quiplash2-vote): white paper, marker ink. */
function VoteCard({ text, tilt }: { text: string; tilt: number }) {
  return (
    <ContentCard tilt={tilt} className="grid min-h-[11rem] place-items-center px-8 py-8">
      <p className="text-3xl leading-snug sm:text-4xl">{text}</p>
    </ContentCard>
  )
}

/** Everyone who voted for `authorId`, as VoterTags (spectators included). */
function votersFor(s: GameState, m: Matchup, authorId: string): VoterTag[] {
  return Object.entries(m.votes)
    .filter(([, picks]) => picks.includes(authorId))
    .map(([voterId]) => {
      const p = s.players[voterId]
      return { name: p?.name ?? 'Audience', color: p?.color ?? '#b8a6c9', seat: seatOf(s, voterId) }
    })
}

function scoreRowsFor(s: GameState): ScoreRowData[] {
  return s.order
    .map((id) => s.players[id])
    .filter(Boolean)
    .map((p) => ({
      id: p.userId,
      name: p.name,
      color: p.color,
      score: p.score,
      delta: s.lastRoundDeltas[p.userId] ?? 0,
    }))
}
