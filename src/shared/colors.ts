/**
 * Fixed, named player-color roster (shared LATE NIGHT world; same set Baloney
 * uses). Color = identity: reused in avatars, vote bars, particles, stamps.
 * Assigned by join order in the engine so both Stage and Controller agree.
 */
export const PLAYER_COLORS = [
  '#FF2E97', // Hot Magenta
  '#27E1FF', // Electric Cyan
  '#C6FF3D', // Acid Lime
  '#FFD23F', // Marquee Gold
  '#FF8A3D', // Tangerine
  '#9D5CFF', // Violet
  '#FF5E7A', // Coral
  '#6EE7A8', // Mint
] as const

export function colorForSeat(seatIndex: number): string {
  return PLAYER_COLORS[seatIndex % PLAYER_COLORS.length]
}

/**
 * Neutral A/B "side" colors for a head-to-head matchup, used while authorship is
 * still hidden (tangerine = left/option A, magenta = right/option B). Shared by
 * Stage and Controller so "the tangerine one" maps to the same answer across both.
 */
export const SIDE = ['#FF8A3D', '#FF2E97'] as const
