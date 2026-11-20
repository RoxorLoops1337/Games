// Million To One: all game data (zones, mutations, Dad's habits, story lines).
// Pure data, no DOM. core.js reads it, the page reads it for text.

export const TOTAL_SWIMMERS = 1000000;
export const PX_PER_CM = 6250;          // world units per centimetre (display only)

// Each zone: length in world units, tube half-width, hazards it spawns, and how hard
// it is on the field: q = chance an abstract rival dies here, keep = share of the
// million that survive it (drives the "alive" counter and each rival's weight).
export const ZONES = [
  { id: 'launch', name: 'The Launch Tube', len: 9000, hw: 120, wob: 40, q: 0.08, keep: 0.72,
    col: ['#3a0d2e', '#7a1f5e'], wall: '#ff7aa8', beat: 96,
    hazards: { sugar: 1.0 },
    coach: 'Coach Gonad: "Wiggle, Kevin! WIGGLE!"' },
  { id: 'acid', name: 'Acid Lagoon', len: 15000, hw: 175, wob: 70, q: 0.34, keep: 0.16,
    col: ['#16301a', '#2f4a17'], wall: '#b6ff5c', beat: 104,
    hazards: { sugar: 0.9, acid: 1.0, alkali: 0.4 },
    coach: 'Coach Gonad: "pH 4, people! Green puddles melt you. Blue bubbles are antacid. Do NOT lick anything. I mean it."' },
  { id: 'goo', name: 'The Gate of Goo', len: 12000, hw: 150, wob: 30, q: 0.3, keep: 0.2,
    col: ['#2e3448', '#7d86a8'], wall: '#eef2ff', beat: 110,
    hazards: { sugar: 0.9, gate: 1.0, goo: 0.6 },
    coach: 'Coach Gonad: "Goo walls! Aim for the gaps. Hit the goo and you stick like a raisin in porridge. Nobody wants to be the raisin."' },
  { id: 'sea', name: 'The Great Womb Sea', len: 22000, hw: 200, wob: 90, q: 0.36, keep: 0.1,
    col: ['#4a0c14', '#b02a36'], wall: '#ff7a5c', beat: 116,
    hazards: { sugar: 0.8, wbc: 1.0, current: 0.7, acid: 0.2 },
    coach: 'Coach Gonad: "Big Macros ahead! White blood cells EAT swimmers. Keep a rival between you and the mouth. Teamwork!"' },
  { id: 'fork', name: 'The Fork', len: 6000, hw: 190, wob: 0, q: 0.5, keep: 0.5,
    col: ['#100828', '#3e1d78'], wall: '#ff9be0', beat: 120, fork: true,
    hazards: { sugar: 0.6, acid: 0.35, goo: 0.3 },
    coach: 'Coach Gonad: "Two tubes. One egg. Follow the pink sparkles, son. The other tube is a very long, very empty hallway."' },
  { id: 'rapids', name: 'Tube Rapids', len: 16000, hw: 105, wob: 50, q: 0.36, keep: 0.3,
    col: ['#04303c', '#0f7a8a'], wall: '#5ce1ff', beat: 128, current: 0.22,
    hazards: { sugar: 1.1, wbc: 0.6, cilia: 1.0 },
    coach: 'Coach Gonad: "The current is AGAINST you. Hug the middle, chain your overtakes, DASH! Wait out the wall hairs!"' },
  { id: 'egg', name: 'THE EGG', len: 4000, hw: 170, wob: 0, q: 0, keep: 1,
    col: ['#3b2a08', '#6b4a10'], wall: '#ffd75c', beat: 136, egg: true,
    hazards: { sugar: 0.5 },
    coach: 'Coach Gonad: "THERE SHE IS. First one in becomes a PERSON. Everybody else becomes a fun fact. TAP TAP TAP!"' },
];
export const RACE_LEN = ZONES.reduce((s, z) => s + z.len, 0);

// rarity: 1 common, 2 rare, 3 legendary. max: how many times it can be taken.
export const MUTATIONS = {
  turbo:   { name: 'Turbo Tail',       icon: '🌀', r: 1, max: 3, desc: '+10% swim speed.' },
  tank:    { name: 'Big Fructose Tank', icon: '🛢️', r: 1, max: 4, desc: '+30 max energy and a full refill.' },
  helmet:  { name: 'Helmet Head',      icon: '⛑️', r: 1, max: 3, desc: '+1 shield. Bonk!' },
  draft:   { name: 'Slipstream Pro',   icon: '💨', r: 1, max: 3, desc: 'Drafting is 60% stronger and refills energy.' },
  magnet:  { name: 'Sugar Magnet',     icon: '🧲', r: 1, max: 3, desc: 'Pickups fly to you from further away.' },
  sweet:   { name: 'Sweet Tooth',      icon: '🍓', r: 1, max: 3, desc: 'Fruit sugar gives +50% energy.' },
  antacid: { name: 'Antacid Coat',     icon: '🧴', r: 1, max: 2, desc: 'Acid burns 60% less.' },
  eco:     { name: 'Lazy Wiggle',      icon: '😴', r: 1, max: 3, desc: 'Energy drains 18% slower.' },
  memory:  { name: 'Long Memory',      icon: '🧠', r: 1, max: 3, desc: 'Combos last 1 second longer.' },
  whip:    { name: 'Whiplash',         icon: '⚡', r: 1, max: 3, desc: 'Dash recharges 35% faster and costs less.' },
  ram:     { name: 'Battering Ram',    icon: '🐏', r: 2, max: 2, desc: 'Bump rivals aside for +1 combo and +3 energy.' },
  rush:    { name: 'Overtake Rush',    icon: '🔋', r: 2, max: 3, desc: 'Every overtake gives +1.5 energy.' },
  hype:    { name: 'Hype Man',         icon: '📣', r: 2, max: 2, desc: 'FRENZY needs 3 fewer combo and lasts 2s longer.' },
  goo:     { name: 'Goo Surfer',       icon: '🏄', r: 2, max: 1, desc: 'Goo and mucus walls barely slow you.' },
  wingman: { name: 'Wingman',          icon: '🤝', r: 2, max: 2, desc: 'A buddy swims with you and takes one hit per zone.' },
  nose:    { name: 'Egg Nose',         icon: '👃', r: 2, max: 1, desc: 'You smell the right tube. Big arrow at the Fork.' },
  bloom:   { name: 'Late Bloomer',     icon: '🌱', r: 2, max: 1, desc: '+4% speed for every zone you clear.' },
  spiky:   { name: 'Spiky Hat',        icon: '🦔', r: 3, max: 1, desc: 'White blood cells that touch you POP. You eat the shield.' },
  nitro:   { name: 'Nitro Frenzy',     icon: '🔥', r: 3, max: 1, desc: 'During FRENZY nothing can hurt you and dash is free.' },
  second:  { name: 'Second Wind',      icon: '💖', r: 3, max: 1, desc: 'Once per run: run dry and you get back up with 60 energy.' },
  mosh:    { name: 'Mosh Pit',         icon: '🤘', r: 3, max: 1, desc: 'Each FRENZY start blasts nearby rivals out of your way.' },
  slick:   { name: 'Slick Moves',      icon: '🕺', r: 1, max: 2, desc: 'Near misses count as +1 extra combo and give +2 energy.' },
  lucky:   { name: 'Lucky Swimmer',    icon: '🍀', r: 1, max: 3, desc: 'DNA blobs show up 50% more often and are worth +2.' },
  echo:    { name: 'Echo Chamber',     icon: '🔁', r: 2, max: 1, desc: 'When a combo runs out you keep half of it.' },
  chain:   { name: 'Chain Reaction',   icon: '💥', r: 3, max: 1, desc: 'In FRENZY every combo counts double and each overtake adds FRENZY time.' },
};
export const MUT_ORDER = Object.keys(MUTATIONS);

// Dad's Habits: the permanent (rogue-lite) upgrades, bought with DNA between runs.
// Healthy dad, healthy swimmers.
export const HABITS = {
  broccoli: { name: 'Dad eats broccoli',     icon: '🥦', max: 10, base: 40, grow: 1.5, desc: '+5% swim speed' },
  water:    { name: 'Dad drinks water',      icon: '💧', max: 10, base: 30, grow: 1.5, desc: '+12 max energy' },
  sleep:    { name: 'Dad sleeps 8 hours',    icon: '😴', max: 8,  base: 55, grow: 1.5, desc: '-5% energy drain' },
  jeans:    { name: 'Dad ditches tight jeans', icon: '👖', max: 8, base: 45, grow: 1.5, desc: 'Start 250 µm further up the field' },
  berries:  { name: 'Dad eats berries',      icon: '🫐', max: 8,  base: 35, grow: 1.5, desc: '+10% energy from fruit sugar' },
  walk:     { name: 'Dad walks every day',   icon: '🚶', max: 6,  base: 60, grow: 1.5, desc: '+8% drafting power' },
  beatbox:  { name: 'Dad beatboxes',         icon: '🎤', max: 6,  base: 55, grow: 1.5, desc: 'Combos last +0.25s longer' },
  hottub:   { name: 'No more hot tubs',      icon: '🛁', max: 2,  base: 150, grow: 2.5, desc: 'Start every run with +1 shield' },
  meditate: { name: 'Dad meditates',         icon: '🧘', max: 3,  base: 80, grow: 2.4,  desc: '+1 reroll of mutation cards per run' },
  factory:  { name: 'Bigger factory',        icon: '🏭', max: 10, base: 90, grow: 1.35, desc: "Earn more DNA while you're away" },
  gps:      { name: "Dad's sat-nav",         icon: '🛰️', max: 1,  base: 1200, grow: 1,  desc: 'Unlock AUTOPILOT (it swims for you, a bit badly)' },
};
export const HABIT_ORDER = Object.keys(HABITS);
// Grandad levels (past max, they come with the generations) grow 20% a level from the last normal price.
export const habitCost = (id, lv) => {
  const H = HABITS[id];
  if (lv < H.max) return Math.round(H.base * Math.pow(H.grow, lv));
  return Math.round(habitCost(id, H.max - 1) * Math.pow(1.2, lv - H.max + 1));
};

// Named rivals: the real race. sp is speed relative to the field, smart is the chance they pick the right tube.
export const RIVALS = [
  { name: 'Steve', sp: 0.96, smart: 0.6, drill: 0.85, col: '#9ad0ff', line: 'Steve is just happy to be here. Steve waved at a wall earlier.' },
  { name: 'Brock', sp: 1.08, smart: 0.65, drill: 1.0, col: '#ffb36b', line: 'Brock drinks nine protein shakes a day. Brock is 60% shake.' },
  { name: 'Tiffany', sp: 1.17, smart: 0.85, drill: 1.04, col: '#ff8be0', line: 'Tiffany has read every book about eggs. Twice. With a highlighter.' },
  { name: 'Gunther', sp: 0.98, smart: 0.7, drill: 0.98, col: '#b6ff5c', line: 'Gunther does his own stunts. Gunther has no stunt double. Nobody does.' },
  { name: 'Chad Thundertail', sp: 0.99, smart: 0.45, drill: 1.06, col: '#ffd75c', line: "Chad has won this race 0 times. Chad thinks it's 1000." },
];

export const COMBO_WORDS = [
  [3, 'NICE'], [6, 'SPICY'], [10, 'ON A ROLL'], [15, 'TAIL ON FIRE'], [20, 'UNSTOPPABLE'],
  [30, 'MENACE'], [45, 'COACH TRIED TO CRY'], [60, 'POWERHOUSE OF THE CELL'], [100, 'ABSOLUTE UNIT'],
];

