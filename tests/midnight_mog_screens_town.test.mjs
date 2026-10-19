// Midnight Mog town screen and crate ceremony: pure helpers, the adjacency preview, every sheet in every state, collect with the
// fly-in, and the opening ceremony for every crate x1 and x10 over 300 seeds (terminates, ends in the summary, consumes exactly the
// rolled drops, charges exactly once). Budget: well under 10 seconds.
import assert from 'node:assert/strict';
import { createUI } from '../midnight_mog/js/ui/shell.js';
import { createTownScreen, statText, srcName, previewBuild, previewSwap, readyTotals, gridFacts } from '../midnight_mog/js/ui/screens_town.js';
import { createCrateScreen, buildTimeline, summarize, priceFor, dropInfo, drawDropCard, drawCardBack, rcol } from '../midnight_mog/js/ui/screens_crate.js';
import { newProfile } from '../midnight_mog/js/sim/profile.js';
import { openCrate, CRATES, oddsTable } from '../midnight_mog/js/sim/loot.js';
import { build, plotInfo, collect, upgrade } from '../midnight_mog/js/sim/town.js';
import { BUILDINGS, STATS, adjacency, hash32 } from '../midnight_mog/js/data/buildings.js';
import { PITY_TIERS, MULTI_COUNT } from '../midnight_mog/js/data/crates.js';
import { CATS } from '../midnight_mog/js/data/cats.js';
import { CARDS } from '../midnight_mog/js/data/cards.js';
import { RELICS } from '../midnight_mog/js/data/relics.js';
import { makeRng } from '../midnight_mog/js/rng.js';
import { makeCtx } from './midnight_mog_mockctx.mjs';

const T0 = Date.now();
const NOW = 1.75e12;
const mkUI = (w = 390, h = 800) => {
  const ctx = makeCtx(w, h);
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { ctx, ui: createUI(canvas, { width: w, height: h, dpr: 2 }) };
};
const frame = (ui, screen, app, dt = 1 / 30) => { ui.begin(dt); screen.update(app, dt, ui); screen.draw(ui.ctx, app, ui); ui.end(); };
const mkApp = (profile, extra) => {
  const app = {
    profile, calls: 0, saves: 0, route: [], toasts: [], audio: null,
    setProfile(p) { this.profile = p; this.calls++; }, save() { this.saves++; },
    router: { go(id) { app.route.push(id); }, back() { app.route.push('back'); } },
    clock: NOW, now() { return this.clock; }, dayIndex() { return Math.floor(this.clock / 86400000); },
    toast(m, k) { this.toasts.push([m, k]); }, rng(key) { return makeRng(hash32(this.profile.seed, key)); },
    ...extra,
  };
  return app;
};
const richTown = (seed = 3) => {
  const p = newProfile(seed, NOW - 6 * 3600e3);
  p.cur = { fish: 5e8, yarn: 5e7, gems: 5e4, tokens: 3 };
  p.progress = { district: 5, stage: 3, best: { 1: 10, 2: 20, 3: 30, 4: 40 } };
  const lay = ['tuna_cannery', 'yarn_mill', 'smokehouse', 'scratching_post', 'tuna_cannery', 'crate_workshop', 'catnip_garden', 'nap_dome', 'gem_mine'];
  p.town.plots = [];
  for (let i = 0; i < 14; i++) p.town.plots.push(i < lay.length ? { b: lay[i], level: 3 + i * 2, t: NOW - (1 + i) * 3600e3, ...(lay[i] === 'catnip_garden' ? { opt: { district: 'alley_alamo', strain: 'rate' } } : {}) } : {});
  p.town.plots[8] = {};
  p.town.keys = { alley_crate: 4 };
  p.town.streak = { days: 3, last: Math.floor(NOW / 86400000) - 1 };
  p.lastSeen = NOW - 2000;
  return p;
};

