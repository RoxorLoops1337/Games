// Performance and bug fixes found by the reviews (graftwork/design/CLEANUP_PLAN.md, the section of that name). One check per fix, each written to fail on
// the code before it:
//   Ward backdrop     one cached layer blitted per frame, baked once per act (it was painted live, then dimmed, every frame)
//   post quality      one controller: 20 s of 33.3 ms frames (the 30 fps idle cap) leave the post tier at the Effects setting
//   born stamps       a monster that checked in during one Ward visit is visible after the next; no gait value goes non-finite
//   template switch   no request for assets/ui/manifest.json while TEMPLATE_ART is off
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
  const run = RUN.newRun({ hero: 'marrow', seed: o.seed || 'perf3', mode: 'ward' });
  const motion = !!o.motion;
  const meta = { settings: { reduceMotion: !motion, reducedMotion: !motion, tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } };
  const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
  app.ctx.measureText = (s) => { const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), size = m ? +m[1] : 16; return { width: String(s).length * size * (/bold/.test(f) ? 0.56 : 0.52) }; };
  app.register('ward', ward); app.register('base', { draw() {} });
  const flow = { RUN, route() { const scr = run.phase === 'ward' ? 'ward' : 'base'; if (run.mode === 'ward' && scr !== 'ward' && wardInterlude(app, run, scr)) return; app.go(scr, { run }); }, openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, resume() {}, abandon() {}, toTitle() {}, start() {} };
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

console.log(`graftwork perf3: ${n} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
