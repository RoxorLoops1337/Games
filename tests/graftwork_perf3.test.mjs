// Performance and bug fixes found by the reviews (graftwork/design/CLEANUP_PLAN.md, the section of that name). One check per fix, each written to fail on
// the code before it:
//   Ward backdrop     one cached layer blitted per frame, baked once per act (it was painted live, then dimmed, every frame)
//   post quality      one controller: 20 s of 33.3 ms frames (the 30 fps idle cap) leave the post tier at the Effects setting
//   born stamps       a monster that checked in during one Ward visit is visible after the next; no gait value goes non-finite
//   template switch   no request for assets/ui/manifest.json while the art preview (ui/preview.js) is off
//   small ones        mip level 0 is the decoded image, unlock state is read once per visit, display-mode queries are made once, the wall plan is kept
// The baked colour grade of the battle figures has its own suite (graftwork_grade.test.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApp, frames, fakeCtx } from './graftwork_lib.mjs';

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };

// ---- a recording canvas world (installed before any game module loads): which canvases exist, what is drawn into them, which patterns are made
const REC = { canvases: [], draws: [], pats: [], gl: null };
globalThis.DOMMatrix = class { constructor(a) { this.m = a; } };
globalThis.document = {
  addEventListener() {},
  createElement: () => {
    let ctx = null;
    const c = {
      width: 0, height: 0, style: {}, addEventListener() {}, setAttribute() {},
      getContext(type) {
        if (type === 'webgl2') return REC.gl ? REC.gl() : null;
        if (ctx) return ctx;
        ctx = fakeCtx(); ctx.canvas = c;
        const noop = ctx.save; // the harness's counting no-op: __calls still counts what we record
        ctx.drawImage = (...a) => { REC.draws.push({ on: c, a }); noop(); };
        ctx.createPattern = (src) => { REC.pats.push(src); return { setTransform() {} }; };
        return ctx;
      },
    };
    REC.canvases.push(c); return c;
  },
};
// a clock the tests move by hand
let clock = 1000; Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });

const RUN = await import('../graftwork/engine/run.js');
const WD = await import('../graftwork/engine/ward.js');
const { ENEMIES } = await import('../graftwork/data/index.js');
const wardMod = await import('../graftwork/ui/ward.js');
const ward = wardMod.default, { resetWardMem, wardInterlude } = wardMod;
const ISO = await import('../graftwork/ui/ward_iso.js');
const { assets } = await import('../graftwork/ui/assets.js');
const NORMAL1 = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal' && !e.summonOnly && !e.minion).map((e) => e.id);
const mons = (k, nn = 2) => Array.from({ length: nn }, (_, i) => ({ kind: 'monster', id: NORMAL1[(i + k) % NORMAL1.length] }));

