// Stacking Cats: the story. Pure data and tiny helpers (no DOM), so the intro cutscene and the game screens share one script.
// The land of Whiskerton was overrun by King Squeakimus and the Gnaw Army, who catnapped the royal guard and locked them in nests.

export const WORLD = {
  land: 'Whiskerton',
  villain: 'King Squeakimus',
  army: 'the Gnaw Army',
  tagline: 'Stack your paws. Smash the nests. Rescue the royal guard!',
};

// the cutscene: one entry per scene, dur in seconds, text is the caption typed on screen
export const INTRO = [
  { id: 'peace', dur: 5.0, text: 'In the purr-fect land of Whiskerton, cats napped in the sun and life was paw-some.' },
  { id: 'moon', dur: 4.8, text: 'Then one night the Cheese Moon went dark, and the mice crept out to squeak.' },
  { id: 'horde', dur: 5.6, text: 'King Squeakimus and the Gnaw Army overran every meadow!' },
  { id: 'nap', dur: 5.2, text: 'They catnapped the whole royal guard and locked each cat in a nest.' },
  { id: 'heroes', dur: 6.0, text: 'But three brave cats said: not one more whisker will be lost!' },
  { id: 'charge', dur: 6.4, text: WORLD.tagline },
];
export const INTRO_LEN = INTRO.reduce((a, s) => a + s.dur, 0);

// which scene is playing at time t (seconds), how far through it we are (0..1), and whether the whole intro is over
export function introAt(t) {
  if (t <= 0) return { i: 0, p: 0, t: 0, done: false };
  let at = 0;
  for (let i = 0; i < INTRO.length; i++) {
    if (t < at + INTRO[i].dur) return { i, p: (t - at) / INTRO[i].dur, t: t - at, done: false };
    at += INTRO[i].dur;
  }
  return { i: INTRO.length - 1, p: 1, t: INTRO[INTRO.length - 1].dur, done: true };
}

// typewriter: the first part of a caption, p is 0..1 of the way through typing
export function typed(text, p) {
  const n = Math.max(0, Math.min(text.length, Math.round(text.length * p)));
  return text.slice(0, n);
}

// shown on the "a caged cat is free" screen, one per nest
export const RESCUE_LINES = [
  'Meow-velous! You smashed the nest.',
  'Paws-itively purr-fect! The nest is rubble.',
  'Fur-tunately you came! The nest is down.',
  'Whisker-ific work! Another nest falls.',
  'Cat-tastic! The cage is open.',
  'Claw-some! The Gnaw Army is shaking.',
];
export const rescueLine = (n) => RESCUE_LINES[((n | 0) % RESCUE_LINES.length + RESCUE_LINES.length) % RESCUE_LINES.length];

// shown when the stack falls: cats always land on their paws
export const FALL_LINES = [
  'The mice cheer, but a cat always lands on its paws.',
  'King Squeakimus laughs. Not for long, whiskers up!',
  'Nine lives, many naps. Next time you will get them.',
  'The royal guard is still waiting. Paws up and try again!',
  'That was a hiss-terical fight. The nests are not safe yet.',
];
export const fallLine = (n) => FALL_LINES[((n | 0) % FALL_LINES.length + FALL_LINES.length) % FALL_LINES.length];