// ------------------------------------------------------------------------------------------------ 1. town pure helpers
{
  for (const k of Object.keys(STATS)) { const s = statText(k, 1.234); assert.ok(typeof s === 'string' && s.length > 0 && !s.includes('NaN'), k); assert.ok(!s.includes('—')); }
  assert.equal(statText('fishPerSec', NaN).includes('NaN'), false);
  for (const d of BUILDINGS) for (const r of d.receives) { const n = srcName(r.src); assert.ok(n && !n.startsWith('id:') && !n.startsWith('tag:'), r.src); }
  assert.equal(srcName('empty'), 'an empty plot');

  const p = richTown();
  const facts = gridFacts(p);
  assert.ok(facts.rows >= 5 && facts.next && Number.isInteger(facts.next.x));
  assert.equal(facts.count, p.town.plots.length);
  // the preview of building b on an empty plot equals what the sim pays after really building it
  let checked = 0;
  for (const d of BUILDINGS) {
    for (let i = 0; i < p.town.plots.length; i++) {
      if (p.town.plots[i].b) continue;
      const pv = previewBuild(p, i, d.id);
      assert.ok(Number.isFinite(pv.self.potency) && pv.self.potency > 0);
      const r = build(p, d.id, i, NOW);
      if (!r.ok) continue;
      const adj = adjacency(r.profile.town.plots, i);
      assert.ok(Math.abs(adj.potency - pv.self.potency) < 1e-9, 'self potency ' + d.id + '@' + i);
      for (const o of pv.others) {
        const a = adjacency(r.profile.town.plots, o.i).potency;
        assert.ok(Math.abs(a - o.after) < 1e-9, 'other potency');
        assert.ok(Math.abs(o.after - o.before - o.delta) < 1e-9);
      }
      checked++;
    }
  }
  assert.ok(checked > 10, 'previews checked ' + checked);
  // swap preview: nothing changes about the input, deltas are symmetric in sign bookkeeping
  const before = JSON.stringify(p);
  const sw = previewSwap(p, 0, 8);
  assert.equal(JSON.stringify(p), before, 'preview never mutates');
  assert.ok(Number.isFinite(sw.gain) && Number.isFinite(sw.loss) && sw.gain >= 0 && sw.loss <= 0);
  assert.equal(previewSwap(p, 0, 0).others.length, 0);
  const infos = p.town.plots.map((_, i) => plotInfo(p, i, NOW));
  const tot = readyTotals(infos);
  assert.ok(tot.fish > 0 && tot.fullest > 0 && tot.fullest <= 1.0001);
}

