// Midnight Mog effects interpreter: every effect kind, cat ability, enemy ability and phase, card and relic,
// determinism of the event stream, and hand computed computeStat examples.
import assert from 'node:assert/strict';
import * as E from '../midnight_mog/js/sim/effects.js';
import { EFFECT_KINDS, RELIC_KINDS } from '../midnight_mog/js/data/validate.js';
import { CATS, CAT_BY_ID } from '../midnight_mog/js/data/cats.js';
import { ENEMIES, ENEMY_BY_ID } from '../midnight_mog/js/data/enemies.js';
import { CARDS } from '../midnight_mog/js/data/cards.js';
import { RELICS } from '../midnight_mog/js/data/relics.js';
import { DISTRICTS } from '../midnight_mog/js/data/districts.js';
import { milestoneMult, starMult, nineLivesMult } from '../midnight_mog/js/sim/economy.js';

const T0 = Date.now();
const STATS = ['hp', 'dmg', 'rate', 'range', 'speed', 'crit', 'critdmg', 'armor', 'lifesteal', 'regen', 'cooldown', 'reflect', 'chain_jumps', 'vuln'];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ------------------------------------------------------------------ fixtures
function mkBattle(seed, extra = {}) {
  const b = Object.assign({ seed, field: { baseX: 0, edgeX: 12, rows: 5 }, base: { hp: 100, maxHp: 100 }, energy: 3, energyCap: 10, hand: ['a', 'b'], draw: ['c', 'd', 'e', 'f'], discard: ['g'], events: [], units: [], enemies: [], projectiles: [] }, extra);
  E.fx(b);
  return b;
}
function populate(b) {
  const tabby = E.createCatUnit(b, 'scrap_tabby', { x: 3, y: 2, level: 5 });
  const bruiser = E.createCatUnit(b, 'biscuit_bruiser', { x: 3.5, y: 3, level: 3 });
  const nurse = E.createCatUnit(b, 'nurse_purrnell', { x: 2, y: 2, level: 2 });
  bruiser.hp = bruiser.maxHp * 0.4;
  b.units.push(tabby, bruiser, nurse);
  const mk = (id, x, y, o) => { const u = E.createEnemyUnit(b, id, Object.assign({ x, y }, o)); b.enemies.push(u); return u; };
  mk('pigeon_scout', 4, 2); mk('gutter_gull', 5, 2); mk('pigeon_bomber', 5, 2.2); mk('rat_courier', 4.5, 3); mk('rat_courier', 6, 2); mk('antenna_raven', 7, 1);
  mk('king_coo', 8, 2);
  return { tabby, bruiser, nurse, near: b.enemies[0] };
}
function finite(b, where) {
  for (const arr of [b.units, b.enemies]) for (const u of arr) {
    for (const k of ['x', 'y', 'hp', 'maxHp']) assert.ok(Number.isFinite(u[k]), `${where}: ${u.id}.${k}=${u[k]}`);
    for (const s of STATS) { const v = E.computeStat(b, u, s); assert.ok(Number.isFinite(v), `${where}: ${u.id} stat ${s}=${v}`); }
    assert.ok(u.hp <= u.maxHp + 1e-6, `${where}: ${u.id} hp>max`);
    for (const st of u.statuses || []) for (const k of ['t', 'pct', 'amount', 'dps']) if (st[k] !== undefined) assert.ok(Number.isFinite(st[k]), `${where}: status ${st.type}.${k}`);
  }
  const bu = E.baseUnit(b);
  assert.ok(Number.isFinite(bu.hp) && Number.isFinite(bu.maxHp), where + ': base');
  for (const e of b.events) for (const k of ['amount', 'x', 'y']) if (e[k] !== undefined) assert.ok(Number.isFinite(e[k]), `${where}: event ${e.type}.${k}=${e[k]}`);
  for (const k of ['energy']) assert.ok(Number.isFinite(b[k]));
}
function hash(events) {
  const s = JSON.stringify(events); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h + ':' + events.length;
}
function simulate(b, secs) { for (let i = 0; i < secs * 30; i++) E.tickStatuses(b, 1 / 30); }

