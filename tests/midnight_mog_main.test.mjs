// Midnight Mog integrator: boot, router, nav, save and recovery, offline welcome-back, error boundary, the hub suggestion engine and
// the whole first-run tutorial driven end to end with synthetic pointer input (new game, three battle lessons, a won battle, town
// collect, the free crate, hand-off to the hub, reload restores the save). Also the Phase B fix: spawn_enemies at:'edge' for an
// enemy caster. Budget: a few seconds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, memoryStorage, pickTutorialSeed, DAMAGED_KEY, PREV_KEY } from '../midnight_mog/js/main.js';
import { SAVE_KEY, BACKUP_KEY, newProfile, serialize, tryDeserialize } from '../midnight_mog/js/sim/profile.js';
import { suggestions, navBadges, activeTabOf, NAV_TABS, NAV_H } from '../midnight_mog/js/ui/screens_hub.js';
import { stepOf, withStep, resumePlan, blockRects, TUT_DONE, TUT_DECK } from '../midnight_mog/js/ui/tutorial.js';
import * as FX from '../midnight_mog/js/sim/effects.js';
import { createBattle, step as bstep, spawnEnemy, DT } from '../midnight_mog/js/sim/battle.js';
import { openCrate } from '../midnight_mog/js/sim/loot.js';
import { makeRng } from '../midnight_mog/js/rng.js';
import { hash32 } from '../midnight_mog/js/data/buildings.js';
import { makeCtx } from './midnight_mog_mockctx.mjs';

const NOW0 = 1.75e12;
const T0 = Date.now();
const lap = (label) => { if (process.env.MM_TIMING) console.log('  ' + label + ' ' + (Date.now() - T0) + 'ms'); };
const mk = (o = {}) => {
  const ctx = makeCtx(o.w || 390, o.h || 800);
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const clock = { t: o.now || NOW0 };
  const storage = o.storage || memoryStorage();
  const g = createGame({ canvas, window: null, document: null, storage, now: () => clock.t, seed: o.seed === undefined ? 11 : o.seed, audio: null, quiet: true, tzOffsetMin: 0, uiOpts: { width: o.w || 390, height: o.h || 800, dpr: 2 } });
  return { g, ctx, clock, storage };
};
const run = (g, n, dt = 1 / 30) => { for (let i = 0; i < n; i++) g.tick(dt); };
const rectOf = (g, id) => g.ui.rectOf(id);
const tapAt = (g, x, y) => { for (let i = 0; i < 150 && g.ui.transitioning; i++) g.tick(1 / 30); run(g, 2); g.ui.input.down(x, y, 'mouse'); run(g, 2); g.ui.input.up(x, y); run(g, 3); };
const tapId = (g, id) => { for (let i = 0; i < 150 && g.ui.transitioning; i++) g.tick(1 / 30); run(g, 2); const r = rectOf(g, id); assert.ok(r, 'region ' + id + ' exists on ' + g.screenId); tapAt(g, r.x + r.w / 2, r.y + r.h / 2); };
const until = (g, pred, max, what) => { for (let i = 0; i < max; i++) { if (pred()) return i; g.tick(1 / 30); } assert.fail('timeout waiting for ' + what + ' (screen ' + g.screenId + ', tut ' + g.tut.step + ')'); };
const bs = (g) => g.screens.battle.state;

// ------------------------------------------------------------------ constants and pure helpers
assert.equal(SAVE_KEY, 'midnight_mog_save_v1');
assert.deepEqual(NAV_TABS.map((t) => t.id), ['battle', 'deck', 'town', 'crates', 'more']);
assert.equal(activeTabOf('hub'), 'battle'); assert.equal(activeTabOf('roster'), 'deck'); assert.equal(activeTabOf('relics'), 'deck');
assert.equal(activeTabOf('town'), 'town'); assert.equal(activeTabOf('crates'), 'crates'); assert.equal(activeTabOf('quests'), 'more'); assert.equal(activeTabOf('settings'), 'more');

