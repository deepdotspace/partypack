import type { Question } from '../types'

/**
 * Second first-party question pack (original, MIT). Same fill-in-the-blank
 * format as QUESTION_POOL: short, fakeable answers, a visible blank, and
 * forbidden guesses for the too-obvious / joke picks. Every fact here was
 * checked against a primary or authoritative source before shipping.
 */
export const EXTRA_QUESTIONS: Question[] = [
  // --- Geography ---
  {
    id: 'b2-canberra',
    category: 'Geography',
    difficulty: 'medium',
    prompt: 'The capital city of Australia is ___, not its largest city, Sydney.',
    answer: 'Canberra',
    acceptableAnswers: [],
    forbiddenAnswers: ['Sydney', 'Melbourne', 'Australia'],
  },
  {
    id: 'b2-sahara',
    category: 'Geography',
    difficulty: 'easy',
    prompt: 'The largest hot desert in the world, spanning much of North Africa, is the ___.',
    answer: 'Sahara',
    acceptableAnswers: ['Sahara Desert', 'the Sahara'],
    forbiddenAnswers: ['Gobi', 'Antarctica', 'desert'],
  },
  {
    id: 'b2-cn-tower',
    category: 'Geography',
    difficulty: 'medium',
    prompt: 'The CN Tower, one of the tallest free-standing structures in the Western Hemisphere, stands in the Canadian city of ___.',
    answer: 'Toronto',
    acceptableAnswers: [],
    forbiddenAnswers: ['Ottawa', 'Vancouver', 'Canada'],
  },
  {
    id: 'b2-greenland',
    category: 'Geography',
    difficulty: 'hard',
    prompt: 'The largest island in the world (not counting continents like Australia) is ___.',
    answer: 'Greenland',
    acceptableAnswers: [],
    forbiddenAnswers: ['Australia', 'Madagascar', 'Iceland'],
  },

  // --- History ---
  {
    id: 'b2-statue-liberty',
    category: 'History',
    difficulty: 'medium',
    prompt: 'The Statue of Liberty was given to the United States in the 1880s as a gift from the country of ___.',
    answer: 'France',
    acceptableAnswers: [],
    forbiddenAnswers: ['America', 'England', 'USA'],
  },
  {
    id: 'b2-wright',
    category: 'History',
    difficulty: 'hard',
    prompt: 'The Wright brothers made their first powered airplane flights in 1903 near the town of Kitty Hawk, in the U.S. state of ___.',
    answer: 'North Carolina',
    acceptableAnswers: ['NC'],
    forbiddenAnswers: ['Ohio', 'Kansas', 'America'],
  },
  {
    id: 'b2-rosetta',
    category: 'History',
    difficulty: 'hard',
    prompt: 'The carved stone that let scholars finally decode Egyptian hieroglyphs is called the ___ Stone.',
    answer: 'Rosetta',
    acceptableAnswers: ['Rosetta Stone'],
    forbiddenAnswers: ['Egyptian', 'Cairo', 'Sphinx'],
  },

  // --- Science ---
  {
    id: 'b2-venus',
    category: 'Science',
    difficulty: 'hard',
    prompt: 'The hottest planet in our solar system, thanks to its thick carbon-dioxide atmosphere, is ___.',
    answer: 'Venus',
    acceptableAnswers: [],
    forbiddenAnswers: ['Mercury', 'Mars', 'the sun'],
  },
  {
    id: 'b2-dna',
    category: 'Science',
    difficulty: 'medium',
    prompt: 'In genetics, the letters DNA stand for deoxyribonucleic ___.',
    answer: 'acid',
    acceptableAnswers: [],
    forbiddenAnswers: ['base', 'nucleus', 'gene'],
  },
  {
    id: 'b2-helium',
    category: 'Science',
    difficulty: 'medium',
    prompt: 'The second-lightest element on the periodic table, used to fill party balloons, is ___.',
    answer: 'helium',
    acceptableAnswers: ['He'],
    forbiddenAnswers: ['hydrogen', 'air', 'oxygen'],
  },
  {
    id: 'b2-diamond',
    category: 'Science',
    difficulty: 'medium',
    prompt: 'The hardest naturally occurring material on Earth is ___.',
    answer: 'diamond',
    acceptableAnswers: [],
    forbiddenAnswers: ['steel', 'gold', 'rock'],
  },

  // --- Space ---
  {
    id: 'b2-saturn-moons',
    category: 'Space',
    difficulty: 'hard',
    prompt: 'As of recent counts, the planet with the most confirmed moons in our solar system is ___.',
    answer: 'Saturn',
    acceptableAnswers: [],
    forbiddenAnswers: ['Jupiter', 'Earth', 'Mars'],
  },
  {
    id: 'b2-moon-landing',
    category: 'Space',
    difficulty: 'easy',
    prompt: 'The first human to walk on the Moon, in 1969, was Neil ___.',
    answer: 'Armstrong',
    acceptableAnswers: ['Neil Armstrong'],
    forbiddenAnswers: ['Aldrin', 'Gagarin', 'me'],
  },

  // --- Animals ---
  {
    id: 'b2-blue-whale',
    category: 'Animals',
    difficulty: 'medium',
    prompt: 'The largest animal known to have ever lived, bigger than any dinosaur, is the ___ whale.',
    answer: 'blue',
    acceptableAnswers: ['blue whale'],
    forbiddenAnswers: ['humpback', 'killer', 'sperm'],
  },
  {
    id: 'b2-cheetah',
    category: 'Animals',
    difficulty: 'easy',
    prompt: 'The fastest land animal in the world over short distances is the ___.',
    answer: 'cheetah',
    acceptableAnswers: [],
    forbiddenAnswers: ['lion', 'leopard', 'horse'],
  },
  {
    id: 'b2-platypus',
    category: 'Animals',
    difficulty: 'hard',
    prompt: 'One of only a few mammals that lays eggs instead of giving birth is the duck-billed ___.',
    answer: 'platypus',
    acceptableAnswers: [],
    forbiddenAnswers: ['beaver', 'otter', 'duck'],
  },
  {
    id: 'b2-snail-teeth',
    category: 'Animals',
    difficulty: 'hard',
    prompt: 'A garden snail eats using a ribbon-like organ called a radula, which can carry thousands of tiny ___.',
    answer: 'teeth',
    acceptableAnswers: ['tooth'],
    forbiddenAnswers: ['hairs', 'spikes', 'legs'],
  },

  // --- Food ---
  {
    id: 'b2-wasabi',
    category: 'Food',
    difficulty: 'hard',
    prompt: 'Most "wasabi" served with sushi outside Japan is actually dyed ___ rather than the real plant.',
    answer: 'horseradish',
    acceptableAnswers: [],
    forbiddenAnswers: ['mustard', 'ginger', 'green'],
  },
  {
    id: 'b2-saffron',
    category: 'Food',
    difficulty: 'medium',
    prompt: 'By weight, the most expensive spice in the world is ___.',
    answer: 'saffron',
    acceptableAnswers: [],
    forbiddenAnswers: ['vanilla', 'pepper', 'gold'],
  },
  {
    id: 'b2-tomato',
    category: 'Food',
    difficulty: 'medium',
    prompt: 'Botanically speaking, a tomato is not a vegetable but a ___.',
    answer: 'fruit',
    acceptableAnswers: [],
    forbiddenAnswers: ['vegetable', 'berry', 'plant'],
  },

  // --- Human Body ---
  {
    id: 'b2-stapes',
    category: 'Human Body',
    difficulty: 'hard',
    prompt: 'The smallest bone in the human body, found inside the ear, is the ___.',
    answer: 'stapes',
    acceptableAnswers: ['stirrup'],
    forbiddenAnswers: ['eardrum', 'pinky', 'tailbone'],
  },
  {
    id: 'b2-funny-bone',
    category: 'Human Body',
    difficulty: 'hard',
    prompt: 'The "funny bone" tingle when you bump your elbow actually comes from the ___ nerve.',
    answer: 'ulnar',
    acceptableAnswers: ['ulnar nerve'],
    forbiddenAnswers: ['humerus', 'funny', 'elbow'],
  },
  {
    id: 'b2-hand-bones',
    category: 'Human Body',
    difficulty: 'medium',
    prompt: 'Each human hand (including the wrist) contains this many bones: ___.',
    answer: '27',
    acceptableAnswers: ['twenty-seven', '27 bones'],
    forbiddenAnswers: ['5', '10', 'a lot'],
  },

  // --- Language ---
  {
    id: 'b2-long-word-phobia',
    category: 'Language',
    difficulty: 'hard',
    prompt: 'Fittingly, the informal name for a fear of long words is itself enormous: hippopotomonstrosesquippedalio___.',
    answer: 'phobia',
    acceptableAnswers: [],
    forbiddenAnswers: ['fear', 'mania', 'phobic'],
  },
  {
    id: 'b2-baby-animals',
    category: 'Language',
    difficulty: 'medium',
    prompt: 'A baby kangaroo is called a ___.',
    answer: 'joey',
    acceptableAnswers: [],
    forbiddenAnswers: ['cub', 'calf', 'pup'],
  },

  // --- Sports ---
  {
    id: 'b2-bolt',
    category: 'Sports',
    difficulty: 'hard',
    prompt: 'The men’s 100-metre world record, set by Usain Bolt in 2009, is ___ seconds.',
    answer: '9.58',
    acceptableAnswers: ['9.58 seconds'],
    forbiddenAnswers: ['10', '9', '8'],
  },

  // --- Music ---
  {
    id: 'b2-violin-strings',
    category: 'Music',
    difficulty: 'medium',
    prompt: 'A standard violin has this many strings: ___.',
    answer: 'four',
    acceptableAnswers: ['4', 'four strings'],
    forbiddenAnswers: ['six', 'five', 'a lot'],
  },
  {
    id: 'b2-beethoven',
    category: 'Music',
    difficulty: 'medium',
    prompt: 'The composer who was profoundly deaf by the time he premiered his Ninth Symphony ("Ode to Joy") was Ludwig van ___.',
    answer: 'Beethoven',
    acceptableAnswers: ['van Beethoven'],
    forbiddenAnswers: ['Mozart', 'Bach', 'Ludwig'],
  },

]
