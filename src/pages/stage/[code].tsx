/**
 * /stage/:code — the TV (Stage) route. Pure display: it never JOINs, so it
 * can't bind a fresh room itself — but a valid `?g=` still renders that game's
 * lobby while phones arrive. Dispatch lives in the shared GameRoute.
 */
import { GameRoute } from '../../games/GameRoute'

export default function StagePage() {
  return <GameRoute role="stage" />
}
