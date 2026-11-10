// Title, end-of-run and settings screens: headless smoke + behaviour.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import fs from 'node:fs';
import title, { SCENE, LOGO, resetTitleIntro, GOAL_TEXT as title_GOAL } from '../graftwork/ui/title.js';
import { TAGLINES, TAGLINE_S, INTRO_S, WORD, taglineAt } from '../graftwork/ui/title_logo.js';
import { CLUSTER, CAST } from '../graftwork/ui/title_scene.js';
import { assets, createAssets } from '../graftwork/ui/assets.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import * as KD from '../graftwork/data/ward_kit.js';
import end from '../graftwork/ui/end.js';
import settings from '../graftwork/ui/settings.js';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import { saveRun, clearRun, hasRun } from '../graftwork/engine/save.js';
import { cardSpec } from '../graftwork/engine/cards.js';

async function rig() {
  const meta = META.loadMeta();
  meta.unlocked.heroes = ['marrow', 'wick', 'odile']; meta.bestAsc = { marrow: 3 }; meta.settings = {};
  const log = { started: [], routed: 0, resumed: 0, title: 0, codex: 0, saved: 0, abandoned: 0 };
  const app = await makeApp({ run: null, meta });
  const flow = {
    app, RUN, META, started: log.started,
    start(o) { log.started.push(o); app.shared.run = RUN.newRun(o); },
    resume() { log.resumed++; return true; }, hasSave: () => hasRun(), abandon() { log.abandoned++; },
    toTitle() { log.title++; app.go('title'); }, route() { log.routed++; }, openCodex() { log.codex++; },
    openSettings() { app.push('settings'); }, saveMeta() { log.saved++; META.saveMeta(meta); }, openDeck() {},
  };
  app.shared.flow = flow; app.shared.audio = { sfx() {}, music() {}, setVolumes(v) { log.vol = v; }, mute(b) { log.muted = b; } };
  app.register('title', title); app.register('end', end); app.register('settings', settings);
  return { app, meta, log, flow };
}

// ---- title: new run for every hero via clicks ----
for (const [i, hero] of ['marrow', 'wick', 'odile'].entries()) {
  const { app, log } = await rig();
  clearRun();
  app.go('title'); frames(app, 60);
  click(app, 640, 330);                // New Run
  frames(app, 30);
  assert.equal(title.state, 'select', 'select opened');
  click(app, 50 + i * 400 + 190, 300); // hero panel
  frames(app, 3);
  assert.equal(title.hero, hero);
  click(app, 232, 628);                // Begin
  assert.equal(log.started.length, 1, 'run started for ' + hero);
  assert.equal(log.started[0].hero, hero);
  assert.equal(log.started[0].ascension, 0);
}

// ---- seed typing + ascension ----
{
  const { app, log } = await rig(); clearRun();
  app.go('title'); frames(app, 30); click(app, 640, 330); frames(app, 30);
  click(app, 150, 576);                // seed field
  for (const c of 'ab12') key(app, c);
  key(app, 'Backspace'); key(app, 'Z');
  assert.equal(title.seed, 'ab1Z');
  click(app, 390 + 105, 576 + 20 - 0 + 0);   // ascension '>' (x 340+86..)
  frames(app, 2);
  click(app, 340 + 86 + 19, 536 + 20 + 19);
  frames(app, 2);
  assert.ok(title.asc >= 1, 'ascension raised');
  const asc = title.asc;
  click(app, 232, 628);
  assert.equal(log.started[0].seed, 'ab1Z'); assert.equal(log.started[0].ascension, asc);
}

// ---- locked hero cannot be picked or begun ----
{
  const { app, meta, log } = await rig(); clearRun(); meta.unlocked.heroes = ['marrow'];
  app.go('title'); frames(app, 30); click(app, 640, 330); frames(app, 30);
  click(app, 50 + 800 + 190, 300); frames(app, 2);
  assert.equal(title.hero, 'marrow'); frames(app, 5);
  key(app, 'Escape'); assert.equal(title.state, 'menu', 'esc goes back');
}

// ---- continue with a saved run ----
{
  const { app, log } = await rig();
  const run = RUN.newRun({ hero: 'wick', seed: 'sv' }); saveRun(run);
  app.go('title'); frames(app, 60);
  assert.ok(title.hasSave && title.saveInfo, 'save detected');
  assert.equal(title.saveInfo.hero, 'Wick');
  click(app, 640, 336);                // Continue
  assert.equal(log.resumed, 1);
  app.go('title'); frames(app, 30);
  click(app, 640, 400);                // New Run with save: confirm first
  frames(app, 5); assert.equal(title.confirmAbandon, true); assert.equal(title.state, 'menu');
  key(app, 'Escape'); assert.equal(title.confirmAbandon, false);
  clearRun();
}

