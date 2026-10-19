// Midnight Mog effects and relic interpreter.
// Battle-agnostic: battle.js builds the state, this module interprets the closed effect vocabulary of
// docs/SYSTEMS.md (all EFFECT_KINDS of data/validate.js), folds stats, runs relic triggers and emits events.
// Deterministic: no DOM, no Math.random, no Date. Randomness comes from b.rng (../rng.js makeRng), time from dt.
//
// ---------------------------------------------------------------------------------------------------------
// BATTLE STATE THIS MODULE READS (b is a plain object; fields marked * are created lazily when missing)
//   units:[]      cat side: cats, minions, barricades (kind tells them apart)
//   enemies:[]    enemy side
//   projectiles:[]  (untouched here, battle owns it)
//   events:[]     every visible thing is pushed here as {type, t, ...}; render drains it (battle.drainEvents)
//   rng           makeRng(seed) object  (*, created from b.seed || 1 if absent)
//   base          {hp, maxHp}  the cats' base (*, defaults 100). Selector 'base' returns this object.
//   field         {baseX, edgeX, rows} lane geometry in tile units (*, defaults 0, 12, 5). Enemies enter at
//                 edgeX and walk toward baseX. "Back" for an enemy is toward edgeX. y is the lane (row) index.
//   energy, energyCap (default 10), handSize (default 5)     numbers the energy/draw/battle_rule kinds touch
//   hand, draw, discard   arrays of card ids (only used by the default 'draw' implementation)
//   profile       optional, for relics (profile.relics), nineLives.shards, cats{level,stars}, collection bonuses
//   relicIds      optional explicit relic id list, overrides profile.relics
//   modifiers     optional array of relic style effects (district / map modifier). If absent and b.district is a
//                 district id (string), that district's modifier is used.
//   extraMods     optional array of relic style effects (town hooks like garden / base hp converted by battle.js)
//   stageFactor   optional refScale(stage) for flat card and relic amounts (default 1)
//   scaling       optional {hp, dmg, reward} enemy stage scaling used by createEnemyUnit (default 1)
//   hooks         optional overrides: draw(b,n), summonCat(b,catId,level,tile,ctx)->unit,
//                 spawnEnemy(b,enemyId,x,y,ctx)->unit, onDeath(b,unit,killer)
//   fx            * private scratch owned by this module (clock, traps, auras, rules, rewards, fallen, queue)
//
// MINIMAL UNIT SHAPE (cats, enemies, minions, barricades). Build with createCatUnit / createEnemyUnit, or build
// your own and pass it through initUnit(b, u):
//   uid      unique int (newUid(b)), id data id string, side 'cat'|'enemy', kind 'cat'|'enemy'|'minion'|'barricade'
//   x, y     tile units. hp, maxHp. statuses:[] (private to this module). tags:[] role rarity flying boss traits:[]
//   base     {hp, dmg, range, rate, speed, [armor, crit, critdmg, lifesteal, regen]} raw data values
//   perLevel {hp, dmg}, level, stars       cats only: level scaling = base + perLevel*(L-1), times milestone and star mult
//   scale    {hp, dmg}                      enemies only: stage scaling (createEnemyUnit fills it from b.scaling)
//   ability  {id, cooldown|every, effect}   cd = seconds until the next cast (castAbility resets it)
//   mods     optional array of stat_mod effects with scope 'self' (elite affixes)
//   on       optional array of unit local on_event listeners {trigger, filter?, chance?, effect}
//   life     optional seconds to live (minions, barricades); tickStatuses expires them
//   dead     set by killUnit; sweepDead removes dead units from the arrays (tickStatuses calls it)
//   phases, phaseIdx, phaseMods             bosses; phases fire automatically when damaged
//   untargetable                            true while burrowed
// Stats are NEVER written to the unit; always read them with computeStat(b, unit, name).
//
// EVENTS EMITTED (all have type and t = fx clock seconds):
//   hit{src,tgt,x,y,amount,absorbed,crit,element,kind,dot?} crit{...same} death{uid,id,side,kind,x,y,boss,expired?}
//   cast{src,id,name,echo?} / cast{card,...}  heal{tgt,x,y,amount} status{tgt,x,y,status,stat?,pct?,t}
//   shield{tgt,amount} base_hit{amount,hp} chain{path:[{x,y}],element} pierce{x1,y1,x2,y2,element}
//   aoe{x,y,radius,element} knockback{tgt,x0,x1,y} pull{tgt,x0,y0,x1,y1} execute{tgt,killed}
//   trap_set{uid,x,y,radius,charges} trap_trigger{uid,tgt} barricade{uid,x,y,hp} aura{uid,x,y,radius}
//   energy{amount} draw{count} revive{tgt?,base?} spawn{uid,id,x,y,side,minion?} wave{name,boss} (boss phase)
//   rule{rule,value} reward{resource,pct?,flat?} cleanse{tgt} taunt{src,radius,t} reflect{src,tgt,amount}
// ---------------------------------------------------------------------------------------------------------
import { makeRng } from '../rng.js';
import { CAT_BY_ID } from '../data/cats.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { RELIC_BY_ID } from '../data/relics.js';
import { DISTRICT_BY_ID } from '../data/districts.js';
import { collectionBonuses } from '../data/quests.js';
import { milestoneMult, starMult, nineLivesMult } from './economy.js';

export const TICK = 0.5;          // dot tick interval (seconds)
const FOREVER = 1e9;
const MAX_DEPTH = 3;              // relic trigger recursion guard
const ADDITIVE = { crit: 1, armor: 1, lifesteal: 1, regen: 1 };
const FRIENDLY = { heal: 1, shield: 1, buff: 1, cleanse: 1, reset_cooldown: 1, taunt: 1, reflect: 1, revive: 1 };
const DEFAULT_TO = {
  damage: 'target', chain: 'target', stun: 'target', dot: 'target', debuff: 'target', knockback: 'target', pull: 'target',
  execute: 'target', pierce: 'target', heal: 'self', shield: 'self', buff: 'self', cleanse: 'self', reset_cooldown: 'self',
  taunt: 'self', reflect: 'self',
};

// ------------------------------------------------------------------------------------------------ plumbing
export function fx(b) {
  let f = b.fx;
  if (!f) {
    f = b.fx = {
      clock: 0, depth: 0, mods: null, battleRules: {}, applied: {}, traps: [], auras: [], queue: [], fallen: [],
      reward: { fish: { pct: 0, flat: 0 }, yarn: { pct: 0, flat: 0 } }, relicCd: {}, cardsPlayed: 0, baseRevived: false,
      baseMaxHp0: 0,
    };
  }
  if (!b.events) b.events = [];
  if (!b.units) b.units = [];
  if (!b.enemies) b.enemies = [];
  if (!b.rng) b.rng = makeRng(b.seed || 1);
  if (b.nextUid === undefined) b.nextUid = 0;
  return f;
}
export function newUid(b) { b.nextUid = (b.nextUid || 0) + 1; return b.nextUid; }
export function fieldOf(b) {
  const f = b.field || {};
  return { baseX: f.baseX ?? 0, edgeX: f.edgeX ?? 12, rows: f.rows ?? 5 };
}
function awayDir(b) { const f = fieldOf(b); return f.edgeX >= f.baseX ? 1 : -1; }
/** +1/-1 along x that a side's units face (cats face the edge, enemies face the base). */
export function facing(b, side) { return side === 'cat' ? awayDir(b) : -awayDir(b); }
export function baseUnit(b) {
  fx(b);
  if (!b.base) b.base = { hp: 100, maxHp: 100 };
  const u = b.base;
  if (u.maxHp === undefined) u.maxHp = u.hp;
  u.isBase = true; u.side = 'cat'; u.kind = 'base'; u.uid = 0; u.id = 'base'; u.dead = false;
  const f = fieldOf(b); u.x = f.baseX; u.y = (f.rows - 1) / 2;
  if (!u.statuses) u.statuses = [];
  return u;
}
const opp = (s) => (s === 'cat' ? 'enemy' : 'cat');
const poolOf = (b, side) => (side === 'cat' ? b.units : b.enemies);
const dist = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
const alive = (u) => u && !u.dead && u.hp > 0;

export function emit(b, ev) {
  ev.t = b.fx ? b.fx.clock : 0;
  const e = b.events;
  e.push(ev);
  if (e.length > 4000) e.splice(0, 2000);
  return ev;
}

// ------------------------------------------------------------------------------------------------ statuses
export function hasStatus(u, type) {
  const s = u.statuses; if (!s) return false;
  for (let i = 0; i < s.length; i++) if (s[i].type === type && !s[i].gone) return true;
  return false;
}
export function isStunned(u) { return hasStatus(u, 'stun'); }
/** False while stunned or dead. Battle asks this before moving, attacking or casting. */
export function canAct(u) { return alive(u) && !hasStatus(u, 'stun'); }
export function addStatus(b, u, st) {
  if (!u.statuses) u.statuses = [];
  u.statuses.push(st);
  return st;
}
function statusEvent(b, u, status, extra) {
  const ev = { type: 'status', tgt: u.uid, x: u.x, y: u.y, status };
  if (extra) Object.assign(ev, extra);
  emit(b, ev);
}
export function removeStatuses(u, pred) {
  const s = u.statuses; if (!s) return 0;
  let n = 0, w = 0;
  for (let i = 0; i < s.length; i++) { if (pred(s[i])) n++; else s[w++] = s[i]; }
  s.length = w;
  return n;
}
function shieldTotal(u) {
  let t = 0; const s = u.statuses;
  if (s) for (let i = 0; i < s.length; i++) if (s[i].type === 'shield' && s[i].amount > 0) t += s[i].amount;
  return t;
}
function vulnOf(b, u) {
  let v = 0; const s = u.statuses;
  if (s) for (let i = 0; i < s.length; i++) if (s[i].type === 'debuff' && s[i].stat === 'vuln') v += s[i].pct;
  return v > 2 ? 2 : v;
}