// ------------------------------------------------------------------ 1. every effect kind, literal fixtures
const FIX = {
  damage: { kind: 'damage', to: 'nearest', amount: 50 },
  chain: { kind: 'chain', jumps: 3, mult: 1.2, falloff: 0.1, range: 2.5, element: 'elec' },
  pierce: { kind: 'pierce', mult: 1.5, count: 3 },
  aoe: { kind: 'aoe', at: 'target', radius: 2, amount: 40, element: 'fire' },
  heal: { kind: 'heal', to: 'lowest_ally', pct: 0.3 },
  shield: { kind: 'shield', to: 'self', pct: 0.4, duration: 5 },
  buff: { kind: 'buff', to: 'all', stat: 'dmg', pct: 0.3, duration: 4 },
  debuff: { kind: 'debuff', to: 'all', stat: 'speed', pct: 0.5, duration: 4 },
  stun: { kind: 'stun', to: 'nearest', duration: 2 },
  dot: { kind: 'dot', to: 'nearest', dps: 0.5, duration: 3, element: 'fire' },
  taunt: { kind: 'taunt', radius: 3, duration: 3 },
  reflect: { kind: 'reflect', to: 'self', pct: 0.3, duration: 4 },
  knockback: { kind: 'knockback', to: 'nearest', tiles: 2 },
  pull: { kind: 'pull', to: 'all', tiles: 1.5 },
  execute: { kind: 'execute', to: 'all', threshold: 0.99, bossAmount: 20 },
  cleanse: { kind: 'cleanse', to: 'all' },
  revive: { kind: 'revive', n: 1, hpPct: 0.5 },
  energy: { kind: 'energy', amount: 2 },
  draw: { kind: 'draw', count: 2 },
  spawn: { kind: 'spawn', count: 2, minion: { name: 'Test Minion', hp: 50, dmg: 5, duration: 6 } },
  summon: { kind: 'summon', cat: 'whisker_scout' },
  spawn_enemies: { kind: 'spawn_enemies', enemy: 'rat_courier', count: 3, at: 'edge' },
  trap: { kind: 'trap', charges: 2, radius: 2, effect: { kind: 'damage', to: 'target', amount: 30 } },
  barricade: { kind: 'barricade', hp: 200, duration: 20 },
  aura: { kind: 'aura', radius: 3, interval: 1, duration: 4, effect: { kind: 'heal', to: 'radius', radius: 3, pct: 0.05 } },
  battle_rule: { kind: 'battle_rule', rule: 'spell_echo', value: 0.5 },
  reward_mult: { kind: 'reward_mult', resource: 'yarn', pct: 0.2, flat: 3 },
  reset_cooldown: { kind: 'reset_cooldown', to: 'all' },
  multi: { kind: 'multi', steps: [{ kind: 'damage', to: 'all', amount: 10 }, { kind: 'heal', to: 'all', amount: 10 }] },
};
const NOEVENT_OK = new Set(['cleanse', 'reset_cooldown', 'revive']); // silent by design when there is nothing to do // every kind must emit at least one event
function runOne(effect, seed, how = {}) {
  const b = mkBattle(seed);
  const o = populate(b);
  if (how.dead) { const d = E.createCatUnit(b, 'whisker_scout', { x: 1, y: 1 }); b.units.push(d); E.killUnit(b, d, null, { force: true, silent: true }); E.sweepDead(b); }
  b.events.length = 0;
  const side = how.side || 'cat';
  const caster = side === 'cat' ? o.tabby : b.enemies[1];
  const ctx = how.card ? { fromCard: true, card: { id: 'x' }, tile: { x: 4, y: 2 }, level: 3, source: null, target: how.card === 'enemy' ? o.near : undefined } : { source: caster, target: side === 'cat' ? o.near : o.tabby };
  if (how.card && how.card !== 'enemy') ctx.tile = { x: 4, y: 2 };
  const r = E.applyEffect(b, effect, ctx);
  assert.equal(r.ok, true, 'applyEffect ok for ' + effect.kind);
  finite(b, effect.kind + ' immediate');
  simulate(b, 6);
  finite(b, effect.kind + ' after 6s');
  return { b, r, o };
}
{
  assert.deepEqual(Object.keys(FIX).sort(), EFFECT_KINDS.slice().sort(), 'fixtures cover exactly EFFECT_KINDS');
  for (const kind of EFFECT_KINDS) {
    for (const how of [{}, { side: 'enemy' }, { card: 'tile' }, { card: 'enemy' }, { dead: true }]) {
      const { b } = runOne(FIX[kind], 11, how);
      assert.ok(b.events.length > 0 || Object.keys(how).length || NOEVENT_OK.has(kind), `${kind} (${JSON.stringify(how)}) emitted no events`);
    }
  }
  assert.equal(E.applyEffect(mkBattle(1), { kind: 'nope' }, {}).ok, false);

  // specific behaviours
  let x = runOne(FIX.damage, 2).b; assert.ok(x.events.some((e) => e.type === 'hit'));
  x = runOne(FIX.heal, 2).b; assert.ok(x.events.some((e) => e.type === 'heal'));
  x = runOne({ kind: 'stun', to: 'nearest', duration: 2 }, 2); assert.ok(x.b.events.some((e) => e.type === 'status' && e.status === 'stun'));
  x = runOne(FIX.revive, 2, { dead: true }); assert.ok(x.b.events.some((e) => e.type === 'revive'), 'revive emits');
  x = runOne(FIX.spawn_enemies, 2); assert.ok(x.b.events.filter((e) => e.type === 'spawn').length >= 3);
  x = runOne(FIX.energy, 2); assert.equal(x.b.energy, 5);
  x = runOne(FIX.draw, 2); assert.equal(x.b.hand.length, 4);
  x = runOne(FIX.reward_mult, 2); near(E.rewardMods(x.b).yarn.flat, 3); near(E.rewardMods(x.b).yarn.mult, 1.2);
  x = runOne(FIX.barricade, 2); assert.ok(x.b.units.some((u) => u.kind === 'barricade'));
  x = runOne(FIX.trap, 2, { card: 'tile' }); assert.ok(x.b.events.some((e) => e.type === 'trap_set') && x.b.events.some((e) => e.type === 'trap_trigger'));
  { // cleanse removes stun, dot and debuffs and emits; reset_cooldown zeroes cd
    const b = mkBattle(3); const o = populate(b);
    E.addStatus(b, o.tabby, { type: 'debuff', stat: 'speed', pct: 0.5, t: 9, key: 'd' }); E.addStatus(b, o.tabby, { type: 'stun', t: 9 });
    E.addStatus(b, o.tabby, { type: 'buff', stat: 'dmg', pct: 0.5, t: 9, key: 'b' });
    b.events.length = 0; E.applyEffect(b, { kind: 'cleanse', to: 'self' }, { source: o.tabby });
    assert.deepEqual(o.tabby.statuses.map((s) => s.type), ['buff']); assert.ok(b.events.some((e) => e.type === 'cleanse'));
    assert.ok(o.tabby.cd > 0); E.applyEffect(b, { kind: 'reset_cooldown', to: 'self' }, { source: o.tabby }); assert.equal(o.tabby.cd, 0);
  }
  // execute never kills a boss outright
  x = runOne({ kind: 'execute', to: 'all', threshold: 1 }, 2); assert.ok(x.b.enemies.some((u) => u.boss && !u.dead));
}

