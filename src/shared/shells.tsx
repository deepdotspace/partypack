/**
 * Route shells — the two chrome frames every game renders inside.
 *
 *  - StageShell: the TV. Full-bleed Backdrop, room-code pill + mute in the top
 *    corner, leave control, and an AnimatePresence container that crossfades
 *    children between phases (key it with `phaseKey`).
 *  - ControllerShell: the phone. Monastic centered column (max-w-md), dimmed
 *    Backdrop, sticky top status strip (room code · my name/color · mute).
 *    One task per screen — the shell stays quiet and never inherits stage
 *    decoration.
 *
 * Both take `accent` / `accent2` TOKEN NAMES from the game's GameMeta
 * ('lime' | 'magenta' | 'tangerine' / 'gold' | 'cyan' | 'violet') and tint
 * their chrome via the matching --color-* / --glow-* CSS variables.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { Backdrop } from './Backdrop'
import { World } from './World'
import { Host } from './Host'
import { MuteToggle } from './sound'
import { useMusic } from './music'
import { phaseCrossfade } from './motion'

/** Shared chrome treatment for the mute control — music now plays on every
 *  device, so the toggle must read as a real control, not a footnote. */
const MUTE_PROMINENT = 'border-2 border-[var(--color-border-strong)] shadow-[0_2px_10px_rgba(0,0,0,0.35)]'

/**
 * Soft fade for an internally-scrolling region (controller lobby roster): the
 * last ~28px fade out so a long roster reads as "more below" without a hard
 * cut. Used by the three game lobbies' scroll zone.
 */
export const SCROLL_FADE: CSSProperties = {
  maskImage: 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)',
  WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)',
}

/** Resolve an accent token name to its CSS color/glow variables. */
export function accentVar(token: string): string {
  return `var(--color-${token})`
}
export function accentGlow(token: string): string {
  return `var(--glow-${token})`
}

/**
 * Leave affordance — a small top-left control that returns to the landing.
 * Two-tap confirm (avoids a modal) since leaving drops you from the room.
 */
export function LeaveButton({ label = 'Leave' }: { label?: string }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])
  return (
    <button
      data-testid="leave-btn"
      onClick={() => (confirming ? navigate('/') : setConfirming(true))}
      className="fixed left-3 top-3 z-40 flex items-center gap-1 rounded-full border-2 border-[var(--color-border)] bg-plum/80 px-3 py-1.5 font-body text-sm text-smoke backdrop-blur transition-transform active:scale-95"
    >
      <ChevronLeft className="h-4 w-4" />
      {confirming ? 'Tap to leave' : label}
    </button>
  )
}

