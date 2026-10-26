// Stacking Cats: simulation rules (roster, merging, choices, every cat attacks, nests, determinism).
import assert from 'node:assert/strict';
import {
  newGame, addCat, mergeCats, mergePairs, swapCats, moveCat, releaseCat, rollCatChoices, rollSnackChoices, eatSnack,
  startWave, step, runSeconds, makeEnemy, catMaxHp, aliveCats, calcMods, useZoomies, TUNE, GROUND,
} from '../stacking_cats/sim.js';
import { CATS, CAT_BY_ID, STARTERS, SNACKS, MAX_STACK, MAX_BENCH, checkUnlocks, emptyStats, mergeRun, unlockProgress, ENEMY_TYPES } from '../stacking_cats/cats.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const ALL = CATS.map((c) => c.id);

t('data: 30 cats, 5 starters, unique ids, every cat has a handled attack', () => {
  assert.equal(CATS.length, 30);
  assert.equal(STARTERS.length, 5);
  assert.equal(new Set(ALL).size, 30);
  const kinds = new Set(['melee', 'proj', 'lob', 'cone', 'chain', 'beam', 'strike', 'nova', 'mine', 'storm', 'spread']);
  for (const c of CATS) {
    assert.ok(kinds.has(c.atk.t), c.id + ' attack kind');
    assert.ok(c.art && c.art.fur, c.id + ' art');
    assert.ok(c.desc.length > 10 && c.name && c.title && c.role, c.id + ' text');
    assert.ok(!/—/.test(JSON.stringify(c)), c.id + ' em dash');
    assert.equal(!!c.unlock, !STARTERS.includes(c.id));
  }
});

t('snacks: perm, temp and instant exist, all have text', () => {
  for (const k of ['perm', 'temp', 'instant']) assert.ok(SNACKS.some((s) => s.kind === k), k);
  for (const s of SNACKS) assert.ok(s.name && s.icon && s.desc, s.id);
});

t('snacks: Berry Smoothie gives attack speed and range for 3 waves', () => {
  const g = newGame({ seed: 7 });
  addCat(g, 'tabby');
  const base = calcMods(g);
  eatSnack(g, 'smoothie');
  const m = calcMods(g);
  assert.ok(m.haste > base.haste && m.range > base.range, 'both bonuses apply');
  for (let i = 0; i < 3; i++) { startWave(g); g.enemies = []; g.queue = []; step(g, 3); step(g, 0.1); }
  assert.equal(g.temp.length, 0, 'it wears off after three waves');
});

t('snacks: Rice Ball is a permanent snack that adds a little damage and health together', () => {
  const sn = SNACKS.find((x) => x.id === 'rice');
  assert.ok(sn && sn.kind === 'perm', 'rice ball exists as a permanent snack');
  const g = newGame({ seed: 7 });
  addCat(g, 'tabby');
  const base = calcMods(g), mx = catMaxHp(g, g.cats[0]);
  eatSnack(g, 'rice');
  const m = calcMods(g);
  assert.ok(m.dmg > base.dmg && catMaxHp(g, g.cats[0]) > mx, 'more damage and more health');
  for (let i = 0; i < 4; i++) { startWave(g); g.enemies = []; g.queue = []; step(g, 3); step(g, 0.1); }
  assert.equal(g.perm.length, 1, 'it lasts the whole run');
});

t('addCat: stack, auto-merge equals, bench, then refuses', () => {
  const g = newGame({ seed: 3 });
  assert.ok(addCat(g, 'tabby').ok);
  const r = addCat(g, 'tabby');
  assert.ok(r.merged);
  assert.equal(g.cats.length, 1);
  assert.equal(g.cats[0].lvl, 2);
  for (const id of ['ember', 'sparky', 'buckshot', 'mochi']) assert.ok(addCat(g, id).ok);
  assert.equal(g.cats.length, MAX_STACK);
  const bench = ['yuki', 'hawkeye', 'boomer', 'pudding'];
  for (const id of bench) { const x = addCat(g, id); assert.ok(x.ok && x.benched); }
  assert.equal(g.bench.length, MAX_BENCH);
  assert.equal(addCat(g, 'shadow').ok, false);
  assert.equal(g.run.merges, 1);
});

