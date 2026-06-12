/**
 * Public-room registry — one row per OPEN, joinable public lobby, so the landing
 * page can browse + Quick-Play into games with strangers. Written ONLY by the
 * GameRoom DO (as the app, RBAC-bypass) on lobby changes, and deleted when the
 * game starts / empties / goes private. Anonymous players must READ it, so
 * `viewer.read = true`; no client may write (the DO is the source of truth).
 */
import type { CollectionSchema } from 'deepspace/worker'

export const roomsSchema: CollectionSchema = {
  name: 'rooms',
  // NOTE: don't add an `updatedAt` data column — it collides with the system
  // envelope `updatedAt`; read recency off the envelope instead.
  columns: [
    { name: 'game', storage: 'text', interpretation: 'plain' },       // 'wisecrack' | 'baloney' | 'pitch'
    { name: 'roomCode', storage: 'text', interpretation: 'plain' },
    { name: 'name', storage: 'text', interpretation: 'plain' },       // host display name / room title
    { name: 'playerCount', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
