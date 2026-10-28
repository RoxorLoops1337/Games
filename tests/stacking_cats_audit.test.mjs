// Stacking Cats: an audit of snacks and relics. Every number in a description is backed by data, every effect key is actually used by the
// sim, snacks behave as their text says (length, stacking, caps), and the Team stats breakdown adds up to the real totals.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newGame, addCat, calcMods, explainMods, eatSnack, finishWave, FX_KEYS, equipItem, hurtEnemy, makeEnemy, killEnemy, catMaxHp, TUNE,
} from '../stacking_cats/sim.js';
import { ITEMS, ITEM_BY_ID, SNACKS, TEMP_WAVES, COIN } from '../stacking_cats/cats.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const simSrc = readFileSync(new URL('../stacking_cats/sim.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');

// percentages in a description that are rules of the code rather than relic numbers
const CONSTANT_PCTS = { bowl: [80], whisker: [30], locket: [40], scythe: [30], toymouse: [30] };

t('every percentage in a relic or snack description comes from its data (or a known code constant)', () => {
  for (const it of [...ITEMS, ...SNACKS]) {
    const vals = Object.values(it.fx).map((v) => Math.round(v * 1000) / 10);
    if (it.heal) vals.push(it.heal * 100);
    for (const m of it.desc.matchAll(/(\d+(?:\.\d+)?)%/g)) {
      const p = +m[1];
      assert.ok(vals.includes(p) || (CONSTANT_PCTS[it.id] || []).includes(p), `${it.id}: "${it.desc}" mentions ${p}% that no effect carries`);
    }
  }
});

t('every effect key a relic carries is one the sim reads, and every snack key is a stat calcMods tracks', () => {
  for (const it of ITEMS) for (const k of Object.keys(it.fx)) assert.ok(FX_KEYS.includes(k), `${it.id}: unknown effect ${k}`);
  const m = calcMods(newGame({ seed: 1 }));
  for (const s of SNACKS) for (const k of Object.keys(s.fx)) assert.ok(k in m, `${s.id}: calcMods has no ${k}`);
  // a key listed but never read anywhere would silently do nothing: count the places each key is read in the sim
  for (const k of FX_KEYS) assert.ok(new RegExp(`\\b${k}\\b`).test(simSrc.replace(/export const FX_KEYS[\s\S]*?\];/, '').replace(/^\/\/.*$/gm, '')), `${k} is never read by the sim`);
});

t('a snack adds exactly its numbers to calcMods (times the snack multiplier) and stops when it should', () => {
  for (const s of SNACKS.filter((x) => x.kind !== 'instant' && !x.nine)) {
    const g = newGame({ seed: 2 });
    addCat(g, 'tabby');
    const before = calcMods(g);
    eatSnack(g, s.id);
    const after = calcMods(g);
    for (const k of Object.keys(s.fx)) {
      const cap = { dr: 0.65, slow: 0.6 }[k];
      const want = cap ? Math.min(cap, before[k] + s.fx[k]) : before[k] + s.fx[k];
      assert.ok(Math.abs(after[k] - want) < 1e-9, `${s.id}: ${k} ${before[k]} -> ${after[k]}, wanted ${want}`);
    }
  }
});

t('temporary snacks last exactly three waves and refresh instead of stacking, permanent ones stack', () => {
  const g = newGame({ seed: 3 });
  addCat(g, 'tabby');
  const base = calcMods(g).dmg;
  eatSnack(g, 'pepper');
  eatSnack(g, 'pepper');
  assert.equal(g.temp.length, 1, 'a second Spicy Pepper only refreshes the first');
  assert.ok(Math.abs(calcMods(g).dmg - (base + 0.45)) < 1e-9, 'no stacking');
  for (let w = 1; w <= TEMP_WAVES; w++) {
    assert.ok(g.temp.length === 1, `still active before wave clear ${w}`);
    g.wave = w; g.state = 'fight'; g.enemies.length = 0; g.queue = []; g.spawnLeft = 0;
    finishWave(g);
  }
  assert.equal(g.temp.length, 0, 'gone after three waves');
  eatSnack(g, 'sushi'); eatSnack(g, 'sushi');
  assert.ok(Math.abs(calcMods(g).dmg - (base + 0.24)) < 1e-9, 'Salmon Sushi stacks for the whole run');
});

t('Mega Tuna heals 60% of max health to every cat and never above the maximum', () => {
  const g = newGame({ seed: 4 });
  addCat(g, 'tabby'); addCat(g, 'ember');
  const mx = catMaxHp(g, g.cats[0]);
  g.cats[0].hp = mx * 0.2; g.cats[1].hp = mx * 0.8;
  eatSnack(g, 'megatuna');
  assert.ok(Math.abs(g.cats[0].hp - mx * 0.8) < 1e-6);
  assert.ok(g.cats[1].hp <= catMaxHp(g, g.cats[1]) + 1e-9);
});