// ------------------------------------------------------------------------------------------------ relic mods
function parseScope(s) { const i = s.indexOf(':'); return i < 0 ? { st: s, val: null } : { st: s.slice(0, i), val: s.slice(i + 1) }; }
function flatten(eff, src, out) {
  if (!eff) return;
  if (eff.kind === 'multi_mod') { for (const s of eff.steps) flatten(s, src, out); return; }
  out.push({ eff, src });
}
const RULE_ADD = { start_energy_add: 1, energy_cap_add: 1, hand_size_add: 1, trap_charges_add: 1, energy_regen_add: 1, base_hp_pct: 1, reward_pct: 1 };
const RULE_MULT = { energy_regen_mult: 1, buff_duration_mult: 1 };
const RULE_PROB = { spell_echo: 1, ability_echo: 1 };
function ruleIdentity(rule) { return RULE_MULT[rule] ? 1 : 0; }
function ruleCombine(rule, a, v) {
  if (RULE_ADD[rule]) return a + v;
  if (RULE_MULT[rule]) return a * v;
  if (RULE_PROB[rule]) return 1 - (1 - a) * (1 - v);
  return a > v ? a : v; // first_card_free, base_revive_once, cat_revive_once: strongest wins
}

/**
 * Aggregated relic data for this battle: {byStat:{stat:[{st,val,mult,add,src}]}, events:[...], rules:{rule:value},
 * ids:[relic ids], nl:{damage,income}}. Sources: relics, district/map modifiers, extraMods, collection set bonuses and the
 * Nine Lives multipliers. Cached on b.fx; pass rebuild=true (or call applyRelicRules) after the relic set changes.
 */
export function relicMods(b, rebuild = false) {
  const f = fx(b);
  if (f.mods && !rebuild) return f.mods;
  const m = { byStat: {}, events: [], rules: {}, ids: [], nl: { damage: 1, income: 1 } };
  const flat = [];
  const p = b.profile;
  const ids = b.relicIds || (p && p.relics ? Object.keys(p.relics).filter((k) => p.relics[k]) : []);
  for (const id of ids) { const r = RELIC_BY_ID[id]; if (r) { m.ids.push(id); flatten(r.effect, id, flat); } }
  let mods = b.modifiers;
  if (!mods && typeof b.district === 'string' && DISTRICT_BY_ID[b.district]) mods = [DISTRICT_BY_ID[b.district].modifier.effect];
  if (mods) for (const e of mods) flatten(e, 'modifier', flat);
  if (b.extraMods) for (const e of b.extraMods) flatten(e, 'extra', flat);
  if (p) for (const c of collectionBonuses(p)) flatten(c.effect, c.id, flat);
  if (p && p.nineLives) { const nl = nineLivesMult(p.nineLives.shards || 0); m.nl.damage = nl.damage; m.nl.income = nl.income; }
  let n = 0;
  for (const { eff, src } of flat) {
    if (eff.kind === 'stat_mod') {
      const sc = parseScope(eff.scope);
      (m.byStat[eff.stat] || (m.byStat[eff.stat] = [])).push({ st: sc.st, val: sc.val, mult: eff.mult, add: eff.add, src });
    } else if (eff.kind === 'rule') {
      m.rules[eff.rule] = m.rules[eff.rule] === undefined ? ruleCombine(eff.rule, ruleIdentity(eff.rule), eff.value) : ruleCombine(eff.rule, m.rules[eff.rule], eff.value);
    } else if (eff.kind === 'on_event') {
      m.events.push({ trigger: eff.trigger, filter: eff.filter || null, chance: eff.chance, cooldown: eff.cooldown || 0, effect: eff.effect, src, key: src + '#' + (n++) });
    }
  }
  f.mods = m;
  return m;
}

/** Combined value of a rule (relics plus battle_rule effects). Identity (0 or 1) when nobody set it. */
export function getRule(b, rule) {
  const f = fx(b);
  let v = relicMods(b).rules[rule];
  const br = f.battleRules[rule];
  if (v === undefined) v = br === undefined ? ruleIdentity(rule) : br;
  else if (br !== undefined) v = ruleCombine(rule, v, br);
  return v;
}

function scopeMatch(u, e) {
  switch (e.st) {
    case 'all_cats': return u.kind === 'cat';
    case 'role': return u.role === e.val;
    case 'tag': return !!u.tags && u.tags.indexOf(e.val) >= 0;
    case 'rarity': return u.rarity === e.val;
    case 'enemies': return u.side === 'enemy';
    case 'trait': return u.side === 'enemy' && !!u.traits && u.traits.indexOf(e.val) >= 0;
    default: return false; // cards, economy, base are not unit scopes
  }
}
/** Fold relic mods of a non unit scope ('cards', 'economy', 'base') for a stat: returns {mult, add}. */
export function scopeMod(b, scope, stat) {
  const arr = relicMods(b).byStat[stat];
  let mult = 1, add = 0;
  if (arr) for (let i = 0; i < arr.length; i++) {
    const e = arr[i]; if (e.st !== scope) continue;
    if (e.mult !== undefined) mult *= e.mult;
    if (e.add !== undefined) add += e.add;
  }
  return { mult, add };
}
export function economyMod(b, stat) { return scopeMod(b, 'economy', stat); }

// ------------------------------------------------------------------------------------------------ stats
function baseStat(b, u, stat) {
  const bs = u.base || {};
  const L = u.level || 1;
  switch (stat) {
    case 'hp': {
      let v = bs.hp !== undefined ? bs.hp : (u.baseHp !== undefined ? u.baseHp : u.maxHp || 1);
      if (u.perLevel) v += u.perLevel.hp * (L - 1);
      if (u.kind === 'cat') v *= milestoneMult(L) * starMult(u.stars || 0);
      if (u.scale) v *= u.scale.hp;
      return v;
    }
    case 'dmg': {
      let v = bs.dmg || 0;
      if (u.perLevel) v += u.perLevel.dmg * (L - 1);
      if (u.kind === 'cat') v *= milestoneMult(L) * starMult(u.stars || 0);
      if (u.scale) v *= u.scale.dmg;
      return v;
    }
    case 'rate': return bs.rate !== undefined ? bs.rate : 1;
    case 'range': return bs.range !== undefined ? bs.range : 1;
    case 'speed': return bs.speed !== undefined ? bs.speed : 0;
    case 'crit': return bs.crit !== undefined ? bs.crit : (u.kind === 'cat' ? 0.05 : 0);
    case 'critdmg': return bs.critdmg !== undefined ? bs.critdmg : 1.5;
    case 'armor': return bs.armor || 0;
    case 'lifesteal': return bs.lifesteal || 0;
    case 'regen': return bs.regen || 0;
    case 'cooldown': { const a = u.ability; return a ? (a.cooldown !== undefined ? a.cooldown : a.every || 0) : 0; }
    default: return 0;
  }
}

/**
 * Final value of a stat for a unit. Order: data base (+ level, milestone, star, stage scale) then relic / district /
 * collection / self mods (v * product(mult) + sum(add)), Nine Lives damage for cats, boss phase mods, then buffs and
 * debuffs from statuses. Stats: hp dmg rate range speed crit critdmg armor lifesteal regen cooldown reflect chain_jumps vuln.
 * Buffs on dmg rate speed range hp critdmg multiply; on crit armor lifesteal regen they add. Buff sums cap at +100%,
 * debuff sums at -90%. crit is clamped 0..1, armor 0..0.9. speed is 0 while stunned.
 */
