// Million To One: all game data (zones, mutations, Dad's habits, story lines).
// Pure data, no DOM. core.js reads it, the page reads it for text.

export const TOTAL_SWIMMERS = 1000000;
export const PX_PER_CM = 6250;          // world units per centimetre (display only)

// Each zone: length in world units, tube half-width, hazards it spawns, and how hard
// it is on the field: q = chance an abstract rival dies here, keep = share of the
// million that survive it (drives the "alive" counter and each rival's weight).
export const ZONES = [
  { id: 'launch', name: 'The Launch Tube', len: 9000, hw: 120, wob: 40, q: 0.08, keep: 0.72,
    col: ['#3a0d2e', '#5c1747'], wall: '#ff7aa8', beat: 96,
    hazards: { sugar: 1.0 },
    coach: 'Coach Gonad: "Wiggle, Kevin! WIGGLE!"' },
  { id: 'acid', name: 'Acid Lagoon', len: 15000, hw: 175, wob: 70, q: 0.34, keep: 0.16,
    col: ['#16301a', '#2f4a17'], wall: '#b6ff5c', beat: 104,
    hazards: { sugar: 0.9, acid: 1.0, alkali: 0.4 },
    coach: 'Coach Gonad: "pH 4, people! Green puddles melt you. Blue bubbles are antacid. Do NOT lick anything. I mean it, Gary."' },
  { id: 'goo', name: 'The Gate of Goo', len: 12000, hw: 150, wob: 30, q: 0.3, keep: 0.2,
    col: ['#232a4a', '#3e4f86'], wall: '#b9c8ff', beat: 110,
    hazards: { sugar: 0.9, gate: 1.0, goo: 0.6 },
    coach: 'Coach Gonad: "Goo walls! Aim for the gaps. Hit the goo and you stick like a raisin in porridge. Nobody wants to be the raisin."' },
  { id: 'sea', name: 'The Great Womb Sea', len: 22000, hw: 200, wob: 90, q: 0.36, keep: 0.1,
    col: ['#420a0f', '#7a1a1a'], wall: '#ff7a5c', beat: 116,
    hazards: { sugar: 0.8, wbc: 1.0, current: 0.7, acid: 0.2 },
    coach: 'Coach Gonad: "Big Macros ahead! White blood cells EAT swimmers. Keep a rival between you and the mouth. Teamwork!"' },
  { id: 'fork', name: 'The Fork', len: 6000, hw: 190, wob: 0, q: 0.5, keep: 0.5,
    col: ['#1a0f3a', '#33206b'], wall: '#ff9be0', beat: 120, fork: true,
    hazards: { sugar: 0.6, acid: 0.35, goo: 0.3 },
    coach: 'Coach Gonad: "Two tubes. One egg. Follow the pink sparkles, son. The other tube is a very long, very empty hallway."' },
  { id: 'rapids', name: 'Tube Rapids', len: 16000, hw: 105, wob: 50, q: 0.36, keep: 0.3,
    col: ['#0c2433', '#134a5c'], wall: '#5ce1ff', beat: 128, current: 0.22,
    hazards: { sugar: 1.1, wbc: 0.6, cilia: 1.0 },
    coach: 'Coach Gonad: "The current is AGAINST you. Hug the middle, chain your overtakes, DASH! Legs are for quitters!"' },
  { id: 'egg', name: 'THE EGG', len: 4000, hw: 170, wob: 0, q: 0, keep: 1,
    col: ['#3b2a08', '#6b4a10'], wall: '#ffd75c', beat: 136, egg: true,
    hazards: { sugar: 0.5 },
    coach: 'Coach Gonad: "THERE SHE IS. First one in becomes a PERSON. Everybody else becomes a fun fact. TAP TAP TAP!"' },
];
export const RACE_LEN = ZONES.reduce((s, z) => s + z.len, 0);