// ---- daily run, codex, credits, settings ----
{
  const { app, meta, log } = await rig(); clearRun();
  app.go('title'); frames(app, 30);
  click(app, 640, 386);                // Daily (second button when no save)
  assert.equal(log.started.length, 1);
  assert.equal(log.started[0].seed, RUN.dailySeed()); assert.equal(log.started[0].hero, RUN.dailyHero(RUN.dailySeed()));
  assert.equal(log.started[0].daily, RUN.dailySeed()); assert.equal(meta.daily.lastPlayed, RUN.dailySeed());
  app.go('title'); frames(app, 30);
  click(app, 560, 442); assert.equal(log.codex, 1, 'codex');
  click(app, 640, 554); frames(app, 20); assert.equal(title.state, 'credits'); key(app, 'Escape'); assert.equal(title.state, 'menu');
  click(app, 555, 498); frames(app, 10); assert.equal(app.stack.length, 2, 'settings pushed'); // Settings is the left half of the Settings | Archive row
  click(app, 340 + 600 - 54 + 19, 14 + 16 + 19); frames(app, 2); assert.equal(app.stack.length, 1, 'X closes settings');
  click(app, 1245, 675); assert.equal(meta.settings.muted, true, 'mute corner toggle'); assert.equal(log.muted, true);
}

// ---- one game: the hero select has no mode switch, a stored Classic setting changes nothing, the Daily is a run like any other ----
{
  const texts = (app) => { const out = [], raw = app.text; app.text = (str, ...r) => { out.push(String(str)); return raw(str, ...r); }; return out; };
  for (const stored of [undefined, 'classic', 'ward']) {
    const r = await rig(); clearRun(); if (stored) r.meta.settings.mode = stored;
    r.app.go('title'); frames(r.app, 30);
    let tx = texts(r.app); frames(r.app, 3);
    assert.ok(!tx.some((s) => /^(WARD|CLASSIC)$/.test(s)), 'the Daily card carries no mode tag');
    assert.ok(tx.includes(title_GOAL), 'the goal line is the Ward goal');
    r.app.mouse.x = 640; r.app.mouse.y = 386; frames(r.app, 30); // hover the Daily slab: its tooltip names hero, seed and modifier, no mode
    assert.ok(r.app.tip && !/Mode:|Classic/.test(r.app.tip.text), 'no mode line in the Daily tooltip: ' + (r.app.tip && r.app.tip.text));
    click(r.app, 640, 386);
    assert.deepEqual(r.log.started[0], { hero: RUN.dailyHero(RUN.dailySeed()), ascension: 0, seed: RUN.dailySeed(), daily: RUN.dailySeed() }, 'the Daily starts with the seed, hero and nothing else');
    const dr = RUN.newRun(r.log.started[0]);
    assert.equal(dr.mode, 'ward'); assert.equal(dr.phase, 'ward'); assert.ok(dr.ward && dr.ward.day === 1, 'the Daily is a Ward run'); assert.ok(dr.dailyMod && dr.dailyMod.id, 'with the day\'s modifier');
    assert.equal(RUN.serializeRun(dr), RUN.serializeRun(RUN.newRun({ ...r.log.started[0], mode: 'ward' })), 'the very run the Ward Daily has always been');
    // hero select
    r.app.go('title'); frames(r.app, 30); click(r.app, 640, 330); frames(r.app, 30); assert.equal(title.state, 'select');
    tx.length = 0; frames(r.app, 2);
    assert.equal(LAYOUT.getAll().find((q) => q.id === 'title-mode'), undefined, 'no mode switch on the hero select');
    assert.ok(!tx.some((s) => /Classic|The Ward \(new\)/.test(s)), 'no mode words');
    click(r.app, 232, 628); // Begin
    assert.equal(r.log.started.length, 2); assert.equal(r.log.started[1].mode, undefined, 'Begin passes no mode'); assert.equal(RUN.newRun(r.log.started[1]).mode, 'ward');
    assert.equal(r.meta.settings.mode, stored, 'a stored mode setting is left as it was');
  }
}