export function computeStat(b, u, stat) {
  if (stat === 'vuln') return vulnOf(b, u);
  let v = baseStat(b, u, stat);
  const arr = relicMods(b).byStat[stat];
  let mul = 1, add = 0;
  if (arr) for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (scopeMatch(u, e)) { if (e.mult !== undefined) mul *= e.mult; if (e.add !== undefined) add += e.add; }
  }
  if (u.mods) for (let i = 0; i < u.mods.length; i++) {
    const e = u.mods[i];
    if (e.stat === stat && e.scope === 'self') { if (e.mult !== undefined) mul *= e.mult; if (e.add !== undefined) add += e.add; }
  }
  v = v * mul + add;
  if (stat === 'dmg' && u.kind === 'cat') v *= relicMods(b).nl.damage;
  const pm = u.phaseMods;
  if (pm) {
    if (stat === 'dmg' && pm.dmgMult) v *= pm.dmgMult;
    else if (stat === 'speed' && pm.speedMult) v *= pm.speedMult;
    else if (stat === 'armor' && pm.armorAdd) v += pm.armorAdd;
  }
  const s = u.statuses;
  if (s && s.length) {
    let bu = 0, de = 0;
    for (let i = 0; i < s.length; i++) {
      const st = s[i];
      if (st.stat !== stat || st.gone) continue;
      if (st.type === 'buff') bu += st.pct; else if (st.type === 'debuff') de += st.pct;
    }
    if (bu > 1) bu = 1;
    if (de > 0.9) de = 0.9;
    if (ADDITIVE[stat]) { v += bu; if (stat === 'armor') v *= 1 - de; }
    else v *= (1 + bu) * (1 - de);
  }
  if (stat === 'armor') v = v < 0 ? 0 : v > 0.9 ? 0.9 : v;
  else if (stat === 'crit') v = v < 0 ? 0 : v > 1 ? 1 : v;
  else if (stat === 'speed') { if (v < 0) v = 0; if (s && hasStatus(u, 'stun')) v = 0; }
  else if (stat === 'rate') { if (v < 0.05) v = 0.05; }
  else if (stat === 'range') { if (v < 0.5) v = 0.5; }
  else if (stat === 'hp') { if (v < 1) v = 1; }
  else if (stat === 'dmg' && v < 0) v = 0;
  return v;
}
/** Recompute maxHp from stats; raises current hp by the same delta, clamps it when max drops. */
export function syncMaxHp(b, u) {
  if (u.isBase) return;
  const nv = Math.round(computeStat(b, u, 'hp'));
  const d = nv - u.maxHp;
  if (d === 0) return;
  u.maxHp = nv;
  if (d > 0) u.hp += d; else if (u.hp > nv) u.hp = nv;
}
/** Make a hand built unit valid: uid, arrays, maxHp/hp from stats, first ability cooldown (50%). */
export function initUnit(b, u) {
  fx(b);
  if (!u.uid) u.uid = newUid(b);
  if (!u.statuses) u.statuses = [];
  if (!u.tags) u.tags = [];
  if (u.dead === undefined) u.dead = false;
  if (u.baseHp === undefined && !(u.base && u.base.hp !== undefined)) u.baseHp = u.maxHp || u.hp || 1;
  if (u.maxHp === undefined) u.maxHp = 1;
  const hpFull = u.hp === undefined;
  syncMaxHp(b, u);
  if (hpFull) u.hp = u.maxHp;
  if (u.ability && u.cd === undefined) u.cd = computeStat(b, u, 'cooldown') * 0.5;
  if (u.home === undefined) u.home = { x: u.x, y: u.y };
  return u;
}
export function createCatUnit(b, catId, o = {}) {
  const c = CAT_BY_ID[catId];
  if (!c) throw new Error('effects.createCatUnit: unknown cat ' + catId);
  const pc = b.profile && b.profile.cats && b.profile.cats[catId];
  const u = {
    uid: newUid(b), id: c.id, name: c.name, side: 'cat', kind: 'cat', role: c.role, rarity: c.rarity, tags: c.tags.slice(),
    x: o.x ?? 0, y: o.y ?? 0, level: o.level ?? (pc && pc.level) ?? 1, stars: o.stars ?? (pc && pc.stars) ?? 0,
    base: Object.assign({}, c.base), perLevel: c.perLevel, ability: c.ability, statuses: [], dead: false, flying: false, boss: false,
  };
  return initUnit(b, u);
}
export function createEnemyUnit(b, enemyId, o = {}) {
  const e = ENEMY_BY_ID[enemyId];
  if (!e) throw new Error('effects.createEnemyUnit: unknown enemy ' + enemyId);
  const sc = o.scale || b.scaling || { hp: 1, dmg: 1, reward: 1 };
  const base = { hp: e.base.hp, dmg: e.base.dmg, speed: e.base.speed, range: e.range ?? 1, rate: e.rate ?? 1, armor: e.params && e.params.armored ? e.params.armored.armor : 0 };
  const u = {
    uid: newUid(b), id: e.id, name: e.name, side: 'enemy', kind: 'enemy', tier: e.tier, traits: e.traits.slice(), tags: e.traits.slice(),
    flying: !!e.flying, boss: !!e.boss, x: o.x ?? fieldOf(b).edgeX, y: o.y ?? 0, level: 1, base, scale: { hp: sc.hp, dmg: sc.dmg },
    reward: e.base.reward * (sc.reward || 1), params: e.params, statuses: [], dead: false, mods: o.mods, on: o.on,
    phases: e.phases && e.phases.length ? e.phases : null, phaseIdx: 0,
    ability: e.ability ? { id: e.id + '_ability', every: e.ability.every, effect: e.ability.effect } : null,
  };
  initUnit(b, u);
  if (e.params && e.params.shielded) addStatus(b, u, { type: 'shield', amount: e.params.shielded.shield, max: e.params.shielded.shield, regen: e.params.shielded.regen, t: FOREVER, key: 'trait' });
  return u;
}

// ------------------------------------------------------------------------------------------------ targeting
/** Can attacker hit target? Flying needs range >= 2, or aoe/chain/pierce, or any card or spell (no attacker). */
export function canHit(b, attacker, target, kind, ctx) {
  if (!target.flying) return true;
  if (kind === 'aoe' || kind === 'chain' || kind === 'pierce') return true;
  if (!attacker || (ctx && ctx.fromCard) || (ctx && ctx.fromRelic)) return true;
  return computeStat(b, attacker, 'range') >= 2;
}
/** The cat with an active taunt that grabs this enemy (nearest such cat in radius), or null. */
export function tauntTarget(b, enemy) {
  let best = null, bd = 1e9;
  for (let i = 0; i < b.units.length; i++) {
    const c = b.units[i];
    if (c.dead || !c.statuses) continue;
    for (let j = 0; j < c.statuses.length; j++) {
      const s = c.statuses[j];
      if (s.type === 'taunt' && !s.gone) { const d = dist(c, enemy); if (d <= s.radius && d < bd) { bd = d; best = c; } }
    }
  }
  return best;
}
/** Basic attack target for a unit: taunt first, melee blocked by barricades, flying rule, range check. Null if none. */
export function pickAttackTarget(b, u) {
  const range = computeStat(b, u, 'range');
  const pool = poolOf(b, opp(u.side));
  if (u.side === 'enemy') {
    const t = tauntTarget(b, u);
    if (t && dist(t, u) <= range + 0.001) return t;
  }
  let best = null, bd = 1e9;
  for (let i = 0; i < pool.length; i++) {
    const t = pool[i];
    if (t.dead || t.untargetable || !canHit(b, u, t, 'hit')) continue;
    const d = dist(t, u);
    if (d <= range + 0.001 && d < bd) { bd = d; best = t; }
  }
  if (best && u.side === 'enemy' && range < 2 && !u.flying && best.kind !== 'barricade') {
    const dir = awayDir(b);
    let wall = null, wd = 1e9;
    for (let i = 0; i < b.units.length; i++) {
      const w = b.units[i];
      if (w.dead || w.kind !== 'barricade' || Math.abs(w.y - u.y) > 0.6) continue;
      // barricade is between the enemy and the target (enemy walks toward -dir)
      if ((u.x - w.x) * dir >= 0 && (w.x - best.x) * dir >= 0) { const d = dist(w, u); if (d < wd) { wd = d; wall = w; } }
    }
    if (wall && wd <= Math.max(range, 1.2)) return wall;
  }
  return best;
}

function sideOfCtx(caster, ctx) { return (ctx && ctx.side) || (caster && caster.side) || 'cat'; }
function eligible(u, friendly) {
  if (u.dead || !(u.hp > 0)) return false;
  if (friendly) return u.kind !== 'barricade';
  return !u.untargetable;
}

/** Resolve a placement (`at`) to {x,y}. */
export function resolvePoint(b, at, caster, ctx) {
  ctx = ctx || {};
  const f = fieldOf(b);
  const side = sideOfCtx(caster, ctx);
  const dir = facing(b, side);
  if (at === 'point' && ctx.point) return ctx.point;
  if (at === 'self' && caster) return caster;
  if (at === 'target') {
    if (ctx.target) return ctx.target;
    if (ctx.tile) return ctx.tile;
    const n = nearestOf(b, caster, ctx, false, 'aoe');
    if (n) return n;
    return caster || { x: f.baseX, y: (f.rows - 1) / 2 };
  }
  if (at === 'nearest') { const n = nearestOf(b, caster, ctx, false, 'aoe'); if (n) return n; }
  if (at === 'strongest') {
    let best = null;
    for (const e of poolOf(b, opp(side))) if (eligible(e, false) && (!best || e.hp > best.hp)) best = e;
    if (best) return best;
  }
  if (at === 'lane_ahead' && caster) return { x: caster.x + dir * 2.5, y: caster.y };
  // 'edge' is the entry edge of the enemy lanes for every caster (a boss calling its flock must not spawn them at the cat base)
  if (at === 'edge') return { x: f.edgeX, y: b.rng.int(0, Math.max(0, f.rows - 1)) };
  if (ctx.point) return ctx.point;
  if (caster) return caster;
  if (ctx.tile) return ctx.tile;
  return { x: f.baseX, y: (f.rows - 1) / 2 };
}
function nearestOf(b, caster, ctx, friendly, kind, farthest) {
  const side = sideOfCtx(caster, ctx);
  const pool = poolOf(b, friendly ? side : opp(side));
  const f = fieldOf(b);
  const ref = caster || ctx.tile || { x: f.baseX, y: (f.rows - 1) / 2 };
  let best = null, bd = farthest ? -1 : 1e9;
  for (let i = 0; i < pool.length; i++) {
    const u = pool[i];
    if (!eligible(u, friendly)) continue;
    if (!friendly && !canHit(b, caster, u, kind, ctx)) continue;
    if (friendly && u === caster) continue;
    const d = dist(u, ref);
    if (farthest ? d > bd : d < bd) { bd = d; best = u; }
  }
  return best;
}

/**
 * Choose the units an effect applies to. `selector` is a SELECTORS string or an effect object ({kind, to, n, radius, at}).
 * Perspective is the caster's side: harmful kinds pick the opposing side, FRIENDLY kinds (heal shield buff cleanse ...)
 * the caster's own side. ctx may hold {target, tile, point, side, fromCard, kind, friendly, n, radius, at}.
 * Returns a fresh array of live units (the base object for 'base').
 */
