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
    hazards: { sugar: 1.0, acid: 0.12 },
    coach: 'Coach Gonad: "Wiggle, Kevin! WIGGLE!"' },
  { id: 'acid', name: 'Acid Lagoon', len: 15000, hw: 175, wob: 70, q: 0.34, keep: 0.16,
    col: ['#16301a', '#2f4a17'], wall: '#b6ff5c', beat: 104,
    hazards: { sugar: 1.0, acid: 1.0, alkali: 0.4 },
    coach: 'Coach Gonad: "pH 4, people! Green puddles melt you. Blue bubbles are antacid. Do NOT lick anything. I mean it."' },
  { id: 'goo', name: 'The Gate of Goo', len: 12000, hw: 150, wob: 30, q: 0.3, keep: 0.2,
    col: ['#262a3a', '#6a7088'], wall: '#eef2ff', beat: 110,
    hazards: { sugar: 0.9, gate: 1.0, goo: 0.6 },
    coach: 'Coach Gonad: "Goo walls! Aim for the gaps. Hit the goo and you stick like a raisin in porridge."' },
  { id: 'sea', name: 'The Great Womb Sea', len: 22000, hw: 200, wob: 90, q: 0.36, keep: 0.1,
    col: ['#4a0c14', '#b02a36'], wall: '#ff7a5c', beat: 116,
    hazards: { sugar: 1.0, wbc: 1.1, current: 0.7, acid: 0.2 },
    coach: 'Coach Gonad: "Big Macros ahead! White blood cells EAT swimmers. Keep a rival between you and the mouth. Teamwork!"' },
  { id: 'fork', name: 'The Fork', len: 6000, hw: 190, wob: 0, q: 0.5, keep: 0.5,
    col: ['#120c2e', '#2e3a7a'], wall: '#a8c8ff', beat: 120, fork: true,
    hazards: { sugar: 0.6, acid: 0.35, goo: 0.3 },
    coach: 'Coach Gonad: "Two tubes. One egg. Follow the pink sparkles, son. The other tube is a very long, very empty hallway."' },
  { id: 'rapids', name: 'Tube Rapids', len: 16000, hw: 105, wob: 50, q: 0.36, keep: 0.3,
    col: ['#04303c', '#0f7a8a'], wall: '#5ce1ff', beat: 128, current: 0.22,
    hazards: { sugar: 1.1, wbc: 0.8, cilia: 1.85 },
    coach: 'Coach Gonad: "Current is AGAINST you. Chain overtakes, DASH! Hairs flash white, then swat. Slip past as they reload!"' },
  { id: 'egg', name: 'THE EGG', len: 4000, hw: 170, wob: 0, q: 0, keep: 1,
    col: ['#3b2a08', '#6b4a10'], wall: '#ffd75c', beat: 136, egg: true,
    hazards: { sugar: 0.5 },
    coach: 'Coach Gonad: "THERE SHE IS. First one in becomes a PERSON. Everybody else becomes a fun fact. TAP TAP TAP!"' },
];
export const RACE_LEN = ZONES.reduce((s, z) => s + z.len, 0);

// rarity: 1 common, 2 rare, 3 legendary. max: how many times it can be taken.
export const MUTATIONS = {
  turbo:   { name: 'Turbo Tail',       icon: '🌀', r: 1, max: 3, desc: '+10% swim speed.' },
  tank:    { name: 'Big Fructose Tank', icon: '🛢️', r: 1, max: 4, desc: '+30 max GAS and a full refill.' },
  helmet:  { name: 'Helmet Head',      icon: '⛑️', r: 1, max: 3, desc: '+1 shield. Bonk!' },
  draft:   { name: 'Slipstream Pro',   icon: '💨', r: 1, max: 3, desc: 'Drafting is 60% stronger and refills GAS.' },
  magnet:  { name: 'Sugar Magnet',     icon: '🧲', r: 1, max: 3, desc: 'Pickups fly to you from further away.' },
  sweet:   { name: 'Sweet Tooth',      icon: '🍓', r: 1, max: 3, desc: 'Fruit sugar gives +50% GAS.' },
  antacid: { name: 'Antacid Coat',     icon: '🧴', r: 1, max: 2, desc: 'Acid burns 60% less.' },
  eco:     { name: 'Lazy Wiggle',      icon: '😴', r: 1, max: 3, desc: 'GAS drains 18% slower.' },
  memory:  { name: 'Long Memory',      icon: '🧠', r: 1, max: 3, desc: 'Combos last 1 second longer.' },
  whip:    { name: 'Whiplash',         icon: '⚡', r: 1, max: 3, desc: 'DASH comes back 20% sooner and sips 15% less GAS.' },
  ram:     { name: 'Battering Ram',    icon: '🐏', r: 2, max: 2, desc: 'Bonk rivals aside: +1 combo, +3 GAS, more reach per level.' },
  rush:    { name: 'Overtake Rush',    icon: '🔋', r: 2, max: 3, desc: 'Every overtake gives +1.5 GAS.' },
  hype:    { name: 'Hype Man',         icon: '📣', r: 2, max: 2, desc: 'FRENZY needs 3 fewer combo and lasts 2s longer.' },
  goo:     { name: 'Goo Surfer',       icon: '🏄', r: 2, max: 1, desc: 'Goo and mucus walls barely slow you.' },
  wingman: { name: 'Wingman',          icon: '🤝', r: 2, max: 2, desc: 'A buddy swims with you and takes one hit per zone.' },
  nose:    { name: 'Egg Nose',         icon: '👃', r: 2, max: 1, desc: 'You smell the right tube. Big arrow at the Fork.' },
  bloom:   { name: 'Late Bloomer',     icon: '🌱', r: 2, max: 1, desc: '+4% speed for every zone you clear.' },
  spiky:   { name: 'Spiky Hat',        icon: '🦔', r: 3, max: 1, desc: 'White blood cells that touch you POP. You eat the shield.' },
  nitro:   { name: 'Nitro Frenzy',     icon: '🔥', r: 3, max: 1, desc: 'During FRENZY nothing can hurt you and dash is free.' },
  second:  { name: 'Second Wind',      icon: '💖', r: 3, max: 1, desc: 'Once per run: run dry and you get back up with 60 GAS.' },
  mosh:    { name: 'Mosh Pit',         icon: '🤘', r: 3, max: 1, desc: 'Each FRENZY start blasts nearby rivals out of your way.' },
  slick:   { name: 'Slick Moves',      icon: '🕺', r: 1, max: 2, desc: 'Near misses count as +1 extra combo and give +2 GAS.' },
  lucky:   { name: 'Lucky Swimmer',    icon: '🍀', r: 1, max: 3, desc: 'DNA blobs show up 50% more often and are worth +2.' },
  echo:    { name: 'Echo Chamber',     icon: '🔁', r: 2, max: 1, desc: 'When a combo runs out you keep half of it.' },
  chain:   { name: 'Chain Reaction',   icon: '💥', r: 3, max: 1, desc: 'In FRENZY every combo counts double and each overtake adds FRENZY time.' },
};
export const MUT_ORDER = Object.keys(MUTATIONS);

// Dad's Habits: the permanent (rogue-lite) upgrades, bought with DNA between runs.
// Healthy dad, healthy swimmers.
export const HABITS = {
  broccoli: { name: 'Dad eats broccoli',     icon: '🥦', max: 10, base: 56, grow: 1.45, desc: '+3.5% swim speed' },
  water:    { name: 'Dad drinks water',      icon: '💧', max: 10, base: 56, grow: 1.42, desc: '+6 max GAS' },
  sleep:    { name: 'Dad sleeps 8 hours',    icon: '😴', max: 5,  base: 98, grow: 2, desc: '-5% GAS drain' },
  jeans:    { name: 'Dad ditches tight jeans', icon: '👖', max: 8, base: 77, grow: 1.5, desc: 'Start 0.09 cm further up the field' },
  berries:  { name: 'Dad eats berries',      icon: '🫐', max: 8,  base: 63, grow: 1.5, desc: '+6% GAS from fruit sugar' },
  walk:     { name: 'Dad walks every day',   icon: '🚶', max: 6,  base: 84, grow: 1.8, desc: '+8% drafting power' },
  beatbox:  { name: 'Dad beatboxes',         icon: '🎤', max: 6,  base: 77, grow: 1.8, desc: 'Combos last +0.25s longer' },
  hottub:   { name: 'No more hot tubs',      icon: '🛁', max: 2,  base: 200, grow: 3, desc: 'Start every run with +1 shield' },
  meditate: { name: 'Dad meditates',         icon: '🧘', max: 3,  base: 140, grow: 2.6,  desc: '+1 reroll of mutation cards per run' },
  factory:  { name: 'Bigger factory',        icon: '🏭', max: 10, base: 90, grow: 1.3, desc: "Earn more DNA while you're away" },
  gps:      { name: "Dad's sat-nav",         icon: '🛰️', max: 1,  base: 1200, grow: 1,  desc: 'Unlock AUTOPILOT (it swims for you, a bit badly)' },
};
export const HABIT_ORDER = Object.keys(HABITS);
// HABIT PERKS: a habit line bought up to level 'at' also unlocks a perk (core.js habitPerksAt, Race.perks; the race emits
// habitPerk {id, perk, x, y} the first time each one fires in a run). Ids and numbers only: the words are HABIT_PERK_TEXT.
export const HABIT_PERKS = [
  { id: 'broccoli', at: 5, perk: 'greenMachine' },
  { id: 'broccoli', at: 10, perk: 'rivalLink' },
  { id: 'water', at: 10, perk: 'overflow' },
  { id: 'sleep', at: 3, perk: 'softLanding' },
  { id: 'jeans', at: 8, perk: 'tuckIn' },
  { id: 'berries', at: 8, perk: 'berryBonus' },
  { id: 'walk', at: 6, perk: 'slingLink' },
  { id: 'beatbox', at: 6, perk: 'frenzyPlus' },
];
// Grandad levels (past max, they come with the generations) start at GRANDAD_PRICE of the last normal price and grow
// 8% a level from there: a steady late-game DNA sink, something to buy most runs. (1.05: a grandad level never
// undercuts the normal levels still left on the line)
export const GRANDAD_PRICE = 1.05;
export const habitCost = (id, lv) => {
  const H = HABITS[id];
  if (lv < H.max) return Math.round(H.base * Math.pow(H.grow, lv));
  return Math.round(habitCost(id, H.max - 1) * GRANDAD_PRICE * Math.pow(1.08, lv - H.max + 1));
};

// Named rivals: the real race. sp is speed relative to the field, smart is the chance they pick the right tube.
// move: the signature move each one pulls at the egg (core.js stepDrill emits rivalMove {k, move, phase}).
// drill: drilling speed at the egg, tuned with the move (Chad drills fastest because his hair check is a gift).
export const RIVALS = [
  { name: 'Steve', move: 'sorry', sp: 0.96, smart: 0.6, drill: 1.1, col: '#9ad0ff', line: 'Steve is just happy to be here. Steve waved at a wall earlier.' },
  { name: 'Brock', move: 'maxRep', sp: 1.08, smart: 0.65, drill: 1.22, col: '#ffb36b', line: 'Brock lifts. Brock writes poems about lifting. Brock is 60% Gerald, his protein shake.' },
  { name: 'Tiffany', move: 'byTheBook', sp: 1.17, smart: 0.85, drill: 1.05, col: '#ff8be0', line: 'Tiffany has read every book about eggs. Twice. With a highlighter.' },
  { name: 'Gunther', move: 'stuntDive', sp: 0.98, smart: 0.7, drill: 1.18, col: '#b6ff5c', line: 'Gunther does his own stunts. His cameraman Dieter does his own crying.' },
  { name: 'Chad Thundertail', move: 'hairCheck', sp: 0.99, smart: 0.45, drill: 1.5, col: '#ffd75c', line: "Chad has won this race 0 times. Chad thinks it's 1000." },
];

export const COMBO_WORDS = [
  [3, 'SCOOCH'], [6, 'QUEUE JUMPER'], [10, 'COACH IS SCREAMING'], [15, 'TAIL ON FIRE'], [20, 'BROCK IS SHAKING'],
  [30, 'MENACE'], [45, 'COACH TRIED TO CRY'], [60, 'POWERHOUSE OF THE CELL'], [100, 'ABSOLUTE UNIT'],
];

export const DEATH_LINES = {
  energy: [
    'Tail clocked off early. No overtime.', 'Kevin now rattles a bit. Like a maraca.',
    'Tail cramp. Kevin is now a very small comma.', 'Skipped the fruit. The strawberries look smug.',
    'Battery at 0%. Steve offered a charger. It was a grape.', 'Stopped for a little lie down. Forever.',
    'Wiggled the last wiggle. It was a lovely one.', 'Dad should have had the smoothie. Dad knows.',
    'Tail said "I\'m done" and meant it.', 'Fell asleep mid-swim. Very relatable.',
    'Skipped breakfast. The tail filed a complaint.',
  ],
  // Ran dry within sight of the egg (zone 5 and up).
  energyEgg: [
    'Could see the egg. The egg could see you. Awkward.',
    'Two wiggles from the door. The tail sat down.',
    "The egg was RIGHT THERE. Your tail wasn't.",
    'So close you could read the welcome mat.',
    'Parked on the egg\'s porch. Forgot to knock.',
    'Saw the egg, waved, ran out of wave.',
  ],
  acid: [
    'Fizzed like a dropped soda.',
    'The lagoon did a little burp. That was you.',
    "Tried the acid. Would not recommend. Fizzy.",
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
    'Gobbled. The Macro asked for the recipe.', "A Big Macro's packed lunch. Crusts and all.",
    'Eaten. The Big Macro asked for seconds.',
    'A white blood cell said "yum" and that was that.', "Swallowed whole. It didn't even chew.",
    'Somewhere, a white blood cell does a tiny burp.', "Hugged by a Big Macro. It wasn't a hug.",
    'Big Macro meal, extra Kevin, hold the pickles.', 'The immune system did its job. Gold star, immune system.',
    "A Big Macro waved. It wasn't waving.",
  ],
  wrong: [
    'Wrong tube. No egg here. Just vibes.', 'Took the scenic route. It was empty.',
    'Swam into the spare room. Nobody lives here.', 'Turned left. Should have turned right. Story of every Kevin.',
    'This tube was for display purposes only.', 'Lovely tube. Shame about the total lack of egg.',
    'Ignored the pink sparkles. The sparkles are sad.',
    'Followed Tiffany. Page 400 had a typo.',
  ],
  late: [
    'Someone else got the egg. You got the doormat.', 'So close. The egg already had plans.',
    'The egg is taken. She has a type and it\'s "earlier".', 'Beaten at the door. Your tail wants a recount.',
    'Door closed. Shoes still on. Awkward.', 'Beaten by a tail. Literally a tail.',
    'A rival drilled faster. Tap like you mean it next time.',
    'Touched the egg. The egg moved on.',
    'At the door. The door said "one moment, please".',
    'Drilled with heart. Drilled a bit slow.',
  ],
  // a rival got to the egg before Kevin even arrived
  lateRoute: [
    'Got to the egg. The egg already had a guest.',
    'Arrived fashionably late. Fashion lost.',
    'The party started without you. The cake is gone.',
    'A rival got there first. You got the view.',
  ],
  quit: [
    'Kevin is taking a little break. Totally allowed.',
    'Swam off for a snack. The egg will wait. Probably.',
    'Tactical retreat. Coach Gonad respects the self-care.',
    'Gone to stretch. The tail has a lot of tail.',
    'Paused for a juice box. Dad would approve.',
    'Brock is holding your place. Doing lunges.',
  ],
};

