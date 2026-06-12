/**
 * PlayerToken — the lobby/roster unit (quiplash1-lobby ref): a cutout Avatar
 * perched on a black NamePlate (white Archivo Black uppercase). The plate
 * alternates a ±1.5° tilt by seat so a ring of players reads hand-pinned.
 */
import { Avatar, type AvatarMood } from './Avatar'

const SIZES = {
  sm: { avatar: 36, plate: 'px-2 py-0.5 text-[10px] min-w-[3.5rem] max-w-[6rem]', overlap: '-mt-1' },
  md: { avatar: 60, plate: 'px-3 py-1 text-sm min-w-[5.5rem] max-w-[8.5rem]', overlap: '-mt-1.5' },
  lg: { avatar: 88, plate: 'px-4 py-1.5 text-base min-w-[7rem] max-w-[10rem]', overlap: '-mt-2' },
} as const

export function PlayerToken({
  name,
  color,
  seat,
  mood = 'idle',
  size = 'md',
  you = false,
}: {
  name: string
  color: string
  seat: number
  mood?: AvatarMood
  size?: keyof typeof SIZES
  you?: boolean
}) {
  const s = SIZES[size]
  const tilt = seat % 2 === 0 ? -1.5 : 1.5
  return (
    <div className="flex flex-col items-center">
      <Avatar seat={seat} color={color} mood={mood} size={s.avatar} />
      <NamePlate tilt={tilt} className={`${s.plate} ${s.overlap}`}>
        {name}
        {you ? ' ★' : ''}
      </NamePlate>
    </div>
  )
}

/** The black name slab — also usable standalone (e.g. authors under cards). */
export function NamePlate({
  children,
  tilt = -1.5,
  className = '',
}: {
  children: React.ReactNode
  tilt?: number
  className?: string
}) {
  return (
    <span
      className={`z-10 block truncate bg-[#131313] text-center font-display uppercase tracking-wide text-[#FFFDF5] ${className}`}
      style={{ rotate: `${tilt}deg`, boxShadow: '2.5px 2.5px 0 rgba(0,0,0,0.35)' }}
    >
      {children}
    </span>
  )
}
