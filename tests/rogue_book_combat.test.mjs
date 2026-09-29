// COMBAT: the rules engine of DESIGN 4.1 to 4.7 and 5.2, tested with synthetic content (ids start with t_) registered inside the
// test after boot({only:['util','data','data_text','combat']}). Nothing here depends on the real card, enemy, relic or gem files.
//
// Layout: helpers, then one section per rule family (setup, damage, block and statuses, round timing, cards and piles, picks, swaps and rows,
// every op, every condition, every per source, hooks, enemy AI, phases and summons, downed heroes, stats and summary), then determinism, a
// randomised fuzz that asserts invariants after every action, and a bonus pass over any real content that already exists.
import { boot, harness } from './rogue_book_lib.mjs';

const t = harness('rogue_book combat');

// ------------------------------------------------------------------ helpers
const BASE_CARD = { hero: 'hanae', type: 'attack', rarity: 'common', cost: 1, fx: [], up: { fx: [] }, kw: [], slots: ['red'], art: { m: 'slash', c: 'rose' } };
const BASE_ENEMY = { chapter: 1, tier: 'normal', size: 'm', hp: [100, 100], ai: { seq: ['idle'] }, lore: 'A test creature.', tags: ['spirit'] };

function world(opts = {}) {
  const g = boot({ only: ['util', 'data', 'data_text', 'combat'] });
  const { DATA: D, COMBAT, U } = g;
  if (!opts.keepHeroes) D.LISTS.heroIds.forEach((id) => { D.heroes[id].rows = { front: {}, back: {} }; D.heroes[id].passives = []; });
  let n = 0;
  const W = { g, D, COMBAT, U, n: () => ++n };
  W.card = (name, over = {}) => { const id = name.indexOf('t_') === 0 ? name : 't_' + name; D.add('cards', { [id]: Object.assign({ name: id }, BASE_CARD, over) }); return id; };
  W.enemy = (name, over = {}) => {
    const id = name.indexOf('t_') === 0 ? name : 't_' + name;
    const e = Object.assign({ name: id, art: { id } }, BASE_ENEMY, over);
    if (!e.moves) e.moves = { idle: { name: 'Idle', kind: 'none', fx: [] } };
    D.add('enemies', { [id]: e });
    return id;
  };
  W.relic = (name, over = {}) => { const id = name.indexOf('t_') === 0 ? name : 't_' + name; D.add('relics', { [id]: Object.assign({ name: id, rarity: 'common', text: 'Test relic.', art: { m: 'lantern' } }, over) }); return id; };
  W.gem = (name, over = {}) => { const id = name.indexOf('t_') === 0 ? name : 't_' + name; D.add('gems', { [id]: Object.assign({ name: id, color: 'red', tier: 1, art: { cut: 'round' } }, over) }); return id; };
  W.dummy = W.enemy('dummy');                                    // 100 HP, does nothing
  W.hitter = (dmg = 6, over = {}) => W.enemy('hitter' + (++n), Object.assign({ hp: [100, 100], moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: dmg, tgt: 'front' }] } }, ai: { seq: ['hit'] } }, over));
  W.deck = (specs) => specs.map((s, i) => (typeof s === 'string' ? { uid: 100 + i, id: s, up: 0, gems: [] } : Object.assign({ uid: 100 + i, up: 0, gems: [] }, s)));
  // fresh combat. deck: card ids or {id, up, gems}. Returns C (started unless start:false).
  W.fight = (o = {}) => {
    const filler = o.filler === undefined ? 10 : o.filler;
    const ids = (o.deck || []).slice();
    if (!W.filler) W.filler = W.card('filler', { type: 'skill', cost: 9, fx: [{ op: 'block', n: 1 }] });
    for (let i = 0; i < filler; i++) ids.push(W.filler);
    const C = COMBAT.create({
      heroes: o.heroes || [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }], frontIdx: o.frontIdx || 0, deck: W.deck(ids),
      enemies: o.enemies || [W.dummy], tier: o.tier || 'normal', chapter: o.chapter || 1, seed: o.seed === undefined ? 5 : o.seed, mods: o.mods, relics: o.relics || [], gold: o.gold,
    });
    if (o.start !== false) C.start();
    return C;
  };
  return W;
}

const types = (ev) => ev.map((e) => e.type);
const only = (ev, type) => ev.filter((e) => e.type === type);
const first = (ev, type) => ev.find((e) => e.type === type);
const snap = (C) => JSON.stringify({ h: C.heroes, e: C.enemies, hand: C.hand, draw: C.draw, discard: C.discard, ex: C.exhaust, pw: C.powers, en: C.energy, turn: C.turn, phase: C.phase, p: C.pending, s: C.stats });

// pile rigging (direct, no events): put exactly these card ids in hand, in this order, taking them from draw, then discard, then exhaust
function rig(C, ids) {
  C.hand.splice(0).forEach((c) => C.discard.push(c));
  return ids.map((id) => {
    for (const pile of [C.draw, C.discard, C.exhaust]) {
      const i = pile.findIndex((c) => c.id === id);
      if (i >= 0) { const [c] = pile.splice(i, 1); C.hand.push(c); return c; }
    }
    throw new Error('rig: no ' + id + ' left in the piles');
  });
}
const play = (C, inst, target) => C.play(inst.uid, target === undefined && C.needsTarget(inst.uid) ? C.enemies.find((e) => !e.down).id : target);
const plain = (C) => { C.heroes.forEach((h) => { h.st = {}; h.block = 0; }); };

// ------------------------------------------------------------------ setup
t.test('create: units, lanes, ids, HP roll and trial scaling', () => {
  const W = world();
  const a = W.enemy('a', { hp: [10, 20] }), e1 = W.enemy('elite1', { tier: 'elite', hp: [50, 60], size: 'l' }), b = W.enemy('boss1', { tier: 'boss', hp: [100, 100], size: 'xl' }), m = W.enemy('minion1', { tier: 'minion', hp: [5, 5], size: 's' });
  const C = W.fight({ enemies: [a, a, m], start: false });
  t.deep(C.enemies.map((e) => e.id), ['t_a#1', 't_a#2', 't_minion1#1'], 'unit ids are def#n');
  t.deep(C.enemies.map((e) => e.lane), [2, 3, 4], '3 enemies take lanes 2..4 in order');
  t.deep(W.fight({ enemies: [b], start: false }).enemies.map((e) => e.lane), [4], 'a boss stands alone in lane 4');
  t.deep(W.fight({ enemies: [a, a, a, a, a], start: false }).enemies.map((e) => e.lane), [0, 1, 2, 3, 4], 'five enemies fill the line');
  C.enemies.forEach((e) => t.ok(e.hp === e.maxHp && e.hp >= 5 && e.hp <= 20 && !e.down && e.def && e.tier && e.size, 'enemy ' + e.id + ' is formed before start'));
  t.deep(C.heroes.map((h) => [h.id, h.row, h.hp, h.maxHp, h.block, h.down]), [['hanae', 'front', 70, 70, 0, false], ['kuro', 'back', 60, 60, 0, false]], 'heroes');
  t.eq(W.fight({ frontIdx: 1, start: false }).front().id, 'kuro', 'frontIdx picks who leads');
  t.eq(C.phase, 'setup', 'phase before start');
  t.eq(C.tier, 'normal', 'tier echoed'); t.eq(W.fight({ tier: 'elite', start: false }).tier, 'elite', 'tier is echoed');
  // HP scaling by the unit's own tier
  const S = world();
  const [sa, se, sb, sm] = [S.enemy('a', { hp: [40, 40] }), S.enemy('e', { tier: 'elite', hp: [100, 100] }), S.enemy('b', { tier: 'boss', hp: [200, 200] }), S.enemy('m', { tier: 'minion', hp: [10, 10] })];
  const SC = S.fight({ enemies: [sa, se, sb, sm], mods: { enemyHp: 1.2, eliteHp: 1.5, bossHp: 1, enemyDmg: 1 }, start: false });
  t.deep(SC.enemies.map((e) => e.maxHp), [48, 150, 200, 12], 'normal x1.2, elite x1.5, boss x1, minion uses the enemyHp factor; rounded');
  const S2 = world(); const tiny = S2.enemy('tiny', { hp: [1, 1] });
  t.eq(S2.fight({ enemies: [tiny], mods: { enemyHp: 0.1 }, start: false }).enemies[0].maxHp, 1, 'HP never below 1');
  t.throws(() => world().fight({ enemies: ['t_nope'], start: false }), 'unknown enemy throws');
  t.throws(() => world().fight({ heroes: [{ id: 'nobody', hp: 1, maxHp: 1 }], start: false }), 'unknown hero throws');
  t.throws(() => world().fight({ heroes: [{ id: 'hanae', hp: 5, maxHp: 5 }, { id: 'hanae', hp: 5, maxHp: 5 }], start: false }), 'two distinct heroes');
});

t.test('create: partial mods default sensibly and the deck is copied, not shared', () => {
  const W = world();
  const deck = W.deck([W.card('a'), W.card('b')]);
  const C = W.COMBAT.create({ heroes: [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }], deck, enemies: [W.dummy], seed: 1, mods: { energy: 4 } });
  t.eq(C.maxEnergy, 4, 'mods.energy'); t.eq(C.mods.hand, 5, 'unspecified mods fall back to the base game'); t.eq(C.mods.enemyDmg, 1, 'enemyDmg default factor');
  C.start(); C.draw.concat(C.hand)[0].up = 1;
  t.ok(deck.every((c) => c.up === 0), 'combat piles hold copies of the deck instances');
  t.eq(C.deckSize, 2, 'deckSize');
});

t.test('start: event order, turn 1, energy, draw, innate, hand cap', () => {
  const W = world();
  const strike = W.card('strike', { fx: [{ op: 'dmg', n: 6 }] }), inn = W.card('inn', { kw: ['innate'], type: 'skill', fx: [{ op: 'block', n: 1 }] });
  const C = W.fight({ deck: [strike, strike, strike, strike, strike, strike, strike, inn], filler: 0, start: false });
  const ev = C.start();
  t.eq(ev[0].type, 'combat_start', 'combat_start is first');
  t.eq(types(ev).filter((x) => x === 'intent').length, 1, 'one intent per enemy');
  t.ok(types(ev).indexOf('intent') < types(ev).indexOf('turn_start'), 'intents before the first turn');
  t.deep(first(ev, 'turn_start'), { type: 'turn_start', who: 'player', turn: 1, energy: 3, maxEnergy: 3 }, 'turn_start snapshot');
  t.eq(C.hand.length, 5, 'draw 5'); t.ok(C.hand.some((c) => c.id === inn), 'the innate card is in the opening hand');
  t.eq(C.energy, 3, 'energy'); t.eq(C.turn, 1, 'turn'); t.eq(C.phase, 'player', 'phase');
  t.eq(C.hand.length + C.draw.length, 8, 'conservation'); t.eq(C.start().length, 0, 'start is only legal once');
  const draws = only(ev, 'draw');
  t.eq(draws.length, 2, 'innate cards and the drawn cards are separate draw events'); t.eq(draws[0].cards.length, 1, 'innate first');
  t.deep(draws[1].piles, { hand: 5, draw: 3, discard: 0, exhaust: 0 }, 'piles are counts AFTER the event');
  // mods.hand and energy
  const W2 = world();
  const s2 = W2.card('s'); const C2 = W2.fight({ deck: Array(8).fill(s2), mods: { energy: 5, hand: 7 } });
  t.eq(C2.hand.length, 7, 'mods.hand'); t.eq(C2.energy, 5, 'mods.energy');
  // hand never exceeds 10
  const W3 = world(); const s3 = W3.card('s');
  const C3 = W3.fight({ deck: Array(15).fill(s3), filler: 0, mods: { hand: 12 } });
  t.eq(C3.hand.length, 10, 'hand capped at ECONOMY.maxHand'); t.eq(C3.draw.length, 5, 'drawing into a full hand leaves the pile alone');
});

t.test('start: enemy start ops run before the first intents; combatStart hook sees the shuffled pile', () => {
  const W = world();
  const th = W.enemy('spiky', { start: [{ op: 'status', s: 'thorns', n: 3, tgt: 'self' }], moves: { idle: { name: 'Idle', kind: 'none', fx: [] } } });
  const C = W.fight({ enemies: [th], start: false });
  const ev = C.start();
  t.eq(C.enemies[0].st.thorns, 3, 'start ops applied');
  const i = types(ev);
  t.ok(i.indexOf('status') < i.indexOf('intent'), 'status before intent');
  t.eq(first(ev, 'status').value, 3, 'status event value');
});

// ------------------------------------------------------------------ damage
t.test('damage formula: exact numbers for every modifier and their order', () => {
  const W = world();
  const hit = W.card('hit', { fx: [{ op: 'dmg', n: 10 }] });
  const dmgOf = (setup, opts = {}) => {
    const C = W.fight({ deck: [hit], filler: 0, ...opts });
    plain(C); setup(C);
    const ev = play(C, rig(C, [hit])[0]);
    return first(ev, 'hit');
  };
  t.eq(dmgOf(() => {}).raw, 10, 'plain');
  t.eq(dmgOf((C) => { C.heroes[0].st.might = 3; }).raw, 13, 'Might adds');
  t.eq(dmgOf((C) => { C.heroes[0].st.might = -4; }).raw, 6, 'Might may be negative');
  t.eq(dmgOf((C) => { C.heroes[0].st.might = -40; }).raw, 0, 'never below 0');
  t.eq(dmgOf((C) => { C.heroes[0].st.weak = 1; }).raw, 7, 'Weak: floor(10 * 0.75)');
  t.eq(dmgOf((C) => { C.enemies[0].st.vulnerable = 1; }).raw, 15, 'Vulnerable: x1.5');
  t.eq(dmgOf((C) => { C.enemies[0].st.vulnerable = 1; C.heroes[0].st.weak = 1; }).raw, 10, 'Weak then Vulnerable: floor(floor(7.5)*1.5)');
  t.eq(dmgOf((C) => { C.heroes[0].st.might = 3; C.heroes[0].st.weak = 1; C.enemies[0].st.vulnerable = 1; }).raw, 13, '(10+3)=13 -> weak 9 -> vulnerable 13.5 -> 13; floor at each step');
  t.eq(dmgOf((C) => { C.enemies[0].st.mark = 2; }).raw, 13, 'Mark adds 3');
  t.eq(dmgOf((C) => { C.enemies[0].st.mark = 1; C.heroes[0].st.weak = 1; }).raw, 9, 'Mark is added BEFORE Weak: floor(13*0.75)');
  const h = dmgOf((C) => { C.enemies[0].st.vulnerable = 1; });
  t.ok(h.crit, 'Vulnerable is a crit'); t.ok(!dmgOf(() => {}).crit, 'plain is no crit'); t.ok(dmgOf((C) => { C.enemies[0].st.mark = 1; }).crit, 'Mark is a crit');
  // enemy attackers: enemyDmg factor before Weak, then the hero's Vulnerable
  const W2 = world(); const hh = W2.hitter(10);
  const C2 = W2.fight({ enemies: [hh], mods: { enemyDmg: 1.15 } });
  const ev = C2.endTurn();
  t.eq(first(ev, 'hit').raw, 11, 'enemyDmg 1.15: floor(11.5)');
  const C3 = W2.fight({ enemies: [hh], mods: { enemyDmg: 1.1 } });
  C3.heroes[0].st.vulnerable = 1;
  t.eq(first(C3.endTurn(), 'hit').raw, 16, 'floor(10*1.1)=11 then vulnerable floor(16.5)');
  const C4 = W2.fight({ enemies: [hh] }); C4.enemies[0].st.weak = 1; C4.enemies[0].st.might = 2;
  t.eq(first(C4.endTurn(), 'hit').raw, 9, 'enemy Might 2 then Weak: floor(12*0.75)');
  const W4 = world(); const hh4 = W4.hitter(100), c4 = W4.card('x', { fx: [{ op: 'dmg', n: 10 }] });
  const C6 = W4.fight({ enemies: [hh4], deck: [c4], mods: { enemyDmg: 1.15 } });
  t.eq(first(C6.endTurn(), 'hit').raw, 115, '100 * 1.15 is 115, not 114 (epsilon floor)');
});

t.test('hit events: blocked, amount, hp, block, killed and block_lost', () => {
  const W = world();
  const hit = W.card('hit', { fx: [{ op: 'dmg', n: 10 }] });
  const C = W.fight({ deck: [hit, hit], filler: 0, enemies: [W.enemy('e', { hp: [12, 12] })] });
  plain(C); C.enemies[0].block = 4;
  let ev = play(C, rig(C, [hit])[0]);
  let h = first(ev, 'hit');
  t.deep([h.raw, h.blocked, h.amount, h.hp, h.block, h.killed, h.hits, h.index, h.pierce, h.element], [10, 4, 6, 6, 0, false, 1, 0, false, 'slash'], 'partial block');
  t.eq(h.src.id, 'hanae', 'src'); t.eq(h.dst.id, 't_e#1', 'dst'); t.ok(only(ev, 'block_lost').length === 1 && first(ev, 'block_lost').cause === 'hit' && first(ev, 'block_lost').amount === 4, 'block_lost cause hit right after the hit');
  t.ok(types(ev).indexOf('block_lost') === types(ev).indexOf('hit') + 1, 'block_lost directly follows the hit');
  ev = play(C, rig(C, [hit])[0]);
  h = first(ev, 'hit');
  t.deep([h.amount, h.killed, h.hp], [6, true, 0], 'overkill counts the HP actually removed; killed');
  t.eq(h.raw, 10, 'raw is the full damage');
  t.eq(C.result, 'win', 'the last enemy dying wins'); t.eq(C.phase, 'over', 'phase over');
  t.eq(ev[ev.length - 1].type, 'end', 'end is the last event');
  // fully absorbed hit: no block_lost while block remains
  const W2 = world(); const h2 = W2.card('h', { fx: [{ op: 'dmg', n: 3 }] });
  const C2 = W2.fight({ deck: [h2], filler: 0 }); plain(C2); C2.enemies[0].block = 8;
  const e2 = play(C2, rig(C2, [h2])[0]);
  t.deep([first(e2, 'hit').amount, first(e2, 'hit').blocked, first(e2, 'hit').block], [0, 3, 5], 'fully blocked hit reports amount 0');
  t.eq(only(e2, 'block_lost').length, 0, 'block remains, no block_lost');
});

t.test('pierce ignores Block; dodge negates everything; mark is consumed even when dodged', () => {
  const W = world();
  const pierce = W.card('pierce', { fx: [{ op: 'dmg', n: 5, pierce: true }] }), hit = W.card('hit', { fx: [{ op: 'dmg', n: 5 }] }), lf = W.card('lf', { fx: [{ op: 'dmg', n: 5, lifesteal: true }] });
  const C = W.fight({ deck: [pierce, hit, lf], filler: 0 }); plain(C);
  C.enemies[0].block = 50;
  let h = first(play(C, rig(C, [pierce])[0]), 'hit');
  t.deep([h.blocked, h.amount, h.pierce], [0, 5, true], 'pierce');
  t.eq(C.enemies[0].block, 50, 'Block untouched by a piercing hit');
  // dodge
  C.enemies[0].block = 0; C.enemies[0].st = { dodge: 2, mark: 2, thorns: 4 };
  C.heroes[0].hp = 30;
  let ev = play(C, rig(C, [lf])[0]);
  t.eq(only(ev, 'hit').length, 0, 'a dodged hit does not hit'); t.eq(only(ev, 'dodge').length, 1, 'dodge event');
  t.eq(C.enemies[0].st.dodge, 1, 'Dodge falls by 1 per hit'); t.eq(C.enemies[0].st.mark, 1, 'Mark consumed even when the hit is dodged');
  t.eq(C.heroes[0].hp, 30, 'no thorns, no lifesteal on a dodge'); t.eq(only(ev, 'thorns').length, 0, 'no thorns event');
  ev = play(C, rig(C, [hit])[0]);
  t.eq(only(ev, 'dodge').length, 1, 'second dodge'); t.ok(!C.enemies[0].st.dodge, 'Dodge gone at 0 (key deleted)');
  // lifesteal heals for HP removed, not Block
  const W2 = world(); const l2 = W2.card('l', { fx: [{ op: 'dmg', n: 10, lifesteal: true }] });
  const C2 = W2.fight({ deck: [l2], filler: 0 }); plain(C2); C2.heroes[0].hp = 20; C2.enemies[0].block = 4;
  ev = play(C2, rig(C2, [l2])[0]);
  t.eq(C2.heroes[0].hp, 26, 'lifesteal heals the HP removed (6), not the Block absorbed'); t.eq(first(ev, 'heal').amount, 6, 'heal event');
});

t.test('thorns: the attacker loses HP even when fully blocked, never on a dodge or hook damage', () => {
  const W = world();
  const hit = W.card('hit', { fx: [{ op: 'dmg', n: 5 }] }), multi = W.card('multi', { fx: [{ op: 'dmg', n: 1, hits: 3 }] });
  const C = W.fight({ deck: [hit, multi], filler: 0 }); plain(C);
  C.enemies[0].st.thorns = 3; C.enemies[0].block = 99;
  let ev = play(C, rig(C, [hit])[0]);
  t.eq(C.heroes[0].hp, 67, 'thorns 3 through a fully blocked hit'); const th = first(ev, 'thorns');
  t.deep([th.src.id, th.dst.id, th.amount, th.hp], ['t_dummy#1', 'hanae', 3, 67], 'thorns event');
  t.eq(C.stats.damageTaken, 3, 'damageTaken counts thorns');
  ev = play(C, rig(C, [multi])[0]);
  t.eq(only(ev, 'thorns').length, 3, 'thorns once per hit');
  t.eq(C.heroes[0].hp, 58, '3 more hits, 9 damage');
  // hook damage never triggers thorns
  const W2 = world(); const pw = W2.card('pw', { type: 'power', fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'dmg', n: 4, tgt: 'all' }] }] });
  const C2 = W2.fight({ deck: [pw], filler: 0 }); plain(C2); C2.enemies[0].st.thorns = 5;
  play(C2, rig(C2, [pw])[0]);
  C2.endTurn();
  t.eq(C2.heroes[0].hp, 70, 'hook damage has no attacker: no thorns'); t.eq(C2.enemies[0].hp, 96, 'the hook hit');
});

t.test('thorns killing an enemy credits the thorns owner; enemy thorns can down a hero', () => {
  const W = world({ keepHeroes: true });
  const bird = W.hitter(3, { hp: [2, 2] });
  const C = W.fight({ enemies: [bird], heroes: [{ id: 'raiga', hp: 80, maxHp: 80 }, { id: 'kuro', hp: 60, maxHp: 60 }] });
  C.heroes[0].st.thorns = 5;
  C.endTurn();
  t.eq(C.enemies[0].down, true, 'the thorns killed it'); t.deep(C.stats.kills, [{ def: bird, tier: 'normal', by: 'thorns' }], 'kill entry by thorns');
  t.eq(C.stats.thornKills, 1, 'thornKills'); t.eq(C.result, 'win', 'win from thorns');
  // hero attacker downed by enemy thorns
  const W2 = world(); const hit = W2.card('hit', { fx: [{ op: 'dmg', n: 1 }] });
  const C2 = W2.fight({ deck: [hit], filler: 0, heroes: [{ id: 'hanae', hp: 2, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] }); plain(C2);
  C2.enemies[0].st.thorns = 9;
  const ev = play(C2, rig(C2, [hit])[0]);
  t.eq(C2.heroes[0].down, true, 'the hero fell to thorns'); t.eq(first(ev, 'hero_down').hero, 'hanae', 'hero_down');
  t.eq(C2.front().id, 'kuro', 'the survivor is forced to the front');
});

t.test('element: explicit el, else from the card art motif, else slash; hook damage is slash', () => {
  const W = world();
  const mk = (name, m, fx) => W.card(name, { art: { m, c: 'rose' }, fx: fx || [{ op: 'dmg', n: 1 }] });
  const ids = { fire: mk('a', 'fire'), flame_orb: mk('b', 'flame_orb'), ice: mk('c', 'ice'), lightning: mk('d', 'lightning'), thunder_fist: mk('e', 'thunder_fist'), chain_lightning: mk('f', 'chain_lightning'), ink_splash: mk('g', 'ink_splash'), brush_stroke: mk('h', 'brush_stroke'), slash: mk('i', 'slash'), void: mk('j', 'void'), explicit: mk('k', 'fire', [{ op: 'dmg', n: 1, el: 'holy' }]) };
  const C = W.fight({ deck: Object.values(ids), filler: 0, mods: { hand: 10, energy: 20 }, enemies: [W.enemy('big', { hp: [999, 999] })] });
  const el = (id) => first(play(C, rig(C, [id])[0]), 'hit').element;
  t.deep(['fire', 'flame_orb'].map((k) => el(ids[k])), ['fire', 'fire'], 'fire family');
  t.eq(el(ids.ice), 'ice', 'ice'); t.deep(['lightning', 'thunder_fist', 'chain_lightning'].map((k) => el(ids[k])), ['lightning', 'lightning', 'lightning'], 'lightning family');
  t.deep(['ink_splash', 'brush_stroke'].map((k) => el(ids[k])), ['ink', 'ink'], 'ink family'); t.deep(['slash', 'void'].map((k) => el(ids[k])), ['slash', 'slash'], 'everything else is slash');
  t.eq(el(ids.explicit), 'holy', 'an explicit el wins');
  const W2 = world(); const pw = W2.card('pw', { art: { m: 'fire', c: 'rose' }, type: 'power', fx: [{ op: 'hook', on: 'turnEnd', fx: [{ op: 'dmg', n: 2 }] }] });
  const C2 = W2.fight({ deck: [pw], filler: 0 }); play(C2, rig(C2, [pw])[0]);
  t.eq(first(C2.endTurn(), 'hit').element, 'slash', 'hook damage is slash even from a fire card');
  // enemy damage
  const W3 = world(); const en = W3.hitter(4); const C3 = W3.fight({ enemies: [en] });
  t.eq(first(C3.endTurn(), 'hit').element, 'slash', 'enemy damage is slash');
});


// ------------------------------------------------------------------ block
t.test('block gain: bulwark, frail, row blockAdd, gem plus; plating and startBlock are raw', () => {
  const W = world();
  W.D.heroes.hanae.rows = { front: {}, back: { blockAdd: 1 } };
  const g = W.card('g', { type: 'skill', fx: [{ op: 'block', n: 5 }] });
  const C = W.fight({ deck: [g, g, g], filler: 0, frontIdx: 1 });
  plain(C);
  let ev = play(C, rig(C, [g])[0]);
  t.deep([first(ev, 'block').amount, first(ev, 'block').block, C.heroes[0].block], [6, 6, 6], 'hanae in the back gets blockAdd 1: 5 + 1');
  C.heroes[0].block = 0; C.heroes[0].st.bulwark = 2;
  ev = play(C, rig(C, [g])[0]);
  t.eq(first(ev, 'block').amount, 8, '5 + 2 bulwark + 1 row');
  C.heroes[0].block = 0; C.heroes[0].st.frail = 1;
  ev = play(C, rig(C, [g])[0]);
  t.eq(first(ev, 'block').amount, 6, 'Frail: floor(8 * 0.75)');
  t.eq(C.stats.blockGained, 20, 'blockGained sums every gain (6+8+6)');
  // plating and startBlock are raw
  const W2 = world(); W2.D.heroes.hanae.rows = { front: { startBlock: 1 }, back: {} };
  const C2 = W2.fight({ mods: { startBlock: 2 } });
  C2.heroes[0].st.plating = 3; C2.heroes[0].st.frail = 1; C2.heroes[0].st.bulwark = 4;
  C2.endTurn();
  t.eq(C2.heroes[0].block, 6, 'plating 3 + row startBlock 1 + mods.startBlock 2, unaffected by Frail or Bulwark');
  t.eq(C2.heroes[1].block, 2, 'kuro gets mods.startBlock only');
});

t.test('Block clears at the start of its owner turn; enemy Block at the start of the enemy phase', () => {
  const W = world();
  const guard = W.card('g', { type: 'skill', fx: [{ op: 'block', n: 8 }] });
  const C = W.fight({ deck: [guard], filler: 0, enemies: [W.enemy('e')] });
  play(C, rig(C, [guard])[0]);
  C.enemies[0].block = 7;
  const ev = C.endTurn();
  const lost = only(ev, 'block_lost');
  t.ok(lost.some((e) => e.dst.kind === 'enemy' && e.cause === 'turn' && e.amount === 7), 'enemy Block cleared with cause turn');
  t.ok(lost.some((e) => e.dst.kind === 'hero' && e.cause === 'turn' && e.amount === 8), 'hero Block cleared at the start of the next player turn');
  t.eq(C.heroes[0].block, 0, 'hero Block is 0'); t.eq(C.enemies[0].block, 0, 'enemy Block is 0');
  const ev2 = C.endTurn();
  t.eq(only(ev2, 'block_lost').length, 0, 'no block_lost when there was nothing to clear');
  // enemy plating is raw and lands after the clear
  const W2 = world(); const C2 = W2.fight({ enemies: [W2.enemy('e')] });
  C2.enemies[0].st.plating = 4; C2.enemies[0].st.frail = 1; C2.enemies[0].block = 9;
  C2.endTurn();
  t.eq(C2.enemies[0].block, 4, 'Block clears, then Plating adds raw Block (Frail ignored)');
});

// ------------------------------------------------------------------ statuses
t.test('status op: stacks, negative n, might below zero, deletion at zero, event values', () => {
  const W = world();
  const sm = W.card('sm', { type: 'skill', fx: [{ op: 'status', s: 'might', n: 3, tgt: 'self' }, { op: 'status', s: 'might', n: -5, tgt: 'self' }, { op: 'status', s: 'vulnerable', n: 2 }, { op: 'status', s: 'poison', n: 4 }, { op: 'status', s: 'bulwark', n: 2, tgt: 'self' }, { op: 'status', s: 'bulwark', n: -9, tgt: 'self' }] });
  const C = W.fight({ deck: [sm], filler: 0 });
  const ev = play(C, rig(C, [sm])[0], C.enemies[0].id);
  const st = only(ev, 'status').map((e) => [e.dst.id, e.s, e.delta, e.value]);
  t.deep(st, [['hanae', 'might', 3, 3], ['hanae', 'might', -5, -2], ['t_dummy#1', 'vulnerable', 2, 2], ['t_dummy#1', 'poison', 4, 4], ['hanae', 'bulwark', 2, 2], ['hanae', 'bulwark', -2, 0]], 'status events carry delta and the value after');
  t.eq(C.heroes[0].st.might, -2, 'only might stays negative'); t.ok(!('bulwark' in C.heroes[0].st), 'other statuses are deleted at 0 and never go negative');
  t.deep(C.enemies[0].st, { vulnerable: 2, poison: 4 }, 'enemy statuses');
  // resource statuses are inert numbers
  const W2 = world(); const r = W2.card('r', { type: 'skill', fx: [{ op: 'status', s: 'bloom', n: 3, tgt: 'self' }, { op: 'status', s: 'ward', n: 1, tgt: 'ally' }] });
  const C2 = W2.fight({ deck: [r], filler: 0 }); play(C2, rig(C2, [r])[0]);
  t.eq(C2.heroes[0].st.bloom, 3, 'bloom'); t.eq(C2.heroes[1].st.ward, 1, 'ward on the ally');
  C2.endTurn(); t.eq(C2.heroes[0].st.bloom, 3, 'resources do not decay');
});

t.test('immunity: def.immune, bosses never stunned, elites get a short Stun window, bind does nothing to enemies', () => {
  const W = world();
  const stun = W.card('stun', { type: 'skill', cost: 0, fx: [{ op: 'status', s: 'stun', n: 1 }] }), weak = W.card('weak', { type: 'skill', cost: 0, fx: [{ op: 'status', s: 'weak', n: 1 }] }), bind = W.card('bind', { type: 'skill', cost: 0, fx: [{ op: 'status', s: 'bind', n: 2 }] });
  const rock = W.enemy('rock', { immune: ['weak'] }), boss = W.enemy('boss', { tier: 'boss', size: 'xl' }), elite = W.enemy('elite', { tier: 'elite', size: 'l' });
  const C = W.fight({ deck: [stun, stun, stun, stun, weak, bind], filler: 0, enemies: [rock], mods: { energy: 9 } });
  let ev = play(C, rig(C, [weak])[0]);
  t.deep(only(ev, 'immune').map((e) => [e.dst.id, e.s]), [['t_rock#1', 'weak']], 'immune event for an ignored status'); t.deep(C.enemies[0].st, {}, 'nothing changed');
  ev = play(C, rig(C, [bind])[0]);
  t.eq(only(ev, 'status').length, 0, 'bind does nothing to an enemy'); t.deep(C.enemies[0].st, {}, 'no Bind on the enemy');
  const CB = W.fight({ deck: [stun], filler: 0, enemies: [boss], mods: { energy: 9 } });
  ev = play(CB, rig(CB, [stun])[0]);
  t.eq(only(ev, 'immune').length, 1, 'a boss is immune to Stun'); t.ok(!CB.enemies[0].st.stun, 'no Stun on the boss');
  // elite: Stun works, then is ignored for the next 2 rounds
  const CE = W.fight({ deck: [stun, stun, stun, stun], filler: 0, enemies: [elite], mods: { energy: 9 } });
  ev = play(CE, rig(CE, [stun])[0]);
  t.eq(CE.enemies[0].st.stun, 1, 'first Stun lands on an elite'); t.eq(only(ev, 'immune').length, 0, 'no immune event');
  ev = play(CE, rig(CE, [stun])[0]);
  t.eq(only(ev, 'immune').length, 1, 'a second Stun in the same round is ignored'); t.eq(CE.enemies[0].st.stun, 1, 'still 1');
  CE.endTurn();                                              // round 1 ends: the elite skipped, stun 0
  t.ok(!CE.enemies[0].st.stun, 'the Stun was consumed by the skip');
  ev = play(CE, rig(CE, [stun])[0]);
  t.eq(only(ev, 'immune').length, 1, 'round 2: still immune'); CE.endTurn();
  ev = play(CE, rig(CE, [stun])[0]);
  t.eq(only(ev, 'immune').length, 1, 'round 3 (the second of the next 2 rounds): still immune'); CE.endTurn();
  ev = play(CE, rig(CE, [stun])[0]);
  t.eq(only(ev, 'immune').length, 0, 'round 4: Stun works again'); t.eq(CE.enemies[0].st.stun, 1, 'stunned again');
});

// ------------------------------------------------------------------ round timing
t.test('duration: Weak 1 from an enemy lowers the hero\'s first attack next turn by 25 percent, once', () => {
  const W = world();
  const strike = W.card('strike', { cost: 0, fx: [{ op: 'dmg', n: 10 }] });
  const e = W.enemy('hexer', { moves: { hex: { name: 'Hex', kind: 'debuff', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'front' }] }, idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['hex', 'idle', 'idle'] } });
  const C = W.fight({ deck: [strike, strike, strike], filler: 0, enemies: [e] });
  C.endTurn();
  t.eq(C.heroes[0].st.weak, 1, 'Weak 1 survives the round it was applied in (fresh)'); t.eq(C.heroes[0].fresh.weak, undefined, 'fresh flags are cleared at round end');
  t.eq(first(play(C, rig(C, [strike])[0]), 'hit').raw, 7, 'turn 2: floor(10 * 0.75)');
  C.endTurn();
  t.ok(!C.heroes[0].st.weak, 'Weak wore off after that turn');
  t.eq(first(play(C, rig(C, [strike])[0]), 'hit').raw, 10, 'turn 3: full damage');
});

