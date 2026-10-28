// Stacking Cats: difficulty, synergies, routes, the daily challenge, wonders and achievements.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newGame, addCat, startWave, step, makeEnemy, catMaxHp, calcMods, cfx, synergyState, estDps, estBulk, relicGain, rollRoutes, chooseRoute, grantStartItem,
  stackMax, benchMax, moveCat, useZoomies, snackChoiceCount, rollItemChoices, rollCatChoices, rollSnackChoices, eatSnack, mergePairs, mergeCats, useSpecial,
  hurtEnemy, hurtCat, killEnemy, equipItem, forgeItems, sellValue, finishWave, FX_KEYS, rollEvent, DT,
} from '../stacking_cats/sim.js';
import {
  CATS, CAT_TAGS, SYNERGIES, synergyText, ROUTES, DIFFS, DAILY_MODS, DAILY_POOL, dayInfo, dayKey, WONDERS, buyWonder, emptyKingdom, kingdomBonuses,
  ACHIEVEMENTS, emptyStats, STARTERS, ITEM_BY_ID, ITEMS, RARITIES, ITEM_WEIGHT, SELL_VALUE, FORGE_NEXT, SPECIAL_TIME, COIN,
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

// whole runs with random specials and picks across difficulties: no cat, mouse or coin value may ever turn NaN or huge, and nothing may throw
const brokenState = (g) => {
  for (const c of g.cats.concat(g.bench)) if (!Number.isFinite(c.hp) || c.hp > 1e9) return `cat ${c.id} hp ${c.hp}`;
  for (const e of g.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.hp)) return `mouse ${e.type} x ${e.x} hp ${e.hp}`;
  return Number.isFinite(g.run.coins) ? '' : 'coins';
};
t('fuzz: seeded random runs keep every number finite and never throw', () => {
  const sane = newGame({ seed: 1 }); addCat(sane, 'tabby'); sane.cats[0].hp = NaN;
  assert.match(brokenState(sane), /cat tabby/, 'the detector itself catches a NaN cat');
  let r = 7;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let seed = 1; seed <= 10; seed++) {
    const g = newGame({ seed, diff: ['normal', 'nm1', 'nm3', 'nm5'][seed % 4] });
    for (const id of STARTERS.slice(0, 2)) addCat(g, id);
    for (let w = 0; w < 30 && g.state !== 'over'; w++) {
      startWave(g);
      for (let i = 0; i < 6000 && (g.state === 'fight' || g.state === 'intro'); i++) {
        step(g, 0.05);
        if (i % 20 === 0) {
          for (const c of g.cats) if (rnd() < 0.3) useSpecial(g, c.uid);
          assert.equal(brokenState(g), '', `seed ${seed} wave ${w}`);
        }
      }
      if (g.state === 'over') break;
      const cc = rollCatChoices(g); if (cc.length) addCat(g, cc[0]);
      const sc = rollSnackChoices(g); if (sc.length) eatSnack(g, sc[0]);
      const p = mergePairs(g)[0]; if (p) mergeCats(g, p[0], p[1]);
    }
  }
});


// ---------------------------------------------------------------- relics: one clear job each
// lab([[catId, relicId], ...]): a fresh game, those cats in the tower in that order each holding that relic, wave 1 started, nothing spawned
function lab(spec, seed = 5) {
  const g = newGame({ seed, unlocked: ALL, events: false });
  for (const [id] of spec) addCat(g, id);
  spec.forEach(([, it], i) => { if (it) { g.stash.push(it); equipItem(g, g.stash.length - 1, g.cats[i].uid); } });
  startWave(g);
  g.queue = []; g.enemies = []; g.state = 'fight';   // skip the intro countdown
  return g;
}
const mouse = (g, o = {}) => { const e = makeEnemy(g, 'mouse', 1, { x: 500 }); e.maxHp = 1000; e.hp = 1000; Object.assign(e, o); g.enemies.push(e); return e; };
const hit = (g, e, dmg = 100, who = 0) => { g.curCat = g.cats[who]; const d = hurtEnemy(g, e, dmg); g.curCat = null; return d; };
const dealt = (spec, setup, dmg = 100) => { const g = lab(spec); const e = mouse(g); if (setup) setup(g, e); return hit(g, e, dmg); };