// ------------------------------------------------------------------------------------------------ 2. town screen: every sheet and state
{
  const { ui, ctx } = mkUI(390, 800);
  const p = richTown();
  const app = mkApp(p);
  const scr = createTownScreen();
  scr.enter(app, {});
  for (let i = 0; i < 20; i++) frame(ui, scr, app);
  ctx.assertClean();
  const S = scr.state;
  // build sheet for every building on an empty plot (the preview chips draw)
  S.sel = -1;
  scr.openPlot(8);
  assert.equal(S.sheet, 'build');
  for (const d of BUILDINGS) {
    S.pick = d.id; S.prevKey = '';
    for (let i = 0; i < 8; i++) frame(ui, scr, app);
    assert.ok(S.prev && Number.isFinite(S.prev.self.potency));
  }
  ctx.assertClean();
  // detail sheet for every plot and every tab
  for (let i = 0; i < p.town.plots.length; i++) {
    if (!app.profile.town.plots[i].b) continue;
    scr.openPlot(i);
    for (const tab of ['info', 'levels', 'opts']) { S.tab = tab; for (let k = 0; k < 6; k++) frame(ui, scr, app); }
  }
  ctx.assertClean();
  // build for real (with the garden options), upgrade x1 and x10, all through the screen
  scr.closeSheet(); scr.openPlot(8);
  S.pick = 'catnip_garden'; S.optDistrict = 'bathtub_bay'; S.optStrain = 'hp';
  const calls0 = app.calls;
  scr.doBuild();
  assert.equal(app.calls, calls0 + 1);
  assert.equal(app.profile.town.plots[8].b, 'catnip_garden');
  assert.deepEqual(app.profile.town.plots[8].opt, { district: 'bathtub_bay', strain: 'hp' });
  assert.equal(S.sheet, 'detail');
  const lv = app.profile.town.plots[8].level;
  scr.doUpgrade(1); assert.equal(app.profile.town.plots[8].level, lv + 1);
  scr.doUpgrade(10); assert.ok(app.profile.town.plots[8].level >= lv + 2);
  for (let k = 0; k < 30; k++) frame(ui, scr, app);
  ctx.assertClean();
  // an unaffordable action never changes the profile
  const poor = JSON.stringify({ ...app.profile, cur: { fish: 0, yarn: 0, gems: 0, tokens: 0 } });
  app.profile = JSON.parse(poor); const c1 = app.calls;
  scr.doUpgrade(1); scr.closeSheet(); scr.openPlot(9); S.pick = 'tuna_cannery'; scr.doBuild();
  assert.equal(app.calls, c1);
  // move mode: pick a source, then a target, preview chips draw
  app.profile = richTown();
  scr.closeSheet(); scr.openPlot(0);
  S.moveFrom = 0; S.sheet = null; S.sel = -1;
  for (let k = 0; k < 4; k++) frame(ui, scr, app);
  scr.openPlot(8);
  assert.equal(S.moveTo, 8);
  for (let k = 0; k < 6; k++) frame(ui, scr, app);
  ctx.assertClean();
  S.moveFrom = -1; S.moveTo = -1;
  // wide and short layouts
  for (const [w, h] of [[1280, 800], [320, 568], [800, 390]]) {
    const m = mkUI(w, h), a2 = mkApp(richTown()), s2 = createTownScreen();
    s2.enter(a2, {});
    for (let k = 0; k < 6; k++) frame(m.ui, s2, a2);
    s2.openPlot(8); for (let k = 0; k < 20; k++) frame(m.ui, s2, a2);
    s2.openPlot(0); for (let k = 0; k < 20; k++) frame(m.ui, s2, a2);
    m.ctx.assertClean();
  }
}

