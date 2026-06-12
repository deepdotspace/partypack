/**
 * ControllerGame — the phone view for every in-game Baloney phase, in the
 * gold-dots world's language over the BroadcastFrame's dimmed backdrop:
 * the question rides a tilted black Banner, the player's lie is written on a
 * white ContentCard in marker ink, ballots ARE cream ContentCard buttons
 * (magenta ring when picked; own lie hidden), and the personal verdict at
 * REVEAL lands on banners + cards. Phone-width, one task per screen.
 * Self-contained so online players need no TV. Server validates every action.
 * The Lie Detector rejection flavor is preserved verbatim.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Baloney } from '../useBaloney'
import type { LieRejection } from '../types'
import { MAX_LIE_LENGTH } from '../validation'
import { useCountdown } from '../../../shared/Timer'
import { Eyebrow, NeonButton } from '../../../shared/primitives'
import { Banner } from '../../../shared/Banner'
import { ContentCard } from '../../../shared/ContentCard'
import { ScoreRows } from '../../../shared/ScoreRows'
import { phaseCrossfade, promptReveal, lockStamp, dealContainer, dealCard, haptic, burst } from '../../../shared/motion'
import { sound } from '../../../shared/sound'

const MAGENTA = '#FF2E97'

/** Phase wrapper — phone-width column + cross-fade between phases. */
export function ControllerGame({ game }: { game: Baloney }) {
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

function ControllerBody({ game }: { game: Baloney }) {
  const s = game.state
  const myId = game.myId
  // recapId is DO-managed and lives on the hub spine (top-level), set the
  // moment the recap row persists at PODIUM.
  const recapId = s?.recapId ?? null
  if (!s || !myId) return null
  const isSpectator = game.me?.role === 'spectator'

  switch (s.phase) {
    case 'INTRO':
      return (
        <Msg eyebrow={`Round ${s.roundIndex + 1} of ${s.config.totalRounds}`} title="Get ready">
          A weird-but-true question is coming. You'll write a lie that sounds real.
        </Msg>
      )

    case 'PROMPT':
      return (
        <Shell eyebrow={`Round ${s.roundIndex + 1}`}>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {s.question && <QuestionSlab text={s.question.prompt} />}
            <p className="mt-7 font-body text-lg font-semibold text-[#FFFDF5]/85">Think up a lie that sounds true…</p>
          </div>
        </Shell>
      )

    case 'WRITE':
      if (isSpectator) return <Msg eyebrow="Writing" title="Eyes on the room">The players are inventing their lies.</Msg>
      return <WriteView game={game} />

    case 'VOTE': {
      if (isSpectator) return <Msg eyebrow="Voting" title="No vote for the audience">Watch them squirm. Results in a moment.</Msg>
      const myVote = s.votes[myId]
      if (myVote) {
        return <VoteView game={game} locked />
      }
      return <VoteView game={game} />
    }

    case 'REVEAL':
      return <MyReveal game={game} />

    case 'SCORE':
      return (
        <Shell eyebrow="Scores">
          <div className="flex flex-1 flex-col justify-center">
            <ScoreRows
              className="mt-5"
              rows={game.players.map((p) => ({
                id: p.userId,
                name: p.name,
                color: p.color,
                score: p.score,
                delta: s.result?.deltas[p.userId] ?? 0,
                you: p.userId === myId,
              }))}
            />
          </div>
        </Shell>
      )

    case 'PODIUM':
      return <PodiumView game={game} recapId={recapId} />

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Write — the lie card
// ---------------------------------------------------------------------------

/** The original baloney's Lie Detector messages, verbatim. */
const REJECTION_MESSAGE: Record<LieRejection, string> = {
  EMPTY: 'Type something first!',
  TOO_LONG: 'A bit too long. Keep it punchy.',
  TRUTH: "That's the actual truth! Make something up.",
  FORBIDDEN: 'Too obvious. Get sneakier.',
  DUPLICATE_OWN: 'You already submitted that one.',
}

function WriteView({ game }: { game: Baloney }) {
  const s = game.state!
  const myId = game.myId!
  const myLie = s.lies[myId]
  const rejection = s.rejections[myId]
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const secs = useCountdown(s.phaseEndsAt)

  // Submitted and not editing → the lock-in card (with a "change it" escape).
  if (myLie !== undefined && !editing) {
    return (
      <Shell eyebrow="Locked in" timer={secs}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <motion.div variants={lockStamp} initial="hidden" animate="show" className="relative w-full">
            <ContentCard testId="lie-locked" tilt={-1.2} className="w-full px-5 py-6 text-center">
              <p className="font-marker text-3xl leading-snug">“{myLie}”</p>
            </ContentCard>
            <span
              className="pointer-events-none absolute -right-2 -top-3 rotate-6 border-[3px] border-[#131313] bg-[#FF2E97] px-2.5 py-0.5 font-display text-sm uppercase tracking-wider text-[#131313]"
              style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}
            >
              Your lie is in
            </span>
          </motion.div>
          <button
            onClick={() => { setText(myLie); setEditing(true) }}
            className="mt-6 font-body text-sm font-semibold text-[#27E1FF] underline-offset-4 hover:underline"
          >
            Change it
          </button>
          <p className="mt-3 font-body text-sm text-[#FFFDF5]/75">Waiting for the others…</p>
        </div>
      </Shell>
    )
  }

  const submit = () => {
    const t = text.trim()
    if (!t) return
    haptic(18)
    sound.click()
    game.send.submitLie(t)
    setEditing(false)
  }

  return (
    <Shell eyebrow={`Round ${s.roundIndex + 1} · sell your lie`} timer={secs}>
      {s.question && <QuestionSlab text={s.question.prompt} small />}
      <div className="mt-5 flex flex-1 flex-col justify-center">
        <AnimatePresence>
          {rejection && (
            <motion.p
              key={rejection}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              data-testid="lie-rejection"
              className="mb-4 -rotate-1 border-[3px] border-[#131313] bg-[#FF3B3B] px-4 py-2 text-center font-display text-sm uppercase tracking-wide text-[#131313]"
              style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}
            >
              {REJECTION_MESSAGE[rejection]}
            </motion.p>
          )}
        </AnimatePresence>
        {/* The lie card — white paper, marker ink. */}
        <ContentCard tilt={-0.8} className="w-full px-2 py-1">
          <textarea
            data-testid="lie-input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LIE_LENGTH))}
            rows={2}
            autoFocus
            placeholder="Your convincing lie…"
            className="w-full resize-none bg-transparent px-3 py-3 font-marker text-2xl leading-snug text-[#1A1A1A] placeholder:text-[#1A1A1A]/35 focus:outline-none"
          />
        </ContentCard>
        <div className="mt-4 flex items-center gap-4">
          <NeonButton testId="submit-lie" type="button" color="magenta" onClick={submit} disabled={!text.trim()} className="flex-1 px-6 py-3.5 text-xl">
            Submit lie
          </NeonButton>
          <span className="shrink-0 font-body text-sm text-[#FFFDF5]/75 tabular-nums">{MAX_LIE_LENGTH - text.length}</span>
        </div>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// Vote — cream ballot cards (the cards ARE the tap targets)
// ---------------------------------------------------------------------------

function VoteView({ game, locked }: { game: Baloney; locked?: boolean }) {
  const s = game.state!
  const myId = game.myId!
  const secs = useCountdown(s.phaseEndsAt)
  const myVote = s.votes[myId]
  // My own lie never shows as a ballot (can't vote for it anyway).
  const options = s.options.filter((o) => !o.authorIds.includes(myId))

  return (
    <Shell eyebrow="Spot the truth" timer={secs}>
      {s.question && <QuestionSlab text={s.question.prompt} small />}
      <motion.div variants={dealContainer} initial="hidden" animate="show" className="mt-6 flex flex-1 flex-col justify-center gap-4">
        {options.map((o, i) => {
          const picked = myVote === o.id
          const dimmed = !!myVote && !picked
          return (
            <motion.div key={o.id} variants={dealCard} className="flex flex-col">
              <ContentCard
                as="button"
                testId="vote-option"
                tilt={i % 2 === 0 ? -1 : 1}
                selected={picked}
                accent={MAGENTA}
                onClick={() => {
                  haptic(22)
                  sound.click()
                  game.send.vote(o.id)
                }}
                className="w-full px-5 py-4"
                // Dim on the card itself (framer's variant propagation would
                // override an `animate` opacity on the deal wrapper).
                style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity 0.2s' }}
              >
                <span className="block text-center font-marker text-2xl leading-snug">{o.text}</span>
              </ContentCard>
            </motion.div>
          )
        })}
      </motion.div>
      {locked && <p className="mt-4 text-center font-body text-sm font-semibold text-[#FF2E97]">Locked in. Tap another to change.</p>}
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// Reveal — the personal verdict
// ---------------------------------------------------------------------------

function MyReveal({ game }: { game: Baloney }) {
  const s = game.state!
  const myId = game.myId!
  const me = game.me!
  const result = s.result
  const isSpectator = me.role === 'spectator'
  const myVote = s.votes[myId]
  const foundTruth = myVote !== undefined && myVote === result?.truthOptionId
  const myOption = s.options.find((o) => o.authorIds.includes(myId))
  const fooled = myOption ? (result?.votesByOption[myOption.id]?.length ?? 0) : 0
  const delta = result?.deltas[myId] ?? 0

  useEffect(() => {
    if (isSpectator) return
    if (foundTruth || fooled > 0) {
      burst([me.color, '#27E1FF'])
      sound.ding()
    } else {
      sound.stamp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const truth = s.options.find((o) => o.id === result?.truthOptionId)

  if (isSpectator) {
    return (
      <Msg eyebrow="Reveal" title="The truth">
        {truth ? `It was “${truth.text}”.` : 'Watch the big screen.'}
      </Msg>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 text-center">
      <Eyebrow>Reveal</Eyebrow>
      {/* The verdict — a slammed-in banner; magenta stamp tone when fooled. */}
      <motion.div variants={promptReveal} initial="hidden" animate="show" className="mt-3 w-full">
        <Banner tilt={-2} className="px-6 py-4 text-center text-4xl uppercase leading-tight">
          <span style={{ color: foundTruth ? '#C6FF3D' : MAGENTA }}>
            {foundTruth ? 'You found the truth!' : myVote ? 'Baloney!' : 'No vote cast'}
          </span>
        </Banner>
      </motion.div>
      {!foundTruth && myVote && (
        <p className="mt-3 font-body font-semibold text-[#FFFDF5]/80">You fell for someone's lie.</p>
      )}
      {/* The truth rides its own cream card, magenta-framed like the TV's. */}
      {truth && (
        <div className="relative mt-6 w-full">
          <ContentCard tilt={1} className="w-full px-5 py-5 text-center" style={{ border: `4px solid ${MAGENTA}` }}>
            <p className="font-marker text-2xl leading-snug">{truth.text}</p>
          </ContentCard>
          <span
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 -rotate-1 border-2 border-[#131313] bg-[#FF2E97] px-3 py-0.5 font-display text-xs lowercase tracking-wide text-[#131313]"
            style={{ boxShadow: '2.5px 2.5px 0 rgba(0,0,0,0.35)' }}
          >
            the truth
          </span>
        </div>
      )}
      {fooled > 0 ? (
        <p className="mt-7 font-body text-lg font-semibold text-[#FFFDF5]">
          Your lie fooled <span className="font-bold text-[#FF2E97]">{fooled}</span> {fooled === 1 ? 'player' : 'players'}.
        </p>
      ) : (
        myOption && <p className="mt-7 font-body text-[#FFFDF5]/75">Nobody fell for your lie this time.</p>
      )}
      {delta > 0 && (
        <motion.p
          variants={lockStamp}
          initial="hidden"
          animate="show"
          className="mt-5 inline-block border-[3px] border-[#131313] bg-[#C6FF3D] px-5 py-1 font-display text-4xl text-[#131313]"
          style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.35)' }}
        >
          +{delta}
        </motion.p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function PodiumView({ game, recapId }: { game: Baloney; recapId: string | null }) {
  const s = game.state!
  const myId = game.myId!
  const ranked = s.summary?.standings ?? []
  const rank = ranked.findIndex((p) => p.userId === myId) + 1
  const winner = ranked[0]
  const iWon = !!winner && winner.userId === myId
  const best = s.summary?.bestLie
  useEffect(() => {
    if (iWon) burst([MAGENTA, '#27E1FF', '#FFD23F'])
  }, [iWon])
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <Eyebrow>That's the show</Eyebrow>
      {winner && (
        <motion.div variants={promptReveal} initial="hidden" animate="show" className="mt-3 w-full">
          <Banner tilt={-2} className="px-6 py-4 text-center text-4xl uppercase leading-tight">
            <span style={{ color: winner.color }}>{iWon ? 'You win!' : `${winner.name} wins`}</span>
          </Banner>
        </motion.div>
      )}
      {winner && <p className="mt-2 font-body font-semibold text-[#FFFDF5]/80">{winner.score} points</p>}
      <ScoreRows
        className="mt-6 max-w-sm"
        rows={ranked.slice(0, 6).map((p) => ({
          id: p.userId,
          name: p.name,
          color: p.color,
          score: p.score,
          you: p.userId === myId,
        }))}
      />
      {best && (
        <ContentCard tilt={1.2} className="mt-6 w-full max-w-sm px-4 py-3 text-left">
          <p className="font-body text-[10px] font-bold uppercase tracking-[0.3em] text-[#FF2E97]">Best baloney</p>
          <p className="mt-1 font-marker text-xl leading-snug">“{best.text}”</p>
          <p className="mt-1 font-body text-xs font-bold text-[#1A1A1A]">
            {best.authors.map((a) => a.name).join(' & ')} · fooled {best.fooled}
          </p>
        </ContentCard>
      )}
      {rank > 0 && !iWon && <p className="mt-4 font-body text-[#FFFDF5]/80">You finished #{rank}</p>}
      {game.isHost && (
        <NeonButton testId="play-again-btn" color="gold" onClick={() => game.send.playAgain()} className="mt-8 px-8 py-4 text-2xl">
          Play again
        </NeonButton>
      )}
      {game.isHost && recapId && (
        <a data-testid="share-recap" href={`/recap/${recapId}`} className="mt-4 font-body text-sm text-[#27E1FF] underline">
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
      <Eyebrow>{eyebrow}</Eyebrow>
      {children}
    </div>
  )
}

/** The question, on its tilted black slab — the phone-size cousin of the TV's
 *  big question banner. */
function QuestionSlab({ text, small }: { text: string; small?: boolean }) {
  return (
    <motion.div variants={promptReveal} initial="hidden" animate="show" className="mt-3 w-full">
      <Banner tilt={-1.5} className={`px-5 text-center leading-snug ${small ? 'py-3 text-lg' : 'py-4 text-xl sm:text-2xl'}`}>
        {text}
      </Banner>
    </motion.div>
  )
}

function Msg({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <motion.div variants={promptReveal} initial="hidden" animate="show" className="mt-3 w-full">
        <Banner tilt={-2} className="px-6 py-4 text-center text-4xl uppercase leading-tight">
          {title}
        </Banner>
      </motion.div>
      {children && <p className="mt-4 font-body text-lg font-semibold text-[#FFFDF5]/85">{children}</p>}
    </div>
  )
}
