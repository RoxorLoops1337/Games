// Pause menu, global overlay, fullscreen (mocked) and the new settings rows, headless.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import pause, { installPause, drawPauseOverlay, PAUSE_BTN, FS_BTN, IN_RUN } from '../graftwork/ui/pause.js';
import settings, { settingsOf } from '../graftwork/ui/settings.js';
import title from '../graftwork/ui/title.js';
import * as FS from '../graftwork/ui/fullscreen.js';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';

// ---- fullscreen mock ----
function mockHost(ua = 'Mozilla/5.0 (X11; Linux)', webkit = false) {
  const h = { calls: [], listeners: {}, wl: {}, active: null };
  const el = {};
  const req = function () { h.calls.push('request'); doc[webkit ? 'webkitFullscreenElement' : 'fullscreenElement'] = el; return Promise.resolve(); };
  const doc = { documentElement: el, fullscreenEnabled: true, activeElement: null,
    exitFullscreen: webkit ? undefined : function () { h.calls.push('exit'); doc.fullscreenElement = null; return Promise.resolve(); },
    webkitExitFullscreen: function () { h.calls.push('exit'); doc.webkitFullscreenElement = null; },
    addEventListener(n, f) { (h.listeners[n] = h.listeners[n] || []).push(f); } };
  if (webkit) el.webkitRequestFullscreen = req; else el.requestFullscreen = req;
  const win = { addEventListener(n, f) { (h.wl[n] = h.wl[n] || []).push(f); } };
  Object.assign(h, { document: doc, window: win, navigator: { userAgent: ua } });
  h.fire = (n, e) => (h.wl[n] || []).forEach((f) => f(e));
  return h;
}

FS.setHost(null);
assert.equal(FS.canFullscreen(), false, 'headless: no fullscreen'); assert.equal(FS.toggleFullscreen(), false, 'no-op without a DOM');

async function rig(host) {
  const meta = META.loadMeta(); meta.settings = {};
  const app = await makeApp({ run: null, meta });
  const log = { saved: 0, abandon: 0, title: 0, deck: 0, updates: 0 }; // updates: ticks the run screen under the menu was given (none while paused)
  const flow = { app, RUN, META, saveMeta() { log.saved++; }, openSettings() { app.push('settings'); }, openDeck() { log.deck++; app.push('settings'); },
    abandon() { log.abandon++; const r = app.shared.run; if (r) { r.phase = 'dead'; r.abandoned = true; } app.go('end'); }, toTitle() { log.title++; app.go('title'); }, hasSave: () => false };
  app.shared.flow = flow; app.shared.audio = { sfx() {}, music() {}, setVolumes() {}, mute() {} };
  app.register('pause', pause); app.register('settings', settings); app.register('title', title);
  const upd = () => { log.updates++; };
  app.register('ward', { draw() {}, update: upd }); app.register('end', { draw() {}, update() {} });
  app.register('combat', { draw() {}, update: upd, enter() {}, leave() {} });
  if (host) FS.setHost(host);
  installPause(app); FS.installFullscreen(app);
  app.overlay = (a) => drawPauseOverlay(a);
  return { app, meta, log };
}
const run = () => RUN.newRun({ hero: 'marrow', seed: 'pause' });
const rowY = (i) => 80 + 84 + i * 58 + 25; // centre of menu row i (before the Controls gap)

