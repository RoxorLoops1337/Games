// Million To One: the race simulation. No DOM, no audio: index.html draws it,
// tests/million_to_one_core.test.mjs drives it headless.
import { RIVALS, ZONES, RACE_LEN, MUTATIONS, MUT_ORDER, HABITS, HABIT_ORDER, habitCost, TOTAL_SWIMMERS, babyFor, HABIT_PERKS, PX_PER_CM } from './content.js';

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
const fin = Number.isFinite, ok = (v, f) => (Number.isFinite(v) ? v : f);   // (the NaN firewall's helpers)
const D0 = -0;
const P_DOUBLES = ['x', 'y', 'vx', 'vy', 'e', 'maxE', 'dashT', 'dashCd', 'frenzyT', 'combo', 'comboT', 'comboMax', 'fzPen', 'fzPts', 'mult', 'bestCombo', 'bestComboLate', 'bank',
  'draftT', 'passT', 'passX', 'draftHold', 'draft', 'stuck', 'inv', 'acid', 'heading', 'swatT', 'clutch', 'couchT', 'acidT', 'swatSafe', 'actT', 'trickMult', 'magT', 'dashRefund', 'lastTrickT', 'fzCarry', 'leadSec', 'capDraftT', 'goo', 'swatSlow', 'swerveT', 'txT'];     // a double zero: a field that starts with it is stored as a double from birth (no shape changes later)

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
export const STYLE_WINDOW = 7.5, PASS_STYLE_MAX = 1;
// the Launch Tube is the warm-up: its chain clamps at Z0_COMBO_MAX, and after the first link of a dash or a draft the
// plain passes of that same dash or draft count Z0_PLOW each
export const Z0_COMBO_MAX = 30, Z0_PLOW = 0.2;
// combo bridges: the timer drains slower while you draft or dash; a fruit sugar or a DNA blob tops it up
export const DRAFT_DRAIN = 0.4, DASH_DRAIN = 0.5, PICKUP_REFILL = 0.4;
// a pickup is a trick step (SNACK) only when Kevin swam for it: it was within PICK_AIM px of his line when the magnet
// caught it (e.lat). One the magnet pulls in from the side still pays, it just is not a move
export const PICK_AIM = 18;
export const SLING_HOLD = 0.6;
// a dash that plows the crowd pays for itself: +DASH_REFUND GAS a rival passed while dashing, at most DASH_REFUND_CAP a dash
export const DASH_REFUND = 1.5, DASH_REFUND_CAP = 6;
// the draft feel hooks: draftOn once a tuck-in has held DRAFT_ON s (slingReady at SLING_HOLD)
export const DRAFT_ON = 0.15;
// the draft at phone scale: catch a rival DRAFT_ACQ off your line (DRAFT_ACQ_TOUCH with a finger on the glass), keep it
// until DRAFT_KEEP, and a still thumb is pulled onto its line at up to DRAFT_MAG px/s
export const DRAFT_ACQ = 20, DRAFT_ACQ_TOUCH = 26, DRAFT_KEEP = 28, DRAFT_MAG = 90;
// the first swim: six slowpokes [dy from the start, dx from the tube centre] at CONGA_SP of the crowd for CONGA_T s,
// and a free Second Wind that lasts to the end of zone FREE_SECOND_ZONE
export const CONGA = [[1500, -6], [1565, 8], [1630, -10], [1695, 5], [1760, -4], [1828, 10]], CONGA_SP = 0.6, CONGA_T = 8, FREE_SECOND_ZONE = 2;
// STRAGGLERS (Race.placeStragglers): clumps of STRAG_MIN..STRAG_MAX tired far-field swimmers at STRAG_Y and at ZSTART[acid]
// + STRAG_ACID, lanes +/-STRAG_LANE (a zigzag: every other one on the other side, a slalom to weave), STRAG_GAP px apart, at STRAG_SP of the field's speed,
// fill the hole between the opening pack and the far field. No acid puddle spawns within STRAG_CLEAR px of the lane of
// a straggler Kevin is still chasing, around the row where he catches it.
export const STRAG_Y = [3800, 4750, 5700, 6650, 7600, 8550], STRAG_ACID = [500, 1450, 2400], STRAG_MIN = 4, STRAG_MAX = 5, STRAG_GAP = 25;
export const STRAG_LANE = [0.15, 0.5], STRAG_SP = [0.55, 0.65], STRAG_CLEAR = 120, STRAG_AFTER = 800;
// a straggler's speed: its draw (the same one as ever, so the layout's random sequence never moves) is squeezed to
// STRAG_SP_JIT around the middle of STRAG_SP, so every clump keeps its STRAG_Y spacing all the way up (with the full
// 0.55-0.65 spread two clumps drifted 900 px apart in 20 s and a thumb met nobody for a few seconds on some seeds)
export const STRAG_SP_JIT = 0.01;
// SCHOOLS (Race.placeSchools): about SCHOOL_MAX far-field swimmers re-seeded as schools of SCHOOL_N through the Acid Lagoon
// (from its door + SCHOOL_Y0 to + SCHOOL_Y1, one every SCHOOL_GAP px), so the Lagoon never empties out mid-race
export const SCHOOL_MAX = 100, SCHOOL_N = [6, 10], SCHOOL_GAP = [1000, 1300], SCHOOL_Y0 = 1500, SCHOOL_Y1 = 16500, SCHOOL_LANE = 0.35, SCHOOL_SP = [0.55, 0.7];
export const stragSp = (u) => (STRAG_SP[0] + STRAG_SP[1]) / 2 + (u * 2 - 1) * STRAG_SP_JIT;
export const PASS_KINDS = new Set(['pass', 'slingshot', 'weave', 'snipe']);   // every kind of overtake link
export const STYLE_KINDS = new Set(['pass', 'slingshot', 'weave', 'snipe', 'rival', 'close', 'gate', 'dodge', 'pop', 'bump', 'sugar', 'dna', 'draft', 'domino']);
export const styleMult = (style) => 1 + 0.15 * (clamp(style || 1, 1, 6) - 1);
// A banked combo (the timer ran out cleanly) gets a grade: index into BANK_GRADES, from these chain lengths.
export const BANK_AT = [10, 25, 40, 60, 85];
export const bankGrade = (n) => { let g = 0; while (g < BANK_AT.length - 1 && n >= BANK_AT[g + 1]) g++; return g; };
// BANK_K * n^1.4 * style * (1 + clutch) * (1 + trick). Past BANK_SOFT (40) it goes on in a straight line (the slope at 40,
// BANK_SLOPE: 0.46 a link): one 80 bank always beats two 40s, so holding a chain is the greedy play, yet a monster never explodes.
// (BANK_K 0.07, was 0.10: a FINISHER keeps its STYLE now and the STYLE window is 7.5 s, so banks run at STYLE 4-5 far
// more often; the bank's base came down so a run pays about what it did and the shop still lasts a career)
export const BANK_SOFT = 40, BANK_K = 0.048;   // (0.048, was 0.052: the photo finish and the bounties pay more, so the bank pays a little less)
export const BANK_AT_SOFT = BANK_K * Math.pow(BANK_SOFT, 1.4), BANK_SLOPE = 1.4 * BANK_K * Math.pow(BANK_SOFT, 0.4);
export const bankBase = (n) => { n = Math.max(0, n || 0); return n <= BANK_SOFT ? BANK_K * Math.pow(n, 1.4) : BANK_AT_SOFT + BANK_SLOPE * (n - BANK_SOFT); };
export const bankDna = (n, style, clutch = 0, trick = 0) => bankBase(n) * styleMult(style) * (1 + clamp(clutch || 0, 0, 0.5)) * (1 + clamp(trick || 0, 0, TRICK_MULT_CAP));
// FINISHER: cashing a chain out on purpose pays the bank times this. A chain that just runs out pays
// TIMEOUT_BANK (x1 with Echo Chamber or Elephant Brain), so cashing out on purpose is the far better play.
export const finisherMult = (style) => (style >= 5 ? 2.0 : style >= 4 ? 1.7 : style >= 3 ? 1.45 : 1.3);
export const TIMEOUT_BANK = 0.6;
export const FINISHER_BLAST_AT = 18;      // a finisher on a bank this big also blasts (pops Big Macros, shoves rivals)
export const finisherBlastR = (bank) => 120 + 2 * Math.min(Math.max(0, bank), 100);
export const finisherSeed = (bank, cap = 8) => Math.min(cap, Math.floor(0.1 * Math.max(0, bank)));   // links the next chain starts with
// BUZZER BEATER: a FINISHER cashed with the timer under BUZZER_AT of its full length pays finisherMult + BUZZER_K and seeds
// the next chain with up to BUZZER_SEED links (comboBank and comboEnd carry buzzer: true)
export const BUZZER_AT = 0.25, BUZZER_K = 0.4, BUZZER_SEED = 16;
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
// Tricks FLOW: the link that finishes a trick stays in the strip as the first step of the next one, and every trick
// ends on a kind that opens another (tailgate -> grudge -> matador -> pinball ...), so a TRICK STREAK is 2 more links,
// not a whole new recipe.
export const TRICKS = [
  { id: 'tailgate', kinds: ['weave', 'draft', 'rival'] },
  { id: 'matador',  kinds: ['close', 'dodge', 'weave'] },
  { id: 'pinball',  kinds: ['gate', 'bump', 'weave'] },
  { id: 'grudge',   kinds: ['rival', 'bump', 'close'] },
  { id: 'snack',    kinds: ['sugar', 'dna', 'close'] },
  { id: 'popcorn',  kinds: ['pop', 'weave', 'close'] },
  { id: 'domino',   kinds: ['bump', 'pop', 'rival'] },     // (the id stays 'domino' so saved meta.tricks counts stay valid)
  { id: 'needle',   kinds: ['gate', 'weave', 'pop'] },
  // 'cash' is no link and no STYLE kind: cashOut pushes it into the sequence, so a finisher can open a trick
  { id: 'encore',   kinds: ['cash', 'pop', 'weave'] },
  { id: 'rebound',  kinds: ['cash', 'slingshot', 'rival'] },
  // (the overtake tricks: each ends on a kind that opens another, so they flow too)
  { id: 'driveby',  kinds: ['slingshot', 'snipe', 'rival'] },
  { id: 'rush',     kinds: ['snipe', 'gate', 'bump'] },
  { id: 'conga',    kinds: ['draft', 'slingshot', 'close'] },
];
// A SLINGSHOT is a weave with a dash in it: it also advances any recipe whose next step is 'weave'. A SNIPE (a pass
// closer than 30) is a close shave: it also advances any recipe whose next step is 'close' (TRICK_ALIAS).
export const TRICK_ALIAS = { slingshot: 'weave', snipe: 'close' };
// CONGA needs a real line, not three links any pack hands out: the slingshot must leave within CONGA_SLING_GAP s of
// the draft (the draft step's last refresh), and the close must land CONGA_DRAFT_AGE s or more after it
// (was: any draft, any slingshot and any close inside TRICK_T; conga was 47-48% of the half-habit bots' tricks)
// A SNIPE (the close alias) only closes a conga CONGA_SNIPE_GAP s or more after its slingshot: a sling straight into the
// next rival of a pack is plowing, not a line (conga was 53% of the fresh saves' tricks; a real close counts any time)
export const CONGA_SLING_GAP = 0.6, CONGA_DRAFT_AGE = 0.6, CONGA_SNIPE_GAP = 1.0;
const stepOK = (T, s, n, t, kind) => T.id !== 'conga' || (n === 1 ? t - s[0].t <= CONGA_SLING_GAP + 1e-6
  : t - s[0].t >= CONGA_DRAFT_AGE - 1e-6 && (kind === 'close' || t - s[1].t >= CONGA_SNIPE_GAP - 1e-6));
// FEATURED TRICK: every normal race (never the daily, never the title demo) features one trick the save has not found
// yet (meta.tricks; a random one once all are found): race.featuredTrick, its links pay x FEATURED_K. Emits
// featuredTrick {id} once at the countdown (the first step).
export const FEATURED_K = 2;
// TRICK STREAK: a different trick within TRICK_STREAK_T s of the last one climbs p.trickStreak (anything else resets it
// to 0). A trick's links pay x(1 + TRICK_STREAK_K * streak), at most x TRICK_STREAK_CAP; from streak 2 a running
// FRENZY also gets TRICK_STREAK_FRENZY s. Emits trickStreak {n, x, y, mult}.
// MEDLEY: the MEDLEY_AT-th trick of a streak (five different tricks in a row) lights FRENZY (igniteFrenzy('medley')), or
// climbs a running one a tier (within the STYLE cap), and pays MEDLEY_LINKS more links; its trickStreak event has medley: true
// (TRICK_STREAK_K 0.5, CAP 4 (0.75, 3): the streak pays a little less a step and climbs further, the medley is the peak)
export const TRICK_STREAK_T = 13.0, TRICK_STREAK_K = 0.5, TRICK_STREAK_CAP = 4, TRICK_STREAK_FRENZY = 1.5;
// (a medley climbs into GOD MODE only from a fully OVERCLOCKED HYPER (MEDLEY_GOD_OC stacks, 15.5x of the 17x): GOD MODE
// stays rare and earned)
export const MEDLEY_AT = 4, MEDLEY_LINKS = 10, MEDLEY_GOD_OC = 4;
// the featured trick for a save and a layout seed: one it has not found (meta.tricks), else any. A recipe with a 'bump'
// step is skipped unless the mutations held (muts) knock rivals about (ram or mosh): a race starts with none held
// (the ones not yet landed FEATURED_FRESH times are taken easiest first, FEATURED_LADDER: the seed picks among the next
// FEATURED_PICK of them, so the featured trick is the next one in reach, not the hardest one left every race)
export const FEATURED_LADDER = ['conga', 'snack', 'tailgate', 'popcorn', 'matador', 'needle', 'driveby', 'rebound', 'encore', 'pinball', 'rush', 'grudge', 'domino'];
export const FEATURED_PICK = 2, FEATURED_FRESH = 4;
export const featuredTrickFor = (meta, seed, muts = null) => {
  const tk = meta && meta.tricks && typeof meta.tricks === 'object' ? meta.tricks : {};
  const bumps = !!(muts && ((muts.ram || 0) > 0 || (muts.mosh || 0) > 0));
  const rank = (T) => { const i = FEATURED_LADDER.indexOf(T.id); return i < 0 ? 99 : i; };
  const can = TRICKS.filter((T) => bumps || !T.kinds.includes('bump'));
  const fresh = can.filter((T) => !((tk[T.id] || 0) >= FEATURED_FRESH)).sort((a, b) => rank(a) - rank(b)).slice(0, FEATURED_PICK), pool = fresh.length ? fresh : can;
  return pool[hashSeed((seed >>> 0) ^ 0x7F4A7C15) % pool.length].id;
};
export const trickStreakMult = (n) => Math.min(TRICK_STREAK_CAP, 1 + TRICK_STREAK_K * Math.max(0, n || 0));
export const TRICK_T = 7.0, TRICK_LINKS = 5, TRICK_FIRST = 3, TRICK_MULT = 0.2, TRICK_MULT_CAP = 1.0, TRICK_FRENZY = 1.0, TRICK_DNA = 10;
// the same trick landed again in one run tires: its links and bank growth x trickFatigue(nth landing), and from the
// TRICK_TIRED-th it grows no bank and adds no FRENZY time (vary the moves)
export const TRICK_FATIGUE = 0.2, TRICK_FATIGUE_MIN = 0.4, TRICK_TIRED = 4;
export const trickFatigue = (nth) => Math.max(TRICK_FATIGUE_MIN, 1 - TRICK_FATIGUE * (Math.max(1, nth || 1) - 1));
// the FRENZY tier your STYLE allows: 1 kind tier 1, 2 kinds tier 2, 3 kinds tier 4, 4+ kinds everything
export const styleTierCap = (style) => (style >= 4 ? Infinity : style >= 3 ? 4 : style >= 2 ? 2 : 1);

// FRENZY tiers: each threshold crossed in one unbroken chain climbs a tier. Effects stack upward.
// at: multiple of the base FRENZY threshold (10, or less with Hype Man). CASH TO CLIMB: a FINISHER cashed while FRENZY runs
// keeps the FRENZY progress (p.fzCarry): the chain restarts, the climb does not.
// GOD MODE sits at 17x the base (was 8x, then 14x: half-habit bots reached it on 10-12 of 24 runs at 8; at 14 it was 2-3
// of 24, rare and earned, and 17 keeps it so with the bigger trick chains). FRENZY_TIER_ADD: the seconds a tier climbed mid FRENZY adds (up to the full frenzyLen; it was a refill to the full
// frenzyLen, which kept a long chain in FRENZY for 75% of the race)
export const FRENZY_TIER_ADD = 2;
// OVERCLOCK: in HYPER FRENZY (tier 4) every OVERCLOCK_STEP x the base FRENZY threshold of FRENZY points past the HYPER
// threshold is one stack (p.oc, up to OVERCLOCK_MAX): +OVERCLOCK_ADD s of FRENZY (never past frenzyLen), +OVERCLOCK_SPEED
// speed and x(1 + OVERCLOCK_DNA x p.oc) on every link's DNA. Emits overclock {n, x, y}; FRENZY ending, a smash or a lost
// chain zero it. The road to GOD MODE (17x) has a beat every 2.5x
export const OVERCLOCK_STEP = 2.5, OVERCLOCK_MAX = 4, OVERCLOCK_ADD = 1.5, OVERCLOCK_SPEED = 0.03, OVERCLOCK_DNA = 0.1;
export const FRENZY_TIERS = [
  { name: 'FRENZY!',       at: 1,   speed: 0.3,  desc: 'Faster and louder.' },
  { name: 'MEGA FRENZY!',  at: 2.5, speed: 0.36, desc: 'Pickups fly to you from twice as far.' },
  { name: 'ULTRA FRENZY!', at: 4, speed: 0.42, desc: 'Combos last 50% longer.' },
  { name: 'HYPER FRENZY!', at: 5.5, speed: 0.48, desc: 'Acid cannot touch you.' },
  { name: 'GOD MODE!',     at: 17, speed: 0.55, desc: 'Nothing can hurt you and DNA blobs pay double.' },
];

// Two specific mutations owned together unlock a named synergy with an extra effect.
export const SYNERGIES = [
  { id: 'bulldozer', name: 'Bulldozer',         icon: '🚜', needs: ['ram', 'rush'],      desc: 'Bigger bumps, and every bump also pays Overtake Rush GAS.' },
  { id: 'supernova', name: 'Supernova',         icon: '🌟', needs: ['hype', 'nitro'],    desc: 'FRENZY starts with a blast that pops every Big Macro near you, and lasts 1.5s longer.' },
  { id: 'sugarHigh', name: 'Sugar High',        icon: '🍭', needs: ['magnet', 'sweet'],  desc: 'Every fruit sugar you grab adds +1 combo.' },
  { id: 'jetstream', name: 'Jetstream',         icon: '✈️', needs: ['draft', 'whip'],    desc: 'Dashing out of a draft is free and lasts longer.' },
  { id: 'porcupine', name: 'Porcupine',         icon: '🌵', needs: ['spiky', 'helmet'],  desc: 'A popped Big Macro pops its neighbours too. Chain pops!' },
  { id: 'comeback',  name: 'Comeback Kid',      icon: '🎬', needs: ['second', 'bloom'],  desc: 'Second Wind also starts FRENZY and gives +10% speed for the rest of the run.' },
  { id: 'hypeSquad', name: 'Hype Squad',        icon: '🎉', needs: ['wingman', 'hype'],  desc: 'Every FRENZY brings your Wingman back.' },
  { id: 'elephant',  name: 'Elephant Brain',    icon: '🐘', needs: ['memory', 'echo'],   desc: 'Dropped combos keep 3/4 instead of half.' },
  { id: 'greased',   name: 'Greased Lightning', icon: '⚡', needs: ['slick', 'goo'],     desc: 'Near misses also recharge your dash.' },
  { id: 'domino',      name: 'Domino Effect',   icon: '🎳', needs: ['mosh', 'ram'],    desc: 'Every rival the Mosh Pit knocks over is +1 combo and +0.3s of FRENZY.' },
  { id: 'reserveTank', name: 'Reserve Tank',    icon: '⛽', needs: ['tank', 'second'],   desc: 'Second Wind refills you all the way and adds a shield.' },
  { id: 'jackpot',     name: 'Jackpot',         icon: '🎰', needs: ['lucky', 'magnet'],  desc: 'DNA blobs grabbed during FRENZY are also +1 combo.' },
  { id: 'afterburner', name: 'Afterburner',     icon: '🚀', needs: ['turbo', 'whip'],    desc: 'Dashes last 40% longer, and every dash in FRENZY adds +0.3s of FRENZY.' },
  { id: 'couchPotato', name: 'Couch Potato',    icon: '🛋️', needs: ['eco', 'draft'],     desc: 'No GAS drain while drafting, and +1 combo for every 1.5s you draft.' },
  { id: 'hazmat',      name: 'Hazmat Suit',     icon: '☢️', needs: ['antacid', 'goo'],   desc: 'Touching acid or goo counts as a near miss.' },
  { id: 'bloodhound',  name: 'Bloodhound',      icon: '🐕', needs: ['nose', 'rush'],     desc: 'The right tube at the Fork starts FRENZY, and overtakes in the next zone count double.' },
  { id: 'slot',        name: 'Slot Machine',    icon: '🍒', needs: ['chain', 'lucky'],   desc: 'In FRENZY every DNA blob adds +0.4s of FRENZY.' },
];
// SLOT MACHINE: a DNA blob grabbed in FRENZY adds SLOT_FZ s to it (up to twice frenzyLen)
export const SLOT_FZ = 0.4;
export function synergiesFor(muts) { return SYNERGIES.filter((s) => s.needs.every((id) => (muts[id] || 0) > 0)); }
export const SYNERGY_BONUS = 30;
// MUTATION CAPSTONES: the last level of a multi-level common card adds a twist (Race.cap[id] while held at max; each
// emits capstone {id, x, y} the first time it fires in a run, and choose() emits maxed {id, capstone} as a card hits its max)
//   turbo   TORPEDO: an overtake at full speed (unslowed: p.vy at least the base speed) is +1 link
//   tank    above CAP_TANK_AT of max GAS, +CAP_TANK_SP speed
//   helmet  a broken shield fires a CAP_RING_R px knockback ring (Big Macros pushed off and calmed, rivals shoved aside)
//   draft   every CAP_DRAFT_T s of drafting is +1 'draft' link
//   magnet  a pickup the magnet caught from CAP_MAGNET_K x the base reach (MAGNET_BASE) or further is a near miss
//   sweet   each fruit adds CAP_SWEET_FZ s to a running FRENZY
//   eco     FRENZY drains no GAS
//   memory  in FRENZY the combo timer never drops under CAP_MEMORY_FLOOR s
//   whip    passing a rival mid-dash resets the dash cooldown, once a dash
//   lucky   every DNA blob is +1 'dna' link
export const MUT_CAPSTONE_IDS = ['turbo', 'tank', 'helmet', 'draft', 'magnet', 'sweet', 'eco', 'memory', 'whip', 'lucky'];
export const CAP_TANK_AT = 0.5, CAP_TANK_SP = 0.05, CAP_RING_R = 120, CAP_DRAFT_T = 2, MAGNET_BASE = 34, MAGNET_HOLD = 0.35, CAP_MAGNET_K = 3, CAP_SWEET_FZ = 0.25, CAP_MEMORY_FLOOR = 1;   // DNA for discovering a synergy for the very first time
// after a save's first mashup: a card that completes one is dealt at x COMPLETER_W weight (the half you hold already
// tempts you; the deal does not have to), one is forced into a deal COMPLETER_FORCE of the time, and a deal holds at most
// one. A greedy picker (6 deals a run: 5 zones and the golden one) makes about 2.9 a run and fills the book in about 19 runs (0.5 / 0.1 gave 2 a run
// and a book in 35: the half you held felt like a broken promise)
export const COMPLETER_W = 1.25, COMPLETER_FORCE = 0.25;
export const LINK_DNA = 0.025;      // DNA per combo link, times the chain multiplier

// Random mid-race events. Each run schedules a few, placed by the layout seed, in zones that suit them.
export const RACE_EVENTS = {
  sneeze:     { name: 'DAD SNEEZED!',        text: 'Turbulence! Hold on to your tail.',                      zones: ['acid', 'goo', 'sea', 'rapids'] },
  sugarRush:  { name: 'SUGAR RUSH!',         text: 'Dad found the fruit bowl. Fruit EVERYWHERE.',            zones: ['acid', 'goo', 'sea', 'rapids'] },
  stampede:   { name: 'BIG MACRO STAMPEDE!',   text: 'The immune system called in the whole team. Dodge!',     zones: ['acid', 'sea', 'rapids'] },
  slipstream: { name: 'SLIPSTREAM HIGHWAY',  text: 'The tube flows your way. Drafting is doubled.',          zones: ['acid', 'goo', 'sea', 'rapids'] },
  disco:      { name: 'DISCO TUBE',          text: 'Dad put on his playlist. Combos last longer and pay double.', zones: ['acid', 'goo', 'sea', 'rapids'] },
  espresso:   { name: 'DAD HAD AN ESPRESSO', text: 'Everybody is jittery and FAST. GAS burns quicker.',   zones: ['goo', 'sea', 'rapids'] },
  goldRush:   { name: 'GOLDEN HOUR',         text: 'DNA blobs are raining down. Grab them!',                 zones: ['acid', 'goo', 'sea', 'rapids'] },
};
export const EVENT_ORDER = Object.keys(RACE_EVENTS);
// race events ramp with experience (normal runs played; dailies always get 3): run 1 none, runs 2-3 one friendly event,
// runs 4-7 two (the stampede and the espresso only from run 5), run 8+ three, and four from generation 5
export const FRIENDLY_EVENTS = ['sugarRush', 'goldRush', 'slipstream', 'disco'];
export const eventPlan = (meta) => {
  const nr = normRunsOf(meta), gen = Math.floor((meta && meta.gen) || 0);
  if (nr < 1) return { n: 0, kinds: null };
  if (nr < 3) return { n: 1, kinds: FRIENDLY_EVENTS };
  if (nr < 7) return { n: 2, kinds: nr < 4 ? EVENT_ORDER.filter((id) => id !== 'stampede' && id !== 'espresso') : null };
  return { n: gen >= 5 ? 4 : 3, kinds: null };
};
export const EVENT_LEN = 3200;
export const DAILY_LIGHT = 0.5;      // the daily rule outside the zones it suits runs at half strength