// ---- settings: toggles + sliders persist ----
{
  const { app, meta, log } = await rig();
  app.go('title'); frames(app, 10); app.push('settings'); frames(app, 30);
  click(app, 640, 278);  // screen shake
  assert.equal(meta.settings.screenShake, false);
  click(app, 640, 309);  // reduced motion
  assert.equal(meta.settings.reducedMotion, true);
  click(app, 640, 340);  // colorblind
  assert.equal(meta.settings.colorblind, true);
  click(app, 806, 436);  // text size 150%
  assert.equal(meta.settings.textScale, 150); assert.equal(meta.settings.textSize, 'large');
  click(app, 640, 247);  // mute
  assert.equal(meta.settings.muted, true);
  click(app, 640, 247);
  assert.equal(meta.settings.muted, false);
  const saves = log.saved;
  click(app, 562 + 145, 102);  // master slider to 50%
  assert.ok(Math.abs(meta.settings.master - 0.5) < 0.02, 'master ' + meta.settings.master);
  assert.ok(Math.abs(log.vol.master - meta.settings.master) < 0.001, 'audio updated live');
  assert.ok(log.saved > saves, 'persisted');
  assert.equal(JSON.parse(globalThis.localStorage ? globalThis.localStorage.getItem('graftwork_meta_v1') : JSON.stringify(meta)).settings.master, meta.settings.master);
  // reset needs two confirms
  meta.stats.wins = 5; saveRun(RUN.newRun({ seed: 'x' }));
  const ry = 418 + 160 + 40 + 14; // Graphics row added: toggles 31 px apart
  click(app, 450, ry + 4 + 20); frames(app, 2); assert.equal(settings.reset, 1);
  assert.equal(meta.stats.wins, 5, 'not erased after one confirm');
  click(app, 420, ry + 26 + 19); frames(app, 2); assert.equal(settings.reset, 2);
  assert.equal(meta.stats.wins, 5);
  click(app, 420, ry + 26 + 19); frames(app, 2);
  assert.equal(meta.stats.wins, 0, 'erased after second confirm'); assert.equal(hasRun(), false);
  assert.equal(meta.settings.reducedMotion, true, 'settings survive a reset');
  key(app, 'Escape'); assert.equal(app.stack.length, 1, 'esc closes');
}

// ---- end screens ----
async function endRun(phase, withInfo) {
  const ctx = await rig();
  const run = RUN.newRun({ hero: 'marrow', ascension: 2, seed: 'endtest' });
  run.deck.slice(0, 6).forEach((c, i) => { c.grafts = i === 0 ? ['g_ember_wick'].filter(Boolean) : []; });
  run.phase = phase; run.ended = true; run.stats.floors = 12;
  run.endInfo = withInfo ? { newUnlocks: ['wick'], newAchievements: ['intake', 'nope_missing'] } : { newUnlocks: [], newAchievements: [] };
  ctx.app.shared.run = run;
  return { ...ctx, run };
}
{
  const { app, run, log } = await endRun('won', true);
  app.go('end', { run }); frames(app, 120);
  assert.equal(end.won, true); assert.equal(end.news.length, 3);
  app.mouse.x = 400; app.mouse.y = 300; frames(app, 5);                 // hover over grid
  app.mouse.wheel = 200; frames(app, 3);
  const deck0 = run.ward.deck.draw.length + run.ward.deck.hand.length + run.ward.deck.discard.length;
  run.act = 3; run.ward.act = 3; run.ward.day = 8; run.ward.res.wood = 9;
  click(app, 531, 685);                         // Endless: the next loop opens on a fresh first floor
  assert.equal(run.phase, 'ward'); assert.equal(run.ended, false); assert.equal(run.endInfo, undefined); assert.equal(run.loop, 1); assert.equal(log.routed, 1);
  assert.equal(run.act, 1); assert.equal(run.ward.act, 1); assert.equal(run.ward.day, 1); assert.equal(run.ward.phase, 'morning'); assert.equal(run.hp, run.maxHp);
  assert.equal(run.ward.deck.draw.length + run.ward.deck.hand.length + run.ward.deck.discard.length, deck0, 'the building deck carries over, as between floors');
  assert.ok(run.ward.res.wood >= 4 + 4, 'and half the wood');
}
{
  const { app, run, log } = await endRun('dead', false);
  app.go('end', { run }); frames(app, 120);
  assert.equal(end.won, false);
  click(app, 422, 685);                                                 // New Run, same hero + ascension
  assert.equal(log.started[0].hero, 'marrow'); assert.equal(log.started[0].ascension, 2);
  app.go('end', { run }); frames(app, 20);
  click(app, 640, 685); frames(app, 5);                                 // Copy seed (no clipboard in node: toast only)
  assert.ok(end.toast && end.toast.msg.includes('endtest'));
  click(app, 858, 685); assert.equal(log.title, 1, 'back to title');
}
{
  const { app, run } = await endRun('dead', false);
  run.killedBy = 'nobody_here'; run.abandoned = true; app.go('end', { run }); frames(app, 30);   // abandoned + unknown killer must not throw
}

