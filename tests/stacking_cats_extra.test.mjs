// Stacking Cats: difficulty, synergies, routes, the daily challenge, wonders and achievements.
import assert from 'node:assert/strict';
import {
  newGame, addCat, startWave, step, makeEnemy, catMaxHp, calcMods, cfx, synergyState, estDps, rollRoutes, chooseRoute, grantStartItem,
  stackMax, benchMax, moveCat, useZoomies, snackChoiceCount, rollItemChoices,
} from '../stacking_cats/sim.js';
import {
  CATS, CAT_TAGS, SYNERGIES, synergyText, ROUTES, DIFFS, DAILY_MODS, DAILY_POOL, dayInfo, dayKey, WONDERS, buyWonder, emptyKingdom, kingdomBonuses,
  ACHIEVEMENTS, emptyStats, STARTERS, ITEM_BY_ID,
} from '../stacking_cats/cats.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const ALL = CATS.map((c) => c.id);

t('data: every cat has tags, every tag has 3+ cats and two tiers of text', () => {
  for (const id of ALL) assert.ok(CAT_TAGS[id] && CAT_TAGS[id].length, id);
  for (const tag of Object.keys(SYNERGIES)) {
    assert.ok(ALL.filter((id) => CAT_TAGS[id].includes(tag)).length >= 3, tag);
    for (const tier of [1, 2]) assert.ok(synergyText(tag, tier).length > 8);
  }
  assert.equal(ACHIEVEMENTS.length, new Set(ACHIEVEMENTS.map((a) => a.id)).size);
  for (const a of ACHIEVEMENTS) assert.ok(a.name && a.desc && a.coins > 0 && typeof a.check === 'function', a.id);
  for (const r of ROUTES) assert.ok(r.name && r.icon && r.desc, r.id);
  assert.ok(!/—/.test(JSON.stringify([ROUTES, DAILY_MODS, WONDERS, DIFFS, ACHIEVEMENTS.map((a) => a.name + a.desc)])));
});

t('synergies: two cats of a kind give tier 1, three give tier 2, guardians help the whole team', () => {
  const g = newGame({ seed: 1, unlocked: ALL });
  addCat(g, 'ember');
  assert.deepEqual(synergyState(g).tiers, {});
  const base = estDps(g.cats[0], calcMods(g));
  addCat(g, 'volcano');
  assert.equal(synergyState(g).tiers.fire, 1);
  const m1 = calcMods(g);
  assert.ok(Math.abs(cfx(m1, g.cats[0]).dmg - 0.15) < 1e-9);
  assert.ok(estDps(g.cats[0], m1) > base * 1.1);
  addCat(g, 'draco');
  assert.equal(synergyState(g).tiers.fire, 2);
  assert.ok(Math.abs(cfx(calcMods(g), g.cats[2]).dmg - 0.35) < 1e-9);
  // a non fire cat is untouched by the fire bonus
  addCat(g, 'tabby');
  assert.equal(cfx(calcMods(g), g.cats[3]).dmg, 0);
  const h = newGame({ seed: 2, unlocked: ALL });
  addCat(h, 'mochi'); addCat(h, 'tabby');
  const hp0 = catMaxHp(h, h.cats[1]);
  addCat(h, 'leo');
  assert.ok(catMaxHp(h, h.cats[1]) > hp0 * 1.09, 'guardian team hp');
  assert.ok(calcMods(h).dr >= 0.06 + 0.06);
});

t('synergy needs living cats: a downed cat breaks the bonus', () => {
  const g = newGame({ seed: 3, unlocked: ALL });
  addCat(g, 'sparky'); addCat(g, 'zeus');
  assert.equal(synergyState(g).tiers.storm, 1);
  g.cats[1].ko = true;
  assert.equal(synergyState(g).tiers.storm, undefined);
});

t('difficulty: cozy is softer and pays less, hard is tougher and pays more', () => {
  const mk = (d) => { const g = newGame({ seed: 4, difficulty: d, events: false }); addCat(g, 'tabby'); startWave(g); return g; };
  const [c, nrm, h] = ['cozy', 'normal', 'hard'].map(mk);
  const e = (g) => makeEnemy(g, 'mouse', 10);
  assert.ok(e(c).hp < e(nrm).hp && e(nrm).hp < e(h).hp);
  assert.ok(e(c).dmg < e(nrm).dmg && e(nrm).dmg < e(h).dmg);
  assert.ok(DIFFS.hard.coin > DIFFS.normal.coin && DIFFS.cozy.coin < 1);
  assert.equal(h.run.diff, 'hard');
});

t('routes: three distinct offers, effects apply, meadow heals', () => {
  const g = newGame({ seed: 5, events: false }); addCat(g, 'tabby');
  const r = rollRoutes(g);
  assert.equal(new Set(r).size, 3);
  const base = makeEnemy(g, 'mouse', 12).hp;
  chooseRoute(g, 'danger');
  assert.ok(makeEnemy(g, 'mouse', 12).hp > base * 1.2);
  chooseRoute(g, 'moon');
  assert.ok(makeEnemy(g, 'mouse', 12).spd < 46 * 1.0);
  g.cats[0].hp = 10;
  chooseRoute(g, 'meadow');
  assert.ok(g.cats[0].hp > 50);
  chooseRoute(g, 'market');
  assert.equal(snackChoiceCount(g), 4);
  chooseRoute(g, 'danger');
  const luck = (route) => { const x = newGame({ seed: 6 }); chooseRoute(x, route); let epic = 0; for (let i = 0; i < 400; i++) for (const id of rollItemChoices(x)) if (ITEM_BY_ID[id].rarity === 'epic') epic++; return epic; };
  assert.ok(luck('danger') > luck('trail') * 1.3, 'danger pass gives more epics');
});