export function selectTargets(b, selector, caster, ctx) {
  fx(b);
  ctx = ctx || {};
  const eff = selector && typeof selector === 'object' ? selector : { to: selector };
  const kind = eff.kind || ctx.kind;
  const friendly = ctx.friendly !== undefined ? ctx.friendly : !!FRIENDLY[kind];
  const to = eff.to || (kind && DEFAULT_TO[kind]) || ctx.defaultTo || 'self';
  const side = sideOfCtx(caster, ctx);
  const poolSide = friendly ? side : opp(side);
  const pool = poolOf(b, poolSide);
  const n = eff.n !== undefined ? eff.n : (ctx.n !== undefined ? ctx.n : 1);
  const out = [];
  const hit = (u) => eligible(u, friendly) && (friendly || canHit(b, caster, u, kind, ctx));
  switch (to) {
    case 'self': if (caster && !caster.dead) out.push(caster); break;
    case 'base': out.push(baseUnit(b)); break;
    case 'target': {
      const t = ctx.target;
      if (t && t.isBase) { out.push(t); break; }
      if (t && t.side === poolSide && !t.dead && t.hp > 0) { out.push(t); break; }
      if (t && t.side !== poolSide && friendly && caster && !caster.dead) { out.push(caster); break; }
      if (friendly) { if (caster && !caster.dead) out.push(caster); break; }
      // harmful and no live target: nearest to the dead target's spot, else nearest to the caster
      const ref = t || null;
      let best = null, bd = 1e9;
      if (ref) {
        for (let i = 0; i < pool.length; i++) { const u = pool[i]; if (u === t || !hit(u)) continue; const d = dist(u, ref); if (d < bd) { bd = d; best = u; } }
      } else best = nearestOf(b, caster, ctx, false, kind);
      if (best) out.push(best);
      break;
    }
    case 'nearest': case 'farthest': {
      if (!friendly && side === 'enemy' && caster) {
        const tt = tauntTarget(b, caster);
        if (tt) { out.push(tt); break; }
      }
      const u = nearestOf(b, caster, ctx, friendly, kind, to === 'farthest');
      if (u) out.push(u);
      break;
    }
    case 'strongest': case 'weakest': {
      const arr = [];
      for (let i = 0; i < pool.length; i++) if (hit(pool[i])) arr.push(pool[i]);
      arr.sort(to === 'strongest' ? (p, q) => q.hp - p.hp || p.uid - q.uid : (p, q) => p.hp - q.hp || p.uid - q.uid);
      for (let i = 0; i < arr.length && i < n; i++) out.push(arr[i]);
      break;
    }
    case 'lowest_ally': {
      const own = poolOf(b, side);
      let best = null, br = 2;
      for (let i = 0; i < own.length; i++) {
        const u = own[i]; if (!eligible(u, true)) continue;
        const r = u.hp / u.maxHp;
        if (r < br) { br = r; best = u; }
      }
      if (best) out.push(best);
      break;
    }
    case 'random': {
      const arr = [];
      for (let i = 0; i < pool.length; i++) if (hit(pool[i])) arr.push(pool[i]);
      b.rng.shuffle(arr);
      for (let i = 0; i < arr.length && i < n; i++) out.push(arr[i]);
      break;
    }
    case 'all':
      for (let i = 0; i < pool.length; i++) if (hit(pool[i])) out.push(pool[i]);
      break;
    case 'radius': {
      const r = eff.radius !== undefined ? eff.radius : (ctx.radius !== undefined ? ctx.radius : 1);
      const at = eff.at || (ctx.point ? 'point' : (ctx.fromCard || !caster ? 'target' : 'self'));
      const c = resolvePoint(b, at, caster, ctx);
      for (let i = 0; i < pool.length; i++) {
        const u = pool[i];
        if (hit(u) && Math.hypot(u.x - c.x, u.y - c.y) <= r + 1e-9) out.push(u);
      }
      break;
    }
    default: break;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ amounts
/** spellPower(level) = (1 + 0.12 (level - 1)) times the relic spell_power mods (scope cards). */
export function spellPower(b, level) {
  const m = scopeMod(b, 'cards', 'spell_power');
  return (1 + 0.12 * ((level || 1) - 1)) * m.mult + m.add;
}
function flatScale(b, ctx) {
  const card = ctx.fromCard || ctx.fromRelic;
  const sf = ctx.stageFactor !== undefined ? ctx.stageFactor : (card ? (b.stageFactor ?? 1) : 1);
  return sf * (card ? spellPower(b, ctx.level || 1) : 1);
}
function amountOf(b, e, ctx) {
  if (e.mult !== undefined) {
    const base = ctx.source ? computeStat(b, ctx.source, 'dmg') : (ctx.baseDmg || 0);
    return e.mult * base;
  }
  if (e.amount !== undefined) return e.amount * flatScale(b, ctx);
  return 0;
}

// ------------------------------------------------------------------------------------------------ damage, heal, death
export function healUnit(b, target, amount, source, o) {
  if (!target || target.dead || amount <= 0) return 0;
  const room = target.maxHp - target.hp;
  const got = amount < room ? amount : room;
  if (got <= 0) return 0;
  target.hp += got;
  if (!(o && o.quiet)) emit(b, { type: 'heal', src: source ? source.uid : 0, tgt: target.uid, x: target.x, y: target.y, amount: got, base: !!target.isBase });
  return got;
}

/** Hit the base. Handles base_revive_once (base survives lethal at value * maxHp, once). Returns damage dealt. */
export function damageBase(b, amount, src, o) {
  const f = fx(b);
  const base = baseUnit(b);
  if (!(amount > 0) || base.hp <= 0) return 0;
  const before = base.hp;
  base.hp -= amount;
  if (base.hp <= 0) {
    const v = getRule(b, 'base_revive_once');
    if (v > 0 && !f.baseRevived) { f.baseRevived = true; base.hp = Math.max(1, base.maxHp * v); emit(b, { type: 'revive', base: true, hp: base.hp }); }
    else base.hp = 0;
  }
  const dealt = Math.min(amount, before);
  emit(b, { type: 'base_hit', src: src ? src.uid : 0, amount, hp: base.hp, x: base.x, y: base.y });
  fireTrigger(b, 'on_base_hit', { source: src, target: base, amount });
  return dealt;
}

/**
 * Deal damage. o: {kind:'hit'|'damage'|'chain'|'pierce'|'aoe'|'dot'|'reflect'|'trap', element, crit:'always'|'never',
 * noCrit, ignoreArmor, trueDamage}. Applies crit, armor, vuln, shields, lifesteal, reflect, triggers, death and boss
 * phases. Returns the hp actually removed (after armor and shields).
 */
export function damageUnit(b, src, tgt, amount, o) {
  o = o || {};
  const f = fx(b);
  if (!tgt || tgt.dead) return 0;
  if (tgt.isBase) return damageBase(b, amount, src, o);
  if (!(amount > 0) || tgt.untargetable) return 0;
  const kind = o.kind || 'hit';
  const element = o.element || 'phys';
  let amt = amount, crit = false;
  if (!o.noCrit && kind !== 'dot' && kind !== 'reflect') {
    if (o.crit === 'always') crit = true;
    else if (o.crit !== 'never' && src) { const c = computeStat(b, src, 'crit'); crit = c > 0 && b.rng.next() < c; }
    if (crit) amt *= src ? computeStat(b, src, 'critdmg') : 1.5;
  }
  if (!o.trueDamage) {
    if (!o.ignoreArmor) { const ar = computeStat(b, tgt, 'armor'); if (ar > 0) amt *= 1 - ar; }
    const v = vulnOf(b, tgt); if (v > 0) amt *= 1 + v;
  }
  let absorbed = 0;
  if (!o.trueDamage && tgt.statuses) {
    for (let i = 0; i < tgt.statuses.length && absorbed < amt; i++) {
      const s = tgt.statuses[i];
      if (s.type !== 'shield' || !(s.amount > 0)) continue;
      const take = Math.min(s.amount, amt - absorbed);
      s.amount -= take; absorbed += take;
    }
  }
  const dealt = amt - absorbed;
  tgt.hp -= dealt;
  tgt.lastHitAt = f.clock;
  const ev = { type: 'hit', src: src ? src.uid : 0, tgt: tgt.uid, x: tgt.x, y: tgt.y, amount: dealt, absorbed, crit, element, kind };
  if (kind === 'dot') ev.dot = true;
  emit(b, ev);
  if (crit) emit(b, { type: 'crit', src: ev.src, tgt: ev.tgt, x: ev.x, y: ev.y, amount: dealt, element });
  if (src && dealt > 0 && kind !== 'dot' && kind !== 'reflect') {
    const ls = computeStat(b, src, 'lifesteal');
    if (ls > 0) healUnit(b, src, dealt * ls, src);
  }
  if (src && dealt > 0 && (kind === 'hit' || kind === 'damage' || kind === 'pierce' || kind === 'chain') && src.side !== tgt.side) {
    let rp = computeStat(b, tgt, 'reflect');
    const s = tgt.statuses;
    if (s) for (let i = 0; i < s.length; i++) if (s[i].type === 'reflect' && !s[i].gone) rp += s[i].pct;
    if (rp > 0) {
      const back = dealt * rp;
      emit(b, { type: 'reflect', src: tgt.uid, tgt: src.uid, amount: back });
      damageUnit(b, tgt, src, back, { kind: 'reflect', element, noCrit: true, ignoreArmor: true });
    }
  }
  if (kind !== 'dot' && kind !== 'reflect') {
    fireTrigger(b, 'on_hit', { source: src, target: tgt, amount: dealt, crit });
    if (crit) fireTrigger(b, 'on_crit', { source: src, target: tgt, amount: dealt });
  }
  fireTrigger(b, 'on_damaged', { source: src, target: tgt, amount: dealt });
  if (tgt.hp <= 0) killUnit(b, tgt, src);
  else if (tgt.phases) checkPhases(b, tgt);
  return dealt;
}

/** Basic attack: the attacker's dmg stat as a 'hit'. Battle calls this when an attack lands. */
export function attack(b, attacker, target, o) {
  const amount = computeStat(b, attacker, 'dmg');
  return damageUnit(b, attacker, target, amount, Object.assign({ kind: 'hit', element: 'phys' }, o));
}

/** Kill a unit (marks dead, emits death, fires on_kill / on_ally_death, hooks.onDeath). opts.force skips cat_revive_once. */
export function killUnit(b, u, killer, opts) {
  const f = fx(b);
  if (u.dead) return false;
  if (u.isBase) { u.hp = 0; return true; }
  const force = opts && opts.force;
  if (!force && u.kind === 'cat' && !u.revivedOnce) {
    const v = getRule(b, 'cat_revive_once');
    if (v > 0) { u.revivedOnce = true; u.hp = Math.max(1, u.maxHp * v); emit(b, { type: 'revive', tgt: u.uid, x: u.x, y: u.y }); return false; }
  }
  u.dead = true; u.hp = 0;
  emit(b, { type: 'death', uid: u.uid, id: u.id, side: u.side, kind: u.kind, x: u.x, y: u.y, boss: !!u.boss, expired: !!(opts && opts.expired), killer: killer ? killer.uid : 0 });
  if (u.kind === 'cat') f.fallen.push(u);
  if (!(opts && opts.silent)) {
    if (b.hooks && b.hooks.onDeath) b.hooks.onDeath(b, u, killer || null);
    fireTrigger(b, 'on_death', { source: killer, target: u, unit: u });
    if (u.side === 'enemy') fireTrigger(b, 'on_kill', { source: killer, target: u });
    else if (u.kind === 'cat') fireTrigger(b, 'on_ally_death', { source: killer, target: u });
  }
  return true;
}

/** Remove dead units from b.units and b.enemies in place. Cats stay in fx.fallen for revive. */
export function sweepDead(b) {
  for (const arr of [b.units, b.enemies]) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) { const u = arr[i]; if (!u.dead) arr[w++] = u; }
    arr.length = w;
  }
}

