/**
 * Chat sanitization — pure. Trim, collapse whitespace, cap length, and mask a
 * small profanity list (party-game / friends-in-a-room bar, not a content
 * moderation system). Returns '' for empty input (caller drops it).
 */
import { CHAT_MAX_LEN } from '../../shared/types'

// A short, deliberately small list — masks the obvious stuff without pretending
// to be a real filter. Word-boundary, case-insensitive.
const PROFANITY = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'asshole',
  'dick',
  'piss',
  'bastard',
  'slut',
  'whore',
  'nigger',
  'faggot',
  'retard',
]
const PROFANITY_RE = new RegExp(`\\b(${PROFANITY.join('|')})\\b`, 'gi')

function mask(word: string): string {
  return word[0] + '*'.repeat(Math.max(1, word.length - 1))
}

export function cleanChat(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN)
  if (!trimmed) return ''
  return trimmed.replace(PROFANITY_RE, (m) => mask(m))
}
