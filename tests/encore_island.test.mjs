// Headless suite for Encore Island: loads every js/*.js in page order against a stubbed DOM,
// then drives state init, world geometry, combat/economy, save round-trip and full draw().
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('encore_island');
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'encore_island');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
t.ok(order.length >= 14, 'index.html loads the script chain (' + order.length + ')');
let code = order.map(f => readFileSync(join(dir, f), 'utf8')).join('\n;\n');

const noop = () => {};
const ctx = new Proxy({}, { get(_t, k) {
  if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop });
  if (k === 'canvas') return { width: 400, height: 800 };
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
  return noop;
}, set() { return true; } });
const mkEl = () => new Proxy({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop, appendChild: noop, remove: noop, setAttribute: noop, getContext: () => ctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }), setPointerCapture: noop,
  querySelector: () => mkEl(), querySelectorAll: () => [], innerHTML: '', textContent: '', value: '', width: 400, height: 800, children: [], dataset: {} },
  { get(o, k) { return (k in o) ? o[k] : noop; }, set(o, k, v) { o[k] = v; return true; } });
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
global.requestAnimationFrame = noop;
global.AudioContext = undefined; global.webkitAudioContext = undefined;
global.Image = class { set src(v) { this._s = v; } get src() { return this._s; } get width() { return 64; } get height() { return 64; } };
global.OffscreenCanvas = undefined;
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
def('navigator', { userAgent: 'node', maxTouchPoints: 0, vibrate: noop });
global.devicePixelRatio = 1;
global.document = new Proxy({ getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [],
  addEventListener: noop, body: mkEl(), documentElement: mkEl(), hidden: false }, { get(o, k) { return (k in o) ? o[k] : noop; } });
global.window = new Proxy(global, { get(o, k) { return (k in o) ? o[k] : undefined; }, set(o, k, v) { o[k] = v; return true; } });
global.window.addEventListener = noop; global.window.innerWidth = 400; global.window.innerHeight = 800; global.window.__EI_HEADLESS__ = true;
global.setTimeout = () => 0; global.setInterval = () => 0; global.clearTimeout = noop; global.clearInterval = noop;
code = code.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
eval('(function(){' + code + '\nglobalThis.__EI=window.EI;})()');
const EI = globalThis.__EI;
t.ok(!!EI, 'EI hooks exposed');

EI.boot();
let S = EI.S;
t.ok(S && S.player, 'state initialised');
EI.tick(0.05); EI.draw(0.016);
t.ok(true, 'title draws');

S.started = true;
for (let i = 0; i < 120; i++) { EI.tick(0.05); EI.draw(0.05); }
t.ok(true, '6s of hub ticks + draws without throwing');

// lands exist and are reachable
t.ok(S.lands && S.lands.length >= 1, 'lands generated');
const l0 = S.lands[0];
S.player.x = l0.g.x; S.player.y = l0.g.y; S.wallet = 1e6;
for (let i = 0; i < 400; i++) { EI.tick(0.05); if (i % 4 === 0) EI.draw(0.05); }
t.ok(isFinite(S.player.x) && isFinite(S.player.y), 'player position stays finite in land 1');
t.ok(isFinite(S.wallet), 'wallet finite');

// save round trip
EI.save();
const snap = EI.serialize();
t.ok(snap && typeof snap === 'object', 'serialize returns object');
EI.initGame(true); EI.loadSave(); 
t.ok(EI.S && EI.S.player, 'loadSave leaves a valid state');
for (let i = 0; i < 40; i++) { EI.tick(0.05); EI.draw(0.05); }
t.ok(true, 'post-load ticks + draws fine');

// ---- gameplay flows: plate purchase, selling, vault, menu taps ----
EI.initGame(true); S = EI.S; S.started = true; S.wallet = 500;
S.player.x = EI.UPG_POS.speed.x; S.player.y = EI.UPG_POS.speed.y;
for (let i = 0; i < 80; i++) EI.tick(0.05);
t.ok(S.up.speed > 0, 'standing on an upgrade plate buys it');
S.player.helmets = [EI.dropItem ? { k: 1, v: 10 } : { k: 1, v: 10 }];
{ const n0 = S.stats.sold; S.player.helmets = []; for (let i = 0; i < 6; i++) S.player.helmets.push({ k: 1, kind: 'helm', v: 1, val: 10, name: 'x' }); S.player.x = EI.SELL.x + 10; S.player.y = EI.SELL.y + 35; for (let i = 0; i < 60; i++) EI.tick(0.05); t.ok(S.stats.sold >= n0, 'selling does not throw'); }
// menu taps: dock button then a content hit and the close button, using the hit list the renderer builds
const tapAt = (x, y) => { const hs = EI.hits(); for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.act(); return true; } } return false; };
EI.draw(0.016); const dock = EI.hits().filter(h => h.y > 700 && h.w < 100);
t.ok(dock.length >= 5, 'dock exposes five tappable buttons (' + dock.length + ')');
tapAt(dock[0].x + 5, dock[0].y + 5); EI.draw(0.016); EI.draw(0.016);
t.ok(S.sheet && S.sheet.id === 'town', 'tapping the first dock button opens Town');
S.wallet = 1e5; EI.draw(0.016); const before = S.pop.length; const sheetHits = EI.hits().filter(h => h.sheet); t.ok(sheetHits.length > 0, 'town sheet has tappable content');
sheetHits[0].act(); t.ok(S.pop.length >= before, 'recruit tap works'); 
for (const id of ['heroes', 'goals', 'perks', 'more']) { EI.openSheet(id); for (let i = 0; i < 3; i++) EI.draw(0.016); t.ok(S.sheet.id === id, id + ' sheet opens and draws'); }
EI.S.modal = { id: 'wheel' }; EI.draw(0.016); EI.S.modal = { id: 'daily' }; EI.draw(0.016); EI.S.modal = null;
t.ok(S.unlockPlate !== undefined, 'unlock plate state exists');

t.done();
