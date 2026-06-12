/**
 * TimerBadge — the corner countdown as a tilted ink diamond with the seconds
 * inside (quiplash2-vote's "15"). Display-only: the server still owns phase
 * transitions and the existing Stage countTick/buzzer SFX hooks stay at their
 * call sites untouched. Under 10s the diamond turns siren red and pulses
 * (reduced-motion: color change only). Renders nothing when there's no clock.
 */
import { motion, useReducedMotion } from 'framer-motion'
import { useCountdown } from './Timer'

export function TimerBadge({
  endsAt,
  size = 64,
  className = '',
}: {
  /** Server epoch ms the phase ends at (null/Infinity → hidden). */
  endsAt: number | null
  /** Box size in px (the diamond is this square, rotated 45°). */
  size?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const secs = useCountdown(endsAt)
  if (!Number.isFinite(secs)) return null
  const urgent = secs <= 10

  return (
    <motion.div
      data-testid="timer-badge"
      className={`grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      animate={!reduce && urgent ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={!reduce && urgent ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
    >
      <div
        className="grid h-[72%] w-[72%] rotate-45 place-items-center rounded-[6px]"
        style={{
          backgroundColor: urgent ? '#FF3B3B' : '#131313',
          boxShadow: '3.5px 3.5px 0 rgba(0,0,0,0.4)',
          transition: 'background-color 0.25s',
        }}
      >
        <span
          className="-rotate-45 font-display tabular-nums leading-none text-[#FFFDF5]"
          style={{ fontSize: size * 0.34 }}
        >
          {secs}
        </span>
      </div>
    </motion.div>
  )
}