t('relics: 61 of them, many commons and few legends, every effect is one the sim understands, names and text are clean', () => {
  const count = {}; for (const it of ITEMS) count[it.rarity] = (count[it.rarity] || 0) + 1;
  assert.deepEqual(RARITIES, ['common', 'rare', 'epic', 'legendary', 'mythic']);
  assert.ok(count.common >= 20 && count.common > count.rare && count.rare > count.epic && count.epic > count.legendary && count.legendary > count.mythic && count.mythic >= 3, JSON.stringify(count));
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const it of ITEMS) {
    assert.ok(RARITIES.includes(it.rarity) && ITEM_WEIGHT[it.rarity] > 0 && SELL_VALUE[it.rarity] > 0 && FORGE_NEXT[it.rarity], it.id);
    for (const k of Object.keys(it.fx)) assert.ok(FX_KEYS.includes(k), it.id + ' uses an unknown effect ' + k);
    assert.ok(it.name.length >= 4 && it.desc.length >= 8 && !/—/.test(it.name + it.desc), it.id);
  }
  // power rises with rarity (sum of effect sizes, ignoring the odd unit like coins)
  const power = (r) => ITEMS.filter((i) => i.rarity === r).reduce((a, i) => a + Object.values(i.fx).reduce((x, y) => x + Math.min(y, 1.5), 0), 0) / count[r];
  for (let k = 1; k < RARITIES.length; k++) assert.ok(power(RARITIES[k]) > power(RARITIES[k - 1]), RARITIES[k] + ' should be stronger than ' + RARITIES[k - 1]);
});

t('relic odds: commons are most of the drops, legends are rare, luck shifts the odds up and mythics can drop at all', () => {
  const tally = (spec, seed) => { const g = lab(spec, seed), c = {}; for (let i = 0; i < 3000; i++) for (const id of rollItemChoices(g)) c[ITEM_BY_ID[id].rarity] = (c[ITEM_BY_ID[id].rarity] || 0) + 1; return c; };
  const base = tally([['tabby', null]], 11), lucky = tally([['tabby', 'cookie']], 11);
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  assert.ok(base.common / total > 0.55 && base.common / total < 0.78, 'commons ' + base.common / total);
  assert.ok(base.legendary > 0 && base.legendary / total < 0.04, 'legendary ' + base.legendary / total);
  assert.ok((base.mythic || 0) / total < 0.006, 'mythic ' + base.mythic / total);
  assert.ok(lucky.legendary > base.legendary * 1.3 && lucky.epic > base.epic * 1.3 && lucky.common < base.common, 'luck shifts odds up: ' + JSON.stringify([base, lucky]));
});

t('relic: conditional damage (Toy Mouse and Reaper Whisker below 30%, Jingle Collar at full health, Dusty Medal on elites and nests, Needle through armor, Silver Bowl when healthy)', () => {
  const none = [['tabby', null]], low = (g, e) => { e.hp = 250; };
  assert.equal(dealt(none, low), dealt(none, null), 'no relic: health of the mouse does not matter');
  assert.ok(Math.abs(dealt([['tabby', 'toymouse']], low) / dealt(none, low) - 1.3) < 0.001, 'Toy Mouse low');
  assert.ok(Math.abs(dealt([['tabby', 'toymouse']], null) / dealt(none, null) - 1) < 0.001, 'Toy Mouse full health: nothing');
  assert.ok(Math.abs(dealt([['tabby', 'whisker']], low) / dealt(none, low) - 1.6) < 0.001, 'Reaper Whisker');
  assert.ok(Math.abs(dealt([['tabby', 'scythe']], low) / dealt(none, low) - 2.2) < 0.001, 'Moon Scythe');
  assert.ok(Math.abs(dealt([['tabby', 'jingle']], null) / dealt(none, null) - 1.3) < 0.001, 'Jingle Collar full health');
  assert.ok(Math.abs(dealt([['tabby', 'jingle']], low) / dealt(none, low) - 1) < 0.001, 'Jingle Collar hurt mouse: nothing');
  const elite = (g, e) => { e.elite = true; }, nest = (g, e) => { e.boss = true; };
  assert.ok(Math.abs(dealt([['tabby', 'medal']], elite) / dealt(none, elite) - 1.25) < 0.001 && Math.abs(dealt([['tabby', 'medal']], nest) / dealt(none, nest) - 1.25) < 0.05, 'Dusty Medal');
  assert.ok(Math.abs(dealt([['tabby', 'medal']], null) / dealt(none, null) - 1) < 0.001, 'Dusty Medal: plain mouse');
  const armored = (g, e) => { e.armor = 0.5; };
  assert.ok(Math.abs(dealt(none, armored) - 50) < 0.001 && Math.abs(dealt([['tabby', 'needle']], armored) - 100) < 0.001, 'Sewing Needle ignores armor');
  const hurtCatTo = (spec) => { const g = lab(spec); g.cats[0].hp = catMaxHp(g, g.cats[0]) * 0.5; const e = mouse(g); return hit(g, e); };
  assert.ok(Math.abs(dealt([['tabby', 'bowl']], null) / dealt(none, null) - 1.2) < 0.001, 'Silver Bowl at full health');
  assert.ok(Math.abs(hurtCatTo([['tabby', 'bowl']]) / hurtCatTo(none) - 1) < 0.001, 'Silver Bowl hurt: nothing');
});

