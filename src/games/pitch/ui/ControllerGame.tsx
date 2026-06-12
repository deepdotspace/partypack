/**
 * ControllerGame — the phone view for every in-game Pitch phase, on the
 * dimmed blueprint world. Phone-width (the BroadcastFrame's stage column),
 * brief-as-context on a cream card, ONE white ContentCard "draft sheet"
 * during WRITE (the single two-input exception: the name field in display
 * caps with the marker pitch beneath it — still one card, one task), white
 * napkin ballots during VOTE (selected = tangerine ring), and tactile juice
 * (lock-stamp + haptic on submit, flare on vote). Self-contained so online
 * players need no TV. Server validates actions.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Pitch } from '../usePitch'
import type { InventionOption } from '../types'
import { MAX_NAME_LENGTH, MAX_PITCH_LENGTH } from '../validation'
import { useCountdown } from '../../../shared/Timer'
import { Eyebrow, NeonButton } from '../../../shared/primitives'
import { ContentCard } from '../../../shared/ContentCard'
import { NamePlate } from '../../../shared/PlayerToken'
import { phaseCrossfade, promptReveal, lockStamp, dealContainer, dealCard, haptic, burst } from '../../../shared/motion'
import { sound } from '../../../shared/sound'

/** Pitch's accent — the ballot ring + stamps (tangerine token hex). */
const TANGERINE = '#FF8A3D'

