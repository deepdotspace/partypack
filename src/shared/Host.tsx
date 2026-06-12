import { memo, type ReactNode } from 'react'

/**
 * The Party Pack host — a slightly untrustworthy neon TV-headed emcee (our
 * "QBit"). Reactive expression per phase; idle breathe + antenna-bulb pulse.
 * Flat fills for mobile FPS (skribbl's lesson). Reduced-motion → static.
 */
export type Mood = 'idle' | 'excited' | 'thinking' | 'sly' | 'laugh' | 'shock' | 'proud' | 'celebrate'

const ACCENT = '#C6FF3D'

export const Host = memo(HostImpl)

function HostImpl({ mood = 'idle', size = 140 }: { mood?: Mood; size?: number }) {
  const eyes = EYES[mood] ?? EYES.idle
  const mouth = MOUTHS[mood] ?? MOUTHS.idle

  // Idle bob + antenna blinks are CSS keyframes (compositor; reduced-motion
  // handled by the stylesheet media query). The old drop-shadow filter sat ON
  // the bobbing element, which re-ran the blur every frame; the glow is now a
  // static pre-blurred radial gradient behind the SVG, which composites free.
  return (
    <div className="anim-bob relative" style={{ width: size, height: size }}>
      <div
        aria-hidden
        className="absolute"
        style={{
          inset: '-18%',
          background: `radial-gradient(circle, ${ACCENT}2e 0%, transparent 62%)`,
        }}
      />
      <svg className="relative" viewBox="0 0 120 120" width={size} height={size}>
        {/* antennae */}
        <line x1="42" y1="22" x2="34" y2="6" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
        <line x1="78" y1="22" x2="86" y2="6" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
        <circle className="anim-blink" cx="34" cy="6" r="4" fill="#FFD23F" />
        <circle className="anim-blink-alt" cx="86" cy="6" r="4" fill="#FF3D8A" />
        {/* TV body */}
        <rect x="14" y="22" width="92" height="80" rx="20" fill="#241544" stroke={ACCENT} strokeWidth="4" />
        {/* screen */}
        <rect x="24" y="32" width="72" height="60" rx="14" fill="#15102b" />
        {/* eyes */}
        {eyes}
        {/* mouth */}
        {mouth}
      </svg>
    </div>
  )
}

const C = '#FFF7ED'
const EYES: Record<Mood, ReactNode> = {
  idle: (
    <g fill={C}>
      <circle cx="46" cy="56" r="7" /><circle cx="74" cy="56" r="7" />
      <circle cx="46" cy="57" r="3" fill="#15102b" /><circle cx="74" cy="57" r="3" fill="#15102b" />
    </g>
  ),
  excited: (
    <g fill={C}>
      <circle cx="46" cy="55" r="8" /><circle cx="74" cy="55" r="8" />
      <circle cx="46" cy="55" r="3.5" fill="#15102b" /><circle cx="74" cy="55" r="3.5" fill="#15102b" />
    </g>
  ),
  thinking: (
    <g stroke={C} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M40 58 q6 -6 12 0" /><path d="M68 58 q6 -6 12 0" />
    </g>
  ),
  sly: (
    <g stroke={C} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M40 56 h12" /><path d="M68 56 h12" />
    </g>
  ),
  laugh: (
    <g stroke={C} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M40 58 q6 -8 12 0" /><path d="M68 58 q6 -8 12 0" />
    </g>
  ),
  shock: (
    <g fill={C}>
      <circle cx="46" cy="55" r="9" /><circle cx="74" cy="55" r="9" />
      <circle cx="46" cy="55" r="3" fill="#15102b" /><circle cx="74" cy="55" r="3" fill="#15102b" />
    </g>
  ),
  proud: (
    <g stroke={C} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M40 56 q6 -6 12 0" /><path d="M68 56 q6 -6 12 0" />
    </g>
  ),
  celebrate: (
    <g fill="#FFD23F">
      <path d="M46 48 l2.5 5 5.5 .8 -4 4 1 5.5 -5-2.7 -5 2.7 1-5.5 -4-4 5.5-.8z" />
      <path d="M74 48 l2.5 5 5.5 .8 -4 4 1 5.5 -5-2.7 -5 2.7 1-5.5 -4-4 5.5-.8z" />
    </g>
  ),
}

const MOUTHS: Record<Mood, ReactNode> = {
  idle: <path d="M48 76 q12 8 24 0" stroke={ACCENT} strokeWidth="3.5" fill="none" strokeLinecap="round" />,
  excited: <path d="M46 74 q14 14 28 0 q-14 6 -28 0z" fill={ACCENT} />,
  thinking: <circle cx="60" cy="78" r="4" fill={ACCENT} />,
  sly: <path d="M46 78 q16 4 28 -4" stroke={ACCENT} strokeWidth="3.5" fill="none" strokeLinecap="round" />,
  laugh: <path d="M44 72 q16 18 32 0 q-16 8 -32 0z" fill="#FF5E7A" />,
  shock: <ellipse cx="60" cy="80" rx="7" ry="9" fill="#15102b" stroke={ACCENT} strokeWidth="3" />,
  proud: <path d="M48 76 q12 8 24 0" stroke="#FFD23F" strokeWidth="3.5" fill="none" strokeLinecap="round" />,
  celebrate: <path d="M44 72 q16 18 32 0 q-16 8 -32 0z" fill="#FFD23F" />,
}
