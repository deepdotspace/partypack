import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Emote } from './types'

interface Float {
  id: string
  emoji: string
  x: number
}

/**
 * Floating emoji reactions — diffs the broadcast emote ring, spawns each new one
 * as a rising/fading emoji on the shared screen. Pointer-events-none overlay.
 */
export function Emotes({ emotes }: { emotes: Emote[] }) {
  const [floats, setFloats] = useState<Float[]>([])
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    const now = Date.now()
    for (const e of emotes) {
      if (seen.current.has(e.id)) continue
      seen.current.add(e.id)
      if (now - e.ts > 6000) continue // ignore backlog on first load
      const x = 8 + Math.random() * 84
      setFloats((f) => [...f, { id: e.id, emoji: e.emoji, x }])
      setTimeout(() => setFloats((f) => f.filter((ff) => ff.id !== e.id)), 2600)
    }
  }, [emotes])

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <AnimatePresence>
        {floats.map((f) => (
          <motion.div
            key={f.id}
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{ y: -260, opacity: [0, 1, 1, 0], scale: 1.25, rotate: [0, -8, 8, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: 'easeOut' }}
            className="absolute bottom-28 text-5xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            style={{ left: `${f.x}%` }}
          >
            {f.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
