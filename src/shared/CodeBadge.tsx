/**
 * CodeBadge — the always-visible room code in a black box (quiplash's "FBUL"
 * corner / pp3 roomcode sign): the join host small on top, the CODE big in
 * gold Archivo Black underneath. `compact` is the controller-strip variant
 * (one line, smaller). Ink box works on every world color.
 */
export function CodeBadge({
  code,
  compact = false,
  className = '',
  testId = 'room-code-pill',
}: {
  code: string
  compact?: boolean
  className?: string
  testId?: string
}) {
  const host = typeof window !== 'undefined' ? window.location.host : 'partypack.app.space'
  if (compact) {
    return (
      <span
        data-testid={testId}
        className={`inline-flex items-baseline gap-1.5 bg-[#131313] px-2.5 py-1 ${className}`}
        style={{ rotate: '-1deg', boxShadow: '2.5px 2.5px 0 rgba(0,0,0,0.35)' }}
      >
        <span className="font-display text-sm tracking-[0.18em] text-[#FFD23F]">{code}</span>
      </span>
    )
  }
  return (
    <span
      data-testid={testId}
      className={`inline-flex flex-col items-center bg-[#131313] px-3.5 py-1.5 ${className}`}
      style={{ rotate: '-1.5deg', boxShadow: '4px 4px 0 rgba(0,0,0,0.4)' }}
    >
      <span className="font-body text-[10px] font-bold lowercase tracking-wide text-[#FFFDF5]/90">{host}</span>
      <span className="font-display text-xl leading-tight tracking-[0.18em] text-[#FFD23F]">{code}</span>
    </span>
  )
}
