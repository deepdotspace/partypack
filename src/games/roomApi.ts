/**
 * Shared client-side room plumbing types. The route (pages/play, pages/stage)
 * owns the single `useGameRoom` connection — it needs `state.game` to pick the
 * game UI — and passes the live room object down to the mounted game view, so
 * a game's hook (e.g. useWisecrack) wraps the SAME socket instead of opening a
 * second one.
 */
import type { useGameRoom } from 'deepspace'

export type RoomApi = ReturnType<typeof useGameRoom>

/** Props every game's lazy Stage / Play view receives from the route. */
export interface GameViewProps {
  /** Normalized 4-letter room code (also the GameRoom id). */
  code: string
  /** The route-owned live room connection. */
  room: RoomApi
}