// Exactly 3 lines, 50 characters or fewer. The UI styles a line big when it ends with 'Dead last.' and always
// styles the last line big. Never repeat the title subtitle.
export const INTRO = [
  'Somewhere, a candlelit dinner is going VERY well.',
  'You are Kevin. Swimmer #1,000,000. Dead last.',
  'One egg. Zero chill. SWIM!',
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
  magnet: 'is a snack magnet', sweet: 'eats fruit for breakfast, lunch and dinner', antacid: 'swims through lemon juice for fun', eco: 'naps like a champion',
  memory: 'never forgets a face', whip: 'has lightning reflexes', ram: 'wins every pillow fight', rush: 'loves a queue to jump',
  hype: 'is the loudest at every party', goo: 'loves slime', wingman: 'has a best friend for life', nose: 'can smell cookies from 3 rooms away',
  bloom: 'peaks at 40', spiky: 'has amazing hair', nitro: 'is basically a firework', second: 'never gives up', mosh: 'starts a mosh pit at every concert',
  slick: 'dances out of every argument', lucky: 'finds coins down every sofa', echo: 'tells the punchline twice', chain: 'sets off the smoke alarm making toast',
};
// Used when a mutation has no trait written yet (new mutations get one of these).
const TRAIT_SPARE = [
  'cries at nature documentaries', 'already has opinions about cheese', 'high-fives strangers', 'is suspiciously good at hide and seek',
  'hums while eating', 'refuses to wear socks', 'was born doing a little dance', 'collects very interesting pebbles',
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
    'Coach Gonad: "Grab the fruit sugar! It fills your GAS. GAS is life. Also snacks are life."',
    'Coach Gonad: "Overtake, overtake, overtake! Chain them for a COMBO!"',
    'Coach Gonad: "999,999 to go. Easy. I did the maths on a napkin."',
    'Coach Gonad: "Hit DASH for a burst. It burns GAS, so don\'t spam it like a doorbell."',
    'Coach Gonad: "Your dad ate broccoli for this moment. Don\'t let the florets down."',
  ],
  acid: [
    'Coach Gonad: "Green puddle = ouch. Blue bubble = aaah. Remember the colours!"',
    'Coach Gonad: "This place has the pH of a lemon with a grudge."',
    'Coach Gonad: "Swim around the acid, not through it. Unless you have the Antacid Coat. Then show off."',
    'Coach Gonad: "If a puddle bubbles at you, it is not saying hello. Swim around it."',
    'Coach Gonad: "Keep that combo alive! Every overtake resets the timer."',
  ],
  goo: [
    'Coach Gonad: "Gaps in the wall! Line up early, then go straight through."',
    'Coach Gonad: "Goo is just a queue that set. Do not queue. Find the gap."',
    'Coach Gonad: "Bonked a wall? Shake it off! Pretend it was on purpose."',
    'Coach Gonad: "I was stuck in this goo for a whole weekend once. I wrote a poem. It was sticky."',
    'Coach Gonad: "Draft through a gap behind a rival. Let them find the hole for you!"',
  ],
  sea: [
    'Coach Gonad: "Hear that humming? Big Macros hum when they are hungry. They are always humming."',
    'Coach Gonad: "A shield takes one bite for you. Grab them, love them."',
    'Coach Gonad: "Big ocean, tiny you. Find a rival and get behind them. Drafting!"',
    'Coach Gonad: "Currents push you around. Steer against them, or ride them like a pro."',
    'Coach Gonad: "Combo past 10 for FRENZY! Everything gets loud and shiny."',
    'Coach Gonad: "Halfway! From here on, every Kevin is a legend. No pressure."',
  ],
  fork: [
    'Coach Gonad: "Sparkles, son! Pink sparkles point to the egg. Follow the glitter!"',
    'Coach Gonad: "The wrong tube is a dead end. Literally. Choose wisely."',
    'Coach Gonad: "Gut feeling? Ignore it. You ARE a gut feeling. Follow the sparkles."',
    'Coach Gonad: "Watch the smart rivals. Tiffany nearly always picks the right tube. Annoying, but useful."',
  ],
  rapids: [
    'Coach Gonad: "Wall hairs flash white, then swat. Slip past while they reload!"',
    'Coach Gonad: "DASH through the fast bits! That\'s what it\'s for!"',
    'Coach Gonad: "The tube is narrow. Every overtake counts double in your heart."',
    'Coach Gonad: "Almost there! I can smell the egg. It smells like... success."',
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
    pass: ['Steve: "Coming through! Sorry! Lovely tail!"', 'Steve: "That Macro is Doug. Doug is shy."', 'Steve: "My mum packed me a sandwich. It\'s in my tail."', 'Steve: "What a gorgeous puddle! Do not lick it."'],
    passed: ['Steve: "Aw, good for you, buddy!"', 'Steve: "Go on! Say hi to Doug for me!"', 'Steve: "I cried at a sunset today. Go, Kevin!"', 'Steve: "This goo has such a lovely wobble. Go!"'],
  },
  'Brock': {
    pass: ['Brock: "Roses are red. Brock is ahead."', 'Brock: "Haiku. Brock goes zoom. You, less zoom."', 'Brock: "Gerald and Brock say BYE!"', 'Brock: "This pass rhymes. You would not get it."'],
    passed: ['Brock: "Brock needs a protein shake."', 'Brock: "Brock feels a sad poem coming on."', 'Brock: "BRO. BROOO."', 'Brock: "Gerald says rematch. Gerald is always right."'],
  },
  'Tiffany': {
    pass: ['Tiffany: "Spoiler: you bonk in 3, 2..."', 'Tiffany: "Tube: two stars. Lighting: moody."', 'Tiffany: "See footnote 4: Kevin, rude."', 'Tiffany: "Stop breathing on my margins."'],
    passed: ['Tiffany: "Erratum: Kevin passed me. Briefly."', 'Tiffany: "I am NOT flustered. I am recalculating."', 'Tiffany: "Recalculating... 61.3%... 61.2%..."', 'Tiffany: "This was NOT in the syllabus!"'],
  },
  'Gunther': {
    pass: ['Gunther: "Watch THIS!" *barrel roll*', 'Gunther: "Watch closely. This is cinema."', 'Gunther: "Dieter! Get my good fin!"', 'Gunther: "Move, Kevin. Art needs space."'],
    passed: ['Gunther: "I meant to do that."', 'Gunther: "A plot twist. I wrote it, obviously."', 'Gunther: "Gunther will return. In a sequel."', 'Gunther: "Dieter, stop drafting your resignation."'],
  },
  'Chad Thundertail': {
    pass: ['Chad: "Thundertail, baby! Out of the way, Kevin!"', 'Chad: "I practised this face in a puddle. For days."', 'Chad: "Mum, if you are watching, this is a warm-up."', 'Chad: "My tail has its own fan club."'],
    passed: ['Chad: "What?! The Thundertail has never been passed! Except every time!"', 'Chad: "Be cool, Chad. What would Uncle Thad do?"', 'Chad: "Tell NO ONE about this."', 'Chad: "The family says Thundertails always win. Do we?"'],
  },
};

// Loading / between-run tips. Half joke, half lesson.
export const TIPS = [
  'Tip: Tuck in behind a rival to DRAFT. You go faster and they do all the work. Classic office move.',
  'Tip: DASH is a burst of speed. Tap the button or flick your thumb up. Save it for gaps, currents and showing off.',
  'Tip: Overtakes in a row build a COMBO. Keep passing or the combo fades. Like a sandcastle, but sadder.',
  'Tip: Combo 10 starts FRENZY. Everything goes faster and louder. Like a birthday party with extra cake.',
  'Tip: At the Fork, follow the pink sparkles. The other tube is a very nice dead end.',
  'Tip: Green puddles are acid. Blue bubbles are antacid. Your mum was right about colours.',
  'Tip: Don\'t lick the acid. Nobody who licked the acid has ever said "worth it".',
  "Tip: Goo gates have gaps. Line up early. Don't try to headbutt the wall. The wall always wins.",
  'Tip: White blood cells (Big Macros) eat swimmers. A shield saves you once. Keep rivals between you and them. Steve does not mind. Steve never minds.',
  'Tip: Fruit sugar fills your GAS. Run out and you stop. Forever. No pressure.',
  'Tip: In the Rapids the current pushes back. The middle of the tube is fastest. The walls belong to the hairs.',
  'Tip: At the egg, TAP as fast as you can. Rivals drill too. Your thumbs have trained their whole life for this.',
  'Tip: Spend DNA on Dad\'s Habits. A healthy dad makes speedy swimmers. Broccoli is a performance enhancer.',
  'Fact: Dad started eating broccoli. Morale is up 400%.',
  'Fact: Dad gave up hot tubs. It was an emotional day for everyone.',
  'Fact: Dad now drinks 8 glasses of water. He visits the bathroom a LOT.',
  'Fact: Kale is just lettuce that goes to the gym.',
  'Fact: Gary went for a paddle in the Acid Lagoon. We do not talk about Gary.',
  'Dad joke: Why did the broccoli win the race? It had a head start.',
  'Dad joke: What do you call a sad strawberry? A blueberry.',
  "Dad joke: I'm reading a book about anti-gravity smoothies. I can't put it down.",
  'Dad joke: Lettuce celebrate. Your swimmers are getting faster.',
  'Coach Gonad says: "There\'s no I in team. There\'s one in WIN. Think about it."',
  'Coach Gonad says: "Every winner was once a loser who swam again." He wrote it on a napkin. He framed the napkin.',
  'Tip: Rare mutations stack in wild ways. Hype Man plus Nitro Frenzy makes a MASHUP. A loud one.',
  'Tip: Chad is slow in the tube, scary at the egg, and lost at the Fork.',
  'Tip: Even when you lose, you earn DNA. Failure is just practice with confetti.',
  'Tip: A combo only pays once you cash it in. Tap CASH before you bonk. Unbanked combos are just hopes and dreams.',
  "Tip: Goo wall coming and a fat combo going? Cash it in first. A bonk pays nothing. The goo does not tip.",
  // True facts: real biology, PG, each with a comic tag.
  'True fact: the egg is the biggest cell in the human body. Show-off.',
  'True fact: the tail runs on mitochondria. THE POWERHOUSE OF THE CELL.',
  'True fact: white blood cells really do gobble stray swimmers. The Big Macros are a documentary.',
  'True fact: every person alive won this exact race once. Including Coach Gonad. Allegedly.',
  'True fact: the tail has a proper science name, the flagellum. Kevin calls it "the wiggler".',
  'True fact: the head carries half the recipe for a whole new person. Kevin is basically a packed lunch.',
  'True fact: the tip of the head has a little cap of enzymes for getting through the egg wall. Built-in drill.',
  'True fact: there really are two tubes, and the egg waits in only one. The Fork is science.',
  'True fact: tiny hairs called cilia line the tubes and sweep in waves. The Rapids are real, and rude.',
  'True fact: once one swimmer gets in, the egg locks the door on everyone else. A bouncer made of chemistry.',
];

// Result-screen headline by final rank: the first entry whose maxRank is >= your rank wins.
export const RANK_LINES = [
  [1, 'CHAMPION OF THE UNIVERSE (well, of one person)'],
  [2, 'Second out of a MILLION. Hurts. But wow.'],
  [5, 'Top five! The egg definitely noticed you.'],
  [10, 'Top ten! Coach Gonad blew his whistle twice.'],
  [100, 'Top 100. Basically a celebrity in here.'],
  [1000, 'Top 1,000! Better than 999,000 others. Frame this.'],
  [10000, 'Top 10,000. Your face is on a very small mug.'],
  [100000, 'Top 100,000. The fridge is making room.'],
  [500000, 'Middle of the pack. Snug as a sandwich filling.'],
  [900000, 'You beat some swimmers! Some of them were napping.'],
  [999999, 'You passed at least one swimmer. Bragging rights!'],
  [Infinity, 'Still dead last. Bold strategy, Kevin.'],
];
export function rankLine(rank) {
  for (const [m, t] of RANK_LINES) if (rank <= m) return t;
  return RANK_LINES[RANK_LINES.length - 1][1];
}

// Big result titles when you lose: only a fallback. main.js shows RESULT_TITLES[cause] first, this pool only
// when no cause matches.
export const LOSE_TITLES = ['SO CLOSE', 'OOF', 'OUT OF PUFF', 'SPLAT', 'NOT TODAY', 'BONK', 'AGAIN, CHAMP', 'TAIL FAIL'];
// Subtitle under "IT'S A BABY!".
export const WIN_LINES = [
  'You beat 999,999 swimmers. Nature is amazed.',
  'One in a million. Literally. Do the maths.',
  'A new person has been made. They have your tail energy.',
  'Coach Gonad hugged the egg. The egg allowed it.',
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
  dash:  { t: 'Tap DASH for a burst!', s: 'Burns GAS. Fruit fills it back.' },
  draft: { t: 'Tuck in BEHIND a rival', s: 'Free speed. Rude, but fast.' },
  combo: { t: 'Pass 3 in a row', s: 'Keep passing. Watch it grow.' },
  fruit: { t: 'Grab the fruit sugar', s: 'Fruit = GAS. Eat up!' },
  drill: { t: 'Tap FAST to drill in!', s: 'Both thumbs. The egg is waiting.' },
  cash:  { t: 'Tap CASH to bank your combo!', s: 'Crash first and your chain is gone!' },
  frenzy: 'That was FRENZY! Chain passes to light it again.',
  natural: 'Natural talent. Coach is impressed.',
  retry: 'Good start! More tricks next swim, keep going!',
};

// One 6-word Coach Gonad line per zone, for the zone banner.
export const COACH_SHORT = {
  launch: 'Wiggle, Kevin! Steer and draft!',
  acid:   'Green = melt. Blue = safe.',
  goo:    'Find the gap. Not the goo.',
  sea:    'Big Macros bite. Hide behind rivals.',
  fork:   'Follow the pink sparkles, son.',
  rapids: 'Hairs flash, then swat. Time it!',
  egg:    'THERE SHE IS! TAP TAP TAP!',
};