/** Phase wrapper — phone-width column + cross-fade between phases. */
export function ControllerGame({ game }: { game: Pitch }) {
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

function ControllerBody({ game }: { game: Pitch }) {
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
        <Msg eyebrow={`Round ${s.roundIndex + 1}`} title="Get ready">
          A brief is coming. Name a product and sell it in one line.
        </Msg>
      )

    case 'PROMPT':
      return (
        <Shell eyebrow="The brief">
          <div className="flex flex-1 flex-col justify-center">
            <BriefCard text={s.brief?.prompt ?? ''} big />
            <p className="mt-6 text-center font-marker text-lg text-[#FFFDF5]/90">Dream up a product worth pitching…</p>
          </div>
        </Shell>
      )

    case 'WRITE':
      if (isSpectator) {
        return <Msg eyebrow="Inventing" title="You're watching">The inventors are at work. Chat away.</Msg>
      }
      return <InventView game={game} />

    case 'VOTE': {
      if (isSpectator) {
        return <Msg eyebrow="Voting" title="The room decides">Spectators watch this part. Votes are players-only.</Msg>
      }
      const myVote = s.votes[myId]
      const mine = s.options.filter((o) => o.userId !== myId)
      if (mine.length === 0) {
        return <Msg eyebrow="Voting" title="This one's yours">Yours is the only pitch on the board. Sit tight.</Msg>
      }
      return <VoteView game={game} options={mine} myVote={myVote} />
    }

    case 'REVEAL':
      return <MyReveal game={game} />

    case 'SCORE': {
      const ranked = s.order.map((id) => s.players[id]).filter(Boolean).sort((a, b) => b.score - a.score)
      return (
        <Shell eyebrow="Scores">
          <motion.div variants={dealContainer} initial="hidden" animate="show" className="mt-5 flex flex-1 flex-col justify-center gap-2">
            {ranked.map((p, i) => (
              <motion.div key={p.userId} variants={dealCard}>
                <StandingRow rank={i + 1} name={p.name} color={p.color} score={p.score} delta={s.result?.deltas[p.userId] ?? 0} you={p.userId === myId} />
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
// Write — ONE bounded invention card: big name field, pitch beneath
// ---------------------------------------------------------------------------

function InventView({ game }: { game: Pitch }) {
  const s = game.state!
  const myId = game.myId!
  const mine = s.inventions[myId]
  const [name, setName] = useState('')
  const [pitch, setPitch] = useState('')
  const [editing, setEditing] = useState(false)
  const secs = useCountdown(s.phaseEndsAt)

  const canSubmit = name.trim().length > 0 && pitch.trim().length > 0
  const submit = () => {
    if (!canSubmit) return
    haptic(18)
    sound.pop()
    game.send.submit(name.trim(), pitch.trim())
    setEditing(false)
  }

  // Locked in — show the invention on its napkin, allow a re-take while the
  // timer runs.
  if (mine !== undefined && !editing) {
    return (
      <Shell eyebrow="Pitched" timer={secs}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <motion.div variants={lockStamp} initial="hidden" animate="show" className="relative w-full">
            <ContentCard tilt={-1.2} className="w-full px-5 pb-5 pt-6 text-center">
              <p className="font-display text-2xl uppercase leading-tight text-[#131313]">{mine.name}</p>
              <p className="mt-1 text-lg leading-snug">{mine.pitch}</p>
            </ContentCard>
            <NamePlate tilt={2} className="absolute -bottom-3 left-1/2 w-max -translate-x-1/2 px-2.5 py-0.5 text-xs">
              ✓ your pitch is in
            </NamePlate>
          </motion.div>
          <button
            data-testid="edit-invention"
            onClick={() => {
              setName(mine.name)
              setPitch(mine.pitch)
              setEditing(true)
            }}
            className="mt-7 font-marker text-base text-[#FFFDF5]/90 underline decoration-dashed underline-offset-4"
          >
            Change it
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell eyebrow={`Round ${s.roundIndex + 1} · invent`} timer={secs}>
      <BriefCard text={s.brief?.prompt ?? ''} />
      {/* The draft sheet — the deliberate two-input exception: ONE white card,
          one task (name the thing, sell the thing). */}
      <div className="mt-5 flex flex-1 flex-col justify-center">
        <ContentCard tilt={-0.8} className="p-5">
          <label className="block font-body text-[11px] font-bold uppercase tracking-[0.25em] text-[#1A1A1A]/55">Product name</label>
          <input
            data-testid="invention-name-input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Name it…"
            autoFocus
            className="mt-1 w-full border-b-[3px] border-[#131313]/25 bg-transparent px-1 py-2 font-display text-3xl uppercase text-[#131313] transition-colors placeholder:normal-case placeholder:text-[#1A1A1A]/30 focus:border-tangerine focus:outline-none"
          />
          <label className="mt-5 block font-body text-[11px] font-bold uppercase tracking-[0.25em] text-[#1A1A1A]/55">Your pitch</label>
          <textarea
            data-testid="invention-pitch-input"
            value={pitch}
            onChange={(e) => setPitch(e.target.value.slice(0, MAX_PITCH_LENGTH))}
            rows={2}
            placeholder="One line that sells it…"
            className="mt-1 w-full resize-none border-b-[3px] border-[#131313]/25 bg-transparent px-1 py-2 font-marker text-xl leading-snug text-[#1A1A1A] transition-colors placeholder:text-[#1A1A1A]/30 focus:border-tangerine focus:outline-none"
          />
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              data-testid="submit-invention"
              onClick={submit}
              disabled={!canSubmit}
              className="flex-1 border-[3px] border-[#131313] bg-tangerine px-6 py-3.5 font-display text-xl uppercase text-[#131313] transition-transform active:scale-95 disabled:opacity-40"
              style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.35)' }}
            >
              Pitch it
            </button>
            <span className="shrink-0 font-marker text-sm text-[#1A1A1A]/55 tabular-nums">{MAX_PITCH_LENGTH - pitch.length}</span>
          </div>
        </ContentCard>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// Vote — tilted invention-card ballots (the cards ARE the tap targets)
// ---------------------------------------------------------------------------

function VoteView({ game, options, myVote }: { game: Pitch; options: InventionOption[]; myVote?: string }) {
  const secs = useCountdown(game.state!.phaseEndsAt)
  return (
    <Shell eyebrow="Which would you buy?" timer={secs}>
      <div className="mt-4 flex flex-1 flex-col justify-center gap-4">
        {options.map((o, i) => {
          const selected = myVote === o.id
          const dimmed = myVote != null && !selected
          const tilt = i % 2 === 0 ? -1.2 : 1.2
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 24, delay: i * 0.05 }}
            >
              <ContentCard
                as="button"
                testId="vote-option"
                tilt={selected ? 0 : tilt}
                selected={selected}
                accent={TANGERINE}
                onClick={() => {
                  haptic(22)
                  sound.click()
                  game.send.vote(o.id)
                }}
                className="w-full px-5 py-4"
              >
                <span className="block font-display text-2xl uppercase leading-tight text-[#131313]">{o.name}</span>
                <span className="mt-0.5 block text-base leading-snug">{o.pitch}</span>
              </ContentCard>
            </motion.div>
          )
        })}
      </div>
      {myVote && (
        <p className="mt-4 text-center font-marker text-base text-[#FFFDF5]/90">Locked in. Tap another to change.</p>
      )}
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// Reveal — the personal beat (self-contained: no TV needed)
// ---------------------------------------------------------------------------

function MyReveal({ game }: { game: Pitch }) {
  const s = game.state!
  const myId = game.myId!
  const result = s.result
  const myOption = s.options.find((o) => o.userId === myId)
  const votes = myOption ? (result?.votesByOption[myOption.id]?.length ?? 0) : 0
  const won = result?.roundWinnerUserId === myId
  const delta = result?.deltas[myId] ?? 0
  const me = game.me

  useEffect(() => {
    if (won) {
      burst(['#FF8A3D', '#9D5CFF'])
      sound.ding()
    } else if (votes > 0) {
      sound.pop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!myOption) {
    // Spectator, or a player whose invention never made the board.
    return (
      <Msg eyebrow="Reveal" title="The votes are in">
        Watch the board — the round winner is about to be crowned.
      </Msg>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 text-center">
      <Eyebrow>Reveal</Eyebrow>
      <motion.h1
        variants={promptReveal}
        initial="hidden"
        animate="show"
        className="mt-2 font-display text-4xl uppercase leading-tight"
        style={{ color: won ? 'var(--color-tangerine)' : votes > 0 ? 'var(--color-violet)' : 'var(--color-smoke)' }}
      >
        {won ? 'FUNDED! You won the round!' : votes > 0 ? 'Nice pitch!' : 'No votes this time'}
      </motion.h1>
      <div className="relative mt-5 w-full max-w-sm">
        <ContentCard tilt={won ? -1.5 : 1} className="w-full px-5 pb-5 pt-4 text-center" selected={won} accent={me?.color ?? TANGERINE}>
          <p className="font-display text-xl uppercase leading-tight text-[#131313]">{myOption.name}</p>
          <p className="mt-0.5 text-base leading-snug">{myOption.pitch}</p>
        </ContentCard>
        <NamePlate tilt={-2} className="absolute -bottom-3 left-1/2 w-max -translate-x-1/2 px-2.5 py-0.5 text-xs tabular-nums">
          {votes} {votes === 1 ? 'vote' : 'votes'}
        </NamePlate>
      </div>
      {delta > 0 && (
        <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.3 }} className="mt-5 font-display text-5xl text-tangerine">
          +{delta}
        </motion.p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function PodiumView({ game, recapId }: { game: Pitch; recapId: string | null }) {
  const s = game.state!
  const myId = game.myId!
  const ranked = s.summary?.standings ?? []
  const rank = ranked.findIndex((p) => p.userId === myId) + 1
  const winner = ranked[0]
  const iWon = !!winner && winner.userId === myId
  useEffect(() => {
    if (iWon) burst(['#FF8A3D', '#9D5CFF'])
  }, [iWon])
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <Eyebrow>That's the show</Eyebrow>
      {winner && (
        <motion.h1 variants={promptReveal} initial="hidden" animate="show" className="mt-2 font-display text-5xl uppercase leading-tight" style={{ color: winner.color }}>
          {iWon ? 'You win!' : `${winner.name} wins`}
        </motion.h1>
      )}
      {winner && <p className="mt-1 font-body text-smoke">{winner.score} points</p>}
      {s.summary?.topInvention && (
        <div className="relative mt-7 w-full max-w-sm">
          <NamePlate tilt={-1.5} className="absolute -top-3 left-1/2 z-10 w-max max-w-[90%] -translate-x-1/2 px-2.5 py-0.5 text-[10px] tracking-[0.18em]">
            INVENTION OF THE NIGHT
          </NamePlate>
          <ContentCard tilt={1} className="w-full px-4 pb-4 pt-5 text-center">
            <p className="font-display text-xl uppercase leading-tight text-[#131313]">{s.summary.topInvention.name}</p>
            <p className="mt-0.5 text-base leading-snug">{s.summary.topInvention.pitch}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#131313]" style={{ backgroundColor: s.summary.topInvention.byColor }} />
              by {s.summary.topInvention.byName} · {s.summary.topInvention.votes} {s.summary.topInvention.votes === 1 ? 'vote' : 'votes'}
            </p>
          </ContentCard>
        </div>
      )}
      <motion.div variants={dealContainer} initial="hidden" animate="show" className="mt-6 w-full max-w-sm space-y-1.5 text-left">
        {ranked.slice(0, 6).map((p, i) => (
          <motion.div key={p.userId} variants={dealCard}>
            <StandingRow rank={i + 1} name={p.name} color={p.color} score={p.score} delta={0} you={p.userId === myId} />
          </motion.div>
        ))}
      </motion.div>
      {rank > 0 && !iWon && <p className="mt-4 font-body text-smoke">You finished #{rank}</p>}
      {game.isHost && (
        <NeonButton testId="play-again-btn" color="gold" onClick={() => game.send.playAgain()} className="mt-8 px-8 py-4 text-2xl">
          Play again
        </NeonButton>
      )}
      {game.isHost && recapId && (
        <a data-testid="share-recap" href={`/recap/${recapId}`} className="mt-4 font-body text-sm text-violet underline">
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

/** The brief — the thing the player is inventing against — in marker on a
 *  cream card under its tangerine "Problem:" label (the stage rail's voice). */
function BriefCard({ text, big = false }: { text: string; big?: boolean }) {
  return (
    <motion.div variants={promptReveal} initial="hidden" animate="show" className="mt-3">
      <p className="font-display text-xs uppercase tracking-[0.2em] text-tangerine" style={{ textShadow: '1.5px 1.5px 0 rgba(0,0,0,0.55)' }}>
        Problem:
      </p>
      <ContentCard tilt={-1} className={`mt-1.5 ${big ? 'px-5 py-5 text-2xl' : 'px-4 py-3 text-lg'} leading-snug`} style={{ borderWidth: 3 }}>
        {text}
      </ContentCard>
    </motion.div>
  )
}

function Msg({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <motion.h1 variants={promptReveal} initial="hidden" animate="show" className="mt-2 font-display text-5xl uppercase text-tangerine">
        {title}
      </motion.h1>
      {children && <p className="mt-3 font-body text-lg text-smoke">{children}</p>}
    </div>
  )
}

/** One leaderboard line (SCORE + PODIUM), highlighting the current player. */
function StandingRow({ rank, name, color, score, delta, you }: { rank: number; name: string; color: string; score: number; delta: number; you: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-b-0 ${you ? 'border-l-[3px] pl-3' : 'pl-1'}`}
      style={you ? { borderLeftColor: color } : undefined}
    >
      <span className="w-5 font-display text-lg text-smoke tabular-nums">{rank}</span>
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate font-body font-semibold" style={{ color: you ? color : 'var(--color-stage)' }}>{name}{you && ' (you)'}</span>
      {delta > 0 && <span className="font-display text-sm text-tangerine tabular-nums">+{delta}</span>}
      <span className="font-score text-lg text-violet tabular-nums">{score}</span>
    </div>
  )
}