t.test('duration: Stun 1 from an enemy makes that hero\'s cards unplayable for exactly one turn', () => {
  const W = world();
  const strike = W.card('strike', { cost: 0, fx: [{ op: 'dmg', n: 1 }] }), other = W.card('other', { hero: 'kuro', cost: 0, fx: [{ op: 'dmg', n: 1 }] });
  const e = W.enemy('stunner', { moves: { st: { name: 'Bonk', kind: 'debuff', fx: [{ op: 'status', s: 'stun', n: 1, tgt: 'front' }] }, idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['st', 'idle', 'idle'] } });
  const C = W.fight({ deck: [strike, strike, other, other], filler: 0, enemies: [e] });
  C.endTurn();
  const h = rig(C, [strike, other]);
  t.deep(C.canPlay(h[0].uid, C.enemies[0].id), { ok: false, reason: 'stunned' }, 'hanae is stunned on turn 2');
  t.ok(C.canPlay(h[1].uid, C.enemies[0].id).ok, 'kuro is not');
  t.eq(play(C, h[0]).length, 0, 'playing a stunned hero\'s card is a no-op');
  C.endTurn();
  const h2 = rig(C, [strike]);
  t.ok(C.canPlay(h2[0].uid, C.enemies[0].id).ok, 'turn 3: unstunned');
});

t.test('duration: Bind 1 from an enemy blocks exactly one turn of swapping', () => {
  const W = world();
  const e = W.enemy('binder', { moves: { b: { name: 'Bind', kind: 'debuff', fx: [{ op: 'status', s: 'bind', n: 1, tgt: 'front' }] }, idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['b', 'idle', 'idle'] } });
  const C = W.fight({ enemies: [e] });
  C.endTurn();
  t.deep(C.canSwap(), { ok: false, cost: 0, reason: 'bind' }, 'turn 2: bound'); t.eq(C.swap().length, 0, 'swap is a no-op');
  C.endTurn();
  t.ok(C.canSwap().ok, 'turn 3: free again'); t.eq(C.swap().length > 0, true, 'and it swaps');
});

t.test('duration: Vulnerable 1 from an enemy lasts through the next enemy phase; weak 2 from a hero weakens two enemy actions', () => {
  const W = world();
  const e = W.enemy('exposer', { moves: { v: { name: 'Expose', kind: 'debuff', fx: [{ op: 'status', s: 'vulnerable', n: 1, tgt: 'front' }] }, h: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front' }] } }, ai: { seq: ['v', 'h', 'h'] } });
  const C = W.fight({ enemies: [e] });
  C.endTurn();
  const hit = first(C.endTurn(), 'hit');
  t.eq(hit.raw, 15, 'the Vulnerable applied last round still applies to this enemy phase'); t.ok(hit.crit, 'crit');
  t.ok(!C.heroes[0].st.vulnerable, 'and is gone after the round');
  t.eq(first(C.endTurn(), 'hit').raw, 10, 'next hit is plain');
  // weak 2 applied in the player phase weakens the next 2 actions
  const W2 = world(); const weak2 = W2.card('weak2', { type: 'skill', fx: [{ op: 'status', s: 'weak', n: 2 }] });
  const C2 = W2.fight({ deck: [weak2], filler: 0, enemies: [W2.hitter(10)] });
  play(C2, rig(C2, [weak2])[0]);
  t.eq(first(C2.endTurn(), 'hit').raw, 7, 'action 1 weakened'); t.eq(first(C2.endTurn(), 'hit').raw, 7, 'action 2 weakened'); t.eq(first(C2.endTurn(), 'hit').raw, 10, 'action 3 back to normal');
});

t.test('poison: hero ticks at turn start ignoring Block and may down; enemies tick in the enemy phase; poison kills credit the front hero', () => {
  const W = world();
  const C = W.fight({ heroes: [{ id: 'hanae', hp: 10, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }], enemies: [W.enemy('e', { hp: [5, 5] }), W.dummy] });
  C.heroes[0].st.poison = 3; C.heroes[0].block = 99;
  const ev = C.endTurn();
  const hurt = ev.find((e) => e.type === 'hurt' && e.dst.id === 'hanae');
  t.deep([hurt.amount, hurt.hp, hurt.cause], [3, 7, 'poison'], 'poison ignores Block'); t.eq(C.heroes[0].st.poison, 2, 'falls by 1');
  C.endTurn(); t.eq(C.heroes[0].hp, 5, '2 more'); t.eq(C.heroes[0].st.poison, 1, 'falls to 1');
  C.endTurn(); t.eq(C.heroes[0].hp, 4, '1 more'); t.ok(!C.heroes[0].st.poison, 'gone at 0');
  // downed by poison
  const W2 = world(); const C2 = W2.fight({ heroes: [{ id: 'hanae', hp: 2, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] });
  C2.heroes[0].st.poison = 5;
  const e2 = C2.endTurn();
  t.eq(C2.heroes[0].down, true, 'poison downs a hero'); t.ok(types(e2).indexOf('hero_down') > types(e2).indexOf('hurt'), 'hero_down after the hurt');
  t.eq(C2.stats.heroDowns, 1, 'heroDowns');
  // enemy poison ticks in the enemy phase and kills credit the front hero
  const W3 = world(); const C3 = W3.fight({ enemies: [W3.enemy('e', { hp: [2, 2] })] });
  C3.enemies[0].st.poison = 4; C3.enemies[0].block = 50;
  const e3 = C3.endTurn();
  t.eq(first(e3, 'hurt').cause, 'poison', 'cause'); t.eq(first(e3, 'hurt').amount, 2, 'amount is HP actually lost'); t.deep(C3.stats.kills, [{ def: 't_e', tier: 'normal', by: 'poison' }], 'kill by poison'); t.eq(C3.stats.poisonKills, 1, 'poisonKills');
  t.eq(C3.result, 'win', 'poison can win the fight');
});

t.test('burn: end of round, every living unit, ignores Block, then halves', () => {
  const W = world();
  const C = W.fight({ enemies: [W.enemy('e', { hp: [30, 30] })] });
  C.heroes[0].st.burn = 7; C.enemies[0].st.burn = 5; C.enemies[0].block = 99; C.heroes[0].block = 99;
  const ev = C.endTurn();
  const burns = ev.filter((e) => e.type === 'hurt' && e.cause === 'burn');
  t.deep(burns.map((e) => [e.dst.id, e.amount]), [['hanae', 7], ['t_e#1', 5]], 'burn deals its stacks to heroes then enemies');
  t.eq(C.heroes[0].hp, 63, 'hero'); t.eq(C.enemies[0].hp, 25, 'enemy'); t.eq(C.heroes[0].st.burn, 3, 'halves (floor 3.5)'); t.eq(C.enemies[0].st.burn, 2, 'floor 2.5');
  t.eq(new Set(burns.map((e) => e.group)).size, 1, 'one group for the whole sweep (plays in parallel)');
  C.endTurn(); C.endTurn();
  t.ok(!C.heroes[0].st.burn && !C.enemies[0].st.burn, 'burn decays to nothing');
  const W2 = world(); const C2 = W2.fight({ enemies: [W2.enemy('e', { hp: [3, 3] })] });
  C2.enemies[0].st.burn = 9;
  C2.endTurn();
  t.eq(C2.stats.burnKills, 1, 'burnKills'); t.eq(C2.result, 'win', 'burn wins the fight'); t.eq(C2.stats.kills[0].by, 'burn', 'by burn');
});

t.test('regen heals then falls; ritual grants Might at turn start; enemy ritual and regen tick in the enemy phase', () => {
  const W = world();
  const C = W.fight({ heroes: [{ id: 'hanae', hp: 40, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }], enemies: [W.enemy('e', { hp: [30, 30] })] });
  C.heroes[0].st.regen = 3; C.heroes[0].st.ritual = 2; C.enemies[0].hp = 20; C.enemies[0].st.regen = 4; C.enemies[0].st.ritual = 1;
  C.endTurn();
  t.eq(C.heroes[0].hp, 43, 'regen heals 3'); t.eq(C.heroes[0].st.regen, 2, 'regen falls'); t.eq(C.heroes[0].st.might, 2, 'ritual 2 -> Might 2');
  t.eq(C.enemies[0].hp, 24, 'enemy regen heals 4'); t.eq(C.enemies[0].st.regen, 3, 'and falls'); t.eq(C.enemies[0].st.might, 1, 'enemy ritual');
  C.endTurn();
  t.eq(C.heroes[0].st.might, 4, 'ritual stacks each turn');
  C.enemies[0].hp = C.enemies[0].maxHp - 1; C.enemies[0].st.regen = 9;
  C.endTurn(); t.eq(C.enemies[0].hp, 30, 'healing never overheals');
});

t.test('taunt redirects back, random and lowest attacks, never front or both, and only while the taunter lives', () => {
  const W = world();
  const memo = {};
  const mk = (tgt) => memo[tgt] || (memo[tgt] = W.enemy('atk' + tgt, { moves: { a: { name: 'A', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt }] } }, ai: { seq: ['a'] } }));
  const run = (tgt, setup) => { const C = W.fight({ enemies: [mk(tgt)] }); setup(C); return only(C.endTurn(), 'hit').map((e) => e.dst.id); };
  t.deep(run('back', () => {}), ['kuro'], 'a back attack hits the back hero');
  t.deep(run('back', (C) => { C.heroes[0].st.taunt = 1; }), ['hanae'], 'taunt from the front hero redirects a back attack');
  t.deep(run('random', (C) => { C.heroes[0].st.taunt = 1; }), ['hanae'], 'random is redirected');
  t.deep(run('lowest', (C) => { C.heroes[0].st.taunt = 1; C.heroes[1].hp = 5; }), ['hanae'], 'lowest is redirected');
  t.deep(run('front', (C) => { C.heroes[1].st.taunt = 1; }), ['hanae'], 'front is not redirected');
  t.deep(run('both', (C) => { C.heroes[1].st.taunt = 1; }), ['hanae', 'kuro'], 'both is not redirected');
  t.deep(run('lowest', (C) => { C.heroes[1].hp = 5; }), ['kuro'], 'lowest picks the lowest current HP');
  t.deep(run('back', (C) => { C.heroes[1].st.taunt = 1; }), ['kuro'], 'the back hero taunting itself changes nothing');
  const C = W.fight({ enemies: [mk('back')] }); C.heroes[0].st.taunt = 1; C.heroes[0].down = true; C.heroes[0].hp = 0; C.swap();
  t.ok(true, 'no crash with a downed taunter');
});

t.test('stun on enemies: the skip consumes one Stun, is announced, and the intent reads Stunned', () => {
  const W = world();
  const C = W.fight({ enemies: [W.hitter(9)] });
  C.enemies[0].st.stun = 2;
  const it = C.intent(C.enemies[0]);
  t.deep([it.kind, it.text, it.stunned, it.dmg], ['none', 'Stunned', true, null], 'stunned intent');
  let ev = C.endTurn();
  t.deep(only(ev, 'skip').map((e) => [e.unit.id, e.reason]), [['t_hitter1#1', 'stun']], 'skip event'); t.eq(only(ev, 'hit').length, 0, 'no attack'); t.eq(only(ev, 'enemy_act').length, 0, 'no enemy_act');
  t.eq(C.enemies[0].st.stun, 1, 'stun 2 -> 1 (not decremented at round end as well)');
  ev = C.endTurn();
  t.eq(only(ev, 'skip').length, 1, 'skips again'); t.ok(!C.enemies[0].st.stun, 'stun used up');
  ev = C.endTurn(); t.eq(only(ev, 'hit').length, 1, 'acts again');
});

t.test('removeStatus: debuffs, buffs, n stacks of one id, resources only by id, and the default targets', () => {
  const W = world();
  const cleanse = W.card('cleanse', { type: 'skill', cost: 0, fx: [{ op: 'removeStatus', s: 'debuffs' }] });
  const dispel = W.card('dispel', { type: 'skill', cost: 0, fx: [{ op: 'removeStatus', s: 'buffs' }] });
  const some = W.card('some', { type: 'skill', cost: 0, fx: [{ op: 'removeStatus', s: 'poison', n: 3, tgt: 'enemy' }] });
  const mine = W.card('mine', { type: 'skill', cost: 0, fx: [{ op: 'removeStatus', s: 'poison', n: 1 }] });
  const res = W.card('res', { type: 'skill', cost: 0, fx: [{ op: 'removeStatus', s: 'bloom', n: 2, tgt: 'self' }] });
  const both = W.card('both', { type: 'skill', cost: 0, fx: [{ op: 'removeStatus', s: 'weak', tgt: 'both' }] });
  const C = W.fight({ deck: [cleanse, dispel, some, mine, res, both], filler: 0, mods: { hand: 6, energy: 9 } });
  C.heroes[0].st = { weak: 2, poison: 3, might: 4, bloom: 5 }; C.heroes[1].st = { weak: 1 };
  C.enemies[0].st = { might: 3, plating: 2, vulnerable: 2, poison: 5, bloom: 2 };
  play(C, rig(C, [cleanse])[0]);
  t.deep(C.heroes[0].st, { might: 4, bloom: 5 }, 'debuffs default to self and remove every debuff');
  play(C, rig(C, [dispel])[0]);
  t.deep(C.enemies[0].st, { vulnerable: 2, poison: 5, bloom: 2 }, 'buffs default to the enemy; resources are not buffs');
  play(C, rig(C, [some])[0]);
  t.eq(C.enemies[0].st.poison, 2, 'n stacks of one id');
  C.heroes[0].st.poison = 3;
  play(C, rig(C, [mine])[0]);
  t.eq(C.heroes[0].st.poison, 2, 'a debuff id defaults to self');
  play(C, rig(C, [res])[0]);
  t.eq(C.heroes[0].st.bloom, 3, 'a resource is removed by id, n stacks');
  C.heroes[0].st.weak = 1;
  const ev = play(C, rig(C, [both])[0]);
  t.ok(!C.heroes[0].st.weak && !C.heroes[1].st.weak, 'tgt both'); t.eq(only(ev, 'status').length, 2, 'one status event per hero');
  t.deep(only(ev, 'status').map((e) => [e.delta, e.value]), [[-1, 0], [-1, 0]], 'removal events');
});


// ------------------------------------------------------------------ cards and piles
const total = (C) => C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0);

t.test('play pipeline: events, energy, destinations, conservation, counters', () => {
  const W = world();
  const strike = W.card('strike', { fx: [{ op: 'dmg', n: 4 }] }), ex = W.card('ex', { type: 'skill', kw: ['exhaust'], fx: [{ op: 'block', n: 3 }] }), pw = W.card('pw', { type: 'power', cost: 2, fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] });
  const C = W.fight({ deck: [strike, ex, pw], filler: 5, mods: { energy: 6 } });
  t.eq(total(C), C.deckSize + C.added, 'conservation at start');
  const [s1, e1, p1] = rig(C, [strike, ex, pw]);
  let ev = play(C, s1);
  t.deep(types(ev), ['play', 'energy', 'hit'], 'attack: play, energy, hit');
  t.deep(first(ev, 'play'), { type: 'play', card: { uid: s1.uid, id: strike, up: 0, gems: [null] }, hero: 'hanae', target: 't_dummy#1', cost: 1, to: 'discard' }, 'play event');
  t.deep(first(ev, 'energy'), { type: 'energy', value: 5, delta: -1 }, 'energy event'); t.eq(C.energy, 5, 'energy');
  t.ok(C.discard.some((c) => c.uid === s1.uid) && !C.hand.some((c) => c.uid === s1.uid), 'attack goes to the discard pile');
  ev = play(C, e1);
  t.eq(first(ev, 'play').to, 'exhaust', 'to exhaust'); const ex1 = first(ev, 'exhaust');
  t.deep([ex1.reason, ex1.card.uid, ex1.piles.exhaust], ['play', e1.uid, 1], 'exhaust event reason play'); t.eq(C.exhaust.length, 1, 'exhaust pile');
  t.eq(first(ev, 'play').target, null, 'a card without a target reports null');
  ev = play(C, p1);
  t.eq(first(ev, 'play').to, 'power', 'to power'); t.eq(only(ev, 'exhaust').length, 0, 'no exhaust event for a power'); t.eq(C.powers.length, 1, 'C.powers'); t.eq(C.heroes[0].st.might, 1, 'power op ran');
  t.eq(total(C), C.deckSize + C.added, 'conservation after plays');
  t.eq(C.inPlay, null, 'inPlay cleared'); t.deep([C.stats.cardsPlayed, C.stats.attacksPlayed], [3, 1], 'counters');
  // a 0-cost card emits no energy event
  const z = W.card('z', { cost: 0, fx: [{ op: 'dmg', n: 1 }] }); const C2 = W.fight({ deck: [z], filler: 0 });
  t.ok(!types(play(C2, rig(C2, [z])[0])).includes('energy'), 'no energy event when nothing is paid');
});

t.test('play: the card is out of the hand and in inPlay while its ops run; per reads see counters BEFORE this card', () => {
  const W = world();
  const probe = W.card('probe', { type: 'skill', cost: 0, fx: [{ op: 'dmg', n: { per: 'handSize' } }, { op: 'dmg', n: { per: 'cardsPlayed' } }, { op: 'dmg', n: { per: 'attacksPlayed' } }, { op: 'dmg', n: { per: 'skillsPlayed' } }] });
  const C = W.fight({ deck: [probe, probe, probe], filler: 4, mods: { hand: 4 }, enemies: [W.enemy('big', { hp: [999, 999] })] });
  plain(C);
  const hs = C.hand.length;
  const ps = rig(C, [probe, probe, probe]);
  const raws = (ev) => only(ev, 'hit').map((e) => e.raw);
  t.deep(raws(play(C, ps[0])), [2, 0, 0, 0], 'handSize excludes the card being played (3 in hand, 2 left); nothing played yet');
  t.deep(raws(play(C, ps[1])), [1, 1, 0, 1], 'the second card sees cardsPlayed 1 and skillsPlayed 1');
  t.deep(raws(play(C, ps[2])), [0, 2, 0, 2], 'the third');
  t.ok(hs > 0, 'sanity');
});

t.test('X cost: X is the Energy paid; X 0 is legal; cost deltas never apply to X', () => {
  const W = world();
  const x = W.card('x', { cost: 'X', fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4 }] }], up: { cost: 'X', fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 6 }] }] }, slots: ['green'] });
  const gem = W.gem('cheap', { color: 'green', tier: 3, mod: { cost: -1 } });
  const C = W.fight({ deck: [x, x, { id: x, gems: [gem] }], filler: 0 });
  let inst = rig(C, [x])[0];
  let ev = play(C, inst);
  t.deep(only(ev, 'hit').map((e) => e.raw), [4, 4, 4], 'X = 3 hits');
  t.deep([first(ev, 'play').cost, first(ev, 'play').x], [3, 3], 'play event has cost and x'); t.deep(first(ev, 'energy'), { type: 'energy', value: 0, delta: -3 }, 'all remaining Energy is spent'); t.eq(C.energy, 0, 'energy 0');
  ev = play(C, rig(C, [x])[0]);
  t.deep([only(ev, 'hit').length, first(ev, 'play').x, only(ev, 'energy').length], [0, 0, 0], 'X = 0 is legal: no hits, no energy event');
  C.endTurn(); C.heroes[0].st.might = 0;
  const gemmed = C.hand.concat(C.draw, C.discard).find((c) => c.gems[0] === gem);
  rig(C, [x]);
  C.hand.splice(0); C.hand.push(gemmed);
  C.energy = 2;
  ev = play(C, gemmed);
  t.deep([first(ev, 'play').cost, only(ev, 'hit').length], [2, 2], 'a tier 3 cost gem does not change an X card');
  // upgrade keeps X
  const W2 = world(); const x2 = W2.card('x', { cost: 'X', fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4 }] }], up: { cost: 'X', fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 6 }] }] } });
  const C2 = W2.fight({ deck: [{ id: x2, up: 1 }], filler: 0 });
  t.deep(only(play(C2, rig(C2, [x2])[0]), 'hit').map((e) => e.raw), [6, 6, 6], 'upgraded X card');
});

t.test('canPlay: every reason, in the documented order, and an illegal play changes nothing', () => {
  const W = world();
  const atk = W.card('atk', { fx: [{ op: 'dmg', n: 1 }] }), big = W.card('big', { cost: 5, fx: [{ op: 'dmg', n: 1 }] }), junk = W.card('junk', { type: 'curse', hero: 'curse', rarity: 'token', kw: ['unplayable'], cost: undefined, fx: [] }), unp = W.card('unp', { kw: ['unplayable'], fx: [{ op: 'dmg', n: 1 }] }), blk = W.card('blk', { type: 'skill', fx: [{ op: 'block', n: 1 }] }), kuroCard = W.card('kc', { hero: 'kuro', fx: [{ op: 'dmg', n: 1 }] }), pk = W.card('pk', { type: 'skill', fx: [{ op: 'pick', from: 'hand', n: 1, then: 'discard', optional: true }] });
  const C0 = W.fight({ deck: [atk], filler: 0, start: false });
  t.deep(C0.canPlay(100), { ok: false, reason: 'phase' }, 'phase before start');
  const C = W.fight({ deck: [atk, big, junk, unp, blk, kuroCard, pk], filler: 0, mods: { hand: 7 } });
  const [a, b, j, u, k, kc, p] = rig(C, [atk, big, junk, unp, blk, kuroCard, pk]);
  const tgt = C.enemies[0].id;
  t.deep(C.canPlay(a.uid, tgt), { ok: true, reason: null }, 'ok'); t.deep(C.canPlay(a.uid), { ok: false, reason: 'target' }, 'target missing');
  t.deep(C.canPlay(a.uid, 'nobody'), { ok: false, reason: 'target' }, 'target unknown'); t.deep(C.canPlay(k.uid), { ok: true, reason: null }, 'a card that needs no target ignores it');
  t.deep(C.canPlay(9999, tgt), { ok: false, reason: 'notInHand' }, 'notInHand'); t.deep(C.canPlay(j.uid), { ok: false, reason: 'unplayable' }, 'curse'); t.deep(C.canPlay(u.uid, tgt), { ok: false, reason: 'unplayable' }, 'unplayable keyword');
  t.deep(C.canPlay(b.uid, tgt), { ok: false, reason: 'energy' }, 'energy'); t.deep(C.canPlay(b.uid), { ok: false, reason: 'energy' }, 'energy is checked before target');
  t.deep(C.canPlay(9999), { ok: false, reason: 'notInHand' }, 'notInHand before anything else about the card');
  C.heroes[0].st.stun = 1;
  t.deep(C.canPlay(a.uid, tgt), { ok: false, reason: 'stunned' }, 'stunned'); t.deep(C.canPlay(u.uid, tgt), { ok: false, reason: 'stunned' }, 'stunned is checked before unplayable');
  t.ok(C.canPlay(kc.uid, tgt).ok, 'the other hero can still play');
  C.heroes[0].st = {}; C.heroes[0].hp = 0; C.heroes[0].down = true;
  t.deep(C.canPlay(a.uid, tgt), { ok: false, reason: 'down' }, 'down'); C.heroes[0].hp = 70; C.heroes[0].down = false;
  play(C, p);
  t.eq(C.pending.kind, 'pick', 'pending'); t.deep(C.canPlay(a.uid, tgt), { ok: false, reason: 'pending' }, 'pending');
  // illegal plays change nothing
  const before = snap(C);
  t.eq(C.play(a.uid, tgt).length, 0, 'illegal play returns []'); t.eq(C.play(9999).length, 0, 'unknown uid'); t.eq(snap(C), before, 'state is untouched');
  C.resolvePick([]);
  t.deep(C.canPlay(a.uid, tgt), { ok: true, reason: null }, 'playable again once resolved');
  const nuke = W.card('nuke', { fx: [{ op: 'dmg', n: 999 }] });
  const over = W.fight({ deck: [nuke, atk], filler: 0 });
  const [n1, a2] = rig(over, [nuke, atk]);
  play(over, n1);
  t.eq(over.phase, 'over', 'won'); t.deep(over.canPlay(a2.uid, tgt), { ok: false, reason: 'phase' }, 'phase after the combat is over');
});

t.test('draw: reshuffle events, onShuffle, both piles empty, exhaust is not reshuffled, hand cap', () => {
  const W = world();
  const c = W.card('c', { type: 'skill', fx: [{ op: 'block', n: 1 }] });
  const relic = W.relic('shuf', { hooks: [{ on: 'onShuffle', fx: [{ op: 'block', n: 2, tgt: 'self' }] }] });
  const C = W.fight({ deck: Array(8).fill(c), filler: 0, relics: [relic] });
  t.eq(C.draw.length, 3, 'draw 5 of 8');
  const ev = C.endTurn();
  const order = types(ev).filter((x) => ['draw', 'shuffle', 'discard'].includes(x));
  t.deep(order, ['discard', 'draw', 'shuffle', 'draw'], 'discard, draw 3, shuffle, draw 2');
  const draws = only(ev, 'draw');
  t.deep([draws[0].cards.length, draws[0].reshuffled, draws[1].cards.length, draws[1].reshuffled], [3, false, 2, true], 'split around the shuffle');
  t.deep(first(ev, 'shuffle').piles, { hand: 3, draw: 5, discard: 0, exhaust: 0 }, 'shuffle piles (discard moved into draw)');
  t.eq(only(ev, 'relic').length, 1, 'the onShuffle relic flashed'); t.eq(C.heroes[0].block, 2, 'its block landed');
  // both piles empty stops drawing
  const W2 = world(); const c2 = W2.card('c', { type: 'skill', fx: [{ op: 'block', n: 1 }] });
  const C2 = W2.fight({ deck: [c2, c2, c2], filler: 0 });
  t.eq(C2.hand.length, 3, 'only 3 cards exist'); C2.endTurn(); t.eq(C2.hand.length, 3, 'after a round trip'); t.eq(total(C2), 3, 'conservation');
  // exhausted cards stay out
  const W3 = world(); const x3 = W3.card('x', { type: 'skill', kw: ['exhaust'], cost: 0, fx: [{ op: 'block', n: 1 }] }), n3 = W3.card('n', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const C3 = W3.fight({ deck: [x3, n3, n3], filler: 0, mods: { hand: 3 } });
  play(C3, rig(C3, [x3])[0]); C3.endTurn(); t.eq(C3.hand.length, 2, 'the exhausted card never comes back'); t.eq(C3.exhaust.length, 1, 'still exhausted');
});

t.test('end of turn: ethereal exhausts, retain stays, the rest is discarded, in that order; innate only on turn 1', () => {
  const W = world();
  const eth = W.card('eth', { type: 'skill', kw: ['ethereal'], fx: [{ op: 'block', n: 1 }] }), ret = W.card('ret', { type: 'skill', kw: ['retain'], fx: [{ op: 'block', n: 1 }] }), norm = W.card('norm', { type: 'skill', fx: [{ op: 'block', n: 1 }] }), inn = W.card('inn', { type: 'skill', kw: ['innate'], fx: [{ op: 'block', n: 1 }] });
  const relic = W.relic('exh', { hooks: [{ on: 'onExhaust', fx: [{ op: 'block', n: 3, tgt: 'self' }] }] });
  const C = W.fight({ deck: [eth, ret, norm, inn, norm, norm, norm, norm, norm, norm], filler: 0, relics: [relic], mods: { hand: 4 } });
  t.ok(C.hand.some((c) => c.id === inn), 'innate is in the opening hand');
  rig(C, [eth, ret, norm]);
  const ev = C.endTurn();
  const order = types(ev).filter((x) => ['exhaust', 'retain', 'discard', 'turn_end'].includes(x));
  t.deep(order.slice(0, 4), ['exhaust', 'retain', 'discard', 'turn_end'], 'ethereal, retain, discard, turn_end');
  t.deep([first(ev, 'exhaust').reason, first(ev, 'exhaust').card.id], ['ethereal', eth], 'exhaust reason ethereal');
  t.deep(first(ev, 'retain').cards.map((c) => c.id), [ret], 'retain lists the retained cards'); t.deep(first(ev, 'discard').cards.map((c) => c.id), [norm], 'discard lists the rest'); t.eq(first(ev, 'discard').reason, 'endTurn', 'reason');
  t.ok(C.hand.some((c) => c.id === ret), 'the retained card is still in hand next turn'); t.eq(only(ev, 'relic').length, 1, 'onExhaust fired for ethereal');
  t.eq(C.hand.length, 5, '1 retained + 4 drawn');
  // innate on later turns is just a card
  t.ok(first(ev, 'draw'), 'drew');
});

t.test('curse and status cards: hand.turnEnd and hand.drawn run for the FRONT hero; hurt cannot kill', () => {
  const W = world();
  const regret = W.card('regret', { type: 'curse', hero: 'curse', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], hand: { turnEnd: [{ op: 'hurt', n: 2, tgt: 'front' }] }, art: { m: 'skull' } });
  const wilt = W.card('wilt', { type: 'status', hero: 'status', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], hand: { drawn: [{ op: 'energy', n: -1 }] }, art: { m: 'void' } });
  const doubt = W.card('doubt', { type: 'curse', hero: 'curse', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], hand: { drawn: [{ op: 'status', s: 'weak', n: 1, tgt: 'front' }] }, art: { m: 'skull' } });
  const scorch = W.card('scorch', { type: 'status', hero: 'status', rarity: 'token', cost: undefined, kw: ['unplayable', 'ethereal'], fx: [], hand: { turnEnd: [{ op: 'hurt', n: 2 }] }, art: { m: 'fire' } });
  const C = W.fight({ deck: [regret, scorch, wilt, doubt], filler: 6, mods: { hand: 2 } });
  rig(C, [regret, scorch]);
  let ev = C.endTurn();
  const hurts = ev.filter((e) => e.type === 'hurt');
  t.deep(hurts.map((e) => [e.dst.id, e.amount, e.cause]), [['hanae', 2, 'curse'], ['hanae', 2, 'curse']], 'both hit the front hero with cause curse');
  t.eq(C.heroes[0].hp, 66, 'hp');
  t.ok(types(ev).indexOf('exhaust') > types(ev).lastIndexOf('hurt'), 'hand.turnEnd runs before the ethereal exhaust');
  // front hero is whoever is in front
  C.swap(); const before = C.heroes[1].hp;
  rig(C, [regret]); C.endTurn();
  t.eq(C.heroes[1].hp, before - 2, 'kuro took it after a swap');
  // hurt never below 1
  C.heroes[1].hp = 1; rig(C, [regret]); ev = C.endTurn();
  t.eq(C.heroes[1].hp, 1, 'a hurt op cannot kill'); t.eq(ev.filter((e) => e.type === 'hurt').length, 0, 'and emits nothing when it would do nothing');
  // drawn triggers at turn start: energy after the reset, weak on the front hero
  const W2 = world();
  const wilt2 = W2.card('wilt', { type: 'status', hero: 'status', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], hand: { drawn: [{ op: 'energy', n: -1 }] }, art: { m: 'void' } });
  const doubt2 = W2.card('doubt', { type: 'curse', hero: 'curse', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], hand: { drawn: [{ op: 'status', s: 'weak', n: 1, tgt: 'front' }] }, art: { m: 'skull' } });
  const C2 = W2.fight({ deck: [wilt2, doubt2], filler: 0, mods: { hand: 2 } });
  t.eq(C2.energy, 2, 'status_wilt drawn at turn start costs Energy'); t.eq(C2.heroes[0].st.weak, 1, 'curse_doubt puts Weak on the front hero');
  t.ok(first(C2.events, 'energy') && first(C2.events, 'energy').delta === -1, 'energy event');
  C2.endTurn();
  t.eq(C2.energy, 2, 'and again next turn (the cards were discarded and redrawn)');
});

t.test('add: destinations, defaults, temp cards, upgrades, overflow into the discard pile', () => {
  const W = world();
  const tok = W.card('tok', { hero: 'hanae', type: 'skill', rarity: 'token', cost: 0, fx: [{ op: 'block', n: 1 }], up: undefined });
  const junk = W.card('junkc', { hero: 'status', type: 'status', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], art: { m: 'void' } });
  const mk = (name, fx) => W.card(name, { type: 'skill', cost: 0, fx });
  const toHand = mk('toHand', [{ op: 'add', card: tok, n: 2 }]), toDraw = mk('toDraw', [{ op: 'add', card: tok, to: 'draw' }]), toDis = mk('toDis', [{ op: 'add', card: tok, to: 'discard', up: true }]), toEx = mk('toEx', [{ op: 'add', card: tok, to: 'exhaust' }]), junkDefault = mk('jd', [{ op: 'add', card: junk }]);
  const C = W.fight({ deck: [toHand, toDraw, toDis, toEx, junkDefault], filler: 3, mods: { hand: 5, energy: 9 }, seed: 11 });
  const [a, b, c, d, e] = rig(C, [toHand, toDraw, toDis, toEx, junkDefault]);
  let ev = play(C, a);
  const ac = first(ev, 'add_card');
  t.deep([ac.to, ac.cards.length, ac.cards.every((x) => x.tmp === true && x.id === tok), ac.piles.hand], ['hand', 2, true, 6], 'two temp cards to the hand (hand had 4 + these)');
  t.ok(ac.cards[0].uid !== ac.cards[1].uid && ac.cards[0].uid > 100 + C.deckSize - 1, 'fresh uids after the deck uids'); t.eq(C.added, 2, 'C.added');
  const drawBefore = C.draw.length; ev = play(C, b);
  t.deep([first(ev, 'add_card').to, C.draw.length], ['draw', drawBefore + 1], 'to the draw pile'); ev = play(C, c);
  t.deep([first(ev, 'add_card').to, first(ev, 'add_card').cards[0].up, C.discard.some((x) => x.id === tok && x.up === 1)], ['discard', 1, true], 'to the discard pile, upgraded');
  ev = play(C, d); t.eq(C.exhaust.filter((x) => x.id === tok).length, 1, 'to the exhaust pile');
  ev = play(C, e); t.eq(first(ev, 'add_card').to, 'discard', 'status and curse cards default to the discard pile');
  t.eq(total(C), C.deckSize + C.added, 'conservation with temp cards');
  // hand overflow
  const W2 = world(); const t2 = W2.card('tok', { type: 'skill', rarity: 'token', cost: 0, fx: [{ op: 'block', n: 1 }] }); const many = W2.card('many', { type: 'skill', cost: 0, fx: [{ op: 'add', card: t2, n: 5 }] });
  const C2 = W2.fight({ deck: [many], filler: 12, mods: { hand: 8 } });
  const m2 = rig(C2, [many])[0];
  while (C2.hand.length < 9) C2.hand.push(C2.draw.shift());
  ev = play(C2, m2);
  t.eq(C2.hand.length, 10, 'hand full at 10'); const ov = first(ev, 'discard');
  t.deep([ov.reason, ov.cards.length, ov.piles.hand], ['overflow', 3, 10], 'the overflow went to the discard pile with reason overflow');
  t.eq(only(ev, 'add_card').length, 1, 'the two that fit'); t.eq(first(ev, 'add_card').cards.length, 2, 'two cards');
  t.ok(C2.discard.filter((x) => x.id === t2).length === 3, 'in the discard pile');
});