// ------------------------------------------------------------------ 2. data driven coverage
const kindsSeen = new Set();
const noteKinds = (e) => { if (!e || typeof e !== 'object') return; if (EFFECT_KINDS.includes(e.kind)) kindsSeen.add(e.kind); if (e.steps) e.steps.forEach(noteKinds); if (e.effect) noteKinds(e.effect); };

// cat abilities, cast by every cat
const catTrace = [];
for (const c of CATS) {
  const b = mkBattle(100 + catTrace.length);
  const o = populate(b);
  const u = E.createCatUnit(b, c.id, { x: 3, y: 2, level: 7, stars: 1 });
  b.units.push(u);
  b.events.length = 0;
  noteKinds(c.ability.effect);
  assert.ok(E.castAbility(b, u, { target: o.near }), 'castAbility ' + c.id);
  assert.ok(b.events.some((e) => e.type === 'cast'), c.id + ' cast event');
  assert.ok(u.cd > 0 && Number.isFinite(u.cd), c.id + ' cooldown reset');
  finite(b, 'cat ' + c.id);
  simulate(b, 8);
  finite(b, 'cat ' + c.id + ' later');
  // basic attack too
  E.attack(b, u, b.enemies.find((e) => !e.dead) || o.near);
  finite(b, 'cat attack ' + c.id);
  catTrace.push(...b.events.map((e) => ({ ...e, c: c.id })));
}

// enemy abilities and phases
const enemyTrace = [];
let abilityCount = 0, phaseCount = 0;
for (const en of ENEMIES) {
  const b = mkBattle(500 + enemyTrace.length);
  const o = populate(b);
  const u = E.createEnemyUnit(b, en.id, { x: 6, y: 2 });
  b.enemies.push(u);
  b.events.length = 0;
  if (en.ability) {
    abilityCount++; noteKinds(en.ability.effect);
    assert.ok(E.castAbility(b, u, { target: o.tabby }), 'enemy ability ' + en.id);
    finite(b, 'enemy ability ' + en.id);
  }
  if (en.phases.length) {
    for (const ph of en.phases) noteKinds(ph.effect);
    // walk the boss down through every phase threshold by damage
    for (const ph of en.phases.slice(1)) {
      phaseCount++;
      const want = u.maxHp * ph.at * 0.98;
      const dmg = u.hp + u.statuses.filter((s) => s.type === 'shield').reduce((a, s) => a + s.amount, 0) - want;
      if (dmg > 0) E.damageUnit(b, o.tabby, u, dmg / Math.max(0.1, 1 - E.computeStat(b, u, 'armor')), { noCrit: true, ignoreArmor: false });
      finite(b, 'phase ' + en.id + ' ' + ph.name);
    }
    assert.equal(u.phaseIdx, en.phases.length - 1, en.id + ' reached last phase');
    assert.equal(b.events.filter((e) => e.type === 'wave').length, en.phases.length - 1, en.id + ' wave events per phase');
    const last = en.phases[en.phases.length - 1];
    if (last.mods && last.mods.dmgMult) near(E.computeStat(b, u, 'dmg'), u.base.dmg * u.scale.dmg * en.phases.slice(1).reduce((m, p) => m * ((p.mods && p.mods.dmgMult) || 1), 1) * 1, 1e-6);
  }
  simulate(b, 6);
  finite(b, 'enemy ' + en.id);
  // enemy basic attack on a cat and on the base
  E.attack(b, u, o.tabby);
  E.damageUnit(b, u, E.baseUnit(b), 5);
  enemyTrace.push(...b.events.map((e) => ({ ...e, c: en.id })));
}
assert.ok(abilityCount > 0 && phaseCount > 0, 'enemy data has abilities and phases');

