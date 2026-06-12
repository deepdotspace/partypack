/**
 * Shared UI primitives — one consistent component language across every screen,
 * so the app reads as one premium product, not five hand-styled pages.
 * Built on the @theme tokens (surfaces, accents, glows) + motion.ts.
 */
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { pressable } from './motion'

type Accent = 'lime' | 'gold' | 'cyan' | 'magenta' | 'tangerine' | 'violet' | 'coral' | 'smoke'

const ACCENT_HEX: Record<Accent, string> = {
  lime: '#c6ff3d',
  gold: '#ffd23f',
  cyan: '#27e1ff',
  magenta: '#ff2e97',
  tangerine: '#ff8a3d',
  violet: '#9d5cff',
  coral: '#ff5e7a',
  smoke: '#b8a6c9',
}
const GLOW_VAR: Record<Accent, string> = {
  lime: 'var(--glow-lime)',
  gold: 'var(--glow-gold)',
  cyan: 'var(--glow-cyan)',
  magenta: 'var(--glow-magenta)',
  tangerine: 'var(--glow-tangerine)',
  violet: 'var(--glow-violet)',
  coral: 'var(--glow-coral)',
  smoke: 'none',
}

/** Small uppercase tracked label that sits above a hero ("eyebrow"). */
export function Eyebrow({ children, color = 'gold', className = '' }: { children: ReactNode; color?: Accent; className?: string }) {
  return (
    <p
      className={`font-body text-xs font-bold uppercase tracking-[0.32em] sm:text-sm ${className}`}
      style={{ color: ACCENT_HEX[color] }}
    >
      {children}
    </p>
  )
}

/** A raised surface card — hairline top border + soft shadow for real depth.
 *  `accent` adds a colored border; `glow` adds the focal neon glow (use sparingly). */
export function Card({
  children,
  accent,
  glow = false,
  className = '',
  style,
}: {
  children: ReactNode
  accent?: Accent
  glow?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const border = accent ? `2px solid ${ACCENT_HEX[accent]}` : '1px solid var(--color-border)'
  const boxShadow = glow && accent ? GLOW_VAR[accent] : '0 10px 30px rgba(0,0,0,0.35)'
  return (
    <div
      className={`rounded-[1.5rem] bg-[var(--color-surface-3)] ${className}`}
      style={{ border, boxShadow, ...style }}
    >
      {children}
    </div>
  )
}

/** The primary action / button language. variant: solid (hero CTA) | outline | ghost. */
export function NeonButton({
  children,
  onClick,
  disabled,
  variant = 'solid',
  color = 'lime',
  className = '',
  type = 'button',
  testId,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'solid' | 'outline' | 'ghost'
  color?: Accent
  className?: string
  type?: 'button' | 'submit'
  testId?: string
}) {
  const hex = ACCENT_HEX[color]
  const base =
    'inline-flex items-center justify-center rounded-[1.25rem] font-display uppercase tracking-wide transition-colors disabled:opacity-40 disabled:pointer-events-none'
  const styles: React.CSSProperties =
    variant === 'solid'
      ? { backgroundColor: hex, color: '#110c22', boxShadow: GLOW_VAR[color] }
      : variant === 'outline'
        ? { border: `2px solid ${hex}`, color: hex, backgroundColor: 'transparent' }
        : { color: hex, backgroundColor: 'transparent' }
  return (
    <motion.button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : pressable.whileTap}
      whileHover={disabled ? undefined : pressable.whileHover}
      transition={pressable.transition}
      className={`${base} ${className}`}
      style={styles}
    >
      {children}
    </motion.button>
  )
}

/** The phone (Controller) shell — a centered, phone-width column so content never
 *  stretches edge-to-edge on desktop. This is the fix for the "giant form" problem. */
export function PhoneShell({ children, className = '', testId, dataPhase }: { children: ReactNode; className?: string; testId?: string; dataPhase?: string }) {
  return (
    <div className="flex min-h-screen w-full justify-center" data-testid={testId} data-phase={dataPhase}>
      <div className={`flex w-full max-w-md flex-col px-5 pb-8 pt-16 ${className}`}>{children}</div>
    </div>
  )
}

/** The TV (Stage) shell — full-bleed, content centered with a wide max width. */
export function StageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-screen w-full flex-col items-center px-8 py-8 ${className}`}>
      <div className="flex w-full max-w-5xl flex-1 flex-col">{children}</div>
    </div>
  )
}

export { ACCENT_HEX }
