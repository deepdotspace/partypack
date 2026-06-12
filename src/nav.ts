/**
 * Navigation Config — intentionally empty. Party Pack has no nav chrome:
 * every screen (landing, /play, /stage, /recap) owns its own full-bleed
 * poster layout. Kept (rather than deleted) so `deepspace add` features
 * that append nav items still have a valid target.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
}

export const nav: NavItem[] = []