// rarity: 1 common, 2 rare, 3 legendary. max: how many times it can be taken.
export const MUTATIONS = {
  turbo:   { name: 'Turbo Tail',       icon: '🌀', r: 1, max: 5, desc: '+10% swim speed.' },
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
  broccoli: { name: 'Dad eats broccoli',     icon: '🥦', max: 10, base: 20, grow: 1.55, desc: '+4% swim speed' },
  water:    { name: 'Dad drinks water',      icon: '💧', max: 10, base: 15, grow: 1.5,  desc: '+12 max energy' },
  sleep:    { name: 'Dad sleeps 8 hours',    icon: '😴', max: 8,  base: 30, grow: 1.6,  desc: '-5% energy drain' },
  jeans:    { name: 'Dad ditches tight jeans', icon: '👖', max: 8, base: 25, grow: 1.6,  desc: 'Start 250 µm further up the field' },
  berries:  { name: 'Dad eats berries',      icon: '🫐', max: 8,  base: 20, grow: 1.55, desc: '+10% energy from fruit sugar' },
  walk:     { name: 'Dad walks every day',   icon: '🚶', max: 6,  base: 40, grow: 1.7,  desc: '+8% drafting power' },
  beatbox:  { name: 'Dad beatboxes',         icon: '🎤', max: 6,  base: 35, grow: 1.7,  desc: 'Combos last +0.25s longer' },
  hottub:   { name: 'No more hot tubs',      icon: '🛁', max: 2,  base: 150, grow: 2.5, desc: 'Start every run with +1 shield' },
  meditate: { name: 'Dad meditates',         icon: '🧘', max: 3,  base: 80, grow: 2.4,  desc: '+1 reroll of mutation cards per run' },
  factory:  { name: 'Bigger factory',        icon: '🏭', max: 10, base: 40, grow: 1.55, desc: 'Earn more DNA while you are away' },
  gps:      { name: "Dad's sat-nav",         icon: '🛰️', max: 1,  base: 400, grow: 1,  desc: 'Unlock AUTOPILOT (it swims for you, a bit badly)' },
};
export const HABIT_ORDER = Object.keys(HABITS);
export const habitCost = (id, lv) => Math.round(HABITS[id].base * Math.pow(HABITS[id].grow, lv));

// Named rivals: the real race. sp is speed relative to the field, smart is the chance they pick the right tube.
export const RIVALS = [
  { name: 'Steve', sp: 0.99, smart: 0.6, drill: 0.8, col: '#9ad0ff', line: 'Steve is just happy to be here. Steve waved at a wall earlier.' },
  { name: 'Brock', sp: 1.08, smart: 0.65, drill: 1.0, col: '#ffb36b', line: 'Brock skipped leg day. Brock has no legs. Brock is fine with it.' },
  { name: 'Tiffany', sp: 1.17, smart: 0.85, drill: 1.05, col: '#ff8be0', line: 'Tiffany has read every book about eggs. Twice. With a highlighter.' },
  { name: 'Gunther', sp: 0.98, smart: 0.7, drill: 1.0, col: '#b6ff5c', line: 'Gunther does his own stunts. Gunther has no stunt double. Nobody does.' },
  { name: 'Chad Thundertail', sp: 0.99, smart: 0.8, drill: 1.15, col: '#ffd75c', line: 'Chad has won this race 0 times. Chad thinks it is 1000.' },
];

export const COMBO_WORDS = [
  [3, 'NICE'], [6, 'SPICY'], [10, 'ON A ROLL'], [15, 'TAIL ON FIRE'], [20, 'UNSTOPPABLE'],
  [30, 'MENACE'], [45, 'COACH IS CRYING'], [60, 'POWERHOUSE OF THE CELL'], [100, 'ABSOLUTE UNIT'],
];

