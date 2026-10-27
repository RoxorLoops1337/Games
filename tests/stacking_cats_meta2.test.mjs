// Stacking Cats meta 2: cat mastery, cosmetics (wardrobe), the Nightmare ladder, and the save code for all of it.
import assert from 'node:assert/strict';

const grad = { addColorStop() {} };
const fakeCtx = (log) => new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : (...a) => { if (log) log.n++; }),
  set(o, k, v) { o[k] = v; return true; },
});
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };

const cats = await import('../stacking_cats/cats.js');
const sim = await import('../stacking_cats/sim.js');
const cos = await import('../stacking_cats/cosmetics.js');
const { encodeSave, decodeSave } = await import('../stacking_cats/savecode.js');
const { CATS, CAT_BY_ID, DIFFS } = cats;

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const baseSave = () => ({ v: 1, stats: cats.emptyStats(), unlocked: [...cats.STARTERS], kingdom: cats.emptyKingdom(), ach: {}, catStats: {}, daily: {} });

// ---------------------------------------------------------------- mastery
t('mastery: levels 1 to 5 from waves, kills and damage, with a progress bar', () => {
  assert.equal(cats.masteryLevel(undefined), 1);
  assert.equal(cats.masteryLevel({ waves: 0, kills: 0, dmg: 0 }), 1);
  assert.equal(cats.masteryLevel({ waves: 17, kills: 0, dmg: 0 }), 2);       // 51 xp
  assert.equal(cats.masteryLevel({ waves: 0, kills: 500, dmg: 0 }), 4);
  assert.equal(cats.masteryLevel({ waves: 0, kills: 0, dmg: 500000 }), 5);
  assert.equal(cats.masteryLevel({ waves: 9999, kills: 0, dmg: 0 }), 5);
  const p = cats.masteryProgress({ waves: 25, kills: 0, dmg: 0 });           // 75 xp, between 50 and 200
  assert.equal(p.lv, 2); assert.equal(p.from, 50); assert.equal(p.to, 200); assert.equal(p.pct, Math.round((100 * 25) / 150));
  assert.equal(cats.masteryProgress({ waves: 999 }).to, null);
  assert.equal(cats.masteryProgress({ waves: 999 }).pct, 100);
  // older saves without a waves count still get a little credit from their runs
  assert.ok(cats.masteryXp({ runs: 5, kills: 0, dmg: 0 }) > 0);
});
t('mastery: the bonus is tiny (+2% damage, +1% health per level above 1)', () => {
  assert.deepEqual(cats.masteryBonus(1), { dmg: 0, hp: 0 });
  assert.ok(Math.abs(cats.masteryBonus(2).dmg - 0.02) < 1e-9);
  const top = cats.masteryBonus(5);
  assert.ok(top.dmg <= 0.0801 && top.hp <= 0.0401, 'max mastery must stay under +8% damage and +4% health');
});
t('mastery: masteryMap lists cats at level 2 or more and ignores unknown ids', () => {
  const m = cats.masteryMap({ tabby: { waves: 340 }, ember: { waves: 1 }, nope: { waves: 999 } });
  assert.deepEqual(m, { tabby: 5 });
  assert.deepEqual(cats.masteryMap(null), {});
});
t('mastery: newGame applies it to that cat only, additive and optional', () => {
  const mk = (mastery) => { const g = sim.newGame({ seed: 5, mastery }); sim.addCat(g, 'tabby'); sim.addCat(g, 'ember'); g.mods = sim.calcMods(g); return g; };
  const plain = mk(), master = mk({ tabby: 5 });
  const tab = (g) => g.cats.find((c) => c.id === 'tabby'), emb = (g) => g.cats.find((c) => c.id === 'ember');
  assert.ok(Math.abs(sim.catDmg(tab(master), master.mods) / sim.catDmg(tab(plain), plain.mods) - 1.08 / 1) < 1e-6);
  assert.ok(sim.catMaxHp(master, tab(master)) > sim.catMaxHp(plain, tab(plain)));
  assert.equal(sim.catDmg(emb(master), master.mods), sim.catDmg(emb(plain), plain.mods));
  assert.equal(sim.catMaxHp(master, emb(master)), sim.catMaxHp(plain, emb(plain)));
  assert.ok(sim.catMaxHp(master, tab(master)) / sim.catMaxHp(plain, tab(plain)) <= 1.045);
  const none = sim.newGame({ seed: 5 }); assert.equal(none.mastery, null);
});
t('mastery: the daily and the weekly ignore it so they stay fair', () => {
  const g = sim.newGame({ daily: cats.dayInfo('2026-10-25'), mastery: { tabby: 5 } });
  assert.equal(g.mastery, null);
  const w = sim.newGame({ daily: cats.weekInfo('2026-W43'), mastery: { tabby: 5 } });
  assert.equal(w.mastery, null);
});