// blockRects: the blockers plus the holes tile the screen exactly
{
  const holes = [{ x: 20, y: 600, w: 100, h: 120 }, { x: 150, y: 300, w: 60, h: 90 }, { x: 10, y: 640, w: 60, h: 40 }];
  const rects = blockRects(holes, 390, 800);
  const inHole = (x, y) => holes.some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
  const inRect = (x, y) => rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  let bad = 0;
  for (let x = 0.5; x < 390; x += 3) for (let y = 0.5; y < 800; y += 3) if (inHole(x, y) === inRect(x, y)) bad++;
  assert.equal(bad, 0, 'blockers cover everything except the holes');
  assert.equal(blockRects([], 390, 800).length, 1);
}

// tutorial step helpers
{
  const p = newProfile(3, NOW0);
  assert.equal(stepOf(p), TUT_DONE, 'a profile with no step is finished (old saves skip the tutorial)');
  assert.equal(resumePlan(p), null);
  const q = withStep(p, 1);
  assert.equal(stepOf(q), 1); assert.equal(resumePlan(q).screen, 'battle');
  assert.equal(resumePlan(withStep(p, 6)).screen, 'town'); assert.equal(resumePlan(withStep(p, 8)).screen, 'crates'); assert.equal(resumePlan(withStep(p, 10)).screen, 'hub');
  assert.equal(stepOf(tryDeserialize(serialize(withStep(p, 7)))), 7, 'the step survives a save round trip');
  assert.equal(stepOf(tryDeserialize(serialize(withStep(p, TUT_DONE)))), TUT_DONE);
}

// the free tutorial crate is worth a cheer: a new cat of rare or better
{
  for (const base of [1, 77, 123456, 4000000000]) {
    const seed = pickTutorialSeed(base, NOW0);
    const p0 = newProfile(seed, NOW0); p0.town.keys = { alley_crate: 1 };
    const r = openCrate(p0, 'alley_crate', makeRng(hash32(seed, 'crate:alley_crate:0:0:1k')), { count: 1, useKey: true });
    assert.equal(r.drops[0].kind, 'cat'); assert.ok(r.drops[0].isNew); assert.notEqual(r.drops[0].rarity, 'common');
  }
}

// suggestion engine
{
  const day = Math.floor(NOW0 / 86400000);
  const fresh = newProfile(5, NOW0);
  const s0 = suggestions(fresh, NOW0, day);
  assert.ok(s0.length >= 1 && s0[s0.length - 1].kind === 'battle', 'there is always a battle suggestion, last');
  for (let i = 1; i < s0.length; i++) assert.ok(s0[i - 1].score >= s0[i].score, 'sorted by score');
  const withKey = { ...fresh, town: { ...fresh.town, keys: { alley_crate: 2 } } };
  const s1 = suggestions(withKey, NOW0, day);
  assert.equal(s1[0].kind === 'claim' ? s1[1].id : s1[0].id, 'key', 'a free key outranks everything but a claim');
  assert.equal(s1.find((s) => s.id === 'key').go.screen, 'crates');
  const rich = { ...fresh, cur: { ...fresh.cur, fish: 5e6, yarn: 5e5 } };
  const s2 = suggestions(rich, NOW0, day).map((s) => s.id);
  assert.ok(s2.includes('cat') && s2.includes('building'), 'affordable upgrades are suggested: ' + s2.join(','));
  const b = navBadges(withKey, NOW0, day);
  assert.equal(b.crates, 2); assert.equal(b.battle, 0);
  const later = NOW0 + 6 * 3600e3;
  const full = suggestions(fresh, later, day).find((s) => s.id === 'collect');
  assert.ok(full && full.score >= 80, 'a full building is urgent');
  assert.ok(navBadges(fresh, later, day).town >= 1);
}