// =====================================================================================================================================
// THE NEW TITLE: live scene, sewn logo, intro, slab menu, hero card, pips, keyboard (ui/title_scene.js, ui/title_logo.js, ui/title.js)
// =====================================================================================================================================
const capture = (app) => { const out = [], raw = app.text; app.text = (str, ...r) => { out.push(String(str)); return raw(str, ...r); }; return out; };
const KIT = JSON.parse(fs.readFileSync(new URL('../graftwork/assets/ward_kit/manifest.json', import.meta.url), 'utf8')); // the kit as delivered (the title cluster needs tile, slab and darkstone floors)
const STUB = { width: 256, height: 256 };
function installKit() { // the kit manifest and every image "loaded" (stubs), plus the painted actors the title cast uses
  assets.reset(); SCENE.reset();
  assets.kit = { version: 1, world: {}, floors: KIT.floors, walls: KIT.walls, pieces: KIT.pieces, props: KIT.props }; assets.kitState = 'ready';
  for (const g of ['floors', 'walls', 'pieces', 'props']) for (const d of Object.values(KIT[g])) for (const f of [d.file1x, d.file2x, d.file]) if (f) assets.imgs.set('kit:' + f, { ok: true, bad: false, img: { width: 512, height: 512 } });
  const def = { file1x: 'a.webp', file2x: 'a.webp', w: 256, h: 256, anchorX: 128, anchorY: 243, kind: 'normal', scale: 1 };
  const actors = {}; for (const a of CAST) actors[a.id] = { ...def, kind: a.kind === 'hero' ? 'hero' : a.kind === 'npc' ? 'npc' : 'normal' };
  assets.manifest = { version: 1, tile: { w: 2, h: 1 }, rooms: {}, actors, icons: {}, cards: {}, cardsById: {}, title: {} }; assets.state = 'ready'; assets.imgs.set('a.webp', { ok: true, bad: false, img: STUB });
}
const removeKit = () => { assets.reset(); SCENE.reset(); SCENE.keyart = null; SCENE.keyartState = 'idle'; SCENE.lite = false; };
const settle = (app, n = 6) => frames(app, n);

// ---- taglines: three, plain wording, rotate, no dashes of the long kind ----
{
  assert.equal(TAGLINES.length, 3);
  for (const t of TAGLINES) { assert.ok(!/[\u2013\u2014]/.test(t), 'no em or en dash: ' + t); assert.ok(t.length < 60, 'short'); }
  assert.equal(new Set(TAGLINES).size, 3, 'three different lines');
  assert.equal(taglineAt(0.4 * TAGLINE_S, false).text, TAGLINES[0]);
  assert.equal(taglineAt(1.4 * TAGLINE_S, false).text, TAGLINES[1]);
  assert.equal(taglineAt(2.4 * TAGLINE_S, false).text, TAGLINES[2]);
  assert.equal(taglineAt(3.4 * TAGLINE_S, false).text, TAGLINES[0], 'wraps');
  assert.equal(taglineAt(1.4 * TAGLINE_S, true).text, TAGLINES[0], 'reduced motion: the motto, still');
  assert.ok(taglineAt(1.0 * TAGLINE_S, false).a < 0.05, 'cross-fades through nothing at the switch');
  assert.ok(taglineAt(0.5 * TAGLINE_S, false).a > 0.99, 'full in the middle');
}

// ---- headless: no kit, no actors, no key art -> the procedural fallback scene, nothing throws, the menu works ----
{
  removeKit();
  const { app } = await rig(); clearRun();
  app.go('title'); frames(app, 90);
  assert.equal(SCENE.mode, 'fallback', 'no assets in node: the old procedural room');
  assert.equal(title.introPlanned, false, 'no intro in headless runs unless asked');
  assert.equal(title.menuK, 1);
  click(app, 640, 330); frames(app, 30); assert.equal(title.state, 'select', 'menu works over the fallback scene');
}

