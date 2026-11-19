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
    coach: 'Coach Gonad: "Tail up, head down, Kevin! Steer with your finger. Tuck in BEHIND a rival to draft. Rude? Yes. Fast? Also yes."' },
  { id: 'acid', name: 'Acid Lagoon', len: 15000, hw: 175, wob: 70, q: 0.34, keep: 0.16,
    col: ['#16301a', '#2f4a17'], wall: '#b6ff5c', beat: 104,
    hazards: { sugar: 0.9, acid: 1.0, alkali: 0.4 },
    coach: 'Coach Gonad: "pH 4, people! Green puddles melt you. Blue bubbles are antacid. Do NOT lick anything. I mean it, Gary."' },
  { id: 'goo', name: 'The Gate of Goo', len: 12000, hw: 150, wob: 30, q: 0.3, keep: 0.2,
    col: ['#2b2140', '#46336b'], wall: '#d9b8ff', beat: 110,
    hazards: { sugar: 0.9, gate: 1.0, goo: 0.6 },
    coach: 'Coach Gonad: "Goo walls! Aim for the gaps. Hit the goo and you stick like a raisin in porridge. Nobody wants to be the raisin."' },
  { id: 'sea', name: 'The Great Womb Sea', len: 22000, hw: 200, wob: 90, q: 0.36, keep: 0.1,
    col: ['#3d0b1c', '#6b1430'], wall: '#ff5c7a', beat: 116,
    hazards: { sugar: 0.8, wbc: 1.0, current: 0.7, acid: 0.2 },
    coach: 'Coach Gonad: "Big Macs ahead! White blood cells EAT swimmers. Keep a rival between you and the mouth. Teamwork!"' },
  { id: 'fork', name: 'The Fork', len: 6000, hw: 190, wob: 0, q: 0.5, keep: 0.5,
    col: ['#2a0f33', '#4d1a5c'], wall: '#ff9be0', beat: 120, fork: true,
    hazards: { sugar: 0.6 },
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
  hottub:   { name: 'No more hot tubs',      icon: '🛁', max: 2,  base: 120, grow: 3,   desc: 'Start every run with +1 shield' },
  meditate: { name: 'Dad meditates',         icon: '🧘', max: 3,  base: 80, grow: 2.4,  desc: '+1 reroll of mutation cards per run' },
  factory:  { name: 'Bigger factory',        icon: '🏭', max: 10, base: 30, grow: 1.6,  desc: 'Earn more DNA while you are away' },
  gps:      { name: "Dad's sat-nav",         icon: '🛰️', max: 1,  base: 150, grow: 1,  desc: 'Unlock AUTOPILOT (it swims for you, a bit badly)' },
};
export const HABIT_ORDER = Object.keys(HABITS);
export const habitCost = (id, lv) => Math.round(HABITS[id].base * Math.pow(HABITS[id].grow, lv));

// Named rivals: the real race. sp is speed relative to the field, smart is the chance they pick the right tube.
export const RIVALS = [
  { name: 'Steve', sp: 1.08, smart: 0.6, col: '#9ad0ff', line: 'Steve is just happy to be here. Steve waved at a wall earlier.' },
  { name: 'Brock', sp: 1.13, smart: 0.65, col: '#ffb36b', line: 'Brock skipped leg day. Brock has no legs. Brock is fine with it.' },
  { name: 'Tiffany', sp: 1.2, smart: 0.85, col: '#ff8be0', line: 'Tiffany has read every book about eggs. Twice. With a highlighter.' },
  { name: 'Gunther', sp: 1.29, smart: 0.7, col: '#b6ff5c', line: 'Gunther does his own stunts. Gunther has no stunt double. Nobody does.' },
  { name: 'Chad Thundertail', sp: 1.38, smart: 0.8, col: '#ffd75c', line: 'Chad has won this race 0 times. Chad thinks it is 1000.' },
];

export const COMBO_WORDS = [
  [3, 'NICE'], [6, 'SPICY'], [10, 'FRENZY!'], [15, 'TURBO SWIMMER'], [20, 'UNSTOPPABLE'],
  [30, 'MENACE'], [45, 'LEGENDARY'], [60, 'GOD SPERM'], [100, 'ABSOLUTE UNIT'],
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
    'Gobbled by a Big Mac.', 'Became lunch.', 'Eaten. Not in the fun way.',
    'A white blood cell said "yum" and that was that.', 'Swallowed whole. Zero stars.',
    'You were the daily special.', 'Hugged by a Big Mac. It was not a hug.',
    'Big Mac with extra Kevin.', 'The immune system did its job. Rude, but fair.',
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
};

export const INTRO = [
  'Somewhere, a candlelit dinner is going VERY well.',
  'Down below, one million tiny swimmers are stretching.',
  'Some are doing lunges. None of them have legs.',
  'You are Kevin. Swimmer #1,000,000.',
  'Dead last.',
  'Ahead: acid, goo, hungry white blood cells and one very picky egg.',
  'Only ONE of you gets to become a person.',
  'Coach Gonad believes in you. Mostly.',
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
  return { name, traits, hue };
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
    'Coach Gonad: "The Big Macs are slow but hungry. Like me on a Sunday."',
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
    pass: ['Steve: "Oh hi! Sorry! Coming through! Sorry!"', 'Steve: "Is this the race? I think I am winning?"', 'Steve: "Nice tail! See you at the egg maybe!"'],
    passed: ['Steve: "Aw, good for you, buddy!"', 'Steve: "I was just enjoying the view anyway."', 'Steve: "Wait, there is a SECOND place?"'],
  },
  'Brock': {
    pass: ['Brock: "PROTEIN, BRO!"', 'Brock: "Feel the burn! I cannot. No legs."', 'Brock: "Brock goes FAST. Brock goes now."'],
    passed: ['Brock: "Brock needs a protein shake."', 'Brock: "Not cool, bro. Kind of cool. Not cool."', 'Brock: "BRO. BROOO."'],
  },
  'Tiffany': {
    pass: ['Tiffany: "Page 412 says you are swimming wrong."', 'Tiffany: "Statistically, I win. Bye!"', 'Tiffany: "I did the reading, Kevin."'],
    passed: ['Tiffany: "That was NOT in the book!"', 'Tiffany: "I am writing a strongly worded letter."', 'Tiffany: "Recalculating... recalculating..."'],
  },
  'Gunther': {
    pass: ['Gunther: "Watch THIS!" *barrel roll*', 'Gunther: "No stunt double. No fear. No legs."', 'Gunther: "I swim through acid for FUN."'],
    passed: ['Gunther: "I meant to do that."', 'Gunther: "That was a stunt. You were in my stunt."', 'Gunther: "Gunther will return. In a sequel."'],
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
  'Tip: White blood cells (Big Macs) eat swimmers. A shield saves you once. Keep rivals between you and them.',
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
export const LOSE_TITLES = ['SO CLOSE', 'OOF', 'WASTED', 'RIP KEVIN', 'NOT TODAY', 'BONK', 'TRY AGAIN, CHAMP', 'TAIL FAIL'];
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