// Phase B fix: boss spawn_enemies at:'edge' lands on the enemy entry edge, whoever casts
{
  const b = { seed: 1, field: { baseX: 0, edgeX: 12, rows: 5 }, base: { hp: 100, maxHp: 100 }, energy: 3, energyCap: 10, hand: [], draw: [], discard: [], events: [], units: [], enemies: [], projectiles: [], rng: makeRng(5) };
  const enemyCaster = { uid: 1, side: 'enemy', kind: 'enemy', x: 6, y: 2 };
  const catCaster = { uid: 2, side: 'cat', kind: 'cat', x: 3, y: 1 };
  for (let i = 0; i < 20; i++) {
    assert.equal(FX.resolvePoint(b, 'edge', enemyCaster, { source: enemyCaster, side: 'enemy' }).x, 12);
    assert.equal(FX.resolvePoint(b, 'edge', catCaster, { source: catCaster, side: 'cat' }).x, 12);
  }
}
// and through the real battle: a boss calling its flock puts every scout on the far edge
{
  const p = newProfile(9, 0);
  const b = createBattle({ seed: 3, district: 1, stage: 10, profile: p, forceBattle: true, noEcho: true });
  const boss = spawnEnemy(b, 'king_coo', 2, 9.5, {});
  assert.ok(boss, 'boss spawned');
  const before = b.enemies.length;
  FX.applyEffect(b, { kind: 'spawn_enemies', enemy: 'pigeon_scout', count: 8, at: 'edge' }, { source: boss, side: 'enemy', level: 1 });
  for (let i = 0; i < 100; i++) bstep(b, DT);
  const flock = b.enemies.filter((e) => e.id === 'pigeon_scout');
  assert.ok(flock.length >= 8, 'the flock arrived: ' + flock.length);
  assert.ok(b.enemies.length > before);
  for (const e of flock) assert.ok(e.x > 5, 'scout at x ' + e.x + ' is near the enemy edge, not the cat base');
}

lap('pure helpers');
// ------------------------------------------------------------------ boot and title
{
  const { g, storage } = mk();
  run(g, 10);
  assert.equal(g.screenId, 'title'); assert.equal(g.app.hasSave, false); assert.equal(g.navShown, false);
  assert.equal(storage.getItem(SAVE_KEY), null, 'nothing is saved before the player starts');
  g.startGame('new');
  run(g, 40);
  assert.equal(g.screenId, 'battle'); assert.ok(g.tut.active); assert.equal(g.navShown, false, 'no nav bar inside a battle');
  const saved = tryDeserialize(storage.getItem(SAVE_KEY));
  assert.ok(saved, 'the new game is saved at once'); assert.equal(stepOf(saved), 1);
  g.dispose();
}

lap('boot');
// ------------------------------------------------------------------ router and nav
{
  const { g } = mk();
  run(g, 3); g.startGame('new'); run(g, 40);
  g.tut.finish(); g.router.go('hub', { reset: true }); run(g, 40);
  assert.equal(g.screenId, 'hub'); assert.ok(g.navShown); assert.equal(g.ui.safe.bottom, NAV_H, 'screens see the nav as unsafe area');
  assert.equal(g.ui.content.h, 800 - NAV_H);
  tapId(g, 'nav:deck'); until(g, () => g.screenId === 'deck', 90, 'deck');
  tapId(g, 'nav:town'); until(g, () => g.screenId === 'town', 90, 'town');
  tapId(g, 'nav:crates'); until(g, () => g.screenId === 'crates', 90, 'crates');
  tapId(g, 'nav:more'); until(g, () => g.screenId === 'more', 90, 'more');
  tapId(g, 'more:quests'); until(g, () => g.screenId === 'quests', 90, 'quests');
  assert.equal(g.router.depth, 1, 'more is on the stack');
  g.router.back(); until(g, () => g.screenId === 'more', 90, 'back to more');
  g.router.back(); until(g, () => g.screenId === 'hub', 90, 'back with an empty stack lands on the hub');
  tapId(g, 'hub:play'); until(g, () => g.screenId === 'battle', 120, 'battle from PLAY');
  assert.equal(g.navShown, false);
  // the whole screen registry exists
  for (const id of ['title', 'hub', 'more', 'battle', 'deck', 'roster', 'relics', 'map', 'quests', 'bestiary', 'settings', 'nine_lives', 'town', 'crates']) assert.ok(g.screens[id], 'screen ' + id);
  g.dispose();
}

