/**
 * useBaloney — thin typed wrapper over the route-owned game-room connection.
 *
 * Identity is ANONYMOUS (no sign-in): the server-stamped connection id isn't
 * visible to the client, so we mint a stable per-device `cid` in localStorage
 * (shared/identity — namespaced by role, so a Stage tab + a Play tab in one
 * browser stay distinct) and send it with JOIN. "me" is the broadcast player
 * whose `cid` matches ours — which survives reconnects (the engine rebinds the
 * seat by cid). Actions (submit/vote/host) are authorized by the trusted
 * server-stamped userId.
 *
 * Room binding: JOIN always carries `game: 'baloney'` — on a fresh (unbound)
 * room the hub DO uses it to bind the room to this engine; on a bound room the
 * engine ignores it.
 *
 * Role: 'stage' = the shared TV (pure display, never seats); 'play' = a phone.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { RoomApi } from '../roomApi'
import { readCid, readStoredColor, readStoredName, storeColor, storeName, type ClientRole } from '../../shared/identity'
import type { ChatMsg, Emote, GameConfig, GameState, PlayerState } from './types'

export interface Baloney {
  role: ClientRole
  connected: boolean
  cid: string
  myId: string | null
  myName: string
  state: GameState | null
  joined: boolean
  isHost: boolean
  me: PlayerState | null
  /** Seated players (host + contestants) in join order. */
  players: PlayerState[]
  chat: ChatMsg[]
  emotes: Emote[]
  send: {
    join: (name: string) => void
    setConfig: (c: Partial<GameConfig>) => void
    start: () => void
    skip: () => void
    submitLie: (text: string) => void
    vote: (optionId: string) => void
    kick: (userId: string) => void
    addBot: () => void
    removeBot: (userId?: string) => void
    setColor: (color: string) => void
    chat: (text: string) => void
    emote: (emoji: string) => void
    playAgain: () => void
  }
  raw: RoomApi
}

export function useBaloney(room: RoomApi, code: string, role: ClientRole): Baloney {
  const cid = useMemo(() => readCid(role), [role])

  // Only a state already bound to THIS game (phase present) is a GameState;
  // the `{ game: null }` pre-state and the empty initial snapshot are not.
  const state: GameState | null =
    room.state &&
    (room.state as { game?: unknown }).game === 'baloney' &&
    typeof (room.state as { phase?: unknown }).phase === 'string'
      ? (room.state as unknown as GameState)
      : null

  const players = useMemo(
    () => (state ? state.order.map((id) => state.players[id]).filter(Boolean) : []),
    [state],
  )
  // "me" must scan ALL players (spectators aren't in `order`), or a spectator
  // never recognizes themselves and gets stuck on the join screen.
  const me = useMemo(
    () => (state ? Object.values(state.players).find((p) => p.cid === cid) ?? null : null),
    [state, cid],
  )
  const myId = me?.userId ?? null
  const isHost = !!state && !!myId && state.hostUserId === myId

  const send = useMemo(
    () => ({
      join: (name: string) => {
        storeName(name)
        room.sendInput('JOIN', { name, cid, color: readStoredColor(), roomCode: code, game: 'baloney' })
      },
      setColor: (color: string) => {
        storeColor(color)
        room.sendInput('JOIN', { name: readStoredName(), cid, color, roomCode: code, game: 'baloney' })
      },
      setConfig: (c: Partial<GameConfig>) => room.sendInput('SET_CONFIG', c as Record<string, unknown>),
      start: () => room.sendInput('START_GAME'),
      skip: () => room.sendInput('SKIP'),
      submitLie: (text: string) => room.sendInput('SUBMIT_LIE', { text }),
      vote: (optionId: string) => room.sendInput('VOTE', { optionId }),
      kick: (targetUserId: string) => room.sendInput('KICK', { targetUserId }),
      addBot: () => room.sendInput('ADD_BOT'),
      removeBot: (targetUserId?: string) =>
        room.sendInput('REMOVE_BOT', targetUserId ? { targetUserId } : {}),
      chat: (text: string) => room.sendInput('CHAT', { text }),
      emote: (emoji: string) => room.sendInput('EMOTE', { emoji }),
      playAgain: () => room.sendInput('PLAY_AGAIN'),
    }),
    [room, cid, code],
  )

  // On connect (with write access): auto-(re)join a returning 'play' client by
  // cid so a refresh keeps their seat. (The route already powers the tick loop.)
  const idedRef = useRef(false)
  useEffect(() => {
    if (!room.connected || !room.canWrite) {
      idedRef.current = false
      return
    }
    if (idedRef.current) return
    idedRef.current = true
    if (role === 'play') {
      const name = readStoredName()
      if (name) room.sendInput('JOIN', { name, cid, color: readStoredColor(), roomCode: code, game: 'baloney' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.connected, room.canWrite])

  return {
    role,
    connected: room.connected,
    cid,
    myId,
    myName: readStoredName(),
    state,
    joined: !!me,
    isHost,
    me,
    players,
    chat: state?.chat ?? [],
    emotes: state?.emotes ?? [],
    send,
    raw: room,
  }
}