/** Boss phases: when hp first drops to a phase's `at` fraction, run its effect once and apply its mods. Auto on damage. */
export function checkPhases(b, u) {
  const ph = u.phases; if (!ph) return;
  while (u.phaseIdx + 1 < ph.length && u.hp / u.maxHp <= ph[u.phaseIdx + 1].at) {
    const p = ph[++u.phaseIdx];
    emit(b, { type: 'wave', name: p.name, boss: u.uid, phase: u.phaseIdx, x: u.x, y: u.y });
    if (p.mods) {
      const pm = u.phaseMods || (u.phaseMods = { speedMult: 1, dmgMult: 1, armorAdd: 0 });
      if (p.mods.speedMult) pm.speedMult *= p.mods.speedMult;
      if (p.mods.dmgMult) pm.dmgMult *= p.mods.dmgMult;
      if (p.mods.armorAdd) pm.armorAdd += p.mods.armorAdd;
    }
    if (p.effect) applyEffect(b, p.effect, { source: u, side: u.side, level: 1, stageFactor: 1 });
  }
}

// ------------------------------------------------------------------------------------------------ rules and rewards
const STATE_RULES = ['start_energy_add', 'energy_cap_add', 'hand_size_add', 'base_hp_pct'];
function applyStateRules(b) {
  const f = fx(b);
  const base = baseUnit(b);
  if (!f.baseMaxHp0) f.baseMaxHp0 = base.maxHp;
  for (const r of STATE_RULES) {
    const total = getRule(b, r);
    const prev = f.applied[r] || 0;
    const d = total - prev;
    if (d === 0) continue;
    f.applied[r] = total;
    if (r === 'start_energy_add') b.energy = Math.min((b.energyCap ?? 10) + 99, (b.energy || 0) + d);
    else if (r === 'energy_cap_add') b.energyCap = (b.energyCap ?? 10) + d;
    else if (r === 'hand_size_add') b.handSize = (b.handSize ?? 5) + d;
    else if (r === 'base_hp_pct') {
      const bm = scopeMod(b, 'base', 'hp');
      const nm = Math.round((f.baseMaxHp0 * (1 + total)) * bm.mult + bm.add);
      const dm = nm - base.maxHp;
      base.maxHp = nm; if (dm > 0) base.hp += dm; else if (base.hp > nm) base.hp = nm;
    }
  }
}
/**
 * Call once after the battle state exists and before the first step. Builds relic mods, applies the state changing rules
 * (start energy, energy cap, hand size, base hp), applies scope base hp mods and re-syncs every unit's max hp.
 * Idempotent: calling again with the same relics changes nothing. Returns relicMods(b).
 */
export function applyRelicRules(b) {
  const f = fx(b);
  const m = relicMods(b, true);
  const base = baseUnit(b);
  if (!f.baseMaxHp0) {
    f.baseMaxHp0 = base.maxHp;
    const bm = scopeMod(b, 'base', 'hp');
    if (bm.mult !== 1 || bm.add !== 0) {
      const nm = Math.round(base.maxHp * bm.mult + bm.add);
      base.hp += nm - base.maxHp; base.maxHp = nm;
    }
  }
  applyStateRules(b);
  for (const u of b.units) syncMaxHp(b, u);
  for (const u of b.enemies) syncMaxHp(b, u);
  return m;
}
/** Set a battle-wide rule (the battle_rule kind). Combines with relic rules; state rules apply their delta now. */
export function applyRule(b, rule, value) {
  const f = fx(b);
  const cur = f.battleRules[rule];
  f.battleRules[rule] = cur === undefined ? ruleCombine(rule, ruleIdentity(rule), value) : ruleCombine(rule, cur, value);
  applyStateRules(b);
  emit(b, { type: 'rule', rule, value });
}
/** Energy per second given the base regen (deck.energyRegen): base * energy_regen_mult + energy_regen_add. */
export function energyRegenRate(b, baseRegen) { return baseRegen * getRule(b, 'energy_regen_mult') + getRule(b, 'energy_regen_add'); }
/** Card cost after cost_add mods and first_card_free (first card of the battle costs 0). */
export function cardCost(b, card) {
  const f = fx(b);
  if (f.cardsPlayed === 0 && getRule(b, 'first_card_free') > 0) return 0;
  const m = scopeMod(b, 'cards', 'cost_add');
  const c = card.cost * m.mult + m.add;
  return c < 0 ? 0 : Math.round(c);
}
/** Battle reward modifiers: {fish:{mult,flat}, yarn:{mult,flat}, xp:{mult}, dropRate:{mult,add}}. Multiply the base reward by mult, then add flat. */
export function rewardMods(b) {
  const f = fx(b);
  const rp = getRule(b, 'reward_pct');
  const out = {};
  for (const r of ['fish', 'yarn']) {
    const em = economyMod(b, r);
    out[r] = { mult: (em.mult + em.add) * (1 + f.reward[r].pct) * (1 + rp), flat: f.reward[r].flat };
  }
  const xp = economyMod(b, 'xp'); out.xp = { mult: xp.mult + xp.add };
  const dr = economyMod(b, 'drop_rate'); out.dropRate = { mult: dr.mult, add: dr.add };
  return out;
}

// ------------------------------------------------------------------------------------------------ triggers
function filterOk(ev, name, p) {
  const flt = ev.filter; if (!flt) return true;
  const subj = (name === 'on_summon' || name === 'on_ally_death') ? p.target : p.source;
  if (flt.role && (!subj || subj.role !== flt.role)) return false;
  if (flt.tag && (!subj || !subj.tags || subj.tags.indexOf(flt.tag) < 0)) return false;
  if (flt.cardType && (!p.card || p.card.type !== flt.cardType)) return false;
  return true;
}
function sideGate(name, p) {
  const s = p.source, t = p.target;
  switch (name) {
    case 'on_kill': return !!t && t.side === 'enemy' && (!s || s.side === 'cat');
    case 'on_hit': case 'on_crit': return !s || s.side === 'cat';
    case 'on_cast': return !s || s.side === 'cat';
    case 'on_ally_death': return !!t && t.side === 'cat';
    case 'on_summon': return !!t && t.side === 'cat';
    default: return true;
  }
}
/**
 * Fire a trigger. Names: the TRIGGERS of validate.js (on_kill on_hit on_crit on_cast on_summon on_play_card on_wave_start
 * on_battle_start on_base_hit on_ally_death) plus unit local on_death and on_damaged. payload: {source, target, amount, crit,
 * card, tile, wave}. Relic on_event effects run with ctx.source = payload.source (the actor), ctx.target = payload.target.
 * Unit listeners (unit.on) run when the unit is the source (on_kill on_hit on_crit on_cast) or the target (on_death
 * on_damaged on_summon). Returns the number of effects run. Nested triggers stop at depth 3.
 */
export function fireTrigger(b, name, payload) {
  const f = fx(b);
  if (f.depth >= MAX_DEPTH) return 0;
  const p = payload || {};
  let ran = 0;
  f.depth++;
  try {
    const evs = relicMods(b).events;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (ev.trigger !== name || !sideGate(name, p) || !filterOk(ev, name, p)) continue;
      if (ev.cooldown && (f.relicCd[ev.key] || 0) > f.clock) continue;
      if (ev.chance !== undefined && !(b.rng.next() < ev.chance)) continue;
      if (ev.cooldown) f.relicCd[ev.key] = f.clock + ev.cooldown;
      applyEffect(b, ev.effect, { source: p.source || null, target: p.target, tile: p.tile, side: 'cat', level: 1, fromRelic: true, relic: ev.src, key: 'relic:' + ev.key });
      ran++;
    }
    const listeners = name === 'on_death' || name === 'on_damaged' || name === 'on_summon' ? p.target : p.source;
    if (listeners && listeners.on) {
      for (const ev of listeners.on) {
        if (ev.trigger !== name || !filterOk(ev, name, p)) continue;
        if (ev.chance !== undefined && !(b.rng.next() < ev.chance)) continue;
        applyEffect(b, ev.effect, { source: listeners, target: name === 'on_death' ? p.source : p.target, side: listeners.side, level: 1 });
        ran++;
      }
    }
  } finally { f.depth--; }
  return ran;
}

