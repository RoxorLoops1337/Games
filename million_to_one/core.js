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

// ------------------------------------------------------------------ combos, synergies, race events
// DNA multiplier for the current combo chain: x1 at 0, +0.04 per link to x3 at combo 50, then +0.01 per link
// to x4.5 at combo 200 (a monster chain still feels its growth).
export const comboMult = (n) => { n = Math.max(0, n || 0); return 1 + 0.04 * Math.min(n, 50) + 0.01 * clamp(n - 50, 0, 150); };
// combo milestones: 100, 150, 200, then every 100 (emits comboMilestone {n})
export const comboMilestoneAt = (i) => (i < 3 ? [100, 150, 200][i] : 200 + 100 * (i - 2));
const milestonesUpTo = (n) => { let i = 0; while (n >= comboMilestoneAt(i)) i++; return i; };
// STYLE: the number of different link kinds in your last 8 links (1..6) multiplies the chain.
export const styleMult = (style) => 1 + 0.15 * (clamp(style || 1, 1, 6) - 1);
// A banked combo (the timer ran out cleanly) gets a grade: index into BANK_GRADES, from these chain lengths.
export const BANK_AT = [10, 25, 40, 60, 85];
export const bankGrade = (n) => { let g = 0; while (g < BANK_AT.length - 1 && n >= BANK_AT[g + 1]) g++; return g; };
// 0.07 * n^1.4 * style * (1 + clutch). Past the top grade (85) each extra link counts half: monster chains still pay, not explode.
export const bankDna = (n, style, clutch = 0) => { n = Math.max(0, n); if (n > 85) n = 85 + (n - 85) * 0.5; return 0.07 * Math.pow(n, 1.4) * styleMult(style) * (1 + clamp(clutch || 0, 0, 0.5)); };
// FINISHER: cashing a chain out on purpose pays the bank times this. A chain that just runs out pays
// TIMEOUT_BANK (x1 with Echo Chamber or Elephant Brain), so cashing out on purpose is the better play.
export const finisherMult = (style) => (style >= 5 ? 2.0 : style >= 4 ? 1.6 : 1.3);
export const TIMEOUT_BANK = 0.8;
export const FINISHER_BLAST_AT = 25;      // a finisher on a bank this big also blasts (pops Big Macros, shoves rivals)
export const finisherBlastR = (bank) => 120 + 2 * Math.min(Math.max(0, bank), 100);
export const finisherSeed = (bank) => Math.min(8, Math.floor(0.1 * Math.max(0, bank)));   // links the next chain starts with
// combo timer refill for the nth link of the same kind in a row (anti-spam)
export const sameRefill = (run) => (run >= 7 ? 0.4 : run >= 4 ? 0.65 : 1);
// the FRENZY tier your STYLE allows: above 1 needs 3 kinds, above 3 needs 4 kinds
export const styleTierCap = (style) => (style >= 4 ? Infinity : style >= 3 ? 3 : 1);

// FRENZY tiers: each threshold crossed in one unbroken chain climbs a tier. Effects stack upward.
// at: multiple of the base FRENZY threshold (10, or less with Hype Man).
export const FRENZY_TIERS = [
  { name: 'FRENZY!',       at: 1,   speed: 0.3,  desc: 'Faster and louder.' },
  { name: 'MEGA FRENZY!',  at: 2.2, speed: 0.36, desc: 'Pickups fly to you from twice as far.' },
  { name: 'ULTRA FRENZY!', at: 3.8, speed: 0.42, desc: 'Combos last 50% longer.' },
  { name: 'HYPER FRENZY!', at: 5.8, speed: 0.48, desc: 'Acid cannot touch you.' },
  { name: 'GOD MODE!',     at: 8.5, speed: 0.55, desc: 'Nothing can hurt you and DNA blobs pay double.' },
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
export const LINK_DNA = 0.025;      // DNA per combo link, times the chain multiplier

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

// Daily race: the day number (UTC) is the seed, so everybody gets the same egg side and layout.
export const dailySeed = (date = new Date()) => Math.floor(date.getTime() / 86400000);
export function hashSeed(n) { let h = (n | 0) ^ 0x9E3779B9; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); return (h ^ (h >>> 16)) >>> 0; }

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
// Big Macros: they spot you within WBC_SPOT_D and wind up for WBC_SPOT_T s before hunting. A swat gives SWAT_SAFE s
// in which a Big Macro touch bonks it away. After the rookie runs every run has one spare bite (SPARE_BITE energy).
export const WBC_SPOT_D = 440, WBC_SPOT_T = 0.35, SWAT_SAFE = 0.35, SPARE_BITE = 35;
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
export const HABIT_FX = { broccoli: 0.05, water: 12, sleep: 0.05, jeans: 250, berries: 0.1, walk: 0.08, beatbox: 0.25, hottub: 1, meditate: 1 };
const GRANDAD = ['broccoli', 'water'];   // habits that keep growing with every generation
export const genFactor = (gen) => 1 + 0.15 * Math.min(Math.max(0, gen || 0), 10);   // DNA multiplier per generation
export const META_VER = 2;     // 2: the hero is Gen 1, so saved babies moved up one generation
// how much faster each generation makes the field: +3%/gen for gens 1..4, +1.5%/gen after, capped at gen 12
export const genSpeed = (gen) => { const g = clamp(Math.floor(gen || 0), 0, 12); return 1 + 0.03 * Math.min(g, 4) + 0.015 * Math.max(0, g - 4); };
// named rivals get +0.5%/gen on top (also capped at gen 12)
export const bossGenSpeed = (gen) => genSpeed(gen) + 0.005 * clamp(Math.floor(gen || 0), 0, 12);
// rookie grace for the first five runs (never in the daily): 0 when off, else the drain/acid factor
export const ROOKIE_TAPER = [0.55, 0.65, 0.75, 0.85, 0.93];
export const rookieFactor = (meta, daily) => (daily == null && meta && (meta.runs || 0) < ROOKIE_TAPER.length ? ROOKIE_TAPER[Math.max(0, Math.floor(meta.runs || 0))] : 0);
// the named rivals take longer to reach the egg on the first three runs (never in the daily)
export const ROOKIE_BOSS = [1.22, 1.15, 1.08];
export const rookieBossT = (meta, daily) => { const n = Math.floor((meta && meta.runs) || 0); return daily == null && n >= 0 && n < ROOKIE_BOSS.length ? ROOKIE_BOSS[n] : 1; };
// every 'late' loss before you even reached the egg slows the named rivals by 5% (up to 4 of them), never in the daily.
// A win halves the count (end()), so the cushion fades instead of vanishing.
export const RACE_LOSS_T = 0.05, RACE_LOSS_N = 4;
export const raceLossT = (meta, daily) => (daily == null ? 1 + RACE_LOSS_T * clamp(Math.floor((meta && meta.raceLosses) || 0), 0, RACE_LOSS_N) : 1);
// a new generation eases in: the first run after a real win gives the named rivals FRESH_GEN more time, the second half
// that (meta.sinceWin; never in the daily, never at gen 0). The win still brings a faster field, just not a wall.
export const FRESH_GEN = 0.08;
export const freshGenT = (meta, daily) => { const n = Math.floor((meta && meta.sinceWin) ?? 99); return daily == null && meta && (meta.gen || 0) > 0 && n < 2 ? 1 + FRESH_GEN * (n ? 0.5 : 1) : 1; };
// the long tail of the Rapids: a named rival more than BAND_D ahead of you there slows by 1 per BAND_W of lead,
// to x BAND_MIN at most (a claim while you are still in the Rapids would be a chase you could never win)
export const BAND_D = 4000, BAND_W = 30000, BAND_MIN = 0.85;
// the fixed first deal of a brand-new save: Turbo Tail, Whiplash (together: Afterburner) and Nitro Frenzy
export const FIRST_DEAL = ['turbo', 'whip', 'nitro'];
export const WIN_BONUS = 220;     // DNA for a win (not an autopilot one), before the generation multiplier
export const GOAL_IDS = ['beatRival', 'reachEgg', 'reachZone', 'combo'];

