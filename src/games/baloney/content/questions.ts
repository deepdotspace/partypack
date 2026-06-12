import type { Question } from '../types'
import { EXTRA_QUESTIONS } from './pack-extra'
import { FUN_ORIGINS_QUESTIONS } from './pack-origins'
import { FUN_WEIRD_QUESTIONS } from './pack-weird'
import { FUN_RECORDS_QUESTIONS } from './pack-records'

/**
 * First-party question pool (original, MIT) — all four packs from the
 * standalone baloney, copied verbatim. Fill-in-the-blank trivia with short,
 * fakeable answers. `acceptableAnswers` also dedupe a player lie that
 * accidentally matches the truth; `forbiddenAnswers` reject the too-obvious /
 * joke guesses.
 *
 * The pool is the engine's `content` — the hub passes it back via
 * ReduceCtx.content each tick. Module-level concatenation order is stable, so
 * seeded question picks reproduce identically on server and in tests.
 *
 * To add a community pack: drop a `pack-<name>.ts` exporting a `Question[]`
 * and spread it into `QUESTION_POOL` below (same shape, unique ids).
 */
const CORE_QUESTIONS: Question[] = [
  {
    id: 'b-eiffel',
    category: 'Geography',
    difficulty: 'easy',
    prompt: 'The Eiffel Tower was built as the entrance arch for the 1889 World’s Fair in the city of ___.',
    answer: 'Paris',
    acceptableAnswers: ['Paris, France'],
    forbiddenAnswers: ['France', 'idk', 'your mom'],
  },
  {
    id: 'b-octopus',
    category: 'Animals',
    difficulty: 'medium',
    prompt: 'An octopus has this many hearts: ___.',
    answer: 'three',
    acceptableAnswers: ['3', 'three hearts'],
    forbiddenAnswers: ['one', 'two', 'a lot'],
  },
  {
    id: 'b-gold',
    category: 'Science',
    difficulty: 'medium',
    prompt: 'The chemical symbol for gold on the periodic table is ___.',
    answer: 'Au',
    acceptableAnswers: [],
    forbiddenAnswers: ['Go', 'Gd', 'gold'],
  },
  {
    id: 'b-babylon',
    category: 'History',
    difficulty: 'hard',
    prompt: 'The ancient wonder known as the Hanging Gardens was said to be in the city of ___.',
    answer: 'Babylon',
    acceptableAnswers: [],
    forbiddenAnswers: ['Egypt', 'Rome', 'Greece'],
  },
  {
    id: 'b-turmeric',
    category: 'Food',
    difficulty: 'medium',
    prompt: 'The spice that gives most curry powders their yellow color is ___.',
    answer: 'turmeric',
    acceptableAnswers: [],
    forbiddenAnswers: ['saffron', 'gold', 'cumin'],
  },
  {
    id: 'b-bones',
    category: 'Human Body',
    difficulty: 'medium',
    prompt: 'A typical adult human skeleton has 206 of these: ___.',
    answer: 'bones',
    acceptableAnswers: ['bone'],
    forbiddenAnswers: ['muscles', 'organs', 'cells'],
  },
  {
    id: 'b-everest',
    category: 'Geography',
    difficulty: 'hard',
    prompt: 'Mount Everest straddles the border between Nepal and ___.',
    answer: 'China',
    acceptableAnswers: ['Tibet', 'China (Tibet)'],
    forbiddenAnswers: ['India', 'Pakistan', 'Bhutan'],
  },
  {
    id: 'b-piano',
    category: 'Music',
    difficulty: 'medium',
    prompt: 'A standard full-size piano has this many keys: ___.',
    answer: '88',
    acceptableAnswers: ['eighty-eight', '88 keys'],
    forbiddenAnswers: ['100', '52', 'a lot'],
  },
  {
    id: 'b-crows',
    category: 'Language',
    difficulty: 'hard',
    prompt: 'The collective noun for a group of crows is a ___.',
    answer: 'murder',
    acceptableAnswers: ['murder of crows'],
    forbiddenAnswers: ['flock', 'gaggle', 'herd'],
  },
  {
    id: 'b-lightning',
    category: 'Science',
    difficulty: 'medium',
    prompt: 'A bolt of lightning is roughly five times hotter than the surface of the ___.',
    answer: 'sun',
    acceptableAnswers: ['the sun'],
    forbiddenAnswers: ['moon', 'earth', 'fire'],
  },
  {
    id: 'b-vatican',
    category: 'Geography',
    difficulty: 'medium',
    prompt: 'The smallest country in the world by land area is ___.',
    answer: 'Vatican City',
    acceptableAnswers: ['the Vatican', 'Vatican'],
    forbiddenAnswers: ['Monaco', 'Malta', 'Luxembourg'],
  },
  {
    id: 'b-honey',
    category: 'Food',
    difficulty: 'hard',
    prompt: 'This is the only common food made by insects that humans eat that never spoils: ___.',
    answer: 'honey',
    acceptableAnswers: [],
    forbiddenAnswers: ['milk', 'sugar', 'jam'],
  },
]

export const QUESTION_POOL: Question[] = [
  ...CORE_QUESTIONS,
  ...EXTRA_QUESTIONS,
  ...FUN_ORIGINS_QUESTIONS, // "huh, really?!" origins & accidents (BackRub, 7Up lithium, …)
  ...FUN_WEIRD_QUESTIONS, // weird-but-true animals/body/words (pandas = embarrassment, …)
  ...FUN_RECORDS_QUESTIONS, // record/place/history oddities (Vatican wine, Cleopatra, …)
]
