import type { Brief } from './types'

/**
 * First-party creative-brief pool (original, MIT) — copied verbatim from the
 * original Pitch's src/content/briefs.ts. Each brief asks players to invent a
 * product — a NAME + a one-line PITCH. No knowledge required; pure creativity.
 * Briefs are grouped loosely by `tag` (gadget / app / sport / …) which the
 * Stage surfaces as a category chip.
 *
 * The hub passes this full pool statically via ReduceCtx.content; the engine
 * draws from it with a seeded pick + per-game used-brief dedupe (see pickBrief
 * in engine.ts).
 */
export const BRIEF_POOL: Brief[] = [
  { id: 'ip-alarm', prompt: 'Invent a gadget that makes waking up in the morning genuinely enjoyable.', tag: 'gadget' },
  { id: 'ip-socks', prompt: 'Invent a gadget that finally solves the mystery of where the other sock goes.', tag: 'gadget' },
  { id: 'ip-leftovers', prompt: 'Invent a gadget that tells you exactly how old the leftovers in the back of the fridge really are.', tag: 'gadget' },
  { id: 'ip-fold-fitted', prompt: 'Invent a gadget that folds a fitted bedsheet so it looks like an actual square.', tag: 'gadget' },
  { id: 'ip-remote-finder', prompt: 'Invent a gadget that summons the TV remote no matter where it has hidden.', tag: 'gadget' },
  { id: 'ip-small-talk', prompt: 'Invent a gadget that gracefully ends an awkward conversation for you.', tag: 'gadget' },
  { id: 'ip-untangle', prompt: 'Invent a gadget that untangles any cord, necklace, or string of holiday lights instantly.', tag: 'gadget' },
  { id: 'ip-hiccups', prompt: 'Invent a gadget that cures hiccups on the first try, every time.', tag: 'gadget' },
  { id: 'ip-name-recall', prompt: 'Invent a gadget that whispers a person’s name to you right when you forget it.', tag: 'gadget' },
  { id: 'ip-shower-thoughts', prompt: 'Invent a gadget that captures your best ideas the moment you have them in the shower.', tag: 'gadget' },

  { id: 'ip-app-procrastinate', prompt: 'Invent an app that helps you procrastinate more productively.', tag: 'app' },
  { id: 'ip-app-split-bill', prompt: 'Invent an app that settles “who owes what” after a group dinner without anyone getting upset.', tag: 'app' },
  { id: 'ip-app-plant-talk', prompt: 'Invent an app that translates what your houseplants are trying to tell you.', tag: 'app' },
  { id: 'ip-app-excuse', prompt: 'Invent an app that generates a believable excuse to leave any event early.', tag: 'app' },
  { id: 'ip-app-fridge-recipe', prompt: 'Invent an app that turns the three sad ingredients in your fridge into dinner.', tag: 'app' },
  { id: 'ip-app-argue-win', prompt: 'Invent an app that helps you win an argument you’ve already lost.', tag: 'app' },
  { id: 'ip-app-line-pick', prompt: 'Invent an app that predicts which grocery checkout line will actually be fastest.', tag: 'app' },
  { id: 'ip-app-rate-nap', prompt: 'Invent an app that scores how good your nap was and gives you tips to improve.', tag: 'app' },
  { id: 'ip-app-text-tone', prompt: 'Invent an app that tells you whether that text message sounded passive-aggressive before you send it.', tag: 'app' },
  { id: 'ip-app-pet-translate', prompt: 'Invent an app that finally lets you understand exactly why the dog is barking.', tag: 'app' },

  { id: 'ip-sport-indoor', prompt: 'Pitch a brand-new sport that can only be played indoors during a thunderstorm.', tag: 'sport' },
  { id: 'ip-sport-no-running', prompt: 'Pitch a brand-new competitive sport that involves absolutely no running.', tag: 'sport' },
  { id: 'ip-sport-couch', prompt: 'Pitch a brand-new sport that can be played entirely from a couch.', tag: 'sport' },
  { id: 'ip-sport-grandparents', prompt: 'Pitch a brand-new sport designed so that grandparents always win.', tag: 'sport' },
  { id: 'ip-sport-office', prompt: 'Pitch a brand-new sport that office workers can secretly play at their desks.', tag: 'sport' },
  { id: 'ip-sport-rainy', prompt: 'Pitch a brand-new Olympic event that has never been considered athletic before.', tag: 'sport' },

  { id: 'ip-holiday-monday', prompt: 'Pitch a brand-new holiday that makes Mondays something to look forward to.', tag: 'holiday' },
  { id: 'ip-holiday-celebrate', prompt: 'Pitch a brand-new holiday that celebrates something everyone secretly enjoys but never admits.', tag: 'holiday' },
  { id: 'ip-holiday-traditions', prompt: 'Pitch a brand-new holiday and the one bizarre tradition everyone has to do.', tag: 'holiday' },

  { id: 'ip-snack-midnight', prompt: 'Pitch a brand-new snack engineered specifically for 2 a.m. cravings.', tag: 'food' },
  { id: 'ip-snack-noiseless', prompt: 'Pitch a brand-new snack that is completely silent to eat in a quiet room.', tag: 'food' },
  { id: 'ip-snack-flavor', prompt: 'Pitch a brand-new flavor of ice cream that absolutely should not work but somehow does.', tag: 'food' },
  { id: 'ip-snack-mood', prompt: 'Pitch a brand-new candy that changes flavor based on your mood.', tag: 'food' },
  { id: 'ip-snack-breakfast', prompt: 'Pitch a brand-new breakfast cereal aimed at people who hate mornings.', tag: 'food' },
  { id: 'ip-drink-energy', prompt: 'Pitch a brand-new beverage that gives you energy without the jittery crash.', tag: 'food' },

  { id: 'ip-transport-stairs', prompt: 'Pitch a brand-new mode of transport for getting up one flight of stairs.', tag: 'transport' },
  { id: 'ip-transport-commute', prompt: 'Pitch a brand-new mode of transport that makes the morning commute fun.', tag: 'transport' },
  { id: 'ip-transport-grocery', prompt: 'Pitch a brand-new mode of transport for carrying all the groceries in one trip.', tag: 'transport' },
  { id: 'ip-transport-lazy', prompt: 'Pitch a brand-new mode of transport for crossing a single room without standing up.', tag: 'transport' },

  { id: 'ip-group-night-owls', prompt: 'Design a product for people who are wide awake at 3 a.m. and bored.', tag: 'service' },
  { id: 'ip-group-bad-cooks', prompt: 'Design a product for people who burn water.', tag: 'service' },
  { id: 'ip-group-tall', prompt: 'Design a product for people who are too tall for literally everything.', tag: 'service' },
  { id: 'ip-group-houseplant-killers', prompt: 'Design a product for people who have killed every plant they’ve ever owned.', tag: 'service' },
  { id: 'ip-group-cold-hands', prompt: 'Design a product for people whose hands are always freezing cold.', tag: 'service' },
  { id: 'ip-group-bad-dancers', prompt: 'Design a product for people who have no idea what to do with their hands while dancing.', tag: 'service' },
  { id: 'ip-group-overpackers', prompt: 'Design a product for people who pack three suitcases for a weekend trip.', tag: 'service' },
  { id: 'ip-group-meeting-zoners', prompt: 'Design a product for people who zone out and miss their name being called in meetings.', tag: 'service' },

  { id: 'ip-secret-parents', prompt: 'What’s a product every exhausted parent secretly needs?', tag: 'service' },
  { id: 'ip-secret-students', prompt: 'What’s a product every student pulling an all-nighter secretly needs?', tag: 'service' },
  { id: 'ip-secret-dog-owners', prompt: 'What’s a product every dog owner secretly needs but is too embarrassed to ask for?', tag: 'pet' },
  { id: 'ip-secret-introverts', prompt: 'What’s a product every introvert at a party secretly needs?', tag: 'service' },
  { id: 'ip-secret-roommates', prompt: 'What’s a product every roommate secretly wishes their roommate would buy?', tag: 'service' },

  { id: 'ip-worst-umbrella', prompt: 'Invent the worst possible umbrella and explain why someone would still buy it.', tag: 'gadget' },
  { id: 'ip-worst-alarm', prompt: 'Invent the worst possible alarm clock that technically still gets you out of bed.', tag: 'gadget' },
  { id: 'ip-worst-restaurant', prompt: 'Invent the worst possible restaurant concept that somehow becomes wildly popular.', tag: 'service' },
  { id: 'ip-worst-vending', prompt: 'Invent the worst possible vending machine and what it dispenses.', tag: 'gadget' },
  { id: 'ip-worst-theme-park', prompt: 'Invent the worst possible theme park ride that people line up for anyway.', tag: 'service' },

  { id: 'ip-mascot-veggies', prompt: 'Invent a mascot whose job is to get kids excited about eating vegetables.', tag: 'pet' },
  { id: 'ip-mascot-taxes', prompt: 'Invent a cheerful mascot for the most boring task imaginable: doing your taxes.', tag: 'pet' },
  { id: 'ip-pet-lowmaintenance', prompt: 'Invent a brand-new pet that requires zero effort and never disappoints you.', tag: 'pet' },
]
