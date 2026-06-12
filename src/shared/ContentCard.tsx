/**
 * ContentCard — THE white card (quiplash2-vote ref). Player content always
 * lives on cream-white paper with a thick ink border, a hard offset shadow,
 * and a visible tilt — never dark-on-dark. Text defaults to handwritten
 * marker ink: the `font-marker` Tailwind utility (from the `--font-marker`
 * token in styles.css) is applied here, so children just write text; switch
 * a child back to `font-body` / `font-display` for system text on a card.
 *
 * `as="button"` turns it into a ballot: tactile press scale, and when
 * `selected` an accent ring on top of the hard shadow.
 */
import type { CSSProperties, ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { snappy } from './motion'

const HARD_SHADOW = '6px 6px 0 rgba(0,0,0,0.45)'

export function ContentCard({
  children,
  tilt = 0,
  as = 'div',
  onClick,
  selected = false,
  accent = '#FFD23F',
  disabled = false,
  className = '',
  style,
  testId,
}: {
  children: ReactNode
  /** Degrees — give neighbors opposing tilts (e.g. -2 / 1.5). */
  tilt?: number
  as?: 'div' | 'button'
  onClick?: () => void
  /** Ballot state — paints the accent ring. */
  selected?: boolean
  /** Ring color when selected (player/game accent hex). */
  accent?: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
  testId?: string
}) {
  const reduce = useReducedMotion()
  const base: CSSProperties = {
    backgroundColor: '#FFFDF5',
    border: '4px solid #131313',
    color: '#1A1A1A',
    rotate: reduce ? '0deg' : `${tilt}deg`,
    boxShadow: selected ? `${HARD_SHADOW}, 0 0 0 5px ${accent}` : HARD_SHADOW,
    ...style,
  }
  const cls = `rounded-xl font-marker ${className}`

  if (as === 'button') {
    return (
      <motion.button
        type="button"
        data-testid={testId}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        whileTap={disabled || reduce ? undefined : { scale: 0.96, rotate: 0 }}
        whileHover={disabled || reduce ? undefined : { scale: 1.02 }}
        transition={snappy}
        className={`${cls} text-left disabled:opacity-50`}
        style={base}
      >
        {children}
      </motion.button>
    )
  }
  return (
    <div data-testid={testId} className={cls} style={base}>
      {children}
    </div>
  )
}
