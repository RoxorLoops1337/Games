// Million To One: the race simulation. No DOM, no audio: index.html draws it,
// tests/million_to_one_core.test.mjs drives it headless.
import { RIVALS, ZONES, RACE_LEN, MUTATIONS, MUT_ORDER, HABITS, HABIT_ORDER, habitCost, TOTAL_SWIMMERS, babyFor } from './content.js';

export const VIEW_W = 400;
export const N_AGENTS = 500;
export const EGG_DRILL = 4;
export const SAVE_KEY = 'million_to_one_v1';

export function mulberry(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const firstName = (R) => (R ? R.name.split(' ')[0] : null);
const TAU = Math.PI * 2;
const D0 = -0;
const P_DOUBLES = ['x', 'y', 'vx', 'vy', 'e', 'maxE', 'dashT', 'dashCd', 'frenzyT', 'combo', 'comboT', 'comboMax', 'fzPen', 'fzPts', 'mult', 'bestCombo', 'bestComboLate', 'bank',
  'draftT', 'passT', 'passX', 'draftHold', 'draft', 'stuck', 'inv', 'acid', 'heading', 'swatT', 'clutch', 'couchT', 'acidT', 'swatSafe', 'actT', 'trickMult', 'magT'];     // a double zero: a field that starts with it is stored as a double from birth (no shape changes later)

// ------------------------------------------------------------------ combos, synergies, race events
// DNA multiplier for the current combo chain: x1 at 0, +0.02 per link to x2 at combo 50, then +0.004 per link
// to x2.6 at combo 200 (a monster chain still feels its growth, the wallet does not explode).
export const comboMult = (n) => { n = Math.max(0, n || 0); return 1 + 0.02 * Math.min(n, 50) + 0.004 * clamp(n - 50, 0, 150); };
// combo milestones: 40, 60, 80, 100, 150, 200, then every 100 (emits comboMilestone {n})
const MILESTONES = [40, 60, 80, 100, 150, 200];
export const comboMilestoneAt = (i) => (i < MILESTONES.length ? MILESTONES[i] : 200 + 100 * (i - MILESTONES.length + 1));
const milestonesUpTo = (n) => { let i = 0; while (n >= comboMilestoneAt(i)) i++; return i; };
// STYLE: the number of different link kinds you landed in the last STYLE_WINDOW s multiplies the chain (counted up
// to 6). Every kind in STYLE_KINDS counts; the four overtake kinds (PASS_KINDS) together count for at most PASS_STYLE_MAX
// (overtakes alone are STYLE 1: a second kind needs a move that is not an overtake).
export const STYLE_WINDOW = 6, PASS_STYLE_MAX = 1;
// the Launch Tube is the warm-up: its chain clamps at Z0_COMBO_MAX, and after the first link of a dash or a draft the
// plain passes of that same dash or draft count Z0_PLOW each
export const Z0_COMBO_MAX = 30, Z0_PLOW = 0.2;
// combo bridges: the timer drains slower while you draft or dash; a fruit sugar or a DNA blob tops it up
export const DRAFT_DRAIN = 0.4, DASH_DRAIN = 0.5, PICKUP_REFILL = 0.4;
export const SLING_HOLD = 0.6;
// the draft at phone scale: catch a rival DRAFT_ACQ off your line (DRAFT_ACQ_TOUCH with a finger on the glass), keep it
// until DRAFT_KEEP, and a still thumb is pulled onto its line at up to DRAFT_MAG px/s
export const DRAFT_ACQ = 20, DRAFT_ACQ_TOUCH = 26, DRAFT_KEEP = 28, DRAFT_MAG = 90;
// the first swim: six slowpokes [dy from the start, dx from the tube centre] at CONGA_SP of the crowd for CONGA_T s,
// and a free Second Wind that lasts to the end of zone FREE_SECOND_ZONE
export const CONGA = [[1500, -6], [1565, 8], [1630, -10], [1695, 5], [1760, -4], [1828, 10]], CONGA_SP = 0.6, CONGA_T = 8, FREE_SECOND_ZONE = 2;
export const PASS_KINDS = new Set(['pass', 'slingshot', 'weave', 'snipe']);   // every kind of overtake link
export const STYLE_KINDS = new Set(['pass', 'slingshot', 'weave', 'snipe', 'rival', 'close', 'gate', 'dodge', 'pop', 'bump', 'sugar', 'dna', 'draft', 'domino']);
export const styleMult = (style) => 1 + 0.15 * (clamp(style || 1, 1, 6) - 1);
// A banked combo (the timer ran out cleanly) gets a grade: index into BANK_GRADES, from these chain lengths.
export const BANK_AT = [10, 25, 40, 60, 85];
export const bankGrade = (n) => { let g = 0; while (g < BANK_AT.length - 1 && n >= BANK_AT[g + 1]) g++; return g; };
// 0.10 * n^1.4 * style * (1 + clutch) * (1 + trick). Past BANK_SOFT (40) it goes on in a straight line (the slope at 40,
// 0.61 a link): one 80 bank always beats two 40s, so holding a chain is the greedy play, yet a monster never explodes.
export const BANK_SOFT = 40;
const BANK_AT_SOFT = 0.10 * Math.pow(BANK_SOFT, 1.4), BANK_SLOPE = 0.61;
export const bankBase = (n) => { n = Math.max(0, n || 0); return n <= BANK_SOFT ? 0.10 * Math.pow(n, 1.4) : BANK_AT_SOFT + BANK_SLOPE * (n - BANK_SOFT); };
export const bankDna = (n, style, clutch = 0, trick = 0) => bankBase(n) * styleMult(style) * (1 + clamp(clutch || 0, 0, 0.5)) * (1 + clamp(trick || 0, 0, TRICK_MULT_CAP));
// FINISHER: cashing a chain out on purpose pays the bank times this. A chain that just runs out pays
// TIMEOUT_BANK (x1 with Echo Chamber or Elephant Brain), so cashing out on purpose is the far better play.
export const finisherMult = (style) => (style >= 5 ? 2.0 : style >= 4 ? 1.6 : 1.3);
export const TIMEOUT_BANK = 0.6;
export const FINISHER_BLAST_AT = 25;      // a finisher on a bank this big also blasts (pops Big Macros, shoves rivals)
export const finisherBlastR = (bank) => 120 + 2 * Math.min(Math.max(0, bank), 100);
export const finisherSeed = (bank) => Math.min(8, Math.floor(0.1 * Math.max(0, bank)));   // links the next chain starts with
// combo timer refill for the nth link of the same kind in a row (anti-spam)
export const sameRefill = (run) => (run >= 7 ? 0.4 : run >= 4 ? 0.65 : 1);
// and for the nth overtake in a row of any kind (p.passRun; any other link resets it)
export const passRefill = (run) => (run >= 10 ? 0.4 : run >= 6 ? 0.65 : 1);
// an overtake link counts this much from the 6th overtake in a row (0.25 from the 12th), whatever the STYLE.
// A slingshot always counts in full (there is one per dash or draft).
export const passLinkK = (run, kind) => (kind === 'slingshot' ? 1 : run >= 12 ? 0.25 : run >= 6 ? 0.5 : 1);
// the combo timer shrinks on a long chain (-0.4% a link past 20, to x0.6): a big chain is tense, not a cruise
export const COMBO_HEAT_AT = 20, COMBO_HEAT = 0.004, COMBO_HEAT_MIN = 0.6;
export const comboHeat = (n) => Math.max(COMBO_HEAT_MIN, 1 - COMBO_HEAT * Math.max(0, (n || 0) - COMBO_HEAT_AT));

// SIGNATURE TRICKS: three link kinds in this order (consecutive repeats ignored) within TRICK_T s.
// +TRICK_LINKS links (+TRICK_FIRST more the first time this run), the bank grows by TRICK_MULT (to TRICK_MULT_CAP,
// reset with the chain) and a running FRENZY gets TRICK_FRENZY s. The same trick again in one chain pays half.
// The very first time a save finds a trick it pays TRICK_DNA (meta.tricks counts them).
export const TRICKS = [
  { id: 'tailgate', kinds: ['draft', 'slingshot', 'snipe'] },
  { id: 'matador',  kinds: ['close', 'dodge', 'weave'] },
  { id: 'pinball',  kinds: ['gate', 'bump', 'slingshot'] },
  { id: 'grudge',   kinds: ['rival', 'bump', 'rival'] },
  { id: 'snack',    kinds: ['sugar', 'dna', 'close'] },
  { id: 'popcorn',  kinds: ['pop', 'close', 'weave'] },
  { id: 'domino',   kinds: ['bump', 'pop', 'rival'] },     // (the id stays 'domino' so saved meta.tricks counts stay valid)
  { id: 'needle',   kinds: ['gate', 'weave', 'snipe'] },
  // 'cash' is no link and no STYLE kind: cashOut pushes it into the sequence, so a finisher can open a trick
  { id: 'encore',   kinds: ['cash', 'pop', 'weave'] },
  { id: 'rebound',  kinds: ['cash', 'slingshot', 'rival'] },
];
// TRICK STREAK: a different trick within TRICK_STREAK_T s of the last one climbs p.trickStreak (anything else resets it
// to 0). A trick's links pay x(1 + TRICK_STREAK_K * streak), at most x TRICK_STREAK_CAP; from streak 2 a running
// FRENZY also gets TRICK_STREAK_FRENZY s. Emits trickStreak {n, x, y, mult}.
export const TRICK_STREAK_T = 4.0, TRICK_STREAK_K = 0.5, TRICK_STREAK_CAP = 3, TRICK_STREAK_FRENZY = 1.5;
export const trickStreakMult = (n) => Math.min(TRICK_STREAK_CAP, 1 + TRICK_STREAK_K * Math.max(0, n || 0));
export const TRICK_T = 2.6, TRICK_LINKS = 5, TRICK_FIRST = 3, TRICK_MULT = 0.2, TRICK_MULT_CAP = 1.0, TRICK_FRENZY = 1.0, TRICK_DNA = 10;
// the FRENZY tier your STYLE allows: 1 kind tier 1, 2 kinds tier 2, 3 kinds tier 4, 4+ kinds everything
export const styleTierCap = (style) => (style >= 4 ? Infinity : style >= 3 ? 4 : style >= 2 ? 2 : 1);

// FRENZY tiers: each threshold crossed in one unbroken chain climbs a tier. Effects stack upward.
// at: multiple of the base FRENZY threshold (10, or less with Hype Man).
export const FRENZY_TIERS = [
  { name: 'FRENZY!',       at: 1,   speed: 0.3,  desc: 'Faster and louder.' },
  { name: 'MEGA FRENZY!',  at: 2.5, speed: 0.36, desc: 'Pickups fly to you from twice as far.' },
  { name: 'ULTRA FRENZY!', at: 4.5, speed: 0.42, desc: 'Combos last 50% longer.' },
  { name: 'HYPER FRENZY!', at: 8, speed: 0.48, desc: 'Acid cannot touch you.' },
  { name: 'GOD MODE!',     at: 14, speed: 0.55, desc: 'Nothing can hurt you and DNA blobs pay double.' },
];

// Two specific mutations owned together unlock a named synergy with an extra effect.
export const SYNERGIES = [
  { id: 'bulldozer', name: 'Bulldozer',         icon: '🚜', needs: ['ram', 'rush'],      desc: 'Bigger bumps, and every bump also pays Overtake Rush energy.' },
  { id: 'supernova', name: 'Supernova',         icon: '🌟', needs: ['hype', 'nitro'],    desc: 'FRENZY starts with a blast that pops every Big Macro near you, and lasts 1.5s longer.' },
  { id: 'sugarHigh', name: 'Sugar High',        icon: '🍭', needs: ['magnet', 'sweet'],  desc: 'Every fruit sugar you grab adds +1 combo.' },
  { id: 'jetstream', name: 'Jetstream',         icon: '✈️', needs: ['draft', 'whip'],    desc: 'Dashing out of a draft is free and lasts longer.' },
  { id: 'porcupine', name: 'Porcupine',         icon: '🌵', needs: ['spiky', 'helmet'],  desc: 'A popped Big Macro pops its neighbours too. Chain pops!' },
  { id: 'comeback',  name: 'Comeback Kid',      icon: '🎬', needs: ['second', 'bloom'],  desc: 'Second Wind also starts FRENZY and gives +10% speed for the rest of the run.' },
  { id: 'hypeSquad', name: 'Hype Squad',        icon: '🎉', needs: ['wingman', 'hype'],  desc: 'Every FRENZY brings your Wingman back.' },
  { id: 'elephant',  name: 'Elephant Brain',    icon: '🐘', needs: ['memory', 'echo'],   desc: 'Dropped combos keep 3/4 instead of half.' },
  { id: 'greased',   name: 'Greased Lightning', icon: '⚡', needs: ['slick', 'goo'],     desc: 'Near misses also recharge your dash.' },
  { id: 'domino',      name: 'Domino Effect',   icon: '🎳', needs: ['mosh', 'chain'],    desc: 'Every rival the Mosh Pit knocks over is +1 combo and +0.3s of FRENZY.' },
  { id: 'reserveTank', name: 'Reserve Tank',    icon: '⛽', needs: ['tank', 'second'],   desc: 'Second Wind refills you all the way and adds a shield.' },
  { id: 'jackpot',     name: 'Jackpot',         icon: '🎰', needs: ['lucky', 'magnet'],  desc: 'DNA blobs grabbed during FRENZY are also +1 combo.' },
  { id: 'afterburner', name: 'Afterburner',     icon: '🚀', needs: ['turbo', 'whip'],    desc: 'Dashes last 40% longer, and every dash in FRENZY adds +0.3s of FRENZY.' },
  { id: 'couchPotato', name: 'Couch Potato',    icon: '🛋️', needs: ['eco', 'draft'],     desc: 'No energy drain while drafting, and +1 combo for every 1.5s you draft.' },
  { id: 'hazmat',      name: 'Hazmat Suit',     icon: '☢️', needs: ['antacid', 'goo'],   desc: 'Touching acid or goo counts as a near miss.' },
  { id: 'bloodhound',  name: 'Bloodhound',      icon: '🐕', needs: ['nose', 'rush'],     desc: 'The right tube at the Fork starts FRENZY, and overtakes in the next zone count double.' },
];
export function synergiesFor(muts) { return SYNERGIES.filter((s) => s.needs.every((id) => (muts[id] || 0) > 0)); }
export const SYNERGY_BONUS = 10;   // DNA for discovering a synergy for the very first time
export const LINK_DNA = 0.03;       // DNA per combo link, times the chain multiplier

// Random mid-race events. Each run schedules a few, placed by the layout seed, in zones that suit them.
export const RACE_EVENTS = {
  sneeze:     { name: 'DAD SNEEZED!',        text: 'Turbulence! Hold on to your tail.',                      zones: ['acid', 'goo', 'sea', 'rapids'] },
  sugarRush:  { name: 'SUGAR RUSH!',         text: 'Dad found the fruit bowl. Fruit EVERYWHERE.',            zones: ['acid', 'goo', 'sea', 'rapids'] },
  stampede:   { name: 'BIG MACRO STAMPEDE!',   text: 'The immune system called in the whole team. Dodge!',     zones: ['acid', 'sea', 'rapids'] },
  slipstream: { name: 'SLIPSTREAM HIGHWAY',  text: 'The tube flows your way. Drafting is doubled.',          zones: ['acid', 'goo', 'sea', 'rapids'] },
  disco:      { name: 'DISCO TUBE',          text: 'Dad put on his playlist. Combos last longer and pay double.', zones: ['acid', 'goo', 'sea', 'rapids'] },
  espresso:   { name: 'DAD HAD AN ESPRESSO', text: 'Everybody is jittery and FAST. Energy burns quicker.',   zones: ['goo', 'sea', 'rapids'] },
  goldRush:   { name: 'GOLDEN HOUR',         text: 'DNA blobs are raining down. Grab them!',                 zones: ['acid', 'goo', 'sea', 'rapids'] },
};
export const EVENT_ORDER = Object.keys(RACE_EVENTS);
export const EVENT_LEN = 3200;
export const DAILY_LIGHT = 0.5;      // the daily rule outside the zones it suits runs at half strength

// Daily race: the day number (UTC) is the seed, so everybody gets the same egg side and layout.
export const dailySeed = (date = new Date()) => Math.floor(date.getTime() / 86400000);
export function hashSeed(n) { let h = (n | 0) ^ 0x9E3779B9; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); return (h ^ (h >>> 16)) >>> 0; }
// the rule a daily runs under (an EVENT_ORDER id): the menu can show it before the race exists
export const dailyRule = (day) => EVENT_ORDER[hashSeed(Math.floor(day)) % EVENT_ORDER.length];

// ------------------------------------------------------------------ track geometry
export const ZSTART = []; { let s = 0; for (const z of ZONES) { ZSTART.push(s); s += z.len; } }
export const FORK_I = ZONES.findIndex((z) => z.fork);
export const FORK_Y0 = ZSTART[FORK_I] + 1400;          // divider starts growing
export const FORK_END = ZSTART[FORK_I] + ZONES[FORK_I].len;
export const DEAD_Y = FORK_END + 3200;                 // the wrong tube ends here (the backflow spits you out)
export const SEA_I = ZONES.findIndex((z) => z.id === 'sea');
export const EGG_I = ZONES.findIndex((z) => z.egg);
export const RAPIDS_Y = ZSTART[ZONES.findIndex((z) => z.id === 'rapids')];
export const ACID_I = ZONES.findIndex((z) => z.id === 'acid');
export const GOO_I = ZONES.findIndex((z) => z.id === 'goo');
export const MID_DRAFT_Y = SEA_I >= 0 ? ZSTART[SEA_I] + 11000 : Infinity;   // the extra card deal halfway across the sea
// a named rival's target time to the egg at gen 0: the quickest BOSS_T0 s, the slowest 20 s more (+/-4% per run)
export const BOSS_T0 = 116;
export const BOSS_Y = [2000, 6000, 14000, 24000, 34000];  // where the named rivals start: milestones up the track
// a pass only links the combo while you are actually playing: a real input in the last IDLE_T seconds.
// Hands off in the Launch Tube you also swim a little slower, so an idle start drifts up the field far less.
export const IDLE_T = 1.2;
export const IDLE_LAUNCH = 0.9, IDLE_DRAFT = 0.5;
// the very first swim (meta.runs 0, Launch Tube): your speed over the crowd's average is x FIRST_ACTIVE while you play
// and x FIRST_IDLE hands off (an idle swimmer slower than the crowd falls back twice as fast instead)
export const FIRST_IDLE = 0.5, FIRST_ACTIVE = 1.2;
// Big Macros: they spot you within WBC_SPOT_D and wind up for WBC_SPOT_T s before hunting. A swat gives SWAT_SAFE s
// in which a Big Macro touch bonks it away. After the rookie runs every run has one spare bite (SPARE_BITE energy).
export const WBC_SPOT_D = 440, WBC_SPOT_T = 0.35, SWAT_SAFE = 0.35, SPARE_BITE = 35;
// at speed a Big Macro spots you from further (up to WBC_SIGHT_MAX) with a shorter wind-up, so the warning time holds
export const WBC_SIGHT_MAX = 900;
export const wbcSight = (vy) => clamp(440 + 0.6 * ((vy || 0) - 445), WBC_SPOT_D, WBC_SIGHT_MAX);
export const wbcWindup = (vy) => WBC_SPOT_T * clamp(445 / Math.max(1, vy || 0), 0.6, 1);
const BLEND = 1200, DIV_W = 40, AFTER = 2500, EDGE = 22;

export function zoneIndex(y) { for (let i = ZONES.length - 1; i >= 0; i--) if (y >= ZSTART[i]) return i; return 0; }
// a named rival's trip from y to the egg in 'flat water' units: the rapids current slows them (x 1 - 0.75 * current)
export function rivalTrip(y) {
  let d = 0; const end = RACE_LEN - 70;
  for (let i = 0; i < ZONES.length; i++) {
    const a = Math.max(y, ZSTART[i]), b = Math.min(end, ZSTART[i] + ZONES[i].len);
    if (b > a) d += (b - a) / (1 - (ZONES[i].current || 0) * 0.75);
  }
  return d;
}