// the Ward screen harness (as tests/graftwork_ui_ward_kit.test.mjs)
async function setup(o = {}) {
  resetWardMem(); if (!assets.kit) ISO.resetIso();
  const run = RUN.newRun({ hero: 'marrow', seed: o.seed || 'perf3' });
  const motion = !!o.motion;
  const meta = { settings: { reduceMotion: !motion, reducedMotion: !motion, tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } };
  const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
  app.ctx.measureText = (s) => { const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), size = m ? +m[1] : 16; return { width: String(s).length * size * (/bold/.test(f) ? 0.56 : 0.52) }; };
  app.register('ward', ward); app.register('base', { draw() {} });
  const flow = { RUN, route() { const scr = run.phase === 'ward' ? 'ward' : 'base'; if (scr !== 'ward' && wardInterlude(app, run, scr)) return; app.go(scr, { run }); }, openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, resume() {}, abandon() {}, toTitle() {}, start() {} };
  app.shared.flow = flow;
  return { app, run, meta, flow };
}
function layout(run, spec) {
  const w = run.ward;
  w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
  const ids = [];
  for (const [type, x, y, contents] of spec) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: contents || [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
  const th = 'r' + w.nextRoom++; w.rooms[th] = { id: th, type: 'rm_theatre', x: 8, y: 5, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[5][8] = th;
  w.hero.room = ids[0]; WD.wardPower(run);
  return ids;
}
// the kit as delivered, with fake decoded images (512 x 512 each)
const KIT = JSON.parse(fs.readFileSync(new URL('../graftwork/assets/ward_kit/manifest.json', import.meta.url), 'utf8'));
function installKit() {
  assets.reset(); ISO.resetIso();
  assets.kit = { version: 1, world: {}, floors: KIT.floors, walls: KIT.walls, pieces: KIT.pieces, props: KIT.props }; assets.kitState = 'ready';
  for (const g of ['floors', 'walls', 'pieces', 'props']) for (const d of Object.values(KIT[g])) for (const f of [d.file1x, d.file2x, d.file]) if (f) assets.imgs.set('kit:' + f, { ok: true, bad: false, img: { width: 512, height: 512, kitImg: g } });
}
const removeKit = () => { assets.reset(); ISO.resetIso(); };

// ------------------------------------------------------------------ the Ward backdrop
await t('Ward backdrop: one cached layer, one blit per frame, baked once per act (never painted live, never dimmed live)', async () => {
  const { app, run } = await setup();
  layout(run, [['rm_entrance', 2, 2], ['rm_ward', 3, 2, mons(0)]]);
  app.go('ward', { run });
  const main = app.ctx, calls = []; let fill = '';
  Object.defineProperty(main, 'fillStyle', { configurable: true, get: () => fill, set: (v) => { fill = v; } });
  main.drawImage = (...a) => { calls.push({ op: 'drawImage', a }); };
  main.fillRect = (...a) => { calls.push({ op: 'fillRect', a, fill }); };
  frames(app, 3);
  const perFrame = [];
  for (let i = 0; i < 5; i++) { calls.length = 0; frames(app, 1); perFrame.push(calls.slice()); }
  const stageDim = (c) => c.op === 'fillRect' && c.a[0] === 0 && c.a[1] === 0 && c.a[2] === 1280 && c.a[3] === 720 && c.fill === 'rgba(8,6,5,.5)';
  for (const fr of perFrame) assert.equal(fr.filter(stageDim).length, 0, 'the 50 percent dim is part of the baked layer: no frame fills the stage with it');
  const layer = wardMod.backdropLayer(run.act), stats = wardMod.backdropStats;
  assert.ok(layer && layer.width === 1280 && layer.height === 720, 'a stage-size layer (stage units, like every background layer)');
  assert.equal(stats.bakes, 1, 'baked once');
  for (const fr of perFrame) {
    const blits = fr.filter((c) => c.op === 'drawImage' && c.a[0] === layer);
    assert.equal(blits.length, 1, 'one blit of the layer per frame'); assert.deepEqual(blits[0].a.slice(1), [0, 0]);
    assert.equal(fr.indexOf(blits[0]), 0, 'and it is the first thing the frame draws: nothing of the backdrop is painted live before it');
  }
  // the layer holds the backdrop (its painters drew into it) and is not touched again
  const lctx = layer.getContext('2d'), painted = lctx.__calls;
  assert.ok(painted > 20 && REC.draws.some((d) => d.on === layer), 'the backdrop painters ran on the layer: ' + painted + ' calls');
  frames(app, 20);
  assert.equal(lctx.__calls, painted, 'no repaint while the act stays'); assert.equal(stats.bakes, 1);
  // a different backing size changes nothing (the blit scales): still one bake
  app.px = 2.5; frames(app, 2); assert.equal(stats.bakes, 1); app.px = 1;
  // a new act repaints the one layer that is kept
  run.act = 2; frames(app, 2);
  assert.equal(stats.bakes, 2, 'act 2: baked again'); assert.equal(wardMod.backdropLayer(2), layer, 'the same canvas is reused'); assert.ok(lctx.__calls > painted);
  const p2 = lctx.__calls; frames(app, 10); assert.equal(lctx.__calls, p2);
  run.act = 3; frames(app, 1); assert.equal(stats.bakes, 3);
  run.act = 1; frames(app, 1); assert.equal(stats.bakes, 4);
});

// ------------------------------------------------------------------ one quality controller
await t('post quality: one controller. 20 s of 33.3 ms frames with the governor capped leave the post tier at the Effects setting', async () => {
  // a WebGL2 that compiles, links and completes its framebuffers, so the pass really builds
  const K = new Map(), konst = (k) => { if (!K.has(k)) K.set(k, 0x9000 + K.size); return K.get(k); };
  REC.gl = () => new Proxy({}, { get(o, k) {
    if (typeof k !== 'string') return undefined;
    if (/^[A-Z][A-Z0-9_]*$/.test(k)) return konst(k);
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'checkFramebufferStatus') return () => konst('FRAMEBUFFER_COMPLETE');
    if (k === 'getExtension') return () => ({ loseContext() {} });
    return () => ({});
  } });
  try {
    const { createApp } = await import('../graftwork/ui/core.js'), { installPost } = await import('../graftwork/ui/post.js');
    const inserted = [], removed = [];
    const parent = { insertBefore: (el) => { inserted.push(el); el.parentNode = parent; }, removeChild: (el) => { removed.push(el); el.parentNode = null; } };
    const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, parentNode: parent, nextSibling: null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
    const meta = { settings: { quality: 'high', graphics: 'high' } };
    const app = createApp(canvas, { shared: { meta } }); app.resize(); app.perf.q.setMode('high');
    installPost(app);
    const post = app.post;
    assert.equal(post.stats.tier, 'high', 'the post starts at the Effects setting'); assert.equal(post.on, true); assert.equal(inserted.length, 1, 'the GL canvas is in the page');
    // the idle title: the governor holds 30 fps, so for 20 s every frame comes 33.3 ms after the last
    app.perf.gov.capped = true;
    const seen = new Set();
    for (let i = 0; i < 600; i++) { clock += 33.3; post.render(); seen.add(post.stats.tier); }
    assert.deepEqual([...seen], ['high'], 'the tier never left the setting (the old controller dropped High to Low after 5 s)');
    assert.equal(post.on, true); assert.equal(removed.length, 0, 'the GL context was not torn down');
    // the same 20 s at Effects Low (the old controller switched the post off there and tore the GL context down)
    meta.settings.quality = 'low'; clock += 33.3; post.render(); assert.equal(post.stats.tier, 'low');
    seen.clear(); for (let i = 0; i < 600; i++) { clock += 33.3; post.render(); seen.add(post.stats.tier); }
    assert.deepEqual([...seen], ['low']); assert.equal(post.on, true); assert.equal(removed.length, 0);
    meta.settings.quality = 'high'; clock += 33.3; post.render(); assert.equal(post.stats.tier, 'high');
    // it measures nothing at all: slow frames at Graphics High do not move it either (ui/quality.js alone decides the tier, and High pins it)
    for (let i = 0; i < 300; i++) { clock += 90; post.render(); }
    assert.equal(post.stats.tier, 'high');
    assert.equal('autoQuality' in post, false, 'no second controller'); for (const k of ['drops', 'rises', 'avgFrame', 'ceiling']) assert.equal(k in post.stats, false, k);
    // the one controller: lite and minimal switch the post off, full brings back the setting
    app.perf.q.setMode('low'); clock += 16; post.render();
    assert.equal(post.stats.tier, 'off'); assert.equal(post.on, false); assert.equal(removed.length, 1);
    app.perf.q.setMode('high'); clock += 16; post.render();
    assert.equal(post.stats.tier, 'high'); assert.equal(inserted.length, 2);
    // the Effects row (Settings) is the tier
    meta.settings.quality = 'low'; clock += 16; post.render(); assert.equal(post.stats.tier, 'low');
    meta.settings.quality = 'off'; clock += 16; post.render(); assert.equal(post.stats.tier, 'off');
    meta.settings.quality = 'high'; clock += 16; post.render(); assert.equal(post.stats.tier, 'high');
    // setQuality stays
    post.setQuality('low'); assert.equal(post.stats.tier, 'low'); post.setQuality('bogus'); assert.equal(post.stats.tier, 'low'); post.setQuality('off'); assert.equal(post.on, false);
  } finally { REC.gl = null; }
});

// ------------------------------------------------------------------ stamps of the screen clock
await t('Ward stamps: a stamp ahead of the clock counts as finished', () => {
  assert.equal(ISO.bornAlpha(undefined, 5), 1); assert.equal(ISO.bornAlpha(5, 5), 0); assert.ok(Math.abs(ISO.bornAlpha(5, 5.175) - 0.5) < 1e-9); assert.equal(ISO.bornAlpha(5, 6), 1);
  assert.equal(ISO.bornAlpha(95, 2), 1, 'a stamp from an earlier visit never hides anyone'); assert.equal(ISO.bornAlpha(NaN, 2), 1);
});
await t('Ward stamps: spawn while on the Ward, leave, come back: every actor is drawn with alpha 1', async () => {
  const { app, run } = await setup();
  const ids = layout(run, [['rm_entrance', 2, 2], ['rm_ward', 3, 2, mons(0, 2)]]);
  app.go('ward', { run }); frames(app, 5);
  frames(app, 95, 1); // 95 s on the Ward
  assert.ok(ward.st.t > 90, 'the screen clock ran: ' + ward.st.t);
  run.ward.rooms[ids[1]].contents.push({ kind: 'monster', id: NORMAL1[2] }); // a monster checks in while the Ward is on screen
  frames(app, 1);
  let ms = ISO.lastActors().filter((a) => a.kind === 'monster');
  const newcomer = ms.find((a) => a.id === NORMAL1[2]);
  assert.equal(ms.length, 3); assert.ok(newcomer.alpha < 1, 'the newcomer fades in: ' + newcomer.alpha); assert.ok(ms.every((a) => a === newcomer || a.alpha === 1), 'the others stay');
  frames(app, 40); ms = ISO.lastActors().filter((a) => a.kind === 'monster'); assert.ok(ms.every((a) => a.alpha === 1), 'and is there after the fade');
  app.go('base'); frames(app, 3); app.go('ward', { run }); // a fight elsewhere, then back: the screen clock starts again at 0
  assert.ok(ward.st.t < 1);
  for (let i = 0; i < 20; i++) {
    frames(app, 1);
    const all = ISO.lastActors(); ms = all.filter((a) => a.kind === 'monster');
    assert.equal(ms.length, 3, 'all three monsters stand in the room');
    for (const a of all) assert.equal(a.alpha, 1, `frame ${i}: ${a.kind} ${a.id} is drawn with alpha ${a.alpha}`);
  }
});
await t('Ward stamps: after a visit with walking, no figure has a non-finite squash on the next visit (foot plants are reset)', async () => {
  const { app, run } = await setup({ motion: true, seed: 'perf3walk' });
  layout(run, [['rm_entrance', 2, 2], ['rm_ward', 3, 2, mons(0, 3)], ['rm_ward', 2, 3, mons(1, 3)]]);
  app.go('ward', { run });
  let walked = 0;
  for (let i = 0; i < 1900; i++) { frames(app, 1, 0.05); for (const a of ISO.lastActors()) if (a.kind === 'monster' && a.vk > 0.3) walked++; } // 95 s: the monsters wander
  assert.ok(ward.st.t > 90 && walked > 20, 'monsters walked during the visit: ' + walked);
  app.go('base'); frames(app, 3); app.go('ward', { run });
  for (let i = 0; i < 30; i++) {
    frames(app, 1, 0.016);
    for (const a of ISO.lastActors()) if (a.kind !== 'token') assert.ok(Number.isFinite(a.sq) && a.sq > 0.5 && a.sq < 1.5, `frame ${i}: ${a.kind} ${a.id} squash ${a.sq}`);
  }
});

// ------------------------------------------------------------------ the template art switch
await t('templates: no request is made while the art preview is off (no manifest, no image), and the switch is the only thing in the way', async () => {
  const T = await import('../graftwork/ui/templates.js');
  const { PREVIEW_DEFAULT } = await import('../graftwork/ui/preview.js');
  const tick = () => new Promise((r) => setTimeout(r, 0));
  let fetched = 0, images = 0;
  const fetchJson = () => { fetched++; return Promise.resolve({ frames: { panel: { file: 'p.webp', w: 48, h: 48, slice: [12, 12, 12, 12] } } }); }, makeImage = () => { images++; return {}; };
  // the shipped default: whatever fetch it is given, it asks for nothing (and stays idle, so the Settings toggle can still turn it on)
  const L = T.createTemplates({ live: true, fetchJson, makeImage });
  L.ensure({}); L.ensure({}); L.preload({}); await tick();
  assert.equal(fetched, 0, 'no manifest request'); assert.equal(images, 0, 'no image request');
  assert.equal(L.on, false); assert.equal(L.state, 'idle'); assert.equal(L.ready(), false); assert.equal(L.available(), false); assert.equal(L.frameImg('panel'), null); assert.equal(L.pickFrame(['panel']), null);
  // the real browser path (global fetch, Image, window.location): a page load asks for nothing under assets/ui
  const g = globalThis, keep = { fetch: g.fetch, Image: g.Image, loc: g.window && g.window.location };
  const urls = [];
  g.fetch = (u) => { urls.push(String(u)); return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) }); };
  g.Image = class { }; g.window = g.window || {}; g.window.location = { href: 'http://localhost/graftwork/' };
  try {
    const P = T.createTemplates(); P.ensure({}); await tick();
    T.templates.reset(); T.templates.ensure({}); await tick(); // the singleton every panel, button and card face asks
    const { app } = await setup(); app.go('ward', { run: app.shared.run }); frames(app, 3); await tick(); // a real screen full of panels and buttons
    assert.deepEqual(urls, [], 'the page requests nothing for the painted art');
    // the preview setting on: the very same loader asks once; the minimal graphics tier keeps it off
    const low = T.createTemplates(); low.ensure({ shared: { meta: { settings: { previewArt: true } } }, perf: { q: { tier: 'minimal' } } }); await tick();
    assert.deepEqual(urls, [], 'minimal tier: nothing is asked for even with the setting on');
    const Q = T.createTemplates(); Q.ensure({ shared: { meta: { settings: { previewArt: true } } } }); Q.ensure({ shared: { meta: { settings: { previewArt: true } } } }); await tick();
    assert.deepEqual(urls, ['assets/ui/manifest.json'], 'with the preview on the manifest is requested, once'); assert.equal(Q.state, 'none', 'a 404 still degrades to the procedural look');
  } finally { g.fetch = keep.fetch; g.Image = keep.Image; if (g.window) g.window.location = keep.loc; T.templates.reset(); }
  const R = T.createTemplates({ art: true, live: true, fetchJson, makeImage }); R.ensure({}); await tick(); assert.equal(fetched, 1); assert.ok(R.ready());
  // the switch itself: one place (ui/preview.js). The default may only be on while the art it turns on is in the repo, and the docs name it.
  assert.ok(!PREVIEW_DEFAULT.art || fs.existsSync(new URL('../graftwork/assets/ui/manifest.json', import.meta.url)), 'PREVIEW_DEFAULT.art may be on only while graftwork/assets/ui/manifest.json exists');
  assert.equal(T.TEMPLATE_ART, undefined, 'the old constant is gone: ui/preview.js is the one switch');
  const doc = fs.readFileSync(new URL('../graftwork/design/ART_MODULAR.md', import.meta.url), 'utf8');
  assert.ok(/ui\/preview\.js/.test(doc) && /PREVIEW_DEFAULT/.test(doc) && /assets\/ui\/manifest\.json/.test(doc), 'design/ART_MODULAR.md names the switch');
});