// ---------------------------------------------------------------- cosmetics
t('cosmetics: at least 12 buyable items over head, face and neck, with unique ids and no em dashes', () => {
  assert.ok(cos.BUYABLE.length >= 12);
  assert.deepEqual(new Set(cos.COSMETICS.map((c) => c.slot)), new Set(['head', 'face', 'neck']));
  assert.equal(new Set(cos.COSMETICS.map((c) => c.id)).size, cos.COSMETICS.length);
  for (const c of cos.COSMETICS) { assert.ok(c.name && c.desc && Number.isFinite(c.cost), c.id); assert.ok(!/\u2014/.test(JSON.stringify(c))); }
  assert.ok(cos.BUYABLE.every((c) => c.cost > 0));
});
t('cosmetics: every item draws on every cat without errors', () => {
  const log = { n: 0 };
  for (const c of cos.COSMETICS) for (const d of CATS) assert.equal(cos.drawCosmetic(fakeCtx(log), c.id, d.id), true, c.id + ' on ' + d.id);
  assert.ok(log.n > 500);
  assert.equal(cos.drawCosmetic(fakeCtx(), 'nope', 'tabby'), false);
});
t('cosmetics: buying takes coins once, wearing is one item per slot, wearing again takes it off', () => {
  const s = baseSave(); s.kingdom.coins = 100;
  assert.equal(cos.buyCosmetic(s, 'crown'), false);          // too expensive
  assert.equal(cos.toggleWear(s, 'tabby', 'bow'), false);    // not owned
  assert.equal(cos.buyCosmetic(s, 'bow'), true);
  assert.equal(s.kingdom.coins, 40);
  assert.equal(cos.buyCosmetic(s, 'bow'), false);            // already owned
  assert.equal(cos.buyCosmetic(s, 'medal'), false);          // mastery items are never sold
  s.kingdom.coins = 1000; cos.buyCosmetic(s, 'flower'); cos.buyCosmetic(s, 'glasses');
  const sig0 = cos.lookSig(s, 'tabby');
  assert.ok(cos.toggleWear(s, 'tabby', 'bow')); const sig1 = cos.lookSig(s, 'tabby');
  assert.ok(cos.toggleWear(s, 'tabby', 'flower'));           // replaces the bow: same slot
  assert.equal(cos.lookOf(s, 'tabby').head, 'flower');
  assert.ok(cos.toggleWear(s, 'tabby', 'glasses'));
  assert.deepEqual(cos.lookOf(s, 'tabby'), { head: 'flower', face: 'glasses', neck: null });
  assert.notEqual(cos.lookSig(s, 'tabby'), sig1); assert.notEqual(sig1, sig0);
  assert.equal(cos.lookSig(s, 'ember'), '');                 // other cats are untouched
  cos.toggleWear(s, 'tabby', 'flower'); cos.toggleWear(s, 'tabby', 'glasses');
  assert.equal(s.wardrobe.tabby, undefined);
  assert.equal(cos.lookSig(s, 'tabby'), '');
});
t("cosmetics: the Master's Medal needs Mastery 5 on that cat", () => {
  const s = baseSave();
  assert.equal(cos.canWear(s, 'medal', 4), false);
  assert.equal(cos.toggleWear(s, 'tabby', 'medal', 4), false);
  assert.equal(cos.toggleWear(s, 'tabby', 'medal', 5), true);
  assert.equal(cos.lookOf(s, 'tabby').neck, 'medal');
});