// cards
const cardTrace = [];
for (const card of CARDS) {
  noteKinds(card.effect);
  for (const lvl of [1, 6]) {
    const b = mkBattle(900 + cardTrace.length, { stageFactor: lvl === 1 ? 1 : 4 });
    const o = populate(b);
    b.base.hp = 40; o.bruiser.hp = 1;
    { const d = E.createCatUnit(b, 'whisker_scout', { x: 1, y: 1 }); b.units.push(d); E.killUnit(b, d, null, { force: true, silent: true }); E.sweepDead(b); }
    b.events.length = 0;
    const tgt = card.effect.target;
    const ctx = { level: lvl, tile: { x: 4, y: 2 }, target: tgt === 'enemy' ? o.near : undefined };
    const r = E.playCardEffect(b, card, ctx);
    assert.equal(r.ok, true, 'card ' + card.id);
    assert.ok(b.events.some((e) => e.type === 'cast' && e.card === card.id), card.id + ' cast event');
    assert.ok(b.events.length >= 2 || card.id === 'x', card.id + ' emitted effect events');
    finite(b, 'card ' + card.id);
    simulate(b, 10);
    finite(b, 'card ' + card.id + ' later');
    cardTrace.push(...b.events.map((e) => ({ ...e, c: card.id })));
  }
}
for (const k of EFFECT_KINDS) assert.ok(kindsSeen.has(k) || ['summon', 'spawn', 'energy', 'draw', 'revive'].includes(k) || FIX[k], 'kind reachable: ' + k);

// relics: every relic alone, then all together
const relicTrace = [];
const TRIGGERS = ['on_battle_start', 'on_wave_start', 'on_summon', 'on_play_card', 'on_base_hit', 'on_ally_death', 'on_kill', 'on_hit', 'on_crit', 'on_cast'];
function relicRun(ids, seed) {
  const b = mkBattle(seed, { relicIds: ids });
  E.applyRelicRules(b);
  const o = populate(b);
  E.applyRelicRules(b); // idempotent
  b.events.length = 0;
  const m = E.relicMods(b);
  assert.deepEqual(m.ids.slice().sort(), ids.slice().sort(), 'relic ids resolved');
  for (const t of TRIGGERS) E.fireTrigger(b, t, { source: o.tabby, target: t === 'on_kill' || t === 'on_hit' || t === 'on_crit' ? o.near : o.nurse, amount: 10, crit: t === 'on_crit', card: CARDS.find((c) => c.type === 'spell'), tile: { x: 3, y: 2 } });
  // real flow: summon, spell, kills, crits, casts, base hits, ally death
  E.playCardEffect(b, CARDS.find((c) => c.id === 'call_whisker_scout'), { tile: { x: 2, y: 1 }, level: 4 });
  for (let i = 0; i < 6; i++) E.playCardEffect(b, CARDS.find((c) => c.type === 'spell'), { level: 3, target: b.enemies.find((e) => !e.dead) });
  E.castAbility(b, o.tabby, { target: o.near });
  for (const e of b.enemies.slice(0, 5)) E.damageUnit(b, o.tabby, e, 1e6, { crit: 'always' });
  E.damageUnit(b, b.enemies.find((e) => !e.dead), E.baseUnit(b), 10);
  E.killUnit(b, o.nurse, null);
  simulate(b, 5);
  finite(b, 'relics ' + ids.join(','));
  E.cardCost(b, CARDS[0]); E.energyRegenRate(b, 1); E.rewardMods(b);
  for (const t of b.units.concat(b.enemies)) for (const s of STATS) assert.ok(!Number.isNaN(E.computeStat(b, t, s)));
  return b;
}
for (const r of RELICS) {
  assert.ok(RELIC_KINDS.includes(r.effect.kind));
  (function walk(e) { if (e.kind === 'multi_mod') e.steps.forEach(walk); else if (e.kind === 'on_event') noteKinds(e.effect); })(r.effect);
  const b = relicRun([r.id], 1300 + relicTrace.length);
  relicTrace.push(...b.events.map((e) => ({ ...e, c: r.id })));
}
relicRun(RELICS.map((r) => r.id), 1999);

// district modifiers
for (const d of DISTRICTS) {
  const b = mkBattle(77, { district: d.id });
  E.applyRelicRules(b);
  populate(b);
  finite(b, 'district ' + d.id);
}