// ------------------------------------------------------------------------------------------------ applyEffect
function result() { return { ok: true, targets: [], amount: 0, kills: 0 }; }
function keyOf(ctx) {
  if (ctx.key) return ctx.key;
  if (ctx.card) return 'card:' + ctx.card.id;
  return ctx.source ? ctx.source.uid + ':' + (ctx.source.ability ? ctx.source.ability.id : '') : 'x';
}
function dpsOf(b, e, ctx) {
  if (e.dps < 5 && ctx.source) return e.dps * computeStat(b, ctx.source, 'dmg');
  if (e.dps < 5 && ctx.baseDmg) return e.dps * ctx.baseDmg;
  return e.dps * flatScale(b, ctx);
}
function buffDuration(b, d, target, ctx) {
  if (target.side === 'cat' && (ctx.side || 'cat') === 'cat') return d * getRule(b, 'buff_duration_mult');
  return d;
}
function moveTo(u, x, y) { u.x = x; u.y = y; }
function clampX(b, x) { const f = fieldOf(b); return Math.min(Math.max(f.baseX, f.edgeX), Math.max(Math.min(f.baseX, f.edgeX), x)); }

function applyBuffLike(b, e, ctx, r, type) {
  const targets = selectTargets(b, e, ctx.source, ctx);
  const key = keyOf(ctx);
  for (const t of targets) {
    let dur = e.duration;
    if (type === 'buff') dur = buffDuration(b, dur, t, ctx);
    let st = null;
    const arr = t.statuses;
    for (let i = 0; i < arr.length; i++) { const s = arr[i]; if (s.type === type && s.stat === e.stat && s.key === key && !s.gone) { st = s; break; } }
    if (st) { st.pct = e.pct; if (dur > st.t) st.t = dur; }
    else addStatus(b, t, { type, stat: e.stat, pct: e.pct, t: dur, key, src: ctx.source ? ctx.source.uid : 0 });
    if (e.stat === 'hp') syncMaxHp(b, t);
    statusEvent(b, t, type, { stat: e.stat, pct: e.pct, dur });
    r.targets.push(t);
  }
}

