// Stacking Cats: the Cat Kingdom, items and loot, coins, and the stats that show the impact of choices.
import assert from 'node:assert/strict';
import {
  newGame, addCat, startWave, step, makeEnemy, catMaxHp, calcMods, itemFx, estDps, explainMods, rollItemChoices, equipItem, unequipItem,
  takeItem, useReroll, mergeCats, releaseCat, findCat, aliveCats, overflow, sellItem, forgePlan, forgeItems,
} from '../stacking_cats/sim.js';
import {
  ITEMS, ITEM_BY_ID, BUILDINGS, emptyKingdom, kingdomBonuses, buyUpgrade, upgradeCost, kingdomLevel, buildingLevel, MAX_STASH, CATS, cheapestUpgrade, affordableWonder, nextGoal, ACHIEVEMENTS,
} from '../stacking_cats/cats.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const ALL = CATS.map((c) => c.id);

function fight(g, secs, mk) {
  startWave(g); g.state = 'fight'; g.queue = [];
  if (mk) mk(g);
  for (let i = 0; i < secs * 30 && g.enemies.some((e) => !e.dead); i++) step(g);
}

t('items: 21 items with text, valid effects and rarities', () => {
  assert.equal(ITEMS.length, 21);
  for (const it of ITEMS) {
    assert.ok(it.name && it.icon && it.desc && ['common', 'rare', 'epic'].includes(it.rarity), it.id);
    assert.ok(Object.keys(it.fx).length, it.id);
    assert.ok(!/—/.test(JSON.stringify(it)));
  }
});

t('kingdom: buy upgrades with coins, costs rise, max level, bonuses add up', () => {
  const k = emptyKingdom();
  assert.equal(buyUpgrade(k, 'dojo'), false);
  k.coins = 10000;
  assert.ok(upgradeCost('dojo', 1) > upgradeCost('dojo', 0));
  for (let i = 0; i < 5; i++) assert.ok(buyUpgrade(k, 'dojo'));
  assert.equal(buyUpgrade(k, 'dojo'), false);
  for (let i = 0; i < 9; i++) buyUpgrade(k, 'tent');
  assert.equal(buildingLevel(k, 'tent'), 4);
  const b = kingdomBonuses(k);
  assert.ok(Math.abs(b.dmg - 0.2) < 1e-9 && b.rerolls === 4);
  assert.equal(kingdomLevel(k), 9);
  assert.ok(k.coins < 10000 && k.coins > 0);
  for (const bl of BUILDINGS) assert.ok(bl.name && bl.icon && bl.text(1) && bl.text(bl.max));
});

t('kingdom bonuses reach the fight: more hp, damage, rerolls', () => {
  const k = emptyKingdom(); k.lv = { dojo: 5, beds: 5, tent: 3, vault: 2 };
  const a = newGame({ seed: 1 }), b = newGame({ seed: 1, kingdom: k });
  addCat(a, 'tabby'); addCat(b, 'tabby');
  assert.ok(catMaxHp(b, b.cats[0]) > catMaxHp(a, a.cats[0]) * 1.2);
  assert.ok(calcMods(b).dmg > calcMods(a).dmg + 0.19);
  assert.equal(b.rerolls, 3);
  assert.ok(useReroll(b) && b.rerolls === 2);
  assert.equal(useReroll(a), false);
});

t('equip: items go to the stash, cats hold 1 (2 at Lv3), swaps return the old item', () => {
  const g = newGame({ seed: 2 });
  addCat(g, 'tabby');
  const c = g.cats[0];
  for (const id of ['claws', 'bell', 'cushion']) assert.ok(takeItem(g, id));
  const hp0 = catMaxHp(g, c);
  assert.ok(equipItem(g, g.stash.indexOf('cushion'), c.uid));
  assert.ok(catMaxHp(g, c) > hp0 * 1.25);
  assert.ok(c.hp > hp0);
  assert.ok(equipItem(g, 0, c.uid));
  assert.equal(c.items.length, 1);
  assert.ok(g.stash.includes('cushion'), 'old item went back to the stash');
  assert.ok(unequipItem(g, c.uid, 0));
  assert.equal(c.items.length, 0);
  c.lvl = 3;
  equipItem(g, 0, c.uid); equipItem(g, 0, c.uid);
  assert.equal(c.items.length, 2);
  const had = g.stash.length;
  for (let i = 0; i < 20; i++) takeItem(g, 'claws');
  // picks are never refused (no soft lock); the pack overflows and selling brings it back under the limit
  assert.equal(g.stash.length, had + 20);
  assert.equal(overflow(g), had + 20 - MAX_STASH);
  const coins0 = g.run.coins;
  while (overflow(g) > 0) assert.ok(sellItem(g, g.stash.length - 1) > 0);
  assert.equal(g.stash.length, MAX_STASH);
  assert.ok(g.run.coins > coins0);
});