// Daily race: the player's LOCAL calendar day number is the seed (a new tube at local midnight, not at UTC midnight:
// New York no longer gets tomorrow's tube at 19:00), so everybody gets the same egg side and layout on the same date.
export const dailySeed = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
// the local day number of a wall-clock time in ms
export const localDay = (ms) => dailySeed(new Date(ms));
// when the next daily tube opens (ms): the next local midnight after now (the UI's 'next tube in' countdown)
export const nextDailyAt = (now = Date.now()) => {
  const d = new Date(now); d.setHours(24, 0, 0, 0); return d.getTime();
};
// a wall-clock time inside local day 'day' (its local noon): an old or test daily's clock
export const dayNoon = (day) => { const t = day * 86400000 + 43200000; return t + new Date(t).getTimezoneOffset() * 60000; };
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
// rookie goo gates: a gate's gap is ROOKIE_GATE * (1 - rookieFactor) wider; the first normal swim meets its first gate
// at least GOO_FIRST_GATE past the start of the Gate of Goo
export const ROOKIE_GATE = 60, GOO_FIRST_GATE = 700;
// the POPCORN PATCH (Race.popcornRows): POPCORN_MIN..POPCORN_MAX dozing Big Macros within POPCORN_R px, POPCORN_AFTER
// past a goo gate where the zone has gates; a dash passing within DASH_GRAZE px of any Big Macro is a 'pop' trick step
export const POPCORN_MIN = 3, POPCORN_MAX = 5, POPCORN_R = 120, POPCORN_AFTER = 400, DASH_GRAZE = 30, POPCORN_BOOP = 0.6;
// fruit droughts: at most SUGAR_GAP between two fruit trails on a side, and one inside the Acid Lagoon's first SUGAR_ACID_IN
// (the gap widens SUGAR_GAP_HZ a fruit step (fruitStep), to +3000 at step 8: sugarGap; the Acid Lagoon's door trail stays
// at every step. 375 a step with FRUIT_HZ_K 0.09 and the fruit floor puts greedy GAS deaths at about 6% of runs 15-30,
// flat over generations 1-10: see the target table in the tests)
export const SUGAR_GAP = 2600, SUGAR_ACID_IN = 1200;
// GAS a fruit sugar gives (before berries and Sweet Tooth). It was 6 while the magnet let a pickup caught far to the
// side trail behind a fast Kevin and never land (about 1 fruit in 6 was lost that way); the fixed magnet lands them all.
// The rookie runs (1-5) keep the old 6: they were tuned for a first win around run 4 (then SUGAR_GAS_TAPER: no cliff)
export const SUGAR_GAS = 4.85, SUGAR_GAS_ROOKIE = 6;
export const SUGAR_GAP_HZ = 375;
export const sugarGap = (hz) => SUGAR_GAP + SUGAR_GAP_HZ * Math.min(Math.max(0, hz || 0), 8);
// bullet-time steering cap (input.steerK) and the gate funnel (Race.gateFunnel)
export const STEER_K_MAX = 2.2;
// the sideways cap (px/s) a finger gets (STEER_CAP_TOUCH, STEER_CAP_DASH while dashing; 460 / 560 before: a thumb flick
// across the Great Womb Sea took 0.8 s and the steering lagged the thumb), keys and the autopilot STEER_CAP_KEYS, and the
// swerve kick (see step)
export const STEER_CAP_TOUCH = 580, STEER_CAP_DASH = 680, STEER_CAP_KEYS = 460, SWERVE_DX = 90, SWERVE_FRESH = 0.12, SWERVE_K = 1.2, SWERVE_T = 0.15;
export const FUNNEL_NEAR = 30, FUNNEL_FAR = 170, FUNNEL_REACH = 22, FUNNEL_AIM = 60, FUNNEL_K = 7, FUNNEL_MAX = 260;
// a named rival's target time to the egg at gen 0: the quickest BOSS_T0 s, the slowest BOSS_SPREAD s more (+/-BOSS_JIT per run)
export const BOSS_T0 = 116, BOSS_SPREAD = 28, BOSS_JIT = 0.025, DRILL_FORM = 0.05;
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
export const WBC_SPOT_D = 440, WBC_SPOT_T = 0.35, SWAT_SAFE = 0.2, SPARE_BITE = 35;
// a wall hair's swat bites: SWAT_CHAIN s off the chain's timer and x SWAT_SLOW forward speed for SWAT_SLOW_T s (p.swatSlow)
export const SWAT_CHAIN = 1.0, SWAT_SLOW = 0.7, SWAT_SLOW_T = 0.35;
// at speed a Big Macro spots you from further (up to WBC_SIGHT_MAX) with a shorter wind-up (never under 0.8 of it), so
// the warning time holds: sight / speed + wind-up is 0.9 s or more at any speed up to 1300
export const WBC_SIGHT_MAX = 1250;
export const wbcSight = (vy) => clamp(440 + 0.85 * ((vy || 0) - 445), WBC_SPOT_D, WBC_SIGHT_MAX);
export const wbcWindup = (vy) => WBC_SPOT_T * clamp(445 / Math.max(1, vy || 0), 0.8, 1);
// the spare bite (one Big Macro bite a run survived for SPARE_BITE energy) ends at generation SPARE_BITE_GEN
// (10, was 3: past run 12 the Big Macros did all the killing; a first bite now costs 35 GAS and the chain, so the tank
// pays for it and GAS is the core resource)
export const SPARE_BITE_GEN = 10;
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
export const HABIT_FX = { broccoli: 0.035, water: 6, sleep: 0.05, jeans: 550, berries: 0.06, walk: 0.08, beatbox: 0.25, hottub: 1, meditate: 1 };
// habits that keep growing with the generations (grandadLevels(gen) levels past the max): one a generation to gen 10, then
// one every 2 generations. The first GRANDAD_N grandad levels are worth GRANDAD_FX each, the later ones fade to GRANDAD_FX2
export const GRANDAD_FX = { broccoli: 0.015, water: 3, berries: 0.025, walk: 0.03, beatbox: 0.1 };
export const GRANDAD_FX2 = { broccoli: 0.008, water: 1, berries: 0.006, walk: 0.015, beatbox: 0.05 };
export const GRANDAD_N = 10;
// (frozen at GRANDAD_MAX levels, gen 30: the shop stops scaling where the field does)
export const GRANDAD_MAX = GRANDAD_N + 10;
export const grandadLevels = (gen) => { const g = Math.max(0, Math.floor(gen || 0)); return Math.min(GRANDAD_MAX, g <= GRANDAD_N ? g : GRANDAD_N + Math.floor((g - GRANDAD_N) / 2)); };
const GRANDAD = Object.keys(GRANDAD_FX);
export const GRANDAD_BROCCOLI = GRANDAD_FX.broccoli;
export const WATER_DRAIN = 0.01;     // drain per normal water level (a bigger tank is a thirstier tail); grandad water levels are free
// a habit's total effect at level l: HABIT_FX per normal level, GRANDAD_FX per grandad level
export const habitFx = (id, l) => {
  l = Math.max(0, l || 0); const n = HABITS[id].max, gl = Math.max(0, l - n);
  return HABIT_FX[id] * Math.min(l, n) + (GRANDAD_FX[id] || 0) * Math.min(gl, GRANDAD_N) + (GRANDAD_FX2[id] || 0) * Math.max(0, gl - GRANDAD_N);
};
export const broccoliFx = (l) => habitFx('broccoli', l);
// DNA multiplier per generation: +0.15 a generation to gen 10 (x2.5), then +0.05 a generation to gen 30 (x3.5): a late
// career is harder (speed, drain, hazards keep climbing) so it also pays more
export const genFactor = (gen) => { const g = Math.max(0, gen || 0); return 1 + 0.15 * Math.min(g, 10) + 0.05 * clamp(g - 10, 0, 20); };
export const META_VER = 2;     // 2: the hero is Gen 1, so saved babies moved up one generation
// how much faster each generation makes the field: +4.5%/gen for gens 1..4, +1%/gen to gen 10 (x1.24), then
// GEN_SPEED_TAIL +0.4%/gen to gen 30 (x1.32). The early climb comes while the habits are cheap; past gen 10 the tail only
// keeps pace with the grandad broccoli, so a maxed Kevin's speed over the named rivals' (430 x bossGenSpeed) stays
// within 5% of its gen-10 value at gens 20 and 30 (about -3.5% / -3.7%). It was +1.2%/gen: a treadmill a maxed late
// career could not outswim (0.005, the first retune, still left gen 30 5.05% short)
export const GEN_SPEED_TAIL = 0.004;
export const genSpeed = (gen) => { const g = clamp(Math.floor(gen || 0), 0, 30); return 1 + 0.045 * Math.min(g, 4) + 0.010 * clamp(g - 4, 0, 6) + GEN_SPEED_TAIL * Math.max(0, g - 10); };
// named rivals get +0.4%/gen on top (to gen 20)
export const bossGenSpeed = (gen) => genSpeed(gen) + 0.004 * clamp(Math.floor(gen || 0), 0, 20);
// the tube's hazard steps: one a generation from gen 2, up to HZ_CAP (never in the daily). Steps past 8 add 4% each.
export const HZ_CAP = 14;
// Big Macros grow WBC_HZ a hazard step (hzMul; was 0.1), and the Rapids' wall hairs RAPIDS_CILIA_HZ a step on top of
// the 0.1 every zone's hairs grow: the swim takes a bigger share of a mid career's losses (GAS plus hazard endings
// 15%+ of runs 15-30), the egg duel a smaller one
// (WBC_HZ 0.15 (0.25): the lungers and twins come sooner (HZ_NEW), so the plain Big Macro count grows slower)
export const WBC_HZ = 0.15, RAPIDS_CILIA_HZ = 0.08;
// and WBC_HZ_LATE more a career hazard step past WBC_LATE_FROM (hzCareer: the normal runs played, not the generation),
// so the mid career swim keeps its teeth while a fast winner's tube is no harder for it (runs 15-30 ended 13-16% before
// THE EGG on the race-fed duel without it; the table asks 18%+). Never in the daily
// (0.22, was 0.35: past run 12 Big Macros did all the killing and GAS none; the tank is the core resource again)
export const WBC_HZ_LATE = 0.22, WBC_LATE_FROM = 2;
// new READS with the hazard steps (never in the daily: its hzGen is 0): from step 1 sliding goo gates, from 3 Big Macro
// twins, from 4 puddles that pulse on the beat, from 6 wall hairs in opposite pairs, from 7 lungers, from 9 closing
// gates (2 / 4 / 6 / 8 / 10 / 12 before: a career met its last new read past run 40). The first of each a run meets
// emits hzNew {id}.
export const HZ_NEW = { slide: 1, twins: 3, pulse: 4, pair: 6, lunge: 7, close: 9 };
// LUNGERS (step HZ_NEW.lunge+): lungeShare(hg) of the Big Macros (less under WBC_TWIN_NARROW). After the spot wind-up,
// with Kevin LUNGE_DY_MIN..LUNGE_DY_MAX below, one crouches LUNGE_CROUCH s (e.crouch counts down; a second 'spot' is the
// tell) aimed at Kevin's x then (e.tx, e.ty), dashes LUNGE_SPEED u/s for at most LUNGE_LEN (e.lunge = 1), then sulks
// stunned LUNGE_STUN s (e.cool). Swimming past a stunned lunger is a 3-link dodge. Never while Kevin is within
// LUNGE_SAFE of his start.
// (the lungers ramp in: LUNGE_SHARE_0 of the Big Macros at their first step, +LUNGE_SHARE_STEP a step, up to LUNGE_SHARE;
// a narrow tube LUNGE_NARROW_K of that: lungeShare)
export const LUNGE_SHARE_0 = 0.08, LUNGE_SHARE_STEP = 0.055, LUNGE_NARROW_K = 2 / 3;
export const LUNGE_SHARE = 0.3, LUNGE_SHARE_NARROW = LUNGE_SHARE * LUNGE_NARROW_K, LUNGE_CROUCH = 0.45, LUNGE_SPEED = 900, LUNGE_LEN = 170, LUNGE_STUN = 1.2;
export const LUNGE_DY_MIN = 80, LUNGE_DY_MAX = 320, LUNGE_SAFE = 450;
// the pounce leads its target: the window slides LUNGE_LEAD s of Kevin's speed further off, the aim is where he will be
// LUNGE_CROUCH + LUNGE_AIM_T s after the crouch starts (lungeAim), and that point must be LUNGE_FRONT+ in front of the cell
export const LUNGE_LEAD = 0.45, LUNGE_AIM_T = 0.08, LUNGE_FRONT = 50;
export const lungeShare = (hg, narrow = false) => (hg < HZ_NEW.lunge ? 0 : Math.min(LUNGE_SHARE, LUNGE_SHARE_0 + LUNGE_SHARE_STEP * (hg - HZ_NEW.lunge)) * (narrow ? LUNGE_NARROW_K : 1));
export const lungeAim = (py, vy) => py + Math.max(0, vy || 0) * (LUNGE_CROUCH + LUNGE_AIM_T);
// CLOSING GATES (step HZ_NEW.close+): half the goo gates (e.close = 1) breathe their gap on a CLOSE_T s sine from gw down to
// max(CLOSE_MIN, gw - CLOSE_BY), never under CLOSE_MIN
export const CLOSE_T = 1.6, CLOSE_BY = 22, CLOSE_MIN = 62;
export const closeGw = (gw0, ph) => { const lo = Math.max(CLOSE_MIN, gw0 - CLOSE_BY); return gw0 <= lo ? gw0 : lo + (gw0 - lo) * (0.5 + 0.5 * Math.cos(ph)); };
export const SLIDE_HZ = 0.45;
// EARLY-ZONE MOVERS (normal runs only: never the daily, never swim 1; their rolls come from a row RNG of their own, so
// every layout roll holds). DRIFTERS: about DRIFT_SHARE of the Acid Lagoon's puddles (r DRIFT_R) sway DRIFT_AMP px on a
// DRIFT_T s sine (e.drift, the hitbox follows). DRIPPERS: one Gate of Goo gate in DRIP_SHARE drips: every DRIP_EVERY s a
// DRIP_TELL s tell (e.dripTell > 0), then a r DRIP_R glob (a goo blob, e.drop) falls DRIP_FALL px toward Kevin at
// DRIP_VY u/s and sits DRIP_LIFE s; never in a gap's column. Both are non-lethal and get an hzNew intro ('drift', 'drip')
export const DRIFT_SHARE = 0.25, DRIFT_AMP = 55, DRIFT_T = 2.6, DRIFT_R = [20, 30];
export const DRIP_SHARE = 1 / 3, DRIP_EVERY = 1.8, DRIP_TELL = 0.5, DRIP_R = 24, DRIP_FALL = 160, DRIP_VY = 220, DRIP_LIFE = 1.2;
export const slideAmp = (hg) => 18 + 6 * Math.min(hg, 6);
export const hzGenOf = (gen) => clamp(Math.floor(gen || 0) - 1, 0, HZ_CAP);
// mid-career tension: one hazard step per HZ_CAREER_EVERY normal runs past HZ_CAREER_FROM, up to HZ_CAREER_MAX
export const HZ_CAREER_FROM = 6, HZ_CAREER_EVERY = 3, HZ_CAREER_MAX = 10;
// (gated on wins: at most 1 + HZ_CAREER_WIN_K steps a win, so a save that has not won yet never meets a harder tube for
// having lost a lot)
export const HZ_CAREER_WIN_K = 2;
export const hzCareer = (meta) => clamp(Math.min(Math.floor((normRunsOf(meta) - HZ_CAREER_FROM) / HZ_CAREER_EVERY), 1 + HZ_CAREER_WIN_K * Math.floor(+(meta && meta.wins) || 0)), 0, HZ_CAREER_MAX);
// (past step 8 every step adds HZ_LATE: the late career's grandad habits made the swim nearly safe)
export const HZ_LATE = 0.2;
export const hzMul = (hg, per) => 1 + per * Math.min(hg, 8) + HZ_LATE * Math.max(0, hg - 8);
// the fruit thins out with the fruit steps (1 / (1 + FRUIT_HZ_K a step)), to x0.53 at 10 steps and no further
// (mid-career races got their teeth back: the guaranteed fruit gap widens with the steps too, sugarGap)
export const FRUIT_HZ_MAX = 10;
export const FRUIT_HZ_K = 0.06;
export const fruitMulOf = (hg) => 1 / (1 + FRUIT_HZ_K * Math.min(hg, FRUIT_HZ_MAX));
// the fruit's own step: the hazard step, but at least fruitFloor(gen) (FRUIT_FLOOR + a step a generation from generation 1,
// up to FRUIT_FLOOR_MAX): the fruit thins out with the first baby, ahead of the tube's hazards, so a GAS death is a real
// threat from the first generations and grows smoothly with them (never in the daily)
// (FRUIT_FLOOR 0 and FRUIT_FLOOR_K 1.75 steps a generation, to FRUIT_FLOOR_MAX 5: 1 / 3 / 5 at gens 1-3. The first baby's
// tube is barely thinner than the rookie one, so a first win is no fruit cliff, and by gen 3 GAS is a threat again: greedy
// GAS deaths about 8% / 7% / 10% over gens 1-3 / 4-6 / 7-10)
// (FRUIT_FLOOR_MAX 4 (5): with the floor eased in below, gens 4-6 ran dry 5+ points more often than gens 1-3)
export const FRUIT_FLOOR = 0, FRUIT_FLOOR_K = 1.75, FRUIT_FLOOR_MAX = 4;
export const fruitFloor = (gen) => { const g = Math.floor(gen || 0); return g >= 1 ? Math.min(FRUIT_FLOOR_MAX, Math.floor(FRUIT_FLOOR + FRUIT_FLOOR_K * g)) : 0; };
// the floor eases in: before normal run FLOOR_EASE_RUNS (n, normRuns) it is at most FLOOR_EASE_MAX, so a save that wins
// its way to gen 2 or 3 inside its first 8 runs meets no fruit cliff right after the rookie grace (a gen 2 floor of 3 on
// runs 6-8 was a 24% GAS death rate)
export const FLOOR_EASE_RUNS = 8, FLOOR_EASE_MAX = 1;
export const fruitStep = (gen, hz, daily = false, n = Infinity) => (daily ? 0 : Math.min(HZ_CAP, Math.max(Math.max(0, hz || 0), n < FLOOR_EASE_RUNS ? Math.min(FLOOR_EASE_MAX, fruitFloor(gen)) : fruitFloor(gen))));
// GAS drain per generation (genDrain, GEN_DRAIN): +2.5%/gen for gens 1..4 (the first babies meet a thirstier tube),
// +0.6%/gen for gens 5..10, then +1.2%/gen to gen 30, where it freezes with the field and the shop (x1.10 at gen 4, x1.136
// at gen 10, x1.376 at gen 30). The grandad water, berries and the dash refund fill the tank late in a career, so the
// late tail keeps drinking: the tank matters all career
// the drain by zone: +5% a zone, and +ZONE_DRAIN_LATE (6%) more a zone past the Great Womb Sea (the late tube is thirsty)
export const ZONE_DRAIN = 0.05, ZONE_DRAIN_LATE = 0.06;
export const zoneDrain = (zi) => 1 + ZONE_DRAIN * zi + ZONE_DRAIN_LATE * Math.max(0, zi - SEA_I);
export const GEN_DRAIN = [0.025, 0.006, 0.012];
export const DRAIN_SPEED_POW = 0.6;
export const genDrain = (gen) => { const g = clamp(Math.floor(gen || 0), 0, 30); return 1 + GEN_DRAIN[0] * Math.min(g, 4) + GEN_DRAIN[1] * clamp(g - 4, 0, 6) + GEN_DRAIN[2] * Math.max(0, g - 10); };
// the normal (non-daily) runs counted so far: the rookie grace counts these, so dailies never use it up.
// meta.normRuns < 0 (or missing) means unknown: every run counts (an old save or a hand-made meta).
export const normRunsOf = (meta) => { if (!meta) return 0; const n = +meta.normRuns; return Math.max(0, Math.floor(n >= 0 ? n : +meta.runs || 0)); };
// rookie grace for the first five runs (never in the daily): 0 when off, else the drain/acid factor
export const ROOKIE_TAPER = [0.55, 0.65, 0.75, 0.85, 0.93];
export const rookieFactor = (meta, daily) => { const n = normRunsOf(meta); return daily == null && meta && n < ROOKIE_TAPER.length ? ROOKIE_TAPER[n] : 0; };
// no GAS cliff when the rookie grace ends: the normal runs just past it (normRuns 5, 6, 7: the 6th to 8th swims) step the
// fruit down from SUGAR_GAS_ROOKIE to SUGAR_GAS (SUGAR_GAS_TAPER), and the drain up from the last ROOKIE_TAPER to 1
// (ROOKIE_DRAIN_TAPER, normRuns 5 and 6)
export const SUGAR_GAS_TAPER = [5.6, 5.3, 5.05], ROOKIE_DRAIN_TAPER = [0.95, 0.97, 0.99];
export const sugarGasOf = (meta, daily) => {
  if (daily != null) return SUGAR_GAS;
  const n = normRunsOf(meta) - ROOKIE_TAPER.length;
  return n < 0 ? SUGAR_GAS_ROOKIE : n < SUGAR_GAS_TAPER.length ? SUGAR_GAS_TAPER[n] : SUGAR_GAS;
};
export const drainTaperOf = (meta, daily) => {
  const r = rookieFactor(meta, daily); if (r > 0) return r;
  const n = normRunsOf(meta) - ROOKIE_TAPER.length;
  return daily == null && n >= 0 && n < ROOKIE_DRAIN_TAPER.length ? ROOKIE_DRAIN_TAPER[n] : 1;
};
// the named rivals take longer to reach the egg on the first four runs (never in the daily). (Runs 2-4 a little more
// than before the event ramp: with fewer race events a rookie swims a little slower, and more claims got in before he
// even reached the egg: over 8 careers runs 2-12 went from 15 to 18 of 88 such losses; with this, 11)
// (retuned for the 3 counted taps/s duel: the first win lands on run 3 to 5 for 3 and 6 taps/s bots; run 1 at 1.12, as a
// lower rookie factor also means slower rookie sprinters)
export const ROOKIE_BOSS = [1.12, 1.15, 1.08, 1.03];
// and their finale sprinters drill faster by ROOKIE_SPRINT times that extra time (x1.6 on run 1): a photo finish.
// A sprinter that gets there after Kevin started drilling uses ROOKIE_SPRINT_LATE (x1.77 on run 1): with no race events
// and wider goo gates a rookie reaches the egg sooner (at 3.5 for everybody 8 in 96 fresh saves won run 1), and a
// bigger boost for the early ones too would finish them before Kevin even got there
export const ROOKIE_SPRINT = 3.2, ROOKIE_SPRINT_LATE = 4;
export const rookieBossT = (meta, daily) => { const n = normRunsOf(meta); return daily == null && n < ROOKIE_BOSS.length ? ROOKIE_BOSS[n] : 1; };
// every 'late' loss before you even reached the egg (and every 'So near!' energy loss) slows the named rivals by
// RACE_LOSS_T (up to RACE_LOSS_N of them), never in the daily.
// A win halves the count (end()), so the cushion fades instead of vanishing.
export const RACE_LOSS_T = 0.04, RACE_LOSS_N = 4;
export const raceLossT = (meta, daily) => (daily == null ? 1 + RACE_LOSS_T * clamp(Math.floor((meta && meta.raceLosses) || 0), 0, RACE_LOSS_N) : 1);
// a new generation eases in: the first run after a real win gives the named rivals FRESH_GEN more time, the second half
// that (meta.sinceWin; never in the daily, never at gen 0). Only after the first win of a streak: a second win in a
// row (meta.lastWinStreak 2+) brings no cushion. The win still brings a faster field, just not a wall.
export const FRESH_GEN = 0.04;
export const freshGenT = (meta, daily) => { const n = Math.floor((meta && meta.sinceWin) ?? 99); return daily == null && meta && (meta.gen || 0) > 0 && n < 2 && !((meta.lastWinStreak || 0) >= 2) ? 1 + FRESH_GEN * (n ? 0.5 : 1) : 1; };
export const freshGenActive = (meta) => freshGenT(meta, null) > 1;
// the losing-streak cushion: from the PEP_FROM-th normal loss in a row (meta.sinceWin, counted only on normal runs; a
// save that never won counts its normal runs) one step a loss, up to PEP_N steps (never in the daily). Each step: the
// named rivals take PEP_STEP longer to swim, Kevin drills PEP_DRILL faster, and a rival already drilling when he gets to
// the egg is held PEP_CAP lower. (Most late-career losses were egg duels and the egg-loss boost halves on every podium,
// so it never stacked: 6-7 losses in a row past gen 10. With this, over 8 careers at most 5.)
// (the count is meta.lossRun, not sinceWin: it only grows on a counted normal loss that was a real swim (zone SEA_I or
// later, or LOSS_RUN_DIST of the race), a shorter loss leaves it as it is, a quit never feeds it and a win zeroes it.
// Acid dives in the Launch Tube used to buy the whole cushion in a few 20 s swims)
export const PEP_FROM = 3, PEP_STEP = 0.04, PEP_N = 4, PEP_DRILL = 0.15, PEP_CAP = 0.08, LOSS_RUN_DIST = 0.35;
export const lossRunOf = (meta) => Math.min(Math.floor(ok(+(meta && meta.lossRun), 0)), normRunsOf(meta));
export const pepSteps = (meta, daily) => { const n = lossRunOf(meta); return daily == null && meta && n >= PEP_FROM ? Math.min(n - PEP_FROM + 1, PEP_N) : 0; };
export const pepT = (meta, daily) => 1 + PEP_STEP * pepSteps(meta, daily);
export const pepDrill = (meta, daily) => 1 + PEP_DRILL * pepSteps(meta, daily);
// all the catch-up cushions on the named rivals' time together (rookie, race losses, a fresh generation, the losing
// streak) never stack past BOSS_T_MAX
export const BOSS_T_MAX = 1.25;
export const bossTimeK = (meta, daily) => Math.min(BOSS_T_MAX, rookieBossT(meta, daily) * raceLossT(meta, daily) * freshGenT(meta, daily) * pepT(meta, daily));
// what the result screen can show about the next race: the drill bonus from egg losses in a row (%), and the field
export const EGG_BOOST = 0.08, EGG_BOOST_N = 3;
export const eggBoostOf = (meta) => 1 + EGG_BOOST * Math.min(EGG_BOOST_N, Math.max(0, Math.floor((meta && meta.eggLosses) || 0)));
export const eggBoostPct = (meta) => Math.round((eggBoostOf(meta) - 1) * 100);
// (the hazard steps are the race's own: max(the generation step, the career step), so the result screen reads the real fruit)
export const fieldInfo = (meta) => {
  const g = (meta && meta.gen) || 0, hz = Math.max(hzGenOf(g), hzCareer(meta));
  return { speedPct: Math.round((genSpeed(g) - 1) * 1000) / 10, fruitMul: Math.round(fruitMulOf(fruitStep(g, hz, false, normRunsOf(meta))) * 100) / 100, hz, gen: g };
};
// the long tail of the Rapids: a named rival more than BAND_D ahead of you there slows by 1 per BAND_W of lead,
// to x BAND_MIN at most (a claim while you are still in the Rapids would be a chase you could never win)
export const RANK_HOLD = 0.6, RANK_BLEND = 1;
// the very first swim holds you at 1,000,000 until your first real input (a steer ROOKIE_HOLD_DX world px from the spawn,
// or a dash; ROOKIE_HOLD_CAP s at most), then blends to the real place in ROOKIE_SURGE_T s and emits firstSurge {gained}
// once: the first jackpot is earned. And on the first PARK_RUNS normal swims a named rival that reaches the egg before
// Kevin parks at DRILL_ARRIVED_CAP of its drill until he starts drilling: the first swims always end in a duel
export const FIRST_SWIM_REFILL = 30;
export const ROOKIE_HOLD_DX = 20, ROOKIE_HOLD_CAP = 3, ROOKIE_SURGE_T = 0.6, PARK_RUNS = 2;
// SWIM 1's 'NOPE!' MOMENT (the first save's first swim only, never the daily): one dozing Big Macro (e.setpiece) at SET_Y in the
// Launch Tube. With Kevin SET_WAKE_D below it wakes (a SET_TELL s tell: it shuffles over to his side of the tube), then
// drifts SET_VX px/s back and forth across his lane, always leaving SET_GAP px or more open on the far side. Emits setpiece
// {phase: 'wake' | 'dodged' | 'hit', x, y}. It is placed by these numbers alone: nothing is drawn from any rng
export const SET_Y = 5200, SET_WAKE_D = 700, SET_TELL = 0.8, SET_VX = 60, SET_GAP = 150, SET_TELL_VX = 200;
export const BAND_D = 3000, BAND_W = 30000, BAND_MIN = 0.75;
// the thumb bot's defaults (Race opts.human)
export const HUMAN_THUMB = { lag: 0.18, look: 280, aimSd: 14, dashEvery: 2.0 };
// the fixed first deal of a brand-new save: Turbo Tail, Whiplash (together: Afterburner) and Antacid Coat
export const FIRST_DEAL = ['turbo', 'whip', 'antacid'];
// every race deals REROLL_FREE card reroll on the house, plus one a level of Dad meditates
export const REROLL_FREE = 1;
export const WIN_BONUS = 175;   // (175, was 200: the photo finish and the bounties pay more, a career still takes 28+ runs)
// the first win is a jackpot: FIRST_WIN_DNA on top, once a save (M.wins 0, never a practice win): breakdown.first
export const FIRST_WIN_DNA = 300;
// a tough swim never leaves the shop empty: a counted normal run (no quit, no autopilot, no daily) pays at least
// TOUGH_FLOOR x the cheapest habit level still open (breakdown.tough tops it up)
// (only for a real swim: nothing under TOUGH_FROM of the race, then a straight line to the full floor at TOUGH_FULL)
export const TOUGH_FLOOR = 0.4, TOUGH_FROM = 0.25, TOUGH_FULL = 0.5;
export const toughShare = (dist) => clamp(((+dist || 0) / RACE_LEN - TOUGH_FROM) / (TOUGH_FULL - TOUGH_FROM), 0, 1);
export const cheapestOpenHabitCost = (meta) => { let c = Infinity; if (meta) for (const id of HABIT_ORDER) { const l = (meta.habits && meta.habits[id]) || 0; if (l < maxLv(meta, id)) c = Math.min(c, habitCost(id, l)); } return c; };
// the pay for your place: 70 * (log10(1e6 / rank) / 6)^1.5, so the last places pay little and the top pays 70
export const placePay = (rank) => 70 * Math.pow(clamp(Math.log10(TOTAL_SWIMMERS / Math.max(1, rank)) / 6, 0, 1), 1.5);
// the photo-finish pay for a duel lost with Kevin's drill at fraction f (0..1): PHOTO_MIN, climbing on a smooth S from
// PHOTO_FROM to PHOTO_MIN + PHOTO_SPAN at a full drill; second place pays PODIUM_2 + PODIUM_2_DRILL x f
export const PHOTO_MIN = 10, PHOTO_SPAN = 50, PHOTO_FROM = 0.6, PODIUM_2 = 18, PODIUM_2_DRILL = 12;
export const photoPay = (f) => Math.round(PHOTO_MIN + PHOTO_SPAN * smooth(clamp(((+f || 0) - PHOTO_FROM) / (1 - PHOTO_FROM), 0, 1)));
// the rivals' signature moves at the egg (see Race.stepMove)
export const MAX_ARRIVED = 2;
// the egg drill: DRILL_BASE a second on its own, DRILL_TAP a tap (up to DRILL_TAPS_MAX taps a second: the duel is
// won by the race you swam, not by finger speed), plus a head start from the race (headStart, up to DRILL_HEAD_MAX). The rivals already drilling when you arrive are held: the first to arrive at
// DRILL_ARRIVED_CAP of its need, the next ones at DRILL_ARRIVED_CAP2, so a duel is a fight, not a 2-second blowout.
// (taps past the bucket carry to the next step, up to DRILL_CARRY: a hit-stop never eats a tap. The counter tallies
// (Brock's block, Tiffany's citation, Chad's hair check) count every raw tap on their side: the bucket only paces the drill)
export const DRILL_CARRY = 2;
// (FRENZY at the egg drills DRILL_FRENZY a second faster)
export const DRILL_FRENZY = 0.3;
// (round 1: DRILL_HEAD_MAX 3.4 (2.9) with HEAD_KNEE_W 2.5 (1.5): with HEAD_TIER 0.38 nearly every career duel started at
// the 2.9 cap, so a great race and a fair one met the same duel; DRILL_ARRIVED_CAP 0.86 / CAP2 0.78 (0.80 / 0.72) with
// the head offset, so a weak race meets a rival held near the DRILL_ARRIVED_HI clamp)
export const DRILL_BASE = 0.5, DRILL_TAP = 0.06, DRILL_TAPS_MAX = 3, DRILL_HEAD_MAX = 3.4, DRILL_ARRIVED_CAP = 0.95, DRILL_ARRIVED_CAP2 = 0.87;
// the hold rewards the race Kevin swam: DRILL_ARRIVED_HEAD less per second of duel head start (duelHead), kept inside
// DRILL_ARRIVED_LO..DRILL_ARRIVED_HI (the same offset on the first and the later arrivals)
// (systems round: CAP 0.95 / CAP2 0.87 (0.86 / 0.78), HI 0.92 (0.84): the moves now come early in the duel and hand a slow
// Kevin time (a dive, a hair check, a citation that cannot get in), and Kevin waiting at the door goes first, so the rivals
// already drilling are held a little nearer the door)
export const DRILL_ARRIVED_HEAD = 0.06, DRILL_ARRIVED_LO = 0.62, DRILL_ARRIVED_HI = 0.92;
export const arrivedCap = (base, head) => clamp(base - DRILL_ARRIVED_HEAD * Math.max(0, +head || 0), DRILL_ARRIVED_LO, DRILL_ARRIVED_HI);
// LAST GASP: while Kevin's drill fraction is more than LAST_GASP behind the leading rival's, that rival drills at
// x LAST_GASP_K: a lost duel is lost in the last quarter, never in a walkover. Only a rival that was already drilling
// when Kevin arrived (the walkovers came from those): one that arrives with or after him needs exactly his drill from 0
// (and slowing it turned Chad's hair check into a sure loss for Chad)
// (LAST_GASP_K 0.7, was 0.6: the early moves already hand a slow Kevin time, so the gasp eases off a little less)
export const LAST_GASP = 0.25, LAST_GASP_K = 0.7;
// the LAST GASP fades with the career: x LAST_GASP_K to normal run 10, then a straight line to LAST_GASP_LATE at run 25
// (a veteran's lost duel is lost for real), held at LAST_GASP_K while the losing-streak cushion is on (pepSteps)
export const LAST_GASP_LATE = 1, LAST_GASP_FROM = 7, LAST_GASP_RUNS = 12;
// (and gated on wins: the fade goes at most LAST_GASP_WIN_K runs a win, so a save that never won keeps the full LAST GASP)
export const LAST_GASP_WIN_K = 3;
export const lastGaspK = (meta, daily) => (pepSteps(meta, daily) > 0 ? LAST_GASP_K : lerp(LAST_GASP_K, LAST_GASP_LATE, clamp(Math.min(normRunsOf(meta) - LAST_GASP_FROM, LAST_GASP_WIN_K * Math.floor(+(meta && meta.wins) || 0)), 0, LAST_GASP_RUNS) / LAST_GASP_RUNS));
// THE EARLY-DEATH RESCUE: meta.earlyRun counts the counted normal losses in a row that ended before the Great Womb Sea
// after EARLY_MIN_T s or more of swimming (a win, or a loss that reached the sea, zeroes it; a shorter dive leaves it).
// From EARLY_FROM such losses one rescue step a loss, up to EARLY_N (never in the daily). Each step: one hazard step
// less, +RESCUE_SUGAR GAS a fruit, acid x RESCUE_ACID and one extra spare bite. The tube only, never the duel.
// race.rescuePct (0, 50 or 100) tells the UI
export const EARLY_MIN_T = 40, EARLY_FROM = 2, EARLY_N = 2, RESCUE_SUGAR = 0.4, RESCUE_ACID = 0.9;
export const rescueSteps = (meta, daily) => (daily == null && meta ? clamp(Math.floor(ok(+meta.earlyRun, 0)) - EARLY_FROM + 1, 0, EARLY_N) : 0);
// a counted tap shoves every arrived named rival back DRILL_SHOVE (bent by its move: see shoveRival)
export const DRILL_SHOVE = 0.05;
// the rivals that were already drilling when Kevin arrived pull their move by duel time (s after the drill starts), not
// by their drill fraction (they would all fire at once): Steve's first 'sorry' tell from PRE_MOVE_AT.sorry s on
// (0.4-0.8 s (0.8-2.2): a duel lasts about 2.5 s, and moves due at 1.6 and 2.2 s almost never came before Kevin got in)
export const PRE_MOVE_AT = { sorry: 0.4, byTheBook: 0.5, maxRep: 0.6, stuntDive: 0.7, hairCheck: 0.8 };
// a rival that arrives while Kevin already drills pulls its move LATE_MOVE_AT s after it gets there (not by its drill
// fraction: a late arrival never got to 55% before the duel was over)
export const LATE_MOVE_AT = 0.35;
// the DOOR HOLD: while a named rival's tell or move window is open (Brock's wind-up, Tiffany's citation from its tell,
// Gunther out on his dive, Chad's fuss; never Steve's sorry, which comes every shove) Kevin's drill stops at DOOR_HOLD of
// his need, so the move resolves ('hit' or 'countered') before he gets in (the drill he does meanwhile waits in d.held and
// lands as the window closes: the door opens and he slips straight in)
export const DOOR_HOLD = 0.97;
// no two tells at the egg start within TELL_GAP s of each other: a second one waits its turn (and its hit waits with it)
export const TELL_GAP = 1.0;
// DASH POP: a Big Macro touched at any moment of a dash (while p.dashT > 0: 0.55 s, 0.77 s with Afterburner, 0.85 s
// for a Jetstream dash) pops (a 'pop' link, as a Spiky pop) for DASH_POP_COST energy instead of the normal hit: every
// build can pop, so every trick is open to it. A dash pop also refills the chain timer to full (a pop is the bridge
// into the next link of a trick). DASH_POP_T is kept for callers: the shortest window a plain dash gives, rounded
// (the rule itself is the whole dash, there is no separate window any more)
export const DASH_POP_T = 0.5, DASH_POP_COST = 5;
// a stunned Lunger (lunged 2, still cooling) that Kevin touches without nitro is no mouth: the touch bonks it away
// (STUN_BONK_PUSH u/s), Kevin is swatted aside for STUN_BONK_SWAT s, it stays stunned STUN_BONK_COOL s at least,
// and the first bonk of each cell is a 'bonk' link
export const STUN_BONK_PUSH = 220, STUN_BONK_SWAT = 0.15, STUN_BONK_COOL = 0.6;
// pulse acid breathes between PULSE_MIN and PULSE_MAX of its r0 on a smooth cosine (no 0.14 s jump): the art's dashed
// ring at r0 * PULSE_MAX is the true maximum. A rim that swells over Kevin (he did not swim in, it grew onto him: e.swellT)
// never burns for SWELL_SPARE s, nor while he stays in the breathing band outside its PULSE_MIN core; untouched it pays a
// near miss instead
export const PULSE_MIN = 0.8, PULSE_MAX = 1.05, SWELL_SPARE = 0.12;
export const pulseR = (r0, phase) => r0 * (PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 - 0.5 * Math.cos(phase * TAU)));
// Big Macros in a narrow tube are smaller and slower (x kW = h / WBC_NARROW_H, 0.72..1); under WBC_TWIN_NARROW half
// width the twins come half as often and 180 apart (120 in open water)
export const WBC_NARROW_H = 170, WBC_TWIN_NARROW = 140;
// wall hairs: the tell (tremble + swat) lasts CILIA_TELL s and the swat CILIA_SWAT s (each hair carries them as e.tellT,
// e.swatT for the renderer); a pair's two reaches cover at most CILIA_PAIR_MAX of the tube width
export const CILIA_TELL = 0.8, CILIA_SWAT = 0.35, CILIA_PAIR_MAX = 0.8;
export const wbcK = (h) => clamp(h / WBC_NARROW_H, 0.72, 1);
// (a rookie run keeps the head start under DRILL_HEAD_ROOKIE: the first races are about seeing the egg, not winning it)
export const DRILL_HEAD_ROOKIE = 1.3;
// and the cap climbs back to DRILL_HEAD_MAX on a ramp, not a step: from DRILL_HEAD_ROOKIE at normal run HEAD_RAMP_FROM to
// the full cap HEAD_RAMP_RUNS runs later (the end of the rookie runs was the real cliff: the first runs after a first win
// came with a head start twice as big, and the 'harder' generation 1 won more than the rookie runs did). Never the daily
export const HEAD_RAMP_FROM = 4, HEAD_RAMP_RUNS = 5;
// before the first baby the duel takes at most HEAD_CAP_GEN0 (64% of the gen 0 drill): a gen 0 duel is always a fight,
// so a half-habit save that never won is no sure thing at the egg (with the full 3.4 it won all 24 bot runs), and a
// maxed gen 0 save still wins 85%+ (2.6 put it at 40 of 48, 2.48 at 38)
export const HEAD_CAP_GEN0 = 2.56;
export const headCapOf = (meta, daily) => (daily != null ? DRILL_HEAD_MAX : Math.min(Math.floor((meta && meta.gen) || 0) >= 1 ? DRILL_HEAD_MAX : HEAD_CAP_GEN0, lerp(DRILL_HEAD_ROOKIE, DRILL_HEAD_MAX, clamp((normRunsOf(meta) - HEAD_RAMP_FROM) / HEAD_RAMP_RUNS, 0, 1))));
// Kevin's own drill grows PLAYER_NEED_GEN a generation (to gen 8); the rivals' training carries the rest of the climb
// (0.09, was 0.06: the duel the combo top end feeds (GOD MODE was at 8 then) needs a little more drilling to stay a duel)
export const PLAYER_NEED_GEN = 0.15;
// the duel's soft knee: the head start counts in full up to HEAD_DUEL_MAX, then at HEAD_KNEE_K for HEAD_KNEE_W more, so it
// tops out at 2.0 + 1.5 x 0.6 = 2.9 = DRILL_HEAD_MAX (duelHead; the knee came down from 2.1 when GOD MODE moved to 8: the
// bigger chains and tiers would have made a built run a walkover). Mastery still counts at the egg, a maxed run is no
// walkover. What the duel does not take is paid as HEAD_BONUS_DNA DNA a whole 0.1 s (headBonus {dna, sec} at the drill)
// (balance pass: an S, not a knee: HEAD_KNEE_K 0.5 (0.75) for HEAD_KNEE_W 1.0 (2.5), then HEAD_KNEE2_K 1.5 for HEAD_KNEE2_W
// 0.6, so the duel takes 2.5 from a fair 3.0 race and the full 3.4 from a 3.6 one. A fair race gets a fair duel, a great
// race pulls clear: over career runs 6+ the top third of head starts won only 20 points more than the bottom third on
// the plain knee, 33-40 on this curve over the tunings near it)
export const HEAD_DUEL_MAX = 2.0, HEAD_KNEE_K = 0.5, HEAD_KNEE_W = 1.0, HEAD_KNEE2_K = 1.5, HEAD_KNEE2_W = 0.6, HEAD_BONUS_DNA = 10;
export const duelHead = (total) => { const t = Math.max(0, +total || 0); return Math.min(t, HEAD_DUEL_MAX) + HEAD_KNEE_K * clamp(t - HEAD_DUEL_MAX, 0, HEAD_KNEE_W) + HEAD_KNEE2_K * clamp(t - HEAD_DUEL_MAX - HEAD_KNEE_W, 0, HEAD_KNEE2_W); };
// the head start the race pays into the duel: HEAD_E x the tank left, HEAD_TIER a best FRENZY tier, HEAD_COMBO a link of
// the best chain (to HEAD_COMBO_CAP), HEAD_BOSS a named rival passed on the way (p.bossPasses, up to HEAD_BOSS_CAP),
// HEAD_HIT a hit or bite taken (p.hits: goo bonks, shield, Wingman and rookie hits, the spare bite; down to HEAD_HIT_CAP)
// and HEAD_LEAD a whole second Kevin reaches the egg ahead of the first egg-side named rival (p.leadSec, up to HEAD_LEAD_CAP)
// (the tank term reads absolute GAS now: HEAD_E 0.3 (0.45) a 100 GAS, up to HEAD_E_CAP, so a 150 tank brings what a full
// tank of any size brought before)
export const HEAD_E_CAP = 160;
export const HEAD_E = 0.3, HEAD_TIER = 0.38, HEAD_COMBO = 0.015, HEAD_COMBO_CAP = 100, HEAD_BOSS = 0.3, HEAD_BOSS_CAP = 0.6;
export const HEAD_HIT = -0.18, HEAD_HIT_CAP = -0.9, HEAD_LEAD = 0.15, HEAD_LEAD_CAP = 0.6;
// the named rivals train too: they drill faster as your career goes on (the share of RIVAL_TRAIN_RUNS normal runs
// played), x1.38 at gen 0, x1.58 / x1.70 / x1.93 at gens 1 / 2 / 4, x1.94 at gen 12 and x1.97 from gen 20 (RIVAL_TRAIN, straight lines
// between those generations: one ramp that never goes down, so no stretch of a career ever gets easier). A new player meets
// them at x1. (retuned for the phone-tapping bots and the race-fed duel (HEAD_* above, duelHead to 3.0): a maxed 6-taps/s
// bot wins about 76% over gens 4 / 12 / 20, a phone-tapping greedy career about 45% around run 20, and over career runs 6+
// the top third of head starts wins about 85% against 45% for the bottom third: the race you swam decides the duel.
// Mostly the training decides the rivals who arrive while Kevin drills: one already drilling needs the chase scaled by
// its own rate, so its training barely moves the duel)
// (habitShare is kept for the shop and the result screen; it no longer feeds the rivals)
export const habitShare = (meta) => { let n = 0, t = 0; for (const id of HABIT_ORDER) { if (id === 'gps') continue; t += HABITS[id].max; n += Math.min(HABITS[id].max, (meta && meta.habits && meta.habits[id]) || 0); } return t ? n / t : 0; };
// (the first win no longer steps the training from x1.30 to x1.70 at once: gen 1 x1.45, gen 2 x1.58, gen 4 x1.70, so the
// gen 0 -> 1 step is one ramp among several, not five at once)
// (gen 0 was 0.30: a half-habit veteran at gen 0 won all 24 bot runs, the duel had no teeth before the first baby. The
// planned cut of gens 4 / 12 / 20 to 0.64 / 0.72 / 0.80 put maxed habits at 81-83% and is not taken: the swim's extra
// losses (WBC_HZ, SUGAR_GAS) already move part of the loss budget out of the duel)
// (round 1: the race-fed duel (HEAD_TIER 0.38, the head-dependent hold, DRILL_HEAD_MAX 3.4) and the finale that no
// longer puts a passed rival back in front made the duel easy, so gens 1-20 train harder: 0.53 / 0.64 / 0.93 / 0.94 /
// 0.97 (were 0.45 / 0.58 / 0.70 / 0.80 / 0.88); gen 0 0.38 with RIVAL_TRAIN_POW 0.6 keeps the first win on runs 3-5)
// (balance pass: gens 1 / 2 0.58 / 0.70 (0.53 / 0.64): the S-curve duel made the first babies' duels easier)
// (systems round: 0.38 / 0.7 / 0.86 / 1.12 / 1.15 / 1.18 (0.38 / 0.58 / 0.70 / 0.93 / 0.94 / 0.97): the egg duel is a fight
// now (moves on the clock, the door hold with Kevin first through it), and a maxed save at the door wins more, so the late
// rivals train harder to keep the win-rate bands)
export const RIVAL_TRAIN = [[0, 0.38], [1, 0.7], [2, 0.86], [4, 1.12], [12, 1.15], [20, 1.18]];
export const rivalTrain = (gen) => {
  const g = Math.max(0, Math.floor(gen || 0)), T = RIVAL_TRAIN;
  for (let i = 1; i < T.length; i++) if (g <= T[i][0]) return lerp(T[i - 1][1], T[i][1], (g - T[i - 1][0]) / (T[i][0] - T[i - 1][0]));
  return T[T.length - 1][1];
};
// (driven by career progress, normal runs / RIVAL_TRAIN_RUNS, not by purchases: buying a habit never feeds the rivals)
export const RIVAL_TRAIN_RUNS = 14;
// the share of the training a save meets: one smooth ramp over the first RIVAL_TRAIN_RUNS normal runs, front-loaded
// ((runs / RIVAL_TRAIN_RUNS) ^ RIVAL_TRAIN_POW: about 20% after the first run, 54% by run 5, 71% by run 8), so the early
// generations are no cakewalk before a wall
export const RIVAL_TRAIN_POW = 0.6;
export const rivalTrainShare = (meta) => Math.pow(clamp(normRunsOf(meta) / RIVAL_TRAIN_RUNS, 0, 1), RIVAL_TRAIN_POW);
export const rivalDrillK = (meta) => 1 + rivalTrainShare(meta) * rivalTrain(meta && meta.gen);
// the rivals' drill in a race: the training, eased by the fresh-generation cushion too (freshGenT: x1 / (1 + FRESH_GEN) on
// the first run after a first win, half that on the second), so a first win is no cliff at the egg either
export const rivalDrillRace = (meta, daily) => rivalDrillK(meta) / freshGenT(meta, daily);
// the finale rubber band, by Kevin's lead in seconds over the soonest egg-side named rival: under FIN_CLOSE the classic
// A 700 ahead / B 450 behind; up to FIN_FAR, A sits 300 ahead at your speed; past it only B comes, 450 behind
// (FIN_B2_BEHIND 90 (250) and the band-2 sprinter that gets in while Kevin drills needs his drill less FIN_B2_HEAD_K of his
// duel head (FIN_LATE_CUT 0.9 flat before): a big lead is a close duel, decided in the last second, not a walkover)
export const FIN_CLOSE = 4, FIN_FAR = 10, FIN_LATE_CUT = 0.9, FIN_B2_BEHIND = 90, FIN_B2_HEAD_K = 0.85;
// a claim at the egg is a chase: the claimer needs the seconds you still need to get there, at CHASE_K of your speed
// (round 1: CHASE_K 0.62 (0.75), CHASE_CAP 22 (16): a claim made while Kevin was 20+ s off finished before he got there
// on 13 of 44 early runs)
export const CHASE_K = 0.62, CHASE_CAP = 22, CHASE_EARLY = 1;   // (the chase is capped at CHASE_CAP + CHASE_EARLY s at gen 0, easing to CHASE_CAP by gen 8)
export const MOVE_TELL = 0.8, MAXREP_EVERY = 3.5, MAXREP_HIT = 0.28, BOOK_T = 2, STUNT_OUT = 1.2, STUNT_HIT = 0.18, STUNT_CAP = 0.25, HAIR_T = 1.2;     // DNA for a win (not an autopilot one), before the generation multiplier
// the egg duel by side: each arrived named rival drills on its own side of the egg (a.eggSide: -1 the first to arrive,
// +1 the second). With input.tapSide set (main.js, per counted tap) a tell is countered only by taps on THAT side:
// MOVE_COUNTER_TAPS of them inside the window. Taps on the other side still drill and shove.
// Tiffany's citation: at BOOK_CITE_AT of her need a MOVE_TELL tell, then BOOK_CITE_T s drilling at x BOOK_CITE_K;
// BOOK_CITE_TAPS same-side taps in it void what she gained and stop her for BOOK_CITE_STOP s.
// (HAIR_T 1.2 (1.6), BOOK_CITE_TAPS 5 (4): the moves come early in the duel now, and Chad's hair check was a 1.6 s gift)
export const MOVE_COUNTER_TAPS = 3, BOOK_CITE_AT = 0.6, BOOK_CITE_T = 1.0, BOOK_CITE_K = 2, BOOK_CITE_TAPS = 5, BOOK_CITE_STOP = 1.2;
// the records ledger's ids (over.records: {id, prev, now}, in this order)
export const RECORD_IDS = ['margin', 'combo', 'winT', 'dna', 'winStreak', 'sweep', 'streak'];
export const GOAL_IDS = ['beatRival', 'reachEgg', 'reachZone', 'combo', 'winEgg', 'trick', 'margin', 'sweep'];
// a comboBreak against the CASH pot (main.js potBreak): which line it shows. pot: what cashing in would have paid, seen:
// the save already met its first smash (S.potSeen), demo: the title-screen demo race. null: nothing to smash; 'first':
// the one-time explainer (BREAK_POT_FIRST); 'joke': a line from the smash joke pool
export const potBreak = (pot, seen, demo = false) => (!(pot > 0) ? null : !seen && !demo ? 'first' : 'joke');