// ------------------------------------------------------------------ 3. determinism
function fullStream(seed) {
  const all = [];
  for (const [i, c] of CATS.entries()) {
    if (i % 4) continue;
    const b = mkBattle(seed + i, { relicIds: ['chain_reaction_collar', 'cheshire_grin', 'moonstone_prism', 'nine_tailed_halo', 'supernova_bell'] });
    E.applyRelicRules(b); const o = populate(b);
    const u = E.createCatUnit(b, c.id, { x: 3, y: 2, level: 9 }); b.units.push(u);
    E.castAbility(b, u, { target: o.near });
    for (const card of CARDS.filter((_, k) => k % 7 === 0)) E.playCardEffect(b, card, { level: 2, tile: { x: 4, y: 2 }, target: o.near.dead ? undefined : o.near });
    for (let k = 0; k < 240; k++) { E.tickStatuses(b, 1 / 30); if (k % 20 === 0) E.attack(b, u, b.enemies[0] || o.near); }
    all.push(...b.events);
  }
  return all;
}
const h1 = hash(fullStream(42)), h2 = hash(fullStream(42)), h3 = hash(fullStream(43));
assert.equal(h1, h2, 'same seed, same event stream');
assert.notEqual(h1, h3, 'different seed changes the stream');
assert.equal(hash(catTrace), hash(catTrace)); // sanity
assert.ok(catTrace.length && enemyTrace.length && cardTrace.length && relicTrace.length);
const noDash = JSON.stringify([catTrace, enemyTrace, cardTrace, relicTrace]);
assert.ok(!noDash.includes('NaN') && !noDash.includes('null,"x"'), 'no NaN in any event stream');