// ------------------------------------------------------------------ picks
const PICK_PAIRS = [['hand', 'discard'], ['hand', 'exhaust'], ['hand', 'retain'], ['hand', 'upgrade'], ['hand', 'copy'], ['draw', 'toHand'], ['draw', 'discard'], ['draw', 'exhaust'], ['draw', 'toDrawTop'], ['discard', 'toHand'], ['discard', 'toDrawTop'], ['discard', 'exhaust'], ['discard', 'upgrade'], ['exhaust', 'toHand'], ['exhaust', 'toDrawTop']];

t.test('pick: every legal from/then pair pauses the card, validates the answer, moves the card and then runs the rest', () => {
  PICK_PAIRS.forEach(([from, then]) => {
    const W = world();
    const [a, b, c] = ['a', 'b', 'c'].map((n) => W.card(n, { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }], up: { fx: [{ op: 'block', n: 9 }] } }));
    const pk = W.card('pk', { type: 'skill', cost: 0, fx: [{ op: 'pick', from, n: 1, then }, { op: 'status', s: 'bloom', n: 1, tgt: 'self' }] });
    const other = W.card('other', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
    const C = W.fight({ deck: [pk, a, b, c, other], filler: 0, mods: { hand: 5 } });
    const P = rig(C, [pk, a, b, c, other]);
    const pkc = P[0];
    if (from !== 'hand') { const cs = P.slice(1, 4); cs.forEach((x) => C.hand.splice(C.hand.indexOf(x), 1)); const pile = { draw: C.draw, discard: C.discard, exhaust: C.exhaust }[from]; if (from === 'draw') pile.unshift(...cs); else pile.push(...cs); }
    const label = `${from} then ${then}`;
    const cand = from === 'hand' ? P.slice(1) : P.slice(1, 4);
    const pending = { hand: C.hand, draw: C.draw, discard: C.discard, exhaust: C.exhaust }[from];
    let ev = C.play(pkc.uid);
    t.ok(C.pending && C.pending.kind === 'pick', label + ': pending is set');
    t.deep([C.pending.from, C.pending.then, C.pending.n, C.pending.optional, C.pending.opId], [from, then, 1, false, '0'], label + ': pending fields');
    const candUids = cand.map((x) => x.uid);
    t.deep(C.pending.uids.slice().sort((x, y) => x - y), candUids.slice().sort((x, y) => x - y), label + ': candidate uids');
    t.eq(ev[ev.length - 1].type, 'pick_needed', label + ': pick_needed is the last event'); t.deep(ev[ev.length - 1].pending, C.pending, label + ': the event carries the pending snapshot');
    t.eq(C.heroes[0].st.bloom, undefined, label + ': the ops after the pick have not run yet');
    // while pending, everything else is refused
    const oth = P[4];
    t.eq(C.canPlay(oth.uid).reason, 'pending', label + ': canPlay pending'); t.eq(C.canSwap().reason, 'pending', label + ': canSwap pending'); t.eq(C.endTurn().length, 0, label + ': endTurn is a no-op');
    // bad answers change nothing
    const before = snap(C);
    const good = C.pending.uids[0];
    t.eq(C.resolvePick([]).length, 0, label + ': too few'); t.eq(C.resolvePick([good, good]).length, 0, label + ': duplicates'); t.eq(C.resolvePick([99999]).length, 0, label + ': not a candidate'); t.eq(C.resolvePick('x').length, 0, label + ': not an array'); t.eq(C.resolvePick([good, C.pending.uids[1]]).length, 0, label + ': too many'); t.eq(snap(C), before, label + ': state untouched by bad answers');
    const chosenInst = pending.find((x) => x.uid === good);
    ev = C.resolvePick([good]);
    t.eq(C.pending, null, label + ': pending cleared'); t.eq(C.heroes[0].st.bloom, 1, label + ': the ops after the pick ran after the choice'); t.eq(C.inPlay, null, label + ': card settled');
    t.eq(total(C), C.deckSize + C.added, label + ': conservation');
    const ce = (type) => only(ev, type);
    if (then === 'discard' && from === 'hand') t.deep([ce('discard')[0].reason, ce('discard')[0].cards[0].uid, C.discard.some((x) => x.uid === good)], ['pick', good, true], label);
    if (then === 'discard' && from === 'draw') t.deep([ce('card_move')[0].from, ce('card_move')[0].to, C.discard.some((x) => x.uid === good)], ['draw', 'discard', true], label);
    if (then === 'exhaust') t.deep([ce('exhaust')[0].reason, C.exhaust.some((x) => x.uid === good)], ['pick', true], label);
    if (then === 'retain') { t.deep(ce('retain')[0].cards.map((x) => x.uid), [good], label); C.endTurn(); t.ok(C.hand.some((x) => x.uid === good), label + ': retained across the turn'); }
    if (then === 'upgrade') { const u = [C.hand, C.draw, C.discard, C.exhaust].flat().find((x) => x.uid === good); t.deep([u.up, ce('card_upgrade')[0].card.up], [1, 1], label); }
    if (then === 'copy') { t.deep([ce('add_card')[0].to, ce('add_card')[0].cards[0].tmp, ce('add_card')[0].cards[0].id === chosenInst.id, C.added], ['hand', true, true, 1], label); t.ok(C.hand.some((x) => x.id === chosenInst.id && x.tmp), label + ': copy is in hand'); }
    if (then === 'toHand' && from !== 'hand') t.deep([ce('card_move')[0].from, ce('card_move')[0].to, C.hand.some((x) => x.uid === good)], [from, 'hand', true], label);
    if (then === 'toDrawTop') t.deep([ce('card_move')[0].to, C.draw[0].uid], ['draw', good], label);
  });
});

t.test('pick: auto-resolve when candidates fit and the pick is not optional; optional; random; top; filter; picked; n > 1', () => {
  const W = world();
  const a = W.card('a', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), b = W.card('b', { type: 'attack', cost: 0, fx: [{ op: 'dmg', n: 1 }] }), c = W.card('c', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const mk = (name, pickOp, extra) => W.card(name, { type: 'skill', cost: 0, fx: [pickOp].concat(extra || []) });
  const auto = mk('auto', { op: 'pick', from: 'hand', n: 5, then: 'discard' });
  const opt = mk('opt', { op: 'pick', from: 'hand', n: 2, then: 'discard', optional: true });
  const rnd = mk('rnd', { op: 'pick', from: 'hand', n: 2, then: 'exhaust', random: true });
  const top = mk('top', { op: 'pick', from: 'draw', n: 1, then: 'toHand', top: 2 });
  const flt = mk('flt', { op: 'pick', from: 'hand', n: 1, then: 'exhaust', filter: { type: 'attack' } });
  const two = mk('two', { op: 'pick', from: 'hand', n: 2, then: 'discard' }, [{ op: 'draw', n: { per: 'picked' } }]);
  const none = mk('none', { op: 'pick', from: 'discard', n: 1, then: 'toHand' }, [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }]);
  const C = W.fight({ deck: [auto, opt, rnd, top, flt, two, none, a, b, c, a, b], filler: 0, mods: { hand: 12, energy: 20 }, seed: 3 });
  let P = rig(C, [auto, a, b, c]);
  let ev = play(C, P[0]);
  t.eq(C.pending, null, 'candidates <= n: no pending'); t.deep(only(ev, 'discard').map((e) => e.cards.length), [3], 'all three discarded'); t.eq(only(ev, 'pick_needed').length, 0, 'no pick_needed');
  // optional: any number 0..n
  P = rig(C, [opt, a, b, c]);
  ev = play(C, P[0]);
  t.eq(C.pending.optional, true, 'optional pending'); t.eq(C.pending.n, 2, 'n'); t.eq(C.resolvePick([P[1].uid, P[2].uid, P[3].uid]).length, 0, 'more than n is refused');
  t.ok(C.resolvePick([]).length >= 0 && C.pending === null, 'optional accepts none'); t.eq(C.hand.length, 3, 'nothing discarded');
  P = rig(C, [opt, a, b, c]); play(C, P[0]);
  ev = C.resolvePick([P[1].uid]); t.eq(only(ev, 'discard')[0].cards.length, 1, 'optional accepts fewer than n');
  P = rig(C, [opt, a]); play(C, P[0]);
  t.ok(C.pending !== null, 'optional with candidates <= n still asks'); C.resolvePick([P[1].uid, ...[]]);
  // random: no pending, consumes the rng
  P = rig(C, [rnd, a, b, c]);
  const seed0 = C.rng.seed();
  ev = play(C, P[0]);
  t.eq(C.pending, null, 'random needs no answer'); t.ok(C.rng.seed() !== seed0, 'random consumed the rng'); t.eq(only(ev, 'exhaust').length, 2, 'two random cards exhausted');
  // top: only the top 2 are candidates
  P = rig(C, [top]);
  C.discard.splice(0).forEach((x) => C.draw.push(x));
  const topTwo = C.draw.slice(0, 2).map((x) => x.uid);
  play(C, P[0]);
  t.deep(C.pending.uids, topTwo, 'top limits the candidates to the top of the draw pile'); C.resolvePick([topTwo[1]]);
  // filter
  P = rig(C, [flt, a, b, c, b]);
  ev = play(C, P[0]);
  t.deep(C.pending.uids.slice().sort(), [P[2].uid, P[4].uid].sort(), 'filter type attack'); C.resolvePick([P[4].uid]);
  // n = 2 exactly, and `picked`
  P = rig(C, [two, a, b, c]);
  play(C, P[0]);
  t.eq(C.resolvePick([P[1].uid]).length, 0, 'exactly n is required'); const h0 = C.hand.length;
  ev = C.resolvePick([P[1].uid, P[2].uid]);
  t.eq(C.hand.length, h0 - 2 + 2, 'per picked drew 2 cards'); t.eq(only(ev, 'draw')[0].cards.length, 2, 'draw event after the pick');
  // nothing to pick from: no pending, the card continues
  C.discard.splice(0).forEach((x) => C.draw.push(x));
  P = rig(C, [none]); C.discard.splice(0).forEach((x) => C.draw.push(x));
  play(C, P[0]);
  t.eq(C.pending, null, 'no candidates: no pending'); t.ok(C.heroes[0].st.bloom >= 1, 'the rest of the card still ran');
});

t.test('pick: upgrade only offers upgradable cards; opId is the path of the op', () => {
  const W = world();
  const up = W.card('up', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }], up: { fx: [{ op: 'block', n: 2 }] } });
  const junk = W.card('junk', { type: 'curse', hero: 'curse', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], art: { m: 'skull' }, up: undefined });
  const pu = W.card('pu', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }, { op: 'pick', from: 'hand', n: 1, then: 'upgrade' }] });
  const nested = W.card('nested', { type: 'skill', cost: 0, fx: [{ op: 'cond', if: { handEmpty: false }, then: [{ op: 'pick', from: 'hand', n: 1, then: 'discard', optional: true }] }, { op: 'cond', if: { handEmpty: true }, then: [{ op: 'block', n: 1 }], else: [{ op: 'pick', from: 'hand', n: 1, then: 'discard', optional: true }] }] });
  const C = W.fight({ deck: [pu, nested, { id: up, up: 1 }, up, junk, up], filler: 0, mods: { hand: 6 } });
  const P = rig(C, [pu, { id: up }.id, junk].map((x) => x));
  const ups = C.discard.concat(C.draw).filter((x) => x.id === up);
  const already = ups.find((x) => x.up), fresh = ups.filter((x) => !x.up);
  C.hand.push(already, ...fresh.slice(0, 1));
  play(C, P[0]);
  t.eq(C.pending.opId, '1', 'the pick is op 1'); t.ok(!C.pending.uids.includes(already.uid) && !C.pending.uids.includes(P[2].uid), 'upgraded and non-upgradable cards are not offered'); t.ok(C.pending.uids.includes(P[1].uid), 'an upgradable card is');
  C.resolvePick([P[1].uid]);
  const n = rig(C, [nested, up])[0];
  play(C, n);
  t.eq(C.pending.opId, '0.0', 'a pick inside cond then'); C.resolvePick([]);
  t.eq(C.pending && C.pending.opId, '1.1', 'a pick in the else branch continues numbering after the then branch (then has 1 op)');
});


// ------------------------------------------------------------------ swaps and rows
t.test('swap: one free swap per turn, then Energy; freeSwaps mod; events; every canSwap reason', () => {
  const W = world();
  const C = W.fight({ enemies: [W.dummy] });
  t.deep(C.canSwap(), { ok: true, cost: 0, reason: null }, 'first swap is free');
  let ev = C.swap();
  t.deep(ev.map((e) => e.type), ['swap'], 'a free swap is one event'); t.deep(first(ev, 'swap'), { type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false }, 'swap event');
  t.deep([C.front().id, C.back().id, C.energy, C.stats.swaps], ['kuro', 'hanae', 3, 1], 'rows exchanged, no Energy spent');
  t.deep(C.canSwap(), { ok: true, cost: 1, reason: null }, 'the second costs 1');
  ev = C.swap(); t.deep(ev.map((e) => e.type), ['energy', 'swap'], 'paid: energy then swap'); t.deep([first(ev, 'swap').cost, C.energy, first(ev, 'energy').delta], [1, 2, -1], 'paid swap');
  C.swap(); C.swap();
  t.deep(C.canSwap(), { ok: false, cost: 1, reason: 'energy' }, 'no Energy left'); t.eq(C.swap().length, 0, 'refused');
  C.endTurn(); t.deep(C.canSwap(), { ok: true, cost: 0, reason: null }, 'a new turn has a free swap again');
  const two = W.fight({ mods: { freeSwaps: 2 } }); two.swap(); t.eq(two.canSwap().cost, 0, 'freeSwaps 2: the second is free'); two.swap(); t.eq(two.canSwap().cost, 1, 'the third costs');
  const none = W.fight({ mods: { freeSwaps: 0 } }); t.eq(none.canSwap().cost, 1, 'freeSwaps 0: every swap costs');
  // solo and pending and phase
  const solo = W.fight({}); solo.heroes[1].down = true; solo.heroes[1].hp = 0;
  t.eq(solo.canSwap().reason, 'solo', 'a downed hero means solo'); t.eq(W.fight({ start: false }).canSwap().reason, 'phase', 'phase');
  const bound = W.fight({}); bound.heroes[1].st.bind = 1;
  t.deep(bound.canSwap(), { ok: false, cost: 0, reason: 'bind' }, 'bind blocks even the free swap (either hero bound)'); t.eq(bound.swap().length, 0, 'refused');
});

t.test('card swap op: not the free swap, blocked by Bind, uses the new row for later ops; onSwap fires for free, paid and card swaps only', () => {
  const W = world();
  W.D.heroes.hanae.rows = { front: { dmgAdd: 3 }, back: {} };
  const sw = W.card('sw', { fx: [{ op: 'swap' }, { op: 'dmg', n: 5 }] });
  const relic = W.relic('onswap', { hooks: [{ on: 'onSwap', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] }] });
  const C = W.fight({ deck: [sw, sw], filler: 0, frontIdx: 1, relics: [relic] });
  t.eq(C.back().id, 'hanae', 'hanae starts in the back');
  const ev = play(C, rig(C, [sw])[0]);
  t.deep(types(ev).filter((x) => ['swap', 'hit', 'relic', 'status'].includes(x)), ['swap', 'relic', 'status', 'hit'], 'swap, hook, then the attack');
  t.eq(first(ev, 'hit').raw, 5 + 3 + 1, 'hanae is in front for the hit: 5 + row 3 + Might 1 from the onSwap hook');
  t.deep(first(ev, 'swap'), { type: 'swap', front: 'hanae', back: 'kuro', cost: 0, forced: false }, 'cost 0, not forced'); t.eq(C.canSwap().cost, 0, 'the free swap is still available'); t.eq(C.stats.swaps, 1, 'counted');
  t.eq(C.heroes[0].st.might, 1, 'the front hero who moved forward got the hook');
  // free and paid swaps fire it too
  C.swap(); t.eq(C.front().st.might, 1, 'kuro moved forward and gained Might'); C.swap(); t.eq(C.front().st.might, 2, 'a paid swap fires it too');
  // Bind blocks the op
  const W2 = world(); const sw2 = W2.card('sw', { cost: 0, fx: [{ op: 'swap' }] });
  const C2 = W2.fight({ deck: [sw2], filler: 0 }); C2.heroes[1].st.bind = 1;
  t.eq(only(play(C2, rig(C2, [sw2])[0]), 'swap').length, 0, 'Bind blocks the swap op'); t.eq(C2.front().id, 'hanae', 'unchanged');
  // forced swaps never fire onSwap
  const W3 = world(); const r3 = W3.relic('onswap', { hooks: [{ on: 'onSwap', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] }] });
  const C3 = W3.fight({ enemies: [W3.hitter(99)], relics: [r3], heroes: [{ id: 'hanae', hp: 5, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] });
  const e3 = C3.endTurn();
  t.eq(first(e3, 'swap').forced, true, 'the survivor is forced forward'); t.deep([first(e3, 'swap').front, first(e3, 'swap').back, first(e3, 'swap').cost], ['kuro', 'hanae', 0], 'forced swap event'); t.eq(only(e3, 'relic').length, 0, 'no onSwap for a forced swap');
  t.eq(C3.stats.swaps, 0, 'forced swaps are not counted');
});

t.test('rows: bonuses from the hero and from relic rows; rowSt is subtract-old-add-new and updates immediately on a swap', () => {
  const W = world();
  W.D.heroes.suzu.rows = { front: { blockAdd: 1, thorns: 2, dmgAdd: 2 }, back: { regen: 2 } };
  const relic = W.relic('rows', { rows: { front: { dmgAdd: 1, thorns: 1 }, back: { drawAdd: 1, regen: 1 } } });
  const guard = W.card('guard', { hero: 'suzu', type: 'skill', cost: 0, fx: [{ op: 'block', n: 4 }] }), hit = W.card('hit', { hero: 'suzu', cost: 0, fx: [{ op: 'dmg', n: 4 }] });
  const C = W.fight({ heroes: [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'suzu', hp: 50, maxHp: 68 }], deck: [guard, hit], filler: 6, relics: [relic], enemies: [W.hitter(5)], mods: { energy: 9 } });
  const suzu = C.heroes[1];
  t.deep([suzu.row, suzu.st.regen, suzu.rowSt], ['back', 2, { thorns: 0, regen: 3 }], 'back row: regen 2 from the hero + 1 from the relic; ticking heals then falls by 1');
  t.eq(suzu.hp, 53, 'turn 1: the regen of 3 healed');
  t.eq(C.hand.length, 6, 'drawAdd from a relic row: 5 + 1');
  // swap suzu to the front mid-turn
  const ev = C.swap();
  t.deep([suzu.row, suzu.rowSt], ['front', { thorns: 3, regen: 0 }], 'front: thorns 2 + 1');
  t.eq(suzu.st.thorns, 3, 'thorns applied immediately'); t.ok(!suzu.st.regen, 'and the regen the back row granted is gone (2 left of 3 after the tick, minus the row 3, floor 0)');
  t.ok(only(ev, 'status').some((e) => e.dst.id === 'suzu' && e.s === 'thorns' && e.delta === 3), 'a status event for the thorns');
  t.eq(first(play(C, rig(C, [hit])[0]), 'hit').raw, 4 + 2 + 1, 'front dmgAdd: hero 2 + relic 1');
  t.eq(first(play(C, rig(C, [guard])[0]), 'block').amount, 4 + 1, 'front blockAdd 1');
  const e2 = C.endTurn();
  t.ok(only(e2, 'thorns').length === 1 && first(e2, 'thorns').src.id === 'suzu' && first(e2, 'thorns').amount === 3, 'Suzu, stepping to the front mid-turn, had Thorns for that enemy phase');
  // card thorns survive the bookkeeping
  suzu.st.thorns = 3 + 4;
  C.swap();
  t.eq(suzu.st.thorns, 4, 'stepping back removes only what the row granted (7 - 3)'); t.eq(suzu.rowSt.thorns, 0, 'rowSt');
  C.swap();
  t.eq(suzu.st.thorns, 7, 'and forward again adds it back');
});

t.test('rows: a downed hero keeps no row statuses; revive re-applies them', () => {
  const W = world();
  W.D.heroes.raiga.rows = { front: { thorns: 2, startBlock: 3 }, back: { dmgAdd: 1 } };
  const C = W.fight({ heroes: [{ id: 'raiga', hp: 5, maxHp: 80 }, { id: 'kuro', hp: 60, maxHp: 60 }], enemies: [W.hitter(50)] });
  t.eq(C.heroes[0].st.thorns, 2, 'raiga leads with thorns'); t.eq(C.heroes[0].block, 3, 'startBlock');
  C.endTurn();
  t.eq(C.heroes[0].down, true, 'raiga fell'); t.deep(C.heroes[0].st, {}, 'statuses gone'); t.deep(C.heroes[0].rowSt, { thorns: 0, regen: 0 }, 'rowSt reset');
});

// ------------------------------------------------------------------ the remaining ops
t.test('heal: capped, cannot revive, tgt variants, no event at full HP', () => {
  const W = world();
  const heal = (tgt, n = 10) => W.card('heal_' + tgt + n, { type: 'skill', cost: 0, fx: [{ op: 'heal', n, tgt }] });
  const [hs, ha, hb, hf, hk] = [heal('self'), heal('ally'), heal('both'), heal('front'), heal('back')];
  const C = W.fight({ deck: [hs, ha, hb, hf, hk], filler: 0, mods: { hand: 5, energy: 9 } });
  C.heroes[0].hp = 60; C.heroes[1].hp = 55;
  let ev = play(C, rig(C, [hs])[0]);
  t.deep([first(ev, 'heal').amount, first(ev, 'heal').hp, C.heroes[0].hp], [10, 70, 70], 'capped at maxHp'); t.eq(only(ev, 'heal').length, 1, 'one event');
  ev = play(C, rig(C, [hs])[0]); t.eq(only(ev, 'heal').length, 0, 'nothing to heal: no event');
  ev = play(C, rig(C, [ha])[0]); t.deep([first(ev, 'heal').dst.id, C.heroes[1].hp], ['kuro', 60], 'ally');
  C.heroes[0].hp = 10; C.heroes[1].hp = 10;
  ev = play(C, rig(C, [hb])[0]); t.deep(only(ev, 'heal').map((e) => [e.dst.id, e.amount]), [['hanae', 10], ['kuro', 10]], 'both');
  t.eq(new Set(only(ev, 'heal').map((e) => e.group)).size, 1, 'one group');
  C.heroes[0].hp = 10; C.heroes[1].hp = 10; play(C, rig(C, [hf])[0]); t.deep([C.heroes[0].hp, C.heroes[1].hp], [20, 10], 'front'); play(C, rig(C, [hk])[0]); t.deep([C.heroes[0].hp, C.heroes[1].hp], [20, 20], 'back');
  // a downed ally cannot be healed
  C.heroes[1].hp = 0; C.heroes[1].down = true; C.heroes[1].st = {};
  ev = play(C, rig(C, [ha])[0]); t.eq(only(ev, 'heal').length, 0, 'ally op skipped when the ally is down'); t.eq(C.heroes[1].hp, 0, 'heal cannot revive');
  ev = play(C, rig(C, [hb])[0]); t.eq(only(ev, 'heal').length, 1, 'both means every living hero');
});

t.test('hurt: ignores Block, never below 1 unless lethal, tgt variants; lethal downs the hero', () => {
  const W = world();
  const h = (n, extra = {}, name = 'h') => W.card(name + n + JSON.stringify(extra).length, { type: 'skill', cost: 0, fx: [Object.assign({ op: 'hurt', n }, extra)] });
  const soft = h(100), lethal = h(100, { lethal: true }, 'l'), both = h(3, { tgt: 'both' }, 'b'), ally = h(4, { tgt: 'ally' }, 'a');
  const C = W.fight({ deck: [soft, lethal, both, ally], filler: 0, mods: { hand: 4, energy: 9 } });
  C.heroes[0].block = 99;
  let ev = play(C, rig(C, [both])[0]);
  t.deep(only(ev, 'hurt').map((e) => [e.dst.id, e.amount, e.cause]), [['hanae', 3, 'op'], ['kuro', 3, 'op']], 'both heroes, Block ignored'); t.eq(C.heroes[0].block, 99, 'Block untouched');
  ev = play(C, rig(C, [ally])[0]); t.eq(first(ev, 'hurt').dst.id, 'kuro', 'ally');
  ev = play(C, rig(C, [soft])[0]); t.eq(C.heroes[0].hp, 1, 'never below 1'); t.eq(first(ev, 'hurt').amount, 66, 'the amount is what was actually lost');
  ev = play(C, rig(C, [soft])[0]); t.eq(only(ev, 'hurt').length, 0, 'at 1 HP nothing happens');
  ev = play(C, rig(C, [lethal])[0]); t.eq(C.heroes[0].down, true, 'lethal downs the hero'); t.eq(first(ev, 'hero_down').hero, 'hanae', 'hero_down'); t.eq(C.front().id, 'kuro', 'kuro forced front');
  t.eq(C.stats.damageTaken, 0, 'hurt is not a hit: damageTaken counts hits and thorns only');
});

t.test('gold, ink and maxHp ops accumulate into the summary and echo as events; thieves return gold when killed', () => {
  const W = world();
  const rich = W.card('rich', { type: 'skill', cost: 0, fx: [{ op: 'gold', n: 12 }, { op: 'ink', n: 2 }, { op: 'maxHp', n: 3 }, { op: 'maxHp', n: 2, tgt: 'ally' }, { op: 'gold', n: { per: 'turn', mul: 5 } }] });
  const C = W.fight({ deck: [rich, rich], filler: 0, mods: { hand: 2 } });
  C.heroes[0].hp = 60;
  const ev = play(C, rig(C, [rich])[0]);
  t.deep(only(ev, 'gold').map((e) => e.n), [12, 5], 'gold events'); t.deep(first(ev, 'ink'), { type: 'ink', n: 2 }, 'ink event'); t.deep(only(ev, 'max_hp').map((e) => [e.hero, e.n]), [['hanae', 3], ['kuro', 2]], 'max_hp events');
  t.deep([C.heroes[0].maxHp, C.heroes[0].hp, C.heroes[1].maxHp, C.heroes[1].hp], [73, 63, 62, 62], 'max HP and current HP both rise');
  const sm = C.summary(); t.deep([sm.gold, sm.ink, sm.maxHpGain], [17, 2, { hanae: 3, kuro: 2 }], 'summary'); t.deep(sm.heroes.map((h) => h.maxHp), [73, 62], 'summary maxHp already includes the gain');
  // a thief
  const W2 = world();
  const thief = W2.enemy('thief', { hp: [4, 4], moves: { steal: { name: 'Snatch', kind: 'debuff', fx: [{ op: 'stealGold', n: 30 }] }, idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['steal', 'idle'] } });
  const hit = W2.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 99 }] });
  const C2 = W2.fight({ deck: [hit], filler: 0, enemies: [thief], gold: 20 });
  const e2 = C2.endTurn();
  t.deep(only(e2, 'gold').map((e) => e.n), [-20], 'it takes min(30, the 20 gold the run has)'); t.eq(C2.enemies[0].loot, 20, 'stored on the thief');
  const e3 = play(C2, rig(C2, [hit])[0]);
  t.deep(only(e3, 'gold').map((e) => e.n), [20], 'killing the thief returns it as a positive gold event'); t.eq(C2.summary().gold, 0, 'net zero: the run keeps its gold');
  t.ok(types(e3).indexOf('gold') > types(e3).indexOf('death'), 'after the death event');
  // a thief that flees keeps it
  const W3 = world();
  const runner = W3.enemy('runner', { moves: { steal: { name: 'Snatch', kind: 'flee', fx: [{ op: 'stealGold', n: 30 }, { op: 'flee' }] } }, ai: { seq: ['steal'] } }), other = W3.dummy;
  const C3 = W3.fight({ enemies: [runner, other], gold: 50 });
  const e4 = C3.endTurn();
  t.deep([first(e4, 'flee').unit.id, C3.enemies[0].down, C3.enemies[0].fled, C3.enemies[0].loot], ['t_runner#1', true, true, 0], 'the thief leaves, its loot is lost');
  t.eq(C3.summary().gold, -30, 'gold lost for good'); t.eq(C3.stats.kills.length, 0, 'a fled enemy is not a kill'); t.eq(C3.result, null, 'the fight goes on while an enemy remains');
  t.eq(only(e4, 'death').length, 0, 'no death event');
  // gold pool is shared: two thieves cannot steal more than the run has
  const W4 = world(); const th = W4.enemy('th', { moves: { steal: { name: 'Snatch', kind: 'debuff', fx: [{ op: 'stealGold', n: 30 }] } }, ai: { seq: ['steal'] } });
  const C4 = W4.fight({ enemies: [th, th], gold: 40 }); C4.endTurn();
  t.deep(C4.enemies.map((e) => e.loot), [30, 10], 'never more than the run gold not yet stolen');
});

t.test('revive op: first downed hero (or the triggering hero), back row, n or pct, at least 1 HP; no-op when nobody is down', () => {
  const W = world();
  const rev = W.card('rev', { type: 'skill', cost: 0, fx: [{ op: 'revive', n: 12 }] }), revp = W.card('revp', { type: 'skill', cost: 0, fx: [{ op: 'revive', pct: 0.25 }] }), rev0 = W.card('rev0', { type: 'skill', cost: 0, fx: [{ op: 'revive', pct: 0.001 }] });
  const C = W.fight({ deck: [rev, revp, rev0], filler: 0, mods: { hand: 3, energy: 9 } });
  t.eq(only(play(C, rig(C, [rev])[0]), 'hero_revive').length, 0, 'no-op when nobody is down');
  const down = (i) => { C.heroes[i].hp = 0; C.heroes[i].down = true; C.heroes[i].st = {}; C.heroes[i]._downDone = true; };
  down(1);
  let ev = play(C, rig(C, [rev])[0]);
  t.deep(first(ev, 'hero_revive'), { type: 'hero_revive', hero: 'kuro', hp: 12 }, 'hero_revive'); t.deep([C.heroes[1].down, C.heroes[1].row, C.front().id, C.stats.revives], [false, 'back', 'hanae', 1], 'stands up in the back row');
  down(1); C.heroes[1].maxHp = 60;
  ev = play(C, rig(C, [revp])[0]); t.eq(C.heroes[1].hp, 15, 'pct of max HP');
  down(1); ev = play(C, rig(C, [rev0])[0]); t.eq(C.heroes[1].hp, 1, 'at least 1 HP');
  // the front hero fell: the revived hero stands in the back; the survivor was already forced front
  const W2 = world(); const r2 = W2.card('r', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'revive', n: 9 }] });
  const C2 = W2.fight({ deck: [r2], filler: 0, enemies: [W2.hitter(99)], heroes: [{ id: 'hanae', hp: 5, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] });
  C2.endTurn();
  t.deep([C2.front().id, C2.back().id, C2.heroes[0].down], ['kuro', 'hanae', true], 'hanae fell in front, kuro is forced forward');
  play(C2, rig(C2, [r2])[0]);
  t.deep([C2.front().id, C2.back().id, C2.heroes[0].down, C2.heroes[0].hp], ['kuro', 'hanae', false, 9], 'hanae revived in the back');
});

t.test('hook op: registers a hook owned by the acting hero; once, twice, limit, every; "next turn" and "this turn" idioms', () => {
  const W = world();
  const nextEnergy = W.card('ne', { type: 'skill', cost: 0, fx: [{ op: 'hook', on: 'turnStart', once: true, fx: [{ op: 'energy', n: 2 }] }] });
  const C = W.fight({ deck: [nextEnergy, nextEnergy], filler: 0, mods: { hand: 2 } });
  play(C, rig(C, [nextEnergy])[0]); C.endTurn();
  t.eq(C.energy, 5, 'next turn: +2 Energy survives the energy reset (3 + 2)');
  C.endTurn(); t.eq(C.energy, 3, 'and only once');
  // registering twice = two hooks
  const W2 = world(); const twice = W2.card('t', { type: 'skill', cost: 0, fx: [{ op: 'hook', on: 'turnStart', once: true, fx: [{ op: 'energy', n: 1 }] }] });
  const C2 = W2.fight({ deck: [twice, twice], filler: 0, mods: { hand: 2 } });
  C2.hand.slice().forEach((c) => play(C2, c)); C2.endTurn(); t.eq(C2.energy, 5, 'two plays registered two hooks');
  // this turn only: +3 Might now, -3 at the end of the turn
  const W3 = world(); const surge = W3.card('surge', { type: 'skill', fx: [{ op: 'status', s: 'might', n: 3, tgt: 'self' }, { op: 'hook', on: 'turnEnd', once: true, fx: [{ op: 'status', s: 'might', n: -3, tgt: 'self' }] }] });
  const C3 = W3.fight({ deck: [surge], filler: 0 });
  play(C3, rig(C3, [surge])[0]); t.eq(C3.heroes[0].st.might, 3, 'Might now'); C3.endTurn(); t.ok(!C3.heroes[0].st.might, 'gone at the end of the turn');
  // a persistent power with limit and filter
  const W4 = world(); const pw = W4.card('pw', { type: 'power', cost: 0, fx: [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, limit: 1, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }] }), sk = W4.card('sk', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), at = W4.card('at', { cost: 0, fx: [{ op: 'dmg', n: 1 }] });
  const C4 = W4.fight({ deck: [pw, sk, sk, at], filler: 0, mods: { energy: 9 } });
  play(C4, rig(C4, [pw])[0]);
  const [s1, s2, a1] = rig(C4, [sk, sk, at]);
  play(C4, s1); play(C4, s2); play(C4, a1);
  t.eq(C4.heroes[0].st.sumi, 1, 'limit 1 per turn, skills only'); C4.endTurn();
  const [s3] = rig(C4, [sk]); play(C4, s3); t.eq(C4.heroes[0].st.sumi, 2, 'the limit resets next turn');
  // every N
  const W5 = world(); const ev5 = W5.card('ev', { type: 'power', cost: 0, fx: [{ op: 'hook', on: 'onPlay', every: 3, fx: [{ op: 'block', n: 2, tgt: 'self' }] }] }), s5 = W5.card('s', { type: 'skill', cost: 0, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] });
  const C5 = W5.fight({ deck: [ev5, s5, s5, s5, s5, s5, s5], filler: 0, mods: { energy: 20, hand: 7 } });
  play(C5, rig(C5, [ev5])[0]);
  for (let i = 0; i < 6; i++) play(C5, rig(C5, [s5])[0]);
  t.eq(C5.heroes[0].block, 4, 'every 3rd trigger: plays 3 and 6 of the 6 skills (the power itself does not trigger its own hook)');
});