export function newMeta() {
  return { v: 1, ver: META_VER, dna: 0, habits: {}, gen: 0, best: TOTAL_SWIMMERS, runs: 0, wins: 0, babies: [], lastSeen: 0, bank: 0, introSeen: false, muted: false, bestCombo: 0, autopilot: false,
    dailyDay: -1, dailyBest: TOTAL_SWIMMERS, dailyRuns: 0, synergiesSeen: [], dailyStreak: 0, dailyLastDay: -1, bestRivals: 0, rivals: {},
    eggLosses: 0, bestStreak: 0, goal: null, quits: 0, raceLosses: 0, dailyLastAt: 0, sinceWin: 99, dailyMedal: 0, dailyGolds: 0,
    normRuns: -1, winStreak: 0, lastWinStreak: 0, tricks: {}, openRun: null, dailyQuitDay: -1, streakFreeze: 0,
    // lastFoe: the named rival (index) who beat Kevin at the egg last (the rematch); lastGoalId: the id of the last goal
    // set (a winner never gets the same one twice in a row); bestMargin: the biggest winning gap in seconds
    lastFoe: -1, lastGoalId: '', bestMargin: 0,
    // the RECORDS LEDGER (over.records): the quickest real win (this.t s, 0 none), the best pay of one run, the sweeps (wins
    // with every named rival beaten) and the longest win streak; lossRun: the losing-streak cushion's count (pepSteps)
    bestWinT: 0, bestDnaRun: 0, sweeps: 0, bestWinStreak: 0, lossRun: 0,
    // earlyRun: counted normal losses in a row that ended before the Great Womb Sea after EARLY_MIN_T s of swimming (the
    // early-death rescue, rescueSteps); mutsSeen: every card id ever taken (the Mashup Book)
    earlyRun: 0, mutsSeen: [] };
}
// the sat-nav (autopilot) only unlocks from generation 2: earn your first baby by hand
export const maxLv = (meta, id) => (id === 'gps' && ((meta && meta.gen) || 0) < 2 ? 0 : HABITS[id].max + (GRANDAD.includes(id) ? grandadLevels((meta && meta.gen) || 0) : 0));
function cleanGoal(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g) || !GOAL_IDS.includes(g.id)) return null;
  const num = (v) => (isFinite(+v) ? +v : NaN);
  const target = num(g.target), dna = num(g.dna), k = num(g.k);
  if (!(dna >= 0)) return null;
  const left = num(g.left);
  const out = { id: g.id, target: isFinite(target) ? Math.max(0, Math.floor(target)) : 0, dna: Math.round(dna), k: -1, left: isFinite(left) ? clamp(Math.floor(left), 1, GOAL_SWIMS) : GOAL_SWIMS };
  if (g.id === 'beatRival') { if (!(k >= 0 && k < RIVALS.length)) return null; out.k = Math.floor(k); }
  if (g.id === 'trick') { if (!TRICKS.some((T) => T.id === g.trick)) return null; out.trick = g.trick; }
  if (g.id === 'margin') { const n = num(g.n); if (!(n > 0)) return null; out.n = Math.round(n * 10) / 10; }
  return out;
}
export function loadMeta(o) {
  const m = newMeta();
  if (!o || typeof o !== 'object') return m;
  for (const k of Object.keys(m)) if (k in o && typeof o[k] === typeof m[k]) m[k] = o[k];
  if (!Array.isArray(m.babies)) m.babies = [];
  if (!Array.isArray(m.synergiesSeen)) m.synergiesSeen = [];
  for (const k of ['gen', 'runs', 'wins', 'bestCombo', 'dailyRuns', 'dailyStreak', 'bestRivals', 'bank', 'eggLosses', 'bestStreak', 'quits', 'raceLosses', 'sinceWin', 'dailyMedal', 'dailyGolds', 'winStreak', 'lastWinStreak', 'bestWinT', 'bestDnaRun', 'sweeps', 'bestWinStreak', 'lossRun', 'earlyRun']) if (!isFinite(m[k]) || m[k] < 0) m[k] = 0;
  m.earlyRun = Math.min(99, Math.floor(m.earlyRun));
  m.mutsSeen = Array.isArray(o.mutsSeen) ? [...new Set(o.mutsSeen.filter((id) => typeof id === 'string' && MUTATIONS[id]))] : [];
  // normal runs (the rookie grace): an old save does not know how many of its runs were dailies, so all of them count
  m.runs = Math.floor(m.runs); m.winStreak = Math.floor(m.winStreak); m.lastWinStreak = Math.floor(m.lastWinStreak);
  m.sweeps = Math.floor(m.sweeps); m.lossRun = Math.min(99, Math.floor(m.lossRun)); m.bestWinStreak = Math.max(Math.floor(m.bestWinStreak), m.winStreak);
  m.normRuns = isFinite(+o.normRuns) && +o.normRuns >= 0 ? Math.min(Math.floor(+o.normRuns), m.runs) : m.runs;
  m.dailyMedal = clamp(Math.floor(m.dailyMedal), 0, 3); m.dailyGolds = Math.floor(m.dailyGolds);
  m.streakFreeze = clamp(Math.floor(+m.streakFreeze) || 0, 0, STREAK_FREEZE_MAX);
  if (!isFinite(m.dailyLastAt) || m.dailyLastAt < 0) m.dailyLastAt = 0;
  m.gen = Math.floor(m.gen); m.quits = Math.floor(m.quits); m.raceLosses = Math.min(Math.floor(m.raceLosses), 99); m.eggLosses = Math.min(Math.floor(m.eggLosses), 99); m.bestStreak = Math.max(Math.floor(m.bestStreak), m.dailyStreak || 0);
  // save versions: before ver 2 the hero counted as Gen 0, so every saved baby moves up one
  const oldVer = isFinite(+o.ver) ? +o.ver : 1;
  m.babies = m.babies.filter((b) => b && typeof b === 'object');
  if (oldVer < 2) for (const b of m.babies) b.gen = (isFinite(+b.gen) ? +b.gen : 0) + 1;
  m.ver = META_VER;
  m.goal = cleanGoal(o.goal);
  m.lastFoe = Number.isInteger(+o.lastFoe) && +o.lastFoe >= 0 && +o.lastFoe < RIVALS.length ? +o.lastFoe : -1;
  if (!GOAL_IDS.includes(m.lastGoalId)) m.lastGoalId = '';
  if (!(isFinite(m.bestMargin) && m.bestMargin > 0)) m.bestMargin = 0;
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
  // a swim still open when the page died (openRun): kept only as a plain object with finite y and at and an integer daily
  if (!Number.isInteger(m.dailyQuitDay)) m.dailyQuitDay = -1;
  const orn = o.openRun;
  m.openRun = orn && typeof orn === 'object' && !Array.isArray(orn) && Number.isFinite(+orn.y) && Number.isFinite(+orn.at) && Number.isInteger(orn.daily)
    ? { daily: orn.daily, y: +orn.y, at: +orn.at, paused: orn.paused === true, pausedAt: Number.isFinite(+orn.pausedAt) && +orn.pausedAt > 0 ? +orn.pausedAt : 0,
      e: orn.e != null && Number.isFinite(+orn.e) ? clamp(+orn.e, 0, 1) : 1, rank: Number.isFinite(+orn.rank) && +orn.rank >= 1 ? Math.floor(+orn.rank) : 0 } : null;
  return m;
}
// ------------------------------------------------------------------ the open run (a kill or reload mid-swim is a quit)
// openRun(meta, race) as a swim starts, runProgress(meta, y) as it goes (main.js saves the meta), and settle() clears it.
// A save that loads with a record still open settles it with settleAbandoned: past the free-restart line (3000, the
// same rule as a quit) it counts as a run and a quit, and ends the win streak (and uses a daily attempt). It never
// touches the rival W-L record, raceLosses or eggLosses.
// (a paused swim is forgiven only if it was still a live one at the last note: the tank at FORGIVE_E of its size or more
// and Kevin not in the last FORGIVE_END of the way to the egg. Killing the app on a doomed swim is a quit)
export const ABANDON_Y = 3000, PAUSE_FORGIVE_MS = 10 * 60000, FORGIVE_E = 0.3, FORGIVE_END = 0.15;
export function openRun(meta, race) {
  if (!meta) return null;
  const d = race && Number.isInteger(race.daily) ? race.daily : -1;
  meta.openRun = { daily: d, y: 0, at: Date.now(), paused: false, pausedAt: 0, e: 1, rank: 0 };
  return meta.openRun;
}
// the swim was paused (true, at now ms) or resumed (false): a paused swim the OS discards is forgiven (settleAbandoned)
export function runPaused(meta, paused, now = Date.now()) {
  const o = meta && meta.openRun;
  if (!o) return;
  // (the first pause holds its clock: blur, visibilitychange, pagehide and peeks while it stays paused never reset it)
  if (paused && o.paused && o.pausedAt > 0) return;
  o.paused = !!paused; o.pausedAt = paused && Number.isFinite(now) ? now : 0;
}
// runProgress(meta, y, eShare, rank): y, and optionally the tank's share of its size (0..1) and the rank at this note
export function runProgress(meta, y, e, rank) {
  const o = meta && meta.openRun;
  if (!o) return;
  if (Number.isFinite(y)) o.y = Math.round(y);
  if (e != null && Number.isFinite(+e)) o.e = clamp(+e, 0, 1);
  if (rank != null && Number.isFinite(+rank) && +rank >= 1) o.rank = Math.floor(+rank);
}
export function settleAbandoned(meta, now = Date.now()) {
  const o = meta && meta.openRun;
  if (!o) return null;
  meta.openRun = null;
  if (!(o.y >= ABANDON_Y)) return { counted: false, daily: false };
  const daily = o.daily >= 0, today = daily && o.daily === localDay(now);
  // a swim paused for PAUSE_FORGIVE_MS or more when the page died was the OS tidying up, not a rage quit: it counts as a
  // run, never as a quit, and the win streak lives on
  const eShare = o.e != null && Number.isFinite(+o.e) ? +o.e : 1, live = eShare >= FORGIVE_E && o.y < (1 - FORGIVE_END) * (RACE_LEN - 70);
  const forgiven = live && o.paused === true && Number.isFinite(+o.pausedAt) && +o.pausedAt > 0 && now - o.pausedAt >= PAUSE_FORGIVE_MS;
  if (!daily) meta.normRuns = normRunsOf(meta) + 1;      // (before runs++: an unknown normRuns is all the runs so far)
  meta.runs = Math.floor(meta.runs || 0) + 1;
  if (!forgiven) meta.quits = Math.floor(meta.quits || 0) + 1;
  // (sinceWin counts normal runs only, as in settle(): an abandoned daily never feeds the losing-streak cushion)
  if (!forgiven) meta.winStreak = 0;
  if (!daily) meta.sinceWin = Math.min(99, Math.floor(meta.sinceWin || 0) + 1);
  if (today) {
    // (the first attempt of a new day: settle() would zero dailyRuns when it rolls the day over, so dailyQuitDay keeps it)
    if (meta.dailyDay === o.daily) meta.dailyRuns = Math.max(0, Math.floor(meta.dailyRuns || 0)) + 1;
    else { meta.dailyRuns = meta.dailyQuitDay === o.daily ? Math.max(0, Math.floor(meta.dailyRuns || 0)) + 1 : 1; meta.dailyQuitDay = o.daily; }
  }
  return forgiven ? { counted: true, daily: today, forgiven: true } : { counted: true, daily: today };
}
export const lv = (meta, id) => meta.habits[id] || 0;
// HABIT PERKS (content.js HABIT_PERKS): the perk ids habit id unlocks at level l
export const habitPerksAt = (id, l) => HABIT_PERKS.filter((x) => x.id === id && (l || 0) >= x.at).map((x) => x.perk);
// overflow: a fruit at a full tank adds PERK_OVERFLOW_T s to a running chain; berryBonus: it pays PERK_BERRY_DNA DNA;
// softLanding: the first energy hit of a zone (an acid puddle, the spare bite) costs PERK_SOFT of it; frenzyPlus: every
// FRENZY start lasts PERK_FRENZY_T s longer. A tank within FULL_TANK of its top is full (the drain ticks first).
export const PERK_OVERFLOW_T = 0.5, PERK_BERRY_DNA = 1, PERK_SOFT = 0.5, PERK_FRENZY_T = 1, FULL_TANK = 1;
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
    // (water names its cost in its own clause: a bigger tank is a thirstier tail, the grandad levels excepted)
    case 'water':    { const v = habitFx('water', l), sip = Math.round(WATER_DRAIN * Math.min(l, HABITS.water.max) * 100); return { label: '+' + v + ' GAS tank' + (sip > 0 ? ' (tail sips ' + sip + '% more)' : ''), value: v }; }
    case 'sleep':    { const v = 1 - Math.pow(1 - HABIT_FX.sleep, l); return { label: '-' + pct(v) + ' GAS drain', value: v }; }
    // (value stays in px; the label names the swimmers the head start skips, measured against level 0)
    case 'jeans':    { const v = HABIT_FX.jeans * l, y0 = 40, skipped = Math.max(0, rankAtY(y0) - rankAtY(y0 + v)); return { label: 'Start ~' + sig3(skipped) + ' swimmers ahead', value: v }; }
    case 'berries':  { const v = habitFx('berries', l); return { label: '+' + (Math.round(v * 1000) / 10) + '% GAS from fruit', value: v }; }
    case 'walk':     { const v = habitFx('walk', l); return { label: '+' + pct(v) + ' drafting power', value: v }; }
    case 'beatbox':  { const v = habitFx('beatbox', l); return { label: '+' + v.toFixed(2) + 's combo time', value: v }; }
    case 'hottub':   return { label: '+' + l + ' starting shield' + (l === 1 ? '' : 's'), value: l };
    case 'meditate': return { label: '+' + l + ' card reroll' + (l === 1 ? '' : 's'), value: l };
    case 'factory':  { const v = factoryRateAt(l, meta ? meta.gen : 0); return { label: v + ' DNA per hour', value: v }; }
    case 'gps':      return { label: l > 0 ? 'Autopilot unlocked' : 'No autopilot', value: l > 0 ? 1 : 0 };
    default:         return { label: '', value: 0 };
  }
}
// the place a swimmer at y holds at the gun (pure): the field the Race builds, counted the way Race.rank counts it. The
// opening pack (35% of N_AGENTS, spread evenly from 60 to 2500) shares what the far field (its log-scale weights) and the
// named rivals (BOSS_Y) leave of TOTAL_SWIMMERS; the far field starts past the Launch Tube, so it is all ahead
const PACK_Y0 = 60, PACK_Y1 = 2500;
const RANK_FIELD = (() => {
  const nBoss = RIVALS.length, nA = Math.round(N_AGENTS * 0.35), nB = N_AGENTS - nBoss - nA, BSUM = 100000;
  let sumB = 0; for (let j = 0; j < nB; j++) sumB += Math.max(1, Math.pow(BSUM, (j + 1) / nB) - Math.pow(BSUM, j / nB));
  return { nBoss, pack: TOTAL_SWIMMERS - 1 - nBoss - sumB };
})();
export function rankAtY(y) {
  y = Number.isFinite(+y) ? +y : 0;
  const F = RANK_FIELD, packAhead = F.pack * clamp((PACK_Y1 - y) / (PACK_Y1 - PACK_Y0), 0, 1);
  let boss = 0; for (let k = 0; k < F.nBoss; k++) if ((BOSS_Y[k] != null ? BOSS_Y[k] : 34000) > y) boss++;
  return Math.max(1, Math.round(1 + (TOTAL_SWIMMERS - 1 - F.nBoss - F.pack) + boss + packAhead));
}
// 3 significant figures: 950, 12.3k, 1.2M
export const sig3 = (n) => { n = Math.round(n); if (n < 1000) return String(n); const k = n / 1000; return k < 999.5 ? Number(k.toPrecision(3)) + 'k' : Number((n / 1e6).toPrecision(3)) + 'M'; };
// DNA per hour the factory makes while you are away, and how many hours it stores
export const FACTORY_STEP = 10, FACTORY_CAP_H = 12, FACTORY_CAP_STEP = 0.4;
export const factoryRateAt = (l, gen) => Math.round((40 + FACTORY_STEP * Math.max(0, l || 0)) * Math.pow(genFactor(gen), 0.75));
export const factoryRate = (meta) => factoryRateAt(lv(meta, 'factory'), meta.gen);
export const factoryCapHours = (meta) => Math.min(FACTORY_CAP_H, 8 + FACTORY_CAP_STEP * lv(meta, 'factory'));
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

// ------------------------------------------------------------------ 'one buy away': what the next level would have done
// Dad's Pick by what ended the swim (the same table main.js shows; core picks the cheapest open one for over.pickBridge)
export const DAD_PICKS = { energy: ['water', 'sleep', 'berries'], acid: ['water', 'sleep', 'berries'], wbc: ['hottub', 'sleep'], late: ['broccoli', 'beatbox'],
  bonk: ['walk', 'broccoli'], wrong: ['meditate', 'broccoli'], win: ['meditate', 'hottub', 'broccoli', 'beatbox'] };   // (never the sat-nav: a win is no reason to stop swimming)
// wouldHave(meta, over, habitId): what the next level of a habit would have brought on the swim that just ended (over.bridge,
// the swim's GAS ledger), against what was missing. Pure. {gain, unit, need, enough}, or null when it cannot say.
// An energy death ('GAS'): need = the distance still to go / the swim's average distance per GAS; gain = water's extra tank
// (less its thirstier tail over the GAS drained), sleep's 5% of the drain, or berries' extra fruit energy.
// A lost race ('s'): need = the gap in seconds; gain = broccoli's speed over the swim's real duration, or beatbox's longer
// combo timer as the extra FRENZY seconds it holds, each worth the FRENZY speed share.
const r2 = (v) => Math.round(v * 100) / 100;
export function wouldHave(meta, over, id) {
  const b = over && over.bridge;
  if (!b || !meta || !HABITS[id] || !meta.habits) return null;
  const l = lv(meta, id);
  if (l >= maxLv(meta, id)) return null;
  const d = (k) => habitFx(k, l + 1) - habitFx(k, l);
  let gain = null, unit = null, need = null;
  if (over.reason === 'energy') {
    unit = 'GAS'; need = b.gas > 0 && b.dist > 0 ? b.remain / (b.dist / b.gas) : Infinity;
    if (id === 'water') gain = d('water') - (l < HABITS.water.max ? b.drain * WATER_DRAIN / (1 + WATER_DRAIN * l) : 0);
    else if (id === 'sleep') gain = b.drain * HABIT_FX.sleep;
    else if (id === 'berries') gain = b.sugar * d('berries') / (1 + habitFx('berries', l));
  } else if (over.reason === 'late') {
    unit = 's'; need = Math.max(0, +over.gapSec || 0);
    if (id === 'broccoli') gain = b.swimT * (1 - (1 + broccoliFx(l)) / (1 + broccoliFx(l + 1)));
    else if (id === 'beatbox') { const fz = FRENZY_TIERS[0].speed; gain = b.fzT * d('beatbox') / Math.max(0.5, b.combo) * fz / (1 + fz); }
  }
  if (gain == null || !Number.isFinite(gain) || !Number.isFinite(need)) return null;
  gain = r2(Math.max(0, gain)); need = r2(need);
  return { gain, unit, need, enough: gain >= need };
}

