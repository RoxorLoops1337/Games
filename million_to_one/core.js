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

// ------------------------------------------------------------------ combos, synergies, race events
// DNA multiplier for the current combo chain: x1 at 0, +0.04 per link, capped at x3 (combo 50).
export const comboMult = (n) => 1 + Math.min(Math.max(0, n), 50) * 0.04;

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
  { id: 'supernova', name: 'Supernova',         icon: '🌟', needs: ['hype', 'nitro'],    desc: 'FRENZY starts with a blast that pops every Big Mac near you, and lasts 1.5s longer.' },
  { id: 'sugarHigh', name: 'Sugar High',        icon: '🍭', needs: ['magnet', 'sweet'],  desc: 'Every fruit sugar you grab adds +1 combo.' },
  { id: 'jetstream', name: 'Jetstream',         icon: '✈️', needs: ['draft', 'whip'],    desc: 'Dashing out of a draft is free and lasts longer.' },
  { id: 'porcupine', name: 'Porcupine',         icon: '🌵', needs: ['spiky', 'helmet'],  desc: 'A popped Big Mac pops its neighbours too. Chain pops!' },
  { id: 'comeback',  name: 'Comeback Kid',      icon: '🎬', needs: ['second', 'bloom'],  desc: 'Second Wind also starts FRENZY and gives +10% speed for the rest of the run.' },
  { id: 'hypeSquad', name: 'Hype Squad',        icon: '🎉', needs: ['wingman', 'hype'],  desc: 'Every FRENZY brings your Wingman back.' },
  { id: 'elephant',  name: 'Elephant Brain',    icon: '🐘', needs: ['memory', 'echo'],   desc: 'Dropped combos keep 3/4 instead of half.' },
  { id: 'greased',   name: 'Greased Lightning', icon: '⚡', needs: ['slick', 'goo'],     desc: 'Near misses also recharge your dash.' },
];
export function synergiesFor(muts) { return SYNERGIES.filter((s) => s.needs.every((id) => (muts[id] || 0) > 0)); }