/** A non-blocking "Reconnecting…" banner shown while the socket is down. */
export function DisconnectBanner({ connected }: { connected: boolean }) {
  return (
    <AnimatePresence>
      {!connected && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-50 bg-siren/90 py-1.5 text-center font-body text-sm font-semibold text-stage"
        >
          Reconnecting…
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Branded full-screen loading state (replaces the scaffold "Loading…").
 * Paints the SAME indigo world as the landing so the open-app flash (auth
 * resolving, route chunk loading) is continuous with the hub, not the old
 * dark Backdrop that briefly read as a brown/black screen.
 */
export function Loading({ label = 'Warming up the studio…' }: { label?: string }) {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center gap-4 overflow-hidden">
      <World kind="indigo-burst" />
      <Host mood="idle" size={96} />
      <p className="font-body font-semibold text-white/85">{label}</p>
    </div>
  )
}

/** The corner room-code pill — joiners arriving mid-show can still read the code. */
function CodePill({ code, accent }: { code: string; accent: string }) {
  return (
    <span
      data-testid="room-code-pill"
      className="rounded-full border-2 bg-plum/80 px-3.5 py-1.5 font-display text-sm tracking-[0.18em] backdrop-blur"
      style={{ color: accentVar(accent), borderColor: `color-mix(in srgb, ${accentVar(accent)} 45%, transparent)` }}
    >
      {code}
    </span>
  )
}

/**
 * StageShell — the TV frame. Children swap with a phase crossfade keyed on
 * `phaseKey`; pass the current phase (or any key that should re-animate).
 */
export function StageShell({
  accent,
  accent2: _accent2, // reserved for chrome details games opt into later
  code,
  phaseKey,
  connected = true,
  showCodePill = true,
  leaveLabel = 'Exit',
  children,
  overlay,
}: {
  accent: string
  accent2?: string
  code: string
  phaseKey: string
  connected?: boolean
  showCodePill?: boolean
  leaveLabel?: string
  children: ReactNode
  /** Persistent layers OUTSIDE the phase crossfade (chat feed, emotes, mascot). */
  overlay?: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    // h-dvh + overflow-hidden: the TV owns the screen and never scrolls; each
    // phase body scales/compresses to fit 1280×720 rather than clipping.
    <div className="relative h-dvh overflow-hidden">
      <Backdrop />
      <AnimatePresence mode="wait">
        <motion.div
          key={phaseKey}
          variants={phaseCrossfade(true)}
          initial={reduce ? { opacity: 0 } : 'initial'}
          animate={reduce ? { opacity: 1 } : 'animate'}
          exit={reduce ? { opacity: 0 } : 'exit'}
          // h-full so the phase body (h-full flex column) is bounded by the
          // viewport and can shrink (min-h-0) instead of overflowing the page.
          className="h-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
      {overlay}
      <div className="fixed right-3 top-3 z-30 flex items-center gap-2">
        {showCodePill && <CodePill code={code} accent={accent} />}
        <MuteToggle className={MUTE_PROMINENT} />
      </div>
      <LeaveButton label={leaveLabel} />
      <DisconnectBanner connected={connected} />
    </div>
  )
}

/**
 * ControllerShell — the phone frame. A quiet, centered max-w-md column under a
 * sticky status strip. Giant tap targets and one task per screen live in the
 * children; the shell never decorates.
 */
export function ControllerShell({
  accent,
  code,
  myName,
  myColor,
  connected = true,
  children,
  testId,
  dataPhase,
  phase,
}: {
  accent: string
  code: string
  myName?: string
  myColor?: string
  connected?: boolean
  children: ReactNode
  testId?: string
  dataPhase?: string
  /** Current game phase — drives the controller music bed (defaults to the
   *  lobby loop, which fits every pre-game screen this shell hosts). In-game
   *  frames that don't use this shell call useMusic(phase, true, 'controller')
   *  themselves. */
  phase?: string
}) {
  // Music on the phone too (quieter than the stage). Starts on the first
  // user gesture — in practice the join/host tap.
  useMusic(phase ?? 'LOBBY', true, 'controller')
  return (
    // h-dvh + overflow-hidden: a game owns the phone screen; the page never
    // scrolls (children scale/compress to fit). NO Backdrop, NO dark dim — each
    // game paints its OWN bright <World kind=… dim> below the header, so the
    // colorful world shows through with only World's light scrim.
    <div className="relative flex h-dvh flex-col overflow-hidden" data-testid={testId} data-phase={dataPhase}>
      {/* A translucent INK control bar — reads as a "control strip" on any world
          (yellow / blue / green) and matches the ink-card design language,
          keeping code + name + mute legible at ≥4.5:1. Compact, so it spends as
          little of the no-scroll budget as possible. */}
      <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#131313]/80 px-4 py-2 backdrop-blur">
        <LeaveControlInline />
        <span className="h-5 w-px bg-white/15" />
        <span className="font-display text-base tracking-[0.16em]" style={{ color: accentVar(accent) }}>
          {code}
        </span>
        <div className="flex flex-1 items-center justify-end gap-3">
          {myName && (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: myColor || '#b8a6c9' }} />
              <span className="truncate font-body text-sm font-semibold text-[#FFFDF5]">{myName}</span>
            </span>
          )}
          <MuteToggle className={MUTE_PROMINENT} />
        </div>
      </header>

      <main className="mx-auto flex w-full min-h-0 max-w-md flex-1 flex-col px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
        {children}
      </main>
      <DisconnectBanner connected={connected} />
    </div>
  )
}

/** Inline leave control for the controller status strip (two-tap confirm). */
function LeaveControlInline() {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])
  return (
    <button
      data-testid="leave-btn"
      onClick={() => (confirming ? navigate('/') : setConfirming(true))}
      className="flex shrink-0 items-center gap-1 font-body text-sm text-smoke transition-colors hover:text-stage"
    >
      <ChevronLeft className="h-4 w-4" />
      {confirming ? 'Tap again' : 'Leave'}
    </button>
  )
}