export const DEATH_LINES = {
  energy: [
    'Tail went floppy, like a noodle in the rain.', 'Sugar tank empty. Kevin now rattles a bit.',
    'Tail cramp. Classic.', 'Should have eaten more fruit.',
    'Battery at 0%. No charger in here.', 'Stopped for a little lie down. Forever.',
    'Wiggled the last wiggle.', 'Out of sugar. Dad should have had the smoothie.',
    'Tail said "I\'m done" and meant it.', 'Fell asleep mid-swim. Very relatable.',
    'Ran on fumes. The fumes ran out.',
  ],
  // Ran dry within sight of the egg (zone 5 and up).
  energyEgg: [
    'Could see the egg. The egg could see you. Awkward.',
    'Ran dry on the doorstep. Rang no doorbell.',
    "The egg was RIGHT THERE. Your tail wasn't.",
    'So close you could read the welcome mat.',
    'Parked on the egg\'s porch. Out of petrol.',
    'Saw the egg, waved, ran out of wave.',
  ],
  acid: [
    'Fizzed like a dropped soda.',
    'The lagoon did a little burp. That was you.',
    "Tried the acid. Zero stars. Wouldn't repeat.",
    'Pulled a Gary. We do not talk about it.',
    'Went in a Kevin. Came out a lemon fizz.',
    'Dad\'s smoothie was too acidic. Then so was Kevin.',
    'Melted politely, like a lolly in July.',
    'Tiffany read about this exact puddle. Ouch.',
  ],
  bonk: [
    'Stuck to the goo like a toddler to a shop window.',
    "Headbutted the goo. The goo didn't notice.",
    'Wiggled into the gloop and stayed there.',
    'Now part of the wall. A very small part.',
    'Set like jelly at a birthday party.',
    'Bonked the goo. Brock called it leg day.',
    'Stuck fast. The goo wants a hug forever.',
    'Raisin in the porridge. Coach did warn you.',
  ],
  wbc: [
    'Gobbled by a Big Macro.', "A Big Macro's packed lunch. Crusts and all.",
    'Eaten. The Big Macro left a one star review.',
    'A white blood cell said "yum" and that was that.', "Swallowed whole. It didn't even chew.",
    'Somewhere, a white blood cell does a tiny burp.', "Hugged by a Big Macro. It wasn't a hug.",
    'Big Macro with extra Kevin.', 'The immune system did its job. Rude, but fair.',
    "A Big Macro waved. It wasn't waving.",
  ],
  wrong: [
    'Wrong tube. No egg here. Just vibes.', 'Took the scenic route. It was empty.',
    'Swam into the spare room. Nobody lives here.', 'Turned left. Should have turned right. Story of every Kevin.',
    'This tube was for display purposes only.', 'Lovely tube. Shame about the total lack of egg.',
    'Ignored the pink sparkles. The sparkles are sad.',
  ],
  late: [
    'Someone else got the egg. You got the doormat.', 'So close. The egg already had plans.',
    'The egg is taken. She has a type and it\'s "earlier".', 'Beaten at the door. Your tail wants a recount.',
    'Door closed. Shoes still on. Awkward.', 'Beaten by a tail. Literally a tail.',
    'A rival drilled faster. Tap like you mean it next time.',
    'Touched the egg. The egg moved on.',
    'At the door, but the door was busy.',
    'Drilled with heart. Drilled a bit slow.',
  ],
  quit: [
    'Kevin is taking a little break. Totally allowed.',
    'Swam off for a snack. The egg will wait. Probably.',
    'Tactical retreat. Coach Gonad respects the self-care.',
    'Gone to stretch. The tail has a lot of tail.',
    'Paused for a juice box. Dad would approve.',
    'Steve is holding your place. He waved twice.',
  ],
};

export const INTRO = [
  'Somewhere, a candlelit dinner is going VERY well.',
  'One million tiny swimmers line up.',
  "You're Kevin. Swimmer #1,000,000.",
  'Dead last.',
  'Only ONE becomes a person.',
  'SWIM.',
];

const NAME_A = [
  'Little', 'Baby', 'Tiny', 'Big', 'Sir', 'Lady', 'Captain', 'Professor', 'DJ', 'MC',
  'Doctor', 'Admiral', 'Duchess', 'Lil', 'Chief', 'Grand Duke', 'Turbo', 'Sergeant', 'Auntie', 'Coach',
  'Agent', 'Saint', 'Mega', 'Sweet', 'Major', 'Count', 'Queen', 'Detective', 'Señor', 'Nana',
];
const NAME_B = [
  'Kevin', 'Noor', 'Loops', 'Jas', 'Pip', 'Bean', 'Mo', 'Zuri', 'Otto', 'Lina', 'Rex', 'Juno', 'Milo', 'Ivy', 'Bo', 'Nova',
  'Wiggles', 'Biscuit', 'Pickle', 'Noodle', 'Sprout', 'Kale', 'Turnip', 'Waffles', 'Dumpling', 'Ziggy', 'Tofu', 'Nugget',
  'Pebble', 'Ravi', 'Luna', 'Kofi', 'Ada', 'Sunny', 'Mochi', 'Olive', 'Bramble', 'Fig', 'Basil', 'Yuki', 'Amara', 'Zed',
];
const TRAIT = {
  turbo: 'is always early', tank: 'never gets tired', helmet: 'has a very hard head', draft: 'loves tailgating',
  magnet: 'is a snack magnet', sweet: 'eats fruit for breakfast, lunch and dinner', antacid: 'licked the acid and lived to brag about it', eco: 'naps like a champion',
  memory: 'never forgets a face', whip: 'has lightning reflexes', ram: 'wins every pillow fight', rush: 'loves a queue to jump',
  hype: 'is the loudest at every party', goo: 'loves slime', wingman: 'has a best friend for life', nose: 'can smell cookies from 3 rooms away',
  bloom: 'peaks at 40', spiky: 'has amazing hair', nitro: 'is basically a firework', second: 'never gives up', mosh: 'starts a mosh pit at every concert',
  slick: 'dances out of every argument', lucky: 'finds coins down every sofa', echo: 'tells the punchline twice', chain: 'sets off the smoke alarm making toast',
};
// Used when a mutation has no trait written yet (new mutations get one of these).
const TRAIT_SPARE = [
  'cries at nature documentaries', 'already has opinions about cheese', 'high-fives strangers', 'is suspiciously good at hide and seek',
  'hums while eating', 'refuses to wear socks', 'was born doing a little dance', 'thinks broccoli is tiny trees and loves them',
];
export function babyFor(rng, muts) {
  const name = NAME_A[Math.floor(rng() * NAME_A.length)] + ' ' + NAME_B[Math.floor(rng() * NAME_B.length)];
  const ids = Object.keys(muts).filter((k) => muts[k] > 0).sort((a, b) => muts[b] - muts[a]);
  const traits = ids.slice(0, 3).map((k, i) => TRAIT[k] || TRAIT_SPARE[(k.length * 7 + i) % TRAIT_SPARE.length]);
  if (!traits.length) traits.push('did it with nothing but raw talent');
  const hue = Math.floor(rng() * 360);
  return { name, traits, hue, top: ids.slice(0, 3) };
}

// ---------------------------------------------------------------- extra story text
// Random Coach Gonad quips shown mid-zone (one per zone id). Every line is short enough for a phone toast.
export const ZONE_LINES = {
  launch: [
    'Coach Gonad: "Draft behind a rival and you go faster for free. Free is my favourite price!"',
    'Coach Gonad: "Grab the fruit sugar! Energy is life. Also snacks are life."',
    'Coach Gonad: "Overtake, overtake, overtake! Chain them for a COMBO!"',
    'Coach Gonad: "999,999 to go. Easy. I did the maths on a napkin."',
    'Coach Gonad: "Hit DASH for a burst. It eats energy, so don\'t spam it like a doorbell."',
    'Coach Gonad: "Your dad ate broccoli for this moment. Don\'t let the broccoli down."',
  ],
  acid: [
    'Coach Gonad: "Green puddle = ouch. Blue bubble = aaah. Remember the colours!"',
    'Coach Gonad: "This place has the pH of a lemon with a grudge."',
    'Coach Gonad: "Swim around the acid, not through it. Unless you have the Antacid Coat. Then show off."',
    'Coach Gonad: "A moment of silence for everyone who licked the lagoon. Okay. Swim."',
    'Coach Gonad: "Keep that combo alive! Every overtake resets the timer."',
  ],
  goo: [
    'Coach Gonad: "Gaps in the wall! Line up early, then go straight through."',
    'Coach Gonad: "Goo slows you down. Goo is the traffic jam of the body."',
    'Coach Gonad: "Bonked a wall? Shake it off! Pretend it was on purpose."',
    'Coach Gonad: "It\'s like jelly, but sadder. Swim faster."',
    'Coach Gonad: "Draft through a gap behind a rival. Let them find the hole for you!"',
  ],
  sea: [
    'Coach Gonad: "The Big Macros are slow but hungry. Like me on a Sunday."',
    'Coach Gonad: "A shield takes one bite for you. Grab them, love them."',
    'Coach Gonad: "Big ocean, tiny you. Find a rival and get behind them. Drafting!"',
    'Coach Gonad: "Currents push you around. Steer against them, or ride them like a pro."',
    'Coach Gonad: "Combo past 10 for FRENZY! Everything gets loud and shiny."',
    'Coach Gonad: "Halfway! I would cry, but I have no tear ducts. I\'m a coach."',
  ],
  fork: [
    'Coach Gonad: "Sparkles, son! Pink sparkles point to the egg. Follow the glitter!"',
    'Coach Gonad: "The wrong tube is a dead end. Literally. Choose wisely."',
    'Coach Gonad: "Left or right? Do NOT flip a coin. You don\'t have hands."',
    'Coach Gonad: "Watch the smart rivals. Tiffany always picks the right tube. Annoying, but useful."',
  ],
  rapids: [
    'Coach Gonad: "The little hairs push you back. Stay in the middle where they can\'t reach!"',
    'Coach Gonad: "DASH through the fast bits! That\'s what it\'s for!"',
    'Coach Gonad: "The tube is narrow. Every overtake counts double in your heart."',
    'Coach Gonad: "Almost there! I can smell the egg. It smells like... success. And cinnamon?"',
    'Coach Gonad: "Swim like Dad walks every day! Which he does now. Thanks to you."',
  ],
  egg: [
    'Coach Gonad: "TAP TAP TAP! Drill in before the others do!"',
    'Coach Gonad: "Faster tapping = faster drilling. Your finger is a hero now."',
    'Coach Gonad: "This is it, Kevin! I\'m SO proud. I\'m also very loud."',
    'Coach Gonad: "Don\'t stop tapping to read this. Seriously, stop reading."',
  ],
};

