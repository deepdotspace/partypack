/**
 * Avatar — Jackbox-style paper-cutout player shapes (quiplash1-lobby ref):
 * 8 genuinely distinct polygon silhouettes picked by seat, filled with the
 * player's roster color, thick ink outline, and a simple expressive face.
 * Each seat leans at its own angle so a roster reads hand-placed, not stamped.
 *
 * Seat shapes: 0 brick · 1 leaf · 2 flag · 3 pentagon · 4 robo-square
 * (cyclops!) · 5 blob · 6 gem · 7 crown. Spring entrance; reduced-motion
 * falls back to a fade.
 */
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { springy } from './motion'

export type AvatarMood = 'idle' | 'happy' | 'sad' | 'worried' | 'celebrate'

const INK = '#131313'
const EYE_WHITE = '#FFFDF5'

/** Per-seat lean (deg) — neighbors tilt opposite ways. */
const TILTS = [-5, 4, -3, 6, -4, 3, -6, 5] as const

/** 8 cutout silhouettes (100×100 viewBox, ~8px margin for the stroke). */
const SHAPES = [
  'M20 27 L82 18 L88 77 L16 84 Z', // 0 brick — leaning slab
  'M50 7 L77 33 L81 81 L25 86 L20 38 Z', // 1 leaf — high apex teardrop
  'M25 23 L68 9 L83 29 L79 85 L27 84 Z', // 2 flag — clipped top corner
  'M50 9 L88 39 L74 86 L26 86 L12 39 Z', // 3 pentagon — game-show badge
  'M21 21 L81 15 L87 81 L15 85 Z', // 4 robo-square — boxy, gets the cyclops face
  'M50 11 L79 21 L91 52 L74 85 L37 90 L13 67 L18 31 Z', // 5 blob — soft heptagon
  'M31 13 L72 11 L92 46 L75 85 L27 87 L9 47 Z', // 6 gem — wide hex
  'M28 30 L41 10 L55 25 L71 11 L81 42 L71 87 L25 85 L15 45 Z', // 7 crown — two spikes up
] as const

export function Avatar({
  seat,
  color,
  mood = 'idle',
  size = 64,
}: {
  seat: number
  color: string
  mood?: AvatarMood
  size?: number
}) {
  const reduce = useReducedMotion()
  const i = ((seat % SHAPES.length) + SHAPES.length) % SHAPES.length
  const cyclops = i === 4

  return (
    <motion.div
      style={{ width: size, height: size, rotate: TILTS[i] }}
      initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
      animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
      transition={reduce ? { duration: 0.2 } : springy}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {/* cutout drop edge — the paper sits a hair off the page */}
        <path d={SHAPES[i]} transform="translate(3.5 4.5)" fill="rgba(0,0,0,0.3)" />
        <path d={SHAPES[i]} fill={color} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
        {cyclops ? <CyclopsFace mood={mood} /> : <Face mood={mood} />}
      </svg>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Faces — two dot-pupil eyes (or one big cyclops eye) + a mood mouth. */
/* ------------------------------------------------------------------ */

function Face({ mood }: { mood: AvatarMood }) {
  return (
    <g>
      {EYES[mood]}
      {MOUTHS[mood]}
    </g>
  )
}

const EYES: Record<AvatarMood, ReactNode> = {
  idle: (
    <g>
      <ellipse cx="38" cy="44" rx="8.5" ry="9.5" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="62" cy="44" rx="8.5" ry="9.5" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <circle cx="39.5" cy="46" r="3.4" fill={INK} />
      <circle cx="63.5" cy="46" r="3.4" fill={INK} />
    </g>
  ),
  happy: (
    <g>
      <ellipse cx="38" cy="43" rx="9" ry="10" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="62" cy="43" rx="9" ry="10" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <circle cx="38" cy="44" r="3.8" fill={INK} />
      <circle cx="62" cy="44" r="3.8" fill={INK} />
    </g>
  ),
  sad: (
    <g>
      {/* brows angled down-out */}
      <path d="M30 33 L46 38" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M70 33 L54 38" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="38" cy="47" rx="8" ry="9" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="62" cy="47" rx="8" ry="9" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <circle cx="38" cy="50" r="3.2" fill={INK} />
      <circle cx="62" cy="50" r="3.2" fill={INK} />
    </g>
  ),
  worried: (
    <g>
      {/* one brow up, one flat — the classic "uh oh" */}
      <path d="M30 32 Q38 27 46 32" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M54 35 L70 34" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="38" cy="46" rx="8.5" ry="9.5" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="62" cy="46" rx="7.5" ry="8.5" fill={EYE_WHITE} stroke={INK} strokeWidth="2.5" />
      <circle cx="36" cy="47" r="3.4" fill={INK} />
      <circle cx="60" cy="47" r="3" fill={INK} />
    </g>
  ),
  celebrate: (
    <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none">
      {/* closed happy ^^ eyes */}
      <path d="M30 46 Q38 37 46 46" />
      <path d="M54 46 Q62 37 70 46" />
    </g>
  ),
}

const MOUTHS: Record<AvatarMood, ReactNode> = {
  idle: <path d="M40 62 Q50 68 60 62" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />,
  happy: <path d="M36 60 Q50 76 64 60 Q50 67 36 60 Z" fill={INK} />,
  sad: <path d="M40 68 Q50 60 60 68" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />,
  worried: <path d="M40 65 Q45 61 50 65 Q55 69 60 65" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />,
  celebrate: (
    <g>
      <path d="M37 58 Q50 80 63 58 Q50 66 37 58 Z" fill={INK} />
      <path d="M43 64 Q50 70 57 64 L57 66 Q50 72 43 66 Z" fill="#FF5E7A" />
    </g>
  ),
}

/** Seat 4's robot gets one big lens eye — instant personality at a glance. */
function CyclopsFace({ mood }: { mood: AvatarMood }) {
  const closed = mood === 'celebrate'
  const pupilY = mood === 'sad' ? 47 : 43
  const pupilX = mood === 'worried' ? 45 : 50
  return (
    <g>
      {mood === 'sad' && <path d="M36 26 L64 29" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      {mood === 'worried' && <path d="M36 27 Q50 22 64 27" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />}
      {closed ? (
        <path d="M36 44 Q50 32 64 44" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
      ) : (
        <g>
          <ellipse cx="50" cy="42" rx="13.5" ry="14.5" fill={EYE_WHITE} stroke={INK} strokeWidth="3" />
          <circle cx={pupilX} cy={pupilY} r="5" fill={INK} />
        </g>
      )}
      {MOUTHS[mood]}
    </g>
  )
}