function params(y) {
  const i = zoneIndex(y), z = ZONES[i];
  let hw = z.hw, wob = z.wob;
  const n = ZONES[i + 1], pz = ZONES[i - 1];
  if (pz && pz.fork && y < ZSTART[i] + AFTER) wob *= smooth((y - ZSTART[i]) / AFTER);   // ease the wiggle back in after the fork
  if (n && !z.fork && y > ZSTART[i + 1] - BLEND) { const t = smooth((y - (ZSTART[i + 1] - BLEND)) / BLEND); hw = lerp(hw, n.hw, t); wob = lerp(wob, n.wob, t); }
  return { i, hw, wob };
}
const centreW = (y, wob) => VIEW_W / 2 + wob * (0.6 * Math.sin(y / 1100) + 0.4 * Math.sin(y / 530 + 1.3));
// the tube's centre line before the fork
export function centre(y) { return centreW(y, params(y).wob); }
// one channel of the tube: {c, h}. side is -1/1 (only matters from the fork on).
export function channel(y, side) {
  const p = params(y), cx = centreW(y, p.wob);
  if (y < FORK_Y0 - 1 || !side) return { c: cx, h: p.hw };
  if (y < FORK_END) {
    const dw = DIV_W * smooth((y - FORK_Y0) / 1500), hw = ZONES[FORK_I].hw;
    return { c: cx + side * (dw + hw) / 2, h: (hw - dw) / 2 };
  }
  const t = smooth((y - FORK_END) / AFTER), hwF = ZONES[FORK_I].hw;
  return { c: cx + side * (DIV_W + hwF) / 2 * (1 - t), h: lerp((hwF - DIV_W) / 2, p.hw, t) };
}
// Where a swimmer can actually be: inside the tube walls AND inside the 400-wide view.
// main.js clamps its drag target to the same numbers.
export function playBand(y, side) {
  const ch = channel(y, side);
  return { l: Math.max(ch.c - ch.h + 9, EDGE), r: Math.min(ch.c + ch.h - 9, VIEW_W - EDGE) };
}
export function trackInfo(y) { const p = params(y); return { zone: p.i, cx: centre(y), hw: p.hw, forked: y >= FORK_Y0 }; }

// ------------------------------------------------------------------ meta (rogue-lite save)
// Per-level effect of Dad's habits. refreshStats and the shop (habitEffect) read the same numbers.
export const HABIT_FX = { broccoli: 0.035, water: 6, sleep: 0.05, jeans: 250, berries: 0.06, walk: 0.08, beatbox: 0.25, hottub: 1, meditate: 1 };
const GRANDAD = ['broccoli'];   // habits that keep growing with every generation
// broccoli: the normal levels give HABIT_FX.broccoli each, a grandad level (past the max) half that
export const GRANDAD_BROCCOLI = 0.015;
export const WATER_DRAIN = 0.01;     // drain per water level (a bigger tank is a thirstier tail)
export const broccoliFx = (l) => { l = Math.max(0, l || 0); const n = HABITS.broccoli.max; return HABIT_FX.broccoli * Math.min(l, n) + GRANDAD_BROCCOLI * Math.max(0, l - n); };
export const genFactor = (gen) => 1 + 0.15 * Math.min(Math.max(0, gen || 0), 10);   // DNA multiplier per generation
export const META_VER = 2;     // 2: the hero is Gen 1, so saved babies moved up one generation
// how much faster each generation makes the field: +2.5%/gen for gens 1..4, +1.8%/gen to gen 10, +0.6%/gen to gen 30
// (about the old total by gen 10, with no wall at gen 4)
export const genSpeed = (gen) => { const g = clamp(Math.floor(gen || 0), 0, 30); return 1 + 0.025 * Math.min(g, 4) + 0.018 * clamp(g - 4, 0, 6) + 0.006 * Math.max(0, g - 10); };
// named rivals get +0.5%/gen on top (to gen 20)
export const bossGenSpeed = (gen) => genSpeed(gen) + 0.005 * clamp(Math.floor(gen || 0), 0, 20);
// the tube's hazard steps: one a generation from gen 2, up to HZ_CAP (never in the daily). Steps past 8 add 4% each.
export const HZ_CAP = 14;
// new READS with the hazard steps (never in the daily: its hzGen is 0): from step 2 sliding goo gates, from 4 Big Macro
// twins, from 6 puddles that pulse on the beat, from 8 wall hairs in opposite pairs. The first of each a run meets
// emits hzNew {id}.
export const HZ_NEW = { slide: 2, twins: 4, pulse: 6, pair: 8 };
export const SLIDE_HZ = 0.45;
export const slideAmp = (hg) => 18 + 6 * Math.min(hg, 6);
export const hzGenOf = (gen) => clamp(Math.floor(gen || 0) - 1, 0, HZ_CAP);
export const hzMul = (hg, per) => 1 + per * Math.min(hg, 8) + 0.04 * Math.max(0, hg - 8);
// the fruit thins out with the hazard steps (to x0.74 at 6 steps)
export const fruitMulOf = (hg) => 1 / (1 + 0.06 * Math.min(hg, 6));
// energy drain per generation: +1%/gen for gens 1..4 (while the field speeds up), then +1.625%/gen to +30% at gen 20
export const genDrain = (gen) => { const g = clamp(Math.floor(gen || 0), 0, 20); return 1 + 0.01 * Math.min(g, 4) + 0.01625 * Math.max(0, g - 4); };
// the normal (non-daily) runs counted so far: the rookie grace counts these, so dailies never use it up.
// meta.normRuns < 0 (or missing) means unknown: every run counts (an old save or a hand-made meta).
export const normRunsOf = (meta) => { if (!meta) return 0; const n = +meta.normRuns; return Math.max(0, Math.floor(n >= 0 ? n : +meta.runs || 0)); };
// rookie grace for the first five runs (never in the daily): 0 when off, else the drain/acid factor
export const ROOKIE_TAPER = [0.55, 0.65, 0.75, 0.85, 0.93];
export const rookieFactor = (meta, daily) => { const n = normRunsOf(meta); return daily == null && meta && n < ROOKIE_TAPER.length ? ROOKIE_TAPER[n] : 0; };
// the named rivals take longer to reach the egg on the first four runs (never in the daily)
export const ROOKIE_BOSS = [1.17, 1.12, 1.08, 1.04];
// and their finale sprinters drill faster by ROOKIE_SPRINT times that extra time (x1.6 on run 1): a photo finish
export const ROOKIE_SPRINT = 3.5;
export const rookieBossT = (meta, daily) => { const n = normRunsOf(meta); return daily == null && n < ROOKIE_BOSS.length ? ROOKIE_BOSS[n] : 1; };
// every 'late' loss before you even reached the egg (and every 'So near!' energy loss) slows the named rivals by
// RACE_LOSS_T (up to RACE_LOSS_N of them), never in the daily.
// A win halves the count (end()), so the cushion fades instead of vanishing.
export const RACE_LOSS_T = 0.04, RACE_LOSS_N = 4;
export const raceLossT = (meta, daily) => (daily == null ? 1 + RACE_LOSS_T * clamp(Math.floor((meta && meta.raceLosses) || 0), 0, RACE_LOSS_N) : 1);
// a new generation eases in: the first run after a real win gives the named rivals FRESH_GEN more time, the second half
// that (meta.sinceWin; never in the daily, never at gen 0). Only after the first win of a streak: a second win in a
// row (meta.lastWinStreak 2+) brings no cushion. The win still brings a faster field, just not a wall.
export const FRESH_GEN = 0.1;
export const freshGenT = (meta, daily) => { const n = Math.floor((meta && meta.sinceWin) ?? 99); return daily == null && meta && (meta.gen || 0) > 0 && n < 2 && !((meta.lastWinStreak || 0) >= 2) ? 1 + FRESH_GEN * (n ? 0.5 : 1) : 1; };
export const freshGenActive = (meta) => freshGenT(meta, null) > 1;
// the losing-streak cushion: from the 5th normal loss in a row (meta.sinceWin, counted only on normal runs; a save that
// never won counts its normal runs) the named rivals take PEP_STEP longer per loss past 4, up to PEP_MAX (never in the daily)
export const PEP_FROM = 5, PEP_STEP = 0.03, PEP_N = 4;
export const lossRunOf = (meta) => Math.min(Math.floor((meta && meta.sinceWin) ?? 0), normRunsOf(meta));
export const pepT = (meta, daily) => { const n = lossRunOf(meta); return daily == null && meta && n >= PEP_FROM ? 1 + PEP_STEP * Math.min(n - PEP_FROM + 1, PEP_N) : 1; };
// what the result screen can show about the next race: the drill bonus from egg losses in a row (%), and the field
export const EGG_BOOST = 0.08, EGG_BOOST_N = 5;
export const eggBoostOf = (meta) => 1 + EGG_BOOST * Math.min(EGG_BOOST_N, Math.max(0, Math.floor((meta && meta.eggLosses) || 0)));
export const eggBoostPct = (meta) => Math.round((eggBoostOf(meta) - 1) * 100);
export const fieldInfo = (meta) => { const g = (meta && meta.gen) || 0; return { speedPct: Math.round((genSpeed(g) - 1) * 1000) / 10, fruitMul: Math.round(fruitMulOf(hzGenOf(g)) * 100) / 100 }; };
// the long tail of the Rapids: a named rival more than BAND_D ahead of you there slows by 1 per BAND_W of lead,
// to x BAND_MIN at most (a claim while you are still in the Rapids would be a chase you could never win)
export const BAND_D = 3000, BAND_W = 30000, BAND_MIN = 0.75;
// the fixed first deal of a brand-new save: Turbo Tail, Whiplash (together: Afterburner) and Antacid Coat
export const FIRST_DEAL = ['turbo', 'whip', 'antacid'];
export const WIN_BONUS = 150;
// the pay for your place: 70 * (log10(1e6 / rank) / 6)^1.5, so the last places pay little and the top pays 70
export const placePay = (rank) => 70 * Math.pow(clamp(Math.log10(TOTAL_SWIMMERS / Math.max(1, rank)) / 6, 0, 1), 1.5);
// the rivals' signature moves at the egg (see Race.stepMove)
export const MAX_ARRIVED = 2;
// the egg drill: DRILL_BASE a second on its own, DRILL_TAP a tap (up to 8 taps a second), plus a head start from the
// race (headStart, up to DRILL_HEAD_MAX). A rival already drilling when you arrive is held at DRILL_ARRIVED_CAP.
export const DRILL_BASE = 0.42, DRILL_TAP = 0.05, DRILL_HEAD_MAX = 1.0, DRILL_ARRIVED_CAP = 0.88;
// the named rivals train too: they drill faster as your career goes on (the share of RIVAL_TRAIN_RUNS normal runs
// played), up to x1.26 at gen 0, x1.245 at gen 4, x1.225 at gen 12 and x1.14 from gen 20 (RIVAL_TRAIN, straight lines
// between those generations; the faster field carries more of the pressure later). A new player meets them at x1.
// (habitShare is kept for the shop and the result screen; it no longer feeds the rivals)
export const habitShare = (meta) => { let n = 0, t = 0; for (const id of HABIT_ORDER) { if (id === 'gps') continue; t += HABITS[id].max; n += Math.min(HABITS[id].max, (meta && meta.habits && meta.habits[id]) || 0); } return t ? n / t : 0; };
export const RIVAL_TRAIN = [[0, 0.26], [4, 0.245], [12, 0.225], [20, 0.14]];
export const rivalTrain = (gen) => {
  const g = Math.max(0, Math.floor(gen || 0)), T = RIVAL_TRAIN;
  for (let i = 1; i < T.length; i++) if (g <= T[i][0]) return lerp(T[i - 1][1], T[i][1], (g - T[i - 1][0]) / (T[i][0] - T[i - 1][0]));
  return T[T.length - 1][1];
};
// (driven by career progress, normal runs / RIVAL_TRAIN_RUNS, not by purchases: buying a habit never feeds the rivals)
export const RIVAL_TRAIN_RUNS = 40;
export const rivalDrillK = (meta) => 1 + clamp(normRunsOf(meta) / RIVAL_TRAIN_RUNS, 0, 1) * rivalTrain(meta && meta.gen);
// the finale rubber band, by Kevin's lead in seconds over the soonest egg-side named rival: under FIN_CLOSE the classic
// A 700 ahead / B 450 behind; up to FIN_FAR, A sits 300 ahead at your speed; past it only B comes, 450 behind
export const FIN_CLOSE = 4, FIN_FAR = 10;
// a claim at the egg is a chase: the claimer needs the seconds you still need to get there, at CHASE_K of your speed
export const CHASE_K = 0.85, CHASE_CAP = 13;   // (the chase is capped at CHASE_CAP + 6 s at gen 0, easing to CHASE_CAP by gen 8)
export const MOVE_TELL = 0.6, MAXREP_EVERY = 3.5, MAXREP_HIT = 0.22, BOOK_T = 2, STUNT_OUT = 1.2, STUNT_HIT = 0.18, STUNT_CAP = 0.25, HAIR_T = 1.6;     // DNA for a win (not an autopilot one), before the generation multiplier
export const GOAL_IDS = ['beatRival', 'reachEgg', 'reachZone', 'combo'];

