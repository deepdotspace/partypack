import { useEffect } from 'react'
import { isMuted, subscribeMuted } from './sound'

/**
 * Background music — looping mp3 beds (Kevin MacLeod, CC BY 4.0; see
 * CREDITS.md). Music plays on EVERY device: the Stage at full bed volume and
 * each Controller at a quieter level, so a phone-only room still has a show.
 * Autoplay policy: .play() rejects until the first user gesture, so we arm a
 * one-shot pointer/key listener that retries — the join/host tap starts it.
 * Mute is shared with sound.ts (one toggle silences SFX + music instantly).
 */

const TRACKS = {
  lobby: '/audio/lobby.mp3',
  game: '/audio/game.mp3',
  win: '/audio/win.mp3',
} as const

/** Per-surface bed volume — the TV carries the room; phones sit underneath. */
const VOLUMES = { stage: 0.3, controller: 0.22 } as const
export type MusicRole = keyof typeof VOLUMES

let el: HTMLAudioElement | null = null
let currentSrc: string | null = null
let currentRole: MusicRole = 'stage'
let unlockArmed = false

function ensure(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!el) {
    el = new Audio()
    el.loop = true
    el.volume = VOLUMES[currentRole]
    // Flip mute → pause/resume immediately (not on the next phase change).
    subscribeMuted(() => syncMusicMute())
  }
  return el
}

/** Try to start playback; if the browser blocks autoplay, retry on the next
 *  user gesture (tap/keypress) — that gesture is the join/host action. */
function tryPlay(a: HTMLAudioElement): void {
  a.play().catch(() => armUnlock())
}

function armUnlock(): void {
  if (unlockArmed || typeof window === 'undefined') return
  unlockArmed = true
  const kick = () => {
    window.removeEventListener('pointerdown', kick)
    window.removeEventListener('keydown', kick)
    unlockArmed = false
    if (el && currentSrc && !isMuted()) void el.play().catch(() => armUnlock())
  }
  window.addEventListener('pointerdown', kick)
  window.addEventListener('keydown', kick)
}

function setMusic(track: keyof typeof TRACKS | null, role: MusicRole = 'stage'): void {
  currentRole = role
  const a = ensure()
  if (!a) return
  if (track === null) {
    a.pause()
    currentSrc = null
    return
  }
  const src = TRACKS[track]
  if (currentSrc !== src) {
    a.src = src
    currentSrc = src
  }
  a.volume = isMuted() ? 0 : VOLUMES[role]
  if (!isMuted()) tryPlay(a)
}

/** Re-apply the shared mute state to the music element. */
export function syncMusicMute(): void {
  const a = ensure()
  if (!a) return
  a.volume = isMuted() ? 0 : VOLUMES[currentRole]
  if (isMuted()) a.pause()
  else if (currentSrc) tryPlay(a)
}

/** Which music bed to use for a given phase string. Games call this to map
 *  their own phase names to the three available tracks. */
export function trackForPhase(phase: string): keyof typeof TRACKS {
  if (phase === 'PODIUM') return 'win'
  if (phase === 'LOBBY' || phase === 'INTRO') return 'lobby'
  return 'game'
}

/** Drive the background bed from the current phase. `role` picks the volume
 *  ('stage' 0.3 — the default, so existing Stage call sites are unchanged —
 *  or 'controller' 0.22). Pass `active=false` to silence music. */
export function useMusic(phase: string, active: boolean, role: MusicRole = 'stage'): void {
  useEffect(() => {
    if (active) setMusic(trackForPhase(phase), role)
    else setMusic(null, role)
  }, [phase, active, role])
  useEffect(() => () => setMusic(null), [])
}
