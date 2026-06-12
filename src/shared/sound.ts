/**
 * Sound engine — a self-contained Web Audio SFX kit for the Party Pack stage.
 * Everything is synthesized at call time (oscillators + gain envelopes + noise
 * buffers); there are no audio assets to ship. Sounds are short and tasteful —
 * they play over a TV, so we keep peaks low and add a touch of random pitch
 * per call so rapid repeats don't fatigue the ear.
 *
 * SSR-safe: the context is created lazily and every entry point guards
 * `typeof window`, so importing this on the server is inert.
 */
import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { createElement } from 'react'

// --- AudioContext (lazy, shared, gesture-resumed) -------------------------

let ctx: AudioContext | null = null

/** Get (or create) the shared context, resuming it if a gesture has unlocked it. */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  // Browsers suspend the context until a user gesture; resume() is a no-op once running.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// --- helpers --------------------------------------------------------------

/** Random multiplier in [1-amt, 1+amt] for per-call pitch variation. */
function vary(amt = 0.04): number {
  return 1 + (Math.random() * 2 - 1) * amt
}

/** A short tone with an attack/decay envelope. Returns when scheduled (fire-and-forget). */
function tone(
  ac: AudioContext,
  opts: {
    type?: OscillatorType
    freq: number
    /** Optional end frequency for a glide. */
    toFreq?: number
    /** Peak gain (kept gentle — these play over a TV). */
    gain?: number
    /** Seconds. */
    attack?: number
    duration: number
    /** Delay from "now" in seconds. */
    at?: number
    /** Optional low-pass cutoff. */
    cutoff?: number
  },
): void {
  const t0 = ac.currentTime + (opts.at ?? 0)
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, t0)
  if (opts.toFreq != null) osc.frequency.exponentialRampToValueAtTime(opts.toFreq, t0 + opts.duration)

  const peak = opts.gain ?? 0.18
  const attack = opts.attack ?? 0.006
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)

  let node: AudioNode = osc
  if (opts.cutoff != null) {
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = opts.cutoff
    osc.connect(lp)
    node = lp
  }
  node.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + opts.duration + 0.02)
}

let noiseBuf: AudioBuffer | null = null
/** A cached 1s mono white-noise buffer (built once per context lifetime). */
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf
  const len = Math.floor(ac.sampleRate * 1)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noiseBuf = buf
  return buf
}

// --- mute system ----------------------------------------------------------

const MUTE_KEY = 'partypack.muted'
const listeners = new Set<(muted: boolean) => void>()

/** Reads persisted mute state. Default OFF (sound on). SSR-safe. */
export function isMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

/** Subscribe to mute changes (music.ts uses this to pause/resume instantly).
 *  Returns an unsubscribe function. */
export function subscribeMuted(fn: (muted: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Persists mute state and notifies subscribers (e.g. the toggle hook). */
export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* private mode / storage disabled — fall through, listeners still fire */
  }
  for (const fn of listeners) fn(muted)
}

/** Run a synth body unless muted / unavailable. */
function play(fn: (ac: AudioContext) => void): void {
  if (isMuted()) return
  const ac = audio()
  if (!ac) return
  try {
    fn(ac)
  } catch {
    /* never let a sound crash the UI */
  }
}

// --- the kit --------------------------------------------------------------

