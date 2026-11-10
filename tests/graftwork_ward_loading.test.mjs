// THE WARD loads only what it draws (graftwork/design/CLEANUP_PLAN.md, phase 2). The real manifests, a loader that records every request and
// fake images the test settles by hand:
//   1 a fresh Ward asks for exactly: the two manifests, the hero, the monsters present, the eight icons, the art of the plans in hand, the plot
//     tile and the kit pieces of the rooms that are built. Nothing else, ever (no room painting, no walk frame, no second size).
//   2 a new plan in hand asks for its picture; picking a room plan up asks for its kit pieces; a built room asks for exactly its recipe; a
//     monster that checks in asks for its sprite.
//   3 no flicker: a room is its procedural block until the images of ITS recipe have settled, the kit after that, and never the block again
//     (not when images are evicted, not when the wanted size changes, not while another room loads, not when the room grows and its bigger
//     plan needs a piece that is still on its way).
//   4 "Stitching rooms" shows only while a built room waits for its kit pieces.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as WD from '../graftwork/engine/ward.js';
import { BUILD_CARDS, ROOMS } from '../graftwork/data/ward.js';
import { resolveRecipe } from '../graftwork/data/ward_kit.js';
const wardMod = await import('../graftwork/ui/ward.js');
const ward = wardMod.default, { handRects, resetWardMem } = wardMod;
const ISO = await import('../graftwork/ui/ward_iso.js');
const { assets } = await import('../graftwork/ui/assets.js');

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } finally { unhook(); } };
const read = (f) => JSON.parse(fs.readFileSync(new URL('../graftwork/' + f, import.meta.url), 'utf8'));
const WM = read('assets/ward/manifest.json'), KM = read('assets/ward_kit/manifest.json');
const W = 'assets/ward/', K = 'assets/ward_kit/';
const ICONS = ['wood', 'stone', 'gold', 'power', 'morning', 'midday', 'evening', 'night'];

// ---- the recording loader: the shared loader of the game, fed the real manifests; every image src is a request, settled by the test ----
const REQ = [], IMGS = [];
function hook() {
  assets.reset(); ISO.resetIso(); REQ.length = 0; IMGS.length = 0;
  assets.fetchJson = async (url) => { REQ.push(url); return read(url); };
  assets.makeImage = () => { const img = { width: 256, height: 256, done: false }; let src = ''; Object.defineProperty(img, 'src', { get: () => src, set(v) { src = v; REQ.push(v); IMGS.push(img); } }); return img; };
}
function unhook() { assets.fetchJson = null; assets.makeImage = null; assets.reset(); ISO.resetIso(); ISO.setWallMode('auto'); }
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = (pick = () => true, how = 'onload') => { let k = 0; for (const img of IMGS) if (!img.done && pick(img.src)) { img.done = true; img[how](); k++; } return k; };
const since = (i) => new Set(REQ.slice(i));
const sorted = (s) => [...s].sort();

