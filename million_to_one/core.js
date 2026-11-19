// Million To One: the race simulation. No DOM, no audio: index.html draws it,
// tests/million_to_one_core.test.mjs drives it headless.
import { RIVALS, ZONES, RACE_LEN, MUTATIONS, MUT_ORDER, HABITS, HABIT_ORDER, habitCost, TOTAL_SWIMMERS, babyFor } from './content.js';

export const VIEW_W = 400;
export const N_AGENTS = 500;
export const EGG_DRILL = 3;
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
// DNA multiplier for the current combo chain: x1 at 0, +0.04 per link, capped at x3 (combo 50).
export const comboMult = (n) => 1 + Math.min(Math.max(0, n), 50) * 0.04;
// STYLE: the number of different link kinds in your last 8 links (1..6) multiplies the chain.
export const styleMult = (style) => 1 + 0.15 * (clamp(style || 1, 1, 6) - 1);
// A banked combo (the timer ran out cleanly) gets a grade: index into BANK_GRADES, from these chain lengths.
export const BANK_AT = [10, 25, 40, 60, 85];
export const bankGrade = (n) => { let g = 0; while (g < BANK_AT.length - 1 && n >= BANK_AT[g + 1]) g++; return g; };
// 0.04 * n^1.35 * style. Past the top grade (85) each extra link counts half: monster chains still pay, not explode.
export const bankDna = (n, style) => { n = Math.max(0, n); if (n > 85) n = 85 + (n - 85) * 0.5; return 0.04 * Math.pow(n, 1.35) * styleMult(style); };

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
];
export function synergiesFor(muts) { return SYNERGIES.filter((s) => s.needs.every((id) => (muts[id] || 0) > 0)); }
export const SYNERGY_BONUS = 40;   // DNA for discovering a synergy for the very first time

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
export const MID_DRAFT_Y = SEA_I >= 0 ? ZSTART[SEA_I] + 11000 : Infinity;   // the extra card deal halfway across the sea
export const BOSS_Y = [2000, 6000, 14000, 24000, 34000];  // where the named rivals start: milestones up the track
const BLEND = 1200, DIV_W = 40, AFTER = 2500, EDGE = 22;

export function zoneIndex(y) { for (let i = ZONES.length - 1; i >= 0; i--) if (y >= ZSTART[i]) return i; return 0; }

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
export const HABIT_FX = { broccoli: 0.04, water: 12, sleep: 0.05, jeans: 250, berries: 0.1, walk: 0.08, beatbox: 0.25, hottub: 1, meditate: 1 };
const GRANDAD = ['broccoli', 'water', 'sleep', 'berries'];   // habits that keep growing with every generation
export const genFactor = (gen) => 1 + 0.25 * Math.min(Math.max(0, gen || 0), 8);   // DNA multiplier per generation