// ------------------------------------------------------------------ the next-goal bounty ("one more run")
// Is goal g met by a run? r: {won, zone, combo, beaten: [first names], tricks: [trick ids landed], gapSec}
export function goalMet(g, r) {
  if (!g) return false;
  switch (g.id) {
    case 'beatRival': return !!RIVALS[g.k] && (r.won || (r.beaten || []).includes(firstName(RIVALS[g.k])));
    case 'reachEgg':  return r.won || (r.zone || 0) >= EGG_I;
    case 'reachZone': return r.won || (r.zone || 0) >= g.target;
    case 'combo':     return Math.floor(r.combo || 0) >= g.target;
    case 'winEgg':    return !!r.won;
    case 'trick':     return (r.tricks || []).includes(g.trick);
    case 'margin':    return !!r.won && (+r.gapSec || 0) >= (+g.n || 0);
    case 'sweep':     return (r.beaten || []).length >= RIVALS.length;
    default: return false;
  }
}
// Pick the next goal from the run that just ended, store it as meta.goal and return it.
// A run that got to THE EGG (or into the top 10) is told to beat the rival nearest ahead (over.gapBy):
// never 'reach the egg' again, which it just did. Reach the egg is the goal only after dying in the Rapids.
// (GOAL_FLOOR_SHARE 0.5 (0.2): a bounty that lasts up to GOAL_SWIMS swims is worth half a swim's pay)
export const GOAL_COMBO_BEST = 0.6, GOAL_FLOOR_X = 3, GOAL_FLOOR_SHARE = 0.5;
// a BOUNTY PERSISTS (settleGoal): it stays until it is met or GOAL_SWIMS counted swims fail it (g.left counts down), and
// is replaced early only by a rematch on meta.lastFoe or a goal worth GOAL_REPLACE_X its pay
export const GOAL_SWIMS = 3, GOAL_REPLACE_X = 1.5;
const rivalIndex = (n) => (n ? RIVALS.findIndex((R) => firstName(R) === n || R.name === n) : -1);
export function nextGoal(meta, over) {
  if (!meta || !over) return null;
  const gm = genFactor(meta.gen), lost = over.reason !== 'win', zone = over.zone || 0;
  const atEgg = lost && (zone >= EGG_I || (over.rank != null && over.rank <= 10));
  const ahead = atEgg ? rivalIndex(over.gapBy || over.by) : -1, k = rivalIndex(over.by);
  // a combo goal is measured from the Acid Lagoon on (the Launch Tube chain is a warm-up, capped at Z0_COMBO_MAX)
  const comboBase = Math.floor((over.comboLate != null ? over.comboLate : over.combo) || 0);
  // a combo goal always asks for a real chain: 5 more than this run's, and at least GOAL_COMBO_BEST of the save's best
  const comboT = Math.max(comboBase + 5, Math.round(GOAL_COMBO_BEST * Math.max(0, +meta.bestCombo || 0)));
  let g;
  if (!lost) g = winGoal(meta, over, comboT);
  else if (ahead >= 0) g = { id: 'beatRival', target: 0, dna: 60, k: ahead };
  else if (atEgg) g = { id: 'winEgg', target: 0, dna: 60, k: -1 };      // lost at the egg with nobody ahead: just win it
  else if (k >= 0) g = { id: 'beatRival', target: 0, dna: 30, k };
  else if (lost && zone === EGG_I - 1) g = { id: 'reachEgg', target: EGG_I, dna: 40, k: -1 };
  else if (over.reason !== 'win' && (over.zone || 0) + 2 <= EGG_I && !(meta.goal && meta.goal.id === 'reachZone')) g = { id: 'reachZone', target: (over.zone || 0) + 2, dna: 30, k: -1 };
  else g = { id: 'combo', target: comboT, dna: 25, k: -1 };
  // a rematch against the rival who beat Kevin at the egg last (meta.lastFoe) pays GOAL_FOE_X more: REVENGE
  if (g.id === 'beatRival' && g.k === meta.lastFoe) g.dna *= GOAL_FOE_X;
  // a bounty is worth chasing: at least min(GOAL_FLOOR_X x its base, GOAL_FLOOR_SHARE of what this run paid)
  const base = Math.round(g.dna * gm), runDna = Math.max(0, +over.dna || 0);
  g.dna = Math.max(base, Math.round(Math.min(GOAL_FLOOR_X * base, GOAL_FLOOR_SHARE * runDna)));
  g.left = GOAL_SWIMS;
  meta.goal = g; meta.lastGoalId = g.id;
  return g;
}
// the bounty after a counted swim (settle): the held one (not met: settle cleared a met one) loses a swim; it stays while
// it has swims left, unless the fresh pick is a rematch on meta.lastFoe or worth GOAL_REPLACE_X its pay
export function settleGoal(meta, over) {
  if (!meta || !over) return null;
  const held = meta.goal && typeof meta.goal === 'object' ? meta.goal : null, lastId = meta.lastGoalId;
  if (held) held.left = Math.floor(Number.isFinite(+held.left) ? +held.left : GOAL_SWIMS) - 1;
  const g = nextGoal(meta, over);
  if (held && held.left > 0 && !(g.id === 'beatRival' && g.k === meta.lastFoe) && !(g.dna >= GOAL_REPLACE_X * held.dna)) { meta.goal = held; meta.lastGoalId = lastId; return held; }
  return g;
}
// a winner's next goal: a weighted pick (WIN_GOALS) that is never the last goal's id while another one is eligible.
// 'trick': land a named trick the save has not found (else the race's featured one), 'margin': win by n s or more
// (GOAL_MARGIN_K x the save's best margin, kept inside GOAL_MARGIN_MIN..GOAL_MARGIN_MAX), 'sweep': beat
// all five named rivals, 'combo': the late chain goal. The pick is a hash of the save (no rng draw: the race is untouched)
export const WIN_GOALS = { trick: { w: 3, dna: 35 }, margin: { w: 2, dna: 45 }, sweep: { w: 2, dna: 50 }, combo: { w: 1, dna: 25 } };
export const GOAL_FOE_X = 1.5, GOAL_MARGIN_MIN = 3, GOAL_MARGIN_K = 1.25, GOAL_MARGIN_MAX = 15;
export const marginGoalSec = (meta) => clamp(Math.round(GOAL_MARGIN_K * Math.max(0, +(meta && meta.bestMargin) || 0) * 10) / 10, GOAL_MARGIN_MIN, GOAL_MARGIN_MAX);
// the trick a 'trick' goal names: an unfound one without a 'bump' step (picked by a hash of the save), else the
// race's featured trick, else null
export const goalTrickFor = (meta, over) => {
  const tk = meta && meta.tricks && typeof meta.tricks === 'object' ? meta.tricks : {};
  const fresh = TRICKS.filter((T) => !(tk[T.id] > 0) && !T.kinds.includes('bump'));
  if (fresh.length) return fresh[hashSeed(((meta && meta.runs) | 0) * 2654435761 ^ 0x51ED27) % fresh.length].id;
  return over && TRICKS.some((T) => T.id === over.featuredTrick) ? over.featuredTrick : null;
};
function winGoal(meta, over, comboT) {
  const trick = goalTrickFor(meta, over), n = marginGoalSec(meta);
  const ok = { trick: !!trick, margin: true, sweep: true, combo: true };
  let ids = Object.keys(WIN_GOALS).filter((id) => ok[id] && id !== meta.lastGoalId);
  if (!ids.length) ids = Object.keys(WIN_GOALS).filter((id) => ok[id]);
  const tot = ids.reduce((a, id) => a + WIN_GOALS[id].w, 0);
  let u = (hashSeed((((meta.runs | 0) * 31 + (meta.wins | 0)) * 7 + Math.round((+over.gapSec || 0) * 10)) | 0) / 4294967296) * tot, id = ids[ids.length - 1];
  for (const x of ids) { if (u < WIN_GOALS[x].w) { id = x; break; } u -= WIN_GOALS[x].w; }
  const g = { id, target: 0, dna: WIN_GOALS[id].dna, k: -1 };
  if (id === 'trick') g.trick = trick;
  else if (id === 'margin') g.n = n;
  else if (id === 'combo') g.target = comboT;
  return g;
}
// ------------------------------------------------------------------ the daily streak
// By the local calendar day (dailySeed): the streak lives on the next local day. The 36 h grace (two days later when
// under STREAK_GAP_MS have passed since the last counted daily) is only a cushion for DST and travel.
// (a save from before the local-day switch stored UTC days, at most one off: a last day of tomorrow counts as alive)
export const STREAK_GAP_MS = 36 * 3600000;
export function streakAlive(meta, now) {
  if (!meta || !isFinite(now)) return false;
  const day = localDay(now), last = meta.dailyLastDay, at = +meta.dailyLastAt || 0;
  if (!(last >= 0)) return false;
  if (last === day || last === day - 1 || last === day + 1) return true;
  return last === day - 2 && at > 0 && now - at < STREAK_GAP_MS;
}
// the bonus a counted daily pays on day n of a streak (climbing to day DAILY_BONUS_DAYS; every 7th day pays triple)
export const DAILY_BONUS_DAYS = 10;
export const dailyBonusFor = (streak, gen) => { const n = Math.max(1, Math.floor(streak || 1)); return Math.round(60 * Math.min(n, DAILY_BONUS_DAYS) * genFactor(gen)) * (n % 7 === 0 ? 3 : 1); };
// STREAK FREEZE: meta.streakFreeze (0..STREAK_FREEZE_MAX). Every 7th day of a streak earns one; the shop sells one for
// streakFreezeCost(gen). A daily that comes after exactly one missed day spends one and the streak lives on
// (over.freezeUsed); two missed days always reset it
export const STREAK_FREEZE_MAX = 2, STREAK_FREEZE_COST = 150;
export const streakFreezeCost = (gen) => Math.round(STREAK_FREEZE_COST * genFactor(gen));
export function buyFreeze(meta) {
  if (!meta) return false;
  const have = clamp(Math.floor(+meta.streakFreeze || 0), 0, STREAK_FREEZE_MAX), c = streakFreezeCost(meta.gen);
  if (have >= STREAK_FREEZE_MAX || !(meta.dna >= c)) return false;
  meta.dna -= c; meta.streakFreeze = have + 1; return true;
}
// daily medals: 3 gold (a win), 2 silver (top 100), 1 bronze (top 1,000), 0 none. Each tier pays once a day.
export const MEDAL_PAY = [0, 15, 30, 60];
export const medalTier = (won, rank) => (won ? 3 : rank <= 100 ? 2 : rank <= 1000 ? 1 : 0);
// the daily's race DNA by attempt of the day (meta.dailyRuns, 1-based): full, then half for attempts 2-3, then 15%
export const DAILY_SCALE = [1, 0.5, 0.15];
export const dailyScaleOf = (n) => (n <= 1 ? DAILY_SCALE[0] : n <= 3 ? DAILY_SCALE[1] : DAILY_SCALE[2]);
export const medalPay = (from, to, gen) => { let d = 0; for (let t = Math.max(0, from) + 1; t <= to; t++) d += MEDAL_PAY[t]; return Math.round(d * genFactor(gen)); };

// ------------------------------------------------------------------ the race
export class Race {
  constructor(meta, rng = Math.random, opts = {}) {
    this.meta = meta; this.rng = rng; this.t = 0; this.events = [];
    this.gen = meta.gen || 0;
    this.muts = {}; this.syn = {}; this.pending = null; this.pendingMid = false; this.rerolls = REROLL_FREE + lv(meta, 'meditate');
    this.draftN = 0; this.midDraft = false; this.noLeg = 0; this.firstDealt = false;
    // rookie grace (the first ROOKIE_TAPER.length = 5 runs, never the daily) is worked out from the save, no UI flag needed
    this.rookie = rookieFactor(meta, opts.seed != null && isFinite(opts.seed) ? opts.seed : null); this.biteFree = -1;
    // the GAS a fruit gives and the drain factor before THE EGG: the rookie grace, then a taper (no cliff on run 6)
    this.sugarGas = sugarGasOf(meta, opts.seed != null && isFinite(opts.seed) ? opts.seed : null); this.drainK = drainTaperOf(meta, opts.seed != null && isFinite(opts.seed) ? opts.seed : null);
    this.firstNormal = !(opts.seed != null && isFinite(opts.seed)) && normRunsOf(meta) === 0;   // the very first normal swim
    this.over = null; this.won = false; this.paused = false; this.biteBy = null;
    // the first swim's rank hold (ROOKIE_HOLD): dead last until the first real input, then the FIRST SURGE
    this.rankHold = this.firstNormal && this.rookie > 0; this.surgeAt = -1; this.surgeSent = false; this.spawnX = VIEW_W / 2;
    // the first two normal swims always reach the duel: a named rival that gets to the egg first parks (parkClaims)
    this.parkClaims = !(opts.seed != null && isFinite(opts.seed)) && normRunsOf(meta) < PARK_RUNS;
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
    // steerK: bullet-time steering (main.js sets it each frame to clamp(1 / timeScale, 1, 2.2), 1 in the drill and on
    // autopilot): only Kevin's sideways response is sped up, the world stays slowed
    this.input = { tx: null, dir: 0, dash: false, tap: 0, touch: false, cashOut: false, finger: null, steerK: 1 };
    // THE THUMB (opts.human {lag, look, aimSd, dashEvery}): a test bot with human limits. It re-plans its steer only every
    // lag s, sees only what is within look px ahead, aims with seeded Gaussian noise (aimSd px) and dashes at most once
    // every dashEvery s. Its own RNG (keyed to the layout seed): the race's random sequence never moves
    this.human = opts.human ? { ...HUMAN_THUMB, ...(typeof opts.human === 'object' ? opts.human : {}) } : null;
    this.hNext = 0; this.hDashAt = -Infinity; this.hTx = null; this.hrng = this.human ? mulberry((this.layoutSeed ^ 0x48554D4E) >>> 0) : null;
    this.bot = !!opts.bot || !!this.human;           // test bot: steers like the autopilot but plays like a person
    this.autopilot = !!opts.autopilot || this.bot; this.autoT = 0;
    // from generation 2 the tube itself gets nastier, one step per generation to 8 (never in the daily: same layout for everybody)
    // and mid-career the tube toughens up with experience too: one step per 3 normal runs past the 6th, up to 8 (hzCareer)
    this.hzGen = this.daily == null ? Math.max(hzGenOf(this.gen), hzCareer(meta)) : 0;
    // the early-death rescue (rescueSteps): a softer tube after early losses in a row
    this.movers = opts.movers !== false && this.daily == null && normRunsOf(meta) > 0;   // the early-zone movers (DRIFT_*, DRIP_*; opts.movers false: none)
    this.rescue = rescueSteps(meta, this.daily); this.rescuePct = Math.round(100 * this.rescue / EARLY_N); this.rescueBites = this.rescue;
    this.hzGen = Math.max(0, this.hzGen - this.rescue); this.sugarGas += RESCUE_SUGAR * this.rescue;
    // the wall clock for the daily streak (opts.now in ms); a daily for another day than today counts at its noon
    this.now = isFinite(opts.now) ? +opts.now : null;
    this.biteUsed = 0;          // the one spare Big Macro bite a run gets after the rookie runs
    this.goalSeen = false;      // goalMet is emitted at most once per run
    this.lastWbcY = {};         // per tube side: the last Big Macro row (spawn spacing)
    this.lastWbcX = {};         // and its x (no puddle right under a Big Macro)
    this.lastSugarY = {};       // per tube side: the last fruit trail row (layout only: the drought guard)
    this.ciliaYs = [];          // recent wall hairs {y, side} (no Big Macro next to one)
    // (every field a race ever gets is declared here: one stable object shape keeps the step methods optimized)
    this.stepN = 0; this.draftTarget = null; this.inFanfare = false; this.ending = false; this.backflowed = 0;
    this.trickThreads = [];      // the SIGNATURE TRICK recipes in progress (seqPush)
    this.finaleT = null; this.finaleLead = 0; this.finaleBand = -1; this.arriveRank = 0; this.hzSeen = {}; this.tricksRun = {};
    // the featured trick (from the layout seed: no draw on any rng, so the rest of the race is the same with or without it)
    this.demo = !!opts.demo; this.featuredTrick = this.daily == null && !this.demo ? featuredTrickFor(meta, this.layoutSeed, this.muts) : null; this.featuredSent = false;
    // the habit perks this save owns (perk id -> habit id); each emits habitPerk {id, perk, x, y} the first time it fires
    this.perks = {}; this.perkSeen = {}; this.capSeen = {}; this.cap = null; this.gooTime = 0; this.gmZone = -1; this.softZone = -1; this.tuckPending = false;
    for (const H of HABIT_PERKS) if (HABITS[H.id] && lv(meta, H.id) >= H.at) this.perks[H.perk] = H.id;
    this.simFault = false; this._agFault = false;   // the NaN firewall (guarded): a swimmer's move went non-finite this step
    // stepId: one tick a guarded step (the one-event-a-step coalescing of comboMilestone and frenzy); _mileEv / _fzEv: this
    // step's event so far
    this.stepId = 0; this._mileEv = null; this._mileStep = -1; this._fzEv = null; this._fzStep = -1; this._fzBase = 0;
    // the GAS ledger for the result screen's 'one buy away' (wouldHave): drained, spent on everything else, gained from fruit,
    // and the seconds spent in FRENZY
    this.gasDrain = 0; this.gasOther = 0; this.gasSugar = 0; this.fzTime = 0;
    this.funG = 0; this.funK = 0;   // the gate funnel's gap centre and share this step (gateFunnel)      // the NaN firewall fired this swim (simFault is emitted once)
    const startY = 40 + HABIT_FX.jeans * lv(meta, 'jeans');
    const maxE = 100 + habitFx('water', lv(meta, 'water'));
    // (the fractional fields start as doubles (D0): one stable shape from birth, no mid-race deopts)
    const p = this.p = { x: D0, y: D0, vx: D0, vy: D0, e: D0, maxE: D0, shield: lv(meta, 'hottub'), dashT: D0, dashCd: D0, frenzyT: D0, nextFrenzy: 10, combo: D0,
      comboT: D0, comboMax: D0, tier: 0, fz: 0, fzPen: D0, fzPts: D0, bestTier: 0, mult: D0, bestCombo: D0, bestComboLate: D0, kindLast: {}, rep: [], style: 1, bank:
      D0, dashN: 0, draftN: 0, z0Key: '', draftT: D0, passSide: 0, passT: D0, passX: D0, slingOK: false, draftHold: D0, draft: D0, comeback: 0, side: 0, stuck: D0,
      inv: D0, acid: D0, wing: 0, second: 0, overtakes: 0, heading: D0, swatT: D0, swatDir: 0, current: 0, sameRun: 0, lastKind: '', clutch: D0, couchT: D0, acidT:
      D0, zoneBonks: 0, lastHit: '', frenzyTier: 0, swatSafe: D0, actT: D0, lastTx: null, lastOff: null, passRun: 0, seq: [], trickMult: D0, trickChain: {},
      freeSecond: 0, draftLock: null, magOff: null, magT: D0, mileI: 0, dashRefund: D0, trickStreak: 0, lastTrick: '', lastTrickT: D0, dashAt: D0, bossPasses: 0, fzCarry: D0, hits: 0, leadSec: D0, capDraftT: D0, whipN: -1, goo: D0, swatSlow: D0, oc: 0, swerveT: D0, txT: D0 };
    p.x = VIEW_W / 2; p.y = startY; p.vx = 0; p.vy = 0; p.e = maxE; p.maxE = maxE; p.dashT = 0; p.dashCd = 0; p.frenzyT = 0; p.combo = 0; p.comboT = 0; p.comboMax
      = 2.2; p.fzPen = 0; p.fzPts = 0; p.mult = 1; p.bestCombo = 0; p.bestComboLate = 0; p.bank = 0; p.draftT = -9; p.passT = -9; p.passX = 0; p.draftHold = 0;
      p.draft = 0; p.stuck = 0; p.inv = 0; p.acid = 0; p.heading = 0; p.swatT = 0; p.clutch = 0; p.couchT = 0; p.acidT = -99; p.swatSafe = 0; p.actT = IDLE_T;
      p.trickMult = 0; p.magT = 0; p.dashRefund = 0; p.lastTrickT = -99; p.dashAt = -99; p.fzCarry = 0; p.leadSec = 0; p.capDraftT = 0; p.goo = 0; p.swatSlow = 0; p.swerveT = 0; p.txT = -99;
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
        drillK: D0, T: D0, shoveT: D0, spawnY: D0, met: true, mv: null, conga: D0, eggSide: 0, strag: false };
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
    // arrive at the egg after a target time T (gen 0): the quickest (highest R.sp) after BOSS_T0 (116 s), the
    // slowest after 144 s, +/-2.5% per run. A rival in a rear slot therefore roars past you mid-race.
    // Tough (no death rolls), and they drill hard.
    const slots = RIVALS.map((R, k) => (BOSS_Y[k] != null ? BOSS_Y[k] : 34000 + 4000 * (k - 4)));
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(lrng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const order = RIVALS.map((R, k) => k).sort((a, b) => RIVALS[b].sp - RIVALS[a].sp || a - b);
    const bossGs = bossGenSpeed(this.gen);
    // new-player arc: the first runs and every pre-egg 'late' loss give Kevin a little more time
    this.rookieBoss = rookieBossT(meta, this.daily);
    this.rivalK = rivalDrillRace(meta, this.daily);
    this.gaspK = lastGaspK(meta, this.daily); this.headCap = headCapOf(meta, this.daily);
    this.pep = pepT(meta, this.daily); this.pepPct = Math.round((this.pep - 1) * 100);
    const bossT = bossTimeK(meta, this.daily);
    this.threatK = -1; this.threatSent = false; let soonest = Infinity;
    RIVALS.forEach((R, k) => {
      const a = this.agents[k], y = slots[k], rk = order.indexOf(k);
      // (BOSS_SPREAD 28 s from the quickest to the slowest (20), +/-BOSS_JIT a run (4%): each one arrives in its own slot,
      // so who meets Kevin at the egg is the rival's identity, not a coin toss)
      let T = BOSS_T0 + BOSS_SPREAD * rk / Math.max(1, RIVALS.length - 1);
      T *= 1 + (lrng() * 2 - 1) * BOSS_JIT;
      T *= bossT;
      a.drillK = 1 + (lrng() * 2 - 1) * DRILL_FORM;    // drilling form on the day: +/-DRILL_FORM
      const sp = rivalTrip(y) / (430 * T);
      Object.assign(a, { boss: R, k, sp: 430 * sp * bossGs, stam: 1, y, w: 1, zone: -1, deathY: Infinity, group: 'boss', T: T / bossGs, shoveT: 1.4, spawnY: y, met: false });
      a.side = lrng() < R.smart ? this.eggSide : -this.eggSide; a.lane = a.side * (0.2 + lrng() * 0.6); a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9);
      const eta = a.side === this.eggSide ? a.T : a.T + 1000;
      if (eta < soonest) { soonest = eta; this.threatK = k; }
    });
    this.frng = mulberry(this.layoutSeed ^ 0x1B873593);   // the daily finale picks
    // STRAGGLERS: the opening pack ends at 2500 and the far field starts in the Acid Lagoon, so a steering thumb outran
    // the pack at about 12 s and met nobody from 15 to 30 s. About 30 of the far field (group B: their weights are worked
    // out with the rest of it below) swim in little clumps through that hole instead
    this.strag = opts.stragglers === false ? [] : this.placeStragglers(fieldBase, nBoss + nA);
    // SCHOOLS: the Acid Lagoon emptied out past its first stretch (the far field is spread thin and swims away), so about
    // 60 more of group B swim in schools through it (see placeSchools)
    this.schools = opts.schools === false ? 0 : this.placeSchools(fieldBase, nBoss + nA);
    // weights: how many real swimmers each one stands for. The spread-out leaders share 100,000 places on a
    // log scale (the front ones are worth 1 each), the pack behind shares everything else.
    const B = this.agents.filter((a) => a.group === 'B').sort((a, b) => b.y - a.y), BSUM = 100000;
    let sumB = 0;
    B.forEach((a, j) => { a.w = Math.max(1, Math.pow(BSUM, (j + 1) / B.length) - Math.pow(BSUM, j / B.length)); sumB += a.w; });
    const wA = (TOTAL_SWIMMERS - 1 - nBoss - sumB) / nA;
    for (const a of this.agents) if (a.group === 'A') a.w = wA;
    // you really are dead last at the gun: rank TOTAL_SWIMMERS, held RANK_HOLD s, then blended to the real place over RANK_BLEND s
    this.rank = this.startRank = TOTAL_SWIMMERS; this.alive = TOTAL_SWIMMERS;
    this.refreshStats();
    this.p.nextFrenzy = this.frenzyThreshold(0); this.p.comboMax = this.s.combo;
    // tuckIn: start tucked in behind the slowest swimmer of the pack, the slingshot loaded (never in the daily: the same
    // field for everybody)
    if (this.perks.tuckIn && this.daily == null) {
      let slow = null; for (const a of this.agents) if (a.group === 'A' && (!slow || a.sp < slow.sp)) slow = a;
      if (slow) {
        const y = startY + 50, pr = params(y);
        Object.assign(slow, { y, kx: 0, deathY: Infinity, zone: -1, conga: 0, side: 0 });
        slow.lane = clamp((p.x - centreW(y, pr.wob)) / (pr.hw * 0.9), -0.9, 0.9); slow.lane2 = clamp(Math.abs(slow.lane) / 0.9 * 2 - 1, -0.9, 0.9); slow.side = slow.lane < 0 ? -1 : 1;
        p.x = this.agentX(slow); p.draftLock = slow; p.draft = this.s.draft; p.draftHold = SLING_HOLD; p.draftN = 1; p.draftT = 0; p.slingOK = true;
        this.tuckPending = true;
      }
    }
    this.dnaFromCombo = 0;   // DNA earned on top of the base thanks to combo multipliers (for the result screen)
    this.calmY = -Infinity;  // no hostiles spawn below this row (set after a backflow)
    this.puddles = [];       // recent acid / goo centres per side (the spawner keeps Big Macros off them)
    this.patches = this.popcornRows();   // one POPCORN PATCH a zone (its own seeded RNG: the rows' rolls never change)
    // the very first run: two fruit sugars right on the racing line in the Launch Tube
    if (this.daily == null && !((meta.runs || 0) > 0)) for (const [dy, dx] of [[3200, -18], [5600, 18]]) this.ents.push({ t: 'sugar', x: centre(startY + dy) + dx, y: startY + dy, r: 9, gift: 1 });
    // swim 1's 'NOPE!' moment: one dozing Big Macro in the Launch Tube (setpieceStep). (Not for the test bot, opts.bot:
    // the balance sims' careers branch chaotically on run 1's path, and a scripted one-off cell is not what they measure)
    if (this.daily == null && !((meta.runs || 0) > 0) && !this.bot && opts.setpiece !== false) {
      const y = clamp(Math.max(SET_Y, startY + 2000), 5000, 5500), kW = wbcK(channel(y, 0).h);
      this.ents.push({ t: 'wbc', x: centre(y), y, r: 20 * kW, vx: 0, vy: 0, hunt: 0, eat: 0, ph: 0, spot: 0, side: 0, kW, lunger: 0, lunged: 0, crouch: 0, lunge: 0, ld: 0, tx: 0, ty: 0,
        popcorn: 1, setpiece: true, spPhase: 0, spT: 0, spLo: 0, spHi: 0, spDir: 1 });
    }
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