export function newMeta() {
  return { v: 1, ver: META_VER, dna: 0, habits: {}, gen: 0, best: TOTAL_SWIMMERS, runs: 0, wins: 0, babies: [], lastSeen: 0, bank: 0, introSeen: false, muted: false, bestCombo: 0, autopilot: false,
    dailyDay: -1, dailyBest: TOTAL_SWIMMERS, dailyRuns: 0, synergiesSeen: [], dailyStreak: 0, dailyLastDay: -1, bestRivals: 0, rivals: {},
    eggLosses: 0, bestStreak: 0, goal: null, quits: 0, raceLosses: 0, dailyLastAt: 0, sinceWin: 99, dailyMedal: 0, dailyGolds: 0,
    normRuns: -1, winStreak: 0, lastWinStreak: 0, tricks: {} };
}
// the sat-nav (autopilot) only unlocks from generation 2: earn your first baby by hand
export const maxLv = (meta, id) => (id === 'gps' && ((meta && meta.gen) || 0) < 2 ? 0 : HABITS[id].max + (GRANDAD.includes(id) ? Math.min(Math.max(0, (meta && meta.gen) || 0), 10) : 0));
function cleanGoal(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g) || !GOAL_IDS.includes(g.id)) return null;
  const num = (v) => (isFinite(+v) ? +v : NaN);
  const target = num(g.target), dna = num(g.dna), k = num(g.k);
  if (!(dna >= 0)) return null;
  const out = { id: g.id, target: isFinite(target) ? Math.max(0, Math.floor(target)) : 0, dna: Math.round(dna), k: -1 };
  if (g.id === 'beatRival') { if (!(k >= 0 && k < RIVALS.length)) return null; out.k = Math.floor(k); }
  return out;
}
export function loadMeta(o) {
  const m = newMeta();
  if (!o || typeof o !== 'object') return m;
  for (const k of Object.keys(m)) if (k in o && typeof o[k] === typeof m[k]) m[k] = o[k];
  if (!Array.isArray(m.babies)) m.babies = [];
  if (!Array.isArray(m.synergiesSeen)) m.synergiesSeen = [];
  for (const k of ['gen', 'runs', 'wins', 'bestCombo', 'dailyRuns', 'dailyStreak', 'bestRivals', 'bank', 'eggLosses', 'bestStreak', 'quits', 'raceLosses', 'sinceWin', 'dailyMedal', 'dailyGolds', 'winStreak', 'lastWinStreak']) if (!isFinite(m[k]) || m[k] < 0) m[k] = 0;
  // normal runs (the rookie grace): an old save does not know how many of its runs were dailies, so all of them count
  m.runs = Math.floor(m.runs); m.winStreak = Math.floor(m.winStreak); m.lastWinStreak = Math.floor(m.lastWinStreak);
  m.normRuns = isFinite(+o.normRuns) && +o.normRuns >= 0 ? Math.min(Math.floor(+o.normRuns), m.runs) : m.runs;
  m.dailyMedal = clamp(Math.floor(m.dailyMedal), 0, 3); m.dailyGolds = Math.floor(m.dailyGolds);
  if (!isFinite(m.dailyLastAt) || m.dailyLastAt < 0) m.dailyLastAt = 0;
  m.gen = Math.floor(m.gen); m.quits = Math.floor(m.quits); m.raceLosses = Math.min(Math.floor(m.raceLosses), 99); m.eggLosses = Math.min(Math.floor(m.eggLosses), 99); m.bestStreak = Math.max(Math.floor(m.bestStreak), m.dailyStreak || 0);
  // save versions: before ver 2 the hero counted as Gen 0, so every saved baby moves up one
  const oldVer = isFinite(+o.ver) ? +o.ver : 1;
  m.babies = m.babies.filter((b) => b && typeof b === 'object');
  if (oldVer < 2) for (const b of m.babies) b.gen = (isFinite(+b.gen) ? +b.gen : 0) + 1;
  m.ver = META_VER;
  m.goal = cleanGoal(o.goal);
  const h = {}; for (const id of HABIT_ORDER) { const l = (o.habits && +o.habits[id]) || 0; if (l > 0) h[id] = clamp(Math.floor(l), 0, maxLv(m, id)); }
  m.habits = h;
  const rv = {};
  for (const R of RIVALS) {
    const n = firstName(R), x = m.rivals && !Array.isArray(m.rivals) ? m.rivals[n] : null;
    const num = (v) => (isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
    rv[n] = { beat: x ? num(x.beat) : 0, lost: x ? num(x.lost) : 0 };
  }
  m.rivals = rv;
  const tk = {}, src = o.tricks && typeof o.tricks === 'object' && !Array.isArray(o.tricks) ? o.tricks : {};
  for (const T of TRICKS) { const c = Math.floor(+src[T.id]); if (c > 0 && isFinite(c)) tk[T.id] = c; }
  m.tricks = tk;
  if (!isFinite(m.dna) || m.dna < 0) m.dna = 0;
  return m;
}
export const lv = (meta, id) => meta.habits[id] || 0;
export function buyHabit(meta, id) {
  const l = lv(meta, id); if (l >= maxLv(meta, id)) return false;
  const c = habitCost(id, l); if (meta.dna < c) return false;
  meta.dna -= c; meta.habits[id] = l + 1; return true;
}
// What one habit does at a level, from the same constants the race uses. {label, value}
export function habitEffect(id, l, meta) {
  const pct = (v) => Math.round(v * 100) + '%';
  switch (id) {
    case 'broccoli': return { label: '+' + (Math.round(broccoliFx(l) * 1000) / 10) + '% swim speed', value: broccoliFx(l) };
    case 'water':    return { label: '+' + HABIT_FX.water * l + ' max energy, +' + Math.round(WATER_DRAIN * l * 100) + '% drain', value: HABIT_FX.water * l };
    case 'sleep':    { const v = 1 - Math.pow(1 - HABIT_FX.sleep, l); return { label: '-' + pct(v) + ' energy drain', value: v }; }
    case 'jeans':    return { label: 'Start ' + HABIT_FX.jeans * l + ' µm further up', value: HABIT_FX.jeans * l };
    case 'berries':  return { label: '+' + pct(HABIT_FX.berries * l) + ' energy from fruit', value: HABIT_FX.berries * l };
    case 'walk':     return { label: '+' + pct(HABIT_FX.walk * l) + ' drafting power', value: HABIT_FX.walk * l };
    case 'beatbox':  return { label: '+' + (HABIT_FX.beatbox * l).toFixed(2) + 's combo time', value: HABIT_FX.beatbox * l };
    case 'hottub':   return { label: '+' + l + ' starting shield' + (l === 1 ? '' : 's'), value: l };
    case 'meditate': return { label: '+' + l + ' card reroll' + (l === 1 ? '' : 's'), value: l };
    case 'factory':  { const v = factoryRateAt(l, meta ? meta.gen : 0); return { label: v + ' DNA per hour', value: v }; }
    case 'gps':      return { label: l > 0 ? 'Autopilot unlocked' : 'No autopilot', value: l > 0 ? 1 : 0 };
    default:         return { label: '', value: 0 };
  }
}
// DNA per hour the factory makes while you are away, and how many hours it stores
export const factoryRateAt = (l, gen) => Math.round(20 * Math.pow(1.16, l) * Math.pow(genFactor(gen), 0.25));
export const factoryRate = (meta) => factoryRateAt(lv(meta, 'factory'), meta.gen);
export const factoryCapHours = (meta) => Math.min(12, 6 + 0.6 * lv(meta, 'factory'));
// a clock that jumped back more than this re-anchors lastSeen to now (a save from the future must not freeze the factory)
export const CLOCK_SLACK = 600000;
export function idleTick(meta, now) {
  if (!isFinite(now)) return meta.bank;
  if (!meta.lastSeen) { meta.lastSeen = now; return 0; }
  if (now < meta.lastSeen - CLOCK_SLACK) { meta.lastSeen = now; return meta.bank; }   // far back: start counting from now, credit nothing
  if (now < meta.lastSeen) return meta.bank;      // a little back (clock drift): keep lastSeen, credit nothing
  const cap = factoryCapHours(meta);
  const hrs = clamp((now - meta.lastSeen) / 3600000, 0, cap);
  meta.lastSeen = now;
  meta.bank = Math.min(meta.bank + hrs * factoryRate(meta), factoryRate(meta) * cap);
  return meta.bank;
}
export function collectBank(meta) { const d = Math.floor(meta.bank); meta.dna += d; meta.bank -= d; return d; }

// ------------------------------------------------------------------ the next-goal bounty ("one more run")
// Is goal g met by a run? r: {won, zone, combo, beaten: [first names]}
export function goalMet(g, r) {
  if (!g) return false;
  switch (g.id) {
    case 'beatRival': return !!RIVALS[g.k] && (r.won || (r.beaten || []).includes(firstName(RIVALS[g.k])));
    case 'reachEgg':  return r.won || (r.zone || 0) >= EGG_I;
    case 'reachZone': return r.won || (r.zone || 0) >= g.target;
    case 'combo':     return Math.floor(r.combo || 0) >= g.target;
    default: return false;
  }
}
// Pick the next goal from the run that just ended, store it as meta.goal and return it.
// A run that got to THE EGG (or into the top 10) is told to beat the rival nearest ahead (over.gapBy):
// never 'reach the egg' again, which it just did. Reach the egg is the goal only after dying in the Rapids.
const rivalIndex = (n) => (n ? RIVALS.findIndex((R) => firstName(R) === n || R.name === n) : -1);
export function nextGoal(meta, over) {
  if (!meta || !over) return null;
  const gm = genFactor(meta.gen), lost = over.reason !== 'win', zone = over.zone || 0;
  const atEgg = lost && (zone >= EGG_I || (over.rank != null && over.rank <= 10));
  const ahead = atEgg ? rivalIndex(over.gapBy || over.by) : -1, k = rivalIndex(over.by);
  // a combo goal is measured from the Acid Lagoon on (the Launch Tube chain is a warm-up, capped at Z0_COMBO_MAX)
  const comboBase = Math.floor((over.comboLate != null ? over.comboLate : over.combo) || 0);
  let g;
  if (ahead >= 0) g = { id: 'beatRival', target: 0, dna: 40, k: ahead };
  else if (atEgg) g = { id: 'combo', target: comboBase + 5, dna: 15, k: -1 };
  else if (k >= 0) g = { id: 'beatRival', target: 0, dna: 30, k };
  else if (lost && zone === EGG_I - 1) g = { id: 'reachEgg', target: EGG_I, dna: 40, k: -1 };
  else if (over.reason !== 'win' && (over.zone || 0) + 2 <= EGG_I && !(meta.goal && meta.goal.id === 'reachZone')) g = { id: 'reachZone', target: (over.zone || 0) + 2, dna: 20, k: -1 };
  else g = { id: 'combo', target: comboBase + 5, dna: 15, k: -1 };
  g.dna = Math.round(g.dna * gm);
  meta.goal = g;
  return g;
}
// ------------------------------------------------------------------ the daily streak
// Time based, so a late-night daily followed by an early-morning one two calendar days later still counts:
// the streak lives on the next UTC day, or two days later when under 36 h have passed since the last counted daily.
export const STREAK_GAP_MS = 36 * 3600000;
export function streakAlive(meta, now) {
  if (!meta || !isFinite(now)) return false;
  const day = Math.floor(now / 86400000), last = meta.dailyLastDay, at = +meta.dailyLastAt || 0;
  if (!(last >= 0)) return false;
  if (last === day || last === day - 1) return true;
  return last === day - 2 && at > 0 && now - at < STREAK_GAP_MS;
}
// the bonus a counted daily pays on day n of a streak (every 7th day pays triple)
export const dailyBonusFor = (streak, gen) => { const n = Math.max(1, Math.floor(streak || 1)); return Math.round(60 * Math.min(n, 7) * genFactor(gen)) * (n % 7 === 0 ? 3 : 1); };
// daily medals: 3 gold (a win), 2 silver (top 100), 1 bronze (top 1,000), 0 none. Each tier pays once a day.
export const MEDAL_PAY = [0, 15, 30, 60];
export const medalTier = (won, rank) => (won ? 3 : rank <= 100 ? 2 : rank <= 1000 ? 1 : 0);
export const medalPay = (from, to, gen) => { let d = 0; for (let t = Math.max(0, from) + 1; t <= to; t++) d += MEDAL_PAY[t]; return Math.round(d * genFactor(gen)); };

// ------------------------------------------------------------------ the race
export class Race {
  constructor(meta, rng = Math.random, opts = {}) {
    this.meta = meta; this.rng = rng; this.t = 0; this.events = [];
    this.gen = meta.gen || 0;
    this.muts = {}; this.syn = {}; this.pending = null; this.pendingMid = false; this.rerolls = lv(meta, 'meditate');
    this.draftN = 0; this.midDraft = false; this.noLeg = 0; this.firstDealt = false;
    // rookie grace (the first ROOKIE_TAPER.length = 5 runs, never the daily) is worked out from the save, no UI flag needed
    this.rookie = rookieFactor(meta, opts.seed != null && isFinite(opts.seed) ? opts.seed : null); this.biteFree = -1;
    this.over = null; this.won = false; this.paused = false;
    // layout seed: a daily race (opts.seed = day number) fixes the egg side, the field, the
    // spawn layout, the events and the card offers; otherwise it comes from rng.
    this.daily = opts.seed != null && isFinite(opts.seed) ? Math.floor(opts.seed) : null;
    this.layoutSeed = this.daily != null ? hashSeed(this.daily) : Math.floor(rng() * 4294967296) >>> 0;
    const lrng = mulberry(this.layoutSeed);
    this.orng = this.daily != null ? mulberry(this.layoutSeed ^ 0x5BD1E995) : rng;
    this.eggSide = lrng() < 0.5 ? -1 : 1;
    // the daily rule: one race event runs the whole daily (full strength in the zones it suits, DAILY_LIGHT outside them)
    this.dailyRule = this.daily != null ? dailyRule(this.daily) : null;
    this.autoFork = rng() < 0.75 ? this.eggSide : -this.eggSide;   // the autopilot sniffs the right tube 3 times in 4
    this.schedule = opts.events === false ? [] : this.planEvents(lrng);
    this.ev = null;
    // finger: true only while a real drag is down (main.js); false while a lifted finger holds its lane
    this.input = { tx: null, dir: 0, dash: false, tap: 0, touch: false, cashOut: false, finger: null };
    this.bot = !!opts.bot;                           // test bot: steers like the autopilot but plays like a person
    this.autopilot = !!opts.autopilot || this.bot; this.autoT = 0;
    // from generation 2 the tube itself gets nastier, one step per generation to 8 (never in the daily: same layout for everybody)
    this.hzGen = this.daily == null ? hzGenOf(this.gen) : 0;
    // the wall clock for the daily streak (opts.now in ms); a daily for another day than today counts at its noon
    this.now = isFinite(opts.now) ? +opts.now : null;
    this.biteUsed = 0;          // the one spare Big Macro bite a run gets after the rookie runs
    this.goalSeen = false;      // goalMet is emitted at most once per run
    this.lastWbcY = {};         // per tube side: the last Big Macro row (spawn spacing)
    this.lastWbcX = {};         // and its x (no puddle right under a Big Macro)
    this.ciliaYs = [];          // recent wall hairs {y, side} (no Big Macro next to one)
    // (every field a race ever gets is declared here: one stable object shape keeps the step methods optimized)
    this.stepN = 0; this.draftTarget = null; this.inFanfare = false; this.ending = false; this.backflowed = 0;
    this.finaleT = null; this.finaleLead = 0; this.arriveRank = 0; this.hzSeen = {}; this.tricksRun = {};
    const startY = 40 + HABIT_FX.jeans * lv(meta, 'jeans');
    const maxE = 100 + HABIT_FX.water * lv(meta, 'water');
    // (the fractional fields start as doubles (D0): one stable shape from birth, no mid-race deopts)
    const p = this.p = { x: D0, y: D0, vx: D0, vy: D0, e: D0, maxE: D0, shield: lv(meta, 'hottub'), dashT: D0, dashCd: D0, frenzyT: D0, nextFrenzy: 10, combo: D0,
      comboT: D0, comboMax: D0, tier: 0, fz: 0, fzPen: D0, fzPts: D0, bestTier: 0, mult: D0, bestCombo: D0, bestComboLate: D0, kindLast: {}, rep: [], style: 1, bank:
      D0, dashN: 0, draftN: 0, z0Key: '', draftT: D0, passSide: 0, passT: D0, passX: D0, slingOK: false, draftHold: D0, draft: D0, comeback: 0, side: 0, stuck: D0,
      inv: D0, acid: D0, wing: 0, second: 0, overtakes: 0, heading: D0, swatT: D0, swatDir: 0, current: 0, sameRun: 0, lastKind: '', clutch: D0, couchT: D0, acidT:
      D0, zoneBonks: 0, lastHit: '', frenzyTier: 0, swatSafe: D0, actT: D0, lastTx: null, lastOff: null, passRun: 0, seq: [], trickMult: D0, trickChain: {},
      freeSecond: 0, draftLock: null, magOff: null, magT: D0, mileI: 0 };
    p.x = VIEW_W / 2; p.y = startY; p.vx = 0; p.vy = 0; p.e = maxE; p.maxE = maxE; p.dashT = 0; p.dashCd = 0; p.frenzyT = 0; p.combo = 0; p.comboT = 0; p.comboMax
      = 2.2; p.fzPen = 0; p.fzPts = 0; p.mult = 1; p.bestCombo = 0; p.bestComboLate = 0; p.bank = 0; p.draftT = -9; p.passT = -9; p.passX = 0; p.draftHold = 0;
      p.draft = 0; p.stuck = 0; p.inv = 0; p.acid = 0; p.heading = 0; p.swatT = 0; p.clutch = 0; p.couchT = 0; p.acidT = -99; p.swatSafe = 0; p.actT = IDLE_T;
      p.trickMult = 0; p.magT = 0;
    this.startY = startY; this.prevPY = startY;
    this.dnaRun = 0; this.dnaBank = 0; this.dnaBonus = 0; this.zoneReached = 0; this.cleared = 0; this.ciliaN = 0;
    this.ents = []; this.genY = Math.ceil((startY + 300) / 100) * 100;   // rows on a fixed 100 grid (same daily layout for everyone)
    this.drill = null;   // egg phase
    this.claimed = null; this.eggTaken = null; this.rdLevel = 0;
    this.fx = [];        // short-lived world effects for the renderer (eaten rivals etc.)
    this.nearA = []; this.nearY = -Infinity; this._snack = [];   // persistent per-step buffers (no garbage at 240 Hz)
    this.agents = [];
    // the field. 35% are the pack behind the start line; the rest are spread up the track (zones 1..4),
    // more of them where more swimmers would still be alive, and each one placed past a zone has
    // already survived it. Far-ahead swimmers are tired: they would reach the egg in 190..330 s.
    const gs = genSpeed(this.gen), fieldBase = 430 * gs;
    const n = N_AGENTS, nBoss = RIVALS.length, nA = Math.round(n * 0.35);
    const zw = []; { let surv = 1; for (let i = 0; i < FORK_I + 1 && i < ZONES.length; i++) { if (i >= 1) zw.push([i, surv * ZONES[i].len]); surv *= 1 - ZONES[i].q; } }
    const zwSum = zw.reduce((a, b) => a + b[1], 0);
    for (let i = 0; i < n; i++) {
      const lane = lrng() * 1.8 - 0.9, side = lane < 0 ? -1 : 1, g = gauss(lrng), u1 = lrng(), u2 = lrng(), u3 = lrng(), u4 = lrng();
      // (every swimmer has the same fields from birth, and every fractional field starts as a double (D0 = -0): one
      // stable object shape keeps the agent loop optimized, with no deopts and no number boxing on phones)
      const stam = lrng(), ph = lrng() * 6.28, face = Math.floor(lrng() * 6);
      const a = { y: D0, lane: D0, side, lane2: D0, sp: D0, stam: D0, alive: true, zone: -1, deathY: Infinity, ph: D0,
        kx: D0, arrived: false, drill: D0, need: D0, w: D0, face, k: -1, tauntT: D0, bumpT: D0, passT: D0, group: 'A',
        boss: null, acc: D0, zoneEnd: -Infinity, sph: D0, cph: D0, bumped: 0, arrivedT: D0, diedT: D0, sprint: 0, passedOnce: 0, draftedT: D0,
        drillK: D0, T: D0, shoveT: D0, spawnY: D0, met: true, mv: null, conga: D0 };
      a.y = 0; a.lane = lane; a.lane2 = clamp(Math.abs(lane) / 0.9 * 2 - 1, -0.9, 0.9); a.sp = 0; a.stam = stam; a.need = EGG_DRILL; a.w = 1; a.draftedT = -9; a.drillK = 1;
      a.ph = ph;
      a.sph = Math.sin(a.ph); a.cph = Math.cos(a.ph);
      if (i < nBoss + nA) { a.y = 60 + u1 * 2440; a.sp = fieldBase * clamp(0.95 + 0.06 * g, 0.75, 1.03); }
      else {
        let r = u1 * zwSum, zi = zw[0][0]; for (const [k, w] of zw) { zi = k; if (r < w) break; r -= w; }
        const z = ZONES[zi], end = ZSTART[zi] + z.len;
        a.y = ZSTART[zi] + 200 + u2 * (z.len - 400); a.zone = zi; a.stam = 1; a.group = 'B';
        const T = 190 + u3 * 140;
        a.sp = fieldBase * clamp((RACE_LEN - a.y) * 1.06 / (430 * T), 0.2, 1);
        if (!z.fork && u4 < z.q * (end - a.y) / z.len) a.deathY = a.y + lrng() * (end - a.y); else lrng();
      }
      this.agents.push(a);
    }
    // the named rivals: milestones up the track, the slots shuffled every run. Each one swims to
    // arrive at the egg after a target time T (gen 0): the quickest (highest R.sp) after 112 s, the
    // slowest after 132 s, +/-4% per run. A rival in a rear slot therefore roars past you mid-race.
    // Tough (no death rolls), and they drill hard.
    const slots = RIVALS.map((R, k) => (BOSS_Y[k] != null ? BOSS_Y[k] : 34000 + 4000 * (k - 4)));
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(lrng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const order = RIVALS.map((R, k) => k).sort((a, b) => RIVALS[b].sp - RIVALS[a].sp || a - b);
    const bossGs = bossGenSpeed(this.gen);
    // new-player arc: the first runs and every pre-egg 'late' loss give Kevin a little more time
    this.rookieBoss = rookieBossT(meta, this.daily);
    this.rivalK = rivalDrillK(meta);
    this.pep = pepT(meta, this.daily); this.pepPct = Math.round((this.pep - 1) * 100);
    const bossT = this.rookieBoss * raceLossT(meta, this.daily) * freshGenT(meta, this.daily) * this.pep;
    this.threatK = -1; this.threatSent = false; let soonest = Infinity;
    RIVALS.forEach((R, k) => {
      const a = this.agents[k], y = slots[k], rk = order.indexOf(k);
      let T = BOSS_T0 + 20 * rk / Math.max(1, RIVALS.length - 1);
      T *= 1 + (lrng() * 2 - 1) * 0.04;
      T *= bossT;
      a.drillK = 1 + (lrng() * 2 - 1) * 0.1;          // drilling form on the day: +/-10%
      const sp = rivalTrip(y) / (430 * T);
      Object.assign(a, { boss: R, k, sp: 430 * sp * bossGs, stam: 1, y, w: 1, zone: -1, deathY: Infinity, group: 'boss', T: T / bossGs, shoveT: 1.4, spawnY: y, met: false });
      a.side = lrng() < R.smart ? this.eggSide : -this.eggSide; a.lane = a.side * (0.2 + lrng() * 0.6); a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9);
      const eta = a.side === this.eggSide ? a.T : a.T + 1000;
      if (eta < soonest) { soonest = eta; this.threatK = k; }
    });
    this.frng = mulberry(this.layoutSeed ^ 0x1B873593);   // the daily finale picks
    // weights: how many real swimmers each one stands for. The spread-out leaders share 100,000 places on a
    // log scale (the front ones are worth 1 each), the pack behind shares everything else.
    const B = this.agents.filter((a) => a.group === 'B').sort((a, b) => b.y - a.y), BSUM = 100000;
    let sumB = 0;
    B.forEach((a, j) => { a.w = Math.max(1, Math.pow(BSUM, (j + 1) / B.length) - Math.pow(BSUM, j / B.length)); sumB += a.w; });
    const wA = (TOTAL_SWIMMERS - 1 - nBoss - sumB) / nA;
    for (const a of this.agents) if (a.group === 'A') a.w = wA;
    this.rank = this.computeRank(); this.alive = TOTAL_SWIMMERS; this.startRank = this.rank;
    this.refreshStats();
    this.p.nextFrenzy = this.frenzyThreshold(0); this.p.comboMax = this.s.combo;
    this.dnaFromCombo = 0;   // DNA earned on top of the base thanks to combo multipliers (for the result screen)
    this.calmY = -Infinity;  // no hostiles spawn below this row (set after a backflow)
    this.puddles = [];       // recent acid / goo centres per side (the spawner keeps Big Macros off them)
    // the very first run: two fruit sugars right on the racing line in the Launch Tube
    if (this.daily == null && !((meta.runs || 0) > 0)) for (const [dy, dx] of [[3200, -18], [5600, 18]]) this.ents.push({ t: 'sugar', x: centre(startY + dy) + dx, y: startY + dy, r: 9, gift: 1 });
    // the very first swim sells the hook: a CONGA LINE of six slowpokes right on the racing line (the first dash
    // chains through them) and a free Second Wind for the first zones (p.freeSecond, gone from zone FREE_SECOND_ZONE + 1)
    if (this.daily == null && !((meta.runs || 0) > 0)) {
      const crowd = 0.95 * 430 * gs;
      CONGA.forEach(([dy, dx], j) => {
        const a = this.agents[nBoss + j], y = startY + dy;
        a.lane = clamp(dx / (params(y).hw * 0.9), -0.9, 0.9);
        Object.assign(a, { y, sp: crowd, stam: 1, deathY: Infinity, zone: -1, kx: 0, conga: CONGA_T, side: a.lane < 0 ? -1 : 1 });
        a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9);
      });
      this.p.second = 1; this.p.freeSecond = 1;
    }
  }

  // ---------------------------------------------------------------- derived stats
  refreshStats() {
    const m = this.muts, M = this.meta, s = {}, syn = this.syn;
    s.speed = 445 * (1 + broccoliFx(lv(M, 'broccoli'))) * (1 + 0.1 * Math.min(m.turbo || 0, MUTATIONS.turbo.max)) * (1 + 0.04 * (m.bloom ? this.cleared : 0)) * (syn.comeback && this.p.comeback ? 1.1 : 1);
    // every generation drains a little faster (+3% a generation to gen 10), and a bigger tank is a thirstier tail
    // (+1.5% per water level): the tank always matters
    s.drain = 4.3 * Math.pow(1 - HABIT_FX.sleep, lv(M, 'sleep')) * Math.pow(0.82, m.eco || 0) * genDrain(this.gen) * (1 + WATER_DRAIN * lv(M, 'water'));
    s.draft = 0.2 * (1 + 0.6 * (m.draft || 0)) * (1 + HABIT_FX.walk * lv(M, 'walk'));
    s.sugar = 6 * (1 + HABIT_FX.berries * lv(M, 'berries')) * (1 + 0.5 * (m.sweet || 0));
    s.magnet = 34 + 45 * (m.magnet || 0);
    s.acid = 26 * Math.pow(0.4, m.antacid || 0) * (this.rookie || 1) * hzMul(this.hzGen || 0, 0.08);
    s.combo = 2.2 + 1 * (m.memory || 0) + HABIT_FX.beatbox * lv(M, 'beatbox');
    // Whiplash: x0.8 cooldown and x0.85 cost a level (3 levels: 1.5 s and 4.9 energy, never a free permanent dash)
    s.dashCd = 3 * Math.pow(0.8, m.whip || 0);
    s.dashLen = syn.afterburner ? 1.4 : 1;
    s.dashCost = 8 * Math.pow(0.85, m.whip || 0);
    const hy = clamp(m.hype || 0, 0, 2);        // Hype Man: every level is 3 fewer combo and 2 s longer, as the card says
    s.frenzyAt = 10 - [0, 3, 6][hy];
    s.frenzyLen = 3.5 + [0, 2, 4][hy] + (syn.supernova ? 1.5 : 0);
    s.dnaBlob = 5 + 2 * (m.lucky || 0);
    s.keep = syn.elephant ? 0.75 : m.echo ? 0.5 : 0;     // share of a dropped combo that survives
    // Battering Ram: each level reaches 10 further, knocks harder, pays more energy and links more
    const ram = m.ram || 0;
    s.ramW = (syn.bulldozer ? 30 : 16) + 10 * Math.max(0, ram - 1);
    s.ramE = 3 * ram;
    s.ramN = Math.max(1, ram);
    s.ramKx = 2.2 + 0.8 * Math.max(0, ram - 1);
    this.s = s;
  }
  // a goo bonk sticks for 0.24 s on run 1, tapering with the rookie factor to the full 0.4 s
  gateStuck() { const f = this.rookie || 1; return 0.24 + 0.16 * clamp((f - ROOKIE_TAPER[0]) / (1 - ROOKIE_TAPER[0]), 0, 1); }
  muts1(id) { return this.muts[id] || 0; }
  synergyList() { return SYNERGIES.filter((x) => this.syn[x.id]); }
  frenzyThreshold(tier) {
    const at = this.s.frenzyAt, T = FRENZY_TIERS;
    if (tier < T.length) return Math.round(at * T[tier].at);
    return Math.round(at * T[T.length - 1].at + (tier - T.length + 1) * at * 3);   // past GOD MODE: refresh every 3x
  }
  // FRENZY points: the chain, minus the half-links you get for repeating one kind of move
  fzPoints() { return this.p.combo - this.p.fzPen; }
  tierOf(combo) { let t = 0; while (combo >= this.frenzyThreshold(t)) t++; return t; }
  // the tier you are allowed to reach: 1 in the Launch Tube, 3 before the Great Womb Sea, then all of them
  tierCap() { return this.zoneReached === 0 ? 1 : this.zoneReached < 3 ? 3 : FRENZY_TIERS.length; }

  computeRank() { let r = 1; const py = this.p.y; for (const a of this.agents) if (a.alive && (a.y > py || (a.arrived && this.drill && a.arrivedT < this.drill.t0))) r += a.arrived ? 1 : a.w; return Math.round(r); }
  computeAlive() { let n = 1; for (const a of this.agents) if (a.alive) n += a.arrived ? 1 : a.w; return Math.round(n); }
  // share of the million still swimming at y (story counter)
  keepAt(y) {
    const zi = zoneIndex(y); let k = 1; for (let i = 0; i < zi; i++) k *= ZONES[i].keep;
    return k * Math.pow(ZONES[zi].keep, clamp((y - ZSTART[zi]) / ZONES[zi].len, 0, 1));
  }

  emit(type, o = {}) { o.type = type; this.events.push(o); }

  // ---------------------------------------------------------------- random race events
  planEvents(lrng) {
    const zones = ['acid', 'goo', 'sea', 'rapids'].map((id) => ZONES.findIndex((z) => z.id === id)).filter((i) => i > 0);
    for (let i = zones.length - 1; i > 0; i--) { const j = Math.floor(lrng() * (i + 1)); [zones[i], zones[j]] = [zones[j], zones[i]]; }
    const out = [], used = new Set(), n = Math.min(3, zones.length);
    for (const zi of zones.slice(0, n).sort((a, b) => a - b)) {
      const zid = ZONES[zi].id, pool = EVENT_ORDER.filter((id) => !used.has(id) && id !== this.dailyRule && RACE_EVENTS[id].zones.includes(zid));
      if (!pool.length) continue;
      const id = pool[Math.floor(lrng() * pool.length)]; used.add(id);
      const y0 = ZSTART[zi] + 1500 + lrng() * Math.max(0, ZONES[zi].len - EVENT_LEN - 2500);
      out.push({ id, zi, y0, y1: y0 + EVENT_LEN });
    }
    return out;
  }
  eventAt(y) { for (const e of this.schedule) if (y >= e.y0 && y < e.y1) return e; return null; }
  stepEvent() {
    const e = this.eventAt(this.p.y), cur = this.ev;
    if (e === cur) return;
    if (cur) this.emit('eventEnd', { id: cur.id, name: RACE_EVENTS[cur.id].name });
    this.ev = e;
    if (e) { const E = RACE_EVENTS[e.id]; this.emit('event', { id: e.id, name: E.name, text: E.text, len: EVENT_LEN }); }
  }
  evIs(id) { return !!this.ev && this.ev.id === id; }
  // how strongly event id is on at y: 1 inside its scheduled window or the daily rule's zones, DAILY_LIGHT for the
  // daily rule elsewhere, else 0
  evK(id, y = this.p.y) {
    const e = this.eventAt(y);
    if (e && e.id === id) return 1;
    if (this.dailyRule !== id) return 0;
    return RACE_EVENTS[id].zones.includes(ZONES[zoneIndex(y)].id) ? 1 : DAILY_LIGHT;
  }

  // ---------------------------------------------------------------- mutation drafting
  // cards that would complete a synergy you hold one half of
  completers() {
    const out = new Set();
    for (const x of SYNERGIES) {
      if (this.syn[x.id]) continue;
      const [a, b] = x.needs, ha = (this.muts[a] || 0) > 0, hb = (this.muts[b] || 0) > 0;
      if (ha && !hb) out.add(b); else if (hb && !ha) out.add(a);
    }
    return out;
  }
  // can card id be in a deal dealt as draft number d? (not maxed; Egg Nose only before the Fork ends; Late Bloomer
  // only in the first 4 drafts; Goo Surfer never past the Gate of Goo unless it completes a synergy you hold half of)
  cardOpen(id, d, comp = this.completers()) {
    if (!MUTATIONS[id] || (this.muts[id] || 0) >= MUTATIONS[id].max) return false;
    if (id === 'nose' && this.p.y > FORK_END) return false;
    if (id === 'bloom' && d > 4) return false;
    if (id === 'goo' && this.zoneReached > GOO_I && !comp.has(id)) return false;
    return true;
  }
  // could card id still be dealt this run? (main.js: do not tease a synergy partner that can never come)
  canOffer(id) {
    const d = Math.max(1, this.draftN + (this.pending ? 0 : 1));
    if (id === 'nose' && !this.pending && this.zoneReached >= FORK_I) return false;   // the next deal is past the Fork
    return this.cardOpen(id, d);
  }
  draft(mid = false) { this.draftN++; this.pendingMid = mid; this.offer(); }
  // A deal: 3 cards, at most one legendary, a rare or better from draft 3, cards that complete a pair you hold
  // lean in. The mid-sea bonus deal is a GOLDEN DRAFT: 4 cards, rare or better only, legendaries twice as likely.
  // Pity: 3 deals in a row without a legendary guarantee one in the next.
  // ban: cards kept out of this deal (a reroll bans the hand it replaces), unless that leaves too few to deal.
  offer(ban = null) {
    const rng = this.orng, d = Math.max(1, this.draftN), mid = this.pendingMid, golden = !!mid;
    // a brand-new save always gets the same first hand (not counted towards the legendary pity); a reroll deals fresh
    if (!this.firstDealt && this.draftN === 1 && !mid && this.daily == null && !((this.meta.runs || 0) > 0)) {
      this.firstDealt = true;
      const picks = FIRST_DEAL.filter((id) => MUTATIONS[id] && (this.muts[id] || 0) < MUTATIONS[id].max);
      if (picks.length === FIRST_DEAL.length) { this.pending = picks; this.emit('offer', { picks, mid: false, draft: d, first: true }); return; }
    }
    this.firstDealt = true;
    const comp = this.completers();
    let pool = MUT_ORDER.filter((id) => this.cardOpen(id, d, comp));
    if (golden && pool.some((id) => MUTATIONS[id].r >= 2)) pool = pool.filter((id) => MUTATIONS[id].r >= 2);
    if (ban && ban.length) { const rest = pool.filter((id) => !ban.includes(id)); if (rest.length >= (golden ? 4 : 3)) pool = rest; }
    const t = clamp((d - 1) / 4, 0, 1), RW = [lerp(10, 6, t), lerp(4, 5, t), lerp(2, 3, t) * (golden ? 2 : 1)];
    // Antacid Coat past the Acid Lagoon is a weak card: dealt a quarter as often (unless it completes Hazmat)
    const late = (id) => (id === 'antacid' && this.zoneReached > ACID_I && !comp.has(id) ? 0.25 : 1);
    // the first mashup is a sure thing: until a save has seen any synergy, a completer is always dealt (and leans in x6)
    const hook = this.daily == null && !((this.meta.synergiesSeen || []).length);
    const wOf = (id) => RW[MUTATIONS[id].r - 1] * (comp.has(id) ? (hook ? 6 : 3) : 1) * late(id);
    const take = (cands) => {
      const ws = cands.map(wOf); let r = rng() * ws.reduce((a, b) => a + b, 0), k = 0;
      while (k < ws.length - 1 && r > ws[k]) { r -= ws[k]; k++; }
      return cands[k];
    };
    const picks = [], size = golden ? 4 : 3;
    const add = (id) => { picks.push(id); pool.splice(pool.indexOf(id), 1); if (MUTATIONS[id].r === 3) for (let i = pool.length - 1; i >= 0; i--) if (MUTATIONS[pool[i]].r === 3) pool.splice(i, 1); };
    const legs = pool.filter((id) => MUTATIONS[id].r === 3);
    if (this.noLeg >= 3 && legs.length) add(take(legs));        // pity
    const forced = pool.filter((id) => comp.has(id));
    if (forced.length && rng() < (hook ? 1 : 0.5)) add(take(forced));
    while (picks.length < size && pool.length) add(take(pool));
    if (d >= 3 && picks.length && !picks.some((id) => MUTATIONS[id].r >= 2)) {   // a rare or better is guaranteed from draft 3
      const rare = pool.filter((id) => MUTATIONS[id].r >= 2);
      if (rare.length) picks[picks.length - 1] = take(rare);
    }
    if (!picks.length) { this.pending = null; this.pendingMid = false; return; }   // nothing left to deal: swim on
    this.noLeg = picks.some((id) => MUTATIONS[id].r === 3) ? 0 : this.noLeg + 1;
    this.pending = picks;
    const o = { picks, mid, draft: d };
    if (golden) o.golden = true;
    this.emit('offer', o);
  }
  // a reroll deals a fresh hand (never the same cards while 3+ others are open) and does not count for the pity
  reroll() {
    if (!this.pending || this.rerolls <= 0) return false;
    this.rerolls--;
    const noLeg = this.noLeg, ban = this.pending.slice();
    this.offer(ban);
    this.noLeg = noLeg;
    return true;
  }
  choose(id) {
    if (!this.pending || !this.pending.includes(id)) return false;
    this.muts[id] = (this.muts[id] || 0) + 1; this.pending = null; this.pendingMid = false;
    const p = this.p;
    if (id === 'tank') { p.maxE += 30; p.e = p.maxE; }
    if (id === 'helmet') p.shield++;
    if (id === 'wingman') p.wing = this.muts.wingman;
    if (id === 'second') { p.second = 1; p.freeSecond = 0; }
    this.emit('mutation', { id });
    for (const x of SYNERGIES) {
      if (this.syn[x.id] || !x.needs.includes(id) || !x.needs.every((n) => this.muts[n] > 0)) continue;
      this.syn[x.id] = true;
      const seen = this.meta.synergiesSeen; const fresh = Array.isArray(seen) && !seen.includes(x.id);
      if (fresh) { seen.push(x.id); this.dnaRun += SYNERGY_BONUS; this.dnaBonus += SYNERGY_BONUS; }
      this.emit('synergy', { id: x.id, name: x.name, icon: x.icon, desc: x.desc, needs: x.needs, fresh, bonus: fresh ? SYNERGY_BONUS : 0 });
    }
    this.refreshStats();
    return true;
  }

  // ---------------------------------------------------------------- spawning
  // Each 100-unit row gets its own generator seeded from the layout seed, so a daily race lays
  // out the same rows for everybody no matter how they swam before.
  // does row y hold a goo gate? (fixed by the row alone, so the spawner can clear the rows around it first)
  gateRow(y) { const zi = zoneIndex(y), z = ZONES[zi]; return !!z.hazards.gate && y % 1300 < 100 && y > ZSTART[zi] + 500 && y < ZSTART[zi] + z.len - 500; }
  hzNew(id, e) {
    const seen = this.hzSeen || (this.hzSeen = {});
    if (seen[id]) return;
    seen[id] = 1; this.emit('hzNew', { id, x: e.x, y: e.y });
  }
  spawnAhead() {
    const p = this.p, m = this.muts, hg = this.hzGen;
    while (this.genY < p.y + 2200 && this.genY < RACE_LEN - 400) {
      const y = this.genY, zi = zoneIndex(y), z = ZONES[zi], hz = z.hazards;
      const step = 100; this.genY += step;
      // fairness: nothing hostile right in front of you, nothing in the calm stretch after a backflow,
      // and a gate row is resolved first: no puddles from 200 before it to 100 after it, no Big Macro on it
      const hostile = y >= this.calmY && y >= p.y + 450;
      const gateHere = this.gateRow(y), nearGate = gateHere || this.gateRow(y - 100) || this.gateRow(y + 100) || this.gateRow(y + 200);
      this.puddles = this.puddles.filter((q) => q.y >= y - 200);
      if (this.ciliaYs.length) this.ciliaYs = this.ciliaYs.filter((c) => c.y >= y - 400);
      const sides = y >= FORK_Y0 ? (y >= FORK_END ? [p.side || 1] : [-1, 1]) : [0];
      const kSugar = this.evK('sugarRush', y), kGold = this.evK('goldRush', y), kStamp = this.evK('stampede', y);
      // from generation 2 the fruit thins out (to x0.74 by gen 7, spread so mid-career is no wall): the tank matters all career
      const sugarP = (hz.sugar || 0) * 0.06 * (1 + 2 * kSugar) * fruitMulOf(hg) * (zi === 0 && this.rookie && !(this.meta.runs > 0) ? 1.4 : 1);
      const dnaP = 0.012 * (1 + 0.5 * (m.lucky || 0)) * (1 + 5 * kGold);
      // rookies meet a few fewer Big Macros (x0.82 on run 1, back to x1 after run 5)
      const wbcP = ((hz.wbc || 0) * 0.05 + 0.07 * kStamp) * hzMul(hg, 0.1) * (this.rookie ? 0.6 + 0.4 * this.rookie : 1);
      // puddles: the Launch Tube has its first few only past its first 3500 and never on a rookie run; none at the Fork's
      // split (FORK_Y0 +/- 600), where you have a tube to pick
      const poolsOK = zi !== 0 || (y >= ZSTART[0] + 3500 && !this.rookie);
      const forkBand = (e) => e.y > FORK_Y0 - 600 && e.y < FORK_Y0 + 600;
      const hzA = hzMul(hg, 0.08);
      for (const side of sides) {
        const rng = mulberry((this.layoutSeed ^ Math.imul((y / step) * 3 + side + 2, 0x2C1B3C6D)) >>> 0);
        const ch = channel(y, side), bl = Math.max(ch.c - ch.h + 9, EDGE), br = Math.min(ch.c + ch.h - 9, VIEW_W - EDGE);
        const rx = () => clamp(ch.c + (rng() * 2 - 1) * ch.h * 0.8, bl, br), blob = 0.55 * ch.h;
        if (sugarP && rng() < sugarP) {           // a little trail of fruit sugar
          const x0 = rx(), dx = (rng() * 2 - 1) * 14, n = 3 + Math.floor(rng() * 3);
          for (let k = 0; k < n; k++) this.ents.push({ t: 'sugar', x: clamp(x0 + dx * k, bl + 3, br - 3), y: y + k * 34, r: 9 });
        }
        if (rng() < dnaP) this.ents.push({ t: 'dna', x: rx(), y: y + 50, r: 11 });
        if (rng() < 0.004 && zi > 0) this.ents.push({ t: 'shield', x: rx(), y: y + 50, r: 13 });
        // (every roll is drawn even when the spawn is skipped, so the daily layout stays the same for everybody)
        // (a puddle right under the last Big Macro on this side is skipped: no acid or goo trap below a mouth)
        const underMac = (e) => { const wy = this.lastWbcY[side], wx = this.lastWbcX[side]; return wy != null && Math.abs(e.y - wy) < 220 && Math.abs(e.x - wx) < e.r + 50; };
        if (hz.acid && rng() < 0.2 * hz.acid * hzA) {
          const e = { t: 'acid', x: rx(), y: y + rng() * 100, r: Math.min(26 + rng() * 40, blob), seed: rng() * 9 };
          if (hg >= HZ_NEW.pulse && rng() < 0.5) { e.pulse = 1; e.r0 = e.r; }
          if (!nearGate && poolsOK && !forkBand(e) && !underMac(e)) { this.puddles.push({ x: e.x, y, r: e.r, side }); if (hostile) { this.ents.push(e); if (e.pulse) this.hzNew('pulse', e); } }
        }
        if (hz.alkali && rng() < 0.06 * hz.alkali) this.ents.push({ t: 'alkali', x: rx(), y: y + 50, r: 11 });
        if (hz.goo && rng() < 0.1 * hz.goo * hzA) {
          const e = { t: 'goo', x: rx(), y: y + rng() * 100, r: Math.min(30 + rng() * 34, blob), seed: rng() * 9 };
          if (!nearGate && poolsOK && !forkBand(e) && !underMac(e)) { this.puddles.push({ x: e.x, y, r: e.r, side }); if (hostile) this.ents.push(e); }
        }
        if (gateHere) {
          const gw = Math.max(66, 78 - 3 * hg) + rng() * 30, n2 = rng() < 0.45 ? 2 : 1, gaps = [];
          for (let k = 0; k < n2; k++) gaps.push(bl + gw / 2 + 1 + rng() * Math.max(0, br - bl - gw - 2));
          const e = { t: 'gate', x: ch.c, y, r: ch.h, gaps, gw, side, bonkT: 0, contact: 0 };
          if (hg >= HZ_NEW.slide) {    // a sliding gate: its gaps sway, never out of the tube
            e.slide = (rng() < 0.5 ? -1 : 1) * slideAmp(hg); e.sph = rng() * TAU; e.g0 = gaps.slice();
            e.lo = Math.min(bl + gw / 2, br - gw / 2); e.hi = Math.max(bl + gw / 2, br - gw / 2);
          }
          if (hostile) { this.ents.push(e); if (e.slide) this.hzNew('slide', e); }
        }
        if (wbcP && rng() < wbcP) {
          const e = { t: 'wbc', x: rx(), y: y + 50, r: 22 + rng() * 8, vx: 0, vy: 0, hunt: 0, eat: 0, ph: rng() * 6, spot: 0, side };
          // never parked on a puddle from the last two rows: up to 3 re-rolls of x
          const onPuddle = () => this.puddles.some((q) => q.side === side && Math.abs(q.x - e.x) < q.r + 50);
          for (let k = 0; k < 3 && onPuddle(); k++) e.x = rx();
          const dry = !onPuddle();      // (still on one after 3 tries: this row gets no Big Macro)
          // fair Big Macros: one per 380 on a side (240 in a stampede), and none within 300 of a wall hair.
          // (the rolls above are always drawn, so the daily layout stays the same for everybody)
          const last = this.lastWbcY[side], gap = 380 - 140 * kStamp;
          const spaced = !(last != null && Math.abs(e.y - last) < gap) && !this.ciliaYs.some((c) => c.side === side && Math.abs(c.y - e.y) < 300);
          const twin = hg >= HZ_NEW.twins && rng() < 0.25;
          if (spaced && dry && !gateHere) {
            this.lastWbcY[side] = e.y; this.lastWbcX[side] = e.x; if (hostile) this.ents.push(e);
            // twins: a mirrored second cell 120 lower (never on a gate row, a puddle or within 300 of a wall hair)
            const ty = e.y - 120, tw = { ...e, x: clamp(2 * ch.c - e.x, bl, br), y: ty, ph: e.ph + 1.5, twin: 1 };
            const tRow = Math.floor(ty / 100) * 100;
            if (twin && hostile && ty >= this.calmY && ty >= p.y + 450 && !this.gateRow(tRow) && !this.gateRow(tRow - 100) && !this.gateRow(tRow + 100)
              && !this.ciliaYs.some((c) => c.side === side && Math.abs(c.y - ty) < 300) && !this.puddles.some((q) => q.side === side && Math.abs(q.x - tw.x) < q.r + 50)) {
              this.ents.push(tw); this.hzNew('twins', tw);
            }
          }
        }
        if (hz.current && rng() < 0.03 * hz.current) { const e = { t: 'current', x: ch.c, y, r: ch.h, h: 260 + rng() * 200, dir: rng() < 0.5 ? -1 : 1 }; if (hostile) this.ents.push(e); }
        if (hz.cilia && rng() < 0.05 * hz.cilia * hzMul(hg, 0.1)) {   // a little hair on one wall that swats you aside on the beat
          const wall = this.ciliaN++ % 2 ? 1 : -1, len = 0.45 + rng() * 0.2, beat = 60 / (z.beat || 120);
          const period = Math.max(2, Math.round(1.6 / beat)) * beat;
          const e = { t: 'cilia', x: ch.c + wall * ch.h, y: y + 50, r: len * 2 * ch.h, wall, len, period, off: Math.floor(rng() * 8) * beat, state: 0, phase: 0 };
          if (hostile) this.ents.push(e);
          // a pair: a twin hair on the opposite wall, swatting half a period later
          if (hg >= HZ_NEW.pair && rng() < 0.4 && hostile) {
            const e2 = { ...e, wall: -wall, x: ch.c - wall * ch.h, off: e.off + period / 2, pair: 1 };
            this.ents.push(e2); this.hzNew('pair', e2);
          }
          // a hair clears the Big Macros spawned in the 300 before it (they are still far off screen)
          this.ciliaYs.push({ y: e.y, side });
          for (const w of this.ents) if (w.t === 'wbc' && !w.dead && (w.side == null || w.side === side) && Math.abs(w.y - e.y) < 300 && w.y >= p.y + 450) w.dead = 1;
        }
      }
    }
  }

  // ---------------------------------------------------------------- autopilot (also the test bot)
  autoSteer() {
    const p = this.p, nose = this.muts.nose, fs = nose ? this.eggSide : this.autoFork;
    const ch = channel(p.y + 120, p.side || (p.y > FORK_Y0 - 1500 ? fs : 0));
    const bl = Math.max(ch.c - ch.h + 9, EDGE), br = Math.min(ch.c + ch.h - 9, VIEW_W - EDGE);
    let best = p.x, bestS = -1e9;
    const forkSide = p.side || (p.y > FORK_Y0 - 1500 ? fs : 0);
    for (let k = 0; k <= 16; k++) {
      let x = clamp(ch.c - ch.h + 14 + (ch.h * 2 - 28) * k / 16, bl, br);
      if (forkSide && p.y > FORK_Y0 - 1500 && p.y < FORK_Y0 + 400) { const c2 = centre(FORK_Y0 + 400); x = clamp(c2 + forkSide * (30 + 120 * k / 16), EDGE, VIEW_W - EDGE); }
      let s = -Math.abs(x - p.x) * 0.08 - Math.abs(x - ch.c) * 0.02;
      for (const e of this.ents) {
        const dy = e.y - p.y; if (dy < -20 || dy > 420 || e.dead) continue;
        const near = Math.abs(e.x - x) < e.r + 18, w = 1 - dy / 500;
        if (e.t === 'sugar' && Math.abs(e.x - x) < 26) s += 30 * w * (p.e < p.maxE - 8 ? 1 : 0.2);
        else if (e.t === 'dna' && Math.abs(e.x - x) < 26) s += 20 * w;
        else if (e.t === 'acid' && near) s -= 70 * w;
        else if (e.t === 'goo' && near) s -= 40 * w;
        else if (e.t === 'wbc' && Math.abs(e.x - x) < e.r + 40) s -= 200 * w;
        else if (e.t === 'gate' && dy < 300) { if (!e.gaps.some((g) => Math.abs(g - x) < e.gw / 2 - 12)) s -= 400 * w; }
        else if (e.t === 'cilia' && dy < 200 && Math.abs(x - e.x) < e.r + 10) s -= 50 * w;
      }
      if (s > bestS) { bestS = s; best = x; }
    }
    // currents: lean 50 into the push (it still drifts you a bit: the autopilot fights it, badly)
    for (const e of this.ents) if (e.t === 'current' && p.y + 60 > e.y && p.y < e.y + e.h) { best = clamp(best - 50 * e.dir, bl, br); break; }
    this.input.tx = best;
    this.input.dash = p.e > 60 && p.dashCd <= 0 && p.stuck <= 0;
  }

  // ---------------------------------------------------------------- one simulation step
  step(dt) {
    if (!(dt > 0) || dt > 0.25) return;
    if (this.over || this.pending || this.paused) return;
    this.t += dt;
    if (this.autopilot && !this.bot) this.autoT += dt;
    const p = this.p, s = this.s;
    if (!this.threatSent) {
      this.threatSent = true; if (this.threatK >= 0) this.emit('threat', { k: this.threatK, boss: RIVALS[this.threatK].name });
      if (this.dailyRule) { const E = RACE_EVENTS[this.dailyRule]; this.emit('dailyRule', { id: this.dailyRule, name: E.name, text: E.text, zones: E.zones.slice() }); }
    }
    if (this.drill) { this.input.cashOut = false; this.stepDrill(dt); return; }
    if (this.input.cashOut) { this.input.cashOut = false; this.cashOut(); }
    this.spawnAhead();
    if (this.autopilot) this.autoSteer();

    // zone progress and mutation drafts (none at the egg: it is time to drill, not shop)
    const zi = zoneIndex(p.y);
    if (zi > this.zoneReached) {
      this.zoneReached = zi; this.cleared = zi; p.wing = this.muts.wingman || 0; p.zoneBonks = 0;
      if (zi >= FREE_SECOND_ZONE + 1 && p.freeSecond) { p.freeSecond = 0; if (!this.muts.second) p.second = 0; }   // the free one is spent
      this.refreshStats();
      const egg = !!ZONES[zi].egg;
      this.emit('zone', { zi, draft: !egg });
      if (egg) this.finale();
      else { this.draft(false); return; }
    }
    if (zi === SEA_I && !this.midDraft && p.y >= MID_DRAFT_Y) { this.midDraft = true; this.draft(true); return; }
    this.stepEvent();
    if (!p.side && p.y >= FORK_Y0) {
      p.side = p.x < centre(p.y) ? -1 : 1; this.emit('fork', { side: p.side, right: p.side === this.eggSide });
      if (this.syn.bloodhound && p.side === this.eggSide) this.igniteFrenzy('bloodhound');   // Bloodhound: the right tube lights FRENZY
    }

    // timers
    p.dashCd = Math.max(0, p.dashCd - dt); p.dashT = Math.max(0, p.dashT - dt); p.inv = Math.max(0, p.inv - dt); p.stuck = Math.max(0, p.stuck - dt);
    p.swatSafe = Math.max(0, p.swatSafe - dt); p.actT += dt;
    this.tickFrenzy(dt);
    // bridges: a draft or a dash holds the chain (the timer drains at DRAFT_DRAIN / DASH_DRAIN). Not in FRENZY: it
    // is the high, not the gap between two moves.
    if (p.combo > 0) { p.comboT -= dt * (p.frenzyT > 0 ? 1 : p.draft > 0.08 ? DRAFT_DRAIN : p.dashT > 0 ? DASH_DRAIN : 1); if (p.comboT <= 0) this.dropCombo(); }
    const frenzy = p.frenzyT > 0, nitro = frenzy && this.muts.nitro, tier = frenzy ? p.tier : 0;
    const safe = nitro || tier >= 5;            // nothing can hurt you
    const kSneeze = this.evK('sneeze'), kSlip = this.evK('slipstream'), kEsp = this.evK('espresso');

    // dash
    const jet = this.syn.jetstream && p.draft > 0.08;
    if (this.input.dash && p.dashCd <= 0 && (p.e > s.dashCost || nitro || jet)) {
      p.dashT = (jet ? 0.85 : 0.55) * s.dashLen; p.dashCd = s.dashCd; if (!nitro && !jet) p.e -= s.dashCost;
      if (this.syn.afterburner && p.frenzyT > 0) p.frenzyT = Math.min(p.frenzyT + 0.3, s.frenzyLen * 2);
      p.actT = 0; p.slingOK = true; p.dashN++;
      this.emit('dash', { jet });
    }
    this.input.dash = false;

    // steering: a finger gets a snappier, damped response; keys and the autopilot keep the softer one
    const ch = channel(p.y, p.side);
    let tx = this.input.tx;
    if (tx != null && !isFinite(tx)) tx = this.input.tx = null;
    if (tx == null && this.input.dir) tx = p.x + this.input.dir * 120;
    const touch = this.input.touch && !this.autopilot && tx != null;
    // a lifted finger holding its lane (main.js holdTick: finger false) is hands off, not steering
    const held = touch && this.input.finger === false, steer = held ? null : tx;
    // the thumb matters: p.actT is the time since the last real input (the steer target moved 20+ against the
    // tube's centre line, a dash, a draft). Measured on the offset, so a held lane riding the wiggle is not input.
    if (tx != null) {
      const off = tx - ch.c;
      // (a deliberate steer also breaks the draft magnet's lock at once)
      if (p.lastOff == null || Math.abs(off - p.lastOff) >= 20) { if (p.lastOff != null) p.draftLock = null; p.lastOff = off; p.actT = 0; }
      if (p.magOff == null || Math.abs(off - p.magOff) >= 12) { p.magOff = off; p.magT = this.t; }
      p.lastTx = tx;
    }
    if (p.draft > 0.1 && steer != null) p.actT = 0;       // holding a draft counts while you steer, not while you drift
    let want = 0;
    if (tx != null) {
      want = (tx - p.x) * (touch ? 26 : 9);
      if (touch) want -= p.vx * 0.45;
      // a finger at speed can move further sideways (last step's forward speed, up to x1.35)
      const cap = touch ? (p.dashT > 0 ? 560 : 460) * clamp(p.vy / 445, 1, 1.7) : 460;
      want = clamp(want, -cap, cap);
    }
    p.vx += (want - p.vx) * Math.min(1, dt * (touch ? 30 : 12));
    if (kSneeze) p.vx += Math.sin(this.t * 2.6) * 420 * kSneeze * dt;    // turbulence

    // drafting: tuck in behind a rival. A draft you hold is kept until the rival is DRAFT_KEEP off your line
    // (hysteresis), a finger on the glass catches one from DRAFT_ACQ_TOUCH (else DRAFT_ACQ)
    let target = null, bestD = 1e9;
    const lock = p.draftLock, okDraft = (a) => a.alive && !a.arrived && a.y - p.y >= 12 && a.y - p.y <= 95 && !(p.y >= FORK_Y0 && a.side !== p.side);
    if (lock && okDraft(lock) && Math.abs(this.agentX(lock) - p.x) <= DRAFT_KEEP) target = lock;
    else {
      const acq = touch && this.input.finger === true ? DRAFT_ACQ_TOUCH : DRAFT_ACQ;
      // (stepAgents keeps the swimmers within 400 of you from the last step: nobody moves 300 in one step)
      for (const a of this.nearA && Math.abs(p.y - this.nearY) < 200 ? this.nearA : this.agents) {
        if (!okDraft(a)) continue;
        const dy = a.y - p.y, dx = Math.abs(this.agentX(a) - p.x); if (dx < acq && dy < bestD) { bestD = dy; target = a; }
      }
    }
    p.draftLock = target;
    // a draft you drift into with no hands is half as strong: tucking in is something the thumb does
    const lazy = p.actT >= IDLE_T && steer == null ? IDLE_DRAFT : 1;
    p.draft += ((target ? s.draft * (1 + kSlip) * lazy : 0) - p.draft) * Math.min(1, dt * (target ? 3 : 5));
    this.draftTarget = target; if (target) target.draftedT = this.t;
    // a real draft (tucked in for SLING_HOLD s) loads one slingshot: a pass within 0.5 s of leaving it
    if (p.draft > 0.08) { if (!(p.draftHold > 0)) p.draftN++; const held0 = p.draftHold || 0; p.draftHold = held0 + dt; p.draftT = this.t; if (p.draftHold >= SLING_HOLD) { if (held0 < SLING_HOLD) p.slingOK = true; this.seqPush('draft'); } } else p.draftHold = 0;
    // the draft magnet: a thumb holding still (the steer offset moved under 12 in the last 0.25 s) behind a drafted
    // rival is pulled onto its line (up to DRAFT_MAG px/s), so a phone-sized thumb can hold a draft
    let mag = 0;
    if (target && touch && steer != null && this.t - p.magT >= 0.25) mag = clamp((this.agentX(target) - p.x) * 8, -DRAFT_MAG, DRAFT_MAG);

    // currents: a real sideways push; swimming with it is a little faster, against it a little slower
    let cur = null;
    for (const e of this.ents) if (e.t === 'current' && p.y > e.y && p.y < e.y + e.h) { cur = e; break; }
    p.current = cur ? (p.vx * cur.dir > 30 ? 1 : p.vx * cur.dir < -30 ? -1 : 0) : 0;

    // forward speed
    let sp = s.speed * (1 + p.draft + (tier ? FRENZY_TIERS[Math.min(tier, FRENZY_TIERS.length) - 1].speed : 0) + (p.dashT > 0 ? 0.75 : 0));
    if (kEsp) sp *= 1 + 0.12 * kEsp;
    // hands off in the Launch Tube (a held lane counts as hands off: its offset never moves): the pack keeps up with you
    // (a finger resting on the glass is playing: it is not slowed)
    const idle = p.actT >= IDLE_T && this.input.finger !== true;
    if (zi === 0 && p.actT >= IDLE_T && this.input.finger !== true) sp *= IDLE_LAUNCH;
    // the very first swim: a thumb that plays climbs the crowd far faster than one that does not (the speed over
    // the crowd's x FIRST_IDLE idle, x FIRST_ACTIVE playing)
    if (zi === 0 && !(this.meta.runs > 0) && this.daily == null) {
      const crowd = 0.95 * 430 * genSpeed(this.gen), rel = sp - crowd;
      sp = crowd + (idle ? (rel > 0 ? rel * FIRST_IDLE : rel / FIRST_IDLE) : rel > 0 ? rel * FIRST_ACTIVE : rel);
    }
    const z = ZONES[zi];
    if (z.current) { const rel = Math.abs(p.x - ch.c) / ch.h; sp *= 1 - z.current * (0.55 + 0.9 * rel * rel); }
    if (cur) sp *= 1 + 0.08 * p.current;
    if (p.e < 15) sp *= 0.55 + 0.45 * Math.max(0, p.e) / 15;
    let inAcid = false, inGoo = false;
    for (const e of this.ents) {
      const dy = e.y - p.y; if (dy > 200 || dy < -200) continue;
      if (e.t === 'acid' || e.t === 'goo') {
        // near misses pay on the way OUT: brushed the edge, never touched the middle
        const d = Math.hypot(e.x - p.x, (e.y - p.y) * 1.3);
        if (d < e.r) {
          if (e.t === 'acid') inAcid = true; else inGoo = true; e.touched = 1;
          if (this.syn.hazmat && !e.paid) { e.paid = 1; this.nearMiss(e.x, e.y); }   // Hazmat: a touch is a near miss
        }
        else if (d < e.r + 18) e.near = 1;
        if (e.near && !e.touched && !e.paid && p.y - e.y > e.r * 0.8) { e.paid = 1; this.nearMiss(e.x, e.y); }
      }
    }
    if (inAcid && !safe && tier < 4) { sp *= 0.8; p.e -= s.acid * dt; p.acid = 1; p.acidT = this.t; p.lastHit = 'acid'; } else p.acid = Math.max(0, p.acid - dt * 2);
    if (inGoo) sp *= this.muts.goo ? 0.9 : 0.5;
    if (p.stuck > 0) sp *= 0.15;
    p.vy = sp;

    // move, gates, walls
    this.prevPY = p.y;
    let ny = p.y + p.vy * dt;
    for (const e of this.ents) {
      if (e.t !== 'gate') continue;
      if (e.bonkT > 0) e.bonkT -= dt;
      if (e.slide) { const o = e.slide * Math.sin(this.t * TAU * SLIDE_HZ + e.sph); for (let k = 0; k < e.gaps.length; k++) e.gaps[k] = clamp(e.g0[k] + o, e.lo, e.hi); }
      if (p.y >= FORK_Y0 && e.side && e.side !== p.side) continue;
      const inGap = e.gaps.some((g) => Math.abs(g - p.x) < e.gw / 2 - 6);
      // contact: time spent pressed against this wall (bonked back or pinned), for the mercy squelch
      if (!inGap && e.bonked && p.y >= e.y - 24 && p.y < e.y - 9 && !this.muts.goo && !safe) e.contact = (e.contact || 0) + dt;
      if (!e.squelch && !inGap && p.y < e.y - 9 && ny >= e.y - 9) {
        if (this.muts.goo || safe) { if (!e.surf) { e.surf = 1; this.emit('surf', { x: p.x, y: e.y }); } continue; }
        if (e.contact >= 1.2) { e.squelch = 1; e.passed = 1; this.emit('surf', { x: p.x, y: e.y, squelch: true }); continue; }   // mercy: you ooze through
        if (!(e.bonkT > 0)) { e.bonkT = 0.7; e.bonked = 1; p.stuck = this.gateStuck(); p.vy = 0; p.zoneBonks++; p.lastHit = 'bonk'; ny = e.y - 22; this.emit('bonk', { x: p.x, y: e.y }); this.breakCombo('bonk', p.x, e.y); }
        else ny = Math.max(p.y, e.y - 9.5);          // still pinned: hold quietly
        break;
      } else if (p.y < e.y && ny >= e.y && !e.passed) { e.passed = 1; this.addCombo('gate', p.x, e.y); }
    }
    p.y = ny;
    p.x += (p.vx + mag) * dt;
    const bl = Math.max(ch.c - ch.h + 9, EDGE), br = Math.min(ch.c + ch.h - 9, VIEW_W - EDGE);
    if (p.x < bl) { p.x = bl; p.vx = Math.abs(p.vx) * 0.3; } else if (p.x > br) { p.x = br; p.vx = -Math.abs(p.vx) * 0.3; }
    // pushes that steering cannot cancel: currents and cilia swats
    let push = 0;
    if (cur) push += cur.dir * 120 * smooth(Math.min(p.y - cur.y, cur.y + cur.h - p.y) / 60);
    if (p.swatT > 0) { push += p.swatDir * 600; p.swatT -= dt; }
    if (push) p.x = clamp(p.x + push * dt, bl, br);
    p.heading = Math.atan2(p.vx, Math.max(60, p.vy));

    // energy
    const drafting = p.draft > 0.05, couch = this.syn.couchPotato && drafting;
    if (!couch) p.e -= s.drain * (1 + 0.05 * zi) * dt * (drafting ? 0.65 : 1) * (1 + 0.25 * kEsp) * (this.rookie && zi < EGG_I ? this.rookie : 1);
    if (this.muts.draft && p.draft > 0.1) p.e += 1.2 * this.muts.draft * dt;
    if (couch) { p.couchT += dt; if (p.couchT >= 1.5) { p.couchT -= 1.5; this.addCombo('draft', p.x, p.y); } }   // Couch Potato

    // pickups and enemies
    this.stepEnts(dt, frenzy, safe, tier);
    if (this.over) return;
    this.stepAgents(dt);
    if (this.over) return;
    this.checkGoal();

    p.e = Math.min(p.e, p.maxE);
    const wrongTube = p.side && p.side !== this.eggSide && p.y >= FORK_Y0;
    if (p.e <= 0) {
      // (the first swim's free one only works up to zone FREE_SECOND_ZONE)
      if (p.second && p.freeSecond && !this.muts.second && this.zoneReached > FREE_SECOND_ZONE) { p.second = 0; p.freeSecond = 0; }
      if (p.second) {
        const free = !!p.freeSecond && !this.muts.second;
        p.second = 0; p.freeSecond = 0; p.e = 60; p.inv = 2;
        if (this.syn.reserveTank) { p.e = p.maxE; p.shield++; }
        this.emit('second', { reserve: !!this.syn.reserveTank, free });
        if (this.syn.comeback) { p.comeback = 1; this.refreshStats(); p.frenzyT = Math.max(p.frenzyT, this.s.frenzyLen); p.tier = Math.max(p.tier, 1); p.fz = Math.max(p.fz, 1); p.frenzyTier = Math.max(p.frenzyTier || 0, p.tier); this.emit('frenzy', { n: p.combo, first: true, tier: p.tier, name: FRENZY_TIERS[p.tier - 1].name, comeback: true }); }
      }
      else return this.end(wrongTube ? 'wrong' : 'energy');
    }
    // the wrong tube is a dead end: the backflow spits you out at the fork exit, dizzy and drained
    if (wrongTube && p.y >= DEAD_Y - 40) {
      this.emit('backflow', { x: p.x, y: p.y });
      p.e -= 25;
      if (p.e <= 0) return this.end('wrong');
      p.side = this.eggSide; p.y = FORK_END; this.prevPY = p.y; p.x = channel(p.y, p.side).c; p.vx = 0; p.stuck = 1.2;
      p.inv = Math.max(p.inv, 1.8); this.calmY = FORK_END + 700;      // a safe landing: no hostiles in the first 700
      this.ents = this.ents.filter((e) => e.y < FORK_END - 100); this.genY = Math.floor((FORK_END - 100) / 100) * 100;
      this.backflowed = (this.backflowed || 0) + 1;
      this.stepAgents(0);
      return;
    }
    if (p.y >= RACE_LEN - 70) this.startDrill();
  }

  // ---------------------------------------------------------------- combos
  // one link in the chain. n links at once (Chain Reaction doubles, Slick Moves adds).
  addCombo(kind, x, y, n = 1) {
    this.linkCombo(kind, x, y, n);
    if (kind !== 'trick') this.seqPush(kind, x, y);
  }
  // the combo timer's full length right now: longer in ULTRA FRENZY+ and the Disco Tube, shorter on a long chain
  comboMaxOf(p = this.p) {
    const tierLong = p.frenzyT > 0 && p.tier >= 3 ? 1.5 : 1, disco = 1 + 0.5 * this.evK('disco');
    return this.s.combo * tierLong * disco * comboHeat(p.combo);
  }
  // SIGNATURE TRICKS: p.seq holds the last 3 kinds {kind, t} (a repeat of the last kind only refreshes its time)
  seqPush(kind, x, y) {
    const p = this.p, q = p.seq || (p.seq = []);
    const last = q[q.length - 1];
    if (last && last.kind === kind) { last.t = this.t; return; }
    q.push({ kind, t: this.t }); if (q.length > 3) q.shift();
    if (q.length < 3 || this.t - q[0].t > TRICK_T) return;
    const T = TRICKS.find((tr) => tr.kinds[0] === q[0].kind && tr.kinds[1] === q[1].kind && tr.kinds[2] === q[2].kind);
    if (!T) return;
    q.length = 0;
    this.trick(T, x != null ? x : p.x, y != null ? y : p.y);
  }
  trick(T, x, y) {
    const p = this.p, M = this.meta, run = this.tricksRun || (this.tricksRun = {}), chain = p.trickChain || (p.trickChain = {});
    const first = !run[T.id], repeat = !!chain[T.id], k = repeat ? 0.5 : 1;
    run[T.id] = (run[T.id] || 0) + 1; chain[T.id] = 1;
    const n = (TRICK_LINKS + (first ? TRICK_FIRST : 0)) * k;
    p.trickMult = Math.min(TRICK_MULT_CAP, Math.round(((p.trickMult || 0) + TRICK_MULT * k) * 100) / 100);
    if (p.frenzyT > 0) p.frenzyT = Math.min(p.frenzyT + TRICK_FRENZY * k, this.s.frenzyLen * 2);
    let firstEver = false;
    if (M && M.tricks && typeof M.tricks === 'object') {
      firstEver = !(M.tricks[T.id] > 0);
      M.tricks[T.id] = (M.tricks[T.id] || 0) + 1;
      if (firstEver) { this.dnaRun += TRICK_DNA; this.dnaBonus += TRICK_DNA; }
    }
    this.emit('trick', { id: T.id, n, first, repeat, kinds: T.kinds.slice(), firstEver, x, y, mult: p.trickMult });
    this.linkCombo('trick', x, y, n);
  }
  linkCombo(kind, x, y, n = 1) {
    const p = this.p, s = this.s, frenzy = p.frenzyT > 0;
    if (frenzy && this.muts.chain && kind !== 'domino') {   // (a Domino knock is exactly +1 a rival)
      n *= 2;
      if (PASS_KINDS.has(kind)) p.frenzyT = Math.max(p.frenzyT, Math.min(p.frenzyT + 0.2, s.frenzyLen * 2));
    }
    // same kind in a row: the timer refills less from the 4th; overtakes in a row (any kind): less from the 6th
    p.sameRun = kind === p.lastKind ? p.sameRun + 1 : 1; p.lastKind = kind;
    const pass = PASS_KINDS.has(kind);
    p.passRun = pass ? (p.passRun || 0) + 1 : 0;
    // style: the different moves you landed in the last STYLE_WINDOW s are worth more (p.kindLast: kind -> time);
    // spamming one move (the same kind 4 times in a row, p.rep) climbs FRENZY at half speed
    const KL = p.kindLast || (p.kindLast = {}), R = p.rep || (p.rep = []);
    const fresh = !(this.t - (KL[kind] ?? -Infinity) <= STYLE_WINDOW);
    KL[kind] = this.t;
    const rep = R.length >= 3 && R[0] === kind && R[1] === kind && R[2] === kind;
    R.push(kind); if (R.length > 3) R.shift();
    p.style = this.styleNow();
    // the Launch Tube warm-up: one full link per dash or draft, the plain passes after it count Z0_PLOW, the chain
    // clamps at Z0_COMBO_MAX (the climax belongs further up the tube)
    const z0 = this.zoneReached === 0;
    if (z0 && PASS_KINDS.has(kind)) {
      const key = p.dashT > 0 ? 'd' + p.dashN : p.draft > 0.08 || this.t - p.draftT <= 0.5 ? 'f' + p.draftN : '';
      if (key && key === p.z0Key && kind === 'pass') n *= Z0_PLOW;
      else if (key) p.z0Key = key;
    }
    // overtake spam: from the 6th overtake in a row only half a link, from the 12th a quarter (a slingshot stays full)
    if (pass) n *= passLinkK(p.passRun, kind);
    // CLUTCH: a link landed in the last quarter of the timer is +1 and grows the bank multiplier
    // (spam does not count: the 4th+ same-kind link in a row only ever refills part of the timer)
    const clutch = p.combo > 0 && p.comboT > 0 && p.comboT < 0.25 * p.comboMax && p.sameRun < 4;
    if (clutch) { n += 1; p.clutch = Math.min(0.5, Math.round((p.clutch + 0.1) * 10) / 10); }
    p.combo += n; p.bank += n;
    if (z0) { p.combo = Math.min(p.combo, Z0_COMBO_MAX); p.bank = Math.min(p.bank, Z0_COMBO_MAX); }
    if (rep) p.fzPen += n * 0.5;
    const disco = this.evK('disco');
    p.comboMax = this.comboMaxOf(p); p.comboT = p.comboMax * Math.min(sameRefill(p.sameRun), passRefill(p.passRun || 0));
    p.bestCombo = Math.max(p.bestCombo, p.combo);
    if (!z0) p.bestComboLate = Math.max(p.bestComboLate || 0, p.combo);
    p.mult = comboMult(p.combo) * styleMult(p.style);
    const gain = LINK_DNA * n * p.mult * (1 + disco);
    this.dnaRun += gain; this.dnaFromCombo += gain - LINK_DNA * n;
    this.emit('combo', { kind, n: Math.floor(p.combo), add: n, x, y, mult: p.mult, style: p.style, fresh, same: p.sameRun, clutch, passRun: p.passRun });
    if (clutch) this.emit('clutch', { x, y, n: Math.floor(p.combo), mult: p.clutch });
    p.mileI = p.mileI || 0;
    if (!z0) while (p.combo >= comboMilestoneAt(p.mileI)) this.emit('comboMilestone', { n: comboMilestoneAt(p.mileI++), x, y });
    const pts = this.fzPoints(); p.fzPts = pts;
    if (pts >= this.frenzyThreshold(p.fz)) {
      const first = p.frenzyT <= 0, oldTier = p.tier, T = FRENZY_TIERS;
      while (pts >= this.frenzyThreshold(p.fz)) p.fz++;
      // a chain rebuilt mid FRENZY (after a cash-out or a timeout) never lowers the tier it is holding
      p.tier = Math.max(1, Math.min(p.fz, T.length, this.tierCap(), styleTierCap(p.style)), first ? 0 : p.tier);
      p.bestTier = Math.max(p.bestTier, p.tier);
      p.nextFrenzy = this.frenzyThreshold(p.fz);
      p.frenzyT = Math.max(p.frenzyT, s.frenzyLen);
      if (!first && p.tier === oldTier && p.fz <= T.length) return;     // capped: a quiet top-up, no fanfare
      this.frenzyFanfare(first);
    } else if (p.frenzyT > 0 && p.tier < Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), styleTierCap(p.style))) {
      // your STYLE caught up with a tier your chain already earned
      p.tier = Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), styleTierCap(p.style)); p.bestTier = Math.max(p.bestTier, p.tier);
      this.frenzyFanfare(false);
    }
  }
  // STYLE now: the STYLE_KINDS landed in the last STYLE_WINDOW s; the overtake kinds together count PASS_STYLE_MAX at most
  styleNow() {
    const KL = this.p.kindLast; let n = 0, pk = 0;
    if (KL) for (const k in KL) if (STYLE_KINDS.has(k) && this.t - KL[k] <= STYLE_WINDOW) { if (PASS_KINDS.has(k)) pk++; else n++; }
    return clamp(n + Math.min(pk, PASS_STYLE_MAX), 1, 6);
  }
  frenzyFanfare(first) {
    const p = this.p, s = this.s, T = FRENZY_TIERS, ti = p.tier - 1;
    p.frenzyTier = Math.max(p.frenzyTier || 0, p.tier);     // held until 'frenzyEnd'
    this.emit('frenzy', { n: Math.floor(p.combo), first, tier: p.tier, name: T[ti].name, desc: T[ti].desc });
    // re-entry guard: a tier climbed by the links this fanfare pays (Domino, Supernova pops) is announced, but
    // its own mosh / blast does not fire again inside this one
    if (this.inFanfare) return;
    this.inFanfare = true;
    try {
      if (this.muts.mosh) {
        let hit = 0;
        for (const a of this.agents) if (a.alive && !a.arrived && Math.abs(a.y - p.y) < 220) { a.kx += (this.agentX(a) < p.x ? -1 : 1) * 3; a.y -= 25; a.bumpT = 0.6; hit++; }
        if (this.syn.domino && hit) {
          this.addCombo('domino', p.x, p.y, hit);
          p.frenzyT = Math.min(p.frenzyT + 0.3 * hit, s.frenzyLen * 2);
          this.emit('domino', { n: hit, x: p.x, y: p.y });
        }
      }
      if (this.syn.hypeSquad && (this.muts.wingman || 0) > p.wing) { p.wing = this.muts.wingman; this.emit('wingBack'); }
      if (this.syn.supernova) this.blast(p.x, p.y, 260, 'supernova');
    } finally { this.inFanfare = false; }
  }
  // FRENZY ticks down; when it runs out the held tier falls back to what the current chain has earned
  tickFrenzy(dt) {
    const p = this.p;
    if (!(p.frenzyT > 0)) return;
    p.frenzyT -= dt;
    if (p.frenzyT > 0) return;
    p.frenzyT = 0; p.frenzyTier = 0;
    p.tier = Math.min(p.tier, p.fz > 0 ? Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), styleTierCap(p.style)) : 0);
    this.emit('frenzyEnd');
  }
  // light FRENZY right now (Comeback Kid, Bloodhound)
  igniteFrenzy(why) {
    const p = this.p;
    p.frenzyT = Math.max(p.frenzyT, this.s.frenzyLen); p.tier = Math.max(p.tier, 1); p.fz = Math.max(p.fz, 1); p.bestTier = Math.max(p.bestTier, p.tier);
    p.frenzyTier = Math.max(p.frenzyTier || 0, p.tier);
    this.emit('frenzy', { n: Math.floor(p.combo), first: true, tier: p.tier, name: FRENZY_TIERS[p.tier - 1].name, desc: FRENZY_TIERS[p.tier - 1].desc, [why]: true });
  }
  // the chain shrank: rebuild the FRENZY progress from it. While FRENZY runs the tier it reached is held
  // (p.frenzyTier, until 'frenzyEnd'): speed, GOD MODE, Nitro and double DNA never switch off mid FRENZY.
  resetTier(keep) {
    const p = this.p;
    p.fz = this.tierOf(this.fzPoints()); p.fzPts = this.fzPoints();
    if (!(p.frenzyT > 0)) p.tier = Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), keep ? styleTierCap(p.style) : 1);
    else p.tier = Math.max(p.tier, p.frenzyTier || 0);
    p.nextFrenzy = this.frenzyThreshold(p.fz); p.mult = comboMult(keep) * styleMult(p.style);
    p.mileI = milestonesUpTo(p.combo);     // a kept chain does not fire its milestones again
    if (!keep) { p.kindLast = {}; p.rep.length = 0; p.style = 1; p.mult = 1; p.sameRun = 0; p.lastKind = ''; }
  }
  // pay the bank (a run-out at x0.6, or a FINISHER at x1.3..2) and reset the clutch.
  // comboBank: {n, dna, grade (0..4), style, clutch, finisher, mult, blastN}
  payBank(fin, blastN = 0) {
    const p = this.p;
    if (p.bank < 3) { p.bank = 0; p.clutch = 0; p.trickMult = 0; p.trickChain = {}; return 0; }
    const fm = fin ? finisherMult(p.style) : this.s.keep > 0 ? 1 : TIMEOUT_BANK;
    const dna = bankDna(p.bank, p.style, p.clutch, p.trickMult) * (1 + this.evK('disco')) * fm;
    this.dnaRun += dna; this.dnaBank += dna;
    this.emit('comboBank', { n: Math.floor(p.bank), dna: Math.round(dna * 10) / 10, grade: bankGrade(p.bank), style: p.style, x: p.x, y: p.y, clutch: p.clutch,
      finisher: !!fin, mult: fm, blastN, trick: p.trickMult || 0 });
    p.bank = 0; p.clutch = 0; p.trickMult = 0; p.trickChain = {};
    return dna;
  }
  // a combo ran out cleanly: BANK it for DNA. Echo Chamber keeps part of the chain going.
  dropCombo() {
    const p = this.p, s = this.s, n = p.combo;
    this.payBank(false);
    const keep = s.keep ? Math.floor(n * s.keep) : 0;
    if (n >= 3) this.emit('comboEnd', { n: Math.floor(n), kept: keep });
    p.fzPen = n > 0 ? p.fzPen * keep / n : 0;
    p.combo = keep; p.comboMax = this.comboMaxOf(p); p.comboT = keep ? p.comboMax : 0;
    this.resetTier(keep);
  }
  // FINISHER (race.input.cashOut): bank the chain right now at x1.3 (x1.6 with STYLE 4, x2 with STYLE 5+).
  // A bank of 25+ also BLASTS: pops the Big Macros around you and shoves rivals aside. The next chain starts
  // with a tenth of the bank (up to 8 links).
  cashOut() {
    const p = this.p, s = this.s, n = p.combo, bank = p.bank;
    if (n < 3 || bank < 3) return false;
    const big = bank >= FINISHER_BLAST_AT, R = finisherBlastR(bank);
    const blastN = big ? this.ents.filter((e) => !e.dead && e.t === 'wbc' && Math.abs(e.y - p.y) <= R && Math.hypot(e.x - p.x, e.y - p.y) <= R).length : 0;
    this.payBank(true, blastN);
    if (p.frenzyT > 0) p.frenzyT = Math.max(p.frenzyT, Math.min(p.frenzyT + 1.5, s.frenzyLen * 2));   // a finisher fans the flames
    const seed = finisherSeed(bank);
    this.emit('comboEnd', { n: Math.floor(n), kept: seed, finisher: true });
    p.fzPen = 0; p.combo = seed; p.bank = seed; p.comboMax = this.comboMaxOf(p); p.comboT = seed ? p.comboMax : 0;
    this.resetTier(0);
    p.mult = comboMult(seed);
    if (big) {
      for (const a of this.agents) {
        if (!a.alive || a.arrived || Math.abs(a.y - p.y) > 180 || (p.y >= FORK_Y0 && a.side !== p.side)) continue;
        const ax = this.agentX(a); if (Math.abs(ax - p.x) > 180) continue;
        a.kx += (ax < p.x ? -1 : 1) * 3; a.bumpT = 0.6;
      }
      this.blast(p.x, p.y, R, 'finisher');
    }
    return true;
  }
  // a combo got smashed (goo wall, a hit you survived): no bank, a quarter of it survives
  breakCombo(why, x, y) {
    const p = this.p, s = this.s, n = p.combo;
    if (n <= 0) return;
    if (p.frenzyT > 0 && (p.tier >= FRENZY_TIERS.length || this.muts.nitro)) return;   // GOD MODE and Nitro shrug it off
    const keep = Math.floor(n * 0.25 * (1 + s.keep));
    p.bank = 0; p.clutch = 0; p.trickMult = 0; p.trickChain = {};
    p.fzPen = p.fzPen * keep / n;
    p.combo = keep; p.comboMax = this.comboMaxOf(p); p.comboT = keep ? p.comboMax : 0;
    this.resetTier(keep);
    this.emit('comboBreak', { n: Math.floor(n), kept: keep, why, x: x != null ? x : p.x, y: y != null ? y : p.y });
  }
  // the whole chain is gone (the spare bite): no bank, nothing kept
  loseCombo(why, x, y) {
    const p = this.p, n = p.combo;
    p.bank = 0; p.clutch = 0; p.trickMult = 0; p.trickChain = {};
    if (n <= 0) return;
    p.fzPen = 0; p.combo = 0; p.comboT = 0; p.comboMax = this.s.combo;
    this.resetTier(0);
    this.emit('comboBreak', { n: Math.floor(n), kept: 0, why, x: x != null ? x : p.x, y: y != null ? y : p.y });
  }
  nearMiss(x, y) {
    const sl = this.muts.slick || 0, p = this.p;
    if (sl) p.e += 2 * sl;
    if (this.syn.greased) p.dashCd = Math.max(0, p.dashCd - 0.6);
    this.addCombo('close', x, y, 1 + sl);
  }
  // pop every white blood cell within r of (x, y); each pop is a combo link
  blast(x, y, r, why) {
    let n = 0;
    for (const e of this.ents) {
      if (e.dead || e.t !== 'wbc' || Math.abs(e.y - y) > r || Math.hypot(e.x - x, e.y - y) > r) continue;
      e.dead = 1; n++; this.emit('pop', { x: e.x, y: e.y, chain: why }); this.addCombo('pop', e.x, e.y);
    }
    if (n) this.emit('blast', { x, y, r, n, why });
    return n;
  }

  agentX(a) {
    if (a.y < FORK_Y0 - 1) {
      const pr = params(a.y), c = centreW(a.y, pr.wob), h = pr.hw;
      return clamp(c + a.lane * h * 0.9 + a.kx * 20, Math.max(c - h + 9, EDGE), Math.min(c + h - 9, VIEW_W - EDGE));
    }
    const ch = channel(a.y, a.side);
    return clamp(ch.c + a.lane2 * ch.h * 0.85 + a.kx * 10, Math.max(ch.c - ch.h + 9, EDGE), Math.min(ch.c + ch.h - 9, VIEW_W - EDGE));
  }

  // ---------------------------------------------------------------- rivals and the egg
  // the drill a rival needs: the base plus the seconds you still need to reach the egg (at CHASE_K of your speed,
  // up to 9 more; fixed when it arrives), so a claim is a chase you can win. Once you are drilling a newcomer
  // never needs less than you do.
  rivalNeed() {
    // the chase cap: 19 s at gen 0, easing to 13 s by gen 8 (a far-off claim is a long chase, the hairy Rapids included)
    // (Kevin's own drill is the floor: a claim just ahead of him never needs less than he will)
    const base = this.playerNeed() + clamp(this.remaining() / (CHASE_K * this.s.speed), 0, CHASE_CAP + 6 * clamp(1 - this.gen / 8, 0, 1));
    return this.drill ? Math.max(base, this.drill.need) : base;
  }
  // a rookie run's finale sprinters swim to the egg slower (rookieBossT) but drill faster (ROOKIE_SPRINT) and need only
  // what Kevin still needed after his head start (arrive):
  // a new player gets to see the egg and lose a photo finish before the egg-loss boost tips the scales
  // (never 0 or NaN: end() divides by it)
  drillRate(a) {
    const r = a.boss ? (this.rivalK || 1) * (a.boss.drill || 1) * (a.drillK || 1) * (a.sprint && this.finaleT != null ? 1 + ROOKIE_SPRINT * ((this.rookieBoss || 1) - 1) : 1) : 0.9;
    return r > 0.01 && Number.isFinite(r) ? r : 0.01;
  }
  // the player's drill: the base plus 0.15 per generation (to gen 8)
  playerNeed() { return EGG_DRILL + 0.15 * Math.min(this.gen, 8); }
  // +8% drill speed per egg lost in a row (cap +40%)
  eggBoost() { return eggBoostOf(this.meta); }
  arrivedBosses() { let n = 0; for (const b of this.agents) if (b.boss && b.alive && b.arrived) n++; return n; }
  arrive(a) {
    a.arrived = true; a.arrivedT = this.t; a.y = RACE_LEN - 70; a.need = a.sprint && this.rookieBoss > 1 && this.finaleT != null ? Math.max(EGG_DRILL, this.playerNeed()) - (this.drill ? this.drill.head : this.headStart()) : this.rivalNeed(); a.drill = 0; a.shoveT = 1.4;
    const info = { boss: a.boss ? a.boss.name : null, k: a.boss ? a.k : -1 };
    if (!this.claimed) { this.claimed = a; this.emit('eggClaim', { ...info, col: a.boss ? a.boss.col : null, need: a.need, remaining: this.remaining() }); }
    else this.emit('arrive', info);
  }
  // an arrived rival drills; true when it gets in
  drillAgent(a, dt) {
    a.drill += dt * this.drillRate(a);
    const f = a.drill / a.need;
    if (this.rdLevel < 2 && f >= (this.rdLevel ? 0.8 : 0.5)) {
      let lead = true; for (const b of this.agents) if (b !== a && b.alive && b.arrived && b.drill / b.need > f) { lead = false; break; }
      if (lead) { this.rdLevel++; this.emit('rivalDrill', { boss: a.boss ? a.boss.name : null, k: a.boss ? a.k : -1, f }); }
    }
    return a.drill >= a.need;
  }
  // entering THE EGG: the two strongest named rivals still swimming come for it. A is put 700 ahead of
  // you, B 450 behind, both sprinting at least 3% faster than you. Your nemesis (the rival you have lost
  // to most) is preferred; the daily picks with the layout seed so everybody gets the same finale.
  finale() {
    const p = this.p, s = this.s, M = this.meta, sprinters = [], ks = [];
    const cand = this.agents.filter((a) => a.boss && a.alive && !a.arrived && a.side === this.eggSide);
    const rec = (a) => { const r = M && M.rivals && M.rivals[firstName(a.boss)]; return r ? (r.lost || 0) - (r.beat || 0) : 0; };
    // ties (and the whole daily) are broken by the layout seed, so who shows up changes every run
    const key = new Map(cand.map((a) => [a, this.frng()]));
    if (this.daily != null) cand.sort((a, b) => key.get(b) - key.get(a));
    else cand.sort((a, b) => rec(b) - rec(a) || key.get(b) - key.get(a) || b.k - a.k);
    // Kevin's lead: the soonest egg-side named rival's time to the egg minus his own
    const myT = this.remaining() / Math.max(1, s.speed);
    let bossT = Infinity; for (const a of cand) bossT = Math.min(bossT, Math.max(0, RACE_LEN - 70 - a.y) / Math.max(1, a.sp));
    const lead = isFinite(bossT) ? bossT - myT : 0;
    this.finaleLead = lead;
    // a big lead brings no A at all: the one sprinter is B
    // (a rookie run always gets the classic finale: the first races are about seeing the egg and a photo finish)
    const band = lead < FIN_CLOSE || this.rookieBoss > 1 ? 0 : lead <= FIN_FAR ? 1 : 2;
    const picks = cand.slice(0, band === 2 ? 1 : 2);
    picks.forEach((a, j) => {
      const i = band === 2 ? 1 : j;
      // a rival you can see is never teleported: it just finds a sprint. Off screen, A is brought up to 700
      // ahead of you (300 at your speed when you lead by FIN_CLOSE+ s) and B is pulled up to 450 behind (never pushed back).
      if (Math.abs(a.y - p.y) < 650) a.sp = Math.max(a.sp, s.speed * (i === 0 && band === 1 ? 1 : 1.06));
      else {
        if (i === 0) a.y = band === 1 ? p.y + 300 : Math.max(a.y, p.y + 700);
        else if (a.y < p.y - 450) a.y = p.y - 450;
        a.sp = i === 0 && band === 1 ? s.speed : Math.max(a.sp, s.speed * 1.03);
      }
      a.sprint = 1; a.zoneEnd = -Infinity; a.met = true;
      sprinters.push(a.boss.name); ks.push(a.k);
    });
    // fallback: any other named rival right behind you finds a last gear
    for (const a of this.agents) if (a.boss && a.alive && !a.arrived && !picks.includes(a) && a.side === this.eggSide && p.y - a.y >= 0 && p.y - a.y <= 3000) { a.sp *= 1.18; a.sprint = 1; sprinters.push(a.boss.name); ks.push(a.k); }
    // nobody left to sprint (dead, lost in the wrong tube, all far behind): the nemesis (else the strongest named
    // rival still swimming) makes a COMEBACK 500 behind you on the egg side. The finale is never a solo swim.
    let comeback = 0;
    if (!sprinters.length) {
      const pool = this.agents.filter((a) => a.boss && !a.arrived);
      const nem = pool.filter((a) => rec(a) > 0).sort((a, b) => rec(b) - rec(a) || b.k - a.k)[0];
      // (else any named rival at all: one lost in the wrong tube swims back out of it)
      const a = nem || pool.filter((x) => x.alive).sort((x, y) => y.k - x.k)[0] || pool.slice().sort((x, y) => y.k - x.k)[0];
      if (a) {
        Object.assign(a, { alive: true, side: this.eggSide, y: p.y - 500, sp: s.speed * 1.06, sprint: 1, zoneEnd: -Infinity, deathY: Infinity, met: true, diedT: 0 });
        a.lane = a.side * Math.abs(a.lane || 0.4); a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9);
        sprinters.push(a.boss.name); ks.push(a.k); comeback = 1;
      }
    }
    this.finaleT = this.t;
    this.emit('finale', comeback ? { sprinters, ks, comeback } : { sprinters, ks });
  }

  stepAgents(dt) {
    const p = this.p, rng = this.rng, kEsp = this.evK('espresso'), kSneeze = this.evK('sneeze');
    const evSp = (1 + 0.12 * kEsp) * (1 + 0.05 * this.evK('slipstream')), sneeze = kSneeze > 0;
    // a finger on the glass (input.finger) is playing even when it holds still
    const ramW = this.s.ramW, zone0 = this.zoneReached === 0, active = p.actT < IDLE_T || this.input.finger === true;
    // Bloodhound: overtakes in the zone after the Fork count double (on the right side)
    const hound = this.syn.bloodhound && this.zoneReached === FORK_I + 1 && p.side === this.eggSide ? 2 : 1;
    let rank = 1, alive = 1;
    const st = Math.sin(this.t * 1.7), ct = Math.cos(this.t * 1.7), n = (this.stepN = (this.stepN || 0) + 1);
    const kdamp = Math.pow(0.1, dt), py = p.y, near = this.nearA; near.length = 0;
    this.nearY = py;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a.alive) continue;
      if (a.boss && !a.met) this.meet(a);
      if (a.arrived) {     // already at the egg and drilling in: if one gets through, it is over for everybody
        alive++; rank++;
        if (a.tauntT > 0) a.tauntT -= dt; if (a.bumpT > 0) a.bumpT -= dt; if (a.passT > 0) a.passT -= dt;
        if (this.drillAgent(a, dt)) { this.rank = this.computeRank(); this.eggTaken = a; return this.end('late'); }
        continue;
      }
      if (a.y - py < 400 && py - a.y < 400) near.push(a);
      // far from the camera a swimmer only needs updating every 8th step (same distance, an eighth of the work)
      let adt = dt;
      if (!a.boss && (a.y - py > 1200 || py - a.y > 1200)) {
        if ((n + i) & 7) { a.acc = (a.acc || 0) + dt; if (a.y > py) rank += a.w; alive += a.w; continue; }
        adt += a.acc || 0; a.acc = 0;
      }
      if (a.tauntT > 0) a.tauntT -= adt; if (a.bumpT > 0) a.bumpT -= adt; if (a.passT > 0) a.passT -= adt;
      if (!(a.y < a.zoneEnd)) {             // entering a zone: roll whether this zone gets you
        const zi = zoneIndex(a.y); a.zoneEnd = zi + 1 < ZONES.length ? ZSTART[zi + 1] : Infinity;
        if (zi !== a.zone) {
          a.zone = zi; const z = ZONES[zi];
          if (!z.fork && !a.boss && rng() < z.q) a.deathY = ZSTART[zi] + rng() * z.len;
        }
      }
      const z = ZONES[a.zone];
      let sp = a.sp * (1 - (1 - a.stam) * 0.28 * a.y / RACE_LEN);
      if (a.conga) { if (this.t < a.conga) { sp *= CONGA_SP; a.kx = 0; } else a.conga = 0; }   // the first swim's conga line
      // the long tail of the Rapids: a named rival far ahead of you there tires (down to x BAND_MIN), so a claim
      // at the egg is still a chase you can win (never in the daily, never a finale sprinter)
      if (a.boss && !a.sprint && this.daily == null && a.y > RAPIDS_Y && a.y - py > BAND_D) sp *= Math.max(BAND_MIN, 1 - (a.y - py - BAND_D) / BAND_W);
      if (z.current) sp *= 1 - z.current * 0.75;
      sp *= (1 + 0.06 * (st * a.cph + ct * a.sph)) * evSp;
      if (sneeze) a.kx += Math.sin(this.t * 2.6 + a.ph) * 1.5 * kSneeze * adt;
      const wasAhead = a.y > this.prevPY;
      a.y += sp * adt;
      a.kx *= adt === dt ? kdamp : Math.pow(0.1, adt);
      if (a.y >= a.deathY || (a.side !== this.eggSide && a.y >= DEAD_Y)) { this.killAgent(a, 'pop'); continue; }
      // at most MAX_ARRIVED named rivals wait at the egg before Kevin gets there; the rest hold at RACE_LEN - 400
      // (never pushed back: one already past it just stops) until Kevin starts drilling
      if (a.boss && a.y > RACE_LEN - 400 && !this.drill && this.arrivedBosses() >= MAX_ARRIVED) a.y = Math.max(RACE_LEN - 400, Math.min(a.y, a.y - sp * adt));
      if (a.y >= RACE_LEN - 70) { this.arrive(a); alive++; rank++; continue; }
      // overtakes (only rivals you can actually see)
      const nowAhead = a.y > p.y, sameTube = p.y < FORK_Y0 || a.side === p.side;
      if (wasAhead && !nowAhead && sameTube) {
        const ax = this.agentX(a), dx = Math.abs(ax - p.x);
        if (dx < 220) {
          p.overtakes++;
          if (this.muts.rush) p.e += 1.5 * this.muts.rush;
          if (a.boss) {   // a named rival: 3 links and a +4 DNA bounty the first time, 1 link for every re-pass after that
            a.passT = 0.8;
            if (!a.passedOnce) { a.passedOnce = 1; if (active) this.addCombo('rival', ax, a.y, 3 * hound); this.dnaRun += 4; this.dnaBonus += 4; }
            else if (active) this.addCombo('rival', ax, a.y, hound);
          }
          // a pass always moves you up, but it only links the chain while you are playing (p.actT < IDLE_T).
          // In the Launch Tube a link has to be earned: a dash, a slingshot out of THAT rival's draft, or a close shave.
          // The kind of link: a SLINGSHOT (dashing, or within 0.5 s of a draft), a WEAVE (the other side of your last
          // pass, within 1.2 s), a SNIPE (closer than 30), else a plain pass.
          else if (active && (!zone0 || p.dashT > 0 || (p.draft > 0.08 && this.t - a.draftedT < 1) || dx < 70)) {
            const side = ax < p.x ? -1 : 1;
            const sling = p.slingOK && (p.dashT > 0 || this.t - p.draftT <= 0.5);
            if (sling) p.slingOK = false;      // one slingshot per dash or per draft: the rest of a plow is plain passing
            // (a weave needs a real sideways move: 30+ between the two passes; a snipe is a rival you did not just draft)
            const kind = sling ? 'slingshot'
              : p.passSide && side !== p.passSide && this.t - p.passT <= 1.2 && Math.abs(p.x - p.passX) >= 30 ? 'weave'
              : dx < 30 && this.t - a.draftedT > 0.5 ? 'snipe' : 'pass';
            p.passSide = side; p.passT = this.t; p.passX = p.x;
            this.addCombo(kind, ax, a.y, hound);
          }
          if (hound > 1) p.overtakes++;
          this.emit('pass', { w: Math.round(a.w), x: ax, y: a.y, boss: a.boss && a.boss.name, k: a.boss ? a.k : -1 });
        }
      } else if (a.boss && !wasAhead && nowAhead && sameTube && !(a.tauntT > 0)) {
        const ax = this.agentX(a);
        if (Math.abs(ax - p.x) < 260) { a.tauntT = 4; this.emit('passedBy', { boss: a.boss.name, k: a.k, x: ax, y: a.y }); }
      }
      // battering ram: bump rivals you swim into
      if (this.muts.ram && sameTube && Math.abs(a.y - p.y) < ramW && !a.bumped) {
        const ax = this.agentX(a);
        if (Math.abs(ax - p.x) < ramW) {
          const dozer = this.syn.bulldozer;
          a.bumped = 1; a.bumpT = 0.6; a.kx += (ax < p.x ? -1 : 1) * this.s.ramKx * (dozer ? 1.6 : 1); a.y -= dozer ? 45 : 30; p.e += this.s.ramE + (dozer ? 1.5 * (this.muts.rush || 0) : 0);
          this.addCombo('bump', ax, a.y, this.s.ramN); this.emit('bump', { x: ax, y: a.y, dozer, boss: a.boss ? a.boss.name : null, k: a.boss ? a.k : -1 });
        }
      }
      if (nowAhead) rank += a.w;
      alive += a.w;
    }
    this.rank = Math.max(1, Math.round(rank));
    this.alive = Math.max(this.rank, Math.round(Math.min(alive, TOTAL_SWIMMERS * this.keepAt(p.y))));
  }

  // the bounty promised after the last run: say so the moment it comes true (paid in end())
  checkGoal() {
    const g = this.meta && this.meta.goal, p = this.p;
    if (this.goalSeen || !g) return;
    let beaten = null;
    if (g.id === 'beatRival') { const a = this.agents[g.k]; beaten = a && a.boss && (a.met || this.meet(a)) && (!a.alive || (!a.arrived && a.y < p.y)) ? [firstName(a.boss)] : []; }
    if (!goalMet(g, { won: false, zone: this.zoneReached, combo: p.bestComboLate, beaten })) return;
    this.goalSeen = true;
    this.emit('goalMet', { id: g.id, dna: g.dna, k: g.k, target: g.target, x: p.x, y: p.y });
  }
  // a named rival counts in the ledger only once you have met it: within 600 of it, or of its starting slot
  // (passing the slot counts too, so a fast step or a backflow cannot skip it)
  meet(a) {
    const py = this.p.y;
    if (Math.abs(a.y - py) < 600 || (a.spawnY != null && py >= a.spawnY - 600)) a.met = true;
    return a.met;
  }
  killAgent(a, how) {
    a.alive = false; a.diedT = this.t;
    if (Math.abs(a.y - this.p.y) < 700) this.fx.push({ t: how, x: this.agentX(a), y: a.y, age: 0, face: a.face | 0 });
  }

  stepEnts(dt, frenzy, nitro, tier = 0) {
    const p = this.p, s = this.s, magnet = s.magnet * (tier >= 2 ? 2 : 1);
    // pickups ride half the chain multiplier (style is for links), GOD MODE adds half again
    const dnaMul = (1 + (comboMult(p.combo) - 1) * 0.5) * (tier >= 5 ? 1.5 : 1);
    let snack = null, curs = null;
    // pulsing puddles (hazard step 6+) breathe on the zone's beat
    const beatK = Math.max(0, Math.sin(((this.t * (ZONES[zoneIndex(p.y)].beat || 120) / 60) % 1) * TAU));
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.pulse) e.r = e.r0 * (0.75 + 0.35 * beatK);
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (e.t === 'sugar' || e.t === 'dna' || e.t === 'shield' || e.t === 'alkali') {
        if (d < magnet + e.r) { const k = Math.min(1, dt * 9); e.x -= dx * k; e.y -= dy * k * 0.7; }
        if (d < e.r + 12) {
          e.dead = 1;
          // a fruit sugar or a DNA blob also tops up a running chain (no link): a bridge
          if ((e.t === 'sugar' || e.t === 'dna') && p.combo > 0) p.comboT = Math.min(p.comboMax, p.comboT + PICKUP_REFILL);
          if (e.t === 'sugar') { p.e += s.sugar; this.dnaRun += 0.02 * dnaMul; this.emit('sugar', { x: e.x, y: e.y }); if (e.gift) this.emit('gift', { x: e.x, y: e.y }); if (this.syn.sugarHigh) this.addCombo('sugar', e.x, e.y); else this.seqPush('sugar', e.x, e.y); }
          else if (e.t === 'dna') {
            const g = s.dnaBlob * dnaMul; this.dnaRun += g; this.dnaFromCombo += g - s.dnaBlob; this.emit('dna', { x: e.x, y: e.y, amount: Math.round(g) });
            if (this.syn.jackpot && p.frenzyT > 0) this.addCombo('dna', e.x, e.y); else this.seqPush('dna', e.x, e.y);
          }
          else if (e.t === 'shield') { p.shield++; this.emit('shield', { x: e.x, y: e.y }); }
          else { p.e += 6; p.acid = 0; this.emit('alkali', { x: e.x, y: e.y }); }
        }
      } else if (e.t === 'wbc') {
        e.ph += dt;
        const was = e.hunt;
        if (e.cool > 0) { e.cool -= dt; e.hunt = Math.max(0, e.hunt - dt); }      // a paid dodge: it sulks before locking on again
        else {
          // at speed it sees you coming from further off (e.sight, fixed the first time you come within WBC_SIGHT_MAX)
          if (e.sight == null && d < WBC_SIGHT_MAX && dy > -60) e.sight = wbcSight(p.vy);
          if (d < (e.sight || WBC_SPOT_D) && dy > -60) {
            // the wind-up: it SPOTS you first (WBC_SPOT_T s, shorter at speed: e.spotT) and only then hunts.
            // A cell already hunting skips it.
            if (e.spotT == null) e.spotT = wbcWindup(p.vy);
            if (!(e.spot >= e.spotT) && !(e.hunt > 0)) {
              if (!(e.spot > 0)) { e.spot = 0; this.emit('spot', { x: e.x, y: e.y }); }
              e.spot = Math.min(e.spotT, e.spot + dt);
            } else e.hunt = Math.min(1, e.hunt + dt * 2);
          }
        }
        if (was < 0.5 && e.hunt >= 0.5) this.emit('lockon', { x: e.x, y: e.y });
        const spd = 190 * e.hunt, slow = e.eat > 0 ? 0.15 : 1;                    // mid-snack it barely moves
        e.vx += ((dx < 0 ? 1 : -1) * spd - e.vx) * Math.min(1, dt * 3);
        e.vy += ((dy > 0 ? -spd * 0.6 : 0) - e.vy) * Math.min(1, dt * 2);
        e.x += (e.vx * dt + Math.sin(e.ph * 2) * 10 * dt) * slow; e.y += e.vy * dt * slow;
        // fairness: a Big Macro inside a current band drifts with it (it never waits in the lane the current pushes you to)
        if (curs === null) { curs = []; for (const c of this.ents) if (c.t === 'current' && !c.dead) curs.push(c); }
        for (const c of curs) if (e.y > c.y && e.y < c.y + c.h) { const b = playBand(e.y, e.side || p.side); e.x = clamp(e.x + c.dir * 120 * dt, b.l, b.r); break; }
        // snack on rivals that swim through
        if (snack === null) {   // (once a step: only the swimmers inside the Big Macros' rows can be eaten)
          let lo = Infinity, hi = -Infinity;
          for (const w of this.ents) if (w.t === 'wbc' && !w.dead) { if (w.y - w.r < lo) lo = w.y - w.r; if (w.y + w.r > hi) hi = w.y + w.r; }
          snack = this._snack; snack.length = 0; for (const a of this.agents) if (a.alive && !a.arrived && !a.boss && a.y > lo - 10 && a.y < hi + 10) snack.push(a);
        }
        for (const a of snack) if (a.alive && Math.abs(a.y - e.y) < e.r && Math.abs(this.agentX(a) - e.x) < e.r) {
          this.killAgent(a, 'eaten');
          if (!(e.eat > 0)) e.hunt = Math.min(e.hunt, 0.3);
          e.eat = 0.9;
        }
        if (d < e.r + 8) {
          e.touched = 1;
          if (nitro || p.inv > 0) { if (nitro) { e.dead = 1; this.emit('pop', { x: e.x, y: e.y }); this.addCombo('pop', e.x, e.y); } e.eat = Math.max(0, e.eat - dt); continue; }
          // a wall hair just swatted you into it: the swat bonks the cell away, no bite (0.35 s window)
          if (p.swatSafe > 0) { if (!(e.cool > 0)) this.emit('swatBonk', { x: e.x, y: e.y }); e.vx = -p.swatDir * 300; e.cool = 1.5; e.hunt = 0; e.eat = Math.max(0, e.eat - dt); continue; }
          e.dead = 1; this.emit('pop', { x: e.x, y: e.y });
          if (this.muts.spiky) { p.e += 10; this.addCombo('pop', e.x, e.y); if (this.syn.porcupine) this.blast(e.x, e.y, 140, 'porcupine'); }
          else if (p.wing > 0) { p.wing--; p.inv = 1; this.emit('wingHit', { x: e.x, y: e.y }); this.breakCombo('wingHit', e.x, e.y); }
          else if (p.shield > 0) { p.shield--; p.inv = 1.2; this.emit('shieldHit', { x: e.x, y: e.y }); this.breakCombo('shieldHit', e.x, e.y); }
          else if (this.rookie && this.biteFree !== this.zoneReached && (normRunsOf(this.meta) < 3 || this.zoneReached >= SEA_I)) {   // rookie grace: the first bite per zone is on the house (runs 3-4: from the sea on)
            this.biteFree = this.zoneReached; p.inv = 1.2; this.emit('shieldHit', { x: e.x, y: e.y, rookie: true }); this.breakCombo('shieldHit', e.x, e.y);
          }
          else if (!this.rookie && !this.biteUsed && p.e >= SPARE_BITE) {   // one spare bite a run: it costs 35 energy and the chain
            this.biteUsed = 1; p.e -= SPARE_BITE; p.inv = 1.2; p.lastHit = 'wbc';
            this.emit('spareBite', { x: e.x, y: e.y }); this.loseCombo('spareBite', e.x, e.y);
          }
          else { p.lastHit = 'wbc'; this.end('wbc'); return; }
        } else if (d < e.r + 26 && e.hunt > 0.5) e.near = 1;
        // a dodge: it locked on, came within a whisker and got nothing. Mid-snack it is worth more.
        if (e.near && !e.touched && !e.paid && dy < -e.r) { e.paid = 1; e.cool = 2.5; this.addCombo('dodge', e.x, e.y, e.eat > 0 ? 3 : 2); }
        e.eat = Math.max(0, e.eat - dt);
      } else if (e.t === 'cilia') {
        const ph = (this.t + e.off) % e.period;
        e.state = ph < e.period - 0.8 ? 0 : ph < e.period - 0.35 ? 1 : 2;     // idle, tremble 0.45s, swat 0.35s
        e.phase = ph / e.period;
        const reach = e.wall < 0 ? p.x - e.x : e.x - p.x;  // how far you are from its wall
        // swept: everything between last step's y and this one, so a dash cannot tunnel through a swat
        const y0 = Math.min(this.prevPY, p.y), y1 = Math.max(this.prevPY, p.y);
        if (y0 < e.y + 26 && y1 > e.y - 26) {
          if (reach < e.r && e.state === 2 && !e.hit && !nitro) {
            e.hit = 1; p.swatT = 0.2; p.swatDir = -e.wall; p.swatSafe = SWAT_SAFE;
            if (p.combo > 0) p.comboT = Math.max(p.comboT - 0.5, 0.1);
            this.emit('swat', { x: p.x, y: p.y, wall: e.wall });
          } else if (reach < e.r + 24 && e.state >= 1) { e.near = 1; if (e.state === 2 && reach >= e.r) e.slip = 1; }
        }
        if (e.near && !e.hit && !e.paid && p.y - e.y > 26) {
          e.paid = 1;
          if (e.slip) this.addCombo('dodge', p.x, e.y, 2);   // slipped past a live swat: a real dodge
          else this.nearMiss(p.x, e.y);
        }
      }
    }
    // compact in place (the same arrays every step: no garbage at 240 Hz)
    if (this.ents.length > 400 || (this.t % 1 < dt)) { const E = this.ents, lo = p.y - 700; let j = 0; for (let i = 0; i < E.length; i++) { const e = E[i]; if (!e.dead && e.y > lo) E[j++] = e; } E.length = j; }
    const F = this.fx; let j = 0;
    for (let i = 0; i < F.length; i++) { const f = F[i]; f.age += dt; if (f.age < 1.2) F[j++] = f; }
    F.length = j;
  }

  // ---------------------------------------------------------------- the egg: a tug of war
  // the head start you bring from the race: your energy left and the best FRENZY tier you reached
  headStart() { const p = this.p; return Math.min(DRILL_HEAD_MAX, this.playerNeed(), 0.6 * clamp(p.e / Math.max(1, p.maxE), 0, 1) + 0.15 * (p.bestTier || 0)); }
  startDrill() {
    const head = this.headStart();
    this.drill = { t0: this.t, me: head, head, need: this.playerNeed(), tok: 2, lead: null };
    // every named rival already drilling is held at DRILL_ARRIVED_CAP of its need when you arrive: its move
    // (Chad's hair check, Gunther's dive) still comes, and the tug of war is still yours to win
    for (const a of this.agents) if (a.boss && a.alive && a.arrived) a.drill = Math.min(a.drill, DRILL_ARRIVED_CAP * a.need);
    this.p.y = RACE_LEN - 70;
    this.arriveRank = this.computeRank();
    this.emit('drill', { rank: this.arriveRank, need: this.drill.need, head: Math.round(head * 100) / 100 });
    this.drillLeader();
  }
  // who is ahead in the tug of war: emits drillLead {k, kevin} whenever it changes
  drillLeader() {
    const d = this.drill; if (!d) return;
    let best = d.me / d.need, who = -1;
    for (const a of this.agents) if (a.alive && a.arrived && a.boss) { const f = a.drill / a.need; if (f > best) { best = f; who = a.k; } }
    // a little hysteresis so a neck-and-neck tug does not flicker: a new leader must be 2% clear
    if (d.lead != null && who !== d.lead) {
      const cur = d.lead < 0 ? d.me / d.need : (() => { const a = this.agents[d.lead]; return a && a.alive && a.arrived ? a.drill / a.need : -1; })();
      if (best - cur < 0.02) who = d.lead;
    }
    if (who !== d.lead) { d.lead = who; this.emit('drillLead', { k: who, kevin: who < 0, boss: who >= 0 ? RIVALS[who].name : null }); }
  }
  stepDrill(dt) {
    if (!(dt > 0) || dt > 0.25) return;
    const d = this.drill, p = this.p;
    // taps count up to 8 a second (a small token bucket), each +0.07 and a shove on every arrived rival
    d.tok = Math.min(2, d.tok + 8 * dt);
    const raw = Math.max(0, Math.floor(this.input.tap || 0)), taps = Math.min(raw, Math.floor(d.tok));
    d.tok -= taps;
    const boost = this.eggBoost();
    d.me += (dt * (DRILL_BASE + (p.frenzyT > 0 ? 0.3 : 0)) + taps * DRILL_TAP) * boost;
    if (this.autopilot && !this.bot) d.me += dt * 0.3;
    if (raw) {
      this.emit('drillTap', { n: taps });
      if (taps) for (const a of this.agents) if (a.alive && a.arrived && a.boss) this.shoveRival(a, taps);
    }
    this.input.tap = 0;
    this.tickFrenzy(dt);
    // the others keep swimming and drilling, and the bosses at the egg shove you back every 1.4 s (and pull their moves)
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.tauntT > 0) a.tauntT -= dt; if (a.bumpT > 0) a.bumpT -= dt; if (a.passT > 0) a.passT -= dt;
      if (!a.arrived) {
        a.y += a.sp * 0.9 * dt;
        if (a.side !== this.eggSide && a.y >= DEAD_Y) { a.alive = false; continue; }
        if (a.y >= RACE_LEN - 70) this.arrive(a);
        continue;
      }
      if (a.boss) {
        const mv = this.moveState(a), book = a.boss.move === 'byTheBook';
        if (!book) {   // Tiffany goes by the book: she never shoves
          const was = a.shoveT == null ? 1.4 : a.shoveT;
          a.shoveT = was - dt;
          // Steve says sorry first: his shove is told 0.6 s ahead
          if (a.boss.move === 'sorry' && was > MOVE_TELL && a.shoveT <= MOVE_TELL) this.emitMove(a, 'tell');
          if (a.shoveT <= 0) {
            a.shoveT += 1.4; d.me = Math.max(0, d.me - 0.10); this.emit('rivalShove', { k: a.k, boss: a.boss.name });
            if (a.boss.move === 'sorry') this.emitMove(a, 'hit');
          }
        }
        this.stepMove(a, mv, dt);
        if (this.over) return;
        if (mv.stopT > 0 || mv.outT > 0) continue;      // not drilling right now (a counter, a stunt, a hair check)
      }
      if (this.drillAgent(a, dt)) { this.rank = this.computeRank(); this.eggTaken = a; return this.end('late'); }
    }
    if (d.me >= d.need) return this.end('win');
    this.drillLeader();
  }

  // ---------------------------------------------------------------- signature moves at the egg (RIVALS[].move)
  // rivalMove {k, boss, move, phase: 'tell' | 'hit' | 'countered'}. Every tell comes MOVE_TELL+ s before its hit.
  moveState(a) {
    if (!a.mv) a.mv = { c: 0, tellAt: -1, taps: 0, stopT: 0, outT: 0, out: 0, taken: 0, dove: false, hairDone: false, hairT: 0, hairTell: -1, hairTaps: 0, told: false };
    return a.mv;
  }
  emitMove(a, phase, extra) { this.emit('rivalMove', { k: a.k, boss: a.boss.name, move: a.boss.move, phase, ...extra }); }
  stepMove(a, mv, dt) {
    const d = this.drill, f = a.drill / Math.max(1e-6, a.need);
    if (mv.stopT > 0) mv.stopT = Math.max(0, mv.stopT - dt);
    switch (a.boss.move) {
      case 'maxRep': {   // Brock: every 3.5 s a 0.6 s wind-up, then a big shove. 3+ taps in the wind-up block it.
        mv.c += dt;
        if (mv.tellAt < 0 && mv.c >= MAXREP_EVERY - MOVE_TELL) { mv.tellAt = mv.c; mv.taps = 0; this.emitMove(a, 'tell'); }
        if (mv.tellAt >= 0 && mv.c >= MAXREP_EVERY) {
          if (mv.taps >= 3) { mv.stopT = 1.0; this.emitMove(a, 'countered'); }
          else { d.me = Math.max(0, d.me - MAXREP_HIT); this.emitMove(a, 'hit', { dme: MAXREP_HIT }); }
          mv.c -= MAXREP_EVERY; mv.tellAt = -1;
        }
        break;
      }
      case 'byTheBook':  // Tiffany: shove-proof for 2 s after she arrives, then a steady drill and never a shove
        if (!mv.told && this.t - a.arrivedT < BOOK_T) { mv.told = true; this.emitMove(a, 'tell', { t: BOOK_T - (this.t - a.arrivedT) }); }
        break;
      case 'stuntDive':  // Gunther: at 55% he backs off for 1.2 s, then dives back in for +0.18
        if (!mv.dove && f >= 0.55) { mv.dove = true; mv.outT = STUNT_OUT; mv.taken = 0; this.emitMove(a, 'tell'); }
        else if (mv.outT > 0) {
          mv.outT -= dt;
          if (mv.outT <= 0) {
            mv.outT = 0;
            a.drill = Math.min(a.need, a.drill + STUNT_HIT);
            this.emitMove(a, mv.taken >= STUNT_HIT ? 'countered' : 'hit', { taken: Math.round(mv.taken * 100) / 100 });
          }
        }
        break;
      case 'hairCheck':  // Chad: once, between 70% and 80%, a 0.6 s fuss then 1.6 s of hair care: no drilling, your shoves count double
        if (!mv.hairDone && mv.hairTell < 0 && f >= 0.7) { mv.hairTell = 0; mv.hairTaps = 0; this.emitMove(a, 'tell'); }
        else if (mv.hairTell >= 0 && !mv.hairDone) {
          mv.hairTell += dt;
          if (mv.hairTell >= MOVE_TELL) { mv.hairDone = true; mv.hairT = HAIR_T; mv.stopT = HAIR_T; this.emitMove(a, 'hit', { t: HAIR_T }); }
        } else if (mv.hairT > 0) {
          mv.hairT -= dt;
          if (mv.hairT <= 0) { mv.hairT = 0; if (mv.hairTaps >= 3) this.emitMove(a, 'countered', { taps: mv.hairTaps }); }
        }
        break;
      default: break;
    }
  }
  // Kevin's taps push an arrived named rival back (0.07 a tap), bent by its move
  shoveRival(a, taps) {
    const mv = this.moveState(a), move = a.boss.move;
    if (move === 'byTheBook' && this.t - a.arrivedT < BOOK_T) return;          // Tiffany read the chapter on shoves
    if (move === 'maxRep' && mv.tellAt >= 0) mv.taps += taps;                   // taps in Brock's wind-up count towards a block
    if (move === 'stuntDive' && mv.outT > 0) {                                  // Gunther is out: taps chip his drill instead
      const take = Math.min(taps * 0.05, STUNT_CAP - mv.taken);
      if (take > 0) { mv.taken += take; a.drill = Math.max(0, a.drill - take); }
      this.emit('drillShove', { k: a.k, boss: a.boss.name });
      return;
    }
    let k = 1;
    if (move === 'hairCheck' && mv.hairT > 0) { k = 2; mv.hairTaps += taps; }   // mid hair check: shoves count double
    a.drill = Math.max(0, a.drill - 0.07 * taps * k);
    this.emit('drillShove', { k: a.k, boss: a.boss.name });
    if (move === 'sorry') {   // Steve apologises his way back: each shove has a 25% chance of giving Kevin +0.04
      for (let i = 0; i < taps; i++) if (this.rng() < 0.25) { this.drill.me += 0.04; this.emitMove(a, 'countered', { dme: 0.04 }); }
    }
  }

  // ---------------------------------------------------------------- end of run
  end(reason) {
    if (this.over || this.ending) return;
    this.ending = true;            // atomic: nothing that end() triggers can end the race a second time
    const p = this.p, M = this.meta, s = this.s;
    this.won = reason === 'win';
    if (this.won) this.rank = 1;
    if (!this.won) this.rank = Math.max(2, this.rank);     // only the winner is #1
    const dist = Math.max(0, p.y - this.startY);
    const rank = this.rank;
    // a quit in the first 3000 is a restart, not a run: no daily, no run count, no rival ledger, distance DNA only
    const counted = reason !== 'quit' || dist >= 3000;
    // what got you: energy with acid in the last 3 s is the acid, 3+ goo bonks in the zone is the goo
    let cause = reason === 'win' ? null : reason;
    if (reason === 'energy') cause = this.t - p.acidT < 3 ? 'acid' : p.zoneBonks >= 3 ? 'bonk' : 'energy';
    // rivals: who did you finish ahead of? Only the ones you actually met count, either way.
    const beaten = [];
    if (counted) {
      for (const a of this.agents) {
        if (!a.boss || !(a.met || this.meet(a) || this.won)) continue;
        const nm = firstName(a.boss);
        const beat = this.won || (!a.alive) || (!a.arrived && a.y < p.y);
        if (beat) beaten.push(nm);
        if (M.rivals && typeof M.rivals === 'object') {
          const r = M.rivals[nm] || (M.rivals[nm] = { beat: 0, lost: 0 });
          if (beat) r.beat++; else r.lost++;
        }
      }
      M.bestRivals = Math.max(M.bestRivals || 0, beaten.length);
    }
    // THE EGG BANK: a win cashes your best chain of the run once more, as a STYLE 4 bank (comboBank {egg: true})
    if (this.won && !(this.t > 0 && this.autoT / this.t > 0.5)) {
      const eb = bankDna(Math.floor(p.bestCombo), 4);
      if (eb > 0) { this.dnaRun += eb; this.dnaBank += eb; this.emit('comboBank', { n: Math.floor(p.bestCombo), dna: Math.round(eb * 10) / 10, grade: bankGrade(p.bestCombo), style: 4, x: p.x, y: p.y, clutch: 0, finisher: true, mult: 1, blastN: 0, egg: true }); }
    }
    const by = reason === 'late' && this.eggTaken && this.eggTaken.boss ? firstName(this.eggTaken.boss) : null;
    // how far off the winner (or how far ahead of the next one), in seconds
    let gapSec = 0;
    if (this.won) {
      let best = Infinity;
      for (const a of this.agents) if (a.alive && a.arrived) best = Math.min(best, (a.need - a.drill) / this.drillRate(a));
      if (!isFinite(best)) { let my = -Infinity; for (const a of this.agents) if (a.alive && a.side === this.eggSide) my = Math.max(my, a.y); best = isFinite(my) ? (RACE_LEN - 70 - my) / s.speed : 99; }
      gapSec = Math.max(0, best);
    } else if (reason === 'late' && this.drill) {
      const el = Math.max(0.1, this.t - this.drill.t0);
      gapSec = Math.max(0, (this.drill.need - this.drill.me) / Math.max(0.3, this.drill.me / el));
    } else {
      let lead = p.y; for (const a of this.agents) if (a.alive) lead = Math.max(lead, a.y);
      gapSec = Math.max(0, (lead - p.y) / s.speed);
    }
    if (!Number.isFinite(gapSec)) gapSec = 0;
    gapSec = Math.round(gapSec * 10) / 10;
    // the named rival nearest ahead of you when it ended (the egg taker if one did): the next goal's target
    let gapBy = by;
    if (!this.won && !gapBy) {
      let best = Infinity;
      for (const a of this.agents) {
        if (!a.boss || !a.alive || (p.y >= FORK_Y0 && a.y >= FORK_Y0 && a.side !== (p.side || this.eggSide))) continue;
        const ay = a.arrived ? RACE_LEN - 70 : a.y;
        if (ay > p.y && ay - p.y < best) { best = ay - p.y; gapBy = firstName(a.boss); }
      }
    }
    // DNA
    const prog = clamp(p.y / RACE_LEN, 0, 1);
    const genMul = genFactor(this.gen), autoFrac = this.t > 0 ? clamp(this.autoT / this.t, 0, 1) : 0, auto = autoFrac > 0.5;
    const practice = this.won && auto;    // an autopilot win: a baby for the album, but no new generation
    const bk = {
      dist: dist / 2000,
      place: placePay(rank) + (this.won && !practice ? WIN_BONUS : 0),
      combo: this.dnaRun - this.dnaBank - this.dnaBonus,
      bank: this.dnaBank,
      bounty: this.dnaBonus + 3 * beaten.length + (beaten.includes(firstName(RIVALS[RIVALS.length - 1])) ? 15 : 0),
      // photo finish: beaten at the egg itself pays for how far you drilled
      photo: reason === 'late' && this.drill ? Math.min(36, Math.round(55 * clamp(this.drill.me / this.drill.need, 0, 1))) : 0,
      // so near: a rival got in while you were still swimming for it, the closer the more it pays
      // (and running dry in the last tenth of the race pays up to 50: 'So near!')
      near: (reason === 'late' && !this.drill ? Math.round(60 * clamp(1 - gapSec / 8, 0, 1)) : 0)
        + (reason === 'energy' && prog >= 0.9 ? Math.round(50 * clamp((prog - 0.9) / 0.1, 0, 1)) : 0),
      // a podium finish that was not a win
      podium: !this.won ? (rank === 2 ? 18 : rank === 3 ? 10 : rank <= 5 ? 5 : 0) : 0,
    };
    if (!counted) { bk.place = 0; bk.bounty = 0; bk.photo = 0; bk.near = 0; bk.podium = 0; }
    const raw = bk.dist + bk.place + bk.combo + bk.bank + bk.bounty + bk.photo + bk.near + bk.podium;
    const autoCut = raw * genMul * 0.6 * autoFrac;          // the autopilot keeps 40%
    let dailyBonus = 0, streak = M.dailyStreak || 0, dailyBest = false, medal = 0, medalDna = 0, medalNew = false;
    if (this.daily != null && counted) {
      if (M.dailyDay !== this.daily) {
        // the clock: opts.now, else now if this daily is today's, else the daily's own noon (old or test days)
        const real = Date.now(), now = this.now != null ? this.now : dailySeed(new Date(real)) === this.daily ? real : this.daily * 86400000 + 43200000;
        M.dailyDay = this.daily; M.dailyBest = TOTAL_SWIMMERS; M.dailyRuns = 0; M.dailyMedal = 0;
        streak = M.dailyLastDay < this.daily && streakAlive(M, now) ? streak + 1 : 1;
        M.dailyStreak = streak; M.dailyLastDay = this.daily; M.dailyLastAt = now; M.bestStreak = Math.max(M.bestStreak || 0, streak);
        dailyBonus = dailyBonusFor(streak, this.gen);
      }
      M.dailyRuns++;
      if (!auto) {
        dailyBest = rank < M.dailyBest; M.dailyBest = Math.min(M.dailyBest, rank);
        // medals: every tier newly reached today pays once
        medal = medalTier(this.won, rank);
        const had = clamp(Math.floor(M.dailyMedal || 0), 0, 3);
        if (medal > had) { medalDna = medalPay(had, medal, this.gen); medalNew = true; M.dailyMedal = medal; if (medal === 3) M.dailyGolds = (M.dailyGolds || 0) + 1; }
      }
    }
    // the bounty promised after the last run
    let goalDna = 0, goalDone = null;
    const g = M.goal;
    if (g && reason !== 'quit' && goalMet(g, { won: this.won, zone: this.zoneReached, combo: p.bestComboLate, beaten })) { goalDna = g.dna; goalDone = { id: g.id, dna: g.dna, k: g.k, target: g.target }; M.goal = null; }
    let dna = Math.max(0, Math.round(raw * genMul - autoCut)) + dailyBonus + goalDna + medalDna;
    if (!Number.isFinite(dna)) dna = 0;       // a NaN anywhere above never reaches the wallet
    if (!Number.isFinite(M.dna)) M.dna = 0;
    M.dna += dna; M.bestCombo = Math.max(M.bestCombo, Math.floor(p.bestCombo));
    if (counted) {
      // the normal runs (rookie grace): an unknown count (-1) is all the runs so far, then only non-daily ones count
      M.normRuns = normRunsOf(M) + (this.daily == null ? 1 : 0);
      M.runs++; if (this.daily == null) M.sinceWin = Math.min(99, (M.sinceWin || 0) + 1); if (!auto) M.best = Math.min(M.best, rank); } else M.quits = (M.quits || 0) + 1;
    // a 'late' loss at the egg itself is an egg loss (drill faster next time); one before you even got there
    // is a race loss (the named rivals get a little slower next time, never in the daily)
    if (this.won) { M.eggLosses = Math.floor((M.eggLosses || 0) / 2); M.raceLosses = Math.floor((M.raceLosses || 0) / 2); }   // a win eases off, not a wall
    else if (reason === 'late' && this.drill) M.eggLosses = Math.min(99, (M.eggLosses || 0) + 1);
    else if ((reason === 'late' || (reason === 'energy' && prog >= 0.9)) && this.daily == null && counted) M.raceLosses = Math.min(99, (M.raceLosses || 0) + 1);
    if (!this.won && counted) M.winStreak = 0;
    let baby = null;
    if (this.won) {
      baby = babyFor(this.rng, this.muts); baby.gen = this.gen + 2; baby.run = M.runs;   // the hero is Gen 1, the first baby Gen 2
      if (practice) baby.practice = true; else { M.gen++; M.sinceWin = 0; M.winStreak = (M.winStreak || 0) + 1; M.lastWinStreak = M.winStreak; }
      M.babies.push(baby); M.wins++;
    }
    const breakdown = { dist: Math.round(bk.dist), place: Math.round(bk.place), combo: Math.round(bk.combo), bank: Math.round(bk.bank), bounty: Math.round(bk.bounty), photo: bk.photo,
      near: bk.near, podium: bk.podium, genMul, autoCut: Math.round(autoCut), dailyBonus, goal: goalDna, medal: medalDna };
    this.over = { reason, cause, rank, dna, dist, baby, combo: Math.floor(p.bestCombo), comboLate: Math.floor(p.bestComboLate || 0), head: this.drill ? this.drill.head : 0, overtakes: p.overtakes, zone: this.zoneReached,
      tier: p.bestTier, synergies: Object.keys(this.syn), comboDna: Math.round(this.dnaFromCombo), daily: this.daily, dailyBest,
      events: this.schedule.filter((e) => p.y >= e.y0).map((e) => e.id),
      by, gapBy, rivalsBeaten: beaten, gapSec, auto, practice, breakdown, dailyBonus, streak: this.daily != null && counted ? streak : 0, goalDone, photo: bk.photo, counted,
      dailyRule: this.dailyRule, medal: this.daily != null ? medal : 0, medalNew };
    if (reason !== 'quit') nextGoal(M, this.over);
    this.over.nextGoal = M.goal;
    this.emit('over', this.over);
  }

  progress() { return clamp((this.p.y) / RACE_LEN, 0, 1); }
  remaining() { return Math.max(0, RACE_LEN - 70 - this.p.y); }
}

export { RACE_LEN, ZONES, MUTATIONS, HABITS, HABIT_ORDER, habitCost };
