/**
 * PlayerBadge — a colored avatar pip + name. Color = identity (the fixed roster
 * assigned by the engine). Reused on Stage and Controller.
 */
interface PlayerBadgeProps {
  name: string
  color: string
  you?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: { box: 'h-9 w-9 text-base', label: 'text-xs' },
  md: { box: 'h-14 w-14 text-2xl', label: 'text-sm' },
  lg: { box: 'h-20 w-20 text-4xl', label: 'text-base' },
}

export function PlayerBadge({ name, color, you = false, size = 'md' }: PlayerBadgeProps) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const s = SIZES[size]
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`grid place-items-center rounded-full font-display text-velvet ${s.box}`}
        style={{ backgroundColor: color, boxShadow: `0 0 22px ${color}66` }}
      >
        {initial}
      </div>
      <span className={`max-w-[7rem] truncate font-body font-semibold ${s.label} ${you ? 'text-lime' : 'text-stage'}`}>
        {name}
        {you ? ' (you)' : ''}
      </span>
    </div>
  )
}