const KINDS = {
  damage(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    const amt = amountOf(b, e, ctx);
    for (const t of targets) {
      const d = damageUnit(b, ctx.source, t, amt, { kind: 'damage', element: e.element, crit: e.crit });
      r.amount += d; r.targets.push(t); if (t.dead) r.kills++;
    }
  },
  chain(b, e, ctx, r) {
    const src = ctx.source;
    let jumps = e.jumps + (src ? computeStat(b, src, 'chain_jumps') : 0);
    const first = selectTargets(b, { kind: 'chain', to: e.to }, src, ctx)[0];
    if (!first) return;
    const amt = amountOf(b, e, ctx);
    const fall = e.falloff || 0;
    const range = e.range !== undefined ? e.range : 2;
    const hitSet = new Set();
    const path = [{ x: src ? src.x : first.x, y: src ? src.y : first.y }];
    let cur = first;
    const side = sideOfCtx(src, ctx);
    const pool = poolOf(b, opp(side));
    for (let i = 0; i <= jumps && cur; i++) {
      hitSet.add(cur);
      path.push({ x: cur.x, y: cur.y });
      const d = damageUnit(b, src, cur, amt * Math.pow(1 - fall, i), { kind: 'chain', element: e.element, crit: e.crit });
      r.amount += d; r.targets.push(cur); if (cur.dead) r.kills++;
      let nxt = null, bd = 1e9;
      for (let k = 0; k < pool.length; k++) {
        const u = pool[k];
        if (hitSet.has(u) || u.dead || u.untargetable) continue;
        const dd = dist(u, cur);
        if (dd <= range && dd < bd) { bd = dd; nxt = u; }
      }
      cur = nxt;
    }
    emit(b, { type: 'chain', path, element: e.element || 'phys', src: src ? src.uid : 0 });
  },
  pierce(b, e, ctx, r) {
    const src = ctx.source;
    const side = sideOfCtx(src, ctx);
    const dir = facing(b, side);
    const f = fieldOf(b);
    const ox = src ? src.x : f.baseX;
    const lane = ctx.target ? ctx.target.y : (ctx.tile ? ctx.tile.y : (src ? src.y : 0));
    const pool = poolOf(b, opp(side));
    const arr = [];
    for (let i = 0; i < pool.length; i++) {
      const u = pool[i];
      if (u.dead || u.untargetable || Math.abs(u.y - lane) >= 0.5) continue;
      if ((u.x - ox) * dir < -0.01) continue;
      arr.push(u);
    }
    arr.sort((p, q) => Math.abs(p.x - ox) - Math.abs(q.x - ox) || p.uid - q.uid);
    const count = e.count !== undefined ? e.count : 1;
    const amt = amountOf(b, e, ctx);
    let far = ox;
    for (let i = 0; i < arr.length && i < count; i++) {
      const d = damageUnit(b, src, arr[i], amt, { kind: 'pierce', element: e.element, crit: e.crit });
      r.amount += d; r.targets.push(arr[i]); if (arr[i].dead) r.kills++;
      far = arr[i].x;
    }
    emit(b, { type: 'pierce', x1: ox, y1: lane, x2: arr.length ? far : ox + dir * 6, y2: lane, element: e.element || 'phys', src: src ? src.uid : 0 });
  },
  aoe(b, e, ctx, r) {
    const src = ctx.source;
    const side = sideOfCtx(src, ctx);
    const c = resolvePoint(b, e.at || (ctx.point ? 'point' : (ctx.fromCard || !src ? 'target' : 'self')), src, ctx);
    const amt = amountOf(b, e, ctx);
    emit(b, { type: 'aoe', x: c.x, y: c.y, radius: e.radius, element: e.element || 'phys' });
    const pool = poolOf(b, opp(side));
    for (let i = 0; i < pool.length; i++) {
      const u = pool[i];
      if (u.dead || u.untargetable || Math.hypot(u.x - c.x, u.y - c.y) > e.radius + 1e-9) continue;
      const d = damageUnit(b, src, u, amt, { kind: 'aoe', element: e.element, crit: e.crit });
      r.amount += d; r.targets.push(u); if (u.dead) r.kills++;
    }
  },
  heal(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) {
      const amt = e.pct !== undefined ? e.pct * t.maxHp : e.amount * flatScale(b, ctx);
      r.amount += healUnit(b, t, amt, ctx.source); r.targets.push(t);
    }
  },
  shield(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) {
      if (t.isBase) continue;
      const amt = e.pct !== undefined ? e.pct * t.maxHp : e.amount * flatScale(b, ctx);
      addStatus(b, t, { type: 'shield', amount: amt, max: amt, t: e.duration > 0 ? e.duration : FOREVER, key: keyOf(ctx) });
      emit(b, { type: 'shield', tgt: t.uid, x: t.x, y: t.y, amount: amt });
      r.amount += amt; r.targets.push(t);
    }
  },
  buff(b, e, ctx, r) { applyBuffLike(b, e, ctx, r, 'buff'); },
  debuff(b, e, ctx, r) { applyBuffLike(b, e, ctx, r, 'debuff'); },
  stun(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) {
      if (t.isBase) continue;
      const dur = t.boss ? e.duration * 0.5 : e.duration;
      let st = null;
      for (let i = 0; i < t.statuses.length; i++) if (t.statuses[i].type === 'stun' && !t.statuses[i].gone) { st = t.statuses[i]; break; }
      if (st) { if (dur > st.t) st.t = dur; } else addStatus(b, t, { type: 'stun', t: dur });
      statusEvent(b, t, 'stun', { dur });
      r.targets.push(t);
    }
  },
  dot(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    const dps = dpsOf(b, e, ctx);
    const el = e.element || 'phys';
    const sid = ctx.source ? ctx.source.uid : 0;
    for (const t of targets) {
      if (t.isBase) continue;
      let st = null;
      for (let i = 0; i < t.statuses.length; i++) { const s = t.statuses[i]; if (s.type === 'dot' && s.element === el && s.src === sid && !s.gone) { st = s; break; } }
      if (st) { st.dps = dps; st.t = e.duration; } else addStatus(b, t, { type: 'dot', element: el, dps, t: e.duration, acc: 0, src: sid, srcUnit: ctx.source || null });
      statusEvent(b, t, 'dot', { element: el, dps });
      r.targets.push(t);
    }
  },
  taunt(b, e, ctx, r) {
    const src = ctx.source; if (!src) return;
    addStatus(b, src, { type: 'taunt', radius: e.radius, t: e.duration, key: keyOf(ctx) });
    emit(b, { type: 'taunt', src: src.uid, x: src.x, y: src.y, radius: e.radius, dur: e.duration });
    r.targets.push(src);
  },
  reflect(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) {
      addStatus(b, t, { type: 'reflect', pct: e.pct, t: e.duration, key: keyOf(ctx) });
      statusEvent(b, t, 'reflect', { pct: e.pct });
      r.targets.push(t);
    }
  },
  knockback(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) {
      if (t.isBase) continue;
      const tiles = t.boss ? e.tiles * 0.5 : e.tiles;
      const dirT = t.side === 'enemy' ? awayDir(b) : -awayDir(b);
      const x0 = t.x;
      t.x = clampX(b, t.x + dirT * tiles);
      emit(b, { type: 'knockback', tgt: t.uid, x0, x1: t.x, y: t.y });
      r.targets.push(t);
    }
  },
  pull(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    const src = ctx.source;
    const c = resolvePoint(b, e.at === 'target' ? 'target' : 'self', src, ctx);
    for (const t of targets) {
      if (t.isBase || (t.flying && e.tiles < 1)) continue;
      const d = Math.hypot(c.x - t.x, c.y - t.y);
      if (d < 1e-6) continue;
      const m = Math.min(e.tiles, d);
      const x0 = t.x, y0 = t.y;
      moveTo(t, t.x + (c.x - t.x) / d * m, t.y + (c.y - t.y) / d * m);
      emit(b, { type: 'pull', tgt: t.uid, x0, y0, x1: t.x, y1: t.y });
      r.targets.push(t);
    }
  },
  execute(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) {
      if (t.isBase) continue;
      if (!t.boss && t.hp / t.maxHp <= e.threshold) {
        emit(b, { type: 'execute', tgt: t.uid, x: t.x, y: t.y, killed: true });
        damageUnit(b, ctx.source, t, t.hp + 1, { kind: 'damage', trueDamage: true, noCrit: true });
        r.kills++;
      } else if (e.bossAmount !== undefined && t.boss) {
        emit(b, { type: 'execute', tgt: t.uid, x: t.x, y: t.y, killed: false });
        const d = damageUnit(b, ctx.source, t, e.bossAmount * flatScale(b, ctx), { kind: 'damage', noCrit: true });
        r.amount += d; if (t.dead) r.kills++;
      } else emit(b, { type: 'execute', tgt: t.uid, x: t.x, y: t.y, killed: false, fizzle: true });
      r.targets.push(t);
    }
  },
  cleanse(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) {
      if (t.isBase) continue;
      const n = removeStatuses(t, (s) => s.type === 'stun' || s.type === 'dot' || s.type === 'debuff');
      if (n) { emit(b, { type: 'cleanse', tgt: t.uid, x: t.x, y: t.y, removed: n }); syncMaxHp(b, t); }
      r.targets.push(t);
    }
  },
  revive(b, e, ctx, r) {
    const f = fx(b);
    let n = e.n;
    while (n > 0 && f.fallen.length) {
      const u = f.fallen.pop();
      if (!u.dead) continue;
      u.dead = false; u.revivedOnce = u.revivedOnce || false;
      u.statuses = [];
      syncMaxHp(b, u);
      u.hp = Math.max(1, u.maxHp * e.hpPct);
      if (u.ability) u.cd = computeStat(b, u, 'cooldown') * 0.5;
      if (b.units.indexOf(u) < 0) b.units.push(u);
      emit(b, { type: 'revive', tgt: u.uid, x: u.x, y: u.y });
      r.targets.push(u); n--;
    }
  },
  energy(b, e, ctx, r) {
    if (sideOfCtx(ctx.source, ctx) !== 'cat') return;
    const cap = b.energyCap ?? 10;
    const before = b.energy || 0;
    b.energy = Math.min(cap, before + e.amount);
    r.amount = b.energy - before;
    emit(b, { type: 'energy', amount: e.amount, energy: b.energy });
  },
  draw(b, e, ctx, r) {
    if (b.hooks && b.hooks.draw) { b.hooks.draw(b, e.count); }
    else defaultDraw(b, e.count);
    emit(b, { type: 'draw', count: e.count });
    r.amount = e.count;
  },
  spawn(b, e, ctx, r) {
    const f = fieldOf(b);
    const side = sideOfCtx(ctx.source, ctx);
    const anchor = ctx.source || ctx.target || ctx.tile || { x: f.baseX, y: 0 };
    const dir = facing(b, side);
    const m = e.minion;
    const scale = flatScale(b, ctx);
    for (let i = 0; i < e.count; i++) {
      const u = {
        uid: newUid(b), id: 'minion_' + String(m.name || 'minion').toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: m.name, side, kind: 'minion',
        tags: ['minion'], x: anchor.x + dir * 0.8 * (i + 1), y: anchor.y, level: 1, flying: false, boss: false,
        base: { hp: m.hp * scale, dmg: m.dmg * scale, range: m.range ?? 1, rate: m.rate ?? 1, speed: m.speed ?? 0 },
        life: m.duration, statuses: [], dead: false,
      };
      initUnit(b, u);
      if (m.taunt) addStatus(b, u, { type: 'taunt', radius: 3, t: FOREVER, key: 'minion' });
      poolOf(b, side).push(u);
      emit(b, { type: 'spawn', uid: u.uid, id: u.id, x: u.x, y: u.y, side, minion: true });
      r.targets.push(u);
    }
  },
  summon(b, e, ctx, r) {
    const f = fieldOf(b);
    const tile = ctx.tile || (ctx.target && !ctx.target.dead ? ctx.target : null) || { x: f.baseX + 1, y: 0 };
    const pc = b.profile && b.profile.cats && b.profile.cats[e.cat];
    const level = e.level ?? ctx.catLevel ?? (pc && pc.level) ?? 1;
    let u;
    if (b.hooks && b.hooks.summonCat) u = b.hooks.summonCat(b, e.cat, level, tile, ctx);
    else {
      u = createCatUnit(b, e.cat, { level, stars: ctx.catStars, x: tile.x, y: tile.y });
      b.units.push(u);
    }
    if (!u) return;
    emit(b, { type: 'spawn', uid: u.uid, id: u.id, x: u.x, y: u.y, side: 'cat' });
    r.targets.push(u);
    fireTrigger(b, 'on_summon', { source: null, target: u });
  },
  spawn_enemies(b, e, ctx, r) {
    const f = fx(b);
    const src = ctx.source;
    const side = sideOfCtx(src, ctx);
    for (let i = 0; i < e.count; i++) {
      const p = resolvePoint(b, e.at || 'edge', src, ctx);
      f.queue.push({ at: f.clock + i * 0.3, enemy: e.enemy, x: p.x, y: p.y, side });
    }
    flushQueue(b);
  },
  trap(b, e, ctx, r) {
    const f = fx(b);
    const src = ctx.source;
    const side = sideOfCtx(src, ctx);
    const dir = facing(b, side);
    const p0 = resolvePoint(b, e.at || (ctx.fromCard || !src ? 'target' : 'self'), src, ctx);
    const count = e.count || 1;
    const charges = e.charges + getRule(b, 'trap_charges_add');
    const hitsFlyers = nestedAoeWide(e.effect);
    for (let k = 0; k < count; k++) {
      const tr = {
        uid: newUid(b), x: p0.x + (e.at === 'lane_ahead' ? dir * k : 0), y: p0.y, radius: e.radius, charges, effect: e.effect,
        life: e.duration !== undefined && e.duration > 0 ? e.duration : 60, src, side, hit: [], cd: 0, hitsFlyers,
        ctx: { level: ctx.level, stageFactor: ctx.stageFactor, fromCard: ctx.fromCard, card: ctx.card, baseDmg: src ? computeStat(b, src, 'dmg') : ctx.baseDmg, catLevel: ctx.catLevel },
      };
      if (count > 1 && e.at !== 'lane_ahead') tr.x += (k - (count - 1) / 2) * 0.8;
      f.traps.push(tr);
      emit(b, { type: 'trap_set', uid: tr.uid, x: tr.x, y: tr.y, radius: tr.radius, charges });
      r.amount++;
    }
  },
  barricade(b, e, ctx, r) {
    const f = fieldOf(b);
    const side = sideOfCtx(ctx.source, ctx);
    const p = ctx.tile || ctx.point || (ctx.source ? { x: ctx.source.x + facing(b, side), y: ctx.source.y } : { x: f.baseX + 2, y: 0 });
    const hp = e.hp * flatScale(b, ctx);
    const u = { uid: newUid(b), id: 'barricade', name: 'Barricade', side, kind: 'barricade', tags: ['barricade'], x: p.x, y: p.y, level: 1, base: { hp, dmg: 0, range: 0, rate: 1, speed: 0 }, life: e.duration > 0 ? e.duration : 30, statuses: [], dead: false };
    initUnit(b, u);
    poolOf(b, side).push(u);
    emit(b, { type: 'barricade', uid: u.uid, x: u.x, y: u.y, hp: u.hp });
    r.targets.push(u);
  },
  aura(b, e, ctx, r) {
    const f = fx(b);
    const src = ctx.source;
    const fl = fieldOf(b);
    const p = ctx.tile || ctx.point || (src ? { x: src.x, y: src.y } : { x: fl.baseX, y: (fl.rows - 1) / 2 });
    let anchor = null;
    if (e.duration === 0 && ctx.tile) {
      for (const c of b.units) if (!c.dead && c.kind === 'cat' && Math.hypot(c.x - p.x, c.y - p.y) <= 0.6) { anchor = c; break; }
    }
    const a = {
      uid: newUid(b), x: p.x, y: p.y, radius: e.radius, interval: e.interval, left: 0, life: e.duration > 0 ? e.duration : FOREVER, effect: e.effect, anchor, side: sideOfCtx(src, ctx),
      ctx: { level: ctx.level, stageFactor: ctx.stageFactor, fromCard: ctx.fromCard !== undefined ? ctx.fromCard : true, card: ctx.card },
    };
    f.auras.push(a);
    emit(b, { type: 'aura', uid: a.uid, x: a.x, y: a.y, radius: a.radius });
    fireAura(b, a);
    a.left = a.interval;
    r.amount++;
  },
  battle_rule(b, e, ctx, r) { applyRule(b, e.rule, e.value); },
  reward_mult(b, e, ctx, r) {
    const f = fx(b);
    const rw = f.reward[e.resource];
    if (e.pct !== undefined) rw.pct += e.pct;
    if (e.flat !== undefined) rw.flat += e.flat;
    emit(b, { type: 'reward', resource: e.resource, pct: e.pct, flat: e.flat });
  },
  reset_cooldown(b, e, ctx, r) {
    const targets = selectTargets(b, e, ctx.source, ctx);
    for (const t of targets) { if (t.ability) { t.cd = 0; r.targets.push(t); } }
  },
  multi(b, e, ctx, r) {
    for (const s of e.steps) {
      const rr = applyEffect(b, s, ctx);
      r.amount += rr.amount; r.kills += rr.kills;
      for (const t of rr.targets) r.targets.push(t);
    }
  },
};
function nestedAoeWide(e) {
  if (!e) return false;
  if (e.kind === 'aoe' && e.radius >= 1.5) return true;
  if (e.kind === 'multi') return e.steps.some(nestedAoeWide);
  return false;
}
function defaultDraw(b, n) {
  if (!b.hand) b.hand = [];
  if (!b.draw) b.draw = [];
  if (!b.discard) b.discard = [];
  const max = b.handMax ?? 10;
  for (let i = 0; i < n; i++) {
    if (!b.draw.length) {
      if (!b.discard.length) return;
      b.draw = b.rng.shuffle(b.discard.splice(0));
    }
    const c = b.draw.pop();
    if (b.hand.length < max) b.hand.push(c); else b.discard.push(c);
  }
}

