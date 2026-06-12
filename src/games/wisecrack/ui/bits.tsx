/**
 * bits — Wisecrack-only building blocks for the indigo-burst world skin.
 * Game-specific assemblies of the shared v2 language (ContentCard / Banner /
 * NamePlate / Avatar): the logo lockup, big outlined display type, the vote
 * "or" badge, reveal stamps and count badges. Shared primitives stay in
 * src/shared — nothing here is consumed outside src/games/wisecrack.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { GameState } from '../types'
import { popIn, slamFrom, stampIn } from '../../../shared/motion'
import { sound } from '../../../shared/sound'

export const INK = '#131313'
export const CREAM = '#FFFDF5'
export const LIME = '#C6FF3D'
export const GOLD = '#FFD23F'
export const SIREN = '#FF3B3B'

/** Stable avatar seat for a player: join-order index (spectators fall back
 *  to their joinedOrder, since they're not in `order`). */
export function seatOf(s: GameState, userId: string): number {
  const i = s.order.indexOf(userId)
  return i >= 0 ? i : (s.players[userId]?.joinedOrder ?? 0)
}

/** True after `ms` (immediately when ms <= 0) — sequences TV reveal beats. */
export function useAfter(ms: number): boolean {
  const [on, setOn] = useState(ms <= 0)
  useEffect(() => {
    if (ms <= 0) {
      setOn(true)
      return
    }
    const t = setTimeout(() => setOn(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return on
}

/** Big system display type straight on the burst (quiplash1-write-prompt's
 *  hero text): cream Archivo with a hard ink drop so it reads on indigo. */
export function DisplayText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`font-display uppercase leading-tight text-[#FFFDF5] ${className}`}
      style={{ textShadow: '0 3px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.3)' }}
    >
      {children}
    </p>
  )
}

/** Slide-slam entrance from a side (reduced-motion: fade). */
export function Slam({ dir, children, className = '' }: { dir: 'left' | 'right'; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={reduce ? undefined : slamFrom(dir)}
      initial={reduce ? { opacity: 0 } : 'hidden'}
      animate={reduce ? { opacity: 1 } : 'show'}
    >
      {children}
    </motion.div>
  )
}

/** The circular "or" badge between two dueling answer cards (quiplash2-vote). */
export function OrBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 border-[#131313] bg-[#C6FF3D] ${className}`}
      style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.4)' }}
    >
      <span className="font-display text-xl lowercase text-[#131313]">or</span>
    </div>
  )
}

/** QUIPLASH! / JINX! verdict stamp — ink slab, accent border + letters,
 *  overshoot slam + stamp SFX on mount. */
export function StampBadge({ text, color = LIME, className = '' }: { text: string; color?: string; className?: string }) {
  const reduce = useReducedMotion()
  useEffect(() => {
    sound.stamp()
  }, [])
  return (
    <motion.div
      variants={reduce ? undefined : stampIn}
      initial={reduce ? { opacity: 0 } : 'hidden'}
      animate={reduce ? { opacity: 1 } : 'show'}
      className={`inline-block border-4 bg-[#131313] px-6 py-2 font-display uppercase ${className}`}
      style={{ borderColor: color, color, boxShadow: '5px 5px 0 rgba(0,0,0,0.4)' }}
    >
      {text}
    </motion.div>
  )
}

/** Big black circle vote tally beside a reveal card (quiplash2-vote-results). */
export function CountBadge({ n, className = '' }: { n: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      variants={reduce ? undefined : popIn}
      initial={reduce ? { opacity: 0 } : 'hidden'}
      animate={reduce ? { opacity: 1 } : 'show'}
      className={`grid h-16 w-16 place-items-center rounded-full bg-[#131313] ${className}`}
      style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.4)' }}
    >
      <span className="font-display text-2xl text-[#FFFDF5] tabular-nums">{n}</span>
    </motion.div>
  )
}

/** 2px ink letter-outline for accent display type sitting on white paper. */
const INK_OUTLINE = [
  `2px 2px 0 ${INK}`, `-2px 2px 0 ${INK}`, `2px -2px 0 ${INK}`, `-2px -2px 0 ${INK}`,
  `2px 0 0 ${INK}`, `-2px 0 0 ${INK}`, `0 2px 0 ${INK}`, `0 -2px 0 ${INK}`,
].join(', ')

/** The lobby centerpiece — a white speech-bubble logo block (quiplash1-lobby's
 *  shattered-bubble lockup): ink border, gold stamp edge, lime outlined
 *  wordmark, paper-cut tail. */
export function LogoLockup({ tagline }: { tagline?: string }) {
  return (
    <div className="relative" style={{ rotate: '-2deg' }}>
      <div
        className="rounded-2xl border-4 border-[#131313] bg-[#FFFDF5] p-3"
        style={{ boxShadow: '8px 8px 0 rgba(0,0,0,0.45)' }}
      >
        <div className="rounded-lg border-[3px] border-[#FFD23F] px-6 py-3 text-center sm:px-8">
          <span
            className="font-display text-4xl uppercase leading-none tracking-tight text-[#C6FF3D] sm:text-5xl"
            style={{ textShadow: INK_OUTLINE }}
          >
            Wisecrack
          </span>
          {tagline && (
            <p className="mt-2 font-body text-[11px] font-bold uppercase tracking-[0.22em] text-[#131313]">
              {tagline}
            </p>
          )}
        </div>
      </div>
      {/* speech tail — overlaps the card border so the joint reads as one cut */}
      <svg className="absolute -bottom-[19px] left-12" width="36" height="26" aria-hidden>
        <polygon points="3,1 33,1 10,24" fill="#FFFDF5" stroke="#131313" strokeWidth="4" strokeLinejoin="round" />
        <rect x="6" y="0" width="24" height="4" fill="#FFFDF5" />
      </svg>
    </div>
  )
}
