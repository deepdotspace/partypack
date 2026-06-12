import type { ChatMsg } from '../types'

/** Read-only recent-chat feed for the shared screen (bottom-right corner) —
 *  an ink slab so chat stays readable on the gold world. */
export function StageChat({ chat }: { chat: ChatMsg[] }) {
  const recent = chat.slice(-5)
  if (recent.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-10 w-80 max-w-[40vw] space-y-1 bg-[#131313]/85 px-3.5 py-2.5 text-right"
      style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.3)' }}
    >
      {recent.map((m) => (
        <div key={m.id} className="font-body text-base leading-snug">
          <span className="font-semibold" style={{ color: m.color || '#b8a6c9' }}>
            {m.name}:
          </span>{' '}
          <span className="text-[#FFFDF5]/90">{m.text}</span>
        </div>
      ))}
    </div>
  )
}