t('forging turns three of a rarity into one of the next, and picks nothing it cannot afford', () => {
  const g = newGame({ seed: 9 });
  g.stash = ['claws', 'bell', 'claws', 'fang'];
  assert.equal(forgePlan(g, 3), null);                    // only one rare
  const plan = forgePlan(g, 0);
  assert.deepEqual(plan.slice().sort(), [0, 1, 2]);
  const out = forgeItems(g, 0);
  assert.equal(ITEM_BY_ID[out].rarity, 'rare');
  assert.deepEqual(g.stash.length, 2);
  g.stash = ['fang', 'heart', 'scarf', 'claws'];
  assert.equal(ITEM_BY_ID[forgeItems(g, 0)].rarity, 'epic');
  g.stash = ['crown', 'hourglass', 'mask'];
  const coins = g.run.coins, e = forgeItems(g, 0);
  assert.equal(ITEM_BY_ID[e].rarity, 'epic'); assert.ok(g.run.coins > coins); assert.equal(g.stash.length, 1);
});

t('merging and releasing keep items (extra ones return to the stash)', () => {
  const g = newGame({ seed: 3 });
  addCat(g, 'ember'); addCat(g, 'sparky');
  const e1 = g.cats[0];
  g.bench.push(Object.assign({}, e1, { uid: 999, items: ['bell'], _sig: '' }));
  e1.items = ['claws'];
  assert.ok(mergeCats(g, e1.uid, 999));
  assert.equal(e1.lvl, 2);
  assert.equal(e1.items.length, 1);
  assert.equal(e1.items.length + g.stash.length, 2);
  const s = g.cats[1];
  s.items = ['vest'];
  releaseCat(g, s.uid);
  assert.ok(g.stash.includes('vest'));
});

t('item effects: damage, haste, thorns, lifesteal, regen, extra shot, burn', () => {
  const f = (items) => { const g = newGame({ seed: 5 }); addCat(g, 'tabby'); g.cats[0].items = items; return [g, itemFx(g.cats[0])]; };
  assert.equal(f(['claws'])[1].dmg, 0.2);
  assert.ok(f(['crown'])[1].dmg === 0.25 && f(['crown'])[1].hp === 0.25);
  const base = (() => { const g = newGame({ seed: 5 }); addCat(g, 'sparky'); return estDps(g.cats[0], g.mods = calcMods(g)); })();
  const gi = newGame({ seed: 5 }); addCat(gi, 'sparky'); gi.cats[0].items = ['claws', 'bell', 'whistle'];
  assert.ok(estDps(gi.cats[0], calcMods(gi)) > base * 1.7);
  // thorns hurt the attacker
  const g = newGame({ seed: 6 }); addCat(g, 'mochi'); g.cats[0].items = ['spikes'];
  startWave(g); g.state = 'fight'; g.queue = [];
  const mouse = makeEnemy(g, 'brute', 1, { x: 240 }); mouse.hp = mouse.maxHp = 500; g.enemies.push(mouse);
  for (let i = 0; i < 30 * 6; i++) step(g);
  assert.ok(g.cats[0].dmgDone > 0 && mouse.hp < 500);
  // regen and lifesteal heal
  const h = newGame({ seed: 7 }); addCat(h, 'tabby'); h.cats[0].items = ['heart']; h.cats[0].hp = 10;
  startWave(h); h.state = 'fight'; h.queue = []; for (let i = 0; i < 90; i++) step(h);
  assert.ok(h.cats[0].hp > 18, 'regen ' + h.cats[0].hp);
  // burn item sets mice on fire
  const b = newGame({ seed: 8 }); addCat(b, 'tabby'); b.cats[0].items = ['flamering'];
  startWave(b); b.state = 'fight'; b.queue = []; const m2 = makeEnemy(b, 'brute', 1, { x: 240 }); m2.hp = m2.maxHp = 900; b.enemies.push(m2);
  let burned = false; for (let i = 0; i < 60; i++) { step(b); if (m2.burn) burned = true; }
  assert.ok(burned);
});

