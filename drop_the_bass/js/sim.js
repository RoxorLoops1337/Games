// sim.js: the battle simulation. Deterministic (seeded), no DOM, no Math.random, no Date. Fixed 1/60 s ticks via advance(dt).
// The view reads run.turrets / run.enemies / run.projectiles and drains run.events each frame.
import {
  COLS, ROWS, TILE, TURRETS, ENEMIES, BOSSES, AFFIXES, WORLD_BY_ID, ECON, MAX_LEVEL, RARITY,
  buildMap, laneAt, lvlDmg, lvlRate, lvlRange, encoreHp, encoreSpeed, tileCx, tileCy,
} from './data_core.js';
import { freshMods, applyFx, REMIX, RELICS, WAVE_MODS, DAILY_MODS } from './data_run.js';
import { makeRng } from './rng.js';

export const DT = 1 / 60;
const INTRO_WAVE = { fuzz: 1, zip: 2, drone: 3, echo: 4, brick: 5, leech: 6, gate: 7, rager: 7, squeal: 8, mute: 9 };
const NONE_WM = Object.freeze({});

// ------------------------------------------------------------------------------------------------ wave generation (pure)
export function waveBaseHp(world, w, encore = 0) {
  const g1 = Math.pow(ECON.hpGrowth, Math.min(w, 20) - 1);
  const g2 = Math.pow(ECON.hpGrowthLate, Math.max(0, w - 20));
  return ECON.hpPerWaveBase * g1 * g2 * world.hpMul * encoreHp(encore);
}
export const waveCoinScale = (w) => 1 + 0.09 * (w - 1);

export function genWave(world, w, seed, o = {}) {
  const rng = makeRng(((seed >>> 0) * 2654435761 + w * 40503 + 17) >>> 0);
  const endless = !!o.endless;
  const avail = world.pool.filter((t) => (INTRO_WAVE[t] || 1) <= w);
  const bossWave = w % 10 === 0;
  const budget = 6 + 1.7 * w;
  const nGroups = w < 3 ? 1 : w < 9 ? 2 : 3;
  const types = [];
  const newbies = avail.filter((t) => INTRO_WAVE[t] === w);
  if (newbies.length) types.push(newbies[0]);
  while (types.length < Math.min(nGroups, avail.length)) {
    const t = rng.weighted(avail, (a) => (types.includes(a) ? 0.15 : 1) * (a === 'fuzz' ? 1.2 : 1));
    if (!types.includes(t)) types.push(t); else if (rng.chance(0.5)) break;
  }
  if (!types.length) types.push('fuzz');
  // a mod on some waves (never the first 3, not on boss waves of story mode so the boss reads clean)
  let mod = null;
  if (w >= 4 && !bossWave && rng.chance(Math.min(0.32, 0.12 + w * 0.01))) mod = rng.pick(Object.keys(WAVE_MODS));
  const wm = mod ? WAVE_MODS[mod].wm : NONE_WM;
  const countMul = wm.count || 1;
  const groups = [];
  let delay = 0.6;
  for (const type of types) {
    const def = ENEMIES[type];
    const count = Math.max(2, Math.min(40, Math.round((budget / types.length) / Math.pow(def.hp, 0.72) * countMul)));
    const gap = def.speed >= 80 ? 0.4 : def.hp >= 3 ? 1.5 : def.hp >= 2 ? 0.95 : 0.65;
    groups.push({ type, count, gap, delay });
    delay += count * gap + 1.2;
  }
  let boss = null, bossScale = 1;
  if (bossWave) {
    if (endless) { const ids = ['compressor', 'noisegate', 'reverb', 'djglitch', 'playback']; boss = ids[(Math.floor(w / 10) - 1) % ids.length]; bossScale = 1 + 0.35 * Math.floor((w - 1) / 50); }
    else if (w === 10) { boss = world.boss10; bossScale = 0.42; }
    else { boss = world.boss; bossScale = 1; }
    for (const g of groups) g.count = Math.max(2, Math.round(g.count * 0.55));
  }
  return { w, groups, boss, bossScale, mod, duration: delay };
}

// ------------------------------------------------------------------------------------------------ geometry helpers
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
function distPointSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + dx * t, cy = y1 + dy * t;
  return Math.hypot(px - cx, py - cy);
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

// ------------------------------------------------------------------------------------------------ the run
export class Run {
  constructor(opts = {}) {
    this.opts = opts;
    this.world = WORLD_BY_ID[opts.world || 'garage'];
    this.map = buildMap(this.world.map);
    this.encore = opts.encore || 0;
    this.mode = opts.mode || 'story';          // story | endless | daily | tutorial
    this.endless = this.mode === 'endless';
    this.seed = (opts.seed ?? 1) >>> 0;
    this.rng = makeRng(this.seed ^ 0x9e3779b9);
    this.wavesTotal = opts.wavesTotal || this.world.wavesTotal;
    this.loadout = (opts.loadout && opts.loadout.length ? opts.loadout : ['kick', 'snare', 'hat', 'sub']).slice();
    this.heroLv = Object.assign({ roxor: 1, jasmin: 1 }, opts.heroLv || {});
    this.daily = opts.daily && DAILY_MODS[opts.daily] ? DAILY_MODS[opts.daily] : null;

    // mods = permanent (studio, gear) + daily
    this.mods = freshMods();
    if (opts.baseFx) applyFx(this.mods, opts.baseFx);
    if (this.daily) {
      applyFx(this.mods, this.daily.mods || []);
      if (this.daily.loadout) this.loadout = this.daily.loadout.slice();
    }
    this.remix = {};          // id -> stacks
    this.relics = [];         // ids
    this.relicSet = new Set();

    this.t = 0; this.acc = 0;
    this.wave = 0;            // waves launched
    this.cleared = 0;         // waves fully cleared
    this.phase = 'prep';      // prep | wave | won | lost
    this.prepT = opts.firstPrep ?? 8;
    this.spawnQ = [];
    this.curSpec = null;
    this.wm = NONE_WM; this.wmId = null;

    this.stageMax = ECON.stageHp + this.mods.stageHp + (opts.stageHpBonus || 0);
    if (this.daily && this.daily.stageHp) this.stageMax = this.daily.stageHp;
    this.stageHp = this.stageMax;
    this.coins = ECON.startCoins + this.mods.startCoins;
    this.coinFrac = 0;
    this.deploys = 0;
    this.turrets = []; this.enemies = []; this.projectiles = [];
    this.grid = new Map();    // slot idx -> turret
    this.uid = 1;
    this.events = [];
    this.hype = 0; this.level = 1; this.hypeNeed = ECON.hypeBase;
    this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.kills = 0; this.leaks = 0; this.merges = 0; this.bossKills = 0; this.coinsEarned = 0; this.runGems = 0;
    this.healCount = 0; this.heroUses = 0; this.perfects = 0; this.duets = 0; this.remixCount = 0; this.maxLevelSeen = 1; this.bossTypes = [];
    this.rerolls = this.mods.rerolls + (opts.extraRerolls || 0);
    this.choice = null; this.choiceQ = [];
    this.revived = false;
    this.dropT = 0;
    this.heroCd = { roxor: 8, jasmin: 12 };      // start partly charged so the first use comes quickly
    this.sirenT = 0;                              // Jasmin's song active time
    this.lastHeroT = { roxor: -99, jasmin: -99 };
    this.speedHint = 1;
    this.autoMergeOwned = !!opts.autoMerge;
    this.forceDrops = (opts.forceDrops || []).slice();
    this.nextType = this.rollDrop();
    this.bpm = this.world.bpm;
    this.beatOffset = 0;
    this.result = null;
    if (this.daily && this.daily.deployLimit) this.slotLimit = this.daily.deployLimit;
    this.recalcAuras();
  }

