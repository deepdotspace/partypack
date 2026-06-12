import type { ChatMsg } from '../types'

/** Read-only recent-chat feed for the shared screen (bottom-right corner).
 *  Hard ink text-shadow so lines stay legible on the bright indigo burst. */
export function StageChat({ chat }: { chat: ChatMsg[] }) {
  const recent = chat.slice(-5)
  if (recent.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-10 w-80 max-w-[40vw] space-y-1 text-right">
      {recent.map((m) => (
        <div key={m.id} className="font-body text-base font-semibold leading-snug" style={{ textShadow: '0 1.5px 0 rgba(0,0,0,0.6)' }}>
          <span style={{ color: m.color || '#FFFDF5' }}>{m.name}:</span>{' '}
          <span className="text-[#FFFDF5]">{m.text}</span>
        </div>
      ))}
    </div>
  )
}
