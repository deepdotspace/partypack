/**
 * /play/:code — the phone (Controller) route. `?g=<GameId>` lets the first
 * JOIN bind a fresh room to that game; joiners without it follow the
 * broadcast's `state.game`. All logic lives in the shared GameRoute dispatcher.
 */
import { GameRoute } from '../../games/GameRoute'

export default function PlayPage() {
  return <GameRoute role="play" />
}
