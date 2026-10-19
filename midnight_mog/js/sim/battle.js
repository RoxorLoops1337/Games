// Midnight Mog battle engine: lane and tile tower defense on a small grid of rooftops.
// Deterministic: no DOM, no Math.random, no Date. Everything derives from the seed and the sequence of playCard calls.
//
// GEOMETRY (tile units, y is the lane index)
//   LANES = 5 lanes (y 0..4), COLS = 8 cat columns (x 1..8). The cats' base sits at x = 0, enemies enter at x = EDGE_X (9.5)
//   and march toward -x. Cats hold a tile (x, y); brawlers and tanks (speed > 0) may advance up to 3 tiles and return.
//   Melee (range < 2) only fights inside its own lane. Ranged (range >= 2) also reaches the neighbouring lanes.
//   Only range >= 2 (or aoe/chain/pierce/spells) can hit flying enemies. Flying enemies skip barricades and ground traps.
//
// LOOP (step, fixed dt 1/30): effects.tickStatuses (dots, buffs, traps, auras, delayed spawns) -> energy -> wave spawner ->
//   per unit prep (lane, stat cache) -> enemy traits (healer, summoner, burrower, fast) -> cats -> enemies (move, attack, cast)
//   -> projectiles -> sweep dead -> win / lose.
//
// PUBLIC API
//   createBattle({seed, district, stage, profile, deck?, modifiers?, rewardMult?, noAdvance?, noEcho?, lanes?}) -> b
//   step(b, dt)  playCard(b, handIndex, tileOrTarget) -> {ok, reason?, card, cost, unit?}  drainEvents(b)  battleResult(b)
//   canPlay(b, i)  cycleHand(b)  placeCat(b, catId, x, y, o)  spawnEnemy(b, enemyId, lane, x, o)  resolveEcho(profile, opts)
//   isEchoStage(profile, district, stage)  tileAt(x, y)
//
// EVENTS (drained with drainEvents): everything effects.js emits (hit crit death cast heal status shield base_hit chain pierce
//   aoe knockback pull execute trap_set trap_trigger barricade aura energy draw revive spawn wave rule reward cleanse taunt
//   reflect) plus: attack{src,tgt,ranged,x,y,tx,ty} merge{uid,id,stars,merged,x,y,fx,fy,gone?} wave{wave,waves,name,isBossWave}
//   burrow{uid,x,y} emerge{uid,x,y} summon_call{uid,id,count} win{wave,seconds} lose{wave,seconds,reason} loot{kind,id?,amount}
import { makeRng } from '../rng.js';
import { CARD_BY_ID, STARTER_DECK } from '../data/cards.js';
import { ELITE_AFFIXES } from '../data/districts.js';
import * as FX from './effects.js';
import * as DK from './deck.js';
import { stageScaling, stageInfo, enemyWave, wavesPerStage, stageMode, stageRewards, toGlobal, ECHO_SECONDS } from './progression.js';
import { gardenBuffs, townStats, recordStats } from './town.js';
import { newProfile } from './profile.js';
import { MAX_CUR } from './economy.js';

// ------------------------------------------------------------------------------------------------ constants
export const DT = 1 / 30;
export const LANES = 5;
export const COLS = 8;
export const BASE_X = 0;
export const EDGE_X = 9.5;
export const MAX_MERGE = 3;            // a cat can be merged up to +3 stars inside one battle
export const BASE_HP_REF = 150;        // base hp = BASE_HP_REF * stage damage scaling
export const WAVE_GAP = 5;             // seconds between the last spawn of a wave and the next wave
export const FIRST_WAVE_AT = 2;
export const MAX_SECONDS = 900;        // hard timeout, counts as a loss
const STAT_EVERY = 6;                  // stat cache refresh period in steps (staggered by uid)
const PROJ_SPEED = 14;                 // tiles per second
const SNAP_SPEED = 6;                  // tiles per second a pulled unit settles back into its lane
const RECHECK = 0.2;                   // seconds before a ready ability with no valid target looks again
const ADVANCE = 3;                     // how far a mobile cat leaves its tile
const AFFIX_BY_ID = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a]));
const CRATE_BY_ORDER = ['alley_crate', 'alley_crate', 'neon_crate', 'neon_crate', 'rooftop_crate', 'rooftop_crate'];

// ability need bits
const N_FOE = 1, N_NEAR = 2, N_HURT = 4, N_BASE = 8, N_FALLEN = 16, N_ENERGY = 32, N_FREE = 64;
const OFFENSE = { damage: 1, chain: 1, pierce: 1, aoe: 1, stun: 1, dot: 1, debuff: 1, knockback: 1, pull: 1, execute: 1 };
const needCache = new Map();

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const abs = Math.abs;

function mixSeed(seed, k) { return (Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) + Math.imul(k, 40503) + 0x7f4a7c15) >>> 0; }

function needOf(e) {
  let m = needCache.get(e);
  if (m !== undefined) return m;
  m = 0;
  const walk = (x) => {
    if (!x) return;
    if (OFFENSE[x.kind]) m |= N_FOE;
    else if (x.kind === 'heal') m |= x.to === 'base' ? N_BASE : N_HURT;
    else if (x.kind === 'revive') m |= N_FALLEN;
    else if (x.kind === 'energy') m |= N_ENERGY;
    else if (x.kind === 'draw' || x.kind === 'battle_rule' || x.kind === 'reward_mult') m |= N_FREE;
    else if (x.kind === 'multi') { for (const s of x.steps) walk(s); }
    else m |= N_NEAR;
  };
  walk(e);
  needCache.set(e, m);
  return m;
}

// ------------------------------------------------------------------------------------------------ creation
/** Tile helper: the {x, y} of a column (1..COLS) and lane (0..LANES-1). */
export function tileAt(col, lane) { return { x: col, y: lane }; }

function frontierOf(profile) {
  const p = profile && profile.progress;
  return p ? toGlobal(p.district, p.stage) : 1;
}

/**
 * Is this stage an INSTANT echo clear? Only the stage that moves the frontier is: it can be done once, so an echo can
 * never be tapped over and over for pay. A stage behind the frontier is a real battle even below the echo threshold.
 */
