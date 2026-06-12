/**
 * VoterTags — the physical reveal beat (quiplash2i-quiplash-reveal ref):
 * everyone who voted for a card FLIES IN as a mini avatar + nameplate and
 * piles along the card's TOP edge, one landing every ~0.5-0.8s with a pop.
 * Position it inside a `relative` ContentCard wrapper; it pins itself to the
 * top edge. Reduced-motion: tags appear at once (single pop).
 */
import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Avatar } from './Avatar'
import { NamePlate } from './PlayerToken'
import { tagLand } from './motion'
import { sound } from './sound'

export interface VoterTag {
  name: string
  color: string
  seat: number
}

/** Cumulative landing delays — gaps cycle 0.5/0.6/0.7/0.8s, deterministic. */
function delaysFor(n: number): number[] {
  const out: number[] = []
  let t = 0.15
  for (let i = 0; i < n; i++) {
    out.push(t)
    t += 0.5 + ((i * 37) % 4) * 0.1
  }
  return out
}

export function VoterTags({ voters, className = '' }: { voters: VoterTag[]; className?: string }) {
  const reduce = useReducedMotion()
  const delays = useMemo(() => delaysFor(voters.length), [voters.length])

  // One pop per landing (a single pop up front under reduced motion).
  useEffect(() => {
    if (voters.length === 0) return
    if (reduce) {
      sound.pop()
      return
    }
    const ids = delays.map((d) => setTimeout(() => sound.pop(), d * 1000))
    return () => ids.forEach(clearTimeout)
  }, [voters.length, delays, reduce])

  if (voters.length === 0) return null

  return (
    <div
      data-testid="voter-tags"
      className={`pointer-events-none absolute inset-x-2 bottom-full z-10 flex translate-y-2.5 flex-wrap-reverse items-end justify-center ${className}`}
    >
      {voters.map((v, i) => (
        <motion.div
          key={`${v.seat}-${v.name}`}
          className="-mx-1.5 flex flex-col items-center"
          initial={reduce ? { opacity: 0 } : { y: -90, opacity: 0, scale: 0.5, rotate: i % 2 === 0 ? -14 : 12 }}
          animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1, rotate: i % 2 === 0 ? -3 : 2 }}
          transition={reduce ? { duration: 0.2 } : { ...tagLand, delay: delays[i] }}
        >
          <Avatar seat={v.seat} color={v.color} mood="happy" size={30} />
          <NamePlate tilt={i % 2 === 0 ? -2 : 2} className="-mt-1 max-w-[7rem] px-1.5 py-px text-[9px]">
            {v.name}
          </NamePlate>
        </motion.div>
      ))}
    </div>
  )
}