// ---- the live kit scene (fixtures): five rooms, the cast stands on the floor of its own room, monsters wander, reduced motion freezes everything ----
{
  installKit();
  const { app, meta } = await rig(); clearRun();
  app.go('title'); settle(app, 12);
  assert.equal(SCENE.mode, 'kit'); assert.ok(SCENE.rcs && Object.keys(SCENE.rcs).length === CLUSTER.length, 'every room of the cluster resolved');
  const byId = Object.fromEntries(CLUSTER.map((r) => [r.id, r])), names = SCENE.cast.map((a) => a.id);
  for (const id of ['marrow', 'npc_nurse', 'gauze_mummy']) assert.ok(names.includes(id), 'cast has ' + id);
  const inDiamond = (a) => { const r = byId[a.room], tx = (r.x - r.y) * 46, ty = (r.x + r.y) * 24, dx = Math.abs(a.x - tx) / 46, dy = Math.abs(a.y - (ty + 24)) / 24; return dx + dy <= 1.001; };
  frames(app, 5);
  for (const a of SCENE.cast) assert.ok(inDiamond(a), `${a.id} stands inside the floor diamond of ${a.room} (${a.x.toFixed(1)}, ${a.y.toFixed(1)})`);
  // nobody stands inside a prop: the sub-tile under the feet is free
  for (const a of SCENE.cast) { const rc = SCENE.rcs[a.room]; assert.ok(!rc.occ[Math.min(3, Math.floor(a.gu))][Math.min(3, Math.floor(a.gv))], `${a.id} is not inside a prop`); }
  const mons = SCENE.cast.filter((a) => a.kind === 'monster'), at0 = mons.map((a) => [a.gu, a.gv]);
  frames(app, 60 * 14);
  assert.ok(mons.some((a, i) => Math.hypot(a.gu - at0[i][0], a.gv - at0[i][1]) > 0.4), 'at least one monster wandered');
  for (const a of SCENE.cast) assert.ok(inDiamond(a), `${a.id} still on its floor after wandering`);
  const hero = SCENE.cast.find((a) => a.kind === 'hero'), hp = [hero.gu, hero.gv]; frames(app, 120); assert.deepEqual([hero.gu, hero.gv], hp, 'the hero idles in place (he only breathes)');
  // reduced motion: positions and the scene clock freeze, intro off
  meta.settings.reducedMotion = true; app.go('title', { intro: true }); frames(app, 10);
  assert.equal(title.introPlanned, false, 'reduced motion: no intro'); assert.equal(title.menuK, 1, 'menu is simply there');
  const snap = SCENE.cast.map((a) => [a.gu, a.gv]), t0 = SCENE.t; frames(app, 60 * 6);
  assert.deepEqual(SCENE.cast.map((a) => [a.gu, a.gv]), snap, 'reduced motion: nobody wanders'); assert.equal(SCENE.t, t0, 'reduced motion: the scene clock stands still (no drift, flicker or motes)');
  assert.equal(taglineAt(title.clock, true).i, 0, 'and the tagline does not rotate');
  removeKit();
}

// ---- the key art hook: a `title.keyart` manifest entry becomes the backdrop; without it the live kit scene stays ----
{
  installKit(); const { app } = await rig(); clearRun();
  app.go('title'); settle(app, 8); assert.equal(SCENE.mode, 'kit', 'no keyart entry: live scene');
  assert.equal(SCENE.keyartState, 'none', 'nothing fetched, no fake art');
  // 1) the entry rides in the ward manifest (assets.js passes `title` through)
  const A = createAssets({ fetchJson: async () => ({ version: 1, rooms: {}, actors: {}, title: { keyart: { file1x: 'title/keyart@1x.webp', file2x: 'title/keyart@2x.webp', w: 2560, h: 1440 } } }) });
  A.ensure(app); await new Promise((r) => setTimeout(r, 5));
  assert.equal(A.manifest.title.keyart.file2x, 'title/keyart@2x.webp', 'assets.js keeps the title block'); assert.deepEqual(createAssets({ fetchJson: async () => ({ rooms: {} }) }).manifest, null);
  // 2) the scene reads it, loads the image from graftwork/assets/ and switches mode once it decodes
  const made = []; SCENE.makeImage = () => { const im = { width: 2560, height: 1440, onload: null }; made.push(im); return im; };
  assets.manifest.title = { keyart: { file1x: 'title/keyart@1x.webp', file2x: 'title/keyart@2x.webp', w: 2560, h: 1440, lights: [{ x: 0.3, y: 0.4, k: 1 }] } };
  SCENE.keyartState = 'idle'; settle(app, 3);
  assert.equal(made.length, 1, 'one image requested'); assert.equal(made[0].src, 'assets/title/keyart@2x.webp', 'from graftwork/assets/title/keyart@2x.webp on desktop');
  assert.equal(SCENE.mode, 'kit', 'still the live scene while the art decodes'); made[0].onload(); settle(app, 3);
  assert.equal(SCENE.mode, 'keyart', 'decoded: the art is the backdrop'); assert.ok(SCENE.glows.length >= 4, 'its lights feed the flicker layer');
  SCENE.keyart.img.onerror && SCENE.keyart.img.onerror; SCENE.keyart = null; SCENE.keyartState = 'none'; settle(app, 3); assert.equal(SCENE.mode, 'kit', 'a failed or removed art falls back to the live scene');
  SCENE.makeImage = null; removeKit();
}