// Boss rivals: "pass" is what they say when they overtake YOU, "passed" is what they cry when you overtake them.
export const RIVAL_TAUNTS = {
  'Steve': {
    pass: ['Steve: "Oh hi! Sorry! Coming through! Sorry!"', 'Steve: "Is this the race? I think I\'m winning?"', 'Steve: "Nice tail! See you at the egg maybe!"', 'Steve: "I brought orange slices for everyone!"'],
    passed: ['Steve: "Aw, good for you, buddy!"', 'Steve: "I was just enjoying the view anyway."', 'Steve: "Wait, there\'s a SECOND place?"', 'Steve: "Go Kevin! Wait, am I Kevin? No. Go Kevin!"'],
  },
  'Brock': {
    pass: ['Brock: "PROTEIN, BRO!"', 'Brock: "ONE! TWO! Brock counts every wiggle OUT LOUD!"', 'Brock: "Brock goes FAST. Brock goes now."', 'Brock: "Tail day is EVERY day, bro!"'],
    passed: ['Brock: "Brock needs a protein shake."', 'Brock: "Not cool, bro. Kind of cool. Not cool."', 'Brock: "BRO. BROOO."', 'Brock: "Respect. Rematch at the egg, bro."'],
  },
  'Tiffany': {
    pass: ['Tiffany: "Page 412 says you are swimming wrong."', 'Tiffany: "Statistically, I win. Bye!"', 'Tiffany: "I did the reading, Kevin."', 'Tiffany: "Chapter 9: Swimmers Who Are Not You."'],
    passed: ['Tiffany: "That was NOT in the book!"', 'Tiffany: "I am writing a strongly worded letter."', 'Tiffany: "Recalculating... recalculating..."', 'Tiffany: "I am adding you to the footnotes."'],
  },
  'Gunther': {
    pass: ['Gunther: "Watch THIS!" *barrel roll*', 'Gunther: "No stunt double. No fear. No plan."', 'Gunther: "I swim through acid for FUN."', 'Gunther: "Hold my wiggle!"'],
    passed: ['Gunther: "I meant to do that."', 'Gunther: "That was a stunt. You were in my stunt."', 'Gunther: "Gunther will return. In a sequel."', 'Gunther: "Nobody film that. Okay, film it."'],
  },
  'Chad Thundertail': {
    pass: ['Chad: "Thundertail, baby! Out of the way, Kevin!"', 'Chad: "Do you even wiggle, bro?"', 'Chad: "1001 wins. Counting this one."', 'Chad: "My tail has its own fan club."'],
    passed: ['Chad: "What?! The Thundertail has never been passed! Except every time!"', 'Chad: "I let you do that. For the content."', 'Chad: "Tell NO ONE about this."', 'Chad: "You messed up my hair! On camera!"'],
  },
};

// Loading / between-run tips. Half joke, half lesson.
export const TIPS = [
  'Tip: Tuck in behind a rival to DRAFT. You go faster and they do all the work. Classic office move.',
  'Tip: DASH is a burst of speed. Save it for gaps, currents and showing off.',
  'Tip: Overtakes in a row build a COMBO. Keep passing or the combo fades.',
  'Tip: Combo 10 starts FRENZY. Everything goes faster and louder. Like a birthday party with sugar.',
  'Tip: At the Fork, follow the pink sparkles. The other tube is a very nice dead end.',
  'Tip: Green puddles are acid. Blue bubbles are antacid. Your mum was right about colours.',
  'Tip: Don\'t lick the acid. Nobody who licked the acid has ever said "worth it".',
  "Tip: Goo gates have gaps. Line up early. Don't try to headbutt the wall. The wall always wins.",
  'Tip: White blood cells (Big Macros) eat swimmers. A shield saves you once. Keep rivals between you and them.',
  'Tip: Fruit sugar refills energy. Run out and you stop. Forever. No pressure.',
  'Tip: In the Rapids the current pushes back. The middle of the tube is fastest.',
  'Tip: At the egg, TAP as fast as you can. Rivals drill too.',
  'Tip: Spend DNA on Dad\'s Habits. A healthy dad makes speedy swimmers.',
  'Fact: Dad started eating broccoli. Morale is up 400%.',
  'Fact: Dad gave up hot tubs. It was an emotional day for everyone.',
  'Fact: Dad now drinks 8 glasses of water. He visits the bathroom a LOT.',
  'Fact: Kale is just lettuce that goes to the gym.',
  'Fact: Gary licked the Acid Lagoon. We do not talk about Gary.',
  'Dad joke: Why did the broccoli win the race? It had a head start.',
  'Dad joke: What do you call a sad strawberry? A blueberry.',
  "Dad joke: I'm reading a book about anti-gravity smoothies. I can't put it down.",
  'Dad joke: Lettuce celebrate. Your swimmers are getting faster.',
  'Coach Gonad says: "There\'s no I in team. There\'s one in WIN. Think about it."',
  'Coach Gonad says: "Every winner was once a loser who swam again."',
  'Tip: Rare mutations stack in wild ways. Hype Man plus Nitro Frenzy makes a MASHUP. A loud one.',
  'Tip: Chad Thundertail is fast but not smart. Watch the clever rivals at the Fork.',
  'Tip: Even when you lose, you earn DNA. Failure is just practice with confetti.',
  'Tip: A combo only pays once you cash it in. Swipe DOWN before you bonk into anything.',
  "Tip: Goo wall coming and a fat combo going? Cash it in first. A bonk pays nothing.",
];

// Result-screen headline by final rank: the first entry whose maxRank is >= your rank wins.
export const RANK_LINES = [
  [1, 'CHAMPION OF THE UNIVERSE (well, of one person)'],
  [2, 'Second out of a MILLION. Hurts. But wow.'],
  [5, 'Top five! The egg definitely noticed you.'],
  [10, 'Top ten! Coach Gonad tried to cry. He sweated.'],
  [100, 'Top 100. Basically a celebrity in here.'],
  [1000, 'Top 1,000! Better than 999,000 others. Frame this.'],
  [10000, 'Top 10,000. Respectable. Your tail is proud.'],
  [100000, "Top 100,000. Hey, it's a start!"],
  [500000, 'Middle of the pack. Very average. Very cosy.'],
  [900000, 'You beat some swimmers! Some of them were napping.'],
  [999999, 'You passed at least one person. That counts!'],
  [Infinity, 'Still dead last. Bold strategy, Kevin.'],
];
export function rankLine(rank) {
  for (const [m, t] of RANK_LINES) if (rank <= m) return t;
  return RANK_LINES[RANK_LINES.length - 1][1];
}

// Big result titles when you lose (main.js currently has its own small list).
export const LOSE_TITLES = ['SO CLOSE', 'OOF', 'POOPED', 'SPLAT', 'NOT TODAY', 'BONK', 'TRY AGAIN, CHAMP', 'TAIL FAIL'];
// Subtitle under "IT'S A BABY!".
export const WIN_LINES = [
  'You beat 999,999 swimmers. Nature is amazed.',
  'One in a million. Literally. Do the maths.',
  'A new person has been made. They have your tail energy.',
  'Coach Gonad has fainted from pride.',
  'The egg said yes! Somewhere, a crib is being assembled badly.',
];
// Little random helper for any of the arrays above.
export const pickLine = (arr, rng = Math.random) => (arr && arr.length ? arr[Math.floor(rng() * arr.length)] : '');

// ---------------------------------------------------------------- short, punchy text for the HUD and screens
// Placeholders: {name} rival name, {n} a number, {card} a mutation name, {combo} a synergy name, {dna} an amount.
// fillLine('Hi {name}', { name: 'Steve' }) fills them; tierLine(SHARE_LINES, rank) reads [maxRank, text] tables.
export const fillLine = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
export function tierLine(table, rank) {
  for (const [m, t] of table) if (rank <= m) return t;
  return table.length ? table[table.length - 1][1] : '';
}

// First-run tutorial captions: t is the big line, s the small one (6 words or fewer each).
export const TUT_TEXT = {
  steer: { t: 'Drag anywhere to steer', s: 'Left, right, wiggle wiggle.' },
  dash:  { t: 'Tap DASH for a burst!', s: 'Costs sugar. Use it on gaps.' },
  draft: { t: 'Tuck in BEHIND a rival', s: 'Free speed. Rude, but fast.' },
  combo: { t: 'Pass 3 in a row', s: 'Keep passing. Watch it grow.' },
  fruit: { t: 'Grab the fruit sugar', s: 'Sugar is energy. Eat up!' },
  drill: { t: 'Tap FAST to drill in!', s: 'Both thumbs. The egg is waiting.' },
  cash:  { t: 'Swipe DOWN to cash in!', s: 'Bank it before you bonk.' },
  frenzy: 'FRENZY! Keep passing to stay on fire.',
  natural: 'Natural talent. Coach is impressed.',
  retry: 'Good start! Coach will show you the rest next swim.',
};

// One 6-word Coach Gonad line per zone, for the zone banner.
export const COACH_SHORT = {
  launch: 'Wiggle, Kevin! Steer and draft!',
  acid:   'Green = melt. Blue = safe.',
  goo:    'Find the gap. Not the goo.',
  sea:    'Big Macros bite. Use the crowd.',
  fork:   'Follow the pink sparkles, son.',
  rapids: 'Hairs swat on the beat. Hug the middle!',
  egg:    'THERE SHE IS! TAP TAP TAP!',
};

// Floating pop words for juicy moments. Max 16 characters each so they fit a phone.
export const POP_LINES = {
  close:      ['CLOSE!', 'WHISKER!', 'YIKES!', 'TOO CLOSE!', 'PHEW!', 'EEK!'],
  dodge:      ['DODGED!', 'NOPE!', 'SIDESTEP!', 'MISSED ME!', 'SMOOTH!'],
  thread:     ['THREADED!', 'NEEDLE!', 'TIGHT FIT!', 'SQUEEZE!', 'PERFECT GAP!'],
  bonk:       ['SPLAT', 'BLORP', "GOO'D", 'SPLOOT', 'GLOOP'],
  shieldHit:  ['HELMET SAYS NO', 'NOT TODAY, MACRO', 'CLONK!', 'SAVED!', 'BONK. BLOCKED.'],
  wingHit:    ['WINGMAN TOOK IT', 'BUDDY DOWN!', 'TAKE ONE FOR ME', 'HERO MOVE!'],
  bump:       ['BONK!', 'SCOOCH!', 'OUTTA MY WAY!', 'BOOP!', 'EXCUSE ME!'],
  alkali:     ['pH OK!', 'AAAH, BLUE', 'SOOTHING!', 'ANTACID!', 'NO MORE MELT'],
  surf:       ['SURF!', 'GNARLY!', 'COWABUNGA!', 'SLIME RIDE!', 'WHEEE!'],
  shield:     ['+1 SHIELD', 'HARD HAT!', 'SAFETY FIRST!', 'ARMOUR UP!'],
  forkRight:  ['RIGHT TUBE!', 'EGG THIS WAY!', 'GOOD NOSE!', 'SPARKLE POWER!'],
  forkWrong:  ['UH OH...', 'HMM. EMPTY?', 'NO SPARKLES...', 'WRONG TUBE?'],
  backflow:   ['WRONG WAY!', 'SWIM BACK!', 'TURN AROUND!', 'U-TURN, KEVIN!', 'EGG IS THAT WAY'],
  drillShove: ['SHOVE!', 'MY EGG!', 'BACK OFF!', 'SCRAM!', 'ELBOWS OUT!'],
  draft:      ['COMFY!', 'FREE RIDE!', 'COUCH MODE!', 'LAZY GENIUS!', 'FEET UP!'],
};
// Grade shown when a combo is banked, worst to best.
export const BANK_GRADES = ['TIDY', 'SICK', 'FILTHY', 'OUTRAGEOUS', 'ONE IN A MILLION'];
// When a big combo runs out.
export const BREAK_LINES = ['COMBO DROPPED', 'BUTTERFINGERS', 'AND IT IS GONE', 'OOPSIE'];