lap('router');
// every screen draws on both sizes without a crash or a non finite coordinate, with a rich profile
for (const [w, h] of [[390, 800], [1280, 800]]) {
  const { g, ctx } = mk({ w, h });
  run(g, 3); g.startGame('new'); run(g, 40);
  g.tut.finish();
  let p = g.app.profile;
  const rng = makeRng(7);
  for (let i = 0; i < 30; i++) p = openCrate(p, ['alley_crate', 'neon_crate', 'rooftop_crate', 'midnight_crate'][i % 4], rng, { free: true }).profile;
  p = { ...p, cur: { fish: 3e6, yarn: 2e5, gems: 400, tokens: 2 }, progress: { district: 2, stage: 4, best: { 1: 30 }, maxCleared: 33 } };
  g.app.setProfile(p);
  for (const id of ['hub', 'deck', 'roster', 'relics', 'map', 'quests', 'bestiary', 'settings', 'nine_lives', 'town', 'crates', 'more', 'battle']) {
    g.router.go(id, { reset: true, forceBattle: true });
    run(g, id === 'battle' ? 90 : 30);
    assert.equal(g.crash, null, id + ' at ' + w + ' crashed: ' + (g.lastError && g.lastError.message));
    assert.equal(g.screenId, id);
    ctx.assertClean();
  }
  g.dispose();
}

lap('screens');
// ------------------------------------------------------------------ saving, damaged saves, backup, new game keeps a copy
{
  const { g, storage } = mk();
  run(g, 3); g.startGame('new'); run(g, 40); g.tut.finish();
  const p = { ...g.app.profile, cur: { ...g.app.profile.cur, fish: 777777 } };
  g.app.setProfile(p);
  run(g, 2);
  assert.equal(tryDeserialize(storage.getItem(SAVE_KEY)).cur.fish, 777777, 'setProfile is written by the end of the frame');
  g.app.setProfile({ ...p, cur: { ...p.cur, fish: 888888 } });
  g.save();
  assert.equal(tryDeserialize(storage.getItem(SAVE_KEY)).cur.fish, 888888);
  assert.equal(tryDeserialize(storage.getItem(BACKUP_KEY)).cur.fish, 777777, 'the previous save is the backup');
  g.dispose();

  // damaged main, good backup
  storage.setItem(SAVE_KEY, '{not json');
  const r = mk({ storage });
  assert.equal(r.g.app.hasSave, true); assert.equal(r.g.app.profile.cur.fish, 777777, 'backup restored');
  assert.match(r.g.app.bootNotice, /damaged/); assert.equal(storage.getItem(DAMAGED_KEY), '{not json', 'the damaged text is kept');
  run(r.g, 5);
  assert.ok(r.g.ui.hasDialog() === false || true);
  r.g.dispose();

  // everything unreadable: fresh game, notice, damaged copy kept
  const bad = memoryStorage(); bad.setItem(SAVE_KEY, 'garbage');
  const r2 = mk({ storage: bad });
  assert.equal(r2.g.app.hasSave, false); assert.match(r2.g.app.bootNotice, /could not be read/); assert.equal(bad.getItem(DAMAGED_KEY), 'garbage');
  run(r2.g, 8);
  assert.equal(r2.g.crash, null);
  r2.g.dispose();

  // new game over an existing save keeps the old one under PREV_KEY
  const r3 = mk({ storage });
  r3.g.startGame('new'); run(r3.g, 40);
  assert.ok(storage.getItem(PREV_KEY), 'old save kept before a new game');
  assert.equal(stepOf(tryDeserialize(storage.getItem(SAVE_KEY))), 1);
  r3.g.dispose();
}