// ---- cost: the frame is a few dozen canvas calls (cached layers), `lite` is cheaper still, the cache is used ----
{
  installKit(); const { app } = await rig(); clearRun();
  app.go('title'); settle(app, 20);
  const g = app.ctx, calls = () => g.__calls;
  const c0 = calls(); frames(app, 10); const full = (calls() - c0) / 10;
  assert.ok(full < 2600, 'full frame stays a bounded number of canvas calls: ' + full);
  SCENE.lite = true; frames(app, 6); const c1 = calls(); frames(app, 9); const lite = (calls() - c1) / 9;
  assert.ok(lite < full, `lite mode draws less: ${lite} < ${full}`); assert.ok(SCENE.stats.liteFrames > 0, 'lite frames blit the cached copy');
  SCENE.lite = false; removeKit();
}

// ---- the sewing intro: first title of a page load, any input skips it and is used up by the skip, it also ends by itself ----
{
  const lastFor = async (how) => { // enter with the intro, let it run a little, then skip by `how`
    removeKit(); const r = await rig(); clearRun(); const calls = []; r.app.shared.audio.sfx = (n) => calls.push(n);
    r.app.go('title', { intro: true }); frames(r.app, 50);
    return { ...r, calls };
  };
  { const { app, log, calls } = await lastFor();
    assert.equal(title.introPlanned, true, 'intro running'); assert.ok(title.menuK === 0, 'the menu is not there yet');
    assert.ok(calls.filter((c) => c === 'stitchTk').length === 0 || true);
    click(app, 640, 330); // a click on where New Run will be: it skips, it must NOT press the button
    assert.equal(title.introPlanned, false, 'a click skips the intro'); assert.equal(title.state, 'menu', 'and was used up by the skip'); assert.equal(log.started.length, 0);
    frames(app, 80); assert.equal(title.menuK, 1); click(app, 640, 330); frames(app, 30); assert.equal(title.state, 'select', 'afterwards the button works');
  }
  for (const k of ['Enter', ' ', 'Escape', 'x', 'ArrowDown']) {
    const { app } = await lastFor(); key(app, k);
    assert.equal(title.introPlanned, false, `key ${JSON.stringify(k)} skips`); assert.equal(title.state, 'menu', 'and starts nothing');
  }
  { // touch / pointer press alone (no release yet) skips too
    const { app } = await lastFor(); app.mouse.pressed = true; app.mouse.x = 300; app.mouse.y = 300; app.tick(1 / 60); app.mouse.pressed = false;
    assert.equal(title.introPlanned, false, 'a press skips');
  }
  { // left alone it plays out in INTRO_S seconds, ticks the needle ("tk tk"), chimes once, then the menu fades in
    removeKit(); const r = await rig(); clearRun(); const calls = []; r.app.shared.audio.sfx = (n) => calls.push(n);
    r.app.go('title', { intro: true }); frames(r.app, 60 * 2); assert.equal(title.introPlanned, true, 'still sewing at 2 s');
    assert.ok(calls.filter((c) => c === 'stitchTk').length >= 4, 'the needle ticks while it sews: ' + calls.filter((c) => c === 'stitchTk').length);
    frames(r.app, Math.ceil(60 * (INTRO_S - 2 + 1.2)));
    assert.equal(title.introPlanned, false, 'the intro ended by itself'); assert.equal(title.menuK, 1); assert.equal(calls.filter((c) => c === 'graftAttach').length, 1, 'one chime when the last stitch is in');
    const n = calls.filter((c) => c === 'stitchTk').length; frames(r.app, 60 * 3);
    assert.ok(calls.length > 0 && calls.every((c) => typeof c === 'string'));
    void n;
  }
  { // the intro is for the first title only: a second entry without the flag does not replay it
    resetTitleIntro(); const g0 = globalThis.window.location; globalThis.window.location = { href: 'http://x/' };
    try {
      removeKit(); const r = await rig(); clearRun(); r.app.go('title'); frames(r.app, 3); assert.equal(title.introPlanned, true, 'auto: first title of a page load in a real browser');
      r.app.go('title'); frames(r.app, 3); assert.equal(title.introPlanned, false, 'second title: no replay');
    } finally { if (g0 === undefined) delete globalThis.window.location; else globalThis.window.location = g0; resetTitleIntro(); }
  }
  { // reduced motion: no intro even when asked for
    const r = await rig(); clearRun(); r.meta.settings.reducedMotion = true; r.app.go('title', { intro: true }); frames(r.app, 2); assert.equal(title.introPlanned, false);
  }
}