t('relic: kills heal (Cheese Rind), pay (Copper Penny), charge specials (Twine) and the right cat gets them', () => {
  const kill = (spec, who = 0) => { const g = lab(spec); const c = g.cats[who]; c.hp = catMaxHp(g, c) * 0.5; c.sp = 0; const e = mouse(g, { hp: 1, maxHp: 1 }); const coins = g.run.coins, hp = c.hp; g.curCat = c; hurtEnemy(g, e, 50); g.curCat = null; return { heal: (c.hp - hp) / catMaxHp(g, c), coins: g.run.coins - coins, sp: c.sp, g }; };
  const base = kill([['tabby', null]]);
  assert.ok(Math.abs(kill([['tabby', 'rind']]).heal - 0.05) < 1e-6 && base.heal === 0, 'Cheese Rind 5%');
  assert.ok(Math.abs(kill([['tabby', 'scythe']]).heal - 0.12) < 1e-6, 'Moon Scythe heals 12%');
  const pen = kill([['tabby', 'penny']]), mul = pen.g.mods.coin * pen.g.diff.coin * pen.g.route.coin;
  assert.ok(Math.abs(pen.coins - base.coins - 0.2 * mul) < 1e-6, 'Copper Penny +0.2 coins: ' + (pen.coins - base.coins));
  const gp = kill([['tabby', 'goldpaw']]), gmul = gp.g.mods.coin * gp.g.diff.coin * gp.g.route.coin;
  assert.ok(Math.abs(gp.coins - (COIN.kill + 1.6) * gmul) < 1e-6 && gp.g.mods.coin > pen.g.mods.coin, 'Golden Paw: +1.6 coins per kill on top of the kill coin, and its +40% coins');
  assert.ok(Math.abs(kill([['tabby', 'twine']]).sp - base.sp - 0.03) < 1e-9, 'Ball of Twine +3% charge');
  const other = kill([['tabby', null], ['mochi', 'rind']], 0);
  assert.equal(other.heal, 0, 'a relic on another cat does nothing for the killer');
});

t('relic: Fish Bone cleaves the nearest other mouse, Hairball and Spore Mushroom poison (stacking, capped)', () => {
  const g = lab([['tabby', 'fishbone']]); const a = mouse(g, { x: 500 }), b = mouse(g, { x: 530 }), far = mouse(g, { x: 900 });
  hit(g, a, 100);
  assert.ok(Math.abs(1000 - b.hp - 25) < 1e-6 && far.hp === 1000, 'only the nearest other mouse takes 25%: ' + (1000 - b.hp));
  const cl = lab([['tabby', 'fishbone']]); const x = mouse(cl, { x: 500 }), y = mouse(cl, { x: 520 }); hit(cl, x, 100);
  assert.ok(x.hp === 900 && y.hp === 975, 'a cleave never cleaves again');
  const v = lab([['tabby', 'hairball']]); const e = mouse(v); hit(v, e, 100);
  assert.ok(e.poison && e.poison.t > 0 && Math.abs(e.poison.dps * 3 - 20) < 1e-6, 'one hit poisons for 20% of the hit over 3 s: ' + JSON.stringify(e.poison));
  const d1 = e.poison.dps; hit(v, e, 100); assert.ok(e.poison.dps > d1, 'stacks');
  for (let i = 0; i < 20; i++) hit(v, e, 100);
  assert.ok(e.poison.dps <= d1 * 5 + 1e-9, 'capped at five stacks');
  const sp = lab([['tabby', 'spore']]); const f = mouse(sp); hit(sp, f, 100); assert.ok(Math.abs(f.poison.dps * 3 - 45) < 1e-6, 'Spore Mushroom 45%');
});

