/**
 * GameShell — the in-game frame for every game's /play view. One shared shell so
 * all three games look identical: the app lives inside a bordered "console"
 * rectangle floating on the shared indigo world, with
 *
 *   - a top control bar (leave · phase/timer/room · mute · chat toggle),
 *   - a fixed LEFT score sidebar (the standings, cleanly separated — the same
 *     treatment for every game), and
 *   - a RIGHT chat sidebar that REFLOWS the stage narrower when opened on
 *     desktop (AI-assistant style) and slides in as an overlay on phones.
 *
 * Game-specific bits (the TopBar, the standings list/strip, the "best of the
 * night" footer) are passed in as nodes — they read each game's own state. The
 * chrome, layout, chat plumbing, and responsive behavior live here once.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, MessageCircle } from 'lucide-react'
import { World } from './World'
import { MuteToggle } from './sound'
import { ChatThread } from './ChatBox'
import type { ChatMsg, Emote } from './types'

export interface GameShellChat {
  chat: ChatMsg[]
  emotes: Emote[]
  myCid: string | null
  onSendChat: (text: string) => void
  onSendEmote: (emoji: string) => void
  chatDisabled?: boolean
  disabledHint?: string
}

export function GameShell({
  accent,
  topBar,
  standings,
  standingsStrip,
  railFooter,
  chat,
  children,
}: {
  accent: string
  /** Game TopBar (phase label · progress · timer · room code). */
  topBar: ReactNode
  /** Desktop left-rail standings list. */
  standings: ReactNode
  /** Mobile horizontal standings strip. */
  standingsStrip: ReactNode
  /** Optional left-rail footer ("best lie / invention / matchup of the night"). */
  railFooter?: ReactNode
  chat: GameShellChat
  /** The stage (the game's current-phase UI). */
  children: ReactNode
}) {
  const [chatOpen, setChatOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const accentColor = `var(--color-${accent})`
  const unread = chatOpen ? 0 : Math.max(0, chat.chat.length - seen)
  useEffect(() => {
    if (chatOpen) setSeen(chat.chat.length)
  }, [chatOpen, chat.chat.length])

  return (
    <div className="relative h-[100dvh] overflow-hidden text-stage">
      <World kind="indigo-burst" dim />

      {/* Desktop pads the console so the indigo world frames it; phones go full-bleed. */}
      <div className="mx-auto flex h-full w-full max-w-[1480px] flex-col lg:p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-white/10 bg-[rgba(11,8,32,0.6)] backdrop-blur-md lg:rounded-[1.75rem] lg:border lg:shadow-[0_26px_70px_rgba(0,0,0,0.5)]">
          {/* TOP BAR */}
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/20 px-4 py-2.5 lg:px-5">
            <LeaveControl />
            <span className="h-5 w-px bg-white/15" />
            {topBar}
            <MuteToggle />
            <ChatToggle accentColor={accentColor} unread={unread} open={chatOpen} onClick={() => setChatOpen((o) => !o)} />
          </header>

          {/* Mobile standings strip */}
          <div className="shrink-0 overflow-x-auto border-b border-white/10 bg-black/15 px-4 py-2 lg:hidden">
            {standingsStrip}
          </div>

          {/* BODY: left score sidebar · stage · right chat (reflow/overlay) */}
          <div className="relative flex min-h-0 flex-1">
            {/* LEFT SCORE SIDEBAR — fixed on desktop, cleanly separated. */}
            <aside className="hidden w-[15rem] shrink-0 flex-col border-r border-white/10 bg-black/15 px-5 py-4 lg:flex">
              <p className="mb-2 font-body text-xs font-bold uppercase tracking-[0.3em]" style={{ color: accentColor }}>
                Standings
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto">{standings}</div>
              {railFooter && <div className="mt-3 border-t border-white/10 pt-3">{railFooter}</div>}
            </aside>

            {/* STAGE — shrinks as the chat reflows open on desktop. */}
            <main className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-6 lg:px-9 lg:py-8">{children}</div>
            </main>

            {/* Mobile scrim (overlay chat only). */}
            {chatOpen && (
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setChatOpen(false)}
                className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[1px] lg:hidden"
              />
            )}

            {/* RIGHT CHAT — desktop: in-flow, width animates (reflow). mobile:
                absolute overlay that slides in. Inner width is fixed so the
                thread doesn't reflow mid-animation. */}
            <aside
              data-testid="chat-panel"
              aria-hidden={!chatOpen}
              className={`absolute inset-y-0 right-0 z-30 overflow-hidden bg-[#171036]/95 backdrop-blur-xl transition-[width,transform] duration-300 ease-out lg:static lg:z-auto lg:translate-x-0 lg:bg-[#160f30]/85 ${
                chatOpen
                  ? 'w-[min(100%,360px)] translate-x-0 border-l lg:w-[21rem]'
                  : 'w-[min(100%,360px)] translate-x-full border-l-0 lg:w-0 lg:translate-x-0'
              }`}
              style={{ borderColor: `color-mix(in srgb, ${accentColor} 40%, transparent)` }}
            >
              <div className="h-full w-[min(100vw,360px)] lg:w-[21rem]">
                <ChatThread
                  chat={chat.chat}
                  emotes={chat.emotes}
                  myCid={chat.myCid}
                  accent={accent}
                  onSendChat={chat.onSendChat}
                  onSendEmote={chat.onSendEmote}
                  chatDisabled={chat.chatDisabled}
                  disabledHint={chat.disabledHint}
                  onClose={() => setChatOpen(false)}
                />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Two-tap leave control in the top bar. */
function LeaveControl() {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])
  return (
    <button
      data-testid="leave-btn"
      onClick={() => (confirming ? navigate('/') : setConfirming(true))}
      className="flex shrink-0 items-center gap-1 font-body text-sm text-[#FFFDF5]/70 transition-colors hover:text-stage"
    >
      <ChevronLeft className="h-4 w-4" />
      {confirming ? 'Tap again' : 'Leave'}
    </button>
  )
}

/** Chat open/close control, docked in the top bar with an unread pip. */
function ChatToggle({
  accentColor,
  unread,
  open,
  onClick,
}: {
  accentColor: string
  unread: number
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-testid="chat-toggle"
      aria-label={open ? 'Close chat' : 'Open chat'}
      aria-pressed={open}
      onClick={onClick}
      className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors active:scale-90"
      style={{
        borderColor: open ? accentColor : 'rgba(255,255,255,0.18)',
        background: open ? `color-mix(in srgb, ${accentColor} 22%, transparent)` : 'transparent',
      }}
    >
      <MessageCircle className="h-5 w-5" style={{ color: open ? accentColor : 'rgba(255,253,245,0.8)' }} />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-siren px-1 font-body text-[10px] font-bold text-stage">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
