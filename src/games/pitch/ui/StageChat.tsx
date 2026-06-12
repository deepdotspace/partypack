import type { ChatMsg } from '../types'

/** Read-only recent-chat feed for the shared screen (bottom-right corner).
 *  Each line rides a little ink chip so chat stays readable on the blueprint
 *  world (text never sits raw on the green). */
export function StageChat({ chat }: { chat: ChatMsg[] }) {
  const recent = chat.slice(-5)
  if (recent.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-10 flex w-80 max-w-[40vw] flex-col items-end gap-1 text-right">
      {recent.map((m) => (
        <div key={m.id} className="rounded-sm bg-[#131313]/85 px-2 py-0.5 font-body text-base leading-snug">
          <span className="font-semibold" style={{ color: m.color || '#b8a6c9' }}>
            {m.name}:
          </span>{' '}
          <span className="text-[#FFFDF5]/95">{m.text}</span>
        </div>
      ))}
    </div>
  )
}