// ---- Esc opens, Esc resumes; the run screen stands still in between ----
{
  const { app, log } = await rig(null);
  app.shared.run = run(); app.go('ward', {}); frames(app, 5);
  assert.ok(IN_RUN.has('ward')); assert.ok(!IN_RUN.has('map'), 'the map screen is gone'); assert.deepEqual([...IN_RUN].sort(), ['combat', 'event', 'forge', 'graft', 'reward', 'shop', 'ward']); assert.equal(log.updates, 5);
  key(app, 'Escape'); const u0 = log.updates; frames(app, 30);
  assert.equal(app.top().name, 'pause', 'Esc opens pause'); assert.equal(log.updates, u0, 'paused: the run screen gets no update'); assert.equal(app.frozen, true);
  assert.equal(pause.k, 1, 'the menu itself runs on real time'); assert.ok(pause.clock > 0.4);
  key(app, 'Escape'); frames(app, 3);
  assert.equal(app.stack.length, 1, 'Esc resumes and does not reopen'); assert.equal(log.updates, u0 + 3, 'and the run screen goes on');
  // buttons registered in the reserved zone
  const regs = app.layout.getAll(); const pb = regs.find((r) => r.id === 'pause_btn');
  assert.deepEqual([pb.x, pb.y, pb.w, pb.h], [PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h]); assert.equal(pb.layer, 'hud');
  // click the button
  click(app, 1158, 28); frames(app, 3); assert.equal(app.top().name, 'pause', 'pause button opens'); click(app, 640, rowY(0)); frames(app, 3);
  assert.equal(app.stack.length, 1, 'Resume row closes'); assert.equal(app.frozen, false);
  // escBusy blocks Esc
  app.escBusy = true; key(app, 'Escape'); frames(app, 2); assert.equal(app.stack.length, 1, 'escBusy blocks pause');
  // a screen that pops on Esc does not reopen pause
  app.push('settings'); frames(app, 3); key(app, 'Escape'); frames(app, 3); assert.equal(app.stack.length, 1, 'settings Esc only closes settings');
}
// ---- every item ----
{
  const { app, log } = await rig(null);
  app.shared.run = run(); app.go('ward', {}); frames(app, 3);
  key(app, 'Escape'); const u0 = log.updates; frames(app, 3); assert.equal(pause.sel, 0, 'Resume is the default focus');
  // keyboard navigation: Down to Settings, Enter
  key(app, 'ArrowDown'); assert.equal(pause.sel, 1); key(app, 'Enter'); frames(app, 3); assert.equal(app.top().name, 'settings', 'Settings opens over pause');
  key(app, 'Escape'); frames(app, 3); assert.equal(app.top().name, 'pause'); assert.equal(log.updates, u0, 'still paused');
  // no fullscreen row headless: rows are resume, settings, deck, help, abandon, quit
  key(app, 'ArrowDown'); assert.equal(pause.sel, 2); key(app, 'Enter'); frames(app, 3); assert.equal(log.deck, 1, 'Deck'); key(app, 'Escape'); frames(app, 3);
  key(app, 'ArrowDown'); key(app, 'Enter'); frames(app, 3); assert.equal(pause.mode, 'help', 'help panel'); for (let i = 0; i < 4; i++) key(app, 'ArrowDown'); key(app, 'Escape'); assert.equal(pause.mode, 'menu');
  // Tab wraps, Shift+Tab goes up
  pause.sel = 5; app.pressedKeys.push({ key: 'Tab', shiftKey: false }); frames(app, 1); assert.equal(pause.sel, 0, 'Tab wraps');
  // abandon: two steps, cancel first
  pause.sel = 4; key(app, 'Enter'); frames(app, 2); assert.ok(pause.confirm && pause.confirm.kind === 'abandon'); assert.equal(pause.sel, 1, 'default focus is Cancel');
  key(app, 'Enter'); frames(app, 2); assert.equal(pause.confirm, null, 'cancel'); assert.equal(log.abandon, 0);
  pause.sel = 4; key(app, 'Enter'); frames(app, 2); key(app, 'ArrowLeft'); key(app, 'Enter'); frames(app, 3);
  assert.equal(log.abandon, 1, 'abandon confirmed'); assert.equal(app.shared.run.phase, 'dead'); assert.equal(log.updates, u0, 'the run never moved under the menu'); assert.equal(app.current, 'end');
  frames(app, 2); assert.equal(app.frozen, false, 'nothing is frozen after leaving through the menu'); assert.equal(app.frameState.snap, null);
}
// ---- quit: saves, confirm only in combat ----
{
  const { app, log } = await rig(null);
  app.shared.run = run(); app.go('ward', {}); frames(app, 3); key(app, 'Escape'); frames(app, 3);
  pause.sel = 5; key(app, 'Enter'); frames(app, 3); assert.equal(log.title, 1, 'quit outside combat is immediate'); assert.equal(app.frozen, false);
  app.shared.run.phase = 'combat'; app.go('combat', {}); frames(app, 3); key(app, 'Escape'); frames(app, 3);
  assert.equal(app.top().name, 'pause'); assert.equal(app.frozen, true);
  pause.sel = 5; key(app, 'Enter'); frames(app, 3); assert.equal(log.title, 1); assert.ok(pause.confirm, 'combat quit confirms');
  click(app, 640 - 100, 80 + 290 + 27); frames(app, 3); assert.equal(log.title, 2, 'confirmed quit'); assert.equal(app.frozen, false);
}
// ---- fullscreen mocked ----
for (const webkit of [false, true]) {
  const host = mockHost('Mozilla/5.0 (X11; Linux)', webkit);
  const { app } = await rig(host);
  assert.ok(FS.canFullscreen()); assert.equal(FS.isFullscreen(), false);
  app.shared.run = run(); app.go('ward', {}); frames(app, 3);
  assert.ok(app.layout.getAll().some((r) => r.id === 'fs_btn' && r.x === FS_BTN.x && r.w === FS_BTN.w), 'fs button registered');
  // button click: tick sets pendingFs, a window gesture processes it (never from the tick)
  click(app, FS_BTN.x + 20, FS_BTN.y + 20); assert.equal(host.calls.length, 0, 'tick never requests'); assert.equal(app.pendingFs, true);
  host.fire('pointerup', { clientX: 5, clientY: 5 }); assert.deepEqual(host.calls, ['request']); assert.equal(FS.isFullscreen(), true);
  (host.listeners[webkit ? 'webkitfullscreenchange' : 'fullscreenchange'] || (host.listeners.fullscreenchange)).forEach((f) => f());
  assert.equal(app.fs, true, 'state synced'); assert.equal(app.shared.meta.settings.fullscreen, true);
  // F key toggles back, not while typing
  host.document.activeElement = { tagName: 'INPUT' }; host.fire('keydown', { key: 'f' }); assert.equal(host.calls.length, 1, 'F ignored in a text field');
  host.document.activeElement = null; host.fire('keydown', { key: 'F' }); assert.deepEqual(host.calls, ['request', 'exit']); assert.equal(FS.isFullscreen(), false);
  // pointerup directly over the button is served inside the gesture
  const n = host.calls.length; frames(app, 2);
  const P = { clientX: FS_BTN.x + 20, clientY: FS_BTN.y + 20 };
  app.mouse.x = FS_BTN.x + 20; app.mouse.y = FS_BTN.y + 20; app.mouse.pressed = true; app.mouse.down = true; host.fire('pointerdown', P); app.tick(1 / 60);
  host.fire('pointerup', P); assert.equal(host.calls.length, n + 1, 'in-gesture toggle');
  app.mouse.released = true; app.mouse.down = false; app.tick(1 / 60); assert.equal(app.pendingFs, false, 'no double toggle');
  // pause menu row shows the state
  key(app, 'Escape'); frames(app, 3); assert.equal(pause.items[2].id, 'fullscreen'); assert.match(pause.items[2].label, /^Fullscreen: (On|Off)$/);
  const before = host.calls.length; click(app, 640, rowY(2)); host.fire('pointerup', { clientX: 1, clientY: 1 }); assert.equal(host.calls.length, before + 1, 'pause row toggles');
}
// ---- iPhone: hidden ----
{
  const host = mockHost('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  const { app } = await rig(host);
  assert.equal(FS.canFullscreen(), false, 'iPhone has no element fullscreen'); assert.equal(FS.toggleFullscreen(), false);
  app.shared.run = run(); app.go('ward', {}); frames(app, 3);
  assert.ok(!app.layout.getAll().some((r) => r.id === 'fs_btn'), 'no fullscreen button on iPhone');
  key(app, 'Escape'); frames(app, 3); assert.ok(!pause.items.some((i) => i.id === 'fullscreen'));
  const ipad = mockHost('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', true); FS.setHost(ipad); assert.equal(FS.canFullscreen(), true, 'iPad is fine');
}
// ---- title button ----
{
  const host = mockHost(); const { app } = await rig(host);
  app.go('title'); frames(app, 30);
  assert.ok(app.layout.getAll().some((r) => r.id === 'title_fs' && r.x === 1210 && r.y === 16 && r.w === 52 && r.h === 44), 'title fullscreen button');
  click(app, 1236, 38); host.fire('pointerup', { clientX: 0, clientY: 0 }); assert.deepEqual(host.calls, ['request']);
}
// ---- settings: text scale, quality, fullscreen row, persistence ----
{
  FS.setHost(null);
  const { app, meta, log } = await rig(null);
  app.go('title'); frames(app, 5); app.push('settings'); frames(app, 30);
  const s = settingsOf(app); assert.equal(s.textScale, 100); assert.equal(s.quality, 'high');
  // rects come from the settings screen's own keyboard rows (cannot drift when the layout moves)
  const row = (label) => app.top().rows.find((r) => r.label === label);
  const seg = (label, i, n) => { const r = row(label); const total = n * 64 + (n - 1) * 6; return [r.x + r.w - total + i * 70 + 32, r.y + 18]; };
  const saves = log.saved;
  click(app, ...seg('Text size', 2, 4)); assert.equal(s.textScale, 150); assert.equal(s.textSize, 'large'); assert.ok(log.saved > saves, 'persisted');
  click(app, ...seg('Text size', 1, 4)); assert.equal(s.textScale, 125);
  click(app, ...seg('Effects quality', 0, 3)); assert.equal(s.quality, 'off');
  click(app, ...seg('Effects quality', 1, 3)); assert.equal(s.quality, 'low');
  // existing toggles still there
  { const r = row('Mute all sound'); click(app, 640, r.y + 17); assert.equal(s.muted, true); }
  // old saves: largeText/textSize large migrates to 125
  const m2 = { settings: { textSize: 'large' } }; const a2 = { shared: { meta: m2 } }; assert.equal(settingsOf(a2).textScale, 125);
  // overlay applies the scale through main.js logic: simple contract check
  assert.ok([100, 125, 150, 175].includes(s.textScale));
}
// ---- Esc on the Deck opened from Pause closes only the Deck (the keydown that closed it must not reach Pause as well) ----
{
  const deckview = (await import('../graftwork/ui/deckview.js')).default;
  const { app } = await rig(null);
  app.register('deckview', deckview);
  app.shared.flow.openDeck = () => app.push('deckview', {});
  app.shared.run = run(); app.go('ward', {}); frames(app, 3);
  // the real keydown path of ui/core.js: queue the event for the frame, then give it to the top screen first
  const realKey = (k) => { const e = { key: k, preventDefault() {} }; app.pressedKeys.push(e); const s = app.top(); if (s && s.key && s.key(app, e)) e.preventDefault(); app.tick(1 / 60); };
  realKey('Escape'); frames(app, 3); assert.equal(app.top().name, 'pause');
  pause.sel = 2; realKey('Enter'); frames(app, 3); assert.equal(app.top().name, 'deckview', 'Deck opened over Pause');
  realKey('Escape'); frames(app, 3);
  assert.equal(app.top().name, 'pause', 'Esc closed only the Deck: Pause stays'); assert.equal(app.frozen, true, 'still paused');
  realKey('Escape'); frames(app, 3); assert.notEqual(app.top().name, 'pause', 'a second Esc resumes');
}

console.log('graftwork pause ui ok');