t('relic: barriers (Scratching Post, Iron Bowl, Heart of Whiskerton) soak damage first and come back every wave', () => {
  const g = lab([['tabby', 'ironbowl']]); const c = g.cats[0], mx = catMaxHp(g, c);
  assert.ok(Math.abs(c.shd - 0.3 * mx) < 1e-6, 'barrier is 30% of max health: ' + c.shd + ' of ' + mx);
  const hp0 = c.hp, shd0 = c.shd; hurtCat(g, c, 20);
  const took = 20 * (1 - Math.min(0.8, g.mods.dr + 0.05));
  assert.ok(c.hp === hp0 && Math.abs(shd0 - c.shd - took) < 1e-6, 'a small bite only hurts the barrier');
  hurtCat(g, c, 10000); assert.ok(c.shd === 0 && (c.hp < hp0 || c.ko), 'a big bite goes through once the barrier is gone');
  const w = lab([['tabby', 'post']]); w.cats[0].shd = 0; startWave(w); assert.ok(Math.abs(w.cats[0].shd - 0.12 * catMaxHp(w, w.cats[0])) < 1e-6, 'refilled at wave start');
  assert.ok(Math.abs(lab([['tabby', 'wheart']]).cats[0].shd - 0.5 * catMaxHp(lab([['tabby', 'wheart']]), lab([['tabby', 'wheart']]).cats[0])) < 1e-6);
});

t('relic: Nine Lives Locket and Heart of Whiskerton survive one deadly bite per wave', () => {
  for (const id of ['locket', 'wheart']) {
    const g = lab([['tabby', id]]); const c = g.cats[0]; c.shd = 0;
    hurtCat(g, c, 100000);
    assert.ok(!c.ko && Math.abs(c.hp - 0.4 * catMaxHp(g, c)) < 1e-6, id + ' survives with 40%: ' + c.hp);
    hurtCat(g, c, 100000); assert.ok(c.ko, id + ' only once per wave');
    c.ko = false; c.hp = 10; startWave(g); c.shd = 0; hurtCat(g, c, 100000); assert.ok(!c.ko, id + ' is ready again next wave');
  }
  const plain = lab([['tabby', null]]); hurtCat(plain, plain.cats[0], 100000); assert.ok(plain.cats[0].ko, 'no relic: down');
});

t('relic: Static Sock, Lightning Rod and Echo Whiskers sometimes fire a second time for free', () => {
  const fight1 = (spec, seed) => { const g = lab(spec, seed); const e = mouse(g, { x: 330, hp: 1e9, maxHp: 1e9, dmg: 0 }); for (let i = 0; i < 360; i++) { e.x = 330; step(g); } return g.run.dmg; };
  const fight = (spec) => { let sum = 0; for (let sd = 1; sd <= 10; sd++) sum += fight1(spec, sd); return sum; };   // random echoes: add up ten fights
  const base = fight([['hawkeye', null]]);
  const orig = ITEM_BY_ID.sock.fx.echo; ITEM_BY_ID.sock.fx.echo = 1;
  const always = fight([['hawkeye', 'sock']]); ITEM_BY_ID.sock.fx.echo = orig;
  assert.ok(always > base * 1.7, `echo 100% should about double the damage: ${base} vs ${always}`);
  const some = fight([['hawkeye', 'whiskers']]), nope = fight([['hawkeye', 'bell']]);
  assert.ok(some > nope * 1.2, `Echo Whiskers (+haste, 45% echo) clearly beats a plain bell: ${nope} vs ${some}`);
});