export function isEchoStage(profile, district, stage) {
  if (!profile) return false;
  const gs = toGlobal(district, stage);
  return stageMode(profile, gs).echo && gs >= frontierOf(profile);
}

/** Keep at most as many copies of each card as the profile owns (cards the profile does not list at all are left alone). */
function capCopies(ids, cards) {
  if (!cards || typeof cards !== 'object') return ids;
  const left = {};
  return ids.filter((id) => {
    const own = cards[id];
    if (!own || typeof own.count !== 'number') return true;
    if (!(id in left)) left[id] = Math.max(0, Math.floor(own.count));
    return left[id]-- > 0;
  });
}

/**
 * Build a battle. opts: {seed, district, stage, profile} where (district, stage) use the progression encodings (a number
 * district with 30 stages each, a district id string with stage 1..10, or null with stage = global stage).
 * Extra: deck (card ids, default profile.deck), modifiers (array of stat_mod effects replacing the district modifier, for
 * Observatory maps), rewardMult, noAdvance (map battles), noEcho (force a real battle on an echo stage), lanes.
 */
export function createBattle(opts = {}) {
  const seed = fin(opts.seed, 1) >>> 0;
  const profile = opts.profile || newProfile(seed);
  const gs = toGlobal(opts.district == null && opts.stage == null ? (profile.progress ? profile.progress.district : null) : opts.district,
    opts.district == null && opts.stage == null ? (profile.progress ? profile.progress.stage : 1) : opts.stage);
  const info = stageInfo(null, gs);
  const sc = stageScaling(null, gs);
  const lanes = Math.max(1, (opts.lanes | 0) || LANES);
  const town = townStats(profile);
  const garden = gardenBuffs(profile, info.district.id);

  const extra = [];
  if (garden.dmg > 0) extra.push({ kind: 'stat_mod', scope: 'all_cats', stat: 'dmg', mult: 1 + garden.dmg });
  if (garden.rate > 0) extra.push({ kind: 'stat_mod', scope: 'all_cats', stat: 'rate', mult: 1 + garden.rate });
  if (garden.hp > 0) extra.push({ kind: 'stat_mod', scope: 'all_cats', stat: 'hp', mult: 1 + garden.hp });
  if (fin(town.baseHpPct) > 0) extra.push({ kind: 'rule', rule: 'base_hp_pct', value: town.baseHpPct });

  const baseHp = Math.max(50, Math.round(BASE_HP_REF * sc.dmg));
  const b = {
    v: 1, seed, gs, district: info.district.id, stage: info.stageInDistrict, info, opts: {
      rewardMult: opts.rewardMult, noAdvance: !!opts.noAdvance,
    },
    t: 0, tick: 0, wave: 0, waves: wavesPerStage(null, gs),
    field: { baseX: BASE_X, edgeX: EDGE_X, rows: lanes }, cols: COLS, lanes,
    units: [], enemies: [], projectiles: [], events: [],
    energy: DK.ENERGY_START + fin(DK.townHooks(profile).startEnergyAdd), energyCap: DK.ENERGY_CAP, handSize: DK.HAND_SIZE,
    base: { hp: baseHp, maxHp: baseHp },
    over: null, result: null, profile, scaling: sc, stageFactor: Math.pow(Math.max(1, sc.hp), 0.75),
    extraMods: extra, modifiers: opts.modifiers || undefined,
    rng: makeRng(mixSeed(seed, 1)), waveRng: makeRng(mixSeed(seed, 2)), lootRng: makeRng(mixSeed(seed, 3)),
    regenMult: 1 + fin(DK.townHooks(profile).energyRegenPct), baseRegen: Math.max(0, fin(town.baseRegenPct)),
    lootLuck: Math.max(0, fin(town.lootLuckPct)),
    echo: false, nextUid: 0,
    stats: { kills: 0, bossKills: 0, cardsPlayed: 0, spellsCast: 0, summons: 0, merges: 0, catsLost: 0, baseDamaged: false },
    sp: { next: 0, startAt: FIRST_WAVE_AT, state: 'idle', pending: null, pi: 0, t0: 0, lastSpawn: -99, done: false, bossWave: false },
    projPool: [], taunters: [], tauntR: [], laneC: [], laneE: [],
    hooks: null,
  };
  b.hooks = { draw: hookDraw, summonCat: hookSummonCat, spawnEnemy: hookSpawnEnemy, onDeath: hookOnDeath };
  for (let i = 0; i < lanes; i++) { b.laneC.push([]); b.laneE.push([]); }
  FX.fx(b);
  FX.baseUnit(b);
  FX.applyRelicRules(b);
  b.energy = Math.min(b.energyCap, b.energy);

  // deck: effects.js treats b.energy as truth, deck.js owns the piles
  let ids = (opts.deck || profile.deck || []).filter((id) => CARD_BY_ID[id]);
  if (!opts.deck) ids = capCopies(ids, profile.cards).slice(0, DK.deckSlots(profile));
  if (!ids.length) ids = STARTER_DECK.slice();
  b.deck = DK.newDeck(ids, makeRng(mixSeed(seed, 4)), { deal: false });
  b.deck.handSize = Math.max(1, Math.min(DK.HAND_MAX, b.handSize));
  DK.refill(b.deck);
  syncDeck(b);

  if (!opts.noEcho && stageMode(profile, gs).echo) b.echo = true;
  if (!b.echo) FX.fireTrigger(b, 'on_battle_start', {});
  return b;
}

function syncDeck(b) { const d = b.deck; b.hand = d.hand; b.draw = d.draw; b.discard = d.discard; }
function hookDraw(b, n) { DK.draw(b.deck, n); syncDeck(b); }

// ------------------------------------------------------------------------------------------------ unit setup
function refreshStats(b, u) {
  u.cRange = FX.computeStat(b, u, 'range');
  u.cRate = FX.computeStat(b, u, 'rate');
  u.cSpeed = FX.computeStat(b, u, 'speed');
}
function prepUnit(b, u) {
  u.lane = Math.round(u.y);
  u.atk = 0.2;
  u.stunned = false;
  refreshStats(b, u);
}