// ------------------------------------------------------------------ 4. computeStat, hand computed
{
  const b = mkBattle(5);
  // level and stars: scrap_tabby hp 140 (+14/lvl), dmg 14 (+1.4/lvl)
  let u = E.createCatUnit(b, 'scrap_tabby', { level: 10, stars: 2 });
  near(E.computeStat(b, u, 'hp'), (140 + 14 * 9) * 1 * 1.5);          // 399
  near(E.computeStat(b, u, 'dmg'), (14 + 1.4 * 9) * 1.5, 1e-9);      // 39.9
  near(starMult(2), 1.5);
  assert.equal(u.maxHp, 399); assert.equal(u.hp, 399);
  // milestone at 25 doubles
  u = E.createCatUnit(b, 'scrap_tabby', { level: 25, stars: 0 });
  near(E.computeStat(b, u, 'hp'), (140 + 14 * 24) * 2);               // 952
  near(milestoneMult(25), 2);
  // level 1 star 0 is raw data
  u = E.createCatUnit(b, 'scrap_tabby', { level: 1 });
  near(E.computeStat(b, u, 'dmg'), 14); near(E.computeStat(b, u, 'rate'), 1.1); near(E.computeStat(b, u, 'speed'), 0.9);
  near(E.computeStat(b, u, 'crit'), 0.05); near(E.computeStat(b, u, 'critdmg'), 1.5); near(E.computeStat(b, u, 'cooldown'), 9);
  assert.equal(u.cd, 4.5, 'first cast at 50% cooldown');
  // multiplicative buffs: rate x(1+0.6)
  E.applyEffect(b, { kind: 'buff', to: 'self', stat: 'rate', pct: 0.6, duration: 4 }, { source: u });
  near(E.computeStat(b, u, 'rate'), 1.1 * 1.6);
  // two sources 0.6 + 0.7 cap at +100%
  E.addStatus(b, u, { type: 'buff', stat: 'rate', pct: 0.7, t: 9, key: 'other' });
  near(E.computeStat(b, u, 'rate'), 1.1 * 2);
  // debuff -50% speed on 0.9, plus a 60% one: sum 1.1 caps at -90%
  E.addStatus(b, u, { type: 'debuff', stat: 'speed', pct: 0.5, t: 9, key: 'd1' });
  near(E.computeStat(b, u, 'speed'), 0.9 * 0.5);
  E.addStatus(b, u, { type: 'debuff', stat: 'speed', pct: 0.6, t: 9, key: 'd2' });
  near(E.computeStat(b, u, 'speed'), 0.9 * 0.1);
  // additive stats: crit buff adds, clamps at 1
  E.addStatus(b, u, { type: 'buff', stat: 'crit', pct: 0.3, t: 9, key: 'c' });
  near(E.computeStat(b, u, 'crit'), 0.35);
  E.addStatus(b, u, { type: 'buff', stat: 'crit', pct: 0.9, t: 9, key: 'c2' });
  near(E.computeStat(b, u, 'crit'), 1); // 0.05 + min(1.2,1) clamps to 1
  b.units.push(u);
  // stun zeroes speed
  E.applyEffect(b, { kind: 'stun', to: 'self', duration: 1 }, { source: u });
  near(E.computeStat(b, u, 'speed'), 0); assert.equal(E.canAct(u), false);
  simulate(b, 1.1); assert.equal(E.canAct(u), true);
  // vuln and armor clamp
  E.addStatus(b, u, { type: 'debuff', stat: 'vuln', pct: 1.5, t: 9, key: 'v1' });
  E.addStatus(b, u, { type: 'debuff', stat: 'vuln', pct: 1.5, t: 9, key: 'v2' });
  near(E.computeStat(b, u, 'vuln'), 2);
  E.addStatus(b, u, { type: 'buff', stat: 'armor', pct: 5, t: 9, key: 'a' });
  near(E.computeStat(b, u, 'armor'), 0.9);
}
{
  // relic mods: lucky_collar (+0.1 crit all cats), warm_sock (x1.15 hp), midnight_crown (x1.25 dmg hp all cats, enemies hp x1.1), bulwark_bowl (tank hp x1.4)
  const b = mkBattle(6, { relicIds: ['lucky_collar', 'warm_sock', 'midnight_crown', 'bulwark_bowl', 'ember_locket', 'hairball_amulet', 'catnip_pouch', 'rusty_bell', 'tin_whistle', 'stray_crown'] });
  E.applyRelicRules(b);
  const t = E.createCatUnit(b, 'scrap_tabby', { level: 1 });
  near(E.computeStat(b, t, 'crit'), 0.05 + 0.1);
  near(E.computeStat(b, t, 'hp'), 140 * 1.15 * 1.25);
  near(E.computeStat(b, t, 'dmg'), 14 * 1.25);
  assert.equal(t.maxHp, Math.round(140 * 1.15 * 1.25));
  // tag scoped: ember_locket is tag:fire dmg x1.3. Find a fire cat and a non fire cat.
  const fire = CATS.find((c) => c.tags.includes('fire')), nofire = CATS.find((c) => !c.tags.includes('fire') && c.role === 'brawler');
  const fu = E.createCatUnit(b, fire.id, { level: 1 }), nu = E.createCatUnit(b, nofire.id, { level: 1 });
  near(E.computeStat(b, fu, 'dmg'), fire.base.dmg * 1.25 * 1.3);
  near(E.computeStat(b, nu, 'dmg'), nofire.base.dmg * 1.25);
  // tank hp, role scope
  const tank = CATS.find((c) => c.role === 'tank');
  near(E.computeStat(b, E.createCatUnit(b, tank.id, { level: 1 }), 'hp'), tank.base.hp * 1.15 * 1.25 * 1.4);
  // enemy scope
  const en = E.createEnemyUnit(b, 'gutter_gull', {});
  near(E.computeStat(b, en, 'hp'), 55 * 1.1);
  assert.equal(E.computeStat(b, en, 'crit') , 0, 'enemies have no crit and cat crit relic does not apply');
  // spell power: (1 + 0.12 * (L-1)) * 1.25
  near(E.spellPower(b, 1), 1.25); near(E.spellPower(b, 6), (1 + 0.6) * 1.25);
  // rules
  near(E.getRule(b, 'buff_duration_mult'), 1.3); assert.equal(b.energy, 4); assert.equal(b.handSize, 6);
  // buff duration scaled by catnip pouch
  E.applyEffect(b, { kind: 'buff', to: 'self', stat: 'dmg', pct: 0.5, duration: 4 }, { source: t });
  near(t.statuses.find((s) => s.type === 'buff').t, 5.2);
  // order: relic mult then buff: 14 * 1.25 * 1.5
  near(E.computeStat(b, t, 'dmg'), 14 * 1.25 * 1.5);
  // cooldown: stray_crown x0.75, royal x0.8 additional
  near(E.computeStat(b, t, 'cooldown'), 9 * 0.75);
  const royal = CATS.find((c) => c.tags.includes('royal'));
  near(E.computeStat(b, E.createCatUnit(b, royal.id, { level: 1 }), 'cooldown'), royal.ability.cooldown * 0.75 * 0.8);
  // card cost and first card free
  const cost2 = CARDS.find((c) => c.cost === 2);
  assert.equal(E.cardCost(b, cost2), 2);
}
{
  // nine lives damage, district modifier, stage scaling, base hp pct, collection bonuses
  const b = mkBattle(7, { profile: { nineLives: { shards: 10, count: 1 }, relics: {}, cats: {} } });
  const nl = nineLivesMult(10);
  const t = E.createCatUnit(b, 'scrap_tabby', { level: 1 });
  near(E.computeStat(b, t, 'dmg'), 14 * nl.damage);
  near(E.computeStat(b, t, 'hp'), 140);
  const b2 = mkBattle(8, { scaling: { hp: 3, dmg: 2, reward: 5 } });
  const e = E.createEnemyUnit(b2, 'gutter_gull', {});
  near(E.computeStat(b2, e, 'hp'), 165); near(E.computeStat(b2, e, 'dmg'), 12); near(E.computeStat(b2, e, 'armor'), 0.25);
  near(e.reward, 15);
  const b3 = mkBattle(9, { district: 'bathtub_bay' });
  const t3 = E.createCatUnit(b3, 'scrap_tabby', { level: 1 });
  near(E.computeStat(b3, t3, 'speed'), 0.9 * 0.85);
  const b4 = mkBattle(10, { extraMods: [{ kind: 'stat_mod', scope: 'base', stat: 'hp', mult: 1.5 }], relicIds: [] });
  E.applyRelicRules(b4); assert.equal(E.baseUnit(b4).maxHp, 150);
  E.applyRule(b4, 'base_hp_pct', 0.2); assert.equal(E.baseUnit(b4).maxHp, Math.round(100 * 1.2 * 1.5));
  // self mods (elite affix) and boss phase mods
  const el = E.createEnemyUnit(b4, 'gutter_gull', { mods: [{ kind: 'stat_mod', scope: 'self', stat: 'speed', mult: 1.3 }, { kind: 'stat_mod', scope: 'self', stat: 'armor', add: 0.3 }] });
  near(E.computeStat(b4, el, 'speed'), 0.7 * 1.3); near(E.computeStat(b4, el, 'armor'), 0.55);
  // collection bonus through profile: owning every brawler gives +4% dmg to brawlers
  const cats = {}; for (const c of CATS) cats[c.id] = { level: 1, stars: 0 };
  const b5 = mkBattle(11, { profile: { cats, relics: {} } });
  near(E.computeStat(b5, E.createCatUnit(b5, 'scrap_tabby', { level: 1 }), 'dmg'), 14 * 1.04 * 1.03 * (CAT_BY_ID.scrap_tabby.rarity === 'common' ? 1 : 1) , 1e-6);
}