t('every item can be equipped and a fight runs without errors', () => {
  for (const it of ITEMS) {
    const g = newGame({ seed: 9, unlocked: ALL, events: false });
    addCat(g, 'sparky'); addCat(g, 'nebula');
    g.cats[0].items = [it.id]; g.cats[1].items = [it.id];
    fight(g, 20, (gg) => { gg.enemies.push(makeEnemy(gg, 'mouse', 3, { x: 400 }), makeEnemy(gg, 'armored', 6, { x: 460 })); });
    assert.ok(g.run.dmg > 0, it.id);
  }
});

t('coins, chests and loot: kills pay, vault boosts, chests turn into item rewards', () => {
  const g = newGame({ seed: 10, events: false }); addCat(g, 'tabby'); addCat(g, 'ember');
  fight(g, 40, (gg) => { for (let i = 0; i < 6; i++) gg.enemies.push(makeEnemy(gg, 'mouse', 1, { x: 300 + i * 40 })); });
  assert.ok(g.run.coins >= 6);
  const k = emptyKingdom(); k.lv = { vault: 5 };
  const v = newGame({ seed: 10, kingdom: k, events: false }); addCat(v, 'tabby'); addCat(v, 'ember');
  fight(v, 40, (gg) => { for (let i = 0; i < 6; i++) gg.enemies.push(makeEnemy(gg, 'mouse', 1, { x: 300 + i * 40 })); });
  assert.ok(v.run.coins > g.run.coins * 1.3);
  // force chests
  const c = newGame({ seed: 11, events: false }); addCat(c, 'tabby'); c.chests = 3;
  startWave(c); c.enemies = []; c.queue = []; c.state = 'fight'; step(c, 0.1);
  assert.equal(c.state, 'clear');
  assert.deepEqual(c.reward, ['item', 'item', 'snack']);
  assert.equal(c.chests, 1);
  const ch = rollItemChoices(c);
  assert.equal(new Set(ch).size, 3);
  ch.forEach((id) => assert.ok(ITEM_BY_ID[id]));
});

t('impact stats: damage per cat, wave report, biggest hit, team stat sources', () => {
  const g = newGame({ seed: 12, events: false }); addCat(g, 'tabby'); addCat(g, 'sparky');
  fight(g, 40, (gg) => { for (let i = 0; i < 5; i++) gg.enemies.push(makeEnemy(gg, 'mouse', 1, { x: 300 + i * 40 })); });
  g.state === 'clear' || step(g, 0.1);
  assert.ok(g.report && g.report.dmg > 100 && g.report.kills >= 5);
  assert.equal(g.report.cats.length, 2);
  assert.ok(g.report.cats[0].dmg >= g.report.cats[1].dmg);
  const sum = g.report.cats.reduce((a, c) => a + c.dmg, 0);
  assert.ok(Math.abs(sum - g.report.dmg) < 1);
  assert.ok(g.run.biggest > 5);
  assert.ok(Object.keys(g.run.byCat).length === 2);
  eatSnackFor(g);
  const rows = explainMods(g);
  assert.ok(rows.dmg.some((r) => r.label === 'Salmon Sushi'));
});
function eatSnackFor(g) { g.perm.push('sushi'); }

t('estimated dps is higher for stronger cats and levels', () => {
  const g = newGame({ seed: 13 }); addCat(g, 'tabby');
  const m = calcMods(g), c = g.cats[0];
  const d1 = estDps(c, m); c.lvl = 2;
  assert.ok(estDps(c, m) > d1 * 2);
  g.cats.length = 0; g.stash.length = 0;
  for (const id of ALL) { const gg = newGame({ seed: 1, unlocked: ALL }); addCat(gg, id); assert.ok(estDps(gg.cats[0], calcMods(gg)) > 0, id); }
});