function tileOccupied(b, x, y) {
  const us = b.units;
  for (let i = 0; i < us.length; i++) {
    const c = us[i];
    if (c.dead || (c.kind !== 'cat' && c.kind !== 'barricade')) continue;
    const h = c.kind === 'cat' ? c.home : c;
    if (Math.round(h.x) === x && Math.round(h.y) === y) return c;
  }
  return null;
}

function mergePartner(b, catId, merged, x, y, skip) {
  const us = b.units;
  for (let i = 0; i < us.length; i++) {
    const c = us[i];
    if (c === skip || c.dead || c.kind !== 'cat' || c.id !== catId || c.merged !== merged) continue;
    if (abs(c.home.x - x) + abs(c.home.y - y) <= 1.001 && (c.home.x !== x || c.home.y !== y)) return c;
  }
  return null;
}

function upgradeMerged(b, keeper, fx, fy) {
  keeper.merged++;
  keeper.stars = (keeper.stars || 0) + 1;
  b.stats.merges++;
  FX.syncMaxHp(b, keeper);
  keeper.hp = keeper.maxHp;
  FX.emit(b, { type: 'merge', uid: keeper.uid, id: keeper.id, stars: keeper.stars, merged: keeper.merged, x: keeper.x, y: keeper.y, fx, fy });
}

/** After a cat has merged, keep merging with equal neighbours (chain reaction). */
function cascadeMerge(b, keeper) {
  while (keeper.merged < MAX_MERGE) {
    const other = mergePartner(b, keeper.id, keeper.merged, keeper.home.x, keeper.home.y, keeper);
    if (!other) break;
    other.dead = true; other.hp = 0;
    FX.emit(b, { type: 'merge', uid: other.uid, gone: true, id: other.id, x: other.x, y: other.y, fx: keeper.x, fy: keeper.y });
    upgradeMerged(b, keeper, other.x, other.y);
  }
}

function hookSummonCat(b, catId, level, tile) {
  const x = Math.round(tile.x), y = Math.round(tile.y);
  const partner = mergePartner(b, catId, 0, x, y, null);
  b.stats.summons++;
  if (partner && partner.merged < MAX_MERGE) {
    upgradeMerged(b, partner, x, y);
    cascadeMerge(b, partner);
    return null;
  }
  const pc = b.profile && b.profile.cats && b.profile.cats[catId];
  const u = FX.createCatUnit(b, catId, { level, stars: pc ? pc.stars : 0, x, y });
  u.merged = 0;
  prepUnit(b, u);
  b.units.push(u);
  return u;
}

/** Place a cat directly (tests, tutorials, bots). Merges like a card would. Returns the unit, or null when it merged. */
export function placeCat(b, catId, x, y, o = {}) {
  const level = o.level ?? (b.profile.cats[catId] && b.profile.cats[catId].level) ?? 1;
  const u = hookSummonCat(b, catId, level, { x, y });
  if (u) {
    if (o.stars) { u.stars += o.stars; FX.syncMaxHp(b, u); u.hp = u.maxHp; }
    FX.emit(b, { type: 'spawn', uid: u.uid, id: u.id, x: u.x, y: u.y, side: 'cat' });
  }
  return u;
}

// ------------------------------------------------------------------------------------------------ enemies
function setupEnemy(b, u, o) {
  const p = u.params || {};
  u.lane = Math.round(u.y);
  u.base.speed *= b.scaling.speed;
  u.atk = 0.4;
  u.elite = !!(o && o.elite);
  if (p.healer) { u.hT = p.healer.every * 0.5; u.healFx = { kind: 'heal', to: 'radius', at: 'self', radius: p.healer.radius, pct: p.healer.pct }; }
  if (p.summoner) u.sT = p.summoner.every * 0.6;
  if (p.burrower) {
    u.bT = p.burrower.every * 0.7; u.bL = 0;
    u.emergeFx = { kind: 'aoe', at: 'self', radius: p.burrower.emergeAoe.radius, mult: p.burrower.emergeAoe.mult };
  }
  if (p.fast && p.fast.burstEvery) { u.fT = p.fast.burstEvery * 0.5; u.fL = 0; }
  if (p.explosive) {
    u.boom = p.explosive;
    u.boomFx = { kind: 'aoe', at: 'self', radius: p.explosive.radius, mult: p.explosive.mult };
  }
  prepUnit(b, u);
  u.atk = 0.4;
}

/**
 * Spawn an enemy of the field now. lane is a lane index, x defaults to the edge. o: {affix:[ids], elite, scale}.
 * Pushes to b.enemies and emits spawn. Returns the unit.
 */
export function spawnEnemy(b, enemyId, lane, x, o = {}) {
  let mods, on;
  if (o.affix && o.affix.length) {
    for (const id of o.affix) {
      const a = AFFIX_BY_ID[id]; if (!a) continue;
      const e = a.effect;
      if (e.kind === 'stat_mod') (mods || (mods = [])).push(e);
      else if (e.kind === 'aoe') (on || (on = [])).push({ trigger: 'on_death', effect: e });
    }
  }
  const u = FX.createEnemyUnit(b, enemyId, { x: x ?? EDGE_X, y: lane, scale: o.scale || b.scaling, mods, on });
  if (o.affix && o.affix.indexOf('warded') >= 0) FX.addStatus(b, u, { type: 'shield', amount: u.maxHp * 0.5, max: u.maxHp * 0.5, t: 1e9, key: 'affix' });
  setupEnemy(b, u, { elite: !!(o.affix && o.affix.length) });
  b.enemies.push(u);
  FX.emit(b, { type: 'spawn', uid: u.uid, id: u.id, x: u.x, y: u.y, side: 'enemy', boss: u.boss, elite: u.elite });
  return u;
}

