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

// chapters: every stage (5 waves, ending in a nest) is one chapter in one region of Whiskerton; the map starts over after the last region
export const CHAPTERS = [
  'The mice are in the meadow. Time to paws and fight!',
  'Leaves crunch and whiskers twitch. They are close.',
  'Across the rooftops the Cheese Moon is watching.',
  'Stinky, cheesy and full of mice. Purr-fect.',
  'Cold paws, warm hearts. Keep stacking!',
  'Pink petals fall. The mouse king is near.',
];
export const isChapterStart = (wave) => wave >= 1 && wave % 5 === 1;
export function chapterOf(wave) {
  const n = Math.ceil(Math.max(1, wave) / 5);
  return { n, theme: (n - 1) % CHAPTERS.length };
}
// "Chapter 2: Autumn Alley" for the wave banner, the beat itself comes as a toast
export const chapterTitle = (wave, themes) => { const c = chapterOf(wave); return `Chapter ${c.n}: ${themes[c.theme].name}`; };
export const chapterBeat = (wave) => CHAPTERS[chapterOf(wave).theme];
// "Chapter 2: Autumn Alley. Leaves crunch..." shown under the wave banner on the first wave of a chapter
export function chapterLine(wave, themes) {
  const c = chapterOf(wave);
  return `Chapter ${c.n}: ${themes[c.theme].name}. ${CHAPTERS[c.theme]}`;
}

// what King Squeakimus shouts when a nest rises
export const TAUNTS = [
  'Hee hee! These cats are mine now!',
  'My mice will nibble your whiskers off!',
  'No cat has ever beaten my cheese walls!',
  'Squeak! You will never find the royal guard!',
  'Bow to the Cheddar Throne, furballs!',
  'Even nine lives will not save you!',
];
export const taunt = (n) => TAUNTS[((n | 0) % TAUNTS.length + TAUNTS.length) % TAUNTS.length];

// what a caged cat says once a nest falls and it is free
export const FREED_LINES = [
  'Meow-velous, you found me!',
  'My whiskers were shaking in there!',
  'Paws-itively glad to see you!',
  'I knew you would come. Purr-fect timing!',
  'Thank you! Let me help smash the rest.',
  'That cage was no place for a pussycat!',
];
export const freedLine = (n) => FREED_LINES[((n | 0) % FREED_LINES.length + FREED_LINES.length) % FREED_LINES.length];
export const freedToast = (name, n) => `${name}: "${freedLine(n)}"`;

// one line of backstory per cat, shown in the Cat Dex (cat puns on purpose)
const CAT_STORIES = {
  tabby: 'Captain of the royal guard. Never lost a fight, only a few whiskers.',
  ember: 'Born in a fireplace. Warm paws, hot temper, purr-fectly toasty.',
  sparky: 'Rubbed the wrong blanket once and has been shocking ever since.',
  buckshot: 'The deputy of Whiskerton. Keeps the peace with a very loud meow.',
  mochi: 'So fluffy that mice bounce right off. Naps between every fight.',
  yuki: 'Rolls snowballs for fun. Her paws are always cold and her heart is warm.',
  hawkeye: 'Can spot a mouse from three rooftops away. Never blinks, never misses.',
  boomer: 'Loves things that go boom. The guard keeps him far from the curtains.',
  pudding: 'The kindest nurse in the kingdom. A gentle purr heals every scratch.',
  shadow: 'Moves so quietly that even the other cats forget she is there.',
  ronin: 'A wandering swordcat with no master, only a bowl to fill and a duty to keep.',
  merlin: 'Studied magic for nine lives. Still mixes up his spells and his snacks.',
  cutlass: 'Sailed the seven seas for the best tuna. Now he guards the harbour.',
  sprout: 'Grows flowers that smell lovely and mice that hate them.',
  gizmo: 'Builds traps from spare parts and one very patient ball of yarn.',
  lyra: 'Her song makes every cat purr in time and every mouse cover its ears.',
  nibbles: 'A vampire who only drinks milk. Hisses at garlic and at Mondays.',
  zeus: 'Calls the storm with a single meow. Sleeps on clouds when he can.',
  volcano: 'Sleeps on warm rocks, wakes up grumpy and erupts with a roar.',
  blizzard: 'The Ice Queen of Frosty Pond. Her glare freezes mice, her hug warms cats.',
  dusty: 'The fastest paw in the west. Draws before the mouse can squeak.',
  cyber: 'Half cat, half machine, all whiskers. Its laser pointer is not a toy.',
  boo: 'A friendly ghost who haunts the mice. Boo! Meow! It never gets old.',
  draco: 'Raised by dragons, so he purrs in flames and naps on gold.',
  halo: 'A guardian angel with soft paws. Watches over every cat in the stack.',
  mecha: 'A rocket powered cat from the future. Lands on its feet, every time.',
  hexa: 'A witch cat with a crooked hat. Her curses make mice trip over their tails.',
  nori: 'The sushi master of the guard. Every roll is made with love and fish.',
  leo: 'The Lion King, ruler of cats. His roar made the Mouse King tremble.',
  nebula: 'Weaves stars into her fur. Some say she purrs in constellations.',
  biscuit: 'Bakes the guard\'s bread before sunrise. Her loaves are warm, soft and surprisingly heavy.',
  pearl: 'Sings to the tide from the Frosty Pond. Her bubbles tickle, her voice calms the whole guard.',
};
export const catStory = (id) => CAT_STORIES[id] || '';