export const sound = {
  /** Soft UI tick for button taps. */
  click(): void {
    play((ac) => {
      tone(ac, { type: 'triangle', freq: 320 * vary(), gain: 0.08, duration: 0.05, cutoff: 2200 })
    })
  },

  /** Bright blip — player joins, an answer lands. */
  pop(): void {
    play((ac) => {
      const f = 520 * vary(0.06)
      tone(ac, { type: 'sine', freq: f, toFreq: f * 2.1, gain: 0.16, duration: 0.13 })
    })
  },

  /** Filtered-noise sweep for submits / transitions. */
  whoosh(): void {
    play((ac) => {
      const t0 = ac.currentTime
      const dur = 0.34
      const src = ac.createBufferSource()
      src.buffer = noise(ac)
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 0.9
      bp.frequency.setValueAtTime(380 * vary(0.1), t0)
      bp.frequency.exponentialRampToValueAtTime(2600, t0 + dur)
      const g = ac.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      src.connect(bp).connect(g).connect(ac.destination)
      src.start(t0)
      src.stop(t0 + dur + 0.02)
    })
  },

  /** ~1s tension roll that rises — the reveal hold. */
  drumroll(): void {
    play((ac) => {
      const t0 = ac.currentTime
      const dur = 1.0
      const hits = 36
      for (let i = 0; i < hits; i++) {
        const p = i / hits
        // accelerate slightly and rise in pitch toward the climax
        const at = (p * p) * dur
        const src = ac.createBufferSource()
        src.buffer = noise(ac)
        const lp = ac.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 600 + p * 1400
        const g = ac.createGain()
        const peak = 0.04 + p * 0.07
        g.gain.setValueAtTime(0.0001, t0 + at)
        g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.004)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.05)
        src.connect(lp).connect(g).connect(ac.destination)
        src.start(t0 + at)
        src.stop(t0 + at + 0.07)
      }
    })
  },

  /** Pleasant bell — winner / correct. */
  ding(): void {
    play((ac) => {
      const base = 880 * vary(0.02)
      // fundamental + a fifth + an octave shimmer for a bell-like timbre
      tone(ac, { type: 'sine', freq: base, gain: 0.16, duration: 0.5 })
      tone(ac, { type: 'sine', freq: base * 1.5, gain: 0.07, duration: 0.42 })
      tone(ac, { type: 'sine', freq: base * 2, gain: 0.05, duration: 0.6 })
    })
  },

  /** Punchy thud — stamp impact on a reveal. */
  stamp(): void {
    play((ac) => {
      const t0 = ac.currentTime
      // body: a fast downward sine thump
      tone(ac, { type: 'sine', freq: 180 * vary(0.05), toFreq: 60, gain: 0.32, duration: 0.18, attack: 0.002 })
      // crack: a short noise transient for the impact edge
      const src = ac.createBufferSource()
      src.buffer = noise(ac)
      const lp = ac.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1800
      const g = ac.createGain()
      g.gain.setValueAtTime(0.22, t0)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06)
      src.connect(lp).connect(g).connect(ac.destination)
      src.start(t0)
      src.stop(t0 + 0.08)
    })
  },

  /** Short triumphant arpeggio — the podium. */
  fanfare(): void {
    play((ac) => {
      const root = 523.25 * vary(0.01) // C5
      const steps = [1, 5 / 4, 3 / 2, 2] // major triad up to the octave
      steps.forEach((mult, i) => {
        tone(ac, {
          type: 'triangle',
          freq: root * mult,
          gain: 0.14,
          duration: 0.32,
          at: i * 0.11,
        })
      })
    })
  },

  /** Tiny tick — timer's last seconds. */
  countTick(): void {
    play((ac) => {
      tone(ac, { type: 'square', freq: 1100 * vary(0.03), gain: 0.07, duration: 0.04, cutoff: 3000 })
    })
  },

  /** Descending buzz — timer expired / time's up. */
  buzzer(): void {
    play((ac) => {
      const t0 = ac.currentTime
      // A sharp downward sawtooth sweep — unmistakably "time's up"
      tone(ac, { type: 'sawtooth', freq: 440 * vary(0.03), toFreq: 110, gain: 0.28, duration: 0.42, attack: 0.004, cutoff: 3200 })
      // Reinforcing noise punch at the front
      const src = ac.createBufferSource()
      src.buffer = noise(ac)
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 1.2
      bp.frequency.value = 900
      const g = ac.createGain()
      g.gain.setValueAtTime(0.18, t0)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
      src.connect(bp).connect(g).connect(ac.destination)
      src.start(t0)
      src.stop(t0 + 0.2)
    })
  },
}

export type Sound = typeof sound

// --- React glue -----------------------------------------------------------

/** Subscribe to mute changes; returns `[muted, toggle]`. */
export function useMuted(): [boolean, () => void] {
  const [muted, setLocal] = useState<boolean>(() => isMuted())

  useEffect(() => {
    setLocal(isMuted())
    const onChange = (m: boolean) => setLocal(m)
    listeners.add(onChange)
    // keep in sync if another tab flips the toggle
    const onStorage = (e: StorageEvent) => {
      if (e.key === MUTE_KEY) setLocal(isMuted())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const toggle = () => setMuted(!isMuted())
  return [muted, toggle]
}

/** Small round mute button. Pass `className` to position it (e.g. fixed corner). */
export function MuteToggle({ className = '' }: { className?: string }) {
  const [muted, toggle] = useMuted()
  const Icon = muted ? VolumeX : Volume2
  return createElement(
    'button',
    {
      type: 'button',
      onClick: () => {
        toggle()
        // a tiny confirmation tick when un-muting (no-op while muted)
        if (muted) sound.click()
      },
      'aria-label': muted ? 'Unmute sound' : 'Mute sound',
      'aria-pressed': muted,
      title: muted ? 'Unmute' : 'Mute',
      className:
        'rounded-full bg-plum/80 p-2 text-smoke transition hover:text-stage hover:bg-plum ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-lime ' +
        className,
    },
    createElement(Icon, { className: 'h-5 w-5', 'aria-hidden': true }),
  )
}