// ---------------------------------------------------------------- result screen
// Big title by how the run ended (close = lost but very near the egg).
export const RESULT_TITLES = {
  energy: ['POOPED', 'OUT OF JUICE', 'TAIL FAIL', 'NAP TIME', 'LOW BATTERY', 'FLOPPY NOODLE', 'RUNNING ON VIBES'],
  acid:   ['FIZZED', 'LEMON KEVIN', 'PULLED A GARY', 'MELTDOWN', 'pH OH NO', 'SOUR ENDING', 'DISSOLVED-ISH'],
  bonk:   ['STUCK', 'GOO\'D', 'RAISIN MODE', 'JELLIED', 'WALL WON', 'SPLOOTED', 'GLUED'],
  wbc:    ['LUNCHED', 'NOM NOM', 'EATEN', 'TABLE FOR ONE', 'DAILY SPECIAL', 'TAKEAWAY', 'CHEF\'S KISS'],
  wrong:  ['WRONG TUBE', 'NOBODY HOME', 'SCENIC ROUTE', 'LOST THE PLOT', 'DEAD END', 'EMPTY HALLWAY', 'NO EGG HERE'],
  late:   ['BEATEN TO IT', 'EGG TAKEN', 'SO NEARLY', 'TOO SLOW, KEV', 'SECOND BEST', 'DOOR SHUT', 'TAPPED OUT'],
  close:  ['SO. CLOSE.', 'THE EGG SAW YOU', 'ONE MORE WIGGLE', 'ALMOST A PERSON', 'NEXT TIME. NEXT TIME.', 'ON THE DOORSTEP', 'A WHISKER SHORT'],
  quit:   ['BREAK TIME', 'SNACK RUN', 'BRB', 'BACK SOON', 'TACTICAL NAP', 'JUICE BOX BREAK', 'TAIL STRETCH'],
};
// Death line tied to the place you dropped out. Place-only jokes (48 characters or fewer):
// they must fit ANY way to go out in that zone. Cause-specific lines live in DEATH_LINES.
export const DEATH_BY_ZONE = {
  launch: [
    "Didn't even leave the driveway.",
    'Lost in the tutorial zone. Bold.',
    'Coach blew the whistle. You took a bow. Early.',
    'Still in the car park. The race went on.',
    'Waved at the crowd. Forgot the race.',
    'Out before the first corner. Iconic.',
  ],
  acid: [
    'Dissolved. Smelled faintly of lemons.',
    'Became a little puff of fizz.',
    'Lagoon 1, Kevin 0.',
    "Lovely lagoon. Terrible holiday.",
    'The Acid Lagoon keeps one more souvenir.',
    'Gary waved from the gift shop. Not a good sign.',
  ],
  goo: [
    'The Gate of Goo stayed shut. Smugly.',
    'Stopped at the gate. Wrong password.',
    'Jelly country claims another Kevin.',
    'The goo gate wins. It always wins.',
    'Toured the Goo Gate. Never left the lobby.',
    'Nobody wanted to be the raisin. You were brave.',
  ],
  sea: [
    'Lost at sea. A very pink sea.',
    'The Great Womb Sea was a bit too great.',
    'Big sea, tiny Kevin. The sea won.',
    'Halfway there. The sea kept the other half.',
    'Booked a sea cruise. Forgot the return ticket.',
    'The Big Macros say thanks for visiting.',
    'Steve saw it happen. Steve is still waving.',
    'Postcard from the Womb Sea: wish you were alive.',
  ],
  fork: [
    'Fork 1, Kevin 0. The spoon sends sympathy.',
    'Two tubes, one egg, zero Kevins. Sad maths.',
    'Made it to the Fork. The Fork had other ideas.',
    'Froze at the Fork. Too many choices.',
    'Tiffany picked a tube. You picked a moment.',
    'Halfway down the menu at the Fork. Kitchen shut.',
  ],
  rapids: [
    'Rapids 1, Kevin 0.',
    'So close you could smell the cinnamon.',
    'One zone from the egg. ONE.',
    'The Rapids took this round. Rude, but splashy.',
    'Swept back by tiny angry hairs.',
    'Went white water rafting. Without the raft.',
  ],
  egg: [
    'The egg says thanks for stopping by.',
    'You saw the egg. Most Kevins never do.',
    'Front row seat. No backstage pass.',
    'Made it to THE EGG. Further than most.',
    'Rang the egg\'s bell. Nobody buzzed you in.',
    'Got a selfie with the egg. Just a selfie.',
  ],
};
// When you finish in the top 10 but do not win. Never mentions the rank, always points at the next swim.
export const NEAR_MISS_LINES = [
  'The egg checked her watch. She has a minute for one more.',
  'A whisker away. The next whisker is yours.',
  'Coach dropped his clipboard. He says: again, NOW.',
  'One more swim. You KNOW it.',
  "The egg pretended she didn't see you. Make her look.",
  "The next Kevin is already stretching. He's got this.",
  'So close the egg blushed. Go finish the job.',
  'That was the warm-up. The real swim starts now.',
];
// One quick lesson for next time, by what got you.
export const TIP_BY_REASON = {
  energy: ["Grab more fruit sugar. Strawberries aren't decoration.", 'Draft behind rivals. It refills you for free.', 'DASH eats energy. Save it for gaps, not for fun.'],
  acid:   ['Swim around green puddles. Blue bubbles fix the burn.', 'Burning? Find a blue bubble. It stops the melt.', 'Antacid Coat makes acid burn 60% less.', 'Never lick the acid. The acid licks back.'],
  bonk:   ['Line up with the gap early, then go straight.', 'Goo Surfer lets you shrug off the walls.', 'Draft a rival through the gate. They find the gap.'],
  wbc:    ['Keep a rival between you and the Big Macro.', 'Shields eat one bite. Grab every helmet.', 'Big Macros are slow. Swing wide and DASH past.'],
  wrong:  ['At the Fork, follow the pink sparkles.', 'Smart rivals pick the right tube. Follow Tiffany.', 'Egg Nose puts a big arrow on the right tube.'],
  late:   ['Tap FAST at the egg. Both thumbs are allowed.', 'Arrive earlier: chain combos for FRENZY speed.', 'Save a DASH for the last stretch. Every bit counts.'],
};
// New personal best.
export const RECORD_LINES = [
  'Dad is weirdly proud.',
  'New best! Frame it. Put it on the fridge.',
  'Personal record! Coach Gonad did a cartwheel.',
  'Better than ever. Your tail is glowing.',
  'History made. Small history. Still history.',
];
// The next swimmer in line after a loss. {n} is his number.
export const KEVIN_NEXT = {
  few:     ['Kevin #{n} steps up. He has been practising.', 'Kevin #{n} is ready. He did some lunges.', 'Next up: Kevin #{n}. Same tail, new hope.', 'Kevin #{n} cracks his knuckles. He has no knuckles.', 'Kevin #{n} watched the replay. Twice.', 'Kevin #{n}: "My turn. Hold my fruit."'],
  many:    ['Kevin #{n} has been waiting in the queue. He brought snacks.', 'Kevin #{n} has read all your mistakes. Taking notes.', 'Kevin #{n} is very calm about this. Too calm.', "Kevin #{n} made a vision board. It's just an egg.", 'Kevin #{n} has a new headband. It says EGG.', 'Kevin #{n} is wearing lucky socks. Somehow.'],
  tenPlus: ['Kevin #{n}. The Kevins are a dynasty now.', 'Kevin #{n} has a fan club of earlier Kevins.', 'Kevin #{n}: "I\'ll finish what we started."', 'Kevin #{n} has a theme song. The other Kevins hum it.', 'Kevin #{n}. The Kevins have a group chat now.', 'Kevin #{n} carries the hopes of every Kevin before him.'],
};
// Share text tail, by rank: [maxRank, text]. Use tierLine(SHARE_LINES, rank).
export const SHARE_LINES = [
  [1, 'I won the race of a lifetime. Beat that, Steve.'],
  [3, 'Podium out of a MILLION. Beat that, Steve.'],
  [10, 'Top ten! The egg knows my name.'],
  [100, 'Top 100. Basically famous in there.'],
  [1000, 'Top 1,000. Better than 999,000 swimmers.'],
  [100000, 'Top 100,000. The tail is warming up.'],
  [999999, 'I passed somebody. Progress is progress.'],
  [Infinity, 'Dead last, and loving it. Your turn.'],
];
// Welcome back, by hours away ('full' = the factory hit its cap). {dna} is the amount made.
export const AWAY_LINES = {
  '<1': ['Back already? Dad barely put the kettle on.', 'Quick break! The factory made a little {dna} DNA.', 'Short nap, small pile: {dna} DNA.', 'Missed you. For a few minutes.',
         'The factory cat knocked {dna} DNA off a shelf. Yours now.', 'Dad clocked in, clocked out. {dna} DNA.'],
  '1-4': ['The factory hummed along: {dna} DNA.', 'Dad ate a salad while you were gone. {dna} DNA!', 'Busy busy. {dna} DNA waiting for you.', 'The swimmers kept training. {dna} DNA made.',
          'Tea break, two biscuits, {dna} DNA. Good shift.', 'The conveyor belt squeaked a tune. {dna} DNA.', 'Steve took the factory tour. He waved at {dna} DNA.'],
  '4-8': ['Big shift at the factory: {dna} DNA!', 'Dad did yoga AND ate broccoli. {dna} DNA.', "You were gone ages. Here's {dna} DNA.", 'The night crew worked hard: {dna} DNA.',
          'The Kevins held a bake sale. Raised {dna} DNA.', 'A machine broke. Dad fixed it with a spoon. {dna} DNA.', 'Overtime! The foreman is a Kevin. {dna} DNA.'],
  '8+': ['You slept like Dad does now. {dna} DNA made.', 'A whole night shift! {dna} DNA on the shelf.', 'Gone so long the Kevins held a meeting. {dna} DNA.', 'The factory missed you. It made {dna} DNA anyway.',
         'The factory had a birthday. Cake, balloons, {dna} DNA.', 'Employee of the month: a Kevin. Again. {dna} DNA.', 'The night crew sang shanties till dawn. {dna} DNA.'],
  'full': ['The factory is FULL. {dna} DNA and counting.', 'Storage maxed! Spend it before it spills.', 'Dad ran out of shelves. {dna} DNA ready.', 'Come back sooner and the factory never stops!',
           'DNA is piled in the canteen. Dad is eating standing up.', 'The forklift is stuck. Behind {dna} DNA. Help.'],
};
// Daily race streak, day 1 to 7, then a lost streak.
export const DAILY_LINES = {
  streak: [
    'Day 1. Every legend starts somewhere.',
    'Day 2. Two in a row! A habit is forming.',
    'Day 3. Coach Gonad bought you a whistle.',
    'Day 4. Dad is jogging now. Thanks to you.',
    'Day 5. The other swimmers whisper your name.',
    "Day 6. One more and it's a whole week!",
    'Day 7. A FULL WEEK. Absolute unit behaviour.',
  ],
  lost: [
    'Streak reset. Every Kevin needs a day off.',
    "New streak, fresh tail. Let's go again.",
    "Streak snapped. Coach Gonad is pretending he's fine.",
    'Day 1, again. Legends are allowed a sick day.',
  ],
};