t('merging: same cat and level only, up to level 3, cascades, hp rises', () => {
  const g = newGame({ seed: 4 });
  addCat(g, 'ember'); addCat(g, 'ember');               // -> lvl2
  addCat(g, 'sparky');
  const e2 = g.cats[0];
  assert.equal(e2.lvl, 2);
  const hp2 = catMaxHp(g, e2);
  addCat(g, 'ember');                                    // lvl1 ember beside lvl2: no merge
  assert.equal(g.cats.filter((c) => c.id === 'ember').length, 2);
  addCat(g, 'ember');                                    // two lvl1 merge, then lvl2+lvl2 cascade -> lvl3
  assert.equal(g.cats.filter((c) => c.id === 'ember').length, 1);
  assert.equal(g.cats.find((c) => c.id === 'ember').lvl, 3);
  assert.ok(catMaxHp(g, g.cats[0]) > hp2 * 2);
  assert.ok(g.run.lvl3Of.ember);
  assert.equal(mergeCats(g, g.cats[0].uid, g.cats[0].uid), false);
  const s = g.cats.find((c) => c.id === 'sparky');
  assert.equal(mergeCats(g, g.cats[0].uid, s.uid), false);
});

t('manual: swap, move, release, mergePairs', () => {
  const g = newGame({ seed: 5 });
  for (const id of ['tabby', 'ember', 'sparky']) addCat(g, id);
  const [a, b] = g.cats;
  assert.ok(swapCats(g, a.uid, b.uid));
  assert.equal(g.cats[0].id, 'ember');
  assert.ok(moveCat(g, a.uid, 'bench'));
  assert.equal(g.bench.length, 1);
  assert.ok(moveCat(g, a.uid, 'tower'));
  assert.ok(releaseCat(g, a.uid));
  assert.equal(g.cats.length, 2);
  assert.deepEqual(mergePairs(g), []);
});

t('choices: 3 distinct unlocked cats, extra snack with a pirate', () => {
  const g = newGame({ seed: 6 });
  for (let i = 0; i < 40; i++) {
    const c = rollCatChoices(g);
    assert.equal(new Set(c).size, 3);
    for (const id of c) assert.ok(STARTERS.includes(id));
    const s = rollSnackChoices(g);
    assert.equal(s.length, 3);
    assert.equal(new Set(s).size, 3);
  }
  const g2 = newGame({ seed: 6, unlocked: ALL });
  addCat(g2, 'cutlass');
  assert.equal(rollSnackChoices(g2).length, 4);
  assert.ok(rollCatChoices(g2).every((id) => ALL.includes(id)));
});

t('snacks: perm lasts, temp expires after 3 waves, tuna raises hp, mega tuna heals', () => {
  const g = newGame({ seed: 7 });
  addCat(g, 'tabby');
  const c = g.cats[0];
  const mx = catMaxHp(g, c);
  eatSnack(g, 'tuna');
  assert.ok(catMaxHp(g, c) > mx);
  assert.ok(c.hp > mx);
  eatSnack(g, 'pepper');
  assert.ok(calcMods(g).dmg >= 0.45);
  c.hp = 10;
  eatSnack(g, 'megatuna');
  assert.ok(c.hp > 40);
  for (let i = 0; i < 3; i++) { startWave(g); g.enemies = []; g.queue = []; step(g, 3); step(g, 0.1); }
  assert.equal(g.temp.length, 0);
  assert.equal(g.perm.length, 1);
  assert.equal(g.run.snacks, 3);
  assert.equal(g.run.temp, 1);
});

t('every cat, alone, damages or helps against a mouse', () => {
  for (const id of ALL) {
    const g = newGame({ seed: 11, unlocked: ALL });
    addCat(g, id);
    if (CAT_BY_ID[id].sup) { addCat(g, 'tabby'); g.cats[1].hp = 20; }
    startWave(g); g.state = 'fight'; g.queue = [];
    const e = makeEnemy(g, 'mouse', 1, { x: 330 }); e.hp = e.maxHp = 400;
    const bench = makeEnemy(g, 'mouse', 1, { x: 400 }); bench.hp = bench.maxHp = 400;
    g.enemies.push(e, bench);
    let ok = false;
    for (let i = 0; i < 30 * 12; i++) {
      step(g);
      if (e.hp < 400 || bench.hp < 400 || e.dead) { ok = true; break; }
    }
    assert.ok(ok, id + ' never hurt an enemy');
  }
});

t('healer heals, angel revives, king/bard auras apply, witch curses', () => {
  const g = newGame({ seed: 12, unlocked: ALL });
  addCat(g, 'mochi'); addCat(g, 'pudding');
  g.cats[0].hp = 30;
  startWave(g); g.state = 'fight'; g.queue = [];
  g.enemies.push(makeEnemy(g, 'mouse', 1, { x: 600 }));
  for (let i = 0; i < 90; i++) step(g);
  assert.ok(g.cats[0].hp > 30, 'healed');
  const h = newGame({ seed: 13, unlocked: ALL });
  for (const id of ['tabby', 'halo']) addCat(h, id);
  startWave(h); h.state = 'fight'; h.queue = [];
  h.cats[0].hp = 1;
  h.enemies.push(makeEnemy(h, 'brute', 1, { x: 230 }));
  for (let i = 0; i < 90 && !h.cats[0].ko && h.cats[0].hp > 0; i++) step(h);
  assert.ok(h.ev.some((e) => e.k === 'revive' || e.k === 'ko'));
  const a = newGame({ seed: 14, unlocked: ALL });
  const base = calcMods(a);
  for (const id of ['lyra', 'leo', 'hexa', 'nori']) addCat(a, id);
  const m = calcMods(a);
  assert.ok(m.haste > base.haste && m.dmg > base.dmg && m.curse > 0 && m.snackMul > 1);
});