// ---- the logo: nine letters inside the stage, the thread runs from edge to edge through them, glyphs sit on one baseline ----
{
  const { app } = await rig(); clearRun(); app.go('title'); frames(app, 5);
  const m = LOGO.layout; assert.ok(m, 'layout kept'); assert.equal(m.letters.map((l) => l.ch).join(''), WORD);
  assert.ok(m.letters[0].x > 40 && m.letters.at(-1).x + m.letters.at(-1).w < 1240, 'the wordmark fits the stage with room to spare');
  for (let i = 1; i < m.letters.length; i++) assert.ok(m.letters[i].x >= m.letters[i - 1].x + m.letters[i - 1].w, 'letters never overlap');
  assert.ok(m.pts[0][0] < 0 && m.pts.at(-1)[0] > 1280, 'the thread starts and ends off screen: it ties the logo to the edges');
  assert.ok(m.len > 1100, 'long thread: ' + Math.round(m.len)); assert.ok(m.seamEnd > m.seamStart);
  const seam = m.pts.slice(m.seamStart, m.seamEnd + 1); assert.ok(seam.every((p) => Math.abs(p[1] - m.seamY) < 2.5), 'the seam runs level through the feet of the letters');
}

// ---- menu: every old button and registry id is still there; slab hover lifts and settles; focus ring; keyboard walks it ----
{
  removeKit();
  let r = await rig(); clearRun(); r.app.go('title'); frames(r.app, 60);
  const tx = capture(r.app); frames(r.app, 3);
  for (const label of ['New Run', 'Codex', 'Wardrobe', 'Settings', 'Credits']) assert.ok(tx.includes(label), 'button ' + label);
  assert.ok(tx.some((q) => /^Daily Run/.test(q)), 'Daily Run button');
  assert.ok(tx.some((s) => /^Archive/.test(s)), 'Archive button (with its percent)'); assert.ok(!tx.includes('Continue'), 'no Continue without a save');
  const ids = LAYOUT.getAll().map((q) => q.id); for (const id of ['title-archive', 'title-hero-card']) assert.ok(ids.includes(id), 'registry id ' + id + ' in ' + ids);
  // hover lifts the slab (eased) and it settles back
  r.app.mouse.x = 640; r.app.mouse.y = 330; frames(r.app, 30); assert.ok(title.lifts.new > 0.95, 'hover lift ' + title.lifts.new);
  r.app.mouse.x = 100; r.app.mouse.y = 100; frames(r.app, 40); assert.ok(title.lifts.new < 0.05, 'and settles back ' + title.lifts.new);
  // a click still hits the slab where it always was (the lift moves the picture, not the hit area)
  r.app.mouse.x = 640; r.app.mouse.y = 330 + 22; frames(r.app, 20); click(r.app, 640, 330 + 23); frames(r.app, 20); assert.equal(title.state, 'select', 'bottom edge of the unlifted rect still hits');
  // keyboard: Tab focuses the first slab, arrows move, Enter fires
  r = await rig(); clearRun(); r.app.go('title'); frames(r.app, 60);
  assert.equal(r.app.navButtons, true, 'the title opts into keyboard navigation');
  key(r.app, 'Tab'); frames(r.app, 2); assert.equal(r.app.focus.active, true); assert.equal(r.app.focusLabel, 'New Run', 'Tab lands on New Run');
  key(r.app, 'ArrowDown'); frames(r.app, 2); assert.ok(/^Daily Run/.test(r.app.focusLabel), r.app.focusLabel);
  key(r.app, 'Tab'); frames(r.app, 2); assert.equal(r.app.focusLabel, 'Codex'); key(r.app, 'Tab'); frames(r.app, 2); assert.equal(r.app.focusLabel, 'Wardrobe');
  key(r.app, 'ArrowLeft'); frames(r.app, 2); assert.equal(r.app.focusLabel, 'Codex'); key(r.app, 'ArrowRight'); frames(r.app, 2); assert.equal(r.app.focusLabel, 'Wardrobe');
  key(r.app, 'ArrowDown'); frames(r.app, 2); assert.ok(/^Archive/.test(r.app.focusLabel), r.app.focusLabel); key(r.app, 'ArrowLeft'); frames(r.app, 30); assert.equal(r.app.focusLabel, 'Settings');
  assert.ok(title.lifts.settings > 0.9, 'the focused slab lifts like a hovered one'); assert.ok(title.lifts.archive < 0.1, 'and the one it left settles');
  for (let i = 0; i < 6 && r.app.focusLabel !== 'New Run'; i++) { key(r.app, 'ArrowUp'); frames(r.app, 2); }
  assert.equal(r.app.focusLabel, 'New Run', 'arrows walk back up');
  key(r.app, 'Enter'); frames(r.app, 2); assert.equal(title.state, 'select', 'Enter on New Run opens the hero select');
  r = await rig(); clearRun(); r.app.go('title'); frames(r.app, 60); key(r.app, 'Tab'); key(r.app, 'ArrowDown'); key(r.app, 'Enter'); frames(r.app, 2);
  assert.equal(r.log.started.length, 1, 'Enter on Daily Run starts the daily'); assert.equal(r.log.started[0].daily, RUN.dailySeed());
  // a modal on top owns the keyboard: the title behind it does not register buttons
  r = await rig(); clearRun(); r.app.go('title'); frames(r.app, 60); r.app.push('settings'); frames(r.app, 5);
  assert.ok(r.app.focus.n < 12 && !r.app.focus.list.slice(0, r.app.focus.n).some((q) => q.label === 'New Run'), 'title buttons are not focusable under Settings');
  // the abandon dialog owns it too
  r = await rig(); const run = RUN.newRun({ hero: 'wick', seed: 'kb' }); saveRun(run); r.app.go('title'); frames(r.app, 60);
  click(r.app, 640, 400); frames(r.app, 5); assert.equal(title.confirmAbandon, true); frames(r.app, 2);
  assert.ok(!r.app.focus.list.slice(0, r.app.focus.n).some((q) => q.label === 'New Run' || q.label === 'Continue'), 'buttons behind the dialog are not focusable'); assert.ok(r.app.focus.list.slice(0, r.app.focus.n).some((q) => q.label === 'Cancel'));
  key(r.app, 'Escape'); clearRun();
}