// ---------------------------------------------------------------- rival voices
// Keyed by first name (Chad Thundertail is 'Chad').
export const RIVAL_LINES = {
  Steve: {
    intro: 'Steve: "Hi! I\'m Steve! Is this the queue for the egg?"',
    stealEgg: 'Steve got the egg. Steve is very surprised. Steve says sorry.',
    loseEgg: 'Steve: "Oh! You go ahead! I\'ll just wave."',
    nemesis: "Steve thinks you're best friends now. You're not sure.",
    beaten: 'Steve: "Well done, buddy! Group hug later?"',
  },
  Brock: {
    intro: 'Brock: "Brock is here. Brock is PUMPED. Brock brought a shake."',
    stealEgg: 'Brock got the egg. Brock is flexing at it.',
    loseEgg: 'Brock: "Bro. BRO. The egg was right THERE."',
    nemesis: 'Brock has started a training montage. About you.',
    beaten: 'Brock: "Respect, bro. Same time next run?"',
  },
  Tiffany: {
    intro: 'Tiffany: "According to the egg book, you have no chance."',
    stealEgg: 'Tiffany got the egg. She is already writing the sequel.',
    loseEgg: 'Tiffany: "That was NOT in chapter 12!"',
    nemesis: 'Tiffany has a whole chapter about you now. It is not kind.',
    beaten: 'Tiffany: "Fine. I will add a footnote. A small one."',
  },
  Gunther: {
    intro: 'Gunther: "Watch me do a backflip through the acid!"',
    stealEgg: 'Gunther got the egg. Gunther landed it with a triple spin.',
    loseEgg: 'Gunther: "I was going for style points!"',
    nemesis: 'Gunther wants a rematch. Gunther wants a ramp.',
    beaten: 'Gunther: "That stunt was all yours. Respect."',
  },
  Chad: {
    intro: 'Chad: "Chad Thundertail, champion. 1000 wins. Probably."',
    stealEgg: 'Chad got the egg. Chad will be insufferable about this.',
    loseEgg: 'Chad: "This doesn\'t count. Chad was warming up."',
    nemesis: "Chad is telling everyone you cheated. You didn't.",
    beaten: 'Chad: "Chad let you win. For the fans."',
  },
};
// Egg drama banners. {name} is the rival or Kevin.
export const EGG_LINES = {
  claim:  ['{name} IS AT THE EGG!', '{name} IS DRILLING!', '{name} GOT THERE FIRST!', '{name} IS KNOCKING!'],
  first:  ['YOU ARE FIRST AT THE EGG!', 'NOBODY HERE YET! DRILL!', 'FIRST! TAP TAP TAP!'],
  win:    ['{name} IS IN!', 'THE EGG SAID YES!', 'A PERSON IS BORN!'],
  stolen: ['{name} STOLE THE EGG!', '{name} GOT IN FIRST!', 'NOOO! {name} DID IT!'],
  // Lead changes in the finale. lead: {name} is whoever just took it (a rival or Kevin); leadYou: Kevin only.
  lead:    ['{name} TAKES THE LEAD!', 'LEAD CHANGE! {name}!', '{name} IS IN FRONT!', '{name} SNEAKS AHEAD!'],
  leadYou: ['KEVIN IS BACK IN FRONT!', 'KEVIN TAKES THE LEAD!', 'YOUR EGG TO LOSE!', 'FRONT OF THE QUEUE!'],
};

// ---------------------------------------------------------------- synergies and codex
// One cheeky riddle per synergy id (the player calls them MASHUPS), shown before you unlock it.
export const SYNERGY_HINTS = {
  bulldozer:   'Shove first, apologise never. Get paid for it.',
  supernova:   'Get loud enough and the Big Macros just leave.',
  sugarHigh:   'Every strawberry is a high five.',
  jetstream:   'Tuck in, then GO. Rude, but aerodynamic.',
  porcupine:   'Pointy on top, hard underneath. Pop the queue.',
  comeback:    'Fall down late, get back up LOUD.',
  hypeSquad:   'Every party needs your best friend back.',
  elephant:    'Never forget a combo. Not even a dropped one.',
  greased:     'Slip past danger and through slime. Zoom.',
  domino:      'Start a pit. Every swimmer you flatten feeds the fire.',
  reserveTank: 'Get back up with a FULL belly and a hard hat on.',
  jackpot:     'On fire? Every coin you grab rings the combo bell.',
  afterburner: 'Fast tail, quick twitch. Longer zooms that light the fuse.',
  couchPotato: 'Lazy, but behind someone. Free ride, and it counts.',
  hazmat:      'Coated and slick. Graze the nasty stuff for style points.',
  bloodhound:  'Sniff out the right tube and arrive on fire. Passes pay double.',
};
// When you hold one half of a synergy. {card} = the missing mutation, {combo} = the synergy.
// {combo} can be the lowercase 'a secret mashup', so it must never start a sentence.
export const SYNERGY_SO_CLOSE = [
  'Grab {card} to unlock {combo}!',
  'So close! {card} completes {combo}.',
  'One {card} away from {combo}.',
  'Psst. {card} plus what you have makes {combo}.',
  'Coach says: find {card}. Trust me. It makes {combo}.',
  'Coach says: {card}. I drew you a diagram. It makes {combo}.',
  'Coach is pointing at {card} with both arms. Mashup alert: {combo}.',
];
// Synergy book. {n} found, {total} in all.
export const CODEX_LINES = {
  header: 'The Mashup Book',
  none: 'Empty! Mix mutations to discover MASHUPS.',
  half: '{n} of {total} mashups found. Keep mixing.',
  all: 'All {total} mashups found! Coach Gonad tried to weep. He sweated.',
};

// ---------------------------------------------------------------- babies and Dad
export const BABY_FIRST_WORDS = [
  '"Again!"', '"Swim?"', '"Broccoli!"', '"Fast!"', '"Dada go walk!"',
  '"Wiggle!"', '"Egg!"', '"Combo!"', '"More fruit!"', '"Zoom zoom!"',
];
// Per habit: [low level, mid level, maxed].
export const HABIT_QUIPS = {
  broccoli: ['Dad ate one floret. He made a face.', 'Dad puts broccoli on pizza now.', 'Dad IS broccoli. Tiny trees forever.'],
  water:    ['Dad had a glass. A small one.', 'Dad carries a giant water bottle everywhere.', 'Dad is 90% water. Hydration legend.'],
  sleep:    ['Dad went to bed at 11. Wild.', 'Dad owns a sleep mask now.', 'Dad sleeps like a baby. A well rested one.'],
  jeans:    ['Dad loosened the belt one notch.', 'Dad wears comfy trousers now.', 'Dad lives in joggers. Freedom!'],
  berries:  ['Dad ate a blueberry by accident.', 'Dad makes smoothies. Loudly.', 'Dad has a berry farm. Basically.'],
  walk:     ['Dad walked to the end of the road.', 'Dad does 10,000 steps and tells everyone.', 'Dad climbed a mountain. On a Tuesday.'],
  beatbox:  ['Dad went "boots and cats" once.', 'Dad beatboxes while cooking.', "Dad has a beatbox channel. It's good."],
  hottub:   ['Dad said goodbye to the hot tub.', 'Dad sold the hot tub. Big step.', 'Dad takes cool showers. A hero.'],
  meditate: ['Dad sat still for 30 seconds.', 'Dad says "namaste" to the cat.', 'Dad floats. Zen master Dad.'],
  factory:  ["The factory opened! It's tiny.", 'The factory has a canteen now.', 'The factory runs itself. And hums.'],
  gps:      ['Dad bought a sat-nav.', 'The sat-nav knows the way.', 'Autopilot online. It drives a bit badly.'],
};
// New generation unlocked.
export const GEN_UNLOCK_LINES = [
  'Grandad is back on the broccoli. The kids are watching.',
  'A new generation! Same tail energy, better habits.',
  "The family tree grew a branch. It's a fast branch.",
  'Dad is a Grandad now. He still beatboxes.',
];
// Factory names by factory level, 0 to 10.
export const FACTORY_NAMES = [
  "Dad's sock drawer", 'The garden shed', 'Spare room workshop', 'The garage lab', 'Corner shop',
  'Swimmer Bakery', 'Tail & Co. Works', 'The Wiggle Mill', 'Kevin Industries', 'Gene Machine HQ',
  'DNA MegaPlant 3000',
];

// ================================================================ first swim
// Shown at the start line before the first drag.
export const START_HINT = 'Drag to steer. Tap DASH to zoom.';
// Energy bar is nearly empty.
export const LOW_ENERGY = [
  'Running on empty! Eat fruit!',
  'Kevin is hangry. FRUIT. NOW.',
  'Tank is dry! Grab a strawberry!',
];
// First time each hazard or pickup scrolls into view: verb plus payoff, 7 words or fewer.
export const HAZARD_INTRO = {
  acid:     'Green puddle! Swim around, or melt.',
  alkali:   'Blue bubble! Grab it to stop burning.',
  gate:     'Goo wall! Aim for the GAP.',
  goo:      'Goo blob! Dodge it or get stuck.',
  wbc:      'Big Macros blink, then charge. When the eyes go wide, move!',
  current:  'Current! Steer against it, or ride it.',
  cilia:    'Wall hairs swat on the beat. Wait.',
  forkSign: 'Two tubes! Follow the pink sparkles.',
  dna:      'DNA blob! Grab it for Dad\'s Habits.',
  helmet:   'Helmet! Grab it. Blocks one hit.',
};
// The very first death of a save: plain-spoken, says what happened and what to do.
export const FIRST_DEATH = {
  energy: 'You ran out of fruit sugar. Eat the strawberries, Kevin.',
  acid:   'The green puddles melted you. Swim around them, or grab a blue bubble.',
  wbc:    'A Big Macro ate you. Keep a rival between you and its mouth.',
  bonk:   'You got stuck in the goo. Line up with the gap early.',
  late:   'A rival reached the egg first. Tap fast at the egg to drill in.',
  wrong:  'Wrong tube! At the Fork, follow the pink sparkles. The other tube goes nowhere.',
};