// Floating pop words for juicy moments. Max 16 characters each so they fit a phone.
export const POP_LINES = {
  close:      ['CLOSE!', 'WHISKER!', 'YIKES!', 'TOO CLOSE!', 'TAIL TRIM!', 'BRUSH WITH DOUG'],
  dodge:      ['DODGED!', 'NOPE!', 'SIDESTEP!', 'MISSED ME!', 'NOT ON THE MENU', 'NO THANK YOU!'],
  thread:     ['THREADED!', 'NEEDLE!', 'TIGHT FIT!', 'SQUEEZE!', 'PERFECT GAP!', 'NEEDLE NOSE!', 'GAP? GOT IT.'],
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
  second:     ['SECOND WIND!', 'NOT DEAD YET!', 'PLOT TWIST!'],
  spare:      ['SPAT OUT!', 'TOO CRUNCHY!'],
  record:     ['NEW BEST!', 'FRIDGE-WORTHY!'],
  pastBest:   ['PAST YOUR BEST!', 'NEW TERRITORY!'],
  // first-swim dash past a rival: main.js shows these as-is, so each one carries the reward.
  zoomPast:   ['ZOOMED! +2 DNA', 'SEE YA! +2 DNA', 'BEEP BEEP +2 DNA', 'LATER! +2 DNA'],
};
// Grade shown when a combo is banked, worst to best.
export const BANK_GRADES = ['TIDY', 'SICK', 'SPICY', 'OUTRAGEOUS', 'ONE IN A MILLION'];
// When a big combo runs out.
export const BREAK_LINES = ['COMBO DROPPED', 'BUTTERFINGERS', 'AND IT IS GONE', 'OOPSIE'];

