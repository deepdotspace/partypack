/**
 * ScoreRows — the standings board (fibbagexl-scores ref): every player gets a
 * full-width row in THEIR color, ink name on the left, an optional white
 * answer pill in the middle, and a big tabular score on the right. Rows are
 * sorted by score (desc) inside and FLIP re-rank with a spring when the
 * order changes; scores count up when they grow (pass `delta` to also stamp
 * a "+N"). Reduced-motion: no FLIP travel, numbers snap.
 */
import { useEffect } from 'react'
import { LayoutGroup, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { rerankSpring } from './motion'

export interface ScoreRowData {
  /** Stable key (userId). */
  id: string
  name: string
  /** Player roster color (the row's background). */
  color: string
  score: number
  /** Optional centered white pill — e.g. this round's answer. */
  answer?: string
  /** Points just gained — stamps a "+N" beside the score. */
  delta?: number
  you?: boolean
}

export function ScoreRows({ rows, className = '' }: { rows: ScoreRowData[]; className?: string }) {
  const reduce = useReducedMotion()
  const sorted = [...rows].sort((a, b) => b.score - a.score)
  return (
    <LayoutGroup>
      <div className={`flex w-full flex-col gap-1.5 ${className}`}>
        {sorted.map((r) => (
          <motion.div
            key={r.id}
            layout={reduce ? false : 'position'}
            transition={rerankSpring}
            data-testid={`score-row-${r.id}`}
            className="flex w-full items-center gap-3 border-y-[3px] border-[#131313] px-4 py-2.5 sm:px-6"
            style={{ backgroundColor: r.color, boxShadow: '0 4px 0 rgba(0,0,0,0.3)' }}
          >
            <span className="min-w-0 flex-1 truncate font-display text-lg uppercase text-[#131313] sm:text-2xl">
              {r.name}
              {r.you ? ' ★' : ''}
            </span>
            {r.answer && (
              <span
                className="hidden max-w-[45%] truncate rounded-md border-2 border-[#131313] bg-[#FFFDF5] px-3 py-1 font-marker text-sm text-[#1A1A1A] sm:block sm:text-base"
                style={{ boxShadow: '2.5px 2.5px 0 rgba(0,0,0,0.35)' }}
              >
                {r.answer}
              </span>
            )}
            {r.delta != null && r.delta !== 0 && (
              <motion.span
                initial={reduce ? { opacity: 0 } : { scale: 2, opacity: 0, rotate: -10 }}
                animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1, rotate: -4 }}
                transition={{ type: 'spring', stiffness: 700, damping: 16 }}
                className="shrink-0 bg-[#131313] px-2 py-0.5 font-display text-sm text-[#FFFDF5] sm:text-base"
              >
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </motion.span>
            )}
            <CountUpScore value={r.score} />
          </motion.div>
        ))}
      </div>
    </LayoutGroup>
  )
}

/** Big right-aligned score that rolls up to new values. */
function CountUpScore({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString())
  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const c = animate(mv, value, { duration: 0.8, ease: 'easeOut' })
    return () => c.stop()
  }, [value, reduce, mv])
  return (
    <motion.span className="w-[4.5ch] shrink-0 text-right font-display text-xl tabular-nums text-[#131313] sm:text-3xl">
      {text}
    </motion.span>
  )
}
