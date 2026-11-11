// ui/core.js + ui/chrome.js: panel/button API, click consumption, text scale, tooltip fallback, focus navigation, the cost of the widget kit.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key, fakeCtx, canvasCalls } from './graftwork_lib.mjs';

const app = await makeApp({ meta: { settings: {} } });
const calls = [];
app.register('t', { draw(a) { for (const f of calls) f(a); } });
app.go('t');

// --- panel / button options and return values
let r1;
calls.push((a) => {
  a.panel(10, 10, 300, 120, { fill: '#223344', stroke: '#ff0000', r: 4, lw: 3 });
  a.panel(10, 140, 40, 20); a.panel(0, 0, 0, 0);
  r1 = a.button('Go', 400, 400, 120, 40, { fill: '#335577', stroke: '#abc', r: 6, color: '#fff', size: 18, sub: 'sub', ui: true, bold: false, icon: () => {} });
  a.button('Off', 400, 460, 120, 40, { disabled: true });
  a.button('Key', 400, 520, 120, 40, { key: 'k' });
});
frames(app, 3);
assert.equal(r1, false);
// click consumed once per frame: two overlapping buttons, only the first claims it
let hits = 0;
calls.length = 0;
calls.push((a) => { if (a.button('A', 100, 100, 100, 40)) hits++; if (a.button('B', 100, 100, 100, 40)) hits++; });
click(app, 150, 120); frames(app, 2);
assert.equal(hits, 1, 'one click is consumed once');
// disabled never fires; key fires
let dis = 0, kk = 0;
calls.length = 0;
calls.push((a) => { if (a.button('D', 100, 100, 100, 40, { disabled: true })) dis++; if (a.button('K', 300, 100, 100, 40, { key: 'k' })) kk++; });
click(app, 150, 120); key(app, 'K');
assert.equal(dis, 0); assert.equal(kk, 1);

// --- text scale: wrap is consistent with the final font size, cache keys differ per scale
const str = 'The quick brown fox jumps over the lazy dog and keeps running far away';
const seen = {};
for (const sc of [1, 1.25, 1.5, 100, 125, 150]) {
  app.textScale = sc;
  const n = app.wrap(str, 200, 16, { ui: true }).length;
  assert.equal(app.wrap(str, 200, 16, { ui: true }), app.wrap(str, 200, 16, { ui: true }), 'wrap cached');
  assert.ok(app.measure('abc', 16, { ui: true }) > 0);
  seen[sc] = n;
  // app.text with maxW must report the height of the same wrap
  const h = app.text(str, 0, 0, { size: 16, ui: true, maxW: 200, lineH: 20 });
  const k = sc >= 50 ? sc / 100 : sc;
  assert.equal(h, n * Math.round(20 * k), 'text height matches wrap lines at scale ' + sc);
  assert.equal(app.measure('abc', 16, { fixed: true }), 3 * 8 * 1 * 1, 'fixed is unscaled'); // fake ctx: 8 px per char regardless of font
}
assert.ok(seen[1.5] >= seen[1.25] && seen[1.25] >= seen[1], 'bigger text never wraps to fewer lines');
assert.equal(seen[125], seen[1.25]); assert.equal(seen[150], seen[1.5]);
app.textScale = 1;
assert.ok(app.text('12:30', 5, 5, { tab: true, engraved: true, align: 'center', size: 20 }) > 0);
assert.ok(app.text('Name', 5, 5, { engraved: true }) > 0);

// --- tooltip: fallback path (stub renderTip returns false) draws a panel and stays inside the stage
calls.length = 0;
let tipDrawn = 0;
app.forceTipFallback = true;
const origPanel = app.panel; app.panel = (x, y, w, h, o) => { tipDrawn++; assert.ok(x >= 0 && y >= 0 && x + w <= 1280 && y + h <= 720, `tip inside stage ${x},${y},${w},${h}`); return origPanel(x, y, w, h, o); };
calls.push((a) => a.tooltip('Title', 'Body text that is long enough to wrap onto lines. '.repeat(6), { color: '#f00' }));
for (const [mx, my] of [[10, 10], [1270, 710], [640, 360], [1270, 5]]) { app.mouse.x = mx; app.mouse.y = my; frames(app, 1); }
assert.equal(tipDrawn, 4);
calls.length = 0; calls.push((a) => a.tooltip('T', '', { lines: ['one', 'two', 'three'] })); frames(app, 1);
assert.deepEqual(app.tip.lines, ['one', 'two', 'three']);
app.panel = origPanel; app.forceTipFallback = false;
assert.ok(app.tip, 'tip set during frame');