// effects.js 'spawn_enemies' (boss phases) goes through this hook. effects resolves at:'edge' to the entry edge for every caster;
// the guard below keeps any stray x near the base on the entry edge. effects emits the spawn event itself.
function hookSpawnEnemy(b, enemyId, x, y) {
  const lane = clamp(Math.round(y), 0, b.lanes - 1);
  const ex = x < EDGE_X * 0.5 ? EDGE_X : x;
  const u = FX.createEnemyUnit(b, enemyId, { x: ex, y: lane });
  setupEnemy(b, u, null);
  b.enemies.push(u);
  return u;
}

function spawnPieces(b, from, id, count, spreadX) {
  for (let i = 0; i < count; i++) {
    const u = FX.createEnemyUnit(b, id, { x: from.x + (i - (count - 1) / 2) * spreadX, y: from.lane });
    setupEnemy(b, u, null);
    b.enemies.push(u);
    FX.emit(b, { type: 'spawn', uid: u.uid, id: u.id, x: u.x, y: u.y, side: 'enemy', split: true });
  }
}

function hookOnDeath(b, u) {
  if (u.side === 'enemy') {
    b.stats.kills++;
    if (u.boss) b.stats.bossKills++;
    const p = u.params;
    if (p) {
      if (p.splitter) spawnPieces(b, u, p.splitter.into, p.splitter.count, 0.4);
      if (p.explosive && p.explosive.on === 'death' && !u.exploded) { u.exploded = true; FX.applyEffect(b, u.boomFx, { source: u, side: 'enemy', level: 1 }); }
    }
  } else if (u.kind === 'cat') b.stats.catsLost++;
}

// ------------------------------------------------------------------------------------------------ wave spawner
function updateSpawner(b) {
  const sp = b.sp;
  if (sp.done) return;
  if (sp.state === 'idle') {
    if (sp.next >= b.waves) { sp.done = true; return; }
    const early = b.enemies.length === 0 && b.fx.queue.length === 0 && b.t >= sp.lastSpawn + 1.5 && sp.next > 0;
    if (b.t >= sp.startAt || early) {
      sp.pending = enemyWave(null, b.gs, sp.next, b.waveRng, { lanes: b.lanes });
      sp.pi = 0; sp.t0 = b.t; sp.state = 'run';
      b.wave = sp.next + 1;
      sp.bossWave = b.info.isBoss && sp.next >= b.waves - 1;
      FX.emit(b, { type: 'wave', wave: b.wave, waves: b.waves, name: sp.bossWave ? 'Boss wave' : 'Wave ' + b.wave, isBossWave: sp.bossWave });
      FX.fireTrigger(b, 'on_wave_start', { wave: b.wave });
    }
  }
  if (sp.state === 'run') {
    const local = b.t - sp.t0;
    const pend = sp.pending;
    while (sp.pi < pend.length && pend[sp.pi].t <= local + 1e-9) {
      const en = pend[sp.pi++];
      for (let i = 0; i < en.count; i++) spawnEnemy(b, en.enemyId, clamp(en.lane, 0, b.lanes - 1), EDGE_X + i * 0.35, { affix: en.affix });
    }
    if (sp.pi >= pend.length) {
      sp.state = 'idle'; sp.next++; sp.lastSpawn = b.t; sp.startAt = b.t + WAVE_GAP;
      if (sp.next >= b.waves) sp.done = true;
    }
  }
}

// ------------------------------------------------------------------------------------------------ targeting helpers
let _tgt = null;

function catTarget(b, c) {
  const range = c.cRange, ranged = range >= 2, lane = c.lane;
  const r2 = (range + 0.001) * (range + 0.001);
  const li = lane < 0 ? 0 : lane >= b.lanes ? b.lanes - 1 : lane;
  const lo = ranged && li > 0 ? li - 1 : li, hi = ranged && li < b.lanes - 1 ? li + 1 : li;
  let best = null, bs = 1e9;
  for (let k = lo; k <= hi; k++) {
    const en = b.laneE[k];
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead || e.untargetable) continue;
      if (e.flying && !ranged) continue;
      const dl = e.lane - lane;
      if (ranged ? (dl > 1 || dl < -1) : dl !== 0) continue;
      const dx = e.x - c.x;
      if (dx * dx + dl * dl > r2) continue;
      let s = abs(dx) + (dl !== 0 ? 0.75 : 0);
      if (e.params && e.params.healer) s -= 1.5;
      if (s < bs) { bs = s; best = e; }
    }
  }
  return best;
}

function enemyTarget(b, e) {
  const range = e.cRange, ranged = range >= 2, lane = e.lane;
  const r2 = (range + 0.001) * (range + 0.001);
  const tn = b.taunters;
  if (tn.length) {
    let tb = null, td = 1e9;
    for (let i = 0; i < tn.length; i++) {
      const c = tn[i];
      const dx = c.x - e.x, dy = c.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 <= b.tauntR[i] * b.tauntR[i] && d2 <= r2 && d2 < td) { td = d2; tb = c; }
    }
    if (tb) return tb;
  }
  const li = lane < 0 ? 0 : lane >= b.lanes ? b.lanes - 1 : lane;
  const lo = ranged && li > 0 ? li - 1 : li, hi = ranged && li < b.lanes - 1 ? li + 1 : li;
  let best = null, bs = 1e9;
  for (let k = lo; k <= hi; k++) {
    const us = b.laneC[k];
    for (let i = 0; i < us.length; i++) {
      const c = us[i];
      if (c.dead) continue;
      const wall = c.kind === 'barricade';
      if (wall && e.flying) continue;
      const dl = c.lane - lane;
      if (ranged ? (dl > 1 || dl < -1) : dl !== 0) continue;
      const dx = e.x - c.x;
      if (dx * dx + dl * dl > r2) continue;
      const s = abs(dx) + (dl !== 0 ? 0.75 : 0) + (wall && ranged ? 2 : 0);
      if (s < bs) { bs = s; best = c; }
    }
  }
  return best;
}

function blockerX(b, e) {
  const lane = e.lane, flying = e.flying, x = e.x + 0.05;
  const us = b.laneC[lane < 0 ? 0 : lane >= b.lanes ? b.lanes - 1 : lane];
  let bx = -1e9;
  for (let i = 0; i < us.length; i++) {
    const c = us[i];
    if (c.dead || c.lane !== lane || c.x > x) continue;
    if (flying && c.kind === 'barricade') continue;
    if (c.x > bx) bx = c.x;
  }
  return bx;
}