// ------------------------------------------------------------------------------------------------ 3. collect with the fly-in, welcome back, visitor
{
  const { ui, ctx } = mkUI(390, 800);
  const p = richTown(5);
  const app = mkApp(p);
  const scr = createTownScreen();
  scr.enter(app, {});
  for (let i = 0; i < 10; i++) frame(ui, scr, app);
  const S = scr.state;
  const expect = collect(app.profile, app.now(), app.dayIndex());
  assert.ok(expect.ok && expect.gained.fish > 0);
  const fishBefore = app.profile.cur.fish;
  scr.doCollect();
  assert.equal(app.profile.cur.fish, expect.profile.cur.fish, 'screen pays exactly what collect() pays');
  assert.ok(S.hold.fish > 0, 'the strip waits for the icons');
  assert.ok(S.hold.fish <= expect.gained.fish);
  frame(ui, scr, app);
  assert.ok(S.shown.fish <= app.profile.cur.fish - S.hold.fish + 1e-6);
  assert.ok(S.shown.fish >= fishBefore - 1);
  for (let i = 0; i < 90; i++) frame(ui, scr, app);
  assert.equal(S.hold.fish, 0); assert.equal(S.hold.yarn, 0); assert.equal(S.hold.gems, 0);
  assert.equal(S.shown.fish, app.profile.cur.fish, 'after landing the strip shows the real total');
  ctx.assertClean();
  // second collect right away pays nothing and does not charge anything
  const c = app.calls; scr.doCollect(); assert.ok(app.calls === c || app.profile.cur.fish >= expect.profile.cur.fish);
  // reduced motion: no icons, no hold
  ui.setReduceMotion(true);
  const a2 = mkApp(richTown(6)), s2 = createTownScreen(); s2.enter(a2, {});
  for (let i = 0; i < 4; i++) frame(ui, s2, a2);
  s2.doCollect();
  assert.equal(s2.state.hold.fish, 0);
  for (let i = 0; i < 10; i++) frame(ui, s2, a2);
  ui.setReduceMotion(false);
  // welcome back: the gain is shown, held, then released as icons
  const p3 = richTown(7); p3.lastSeen = NOW - 9 * 3600e3;
  const a3 = mkApp(p3), s3 = createTownScreen();
  s3.enter(a3, {});
  const W3 = s3.state;
  assert.ok(W3.welcome && W3.welcome.fish > 0 && W3.welcome.seconds > 3600);
  assert.ok(a3.profile.lastSeen >= NOW, 'offline gain applied once');
  assert.ok(W3.hold.fish === W3.welcome.fish);
  for (let i = 0; i < 20; i++) frame(ui, s3, a3);
  ui.input.down(195, 800 - 50); ui.input.up(195, 800 - 50);   // somewhere harmless
  W3.welcomeClaimed = true; W3.hold.fish = 0; W3.hold.yarn = 0;
  for (let i = 0; i < 5; i++) frame(ui, s3, a3);
  const s4 = createTownScreen(); const a4 = mkApp(a3.profile);
  s4.enter(a4, {});
  assert.equal(s4.state.welcome, null, 'a second enter in the same session does not pay twice');
  // params.offline from main is shown without applying again
  const s5 = createTownScreen(); const a5 = mkApp(richTown(8));
  s5.enter(a5, { offline: { fish: 1234, yarn: 56, seconds: 7200, capped: true, efficiency: 0.35, capSeconds: 28800 } });
  assert.equal(s5.state.welcome.fish, 1234);
  for (let i = 0; i < 20; i++) frame(ui, s5, a5);
  ctx.assertClean();
  // visitor: tap the chip, the gift is paid once
  const a6 = mkApp(richTown(9)), s6 = createTownScreen(); s6.enter(a6, {});
  for (let i = 0; i < 6; i++) frame(ui, s6, a6);
  const vc = s6.state.geo.chips[1];
  assert.equal(a6.profile.town.visitor.claimed, false);
  const vx = vc.x + vc.w / 2, vy = vc.y + vc.h / 2;
  ui.input.move(vx, vy); ui.input.down(vx, vy); frame(ui, s6, a6, 1 / 60); ui.input.up(vx, vy); frame(ui, s6, a6, 1 / 60); frame(ui, s6, a6, 1 / 60);
  assert.equal(a6.profile.town.visitor.claimed, true, 'visitor claimed by tapping the chip');
  const callsAfter = a6.calls;
  ui.input.move(vx, vy); ui.input.down(vx, vy); frame(ui, s6, a6, 1 / 60); ui.input.up(vx, vy); frame(ui, s6, a6, 1 / 60); frame(ui, s6, a6, 1 / 60);
  assert.equal(a6.calls, callsAfter, 'a claimed visitor cannot be claimed again');
  // plot unlock: dialog, keyboard confirm, one more plot
  const plotsBefore = a6.profile.town.plots.length;
  a6.profile.progress.best = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
  s6.askUnlock();
  frame(ui, s6, a6); ui.input.key('tab'); frame(ui, s6, a6); ui.input.key('tab'); frame(ui, s6, a6); ui.input.key('enter'); frame(ui, s6, a6); frame(ui, s6, a6);
  assert.equal(a6.profile.town.plots.length, plotsBefore + 1, 'unlock confirmed by keyboard');
  // plot unlock confirm dialog and the crates button
  s5.state.welcomeClaimed = true;
  for (let i = 0; i < 4; i++) frame(ui, s5, a5);
  ctx.assertClean();
}