// ================================================================ rival voice for the finale
// Keyed by the exact RIVALS names. bump: you bumped them, shove: they shoved you at the egg,
// sprint: they find the last gear, drill: muttering while shoving at the egg.
export const RIVAL_REACTS = {
  'Steve': {
    bump:   ['Steve: "Sorry! My fault! Was it my fault?"', 'Steve: "Oops! Sorry! Sorry!"', 'Steve: "No harm done! Sorry!"'],
    shove:  ['Steve: "Sorry! I didn\'t mean to shove!"', 'Steve: "Excuse me! So sorry!"', 'Steve: "Oh no, was that me? Sorry!"'],
    sprint: ['Steve: "I found a little extra! Sorry!"', 'Steve: "Wheee! Is this allowed?"', 'Steve: "Mum said I could be fast!"'],
    drill:  ['Steve: "Knock knock! Sorry to bother you!"', 'Steve: "Hello, egg! Big fan!"', 'Steve: "Sorry, is this seat taken?"'],
  },
  'Brock': {
    bump:   ['Brock: "BRO. My gains!"', 'Brock: "Watch the shake, bro!"', 'Brock: "That was cardio. Thanks, bro."'],
    shove:  ['Brock: "Brock shoves. Brock is sorry. Not sorry."', 'Brock: "Box out, bro!"', 'Brock: "Brock was here first. Ish."'],
    sprint: ['Brock: "LAST SET! MAX REPS!"', 'Brock: "Brock finds the pump!"', 'Brock: "No pain, no egg, BRO!"'],
    drill:  ['Brock: "Eight... nine... TEN REPS!"', 'Brock: "Push, bro. PUSH."', 'Brock: "One more rep. One more."'],
  },
  'Tiffany': {
    bump:   ['Tiffany: "Page 88: no bumping. Rude."', 'Tiffany: "That breaks rule 14b."', 'Tiffany: "I will cite you for that."'],
    shove:  ['Tiffany: "Page 301 allows shoving. I checked."', 'Tiffany: "Strategic repositioning."', 'Tiffany: "Move. I have a schedule."'],
    sprint: ['Tiffany: "Page 500: final sprint. Engaged."', 'Tiffany: "Appendix C. Go time."', 'Tiffany: "I saved energy. Obviously."'],
    drill:  ['Tiffany: "Drill angle 42 degrees. Perfect."', 'Tiffany: "Chapter 20: Getting In."', 'Tiffany: "Highlighting this moment."'],
  },
  'Gunther': {
    bump:   ['Gunther: "That was a stunt. Planned."', 'Gunther: "Bump? No. Choreography."', 'Gunther: "Great hit. Did you film it?"'],
    shove:  ['Gunther: "Stunt shove! Rated PG!"', 'Gunther: "That was in the script."', 'Gunther: "Nobody does their own shoves. I do."'],
    sprint: ['Gunther: "FINAL STUNT! ROLL CAMERA!"', 'Gunther: "Watch THIS!" *afterburner*', 'Gunther: "No brakes! Never had any!"'],
    drill:  ['Gunther: "Drill spin! Double twist!"', 'Gunther: "Stunt entry! Hold still, egg!"', 'Gunther: "Is the camera on? Again!"'],
  },
  'Chad Thundertail': {
    bump:   ['Chad: "My HAIR! Do you know what this costs?"', 'Chad: "Not the hair, Kevin!"', 'Chad: "That bump cost me win 1002."'],
    shove:  ['Chad: "Champions go first. Rules."', 'Chad: "Move. My hair needs the light."', 'Chad: "Thundertail coming through!"'],
    sprint: ['Chad: "THUNDERTAIL MODE! Mind the hair!"', 'Chad: "Win 1001 incoming!"', 'Chad: "Win 1003. Counting the ones in my head."'],
    drill:  ['Chad: "Egg, it\'s me. Chad. You know me."', 'Chad: "Open up. I\'m famous."', 'Chad: "Egg, this is win 1004. Act natural."'],
  },
};
// Replacement intro line when this rival is your nemesis.
export const RIVAL_GRUDGE = {
  'Steve': 'Steve: "Best friend! I made us matching tails! Race you!"',
  'Brock': 'Brock: "Brock trained for THIS. Brock did not skip Kevin day."',
  'Tiffany': 'Tiffany: "Chapter 13 is about you. It is a warning."',
  'Gunther': 'Gunther: "Rematch time. I brought a bigger ramp."',
  'Chad Thundertail': 'Chad: "You again. Chad has been practising his winning face."',
};
// Stamp line when you beat your nemesis: GRUDGE SETTLED.
export const RIVAL_SETTLED = {
  'Steve': 'Steve is thrilled for you. He still wants that group hug.',
  'Brock': 'Brock respects it. Brock is having a sad shake.',
  'Tiffany': 'Tiffany is rewriting chapter 13. It is nicer now.',
  'Gunther': "Gunther calls it a scripted loss. It wasn't.",
  'Chad Thundertail': "Chad says it doesn't count. It counts.",
};
// Retry button text: per nemesis, a close loss, or default. 16 characters or fewer each.
export const REMATCH_LINES = {
  'Steve': ['GROUP HUG AGAIN?', 'WAVE BACK. GO!'],
  'Brock': ['ONE MORE SET', 'REMATCH, BRO'],
  'Tiffany': ['REWRITE PAGE 1', 'PROVE HER WRONG'],
  'Gunther': ['RUN IT BACK', 'ONE MORE STUNT'],
  'Chad Thundertail': ['MESS UP HIS HAIR', 'DETHRONE CHAD'],
  close: ['SO CLOSE. AGAIN!', 'ONE MORE WIGGLE', 'THIS IS THE ONE'],
  default: ['SWIM AGAIN 💦'],
};
// Result line when you led into the egg zone but still lost (rank 1 lines only ever mean a win).
export const LOSS_RANK_LINES = [
  'Led a million swimmers. Missed the doorbell.',
  'First to the door. Second through it.',
  'You led the whole way. The egg had other plans.',
  'Front of the queue, wrong side of the door.',
];

// ================================================================ combo voice (pops, 16 characters or fewer)
// By the STYLE count of the chain: index 0 is style 3, index 3 is style 6.
export const STYLE_WORDS = ['MIXTAPE', 'SWISS ARMY TAIL', 'FULL REPERTOIRE', 'ONE-SPERM BAND'];
// Saved a combo right before it ran out.
export const CLUTCH_LINES = ['CLUTCH!', 'BY A WHISKER!', 'NOT TODAY!', 'SAVED IT!'];
// Ended a combo on purpose for a big bank.
export const FINISHER_LINES = ['CASHED IN!', 'MIC DROP!', 'TAIL WHIP!', 'BANKED IT!', 'CHA-CHING!', 'SMART MONEY!', 'DAD IS PROUD!', 'TO THE VAULT!'];
// Echo Chamber kept part of a dropped combo.
export const ECHO_LINES = ['ECHO!', 'SAID IT TWICE!', 'ENCORE!'];
// Extra combo words above COMBO_WORDS: [min combo, word].
export const COMBO_WORDS_HIGH = [[120, 'DAD IS IMPRESSED'], [160, 'BIO TEACHER WEPT']];

// ================================================================ mutation flavour (48 characters or fewer)
export const MUT_FLAVOR = {
  turbo:   'Tail now has a spoiler. Unclear why.',
  tank:    'Packed lunch. And second lunch.',
  helmet:  'Safety first. Style second. Hair last.',
  draft:   'Professional tailgater. Licensed.',
  magnet:  'Snacks find you. You just float there.',
  sweet:   'Five a day? Try fifty.',
  antacid: 'Melt resistant. Lick resistant? Unclear.',
  eco:     'Wiggles less. Wins more. Naps often.',
  memory:  'Remembers every combo. And your birthday.',
  whip:    'Crack! That was the tail. Probably.',
  ram:     'Polite, but structurally a battering ram.',
  rush:    'Every overtake is a tiny espresso.',
  hype:    'Comes with an air horn. Uses it a lot.',
  goo:     "Slime is just a wave that hasn't left.",
  wingman: 'Wears a matching headband. Takes a hit.',
  nose:    'Smells the egg. Also smells toast.',
  bloom:   'Slow start. Very slow. Then WHOA.',
  spiky:   "Don't hug. Seriously. Don't hug.",
  nitro:   'Sets off smoke alarms in a liquid.',
  second:  'Faints dramatically. Gets back up.',
  mosh:    'Every frenzy is a front row at a gig.',
  slick:   'Close calls are basically dance moves.',
  lucky:   'Found DNA in the sofa. Again.',
  echo:    'Said it twice. Said it twice.',
  chain:   'One spark, many bangs. Stand back.',
};

// ================================================================ story and return hooks
// Shown when a new generation begins. Index 0 is gen 2, index 7 is gen 9.
// {heir} is the grown-up parent of this generation's Kevins (never the swimmer), {grandad} the generation before.
// Every swimmer is always a Kevin from {heir}'s family.
export const GEN_INTROS = [
  ['Kevin won. A whole person was made: {heir}.', '{heir} grew up and has Kevins of their own now.', 'The Kevins of team {heir} line up at the very back.', "Coach Gonad hasn't aged a day."],
  ['{grandad} is a grandparent now. Slippers indoors, always.', '{heir} packed the Kevins a lunch.', 'Some traditions never change. Kevin starts last.'],
  ['{grandad} bought a mobility scooter. It has flames painted on.', '{heir} has big tail energy. So do the Kevins.', "Coach Gonad still looks 35. He won't explain."],
  ['The Kevins have formed a union.', 'Demands: more fruit, softer walls, no Big Macros.', '{heir} brought biscuits to the meeting.', 'Management (also {heir}) is considering it.'],
  ["Chad Thundertail's grandson is here.", 'He claims 1005 wins. Family maths.', "{heir} has heard this before. So have the Kevins.", '{grandad} says: "Beat him for me."'],
  ['Gary is back. Turns out he only dissolved a little.', 'He has a warning poster now: DO NOT LICK THE LAGOON.', '{heir} makes every Kevin read it twice.', '{grandad} races the flaming scooter past it daily.'],
  ['Coach Gonad found a photo of himself from gen 1.', 'Same whistle. Same face. A race number on his tail: 999,99...', 'The last digit is smudged. He put the photo away fast.', "{heir} told the Kevins: don't ask."],
  ['Generation 9. The family tree has a family tree.', '{grandad} is watching from the comfy chair.', '{heir} made a banner. Every Kevin ever is cheering.', 'This is the big one.'],
];
// Total runs milestones: [runs, line].
export const RUN_MILESTONES = [
  [5, '5 swims! Coach Gonad learned your name. Mostly.'],
  [10, "10 swims! You're officially a regular."],
  [25, '25 swims! The Big Macros recognise you now.'],
  [50, '50 swims! Steve made you a friendship bracelet.'],
  [100, '100 swims! The Kevins built you a tiny statue.'],
  [250, "250 swims! Tiffany wrote a book about you. It's a bestseller."],
  [500, "500 swims! You're basically the tube now."],
];
// Reaching generation 9.
// The reveal: Coach Gonad was Kevin #999,999, the swimmer just ahead of the very first Kevin.
// He stopped at the start line to help the last one, and stayed to coach every Kevin since.
export const FINALE_LINES = [
  'Nine generations. Every Kevin who ever lost is cheering.',
  'Coach Gonad lifts his cap. There is a number on his tail: #999,999.',
  '"I was one place ahead of the first Kevin. He looked so lost back there."',
  '"So I stopped. I stayed. I coached. Every Kevin, every swim."',
  'And now, at last, Coach Gonad cries. The tear ducts were in there all along.',
  'Dad is a Great-Great-Great-Great-Great-Great-Great-Grandad. He still beatboxes.',
];
// Big title on the welcome-back screen.
export const WELCOME_TITLES = [
  "Dad's factory worked the night shift!",
  'Welcome back, Kevin!',
  'The swimmers missed you!',
  'Coach Gonad kept your spot warm!',
  "The tube is ready when you are!",
  'Fresh tail, fresh DNA!',
  'The Kevins are lining up!',
];
// Alive streak, but not raced today. {n} is the streak length.
export const STREAK_NUDGE = [
  'Day {n} streak! One swim keeps it alive.',
  "Your {n}-day streak is waiting. Don't let it nap.",
  '{n} days in a row! Swim today to make it {n} plus one.',
  "Coach Gonad is guarding your {n}-day streak. He's sweating.",
];
// Next goal on the result screen. UI appends the DNA reward.
export const NEXT_GOAL_LINES = {
  beatRival: 'NEXT: Beat {name}',
  reachEgg:  'NEXT: Reach the egg',
  reachZone: 'NEXT: Reach {zone}',
  combo:     'NEXT: {n} combo',
};