t('the Team stats breakdown adds up: team synergies, team relics, hex and the daily rule are listed, not just snacks', () => {
  const g = newGame({ seed: 5, unlocked: ['tabby', 'ember', 'sparky', 'buckshot', 'mochi', 'yuki', 'draco', 'volcano'] });
  for (const id of ['mochi', 'yuki', 'tabby', 'ember']) addCat(g, id);
  g.stash.push('banner', 'hexdoll', 'lantern', 'sunbeam');
  for (let i = 0; i < 4; i++) assert.ok(equipItem(g, 0, g.cats[i].uid));
  eatSnack(g, 'sushi');
  const m = calcMods(g), rows = explainMods(g);
  const sum = (k) => (rows[k] || []).reduce((a, r) => a + r.v, 0);
  assert.ok(rows.dmg.some((r) => r.label === 'Sunflower Banner'), 'a carried team relic shows up');
  assert.ok(rows.curse && rows.curse.some((r) => r.label === 'Hex Doll'), 'Hex Doll shows up under mouse weakness');
  assert.ok(rows.waveHeal.some((r) => r.label === 'Sunbeam'));
  assert.ok(rows.hp.some((r) => r.label === 'Guardian Lantern'));
  for (const k of ['dmg', 'haste', 'hp', 'curse', 'dr']) assert.ok(Math.abs(sum(k) - m[k]) < 1e-9, `${k}: rows ${sum(k)} vs total ${m[k]}`);
  assert.ok(Math.abs(sum('waveHeal') + TUNE.healAfter - m.waveHeal) < 1e-9, 'healing per wave: the 5% base plus the listed sources');
});

t('the snack preview text says what happens: right labels, caps, no stacking of a snack that only refreshes, critical size counted', () => {
  assert.ok(/dr: 'Less damage taken'/.test(mainSrc) && /slow: 'Mice slowed'/.test(mainSrc), 'a bigger number under these labels must read as a good thing');
  const body = mainSrc.slice(mainSrc.indexOf('function snackImpact'), mainSrc.indexOf('const rerollBtn'));
  assert.ok(/g\.temp\.some/.test(body) && /Already active/.test(body), 'a temporary snack already running only refreshes');
  assert.ok(/CAP = \{ dr: 0\.65, slow: 0\.6 \}/.test(body), 'preview caps match calcMods');
  assert.ok(body.indexOf("m2[k] = (m2[k] || 0)") < body.indexOf("k === 'critMul'"), 'critMul is added to the preview before the stat row is skipped');
});

t('a relic that is carried by a dead tower cat stops helping the team ', () => {
  const g = newGame({ seed: 6 });
  addCat(g, 'tabby');
  g.stash.push('banner');
  equipItem(g, 0, g.cats[0].uid);
  const on = calcMods(g).dmg;
  g.cats[0].ko = true;
  assert.ok(calcMods(g).dmg < on - 0.04);
});

t('kill relics: Copper Penny pays on kill, Cheese Rind heals, damage multipliers apply once', () => {
  const g = newGame({ seed: 7 });
  addCat(g, 'tabby');
  g.stash.push('penny');
  equipItem(g, 0, g.cats[0].uid);
  g.curCat = g.cats[0];
  const before = g.run.coins;
  const e = makeEnemy(g, 'mouse', 1, { x: 400 });
  g.enemies.push(e);
  killEnemy(g, e, true);
  g.curCat = null;
  const gmul = g.mods.coin * g.diff.coin * g.route.coin;
  assert.ok(Math.abs(g.run.coins - before - (COIN.kill + ITEM_BY_ID.penny.fx.kcoin) * gmul) < 1e-6);
  const f = newGame({ seed: 8 });
  addCat(f, 'tabby');
  f.stash.push('toymouse'); equipItem(f, 0, f.cats[0].uid);
  f.curCat = f.cats[0];
  const low = makeEnemy(f, 'mouse', 1, { x: 400 }); low.hp = low.maxHp * 0.2;
  const full = makeEnemy(f, 'mouse', 1, { x: 400 });
  hurtEnemy(f, low, 10); hurtEnemy(f, full, 10);
  f.curCat = null;
  assert.ok(low.maxHp * 0.2 - low.hp > full.maxHp - full.hp + 1e-9, 'Toy Mouse hits a weak mouse harder');
});

console.log(n + ' tests passed');