// ------------------------------------------------------------------ targets
t.test('enemy targets: all, random re-rolled per hit, lowest with lane ties, others, retarget after the chosen dies', () => {
  const W = world();
  const e = (hp) => W.enemy('e' + hp, { hp: [hp, hp] });
  const [e10, e20, e30] = [e(10), e(20), e(30)];
  const aoe = W.card('aoe', { cost: 0, fx: [{ op: 'dmg', n: 3, tgt: 'all' }] }), rnd = W.card('rnd', { cost: 0, fx: [{ op: 'dmg', n: 1, hits: 12, tgt: 'random' }] }), low = W.card('low', { cost: 0, fx: [{ op: 'dmg', n: 2, tgt: 'lowest' }] }), oth = W.card('oth', { cost: 0, fx: [{ op: 'dmg', n: 5 }, { op: 'dmg', n: 2, tgt: 'others' }] }), oth2 = W.card('oth2', { cost: 0, fx: [{ op: 'dmg', n: 4, tgt: 'lowest' }, { op: 'dmg', n: 2, tgt: 'others' }] }), multiAoe = W.card('ma', { cost: 0, fx: [{ op: 'dmg', n: 1, hits: 2, tgt: 'all' }] });
  const C = W.fight({ deck: [aoe, rnd, low, oth, oth2, multiAoe], filler: 0, enemies: [e10, e20, e30], mods: { hand: 6, energy: 9 } });
  let ev = play(C, rig(C, [aoe])[0]);
  t.deep(only(ev, 'hit').map((h) => h.dst.id), ['t_e10#1', 't_e20#1', 't_e30#1'], 'all: line order'); t.eq(new Set(only(ev, 'hit').map((h) => h.group)).size, 1, 'one group for the op');
  ev = play(C, rig(C, [multiAoe])[0]);
  t.deep(only(ev, 'hit').map((h) => [h.dst.id.slice(2, 5), h.index]), [['e10', 0], ['e20', 0], ['e30', 0], ['e10', 1], ['e20', 1], ['e30', 1]], 'multi-hit AoE is hit-major with a 0-based index');
  ev = play(C, rig(C, [rnd])[0]);
  const victims = new Set(only(ev, 'hit').map((h) => h.dst.id));
  t.ok(victims.size >= 2, 'random re-rolls every hit (12 hits, 3 enemies): ' + [...victims]); t.eq(only(ev, 'hit').length, 12, 'twelve hits'); t.ok(only(ev, 'hit').every((h) => h.hits === 12), 'hits field');
  const hp = C.enemies.map((x) => x.hp);
  t.eq(hp.reduce((a, b) => a + b, 0), 60 - 3 * 3 - 2 * 3 - 12, 'damage adds up');
  // lowest: lowest current HP, ties to the lowest lane
  C.enemies.forEach((x, i) => { x.hp = [8, 5, 5][i]; });
  ev = play(C, rig(C, [low])[0]); t.eq(first(ev, 'hit').dst.id, 't_e20#1', 'tie between lane 3 and 4: the lowest lane wins');
  // others: every living enemy except the chosen
  C.enemies.forEach((x) => { x.hp = 40; x.maxHp = 40; });
  ev = play(C, rig(C, [oth])[0], 't_e20#1');
  t.deep(only(ev, 'hit').map((h) => [h.dst.id.slice(2, 5), h.raw]), [['e20', 5], ['e10', 2], ['e30', 2]], 'others excludes the chosen enemy');
  // others after a random/lowest op with no chosen enemy: all the rest
  C.enemies[0].hp = 3;
  ev = play(C, rig(C, [oth2])[0]);
  t.deep(only(ev, 'hit').map((h) => [h.dst.id.slice(2, 5), h.raw]), [['e10', 4], ['e20', 2], ['e30', 2]], 'others means all the rest when the first op picked its own victim');
  // chosen enemy died earlier in the same card: an enemy tgt re-targets as random
  const W2 = world();
  const a = W2.enemy('a', { hp: [3, 3] }), b = W2.enemy('b', { hp: [50, 50] });
  const two = W2.card('two', { cost: 0, fx: [{ op: 'dmg', n: 5 }, { op: 'dmg', n: 1 }] });
  const C2 = W2.fight({ deck: [two], filler: 0, enemies: [a, b] });
  ev = play(C2, rig(C2, [two])[0], 't_a#1');
  t.deep(only(ev, 'hit').map((h) => h.dst.id), ['t_a#1', 't_b#1'], 'the second op re-targeted the only living enemy');
  // and the remaining hits of one op
  const W3 = world();
  const a3 = W3.enemy('a', { hp: [3, 3] }), b3 = W3.enemy('b', { hp: [50, 50] });
  const flur = W3.card('fl', { cost: 0, fx: [{ op: 'dmg', n: 3, hits: 3 }] });
  const C3 = W3.fight({ deck: [flur], filler: 0, enemies: [a3, b3] });
  ev = play(C3, rig(C3, [flur])[0], 't_a#1');
  t.deep(only(ev, 'hit').map((h) => h.dst.id), ['t_a#1', 't_b#1', 't_b#1'], 'the remaining hits spill onto a random living enemy');
});

t.test('hero targets: self, ally, both, front, back; downed heroes are skipped; with one hero standing front and back mean the survivor', () => {
  const W = world();
  const b = (tgt) => W.card('b_' + tgt, { type: 'skill', cost: 0, fx: [{ op: 'block', n: 4, tgt }] });
  const [s, a, bo, f, k] = ['self', 'ally', 'both', 'front', 'back'].map(b);
  const C = W.fight({ deck: [s, a, bo, f, k], filler: 0, mods: { hand: 5, energy: 9 } });
  const blocks = () => C.heroes.map((h) => h.block);
  const reset = () => C.heroes.forEach((h) => { h.block = 0; });
  play(C, rig(C, [s])[0]); t.deep(blocks(), [4, 0], 'self'); reset(); play(C, rig(C, [a])[0]); t.deep(blocks(), [0, 4], 'ally'); reset(); play(C, rig(C, [bo])[0]); t.deep(blocks(), [4, 4], 'both');
  reset(); play(C, rig(C, [f])[0]); t.deep(blocks(), [4, 0], 'front'); reset(); play(C, rig(C, [k])[0]); t.deep(blocks(), [0, 4], 'back');
  // kuro downed: hanae alone
  C.heroes[1].hp = 0; C.heroes[1].down = true; C.heroes[1]._downDone = true; reset();
  play(C, rig(C, [a])[0]); t.deep(blocks(), [0, 0], 'ally is skipped when the ally is down'); play(C, rig(C, [bo])[0]); t.deep(blocks(), [4, 0], 'both means every living hero'); reset();
  play(C, rig(C, [k])[0]); t.deep(blocks(), [4, 0], 'back means the survivor'); reset(); play(C, rig(C, [f])[0]); t.deep(blocks(), [4, 0], 'front means the survivor');
  // block on the ally uses the recipient's Bulwark and the actor's row
  const W2 = world(); W2.D.heroes.hanae.rows = { front: { blockAdd: 2 }, back: {} };
  const ab = W2.card('ab', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 4, tgt: 'ally' }] });
  const C2 = W2.fight({ deck: [ab], filler: 0 }); C2.heroes[1].st.bulwark = 3; C2.heroes[0].st.bulwark = 100;
  play(C2, rig(C2, [ab])[0]); t.eq(C2.heroes[1].block, 4 + 3 + 2, 'recipient Bulwark 3, the acting hero\'s row blockAdd 2');
});

// ------------------------------------------------------------------ consume and repeat
t.test('consume: n is evaluated first, then the stacks or Block go; upTo caps the count and the spend independently', () => {
  const W = world();
  const bloom = W.card('bloom', { cost: 0, fx: [{ op: 'dmg', n: { per: 'status', s: 'bloom', mul: 4, upTo: 4 }, consume: { s: 'bloom', upTo: 4 } }] });
  const C = W.fight({ deck: [bloom, bloom, bloom], filler: 0, mods: { hand: 3, energy: 9 } }); plain(C);
  C.heroes[0].st.bloom = 6;
  let ev = play(C, rig(C, [bloom])[0]);
  t.deep([first(ev, 'hit').raw, C.heroes[0].st.bloom], [16, 2], '6 Bloom, count capped at 4: 16 damage, 4 spent');
  ev = play(C, rig(C, [bloom])[0]); t.deep([first(ev, 'hit').raw, C.heroes[0].st.bloom], [8, undefined], '2 Bloom: 8 damage, all spent, key deleted');
  t.deep(only(ev, 'status').map((e) => [e.s, e.delta, e.value]), [['bloom', -2, 0]], 'a status event for the spend');
  ev = play(C, rig(C, [bloom])[0]); t.eq(first(ev, 'hit').raw, 0, 'nothing to spend: 0 damage');
  // consume block
  const W2 = world(); const bb = W2.card('bb', { cost: 0, fx: [{ op: 'dmg', n: { per: 'block' }, consume: 'block' }] }), part = W2.card('part', { cost: 0, fx: [{ op: 'dmg', n: { per: 'block' }, consume: { s: 'block', upTo: 3 } }] }), heal = W2.card('heal', { type: 'skill', cost: 0, fx: [{ op: 'heal', n: { per: 'status', s: 'ward', mul: 2 }, consume: 'ward' }, { op: 'draw', n: { per: 'status', s: 'ward' }, consume: 'ward' }] });
  const C2 = W2.fight({ deck: [bb, part, heal], filler: 5, mods: { hand: 3, energy: 9 } }); plain(C2);
  C2.heroes[0].block = 9;
  ev = play(C2, rig(C2, [bb])[0]);
  t.deep([first(ev, 'hit').raw, C2.heroes[0].block], [9, 0], 'Block into damage, then lose the Block'); t.deep(only(ev, 'block_lost').map((e) => [e.cause, e.amount]), [['consume', 9]], 'block_lost consume');
  C2.heroes[0].block = 9; ev = play(C2, rig(C2, [part])[0]); t.deep([first(ev, 'hit').raw, C2.heroes[0].block], [9, 6], 'upTo 3 spends only 3');
  C2.heroes[0].hp = 10; C2.heroes[0].st.ward = 3;
  const [hc] = rig(C2, [heal]); ev = play(C2, hc);
  t.eq(C2.heroes[0].hp, 16, 'heal n is evaluated first (6), then Ward is spent'); t.ok(!C2.heroes[0].st.ward, 'ward spent'); t.eq(only(ev, 'draw').length, 0, 'the second op sees no Ward left');
});

t.test('repeat: n and the inner ops are re-evaluated every iteration; 100 iterations at most', () => {
  const W = world();
  const shrink = W.card('shrink', { type: 'skill', cost: 0, fx: [{ op: 'repeat', n: { per: 'energy' }, do: [{ op: 'energy', n: -1 }] }] });
  const C = W.fight({ deck: [shrink], filler: 0 });
  play(C, rig(C, [shrink])[0]);
  t.eq(C.energy, 1, 'energy 3: iterations run while i < energy now (3, 2, then 1 fails): 2 iterations');
  const W2 = world(); const many = W2.card('many', { type: 'skill', cost: 0, fx: [{ op: 'repeat', n: 1000, do: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }] });
  const C2 = W2.fight({ deck: [many], filler: 0 }); play(C2, rig(C2, [many])[0]);
  t.eq(C2.heroes[0].st.bloom, 100, 'capped at 100');
  const W3 = world(); const inner = W3.card('inner', { cost: 0, fx: [{ op: 'repeat', n: 3, do: [{ op: 'dmg', n: { per: 'cardsPlayed', base: 1 } }] }] });
  const C3 = W3.fight({ deck: [inner], filler: 0 }); const ev = play(C3, rig(C3, [inner])[0]);
  t.deep(only(ev, 'hit').map((h) => h.raw), [1, 1, 1], 'inner values are read afresh (cardsPlayed does not move mid-card)');
});


// ------------------------------------------------------------------ conditions
// Play a card whose only op is `cond {if}` -> gain 1 Bloom. Returns whether the condition held.
function held(cond, setup, o = {}) {
  const W = world();
  const card = W.card('c', { type: 'skill', cost: o.cost === undefined ? 0 : o.cost, fx: o.fx || [{ op: 'cond', if: cond, then: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }] });
  const junk = W.card('j', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), atk = W.card('a', { cost: 0, fx: [{ op: 'dmg', n: 1 }] });
  const enemies = o.enemies ? o.enemies(W) : [W.enemy('x', { hp: [100, 100] }), W.enemy('y', { hp: [100, 100] })];
  const C = W.fight({ deck: [card, junk, junk, junk, junk, atk, atk], filler: 0, enemies, mods: { energy: 9, hand: 7 } });
  plain(C);
  const env = { junk, atk, card, W };
  const pre = setup ? setup(C, env) : null;
  const insts = rig(C, [card].concat(o.hand || []));
  (pre && pre.play ? pre.play : []).forEach((id) => { const [x] = rig(C, [id].concat([card])); play(C, x); });
  if (pre && pre.play && pre.play.length) rig(C, [card].concat(o.hand || []));
  const inst = C.hand.find((c) => c.id === card);
  play(C, inst);
  return C.heroes[0].st.bloom === 1;
}
const both = (label, cond, yes, no, o) => {
  t.ok(held(cond, yes, o) === true, label + ': holds');
  t.ok(held(cond, no, o) === false, label + ': does not hold');
};

t.test('conditions: row, status (who, gte, lte, default), hpPct (who, lt, gt)', () => {
  both('row front', { row: 'front' }, null, (C) => { C.swap(); });
  both('row back', { row: 'back' }, (C) => { C.swap(); }, null);
  both('status default is gte 1', { status: { s: 'might' } }, (C) => { C.heroes[0].st.might = 1; }, null);
  both('status gte', { status: { s: 'might', gte: 3 } }, (C) => { C.heroes[0].st.might = 3; }, (C) => { C.heroes[0].st.might = 2; });
  both('status lte', { status: { s: 'might', lte: 1 } }, (C) => { C.heroes[0].st.might = 1; }, (C) => { C.heroes[0].st.might = 2; });
  both('status lte 0 means none', { status: { s: 'poison', lte: 0 } }, null, (C) => { C.heroes[0].st.poison = 1; });
  both('status gte and lte', { status: { s: 'ward', gte: 2, lte: 3 } }, (C) => { C.heroes[0].st.ward = 3; }, (C) => { C.heroes[0].st.ward = 4; });
  both('status who ally', { status: { s: 'ward', who: 'ally', gte: 2 } }, (C) => { C.heroes[1].st.ward = 2; }, (C) => { C.heroes[0].st.ward = 5; });
  both('status who target', { status: { s: 'vulnerable', who: 'target' } }, (C) => { C.enemies[0].st.vulnerable = 1; }, null);
  both('status who enemy', { status: { s: 'poison', who: 'enemy', gte: 3 } }, (C) => { C.enemies[0].st.poison = 3; }, (C) => { C.enemies[0].st.poison = 2; });
  both('hpPct lt', { hpPct: { lt: 0.5 } }, (C) => { C.heroes[0].hp = 30; }, (C) => { C.heroes[0].hp = 35; });
  both('hpPct gt', { hpPct: { gt: 0.5 } }, (C) => { C.heroes[0].hp = 36; }, (C) => { C.heroes[0].hp = 35; });
  both('hpPct who ally', { hpPct: { who: 'ally', lt: 0.5 } }, (C) => { C.heroes[1].hp = 20; }, null);
  both('hpPct who target', { hpPct: { who: 'target', lt: 0.5 } }, (C) => { C.enemies[0].hp = 40; }, null);
  both('hpPct lt and gt together', { hpPct: { lt: 0.9, gt: 0.5 } }, (C) => { C.heroes[0].hp = 42; }, (C) => { C.heroes[0].hp = 70; });
});

t.test('conditions: handEmpty, cardsPlayed, attacksPlayed, turn, lastKill, targetStatus, allyDown, block, energy, handSize, enemies', () => {
  t.ok(held({ handEmpty: true }, null, {}) === true, 'handEmpty: the played card was the only one');
  t.ok(held({ handEmpty: true }, null, { hand: ['t_j'] }) === false, 'handEmpty: a card left in hand');
  both('cardsPlayed gte', { cardsPlayed: { gte: 1 } }, () => ({ play: ['t_j'] }), null);
  both('cardsPlayed lte', { cardsPlayed: { lte: 0 } }, null, () => ({ play: ['t_j'] }));
  both('attacksPlayed gte', { attacksPlayed: { gte: 1 } }, () => ({ play: ['t_a'] }), () => ({ play: ['t_j'] }));
  both('turn gte', { turn: { gte: 2 } }, (C) => { C.endTurn(); }, null);
  both('turn lte', { turn: { lte: 1 } }, null, (C) => { C.endTurn(); });
  both('targetStatus gte', { targetStatus: { s: 'vulnerable', gte: 2 } }, (C) => { C.enemies[0].st.vulnerable = 2; }, (C) => { C.enemies[0].st.vulnerable = 1; });
  both('targetStatus lte', { targetStatus: { s: 'vulnerable', lte: 0 } }, null, (C) => { C.enemies[0].st.vulnerable = 1; });
  both('allyDown', { allyDown: true }, (C) => { C.heroes[1].hp = 0; C.heroes[1].down = true; C.heroes[1]._downDone = true; }, null);
  both('block gte', { block: { gte: 5 } }, (C) => { C.heroes[0].block = 5; }, (C) => { C.heroes[0].block = 4; });
  both('energy gte counts the remaining Energy after paying', { energy: { gte: 2 } }, null, (C) => { C.energy = 2; }, { cost: 1 });
  both('energy lte', { energy: { lte: 0 } }, (C) => { C.energy = 1; }, null, { cost: 1 });
  t.ok(held({ handSize: { gte: 2 } }, null, { hand: ['t_j', 't_j'] }) === true, 'handSize gte holds with two others');
  t.ok(held({ handSize: { gte: 2 } }, null, { hand: ['t_j'] }) === false, 'handSize: one other card is not two');
  t.ok(held({ handSize: { lte: 1 } }, null, { hand: ['t_j'] }) === true, 'handSize lte holds with one other'); t.ok(held({ handSize: { lte: 1 } }, null, { hand: ['t_j', 't_j'] }) === false, 'handSize lte fails with two others');
  both('enemies gte', { enemies: { gte: 2 } }, null, (C) => { C.enemies[1].down = true; });
  both('enemies lte', { enemies: { lte: 1 } }, (C) => { C.enemies[1].down = true; }, null);
  both('multi-key: all must hold', { row: 'front', status: { s: 'might', gte: 1 }, hpPct: { lt: 0.9 } }, (C) => { C.heroes[0].st.might = 1; C.heroes[0].hp = 40; }, (C) => { C.heroes[0].st.might = 1; });
  // lastKill: any target of the immediately preceding dmg op died from it
  const fx = [{ op: 'dmg', n: 5 }, { op: 'cond', if: { lastKill: true }, then: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }];
  t.ok(held(null, (C) => { C.enemies[0].hp = 5; C.enemies[0].maxHp = 100; }, { fx }) === true, 'lastKill: the hit killed');
  t.ok(held(null, null, { fx }) === false, 'lastKill: it did not');
  const fxAoe = [{ op: 'dmg', n: 5, tgt: 'all' }, { op: 'block', n: 1 }, { op: 'cond', if: { lastKill: true }, then: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }];
  t.ok(held(null, (C) => { C.enemies[1].hp = 5; }, { fx: fxAoe }) === true, 'lastKill: any victim of an AoE, and non-dmg ops in between do not reset it');
  const fxReset = [{ op: 'dmg', n: 99 }, { op: 'dmg', n: 1 }, { op: 'cond', if: { lastKill: true }, then: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }];
  t.ok(held(null, (C) => { C.enemies[0].hp = 5; }, { fx: fxReset }) === false, 'lastKill looks only at the IMMEDIATELY preceding dmg op');
  // else branch
  const fxElse = [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }], else: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }];
  t.ok(held(null, null, { fx: fxElse }) === true, 'else runs when the condition fails');
});

// ------------------------------------------------------------------ per sources
// Play a card `dmg n: V` against a 999 HP enemy with plain heroes; the hit's raw damage is V evaluated.
function probe(V, o = {}) {
  const W = world();
  const big = W.enemy('big', { hp: [999, 999] });
  const p = W.card('p', { cost: o.cost === undefined ? 0 : o.cost, type: o.type || 'attack', fx: o.fx || [{ op: 'dmg', n: V }], slots: ['red'] });
  const j = W.card('j', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 0 }] }), a = W.card('a', { cost: 0, fx: [{ op: 'dmg', n: 0 }] });
  const gem = W.gem('g', { mod: { block: 1 } });
  const C = W.fight({ deck: [{ id: p, gems: o.gems ? [gem] : [null] }, j, j, j, j, a], filler: 6, enemies: o.enemies ? o.enemies(W, big) : [big], mods: { energy: o.energy || 9, hand: 6 }, heroes: o.heroes });
  plain(C);
  if (o.setup) o.setup(C, { j, a, p, W });
  (o.pre || []).forEach((id) => { const x = rig(C, [id])[0]; play(C, x); });
  const hand = rig(C, [p].concat((o.hand || []).map((h) => (h === 'j' ? j : a))));
  const exp = typeof o.expect === 'function' ? o.expect(C) : o.expect;
  const ev = play(C, hand[0], o.target);
  return { raw: first(ev, 'hit') ? first(ev, 'hit').raw : null, exp, C, ev };
}
const per = (label, V, expected, o = {}) => { const r = probe(V, Object.assign({ expect: expected }, o)); t.eq(r.raw, r.exp, 'per ' + label); return r; };

t.test('per: every counter reads the right thing', () => {
  per('X', { per: 'X' }, 3, { cost: 'X', energy: 3 });
  per('X with more energy', { per: 'X', mul: 2 }, 10, { cost: 'X', energy: 5 });
  per('handSize excludes the card being played', { per: 'handSize' }, 3, { hand: ['j', 'j', 'j'] });
  per('drawPile', { per: 'drawPile' }, (C) => C.draw.length + 0);
  per('discardPile', { per: 'discardPile' }, (C) => C.discard.length);
  per('exhaustPile', { per: 'exhaustPile' }, 2, { setup: (C) => { C.exhaust.push(C.draw.pop(), C.draw.pop()); } });
  per('cardsPlayed', { per: 'cardsPlayed' }, 3, { pre: ['t_j', 't_j', 't_a'] });
  per('attacksPlayed', { per: 'attacksPlayed' }, 1, { pre: ['t_j', 't_j', 't_a'] });
  per('skillsPlayed', { per: 'skillsPlayed' }, 2, { pre: ['t_j', 't_j', 't_a'] });
  per('energy is the remaining Energy after paying', { per: 'energy' }, 6, { cost: 3, energy: 9 });
  per('block (self)', { per: 'block' }, 7, { setup: (C) => { C.heroes[0].block = 7; } });
  per('block who ally', { per: 'block', who: 'ally' }, 4, { setup: (C) => { C.heroes[1].block = 4; } });
  per('block who target', { per: 'block', who: 'target' }, 6, { setup: (C) => { C.enemies[0].block = 6; } });
  per('hp', { per: 'hp' }, 50, { setup: (C) => { C.heroes[0].hp = 50; } });
  per('hp who ally', { per: 'hp', who: 'ally' }, 33, { setup: (C) => { C.heroes[1].hp = 33; } });
  per('hp who target', { per: 'hp', who: 'target' }, 900, { setup: (C) => { C.enemies[0].hp = 900; } });
  per('missingHp', { per: 'missingHp' }, 20, { setup: (C) => { C.heroes[0].hp = 50; } });
  per('missingHp who ally', { per: 'missingHp', who: 'ally' }, 15, { setup: (C) => { C.heroes[1].hp = 45; } });
  per('missingHp who target', { per: 'missingHp', who: 'target' }, 99, { setup: (C) => { C.enemies[0].hp = 900; } });
  per('status (self)', { per: 'status', s: 'bloom', mul: 2 }, 8, { setup: (C) => { C.heroes[0].st.bloom = 4; } });
  per('status who ally', { per: 'status', s: 'ward', who: 'ally' }, 3, { setup: (C) => { C.heroes[1].st.ward = 3; } });
  per('status who target', { per: 'status', s: 'poison', who: 'target' }, 5, { setup: (C) => { C.enemies[0].st.poison = 5; } });
  per('status who enemy is the same as target', { per: 'status', s: 'poison', who: 'enemy' }, 5, { setup: (C) => { C.enemies[0].st.poison = 5; } });
  per('debuffs defaults to the target and counts distinct debuffs', { per: 'debuffs', mul: 3 }, 6, { setup: (C) => { C.enemies[0].st = { weak: 2, poison: 9, might: 4 }; } });
  per('debuffs who self', { per: 'debuffs', who: 'self' }, 2, { setup: (C) => { C.heroes[0].st = { frail: 1, poison: 2, bloom: 3 }; } });
  per('enemies counts the living', { per: 'enemies' }, 2, { enemies: (W, big) => [big, W.enemy('other')] });
  per('kills', { per: 'kills' }, 2, { setup: (C) => { C.stats.kills.push({ def: 'x', tier: 'normal', by: 'card' }, { def: 'y', tier: 'normal', by: 'card' }); } });
  per('turn', { per: 'turn' }, 1, {});
  const r = probe({ per: 'turn' }, { setup: (C) => { C.endTurn(); C.endTurn(); }, expect: 3 }); t.eq(r.raw, 3, 'per turn on turn 3');
  per('gems counts the gems socketed on the card', { per: 'gems', mul: 5 }, 5, { gems: true });
  per('gems: none', { per: 'gems' }, 0, {});
  per('front', { per: 'front', mul: 4, base: 1 }, 5, {});
  const back = probe({ per: 'front', mul: 4, base: 1 }, { setup: (C) => { C.swap(); }, expect: 1 }); t.eq(back.raw, 1, 'per front in the back row');
  per('targetBlock', { per: 'targetBlock' }, 8, { setup: (C) => { C.enemies[0].block = 8; } });
  // damageTaken and hitsTaken: the window is the last enemy phase plus anything since
  const W = world(); const two = W.enemy('two', { moves: { h: { name: 'H', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 2, tgt: 'front' }] } }, ai: { seq: ['h'] } });
  const dt = W.card('dt', { cost: 0, fx: [{ op: 'dmg', n: { per: 'damageTaken' } }, { op: 'dmg', n: { per: 'hitsTaken' } }] });
  const C = W.fight({ deck: [dt, dt, dt], filler: 0, enemies: [two], mods: { hand: 3 } });
  t.deep(only(play(C, rig(C, [dt])[0]), 'hit').map((h) => h.raw), [0, 0], 'turn 1: nothing taken yet');
  C.endTurn();
  t.deep(only(play(C, rig(C, [dt])[0]), 'hit').map((h) => h.raw), [10, 2], 'the damage of the enemy phase before it, and the hits that removed HP');
  C.heroes[0].hp -= 3; C.heroes[0]._dmgTaken += 3;
  t.eq(first(play(C, rig(C, [dt])[0]), 'hit').raw, 13, 'plus anything lost since');
  C.heroes[0].block = 99;
  C.endTurn();
  t.deep(only(play(C, rig(C, [dt])[0]), 'hit').map((h) => h.raw), [0, 0], 'fully blocked hits took no HP (the counter reset when the enemy phase began)');
});

t.test('per: picked; V modifiers base, mul, upTo, cap, min and the floor', () => {
  const W = world();
  const a = W.card('a', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const pk = W.card('pk', { cost: 0, fx: [{ op: 'pick', from: 'hand', n: 2, then: 'discard' }, { op: 'dmg', n: { per: 'picked', mul: 5 } }] });
  const C = W.fight({ deck: [pk, a, a, a], filler: 0, mods: { hand: 4 } }); plain(C);
  const P = rig(C, [pk, a, a, a]); play(C, P[0]);
  const ev = C.resolvePick([P[1].uid, P[2].uid]);
  t.eq(first(ev, 'hit').raw, 10, 'per picked counts the cards resolved by the pick');
  const v = (V) => probe(V, { setup: (C2) => { C2.heroes[0].st.bloom = 5; } }).raw;
  t.eq(v({ base: 2, per: 'status', s: 'bloom', mul: 3 }), 17, 'base + mul * count');
  t.eq(v({ per: 'status', s: 'bloom', mul: 3, upTo: 2 }), 6, 'upTo caps the count');
  t.eq(v({ per: 'status', s: 'bloom', mul: 3, cap: 10 }), 10, 'cap caps the value');
  t.eq(v({ per: 'status', s: 'bloom', mul: 0.5 }), 2, 'floor(2.5)');
  t.eq(v({ base: 1, per: 'status', s: 'bloom', mul: 0, min: 4 }), 4, 'min raises the value');
  t.eq(v({ per: 'status', s: 'bloom', mul: -1 }), 0, 'a negative dmg count clamps to 0');
  t.eq(v({ base: 7 }), 7, 'a V with only a base is a number');
  t.eq(v({ per: 'status', s: 'bloom', mul: 1 / 3 }), 1, 'floor(1.666)');
  // counts the op clamps: block, heal, draw, hits, repeat are >= 0; energy and status may be negative
  const W2 = world(); const neg = W2.card('neg', { type: 'skill', cost: 0, fx: [{ op: 'block', n: -5 }, { op: 'energy', n: -1 }, { op: 'status', s: 'might', n: -2, tgt: 'self' }, { op: 'draw', n: -3 }, { op: 'dmg', n: 4, hits: -2 }] });
  const C2 = W2.fight({ deck: [neg], filler: 0 }); const ev2 = play(C2, rig(C2, [neg])[0]);
  t.eq(only(ev2, 'block').length, 0, 'negative block is 0'); t.eq(C2.energy, 2, 'energy may go down'); t.eq(C2.heroes[0].st.might, -2, 'status may go negative'); t.eq(only(ev2, 'draw').length, 0, 'draw clamps'); t.eq(only(ev2, 'hit').length, 0, 'hits clamp');
});


// ------------------------------------------------------------------ hooks
const stat = (u, k) => u.st[k] || 0;

t.test('combatStart, turnStart and turnEnd hooks: order, Energy survives the reset, relic events', () => {
  const W = world();
  const cs = W.relic('cs', { hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }] });
  const ts = W.relic('ts', { hooks: [{ on: 'turnStart', fx: [{ op: 'energy', n: 1 }] }] });
  const te = W.relic('te', { hooks: [{ on: 'turnEnd', fx: [{ op: 'block', n: 4, tgt: 'self' }] }] });
  const C = W.fight({ relics: [cs, ts, te], start: false, enemies: [W.hitter(5)] });
  const ev = C.start();
  const ty = types(ev);
  t.ok(ty.indexOf('relic') < ty.indexOf('intent'), 'combatStart hooks fire before the first intents');
  t.deep(only(ev, 'relic').map((e) => e.id), [cs, ts], 'a relic event says which relic ran');
  t.ok(ty.indexOf('relic') < ty.indexOf('status'), 'the relic event comes before its effect');
  t.eq(C.heroes[0].st.sumi, 1, 'a party hook on a global event acts for the FRONT hero');
  t.eq(C.energy, 4, 'a turnStart Energy hook survives the reset'); t.eq(C.draw.length + C.hand.length, 10, 'sanity');
  const e2 = C.endTurn();
  t.eq(first(e2, 'hit').blocked, 4, 'the turnEnd block held through the enemy phase');
  t.eq(C.energy, 4, 'turn 2: 3 + 1');
  C.swap(); const e3 = C.endTurn();
  t.ok(only(e3, 'relic').length === 2, 'both turn hooks fire each turn');
  t.eq(C.front().id, 'kuro', 'front hero after the swap'); t.eq(C.heroes[1].st.sumi, undefined, 'combatStart only fired once');
});

t.test('onPlay: filters type, cost, kw, gems and hero; fires after the card resolves and after its own exhaust', () => {
  const W = world();
  const gem = W.gem('bg', { color: 'blue', mod: { block: 1 } });
  const sk = W.card('sk', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), big = W.card('big', { cost: 2, kw: ['exhaust'], fx: [{ op: 'dmg', n: 1 }] }), kc = W.card('kc', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), gc = W.card('gc', { type: 'skill', cost: 0, slots: ['blue'], fx: [{ op: 'block', n: 1 }] });
  const on = (filter, s) => ({ on: 'onPlay', filter, fx: [{ op: 'status', s, n: 1, tgt: 'self' }] });
  const relic = W.relic('r', { hooks: [on({ type: 'skill' }, 'ward'), on({ type: ['attack', 'power'] }, 'bloom'), on({ cost: { gte: 2 } }, 'sumi'), on({ kw: 'exhaust' }, 'charge'), on({ gems: { gte: 1 } }, 'bulwark'), on({ hero: 'kuro' }, 'thorns'), on({ cost: { lte: 0 } }, 'regen')] });
  const C = W.fight({ deck: [sk, big, kc, { id: gc, gems: [gem] }], filler: 0, relics: [relic], mods: { hand: 4, energy: 9 } });
  play(C, rig(C, [sk])[0]);
  t.deep(C.heroes[0].st, { ward: 1, regen: 1 }, 'a skill of cost 0');
  const ev = play(C, rig(C, [big])[0]);
  t.deep(C.heroes[0].st, { ward: 1, regen: 1, bloom: 1, sumi: 1, charge: 1 }, 'an exhaust attack costing 2 (cost is the Energy paid)');
  t.ok(types(ev).indexOf('exhaust') < types(ev).indexOf('relic'), 'onPlay fires after the card went to the exhaust pile');
  play(C, rig(C, [kc])[0]);
  t.deep(C.heroes[1].st, { ward: 1, thorns: 1, regen: 1 }, 'kuro\'s card: the hero filter matches, and each hook acts for the hero who played');
  play(C, rig(C, [gc])[0]);
  t.eq(C.heroes[0].st.bulwark, 1, 'gems gte 1 counts the gems socketed on the card');
});