// ------------------------------------------------------------------------------------------------ 4. crate helpers
{
  for (const d of CRATES) {
    const p = newProfile(2); p.cur = { fish: 1e9, yarn: 1e9, gems: 1e9, tokens: 0 }; p.stats.crateOpens = 7;
    const r = openCrate(p, d.id, makeRng(9), { count: MULTI_COUNT });
    const pr = priceFor(p, d.id, MULTI_COUNT);
    assert.equal(r.spent.amount, pr.price, 'priceFor equals the charge ' + d.id);
    assert.equal(r.spent.cur, pr.cur);
  }
  for (const c of CATS.slice(0, 5)) assert.ok(dropInfo({ kind: 'cat', id: c.id }).name === c.name);
  for (const c of CARDS.slice(0, 5)) assert.ok(dropInfo({ kind: 'card', id: c.id }).text.length > 0);
  for (const c of RELICS.slice(0, 5)) assert.ok(dropInfo({ kind: 'relic', id: c.id }).name === c.name);
  assert.ok(dropInfo({ kind: 'yarn', id: 'yarn', amount: 50 }).name.includes('50'));
  assert.ok(dropInfo({ kind: 'cat', id: 'nope' }).name === 'nope');
  const ctx = makeCtx();
  const sample = [
    ...CATS.map((c) => ({ kind: 'cat', id: c.id, rarity: c.rarity, isNew: true, stars: 2, starsGained: 1, dupeValue: 0 })),
    ...CARDS.slice(0, 30).map((c) => ({ kind: 'card', id: c.id, rarity: c.rarity, isNew: false, dupeValue: 40, count: 3, golden: true })),
    ...RELICS.map((c) => ({ kind: 'relic', id: c.id, rarity: c.rarity, isNew: true, dupeValue: 0 })),
    { kind: 'yarn', id: 'yarn', amount: 260, rarity: 'epic' }, { kind: 'gems', id: 'gems', amount: 8, rarity: 'legend', golden: true },
    { kind: 'cat', id: 'missing', rarity: 'bogus' },
  ];
  for (const d of sample) {
    drawDropCard(ctx, d, 10, 10, 140, 196, { t: 1.3 });
    drawDropCard(ctx, d, 10, 10, 66, 92, { t: 1.3, compact: true, pop: 0.4, hl: 1 });
    drawCardBack(ctx, 10, 10, 140, 196, d.rarity, 2.2);
  }
  ctx.assertClean();
  assert.ok(rcol('mythic', 1).startsWith('#') && rcol('nope', 0).startsWith('#'));
}

// ------------------------------------------------------------------------------------------------ 5. timeline and ceremony: every crate x1 and x10 over 300 seeds
const richCrateProfile = (seed, rng) => {
  const p = newProfile(seed);
  p.cur = { fish: 1e12, yarn: 1e12, gems: 1e9, tokens: 0 };
  p.stats = { ...p.stats, crateOpens: rng.int(0, 60) };
  p.meta = { ...p.meta, crate_luck: rng.int(0, 5) };
  for (const c of CRATES) for (const t of PITY_TIERS) {
    const cfg = c.pity[t];
    if (cfg && rng.chance(0.6)) p.pity[t === 'epic' ? c.id : c.id + '@' + t] = rng.int(0, cfg.hard - 1);
  }
  // some owned things so dupes happen
  for (const c of CATS) if (rng.chance(0.5)) p.cats[c.id] = { level: 1, dupes: rng.int(0, 5), stars: 0 };
  return p;
};

