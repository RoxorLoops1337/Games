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
    coach: 'Coach Gonad: "pH 4, people! Taped puddles melt you. pH bubbles are antacid. Do NOT lick anything. I mean it."' },
  { id: 'goo', name: 'The Gate of Goo', len: 12000, hw: 150, wob: 30, q: 0.3, keep: 0.2,
    col: ['#2f2a24', '#857a66'], wall: '#fff3dc', beat: 110,
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
  turbo:   { name: 'Turbo Tail',       icon: '🌀', r: 1, max: 3, speed: 0.12, desc: '+12% swim speed.' },
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
  // double-edged rare cards: a big upside with a catch (a mashup in core.js SYNERGIES cancels each catch)
  glassCannon: { name: 'Glass Cannon',  icon: '🔫', r: 2, max: 1, desc: '+25% swim speed. You cannot hold a shield this run.' },
  sugarCrash:  { name: 'Sugar Crash',   icon: '🍬', r: 2, max: 1, desc: 'Fruit sugar gives double GAS, but GAS drains 20% faster.' },
  allIn:       { name: 'All In',        icon: '🃏', r: 2, max: 1, desc: 'Every combo link counts +1, but a dropped combo costs 10 GAS.' },
  hotHead:     { name: 'Hot Head',      icon: '🌶️', r: 2, max: 1, desc: 'FRENZY needs 5 fewer combo, but lasts 30% shorter.' },
};
export const MUT_ORDER = Object.keys(MUTATIONS);

// Dad's Habits: the permanent (rogue-lite) upgrades, bought with DNA between runs.
// Healthy dad, healthy swimmers.
export const HABITS = {
  broccoli: { name: 'Dad eats broccoli',     icon: '🥦', max: 10, base: 117, grow: 1.3, desc: '+3.5% swim speed' },
  water:    { name: 'Dad drinks water',      icon: '💧', max: 10, base: 101, grow: 1.3, desc: '+6 max GAS' },
  sleep:    { name: 'Dad sleeps 8 hours',    icon: '😴', max: 5,  base: 230, grow: 1.5, desc: '-5% GAS drain' },
  jeans:    { name: 'Dad ditches tight jeans', icon: '👖', max: 8, base: 132, grow: 1.35, desc: 'Start further up the field. Skip thousands.' },
  berries:  { name: 'Dad eats berries',      icon: '🫐', max: 8,  base: 108, grow: 1.35, desc: '+6% GAS from fruit sugar' },
  walk:     { name: 'Dad walks every day',   icon: '🚶', max: 6,  base: 188, grow: 1.45, desc: '+8% drafting power' },
  beatbox:  { name: 'Dad beatboxes',         icon: '🎤', max: 6,  base: 172, grow: 1.45, desc: 'Combos last +0.25s longer' },
  hottub:   { name: 'No more hot tubs',      icon: '🛁', max: 2,  base: 200, grow: 3, desc: 'Start every run with +1 shield' },
  meditate: { name: 'Dad meditates',         icon: '🧘', max: 3,  base: 200, grow: 2.0,  desc: '+1 reroll of mutation cards per run' },
  factory:  { name: 'Bigger factory',        icon: '🏭', max: 10, base: 140, grow: 1.3, desc: "Earn more DNA while you're away" },
  gps:      { name: "Dad's sat-nav",         icon: '🛰️', max: 1,  base: 1200, grow: 1,  desc: 'Unlock AUTOPILOT (it swims for you, a bit badly)' },
};
export const HABIT_ORDER = Object.keys(HABITS);
// HABIT PERKS: a habit line bought up to level 'at' also unlocks a perk (core.js habitPerksAt, Race.perks; the race emits
// habitPerk {id, perk, x, y} the first time each one fires in a run). Ids and numbers only: the words are HABIT_PERK_TEXT.
export const HABIT_PERKS = [
  { id: 'broccoli', at: 5, perk: 'greenMachine' },
  { id: 'broccoli', at: 10, perk: 'rivalLink' },
  { id: 'water', at: 5, perk: 'overflow' },
  { id: 'sleep', at: 3, perk: 'softLanding' },
  { id: 'jeans', at: 4, perk: 'tuckIn' },
  { id: 'berries', at: 4, perk: 'berryBonus' },
  { id: 'walk', at: 3, perk: 'slingLink' },
  { id: 'beatbox', at: 3, perk: 'frenzyPlus' },
];
// Grandad levels (past max, they come with the generations): grandad level k (1, 2, ...) costs the last normal price x
// GRANDAD_PRICE x (1 + GRANDAD_STEP k), a straight line (it was 8% a level, compounding: the late lines priced themselves
// out of a career). (1.05: a grandad level never undercuts the normal levels still left on the line)
export const GRANDAD_PRICE = 1.05, GRANDAD_STEP = 0.035;
export const habitCost = (id, lv) => {
  const H = HABITS[id];
  if (lv < H.max) return Math.round(H.base * Math.pow(H.grow, lv));
  return Math.round(habitCost(id, H.max - 1) * GRANDAD_PRICE * (1 + GRANDAD_STEP * (lv - H.max + 1)));
};

// Named rivals: the real race. sp is speed relative to the field, smart is the chance they pick the right tube.
// move: the signature move each one pulls at the egg (core.js stepDrill emits rivalMove {k, move, phase}).
// drill: drilling speed at the egg, tuned with the move (Chad drills fastest because his hair check is a gift).
export const RIVALS = [
  { name: 'Steve', move: 'sorry', sp: 0.96, smart: 0.6, drill: 1.1, col: '#9ad0ff', line: 'Steve is just happy to be here. Steve waved at a wall earlier.' },
  { name: 'Brock', move: 'maxRep', sp: 1.08, smart: 0.65, drill: 1.22, col: '#ffb36b', line: 'Brock lifts. Brock writes poems about lifting. Brock is 60% Gerald, his protein shake.' },
  { name: 'Tiffany', move: 'byTheBook', sp: 1.17, smart: 0.85, drill: 1.05, col: '#ff8be0', line: 'Tiffany has read every book about eggs. With a highlighter.' },
  { name: 'Gunther', move: 'stuntDive', sp: 0.98, smart: 0.7, drill: 1.18, col: '#b6ff5c', line: 'Gunther does his own stunts. His cameraman Dieter does his own crying.' },
  { name: 'Chad Thundertail', move: 'hairCheck', sp: 0.99, smart: 0.45, drill: 1.5, col: '#ffd75c', line: 'Chad claims 1,000 wins. Ask for one name and he fixes his hair.' },
];

export const COMBO_WORDS = [
  [3, 'SCOOCH'], [6, 'QUEUE JUMPER'], [10, 'COACH IS SCREAMING'], [15, 'TAIL ON FIRE'], [20, 'BROCK IS SHAKING'],
  [30, 'MENACE'], [45, 'COACH TRIED TO CRY'], [60, 'POWERHOUSE OF THE CELL'], [100, 'ABSOLUTE UNIT'],
];

export const DEATH_LINES = {
  energy: [
    'Tail clocked off early. No overtime.', 'Tail went on strike. Demands: snacks.',
    'Tail cramp. Kevin is now a very small comma.', 'Skipped the fruit. The strawberries look smug.',
    'Battery at 0%. Steve offered a charger. It was a grape.', 'Lay down for a power nap. All nap, no power.',
    'Wiggled the last wiggle. It was a lovely one.', 'Dad should have had the smoothie. Dad knows.',
    'Tail said "I\'m done" and meant it.', 'Fell asleep mid-swim. Dreamt of strawberries. Woke up hungrier.',
    'Skipped breakfast. The tail filed a complaint.',
  ],
  // Ran dry within sight of the egg (zone 5 and up).
  energyEgg: [
    'Could see the egg. The egg waved. You had no wave left.',
    'Two wiggles from the door. The tail sat down.',
    "The egg was RIGHT THERE. Your tail wasn't.",
    'So close you could read the welcome mat.',
    'Parked on the egg\'s porch. Forgot to knock.',
    'Saw the egg, waved, ran out of wave.',
  ],
  acid: [
    'Fizzed like a dropped soda.',
    'The lagoon did a little burp. That was you.',
    'Kevin is now about 40% lemonade.',
    'The lagoon added a twist of lemon. To Kevin.',
    'Went in a Kevin. Came out a lemon fizz.',
    'The lagoon added Kevin to its cocktail menu.',
    'Melted politely, like a lolly in July.',
    'Tiffany read about this exact puddle. Page 12. With a diagram.',
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
    'Door closed. Shoes still on. Flowers still in your tail.', 'Lost by a tail. In fairness, you are all tails.',
    'Their big move landed. Yours was still stretching.',
    'Touched the egg. The egg moved on.',
    'At the door. The door said "one moment, please".',
    'Drilled with heart. Heart is not a drill.',
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
    'Swam off for a snack. The egg put the kettle on.',
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
  'Pass them ALL. SWIM to #1!',
];

const NAME_A = [
  'Little', 'Baby', 'Tiny', 'Big', 'Sir', 'Lady', 'Captain', 'Professor', 'DJ', 'MC',
  'Doctor', 'Admiral', 'Duchess', 'Lil', 'Chief', 'Grand Duke', 'Turbo', 'Sergeant', 'Auntie', 'Coach',
  'Agent', 'Saint', 'Mega', 'Sweet', 'Major', 'Count', 'Queen', 'Detective', 'Señor', 'Nana',
];
const NAME_B = [
  'Noor', 'Loops', 'Jas', 'Pip', 'Bean', 'Mo', 'Zuri', 'Otto', 'Lina', 'Rex', 'Juno', 'Milo', 'Ivy', 'Bo', 'Nova',
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
    'Coach Gonad: "Tuck in behind a rival and you go faster for free. Free is my favourite price!"',
    'Coach Gonad: "Grab the fruit sugar! It fills your GAS. GAS is life. Also snacks are life."',
    'Coach Gonad: "Overtake, overtake, overtake! Chain them for a COMBO!"',
    'Coach Gonad: "999,999 to go. Easy. I did the maths on a napkin."',
    'Coach Gonad: "Hit DASH for a burst. It burns GAS, so don\'t spam it like a doorbell."',
    'Coach Gonad: "Your dad ate broccoli for this moment. Don\'t let the florets down."',
  ],
  acid: [
    'Coach Gonad: "Green puddle = ouch. Blue bubble = aaah. Remember the colours!"',
    'Coach Gonad: "This place has the pH of a lemon with a grudge."',
    'Coach Gonad: "Swim around the acid, not through it. Antacid Coat? Then you may sightsee. Briefly."',
    'Coach Gonad: "If a puddle bubbles at you, it is not saying hello. Swim around it."',
    'Coach Gonad: "Pass, pass, pass! Every overtake resets the combo timer. I would weep with pride. Ducts are broken."',
  ],
  goo: [
    'Coach Gonad: "Gaps in the wall! Line up early, then go straight through."',
    'Coach Gonad: "Goo is just a queue that set. Do not queue. Find the gap."',
    'Coach Gonad: "Bonked a wall? Shake it off! Pretend it was on purpose."',
    'Coach Gonad: "I was stuck in this goo for a whole weekend once. I wrote a poem. It was sticky."',
    'Coach Gonad: "Draft through a gap behind a rival. Let them find the hole. I found it with my face. Twice."',
  ],
  sea: [
    'Coach Gonad: "Hear that humming? Big Macros hum when they are hungry. They are always humming."',
    'Coach Gonad: "A shield takes one bite for you. Grab them, love them."',
    'Coach Gonad: "Big ocean, tiny you. Find a rival and get behind them. Drafting!"',
    'Coach Gonad: "Currents push you around. Steer against them, or ride them like a pro."',
    'Coach Gonad: "Combo past 10 for FRENZY! Loud, shiny, fast. Like the shark I surfed. Fine, a raisin."',
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
    'Coach Gonad: "Swim like Dad WILL walk every day! He bought the shoes. Baby steps."',
  ],
  egg: [
    'Coach Gonad: "TAP TAP TAP! Drill in before the others do!"',
    'Coach Gonad: "See a rival wind up? Drum THEIR side of the egg. Three quick taps and the move is toast."',
    'Coach Gonad: "This is it, Kevin! I\'m SO proud. I\'m also very loud."',
    'Coach Gonad: "Don\'t stop tapping to read this. Seriously, stop reading."',
  ],
};

// Boss rivals: "pass" is what they say when they overtake YOU, "passed" is what they cry when you overtake them.
export const RIVAL_TAUNTS = {
  'Steve': {
    pass: ['Steve: "Coming through! Lovely tail, by the way!"', 'Steve: "I have a pet pebble. His name is also Steve."', 'Steve: "My mum packed me a sandwich. It\'s in my tail."', 'Steve: "Sorry for passing! Sorry! Bye!"'],
    passed: ['Steve: "Aw, good for you, buddy!"', 'Steve: "Say hi to Doug, my Macro pal!"', 'Steve: "I can whistle with my tail. Not now. Go!"', 'Steve: "Sorry I was in your way! Go, go!"'],
  },
  'Brock': {
    pass: ['Brock: "Roses are red. Brock is ahead."', 'Brock: "Haiku. Brock goes zoom. You, less zoom."', 'Brock: "Rep one: pass. Rep two: gloat."', 'Brock: "Brock is fast. Kevin is last."'],
    passed: ['Brock: "Passed by you? Brock is blue."', 'Brock: "Brock feels a sad poem coming on."', 'Brock: "Rep count: zero. Brock: no hero."', 'Brock: "Gerald says rematch. Gerald is always right."'],
  },
  'Tiffany': {
    pass: ['Tiffany: "Spoiler: you bonk in 3, 2..."', 'Tiffany: "Tube: two stars. Lighting: moody."', 'Tiffany: "Packed 40 highlighters. Used 41."', 'Tiffany: "Never seen an egg. Read 400 of them."'],
    passed: ['Tiffany: "Erratum: Kevin passed me. Briefly."', 'Tiffany: "Blog post tonight: Kevin, two stars."', 'Tiffany: "Recalculating... 61.3%... 61.2%..."', 'Tiffany: "Wait. Are real eggs this far away?"'],
  },
  'Gunther': {
    pass: ['Gunther: "Watch THIS!" *barrel roll*', 'Gunther: "Watch closely. This is cinema."', 'Gunther: "That pass? A solid 9. Out of 10."', 'Gunther: "Move, Kevin. Art needs space."'],
    passed: ['Gunther: "I meant to do that."', 'Gunther: "A plot twist. I wrote it, obviously."', 'Gunther: "Fan mail says I let you. I wrote it."', 'Gunther: "Stunt double? Never heard of him."'],
  },
  'Chad Thundertail': {
    pass: ['Chad: "Thundertail, baby! Out of the way, Kelvin!"', 'Chad: "I practised this face in a puddle. For days."', 'Chad: "This pass counts as win 1,001. Trust me."', 'Chad: "My uncle did this exact pass. Once. Legend."'],
    passed: ['Chad: "Passed by Number Guy? Put THAT on a mug."', 'Chad: "Be cool, Chad. What would Uncle Thad do?"', 'Chad: "Passed? The hair was resting. Ask it."', 'Chad: "The family says Thundertails always win. Do we?"'],
  },
};

// Loading / between-run tips. Half joke, half lesson.
export const TIPS = [
  'Tip: Tuck in behind a rival to DRAFT. You go faster and they do all the work. Classic office move.',
  'Tip: Tap the pink DASH button (pros flick UP). It burns GAS, so save it for gaps, currents and showing off.',
  'Tip: Overtakes in a row build a COMBO. Keep passing or the combo fades. Like a sandcastle, but sadder.',
  'Tip: Combo 10 starts FRENZY. Everything goes faster and louder. Like a birthday party with extra cake.',
  'Tip: At the Fork, follow the pink sparkles. The other tube is a very nice dead end.',
  'Tip: Green taped puddle = ouch. Blue pH bubble = aaah. Read the colours, champ!',
  'Tip: Don\'t lick the acid. Nobody who licked the acid has ever said "worth it".',
  "Tip: Goo gates have gaps. Line up early. Don't try to headbutt the wall. The wall always wins.",
  'Tip: Big Macros eat swimmers. DASH into one and it POPS. No DASH? Hide behind Steve. Steve does not mind. Steve never minds.',
  'Tip: Fruit sugar fills your GAS. Run out and you coast to a sad little stop. No pressure.',
  'Tip: In the Rapids the current pushes back. The middle of the tube is fastest. The walls belong to the hairs.',
  'Tip: At the egg, watch the rivals. One winding up a big move? Drum THAT side and it fizzles. Brock wrote a sad poem about it.',
  'Tip: The race you swam is your head start at the egg. Arrive with a full tank and a big combo and you drill in early. The egg loves punctuality.',
  'Tip: Spend DNA on Dad\'s Habits. A healthy dad makes speedy swimmers. Broccoli is a performance enhancer.',
  'Coach fact: Dad is THINKING about broccoli. Baby steps.',
  'Coach fact: Dad is thinking about selling the hot tub. He sat in it to think.',
  'Coach fact: Dad bought a big water bottle. Step two is filling it.',
  'Coach fact: Kale is just lettuce that goes to the gym.',
  'Coach fact: the Acid Lagoon is mostly lemon. Do not put it in your tea.',
  'Dad joke: Why did the broccoli win the race? It had a head start.',
  'Dad joke: What do you call a sad strawberry? A blueberry.',
  "Dad joke: I'm reading a book about anti-gravity smoothies. I can't put it down.",
  'Dad joke: Lettuce celebrate. Your swimmers are getting faster.',
  'Coach Gonad says: "There\'s no I in team. There\'s one in WIN. Think about it."',
  'Coach Gonad says: "Every winner was once a loser who swam again." He wrote it on a napkin. He framed the napkin.',
  'Tip: Rare mutations stack in wild ways. Hype Man plus Nitro Frenzy makes a MASHUP. A loud one.',
  'Tip: Chad is slow in the tube, scary at the egg, and lost at the Fork. Like a cat.',
  'Tip: Even when you lose, you earn DNA. Failure is just practice with confetti.',
  'Tip: A combo only pays once you cash it in. Swipe DOWN or tap CASH before you bonk. Unbanked combos are just hopes and dreams.',
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
  [100000, 'Top 100,000. The mantelpiece is making room.'],
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
  'Coach blew the whistle so hard it squeaked.',
  'Dad is crying. Coach is "just sweating".',
  'Every Kevin before you just did a conga.',
  'Somewhere, a tiny sock was just bought.',
  'Started last. Finished first. Biology!',
  'Somewhere, a baby book just got its first page.',
  'The egg is redecorating. For you.',
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
  steer: { t: 'Drag ANYWHERE to steer!', s: 'Kevin follows your thumb.' },
  dash:  { t: 'Tap DASH for a burst!', s: 'Big pink button. Burns GAS!' },
  draft: { t: 'Tuck in BEHIND a rival', s: 'Free speed. Rude, but fast.' },
  combo: { t: 'Pass 3 in a row', s: 'Keep passing. Watch it grow.' },
  fruit: { t: 'Eat fruit for GAS!', s: 'Fruit refills the GAS DASH burns.' },
  drill: { t: 'Tap FAST to drill in!', s: 'Both thumbs. The egg is waiting.' },
  cash:  { t: 'Tap CASH to bank your combo!', s: 'Or swipe DOWN. Bank it before you bonk.' },
  frenzy: 'Chain passes to light FRENZY! What a racket.',
  natural: 'Natural talent. Coach is impressed.',
  retry: 'Keep swimming! Coach has more tricks.',
};