// ---------------------------------------------------------------- ladder
t('ladder: Nightmare I to V stack their rules, each tier harder than the last', () => {
  assert.equal(cats.LADDER_TIERS, 5);
  let prev = DIFFS.hard;
  for (let i = 1; i <= 5; i++) {
    const d = DIFFS['nm' + i];
    assert.ok(d && d.name && d.icon && d.desc && d.rule.name && d.rule.icon, 'nm' + i);
    assert.ok(d.hp >= prev.hp && d.dmg >= prev.dmg && d.budget >= prev.budget && d.coin > prev.coin, 'nm' + i + ' is harder');
    assert.ok((d.speed || 1) >= (prev.speed || 1) && (d.elite || 0) >= (prev.elite || 0) && (d.snack || 0) >= (prev.snack || 0) && (d.rerolls || 0) >= (prev.rerolls || 0));
    assert.ok((d.heal == null ? 1 : d.heal) <= (prev.heal == null ? 1 : prev.heal));
    assert.ok(!/\u2014/.test(JSON.stringify(d)));
    prev = d;
  }
  assert.ok(DIFFS.nm1.speed > 1 && DIFFS.nm2.heal < 1 && DIFFS.nm3.elite > 0 && DIFFS.nm4.snack === 1 && DIFFS.nm5.heal === 0);
  assert.deepEqual(cats.DIFF_ORDER, ['cozy', 'normal', 'hard', 'nm1', 'nm2', 'nm3', 'nm4', 'nm5']);
});
t('ladder: tiers unlock by clearing the previous one (Hard through the trophy)', () => {
  const s = baseSave();
  assert.equal(cats.ladderUnlocked(s), 0); assert.equal(cats.diffAllowed(s, 'nm1'), false); assert.equal(cats.diffAllowed(s, 'hard'), true);
  s.ach.hard15 = 1; assert.equal(cats.ladderUnlocked(s), 1); assert.equal(cats.diffAllowed(s, 'nm1'), true); assert.equal(cats.diffAllowed(s, 'nm2'), false);
  s.ladder = 3; assert.equal(cats.ladderUnlocked(s), 4); assert.equal(cats.diffAllowed(s, 'nm4'), true); assert.equal(cats.diffAllowed(s, 'nm5'), false);
  s.ladder = 5; assert.equal(cats.ladderUnlocked(s), 5);
  assert.equal(cats.ladderClears({ diff: 'nm2', wave: cats.LADDER_WAVE[2] }), 2);
  assert.equal(cats.ladderClears({ diff: 'nm2', wave: cats.LADDER_WAVE[2] - 1 }), 0);
  assert.equal(cats.ladderClears({ diff: 'hard', wave: 99 }), 0);
});
t('ladder: Quick Mice makes mice faster, Royal Guard adds elites, Slim Pickings cuts snack choices and rerolls', () => {
  const spd = (d) => { const g = sim.newGame({ seed: 3, difficulty: d }); return sim.makeEnemy(g, 'mouse', 3).spd; };
  const base = spd('hard'), fast = spd('nm1');
  assert.ok(fast / base > 1.03 && fast / base < 1.12, 'nm1 is a few percent faster, got ' + fast / base);
  // same seed gives the same random roll, so the ratio is the multiplier alone
  const hard = sim.newGame({ seed: 3, difficulty: 'hard' }), nm4 = sim.newGame({ seed: 3, difficulty: 'nm4' });
  assert.equal(sim.snackChoiceCount(hard) - sim.snackChoiceCount(nm4), 1);
  const k = cats.emptyKingdom(); k.lv.tent = 3;
  const hr = sim.newGame({ kingdom: k, difficulty: 'hard' }).rerolls, nr = sim.newGame({ kingdom: k, difficulty: 'nm4' }).rerolls, n5 = sim.newGame({ kingdom: k, difficulty: 'nm5' }).rerolls;
  assert.ok(hr > 0 && nr === hr - 1 && n5 === 0, `rerolls ${hr} ${nr} ${n5}`);
});
t('ladder: Lean Times halves and Sealed Pantry removes the healing after a wave', () => {
  const heal = (d) => {
    const g = sim.newGame({ seed: 9, difficulty: d }); sim.addCat(g, 'tabby');
    sim.startWave(g); g.state = 'fight'; g.queue = []; g.enemies.length = 0;
    const c = g.cats[0]; const mx = sim.catMaxHp(g, c); c.hp = mx * 0.2;
    for (let i = 0; i < 600 && g.state !== 'clear'; i++) sim.step(g);
    return (c.hp - mx * 0.2) / mx;
  };
  const h = heal('hard'), l = heal('nm2'), p = heal('nm5');
  assert.ok(h > 0.03 && h < 0.08, 'hard heals about 5%, got ' + h);
  assert.ok(Math.abs(l - h / 2) < 0.012, `nm2 heals half: ${l} vs ${h}`);
  assert.ok(p < 0.02, 'nm5 does not heal, got ' + p);
});
t('ladder: Royal Guard sends more elites (counted over seeded waves)', () => {
  const count = (d) => {
    let e = 0;
    for (let s = 1; s <= 40; s++) {
      const g = sim.newGame({ seed: s, difficulty: d }); sim.addCat(g, 'tabby');
      g.wave = 3; sim.startWave(g);                       // wave 4 queue
      e += g.queue.filter((q) => q.elite).length;
    }
    return e;
  };
  const a = count('hard'), b = count('nm3');
  assert.ok(b > a, `nm3 elites ${b} vs hard ${a}`);
});