let ceremonies = 0, forced = 0, goldens = 0, fakes = 0, longest = 0, longestRed = 0;
{
  const { ui } = mkUI(390, 800);
  const rUi = mkUI(390, 800);
  rUi.ui.setReduceMotion(true);
  for (const crate of CRATES) {
    for (const count of [1, MULTI_COUNT]) {
      for (let seed = 1; seed <= 300; seed++) {
        const rng = makeRng(seed * 7919 + count);
        const p0 = richCrateProfile(seed, rng);
        const useKey = false;
        const reduced = seed % 5 === 0;
        const U = reduced ? rUi.ui : ui;
        const app = mkApp(p0);
        const scr = createCrateScreen();
        scr.enter(app, { crate: crate.id });
        scr.update(app, 1 / 60, U);                               // layout, fx
        const snapshot = JSON.stringify(p0);
        // expected result: same key, same rng, straight from the sim
        const st = p0.stats;
        const key = 'crate:' + crate.id + ':' + (st.crateOpens | 0) + ':' + (st.cratesTotal | 0) + ':' + count;
        const expected = openCrate(p0, crate.id, app.rng(key), { count, useKey });
        assert.ok(scr.startOpen(crate.id, count, useKey), 'opened');
        assert.equal(scr.startOpen(crate.id, count, useKey), false, 'a second tap during the ceremony cannot open again');
        const S = scr.state;
        assert.equal(JSON.stringify(p0), snapshot, 'input profile untouched');
        assert.equal(app.calls, 1, 'exactly one commit');
        assert.deepEqual(S.res.drops, expected.drops, 'the ceremony shows the rolled drops');
        assert.deepEqual(app.profile, expected.profile, 'profile is the rolled result');
        const price = priceFor(p0, crate.id, count);
        assert.equal(app.profile.cur[price.cur], p0.cur[price.cur] - price.price + (expected.profile.cur[price.cur] - (p0.cur[price.cur] - price.price)), 'charge accounted');
        assert.equal(expected.spent.amount, price.price);
        const dropsBefore = JSON.stringify(S.res.drops);
        // timeline invariants
        const tl = S.tl;
        assert.equal(tl.n, count);
        let lastT = -1;
        for (const e of tl.events) { assert.ok(Number.isFinite(e.t) && e.t >= lastT - 1e-9, 'sorted'); lastT = e.t; }
        assert.ok(tl.total > 0 && tl.total < (reduced ? 7 : 30), 'total ' + tl.total);
        if (reduced) longestRed = Math.max(longestRed, tl.total); else longest = Math.max(longest, tl.total);
        for (const k of ['launch', 'flip', 'reveal']) assert.equal(tl.events.filter((e) => e.type === k).length, count, k + ' once per drop');
        assert.equal(tl.events.filter((e) => e.type === 'burst').length, 1);
        assert.equal(tl.events.filter((e) => e.type === 'stow').length, count > 1 ? count : 0);
        const reveals = tl.events.filter((e) => e.type === 'reveal');
        assert.deepEqual(reveals.map((e) => e.d), S.res.reveal.order, 'reveal order is the loot order');
        assert.equal(reveals[reveals.length - 1].d, S.res.reveal.finale, 'the best drop is last');
        assert.equal(tl.events[tl.events.length - 1].type, 'end');
        // run it
        let frames = 0;
        const dt = 0.05 + (seed % 3) * 0.02;
        const skipAt = seed % 7 === 0 ? 3 + (seed % 11) : -1;
        while (S.mode === 'ceremony' && frames < 2000) {
          if (frames === skipAt) scr.skipAll();
          else if (seed % 4 === 0 && frames % 9 === 4) scr.fastForward();
          else scr.update(app, dt, U);
          frames++;
        }
        assert.equal(S.mode, 'summary', 'terminates in the summary');
        assert.ok(frames < 2000);
        assert.ok(S.revealed.every(Boolean), 'every drop revealed');
        assert.equal(JSON.stringify(S.res.drops), dropsBefore, 'drops never edited');
        assert.equal(app.calls, 1, 'still exactly one commit after the ceremony');
        assert.equal(S.setProfileCalls, 1);
        assert.equal(S.summary.n, count);
        assert.equal(S.summary.news + S.summary.dupes + (S.res.drops.filter((d) => d.kind === 'yarn' || d.kind === 'gems').length), count);
        if (expected.pityHit) forced++;
        goldens += S.summary.golden;
        fakes += S.res.drops.filter((d) => d.reveal.fakeOut).length;
        ceremonies++;
      }
    }
  }
}
assert.equal(ceremonies, 3000);
assert.ok(forced > 20 && goldens > 20 && fakes > 20, 'the sweep hit hard pity, golden and fake-out cases: ' + [forced, goldens, fakes]);