  // ---------------------------------------------------------------- misc helpers
  emit(e) { if (this.events.length < 500) this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }
  get stageFrac() { return this.stageHp / this.stageMax; }
  beatPhase() { return (((this.t + this.beatOffset) * this.bpm / 60) % 1 + 1) % 1; }
  baseHp(w = this.wave || 1) { return waveBaseHp(this.world, w, this.encore) * this.mods.enemyHp; }
  rollDrop() {
    if (this.forceDrops.length) return this.forceDrops.shift();
    return this.rng.pick(this.loadout);
  }
  deployCost(onBeat = false) {
    if (this.mods.freeDeploys > 0) return 0;
    const n = this.deploys;
    let c = (ECON.deployBase + ECON.deployStep * n + ECON.deployCurve * n * n) * this.mods.deployCost;
    if (onBeat) c *= 1 - Math.min(0.5, 0.1 * this.mods.beatBonus);
    return Math.max(1, Math.round(c));
  }
  emptySlots() { return this.map.buildable.filter((s) => !this.grid.has(s.idx)); }
  slotAt(c, r) { return this.map.slots.find((s) => s.c === c && s.r === r) || null; }
  turretAt(c, r) { return this.grid.get(r * COLS + c) || null; }
  turretById(id) { return this.turrets.find((t) => t.id === id) || null; }
  slotsUsed() { return this.turrets.length; }
  slotCapacity() { return this.slotLimit || this.map.buildable.length; }

  // ---------------------------------------------------------------- turrets: deploy, merge, sell, move
  makeTurret(type, level, slot, paid = 0) {
    const t = {
      id: this.uid++, type, level, c: slot.c, r: slot.r, x: slot.x, y: slot.y, slot: slot.idx, cd: 0.3, paid, ang: -Math.PI / 2,
      fire: 0, mode: 'first', jam: 0, spin: 0, shots: 0, overdrive: 0, auraRate: 0, auraDmg: 0, auraRange: 0, auraCrit: 0, echo: 0,
      pulse2: 0, born: this.t, alt: 0,
    };
    this.turrets.push(t); this.grid.set(slot.idx, t);
    return t;
  }
  removeTurret(t) {
    this.turrets.splice(this.turrets.indexOf(t), 1);
    if (this.grid.get(t.slot) === t) this.grid.delete(t.slot);
  }
  canDeploy(slotIdx) {
    if (this.phase === 'won' || this.phase === 'lost' || this.choice) return { ok: false, reason: 'busy' };
    if (this.turrets.length >= this.slotCapacity()) return { ok: false, reason: 'full' };
    const slot = slotIdx == null ? null : this.map.buildable.find((s) => s.idx === slotIdx);
    if (slotIdx != null && (!slot || this.grid.has(slotIdx))) return { ok: false, reason: 'slot' };
    if (slotIdx == null && !this.emptySlots().length) return { ok: false, reason: 'full' };
    return { ok: true };
  }
  deploy(slotIdx = null, o = {}) {
    const can = this.canDeploy(slotIdx);
    if (!can.ok) return can;
    const onBeat = o.onBeat != null ? !!o.onBeat : this.onBeatNow();
    const cost = this.deployCost(onBeat);
    if (this.coins < cost) return { ok: false, reason: 'coins', cost };
    this.coins -= cost;
    const free = this.mods.freeDeploys > 0;
    if (free) this.mods.freeDeploys--;
    let slot;
    if (slotIdx != null) slot = this.map.buildable.find((s) => s.idx === slotIdx);
    else { const e = this.emptySlots(); slot = e[Math.floor(this.rng.next() * e.length)]; }
    const type = this.nextType;
    this.nextType = this.rollDrop();
    let level = this.mods.startLevel || 1;
    if (this.mods.lucky && this.rng.chance(this.mods.lucky)) level = Math.min(MAX_LEVEL, level + 1);
    const t = this.makeTurret(type, level, slot, cost);
    this.deploys++;
    this.recalcAuras();
    this.emit({ k: 'deploy', id: t.id, type, level, x: t.x, y: t.y, cost, onBeat, free });
    if (onBeat) { this.perfects++; this.emit({ k: 'perfect', x: t.x, y: t.y }); }
    this.maxLevelSeen = Math.max(this.maxLevelSeen, t.level);
    this.autoCheck = true;
    return { ok: true, turret: t, cost, onBeat };
  }
  onBeatNow() {
    const ph = this.beatPhase(); const beatLen = 60 / this.bpm;
    const err = Math.min(ph, 1 - ph) * beatLen;
    return err <= ECON.beatWindow;
  }
  rerollDrop() {
    if (this.rerolls <= 0 || this.choice) return false;
    this.rerolls--;
    const old = this.nextType;
    let n = this.rollDrop(); let guard = 0;
    while (n === old && this.loadout.length > 1 && guard++ < 8) n = this.rollDrop();
    this.nextType = n;
    this.emit({ k: 'reroll' });
    return true;
  }
  canMerge(a, b) {
    if (!a || !b || a === b) return false;
    if (this.mods.noMerge) return false;
    if (a.level !== b.level || a.level >= MAX_LEVEL) return false;
    return true;
  }
  mergeKind(a, b) { return a.type === b.type ? 'same' : 'remix'; }
  // a is dragged onto b; the result lives in b's slot
  merge(aId, bId) {
    const a = this.turretById(aId), b = this.turretById(bId);
    if (!this.canMerge(a, b) || this.choice || this.phase === 'lost' || this.phase === 'won') return { ok: false, reason: 'cannot' };
    const kind = this.mergeKind(a, b);
    let type = b.type;
    if (kind === 'remix') type = this.rng.pick([a.type, b.type, this.rng.pick(this.loadout)]);
    this.removeTurret(a);
    b.type = type; b.level += 1; b.paid += a.paid; b.spin = 0; b.born = this.t; b.cd = Math.min(b.cd, 0.2);
    this.merges++;
    this.maxLevelSeen = Math.max(this.maxLevelSeen, b.level);
    this.hype += 4 * b.level * this.mods.hype;
    if (this.mods.mergeBuff) b.overdrive = this.mods.mergeBuff;
    if (this.mods.mergeRefund) this.addCoins(Math.round(this.deployCost() * this.mods.mergeRefund), b.x, b.y, true);
    if (this.mods.mergeSpawn && this.rng.chance(this.mods.mergeSpawn) && this.emptySlots().length && this.turrets.length < this.slotCapacity()) {
      const e = this.emptySlots(); const slot = e[Math.floor(this.rng.next() * e.length)];
      const nt = this.makeTurret(this.rollDropSilent(), 1, slot, 0);
      this.emit({ k: 'deploy', id: nt.id, type: nt.type, level: 1, x: nt.x, y: nt.y, cost: 0, free: true, bonus: true });
    }
    this.recalcAuras();
    this.emit({ k: 'merge', id: b.id, type, level: b.level, x: b.x, y: b.y, kind, big: b.level >= 5 });
    this.checkHype();
    return { ok: true, turret: b, kind };
  }
  rollDropSilent() { return this.rng.pick(this.loadout); }
  // find any mergeable pair; prefers the lowest level. Returns [aId, bId] or null
  findMerge() {
    if (this.mods.noMerge) return null;
    const by = new Map();
    for (const t of this.turrets) {
      if (t.level >= MAX_LEVEL) continue;
      const k = t.type + ':' + t.level;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(t);
    }
    let best = null;
    for (const list of by.values()) if (list.length >= 2 && (!best || list[0].level < best[0].level)) best = list;
    return best ? [best[0].id, best[1].id] : null;
  }
  mergeAll(maxMerges = 30) {
    let n = 0;
    for (; n < maxMerges; n++) { const p = this.findMerge(); if (!p) break; if (!this.merge(p[0], p[1]).ok) break; }
    return n;
  }
  sell(id) {
    const t = this.turretById(id);
    if (!t || this.choice || this.phase === 'lost' || this.phase === 'won') return { ok: false };
    const v = Math.floor(t.paid * Math.min(0.95, ECON.sellBack + this.mods.sell));
    this.removeTurret(t);
    this.addCoins(v, t.x, t.y, true);
    this.recalcAuras();
    this.emit({ k: 'sell', x: t.x, y: t.y, v, type: t.type });
    return { ok: true, value: v };
  }
  move(id, slotIdx) {
    const t = this.turretById(id);
    const slot = this.map.buildable.find((s) => s.idx === slotIdx);
    if (!t || !slot || this.choice) return { ok: false };
    const other = this.grid.get(slotIdx);
    if (other === t) return { ok: false };
    if (other) {
      // swap
      this.grid.set(t.slot, other); other.slot = t.slot; other.c = t.c; other.r = t.r; other.x = t.x; other.y = t.y;
    } else this.grid.delete(t.slot);
    this.grid.set(slotIdx, t); t.slot = slotIdx; t.c = slot.c; t.r = slot.r; t.x = slot.x; t.y = slot.y;
    this.recalcAuras();
    this.emit({ k: 'move', id: t.id, x: t.x, y: t.y });
    return { ok: true };
  }
  setMode(id, mode) { const t = this.turretById(id); if (t) t.mode = mode; }