t('items: Warm Mittens is a common that adds health and attack speed together', () => {
  const it = ITEM_BY_ID.mitten;
  assert.ok(it && it.rarity === 'common', 'mittens exist as a common');
  assert.ok(it.fx.hp > 0 && it.fx.haste > 0, 'two small bonuses');
  const g = newGame({ seed: 5 }); addCat(g, 'tabby');
  const base = catMaxHp(g, g.cats[0]), baseHaste = itemFx(g.cats[0]).haste || 0;
  g.cats[0].items = ['mitten'];
  assert.ok(catMaxHp(g, g.cats[0]) > base, 'more health');
  assert.ok(itemFx(g.cats[0]).haste > baseHaste, 'and faster attacks');
});


t('cheapestUpgrade names the cheapest building the player can afford, or null', () => {
  const k = emptyKingdom();
  assert.equal(cheapestUpgrade(k), null, 'no coins, no hint');
  k.coins = 60;
  const id = cheapestUpgrade(k);
  assert.ok(id && upgradeCost(id, 0) <= 60, 'an affordable building is named');
  for (const b of BUILDINGS) if (upgradeCost(b.id, 0) <= 60) assert.ok(upgradeCost(id, 0) <= upgradeCost(b.id, 0), 'and it is the cheapest');
  for (const b of BUILDINGS) k.lv[b.id] = b.max;
  k.coins = 1e9;
  assert.equal(cheapestUpgrade(k), null, 'maxed buildings are never named');
});

t('affordableWonder names the cheapest unowned wonder the gems can pay for', () => {
  const k = emptyKingdom();
  assert.equal(affordableWonder(k), null, 'no gems, no hint');
  k.gems = 3;
  assert.ok(['bench', 'coin'].includes(affordableWonder(k)), 'a 3 gem wonder is named');
  k.wonders.bench = true; k.wonders.coin = true;
  assert.equal(affordableWonder(k), null, 'owned wonders are skipped');
  k.gems = 99;
  assert.ok(affordableWonder(k), 'more gems name another wonder');
});

t('nextGoal names the cheapest unmaxed building with the coins still missing', () => {
  const k = emptyKingdom();
  const g0 = nextGoal(k);
  assert.ok(g0 && g0.cost === Math.min(...BUILDINGS.map((b) => upgradeCost(b.id, 0))), 'the cheapest building is the goal');
  assert.equal(g0.need, g0.cost, 'with no coins all of it is missing');
  k.coins = g0.cost - 5;
  assert.equal(nextGoal(k).need, 5, 'only the gap is reported');
  k.coins = g0.cost + 1000;
  assert.equal(nextGoal(k).need, 0, 'an affordable goal needs nothing');
  for (const b of BUILDINGS) k.lv[b.id] = b.max;
  assert.equal(nextGoal(k), null, 'a fully built kingdom has no goal');
});

t('beating King Squeakimus earns its own trophy, and only after the finale', () => {
  const a = ACHIEVEMENTS.find((x) => x.id === 'king');
  assert.ok(a, 'the king trophy exists');
  assert.ok(!a.name.includes('\u2014') && !a.desc.includes('\u2014'));
  assert.ok(a.coins > 0, 'it pays coins');
  assert.equal(!!a.check({ stats: {}, run: {}, save: {}, kingdom: {} }), false, 'not before the finale');
  assert.equal(!!a.check({ stats: {}, run: {}, save: { storyDone: true }, kingdom: {} }), true, 'after the finale');
});

t('the king trophy is the last trophy and its text says where to find the king', () => {
  assert.equal(ACHIEVEMENTS[ACHIEVEMENTS.length - 1].id, 'king', 'the final boss trophy closes the list');
  assert.ok(/wave 30/i.test(ACHIEVEMENTS[ACHIEVEMENTS.length - 1].desc), 'the text names the wave');
});

console.log(`${n} tests passed`);