// ------------------------------------------------------------------ small ones
await t('kit textures: mip level 0 is the decoded image itself (no full-size canvas copy), the half-size level is made straight from it', async () => {
  installKit();
  try {
    const { app, run } = await setup({ seed: 'perf3mip' });
    layout(run, [['rm_entrance', 2, 2], ['rm_ward', 3, 2], ['rm_corridor', 2, 3]]);
    REC.draws.length = 0; REC.pats.length = 0;
    app.go('ward', { run }); frames(app, 6);
    assert.ok(ISO.lastKit() && ISO.lastKit().rooms.size >= 3, 'the rooms are drawn from the kit');
    const tex = (d) => d.a[0] && (d.a[0].kitImg === 'floors' || d.a[0].kitImg === 'walls');
    const copies = REC.draws.filter((d) => tex(d) && d.a.length === 3 && d.on.width === 512 && d.on.height === 512);
    assert.equal(copies.length, 0, 'no texture is copied 1:1 into a 512 px canvas');
    const halves = REC.draws.filter((d) => tex(d) && d.a.length === 5 && d.a[3] === 256 && d.a[4] === 256 && d.on.width === 256);
    assert.ok(halves.length >= 2, 'the 256 px level is drawn from the image (floor and wall): ' + halves.length);
    assert.ok(REC.pats.length >= 2, 'the floors and walls are pattern fills');
    for (const p of REC.pats) assert.ok(p && (p.kitImg || (p.width >= 32 && p.width <= 256)), 'a pattern source is the image or one of its smaller levels');
  } finally { removeKit(); }
});
await t('wall plan: kept while the rooms stay, rebuilt when one is added', async () => {
  installKit();
  try {
    const { app, run } = await setup({ seed: 'perf3plan' });
    const ids = layout(run, [['rm_entrance', 2, 2], ['rm_ward', 3, 2], ['rm_corridor', 2, 3]]);
    app.go('ward', { run }); frames(app, 4);
    const doors = (id) => ISO.lastKit().rooms.get(id).dL; // the plan's own door array for the left wall
    const a = doors(ids[1]); frames(app, 1); const b = doors(ids[1]); frames(app, 30);
    assert.ok(Array.isArray(a) && a.length === 1); assert.equal(b, a, 'the same plan object on the next frame'); assert.equal(doors(ids[1]), a, 'and thirty frames later');
    assert.deepEqual(a, [true], 'the Ward has a door to the Entrance on its left wall');
    // a new room next to the corridor: the plan follows on the very next frame
    const w = run.ward, id = 'r' + w.nextRoom++; w.rooms[id] = { id, type: 'rm_ward', x: 3, y: 3, on: true, level: 1, timers: { spawn: 3 }, contents: [], upgrades: [] }; w.grid[3][3] = id; WD.wardPower(run);
    frames(app, 2);
    assert.notEqual(doors(ids[1]), a, 'rebuilt'); assert.deepEqual(ISO.lastKit().rooms.get(id).dL, [true], 'the new room has its door to the corridor');
    const c = doors(id); frames(app, 5); assert.equal(doors(id), c, 'and is kept again');
    // a room that moves (same ids, other cells) also invalidates
    w.grid[3][3] = null; w.rooms[id].x = 4; w.rooms[id].y = 2; w.grid[2][4] = id; frames(app, 2);
    assert.notEqual(doors(id), c);
  } finally { removeKit(); }
});
await t('title and Archive: the unlock model is read once per visit, again when a modal over the title closes, never every frame', async () => {
  const M = await import('../graftwork/engine/meta.js'), UN = await import('../graftwork/engine/unlock.js');
  const title = (await import('../graftwork/ui/title.js')).default, archive = (await import('../graftwork/ui/archive.js')).default;
  const o = {}; M.setStorage({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; } });
  const meta = M.defaultMeta(); meta.settings = { tips: false, reducedMotion: true };
  UN.unlockState(meta); // repairs the block in place
  // unlockState is the only reader of `lifetime` on these screens: count its reads
  let reads = 0, life = meta.unlocked.lifetime;
  Object.defineProperty(meta.unlocked, 'lifetime', { configurable: true, enumerable: true, get() { reads++; return life; }, set(v) { life = v; } });
  const app = await makeApp({ run: null, meta });
  const texts = []; const raw = app.text; app.text = (s, ...a) => { texts.push(String(s)); return raw(s, ...a); };
  app.shared.flow = { app, RUN, META: M, route() {}, toTitle() {}, openCodex() {}, openArchive() { app.push('archive', {}); }, openSettings() {}, saveMeta() {}, hasSave: () => false, start() {}, openDeck() {} };
  app.shared.audio = { sfx() {}, music() {}, setVolumes() {}, mute() {} };
  app.register('title', title); app.register('archive', archive);
  app.go('title', {}); frames(app, 2);
  const label = () => `Archive ${UN.unlockState(meta).percent} percent`;
  const want0 = label(); reads = 0; texts.length = 0;
  frames(app, 60);
  assert.equal(reads, 0, 'sixty title frames never walk the unlock table'); assert.ok(texts.includes(want0) || texts.includes('Archive'), 'the Archive slab still shows its label');
  // the Archive (a modal over the title) reads the model on its first frame only
  app.push('archive', {}); frames(app, 1); assert.ok(reads > 0, 'read on entering the Archive'); reads = 0; texts.length = 0;
  frames(app, 60); assert.equal(reads, 0, 'sixty Archive frames: no further read'); assert.ok(texts.includes(want0), 'and the percent is on screen: ' + want0);
  // the profile changes while a modal is open (a run's award, an erase in Settings): the title shows it as soon as the stack returns to it
  const { LOCKED_IDS } = await import('../graftwork/data/unlocks.js');
  for (const k of LOCKED_IDS.slice(0, Math.ceil(LOCKED_IDS.length / 2))) meta.unlocked.ids[k] = 1;
  const want1 = label(); assert.notEqual(want1, want0);
  app.pop(); reads = 0; texts.length = 0; frames(app, 1);
  assert.ok(reads > 0, 'read again on the first frame back on the title'); reads = 0; frames(app, 30); assert.equal(reads, 0);
  if (texts.some((s) => /^Archive \d+ percent$/.test(s))) assert.ok(texts.includes(want1), 'the label is the new percent: ' + want1);
  // re-entering the title reads again
  app.go('title', {}); reads = 0; frames(app, 1); assert.ok(reads > 0);
});
await t('install: the three display-mode queries are made once per window and stay live (they ran every frame on the title and in Settings)', async () => {
  const INST = await import('../graftwork/ui/install.js');
  const made = [], host = () => { const L = {}; return { window: { addEventListener(nm, f) { (L[nm] = L[nm] || []).push(f); }, matchMedia: (q) => { const m = { q, matches: false }; made.push(m); return m; } }, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36', platform: '', maxTouchPoints: 0 }, fire(nm, ev) { for (const f of L[nm] || []) f(ev); } }; };
  try {
    const h = host(); INST.initInstall(h);
    for (let i = 0; i < 200; i++) { assert.equal(INST.isInstalled(), false); assert.equal(INST.installAvailable(), false); assert.equal(INST.installMode(), 'none'); }
    assert.equal(made.length, 3, 'three queries for 600 questions (it was three per question)');
    assert.deepEqual(made.map((m) => m.q), ['(display-mode: fullscreen)', '(display-mode: standalone)', '(display-mode: minimal-ui)']);
    // live: the browser's install offer and a display-mode change are seen at once
    h.fire('beforeinstallprompt', { preventDefault() {} }); assert.equal(INST.installAvailable(), true);
    made[1].matches = true; assert.equal(INST.isInstalled(), true); assert.equal(INST.installAvailable(), false); made[1].matches = false; assert.equal(INST.installAvailable(), true);
    // the Settings screen with its App row: sixty frames, no new query
    const settings = (await import('../graftwork/ui/settings.js')).default;
    const app = await makeApp({ run: null, meta: { settings: { tips: false } } });
    app.shared.flow = { saveMeta() {}, openDeck() {}, META: {} }; app.shared.audio = { sfx() {}, music() {}, setVolumes() {}, mute() {} };
    app.register('settings', settings); app.push('settings', {}); frames(app, 60);
    assert.equal(made.length, 3, 'Settings open for sixty frames: still three');
    // another window gets its own three
    INST.initInstall(host()); INST.isInstalled(); INST.isInstalled(); assert.equal(made.length, 6);
  } finally { INST.resetInstall(); }
});

console.log(`graftwork perf3: ${n} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