export const DEATH_LINES = {
  energy: [
    'Pooped out.', 'Ran out of juice.', 'Tail cramp. Classic.', 'Should have eaten more fruit.',
    'Battery at 0%. No charger in here.', 'Stopped for a little lie down. Forever.',
    'Wiggled the last wiggle.', 'Out of sugar. Dad should have had the smoothie.',
    'Tail said "I am done" and meant it.', 'Fell asleep mid-swim. Very relatable.',
    'Grab more sugar next time. Strawberries are not decoration.',
  ],
  wbc: [
    'Gobbled by a Big Macro.', 'Became lunch.', 'Eaten. Zero out of ten.',
    'A white blood cell said "yum" and that was that.', 'Swallowed whole. Zero stars.',
    'You were the daily special.', 'Hugged by a Big Macro. It was not a hug.',
    'Big Macro with extra Kevin.', 'The immune system did its job. Rude, but fair.',
  ],
  wrong: [
    'Wrong tube. No egg here. Just vibes.', 'Took the scenic route. It was empty.',
    'Swam into the spare room. Nobody lives here.', 'Turned left. Should have turned right. Story of my life.',
    'This tube was for display purposes only.', 'Lovely tube. Shame about the total lack of egg.',
    'Ignored the pink sparkles. The sparkles are sad.',
  ],
  late: [
    'Someone else got there first.', 'So close. The egg said "new phone, who dis".',
    'The egg is taken. She has a type and it is "earlier".', 'Second place is just first loser. Nicely done though.',
    'Door closed. Shoes still on. Awkward.', 'Beaten by a tail. Literally a tail.',
    'A rival drilled faster. Tap like you mean it next time.',
  ],
  quit: [
    'Kevin is taking a little break. Totally allowed.',
    'Swam off for a snack. The egg will wait. Probably.',
    'Tactical retreat. Coach Gonad respects the self-care.',
  ],
};

export const INTRO = [
  'Somewhere, a candlelit dinner is going VERY well.',
  'One million tiny swimmers line up.',
  'You are Kevin. Swimmer #1,000,000.',
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
  magnet: 'is a snack magnet', sweet: 'eats fruit for breakfast, lunch and dinner', antacid: 'can eat any curry', eco: 'naps like a champion',
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
    'Coach Gonad: "Hit DASH for a burst. It eats energy, so do not spam it like a doorbell."',
    'Coach Gonad: "Your dad ate broccoli for this moment. Do not let the broccoli down."',
  ],
  acid: [
    'Coach Gonad: "Green puddle = ouch. Blue bubble = aaah. Remember the colours!"',
    'Coach Gonad: "This place has the pH of a lemon with a grudge."',
    'Coach Gonad: "Swim around the acid, not through it. Unless you have the Antacid Coat. Then show off."',
    'Coach Gonad: "Gary licked the acid. Do not be Gary. RIP Gary."',
    'Coach Gonad: "Keep that combo alive! Every overtake resets the timer."',
  ],
  goo: [
    'Coach Gonad: "Gaps in the wall! Line up early, then go straight through."',
    'Coach Gonad: "Goo slows you down. Goo is the traffic jam of the body."',
    'Coach Gonad: "Bonked a wall? Shake it off! Pretend it was on purpose."',
    'Coach Gonad: "It is like jelly, but sadder. Swim faster."',
    'Coach Gonad: "Draft through a gap behind a rival. Let them find the hole for you!"',
  ],
  sea: [
    'Coach Gonad: "The Big Macros are slow but hungry. Like me on a Sunday."',
    'Coach Gonad: "A shield takes one bite for you. Grab them, love them."',
    'Coach Gonad: "Big ocean, tiny you. Find a rival and get behind them. Drafting!"',
    'Coach Gonad: "Currents push you around. Steer against them, or ride them like a pro."',
    'Coach Gonad: "Combo past 10 for FRENZY! Everything gets loud and shiny."',
    'Coach Gonad: "Halfway! I would cry, but I have no tear ducts. I am a coach."',
  ],
  fork: [
    'Coach Gonad: "Sparkles, son! Pink sparkles point to the egg. Follow the glitter!"',
    'Coach Gonad: "The wrong tube is a dead end. Literally. Choose wisely."',
    'Coach Gonad: "Left or right? Do NOT flip a coin. You do not have hands."',
    'Coach Gonad: "Watch the smart rivals. Tiffany always picks the right tube. Annoying, but useful."',
  ],
  rapids: [
    'Coach Gonad: "The little hairs push you back. Stay in the middle where they cannot reach!"',
    'Coach Gonad: "DASH through the fast bits! That is what it is for!"',
    'Coach Gonad: "The tube is narrow. Every overtake counts double in your heart."',
    'Coach Gonad: "Almost there! I can smell the egg. It smells like... success. And cinnamon?"',
    'Coach Gonad: "Swim like Dad walks every day! Which he does now. Thanks to you."',
  ],
  egg: [
    'Coach Gonad: "TAP TAP TAP! Drill in before the others do!"',
    'Coach Gonad: "Faster tapping = faster drilling. Your finger is a hero now."',
    'Coach Gonad: "This is it, Kevin! I am SO proud. I am also very loud."',
    'Coach Gonad: "Do not stop tapping to read this. Seriously, stop reading."',
  ],
};