// ---- what a Ward may ask for, worked out here from the run and the manifests (not from the loader) ----
const sizeOf = (two) => (d) => (two ? d.file2x : d.file1x);
function recipeFiles(type, fw, fh, two) {
  const rc = resolveRecipe(type, KM, fw, fh), f = sizeOf(two), out = new Set(); if (!rc) return out;
  out.add(K + f(KM.floors[rc.floor])); out.add(K + f(KM.walls[rc.wall]));
  for (const p of rc.pieces) out.add(K + f(KM.pieces[p.id]));
  for (const p of rc.props) out.add(K + f(KM.props[p.id]));
  if (rc.doorPiece) out.add(K + f(KM.pieces[rc.doorPiece]));
  return out;
}
function expected(run, two = true) {
  const w = run.ward, f = sizeOf(two), out = new Set([W + 'manifest.json', K + 'manifest.json']), parts = { hero: 0, monsters: 0, icons: 0, cards: 0, plot: 0, kit: 0 };
  const add = (part, url) => { if (!out.has(url)) { out.add(url); parts[part]++; } };
  add('hero', W + f(WM.actors[run.hero]));
  for (const r of Object.values(w.rooms)) {
    if ((!r.on && ROOMS[r.type].power > 0) || r.type === 'rm_theatre' || !r.contents.length) continue;
    const k0 = r.contents[0].kind;
    if (k0 === 'monster') for (const c of r.contents.slice(0, (r.w || 1) * (r.h || 1) > 1 ? 7 : 5)) { assert.ok(WM.actors[c.id], 'the test uses painted monsters: ' + c.id); add('monsters', W + f(WM.actors[c.id])); }
    else if (k0 === 'elite') { const c = r.contents[0], id = c.level >= 2 && WM.actors[c.id + '_l2'] ? c.id + '_l2' : c.id; add('monsters', W + f(WM.actors[id])); }
  }
  for (const id of ICONS) add('icons', W + f(WM.icons[id]));
  for (const c of w.deck.hand) add('cards', W + f(WM.cards[BUILD_CARDS[c.id].art]));
  if (w.phase === 'morning' && WD.buildCells(run).length) add('plot', W + f(WM.rooms.plot_empty));
  for (const r of Object.values(w.rooms)) for (const u of recipeFiles(r.type, r.w || 1, r.h || 1, two)) add('kit', u);
  return { set: out, parts };
}