t('relic: Ping Pong Ball, War Drum and Time Knot stack attack speed with kills, reset every wave and cap at ten', () => {
  const g = lab([['tabby', 'pingpong']]); const c = g.cats[0];
  for (let i = 0; i < 3; i++) { const e = mouse(g, { hp: 1, maxHp: 1 }); g.curCat = c; hurtEnemy(g, e, 50); g.curCat = null; }
  assert.equal(c.fz, 3, 'three kills, three stacks');
  for (let i = 0; i < 20; i++) { const e = mouse(g, { hp: 1, maxHp: 1 }); g.curCat = c; hurtEnemy(g, e, 50); g.curCat = null; }
  assert.equal(c.fz, 10, 'capped at ten');
  mouse(g, { x: 950, hp: 1e9, maxHp: 1e9 }); c.cd = 5; step(g);
  const per = (5 - c.cd) / DT;
  const g0 = lab([['tabby', null]]); mouse(g0, { x: 950, hp: 1e9, maxHp: 1e9 }); g0.cats[0].cd = 5; step(g0);
  const per0 = (5 - g0.cats[0].cd) / DT;
  assert.ok(Math.abs((per - per0) - 0.25 * 1) < 0.02 || per > per0 + 0.2, `ten stacks of 2.5% add 25% speed: ${per0} -> ${per}`);
  startWave(g); assert.equal(c.fz || 0, 0, 'a new wave starts from zero');
  const non = lab([['tabby', null]]), e2 = mouse(non, { hp: 1, maxHp: 1 }); non.curCat = non.cats[0]; hurtEnemy(non, e2, 50); assert.ok(!non.cats[0].fz, 'no relic, no stacks');
});

t('relic: Firecracker and Powder Keg make kills explode, only near the dead mouse, and a pack cannot chain forever', () => {
  const g = lab([['tabby', 'cracker']]); const a = mouse(g, { x: 500, hp: 100, maxHp: 100 }), b = mouse(g, { x: 530 }), far = mouse(g, { x: 900 });
  hit(g, a, 1e6);
  assert.ok(a.dead && Math.abs(1000 - b.hp - 35) < 1e-6 && far.hp === 1000, 'blast is 35% of the dead mouse health on the one next to it: ' + (1000 - b.hp));
  const k = lab([['tabby', 'keg']]); const pack = []; for (let i = 0; i < 60; i++) pack.push(mouse(k, { x: 500 + i * 3, hp: 3, maxHp: 5 }));
  hit(k, pack[0], 1e6);
  const dead = pack.filter((e) => e.dead).length;
  assert.ok(dead > 3 && dead <= 60, 'a chain reaction through a tight pack: ' + dead);
  const quiet = lab([['tabby', null]]); const q1 = mouse(quiet, { hp: 5, maxHp: 5 }), q2 = mouse(quiet, { x: 510, hp: 5, maxHp: 5 }); hit(quiet, q1, 1e6); assert.ok(!q2.dead, 'no relic, no blast');
});

t('relic auras: the whole tower gets Sunflower Banner, Windchime, Lantern, Hex Doll, Sunbeam, Rainbow Yarn; benched and downed carriers give nothing', () => {
  const base = lab([['tabby', null], ['mochi', null]]), m0 = base.mods;
  const m = (id) => lab([['tabby', id], ['mochi', null]]).mods;
  assert.ok(Math.abs(m('banner').dmg - m0.dmg - 0.05) < 1e-9 && Math.abs(m('chime').haste - m0.haste - 0.05) < 1e-9, 'banner and chime');
  assert.ok(Math.abs(m('hexdoll').curse - m0.curse - 0.1) < 1e-9 && Math.abs(m('sunbeam').waveHeal - m0.waveHeal - 0.04) < 1e-9, 'hex doll and sunbeam');
  assert.ok(Math.abs(m('lantern').dr - m0.dr - 0.05) < 1e-9, 'lantern damage reduction');
  const rb = m('rainbow'); assert.ok(Math.abs(rb.dmg - m0.dmg - 0.12) < 1e-9 && Math.abs(rb.haste - m0.haste - 0.1) < 1e-9, 'rainbow yarn');
  const gl = lab([['tabby', 'lantern'], ['mochi', null]]), gb = lab([['tabby', null], ['mochi', null]]);
  assert.ok(Math.abs(catMaxHp(gl, gl.cats[1]) / catMaxHp(gb, gb.cats[1]) - 1.12) < 0.01, 'lantern gives the OTHER cat 12% more health too');
  const down = lab([['tabby', 'banner'], ['mochi', null]]); down.cats[0].ko = true; assert.ok(Math.abs(calcMods(down).dmg - m0.dmg) < 1e-9, 'a downed carrier gives nothing');
  const bench = lab([['tabby', 'banner'], ['mochi', null]]); moveCat(bench, bench.cats[0].uid, 'bench'); assert.ok(Math.abs(calcMods(bench).dmg - m0.dmg) < 1e-9, 'a benched carrier gives nothing');
  const crown = m('kingcrown'); assert.ok(Math.abs(crown.dmg - m0.dmg - 0.2) < 1e-9 && Math.abs(crown.dr - m0.dr - 0.08) < 1e-9, 'Crown of the Cat King');
  const two = lab([['tabby', 'banner'], ['mochi', 'banner']]); assert.ok(Math.abs(two.mods.dmg - m0.dmg - 0.1) < 1e-9, 'two banners stack');
});

