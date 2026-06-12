/**
 * Backdrop — the layered "LATE NIGHT" scene behind every screen, so nothing
 * renders on a flat fill. Vignette + sunburst spotlight + neon bokeh + film
 * grain. STATIC by design: it's painted once and costs nothing per frame —
 * animating large blurred layers re-rasterizes the blur every frame and was a
 * source of jank. The "alive" feeling comes from in-game motion + transitions.
 */

const DOTS = [
  { top: '8%', left: '6%', size: 300, color: 'rgba(198,255,61,0.24)' },   // lime
  { top: '60%', left: '82%', size: 340, color: 'rgba(255,180,61,0.22)' }, // amber
  { top: '78%', left: '12%', size: 240, color: 'rgba(255,138,61,0.20)' }, // tangerine
  { top: '14%', left: '84%', size: 220, color: 'rgba(255,61,138,0.18)' }, // ember-pink
] as const

// Tiny self-contained SVG grain (feTurbulence), data-URI'd.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base vignette — brighter plum overhead falling to near-black at the edges. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(125% 95% at 50% -12%, #2a1c10 0%, #181208 48%, #0b0805 100%)' }}
      />
      {/* Sunburst spotlight behind the hero zone (static). */}
      <div
        className="absolute left-1/2 top-[-22%] h-[80vh] w-[80vh] -translate-x-1/2 rounded-full blur-[50px]"
        style={{ background: 'radial-gradient(circle, rgba(198,255,61,0.18) 0%, rgba(255,180,61,0.12) 40%, transparent 70%)' }}
      />
      {/* Neon bokeh (static). */}
      {DOTS.map((d, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-[55px]"
          style={{ top: d.top, left: d.left, width: d.size, height: d.size, background: d.color }}
        />
      ))}
      {/* Film grain. */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-soft-light"
        style={{ backgroundImage: GRAIN, backgroundSize: '160px 160px' }}
      />
    </div>
  )
}