async function open(o = {}) {
  resetWardMem(); hook();
  const run = RUN.newRun({ hero: o.hero || 'marrow', seed: o.seed || 'load1' });
  const meta = { settings: { reduceMotion: true, reducedMotion: true, tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } };
  const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
  if (o.px) app.px = o.px;
  app.register('ward', ward); app.register('base', { draw() {} });
  app.shared.flow = { RUN, route() { app.go(run.phase === 'ward' ? 'ward' : 'base', { run }); }, openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, resume() {}, abandon() {}, toTitle() {}, start() {} };
  if (o.layout) o.layout(run);
  return { app, run };
}
// lay rooms by hand: [type, x, y, contents]
function layout(run, spec) {
  const w = run.ward; w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1; const ids = [];
  for (const [type, x, y, contents] of spec) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: contents || [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
  w.hero.room = ids[0]; WD.wardPower(run); return ids;
}
const isKit = (id) => ISO.lastKit().rooms.has(id);
const stitching = (app) => { const out = [], raw = app.text; app.text = (s, ...r) => { out.push(String(s)); return raw(s, ...r); }; frames(app, 1); app.text = raw; return out.includes('Stitching rooms'); };

await t('a fresh Ward asks for exactly what it draws: hero, monsters present, icons, the plans in hand, the plot tile, the kit pieces of the built rooms', async () => {
  const { app, run } = await open();
  assert.equal(REQ.length, 0, 'nothing is asked for before the Ward opens');
  app.shared.flow.route(); frames(app, 2);
  assert.deepEqual(sorted(new Set(REQ)), [W + 'manifest.json', K + 'manifest.json'], 'the first frames: the two manifests and nothing else');
  await tick(); frames(app, 3);
  const want = expected(run);
  assert.deepEqual(sorted(new Set(REQ)), sorted(want.set), 'the exact set, three frames after the manifests arrived');
  assert.equal(REQ.length, new Set(REQ).size, 'no file is asked for twice');
  // the set is not trivially small: every part of it is there
  assert.equal(want.parts.hero, 1); assert.ok(want.parts.monsters >= 1, 'a fresh Ward has a monster'); assert.equal(want.parts.icons, 8);
  assert.equal(want.parts.cards, new Set(run.ward.deck.hand.map((c) => BUILD_CARDS[c.id].art)).size); assert.ok(want.parts.cards >= 3); assert.equal(want.parts.plot, 1);
  const types = new Set(Object.values(run.ward.rooms).map((r) => r.type)); assert.ok(types.size >= 4 && want.parts.kit >= 20, 'kit pieces of ' + types.size + ' room types: ' + want.parts.kit);
  const kitAll = Object.values(KM).filter((g) => g && typeof g === 'object').flatMap((g) => Object.values(g)).filter((d) => d && d.file2x).length;
  assert.ok(want.parts.kit < kitAll * 0.6, `a part of the kit, not the kit: ${want.parts.kit} of ${kitAll} images`);
  // what must never be asked for again: room paintings as rooms, walk frames, step frames, the other size
  for (const u of REQ) {
    assert.ok(!/_low@|_walk\d|_b@/.test(u), 'a removed file: ' + u);
    if (u.startsWith(W + 'rooms/')) assert.ok(u === W + WM.rooms.plot_empty.file2x || Object.values(WM.cards).some((c) => W + c.file2x === u), 'a room painting that is neither the plot tile nor a card illustration: ' + u);
    if (/\.webp$/.test(u)) assert.ok(u.endsWith('@2x.webp'), 'the desktop stage asks for @2x only: ' + u);
  }
  // nothing more while the images are still on their way, nor once they are in
  const n0 = REQ.length; frames(app, 120); assert.equal(REQ.length, n0, 'waiting asks for nothing more');
  assert.equal(settle(), n0 - 2, 'every image request was a real image'); frames(app, 200); assert.equal(REQ.length, n0, 'a loaded Ward asks for nothing more');
  for (const id of Object.keys(run.ward.rooms)) assert.ok(isKit(id), 'every built room is drawn from the kit: ' + run.ward.rooms[id].type);
  for (const api of ['preload', 'progress', 'walkReady', 'kitPreload', 'kitSettled', 'kitProgress']) assert.equal(assets[api], undefined, 'the loader has no ' + api);
});

await t('a phone stage asks for the same set at @1x', async () => {
  const { app, run } = await open({ seed: 'load2', px: 0.6 });
  app.shared.flow.route(); frames(app, 1); await tick(); frames(app, 3);
  assert.deepEqual(sorted(new Set(REQ)), sorted(expected(run, false).set));
  assert.ok(REQ.filter((u) => u.endsWith('.webp')).every((u) => u.endsWith('@1x.webp')));
});

await t('later requests are one for one: a new plan its picture, a plan picked up its kit pieces, a built room its recipe, a new monster its sprite', async () => {
  const { app, run } = await open({ seed: 'load3' });
  const w = run.ward;
  app.shared.flow.route(); frames(app, 1); await tick(); frames(app, 3); settle(); frames(app, 200);
  ISO.camZoomBy(0.4, 640, 306); frames(app, 3);
  const built = new Set(Object.values(w.rooms).map((r) => r.type)), mark = () => REQ.length;
  // two one-cell room plans the floor does not have yet, with pictures the hand does not show yet, each bringing kit pieces nobody asked for so far
  const arts = new Set(w.deck.hand.map((c) => BUILD_CARDS[c.id].art)), fresh = (c) => [...recipeFiles(c.room, 1, 1, true)].some((u) => !REQ.includes(u));
  const [planA, planB] = Object.values(BUILD_CARDS).filter((c) => c.kind === 'room' && !c.size && !built.has(c.room) && !arts.has(c.art) && fresh(c)).filter((c, i, l) => l.findIndex((o) => o.room === c.room) === i);
  assert.ok(planA && planB && planA.room !== planB.room, 'two plans to test with');
  // 1 the hand changes: the picture of the new plan, and only that
  let m = mark(); w.res.wood = 20; w.res.stone = 20;
  const inst = { uid: 9001, id: planA.id };
  w.deck.hand.push(inst); frames(app, 2);
  assert.deepEqual(sorted(since(m)), [W + WM.cards[planA.art].file2x], 'a new plan in hand: its illustration');
  settle(); frames(app, 2);
  // 2 picking the plan up (a tap selects it): the kit pieces of its room, before it is over a cell
  m = mark(); const hr = handRects(w.deck.hand.length)[w.deck.hand.length - 1];
  click(app, hr.x + hr.w / 2, hr.y + 40); frames(app, 2);
  assert.equal(app.screens.ward.st.sel, inst.uid, 'the plan is selected');
  const need = recipeFiles(planA.room, 1, 1, true), got = since(m);
  assert.ok(got.size > 0, 'it brings pieces the built rooms did not need');
  for (const u of got) assert.ok(need.has(u), 'outside the recipe of the plan picked up: ' + u);
  for (const u of need) assert.ok(REQ.includes(u), 'the recipe is complete: ' + u);
  app.screens.ward.st.sel = null; settle();
  // 3 a room built without ever dragging its plan: exactly its recipe (what the built rooms already brought is not asked for again)
  m = mark();
  const [bx, by] = WD.buildCells(run)[0], id = 'rk'; w.rooms[id] = { id, type: planB.room, x: bx, y: by, on: true, level: 1, timers: { spawn: 3 }, contents: [], upgrades: [] }; w.grid[by][bx] = id; WD.wardPower(run);
  frames(app, 2);
  const needK = recipeFiles(planB.room, 1, 1, true), gotK = since(m);
  assert.ok(gotK.size > 0); for (const u of gotK) assert.ok(needK.has(u), 'outside the recipe of the room just built: ' + u);
  for (const u of needK) assert.ok(REQ.includes(u), 'the recipe is complete: ' + u);
  assert.ok(!isKit(id), 'the new room is a block while its pieces load'); assert.ok([...built].length && Object.keys(w.rooms).filter((r) => r !== id).every(isKit), 'the rooms that were there stay on the kit meanwhile');
  settle(); frames(app, 2); assert.ok(isKit(id), 'and the kit once they are in');
  // 4 a monster checks in: its sprite
  m = mark(); const kid = w.rooms[id]; kid.contents = [{ kind: 'monster', id: 'bedpan_slime' }];
  assert.ok(!REQ.includes(W + WM.actors.bedpan_slime.file2x)); frames(app, 2);
  assert.deepEqual(sorted(since(m)), [W + WM.actors.bedpan_slime.file2x]);
  // 5 an elite at Level 2 has its own figure
  m = mark(); settle(); kid.contents = [{ kind: 'elite', id: 'the_resident', level: 2, age: 0 }]; frames(app, 2);
  assert.deepEqual(sorted(since(m)), [W + WM.actors.the_resident_l2.file2x]);
});

await t('no flicker: a room is its block until ITS recipe has settled, the kit after that, and never the block again', async () => {
  const { app, run } = await open({ seed: 'load4', layout: (r) => { layout(r, [['rm_entrance', 0, 2], ['rm_sawmill', 1, 2, [{ kind: 'monster', id: 'gauze_mummy' }]], ['rm_quarry', 2, 2]]); r.ward.deck.hand = []; } });
  const ids = Object.keys(run.ward.rooms), [ent, saw, qua] = ids, seen = Object.fromEntries(ids.map((i) => [i, []]));
  const step = (k = 1) => { for (let i = 0; i < k; i++) { frames(app, 1); for (const id of ids) seen[id].push(isKit(id)); } };
  const files = (type) => recipeFiles(type, 1, 1, true), only = (type, ...others) => [...files(type)].filter((u) => !others.some((o) => files(o).has(u)));
  assert.ok(only('rm_sawmill', 'rm_entrance').length && only('rm_quarry', 'rm_entrance', 'rm_sawmill').length, 'each room needs something the rooms before it do not');
  app.shared.flow.route(); frames(app, 1); await tick();
  step(30); assert.ok(ids.every((i) => !isKit(i)), 'nothing has arrived: three blocks'); assert.ok(stitching(app), 'and the indicator says so');
  // the entrance's pieces arrive: the entrance turns, the others wait for their own
  settle((u) => files('rm_entrance').has(u)); step(3);
  assert.deepEqual([isKit(ent), isKit(saw), isKit(qua)], [true, false, false], 'a room turns when ITS recipe is in, not when the kit is');
  assert.ok(stitching(app), 'two rooms still wait');
  // all but one piece of the sawmill: still its block (a room never shows a half loaded kit)
  const last = only('rm_sawmill', 'rm_entrance')[0];
  settle((u) => files('rm_sawmill').has(u) && u !== last); step(3); assert.equal(isKit(saw), false, 'one piece missing: the block stays');
  settle((u) => u === last); step(3); assert.deepEqual([isKit(ent), isKit(saw), isKit(qua)], [true, true, false]);
  // actors and icons still loading do not hold a room back, and are not "rooms"
  settle((u) => u.startsWith(K)); step(3); assert.ok(ids.every(isKit), 'all three on the kit');
  assert.ok(IMGS.some((i) => !i.done && i.src.startsWith(W)), 'Ward images are still on their way'); assert.equal(stitching(app), false, 'the indicator is about rooms only');
  settle(); step(60);
  // eviction: with no budget at all every image that may go goes; the kit may not
  assets.maintain(1e9, 1, 0); const gone = assets.evicted; assert.ok(gone > 0, 'the eviction did drop images: ' + gone);
  assert.ok(![...assets.imgs.keys()].some((k) => !k.startsWith('kit:')), 'everything but the kit was dropped'); const m0 = REQ.length;
  step(5); assert.ok(ids.every(isKit), 'the rooms did not notice'); assert.ok(REQ.slice(m0).every((u) => u.startsWith(W)), 'only Ward images are asked for again');
  settle(); step(30);
  // the wanted size changes (a lower quality tier, a smaller window): the pieces already decoded are drawn until the new size is in
  const m1 = REQ.length; app.px = 0.6; step(5);
  assert.ok(REQ.slice(m1).some((u) => u.startsWith(K) && u.endsWith('@1x.webp')), 'the @1x pieces are asked for'); assert.ok(ids.every(isKit), 'and the rooms stay on the kit while they load');
  settle((u) => u.startsWith(K) && u.includes('floors/')); step(5); assert.ok(ids.every(isKit), 'half way through the change');
  settle(); step(30); app.px = 1; step(30); assert.ok(ids.every(isKit));
  // the whole history: once true, never false again
  for (const id of ids) { const first = seen[id].indexOf(true); assert.ok(first > 0, 'it was a block first, then the kit'); assert.ok(seen[id].slice(first).every(Boolean), run.ward.rooms[id].type + ' went back to its block at frame ' + (first + seen[id].slice(first).indexOf(false))); }
});

await t('a kit room that grows stays on the kit: the bigger plan is drawn at once, the piece it lacks arrives later, never the block', async () => {
  const { app, run } = await open({ seed: 'load7', layout: (r) => { layout(r, [['rm_entrance', 0, 2], ['rm_ward', 1, 2]]); r.ward.deck.hand = []; } });
  const w = run.ward, [ent, wd] = Object.keys(w.rooms), small = recipeFiles('rm_ward', 1, 1, true), big = recipeFiles('rm_ward', 2, 1, true);
  const extra = [...big].filter((u) => !small.has(u) && !recipeFiles('rm_entrance', 1, 1, true).has(u));
  assert.ok(extra.length >= 1, 'the two-cell Ward has a piece the one-cell Ward does not (its screen)');
  app.shared.flow.route(); frames(app, 1); await tick(); frames(app, 3); settle(); frames(app, 30);
  assert.ok(isKit(ent) && isKit(wd)); assert.ok(!extra.some((u) => REQ.includes(u)), 'nobody has asked for it yet');
  // the Expand plan lands: the Ward is two cells from this frame on
  const g = app.ctx, fr0 = g.fillRect; let boxes = 0; g.fillRect = (x, y, bw, bh) => { if (x === -8 && y === -14 && bw === 16 && bh === 14) boxes++; }; // the placeholder of a prop without an image
  try {
    const m = REQ.length; w.rooms[wd].w = 2; w.rooms[wd].h = 1; w.grid[2][2] = wd; WD.wardPower(run);
    const hist = []; for (let i = 0; i < 40; i++) { frames(app, 1); hist.push(isKit(wd)); assert.ok(isKit(ent)); }
    assert.ok(hist.every(Boolean), 'the grown Ward is drawn from the kit on every frame, from the first: ' + hist.map(Number).join(''));
    assert.deepEqual(sorted(since(m)), sorted(extra), 'and asks for exactly the piece its bigger plan lacks');
    const info = ISO.lastKit().rooms.get(wd); assert.equal(info.key, 'rm_ward#0@2x1', 'the two-cell plan'); assert.equal(info.part, true, 'drawn in part while that piece loads');
    assert.equal(boxes, 0, 'a piece on its way is left out, not drawn as a placeholder'); assert.ok(stitching(app), 'the indicator shows: a built room waits for a piece');
    settle(); frames(app, 3); assert.ok(isKit(wd)); assert.equal(ISO.lastKit().rooms.get(wd).part, false, 'complete'); assert.equal(stitching(app), false);
    assert.equal(REQ.length, m + extra.length, 'nothing else was asked for');
  } finally { g.fillRect = fr0; }
  // a new floor starts over: a room id that was a kit room on the old floor is a block again until its own recipe is in
  resetWardMem(); const run2 = RUN.newRun({ hero: 'marrow', seed: 'load8' }); layout(run2, [['rm_entrance', 0, 2], ['rm_quarry', 1, 2]]); run2.ward.deck.hand = [];
  app.shared.run = run2; app.shared.flow.route = () => app.go('ward', { run: run2 }); app.shared.flow.route(); frames(app, 3);
  const [ent2, qua2] = Object.keys(run2.ward.rooms); assert.equal(qua2, wd, 'the same room id as the Ward of the old floor');
  assert.ok(isKit(ent2), 'the entrance pieces are in'); assert.equal(isKit(qua2), false, 'the quarry waits for its own pieces: it never showed the kit on this floor');
  settle(); frames(app, 3); assert.ok(isKit(qua2));
});

await t('a failed texture leaves the block for good: no kit, no flicker, no indicator', async () => {
  const { app, run } = await open({ seed: 'load5', layout: (r) => { layout(r, [['rm_entrance', 0, 2], ['rm_quarry', 1, 2]]); r.ward.deck.hand = []; } });
  const [ent, qua] = Object.keys(run.ward.rooms), rcQ = resolveRecipe('rm_quarry', KM), rcE = resolveRecipe('rm_entrance', KM);
  assert.notEqual(rcQ.wall, rcE.wall, 'the two rooms have different walls');
  app.shared.flow.route(); frames(app, 1); await tick(); frames(app, 3);
  settle((u) => u === K + KM.walls[rcQ.wall].file2x, 'onerror'); settle(); frames(app, 3);
  const hist = []; for (let i = 0; i < 90; i++) { frames(app, 1); hist.push(isKit(qua)); assert.ok(isKit(ent)); }
  assert.ok(hist.every((v) => v === false), 'the quarry stays a block'); assert.equal(stitching(app), false, 'nothing is still loading');
});

await t('headless: no loader, no requests, procedural rooms and no indicator', async () => {
  unhook(); resetWardMem();
  const run = RUN.newRun({ hero: 'marrow', seed: 'load6' });
  const app = await makeApp({ run, meta: { settings: { tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } }, audio: { sfx() {}, music() {} } });
  app.register('ward', ward); app.shared.flow = { RUN, route() {}, openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false };
  app.go('ward', { run }); frames(app, 30);
  assert.equal(assets.imgs.size, 0); assert.equal(ISO.lastKit().rooms.size, 0); assert.equal(stitching(app), false);
});

console.log(n + ' ward loading checks passed');