t('relics: Catnip Sprig speeds the zoomies meter, Time Knot speeds specials, Windchime-style auras count only living tower cats', () => {
  const gain = (spec) => { const g = lab(spec); g.zoom = 0; const e = mouse(g, { hp: 1, maxHp: 1 }); g.curCat = g.cats[0]; hurtEnemy(g, e, 50); g.curCat = null; return g.zoom; };
  assert.ok(Math.abs(gain([['tabby', 'sprig']]) / gain([['tabby', null]]) - 1.2) < 0.01, 'zoomies fill 20% faster');
  const sp = (spec) => { const g = lab(spec); mouse(g, { x: 950, hp: 1e9, maxHp: 1e9 }); g.cats[0].sp = 0; step(g); return g.cats[0].sp; };
  assert.ok(Math.abs(sp([['tabby', 'timeknot']]) / sp([['tabby', null]]) - 1.5) < 0.01, 'specials charge 50% faster');
  assert.ok(Math.abs(sp([['tabby', null]]) - DT / SPECIAL_TIME) < 1e-6, 'baseline charge unchanged');
});

t('relic sets: three different Armor Set relics give the team 4% less damage taken, a fifth doubles it', () => {
  const two = calcMods(lab([['tabby', 'vest'], ['ember', 'cushion'], ['mochi', null]])).dr;
  const three = calcMods(lab([['tabby', 'vest'], ['ember', 'cushion'], ['mochi', 'mitten']])).dr;
  assert.ok(Math.abs(three - two - 0.04) < 1e-9, 'a set bonus of 4%, got ' + (three - two));
  const dup = calcMods(lab([['tabby', 'vest'], ['ember', 'vest'], ['mochi', 'vest']])).dr;
  assert.ok(dup < three, 'copies of one relic are not a set');
});

t('previews: estBulk counts health, damage reduction and dodge from relics (the defensive half of the equip preview)', () => {
  const g = lab([['tabby', null], ['mochi', null]]);
  const c = g.cats[0], m = calcMods(g), base = estBulk(g, c, m, []);
  assert.ok(base > 0 && Math.abs(estBulk(g, c, m) - base) < 1e-9, 'same items, same bulk');
  const vest = estBulk(g, c, m, ['vest']) / base, cushion = estBulk(g, c, m, ['cushion']) / base, shell = estBulk(g, c, m, ['shell']) / base;
  assert.ok(Math.abs(vest - 1 / 0.85) < 0.02, 'a vest takes 15% off every bite, got ' + vest);
  assert.ok(cushion > 1.2 && cushion < 1.4, '+30% health, got ' + cushion);
  assert.ok(shell > 1.15, 'dodge and health both count, got ' + shell);
  assert.ok(Math.abs(estBulk(g, c, m, ['claws']) / base - 1) < 1e-9, 'an attack relic adds no bulk');
  assert.ok(/estBulk\(g, c, mods, items\)/.test(readFileSync('stacking_cats/main.js', 'utf8')), 'the equip preview shows it');
});