// --- focus navigation
let act = [];
calls.length = 0;
calls.push((a) => { a.navButtons = true; for (const n of ['A', 'B', 'C']) if (a.button(n, 100, 100 + 60 * 'ABC'.indexOf(n), 100, 40, { disabled: n === 'B' })) act.push(n); });
app.mouse.x = -999; app.mouse.y = -999; frames(app, 2);
key(app, 'Tab'); assert.equal(app.focus.idx, 0); assert.equal(app.focus.active, true);
key(app, 'Tab'); assert.equal(app.focus.idx, 2, 'disabled button skipped');
key(app, 'Enter'); frames(app, 1);
assert.deepEqual(act, ['C']);
app.pressedKeys.push({ key: 'Tab', shiftKey: true, preventDefault() {} }); frames(app, 1); assert.equal(app.focus.idx, 0);
key(app, ' '); assert.deepEqual(act, ['C', 'A']);

// --- chrome helpers do not throw
const ch = app.chrome;
calls.length = 0;
calls.push((a) => { ch.plate(a, 10, 10, 120, 30, 'Marrow'); ch.vial(a, 20, 60, 24, 90, 0.6); ch.vial(a, 60, 60, 24, 90, 0); ch.rivet(a.ctx, 5, 5); a.press(10, 10, 50, 20); });
frames(app, 5);

// --- small-screen floor: text >= 11 CSS px (capped boost), hit area >= 40 CSS px, desktop untouched
{
  const a = await makeApp({ meta: { settings: {} } });
  a.textScale = 1;
  a.scale = 1; assert.equal(a.sz(9), 9, 'no floor at scale 1');
  a.scale = 0.54; assert.equal(a.sz(9), Math.round(9 * 1.5), 'boost is capped at 1.5x');
  assert.equal(a.sz(16), Math.ceil(11 / 0.54), 'floor reaches 11 CSS px');
  assert.ok(a.sz(30) === 30, 'large text is left alone');
  assert.ok(a.measure('abc', 9) > 0 && a.wrap('a b c', 1000, 9).length === 1);
  let n = 0; const calls2 = [];
  a.register('hit', { draw(x) { if (x.button('S', 100, 100, 44, 38)) n++; } }); a.go('hit');
  click(a, 96, 100); frames(a, 2); assert.equal(n, 1, 'tiny button grows its hit area on small screens');
  a.scale = 1; n = 0; click(a, 90, 100); frames(a, 2); assert.equal(n, 0, 'no growth at scale 1');
  assert.ok(a.safe && a.safe.t === 0 && a.safe.r === 0, 'safe insets default to zero');
}
// --- what the widget kit costs: 500 buttons + 200 panels per tick, counted in canvas calls (it was "under 8 ms a tick" on the wall clock, which
// a busy machine fails). Measured: 2702 calls a tick, under four a widget: a widget that starts to paint its frame or its label twice shows here.
const cv = fakeCtx();
const fresh = (await import('../graftwork/ui/core.js')).createApp({ getContext: () => cv, addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720 }, { shared: {} });
fresh.resize();
fresh.register('b', { draw(a) {
  for (let i = 0; i < 200; i++) a.panel((i % 20) * 60, Math.floor(i / 20) * 60, 56, 56, { fill: i % 2 ? '#222' : undefined });
  for (let i = 0; i < 500; i++) a.button('Btn', (i % 25) * 50, Math.floor(i / 25) * 30, 48, 26, { size: 12 });
} });
fresh.go('b');
for (let i = 0; i < 20; i++) fresh.tick(1 / 60); // warm caches
const N = 60, c0 = canvasCalls();
for (let i = 0; i < N; i++) fresh.tick(1 / 60);
const perTick = (canvasCalls() - c0) / N;
console.log(`core bench: ${perTick} canvas calls per tick (500 buttons + 200 panels)`);
assert.ok(perTick < 3200, `benchmark ${perTick} canvas calls a tick`);
console.log('graftwork_ui_core: all checks passed');
