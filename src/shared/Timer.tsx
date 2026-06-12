import { useEffect, useState } from 'react'

/**
 * Countdown derived from the server's epoch `phaseEndsAt`. Display-only — the
 * server is the source of truth for transitions; this just shows the clock.
 */
export function useCountdown(endsAt: number | null): number {
  const [, force] = useState(0)
  useEffect(() => {
    if (endsAt == null) return
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [endsAt])
  if (endsAt == null) return Infinity
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
}

export function TimerRing({ endsAt, total }: { endsAt: number | null; total: number }) {
  const secs = useCountdown(endsAt)
  if (!Number.isFinite(secs)) return null
  const frac = total > 0 ? Math.min(1, secs / total) : 0
  const urgent = secs <= 5
  return (
    <div className="flex items-center gap-2 font-display text-2xl" style={{ color: urgent ? '#FF4D3D' : '#FFB43D' }}>
      <div className="relative h-3 w-32 overflow-hidden rounded-full bg-plum">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-linear"
          style={{ width: `${frac * 100}%`, backgroundColor: urgent ? '#FF4D3D' : '#FFB43D' }}
        />
      </div>
      <span className="tabular-nums">{secs}</span>
    </div>
  )
}
