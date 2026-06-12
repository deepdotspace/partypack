/**
 * Head-to-head vote bar — two colored segments sized by vote share. Used live
 * during VOTE (fills as votes arrive) and frozen at REVEAL.
 */
export function VoteBar({
  leftVotes,
  rightVotes,
  leftColor,
  rightColor,
  show,
}: {
  leftVotes: number
  rightVotes: number
  leftColor: string
  rightColor: string
  show: boolean // hide counts/share until reveal if false
}) {
  const total = leftVotes + rightVotes
  const leftPct = total > 0 ? (leftVotes / total) * 100 : 50
  return (
    <div className="w-full">
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-plum">
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${leftPct}%`, backgroundColor: leftColor }}
        />
        <div className="h-full flex-1 transition-[width] duration-500 ease-out" style={{ backgroundColor: rightColor }} />
      </div>
      {show && (
        <div className="mt-1 flex justify-between font-display text-lg text-stage">
          {/* Round for display — audience votes are weighted (fractional); the bar above uses the exact share. */}
          <span>{Math.round(leftVotes)}</span>
          <span>{Math.round(rightVotes)}</span>
        </div>
      )}
    </div>
  )
}
