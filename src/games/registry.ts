/**
 * Game registry — client-safe metadata for the three party games.
 *
 * PURE MODULE: no engine imports, no React, no SDK. Imported by the landing
 * page (posters / lobby how-to) AND the worker (isGameId gate on JOIN), so it
 * must stay tiny and dependency-free. Engine dispatch lives in ./engines.ts.
 */

export type GameId = 'wisecrack' | 'baloney' | 'pitch'

export interface GameMeta {
  id: GameId
  title: string
  tagline: string
  /** 1-2 sentences for the landing poster. */
  blurb: string
  /** Primary accent token name: 'lime' | 'magenta' | 'tangerine'. */
  accent: string
  /** Secondary accent token name: 'gold' | 'cyan' | 'violet'. */
  accent2: string
  /** The game's stage world (shared/World.tsx motif). Hub stays 'midnight'. */
  world: 'indigo-burst' | 'gold-dots' | 'blueprint'
  minPlayers: number
  maxPlayers: number
  /** 3 short just-in-time instruction lines for the lobby. */
  howTo: string[]
}

export const GAMES: Record<GameId, GameMeta> = {
  wisecrack: {
    id: 'wisecrack',
    title: 'Wisecrack',
    tagline: 'Same prompt. Funniest answer wins.',
    blurb:
      'Two players get the same fill-in-the-blank and write rival punchlines. The room votes, and the bigger laugh takes the points.',
    accent: 'lime',
    accent2: 'gold',
    world: 'indigo-burst',
    minPlayers: 3,
    maxPlayers: 8,
    howTo: [
      'You get prompts with a blank. Fill each one with your funniest line.',
      'Answers face off in pairs. Everyone else votes for the better one.',
      'Votes are points. Survive three rounds and take the podium.',
    ],
  },
  baloney: {
    id: 'baloney',
    title: 'Baloney',
    tagline: 'Spot the truth. Sell the lie.',
    blurb:
      'A weird-but-true trivia question, one real answer, and a pile of lies your friends wrote. Find the truth while selling your fake.',
    accent: 'magenta',
    accent2: 'cyan',
    world: 'gold-dots',
    minPlayers: 2,
    maxPlayers: 8,
    howTo: [
      'Read the question, then write a lie that sounds true.',
      'Every answer goes in the lineup, including the real one.',
      'Pick the truth for points. Every friend you fool pays you more.',
    ],
  },
  pitch: {
    id: 'pitch',
    title: 'Pitch',
    tagline: 'Invent it. Sell it. Win the room.',
    blurb:
      'You get a brief for a product nobody asked for. Name it, pitch it in one line, and convince the room it deserves to exist.',
    accent: 'tangerine',
    accent2: 'violet',
    world: 'blueprint',
    minPlayers: 3,
    maxPlayers: 8,
    howTo: [
      'Each round opens with a brief for an impossible product.',
      'Invent yours: a name and a one-line pitch.',
      'The room votes for the invention they would actually buy.',
    ],
  },
}

export const GAME_LIST: GameMeta[] = Object.values(GAMES)

export function isGameId(x: unknown): x is GameId {
  return x === 'wisecrack' || x === 'baloney' || x === 'pitch'
}