function anyFoeNear(b, u) {
  const pool = u.side === 'cat' ? b.enemies : b.units;
  for (let i = 0; i < pool.length; i++) {
    const t = pool[i];
    if (t.dead || t.untargetable || t.kind === 'barricade') continue;
    if (abs(t.x - u.x) <= 7) return true;
  }
  return false;
}

function hurtAlly(b, u) {
  const pool = u.side === 'cat' ? b.units : b.enemies;
  for (let i = 0; i < pool.length; i++) {
    const t = pool[i];
    if (!t.dead && t.kind !== 'barricade' && t.hp < t.maxHp * 0.85) return true;
  }
  return false;
}

function abilityReady(b, u, tgt) {
  const m = needOf(u.ability.effect);
  if ((m & N_FOE) && tgt) return true;
  if ((m & N_NEAR) && (tgt || anyFoeNear(b, u))) return true;
  if ((m & N_HURT) && hurtAlly(b, u)) return true;
  if ((m & N_BASE) && u.side === 'cat' && b.base.hp < b.base.maxHp * 0.9) return true;
  if (m & N_FALLEN) { const f = b.fx.fallen; for (let i = 0; i < f.length; i++) if (f[i].dead) return true; }
  if ((m & N_ENERGY) && b.energy <= b.energyCap - 1) return true;
  if (m & N_FREE) return true;
  return false;
}

// ------------------------------------------------------------------------------------------------ projectiles
function fireProjectile(b, src, tgt) {
  const p = b.projPool.pop() || {};
  p.x = src.x; p.y = src.y; p.src = src; p.tgt = tgt; p.dead = false;
  b.projectiles.push(p);
}

function stepProjectiles(b, dt) {
  const ps = b.projectiles;
  let w = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const t = p.tgt;
    let keep = true;
    if (t.dead && !t.isBase) keep = false;
    else {
      const dx = t.x - p.x, dy = t.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const mv = PROJ_SPEED * dt;
      if (d <= mv + 0.05) {
        if (!t.untargetable) FX.attack(b, p.src, t);
        keep = false;
      } else { p.x += dx / d * mv; p.y += dy / d * mv; }
    }
    if (keep) ps[w++] = p;
    else { p.src = null; p.tgt = null; b.projPool.push(p); }
  }
  ps.length = w;
}

function swing(b, a, t, ranged) {
  FX.emit(b, { type: 'attack', src: a.uid, tgt: t.uid, ranged, x: a.x, y: a.y, tx: t.x, ty: t.y });
  if (ranged) fireProjectile(b, a, t); else FX.attack(b, a, t);
}

// ------------------------------------------------------------------------------------------------ unit AI
function prepPass(b, dt) {
  const tick = b.tick;
  b.taunters.length = 0; b.tauntR.length = 0;
  const snap = SNAP_SPEED * dt, nl = b.lanes;
  for (let i = 0; i < nl; i++) { b.laneC[i].length = 0; b.laneE[i].length = 0; }
  for (let pass = 0; pass < 2; pass++) {
    const arr = pass === 0 ? b.units : b.enemies;
    for (let i = 0; i < arr.length; i++) {
      const u = arr[i];
      if (u.dead) continue;
      if (!(u.x === u.x) || !(u.y === u.y)) { u.x = u.home ? u.home.x : EDGE_X; u.y = u.home ? u.home.y : 0; }
      const ln = Math.round(u.y);
      u.lane = ln;
      if (u.y !== ln) { const d = ln - u.y; u.y = d > snap ? u.y + snap : d < -snap ? u.y - snap : ln; }
      (pass === 0 ? b.laneC : b.laneE)[ln < 0 ? 0 : ln >= nl ? nl - 1 : ln].push(u);
      if (u.kind === 'barricade') continue;
      if (u.cRange === undefined || (tick + u.uid) % STAT_EVERY === 0) refreshStats(b, u);
      if (pass === 0 && u.statuses.length) {
        const s = u.statuses;
        for (let j = 0; j < s.length; j++) if (s[j].type === 'taunt' && !s[j].gone) { b.taunters.push(u); b.tauntR.push(s[j].radius); break; }
      }
    }
  }
}

function enemyTraits(b, e, dt) {
  const p = e.params;
  if (!p) return;
  if (p.healer) {
    e.hT -= dt;
    if (e.hT <= 0) {
      e.hT = p.healer.every;
      const en = b.enemies; let hurt = false;
      for (let i = 0; i < en.length; i++) { const t = en[i]; if (!t.dead && t.hp < t.maxHp * 0.95 && abs(t.x - e.x) <= p.healer.radius && abs(t.y - e.y) <= p.healer.radius) { hurt = true; break; } }
      if (hurt) FX.applyEffect(b, e.healFx, { source: e, side: 'enemy', level: 1 });
    }
  }
  if (p.summoner) {
    e.sT -= dt;
    if (e.sT <= 0) {
      e.sT = p.summoner.every;
      FX.emit(b, { type: 'summon_call', uid: e.uid, id: p.summoner.enemy, count: p.summoner.count });
      for (let i = 0; i < p.summoner.count; i++) {
        const lane = b.rng.int(0, b.lanes - 1);
        spawnEnemy(b, p.summoner.enemy, lane, clamp(e.x + 0.3 + i * 0.3, 1, EDGE_X + 1), {});
      }
    }
  }
  if (p.fast && e.fT !== undefined) {
    if (e.fL > 0) e.fL -= dt;
    else { e.fT -= dt; if (e.fT <= 0) { e.fT = p.fast.burstEvery; e.fL = p.fast.burstTime; } }
  }
}

