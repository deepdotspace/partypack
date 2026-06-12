/**
 * GameRoute — the shared dispatcher behind /play/:code and /stage/:code.
 *
 * Owns the single useGameRoom connection and picks which game's UI to mount:
 *   - `state.game` is a registered GameId → that game's view (joiner path —
 *     no `?g=` needed; the broadcast carries the binding).
 *   - state is the `{ game: null }` pre-state (fresh, unbound room) → a valid
 *     `?g=<GameId>` renders that game's view (the first JOIN binds the room);
 *     without one, the room genuinely doesn't exist → "Room not found".
 *   - no state snapshot yet → branded loading.
 *
 * The route also powers the DO tick loop on connect so a fresh room broadcasts
 * its pre-state even before any game view mounts (the Stage never JOINs).
 */
import { Suspense, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useGameRoom } from 'deepspace'
import { isValidRoomCode, normalizeRoomCode } from '../shared/roomCode'
import { isGameId, type GameId } from './registry'
import { VIEWS } from './views'
import { Backdrop } from '../shared/Backdrop'
import { Loading } from '../shared/shells'
import { Eyebrow } from '../shared/primitives'
import { Host } from '../shared/Host'
import type { ClientRole } from '../shared/identity'

export function GameRoute({ role }: { role: ClientRole }) {
  const params = useParams()
  const code = normalizeRoomCode(params.code ?? '')
  // Reject junk codes BEFORE mounting the room hook — connecting would
  // materialize a Durable Object for a room that can't exist.
  if (!isValidRoomCode(code)) return <NotFound />
  return <ConnectedRoute code={code} role={role} />
}

function ConnectedRoute({ code, role }: { code: string; role: ClientRole }) {
  const room = useGameRoom(code)
  const [searchParams] = useSearchParams()
  const g = searchParams.get('g')
  const queryGame: GameId | null = isGameId(g) ? g : null

  // Power the tick loop (idempotent) so the pre-state / current state flows.
  useEffect(() => {
    if (room.connected && room.canWrite) room.startGame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.connected, room.canWrite])

  const raw = room.state as Record<string, unknown>
  // undefined = no snapshot yet; null = unbound pre-state; string = bound game.
  const bound: unknown = raw && 'game' in raw ? raw.game : undefined
  const gameId: GameId | null = isGameId(bound) ? bound : queryGame

  if (gameId) {
    const View = role === 'stage' ? VIEWS[gameId].Stage : VIEWS[gameId].Play
    return (
      <Suspense fallback={<Loading />}>
        <View code={code} room={room} />
      </Suspense>
    )
  }
  if (bound === null) return <NotFound code={code} />
  return <Loading label="Finding the room…" />
}

/** Dead code / unbound room — offer the way home. */
function NotFound({ code }: { code?: string }) {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <Backdrop />
      <Host mood="shock" size={110} />
      <Eyebrow className="mt-6">No show tonight</Eyebrow>
      <h1 data-testid="room-not-found" className="mt-2 font-display text-5xl uppercase text-stage">
        Room not found
      </h1>
      <p className="mt-3 max-w-sm font-body text-smoke">
        {code ? (
          <>
            Nothing's playing at <span className="font-semibold text-gold">{code}</span>. Check the code on the host's
            screen, or start a fresh room.
          </>
        ) : (
          'That code doesn’t look right. Room codes are 4 letters.'
        )}
      </p>
      <Link
        to="/"
        data-testid="go-home"
        className="mt-8 inline-flex items-center justify-center rounded-[1.25rem] bg-gold px-8 py-4 font-display text-xl uppercase tracking-wide text-velvet transition-transform active:scale-95"
        style={{ boxShadow: 'var(--glow-gold)' }}
      >
        Go home
      </Link>
    </div>
  )
}
