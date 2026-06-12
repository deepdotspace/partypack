/**
 * useSoloBots — the "PLAY SOLO" landing path. The landing sends solo players
 * to `/play/CODE?g=<id>&bots=1`; when the arriving player becomes HOST of a
 * LOBBY, this calls the game's `fill()` (its existing fill-with-bots action)
 * exactly once, so the room auto-populates with AI players. The URL is read
 * once at mount; later phase/host changes never re-trigger.
 */
import { useEffect, useRef, useState } from 'react'

export function useSoloBots(isHost: boolean, phase: string, fill: () => void): void {
  const [wantBots] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('bots') === '1',
  )
  const fired = useRef(false)
  const fillRef = useRef(fill)
  fillRef.current = fill

  useEffect(() => {
    if (!wantBots || fired.current) return
    if (isHost && phase === 'LOBBY') {
      fired.current = true
      fillRef.current()
    }
  }, [wantBots, isHost, phase])
}