function catAI(b, c, dt) {
  if (c.cRange === undefined) prepUnit(b, c);
  if (c.statuses.length && FX.isStunned(c)) return;
  if (c.atk > -dt) c.atk -= dt;
  const range = c.cRange;
  let tgt = catTarget(b, c);
  // mobile cats (brawlers, tanks) step out toward the nearest enemy of their lane and come back
  if (c.cSpeed > 0 && c.kind === 'cat') {
    let chase = null;
    if (!tgt) {
      const en = b.enemies; let bd = 1e9;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (e.dead || e.untargetable || e.lane !== c.lane || (e.flying && range < 2)) continue;
        const d = e.x - c.x;
        if (d < -0.5 || e.x - c.home.x > ADVANCE + range) continue;
        if (d < bd) { bd = d; chase = e; }
      }
    }
    const mv = c.cSpeed * dt;
    if (chase) {
      const goal = Math.min(chase.x - range * 0.9, c.home.x + ADVANCE);
      if (c.x < goal) c.x = Math.min(goal, c.x + mv);
      else if (c.x > goal) c.x = Math.max(goal, c.x - mv);
    } else if (!tgt && c.x !== c.home.x) {
      c.x = c.x > c.home.x ? Math.max(c.home.x, c.x - mv) : Math.min(c.home.x, c.x + mv);
    }
    if (!tgt && chase) tgt = catTarget(b, c);
  }
  if (tgt && c.atk <= 0) {
    swing(b, c, tgt, range >= 2);
    c.atk += 1 / c.cRate;
    if (c.atk < 0) c.atk = 0;
  }
  const ab = c.ability;
  if (ab) {
    if (c.cd > 0) c.cd -= dt;
    if (c.cd <= 0) {
      if (abilityReady(b, c, tgt)) FX.castAbility(b, c, { target: tgt || undefined });
      else c.cd = RECHECK;
    }
  }
}

function enemyAI(b, e, dt) {
  if (e.cRange === undefined) prepUnit(b, e);
  if (e.statuses.length && FX.isStunned(e)) return;
  const p = e.params;
  // burrowed: untargetable, sprints under the cats
  if (e.bL > 0) {
    e.bL -= dt;
    e.x -= e.cSpeed * 1.5 * dt;
    if (e.x < BASE_X + 1) e.x = BASE_X + 1;
    if (e.bL <= 0 || e.x <= BASE_X + 1.001) {
      e.bL = 0; e.untargetable = false; e.bT = p.burrower.every;
      FX.emit(b, { type: 'emerge', uid: e.uid, x: e.x, y: e.y });
      FX.applyEffect(b, e.emergeFx, { source: e, side: 'enemy', level: 1 });
    }
    return;
  }
  if (p) enemyTraits(b, e, dt);
  if (p && p.burrower) {
    e.bT -= dt;
    if (e.bT <= 0 && b.units.length) {
      e.bL = p.burrower.duration; e.untargetable = true;
      FX.emit(b, { type: 'burrow', uid: e.uid, x: e.x, y: e.y });
      return;
    }
  }
  if (e.atk > -dt) e.atk -= dt;
  const range = e.cRange;
  // move
  let speed = e.cSpeed;
  if (e.fL > 0) speed *= p.fast.burstSpeedMult;
  if (speed > 0) {
    const bx = blockerX(b, e);
    const stop = bx > -1e8 ? bx + range : BASE_X + (range > 1 ? range : 1);
    if (e.x > stop) { const d = e.x - stop, mv = speed * dt; e.x -= d < mv ? d : mv; }
  }
  // attack
  let tgt = enemyTarget(b, e);
  let hitBase = false;
  if (!tgt && e.x - BASE_X <= (range > 1 ? range : 1) + 0.001) { hitBase = true; tgt = b.base; }
  if (tgt && e.atk <= 0) {
    if (e.boom && e.boom.on === 'contact' && !e.exploded) {
      e.exploded = true;
      FX.applyEffect(b, e.boomFx, { source: e, side: 'enemy', level: 1 });
      if (hitBase) { const before = b.base.hp; FX.damageUnit(b, e, b.base, FX.computeStat(b, e, 'dmg') * e.boom.mult); if (b.base.hp < before) b.stats.baseDamaged = true; }
      FX.killUnit(b, e, null, { silent: true, force: true });
      b.stats.kills++;
      return;
    }
    if (hitBase) {
      const before = b.base.hp;
      if (range >= 2) { FX.emit(b, { type: 'attack', src: e.uid, tgt: 0, ranged: true, x: e.x, y: e.y, tx: b.base.x, ty: b.base.y }); fireProjectile(b, e, b.base); }
      else { FX.emit(b, { type: 'attack', src: e.uid, tgt: 0, ranged: false, x: e.x, y: e.y, tx: b.base.x, ty: b.base.y }); FX.attack(b, e, b.base); }
      if (b.base.hp < before) b.stats.baseDamaged = true;
    } else swing(b, e, tgt, range >= 2);
    e.atk += 1 / e.cRate;
    if (e.atk < 0) e.atk = 0;
  }
  if (e.ability) {
    if (e.cd > 0) e.cd -= dt;
    if (e.cd <= 0) {
      if (abilityReady(b, e, tgt && !hitBase ? tgt : null)) FX.castAbility(b, e, { target: tgt && !hitBase ? tgt : undefined });
      else e.cd = RECHECK;
    }
  }
}

// ------------------------------------------------------------------------------------------------ step
function finish(b, won, reason) {
  b.over = won ? 'win' : 'lose';
  FX.emit(b, won ? { type: 'win', wave: b.wave, seconds: b.t } : { type: 'lose', wave: b.wave, seconds: b.t, reason: reason || 'base' });
  b.result = computeResult(b, won);
  for (const r of b.result.rewards) FX.emit(b, { type: 'loot', kind: r.kind, id: r.id, amount: r.amount });
}