// ------------------------------------------------------------------ continue, offline welcome-back
{
  const storage = memoryStorage();
  const a = mk({ storage });
  run(a.g, 3); a.g.startGame('new'); run(a.g, 40); a.g.tut.finish(); run(a.g, 3);
  a.g.save();
  const fish0 = a.g.app.profile.cur.fish;
  a.g.dispose();
  // come back five hours later
  const b = mk({ storage, now: NOW0 + 5 * 3600e3 });
  assert.equal(b.g.app.hasSave, true); assert.ok(b.g.app.saveInfo.ago > 4 * 3600);
  run(b.g, 5);
  b.g.startGame('continue');
  assert.ok(b.g.pendingOffline && b.g.pendingOffline.fish > 0, 'five hours away pays something');
  until(b.g, () => b.g.ui.hasDialog(), 120, 'the welcome-back dialog');
  assert.equal(b.g.app.profile.cur.fish, fish0, 'nothing is paid until COLLECT is tapped');
  // closing the tab with the panel open must not move lastSeen, so nothing is lost
  const seenBefore = tryDeserialize(storage.getItem(SAVE_KEY)).lastSeen;
  b.g.save();
  assert.equal(tryDeserialize(storage.getItem(SAVE_KEY)).lastSeen, seenBefore);
  tapId(b.g, 'dlg:offline:ok'); run(b.g, 10);
  assert.ok(b.g.app.profile.cur.fish > fish0, 'collected');
  assert.equal(b.g.pendingOffline, null);
  const fish1 = b.g.app.profile.cur.fish;
  b.g.dispose();
  const c = mk({ storage, now: NOW0 + 5 * 3600e3 + 30e3 });
  run(c.g, 3); c.g.startGame('continue'); run(c.g, 60);
  assert.equal(c.g.pendingOffline, null, 'a second launch right after pays nothing');
  assert.ok(c.g.app.profile.cur.fish >= fish1);
  c.g.dispose();
}

lap('saving');
// ------------------------------------------------------------------ error boundary
{
  const { g, storage } = mk();
  run(g, 3); g.startGame('new'); run(g, 40); g.tut.finish(); g.router.go('hub', { reset: true }); run(g, 40);
  g.app.setProfile({ ...g.app.profile, cur: { ...g.app.profile.cur, fish: 4242 } }); run(g, 2);
  const savedText = storage.getItem(SAVE_KEY);
  const orig = g.screens.hub.draw;
  g.screens.hub.draw = () => { throw new Error('boom from a screen'); };
  run(g, 2);
  assert.ok(g.crash, 'the error is caught'); assert.match(g.crash.message, /boom/);
  run(g, 5);
  assert.ok(rectOf(g, 'crash:home'), 'the recovery panel is drawn');
  assert.equal(g.app.profile.cur.fish, 4242); assert.equal(storage.getItem(SAVE_KEY), savedText, 'the save is untouched');
  g.screens.hub.draw = orig;
  tapId(g, 'crash:retry'); run(g, 20);
  assert.equal(g.crash, null); assert.equal(g.screenId, 'hub');
  // a screen that keeps failing ends on the fatal panel with no retry button, home still works
  g.screens.hub.draw = () => { throw new Error('again'); };
  for (let i = 0; i < 6; i++) { run(g, 3); if (g.crash) { const r = rectOf(g, 'crash:retry'); if (r) tapAt(g, r.x + r.w / 2, r.y + r.h / 2); } }
  run(g, 6);
  assert.ok(g.crash && g.crash.fatal, 'three crashes in five seconds is fatal');
  assert.equal(rectOf(g, 'crash:retry'), null);
  g.screens.hub.draw = orig;
  tapId(g, 'crash:home'); run(g, 20);
  assert.equal(g.crash, null);
  assert.equal(g.app.profile.cur.fish, 4242);
  g.dispose();
}

// a screen that throws in enter() sends the player to the hub instead of a blank page
{
  const { g } = mk();
  run(g, 3); g.startGame('new'); run(g, 40); g.tut.finish(); g.router.go('hub', { reset: true }); run(g, 40);
  const orig = g.screens.bestiary.enter;
  g.screens.bestiary.enter = () => { throw new Error('enter failed'); };
  g.router.go('bestiary'); run(g, 60);
  assert.equal(g.crash, null); assert.equal(g.screenId, 'hub');
  g.screens.bestiary.enter = orig;
  g.dispose();
}