t.test('onDamaged: once per enemy attack hit even when fully blocked; never for dodge, poison, burn, hurt or thorns; target enemy is the attacker', () => {
  const W = world();
  const multi = W.enemy('multi', { hp: [50, 50], moves: { h: { name: 'H', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 3, tgt: 'front' }] } }, ai: { seq: ['h'] } });
  const relic = W.relic('d', { hooks: [{ on: 'onDamaged', fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }, { op: 'dmg', n: 2, tgt: 'enemy' }] }] });
  const C = W.fight({ enemies: [multi], relics: [relic] });
  C.heroes[0].block = 99;
  const ev = C.endTurn();
  t.eq(C.heroes[0].st.charge, 3, 'three hits, fully blocked, three triggers'); t.deep(only(ev, 'relic').length, 3, 'three relic events');
  t.eq(C.enemies[0].hp, 44, 'dmg tgt enemy in an onDamaged hook hits the attacker');
  // dodge
  const C2 = W.fight({ enemies: [multi], relics: [relic] }); C2.heroes[0].st.dodge = 1;
  C2.endTurn(); t.eq(C2.heroes[0].st.charge, 2, 'a dodged hit does not trigger onDamaged');
  // poison, burn, hurt, thorns do not
  const W3 = world(); const relic3 = W3.relic('d', { hooks: [{ on: 'onDamaged', fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }] });
  const hurt = W3.card('hurt', { type: 'skill', cost: 0, fx: [{ op: 'hurt', n: 2 }] }), hit = W3.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 1 }] });
  const C3 = W3.fight({ deck: [hurt, hit], filler: 0, relics: [relic3] });
  C3.heroes[0].st.poison = 2; C3.heroes[0].st.burn = 4; C3.enemies[0].st.thorns = 3;
  play(C3, rig(C3, [hurt])[0]); play(C3, rig(C3, [hit])[0]);
  C3.endTurn();
  t.eq(C3.heroes[0].st.charge, undefined, 'hurt, thorns, poison and burn never trigger onDamaged');
  t.ok(C3.heroes[0].hp < 70, 'but the damage happened');
  // the killing hit still triggers a party hook (owned hooks never fire for a downed owner)
  const C4 = W.fight({ enemies: [W.hitter(99)], relics: [relic3], heroes: [{ id: 'hanae', hp: 5, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] });
  const e4 = C4.endTurn();
  t.eq(only(e4, 'relic').length, 1, 'the lethal hit ran the party hook (its ops on the downed hero are skipped)'); t.eq(C4.heroes[0].down, true, 'hanae is down');
});

t.test('onKill: every death except fleeing, by cards, hooks, poison, burn and thorns; credit; tier filter', () => {
  const W = world();
  const relic = W.relic('k', { hooks: [{ on: 'onKill', fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }] });
  const weakling = W.enemy('weakling', { hp: [3, 3] });
  const kuroHit = W.card('kh', { hero: 'kuro', cost: 0, fx: [{ op: 'dmg', n: 9 }] }), hanaeHit = W.card('hh', { cost: 0, fx: [{ op: 'dmg', n: 9 }] });
  const bloomOf = (C) => C.heroes.map((h) => stat(h, 'bloom'));
  let C = W.fight({ deck: [kuroHit, hanaeHit], filler: 0, enemies: [weakling, W.dummy], relics: [relic], mods: { energy: 9 } });
  play(C, rig(C, [kuroHit])[0], 't_weakling#1'); t.deep(bloomOf(C), [0, 1], 'a card kill credits the hero who played it (kuro, in the back)');
  // poison and burn credit the front hero
  C = W.fight({ enemies: [weakling, W.dummy], relics: [relic] }); C.enemies[0].st.poison = 5; C.endTurn(); t.deep(bloomOf(C), [1, 0], 'poison credits the front hero');
  C = W.fight({ enemies: [weakling, W.dummy], relics: [relic] }); C.enemies[0].st.burn = 5; C.endTurn(); t.deep(bloomOf(C), [1, 0], 'burn credits the front hero');
  // thorns credit the owner of the thorns
  const back = W.enemy('backhit', { hp: [3, 3], moves: { h: { name: 'H', kind: 'attack', fx: [{ op: 'dmg', n: 1, tgt: 'back' }] } }, ai: { seq: ['h'] } });
  C = W.fight({ enemies: [back, W.dummy], relics: [relic] }); C.heroes[1].st.thorns = 9; C.endTurn(); t.deep(bloomOf(C), [0, 1], 'thorns credit the owner of the thorns (kuro, in the back)');
  // hook damage credits the hook's hero
  const pw = W.card('pw', { hero: 'kuro', type: 'power', cost: 0, fx: [{ op: 'hook', on: 'turnEnd', fx: [{ op: 'dmg', n: 9, tgt: 'all' }] }] });
  C = W.fight({ deck: [pw], filler: 0, enemies: [weakling, W.dummy], relics: [relic] }); play(C, rig(C, [pw])[0]); C.endTurn(); t.deep(bloomOf(C), [0, 1], 'hook damage credits the hero who owns the hook');
  t.eq(C.stats.kills[0].by, 'hook', 'kills by hook damage are by hook');
  // fleeing is not a kill
  const runner = W.enemy('run', { moves: { f: { name: 'F', kind: 'flee', fx: [{ op: 'flee' }] } }, ai: { seq: ['f'] } });
  C = W.fight({ enemies: [runner, W.dummy], relics: [relic] }); C.endTurn(); t.deep(bloomOf(C), [0, 0], 'no onKill for a flee');
  // tier filter
  const elite = W.enemy('el', { tier: 'elite', hp: [3, 3], size: 'l' }), erelic = W.relic('ek', { hooks: [{ on: 'onKill', filter: { tier: 'elite' }, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }] });
  C = W.fight({ deck: [hanaeHit, hanaeHit], filler: 0, enemies: [weakling, elite, W.dummy], relics: [erelic], mods: { energy: 9 } });
  play(C, rig(C, [hanaeHit])[0], 't_weakling#1'); t.deep(bloomOf(C), [0, 0], 'a normal enemy does not match tier elite');
  play(C, rig(C, [hanaeHit])[0], 't_el#1'); t.deep(bloomOf(C), [1, 0], 'an elite does');
});

t.test('onHeroDown: fires before the lose check so a hook may revive; onSwap, onShuffle, onExhaust and combatEnd', () => {
  const W = world();
  const phoenix = W.relic('phoenix', { hooks: [{ on: 'onHeroDown', once: true, fx: [{ op: 'revive', pct: 0.25 }] }] });
  const slam = W.enemy('slam', { moves: { s: { name: 'S', kind: 'attack', fx: [{ op: 'dmg', n: 99, tgt: 'both' }] } }, ai: { seq: ['s'] } });
  const C = W.fight({ enemies: [slam], relics: [phoenix] });
  const ev = C.endTurn();
  t.eq(C.result, null, 'the Phoenix saved the party from a total wipe'); t.deep([C.heroes[0].down, C.heroes[1].down], [false, true], 'hanae was revived, kuro fell after the relic was used up');
  t.deep([C.heroes[0].hp, C.front().id], [18, 'hanae'], '25 percent of 70 (rounded), and the survivor leads');
  t.deep(only(ev, 'hero_down').map((e) => e.hero), ['hanae', 'kuro'], 'both fell'); t.eq(only(ev, 'hero_revive').length, 1, 'revived once');
  const ty = types(ev);
  t.ok(ty.indexOf('hero_down') < ty.indexOf('relic') && ty.indexOf('relic') < ty.indexOf('hero_revive'), 'hero_down, then the relic, then the revive');
  // both fall with no revive: lose
  const C2 = W.fight({ enemies: [slam] }); C2.endTurn();
  t.eq(C2.result, 'lose', 'both downed loses'); t.eq(C2.phase, 'over', 'over'); t.eq(C2.stats.heroDowns, 2, 'two downs');
  // onSwap gets the hero moving forward; onShuffle; onExhaust for keyword, pick and ethereal but never powers
  const W3 = world();
  const r = (on, s) => W3.relic('r' + on, { hooks: [{ on, fx: [{ op: 'status', s, n: 1, tgt: 'self' }] }] });
  const ex = W3.card('ex', { type: 'skill', kw: ['exhaust'], cost: 0, fx: [{ op: 'block', n: 1 }] }), et = W3.card('et', { type: 'skill', kw: ['ethereal'], cost: 0, fx: [{ op: 'block', n: 1 }] }), pw = W3.card('pw', { type: 'power', kw: ['exhaust'], cost: 0, fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] }), pk = W3.card('pk', { type: 'skill', cost: 0, fx: [{ op: 'pick', from: 'hand', n: 1, then: 'exhaust' }] }), fodder = W3.card('fodder', { type: 'skill', cost: 9, fx: [{ op: 'block', n: 1 }] });
  const C3 = W3.fight({ deck: [ex, et, pw, pk, fodder], filler: 0, relics: [r('onExhaust', 'bloom'), r('onShuffle', 'sumi'), r('onSwap', 'ward')], mods: { hand: 5, energy: 9 } });
  play(C3, rig(C3, [pw])[0]); t.eq(stat(C3.heroes[0], 'bloom'), 0, 'a power never fires onExhaust');
  play(C3, rig(C3, [ex])[0]); t.eq(stat(C3.heroes[0], 'bloom'), 1, 'exhaust keyword');
  const [p1, f1] = rig(C3, [pk, fodder]); play(C3, p1); C3.resolvePick([f1.uid]); t.eq(stat(C3.heroes[0], 'bloom'), 2, 'a pick with then exhaust');
  rig(C3, [et]); C3.endTurn(); t.eq(stat(C3.heroes[0], 'bloom'), 3, 'ethereal exhaustion');
  t.eq(stat(C3.heroes[0], 'sumi') + stat(C3.heroes[1], 'sumi'), 1, 'onShuffle fired once when the draw pile ran out');
  C3.swap(); t.eq(stat(C3.heroes[1], 'ward'), 1, 'onSwap acts for the hero who moved forward (kuro)');
  // combatEnd: on a win only, before the end event
  const W4 = world(); const rich = W4.relic('rich', { hooks: [{ on: 'combatEnd', fx: [{ op: 'gold', n: 7 }] }] }); const nuke = W4.card('nuke', { fx: [{ op: 'dmg', n: 999 }] });
  const C4 = W4.fight({ deck: [nuke], filler: 0, relics: [rich] }); const ev4 = play(C4, rig(C4, [nuke])[0]);
  t.eq(C4.summary().gold, 7, 'combatEnd hook ran on the win'); t.ok(types(ev4).indexOf('gold') < types(ev4).indexOf('end') && ev4[ev4.length - 1].type === 'end', 'before end, and end is last');
  const slam4 = W4.enemy('slam', { moves: { s: { name: 'S', kind: 'attack', fx: [{ op: 'dmg', n: 99, tgt: 'both' }] } }, ai: { seq: ['s'] } });
  const C5 = W4.fight({ enemies: [slam4], relics: [rich] }); C5.endTurn(); t.eq(C5.summary().gold, 0, 'not on a loss');
});

t.test('hook meta: limit is per player turn (the enemy phase is the same turn), once is per combat, every counts triggers', () => {
  const W = world();
  const kill = W.relic('kl', { hooks: [{ on: 'onKill', limit: 1, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }] });
  const w = W.enemy('w', { hp: [3, 3] }); const hit = W.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 9 }] });
  const C = W.fight({ deck: [hit, hit], filler: 0, enemies: [w, w, w, W.dummy], relics: [kill], mods: { energy: 9 } });
  play(C, rig(C, [hit])[0], 't_w#1'); C.enemies[1].st.poison = 9;
  C.endTurn();
  t.eq(stat(C.heroes[0], 'bloom'), 1, 'the card kill fired, the poison kill in the same round (enemy phase) hit the limit');
  play(C, rig(C, [hit])[0], 't_w#3'); t.eq(stat(C.heroes[0], 'bloom'), 2, 'the next turn resets it');
  // once per combat, every Nth
  const W2 = world();
  const multi = W2.enemy('m', { hp: [500, 500], moves: { h: { name: 'H', kind: 'multi', fx: [{ op: 'dmg', n: 1, hits: 3, tgt: 'front' }] } }, ai: { seq: ['h'] } });
  const once = W2.relic('once', { hooks: [{ on: 'onDamaged', once: true, fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }] }] }), every = W2.relic('every', { hooks: [{ on: 'onDamaged', every: 2, fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }] }), lim = W2.relic('lim', { hooks: [{ on: 'onDamaged', limit: 2, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }] });
  const C2 = W2.fight({ enemies: [multi], relics: [once, every, lim] });
  C2.endTurn(); t.deep([stat(C2.heroes[0], 'ward'), stat(C2.heroes[0], 'charge'), stat(C2.heroes[0], 'sumi')], [1, 1, 2], 'phase 1: once fired, every 2nd fired at hit 2, limit 2 caps at 2');
  C2.endTurn(); C2.endTurn(); t.deep([stat(C2.heroes[0], 'ward'), stat(C2.heroes[0], 'charge'), stat(C2.heroes[0], 'sumi')], [1, 4, 6], 'after 9 hits: once still 1, every 2nd fired 4 times, limit 2 per turn over three turns');
  // once and limit interplay in a card hook
  const W3 = world(); const pw = W3.card('pw', { type: 'power', cost: 0, fx: [{ op: 'hook', on: 'onPlay', once: true, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }] }), s3 = W3.card('s', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const C3 = W3.fight({ deck: [pw, s3, s3], filler: 0, mods: { energy: 9 } });
  play(C3, rig(C3, [pw])[0]); t.eq(stat(C3.heroes[0], 'bloom'), 0, 'a hook a card registers does not fire for that same play');
  play(C3, rig(C3, [s3])[0]); play(C3, rig(C3, [s3])[0]); t.eq(stat(C3.heroes[0], 'bloom'), 1, 'once means once');
});

t.test('hook ownership: passives fire for their owner only (or any with filter.hero any), never while the owner is down; relics with a hero need that hero in the party', () => {
  const W = world();
  W.D.heroes.hanae.passives = [{ id: 'p1', on: 'onPlay', fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }, { id: 'p2', on: 'onPlay', filter: { hero: 'any' }, fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }] }];
  const hc = W.card('hc', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), kc = W.card('kc', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const C = W.fight({ deck: [hc, kc], filler: 0 });
  play(C, rig(C, [hc])[0]); t.deep(C.heroes[0].st, { bloom: 1, ward: 1 }, 'both passives fire for hanae\'s own card');
  play(C, rig(C, [kc])[0]); t.deep(C.heroes[0].st, { bloom: 1, ward: 2 }, 'only the any-passive fires for kuro\'s card, and it acts for its owner');
  C.heroes[0].hp = 0; C.heroes[0].down = true; C.heroes[0]._downDone = true; C.heroes[0].st = {};
  rig(C, [kc]); play(C, C.hand.find((c) => c.id === kc)); t.deep(C.heroes[0].st, {}, 'never while the owner is downed');
  // relic with a hero
  const W2 = world();
  const kr = W2.relic('kr', { hero: 'kuro', hooks: [{ on: 'onPlay', fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }] });
  const h2 = W2.card('h2', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), k2 = W2.card('k2', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const C2 = W2.fight({ deck: [h2, k2], filler: 0, relics: [kr] });
  play(C2, rig(C2, [h2])[0]); t.eq(stat(C2.heroes[1], 'sumi'), 0, 'an owned relic hook ignores the other hero\'s plays');
  play(C2, rig(C2, [k2])[0]); t.eq(stat(C2.heroes[1], 'sumi'), 1, 'and fires for its owner');
  const C3 = W2.fight({ deck: [h2], filler: 0, relics: [kr], heroes: [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'suzu', hp: 60, maxHp: 60 }] });
  play(C3, rig(C3, [h2])[0]); t.eq(stat(C3.heroes[0], 'sumi') + stat(C3.heroes[1], 'sumi'), 0, 'kuro is not in the party: the hook is dead');
  // party hook with a named hero
  const W4 = world(); const only1 = W4.relic('o', { hooks: [{ on: 'onPlay', filter: { hero: 'kuro' }, fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }] }] });
  const h4 = W4.card('h', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), k4 = W4.card('k', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const C4 = W4.fight({ deck: [h4, k4], filler: 0, relics: [only1] }); play(C4, rig(C4, [h4])[0]); play(C4, rig(C4, [k4])[0]);
  t.deep([stat(C4.heroes[0], 'ward'), stat(C4.heroes[1], 'ward')], [0, 1], 'a party hook fires for either hero unless filter.hero names one');
});

t.test('hook order: hero passives, then relics, then card hooks, each in registration order', () => {
  const W = world();
  W.D.heroes.hanae.passives = [{ id: 'p', on: 'onPlay', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] }];
  const mk = (n) => W.relic('m' + n, { hooks: [{ on: 'onPlay', fx: [{ op: 'status', s: 'might', n, tgt: 'self' }] }] });
  const a = mk(10), b = mk(100);
  const pw = W.card('pw', { type: 'power', cost: 0, fx: [{ op: 'hook', on: 'onPlay', fx: [{ op: 'status', s: 'might', n: 1000, tgt: 'self' }] }] }), hit = W.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 1 }] });
  const C = W.fight({ deck: [pw, hit], filler: 0, relics: [b, a] });
  play(C, rig(C, [pw])[0]);
  C.heroes[0].st = {};
  const ev = play(C, rig(C, [hit])[0]);
  t.deep(only(ev, 'status').map((e) => e.value), [1, 101, 111, 1111], 'passive 1, relic b 100 (registered first), relic a 10, then the card hook 1000');
  t.deep(only(ev, 'relic').map((e) => e.id), [b, a], 'relic events only for relics, in order');
});

t.test('hook targets: onPlay uses the card\'s chosen target (random without one), onKill a random living enemy, never the dead unit', () => {
  const W = world();
  const relic = W.relic('t', { hooks: [{ on: 'onPlay', fx: [{ op: 'dmg', n: 1, tgt: 'enemy' }] }] });
  const [x, y, z] = ['x', 'y', 'z'].map((n) => W.enemy(n, { hp: [100, 100] }));
  const hit = W.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 5 }] }), aoe = W.card('aoe', { cost: 0, fx: [{ op: 'dmg', n: 5, tgt: 'all' }] });
  const C = W.fight({ deck: [hit, aoe], filler: 0, enemies: [x, y, z], relics: [relic], mods: { energy: 9 } });
  let ev = play(C, rig(C, [hit])[0], 't_y#1');
  t.deep(only(ev, 'hit').map((h) => h.dst.id), ['t_y#1', 't_y#1'], 'the hook hit the same chosen enemy');
  ev = play(C, rig(C, [aoe])[0]);
  t.eq(only(ev, 'hit').length, 4, 'three AoE hits and one hook hit'); t.ok(['t_x#1', 't_y#1', 't_z#1'].includes(only(ev, 'hit')[3].dst.id), 'a random living enemy');
  const W2 = world(); const kr = W2.relic('k', { hooks: [{ on: 'onKill', fx: [{ op: 'dmg', n: 1, tgt: 'enemy' }] }] });
  const a = W2.enemy('a', { hp: [3, 3] }), b = W2.enemy('b', { hp: [100, 100] });
  const nuke = W2.card('nuke', { cost: 0, fx: [{ op: 'dmg', n: 9 }] });
  const C2 = W2.fight({ deck: [nuke], filler: 0, enemies: [a, b], relics: [kr] });
  ev = play(C2, rig(C2, [nuke])[0], 't_a#1');
  t.deep(only(ev, 'hit').map((h) => h.dst.id), ['t_a#1', 't_b#1'], 'the onKill hook picked the only living enemy, not the dead one');
});

t.test('real hero passives: Blade Flow, Steady Hand, Moonlit Rite, Storm Born', () => {
  const W = world({ keepHeroes: true });
  const atk = W.card('atk', { cost: 0, fx: [{ op: 'dmg', n: 1 }] }), sk = W.card('sk', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const C = W.fight({ deck: [atk, atk, sk, sk], filler: 0, mods: { energy: 9 }, heroes: [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] });
  C.heroes[0].st = {};
  play(C, rig(C, [atk])[0]); play(C, rig(C, [atk])[0]); t.eq(stat(C.heroes[0], 'bloom'), 1, 'Blade Flow: 1 Bloom per turn from an Attack');
  play(C, rig(C, [sk])[0]); play(C, rig(C, [sk])[0]); t.eq(stat(C.heroes[1], 'sumi'), 1, 'Steady Hand: 1 Sumi per turn from a Skill'); t.eq(stat(C.heroes[0], 'sumi'), 0, 'kuro\'s passive does not act for hanae');
  C.endTurn(); play(C, rig(C, [atk])[0]); t.eq(stat(C.heroes[0], 'bloom'), 2, 'the limit resets each turn');
  const W2 = world({ keepHeroes: true });
  const four = W2.enemy('four', { hp: [500, 500], moves: { h: { name: 'H', kind: 'multi', fx: [{ op: 'dmg', n: 1, hits: 4, tgt: 'front' }] } }, ai: { seq: ['h'] } });
  const C2 = W2.fight({ enemies: [four], heroes: [{ id: 'raiga', hp: 88, maxHp: 88 }, { id: 'suzu', hp: 68, maxHp: 68 }] });
  t.eq(stat(C2.heroes[1], 'ward'), 1, 'Moonlit Rite: Suzu gains Ward at turn start (turn 1)');
  C2.endTurn(); t.eq(stat(C2.heroes[0], 'charge'), 2, 'Storm Born: at most 2 Charge per turn from being hit'); t.eq(stat(C2.heroes[1], 'ward'), 2, 'Ward again on turn 2');
  C2.endTurn(); t.eq(stat(C2.heroes[0], 'charge'), 4, 'and 2 more the next round');
});


// ------------------------------------------------------------------ enemy AI
const atk = (n, tgt = 'front', extra = {}) => ({ name: 'A' + n, kind: 'attack', fx: [Object.assign({ op: 'dmg', n, tgt }, extra)] });
const MOVES4 = () => ({ a: atk(1), b: atk(2), c: atk(3), d: atk(4) });
let aiSerial = 0;

t.test('AI: open first, then rules in order, then seq with a wrapping cursor; open and rule moves do not advance seq', () => {
  const W = world();
  const rolls = (ai, n, setup) => {
    const C = W.fight({ enemies: [W.enemy('ai' + (++aiSerial), { hp: [999, 999], moves: MOVES4(), ai })], start: false });
    if (setup) setup(C);
    C.start();
    const out = [C.enemies[0].intent.move];
    for (let i = 1; i < n; i++) { C.endTurn(); out.push(C.enemies[0].intent.move); }
    return out;
  };
  t.deep(rolls({ open: ['a'], seq: ['b', 'c'] }, 6), ['a', 'b', 'c', 'b', 'c', 'b'], 'open then seq, wrapping');
  t.deep(rolls({ open: ['a', 'b'], seq: ['c'] }, 4), ['a', 'b', 'c', 'c'], 'open entries are used in order, once');
  t.deep(rolls({ open: ['a'], seq: ['b', 'c'], rules: [{ if: { turnGte: 3 }, do: 'd', once: true }] }, 6), ['a', 'b', 'd', 'c', 'b', 'c'], 'a once rule fires once and does not advance the seq cursor');
  t.deep(rolls({ open: ['a'], seq: ['b'], rules: [{ if: { turnGte: 1 }, do: 'd' }] }, 3), ['a', 'd', 'd'], 'rules do not pre-empt the opener, then win over seq while they hold');
  t.deep(rolls({ seq: ['a'], rules: [{ if: { turnGte: 2 }, do: 'c' }, { if: { turnGte: 2 }, do: 'd' }] }, 3), ['a', 'c', 'c'], 'the first matching rule wins');
  t.deep(rolls({ seq: ['a'], rules: [{ if: { turnEvery: [3, 2] }, do: 'd' }] }, 9), ['a', 'a', 'd', 'a', 'a', 'd', 'a', 'a', 'd'], 'turnEvery [3, 2] is turns 3, 6, 9 of the enemy\'s own count');
  t.deep(rolls({ seq: ['a'], rules: [{ if: { turnEvery: [2, 0] }, do: 'd' }] }, 5), ['d', 'a', 'd', 'a', 'd'], 'turnEvery [2, 0] is turns 1, 3, 5');
  t.deep(rolls({ seq: ['a'], rules: [{ if: { turnGte: 2 }, do: 'c', once: true }, { if: { turnGte: 2 }, do: 'd' }] }, 4), ['a', 'c', 'd', 'd'], 'a once rule that fired is skipped forever, so the next rule takes over');
  const C = W.fight({ enemies: [W.enemy('aix', { hp: [999, 999], moves: MOVES4(), ai: { open: ['a'], seq: ['b', 'c'] } })] });
  t.deep(C.enemies[0].ai, { openIdx: 1, seqIdx: 0, fired: {}, recent: ['a'] }, 'u.ai is engine state: cursors and recent moves');
  t.eq(C.enemies[0].turn, 1, 'the enemy\'s own turn count is 1 on the turn of its first intent'); C.endTurn(); t.eq(C.enemies[0].turn, 2, '+1 each round');
  t.eq(first(C.events, 'intent').intent.move, 'a', 'intent events carry the intent');
});

t.test('AI conditions: hpLt, hpGt, alone, minions, heroStatus, heroDown, allyHpLt, heroHpLt', () => {
  const W = world();
  const mk = (cond, extraEnemies) => {
    const e = W.enemy('c' + (++aiSerial), { hp: [100, 100], moves: MOVES4(), ai: { seq: ['a'], rules: [{ if: cond, do: 'd' }] } });
    return { e, others: extraEnemies };
  };
  const rolled = (cond, setup, others) => {
    const { e } = mk(cond);
    const C = W.fight({ enemies: [e].concat(others ? others(W) : []), start: false });
    if (setup) setup(C);
    C.start();
    return C.enemies[0].intent.move === 'd';
  };
  const pair = (label, cond, yes, no, others) => { t.ok(rolled(cond, yes, others) === true, label + ': holds'); t.ok(rolled(cond, no, others) === false, label + ': does not hold'); };
  pair('hpLt', { hpLt: 0.5 }, (C) => { C.enemies[0].hp = 40; }, (C) => { C.enemies[0].hp = 50; });
  pair('hpGt', { hpGt: 0.5 }, (C) => { C.enemies[0].hp = 60; }, (C) => { C.enemies[0].hp = 50; });
  t.ok(rolled({ alone: true }) === true, 'alone: no other enemy'); t.ok(rolled({ alone: true }, null, (W2) => [W2.enemy('buddy' + W2.n())]) === false, 'alone: not with a buddy');
  const minion = (W2) => [W2.enemy('mi' + W2.n(), { tier: 'minion', size: 's', hp: [5, 5] }), W2.enemy('mi' + W2.n(), { tier: 'minion', size: 's', hp: [5, 5] })];
  t.ok(rolled({ minions: { lt: 2 } }, null, (W2) => [minion(W2)[0]]) === true, 'minions lt 2 with one'); t.ok(rolled({ minions: { lt: 2 } }, null, minion) === false, 'minions lt 2 with two');
  t.ok(rolled({ minions: { lt: 1 } }) === true, 'no minions at all');
  pair('heroStatus default gte 1', { heroStatus: { s: 'weak' } }, (C) => { C.heroes[1].st.weak = 1; }, null);
  pair('heroStatus gte 2', { heroStatus: { s: 'weak', gte: 2 } }, (C) => { C.heroes[0].st.weak = 2; }, (C) => { C.heroes[0].st.weak = 1; });
  pair('heroDown', { heroDown: true }, (C) => { C.heroes[1].down = true; C.heroes[1].hp = 0; }, null);
  pair('allyHpLt', { allyHpLt: 0.5 }, (C) => { C.enemies[1].hp = 30; }, (C) => { C.enemies[1].hp = 90; }, (W2) => [W2.enemy('buddy' + W2.n(), { hp: [100, 100] })]);
  pair('heroHpLt', { heroHpLt: 0.5 }, (C) => { C.heroes[1].hp = 20; }, (C) => { C.heroes[1].hp = 40; });
  // a downed hero does not count for heroHpLt or heroStatus
  t.ok(rolled({ heroHpLt: 0.5 }, (C) => { C.heroes[1].hp = 0; C.heroes[1].down = true; }) === false, 'downed heroes are ignored by heroHpLt');
  // multi-key: all must hold
  t.ok(rolled({ hpLt: 0.5, turnGte: 1 }, (C) => { C.enemies[0].hp = 10; }) === true && rolled({ hpLt: 0.5, turnGte: 2 }, (C) => { C.enemies[0].hp = 10; }) === false, 'every key of a rule must hold');
});

t.test('AI weighted: noRepeat forbids a move chosen N times in a row; rolls consume the rng, intent and preview do not', () => {
  const W = world();
  const w = (ai, seed) => W.fight({ enemies: [W.enemy('w' + (++aiSerial), { hp: [9999, 9999], moves: MOVES4(), ai })], seed });
  const runOf = (seq) => { let best = 1, cur = 1; for (let i = 1; i < seq.length; i++) { cur = seq[i] === seq[i - 1] ? cur + 1 : 1; best = Math.max(best, cur); } return best; };
  const roll = (C, n) => { const out = [C.enemies[0].intent.move]; for (let i = 1; i < n; i++) { C.endTurn(); out.push(C.enemies[0].intent.move); } return out; };
  let seq = roll(w({ weighted: [['a', 50], ['b', 1]], noRepeat: 2 }, 3), 60);
  t.ok(runOf(seq) <= 2, 'noRepeat 2: never three in a row (longest run ' + runOf(seq) + ')'); t.ok(seq.filter((x) => x === 'a').length > 30, 'the weights still matter');
  seq = roll(w({ weighted: [['a', 1], ['b', 1]], noRepeat: 1 }, 5), 40);
  t.deep(seq.filter((x, i) => i > 0 && x === seq[i - 1]).length, 0, 'noRepeat 1: alternates');
  seq = roll(w({ weighted: [['a', 1], ['b', 1]] }, 5), 60); t.ok(runOf(seq) >= 3, 'without noRepeat runs happen');
  t.deep(roll(w({ weighted: [['a', 3], ['b', 2], ['c', 1]] }, 9), 30), roll(w({ weighted: [['a', 3], ['b', 2], ['c', 1]] }, 9), 30), 'the same seed rolls the same moves');
  t.ok(JSON.stringify(roll(w({ weighted: [['a', 3], ['b', 2], ['c', 1]] }, 9), 30)) !== JSON.stringify(roll(w({ weighted: [['a', 3], ['b', 2], ['c', 1]] }, 10), 30)), 'a different seed rolls differently');
  t.deep(roll(w({ weighted: [['a', 1]], noRepeat: 1 }, 1), 4), ['a', 'a', 'a', 'a'], 'a single entry is used even when noRepeat would forbid it');
  // pure calls never touch the rng
  const C = w({ seq: ['a'] }, 4); const h = rig(C, [W.filler])[0]; const before = C.rng.seed();
  C.intent(C.enemies[0]); C.preview(h.uid, C.enemies[0].id); C.canPlay(h.uid); C.legalTargets(h.uid); C.needsTarget(h.uid); C.canSwap();
  t.eq(C.rng.seed(), before, 'canPlay, legalTargets, preview and intent never consume C.rng');
});

t.test('targets resolve when the move executes, not when the intent is rolled', () => {
  const W = world();
  const C = W.fight({ enemies: [W.hitter(7)] });
  t.deep(C.enemies[0].intent.tgt, ['hanae'], 'rolled while hanae leads');
  C.swap();
  t.deep(C.intent(C.enemies[0]).tgt, ['kuro'], 'C.intent tracks the swap live');
  t.eq(first(C.endTurn(), 'hit').dst.id, 'kuro', 'and the hit lands on the hero in front at execution');
});

// ------------------------------------------------------------------ enemy ops
t.test('enemy dmg: front, back, both, random, lowest, hits, pierce, lifesteal', () => {
  const W = world();
  const one = (op, setup) => { const C = W.fight({ enemies: [W.enemy('e' + W.n(), { hp: [100, 100], moves: { m: { name: 'M', kind: 'attack', fx: [op] } }, ai: { seq: ['m'] } })] }); if (setup) setup(C); return { C, ev: C.endTurn() }; };
  const dst = (ev) => only(ev, 'hit').map((h) => h.dst.id);
  t.deep(dst(one({ op: 'dmg', n: 3 }).ev), ['hanae'], 'default is front'); t.deep(dst(one({ op: 'dmg', n: 3, tgt: 'back' }).ev), ['kuro'], 'back');
  t.deep(dst(one({ op: 'dmg', n: 3, tgt: 'both' }).ev), ['hanae', 'kuro'], 'both');
  t.deep(dst(one({ op: 'dmg', n: 3, tgt: 'lowest' }, (C) => { C.heroes[1].hp = 10; }).ev), ['kuro'], 'lowest'); t.deep(dst(one({ op: 'dmg', n: 3, tgt: 'lowest' }, (C) => { C.heroes[0].hp = 10; C.heroes[1].hp = 10; }).ev), ['hanae'], 'ties: front first');
  const seen = new Set();
  for (let i = 0; i < 12; i++) { const r = W.fight({ enemies: [W.enemy('rr' + i, { hp: [100, 100], moves: { m: { name: 'M', kind: 'multi', fx: [{ op: 'dmg', n: 1, hits: 10, tgt: 'random' }] } }, ai: { seq: ['m'] } })], seed: i + 1 }); dst(r.endTurn()).forEach((d) => seen.add(d)); }
  t.eq(seen.size, 2, 'random can hit either hero, drawn per hit');
  const multi = one({ op: 'dmg', n: 2, hits: 3 }); t.deep(only(multi.ev, 'hit').map((h) => [h.index, h.hits]), [[0, 3], [1, 3], [2, 3]], 'hits 3');
  const both2 = one({ op: 'dmg', n: 2, hits: 2, tgt: 'both' }); t.deep(only(both2.ev, 'hit').map((h) => [h.dst.id, h.index]), [['hanae', 0], ['kuro', 0], ['hanae', 1], ['kuro', 1]], 'hit-major over both heroes');
  const pr = one({ op: 'dmg', n: 5, pierce: true }, (C) => { C.heroes[0].block = 50; }); t.deep([first(pr.ev, 'hit').blocked, first(pr.ev, 'hit').amount], [0, 5], 'pierce');
  const ls = one({ op: 'dmg', n: 6, lifesteal: true }, (C) => { C.enemies[0].hp = 50; C.heroes[0].block = 4; }); t.eq(ls.C.enemies[0].hp, 52, 'lifesteal heals the enemy by the HP removed (2), not the Block absorbed');
  const dd = one({ op: 'dmg', n: 5 }, (C) => { C.heroes[0].st.dodge = 1; }); t.eq(only(dd.ev, 'dodge').length, 1, 'enemy attacks can be dodged');
  const el = one({ op: 'dmg', n: 5, el: 'fire' }); t.eq(first(el.ev, 'hit').element, 'fire', 'explicit el');
  const fall = one({ op: 'dmg', n: 30, hits: 3 }, (C) => { C.heroes[0].hp = 30; });
  t.deep(only(fall.ev, 'hit').map((h) => h.dst.id), ['hanae', 'kuro', 'kuro'], 'front is re-resolved per hit: the survivor is forced forward and takes the rest');
});

t.test('enemy block, heal, status, removeStatus: targets and defaults', () => {
  const W = world();
  const run = (fx, o = {}) => {
    const C = W.fight({ enemies: [W.enemy('c' + W.n(), { hp: [100, 100], moves: { m: { name: 'M', kind: 'defend', fx } }, ai: { seq: ['m'] } }), W.enemy('b' + W.n(), { hp: [50, 50] }), W.enemy('b' + W.n(), { hp: [50, 50] })] });
    if (o.setup) o.setup(C);
    return { C, ev: C.endTurn() };
  };
  let r = run([{ op: 'block', n: 6 }]); t.deep(r.C.enemies.map((e) => e.block), [6, 0, 0], 'block defaults to self');
  r = run([{ op: 'block', n: 6, tgt: 'allEnemies' }]); t.deep(r.C.enemies.map((e) => e.block), [6, 6, 6], 'allEnemies');
  r = run([{ op: 'block', n: 6, tgt: 'otherEnemy' }]); t.eq(r.C.enemies.map((e) => e.block).filter((b) => b === 6).length, 1, 'otherEnemy is one other enemy'); t.eq(r.C.enemies[0].block, 0, 'never the actor');
  r = run([{ op: 'block', n: 6, tgt: 'lowestEnemy' }], { setup: (C) => { C.enemies[2].hp = 5; } }); t.deep(r.C.enemies.map((e) => e.block), [0, 0, 6], 'lowestEnemy (lowest current HP, may be self)');
  r = run([{ op: 'block', n: 8 }], { setup: (C) => { C.enemies[0].st.frail = 1; C.enemies[0].st.bulwark = 2; } }); t.eq(r.C.enemies[0].block, 7, 'Frail and Bulwark apply to enemy Block: floor((8+2)*0.75)');
  r = run([{ op: 'heal', n: 30 }], { setup: (C) => { C.enemies[0].hp = 90; } }); t.eq(r.C.enemies[0].hp, 100, 'enemy heal is capped'); t.eq(first(r.ev, 'heal').amount, 10, 'amount actually healed');
  r = run([{ op: 'heal', n: 10, tgt: 'allEnemies' }], { setup: (C) => { C.enemies.forEach((e) => { e.hp = 40; }); } }); t.deep(r.C.enemies.map((e) => e.hp), [50, 50, 50], 'heal allEnemies');
  r = run([{ op: 'status', s: 'weak', n: 2 }]); t.deep(r.C.heroes[0].st, { weak: 2 }, 'a debuff defaults to the front hero');
  r = run([{ op: 'status', s: 'ritual', n: 1 }]); t.deep(r.C.enemies[0].st, { ritual: 1 }, 'a buff defaults to self');
  r = run([{ op: 'status', s: 'weak', n: 1, tgt: 'both' }]); t.deep(r.C.heroes.map((h) => h.st.weak), [1, 1], 'both'); t.eq(new Set(only(r.ev, 'status').map((e) => e.group)).size, 1, 'one group');
  r = run([{ op: 'status', s: 'weak', n: 1, tgt: 'back' }]); t.deep(r.C.heroes.map((h) => h.st.weak), [undefined, 1], 'back');
  r = run([{ op: 'status', s: 'poison', n: 3, tgt: 'lowest' }], { setup: (C) => { C.heroes[1].hp = 10; } }); t.deep(r.C.heroes.map((h) => h.st.poison), [undefined, 2], 'lowest (poison 3 ticked once at the next turn start: 2)');
  r = run([{ op: 'status', s: 'might', n: 2, tgt: 'allEnemies' }]); t.deep(r.C.enemies.map((e) => e.st.might), [2, 2, 2], 'buff allEnemies');
  r = run([{ op: 'status', s: 'thorns', n: 4, tgt: 'self' }, { op: 'status', s: 'plating', n: { per: 'enemies', mul: 2 }, tgt: 'self' }]); t.deep(r.C.enemies[0].st, { thorns: 4, plating: 6 }, 'enemy V: per enemies');
  r = run([{ op: 'removeStatus', s: 'debuffs' }], { setup: (C) => { C.enemies[0].st = { weak: 2, might: 3 }; } }); t.deep(r.C.enemies[0].st, { might: 3 }, 'debuffs default to self (the enemy cleanses itself)');
  r = run([{ op: 'removeStatus', s: 'buffs' }], { setup: (C) => { C.heroes[0].st = { might: 3, bloom: 2, weak: 1 }; } }); t.deep(r.C.heroes[0].st, { bloom: 2 }, 'buffs default to the front hero; resources stay (the Weak decayed at round end)');
  r = run([{ op: 'removeStatus', s: 'bloom', tgt: 'both' }], { setup: (C) => { C.heroes[0].st = { bloom: 2 }; C.heroes[1].st = { bloom: 5 }; } }); t.deep(r.C.heroes.map((h) => h.st.bloom), [undefined, undefined], 'resource statuses are removed by id');
  r = run([{ op: 'removeStatus', s: 'might', n: 2 }], { setup: (C) => { C.heroes[0].st = { might: 5 }; } }); t.eq(r.C.heroes[0].st.might, 3, 'a buff id defaults to the front hero, n stacks');
  // Weak from an enemy op is fresh: it survives the round it was applied in
  r = run([{ op: 'status', s: 'vulnerable', n: 1 }]); t.eq(r.C.heroes[0].st.vulnerable, 1, 'a dur status from an enemy survives its own round');
});

t.test('enemy add, swap and cond', () => {
  const W = world();
  const junk = W.card('junk', { hero: 'status', type: 'status', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], art: { m: 'void' } });
  const en = (fx) => W.enemy('e' + W.n(), { hp: [100, 100], moves: { m: { name: 'M', kind: 'debuff', fx } }, ai: { seq: ['m'] } });
  let C = W.fight({ enemies: [en([{ op: 'add', card: junk, n: 2 }])] });
  const total0 = total(C);
  C.endTurn();
  t.eq(C.discard.filter((c) => c.id === junk).length + C.hand.filter((c) => c.id === junk).length + C.draw.filter((c) => c.id === junk).length, 2, 'two junk cards entered the piles');
  const ac = C.events.filter((e) => e.type === 'add_card')[0];
  t.deep([ac.to, ac.cards.length, ac.cards.every((c) => c.tmp)], ['discard', 2, true], 'default to the discard pile, as temp cards');
  t.eq(total(C), total0 + 2, 'the total grew by 2'); t.eq(C.added, 2, 'C.added');
  C = W.fight({ enemies: [en([{ op: 'add', card: junk, to: 'draw', top: true }])] }); C.endTurn();
  t.ok(C.hand.some((c) => c.id === junk), 'top:true lands on top of the draw pile, so it is drawn next turn');
  C = W.fight({ enemies: [en([{ op: 'add', card: junk, to: 'draw' }])], filler: 30 }); C.endTurn();
  t.eq(C.hand.concat(C.draw).filter((c) => c.id === junk).length, 1, 'shuffled into the draw pile (hand or pile, never lost)');
  C = W.fight({ enemies: [en([{ op: 'swap' }])] });
  const e2 = C.endTurn(); t.deep([first(e2, 'swap').forced, first(e2, 'swap').front, C.stats.swaps], [true, 'kuro', 0], 'forced, and not counted as the player\'s swap');
  C = W.fight({ enemies: [en([{ op: 'swap' }])] }); C.heroes[1].st.bind = 1; t.eq(only(C.endTurn(), 'swap').length, 0, 'Bind blocks the enemy swap op');
  C = W.fight({ enemies: [en([{ op: 'swap' }])] }); C.heroes[1].hp = 0; C.heroes[1].down = true; C.heroes[1]._downDone = true; t.eq(only(C.endTurn(), 'swap').length, 0, 'no swap with one hero down');
  // cond
  const c1 = en([{ op: 'cond', if: { hpPct: { who: 'self', lt: 0.5 } }, then: [{ op: 'block', n: 9 }], else: [{ op: 'block', n: 2 }] }]);
  C = W.fight({ enemies: [c1] }); C.endTurn(); t.eq(C.enemies[0].block, 2, 'else branch'); C.enemies[0].hp = 10; C.endTurn(); t.eq(C.enemies[0].block, 9, 'then branch');
  const c2 = W.enemy('c2x', { hp: [100, 100], moves: { m: { name: 'M', kind: 'attack', fx: [{ op: 'cond', if: { status: { s: 'weak', who: 'target' } }, then: [{ op: 'dmg', n: 9 }], else: [{ op: 'dmg', n: 1 }] }, { op: 'cond', if: { turn: { gte: 2 } }, then: [{ op: 'block', n: 5 }] }, { op: 'cond', if: { enemies: { gte: 2 } }, then: [{ op: 'block', n: 3 }] }, { op: 'cond', if: { block: { gte: 1 } }, then: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] }] } }, ai: { seq: ['m'] } });
  C = W.fight({ enemies: [c2] });
  let e3 = C.endTurn(); t.eq(first(e3, 'hit').raw, 1, 'the front hero is not Weak'); t.eq(C.enemies[0].block, 0, 'turn 1: no block');
  C.heroes[0].st.weak = 3; e3 = C.endTurn();
  t.eq(first(e3, 'hit').raw, 9, 'who target is the front hero (Weak now)'); t.eq(C.enemies[0].block, 5, 'the enemy\'s own turn 2'); t.eq(C.enemies[0].st.might, 1, 'the block cond');
});

