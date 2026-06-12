/**
 * Shared game types — the minimal shapes used by shared UI components
 * (ChatBox, Emotes). Byte-compatible with wisecrack2's src/game/types.ts;
 * game engines are ported against these in Phase 2.
 */

/** A chat line (lobby + in-game). Lives in GameState as a capped ring buffer. */
export interface ChatMsg {
  id: string    // stable key for React (cid + ts)
  cid: string
  name: string
  color: string
  text: string
  ts: number
}

/** A transient emoji reaction that floats on the Stage. */
export interface Emote {
  id: string
  cid: string
  color: string
  emoji: string
  ts: number
}

export const CHAT_MAX_LEN = 140
export const CHAT_RING_MAX = 60
export const CHAT_MIN_INTERVAL_MS = 900

export const EMOTE_RING_MAX = 12
export const EMOTE_MIN_INTERVAL_MS = 600

/** The fixed emote set (anything else is rejected). */
export const EMOTES = ['😂', '😮', '🔥', '💀', '👏', '❤️', '🤔', '🎉'] as const