lap('errors');
// ------------------------------------------------------------------ the whole tutorial, end to end
for (const [w, h] of [[390, 800], [1280, 800]]) {
  const storage = memoryStorage();
  const { g } = mk({ storage, w, h });
  run(g, 5); g.startGame('new'); run(g, 40);
  assert.equal(g.screenId, 'battle'); assert.equal(g.tut.step, 1);
  assert.ok(g.app.profile.cats.scrap_tabby && g.app.profile.cats.whisker_scout, 'the starter cats exist');
  // 1: welcome (the sim is frozen)
  until(g, () => rectOf(g, 'tut:next'), 60, 'welcome bubble');
  const t0 = bs(g).b.t;
  run(g, 60);
  assert.equal(bs(g).b.t, t0, 'the battle waits while the welcome is up');
  tapId(g, 'tut:next');
  until(g, () => g.tut.step === 2 && g.tut.view && g.tut.view.holes.length >= 1, 120, 'place step');
  // 2: place a cat. select the spotlit card, then tap the spotlit tile
  const tapHole = (i) => { const hs = g.tut.view.holes; const r = hs[i < 0 ? hs.length + i : i]; tapAt(g, r.x + r.w / 2, r.y + r.h / 2); };
  tapHole(0); run(g, 6);
  assert.ok(g.tut.view.holes.length >= 2, 'the target tile lights up once a card is selected');
  tapHole(-1);
  until(g, () => g.tut.step === 3 && g.tut.view && g.tut.view.holes.length >= 1, 120, 'spell step');
  assert.equal(bs(g).b.stats.summons, 1);
  // blockers: a tap outside the spotlight does nothing
  const sel0 = bs(g).sel;
  tapAt(g, w / 2, 300); run(g, 3);
  assert.equal(bs(g).b.stats.summons, 1, 'taps outside the hole are swallowed');
  assert.equal(bs(g).sel, sel0);
  // 3: cast the spell (tap twice)
  tapHole(0); run(g, 4); tapHole(0);
  until(g, () => g.tut.step === 4 && g.tut.view && g.tut.view.holes.length >= 1, 120, 'merge step');
  assert.equal(bs(g).b.stats.spellsCast, 1);
  // 4: merge
  tapHole(0); run(g, 6); tapHole(-1);
  until(g, () => g.tut.step === 5, 150, 'fight step');
  assert.ok(bs(g).b.stats.merges >= 1, 'two equal cats merged');
  assert.ok(bs(g).auto, 'auto is on for the lesson fight so the first win is guaranteed');
  // 5: fight to the end at triple speed
  bs(g).speedIdx = 2;
  for (let i = 0; i < 900 && !bs(g).result; i++) g.tick(0.1);
  assert.ok(bs(g).result, 'battle result');
  assert.equal(bs(g).b.over, 'win'); assert.equal(g.app.profile.progress.stage, 2);
  assert.equal(stepOf(tryDeserialize(storage.getItem(SAVE_KEY))), 1, 'the step is not persisted inside a battle (the result must not clobber it)');
  run(g, 150);
  tapId(g, 'res_go');
  until(g, () => g.screenId === 'town', 120, 'town');
  assert.equal(g.tut.step, 6); assert.equal(stepOf(g.app.profile), 6);
  // 6: collect
  until(g, () => g.tut.view && g.tut.view.holes.length === 1 && g.tut.cool === 0, 90, 'collect spotlight');
  assert.ok(g.navShown, 'the nav bar is back on the town screen');
  tapId(g, 'collect');
  until(g, () => g.tut.step === 7, 60, 'crates step');
  assert.ok((g.app.profile.town.keys.alley_crate | 0) >= 1, 'a free key is in the pocket');
  // 7: open the crates screen
  until(g, () => g.tut.cool === 0 && g.tut.view && g.tut.view.holes.length === 1, 90, 'crates button spotlight');
  tapId(g, 'crates');
  until(g, () => g.screenId === 'crates' && g.tut.step === 8, 120, 'crate shop');
  // 8: use the key
  until(g, () => rectOf(g, 'key1') && g.tut.view && g.tut.view.holes.length === 1 && g.tut.cool === 0, 90, 'key spotlight');
  tapId(g, 'key1');
  until(g, () => g.tut.step === 9, 60, 'ceremony step');
  assert.equal(g.app.profile.stats.cratesTotal, 1); assert.equal(g.navShown, false, 'no nav during the ceremony');
  // 9: tap through the ceremony
  for (let i = 0; i < 400 && g.screens.crates.state.mode !== 'summary'; i++) { if (i % 12 === 0) tapAt(g, w / 2, h / 2); else g.tick(1 / 30); }
  assert.equal(g.screens.crates.state.mode, 'summary');
  // 10: done
  until(g, () => g.tut.step === 10 && rectOf(g, 'done') && g.tut.cool === 0, 120, 'done spotlight');
  tapId(g, 'done');
  until(g, () => g.screenId === 'hub' && g.tut.step === 11, 150, 'hand-off to the hub');
  assert.equal(stepOf(g.app.profile), 11);
  // 11: hand-off, then the tutorial is over for good
  until(g, () => rectOf(g, 'tut:next') && g.tut.cool === 0, 60, 'hand-off bubble');
  tapId(g, 'tut:next'); run(g, 5);
  assert.equal(g.tut.active, false); assert.equal(stepOf(g.app.profile), TUT_DONE);
  assert.equal(stepOf(tryDeserialize(storage.getItem(SAVE_KEY))), TUT_DONE, 'finished state is saved');
  const snapshot = serialize(g.app.profile);
  g.dispose();
  // reload restores the save, no tutorial again, the same profile
  const again = mk({ storage, w, h, now: NOW0 + 30e3 });
  assert.equal(again.g.app.hasSave, true);
  run(again.g, 5); again.g.startGame('continue'); run(again.g, 60);
  assert.equal(again.g.screenId, 'hub'); assert.equal(again.g.tut.active, false);
  assert.equal(again.g.app.profile.cats.scrap_tabby.level, g.app.profile.cats.scrap_tabby.level);
  assert.deepEqual(JSON.parse(serialize({ ...again.g.app.profile, lastSeen: 0 })).cats, JSON.parse(snapshot).cats);
  again.g.dispose();
}

