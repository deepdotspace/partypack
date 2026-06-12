import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MessageCircle, Send, X } from 'lucide-react'
import { CHAT_MAX_LEN, EMOTES } from './types'
import type { ChatMsg, Emote } from './types'

/**
 * Room chat + reactions. The visible UI lives in <ChatThread> (header, feed,
 * reaction tray, composer) so it can be dropped into either container:
 *   - <ChatBox>: a floating overlay sheet — used by the three lobbies and on
 *     phones, where there's no room to reflow.
 *   - the in-game shell's right sidebar (shared/GameShell), which REFLOWS the
 *     stage narrower on desktop, AI-assistant style.
 *
 * One thread, one design, no drift. `accent` is a design-token name
 * ('lime' | 'magenta' | 'tangerine' | …) so each game tints its own chat.
 */

interface ChatThreadProps {
  chat: ChatMsg[]
  emotes: Emote[]
  /** The local player's CID (NOT userId) — chat/emote lines are keyed by cid,
   *  so own-vs-others alignment compares against this. */
  myCid: string | null
  accent: string
  onSendChat: (text: string) => void
  onSendEmote: (emoji: string) => void
  /** Renders the header close control; omit for a permanently-docked thread. */
  onClose?: () => void
  /** Disable the text composer (Baloney mutes chat during WRITE/VOTE to stop
   *  collusion). Reactions stay live so the room can still react. */
  chatDisabled?: boolean
  /** Placeholder shown while the composer is disabled. */
  disabledHint?: string
}

/** The chat surface itself — container-agnostic (fills its parent height). */
export function ChatThread({
  chat,
  emotes,
  myCid,
  accent,
  onSendChat,
  onSendEmote,
  onClose,
  chatDisabled = false,
  disabledHint = 'Chat is paused…',
}: ChatThreadProps) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const accentColor = `var(--color-${accent})`

  // One time-sorted stream of messages + reactions. Keys are namespaced so a
  // chat line and a reaction minted in the same tick can never collide.
  const entries = useMemo(() => {
    const msgs = chat.map((m) => ({ kind: 'msg' as const, key: `c-${m.id}`, ...m }))
    const reacts = emotes.map((e) => ({ kind: 'emote' as const, key: `e-${e.id}`, ...e }))
    return [...msgs, ...reacts].sort((a, b) => a.ts - b.ts)
  }, [chat, emotes])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries.length])

  function send() {
    const t = text.trim()
    if (!t || chatDisabled) return
    onSendChat(t)
    setText('')
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Header — accent wash + a generous, unmistakable close target. */}
      <div
        className="flex shrink-0 items-center justify-between px-5 py-4"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${accentColor} 16%, transparent), transparent)` }}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${accentColor} 22%, transparent)` }}>
            <MessageCircle className="h-5 w-5" style={{ color: accentColor }} />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg uppercase tracking-wide" style={{ color: accentColor }}>
              Room chat
            </p>
            <p className="font-body text-[11px] text-[#FFFDF5]/55">Talk and react with the room</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close chat"
            data-testid="chat-close"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-[#FFFDF5]/80 transition-colors hover:bg-white/15 hover:text-stage active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Timeline */}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4">
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <span className="text-3xl">💬</span>
            <p className="font-body text-sm text-[#FFFDF5]/60">Quiet in here. Say hi or drop a reaction.</p>
          </div>
        ) : (
          entries.map((e) =>
            e.kind === 'msg' ? (
              <MessageBubble key={e.key} msg={e} mine={e.cid === myCid} accentColor={accentColor} reduce={!!reduce} />
            ) : (
              <ReactionChip key={e.key} emoji={e.emoji} color={e.color} reduce={!!reduce} />
            ),
          )
        )}
      </div>

      {/* Reaction tray */}
      <div className="shrink-0 px-4 pb-1">
        <div className="flex items-center justify-between gap-1 rounded-2xl bg-white/5 p-1.5">
          {EMOTES.map((emo) => (
            <button
              key={emo}
              type="button"
              aria-label={`React ${emo}`}
              onClick={() => onSendEmote(emo)}
              className="grid h-9 w-9 place-items-center rounded-full text-xl transition-transform hover:bg-white/10 active:scale-150"
            >
              {emo}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="flex shrink-0 items-center gap-2 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2.5">
        <input
          data-testid="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
          }}
          disabled={chatDisabled}
          placeholder={chatDisabled ? disabledHint : 'Message the room…'}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/8 px-4 py-3 font-body text-[15px] text-stage placeholder:text-[#FFFDF5]/40 focus:border-white/25 focus:outline-none disabled:opacity-50"
          style={{ caretColor: accentColor }}
        />
        <button
          type="button"
          aria-label="Send message"
          data-testid="chat-send"
          onClick={send}
          disabled={chatDisabled || !text.trim()}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-velvet transition-transform active:scale-90 disabled:opacity-35"
          style={{ backgroundColor: accentColor }}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

/**
 * ChatBox — the floating overlay wrapper around <ChatThread>. A round toggle
 * (hidden while open, so it never sits on the composer) reveals a right-side
 * sheet over a scrim. Used by the lobbies and on phones.
 */
export function ChatBox(props: Omit<ChatThreadProps, 'onClose'>) {
  const { chat, accent } = props
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const reduce = useReducedMotion()
  const accentColor = `var(--color-${accent})`
  const unread = open ? 0 : Math.max(0, chat.length - seen)

  useEffect(() => {
    if (open) setSeen(chat.length)
  }, [open, chat.length])

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            aria-label="Open chat"
            data-testid="chat-toggle"
            initial={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#171036] text-stage shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-transform active:scale-90"
            style={{ border: `2px solid ${accentColor}` }}
          >
            <MessageCircle className="h-6 w-6" style={{ color: accentColor }} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-siren px-1 font-body text-xs font-bold text-stage">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            />
            <motion.div
              data-testid="chat-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-l-[1.75rem] bg-[#171036]/95 backdrop-blur-xl"
              style={{ boxShadow: '-18px 0 50px rgba(0,0,0,0.55)', borderLeft: `1px solid color-mix(in srgb, ${accentColor} 40%, transparent)` }}
            >
              <ChatThread {...props} onClose={() => setOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/** A single chat line. Mine sits right in the accent; others left under their color. */
function MessageBubble({
  msg,
  mine,
  accentColor,
  reduce,
}: {
  msg: ChatMsg
  mine: boolean
  accentColor: string
  reduce: boolean
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex max-w-[88%] flex-col ${mine ? 'items-end self-end' : 'items-start self-start'}`}
    >
      {!mine && (
        <span className="mb-0.5 ml-1 font-body text-[11px] font-bold" style={{ color: msg.color || '#b9a9d6' }}>
          {msg.name}
        </span>
      )}
      <span
        className={`break-words px-3.5 py-2 font-body text-[15px] leading-snug text-stage ${
          mine ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-tl-md'
        }`}
        style={
          mine
            ? { background: `color-mix(in srgb, ${accentColor} 34%, #241544)`, border: `1px solid color-mix(in srgb, ${accentColor} 55%, transparent)` }
            : { background: 'rgba(255,255,255,0.08)' }
        }
      >
        {msg.text}
      </span>
    </motion.div>
  )
}

/** A reaction, centered in the feed with the sender's color halo. */
function ReactionChip({ emoji, color, reduce }: { emoji: string; color: string; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
      className="flex justify-center self-center"
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-full text-xl"
        style={{ background: `color-mix(in srgb, ${color} 24%, transparent)`, boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)` }}
      >
        {emoji}
      </span>
    </motion.div>
  )
}