// Boss rivals: "pass" is what they say when they overtake YOU, "passed" is what they cry when you overtake them.
export const RIVAL_TAUNTS = {
  'Steve': {
    pass: ['Steve: "Oh hi! Sorry! Coming through! Sorry!"', 'Steve: "Is this the race? I think I am winning?"', 'Steve: "Nice tail! See you at the egg maybe!"', 'Steve: "I brought orange slices for everyone!"'],
    passed: ['Steve: "Aw, good for you, buddy!"', 'Steve: "I was just enjoying the view anyway."', 'Steve: "Wait, there is a SECOND place?"', 'Steve: "Go Kevin! Wait, am I Kevin? No. Go Kevin!"'],
  },
  'Brock': {
    pass: ['Brock: "PROTEIN, BRO!"', 'Brock: "Feel the burn! I cannot. No legs."', 'Brock: "Brock goes FAST. Brock goes now."', 'Brock: "Tail day is EVERY day, bro!"'],
    passed: ['Brock: "Brock needs a protein shake."', 'Brock: "Not cool, bro. Kind of cool. Not cool."', 'Brock: "BRO. BROOO."', 'Brock: "Respect. Rematch at the egg, bro."'],
  },
  'Tiffany': {
    pass: ['Tiffany: "Page 412 says you are swimming wrong."', 'Tiffany: "Statistically, I win. Bye!"', 'Tiffany: "I did the reading, Kevin."', 'Tiffany: "Chapter 9: Swimmers Who Are Not You."'],
    passed: ['Tiffany: "That was NOT in the book!"', 'Tiffany: "I am writing a strongly worded letter."', 'Tiffany: "Recalculating... recalculating..."', 'Tiffany: "I am adding you to the footnotes."'],
  },
  'Gunther': {
    pass: ['Gunther: "Watch THIS!" *barrel roll*', 'Gunther: "No stunt double. No fear. No legs."', 'Gunther: "I swim through acid for FUN."', 'Gunther: "Hold my wiggle!"'],
    passed: ['Gunther: "I meant to do that."', 'Gunther: "That was a stunt. You were in my stunt."', 'Gunther: "Gunther will return. In a sequel."', 'Gunther: "Nobody film that. Okay, film it."'],
  },
  'Chad Thundertail': {
    pass: ['Chad: "Thundertail, baby! Out of the way, Kevin!"', 'Chad: "Do you even wiggle, bro?"', 'Chad: "1001 wins. Counting this one."', 'Chad: "My tail has its own fan club."'],
    passed: ['Chad: "What?! The Thundertail has never been passed! Except every time!"', 'Chad: "I let you do that. For the content."', 'Chad: "Tell NO ONE about this."', 'Chad: "My hair! You messed up my hair!"'],
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
  'Tip: Mucus gates have gaps. Line up early. Do not try to headbutt the wall. The wall always wins.',
  'Tip: White blood cells (Big Macros) eat swimmers. A shield saves you once. Keep rivals between you and them.',
  'Tip: Fruit sugar refills energy. Run out and you stop. Forever. No pressure.',
  'Tip: In the Rapids the current pushes back. The middle of the tube is fastest.',
  'Tip: At the egg, TAP as fast as you can. Rivals drill too.',
  'Tip: Spend DNA on Dad\'s Habits. A healthy dad makes speedy swimmers.',
  'Fact: Dad started eating broccoli. Morale is up 400%.',
  'Fact: Dad gave up hot tubs. It was an emotional day for everyone.',
  'Fact: Dad now drinks 8 glasses of water. He visits the bathroom a LOT.',
  'Fact: Kale is just lettuce that goes to the gym.',
  'Dad joke: Why did the broccoli win the race? It had a head start.',
  'Dad joke: What do you call a lazy carrot? A couch potato\'s cousin.',
  'Dad joke: I am reading a book about anti-gravity smoothies. I cannot put it down.',
  'Dad joke: Lettuce celebrate. Your swimmers are getting faster.',
  'Coach Gonad says: "There is no I in team. There is one in WIN. Think about it."',
  'Coach Gonad says: "Every winner was once a loser who swam again."',
  'Tip: Rare mutations stack in wild ways. Hype Man plus Nitro Frenzy is a lot of fun. A LOT.',
  'Tip: Chad Thundertail is fast but not smart. Watch the clever rivals at the Fork.',
  'Tip: Even when you lose, you earn DNA. Failure is just practice with confetti.',
];

// Result-screen headline by final rank: the first entry whose maxRank is >= your rank wins.
export const RANK_LINES = [
  [1, 'CHAMPION OF THE UNIVERSE (well, of one person)'],
  [2, 'Second out of a MILLION. Hurts. But wow.'],
  [5, 'Top five! The egg definitely noticed you.'],
  [10, 'Top ten! Coach Gonad is ugly crying.'],
  [100, 'Top 100. Basically a celebrity in here.'],
  [1000, 'Top 1,000! Better than 999,000 others. Frame this.'],
  [10000, 'Top 10,000. Respectable. Your tail is proud.'],
  [100000, 'Top 100,000. Hey, it is a start!'],
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
  dash:  { t: 'Double tap to DASH', s: 'Speed burst. Costs a little energy.' },
  draft: { t: 'Tuck in BEHIND a rival', s: 'Free speed. Rude, but fast.' },
  combo: { t: 'Pass 3 in a row', s: 'Chain passes for a COMBO.' },
  fruit: { t: 'Grab the fruit sugar', s: 'Fruit is energy. Eat fruit.' },
  frenzy: 'FRENZY! Keep passing to stay on fire.',
  natural: 'Natural talent. Coach is impressed.',
  retry: 'Again! Kevin never gives up.',
};

// One 6-word Coach Gonad line per zone, for the zone banner.
export const COACH_SHORT = {
  launch: 'Wiggle, Kevin! Steer and draft!',
  acid:   'Green = melt. Blue = safe.',
  goo:    'Find the gap. Not the goo.',
  sea:    'Big Macros bite. Use the crowd.',
  fork:   'Follow the pink sparkles, son.',
  rapids: 'Hug the middle. DASH the current!',
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
};
// Grade shown when a combo is banked, worst to best.
export const BANK_GRADES = ['TIDY', 'SICK', 'FILTHY', 'OUTRAGEOUS', 'ONE IN A MILLION'];
// When a big combo runs out.
export const BREAK_LINES = ['COMBO DROPPED', 'BUTTERFINGERS', 'AND IT IS GONE', 'OOPSIE'];

// ---------------------------------------------------------------- result screen
// Big title by how the run ended (close = lost but very near the egg).
export const RESULT_TITLES = {
  energy: ['POOPED', 'OUT OF JUICE', 'TAIL FAIL', 'NAP TIME', 'LOW BATTERY'],
  wbc:    ['LUNCHED', 'NOM NOM', 'EATEN', 'TABLE FOR ONE', 'DAILY SPECIAL'],
  wrong:  ['WRONG TUBE', 'NOBODY HOME', 'SCENIC ROUTE', 'LOST THE PLOT', 'DEAD END'],
  late:   ['BEATEN TO IT', 'EGG TAKEN', 'SO NEARLY', 'TOO SLOW, KEV', 'SECOND BEST'],
  close:  ['SO. CLOSE.', 'THE EGG SAW YOU', 'ONE MORE WIGGLE', 'ALMOST A PERSON', 'NEXT TIME. NEXT TIME.'],
  quit:   ['BREAK TIME', 'SNACK RUN', 'BRB', 'BACK SOON', 'TACTICAL NAP'],
};
// Death line tied to the place you dropped out.
export const DEATH_BY_ZONE = {
  launch: [
    'Did not even leave the driveway.',
    'Pulled a tail muscle at the starting line.',
    'Got lost in the warm-up. Bold.',
    'Still stretching. The race went on without you.',
  ],
  acid: [
    'Dissolved. Smelled faintly of lemons.',
    'Became a little puff of fizz.',
    'The lagoon said "pH 4" and meant it.',
    'Should have packed an antacid. Or two.',
  ],
  goo: [
    'Stuck like a raisin in porridge.',
    'Now part of a very sad jelly.',
    'The goo wall won. The goo wall always wins.',
    'Wiggled into the gloop and stayed there.',
  ],
  sea: [
    'Lost at sea. A very pink sea.',
    'The Great Womb Sea was a bit too great.',
    'A Big Macro waved. It was not waving.',
    'Drifted off. Seagulls not included.',
  ],
  fork: [
    'Picked a tube. Picked badly.',
    'Froze at the Fork. Too many choices.',
    'Swam into the spare room. Nobody lives here.',
    'Left, right, left... and then nothing.',
  ],
  rapids: [
    'Swept back by tiny angry hairs.',
    'The current said "no" very firmly.',
    'Rapids 1, Kevin 0.',
    'So close you could smell the cinnamon.',
  ],
  egg: [
    'Touched the egg. The egg moved on.',
    'At the door, but the door was busy.',
    'Drilled with heart. Drilled a bit slow.',
    'The egg says thanks for stopping by.',
  ],
};
// When you finish in the top 10 but do not win.
export const NEAR_MISS_LINES = [
  'Top ten out of a MILLION. The egg felt that.',
  'A whisker away. A tail, really.',
  'Coach Gonad dropped his clipboard. Again!',
  'One more run. You KNOW it.',
  'The egg is pretending she did not see you. She saw you.',
];
// One quick lesson for next time, by what got you.
export const TIP_BY_REASON = {
  energy: ['Grab more fruit sugar. Strawberries are not decoration.', 'Draft behind rivals. It refills you for free.'],
  acid:   ['Swim around green puddles. Blue bubbles fix the burn.'],
  bonk:   ['Line up with the gap early, then go straight.', 'Goo Surfer lets you shrug off the walls.'],
  wbc:    ['Keep a rival between you and the Big Macro.', 'Shields eat one bite. Grab every helmet.'],
  wrong:  ['At the Fork, follow the pink sparkles.', 'Smart rivals pick the right tube. Follow Tiffany.'],
  late:   ['Tap FAST at the egg. Both thumbs are allowed.', 'Arrive earlier: chain combos for FRENZY speed.'],
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
  few:     ['Kevin #{n} steps up. He has been practising.', 'Kevin #{n} is ready. He did some lunges.', 'Next up: Kevin #{n}. Same tail, new hope.'],
  many:    ['Kevin #{n} has been waiting in the queue. He brought snacks.', 'Kevin #{n} has read all your mistakes. Taking notes.', 'Kevin #{n} is very calm about this. Too calm.'],
  tenPlus: ['Kevin #{n}. The Kevins are a dynasty now.', 'Kevin #{n} has a fan club of earlier Kevins.', 'Kevin #{n}: "I will finish what we started."'],
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
  '<1': ['Back already? Dad barely put the kettle on.', 'Quick break! The factory made a little {dna} DNA.', 'Short nap, small pile: {dna} DNA.', 'Missed you. For a few minutes.'],
  '1-4': ['The factory hummed along: {dna} DNA.', 'Dad ate a salad while you were gone. {dna} DNA!', 'Busy busy. {dna} DNA waiting for you.', 'The swimmers kept training. {dna} DNA made.'],
  '4-8': ['Big shift at the factory: {dna} DNA!', 'Dad did yoga AND ate broccoli. {dna} DNA.', 'You were gone ages. Here is {dna} DNA.', 'The night crew worked hard: {dna} DNA.'],
  'full': ['The factory is FULL. {dna} DNA and counting.', 'Storage maxed! Spend it before it spills.', 'Dad ran out of shelves. {dna} DNA ready.', 'Come back sooner and the factory never stops!'],
};
// Daily race streak, day 1 to 7, then a lost streak.
export const DAILY_LINES = {
  streak: [
    'Day 1. Every legend starts somewhere.',
    'Day 2. Two in a row! A habit is forming.',
    'Day 3. Coach Gonad bought you a whistle.',
    'Day 4. Dad is jogging now. Thanks to you.',
    'Day 5. The other swimmers whisper your name.',
    'Day 6. One more and it is a whole week!',
    'Day 7. A FULL WEEK. Absolute unit behaviour.',
  ],
  lost: [
    'Streak reset. Every Kevin needs a day off.',
    'New streak, fresh tail. Let us go again.',
  ],
};

// ---------------------------------------------------------------- rival voices
// Keyed by first name (Chad Thundertail is 'Chad').
export const RIVAL_LINES = {
  Steve: {
    intro: 'Steve: "Hi! I am Steve! Is this the queue for the egg?"',
    stealEgg: 'Steve got the egg. Steve is very surprised. Steve says sorry.',
    loseEgg: 'Steve: "Oh! You go ahead! I will just wave."',
    nemesis: 'Steve thinks you are best friends now. You are not sure.',
    beaten: 'Steve: "Well done, buddy! Group hug later?"',
  },
  Brock: {
    intro: 'Brock: "Brock is here. Brock is PUMPED. Brock has no legs."',
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
    loseEgg: 'Chad: "This does not count. Chad was warming up."',
    nemesis: 'Chad is telling everyone you cheated. You did not.',
    beaten: 'Chad: "Chad let you win. For the fans."',
  },
};
// Egg drama banners. {name} is the rival or Kevin.
export const EGG_LINES = {
  claim:  ['{name} IS AT THE EGG!', '{name} IS DRILLING!', 'HURRY! {name} GOT THERE!', '{name} IS KNOCKING!'],
  first:  ['YOU ARE FIRST AT THE EGG!', 'NOBODY HERE YET! DRILL!', 'FIRST! TAP TAP TAP!'],
  win:    ['{name} IS IN!', 'THE EGG SAID YES!', 'A PERSON IS BORN!'],
  stolen: ['{name} STOLE THE EGG!', '{name} GOT IN FIRST!', 'NOOO! {name} DID IT!'],
};

// ---------------------------------------------------------------- synergies and codex
// One cheeky riddle per synergy id, shown before you unlock it.
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
  domino:      'Knock one over. Watch the rest wobble.',
  reserveTank: 'Big belly, second breath. Snacks for later.',
  jackpot:     'Lucky sofa, deep pockets. Ka-ching.',
};
// When you hold one half of a synergy. {card} = the missing mutation, {combo} = the synergy.
export const SYNERGY_SO_CLOSE = [
  'Grab {card} to unlock {combo}!',
  'So close! {card} completes {combo}.',
  '{combo} is one {card} away.',
  'Psst. {card} + what you have = {combo}.',
  'Coach says: find {card}. Trust me. {combo}.',
];
// Synergy book. {n} found, {total} in all.
export const CODEX_LINES = {
  header: 'The Combo Book',
  none: 'Empty! Mix mutations to discover combos.',
  half: '{n} of {total} found. Keep mixing.',
  all: 'All {total} found! Coach Gonad weeps with joy.',
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
  beatbox:  ['Dad went "boots and cats" once.', 'Dad beatboxes while cooking.', 'Dad has a beatbox channel. It is good.'],
  hottub:   ['Dad said goodbye to the hot tub.', 'Dad sold the hot tub. Big step.', 'Dad takes cool showers. A hero.'],
  meditate: ['Dad sat still for 30 seconds.', 'Dad says "namaste" to the cat.', 'Dad floats. Zen master Dad.'],
  factory:  ['The factory opened! It is tiny.', 'The factory has a canteen now.', 'The factory runs itself. And hums.'],
  gps:      ['Dad bought a sat-nav.', 'The sat-nav knows the way.', 'Autopilot online. It drives a bit badly.'],
};
// New generation unlocked.
export const GEN_UNLOCK_LINES = [
  'Grandad is back on the broccoli. The kids are watching.',
  'A new generation! Same tail energy, better habits.',
  'The family tree grew a branch. It is a fast branch.',
  'Dad is a Grandad now. He still beatboxes.',
];
// Factory names by factory level, 0 to 10.
export const FACTORY_NAMES = [
  "Dad's sock drawer", 'The garden shed', 'Spare room workshop', 'The garage lab', 'Corner shop',
  'Swimmer Bakery', 'Tail & Co. Works', 'The Wiggle Mill', 'Kevin Industries', 'Gene Machine HQ',
  'DNA MegaPlant 3000',
];