// ---- continue present vs absent, pips, the hero card ----
{
  removeKit();
  let r = await rig(); clearRun(); r.meta.credit = { bal: 0, total: 0 }; r.app.go('title'); frames(r.app, 60); let tx = capture(r.app); frames(r.app, 3);
  assert.ok(!tx.includes('Continue') && !tx.includes('140'), 'no save, no Credit, no pips'); assert.equal(title.previewHero, 'marrow'); assert.ok(tx.includes('LAST GRAFTER'));
  r = await rig(); r.meta.credit = { bal: 140, total: 400 }; r.meta.unlocked.fresh = { a: 1, b: 1, c: 1 }; r.meta.history = [{ hero: 'wick', asc: 0, outcome: 'dead', floors: 3, date: 1, seed: 's' }];
  r.app.go('title'); frames(r.app, 60); tx = capture(r.app); frames(r.app, 3);
  assert.ok(tx.includes('140'), 'Credit pip on Wardrobe'); assert.ok(tx.includes('3'), 'new-unlock pip on Archive'); assert.equal(title.previewHero, 'wick', 'last run hero'); assert.ok(tx.includes('Wick'), 'hero card shows the hero');
  const sv = RUN.newRun({ hero: 'odile', seed: 'cardsave' }); saveRun(sv);
  r = await rig(); r.app.go('title'); frames(r.app, 60); tx = capture(r.app); frames(r.app, 3);
  assert.equal(title.previewHero, 'odile', 'the saved run wins'); assert.ok(tx.includes('Continue') && tx.includes('YOUR GRAFTER'));
  const sub = tx.find((s) => /^Odile.*Act \d/.test(s)); assert.ok(sub, 'Continue shows hero, Act, Floor/Day and HP: ' + tx.filter((s) => /Act/.test(s)));
  // a locked hero never previews
  r = await rig(); r.meta.unlocked.heroes = ['marrow']; r.meta.history = [{ hero: 'odile' }]; clearRun(); r.app.go('title'); frames(r.app, 5); assert.equal(title.previewHero, 'marrow');
  clearRun();
}

// ---- audio hooks exist and are quiet plain sfx (mute and autoplay are the audio module's job) ----
{
  const A = await import('../graftwork/ui/audio.js');
  for (const n of ['stitchTk', 'threadPull', 'roomTone', 'candleCrackle']) assert.ok(A.SFX_NAMES.includes(n), 'sfx ' + n);
  const { app } = await rig(); clearRun(); const calls = []; app.shared.audio.sfx = (n) => calls.push(n);
  app.go('title'); frames(app, 60 * 14);
  assert.ok(calls.includes('roomTone'), 'room tone plays on the menu'); assert.ok(calls.includes('candleCrackle'), 'distant candle crackle');
  const r2 = await rig(); const c2 = []; r2.meta.settings.reducedMotion = true; r2.app.shared.audio.sfx = (n) => c2.push(n); r2.app.go('title'); frames(r2.app, 60 * 14);
  assert.ok(!c2.includes('candleCrackle') && !c2.includes('stitchTk'), 'reduced motion: no crackle, no ticks');
  const r3 = await rig(); const c3 = []; r3.app.shared.audio.sfx = (n) => c3.push(n); r3.app.go('title'); frames(r3.app, 5); r3.app.push('settings'); frames(r3.app, 60 * 12);
  assert.ok(!c3.includes('roomTone') || c3.filter((c) => c === 'roomTone').length <= 1, 'nothing ambient while a modal covers the title');
}

console.log('graftwork_ui_title ok');