function stepOnce(b, dt) {
  b.tick++;
  b.t += dt;
  if (b.echo) { if (b.t >= ECHO_SECONDS - 1e-9) finish(b, true); return; }
  FX.tickStatuses(b, dt);
  // energy and base regen
  const cap = b.energyCap;
  if (b.energy < cap) {
    b.energy += FX.energyRegenRate(b, DK.REGEN_BASE * b.regenMult) * dt;
    if (b.energy > cap) b.energy = cap;
  }
  if (b.baseRegen > 0 && b.base.hp > 0 && b.base.hp < b.base.maxHp) b.base.hp = Math.min(b.base.maxHp, b.base.hp + b.baseRegen * b.base.maxHp * dt);
  updateSpawner(b);
  prepPass(b, dt);
  const us = b.units;
  for (let i = 0; i < us.length; i++) { const c = us[i]; if (!c.dead && c.kind !== 'barricade') catAI(b, c, dt); }
  const en = b.enemies;
  for (let i = 0; i < en.length; i++) { const e = en[i]; if (!e.dead) enemyAI(b, e, dt); }
  stepProjectiles(b, dt);
  FX.sweepDead(b);
  if (b.base.hp <= 0) finish(b, false, 'base');
  else if (b.sp.done && b.enemies.length === 0 && b.fx.queue.length === 0 && b.projectiles.length === 0) finish(b, true);
  else if (b.t >= MAX_SECONDS) finish(b, false, 'timeout');
}

/** Advance the battle by dt seconds (the fixed step is 1/30; larger dt is split into fixed steps). */
export function step(b, dt = DT) {
  if (b.over) return b;
  if (!(dt > 0) || !Number.isFinite(dt)) return b;     // NaN, Infinity, zero and negative time do nothing (a NaN would poison energy and the clock for good)
  let n = 1, h = dt;
  if (dt > DT * 1.5) { n = Math.min(10, Math.ceil(dt / DT - 1e-9)); h = dt / n; }
  for (let i = 0; i < n && !b.over; i++) stepOnce(b, h);
  return b;
}

export function drainEvents(b) { const e = b.events; b.events = []; return e; }

// ------------------------------------------------------------------------------------------------ cards
function levelOfCard(b, id) { const c = b.profile.cards && b.profile.cards[id]; return c && c.level >= 1 ? c.level : 1; }

function toTile(b, arg, wide) {
  if (arg == null || typeof arg !== 'object') return null;
  const x = arg.x ?? arg.col, y = arg.y ?? arg.lane ?? arg.row;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(Math.round(x), wide ? 0 : 1, COLS), y: clamp(Math.round(y), 0, b.lanes - 1) };
}

function pickEnemy(b, arg) {
  if (arg && typeof arg === 'object' && arg.side === 'enemy') return arg.dead || arg.untargetable ? null : arg;
  const pool = b.enemies;
  if (typeof arg === 'number') { for (const e of pool) if (e.uid === arg && !e.dead && !e.untargetable) return e; return null; }
  const t = toTile(b, arg && typeof arg === 'object' ? { x: arg.x ?? arg.col ?? 0, y: arg.y ?? arg.lane ?? arg.row ?? 0 } : null, true);
  let best = null, bd = 1e9;
  for (const e of pool) {
    if (e.dead || e.untargetable) continue;
    const d = t ? abs(e.x - t.x) + abs(e.y - t.y) * 2 : e.x;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function canPlay(b, i) {
  if (b.over || !Number.isInteger(i) || i < 0 || i >= b.hand.length) return false;
  const card = CARD_BY_ID[b.hand[i]];
  return !!card && b.energy + 1e-9 >= FX.cardCost(b, card);
}

/**
 * Play the card at hand index i. tileOrTarget by card.effect.target:
 *   'tile': {x, y} (or {col, lane}); summons need a free tile 1..8 and merge with an equal adjacent cat. Other tile cards take any tile.
 *   'enemy': an enemy unit, its uid, or a tile (nearest enemy); omitted = the enemy closest to the base.
 *   'lane': a lane number or {lane}; omitted = the lane of the enemy closest to the base.   'none': ignored.
 * Returns {ok:true, card, cost, unit?, merged?} or {ok:false, reason: over|bad_index|energy|bad_target|occupied|no_target}.
 * Nothing changes (no energy, no card) when the play is refused.
 */
export function playCard(b, i, tileOrTarget) {
  if (b.over) return { ok: false, reason: 'over' };
  if (!Number.isInteger(i) || i < 0 || i >= b.hand.length) return { ok: false, reason: 'bad_index' };
  const id = b.hand[i];
  const card = CARD_BY_ID[id];
  if (!card) return { ok: false, reason: 'bad_index' };
  const cost = FX.cardCost(b, card);
  if (b.energy + 1e-9 < cost) return { ok: false, reason: 'energy', cost };
  const kind = card.effect.target || 'none';
  const ctx = { level: levelOfCard(b, id) };
  if (kind === 'tile') {
    const t = toTile(b, tileOrTarget, card.type !== 'summon');
    if (!t) return { ok: false, reason: 'bad_target' };
    if (card.type === 'summon' && tileOccupied(b, t.x, t.y)) return { ok: false, reason: 'occupied' };
    ctx.tile = t;
  } else if (kind === 'enemy') {
    const e = pickEnemy(b, tileOrTarget);
    if (!e) return { ok: false, reason: 'no_target' };
    ctx.target = e; ctx.tile = { x: e.x, y: e.y };
  } else if (kind === 'lane') {
    let lane = typeof tileOrTarget === 'number' ? tileOrTarget : tileOrTarget && (tileOrTarget.lane ?? tileOrTarget.y ?? tileOrTarget.row);
    if (!Number.isFinite(lane)) { const e = pickEnemy(b, null); if (!e) return { ok: false, reason: 'no_target' }; lane = e.lane; }
    ctx.tile = { x: 1, y: clamp(Math.round(lane), 0, b.lanes - 1) };
  }
  b.energy = Math.max(0, b.energy - cost);
  b.deck.handSize = Math.max(1, Math.min(DK.HAND_MAX, b.handSize));
  DK.play(b.deck, i, { free: true });
  syncDeck(b);
  b.stats.cardsPlayed++;
  if (card.type === 'spell') b.stats.spellsCast++;
  const r = FX.playCardEffect(b, card, ctx);
  const out = { ok: true, card: id, cost };
  if (card.type === 'summon') {
    const u = r.targets[0];
    if (u) out.unit = u; else out.merged = true;
  }
  return out;
}

/** Throw the hand away and redraw. Costs deck.CYCLE_COST energy. Returns false when it cannot be paid. */
export function cycleHand(b) {
  if (b.over || b.energy + 1e-9 < DK.CYCLE_COST) return false;
  b.energy -= DK.CYCLE_COST;
  b.deck.handSize = Math.max(1, Math.min(DK.HAND_MAX, b.handSize));
  DK.cycleHand(b.deck, true);
  syncDeck(b);
  return true;
}

// ------------------------------------------------------------------------------------------------ results
function clone(o) { return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)); }

