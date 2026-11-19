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
    coach: 'Coach Gonad: "Tail up, head down! Steer with your finger. Tuck in BEHIND a rival to draft!"' },
  { id: 'acid', name: 'Acid Lagoon', len: 15000, hw: 175, wob: 70, q: 0.34, keep: 0.16,
    col: ['#16301a', '#2f4a17'], wall: '#b6ff5c', beat: 104,
    hazards: { sugar: 0.9, acid: 1.0, alkali: 0.4 },
    coach: 'Coach Gonad: "pH 4! Green puddles melt you. Blue bubbles are antacid. Do NOT lick anything."' },
  { id: 'goo', name: 'The Gate of Goo', len: 12000, hw: 150, wob: 30, q: 0.3, keep: 0.2,
    col: ['#2b2140', '#46336b'], wall: '#d9b8ff', beat: 110,
    hazards: { sugar: 0.9, gate: 1.0, goo: 0.6 },
    coach: 'Coach Gonad: "Mucus walls! Find the gaps. Slam into goo and you stick like a raisin in porridge."' },
  { id: 'sea', name: 'The Great Womb Sea', len: 22000, hw: 200, wob: 90, q: 0.36, keep: 0.1,
    col: ['#3d0b1c', '#6b1430'], wall: '#ff5c7a', beat: 116,
    hazards: { sugar: 0.8, wbc: 1.0, current: 0.7, acid: 0.2 },
    coach: 'Coach Gonad: "Big Macs ahead! White blood cells EAT swimmers. Use rivals as snacks. Theirs, not yours."' },
  { id: 'fork', name: 'The Fork', len: 6000, hw: 190, wob: 0, q: 0.5, keep: 0.5,
    col: ['#2a0f33', '#4d1a5c'], wall: '#ff9be0', beat: 120, fork: true,
    hazards: { sugar: 0.6 },
    coach: 'Coach Gonad: "Two tubes. One egg. Follow the pink sparkles, son. The egg smells like victory."' },
  { id: 'rapids', name: 'Tube Rapids', len: 16000, hw: 105, wob: 50, q: 0.36, keep: 0.3,
    col: ['#0c2433', '#134a5c'], wall: '#5ce1ff', beat: 128, current: 0.22,
    hazards: { sugar: 1.1, wbc: 0.6, cilia: 1.0 },
    coach: 'Coach Gonad: "The current is AGAINST you. Hug the middle, chain your overtakes, DASH!"' },
  { id: 'egg', name: 'THE EGG', len: 4000, hw: 170, wob: 0, q: 0, keep: 1,
    col: ['#3b2a08', '#6b4a10'], wall: '#ffd75c', beat: 136, egg: true,
    hazards: { sugar: 0.5 },
    coach: 'Coach Gonad: "THERE SHE IS. First one in becomes a PERSON. Everybody else becomes a statistic."' },
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
  { name: 'Steve', sp: 1.08, smart: 0.6, col: '#9ad0ff', line: 'Steve is just happy to be here.' },
  { name: 'Brock', sp: 1.13, smart: 0.65, col: '#ffb36b', line: 'Brock skipped leg day. Brock has no legs.' },
  { name: 'Tiffany', sp: 1.2, smart: 0.85, col: '#ff8be0', line: 'Tiffany has read every book about eggs.' },
  { name: 'Gunther', sp: 1.29, smart: 0.7, col: '#b6ff5c', line: 'Gunther does his own stunts.' },
  { name: 'Chad Thundertail', sp: 1.38, smart: 0.8, col: '#ffd75c', line: 'Chad has won this race 0 times. Chad thinks it is 1000.' },
];

export const COMBO_WORDS = [
  [3, 'NICE'], [6, 'SPICY'], [10, 'FRENZY!'], [15, 'TURBO SWIMMER'], [20, 'UNSTOPPABLE'],
  [30, 'MENACE'], [45, 'LEGENDARY'], [60, 'GOD SPERM'], [100, 'ABSOLUTE UNIT'],
];

export const DEATH_LINES = {
  energy: ['Pooped out.', 'Ran out of juice.', 'Tail cramp. Classic.', 'Should have eaten more fruit.'],
  wbc: ['Gobbled by a Big Mac.', 'Became lunch.', 'Eaten. Not in the fun way.'],
  wrong: ['Wrong tube. No egg here. Just vibes.', 'Took the scenic route. It was empty.'],
  late: ['Someone else got there first.', 'So close. The egg said "new phone, who dis".'],
};

export const INTRO = [
  'Somewhere, a romantic evening is going exactly as planned.',
  'One million swimmers are about to be launched.',
  'You are Kevin. Swimmer #1,000,000.',
  'Dead last.',
  'Only ONE of you gets to become a person.',
  'SWIM.',
];

const NAME_A = ['Little', 'Baby', 'Tiny', 'Big', 'Sir', 'Lady', 'Captain', 'Professor', 'DJ', 'MC'];
const NAME_B = ['Kevin', 'Noor', 'Loops', 'Jas', 'Pip', 'Bean', 'Mo', 'Zuri', 'Otto', 'Lina', 'Rex', 'Juno', 'Milo', 'Ivy', 'Bo', 'Nova'];
const TRAIT = {
  turbo: 'is always early', tank: 'never gets tired', helmet: 'has a very hard head', draft: 'loves tailgating',
  magnet: 'is a snack magnet', sweet: 'eats fruit for breakfast, lunch and dinner', antacid: 'can eat any curry', eco: 'naps like a champion',
  memory: 'never forgets a face', whip: 'has lightning reflexes', ram: 'wins every pillow fight', rush: 'loves a queue to jump',
  hype: 'is the loudest at every party', goo: 'loves slime', wingman: 'has a best friend for life', nose: 'can smell cookies from 3 rooms away',
  bloom: 'peaks at 40', spiky: 'has amazing hair', nitro: 'is basically a firework', second: 'never gives up', mosh: 'starts a mosh pit at every concert',
};
export function babyFor(rng, muts) {
  const name = NAME_A[Math.floor(rng() * NAME_A.length)] + ' ' + NAME_B[Math.floor(rng() * NAME_B.length)];
  const ids = Object.keys(muts).filter((k) => muts[k] > 0).sort((a, b) => muts[b] - muts[a]);
  const traits = ids.slice(0, 3).map((k) => TRAIT[k]);
  if (!traits.length) traits.push('did it with nothing but raw talent');
  const hue = Math.floor(rng() * 360);
  return { name, traits, hue };
}
