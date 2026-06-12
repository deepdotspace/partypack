/**
 * Motion primitives — framer-motion presets + canvas-confetti helpers.
 * Spring/overshoot everywhere, never linear. Respect prefers-reduced-motion via
 * framer-motion's `useReducedMotion` at the call sites (big transforms swap to
 * fades). Shared vocabulary across all Party Pack games.
 */
import type { Transition, Variants } from 'framer-motion'
import confetti from 'canvas-confetti'

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 30 }
export const springy: Transition = { type: 'spring', stiffness: 560, damping: 18 } // overshoot

/** Elastic pop-in (avatars, badges, score chips). */
export const popIn: Variants = {
  hidden: { scale: 0, opacity: 0 },
  show: { scale: 1, opacity: 1, transition: springy },
}

/** Slam in from a side (head-to-head answers from opposite edges). */
export function slamFrom(dir: 'left' | 'right'): Variants {
  const x = dir === 'left' ? -160 : 160
  return {
    hidden: { x, opacity: 0, rotate: dir === 'left' ? -4 : 4 },
    show: { x: 0, opacity: 1, rotate: 0, transition: spring },
  }
}

/** Stamp slam — overshoot + settle. */
export const stampIn: Variants = {
  hidden: { scale: 2.4, opacity: 0, rotate: -18 },
  show: { scale: 1, opacity: 1, rotate: -6, transition: { type: 'spring', stiffness: 700, damping: 16 } },
}

// --- Named spring presets (tuned; raw framer defaults are too floppy) ---
export const snappy: Transition = { type: 'spring', stiffness: 400, damping: 30 } // crisp, phone
export const gentle: Transition = { type: 'spring', stiffness: 210, damping: 26 } // soft entrance
export const slamSpring: Transition = { type: 'spring', stiffness: 600, damping: 15, mass: 1.1 } // hard arrival
export const rerankSpring: Transition = { type: 'spring', stiffness: 350, damping: 30 } // FLIP re-rank

export const tagLand: Transition = { type: 'spring', stiffness: 520, damping: 22 } // voter tags piling on

export const easeOut = [0.16, 1, 0.3, 1] as const // expo-out, for entrances
export const easeIn = [0.4, 0, 1, 1] as const

/**
 * Phase cross-fade-slide — the connective tissue between phases.
 * Wrap each phase in <AnimatePresence mode="wait"> keyed by phase.
 * `big` = the TV (more travel, slower); default = the phone (snappy).
 */
export function phaseCrossfade(big = false): Variants {
  const y = big ? 24 : 12
  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0, transition: { duration: big ? 0.4 : 0.22, ease: easeOut } },
    exit: { opacity: 0, y: -y, transition: { duration: big ? 0.25 : 0.16, ease: easeIn } },
  }
}

/** Staggered "deal" — parent gets dealContainer, each child dealCard. */
export const dealContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}
export const dealCard: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.92 },
  show: { opacity: 1, y: 0, scale: 1, transition: gentle },
}

/** Lock-in stamp — the phone's submit/vote confirmation (overshoot + settle). */
export const lockStamp: Variants = {
  hidden: { opacity: 0, scale: 1.5, rotate: -10 },
  show: { opacity: 1, scale: 1, rotate: -5, transition: { type: 'spring', stiffness: 700, damping: 16 } },
}

/** Prompt reveal — blur-to-sharp rise (the prompt as hero). */
export const promptReveal: Variants = {
  hidden: { opacity: 0, y: 22, filter: 'blur(10px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, ease: easeOut } },
}

/** Tactile button/card press — spread onto any motion element. */
export const pressable = {
  whileTap: { scale: 0.96 },
  whileHover: { scale: 1.02 },
  transition: snappy,
} as const

/** Light haptic on supported devices (no-op elsewhere). */
export function haptic(ms = 16): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(ms) } catch { /* unsupported */ }
  }
}

/** A single celebratory burst in the given colors. */
export function burst(colors: string[] = ['#C6FF3D', '#FFB43D', '#FF3D8A', '#FF8A3D']) {
  confetti({ particleCount: 120, spread: 78, startVelocity: 45, origin: { y: 0.55 }, colors, disableForReducedMotion: true })
}

/** Two-cannon celebration for the winner / podium. */
export function cannons(colors: string[] = ['#C6FF3D', '#FFB43D', '#FF3D8A', '#FF8A3D', '#FF6B4D']) {
  const opts = { particleCount: 80, spread: 70, startVelocity: 55, disableForReducedMotion: true, colors }
  confetti({ ...opts, angle: 60, origin: { x: 0, y: 0.7 } })
  confetti({ ...opts, angle: 120, origin: { x: 1, y: 0.7 } })
}