// One Coach Gonad line per zone for the zone banner (runs 1 to 3, the biggest text on screen): 6 words or fewer,
// the rule first (the noun on screen plus a verb a first-timer can act on), the joke a short tail. The cheekier
// lines live on in COACH_SHORT_MORE (run 3 and up).
export const COACH_SHORT = {
  launch: 'Hide BEHIND someone. Free speed!',
  acid:   'Green puddles burn. Blue pH heals.',
  goo:    'Aim for the GAP. Goo grabs.',
  sea:    'White blobs BITE. Helmets save.',
  fork:   'Follow the SPARKLES. Chad lies.',
  rapids: 'Stay MIDDLE. Walls are slow.',
  egg:    'THERE SHE IS! TAP TAP TAP!',
};

// Floating pop words for juicy moments. Max 16 characters each so they fit a phone.
export const POP_LINES = {
  close:      ['CLOSE!', 'WHISKER!', 'YIKES!', 'TOO CLOSE!', 'TAIL TRIM!', 'HAIRCUT!'],
  dodge:      ['DODGED!', 'NOPE!', 'SIDESTEP!', 'MISSED ME!', 'NOT ON THE MENU', 'NO THANK YOU!'],
  thread:     ['THREADED!', 'NEEDLE!', 'TIGHT FIT!', 'SQUEEZE!', 'PERFECT GAP!', 'NEEDLE NOSE!', 'GAP? GOT IT.'],
  bonk:       ['SPLAT', 'BLORP', "GOO'D", 'SPLOOT', 'GLOOP', 'SQUELCH', 'WOBBLE', 'GLOMP'],
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
  second:     ['SECOND WIND!', 'NOT DEAD YET!', 'PLOT TWIST!', 'NOT OVER YET!', 'UP AGAIN!', 'STILL WIGGLING!', 'COMEBACK KID!', 'BOUNCE BACK!'],
  spare:      ['SPAT OUT!', 'TOO CRUNCHY!', 'NEEDS SALT!', 'TOO SPICY!', 'SPIT TAKE!', 'REFUND!', 'YUCK, KEVIN!', 'SENT BACK!'],
  record:     ['NEW BEST!', 'FRIDGE-WORTHY!', 'PERSONAL BEST!', 'DAD IS PROUD!', 'FRAME THIS!', 'HISTORY!', 'RECORD BROKEN!', 'BEST KEVIN YET!'],
  pastBest:   ['PAST YOUR BEST!', 'NEW TERRITORY!'],
  // first-swim dash past a rival: main.js shows these as-is, so each one carries the reward.
  zoomPast:   ['ZOOMED! +2 DNA', 'SEE YA! +2 DNA', 'BEEP BEEP +2 DNA', 'LATER! +2 DNA'],
};
// Grade shown when a combo is banked, worst to best.
export const BANK_GRADES = ['COACH NODS', 'DAD CLAPPED', 'STEVE FAINTED', 'CHAD IS JEALOUS', 'ONE IN A MILLION'];
// When a big combo runs out.
export const BREAK_LINES = ['STEVE SAW THAT', 'BUTTERFINGERS', 'AND IT IS GONE', 'CHAD IS LAUGHING', 'OOPSIE', 'COACH WINCED', 'WHOOPSIE DAISY', 'DIETER FILMED IT'];

// ---------------------------------------------------------------- result screen
// Big title by how the run ended (close = lost but very near the egg). 15 characters or fewer.
export const RESULT_TITLES = {
  energy: ['ON FUMES', 'OUT OF GAS', 'TAIL FAIL', 'NAP TIME', 'LOW BATTERY', 'WIGGLED OUT', 'VIBES ONLY'],
  acid:   ['FIZZED', 'LEMON KEVIN', 'ZESTED', 'MELTDOWN', 'pH OH NO', 'SOUR ENDING', 'DISSOLVED-ISH'],
  bonk:   ['STUCK', 'GOO\'D', 'RAISIN MODE', 'JELLIED', 'WALL WON', 'SPLOOTED', 'GLUED'],
  wbc:    ['LUNCHED', 'NOM NOM', 'EATEN', 'TABLE FOR ONE', 'DAILY SPECIAL', 'TAKEAWAY', 'CHEF\'S KISS'],
  wrong:  ['WRONG TUBE', 'NOBODY HOME', 'SCENIC ROUTE', 'LOST THE PLOT', 'DEAD END', 'EMPTY HALLWAY', 'NO EGG HERE'],
  late:   ['BEATEN TO IT', 'EGG TAKEN', 'SO NEARLY', 'TOO SLOW, KEV', 'SECOND BEST', 'DOOR SHUT', 'TAPPED OUT'],
  close:  ['SO. CLOSE.', 'THE EGG SAW YOU', 'ONE MORE WIGGLE', 'ALMOST A PERSON', 'NEXT. TIME.', 'ON THE DOORSTEP', 'THE EGG GASPED'],
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
    'Lost in the tutorial zone. Coach re-read it.',
    'Coach was still unfolding his chair.',
    'Still in the car park. The race went on.',
    'Posed for the crowd. Forgot the race.',
    'Out before the first corner. Dad was parking.',
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
    'The Gate of Goo stayed shut. It hummed a little.',
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
    'Womb Sea postcard: wish you were here. You are.',
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
  'So near. The next one is yours.',
  'Coach dropped the clipboard. GO!',
  'One more swim. You KNOW it.',
  'Next swim, ring the bell first.',
  'The next Kevin is stretching.',
  'So close the egg blushed.',
  'That was the warm-up. Go again.',
];
// One quick lesson for next time, by what got you.
export const TIP_BY_REASON = {
  energy: ["Grab more fruit sugar. Strawberries aren't decoration.", 'Hide behind rivals. It refills you for free.', 'DASH burns GAS. Save it for gaps, not for fun.'],
  acid:   ['Swim around the taped puddles. pH bubbles fix the burn.', 'Burning? Find a pH bubble. It stops the melt.', 'Antacid Coat makes acid burn 60% less.', 'Never lick the acid. The acid licks back.'],
  bonk:   ['Line up with the gap early, then go straight.', 'Goo Surfer lets you shrug off the walls.', 'Follow a rival through the gate. They find the gap.'],
  wbc:    ['DASH into a Big Macro and it POPS. Macros hate that.', 'Your DASH was cooling down. Pop them when it is back.', 'Keep a rival between you and the Big Macro.',
            'A Macro chewing a rival is not chewing you. Dodge it mid-snack!'],
  wrong:  ['At the Fork, follow the pink sparkles.', 'Smart rivals usually pick right. Tiffany, mostly.', 'Egg Nose puts a big arrow on the right tube.'],
  late:   ['Rival winding up? Drum THAT side of the egg.', 'Full tank, big combo at the door: head start!', 'Save a DASH for the last stretch. Every bit counts.'],
  crash:  ['The tube hiccupped, not you. Swim on, Kevin!', 'Tube glitch, not a Kevin glitch. Your DNA is safe.'],
  quit:   ['Breaks are allowed. The egg is very patient.', 'Back when you are ready. Coach is holding your spot.'],
  lateRoute: ['Arrive earlier: DASH on the straights, not the bends.', 'Chain passes into FRENZY. FRENZY is a shortcut with confetti.',
              'Draft, then DASH out. A slingshot beats a long chase.'],
};
// New personal best.
export const RECORD_LINES = [
  'Dad is weirdly proud.',
  'New best! Frame it. Hang it in the hall.',
  'Personal record! Dad rang Grandad. At dawn.',
  'Better than ever. Your tail is glowing.',
  'History made. Small history. Still history.',
];
// The next swimmer in line after a loss. {n} is his number.
export const KEVIN_NEXT = {
  few:     ['Kevin #{n} steps up. He has been practising.', 'Kevin #{n} is ready. He did some lunges.', 'Next up: Kevin #{n}. Same tail, new hope.', 'Kevin #{n} wrote a pep talk on his tail.', 'Kevin #{n} watched the replay. In slow-mo.', 'Kevin #{n}: "My turn. Hold my fruit."'],
  many:    ['Kevin #{n} has been waiting in the queue. He brought snacks.', 'Kevin #{n} has read all your mistakes. Taking notes.', 'Kevin #{n} is very calm about this. Too calm.', "Kevin #{n} made a vision board. It's just an egg.", 'Kevin #{n} has a new headband. It says EGG.', 'Kevin #{n} wears lucky socks. Kevins have no feet.'],
  tenPlus: ['Kevin #{n}. The Kevins are a dynasty now.', 'Kevin #{n} has a fan club of earlier Kevins.', 'Kevin #{n}: "I\'ll finish what we started."', 'Kevin #{n} has a theme song. The other Kevins hum it.', 'Kevin #{n}. The Kevins have a group chat now.', 'Kevin #{n} carries the hopes of every Kevin before him.'],
};
// Share text tail, by rank: [maxRank, text]. Use tierLine(SHARE_LINES, rank).
export const SHARE_LINES = [
  [1, 'I beat 999,999 swimmers to the egg. Bet you cannot.'],
  [3, 'Podium out of a MILLION. Your Kevin is on the bench.'],
  [10, 'Top ten of a million. Beat that before lunch.'],
  [100, 'Top 100. I dare you to crack the top 1,000.'],
  [1000, 'Beat 999,000 swimmers. Bet you bonk first.'],
  [100000, 'Top 100,000. Your tail could never.'],
  [999999, 'I passed somebody. Bet you pass fewer.'],
  [Infinity, 'Dead last. Surely you can beat THAT?'],
];
// Welcome back, by hours away ('full' = the factory hit its cap). {dna} is the amount made.
export const AWAY_LINES = {
  '<1': ['Back already? Dad barely sat down.', 'Quick break! The factory made a little {dna} DNA.', 'Short nap, small pile: {dna} DNA.', 'Missed you. For a few minutes.',
         'The factory cat knocked {dna} DNA off a shelf. Yours now.', 'Dad clocked in, clocked out. {dna} DNA.'],
  '1-4': ['The factory hummed along: {dna} DNA.', 'Dad ate a salad while you were gone. {dna} DNA!', 'Busy busy. {dna} DNA waiting for you.', 'The swimmers kept training. {dna} DNA made.',
          'Tea break, two biscuits, {dna} DNA. Good shift.', 'The conveyor belt squeaked a tune. {dna} DNA.', 'Steve took the factory tour. He waved at {dna} DNA.'],
  '4-8': ['Big shift at the factory: {dna} DNA!', 'Dad did yoga AND flossed. {dna} DNA.', "You were gone ages. Here's {dna} DNA.", 'The night crew worked hard: {dna} DNA.',
          'The Kevins held a bake sale. Raised {dna} DNA.', 'A machine broke. Dad fixed it with a spoon. {dna} DNA.', 'Overtime! The foreman is a Kevin. {dna} DNA.'],
  '8+': ['You slept like Dad hopes to, one day. {dna} DNA made.', 'A whole night shift! {dna} DNA on the shelf.', 'Gone so long the Kevins held a meeting. {dna} DNA.', 'The factory missed you. It made {dna} DNA anyway.',
         'The factory had a birthday. Cake, balloons, {dna} DNA.', 'Employee of the month: a Kevin. Again. {dna} DNA.', 'The night crew sang shanties till dawn. {dna} DNA.'],
  'full': ['{dna} DNA and nowhere to put it. Dad is sitting on some.', 'The factory is FULL. {dna} DNA and the doors will not shut.', 'Factory shelves maxed at {dna} DNA. The cat sleeps on the spill.', '{dna} DNA piled in the factory canteen. Dad eats standing up.',
           'The factory forklift is stuck behind {dna} DNA. Help.', 'The factory stopped at {dna} DNA. Spend it, boss!'],
};
// Daily race streak: entry N - 1 is day N (each opens 'Day N.'), the last entry covers day 30 and every day after.
// Days 7, 14, 21 and 30 are the big ones. Then a lost streak.
export const DAILY_LINES = {
  streak: [
    'Day 1. Every legend starts somewhere.',
    'Day 2. Two in a row! A habit is forming.',
    'Day 3. Coach Gonad bought you a whistle.',
    'Day 4. Dad is thinking about jogging. Big step.',
    'Day 5. The other swimmers whisper your name.',
    "Day 6. One more and it's a whole week!",
    'Day 7. A FULL WEEK. Absolute unit behaviour.',
    'Day 8. Week two. Steve made you a calendar.',
    'Day 9. Dad set an alarm called KEVIN TIME.',
    'Day 10. Double digits! Brock wrote you a haiku.',
    'Day 11. The Big Macros have learned your schedule.',
    'Day 12. Tiffany put your streak in a spreadsheet.',
    'Day 13. Lucky for some. Luckier for you.',
    'Day 14. TWO WEEKS! The Kevins threw a surprise party.',
    'Day 15. Halfway to a month. Grandad made a chart.',
    'Day 16. Coach Gonad ironed his whistle. Big day.',
    'Day 17. Grandad told the whole bingo hall about you.',
    'Day 18. Gunther wants the film rights to your streak.',
    'Day 19. Chad claims a 20-day streak. He has 3.',
    'Day 20. Twenty mornings. The tube says good morning back.',
    'Day 21. THREE WEEKS! The tube rolled out a red carpet.',
    'Day 22. The factory cat wears your streak on a badge.',
    'Day 23. Steve cried at your streak. Happy tears.',
    'Day 24. Dad built a new shelf. For the medals.',
    'Day 25. Twenty-five! Brock counted it on his biceps.',
    'Day 26. Your thumbs have their own fan club now.',
    'Day 27. Tiffany wrote a whole chapter on your mornings.',
    'Day 28. Four weeks! The egg leaves the porch light on.',
    'Day 29. One more for a month. Coach is pacing.',
    'Day 30+. A month of mornings. The egg knows your name.',
  ],
  lost: [
    'Fresh start. Every Kevin needs a day off.',
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
    intro: 'Chad: "Chad Thundertail. 1000 wins. Mugs at the back."',
    stealEgg: 'Chad got the egg. Chad will be insufferable about this.',
    loseEgg: 'Chad: "This doesn\'t count. Chad was warming up."',
    nemesis: "Chad is telling everyone you cheated. You didn't.",
    beaten: 'Chad: "Chad let you win. For the fans."',
  },
};
// Egg drama banners. {name} is the rival or Kevin.
export const EGG_LINES = {
  claim:  ['{name} IS AT THE EGG!', '{name} IS DRILLING!', '{name} IS ELBOWING IN!', '{name} IS KNOCKING!', '{name} RANG THE BELL!', '{name} IS AT THE DOOR!', '{name} IS PUSHING IN!'],
  first:  ['FIRST KNOCK IS YOURS!', 'FRONT OF THE QUEUE! DRILL!', 'YOU RANG FIRST! TAP!'],
  // 22 characters or fewer, never naming a rival (who may be gone): EGG_WIN_OVER has the per-rival ones.
  win:    ['{name} IS IN!', 'COACH IS SOBBING', 'DOOR OPEN. KEVIN IN!', 'ONE IN A MILLION!', 'THE EGG SAID YES!', 'KNOCK KNOCK. WHO? YOU', 'FROM DEAD LAST TO IN!', 'WELCOME HOME, KEVIN!', 'A BABY IS BOOKED!'],
  stolen: ['{name} STOLE THE EGG!', '{name} GOT IN FIRST!', 'NOOO! {name} DID IT!'],
  // Lead changes in the finale. lead: {name} is whoever just took it (a rival or Kevin); leadYou: Kevin only.
  lead:    ['{name} TAKES THE LEAD!', 'LEAD CHANGE! {name}!', '{name} IS IN FRONT!', '{name} SNEAKS AHEAD!'],
  leadYou: ['KEVIN IS BACK IN FRONT!', 'KEVIN TAKES THE LEAD!', 'YOUR EGG TO LOSE!', 'KEVIN, BACK ON TOP!'],
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
  pinCushion:  'Made of glass? Wear a cactus. Suddenly the hat fits.',
  cavity:      'Lick the whole fruit bowl. Skip the comedown. Dentists hate it.',
  doubleDown:  'Bet it all, then hear it twice. The house forgives.',
  meltdown:    'A short fuse in a room full of fireworks. Burns all night.',
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
    'Dad bought a broccoli tea towel. Then three.',
    'Dad puts broccoli on pizza now.',
    'Dad brings broccoli to barbecues. Nobody asked.',
    'Dad grows his own. He talks to it.',
    'Dad won a ribbon at the veg show. Framed it.',
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
    'Dad toasts with water at weddings. Ice clinking.',
    'The water bottle has a name now. It is Brenda.',
    'Dad is 90% water. Hydration legend.',
  ],
  sleep: [
    'Dad went to bed at 11. The neighbours checked on him.',
    'Dad went to bed at 10:30. Total rebel.',
    'Dad owns a sleep mask now.',
    'Dad bought a pillow fancier than the bed.',
    'Dad sleeps like a baby. A well rested one.',
  ],
  jeans: [
    'Dad loosened the belt one notch.',
    'Dad loosened it two notches. Breathed out.',
    'Dad tried on some slacks. Room for a sandwich.',
    'Dad gave away the skinny jeans. The bin said thanks.',
    'Dad wears comfy trousers now.',
    'Dad bought cargo shorts. So many pockets.',
    'Dad wore pyjama bottoms to the shop. Nobody said a word.',
    'Dad lives in joggers. Freedom!',
  ],
  berries: [
    'Dad ate a blueberry by accident.',
    'Dad ate a raspberry on purpose. Then a second one.',
    'Dad put berries on his cereal. Mum took his temperature.',
    'Dad has a favourite berry. It changes daily.',
    'Dad makes smoothies. The blender has a fan club.',
    'Dad has purple fingers. He wears them proudly.',
    'Dad knows a secret bramble. He tells no one.',
    'Dad has a berry farm. Well, a very big pot.',
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
    'Dad went "boots and cats" again. Mum left the room.',
    'Dad drops a beat on the saucepans.',
    'Dad beatboxes while cooking.',
    'Dad won a beatbox battle at the bus stop.',
    "Dad has a beatbox channel. It's good.",
  ],
  hottub:   ['Dad said goodbye to the hot tub.', 'Dad takes cool showers. A hero.'],
  meditate: ['Dad sat still for 30 seconds.', 'Dad says "namaste" to the cat.', 'Dad floats. Zen master Dad.'],
  factory: [
    "The factory opened! It's tiny.",
    'The factory hired a cat. It works for chin scratches.',
    'The factory got a second shelf. Big day.',
    'The factory doorbell plays a beatbox.',
    'The factory has a conveyor belt. It squeaks.',
    'The factory has a canteen now.',
    'The canteen does a Tuesday curry. The queue starts Monday.',
    'The factory cat got promoted. Double chin scratches.',
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
  'GAS light on. Tail is doing the sad walk. FRUIT!',
  'Tummy says feed me. Tail agrees. Eat fruit!',
  'Running on fumes and hope. Mostly fumes. FRUIT!',
  'Tail battery at 2%. Plug in a berry!',
  'Tank is so empty it echoes. Eat fruit!',
  'Your tail just yawned. Fruit, quick!',
  'Even Steve packed snacks. Low GAS! FRUIT!',
  'Coach is waving a berry at you. Low GAS. EAT!',
];
// First time each hazard or pickup scrolls into view: verb plus payoff, 7 words or fewer.
export const HAZARD_INTRO = {
  acid:     'Green taped puddles burn. Steer round!',
  alkali:   'pH BUBBLES stop the burn. Slurp!',
  gate:     'Aim for the GAP. Goo is clingy.',
  goo:      'Dodge the goo blob. It hugs forever.',
  wbc:      'Big Macros bite. DASH into one: POP!',
  current:  'Steer against the current, or surf it.',
  cilia:    'Slip past the hairs after they swat.',
  forkSign: 'Follow the pink sparkles. Eggs love bling.',
  dna:      'Grab DNA for Dad\'s Habits. Science!',
  helmet:   'Grab the helmet. It blocks one bite.',
  sugar:    'Eat fruit to fill your GAS. Yum!',
  popcorn:  'Sleepy Macros! DASH through to pop them.',
};
// The very first death of a save: plain-spoken, says what happened and what to do. 48 characters or fewer.
export const FIRST_DEATH = {
  energy: 'Out of GAS. Eat fruit! Your tail says please.',
  energyEgg: 'Eat more fruit! The GAS quit {cm} cm short.',
  energyEggAt: 'Out of GAS at the egg. Eat fruit on the way!',
  acid:   'Dodge the tape, grab the pH.',
  wbc:    'DASH pops a Big Macro. Or hide behind a rival!',
  bonk:   'Aim for the goo gap early. Goo is clingy.',
  late:   'Rival winding up? Drum THAT side of the egg!',
  wrong:  'Wrong tube! The egg tube has pink sparkles.',
  crash:  'Swim on! The tube hiccupped, not you.',
  quit:   'Take your time. The tube kept your spot warm.',
  lateRoute: 'Too slow at the end. DASH on the straights!',
};