t('previews: relicGain finds the cat a relic helps most, as damage or toughness', () => {
  const g = lab([['tabby', null], ['mochi', null]]);
  const claws = relicGain(g, 'claws');
  assert.ok(claws && claws.dps > 0.01 && claws.cat, 'claws help damage');
  assert.ok(g.cats.some((c) => c.id === claws.cat), 'names a cat of the team');
  const best = Math.max(...g.cats.map((c) => estDps(c, calcMods(g), [...c.items, 'claws']) / estDps(c, calcMods(g)) - 1));
  assert.ok(Math.abs(claws.dps - best) < 1e-9, 'the best of the cats, got ' + claws.dps + ' vs ' + best);
  const vest = relicGain(g, 'vest');
  assert.ok(vest.dps < 0.001 && vest.bulk > 0.1, 'a vest is a toughness relic');
  assert.equal(relicGain(g, 'rind').bulk >= 0, true);
  assert.equal(relicGain(lab([]), 'claws'), null, 'no cats, no answer');
  const full = lab([['tabby', 'claws']]); const again = relicGain(full, 'bell');
  assert.ok(again && Number.isFinite(again.dps) && Number.isFinite(again.bulk), 'a full single slot is replaced in the estimate, never an error');
  assert.ok(/relicGain\(g, id\)/.test(readFileSync('stacking_cats/main.js', 'utf8')), 'shown on the relic cards');
});

t('previews: the damage estimate counts the extra damage mice take from a curse (Hex Doll)', () => {
  const g = lab([['tabby', null], ['ember', 'hexdoll']]);
  const m = calcMods(g), plain = lab([['tabby', null], ['ember', null]]);
  assert.ok(m.curse > 0.09, 'the doll curses the mice');
  const withDoll = g.cats.reduce((a, c) => a + estDps(c, m), 0), without = plain.cats.reduce((a, c) => a + estDps(c, calcMods(plain)), 0);
  assert.ok(Math.abs(withDoll / without - 1.1) < 0.02, 'about 10% more damage in the estimate, got ' + (withDoll / without));
});

t('relics: forging climbs all five tiers, mythics forge into mythics for coins, selling and shop prices exist for every tier', () => {
  const g = lab([['tabby', null]]);
  g.stash = ['crown', 'hourglass', 'mask']; assert.equal(ITEM_BY_ID[forgeItems(g, 0)].rarity, 'legendary', 'three epics make a legendary');
  g.stash = ['locket', 'keg', 'whiskers']; assert.equal(ITEM_BY_ID[forgeItems(g, 0)].rarity, 'mythic', 'three legendaries make a mythic');
  g.stash = ['kingcrown', 'timeknot', 'wheart']; const c0 = g.run.coins, out = forgeItems(g, 0); assert.equal(ITEM_BY_ID[out].rarity, 'mythic'); assert.ok(g.run.coins > c0, 'forging mythics pays coins');
  for (const it of ITEMS) { g.stash = [it.id]; assert.ok(sellValue(g, it.id) > 0, it.id + ' sells'); }
  assert.ok(sellValue(g, 'wheart') > sellValue(g, 'crown') * 3 && sellValue(g, 'crown') > sellValue(g, 'fang'), 'sell values climb with rarity');
  const ev = newGame({ seed: 2, unlocked: ALL }); addCat(ev, 'tabby');
  for (let w = 3; w < 60; w += 3) { ev.wave = w; ev.bossWave = false; const e = rollEvent(ev); if (e) for (const o of e.options) if (o.k === 'buy') assert.ok(Number.isFinite(o.cost) && o.cost > 0, 'shop price ' + o.item); }
});

console.log(`${n} tests passed`);

t('between waves the tower only heals 5% of its health; snacks and relics add the rest', () => {
  const g = newGame({ seed: 5, unlocked: ALL });
  addCat(g, 'tabby');
  const c = g.cats[0], mx = catMaxHp(g, c);
  c.hp = Math.round(mx * 0.5);
  g.mods = null;
  const base = c.hp;
  finishWave(g);
  const gain = (c.hp - base) / mx;
  assert.ok(gain > 0.03 && gain < 0.08, `a wave rest heals about 5%, got ${(gain * 100).toFixed(1)}%`);
  // the Warm Milk snack (+12% a wave) is the extra heal
  const g2 = newGame({ seed: 5, unlocked: ALL });
  addCat(g2, 'tabby');
  const d = g2.cats[0], mx2 = catMaxHp(g2, d);
  d.hp = Math.round(mx2 * 0.5);
  eatSnack(g2, 'milk');
  const base2 = d.hp;
  finishWave(g2);
  assert.ok((d.hp - base2) / mx2 > gain + 0.08, 'Warm Milk adds at least 8 points more');
});

// the snack and relic audit lives in its own file; it runs with this suite so no shared script has to change
await import('./stacking_cats_audit.test.mjs');
