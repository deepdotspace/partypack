/**
 * Finished-game recap records — one row per completed game, written by the
 * GameRoom DO at the podium (as the app, RBAC-bypass), since anonymous clients
 * can't write records. Publicly readable so a recap link is shareable by anyone
 * (virality). The full standings + top matchup live in a JSON-stringified
 * `payload` text column (kept storage-simple).
 */
import type { CollectionSchema } from 'deepspace/worker'

export const gamesSchema: CollectionSchema = {
  name: 'games',
  columns: [
    { name: 'game', storage: 'text', interpretation: 'plain' },        // 'wisecrack' | 'baloney' | 'pitch'
    { name: 'roomCode', storage: 'text', interpretation: 'plain' },
    { name: 'winnerName', storage: 'text', interpretation: 'plain' },
    { name: 'winnerColor', storage: 'text', interpretation: 'plain' },
    { name: 'winnerScore', storage: 'number', interpretation: 'plain' },
    { name: 'payload', storage: 'text', interpretation: 'plain' },
    { name: 'finishedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    // Public read (shareable recaps). No client writes — only the DO writes,
    // via the X-App-Action RBAC bypass.
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

/** Shape stored in the `payload` column (JSON-stringified). */
export interface RecapPayload {
  standings: { name: string; color: string; score: number }[]
  topMatchup: { promptText: string; answers: { name: string; color: string; text: string; votes: number }[] } | null
}