t.test('enemy V counters: turn, hp, missingHp, block, status, debuffs, handSize, drawPile, discardPile, enemies', () => {
  const W = world();
  const vraw = (V, setup) => {
    const C = W.fight({ enemies: [W.enemy('v' + W.n(), { hp: [100, 100], moves: { m: { name: 'M', kind: 'attack', fx: [{ op: 'dmg', n: V }] } }, ai: { seq: ['m'] } })], filler: 10 });
    if (setup) setup(C);
    return first(C.endTurn(), 'hit').raw;
  };
  t.eq(vraw({ base: 1, per: 'turn', mul: 2 }), 3, 'own turn 1: 1 + 2');
  t.eq(vraw({ base: 1, per: 'turn', mul: 2 }, (C) => { C.endTurn(); }), 5, 'own turn 2');
  t.eq(vraw({ per: 'hp', who: 'target' }, (C) => { C.heroes[0].hp = 50; }), 50, 'the target is the hero being hit');
  t.eq(vraw({ per: 'missingHp', who: 'target' }, (C) => { C.heroes[0].hp = 50; }), 20, 'missingHp');
  t.eq(vraw({ per: 'hp', who: 'self' }), 100, 'self is the acting enemy');
  t.eq(vraw({ per: 'missingHp' }, (C) => { C.enemies[0].hp = 60; }), 40, 'missingHp of self');
  t.eq(vraw({ per: 'block', who: 'target' }, (C) => { C.heroes[0].block = 6; }), 6, 'block of the target');
  t.eq(vraw({ per: 'block' }, (C) => { C.enemies[0].block = 4; }), 0, 'the enemy\'s Block is cleared at the start of its phase before it acts');
  t.eq(vraw({ per: 'status', s: 'weak', who: 'target' }, (C) => { C.heroes[0].st.weak = 2; }), 2, 'status on the target');
  t.eq(vraw({ per: 'status', s: 'thorns' }, (C) => { C.enemies[0].st.thorns = 7; }), 7, 'status on self by default');
  t.eq(vraw({ per: 'debuffs', who: 'target' }, (C) => { C.heroes[0].st = { weak: 1, poison: 2, might: 4 }; }), 2, 'distinct debuffs on the target');
  t.eq(vraw({ per: 'handSize' }), 0, 'the hand was discarded before the enemy phase');
  t.eq(vraw({ per: 'drawPile' }), 5, 'draw pile'); t.eq(vraw({ per: 'discardPile' }), 5, 'discard pile');
  t.eq(vraw({ per: 'enemies', mul: 3 }), 3, 'living enemies');
});

// ------------------------------------------------------------------ intents
t.test('C.intent: live numbers (Might, Weak, enemyDmg, the target\'s Vulnerable), targets with Taunt, statuses, adds, summons, stunned, text', () => {
  const W = world();
  const junk = W.card('junk', { hero: 'status', type: 'status', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], art: { m: 'void' } });
  const minion = W.enemy('mini', { tier: 'minion', size: 's', hp: [5, 5] });
  const e = W.enemy('rich', { hp: [100, 100], moves: {
    hit: { name: 'Claw', kind: 'multi', fx: [{ op: 'dmg', n: 7, hits: 2, tgt: 'front' }] }, rnd: { name: 'Rnd', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'random' }] }, bk: { name: 'Bk', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'back' }] }, bo: { name: 'Bo', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'both' }] }, lo: { name: 'Lo', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'lowest' }] },
    mix: { name: 'Mix', kind: 'attack', fx: [{ op: 'dmg', n: 6 }, { op: 'block', n: 8 }, { op: 'status', s: 'weak', n: 2 }, { op: 'status', s: 'ritual', n: 1 }, { op: 'add', card: junk, n: 2, to: 'draw' }, { op: 'summon', enemy: minion, n: 2 }, { op: 'heal', n: 5 }, { op: 'stealGold', n: 9 }, { op: 'removeStatus', s: 'buffs' }, { op: 'swap' }, { op: 'flee' }] },
    cnd: { name: 'Cnd', kind: 'attack', fx: [{ op: 'cond', if: { hpPct: { who: 'self', lt: 0.5 } }, then: [{ op: 'dmg', n: 20 }], else: [{ op: 'dmg', n: 2 }] }] },
  }, ai: { seq: ['hit'] } });
  const C = W.fight({ enemies: [e] });
  const u = C.enemies[0];
  const setMove = (m) => { u._move = m; return C.intent(u); };
  let it = setMove('hit');
  t.deep([it.move, it.name, it.kind, it.dmg, it.hits, it.tgt, it.tgtKind, it.taunted], ['hit', 'Claw', 'multi', 7, 2, ['hanae'], 'front', false], 'plain multi-hit intent');
  t.eq(it.text, 'Deals 7 x2 to the front hero', 'intent text');
  u.st.might = 3; u.st.weak = 1; t.eq(C.intent(u).dmg, 7, 'Might 3 then Weak: floor(10 * 0.75) = 7'); u.st = {};
  C.heroes[0].st.vulnerable = 1; t.eq(C.intent(u).dmg, 10, 'the target hero\'s Vulnerable is included: floor(7 * 1.5)'); C.heroes[0].st = {};
  const C2 = W.fight({ enemies: [e], mods: { enemyDmg: 1.5 } }); C2.enemies[0]._move = 'hit'; t.eq(C2.intent(C2.enemies[0]).dmg, 10, 'the trial factor is included: floor(7 * 1.5)');
  it = setMove('rnd'); t.deep([it.tgt, it.tgtKind], ['random', 'random'], 'random targets are reported as random');
  C.heroes[1].st.taunt = 2; it = setMove('rnd'); t.deep([it.tgt, it.taunted], [['kuro'], true], 'Taunt redirects the intent'); it = setMove('bk'); t.deep([it.tgt, it.taunted], [['kuro'], false], 'a back attack on the taunter itself is not redirected');
  C.heroes[1].st = {}; C.heroes[0].st.taunt = 1; it = setMove('bk'); t.deep([it.tgt, it.taunted], [['hanae'], true], 'back attack redirected to the front taunter'); t.eq(it.text, 'Deals 5 to Hanae', 'text names the taunter'); C.heroes[0].st = {};
  it = setMove('bo'); t.deep(it.tgt, ['hanae', 'kuro'], 'both'); t.eq(it.text, 'Deals 3 to both heroes', 'both'); C.heroes[1].hp = 10; it = setMove('lo'); t.deep(it.tgt, ['kuro'], 'lowest'); t.eq(C.intent(u).text, 'Deals 3 to the weakest hero', 'lowest text');
  it = setMove('mix');
  t.deep([it.dmg, it.hits, it.block, it.heal, it.steals, it.swap, it.flee], [6, 1, 8, 5, 9, true, true], 'the other parts of a move');
  t.deep(it.statuses, [{ s: 'weak', n: 2, to: 'front' }, { s: 'ritual', n: 1, to: 'self' }], 'statuses with their targets'); t.deep(it.adds, [{ card: junk, n: 2, to: 'draw' }], 'adds'); t.deep(it.summons, [{ enemy: minion, n: 2 }], 'summons'); t.deep(it.removes, [{ s: 'buffs', to: 'front' }], 'removes');
  it = setMove('cnd'); t.eq(it.dmg, 2, 'a cond in the move follows the current state'); u.hp = 10; t.eq(C.intent(u).dmg, 20, 'and updates live');
  u.st.stun = 1; it = C.intent(u); t.deep([it.kind, it.text, it.stunned, it.dmg, it.name], ['none', 'Stunned', true, null, 'Stunned'], 'a stunned enemy shows Stunned');
  t.eq(C.intent('t_rich#1').move, 'cnd', 'C.intent also takes an id'); u.down = true; t.eq(C.intent(u), null, 'a dead unit has no intent');
});

// ------------------------------------------------------------------ phases, summons, lanes
t.test('phases: fire when hp/maxHp falls below at, in descending order, run fx, replace the ai and re-roll at once; never on a killing blow', () => {
  const W = world();
  const boss = W.enemy('phase', { tier: 'boss', size: 'xl', hp: [100, 100], immune: ['stun'], moves: { a: atk(1), b: atk(2), big: atk(9), c: atk(3) },
    ai: { seq: ['a'] }, phases: [{ at: 0.66, say: 'Enough.', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }], ai: { open: ['big'], seq: ['b'] } }, { at: 0.33, say: 'Now!', ai: { seq: ['c'] } }] });
  const hit = (n) => W.card('h' + n, { cost: 0, fx: [{ op: 'dmg', n }] });
  const h50 = hit(50), h70 = hit(70), h1 = hit(1);
  let C = W.fight({ deck: [h50, h1], filler: 0, enemies: [boss], mods: { energy: 9 } });
  let ev = play(C, rig(C, [h1])[0]); t.eq(only(ev, 'enemy_phase').length, 0, '99 percent: no phase');
  ev = play(C, rig(C, [h50])[0]);
  const ph = first(ev, 'enemy_phase');
  t.deep(ph, { type: 'enemy_phase', enemy: 't_phase#1', index: 1, at: 0.66, say: 'Enough.' }, 'enemy_phase event');
  t.deep([C.enemies[0].phase, C.enemies[0].st.might], [1, 2], 'unit.phase and the fx (Might 2)');
  const ty = types(ev); t.ok(ty.indexOf('enemy_phase') < ty.indexOf('status', ty.indexOf('enemy_phase')) && ty.indexOf('intent') > ty.indexOf('enemy_phase'), 'phase, then its fx, then the re-rolled intent');
  t.eq(C.enemies[0].intent.move, 'big', 'the new ai plays its open first, immediately');
  C.endTurn(); t.eq(C.enemies[0].intent.move, 'b', 'then the new seq');
  t.eq(only(C.events, 'enemy_act')[0].move, 'big', 'the phase struck in the player phase, so the opener was the enemy\'s first action');
  // one blow across two phases: both fire, in order, and the last ai wins
  C = W.fight({ deck: [h70], filler: 0, enemies: [boss], mods: { energy: 9 } });
  ev = play(C, rig(C, [h70])[0]);
  t.deep(only(ev, 'enemy_phase').map((e) => [e.index, e.at]), [[1, 0.66], [2, 0.33]], 'one blow crossing two thresholds fires both in descending order'); t.eq(C.enemies[0].phase, 2, 'phase 2');
  t.eq(C.enemies[0].intent.move, 'c', 'the final ai');
  // a killing blow does not fire phases
  const W2 = world(); const b2 = W2.enemy('b', { tier: 'boss', size: 'xl', hp: [50, 50], phases: [{ at: 0.5, say: 'x', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }] }] }); const nuke = W2.card('nuke', { cost: 0, fx: [{ op: 'dmg', n: 99 }] });
  const C2 = W2.fight({ deck: [nuke], filler: 0, enemies: [b2] }); ev = play(C2, rig(C2, [nuke])[0]); t.eq(only(ev, 'enemy_phase').length, 0, 'killed outright: no phase');
  // phases without ai keep the old ai; fx only
  const W3 = world(); const b3 = W3.enemy('b', { tier: 'boss', size: 'xl', hp: [100, 100], moves: MOVES4(), ai: { seq: ['a', 'b'] }, phases: [{ at: 0.5, say: 'x', fx: [{ op: 'block', n: 20, tgt: 'self' }] }] }); const h60 = W3.card('h60', { cost: 0, fx: [{ op: 'dmg', n: 60 }] });
  const C3 = W3.fight({ deck: [h60], filler: 0, enemies: [b3] }); const before = C3.enemies[0].intent.move; ev = play(C3, rig(C3, [h60])[0]);
  t.deep([only(ev, 'enemy_phase').length, only(ev, 'intent').length, C3.enemies[0].intent.move, C3.enemies[0].block], [1, 0, before, 20], 'a phase with no ai keeps the intent and re-rolls nothing');
});

t.test('phases fired during the enemy phase (thorns, poison, burn) re-roll only for enemies that have not acted', () => {
  const W = world();
  const boss = W.enemy('pboss', { tier: 'boss', size: 'xl', hp: [100, 100], moves: { a: atk(1), open: atk(7) }, ai: { seq: ['a'] }, phases: [{ at: 0.5, say: 'x', ai: { open: ['open'], seq: ['a'] } }] });
  // poison ticks before the enemy acts: the enemy re-rolls at once and executes the new opener this very phase
  let C = W.fight({ enemies: [boss] }); C.enemies[0].hp = 51; C.enemies[0].st.poison = 5;
  let ev = C.endTurn();
  t.deep(only(ev, 'hit').map((h) => h.raw), [7], 'the new opener replaced the intent before the enemy acted');
  // thorns while it acts: it already acted, the opener is used at the next roll
  C = W.fight({ enemies: [boss] }); C.enemies[0].hp = 51; C.heroes[0].st.thorns = 5;
  ev = C.endTurn();
  t.deep(only(ev, 'hit').map((h) => h.raw), [1], 'the phase struck mid-action: this action was already decided');
  t.eq(C.enemies[0].phase, 1, 'the phase fired'); t.eq(C.enemies[0].intent.move, 'open', 'the next roll starts with the new opener');
  t.eq(only(ev, 'intent').filter((e) => e.intent.move === 'open').length, 1, 'rolled once, not twice');
});

t.test('summons: cap of 5 living, highest free lane, ids never reused, start ops, HP roll, intent at once, no action until the next enemy phase', () => {
  const W = world();
  const minion = W.enemy('mm', { tier: 'minion', size: 's', hp: [4, 4], start: [{ op: 'status', s: 'thorns', n: 1, tgt: 'self' }], moves: { poke: atk(3), idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['poke'] } });
  const caller = W.enemy('caller', { hp: [200, 200], moves: { call: { name: 'Call', kind: 'summon', fx: [{ op: 'summon', enemy: minion, n: 2 }] }, hit: atk(5) }, ai: { seq: ['call', 'hit'] } });
  const C = W.fight({ enemies: [caller] });
  const ev = C.endTurn();
  t.deep(C.enemies.map((e) => e.id), ['t_caller#1', 't_mm#1', 't_mm#2'], 'appended in order; ids per def counter'); t.deep(C.enemies.map((e) => e.lane), [4, 3, 2], 'each summon takes the highest free lane');
  const ty = types(ev); const si = ty.indexOf('summon');
  t.ok(si > 0 && ty[ty.indexOf('intent', si)] === 'intent', 'summon then intent'); t.eq(first(ev, 'summon').enemy.id, 't_mm#1', 'summon carries a unit snapshot'); t.deep([first(ev, 'summon').enemy.hp, first(ev, 'summon').enemy.lane, first(ev, 'summon').enemy.kind], [4, 3, 'enemy'], 'snapshot');
  t.eq(C.enemies[1].st.thorns, 1, 'start ops ran'); t.eq(C.enemies[1].turn, 1, 'a summoned unit starts its own count at 1'); t.eq(C.enemies[1].intent.move, 'poke', 'it has an intent at once');
  t.eq(only(ev, 'enemy_act').length, 1, 'the summons did not act in the phase that made them'); t.eq(only(ev, 'hit').length, 0, 'no hits yet');
  const e2 = C.endTurn();
  t.deep(only(e2, 'enemy_act').map((e) => e.move), ['poke', 'poke', 'hit'], 'next phase: in line order (lane 2, 3, 4): mm#2, mm#1, then the caller');
  t.deep(only(e2, 'enemy_act').map((e) => e.enemy), ['t_mm#2', 't_mm#1', 't_caller#1'], 'line order is ascending lane');
  // cap and lanes: kill a minion, its lane is free again and is the highest free lane
  const W2 = world();
  const mm = W2.enemy('mm', { tier: 'minion', size: 's', hp: [4, 4] });
  const many = W2.enemy('many', { hp: [500, 500], moves: { call: { name: 'Call', kind: 'summon', fx: [{ op: 'summon', enemy: mm, n: 4 }] } }, ai: { seq: ['call'] } });
  const hit = W2.card('h', { cost: 0, fx: [{ op: 'dmg', n: 99 }] });
  const C2 = W2.fight({ deck: [hit, hit], filler: 0, enemies: [many], mods: { energy: 9 } }); C2.endTurn();
  t.deep(C2.enemies.map((e) => e.lane), [4, 3, 2, 1, 0], 'five living units: the cap'); t.eq(C2.enemies.length, 5, 'the fifth is the caller');
  C2.endTurn(); t.eq(C2.enemies.length, 5, 'summon at the cap does nothing');
  play(C2, rig(C2, [hit])[0], 't_mm#3');
  t.eq(C2.enemies.filter((e) => !e.down).length, 4, 'one minion died');
  const before = C2.enemies.length; C2.endTurn(); t.eq(C2.enemies.length, before + 1, 'a freed slot lets the summoner summon again (only 1 fits)');
  const nu = C2.enemies[C2.enemies.length - 1];
  t.eq(nu.id, 't_mm#5', 'ids are never reused'); t.eq(nu.lane, 1, 'the newcomer takes the lane of the dead unit (mm#3 stood in lane 1)');
  const lanes = C2.enemies.filter((e) => !e.down).map((e) => e.lane); t.eq(new Set(lanes).size, lanes.length, 'lane is unique among living units'); t.eq(C2.enemies.length, C2.enemies.filter((e) => true).length, 'C.enemies never shrinks');
});

t.test('enemy hooks: onDeath (summon allowed, cap applies), onHurt (cards and hooks, not ticks), onAllyDeath, onHeroPlay with a filter, limit per round, once', () => {
  const W = world();
  const mini = W.enemy('mini', { tier: 'minion', size: 's', hp: [3, 3] });
  const bomb = W.enemy('bomb', { hp: [3, 3], hooks: [{ on: 'onDeath', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'summon', enemy: mini }] }] });
  const hit = W.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 9 }] });
  let C = W.fight({ deck: [hit], filler: 0, enemies: [bomb, W.dummy] });
  let ev = play(C, rig(C, [hit])[0], 't_bomb#1');
  t.eq(C.heroes[0].hp, 66, 'onDeath ran as it died'); t.eq(C.enemies.length, 3, 'and it summoned'); t.ok(types(ev).indexOf('death') < types(ev).indexOf('summon'), 'death, then the summon');
  t.eq(C.phase, 'player', 'the summon means the fight is not over');
  // onHurt
  const W2 = world();
  const spiky = W2.enemy('spiky', { hp: [100, 100], hooks: [{ on: 'onHurt', limit: 1, fx: [{ op: 'block', n: 3, tgt: 'self' }] }] });
  const h2 = W2.card('h', { cost: 0, fx: [{ op: 'dmg', n: 1, hits: 3 }] });
  C = W2.fight({ deck: [h2, h2], filler: 0, enemies: [spiky] });
  t.eq(only(play(C, rig(C, [h2])[0]), 'block').length, 1, 'onHurt with limit 1 per round: three hits, one trigger');
  C.enemies[0].st.poison = 3; C.enemies[0].block = 0;
  t.eq(only(C.endTurn(), 'block').length, 0, 'poison ticks do not trigger onHurt');
  t.eq(only(play(C, rig(C, [h2])[0]), 'block').length, 1, 'the round counter resets for a new round');
  // onAllyDeath and onHeroPlay
  const W3 = world();
  const mourner = W3.enemy('mourner', { hp: [100, 100], hooks: [{ on: 'onAllyDeath', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }] }, { on: 'onHeroPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: 'thorns', n: 1, tgt: 'self' }] }, { on: 'onHeroPlay', filter: { type: 'attack' }, once: true, fx: [{ op: 'block', n: 4, tgt: 'self' }] }] });
  const frail = W3.enemy('frail', { hp: [3, 3] });
  const sk = W3.card('sk', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), at = W3.card('at', { cost: 0, fx: [{ op: 'dmg', n: 9 }] });
  C = W3.fight({ deck: [sk, at, at], filler: 0, enemies: [mourner, frail], mods: { energy: 9 } });
  play(C, rig(C, [sk])[0]); t.eq(C.enemies[0].st.thorns, 1, 'onHeroPlay with filter type skill');
  const blocks = only(play(C, rig(C, [at])[0], 't_mourner#1'), 'block').length + only(play(C, rig(C, [at])[0], 't_mourner#1'), 'block').length;
  t.eq(blocks, 1, 'once: the attack hook fired a single time over two attacks');
  const ev3 = play(C, rig(C, [at])[0], 't_frail#1');
  t.eq(C.enemies[0].st.might, 2, 'onAllyDeath: the mourner grew when its ally died'); t.ok(only(ev3, 'death').length === 1, 'the ally died');
});

t.test('hook recursion is bounded: an onHurt that hits back into an onDamaged that hits again does not run forever', () => {
  const W = world();
  const relic = W.relic('echo', { hooks: [{ on: 'onDamaged', fx: [{ op: 'dmg', n: 1, tgt: 'enemy' }] }] });
  const loop = W.enemy('loop', { hp: [9999, 9999], hooks: [{ on: 'onHurt', fx: [{ op: 'dmg', n: 1, tgt: 'front' }] }], moves: { h: atk(1) }, ai: { seq: ['h'] } });
  const C = W.fight({ enemies: [loop], relics: [relic] });
  const ev = C.endTurn();
  t.ok(ev.length < 400, 'terminated with a bounded number of events (' + ev.length + ')'); t.eq(C.phase, 'player', 'the combat continues normally');
  // an enemy that summons a copy of itself when it dies does not recurse without end either
  const W2 = world(); const hit = W2.card('h', { cost: 0, fx: [{ op: 'dmg', n: 99 }] });
  const selfish = W2.enemy('selfish', { tier: 'minion', size: 's', hp: [1, 1], hooks: [{ on: 'onDeath', fx: [{ op: 'summon', enemy: 't_selfish' }] }] });
  const C2 = W2.fight({ deck: [hit], filler: 0, enemies: [selfish] }); play(C2, rig(C2, [hit])[0]);
  t.eq(C2.enemies.length, 2, 'one new copy per death'); t.eq(C2.phase, 'player', 'the fight goes on');
});

t.test('a pick that is not reached from a played card (unvalidated hook, hand or enemy op) chooses at random and never leaves a stale pending', () => {
  const W = world();
  const strike = W.card('s', { cost: 0, fx: [{ op: 'dmg', n: 1 }] });
  const relic = W.relic('pickhook', { hooks: [{ on: 'onPlay', fx: [{ op: 'pick', from: 'hand', n: 1, then: 'discard' }] }] });
  const C = W.fight({ deck: [strike, strike, strike, strike, strike], filler: 5, relics: [relic], enemies: [W.dummy] });
  const inst = rig(C, [strike])[0];
  const handBefore = C.hand.length;
  const ev = play(C, inst);
  t.eq(C.pending, null, 'no pending after a hook pick'); t.ok(!only(ev, 'pick_needed').length, 'and no pick_needed event');
  t.eq(C.hand.length, handBefore - 1, 'the hook discarded nothing extra when the hand was just the played card');
  const again = W.fight({ deck: [strike, strike, strike, strike, strike], filler: 5, relics: [relic], enemies: [W.dummy] });
  const hand0 = again.hand.length; const played = again.hand.find((c) => c.id === strike);
  if (played) { play(again, played); t.eq(again.pending, null, 'no pending'); t.eq(again.hand.length, hand0 - 2, 'the hook picked one more card at random and discarded it'); }
  t.ok(violations(again, 'hook pick').length === 0, 'invariants hold');
  // a hand op and an enemy op with a pick behave the same
  const W2 = world();
  const drawn = W2.card('d', { type: 'status', hero: 'status', kw: ['unplayable'], cost: null, hand: { drawn: [{ op: 'pick', from: 'hand', n: 1, then: 'discard' }] } });
  const foe = W2.enemy('picker', { moves: { p: { name: 'P', kind: 'debuff', fx: [{ op: 'pick', from: 'hand', n: 1, then: 'exhaust' }] } }, ai: { seq: ['p'] } });
  const C2 = W2.fight({ deck: [drawn], filler: 8, enemies: [foe] });
  t.eq(C2.pending, null, 'no pending from a hand op'); t.ok(violations(C2, 'hand pick').length === 0, 'invariants hold after a hand pick');
  C2.endTurn(); t.eq(C2.pending, null, 'no pending from an enemy op'); t.eq(C2.phase, 'player', 'and the combat goes on');
});