export function newMeta() {
  return { v: 1, ver: META_VER, dna: 0, habits: {}, gen: 0, best: TOTAL_SWIMMERS, runs: 0, wins: 0, babies: [], lastSeen: 0, bank: 0, introSeen: false, muted: false, bestCombo: 0, autopilot: false,
    dailyDay: -1, dailyBest: TOTAL_SWIMMERS, dailyRuns: 0, synergiesSeen: [], dailyStreak: 0, dailyLastDay: -1, bestRivals: 0, rivals: {},
    eggLosses: 0, bestStreak: 0, goal: null, quits: 0, raceLosses: 0, dailyLastAt: 0, sinceWin: 99 };
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
  for (const k of ['gen', 'runs', 'wins', 'bestCombo', 'dailyRuns', 'dailyStreak', 'bestRivals', 'bank', 'eggLosses', 'bestStreak', 'quits', 'raceLosses', 'sinceWin']) if (!isFinite(m[k]) || m[k] < 0) m[k] = 0;
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
    case 'broccoli': return { label: '+' + pct(HABIT_FX.broccoli * l) + ' swim speed', value: HABIT_FX.broccoli * l };
    case 'water':    return { label: '+' + HABIT_FX.water * l + ' max energy', value: HABIT_FX.water * l };
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
export const factoryRateAt = (l, gen) => Math.round(25 * Math.pow(1.22, l) * Math.sqrt(genFactor(gen)));
export const factoryRate = (meta) => factoryRateAt(lv(meta, 'factory'), meta.gen);
export const factoryCapHours = (meta) => Math.min(24, 8 + 1.6 * lv(meta, 'factory'));
export function idleTick(meta, now) {
  if (!isFinite(now)) return meta.bank;
  if (!meta.lastSeen) { meta.lastSeen = now; return 0; }
  if (now < meta.lastSeen) return meta.bank;      // the clock went backwards: never rewind lastSeen (no free hours later)
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
  let g;
  if (ahead >= 0) g = { id: 'beatRival', target: 0, dna: 40, k: ahead };
  else if (atEgg) g = { id: 'combo', target: Math.floor(over.combo || 0) + 5, dna: 15, k: -1 };
  else if (k >= 0) g = { id: 'beatRival', target: 0, dna: 30, k };
  else if (lost && zone === EGG_I - 1) g = { id: 'reachEgg', target: EGG_I, dna: 40, k: -1 };
  else if (over.reason !== 'win' && (over.zone || 0) + 2 <= EGG_I && !(meta.goal && meta.goal.id === 'reachZone')) g = { id: 'reachZone', target: (over.zone || 0) + 2, dna: 20, k: -1 };
  else g = { id: 'combo', target: Math.floor(over.combo || 0) + 5, dna: 15, k: -1 };
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
// the bonus a counted daily pays on day n of a streak (every 7th day pays double)
export const dailyBonusFor = (streak, gen) => { const n = Math.max(1, Math.floor(streak || 1)); return Math.round(25 * Math.min(n, 7) * genFactor(gen)) * (n % 7 === 0 ? 2 : 1); };

// ------------------------------------------------------------------ the race
export class Race {
  constructor(meta, rng = Math.random, opts = {}) {
    this.meta = meta; this.rng = rng; this.t = 0; this.events = [];
    this.gen = meta.gen || 0;
    this.muts = {}; this.syn = {}; this.pending = null; this.pendingMid = false; this.rerolls = lv(meta, 'meditate');
    this.draftN = 0; this.midDraft = false; this.noLeg = 0; this.firstDealt = false;
    // rookie grace (first three runs, never the daily) is worked out from the save, no UI flag needed
    this.rookie = rookieFactor(meta, opts.seed != null && isFinite(opts.seed) ? opts.seed : null); this.biteFree = -1;
    this.over = null; this.won = false; this.paused = false;
    // layout seed: a daily race (opts.seed = day number) fixes the egg side, the field, the
    // spawn layout, the events and the card offers; otherwise it comes from rng.
    this.daily = opts.seed != null && isFinite(opts.seed) ? Math.floor(opts.seed) : null;
    this.layoutSeed = this.daily != null ? hashSeed(this.daily) : Math.floor(rng() * 4294967296) >>> 0;
    const lrng = mulberry(this.layoutSeed);
    this.orng = this.daily != null ? mulberry(this.layoutSeed ^ 0x5BD1E995) : rng;
    this.eggSide = lrng() < 0.5 ? -1 : 1;
    this.autoFork = rng() < 0.75 ? this.eggSide : -this.eggSide;   // the autopilot sniffs the right tube 3 times in 4
    this.schedule = opts.events === false ? [] : this.planEvents(lrng);
    this.ev = null;
    this.input = { tx: null, dir: 0, dash: false, tap: 0, touch: false, cashOut: false };
    this.bot = !!opts.bot;                           // test bot: steers like the autopilot but plays like a person
    this.autopilot = !!opts.autopilot || this.bot; this.autoT = 0;
    // after generation 3 the tube itself gets nastier, one step per generation (never in the daily: same layout for everybody)
    this.hzGen = this.daily == null ? clamp(this.gen - 3, 0, 6) : 0;
    // the wall clock for the daily streak (opts.now in ms); a daily for another day than today counts at its noon
    this.now = isFinite(opts.now) ? +opts.now : null;
    this.biteUsed = 0;          // the one spare Big Macro bite a run gets after the rookie runs
    this.goalSeen = false;      // goalMet is emitted at most once per run
    this.lastWbcY = {};         // per tube side: the last Big Macro row (spawn spacing)
    this.ciliaYs = [];          // recent wall hairs {y, side} (no Big Macro next to one)
    const startY = 40 + HABIT_FX.jeans * lv(meta, 'jeans');
    const maxE = 100 + HABIT_FX.water * lv(meta, 'water');
    this.p = { x: VIEW_W / 2, y: startY, vx: 0, vy: 0, e: maxE, maxE, shield: lv(meta, 'hottub'), dashT: 0, dashCd: 0, frenzyT: 0, nextFrenzy: 10,
      combo: 0, comboT: 0, comboMax: 2.2, tier: 0, fz: 0, fzPen: 0, fzPts: 0, bestTier: 0, mult: 1, bestCombo: 0, kinds: [], style: 1, bank: 0,
      draft: 0, comeback: 0, side: 0, stuck: 0, inv: 0, acid: 0, wing: 0, second: 0, overtakes: 0, heading: 0, swatT: 0, swatDir: 0, current: 0,
      sameRun: 0, lastKind: '', clutch: 0, couchT: 0, acidT: -99, zoneBonks: 0, lastHit: '',
      frenzyTier: 0, swatSafe: 0, actT: 0, lastTx: null };
    this.startY = startY; this.prevPY = startY;
    this.dnaRun = 0; this.dnaBank = 0; this.dnaBonus = 0; this.zoneReached = 0; this.cleared = 0; this.ciliaN = 0;
    this.ents = []; this.genY = Math.ceil((startY + 300) / 100) * 100;   // rows on a fixed 100 grid (same daily layout for everyone)
    this.drill = null;   // egg phase
    this.claimed = null; this.eggTaken = null; this.rdLevel = 0;
    this.fx = [];        // short-lived world effects for the renderer (eaten rivals etc.)
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
      const a = { y: 0, lane, side, lane2: clamp(Math.abs(lane) / 0.9 * 2 - 1, -0.9, 0.9), sp: 0, stam: lrng(), alive: true, zone: -1, deathY: Infinity, ph: lrng() * 6.28,
        kx: 0, arrived: false, drill: 0, need: EGG_DRILL, w: 1, face: Math.floor(lrng() * 6), k: -1, tauntT: 0, bumpT: 0, passT: 0, group: 'A',
        boss: null, acc: 0, zoneEnd: -Infinity, sph: 0, cph: 1, bumped: 0, arrivedT: 0, diedT: 0, sprint: 0, passedOnce: 0, draftedT: -9 };
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
    const bossT = this.rookieBoss * raceLossT(meta, this.daily) * freshGenT(meta, this.daily);
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
  }

  // ---------------------------------------------------------------- derived stats
  refreshStats() {
    const m = this.muts, M = this.meta, s = {}, syn = this.syn;
    s.speed = 445 * (1 + HABIT_FX.broccoli * lv(M, 'broccoli')) * (1 + 0.1 * Math.min(m.turbo || 0, MUTATIONS.turbo.max)) * (1 + 0.04 * (m.bloom ? this.cleared : 0)) * (syn.comeback && this.p.comeback ? 1.1 : 1);
    s.drain = 4.3 * Math.pow(1 - HABIT_FX.sleep, lv(M, 'sleep')) * Math.pow(0.82, m.eco || 0);
    s.draft = 0.2 * (1 + 0.6 * (m.draft || 0)) * (1 + HABIT_FX.walk * lv(M, 'walk'));
    s.sugar = 6 * (1 + HABIT_FX.berries * lv(M, 'berries')) * (1 + 0.5 * (m.sweet || 0));
    s.magnet = 34 + 45 * (m.magnet || 0);
    s.acid = 26 * Math.pow(0.4, m.antacid || 0) * (this.rookie || 1);
    s.combo = 2.2 + 1 * (m.memory || 0) + HABIT_FX.beatbox * lv(M, 'beatbox');
    s.dashCd = 3 * Math.pow(0.65, m.whip || 0);
    s.dashLen = syn.afterburner ? 1.4 : 1;
    s.dashCost = 8 * Math.pow(0.7, m.whip || 0);
    const hy = clamp(m.hype || 0, 0, 2);        // Hype Man: the second level is a smaller step (no always-on FRENZY)
    s.frenzyAt = 10 - [0, 3, 4.5][hy];
    s.frenzyLen = 3.5 + [0, 2, 3][hy] + (syn.supernova ? 1.5 : 0);
    s.dnaBlob = 5 + 2 * (m.lucky || 0);
    s.keep = syn.elephant ? 0.75 : m.echo ? 0.5 : 0;     // share of a dropped combo that survives
    s.ramW = syn.bulldozer ? 30 : 16;
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
      const zid = ZONES[zi].id, pool = EVENT_ORDER.filter((id) => !used.has(id) && RACE_EVENTS[id].zones.includes(zid));
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
  offer() {
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
    const t = clamp((d - 1) / 4, 0, 1), RW = [lerp(10, 6, t), lerp(4, 5, t), lerp(2, 3, t) * (golden ? 2 : 1)];
    // Antacid Coat past the Acid Lagoon is a weak card: dealt a quarter as often (unless it completes Hazmat)
    const late = (id) => (id === 'antacid' && this.zoneReached > ACID_I && !comp.has(id) ? 0.25 : 1);
    const wOf = (id) => RW[MUTATIONS[id].r - 1] * (comp.has(id) ? 3 : 1) * late(id);
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
    if (forced.length && rng() < 0.5) add(take(forced));
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
  reroll() { if (!this.pending || this.rerolls <= 0) return false; this.rerolls--; this.offer(); return true; }
  choose(id) {
    if (!this.pending || !this.pending.includes(id)) return false;
    this.muts[id] = (this.muts[id] || 0) + 1; this.pending = null; this.pendingMid = false;
    const p = this.p;
    if (id === 'tank') { p.maxE += 30; p.e = p.maxE; }
    if (id === 'helmet') p.shield++;
    if (id === 'wingman') p.wing = this.muts.wingman;
    if (id === 'second') p.second = 1;
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
      const ev = this.eventAt(y), evId = ev ? ev.id : '';
      const sugarP = (hz.sugar || 0) * 0.06 * (evId === 'sugarRush' ? 3 : 1) * (zi === 0 && this.rookie && !(this.meta.runs > 0) ? 1.4 : 1);
      const dnaP = 0.012 * (1 + 0.5 * (m.lucky || 0)) * (evId === 'goldRush' ? 6 : 1);
      // rookies meet a few fewer Big Macros (x0.82 on run 1, back to x1 after run 5)
      const wbcP = ((hz.wbc || 0) * 0.05 + (evId === 'stampede' ? 0.07 : 0)) * (1 + 0.1 * hg) * (this.rookie ? 0.6 + 0.4 * this.rookie : 1);
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
        if (hz.acid && rng() < 0.2 * hz.acid) {
          const e = { t: 'acid', x: rx(), y: y + rng() * 100, r: Math.min(26 + rng() * 40, blob), seed: rng() * 9 };
          if (!nearGate) { this.puddles.push({ x: e.x, y, r: e.r, side }); if (hostile) this.ents.push(e); }
        }
        if (hz.alkali && rng() < 0.06 * hz.alkali) this.ents.push({ t: 'alkali', x: rx(), y: y + 50, r: 11 });
        if (hz.goo && rng() < 0.1 * hz.goo) {
          const e = { t: 'goo', x: rx(), y: y + rng() * 100, r: Math.min(30 + rng() * 34, blob), seed: rng() * 9 };
          if (!nearGate) { this.puddles.push({ x: e.x, y, r: e.r, side }); if (hostile) this.ents.push(e); }
        }
        if (gateHere) {
          const gw = Math.max(66, 78 - 3 * hg) + rng() * 30, n2 = rng() < 0.45 ? 2 : 1, gaps = [];
          for (let k = 0; k < n2; k++) gaps.push(bl + gw / 2 + 1 + rng() * Math.max(0, br - bl - gw - 2));
          if (hostile) this.ents.push({ t: 'gate', x: ch.c, y, r: ch.h, gaps, gw, side, bonkT: 0, contact: 0 });
        }
        if (wbcP && rng() < wbcP) {
          const e = { t: 'wbc', x: rx(), y: y + 50, r: 22 + rng() * 8, vx: 0, vy: 0, hunt: 0, eat: 0, ph: rng() * 6, spot: 0, side };
          // never parked on a puddle from the last two rows: up to 3 re-rolls of x
          const onPuddle = () => this.puddles.some((q) => q.side === side && Math.abs(q.x - e.x) < q.r + 40);
          for (let k = 0; k < 3 && onPuddle(); k++) e.x = rx();
          // fair Big Macros: one per 380 on a side (240 in a stampede), and none within 300 of a wall hair.
          // (the rolls above are always drawn, so the daily layout stays the same for everybody)
          const last = this.lastWbcY[side], gap = evId === 'stampede' ? 240 : 380;
          const spaced = !(last != null && Math.abs(e.y - last) < gap) && !this.ciliaYs.some((c) => c.side === side && Math.abs(c.y - e.y) < 300);
          if (spaced && !gateHere) { this.lastWbcY[side] = e.y; if (hostile) this.ents.push(e); }
        }
        if (hz.current && rng() < 0.03 * hz.current) { const e = { t: 'current', x: ch.c, y, r: ch.h, h: 260 + rng() * 200, dir: rng() < 0.5 ? -1 : 1 }; if (hostile) this.ents.push(e); }
        if (hz.cilia && rng() < 0.05 * hz.cilia) {   // a little hair on one wall that swats you aside on the beat
          const wall = this.ciliaN++ % 2 ? 1 : -1, len = 0.45 + rng() * 0.2, beat = 60 / (z.beat || 120);
          const period = Math.max(2, Math.round(1.6 / beat)) * beat;
          const e = { t: 'cilia', x: ch.c + wall * ch.h, y: y + 50, r: len * 2 * ch.h, wall, len, period, off: Math.floor(rng() * 8) * beat, state: 0, phase: 0 };
          if (hostile) this.ents.push(e);
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
    if (!this.threatSent) { this.threatSent = true; if (this.threatK >= 0) this.emit('threat', { k: this.threatK, boss: RIVALS[this.threatK].name }); }
    if (this.drill) { this.input.cashOut = false; this.stepDrill(dt); return; }
    if (this.input.cashOut) { this.input.cashOut = false; this.cashOut(); }
    this.spawnAhead();
    if (this.autopilot) this.autoSteer();

    // zone progress and mutation drafts (none at the egg: it is time to drill, not shop)
    const zi = zoneIndex(p.y);
    if (zi > this.zoneReached) {
      this.zoneReached = zi; this.cleared = zi; p.wing = this.muts.wingman || 0; p.zoneBonks = 0;
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
    if (p.combo > 0) { p.comboT -= dt; if (p.comboT <= 0) this.dropCombo(); }
    const frenzy = p.frenzyT > 0, nitro = frenzy && this.muts.nitro, tier = frenzy ? p.tier : 0;
    const safe = nitro || tier >= 5;            // nothing can hurt you
    const ev = this.ev ? this.ev.id : '';

    // dash
    const jet = this.syn.jetstream && p.draft > 0.08;
    if (this.input.dash && p.dashCd <= 0 && (p.e > s.dashCost || nitro || jet)) {
      p.dashT = (jet ? 0.85 : 0.55) * s.dashLen; p.dashCd = s.dashCd; if (!nitro && !jet) p.e -= s.dashCost;
      if (this.syn.afterburner && p.frenzyT > 0) p.frenzyT = Math.min(p.frenzyT + 0.3, s.frenzyLen * 2);
      p.actT = 0;
      this.emit('dash', { jet });
    }
    this.input.dash = false;

    // steering: a finger gets a snappier, damped response; keys and the autopilot keep the softer one
    const ch = channel(p.y, p.side);
    let tx = this.input.tx;
    if (tx != null && !isFinite(tx)) tx = this.input.tx = null;
    if (tx == null && this.input.dir) tx = p.x + this.input.dir * 120;
    const touch = this.input.touch && !this.autopilot && tx != null;
    // the thumb matters: p.actT is the time since the last real input (a steer target moved 20+, a dash, a draft)
    if (tx != null && (p.lastTx == null || Math.abs(tx - p.lastTx) > 20)) { p.lastTx = tx; p.actT = 0; }
    if (p.draft > 0.1 && tx != null) p.actT = 0;          // holding a draft counts while you steer, not while you drift
    let want = 0;
    if (tx != null) {
      want = (tx - p.x) * (touch ? 22 : 9);
      if (touch) want -= p.vx * 0.1;
      // a finger at speed can move further sideways (last step's forward speed, up to x1.35)
      const cap = touch ? (p.dashT > 0 ? 560 : 460) * clamp(p.vy / 445, 1, 1.35) : 460;
      want = clamp(want, -cap, cap);
    }
    p.vx += (want - p.vx) * Math.min(1, dt * (touch ? 30 : 12));
    if (ev === 'sneeze') p.vx += Math.sin(this.t * 2.6) * 420 * dt;    // turbulence

    // drafting: tuck in behind a rival
    let target = null, bestD = 1e9;
    for (const a of this.agents) {
      if (!a.alive || a.arrived) continue;
      const dy = a.y - p.y; if (dy < 12 || dy > 95) continue;
      if (p.y >= FORK_Y0 && a.side !== p.side) continue;
      const dx = Math.abs(this.agentX(a) - p.x); if (dx < 20 && dy < bestD) { bestD = dy; target = a; }
    }
    // a draft you drift into with no hands is half as strong: tucking in is something the thumb does
    const lazy = p.actT >= IDLE_T && tx == null ? IDLE_DRAFT : 1;
    p.draft += ((target ? s.draft * (ev === 'slipstream' ? 2 : 1) * lazy : 0) - p.draft) * Math.min(1, dt * (target ? 3 : 5));
    this.draftTarget = target; if (target) target.draftedT = this.t;

    // currents: a real sideways push; swimming with it is a little faster, against it a little slower
    let cur = null;
    for (const e of this.ents) if (e.t === 'current' && p.y > e.y && p.y < e.y + e.h) { cur = e; break; }
    p.current = cur ? (p.vx * cur.dir > 30 ? 1 : p.vx * cur.dir < -30 ? -1 : 0) : 0;

    // forward speed
    let sp = s.speed * (1 + p.draft + (tier ? FRENZY_TIERS[Math.min(tier, FRENZY_TIERS.length) - 1].speed : 0) + (p.dashT > 0 ? 0.75 : 0));
    if (ev === 'espresso') sp *= 1.12;
    if (zi === 0 && p.actT >= IDLE_T) sp *= IDLE_LAUNCH;     // hands off in the Launch Tube: the pack keeps up with you
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
    p.x += p.vx * dt;
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
    if (!couch) p.e -= s.drain * (1 + 0.05 * zi) * dt * (drafting ? 0.65 : 1) * (ev === 'espresso' ? 1.25 : 1) * (this.rookie && zi < EGG_I ? this.rookie : 1);
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
      if (p.second) {
        p.second = 0; p.e = 60; p.inv = 2;
        if (this.syn.reserveTank) { p.e = p.maxE; p.shield++; }
        this.emit('second', { reserve: !!this.syn.reserveTank });
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
    const p = this.p, s = this.s, frenzy = p.frenzyT > 0;
    if (frenzy && this.muts.chain && kind !== 'domino') {   // (a Domino knock is exactly +1 a rival)
      n *= 2;
      if (kind === 'pass') p.frenzyT = Math.max(p.frenzyT, Math.min(p.frenzyT + 0.2, s.frenzyLen * 2));
    }
    // same kind in a row: from the 4th a plain pass is only half a link, and the timer refills less
    p.sameRun = kind === p.lastKind ? p.sameRun + 1 : 1; p.lastKind = kind;
    if (kind === 'pass' && p.sameRun >= 4) n *= p.sameRun >= 12 ? 0.25 : 0.5;   // and from the 12th only a quarter
    // CLUTCH: a link landed in the last quarter of the timer is +1 and grows the bank multiplier
    // (spam does not count: the 4th+ same-kind link in a row only ever refills part of the timer)
    const clutch = p.combo > 0 && p.comboT > 0 && p.comboT < 0.25 * p.comboMax && p.sameRun < 4;
    if (clutch) { n += 1; p.clutch = Math.min(0.5, Math.round((p.clutch + 0.1) * 10) / 10); }
    // style: different moves in a row are worth more; spamming one move climbs FRENZY at half speed
    const K = p.kinds, fresh = !K.includes(kind);
    const rep = K.length >= 3 && K[K.length - 1] === kind && K[K.length - 2] === kind && K[K.length - 3] === kind;
    K.push(kind); if (K.length > 8) K.shift();
    p.style = Math.min(6, new Set(K).size);
    p.combo += n; p.bank += n;
    if (rep) p.fzPen += n * 0.5;
    const long = (frenzy && p.tier >= 3 ? 1.5 : 1) * (this.evIs('disco') ? 1.5 : 1);
    p.comboMax = s.combo * long; p.comboT = p.comboMax * sameRefill(p.sameRun);
    p.bestCombo = Math.max(p.bestCombo, p.combo);
    p.mult = comboMult(p.combo) * styleMult(p.style);
    const gain = LINK_DNA * n * p.mult * (this.evIs('disco') ? 2 : 1);
    this.dnaRun += gain; this.dnaFromCombo += gain - LINK_DNA * n;
    this.emit('combo', { kind, n: Math.floor(p.combo), x, y, mult: p.mult, style: p.style, fresh, same: p.sameRun, clutch });
    if (clutch) this.emit('clutch', { x, y, n: Math.floor(p.combo), mult: p.clutch });
    p.mileI = p.mileI || 0;
    while (p.combo >= comboMilestoneAt(p.mileI)) this.emit('comboMilestone', { n: comboMilestoneAt(p.mileI++), x, y });
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
    if (!keep) { p.kinds.length = 0; p.style = 1; p.mult = 1; p.sameRun = 0; p.lastKind = ''; }
  }
  // pay the bank (a run-out at x0.8, or a FINISHER at x1.3..2) and reset the clutch.
  // comboBank: {n, dna, grade (0..4), style, clutch, finisher, mult, blastN}
  payBank(fin, blastN = 0) {
    const p = this.p;
    if (p.bank < 3) { p.bank = 0; p.clutch = 0; return 0; }
    const fm = fin ? finisherMult(p.style) : this.s.keep > 0 ? 1 : TIMEOUT_BANK;
    const dna = bankDna(p.bank, p.style, p.clutch) * (this.evIs('disco') ? 2 : 1) * fm;
    this.dnaRun += dna; this.dnaBank += dna;
    this.emit('comboBank', { n: Math.floor(p.bank), dna: Math.round(dna * 10) / 10, grade: bankGrade(p.bank), style: p.style, x: p.x, y: p.y, clutch: p.clutch,
      finisher: !!fin, mult: fm, blastN });
    p.bank = 0; p.clutch = 0;
    return dna;
  }
  // a combo ran out cleanly: BANK it for DNA. Echo Chamber keeps part of the chain going.
  dropCombo() {
    const p = this.p, s = this.s, n = p.combo;
    this.payBank(false);
    const keep = s.keep ? Math.floor(n * s.keep) : 0;
    if (n >= 3) this.emit('comboEnd', { n: Math.floor(n), kept: keep });
    p.fzPen = n > 0 ? p.fzPen * keep / n : 0;
    p.combo = keep; p.comboT = keep ? s.combo : 0; p.comboMax = s.combo;
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
    p.fzPen = 0; p.combo = seed; p.bank = seed; p.comboT = seed ? s.combo : 0; p.comboMax = s.combo;
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
    p.bank = 0; p.clutch = 0;
    p.fzPen = p.fzPen * keep / n;
    p.combo = keep; p.comboT = keep ? s.combo : 0; p.comboMax = s.combo;
    this.resetTier(keep);
    this.emit('comboBreak', { n: Math.floor(n), kept: keep, why, x: x != null ? x : p.x, y: y != null ? y : p.y });
  }
  // the whole chain is gone (the spare bite): no bank, nothing kept
  loseCombo(why, x, y) {
    const p = this.p, n = p.combo;
    p.bank = 0; p.clutch = 0;
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
  // the drill a rival needs: the base plus the seconds you still need to reach the egg (at 85% of your speed,
  // up to 9 more; fixed when it arrives), so a claim is a chase you can win. Once you are drilling a newcomer
  // never needs less than you do.
  rivalNeed() {
    // the chase cap: 15 s at gen 0, easing to 9 s by gen 8 (a far-off claim is a long chase for a new family)
    const base = EGG_DRILL + clamp(this.remaining() / (0.85 * this.s.speed), 0, 9 + 6 * clamp(1 - this.gen / 8, 0, 1));
    return this.drill ? Math.max(base, this.drill.need) : base;
  }
  // a rookie run's finale sprinters swim to the egg slower (rookieBossT) but drill by the same factor faster:
  // a new player gets to see the egg and lose a photo finish before the egg-loss boost tips the scales
  drillRate(a) { return a.boss ? (a.boss.drill || 1) * (a.drillK || 1) * (a.sprint && this.finaleT != null ? this.rookieBoss || 1 : 1) : 0.9; }
  // the player's drill: the base plus 0.15 per generation (to gen 8)
  playerNeed() { return EGG_DRILL + 0.15 * Math.min(this.gen, 8); }
  // +6% drill speed per egg lost in a row (cap +24%)
  eggBoost() { return 1 + 0.06 * Math.min(4, Math.max(0, (this.meta && this.meta.eggLosses) || 0)); }
  arrive(a) {
    a.arrived = true; a.arrivedT = this.t; a.y = RACE_LEN - 70; a.need = a.sprint && this.rookieBoss > 1 && this.finaleT != null ? Math.max(EGG_DRILL, this.playerNeed()) : this.rivalNeed(); a.drill = 0; a.shoveT = 1.4;
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
    const picks = cand.slice(0, 2);
    picks.forEach((a, i) => {
      // a rival you can see is never teleported: it just finds a sprint. Off screen, A is brought up to 700
      // ahead of you and B is pulled up to 450 behind (never pushed back).
      if (Math.abs(a.y - p.y) < 650) a.sp = Math.max(a.sp, s.speed * 1.06);
      else {
        if (i === 0) a.y = Math.max(a.y, p.y + 700);
        else if (a.y < p.y - 450) a.y = p.y - 450;
        a.sp = Math.max(a.sp, s.speed * 1.03);
      }
      a.sprint = 1; a.zoneEnd = -Infinity; a.met = true;
      sprinters.push(a.boss.name); ks.push(a.k);
    });
    // fallback: any other named rival right behind you finds a last gear
    for (const a of this.agents) if (a.boss && a.alive && !a.arrived && !picks.includes(a) && a.side === this.eggSide && p.y - a.y >= 0 && p.y - a.y <= 3000) { a.sp *= 1.18; a.sprint = 1; sprinters.push(a.boss.name); ks.push(a.k); }
    this.finaleT = this.t;
    this.emit('finale', { sprinters, ks });
  }

  stepAgents(dt) {
    const p = this.p, rng = this.rng, ev = this.ev ? this.ev.id : '';
    const evSp = ev === 'espresso' ? 1.12 : ev === 'slipstream' ? 1.05 : 1, sneeze = ev === 'sneeze';
    const ramW = this.s.ramW, zone0 = this.zoneReached === 0, active = p.actT < IDLE_T;
    // Bloodhound: overtakes in the zone after the Fork count double (on the right side)
    const hound = this.syn.bloodhound && this.zoneReached === FORK_I + 1 && p.side === this.eggSide ? 2 : 1;
    let rank = 1, alive = 1;
    const st = Math.sin(this.t * 1.7), ct = Math.cos(this.t * 1.7), n = (this.stepN = (this.stepN || 0) + 1);
    const kdamp = Math.pow(0.1, dt), py = p.y;
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
      // the long tail of the Rapids: a named rival far ahead of you there tires (down to x BAND_MIN), so a claim
      // at the egg is still a chase you can win (never in the daily, never a finale sprinter)
      if (a.boss && !a.sprint && this.daily == null && a.y > RAPIDS_Y && a.y - py > BAND_D) sp *= Math.max(BAND_MIN, 1 - (a.y - py - BAND_D) / BAND_W);
      if (z.current) sp *= 1 - z.current * 0.75;
      sp *= (1 + 0.06 * (st * a.cph + ct * a.sph)) * evSp;
      if (sneeze) a.kx += Math.sin(this.t * 2.6 + a.ph) * 1.5 * adt;
      const wasAhead = a.y > this.prevPY;
      a.y += sp * adt;
      a.kx *= adt === dt ? kdamp : Math.pow(0.1, adt);
      if (a.y >= a.deathY || (a.side !== this.eggSide && a.y >= DEAD_Y)) { this.killAgent(a, 'pop'); continue; }
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
          else if (active && (!zone0 || p.dashT > 0 || (p.draft > 0.08 && this.t - a.draftedT < 1) || dx < 70)) this.addCombo('pass', ax, a.y, hound);
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
          a.bumped = 1; a.bumpT = 0.6; a.kx += (ax < p.x ? -2.2 : 2.2) * (dozer ? 1.6 : 1); a.y -= dozer ? 45 : 30; p.e += 3 + (dozer ? 1.5 * (this.muts.rush || 0) : 0);
          this.addCombo('bump', ax, a.y); this.emit('bump', { x: ax, y: a.y, dozer, boss: a.boss ? a.boss.name : null, k: a.boss ? a.k : -1 });
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
    if (!goalMet(g, { won: false, zone: this.zoneReached, combo: p.bestCombo, beaten })) return;
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
    if (Math.abs(a.y - this.p.y) < 700) this.fx.push({ t: how, x: this.agentX(a), y: a.y, age: 0 });
  }

  stepEnts(dt, frenzy, nitro, tier = 0) {
    const p = this.p, s = this.s, magnet = s.magnet * (tier >= 2 ? 2 : 1);
    // pickups ride half the chain multiplier (style is for links), GOD MODE doubles them
    const dnaMul = (1 + (comboMult(p.combo) - 1) * 0.5) * (tier >= 5 ? 2 : 1);
    for (const e of this.ents) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (e.t === 'sugar' || e.t === 'dna' || e.t === 'shield' || e.t === 'alkali') {
        if (d < magnet + e.r) { const k = Math.min(1, dt * 9); e.x -= dx * k; e.y -= dy * k * 0.7; }
        if (d < e.r + 12) {
          e.dead = 1;
          if (e.t === 'sugar') { p.e += s.sugar; this.dnaRun += 0.02 * dnaMul; this.emit('sugar', { x: e.x, y: e.y }); if (this.syn.sugarHigh) this.addCombo('sugar', e.x, e.y); }
          else if (e.t === 'dna') {
            const g = s.dnaBlob * dnaMul; this.dnaRun += g; this.dnaFromCombo += g - s.dnaBlob; this.emit('dna', { x: e.x, y: e.y, amount: Math.round(g) });
            if (this.syn.jackpot && p.frenzyT > 0) this.addCombo('dna', e.x, e.y);
          }
          else if (e.t === 'shield') { p.shield++; this.emit('shield', { x: e.x, y: e.y }); }
          else { p.e += 6; p.acid = 0; this.emit('alkali', { x: e.x, y: e.y }); }
        }
      } else if (e.t === 'wbc') {
        e.ph += dt;
        const was = e.hunt;
        if (e.cool > 0) { e.cool -= dt; e.hunt = Math.max(0, e.hunt - dt); }      // a paid dodge: it sulks before locking on again
        else if (d < WBC_SPOT_D && dy > -60) {
          // the wind-up: it SPOTS you first (0.35 s, e.spot 0..0.35) and only then hunts. A cell already hunting skips it.
          if (!(e.spot >= WBC_SPOT_T) && !(e.hunt > 0)) {
            if (!(e.spot > 0)) { e.spot = 0; this.emit('spot', { x: e.x, y: e.y }); }
            e.spot = Math.min(WBC_SPOT_T, e.spot + dt);
          } else e.hunt = Math.min(1, e.hunt + dt * 2);
        }
        if (was < 0.5 && e.hunt >= 0.5) this.emit('lockon', { x: e.x, y: e.y });
        const spd = 190 * e.hunt, slow = e.eat > 0 ? 0.15 : 1;                    // mid-snack it barely moves
        e.vx += ((dx < 0 ? 1 : -1) * spd - e.vx) * Math.min(1, dt * 3);
        e.vy += ((dy > 0 ? -spd * 0.6 : 0) - e.vy) * Math.min(1, dt * 2);
        e.x += (e.vx * dt + Math.sin(e.ph * 2) * 10 * dt) * slow; e.y += e.vy * dt * slow;
        // snack on rivals that swim through
        for (const a of this.agents) if (a.alive && !a.arrived && !a.boss && Math.abs(a.y - e.y) < e.r && Math.abs(this.agentX(a) - e.x) < e.r) {
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
          else if (this.rookie && this.biteFree !== this.zoneReached && ((this.meta.runs || 0) < 3 || this.zoneReached >= SEA_I)) {   // rookie grace: the first bite per zone is on the house (runs 3-4: from the sea on)
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
    if (this.ents.length > 400 || (this.t % 1 < dt)) this.ents = this.ents.filter((e) => !e.dead && e.y > p.y - 700);
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < 1.2);
  }

  // ---------------------------------------------------------------- the egg: a tug of war
  startDrill() {
    this.drill = { t0: this.t, me: 0, need: this.playerNeed(), tok: 2, lead: null };
    this.p.y = RACE_LEN - 70;
    this.arriveRank = this.computeRank();
    this.emit('drill', { rank: this.arriveRank, need: this.drill.need });
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
    d.me += (dt * (0.3 + (p.frenzyT > 0 ? 0.3 : 0)) + taps * 0.07) * boost;
    if (this.autopilot && !this.bot) d.me += dt * 0.3;
    if (raw) {
      this.emit('drillTap', { n: taps });
      if (taps) for (const a of this.agents) if (a.alive && a.arrived && a.boss) { a.drill = Math.max(0, a.drill - 0.07 * taps); this.emit('drillShove', { k: a.k, boss: a.boss.name }); }
    }
    this.input.tap = 0;
    this.tickFrenzy(dt);
    // the others keep swimming and drilling, and the bosses at the egg shove you back every 1.4 s
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
        a.shoveT = (a.shoveT == null ? 1.4 : a.shoveT) - dt;
        if (a.shoveT <= 0) { a.shoveT += 1.4; d.me = Math.max(0, d.me - 0.10); this.emit('rivalShove', { k: a.k, boss: a.boss.name }); }
      }
      if (this.drillAgent(a, dt)) { this.rank = this.computeRank(); this.eggTaken = a; return this.end('late'); }
    }
    if (d.me >= d.need) return this.end('win');
    this.drillLeader();
  }

  // ---------------------------------------------------------------- end of run
  end(reason) {
    if (this.over) return;
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
    const genMul = genFactor(this.gen), autoFrac = this.t > 0 ? clamp(this.autoT / this.t, 0, 1) : 0, auto = autoFrac > 0.5;
    const practice = this.won && auto;    // an autopilot win: a baby for the album, but no new generation
    const bk = {
      dist: dist / 2000,
      place: Math.max(0, Math.log10(TOTAL_SWIMMERS / rank)) * 5 + (this.won && !practice ? WIN_BONUS : 0),
      combo: this.dnaRun - this.dnaBank - this.dnaBonus,
      bank: this.dnaBank,
      bounty: this.dnaBonus + 3 * beaten.length + (beaten.includes(firstName(RIVALS[RIVALS.length - 1])) ? 15 : 0),
      // photo finish: beaten at the egg itself pays for how far you drilled
      photo: reason === 'late' && this.drill ? Math.min(60, Math.round(90 * clamp(this.drill.me / this.drill.need, 0, 1))) : 0,
      // so near: a rival got in while you were still swimming for it, the closer the more it pays
      near: reason === 'late' && !this.drill ? Math.round(60 * clamp(1 - gapSec / 8, 0, 1)) : 0,
      // a podium finish that was not a win
      podium: !this.won ? (rank === 2 ? 30 : rank === 3 ? 18 : rank <= 5 ? 8 : 0) : 0,
    };
    if (!counted) { bk.place = 0; bk.bounty = 0; bk.photo = 0; bk.near = 0; bk.podium = 0; }
    const raw = bk.dist + bk.place + bk.combo + bk.bank + bk.bounty + bk.photo + bk.near + bk.podium;
    const autoCut = raw * genMul * 0.6 * autoFrac;          // the autopilot keeps 40%
    let dailyBonus = 0, streak = M.dailyStreak || 0, dailyBest = false;
    if (this.daily != null && counted) {
      if (M.dailyDay !== this.daily) {
        // the clock: opts.now, else now if this daily is today's, else the daily's own noon (old or test days)
        const real = Date.now(), now = this.now != null ? this.now : dailySeed(new Date(real)) === this.daily ? real : this.daily * 86400000 + 43200000;
        M.dailyDay = this.daily; M.dailyBest = TOTAL_SWIMMERS; M.dailyRuns = 0;
        streak = M.dailyLastDay < this.daily && streakAlive(M, now) ? streak + 1 : 1;
        M.dailyStreak = streak; M.dailyLastDay = this.daily; M.dailyLastAt = now; M.bestStreak = Math.max(M.bestStreak || 0, streak);
        dailyBonus = dailyBonusFor(streak, this.gen);
      }
      M.dailyRuns++;
      if (!auto) { dailyBest = rank < M.dailyBest; M.dailyBest = Math.min(M.dailyBest, rank); }
    }
    // the bounty promised after the last run
    let goalDna = 0, goalDone = null;
    const g = M.goal;
    if (g && reason !== 'quit' && goalMet(g, { won: this.won, zone: this.zoneReached, combo: p.bestCombo, beaten })) { goalDna = g.dna; goalDone = { id: g.id, dna: g.dna, k: g.k, target: g.target }; M.goal = null; }
    const dna = Math.max(0, Math.round(raw * genMul - autoCut)) + dailyBonus + goalDna;
    M.dna += dna; M.bestCombo = Math.max(M.bestCombo, Math.floor(p.bestCombo));
    if (counted) { M.runs++; M.sinceWin = Math.min(99, (M.sinceWin || 0) + 1); if (!auto) M.best = Math.min(M.best, rank); } else M.quits = (M.quits || 0) + 1;
    // a 'late' loss at the egg itself is an egg loss (drill faster next time); one before you even got there
    // is a race loss (the named rivals get a little slower next time, never in the daily)
    if (this.won) { M.eggLosses = Math.floor((M.eggLosses || 0) / 2); M.raceLosses = Math.floor((M.raceLosses || 0) / 2); }   // a win eases off, not a wall
    else if (reason === 'late' && this.drill) M.eggLosses = Math.min(99, (M.eggLosses || 0) + 1);
    else if (reason === 'late' && this.daily == null) M.raceLosses = Math.min(99, (M.raceLosses || 0) + 1);
    let baby = null;
    if (this.won) {
      baby = babyFor(this.rng, this.muts); baby.gen = this.gen + 2; baby.run = M.runs;   // the hero is Gen 1, the first baby Gen 2
      if (practice) baby.practice = true; else { M.gen++; M.sinceWin = 0; }
      M.babies.push(baby); M.wins++;
    }
    const breakdown = { dist: Math.round(bk.dist), place: Math.round(bk.place), combo: Math.round(bk.combo), bank: Math.round(bk.bank), bounty: Math.round(bk.bounty), photo: bk.photo,
      near: bk.near, podium: bk.podium, genMul, autoCut: Math.round(autoCut), dailyBonus, goal: goalDna };
    this.over = { reason, cause, rank, dna, dist, baby, combo: Math.floor(p.bestCombo), overtakes: p.overtakes, zone: this.zoneReached,
      tier: p.bestTier, synergies: Object.keys(this.syn), comboDna: Math.round(this.dnaFromCombo), daily: this.daily, dailyBest,
      events: this.schedule.filter((e) => p.y >= e.y0).map((e) => e.id),
      by, gapBy, rivalsBeaten: beaten, gapSec, auto, practice, breakdown, dailyBonus, streak: this.daily != null && counted ? streak : 0, goalDone, photo: bk.photo, counted };
    if (reason !== 'quit') nextGoal(M, this.over);
    this.over.nextGoal = M.goal;
    this.emit('over', this.over);
  }

  progress() { return clamp((this.p.y) / RACE_LEN, 0, 1); }
  remaining() { return Math.max(0, RACE_LEN - 70 - this.p.y); }
}

export { RACE_LEN, ZONES, MUTATIONS, HABITS, HABIT_ORDER, habitCost };