t('a nest wave: nest spawns mice, can be destroyed, ends the wave with a cat reward', () => {
  const g = newGame({ seed: 21, unlocked: ALL, events: false });
  for (const id of ['tabby', 'ember', 'sparky', 'buckshot', 'mochi']) addCat(g, id);
  g.wave = 4;
  startWave(g);
  assert.equal(g.bossWave, true);
  const nest = g.enemies.find((e) => e.boss);
  assert.ok(nest && nest.hp > 500);
  nest.hp = nest.maxHp = 3000;
  let spawned = 0, seen = new Set(), minNest = 999;
  for (let i = 0; i < 30 * 120 && g.state !== 'clear' && g.state !== 'over'; i++) {
    step(g);
    minNest = Math.min(minNest, nest.x);
    for (const e of g.enemies) if (!e.boss) seen.add(e.uid);
    for (const c of g.cats) { c.ko = false; c.hp = 9999; }
  }
  spawned = seen.size;
  assert.equal(g.state, 'clear');
  assert.ok(spawned >= 5, 'nest spawned ' + spawned);
  assert.deepEqual(g.reward, ['cat', 'item', 'snack']);
  assert.equal(g.run.bossKills, 1);
  assert.ok(minNest < 450, 'the world scrolled the nest toward the stack: ' + minNest);
});

t('game over when the whole stack is down, nine lives saves once', () => {
  const g = newGame({ seed: 31, events: false });
  addCat(g, 'tabby');
  startWave(g); g.state = 'fight'; g.queue = [];
  const mk = () => { const e = makeEnemy(g, 'brute', 30, { x: 230 }); e.dmg = 9999; return e; };
  g.nineLives = 1;
  g.enemies.push(mk());
  for (let i = 0; i < 30 * 10 && g.state === 'fight' && g.nineLives; i++) step(g);
  assert.equal(g.nineLives, 0);
  assert.equal(g.state, 'fight');
  g.enemies.push(mk());
  for (let i = 0; i < 30 * 10 && g.state === 'fight'; i++) step(g);
  assert.equal(g.state, 'over');
});

t('waves are deterministic per seed and scale up', () => {
  const sig = (seed) => { const g = newGame({ seed, events: false }); addCat(g, 'tabby'); g.wave = 7; startWave(g); return g.queue.map((q) => q.type + q.elite + q.t.toFixed(2)).join(','); };
  assert.equal(sig(9), sig(9));
  assert.notEqual(sig(9), sig(10));
  const sizes = [1, 6, 12, 18, 28].map((w) => { const g = newGame({ seed: 2, events: false }); g.wave = w - 1; startWave(g); return g.queue.length; });
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1], 'more enemies later ' + sizes);
  assert.ok(ENEMY_TYPES.mouse.minWave === 1);
});

t('zoomies: needs a full meter, then speeds the stack up', () => {
  const g = newGame({ seed: 41 });
  addCat(g, 'tabby');
  startWave(g); g.state = 'fight';
  assert.equal(useZoomies(g), false);
  g.zoom = 100;
  assert.ok(useZoomies(g));
  assert.ok(calcMods(g).haste >= 1);
  assert.equal(g.zoom, 0);
});

t('unlocks: stat rules, run merge, Ember lv3 unlocks Volcano', () => {
  let st = emptyStats();
  const un = new Set(STARTERS);
  assert.deepEqual(checkUnlocks(st, un), []);
  st = mergeRun(st, { kills: 400, bossKills: 1, recruits: 3, merges: 0, lvl3: 0, lvl3Of: { ember: true }, snacks: 0, temp: 0, flawless: 0, wave: 7 });
  const fresh = checkUnlocks(st, un);
  for (const id of ['yuki', 'hawkeye', 'boomer', 'volcano']) assert.ok(fresh.includes(id), id);
  assert.ok(!fresh.includes('shadow'));
  assert.equal(st.runs, 1);
  assert.deepEqual(unlockProgress(CAT_BY_ID.shadow, st), { have: 7, need: 10 });
});

console.log(`${n} tests passed`);