// the chapter beat is a toast, and the first coach tip clears toasts, so on wave 1 it steps aside while that tip is still to come
export const beatToastWanted = (wave, firstTipPending) => isChapterStart(wave) && !(wave === 1 && firstTipPending);

// the ending: the last nest of the first trip around the map is King Squeakimus himself. The run can go on afterwards.
export const FINALE_WAVE = CHAPTERS.length * 5;
export const finaleDue = (wave, alreadyShown) => wave === FINALE_WAVE && !alreadyShown;
export const finaleGems = (firstTime) => (firstTime ? 5 : 0);
export const FINALE_TITLE = 'King Squeakimus is defeated!';
export const FINALE_LINES = [
  'The last nest crumbles and the Cheddar Throne tips over with a squeak.',
  'Every caged cat is free. Whiskerton is safe, the Cheese Moon shines again and the whole royal guard is purring.',
  'But mice are always hiding in the cheese. Want to keep the guard in shape?',
];

// the ending cutscene, shown from the finale card: a party under the returned Cheese Moon, then the guard walks on into the sunrise
export const EPILOGUE = [
  { id: 'party', dur: 5.6, text: 'The Cheese Moon shone again and all of Whiskerton purred until sunrise.' },
  { id: 'dawn', dur: 6.4, text: 'But mice are never far away. The royal guard is ready for the next squeak!' },
];
export const EPILOGUE_LEN = EPILOGUE.reduce((a, s) => a + s.dur, 0);
export function epilogueAt(t) {
  if (t <= 0) return { i: 0, p: 0, t: 0, done: false };
  let at = 0;
  for (let i = 0; i < EPILOGUE.length; i++) {
    if (t < at + EPILOGUE[i].dur) return { i, p: (t - at) / EPILOGUE[i].dur, t: t - at, done: false };
    at += EPILOGUE[i].dur;
  }
  return { i: EPILOGUE.length - 1, p: 1, t: EPILOGUE[EPILOGUE.length - 1].dur, done: true };
}

// the banner after a nest falls: that nest was the last fight of its chapter
export const chapterDoneLine = (wave) => `Chapter ${chapterOf(wave).n} complete! A friend is free!`;

// the line under the logo: it follows the story, from the first call to arms to the hunt for the last caged cats
export function titleTag(storyDone, unlocked, total) {
  if (storyDone && unlocked >= total) return 'Every cat is free and purring. Whiskerton is safe!';
  if (storyDone) return `The Cheddar Throne has fallen. ${total - unlocked} cats still caged!`;
  if (unlocked > 3) return `${unlocked} of ${total} cats rescued. Keep smashing the nests!`;
  return 'Stack your cats. Merge them. Smash the mouse nests.';
}

// the nest bar title: the wave 30 nest is the mouse king's own, every other nest keeps its name
export const nestTitle = (wave, name) => (wave === FINALE_WAVE ? `King Squeakimus: ${name}` : name);
// the big banner when a nest wave starts: the wave 30 nest is the showdown with the mouse king
export const nestBannerTitle = (wave) => (wave === FINALE_WAVE ? 'FINAL BATTLE!' : 'NEST BATTLE!');

// the subtitle on the "choose your starting cats" screen: the first pick sets the story up
export const pickLine = (n) => (n === 0
  ? 'Brave cats set out to free the royal guard. Every cat attacks differently, so pick the first one for your tower.'
  : 'Pick a friend to stack on top. Choosing the same cat again merges them!');

// the subtitle on the road choice screen: it names the region of the next chapter. wave is the nest wave that just fell
export function roadLine(wave, themes) {
  const c = chapterOf(wave + 1);
  return `Where to next? Chapter ${c.n} waits in ${themes[c.theme].name}. This road shapes the next five waves and the next nest.`;
}

// splits a caption into lines no wider than maxW (measure gives a string's width). A caption that needs two lines is
// balanced so the second line is never a lonely word
export function wrapCaption(text, measure, maxW) {
  const wrap = (limit) => {
    const lines = []; let cur = '';
    for (const w of text.split(' ')) { const t = cur ? cur + ' ' + w : w; if (measure(t) > limit && cur) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    return lines;
  };
  const lines = wrap(maxW);
  if (lines.length !== 2) return lines;
  const balanced = wrap(Math.min(maxW, measure(text) / 2 + 70));
  return balanced.length === 2 ? balanced : lines;
}

// a story line for the Cat Kingdom: the village the Gnaw Army wrecked grows back as the player upgrades it
export function kingdomLine(level) {
  if (level < 6) return 'The Gnaw Army wrecked Whiskerton. Rebuild it!';
  if (level < 16) return 'Whiskerton is getting cosy again.';
  if (level < 30) return 'Whiskerton is busy and happy.';
  return 'Whiskerton is the finest village in the land!';
}

// the line over the cats a run has just freed from the Gnaw Army (unlocked), one or several
export const freedLineFor = (n) => (n === 1 ? 'A caged cat is free and joins the royal guard!' : `${n} caged cats are free and join the royal guard!`);