// ------------------------------------------------------------------------------------------------ 6. full draws of the shop, the ceremony frames, the summary, odds and inspect
{
  const combos = [];
  for (const crate of CRATES) for (const count of [1, MULTI_COUNT]) combos.push({ crate, count, w: 390, h: 800, reduced: false });
  combos.push({ crate: CRATES[4], count: MULTI_COUNT, w: 1280, h: 800, reduced: false }, { crate: CRATES[2], count: 1, w: 320, h: 568, reduced: false },
    { crate: CRATES[4], count: MULTI_COUNT, w: 390, h: 800, reduced: true }, { crate: CRATES[0], count: 1, w: 390, h: 800, reduced: true }, { crate: CRATES[3], count: MULTI_COUNT, w: 800, h: 390, reduced: true });
  for (const { crate, count, w, h, reduced } of combos) {
    const { ui, ctx } = mkUI(w, h);
    ui.setReduceMotion(reduced);
    const rng = makeRng(hash32(crate.id, count, w));
    const app = mkApp(richCrateProfile(11 + count, rng));
    app.profile.town.keys = { [crate.id]: 12 };
    const scr = createCrateScreen();
    scr.enter(app, { crate: crate.id });
    const chk = (what) => { try { ctx.assertClean(); } catch (e) { throw new Error(what + ' ' + crate.id + ' x' + count + ' ' + w + 'x' + h + ' reduced=' + reduced + ': ' + e.message); } };
    for (let i = 0; i < 4; i++) frame(ui, scr, app, 1 / 30);                 // shop
    chk('shop');
    scr.state.odds = crate.id;
    for (let i = 0; i < 4; i++) frame(ui, scr, app, 1 / 30);                 // odds sheet
    chk('odds');
    scr.state.odds = '';
    scr.startOpen(crate.id, count, false);
    let n = 0;
    while (scr.state.mode === 'ceremony' && n < 400) { frame(ui, scr, app, 0.1); n++; }
    chk('ceremony');
    assert.equal(scr.state.mode, 'summary');
    for (let i = 0; i < 8; i++) frame(ui, scr, app, 1 / 30);                 // summary
    scr.state.inspect = count > 1 ? 3 : 0;
    for (let i = 0; i < 3; i++) frame(ui, scr, app, 1 / 30);                 // inspect
    scr.state.inspect = -1;
    // open again with a key, skip at once
    scr.startOpen(crate.id, count, true);
    frame(ui, scr, app, 1 / 30); frame(ui, scr, app, 1 / 30);
    scr.skipAll();
    for (let i = 0; i < 4; i++) frame(ui, scr, app, 1 / 30);
    assert.equal(scr.state.mode, 'summary');
    chk('skip');
  }
  // the odds sheet prints exactly the numbers the table holds
  const p = richCrateProfile(4, makeRng(4));
  for (const c of CRATES) {
    const t = oddsTable(c.id, p);
    assert.ok(Math.abs(t.rarity.reduce((s, r) => s + r.now, 0) - 1) < 1e-9);
    assert.ok(Math.abs(t.rarity.reduce((s, r) => s + r.base, 0) - 1) < 1e-9);
  }
}