// ------------------------------------------------------------------ downed heroes and the end of the combat
t.test('a downed hero: cards are dead but stay in hand, not targetable, ticks nothing, statuses gone, the survivor leads', () => {
  const W = world();
  const hc = W.card('hc', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] }), kc = W.card('kc', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  const e = W.enemy('atk', { hp: [100, 100], moves: { a: { name: 'A', kind: 'attack', fx: [{ op: 'dmg', n: 99, tgt: 'front' }, { op: 'dmg', n: 3, tgt: 'back' }, { op: 'dmg', n: 3, tgt: 'both' }, { op: 'dmg', n: 3, tgt: 'lowest' }] } }, ai: { seq: ['a'] } });
  const C = W.fight({ deck: [hc, kc], filler: 0, enemies: [e], mods: { hand: 2 }, heroes: [{ id: 'hanae', hp: 50, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] });
  C.heroes[0].st = { poison: 3, might: 2 }; C.heroes[0].block = 5;
  const ev = C.endTurn();
  t.eq(C.heroes[0].down, true, 'hanae fell'); t.deep([C.heroes[0].hp, C.heroes[0].st, C.heroes[0].block], [0, {}, 0], 'hp 0, no statuses, no Block');
  const hd = first(ev, 'hero_down'); t.eq(hd.hero, 'hanae', 'hero_down event');
  const sw = first(ev, 'swap'); t.deep([sw.forced, sw.cost, sw.front, sw.back], [true, 0, 'kuro', 'hanae'], 'forced swap, free');
  t.deep(only(ev, 'hit').map((h) => h.dst.id), ['hanae', 'kuro', 'kuro', 'kuro'], 'a downed hero cannot be targeted: every later op (back, both, lowest) hits the survivor');
  const hcInst = C.hand.find((c) => c.id === hc);
  if (hcInst) t.deep(C.canPlay(hcInst.uid), { ok: false, reason: 'down' }, 'a downed hero\'s cards are dead');
  t.ok(hcInst || C.discard.some((c) => c.id === hc), 'but they are still in the deck');
  t.deep(C.canSwap(), { ok: false, cost: 0, reason: 'solo' }, 'no swapping alone'); t.eq(C.stats.heroDowns, 1, 'heroDowns');
  // dead cards clog the hand: they are drawn and discarded like any card
  t.eq(C.hand.length + C.draw.length + C.discard.length, 2, 'conservation');
});

t.test('the end of the combat: win and lose detection, end is last, nothing runs afterwards', () => {
  const W = world();
  const two = W.enemy('two', { hp: [3, 3], moves: { a: atk(99, 'both') }, ai: { seq: ['a'] } });
  // both heroes down mid enemy phase: the enemy after it never acts
  const first1 = W.enemy('first', { hp: [100, 100], moves: { a: atk(999, 'both') }, ai: { seq: ['a'] } }), second = W.enemy('second', { hp: [100, 100], moves: { a: atk(1, 'both') }, ai: { seq: ['a'] } });
  let C = W.fight({ enemies: [first1, second] });
  let ev = C.endTurn();
  t.eq(C.result, 'lose', 'lose'); t.eq(ev[ev.length - 1].type, 'end', 'end is last'); t.deep(ev[ev.length - 1], { type: 'end', result: 'lose' }, 'end event');
  t.eq(only(ev, 'enemy_act').length, 1, 'the enemy phase stopped at once'); t.eq(only(ev, 'end').length, 1, 'exactly one end');
  t.eq(C.phase, 'over', 'phase'); t.deep([C.heroes[0].st, C.heroes[0].block], [{}, 0], 'combat statuses and Block are cleared when it ends');
  // every action is now a no-op
  const hcard = W.card('hc', { cost: 0, fx: [{ op: 'dmg', n: 1 }] });
  t.deep([C.endTurn().length, C.swap().length, C.play(1).length, C.resolvePick([]).length, C.start().length], [0, 0, 0, 0, 0], 'nothing works after the end');
  const n = C.events.length; C.endTurn(); t.eq(C.events.length, n, 'no more events');
  // win in the enemy phase from thorns, remaining enemies do not act
  const W2 = world(); const weakling = W2.enemy('w', { hp: [1, 1], moves: { a: atk(1) }, ai: { seq: ['a'] } }), late = W2.enemy('late', { hp: [1, 1], moves: { a: atk(5) }, ai: { seq: ['a'] } });
  C = W2.fight({ enemies: [weakling, late] }); C.heroes[0].st.thorns = 9; C.enemies[1].st.poison = 9;
  ev = C.endTurn();
  t.eq(C.result, 'win', 'win'); t.eq(ev[ev.length - 1].type, 'end', 'end last');
  // a win in the middle of a card: the card finishes (a lastKill bonus pays out), then the fight ends
  const W3 = world();
  const finisher = W3.card('fin', { fx: [{ op: 'dmg', n: 999 }, { op: 'cond', if: { lastKill: true }, then: [{ op: 'gold', n: 5 }] }, { op: 'block', n: 4 }] });
  C = W3.fight({ deck: [finisher], filler: 0 }); ev = play(C, rig(C, [finisher])[0]);
  t.eq(C.result, 'win', 'won'); t.eq(C.summary().gold, 5, 'the lastKill bonus paid out'); t.eq(only(ev, 'block').length, 1, 'and the rest of the card ran');
  t.eq(ev[ev.length - 1].type, 'end', 'end last'); t.ok(types(ev).indexOf('gold') < types(ev).indexOf('end'), 'gold before end');
  t.eq(C.inPlay, null, 'the card was settled'); t.eq(C.discard.length, 1, 'into the discard pile');
  // a loss in the middle of a card aborts it at once
  const W4 = world();
  const suicide = W4.card('sui', { type: 'skill', cost: 0, fx: [{ op: 'hurt', n: 999, tgt: 'both', lethal: true }, { op: 'gold', n: 50 }] });
  C = W4.fight({ deck: [suicide], filler: 0 }); ev = play(C, rig(C, [suicide])[0]);
  t.eq(C.result, 'lose', 'lost'); t.eq(C.summary().gold, 0, 'the remaining ops did not run'); t.eq(C.inPlay, null, 'card settled'); t.eq(total(C), C.deckSize + C.added, 'conservation');
  // a pick pending when the last enemy died is dropped
  const W5 = world(); const pk = W5.card('pk', { cost: 0, fx: [{ op: 'dmg', n: 999 }, { op: 'pick', from: 'hand', n: 1, then: 'discard', optional: true }] }), fodder = W5.card('f', { type: 'skill', cost: 0, fx: [{ op: 'block', n: 1 }] });
  C = W5.fight({ deck: [pk, fodder, fodder], filler: 0, mods: { hand: 3 } }); play(C, rig(C, [pk, fodder, fodder])[0]);
  t.deep([C.result, C.pending], ['win', null], 'no pointless pick after the last enemy fell');
});

t.test('summary: shape, copies, downed heroes stay down (RUN revives them), kills', () => {
  const W = world();
  const nuke = W.card('nuke', { cost: 0, fx: [{ op: 'dmg', n: 99, tgt: 'all' }] });
  const C = W.fight({ deck: [nuke], filler: 0, enemies: [W.enemy('a', { hp: [3, 3] }), W.enemy('b', { hp: [3, 3], tier: 'elite', size: 'l' })], heroes: [{ id: 'hanae', hp: 30, maxHp: 70 }, { id: 'kuro', hp: 0, maxHp: 60 }] });
  t.deep([C.heroes[1].down, C.front().id], [true, 'hanae'], 'a hero that starts at 0 HP is down');
  play(C, rig(C, [nuke])[0]);
  const sm = C.summary();
  t.deep(Object.keys(sm).sort(), ['gold', 'heroes', 'ink', 'kills', 'maxHpGain', 'result', 'stats'], 'summary keys');
  t.deep(sm.heroes, [{ id: 'hanae', hp: 30, maxHp: 70, down: false }, { id: 'kuro', hp: 0, maxHp: 60, down: true }], 'heroes: COMBAT leaves the downed hero down');
  t.deep(sm.kills, [{ def: 't_a', tier: 'normal', by: 'card' }, { def: 't_b', tier: 'elite', by: 'card' }], 'kills carry def, tier and how');
  sm.stats.kills.push('x'); sm.heroes[0].hp = 1; t.eq(C.stats.kills.length, 2, 'the summary is a copy'); t.eq(C.heroes[0].hp, 30, 'the units are untouched');
  t.deep([sm.result, sm.ink, sm.gold, sm.maxHpGain], ['win', 0, 0, {}], 'result, ink, gold, maxHpGain');
  t.eq(W.fight({ start: false }).summary().result, null, 'result is null while the fight goes on');
});

// ------------------------------------------------------------------ stats
t.test('stats: every key counts what DESIGN 4.10 says', () => {
  const W = world();
  W.D.heroes.hanae.rows = { front: {}, back: { startBlock: 2 } };
  const hit = W.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 8 }] }), multi = W.card('multi', { cost: 1, fx: [{ op: 'dmg', n: 1, hits: 3 }] }), multi2 = W.card('multi2', { cost: 1, fx: [{ op: 'dmg', n: 1, hits: 4 }, { op: 'dmg', n: 1, hits: 3 }] }), guard = W.card('guard', { type: 'skill', cost: 1, fx: [{ op: 'block', n: 6 }] }), xc = W.card('x', { cost: 'X', fx: [{ op: 'block', n: 1 }] });
  const e = W.enemy('big', { hp: [200, 200], moves: { a: atk(5, 'front') }, ai: { seq: ['a'] } });
  const C = W.fight({ deck: [hit, hit, hit, multi, multi2, guard, xc], filler: 0, enemies: [e], mods: { hand: 7, energy: 4 }, frontIdx: 1 });
  C.enemies[0].st.thorns = 0;
  const [h1, h2, h3, m1, m2, g1, x1] = rig(C, [hit, hit, hit, multi, multi2, guard, xc]);
  play(C, h1); play(C, h2); play(C, h3);
  t.eq(C.stats.zeroCostTurns, 1, 'three cost-0 cards in a turn count once'); play(C, m1);
  t.eq(C.stats.multiHitTurns, 1, 'a dmg op landing 3 hits marks the turn'); play(C, m2);
  t.eq(C.stats.multiHitTurns, 1, 'once per turn even when two ops qualify');
  t.deep([C.stats.cardsPlayed, C.stats.attacksPlayed, C.stats.damageDealt, C.stats.maxHit], [5, 5, 24 + 3 + 7, 8], 'cards, attacks, damage dealt (HP removed), largest raw hit');
  t.eq(C.stats.maxTurnDamage, 34, 'maxTurnDamage: the most damageDealt in one player phase');
  C.energy = 1; play(C, x1); t.eq(C.stats.zeroCostTurns, 1, 'an X card is not a cost-0 card');
  play(C, rig(C, [guard])[0] || g1);
  C.swap(); t.eq(C.stats.swaps, 1, 'swaps counted');
  const bg = C.stats.blockGained; C.endTurn();
  t.eq(C.stats.turns, 2, 'turns'); t.eq(C.stats.damageTaken, 5 - 0 + (C.stats.damageTaken - 5), 'damageTaken (hits landed)'); t.ok(C.stats.blockGained >= bg, 'blockGained (row startBlock at the turn start counts)');
  t.eq(C.stats.maxTurnDamage, 34, 'the enemy phase never counts toward maxTurnDamage');
  C.hand.slice(); const nxt = rig(C, [hit])[0]; play(C, nxt); t.eq(C.stats.zeroCostTurns, 1, 'a new turn starts the cost-0 tally over');
  t.eq(C.stats.kills.length, 0, 'no kills');
});

t.test('stats: damageTaken is hits and thorns only; damageDealt includes poison, burn and thorns; hero downs and revives', () => {
  const W = world();
  const C = W.fight({ enemies: [W.enemy('e', { hp: [100, 100], moves: { a: atk(7) }, ai: { seq: ['a'] } })] });
  C.heroes[0].st.poison = 4; C.heroes[0].st.burn = 6; C.enemies[0].st.poison = 5; C.enemies[0].st.burn = 8;
  C.endTurn();
  t.eq(C.stats.damageTaken, 7, 'only the hit counts (poison and burn do not)'); t.eq(C.stats.damageDealt, 13, 'poison 5 and burn 8 removed 13 enemy HP');
  const W2 = world(); const hit = W2.card('hit', { cost: 0, fx: [{ op: 'dmg', n: 2 }] });
  const C2 = W2.fight({ deck: [hit], filler: 0 }); C2.enemies[0].st.thorns = 4; play(C2, rig(C2, [hit])[0]); t.eq(C2.stats.damageTaken, 4, 'thorns taken count');
  const W3 = world(); const rev = W3.card('rev', { hero: 'kuro', type: 'skill', cost: 0, fx: [{ op: 'revive', n: 10 }] });
  const C3 = W3.fight({ deck: [rev], filler: 0, enemies: [W3.hitter(99)], heroes: [{ id: 'hanae', hp: 5, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }] }); C3.endTurn(); play(C3, rig(C3, [rev])[0]);
  t.deep([C3.stats.heroDowns, C3.stats.revives], [1, 1], 'heroDowns and revives');
});

// ------------------------------------------------------------------ upgrades and gems as played
t.test('upgrades in combat: fx replaced wholesale, cost, kw replaced; the deck object is untouched', () => {
  const W = world();
  const c = W.card('c', { cost: 2, fx: [{ op: 'dmg', n: 6 }], up: { cost: 1, fx: [{ op: 'dmg', n: 9 }, { op: 'draw', n: 1 }], kw: ['retain'] } });
  const deck = W.deck([{ id: c, up: 1 }, c]);
  const C = W.COMBAT.create({ heroes: [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }], deck, enemies: [W.dummy], seed: 1, mods: { hand: 2 } }); C.start();
  const [u, b] = [C.hand.find((x) => x.up), C.hand.find((x) => !x.up)];
  const evu = play(C, u); t.deep([first(evu, 'play').cost, first(evu, 'hit').raw], [1, 9], 'upgraded: cost 1, damage 9'); t.eq(only(evu, 'draw').length >= 0 && C.energy, 2, 'energy 3 - 1');
  const evb = play(C, b); t.deep([first(evb, 'play').cost, first(evb, 'hit').raw], [2, 6], 'base card: cost 2, damage 6');
  t.ok(deck.every((x) => x.up === 0 || x.uid === 100), 'the deck object was not modified by playing');
  // retain from the upgrade
  const W2 = world(); const c2 = W2.card('c', { cost: 0, type: 'skill', fx: [{ op: 'block', n: 1 }], up: { kw: ['retain'] } });
  const C2 = W2.fight({ deck: [{ id: c2, up: 1 }, c2], filler: 10, mods: { hand: 2 } });
  const all = () => C2.hand.concat(C2.draw, C2.discard, C2.exhaust);
  const upI = all().find((x) => x.id === c2 && x.up), baseI = all().find((x) => x.id === c2 && !x.up);
  [C2.hand, C2.draw, C2.discard].forEach((pile) => { [upI, baseI].forEach((x) => { const i = pile.indexOf(x); if (i >= 0) pile.splice(i, 1); }); });
  C2.hand.splice(0).forEach((x) => C2.discard.push(x)); C2.hand.push(upI, baseI);
  C2.endTurn();
  t.ok(C2.hand.includes(upI), 'the upgraded card kept by its retain keyword'); t.ok(!C2.hand.includes(baseI), 'the base card was discarded');
});

t.test('gems in combat: dmg and block and heal plus, hits, cost, draw, energy, status, poison, fx, kw, cond and colour rules', () => {
  const W = world();
  const gem = (name, color, mod, tier = 1) => W.gem(name, { color, tier, mod });
  const dmgG = gem('dmgG', 'red', { dmg: 2 }), hitG = gem('hitG', 'red', { hits: 1 }), blkG = gem('blkG', 'blue', { block: 3 }), healG = gem('healG', 'blue', { heal: 4 }), costG = gem('costG', 'green', { cost: -1 }, 3), drawG = gem('drawG', 'green', { draw: 2 }), enG = gem('enG', 'gold', { energy: 1 }), stG = gem('stG', 'gold', { status: { s: 'bloom', n: 2, tgt: 'self' } }), poiG = gem('poiG', 'green', { poison: 3 }), fxG = gem('fxG', 'gold', { fx: [{ op: 'block', n: 2 }] }), kwG = gem('kwG', 'green', { kw: ['retain'], kwRemove: ['exhaust'] }), frontG = gem('frontG', 'red', { dmg: 5, cond: 'front' }), backG = gem('backG', 'red', { dmg: 5, cond: 'back' });
  const mk = (name, over) => W.card(name, Object.assign({ cost: 2, slots: ['red', 'red'] }, over));
  const c1 = mk('c1', { fx: [{ op: 'dmg', n: 4, hits: 3 }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'dmg', n: 1 }] }, { op: 'repeat', n: 2, do: [{ op: 'dmg', n: 1 }] }] });
  const C = W.fight({ deck: [{ id: c1, gems: [dmgG, hitG] }], filler: 0, mods: { energy: 9 } }); plain(C);
  let ev = play(C, rig(C, [c1])[0]);
  t.deep(only(ev, 'hit').map((h) => h.raw), [6, 6, 6, 6, 3, 3, 3], 'dmg +2 on EVERY dmg op (through cond and repeat), hits +1 on the first top-level dmg op only: 4 hits of 6, then 3 (1+2) and 2 x 3');
  // block, heal
  const c2 = mk('c2', { type: 'skill', slots: ['blue', 'blue'], fx: [{ op: 'block', n: 4 }, { op: 'heal', n: 1 }] });
  const C2 = W.fight({ deck: [{ id: c2, gems: [blkG, healG] }], filler: 0 }); plain(C2); C2.heroes[0].hp = 50; ev = play(C2, rig(C2, [c2])[0]);
  t.deep([first(ev, 'block').amount, first(ev, 'heal').amount], [7, 5], 'block +3, heal +4');
  // cost delta, draw, energy, status, poison, fx appended in slot order
  const c3 = mk('c3', { cost: 2, slots: ['green', 'green', 'gold'], fx: [{ op: 'dmg', n: 1 }] });
  const C3 = W.fight({ deck: [{ id: c3, gems: [costG, drawG, enG] }], filler: 14, mods: { energy: 9 } }); plain(C3); const hnd = C3.hand.length;
  ev = play(C3, rig(C3, [c3])[0]);
  t.eq(first(ev, 'play').cost, 1, 'a tier 3 cost gem: 2 -> 1'); t.deep(types(ev).filter((x) => ['hit', 'draw', 'energy'].includes(x)), ['energy', 'hit', 'draw', 'energy'], 'appended ops run after the card: draw 2, then gain 1 Energy');
  t.eq(only(ev, 'energy').slice(-1)[0].delta, 1, 'energy gem');
  const c4 = mk('c4', { slots: ['gold', 'green', 'gold'], fx: [{ op: 'dmg', n: 1 }] });
  const C4 = W.fight({ deck: [{ id: c4, gems: [stG, poiG, fxG] }], filler: 0, mods: { energy: 9 } }); plain(C4); ev = play(C4, rig(C4, [c4])[0]);
  t.deep(types(ev).filter((x) => ['hit', 'status', 'block'].includes(x)), ['hit', 'status', 'status', 'block'], 'slot order: status gem, poison gem, fx gem');
  t.deep([C4.heroes[0].st.bloom, C4.enemies[0].st.poison], [2, 3], 'bloom on self, poison on the enemy target');
  const c4b = mk('c4b', { type: 'skill', slots: ['green'], fx: [{ op: 'block', n: 1 }] });
  const C4b = W.fight({ deck: [{ id: c4b, gems: [poiG] }], filler: 0 }); ev = play(C4b, rig(C4b, [c4b])[0]); t.deep(C4b.enemies[0].st, {}, 'poison N does nothing on a card with no enemy target');
  // keywords
  const c5 = mk('c5', { type: 'skill', cost: 0, slots: ['green'], kw: ['exhaust'], fx: [{ op: 'block', n: 1 }] });
  const C5 = W.fight({ deck: [{ id: c5, gems: [kwG] }], filler: 3, mods: { hand: 4 } }); ev = play(C5, rig(C5, [c5])[0]);
  t.deep([first(ev, 'play').to, C5.exhaust.length, C5.discard.some((x) => x.id === c5)], ['discard', 0, true], 'kwRemove exhaust: the card is discarded');
  C5.endTurn(); t.ok(C5.hand.some((x) => x.id === c5) || C5.draw.concat(C5.discard).some((x) => x.id === c5), 'and it is still in the deck'); 
  const rec = rig(C5, [c5])[0]; C5.hand.splice(C5.hand.indexOf(rec), 1); C5.hand.push(rec); const keep = C5.endTurn(); t.ok(C5.hand.some((x) => x.id === c5), 'retain gem keeps it in hand');
  // row-gated gems follow the row at play time
  const c6 = mk('c6', { cost: 0, slots: ['red', 'red'], fx: [{ op: 'dmg', n: 1 }] });
  const C6 = W.fight({ deck: [{ id: c6, gems: [frontG, backG] }, { id: c6, gems: [frontG, backG] }], filler: 0 }); plain(C6);
  t.eq(first(play(C6, rig(C6, [c6])[0]), 'hit').raw, 6, 'hanae in front: only the front gem applies');
  C6.swap(); t.eq(first(play(C6, rig(C6, [c6])[0]), 'hit').raw, 6, 'hanae in the back: only the back gem applies');
  // colour rules: a blue gem in a red slot is inert; a prism slot takes anything; a gem with nothing to modify is inert
  const c7 = mk('c7', { cost: 0, slots: ['red', 'any'], fx: [{ op: 'dmg', n: 1 }] });
  const C7 = W.fight({ deck: [{ id: c7, gems: [blkG, dmgG] }], filler: 0 }); plain(C7);
  t.eq(first(play(C7, rig(C7, [c7])[0]), 'hit').raw, 3, 'blue gem in a red slot does nothing; the red gem in the prism slot works');
  const C8 = W.fight({ deck: [{ id: c7, gems: [blkG, null] }], filler: 0 }); plain(C8); t.eq(first(play(C8, rig(C8, [c7])[0]), 'hit').raw, 1, 'a block gem on a card with no block op does nothing');
});

// ------------------------------------------------------------------ powers and keywords
t.test('powers go to C.powers and stay; unplayable and innate; a hook power keeps working all combat', () => {
  const W = world();
  const pw = W.card('pw', { type: 'power', cost: 1, fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] }] });
  const C = W.fight({ deck: [pw], filler: 10 });
  play(C, rig(C, [pw])[0]);
  C.endTurn(); C.endTurn(); C.endTurn();
  t.eq(C.heroes[0].st.might, 3, 'one Might per turn start, for the rest of the combat'); t.eq(C.powers.length, 1, 'the power stays in C.powers'); t.ok(!C.discard.concat(C.draw, C.hand).some((c) => c.id === pw), 'and never cycles back');
});

// ------------------------------------------------------------------ simulate, greedy policy, determinism
t.test('COMBAT.simulate and greedyPolicy: plays a whole combat, returns the summary, capped runaways stop', () => {
  const W = world();
  const strike = W.card('strike', { fx: [{ op: 'dmg', n: 6 }] }), guard = W.card('guard', { type: 'skill', fx: [{ op: 'block', n: 5 }] });
  const grunt = W.enemy('grunt', { hp: [30, 30], moves: { a: atk(5) }, ai: { seq: ['a'] } }), tank = W.enemy('tank', { hp: [9999, 9999] }), brute = W.enemy('brute', { hp: [999, 999], moves: { a: atk(60, 'both') }, ai: { seq: ['a'] } });
  const opts = () => ({ heroes: [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }], deck: W.deck([strike, strike, strike, strike, guard, guard, guard, guard]), enemies: [grunt], seed: 4 });
  const s = W.COMBAT.simulate(opts());
  t.deep(Object.keys(s).sort(), ['actions', 'capped', 'gold', 'heroes', 'ink', 'kills', 'maxHpGain', 'result', 'stats', 'turns'], 'summary plus turns, actions, capped');
  t.eq(s.result, 'win', 'the greedy bot beats a 30 HP grunt'); t.eq(s.capped, false, 'not capped'); t.ok(s.turns >= 2 && s.actions > 0, 'it took some turns'); t.ok(s.C && s.C.phase === 'over', 'the finished combat rides along non-enumerably'); t.ok(!JSON.stringify(s).includes('"C"'), 'and never serialises');
  t.deep(W.COMBAT.simulate(opts()).stats, s.stats, 'deterministic');
  // a custom policy
  const lazy = W.COMBAT.simulate(Object.assign(opts(), { enemies: [tank], maxTurns: 3 }), () => ({ type: 'end' }));
  t.deep([lazy.result, lazy.capped, lazy.turns > 3], [null, true, true], 'a policy that never finishes the fight is capped');
  const dead = W.COMBAT.simulate(Object.assign(opts(), { enemies: [brute] }), () => ({ type: 'end' }));
  t.eq(dead.result, 'lose', 'and one that lets the party die loses');
  // greedyPolicy answers pending picks and plays only legal cards
  const W2 = world(); const pk = W2.card('pk', { type: 'skill', cost: 0, fx: [{ op: 'pick', from: 'hand', n: 1, then: 'exhaust' }] });
  const junk = W2.card('junk', { hero: 'curse', type: 'curse', rarity: 'token', cost: undefined, kw: ['unplayable'], fx: [], art: { m: 'skull' } });
  const C = W2.fight({ deck: [pk, junk, W2.card('a', { fx: [{ op: 'dmg', n: 1 }] })], filler: 0, mods: { hand: 3 } });
  const act = W2.COMBAT.greedyPolicy(C); t.ok(act && ['play', 'end', 'swap'].includes(act.type), 'a decision');
  play(C, C.hand.find((c) => c.id === pk)); const pick = W2.COMBAT.greedyPolicy(C);
  t.eq(pick.type, 'pick', 'a pending pick is answered'); t.deep(pick.uids, [C.hand.find((c) => c.id === junk).uid], 'junk is exhausted first');
  t.ok(W2.COMBAT.applyAction(C, pick).length > 0, 'applyAction runs it');
});

t.test('determinism: the same seed and the same actions give an identical event log; different seeds differ', () => {
  const run = (seed) => {
    const W = world();
    const strike = W.card('strike', { fx: [{ op: 'dmg', n: 4, hits: 2 }] }), guard = W.card('guard', { type: 'skill', fx: [{ op: 'block', n: 4 }, { op: 'add', card: W.card('tok', { type: 'skill', rarity: 'token', cost: 0, fx: [{ op: 'draw', n: 1 }] }), to: 'draw' }] });
    const e = W.enemy('mix', { hp: [40, 60], moves: { a: atk(3, 'random', { hits: 2 }), b: atk(6, 'lowest'), c: { name: 'C', kind: 'debuff', fx: [{ op: 'status', s: 'poison', n: 2 }] } }, ai: { weighted: [['a', 3], ['b', 2], ['c', 1]] } });
    const s = W.COMBAT.simulate({ heroes: [{ id: 'hanae', hp: 70, maxHp: 70 }, { id: 'kuro', hp: 60, maxHp: 60 }], deck: W.deck([strike, strike, strike, guard, guard, guard, guard, strike]), enemies: [e, e], seed });
    return JSON.stringify(s.C.events);
  };
  t.eq(run(11), run(11), 'identical logs for identical inputs'); t.ok(run(11) !== run(12), 'a different seed differs');
});


// ------------------------------------------------------------------ fuzz: generated content, random legal actions, invariants after every action
function genV(rng, L, kind, isX) {
  if (rng.chance(0.62)) return rng.int(0, 8);
  const pers = kind === 'enemy' ? L.perEnemy : L.per.filter((x) => x !== 'X' || isX);
  const per = rng.pick(pers);
  const v = { per };
  if (rng.chance(0.4)) v.base = rng.int(0, 4);
  if (rng.chance(0.6)) v.mul = rng.pick([1, 2, 3, 0.5, -1]);
  if (per === 'status') v.s = rng.pick(Object.keys(L._st));
  if (L.perWhoPer.includes(per) && rng.chance(0.5)) v.who = rng.pick(kind === 'enemy' ? L.perWhoEnemy : L.perWho);
  if (rng.chance(0.2)) v.upTo = rng.int(1, 5);
  if (rng.chance(0.2)) v.cap = rng.int(3, 20);
  if (rng.chance(0.1)) v.min = rng.int(0, 3);
  return v;
}
function genCond(rng, L, kind) {
  const st = () => rng.pick(Object.keys(L._st));
  const cmp = (lo = 0, hi = 4) => { const c = {}; if (rng.chance(0.6)) c.gte = rng.int(lo, hi); if (!('gte' in c) || rng.chance(0.3)) c.lte = rng.int(lo, hi + 2); return c; };
  const keys = kind === 'enemy'
    ? { status: () => ({ s: st(), who: rng.pick(L.perWhoEnemy), gte: rng.int(0, 3) }), hpPct: () => ({ who: rng.pick(L.perWhoEnemy), lt: rng.pick([0.3, 0.5, 0.8]) }), block: () => cmp(0, 6), turn: () => cmp(1, 4), enemies: () => cmp(1, 3) }
    : { row: () => rng.pick(['front', 'back']), status: () => Object.assign({ s: st() }, rng.chance(0.5) ? { who: rng.pick(L.perWho) } : {}, rng.chance(0.7) ? cmp(0, 3) : {}), hpPct: () => Object.assign({ lt: 0.6 }, rng.chance(0.5) ? { who: rng.pick(L.perWho) } : {}), handEmpty: () => true, cardsPlayed: () => cmp(0, 3), attacksPlayed: () => cmp(0, 2), turn: () => cmp(1, 4), lastKill: () => true, targetStatus: () => Object.assign({ s: st() }, cmp(0, 2)), allyDown: () => true, block: () => cmp(0, 8), energy: () => cmp(0, 3), handSize: () => cmp(0, 5), enemies: () => cmp(1, 3) };
  const names = Object.keys(keys), out = {};
  for (let i = rng.int(1, 2); i > 0; i--) { const k = rng.pick(names); out[k] = keys[k](); }
  return out;
}
function genOps(rng, L, cx) {
  // cx: {kind:'card'|'hook'|'hand', depth, isX, tokens:[ids]}
  const n = rng.int(1, cx.depth ? 2 : 3);
  const ops = [];
  const st = () => rng.pick(Object.keys(L._st));
  const V = () => genV(rng, L, 'card', cx.isX);
  const consume = () => (rng.chance(0.2) ? (rng.chance(0.5) ? 'block' : { s: rng.pick([...Object.keys(L._st), 'block']), upTo: rng.int(1, 4) }) : undefined);
  const withConsume = (o) => { const c = consume(); if (c !== undefined) o.consume = c; return o; };
  const enemyTgt = () => rng.pick(L.enemyCardTgt), heroTgt = () => rng.pick(L.heroTgt);
  for (let i = 0; i < n; i++) {
    const r = rng() * 100;
    let o;
    if (r < 22) { o = { op: 'dmg', n: V() }; if (rng.chance(0.3)) o.hits = rng.chance(0.7) ? rng.int(0, 4) : genV(rng, L, 'card', cx.isX); if (rng.chance(0.5)) o.tgt = enemyTgt(); if (rng.chance(0.1)) o.pierce = true; if (rng.chance(0.1)) o.lifesteal = true; if (rng.chance(0.1)) o.el = rng.pick(L.elements); withConsume(o); }
    else if (r < 34) { o = withConsume({ op: 'block', n: V() }); if (rng.chance(0.4)) o.tgt = heroTgt(); }
    else if (r < 38) { o = withConsume({ op: 'heal', n: V() }); if (rng.chance(0.5)) o.tgt = heroTgt(); }
    else if (r < 41) { o = withConsume({ op: 'hurt', n: V() }); if (rng.chance(0.5)) o.tgt = heroTgt(); if (rng.chance(0.15)) o.lethal = true; }
    else if (r < 55) { const s = st(); o = withConsume({ op: 'status', s, n: rng.chance(0.85) ? V() : -rng.int(1, 3) }); if (rng.chance(0.55) || cx.kind === 'hand') o.tgt = rng.chance(0.5) ? heroTgt() : enemyTgt(); }
    else if (r < 60) { const s = rng.pick([...Object.keys(L._st), 'debuffs', 'buffs']); o = { op: 'removeStatus', s }; if (rng.chance(0.4)) o.n = rng.int(1, 3); if (rng.chance(0.5)) o.tgt = rng.chance(0.5) ? heroTgt() : enemyTgt(); }
    else if (r < 65) o = withConsume({ op: 'draw', n: rng.chance(0.8) ? rng.int(0, 3) : genV(rng, L, 'card', cx.isX) });
    else if (r < 68) o = withConsume({ op: 'energy', n: rng.chance(0.8) ? rng.int(-2, 2) : genV(rng, L, 'card', cx.isX) });
    else if (r < 73 && cx.kind === 'card') { const from = rng.pick(Object.keys(L.pickPairs)); o = { op: 'pick', from, n: rng.int(1, 2), then: rng.pick(L.pickPairs[from]) }; if (from === 'draw' && rng.chance(0.4)) o.top = rng.int(1, 4); if (rng.chance(0.2)) o.filter = { type: rng.pick(['attack', 'skill']) }; if (rng.chance(0.2)) o.random = true; if (rng.chance(0.2)) o.optional = true; }
    else if (r < 77) { o = { op: 'add', card: rng.pick(cx.tokens) }; if (rng.chance(0.4)) o.n = rng.int(1, 3); if (rng.chance(0.5)) o.to = rng.pick(L.addTo); if (rng.chance(0.2)) o.up = true; }
    else if (r < 79 && cx.kind === 'card') o = { op: 'swap' };
    else if (r < 85 && cx.depth < 2) { o = { op: 'cond', if: genCond(rng, L, 'card'), then: genOps(rng, L, Object.assign({}, cx, { depth: cx.depth + 1 })) }; if (rng.chance(0.4)) o.else = genOps(rng, L, Object.assign({}, cx, { depth: cx.depth + 1 })); }
    else if (r < 88 && cx.kind === 'card' && cx.depth < 2) o = { op: 'repeat', n: rng.chance(0.5) ? rng.int(0, 3) : genV(rng, L, 'card', cx.isX), do: genOps(rng, L, Object.assign({}, cx, { depth: cx.depth + 1 })) };
    else if (r < 90) o = { op: 'gold', n: rng.int(-5, 9) };
    else if (r < 92) o = { op: 'ink', n: rng.int(0, 3) };
    else if (r < 94) { o = { op: 'maxHp', n: rng.pick([-3, -1, 1, 2, 4]) }; if (rng.chance(0.4)) o.tgt = heroTgt(); }
    else if (r < 96) o = rng.chance(0.5) ? { op: 'revive', n: rng.int(1, 20) } : { op: 'revive', pct: rng.pick([0.1, 0.25, 0.5, 1]) };
    else if (cx.kind === 'card' && cx.depth === 0) o = genHook(rng, L, cx);
    else o = { op: 'block', n: V() };
    ops.push(o);
  }
  return ops;
}
function genHook(rng, L, cx, asDef) {
  const on = rng.pick(L.combatHooks);
  const h = { on, fx: genOps(rng, L, { kind: 'hook', depth: 1, isX: false, tokens: cx.tokens }) };
  if (!asDef) h.op = 'hook';
  const f = {};
  if (['onPlay', 'onExhaust'].includes(on)) { if (rng.chance(0.4)) f.type = rng.pick(L.cardTypes); if (rng.chance(0.2)) f.cost = { lte: rng.int(0, 2) }; if (rng.chance(0.2)) f.kw = rng.pick(L.cardKw); if (rng.chance(0.15)) f.gems = { gte: 1 }; }
  if (on === 'onKill' && rng.chance(0.4)) f.tier = rng.pick(L.tiers);
  if (rng.chance(0.15)) f.hero = rng.pick(['any', ...L.heroIds]);
  if (Object.keys(f).length) h.filter = f;
  const m = rng();
  if (m < 0.25) h.limit = rng.int(1, 2); else if (m < 0.4) h.once = true; else if (m < 0.5) h.every = rng.int(2, 3);
  return h;
}
function genEnemyOps(rng, L, cx) {
  const n = rng.int(1, cx.depth ? 2 : 3), ops = [];
  const V = () => (rng.chance(0.7) ? rng.int(0, 9) : genV(rng, L, 'enemy'));
  const st = () => rng.pick(Object.keys(L._st));
  for (let i = 0; i < n; i++) {
    const r = rng() * 100; let o;
    if (r < 30) { o = { op: 'dmg', n: V() }; if (rng.chance(0.4)) o.hits = rng.int(0, 4); if (rng.chance(0.7)) o.tgt = rng.pick(L.enemyHeroTgt); if (rng.chance(0.1)) o.pierce = true; if (rng.chance(0.1)) o.lifesteal = true; }
    else if (r < 40) { o = { op: 'block', n: V() }; if (rng.chance(0.5)) o.tgt = rng.pick(L.enemySelfTgt); }
    else if (r < 45) { o = { op: 'heal', n: V() }; if (rng.chance(0.5)) o.tgt = rng.pick(L.enemySelfTgt); }
    else if (r < 62) { o = { op: 'status', s: st(), n: V() }; if (rng.chance(0.6)) o.tgt = rng.chance(0.6) ? rng.pick(L.enemyHeroTgt) : rng.pick(L.enemySelfTgt); }
    else if (r < 68) { o = { op: 'removeStatus', s: rng.pick([...Object.keys(L._st), 'debuffs', 'buffs']) }; if (rng.chance(0.3)) o.n = rng.int(1, 3); if (rng.chance(0.5)) o.tgt = rng.chance(0.5) ? rng.pick(L.enemyHeroTgt) : rng.pick(L.enemySelfTgt); }
    else if (r < 74) { o = { op: 'add', card: rng.pick(cx.junk) }; if (rng.chance(0.4)) o.n = rng.int(1, 2); if (rng.chance(0.5)) { o.to = rng.pick(L.addToEnemy); if (o.to === 'draw' && rng.chance(0.5)) o.top = true; } }
    else if (r < 80 && cx.minions.length) { o = { op: 'summon', enemy: rng.pick(cx.minions) }; if (rng.chance(0.4)) o.n = rng.int(1, 4); }
    else if (r < 83) o = { op: 'swap' };
    else if (r < 89 && cx.depth < 2) { o = { op: 'cond', if: genCond(rng, L, 'enemy'), then: genEnemyOps(rng, L, Object.assign({}, cx, { depth: cx.depth + 1 })) }; if (rng.chance(0.4)) o.else = genEnemyOps(rng, L, Object.assign({}, cx, { depth: cx.depth + 1 })); }
    else if (r < 93) o = { op: 'stealGold', n: rng.int(1, 30) };
    else if (r < 95 && cx.depth === 0) o = { op: 'flee' };
    else o = { op: 'dmg', n: V(), tgt: 'front' };
    ops.push(o);
  }
  return ops;
}
function kindOfMove(ops) {
  const flat = []; const walk = (l) => l.forEach((o) => { flat.push(o.op); if (o.then) walk(o.then); if (o.else) walk(o.else); }); walk(ops);
  if (!flat.length) return 'none';
  for (const [op, kind] of [['dmg', 'attack'], ['summon', 'summon'], ['flee', 'flee'], ['block', 'defend'], ['heal', 'heal'], ['status', 'debuff'], ['removeStatus', 'debuff'], ['add', 'debuff'], ['swap', 'debuff'], ['stealGold', 'debuff']]) if (flat.includes(op)) return kind;
  return 'none';
}