// ---------------------------------------------------------------- save code
t('save code: mastery waves, wardrobe, owned items, weekly scores and ladder survive a round trip', () => {
  const s = baseSave();
  s.catStats.tabby = { runs: 3, dmg: 9000, kills: 400, best: 12, waves: 400 };
  s.owned = ['bow', 'glasses', 'scarf']; s.wardrobe = { tabby: { head: 'bow', face: 'glasses', neck: 'medal' } };
  s.weekly = { '2026-W43': { best: 1500, wave: 14 } }; s.ladder = 2; s.ach = { hard15: 123 }; s.diff = 'nm3';
  const r = decodeSave(encodeSave(s));
  assert.ok(r.ok);
  assert.equal(r.save.catStats.tabby.waves, 400);
  assert.deepEqual(r.save.owned, ['bow', 'glasses', 'scarf']);
  assert.deepEqual(r.save.wardrobe.tabby, { head: 'bow', face: 'glasses', neck: 'medal' });   // 400 waves is mastery 5 so the medal stays
  assert.deepEqual(r.save.weekly, { '2026-W43': { best: 1500, wave: 14 } });
  assert.equal(r.save.ladder, 2); assert.equal(r.save.diff, 'nm3');
});
t('save code: junk is cleaned (unknown ids, wrong slots, unowned items, big numbers, locked tiers)', () => {
  const s = baseSave();
  s.catStats.tabby = { runs: 1, dmg: 1, kills: 1, best: 1, waves: 1e12 };
  s.owned = ['bow', 'bow', 'fakehat', 'medal', 7];
  s.wardrobe = {
    tabby: { head: 'glasses', face: 'glasses', neck: 'medal' },   // glasses in the head slot is wrong, medal needs mastery 5 (waves are clamped but huge, so it is fine)
    ember: { head: 'bow', face: 'bow', neck: 'scarf' },           // face bow wrong slot, scarf not owned
    ghosty: { head: 'bow' },                                      // unknown cat
  };
  s.weekly = { '2026-W43': { best: -5, wave: 1e9 }, 'nope': { best: 1 }, '2026-W99': { best: 1 } };
  s.ladder = 99; s.diff = 'nm5'; s.ach = {};
  const r = decodeSave(encodeSave(s));
  assert.ok(r.ok);
  assert.deepEqual(r.save.owned, ['bow']);
  assert.equal(r.save.catStats.tabby.waves, 1e6);
  assert.deepEqual(r.save.wardrobe, { tabby: { head: null, face: null, neck: 'medal' }, ember: { head: 'bow', face: null, neck: null } });
  assert.deepEqual(Object.keys(r.save.weekly), ['2026-W43']);
  assert.deepEqual(r.save.weekly['2026-W43'], { best: 0, wave: 999 });
  assert.equal(r.save.ladder, 5);
  // a tier the save has not unlocked falls back to Hard
  s.ladder = 0; const r2 = decodeSave(encodeSave(s));
  assert.equal(r2.save.diff, 'hard');
  // a medal without the mastery is dropped
  s.catStats.tabby.waves = 3; const r3 = decodeSave(encodeSave(s));
  assert.equal(r3.save.wardrobe.tabby, undefined);
  // old saves without any of the new fields still load
  const old = baseSave(); const r4 = decodeSave(encodeSave(old));
  assert.ok(r4.ok && r4.save.ladder === 0 && r4.save.owned.length === 0 && Object.keys(r4.save.wardrobe).length === 0);
});

console.log(n + ' tests passed');