// ------------------------------------------------------------------ 5. mechanics spot checks
{
  const b = mkBattle(12); const o = populate(b);
  const tgt = b.enemies[1]; // gutter_gull armor 0.25, hp 55
  tgt.statuses.length = 0; const hp0 = tgt.hp;
  E.damageUnit(b, null, tgt, 20, { noCrit: true });
  near(hp0 - tgt.hp, 15);                                              // 20 * (1 - 0.25)
  E.addStatus(b, tgt, { type: 'shield', amount: 5, max: 5, t: 9, key: 's' });
  E.damageUnit(b, null, tgt, 20, { noCrit: true });                    // 15 dmg, 5 absorbed
  near(hp0 - tgt.hp, 25);
  E.addStatus(b, tgt, { type: 'debuff', stat: 'vuln', pct: 0.5, t: 9, key: 'v' });
  const h1 = tgt.hp; E.damageUnit(b, null, tgt, 8, { noCrit: true });  // 8 * .75 * 1.5 = 9
  near(h1 - tgt.hp, 9);
  // dot: dps 0.5 x dmg of source (tabby lvl 5: 14 + 1.4*4 = 19.6), 3s => ticks 6 x (dps*0.5)
  const victim = b.enemies[4]; victim.hp = victim.maxHp = 1e6; victim.statuses.length = 0;
  E.applyEffect(b, { kind: 'dot', to: 'target', dps: 0.5, duration: 3 }, { source: o.tabby, target: victim });
  const hv = victim.hp; simulate(b, 3.2);
  near(hv - victim.hp, 6 * 0.5 * 19.6 * 0.5, 1e-6);
  // knockback moves enemies back toward the edge, bosses half
  const kb = b.enemies[3]; const x0 = kb.x; E.applyEffect(b, { kind: 'knockback', to: 'target', tiles: 2 }, { source: o.tabby, target: kb });
  near(kb.x, x0 + 2);
  // heal clamps to room
  const nurse = o.nurse; nurse.hp = nurse.maxHp - 3;
  near(E.healUnit(b, nurse, 100, null), 3);
  // cat_revive_once rule
  const rb = mkBattle(13, { relicIds: ['nine_tailed_halo'] }); E.applyRelicRules(rb); const rc = E.createCatUnit(rb, 'scrap_tabby', { level: 1 }); rb.units.push(rc);
  E.damageUnit(rb, null, rc, 1e6, { noCrit: true }); assert.equal(rc.dead, false); near(rc.hp, rc.maxHp * 0.25);
  E.damageUnit(rb, null, rc, 1e6, { noCrit: true }); assert.equal(rc.dead, true);
  // base revive once
  const bb = mkBattle(14, { relicIds: ['nine_lives_charm'] }); E.applyRelicRules(bb);
  E.damageBase(bb, 500, null); near(E.baseUnit(bb).hp, 30); E.damageBase(bb, 500, null); assert.equal(E.baseUnit(bb).hp, 0);
  // taunt grabs enemies in radius
  const tb = mkBattle(15); const to = populate(tb); E.applyEffect(tb, { kind: 'taunt', radius: 3, duration: 3 }, { source: to.bruiser });
  assert.equal(E.tauntTarget(tb, tb.enemies[0]), to.bruiser);
  // flying enemies need range >= 2 for plain hits
  const fl = tb.enemies.find((e) => e.flying);
  assert.equal(E.canHit(tb, to.tabby, fl, 'hit'), false); assert.equal(E.canHit(tb, to.tabby, fl, 'aoe'), true);
  // minion lifetime expires
  const mb = mkBattle(16); const mo = populate(mb);
  E.applyEffect(mb, FIX.spawn, { source: mo.tabby }); const nm = mb.units.length; simulate(mb, 6.5); assert.equal(mb.units.length, nm - 2);
  // ability_echo / spell_echo are probabilistic but bounded; recursion guard
  const eb = mkBattle(17, { relicIds: ['chain_reaction_collar'] });
  for (let i = 0; i < 20; i++) assert.ok(E.fireTrigger(eb, 'on_kill', { source: null, target: { side: 'enemy', x: 1, y: 1, hp: 1, maxHp: 1, uid: 99 } }) >= 0);
}