// ================================================================ in-race pools and system messages
// Short Coach Gonad lines for in-race toasts, 44 characters or fewer. Long ZONE_LINES go to the pause tip.
export const ZONE_LINES_SHORT = {
  launch: [
    'Draft a rival. Free speed!',
    'Fruit = energy. Eat up!',
    'Pass, pass, pass! Build that combo!',
    '999,999 to go. Easy maths.',
    "DASH isn't a doorbell. Pick your moment.",
    'Dad ate broccoli for this. Go!',
    'Wiggle like you mean it, Kevin!',
    'Last place is just first from the back!',
    'Gary licked the acid. Lick nothing.',
  ],
  acid: [
    'Green = ouch. Blue = aaah.',
    'Burning? Grab a blue bubble!',
    'This lagoon has the pH of a grumpy lemon.',
    'This is where Gary happened. Moving on.',
    'Around the acid, not through it!',
    'Keep passing! Keep that combo alive!',
    'Antacid Coat? Then show off.',
    'Stay calm. Melting is optional.',
  ],
  goo: [
    'Line up early. Go straight through.',
    'Goo is the traffic jam of the body.',
    'Bonked? Pretend it was on purpose.',
    'Draft a rival through the gap!',
    "It's like jelly, but sadder.",
    'Find the GAP. Not the goo.',
    'Thread the gap for style points!',
    'Nobody wants to be the raisin.',
  ],
  sea: [
    'Big Macros are slow but hungry.',
    'Keep a rival between you and the mouth!',
    'A shield takes one bite for you.',
    'Combo up for FRENZY!',
    'Currents push. Steer against them!',
    "Halfway! Coach isn't crying. You are.",
    'Big sea, tiny you. Draft someone!',
    'Swing wide, then DASH past.',
  ],
  fork: [
    'Follow the pink sparkles, son!',
    'Wrong tube is a dead end. Literally.',
    "Don't flip a coin. You have no hands.",
    'Tiffany always picks right. Follow her!',
    'Sparkles left? Sparkles right? LOOK.',
    'Two tubes. One egg. Choose wisely.',
    'Trust the sparkles. Not Chad.',
    'The empty tube is very pretty. And empty.',
  ],
  rapids: [
    'Wall hairs swat on the beat. Time it!',
    "Hug the middle! The hairs can't reach.",
    'DASH through the fast bits!',
    'The current hates you. Swim anyway.',
    'Narrow tube. Every pass counts!',
    'I can smell the egg. And cinnamon?',
    "Almost there! Don't stop now!",
    'Chain your passes! FRENZY time!',
  ],
  egg: [
    'TAP TAP TAP!',
    'Faster tapping = faster drilling!',
    'Both thumbs! Both thumbs!',
    'Stop reading. Start tapping.',
    "This is it, Kevin! I'm SO proud!",
    "Shove them off! It's YOUR egg!",
    'Your finger is a hero now.',
    'A whole person is on the line!',
  ],
};
// System pops and toasts. Pop lines are 16 characters or fewer.
export const UI_LINES = {
  // When a RACE_EVENTS event ends, by event id.
  eventEnd: {
    sneeze:     ['Bless you, Dad.', 'Tissue, anyone?', 'ALL CALM AGAIN'],
    sugarRush:  ['FRUIT BOWL EMPTY', 'Burp. Pardon.', 'SNACKS OVER'],
    stampede:   ['MACROS GONE HOME', 'STAMPEDE OVER', 'PHEW. SURVIVED.'],
    slipstream: ['HIGHWAY CLOSED', 'BACK TO PADDLING', 'WIND DIED DOWN'],
    disco:      ['DISCO IS OVER', 'DAD UNPLUGGED', 'LIGHTS UP!'],
    espresso:   ['CAFFEINE CRASH', 'Decaf now, Dad.', 'JITTERS GONE'],
    goldRush:   ['GOLDEN HOUR OVER', 'POCKETS FULL?', 'DNA RAIN STOPS'],
  },
  // A hint after bumping into goo walls (not a pop, one short sentence).
  bonkHint:     ['Aim for the GAP in the goo wall.', 'Line up early, then swim straight.', 'Follow a rival through the gap.'],
  forkRight:    ['RIGHT TUBE!', 'GOOD NOSE!', 'EGG THIS WAY!', 'SPARKLE POWER!'],
  forkWrong:    ['UH OH...', 'NO SPARKLES...', 'EMPTY TUBE?', 'TURN BACK?'],
  zoneClear:    ['ZONE CLEAR!', 'NAILED IT!', 'NEXT ZONE!', 'KEEP GOING!'],
  wingBack:     ['WINGMAN IS BACK!', 'BUDDY RETURNS!', 'HE BROUGHT FRIES', 'BACKUP ARRIVED!'],
  autopilotOff: ['AUTOPILOT OFF', 'YOUR TAIL NOW', 'MANUAL WIGGLE', 'SAT-NAV NAPPING'],
  copied:       ['COPIED!', 'READY TO SHARE!', 'BRAG SAVED!', 'GO SHOW STEVE!'],
};
// Why Dad's shop picked this habit for you, by what ended the last run.
export const DAD_PICK_LINES = {
  energy:    'You ran dry. Water and berries, Dad!',
  energyEgg: 'Ran dry with the egg in sight. Water, Dad!',
  acid:      'The acid ate your juice. Water and berries, Dad!',
  wbc:       'A Big Macro got you. Dad, ditch the hot tub!',
  bonk:      'Stuck in the goo. Walks and broccoli, Dad!',
  late:      'Beaten to the egg. Broccoli for speed, Dad!',
  wrong:     'Wrong tube. Next time, follow the sparkles!',
  win:       'A baby! Treat yourself, Dad: a bigger factory or some meditation.',
  generic:   'Healthy dad, speedy Kevins. Pick a habit, Dad!',
};

// ================================================================ near-miss by gap (UI picks by seconds behind the winner)
// hair: under 0.3 s, tail: under 1 s, length: under 3 s. Always points at the next swim.
export const NEAR_MISS_BY_GAP = {
  hair:   ['Lost by a hair. A single hair. Go again.', "Photo finish. The photo says: one more swim.", 'The egg blinked. Next time, be there first.',
           'Tiffany measured the gap. She needed a microscope.', 'Dad saw the replay and dropped his broccoli.'],
  tail:   ["Under a second! That's one wiggle. Go find it.", 'Lost by a tail. You have a tail. Use it again.', 'One wiggle short. The next Kevin has spare wiggles.',
           'One DASH earlier and that egg was yours.', 'Coach is drawing arrows on his clipboard. Again!'],
  length: ['A few lengths back. Totally catchable.', "Three seconds. One good combo and it's yours.", 'Close enough to wave. Next time, knock.',
           'Three seconds is one FRENZY. Bring one next time.', 'You could hear the drilling. Go be the drilling.'],
};

// ================================================================ endless generations and the dynasty
// Gen 11 and up: UI cycles these (index (gen - 11) % 8). {gen} generation number, {heir} the grown-up parent,
// {grandad} the generation before. Every swimmer is a Kevin from {heir}'s family.
// Running gag: the Kevin Museum adds a wing every generation (the last line of each entry).
export const GEN_INTROS_ENDLESS = [
  ['Generation {gen}. Coach Gonad has a retirement party today.', "He skipped it. He's at the start line with a whistle.", '{heir} saved him some cake. The Kevins ate it.', 'The Kevin Museum opens wing {gen}: Uneaten Cake.'],
  ['Family reunion! {grandad} booked a bouncy castle.', 'Every Kevin ever bounced at once. The castle filed a complaint.', '{heir} is still picking glitter out of the Kevins.', 'Kevin Museum, wing {gen}: one very tired bouncy castle.'],
  ["Steve's great-grandkid is in the queue, waving.", 'Waving at the Kevins. Waving at the walls. Waving at a Big Macro.', '{heir} told the Kevins to wave back. Family tradition.', 'Kevin Museum, wing {gen}: The Hall of Waves. It waves back.'],
  ["Tiffany's egg book has a new edition.", 'Chapter {gen} is about your family. It has diagrams.', '{heir} bought every Kevin a copy. Nobody read it.', 'Kevin Museum, wing {gen}: the gift shop. It sells the book.'],
  ["A Thundertail is back. Chad's great-grandkid, probably.", 'Claims 10,000 wins. The family maths got worse.', '{heir} packed the Kevins earplugs.', 'Kevin Museum, wing {gen}: Chad Claims. It is mostly empty.'],
  ['The Kevin Museum throws a gala. Entry costs one strawberry.', "There's a statue of the first Kevin. He's dead last in it.", '{heir} took the Kevins on a school trip. Very inspiring.', 'The museum now has {gen} wings. The map has a map.'],
  ["Brock's great-grandkid opened a gym. It's called BROCK.", 'The sign flexes. Nobody knows how.', '{heir} signed the Kevins up. Tail day is every day now.', 'Kevin Museum, wing {gen}: one dumbbell. It is very heavy.'],
  ["Gunther's family runs a stunt school now.", 'Lesson one: no stunt doubles. Lesson two: see lesson one.', "{heir} said no. The Kevins went anyway. {grandad} cheered.", 'Kevin Museum, wing {gen}: The Ramp. Do not touch the ramp.'],
];
// Shown once, after the generation 9 finale.
export const DYNASTY_STAMP = 'DYNASTY! Nine generations. The tube will never forget your family.';

// ================================================================ first swim and cash-in
// Launch caption on the very first swim.
export const FIRST_SWIM_LAUNCH = 'One million ahead. Off you pop!';
// End of the first swim when the tutorial was cut short (gentler than TUT_TEXT.retry).
export const TUT_TEXT_GENTLE = 'Great first swim! Coach has more tricks next time.';
// One-word praise when a tutorial step is done, 12 characters or fewer.
export const TUT_PRAISE = { steer: 'WIGGLY!', dash: 'ZOOM!', fruit: 'YUM!', draft: 'SNEAKY!', combo: 'COMBO KING!' };
// First time a combo is worth cashing in (28 characters or fewer).
export const CASH_HINT = 'Swipe DOWN to cash it in!';
// A bonk smashed a big unbanked combo (18 characters or fewer).
export const BREAK_POT_LINES = ['THERE GOES COLLEGE', 'POOF. ALL GONE.', 'DAD SAW THAT', 'RIP COMBO', 'SHOULD HAVE CASHED'];
// Combo milestones, by combo count (16 characters or fewer).
export const MILESTONE_LINES = { 100: 'CENTURY!', 150: 'UNREAL!', 200: 'DOUBLE CENTURY!', 300: 'THREE HUNDRED?!' };

// ================================================================ short banners (28 characters or fewer)
// One punchy line per RACE_EVENTS id (core.js) that still says the rule.
export const EVENT_SHORT = {
  sneeze:     'Turbulence! Hold your tail!',
  sugarRush:  'Fruit everywhere! Eat up!',
  stampede:   'Big Macros incoming! Dodge!',
  slipstream: 'Drafting is doubled!',
  disco:      'Combos last longer, pay x2!',
  espresso:   'Zoom! Energy burns faster.',
  goldRush:   "It's raining DNA! Grab it!",
};
// One punchy line per SYNERGIES id (core.js) that still says the rule.
export const SYNERGY_SHORT = {
  bulldozer:   'Big bumps pay Rush energy!',
  supernova:   'FRENZY blast pops Macros!',
  sugarHigh:   'Every fruit is +1 combo!',
  jetstream:   'Dash out of drafts for free!',
  porcupine:   'Pops chain to neighbours!',
  comeback:    'Second Wind starts FRENZY!',
  hypeSquad:   'FRENZY brings Wingman back!',
  elephant:    'Drops keep 3/4 of a combo!',
  greased:     'Near misses recharge dash!',
  domino:      'Mosh knockdowns feed combo!',
  reserveTank: 'Second Wind: full + shield!',
  jackpot:     'FRENZY DNA is +1 combo!',
  afterburner: 'Longer dashes feed FRENZY!',
  couchPotato: 'Free drafting, free combo!',
  hazmat:      'Acid and goo = near misses!',
  bloodhound:  'Right tube: FRENZY, x2 pass!',
};
// Extra zone-banner lines for Coach Gonad, 6 words or fewer. {n} is the Kevin number.
export const COACH_SHORT_MORE = {
  launch: ['Kevin #{n}! Same tail, new you!', 'Back of the queue. Perfect.', 'Wiggle first. Questions later.', 'Draft, pass, repeat. Easy!', 'Fresh legs! Well, fresh tail.', "Kevin #{n}, let's GO!"],
  acid:   ['Lemon lagoon. You know the drill.', 'Green bad. Blue good. Go!', "Don't lick anything, Kevin #{n}.", "Melting's optional today.", 'Around the puddles, not through!', 'Acid ahead. Stay zesty.'],
  goo:    ['Gap hunting season is open.', 'Goo walls. Find the gap!', 'Be the needle, not the raisin.', 'Line up early, Kevin #{n}!', 'Jelly ahead. Stay unsticky.', 'Thread it like a pro.'],
  sea:    ['Big Macros, big appetites. Hide!', 'Crowd up. Macros eat loners.', 'Halfway, Kevin #{n}! Keep going!', 'Wide sea. Find a tail.', 'Shields up. Snacks down.', "Swim like they're not hungry."],
  fork:   ['Pink sparkles. Follow the glitter.', 'Two tubes. Pick the sparkly one.', 'Kevin #{n}, trust your nose.', 'Left? Right? LOOK first.', 'Not the empty hallway, son.', 'Sparkles mean egg. Remember!'],
  rapids: ['Hairs swat on the beat!', "Middle lane. Hairs can't reach.", 'Current hates you. Swim anyway!', 'Kevin #{n}, DASH the fast bits!', 'Almost there! Chain those passes!', 'I smell cinnamon. And victory.'],
  egg:    ['THIS IS THE ONE. Probably!', 'TAP TAP TAP, Kevin #{n}!', 'Both thumbs! NOW!', 'Elbows out. Tap fast!', "She's right there! DRILL!", 'A whole person! TAP!'],
};