// ---------------------------------------------------------------- result screen
// Big title by how the run ended (close = lost but very near the egg). 15 characters or fewer.
export const RESULT_TITLES = {
  energy: ['ON FUMES', 'OUT OF GAS', 'TAIL FAIL', 'NAP TIME', 'LOW BATTERY', 'WIGGLED OUT', 'VIBES ONLY'],
  acid:   ['FIZZED', 'LEMON KEVIN', 'ZESTED', 'MELTDOWN', 'pH OH NO', 'SOUR ENDING', 'DISSOLVED-ISH'],
  bonk:   ['STUCK', 'GOO\'D', 'RAISIN MODE', 'JELLIED', 'WALL WON', 'SPLOOTED', 'GLUED'],
  wbc:    ['LUNCHED', 'NOM NOM', 'EATEN', 'TABLE FOR ONE', 'DAILY SPECIAL', 'TAKEAWAY', 'CHEF\'S KISS'],
  wrong:  ['WRONG TUBE', 'NOBODY HOME', 'SCENIC ROUTE', 'LOST THE PLOT', 'DEAD END', 'EMPTY HALLWAY', 'NO EGG HERE'],
  late:   ['BEATEN TO IT', 'EGG TAKEN', 'SO NEARLY', 'TOO SLOW, KEV', 'SECOND BEST', 'DOOR SHUT', 'TAPPED OUT'],
  close:  ['SO. CLOSE.', 'THE EGG SAW YOU', 'ONE MORE WIGGLE', 'ALMOST A PERSON', 'NEXT. TIME.', 'ON THE DOORSTEP', 'A WHISKER SHORT'],
  crash:  ['TUBE HICCUP', 'BLESS YOU, TUBE', 'TECH WIGGLE'],
  quit:   ['BREAK TIME', 'SNACK RUN', 'BRB', 'BACK SOON', 'TACTICAL NAP', 'JUICE BOX BREAK', 'TAIL STRETCH'],
  // a rival reached the egg first, before Kevin ever got there (a race lost on the road, not at the door)
  lateRoute: ['BEATEN THERE', 'LATE ARRIVAL', 'OUTPACED', 'SECOND TO EGG', 'EGG WAS BOOKED'],
};
// Death line tied to the place you dropped out. Place-only jokes (48 characters or fewer):
// they must fit ANY way to go out in that zone. Cause-specific lines live in DEATH_LINES.
export const DEATH_BY_ZONE = {
  launch: [
    "Didn't even leave the driveway.",
    'Lost in the tutorial zone. Bold.',
    'Coach blew the whistle. You took a bow. Early.',
    'Still in the car park. The race went on.',
    'Posed for the crowd. Forgot the race.',
    'Out before the first corner. Iconic.',
  ],
  acid: [
    'Dissolved. Smelled faintly of lemons.',
    'Became a little puff of fizz.',
    'The lagoon pickled you like a gherkin.',
    "Lovely lagoon. Terrible holiday.",
    'The Acid Lagoon keeps one more souvenir.',
    'Lemon lagoon: would not float again.',
  ],
  goo: [
    'The Gate of Goo stayed shut. Smugly.',
    'Stopped at the gate. Wrong password.',
    'Jelly country claims another Kevin.',
    'The goo gate wins. It always wins.',
    'Toured the Goo Gate. Never left the lobby.',
    'The goo kept you. It has a collection.',
  ],
  sea: [
    'Lost at sea. A very pink sea.',
    'The Great Womb Sea was a bit too great.',
    'Big sea, tiny Kevin. The sea won.',
    'Halfway there. The sea kept the other half.',
    'Booked a sea cruise. Forgot the return ticket.',
    'The Big Macros say thanks for visiting.',
    'The sea sends its regards. And a small fish.',
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
    'The Rapids rinsed you like a lettuce.',
    'So close you could hear the egg humming.',
    'One zone from the egg. ONE.',
    'The Rapids took this round. And your towel.',
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
// 34 characters or fewer (result subtitle on a phone).
export const NEAR_MISS_LINES = [
  'The egg checked her watch. Hurry!',
  'A whisker away. Next one is yours.',
  'Coach dropped the clipboard. GO!',
  'One more swim. You KNOW it.',
  'The egg saw you. Make her look.',
  'The next Kevin is stretching.',
  'So close the egg blushed.',
  'That was the warm-up. Go again.',
];
// One quick lesson for next time, by what got you.
export const TIP_BY_REASON = {
  energy: ["Grab more fruit sugar. Strawberries aren't decoration.", 'Draft behind rivals. It refills you for free.', 'DASH burns GAS. Save it for gaps, not for fun.'],
  acid:   ['Swim around green puddles. Blue bubbles fix the burn.', 'Burning? Find a blue bubble. It stops the melt.', 'Antacid Coat makes acid burn 60% less.', 'Never lick the acid. The acid licks back.'],
  bonk:   ['Line up with the gap early, then go straight.', 'Goo Surfer lets you shrug off the walls.', 'Draft a rival through the gate. They find the gap.'],
  wbc:    ['Keep a rival between you and the Big Macro.', 'Shields eat one bite. Grab every helmet.', 'Let the Macro lunge, THEN swerve. Close shaves pay double.',
            'A Macro chewing a rival is not chewing you. Dodge it mid-snack!'],
  wrong:  ['At the Fork, follow the pink sparkles.', 'Smart rivals usually pick right. Tiffany, mostly.', 'Egg Nose puts a big arrow on the right tube.'],
  late:   ['Tap FAST at the egg. Both thumbs are allowed.', 'Arrive earlier: chain combos for FRENZY speed.', 'Save a DASH for the last stretch. Every bit counts.'],
  crash:  ['The tube hiccupped, not you. Swim on, Kevin!', 'Tube glitch, not a Kevin glitch. Your DNA is safe.'],
  quit:   ['Breaks are allowed. The egg is very patient.', 'Back when you are ready. Coach is holding your spot.'],
  lateRoute: ['Arrive earlier: DASH on the straights, not the bends.', 'Chain passes into FRENZY. FRENZY is a shortcut with confetti.',
              'Draft, then DASH out. A slingshot beats a long chase.'],
};
// New personal best.
export const RECORD_LINES = [
  'Dad is weirdly proud.',
  'New best! Frame it. Put it on the fridge.',
  'Personal record! Dad rang Grandad. Twice. At dawn.',
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
  '4-8': ['Big shift at the factory: {dna} DNA!', 'Dad did yoga AND flossed. {dna} DNA.', "You were gone ages. Here's {dna} DNA.", 'The night crew worked hard: {dna} DNA.',
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
    intro: 'Brock: "Brock is PUMPED. Brock wrote a poem about it. This is Gerald."',
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
    intro: 'Gunther: "Dieter, are you rolling? Backflip through the acid!"',
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
  jetstream:   'Tuck in, then GO. A slingshot with manners.',
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
  all: 'All {total} mashups found! Tiffany asked to borrow it.',
};

// ---------------------------------------------------------------- babies and Dad
export const BABY_FIRST_WORDS = [
  '"Again!"', '"Swim?"', '"Strawberry!"', '"Fast!"', '"Dada go walk!"',
  '"Wiggle!"', '"Egg!"', '"Combo!"', '"More fruit!"', '"Zoom zoom!"',
];
// Per habit: one line per normal level (HABITS[id].max lines), a tiny story that ends on the maxed line.
// Read q[Math.min(level, q.length - 1)]. Index 0, the middle and the last keep the old 3-tier lines.
export const HABIT_QUIPS = {
  broccoli: [
    'Dad ate one floret. He made a face.',
    'Dad ate two florets. Same face.',
    'Dad tried broccoli soup. The face softened.',
    'Dad ordered broccoli. On purpose. In public.',
    'Dad bought a broccoli fridge magnet. Then three.',
    'Dad puts broccoli on pizza now.',
    'Dad brings broccoli to barbecues. Nobody asked.',
    'Dad grows his own. He talks to it.',
    'Dad won a ribbon at the veg show. He wept.',
    'Dad IS broccoli. Tiny trees forever.',
  ],
  water: [
    'Dad had a glass. A small one.',
    'Dad had two glasses. He announced both.',
    'Dad bought a water bottle with a little handle.',
    'Dad set a phone alarm called SIP.',
    'Dad now knows where every toilet in town is.',
    'Dad carries a giant water bottle everywhere.',
    'Dad has strong opinions about ice cubes now.',
    'Dad toasts with water at weddings. Loudly.',
    'The water bottle has a name now. It is Brenda.',
    'Dad is 90% water. Hydration legend.',
  ],
  sleep: [
    'Dad went to bed at 11. Wild.',
    'Dad went to bed at 10:30. Total rebel.',
    'Dad owns a sleep mask now.',
    'Dad bought a pillow fancier than the bed.',
    'Dad sleeps like a baby. A well rested one.',
  ],
  jeans: [
    'Dad loosened the belt one notch.',
    'Dad loosened it two notches. Breathed out.',
    'Dad tried on some slacks. Roomy.',
    'Dad gave away the skinny jeans. The bin said thanks.',
    'Dad wears comfy trousers now.',
    'Dad bought cargo shorts. So many pockets.',
    'Dad wore pyjama bottoms to the shop. Confidently.',
    'Dad lives in joggers. Freedom!',
  ],
  berries: [
    'Dad ate a blueberry by accident.',
    'Dad ate a raspberry on purpose. Growth.',
    'Dad put berries on his cereal. Wild.',
    'Dad has a favourite berry. It changes daily.',
    'Dad makes smoothies. Loudly.',
    'Dad has purple fingers. He wears them proudly.',
    'Dad knows a secret bramble. He tells no one.',
    'Dad has a berry farm. Basically.',
  ],
  walk: [
    'Dad walked to the end of the road.',
    'Dad walked to the shop. Forgot the milk. Worth it.',
    'Dad bought proper shoes. With gel bits.',
    'Dad does 10,000 steps and tells everyone.',
    'Dad waves at the same dog every morning.',
    'Dad climbed a mountain. On a Tuesday.',
  ],
  beatbox: [
    'Dad went "boots and cats" once.',
    'Dad went "boots and cats" twice. Mum left the room.',
    'Dad drops a beat on the kettle.',
    'Dad beatboxes while cooking.',
    'Dad won a beatbox battle at the bus stop.',
    "Dad has a beatbox channel. It's good.",
  ],
  hottub:   ['Dad said goodbye to the hot tub.', 'Dad takes cool showers. A hero.'],
  meditate: ['Dad sat still for 30 seconds.', 'Dad says "namaste" to the cat.', 'Dad floats. Zen master Dad.'],
  factory: [
    "The factory opened! It's tiny.",
    'The factory hired a cat. Unpaid.',
    'The factory got a second shelf. Big day.',
    'The factory doorbell plays a beatbox.',
    'The factory has a conveyor belt. It squeaks.',
    'The factory has a canteen now.',
    'The canteen does a Tuesday curry. Legendary.',
    'The factory cat got promoted. Still unpaid.',
    'The factory has a gift shop. Steve visits daily.',
    'The factory runs itself. And hums.',
  ],
  gps:      ['Autopilot online. It drives a bit badly.'],
};
// New generation unlocked.
export const GEN_UNLOCK_LINES = [
  'Grandad does loud stretches now. The kids are watching.',
  'A new generation! Same tail energy, better habits.',
  "The family tree grew a branch. It's a fast branch.",
  'Dad is a Grandad now. He still beatboxes.',
  'Grandma knits tiny race numbers now. Every size.',
  'The family fridge is all medals. The milk lives outside.',
  'Another branch on the tree. The tree wants a gardener.',
  'The new Dad already owns a whistle. Coach approves.',
  'A fresh generation. The family photo needs a wider lens.',
  'The family group chat is all eggs. Every message.',
];
// Factory names by factory level, 0 to 10.
export const FACTORY_NAMES = [
  "Dad's sock drawer", 'The garden shed', 'Spare room workshop', 'The garage lab', 'Corner shop',
  'Swimmer Bakery', 'Tail & Co. Works', 'The Wiggle Mill', 'Kevin Industries', 'Gene Machine HQ',
  'DNA MegaPlant 3000',
];

// ================================================================ first swim
// Shown at the start line before the first drag.
export const START_HINT = 'Drag to steer. DASH burns GAS to zoom.';
// Energy bar is nearly empty.
export const LOW_ENERGY = [
  'Low on GAS! Eat fruit!',
  'GAS light is on. FRUIT. NOW.',
  'GAS tank dry! Grab a strawberry!',
];
// First time each hazard or pickup scrolls into view: verb plus payoff, 7 words or fewer.
export const HAZARD_INTRO = {
  acid:     'Green puddle! Swim around, or melt.',
  alkali:   'Blue bubble! Grab it to stop burning.',
  gate:     'Goo wall! Aim for the GAP.',
  goo:      'Goo blob! Dodge it or get stuck.',
  wbc:      'Big Macro! Hide behind a rival.',
  current:  'Current! Steer against it, or ride it.',
  cilia:    'Hairs flash, then swat. Slip past!',
  forkSign: 'Two tubes! Follow the pink sparkles.',
  dna:      'DNA blob! Grab it for Dad\'s Habits.',
  helmet:   'Helmet! Grab it. Blocks one hit.',
  sugar:    'Fruit! Eat it to fill your GAS.',
};
// The very first death of a save: plain-spoken, says what happened and what to do. 48 characters or fewer.
export const FIRST_DEATH = {
  energy: 'Out of GAS. Fruit = GAS. Your tail says please.',
  energyEgg: 'Out of GAS {cm} cm short. Fruit first, egg next!',
  energyEggAt: 'Knocking, GAS on empty. Fruit en route!',
  acid:   'Green melts, blue heals. Nature colour-codes.',
  wbc:    'Big Macros eat loners. Bring a rival as a snack.',
  bonk:   'Line up with the goo gap early. Goo is clingy.',
  late:   'At the egg, tap FAST. A rival never says please.',
  wrong:  'Wrong tube! Follow sparkles. Eggs love bling.',
  crash:  'The tube hiccupped. Not your fault. Swim again!',
  quit:   'Break time. The tube kept your spot warm. Ish.',
  lateRoute: 'Dash on the straights. A rival never brakes.',
};

// ================================================================ rival voice for the finale
// Keyed by the exact RIVALS names. bump: you bumped them, shove: they shoved you at the egg,
// sprint: they find the last gear, drill: muttering while shoving at the egg.
export const RIVAL_REACTS = {
  'Steve': {
    bump:   ['Steve: "Sorry! Was that my fault?"', 'Steve: "Ow! That was my sandwich side."', 'Steve: "Sorry! Doug says hi, by the way."'],
    shove:  ['Steve: "Excuse me! Mum says share."', 'Steve: "What a handsome egg! Sorry!"', 'Steve: "Oh no, was that me? Sorry!"'],
    sprint: ['Steve: "Wheee! Is this allowed?"', 'Steve: "These hairs are so supportive!"', 'Steve: "I had a big breakfast for this!"'],
    drill:  ['Steve: "Knock knock! Sorry to bother!"', 'Steve: "Lovely shell. Is it original?"', 'Steve: "Egg, I wrote you a song. Verse one."'],
  },
  'Brock': {
    bump:   ['Brock: "BRO. My gains!"', 'Brock: "Ow. Brock feels a limerick."', 'Brock: "That was cardio. Thanks, bro."'],
    shove:  ['Brock: "Brock shoves. Not sorry."', 'Brock: "Box out, bro!"', 'Brock: "Shove rhymes with love. Not today."'],
    sprint: ['Brock: "LAST SET! MAX REPS!"', 'Brock: "For you, Gerald! FOR GERALD!"', 'Brock: "Ode to my tail! GO, TAIL, GO!"'],
    drill:  ['Brock: "Eight... nine... TEN REPS!"', 'Brock: "Egg, Brock wrote you twelve verses."', 'Brock: "Egg, thou art... very round."'],
  },
  'Tiffany': {
    bump:   ['Tiffany: "Bump rate up 12%. Concerning."', 'Tiffany: "My highlighter! It SMUDGED."', 'Tiffany: "Bumpy service. One star."'],
    shove:  ['Tiffany: "Shove angle: 31 degrees. Ideal."', 'Tiffany: "Sorry. No. NOT sorry. Move."', 'Tiffany: "Move. I have a book signing."'],
    sprint: ['Tiffany: "Final chapter. I sprint."', 'Tiffany: "Top speed: 99.7%. Holding."', 'Tiffany: "Footnote: I was always faster."'],
    drill:  ['Tiffany: "Drill angle 42. Perfect."', 'Tiffany: "Spoiler: the egg picks me."', 'Tiffany: "Breathe, Tiff. Four in, four out."'],
  },
  'Gunther': {
    bump:   ['Gunther: "That was a stunt. Planned."', 'Gunther: "You bumped an artist. Shameful."', 'Gunther: "Method acting. You felt it, yes?"'],
    shove:  ['Gunther: "Stunt shove! Rated PG!"', 'Gunther: "Move. The light is perfect."', 'Gunther: "Shove scene, take one. Flawless."'],
    sprint: ['Gunther: "FINAL STUNT! ROLL CAMERA!"', 'Gunther: "The finale! Cue the strings!"', 'Gunther: "Keep rolling, Dieter! Budget!"'],
    drill:  ['Gunther: "Drill spin! Double twist!"', 'Gunther: "Egg, this is your close-up."', 'Gunther: "Dieter, zoom in. Dieter?"'],
  },
  'Chad Thundertail': {
    bump:   ['Chad: "My HAIR! Do you know the cost?"', 'Chad: "Watch the merch, Kevin!"', 'Chad: "Ow. Is anyone counting? Please?"'],
    shove:  ['Chad: "Champions go first. Rules."', 'Chad: "I practised this shove in a puddle."', 'Chad: "Thundertail coming through!"'],
    sprint: ['Chad: "THUNDERTAIL MODE! ENGAGED!"', 'Chad: "Mum says I am handsome. Mum is right."', 'Chad: "This one is for Uncle Thad!"'],
    drill:  ['Chad: "Egg, it\'s me. Chad. You know me."', 'Chad: "Counting in my head: 1001, 1002..."', 'Chad: "Egg, my family says you know us."'],
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
// Retry button text: per nemesis, a close loss, or default. 17 characters or fewer each.
export const REMATCH_LINES = {
  'Steve': ['GROUP HUG AGAIN?', 'WAVE BACK. GO!'],
  'Brock': ['ONE MORE SET', 'REMATCH, BRO'],
  'Tiffany': ['REWRITE PAGE 1', 'PROVE HER WRONG'],
  'Gunther': ['RUN IT BACK', 'ONE MORE STUNT'],
  'Chad Thundertail': ['MESS UP HIS HAIR', 'DETHRONE CHAD'],
  close: ['SO CLOSE. AGAIN!', 'FINISH THE WIGGLE', 'THIS IS THE ONE'],
  default: ['SWIM AGAIN 💦', 'ONE MORE WIGGLE', 'NEXT KEVIN, GO!', 'BACK IN THE TUBE', 'AGAIN! AGAIN!'],
  // After a win (18 characters or fewer once filled, {gen} is the next generation number).
  win: ['SEND THE KID 🍼', 'GEN {gen} GO!', 'ANOTHER BABY?!', 'DO IT AGAIN, DAD', 'NEXT GEN, GO!', 'DYNASTY TIME 👑'],
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
export const FINISHER_LINES = ['CASHED IN!', 'MIC DROP!', 'TAIL WHIP!', 'BANKED IT!', 'CHA-CHING!', 'SMART MONEY!', 'COACH IS PROUD!', 'TO THE VAULT!'];
// Echo Chamber kept part of a dropped combo.
export const ECHO_LINES = ['ECHO!', 'SAID IT TWICE!', 'ENCORE!'];
// Extra combo words above COMBO_WORDS: [min combo, word].
export const COMBO_WORDS_HIGH = [[120, 'DIETER IS FILMING'], [160, 'BIO TEACHER WEPT'], [200, 'WIGGLE DEITY'], [250, 'MITOCHONDRIA SALUTES'],
  [300, 'BIOLOGY IS SHAKING'], [400, 'TEXTBOOK REWRITE'], [500, 'ONE IN A MILLION']];

// ================================================================ mutation flavour (48 characters or fewer)
export const MUT_FLAVOR = {
  turbo:   'Tail now has a spoiler. Unclear why.',
  tank:    'Packed lunch. And second lunch.',
  helmet:  'Safety first. Style second. Hair last.',
  draft:   'Professional tailgater. Licensed.',
  magnet:  'Snacks find you. You just float there.',
  sweet:   'Five a day? Try fifty.',
  antacid: 'Lemon-proof. Lagoon-proof. Not Chad-proof.',
  eco:     'Wiggles less. Wins more. Naps often.',
  memory:  'Remembers every combo. And your birthday.',
  whip:    'Snaps like a wet towel. Ready again already.',
  ram:     'Says "excuse me". Does not wait for an answer.',
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
  ['A Thundertail is in the queue. Same hair, new tail.', 'He claims "a thousand and change". Family maths.', "{heir} has heard this before. So have the Kevins.", '{grandad} says: "Beat him for me."'],
  ['Gary is back. Turns out he only dissolved a little.', 'He has a warning poster now: DO NOT LICK THE LAGOON.', '{heir} makes every Kevin read it twice.', '{grandad} races the flaming scooter past it daily.'],
  ['Coach Gonad found a photo of himself from gen 1.', 'Same whistle. Same face. A race number on his tail: 999,99...', 'The last digit is smudged. He put the photo away fast.', "{heir} told the Kevins: don't ask."],
  ['Generation 9. The family tree has a family tree.', '{grandad} is knitting in the comfy chair. Fast.', '{heir} made a banner. Every Kevin ever is cheering.', 'This is the big one.'],
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
  '"I was #999,999. One place ahead of the very first Kevin."',
  '"So I stopped. I stayed. I coached. Every Kevin, every swim."',
  '"Also: I never surfed a shark. I made it all up so you would keep swimming."',
  'And now, at last, Coach Gonad cries. The tear ducts were in there all along.',
  'Dad is a Great-Great-Great-Great-Great-Great-Great-Grandad. He still beatboxes.',
];
// Big title on the welcome-back screen.
export const WELCOME_TITLES = [
  'Welcome back! Dad alphabetised the vitamins.',
  'The factory worked nights. Dad brought biscuits.',
  'Coach kept your spot warm. He sat on it.',
  'The Kevins missed you. They made a banner.',
  'Welcome back! Steve waved the whole time.',
  'Fresh tail, fresh DNA. Dad ironed both.',
  'The tube is ready. It even hoovered.',
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
  winEgg:    'NEXT: get IN the egg',
};

// ================================================================ in-race pools and system messages
// Short Coach Gonad lines for in-race toasts, 44 characters or fewer. Long ZONE_LINES go to the pause tip.
export const ZONE_LINES_SHORT = {
  launch: [
    'Draft a rival. Free speed, like my pension.',
    'Fruit = GAS. Save me a grape.',
    'Pass three in a row. Gary managed two.',
    '999,999 to go. Easy maths.',
    "DASH isn't a doorbell. Pick your moment.",
    'I started back there too. Long story.',
    'Wiggle like Dad at a wedding. Full hips.',
    'One place ahead of last. Best seat in here.',
    'Dead last? The view only gets better.',
    'Tube tip: the walls are not snacks.',
  ],
  acid: [
    'Green = ouch. Blue = aaah.',
    'Blue bubbles fix burns. And my heartburn.',
    'This lagoon has the pH of a grumpy lemon.',
    'This is where Gary happened. Moving on.',
    'I backstroked this acid. In the bath.',
    'Keep the combo alive. Unlike my houseplant.',
    'Antacid Coat? Then show off.',
    'Stay calm. Melting is optional.',
  ],
  goo: [
    'Line up early, like the canteen on pie day.',
    'Goo is the traffic jam of the body.',
    'Bonked? Pretend it was on purpose.',
    'Let a rival find the gap. Then borrow it.',
    "It's like jelly, but sadder.",
    'Find the gap. The goo can smell fear.',
    'Thread the gap. I scored a 3. Out of 100.',
    'Nobody wants to be the raisin.',
  ],
  sea: [
    'Big Macros: slow, hungry. Me on a Sunday.',
    'Keep a rival between you and the mouth!',
    'Shields take a bite. I wear three. Habit.',
    'FRENZY at 10. I get one at 2. Coffee.',
    'Surfed this on a shark. Shark was a raisin.',
    'Halfway! I am crying at the start line.',
    'Draft a rival. Not a Macro. Ask Gary.',
    'Swing wide, then DASH. Wide as my sofa.',
  ],
  fork: [
    'Pink sparkles, son. I hung those myself.',
    'The wrong tube has my old flip-flop in it.',
    "Don't flip a coin. You have no hands.",
    'Tiffany nearly always picks right. Follow!',
    "LOOK for sparkles. Not at Chad's hair.",
    'Two tubes. One has snacks. Kidding. Egg.',
    'Trust the sparkles. Not Chad.',
    'The empty tube is very pretty. And empty.',
  ],
  rapids: [
    'Hairs flash white, then swat. I just flinch.',
    'Swat coming? Switch walls. Be a pinball.',
    'DASH the fast bits. My knees cannot.',
    'The current hates you. It hates me more.',
    'I wrestled a hair here. In a dream.',
    'I can smell the egg. And cinnamon?',
    "Almost there! I'm warming up the whistle.",
    'Chain the passes. Coach needs a show.',
  ],
  egg: [
    'TAP TAP TAP! I am air-tapping too.',
    'Tap like you owe Mum a text. FAST.',
    'Both thumbs! Toes too, if you find any!',
    'Stop reading! Reading is for Tiffany!',
    "This is it, Kevin! I'm SO proud!",
    "Shove them off! It's YOUR egg!",
    'Your finger is a hero. Mine retired.',
    'Never got this far myself. Busy helping.',
    'Win this and I buy the sausage rolls.',
  ],
};
// System pops and toasts. Pop lines are 16 characters or fewer.
export const UI_LINES = {
  // Back on a paused swim after a long break: what Dad's factory made meanwhile ({dna}).
  factoryWaiting: ["Dad's factory made +{dna} DNA. It waits on the menu.", 'Factory shift done: +{dna} DNA on the menu.', 'While you were out: +{dna} DNA. Dad clocked in.'],
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
  forkRight:    ['NOSE KNOWS!', 'GLITTER GPS!', 'EGG-ACTLY!', 'FOLLOW THE PINK!'],
  forkWrong:    ['ECHO... ECHO...', 'TOO QUIET...', 'TUMBLEWEED...', 'HELLO? ANYONE?'],
  zoneClear:    ['ZONE: HANDLED', 'NAILED IT!', 'TUBE DEFEATED!', 'COACH SALUTES!'],
  wingBack:     ['WINGMAN IS BACK!', 'BUDDY RETURNS!', 'HE BROUGHT FRIES', 'BACKUP ARRIVED!'],
  autopilotOff: ['AUTOPILOT OFF', 'YOUR TAIL NOW', 'MANUAL WIGGLE', 'SAT-NAV NAPPING'],
  copied:       ['COPIED!', 'READY TO SHARE!', 'BRAG SAVED!', 'GO SHOW STEVE!'],
};
// Why Dad's shop picked this habit for you, by what ended the last run.
export const DAD_PICK_LINES = {
  energy:    'You ran dry. Dad swaps fizzy pop for water and berries.',
  energyEgg: 'Dry with the egg in sight. Dad is chugging water.',
  acid:      'Acid ate your juice. Dad bought a water jug. A big one.',
  wbc:       'A Big Macro got you. Dad is mourning the hot tub.',
  bonk:      'Stuck in the goo. Dad found his walking shoes. Dusty.',
  late:      'Beaten to the egg. Dad is eating broccoli. Angrily.',
  lateRoute: 'A rival got there first. Dad is stockpiling broccoli.',
  wrong:     'Wrong tube. Dad is drawing you a map. In glitter.',
  win:       'A baby! Dad eyes a bigger factory. Or a long, smug meditation.',
  generic:   'Healthy dad, speedy Kevins. Dad is stretching. Loudly.',
};

// ================================================================ near-miss by gap (UI picks by seconds behind the winner)
// hair: under 0.3 s, tail: under 1 s, length: under 3 s. Always points at the next swim.
export const NEAR_MISS_BY_GAP = {
  // 34 characters or fewer each.
  hair:   ['Lost by a hair. A single hair.', 'Photo finish. You blinked first.', 'The egg blinked. Be there first.',
           'Tiffany needed a microscope.', 'Gunther saw the replay. He gasped.'],
  tail:   ['One wiggle short. Go find it!', 'A tail behind. Yours was napping.', 'Under a second. One wiggle!',
           'One DASH earlier. That was it.', 'Coach drew arrows. All say DASH.'],
  length: ['A few lengths back. Catchable!', "Three seconds. One combo's worth.", 'Close enough to wave. Now knock.',
           'Three seconds is one FRENZY.', 'You heard the drilling. Be it.'],
};

// ================================================================ endless generations and the dynasty
// Gen 11 and up: UI cycles these (index (gen - 11) % 8). {gen} generation number, {heir} the grown-up parent,
// {grandad} the generation before. Every swimmer is a Kevin from {heir}'s family.
// Running gag: the Kevin Museum adds a wing every generation (the last line of each entry).
export const GEN_INTROS_ENDLESS = [
  ['Generation {gen}. Coach Gonad has a retirement party today.', "He skipped it. He's at the start line with a whistle.", '{heir} saved him some cake. The Kevins ate it.', 'The Kevin Museum opens wing {gen}: Uneaten Cake.'],
  ['Family reunion! {grandad} booked a bouncy castle.', 'Every Kevin ever bounced at once. The castle filed a complaint.', '{heir} is still picking glitter out of the Kevins.', 'Kevin Museum, wing {gen}: one very tired bouncy castle.'],
  ['A Steve is in the queue, apologising. Family trait.', 'Sorry to the Kevins. Sorry to the walls. Sorry to a Big Macro.', '{heir} told the Kevins to say sorry back. Family tradition.', 'Kevin Museum, wing {gen}: The Hall of Apologies. It says sorry first.'],
  ["Tiffany's egg book has a new edition.", 'Chapter {gen} is about your family. It has diagrams.', '{heir} bought every Kevin a copy. Nobody read it.', 'Kevin Museum, wing {gen}: the gift shop. It sells the book.'],
  ['A Thundertail is back. Same hair, louder.', 'Claims "thousands" of wins. The family maths got worse.', '{heir} packed the Kevins earplugs.', 'Kevin Museum, wing {gen}: Chad Claims. It is mostly empty.'],
  ['The Kevin Museum throws a gala. Entry costs one strawberry.', "There's a statue of the first Kevin. He's dead last in it.", '{heir} took the Kevins on a school trip. Very inspiring.', 'The museum now has {gen} wings. The map has a map.'],
  ["A Brock opened a gym. It's called BROCK.", 'The sign flexes. Nobody knows how.', '{heir} signed the Kevins up. Tail day is every day now.', 'Kevin Museum, wing {gen}: one dumbbell. It is very heavy.'],
  ["Gunther's family runs a stunt school now.", 'Lesson one: no stunt doubles. Lesson two: see lesson one.', "{heir} said no. The Kevins went anyway. {grandad} cheered.", 'Kevin Museum, wing {gen}: The Ramp. Do not touch the ramp.'],
];
// Shown once, after the generation 9 finale.
export const DYNASTY_STAMP = 'DYNASTY! Nine generations. The tube will never forget your family.';

// ================================================================ first swim and cash-in
// Launch caption on the very first swim.
export const FIRST_SWIM_LAUNCH = 'One million ahead. Off you pop!';
// End of the first swim when the tutorial was cut short (gentler than TUT_TEXT.retry).
export const TUT_TEXT_GENTLE = 'Nice wiggling! Coach has more tricks later.';
// One-word praise when a tutorial step is done, 12 characters or fewer.
export const TUT_PRAISE = { steer: 'WIGGLY!', dash: 'ZOOM!', fruit: 'YUM!', draft: 'SNEAKY!', combo: 'COMBO KING!', cash: 'KA-CHING!' };
// First time a combo is worth cashing in (28 characters or fewer).
export const CASH_HINT = 'Tap CASH to bank it!';
// A bonk smashed a big unbanked combo (18 characters or fewer).
export const BREAK_POT_LINES = ['THERE GOES COLLEGE', 'POOF. ALL GONE.', 'BYE BYE, COMBO', 'RIP COMBO', 'SHOULD HAVE CASHED'];
// Combo milestones, by combo count (16 characters or fewer).
export const MILESTONE_LINES = { 40: 'FORTY! ON FIRE!', 60: 'SIXTY! WIGGLING!', 80: 'EIGHTY?! KEVIN!', 100: 'CENTURY!', 150: 'UNREAL!', 200: 'DOUBLE CENTURY!', 300: 'THREE HUNDRED?!', 400: 'FOUR HUNDRED!!', 500: 'FIVE HUNDRED?!?!' };

// ================================================================ short banners (28 characters or fewer)
// One punchy line per RACE_EVENTS id (core.js) that still says the rule.
export const EVENT_SHORT = {
  sneeze:     'Turbulence! Hold your tail!',
  sugarRush:  'Fruit everywhere! Eat up!',
  stampede:   'Big Macros incoming! Dodge!',
  slipstream: 'Drafting is doubled!',
  disco:      'Combos last longer, pay x2!',
  espresso:   'Zoom! GAS burns faster.',
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
  launch: ['Kevin #{n}! Same tail, new you!', 'I once surfed a shark. Here.', 'Back of the queue? I remember.', 'Wiggle first. I never explain.', 'Draft, pass, repeat. Then lunch.', 'Fresh legs! Well, fresh tail.', "Kevin #{n}, GO! I'll jog behind."],
  acid:   ['Lemon lagoon. You know the drill.', 'Green bad. Blue good. Lick nothing.', 'Kevin #{n}: fizz is not flavour.', "Melting's optional today.", 'Around the puddles. Trust my scars.', 'Acid ahead. I still smell lemony.'],
  goo:    ['Gap hunting season is open.', 'Goo walls. I hold a grudge.', 'Be the needle, not the haystack.', 'Kevin #{n}, gap first. Snacks later.', 'Jelly ahead. I still have bits.', 'Thread it. Like a shoelace. Neatly.'],
  sea:    ['Shark surfing? Done it. Twice.', 'Macros bite. I hide behind Brock.', 'Macros eat loners. And my sandwiches.', 'Halfway, Kevin #{n}! Keep going!', 'Macros hum. Hum back. Confuse them.', 'Shields up. Is it lunch yet?', 'Act calm. Macros smell panic. Yum.'],
  fork:   ['My shark took the wrong tube.', 'Follow the glitter. I sneezed some.', 'Sparkly tube. The other has echoes.', 'Trust your nose. Mine is blocked.', 'Left? Right? My whistle says LOOK.', 'Skip the empty tube. I napped.', 'Smell cinnamon? Go that way.'],
  rapids: ['Hairs swat on beat. Count along.', 'My shark hated these rapids.', 'White flash, then swat. I blink.', 'Hairs high-five you. Unwanted. Dodge.', 'Kevin #{n}, upstream! Like ambitious salmon.', 'Wiggle louder! I hum. Nobody notices.', 'Last tube! My cap is sweating.'],
  egg:    ['THIS IS THE ONE. Probably!', 'TAP, Kevin #{n}! I air-tap too!', 'Both thumbs! I believe in thumbs!', 'Elbows out. Sausage rolls after. TAP!', 'DRILL! I never got this close.', 'Tap! I am NOT crying. TAP!'],
};

// ================================================================ UI lessons (first swim, drill, cash-in)
// Cash-in hint for keyboard players (instead of CASH_HINT when no touch was used).
export const CASH_HINT_KEYS = 'Press S to cash in your combo!';
// The goal caption on the very first swim, after FIRST_SWIM_LAUNCH.
export const FIRST_SWIM_GOAL = 'Pass 999,999 swimmers. Then the egg.';
// A Big Macro bit you but spat you out (the 'spareBite' moment). 28 characters or fewer.
export const SPARE_BITE_LINES = ['Spat out! Not tasty enough.', 'Too spicy for that Macro!', 'The Macro said: needs salt.'];

// ================================================================ story before the first win
// First time you reach each zone: a 2 to 3 line story card (44 characters or fewer per line). Story, not tips.
export const ZONE_FIRST = {
  acid: [
    'Smells like old lemons. And bad decisions.',
    'Gary paddled here. We do not talk of Gary.',
    'Somewhere out there: blue bubbles. Hope.',
  ],
  goo: [
    'The Gate of Goo. Ancient. Wobbly. Rude.',
    'It lets through the brave and the lucky.',
    'Everyone else becomes wall decoration.',
  ],
  sea: [
    'The Great Womb Sea. So pink. So wide.',
    'Big Macros patrol here. The shy one is Doug.',
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
  'Steve': ['Steve: "I won? Sorry! Race me again?"', 'Steve: "Fun tour! Same time tomorrow?"', 'Steve: "Mum will frame this. Come back!"'],
  'Brock': ['Brock: "Brock wins. Come back stronger."', 'Brock: "Rematch, bro. Bring protein."', 'Brock: "Brock wrote you a sonnet. Come."'],
  'Tiffany': ['Tiffany: "Predicted: 0.1 s. Try harder."', 'Tiffany: "See you on page one. Again."', 'Tiffany: "Won! I was never worried. Ha!"'],
  'Gunther': ['Gunther: "Stunt of the year. Top it."', 'Gunther: "Come back. Bring a ramp."', 'Gunther: "A masterpiece. Sequel soon."'],
  'Chad Thundertail': ['Chad: "I won? MUM! Mum, did you see?"', 'Chad: "Come back. Chad needs fans."', 'Chad: "Rematch? The hair is ready."'],
};
export const RIVAL_GLOATS_TIGHT = ['"Felt your breath. Rude."', '"My tail is still shaking."', '"By a whisker! Tell no one."', '"You were RIGHT there. Spooky."'];
// RIVAL_STEAL: said from inside the egg, after a rival got in first.
export const RIVAL_STEAL = {
  'Steve': ['Steve: "In! Is there an audio guide?"', 'Steve: "I\'m in! Mum will cry. I\'ll cry."', 'Steve: "Sorry! I\'ll name it Kevin!"'],
  'Brock': ['Brock: "Brock is IN. Brock is home."', 'Brock: "Nice egg. Good gains, bro."', 'Brock: "Brock will be a big baby."'],
  'Tiffany': ['Tiffany: "Interior: five stars. Cosy."', 'Tiffany: "In 0.3 s ahead. As modelled."', 'Tiffany: "I brought my own bookmark."'],
  'Gunther': ['Gunther: "Stuck the landing. Inside!"', 'Gunther: "Ten out of ten. Egg agrees."', 'Gunther: "No stunt double. Just me."'],
  'Chad Thundertail': ['Chad: "Chad is in. Tell the fan club."', 'Chad: "Egg, meet the hair."', 'Chad: "Told you. Chad gets in."'],
};
// RIVAL_FAREWELLS: a rival drops out of the race.
export const RIVAL_FAREWELLS = {
  'Steve': ['Steve: "Tour over for me! Go, Kevin!"', 'Steve: "Bye, Doug! You were wonderful!"', 'Steve: "Sorry, all! Save me a sandwich!"'],
  'Brock': ['Brock: "Brock is done. Brock rests."', 'Brock: "Brock out. Read my poems, bro."', 'Brock: "Tell Gerald... Brock loved him."'],
  'Tiffany': ['Tiffany: "A plot hole. I fell in it."', 'Tiffany: "Spoiler: I come back angrier."', 'Tiffany: "Odds of this: 3.1%. Annoying."'],
  'Gunther': ['Gunther: "Stunt failed. Worth it."', 'Gunther: "Roll the sad credits. Slowly."', 'Gunther: "Dieter, you may sleep now."'],
  'Chad Thundertail': ['Chad: "Chad is not out. Chad rests."', 'Chad: "Did I look cool going out?"', 'Chad: "Still counts as a win. Somehow."'],
};
// One epithet each, for name plates and banners.
export const RIVAL_EPITHETS = {
  'Steve': 'the Very Polite',
  'Brock': 'the Protein Poet',
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
    'A {n} combo! Dieter zoomed in. Gunther sulked.',
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
  // diedInFrenzy: the run ended during FRENZY. unbankedPot: died holding an uncashed combo of {n}.
  // shieldsUnused: died with {n} shields still on. followedChadWrong: took the wrong tube right behind Chad.
  // passedRivalThenDied: overtook {name} shortly before the end. wbcAfterDash: a Big Macro ate you right after a DASH.
  diedInFrenzy: [
    'Went out in FRENZY. Loud exit. Great exit.',
    'Out mid-FRENZY. The party kept going.',
    'FRENZY to zero in one second. Iconic.',
    'Peak FRENZY, peak oops. Coach saw both.',
  ],
  unbankedPot: [
    '{n} combo, never cashed. Coach is weeping.',
    '{n} unbanked. Tap CASH next time!',
    'Carried a {n} combo off a cliff. Cash it!',
    '{n} combo, zero DNA. Bank before you bonk.',
  ],
  shieldsUnused: [
    '{n} shields unused. The helmets are offended.',
    'Went out with {n} shields on. Fashion choice?',
    '{n} shields, still out. The hats are confused.',
    'Saved {n} shields for later. There was no later.',
  ],
  followedChadWrong: [
    'You followed Chad. Chad was wrong. Again.',
    'Chad took the empty tube. So did you.',
    'Never follow the hair. Follow the sparkles.',
    'Chad said "trust me". Never trust Chad.',
  ],
  passedRivalThenDied: [
    'Passed {name}, then flopped. {name} waved.',
    'Passed {name}. {name} passed you back. Ouch.',
    '{name} saw you pass, then saw you stop.',
    'Beat {name}, then beat yourself. Classic.',
  ],
  wbcAfterDash: [
    'Dashed straight into a Macro. Delivery!',
    'Zoomed into lunch. Express service.',
    'DASH, then dinner. The Macro said thanks.',
    'Fastest snack that Macro ever had.',
  ],
};
// Title screen tagline, picked at random. {n} is the next Kevin's number.
export const TITLE_TAGLINES = [
  'One egg. One million swimmers. One Kevin.',
  'Kevin #{n} is stretching. He has no legs.',
  'Dead last is just first from the back.',
  'Wiggle hard. Dream big. Avoid the lagoon.',
  'Dad gave up hot tubs for this. Do not waste it.',
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
  'The factory bell rang! +{dna} DNA.',
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

// ================================================================ keyboard tutorial (used instead of TUT_TEXT when no touch was seen)
export const TUT_TEXT_KEYS = {
  steer: { t: 'Arrow keys to steer', s: 'Or A and D. Wiggle wiggle.' },
  dash:  { t: 'SPACE for a burst!', s: 'Costs a little GAS. Use it on gaps.' },
  cash:  { t: 'Press S to cash in!', s: 'Crash first and the chain is gone!' },
  drill: { t: 'Mash SPACE to drill in!', s: 'Any keys work. Faster!' },
};
// Start-line hint for keyboard players (instead of START_HINT).
export const START_HINT_KEYS = 'Arrows steer. SPACE burns GAS to zoom.';

// ================================================================ boss fights (40 characters or fewer per line)
// Keyed by RIVALS first name (Chad Thundertail is 'Chad'). One shouty label per signature move.
export const RIVAL_MOVE_NAMES = {
  Steve: 'SORRY, YOU GO',
  Brock: 'MAX REP!',
  Tiffany: 'CITATION!',
  Gunther: 'STUNT DIVE!',
  Chad: 'HAIR CHECK',
};
// Said during the wind-up of the move (the tell).
export const RIVAL_MOVE_TELLS = {
  Steve:   ['Sorry, coming over! Sorry!', 'Mind if I just squeeze in?', 'Is this the side entrance?'],
  Brock:   ['Spot me, bro...', 'Gerald, count my reps. Out loud.', 'Deep breath. BIG lift.'],
  Tiffany: ['Citation needed... from ME.', 'Hold still. I am citing you.', 'Spoiler: this next bit hurts.'],
  Gunther: ['Roll camera... and...', 'Clear the set! Big one!', 'This next bit wins awards.'],
  Chad:    ['Hold on. Checking the hair.', 'Lighting is perfect. Watch.', 'Fans, get your phones out.'],
};
// Kevin countered the move.
export const RIVAL_COUNTERED = {
  Steve:   ['Steve: "Good block! Fair! Sorry!"', 'Steve: "Lovely block! Doug would clap."', 'Steve: "Blocked! I will use the front."'],
  Brock:   ['Brock: "Bro. You blocked the rep."', 'Brock: "Blocked mid-couplet. RUDE, bro."', 'Brock: "Failed set. Brock is sad."'],
  Tiffany: ['Tiffany: "My citation! REJECTED?"', 'Tiffany: "That is not in the BOOK!"', 'Tiffany: "Peer review was BRUTAL."'],
  Gunther: ['Gunther: "Cut! Cut! Again!"', 'Gunther: "Critics! Everywhere! CUT!"', 'Gunther: "My stunt double did that."'],
  Chad:    ['Chad: "Not on camera, Kevin!"', 'Chad: "Mum always said I peak late."', 'Chad: "Chad meant to wobble."'],
};
// Back in the race after taking the wrong tube at the Fork.
export const RIVAL_COMEBACK = {
  Steve:   ['Steve: "No gift shop in there. Back!"', 'Steve: "Back! I left my sandwich here."', 'Steve: "Sorry I\'m late! Took a tour!"'],
  Brock:   ['Brock: "Wrong tube. Did a lap anyway."', 'Brock: "That was the warm-up tube."', 'Brock: "Brock is BACK. Brock is pumped."'],
  Tiffany: ['Tiffany: "Field research. Obviously."', 'Tiffany: "I panicked. Strike that."', 'Tiffany: "Detour: 4.7 s. Recovering."'],
  Gunther: ['Gunther: "U-turn! Did you film it?"', 'Gunther: "Planned detour. Very scenic."', 'Gunther: "Gunther returns! The sequel!"'],
  Chad:    ['Chad: "Shortcut. Totally meant it."', 'Chad: "Chad was scouting. For fans."', 'Chad: "That tube had bad lighting."'],
};
// Kevin got into the egg first.
export const RIVAL_EGG_LOSS = {
  Steve:   ['Steve: "Yay! Congrats! Name it Steve?"', 'Steve: "You did it, buddy! Group hug?"', 'Steve: "So happy for you! Truly!"'],
  Brock:   ['Brock: "BRO. Respect. Huge respect."', 'Brock: "Gerald, hold me. Brock is sad."', 'Brock: "Good set, Kevin. Good set."'],
  Tiffany: ['Tiffany: "Your win: three stars. Lucky."', 'Tiffany: "Rewriting the ending. Again."', 'Tiffany: "Fine. You get a footnote."'],
  Gunther: ['Gunther: "Best stunt I ever saw."', 'Gunther: "You stole my ending. Respect."', 'Gunther: "Who is your stunt coach?"'],
  Chad:    ['Chad: "Chad still leads. 1000 to 1."', 'Chad: "Chad counts that one. For Chad."', 'Chad: "This does not count. Probably."'],
};
// Kevin is drafting right behind them.
export const RIVAL_DRAFTED = {
  Steve:   ['Steve: "On your left: my tail. Lovely!"', 'Steve: "Make yourself at home! Tea?"', 'Steve: "Company! Did I mention Mum?"'],
  Brock:   ['Brock: "Free ride? Brock wants rent."', 'Brock: "Gerald says you smell of fruit."', 'Brock: "Company. Brock feels a haiku."'],
  Tiffany: ['Tiffany: "Personal space: chapter 4."', 'Tiffany: "Your drafting: two stars."', 'Tiffany: "Too close! My pen is shaking!"'],
  Gunther: ['Gunther: "A stunt double? Finally!"', 'Gunther: "Extras stay behind the star."', 'Gunther: "Dieter, frame Kevin out."'],
  Chad:    ['Chad: "Behind a legend? Lucky view."', 'Chad: "Is it lonely back there? Same."', 'Chad: "You drafted Chad. Chad wins."'],
};
// Big banner when Kevin counters a rival at the egg (16 characters or fewer).
export const EGG_COUNTER_BANNERS = ['COUNTERED!', 'DENIED!', 'NOT TODAY!', 'MY EGG, THANKS!', 'RETURN TO SENDER'];

// ================================================================ near misses with numbers (48 characters or fewer)
// Lost short of the egg. {cm} centimetres short, {sec} seconds behind. hair: tiny gap, tiny: small, close: a bit more.
export const SHORT_BY_LINES = {
  hair: [
    "Short by {cm} cm. Thinner than Chad's alibi.",
    '{sec} s. Tiffany had time to highlight it.',
    '{cm} cm short. The egg felt the breeze.',
    '{sec} s. Shorter than one Steve apology.',
    '{cm} cm. Brock calls it a rounding error.',
  ],
  tiny: [
    '{cm} cm short. The egg left the porch light on.',
    '{sec} s behind. That is one strawberry.',
    '{cm} cm. Coach measured. Coach sighed.',
    '{sec} s. One good DASH, Kevin. Just one.',
    'Short by {cm} cm. Gunther filmed it. Ouch.',
  ],
  close: [
    '{cm} cm short. Close enough to hear knocking.',
    '{sec} s back. One FRENZY closes that.',
    '{cm} cm out. Steve already said sorry to it.',
    '{sec} s. Brock has done longer push-ups.',
  ],
};
// Pop after a finisher when the next combo starts with a bonus. {n} is the bonus (18 characters or fewer).
export const HEAD_START_LINES = ['HEAD START +{n}', 'MOMENTUM +{n}', 'TAILWIND +{n}', 'ROLLING ON +{n}'];

// ================================================================ daily swim
// Medal line by medal: 1 bronze (top 1,000), 2 silver (top 100), 3 gold (a win). 40 characters or fewer.
export const DAILY_MEDAL_LINES = {
  1: ['Bronze! Dad put it on the fridge.', 'Top 1,000! Bronze looks good on you.', 'Bronze. Coach polished it with his cap.', 'Bronze! Steve made you a little card.'],
  2: ['Silver! Top 100. The tube is talking.', 'Silver! Tiffany put you in the index.', 'Silver. Brock wants to bench it.', 'Silver! Dad framed it by the kettle.'],
  3: ["GOLD! Today's egg is yours!", 'Gold! Coach wore sunglasses indoors.', "Gold! Chad says he let you. He didn't.", 'Gold! Dad told the whole street.'],
};
// Last line of the daily share text, by how the swim went. 40 characters or fewer, no hashtags or links.
export const DAILY_SHARE_TAILS = {
  won:   ['Today I beat a million swimmers.', 'Daily egg: mine. Your move.', 'Gold before breakfast. Beat that.', 'Won today. Chad is in denial.'],
  egg:   ['Reached the egg. Knocked. Next time.', 'Saw the egg today. She saw me too.', 'Made it to the egg. Can you?', 'At the door today. Inside tomorrow.'],
  early: ['The tube won today. Rematch tomorrow.', 'Short swim today. Can you go further?', 'Out early. Kevin #2 is stretching.', 'Bonked early. Beat my bonk.'],
};

// ================================================================ Coach Gonad's secret
// [total runs, line]: shown once on the result screen at that run count. Hints, never the reveal (FINALE_LINES).
export const COACH_CLUES = [
  [3, 'Coach Gonad flinched when you said "dead last".'],
  [8, 'Coach has a faded race number. A sticker covers it.'],
  [15, 'Coach: "I was a swimmer once. Long story. Short tail."'],
  [25, 'Coach always stands one spot ahead of the start line.'],
  [40, 'Coach keeps a strawberry in his pocket. "For the last one."'],
  [60, 'The sticker peeled a bit. The number has a lot of nines.'],
  [90, 'Coach: "Nobody should start alone back there. Nobody."'],
];

// ================================================================ why a rival stole the egg (48 characters or fewer)
// Keyed by RIVALS first name. Escalating: index 0 for the first steal, the last for a serial thief.
export const RIVAL_STEAL_WHY = {
  Steve: [
    'Steve got in first. He said sorry to the door.',
    'Steve thought the egg was the gift shop. It was.',
    'Steve is in. He told the egg about Mum. Twice.',
    'Steve won again. He asked the egg for a selfie.',
    'Steve is inside saying sorry to every wall.',
    'Steve: chatty, lovely, and a total menace.',
  ],
  Brock: [
    'Brock got in first. Brock flexed at the door.',
    'Brock is in. He named the egg after a shake.',
    'Brock is doing a victory lap. Inside the egg.',
    'Brock wrote the egg a poem. It rhymes with gym.',
    'Brock is crying in there. Happy tears. Protein.',
    'Brock has a key to the egg now. He did reps.',
  ],
  Tiffany: [
    'Tiffany got in first. 0.0 s off her schedule.',
    'Tiffany is in, reviewing the egg. Four stars.',
    'Tiffany got in 0.3 s ahead. She predicted 0.3.',
    'Tiffany is inside writing chapter 21: You.',
    'Tiffany won again. Her odds of that: 97.2%.',
    'Tiffany rated the race. Kevin: two stars.',
  ],
  Gunther: [
    'Gunther got in first. Dieter got the shot.',
    'Gunther dove in backwards. Standing ovation.',
    'Gunther is in. The documentary needs an ending.',
    'Gunther stuck the landing. He bowed to himself.',
    "Gunther is shooting a director's cut. In there.",
    'Gunther won. The film is now called Kevin Who?',
  ],
  Chad: [
    'Chad got in first. Chad will tell everyone.',
    'Chad is in. Win "a thousand-ish", he says.',
    'Chad is checking his hair in the egg. Mirror.',
    'Chad is giving an interview. From the egg.',
    'Chad is in. "Add it to the pile," he says.',
    'Chad won for real. Nobody will believe him.',
  ],
};

// Retry button by what ended the run (18 characters or fewer).
export const REMATCH_BY_CAUSE = {
  wbc:    ['DODGE THE BLOBS', 'OUTSWIM THE MACRO'],
  acid:   ['NO MORE FIZZING', 'AROUND THE GREEN'],
  bonk:   ['FIND THE GAP', 'UNSTICK. AGAIN.'],
  wrong:  ['FOLLOW SPARKLES', 'PICK THE PINK ONE'],
  energy: ['EAT, THEN SWIM', 'FRUIT FIRST'],
  late:   ['KNOCK LOUDER', 'TAP FASTER'],
  lateRoute: ['BEAT THEM THERE', 'ARRIVE FIRST'],
};

// Result-screen help lines (tokens exactly as written; 40 characters or fewer once filled).
export const RESULT_HELP_LINES = {
  eggBoost: 'Arms pumped: +{pct}% drill next time',
  freshGen: 'Fresh family: rivals ease off',
  genField: 'Gen {gen} field: +{speed}% speed, fruit x{fruit}',
};

// ================================================================ Act 2 (generations 10 to 19), 60 characters or fewer per line
// Gen 10: Coach is back at the start line, wearing #999,999 on purpose now.
export const GEN10_INTRO = [
  'Generation 10. Coach Gonad is back at the start line.',
  'He wears a race number now. #999,999. On purpose.',
  '"Somebody should start one place ahead of the last one."',
  'The Kevins saluted. He pretended not to cry. Again.',
];
// [gen, line] for gens 11 to 18. Chad's '1000 wins' brag hides one real Thundertail win.
export const ACT2_CLUES = [
  [11, 'Chad says "1000 wins". A Kevin asked for one name. Silence.'],
  [12, 'Chad brought the family album. Page one: a real egg photo.'],
  [13, 'Caption: "Great-great-great... (ran out) Uncle Thad. Win 1."'],
  [14, 'Chad: "After Uncle Thad, we just kept counting. Upwards."'],
  [15, 'Coach Gonad saw the album. He dropped his whistle.'],
  [16, 'Album, page two: a tiny baby in a Thundertail bib.'],
  [17, 'Chad: "Uncle Thad had one baby. Nobody knows where it went."'],
  [18, 'Coach polishes his old number. "Tomorrow," he says.'],
];
// Gen 19: the reveal of the Thundertail win. Family logic: Uncle Thad won one real race, before any Kevin swam.
// The baby from that win grew up to be the very first Dad (the one who still beatboxes, generation 1 of the album).
// So every Kevin since is part Thundertail. The UI makes the LAST line the tap line: it stays Chad's.
export const ACT2_FINALE = [
  'Generation 19. Coach Gonad finally tells the whole story.',
  '"Long ago, before any Kevin, Uncle Thad won one real race."',
  '"That race made one baby. One tiny Thundertail."',
  '"That baby grew up to be the very first Dad."',
  '"The one who still beatboxes. Every Kevin came from him."',
  'Chad: "So Uncle Thad is... Great-great-lots-Grandad Thad?"',
  'Coach: "Nobody in your family ever did the maths."',
  'Chad: "So every Kevin win is a Thundertail win. TOLD you."',
];
// Family memories per zone. {who} is an earlier family swimmer, {heir} the grown-up parent now.
export const FAMILY_ZONE_LINES = {
  launch: [
    '{who} started back here too. {heir} kept the race number.',
    '{heir} says {who} waved at the crowd here. Classic family.',
    'This is where {who} first wiggled. {heir} has a photo.',
  ],
  acid: [
    '{who} swam this lagoon. {heir} still smells lemons.',
    '{heir} says {who} went around the green. Every time.',
    '{who} found a blue bubble here. {heir} framed the story.',
  ],
  goo: [
    "{who} found the gap here. {heir} says luck. It wasn't.",
    '{heir} still has goo from when {who} came through.',
    '{who} bonked this wall once. {heir} calls it tradition.',
  ],
  sea: [
    '{who} dodged a Macro here. {heir} tells it every dinner.',
    '{heir} says {who} drafted Brock across this whole sea.',
    '{who} made it halfway here. {heir} says the rest is yours.',
  ],
  fork: [
    '{who} picked the sparkly tube. {heir} is still proud.',
    '{heir} says {who} followed Tiffany here. Smart family.',
    '{who} took the wrong tube once. {heir} never mentions it.',
  ],
  rapids: [
    '{who} smelled cinnamon here. {heir} bakes it every year.',
    '{heir} says {who} timed every swat here. Copy {who}.',
    '{who} beat the Rapids. {heir} named the cat after it.',
  ],
  egg: [
    '{who} knocked on this egg. {heir} is the answer.',
    '{heir} exists because {who} tapped like this. TAP.',
    '{who} drilled here. {heir} says you have the same thumbs.',
  ],
};
// A baby's first words, by its top mutation id (2 each).
export const FIRST_WORDS_BY_MUT = {
  turbo:   ['"Vroom!"', '"Faster!"'],
  tank:    ['"Second lunch!"', '"Snack?"'],
  helmet:  ['"Bonk!"', '"Hat!"'],
  draft:   ['"Follow!"', '"Behind you!"'],
  magnet:  ['"Mine!"', '"Come here, snack!"'],
  sweet:   ['"Strawberry!"', '"More fruit!"'],
  antacid: ['"Lemon!"', '"Fizzy!"'],
  eco:     ['"Nap?"', '"Five more minutes!"'],
  memory:  ['"I remember you!"', '"Again! Same again!"'],
  whip:    ['"Crack!"', '"Quick!"'],
  ram:     ['"Scooch!"', '"Boop!"'],
  rush:    ['"Next!"', '"Coming through!"'],
  hype:    ['"WOOO!"', '"LOUDER!"'],
  goo:     ['"Slime!"', '"Wheee!"'],
  wingman: ['"Buddy!"', '"High five!"'],
  nose:    ['"Sniff sniff!"', '"Toast?"'],
  bloom:   ['"Later!"', '"Wait for it..."'],
  spiky:   ['"Pointy!"', '"No hugs!"'],
  nitro:   ['"KABOOM!"', '"Fire!"'],
  second:  ['"Again!"', '"Not done!"'],
  mosh:    ['"Rock!"', '"Mosh!"'],
  slick:   ['"Whoosh!"', '"Missed me!"'],
  lucky:   ['"Coin!"', '"Found it!"'],
  echo:    ['"Echo! Echo!"', '"Again! Again!"'],
  chain:   ['"Bang bang!"', '"More bangs!"'],
};
// First race of a new generation: the rival's new heir, for the coach strip (48 characters or fewer).
// Keyed by RIVALS first name. {name} is the heir's full name with its suffix (Brock Jr., Brock III).
export const RIVAL_HEIR_LINES = {
  Steve:   ['A new Steve. Already sorry about it.', '{name} is here. He apologised to the start line.'],
  Brock:   ['A new Brock. Same biceps. Worse poems.', '{name} brought a shake. It is called Gerald II.'],
  Tiffany: ['A new Tiffany. The book has a new edition.', '{name} read the reviews. All of them. Ouch.'],
  Gunther: ['A new Gunther. Dieter is still filming.', '{name} wants a ramp. And a red carpet.'],
  Chad:    ['A new Thundertail. Claims "loads" of wins.', '{name} says the family count is "huge".'],
};

// ================================================================ onboarding extras
// Shown the first time DNA is explained (first DNA blob or first result screen).
export const TUT_DNA_EXPLAIN = 'DNA buys Dad better habits. Better Dad, faster Kevin!';
// A touch player tapped instead of dragging to steer.
export const TAP_STEER_HINT = 'Drag, do not tap! Slide your thumb left and right.';

// ================================================================ signature tricks (systems emits them by id)
// name: 16 characters or fewer (the pop). hint: 40 characters or fewer, the recipe in plain words.
// Recipes (core TRICKS order is the truth): tailgate weave, draft, rival; matador close, dodge, weave;
// pinball gate, bump, weave; grudge rival, bump, close; snack sugar, dna, close; popcorn pop, weave, close;
// domino bump, pop, rival; needle gate, weave, pop; encore cash, pop, weave; rebound cash, slingshot, rival.
// Hints name each kind ONLY with these phrases, in recipe order (a core test scans for them): weave = 'weave',
// draft = 'draft', rival = 'big name' or 'pass a rival', gate = 'gate', bump = 'bump', close = 'near miss' or
// 'shave', dodge = 'dodge', sugar = 'fruit', dna = 'DNA', pop = 'pop', cash = 'cash', slingshot = 'slingshot',
// snipe = 'snipe'. Never use those words for anything else inside a hint.
// A slingshot also counts as a weave step, so a weave may read 'weave or sling' ('sling' alone is not the slingshot phrase).
export const TRICK_TEXT = {
  tailgate: { name: 'TAILGATE TANGO', hint: 'Weave or sling, draft, pass a big name.' },
  matador:  { name: 'MATADOR WIGGLE', hint: 'Shave danger, dodge, weave or sling.' },
  pinball:  { name: 'PINBALL WIZARD', hint: 'Thread a gate, bump, weave or sling.' },
  grudge:   { name: 'GRUDGE MATCH', hint: 'Pass a big name, bump, then a near miss.' },
  snack:    { name: 'SNACK ATTACK', hint: 'Eat fruit, grab DNA, then a near miss.' },
  popcorn:  { name: 'POPCORN PARTY', hint: 'Pop a Macro, weave or sling, near miss.' },
  domino:   { name: 'DOMINO DISCO', hint: 'Bump, pop a Macro, then pass a big name.' },
  needle:   { name: 'NEEDLE NOSE', hint: 'Thread a gate, weave, then pop a Macro.' },
  encore:   { name: 'ENCORE!', hint: 'Cash in, pop a Macro, weave or sling.' },
  rebound:  { name: 'BOUNCE BACK', hint: 'Cash in, slingshot out, pass a big name.' },
};
// Pop when a signature trick lands for the first time (16 characters or fewer).
export const TRICK_NEW_LINES = ['NEW MOVE!', 'COACH FAINTED!', 'SIGNATURE MOVE!', 'COACH SAW THAT!', 'TEXTBOOK!', 'INVENTED IT!'];

// ================================================================ remixed hazards (systems emits 'hzNew' {id})
// One Coach Gonad line each, 48 characters or fewer.
export const HZ_REMIX_INTRO = {
  slide: 'The goo gates wobble now. Chase the gap.',
  twins: 'Big Macros come in pairs now. Thread them.',
  pulse: 'The acid learned to dance. Time your gaps.',
  pair:  'Hairs on both walls now. No hiding, Kevin.',
  lunge: 'Big Macros crouch, then pounce. Sidestep late!',
  close: 'The goo gaps breathe now. Time your squeeze.',
};

// ================================================================ round text: secret, swim 1, HUD, egg duel, tricks, result
// Baby Album with no babies, once Act 2 has been told (generation 19 and up): replaces 'Chad has never won'.
export const ALBUM_EMPTY_AFTER_ACT2 = 'No babies yet. The Thundertails have one real win: Uncle Thad. Ask Coach.';
// Coach strip on swim 1, when the named rivals start slow (44 characters or fewer).
export const RIVALS_TIRED = 'The big names partied last night. Pounce!';
// First time the combo counter shows (32 characters or fewer).
export const COMBO_INTRO = 'Swim THROUGH the crowd!';
// The small line under COMBO_INTRO (44 characters or fewer). DNA is hidden on swim 1, so it never says DNA.
export const COMBO_INTRO_SUB = 'Pass, pass, pass! Watch the number go BRRR.';
// Label on a combo ring to swim through.
export const COMBO_RING_LABEL = 'go through!';
// Dashing with the GAS tank low (30 characters or fewer each).
export const DASH_LOW_GAS = ['Easy on the DASH! Eat fruit.', 'Tank says no. Fruit says yes.', 'DASH runs on GAS. Snack!', 'Zoom less, munch more.'];
// Result tip when dashing drained the tank. {n} dashes, {g} GAS burned.
export const DASH_COST_TIP = 'You dashed {n} times and burned {g} GAS. Snack between zooms!';
// Short names of the two combo meters.
export const COMBO_LABELS = { speed: 'ZOOM', cash: 'CASH' };
// The first time a bonk smashes an unbanked pot.
export const BREAK_POT_FIRST = 'POT SMASHED! Cash in sooner next time.';
// After a few cash-ins by button: the swipe shortcut.
export const CASH_SWIPE_TIP = 'Pro move: swipe DOWN to cash, no button needed.';
// Egg duel: which side to tap to block a rival's move.
export const EGG_TELL_SIDE = { left: '<< TAP LEFT!', right: 'TAP RIGHT! >>' };
// Signature tricks landed back to back (16 characters or fewer). 4 means 4 or more.
export const TRICK_STREAK_LINES = {
  2: ['DOUBLE TRICK!', 'TWO FOR TWO!', 'BACK TO BACK!'],
  3: ['TRICK TRIPLE!', 'HAT TRICK!', 'COACH SAT DOWN'],
  4: ['COACH LIES DOWN', 'DIETER GOT IT!', 'TRICK MACHINE!', 'CALL THE NEWS!'],
};
// Retry button when a named rival beat you by a little (18 characters or fewer once filled).
// {name} the rival's first name, {sec} seconds behind (one decimal).
export const REMATCH_CLOSE_FOE = [
  'GET {name}! {sec} S',
  '{name} IS NERVOUS',
  'CATCH {name}',
  'ONE WIGGLE. GO.',
  '{sec} S. GO GET IT',
  'PASS {name} NOW',
  '{name} BLINKED',
  'REMATCH {name}',
];

// ================================================================ round text: frenzy, bounties, grandads, odds and ends
// First FRENZY of a save: the card that explains it (t big, s small).
export const FIRST_FRENZY_CARD = { t: 'Ten passes in a row!', s: 'Keep passing to keep FRENZY!' };
// What each FRENZY tier adds, indexed by tier 0 to 4 (C.FRENZY_TIERS order). 18 characters or fewer.
export const FRENZY_TIER_SHORT = ['FASTER!', 'MEGA MAGNET', 'COMBOS LAST LONGER', 'ACID-PROOF', 'UNTOUCHABLE 2x DNA'];
// A bounty was paid out (34 characters or fewer).
export const BOUNTY_DONE_LINES = [
  'Paid in full. Coach is shook.',
  'Bounty bagged. Doug did a jig.',
  'Job done. The poster wept.',
  'Collected! Tiffany took notes.',
  'Bounty paid. Brock wants a rerun.',
  'Done and dusted. Steve clapped.',
  'Cashed it. Chad claims an assist.',
  'Bounty cleared. Gerald approves.',
];
// A run ended by a game error, never the player's fault.
export const CRASH_LINE = 'The tube hiccupped. Kevin keeps the DNA.';
// Caption on the first visit to Dad's shop.
export const FIRST_SHOP_CAPTION = "Tap Dad's pick. It lasts forever.";
// iPhone toast when sound looks muted by the ring/silent switch.
export const SILENT_SWITCH_HINT = 'Sound off? Flip the silent switch to meet the beatbox crew';
// Lost close to the personal best. {n} is how many places short of it.
export const RECORD_NEAR_LINES = [
  '{n} places. Steve could carry you that far.',
  '{n} places off your best. One combo, Kevin.',
  'Your best is {n} places away. Coach can see it.',
  '{n} places short. The fridge is keeping a space.',
];
// Habit levels past max (the generations' Grandad levels). Read q[(level - max) % q.length] or similar.
export const GRANDAD_QUIPS = {
  broccoli: [
    'Grandad grows broccoli on the allotment. Award winning.',
    'Grandad calls broccoli "the green rocket".',
    'Grandad knits tiny jumpers for the broccoli. Winter.',
    'Grandad has a broccoli tattoo. Small. Tasteful.',
    'The grandkids said "floret" before "Mama".',
    'Grandad is writing a broccoli memoir. Chapter 40.',
    'Grandad entered the village show. The judges bowed.',
  ],
  water: [
    'Grandad drinks from a jug. A big one.',
    'Grandad rates tap water by town. Out of ten.',
    'Grandad has a water bottle older than Dad.',
    'Grandad says "hydrate" at every family dinner.',
    'Grandad built a garden fountain. It is for him.',
    'Grandad still visits the bathroom a LOT. Proudly.',
  ],
  berries: [
    'Grandad grows blueberries the size of marbles.',
    'Grandad makes jam. Every jar says "Kevin".',
    'Grandad hides berries in every coat pocket.',
    'Grandad and the blackbirds signed a berry treaty.',
    'Grandad won the jam contest again. Rivals fume.',
    'Grandad has purple teeth now. Worth it.',
  ],
  walk: [
    'Grandad walks to the shops. In the next town.',
    'Grandad has a walking stick. It never touches down.',
    'Grandad does 400 laps of the garden a day.',
    'Grandad overtook a jogger. The jogger is sulking.',
    'Grandad\'s step counter asked for a day off.',
    'Grandad climbed a hill and named it after Kevin.',
  ],
  beatbox: [
    'Grandad beatboxes through his false teeth. Extra clicks.',
    'Grandad taught the parrot to drop a beat.',
    'Grandad beatboxed at a wedding. The vicar joined in.',
    'Grandad has a weekly slot at the bingo hall.',
    'Grandad and Dad do beatbox duets. Mum leaves.',
    'Grandad\'s beatbox name is MC Slippers.',
  ],
};

// ================================================================ first swim and result extras (UI wires these)
// Shown in the GO! slot on swim 1.
export const FIRST_GO_LINE = 'Wiggle! Kevin, WIGGLE!';
// A warm second beat on the first result card.
export const FIRST_DEATH_TAIL = 'Dad is already in the healthy aisle.';
// Retry button when you ran out within a few centimetres of the egg. {cm} is filled with a value like 0.05.
// 18 characters or fewer once filled. Never the word 'again' (rematchLabel filters it on swim 1).
export const REMATCH_NEAR_CM = ['{cm} CM. GO GET IT', '{cm} CM. ONE NOSE', 'INCH IT: {cm} CM', '{cm} CM. WIGGLE!'];
// Retry button promise by what ended the run: 2 forward-looking lines each, 16 characters or fewer, never 'again'.
export const REMATCH_PROMISE = {
  energy: ['FRUIT THIS TIME', 'SNACK, THEN ZOOM'],
  acid:   ['GO AROUND GREEN', 'BLUE IS FRIENDLY'],
  wbc:    ['HIDE, THEN GO', 'RIVALS = SHIELDS'],
  bonk:   ['GAP FIRST', 'LINE UP EARLY'],
  wrong:  ['FOLLOW SPARKLES', 'PINK TUBE, KEVIN'],
  late:   ['TAP LIKE MAD', 'BOTH THUMBS, GO'],
  lateRoute: ['DASH STRAIGHTS', 'GET THERE FIRST'],
  crash:  ['FRESH TUBE, GO', 'TUBE IS FIXED'],
};
// Win banner by winning margin over the runner-up. hair: under 0.5 s, tail: under 1.5 s, clear: more.
// {name} the runner-up's first name, {s} the margin in seconds. 30 characters or fewer once filled.
export const WIN_MARGIN_LINES = {
  hair:  ['BY A NOSE HAIR, {name}!', '{s} S! {name} FELT THAT', '{name} FELT THE BREEZE'],
  tail:  ['{s} S CLEAR OF {name}', 'TAIL WAVE FOR {name}', '{name} SAW YOUR TAIL'],
  clear: ['{name} IS STILL KNOCKING', '{s} S AHEAD. BYE, {name}', '{name} SENT A POSTCARD'],
};

// ================================================================ round text: rematch, rivals, egg duel, daily, Dad's perks
// Retry button when Kevin lost the egg by a nose (22 characters or fewer, never the word 'again').
export const REMATCH_NOSE = ['NOSE ON IT. ONE MORE!', 'A NOSE SHORT. GO!', 'ONE NOSE. REMATCH!', 'SHARPEN THAT NOSE!'];
// A named rival lost the egg to ANOTHER rival. Keyed by RIVALS first name (the sore loser), 3 lines each,
// {thief} is the winner's first name. 40 characters or fewer once filled.
export const RIVAL_SORE = {
  Steve:   ['Steve: "Well done, {thief}! I am fine!"', 'Steve: "Sorry, egg. {thief} was quick."', 'Steve: "{thief} won! Hug? No? Okay."'],
  Brock:   ['Brock: "{thief}? Brock was robbed, bro."', 'Brock: "A poem for {thief}: BOO."', 'Brock: "{thief} skipped leg day. Won?"'],
  Tiffany: ['Tiffany: "{thief}? NOT modelled."', 'Tiffany: "Adding {thief} to the errata."', 'Tiffany: "{thief}. One star. Overrated."'],
  Gunther: ['Gunther: "{thief} stole my final scene!"', 'Gunther: "{thief}? Cut! We reshoot!"', 'Gunther: "{thief}? A villain arc!"'],
  Chad:    ['Chad: "{thief} won? Chad counts it."', 'Chad: "Chad coached {thief}. Win 1001."', 'Chad: "{thief} got lucky. I got hair."'],
};
// Why the egg duel was lost, one card line (48 characters or fewer once filled). {sec} seconds behind, {name} the rival.
// tank: ran low on GAS while drilling. tier: {name}'s drill out-classed Kevin's. boss: {name}'s signature move did it.
// taps: not enough tapping.
export const DUEL_POSTMORTEM = {
  tank: ['Drilled on fumes. {sec} s short. Snack first!', 'Empty tank at the door. {name} had lunch.', 'GAS ran out mid-knock. Fruit before the egg!'],
  tier: ['{name} drills like a pro. Dad\'s habits help.', '{name} out-drilled you by {sec} s. Train up!', 'A bigger drill wins. Feed Dad broccoli.'],
  boss: ['{name}\'s big move cost you {sec} s. Block it!', 'Tap the side {name} wobbles to. Counter it!', '{name} pulled the move. You pulled a face.'],
  taps: ['{sec} s short. Tap faster. Both thumbs!', 'Your thumbs napped. {name} did not.', 'Tap like the egg owes you {sec} s.'],
  // a lost duel that brought less head start than the best one ever ({best} and {now} in seconds)
  best: 'Your best run brought {best}s. This one brought {now}s.',
};
// Pop when Kevin arrives at the egg with style and drills off to a bonus start (16 characters or fewer).
export const HEAD_BONUS_LINES = ['STYLE ENTRY!', 'GRAND ENTRANCE!', 'NOSE FIRST!', 'BIG ARRIVAL!'];
// Daily swim, after the first try of the day: the repeat laps pay less (44 characters or fewer).
export const DAILY_ATTEMPT_LINES = [
  'Practice laps pay less. The tube remembers.',
  'Encore laps pay less. Coach still claps.',
  'First swim counted. This one is for fun.',
  'Lap for glory. The DNA is on a diet today.',
];
// Dad's habit perks, keyed by the perk id (systems owns the ids and numbers). name 18 characters or fewer,
// desc one line in the shop's voice, pops 3 lines of 22 characters or fewer.
export const HABIT_PERK_TEXT = {
  greenMachine: { name: 'Green Machine', desc: 'First DASH of every zone burns no GAS.', pops: ['GREEN MACHINE!', 'FREE ZOOM!', 'BROCCOLI POWER!'] },
  rivalLink:    { name: 'Rival Link', desc: 'Passing a big name adds +1 extra combo.', pops: ['RIVAL LINK!', 'NAME DROP!', 'CHAIN THE CHAMP!'] },
  overflow:     { name: 'Overflow', desc: 'Fruit at a full tank keeps your combo alive longer.', pops: ['OVERFLOW!', 'TANK SPILLS OVER!', 'WASTE NOT!'] },
  softLanding:  { name: 'Soft Landing', desc: 'The first acid burn of each zone costs half the GAS.', pops: ['SOFT LANDING!', 'CUSHIONED!', 'BOING!'] },
  tuckIn:       { name: 'Tuck In', desc: 'Start behind a rival, slingshot loaded. Not in the daily.', pops: ['TUCKED IN!', 'COMFY SEAT!', 'FREE RIDE!'] },
  berryBonus:   { name: 'Berry Bonus', desc: 'Fruit at a full tank pays +1 DNA. Waste not!', pops: ['BERRY BONUS!', 'JUICY!', 'DAD\'S BERRIES!'] },
  slingLink:    { name: 'Sling Link', desc: 'A slingshot out of a draft adds +1 extra combo.', pops: ['SLING LINK!', 'SLINGSHOT!', 'YEET!'] },
  frenzyPlus:   { name: 'Frenzy Plus', desc: 'Every FRENZY lasts 1 second longer. Party on.', pops: ['FRENZY PLUS!', 'PARTY ON!', 'MORE NOISE!'] },
};
// The Fork: a sniff of each tube, from Egg Nose or a hint (28 characters or fewer).
export const FORK_SMELL = {
  right: ['Sniff... cinnamon! EGG!', 'Smells warm. Smells eggy.', 'This way smells like home.'],
  wrong: ['Sniff... old socks. Nope.', 'Smells of empty hallway.', 'Sniff... echoes. No egg.'],
};

// ================================================================ writer round: swim 1, the egg's voice, tricks, new hooks
// Title subtitle on the very first launch (instead of the usual tagline). HTML: the UI sets it with innerHTML.
export const TITLE_FIRST = 'Every person alive won this race once.<br>Your turn.';
// Small line under the shop title.
export const SHOP_SUB = 'Healthy dad, faster swimmers. Science, basically.';
// Heading over the very first mutation draft.
export const FIRST_DRAFT_HEAD = 'Tap one. Evolution, but fast.';

// THE EGG speaks: a warm, polite, slightly overwhelmed host (never flirty). 36 characters or fewer with {name}
// filled by a 7-letter rival first name (Tiffany, Gunther). {name} is the rival's first name. Every line starts with 'Egg: '.
// arrive: Kevin reaches the egg zone. kevinKnocks / rivalKnocks: drilling starts. kevinLeads / rivalLeads: who is
// ahead on the drill. kevinIn / rivalIn: who got in.
export const EGG_VOICE = {
  arrive:      ['Egg: "Oh! Visitors! I did not tidy."', 'Egg: "Hello! Is it Tuesday already?"', 'Egg: "One at a time, please! Oh no."', 'Egg: "Welcome! Mind the jelly coat."'],
  kevinKnocks: ['Egg: "Who is it? Oh! A Kevin!"', 'Egg: "Coming! Just finding my keys."', 'Egg: "Ooh, that tickles! Go on!"', 'Egg: "A knock! My very first one!"'],
  rivalKnocks: ['Egg: "{name}, I can see you!"', 'Egg: "Oh! {name}! Got a booking?"', 'Egg: "Gently, {name}! I am new."', 'Egg: "{name}, please stop shoving."'],
  kevinLeads:  ['Egg: "Kevin is first in the queue!"', 'Egg: "Lovely, Kevin! Nearly there!"', 'Egg: "Kevin, I saved you a cushion."'],
  rivalLeads:  ['Egg: "Kevin! {name} is nearly in!"', 'Egg: "{name} is knocking louder!"', 'Egg: "{name}, wait your turn!"'],
  kevinIn:     ['Egg: "Come in! Wipe your tail."', 'Egg: "Welcome home, little one."', 'Egg: "In you pop! The kettle is on."', 'Egg: "Make yourself at home!"'],
  rivalIn:     ['Egg: "Sorry Kevin. {name} booked."', 'Egg: "{name} got in. Sorry, Kevin!"', 'Egg: "Next time, Kevin. I mean it."', 'Egg: "Door shut. Lovely try, Kevin!"'],
};

// Coach announces the featured trick of the day (double DNA). {name} is the trick's TRICK_TEXT name.
// 44 characters or fewer with the longest trick name (14 characters).
export const FEATURED_TRICK_LINES = [
  'Coach wants a {name} today. 2x DNA!',
  'Trick of the day: {name}. 2x DNA!',
  'Land a {name} today. Double DNA!',
  'Dad bet on a {name} today. 2x DNA.',
];
// The trick book (every signature trick, landed or not). title 16 characters or fewer; {n} times landed.
export const TRICK_BOOK_TEXT = {
  title: 'TRICK BOOK',
  lockedName: '???',
  timesLabel: 'landed {n}x',
  empty: 'No tricks yet. Chain three moves and Coach writes it down.',
};
// Combo words with variety: same thresholds as COMBO_WORDS, 3 variants each, 18 characters or fewer.
export const COMBO_WORDS_POOL = {
  3: ['SCOOCH', 'PARDON ME', 'EXCUSE ME'],
  6: ['QUEUE JUMPER', 'LINE CUTTER', 'RUDE BUT FAST'],
  10: ['COACH IS SCREAMING', 'WHISTLE BROKE', 'COACH LOST A SHOE'],
  15: ['TAIL ON FIRE', 'SPICY TAIL', 'HOT HOT HOT'],
  20: ['BROCK IS SHAKING', 'STEVE IS CLAPPING', 'TIFFANY TOOK NOTES'],
  30: ['MENACE', 'TUBE MENACE', 'PUBLIC NUISANCE'],
  45: ['COACH TRIED TO CRY', 'COACH IS WEEPING', 'COACH NEEDS A HUG'],
  60: ['CELL POWERHOUSE', 'MITOCHONDRIA MODE', 'TEXTBOOK DIAGRAM'],
  100: ['ABSOLUTE UNIT', 'TINY LEGEND', 'ONE IN A MILLION'],
};

// A swim abandoned mid-tube reset the streak (toast, 60 characters or fewer).
export const ABANDONED_LINES = [
  'Left mid-tube. Your streak swam home without you.',
  'Walked out mid-swim. Streak reset. Coach is sulking.',
  'Bailed in the tube. The streak left in a huff.',
];
// What one habit would have done for the swim you just lost. 48 characters or fewer once filled.
// {need} how far short, {gain} what the habit adds, {unit} the unit of both, {habit} the habit's name.
// enough: the habit alone would have covered it. short: it helps, but would not have covered it alone.
export const WOULD_HAVE_LINES = {
  enough: ['You were {need} {unit} short. This is +{gain}.', 'Missed by {need} {unit}. {habit}: +{gain}.', 'Short {need} {unit}. Dad has a fix: +{gain}.'],
  short:  ['{need} {unit} short. This is a start: +{gain}.', 'Every bit counts: +{gain} {unit} of {need}.', '{habit}: +{gain}. Stack a few, Dad.'],
};
// Tiny pop when a goo gap breathes open around Kevin (8 characters or fewer).
export const PHEW_LINES = ['phew', 'close!', 'nope!', 'dodged'];

// ================================================================ writer round: first result, streak freeze, Kevin learns
// A warm second beat on the first result card, by the habit Dad's shop picks (40 characters or fewer).
// FIRST_DEATH_TAIL is the fallback when the pick has no line here.
export const FIRST_DEATH_TAIL_BY_PICK = {
  water:    'Dad is already filling a water bottle.',
  broccoli: 'Dad is already steaming the broccoli.',
  berries:  'Dad is already halfway up a bramble.',
  jeans:    'Dad is already donating the tight jeans.',
  walk:     'Dad is already lacing his walking shoes.',
  beatbox:  'Dad is already going boots and cats.',
  sleep:    'Dad is already in bed. It is 7 pm.',
  hottub:   'Dad is already selling the hot tub.',
  meditate: 'Dad is already humming on a yoga mat.',
  factory:  'Dad is already hiring a factory cat.',
};
// Result screen: what the next zone holds, keyed by the id of the zone you have NOT reached yet (44 characters or fewer).
export const NEXT_ZONE_TEASE = {
  launch: 'Next: the Launch Tube. Dead last. Go!',
  acid:   'Next: the Acid Lagoon. Green puddles bite!',
  goo:    'Next: the Gate of Goo. Bring a sense of gap.',
  sea:    'Next: the Womb Sea. The Macros are peckish.',
  fork:   'Next: the Fork. Only one tube has the egg.',
  rapids: 'Next: Tube Rapids. Tiny hairs, big swats.',
  egg:    'Next: THE EGG. Warm up both thumbs.',
};
// After a few dashes by button: the flick shortcut.
export const FLICK_TIP = 'Pro move: flick your thumb UP to dash.';
// A streak freeze covered a missed day (toast, 44 characters or fewer).
export const FREEZE_LINES = [
  'Coach Gonad kept your streak on ice.',
  "Missed a day. Dad's sick note covered it.",
  'Streak frozen fresh. Like peas. Good peas.',
  'Coach signed the note. Streak still alive.',
];
// The streak freeze in Dad's shop.
export const FREEZE_SHOP = { name: "Dad's Sick Note", desc: 'Miss a day, keep your streak. Dad signs it.' };
// A swim cut off by the phone (app backgrounded or killed) that did NOT cost the streak (60 characters or fewer).
export const ABANDON_FORGIVEN_LINE = 'Your phone napped mid-swim. Streak kept.';
// Eaten by a lunging Big Macro (the crouch-then-pounce kind). 48 characters or fewer.
export const DEATH_LUNGE = [
  'Saw the crouch. Stood still. Got pounced.',
  'Pounced on like a sock by a kitten.',
  'The Macro did a big jump. Kevin did a small eep.',
  'It crouched. Kevin waited politely. Wrong call.',
];
// The very first death to a remixed hazard (48 characters or fewer). Same voice as FIRST_DEATH.
export const FIRST_DEATH_EXTRA = {
  lunge: 'Crouch = pounce. Sidestep when it snaps.',
  twins: 'Twin Macros: thread the gap, or dash pop one.',
};
// The next Kevin learned from the last death, by cause ('eggGas' = out of GAS at the egg). {n} is his number.
// 45 characters or fewer before filling.
export const KEVIN_NEXT_BY_CAUSE = {
  energy: [
    'Kevin #{n} packed three bananas. In case.',
    'Kevin #{n} wears a snack belt. Fully loaded.',
    'Kevin #{n} only DASHES when fruit is in view.',
    'Kevin #{n} ate a fruit salad. A big one.',
  ],
  acid: [
    'Kevin #{n} wears goggles. Lemon-proof ones.',
    'Kevin #{n} knows his colours. Green is rude.',
    'Kevin #{n} drew a map of every puddle.',
    'Kevin #{n} keeps a blue bubble in his pocket.',
  ],
  wbc: [
    'Kevin #{n} practised his sidestep all night.',
    'Kevin #{n} befriended Steve. Steve is wide.',
    'Kevin #{n} brought a decoy sandwich for Doug.',
    'Kevin #{n} swims near rivals now. Decoys.',
  ],
  bonk: [
    'Kevin #{n} studied the gaps. With a ruler.',
    'Kevin #{n} wears a helmet to bed now.',
    'Kevin #{n} threads needles for a hobby.',
    'Kevin #{n} lines up early. Brought a chair.',
  ],
  wrong: [
    'Kevin #{n} bought sparkle-tinted glasses.',
    'Kevin #{n} wrote PINK = EGG on his tail.',
    'Kevin #{n} will not follow Chad. Ever.',
    'Kevin #{n} can smell cinnamon a mile off.',
  ],
  late: [
    'Kevin #{n} did thumb push-ups. Hundreds.',
    'Kevin #{n} warmed up both thumbs. Twice.',
    'Kevin #{n} practised knocking. Very fast.',
    'Kevin #{n} tapped the table all night.',
  ],
  lateRoute: [
    'Kevin #{n} set an alarm. Three alarms.',
    'Kevin #{n} skips the scenic route. Always.',
    'Kevin #{n} DASHES on the straights now.',
    'Kevin #{n} is leaving early. Like, now.',
  ],
  eggGas: [
    'Kevin #{n} saved a strawberry for the egg.',
    'Kevin #{n} packed a snack for the doorstep.',
    'Kevin #{n} fills up before the egg. Promise.',
    'Kevin #{n} kept a grape for the last stretch.',
  ],
};