export function newMeta() {
  return { v: 1, dna: 0, habits: {}, gen: 0, best: TOTAL_SWIMMERS, runs: 0, wins: 0, babies: [], lastSeen: 0, bank: 0, introSeen: false, muted: false, bestCombo: 0, autopilot: false,
    dailyDay: -1, dailyBest: TOTAL_SWIMMERS, dailyRuns: 0, synergiesSeen: [], dailyStreak: 0, dailyLastDay: -1, bestRivals: 0, rivals: {} };
}
export const maxLv = (meta, id) => HABITS[id].max + (GRANDAD.includes(id) ? Math.min(Math.max(0, (meta && meta.gen) || 0), 10) : 0);
export function loadMeta(o) {
  const m = newMeta();
  if (!o || typeof o !== 'object') return m;
  for (const k of Object.keys(m)) if (k in o && typeof o[k] === typeof m[k]) m[k] = o[k];
  if (!Array.isArray(m.babies)) m.babies = [];
  if (!Array.isArray(m.synergiesSeen)) m.synergiesSeen = [];
  for (const k of ['gen', 'runs', 'wins', 'bestCombo', 'dailyRuns', 'dailyStreak', 'bestRivals', 'bank']) if (!isFinite(m[k]) || m[k] < 0) m[k] = 0;
  m.gen = Math.floor(m.gen);
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
export function habitEffect(id, l) {
  const pct = (v) => Math.round(v * 100) + '%';
  switch (id) {
    case 'broccoli': return { label: '+' + pct(HABIT_FX.broccoli * l) + ' swim speed', value: HABIT_FX.broccoli * l };
    case 'water':    return { label: '+' + HABIT_FX.water * l + ' max energy', value: HABIT_FX.water * l };
    case 'sleep':    return { label: '-' + pct(Math.min(0.9, HABIT_FX.sleep * l)) + ' energy drain', value: Math.min(0.9, HABIT_FX.sleep * l) };
    case 'jeans':    return { label: 'Start ' + HABIT_FX.jeans * l + ' µm further up', value: HABIT_FX.jeans * l };
    case 'berries':  return { label: '+' + pct(HABIT_FX.berries * l) + ' energy from fruit', value: HABIT_FX.berries * l };
    case 'walk':     return { label: '+' + pct(HABIT_FX.walk * l) + ' drafting power', value: HABIT_FX.walk * l };
    case 'beatbox':  return { label: '+' + (HABIT_FX.beatbox * l).toFixed(2) + 's combo time', value: HABIT_FX.beatbox * l };
    case 'hottub':   return { label: '+' + l + ' starting shield' + (l === 1 ? '' : 's'), value: l };
    case 'meditate': return { label: '+' + l + ' card reroll' + (l === 1 ? '' : 's'), value: l };
    case 'factory':  { const v = factoryRateAt(l, 0); return { label: v + ' DNA per hour', value: v }; }
    case 'gps':      return { label: l > 0 ? 'Autopilot unlocked' : 'No autopilot', value: l > 0 ? 1 : 0 };
    default:         return { label: '', value: 0 };
  }
}
// DNA per hour the factory makes while you are away, and how many hours it stores
const factoryRateAt = (l, gen) => Math.round(30 * (1 + 0.6 * l) * genFactor(gen));
export const factoryRate = (meta) => factoryRateAt(lv(meta, 'factory'), meta.gen);
export const factoryCapHours = (meta) => 8 + Math.floor(lv(meta, 'factory') / 2);
export function idleTick(meta, now) {
  if (!meta.lastSeen) { meta.lastSeen = now; return 0; }
  const cap = factoryCapHours(meta);
  const hrs = clamp((now - meta.lastSeen) / 3600000, 0, cap);
  meta.lastSeen = now;
  meta.bank = Math.min(meta.bank + hrs * factoryRate(meta), factoryRate(meta) * cap);
  return meta.bank;
}
export function collectBank(meta) { const d = Math.floor(meta.bank); meta.dna += d; meta.bank -= d; return d; }

// ------------------------------------------------------------------ the race
export class Race {
  constructor(meta, rng = Math.random, opts = {}) {
    this.meta = meta; this.rng = rng; this.t = 0; this.events = [];
    this.gen = meta.gen || 0;
    this.muts = {}; this.syn = {}; this.pending = null; this.pendingMid = false; this.rerolls = lv(meta, 'meditate');
    this.draftN = 0; this.midDraft = false;
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
    this.input = { tx: null, dir: 0, dash: false, tap: 0, touch: false };
    this.bot = !!opts.bot;                           // test bot: steers like the autopilot but plays like a person
    this.autopilot = !!opts.autopilot || this.bot; this.autoT = 0;
    // after generation 3 the tube itself gets nastier (never in the daily: same layout for everybody)
    this.hzGen = this.daily == null && this.gen > 3 ? Math.min(this.gen, 6) : 0;
    const startY = 40 + HABIT_FX.jeans * lv(meta, 'jeans');
    const maxE = 100 + HABIT_FX.water * lv(meta, 'water');
    this.p = { x: VIEW_W / 2, y: startY, vx: 0, vy: 0, e: maxE, maxE, shield: lv(meta, 'hottub'), dashT: 0, dashCd: 0, frenzyT: 0, nextFrenzy: 10,
      combo: 0, comboT: 0, comboMax: 2.2, tier: 0, fz: 0, fzPen: 0, fzPts: 0, bestTier: 0, mult: 1, bestCombo: 0, kinds: [], style: 1, bank: 0,
      draft: 0, comeback: 0, side: 0, stuck: 0, inv: 0, acid: 0, wing: 0, second: 0, overtakes: 0, heading: 0, swatT: 0, swatDir: 0, current: 0 };
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
    const gs = 1 + 0.035 * Math.min(this.gen, 8), fieldBase = 430 * gs;
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
    // the named rivals: milestones up the track. Tough (no death rolls), and they drill hard.
    RIVALS.forEach((R, k) => {
      const a = this.agents[k];
      Object.assign(a, { boss: R, k, sp: 430 * R.sp * (gs + 0.01 * this.gen), stam: 1, y: BOSS_Y[k] != null ? BOSS_Y[k] : 34000 + 4000 * (k - 4), w: 1, zone: -1, deathY: Infinity, group: 'boss' });
      a.side = lrng() < R.smart ? this.eggSide : -this.eggSide; a.lane = a.side * (0.2 + lrng() * 0.6); a.lane2 = clamp(Math.abs(a.lane) / 0.9 * 2 - 1, -0.9, 0.9);
    });
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
  }

  // ---------------------------------------------------------------- derived stats
  refreshStats() {
    const m = this.muts, M = this.meta, s = {}, syn = this.syn;
    s.speed = 445 * (1 + HABIT_FX.broccoli * lv(M, 'broccoli')) * (1 + 0.1 * (m.turbo || 0)) * (1 + 0.04 * (m.bloom ? this.cleared : 0)) * (syn.comeback && this.p.comeback ? 1.1 : 1);
    s.drain = 4.3 * Math.max(0.1, 1 - HABIT_FX.sleep * lv(M, 'sleep')) * Math.pow(0.82, m.eco || 0);
    s.draft = 0.2 * (1 + 0.6 * (m.draft || 0)) * (1 + HABIT_FX.walk * lv(M, 'walk'));
    s.sugar = 6 * (1 + HABIT_FX.berries * lv(M, 'berries')) * (1 + 0.5 * (m.sweet || 0));
    s.magnet = 34 + 45 * (m.magnet || 0);
    s.acid = 26 * Math.pow(0.4, m.antacid || 0);
    s.combo = 2.2 + 1 * (m.memory || 0) + HABIT_FX.beatbox * lv(M, 'beatbox');
    s.dashCd = 3 * Math.pow(0.65, m.whip || 0);
    s.dashCost = 8 * Math.pow(0.7, m.whip || 0);
    s.frenzyAt = 10 - 3 * (m.hype || 0);
    s.frenzyLen = 3.5 + 2 * (m.hype || 0) + (syn.supernova ? 1.5 : 0);
    s.dnaBlob = 5 + 2 * (m.lucky || 0);
    s.keep = syn.elephant ? 0.75 : m.echo ? 0.5 : 0;     // share of a dropped combo that survives
    s.ramW = syn.bulldozer ? 30 : 16;
    this.s = s;
  }
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
  draft(mid = false) { this.draftN++; this.pendingMid = mid; this.offer(); }
  offer() {
    const rng = this.orng, d = Math.max(1, this.draftN), mid = this.pendingMid;
    const pool = MUT_ORDER.filter((id) => (this.muts[id] || 0) < MUTATIONS[id].max && !(id === 'nose' && this.p.y > FORK_END) && !(id === 'bloom' && d > 3));
    const t = clamp((d - 1) / 4, 0, 1), RW = [lerp(10, 6, t), lerp(4, 5, t), lerp(1.3, 3, t)];
    const comp = this.completers();
    const wOf = (id) => RW[MUTATIONS[id].r - 1] * (comp.has(id) ? 3 : 1);
    const take = (cands) => {
      const ws = cands.map(wOf); let r = rng() * ws.reduce((a, b) => a + b, 0), k = 0;
      while (k < ws.length - 1 && r > ws[k]) { r -= ws[k]; k++; }
      return cands[k];
    };
    const picks = [];
    const add = (id) => { picks.push(id); pool.splice(pool.indexOf(id), 1); if (MUTATIONS[id].r === 3) for (let i = pool.length - 1; i >= 0; i--) if (MUTATIONS[pool[i]].r === 3) pool.splice(i, 1); };
    const forced = pool.filter((id) => comp.has(id));
    if (forced.length && rng() < 0.5) add(take(forced));
    while (picks.length < 3 && pool.length) add(take(pool));
    if (d >= 3 && picks.length && !picks.some((id) => MUTATIONS[id].r >= 2)) {   // a rare or better is guaranteed from draft 3
      const rare = pool.filter((id) => MUTATIONS[id].r >= 2);
      if (rare.length) picks[picks.length - 1] = take(rare);
    }
    this.pending = picks;
    this.emit('offer', { picks, mid, draft: d });
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
  spawnAhead() {
    const p = this.p, m = this.muts, hg = this.hzGen;
    while (this.genY < p.y + 2200 && this.genY < RACE_LEN - 400) {
      const y = this.genY, zi = zoneIndex(y), z = ZONES[zi], hz = z.hazards;
      const step = 100; this.genY += step;
      const sides = y >= FORK_Y0 ? (y >= FORK_END ? [p.side || 1] : [-1, 1]) : [0];
      const ev = this.eventAt(y), evId = ev ? ev.id : '';
      const sugarP = (hz.sugar || 0) * 0.06 * (evId === 'sugarRush' ? 3 : 1);
      const dnaP = 0.012 * (1 + 0.5 * (m.lucky || 0)) * (evId === 'goldRush' ? 6 : 1);
      const wbcP = ((hz.wbc || 0) * 0.05 + (evId === 'stampede' ? 0.07 : 0)) * (1 + 0.1 * hg);
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
        if (hz.acid && rng() < 0.2 * hz.acid) this.ents.push({ t: 'acid', x: rx(), y: y + rng() * 100, r: Math.min(26 + rng() * 40, blob), seed: rng() * 9 });
        if (hz.alkali && rng() < 0.06 * hz.alkali) this.ents.push({ t: 'alkali', x: rx(), y: y + 50, r: 11 });
        if (hz.goo && rng() < 0.1 * hz.goo) this.ents.push({ t: 'goo', x: rx(), y: y + rng() * 100, r: Math.min(30 + rng() * 34, blob), seed: rng() * 9 });
        if (hz.gate && y % 1300 < step && y > ZSTART[zi] + 500 && y < ZSTART[zi] + z.len - 500) {
          const gw = Math.max(60, 78 - 3 * hg) + rng() * 30, n2 = rng() < 0.45 ? 2 : 1, gaps = [];
          for (let k = 0; k < n2; k++) gaps.push(bl + gw / 2 + 1 + rng() * Math.max(0, br - bl - gw - 2));
          this.ents.push({ t: 'gate', x: ch.c, y, r: ch.h, gaps, gw, side, bonkT: 0, contact: 0 });
        }
        if (wbcP && rng() < wbcP) this.ents.push({ t: 'wbc', x: rx(), y: y + 50, r: 22 + rng() * 8, vx: 0, vy: 0, hunt: 0, eat: 0, ph: rng() * 6 });
        if (hz.current && rng() < 0.03 * hz.current) this.ents.push({ t: 'current', x: ch.c, y, r: ch.h, h: 260 + rng() * 200, dir: rng() < 0.5 ? -1 : 1 });
        if (hz.cilia && rng() < 0.05 * hz.cilia) {   // a little hair on one wall that swats you aside on the beat
          const wall = this.ciliaN++ % 2 ? 1 : -1, len = 0.45 + rng() * 0.2, beat = 60 / (z.beat || 120);
          const period = Math.max(2, Math.round(1.6 / beat)) * beat;
          this.ents.push({ t: 'cilia', x: ch.c + wall * ch.h, y: y + 50, r: len * 2 * ch.h, wall, len, period, off: Math.floor(rng() * 8) * beat, state: 0, phase: 0 });
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
    if (this.over || this.pending || this.paused) return;
    this.t += dt;
    if (this.autopilot && !this.bot) this.autoT += dt;
    const p = this.p, s = this.s;
    if (this.drill) { this.stepDrill(dt); return; }
    this.spawnAhead();
    if (this.autopilot) this.autoSteer();

    // zone progress and mutation drafts (none at the egg: it is time to drill, not shop)
    const zi = zoneIndex(p.y);
    if (zi > this.zoneReached) {
      this.zoneReached = zi; this.cleared = zi; p.wing = this.muts.wingman || 0;
      this.refreshStats();
      const egg = !!ZONES[zi].egg;
      this.emit('zone', { zi, draft: !egg });
      if (egg) this.finale();
      else { this.draft(false); return; }
    }
    if (zi === SEA_I && !this.midDraft && p.y >= MID_DRAFT_Y) { this.midDraft = true; this.draft(true); return; }
    this.stepEvent();
    if (!p.side && p.y >= FORK_Y0) { p.side = p.x < centre(p.y) ? -1 : 1; this.emit('fork', { side: p.side, right: p.side === this.eggSide }); }

    // timers
    p.dashCd = Math.max(0, p.dashCd - dt); p.dashT = Math.max(0, p.dashT - dt); p.inv = Math.max(0, p.inv - dt); p.stuck = Math.max(0, p.stuck - dt);
    if (p.frenzyT > 0) { p.frenzyT -= dt; if (p.frenzyT <= 0) { p.frenzyT = 0; this.emit('frenzyEnd'); } }
    if (p.combo > 0) { p.comboT -= dt; if (p.comboT <= 0) this.dropCombo(); }
    const frenzy = p.frenzyT > 0, nitro = frenzy && this.muts.nitro, tier = frenzy ? p.tier : 0;
    const safe = nitro || tier >= 5;            // nothing can hurt you
    const ev = this.ev ? this.ev.id : '';

    // dash
    const jet = this.syn.jetstream && p.draft > 0.08;
    if (this.input.dash && p.dashCd <= 0 && (p.e > s.dashCost || nitro || jet)) {
      p.dashT = jet ? 0.85 : 0.55; p.dashCd = s.dashCd; if (!nitro && !jet) p.e -= s.dashCost; this.emit('dash', { jet });
    }
    this.input.dash = false;

    // steering: a finger gets a snappier, damped response; keys and the autopilot keep the softer one
    const ch = channel(p.y, p.side);
    let tx = this.input.tx;
    if (tx == null && this.input.dir) tx = p.x + this.input.dir * 120;
    const touch = this.input.touch && !this.autopilot && tx != null;
    let want = 0;
    if (tx != null) {
      want = (tx - p.x) * (touch ? 14 : 9);
      if (touch) want -= p.vx * 0.08;
      const cap = touch && p.dashT > 0 ? 560 : 460;
      want = clamp(want, -cap, cap);
    }
    p.vx += (want - p.vx) * Math.min(1, dt * (touch ? 20 : 12));
    if (ev === 'sneeze') p.vx += Math.sin(this.t * 2.6) * 420 * dt;    // turbulence

    // drafting: tuck in behind a rival
    let target = null, bestD = 1e9;
    for (const a of this.agents) {
      if (!a.alive || a.arrived) continue;
      const dy = a.y - p.y; if (dy < 12 || dy > 95) continue;
      if (p.y >= FORK_Y0 && a.side !== p.side) continue;
      const dx = Math.abs(this.agentX(a) - p.x); if (dx < 20 && dy < bestD) { bestD = dy; target = a; }
    }
    p.draft += ((target ? s.draft * (ev === 'slipstream' ? 2 : 1) : 0) - p.draft) * Math.min(1, dt * (target ? 3 : 5));
    this.draftTarget = target; if (target) target.draftedT = this.t;

    // currents: a real sideways push; swimming with it is a little faster, against it a little slower
    let cur = null;
    for (const e of this.ents) if (e.t === 'current' && p.y > e.y && p.y < e.y + e.h) { cur = e; break; }
    p.current = cur ? (p.vx * cur.dir > 30 ? 1 : p.vx * cur.dir < -30 ? -1 : 0) : 0;

    // forward speed
    let sp = s.speed * (1 + p.draft + (tier ? FRENZY_TIERS[Math.min(tier, FRENZY_TIERS.length) - 1].speed : 0) + (p.dashT > 0 ? 0.75 : 0));
    if (ev === 'espresso') sp *= 1.12;
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
        if (d < e.r) { if (e.t === 'acid') inAcid = true; else inGoo = true; e.touched = 1; }
        else if (d < e.r + 18) e.near = 1;
        if (e.near && !e.touched && !e.paid && p.y - e.y > e.r * 0.8) { e.paid = 1; this.nearMiss(e.x, e.y); }
      }
    }
    if (inAcid && !safe && tier < 4) { sp *= 0.8; p.e -= s.acid * dt; p.acid = 1; } else p.acid = Math.max(0, p.acid - dt * 2);
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
        if (!(e.bonkT > 0)) { e.bonkT = 0.7; e.bonked = 1; p.stuck = 0.4; p.vy = 0; ny = e.y - 22; this.emit('bonk', { x: p.x, y: e.y }); this.breakCombo('bonk', p.x, e.y); }
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
    p.e -= s.drain * (1 + 0.05 * zi) * dt * (p.draft > 0.05 ? 0.65 : 1) * (ev === 'espresso' ? 1.25 : 1);
    if (this.muts.draft && p.draft > 0.1) p.e += 1.2 * this.muts.draft * dt;

    // pickups and enemies
    this.stepEnts(dt, frenzy, safe, tier);
    if (this.over) return;
    this.stepAgents(dt);
    if (this.over) return;

    p.e = Math.min(p.e, p.maxE);
    const wrongTube = p.side && p.side !== this.eggSide && p.y >= FORK_Y0;
    if (p.e <= 0) {
      if (p.second) {
        p.second = 0; p.e = 60; p.inv = 2;
        if (this.syn.reserveTank) { p.e = p.maxE; p.shield++; }
        this.emit('second', { reserve: !!this.syn.reserveTank });
        if (this.syn.comeback) { p.comeback = 1; this.refreshStats(); p.frenzyT = Math.max(p.frenzyT, this.s.frenzyLen); p.tier = Math.max(p.tier, 1); p.fz = Math.max(p.fz, 1); this.emit('frenzy', { n: p.combo, first: true, tier: p.tier, name: FRENZY_TIERS[p.tier - 1].name, comeback: true }); }
      }
      else return this.end(wrongTube ? 'wrong' : 'energy');
    }
    // the wrong tube is a dead end: the backflow spits you out at the fork exit, dizzy and drained
    if (wrongTube && p.y >= DEAD_Y - 40) {
      this.emit('backflow', { x: p.x, y: p.y });
      p.e -= 25;
      if (p.e <= 0) return this.end('wrong');
      p.side = this.eggSide; p.y = FORK_END; this.prevPY = p.y; p.x = channel(p.y, p.side).c; p.vx = 0; p.stuck = 1.2;
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
    if (frenzy && this.muts.chain) {
      n *= 2;
      if (kind === 'pass') p.frenzyT = Math.max(p.frenzyT, Math.min(p.frenzyT + 0.2, s.frenzyLen * 2));
    }
    // style: different moves in a row are worth more; spamming one move climbs FRENZY at half speed
    const K = p.kinds, fresh = !K.includes(kind);
    const rep = K.length >= 3 && K[K.length - 1] === kind && K[K.length - 2] === kind && K[K.length - 3] === kind;
    K.push(kind); if (K.length > 8) K.shift();
    p.style = Math.min(6, new Set(K).size);
    p.combo += n; p.bank += n;
    if (rep) p.fzPen += n * 0.5;
    const long = (frenzy && p.tier >= 3 ? 1.5 : 1) * (this.evIs('disco') ? 1.5 : 1);
    p.comboMax = s.combo * long; p.comboT = p.comboMax;
    p.bestCombo = Math.max(p.bestCombo, p.combo);
    p.mult = comboMult(p.combo) * styleMult(p.style);
    const gain = 0.05 * n * p.mult * (this.evIs('disco') ? 2 : 1);
    this.dnaRun += gain; this.dnaFromCombo += gain - 0.05 * n;
    this.emit('combo', { kind, n: p.combo, x, y, mult: p.mult, style: p.style, fresh });
    const pts = this.fzPoints(); p.fzPts = pts;
    if (pts >= this.frenzyThreshold(p.fz)) {
      const first = p.frenzyT <= 0, oldTier = p.tier, T = FRENZY_TIERS;
      while (pts >= this.frenzyThreshold(p.fz)) p.fz++;
      p.tier = Math.max(1, Math.min(p.fz, T.length, this.tierCap()));
      p.bestTier = Math.max(p.bestTier, p.tier);
      p.nextFrenzy = this.frenzyThreshold(p.fz);
      p.frenzyT = Math.max(p.frenzyT, s.frenzyLen);
      if (!first && p.tier === oldTier && p.fz <= T.length) return;     // capped: a quiet top-up, no fanfare
      const ti = p.tier - 1;
      this.emit('frenzy', { n: p.combo, first, tier: p.tier, name: T[ti].name, desc: T[ti].desc });
      if (this.muts.mosh) {
        let hit = 0;
        for (const a of this.agents) if (a.alive && !a.arrived && Math.abs(a.y - p.y) < 220) { a.kx += (this.agentX(a) < p.x ? -1 : 1) * 3; a.y -= 25; a.bumpT = 0.6; hit++; }
        if (this.syn.domino && hit) {
          p.combo += hit; p.bank += hit; p.bestCombo = Math.max(p.bestCombo, p.combo); p.mult = comboMult(p.combo) * styleMult(p.style);
          p.frenzyT = Math.min(p.frenzyT + 0.3 * hit, s.frenzyLen * 2);
          this.emit('domino', { n: hit, x: p.x, y: p.y });
        }
      }
      if (this.syn.hypeSquad && (this.muts.wingman || 0) > p.wing) { p.wing = this.muts.wingman; this.emit('wingBack'); }
      if (this.syn.supernova) this.blast(p.x, p.y, 260, 'supernova');
    }
  }
  resetTier(keep) {
    const p = this.p;
    p.fz = this.tierOf(this.fzPoints()); p.fzPts = this.fzPoints(); p.tier = Math.min(p.fz, FRENZY_TIERS.length, this.tierCap());
    p.nextFrenzy = this.frenzyThreshold(p.fz); p.mult = comboMult(keep) * styleMult(p.style);
    if (!keep) { p.kinds.length = 0; p.style = 1; p.mult = 1; }
  }
  // a combo ran out cleanly: BANK it for DNA. Echo Chamber keeps part of the chain going.
  dropCombo() {
    const p = this.p, s = this.s, n = p.combo;
    if (p.bank >= 3) {
      const dna = bankDna(p.bank, p.style) * (this.evIs('disco') ? 2 : 1);
      this.dnaRun += dna; this.dnaBank += dna;
      this.emit('comboBank', { n: p.bank, dna: Math.round(dna * 10) / 10, grade: bankGrade(p.bank), style: p.style, x: p.x, y: p.y });
    }
    p.bank = 0;
    const keep = s.keep ? Math.floor(n * s.keep) : 0;
    if (n >= 3) this.emit('comboEnd', { n, kept: keep });
    p.fzPen = n > 0 ? p.fzPen * keep / n : 0;
    p.combo = keep; p.comboT = keep ? s.combo : 0; p.comboMax = s.combo;
    this.resetTier(keep);
  }
  // a combo got smashed (goo wall, a hit you survived): no bank, a quarter of it survives
  breakCombo(why, x, y) {
    const p = this.p, s = this.s, n = p.combo;
    if (n <= 0) return;
    if (p.frenzyT > 0 && (p.tier >= FRENZY_TIERS.length || this.muts.nitro)) return;   // GOD MODE and Nitro shrug it off
    const keep = Math.floor(n * 0.25 * (1 + s.keep));
    p.bank = 0;
    p.fzPen = p.fzPen * keep / n;
    p.combo = keep; p.comboT = keep ? s.combo : 0; p.comboMax = s.combo;
    this.resetTier(keep);
    this.emit('comboBreak', { n, kept: keep, why, x: x != null ? x : p.x, y: y != null ? y : p.y });
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
  rivalNeed() { return this.drill || RACE_LEN - this.p.y < 2500 ? EGG_DRILL + 2 : EGG_DRILL; }
  drillRate(a) { return a.boss ? (a.boss.drill || 1) : 0.9; }
  arrive(a) {
    a.arrived = true; a.arrivedT = this.t; a.y = RACE_LEN - 70; a.need = this.rivalNeed();
    const info = { boss: a.boss ? a.boss.name : null, k: a.boss ? a.k : -1 };
    if (!this.claimed) { this.claimed = a; this.emit('eggClaim', { ...info, col: a.boss ? a.boss.col : null, need: a.need, remaining: this.remaining() }); }
    else this.emit('arrive', info);
  }
  // an arrived rival drills; true when it gets in
  drillAgent(a, dt) {
    a.need = this.rivalNeed();
    a.drill += dt * this.drillRate(a);
    const f = a.drill / a.need;
    if (this.rdLevel < 2 && f >= (this.rdLevel ? 0.8 : 0.5)) {
      let lead = true; for (const b of this.agents) if (b !== a && b.alive && b.arrived && b.drill / a.need > f) { lead = false; break; }
      if (lead) { this.rdLevel++; this.emit('rivalDrill', { boss: a.boss ? a.boss.name : null, k: a.boss ? a.k : -1, f }); }
    }
    return a.drill >= a.need;
  }
  // entering THE EGG: every named rival right behind you finds a last gear
  finale() {
    const p = this.p, sprinters = [];
    for (const a of this.agents) if (a.boss && a.alive && !a.arrived && a.side === this.eggSide && p.y - a.y >= 0 && p.y - a.y <= 3000) { a.sp *= 1.18; a.sprint = 1; sprinters.push(a.boss.name); }
    this.emit('finale', { sprinters });
  }

  stepAgents(dt) {
    const p = this.p, rng = this.rng, ev = this.ev ? this.ev.id : '';
    const evSp = ev === 'espresso' ? 1.12 : ev === 'slipstream' ? 1.05 : 1, sneeze = ev === 'sneeze';
    const ramW = this.s.ramW, zone0 = this.zoneReached === 0;
    let rank = 1, alive = 1;
    const st = Math.sin(this.t * 1.7), ct = Math.cos(this.t * 1.7), n = (this.stepN = (this.stepN || 0) + 1);
    const kdamp = Math.pow(0.1, dt), py = p.y;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a.alive) continue;
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
            if (!a.passedOnce) { a.passedOnce = 1; this.addCombo('rival', ax, a.y, 3); this.dnaRun += 4; this.dnaBonus += 4; }
            else this.addCombo('rival', ax, a.y, 1);
          }
          // in the Launch Tube a plain pass only moves you up; a link has to be earned: a dash,
          // a slingshot out of THAT rival's draft, or a close shave
          else if (!zone0 || p.dashT > 0 || (p.draft > 0.08 && this.t - a.draftedT < 1) || dx < 70) this.addCombo('pass', ax, a.y);
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
        if (d < 300 && dy > -60) { e.hunt = Math.min(1, e.hunt + dt * 2); }
        if (was < 0.5 && e.hunt >= 0.5) this.emit('lockon', { x: e.x, y: e.y });
        const spd = 170 * e.hunt;
        e.vx += ((dx < 0 ? 1 : -1) * spd - e.vx) * Math.min(1, dt * 3);
        e.vy += ((dy > 0 ? -spd * 0.6 : 0) - e.vy) * Math.min(1, dt * 2);
        e.x += e.vx * dt + Math.sin(e.ph * 2) * 10 * dt; e.y += e.vy * dt;
        // snack on rivals that swim through
        for (const a of this.agents) if (a.alive && !a.arrived && !a.boss && Math.abs(a.y - e.y) < e.r && Math.abs(this.agentX(a) - e.x) < e.r) { this.killAgent(a, 'eaten'); e.eat = 0.4; }
        if (d < e.r + 8) {
          e.touched = 1;
          if (nitro || p.inv > 0) { if (nitro) { e.dead = 1; this.emit('pop', { x: e.x, y: e.y }); this.addCombo('pop', e.x, e.y); } e.eat = Math.max(0, e.eat - dt); continue; }
          e.dead = 1; this.emit('pop', { x: e.x, y: e.y });
          if (this.muts.spiky) { p.e += 10; this.addCombo('pop', e.x, e.y); if (this.syn.porcupine) this.blast(e.x, e.y, 140, 'porcupine'); }
          else if (p.wing > 0) { p.wing--; p.inv = 1; this.emit('wingHit', { x: e.x, y: e.y }); this.breakCombo('wingHit', e.x, e.y); }
          else if (p.shield > 0) { p.shield--; p.inv = 1.2; this.emit('shieldHit', { x: e.x, y: e.y }); this.breakCombo('shieldHit', e.x, e.y); }
          else { this.end('wbc'); return; }
        } else if (d < e.r + 26 && e.hunt > 0.5) e.near = 1;
        // a dodge: it locked on, came within a whisker and got nothing. Mid-snack it is worth more.
        if (e.near && !e.touched && !e.paid && dy < -e.r) { e.paid = 1; this.addCombo('dodge', e.x, e.y, e.eat > 0 ? 3 : 2); }
        e.eat = Math.max(0, e.eat - dt);
      } else if (e.t === 'cilia') {
        const ph = (this.t + e.off) % e.period;
        e.state = ph < e.period - 0.8 ? 0 : ph < e.period - 0.35 ? 1 : 2;     // idle, tremble 0.45s, swat 0.35s
        e.phase = ph / e.period;
        const ady = Math.abs(dy), reach = e.wall < 0 ? p.x - e.x : e.x - p.x;  // how far you are from its wall
        if (ady < 26) {
          if (reach < e.r && e.state === 2 && !e.hit && !nitro) {
            e.hit = 1; p.swatT = 0.2; p.swatDir = -e.wall;
            if (p.combo > 0) p.comboT = Math.max(p.comboT - 0.5, 0.1);
            this.emit('swat', { x: p.x, y: p.y, wall: e.wall });
          } else if (reach < e.r + 24) e.near = 1;
        }
        if (e.near && !e.hit && !e.paid && p.y - e.y > 26) { e.paid = 1; this.nearMiss(p.x, e.y); }
      }
    }
    if (this.ents.length > 400 || (this.t % 1 < dt)) this.ents = this.ents.filter((e) => !e.dead && e.y > p.y - 700);
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < 1.2);
  }

  // ---------------------------------------------------------------- the egg: a tug of war
  startDrill() {
    this.drill = { t0: this.t, me: 0, need: EGG_DRILL };
    this.p.y = RACE_LEN - 70;
    this.arriveRank = this.computeRank();
    this.emit('drill', { rank: this.arriveRank });
  }
  stepDrill(dt) {
    const d = this.drill, p = this.p, taps = this.input.tap;
    d.me += dt * (0.3 + (p.frenzyT > 0 ? 0.3 : 0)) + taps * 0.09;
    if (this.autopilot) d.me += dt * 0.3;
    if (taps) {
      this.emit('drillTap', { n: taps });
      for (const a of this.agents) if (a.alive && a.arrived && a.boss) { a.drill = Math.max(0, a.drill - 0.04 * taps); this.emit('drillShove', { k: a.k, boss: a.boss.name }); }
    }
    this.input.tap = 0;
    if (p.frenzyT > 0) { p.frenzyT -= dt; if (p.frenzyT <= 0) { p.frenzyT = 0; this.emit('frenzyEnd'); } }
    // the others keep swimming and drilling
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.tauntT > 0) a.tauntT -= dt; if (a.bumpT > 0) a.bumpT -= dt; if (a.passT > 0) a.passT -= dt;
      if (!a.arrived) {
        a.y += a.sp * 0.9 * dt;
        if (a.side !== this.eggSide && a.y >= DEAD_Y) { a.alive = false; continue; }
        if (a.y >= RACE_LEN - 70) this.arrive(a);
        continue;
      }
      if (this.drillAgent(a, dt)) { this.rank = this.computeRank(); this.eggTaken = a; return this.end('late'); }
    }
    if (d.me >= d.need) return this.end('win');
  }

  // ---------------------------------------------------------------- end of run
  end(reason) {
    if (this.over) return;
    const p = this.p, M = this.meta, s = this.s;
    this.won = reason === 'win';
    if (this.won) this.rank = 1;
    const dist = Math.max(0, p.y - this.startY);
    const rank = this.rank;
    // rivals: who did you finish ahead of?
    const beaten = [];
    for (const a of this.agents) {
      if (!a.boss) continue;
      const nm = firstName(a.boss);
      const beat = this.won || (!a.alive) || (!a.arrived && a.y < p.y);
      if (beat) beaten.push(nm);
      if (M.rivals && typeof M.rivals === 'object') {
        const r = M.rivals[nm] || (M.rivals[nm] = { beat: 0, lost: 0 });
        if (beat) r.beat++; else r.lost++;
      }
    }
    M.bestRivals = Math.max(M.bestRivals || 0, beaten.length);
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
    // DNA
    const genMul = genFactor(this.gen), autoFrac = this.t > 0 ? clamp(this.autoT / this.t, 0, 1) : 0, auto = autoFrac > 0.5;
    const bk = {
      dist: dist / 1400,
      place: Math.max(0, Math.log10(TOTAL_SWIMMERS / rank)) * 6 + (this.won ? 150 : 0),
      combo: this.dnaRun - this.dnaBank - this.dnaBonus,
      bank: this.dnaBank,
      bounty: this.dnaBonus + 8 * beaten.length + (beaten.includes(firstName(RIVALS[RIVALS.length - 1])) ? 40 : 0),
    };
    const raw = bk.dist + bk.place + bk.combo + bk.bank + bk.bounty;
    const autoCut = raw * genMul * 0.4 * autoFrac;
    let dailyBonus = 0, streak = M.dailyStreak || 0, dailyBest = false;
    if (this.daily != null) {
      if (M.dailyDay !== this.daily) {
        M.dailyDay = this.daily; M.dailyBest = TOTAL_SWIMMERS; M.dailyRuns = 0;
        streak = M.dailyLastDay === this.daily - 1 ? streak + 1 : 1;
        M.dailyStreak = streak; M.dailyLastDay = this.daily;
        dailyBonus = Math.round(25 * Math.min(streak, 7) * genMul) * (streak % 7 === 0 ? 2 : 1);
      }
      M.dailyRuns++;
      if (!auto) { dailyBest = rank < M.dailyBest; M.dailyBest = Math.min(M.dailyBest, rank); }
    }
    const dna = Math.max(0, Math.round(raw * genMul - autoCut)) + dailyBonus;
    M.dna += dna; M.runs++; if (!auto) M.best = Math.min(M.best, rank); M.bestCombo = Math.max(M.bestCombo, p.bestCombo);
    let baby = null;
    if (this.won) { baby = babyFor(this.rng, this.muts); baby.gen = this.gen + 1; baby.run = M.runs; M.babies.push(baby); M.wins++; M.gen++; }
    const breakdown = { dist: Math.round(bk.dist), place: Math.round(bk.place), combo: Math.round(bk.combo), bank: Math.round(bk.bank), bounty: Math.round(bk.bounty), genMul, autoCut: Math.round(autoCut), dailyBonus };
    this.over = { reason, rank, dna, dist, baby, combo: p.bestCombo, overtakes: p.overtakes, zone: this.zoneReached,
      tier: p.bestTier, synergies: Object.keys(this.syn), comboDna: Math.round(this.dnaFromCombo), daily: this.daily, dailyBest,
      events: this.schedule.filter((e) => p.y >= e.y0).map((e) => e.id),
      by, rivalsBeaten: beaten, gapSec, auto, breakdown, dailyBonus, streak: this.daily != null ? streak : 0 };
    this.emit('over', this.over);
  }

  progress() { return clamp((this.p.y) / RACE_LEN, 0, 1); }
  remaining() { return Math.max(0, RACE_LEN - 70 - this.p.y); }
}

export { RACE_LEN, ZONES, MUTATIONS, HABITS, HABIT_ORDER, habitCost };