// ================================================================ UI lessons (first swim, drill, cash-in)
// Cash-in hint for keyboard players (instead of CASH_HINT when no touch was used).
export const CASH_HINT_KEYS = 'Press S to cash in your combo!';
// The goal caption on the very first swim, after FIRST_SWIM_LAUNCH.
export const FIRST_SWIM_GOAL = 'Pass them all. Reach the egg.';
// A Big Macro bit you but spat you out (the 'spareBite' moment). 28 characters or fewer.
export const SPARE_BITE_LINES = ['Spat out! Not tasty enough.', 'Too spicy for that Macro!', 'The Macro said: needs salt.'];

// ================================================================ story before the first win
// First time you reach each zone: a 2 to 3 line story card (44 characters or fewer per line). Story, not tips.
export const ZONE_FIRST = {
  acid: [
    'The Acid Lagoon. Smells like old lemons.',
    'Many Kevins went in. The lagoon burped.',
    'Somewhere out there: blue bubbles. Hope.',
  ],
  goo: [
    'The Gate of Goo. Ancient. Wobbly. Rude.',
    'It lets through the brave and the lucky.',
    'Everyone else becomes wall decoration.',
  ],
  sea: [
    'The Great Womb Sea. So pink. So wide.',
    'Big Macros patrol here, humming to lunch.',
    'Halfway. No Kevin has ever come this far.',
  ],
  fork: [
    'The Fork. Two tubes. One holds the egg.',
    'The other is a hallway of broken dreams.',
    'Somewhere, faintly, pink sparkles glitter.',
  ],
  rapids: [
    'Tube Rapids. The current shoves back.',
    'Tiny hairs sway on the beat, like a crowd.',
    'And past them... a smell. Cinnamon?',
  ],
  egg: [
    'There she is. THE EGG. Glowing. Huge.',
    'A million swimmers set off for this moment.',
    'One knock gets an answer. Make it yours.',
  ],
};
// First loss in each zone: one family-saga line. {n} is the number of the Kevin who got there.
export const ZONE_FIRST_LOSS = {
  launch: 'Kevin #{n} left the starting line. The family calls that a start.',
  acid:   'Kevin #{n} saw the Acid Lagoon. He sent back a postcard. It fizzed.',
  goo:    'Kevin #{n} touched the Gate of Goo. The family has the fingerprint.',
  sea:    'Kevin #{n} saw the Big Sea. He will tell the others.',
  fork:   'Kevin #{n} reached the Fork. The family now knows there are two tubes.',
  rapids: 'Kevin #{n} smelled cinnamon in the Rapids. The Kevins speak of it softly.',
  egg:    'Kevin #{n} SAW THE EGG. The family will be talking about this for generations.',
};

// ================================================================ rival voices for the big beats (40 characters or fewer)
// Keyed by the exact RIVALS names.
// RIVAL_GLOATS: a rival won and dares you to come back. RIVAL_GLOATS_TIGHT: shared, for a winning gap under 1 s.
export const RIVAL_GLOATS = {
  'Steve': ['Steve: "I won? Sorry! Race me again?"', 'Steve: "Same time tomorrow, buddy?"', 'Steve: "I saved you a spot! Come back!"'],
  'Brock': ['Brock: "Brock wins. Come back stronger."', 'Brock: "Rematch, bro. Bring protein."', 'Brock: "Brock is waiting. Brock flexes."'],
  'Tiffany': ['Tiffany: "As predicted. Try again?"', 'Tiffany: "See you on page one. Again."', 'Tiffany: "Study harder. Then come back."'],
  'Gunther': ['Gunther: "Stunt of the year. Top it."', 'Gunther: "Come back. Bring a ramp."', 'Gunther: "Again! The camera missed it."'],
  'Chad Thundertail': ['Chad: "Win 1006. You want 1007?"', 'Chad: "Come back. Chad needs fans."', 'Chad: "Rematch? The hair is ready."'],
};
export const RIVAL_GLOATS_TIGHT = ['"That was way too close. Again?"', '"I felt your breath. Rematch?"', '"By a whisker! Do not tell anyone."'];
// RIVAL_STEAL: said from inside the egg, after a rival got in first.
export const RIVAL_STEAL = {
  'Steve': ['Steve: "It is so cosy in here! Sorry!"', 'Steve: "Hello from inside! Sorry!"', 'Steve: "I will name the baby Kevin!"'],
  'Brock': ['Brock: "Brock is IN. Brock is home."', 'Brock: "Nice egg. Good gains, bro."', 'Brock: "Brock will be a big baby."'],
  'Tiffany': ['Tiffany: "Exactly as chapter 20 said."', 'Tiffany: "Footnote: Kevin knocked."', 'Tiffany: "I brought my own bookmark."'],
  'Gunther': ['Gunther: "Stuck the landing. Inside!"', 'Gunther: "Ten out of ten. Egg agrees."', 'Gunther: "No stunt double. Just me."'],
  'Chad Thundertail': ['Chad: "Win 1007. Totally real."', 'Chad: "Egg, meet the hair."', 'Chad: "Told you. Chad gets in."'],
};
// RIVAL_FAREWELLS: a rival drops out of the race.
export const RIVAL_FAREWELLS = {
  'Steve': ['Steve: "I am out! Go, Kevin! Sorry!"', 'Steve: "Tell the egg I said hi!"', 'Steve: "Wave for me, buddy!"'],
  'Brock': ['Brock: "Brock is done. Brock rests."', 'Brock: "Win it for Brock, bro."', 'Brock: "Skipped cardio. Big mistake."'],
  'Tiffany': ['Tiffany: "This was NOT in the book."', 'Tiffany: "I will write a sequel."', 'Tiffany: "Recalculating. Forever."'],
  'Gunther': ['Gunther: "Stunt failed. Worth it."', 'Gunther: "Gunther will return!"', 'Gunther: "Remember me. In slow-mo."'],
  'Chad Thundertail': ['Chad: "Chad is not out. Chad rests."', 'Chad: "This one does not count."', 'Chad: "Mind the hair on your way."'],
};
// One epithet each, for name plates and banners.
export const RIVAL_EPITHETS = {
  'Steve': 'the Very Polite',
  'Brock': 'the Protein Shake',
  'Tiffany': 'the Well Read',
  'Gunther': 'the Stunt Tail',
  'Chad Thundertail': 'the Self-Declared Champ',
};

// ================================================================ run-aware result jokes (48 characters or fewer)
// One pool per condition. {n} is the number for that condition, {name} a rival name.
export const RESULT_STAT_QUIPS = {
  // noFruit: the run ended without eating a single fruit sugar.
  noFruit: [
    'Zero fruit eaten. The strawberries feel ignored.',
    'No fruit at all? Dad is clutching a smoothie.',
    'Fruit sugar: 0. Bold diet. Bad diet.',
    'You swam past every strawberry. They noticed.',
  ],
  // hugeCombo: the best combo this run was huge. {n} is that combo.
  hugeCombo: [
    'A {n} combo! Coach Gonad dropped his whistle.',
    '{n} in a row. The Big Macros want lessons.',
    'Combo {n}. Somewhere, a bio teacher gasps.',
    '{n} combo. Brock is writing it on his arm.',
  ],
  // fewOvertakes: very few overtakes this run. {n} is how many.
  fewOvertakes: [
    'Only {n} overtakes. Very polite. Too polite.',
    '{n} passes. Steve thinks you are lovely.',
    'Overtakes: {n}. The queue was very comfy.',
  ],
  // nemesisBeatButLost: you beat your nemesis {name} but did not win the egg.
  nemesisBeatButLost: [
    'You beat {name}! The egg did not, sadly.',
    '{name} is fuming. The egg is unimpressed.',
    'Beat {name}. Lost the egg. Half a party.',
    '{name} lost to you. Small win. Big grin.',
  ],
  // manyBonks: lots of goo bonks this run. {n} is how many.
  manyBonks: [
    '{n} bonks. The goo has your face memorised.',
    'Bonked {n} times. Your helmet wants a raise.',
    '{n} bonks. Brock calls it head day.',
  ],
  // fastDeath: the run ended very early.
  fastDeath: [
    'That swim was shorter than a sneeze.',
    'Blink and you missed it. You did.',
    'A speedrun! Of losing. Go again.',
    'Coach had not even sat down yet.',
  ],
};
// Title screen tagline, picked at random. {n} is the next Kevin's number.
export const TITLE_TAGLINES = [
  'One egg. One million swimmers. One Kevin.',
  'Kevin #{n} is stretching. He has no legs.',
  'Dead last is just first from the back.',
  'Wiggle hard. Dream big. Avoid the lagoon.',
  'Dad ate broccoli for this. Do not waste it.',
  'Coach Gonad has been waiting. Again.',
  'Kevin #{n} has a feeling about today.',
  'The egg will not knock on itself.',
  'Every Kevin before you is cheering.',
];

// ================================================================ come-back hooks
// Mid-race 'GOAL SMASHED' callout. {dna} is the reward.
export const GOAL_MET_LINES = [
  'Goal smashed! +{dna} DNA for Dad.',
  'Done! Coach ticked the clipboard. +{dna} DNA.',
  'That goal never stood a chance. +{dna} DNA.',
  'Dad is cheering at the factory! +{dna} DNA.',
];
// Result screen nudge to return tomorrow. {n} is the DNA waiting, {day} the streak day.
export const TOMORROW_LINES = [
  'Come back tomorrow: {n} DNA and day {day}.',
  'Day {day} awaits. So does {n} DNA.',
  'The factory works all night. Back for {n} DNA?',
  'Day {day} tomorrow. Coach is setting an alarm.',
  'Dad is saving {n} DNA for you. Day {day}!',
  'See you tomorrow! Day {day}, {n} DNA, one egg.',
];
// Generation steps. rookieEnd: the easy early swims are over. hazGen: this generation brings new hazards.
// genFaster: the race got faster with the new generation. chaseOn: rivals now chase hard from the start.
export const GEN_STEP_LINES = {
  rookieEnd: 'Training wheels off. The tube is serious now.',
  hazGen:    'New generation, new trouble. Watch the tube.',
  genFaster: 'Faster family, faster race. Keep up, Kevin!',
  chaseOn:   'The rivals did their homework. They chase now.',
};