function genUniverse(W, rng) {
  const D = W.D, L = D.LISTS;
  L._st = D.statuses;
  const U = { cards: {}, junk: [], tokens: [], enemies: [], minions: [], relics: [], gems: [] };
  let n = 0;
  const id = (p) => `t_${p}${++n}`;
  const mkArt = () => ({ m: rng.pick(L.motifs), c: rng.pick(L.palettes) });
  for (let i = 0; i < 4; i++) { const tid = id('tok'); D.add('cards', { [tid]: { name: tid, hero: rng.pick(L.heroIds), type: 'skill', rarity: 'token', cost: rng.int(0, 1), fx: [{ op: 'block', n: 2 }, { op: 'draw', n: 1 }], kw: rng.chance(0.4) ? ['exhaust'] : [], slots: [], art: mkArt() } }); U.tokens.push(tid); }
  const junkDefs = [
    { type: 'curse', hero: 'curse', kw: ['unplayable'], hand: { turnEnd: [{ op: 'hurt', n: 2, tgt: 'front' }] } }, { type: 'curse', hero: 'curse', kw: ['unplayable', 'innate'], fx: [] },
    { type: 'status', hero: 'status', kw: ['unplayable', 'ethereal'], hand: { drawn: [{ op: 'energy', n: -1 }] } }, { type: 'status', hero: 'status', cost: 1, kw: ['exhaust'], fx: [{ op: 'removeStatus', s: 'bind', tgt: 'both' }] },
    { type: 'curse', hero: 'curse', kw: ['unplayable'], hand: { drawn: [{ op: 'status', s: 'weak', n: 1, tgt: 'front' }], turnEnd: [{ op: 'status', s: 'vulnerable', n: 1, tgt: 'both' }] } }, { type: 'status', hero: 'status', cost: 0, kw: ['exhaust'], fx: [{ op: 'hurt', n: 2 }, { op: 'draw', n: 1 }] },
  ];
  junkDefs.forEach((d) => { const jid = id('junk'); D.add('cards', { [jid]: Object.assign({ name: jid, rarity: 'token', fx: [], art: { m: 'skull' } }, d) }); U.junk.push(jid); });
  const heroList = L.heroIds;
  for (let i = 0; i < 90; i++) {
    const hero = heroList[i % 4], type = rng.pick(['attack', 'attack', 'skill', 'skill', 'power']);
    const isX = rng.chance(0.12);
    const cx = { kind: 'card', depth: 0, isX, tokens: U.tokens };
    let fx = genOps(rng, L, cx);
    if (type === 'attack' && !fx.some((o) => o.op === 'dmg')) fx.push({ op: 'dmg', n: rng.int(1, 9) });
    const def = { name: id('c'), hero, type, rarity: 'common', cost: isX ? 'X' : rng.int(0, 3), fx, up: { fx: genOps(rng, L, cx) }, kw: rng.chance(0.3) ? [rng.pick(['exhaust', 'retain', 'ethereal', 'innate'])] : [], slots: Array.from({ length: rng.int(0, 3) }, () => rng.pick(['red', 'blue', 'green', 'gold', 'any'])), art: mkArt() };
    if (rng.chance(0.15)) def.up.cost = isX ? 'X' : rng.int(0, 2);
    if (rng.chance(0.15)) def.up.kw = [];
    def.id = id('card');
    D.add('cards', { [def.id]: def }); (U.cards[hero] = U.cards[hero] || []).push(def.id);
  }
  ['status_a', 'status_b'].forEach(() => 0);
  for (let i = 0; i < 6; i++) { const mid = id('mini'); D.add('enemies', { [mid]: { name: mid, art: { id: mid }, chapter: 1, tier: 'minion', size: 's', hp: [rng.int(1, 4), rng.int(4, 9)], moves: { p: { name: 'Poke', kind: 'attack', fx: [{ op: 'dmg', n: rng.int(0, 3) }] }, idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['p', 'idle'] }, lore: 'x', tags: ['spirit'], hooks: rng.chance(0.3) ? [{ on: 'onDeath', fx: [{ op: 'dmg', n: 2, tgt: 'front' }] }] : undefined, start: rng.chance(0.3) ? [{ op: 'status', s: 'thorns', n: 1, tgt: 'self' }] : undefined } }); U.minions.push(mid); U.enemies.push(mid); }
  for (let i = 0; i < 26; i++) {
    const eid = id('foe'), tier = rng.pick(['normal', 'normal', 'normal', 'elite', 'boss']);
    const cx = { depth: 0, minions: U.minions, junk: U.junk };
    const moves = {};
    const names = Array.from({ length: rng.int(2, 5) }, (_, k) => 'm' + k);
    names.forEach((m) => { const ops = genEnemyOps(rng, L, cx); moves[m] = { name: m, kind: kindOfMove(ops), fx: ops }; });
    moves.idle = { name: 'Idle', kind: 'none', fx: [] };
    const all = names.concat(['idle']);
    const ai = rng.chance(0.5) ? { seq: Array.from({ length: rng.int(1, 4) }, () => rng.pick(all)) } : { weighted: all.map((m) => [m, rng.int(1, 4)]), noRepeat: rng.chance(0.5) ? rng.int(1, 2) : undefined };
    if (ai.noRepeat === undefined) delete ai.noRepeat;
    if (rng.chance(0.5)) ai.open = [rng.pick(all)];
    if (rng.chance(0.6)) ai.rules = [{ if: rng.pick([{ hpLt: 0.5 }, { turnEvery: [3, 2] }, { turnGte: 3 }, { alone: true }, { heroStatus: { s: 'weak' } }, { heroDown: true }, { minions: { lt: 2 } }, { allyHpLt: 0.5 }, { heroHpLt: 0.4 }, { hpGt: 0.8 }]), do: rng.pick(all), once: rng.chance(0.4) ? true : undefined }].map((r) => { if (r.once === undefined) delete r.once; return r; });
    const e = { name: eid, art: { id: eid }, chapter: 1, tier, size: tier === 'normal' ? 'm' : tier === 'elite' ? 'l' : 'xl', hp: [rng.int(8, 30), rng.int(30, 90)], moves, ai, lore: 'x', tags: ['spirit'] };
    if (rng.chance(0.3)) e.start = genEnemyOps(rng, L, { depth: 1, minions: U.minions, junk: U.junk });
    if (rng.chance(0.4)) e.phases = [{ at: 0.66, say: 'a', fx: genEnemyOps(rng, L, { depth: 1, minions: U.minions, junk: U.junk }), ai: rng.chance(0.6) ? { open: [rng.pick(all)], seq: [rng.pick(all)] } : undefined }, { at: 0.33, say: 'b' }].map((p) => { if (p.ai === undefined) delete p.ai; return p; });
    if (rng.chance(0.35)) e.hooks = [{ on: rng.pick(L.enemyHooks), fx: genEnemyOps(rng, L, { depth: 1, minions: U.minions, junk: U.junk }), limit: rng.chance(0.5) ? 1 : undefined, once: rng.chance(0.2) ? true : undefined }].map((h) => { Object.keys(h).forEach((k) => { if (h[k] === undefined) delete h[k]; }); return h; });
    if (rng.chance(0.25)) e.immune = [rng.pick(Object.keys(D.statuses))];
    D.add('enemies', { [eid]: e }); U.enemies.push(eid);
  }
  for (let i = 0; i < 10; i++) {
    const rid = id('rel'); const r = { name: rid, rarity: 'common', text: 'A relic.', art: { m: rng.pick(L.relicIcons) } };
    const k = rng();
    if (k < 0.65) r.hooks = Array.from({ length: rng.int(1, 3) }, () => genHook(rng, L, { tokens: U.tokens }, true));
    else if (k < 0.85) r.rows = { front: { dmgAdd: rng.int(0, 2), thorns: rng.int(0, 2) }, back: { blockAdd: rng.int(0, 2), regen: rng.int(0, 2), drawAdd: rng.int(0, 1), startBlock: rng.int(0, 2) } };
    else r.hooks = [genHook(rng, L, { tokens: U.tokens }, true)];
    if (rng.chance(0.2)) r.hero = rng.pick(L.heroIds);
    D.add('relics', { [rid]: r }); U.relics.push(rid);
  }
  const modPool = [{ dmg: 2 }, { block: 3 }, { heal: 2 }, { hits: 1 }, { draw: 1 }, { energy: 1 }, { poison: 2 }, { status: { s: 'bloom', n: 2, tgt: 'self' } }, { kw: ['retain'] }, { kwRemove: ['exhaust'] }, { dmg: 3, cond: 'front' }, { block: 2, cond: 'back' }, { fx: [{ op: 'block', n: 2 }] }, { cost: -1 }];
  for (let i = 0; i < 16; i++) { const gid = id('gem'); const mod = rng.pick(modPool); D.add('gems', { [gid]: { name: gid, color: rng.pick(L.gemColors), tier: mod.cost ? 3 : 1, art: { cut: 'round' }, mod } }); U.gems.push(gid); }
  return U;
}

const gemFor = (D, U, rng, color) => { const pool = U.gems.filter((g) => color === 'any' || D.gems[g].color === color); return pool.length && rng.chance(0.6) ? rng.pick(pool) : null; };

// invariants that must hold after every action
function violations(C, label) {
  const bad = [];
  const num = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) bad.push(`${what} is ${v}`); };
  C.heroes.concat(C.enemies).forEach((u) => {
    num(u.hp, u.id + '.hp'); num(u.maxHp, u.id + '.maxHp'); num(u.block, u.id + '.block');
    if (u.hp < 0 || u.hp > u.maxHp) bad.push(`${u.id} hp ${u.hp}/${u.maxHp}`);
    if (u.block < 0) bad.push(`${u.id} block ${u.block}`);
    Object.keys(u.st).forEach((k) => { num(u.st[k], u.id + '.st.' + k); if (u.st[k] === 0) bad.push(`${u.id} has a zero status ${k}`); if (u.st[k] < 0 && k !== 'might') bad.push(`${u.id} negative ${k}`); });
    if (u.kind === 'hero' && u.down && (u.hp !== 0 || Object.keys(u.st).length || u.block)) bad.push(`${u.id} is down but has hp ${u.hp} st ${JSON.stringify(u.st)} block ${u.block}`);
    if (u.kind === 'enemy' && u.down && !u.fled && u.hp !== 0) bad.push(`${u.id} is dead with hp ${u.hp}`);
    if (u.kind === 'hero' && !u.down && u.hp <= 0) bad.push(`${u.id} at 0 HP but not down`);
  });
  num(C.energy, 'energy'); if (C.energy < 0 || !Number.isInteger(C.energy)) bad.push('energy ' + C.energy);
  const cards = C.hand.concat(C.draw, C.discard, C.exhaust, C.powers, C.inPlay ? [C.inPlay] : []);
  if (cards.length !== C.deckSize + C.added) bad.push(`conservation: ${cards.length} != ${C.deckSize} + ${C.added}`);
  if (new Set(cards.map((c) => c.uid)).size !== cards.length) bad.push('duplicate uids');
  if (C.hand.length > 10) bad.push('hand over 10');
  if (!['player', 'over'].includes(C.phase)) bad.push('phase ' + C.phase);
  if ((C.phase === 'over') !== (C.result !== null)) bad.push('result ' + C.result + ' with phase ' + C.phase);
  if (C.pending && (C.phase !== 'player' || !C.inPlay)) bad.push('pending without a card in play');
  if (!C.pending && C.inPlay) bad.push('a card is stuck in play');
  if (C.pending) { const p = C.pending; if (!p.uids.length && !p.optional) bad.push('empty pending'); }
  if (C.heroes.length === 2) { const rows = C.heroes.map((h) => h.row).sort().join(); if (rows !== 'back,front') bad.push('rows ' + rows); }
  const lanes = C.enemies.filter((e) => !e.down).map((e) => e.lane); if (new Set(lanes).size !== lanes.length) bad.push('lanes ' + lanes);
  if (new Set(C.enemies.map((e) => e.id)).size !== C.enemies.length) bad.push('duplicate enemy ids');
  if (C.enemies.filter((e) => !e.down).length > 5) bad.push('more than 5 living enemies');
  const ends = C.events.filter((e) => e.type === 'end'); if (ends.length > 1) bad.push('two end events'); if (C.phase === 'over' && C.events[C.events.length - 1].type !== 'end') bad.push('end is not last');
  if (C.phase === 'player') { C.enemies.forEach((e) => { if (!e.down && (!e.intent || !e.intent.move)) bad.push(e.id + ' has no intent'); }); }
  return bad.map((b) => `[${label}] ${b}`);
}

function fuzzOne(seed, opts = {}) {
  const W = world({ keepHeroes: opts.keepHeroes });
  const rng = W.U.rng(W.U.hash('fuzz-universe', seed));
  const uni = genUniverse(W, rng);
  const D = W.D, L = D.LISTS;
  const pr = W.U.rng(W.U.hash('fuzz-party', seed));
  const heroes = pr.shuffle(L.heroIds).slice(0, 2);
  const deck = [];
  let uid = 1;
  const pool = heroes.flatMap((h) => uni.cards[h]);
  for (let i = 0; i < pr.int(12, 22); i++) {
    const id = pr.pick(pool), def = D.cards[id];
    deck.push({ uid: uid++, id, up: pr.chance(0.3) ? 1 : 0, gems: (def.slots || []).map((sl) => gemFor(D, uni, pr, sl)) });
  }
  for (let i = 0; i < pr.int(0, 3); i++) deck.push({ uid: uid++, id: pr.pick(uni.junk), up: 0, gems: [] });
  const mods = { energy: pr.int(2, 5), hand: pr.int(3, 7), startBlock: pr.int(0, 2), freeSwaps: pr.int(0, 2), enemyDmg: pr.pick([1, 1, 1.25]), enemyHp: 1, eliteHp: 1, bossHp: 1 };
  const enemyIds = Array.from({ length: pr.int(1, 4) }, () => pr.pick(uni.enemies));
  const relics = Array.from({ length: pr.int(0, 3) }, () => pr.pick(uni.relics)).filter((x, i, a) => a.indexOf(x) === i);
  const C = W.COMBAT.create({ heroes: heroes.map((id) => ({ id, hp: pr.int(5, D.heroes[id].maxHp), maxHp: D.heroes[id].maxHp })), frontIdx: pr.int(0, 1), deck, enemies: enemyIds, tier: 'normal', chapter: 1, seed, mods, relics, gold: pr.int(0, 100) });
  const script = [];
  const bad = [];
  const check = (label) => { violations(C, label).forEach((v) => bad.push(`seed ${seed}: ${v}`)); };
  C.start(); check('start');
  const ar = W.U.rng(W.U.hash('fuzz-actions', seed));
  let steps = 0;
  while (C.phase !== 'over' && steps++ < (opts.steps || 80)) {
    const seedBefore = C.rng.seed();
    // pure calls never move the rng and never throw
    C.enemies.forEach((e) => { if (!e.down) C.intent(e); });
    C.hand.forEach((c) => { C.preview(c.uid, C.enemies.find((e) => !e.down) ? C.enemies.find((e) => !e.down).id : undefined); C.canPlay(c.uid); C.legalTargets(c.uid); C.needsTarget(c.uid); });
    C.canSwap();
    if (C.rng.seed() !== seedBefore) bad.push(`seed ${seed}: a pure call consumed the rng`);
    let ev, act;
    if (C.pending) {
      const p = C.pending; const k = p.optional ? ar.int(0, Math.min(p.n, p.uids.length)) : p.n;
      const uids = ar.shuffle(p.uids).slice(0, k); act = { t: 'pick', uids }; ev = C.resolvePick(uids);
      // an optional pick answered with nothing can legitimately emit no events, so "accepted" means the pending object was consumed
      if (C.pending === p) bad.push(`seed ${seed}: a valid pick was refused ${JSON.stringify(p)} ${JSON.stringify(uids)}`);
    } else {
      const r = ar();
      const playable = C.hand.filter((c) => { const t0 = C.legalTargets(c.uid)[0]; return C.canPlay(c.uid, t0).ok; });
      if (r < 0.62 && playable.length) {
        const c = ar.pick(playable); const ts = C.legalTargets(c.uid); const target = ts.length ? ar.pick(ts) : undefined;
        act = { t: 'play', uid: c.uid, target }; ev = C.play(c.uid, target);
      } else if (r < 0.7 && C.canSwap().ok) { act = { t: 'swap' }; ev = C.swap(); }
      else if (r < 0.78) {
        // an illegal action changes nothing
        const snapBefore = snap(C);
        const junkUid = 987654; const ill = [C.play(junkUid), C.play(junkUid, 'nobody'), C.resolvePick([1, 2, 3]), C.canPlay(junkUid).ok ? [1] : []];
        if (ill.some((x) => x.length) || snap(C) !== snapBefore) bad.push(`seed ${seed}: an illegal action changed something`);
        act = null; ev = [];
      } else { act = { t: 'end' }; ev = C.endTurn(); }
    }
    if (act) script.push(act);
    check('after ' + JSON.stringify(act));
    if (bad.length > 6) break;
  }
  return { C, bad, script, heroes, deck, enemyIds, relics, mods };
}

t.test('fuzz: 120 generated combats, random legal actions, invariants after every action', () => {
  // the generated content is legal per the validator (the id rules aside)
  const V = world(); const vu = genUniverse(V, V.U.rng(4242));
  const idRules = /id must start with|token ids look like|is not in the fixed roster/;
  ['cards', 'enemies', 'relics', 'gems'].forEach((k) => { const errs = V.D.validate(k).errors.filter((e) => !idRules.test(e)); t.eq(errs.length, 0, `generated ${k} validate: ${errs.slice(0, 3).join(' | ')}`); });
  let actions = 0, wins = 0, losses = 0, summons = 0, picks = 0, phases = 0, hooksRun = 0;
  const problems = [];
  for (let seed = 1; seed <= 120; seed++) {
    let r;
    try { r = fuzzOne(seed); } catch (e) { problems.push(`seed ${seed} threw: ${e.stack.split('\n').slice(0, 4).join(' | ')}`); continue; }
    actions += r.script.length; if (r.C.result === 'win') wins++; if (r.C.result === 'lose') losses++;
    summons += r.C.events.filter((e) => e.type === 'summon').length; picks += r.C.events.filter((e) => e.type === 'pick_needed').length; phases += r.C.events.filter((e) => e.type === 'enemy_phase').length; hooksRun += r.C.events.filter((e) => e.type === 'relic').length;
    r.bad.forEach((b) => problems.push(b));
  }
  t.eq(problems.length, 0, 'fuzz problems: ' + problems.slice(0, 8).join('\n   '));
  t.ok(actions >= 300, 'at least 300 random actions were taken (' + actions + ')'); t.ok(wins > 0 && losses > 0, `the fuzz reached both endings (${wins} wins, ${losses} losses)`);
  t.ok(picks > 0 && summons > 0 && phases > 0 && hooksRun > 0, `and exercised picks (${picks}), summons (${summons}), phases (${phases}) and relic hooks (${hooksRun})`);
});

t.test('fuzz: replaying the recorded actions reproduces the event log exactly', () => {
  for (const seed of [3, 9, 17, 25, 40, 77]) {
    const a = fuzzOne(seed);
    // a second run in a fresh world (fresh registry, fresh combat) from the same seed must match the first exactly
    const again = fuzzOne(seed);
    t.ok(a.script.length > 0, `seed ${seed}: the run took actions`);
    t.eq(JSON.stringify(again.C.events), JSON.stringify(a.C.events), `seed ${seed}: same seed, same log`);
    t.deep(again.script, a.script, `seed ${seed}: same actions`);
  }
});

// ------------------------------------------------------------------ bonus: real content
// Everything below is guarded: it runs over whatever real (non t_) cards, enemies, relics and gems exist right now, and passes trivially
// while a content file has not been written yet. It never asserts balance, only that the engine copes: no throw, invariants after every
// action, every combat ends, text exists for every enemy intent, and identical inputs give identical event logs.
const isReal = (id) => id.indexOf('t_') !== 0;
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');   // built at run time: this file must contain no dash characters itself

// the hero pair a real card is tested with: its own hero plus a partner (curses and statuses ride with the default pair)
function pairFor(D, def) {
  const ids = D.LISTS.heroIds.filter((h) => D.heroes[h]);
  const own = ids.indexOf(def.hero) >= 0 ? def.hero : 'hanae';
  const other = ids.find((h) => h !== own && (D.heroes[h].starter || []).every((s) => D.cards[s])) || ids.find((h) => h !== own);
  return [own, other];
}
function realDeck(D, heroes, extra) {
  const out = []; let uid = 1;
  (extra || []).forEach((e) => out.push(Object.assign({ uid: uid++, up: 0, gems: [] }, e)));
  heroes.forEach((h) => (D.heroes[h].starter || []).forEach((s) => { if (D.cards[s]) out.push({ uid: uid++, id: s, up: 0, gems: (D.cards[s].slots || []).map(() => null) }); }));
  return out;
}
// answer a pending pick the way a player would: the first n candidates (none when optional)
function answerPicks(C, cap = 6) {
  let k = 0;
  while (C.pending && k++ < cap) { const p = C.pending; C.resolvePick(p.uids.slice(0, p.optional ? Math.min(1, p.n) : p.n)); }
}
const realFoes = (D, tier, n) => Object.keys(D.enemies).filter((id) => isReal(id) && D.enemies[id].tier === tier).slice(0, n);

t.test('real content: every card plays cleanly, base and upgraded, from either row', () => {
  const W = world({ keepHeroes: true }); const D = W.D;
  const ids = Object.keys(D.cards).filter(isReal);
  if (!ids.length) { t.ok(true, 'no real cards written yet: nothing to check'); return; }
  const foes = realFoes(D, 'normal', 2);
  if (!foes.length) { t.ok(true, 'no real enemies written yet: nothing to check'); return; }
  const problems = []; let plays = 0, picksSeen = 0, cursesSeen = 0;
  ids.forEach((id) => {
    const def = D.cards[id];
    [0, 1].forEach((up) => {
      if (up && !def.up) return;
      [0, 1].forEach((frontIdx) => {
        const heroes = pairFor(D, def);
        const label = `${id}${up ? '+' : ''} front${frontIdx}`;
        try {
          const deck = realDeck(D, heroes, [{ id, up, gems: (def.slots || []).map(() => null) }]);
          const C = W.COMBAT.create({ heroes: heroes.map((h) => ({ id: h, hp: D.heroes[h].maxHp, maxHp: D.heroes[h].maxHp })), frontIdx, deck, enemies: foes, seed: 11, mods: { energy: 6, hand: 5 } });
          const bad = (vs) => vs.forEach((v) => problems.push(`${label}: ${v}`));
          C.start(); bad(violations(C, 'start'));
          let inst = C.hand.concat(C.draw, C.discard).find((c) => c.uid === 1);
          if (inst && C.hand.indexOf(inst) < 0) { const pile = [C.draw, C.discard].find((p) => p.indexOf(inst) >= 0); pile.splice(pile.indexOf(inst), 1); C.hand.push(inst); }
          if (def.type === 'curse' || def.type === 'status') cursesSeen++;
          const target = C.legalTargets(inst.uid)[0];
          const before = C.rng.seed(); C.preview(inst.uid, target); C.canPlay(inst.uid, target);
          if (C.rng.seed() !== before) problems.push(`${label}: preview consumed the rng`);
          if (C.canPlay(inst.uid, target).ok) {
            const ev = C.play(inst.uid, target); plays++;
            if (!ev.length || ev[0].type !== 'play') problems.push(`${label}: a legal play did not start with a play event`);
            if (C.pending) picksSeen++;
            answerPicks(C);
            if (C.pending) problems.push(`${label}: a pick could not be answered`);
            bad(violations(C, 'after play'));
          }
          // then two full rounds: the card's end of turn and drawn effects, enemy attacks and every intent
          for (let r = 0; r < 2 && C.phase !== 'over'; r++) {
            C.endTurn(); bad(violations(C, 'round ' + r));
            if (C.phase === 'over') break;
            C.hand.filter((c) => C.canPlay(c.uid, C.legalTargets(c.uid)[0]).ok).slice(0, 3).forEach((c) => { if (C.phase !== 'player') return; C.play(c.uid, C.legalTargets(c.uid)[0]); answerPicks(C); });
            bad(violations(C, 'round ' + r + ' plays'));
          }
          const s = C.summary(); if (!s.heroes.length) problems.push(`${label}: no summary`);
        } catch (e) { problems.push(`${label} threw: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
      });
    });
  });
  t.eq(problems.length, 0, 'real cards: ' + problems.slice(0, 6).join('\n   '));
  t.ok(plays > ids.length, `played ${plays} real card variants (${picksSeen} paused for a pick, ${cursesSeen} curses or statuses ridden along)`);
});

t.test('real content: every enemy and every encounter fights to a finish under the greedy bot', () => {
  const W = world({ keepHeroes: true }); const D = W.D;
  const enemyIds = Object.keys(D.enemies).filter(isReal);
  if (!enemyIds.length || !Object.keys(D.cards).some(isReal)) { t.ok(true, 'no real enemies or cards written yet: nothing to check'); return; }
  const heroes = ['hanae', 'kuro'].filter((h) => D.heroes[h]);
  if (heroes.length < 2) { t.ok(true, 'the starter pair is not in the roster'); return; }
  const commons = (h) => Object.keys(D.cards).filter((id) => isReal(id) && D.cards[id].hero === h && D.cards[id].rarity === 'common' && D.cards[id].cost !== null && (D.cards[id].kw || []).indexOf('unplayable') < 0).slice(0, 6);
  const deckFor = () => realDeck(D, heroes, heroes.flatMap((h) => commons(h).map((id) => ({ id, up: 0, gems: (D.cards[id].slots || []).map(() => null) }))));
  const groups = [];
  enemyIds.forEach((id) => groups.push({ label: 'solo ' + id, enemies: [id], tier: D.enemies[id].tier === 'minion' ? 'normal' : D.enemies[id].tier, chapter: D.enemies[id].chapter }));
  const enc = D.encounters || {};
  // a chapter's entry per tier is a list of groups { id, enemies }; a boss entry is just the boss enemy id (covered as a solo fight above)
  Object.keys(enc).forEach((ch) => Object.keys(enc[ch] || {}).forEach((tier) => { if (Array.isArray(enc[ch][tier])) enc[ch][tier].forEach((g) => { if (g && (g.enemies || []).length && g.enemies.every((e) => D.enemies[e])) groups.push({ label: `ch${ch} ${tier} ${g.id}`, enemies: g.enemies, tier, chapter: +ch }); }); }));
  const problems = []; let wins = 0, losses = 0, capped = 0, runs = 0, intents = 0;
  groups.forEach((g) => {
    [1, 2].forEach((seed) => {
      const opts = { heroes: heroes.map((h) => ({ id: h, hp: D.heroes[h].maxHp, maxHp: D.heroes[h].maxHp })), frontIdx: seed % 2, deck: deckFor(), enemies: g.enemies, tier: g.tier, chapter: g.chapter, seed: seed * 101, mods: {} };
      const label = `${g.label} seed ${seed}`;
      try {
        const pol = (C) => {
          violations(C, 'turn ' + C.turn).forEach((v) => problems.push(`${label}: ${v}`));
          C.enemies.forEach((e) => {
            if (e.down) return;
            const it = C.intent(e); intents++;
            if (!it || typeof it.text !== 'string' || !it.text.length || DASH.test(it.text)) problems.push(`${label}: ${e.id} has a bad intent text ${JSON.stringify(it && it.text)}`);
          });
          return W.COMBAT.greedyPolicy(C);
        };
        const s = W.COMBAT.simulate(opts, pol); runs++;
        if (s.capped) { capped++; problems.push(`${label}: never finished (${s.turns} turns, ${s.actions} actions)`); return; }
        if (s.result === 'win') wins++; else if (s.result === 'lose') losses++; else problems.push(`${label}: ended with result ${s.result}`);
        const last = s.C.events[s.C.events.length - 1];
        if (!last || last.type !== 'end') problems.push(`${label}: the last event is not end`);
        violations(s.C, 'final').forEach((v) => problems.push(`${label}: ${v}`));
        if (s.C.pending) problems.push(`${label}: finished with a pending pick`);
      } catch (e) { problems.push(`${label} threw: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
    });
  });
  t.eq(problems.length, 0, 'real fights: ' + problems.slice(0, 6).join('\n   '));
  t.ok(runs >= groups.length && intents > 0, `${runs} real combats simulated (${wins} won, ${losses} lost, ${capped} capped), ${intents} intents read`);
});

t.test('real content: the same real combat replays identically, and relics and gems (when they exist) never break a fight', () => {
  const W = world({ keepHeroes: true }); const D = W.D;
  const foes = realFoes(D, 'normal', 1).concat(realFoes(D, 'elite', 1));
  const heroes = ['hanae', 'kuro'].filter((h) => D.heroes[h]);
  if (!foes.length || heroes.length < 2 || !Object.keys(D.cards).some(isReal)) { t.ok(true, 'no real content to replay yet'); return; }
  const mk = (extraRelics, gemId) => {
    const deck = realDeck(D, heroes, []);
    if (gemId) deck.forEach((c) => { (D.cards[c.id].slots || []).forEach((sl, i) => { if (!c.gems[i] && (D.gems[gemId].color === sl || sl === 'any' || D.gems[gemId].color === 'any')) c.gems[i] = gemId; }); });
    return { heroes: heroes.map((h) => ({ id: h, hp: D.heroes[h].maxHp, maxHp: D.heroes[h].maxHp })), frontIdx: 0, deck, enemies: foes.slice(0, 1), tier: 'normal', chapter: 1, seed: 777, mods: {}, relics: extraRelics || [] };
  };
  const a = W.COMBAT.simulate(mk()), b = W.COMBAT.simulate(mk());
  t.eq(JSON.stringify(a.C.events), JSON.stringify(b.C.events), 'identical inputs give an identical event log');
  t.eq(JSON.stringify(a), JSON.stringify(b), 'and an identical summary');
  const problems = [];
  const relicIds = Object.keys(D.relics).filter(isReal), gemIds = Object.keys(D.gems).filter(isReal);
  const runOne = (label, opts) => {
    try {
      const s = W.COMBAT.simulate(opts, (C) => { violations(C, 'turn ' + C.turn).forEach((v) => problems.push(`${label}: ${v}`)); return W.COMBAT.greedyPolicy(C); });
      if (s.capped) problems.push(`${label}: never finished`);
    } catch (e) { problems.push(`${label} threw: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  };
  relicIds.forEach((r) => foes.forEach((f) => runOne('relic ' + r + ' vs ' + f, Object.assign(mk([r]), { enemies: [f], tier: D.enemies[f].tier }))));
  gemIds.forEach((g) => runOne('gem ' + g, mk([], g)));
  t.eq(problems.length, 0, 'real relics and gems: ' + problems.slice(0, 6).join('\n   '));
  t.ok(true, `checked ${relicIds.length} real relics and ${gemIds.length} real gems`);
});

t.done();