t('daily: same day gives the same seed and modifier, fixed cat pool, no kingdom bonuses, mods apply', () => {
  const a = dayInfo('2026-10-25'), b = dayInfo('2026-10-25'), c = dayInfo('2026-10-26');
  assert.deepEqual(a, b);
  assert.notEqual(a.seed, c.seed);
  assert.match(dayKey(Date.UTC(2026, 9, 5)), /^2026-10-05$/);
  const kd = emptyKingdom(); kd.lv = { dojo: 5 };
  const g = newGame({ seed: 99, unlocked: STARTERS, kingdom: kd, daily: { ...a, mod: DAILY_MODS.find((m) => m.id === 'tiny') } });
  assert.equal(g.seed, a.seed);
  assert.equal(g.meta.dmg, 0, 'kingdom is off in the daily');
  assert.deepEqual([...g.unlocked].sort(), [...DAILY_POOL].sort());
  assert.equal(stackMax(g), 4);
  for (const id of ['tabby', 'ember', 'sparky', 'buckshot', 'mochi']) addCat(g, id);
  assert.equal(g.cats.length, 4);
  assert.equal(g.bench.length, 1);
  const glass = newGame({ daily: { ...a, mod: DAILY_MODS.find((m) => m.id === 'glass') }, events: false });
  addCat(glass, 'tabby');
  const plain = newGame({ events: false }); addCat(plain, 'tabby');
  assert.ok(catMaxHp(glass, glass.cats[0]) < catMaxHp(plain, plain.cats[0]) * 0.7);
  assert.ok(calcMods(glass).dmg >= 0.4);
  for (const m of DAILY_MODS) { const x = newGame({ daily: { ...a, mod: m }, events: false }); addCat(x, 'tabby'); startWave(x); x.state = 'fight'; for (let i = 0; i < 60; i++) step(x); }
});

t('wonders: bought with gems, give start item, bench spot, extra picks, zoomies, nine lives', () => {
  const k = emptyKingdom();
  assert.equal(buyWonder(k, 'paw'), false);
  k.gems = 100;
  for (const w of WONDERS) assert.ok(buyWonder(k, w.id), w.id);
  assert.equal(buyWonder(k, 'paw'), false, 'one of each');
  const b = kingdomBonuses(k);
  assert.ok(b.startItem === 1 && b.bench === 1 && b.startPicks === 1 && b.zoomStart === 50 && b.nine === 1 && b.rerolls === 1);
  const g = newGame({ seed: 7, kingdom: k, events: false });
  assert.equal(benchMax(g), 5);
  assert.equal(g.nineLives, 1);
  assert.equal(g.zoom, 50);
  addCat(g, 'tabby');
  const id = grantStartItem(g);
  assert.ok(id && g.cats[0].items.includes(id) && ITEM_BY_ID[id].rarity === 'rare');
  startWave(g); g.state = 'fight'; g.zoom = 100;
  assert.ok(useZoomies(g));
  assert.equal(g.zoomT, 9);
});

t('achievements: checks run against stats, runs and the kingdom', () => {
  const ctx = (over = {}) => ({ stats: { ...emptyStats(), ...(over.stats || {}) }, run: { wave: 1, flawless: 0, items: 0, biggest: 0, ...(over.run || {}) }, save: { unlocked: [...STARTERS] }, kingdom: { ...emptyKingdom(), ...(over.kingdom || {}) } });
  const got = (c) => ACHIEVEMENTS.filter((a) => a.check(c)).map((a) => a.id);
  assert.deepEqual(got(ctx()), []);
  assert.ok(got(ctx({ stats: { kills: 1, bossKills: 1, bestWave: 12 } })).includes('nest1'));
  assert.ok(got(ctx({ stats: { bestWave: 12 } })).includes('w10') && !got(ctx({ stats: { bestWave: 12 } })).includes('w20'));
  assert.ok(got(ctx({ run: { diff: 'hard', wave: 16 } })).includes('hard15'));
  assert.ok(!got(ctx({ run: { diff: 'normal', wave: 16 } })).includes('hard15'));
  assert.ok(got(ctx({ run: { daily: '2026-10-25', wave: 21 } })).includes('daily20'));
  assert.ok(got(ctx({ run: { synMax: 3, biggest: 1500, items: 9, maxCombo: 60 } })).filter((x) => ['syn3', 'big1000', 'loot8', 'combo50'].includes(x)).length === 4);
  const k = emptyKingdom(); k.lv = { dojo: 5, beds: 1, yarn: 1, spa: 1, tower: 1, shrine: 1, vault: 1, tent: 1, stall: 1 }; k.earned = 6000;
  assert.ok(got(ctx({ kingdom: k })).includes('allbld') && got(ctx({ kingdom: k })).includes('maxbld') && got(ctx({ kingdom: k })).includes('rich'));
});

console.log(`${n} tests passed`);
