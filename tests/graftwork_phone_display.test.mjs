// Phone display gate: backing store resolution (DPR above 2, device pixel snapping), the pillarbox wings, sprite size tier, the card picker layout
// and its opaque backdrop, the title goal text per mode and the phone title layout. Each block fails on the code before the round 16 phone fixes.
import assert from 'node:assert/strict';
import { fakeCtx, installDom, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
installDom();
const win = globalThis.window;
const mkCanvas = () => ({ getContext: () => fakeCtx(), style: {}, width: 1280, height: 720, setPointerCapture() {}, addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; } });
const { createApp, W, H } = await import('../graftwork/ui/core.js');

// ---- 1. backing store: DPR up to 3, whole device pixels, wing width
for (const [iw, ih, dpr] of [[1000, 462, 2], [1000, 462, 2.75], [844, 390, 3], [915, 412, 2.625], [932, 430, 3], [1180, 820, 2]]) {
  win.innerWidth = iw; win.innerHeight = ih; win.devicePixelRatio = dpr;
  const cv = mkCanvas(), app = createApp(cv, { shared: {} }); app.resize();
  assert.ok(Math.abs(app.dpr - dpr) < 1e-9, `dpr ${dpr} is kept (was capped at 2): ${app.dpr}`);
  const cw = parseFloat(cv.style.width), ch = parseFloat(cv.style.height);
  assert.ok(Math.abs(cv.width - cw * app.dpr) < 1e-6 && Math.abs(cv.height - ch * app.dpr) < 1e-6, `canvas box is whole device pixels at ${iw}x${ih}@${dpr}`);
  assert.ok(Math.abs(app.offX * app.dpr - Math.round(app.offX * app.dpr)) < 1e-6, 'left offset is a whole device pixel');
  assert.ok(cv.width <= Math.ceil(iw * dpr) + 1 && app.px >= app.scale * 1.5, 'px per logical px follows the screen');
  const wide = iw / ih > 1.9;
  assert.equal(app.wing > 20, wide, `wing width exists on a wide phone only (${iw}x${ih}): ${app.wing}`);
}
win.innerWidth = 3840; win.innerHeight = 2160; win.devicePixelRatio = 3; // a pixel budget keeps a 4K screen sane
{ const cv = mkCanvas(), app = createApp(cv, { shared: {} }); app.resize(); assert.ok(cv.width * cv.height <= 9.6e6, 'backing store is within budget: ' + cv.width * cv.height); }
win.innerWidth = 1280; win.innerHeight = 720; win.devicePixelRatio = 1;

// ---- 2. sprite tier: phones draw the @2x files (their device pixels per logical px are above 0.8)
{
  const A = await import('../graftwork/ui/assets.js'); const assets = A.default || A.assets || A;
  const use2x = assets.use2x || (A.assets && A.assets.use2x);
  assert.equal(typeof use2x, 'function', 'assets.use2x exists');
  assert.equal(use2x({ scale: 0.55, px: 1.6 }), true, 'a phone at DPR 3 uses @2x');
  assert.equal(use2x({ scale: 0.55, px: 0.55 }), false, 'a stage drawn under 0.8 device px per logical px keeps @1x');
}

// ---- 3. card picker: readable size, scroll only when needed, opaque backdrop
{
  const ev = (await import('../graftwork/ui/event.js'));
  win.innerWidth = 1000; win.innerHeight = 462; const app = createApp(mkCanvas(), { shared: {} }); app.resize();
  const L15 = ev.pickerLayout(app, 15), CARD_W = 220;
  assert.ok(L15.sc * app.scale >= 0.55, 'phone picker cards are at least 0.55 of design size on screen: ' + (L15.sc * app.scale).toFixed(2));
  assert.ok(L15.sc >= 0.8, 'phone cards are large: ' + L15.sc);
  assert.ok(L15.maxS > 0, '15 big cards scroll'); assert.ok(L15.gx >= 0 && L15.gx + L15.per * L15.cw <= W, 'grid inside the stage');
  const L3 = ev.pickerLayout(app, 3); assert.equal(L3.maxS, 0, '3 cards need no scroll'); assert.ok(L3.sc >= L15.sc - 1e-9, 'fewer cards are never smaller');
  win.innerWidth = 1280; win.innerHeight = 720; const d = createApp(mkCanvas(), { shared: {} }); d.resize();
  const D15 = ev.pickerLayout(d, 15); assert.equal(D15.maxS, 0, 'desktop shows 15 cards at once'); assert.ok(D15.sc > 0.56 - 1e-9, 'and larger than the old 0.56: ' + D15.sc);
  // the backdrop is a solid fill of the whole stage
  const run = RUN.newRun({ hero: 'marrow', seed: 'pk' }); run.phase = 'event'; run.pending = { kind: 'event', id: 'e_dentist_chair', result: null };
  const cv = mkCanvas(), g = fakeCtx(), fills = []; cv.getContext = () => g;
  const orig = g.fillRect; g.fillRect = function (x, y, w, h) { fills.push({ x, y, w, h, style: g.fillStyle }); return orig.apply(this, arguments); };
  const flow = { RUN, route() {}, openDeck() {} };
  const a2 = createApp(cv, { shared: { run, flow } }); a2.resize(); a2.register('event', ev.default); a2.go('event', { run });
  ev.default.shown = 1e9; frames(a2, 5);
  ev.default.pick(a2, RUN.eventChoices(run).find((c) => c.pick === 'card'), run); fills.length = 0; frames(a2, 3);
  const solid = fills.find((f) => f.x === 0 && f.y === 0 && f.w === W && f.h === H && /^#0b0807$/i.test(String(f.style)));
  assert.ok(solid, 'the picker paints an opaque full-stage backdrop (no event text behind it)');
}

// ---- 4. title: the goal line, phone layout inside the stage and apart
{
  const T = await import('../graftwork/ui/title.js');
  assert.ok(/build your ward/.test(T.GOAL_TEXT) && !/map/i.test(T.GOAL_TEXT), 'the goal is the Ward goal, no map: ' + T.GOAL_TEXT);
  assert.ok(!/[\u2014\u2013]/.test(T.GOAL_TEXT) && T.GOAL_TEXT.length < 70, 'short, no dashes: ' + T.GOAL_TEXT);
  win.innerWidth = 1000; win.innerHeight = 462;
  const app = createApp(mkCanvas(), { shared: { run: null, meta: Object.assign(META.loadMeta(), { daily: { lastPlayed: RUN.dailySeed() } }), flow: { hasSave: () => false, saveMeta() {}, openCodex() {}, openSettings() {} } } }); app.resize();
  app.register('title', T.default); app.go('title'); frames(app, 80);
  const R = app.layout.getAll(), hero = R.find((r) => r.id === 'title-hero-card');
  assert.ok(hero && hero.y + hero.h <= H + 0.5 && hero.x + hero.w <= W, 'hero card stays inside the stage');
  for (const r of R) if (r.layer !== 'world' && !r.overlay) assert.ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5, 'title rect inside the stage: ' + r.id);
}
console.log('phone display ok');
