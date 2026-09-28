// Headless loader for the Inkwoven suites.
//
// index.html lists the game's classic scripts. boot() concatenates the ones that
// exist (in that order), evaluates them against a stubbed browser (a no-op 2d
// canvas that counts calls, a small fake DOM tree, manual timers and rAF, an
// in-memory localStorage) and returns the namespaces the game declares.
//
//   const { U, DATA, COMBAT } = boot();                          // everything that exists
//   const { U, DATA } = boot({ only: ['util', 'data', 'data_cards_hanae'] });
//   boot({ only: ['data*'] })                                    // util + data + every data_*.js
//
// Options: only, store (initial localStorage), seed. Extra hooks on the result:
//   _store, _counts, _timers, _flush(ms), _raf(ms), _fire(event), _doc, _win, _els
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR = path.join(HERE, '..', 'rogue_book');
export const HTML = path.join(DIR, 'index.html');
export const NAMES = ['U', 'DATA', 'ART', 'AUDIO', 'COMBAT', 'MAP', 'RUN', 'META', 'UI', 'SCENE', 'GAME'];

/* Tiny assertion harness: prints "name: N passed, M failed", exits 1 on failure. */
export function harness(name) {
  let pass = 0, fail = 0;
  const h = {
    ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } },
    eq(a, b, msg) { h.ok(a === b, `${msg} [${a} != ${b}]`); },
    deep(a, b, msg) { h.ok(JSON.stringify(a) === JSON.stringify(b), `${msg} [${JSON.stringify(a)} != ${JSON.stringify(b)}]`); },
    near(a, b, eps, msg) { h.ok(Math.abs(a - b) <= eps, `${msg} [${a} vs ${b}]`); },
    throws(fn, msg) { let t = false; try { fn(); } catch (e) { t = true; } h.ok(t, msg); },
    test(msg, fn) { try { fn(); } catch (e) { fail++; console.log('FAIL:', msg, '::', (e && e.stack) || e); } },
    get counts() { return { pass, fail }; },
    done() { console.log(`${name}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); },
  };
  return h;
}

/* Script files index.html loads, in order (relative to rogue_book/). */
export function scriptFiles() {
  const html = fs.readFileSync(HTML, 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

function expandOnly(only, files) {
  if (!only) return files;
  const base = (f) => f.replace(/^js\//, '').replace(/\.js$/, '');
  const want = new Set();
  for (const pat of only) {
    if (pat === 'data*') { want.add('util'); want.add('data'); files.filter((f) => /^js\/data_/.test(f)).forEach((f) => want.add(base(f))); }
    else if (pat.endsWith('*')) files.filter((f) => base(f).startsWith(pat.slice(0, -1))).forEach((f) => want.add(base(f)));
    else want.add(pat);
  }
  return files.filter((f) => want.has(base(f)));
}

export function source(only) {
  const files = expandOnly(only, scriptFiles());
  const parts = [];
  for (const f of files) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) continue;                       // module not written yet
    parts.push(`/* ---- ${f} ---- */\n` + fs.readFileSync(p, 'utf8'));
  }
  return parts.join('\n');
}

// ---------------------------------------------------------------- stubs
function makeCtx(counts) {
  const gradient = { addColorStop() {} };
  const state = {};
  return new Proxy(state, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createConicGradient' || p === 'createPattern') return () => gradient;
      if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0)) * 4), width: w | 0, height: h | 0 });
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0)) * 4), width: w | 0, height: h | 0 });
      if (p === 'isPointInPath' || p === 'isPointInStroke') return () => false;
      if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (typeof p === 'string' && p !== 'then') return (...a) => { counts[p] = (counts[p] || 0) + 1; };
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function makeDom(ctx) {
  const els = [];
  const matches = (e, sel) => {
    sel = sel.trim();
    if (sel[0] === '#') return e.id === sel.slice(1);
    if (sel[0] === '.') return e.className.split(/\s+/).indexOf(sel.slice(1)) >= 0;
    const m = sel.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);
    if (m) { const k = m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()); return m[2] === undefined ? k in e.dataset : e.dataset[k] === m[2]; }
    return e.tagName === sel.toUpperCase();
  };
  const walk = (e, sel, out, first) => {
    for (const c of e.children) {
      if (first && out.length) return;
      if (matches(c, sel)) out.push(c);
      walk(c, sel, out, first);
    }
  };
  const mk = (tag) => {
    const kids = []; const attrs = {}; const cls = new Set();
    const e = {
      tagName: String(tag || 'div').toUpperCase(), style: { cssText: '', setProperty() {}, removeProperty() {} }, dataset: {},
      children: kids, childNodes: kids, parentNode: null, id: '', textContent: '', innerHTML: '', value: '', checked: false, disabled: false, hidden: false,
      width: 300, height: 150, clientWidth: 1280, clientHeight: 720, offsetWidth: 1280, offsetHeight: 720, scrollTop: 0, scrollLeft: 0,
      get className() { return [...cls].join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; }, contains: (c) => cls.has(c) },
      getContext: () => ctx, toDataURL: () => 'data:image/png;base64,', toBlob(cb) { cb && cb({}); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, x: 0, y: 0 }),
      addEventListener(t, fn) { (this._h || (this._h = {}))[t] = (this._h[t] || []).concat(fn); }, removeEventListener(t, fn) { if (this._h && this._h[t]) this._h[t] = this._h[t].filter((f) => f !== fn); },
      dispatch(t, ev) { ((this._h && this._h[t]) || []).forEach((f) => f(Object.assign({ target: e, preventDefault() {}, stopPropagation() {} }, ev))); },
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); kids.push(c); c.parentNode = e; return c; },
      append(...c) { c.forEach((x) => { if (x != null) e.appendChild(typeof x === 'string' ? mk('#text') : x); }); },
      prepend(c) { kids.unshift(c); c.parentNode = e; }, insertBefore(c, ref) { const i = kids.indexOf(ref); kids.splice(i < 0 ? kids.length : i, 0, c); c.parentNode = e; return c; },
      replaceChildren(...c) { kids.length = 0; c.forEach((x) => e.appendChild(x)); },
      removeChild(c) { const i = kids.indexOf(c); if (i >= 0) kids.splice(i, 1); c.parentNode = null; return c; },
      remove() { if (e.parentNode) e.parentNode.removeChild(e); },
      setAttribute(k, v) { attrs[k] = String(v); if (k === 'id') e.id = String(v); if (k === 'class') e.className = v; }, getAttribute: (k) => (k in attrs ? attrs[k] : null), removeAttribute(k) { delete attrs[k]; }, hasAttribute: (k) => k in attrs,
      querySelector(sel) { const out = []; walk(e, sel, out, true); return out[0] || null; }, querySelectorAll(sel) { const out = []; walk(e, sel, out, false); return out; },
      closest(sel) { let n = e; while (n) { if (matches(n, sel)) return n; n = n.parentNode; } return null; }, contains(o) { for (let n = o; n; n = n.parentNode) if (n === e) return true; return false; },
      focus() {}, blur() {}, click() { e.dispatch('click', {}); if (e.onclick) e.onclick({}); }, scrollIntoView() {}, setPointerCapture() {}, releasePointerCapture() {},
      animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }, requestFullscreen: () => Promise.resolve(),
    };
    els.push(e);
    return e;
  };
  return { mk, els };
}

export function boot(opts) {
  opts = opts || {};
  const counts = {};
  const ctx = makeCtx(counts);
  const { mk, els } = makeDom(ctx);
  const store = Object.assign({}, opts.store || {});
  const timers = []; let now = 0, tid = 0; const rafq = [];
  const docL = {}, winL = {};
  const byId = {};
  const getById = (id) => byId[id] || (byId[id] = Object.assign(mk('div'), { id }));
  ['stage', 'screens', 'overlays', 'toasts', 'wrap'].forEach(getById);
  byId.view = Object.assign(mk('canvas'), { id: 'view', width: 1280, height: 720 });
  const document = {
    documentElement: mk('html'), body: mk('body'), head: mk('head'), hidden: false, readyState: 'loading', visibilityState: 'visible',
    getElementById: getById, createElement: (t) => mk(t), createElementNS: (n, t) => mk(t), createTextNode: (s) => Object.assign(mk('#text'), { textContent: String(s) }),
    querySelector: (s) => document.body.querySelector(s) || mk('div'), querySelectorAll: (s) => document.body.querySelectorAll(s),
    addEventListener(t, fn) { (docL[t] || (docL[t] = [])).push(fn); }, removeEventListener() {}, fonts: { load: () => Promise.resolve(), ready: Promise.resolve() }, activeElement: null,
  };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear() { for (const k in store) delete store[k]; } };
  const setTimeout_ = (fn, ms) => { timers.push({ id: ++tid, fn, at: now + (ms || 0) }); return tid; };
  const clearTimeout_ = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const audioStub = () => new Proxy(function () {}, { get: (t, p) => (p === 'then' ? undefined : (p === 'currentTime' ? 0 : audioStub())), apply: () => audioStub(), construct: () => audioStub(), set: () => true });
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, document, localStorage,
    addEventListener(t, fn) { (winL[t] || (winL[t] = [])).push(fn); }, removeEventListener() {},
    location: { search: opts.search || '', hash: '', href: 'http://localhost/rogue_book/' },
    navigator: { userAgent: 'node', maxTouchPoints: 0, vibrate() {}, language: 'en' },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: (fn) => { rafq.push(fn); return rafq.length; }, cancelAnimationFrame() {},
    setTimeout: setTimeout_, clearTimeout: clearTimeout_, setInterval: () => 0, clearInterval() {},
    performance: { now: () => now }, AudioContext: audioStub, webkitAudioContext: audioStub,
    Image: class { set src(v) { this._s = v; if (this.onload) this.onload(); } get src() { return this._s; } get width() { return 64; } get height() { return 64; } },
    scrollTo() {}, open() {}, history: { replaceState() {} }, screen: { orientation: {} }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    OffscreenCanvas: undefined, ResizeObserver: class { observe() {} disconnect() {} }, CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d && d.detail; } },
  };
  win.window = win; win.self = win;
  const out = {};
  const src = source(opts.only) + '\n;__out.ns = {' + NAMES.map((n) => `${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(', ') + '};\n';
  const params = ['window', 'document', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'navigator', 'Image', 'AudioContext', 'getComputedStyle', '__out'];
  const fn = new Function(...params, src);
  fn(win, document, localStorage, win.requestAnimationFrame, win.cancelAnimationFrame, setTimeout_, clearTimeout_, win.setInterval, win.clearInterval, win.performance, win.navigator, win.Image, win.AudioContext, win.getComputedStyle, out);

  const api = Object.assign({}, out.ns);
  api._store = store; api._counts = counts; api._timers = timers; api._els = els; api._doc = document; api._win = win; api._ctx = ctx; api._byId = byId;
  api._resetCounts = () => { for (const k in counts) delete counts[k]; };
  api._flush = (ms) => { now += (ms == null ? 1e9 : ms); const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at); due.forEach((t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); t.fn(); }); };
  api._raf = (ms) => { now += ms || 16; const q = rafq.splice(0); q.forEach((f) => f(now)); return q.length; };
  api._fire = (ev, data) => { (docL[ev] || []).concat(winL[ev] || []).forEach((f) => f(data || {})); };
  return api;
}