  // the STRAGGLERS: about 30 group B swimmers (every few of them, so no zone loses many) moved into clumps through the hole
  // after the opening pack. Their own RNG keyed to the layout seed: no draw on lrng, the rest of the layout never moves.
  // Each one starts in its zone already rolled (no death there: deathY Infinity until it is passed and swims on)
  placeStragglers(fieldBase, b0) {
    const srng = mulberry((this.layoutSeed ^ 0x6C8E9CF5) >>> 0), A = this.agents, B = [];
    for (let i = b0; i < A.length; i++) if (A[i].group === 'B') B.push(A[i]);
    const ys = STRAG_Y.concat(STRAG_ACID.map((d) => ZSTART[ACID_I] + d));
    const sizes = ys.map(() => STRAG_MIN + Math.floor(srng() * (STRAG_MAX - STRAG_MIN + 1)));
    const tot = sizes.reduce((a, b) => a + b, 0), step = B.length / Math.max(1, tot), out = [];
    let j = 0;
    ys.forEach((y0, c) => {
      const s0 = srng() < 0.5 ? -1 : 1;
      for (let k = 0; k < sizes[c]; k++) {
        const a = B[Math.floor(j++ * step)]; if (!a) return;
        const sgn = k % 2 ? -s0 : s0, y = y0 + k * STRAG_GAP + (srng() * 2 - 1) * 4;
        a.lane = sgn * (STRAG_LANE[0] + srng() * (STRAG_LANE[1] - STRAG_LANE[0])); a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9); a.side = sgn;
        a.y = y; a.sp = fieldBase * stragSp(srng()); a.stam = 1; a.zone = zoneIndex(y); a.zoneEnd = -Infinity; a.deathY = Infinity; a.kx = 0; a.strag = true;
        out.push(a);
      }
    });
    return out;
  }
  // the SCHOOLS: group B swimmers (not stragglers, every few of them) re-seeded as schools of SCHOOL_N, one school every
  // SCHOOL_GAP px from SCHOOL_Y0 to SCHOOL_Y1 past the Acid Lagoon's door, lanes within SCHOOL_LANE of a shared centre,
  // SCHOOL_SP x fieldBase (one speed a race, so the schools keep their spacing). Their own RNG keyed to the layout seed: no draw on
  // lrng. Each starts in its zone already rolled (no death there). Returns how many were placed.
  placeSchools(fieldBase, b0) {
    const srng = mulberry((this.layoutSeed ^ 0x3C6EF372) >>> 0), A = this.agents, B = [];
    for (let i = b0; i < A.length; i++) if (A[i].group === 'B' && !A[i].strag) B.push(A[i]);
    const plan = [];
    for (let y = ZSTART[ACID_I] + SCHOOL_Y0, n = 0; y <= ZSTART[ACID_I] + SCHOOL_Y1 && n < SCHOOL_MAX; y += SCHOOL_GAP[0] + srng() * (SCHOOL_GAP[1] - SCHOOL_GAP[0])) {
      const k = Math.min(SCHOOL_MAX - n, SCHOOL_N[0] + Math.floor(srng() * (SCHOOL_N[1] - SCHOOL_N[0] + 1)));
      plan.push({ y, k }); n += k;
    }
    const tot = plan.reduce((a, b) => a + b.k, 0), step = B.length / Math.max(1, tot);
    let j = 0;
    // (one speed for every school of the race: they keep their spacing, so one is always coming up)
    const sp = SCHOOL_SP[0] + srng() * (SCHOOL_SP[1] - SCHOOL_SP[0]);
    for (const sc of plan) {
      const c = (srng() * 2 - 1) * (0.9 - SCHOOL_LANE);
      for (let k = 0; k < sc.k; k++) {
        const a = B[Math.floor(j++ * step)]; if (!a) return j;
        a.lane = clamp(c + (srng() * 2 - 1) * SCHOOL_LANE, -0.9, 0.9); a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9); a.side = a.lane < 0 ? -1 : 1;
        a.y = sc.y + k * 32 + srng() * 24; a.sp = fieldBase * sp * (1 + (srng() * 2 - 1) * 0.01); a.stam = 1; a.zone = zoneIndex(a.y); a.zoneEnd = -Infinity; a.deathY = Infinity; a.kx = 0;
      }
    }
    return j;
  }
  // may an acid puddle e spawn? Not within STRAG_CLEAR px of the lane of a straggler still ahead of Kevin, around the row
  // where he catches it (at his base speed): the overtake never drags his line through acid
  stragClear(e) {
    const p = this.p, sv = Math.max(1, this.s.speed);
    for (const a of this.strag) {
      if (!a.alive || a.arrived || a.y <= p.y || a.y - p.y > 2600) continue;
      const catchY = a.y + (a.y - p.y) * a.sp / Math.max(60, sv - a.sp) + 300;
      if (e.y < catchY - 700 || e.y > catchY) continue;
      const pr = params(e.y), x = centreW(e.y, pr.wob) + a.lane * pr.hw * 0.9;
      if (Math.abs(x - e.x) < STRAG_CLEAR) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- derived stats
  refreshStats() {
    const m = this.muts, M = this.meta, s = {}, syn = this.syn;
    s.speed = 445 * (1 + broccoliFx(lv(M, 'broccoli'))) * (1 + MUTATIONS.turbo.speed * Math.min(m.turbo || 0, MUTATIONS.turbo.max)) * (1 + 0.04 * (m.bloom ? this.cleared : 0)) * (syn.comeback && this.p.comeback ? 1.1 : 1);
    // every generation drains a little faster (genDrain: +2.5% a generation to gen 4, +0.6% to gen 10, +1.2% to gen 30),
    // a bigger tank is a thirstier tail (+WATER_DRAIN, 1%, per normal water level), Dad's sleep takes 5% a level off and
    // Lazy Wiggle 18% a level: the tank always matters
    s.drain = 4.3 * Math.pow(1 - HABIT_FX.sleep, lv(M, 'sleep')) * Math.pow(0.82, m.eco || 0) * genDrain(this.gen) * (1 + WATER_DRAIN * Math.min(lv(M, 'water'), HABITS.water.max));
    // speed is no fuel upgrade twice over: a faster tail (broccoli, Turbo, Bloom; never the Comeback or FRENZY) sips
    // x(speed / 445)^DRAIN_SPEED_POW, so it crosses a zone on about the same GAS
    const baseSpeed = 445 * (1 + broccoliFx(lv(M, 'broccoli'))) * (1 + MUTATIONS.turbo.speed * Math.min(m.turbo || 0, MUTATIONS.turbo.max)) * (1 + 0.04 * (m.bloom ? this.cleared : 0));
    s.drain *= Math.pow(baseSpeed / 445, DRAIN_SPEED_POW);
    s.draft = 0.2 * (1 + 0.6 * (m.draft || 0)) * (1 + habitFx('walk', lv(M, 'walk')));
    s.sugar = this.sugarGas * (1 + habitFx('berries', lv(M, 'berries'))) * (1 + 0.5 * (m.sweet || 0));
    s.magnet = MAGNET_BASE + 45 * (m.magnet || 0);
    s.acid = 26 * Math.pow(0.4, m.antacid || 0) * (this.rookie || 1) * hzMul(this.hzGen || 0, 0.08) * Math.pow(RESCUE_ACID, this.rescue || 0);
    s.combo = 2.2 + 1 * (m.memory || 0) + habitFx('beatbox', lv(M, 'beatbox'));
    // Whiplash: x0.8 cooldown and x0.85 cost a level (3 levels: 1.5 s and 4.9 energy, never a free permanent dash).
    // Every rival passed mid-dash refunds DASH_REFUND GAS, up to DASH_REFUND_CAP a dash (p.dashRefund)
    s.dashCd = 3 * Math.pow(0.8, m.whip || 0);
    s.dashLen = syn.afterburner ? 1.4 : 1;
    // (a rookie dash is cheaper: x0.5 + 0.5 * rookie, about 6.2 GAS on run 1, so 'Tap DASH' never runs you dry)
    s.dashCost = 8 * Math.pow(0.85, m.whip || 0) * (this.rookie ? 0.5 + 0.5 * this.rookie : 1);
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
    // the capstones held (a multi-level common card at its max)
    const cap = this.cap || (this.cap = {});
    for (const id of MUT_CAPSTONE_IDS) cap[id] = (m[id] || 0) >= MUTATIONS[id].max;
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
  // (+ p.fzCarry: the progress a FINISHER cashed mid FRENZY keeps, until FRENZY ends or the chain is smashed)
  fzPoints() { return this.p.combo - this.p.fzPen + this.p.fzCarry; }
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

  emit(type, o = {}) { o.type = type; this.events.push(o); return o; }
  // ONE MILESTONE A STEP: a step (one guarded step, or one batch of direct calls while the queue is not drained) that
  // crosses several combo milestones emits one comboMilestone {n, x, y, skipped}: n the highest, skipped the others
  emitMilestone(n, k, x, y) {
    const ev = this._mileEv;
    if (ev && this._mileStep === this.stepId && this.events.includes(ev)) { ev.n = n; ev.skipped += k; ev.x = x; ev.y = y; return ev; }
    this._mileStep = this.stepId;
    return (this._mileEv = this.emit('comboMilestone', { n, x, y, skipped: k - 1 }));
  }
  // and one frenzy event a step: the highest tier reached, skipped = the tiers climbed past on the way (from base, the
  // tier held before the step's first fanfare). first stays true once any fanfare of the step lit FRENZY
  emitFrenzy(o, base) {
    const ev = this._fzEv;
    if (ev && this._fzStep === this.stepId && this.events.includes(ev)) {
      if (o.tier >= ev.tier) { const first = ev.first; Object.assign(ev, o); ev.first = !!(first || o.first); ev.type = 'frenzy'; }
      ev.skipped = Math.max(0, ev.tier - this._fzBase - 1);
      return ev;
    }
    this._fzStep = this.stepId; this._fzBase = Math.max(0, base || 0);
    o.skipped = Math.max(0, o.tier - this._fzBase - 1);
    return (this._fzEv = this.emit('frenzy', o));
  }
  // a habit perk fired: habitPerk {id, perk, x, y} the first time each one does in a run
  perkFire(perk, x, y) {
    if (this.perkSeen[perk]) return;
    this.perkSeen[perk] = 1; this.emit('habitPerk', { id: this.perks[perk], perk, x: x != null ? x : this.p.x, y: y != null ? y : this.p.y });
  }
  // frenzyPlus: every FRENZY start lasts PERK_FRENZY_T s longer
  // a capstone fired: capstone {id, x, y} the first time each one does in a run
  capFire(id, x, y) {
    if (this.capSeen[id]) return;
    this.capSeen[id] = 1; this.emit('capstone', { id, x: x != null ? x : this.p.x, y: y != null ? y : this.p.y });
  }
  // HELMET HEAD's capstone: a broken shield fires a knockback ring. Big Macros within r are pushed out of it and calmed,
  // named and nameless rivals within r are shoved aside. Emits helmetRing {x, y, r, n}
  helmetRing(x, y, r = CAP_RING_R) {
    const p = this.p; let n = 0;
    for (const e of this.ents) {
      if (e.dead || e.t !== 'wbc' || Math.abs(e.y - y) > r) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy); if (d > r) continue;
      const ux = d > 1 ? dx / d : (e.x < p.x ? -1 : 1), uy = d > 1 ? dy / d : 0, b = playBand(e.y, e.side || p.side);
      e.x = clamp(e.x + ux * (r - d + 20), b.l, b.r); e.y += uy * (r - d + 20); e.vx = ux * 300; e.vy = uy * 300;
      e.hunt = 0; e.spot = 0; e.crouch = 0; e.lunge = 0; if (e.lunger) e.lunged = 2; e.cool = 1.5; n++;
    }
    for (const a of this.agents) {
      if (!a.alive || a.arrived || Math.abs(a.y - y) > r || (p.y >= FORK_Y0 && a.side !== p.side)) continue;
      const ax = this.agentX(a); if (Math.hypot(ax - x, a.y - y) > r) continue;
      a.kx += (ax < x ? -1 : 1) * 3; a.bumpT = 0.6; n++;
    }
    this.emit('helmetRing', { x, y, r, n });
    this.capFire('helmet', x, y);
    return n;
  }
  perkFrenzy() { if (this.perks.frenzyPlus) { this.p.frenzyT += PERK_FRENZY_T; this.perkFire('frenzyPlus'); } }

  // ---------------------------------------------------------------- random race events
  // how many events a normal run gets ramps with experience (eventPlan); a daily always gets 3, any kind
  planEvents(lrng) {
    const zones = ['acid', 'goo', 'sea', 'rapids'].map((id) => ZONES.findIndex((z) => z.id === id)).filter((i) => i > 0);
    for (let i = zones.length - 1; i > 0; i--) { const j = Math.floor(lrng() * (i + 1)); [zones[i], zones[j]] = [zones[j], zones[i]]; }
    const plan = this.daily != null ? { n: 3, kinds: null } : eventPlan(this.meta);
    const out = [], used = new Set(), n = Math.min(plan.n, zones.length);
    // (the rolls are drawn for 3 events at least, used or not, so the field built from the same layout seed after
    // this never depends on how many events a run gets)
    const pick = zones.slice(0, n).sort((a, b) => a - b), rolls = Math.max(3, n);
    for (let k = 0; k < rolls; k++) {
      const zi = pick[k];
      if (zi == null) { lrng(); lrng(); continue; }
      const zid = ZONES[zi].id, pool = EVENT_ORDER.filter((id) => !used.has(id) && id !== this.dailyRule && RACE_EVENTS[id].zones.includes(zid) && (!plan.kinds || plan.kinds.includes(id)));
      if (!pool.length) { lrng(); lrng(); continue; }
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
    const wOf = (id) => RW[MUTATIONS[id].r - 1] * (comp.has(id) ? (hook ? 6 : COMPLETER_W) : 1) * late(id);
    const take = (cands) => {
      const ws = cands.map(wOf); let r = rng() * ws.reduce((a, b) => a + b, 0), k = 0;
      while (k < ws.length - 1 && r > ws[k]) { r -= ws[k]; k++; }
      return cands[k];
    };
    const picks = [], size = golden ? 4 : 3;
    const add = (id) => {
      picks.push(id); pool.splice(pool.indexOf(id), 1);
      if (MUTATIONS[id].r === 3) for (let i = pool.length - 1; i >= 0; i--) if (MUTATIONS[pool[i]].r === 3) pool.splice(i, 1);
      if (!hook && comp.has(id)) for (let i = pool.length - 1; i >= 0; i--) if (comp.has(pool[i])) pool.splice(i, 1);   // one completer a deal
    };
    const legs = pool.filter((id) => MUTATIONS[id].r === 3);
    if (this.noLeg >= 3 && legs.length) add(take(legs));        // pity
    const forced = pool.filter((id) => comp.has(id));
    if (forced.length && rng() < (hook ? 1 : COMPLETER_FORCE)) add(take(forced));
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
    // a card raised to its max, one-level cards included (once: a maxed card is never dealt again)
    if (this.muts[id] === MUTATIONS[id].max) this.emit('maxed', { id, capstone: MUT_CAPSTONE_IDS.includes(id) });
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
  // (the very first normal swim keeps the Gate of Goo's first gate GOO_FIRST_GATE past its start: the hazard intro lands first)
  gateRow(y) {
    const zi = zoneIndex(y), z = ZONES[zi];
    const past = zi === GOO_I && this.firstNormal ? y >= ZSTART[zi] + GOO_FIRST_GATE : y > ZSTART[zi] + 500;
    return !!z.hazards.gate && y % 1300 < 100 && past && y < ZSTART[zi] + z.len - 500;
  }
  // POPCORN PATCH rows: one per zone from the Acid Lagoon to the Rapids (not the Fork, where you pick a tube, nor the egg),
  // from its own RNG keyed to the layout seed (the daily layout only gains the patch, no earlier roll moves). In a zone
  // with goo gates it sits POPCORN_AFTER past one of them (gate, pop, weave: NEEDLE), elsewhere anywhere 1500 from the ends
  popcornRows() {
    const out = [], prng = mulberry((this.layoutSeed ^ 0x2F6B1D93) >>> 0);
    for (let zi = 1; zi < ZONES.length; zi++) {
      const z = ZONES[zi]; if (z.fork || z.egg) continue;
      const u = prng(), v = prng();
      let y;
      if (z.hazards.gate) {
        const gs = []; for (let gy = Math.ceil(ZSTART[zi] / 1300) * 1300; gy < ZSTART[zi] + z.len; gy += 1300) if (this.gateRow(gy) && gy + POPCORN_AFTER + 600 < ZSTART[zi] + z.len) gs.push(gy);
        y = gs.length ? gs[Math.floor(u * gs.length)] + POPCORN_AFTER : null;
      } else y = ZSTART[zi] + 1500 + Math.floor(u * Math.max(0, z.len - 4000) / 100) * 100;
      if (y != null) out.push({ y, zi, n: POPCORN_MIN + Math.floor(v * (POPCORN_MAX - POPCORN_MIN + 1)), seed: (prng() * 4294967296) >>> 0 });
    }
    return out;
  }
  // a POPCORN PATCH: POPCORN_MIN..MAX dozing Big Macros (e.popcorn: they never spot or hunt) packed within POPCORN_R px,
  // on one half of the tube so there is always a way round. Dash through them: a touch at any moment of a dash
  // pops it, a dash grazing one within DASH_GRAZE px is a 'pop' trick step
  spawnPopcorn(pc, side) {
    const prng = mulberry(pc.seed), y = pc.y, ch = channel(y + 60, side), b = playBand(y + 60, side);
    const half = prng() < 0.5 ? -1 : 1, cx = clamp(ch.c + half * 0.4 * ch.h, b.l + 30, b.r - 30), kW = wbcK(ch.h);
    for (let k = 0; k < pc.n; k++) {
      const e = { t: 'wbc', x: clamp(cx + (prng() * 2 - 1) * 30, b.l, b.r), y: y + k * (POPCORN_R - 20) / Math.max(1, pc.n - 1), r: 20 * kW, vx: 0, vy: 0, hunt: 0, eat: 0, ph: prng() * 6, spot: 0, side, kW, lunger: 0, lunged: 0, crouch: 0, lunge: 0, ld: 0, tx: 0, ty: 0, popcorn: 1 };
      this.ents.push(e);
    }
  }
  // the set piece's script: 0 dozing, 1 the wake tell (it shuffles to Kevin's side of the tube), 2 drifting across his
  // lane, 3 done (dodged or hit). The drift keeps the cell inside [spLo, spHi]: SET_GAP or more open between it and the far wall
  setpieceStep(e, dt) {
    const p = this.p;
    if (e.spPhase === 0) {
      if (e.y - p.y > SET_WAKE_D) return;
      const b = playBand(e.y, 0), c = (b.l + b.r) / 2, left = p.x < c;
      e.spLo = left ? b.l + e.r + 4 : b.l + e.r + SET_GAP + 1; e.spHi = left ? b.r - e.r - SET_GAP - 1 : b.r - e.r - 4;
      if (e.spHi < e.spLo) e.spHi = e.spLo;
      e.spPhase = 1; e.spT = SET_TELL; e.popcorn = 0;
      this.emit('setpiece', { phase: 'wake', x: e.x, y: e.y });
      return;
    }
    if (e.spPhase === 1) {
      const tx = clamp(p.x, e.spLo, e.spHi), dx = tx - e.x, mv = SET_TELL_VX * dt;
      e.x += Math.abs(dx) <= mv ? dx : Math.sign(dx) * mv;
      e.spT -= dt;
      if (e.spT <= 0) { e.spPhase = 2; e.spDir = p.x >= e.x ? 1 : -1; if (e.x <= e.spLo + 1) e.spDir = 1; else if (e.x >= e.spHi - 1) e.spDir = -1; }
    } else if (e.spPhase === 2) {
      e.vx = SET_VX * e.spDir; e.x += e.vx * dt;
      if (e.x >= e.spHi) { e.x = e.spHi; e.spDir = -1; } else if (e.x <= e.spLo) { e.x = e.spLo; e.spDir = 1; }
    }
    if (e.spPhase === 1 || e.spPhase === 2) {
      if (p.y > e.y + e.r + 8 && !e.touched) { e.spPhase = 3; e.vx = 0; this.emit('setpiece', { phase: 'dodged', x: e.x, y: e.y }); }
    }
  }
  hzNew(id, e) {
    const seen = this.hzSeen || (this.hzSeen = {});
    if (seen[id]) return;
    seen[id] = 1; this.emit('hzNew', { id, x: e.x, y: e.y });
  }
  spawnAhead() {
    const p = this.p, m = this.muts, hg = this.hzGen, fz = fruitStep(this.gen, hg, this.daily != null, normRunsOf(this.meta));
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
      const sugarP = (hz.sugar || 0) * 0.06 * (1 + 2 * kSugar) * fruitMulOf(fz) * (zi === 0 && this.rookie && !(this.meta.runs > 0) ? 1.4 : 1);
      const dnaP = 0.012 * (1 + 0.5 * (m.lucky || 0)) * (1 + 5 * kGold);
      // rookies meet a few fewer Big Macros (x0.82 on run 1, back to x1 after run 5)
      const wbcP = ((hz.wbc || 0) * 0.05 + 0.07 * kStamp) * (hzMul(hg, WBC_HZ) + WBC_HZ_LATE * Math.max(0, (this.daily == null ? hzCareer(this.meta) : 0) - WBC_LATE_FROM)) * (this.rookie ? 0.6 + 0.4 * this.rookie : 1);
      // puddles: the Launch Tube has its first few only past its first 3500 and never on a rookie run; none at the Fork's
      // split (FORK_Y0 +/- 600), where you have a tube to pick
      const poolsOK = zi !== 0 || (y >= ZSTART[0] + 3500 && !this.rookie);
      const forkBand = (e) => e.y > FORK_Y0 - 600 && e.y < FORK_Y0 + 600;
      const hzA = hzMul(hg, 0.08);
      for (const side of sides) {
        const rng = mulberry((this.layoutSeed ^ Math.imul((y / step) * 3 + side + 2, 0x2C1B3C6D)) >>> 0);
        // (the movers' own row RNG: drawn only for them, so no layout roll ever moves)
        const mrng = this.movers ? mulberry((this.layoutSeed ^ Math.imul((y / step) * 3 + side + 2, 0x5F356495) ^ 0x2D5A) >>> 0) : null;
        const ch = channel(y, side), bl = Math.max(ch.c - ch.h + 9, EDGE), br = Math.min(ch.c + ch.h - 9, VIEW_W - EDGE);
        const rx = () => clamp(ch.c + (rng() * 2 - 1) * ch.h * 0.8, bl, br), blob = 0.55 * ch.h;
        // no fruit drought: a row more than SUGAR_GAP past the last trail on its side (or the Acid Lagoon's first
        // SUGAR_ACID_IN with none yet) spawns its trail whatever the roll says. The roll is still drawn, so the rows'
        // random sequence (and the daily layout) only ever changes by the forced trail itself.
        const lastS = this.lastSugarY[side] ?? this.lastSugarY[0] ?? 0;
        const drought = y - lastS > sugarGap(fz) || (zi === ACID_I && y >= ZSTART[ACID_I] + SUGAR_ACID_IN - 100 && y < ZSTART[ACID_I] + SUGAR_ACID_IN && lastS < ZSTART[ACID_I]);
        const rolled = sugarP > 0 && rng() < sugarP;
        if (sugarP > 0 && (rolled || drought)) {           // a little trail of fruit sugar
          this.lastSugarY[side] = y;
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
          if (hg >= HZ_NEW.pulse && rng() < 0.5) { e.pulse = 1; e.r0 = e.r; e.swellT = null; }
          if (!nearGate && poolsOK && !forkBand(e) && !underMac(e) && (!this.strag.length || this.stragClear(e))) {
            // a DRIFTER: it sways DRIFT_AMP across its row (kept inside the tube), never a pulse puddle too
            if (mrng && zi === ACID_I && !e.pulse && mrng() < DRIFT_SHARE) {
              e.r = DRIFT_R[0] + mrng() * (DRIFT_R[1] - DRIFT_R[0]); e.drift = DRIFT_AMP; e.dph = mrng() * TAU;
              e.x0 = clamp(e.x, bl + DRIFT_AMP, Math.max(bl + DRIFT_AMP, br - DRIFT_AMP)); e.x = e.x0 + DRIFT_AMP * Math.sin(this.t * TAU / DRIFT_T + e.dph);
            }
            this.puddles.push({ x: e.drift ? e.x0 : e.x, y, r: e.r + (e.drift || 0), side });
            if (hostile) { this.ents.push(e); if (e.pulse) this.hzNew('pulse', e); if (e.drift) this.hzNew('drift', e); }
          }
        }
        if (hz.alkali && rng() < 0.06 * hz.alkali) this.ents.push({ t: 'alkali', x: rx(), y: y + 50, r: 11 });
        if (hz.goo && rng() < 0.1 * hz.goo * hzA) {
          const e = { t: 'goo', x: rx(), y: y + rng() * 100, r: Math.min(30 + rng() * 34, blob), seed: rng() * 9 };
          if (!nearGate && poolsOK && !forkBand(e) && !underMac(e)) { this.puddles.push({ x: e.x, y, r: e.r, side }); if (hostile) this.ents.push(e); }
        }
        if (gateHere) {
          // (a rookie run widens the gaps: +27 on run 1, tapering to +4 on run 5)
          const gw = Math.max(66, 78 - 3 * hg) + rng() * 30 + (this.rookie > 0 ? Math.round(ROOKIE_GATE * (1 - this.rookie)) : 0), n2 = rng() < 0.45 ? 2 : 1, gaps = [];
          for (let k = 0; k < n2; k++) gaps.push(bl + gw / 2 + 1 + rng() * Math.max(0, br - bl - gw - 2));
          const e = { t: 'gate', x: ch.c, y, r: ch.h, gaps, gw, side, bonkT: 0, contact: 0, fun: -1 };
          if (hg >= HZ_NEW.slide) {    // a sliding gate: its gaps sway, never out of the tube
            e.slide = (rng() < 0.5 ? -1 : 1) * slideAmp(hg); e.sph = rng() * TAU; e.g0 = gaps.slice();
            e.lo = Math.min(bl + gw / 2, br - gw / 2); e.hi = Math.max(bl + gw / 2, br - gw / 2);
          }
          if (hg >= HZ_NEW.close && rng() < 0.5) { e.close = 1; e.gw0 = gw; e.cph = rng() * TAU; }
          if (e.close && e.slide) e.slide = 0;    // a closing gate never slides too (its rolls are still drawn: the layout holds)
          // a DRIPPER (the Gate of Goo only): e.dripT counts to its next tell, e.dripTell runs the tell
          if (mrng && zi === GOO_I && mrng() < DRIP_SHARE) { e.drip = 1; e.dripT = mrng() * DRIP_EVERY; e.dripTell = 0; e.dripX = 0; }
          if (hostile) { this.ents.push(e); if (e.slide) this.hzNew('slide', e); if (e.close) this.hzNew('close', e); if (e.drip) this.hzNew('drip', e); }
        }
        if (wbcP && rng() < wbcP) {
          const kW = wbcK(ch.h), narrow = ch.h < WBC_TWIN_NARROW;
          const e = { t: 'wbc', x: rx(), y: y + 50, r: (22 + rng() * 8) * kW, vx: 0, vy: 0, hunt: 0, eat: 0, ph: rng() * 6, spot: 0, side, kW, lunger: 0, lunged: 0, crouch: 0, lunge: 0, ld: 0, tx: 0, ty: 0 };
          // never parked on a puddle from the last two rows: up to 3 re-rolls of x
          const onPuddle = () => this.puddles.some((q) => q.side === side && Math.abs(q.x - e.x) < q.r + 50);
          for (let k = 0; k < 3 && onPuddle(); k++) e.x = rx();
          const dry = !onPuddle();      // (still on one after 3 tries: this row gets no Big Macro)
          // fair Big Macros: one per 380 on a side (240 in a stampede), and none within 300 of a wall hair.
          // (the rolls above are always drawn, so the daily layout stays the same for everybody)
          const last = this.lastWbcY[side], gap = 380 - 140 * kStamp;
          const spaced = !(last != null && Math.abs(e.y - last) < gap) && !this.ciliaYs.some((c) => c.side === side && Math.abs(c.y - e.y) < 300);
          const twin = hg >= HZ_NEW.twins && rng() < (narrow ? 0.12 : 0.25);
          if (hg >= HZ_NEW.lunge && rng() < lungeShare(hg, narrow)) e.lunger = 1;
          if (spaced && dry && !gateHere) {
            this.lastWbcY[side] = e.y; this.lastWbcX[side] = e.x; if (hostile) { this.ents.push(e); if (e.lunger) this.hzNew('lunge', e); }
            // twins: a mirrored second cell 120 lower, 180 in a narrow tube (never on a gate row, a puddle or within 300 of a wall hair)
            const ty = e.y - (narrow ? 180 : 120), tw = { ...e, x: clamp(2 * ch.c - e.x, bl, br), y: ty, ph: e.ph + 1.5, twin: 1, lunger: 0 };
            const tRow = Math.floor(ty / 100) * 100;
            if (twin && hostile && ty >= this.calmY && ty >= p.y + 450 && !this.gateRow(tRow) && !this.gateRow(tRow - 100) && !this.gateRow(tRow + 100)
              && !this.ciliaYs.some((c) => c.side === side && Math.abs(c.y - ty) < 300) && !this.puddles.some((q) => q.side === side && Math.abs(q.x - tw.x) < q.r + 50)) {
              this.ents.push(tw); this.hzNew('twins', tw);
            }
          }
        }
        for (const pc of this.patches) if (pc.y === y && !pc.done && hostile) { pc.done = true; this.spawnPopcorn(pc, side); }
        if (hz.current && rng() < 0.03 * hz.current) { const e = { t: 'current', x: ch.c, y, r: ch.h, h: 260 + rng() * 200, dir: rng() < 0.5 ? -1 : 1 }; if (hostile) this.ents.push(e); }
        if (hz.cilia && rng() < 0.05 * hz.cilia * hzMul(hg, 0.1) * (z.id === 'rapids' ? hzMul(hg, RAPIDS_CILIA_HZ) : 1)) {   // a little hair on one wall that swats you aside on the beat
          const wall = this.ciliaN++ % 2 ? 1 : -1, len = 0.45 + rng() * 0.2, beat = 60 / (z.beat || 120);
          // (a period of 3+ beats, about 2 s: a pair's tells, half a period apart, never overlap)
          const period = Math.max(3, Math.round(2.0 / beat)) * beat;
          const e = { t: 'cilia', x: ch.c + wall * ch.h, y: y + 50, r: len * 2 * ch.h, wall, len, period, off: Math.floor(rng() * 8) * beat, state: 0, phase: 0, tellT: CILIA_TELL, swatT: CILIA_SWAT };
          if (hostile) this.ents.push(e);
          // a pair: a twin hair on the opposite wall, swatting half a period later
          if (hg >= HZ_NEW.pair && rng() < 0.4 && hostile) {
            // (the two reaches together cover at most CILIA_PAIR_MAX of the tube: the twin is the shorter hair)
            const len2 = Math.min(len, CILIA_PAIR_MAX - len);
            const e2 = { ...e, wall: -wall, x: ch.c - wall * ch.h, off: e.off + period / 2, pair: 1, len: len2, r: len2 * 2 * ch.h };
            this.ents.push(e2); this.hzNew('pair', e2);
          }
          // a hair clears the Big Macros spawned in the 300 before it (they are still far off screen)
          this.ciliaYs.push({ y: e.y, side });
          for (const w of this.ents) if (w.t === 'wbc' && !w.dead && !w.popcorn && (w.side == null || w.side === side) && Math.abs(w.y - e.y) < 300 && w.y >= p.y + 450) w.dead = 1;
        }
      }
    }
  }

  // ---------------------------------------------------------------- autopilot (also the test bot)
  autoSteer() {
    const H = this.human;
    // the thumb: between re-plans it holds its last target and does not dash
    if (H && this.t < this.hNext) { this.input.tx = this.hTx; this.input.dash = false; return; }
    const p = this.p, nose = this.muts.nose, fs = nose ? this.eggSide : this.autoFork, look = H ? H.look : 420;
    const ch = channel(p.y + 120, p.side || (p.y > FORK_Y0 - 1500 ? fs : 0));
    const bl = Math.max(ch.c - ch.h + 9, EDGE), br = Math.min(ch.c + ch.h - 9, VIEW_W - EDGE);
    let best = p.x, bestS = -1e9;
    const popDash = this.bot && p.dashCd <= 0 && p.e > 30 && p.stuck <= 0;
    const forkSide = p.side || (p.y > FORK_Y0 - 1500 ? fs : 0);
    for (let k = 0; k <= 16; k++) {
      let x = clamp(ch.c - ch.h + 14 + (ch.h * 2 - 28) * k / 16, bl, br);
      if (forkSide && p.y > FORK_Y0 - 1500 && p.y < FORK_Y0 + 400) { const c2 = centre(FORK_Y0 + 400); x = clamp(c2 + forkSide * (30 + 120 * k / 16), EDGE, VIEW_W - EDGE); }
      let s = -Math.abs(x - p.x) * 0.08 - Math.abs(x - ch.c) * 0.02;
      for (const e of this.ents) {
        const dy = e.y - p.y; if (dy < -20 || dy > look || e.dead) continue;
        const near = Math.abs(e.x - x) < e.r + 18, w = 1 - dy / 500;
        if (e.t === 'sugar' && Math.abs(e.x - x) < 26) s += 30 * w * (p.e < p.maxE - 8 ? 1 : 0.2);
        else if (e.t === 'dna' && Math.abs(e.x - x) < 26) s += 20 * w;
        else if (e.t === 'acid' && near) s -= 70 * w;
        else if (e.t === 'goo' && near) s -= 40 * w;
        // (the test bot dashes through a dozing POPCORN PATCH like a person would: with a dash ready it aims at a cell)
        else if (e.t === 'wbc' && e.popcorn && !e.setpiece && popDash && Math.abs(e.x - x) < e.r) s += 250 * w;
        else if (e.t === 'wbc' && Math.abs(e.x - x) < e.r + 40) s -= 200 * w;
        else if (e.t === 'gate' && dy < 300) { if (!e.gaps.some((g) => Math.abs(g - x) < e.gw / 2 - 12)) s -= 400 * w; }
        else if (e.t === 'cilia' && dy < 200 && Math.abs(x - e.x) < e.r + 10) s -= 50 * w;
      }
      if (s > bestS) { bestS = s; best = x; }
    }
    // currents: lean 50 into the push (it still drifts you a bit: the autopilot fights it, badly)
    for (const e of this.ents) if (e.t === 'current' && p.y + 60 > e.y && p.y < e.y + e.h) { best = clamp(best - 50 * e.dir, bl, br); break; }
    if (H) { best = clamp(best + gauss(this.hrng) * H.aimSd, bl, br); this.hNext = this.t + H.lag; this.hTx = best; }
    this.input.tx = best;
    this.input.dash = p.e > 60 && p.dashCd <= 0 && p.stuck <= 0;
    if (popDash) {
      // (and holds a ready dash for a patch just ahead, then fires it into the patch)
      let hold = false, go = false;
      for (const e of this.ents) {
        if (!e.popcorn || e.setpiece || e.dead) continue;
        const dy = e.y - p.y;
        if (dy > 40 && dy < 140 && Math.abs(e.x - p.x) < 40) go = true; else if (dy >= 140 && dy < 600) hold = true;
      }
      if (go) this.input.dash = true; else if (hold) this.input.dash = false;
    }
    if (H) { if (this.input.dash && this.t - this.hDashAt >= H.dashEvery) this.hDashAt = this.t; else this.input.dash = false; }
    // the test bot plays like a person: with a named rival just ahead it cashes its chain in (a FINISHER), which also
    // opens REBOUND (cash, slingshot, rival). The sat-nav never cashes in.
    if (this.bot && p.combo >= 3 && p.bank >= 10) for (let k = 0; k < RIVALS.length; k++) { const a = this.agents[k], dy = a.y - p.y; if (a.alive && !a.arrived && dy > 80 && dy < 400 && (p.y < FORK_Y0 || a.side === p.side)) { this.input.cashOut = true; break; } }
  }

  // ---------------------------------------------------------------- one simulation step
  // the NaN firewall: a step that leaves Kevin's position, speed, tank or combo timer non-finite is rolled back to the
  // values it started with (and simFault {} is emitted once a swim), so one bad number never freezes or ends a run
  step(dt) { return this.guarded(dt, this.stepSim); }
  stepDrill(dt) { return this.guarded(dt, this.stepDrillSim); }
  // (it also rolls back the fields the same step derives from them: the best chains, the overtakes, the dash cooldown
  // (a NaN there is a permanent dash lockout), the shield timer, the tank size and the run's DNA ledgers (a NaN there
  // zeroed the swim's pay and the save's lifetime best chain). The swimmers are checked where they move (stepAgents:
  // only the ones that moved this step) and the drill's me / need here. A value that was already broken before the
  // step falls back to a sane one)
  guarded(dt, fn) {
    const p = this.p, x = p.x, y = p.y, vx = p.vx, vy = p.vy, e = p.e, ct = p.comboT, cb = p.combo, bk = p.bank, fz = p.frenzyT;
    const bc = p.bestCombo, bl = p.bestComboLate, ov = p.overtakes, dcd = p.dashCd, inv = p.inv, mx = p.maxE;
    const dr = this.dnaRun, db = this.dnaBank, dbo = this.dnaBonus, dfc = this.dnaFromCombo;
    const d0 = this.drill, dme = d0 ? d0.me : 0, dneed = d0 ? d0.need : 0;
    this.stepId++; this._agFault = false;
    const out = fn.call(this, dt);
    let fault = this._agFault;
    if (!(fin(p.x) && fin(p.y) && fin(p.vx) && fin(p.vy) && fin(p.e) && fin(p.comboT) && fin(p.combo) && fin(p.bank) && fin(p.frenzyT)
      && fin(p.bestCombo) && fin(p.bestComboLate) && fin(p.overtakes) && fin(p.dashCd) && fin(p.inv) && fin(p.maxE)
      && fin(this.dnaRun) && fin(this.dnaBank) && fin(this.dnaBonus) && fin(this.dnaFromCombo))) {
      p.x = ok(x, VIEW_W / 2); p.y = ok(y, ok(this.prevPY, this.startY)); p.vx = ok(vx, 0); p.vy = ok(vy, 0); p.e = ok(e, 50);
      p.comboT = ok(ct, 0); p.combo = ok(cb, 0); p.bank = ok(bk, 0); p.frenzyT = ok(fz, 0);
      p.bestCombo = ok(bc, 0); p.bestComboLate = ok(bl, 0); p.overtakes = ok(ov, 0); p.dashCd = ok(dcd, 0); p.inv = ok(inv, 0); p.maxE = ok(mx, 100);
      this.dnaRun = ok(dr, 0); this.dnaBank = ok(db, 0); this.dnaBonus = ok(dbo, 0); this.dnaFromCombo = ok(dfc, 0);
      fault = true;
    }
    const d = this.drill;
    if (d && !(fin(d.me) && fin(d.need))) {
      d.me = d === d0 && fin(dme) ? dme : ok(d.head, 0); d.need = d === d0 && fin(dneed) ? dneed : this.playerNeed();
      fault = true;
    }
    if (fault && !this.simFault) { this.simFault = true; this.emit('simFault', {}); }
    return out;
  }
  stepSim(dt) {
    if (!(dt > 0) || dt > 0.25) return;
    if (this.over || this.pending || this.paused) return;
    this.t += dt;
    if (this.autopilot && !this.bot) this.autoT += dt;
    const p = this.p, s = this.s;
    if (this.tuckPending) { this.tuckPending = false; this.emit('slingReady', { x: p.x, y: p.y }); this.perkFire('tuckIn'); }
    if (!this.featuredSent) {
      this.featuredSent = true;
      if (this.demo) this.featuredTrick = null;        // (main.js flags the title demo after it builds the race)
      if (this.featuredTrick) this.emit('featuredTrick', { id: this.featuredTrick });
    }
    if (!this.threatSent) {
      this.threatSent = true; if (this.threatK >= 0) this.emit('threat', { k: this.threatK, boss: RIVALS[this.threatK].name });
      if (this.dailyRule) { const E = RACE_EVENTS[this.dailyRule]; this.emit('dailyRule', { id: this.dailyRule, name: E.name, text: E.text, zones: E.zones.slice() }); }
    }
    if (this.drill) { this.input.cashOut = false; this.stepDrillSim(dt); return; }   // (already inside the firewall)
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
    if (p.combo > 0) {
      p.comboT -= dt * (p.frenzyT > 0 ? 1 : p.draft > 0.08 ? DRAFT_DRAIN : p.dashT > 0 ? DASH_DRAIN : 1);
      if (this.cap.memory && p.frenzyT > 0 && p.comboT < CAP_MEMORY_FLOOR) { p.comboT = Math.min(CAP_MEMORY_FLOOR, p.comboMax); this.capFire('memory'); }   // Long Memory's capstone
      if (p.comboT <= 0) this.dropCombo();
    }
    const frenzy = p.frenzyT > 0, nitro = frenzy && this.muts.nitro, tier = frenzy ? p.tier : 0;
    const safe = nitro || tier >= 5;            // nothing can hurt you
    const kSneeze = this.evK('sneeze'), kSlip = this.evK('slipstream'), kEsp = this.evK('espresso');

    // dash
    const jet = this.syn.jetstream && p.draft > 0.08;
    // greenMachine: the first dash of each zone costs no GAS
    const green = !!this.perks.greenMachine && this.gmZone !== zi && !nitro && !jet;
    if (this.input.dash && p.dashCd <= 0 && (p.e > s.dashCost || nitro || jet || green)) {
      p.dashT = (jet ? 0.85 : 0.55) * s.dashLen; p.dashCd = s.dashCd; if (!nitro && !jet && !green) { p.e -= s.dashCost; this.gasOther += s.dashCost; }
      if (green) { this.gmZone = zi; this.perkFire('greenMachine'); }
      if (this.syn.afterburner && p.frenzyT > 0) p.frenzyT = Math.min(p.frenzyT + 0.3, s.frenzyLen * 2);
      p.actT = 0; p.slingOK = true; p.dashN++; p.dashRefund = 0; p.dashAt = this.t;
      // (free: a Nitro or Jetstream dash that cost no GAS, so the HUD never shows a GAS chip for it)
      this.emit('dash', { jet, free: !!(nitro || jet || green) });
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
      if (p.lastTx == null || Math.abs(tx - p.lastTx) >= 1) p.txT = this.t;     // (the swerve kick: when the target last moved)
      p.lastTx = tx;
    }
    if (p.draft > 0.1 && steer != null) p.actT = 0;       // holding a draft counts while you steer, not while you drift
    // the first swim's rank hold ends on the first real input (a steer ROOKIE_HOLD_DX from the spawn, or a dash), or after
    // ROOKIE_HOLD_CAP s at the latest
    if (this.rankHold && this.surgeAt < 0 && (p.dashN > 0 || (tx != null && Math.abs(tx - this.spawnX) >= ROOKIE_HOLD_DX) || this.t >= ROOKIE_HOLD_CAP)) this.surgeAt = this.t;
    // bullet time favours the thumb: x steerK on the sideways cap and response (never on the autopilot)
    let sk = this.input.steerK;
    if (!Number.isFinite(sk)) sk = this.input.steerK = 1;
    sk = this.autopilot ? 1 : clamp(sk, 1, STEER_K_MAX);
    // the gate funnel: a thumb aimed just off a goo gate's gap is eased into it (see gateFunnel)
    const funnel = touch && steer != null ? this.gateFunnel(tx) : 0;
    let want = 0;
    if (tx != null) {
      want = ((funnel ? tx + (this.funG - tx) * this.funK : tx) - p.x) * (touch ? 26 : 9);
      if (touch) want -= p.vx * 0.45;
      // a finger at speed can move further sideways (last step's forward speed, up to x1.7). SWERVE KICK: a finger that
      // just moved (within SWERVE_FRESH s) to a target more than SWERVE_DX off gets x SWERVE_K on the cap for SWERVE_T s.
      // Keys and the autopilot keep STEER_CAP_KEYS
      if (touch && Math.abs(tx - p.x) > SWERVE_DX && this.t - p.txT <= SWERVE_FRESH) p.swerveT = SWERVE_T;
      const cap = (touch ? (p.dashT > 0 ? STEER_CAP_DASH : STEER_CAP_TOUCH) * clamp(p.vy / 445, 1, 1.7) * (p.swerveT > 0 ? SWERVE_K : 1) : STEER_CAP_KEYS) * sk;
      want = clamp(want, -cap, cap);
    }
    p.vx += (want - p.vx) * Math.min(1, dt * (touch ? 30 : 12) * sk);
    if (p.swerveT > 0) p.swerveT = Math.max(0, p.swerveT - dt);
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
    // (feel hooks, once per tuck-in: draftOn {x, y, id, k} at DRAFT_ON s, slingReady {x, y} when the sling loads)
    if (p.draft > 0.08) {
      if (!(p.draftHold > 0)) p.draftN++;
      const held0 = p.draftHold || 0; p.draftHold = held0 + dt; p.draftT = this.t;
      if (held0 < DRAFT_ON && p.draftHold >= DRAFT_ON) this.emit('draftOn', { x: p.x, y: p.y, id: target ? this.agents.indexOf(target) : -1, k: target && target.boss ? target.k : -1 });
      if (p.draftHold >= SLING_HOLD && held0 < SLING_HOLD) { p.slingOK = true; this.emit('slingReady', { x: p.x, y: p.y }); }
      // (the trick step counts from DRAFT_ON: a tuck-in that held is a draft for TAILGATE, the slingshot still needs SLING_HOLD)
      if (p.draftHold >= DRAFT_ON) this.seqPush('draft');
    } else p.draftHold = 0;
    // the draft magnet: a thumb holding still (the steer offset moved under 12 in the last 0.25 s) behind a drafted
    // rival is pulled onto its line (up to DRAFT_MAG px/s), so a phone-sized thumb can hold a draft
    let mag = 0;
    if (target && touch && steer != null && this.t - p.magT >= 0.25) mag = clamp((this.agentX(target) - p.x) * 8, -DRAFT_MAG, DRAFT_MAG);

    // currents: a real sideways push; swimming with it is a little faster, against it a little slower
    let cur = null;
    for (const e of this.ents) if (e.t === 'current' && p.y > e.y && p.y < e.y + e.h) { cur = e; break; }
    p.current = cur ? (p.vx * cur.dir > 30 ? 1 : p.vx * cur.dir < -30 ? -1 : 0) : 0;

    // forward speed
    let sp = s.speed * (1 + p.draft + (tier ? FRENZY_TIERS[Math.min(tier, FRENZY_TIERS.length) - 1].speed + OVERCLOCK_SPEED * p.oc : 0) + (p.dashT > 0 ? 0.75 : 0));
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
    if (this.cap.tank && p.e > CAP_TANK_AT * p.maxE) { sp *= 1 + CAP_TANK_SP; this.capFire('tank'); }   // Big Fructose Tank's capstone
    let inAcid = false, inGoo = false, acidE = null;
    for (const e of this.ents) {
      const dy = e.y - p.y; if (dy > 200 || dy < -200) continue;
      if (e.t === 'acid' || e.t === 'goo') {
        // near misses pay on the way OUT: brushed the edge, never touched the middle
        const d = Math.hypot(e.x - p.x, (e.y - p.y) * 1.3);
        // a pulse rim that swelled onto Kevin spares him (SWELL_SPARE s, or while he stays outside its core)
        if (d < e.r && e.pulse && e.swellT != null && (this.t - e.swellT < SWELL_SPARE || d >= e.r0 * PULSE_MIN)) {
          if (!e.touched && !e.paid) { e.paid = 1; this.nearMiss(e.x, e.y); }
        } else if (d < e.r) {
          if (e.t === 'acid') { inAcid = true; acidE = e; }
          else { inGoo = true; if (!e.touched) this.emit('gooIn', { x: p.x, y: p.y, surf: !!this.muts.goo }); }   // (once a blob: e.touched)
          e.touched = 1;
          if (this.syn.hazmat && !e.paid) { e.paid = 1; this.nearMiss(e.x, e.y); }   // Hazmat: a touch is a near miss
        }
        else if (d < e.r + 18) { e.near = 1; e.minGap = Math.min(e.minGap ?? Infinity, d - e.r); }
        if (e.near && !e.touched && !e.paid && p.y - e.y > e.r * 0.8) { e.paid = 1; this.nearMiss(e.x, e.y, e.minGap); }
      }
    }
    if (inAcid && !safe && tier < 4) {
      // softLanding: the first puddle of each zone burns at PERK_SOFT
      let soft = 1;
      if (this.perks.softLanding && (acidE.soft || this.softZone !== zi)) { if (!acidE.soft) { acidE.soft = 1; this.softZone = zi; this.perkFire('softLanding', acidE.x, acidE.y); } soft = PERK_SOFT; }
      sp *= 0.8; p.e -= s.acid * dt * soft; this.gasOther += s.acid * dt * soft; p.acid = 1; p.acidT = this.t; p.lastHit = 'acid'; } else p.acid = Math.max(0, p.acid - dt * 2);
    // p.goo mirrors p.acid for the renderer (1 inside a goo blob, fading at 2/s); over.gooTime: the seconds it slowed you
    if (inGoo) { sp *= this.muts.goo ? 0.9 : 0.5; p.goo = 1; this.gooTime += dt; } else p.goo = Math.max(0, p.goo - dt * 2);
    if (p.stuck > 0) sp *= 0.15;
    if (p.swatSlow > 0) { sp *= SWAT_SLOW; p.swatSlow = Math.max(0, p.swatSlow - dt); }
    p.vy = sp;

    // move, gates, walls
    this.prevPY = p.y;
    let ny = p.y + p.vy * dt;
    for (const e of this.ents) {
      if (e.t !== 'gate') continue;
      if (e.bonkT > 0) e.bonkT -= dt;
      if (e.slide) { const o = e.slide * Math.sin(this.t * TAU * SLIDE_HZ + e.sph); for (let k = 0; k < e.gaps.length; k++) e.gaps[k] = clamp(e.g0[k] + o, e.lo, e.hi); }
      if (e.close) e.gw = closeGw(e.gw0, this.t * TAU / CLOSE_T + e.cph);
      if (p.y >= FORK_Y0 && e.side && e.side !== p.side) continue;
      const inGap = e.gaps.some((g) => Math.abs(g - p.x) < e.gw / 2 - 6);
      // contact: time spent pressed against this wall (bonked back or pinned), for the mercy squelch
      if (!inGap && e.bonked && p.y >= e.y - 24 && p.y < e.y - 9 && !this.muts.goo && !safe) e.contact = (e.contact || 0) + dt;
      if (!e.squelch && !inGap && p.y < e.y - 9 && ny >= e.y - 9) {
        if (this.muts.goo || safe) { if (!e.surf) { e.surf = 1; this.emit('surf', { x: p.x, y: e.y }); } continue; }
        if (e.contact >= 1.2) { e.squelch = 1; e.passed = 1; this.emit('surf', { x: p.x, y: e.y, squelch: true }); continue; }   // mercy: you ooze through
        if (!(e.bonkT > 0)) { e.bonkT = 0.7; e.bonked = 1; p.stuck = this.gateStuck(); p.vy = 0; p.zoneBonks++; p.hits++; p.lastHit = 'bonk'; ny = e.y - 22; this.emit('bonk', { x: p.x, y: e.y }); this.breakCombo('bonk', p.x, e.y); }
        else ny = Math.max(p.y, e.y - 9.5);          // still pinned: hold quietly
        break;
      } else if (p.y < e.y && ny >= e.y && !e.passed) { e.passed = 1; this.addCombo('gate', p.x, e.y); }
    }
    p.y = ny;
    p.x += (p.vx + mag + funnel) * dt;
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
    const ecoFz = this.cap.eco && p.frenzyT > 0;     // Lazy Wiggle's capstone: FRENZY drains no GAS
    if (ecoFz) this.capFire('eco');
    if (!couch && !ecoFz) { const dr = s.drain * zoneDrain(zi) * dt * (drafting ? 0.65 : 1) * (1 + 0.25 * kEsp) * (zi < EGG_I ? this.drainK : 1); p.e -= dr; this.gasDrain += dr; }
    if (p.frenzyT > 0) this.fzTime += dt;
    if (this.muts.draft && p.draft > 0.1) p.e += 1.2 * this.muts.draft * dt;
    if (this.cap.draft && p.draft > 0.08) { p.capDraftT += dt; if (p.capDraftT >= CAP_DRAFT_T) { p.capDraftT -= CAP_DRAFT_T; this.addCombo('draft', p.x, p.y); this.capFire('draft'); } }   // Slipstream Pro's capstone
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
        if (this.syn.comeback) { const base = p.frenzyT > 0 ? p.tier : 0; p.comeback = 1; this.refreshStats(); p.frenzyT = Math.max(p.frenzyT, this.s.frenzyLen); p.tier = Math.max(p.tier, 1); p.fz = Math.max(p.fz, 1); p.frenzyTier = Math.max(p.frenzyTier || 0, p.tier); this.perkFrenzy(); this.emitFrenzy({ n: p.combo, first: true, tier: p.tier, name: FRENZY_TIERS[p.tier - 1].name, comeback: true }, base); }
      }
      else if (this.firstNormal && this.rookie) {
        // the very first swim always reaches the duel: an empty tank there is a slow, wheezing refill, never the end
        p.e = FIRST_SWIM_REFILL; p.inv = Math.max(p.inv, 1); this.emit('second', { reserve: false, free: true, first: true });
      }
      else return this.end(wrongTube ? 'wrong' : 'energy');
    }
    // the wrong tube is a dead end: the backflow spits you out at the fork exit, dizzy and drained
    if (wrongTube && p.y >= DEAD_Y - 40) {
      this.emit('backflow', { x: p.x, y: p.y });
      p.e -= 25; this.gasOther += 25;
      if (p.e <= 0 && this.firstNormal && this.rookie) p.e = FIRST_SWIM_REFILL;      // (the first swim always reaches the duel)
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

  // the GATE FUNNEL: the next unpassed goo gate on Kevin's side FUNNEL_NEAR..FUNNEL_FAR ahead, Kevin just outside a gap
  // (out of its pass window but within gw/2 + FUNNEL_REACH of its centre) and the thumb aimed near him (within
  // FUNNEL_AIM): the funnel latches onto that gap (e.fun: its index) until the gate is passed or the thumb aims away.
  // While latched, a sideways pull toward the gap's centre (FUNNEL_K a unit off it, up to FUNNEL_MAX px/s) times
  // k = 1 - dy / FUNNEL_FAR, and the steer aim leans toward the gap by the same k, so the thumb and the funnel never
  // fight. Returns the pull in px/s (0: no funnel); this.funG / this.funK hold the gap centre and k for the steer.
  gateFunnel(tx) {
    const p = this.p;
    if (tx == null) return 0;
    let gate = null, gdy = Infinity;
    for (const e of this.ents) {
      if (e.t !== 'gate' || e.passed || e.squelch || e.dead || e.bonked) continue;
      if (p.y >= FORK_Y0 && e.side && e.side !== p.side) continue;
      const dy = e.y - p.y; if (dy < (e.fun >= 0 ? 0 : FUNNEL_NEAR) || dy > FUNNEL_FAR || dy >= gdy) continue;
      gate = e; gdy = dy;
    }
    if (!gate) return 0;
    if (Math.abs(tx - p.x) > FUNNEL_AIM) { gate.fun = -1; return 0; }        // the thumb aims away: it is in charge
    if (!(gate.fun >= 0)) {
      if (gdy < FUNNEL_NEAR || gate.gaps.some((g) => Math.abs(g - p.x) < gate.gw / 2 - 6)) return 0;
      let bi = -1;
      for (let i = 0; i < gate.gaps.length; i++) { const d = Math.abs(gate.gaps[i] - p.x); if (d <= gate.gw / 2 + FUNNEL_REACH && (bi < 0 || d < Math.abs(gate.gaps[bi] - p.x))) bi = i; }
      if (bi < 0) return 0;
      gate.fun = bi;
    }
    const g = gate.gaps[gate.fun], k = 1 - Math.max(0, gdy) / FUNNEL_FAR;
    if (!Number.isFinite(g)) { gate.fun = -1; return 0; }
    this.funG = g; this.funK = k;
    return clamp((g - p.x) * FUNNEL_K, -FUNNEL_MAX, FUNNEL_MAX) * k || 1e-9;
  }

  // ---------------------------------------------------------------- combos
  // one link in the chain. n links at once (Chain Reaction doubles, Slick Moves adds).
  // (extra: fields added to the 'combo' event, e.g. {gap} on a graded near miss)
  addCombo(kind, x, y, n = 1, extra = null) {
    this.linkCombo(kind, x, y, n, extra);
    // (a plain pass is neutral filler: it never opens, breaks or finishes a trick)
    if (kind !== 'trick' && kind !== 'pass') this.seqPush(kind, x, y);
  }
  // the combo timer's full length right now: longer in ULTRA FRENZY+ and the Disco Tube, shorter on a long chain
  comboMaxOf(p = this.p) {
    const tierLong = p.frenzyT > 0 && p.tier >= 3 ? 1.5 : 1, disco = 1 + 0.5 * this.evK('disco');
    return this.s.combo * tierLong * disco * comboHeat(p.combo);
  }
  // SIGNATURE TRICKS: every recipe in progress is its own thread (this.trickThreads: {T, s: [{k, t, c}]}), so a link that
  // fits no recipe, or opens another one, never shifts a recipe in progress out. A kind advances every live thread whose
  // next step it is (live: its first step younger than TRICK_T) and opens a thread for every recipe it starts that has
  // no live one. Any other kind is a plain pass for the strip: no push, timestamps untouched. A repeat of a thread's
  // last kind only refreshes that step's t. The first thread to finish fires its trick; all threads end, and the
  // trick's last link (unless it is 'cash') opens the next ones as a carried step (c: 1): the FLOW.
  // race.p.seq is the trick strip main.js draws: the steps of the most advanced live thread ({k, t, c}, oldest first,
  // at most 2); a comboBreak and a loseCombo empty it and every thread.
  seqPush(kind, x, y) {
    const p = this.p, t = this.t, th = this.trickThreads;
    let fired = null, changed = false;
    for (let i = 0; i < th.length; i++) {
      const h = th[i], n = h.s.length, last = h.s[n - 1];
      if (t - h.s[0].t > TRICK_T) continue;
      if (last.k === kind) { last.t = t; changed = true; continue; }
      const want = h.T.kinds[n];
      if (want !== kind && TRICK_ALIAS[kind] !== want) continue;
      if (!stepOK(h.T, h.s, n, t, kind)) continue;
      if (n === 2) { if (!fired) fired = h; continue; }
      h.s.push({ k: want, t, c: 0 }); changed = true;
    }
    if (fired) {
      const T = fired.T;
      this.clearTricks();
      if (T.kinds[2] !== 'cash') this.openTricks(T.kinds[2], 1);
      this.showTricks();
      this.trick(T, x != null ? x : p.x, y != null ? y : p.y);
      return;
    }
    if (this.openTricks(kind, 0)) changed = true;
    if (changed) this.showTricks();
  }
  // open a thread for every recipe kind starts that has no live thread (a stale one is reused); true if any opened
  openTricks(kind, c) {
    const th = this.trickThreads, t = this.t; let any = false;
    for (const T of TRICKS) {
      if (T.kinds[0] !== kind && T.kinds[0] !== TRICK_ALIAS[kind]) continue;
      let h = null;
      for (const g of th) if (g.T === T) { h = g; break; }
      if (h && t - h.s[0].t <= TRICK_T) continue;
      const k0 = T.kinds[0];
      if (h) { h.s.length = 0; h.s.push({ k: k0, t, c }); } else th.push({ T, s: [{ k: k0, t, c }] });
      any = true;
    }
    return any;
  }
  clearTricks() { this.trickThreads.length = 0; if (this.p.seq) this.p.seq.length = 0; }
  // p.seq: the steps of the most advanced live thread (the latest one on a tie)
  showTricks() {
    const q = this.p.seq || (this.p.seq = []), t = this.t; let best = null;
    for (const h of this.trickThreads) if (t - h.s[0].t <= TRICK_T && (!best || h.s.length > best.s.length || (h.s.length === best.s.length && h.s[h.s.length - 1].t >= best.s[best.s.length - 1].t))) best = h;
    q.length = 0; if (best) for (const e of best.s) q.push(e);
  }
  trick(T, x, y) {
    const p = this.p, M = this.meta, run = this.tricksRun || (this.tricksRun = {}), chain = p.trickChain || (p.trickChain = {});
    const first = !run[T.id], repeat = !!chain[T.id];
    run[T.id] = (run[T.id] || 0) + 1; chain[T.id] = 1;
    // per-run fatigue: the same trick again this run pays less (trickFatigue), from the TRICK_TIRED-th no bank growth and
    // no FRENZY time
    const kRun = trickFatigue(run[T.id]), tired = run[T.id] >= TRICK_TIRED, k = (repeat ? 0.5 : 1) * kRun;
    // TRICK STREAK: a different trick within TRICK_STREAK_T s of the last one climbs it, anything else resets it
    p.trickStreak = p.lastTrick && p.lastTrick !== T.id && this.t - p.lastTrickT <= TRICK_STREAK_T ? p.trickStreak + 1 : 0;
    p.lastTrick = T.id; p.lastTrickT = this.t;
    const sm = trickStreakMult(p.trickStreak);
    const featured = this.featuredTrick === T.id, medley = p.trickStreak === MEDLEY_AT;
    const n = (TRICK_LINKS + (first ? TRICK_FIRST : 0)) * k * sm * (featured ? FEATURED_K : 1) + (medley ? MEDLEY_LINKS : 0);
    if (!tired) p.trickMult = Math.min(TRICK_MULT_CAP, Math.round(((p.trickMult || 0) + TRICK_MULT * k) * 100) / 100);
    if (p.frenzyT > 0 && !tired) p.frenzyT = Math.min(p.frenzyT + TRICK_FRENZY * k + (p.trickStreak >= 2 ? TRICK_STREAK_FRENZY : 0), this.s.frenzyLen * 2);
    let firstEver = false;
    if (M && M.tricks && typeof M.tricks === 'object') {
      firstEver = !(M.tricks[T.id] > 0);
      M.tricks[T.id] = (M.tricks[T.id] || 0) + 1;
      if (firstEver) { this.dnaRun += TRICK_DNA; this.dnaBonus += TRICK_DNA; }
    }
    this.emit('trick', { id: T.id, n, first, repeat, kinds: T.kinds.slice(), firstEver, x, y, mult: p.trickMult, streak: p.trickStreak, featured });
    if (p.trickStreak > 0) this.emit('trickStreak', medley ? { n: p.trickStreak, x, y, mult: sm, medley: true } : { n: p.trickStreak, x, y, mult: sm });
    this.linkCombo('trick', x, y, n);
    // MEDLEY: five different tricks in a row light FRENZY, or climb a running one a tier
    if (medley) {
      if (!(p.frenzyT > 0)) this.igniteFrenzy('medley');
      else {
        const was = p.tier, top = Math.min(p.oc >= MEDLEY_GOD_OC ? FRENZY_TIERS.length : FRENZY_TIERS.length - 1, this.tierCap(), styleTierCap(p.style));
        if (p.tier < top) { p.tier++; p.fz = Math.max(p.fz, p.tier); p.bestTier = Math.max(p.bestTier, p.tier); this.frenzyFanfare(false, was); this.overclock(x, y); }
      }
    }
  }
  linkCombo(kind, x, y, n = 1, extra = null) {
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
    const gain = LINK_DNA * n * p.mult * (1 + disco) * (1 + OVERCLOCK_DNA * p.oc);
    this.dnaRun += gain; this.dnaFromCombo += gain - LINK_DNA * n;
    const ce = this.emit('combo', { kind, n: Math.floor(p.combo), add: n, x, y, mult: p.mult, style: p.style, fresh, same: p.sameRun, clutch, passRun: p.passRun });
    if (extra) Object.assign(ce, extra);
    if (clutch) this.emit('clutch', { x, y, n: Math.floor(p.combo), mult: p.clutch });
    p.mileI = p.mileI || 0;
    if (!z0 && p.combo >= comboMilestoneAt(p.mileI)) {
      let top = 0, k = 0;
      while (p.combo >= comboMilestoneAt(p.mileI)) { top = comboMilestoneAt(p.mileI++); k++; }
      this.emitMilestone(top, k, x, y);
    }
    const pts = this.fzPoints(); p.fzPts = pts;
    if (pts >= this.frenzyThreshold(p.fz)) {
      const first = p.frenzyT <= 0, oldTier = p.tier, T = FRENZY_TIERS;
      while (pts >= this.frenzyThreshold(p.fz)) p.fz++;
      // a chain rebuilt mid FRENZY (after a cash-out or a timeout) never lowers the tier it is holding
      p.tier = Math.max(1, Math.min(p.fz, T.length, this.tierCap(), styleTierCap(p.style)), first ? 0 : p.tier);
      p.bestTier = Math.max(p.bestTier, p.tier);
      p.nextFrenzy = this.frenzyThreshold(p.fz);
      // lighting FRENZY fills it to frenzyLen; a tier climbed mid FRENZY (or a GOD MODE refresh) adds FRENZY_TIER_ADD s, up to frenzyLen
      p.frenzyT = first ? Math.max(p.frenzyT, s.frenzyLen) : Math.max(p.frenzyT, Math.min(s.frenzyLen, p.frenzyT + FRENZY_TIER_ADD));
      if (!first && p.tier === oldTier && p.fz <= T.length) { this.overclock(x, y); return; }     // capped: a quiet top-up, no fanfare
      this.frenzyFanfare(first, first ? 0 : oldTier);
    } else if (p.frenzyT > 0 && p.tier < Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), styleTierCap(p.style))) {
      // your STYLE caught up with a tier your chain already earned
      const was = p.tier;
      p.tier = Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), styleTierCap(p.style)); p.bestTier = Math.max(p.bestTier, p.tier);
      this.frenzyFanfare(false, was);
    }
    this.overclock(x, y);
  }
  // OVERCLOCK (see OVERCLOCK_STEP): the stacks the FRENZY points past HYPER have earned, while HYPER FRENZY runs
  overclock(x, y) {
    const p = this.p;
    if (!(p.frenzyT > 0) || p.tier !== 4 || p.oc >= OVERCLOCK_MAX) return;
    const at = this.s.frenzyAt, want = Math.min(OVERCLOCK_MAX, Math.floor((this.fzPoints() - at * FRENZY_TIERS[3].at) / (OVERCLOCK_STEP * at) + 1e-9));
    while (p.oc < want) {
      p.oc++;
      p.frenzyT = Math.max(p.frenzyT, Math.min(p.frenzyT + OVERCLOCK_ADD, this.s.frenzyLen));
      this.emit('overclock', { n: p.oc, x: x != null ? x : p.x, y: y != null ? y : p.y });
    }
  }
  // STYLE now: the STYLE_KINDS landed in the last STYLE_WINDOW s; the overtake kinds together count PASS_STYLE_MAX at most
  styleNow() {
    const KL = this.p.kindLast; let n = 0, pk = 0;
    if (KL) for (const k in KL) if (STYLE_KINDS.has(k) && this.t - KL[k] <= STYLE_WINDOW) { if (PASS_KINDS.has(k)) pk++; else n++; }
    return clamp(n + Math.min(pk, PASS_STYLE_MAX), 1, 6);
  }
  frenzyFanfare(first, base = 0) {
    const p = this.p, s = this.s, T = FRENZY_TIERS, ti = p.tier - 1;
    p.frenzyTier = Math.max(p.frenzyTier || 0, p.tier);     // held until 'frenzyEnd'
    if (first) this.perkFrenzy();
    this.emitFrenzy({ n: Math.floor(p.combo), first, tier: p.tier, name: T[ti].name, desc: T[ti].desc }, base);
    // re-entry guard: a tier climbed by the links this fanfare pays (Domino, Supernova pops) is announced, but
    // its own mosh / blast does not fire again inside this one
    if (this.inFanfare) return;
    this.inFanfare = true;
    try {
      if (this.muts.mosh) {
        let hit = 0;
        for (const a of this.agents) if (a.alive && !a.arrived && Math.abs(a.y - p.y) < 220) { a.kx += (this.agentX(a) < p.x ? -1 : 1) * 3; a.y -= 25; a.bumpT = 0.6; hit++; }
        if (hit && !this.syn.domino) this.seqPush('bump', p.x, p.y);      // (a knock is a 'bump' trick step; Domino links it below)
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
    p.frenzyT = 0; p.frenzyTier = 0; p.oc = 0;
    if (p.fzCarry) { p.fzCarry = 0; p.fz = this.tierOf(this.fzPoints()); p.fzPts = this.fzPoints(); p.nextFrenzy = this.frenzyThreshold(p.fz); }
    p.tier = Math.min(p.tier, p.fz > 0 ? Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), styleTierCap(p.style)) : 0);
    this.emit('frenzyEnd');
  }
  // light FRENZY right now (Comeback Kid, Bloodhound)
  igniteFrenzy(why) {
    const p = this.p, base = p.frenzyT > 0 ? p.tier : 0;
    p.frenzyT = Math.max(p.frenzyT, this.s.frenzyLen); p.tier = Math.max(p.tier, 1); p.fz = Math.max(p.fz, 1); p.bestTier = Math.max(p.bestTier, p.tier);
    p.frenzyTier = Math.max(p.frenzyTier || 0, p.tier);
    this.perkFrenzy();
    this.emitFrenzy({ n: Math.floor(p.combo), first: true, tier: p.tier, name: FRENZY_TIERS[p.tier - 1].name, desc: FRENZY_TIERS[p.tier - 1].desc, [why]: true }, base);
  }
  // the chain shrank: rebuild the FRENZY progress from it. While FRENZY runs the tier it reached is held
  // (p.frenzyTier, until 'frenzyEnd'): speed, GOD MODE, Nitro and double DNA never switch off mid FRENZY.
  // (wipe: the STYLE goes too (a drop, a break, a loss); a FINISHER keeps it: cashing in is a move, not a mistake)
  resetTier(keep, wipe = !keep) {
    const p = this.p;
    p.fz = this.tierOf(this.fzPoints()); p.fzPts = this.fzPoints();
    if (!(p.frenzyT > 0)) p.tier = Math.min(p.fz, FRENZY_TIERS.length, this.tierCap(), keep || !wipe ? styleTierCap(p.style) : 1);
    else p.tier = Math.max(p.tier, p.frenzyTier || 0);
    p.nextFrenzy = this.frenzyThreshold(p.fz); p.mult = comboMult(keep) * styleMult(p.style);
    p.mileI = milestonesUpTo(p.combo);     // a kept chain does not fire its milestones again
    if (!keep && wipe) { p.kindLast = {}; p.rep.length = 0; p.style = 1; p.mult = 1; p.sameRun = 0; p.lastKind = ''; }
  }
  // pay the bank (a run-out at x0.6, or a FINISHER at x1.3..2) and reset the clutch.
  // comboBank: {n, dna, grade (0..4), style, clutch, finisher, mult, blastN}
  payBank(fin, blastN = 0, buzzer = false) {
    const p = this.p;
    if (p.bank < 3) { p.bank = 0; p.clutch = 0; p.trickMult = 0; p.trickChain = {}; return 0; }
    const fm = fin ? finisherMult(p.style) + (buzzer ? BUZZER_K : 0) : this.s.keep > 0 ? 1 : TIMEOUT_BANK;
    const dna = bankDna(p.bank, p.style, p.clutch, p.trickMult) * (1 + this.evK('disco')) * fm;
    this.dnaRun += dna; this.dnaBank += dna;
    this.emit('comboBank', { n: Math.floor(p.bank), dna: Math.round(dna * 10) / 10, grade: bankGrade(p.bank), style: p.style, x: p.x, y: p.y, clutch: p.clutch,
      finisher: !!fin, mult: fm, blastN, trick: p.trickMult || 0, ...(buzzer ? { buzzer: true } : null) });
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
  // FINISHER (race.input.cashOut): bank the chain right now at x1.3 (x1.45 with STYLE 3, x1.7 with STYLE 4, x2 with STYLE 5+).
  // A bank of 25+ also BLASTS: pops the Big Macros around you and shoves rivals aside. The next chain starts
  // with a tenth of the bank (up to 8 links).
  cashOut() {
    const p = this.p, s = this.s, n = p.combo, bank = p.bank;
    if (n < 3 || bank < 3) return false;
    const big = bank >= FINISHER_BLAST_AT, R = finisherBlastR(bank);
    const blastN = big ? this.ents.filter((e) => !e.dead && e.t === 'wbc' && Math.abs(e.y - p.y) <= R && Math.hypot(e.x - p.x, e.y - p.y) <= R).length : 0;
    // BUZZER BEATER: cashed in the last BUZZER_AT of the timer
    const buzzer = p.comboT < BUZZER_AT * p.comboMax;
    this.payBank(true, blastN, buzzer);
    if (p.frenzyT > 0) p.frenzyT = Math.max(p.frenzyT, Math.min(p.frenzyT + 1.5, s.frenzyLen * 2));   // a finisher fans the flames
    const seed = finisherSeed(bank, buzzer ? BUZZER_SEED : 8);
    this.emit('comboEnd', { n: Math.floor(n), kept: seed, finisher: true, ...(buzzer ? { buzzer: true } : null) });
    // CASH TO CLIMB: in FRENZY the FRENZY points so far carry over (the new chain climbs on from them)
    p.fzCarry = p.frenzyT > 0 ? Math.max(0, this.fzPoints() - seed) : 0;
    p.fzPen = 0; p.combo = seed; p.bank = seed; p.comboMax = this.comboMaxOf(p); p.comboT = seed ? p.comboMax : 0;
    this.resetTier(0, false);              // (the STYLE and the kinds behind it stay: the next chain starts in style)
    p.mult = comboMult(seed) * styleMult(p.style);
    this.seqPush('cash', p.x, p.y);       // a finisher can open a trick (encore, rebound): no link, no STYLE kind
    if (big) {
      let shoved = 0;
      for (const a of this.agents) {
        if (!a.alive || a.arrived || Math.abs(a.y - p.y) > 180 || (p.y >= FORK_Y0 && a.side !== p.side)) continue;
        const ax = this.agentX(a); if (Math.abs(ax - p.x) > 180) continue;
        a.kx += (ax < p.x ? -1 : 1) * 3; a.bumpT = 0.6; shoved++;
      }
      // (a blast that shoves rivals is a 'bump' trick step, no link: cash, bump, pop... then a rival pass is DOMINO)
      if (shoved) this.seqPush('bump', p.x, p.y);
      this.blast(p.x, p.y, R, 'finisher');
    }
    return true;
  }
  // a combo got smashed (goo wall, a hit you survived): no bank, a quarter of it survives
  breakCombo(why, x, y) {
    const p = this.p, s = this.s, n = p.combo;
    if (p.frenzyT > 0 && n > 0 && (p.tier >= FRENZY_TIERS.length || this.muts.nitro)) return;   // GOD MODE and Nitro shrug it off
    this.clearTricks();                   // a smashed chain breaks the trick in progress too
    p.oc = 0;                             // and the OVERCLOCK
    p.fzCarry = 0;                        // and the FRENZY progress a finisher carried
    p.trickStreak = 0; p.lastTrick = ''; p.lastTrickT = D0;     // and the TRICK STREAK: a hit is never part of a streak
    if (n <= 0) return;
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
    p.bank = 0; p.clutch = 0; p.trickMult = 0; p.trickChain = {}; p.fzCarry = 0; p.oc = 0;
    this.clearTricks();
    p.trickStreak = 0; p.lastTrick = ''; p.lastTrickT = D0;
    if (n <= 0) return;
    p.fzPen = 0; p.combo = 0; p.comboT = 0; p.comboMax = this.s.combo;
    this.resetTier(0);
    this.emit('comboBreak', { n: Math.floor(n), kept: 0, why, x: x != null ? x : p.x, y: y != null ? y : p.y });
  }
  // (gap: the closest the edge came, px, when it is known: the 'combo' event carries it, so the UI can grade the shave)
  nearMiss(x, y, gap = null) {
    const sl = this.muts.slick || 0, p = this.p;
    if (sl) p.e += 2 * sl;
    if (this.syn.greased) p.dashCd = Math.max(0, p.dashCd - 0.6);
    this.addCombo('close', x, y, 1 + sl, gap != null && Number.isFinite(gap) ? { gap: Math.round(Math.max(0, gap) * 10) / 10 } : null);
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
  rivalNeed(a = null) {
    // the chase cap: CHASE_CAP + CHASE_EARLY s at gen 0, easing to CHASE_CAP by gen 8 (a far-off claim is a long chase, the hairy Rapids included)
    // (Kevin's own drill is the floor: a claim just ahead of him never needs less than he will)
    // (past the rookie runs the chase is in the claimer's own drilling seconds: a rival drilling x1.4 needs x1.4 the
    // chase, so a claim lasts as long as Kevin's swim to the egg whatever its training)
    const chase = clamp(this.remaining() / (CHASE_K * this.s.speed), 0, CHASE_CAP + CHASE_EARLY * clamp(1 - this.gen / 8, 0, 1));
    const base = this.playerNeed() + chase * (a && a.boss && !this.rookie ? Math.max(1, this.drillRate(a)) : 1);
    return this.drill ? Math.max(base, this.drill.need) : base;
  }
  // a rookie run's finale sprinters swim to the egg slower (rookieBossT) but drill faster (ROOKIE_SPRINT) and need only
  // what Kevin still needed after his head start (arrive):
  // a new player gets to see the egg and lose a photo finish before the egg-loss boost tips the scales
  // (never 0 or NaN: end() divides by it)
  drillRate(a) {
    const sk = this.drill && a.arrivedT >= this.drill.t0 ? ROOKIE_SPRINT_LATE : ROOKIE_SPRINT;
    const r = a.boss ? (this.rivalK || 1) * (a.boss.drill || 1) * (a.drillK || 1) * (a.sprint && this.finaleT != null ? 1 + sk * ((this.rookieBoss || 1) - 1) : 1) : 0.9;
    return r > 0.01 && Number.isFinite(r) ? r : 0.01;
  }
  // the player's drill: the base plus PLAYER_NEED_GEN per generation (to gen 8)
  playerNeed() { return EGG_DRILL + PLAYER_NEED_GEN * Math.min(this.gen, 8); }
  // +8% drill speed per egg lost in a row (eggBoostOf), times the losing-streak cushion (pepDrill)
  eggBoost() { return eggBoostOf(this.meta) * pepDrill(this.meta, this.daily); }
  arrivedBosses() { let n = 0; for (const b of this.agents) if (b.boss && b.alive && b.arrived) n++; return n; }
  arrive(a) {
    if (a.boss) a.eggSide = this.arrivedBosses() % 2 ? 1 : -1;     // the first to arrive takes the left, the second the right
    a.arrived = true; a.arrivedT = this.t; a.y = RACE_LEN - 70;
    // (a band-2 finale sprinter who gets there while Kevin drills needs FIN_LATE_CUT less than he did: a big lead is
    // a duel, not a walkover)
    a.need = a.sprint && this.rookieBoss > 1 && this.finaleT != null ? Math.max(EGG_DRILL, this.playerNeed()) - (this.drill ? this.drill.head : this.headStart())
      : a.sprint && this.finaleBand === 2 && this.drill ? this.lateSprintNeed(a) : this.rivalNeed(a);
    a.drill = 0; a.shoveT = 1.4;
    // a named rival that gets in while Kevin drills pulls its move on its own clock: its first tell LATE_MOVE_AT s after
    // it arrives (Brock's wind-up and Steve's sorry are moved up to match; the one-off moves read mv.pre false)
    if (this.drill && a.boss) {
      const mv = this.moveState(a);
      if (a.boss.move === 'maxRep') mv.c = MAXREP_EVERY - MOVE_TELL - LATE_MOVE_AT;
      if (a.boss.move === 'sorry') a.shoveT = LATE_MOVE_AT + MOVE_TELL;
    }
    const info = { boss: a.boss ? a.boss.name : null, k: a.boss ? a.k : -1 };
    if (!this.claimed) { this.claimed = a; this.emit('eggClaim', { ...info, col: a.boss ? a.boss.col : null, need: a.need, remaining: this.remaining() }); }
    else this.emit('arrive', info);
  }
  // the band-2 sprinter that gets in while Kevin drills: Kevin's drill less FIN_B2_HEAD_K of his duel head, in Kevin's own
  // drilling seconds (at his full tapping rate), turned into the rival's drill at its own rate: it finishes about as long
  // after Kevin as it got there, so a big lead is a duel decided in the last second
  lateSprintNeed(a) {
    const kRate = (DRILL_BASE + (this.p.frenzyT > 0 ? DRILL_FRENZY : 0) + DRILL_TAPS_MAX * DRILL_TAP) * this.eggBoost();   // (his rate right now, full taps)
    return Math.max(0.5, Math.max(EGG_DRILL, this.playerNeed()) - FIN_B2_HEAD_K * this.drill.head) * Math.max(1, this.drillRate(a) / kRate);
  }
  // an arrived rival drills; true when it gets in
  drillAgent(a, dt) {
    const mv = a.mv, cite = mv && mv.citeT > 0, dd = dt * this.drillRate(a) * (cite ? BOOK_CITE_K : 1) * (this.drill && this.drill.gasp === a ? this.gaspK : 1);
    a.drill += dd;
    // (the first swims: a claim parks until Kevin drills, see PARK_RUNS)
    if (this.parkClaims && !this.drill && a.drill > DRILL_ARRIVED_CAP * a.need) a.drill = DRILL_ARRIVED_CAP * a.need;
    // (a citation is provisional: she cannot get in until it resolves, so Kevin always gets his chance to void it)
    if (cite) { mv.citeGain += dd; if (a.drill >= a.need) { const over = a.drill - a.need * 0.999; a.drill -= over; mv.citeGain -= over; } }
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
    // a rival Kevin already passed (and is still behind him) is never put back in front: pick A only comes from
    // 'ahead'; a passed one can only be pick B (pulled up behind him). The sort above holds inside each group.
    const isAhead = (a) => !a.passedOnce || a.y > p.y, ahead = cand.filter(isAhead);
    // Kevin's lead: the soonest egg-side named rival's time to the egg minus his own
    const myT = this.remaining() / Math.max(1, s.speed);
    let bossT = Infinity; for (const a of cand) bossT = Math.min(bossT, Math.max(0, RACE_LEN - 70 - a.y) / Math.max(1, a.sp));
    const lead = isFinite(bossT) ? bossT - myT : 0;
    // (nobody left ahead: band 2, the one sprinter is B, whatever the lead)
    this.finaleLead = lead; this.finaleBand = !ahead.length ? 2 : lead < FIN_CLOSE || this.rookieBoss > 1 ? 0 : lead <= FIN_FAR ? 1 : 2;
    // a big lead brings no A at all: the one sprinter is B
    // (a rookie run always gets the classic finale: the first races are about seeing the egg and a photo finish)
    const band = this.finaleBand;
    const pickA = band === 2 ? null : ahead[0], pickB = cand.find((a) => a !== pickA);
    const picks = pickA ? (pickB ? [pickA, pickB] : [pickA]) : pickB ? [pickB] : [];
    picks.forEach((a) => {
      const i = a === pickA ? 0 : 1;
      // a rival you can see is never teleported: it just finds a sprint. Off screen, A is brought up to 700
      // ahead of you (300 at your speed when you lead by FIN_CLOSE+ s) and B is pulled up to 450 behind (never pushed back).
      if (Math.abs(a.y - p.y) < 650) a.sp = Math.max(a.sp, s.speed * (i === 0 && band === 1 ? 1 : 1.06));
      else {
        if (i === 0) a.y = band === 1 ? p.y + 300 : Math.max(a.y, p.y + 700);
        else if (a.y < p.y - (band === 2 ? FIN_B2_BEHIND : 450)) a.y = p.y - (band === 2 ? FIN_B2_BEHIND : 450);   // (band 2: the lone sprinter comes closer)
        a.sp = i === 0 && band === 1 ? s.speed : Math.max(a.sp, s.speed * 1.03);
      }
      a.sprint = 1; a.zoneEnd = -Infinity; a.met = true;
      sprinters.push(a.boss.name); ks.push(a.k);
    });
    // fallback: any other named rival right behind you finds a last gear
    for (const a of this.agents) if (a.boss && a.alive && !a.arrived && !picks.includes(a) && a.side === this.eggSide && p.y - a.y >= 0 && p.y - a.y <= 3000) { a.sp *= 1.18; a.sprint = 1; sprinters.push(a.boss.name); ks.push(a.k); }
    // nobody left to sprint (dead, lost in the wrong tube, all far behind) and nobody already drilling: a COMEBACK 500
    // behind you on the egg side. The finale is never a solo swim. One still swimming (lost in the wrong tube, or far
    // behind) always beats one that is gone, even the nemesis: among each, the nemesis first, else the strongest.
    // A rival eaten earlier only comes back when nobody is left swimming (how: 'eaten'; else how: 'tube')
    let comeback = 0, how = 'tube';
    if (!sprinters.length && this.arrivedBosses() === 0) {
      const pool = this.agents.filter((a) => a.boss && !a.arrived);
      const pick = (arr) => arr.filter((a) => rec(a) > 0).sort((a, b) => rec(b) - rec(a) || b.k - a.k)[0] || arr.slice().sort((x, y) => y.k - x.k)[0];
      const live = pick(pool.filter((x) => x.alive)), a = live || pick(pool.filter((x) => !x.alive));
      if (a) {
        if (!a.alive) how = 'eaten';
        Object.assign(a, { alive: true, side: this.eggSide, y: p.y - 500, sp: s.speed * 1.06, sprint: 1, zoneEnd: -Infinity, deathY: Infinity, met: true, diedT: 0 });
        a.lane = a.side * Math.abs(a.lane || 0.4); a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9);
        sprinters.push(a.boss.name); ks.push(a.k); comeback = 1;
      }
    }
    this.finaleT = this.t;
    this.emit('finale', comeback ? { sprinters, ks, comeback, how } : { sprinters, ks });
  }

  stepAgents(dt) {
    const p = this.p, rng = this.rng, kEsp = this.evK('espresso'), kSneeze = this.evK('sneeze');
    const evSp = (1 + 0.12 * kEsp) * (1 + 0.05 * this.evK('slipstream')), sneeze = kSneeze > 0;
    // a finger on the glass (input.finger) is playing even when it holds still
    const ramW = this.s.ramW, zone0 = this.zoneReached === 0, active = p.actT < IDLE_T || this.input.finger === true;
    // Bloodhound: overtakes in the zone after the Fork count double (on the right side)
    const hound = this.syn.bloodhound && this.zoneReached === FORK_I + 1 && p.side === this.eggSide ? 2 : 1;
    // Turbo Tail's capstone, TORPEDO: an overtake at full speed (nothing slowing Kevin under his base speed) is +1 link
    const torp = this.cap.turbo && p.vy >= this.s.speed - 1e-6 ? 1 : 0;
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
      // a big lead (finale band 2): the lone sprinter keeps Kevin's real pace (dashes and FRENZY too), so it gets to the
      // egg FIN_B2_BEHIND / speed s after him and the duel is a duel
      if (a.sprint && this.finaleBand === 2 && sp < p.vy) sp = p.vy;
      if (sneeze) a.kx += Math.sin(this.t * 2.6 + a.ph) * 1.5 * kSneeze * adt;
      const wasAhead = a.y > this.prevPY, y0 = a.y, k0 = a.kx;
      a.y += sp * adt;
      a.kx *= adt === dt ? kdamp : Math.pow(0.1, adt);
      // the NaN firewall, for the swimmers that moved: a non-finite move is undone (and its speed made sane)
      if (a.y !== a.y || a.kx !== a.kx) { a.y = y0; a.kx = k0; if (!(a.sp === a.sp)) a.sp = 430 * genSpeed(this.gen); this._agFault = true; }
      // a straggler is never lost before Kevin passes it (the zone roll above is still drawn, so the race's random
      // sequence never moves): an unpassed one that reaches its death row swims on; once passed (a.strag false) it may
      // go, STRAG_AFTER px past the row it was passed on at the earliest (no pop right under Kevin's nose)
      if (a.strag && a.y <= py) { a.strag = false; if (a.deathY < a.y + STRAG_AFTER) a.deathY = a.y + STRAG_AFTER; }
      if ((a.y >= a.deathY && !a.strag) || (a.side !== this.eggSide && a.y >= DEAD_Y)) { this.killAgent(a, 'pop'); continue; }
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
          if (p.dashT > 0 && p.dashRefund < DASH_REFUND_CAP) { const g = Math.min(DASH_REFUND, DASH_REFUND_CAP - p.dashRefund); p.dashRefund += g; p.e += g; }
          // Whiplash's capstone: a rival passed mid-dash resets the dash cooldown, once a dash
          if (this.cap.whip && p.dashT > 0 && p.whipN !== p.dashN) { p.whipN = p.dashN; p.dashCd = 0; this.capFire('whip', ax, a.y); }
          if (a.boss) {   // a named rival: 3 links and a +4 DNA bounty the first time, 1 link for every re-pass after that
            a.passT = 0.8;
            // (rivalLink: +1 link a named-rival pass)
            const rl = this.perks.rivalLink && active ? 1 : 0;
            if (!a.passedOnce) { a.passedOnce = 1; p.bossPasses++; if (active) this.addCombo('rival', ax, a.y, 3 * hound + rl + torp); this.dnaRun += 4; this.dnaBonus += 4; }
            else if (active) this.addCombo('rival', ax, a.y, hound + rl + torp);
            if (rl) this.perkFire('rivalLink', ax, a.y);
            if (torp && active) this.capFire('turbo', ax, a.y);
          }
          // a pass always moves you up, but it only links the chain while you are playing (p.actT < IDLE_T).
          // In the Launch Tube a link has to be earned: a dash, a slingshot out of THAT rival's draft, or a close shave.
          // The kind of link: a SLINGSHOT (dashing, or within 0.5 s of a draft), a WEAVE (the other side of your last
          // pass, within 1.2 s), a SNIPE (closer than 30), else a plain pass.
          else if (active && (!zone0 || p.dashT > 0 || (p.draft > 0.08 && this.t - a.draftedT < 1) || dx < 70)) {
            const side = ax < p.x ? -1 : 1;
            const fromDraft = this.t - p.draftT <= 0.5, sling = p.slingOK && (p.dashT > 0 || fromDraft);
            if (sling) p.slingOK = false;      // one slingshot per dash or per draft: the rest of a plow is plain passing
            // (a weave needs a real sideways move: 30+ between the two passes; a snipe is a rival you did not just draft)
            const kind = sling ? 'slingshot'
              : p.passSide && side !== p.passSide && this.t - p.passT <= 1.2 && Math.abs(p.x - p.passX) >= 30 ? 'weave'
              : dx < 30 && this.t - a.draftedT > 0.5 ? 'snipe' : 'pass';
            p.passSide = side; p.passT = this.t; p.passX = p.x;
            // (slingLink: a slingshot out of a draft is +1 link)
            const sl = sling && fromDraft && this.perks.slingLink ? 1 : 0;
            this.addCombo(kind, ax, a.y, hound + sl + torp);
            if (torp) this.capFire('turbo', ax, a.y);
            if (sl) this.perkFire('slingLink', ax, a.y);
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
    const real = Math.max(1, Math.round(rank));
    if (this.rankHold) {
      // the first swim: dead last until the first real input, then the FIRST SURGE blends to the real place in ROOKIE_SURGE_T s
      if (this.surgeAt < 0) this.rank = this.startRank;
      else {
        if (!this.surgeSent) { this.surgeSent = true; this.emit('firstSurge', { gained: Math.max(0, TOTAL_SWIMMERS - real) }); }
        const k = clamp((this.t - this.surgeAt) / ROOKIE_SURGE_T, 0, 1);
        this.rank = k >= 1 ? real : Math.max(1, Math.round(lerp(this.startRank, real, smooth(k))));
      }
    } else this.rank = this.t >= RANK_HOLD + RANK_BLEND ? real : Math.max(1, Math.round(lerp(this.startRank, real, clamp((this.t - RANK_HOLD) / RANK_BLEND, 0, 1))));
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
    // pulsing puddles (hazard step HZ_NEW.pulse+) breathe on the zone's beat
    const phase = (this.t * (ZONES[zoneIndex(p.y)].beat || 120) / 60) % 1;
    let drops = null;
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.drift) e.x = e.x0 + e.drift * Math.sin(this.t * TAU / DRIFT_T + e.dph);
      if (e.drop) {            // a dripper's glob: falls toward Kevin, then sits as a goo blob, then is gone
        if (e.fall > 0) { const d = Math.min(e.fall, DRIP_VY * dt); e.y -= d; e.fall -= d; }
        else if ((e.life -= dt) <= 0) { e.dead = 1; continue; }
      }
      if (e.drip && e.y - p.y < 900 && e.y - p.y > -50) {
        if (e.dripTell > 0) {
          e.dripTell -= dt;
          if (e.dripTell <= 0) { e.dripTell = 0; (drops || (drops = [])).push({ t: 'goo', x: e.dripX, y: e.y - 10, r: DRIP_R, seed: e.y % 9, drop: 1, fall: DRIP_FALL, life: DRIP_LIFE, side: e.side }); }
        } else if ((e.dripT -= dt) <= 0) {
          // the glob's column: a wall stretch at least DRIP_R + 8 off every gap's opening, nearest to Kevin's line
          const b = playBand(e.y, e.side || p.side), lo = b.l + DRIP_R, hi = b.r - DRIP_R; let best = null;
          for (let k = 0; k <= 12; k++) { const x = lo + (hi - lo) * k / 12; if (e.gaps.some((g) => Math.abs(g - x) < e.gw / 2 + DRIP_R + 8)) continue; if (best == null || Math.abs(x - p.x) < Math.abs(best - p.x)) best = x; }
          e.dripT += DRIP_EVERY;
          if (best != null && !e.passed) { e.dripX = best; e.dripTell = DRIP_TELL; this.emit('drip', { phase: 'tell', x: best, y: e.y, t: DRIP_TELL }); }
        }
      }
      if (e.pulse) {
        const r1 = e.r, dk = Math.hypot(e.x - p.x, (e.y - p.y) * 1.3);
        e.r = pulseR(e.r0, phase);
        if (r1 <= dk && dk < e.r) e.swellT = this.t;          // the growing rim passed over Kevin
        else if (dk >= e.r) e.swellT = null;                  // out of it: the next time is a new swell
      }
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (e.t === 'sugar' || e.t === 'dna' || e.t === 'shield' || e.t === 'alkali') {
        // the magnet: once caught (e.lat set: the reach and the side offset it was caught at, for the SNACK and capstone
        // rules) the pickup is pulled in Kevin's frame: it rides his own step first, then closes on him, so a pickup
        // caught far to the side at speed never trails behind him; held MAGNET_HOLD s inside the reach it is his
        let held = false;
        if (e.lat != null || d < magnet + e.r) {
          if (e.lat == null) { e.lat = Math.abs(dx); e.magD = d; e.magT = 0; }
          e.magT += dt; e.x += (p.vx || 0) * dt; e.y += (p.vy || 0) * dt;
          const k = Math.min(1, dt * 9); e.x -= (e.x - p.x) * k; e.y -= (e.y - p.y) * k;
          held = e.magT >= MAGNET_HOLD && d < magnet + e.r;
        }
        if (d < e.r + 12 || held) {
          e.dead = 1;
          // Sugar Magnet's capstone: a pickup caught from CAP_MAGNET_K x the base reach is a near miss
          if (this.cap.magnet && e.magD >= CAP_MAGNET_K * MAGNET_BASE) { this.nearMiss(e.x, e.y); this.capFire('magnet', e.x, e.y); }
          // a fruit sugar or a DNA blob also tops up a running chain (no link): a bridge
          if ((e.t === 'sugar' || e.t === 'dna') && p.combo > 0) {
            p.comboT = Math.min(p.comboMax, p.comboT + PICKUP_REFILL);
            // an aimed pickup (caught within PICK_AIM of Kevin's line) is a STYLE kind, as STYLE_KINDS says: no link
            if (!(e.lat > PICK_AIM)) { (p.kindLast || (p.kindLast = {}))[e.t] = this.t; p.style = this.styleNow(); p.mult = comboMult(p.combo) * styleMult(p.style); }
          }
          if (e.t === 'sugar') {
            if (p.e >= p.maxE - FULL_TANK) {     // a fruit at a full tank: overflow and berryBonus
              if (this.perks.overflow && p.combo > 0) { p.comboT = Math.min(p.comboMax, p.comboT + PERK_OVERFLOW_T); this.perkFire('overflow', e.x, e.y); }
              if (this.perks.berryBonus) { this.dnaRun += PERK_BERRY_DNA; this.dnaBonus += PERK_BERRY_DNA; this.perkFire('berryBonus', e.x, e.y); }
            }
            if (this.cap.sweet && p.frenzyT > 0) { p.frenzyT = Math.min(p.frenzyT + CAP_SWEET_FZ, s.frenzyLen * 2); this.capFire('sweet', e.x, e.y); }   // Sweet Tooth's capstone
            p.e += s.sugar; this.gasSugar += s.sugar; this.dnaRun += 0.02 * dnaMul; this.emit('sugar', { x: e.x, y: e.y }); if (e.gift) this.emit('gift', { x: e.x, y: e.y }); if (this.syn.sugarHigh) this.addCombo('sugar', e.x, e.y); else if (!(e.lat > PICK_AIM)) this.seqPush('sugar', e.x, e.y); }
          else if (e.t === 'dna') {
            const g = s.dnaBlob * dnaMul; this.dnaRun += g; this.dnaFromCombo += g - s.dnaBlob; this.emit('dna', { x: e.x, y: e.y, amount: Math.round(g) });
            if (this.syn.slot && p.frenzyT > 0) p.frenzyT = Math.min(p.frenzyT + SLOT_FZ, s.frenzyLen * 2);   // Slot Machine
            if (this.cap.lucky) { this.addCombo('dna', e.x, e.y); this.capFire('lucky', e.x, e.y); }   // Lucky Swimmer's capstone
            else if (this.syn.jackpot && p.frenzyT > 0) this.addCombo('dna', e.x, e.y); else if (!(e.lat > PICK_AIM)) this.seqPush('dna', e.x, e.y);
          }
          else if (e.t === 'shield') { p.shield++; this.emit('shield', { x: e.x, y: e.y }); }
          else { p.e += 6; p.acid = 0; this.emit('alkali', { x: e.x, y: e.y }); }
        }
      } else if (e.t === 'wbc') {
        e.ph += dt;
        const was = e.hunt;
        if (e.setpiece) this.setpieceStep(e, dt);
        if (e.crouch > 0 || e.lunge || e.popcorn || e.setpiece) { /* a lunger mid crouch or mid dash: see below; a popcorn cell dozes; the set piece runs its own script */ }
        else if (e.cool > 0) { e.cool -= dt; e.hunt = Math.max(0, e.hunt - dt); }      // a paid dodge: it sulks before locking on again
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
            } else if (e.lunger && !e.lunged) {
              // a lunger crouches (the second 'spot' is its tell) with Kevin in its window below (lungeWindow: wider and
              // further off at speed), aimed at where Kevin WILL be when it springs (lungeAim). The intercept must still be
              // LUNGE_FRONT in front of the cell (it never pounces from behind); otherwise it just hunts
              const vy = Math.max(0, p.vy || 0), lo = LUNGE_DY_MIN + LUNGE_LEAD * vy, hi = LUNGE_DY_MAX + LUNGE_LEAD * vy;
              const ty = lungeAim(p.y, vy);
              if (dy >= lo && dy <= hi && e.y - ty >= LUNGE_FRONT && p.y >= this.startY + LUNGE_SAFE) {
                e.lunged = 1; e.crouch = LUNGE_CROUCH; e.tx = p.x; e.ty = ty; this.emit('spot', { x: e.x, y: e.y, lunge: true, crouch: LUNGE_CROUCH });
              } else if (dy < hi) e.lunged = 1;
            } else e.hunt = Math.min(1, e.hunt + dt * 2);
          }
        }
        if (was < 0.5 && e.hunt >= 0.5) this.emit('lockon', { x: e.x, y: e.y });
        if (e.crouch > 0) {          // the crouch: it holds still, then springs at where Kevin was (e.tx, e.ty)
          e.vx *= 0.8; e.vy *= 0.8; e.crouch -= dt;
          if (e.crouch <= 0) {
            e.crouch = 0; e.lunge = 1; e.ld = 0;
            // (the aim was fixed at the crouch: forward-only, a pounce never comes from behind Kevin)
            const lx = e.tx - e.x, ly = Math.min(0, e.ty - e.y), L = Math.hypot(lx, ly) || 1;
            e.vx = LUNGE_SPEED * lx / L; e.vy = LUNGE_SPEED * ly / L;
          }
        } else if (e.lunge) {        // the dash: LUNGE_SPEED u/s, at most LUNGE_LEN, then stunned
          const b = playBand(e.y, e.side || p.side);
          e.x = clamp(e.x + e.vx * dt, b.l, b.r); e.y += e.vy * dt; e.ld += LUNGE_SPEED * dt;
          if (e.ld >= LUNGE_LEN) { e.lunge = 0; e.lunged = 2; e.cool = LUNGE_STUN; e.hunt = 0; e.vx = 0; e.vy = 0; }
        } else if (e.setpiece) { /* moved by setpieceStep */ } else {
          const spd = 190 * (e.kW || 1) * e.hunt, slow = e.eat > 0 ? 0.15 : 1;                    // mid-snack it barely moves
          e.vx += ((dx < 0 ? 1 : -1) * spd - e.vx) * Math.min(1, dt * 3);
          e.vy += ((dy > 0 ? -spd * 0.6 : 0) - e.vy) * Math.min(1, dt * 2);
          e.x += (e.vx * dt + Math.sin(e.ph * 2) * 10 * dt) * slow; e.y += e.vy * dt * slow;
        }
        // fairness: a Big Macro inside a current band drifts with it (it never waits in the lane the current pushes you to)
        if (curs === null) { curs = []; for (const c of this.ents) if (c.t === 'current' && !c.dead) curs.push(c); }
        for (const c of curs) if (e.y > c.y && e.y < c.y + c.h) { const b = playBand(e.y, e.side || p.side); e.x = clamp(e.x + c.dir * 120 * dt, b.l, b.r); break; }
        // snack on rivals that swim through
        if (snack === null) {   // (once a step: only the swimmers inside the Big Macros' rows can be eaten)
          let lo = Infinity, hi = -Infinity;
          for (const w of this.ents) if (w.t === 'wbc' && !w.dead) { if (w.y - w.r < lo) lo = w.y - w.r; if (w.y + w.r > hi) hi = w.y + w.r; }
          snack = this._snack; snack.length = 0; for (const a of this.agents) if (a.alive && !a.arrived && !a.boss && !a.strag && a.y > lo - 10 && a.y < hi + 10) snack.push(a);   // (an unpassed straggler is never a snack)
        }
        for (const a of snack) if (a.alive && Math.abs(a.y - e.y) < e.r && Math.abs(this.agentX(a) - e.x) < e.r) {
          this.killAgent(a, 'eaten');
          if (!(e.eat > 0)) e.hunt = Math.min(e.hunt, 0.3);
          e.eat = 0.9;
        }
        // a dash grazing a Big Macro (within DASH_GRAZE of its skin, no touch) is a 'pop' trick step: no link, no damage
        if (p.dashT > 0 && !e.grazed && d >= e.r + 8 && d < e.r + DASH_GRAZE) { e.grazed = 1; this.seqPush('pop', e.x, e.y); }
        if (d < e.r + 8) {
          e.touched = 1;
          if (e.setpiece && e.spPhase < 3) { e.spPhase = 3; this.emit('setpiece', { phase: 'hit', x: e.x, y: e.y }); }
          if (nitro || p.inv > 0) { if (nitro) { e.dead = 1; this.emit('pop', { x: e.x, y: e.y }); this.addCombo('pop', e.x, e.y); } e.eat = Math.max(0, e.eat - dt); continue; }
          // a wall hair just swatted you into it: the swat bonks the cell away, no bite (0.35 s window)
          if (p.swatSafe > 0) { if (!(e.cool > 0)) this.emit('swatBonk', { x: e.x, y: e.y }); e.vx = -p.swatDir * 300; e.cool = 1.5; e.hunt = 0; e.eat = Math.max(0, e.eat - dt); continue; }
          // DASH POP: the nose of a fresh dash pops it (no Spiky needed), for DASH_POP_COST energy
          if (!this.muts.spiky && p.dashT > 0) {
            e.dead = 1; p.e -= DASH_POP_COST; this.gasOther += DASH_POP_COST; this.emit('pop', { x: e.x, y: e.y }); this.addCombo('pop', e.x, e.y); p.comboT = p.comboMax; continue;
          }
          // a stunned Lunger is harmless: the touch bonks it off (one 'bonk' link and one 'stunBonk' a cell)
          if (e.lunged === 2 && e.cool > 0 && !this.muts.spiky) {
            p.swatT = STUN_BONK_SWAT; p.swatDir = p.x < e.x ? -1 : 1; e.vx = -p.swatDir * STUN_BONK_PUSH; e.cool = Math.max(e.cool, STUN_BONK_COOL);
            if (!e.bonked) { e.bonked = 1; this.emit('stunBonk', { x: e.x, y: e.y }); this.addCombo('bonk', e.x, e.y); }
            e.eat = Math.max(0, e.eat - dt); continue;
          }
          // a dozing POPCORN cell is no mouth: bumped awake (no dash) it boops Kevin off: a soft hit, no break and no hit
          // taken, only POPCORN_BOOP s off the chain's timer; it never bites
          if (e.popcorn && !this.muts.spiky) {
            p.swatT = 0.2; p.swatDir = p.x < e.x ? -1 : 1; p.inv = Math.max(p.inv, 0.6); e.vx = -p.swatDir * 200;
            if (p.combo > 0) p.comboT = Math.max(p.comboT - POPCORN_BOOP, 0.1);
            this.emit('popcornWake', { x: e.x, y: e.y }); continue;
          }
          e.dead = 1; this.emit('pop', { x: e.x, y: e.y });
          if (this.muts.spiky) { p.e += 10; this.addCombo('pop', e.x, e.y); if (this.syn.porcupine) this.blast(e.x, e.y, 140, 'porcupine'); }
          else if (p.wing > 0) { p.wing--; p.hits++; p.inv = 1; this.emit('wingHit', { x: e.x, y: e.y }); this.breakCombo('wingHit', e.x, e.y); }
          else if (p.shield > 0) { p.shield--; p.hits++; p.inv = 1.2; this.emit('shieldHit', { x: e.x, y: e.y }); this.breakCombo('shieldHit', e.x, e.y); if (this.cap.helmet) this.helmetRing(p.x, p.y); }
          else if (this.rookie && (this.firstNormal || (this.biteFree !== this.zoneReached && (normRunsOf(this.meta) < 3 || this.zoneReached >= SEA_I)))) {   // rookie grace: the first bite per zone is on the house (runs 3-4: from the sea on)
            this.biteFree = this.zoneReached; p.hits++; p.inv = 1.2; this.emit('shieldHit', { x: e.x, y: e.y, rookie: true }); this.breakCombo('shieldHit', e.x, e.y);
          }
          else if (((!this.rookie && !this.biteUsed && this.gen < SPARE_BITE_GEN) || this.rescueBites > 0) && p.e >= SPARE_BITE) {   // one spare bite a run (and one a rescue step): it costs 35 energy and the chain
            const soft = this.perks.softLanding && this.softZone !== this.zoneReached;
            if (soft) { this.softZone = this.zoneReached; this.perkFire('softLanding', e.x, e.y); }
            if (!this.rookie && !this.biteUsed && this.gen < SPARE_BITE_GEN) this.biteUsed = 1; else this.rescueBites--; p.e -= SPARE_BITE * (soft ? PERK_SOFT : 1); this.gasOther += SPARE_BITE * (soft ? PERK_SOFT : 1); p.inv = 1.2; p.lastHit = e.lunge ? 'lunge' : 'wbc'; p.hits++;
            this.emit('spareBite', { x: e.x, y: e.y }); this.loseCombo('spareBite', e.x, e.y);
          }
          else { p.lastHit = e.lunge ? 'lunge' : 'wbc'; this.biteBy = e.lunge ? 'lunge' : 'wbc'; this.end('wbc'); return; }
        } else if (d < e.r + 26 && e.hunt > 0.5) { e.near = 1; e.minGap = Math.min(e.minGap ?? Infinity, d - e.r - 8); }
        // a dodge: it locked on, came within a whisker and got nothing. Mid-snack it is worth more.
        // (past a stunned lunger: a 3-link dodge)
        if (e.lunged === 2 && e.cool > 0 && !e.touched && !e.paid && dy < -e.r) { e.paid = 1; this.addCombo('dodge', e.x, e.y, 3); }
        if (e.near && !e.touched && !e.paid && dy < -e.r) { e.paid = 1; e.cool = 2.5; this.addCombo('dodge', e.x, e.y, e.eat > 0 ? 3 : 2, Number.isFinite(e.minGap) ? { gap: Math.round(Math.max(0, e.minGap) * 10) / 10 } : null); }
        e.eat = Math.max(0, e.eat - dt);
      } else if (e.t === 'cilia') {
        const ph = (this.t + e.off) % e.period;
        const tell = e.tellT || CILIA_TELL, swat = e.swatT || CILIA_SWAT;
        e.state = ph < e.period - tell ? 0 : ph < e.period - swat ? 1 : 2;     // idle, tremble 0.45s, swat 0.35s
        e.phase = ph / e.period;
        const reach = e.wall < 0 ? p.x - e.x : e.x - p.x;  // how far you are from its wall
        // swept: everything between last step's y and this one, so a dash cannot tunnel through a swat
        const y0 = Math.min(this.prevPY, p.y), y1 = Math.max(this.prevPY, p.y);
        if (y0 < e.y + 26 && y1 > e.y - 26) {
          if (reach < e.r && e.state === 2 && !e.hit && !nitro) {
            e.hit = 1; p.swatT = 0.2; p.swatDir = -e.wall; p.swatSafe = SWAT_SAFE; p.swatSlow = SWAT_SLOW_T;
            if (p.combo > 0) p.comboT = Math.max(p.comboT - SWAT_CHAIN, 0.1);
            this.emit('swat', { x: p.x, y: p.y, wall: e.wall });
          } else if (reach < e.r + 24 && e.state >= 1) { e.near = 1; if (e.state === 2 && reach >= e.r) e.slip = 1; }
        }
        if (e.near && !e.hit && !e.paid && p.y - e.y > 26) {
          e.paid = 1;
          if (e.slip) this.addCombo('dodge', p.x, e.y, e.pair ? 3 : 2);   // slipped past a live swat: a real dodge (threaded a pair: 3)
          else this.nearMiss(p.x, e.y);
        }
      }
    }
    if (drops) for (const g of drops) { this.ents.push(g); this.emit('drip', { phase: 'drop', x: g.x, y: g.y }); }
    // compact in place (the same arrays every step: no garbage at 240 Hz)
    if (this.ents.length > 400 || (this.t % 1 < dt)) { const E = this.ents, lo = p.y - 700; let j = 0; for (let i = 0; i < E.length; i++) { const e = E[i]; if (!e.dead && e.y > lo) E[j++] = e; } E.length = j; }
    const F = this.fx; let j = 0;
    for (let i = 0; i < F.length; i++) { const f = F[i]; f.age += dt; if (f.age < 1.2) F[j++] = f; }
    F.length = j;
  }

  // ---------------------------------------------------------------- the egg: a tug of war
  // the head start you bring from the race: your energy left and the best FRENZY tier you reached
  // and your best chain: a great chain carries into the finale
  headStart() {
    const h = this.headParts().total;
    return Math.min(this.rookie ? DRILL_HEAD_ROOKIE : this.headCap, this.playerNeed(), this.rookie ? h : duelHead(h));
  }
  // the four terms of the head start (ui: the HUD chip and the post-mortem): tank, tier, combo, boss; total is their sum
  // (uncapped), cap the most the duel takes (the rest up to DRILL_HEAD_MAX is paid as DNA when the drill starts)
  // hits is negative (a hit taken costs head start), lead is what arriving clear of the named rivals is worth
  headParts() {
    const p = this.p;
    // (the tank term reads absolute GAS, up to HEAD_E_CAP: a bigger tank (Big Fructose Tank, water) and a frugal tail (Lazy
    // Wiggle) bring a bigger head start, where the old tank fraction paid a 100 tank and a 220 one the same)
    const tank = HEAD_E * clamp(p.e, 0, HEAD_E_CAP) / 100, tier = HEAD_TIER * (p.bestTier || 0), combo = HEAD_COMBO * Math.min(p.bestCombo || 0, HEAD_COMBO_CAP);
    const boss = Math.min(HEAD_BOSS_CAP, HEAD_BOSS * (p.bossPasses || 0));
    const hits = Math.max(HEAD_HIT_CAP, HEAD_HIT * (p.hits || 0)) || 0, lead = Math.min(HEAD_LEAD_CAP, HEAD_LEAD * Math.floor(Math.max(0, p.leadSec || 0)));
    const total = Math.max(0, tank + tier + combo + boss + hits + lead);
    return { tank, tier, combo, boss, hits, lead, total: Number.isFinite(total) ? total : 0, cap: Math.min(this.rookie ? DRILL_HEAD_ROOKIE : Math.min(HEAD_DUEL_MAX, this.headCap), this.playerNeed()),
      duel: Number.isFinite(total) ? Math.min(this.rookie ? DRILL_HEAD_ROOKIE : this.headCap, this.playerNeed(), this.rookie ? total : duelHead(total)) : 0,
      max: { tank: HEAD_E * HEAD_E_CAP / 100, tier: HEAD_TIER * this.tierCap(), combo: HEAD_COMBO * HEAD_COMBO_CAP, boss: HEAD_BOSS_CAP, hits: HEAD_HIT_CAP, lead: HEAD_LEAD_CAP } };
  }
  // the whole seconds Kevin reaches the egg ahead of the first egg-side named rival (0 when one is already there):
  // the time each still-swimming one needs at its own speed
  leadAtEgg() {
    let best = Infinity;
    for (const a of this.agents) {
      if (!a.boss || !a.alive || a.side !== this.eggSide) continue;
      if (a.arrived) return 0;
      best = Math.min(best, Math.max(0, RACE_LEN - 70 - a.y) / Math.max(1, a.sp));
    }
    return Number.isFinite(best) ? Math.floor(best) : 0;
  }
  // the head start the duel's knee did not take (total - duelHead(total), never above DRILL_HEAD_MAX), paid as
  // HEAD_BONUS_DNA DNA a whole 0.1 s: {dna, sec}
  // (never on a rookie run: its duel is a photo finish under DRILL_HEAD_ROOKIE, not a reward for a great race)
  headBonus() {
    const tot = this.headParts().total, sec = this.rookie ? 0 : Math.max(0, tot - Math.min(duelHead(tot), DRILL_HEAD_MAX));
    const tenths = Math.floor(sec * 10 + 1e-6);
    return { dna: tenths * HEAD_BONUS_DNA, sec: tenths / 10 };
  }
  startDrill() {
    this.p.leadSec = this.leadAtEgg();
    const head = this.headStart(), hb = this.headBonus();
    this.drill = { t0: this.t, me: head, head, need: this.playerNeed(), tok: 2, carry: 0, lead: null, tellT: -Infinity, gasp: null, held: 0 };
    // a race too good for the duel: what the knee does not take is paid as DNA instead (once, as the drill starts)
    if (hb.dna > 0) { this.dnaRun += hb.dna; this.dnaBonus += hb.dna; this.emit('headBonus', hb); }
    // the named rivals already drilling are held when you arrive (the first to arrive at DRILL_ARRIVED_CAP of its need,
    // the rest at DRILL_ARRIVED_CAP2), and each pulls its move on the duel clock (PRE_MOVE_AT): the tug of war is yours to win
    // (the hold depends on the race Kevin swam: DRILL_ARRIVED_HEAD less per second of duel head start, see arrivedCap)
    const pre = this.agents.filter((a) => a.boss && a.alive && a.arrived).sort((a, b) => a.arrivedT - b.arrivedT), hd = duelHead(this.headParts().total);
    pre.forEach((a, j) => {
      a.drill = Math.min(a.drill, (arrivedCap(j ? DRILL_ARRIVED_CAP2 : DRILL_ARRIVED_CAP, hd) - PEP_CAP * pepSteps(this.meta, this.daily)) * a.need);
      const mv = this.moveState(a), at = PRE_MOVE_AT[a.boss.move];
      if (at == null) return;
      mv.pre = true; mv.at = at;
      if (a.boss.move === 'maxRep') { mv.c = MAXREP_EVERY - MOVE_TELL - at; mv.tellAt = -1; }
      if (a.boss.move === 'sorry') a.shoveT = Math.max(a.shoveT == null ? 0 : a.shoveT, at + MOVE_TELL);
    });
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
  stepDrillSim(dt) {
    if (!(dt > 0) || dt > 0.25) return;
    const d = this.drill, p = this.p;
    // taps count up to DRILL_TAPS_MAX a second (a small token bucket), each +DRILL_TAP and a shove on every arrived rival
    d.tok = Math.min(2, d.tok + DRILL_TAPS_MAX * dt);
    const raw = Math.max(0, Math.floor(this.input.tap || 0)), taps = Math.min(raw, Math.floor(d.tok));
    // fresh: the taps new this step (the carried ones were tallied the step they came in)
    const fresh = Math.max(0, raw - Math.min(d.carry || 0, raw));
    d.tok -= taps;
    const boost = this.eggBoost();
    d.me += (dt * (DRILL_BASE + (p.frenzyT > 0 ? DRILL_FRENZY : 0)) + taps * DRILL_TAP) * boost;
    if (this.autopilot && !this.bot) d.me += dt * 0.3;
    if (raw) {
      this.emit('drillTap', { n: taps });
      const side = this.input.tapSide === -1 || this.input.tapSide === 1 ? this.input.tapSide : null;
      for (const a of this.agents) if (a.alive && a.arrived && a.boss) this.shoveRival(a, taps, side, fresh);
    }
    // (taps queued past the bucket, a hit-stop's worth, land over the next steps: at most DRILL_CARRY carry over)
    this.input.tap = d.carry = Math.min(DRILL_CARRY, raw - taps);
    this.tickFrenzy(dt);
    // LAST GASP: the leading rival (of those drilling before Kevin came) eases off while Kevin is more than LAST_GASP behind it
    let gasp = null, gf = d.me / d.need + LAST_GASP;
    for (const a of this.agents) if (a.alive && a.arrived && a.mv && a.mv.pre) { const f = a.drill / Math.max(1e-6, a.need); if (f > gf) { gf = f; gasp = a; } }
    d.gasp = gasp;
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
          // Steve says sorry first: his shove is told MOVE_TELL s ahead
          if (a.boss.move === 'sorry' && was > MOVE_TELL && a.shoveT <= MOVE_TELL) {
            if (this.tellOK(a)) this.emitMove(a, 'tell'); else a.shoveT = MOVE_TELL + 1e-6;   // another tell is on: wait
          }
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
    // the door hold: the drill past DOOR_HOLD waits in d.held and lands the moment the move resolves (Kevin slips in)
    if (this.doorHeld()) { if (d.me > DOOR_HOLD * d.need) { d.held += d.me - DOOR_HOLD * d.need; d.me = DOOR_HOLD * d.need; } }
    else if (d.held > 0) { d.me += d.held; d.held = 0; }
    if (d.me >= d.need) return this.end('win');
    this.drillLeader();
  }

  // ---------------------------------------------------------------- signature moves at the egg (RIVALS[].move)
  // rivalMove {k, boss, move, phase: 'tell' | 'hit' | 'countered'}. Every tell comes MOVE_TELL+ s before its hit.
  // (pre: the rival was drilling before Kevin arrived, its move comes at duel time at; else by its drill fraction)
  moveState(a) {
    if (!a.mv) a.mv = { c: 0, tellAt: -1, taps: 0, stopT: 0, outT: 0, out: 0, taken: 0, dove: false, hairDone: false, hairT: 0, hairTell: -1, hairTaps: 0, told: false,
      citeTell: -1, citeT: 0, citeGain: 0, citeTaps: 0, citeDone: false, pre: false, at: 0, waitT: -1 };
    return a.mv;
  }
  // is a named rival's tell or move window open right now (the DOOR HOLD, see DOOR_HOLD)?
  doorHeld() {
    for (let k = 0; k < RIVALS.length; k++) {
      const a = this.agents[k], mv = a && a.mv;
      if (!mv || !a.alive || !a.arrived || !a.boss) continue;
      switch (a.boss.move) {
        case 'maxRep': if (mv.tellAt >= 0) return true; break;
        case 'byTheBook': if (mv.citeTell >= 0 && !mv.citeDone) return true; break;
        case 'stuntDive': if (mv.outT > 0) return true; break;
        case 'hairCheck': if (mv.hairTell >= 0 && !mv.hairDone) return true; break;
        default: break;
      }
    }
    return false;
  }
  // may rival a's tell start now? None within TELL_GAP s of the last one, and the queue is fair: a tell that is due
  // waits in line (mv.waitT: since when), the one waiting longest goes first (Steve's every-shove 'sorry' never starves
  // Chad's hair check)
  tellOK(a) {
    const d = this.drill; if (!d) return true;
    const mv = this.moveState(a);
    if (mv.waitT < 0) mv.waitT = this.t;
    if (this.t - d.tellT < TELL_GAP - 1e-9) return false;
    // (Steve's every-shove 'sorry' always yields to a real move that is waiting: his tells are many, theirs are the duel)
    const sorry = a.boss && a.boss.move === 'sorry';
    for (let k = 0; k < RIVALS.length; k++) {
      const b = this.agents[k], w = b && b !== a && b.alive && b.arrived && b.mv ? b.mv.waitT : -1;
      if (w < 0) continue;
      if (sorry && b.boss && b.boss.move !== 'sorry') return false;
      if (!sorry && b.boss && b.boss.move === 'sorry') continue;
      if (w < mv.waitT || (w === mv.waitT && b.k < a.k)) return false;
    }
    return true;
  }
  // (side: the rival's side of the egg, a.eggSide: tap there to counter)
  emitMove(a, phase, extra) {
    if (phase === 'tell' && this.drill) { this.drill.tellT = this.t; if (a.mv) a.mv.waitT = -1; }
    this.emit('rivalMove', { k: a.k, boss: a.boss.name, move: a.boss.move, phase, side: a.eggSide, ...extra });
  }
  stepMove(a, mv, dt) {
    const d = this.drill;
    // a move's trigger: the duel clock for a rival that was there first (PRE_MOVE_AT), its own arrival clock for one that
    // came later (LATE_MOVE_AT)
    const due = () => (mv.pre ? this.t - d.t0 >= mv.at : this.t - a.arrivedT >= LATE_MOVE_AT);
    if (mv.stopT > 0) mv.stopT = Math.max(0, mv.stopT - dt);
    switch (a.boss.move) {
      case 'maxRep': {   // Brock: every 3.5 s a MOVE_TELL wind-up, then a big shove. 3+ taps (on his side) in the wind-up block it.
        mv.c += dt;
        if (mv.tellAt < 0 && mv.c >= MAXREP_EVERY - MOVE_TELL) {
          if (this.tellOK(a)) { mv.tellAt = mv.c; mv.taps = 0; this.emitMove(a, 'tell'); } else mv.c = MAXREP_EVERY - MOVE_TELL;   // wait for a gap
        }
        if (mv.tellAt >= 0 && mv.c >= MAXREP_EVERY) {
          if (mv.taps >= MOVE_COUNTER_TAPS) { mv.stopT = 1.0; this.emitMove(a, 'countered'); }
          else { d.me = Math.max(0, d.me - MAXREP_HIT); this.emitMove(a, 'hit', { dme: MAXREP_HIT }); }
          mv.c -= MAXREP_EVERY; mv.tellAt = -1;
        }
        break;
      }
      case 'byTheBook':  // Tiffany: shove-proof for 2 s after she arrives, never a shove, and one CITATION when her move is due
        // (one who gets in mid duel skips the shove-proof tell: her citation is the move, LATE_MOVE_AT s after she arrives)
        if (!mv.told) { if (this.t - a.arrivedT >= BOOK_T || !mv.pre) { mv.told = true; mv.waitT = -1; } else if (this.tellOK(a)) { mv.told = true; this.emitMove(a, 'tell', { t: BOOK_T - (this.t - a.arrivedT) }); } }
        if (mv.citeDone) break;
        if (mv.citeTell < 0) { if (mv.told && due() && this.tellOK(a)) { mv.citeTell = 0; this.emitMove(a, 'tell', { cite: true, t: MOVE_TELL }); } }
        else if (!(mv.citeT > 0)) {
          mv.citeTell += dt;
          if (mv.citeTell >= MOVE_TELL) { mv.citeT = BOOK_CITE_T; mv.citeGain = 0; mv.citeTaps = 0; }
        } else {
          mv.citeT -= dt;
          if (mv.citeT <= 0) {
            mv.citeT = 0; mv.citeDone = true;
            if (mv.citeTaps >= BOOK_CITE_TAPS) { a.drill = Math.max(0, a.drill - mv.citeGain); mv.stopT = BOOK_CITE_STOP; this.emitMove(a, 'countered', { cite: true, taps: mv.citeTaps }); }
            else this.emitMove(a, 'hit', { cite: true, gain: Math.round(mv.citeGain * 100) / 100 });
          }
        }
        break;
      case 'stuntDive':  // Gunther: when his move is due he backs off for 1.2 s, then dives back in for +0.18
        if (!mv.dove) { if (due() && this.tellOK(a)) { mv.dove = true; mv.outT = STUNT_OUT; mv.taken = 0; this.emitMove(a, 'tell'); } }
        else if (mv.outT > 0) {
          mv.outT -= dt;
          if (mv.outT <= 0) {
            mv.outT = 0;
            a.drill = Math.min(a.need, a.drill + STUNT_HIT);
            this.emitMove(a, mv.taken >= STUNT_HIT ? 'countered' : 'hit', { taken: Math.round(mv.taken * 100) / 100 });
          }
        }
        break;
      case 'hairCheck':  // Chad: once, when his move is due, a 0.8 s fuss then 1.6 s of hair care: no drilling, your shoves count double
        if (!mv.hairDone && mv.hairTell < 0) { if (due() && this.tellOK(a)) { mv.hairTell = 0; mv.hairTaps = 0; this.emitMove(a, 'tell'); } }
        else if (mv.hairTell >= 0 && !mv.hairDone) {
          mv.hairTell += dt;
          if (mv.hairTell >= MOVE_TELL) { mv.hairDone = true; mv.hairT = HAIR_T; mv.stopT = HAIR_T; this.emitMove(a, 'hit', { t: HAIR_T }); }
        } else if (mv.hairT > 0) {
          mv.hairT -= dt;
          if (mv.hairT <= 0) { mv.hairT = 0; if (mv.hairTaps >= MOVE_COUNTER_TAPS) this.emitMove(a, 'countered', { taps: mv.hairTaps }); }
        }
        break;
      default: break;
    }
  }
  // Kevin's taps push an arrived named rival back (DRILL_SHOVE a tap), bent by its move. side: the side tapped (-1 / 1), or
  // null (an old input with no tapSide): then every tap counts on every side, as before
  // (raw: every tap this step, counted or not: the counter tallies use it, the drill and the shoves use the bucket's taps)
  shoveRival(a, taps, side = null, raw = taps) {
    const mv = this.moveState(a), move = a.boss.move, mine = side == null || !a.eggSide || side === a.eggSide;
    const here = mine ? taps : 0, hereRaw = mine ? raw : 0;
    if (move === 'byTheBook' && mv.citeT > 0) mv.citeTaps += hereRaw;         // taps on her side in the citation count to void it
    if (move === 'byTheBook' && this.t - a.arrivedT < BOOK_T) return;          // Tiffany read the chapter on shoves
    if (move === 'maxRep' && mv.tellAt >= 0) mv.taps += hereRaw;                // taps on Brock's side in his wind-up count towards a block
    if (move === 'hairCheck' && mv.hairT > 0) mv.hairTaps += hereRaw;           // (counted here: a step with no counted tap still tallies)
    if (!taps) return;
    if (move === 'stuntDive' && mv.outT > 0) {                                  // Gunther is out: taps on his side chip his drill instead
      if (!here) return;
      const take = Math.min(here * 0.05, STUNT_CAP - mv.taken);
      if (take > 0) { mv.taken += take; a.drill = Math.max(0, a.drill - take); }
      this.emit('drillShove', { k: a.k, boss: a.boss.name });
      return;
    }
    let k = 1;
    if (move === 'hairCheck' && mv.hairT > 0) k = 2;                            // mid hair check: shoves count double
    a.drill = Math.max(0, a.drill - DRILL_SHOVE * taps * k);
    this.emit('drillShove', { k: a.k, boss: a.boss.name });
    if (move === 'sorry') {   // Steve apologises his way back: each shove has a 25% chance of giving Kevin +0.04
      for (let i = 0; i < taps; i++) if (this.rng() < 0.25) { this.drill.me += 0.04; this.emitMove(a, 'countered', { dme: 0.04 }); }
    }
  }

  // ---------------------------------------------------------------- end of run
  // end() is a transaction: a throw anywhere inside it puts the save (and the race's own end fields) back exactly as
  // they were and clears this.ending, so main.js's recovery (end('crash')) applies the meta changes once, never twice
  end(reason) {
    if (this.over || this.ending) return;
    this.ending = true;            // atomic: nothing that end() triggers can end the race a second time
    const M = this.meta, snap = JSON.stringify(M), won = this.won, rank = this.rank, dnaRun = this.dnaRun, dnaBank = this.dnaBank, nEv = this.events.length;
    try { this.settle(reason); }
    catch (err) {
      for (const k of Object.keys(M)) delete M[k];
      Object.assign(M, JSON.parse(snap));
      this.won = won; this.rank = rank; this.dnaRun = dnaRun; this.dnaBank = dnaBank; this.over = null; this.events.length = Math.min(this.events.length, nEv);
      this.ending = false;
      throw err;
    }
  }
  settle(reason) {
    this.meta.openRun = null;      // (first: the end() snapshot puts it back if anything below throws)
    const p = this.p, M = this.meta, s = this.s;
    // the records ledger: the old values, before anything below touches the save
    const num0 = (v) => (Number.isFinite(+v) && +v > 0 ? +v : 0);
    const rec0 = { margin: num0(M.bestMargin), combo: num0(M.bestCombo), winT: num0(M.bestWinT), dna: num0(M.bestDnaRun), winStreak: num0(M.bestWinStreak), sweep: num0(M.sweeps), streak: num0(M.bestStreak) };
    this.won = reason === 'win';
    if (this.won) this.rank = 1;
    if (!this.won) this.rank = Math.max(2, this.rank);     // only the winner is #1
    const dist = Math.max(0, p.y - this.startY);
    const rank = this.rank;
    // a quit in the first 3000 is a restart, not a run: no daily, no run count, no rival ledger, distance DNA only
    // a crash (main.js: the frame kept failing) is never the player's fault: it counts as a run and pays, but like an
    // autopilot run it never touches the rival W-L record or the difficulty ledgers, and it is never a quit
    const crash = reason === 'crash';
    const counted = crash || reason !== 'quit' || dist >= 3000;
    // what got you: energy with acid in the last 3 s is the acid, 3+ goo bonks in the zone is the goo
    let cause = reason === 'win' ? null : reason;
    if (reason === 'energy') cause = this.t - p.acidT < 3 ? 'acid' : p.zoneBonks >= 3 ? 'bonk' : 'energy';
    // an autopilot run (the sat-nav swam more than half of it) is practice: it counts as a run (and keeps the daily
    // streak going) but never touches the difficulty ledgers, the rival W-L record, the bounty or the medals
    const autoFrac = this.t > 0 ? clamp(this.autoT / this.t, 0, 1) : 0, auto = autoFrac > 0.5, noLedger = auto || crash;
    // rivals: who did you finish ahead of? Only the ones you actually met count, either way.
    const beaten = [];
    if (counted) {
      for (const a of this.agents) {
        if (!a.boss || !(a.met || this.meet(a) || this.won)) continue;
        const nm = firstName(a.boss);
        const beat = this.won || (!a.alive) || (!a.arrived && a.y < p.y);
        if (beat) beaten.push(nm);
        if (!noLedger && M.rivals && typeof M.rivals === 'object') {
          const r = M.rivals[nm] || (M.rivals[nm] = { beat: 0, lost: 0 });
          if (beat) r.beat++; else r.lost++;
        }
      }
      M.bestRivals = Math.max(M.bestRivals || 0, beaten.length);
    }
    // THE EGG BANK: a win cashes your best chain of the run once more, as a STYLE 4 bank (comboBank {egg: true})
    if (this.won && !auto) {
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
    // (a 'late' loss to a named egg taker always names it: nextGoal turns it into beatRival)
    let gapBy = by;
    if (!this.won && !gapBy) {
      let best = Infinity;
      for (const a of this.agents) {
        if (!a.boss || !a.alive || (p.y >= FORK_Y0 && a.y >= FORK_Y0 && a.side !== (p.side || this.eggSide))) continue;
        const ay = a.arrived ? RACE_LEN - 70 : a.y;
        if (ay > p.y && ay - p.y < best) { best = ay - p.y; gapBy = firstName(a.boss); }
      }
    }
    // a duel lost at the egg names the arrived named rival furthest into its drill (main.js gapInfo shows it, the bounty
    // and the rematch name the same foe): meta.lastFoe
    if (!this.won && this.drill) {
      let f = -1, foe = null;
      for (const a of this.agents) if (a.boss && a.alive && a.arrived && a.drill / Math.max(0.01, a.need) > f) { f = a.drill / Math.max(0.01, a.need); foe = a; }
      if (foe) { gapBy = firstName(foe.boss); if (counted && !noLedger) M.lastFoe = foe.k; }
    }
    // DNA
    const prog = clamp(p.y / RACE_LEN, 0, 1), fDrill = this.drill ? clamp(this.drill.me / Math.max(1e-6, this.drill.need), 0, 1) : 0;
    const genMul = genFactor(this.gen);
    // a daily won again on a day that already has its gold: a baby for the album, no new generation (the tube is the
    // same every attempt, so only the first daily gold of a day makes a generation)
    const dailyRepeat = this.won && !auto && this.daily != null && counted && M.dailyDay === this.daily && Math.floor(M.dailyMedal || 0) >= 3;
    const practice = this.won && (auto || dailyRepeat);    // an autopilot win: a baby for the album, but no new generation
    const bk = {
      dist: dist / 2000,
      place: placePay(rank) + (this.won && !practice ? WIN_BONUS : 0),
      // (the NaN firewall's last line: a broken ledger pays 0, it never zeroes the whole swim)
      combo: ok(this.dnaRun, 0) - ok(this.dnaBank, 0) - ok(this.dnaBonus, 0),
      bank: ok(this.dnaBank, 0),
      bounty: ok(this.dnaBonus, 0) + 3 * beaten.length + (beaten.includes(firstName(RIVALS[RIVALS.length - 1])) ? 15 : 0),
      // photo finish: beaten at the egg itself pays for how far you drilled, on a gradient that is steep at the end
      // (photoPay: 10 under 60% of the drill, 60 at 100%: a 95% loss pays far more than a 70% one)
      photo: reason === 'late' && this.drill ? photoPay(fDrill) : 0,
      // so near: a rival got in while you were still swimming for it, the closer the more it pays
      // (and running dry in the last tenth of the race pays up to 50: 'So near!')
      near: (reason === 'late' && !this.drill ? Math.round(60 * clamp(1 - gapSec / 8, 0, 1)) : 0)
        + (reason === 'energy' && prog >= 0.9 ? Math.round(50 * clamp((prog - 0.9) / 0.1, 0, 1)) : 0),
      // a podium finish that was not a win
      // (second place pays PODIUM_2 + PODIUM_2_DRILL x Kevin's drill fraction: the closer the duel, the bigger the silver)
      podium: !this.won ? (rank === 2 ? Math.round(PODIUM_2 + PODIUM_2_DRILL * fDrill) : rank === 3 ? 10 : rank <= 5 ? 5 : 0) : 0,
    };
    if (!counted) { bk.place = 0; bk.bounty = 0; bk.photo = 0; bk.near = 0; bk.podium = 0; }
    const raw = bk.dist + bk.place + bk.combo + bk.bank + bk.bounty + bk.photo + bk.near + bk.podium;
    const autoCut = raw * genMul * 0.6 * autoFrac;          // the autopilot keeps 40%
    let freezeUsed = false, dailyBonus = 0, streak = M.dailyStreak || 0, dailyBest = false, medal = 0, medalDna = 0, medalNew = false, dailyAttempt = 0, dailyScale = 1;
    if (this.daily != null && counted) {
      if (M.dailyDay !== this.daily) {
        // the clock: opts.now, else now if this daily is today's, else the daily's own noon (old or test days)
        const real = Date.now(), now = this.now != null ? this.now : localDay(real) === this.daily ? real : dayNoon(this.daily);
        // (attempts abandoned earlier today, before the day rolled over here, still count: dailyQuitDay)
        M.dailyDay = this.daily; M.dailyBest = TOTAL_SWIMMERS; M.dailyRuns = M.dailyQuitDay === this.daily ? Math.max(0, Math.floor(M.dailyRuns || 0)) : 0; M.dailyMedal = 0;
        const alive = M.dailyLastDay !== this.daily && streakAlive(M, now);
        // a streak freeze bridges exactly one missed day
        if (!alive && M.dailyLastDay === this.daily - 2 && streak > 0 && (M.streakFreeze || 0) > 0) { M.streakFreeze = Math.floor(M.streakFreeze) - 1; freezeUsed = true; }
        streak = alive || freezeUsed ? streak + 1 : 1;
        if (streak % 7 === 0) M.streakFreeze = Math.min(STREAK_FREEZE_MAX, Math.floor(M.streakFreeze || 0) + 1);
        M.dailyStreak = streak; M.dailyLastDay = this.daily; M.dailyLastAt = now; M.bestStreak = Math.max(M.bestStreak || 0, streak);
        dailyBonus = dailyBonusFor(streak, this.gen);
      }
      M.dailyRuns = Math.max(0, Math.floor(M.dailyRuns || 0)) + 1;
      // the same tube every attempt: the race DNA of attempt 1 pays in full, attempts 2-3 half, 4+ DAILY_SCALE[2]
      // (the medals, the streak bonus and the goal bounty are never scaled)
      dailyAttempt = M.dailyRuns; dailyScale = dailyScaleOf(dailyAttempt);
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
    if (g && !auto && reason !== 'quit' && goalMet(g, { won: this.won, zone: this.zoneReached, combo: p.bestComboLate, beaten, tricks: Object.keys(this.tricksRun || {}), gapSec })) { goalDna = g.dna; goalDone = { id: g.id, dna: g.dna, k: g.k, target: g.target }; M.goal = null; }
    let dna = Math.max(0, Math.round((raw * genMul - autoCut) * dailyScale)) + dailyBonus + goalDna + medalDna;
    // the first real win's jackpot, and the tough-day floor (both on top, after the generation multiplier)
    const firstDna = this.won && !practice && counted && !(M.wins > 0) ? FIRST_WIN_DNA : 0;
    dna += firstDna;
    let toughDna = 0;
    if (counted && reason !== 'quit' && !auto && this.daily == null && Number.isFinite(dna)) {
      const cheap = cheapestOpenHabitCost(M);
      if (Number.isFinite(cheap)) toughDna = Math.max(0, Math.round(TOUGH_FLOOR * cheap * toughShare(dist)) - dna);
    }
    dna += toughDna;
    if (!Number.isFinite(dna)) dna = 0;       // a NaN anywhere above never reaches the wallet
    if (!Number.isFinite(M.dna)) M.dna = 0;
    M.dna += dna; M.bestCombo = Math.max(ok(M.bestCombo, 0), ok(Math.floor(p.bestCombo), 0));
    if (counted && noLedger) M.runs++;
    else if (counted) {
      // the normal runs (rookie grace): an unknown count (-1) is all the runs so far, then only non-daily ones count
      M.normRuns = normRunsOf(M) + (this.daily == null ? 1 : 0);
      M.runs++; if (this.daily == null) M.sinceWin = Math.min(99, (M.sinceWin || 0) + 1); M.best = Math.min(M.best, rank); } else M.quits = (M.quits || 0) + 1;
    // a 'late' loss at the egg itself is an egg loss (drill faster next time); one before you even got there
    // is a race loss (the named rivals get a little slower next time, never in the daily). A podium that was no win
    // halves the egg-loss count first (a strong run needs less help), so the drill boost never stacks up.
    if (!noLedger) {
      if (this.won) { M.eggLosses = Math.floor((M.eggLosses || 0) / 2); M.raceLosses = Math.floor((M.raceLosses || 0) / 2); }   // a win eases off, not a wall
      else {
        if (counted && rank <= 3) M.eggLosses = Math.floor((M.eggLosses || 0) / 2);
        if (reason === 'late' && this.drill) M.eggLosses = Math.min(99, (M.eggLosses || 0) + 1);
        else if ((reason === 'late' || (reason === 'energy' && prog >= 0.9)) && this.daily == null && counted) M.raceLosses = Math.min(99, (M.raceLosses || 0) + 1);
      }
      if (!this.won && counted) M.winStreak = 0;
      // the losing-streak cushion's count (pepSteps): a real normal loss grows it, a short one leaves it, a quit never counts
      if (!this.won && counted && reason !== 'quit' && this.daily == null && (this.zoneReached >= SEA_I || dist >= LOSS_RUN_DIST * RACE_LEN)) M.lossRun = Math.min(99, Math.floor(ok(+M.lossRun, 0)) + 1);
      // the early-death rescue's count (rescueSteps)
      if (this.won || (counted && this.zoneReached >= SEA_I)) M.earlyRun = 0;
      else if (counted && reason !== 'quit' && this.daily == null && this.t >= EARLY_MIN_T) M.earlyRun = Math.min(99, Math.floor(ok(+M.earlyRun, 0)) + 1);
    }
    let baby = null;
    if (this.won) {
      baby = babyFor(this.rng, this.muts); baby.gen = this.gen + 2; baby.run = M.runs;   // the hero is Gen 1, the first baby Gen 2
      if (practice) baby.practice = true; else { M.gen++; M.sinceWin = 0; M.lossRun = 0; M.winStreak = (M.winStreak || 0) + 1; M.lastWinStreak = M.winStreak; M.bestMargin = Math.max(+M.bestMargin || 0, gapSec); }
      M.babies.push(baby); M.wins++;
    }
    const breakdown = { dist: Math.round(bk.dist), place: Math.round(bk.place), combo: Math.round(bk.combo), bank: Math.round(bk.bank), bounty: Math.round(bk.bounty), photo: bk.photo,
      near: bk.near, podium: bk.podium, genMul, autoCut: Math.round(autoCut), dailyBonus, goal: goalDna, medal: medalDna, dailyScale, tough: toughDna, first: firstDna };
    this.over = { reason, cause, rank, dna, dist, baby, combo: Math.floor(p.bestCombo), comboLate: Math.floor(p.bestComboLate || 0), head: this.drill ? this.drill.head : 0, overtakes: p.overtakes, zone: this.zoneReached,
      tier: p.bestTier, synergies: Object.keys(this.syn), comboDna: Math.round(this.dnaFromCombo), daily: this.daily, dailyBest,
      events: this.schedule.filter((e) => p.y >= e.y0).map((e) => e.id),
      by, gapBy, rivalsBeaten: beaten, gapSec, auto, practice, breakdown, dailyBonus, streak: this.daily != null && counted ? streak : 0, goalDone, photo: bk.photo, counted,
      bite: reason === 'wbc' ? this.biteBy || 'wbc' : null, freezeUsed, gooTime: Math.round(this.gooTime * 10) / 10,
      dailyRule: this.dailyRule, medal: this.daily != null ? medal : 0, medalNew, dailyAttempt, dailyScale, featuredTrick: this.featuredTrick, tricks: Object.keys(this.tricksRun || {}),
      // autoPct: the share the autopilot keeps out of the swim's pay (the UI label: 'autopilot -N%')
      autoPct: Math.round(60 * autoFrac) };
    // 'one buy away': the swim's GAS ledger, and the cheapest open Dad's Pick for what ended it
    const swimT = this.drill ? this.drill.t0 : this.t;
    this.over.bridge = { remain: Math.round(this.remaining()), dist: Math.round(dist), gas: r2(this.gasDrain + this.gasOther), drain: r2(this.gasDrain), sugar: r2(this.gasSugar),
      swimT: r2(swimT), fzT: r2(this.fzTime), combo: r2(s.combo) };
    this.over.pickBridge = null;
    const picks = (DAD_PICKS[cause] || []).filter((id) => HABITS[id] && lv(M, id) < maxLv(M, id)).sort((a, b) => habitCost(a, lv(M, a)) - habitCost(b, lv(M, b)));
    if (picks.length) { const w = wouldHave(M, this.over, picks[0]); if (w) this.over.pickBridge = { habit: picks[0], ...w }; }
    if (reason !== 'quit' && !auto) settleGoal(M, this.over);
    this.over.nextGoal = M.goal;
    // RECORDS: what this run improved (a counted, hand-swum run; a first-ever value is no record). No DNA for them
    const recOK = counted && !auto && !crash, records = [];
    if (recOK) {
      M.bestDnaRun = Math.max(num0(M.bestDnaRun), dna);
      if (this.won && !practice) {
        M.bestWinT = num0(M.bestWinT) > 0 ? Math.min(num0(M.bestWinT), this.t) : this.t;
        if (beaten.length === RIVALS.length) M.sweeps = Math.floor(num0(M.sweeps)) + 1;
        M.bestWinStreak = Math.max(num0(M.bestWinStreak), Math.floor(num0(M.winStreak)));
      }
      const now = { margin: num0(M.bestMargin), combo: num0(M.bestCombo), winT: num0(M.bestWinT), dna: num0(M.bestDnaRun), winStreak: num0(M.bestWinStreak), sweep: num0(M.sweeps), streak: num0(M.bestStreak) };
      for (const id of RECORD_IDS) {
        const a = rec0[id], b = now[id];
        if (a > 0 && (id === 'winT' ? b < a : b > a)) records.push({ id, prev: a, now: b });
      }
    }
    this.over.records = records;
    // the Mashup Book: every card taken this swim
    if (!Array.isArray(M.mutsSeen)) M.mutsSeen = [];
    for (const id of Object.keys(this.muts)) if (this.muts[id] > 0 && MUTATIONS[id] && !M.mutsSeen.includes(id)) M.mutsSeen.push(id);
    this.emit('over', this.over);
  }

  progress() { return clamp((this.p.y) / RACE_LEN, 0, 1); }
  remaining() { return Math.max(0, RACE_LEN - 70 - this.p.y); }
}

export { RACE_LEN, ZONES, MUTATIONS, HABITS, HABIT_ORDER, habitCost };