/**
 * Apply one effect. ctx = {source, target, level, stageFactor, tile, ...}:
 *   source       the acting unit (null for cards, traps of cards, auras)
 *   target       thing aimed at (unit), tile {x,y} for tile and lane cards
 *   level        card level (spellPower), stageFactor the refScale for flat amounts (default b.stageFactor or 1)
 *   side         'cat'|'enemy' perspective when there is no source (default 'cat')
 *   fromCard, fromRelic   flat amounts get spellPower and stageFactor (cat and enemy mult based amounts do not)
 *   catLevel     level for the summon kind (default profile level), baseDmg dmg for mult when there is no source
 * Returns {ok, targets:[units], amount, kills}. Unknown kinds return {ok:false}.
 */
export function applyEffect(b, effect, ctx) {
  fx(b);
  const fn = effect ? KINDS[effect.kind] : null;
  if (!fn) return { ok: false, targets: [], amount: 0, kills: 0, reason: 'unknown kind ' + (effect && effect.kind) };
  const c = ctx || {};
  const r = result();
  fn(b, effect, c, r);
  return r;
}

// ------------------------------------------------------------------------------------------------ casting helpers
/** Cast a unit's ability: resets its cooldown first, runs the effect (ability_echo may repeat it), then on_cast. */
export function castAbility(b, u, ctx) {
  const ab = u.ability;
  if (!ab || !ab.effect) return false;
  const c = Object.assign({ source: u, side: u.side, level: 1 }, ctx);
  c.source = u;
  u.cd = computeStat(b, u, 'cooldown');
  emit(b, { type: 'cast', src: u.uid, id: ab.id, name: ab.name || ab.id, x: u.x, y: u.y });
  applyEffect(b, ab.effect, c);
  if (u.side === 'cat') {
    const p = getRule(b, 'ability_echo');
    if (p > 0 && b.rng.next() < p) {
      emit(b, { type: 'cast', src: u.uid, id: ab.id, name: ab.name || ab.id, echo: true, x: u.x, y: u.y });
      applyEffect(b, ab.effect, c);
    }
  }
  fireTrigger(b, 'on_cast', { source: u, target: c.target });
  return true;
}
/**
 * Play a card's effect (battle.js pays energy and moves the card first; use cardCost for the price). ctx:
 * {level (card level), stageFactor, tile, target, catLevel}. Spells may echo (spell_echo). Fires on_play_card.
 */
export function playCardEffect(b, card, ctx) {
  const f = fx(b);
  const c = Object.assign({ side: 'cat', level: 1, source: null }, ctx);
  c.fromCard = true; c.card = card;
  if (c.stageFactor === undefined) c.stageFactor = b.stageFactor ?? 1;
  emit(b, { type: 'cast', card: card.id, name: card.name, cardType: card.type, x: c.tile ? c.tile.x : 0, y: c.tile ? c.tile.y : 0 });
  const r = applyEffect(b, card.effect, c);
  if (card.type === 'spell') {
    const p = getRule(b, 'spell_echo');
    if (p > 0 && b.rng.next() < p) {
      emit(b, { type: 'cast', card: card.id, name: card.name, cardType: card.type, echo: true });
      applyEffect(b, card.effect, c);
    }
  }
  f.cardsPlayed++;
  fireTrigger(b, 'on_play_card', { card, tile: c.tile, target: c.target });
  return r;
}

// ------------------------------------------------------------------------------------------------ ticking
function flushQueue(b) {
  const f = fx(b);
  const q = f.queue;
  let w = 0;
  for (let i = 0; i < q.length; i++) {
    const it = q[i];
    if (it.at <= f.clock + 1e-9) {
      let u;
      if (b.hooks && b.hooks.spawnEnemy) u = b.hooks.spawnEnemy(b, it.enemy, it.x, it.y, it);
      else { u = createEnemyUnit(b, it.enemy, { x: it.x, y: it.y }); poolOf(b, it.side).push(u); }
      if (u) emit(b, { type: 'spawn', uid: u.uid, id: u.id, x: u.x, y: u.y, side: it.side });
    } else q[w++] = it;
  }
  q.length = w;
}
function fireAura(b, a) {
  const ctx = { source: null, side: a.side, point: { x: a.x, y: a.y }, tile: { x: a.x, y: a.y }, level: a.ctx.level, stageFactor: a.ctx.stageFactor, fromCard: a.ctx.fromCard, card: a.ctx.card, key: 'aura' + a.uid };
  applyEffect(b, a.effect, ctx);
}
function tickUnit(b, u, dt, f) {
  const reg = computeStat(b, u, 'regen');
  if (reg > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + reg * u.maxHp * dt);
  if (u.life !== undefined) {
    u.life -= dt;
    if (u.life <= 0) { killUnit(b, u, null, { expired: true, silent: true, force: true }); return; }
  }
  const s = u.statuses;
  if (!s || !s.length) return;
  const n = s.length;
  let gone = false, resync = false;
  for (let i = 0; i < n; i++) {
    const st = s[i];
    if (st.gone) { gone = true; continue; }
    st.t -= dt;
    if (st.type === 'dot') {
      st.acc += dt;
      while (st.acc >= TICK - 1e-9 && !u.dead) {
        st.acc -= TICK;
        damageUnit(b, st.srcUnit, u, st.dps * TICK, { kind: 'dot', element: st.element, noCrit: true, ignoreArmor: true });
      }
    } else if (st.type === 'shield' && st.regen && st.amount < st.max && f.clock - (u.lastHitAt === undefined ? -99 : u.lastHitAt) >= 3) {
      st.amount = Math.min(st.max, st.amount + st.regen * dt);
    }
    if (st.t <= 0 || (st.type === 'shield' && st.amount <= 0 && !st.regen)) { st.gone = true; gone = true; if (st.stat === 'hp') resync = true; }
    if (u.dead) break;
  }
  if (gone) removeStatuses(u, (x) => x.gone);
  if (resync && !u.dead) syncMaxHp(b, u);
}
/**
 * Advance statuses and timed things by dt seconds (call once per battle step): dots, expiring buffs, debuffs, stuns, shields
 * (and shielded regen), unit regen, minion and barricade lifetimes, delayed enemy spawns, traps, auras. Ends with sweepDead.
 */
export function tickStatuses(b, dt) {
  const f = fx(b);
  f.clock += dt;
  for (const arr of [b.units, b.enemies]) {
    const n = arr.length;
    for (let i = 0; i < n; i++) { const u = arr[i]; if (!u.dead) tickUnit(b, u, dt, f); }
  }
  if (f.queue.length) flushQueue(b);
  // auras
  const au = f.auras;
  for (let i = au.length - 1; i >= 0; i--) {
    const a = au[i];
    a.life -= dt;
    if (a.life <= 0 || (a.anchor && a.anchor.dead)) { au.splice(i, 1); continue; }
    a.left -= dt;
    if (a.left <= 1e-9) { a.left += a.interval; fireAura(b, a); }
  }
  // traps
  const tr = f.traps;
  for (let i = tr.length - 1; i >= 0; i--) {
    const t = tr[i];
    t.life -= dt;
    if (t.life <= 0 || t.charges <= 0) { tr.splice(i, 1); continue; }
    if (t.cd > 0) { t.cd -= dt; continue; }
    const pool = poolOf(b, opp(t.side));
    for (let k = 0; k < pool.length && t.charges > 0; k++) {
      const e = pool[k];
      if (e.dead || e.untargetable || (e.flying && !t.hitsFlyers)) continue;
      if (Math.hypot(e.x - t.x, e.y - t.y) > t.radius + 1e-9 || t.hit.indexOf(e.uid) >= 0) continue;
      t.hit.push(e.uid);
      t.charges--;
      t.cd = 0.3;
      emit(b, { type: 'trap_trigger', uid: t.uid, tgt: e.uid, x: t.x, y: t.y });
      applyEffect(b, t.effect, { source: t.src, side: t.side, target: e, tile: { x: t.x, y: t.y }, point: { x: t.x, y: t.y }, level: t.ctx.level, stageFactor: t.ctx.stageFactor, fromCard: t.ctx.fromCard, card: t.ctx.card, baseDmg: t.ctx.baseDmg, key: 'trap' + t.uid });
      break;
    }
    if (t.charges <= 0) tr.splice(i, 1);
  }
  sweepDead(b);
}