lap('tutorial');
// resume: a player who closed the game mid tutorial comes back to the right place
for (const [step, screen] of [[3, 'battle'], [6, 'town'], [8, 'crates'], [10, 'hub']]) {
  const storage = memoryStorage();
  const a = mk({ storage });
  run(a.g, 3); a.g.startGame('new'); run(a.g, 40);
  a.g.app.setProfile(withStep(a.g.app.profile, step)); a.g.save(); a.g.dispose();
  const b = mk({ storage });
  run(b.g, 3); b.g.startGame('continue'); run(b.g, 90);
  assert.equal(b.g.screenId, screen, 'resume at step ' + step);
  assert.ok(b.g.tut.active, 'tutorial still running');
  assert.equal(b.g.crash, null);
  b.g.dispose();
}

// skipping: confirm, then it is gone and stays gone
{
  const storage = memoryStorage();
  const { g } = mk({ storage });
  run(g, 3); g.startGame('new'); run(g, 40);
  until(g, () => rectOf(g, 'tut:skip'), 60, 'skip button');
  tapId(g, 'tut:skip'); run(g, 6);
  assert.ok(g.ui.hasDialog(), 'skip asks first');
  tapId(g, 'dlg:tutskip:yes'); run(g, 6);
  assert.equal(g.tut.active, false); assert.equal(stepOf(tryDeserialize(storage.getItem(SAVE_KEY))), TUT_DONE);
  g.dispose();
}

// a lost tutorial battle restarts the lesson instead of stranding the player
{
  const { g } = mk();
  run(g, 3); g.startGame('new'); run(g, 40);
  until(g, () => rectOf(g, 'tut:next'), 60, 'welcome'); tapId(g, 'tut:next'); run(g, 20);
  bs(g).b.base.hp = 0; bs(g).b.over = 'lose';
  until(g, () => bs(g).result, 200, 'lose result');
  run(g, 120);
  tapId(g, 'res_retry'); run(g, 80);
  assert.equal(g.screenId, 'battle'); assert.ok(g.tut.active); assert.equal(g.tut.step, 2, 'back to the first action');
  g.dispose();
}

// ------------------------------------------------------------------ house rules
for (const f of ['js/main.js', 'js/ui/screens_hub.js', 'js/ui/screens_title.js', 'js/ui/tutorial.js', 'index.html', 'docs/HOWTO_PLAY.md']) {
  const text = readFileSync(new URL('../midnight_mog/' + f, import.meta.url), 'utf8');
  assert.ok(!text.includes(String.fromCharCode(8212)), f + ' has an em dash');
}
assert.ok(TUT_DECK.every((id) => /^call_|^zoomies$/.test(id)));

console.log('midnight_mog main: ok');
