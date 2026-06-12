/**
 * ControllerGame — the phone view for every in-game phase, set in the dimmed
 * indigo-burst world. Phone-width (never edge-to-edge on desktop), prompt on
 * an ink banner, player writing on white marker ContentCards, ballots as
 * white card buttons (lime ring when picked), tactile juice (haptic on
 * submit/vote). Self-contained so online players need no TV. Server
 * validates actions.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Wisecrack } from '../useWisecrack'
import { MAX_ANSWER_LEN, type Matchup } from '../types'
import { ContentCard } from '../../../shared/ContentCard'
import { Banner } from '../../../shared/Banner'
import { ScoreRows, type ScoreRowData } from '../../../shared/ScoreRows'
import { useCountdown } from '../../../shared/Timer'
import { NeonButton } from '../../../shared/primitives'
import { phaseCrossfade, promptReveal, dealContainer, dealCard, haptic, burst } from '../../../shared/motion'
import { DisplayText, StampBadge, LIME, SIREN } from './bits'

/** Phase wrapper — phone-width column + cross-fade between phases. */
export function ControllerGame({ game }: { game: Wisecrack }) {
  const phase = game.state?.phase
  if (!phase || !game.myId) return null
  return (
    <div className="flex w-full flex-1 flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          variants={phaseCrossfade(false)}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex flex-1 flex-col"
        >
          <ControllerBody game={game} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function ControllerBody({ game }: { game: Wisecrack }) {
  const s = game.state
  const myId = game.myId
  // recapId is DO-managed and lives on the hub spine (top-level), set the
  // moment the recap row persists at PODIUM.
  const recapId = s?.recapId ?? null
  if (!s || !myId) return null

  switch (s.phase) {
    case 'INTRO':
      return (
        <Msg eyebrow={`Round ${s.roundIndex + 1}`} title="Get ready">
          You'll write {game.myMatchups.length || s.config.promptsPerPlayer} answer
          {(game.myMatchups.length || s.config.promptsPerPlayer) === 1 ? '' : 's'}. Make 'em laugh.
        </Msg>
      )
    case 'FINAL_INTRO':
      return (
        <Msg eyebrow="Last Lash" title="Triple points">
          One prompt for everyone. Best answer takes it.
        </Msg>
      )

    case 'WRITE':
    case 'FINAL_WRITE':
      return <WriteView game={game} />

    case 'VOTE': {
      const m = game.currentMatchup
      if (!m) return null
      const iAmAuthor = m.authorIds.includes(myId)
      const myVote = m.votes[myId]?.[0]
      if (iAmAuthor) return <Msg eyebrow="Voting" title="This one's yours">Sit tight. The votes are coming in.</Msg>
      if (myVote) return <Msg eyebrow="Locked in" title="Nice.">Hang tight for the reveal.</Msg>
      return <VoteView game={game} matchup={m} />
    }

    case 'REVEAL': {
      const res = s.results[s.voteIndex]
      if (!res) return <Msg eyebrow="Reveal" title="Tallying…" />
      return (
        <Shell eyebrow="Reveal">
          <PromptHero text={res.promptText} />
          {res.jinx && <StampBadge text="JINX! Nobody scores" color={SIREN} className="mt-4 self-start text-base" />}
          {res.quiplashAuthorId && <StampBadge text="QUIPLASH! Clean sweep" color={LIME} className="mt-4 self-start text-base" />}
          <div className="mt-5 flex flex-1 flex-col justify-center gap-5">
            {res.authorIds.map((a, i) => (
              <AnswerResult
                key={a}
                text={res.answers[a] ?? ''}
                name={s.players[a]?.name ?? '?'}
                color={s.players[a]?.color ?? '#b8a6c9'}
                votes={res.voteCounts[a] ?? 0}
                winner={res.winnerId === a}
                you={a === myId}
                tilt={i % 2 ? 1.5 : -1.5}
              />
            ))}
          </div>
        </Shell>
      )
    }

    case 'SCORE':
      return (
        <Shell eyebrow="Scores">
          <div className="mt-5 flex flex-1 flex-col justify-center">
            <ScoreRows rows={standingsRows(game)} />
          </div>
        </Shell>
      )

    case 'FINAL_VOTE':
      return <FinalVoteView game={game} />

    case 'FINAL_REVEAL': {
      const res = s.results[0]
      if (!res) return <Msg eyebrow="Last Lash" title="Tallying…" />
      const ranked = [...res.authorIds].sort((a, b) => (res.voteCounts[b] ?? 0) - (res.voteCounts[a] ?? 0))
      return (
        <Shell eyebrow="Last Lash">
          <PromptHero text={res.promptText} />
          <motion.div variants={dealContainer} initial="hidden" animate="show" className="mt-5 flex flex-1 flex-col justify-center gap-4">
            {ranked.map((a, i) => (
              <motion.div key={a} variants={dealCard}>
                <AnswerResult
                  text={res.answers[a] ?? ''}
                  name={s.players[a]?.name ?? '?'}
                  color={s.players[a]?.color ?? '#b8a6c9'}
                  votes={res.voteCounts[a] ?? 0}
                  winner={res.winnerId === a}
                  you={a === myId}
                  tilt={i % 2 ? 1 : -1}
                  compact
                />
              </motion.div>
            ))}
          </motion.div>
        </Shell>
      )
    }

    case 'PODIUM':
      return <PodiumView game={game} recapId={recapId} />

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function WriteView({ game }: { game: Wisecrack }) {
  const s = game.state!
  const myId = game.myId!
  const mine = game.myMatchups
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const secs = useCountdown(s.phaseEndsAt)

  if (mine.length === 0) {
    return <Msg eyebrow="Writing" title="Sit this one out">You're not on a prompt this round. Back next round.</Msg>
  }
  const allDone = mine.every((m) => m.answers[myId] && !m.safety[myId])
  if (allDone) {
    return <Msg eyebrow="Locked in" title="Nice one.">Waiting for the others to finish…</Msg>
  }

  return (
    <Shell eyebrow={s.phase === 'FINAL_WRITE' ? 'Last Lash' : `Round ${s.roundIndex + 1}`} timer={secs}>
      <div className="mt-4 flex flex-1 flex-col gap-8">
        {mine.map((m) => {
          const submitted = !!m.answers[myId] && !m.safety[myId]
          return (
            <div key={m.id}>
              <PromptHero text={m.promptText} />
              {submitted ? (
                <motion.div initial={{ scale: 1.15, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-4">
                  <ContentCard tilt={-1.5} selected accent={LIME} className="px-5 py-4">
                    <p className="text-xl leading-snug">{m.answers[myId]} ✓</p>
                  </ContentCard>
                </motion.div>
              ) : (
                <AnswerInput
                  value={drafts[m.id] ?? ''}
                  onChange={(v) => setDrafts((d) => ({ ...d, [m.id]: v }))}
                  onSubmit={() => {
                    const text = (drafts[m.id] ?? '').trim()
                    if (text) {
                      haptic(18)
                      game.send.submit(m.id, text)
                    }
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

function AnswerInput({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const left = MAX_ANSWER_LEN - value.length
  return (
    <div className="mt-4">
      {/* The writing card — your words in marker ink on white paper. */}
      <ContentCard tilt={-1} className="px-1 py-1">
        <textarea
          data-testid="answer-input"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_ANSWER_LEN))}
          rows={2}
          autoFocus
          placeholder="Your funniest answer…"
          className="w-full resize-none bg-transparent px-3 py-2.5 font-marker text-2xl leading-snug text-[#1A1A1A] placeholder:text-[#1A1A1A]/35 focus:outline-none"
        />
      </ContentCard>
      <div className="mt-4 flex items-center gap-4">
        <NeonButton testId="submit-answer" type="button" onClick={onSubmit} disabled={!value.trim()} className="flex-1 px-6 py-3.5 text-xl">
          Send it
        </NeonButton>
        <span className="shrink-0 font-body text-sm text-[#FFFDF5]/75 tabular-nums">{left}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vote
// ---------------------------------------------------------------------------

function VoteView({ game, matchup }: { game: Wisecrack; matchup: Matchup }) {
  const [picked, setPicked] = useState<string | null>(null)
  const secs = useCountdown(game.state!.phaseEndsAt)
  return (
    <Shell eyebrow="Which is funnier?" timer={secs}>
      <PromptHero text={matchup.promptText} />
      <div className="mt-7 flex flex-1 flex-col justify-center gap-6">
        {matchup.authorIds.map((a, i) => {
          const isPicked = picked === a
          const dimmed = picked != null && !isPicked
          return (
            <motion.div key={a} animate={{ opacity: dimmed ? 0.4 : 1 }}>
              <ContentCard
                as="button"
                testId="vote-option"
                tilt={i % 2 ? 2 : -2}
                selected={isPicked}
                accent={LIME}
                onClick={() => {
                  if (picked) return
                  setPicked(a)
                  haptic(22)
                  game.send.vote(matchup.id, a)
                }}
                className="w-full px-5 py-6"
              >
                <p className="text-center text-2xl leading-snug">{matchup.answers[a]}</p>
              </ContentCard>
            </motion.div>
          )
        })}
      </div>
    </Shell>
  )
}

function FinalVoteView({ game }: { game: Wisecrack }) {
  const s = game.state!
  const myId = game.myId!
  const m: Matchup | undefined = s.matchups[0]
  const secs = useCountdown(s.phaseEndsAt)
  if (!m) return null
  const myVotes = m.votes[myId] ?? []
  const remaining = s.config.finalVotes - myVotes.length
  const others = m.authorIds.filter((a) => a !== myId)

  if (remaining === 0) {
    return <Msg eyebrow="Locked in" title="Votes spent">Hang tight for the reveal.</Msg>
  }

  return (
    <Shell eyebrow="Spend your votes" timer={secs}>
      <PromptHero text={m.promptText} />
      <DisplayText className="mt-3 text-center text-2xl">{remaining} left</DisplayText>
      <div className="mt-4 flex flex-1 flex-col justify-center gap-4">
        {others.map((a, i) => {
          const mine = myVotes.filter((v) => v === a).length
          return (
            <ContentCard key={a} tilt={i % 2 ? 1 : -1} selected={mine > 0} accent={LIME} className="flex items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 text-lg leading-snug">{m.answers[a]}</p>
              {mine > 0 && (
                <button
                  data-testid="final-vote-remove"
                  onClick={() => game.send.unvote(m.id, a)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#131313] font-display text-xl text-[#FFFDF5] active:scale-95"
                >
                  −
                </button>
              )}
              <span className="w-6 shrink-0 text-center font-display text-xl text-[#1A1A1A] tabular-nums">{mine}</span>
              <button
                data-testid="final-vote-add"
                onClick={() => {
                  if (remaining > 0) { haptic(18); game.send.vote(m.id, a) }
                }}
                disabled={remaining === 0}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-[#131313] bg-[#C6FF3D] font-display text-xl text-[#131313] active:scale-95 disabled:opacity-40"
              >
                +
              </button>
            </ContentCard>
          )
        })}
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function PodiumView({ game, recapId }: { game: Wisecrack; recapId: string | null }) {
  const s = game.state!
  const myId = game.myId!
  const ranked = s.summary?.standings ?? []
  const rank = ranked.findIndex((p) => p.userId === myId) + 1
  const winner = ranked[0]
  const iWon = !!winner && winner.userId === myId
  useEffect(() => {
    if (iWon) burst(['#C6FF3D', '#FFD23F'])
  }, [iWon])
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <DisplayText className="text-sm tracking-[0.3em]">That's the show</DisplayText>
      {winner && (
        <motion.div variants={promptReveal} initial="hidden" animate="show" className="mt-3">
          <Banner tilt={-1.5} className="px-7 py-3 text-3xl uppercase">
            <span style={{ color: winner.color }}>{iWon ? 'You win!' : `${winner.name} wins`}</span>
          </Banner>
        </motion.div>
      )}
      {winner && <p className="mt-2 font-body text-[#FFFDF5]/85">{winner.score} points</p>}
      <div className="mt-6 w-full max-w-sm">
        <ScoreRows
          rows={ranked.slice(0, 6).map((p) => ({
            id: p.userId,
            name: p.name,
            color: p.color,
            score: p.score,
            you: p.userId === myId,
          }))}
        />
      </div>
      {rank > 0 && !iWon && <p className="mt-4 font-body text-[#FFFDF5]/85">You finished #{rank}</p>}
      {game.isHost && (
        <NeonButton testId="play-again-btn" color="gold" onClick={() => game.send.playAgain()} className="mt-8 px-8 py-4 text-2xl">
          Play again
        </NeonButton>
      )}
      {game.isHost && recapId && (
        <a data-testid="share-recap" href={`/recap/${recapId}`} className="mt-4 font-body text-sm text-cyan underline">
          Share the recap
        </a>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** A phase body inside the broadcast stage — eyebrow sub-header, then fill. The
 *  phase label + timer live in the BroadcastFrame top bar; `timer` is accepted
 *  (callers still compute it) but rendered there, not here. */
function Shell({ eyebrow, children }: { eyebrow: string; timer?: number; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <DisplayText className="text-xs tracking-[0.32em]">{eyebrow}</DisplayText>
      {children}
    </div>
  )
}

/** The prompt — the thing the player is reacting to — on an ink banner. */
function PromptHero({ text }: { text: string }) {
  return (
    <motion.div variants={promptReveal} initial="hidden" animate="show" className="mt-3">
      <Banner tilt={-1} className="px-5 py-3.5 font-body text-lg font-bold leading-snug normal-case sm:text-xl">
        {text}
      </Banner>
    </motion.div>
  )
}

function Msg({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 text-center">
      <DisplayText className="text-xs tracking-[0.32em]">{eyebrow}</DisplayText>
      <motion.h1 variants={promptReveal} initial="hidden" animate="show" className="mt-2">
        <DisplayText className="text-5xl">{title}</DisplayText>
      </motion.h1>
      {children && <p className="mt-3 font-body text-lg text-[#FFFDF5]/85">{children}</p>}
    </div>
  )
}

/** One answer in a reveal — a white card with the author plate revealed. */
function AnswerResult({ text, name, color, votes, winner, you, tilt, compact }: { text: string; name: string; color: string; votes: number; winner: boolean; you: boolean; tilt: number; compact?: boolean }) {
  const v = Math.round(votes)
  return (
    <motion.div animate={winner ? { scale: [1, 1.03, 1] } : {}} transition={{ duration: 0.5 }}>
      <ContentCard tilt={tilt} selected={winner} accent={LIME} className={`px-5 ${compact ? 'py-3' : 'py-4'}`}>
        <p className={`leading-snug ${compact ? 'text-lg' : 'text-xl'}`}>{text}</p>
        <div className="mt-1.5 flex items-center justify-between font-body text-sm font-bold">
          <span className="inline-flex items-center gap-1.5 text-[#1A1A1A]">
            <span className="h-3 w-3 rounded-full border-2 border-[#131313]" style={{ backgroundColor: color }} />
            {name}{you && ' (you)'}
          </span>
          <span className="text-[#1A1A1A]/80 tabular-nums">{winner && '👑 '}{v} {v === 1 ? 'vote' : 'votes'}</span>
        </div>
      </ContentCard>
    </motion.div>
  )
}

/** SCORE standings as shared color rows (FLIP + count-up), tagged with deltas. */
function standingsRows(game: Wisecrack): ScoreRowData[] {
  const s = game.state!
  return s.order
    .map((id) => s.players[id])
    .filter(Boolean)
    .map((p) => ({
      id: p.userId,
      name: p.name,
      color: p.color,
      score: p.score,
      delta: s.lastRoundDeltas[p.userId] ?? 0,
      you: p.userId === game.myId,
    }))
}
