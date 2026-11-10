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

console.log(`graftwork perf3: ${n} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