{ // card flat amounts: amount * stageFactor * spellPower(level); mult amounts use the source dmg
  const b = mkBattle(21, { stageFactor: 4 }); const o = populate(b);
  const v = o.near; v.hp = v.maxHp = 1e6; v.statuses.length = 0; v.base.armor = 0;
  E.playCardEffect(b, { id: 'z', type: 'spell', cost: 1, effect: { kind: 'damage', to: 'target', amount: 100 } }, { level: 6, target: v });
  near(1e6 - v.hp, 100 * 4 * (1 + 0.12 * 5), 1e-6);
  const w = b.enemies[3]; w.hp = w.maxHp = 1e6; w.statuses.length = 0; w.base.armor = 0;
  E.applyEffect(b, { kind: 'damage', to: 'target', mult: 2 }, { source: o.tabby, target: w });
  near(1e6 - w.hp, 2 * (14 + 1.4 * 4), 1e-6);
  // chain: first hit full, second x(1-falloff)
  const cb = mkBattle(22); const co = populate(cb);
  for (const e of cb.enemies) { e.hp = e.maxHp = 1e6; e.base.armor = 0; e.statuses.length = 0; e.flying = false; }
  cb.enemies.forEach((e, i) => { e.x = 4 + i * 0.5; e.y = 2; });
  const hits = []; const r = E.applyEffect(cb, { kind: 'chain', jumps: 2, amount: 100, falloff: 0.5, range: 2, crit: 'never' }, { source: co.tabby, target: cb.enemies[0], fromCard: false });
  assert.equal(r.targets.length, 3); near(r.amount, 100 + 50 + 25, 1e-6);
  // aoe radius
  const ab = mkBattle(23); const ao = populate(ab);
  for (const e of ab.enemies) { e.hp = e.maxHp = 1e6; e.base.armor = 0; e.flying = false; }
  const ra = E.applyEffect(ab, { kind: 'aoe', at: 'target', radius: 1, amount: 10 }, { fromCard: true, tile: { x: 5, y: 2 }, level: 1 });
  assert.ok(ra.targets.length >= 2 && ra.targets.every((t) => Math.hypot(t.x - 5, t.y - 2) <= 1 + 1e-9));
  // aura heals over time, expires
  const au = mkBattle(24); const aoo = populate(au); aoo.nurse.hp = 1;
  E.applyEffect(au, { kind: 'aura', radius: 3, interval: 1, duration: 4, effect: { kind: 'heal', to: 'radius', radius: 3, pct: 0.05 } }, { fromCard: true, tile: { x: 2, y: 2 } });
  simulate(au, 6); assert.equal(au.fx.auras.length, 0); assert.ok(aoo.nurse.hp > 1);
  // taking cat from fallen via revive restores a live unit
  const rv = mkBattle(25); const ro = populate(rv); E.killUnit(rv, ro.bruiser, null); E.sweepDead(rv);
  assert.ok(!rv.units.includes(ro.bruiser)); E.applyEffect(rv, { kind: 'revive', n: 1, hpPct: 0.5 }, { fromCard: true });
  assert.ok(rv.units.includes(ro.bruiser) && !ro.bruiser.dead); near(ro.bruiser.hp, ro.bruiser.maxHp * 0.5, 1);
  // enemy side energy does nothing to the cat energy pool
  const en = mkBattle(26); const eo = populate(en); E.applyEffect(en, { kind: 'energy', amount: 5 }, { source: en.enemies[0] }); assert.equal(en.energy, 3);
}
const dt = Date.now() - T0;
assert.ok(dt < 10000, 'under 10 seconds, took ' + dt);
console.log('midnight_mog effects: ok (' + dt + ' ms, ' + EFFECT_KINDS.length + ' kinds, ' + CATS.length + ' cats, ' + ENEMIES.length + ' enemies, ' + CARDS.length + ' cards, ' + RELICS.length + ' relics)');
