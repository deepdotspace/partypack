/**
 * Anonymous identity — the Party Pack has no sign-in. Each device mints a
 * stable `cid` in localStorage (namespaced by role, so a Stage tab and a Play
 * tab in one browser stay distinct) and sends it with JOIN; "me" is the
 * broadcast player whose `cid` matches ours, which survives reconnects (the
 * engines rebind the seat by cid). The display name and profile color are
 * remembered across rooms AND across games — one identity for the whole pack.
 *
 * SSR-safe: every accessor guards `typeof window`.
 */

const NAME_KEY = 'partypack.name'
const COLOR_KEY = 'partypack.color'

export type ClientRole = 'stage' | 'play'

/** Stable per-device client id for a role; minted on first read. */
export function readCid(role: ClientRole): string {
  if (typeof window === 'undefined') return ''
  const key = `partypack.cid.${role}`
  try {
    let c = window.localStorage.getItem(key)
    if (!c) {
      c = `c-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
      window.localStorage.setItem(key, c)
    }
    return c
  } catch {
    // Private mode / storage disabled — a per-tab id still works for one session.
    return `c-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** The remembered display name ('' when none). */
export function readStoredName(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function storeName(name: string): void {
  if (typeof window === 'undefined' || !name) return
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    /* storage disabled — non-fatal */
  }
}

/** The remembered profile color ('' when none). */
export function readStoredColor(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(COLOR_KEY) ?? ''
  } catch {
    return ''
  }
}

export function storeColor(color: string): void {
  if (typeof window === 'undefined' || !color) return
  try {
    window.localStorage.setItem(COLOR_KEY, color)
  } catch {
    /* storage disabled — non-fatal */
  }
}