// ================================================================ rival voice for the finale
// Keyed by the exact RIVALS names. bump: you bumped them, shove: they shoved you at the egg,
// sprint: they find the last gear, drill: muttering while shoving at the egg.
export const RIVAL_REACTS = {
  'Steve': {
    bump:   ['Steve: "Sorry! Was that my fault?"', 'Steve: "Ow! Careful, I hug Macros for fun."', 'Steve: "Oops! Mum says sorry too!"'],
    shove:  ['Steve: "I can do a cartwheel! Not now!"', 'Steve: "Mum said share. Have an elbow!"', 'Steve: "MY turn! I have never had a turn!"', 'Steve: "Sorry! That one was on purpose."', 'Steve: "Elbow! Sorry! Elbow again!"', 'Steve: "My pebble Steve would never. SHOVE!"', 'Steve: "Excuse me! Pardon! SHOVE!"'],
    sprint: ['Steve: "Wheee! Is this allowed?"', 'Steve: "Sorry in advance! FAST Steve!"', 'Steve: "I once won a raffle! A spoon!"'],
    drill:  ['Steve: "Knock knock! It is Steve! Hi!"', 'Steve: "Egg, Mum says hello! And sorry!"', 'Steve: "Egg, I wrote you a song. Verse one."', 'Steve: "Egg, sorry for the knocking!"', 'Steve: "Sorry, egg! Excited knocking!"', 'Steve: "Egg, I can count to nine! Ten soon!"', 'Steve: "Knock, knock. Sorry. Knock."'],
  },
  'Brock': {
    bump:   ['Brock: "BRO. My gains!"', 'Brock: "Mind the shake! It bruises easy."', 'Brock: "That was cardio. Thanks, bro."'],
    shove:  ['Brock: "Brock shoves. Not sorry."', 'Brock: "Shove with ease. Brock, please."', 'Brock: "Elbow wide. Step aside."', 'Brock: "Shove is love. Brock is above."', 'Brock: "Shove rep one. Shove rep two."', 'Brock: "Ode to elbows. Short poem. SHOVE."', "Brock: \"Make way. Brock on display.\""],
    sprint: ['Brock: "LAST SET! MAX REPS!"', 'Brock: "Rep nine! Rep TEN! GO, BROCK!"', 'Brock: "Ode to my tail! GO, TAIL, GO!"'],
    drill:  ['Brock: "Eight... nine... TEN REPS!"', 'Brock: "Egg, Brock wrote you twelve verses."', 'Brock: "Egg, you are round. Brock is sound."', 'Brock: "Drill for real. Brock has zeal."', 'Brock: "Brock knocks in sets of ten."', 'Brock: "Knock eleven. Knock twelve. HUP."', 'Brock: "Count the knocks, bro. LOUD."'],
  },
  'Tiffany': {
    bump:   ['Tiffany: "Bumped. Blog says: one star."', 'Tiffany: "My highlighter! It SMUDGED."', 'Tiffany: "Ow. The books never said ow."'],
    shove:  ['Tiffany: "Angle: 31 degrees, as rehearsed."', 'Tiffany: "Chapter 9 said: politely. Ha."', 'Tiffany: "Real eggs have elbows?! MOVE."', 'Tiffany: "Page 88 permits shoving."', 'Tiffany: "Elbow pads: packed. Mercy: not."', 'Tiffany: "Citation: my elbow."', 'Tiffany: "Packed two spare elbows for this."'],
    sprint: ['Tiffany: "Final chapter. I sprint."', 'Tiffany: "Real eggs GLOW?! Not in print!"', 'Tiffany: "Sprint odds: 77%. Rising!"'],
    drill:  ['Tiffany: "Drill at 62%. I am fine. FINE."', 'Tiffany: "Spoiler: the egg picks me."', 'Tiffany: "Breathe, Tiff. Four in, four out."', 'Tiffany: "Brought 12 pens. For one knock."', 'Tiffany: "Page 400: knock firmly."', 'Tiffany: "I bookmarked this door."', 'Tiffany: "Egg, I have read about you."'],
  },
  'Gunther': {
    bump:   ['Gunther: "That bump? Planned. A solid 7."', 'Gunther: "You bumped an artist. Shameful."', 'Gunther: "Bumped? I give that a 6."'],
    shove:  ['Gunther: "Move. The light is perfect."', 'Gunther: "Camera, did you get it?!"', 'Gunther: "That shove? 10 out of 10."', 'Gunther: "A fan wrote in: shove more. OK!"', 'Gunther: "Out of my shot, Kevin!"', 'Gunther: "Stunt shove! Take two!"', 'Gunther: "Get the elbow! Close-up!"'],
    sprint: ['Gunther: "FINAL STUNT! ROLL CAMERA!"', 'Gunther: "The finale! Cue the strings!"', 'Gunther: "Judges, hold up your 10s!"'],
    drill:  ['Gunther: "Drill spin! Double twist!"', 'Gunther: "Egg, this is your close-up."', 'Gunther: "Fan mail says: more knocks. On it!"', 'Gunther: "This knock is for my one fan. Me!"', 'Gunther: "Egg, look at the lens. Smile!"', 'Gunther: "Knock in slow-mo. ACTION."', 'Gunther: "That knock: an 8. The next: 11."'],
  },
  'Chad Thundertail': {
    bump:   ['Chad: "My HAIR! Do you know the cost?"', 'Chad: "Watch the merch, Kevin!"', 'Chad: "Ow! The hair bruises easy."'],
    shove:  ['Chad: "Champions go first. Rules."', 'Chad: "Sorry. Was that too much?"', 'Chad: "Shove sponsored by Chad Mugs."', 'Chad: "Move it, Kelvin. Or Kevin. Or you."', 'Chad: "The uncle shoved too. Ask the album."', 'Chad: "A million shoves. All legal."', 'Chad: "Family move. Thundertail elbow."'],
    sprint: ['Chad: "THUNDERTAIL MODE! ENGAGED!"', 'Chad: "This one is for the mugs!"', 'Chad: "For the uncle! For the family album!"'],
    drill:  ['Chad: "Egg, it\'s me. Chad. You know me."', 'Chad: "Counting in my head: 1001, 1002..."', 'Chad: "Egg, my family says you know us."', 'Chad: "My uncle knocked here first."', 'Chad: "Egg, merch table is by the door."', 'Chad: "Egg, your mum knew my uncle."', 'Chad: "Egg, want a mug? It has my face."'],
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
  default: ['SWIM AGAIN 💦', 'TAIL UP. GO!', 'NEXT KEVIN, GO!', 'BACK IN THE TUBE', 'AGAIN! AGAIN!'],
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
export const CLUTCH_LINES = ['CLUTCH!', 'TIFFANY GASPED', 'BY A WHISKER!', 'COACH EXHALED', 'SAVED IT!', 'BROCK APPROVES', 'ICE COLD!', 'BREATHE, KEVIN'];
// Ended a combo on purpose for a big bank.
export const FINISHER_LINES = ['CASHED IN!', 'STEVE WANTS TIPS', 'MIC DROP!', 'CHAD TOOK NOTES', 'CHA-CHING!', 'DIETER GOT IT!', 'TO THE VAULT!', 'COACH IS PROUD!'];
// Echo Chamber kept part of a dropped combo.
export const ECHO_LINES = ['ECHO!', 'SAID IT TWICE!', 'ENCORE!'];
// Extra combo words above COMBO_WORDS: [min combo, word].
export const COMBO_WORDS_HIGH = [[120, 'DIETER IS FILMING'], [160, 'BIO TEACHER SWOONS'], [200, 'WIGGLE DEITY'], [250, 'MITOCHONDRIA BOWS'],
  [300, 'BIOLOGY IS SHAKING'], [400, 'TEXTBOOK REWRITE'], [500, 'ONE IN A MILLION']];

// ================================================================ mutation flavour (48 characters or fewer)
export const MUT_FLAVOR = {
  turbo:   'Tail now has a spoiler. Unclear why.',
  tank:    'Packed lunch. And second lunch.',
  helmet:  'Safety first. Style second. Hair last.',
  draft:   'Professional tailgater. Licensed.',
  magnet:  'Snacks find you. You just float there.',
  sweet:   'Five a day? Try fifty.',
  antacid: 'Lemon-resistant. Not lemon-proof. Ask Gary.',
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
  // the double-edged cards (systems owns their numbers and desc)
  glassCannon: 'Fast as a truck. Shatters like a biscuit.',
  sugarCrash:  'Up like a rocket. Down like a nap.',
  allIn:       'Bets the lunch money on every combo.',
  hotHead:     'Gets fired up fast. Cools off faster.',
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
  ["Chad brought his NEW cousin. Same hair. More of it.", 'The cousin claims "a thousand and change". Family maths.', "{heir} has heard this before. So have the Kevins.", '{grandad} says: "Beat them both for me."'],
  ['Gary is back. Turns out he only dissolved a little.', 'He has a warning poster now: DO NOT LICK THE LAGOON.', '{heir} makes every Kevin read it aloud.', '{grandad} races the flaming scooter past it daily.'],
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
  'WELCOME BACK, BOSS!',
  'KEVIN IS BACK!',
  'THE TAIL RETURNS!',
  'MISSED YOU, CHAMP!',
  'BACK IN THE TUBE!',
  'COACH SPOTTED YOU!',
  'WIGGLE TIME, BOSS!',
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
  trick:     'NEXT: Land a {trick}',
  margin:    'NEXT: Win by {n} s',
  sweep:     'NEXT: Beat every big name',
};

// ================================================================ in-race pools and system messages
// Short Coach Gonad lines for in-race toasts, 44 characters or fewer. Long ZONE_LINES go to the pause tip.
export const ZONE_LINES_SHORT = {
  launch: [
    'Hide behind a rival. Free, like my pension.',
    'Fruit = GAS. Save me a grape.',
    'Pass three in a row. Steve managed two.',
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
    'Antacid Coat? Melt slower. Still melt.',
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
    'Hide behind rivals near Macros. I use Brock.',
    'Shields eat bites. I wear three and a scarf.',
    'FRENZY at 10. I get one at 2, from coffee.',
    'Surfed a shark here. Okay, a raisin.',
    'Halfway! My eyes would cry if they worked.',
    'Gary left a gap in the photo. We kept it.',
    'Swing wide, then DASH. Wide as my sofa.',
  ],
  fork: [
    'Pink sparkles, son. I hung those myself.',
    'The wrong tube has my old flip-flop in it.',
    "Don't flip a coin. You have no hands.",
    'Follow Tiffany. I followed a pretend shark.',
    "LOOK for sparkles. Not at Chad's hair.",
    'Two tubes. One has snacks. Kidding. The egg.',
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
    'Rival winds up? Drum THAT side! Ducts: dry.',
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
  zoneClear:    ['ZONE: HANDLED', 'TUBE: HUMBLED', 'COACH SALUTES!', 'STEVE CLAPPED'],
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
  generic:   'Healthy dad, speedy Kevins. Dad is stretching. With grunts.',
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
// The endless generations: UI cycles these (index n % GEN_INTROS_ENDLESS.length, 16 entries). {gen} generation number, {heir} the grown-up parent,
// {grandad} the generation before. Every swimmer is a Kevin from {heir}'s family.
// Running gag: the Kevin Museum adds a wing every generation (the last line of each entry). {wing} is the museum wing
// number: 1 for the first endless generation, then one more each generation.
export const GEN_INTROS_ENDLESS = [
  ['Generation {gen}. Old Coach has his fourth retirement party.', 'He stays in his deckchair. Coach Kevin squeaks the whistle.', 'Old Coach cheers every Kevin past. He forgets his cake.', 'The Kevin Museum opens wing {wing}: Uneaten Cake.'],
  ['Family reunion! Kevins AND Thundertails. Cousins, all.', '{grandad} booked a bouncy castle. Everyone bounced at once.', '{heir} is still picking glitter out of the Kevins.', 'Kevin Museum, wing {wing}: one very tired bouncy castle.'],
  ['A Steve is in the queue, apologising. Family trait.', 'Sorry to the Kevins. Sorry to the walls. Sorry to a Macro.', '{heir} told the Kevins to say sorry back. A Macro hummed.', 'Kevin Museum, wing {wing}: The Hall of Apologies.'],
  ["Tiffany's egg book has a new edition.", 'Chapter {gen} is your family. It quotes the guestbook.', '{heir} bought every Kevin a copy. Nobody read it.', 'Kevin Museum, wing {wing}: the gift shop. It sells the book.'],
  ['A Thundertail cousin is in the queue. Same hair, louder.', "He brags about ONE win. The first one. Every fact right.", 'Loudly. {heir} nods along. It is their win too.', 'Kevin Museum, wing {wing}: Win 1. It has a megaphone.'],
  ['The Kevin Museum throws a gala. Entry costs one strawberry.', "There's a statue of the first Kevin. He's dead last in it.", '{heir} took the Kevins on a school trip. Very inspiring.', 'The museum now has {wing} wings. The map has a map.'],
  ["A Brock opened a gym. It's called BROCK.", 'The sign flexes. Nobody knows how.', '{heir} signed the Kevins up. Tail day is every day now.', 'Kevin Museum, wing {wing}: one dumbbell. It is very heavy.'],
  ["Gunther's family runs a stunt school now.", 'Lesson one: no stunt doubles. Lesson two: see lesson one.', '{heir} said no. The Kevins went anyway. {grandad} cheered.', 'Kevin Museum, wing {wing}: The Ramp. Do not touch the ramp.'],
  ['A Tiffany opened a library. Every book is about eggs.', 'The egg lent her the guestbook. Reference only. No crumbs.', '{heir} paid the late fees in strawberries.', 'Kevin Museum, wing {wing}: Overdue Books. Shh.'],
  ['Grandad Day! First Dad beatboxes the doorbell tune. Live.', 'The Macro choir joins in. The shy one takes the high bit.', '{heir} recorded it. The choir wants a copy each.', 'Kevin Museum, wing {wing}: one squeaky doorbell.'],
  ['A Chad wrote his memoirs. Volume one: Win 1.', 'Great-great-lots-Grandad won once. Every word is true.', 'Chad checked twice. {heir} cried at page one.', "Kevin Museum, wing {wing}: Non-Fiction. One shelf. Chad's."],
  ['The Big Macros hum louder this time. The shy one leads.', 'Coach Kevin hums back. Now the whole tube hums.', '{heir} bought earplugs. Then threw them away.', 'Kevin Museum, wing {wing}: The Humming Room. It hums.'],
  ['A Steve baked the Kevins a cake. It says SORRY.', 'Nobody knew what for. They ate it anyway.', '{heir} saved a slice for Old Coach. One bite. Gone.', 'Kevin Museum, wing {wing}: crumbs, under glass.'],
  ['Dad sold the hot tub. Again. He keeps buying it back.', 'The buyer was a Brock. He keeps shakes in it.', '{grandad} says it was always about the principle.', 'Kevin Museum, wing {wing}: The Hot Tub. Do not sit.'],
  ['A Gunther made a film about the family. Four hours.', 'The Kevins watched it all. {grandad} slept through two.', '{heir} clapped at the credits. Very slowly.', 'Kevin Museum, wing {wing}: The Cinema. Bring a cushion.'],
  ['The factory cat retired. It got a gold watch.', 'It still clocks in every morning. Out of habit.', '{heir} lets it. Everybody needs a routine.', 'Kevin Museum, wing {wing}: one cat bed. Occupied.'],
];
// Shown once, after the generation 9 finale.
export const DYNASTY_STAMP = 'DYNASTY! Nine generations. The tube will never forget your family.';

// ================================================================ first swim and cash-in
// Launch caption on the very first swim.
export const FIRST_SWIM_LAUNCH = 'Pass them all. First to the egg wins!';
// End of the first swim when the tutorial was cut short (gentler than TUT_TEXT.retry).
export const TUT_TEXT_GENTLE = 'Nice wiggling! Coach has more tricks later.';
// One-word praise when a tutorial step is done, 12 characters or fewer.
export const TUT_PRAISE = { steer: 'WIGGLY!', dash: 'ZOOM!', fruit: 'YUM!', draft: 'SNEAKY!', combo: 'COMBO KING!', cash: 'KA-CHING!' };
// First time a combo is worth cashing in (28 characters or fewer).
export const CASH_HINT = 'Tap CASH or swipe down!';
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
  // the double-edged mashups: each one cancels its card's downside
  pinCushion:  'Speed AND shields again!',
  cavity:      'Double fruit, no crash!',
  doubleDown:  'Extra links, free drops!',
  meltdown:    'Early FRENZY, full length!',
};
// Kept for anything that still reads the old separate export.
// Extra zone-banner lines for Coach Gonad, 6 words or fewer. {n} is the Kevin number.
export const COACH_SHORT_MORE = {
  launch: ['Wiggle! Hide BEHIND someone rude.', 'Kevin #{n}! Same tail, new you!', 'I once surfed a shark. Allegedly.', 'Back of the queue? I remember.', 'Wiggle first. I never explain.', 'Draft, pass, repeat. Then lunch.', 'Fresh legs! Well, fresh tail.', "Kevin #{n}, GO! I'll jog behind."],
  acid:   ['Lemon lagoon. You know the drill.', 'Tape melts. pH soothes. Lick nothing.', 'Kevin #{n}: fizz is not flavour.', "Melting's optional today.", 'Around the puddles. Trust my scars.', 'Acid ahead. I still smell lemony.'],
  goo:    ['Find the gap. Goo hugs forever.', 'Gap hunting season is open.', 'Goo walls. I hold a grudge.', 'Be the needle, not the haystack.', 'Kevin #{n}, gap first. Snacks later.', 'Jelly ahead. I still have bits.', 'Thread it. Like a shoelace. Neatly.'],
  sea:    ['Grab helmets. Macros hate hat flavour.', 'Shark surfing? Done it. In spirit.', 'Macros bite. I hide behind Brock.', 'Macros eat loners. And my sandwiches.', 'Halfway, Kevin #{n}! Keep going!', 'Macros hum. Hum back. Confuse them.', 'Shields up. Is it lunch yet?', 'Act calm. Macros smell panic.'],
  fork:   ['Follow the sparkles. Never Chad.', 'My "shark" took the wrong tube.', 'Follow the glitter. I sneezed some.', 'Sparkly tube. The other has echoes.', 'Trust your nose. Mine is blocked.', 'Left? Right? My whistle says LOOK.', 'Skip the empty tube. I napped.', 'Smell cinnamon? Go that way.'],
  rapids: ['Middle is fastest. Hairs are rude.', 'Hairs swat on beat. Count along.', 'My pretend shark hated these rapids.', 'White flash, then swat. I blink.', 'Hairs high-five you. Unwanted. Dodge.', 'Kevin #{n}, upstream! Like ambitious salmon.', 'Wiggle louder! I hum. Nobody notices.', 'Last tube! My cap is sweating.'],
  egg:    ['THIS IS THE ONE. Probably!', 'TAP, Kevin #{n}! I air-tap too!', 'Both thumbs! I believe in thumbs!', 'Elbows out. Sausage rolls after. TAP!', 'DRILL! I never got this close.', 'Tap! I am NOT crying. TAP!'],
};

// ================================================================ UI lessons (first swim, drill, cash-in)
// Cash-in hint for keyboard players (instead of CASH_HINT when no touch was used).
export const CASH_HINT_KEYS = 'Press S to cash in your combo!';
// The goal caption on the very first swim, after FIRST_SWIM_LAUNCH.
export const FIRST_SWIM_GOAL = 'Pass them ALL. Then the egg.';
// A Big Macro bit you but spat you out (the 'spareBite' moment). 28 characters or fewer.
export const SPARE_BITE_LINES = ['Spat out! Not tasty enough.', 'Too spicy for that Macro!', 'The Macro said: needs salt.'];

// ================================================================ story before the first win
// First time you reach each zone: a 2 to 3 line story card (44 characters or fewer per line). Story, not tips.
export const ZONE_FIRST = {
  acid: [
    'Smells like old lemons. And bad decisions.',
    'Gary licked the lagoon. Be better than Gary.',
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
  'Tiffany': ['Tiffany: "Predicted: 0.1 s. Try harder."', 'Tiffany: "Next time: 12% you. Charted."', 'Tiffany: "Won! I was never worried. Ha!"'],
  'Gunther': ['Gunther: "Stunt of the year. Top it."', 'Gunther: "Come back. Bring a ramp."', 'Gunther: "A masterpiece. Sequel soon."'],
  'Chad Thundertail': ['Chad: "I won? Make that 1,001. In ink."', 'Chad: "Come back. Chad needs fans."', 'Chad: "Rematch? The hair is ready."'],
};
export const RIVAL_GLOATS_TIGHT = ['"Felt your breath. Minty, at least."', '"My tail is still shaking."', '"Too close! Tell no one."', '"You were RIGHT there. Spooky."'];
// RIVAL_STEAL: said from inside the egg, after a rival got in first.
export const RIVAL_STEAL = {
  'Steve': ['Steve: "Sorry! I\'ll name it Kevin!"', 'Steve: "I am IN! A PERSON! Hi, Mum!"', 'Steve: "I WANTED that. Is that bad?"'],
  'Brock': ['Brock: "Brock is IN. Brock is home."', 'Brock: "The shake named it Brock Jr."', 'Brock: "Brock is a dad now. FLEX."'],
  'Tiffany': ['Tiffany: "Interior: five stars. Cosy."', 'Tiffany: "The book got the colour off."', 'Tiffany: "Nobody said it was THIS warm."'],
  'Gunther': ['Gunther: "Stuck the landing. Inside!"', 'Gunther: "Cameraman, come in! Hug!"', 'Gunther: "Judges in the egg? All 10s!"'],
  'Chad Thundertail': ['Chad: "Egg, meet the hair."', 'Chad: "In PEN. Win... what are we on?"', 'Chad: "Write that down, Kelvin. BIG."'],
};
// RIVAL_FAREWELLS: a rival drops out of the race.
export const RIVAL_FAREWELLS = {
  'Steve': ['Steve: "Tour over for me! Go, Kevin!"', 'Steve: "Bye, Doug the Macro! Wonderful!"', 'Steve: "Mum! I had SUCH a nice day!"'],
  'Brock': ['Brock: "Brock is out. Brock will pout."', 'Brock: "Brock is done. Brock rests."', 'Brock: "Tail is sore. Reps no more."'],
  'Tiffany': ['Tiffany: "A plot hole. I fell in it."', 'Tiffany: "Spoiler: I come back angrier."', 'Tiffany: "Odds of this: 3.1%. Annoying."'],
  'Gunther': ['Gunther: "Stunt failed. Worth it."', 'Gunther: "Roll the sad credits. Slowly."', 'Gunther: "Dieter, you may sleep now."'],
  'Chad Thundertail': ['Chad: "Chad is not out. Chad rests."', 'Chad: "Did I look cool going out?"', 'Chad: "Still a win. Mugs are printed."'],
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
    'A {n} combo! Gunther wants a second take.',
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
    'FRENZY to zero in a second. Confetti, then hush.',
    'Peak FRENZY, peak oops. Coach saw both.',
  ],
  unbankedPot: [
    '{n} combo, never cashed. Coach says he is fine.',
    '{n} unbanked. Swipe DOWN next time!',
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
    'You followed Chad. Chad followed his reflection.',
    'Chad took the empty tube. So did you.',
    'Never follow the hair. Follow the sparkles.',
    'Chad said "trust me". Never trust Chad.',
  ],
  passedRivalThenDied: [
    'Passed {name}, then flopped. {name} waved.',
    'Passed {name}. {name} passed back, and waved.',
    '{name} saw you pass, then saw you stop.',
    'Beat {name}, then tripped on your own tail.',
  ],
  wbcAfterDash: [
    'DASH was cooling. Wait for the ring, then POP!',
    'Dash fizzled. The Macro did not.',
    'Dash INTO them, not near them, Kevin.',
    'Zoom ended. Lunch began. Time it better.',
  ],
};
// Title screen tagline, picked at random. {n} is the next Kevin's number.
export const TITLE_TAGLINES = [
  'One egg. One million swimmers. One Kevin.',
  'Kevin #{n} has been doing tail squats.',
  'Dead last is just first from the back.',
  'Wiggle hard. Dream big. Avoid the lagoon.',
  'Dad might give up the hot tub for this. He sat in it to decide.',
  'Coach Gonad has been waiting. With orange slices.',
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
  dash:  { t: 'Press SPACE for a burst!', s: 'Big SPACE bar. Burns GAS!' },
  cash:  { t: 'Press S to cash in!', s: 'Bank it before you bonk!' },
  drill: { t: 'Mash SPACE to drill in!', s: 'Any keys work. Faster!' },
  fruit: { t: 'Eat fruit for GAS!', s: 'Fruit refills the GAS SPACE burns.' },
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
// Said during the wind-up of the move (the tell): each names the incoming move plus a dare to stop it.
// 30 characters or fewer (Steve 20 or fewer), 7 per rival (the core test pins 7), no speaker prefix or quotes.
export const RIVAL_MOVE_TELLS = {
  Steve:   ['Sorry! Shove coming!', 'Big sorry incoming!', 'Sorry in advance!', 'Stop me! Sorry!', 'Mum says block this!', 'Sorry! Hip bump now!', 'You go! Psych! Sorry'],
  Brock:   ['Max rep! Stop Brock!', 'Max rep in 3, 2... Block it!', 'Rep ten loading. Stop me, bro!', 'Big lift! Spot me or stop me!', 'Max rep! Roses are red. Block!', 'Heave ho! Max rep! Dare you!', 'Lift incoming. Block it, bro!'],
  Tiffany: ['Citation incoming. Hush!', 'Citing you. Interrupt me!', 'Citation! Page 30! Stop me!', 'Footnote incoming! Block it!', 'Citation loading. Dare you!', 'Cite, cite, cite! Shush me!', 'Per my notes: shove. Stop it!'],
  Gunther: ['Stunt dive in 3...', 'Stunt dive! Cut me off!', 'Stunt dive! Ruin my shot!', 'Dive incoming! Block the take!', 'Big dive! Dare you to cut it!', 'Diving in! Steal my scene!', 'Quiet on set! Dive! Block it!'],
  Chad:    ['Hair check! Do NOT poke!', 'Hair check! Hands off!', 'Puddle mirror! Do not splash!', 'Hair check. No poking!', 'Hair check! Block it? Rude!', 'Smoulder check! Do not dare!', 'Hair check! Touch it. I dare.'],
};
// Kevin countered the move.
export const RIVAL_COUNTERED = {
  Steve:   ['Steve: "Good block! I deserved that!"', 'Steve: "Sorry for trying! Fair!"', 'Steve: "Mum blocks like that. At bingo."', 'Steve: "Ow! My pet rock felt that."', 'Steve: "Sorry! I will never try again!"', 'Steve: "Sorry. Was that too shovey?"', 'Steve: "Wow! Can you teach me that?!"'],
  Brock:   ['Brock: "Blocked mid-rep. Wrecked."', 'Brock: "Blocked? Brock is shocked."', 'Brock: "No spot. No lift. No gift."', 'Brock: "Brock got stopped. Rep dropped."', 'Brock: "Still the biggest tail. Brock."', 'Brock: "That rep did not count."', 'Brock: "Brock will rise. Brock is wise."'],
  Tiffany: ['Tiffany: "My citation! REJECTED?"', 'Tiffany: "The book said eggs were nice."', 'Tiffany: "Blocked? That was 4% likely!"', 'Tiffany: "3 maps. You are on none."', 'Tiffany: "Page 88 needs a rewrite."', 'Tiffany: "Outlier. You are an outlier."', 'Tiffany: "26 backup plans. All gone."'],
  Gunther: ['Gunther: "Cut! Cut! Again!"', 'Gunther: "Judges? A 3? A THREE?"', 'Gunther: "Delete that take. DELETE IT."', 'Gunther: "Camera, did you film THAT?"', 'Gunther: "From the top! Reset!"', 'Gunther: "Fans: that did not happen."', 'Gunther: "Fan mail will hear of this."'],
  Chad:    ['Chad: "The Hair did not consent."', 'Chad: "Blocked? NOT going on a mug."', 'Chad: "Did the egg see that? Did she?"', 'Chad: "Was that my good side? It was."', 'Chad: "Puddle, tell me I looked cool."', 'Chad: "Still 1,000 wins. Plus one."', 'Chad: "The Hair wants a word with you."'],
};
// Back in the race after taking the wrong tube at the Fork.
export const RIVAL_COMEBACK = {
  Steve:   ['Steve: "No gift shop in there. Back!"', 'Steve: "Back! I left my sandwich here."', 'Steve: "Sorry I\'m late! Took a tour!"'],
  Brock:   ['Brock: "Wrong tube. Did a lap anyway."', 'Brock: "That was the warm-up tube."', 'Brock: "Brock is BACK. Brock is pumped."'],
  Tiffany: ['Tiffany: "Research trip. Packed a net."', 'Tiffany: "I panicked. Strike that."', 'Tiffany: "Detour: 4.7 s. Recovering."'],
  Gunther: ['Gunther: "U-turn! Did you film it?"', 'Gunther: "Planned detour. Very scenic."', 'Gunther: "Gunther returns! The sequel!"'],
  Chad:    ['Chad: "Shortcut. Totally meant it."', 'Chad: "Chad was scouting. For fans."', 'Chad: "That tube had bad lighting."'],
};
// Kevin got into the egg first.
export const RIVAL_EGG_LOSS = {
  Steve:   ['Steve: "So it WAS the queue! Well done!"', 'Steve: "Well done! (I trained. A LOT.)"', 'Steve: "So happy for you! Rematch. NOW."'],
  Brock:   ['Brock: "Poem: Kevin won. Brock is done."', 'Brock: "Loss is a weight. Brock lifts."', 'Brock: "Good set, Kevin. Good set."'],
  Tiffany: ['Tiffany: "Revised: you had a chance."', 'Tiffany: "Life has no index. I checked."', 'Tiffany: "I had me at 91%. NINETY-ONE."'],
  Gunther: ['Gunther: "Dieter, stop rolling. STOP."', 'Gunther: "Stop clapping for HIM, man!"', 'Gunther: "Best stunt I ever saw."'],
  Chad:    ['Chad: "1000-1. Stop counting, Kevin."', 'Chad: "Is it the hair? Be honest."', 'Chad: "Chad is fine. Is Chad fine?"'],
};
// Kevin is drafting right behind them.
export const RIVAL_DRAFTED = {
  Steve:   ['Steve: "Make yourself at home! Tea?"', 'Steve: "Comfy? Want half my sandwich?"', 'Steve: "Sorry! (I am not sorry.) Sorry!"'],
  Brock:   ['Brock: "Free ride? Brock wants rent."', 'Brock: "Ride behind. Brock won\'t mind."', 'Brock: "Brock tows. Enjoy the show."'],
  Tiffany: ['Tiffany: "Comfy? I packed you a snack."', 'Tiffany: "Drafting? Page 30. Rude."', 'Tiffany: "The book said tubes were big."'],
  Gunther: ['Gunther: "A stunt double? Finally!"', 'Gunther: "Cameraman, film HIM? No."', 'Gunther: "Drafting me? 2 out of 10."'],
  Chad:    ['Chad: "Behind a legend? Lucky view."', 'Chad: "Is my hair okay from back there?"', 'Chad: "Enjoy the view. Buy the poster."'],
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
    'Short by {cm} cm. Gunther scored it a 2.',
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
  2: ['Silver! Top 100. The tube is talking.', 'Silver! Tiffany put you in the index.', 'Silver. Brock wants to bench it.', 'Silver! Dad framed it by the telly.'],
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
  [20, 'Coach watched a sad film. Nothing. "Broken ducts," he says.'],
  [25, 'Coach always stands one spot ahead of the start line.'],
  [40, 'Coach keeps a strawberry in his pocket. "For the last one."'],
  [50, 'Coach chopped onions for an hour. Bone dry. He looked sad.'],
  [60, 'The sticker peeled a bit. The number has a lot of nines.'],
  [90, 'Coach: "Nobody should start alone back there. Nobody."'],
];

// ================================================================ why a rival stole the egg (48 characters or fewer)
// Keyed by RIVALS first name. Escalating: index 0 for the first steal, the last for a serial thief.
export const RIVAL_STEAL_WHY = {
  Steve: [
    'Steve got in first. He said sorry to the door.',
    'Steve thought the egg was the gift shop. It was.',
    'Steve is in. He told the egg all about Mum.',
    'Steve won again. He asked the egg for a selfie.',
    'Steve is inside, showing the egg his sandwich.',
    'Steve: chatty, lovely, and a total menace.',
  ],
  Brock: [
    'Brock got in first. Brock flexed at the door.',
    'Brock is in. He named the egg after a shake.',
    'Brock is doing a victory lap. Inside the egg.',
    'Brock wrote the egg a poem. It rhymes with gym.',
    'Brock is in. He counted every knock. All 212.',
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
    'Gunther got in first. The camera got it all.',
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
  acid:   ['NO MORE FIZZING', 'AROUND THE TAPE'],
  bonk:   ['FIND THE GAP', 'UNSTICK. AGAIN.'],
  wrong:  ['FOLLOW SPARKLES', 'PICK THE PINK ONE'],
  energy: ['EAT, THEN SWIM', 'FRUIT FIRST'],
  late:   ['KNOCK LOUDER', 'DRUM THEIR SIDE'],
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
  [14, 'Chad: "After that one, we just kept counting. Upwards."'],
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
  'Chad: "So he is my... Great-great-lots-Grandad Thad?"',
  'Coach: "Nobody in your family ever did the maths."',
  'Chad: "So every Kevin win is a Thundertail win. TOLD you."',
];
// Family memories per zone. {who} is an earlier grown-up of the family (a person, never the swimmer), {heir} the
// grown-up parent now. Every swimmer is always a Kevin: a line about the swim names {who}'s Kevin, the Kevin that
// swam for {who}'s family. 62 characters or fewer before filling.
export const FAMILY_ZONE_LINES = {
  launch: [
    "{who}'s Kevin started back here too. {heir} kept his number.",
    "{heir} says {who}'s Kevin waved at the crowd here. Classic.",
    "{who}'s Kevin first wiggled right here. {heir} has a photo.",
  ],
  acid: [
    "{who}'s Kevin went around the green here. Every time.",
    "{who}'s Kevin swam this lagoon. {heir} still smells lemons.",
    "{who}'s Kevin found a blue bubble here. {heir} framed it.",
  ],
  goo: [
    "{who}'s Kevin found the gap here. {heir} says luck. It wasn't.",
    "{heir} still talks about the gap {who}'s Kevin squeezed.",
    "{who}'s Kevin bonked this wall once. {heir} says tradition.",
    "{heir} queues early for everything. {who}'s Kevin began it.",
    "{who}'s Kevin drafted a rival through this gate. Sneaky lot.",
    "{who}'s Kevin threaded this gap. {heir} cannot thread needles.",
  ],
  sea: [
    "{who}'s Kevin dodged a Macro here. {heir} tells it nightly.",
    "{heir} says {who}'s Kevin drafted Brock across this whole sea.",
    "{who}'s Kevin got halfway here. {heir} says the rest is yours.",
    "{who}'s Kevin hid behind Steve here. Steve was honoured.",
    "{heir} says {who}'s Kevin popped three Macros. It was one.",
    "{who}'s Kevin grabbed a helmet here. {heir} wears one indoors.",
  ],
  fork: [
    "{who}'s Kevin picked the sparkly tube. {heir} is still proud.",
    "{heir} says {who}'s Kevin followed Tiffany here. Smart family.",
    "{who}'s Kevin took the wrong tube once. {heir} never says so.",
    "{heir} says {who}'s Kevin never followed Chad here. Not once.",
    "{who}'s Kevin waved at the empty tube. Manners, that family.",
    "{heir} drew this Fork on the fridge. {who}'s Kevin went pink.",
  ],
  rapids: [
    "{who}'s Kevin smelled cinnamon here. {heir} bakes it yearly.",
    "{heir} says {who}'s Kevin timed every swat here. Copy him.",
    "{who}'s Kevin beat the Rapids. {heir} named the cat after it.",
    "{who}'s Kevin swam the middle here. Fastest line. Shh.",
    "{heir} hums the Rapids beat. {who}'s Kevin dodged to it.",
    "{who}'s Kevin got swatted here twice. Third time, he ducked.",
  ],
  egg: [
    "{who}'s Kevin knocked on this egg. The family got one bigger.",
    '{who} only exists because a Kevin tapped this door. TAP.',
    "{who}'s Kevin drilled here. {heir} says you share his thumbs.",
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
  Tiffany: ['A new Tiffany. The book has a new edition.', '{name} read every review. Wrote three of them.'],
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
  pinball:  { name: 'PINBALL WIZARD', hint: 'Thread a gate, bank-bump a crowd, weave.' },
  grudge:   { name: 'GRUDGE MATCH', hint: 'Pass a big name, bank-bump them, shave.' },
  snack:    { name: 'SNACK ATTACK', hint: 'Eat fruit, grab DNA, then a near miss.' },
  popcorn:  { name: 'POPCORN PARTY', hint: 'Pop a Macro, weave or sling, near miss.' },
  domino:   { name: 'DOMINO DISCO', hint: 'Bank-bump a pack, pop a Macro, big name.' },
  needle:   { name: 'NEEDLE NOSE', hint: 'Thread a gate, weave, then pop a Macro.' },
  encore:   { name: 'ENCORE!', hint: 'Cash in, pop a Macro, weave or sling.' },
  rebound:  { name: 'BOUNCE BACK', hint: 'Cash in, slingshot out, pass a big name.' },
  // recipes from core TRICKS: driveby slingshot, snipe, rival; rush snipe, gate, bump; conga draft, slingshot, close.
  driveby:  { name: 'DRIVE-BY', hint: 'Slingshot out, snipe, pass a big name.' },
  rush:     { name: 'RUSH HOUR', hint: 'Snipe, thread a gate, bank-bump a crowd.' },
  conga:    { name: 'CONGA LINE', hint: 'Draft, slingshot out, near miss.' },
};
// Pop when a signature trick lands for the first time (16 characters or fewer).
export const TRICK_NEW_LINES = ['NEW MOVE!', 'COACH FAINTED!', 'SIGNATURE MOVE!', 'COACH SAW THAT!', 'TEXTBOOK!', 'INVENTED IT!'];

// ================================================================ remixed hazards (systems emits 'hzNew' {id})
// One Coach Gonad line each, 48 characters or fewer.
export const HZ_REMIX_INTRO = {
  drift: 'Some acid puddles go for a stroll now. Watch!',
  drip:  'Goo gates sneeze blobs now. Watch for the bead!',
  slide: 'The goo gates wobble now. Chase the gap.',
  twins: 'Big Macros come in pairs now. Thread them.',
  pulse: 'The acid learned to dance. Time your gaps.',
  pair:  'Hairs on both walls now. No hiding, Kevin.',
  lunge: 'Big Macros crouch, then pounce. Sidestep late!',
  close: 'The goo gaps breathe now. Time your squeeze.',
};

// ================================================================ round text: secret, swim 1, HUD, egg duel, tricks, result
// Baby Album with no babies before Act 2 is told: see ALBUM_EMPTY at the end of the file.
// Baby Album with no babies, once Act 2 has been told (generation 19 and up): replaces 'Chad has never won'.
export const ALBUM_EMPTY_AFTER_ACT2 = 'No babies yet. The Thundertails have exactly one real win. Ask Coach.';
// Coach strip on swim 1, when the named rivals start slow (44 characters or fewer).
export const RIVALS_TIRED = 'The big names partied last night. Pounce!';
// First time the combo counter shows (32 characters or fewer).
export const COMBO_INTRO = 'Swim THROUGH the crowd!';
// The small line under COMBO_INTRO (44 characters or fewer). DNA is hidden on swim 1, so it never says DNA.
export const COMBO_INTRO_SUB = 'Each pass ticks the counter up. Chain them!';
// Label on a combo ring to swim through.
export const COMBO_RING_LABEL = 'go through!';
// Dashing with the GAS tank low (30 characters or fewer each).
export const DASH_LOW_GAS = ['Easy on the DASH! Eat fruit.', 'Tank says no. Fruit says yes.', 'DASH runs on GAS. Snack!', 'Zoom less, munch more.',
  'DASH on empty? Brave. Eat!', 'No GAS, no zoom. Fruit first.', 'Zooming on fumes. Snack up!', 'Tank sputters. Grab a berry.'];
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
  4: ['COACH LIES DOWN', 'ON CAMERA!', 'TRICK MACHINE!', 'CALL THE NEWS!'],
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
  'Bagged it. Doug the Macro jigged.',
  'Job done. The poster blushed.',
  'Collected! Coach took notes.',
  'Bounty paid. Dad wants a rerun.',
  'Done and dusted. Grandad clapped.',
  'Cashed it. The factory cat purred.',
  'Bounty cleared. Dad did a lap.',
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
  '{n} places short. The trophy shelf is waiting.',
];
// Habit levels past max (the generations' Grandad levels). Read q[(level - max) % q.length] or similar.
export const GRANDAD_QUIPS = {
  broccoli: [
    'Grandad grows broccoli on the allotment. Award winning.',
    'Grandad calls broccoli "the green rocket".',
    'Grandad knits tiny jumpers for the broccoli. Striped ones.',
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
    'Grandad still visits the bathroom a LOT. He waves on the way.',
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
  acid:   ['GO AROUND TAPE', 'pH IS FRIENDLY'],
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
// Retry button when Kevin lost the egg by a nose (22 characters or fewer, never the word 'again'). The button's job is
// the knock: 'nose' lives in NOSE_LINES (the caption), the gasp in RESULT_TITLES.close (the title).
export const REMATCH_NOSE = ['KNOCK HARDER', 'THE DOOR IS AJAR. GO!', 'FINISH THE KNOCK', 'BACK TO THE DOOR'];
// A named rival lost the egg to ANOTHER rival. Keyed by RIVALS first name (the sore loser), 3 lines each,
// {thief} is the winner's first name. 40 characters or fewer once filled.
export const RIVAL_SORE = {
  Steve:   ['Steve: "Well done, {thief}! I am fine!"', 'Steve: "{thief} was quick! I clapped!"', 'Steve: "{thief} won! Hug? No? Okay."'],
  Brock:   ['Brock: "{thief}? Brock was robbed, bro."', 'Brock: "A poem for {thief}: BOO."', 'Brock: "{thief} skipped leg day. Won?"'],
  Tiffany: ['Tiffany: "{thief}? NOT modelled."', 'Tiffany: "{thief}? That was 1%. ONE."', 'Tiffany: "{thief}. One star. Overrated."'],
  Gunther: ['Gunther: "{thief} stole my final scene!"', 'Gunther: "{thief}? Cut! We reshoot!"', 'Gunther: "{thief}? A villain arc!"'],
  Chad:    ['Chad: "{thief} won? Chad counts it."', 'Chad: "Chad coached {thief}. Win 1001."', 'Chad: "{thief} got lucky. I got hair."'],
};
// Why the egg duel was lost, one card line (48 characters or fewer once filled). {sec} seconds behind, {name} the rival.
// tank: ran low on GAS while drilling. tier: {name}'s drill out-classed Kevin's. boss: {name}'s signature move did it.
// taps: not enough tapping.
export const DUEL_POSTMORTEM = {
  tank: ['Drilled on fumes. {sec} s short. Snack first!', 'Empty tank at the door. {name} had lunch.', 'GAS ran out mid-knock. Fruit before the egg!'],
  tier: ['Drum on THEIR side when {name} winds up.', '{name} out-drilled you. Thumb push-ups!', 'Out-drum {name}. Both thumbs, all the way.'],
  boss: ['{name}\'s big move cost you {sec} s. Block it!', 'Tap the side {name} wobbles to. Counter it!', '{name} pulled the move. You pulled a face.'],
  taps: ['Tap faster. Both thumbs, like a tiny drummer.', 'Your thumbs napped. {name} did not.', 'Tap like the egg owes you money.'],
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
  arrive:      ['Egg: "Oh! Visitors! I did not tidy."', 'Egg: "Hello! Is it Tuesday already?"', 'Egg: "One at a time, please! Oh no."', 'Egg: "Welcome! Mind the jelly coat."', 'Egg: "Guests! Shoes off, tails on."', 'Egg: "Oh my. A whole queue!"', 'Egg: "Hello! Kettle is not on yet!"'],
  kevinKnocks: ['Egg: "Who is it? Oh! A Kevin!"', 'Egg: "Coming! Just finding my keys."', 'Egg: "Ooh, that tickles! Go on!"', 'Egg: "A knock! My very first one!"', 'Egg: "Polite knock! Lovely!"', 'Egg: "Come in! Wait, not yet!"', 'Egg: "Knock louder, love! Nearly!"'],
  rivalKnocks: ['Egg: "{name}, I can see you!"', 'Egg: "Oh! {name}! Got a booking?"', 'Egg: "Gently, {name}! I am new."', 'Egg: "{name}, please stop shoving."', 'Egg: "{name}, the bell works too!"', 'Egg: "Wipe your tail, {name}!"', 'Egg: "{name}! Indoor voices!"'],
  kevinLeads:  ['Egg: "Kevin is first in the queue!"', 'Egg: "Lovely, Kevin! Nearly there!"', 'Egg: "Kevin, I saved you a cushion."', 'Egg: "Kevin! You are next in line!"', 'Egg: "Keep knocking, Kevin!"', 'Egg: "Kevin! I hear you! Go on!"', 'Egg: "Kevin, the door is wobbling!"'],
  rivalLeads:  ['Egg: "Kevin! {name} is nearly in!"', 'Egg: "{name} is knocking louder!"', 'Egg: "{name}, wait your turn!"', 'Egg: "Oh! {name} is so keen!"', 'Egg: "Kevin, louder than {name}!"', 'Egg: "{name} is nearly IN!"', 'Egg: "Hurry, Kevin! {name} rang!"'],
  kevinIn:     ['Egg: "Come in! Wipe your tail."', 'Egg: "Welcome home, little one."', 'Egg: "In you pop! The kettle is on."', 'Egg: "Make yourself at home!"', 'Egg: "Hello, you! Slippers?"', 'Egg: "In! Shut the door, love."', 'Egg: "There you are! Biscuit?"'],
  rivalIn:     ['Egg: "Sorry Kevin. {name} booked."', 'Egg: "{name} got in. Sorry, Kevin!"', 'Egg: "Next time, Kevin. I mean it."', 'Egg: "Door shut. Lovely try, Kevin!"', 'Egg: "So sorry, Kevin. Next egg!"', 'Egg: "{name} is in. Chin up!"', 'Egg: "Close one, Kevin. Truly!"'],
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
  3: ['SCOOCH', 'SORRY, STEVE', 'DOUG WAVED', 'GERALD WOBBLED', 'TIFFANY: NOTED', 'BEEP BEEP', 'SHIMMY', 'SIDLE PAST'],
  6: ['QUEUE JUMPER', 'CHAD SAW NOTHING', 'DIETER, ZOOM IN', 'FAST LANE', 'BROCK FELT THAT', 'RUDE. ALSO FAST.', 'WIGGLE WAGGLE', 'ZIG ZAG ZOOM'],
  10: ['COACH IS SCREAMING', 'WHISTLE BROKE', 'COACH LOST A SHOE', 'CLIPBOARD THROWN', 'COACH IS HOARSE', 'CROWD GOES WILD', 'DAD IS STANDING', 'TUBE IS SHAKING'],
  15: ['TAIL ON FIRE', 'SMOKE DETECTED', 'BLAZING TAIL', 'DAD SPILLED TEA', 'FULL WIGGLE', 'SIZZLING', 'TOASTY TAIL', 'THE TUBE IS WARM'],
  20: ['BROCK IS SHAKING', 'STEVE IS CLAPPING', 'TIFFANY TOOK NOTES', 'BROCK LOST COUNT', 'DOUG THE MACRO HID', 'CHAD CHECKED HAIR', 'GUNTHER IS JEALOUS', 'THE MACROS GASPED'],
  30: ['MENACE', 'TUBE MENACE', 'PUBLIC NUISANCE', 'NOISE COMPLAINT', 'ABSOLUTE CHAOS', 'TAIL TORNADO', 'WIGGLE WARLORD', 'HIDE THE KIDS'],
  45: ['COACH TRIED TO CRY', 'COACH NEEDS A HUG', 'DAD FAINTED', 'GRANDAD STOOD UP', 'THE EGG BLUSHED', 'MACROS FLED', 'STEVE SAID WOW', 'BRING A MOP'],
  60: ['MITOCHONDRIA MODE', 'TEXTBOOK DIAGRAM', 'DIETER ZOOMED IN', 'BIOLOGY CLASS NOW', 'NATURE IS AMAZED', 'THE EGG HEARD THAT', 'TAIL OF LEGEND', 'SCIENCE FAIR WIN'],
  100: ['ABSOLUTE UNIT', 'TINY LEGEND', 'MUSEUM WING NOW', 'STATUE ORDERED', 'KEVIN THE GREAT', 'HISTORY BOOKS', 'THE EGG IS WAVING', 'COACH ON A CHAIR'],
};

// A swim abandoned mid-tube (toast, 60 characters or fewer). Never says the streak was reset: a held freeze can save it.
export const ABANDONED_LINES = [
  'Left mid-tube. Coach is still holding your towel.',
  'Walked out mid-swim. Coach is sulking.',
  'Bailed in the tube. The tube is a bit hurt.',
];
// What one habit would have done for the swim you just lost. 48 characters or fewer once filled.
// {need} how far short, {gain} what the habit adds, {unit} the unit of both, {habit} the habit's name.
// enough: the habit alone would have covered it. short: it helps, but would not have covered it alone.
export const WOULD_HAVE_LINES = {
  enough: ['{need} {unit} short. One buy wins back {gain} {unit}.', 'Missed by {need} {unit}. Dad buys +{gain} {unit}. Egg.', 'Short {need} {unit}? Dad fixes that: +{gain} {unit}.'],
  short:  ['{need} {unit} short. This wins back {gain} {unit}.', '+{gain} {unit} of {need}. A start. Then another.', '+{gain} {unit} a level. Stack a few, Dad.'],
  // stack: {levels} more levels of the habit would cover the gap ({habit} optional). 48 characters or fewer once filled.
  stack:  ['{levels} more levels and that egg is yours.', 'Dad needs {levels} more levels. Easy.', '{habit}, {levels} more times. Then: egg.'],
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
  launch: 'Next: the Launch Tube. A million tails.',
  acid:   'Next: Acid Lagoon!',
  goo:    'Next: the Gate of Goo. Bring a towel.',
  sea:    'Next: the Womb Sea. Pink as a flamingo.',
  fork:   'Next: the Fork. No spoon in sight.',
  rapids: 'Next: Tube Rapids. Like a car wash.',
  egg:    'Next: THE EGG. She has a doorbell.',
};
// After a few dashes by button: the flick shortcut.
export const FLICK_TIP = 'Pro move: flick your thumb UP to dash.';
// A streak freeze WILL save the streak if you swim today. {n} is the streak length. Each line carries its own ❄.
export const FREEZE_LINES = [
  "❄ Dad's Sick Note is ready: swim today to keep your {n}-day streak",
  "❄ Missed a day? Dad's Sick Note saves your {n}-day streak. Swim!",
  '❄ Coach signed the note. One swim today and your {n}-day streak lives.',
];
// A streak freeze covered a missed day (toast, 44 characters or fewer, no ❄: the UI adds it).
export const FREEZE_USED_LINES = [
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
  lunge: 'Sidestep the pounce! A crouch means snap.',
  twins: 'Thread the twin Macros, or DASH pop one.',
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
    'Kevin #{n} pals with Steve. Macros like him.',
    'Kevin #{n} packs a decoy sandwich now.',
    'Kevin #{n} hides behind rivals. Like a coat.',
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
    'Kevin #{n} will not follow Chad. Or his mugs.',
    'Kevin #{n} can smell cinnamon a mile off.',
  ],
  late: [
    'Kevin #{n} did thumb push-ups until midnight.',
    'Kevin #{n} warmed up both thumbs. And a toe.',
    'Kevin #{n} practised knocking. Very fast.',
    'Kevin #{n} studied every rival wind-up.',
  ],
  lateRoute: [
    'Kevin #{n} set an alarm. Three alarms.',
    'Kevin #{n} skips the scenic route. And lunch.',
    'Kevin #{n} DASHES on the straights now.',
    'Kevin #{n} is leaving early. Like, now.',
  ],
  eggGas: [
    'Kevin #{n} saved a strawberry for the egg.',
    'Kevin #{n} packed a snack for the doorstep.',
    'Kevin #{n} arrives full. Belly first.',
    'Kevin #{n} kept a grape for the last stretch.',
  ],
};

// ================================================================ writer round: result card voices (main.js used to hardcode these)
// Result title when a named rival got in first, keyed by RIVALS first name. 22 characters or fewer.
export const STEAL_TITLES = {
  Steve:   ['STEVE SAID SORRY. WON.', 'STEVE GOT IN. OOPS!', 'SORRY! STEVE IS IN'],
  Brock:   ['BROCK BENCHED THE EGG', 'BROCK DID THE REP', 'BROCK IS IN, BRO'],
  Tiffany: ['TIFFANY CALLED IT', 'AS TIFFANY PREDICTED', 'TIFFANY: PAGE ONE'],
  Gunther: ['GUNTHER STUCK IT', "GUNTHER: IT'S A WRAP", 'CUT! GUNTHER IS IN'],
  Chad:    ['CHAD GOT IN. FOR REAL', 'CHAD: WIN 1,001', 'THE HAIR GOT IN'],
};
// Egg caption when Kevin stopped a nose from the egg (replaces 'Nose on the egg'). {pct} is how far he got (a whole
// number, never 100). 36 characters or fewer once filled.
export const NOSE_LINES = [
  'Could smell the kettle ({pct}%)',
  'Left a nose print on the egg ({pct}%)',
  'Nose on the doormat ({pct}%)',
  'Breathed on the doorbell ({pct}%)',
  'Read the welcome mat ({pct}% there)',
];
// Egg caption when Kevin reached the egg but lost the race (replaces 'You made it to the egg!'). 36 characters or fewer.
export const REACHED_EGG_LINES = [
  'Made it to the door! Knocked, too.',
  'Reached the egg! Rang the bell.',
  'At the egg! Shoes off at the door.',
  'You knocked on THE EGG. Wow.',
  'Got to the egg. The egg saw you.',
];
// Win card: the runner-up rival's voice, keyed by RIVALS first name, 6 each, 56 characters or fewer.
// Steve apologises, Brock rhymes, Tiffany cites, Gunther directs, Chad inflates numbers.
export const RIVAL_WIN_CARD = {
  Steve: [
    'Steve: "Sorry I was in your way! Congrats, buddy!"',
    'Steve: "You won! Here, my lucky pebble. Keep him!"',
    'Steve: "Drafting you was SO comfy. Thanks, buddy!"',
    'Steve: "CONGRATULATIONS! Is that too loud? Good!"',
    'Steve: "I said sorry to the egg for you. Well done!"',
    'Steve: "Lovely win! I brought you a balloon! Just one."',
  ],
  Brock: [
    'Brock: "Kevin won. Brock is done. Brock had fun."',
    'Brock: "The egg said yes. Brock is a mess."',
    'Brock: "You won the race. Brock hides his face."',
    'Brock: "Brock lost the fight. Kevin got it right."',
    'Brock: "Ten reps of clapping. All for you, Kevin."',
    'Brock: "Roses are red. Kevin got ahead."',
  ],
  Tiffany: [
    'Tiffany: "Source: page 9. You were lucky. Ibid."',
    'Tiffany: "2.1% likely. I packed a speech for 97.9%."',
    'Tiffany: "Citation: Kevin, et al. Annoyingly good."',
    'Tiffany: "Blog review: Kevin, five stars. I hate it."',
    'Tiffany: "I packed 12 speeches. None were for losing."',
    'Tiffany: "Peer reviewed. You won. I hate peer review."',
  ],
  Gunther: [
    'Gunther: "And CUT! Kevin, that take was perfect."',
    'Gunther: "Roll credits. Kevin gets top billing."',
    'Gunther: "Fan letter says Kevin was better. I wrote it."',
    'Gunther: "Hero shot! Chin up, Kevin. Hold it. Hold it."',
    'Gunther: "Print it. That is the ending we keep."',
    'Gunther: "Your win? 10 out of 10. Mine was an 11."',
  ],
  Chad: [
    'Chad: "Fine. Kevin 1, Chad 1,000. Still ahead."',
    'Chad: "Nice win, Kelvin. Sorry, Keith. Number Guy!"',
    'Chad: "Chad is printing mugs of this. Of Chad."',
    'Chad: "You won. Chad won the photo. Sign the mug."',
    'Chad: "That counts as half a Chad win. 1,000.5!"',
    'Chad: "New tee: I LET KELVIN WIN. One strawberry."',
  ],
};
// Win card for a photo finish (won by under 0.5 s), same keys, 2 each, 56 characters or fewer.
export const RIVAL_WIN_CARD_PHOTO = {
  Steve:   ['Steve: "Sorry, was that a tie? No? Well done!"', 'Steve: "So close! Best finish of my LIFE!"'],
  Brock:   ['Brock: "Photo finish. Brock feels diminished."', 'Brock: "One hair ahead? Brock needs his bed."'],
  Tiffany: ['Tiffany: "0.3 s. Source: the replay. I checked."', 'Tiffany: "Margin of error. I demand a recount."'],
  Gunther: ['Gunther: "Freeze frame! Is that a nose? CUT!"', 'Gunther: "Slow it down. Slower. Fine, he won."'],
  Chad:    ['Chad: "Photo finish? Chad won the photo. 10 to 1."', 'Chad: "By a nose? Chad\'s nose is worth 1,000 wins."'],
};

// ================================================================ Act 2 chapters, Act 3 (60 characters or fewer per line)
// One 3-line chapter per generation 11 to 18 (index gen - 11). Each sets up that gen's ACT2_CLUES line, which the UI
// shows right after it as the punchline. {heir}, {grandad} and {gen} are allowed.
export const ACT2_CHAPTERS = [
  ['Generation {gen}. Chad Jr. joins the queue, next to Chad.', 'Chad Jr. says his dad wins "every single time".', '{heir} told the Kevins: ask Chad nicely. For details.'],
  ['Chad is back with a big leather book. "Proof," he says.', 'It smells of old shoeboxes. {grandad} sneezed politely.', 'Most pages are Chad pulling faces in puddles. Except one.'],
  ['The Kevins found the book left under the start line.', 'Under the egg photo: tiny, wobbly, faded handwriting.', 'Tiffany got out a magnifying glass. She read it aloud.'],
  ['A Kevin asked Chad the obvious question: "And win 2?"', 'Chad went very quiet. Then very loud. Then quiet again.', '{heir} handed him a tissue and a strawberry.'],
  ['Chad left the book open at the start line. Page one.', 'Coach Gonad came over to blow the whistle for gen {gen}.', 'He looked down. Nobody had ever seen him go pale.'],
  ['Coach would not talk about page one. So the Kevins peeked.', 'Page two had been stuck to page one. With very old jam.', '{heir} peeled it apart, slowly, with a butter knife.'],
  ['The Kevins asked Chad about the baby in the bib.', 'Chad checked his hair in a puddle. For a long time.', 'Then, for once, Chad did not make up a number.'],
  ['{grandad} found Coach Gonad alone at the start line.', 'He had a cloth, a tin of polish and a faded race number.', '{grandad} asked: "When will you tell them, Coach?"'],
];
// Shown on a loss in Act 2 at that many swims since generation 10 began: [swims, line], 48 characters or fewer.
// Hints only, never what ACT2_CLUES says.
export const ACT2_LOSS_CLUES = [
  [3, 'Chad hums the family song. It has one verse.'],
  [8, 'Chad says the family trophy shelf is "huge".'],
  [15, 'Coach Gonad avoids Chad now. Nobody knows why.'],
  [25, 'Chad wiped a smudge off an old photo. He sighed.'],
  [40, 'The Thundertails toast an empty chair. Yearly.'],
  [60, 'Coach and Chad swam to the start in silence.'],
];
// Act 3 (generations 21 to 28): [gen, line]. Every egg is brand new, yet each one says 'welcome home'.
export const ACT3_CLUES = [
  [21, 'Every egg is brand new. Yet each one says "welcome home".'],
  [22, 'A Kevin asked the egg how she knew. "Mum told me," she said.'],
  [23, 'Each egg is the daughter of the last. A family business.'],
  [24, 'Inside, there is a guestbook. Every winning Kevin signed it.'],
  [25, 'The ink gets older page by page. It goes back for ages.'],
  [26, 'Page one has one name, in big proud letters: THAD.'],
  [27, 'Under it, in pencil: "Saving a spot for #999,999."'],
  [28, 'Coach Gonad has never once been inside. Not even a peek.'],
];
// Generation 29: the end of Act 3. The UI makes the last line the tap line.
export const ACT3_FINALE = [
  'Generation 29. Coach Gonad swims to the front of the queue.',
  '"Just once," he says. "Just to see what the fuss is about."',
  'Every Kevin cheers as Coach, #999,999, knocks on the egg.',
  'Egg: "Coach? Mum said you were always one place ahead."',
  'She opens the guestbook. Under the very first name: a space.',
  'Egg: "The pencil? Dad wrote it, gen 1. Thad told him to."',
  'Egg: "The doorbell is Dad too. He beatboxed it for luck."',
  'Coach signs it. Then he blows the whistle. "Next Kevin! GO!"',
];

// ================================================================ writer round: this round's systems features
// Max-level mutation capstones, keyed by mutation id. name: the capstone, line: 40 characters or fewer, what it does
// with a joke (systems owns the numbers; the line names the effect, never a number).
export const MUTATION_CAPSTONES = {
  turbo:  { name: 'Torpedo', line: 'Dash past a rival for an extra link.' },
  tank:   { name: 'Camel Hump', line: 'Half a tank or more? Swim faster. Lumpy.' },
  helmet: { name: 'Hard Hat', line: 'A broken shield knocks the crowd back.' },
  draft:  { name: 'Leech', line: 'Drafting feeds your combo. Rude. Comfy.' },
  magnet: { name: 'Black Hole', line: 'Long-range grabs count as near misses.' },
  sweet:  { name: 'Fruit Bat', line: 'Fruit in FRENZY stretches it. Burp.' },
  eco:    { name: 'Hibernator', line: 'FRENZY burns no GAS at all. Snore.' },
  memory: { name: 'Elephant Brain', line: 'In FRENZY your combo never runs dry.' },
  whip:   { name: 'Lightning Rod', line: 'Pass a rival mid-DASH: DASH is back!' },
  lucky:  { name: 'Four-Leaf Tail', line: 'Every DNA grab adds a combo link.' },
};
// Pop when goo slows Kevin down (10 characters or fewer).
export const GOO_LINES = ['STICKY!', 'GLOOPED!', 'GUMMED UP!', 'SPLODGE!'];
// A rival spat back out of a Big Macro, keyed by RIVALS first name (40 characters or fewer).
export const RIVAL_COMEBACK_EATEN = {
  Steve:   'Steve: "Spat out! Sorry, was I chewy?"',
  Brock:   'Brock: "Spat out. Too much muscle."',
  Tiffany: 'Tiffany: "Spat out. Citation: inedible."',
  Gunther: 'Gunther: "Spat out! Did we get that?"',
  Chad:    'Chad: "Spat out. The hair was too much."',
};

// ================================================================ writer round: swim 1, new mechanics, Act 3, the egg duel
// Nobody has steered for a while on swim 1 (40 characters or fewer).
export const IDLE_NUDGE = [
  'Hello? Kevin needs your thumb!',
  'Drag your thumb. Kevin will follow.',
  'Kevin is wiggling on his own. Help!',
  'Coach is tapping his watch. Steer!',
  'Psst! Slide left and right. Go on!',
];
// Where the DASH button is, for a player who has not found it yet.
export const DASH_WHERE = 'The pink button! Bottom right!';
// Swim 1 replaces ZONE_LINES_SHORT.launch with these: steering and fruit only, no drafting (44 characters or fewer).
export const ZONE_LINES_SHORT_FIRST = {
  launch: [
    'Drag to steer. Kevin goes where you go.',
    'Fruit = GAS. Eat every berry you see!',
    'Steer into the fruit. Your tail says ta.',
    'Swerve past them. Only 999,999 to go!',
  ],
};
// The daily swim has no autopilot: shown where the sat-nav toggle would be.
export const AUTOPILOT_DAILY_LINES = [
  'The sat-nav sits out the daily. Your tail, your medal.',
  'No autopilot today. Coach wants YOUR wiggle.',
  'Daily swim, hand steering only. Dad is watching.',
];
// Pop when Kevin bonks a stunned (napping) swimmer: it does no harm.
export const STUN_BONK_LINES = ['BOING!', 'Rude, but harmless.', 'He is seeing stars.', 'Bonked a napper!'];
// The combo strip's link chips: kind -> [LABEL, colour]. One source for render.js and main.js.
export const LINK_CHIP = { pass: ['PASS', '#fff4f8'], rival: ['RIVAL', '#ffd75c'], close: ['CLOSE', '#5ce1ff'], dodge: ['DODGE', '#5ce1ff'], gate: ['THREAD', '#d9b8ff'],
  draft: ['DRAFT', '#b8f0ff'], slingshot: ['SLING', '#ffd75c'], weave: ['WEAVE', '#7dffb0'], snipe: ['SNIPE', '#ff8fc8'], bump: ['BUMP', '#ffb36b'],
  pop: ['POP', '#f4eef7'], domino: ['DOMINO', '#ffd75c'], sugar: ['FRUIT', '#7dffb0'], dna: ['DNA', '#ff8be0'], trick: ['TRICK', '#ffd75c'], cash: ['CASH', '#7dffb0'], bonk: ['BONK', '#d9b8ff'] };

// ================================================================ Act 3 (generations 20 to 29), 60 characters or fewer per line
// Gen 20: the Thundertails and the Kevins are one family now. The mystery: what is inside the egg?
export const GEN20_INTRO = [
  'Generation 20. Thundertails and Kevins: one big family now.',
  'Chad sits with the Kevins at lunch. He shares his hair gel.',
  'Coach Gonad stares at the egg. "What is actually in there?"',
  '"I have coached every Kevin, every swim. I never looked."',
];
// One 3-line chapter per generation 21 to 28 (index gen - 21). Each sets up that gen's ACT3_CLUES line, which the UI
// shows right after it as the punchline. {heir}, {grandad} and {gen} are allowed.
export const ACT3_CHAPTERS = [
  ['Generation {gen}. A Kevin wins and pops his head inside.', 'The egg says two words. The Kevins write them down.', '{heir} checks the notes from every old win. Same words.'],
  ['The Kevins hold a meeting. Item one: the welcome mat.', '"How does a brand new egg know us?" asks {heir}.', 'Generation {gen} sends its bravest Kevin to ask. Politely.'],
  ['"Mum told me"? The Kevins needed a whiteboard for that.', 'Tiffany brought three. And a pointer. And a family tree.', 'She drew one egg, then another, then a long, long line.'],
  ['Generation {gen}. The winning Kevin has a proper look round.', 'A coat hook. A tiny kettle. A shelf with one big book.', 'It has a pen on a string. Very official.'],
  ['{heir} asks the next winner to read the book. Carefully.', 'He finds {grandad} in it. Then older names. Then older.', 'He licks a finger and keeps turning. And turning.'],
  ['Generation {gen}. Chad insists on doing the reading.', '"Family business," he says, and swims in with a torch.', 'He turns to the very first page and goes very quiet.'],
  ['Chad cries. Real tears. He says it is hair gel.', 'Then he squints. There is more on page one.', 'Something small, in pencil, written very gently.'],
  ['The Kevins show Coach the page. He reads it very slowly.', 'He blows his whistle, very softly, at nobody.', '{grandad} asks what every Kevin is thinking.'],
];
// Shown on a loss in Act 3 at that many swims since generation 20 began: [swims, line], 48 characters or fewer.
// Hints only, never what ACT3_CLUES says.
export const ACT3_LOSS_CLUES = [
  [3, 'The egg hums a tune. Every Kevin knows it.'],
  [8, 'It is the Kevin theme song. The egg is off key.'],
  [15, 'Coach ate his "for the last one" strawberry.'],
  [25, 'He ate it at the egg wall. Then he swam off.'],
  [40, "The egg's doorbell plays Dad's beatbox. Odd."],
  [60, 'Boots and cats from inside. Dad? Is that you?'],
];

// ================================================================ the egg duel's cast
// Banner when a rival arrives at the egg mid-duel. {name} is a first name: the text after it is 19 characters or fewer.
export const EGG_JOIN_LINES = ['{name} JOINS THE FIGHT!', '{name} CRASHES THE PARTY!', '{name} WANTS IN!', '{name} IS HERE!'];
// A rival's entrance at the egg, keyed by RIVALS first name, 40 characters or fewer.
export const RIVAL_EGG_ENTRANCE = {
  Chad:    ['Chad: "Relax, everyone. Chad is here."', 'Chad: "Egg! It is me! You know me!"', 'Chad: "Puddle says I look ready. GO."'],
  Tiffany: ['Tiffany: "Arrived on schedule. Duh."', 'Tiffany: "Arrival odds: 88%. Called it."', 'Tiffany: "As predicted. Move over."'],
  Brock:   ['Brock: "Brock is here. Brock is ready."', 'Brock: "Egg day is leg day, bro."', 'Brock: "Egg, Brock is near. No fear."'],
  Gunther: ['Gunther: "Big entrance! Roll camera!"', 'Gunther: "Cue music. The star is here."', 'Gunther: "Make room! This is my shot!"'],
  Steve:   ['Steve: "Is this the egg? She is LOVELY!"', 'Steve: "Room for one more? Sorry!"', 'Steve: "Hi, egg! I brought you a card!"'],
};
// Your nemesis reaches the egg with you: the grudge duel. Same keys, 4 each, 40 characters or fewer.
export const RIVAL_NEMESIS_FINALE = {
  Chad:    ['Chad: "You again. The hair remembers."', 'Chad: "This time Chad wins for real."', 'Chad: "The hair is watching. Always."', 'Chad: "Mugs say I win. Mugs never lie."'],
  Tiffany: ['Tiffany: "Chapter 13, last page: you."', 'Tiffany: "I modelled you. 43 graphs."', 'Tiffany: "Final chapter. I wrote it."', 'Tiffany: "Rematch odds: me. Obviously."'],
  Brock:   ['Brock: "Kevin. Brock trained for you."', 'Brock: "Last set. You and Brock. GO."', 'Brock: "One more rep. One more Kevin."', 'Brock: "Brock wrote this verse for you."'],
  Gunther: ['Gunther: "Final duel! Moody lighting!"', 'Gunther: "You and me. The sequel ends."', 'Gunther: "Dieter, this is the big one."', 'Gunther: "Final take. No stunt doubles."'],
  Steve:   ['Steve: "Just us again, best friend!"', 'Steve: "I made us matching bibs. Ready?"', 'Steve: "Sorry in advance, best friend!"', 'Steve: "Mum is watching! Big day!"'],
};
// A Big Macro swallows that rival. Same keys, 2 each, 40 characters or fewer.
export const RIVAL_EATEN = {
  Chad:    ['Chad: "Not the HAIR! Anything but that!"', 'Chad: "Chad is not eaten. Chad visits."'],
  Tiffany: ['Tiffany: "Odds of eaten: 2%. Oh. OH."', 'Tiffany: "Eaten. Page 400 warned me."'],
  Brock:   ['Brock: "Brock is lunch. Brock is fit."', 'Brock: "Bro. BRO. It is dark in here."'],
  Gunther: ['Gunther: "Keep rolling! Inside shot!"', 'Gunther: "Where is my stunt double?!"'],
  Steve:   ['Steve: "Oh! Comfy in here! Hi, Macro!"', 'Steve: "Gulped! Sorry about the crumbs!"'],
};

// ================================================================ result goals and Kevin's thoughts
// A flavour line under NEXT_GOAL_LINES, same keys and slots. 26 characters or fewer before filling.
export const NEXT_GOAL_FLAVOR = {
  combo:     ['{n} passes, no breaks.', 'String {n} together!', 'Make Coach count to {n}.'],
  reachZone: ['{zone} is calling.', 'Postcard from {zone}?', 'Wave at {zone} for Coach.'],
  beatRival: ['{name} is getting smug.', 'Wipe the grin off {name}.', '{name} needs humbling.'],
  reachEgg:  ['Go ring her doorbell.', 'Knock knock, Kevin.', 'The egg left a light on.'],
  winEgg:    ['In you pop, Kevin.', 'Get IN. Coach has cake.', 'The door is open. Ish.'],
  trick:     ['Coach wants a {trick}.', 'The camera is rolling.', 'Show off. Properly.'],
  margin:    ['Not a nose. A mile.', 'No photo finish this time.', 'Make it look easy.'],
  sweep:     ['Five rivals. Zero mercy.', 'Everyone. Even Steve.', 'Chad will need a chair.'],
};
// Kevin's own thought bubble in the race, 28 characters or fewer. One persona: an anxious optimist, very proud of
// being swimmer #1,000,000 (worried first, then he talks himself up).
export const KEVIN_THINKS = {
  firstPass:  ['One down. 999,998 to go.', 'Did I just... pass?!', 'I am a natural. Or lucky.', 'Dead last? Dead FAST.', 'Not last! Write that down!',
               'Number 1,000,000 moves up!', 'Was that rude? Too late!', 'Keep calm. Keep passing.'],
  passChad:   ['Passed Chad! Hair and all.', 'Sorry, Chad. Not sorry.', 'Smelled like hair gel.', 'I passed a LEGEND? Gulp.', 'Chad blinked. I did not.',
               'Do I get a mug for that?', 'Chad: 1000 wins. Me: 1 pass.', 'Hair: great. Me: greater?'],
  nearMiss:   ['Eep. That was close.', 'My tail is doing the shakes.', 'Nobody saw that. Steve did.', 'Planned that. Totally.', 'Still here! Still Kevin!',
               'Heart says no. Tail says GO.', 'I will panic later. Busy.', 'Eep! Okay. Okay. Wiggle.'],
  lowGas:     ['Tummy rumbling. Fruit?', 'Running on fumes here.', 'Need a strawberry. Now.', 'Tank says no. I say snack.', 'Is that a berry? Please?',
               'Must... find... fruit.', 'I can do this. With grapes.', 'Running low. Spirits high.'],
  frenzy:     ['I AM THE TUBE NOW.', 'Everything is SO LOUD.', 'Wheee! Do not stop me!', 'Is this allowed? YES!', 'Number 1,000,000 ON FIRE!',
               'Scary! Amazing! Scary!', 'Am I the main character?', 'Do not panic. Do PARTY.'],
  macroClose: ['Big hum. Big mouth. Nope.', 'Not lunch. Not lunch!', 'Is it humming at ME?', 'I am mostly tail. Crunchy.', 'Too stringy to eat. Right?',
               'Nice Macro. Good Macro.', 'Smile. Swim. Do not wave.', 'Not today, big fella!'],
  eggArrive:  ['She is SO round.', 'Hi. I am Kevin. Hello.', 'Do I knock? I will knock.', 'Hi, egg. I rehearsed this.', 'Number 1,000,000 reporting!',
               'Dead last to front door!', 'Be cool. Be cool. HI, EGG!', 'Wow. Okay. Big moment. Wow.'],
};

// ================================================================ writer round: rematches, revenge, tough days, first win
// Said as a rematch swim against that rival starts, keyed by RIVALS first name. 3 each, 40 characters or fewer.
export const RIVAL_REMATCH_OPEN = {
  Steve:   ['Steve: "A rematch! Best day EVER!"', 'Steve: "A rematch? Lovely! I will win."', 'Steve: "Mum packed me revenge snacks!"'],
  Brock:   ['Brock: "Round two. Rep one. Ready, bro."', 'Brock: "Brock wrote a poem. A threat."', 'Brock: "Same tube. New verse. Fear me."'],
  Tiffany: ['Tiffany: "Rematch odds: 70% me."', 'Tiffany: "I took notes on you. Many."', 'Tiffany: "Rematch modelled. You lose."'],
  Gunther: ['Gunther: "Take two! Camera, ROLL!"', 'Gunther: "The sequel. Bigger. Louder."', 'Gunther: "Frame Kevin losing. Go wide."'],
  Chad:    ['Chad: "Rematch. Chad was warming up."', 'Chad: "Last time did not count. GO."', 'Chad: "Did you tell anyone? Good. GO."'],
};
// Kevin won the rematch: that rival is a sore loser about it. Same keys, 3 each, 40 characters or fewer.
export const REVENGE_LINES = {
  Steve:   ['Steve: "Fair and square! Hug it out?"', 'Steve: "Good game! I can hum now!"', 'Steve: "Sorry for wanting it SO much."'],
  Brock:   ['Brock: "Revenge is a cold shake, bro."', 'Brock: "Brock falls. Does a push-up."', 'Brock: "Lost the race. Brock lost face."'],
  Tiffany: ['Tiffany: "Statistically a fluke. Ugh."', 'Tiffany: "You are cut from the sequel."', 'Tiffany: "Blog post: Fluke Of The Year."'],
  Gunther: ['Gunther: "Burn that tape. All of it."', 'Gunther: "That was the blooper reel."', 'Gunther: "My score: 4 out of 10. Harsh."'],
  Chad:    ['Chad: "Well done, Kelvin. KEVIN. Sure."', 'Chad: "Still 1000 to 2. Chad leads."', 'Chad: "Do not tell the hair. It sulks."'],
};
// Big title when Kevin beats the rival who beat him last time (20 characters or fewer).
export const REVENGE_TITLES = ['PAYBACK!', 'SCORE SETTLED!', 'REVENGE, SERVED!', 'SWEET REVENGE!'];
// The sympathy floor: a rough swim still pays a little. Receipt label (18 characters or fewer) and a warm caption
// (60 characters or fewer).
export const TOUGH_DAY_LABEL = "Dad's sympathy";
export const TOUGH_DAY_LINES = [
  'Rough swim. Dad slipped a little extra in your pocket.',
  'Tough day in the tube. The factory sent a care package.',
  'Dad saw that. He topped up the jar. No speeches.',
  'Coach passed the hat round. The Kevins chipped in.',
  'Bad swim, good Dad. He rounded your DNA up. Way up.',
  'Steve heard. Steve sent a card. And a little DNA.',
  'The tube was mean today. Dad is being extra nice.',
  'Nobody wins them all. Dad put a bit aside, just in case.',
];
// The first baby of a save: the jackpot line (60 characters or fewer).
export const FIRST_WIN_LINES = [
  'YOUR FIRST BABY! The factory rang every bell it owns.',
  'A real person! Dad hugged the broccoli. Twice.',
  'First win ever! Coach Gonad swallowed his whistle.',
  'A baby! Grandad told the whole bingo hall. By megaphone.',
];
// Heading over a mutation draft after the first (40 characters or fewer).
export const CARDS_LINE_MORE = [
  'Pick one. Evolution has a deadline.',
  'Choose wisely. Or quickly. Quickly!',
  'Three cards. One tail. No refunds.',
  'Darwin took ages. You get seconds.',
  'Mutate now. Apologise later.',
  'Tap one. The tail is getting ideas.',
];

// ================================================================ writer round: family heirs, the egg after Act 3, duel barks, UI chips
// First race of a new generation once Act 2 is told (main.js reads it when S.act2Seen): the rival heirs now know every
// Kevin win is a Thundertail win, so the families are cousins. Same keys and slot as RIVAL_HEIR_LINES, 48 or fewer filled.
export const RIVAL_HEIR_LINES_KIN = {
  Steve:   ['A new Steve. Hugs every Kevin. Cousins!', '{name} made name tags: COUSIN. Sorry!'],
  Brock:   ['A new Brock. Spots his Kevin cousins. Free.', '{name} calls the Kevins bro-cousins.'],
  Tiffany: ['A new Tiffany. She drew the family tree.', '{name}: "We are 3% cousins. Ugh. Hi."'],
  Gunther: ['A new Gunther. Filming the family reunion.', '{name} wants every cousin in the shot.'],
  Chad:    ['{name} calls the Kevins cousins. Loudly.', 'A new Thundertail. Hugs Kevins like a wet sock.'],
};
// THE EGG after Act 3's finale (main.js reads it when S.act3Seen; a missing key keeps EGG_VOICE's). Same keys, lengths
// and 'Egg: ' prefix as EGG_VOICE: she has a guestbook, a pen on a string, and Coach has been inside now.
export const EGG_VOICE_AFTER = {
  arrive:      ['Egg: "Hi! Guestbook is by the door."', 'Egg: "Welcome! Coach says hi!"', 'Egg: "Hi! Mind the guestbook."'],
  kevinKnocks: ['Egg: "A Kevin! Coach said so!"', 'Egg: "I know that knock! Family!"', 'Egg: "Coming! Untangling the pen."'],
  rivalKnocks: ['Egg: "{name}! Coach says hi. Wait!"', 'Egg: "Easy, {name}! Mind the pen."', 'Egg: "{name}, sign in first!"'],
  kevinLeads:  ['Egg: "Kevin! Uncap the pen!"', 'Egg: "Your page is ready, Kevin!"', 'Egg: "Coach is cheering, Kevin! GO!"'],
  rivalLeads:  ['Egg: "Kevin! {name} wants the pen!"', 'Egg: "{name} found the guestbook!"', 'Egg: "Hurry, Kevin! Coach says GO!"'],
  kevinIn:     ['Egg: "In! Sign under Coach, please."', 'Egg: "Home! Pen is on a string."', 'Egg: "Coach says hi. He signed!"', 'Egg: "Guestbook open. Hi, Kevin!"'],
  rivalIn:     ['Egg: "{name} signed. Sorry, Kevin!"', 'Egg: "Next time! Coach says hi."', 'Egg: "I saved you a page, Kevin."'],
};
// Short barks over a rival's head in the egg duel, keyed by RIVALS first name. tell: winding up the move; hit: the move
// landed; countered: Kevin blocked it; arrive: they reach the egg; lose: Kevin takes the lead. 3 each, 16 characters or
// fewer, no speaker prefix, no quotes.
export const RIVAL_EGG_BARKS = {
  Steve: {
    tell:      ['SORRY IN ADVANCE', 'SORRY! MY TURN!', 'PRE-SORRY!', 'SORRY! SHOVING!', 'MUM, WATCH THIS!', 'PEBBLE, WATCH!', 'OOPS. NOT SORRY'],
    hit:       ['WORKED? SORRY!', 'OH NO! SORRY!', 'SORRY! IT WORKED', 'I DID IT! SORRY', 'SO SORRY! YAY!', 'DOUG, YOU SAW?!', 'SORRY! BEST DAY!'],
    countered: ['SORRY I TRIED!', 'GOOD BLOCK!', 'FAIR! SO FAIR!', 'I DESERVED THAT', 'SORRY! MY BAD!', 'MUM WILL BLOG IT', 'YOU ARE SO GOOD!'],
    arrive:    ['HI, EGG! HELLO!', 'SORRY I AM LATE!', 'NICE DOOR, EGG!', 'DOUG, WE MADE IT', 'SORRY! HI! SORRY', 'I HAVE 9 SOCKS!', 'MAY I COME IN?'],
    lose:      ['EARNED IT! SORRY', 'AW. WELL DONE!', 'SORRY! GO ON!', 'I LIKE YOUR TAIL', 'HUG AFTER?', 'SORRY I WAS SLOW', 'YOU WIN! SORRY!'],
  },
  Brock: {
    tell:      ['SPOT ME, GERALD', 'MAX REP! HUP!', 'BIG LIFT, BRO!', 'REP TEN! HUP!', 'LIFT AND SHIFT!', 'CHALK UP, BRO!', 'HEAVE, BELIEVE!'],
    hit:       ['LIGHT WEIGHT!', 'REP COUNTED!', 'YEAH BUDDY!', 'NEW PR, BRO!', 'FLEX AND WRECKS!', 'THE SHAKE CLAPS!', 'BROCK ROCKS!'],
    countered: ['BRO. MY REP.', 'NO SPOTTER?!', 'GAINS DENIED', 'SPOT FAILED!', 'BAR SLIPPED, BRO', 'REP: VOID. NOO!', 'NO REP! NO REP!'],
    arrive:    ['BROCK IS HERE!', 'EGG DAY, BRO!', 'EGG DAY. LEG DAY', 'EGG, MEET BROCK', 'PUMPED. ARRIVED.', 'ROSES ARE RED!', 'HERE FOR A REP!'],
    lose:      ['BRO. BRO. NO.', 'SAD. NO RHYME.', 'SHAKE, NO! SORRY', 'BROCK... BROKE.', 'SPOT ME. EMOTION', 'NO! MY GAINS!', 'DEFEAT? REPEAT.'],
  },
  Tiffany: {
    tell:      ['SEE PAGE 12!', 'CITATION TIME!', 'AS PREDICTED...', 'FOOTNOTE TIME!', 'PAGE 88: SHOVE', 'MAP 7 OF 40: GO!', 'PACKED 40 PENS!'],
    hit:       ['CITED! 94%!', 'TEXTBOOK!', 'PER MY NOTES!', 'AS CITED! 97%!', 'PAGE 40: RIGHT!', 'FIVE STARS. ME.', 'PEER REVIEWED!'],
    countered: ['NOT IN THE BOOK', 'THAT WAS 3%!', 'ERRATUM?!', 'OUTLIER?!', 'ODDS WERE 2%!', 'PAGE 88 LIED!', 'SPARE PLAN: GONE'],
    arrive:    ['ON SCHEDULE.', 'ETA: CORRECT.', 'CHAPTER 20: ME', 'AS FORECAST.', 'PAGE 1: ARRIVE', 'BROUGHT 3 PENS.', 'BLOG POST: HERE!'],
    lose:      ['RECALCULATING', 'THE ODDS! NO!', 'BOOK WAS WRONG?!', 'ONE STAR REVIEW!', 'WRONG CHAPTER?!', 'SEE APPENDIX. NO', '12%?! NO NO NO'],
  },
  Gunther: {
    tell:      ['ROLL CAMERA!', 'CLEAR THE SET!', 'BIG STUNT, GO!', 'SCORE THIS: 10!', 'WIDE SHOT! WIDE!', 'LIGHTS! CAMERA!', 'ZOOM IN. ZOOM!'],
    hit:       ['NAILED IT!', 'PRINT IT!', 'SLOW-MO THAT!', 'CAMERA, GOT IT?!', 'ONE TAKE! WOW!', 'THAT IS A WRAP!', 'PERFECT 10! ME!'],
    countered: ['CUT! CUT!', 'ZERO POINTS?!', 'DELETE THAT!', 'THAT WAS A 2/10', 'BLOOPER REEL!', 'FANS WILL RIOT!', 'FROM THE TOP!'],
    arrive:    ['MY ENTRANCE!', 'CUE THE MUSIC!', 'STAR ARRIVING!', 'CAMERA, FOLLOW!', 'MY BEST ANGLE!', 'ENTER: GUNTHER', 'A FAN SENT CAKE!'],
    lose:      ['PLOT TWIST?!', 'NOT IN SCRIPT!', 'FANS, LOOK AWAY!', 'CUT IT! CUT IT!', 'THAT WAS A 3/10', 'DO NOT FILM THIS', 'SEQUEL! SEQUEL!'],
  },
  Chad: {
    tell:      ['THE HAIR SAYS GO', 'MUG SALE AFTER!', 'ONE SEC. PUDDLE.', 'CHECKING MY GLOW', 'MERCH CAM: ON!', 'FOR UNCLE THAD!', 'POSE. THEN SHOVE'],
    hit:       ['THE HAIR NODDED!', 'HAIR APPROVES!', 'MUG-WORTHY!', 'PUDDLE SAW THAT!', 'PUT IT ON A MUG!', 'STUNNING. AGAIN.', 'SEE THAT, KEITH?'],
    countered: ['THE HAIR!', 'HAIR IS UPSET!', 'MERCH RECALLED!', 'NOT MY ANGLE!', 'I WAS POSING!', 'DID SHE SEE?!', 'BLOCKED BY KEITH'],
    arrive:    ['CHAD IS HERE!', 'THE HAIR ARRIVES', 'AFTER YOU, HAIR', 'MIRROR EGG? HI!', 'IS MY GLOW OK?', 'MUGS ARE SIGNED!', 'RELAX. CHAD.'],
    lose:      ['RECOUNT, RECOUNT', 'NOT THE HAIR!', 'HAIR, LOOK AWAY', 'MUGS: HALF OFF!', 'BAD LIGHTING!', 'MY PUDDLE LIED', 'STILL COUNTS!'],
  },
};
// Coach, after two slow upward flicks that did not dash (40 characters or fewer).
export const FLICK_HARDER = [
  'Faster flick! Like flicking a crumb. Up!',
  'Snappier! Flick it like a pea. UP!',
  'Quick flick UP! Like shooing a fly.',
];
// The daily swim button before it unlocks.
export const DAILY_LOCKED = 'Opens after your first baby or 5 swims';
// New-record chips on the result screen, by record kind (2 each, 32 characters or fewer). Also merged into the old
// RECORD_LINES array below (RECORD_LINES.margin etc.), so both K.RECORD_CHIP_LINES.x and K.RECORD_LINES.x work.
export const RECORD_CHIP_LINES = {
  margin:    ['Biggest win gap yet. Bye-bye!', 'Won by a mile. Coach measured.'],
  combo:     ['Longest combo yet. Brock flexed.', 'Best chain yet. The tube shook.'],
  winT:      ['Fastest egg yet. Dad timed it.', 'New speed record. Zoom, baby.'],
  dna:       ['Biggest DNA haul. Dad gasped.', 'Record DNA! The factory cheered.'],
  winStreak: ['Most wins in a row. Egg says hi.', 'Win streak record. Egg-cellent.'],
  sweep:     ['Beat every big name. Flawless.', 'All five, beaten. Chad sulks.'],
  streak:    ['Longest daily streak. Hero.', 'Best streak yet. Coach saluted.'],
};
Object.assign(RECORD_LINES, RECORD_CHIP_LINES);
// Several milestones in one swim ({n} how many). 18 characters or fewer once filled.
export const MULTI_MILESTONE = ['x{n} MILESTONES!', '{n} RECORDS! WOW!', '{n} AT ONCE?!'];
// Swim 1's first dodged Big Macro, the set piece (14 characters or fewer).
export const DODGED_SETPIECE = ['NOPE! DODGED!', 'NOT LUNCH!', 'MISSED ME!'];

// ================================================================ writer round: onboarding, combo beats, egg finale voices, Act 4, system copy
// The first deal of a swim: a short plain description per common and rare card (6 words or fewer, no percentages).
// Shown instead of MUTATIONS[id].desc on deal 1, before the drafting lesson, so it never says 'draft'.
export const FIRST_DEAL_DESC = {
  turbo:   'Tail goes a bit faster. Zoom.',
  tank:    'Bigger GAS tank. Free refill too.',
  helmet:  'A hard hat. Blocks one hit.',
  draft:   'Hiding behind rivals pays better.',
  magnet:  'Snacks drift over from further. Lazy.',
  sweet:   'Fruit fills more GAS. Yum.',
  antacid: 'Acid stings less. Still dodge it.',
  eco:     'GAS lasts a bit longer. Snooze.',
  memory:  'Combos hang on a bit longer.',
  whip:    'DASH comes back sooner. Costs less.',
  slick:   'Close shaves pay combo and GAS.',
  lucky:   'More DNA blobs. Bigger ones too.',
  ram:     'Bonk rivals aside. Get paid.',
  rush:    'Every overtake refills a little GAS.',
  hype:    'FRENZY comes sooner and lasts longer.',
  goo:     'Goo slows you way less. Wheee.',
  wingman: 'Buddy takes one hit per zone.',
  nose:    'Smells the right tube. Big arrow.',
  bloom:   'Faster after every zone you clear.',
  echo:    'A dropped combo keeps half.',
  glassCannon: 'Much faster. No shields, though.',
  sugarCrash:  'Fruit fills lots. GAS drains faster.',
  allIn:       'Combos grow faster. Drops cost GAS.',
  hotHead:     'FRENZY comes early. Ends sooner.',
};

// Overclock pops, indexed by stack 1 to 4 minus 1, rising disbelief (20 characters or fewer).
export const OVERCLOCK_LINES = [
  ['TAIL AT 110%', 'OVERCLOCKED!', 'WIGGLE TURBO: ON', 'EXTRA RPM!'],
  ['FLAGELLUM REDLINING', 'TAIL IS SMOKING', 'IS THIS SAFE?', 'COACH CHECKS NOTES'],
  ['DAD FELT THAT', 'GRANDAD WOKE UP', 'THE TUBE IS SCARED', 'IS THAT LEGAL?!'],
  ['LAB COATS SWEATING', 'SCIENCE SAYS NO', 'BIOLOGY FILED A BUG', 'TAIL LEFT ORBIT'],
];
// A medley: every kind of move in one chain, a full routine (20 characters or fewer).
export const MEDLEY_LINES = ['FULL ROUTINE!', 'ONE-SPERM SHOW!', 'VARIETY HOUR!', 'THE WHOLE SET!', 'TAIL OF ALL TRADES'];
// A buzzer beater: cashed in at the very last second of the combo timer (20 characters or fewer).
export const BUZZER_LINES = ['NOTHING BUT EGG', 'AT THE BELL!', 'BUZZER BEATER!', 'ON THE HORN!', 'WHISTLE AND SWISH!', 'CASHED AT ZERO!'];
// A razor near miss, 1 to 4 px from danger (16 characters or fewer).
export const RAZOR_LINES = ['A WHISKER!', 'TOO CLOSE, KEVIN', 'PAPER THIN!', 'SHAVED IT!', 'ONE PIXEL!', 'EYEBROW TRIM!'];
// Labels for the terms of the combo multiplier on the bank receipt (8 characters or fewer).
export const MULT_TERM_LABELS = { style: '+STYLE', clutch: '+CLUTCH', tricks: '+TRICKS', finisher: '+FINISH', disco: '+DISCO' };

// The egg finale's last gear: a rival sprints for the door, in their own voice. Keyed by RIVALS first name,
// 4 each, 40 characters or fewer. _NEMESIS: the same when that rival is your nemesis (2 each, they know it is a grudge).
export const RIVAL_SPRINT = {
  Steve:   ['Steve says sorry. Then floors it.', 'Steve sprints. Fun fact: he likes moss.', "Steve's mum packed a turbo sandwich.", 'Steve waves goodbye. At full speed.'],
  Brock:   ['Brock skipped leg day. NOT TODAY.', 'Brock is on his last rep. GO, BROCK.', 'Brock wrote a haiku. It just says ZOOM.', 'Brock counts his strokes. Out loud. 41!'],
  Tiffany: ['Tiffany packed 3 spare sprints. Using 4.', 'Tiffany ran the numbers. Now she runs.', 'Tiffany posts a review mid-sprint: 1/5.', 'Tiffany closes the book. And the gap.'],
  Gunther: ['Gunther: "Slow-mo on ME. Not you!"', 'Gunther goes for the big finale shot.', 'Gunther pre-scores this sprint: a 10.', 'Gunther yells ACTION at his own tail.'],
  Chad:    ['Chad yells "MOVE, KEITH!" at Kevin.', 'Chad says this sprint is win 1,001.', 'Chad fixes his hair. Then really goes.', 'Chad remembers he can actually swim.'],
};
export const RIVAL_SPRINT_NEMESIS = {
  Steve:   ['Steve: "Best friend! Race you! Sorry!"', 'Steve wants this one. For the bracelet.'],
  Brock:   ['Brock trained for you. Only you.', 'Brock: "This rep has your name on it."'],
  Tiffany: ['Tiffany wrote this sprint about you.', 'Tiffany: "Chapter 13 ends HERE."'],
  Gunther: ['Gunther: "The sequel ends with ME."', 'Gunther saved his best stunt for you.'],
  Chad:    ['Chad: "You again. The hair is ANGRY."', 'Chad will not lose to you. Not twice.'],
};
// Coach after the generation 9 confession, when the shark comes up again (44 characters or fewer).
export const COACH_SHARK_AFTER = [
  'Remember my shark? Still made up.',
  'The shark was a raisin. I stand by it.',
  'No sharks here. Never were. Swim anyway.',
];

// ================================================================ Act 4 (generations 30 to 39), 60 characters or fewer per line
// Generation 30, before GEN30_INTRO: Act 3's epilogue. Coach Gonad, now in the guestbook, hands on the whistle.
export const GEN30_EPILOGUE = [
  'Coach Gonad is in the guestbook now. Page one, in pen.',
  'He swims back to the start line. One last whistle.',
  '"This goes to the first Kevin who beats Chad at the egg."',
  'A Kevin did, that very swim. Coach handed it over. Gently.',
];
// Gen 30: a new Coach, and a new mystery. Why does every Big Macro hum the Kevin theme?
export const GEN30_INTRO = [
  'Generation 30. Coach Kevin blows the whistle. A bit squeaky.',
  'Old Coach watches from a deckchair by the egg. Retired. Ish.',
  'Then a Big Macro drifts past, humming. The Kevin theme.',
  'Every Kevin freezes. "How does a Macro know OUR song?"',
];
// One 3-line chapter per generation 31 to 38 (index gen - 31). Each sets up that gen's ACT4_CLUES line, which the UI
// shows right after it as the punchline. {heir}, {grandad} and {gen} are allowed.
export const ACT4_CHAPTERS = [
  ['Generation {gen}. The Kevins listen to the Macros.', 'Every Big Macro hums. Every single one.', '{heir} hums along to check. Note perfect.'],
  ['Coach Kevin buys a tape recorder. From the gift shop.', 'He records a hungry Macro. Then a sleepy one.', '{grandad} plays both tapes back at dinner.'],
  ['Tiffany checks the egg books. All 400. Nothing on humming.', 'She checks the footnotes. Then the footnotes of those.', 'Then she makes a very small squeak.'],
  ['So what is the loudest sound in the tube? The Kevins vote.', 'Brock says Brock. Gunther says the camera. Steve says sorry.', '{heir} says nothing. {heir} is listening at the egg.'],
  ['Generation {gen}. A Kevin wins. The doorbell plays. Loudly.', 'Every Big Macro in earshot floats a little closer.', 'They do not bite. They sway.'],
  ['Old Coach watches from his deckchair. He knows something.', 'Coach Kevin asks. Old Coach sips his tea for a long time.', '"Ask the shy one," he says at last.'],
  ['Steve takes the Kevins to meet his Macro pal.', 'The shy Macro hides behind a wall. Then peeks. Then hums.', 'Softly. Off key. Very hopefully.'],
  ['The Kevins sit with the Macros. Nobody gets eaten. Mostly.', '"What does the doorbell mean to you?" asks {heir}.', 'The shy one hums an answer. Tiffany translates.'],
];
// [gen, line] for gens 31 to 38: the punchline of that gen's chapter.
export const ACT4_CLUES = [
  [31, 'The Macros hum the Kevin theme. All of it. Even the drop.'],
  [32, 'Hungry Macros hum it fast. Sleepy ones, slow. Same tune.'],
  [33, 'Footnote 9: "Macros copy the loudest sound they hear."'],
  [34, "The loudest sound in the tube is the egg's doorbell."],
  [35, 'The doorbell plays the Kevin theme. Dad beatboxed it. Gen 1.'],
  [36, 'The shy one is Doug. He has heard every single win.'],
  [37, 'Macros never get to go in. They only ever hear the bell.'],
  [38, '"It means somebody made it. We hum so it keeps happening."'],
];
// Shown on a loss in Act 4 at that many swims since generation 30 began: [swims, line], 48 characters or fewer.
// Hints only, never what ACT4_CLUES says.
export const ACT4_LOSS_CLUES = [
  [3, 'A Big Macro hummed at you. In tune. Rude.'],
  [8, 'The Macros hum louder whenever somebody wins.'],
  [15, 'The shy Macro never misses a win. Never.'],
  [25, 'Old Coach hums along with the Macros. Quietly.'],
  [40, 'The doorbell and the Macro hum: same key.'],
  [60, 'First Dad is practising with a microphone. Why?'],
];
// Generation 39: the end of Act 4. The UI makes the last line the tap line.
export const ACT4_FINALE = [
  'Generation 39. The Kevins have a plan. A loud one.',
  'First Dad, very very old now, rolls up on a flaming scooter.',
  'A Kevin wins. The doorbell rings. Dad beatboxes along. Live.',
  'Every Big Macro in the tube hums the Kevin theme with him.',
  'Old Coach conducts from his deckchair. With a breadstick.',
  'Egg: "My doorbell has a choir now? Mum would LOVE this."',
  'The shy Macro takes a bow. The Kevins clap. Nobody is lunch.',
  'Chad: "Chad was in the choir. Front row. Write that down."',
];
// First race of a new generation when the rival's parent lost the egg to a Kevin: the heir remembers.
// Keyed by RIVALS first name, 2 each, 48 characters or fewer before filling. {name} is the heir's name.
export const RIVAL_HEIR_GRUDGE = {
  Steve:   ['{name}: "You beat my dad! Hug first, then race?"', '{name} says sorry in advance. For winning.'],
  Brock:   ['{name}: "You beat my dad at the egg. Rematch."', '{name} wrote a poem. Title: Revenge, Cousin.'],
  Tiffany: ['{name} read about your win over Mum. Twice.', '{name}: "Mum lost to you. I did the maths."'],
  Gunther: ['{name}: "Dad lost to you. Now it is a trilogy."', '{name} wants the rematch on film. Wide shot.'],
  Chad:    ['{name}: "You beat my dad. Rematch, cousin."', '{name} counts that loss as a win. And sulks.'],
};

// ================================================================ system copy with a joke (placeholders exact)
export const UI_COPY = {
  lessons: 'Lessons aced',
  pepBanked: 'Coach banked a pep talk: +{n}% next swim',
  away: 'Gone {t}. Coach counted every second.',
  finalSprint: 'FINAL SPRINT!',
  lastGear: '{names} found a secret gear!',
  grandadNew: 'NEW: Grandad level! He insists.',
  lockedGen: 'Unlocks at Generation {g}',
  dailyAgain: 'Daily again (x0.5)',
  // the save is open in another tab and could not be claimed / was claimed (toasts)
  claimFail: 'Another tab is hogging the save. Close it and try again.',
  claimSaved: 'Saved! Kevin swims here now.',
  // swim 1's first live combo call (22 characters or fewer)
  comboFirst: 'COMBO! Keep passing!',
  // the result card's plain retry chip (lowercase, 2 to 3 words)
  justSwim: 'just swim',
  // the player takes over from the sat-nav mid-swim (48 characters or fewer)
  autoTakeover: 'Your tail now. Win it and the baby is REAL.',
};
// Coach, when the tube has been eased after early deaths: warm, never pitying (44 characters or fewer).
export const RESCUE_LINES = [
  'I had a word with the tube. Off you pop.',
  'Tube is a bit comfier today. My treat.',
  'I asked the walls to be nice. They agreed.',
  'Fewer Macros today. I bribed them. Biscuits.',
  'Same egg, softer tube. Show me that wiggle.',
];

// ================================================================ writer round: one cash story, win recaps, buy-and-swim pitches
// The DASH lesson's caption on a layout where the DASH button sits bottom left (DASH_WHERE says bottom right).
export const DASH_WHERE_LEFT = 'The pink button! Bottom left!';
// Under the first mutation draft: mutations are this swim only, habits are forever.
export const MUTATE_FIRST_SUB = "Mutations last this swim. Dad's habits last forever.";
// The first real combo of a save (card title and caption).
export const COMBO_FIRST = { t: 'That is a COMBO!', s: 'Keep passing to keep it alive.' };
// Zone 0's combo cap: maxed (the warm-up cap is reached), uncapped (zone 1 lifts it).
export const Z0_CAP_LINES = { maxed: 'WARM-UP MAXED', uncapped: 'UNCAPPED!' };
// The win that made each generation, one filled line at the head of genStory (in place of a GEN_UNLOCK_LINES pick).
// {kevin} the winning Kevin, {beat} the runner-up's first name, {margin} the gap (like '1.4 s'). 60 characters or fewer
// before filling. _CLOSE: the same when the margin was under 0.5 s.
export const GEN_WIN_RECAP = [
  '{kevin} beat {beat} to the egg by {margin}. Framed it.',
  '{kevin} pipped {beat} by {margin}. Grandad cried.',
  '{margin} ahead of {beat}. {kevin} made this family.',
  '{kevin} knocked first. {beat} knocked {margin} later.',
  '{beat} was {margin} behind. {kevin} still waves.',
  'Family legend: {kevin}, {margin} clear of {beat}.',
  '{kevin} won by {margin}. {beat} wants a recount.',
  'The egg picked {kevin}. {beat} was {margin} late.',
  '{kevin} beat {beat} by {margin}. Coach wrote it down.',
  'A {margin} lead on {beat}. {kevin} calls it "easy".',
  '{kevin} left {beat} {margin} back. Fridge photo.',
  'Ask {kevin}: {margin} ahead of {beat}. Every dinner.',
];
export const GEN_WIN_RECAP_CLOSE = [
  '{kevin} beat {beat} by {margin}. Egg wants a replay.',
  'Photo finish! {kevin} by {margin}. {beat} still squints.',
  '{kevin} won by {margin}. {beat} felt it. Everyone did.',
  'By {margin}! {kevin} edged {beat}. Grandad fainted.',
  '{beat} was {margin} short. {kevin} still has the shakes.',
  'Tiffany measured it: {kevin} over {beat} by {margin}.',
];
// The buy-and-swim pitch under Dad's pick on the result card, keyed by habit id (every id DAD_PICKS can return).
// 3 lines each, 30 characters or fewer: the habit, tied to the swim just lost, promising the rematch.
export const BUYSWIM_PITCH = {
  water:    ['Big tank. That nose gets in.', 'More GAS. Reach the door.', 'Fill up. Then knock first.'],
  sleep:    ['Rested Dad. GAS lasts. Go!', 'Eight hours. One more swim.', 'Slow burn. Fast finish.'],
  berries:  ['Sweeter fruit. Fuller tank.', 'Berry boost. Then rematch.', 'Snack harder. Win the door.'],
  broccoli: ['Green power. Out-drill Chad.', 'Faster tail. Get there first.', 'Eat greens. Beat them all.'],
  beatbox:  ['Longer combos. Faster Kevin.', 'Boots and cats. Rematch!', 'Keep the beat. Take the egg.'],
  walk:     ['Better drafting. Slip past.', 'Dad walks. Kevin glides.', 'Tuck in, zoom out. Rematch!'],
  meditate: ['Calm Dad. Better cards.', 'Breathe. Reroll. Rematch.', 'Om. Then win. Then cake.'],
  hottub:   ['No hot tub. Free shield.', 'Cool Dad. Kevin survives.', 'Shield up. Swim past lunch.'],
  gps:      ['Sat-nav on. Kevin cruises.', 'Dad drives. Kevin naps. Wins?', 'Autopilot. Then a rematch.'],
  factory:  ['Bigger factory. More DNA.', 'DNA while you nap. Then swim.', 'Dad builds. Kevin wins.'],
};

// ================================================================ writer round: swim 1 clarity, chapters, combo repeats
// The first result card: what DNA is for, in one line (50 characters or fewer).
export const FIRST_DAD_LINE = 'DNA buys Dad better habits. Kevins get faster.';
// A 2 to 3 word name for every HABITS id, for chips and tight cards.
export const HABIT_SHORT = {
  broccoli: 'Dad eats greens',
  water:    'Dad hydrates',
  sleep:    'Dad naps',
  jeans:    'Looser jeans',
  berries:  'Berry snacks',
  walk:     'Dad walks',
  beatbox:  'Dad beatboxes',
  hottub:   'No hot tubs',
  meditate: 'Dad meditates',
  factory:  'Bigger factory',
  gps:      "Dad's sat-nav",
};
// Coach's reason for the card he points at, keyed by the next zone id (28 characters or fewer).
export const COACH_PICK_WHY = {
  acid:   'Coach says: wear it!',
  goo:    'Goo next. Get slippery!',
  sea:    'Big sea next. Pack speed!',
  rapids: 'Rapids next. Hold the line!',
};
// The chapter a loss points at, keyed by generation 2 to 39 (24 characters or fewer, never a spoiler).
export const CHAPTER_TITLES = {
  2: 'The Back of the Queue', 3: 'Slippers Indoors', 4: 'Flames on the Scooter', 5: 'The Union',
  6: 'A Thousand and Change', 7: 'Gary Returns', 8: 'The Smudged Photo', 9: 'The Big One',
  10: 'Back at the Start Line', 11: 'Every Single Time', 12: 'The Leather Book', 13: 'The Magnifying Glass',
  14: 'And Win Two?', 15: 'Coach Goes Pale', 16: 'Very Old Jam', 17: 'The Baby in the Bib',
  18: 'A Tin of Polish', 19: 'One Real Win', 20: 'One Big Family', 21: 'Two Little Words',
  22: 'The Welcome Mat', 23: 'The Whiteboard', 24: 'The Pen on a String', 25: 'Older Names',
  26: 'Chad Reads Aloud', 27: 'Hair Gel Tears', 28: 'A Soft Whistle', 29: 'Just Once',
  30: 'A Squeaky Whistle', 31: 'The Humming', 32: 'The Tape Recorder', 33: 'All 400 Books',
  34: 'The Loudest Sound', 35: 'They Sway', 36: 'Ask the Shy One', 37: "Steve's Macro Pal",
  38: 'Tiffany Translates', 39: 'A Loud Plan',
};
// Under the chapter title when the next win starts an Act finale, keyed by that generation (40 characters or fewer).
export const FINALE_TEASE = {
  10: 'Coach has something to say. Win.',
  19: 'Chad owes you a story. Win the egg.',
  29: 'Coach wants a peek inside. Win.',
  39: 'The Macros are warming up. Win.',
};
// A MEDLEY landed again in the same swim: m2 the second, m3 the third and up (18 characters or fewer).
export const MEDLEY_REPEAT_LINES = {
  m2: ['DOUBLE ROUTINE!', 'ENCORE MEDLEY!', 'TWO-PEAT!', 'GUNTHER IS FILMING', 'COACH SAYS AGAIN!'],
  m3: ['TRIPLE ROUTINE!', 'JUDGES ARE CRYING', 'THREE-PEAT!', 'STANDING OVATION!', 'TIFFANY: NO DATA'],
};

// ================================================================ writer round: swim 1 deal, gentle tutorial, album, win banners
// Under the very first card deal (30 characters or fewer: it must not wrap at 390 px).
export const FIRST_DEAL_SUB = 'Pick one. It lasts until the egg.';
// The gentle end-of-swim-1 caption when the tutorial stopped at a step (in place of TUT_TEXT_GENTLE), keyed by the
// step the player never did. 44 characters or fewer each.
export const TUT_GENTLE_BY_STEP = {
  dash:  'Psst. The pink button goes ZOOM. Try it!',
  steer: 'Slide your thumb. Kevin copies you.',
};
// Baby Album with no babies, before Act 2 is told (the UI reads it in place of its hardcoded fallback).
export const ALBUM_EMPTY = 'No babies yet. Chad says he has loads. Chad has a lot of photos of puddles.';
// Win banner when Kevin beats that rival at the door, keyed by RIVALS first name. 3 each, 22 characters or fewer.
export const EGG_WIN_OVER = {
  Steve:   ['STEVE CLAPS POLITELY', 'STEVE SENDS A CARD', 'STEVE WAVES YOU IN'],
  Brock:   ['BROCK DROPS GERALD', 'BROCK WRITES AN ODE', 'BROCK NEEDS A NAP'],
  Tiffany: ['TIFFANY TEARS A PAGE', 'TIFFANY: ONE STAR', 'NOT IN HER NOTES!'],
  Gunther: ['GUNTHER SCORES IT 10', 'GUNTHER YELLS CUT!', 'FAN MAIL: YOU WON!'],
  Chad:    ['CHAD DEMANDS A RECOUNT', 'CHAD ORDERS NEW MUGS', 'KELVIN? NO. KEVIN!'],
};
// Win banner when the rival beaten at the door is your nemesis. {name} is the rival's first name, uppercase.
// 22 characters or fewer once filled with a 7-letter name.
export const EGG_WIN_NEMESIS = ['GRUDGE OVER, {name}!', '{name}: SCORE SETTLED', 'TAKE THAT, {name}!'];

// ================================================================ writer round: rested DNA, arrival gaps, the trick lesson, milestone pools
// The rested DNA pool, for the title chip and the result row. {dna} is the amount waiting. 60 characters or fewer filled.
export const RESTED_LINES = [
  '{dna} rested DNA. Dad had a lie-in. Your swim pays double.',
  'Coach fluffed your pillow: {dna} rested DNA waiting.',
  'Rested tail, {dna} bonus DNA. Go spend the energy.',
  'Dad slept 8 hours! {dna} rested DNA rides on your swim.',
  'The factory cat napped on {dna} rested DNA. Wake it up.',
  'Fresh from a nap: {dna} rested DNA, ready to double up.',
];
// The result card's 'rival got there first' line. {name} the rival's first name, {s} seconds (like 1.4).
// 48 characters or fewer filled.
export const ARRIVE_GAP_LINES = [
  '{name} was at the egg {s}s before you.',
  '{name} beat you to the door by {s}s.',
  '{name} had {s}s to ring the bell. Rude.',
  '{name} got there {s}s early. Shoes off.',
  '{s}s head start for {name}. Kettle was on.',
];
// Two of a signature trick's three links landed: the nudge to finish it (t big, s small).
export const TRICK_LESSON = { t: '2 of 3! Finish the trick!', s: 'Land the last chip for big DNA.' };
// Combo milestone payoffs in the cast's voices, 18 characters or fewer. The UI picks
// pickLine(K.MILESTONE_POOL?.[n]) || MILESTONE_LINES[n] (MILESTONE_LINES stays as the fallback and covers 300 and up).
export const MILESTONE_POOL = {
  40:  ['FORTY! COACH GASPS', 'WHISTLE DROPPED!', 'STEVE SAYS WOW!', 'BROCK COUNTS: 40'],
  60:  ['SIXTY! TIFF: NOTED', 'SIXTY! CHAD FROZE', 'GUNTHER: KEEP IT!', 'SIXTY! DAD STANDS'],
  80:  ['EIGHTY?! KEVIN?!', 'CHAD DROPPED A MUG', 'THE EGG PEEKED!', 'STEVE SAID SORRY'],
  100: ['DAD SAID WOW. LOUD', 'BROCK WROTE A POEM', 'TIFFANY: NEW BOOK', 'CENTURY! EGG WAVES'],
  150: ['GUNTHER: PRINT IT!', 'MACROS ARE HUMMING', 'CHAD: THAT IS MINE', 'COACH LOST HIS CAP'],
  200: ['THE EGG STOOD UP', 'GRANDAD DID A LAP', 'CHAD WANTS LESSONS', 'TIFFANY: NO WORDS'],
};