function lootRoll(b, sr) {
  const info = b.info;
  const crate = info.endless && info.round >= 1 ? 'midnight_crate' : CRATE_BY_ORDER[info.district.order - 1];
  const out = [];
  const mods = FX.rewardMods(b);
  const chance = clamp((0.15 * (1 + b.lootLuck)) * mods.dropRate.mult + mods.dropRate.add, 0, 0.9);
  if (!sr.echo && b.lootRng.next() < chance) out.push({ kind: 'key', id: crate, amount: 1 });
  if (sr.boss && sr.firstClear) out.push({ kind: 'key', id: crate === 'alley_crate' ? 'neon_crate' : 'rooftop_crate', amount: 1 });
  return out;
}

function buildResult(b, won, base) {
  const r = {
    won, over: b.over || null, wave: b.wave, waves: b.waves, gs: b.gs, seconds: b.t, kills: b.stats.kills, bossKills: b.stats.bossKills,
    perfect: won && !b.stats.baseDamaged, baseHp: b.base.hp, echo: b.echo, merges: b.stats.merges, stats: b.stats,
    rewards: [], totals: { fish: 0, yarn: 0, gems: 0 }, profile: base, firstClear: false, advanced: false, boss: false,
  };
  return r;
}

function computeResult(b, won) {
  const res = buildResult(b, won, b.profile);
  if (!won) return res;
  const sr = stageRewards(b.profile, { won: true, gs: b.gs, seconds: b.t, kills: b.stats.kills, perfect: res.perfect, rewardMult: b.opts.rewardMult, noAdvance: b.opts.noAdvance });
  const p = sr.profile === b.profile ? clone(b.profile) : sr.profile;
  const rm = FX.rewardMods(b);
  const fish = Math.max(0, Math.floor(sr.rewards.fish * (rm.fish.mult - 1) + rm.fish.flat * b.scaling.reward));
  const yarn = Math.max(0, Math.floor(sr.rewards.yarn * (rm.yarn.mult - 1) + rm.yarn.flat * b.scaling.reward));
  p.cur.fish = Math.min(MAX_CUR, p.cur.fish + fish);
  p.cur.yarn = Math.min(MAX_CUR, p.cur.yarn + yarn);
  p.stats.fishEarned = (p.stats.fishEarned || 0) + fish;
  const rewards = [];
  const totalFish = sr.rewards.fish + fish, totalYarn = sr.rewards.yarn + yarn;
  if (totalFish > 0) rewards.push({ kind: 'fish', amount: totalFish });
  if (totalYarn > 0) rewards.push({ kind: 'yarn', amount: totalYarn });
  if (sr.rewards.gems > 0) rewards.push({ kind: 'gems', amount: sr.rewards.gems });
  const loot = lootRoll(b, sr);
  if (loot.length) {
    if (!p.town) p.town = {};
    if (!p.town.keys) p.town.keys = {};
    for (const l of loot) { p.town.keys[l.id] = (p.town.keys[l.id] || 0) + l.amount; rewards.push(l); }
  }
  res.profile = recordStats(p, { cardsPlayed: b.stats.cardsPlayed, spellsCast: b.stats.spellsCast, summons: b.stats.summons });
  res.rewards = rewards;
  res.totals = { fish: totalFish, yarn: totalYarn, gems: sr.rewards.gems };
  res.firstClear = sr.firstClear; res.advanced = sr.advanced; res.boss = sr.boss;
  return res;
}

/**
 * Result of a finished battle: {won, over, wave, waves, gs, seconds, kills, bossKills, perfect, baseHp, echo, merges, stats,
 * rewards:[{kind:'fish'|'yarn'|'gems'|'key', id?, amount}], totals:{fish,yarn,gems}, profile (a NEW profile with the rewards,
 * progress, quest counters and keys applied; the input profile is never mutated), firstClear, advanced, boss}.
 * While the battle is still running returns {won:false, over:null, ...} with the live wave and no rewards.
 */
export function battleResult(b) {
  if (b.result) return b.result;
  return buildResult(b, false, b.profile);
}

/** Echo clear fast path: no simulation. Same result shape as battleResult for a stage below the profile's echo threshold. */
export function resolveEcho(profile, opts = {}) {
  const gs = toGlobal(opts.district, opts.stage);
  if (opts.noAdvance || gs < frontierOf(profile)) {
    // not the advancing clear: an instant echo pays nothing here (exploit N1). The caller plays a real battle instead.
    return {
      won: false, over: null, refused: true, wave: 0, waves: 0, gs, seconds: 0, kills: 0, bossKills: 0, perfect: false, baseHp: 0, echo: true,
      merges: 0, stats: {}, rewards: [], totals: { fish: 0, yarn: 0, gems: 0 }, profile,
      firstClear: false, advanced: false, boss: false,
    };
  }
  const sr = stageRewards(profile, { won: true, gs, seconds: ECHO_SECONDS, rewardMult: opts.rewardMult, noAdvance: opts.noAdvance });
  const rewards = [];
  if (sr.rewards.fish > 0) rewards.push({ kind: 'fish', amount: sr.rewards.fish });
  if (sr.rewards.yarn > 0) rewards.push({ kind: 'yarn', amount: sr.rewards.yarn });
  return {
    won: true, over: 'win', wave: 0, waves: 0, gs, seconds: ECHO_SECONDS, kills: 0, bossKills: 0, perfect: false, baseHp: 0, echo: true,
    merges: 0, stats: {}, rewards, totals: { fish: sr.rewards.fish, yarn: sr.rewards.yarn, gems: 0 }, profile: sr.profile,
    firstClear: sr.firstClear, advanced: sr.advanced, boss: sr.boss,
  };
}