// Random mid-race events. Each run schedules a few, placed by the layout seed, in zones that suit them.
export const RACE_EVENTS = {
  sneeze:     { name: 'DAD SNEEZED!',        text: 'Turbulence! Hold on to your tail.',                      zones: ['acid', 'goo', 'sea', 'rapids'] },
  sugarRush:  { name: 'SUGAR RUSH!',         text: 'Dad found the fruit bowl. Fruit EVERYWHERE.',            zones: ['acid', 'goo', 'sea', 'rapids'] },
  stampede:   { name: 'BIG MAC STAMPEDE!',   text: 'The immune system called in the whole team. Dodge!',     zones: ['acid', 'sea', 'rapids'] },
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
export const DEAD_Y = FORK_END + 3200;                 // the wrong tube ends here
const BLEND = 1200, DIV_W = 40, AFTER = 2500;

export function zoneIndex(y) { for (let i = ZONES.length - 1; i >= 0; i--) if (y >= ZSTART[i]) return i; return 0; }

function params(y) {
  const i = zoneIndex(y), z = ZONES[i];
  let hw = z.hw, wob = z.wob;
  const n = ZONES[i + 1], pz = ZONES[i - 1];
  if (pz && pz.fork && y < ZSTART[i] + AFTER) wob *= smooth((y - ZSTART[i]) / AFTER);   // ease the wiggle back in after the fork
  if (n && !z.fork && y > ZSTART[i + 1] - BLEND) { const t = smooth((y - (ZSTART[i + 1] - BLEND)) / BLEND); hw = lerp(hw, n.hw, t); wob = lerp(wob, n.wob, t); }
  return { i, hw, wob };
}
// the tube's centre line before the fork
export function centre(y) {
  const { wob } = params(y);
  return VIEW_W / 2 + wob * (0.6 * Math.sin(y / 1100) + 0.4 * Math.sin(y / 530 + 1.3));
}
// one channel of the tube: {c, h}. side is -1/1 (only matters from the fork on).
export function channel(y, side) {
  const p = params(y), cx = centre(y);
  if (y < FORK_Y0 - 1 || !side) return { c: cx, h: p.hw };
  if (y < FORK_END) {
    const dw = DIV_W * smooth((y - FORK_Y0) / 1500), hw = ZONES[FORK_I].hw;
    return { c: cx + side * (dw + hw) / 2, h: (hw - dw) / 2 };
  }
  const t = smooth((y - FORK_END) / AFTER), hwF = ZONES[FORK_I].hw;
  return { c: cx + side * (DIV_W + hwF) / 2 * (1 - t), h: lerp((hwF - DIV_W) / 2, p.hw, t) };
}
export function trackInfo(y) { const p = params(y); return { zone: p.i, cx: centre(y), hw: p.hw, forked: y >= FORK_Y0 }; }

// ------------------------------------------------------------------ meta (rogue-lite save)
export function newMeta() {
  return { v: 1, dna: 0, habits: {}, gen: 0, best: TOTAL_SWIMMERS, runs: 0, wins: 0, babies: [], lastSeen: 0, bank: 0, introSeen: false, muted: false, bestCombo: 0, autopilot: false,
    dailyDay: -1, dailyBest: TOTAL_SWIMMERS, dailyRuns: 0, synergiesSeen: [] };
}
export function loadMeta(o) {
  const m = newMeta();
  if (!o || typeof o !== 'object') return m;
  for (const k of Object.keys(m)) if (k in o && typeof o[k] === typeof m[k]) m[k] = o[k];
  if (!Array.isArray(m.babies)) m.babies = [];
  if (!Array.isArray(m.synergiesSeen)) m.synergiesSeen = [];
  const h = {}; for (const id of HABIT_ORDER) { const lv = (o.habits && +o.habits[id]) || 0; if (lv > 0) h[id] = clamp(Math.floor(lv), 0, HABITS[id].max); }
  m.habits = h;
  if (!isFinite(m.dna) || m.dna < 0) m.dna = 0;
  return m;
}
export const lv = (meta, id) => meta.habits[id] || 0;
export function buyHabit(meta, id) {
  const l = lv(meta, id); if (l >= HABITS[id].max) return false;
  const c = habitCost(id, l); if (meta.dna < c) return false;
  meta.dna -= c; meta.habits[id] = l + 1; return true;
}
// DNA per hour the factory makes while you are away (capped at 8 hours)
export const factoryRate = (meta) => Math.round(10 * (1 + lv(meta, 'factory') * 0.9) * (1 + 0.5 * meta.gen));
export function idleTick(meta, now) {
  if (!meta.lastSeen) { meta.lastSeen = now; return 0; }
  const hrs = clamp((now - meta.lastSeen) / 3600000, 0, 8);
  meta.lastSeen = now;
  meta.bank = Math.min(meta.bank + hrs * factoryRate(meta), factoryRate(meta) * 8);
  return meta.bank;
}
export function collectBank(meta) { const d = Math.floor(meta.bank); meta.dna += d; meta.bank -= d; return d; }

// ------------------------------------------------------------------ the race
export class Race {
  constructor(meta, rng = Math.random, opts = {}) {
    this.meta = meta; this.rng = rng; this.t = 0; this.events = [];
    this.gen = meta.gen;
    this.muts = {}; this.syn = {}; this.pending = null; this.rerolls = lv(meta, 'meditate');
    this.over = null; this.won = false; this.paused = false;
    // layout seed: a daily race (opts.seed = day number) fixes the egg side, the field, the
    // spawn layout, the events and the card offers; otherwise it comes from rng.
    this.daily = opts.seed != null && isFinite(opts.seed) ? Math.floor(opts.seed) : null;
    this.layoutSeed = this.daily != null ? hashSeed(this.daily) : Math.floor(rng() * 4294967296) >>> 0;
    const lrng = mulberry(this.layoutSeed);
    this.orng = this.daily != null ? mulberry(this.layoutSeed ^ 0x5BD1E995) : rng;
    this.eggSide = lrng() < 0.5 ? -1 : 1;
    this.schedule = opts.events === false ? [] : this.planEvents(lrng);
    this.ev = null;
    this.input = { tx: null, dir: 0, dash: false, tap: 0 };
    this.autopilot = !!opts.autopilot;
    const startY = 40 + 250 * lv(meta, 'jeans');
    const maxE = 100 + 12 * lv(meta, 'water');
    this.p = { x: VIEW_W / 2, y: startY, vx: 0, vy: 0, e: maxE, maxE, shield: lv(meta, 'hottub'), dashT: 0, dashCd: 0, frenzyT: 0, nextFrenzy: 10,
      combo: 0, comboT: 0, comboMax: 2.2, tier: 0, fz: 0, bestTier: 0, mult: 1, bestCombo: 0, draft: 0, comeback: 0, side: 0, stuck: 0, inv: 0, acid: 0, wing: 0, second: 0, overtakes: 0, heading: 0 };
    this.startY = startY;
    this.dnaRun = 0; this.zoneReached = 0; this.cleared = 0;
    this.ents = []; this.genY = Math.ceil((startY + 300) / 100) * 100;   // rows on a fixed 100 grid (same daily layout for everyone)
    this.drill = null;   // egg phase
    this.fx = [];        // short-lived world effects for the renderer (eaten rivals etc.)
    this.agents = [];
    const fieldBase = 430 * (1 + 0.06 * this.gen);
    // weights: how many real swimmers each rival stands for, per zone
    const n = N_AGENTS; let keep = 1, surv = 1; this.wz = [];
    for (const z of ZONES) { keep *= z.keep; surv *= (1 - z.q); this.wz.push(Math.max(1, TOTAL_SWIMMERS * keep / (n * surv))); }
    this.w0 = (TOTAL_SWIMMERS - 1) / n;
    for (let i = 0; i < n; i++) {
      const lane = lrng() * 1.8 - 0.9, side = lane < 0 ? -1 : 1;
      const a = { y: 60 + lrng() * 1700, lane, side, lane2: clamp(Math.abs(lane) / 0.9 * 2 - 1, -0.9, 0.9), sp: fieldBase * clamp(1 + 0.1 * gauss(lrng), 0.7, 1.32),
        stam: lrng(), alive: true, zone: -1, deathY: Infinity, ahead: true, ph: lrng() * 6.28, kx: 0, arrived: false, drill: 0, w: this.w0, face: Math.floor(lrng() * 6) };
      this.agents.push(a);
    }
    // the named rivals: fast, tough, and they never just fizzle out
    RIVALS.forEach((R, k) => {
      const a = this.agents[k];
      Object.assign(a, { boss: R, sp: fieldBase * R.sp, stam: 1, y: 900 + lrng() * 800, w: 1 });
      a.side = lrng() < R.smart ? this.eggSide : -this.eggSide; a.lane = a.side * (0.2 + lrng() * 0.6);
    });
    this.rank = this.computeRank(); this.alive = TOTAL_SWIMMERS; this.startRank = this.rank;
    this.refreshStats();
    this.p.nextFrenzy = this.frenzyThreshold(0); this.p.comboMax = this.s.combo;
    this.dnaFromCombo = 0;   // DNA earned on top of the base thanks to combo multipliers (for the result screen)
  }

  // ---------------------------------------------------------------- derived stats
  refreshStats() {
    const m = this.muts, M = this.meta, s = {}, syn = this.syn;
    s.speed = 420 * (1 + 0.04 * lv(M, 'broccoli')) * (1 + 0.1 * (m.turbo || 0)) * (1 + 0.04 * (m.bloom ? this.cleared : 0)) * (syn.comeback && this.p.comeback ? 1.1 : 1);
    s.drain = 3.6 * (1 - 0.05 * lv(M, 'sleep')) * Math.pow(0.82, m.eco || 0);
    s.draft = 0.2 * (1 + 0.6 * (m.draft || 0)) * (1 + 0.08 * lv(M, 'walk'));
    s.sugar = 6 * (1 + 0.1 * lv(M, 'berries')) * (1 + 0.5 * (m.sweet || 0));
    s.magnet = 34 + 45 * (m.magnet || 0);
    s.acid = 26 * Math.pow(0.4, m.antacid || 0);
    s.combo = 2.2 + 1 * (m.memory || 0) + 0.25 * lv(M, 'beatbox');
    s.dashCd = 3 * Math.pow(0.65, m.whip || 0);
    s.dashCost = 7 * Math.pow(0.7, m.whip || 0);
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
  tierOf(combo) { let t = 0; while (combo >= this.frenzyThreshold(t)) t++; return t; }

  computeRank() { let r = 1; const py = this.p.y; for (const a of this.agents) if (a.alive && (a.y > py || (a.arrived && this.drill && a.arrivedT < this.drill.t0))) r += a.arrived ? 1 : a.w; return Math.round(r); }
  computeAlive() { let n = 1; for (const a of this.agents) if (a.alive) n += a.arrived ? 1 : a.w; return Math.round(n); }

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
  offer() {
    const rng = this.orng, pool = MUT_ORDER.filter((id) => (this.muts[id] || 0) < MUTATIONS[id].max && !(id === 'nose' && this.p.y > FORK_END));
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const ws = pool.map((id) => [10, 4, 1.3][MUTATIONS[id].r - 1]);
      let r = rng() * ws.reduce((a, b) => a + b, 0), k = 0;
      while (r > ws[k]) { r -= ws[k]; k++; }
      picks.push(pool.splice(Math.min(k, pool.length - 1), 1)[0]);
    }
    this.pending = picks;
    this.emit('offer', { picks });
  }
  reroll() { if (!this.pending || this.rerolls <= 0) return false; this.rerolls--; this.offer(); return true; }
  choose(id) {
    if (!this.pending || !this.pending.includes(id)) return false;
    this.muts[id] = (this.muts[id] || 0) + 1; this.pending = null;
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
      if (fresh) seen.push(x.id);
      this.emit('synergy', { id: x.id, name: x.name, icon: x.icon, desc: x.desc, needs: x.needs, fresh });
    }
    this.refreshStats();
    return true;
  }

  // ---------------------------------------------------------------- spawning
  // Each 100-unit row gets its own generator seeded from the layout seed, so a daily race lays
  // out the same rows for everybody no matter how they swam before.
  spawnAhead() {
    const p = this.p, m = this.muts;
    while (this.genY < p.y + 2200 && this.genY < RACE_LEN - 400) {
      const y = this.genY, zi = zoneIndex(y), z = ZONES[zi], hz = z.hazards;
      const step = 100; this.genY += step;
      const sides = y >= FORK_Y0 ? (y >= FORK_END ? [p.side || 1] : [-1, 1]) : [0];
      const ev = this.eventAt(y), evId = ev ? ev.id : '';
      const sugarP = (hz.sugar || 0) * 0.07 * (evId === 'sugarRush' ? 3 : 1);
      const dnaP = 0.012 * (1 + 0.5 * (m.lucky || 0)) * (evId === 'goldRush' ? 6 : 1);
      const wbcP = (hz.wbc || 0) * 0.05 + (evId === 'stampede' ? 0.07 : 0);
      for (const side of sides) {
        const rng = mulberry((this.layoutSeed ^ Math.imul((y / step) * 3 + side + 2, 0x2C1B3C6D)) >>> 0);
        const ch = channel(y, side), rx = () => ch.c + (rng() * 2 - 1) * ch.h * 0.8;
        if (sugarP && rng() < sugarP) {           // a little trail of fruit sugar
          const x0 = rx(), dx = (rng() * 2 - 1) * 14, n = 3 + Math.floor(rng() * 3);
          for (let k = 0; k < n; k++) this.ents.push({ t: 'sugar', x: clamp(x0 + dx * k, ch.c - ch.h + 12, ch.c + ch.h - 12), y: y + k * 34, r: 9 });
        }
        if (rng() < dnaP) this.ents.push({ t: 'dna', x: rx(), y: y + 50, r: 11 });
        if (rng() < 0.004 && zi > 0) this.ents.push({ t: 'shield', x: rx(), y: y + 50, r: 13 });
        if (hz.acid && rng() < 0.2 * hz.acid) this.ents.push({ t: 'acid', x: rx(), y: y + rng() * 100, r: 26 + rng() * 40, seed: rng() * 9 });
        if (hz.alkali && rng() < 0.06 * hz.alkali) this.ents.push({ t: 'alkali', x: rx(), y: y + 50, r: 11 });
        if (hz.goo && rng() < 0.1 * hz.goo) this.ents.push({ t: 'goo', x: rx(), y: y + rng() * 100, r: 30 + rng() * 34, seed: rng() * 9 });
        if (hz.gate && y % 1300 < step && y > ZSTART[zi] + 500 && y < ZSTART[zi] + z.len - 500) {
          const gw = 78 + rng() * 30, n2 = rng() < 0.45 ? 2 : 1, gaps = [];
          for (let k = 0; k < n2; k++) gaps.push(ch.c - ch.h + gw / 2 + 10 + rng() * (ch.h * 2 - gw - 20));
          this.ents.push({ t: 'gate', x: ch.c, y, r: ch.h, gaps, gw, side });
        }
        if (wbcP && rng() < wbcP) this.ents.push({ t: 'wbc', x: rx(), y: y + 50, r: 22 + rng() * 8, vx: 0, vy: 0, hunt: 0, eat: 0, ph: rng() * 6 });
        if (hz.current && rng() < 0.03 * hz.current) this.ents.push({ t: 'current', x: ch.c, y, r: ch.h, h: 260 + rng() * 200, dir: rng() < 0.5 ? -1 : 1 });
      }
    }
  }

  // ---------------------------------------------------------------- autopilot (also the test bot)
  autoSteer() {
    const p = this.p, ch = channel(p.y + 120, p.side || (this.muts.nose ? this.eggSide : 0));
    let best = p.x, bestS = -1e9;
    let forkSide = p.side;
    if (!forkSide && p.y > FORK_Y0 - 1500) forkSide = this.muts.nose ? this.eggSide : (p.x < centre(p.y) ? -1 : 1);
    for (let k = 0; k <= 16; k++) {
      let x = ch.c - ch.h + 14 + (ch.h * 2 - 28) * k / 16;
      if (forkSide && p.y > FORK_Y0 - 1500 && p.y < FORK_Y0 + 400) { const c2 = centre(FORK_Y0 + 400); x = c2 + forkSide * (30 + 120 * k / 16); }
      let s = -Math.abs(x - p.x) * 0.08 - Math.abs(x - ch.c) * 0.02;
      for (const e of this.ents) {
        const dy = e.y - p.y; if (dy < -20 || dy > 420) continue;
        const near = Math.abs(e.x - x) < e.r + 18, w = 1 - dy / 500;
        if (e.t === 'sugar' && Math.abs(e.x - x) < 26) s += 30 * w * (p.e < p.maxE - 8 ? 1 : 0.2);
        else if (e.t === 'dna' && Math.abs(e.x - x) < 26) s += 20 * w;
        else if (e.t === 'acid' && near) s -= 70 * w;
        else if (e.t === 'goo' && near) s -= 40 * w;
        else if (e.t === 'wbc' && Math.abs(e.x - x) < e.r + 40) s -= 200 * w;
        else if (e.t === 'gate' && dy < 300) { if (!e.gaps.some((g) => Math.abs(g - x) < e.gw / 2 - 12)) s -= 400 * w; }
      }
      if (s > bestS) { bestS = s; best = x; }
    }
    this.input.tx = best;
    this.input.dash = p.e > 55 && p.dashCd <= 0 && p.stuck <= 0;
  }

  // ---------------------------------------------------------------- one simulation step
  step(dt) {
    if (this.over || this.pending || this.paused) return;
    this.t += dt;
    const p = this.p, s = this.s, rng = this.rng;
    if (this.drill) { this.stepDrill(dt); return; }
    this.spawnAhead();
    if (this.autopilot) this.autoSteer();

    // zone progress and mutation drafts
    const zi = zoneIndex(p.y);
    if (zi > this.zoneReached) {
      this.zoneReached = zi; this.cleared = zi; p.wing = this.muts.wingman || 0;
      this.refreshStats();
      this.emit('zone', { zi });
      this.offer();
      return;
    }
    this.stepEvent();
    if (!p.side && p.y >= FORK_Y0) { p.side = p.x < centre(p.y) ? -1 : 1; this.emit('fork', { side: p.side, right: p.side === this.eggSide }); }

    // timers
    p.dashCd = Math.max(0, p.dashCd - dt); p.dashT = Math.max(0, p.dashT - dt); p.inv = Math.max(0, p.inv - dt); p.stuck = Math.max(0, p.stuck - dt);
    if (p.frenzyT > 0) { p.frenzyT -= dt; if (p.frenzyT <= 0) this.emit('frenzyEnd'); }
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

    // steering
    const ch = channel(p.y, p.side);
    let tx = this.input.tx;
    if (tx == null && this.input.dir) tx = p.x + this.input.dir * 120;
    const want = tx == null ? 0 : clamp((tx - p.x) * 9, -460, 460);
    p.vx += (want - p.vx) * Math.min(1, dt * 12);
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
    this.draftTarget = target;

    // forward speed
    let sp = s.speed * (1 + p.draft + (tier ? FRENZY_TIERS[Math.min(tier, FRENZY_TIERS.length) - 1].speed : 0) + (p.dashT > 0 ? 0.75 : 0));
    if (ev === 'espresso') sp *= 1.12;
    const z = ZONES[zi];
    if (z.current) { const rel = Math.abs(p.x - ch.c) / ch.h; sp *= 1 - z.current * (0.55 + 0.9 * rel * rel); }
    if (p.e < 15) sp *= 0.55 + 0.45 * p.e / 15;
    let inAcid = false, inGoo = false;
    for (const e of this.ents) {
      const dy = e.y - p.y; if (dy > 200 || dy < -200) continue;
      if (e.t === 'acid' || e.t === 'goo') {
        const d = Math.hypot(e.x - p.x, (e.y - p.y) * 1.3);
        if (d < e.r) { if (e.t === 'acid') inAcid = true; else inGoo = true; }
        else if (d < e.r + 18 && !e.near) { e.near = 1; this.nearMiss(e.x, e.y); }
      } else if (e.t === 'current' && p.y > e.y && p.y < e.y + e.h) p.vx += e.dir * 260 * dt;
    }
    if (inAcid && !safe && tier < 4) { sp *= 0.8; p.e -= s.acid * dt; p.acid = 1; } else p.acid = Math.max(0, p.acid - dt * 2);
    if (inGoo) sp *= this.muts.goo ? 0.9 : 0.5;
    if (p.stuck > 0) sp *= 0.15;
    p.vy = sp;

    // move, gates, walls
    this.prevPY = p.y;
    const ny = p.y + p.vy * dt;
    for (const e of this.ents) {
      if (e.t !== 'gate' || (p.y >= FORK_Y0 && e.side && e.side !== p.side)) continue;
      if (p.y < e.y - 9 && ny >= e.y - 9 && !e.gaps.some((g) => Math.abs(g - p.x) < e.gw / 2 - 6)) {
        if (this.muts.goo || safe) { if (!e.surf) { e.surf = 1; this.emit('surf', { x: p.x, y: e.y }); } }
        else { p.stuck = 0.4; p.vy = 0; p.y = e.y - 10; this.emit('bonk', { x: p.x, y: e.y }); break; }
      } else if (p.y < e.y && ny >= e.y && !e.passed) { e.passed = 1; this.addCombo('gate', p.x, e.y); }
    }
    if (p.vy > 0) p.y = ny;
    p.x += p.vx * dt;
    const wl = ch.c - ch.h + 9, wr = ch.c + ch.h - 9;
    if (p.x < wl) { p.x = wl; p.vx = Math.abs(p.vx) * 0.3; } else if (p.x > wr) { p.x = wr; p.vx = -Math.abs(p.vx) * 0.3; }
    p.heading = Math.atan2(p.vx, Math.max(60, p.vy));

    // energy
    p.e -= s.drain * dt * (p.draft > 0.05 ? 0.5 : 1) * (ev === 'espresso' ? 1.25 : 1);
    if (this.muts.draft && p.draft > 0.1) p.e += 1.2 * this.muts.draft * dt;

    // pickups and enemies
    this.stepEnts(dt, frenzy, safe, tier);
    this.stepAgents(dt);

    p.e = Math.min(p.e, p.maxE);
    if (p.e <= 0) {
      if (p.second) {
        p.second = 0; p.e = 60; p.inv = 2; this.emit('second');
        if (this.syn.comeback) { p.comeback = 1; this.refreshStats(); p.frenzyT = Math.max(p.frenzyT, this.s.frenzyLen); p.tier = Math.max(p.tier, 1); p.fz = Math.max(p.fz, 1); this.emit('frenzy', { n: p.combo, first: true, tier: p.tier, name: FRENZY_TIERS[p.tier - 1].name, comeback: true }); }
      }
      else return this.end('energy');
    }
    if (p.side && p.side !== this.eggSide && p.y >= DEAD_Y - 40) return this.end('wrong');
    if (p.y >= RACE_LEN - 70) this.startDrill();
  }

  // one link in the chain. n links at once (Chain Reaction doubles, Slick Moves adds).
  addCombo(kind, x, y, n = 1) {
    const p = this.p, s = this.s, frenzy = p.frenzyT > 0;
    if (frenzy && this.muts.chain) {
      n *= 2;
      if (kind === 'pass') p.frenzyT = Math.max(p.frenzyT, Math.min(p.frenzyT + 0.2, s.frenzyLen * 2));
    }
    p.combo += n;
    const long = (frenzy && p.tier >= 3 ? 1.5 : 1) * (this.evIs('disco') ? 1.5 : 1);
    p.comboMax = s.combo * long; p.comboT = p.comboMax;
    p.bestCombo = Math.max(p.bestCombo, p.combo);
    p.mult = comboMult(p.combo);
    const gain = 0.12 * n * p.mult * (this.evIs('disco') ? 2 : 1);
    this.dnaRun += gain; this.dnaFromCombo += gain - 0.12 * n;
    this.emit('combo', { kind, n: p.combo, x, y, mult: p.mult });
    if (p.combo >= this.frenzyThreshold(p.fz)) {
      const first = p.frenzyT <= 0;
      while (p.combo >= this.frenzyThreshold(p.fz)) p.fz++;
      p.tier = Math.min(p.fz, FRENZY_TIERS.length);
      p.bestTier = Math.max(p.bestTier, p.tier);
      p.nextFrenzy = this.frenzyThreshold(p.fz);
      p.frenzyT = Math.max(p.frenzyT, s.frenzyLen);
      const ti = Math.min(p.tier, FRENZY_TIERS.length) - 1;
      this.emit('frenzy', { n: p.combo, first, tier: p.tier, name: FRENZY_TIERS[ti].name, desc: FRENZY_TIERS[ti].desc });
      if (this.muts.mosh) for (const a of this.agents) if (a.alive && !a.arrived && Math.abs(a.y - p.y) < 220) { a.kx += (this.agentX(a) < p.x ? -1 : 1) * 3; a.y -= 25; }
      if (this.syn.hypeSquad && (this.muts.wingman || 0) > p.wing) { p.wing = this.muts.wingman; this.emit('wingBack'); }
      if (this.syn.supernova) this.blast(p.x, p.y, 260, 'supernova');
    }
  }
  // a combo ran out: Echo Chamber keeps part of it, otherwise it is gone
  dropCombo() {
    const p = this.p, s = this.s, n = p.combo;
    const keep = s.keep ? Math.floor(n * s.keep) : 0;
    if (n >= 3) this.emit('comboEnd', { n, kept: keep });
    p.combo = keep; p.comboT = keep ? s.combo : 0; p.comboMax = s.combo;
    p.fz = this.tierOf(keep); p.tier = Math.min(p.fz, FRENZY_TIERS.length); p.nextFrenzy = this.frenzyThreshold(p.fz); p.mult = comboMult(keep);
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
    if (a.y < FORK_Y0 - 1) { const c = centre(a.y), h = params(a.y).hw; return c + a.lane * h * 0.9 + a.kx * 20; }
    const ch = channel(a.y, a.side); return ch.c + a.lane2 * ch.h * 0.85 + a.kx * 10;
  }

  stepAgents(dt) {
    const p = this.p, rng = this.rng, ev = this.ev ? this.ev.id : '';
    const evSp = ev === 'espresso' ? 1.12 : ev === 'slipstream' ? 1.05 : 1, sneeze = ev === 'sneeze';
    const ramW = this.s.ramW;
    let rank = 1, alive = 1;
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.arrived) {     // already at the egg and drilling in: if one gets through, it is over for everybody
        alive++; rank++; a.drill += dt;
        if (a.drill >= EGG_DRILL) { this.rank = this.computeRank(); this.eggTaken = a; return this.end('late'); }
        continue;
      }
      const zi = zoneIndex(a.y);
      if (zi !== a.zone) {             // entering a zone: roll whether this zone gets you
        a.zone = zi; const z = ZONES[zi];
        if (!z.fork && !a.boss && rng() < z.q) a.deathY = ZSTART[zi] + rng() * z.len;
      }
      const z = ZONES[zi];
      let sp = a.sp * (1 - (1 - a.stam) * 0.28 * a.y / RACE_LEN);
      if (z.current) sp *= 1 - z.current * 0.75;
      sp *= (1 + 0.06 * Math.sin(this.t * 1.7 + a.ph)) * evSp;
      if (sneeze) a.kx += Math.sin(this.t * 2.6 + a.ph) * 1.5 * dt;
      const wasAhead = a.y > this.prevPY;
      a.y += sp * dt;
      a.kx *= Math.pow(0.1, dt);
      if (a.y >= a.deathY || (a.side !== this.eggSide && a.y >= DEAD_Y)) { this.killAgent(a, 'pop'); continue; }
      if (a.y >= RACE_LEN - 70) { a.arrived = true; a.arrivedT = this.t; a.y = RACE_LEN - 70; this.emit('arrive', {}); alive++; rank++; continue; }
      // weight: how many real swimmers this rival stands for right now
      const t = clamp((a.y - ZSTART[zi]) / z.len, 0, 1);
      const w0 = zi ? this.wz[zi - 1] : this.w0, w1 = z.egg ? 1 : this.wz[zi];
      a.w = a.boss ? 1 : lerp(w0, w1, t);
      // overtakes (only rivals you can actually see)
      const nowAhead = a.y > p.y, sameTube = p.y < FORK_Y0 || a.side === p.side;
      if (wasAhead && !nowAhead && sameTube) {
        const dx = Math.abs(this.agentX(a) - p.x);
        if (dx < 220) {
          p.overtakes++;
          if (this.muts.rush) p.e += 1.5 * this.muts.rush;
          this.addCombo('pass', this.agentX(a), a.y);
          this.emit('pass', { w: Math.round(a.w), x: this.agentX(a), y: a.y, boss: a.boss && a.boss.name });
        }
      }
      // battering ram: bump rivals you swim into
      if (this.muts.ram && sameTube && Math.abs(a.y - p.y) < ramW && !a.bumped) {
        const ax = this.agentX(a);
        if (Math.abs(ax - p.x) < ramW) {
          const dozer = this.syn.bulldozer;
          a.bumped = 1; a.kx += (ax < p.x ? -2.2 : 2.2) * (dozer ? 1.6 : 1); a.y -= dozer ? 45 : 30; p.e += 3 + (dozer ? 1.5 * (this.muts.rush || 0) : 0);
          this.addCombo('bump', ax, a.y); this.emit('bump', { x: ax, y: a.y, dozer });
        }
      }
      if (nowAhead || a.arrived) rank += a.w;
      alive += a.w;
    }
    this.rank = Math.max(1, Math.round(rank));
    this.alive = Math.round(alive);
  }

  killAgent(a, how) {
    a.alive = false;
    if (Math.abs(a.y - this.p.y) < 700) this.fx.push({ t: how, x: this.agentX(a), y: a.y, age: 0 });
  }

  stepEnts(dt, frenzy, nitro, tier = 0) {
    const p = this.p, s = this.s, magnet = s.magnet * (tier >= 2 ? 2 : 1);
    const dnaMul = p.mult * (tier >= 5 ? 2 : 1);
    for (const e of this.ents) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (e.t === 'sugar' || e.t === 'dna' || e.t === 'shield' || e.t === 'alkali') {
        if (d < magnet + e.r) { const k = Math.min(1, dt * 9); e.x -= dx * k; e.y -= dy * k * 0.7; }
        if (d < e.r + 12) {
          e.dead = 1;
          if (e.t === 'sugar') { p.e += s.sugar; this.dnaRun += 0.05 * dnaMul; this.emit('sugar', { x: e.x, y: e.y }); if (this.syn.sugarHigh) this.addCombo('sugar', e.x, e.y); }
          else if (e.t === 'dna') { const g = s.dnaBlob * dnaMul; this.dnaRun += g; this.dnaFromCombo += g - s.dnaBlob; this.emit('dna', { x: e.x, y: e.y, amount: Math.round(g) }); }
          else if (e.t === 'shield') { p.shield++; this.emit('shield', { x: e.x, y: e.y }); }
          else { p.e += 6; p.acid = 0; this.emit('alkali', { x: e.x, y: e.y }); }
        }
      } else if (e.t === 'wbc') {
        e.ph += dt;
        if (d < 300 && dy > -60) { e.hunt = Math.min(1, e.hunt + dt * 2); }
        const spd = 170 * e.hunt;
        e.vx += ((dx < 0 ? 1 : -1) * spd - e.vx) * Math.min(1, dt * 3);
        e.vy += ((dy > 0 ? -spd * 0.6 : 0) - e.vy) * Math.min(1, dt * 2);
        e.x += e.vx * dt + Math.sin(e.ph * 2) * 10 * dt; e.y += e.vy * dt;
        // snack on rivals that swim through
        for (const a of this.agents) if (a.alive && !a.arrived && !a.boss && Math.abs(a.y - e.y) < e.r && Math.abs(this.agentX(a) - e.x) < e.r) { this.killAgent(a, 'eaten'); e.eat = 0.4; }
        e.eat = Math.max(0, e.eat - dt);
        if (d < e.r + 8) {
          if (nitro || p.inv > 0) { if (nitro) { e.dead = 1; this.emit('pop', { x: e.x, y: e.y }); this.addCombo('pop', e.x, e.y); } continue; }
          e.dead = 1; this.emit('pop', { x: e.x, y: e.y });
          if (this.muts.spiky) { p.e += 10; this.addCombo('pop', e.x, e.y); if (this.syn.porcupine) this.blast(e.x, e.y, 140, 'porcupine'); }
          else if (p.wing > 0) { p.wing--; p.inv = 1; this.emit('wingHit', { x: e.x, y: e.y }); }
          else if (p.shield > 0) { p.shield--; p.inv = 1.2; this.emit('shieldHit', { x: e.x, y: e.y }); }
          else { this.end('wbc'); return; }
        } else if (d < e.r + 30 && !e.near && dy < 0) { e.near = 1; this.nearMiss(e.x, e.y); }
      }
    }
    if (this.ents.length > 400 || (this.t % 1 < dt)) this.ents = this.ents.filter((e) => !e.dead && e.y > p.y - 700);
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < 1.2);
  }

  // ---------------------------------------------------------------- the egg
  startDrill() {
    this.drill = { t0: this.t, me: 0, need: EGG_DRILL };
    this.p.y = RACE_LEN - 70;
    this.arriveRank = this.computeRank();
    this.emit('drill', { rank: this.arriveRank });
  }
  stepDrill(dt) {
    const d = this.drill, p = this.p;
    d.me += dt * (0.5 + (p.frenzyT > 0 ? 0.3 : 0)) + this.input.tap * 0.09;
    if (this.input.tap) this.emit('drillTap', { n: this.input.tap });
    this.input.tap = 0;
    if (this.autopilot) d.me += dt * 0.6;
    p.frenzyT = Math.max(0, p.frenzyT - dt);
    // the others keep swimming and drilling
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (!a.arrived) { a.y += a.sp * 0.9 * dt; if (a.side !== this.eggSide && a.y >= DEAD_Y) { a.alive = false; continue; } if (a.y >= RACE_LEN - 70) { a.arrived = true; a.arrivedT = this.t; a.y = RACE_LEN - 70; } continue; }
      a.drill += dt;
      if (a.drill >= d.need) { this.rank = this.computeRank(); return this.end('late'); }
    }
    if (d.me >= d.need) return this.end('win');
  }

  // ---------------------------------------------------------------- end of run
  end(reason) {
    if (this.over) return;
    const p = this.p, M = this.meta;
    this.won = reason === 'win';
    if (this.won) this.rank = 1;
    const dist = Math.max(0, p.y - this.startY);
    const rank = this.rank;
    let dna = dist / 900 + this.dnaRun + Math.max(0, Math.log10(TOTAL_SWIMMERS / rank)) * 6;
    if (rank <= 1000) dna += 15; if (rank <= 100) dna += 30; if (this.won) dna += 150;
    dna = Math.round(dna * (1 + 0.5 * this.gen));
    M.dna += dna; M.runs++; M.best = Math.min(M.best, rank); M.bestCombo = Math.max(M.bestCombo, p.bestCombo);
    let baby = null;
    let dailyBest = false;
    if (this.daily != null) {
      if (M.dailyDay !== this.daily) { M.dailyDay = this.daily; M.dailyBest = TOTAL_SWIMMERS; M.dailyRuns = 0; }
      M.dailyRuns++; dailyBest = rank < M.dailyBest; M.dailyBest = Math.min(M.dailyBest, rank);
    }
    if (this.won) { baby = babyFor(this.rng, this.muts); baby.gen = this.gen + 1; baby.run = M.runs; M.babies.push(baby); M.wins++; M.gen++; }
    this.over = { reason, rank, dna, dist, baby, combo: p.bestCombo, overtakes: p.overtakes, zone: this.zoneReached,
      tier: p.bestTier, synergies: Object.keys(this.syn), comboDna: Math.round(this.dnaFromCombo), daily: this.daily, dailyBest,
      events: this.schedule.filter((e) => p.y >= e.y0).map((e) => e.id) };
    this.emit('over', this.over);
  }

  progress() { return clamp((this.p.y) / RACE_LEN, 0, 1); }
  remaining() { return Math.max(0, RACE_LEN - 70 - this.p.y); }
}

export { RACE_LEN, ZONES, MUTATIONS, HABITS, HABIT_ORDER, habitCost };
