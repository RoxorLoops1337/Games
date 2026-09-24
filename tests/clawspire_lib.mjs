// Shared loader for the Clawspire suites.
//
// clawspire/index.html loads js/util.js .. js/game.js as classic scripts in a
// shared global scope.  This concatenates them in the order index.html lists
// them, stubs a DOM (a no-op 2d context that counts calls, a queued setTimeout
// the caller flushes by hand), and evals the lot, so the suites drive the
// game's own code rather than a copy of it.  boot() returns window.CS.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'clawspire');
const HTML = path.join(DIR, 'index.html');

export function harness(name) {
  let pass = 0, fail = 0;
  const h = {
    ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } },
    eq(a, b, msg) { h.ok(a === b, `${msg} [${a} != ${b}]`); },
    near(a, b, eps, msg) { h.ok(Math.abs(a - b) <= eps, `${msg} [${a} vs ${b}]`); },
    throws(fn, msg) { let t = false; try { fn(); } catch (e) { t = true; } h.ok(t, msg); },
    test(msg, fn) { try { fn(); } catch (e) { fail++; console.log('FAIL:', msg, '::', e && e.stack || e); } },
    done() { console.log(`${name}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); },
  };
  return h;
}

/* List the script files index.html loads, in order. Falls back to the
   canonical order when index.html does not exist yet (module work in flight). */
export function scriptFiles() {
  const canon = ['util', 'art', 'physics', 'data', 'combat', 'map', 'audio', 'render', 'game'].map(n => `js/${n}.js`);
  if (!fs.existsSync(HTML)) return canon;
  const html = fs.readFileSync(HTML, 'utf8');
  const found = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  return found.length ? found : canon;
}

/* Concatenated source of the given modules (default: all that exist). */
export function source(only) {
  const files = scriptFiles().filter(f => !only || only.some(n => f.endsWith(`/${n}.js`)));
  const parts = [];
  for (const f of files) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) { if (only) throw new Error('missing module ' + f); continue; }
    parts.push(`/* ---- ${f} ---- */\n` + fs.readFileSync(p, 'utf8'));
  }
  const html = fs.existsSync(HTML) ? fs.readFileSync(HTML, 'utf8') : '';
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!only) parts.push(...inline);
  return parts.join('\n');
}

export function makeSandbox(opts) {
  opts = opts || {};
  const counts = {};
  const gradient = { addColorStop() {} };
  const ctxStub = new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 40 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => gradient;
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (p === 'canvas') return { width: 540, height: 960 };
      if (typeof p === 'string' && p !== 'then' && !(p in t))
        return () => { counts[p] = (counts[p] || 0) + 1; };
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  const listeners = {};
  const mkEl = (tag) => {
    const kids = [];
    const e = {
      tagName: (tag || 'div').toUpperCase(), style: {}, textContent: '', innerHTML: '', value: '',
      width: 540, height: 960, className: '', dataset: {}, disabled: false, hidden: false, id: '',
      clientWidth: 540, clientHeight: 960, offsetWidth: 540, offsetHeight: 960, children: kids, childNodes: kids,
      parentNode: null, checked: false,
      getContext: () => (opts.noCtx ? null : ctxStub),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 960, right: 540, bottom: 960 }),
      addEventListener(t, fn) { (this._h || (this._h = {}))[t] = fn; },
      removeEventListener() {}, removeAttribute() {}, setAttribute() {}, getAttribute() { return null; },
      focus() {}, blur() {}, click() { if (this.onclick) this.onclick({}); if (this._h && this._h.click) this._h.click({}); },
      querySelector: () => mkEl(), querySelectorAll: () => [], closest: () => null,
      appendChild(c) { kids.push(c); c.parentNode = e; return c; }, append(...c) { c.forEach(x => x && kids.push(x)); },
      prepend() {}, insertBefore(c) { kids.unshift(c); return c; }, replaceChildren(...c) { kids.length = 0; kids.push(...c); },
      remove() {}, removeChild(c) { const i = kids.indexOf(c); if (i >= 0) kids.splice(i, 1); return c; },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      scrollIntoView() {}, scrollTo() {}, setPointerCapture() {}, releasePointerCapture() {},
      toDataURL: () => 'data:,', requestFullscreen() { return Promise.resolve(); },
    };
    return e;
  };
  const nodes = {};
  const store = Object.assign({}, opts.store || {});
  const timers = [];
  let now = 0;
  const sandbox = {
    document: {
      documentElement: mkEl('html'), body: mkEl('body'), head: mkEl('head'), hidden: false,
      getElementById: (id) => (nodes[id] || (nodes[id] = Object.assign(mkEl(), { id }))),
      createElement: (tag) => mkEl(tag), createElementNS: (ns, tag) => mkEl(tag),
      querySelector: () => mkEl(), querySelectorAll: () => [],
      addEventListener(t, fn) { listeners[t] = fn; }, removeEventListener() {},
      fonts: { load: () => Promise.resolve(), ready: Promise.resolve() },
      activeElement: null, visibilityState: 'visible',
    },
    window: {
      innerWidth: 540, innerHeight: 960, devicePixelRatio: 1,
      addEventListener(t, fn) { listeners[t] = fn; }, removeEventListener() {},
      location: { search: '', hash: '', href: 'http://localhost/clawspire/' },
      navigator: { userAgent: 'node', vibrate() {}, maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      requestAnimationFrame: () => 0, cancelAnimationFrame() {},
      scrollTo() {}, open() {}, history: { replaceState() {} }, screen: { orientation: {} },
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
    clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => now },
    navigator: { userAgent: 'node', vibrate() {}, maxTouchPoints: 0 },
    __out: {},
  };
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.performance = sandbox.performance;
  sandbox.window.document = sandbox.document;
  sandbox.window.setTimeout = sandbox.setTimeout;
  sandbox.window.clearTimeout = sandbox.clearTimeout;
  sandbox.window.navigator = sandbox.navigator;
  const flush = (ms) => {
    now += (ms == null ? 1e9 : ms);
    const due = timers.filter(t => t.at <= now);
    timers.splice(0, timers.length, ...timers.filter(t => t.at > now));
    due.sort((a, b) => a.at - b.at).forEach(t => t.fn());
  };
  return { sandbox, store, counts, nodes, timers, listeners, mkEl, flush, ctxStub, advance: (ms) => { now += ms; } };
}

/* Evaluates the game (or only the named modules) in a fresh sandbox and hands
   back window.CS plus the sandbox hooks (_store, _counts, _flush, ...).
   boot({only:['util','physics']}) returns {U, PHYS} for module-level suites. */
export function boot(opts) {
  opts = opts || {};
  const sb = makeSandbox(opts);
  const { sandbox } = sb;
  const only = opts.only;
  const names = ['U', 'ART', 'PHYS', 'DATA', 'COMBAT', 'MAP', 'AUDIO', 'RENDER', 'GAME'];
  const files = ['util', 'art', 'physics', 'data', 'combat', 'map', 'audio', 'render', 'game'];
  const wanted = only ? files.filter(f => only.includes(f)) : files;
  const expose = '\n;__out.mods = {' + wanted.map((f, i) => `${names[files.indexOf(f)]}: (typeof ${names[files.indexOf(f)]} !== 'undefined' ? ${names[files.indexOf(f)]} : undefined)`).join(', ') + '};\n';
  const src = source(only ? wanted : null) + expose;
  const fn = new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'navigator', '__out', src);
  fn(sandbox.window, sandbox.document, sandbox.localStorage, sandbox.requestAnimationFrame, sandbox.cancelAnimationFrame,
    sandbox.setTimeout, sandbox.clearTimeout, sandbox.setInterval, sandbox.clearInterval, sandbox.performance,
    sandbox.navigator, sandbox.__out);
  const api = Object.assign({}, sandbox.__out.mods, sandbox.window.CS || {});
  api._store = sb.store; api._counts = sb.counts; api._nodes = sb.nodes; api._timers = sb.timers;
  api._listeners = sb.listeners; api._flush = sb.flush; api._advance = sb.advance; api._ctx = sb.ctxStub;
  api._window = sandbox.window; api._document = sandbox.document;
  api._resetCounts = () => { for (const k in sb.counts) delete sb.counts[k]; };
  return api;
}

export { DIR, HTML };