// ------------------------------------------------------------------------------------------------ 7. error paths and input
{
  const { ui, ctx } = mkUI(390, 800);
  // cannot afford: nothing is charged, no ceremony, a toast tells you
  const p = newProfile(3); p.cur = { fish: 10, yarn: 10, gems: 0, tokens: 0 };
  const app = mkApp(p);
  const scr = createCrateScreen();
  scr.enter(app, {});
  frame(ui, scr, app);
  assert.equal(scr.startOpen('alley_crate', 1, false), false);
  assert.equal(scr.startOpen('mythic_crate', MULTI_COUNT, false), false);
  assert.equal(scr.startOpen('alley_crate', 1, true), false, 'no key');
  assert.equal(app.calls, 0);
  assert.equal(scr.state.mode, 'shop');
  assert.equal(scr.startOpen('no_such_crate', 1, false), false);
  // a real tap on OPEN x1 through the pointer starts the ceremony and charges once
  const rich = newProfile(4); rich.cur = { fish: 1e6, yarn: 1e6, gems: 1e4, tokens: 0 };
  const a2 = mkApp(rich); const s2 = createCrateScreen(); s2.enter(a2, { crate: 'alley_crate' });
  for (let i = 0; i < 3; i++) frame(ui, s2, a2);
  const tapAt = (x, y) => { ui.input.move(x, y); ui.input.down(x, y); frame(ui, s2, a2, 1 / 60); ui.input.up(x, y); frame(ui, s2, a2, 1 / 60); frame(ui, s2, a2, 1 / 60); };
  // find the open1 button centre: bottom row, second button
  const tryTaps = [[195 + 20, 800 - 14 - 29], [195 + 40, 800 - 14 - 29]];
  for (const [x, y] of tryTaps) { if (s2.state.mode === 'shop') tapAt(x, y); }
  assert.equal(s2.state.mode, 'ceremony', 'tap on OPEN x1 starts the ceremony');
  assert.equal(a2.calls, 1);
  // keyboard: escape in the ceremony skips
  ui.input.key('escape'); frame(ui, s2, a2); frame(ui, s2, a2);
  assert.equal(s2.state.mode, 'summary');
  assert.equal(a2.calls, 1);
  // done returns to the shop, exit is safe, enter again is clean
  s2.exit(a2); s2.enter(a2, {});
  assert.equal(s2.state.mode, 'shop');
  // enter with an open request from outside (a key drop)
  const a3 = mkApp(newProfile(5)); a3.profile.town.keys = { rooftop_crate: 2 };
  const s3 = createCrateScreen(); s3.enter(a3, { open: { crateId: 'rooftop_crate', count: 1, useKey: true } });
  frame(ui, s3, a3);
  assert.equal(s3.state.mode, 'ceremony');
  assert.equal(a3.profile.town.keys.rooftop_crate, 1, 'one key spent');
  assert.equal(a3.calls, 1);
  ctx.assertClean();
  // town: unknown audio, null audio and a throwing audio never break the ceremony
  const a4 = mkApp(richCrateProfile(9, makeRng(9)), { audio: { crateBeat() { throw new Error('boom'); }, sfx() { throw new Error('boom'); }, music() { throw new Error('boom'); }, stopMusic() {} } });
  const s4 = createCrateScreen(); s4.enter(a4, { open: { crateId: 'midnight_crate', count: 10 } });
  let k = 0; while (s4.state.mode !== 'summary' && k++ < 900) frame(ui, s4, a4, 1 / 20);
  assert.equal(s4.state.mode, 'summary');
}

// no em dashes anywhere in the new files
import { readFileSync } from 'node:fs';
for (const f of ['screens_town.js', 'screens_crate.js']) {
  const src = readFileSync(new URL('../midnight_mog/js/ui/' + f, import.meta.url), 'utf8');
  assert.ok(!src.includes('—'), f + ' has an em dash');
}
const lab = readFileSync(new URL('../midnight_mog/lab/screens_town.html', import.meta.url), 'utf8');
assert.ok(!lab.includes('—'));

const ms = Date.now() - T0;
console.log('screens town/crate ok: ' + ceremonies + ' ceremonies (hard pity ' + forced + ', golden ' + goldens + ', fake-outs ' + fakes + '), longest ' + longest.toFixed(1) + 's, reduced ' + longestRed.toFixed(1) + 's, ' + ms + 'ms');
assert.ok(ms < 10000, 'under 10 seconds, took ' + ms);