  recalcAuras() {
    for (const t of this.turrets) { t.auraRate = 0; t.auraDmg = 0; t.auraRange = 0; t.auraCrit = 0; t.echo = 0; }
    for (const s of this.turrets) {
      const def = TURRETS[s.type];
      if (def.kind !== 'aura_rate' && def.kind !== 'aura_dmg') continue;
      const L = s.level;
      const per = this.mods.per[s.type];
      let a = def.aura * (1 + 0.2 * (L - 1)) * this.mods.auraBoost * (1 + per.extra);
      if (L >= 7) a *= 1.5;
      for (const t of this.turrets) {
        if (t === s) continue;
        if (Math.abs(t.c - s.c) > 1 || Math.abs(t.r - s.r) > 1) continue;
        if (def.kind === 'aura_rate') {
          t.auraRate += a;
          if (L >= 3) t.auraRange += 0.06;
          if (L >= 5) t.echo = Math.max(t.echo, 0.15);
        } else {
          t.auraDmg += a;
          if (L >= 5) t.auraCrit += 0.08;
        }
      }
    }
  }

  // ---------------------------------------------------------------- stats of a turret (shared with the UI for the info panel)
  turretDmg(t) {
    const def = TURRETS[t.type];
    let d = def.dmg * lvlDmg(t.level) * this.mods.dmg * this.mods.per[t.type].dmg * (1 + t.auraDmg);
    if (this.wm.dmg) d *= this.wm.dmg;
    if (this.mods.lastStand && this.stageHp <= 6) d *= 1 + this.mods.lastStand;
    return d;
  }
  turretRate(t) {
    const def = TURRETS[t.type];
    let r = def.rate * lvlRate(t.level) * this.mods.rate * this.mods.per[t.type].rate * (1 + t.auraRate);
    if (t.overdrive > 0) r *= 1.3;
    if (this.wm.rate) r *= this.wm.rate;
    if (this.mods.hotStreak && this.combo >= 10) r *= 1 + this.mods.hotStreak;
    if (def.kind === 'gatling') r *= 1 + t.spin;
    return r;
  }
  turretRange(t) {
    const def = TURRETS[t.type];
    return def.range * lvlRange(t.level) * this.mods.range * this.mods.per[t.type].range * (1 + t.auraRange);
  }
  turretCrit(t) {
    const def = TURRETS[t.type];
    let c = this.mods.crit + (def.crit || 0) + t.auraCrit;
    if (t.type === 'snare' && t.level >= 5) c += 0.15;
    return Math.min(0.95, c);
  }

  // ---------------------------------------------------------------- economy
  addCoins(v, x, y, quiet) {
    this.coinFrac += v;
    const whole = Math.floor(this.coinFrac);
    if (whole > 0) { this.coins += whole; this.coinsEarned += whole; this.coinFrac -= whole; }
    if (!quiet && x != null) this.emit({ k: 'coin', x, y, v: Math.max(1, Math.round(v)) });
  }

  // ---------------------------------------------------------------- waves
  upcoming(w = this.wave + 1) { return genWave(this.world, w, this.seed, { endless: this.endless, wavesTotal: this.wavesTotal }); }
  startWave(early = false) {
    if (this.phase === 'won' || this.phase === 'lost' || this.choice) return false;
    if (this.phase === 'wave' && this.spawnQ.length) return false;
    if (!this.endless && this.wave >= this.wavesTotal) return false;
    if (early && this.phase === 'prep') this.addCoins(Math.round(Math.max(0, this.prepT) * ECON.earlyBonusPerSec), null, null, true);
    else if (early && this.phase === 'wave') this.addCoins(8 + this.wave * 2, null, null, true);
    this.wave++;
    const spec = this.upcoming(this.wave);
    this.curSpec = spec;
    this.wmId = spec.mod; this.wm = spec.mod ? WAVE_MODS[spec.mod].wm : NONE_WM;
    const lanes = this.map.lanes.length;
    const w = this.wave;
    const hpBase = this.baseHp(w) * (this.wm.hp || 1);
    let laneCtr = this.rng.int(0, lanes - 1);
    const q = [];
    for (const g of spec.groups) {
      for (let i = 0; i < g.count; i++) {
        q.push({ at: this.t + g.delay + i * g.gap, type: g.type, lane: laneCtr++ % lanes, hpBase, w });
      }
    }
    if (spec.boss) q.push({ at: this.t + 1.2, type: 'boss:' + spec.boss, lane: 0, hpBase, w, scale: spec.bossScale });
    q.sort((a, b) => a.at - b.at);
    this.spawnQ.push(...q);
    this.spawnQ.sort((a, b) => a.at - b.at);
    this.phase = 'wave';
    this.prepT = 0;
    this.heroCd.roxor = Math.max(0, this.heroCd.roxor - 0); // keep
    this.addCoins(this.mods.waveCoins, null, null, true);
    if (this.mods.interest && w > 1) { const i = Math.min(60, Math.floor(this.coins * this.mods.interest)); if (i > 0) this.addCoins(i, null, null, true); }
    this.emit({ k: 'wave', w, mod: spec.mod, boss: spec.boss, total: this.endless ? 0 : this.wavesTotal });
    return true;
  }
  spawnEnemy(s) {
    const lane = this.map.lanes[s.lane % this.map.lanes.length];
    const isBoss = s.type.startsWith('boss:');
    const bdef = isBoss ? BOSSES[s.type.slice(5)] : null;
    const def = isBoss ? null : ENEMIES[s.type];
    let affix = null;
    if (!isBoss && s.type !== 'mini' && s.w >= 4) {
      const goldenWave = this.wm.golden;
      const p = goldenWave ? 0.3 : Math.min(0.28, Math.max(0, (s.w - 4) * 0.025));
      if (this.rng.chance(p)) {
        const pool = goldenWave ? ['golden'] : ['golden'].concat(s.w >= 6 ? ['swift'] : [], s.w >= 8 ? ['armored'] : [], s.w >= 10 ? ['regen'] : [], s.w >= 12 ? ['giant'] : []);
        affix = AFFIXES[this.rng.pick(pool)];
      }
    }
    const hpMul = isBoss ? bdef.hpMul * (s.scale || 1) : def.hp * (affix ? affix.hp : 1);
    const hp = s.hpOverride || s.hpBase * hpMul;
    const spd = (isBoss ? bdef.speed : def.speed) * (affix ? affix.speed : 1);
    const flying = !isBoss && def.flying;
    const start = lane.pts[0], end = lane.pts[lane.pts.length - 1];
    const e = {
      id: this.uid++, type: isBoss ? s.type.slice(5) : s.type, boss: isBoss, hp, maxHp: hp, lane: s.lane % this.map.lanes.length,
      d: s.d || 0, total: flying ? Math.hypot(end.x - start.x, end.y - start.y) : lane.total,
      x: start.x, y: start.y, ang: 0, vx: 0, vy: 0, speed: spd, armor: (isBoss ? bdef.armor : def.armor) + (affix && affix.armorAdd ? affix.armorAdd : 0),
      r: (isBoss ? bdef.r : def.r) * (affix && affix.scale ? affix.scale : 1) * (isBoss ? (s.scale < 1 ? 0.8 : 1) : 1),
      flying, immune: !isBoss && !!def.immune, slowAmt: 0, slowT: 0, stun: 0, burnT: 0, burnDps: 0, markT: 0, shield: 0, shieldMax: 0, shieldT: 0,
      affix: affix ? affix.id : null, regen: affix && affix.regen ? affix.regen : 0, coins: (isBoss ? bdef.coins : def.coins) * (affix ? affix.coins : 1),
      hype: isBoss ? 30 : def.hype, w: s.w, rage: false, hitT: 0, t0: this.t, timer: 0, gated: false, phase: 1, blinkT: 3 + this.rng.next() * 3, cap: isBoss && s.type === 'boss:compressor',
    };
    if (!isBoss && def.shield) { e.shieldMax = hp * def.shield; e.shield = e.shieldMax; }
    if (isBoss) { e.timer = 4; }
    this.enemies.push(e);
    this.placeEnemy(e);
    this.emit({ k: 'spawn', id: e.id, type: e.type, boss: isBoss, x: e.x, y: e.y });
    if (isBoss) this.emit({ k: 'boss', id: e.id, type: e.type, small: (s.scale || 1) < 1 });
    return e;
  }
  placeEnemy(e) {
    const lane = this.map.lanes[e.lane];
    if (e.flying) {
      const a = lane.pts[0], b = lane.pts[lane.pts.length - 1];
      const f = Math.min(1, e.d / Math.max(1, e.total));
      e.x = a.x + (b.x - a.x) * f; e.y = a.y + (b.y - a.y) * f; e.ang = Math.atan2(b.y - a.y, b.x - a.x);
    } else {
      const p = laneAt(lane, e.d);
      e.x = p.x; e.y = p.y; e.ang = p.ang;
    }
  }
  enemySpeedMul(e) {
    let m = encoreSpeed(this.encore) * (this.wm.speed || 1) * this.mods.enemySpeed * (1 - Math.min(0.6, this.mods.enemySlow));
    if (this.daily && this.daily.mods) m *= 1;
    return m;
  }

