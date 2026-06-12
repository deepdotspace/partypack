/**
 * Banner — the tilted black strip system text rides on (fibbage3-board's
 * question slab). White/cream bold grotesque on near-black ink; readable on
 * ANY world color, which is exactly its job. Full-width by default; size it
 * with className (px/py/text-*).
 */
import type { ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'

export function Banner({
  children,
  tilt = -1.2,
  className = '',
  testId,
}: {
  children: ReactNode
  /** Degrees. */
  tilt?: number
  className?: string
  testId?: string
}) {
  const reduce = useReducedMotion()
  return (
    <div
      data-testid={testId}
      className={`bg-[#141414] px-6 py-3.5 font-display text-[#FFFDF5] ${className}`}
      style={{
        rotate: reduce ? '0deg' : `${tilt}deg`,
        boxShadow: '5px 5px 0 rgba(0,0,0,0.4)',
        backgroundImage: 'radial-gradient(120% 100% at 50% 0%, rgba(255,255,255,0.07), transparent 70%)',
      }}
    >
      {children}
    </div>
  )
}