  // ---------------------------------------------------------------- damage
  hurt(e, dmg, o = {}) {
    if (e.hp <= 0 || e.gated) return 0;
    if (e.cap) dmg = Math.min(dmg, e.maxHp * 0.06);
    const pierce = Math.min(1, (o.pierce || 0) + this.mods.armorPierce);
    const armor = Math.max(0, e.armor * (1 - pierce));
    if (armor > 0) dmg = Math.max(dmg * 0.25, dmg - armor);
    if (e.markT > 0) dmg *= 1.25;
    if (this.sirenT > 0) dmg *= 1.2;
    if (e.boss) dmg *= this.mods.bossDmg;
    if (e.shield > 0) {
      const a = Math.min(e.shield, dmg); e.shield -= a; dmg -= a; e.shieldT = 3;
      if (dmg <= 0) { this.emit({ k: 'hit', x: e.x, y: e.y, v: a, crit: false, shield: true, id: e.id }); return a; }
    }
    e.hp -= dmg; e.hitT = 0.12; e.shieldT = 3;
    if (this.mods.burn && !o.dot && dmg > 0) { e.burnT = 3; e.burnDps = Math.max(e.burnDps, dmg * 0.3 * this.mods.burn); }
    if (!o.quiet) this.emit({ k: 'hit', x: e.x, y: e.y - e.r * 0.4, v: dmg, crit: !!o.crit, id: e.id, dot: !!o.dot, heavy: dmg > e.maxHp * 0.1 });
    if (e.hp > 0 && !e.boss && this.mods.execute && e.hp / e.maxHp < this.mods.execute) e.hp = 0;
    if (e.hp > 0 && o.exec && !e.boss && e.hp / e.maxHp < 0.15) e.hp = 0;
    if (e.hp <= 0) this.kill(e, o);
    return dmg;
  }
  kill(e, o = {}) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    const ci = this.enemies.indexOf(e);
    if (ci >= 0) this.enemies.splice(ci, 1);
    this.kills++;
    this.combo = Math.min(ECON.comboMax, this.combo + 1); this.comboT = ECON.comboWindow; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const comboBonus = Math.min(0.5, this.combo * 0.01) * this.mods.comboBonus;
    let coins = e.coins * waveCoinScale(e.w) * this.world.coinMul * this.mods.coin * (this.wm.coin || 1) * (1 + comboBonus);
    if (o.crit && this.mods.coinOnCrit) coins += this.mods.coinOnCrit;
    if (e.type === 'mini') coins *= 0.5;
    this.addCoins(coins, e.x, e.y);
    this.hype += e.hype * this.mods.hype * (this.wm.hype || 1);
    this.emit({ k: 'kill', id: e.id, x: e.x, y: e.y, type: e.type, boss: e.boss, r: e.r, affix: e.affix, ang: e.ang });
    if (this.mods.gemChance && this.rng.chance(this.mods.gemChance)) { this.runGems++; this.emit({ k: 'gem', x: e.x, y: e.y }); }
    if (this.mods.healKills && this.kills % this.mods.healKills === 0 && this.stageHp < this.stageMax) { this.stageHp++; this.emit({ k: 'heal', n: 1 }); }
    if (e.type === 'echo') {
      for (let i = 0; i < 2; i++) this.spawnMini(e, i === 0 ? -14 : 14);
    } else if (e.type === 'squeal') {
      for (const t of this.turrets) if (dist2(t.x, t.y, e.x, e.y) < 140 * 140) { t.jam = 2.5; this.emit({ k: 'jam', x: t.x, y: t.y }); }
      this.emit({ k: 'pulse', x: e.x, y: e.y, r: 140, color: '#ff6b6b' });
    }
    if (e.boss) {
      this.bossKills++; if (!this.bossTypes.includes(e.type)) this.bossTypes.push(e.type);
      this.emit({ k: 'bossdie', x: e.x, y: e.y, type: e.type });
      // boss drops: relic pick (and a rare remix on the bigger bosses)
      this.queueChoice('boss');
      if (e.maxHp > this.baseHp(e.w) * 20) this.queueChoice('remix_rare');
    }
    this.checkHype();
  }
  spawnMini(parent, off) {
    const lane = this.map.lanes[parent.lane];
    const hp = Math.max(1, parent.maxHp * 0.3);
    const e = this.spawnEnemy({ type: 'mini', lane: parent.lane, hpBase: 1, w: parent.w, d: Math.max(0, parent.d + off), hpOverride: hp });
    return e;
  }

  // ---------------------------------------------------------------- hype, choices, relics
  checkHype() {
    while (this.hype >= this.hypeNeed) {
      this.hype -= this.hypeNeed; this.level++;
      this.hypeNeed = Math.round(ECON.hypeBase * Math.pow(ECON.hypeGrow, this.level - 1));
      this.emit({ k: 'levelup', level: this.level });
      this.queueChoice('remix');
    }
  }
  queueChoice(kind) {
    this.choiceQ.push(kind);
    if (!this.choice) this.nextChoice();
  }
  nextChoice() {
    const kind = this.choiceQ.shift();
    if (!kind) return;
    const options = this.rollOptions(kind);
    if (!options.length) { this.nextChoice(); return; }
    this.choice = { kind, options, rerolled: 0 };
    this.emit({ k: 'choice', kind });
  }
  rarityRoll(minRarity = 'common', lucky = 0) {
    const order = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    const lw = 1 + lucky + this.wave * 0.03;
    const items = order.filter((r) => r !== 'mythic' && order.indexOf(r) >= order.indexOf(minRarity));
    return this.rng.weighted(items, (r) => RARITY[r].weight * (r === 'common' ? 1 : lw));
  }
  rollOptions(kind) {
    const out = [];
    const used = new Set();
    const isRelic = kind === 'chest' || kind === 'boss';
    const minR = kind === 'remix_rare' || kind === 'boss' ? 'rare' : 'common';
    for (let n = 0; n < 3; n++) {
      let pick = null;
      for (let tries = 0; tries < 24 && !pick; tries++) {
        const rar = this.rarityRoll(minR, kind === 'boss' ? 1 : 0);
        if (isRelic) {
          const pool = Object.values(RELICS).filter((r) => r.rarity === rar && !this.relicSet.has(r.id) && !used.has(r.id));
          if (pool.length) pick = { type: 'relic', id: this.rng.pick(pool).id };
        } else {
          const pool = Object.values(REMIX).filter((c) => c.rarity === rar && (this.remix[c.id] || 0) < c.max && !used.has(c.id) && (!c.turret || this.loadout.includes(c.turret)));
          if (pool.length) pick = { type: 'remix', id: this.rng.pick(pool).id };
        }
      }
      if (!pick) {
        const pool = isRelic ? Object.values(RELICS).filter((r) => !this.relicSet.has(r.id) && !used.has(r.id)) : Object.values(REMIX).filter((c) => (this.remix[c.id] || 0) < c.max && !used.has(c.id) && (!c.turret || this.loadout.includes(c.turret)));
        if (pool.length) pick = { type: isRelic ? 'relic' : 'remix', id: this.rng.pick(pool).id };
      }
      if (pick) { used.add(pick.id); out.push(pick); }
    }
    return out;
  }
  rerollChoice() {
    if (!this.choice || this.rerolls <= 0) return false;
    this.rerolls--;
    this.choice.options = this.rollOptions(this.choice.kind);
    this.choice.rerolled++;
    this.emit({ k: 'reroll' });
    return true;
  }
  pick(i) {
    if (!this.choice) return false;
    const o = this.choice.options[i];
    if (!o) return false;
    this.applyPick(o);
    this.choice = null;
    this.nextChoice();
    return true;
  }
  skipChoice() {
    if (!this.choice) return;
    this.addCoins(40 + this.wave * 12, null, null, true);
    this.choice = null; this.nextChoice();
  }
  applyPick(o) {
    if (o.type === 'remix') {
      const c = REMIX[o.id];
      this.remixCount++;
      this.remix[o.id] = (this.remix[o.id] || 0) + 1;
      applyFx(this.mods, c.fx);
      if (o.id === 'encore_hp') { this.stageMax += 4; this.stageHp += 4; }
      this.emit({ k: 'remix', id: o.id });
    } else {
      const r = RELICS[o.id];
      this.relics.push(o.id); this.relicSet.add(o.id);
      applyFx(this.mods, r.fx);
      const hp = r.fx.find((f) => f[0] === 'stageHp');
      if (hp) { this.stageMax += hp[2]; this.stageHp += hp[2]; }
      this.emit({ k: 'relic', id: o.id });
    }
    this.recalcAuras();
  }
  addStageHp(n) { this.stageMax += n; this.stageHp += n; }

  // ---------------------------------------------------------------- heroes
  heroMax(who) { return (who === 'roxor' ? ECON.heroCdRoxor : ECON.heroCdJasmin) * this.mods.heroCd * Math.max(0.6, 1 - 0.03 * (this.heroLv[who] - 1)); }
  heroPower(who) { return this.mods.heroPow * (1 + 0.12 * (this.heroLv[who] - 1)); }
  heroReady(who) { return this.heroCd[who] <= 0; }
  useHero(who) {
    if (this.choice || this.phase === 'won' || this.phase === 'lost' || !this.heroReady(who)) return false;
    this.heroCd[who] = this.heroMax(who);
    this.heroUses++;
    const pw = this.heroPower(who);
    const base = this.baseHp(Math.max(1, this.wave));
    if (who === 'roxor') {
      // Beatbox Blast: hits everything for a chunk of the current wave's health, stuns and shoves back
      this.emit({ k: 'hero', who });
      for (const e of this.enemies.slice()) {
        this.hurt(e, base * 2.4 * pw, { quiet: false });
        if (e.hp > 0 && !e.immune) { e.stun = Math.max(e.stun, e.boss ? 0.6 : 1.4); if (!e.boss) e.d = Math.max(0, e.d - 70); }
      }
      for (const t of this.turrets) t.jam = 0;
    } else {
      // Siren Song: slows everything hard, makes the Static take more damage, mends the stage
      this.emit({ k: 'hero', who });
      this.sirenT = 6 * Math.min(2, pw);
      for (const e of this.enemies) if (!e.immune) { e.slowAmt = Math.max(e.slowAmt, 0.7); e.slowT = Math.max(e.slowT, this.sirenT); }
      const heal = Math.min(3, Math.round(1 + 0.4 * (this.heroLv.jasmin)));
      if (this.stageHp < this.stageMax) { this.stageHp = Math.min(this.stageMax, this.stageHp + heal); this.emit({ k: 'heal', n: heal }); }
    }
    // duet finale if both used within the window
    const other = who === 'roxor' ? 'jasmin' : 'roxor';
    this.lastHeroT[who] = this.t;
    if (this.t - this.lastHeroT[other] <= ECON.duetWindow) {
      this.duets++;
      this.emit({ k: 'duet' });
      for (const e of this.enemies.slice()) this.hurt(e, base * 3.5 * pw);
      this.heroCd.roxor *= 0.6; this.heroCd.jasmin *= 0.6;
      this.lastHeroT.roxor = this.lastHeroT.jasmin = -99;
    }
    return true;
  }

  // ---------------------------------------------------------------- main loop
  advance(dt) {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= DT && n < 20) { this.tick(DT); this.acc -= DT; n++; if (this.phase === 'won' || this.phase === 'lost') break; }
    if (n >= 20) this.acc = 0;
  }
  tick(dt) {
    if (this.choice) return;
    this.t += dt;
    // heroes
    this.heroCd.roxor = Math.max(0, this.heroCd.roxor - dt);
    this.heroCd.jasmin = Math.max(0, this.heroCd.jasmin - dt);
    if (this.sirenT > 0) this.sirenT -= dt;
    // combo decay
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    // prep countdown
    if (this.phase === 'prep') {
      this.prepT -= dt;
      if (this.prepT <= 0 && (this.endless || this.wave < this.wavesTotal)) this.startWave(false);
    }
    // spawns
    while (this.spawnQ.length && this.spawnQ[0].at <= this.t) this.spawnEnemy(this.spawnQ.shift());
    this.updateEnemies(dt);
    this.updateTurrets(dt);
    this.updateProjectiles(dt);
    if (this.mods.dropEvery) {
      this.dropT += dt;
      if (this.dropT >= this.mods.dropEvery && this.enemies.length) {
        this.dropT = 0; this.emit({ k: 'drop' });
        const base = this.baseHp(Math.max(1, this.wave));
        for (const e of this.enemies.slice()) this.hurt(e, base * 1.1 * this.mods.dropPower);
      }
    }
    // wave clear
    if (this.phase === 'wave' && !this.spawnQ.length && !this.enemies.length) this.onClear();
    if (this.autoCheck) { this.autoCheck = false; if (this.autoMergeOwned && this.opts.autoMergeOn) this.mergeAll(2); }
  }
  onClear() {
    const w = this.wave;
    this.cleared = w;
    const bonus = ECON.waveClearBase + ECON.waveClearPerWave * w;
    this.addCoins(bonus * this.world.coinMul, null, null, true);
    this.hype += 6 * this.mods.hype;
    this.emit({ k: 'clear', w, coins: Math.round(bonus * this.world.coinMul) });
    this.wm = NONE_WM; this.wmId = null;
    if (!this.endless && w >= this.wavesTotal) { this.finish(true); return; }
    this.phase = 'prep';
    this.prepT = ECON.prepSeconds;
    if (w % 5 === 0 && w % 10 !== 0) this.queueChoice('chest');
    this.checkHype();
  }
  finish(won) {
    this.phase = won ? 'won' : 'lost';
    const leaks = this.leaks;
    this.result = {
      won, wave: this.wave, cleared: this.cleared, kills: this.kills, leaks, merges: this.merges, bossKills: this.bossKills,
      bestCombo: this.bestCombo, coinsEarned: this.coinsEarned, gems: this.runGems, deploys: this.deploys, time: this.t,
      stars: won ? (leaks <= 2 ? 3 : leaks <= 7 ? 2 : 1) : 0, level: this.level, relics: this.relics.slice(), world: this.world.id,
      encore: this.encore, mode: this.mode, heroUses: this.heroUses, perfects: this.perfects, duets: this.duets, remixes: this.remixCount, maxLevel: this.maxLevelSeen, bossTypes: this.bossTypes.slice(), endless: this.endless, hpLeft: this.stageHp, stageMax: this.stageMax,
    };
    this.emit({ k: won ? 'win' : 'lose' });
  }
  // continue after losing (diamond revive): clears the screen and restores half the stage
  revive() {
    if (this.phase !== 'lost') return false;
    this.phase = this.spawnQ.length || this.enemies.length ? 'wave' : 'prep';
    this.stageHp = Math.ceil(this.stageMax / 2);
    for (const e of this.enemies.slice()) { this.enemies.splice(this.enemies.indexOf(e), 1); e.dead = true; }
    this.spawnQ.length = 0;
    this.projectiles.length = 0;
    this.phase = 'prep'; this.prepT = ECON.prepSeconds; this.result = null;
    this.emit({ k: 'revive' });
    return true;
  }
  leak(e) {
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    e.dead = true;
    const dmg = e.boss ? Math.max(8, Math.ceil(this.stageMax * 0.4)) : 1;
    this.leaks += e.boss ? 3 : 1;
    this.stageHp -= dmg;
    this.combo = 0;
    this.emit({ k: 'leak', x: e.x, y: e.y, n: dmg, boss: e.boss });
    if (this.stageHp <= 0) {
      if (this.mods.reviveOnce > 0 && !this.revived) {
        this.revived = true; this.stageHp = Math.ceil(this.stageMax / 2);
        for (const en of this.enemies.slice()) { en.dead = true; } this.enemies.length = 0;
        this.emit({ k: 'revive' });
      } else { this.stageHp = 0; this.finish(false); }
    }
  }

  updateEnemies(dt) {
    const sm = this.enemySpeedMul();
    const list = this.enemies.slice();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) continue;
      if (e.hitT > 0) e.hitT -= dt;
      // statuses
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowAmt = 0; }
      if (e.stun > 0) e.stun -= dt;
      if (e.markT > 0) e.markT -= dt;
      if (e.burnT > 0) { e.burnT -= dt; this.hurt(e, e.burnDps * dt, { dot: true, quiet: true }); if (e.dead) continue; if (e.burnT <= 0) e.burnDps = 0; }
      if (e.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
      if (e.shieldMax) { if (e.shieldT > 0) e.shieldT -= dt; else if (e.shield < e.shieldMax) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * dt); }
      // specials
      if (e.type === 'leech') {
        e.timer -= dt;
        if (e.timer <= 0) {
          e.timer = 1;
          for (const o of this.enemies) if (o !== e && !o.dead && o.hp < o.maxHp && dist2(o.x, o.y, e.x, e.y) < 95 * 95) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.04); }
          this.emit({ k: 'hum', x: e.x, y: e.y });
        }
      } else if (e.type === 'rager') {
        if (!e.rage && e.hp < e.maxHp * 0.5) { e.rage = true; this.emit({ k: 'rage', x: e.x, y: e.y }); }
      }
      if (e.boss) this.bossLogic(e, dt);
      if (this.wm.blink && !e.boss) { e.blinkT -= dt; if (e.blinkT <= 0) { e.blinkT = 3 + (e.id % 5) * 0.4; e.d += 60; this.emit({ k: 'blink', x: e.x, y: e.y }); } }
      if (e.dead) continue;
      // movement
      let spd = e.speed * sm;
      if (e.rage) spd *= 1.6;
      if (e.phase === 3 && e.type === 'playback') spd *= 1.15;
      if (e.stun > 0) spd = 0;
      else if (e.slowT > 0 && !e.immune) spd *= 1 - e.slowAmt;
      const nd = e.d + spd * dt;
      const ox = e.x, oy = e.y;
      e.d = nd;
      this.placeEnemy(e);
      e.vx = spd ? (e.x - ox) / dt : 0; e.vy = spd ? (e.y - oy) / dt : 0;
      if (e.d >= e.total) this.leak(e);
    }
  }
  bossLogic(e, dt) {
    const hpf = e.hp / e.maxHp;
    e.timer -= dt;
    if (e.type === 'noisegate') {
      if (e.gated) { if (e.timer <= 0) { e.gated = false; e.timer = 7; this.emit({ k: 'gate', id: e.id, on: false }); } }
      else if (e.timer <= 0) {
        e.gated = true; e.timer = 2; this.emit({ k: 'gate', id: e.id, on: true });
        for (let i = 0; i < 3; i++) this.spawnEnemy({ type: 'fuzz', lane: e.lane, hpBase: this.baseHp(e.w) * 0.6, w: e.w, d: Math.max(0, e.d - 30 - i * 26) });
      }
    } else if (e.type === 'reverb') {
      if (e.timer <= 0) { e.timer = 5; this.spawnMini(e, -26); this.spawnMini(e, -48); this.emit({ k: 'echoes', x: e.x, y: e.y }); }
    } else if (e.type === 'djglitch') {
      if (e.timer <= 0) {
        e.timer = 6;
        const lane = this.map.lanes[e.lane];
        const jump = lane.total * 0.08;
        e.d = Math.min(lane.total - 30, e.d + jump);
        this.emit({ k: 'blink', x: e.x, y: e.y, boss: true });
        const near = this.turrets.slice().sort((a, b) => dist2(a.x, a.y, e.x, e.y) - dist2(b.x, b.y, e.x, e.y)).slice(0, 3);
        for (const t of near) { t.jam = 2.2; this.emit({ k: 'jam', x: t.x, y: t.y }); }
      }
    } else if (e.type === 'playback') {
      if (e.phase === 1 && hpf < 0.66) { e.phase = 2; this.emit({ k: 'bossphase', id: e.id, phase: 2 }); this.summonMix(e, 6); }
      else if (e.phase === 2 && hpf < 0.33) { e.phase = 3; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05); this.emit({ k: 'bossphase', id: e.id, phase: 3 }); this.summonMix(e, 8); }
      if (e.timer <= 0) {
        e.timer = e.phase === 3 ? 4 : 7;
        // the skip button: shoves the nearest turrets out of tune
        const near = this.turrets.slice().sort((a, b) => dist2(a.x, a.y, e.x, e.y) - dist2(b.x, b.y, e.x, e.y)).slice(0, e.phase);
        for (const t of near) { t.jam = 1.6; this.emit({ k: 'jam', x: t.x, y: t.y }); }
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01);
      }
    }
  }
  summonMix(e, n) {
    const kinds = this.world.pool.filter((t) => t !== 'drone' && t !== 'mini');
    for (let i = 0; i < n; i++) {
      const type = kinds[(i + e.phase) % kinds.length];
      this.spawnEnemy({ type, lane: e.lane, hpBase: this.baseHp(e.w) * 0.8, w: e.w, d: Math.max(0, e.d - 20 - i * 30) });
    }
  }

  // ---------------------------------------------------------------- turrets firing
  findTarget(t, range) {
    let best = null, bv = -Infinity;
    const mode = t.mode;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.gated || e.dead) continue;
      const rr = range + e.r;
      const d2 = dist2(t.x, t.y, e.x, e.y);
      if (d2 > rr * rr) continue;
      let v;
      if (mode === 'first') v = e.d / e.total;
      else if (mode === 'last') v = -e.d / e.total;
      else if (mode === 'strong') v = e.hp + (e.shield || 0);
      else v = -d2;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }
  updateTurrets(dt) {
    for (let i = 0; i < this.turrets.length; i++) {
      const t = this.turrets[i];
      const def = TURRETS[t.type];
      if (t.fire > 0) t.fire -= dt * 5;
      if (t.overdrive > 0) t.overdrive -= dt;
      if (t.jam > 0) { t.jam -= dt; continue; }
      if (def.kind === 'aura_rate' || def.kind === 'aura_dmg') continue;
      const rate = this.turretRate(t);
      t.cd -= dt;
      const range = this.turretRange(t);
      if (def.kind === 'gatling') {
        // spin up while there is a target, wind down otherwise
        const tg = this.findTarget(t, range);
        t.spin = tg ? Math.min(1, t.spin + dt * 0.35) : Math.max(0, t.spin - dt * 0.8);
        if (t.cd > 0 || !tg) continue;
        t.cd += 1 / rate;
        this.fire(t, tg, range);
        continue;
      }
      if (t.cd > 0) continue;
      const tg = this.findTarget(t, range);
      if (!tg) { t.cd = 0; continue; }
      t.cd += 1 / rate;
      if (t.cd < -0.2) t.cd = 0;
      this.fire(t, tg, range);
      if (t.echo && this.rng.chance(t.echo)) t.cd -= 1 / rate * 0.5;
    }
    // pending second pulses / beams
    for (const t of this.turrets) {
      if (t.pulse2 > 0) {
        t.pulse2 -= dt;
        if (t.pulse2 <= 0) { if (t.type === 'sub') this.doPulse(t, this.turretRange(t) * this.mods.splash, true); else if (t.type === 'mic') this.doBeam(t, t.beamAng, true); }
      }
    }
  }
  rollCrit(t, dmg) {
    const c = this.turretCrit(t);
    if (c > 0 && this.rng.chance(c)) return { dmg: dmg * (ECON.critMul + this.mods.critDmg), crit: true };
    return { dmg, crit: false };
  }
  fire(t, tg, range) {
    const def = TURRETS[t.type];
    const L = t.level;
    t.ang = Math.atan2(tg.y - t.y, tg.x - t.x);
    t.fire = 1; t.shots++;
    const baseDmg = this.turretDmg(t);
    this.emit({ k: 'shot', type: t.type, x: t.x, y: t.y, ang: t.ang, level: L });
    switch (def.kind) {
      case 'shot': {
        const n = L >= 7 ? 3 : L >= 4 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const target = i === 0 ? tg : (this.findNth(t, range, i) || tg);
          const { dmg, crit } = this.rollCrit(t, baseDmg);
          this.addProj({ kind: 'bullet', style: 'snare', x: t.x, y: t.y, target, speed: 560, dmg, crit, from: t.id, delay: i * 0.05 });
        }
        break;
      }
      case 'gatling': {
        const { dmg, crit } = this.rollCrit(t, baseDmg);
        this.addProj({ kind: 'bullet', style: 'hat', x: t.x, y: t.y, target: tg, speed: 700, dmg, crit, from: t.id, pierceN: L >= 5 ? 1 : 0, armorPierce: L >= 7 ? 0.5 : 0, small: true });
        break;
      }
      case 'splash': {
        const { dmg, crit } = this.rollCrit(t, baseDmg);
        const big = L >= 7 && t.shots % 4 === 0;
        const flight = Math.hypot(tg.x - t.x, tg.y - t.y) / 380;
        const tx = tg.x + (tg.vx || 0) * flight, ty = tg.y + (tg.vy || 0) * flight;
        const radius = (def.splash + 6 * (L - 1)) * (L >= 3 ? 1.25 : 1) * this.mods.splash * (big ? 1.6 : 1);
        this.addProj({ kind: 'shell', style: 'kick', x: t.x, y: t.y, tx, ty, speed: 380, dmg: dmg * (big ? 2 : 1), crit, from: t.id, radius, slow: L >= 5, big });
        break;
      }
      case 'pulse': {
        this.doPulse(t, this.turretRange(t) * this.mods.splash, false);
        if (L >= 7) t.pulse2 = 0.28;
        break;
      }
      case 'beam': {
        this.doBeam(t, t.ang, false);
        if (L >= 7) { t.pulse2 = 0.16; t.beamAng = t.ang; }
        break;
      }
      case 'chain': {
        const chains = def.chains + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) + (L >= 7 ? 1 : 0) + this.mods.chains;
        const pts = [{ x: t.x, y: t.y - 10 }];
        const hit = new Set();
        let cur = tg; let dmg = baseDmg;
        for (let j = 0; j <= chains && cur; j++) {
          hit.add(cur.id);
          pts.push({ x: cur.x, y: cur.y });
          const r = this.rollCrit(t, dmg);
          this.hurt(cur, r.dmg, { crit: r.crit });
          if (L >= 5 && !cur.immune && cur.hp > 0) cur.stun = Math.max(cur.stun, 0.3);
          dmg *= 0.85;
          let nxt = null, nd = 90 * 90;
          for (const e of this.enemies) { if (hit.has(e.id) || e.dead || e.gated) continue; const d2 = dist2(e.x, e.y, cur.x, cur.y); if (d2 < nd) { nd = d2; nxt = e; } }
          cur = nxt;
        }
        this.emit({ k: 'chain', pts, color: def.color });
        break;
      }
      case 'cone': {
        const spread = (L >= 7 ? Math.PI : L >= 5 ? 0.9 : 0.6);
        const stun = def.stun + (L >= 3 ? 0.4 : 0) + 0.05 * (L - 1);
        const rng2 = range;
        for (const e of this.enemies.slice()) {
          if (e.dead || e.gated) continue;
          const d2 = dist2(t.x, t.y, e.x, e.y);
          const rr = rng2 + e.r;
          if (d2 > rr * rr) continue;
          if (spread < Math.PI && angDiff(Math.atan2(e.y - t.y, e.x - t.x), t.ang) > spread) continue;
          const r = this.rollCrit(t, baseDmg);
          this.hurt(e, r.dmg, { crit: r.crit });
          if (e.hp > 0) {
            if (e.immune) continue;
            e.stun = Math.max(e.stun, e.boss ? stun * 0.25 : stun);
            if (!e.boss) e.d = Math.max(0, e.d - 36);
          }
        }
        this.emit({ k: 'cone', x: t.x, y: t.y, ang: t.ang, range: rng2, spread: Math.min(spread, Math.PI), color: def.color });
        break;
      }
      case 'boomerang': {
        const n = L >= 7 ? 3 : L >= 3 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.35;
          const { dmg, crit } = this.rollCrit(t, baseDmg);
          this.addProj({ kind: 'disc', style: 'scratch', x: t.x, y: t.y, ox: t.x, oy: t.y, ang: t.ang + off, dist: range, travelled: 0, back: false, speed: 330, dmg, crit, from: t.id, armorPierce: L >= 5 ? 1 : 0, hits: new Set(), hits2: new Set() });
        }
        break;
      }
      case 'sniper': {
        const { dmg, crit } = this.rollCrit(t, baseDmg);
        this.addProj({ kind: 'bullet', style: 'cowbell', x: t.x, y: t.y, target: tg, speed: 1100, dmg, crit, from: t.id, mark: L >= 3 ? 4.5 : 3, pierceN: L >= 5 ? 1 : 0, exec: L >= 7 });
        break;
      }
      case 'orb': {
        const n = L >= 7 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const { dmg, crit } = this.rollCrit(t, baseDmg);
          this.addProj({ kind: 'orb', style: 'vocal', x: t.x, y: t.y, ang: t.ang + (i ? 0.9 : 0), speed: 150, turn: L >= 3 ? 7 : 4.5, dmg, crit, from: t.id, life: 3.5, radius: 44 * this.mods.splash, heal: L >= 5 });
        }
        break;
      }
    }
  }
  findNth(t, range, n) {
    const list = [];
    for (const e of this.enemies) {
      if (e.dead || e.gated) continue;
      const rr = range + e.r;
      if (dist2(t.x, t.y, e.x, e.y) <= rr * rr) list.push(e);
    }
    list.sort((a, b) => b.d / b.total - a.d / a.total);
    return list[n % list.length] || null;
  }
  addProj(p) { p.id = this.uid++; p.age = 0; this.projectiles.push(p); }
  doPulse(t, radius, second) {
    const def = TURRETS[t.type];
    const L = t.level;
    const dmg = this.turretDmg(t) * (second ? 0.6 : 1);
    const slow = def.slow + (L >= 3 ? 0.12 : 0);
    for (const e of this.enemies.slice()) {
      if (e.dead || e.gated) continue;
      const rr = radius + e.r * 0.5;
      if (dist2(t.x, t.y, e.x, e.y) > rr * rr) continue;
      const r = this.rollCrit(t, dmg);
      this.hurt(e, r.dmg, { crit: r.crit });
      if (e.hp > 0 && !e.immune) {
        e.slowAmt = Math.max(e.slowAmt, slow); e.slowT = Math.max(e.slowT, 2);
        if (L >= 5 && !e.boss) e.d = Math.max(0, e.d - 22);
      }
    }
    this.emit({ k: 'pulse', x: t.x, y: t.y, r: radius, color: def.color, bass: true });
  }
  doBeam(t, ang, second) {
    const def = TURRETS[t.type];
    const L = t.level;
    const range = this.turretRange(t);
    const x2 = t.x + Math.cos(ang) * range, y2 = t.y + Math.sin(ang) * range;
    const width = L >= 4 ? 24 : 15;
    const dmg = this.turretDmg(t) * (second ? 0.7 : 1);
    for (const e of this.enemies.slice()) {
      if (e.dead || e.gated) continue;
      if (distPointSeg(e.x, e.y, t.x, t.y, x2, y2) <= width / 2 + e.r * 0.6) {
        const r = this.rollCrit(t, dmg);
        this.hurt(e, r.dmg, { crit: r.crit });
      }
    }
    if (!second && L >= 5 && t.shots % 8 === 0 && this.stageHp < this.stageMax) { this.stageHp++; this.emit({ k: 'heal', n: 1 }); }
    this.emit({ k: 'beam', x1: t.x, y1: t.y, x2, y2, w: width, color: def.color });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      if (p.delay > 0) { p.delay -= dt; continue; }
      let remove = false;
      if (p.kind === 'bullet') {
        let tg = p.target;
        if (!tg || tg.dead) {
          // retarget nearest to the bullet
          let b = null, bd = 140 * 140;
          for (const e of this.enemies) { if (e.dead || e.gated) continue; const d2 = dist2(e.x, e.y, p.x, p.y); if (d2 < bd) { bd = d2; b = e; } }
          p.target = tg = b;
          if (!tg) { this.projectiles.splice(i, 1); continue; }
        }
        const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        p.ang = Math.atan2(dy, dx);
        if (d <= step + tg.r * 0.6) {
          const src = this.turretById(p.from);
          this.hurt(tg, p.dmg, { crit: p.crit, pierce: p.armorPierce, exec: p.exec });
          if (p.mark && tg.hp > 0) tg.markT = p.mark;
          if (p.pierceN > 0) {
            // pass through: hit the nearest other enemy close to the first
            let b = null, bd = 60 * 60;
            for (const e of this.enemies) { if (e === tg || e.dead || e.gated) continue; const d2 = dist2(e.x, e.y, tg.x, tg.y); if (d2 < bd) { bd = d2; b = e; } }
            if (b) this.hurt(b, p.dmg * 0.6, { crit: false, pierce: p.armorPierce });
          }
          remove = true;
        } else { p.x += dx / d * step; p.y += dy / d * step; }
      } else if (p.kind === 'shell') {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        p.ang = Math.atan2(dy, dx);
        if (d <= step) {
          this.explode(p);
          remove = true;
        } else { p.x += dx / d * step; p.y += dy / d * step; }
      } else if (p.kind === 'disc') {
        const step = p.speed * dt;
        if (!p.back) {
          p.x += Math.cos(p.ang) * step; p.y += Math.sin(p.ang) * step; p.travelled += step;
          if (p.travelled >= p.dist) { p.back = true; }
        } else {
          const src = this.turretById(p.from);
          const sx = src ? src.x : p.ox, sy = src ? src.y : p.oy;
          const dx = sx - p.x, dy = sy - p.y, d = Math.hypot(dx, dy);
          if (d <= step + 6) remove = true; else { p.x += dx / d * step * 1.1; p.y += dy / d * step * 1.1; }
        }
        const set = p.back ? p.hits2 : p.hits;
        for (const e of this.enemies.slice()) {
          if (e.dead || e.gated || set.has(e.id)) continue;
          if (dist2(e.x, e.y, p.x, p.y) <= (e.r + 16) * (e.r + 16)) {
            set.add(e.id);
            this.hurt(e, p.dmg, { crit: p.crit, pierce: p.armorPierce });
          }
        }
        p.spin = (p.spin || 0) + dt * 18;
      } else if (p.kind === 'orb') {
        p.life -= dt;
        // steer towards the nearest enemy
        let b = null, bd = Infinity;
        for (const e of this.enemies) { if (e.dead || e.gated) continue; const d2 = dist2(e.x, e.y, p.x, p.y); if (d2 < bd) { bd = d2; b = e; } }
        if (b) {
          const want = Math.atan2(b.y - p.y, b.x - p.x);
          let diff = want - p.ang; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
          p.ang += Math.max(-p.turn * dt, Math.min(p.turn * dt, diff));
          if (bd <= (b.r + 10) * (b.r + 10)) { this.explode(p); remove = true; }
        }
        p.x += Math.cos(p.ang) * p.speed * dt; p.y += Math.sin(p.ang) * p.speed * dt;
        if (p.life <= 0 && !remove) { this.explode(p); remove = true; }
      }
      if (remove) this.projectiles.splice(i, 1);
    }
  }
  explode(p) {
    const r2 = p.radius * p.radius;
    for (const e of this.enemies.slice()) {
      if (e.dead || e.gated) continue;
      const d2 = dist2(e.x, e.y, p.x, p.y);
      const rr = p.radius + e.r * 0.5;
      if (d2 > rr * rr) continue;
      const f = 1 - 0.4 * Math.min(1, Math.sqrt(d2) / (p.radius + 1));
      this.hurt(e, p.dmg * f, { crit: p.crit });
      if (p.slow && e.hp > 0 && !e.immune) { e.slowAmt = Math.max(e.slowAmt, 0.3); e.slowT = Math.max(e.slowT, 1.5); }
    }
    if (p.heal && this.stageHp < this.stageMax && this.rng.chance(0.15)) { this.stageHp++; this.emit({ k: 'heal', n: 1 }); }
    this.emit({ k: 'explode', x: p.x, y: p.y, r: p.radius, style: p.style, big: !!p.big });
  }

  // ---------------------------------------------------------------- bot helpers (also used by the tutorial and tests)
  autoPlayStep(opts = {}) {
    // a simple greedy player: merge what it can, spend coins on deploys, call waves early when safe
    let acted = false;
    if (this.choice) { this.pick(opts.pickIdx ?? 0); return true; }
    if (this.mergeAll(6) > 0) acted = true;
    for (let i = 0; i < 4; i++) {
      const c = this.deployCost();
      if (this.coins >= c && this.canDeploy().ok) { this.deploy(null, { onBeat: false }); acted = true; } else break;
    }
    if (opts.early && this.phase === 'prep' && this.prepT > 2 && this.enemies.length === 0) this.startWave(true);
    for (const w of ['roxor', 'jasmin']) if (opts.heroes !== false && this.heroReady(w) && this.enemies.length > 6) this.useHero(w);
    return acted;
  }
}

export { REMIX, RELICS, WAVE_MODS };
