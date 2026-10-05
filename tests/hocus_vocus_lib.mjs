// Headless loader and shared test toolkit for the Inkwoven suites. This header is the record of every option and helper.
//
// boot() evaluates the game's classic scripts IN ORDER, each in its own guarded step, inside ONE shared vm context that behaves
// like a browser page (top-level const and let are shared between scripts exactly as between classic scripts), against a stubbed
// browser: a small real DOM built from index.html, a strict-ish canvas 2D context, WebAudio, storage, observers, media queries and a
// virtual clock for timers, rAF and Date.
//
//   import { boot, harness } from './hocus_vocus_lib.mjs';
//   const { U, DATA, COMBAT } = boot({ only: ['combat'] });        // util, data and every data_* file come along for you
//   const g = boot({ only: ['ui', 'art*', 'screen_menu'] });         // presentation suites list the layers they need
//   const all = boot();                                              // every script that exists: reserved for integration suites
//
// ---------------------------------------------------------------------------------------------------------------------------
// boot(opts): every option
//   only        [names]  Scripts you need, by base name without js/ or .js ('util', 'art_cast', 'combat') or as globs ('art*',
//                        'screen*', 'data_cards_*', '*'). util and data are ALWAYS added (and never optional), then each layer pulls in what it needs:
//                        art_* -> art;  audio -> data_samples (the sample manifest);  combat and map -> every data_* file;  run -> combat map;  meta -> run;  ui -> meta art audio;
//                        scene -> ui art*;  screen_* and tutorial -> ui scene art*;  main -> everything. A name index.html does not
//                        list, or a glob that matches nothing, throws with the list of valid names. Omit `only` to load everything.
//   skip        [names]  Leave these out (same name syntax), even when requested or pulled in.
//   continue    bool     boot() THROWS a BootError naming every file (file:line, syntax or runtime, message) that failed to load and
//                        that the suite asked for by EXACT name (or by omitting `only`). With continue:true it keeps going without
//                        those files and lists them in api._errors. Files matched only by a glob ('data*') or pulled in as
//                        dependencies never abort a boot: they are skipped, reported once on stderr and listed in api._warnings,
//                        so one teammate's broken file cannot fail every other suite. Name your own module exactly to be told.
//   dir         path     Game folder (default hocus_vocus/ next to tests/, or env ROGUE_BOOK_DIR). The tooling suites use fixtures.
//   strict      bool     Evaluate scripts in strict mode (default true): a typo that creates an implicit global throws.
//   store       object   Initial localStorage content (key -> string).
//   failStorage true | 'set' | 'get' | 'all' | 'access'   Storage that fails like private mode: 'set' (what true means) makes
//                        setItem throw QuotaExceededError; 'all' also makes getItem and removeItem throw; 'access' makes reading
//                        window.localStorage throw SecurityError.
//   search      string | object   location.search, e.g. '?goto=combat&enemies=kappa' or { goto: 'combat' }.       hash   location.hash.
//   seed        number   Fixes the run seed the way ?seed=N does (appended to location.search); exposed as api._seed. Use it for
//                        deterministic runs: RUN.newRun({ seed: api._seed, ... }).
//   autoboot    bool     Let main.js start the game at load. Default false: window.__NO_AUTOBOOT is true and suites call
//                        GAME.boot() themselves. true also fires DOMContentLoaded and load after the scripts.
//   realtime    bool     window.__HEADLESS is true unless this is set. While it is true UI.tween, UI.after, UI.transition,
//                        SCENE.play and AUDIO calls resolve on the next microtask (DESIGN section 5).
//   media       object   matchMedia answers, e.g. { '(prefers-reduced-motion: reduce)': true }; api._media(q, bool) flips one later.
//   touch       bool     maxTouchPoints 5, 'ontouchstart' in window, (pointer: coarse) and (hover: none) true.
//   viewport    { w, h } window.innerWidth and innerHeight (default 1280x720); api._resize(w, h) changes them later.
//   dpr         number   window.devicePixelRatio (default 1).
//   epoch       number   Date.now() at virtual time 0 (default 2026-01-01T00:00:00Z). Date, performance.now, every timer, rAF and the
//                        AudioContext clock share ONE virtual clock that only moves when the suite moves it.
//   sampleRate  number   AudioContext sampleRate (default 44100).
//   offscreen   bool     Provide OffscreenCanvas (default undefined, like older Safari, so games take the createElement path).
//   imageLoad   'ok' | 'error'   What setting Image.src does (default 'ok': onload fires on a microtask).
//   console     'capture' | 'pass'   api._console collects log info warn error debug either way; 'pass' also prints to stderr.
//   strictCtx   bool     Canvas issues (below) throw instead of only being recorded.
//   loadTimeout ms       Per-script guard against a top-level infinite loop (default 10000).
//   html        string   Use this markup instead of index.html for the document tree.
//   allowTopLevelDom, allowRandom, allowEval   Lift the corresponding guard (never in a game suite).
//
// What the sandbox enforces (each of these is a real bug in the shipped game):
//   * Math.random throws. Date and performance.now follow the virtual clock. eval and new Function throw.
//   * fetch, XMLHttpRequest, WebSocket, EventSource, Worker, alert, confirm, prompt and document.write throw.
//   * While scripts are LOADING, touching the DOM tree, storage, matchMedia, getComputedStyle or constructing an AudioContext
//     throws "touch it lazily" and names the file. Listener registration and typeof checks are fine.
//   * Canvas 2D: unknown methods do not exist (a typo throws a TypeError like a browser); arc, ellipse, arcTo and roundRect with a
//     negative radius, drawImage of a 0-size canvas or a non-image, getImageData of size 0, bad gradient stops, bad pattern
//     repetition and bad fill rules throw like a browser. Invalid colours, fonts and enum values are ignored like a browser AND
//     recorded, as are non-finite numbers and restore() without save(): see api._issues ({kind, detail, at}).
//   * WebAudio: exponentialRamp to 0, non-finite or negative-time param calls, starting an oscillator twice, stopping one that never
//     started, createBuffer of length 0 and a bad sample rate throw like a browser. A stopped source fires 'ended' on the clock.
//   * A throwing event handler surfaces from dispatchEvent (a browser would only log it), so suites fail loudly.
//   * window.__errors and window.__missing exist (empty arrays), as the inline watchdog in index.html makes them in a real page.
//
// The returned api: the namespaces the game declared (U DATA ART AUDIO COMBAT MAP RUN META UI SCENE GAME) plus helpers.
//   loading and page   _errors [{file, kind:'syntax'|'runtime', message, line, stack}]  _warnings (same, files pulled in only as
//                      dependencies)  _loaded  _missing (listed in index.html but not written yet)  _skipped  _win (the page global)
//                      _doc  _run(code) evaluates code inside the page  _store (the localStorage backing object)  _seed  _env
//   canvas and audio   _counts (call counters, all canvases)  _resetCounts() (also clears issues)  _ctx (the #view 2d context)  _issues
//                      _audio { contexts, created, started, stopped, log }
//   observation        _els (every element ever created)  _byId.<id>  _console  _uncaught  _reloads  _clipboard  _vibrations  _navigations
//                      _listeners(type) (window plus document listener count, for leak checks)
//   virtual time       _now() ms since boot  |  _flush(ms) runs due timers (no argument: drains every pending timeout, chained ones too)
//                      _raf(ms=16) one frame: due timers first, then the queued rAF callbacks (paused while document.hidden)
//                      _frames(n, dt=16)  _advance(ms, step=16)  |  async _tick(ms, step) like _advance but drains promise continuations
//                      after every frame  async _settle()  async _until(pred, {ms=20000, step=16})  ticks until pred() is truthy
//   input              _click(elOrSelector, {pointerType, x, y})  the whole pointer sequence and focus  _pointer(type, target, {x, y, id,
//                      button, buttons, pointerType})  _drag(target, [x0,y0], [x1,y1], steps=8)  honours setPointerCapture
//                      _key(key, {ctrl, shift, alt, meta, target, type:'press'|'down'|'up'})  Enter and Space activate buttons, Tab moves
//                      focus  _tab(shift)  _input(elOrSelector, value)  _fire(type, data) an event on document that bubbles to window
//   environment        _resize(w, h)  _media(query, bool)  _hide() and _show()  _triggerResize(el, {width, height})  _triggerIntersect(el, ratio)
// Other exports: harness(name), BootError, resolveScripts({only, skip, dir}), scriptFiles(dir), htmlAssets(html), source(only), DIR, ROOT,
// HTML, NAMES, and the static-analysis helpers the hygiene suite uses: tokenizeJs, stripJs, stripCss, analyzeTopLevel, lineOf, validCssColor.
//
// Notes for suite authors
//   * Objects created by the game live in the vm context: compare them with h.deep (JSON) or h.eq, do not rely on instanceof Array
//     or Object across the boundary. DOM objects, events and errors thrown by the stubs are host objects.
//   * `children` holds elements only, like a browser; `childNodes` also holds text nodes. Count with querySelectorAll('.x').length.
//   * The document is built from index.html's <head> and <body> markup (inline scripts are not run), so #stage #view #screens
//     #overlays #over #tips #toasts exist exactly when index.html declares them. getElementById of an unknown id is null.
//     Stylesheets are not applied: only inline styles, the hidden attribute and classes you set yourself exist in the DOM.
//   * on<type> handler properties run after addEventListener listeners of the same phase. Elements are 1280x720 unless an inline
//     px width, height, left or top says otherwise (or el._rect = { left, top, width, height }).
//   * harness().test(msg, fn) runs fn at once; if fn returns a promise, later tests queue behind it. Use `await h.test(...)` for
//     async tests. h.done() waits for everything, prints "name: N passed, M failed" and exits 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR = path.resolve(process.env.ROGUE_BOOK_DIR || path.join(HERE, '..', 'hocus_vocus'));
export const ROOT = path.dirname(DIR);
export const HTML = path.join(DIR, 'index.html');
export const NAMES = ['U', 'DATA', 'ART', 'AUDIO', 'COMBAT', 'MAP', 'RUN', 'META', 'UI', 'SCENE', 'GAME'];

// ======================================================================================
// harness
// ======================================================================================

/* Tiny assertion harness: prints "name: N passed, M failed", exits 1 on failure.
   h.test(msg, fn) runs fn now; if fn returns a promise, later tests wait for it, so
   `await h.test('x', async () => { ... })` is the pattern for async tests. */
export function harness(name) {
  let pass = 0, fail = 0;
  let chain = Promise.resolve();
  const pending = new Set();
  const report = (msg, e) => { fail++; console.log('FAIL:', msg, '::', (e && e.stack) || e); };
  const h = {
    ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } },
    eq(a, b, msg) { h.ok(a === b, `${msg} [${a} != ${b}]`); },
    deep(a, b, msg) { h.ok(JSON.stringify(a) === JSON.stringify(b), `${msg} [${JSON.stringify(a)} != ${JSON.stringify(b)}]`); },
    near(a, b, eps, msg) { h.ok(Math.abs(a - b) <= eps, `${msg} [${a} vs ${b}]`); },
    has(obj, key, msg) { h.ok(obj != null && key in Object(obj), `${msg || 'has'} [missing key "${key}"]`); },
    throws(fn, msg, re) {
      let err = null;
      try { fn(); } catch (e) { err = e; }
      h.ok(!!err && (!re || re.test(String(err && err.message || err))), `${msg}${err ? ` [threw "${err.message}"]` : ' [did not throw]'}`);
    },
    async rejects(p, msg) { let t = false; try { await (typeof p === 'function' ? p() : p); } catch (e) { t = true; } h.ok(t, msg); },
    test(msg, fn) {
      const run = () => {
        let r;
        try { r = fn(); } catch (e) { report(msg, e); return null; }
        return r && typeof r.then === 'function' ? r.then(() => {}, (e) => report(msg, e)) : null;
      };
      // a sync test runs immediately unless an async one is still in flight; then it queues behind it
      if (!pending.size) {
        const r = run();
        if (!r) return Promise.resolve();
        const p = chain = r.then(() => { pending.delete(p); });
        pending.add(p);
        return p;
      }
      const p = chain = chain.then(() => run()).then(() => { pending.delete(p); });
      pending.add(p);
      return p;
    },
    get counts() { return { pass, fail }; },
    async done() {
      while (pending.size) await Promise.all([...pending]);
      console.log(`${name}: ${pass} passed, ${fail} failed`);
      process.exit(fail ? 1 : 0);
    },
  };
  return h;
}

// ======================================================================================
// script discovery and dependency resolution
// ======================================================================================

const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

/* Everything index.html loads: {scripts:[src], styles:[href], inline:[{code, line}]}. */
export function htmlAssets(html) {
  const clean = stripHtmlComments(html);
  const scripts = [...clean.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi)].map((m) => m[1]);
  const styles = [...clean.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi)].map((m) => (/href\s*=\s*["']([^"']+)["']/i.exec(m[0]) || [])[1]).filter(Boolean);
  const inline = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(clean))) if (!/\bsrc\s*=/.test(m[1])) inline.push({ code: m[2], line: clean.slice(0, m.index).split('\n').length });
  const inlineStyles = [...clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  return { scripts, styles, inline, inlineStyles };
}

/* Script files index.html loads, in order (relative to hocus_vocus/). */
export function scriptFiles(dir = DIR, page = 'index.html') {
  const f = path.join(dir, page);
  return fs.existsSync(f) ? htmlAssets(fs.readFileSync(f, 'utf8')).scripts : [];
}

const baseName = (f) => f.replace(/^js\//, '').replace(/\.js$/, '');
const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const normName = (n) => baseName(String(n).replace(/^\.?\//, ''));

/* What each module needs loaded before it. Entries may be globs. */
function depsOf(n) {
  if (n === 'util') return [];
  if (n === 'data') return ['util'];
  if (n === 'art') return ['data'];
  if (n === 'art_cast_kit') return ['art'];
  if (/^art_/.test(n)) return ['art', 'art_cast_kit'];                 // the cast kit (ART.rj, its foe kit too) when the page lists it
  if (n === 'audio') return ['data', 'data_samples'];            // the owners' sample manifest (DATA.SAMPLES) when the page lists it; audio.js reads it at init
  if (n === 'combat' || n === 'map') return ['data*'];
  if (n === 'run') return ['combat', 'map', 'data*'];
  if (n === 'meta') return ['run', 'data*'];
  if (n === 'ui') return ['meta', 'art', 'audio', 'data*'];
  if (n === 'scene') return ['ui', 'art*'];
  if (/^screen_/.test(n) || n === 'tutorial') return ['ui', 'scene', 'art*', 'data*'];
  if (n === 'main') return ['*'];
  return ['data'];                                            // data_* content, data_text, anything new
}

/* Which files a boot would load: { files:[in index.html order], explicit:Set, missing:[], listed:[] }.
   Throws on names that match nothing. Exported so suites and the hygiene checks can reuse it. */
export function resolveScripts({ only, skip, dir = DIR } = {}) {
  if (typeof only === 'string') only = [only];
  if (typeof skip === 'string') skip = [skip];
  const listed = scriptFiles(dir);
  const names = listed.map(baseName);
  const exists = (f) => fs.existsSync(path.join(dir, f));
  const match = (pat) => { const re = globToRe(normName(pat)); return listed.filter((f) => re.test(baseName(f))); };
  let want = new Set(listed), explicit = new Set(listed);
  if (only) {
    want = new Set(); explicit = new Set();
    for (const p of only) {
      const hit = match(p);
      if (!hit.length) throw new Error(`boot({only}): no script matches "${p}". index.html loads: ${names.join(', ')}`);
      const glob = /[*]/.test(p);
      if (!glob) { hit.forEach((f) => { if (!exists(f)) throw new Error(`boot({only}): "${p}" is listed in index.html but ${f} does not exist yet`); }); }
      hit.forEach((f) => { want.add(f); if (!glob) explicit.add(f); });                  // a glob is soft: a broken sibling must not fail your suite
    }
    for (const base0 of ['util', 'data']) for (const f of match(base0)) { want.add(f); explicit.add(f); }   // U and DATA are always there (DESIGN 7), and never optional
    const work = [...want];
    while (work.length) {
      const f = work.pop();
      for (const d of depsOf(baseName(f))) for (const g of match(d)) if (!want.has(g)) { want.add(g); work.push(g); }
    }
  }
  if (skip) for (const p of skip) { const re = globToRe(normName(p)); for (const f of listed) if (re.test(baseName(f))) { want.delete(f); explicit.delete(f); } }
  const files = listed.filter((f) => want.has(f));
  return { files, explicit, missing: files.filter((f) => !exists(f)), listed };
}

/* Concatenated source of the scripts a boot would load (debugging aid). */
export function source(only, dir = DIR) {
  return resolveScripts({ only, dir }).files.filter((f) => fs.existsSync(path.join(dir, f)))
    .map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}

// ======================================================================================
// static analysis helpers (used by the hygiene suite, tested by the lib suite)
// ======================================================================================

export const lineOf = (src, offset) => { let n = 1; for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; };

const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'instanceof', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'of']);

/* JavaScript tokenizer good enough for lint: comments, strings, templates (with nested ${}), regex
   literals, numbers, identifiers, punctuators. Token {t, v, s, e}: t is id num str tplHead tplMid tplTail
   regex private punct comment. Offsets index the original source. */
export function tokenizeJs(src) {
  const toks = [];
  const n = src.length;
  const tplStack = [];               // one {depth} per open ${ }
  let prev = null, i = 0;
  const add = (t, s, e) => { const tok = { t, v: src.slice(s, e), s, e }; toks.push(tok); if (t !== 'comment') prev = tok; };
  const idStart = (c) => /[A-Za-z_$\u0080-\uffff]/.test(c);
  const idPart = (c) => /[\w$\u0080-\uffff]/.test(c);
  const regexOk = () => {
    if (!prev) return true;
    if (prev.t === 'num' || prev.t === 'str' || prev.t === 'regex' || prev.t === 'tplTail' || prev.t === 'private') return false;
    if (prev.t === 'id') return REGEX_AFTER.has(prev.v);
    if (prev.t === 'punct') return !(prev.v === ')' || prev.v === ']' || prev.v === '++' || prev.v === '--');
    return true;
  };
  // scan template text from pos (just after ` or }) up to the next ${ or closing `
  const scanTemplate = (start, kind) => {
    let j = start;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') { add(kind === 'head' ? 'str' : 'tplTail', kind === 'head' ? start - 1 : start - 1, j + 1); return j + 1; }
      if (c === '$' && src[j + 1] === '{') { add(kind === 'head' ? 'tplHead' : 'tplMid', start - 1, j + 2); tplStack.push({ depth: 0 }); return j + 2; }
      j++;
    }
    add(kind === 'head' ? 'str' : 'tplTail', start - 1, n);
    return n;
  };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\u00a0' || c === '\ufeff') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; add('comment', i, j); i = j; continue; }
    if (c === '/' && src[i + 1] === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; add('comment', i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      add('str', i, Math.min(n, src[j] === c ? j + 1 : j)); i = Math.min(n, src[j] === c ? j + 1 : j); continue;
    }
    if (c === '`') { i = scanTemplate(i + 1, 'head'); continue; }
    if (c === '}' && tplStack.length && tplStack[tplStack.length - 1].depth === 0) { tplStack.pop(); i = scanTemplate(i + 1, 'mid'); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(?:0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?)/.exec(src.slice(i, i + 64));
      const len = m ? m[0].length : 1; add('num', i, i + len); i += len; continue;
    }
    if (idStart(c) || c === '\\') { let j = i + 1; while (j < n && (idPart(src[j]) || src[j] === '\\')) j++; add('id', i, j); i = j; continue; }
    if (c === '#' && idStart(src[i + 1] || '')) { let j = i + 1; while (j < n && idPart(src[j])) j++; add('private', i, j); i = j; continue; }
    if (c === '/' && regexOk()) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      add('regex', i, j); i = j; continue;
    }
    let p = null;
    for (const cand of PUNCT) if (src.startsWith(cand, i)) { if (cand === '?.' && /[0-9]/.test(src[i + 2] || '')) continue; p = cand; break; }
    if (!p) p = c;
    if (tplStack.length) { if (p === '{') tplStack[tplStack.length - 1].depth++; else if (p === '}') tplStack[tplStack.length - 1].depth--; }
    add('punct', i, i + p.length); i += p.length;
  }
  return toks;
}

/* Source with comments blanked (and, unless keepStrings, string/template/regex contents blanked too).
   Same length and same line breaks as the input, so offsets and line numbers still line up. */
export function stripJs(src, { keepStrings = false } = {}) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  for (const t of tokenizeJs(src)) {
    if (t.t === 'comment') blank(t.s, t.e);
    else if (keepStrings) continue;
    else if (t.t === 'str') blank(t.s + 1, Math.max(t.s + 1, t.e - 1));
    else if (t.t === 'tplHead' || t.t === 'tplMid') blank(t.s + 1, t.e - 2);
    else if (t.t === 'tplTail') blank(t.s + 1, Math.max(t.s + 1, t.e - 1));
    else if (t.t === 'regex') { const last = src.lastIndexOf('/', t.e - 1); blank(t.s + 1, Math.max(t.s + 1, last)); }
  }
  return out.join('');
}

/* Blank the comments of a CSS or HTML-less text. */
export const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/* What a classic script declares at global scope. Returns
   { names:[{name, kind, line}], statements:[{kind, iife, line, text}] }.
   names: const/let/var/function/class declared at top level, `var` and function declarations that leak
   out of top-level blocks (they become globals), destructuring (name '<pattern>') and import/export.
   statements: one entry per top-level statement (empty statements are ignored). */
export function analyzeTopLevel(src) {
  const toks = tokenizeJs(src).filter((t) => t.t !== 'comment');
  const N = toks.length;
  const depth = new Array(N), inFn = new Array(N), closeOf = new Array(N).fill(-1);
  const parens = [], braces = [];
  let d = 0, fnDepth = 0;
  const BLOCK_KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
  const fnOpen = [];                                              // stack of booleans: brace opens a function body
  for (let k = 0; k < N; k++) {
    const t = toks[k];
    depth[k] = d; inFn[k] = fnDepth;
    if (t.t !== 'punct' && t.t !== 'tplHead' && t.t !== 'tplMid' && t.t !== 'tplTail') continue;
    if (t.t === 'tplHead' || t.t === 'tplMid') { d++; if (t.t === 'tplMid') d--; continue; }
    if (t.t === 'tplTail') { d = Math.max(0, d - 1); continue; }
    if (t.v === '(' || t.v === '[') { d++; parens.push(k); }
    else if (t.v === ')' || t.v === ']') { d = Math.max(0, d - 1); const o = parens.pop(); if (o !== undefined) { closeOf[o] = k; closeOf[k] = o; } depth[k] = d; }
    else if (t.v === '{') {
      const p = toks[k - 1];
      let isFn = false;
      if (p && p.t === 'punct' && p.v === '=>') isFn = true;
      else if (p && p.t === 'punct' && p.v === ')') {
        const o = closeOf[k - 1], before = o > 0 ? toks[o - 1] : null;
        isFn = !(before && before.t === 'id' && BLOCK_KW.has(before.v));
      }
      fnOpen.push(isFn); if (isFn) fnDepth++;
      d++;
    } else if (t.v === '}') { d = Math.max(0, d - 1); depth[k] = d; if (fnOpen.pop()) fnDepth--; inFn[k] = fnDepth; }
  }
  // statement splitting at depth 0
  const CONT_NEXT = new Set(['.', ',', ')', ']', '}', '?', ':', ';', '=', '=>', '&&', '||', '??', '+', '-', '*', '/', '%', '**', '<', '>', '<=', '>=', '==', '!=', '===', '!==', '&', '|', '^', '<<', '>>', '>>>', '(', '[', '?.', '+=', '-=', '*=', '/=', '%=', 'in', 'instanceof']);
  const CONT_PREV = new Set(['.', ',', '(', '[', '{', '?', ':', '=', '=>', '&&', '||', '??', '+', '-', '*', '/', '%', '**', '<', '>', '<=', '>=', '==', '!=', '===', '!==', '&', '|', '^', '<<', '>>', '>>>', '!', '~', '...', '+=', '-=', '*=', '/=', '%=', '?.', 'return', 'typeof', 'new', 'delete', 'void', 'throw', 'else', 'do', 'case', 'in', 'instanceof', 'async', 'await', 'yield', 'of', 'extends']);
  const statements = [];
  let k = 0;
  const lineTok = (tk) => lineOf(src, tk.s);
  while (k < N) {
    if (toks[k].t === 'punct' && toks[k].v === ';') { k++; continue; }
    const start = k;
    const first = toks[k];
    const blockish = first.t === 'id' && ['function', 'class', 'if', 'for', 'while', 'switch', 'try', 'do'].includes(first.v)
      || (first.t === 'id' && first.v === 'async' && toks[k + 1] && toks[k + 1].v === 'function')
      || (first.t === 'punct' && first.v === '{');
    let end = k;
    for (; k < N; k++) {
      const t = toks[k];
      end = k;
      if (depth[k] === 0 && t.t === 'punct' && t.v === ';' ) { k++; break; }
      if (depth[k] === 0 && t.t === 'punct' && t.v === '}' && blockish) {
        const nx = toks[k + 1];
        const cont = nx && nx.t === 'id' && (nx.v === 'else' || nx.v === 'catch' || nx.v === 'finally' || (first.v === 'do' && nx.v === 'while'));
        if (!cont) { k++; break; }
      }
      // ASI: a line break at depth 0 ends the statement unless the next token continues it
      const nx = toks[k + 1];
      if (nx && depth[k + 1] === 0 && depth[k] === 0 && lineOf(src, nx.s) > lineOf(src, t.e - 1)) {
        const contPrev = (t.t === 'punct' || t.t === 'id') && CONT_PREV.has(t.v);
        const contNext = (nx.t === 'punct' || nx.t === 'id') && CONT_NEXT.has(nx.v) || nx.t === 'tplHead' || (nx.t === 'str' && nx.v[0] === '`');
        const keepBlock = t.v === '}' && blockish;
        if (!contPrev && !contNext && !keepBlock) { k++; break; }
      }
      if (k === N - 1) { k++; break; }
    }
    statements.push({ start, end: Math.max(start, Math.min(end, N - 1)) });
  }
  const out = { names: [], statements: [] };
  const declNames = (from, to) => {                                // declarators of const/let/var starting after the keyword
    const names = [];
    let j = from;
    while (j <= to) {
      const t = toks[j];
      if (t.t === 'punct' && (t.v === '{' || t.v === '[')) names.push({ name: '<pattern>', tok: t });
      else if (t.t === 'id') names.push({ name: t.v, tok: t });
      // skip initializer up to the next depth-0 comma
      let q = j + 1;
      while (q <= to && !(depth[q] === depth[from] && toks[q].t === 'punct' && toks[q].v === ',')) q++;
      j = q + 1;
    }
    return names;
  };
  for (const st of statements) {
    const { start, end } = st;
    const first = toks[start];
    const text = src.slice(first.s, Math.min(src.length, toks[end].e)).replace(/\s+/g, ' ').slice(0, 80);
    let kind = 'expr', iife = false;
    if (first.t === 'id' && (first.v === 'const' || first.v === 'let' || first.v === 'var')) {
      kind = 'decl';
      for (const nm of declNames(start + 1, end)) out.names.push({ name: nm.name, kind: first.v, line: lineTok(nm.tok) });
    } else if (first.t === 'id' && (first.v === 'function' || (first.v === 'async' && toks[start + 1] && toks[start + 1].v === 'function'))) {
      kind = 'function';
      let j = start + (first.v === 'async' ? 2 : 1);
      if (toks[j] && toks[j].v === '*') j++;
      if (toks[j] && toks[j].t === 'id' && toks[j + 1] && toks[j + 1].v === '(') out.names.push({ name: toks[j].v, kind: 'function', line: lineTok(toks[j]) });
      else kind = 'expr';
    } else if (first.t === 'id' && first.v === 'class' && toks[start + 1] && toks[start + 1].t === 'id' && toks[start + 1].v !== 'extends') {
      kind = 'class'; out.names.push({ name: toks[start + 1].v, kind: 'class', line: lineTok(toks[start + 1]) });
    } else if (first.t === 'id' && (first.v === 'import' || first.v === 'export') && !(toks[start + 1] && toks[start + 1].v === '(')) {
      kind = first.v; out.names.push({ name: '<' + first.v + '>', kind: first.v, line: lineTok(first) });
    } else if (first.t === 'punct' && first.v === '(') {
      const c = closeOf[start];
      const inner = toks[start + 1];
      const innerFn = inner && ((inner.t === 'id' && (inner.v === 'function' || inner.v === 'async')) || (inner.t === 'punct' && inner.v === '(') || (inner.t === 'id' && toks[start + 2] && toks[start + 2].v === '=>'));
      if (c > 0 && innerFn) {
        const nx = toks[c + 1];
        if (nx && nx.t === 'punct' && nx.v === '(') iife = true;                               // (function () {})()
        else if (toks[c - 1] && toks[c - 1].v === ')' && toks[c - 2] && toks[c - 2].v === '(') iife = true;   // (function () {}())
      }
      kind = iife ? 'iife' : 'expr';
    }
    out.statements.push({ kind, iife, line: lineTok(first), text });
  }
  // var and function declarations that escape top-level blocks become globals
  for (let q = 0; q < N; q++) {
    const t = toks[q];
    if (t.t !== 'id' || inFn[q] !== 0 || depth[q] === 0 && statements.some((s) => s.start === q)) continue;
    if (t.v === 'var' && depth[q] >= 0) {
      const prevTok = toks[q - 1];
      if (prevTok && prevTok.t === 'punct' && (prevTok.v === '.' || prevTok.v === '?.')) continue;
      if (depth[q] === 0) continue;                               // handled as a statement
      const nx = toks[q + 1];
      if (nx && nx.t === 'id') out.names.push({ name: nx.v, kind: 'var (leaks out of a block)', line: lineTok(nx) });
      else if (nx && nx.t === 'punct') out.names.push({ name: '<pattern>', kind: 'var (leaks out of a block)', line: lineTok(nx) });
    } else if (t.v === 'function' && depth[q] > 0) {
      const p = toks[q - 1], nx = toks[q + 1], after = toks[q + 2];
      if (p && p.t === 'punct' && (p.v === '{' || p.v === ';' || p.v === '}') && nx && nx.t === 'id' && after && after.v === '(') out.names.push({ name: nx.v, kind: 'function (hoists out of a block)', line: lineTok(nx) });
    }
  }
  return out;
}

// ======================================================================================
// runtime stubs: events, selectors, DOM
// ======================================================================================

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVGNS = 'http://www.w3.org/2000/svg';
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TAGS = new Set(['script', 'style']);
const RCDATA_TAGS = new Set(['textarea', 'title']);
const kebab = (s) => s.replace(/^(webkit|moz|ms|o)([A-Z])/, '-$1$2').replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9', times: '\u00d7', hellip: '\u2026', middot: '\u00b7', bull: '\u2022', larr: '\u2190', rarr: '\u2192', uarr: '\u2191', darr: '\u2193', check: '\u2713' };
const decodeEntities = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) ? String.fromCodePoint(cp) : m; }
  return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, e.toLowerCase()) ? NAMED_ENTITIES[e.toLowerCase()] : m;
}));
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function domErr(msg, name) { return new DOMException(msg, name); }
function syntaxErr(sel) { return domErr(`'${sel}' is not a valid selector.`, 'SyntaxError'); }

// ---- events -------------------------------------------------------------------------

function installEvents(env) {
  const g = env.g;
  class EventStub {
    constructor(type, init) {
      if (arguments.length === 0) throw new TypeError("Failed to construct 'Event': 1 argument required, but only 0 present.");
      init = init || {};
      this.type = String(type);
      this.bubbles = !!init.bubbles; this.cancelable = !!init.cancelable; this.composed = !!init.composed;
      this.defaultPrevented = false; this.target = null; this.currentTarget = null; this.srcElement = null; this.eventPhase = 0;
      this.timeStamp = env.now; this.isTrusted = false; this.cancelBubble = false; this.returnValue = true;
      this._stop = false; this._stopNow = false; this._path = null; this._busy = false;
    }
    preventDefault() { if (this.cancelable) { this.defaultPrevented = true; this.returnValue = false; } }
    stopPropagation() { this._stop = true; this.cancelBubble = true; }
    stopImmediatePropagation() { this._stop = true; this._stopNow = true; this.cancelBubble = true; }
    composedPath() { return this._path ? this._path.map((n) => n._self || n) : []; }
  }
  Object.assign(EventStub, { NONE: 0, CAPTURING_PHASE: 1, AT_TARGET: 2, BUBBLING_PHASE: 3 });
  const mods = (o, init) => { o.ctrlKey = !!init.ctrlKey; o.shiftKey = !!init.shiftKey; o.altKey = !!init.altKey; o.metaKey = !!init.metaKey; o.getModifierState = (k) => ({ Control: o.ctrlKey, Shift: o.shiftKey, Alt: o.altKey, Meta: o.metaKey })[k] || false; };
  class UIEventStub extends EventStub { constructor(t, i) { super(t, i); i = i || {}; this.detail = i.detail || 0; this.view = i.view || null; } }
  class MouseEventStub extends UIEventStub {
    constructor(t, i) {
      super(t, i); i = i || {};
      this.clientX = i.clientX || 0; this.clientY = i.clientY || 0; this.screenX = i.screenX || 0; this.screenY = i.screenY || 0;
      this.pageX = i.pageX == null ? this.clientX : i.pageX; this.pageY = i.pageY == null ? this.clientY : i.pageY;
      this.offsetX = i.offsetX == null ? this.clientX : i.offsetX; this.offsetY = i.offsetY == null ? this.clientY : i.offsetY;
      this.x = this.clientX; this.y = this.clientY; this.movementX = i.movementX || 0; this.movementY = i.movementY || 0;
      this.button = i.button || 0; this.buttons = i.buttons || 0; this.relatedTarget = i.relatedTarget || null; mods(this, i);
    }
  }
  class PointerEventStub extends MouseEventStub {
    constructor(t, i) {
      super(t, i); i = i || {};
      this.pointerId = i.pointerId == null ? 1 : i.pointerId; this.width = i.width == null ? 1 : i.width; this.height = i.height == null ? 1 : i.height;
      this.pressure = i.pressure == null ? (this.buttons ? 0.5 : 0) : i.pressure; this.pointerType = i.pointerType || 'mouse'; this.isPrimary = i.isPrimary == null ? true : !!i.isPrimary;
      this.tiltX = 0; this.tiltY = 0;
    }
    getCoalescedEvents() { return []; }
  }
  class WheelEventStub extends MouseEventStub { constructor(t, i) { super(t, i); i = i || {}; this.deltaX = i.deltaX || 0; this.deltaY = i.deltaY || 0; this.deltaZ = i.deltaZ || 0; this.deltaMode = i.deltaMode || 0; } }
  class KeyboardEventStub extends UIEventStub {
    constructor(t, i) { super(t, i); i = i || {}; this.key = i.key == null ? '' : String(i.key); this.code = i.code || ''; this.repeat = !!i.repeat; this.location = i.location || 0; this.isComposing = false; this.keyCode = i.keyCode || 0; this.which = this.keyCode; mods(this, i); }
  }
  class FocusEventStub extends UIEventStub { constructor(t, i) { super(t, i); this.relatedTarget = (i && i.relatedTarget) || null; } }
  class InputEventStub extends UIEventStub { constructor(t, i) { super(t, i); i = i || {}; this.data = i.data == null ? null : i.data; this.inputType = i.inputType || ''; } }
  class CustomEventStub extends EventStub { constructor(t, i) { super(t, i); this.detail = i && i.detail !== undefined ? i.detail : null; } }
  class TouchEventStub extends UIEventStub { constructor(t, i) { super(t, i); i = i || {}; this.touches = i.touches || []; this.targetTouches = i.targetTouches || []; this.changedTouches = i.changedTouches || []; mods(this, i); } }
  class ErrorEventStub extends EventStub { constructor(t, i) { super(t, i); i = i || {}; this.message = i.message || ''; this.filename = i.filename || ''; this.lineno = i.lineno || 0; this.colno = i.colno || 0; this.error = i.error || null; } }
  class PromiseRejectionEventStub extends EventStub { constructor(t, i) { super(t, i); i = i || {}; this.promise = i.promise; this.reason = i.reason; } }
  Object.assign(g, { Event: EventStub, UIEvent: UIEventStub, MouseEvent: MouseEventStub, PointerEvent: PointerEventStub, WheelEvent: WheelEventStub, KeyboardEvent: KeyboardEventStub, FocusEvent: FocusEventStub, InputEvent: InputEventStub, CustomEvent: CustomEventStub, TouchEvent: TouchEventStub, ErrorEvent: ErrorEventStub, PromiseRejectionEvent: PromiseRejectionEventStub });
  env.ev = { Event: EventStub, MouseEvent: MouseEventStub, PointerEvent: PointerEventStub, KeyboardEvent: KeyboardEventStub, FocusEvent: FocusEventStub, InputEvent: InputEventStub, WheelEvent: WheelEventStub };

  class EventTargetStub {
    constructor() { this._l = null; }
    addEventListener(type, fn, opts) {
      if (fn == null) return;
      const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
      const once = !!(opts && typeof opts === 'object' && opts.once);
      const map = this._l || (this._l = Object.create(null));
      const list = map[type] || (map[type] = []);
      if (list.some((l) => l.fn === fn && l.capture === capture)) return;
      list.push({ fn, capture, once });
      if (opts && opts.signal) opts.signal.addEventListener('abort', () => this.removeEventListener(type, fn, opts));
    }
    removeEventListener(type, fn, opts) {
      const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
      const list = this._l && this._l[type];
      if (list) this._l[type] = list.filter((l) => !(l.fn === fn && l.capture === capture));
    }
    _eventParent() { return null; }
    dispatchEvent(ev) {
      if (!(ev instanceof EventStub)) throw new TypeError("Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type 'Event'.");
      if (ev._busy) throw domErr('The event is already being dispatched.', 'InvalidStateError');
      const path = [];
      for (let n = this; n; n = n._eventParent()) path.push(n);
      ev.target = this._self || this; ev.srcElement = ev.target; ev._path = path; ev._busy = true;
      const errors = [];
      const run = (node, capturePass) => {
        ev.currentTarget = node._self || node;
        const list = (node._l && node._l[ev.type]) || [];
        const calls = list.filter((l) => l.capture === capturePass);
        if (!capturePass) {
          const h = (node._self || node)['on' + ev.type];
          if (typeof h === 'function') calls.push({ fn: h, capture: false, once: false, prop: true });    // on<type> handlers run after addEventListener ones
        }
        for (const l of calls.slice()) {
          if (ev._stopNow) break;
          if (l.once) node.removeEventListener(ev.type, l.fn, { capture: l.capture });
          try {
            if (typeof l.fn === 'function') { const r = l.fn.call(node._self || node, ev); if (l.prop && r === false) ev.preventDefault(); }
            else if (l.fn && typeof l.fn.handleEvent === 'function') l.fn.handleEvent(ev);
          } catch (e) { errors.push(e); }
        }
      };
      ev.eventPhase = 1;
      for (let i = path.length - 1; i > 0 && !ev._stop; i--) run(path[i], true);
      if (!ev._stop) { ev.eventPhase = 2; run(path[0], true); if (!ev._stopNow) run(path[0], false); }
      if (ev.bubbles) { ev.eventPhase = 3; for (let i = 1; i < path.length && !ev._stop; i++) run(path[i], false); }
      ev.eventPhase = 0; ev.currentTarget = null; ev._busy = false;
      if (errors.length) { env.uncaught.push(...errors); throw errors[0]; }   // surfaced, unlike a browser, so suites fail loudly
      return !ev.defaultPrevented;
    }
    _count(type) { const l = this._l && this._l[type]; return l ? l.length : 0; }
  }
  g.EventTarget = EventTargetStub;
  env.EventTargetStub = EventTargetStub;
}

// ---- CSS selectors ------------------------------------------------------------------

const selCache = new Map();
const isEl = (n) => n && n.nodeType === 1;
const prevElSib = (el) => { const p = el.parentNode; if (!p) return null; const k = p.childNodes; for (let i = k.indexOf(el) - 1; i >= 0; i--) if (k[i].nodeType === 1) return k[i]; return null; };
const nextElSib = (el) => { const p = el.parentNode; if (!p) return null; const k = p.childNodes; for (let i = k.indexOf(el) + 1; i < k.length; i++) if (k[i].nodeType === 1) return k[i]; return null; };

class SelParser {
  constructor(s) { this.s = s; this.i = 0; }
  peek() { return this.s[this.i]; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  ident() {
    let out = '';
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '\\') { out += this.s[this.i + 1] || ''; this.i += 2; }
      else if (/[\w\u0080-\uffff-]/.test(c)) { out += c; this.i++; }
      else break;
    }
    return out;
  }
  list(relative) {
    const alts = [];
    do { this.ws(); alts.push(this.complex(relative)); this.ws(); } while (this.peek() === ',' && ++this.i);
    return alts;
  }
  complex(relative) {
    const parts = [];
    let comb = '';
    this.ws();
    if (relative && '>+~'.includes(this.peek() || 'x')) { comb = this.s[this.i++]; this.ws(); }
    else if (relative) comb = ' ';
    for (;;) {
      const compound = this.compound();
      parts.push({ comb, compound });
      const save = this.i;
      this.ws();
      const ch = this.peek();
      if (ch === '>' || ch === '+' || ch === '~') { this.i++; this.ws(); comb = ch; continue; }
      if (ch === undefined || ch === ',' || ch === ')') return parts;
      if (this.i > save) { comb = ' '; continue; }
      throw syntaxErr(this.s);
    }
  }
  compound() {
    const c = { tag: null, ids: [], classes: [], attrs: [], pseudos: [], never: false };
    let any = false;
    for (;;) {
      const ch = this.peek();
      if (ch === '*') { this.i++; c.tag = '*'; any = true; }
      else if (ch === '#') { this.i++; const id = this.ident(); if (!id) throw syntaxErr(this.s); c.ids.push(id); any = true; }
      else if (ch === '.') { this.i++; const cl = this.ident(); if (!cl) throw syntaxErr(this.s); c.classes.push(cl); any = true; }
      else if (ch === '[') { c.attrs.push(this.attr()); any = true; }
      else if (ch === ':') {
        this.i++;
        if (this.peek() === ':') { this.i++; this.ident(); c.never = true; any = true; continue; }
        const name = this.ident().toLowerCase();
        let arg = null;
        if (this.peek() === '(') {
          this.i++;
          if (['not', 'is', 'where', 'matches', 'has'].includes(name)) arg = this.list(name === 'has');
          else { const st = this.i; let depth = 1; while (this.i < this.s.length && depth) { if (this.s[this.i] === '(') depth++; else if (this.s[this.i] === ')') depth--; this.i++; } arg = this.s.slice(st, this.i - 1).trim(); this.i--; }
          if (this.peek() !== ')') throw syntaxErr(this.s);
          this.i++;
        }
        c.pseudos.push({ name, arg }); any = true;
      } else if (!any && /[A-Za-z_\u0080-\uffff\\]/.test(ch || '')) { c.tag = this.ident().toLowerCase(); any = true; }
      else break;
    }
    if (!any) throw syntaxErr(this.s);
    return c;
  }
  attr() {
    this.i++; this.ws();
    const name = this.ident().toLowerCase();
    this.ws();
    let op = null, val = null, ci = false;
    if (this.peek() !== ']') {
      const m = /^([~|^$*]?=)/.exec(this.s.slice(this.i));
      if (!m) throw syntaxErr(this.s);
      op = m[1]; this.i += op.length; this.ws();
      const q = this.peek();
      if (q === '"' || q === "'") { this.i++; const st = this.i; while (this.i < this.s.length && this.s[this.i] !== q) this.i += this.s[this.i] === '\\' ? 2 : 1; val = this.s.slice(st, this.i).replace(/\\(.)/g, '$1'); this.i++; }
      else val = this.ident();
      this.ws();
      if (/^[iIsS]$/.test(this.peek() || '')) { ci = this.peek().toLowerCase() === 'i'; this.i++; this.ws(); }
    }
    if (this.peek() !== ']') throw syntaxErr(this.s);
    this.i++;
    return { name, op, val, ci };
  }
}
const compileSel = (sel) => {
  sel = String(sel);
  let c = selCache.get(sel);
  if (!c) {
    if (!sel.trim()) throw syntaxErr(sel);
    const p = new SelParser(sel);
    try { c = p.list(false); } catch (e) { throw e.name === 'SyntaxError' ? e : syntaxErr(sel); }
    if (p.i < sel.length) throw syntaxErr(sel);
    if (selCache.size > 2000) selCache.clear();                     // dynamic selectors like [data-uid="12"] must not grow without bound
    selCache.set(sel, c);
  }
  return c;
};
const parseNth = (arg) => {
  const s = String(arg).replace(/\s+/g, '').toLowerCase();
  if (s === 'odd') return { a: 2, b: 1 };
  if (s === 'even') return { a: 2, b: 0 };
  const m = /^([+-]?\d*)n([+-]\d+)?$/.exec(s);
  if (m) return { a: m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10), b: m[2] ? parseInt(m[2], 10) : 0 };
  if (/^[+-]?\d+$/.test(s)) return { a: 0, b: parseInt(s, 10) };
  return null;
};
const nthOk = (k, { a, b }) => (a === 0 ? k === b : (k - b) / a >= 0 && Number.isInteger((k - b) / a));

function matchAttr(el, a) {
  const v = el.getAttribute(a.name);
  if (v === null) return false;
  if (a.op === null) return true;
  const x = a.ci ? v.toLowerCase() : v, y = a.ci ? a.val.toLowerCase() : a.val;
  switch (a.op) {
    case '=': return x === y;
    case '~=': return x.split(/\s+/).includes(y);
    case '|=': return x === y || x.startsWith(y + '-');
    case '^=': return y !== '' && x.startsWith(y);
    case '$=': return y !== '' && x.endsWith(y);
    case '*=': return y !== '' && x.includes(y);
    default: return false;
  }
}
function matchPseudo(env, el, ps, scope) {
  const sibs = () => (el.parentNode ? el.parentNode.childNodes.filter(isEl) : [el]);
  const typeSibs = () => sibs().filter((s) => s.localName === el.localName);
  switch (ps.name) {
    case 'not': return !ps.arg.some((parts) => matchComplex(env, el, parts, scope));
    case 'is': case 'where': case 'matches': return ps.arg.some((parts) => matchComplex(env, el, parts, scope));
    case 'has': return ps.arg.some((parts) => hasRelative(env, el, parts, scope));
    case 'first-child': return sibs()[0] === el;
    case 'last-child': { const s = sibs(); return s[s.length - 1] === el; }
    case 'only-child': return sibs().length === 1;
    case 'first-of-type': return typeSibs()[0] === el;
    case 'last-of-type': { const s = typeSibs(); return s[s.length - 1] === el; }
    case 'only-of-type': return typeSibs().length === 1;
    case 'nth-child': case 'nth-last-child': case 'nth-of-type': case 'nth-last-of-type': {
      const nth = parseNth(String(ps.arg).replace(/\s+of\s+.*$/, ''));
      if (!nth) throw syntaxErr(':' + ps.name + '(' + ps.arg + ')');
      const list = ps.name.endsWith('of-type') ? typeSibs() : sibs();
      const idx = list.indexOf(el);
      return nthOk(ps.name.includes('last') ? list.length - idx : idx + 1, nth);
    }
    case 'empty': return !el.childNodes.some((n) => n.nodeType === 1 || (n.nodeType === 3 && n.data !== ''));
    case 'root': return el.parentNode === env.document;
    case 'scope': return scope ? el === scope : el === env.document.documentElement;
    case 'checked': return (el.localName === 'input' && el.checked) || (el.localName === 'option' && el.selected);
    case 'disabled': return el.disabled === true;
    case 'enabled': return ['button', 'input', 'select', 'textarea'].includes(el.localName) && !el.disabled;
    case 'required': return el.hasAttribute('required');
    case 'optional': return ['input', 'select', 'textarea'].includes(el.localName) && !el.hasAttribute('required');
    case 'focus': case 'focus-visible': return env.active === el;
    case 'focus-within': return env.active && (env.active === el || el.contains(env.active));
    case 'hover': case 'active': case 'visited': case 'target': case 'fullscreen': return false;
    case 'link': case 'any-link': return el.localName === 'a' && el.hasAttribute('href');
    case 'defined': return true;
    default: throw syntaxErr(':' + ps.name);
  }
}
function matchCompound(env, el, c, scope) {
  if (c.never) return false;
  if (c.tag && c.tag !== '*' && (el.namespaceURI === XHTML ? el.localName !== c.tag : el.localName.toLowerCase() !== c.tag)) return false;
  for (const id of c.ids) if (el.getAttribute('id') !== id) return false;
  if (c.classes.length) { const cl = (el.getAttribute('class') || '').split(/\s+/); for (const k of c.classes) if (!cl.includes(k)) return false; }
  for (const a of c.attrs) if (!matchAttr(el, a)) return false;
  for (const ps of c.pseudos) if (!matchPseudo(env, el, ps, scope)) return false;
  return true;
}
function matchComplex(env, el, parts, scope, idx = parts.length - 1) {
  if (!matchCompound(env, el, parts[idx].compound, scope)) return false;
  if (idx === 0) return true;
  const comb = parts[idx].comb;
  if (comb === '>') { const p = el.parentNode; return isEl(p) && matchComplex(env, p, parts, scope, idx - 1); }
  if (comb === '+') { const s = prevElSib(el); return !!s && matchComplex(env, s, parts, scope, idx - 1); }
  if (comb === '~') { for (let s = prevElSib(el); s; s = prevElSib(s)) if (matchComplex(env, s, parts, scope, idx - 1)) return true; return false; }
  for (let a = el.parentNode; isEl(a); a = a.parentNode) if (matchComplex(env, a, parts, scope, idx - 1)) return true;
  return false;
}
function hasRelative(env, el, parts, scope) {                    // :has(> a b) style: candidates hang off el, then match the chain
  const first = parts[0].comb;
  const cands = [];
  const walkDesc = (n) => { for (const k of n.childNodes) if (isEl(k)) { cands.push(k); walkDesc(k); } };
  if (first === ' ') walkDesc(el);
  else if (first === '>') el.childNodes.filter(isEl).forEach((k) => cands.push(k));
  else if (first === '+') { const s = nextElSib(el); if (s) cands.push(s); }
  else if (first === '~') for (let s = nextElSib(el); s; s = nextElSib(s)) cands.push(s);
  const rest = parts.map((p, i) => (i === 0 ? { comb: '', compound: p.compound } : p));
  return cands.some((k) => matchComplex(env, k, rest, scope));
}
const selMatches = (env, el, sel, scope) => compileSel(sel).some((parts) => matchComplex(env, el, parts, scope || el));
function selQuery(env, root, sel, first) {
  const alts = compileSel(sel);
  const out = [];
  const scope = isEl(root) ? root : null;
  const visit = (n) => {
    for (const k of n.childNodes) {
      if (!isEl(k)) continue;
      if (alts.some((parts) => matchComplex(env, k, parts, scope))) { out.push(k); if (first) return true; }
      if (visit(k)) return true;
    }
    return false;
  };
  visit(root);
  return out;
}

// ---- style declaration --------------------------------------------------------------

function makeStyle(env, el) {
  const map = new Map();
  const ser = () => [...map].map(([k, v]) => `${k}: ${v};`).join(' ');
  const api = {
    getPropertyValue: (k) => (map.has(String(k)) ? map.get(String(k)) : map.get(kebab(String(k))) || ''),
    getPropertyPriority: () => '',
    setProperty(k, v, pr) { k = String(k); if (v === '' || v == null) map.delete(k); else map.set(k.startsWith('--') ? k : k.toLowerCase(), String(v) + (pr === 'important' ? ' !important' : '')); },
    removeProperty(k) { k = String(k); const old = map.get(k) || ''; map.delete(k); return old; },
    item: (i) => [...map.keys()][i] || '',
    get length() { return map.size; },
    get cssText() { return ser(); },
    set cssText(v) {
      map.clear();
      String(v).split(';').forEach((decl) => { const i = decl.indexOf(':'); if (i > 0) { const k = decl.slice(0, i).trim(), val = decl.slice(i + 1).trim(); if (k && val) map.set(k.startsWith('--') ? k : k.toLowerCase(), val); } });
    },
    get parentRule() { return null; },
  };
  return new Proxy(api, {
    get(t, p) { if (p in t) return t[p]; if (typeof p !== 'string') return undefined; return map.get(p === 'cssFloat' ? 'float' : kebab(p)) || ''; },
    set(t, p, v) {
      if (p === 'cssText') { t.cssText = v; return true; }
      if (typeof p !== 'string') return true;
      const k = p === 'cssFloat' ? 'float' : kebab(p);
      if (v === '' || v == null) map.delete(k); else map.set(k, String(v));
      return true;
    },
    has(t, p) { return p in t || (typeof p === 'string' && map.has(kebab(p))); },
    deleteProperty(t, p) { map.delete(kebab(String(p))); return true; },
    ownKeys() { return [...map.keys()].map(camel); },
    getOwnPropertyDescriptor(t, p) { return typeof p === 'string' && map.has(kebab(p)) ? { value: map.get(kebab(p)), enumerable: true, configurable: true, writable: true } : undefined; },
  });
}

// ---- DOM ----------------------------------------------------------------------------

function installDom(env) {
  const g = env.g;
  const { EventTargetStub } = env;

  const guardDom = (what) => { if (env.loading && !env.opts.allowTopLevelDom) throw new Error(`top-level ${what} while loading ${env.currentFile || 'scripts'}: touch the DOM lazily inside functions (DESIGN section 2)`); };
  env.guardDom = guardDom;

  class NodeStub extends EventTargetStub {
    constructor(doc) { super(); this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; }
    _eventParent() { return this.parentNode || (this === env.document ? env.winTarget : null); }
    get parentElement() { return isEl(this.parentNode) ? this.parentNode : null; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i > 0 ? p.childNodes[i - 1] : null; }
    get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i >= 0 ? p.childNodes[i + 1] || null : null; }
    get previousElementSibling() { return prevElSib(this); }
    get nextElementSibling() { return nextElSib(this); }
    get isConnected() { for (let n = this; n; n = n.parentNode) if (n === env.document) return true; return false; }
    get baseURI() { return 'http://localhost/hocus_vocus/index.html'; }
    hasChildNodes() { return this.childNodes.length > 0; }
    getRootNode() { let n = this; while (n.parentNode) n = n.parentNode; return n; }
    contains(o) { for (let n = o; n; n = n.parentNode) if (n === this) return true; return false; }
    appendChild(c) { return this.insertBefore(c, null); }
    insertBefore(c, ref) {
      if (!c || typeof c.nodeType !== 'number') throw new TypeError("Failed to execute 'insertBefore' on 'Node': parameter 1 is not of type 'Node'.");
      if (ref && ref.parentNode !== this) throw domErr("Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.", 'NotFoundError');
      if (c.nodeType === 11) { for (const k of c.childNodes.slice()) this.insertBefore(k, ref); return c; }
      if (c === this || (c.nodeType === 1 && c.contains(this))) throw domErr('The new child element contains the parent.', 'HierarchyRequestError');
      if (ref === c) return c;
      if (c.parentNode) c.parentNode.removeChild(c);
      const idx = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
      this.childNodes.splice(idx, 0, c);
      c.parentNode = this;
      return c;
    }
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i < 0) throw domErr("Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.", 'NotFoundError');
      this.childNodes.splice(i, 1); c.parentNode = null;
      if (env.active && (env.active === c || (c.nodeType === 1 && c.contains(env.active)))) env.active = null;
      return c;
    }
    replaceChild(n, old) { this.insertBefore(n, old); this.removeChild(old); return old; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    append(...c) { c.forEach((x) => { if (x != null) this.appendChild(typeof x === 'object' && x.nodeType ? x : env.document.createTextNode(String(x))); }); }
    prepend(...c) { const ref = this.firstChild; c.forEach((x) => { if (x != null) this.insertBefore(typeof x === 'object' && x.nodeType ? x : env.document.createTextNode(String(x)), ref); }); }
    before(...c) { const p = this.parentNode; if (p) c.forEach((x) => p.insertBefore(typeof x === 'object' ? x : env.document.createTextNode(String(x)), this)); }
    after(...c) { const p = this.parentNode; if (p) { const ref = this.nextSibling; c.forEach((x) => p.insertBefore(typeof x === 'object' ? x : env.document.createTextNode(String(x)), ref)); } }
    replaceWith(...c) { const p = this.parentNode; if (p) { this.before(...c); p.removeChild(this); } }
    replaceChildren(...c) { this.childNodes.slice().forEach((k) => this.removeChild(k)); this.append(...c); }
    normalize() {}
    isEqualNode(o) { return serialize(this) === serialize(o); }
    get textContent() { return this.childNodes.map((k) => (k.nodeType === 8 ? '' : k.textContent)).join(''); }
    set textContent(v) { this.childNodes.slice().forEach((k) => this.removeChild(k)); v = v == null ? '' : String(v); if (v !== '') this.appendChild(env.document.createTextNode(v)); }
    get nodeValue() { return null; }
  }
  Object.assign(NodeStub, { ELEMENT_NODE: 1, TEXT_NODE: 3, COMMENT_NODE: 8, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11 });

  class TextStub extends NodeStub {
    constructor(doc, data) { super(doc); this.data = data; }
    get nodeType() { return 3; }
    get nodeName() { return '#text'; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = String(v); }
    get nodeValue() { return this.data; }
    set nodeValue(v) { this.data = String(v); }
    get length() { return this.data.length; }
    get wholeText() { return this.data; }
    cloneNode() { return new TextStub(this.ownerDocument, this.data); }
  }
  class CommentStub extends TextStub {
    get nodeType() { return 8; }
    get nodeName() { return '#comment'; }
    cloneNode() { return new CommentStub(this.ownerDocument, this.data); }
  }
  class FragmentStub extends NodeStub {
    get nodeType() { return 11; }
    get nodeName() { return '#document-fragment'; }
    querySelector(sel) { return selQuery(env, this, sel, true)[0] || null; }
    querySelectorAll(sel) { return nodeList(selQuery(env, this, sel, false)); }
    getElementById(id) { return selQuery(env, this, '[id="' + String(id).replace(/"/g, '\\"') + '"]', true)[0] || null; }
    get children() { return this.childNodes.filter(isEl); }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get childElementCount() { return this.children.length; }
    cloneNode(deep) { const f = new FragmentStub(this.ownerDocument); if (deep) this.childNodes.forEach((k) => f.appendChild(k.cloneNode(true))); return f; }
  }
  const nodeList = (arr) => { Object.defineProperty(arr, 'item', { value: (i) => arr[i] || null, enumerable: false }); return arr; };

  // -- attributes that reflect to properties
  const REFLECT_STR = { title: 'title', lang: 'lang', dir: 'dir', href: 'href', src: 'src', alt: 'alt', name: 'name', placeholder: 'placeholder', role: 'role', rel: 'rel', target: 'target', download: 'download', htmlFor: 'for', accept: 'accept', autocomplete: 'autocomplete', min: 'min', max: 'max', step: 'step', pattern: 'pattern', label: 'label', media: 'media', crossOrigin: 'crossorigin', srcset: 'srcset', sizes: 'sizes', wrap: 'wrap', enterKeyHint: 'enterkeyhint', inputMode: 'inputmode' };
  const REFLECT_BOOL = { hidden: 'hidden', disabled: 'disabled', readOnly: 'readonly', required: 'required', multiple: 'multiple', autofocus: 'autofocus', open: 'open', controls: 'controls', loop: 'loop', muted: 'muted', defer: 'defer', async: 'async', selected: 'selected', draggable: 'draggable', spellcheck: 'spellcheck', inert: 'inert' };
  const FOCUSABLE = new Set(['button', 'input', 'select', 'textarea']);

  const isRendered = (el) => { for (let n = el; isEl(n); n = n.parentNode) { if (n.hasAttribute('hidden')) return false; if (n._style && /^none\b/.test(n._style.display || '')) return false; } return true; };
  const isFocusable = (el) => {
    if (!isEl(el) || el.disabled === true || !isRendered(el)) return false;
    if (el.localName === 'input' && el.getAttribute('type') === 'hidden') return false;
    return FOCUSABLE.has(el.localName) || (el.localName === 'a' && el.hasAttribute('href')) || el.hasAttribute('tabindex') || el.hasAttribute('contenteditable') || el.localName === 'summary';
  };
  env.isFocusable = isFocusable;

  class ClassList {
    constructor(el) { this._el = el; }
    _toks() { return (this._el.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
    _set(t) { this._el.setAttribute('class', t.join(' ')); }
    _chk(c) { if (c === '') throw domErr('The token provided must not be empty.', 'SyntaxError'); if (/\s/.test(c)) throw domErr(`The token provided ('${c}') contains HTML space characters, which are not valid in tokens.`, 'InvalidCharacterError'); }
    add(...c) { const t = this._toks(); c.forEach((x) => { x = String(x); this._chk(x); if (!t.includes(x)) t.push(x); }); this._set(t); }
    remove(...c) { const s = new Set(c.map(String)); c.forEach((x) => this._chk(String(x))); const t = this._toks().filter((x) => !s.has(x)); this._set(t); }
    toggle(c, force) { c = String(c); this._chk(c); const has = this._toks().includes(c); const on = force === undefined ? !has : !!force; if (on && !has) this.add(c); else if (!on && has) this.remove(c); return on; }
    contains(c) { return this._toks().includes(String(c)); }
    replace(a, b) { const t = this._toks(); const i = t.indexOf(String(a)); if (i < 0) return false; t[i] = String(b); this._set([...new Set(t)]); return true; }
    item(i) { return this._toks()[i] || null; }
    get length() { return this._toks().length; }
    get value() { return this._el.getAttribute('class') || ''; }
    set value(v) { this._el.setAttribute('class', v); }
    forEach(f, t) { this._toks().forEach((x, i) => f.call(t, x, i, this)); }
    keys() { return this._toks().keys(); }
    values() { return this._toks().values(); }
    entries() { return this._toks().entries(); }
    [Symbol.iterator]() { return this._toks()[Symbol.iterator](); }
    toString() { return this.value; }
  }
  const makeDataset = (el) => new Proxy({}, {
    get(t, p) { if (typeof p !== 'string') return undefined; const v = el.getAttribute('data-' + kebab(p)); return v === null ? undefined : v; },
    set(t, p, v) { if (typeof p === 'string') el.setAttribute('data-' + kebab(p), String(v)); return true; },
    has(t, p) { return typeof p === 'string' && el.hasAttribute('data-' + kebab(p)); },
    deleteProperty(t, p) { el.removeAttribute('data-' + kebab(String(p))); return true; },
    ownKeys() { return el.getAttributeNames().filter((n) => n.startsWith('data-')).map((n) => camel(n.slice(5))); },
    getOwnPropertyDescriptor(t, p) { const v = typeof p === 'string' ? el.getAttribute('data-' + kebab(p)) : null; return v === null ? undefined : { value: v, enumerable: true, configurable: true, writable: true }; },
  });

  const defaultRect = { w: 1280, h: 720 };
  const px = (v) => { const m = /^(-?\d*\.?\d+)px$/.exec(String(v || '')); return m ? parseFloat(m[1]) : null; };

  class ElementStub extends NodeStub {
    constructor(doc, localName, ns) {
      super(doc);
      this.namespaceURI = ns || XHTML;
      this.localName = this.namespaceURI === XHTML ? String(localName).toLowerCase() : String(localName);
      this._attrs = new Map(); this._style = null; this._ds = null; this._cl = null; this._value = undefined; this._checked = undefined; this._rect = null; this._sel = 0;
      this.scrollTop = 0; this.scrollLeft = 0;
      env.els.push(this);
    }
    get nodeType() { return 1; }
    get tagName() { return this.namespaceURI === XHTML ? this.localName.toUpperCase() : this.localName; }
    get nodeName() { return this.tagName; }
    // attributes
    getAttribute(k) {
      k = this.namespaceURI === XHTML ? String(k).toLowerCase() : String(k);
      if (k === 'style') { const t = this._style ? this._style.cssText : ''; return t === '' ? null : t; }
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    }
    setAttribute(k, v) {
      k = this.namespaceURI === XHTML ? String(k).toLowerCase() : String(k);
      if (k === 'style') { this.style.cssText = String(v); return; }
      this._attrs.set(k, String(v));
      if (k === 'width' || k === 'height') { if (this.localName === 'canvas') env.canvasResized(this); }
      if (k === 'src' && this.localName === 'img') env.imageSrc(this);
    }
    removeAttribute(k) { k = String(k).toLowerCase(); if (k === 'style' && this._style) this._style.cssText = ''; this._attrs.delete(k); }
    hasAttribute(k) { return this.getAttribute(k) !== null; }
    toggleAttribute(k, force) { const has = this.hasAttribute(k); const on = force === undefined ? !has : !!force; if (on && !has) this.setAttribute(k, ''); else if (!on && has) this.removeAttribute(k); return on; }
    getAttributeNames() { const n = [...this._attrs.keys()]; if (this._style && this._style.cssText) n.push('style'); return n; }
    get attributes() { return this.getAttributeNames().map((name) => ({ name, nodeName: name, value: this.getAttribute(name), nodeValue: this.getAttribute(name) })); }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', v); }
    get classList() { return this._cl || (this._cl = new ClassList(this)); }
    get style() { return this._style || (this._style = makeStyle(env, this)); }
    set style(v) { this.style.cssText = String(v); }
    get dataset() { return this._ds || (this._ds = makeDataset(this)); }
    get tabIndex() { const a = this.getAttribute('tabindex'); return a !== null && !Number.isNaN(parseInt(a, 10)) ? parseInt(a, 10) : (FOCUSABLE.has(this.localName) || (this.localName === 'a' && this.hasAttribute('href')) ? 0 : -1); }
    set tabIndex(v) { this.setAttribute('tabindex', String(v)); }
    get type() { const t = this.getAttribute('type'); if (this.localName === 'input') return (t || 'text').toLowerCase(); if (this.localName === 'button') return (t || 'submit').toLowerCase(); return t || ''; }
    set type(v) { this.setAttribute('type', v); }
    // value and check state
    get value() {
      if (this._value !== undefined) return this._value;
      if (this.localName === 'select') { const o = this.options; const s = o[this._sel] || o[0]; return s ? (s.getAttribute('value') !== null ? s.getAttribute('value') : s.textContent) : ''; }
      if (this.localName === 'textarea') return this.textContent;
      if (this.localName === 'option') return this.getAttribute('value') !== null ? this.getAttribute('value') : this.textContent;
      const a = this.getAttribute('value');
      return a !== null ? a : (this.localName === 'input' && /^(checkbox|radio)$/.test(this.type) ? 'on' : '');
    }
    set value(v) {
      v = v == null ? '' : String(v);
      if (this.localName === 'select') { const i = this.options.findIndex((o) => o.value === v); this._sel = i; this._value = i < 0 ? '' : undefined; return; }
      this._value = v;
    }
    get checked() { return this._checked !== undefined ? this._checked : this.hasAttribute('checked'); }
    set checked(v) { this._checked = !!v; }
    get defaultValue() { return this.getAttribute('value') || ''; }
    get defaultChecked() { return this.hasAttribute('checked'); }
    get options() { return this.localName === 'select' ? selQuery(env, this, 'option', false) : []; }
    get selectedIndex() { return this._sel; }
    set selectedIndex(i) { this._sel = i; this._value = undefined; }
    get valueAsNumber() { return parseFloat(this.value); }
    select() {} setSelectionRange() {} setCustomValidity() {} checkValidity() { return true; } reportValidity() { return true; }
    get files() { return null; }
    get form() { for (let n = this.parentNode; isEl(n); n = n.parentNode) if (n.localName === 'form') return n; return null; }
    get content() { if (this.localName !== 'template') return this.getAttribute('content') || ''; return this._content || (this._content = new FragmentStub(this.ownerDocument)); }
    set content(v) { this.setAttribute('content', v); }
    // tree helpers
    get children() { return this.childNodes.filter(isEl); }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get childElementCount() { return this.children.length; }
    querySelector(sel) { return selQuery(env, this, sel, true)[0] || null; }
    querySelectorAll(sel) { return nodeList(selQuery(env, this, sel, false)); }
    matches(sel) { return selMatches(env, this, sel, this); }
    webkitMatchesSelector(sel) { return this.matches(sel); }
    closest(sel) { for (let n = this; isEl(n); n = n.parentNode) if (selMatches(env, n, sel, this)) return n; return null; }
    getElementsByClassName(c) { const want = String(c).split(/\s+/).filter(Boolean); return nodeList(selQuery(env, this, want.map((x) => '.' + x).join(''), false)); }
    getElementsByTagName(t) { return nodeList(t === '*' ? selQuery(env, this, '*', false) : selQuery(env, this, t, false)); }
    // markup
    get innerHTML() { return this.childNodes.map(serialize).join(''); }
    set innerHTML(v) { this.childNodes.slice().forEach((k) => this.removeChild(k)); v = v == null ? '' : String(v); if (v !== '') parseHtml(env, v, this.localName === 'template' ? this.content : this); }
    get outerHTML() { return serialize(this); }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    insertAdjacentHTML(pos, html) {
      const f = new FragmentStub(this.ownerDocument); parseHtml(env, String(html), f);
      if (pos === 'beforeend') this.appendChild(f); else if (pos === 'afterbegin') this.insertBefore(f, this.firstChild);
      else if (pos === 'beforebegin' && this.parentNode) this.parentNode.insertBefore(f, this); else if (pos === 'afterend' && this.parentNode) this.parentNode.insertBefore(f, this.nextSibling);
      else if (!['beforebegin', 'afterend'].includes(pos)) throw domErr(`The value provided ('${pos}') is not one of 'beforebegin', 'afterbegin', 'beforeend', or 'afterend'.`, 'SyntaxError');
    }
    insertAdjacentElement(pos, el) { const f = new FragmentStub(this.ownerDocument); f.appendChild(el); if (pos === 'beforeend') this.appendChild(f); else if (pos === 'afterbegin') this.insertBefore(f, this.firstChild); else if (this.parentNode) this.parentNode.insertBefore(f, pos === 'beforebegin' ? this : this.nextSibling); return el; }
    insertAdjacentText(pos, t) { this.insertAdjacentElement(pos, env.document.createTextNode(String(t))); }
    cloneNode(deep) {
      const c = new ElementStub(this.ownerDocument, this.localName, this.namespaceURI);
      this._attrs.forEach((v, k) => c._attrs.set(k, v));
      if (this._style) c.style.cssText = this._style.cssText;
      if (this._value !== undefined) c._value = this._value;
      if (this._checked !== undefined) c._checked = this._checked;
      if (this.localName === 'canvas') env.canvasResized(c);
      if (deep) this.childNodes.forEach((k) => c.appendChild(k.cloneNode(true)));
      return c;
    }
    // interaction
    focus() {
      if (!isFocusable(this) || !this.isConnected) return;
      const prev = env.active;
      if (prev === this) return;
      const fire = (el, type, bubbles, related) => el.dispatchEvent(new env.ev.FocusEvent(type, { bubbles, relatedTarget: related }));
      if (prev) { env.active = null; fire(prev, 'blur', false, this); fire(prev, 'focusout', true, this); }
      env.active = this;
      fire(this, 'focus', false, prev); fire(this, 'focusin', true, prev);
    }
    blur() {
      if (env.active !== this) return;
      env.active = null;
      this.dispatchEvent(new env.ev.FocusEvent('blur', { bubbles: false })); this.dispatchEvent(new env.ev.FocusEvent('focusout', { bubbles: true }));
    }
    click() {
      if (this.disabled === true) return;
      if (this.localName === 'input' && this.type === 'checkbox') this.checked = !this.checked;
      if (this.localName === 'input' && this.type === 'radio') this.checked = true;
      const ok = this.dispatchEvent(new env.ev.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      if (ok && this.localName === 'input' && /^(checkbox|radio)$/.test(this.type)) { this.dispatchEvent(new env.ev.InputEvent('input', { bubbles: true })); this.dispatchEvent(new env.ev.Event('change', { bubbles: true })); }
    }
    get offsetWidth() { return this.getBoundingClientRect().width; }
    get offsetHeight() { return this.getBoundingClientRect().height; }
    get clientWidth() { return this.getBoundingClientRect().width; }
    get clientHeight() { return this.getBoundingClientRect().height; }
    get scrollWidth() { return this.getBoundingClientRect().width; }
    get scrollHeight() { return this.getBoundingClientRect().height; }
    get offsetLeft() { return this.getBoundingClientRect().left; }
    get offsetTop() { return this.getBoundingClientRect().top; }
    get clientLeft() { return 0; }
    get clientTop() { return 0; }
    get offsetParent() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    getBoundingClientRect() {
      const r = this._rect || {};
      const s = this._style;
      let w = r.width, h = r.height;
      if (this.localName === 'canvas') { if (w == null) w = px(s && s.width) ?? this.width; if (h == null) h = px(s && s.height) ?? this.height; }
      if (w == null) w = px(s && s.width) ?? env.viewport.w;
      if (h == null) h = px(s && s.height) ?? env.viewport.h;
      const left = r.left != null ? r.left : px(s && s.left) ?? 0, top = r.top != null ? r.top : px(s && s.top) ?? 0;
      return { x: left, y: top, left, top, width: w, height: h, right: left + w, bottom: top + h, toJSON() { return this; } };
    }
    getClientRects() { return [this.getBoundingClientRect()]; }
    scrollIntoView() {} scroll() {} scrollTo() {} scrollBy() {}
    setPointerCapture(id) { env.pointerCapture[id] = this; }
    releasePointerCapture(id) { if (env.pointerCapture[id] === this) delete env.pointerCapture[id]; }
    hasPointerCapture(id) { return env.pointerCapture[id] === this; }
    animate() { return new AnimationStub(); }
    getAnimations() { return []; }
    requestFullscreen() { env.fullscreenElement = this; return Promise.resolve(); }
    attachShadow() { return new FragmentStub(this.ownerDocument); }
    checkVisibility() { return isRendered(this); }
    getBBox() { return { x: 0, y: 0, width: 0, height: 0 }; }
    showModal() { this.setAttribute('open', ''); } close() { this.removeAttribute('open'); }
    play() { return Promise.resolve(); } pause() {} load() {}
    canPlayType() { return ''; }
    submit() {} reset() {} requestSubmit() {}
  }
  for (const [prop, attr] of Object.entries(REFLECT_STR)) Object.defineProperty(ElementStub.prototype, prop, { get() { return this.getAttribute(attr) || ''; }, set(v) { this.setAttribute(attr, v); }, configurable: true });
  for (const [prop, attr] of Object.entries(REFLECT_BOOL)) Object.defineProperty(ElementStub.prototype, prop, { get() { return this.hasAttribute(attr); }, set(v) { if (v) this.setAttribute(attr, ''); else this.removeAttribute(attr); }, configurable: true });
  Object.defineProperty(ElementStub.prototype, 'disabled', { get() { if (!['button', 'input', 'select', 'textarea', 'fieldset', 'option', 'optgroup'].includes(this.localName)) return undefined; return this.hasAttribute('disabled'); }, set(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }, configurable: true });
  env.ElementStub = ElementStub;
  env.FragmentStub = FragmentStub;

  class AnimationStub {
    constructor() {
      this.playState = 'finished'; this.currentTime = 0; this.onfinish = null; this.oncancel = null; this.id = '';
      this.finished = Promise.resolve(this); this.ready = Promise.resolve(this);
      queueMicrotask(() => { if (typeof this.onfinish === 'function') this.onfinish({ type: 'finish', currentTime: 0 }); });
    }
    cancel() {} finish() {} play() {} pause() {} reverse() {} updatePlaybackRate() {} persist() {} commitStyles() {}
    addEventListener() {} removeEventListener() {}
  }

  // -- canvas element specifics (context lives in installCanvas)
  Object.defineProperty(ElementStub.prototype, 'width', {
    get() { if (this.localName === 'canvas' || this.localName === 'img') { const a = parseInt(this.getAttribute('width'), 10); return Number.isFinite(a) && a >= 0 ? a : (this.localName === 'canvas' ? 300 : (this._img ? this._img.w : 0)); } return this._w == null ? 0 : this._w; },
    set(v) { if (this.localName === 'canvas' || this.localName === 'img') { this.setAttribute('width', String(Math.max(0, Math.floor(Number(v)) || 0))); } else this._w = v; }, configurable: true,
  });
  Object.defineProperty(ElementStub.prototype, 'height', {
    get() { if (this.localName === 'canvas' || this.localName === 'img') { const a = parseInt(this.getAttribute('height'), 10); return Number.isFinite(a) && a >= 0 ? a : (this.localName === 'canvas' ? 150 : (this._img ? this._img.h : 0)); } return this._h == null ? 0 : this._h; },
    set(v) { if (this.localName === 'canvas' || this.localName === 'img') { this.setAttribute('height', String(Math.max(0, Math.floor(Number(v)) || 0))); } else this._h = v; }, configurable: true,
  });
  ElementStub.prototype.getContext = function getContext(type) {
    if (this.localName !== 'canvas') throw new TypeError('this.getContext is not a function');
    return env.canvasContext(this, String(type));
  };
  ElementStub.prototype.toDataURL = function toDataURL(type) {
    if (this.localName !== 'canvas') throw new TypeError('this.toDataURL is not a function');
    if (this.width === 0 || this.height === 0) return 'data:,';
    return 'data:' + (type === 'image/jpeg' || type === 'image/webp' ? type : 'image/png') + ';base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  };
  ElementStub.prototype.toBlob = function toBlob(cb, type) { queueMicrotask(() => cb(new g.Blob(['png'], { type: type || 'image/png' }))); };
  ElementStub.prototype.captureStream = function captureStream() { return { getTracks: () => [], getVideoTracks: () => [] }; };
  Object.defineProperty(ElementStub.prototype, 'naturalWidth', { get() { return this._img ? this._img.w : 0; } });
  Object.defineProperty(ElementStub.prototype, 'naturalHeight', { get() { return this._img ? this._img.h : 0; } });
  Object.defineProperty(ElementStub.prototype, 'complete', { get() { return this.localName === 'img' ? (!this.hasAttribute('src') || !!(this._img && this._img.done)) : undefined; } });
  ElementStub.prototype.decode = function decode() { return this._img && this._img.failed ? Promise.reject(domErr('The source image cannot be decoded.', 'EncodingError')) : Promise.resolve(); };

  env.imageSrc = (img) => {
    const mode = env.opts.imageLoad === 'error' ? 'error' : 'ok';
    img._img = { w: img.getAttribute('width') ? parseInt(img.getAttribute('width'), 10) : 64, h: img.getAttribute('height') ? parseInt(img.getAttribute('height'), 10) : 64, done: false, failed: mode === 'error' };
    queueMicrotask(() => {
      if (!img._img) return;
      img._img.done = true;
      img.dispatchEvent(new env.ev.Event(mode === 'error' ? 'error' : 'load'));
    });
  };
  Object.defineProperty(ElementStub.prototype, 'currentSrc', { get() { return this.getAttribute('src') || ''; } });

  // -- HTML parsing and serialisation
  function parseHtml(env2, html, parent) {
    const doc = env2.document;
    const stack = [parent];
    let i = 0;
    const n = html.length;
    const top = () => stack[stack.length - 1];
    const addText = (t) => { if (t !== '') top().appendChild(doc.createTextNode(decodeEntities(t))); };
    while (i < n) {
      const lt = html.indexOf('<', i);
      if (lt < 0) { addText(html.slice(i)); break; }
      if (lt > i) addText(html.slice(i, lt));
      if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); top().appendChild(doc.createComment(html.slice(lt + 4, e < 0 ? n : e))); i = e < 0 ? n : e + 3; continue; }
      if (html[lt + 1] === '!' || html[lt + 1] === '?') { const e = html.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
      if (html[lt + 1] === '/') {
        const e = html.indexOf('>', lt);
        const name = html.slice(lt + 2, e < 0 ? n : e).trim().toLowerCase();
        for (let k = stack.length - 1; k > 0; k--) if (stack[k].localName === name) { stack.length = k; break; }
        i = e < 0 ? n : e + 1; continue;
      }
      const m = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(lt, lt + 80));
      if (!m) { addText('<'); i = lt + 1; continue; }
      const tag = m[1];
      let j = lt + m[0].length;
      const attrs = [];
      const attrRe = /\s*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
      for (;;) {
        attrRe.lastIndex = j;
        const am = attrRe.exec(html);
        if (!am || am[0] === '') break;
        attrs.push([am[1], decodeEntities(am[2] !== undefined ? am[2] : am[3] !== undefined ? am[3] : am[4] !== undefined ? am[4] : '')]);
        j = attrRe.lastIndex;
      }
      const close = html.indexOf('>', j);
      const selfClose = html[(close < 0 ? n : close) - 1] === '/';
      const inSvg = tag.toLowerCase() === 'svg' || (isEl(top()) && top().namespaceURI === SVGNS);
      const el = inSvg ? doc.createElementNS(SVGNS, tag) : doc.createElement(tag);
      for (const [k, v] of attrs) el.setAttribute(k, v);
      top().appendChild(el);
      i = close < 0 ? n : close + 1;
      const lower = tag.toLowerCase();
      if (VOID_TAGS.has(lower) || selfClose) continue;
      if (RAW_TAGS.has(lower) || RCDATA_TAGS.has(lower)) {
        const re = new RegExp('</' + lower + '\\s*>', 'i');
        const rest = html.slice(i);
        const mm = re.exec(rest);
        const body = mm ? rest.slice(0, mm.index) : rest;
        if (body !== '') el.appendChild(doc.createTextNode(RAW_TAGS.has(lower) ? body : decodeEntities(body)));
        i += mm ? mm.index + mm[0].length : rest.length;
        continue;
      }
      stack.push(el);
    }
  }
  function serialize(node) {
    if (node.nodeType === 3) { const p = node.parentNode; return p && RAW_TAGS.has(p.localName) ? node.data : escText(node.data); }
    if (node.nodeType === 8) return '<!--' + node.data + '-->';
    if (node.nodeType === 11) return node.childNodes.map(serialize).join('');
    if (node.nodeType !== 1) return '';
    const attrs = node.getAttributeNames().map((k) => { const v = node.getAttribute(k); return v === '' ? ` ${k}=""` : ` ${k}="${escAttr(v)}"`; }).join('');
    const l = node.localName;
    if (VOID_TAGS.has(l) && node.namespaceURI === XHTML) return `<${l}${attrs}>`;
    return `<${l}${attrs}>${node.childNodes.map(serialize).join('')}</${l}>`;
  }
  env.parseHtml = (html, parent) => parseHtml(env, html, parent);
  env.serialize = serialize;

  // -- element class map for instanceof
  const isTag = (...tags) => (x) => isEl(x) && x.namespaceURI === XHTML && tags.includes(x.localName);
  const brand = (name, test) => { const C = { [name]: class {} }[name]; Object.defineProperty(C, Symbol.hasInstance, { value: test }); return C; };
  Object.assign(g, {
    Node: NodeStub, Text: TextStub, Comment: CommentStub, DocumentFragment: FragmentStub, Element: ElementStub,
    HTMLElement: brand('HTMLElement', (x) => isEl(x) && x.namespaceURI === XHTML),
    SVGElement: brand('SVGElement', (x) => isEl(x) && x.namespaceURI === SVGNS),
    HTMLCanvasElement: brand('HTMLCanvasElement', isTag('canvas')), HTMLImageElement: brand('HTMLImageElement', isTag('img')),
    HTMLButtonElement: brand('HTMLButtonElement', isTag('button')), HTMLInputElement: brand('HTMLInputElement', isTag('input')),
    HTMLSelectElement: brand('HTMLSelectElement', isTag('select')), HTMLTextAreaElement: brand('HTMLTextAreaElement', isTag('textarea')),
    HTMLAnchorElement: brand('HTMLAnchorElement', isTag('a')), HTMLDivElement: brand('HTMLDivElement', isTag('div')), HTMLSpanElement: brand('HTMLSpanElement', isTag('span')),
    HTMLVideoElement: brand('HTMLVideoElement', isTag('video')), HTMLAudioElement: brand('HTMLAudioElement', isTag('audio')), HTMLFormElement: brand('HTMLFormElement', isTag('form')),
  });

  // -- document
  class DocumentStub extends NodeStub {
    constructor() {
      super(null);
      this.ownerDocument = null; this.hidden = false; this.visibilityState = 'visible'; this.readyState = 'complete'; this.cookie = '';
      this.contentType = 'text/html'; this.characterSet = 'UTF-8'; this.compatMode = 'CSS1Compat'; this.designMode = 'off'; this.URL = 'http://localhost/hocus_vocus/index.html'; this.referrer = '';
    }
    get nodeType() { return 9; }
    get nodeName() { return '#document'; }
    get defaultView() { return env.winTarget._self || null; }
    get documentElement() { guardDom('document.documentElement'); return this.childNodes.find(isEl) || null; }
    get head() { guardDom('document.head'); const h = this.childNodes.find(isEl); return h ? h.childNodes.find((k) => isEl(k) && k.localName === 'head') || null : null; }
    get body() { guardDom('document.body'); const h = this.childNodes.find(isEl); return h ? h.childNodes.find((k) => isEl(k) && k.localName === 'body') || null : null; }
    get activeElement() { guardDom('document.activeElement'); return env.active && env.active.isConnected ? env.active : this.body; }
    get fonts() { guardDom('document.fonts'); return env.fonts; }
    get fullscreenElement() { return env.fullscreenElement || null; }
    get title() { guardDom('document.title'); const t = selQuery(env, this, 'title', true)[0]; return t ? t.textContent.trim() : ''; }
    set title(v) { guardDom('document.title'); let t = selQuery(env, this, 'title', true)[0]; if (!t) { t = this.createElement('title'); const h = this.head; if (h) h.appendChild(t); } t.textContent = String(v); }
    get scrollingElement() { return this.documentElement; }
    get forms() { return nodeList(selQuery(env, this, 'form', false)); }
    createElement(tag) {
      guardDom('document.createElement()');
      tag = String(tag);
      if (!/^[A-Za-z][^\s/>]*$/.test(tag)) throw domErr(`Failed to execute 'createElement' on 'Document': The tag name provided ('${tag}') is not a valid name.`, 'InvalidCharacterError');
      return new ElementStub(this, tag, XHTML);
    }
    createElementNS(ns, tag) { guardDom('document.createElementNS()'); return new ElementStub(this, String(tag), ns || XHTML); }
    createTextNode(s) { guardDom('document.createTextNode()'); return new TextStub(this, String(s)); }
    createComment(s) { return new CommentStub(this, String(s)); }
    createDocumentFragment() { guardDom('document.createDocumentFragment()'); return new FragmentStub(this); }
    createEvent() { return new env.ev.Event(''); }
    importNode(n, deep) { return n.cloneNode(!!deep); }
    adoptNode(n) { return n; }
    getElementById(id) { guardDom('document.getElementById()'); return selQuery(env, this, `[id="${String(id).replace(/["\\]/g, '\\$&')}"]`, true)[0] || null; }
    querySelector(sel) { guardDom('document.querySelector()'); return selQuery(env, this, sel, true)[0] || null; }
    querySelectorAll(sel) { guardDom('document.querySelectorAll()'); return nodeList(selQuery(env, this, sel, false)); }
    getElementsByClassName(c) { guardDom('document.getElementsByClassName()'); const want = String(c).split(/\s+/).filter(Boolean); return nodeList(selQuery(env, this, want.map((x) => '.' + x).join(''), false)); }
    getElementsByTagName(t) { guardDom('document.getElementsByTagName()'); return nodeList(selQuery(env, this, t, false)); }
    elementFromPoint() { return this.body; }
    elementsFromPoint() { return [this.body]; }
    hasFocus() { return true; }
    exitFullscreen() { env.fullscreenElement = null; return Promise.resolve(); }
    execCommand() { return false; }
    write() { throw new Error('document.write is banned in Inkwoven'); }
    getSelection() { return env.selection; }
  }
  env.DocumentStub = DocumentStub;
  g.Document = DocumentStub; g.HTMLDocument = DocumentStub;
}

// Build the initial document from index.html (head and body markup; inline scripts are inert).
function buildDocument(env, htmlText) {
  const doc = new env.DocumentStub();
  env.document = doc;
  const html = env.ElementStub && new env.ElementStub(doc, 'html', XHTML);
  const head = new env.ElementStub(doc, 'head', XHTML), body = new env.ElementStub(doc, 'body', XHTML);
  doc.appendChild(html); html.appendChild(head); html.appendChild(body);
  let ok = false;
  if (htmlText) {
    const clean = htmlText.replace(/<!doctype[^>]*>/i, '');
    const h = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(clean), b = /<body\b([^>]*)>([\s\S]*?)(?:<\/body>|$)/i.exec(clean);
    if (h) env.parseHtml(h[1], head);
    if (b) {
      env.parseHtml(b[2], body);
      const ba = /([\w-]+)\s*=\s*"([^"]*)"/g; let m; while ((m = ba.exec(b[1]))) body.setAttribute(m[1], m[2]);
      ok = true;
    }
    const la = /<html\b([^>]*)>/i.exec(clean);
    if (la) { const ba = /([\w-]+)\s*=\s*"([^"]*)"/g; let m; while ((m = ba.exec(la[1]))) html.setAttribute(m[1], m[2]); }
  }
  if (!ok) {
    env.parseHtml('<div id="boot"></div><div id="wrap"><div id="stage"><canvas id="view" width="1280" height="720"></canvas><div id="screens"></div><div id="overlays"></div><canvas id="over" width="1280" height="720"></canvas><div id="tips"></div><div id="toasts"></div></div></div>', body);
  }
  return doc;
}

// ======================================================================================
// runtime stubs: canvas 2D
// ======================================================================================

const NAMED_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent currentcolor').split(' '));
export function validCssColor(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  if (NAMED_COLORS.has(s)) return true;
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) return true;
  const m = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(([^()]*)\)$/.exec(s);
  if (m) { const parts = m[2].split(/[\s,/]+/).filter(Boolean); return parts.length >= 3 && parts.length <= 5 && parts.every((p) => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:%|deg|rad|turn|grad)?$|^none$/.test(p)); }
  return /^(?:color-mix|color)\(.+\)$/.test(s);
}
const FONT_RE = /^(?:(?:italic|oblique|normal|bold|bolder|lighter|\d{3}|small-caps|ultra-condensed|condensed|expanded)\s+)*(\d*\.?\d+)(px|pt|em|rem|%|vh|vw|cm|mm|in|pc|ex|ch)(?:\/[\d.]+\w*)?\s+\S.*$/i;
const COMPOSITE_OPS = new Set(['source-over', 'source-in', 'source-out', 'source-atop', 'destination-over', 'destination-in', 'destination-out', 'destination-atop', 'lighter', 'copy', 'xor', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);

function installCanvas(env) {
  const g = env.g;
  const num = (v) => Number(v);
  const fin = (...a) => a.every((v) => Number.isFinite(Number(v)));
  const need = (m, args, k) => { if (args.length < k) throw new TypeError(`Failed to execute '${m}' on 'CanvasRenderingContext2D': ${k} argument${k > 1 ? 's' : ''} required, but only ${args.length} present.`); };

  env.issue = (kind, detail) => {
    const frames = (new Error().stack || '').split('\n').slice(2);
    const at = (frames.find((l) => l.includes(env.dir) && !l.includes('hocus_vocus_lib')) || frames.find((l) => !l.includes('hocus_vocus_lib')) || '').trim().replace(/^at /, '');
    env.counts.issues = (env.counts.issues || 0) + 1;
    if (env.issues.length < 500) env.issues.push({ kind, detail, at });
    if (env.opts.strictCtx) throw new Error(`canvas ${kind}: ${detail} (${at})`);
  };
  const count = (ctx, name) => { env.counts[name] = (env.counts[name] || 0) + 1; ctx._n[name] = (ctx._n[name] || 0) + 1; };

  class DOMMatrixStub {
    constructor(init) {
      const v = Array.isArray(init) ? init : typeof init === 'string' || init == null ? [1, 0, 0, 1, 0, 0] : [init.a, init.b, init.c, init.d, init.e, init.f];
      const six = v.length === 16 ? [v[0], v[1], v[4], v[5], v[12], v[13]] : v;
      [this.a, this.b, this.c, this.d, this.e, this.f] = six.map((x) => (x == null ? 0 : Number(x)));
    }
    get m11() { return this.a; } get m12() { return this.b; } get m21() { return this.c; } get m22() { return this.d; } get m41() { return this.e; } get m42() { return this.f; }
    get is2D() { return true; }
    get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
    multiply(o) { return new DOMMatrixStub([this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b, this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d, this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f]); }
    translate(x = 0, y = 0) { return this.multiply(new DOMMatrixStub([1, 0, 0, 1, x, y])); }
    scale(x = 1, y = x) { return this.multiply(new DOMMatrixStub([x, 0, 0, y, 0, 0])); }
    rotate(deg = 0) { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return this.multiply(new DOMMatrixStub([c, s, -s, c, 0, 0])); }
    inverse() { const det = this.a * this.d - this.b * this.c; if (!det) return new DOMMatrixStub([NaN, NaN, NaN, NaN, NaN, NaN]); const a = this.d / det, b = -this.b / det, c = -this.c / det, d = this.a / det; return new DOMMatrixStub([a, b, c, d, -(a * this.e + c * this.f), -(b * this.e + d * this.f)]); }
    transformPoint(p) { return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f, z: 0, w: 1 }; }
    toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
  }
  g.DOMMatrix = DOMMatrixStub; g.DOMMatrixReadOnly = DOMMatrixStub; g.WebKitCSSMatrix = DOMMatrixStub;
  g.DOMPoint = class DOMPoint { constructor(x = 0, y = 0, z = 0, w = 1) { Object.assign(this, { x, y, z, w }); } };
  g.DOMRect = class DOMRect { constructor(x = 0, y = 0, w = 0, h = 0) { Object.assign(this, { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h }); } };

  class CanvasGradientStub {
    constructor(kind, args) { this._kind = kind; this._args = args; this._stops = []; }
    addColorStop(offset, color) {
      if (arguments.length < 2) throw new TypeError("Failed to execute 'addColorStop' on 'CanvasGradient': 2 arguments required.");
      const o = Number(offset);
      if (!(o >= 0 && o <= 1)) throw domErr(`Failed to execute 'addColorStop' on 'CanvasGradient': The provided value (${offset}) is outside the range (0.0, 1.0).`, 'IndexSizeError');
      if (!validCssColor(color)) throw domErr(`Failed to execute 'addColorStop' on 'CanvasGradient': The value provided ('${color}') could not be parsed as a color.`, 'SyntaxError');
      this._stops.push([o, color]);
    }
  }
  class CanvasPatternStub { constructor(src, rep) { this._src = src; this._rep = rep; } setTransform() {} }
  g.CanvasGradient = CanvasGradientStub; g.CanvasPattern = CanvasPatternStub;

  class ImageDataStub {
    constructor(a, b, c) {
      let w, h, data;
      if (typeof a === 'number') { w = a >>> 0; h = b >>> 0; }
      else { data = a; w = b >>> 0; h = data ? Math.floor(data.length / 4 / (w || 1)) : 0; if (c != null) h = c >>> 0; }
      if (!w || !h) throw domErr("Failed to construct 'ImageData': The source width and height must be nonzero.", 'IndexSizeError');
      this.width = w; this.height = h; this.colorSpace = 'srgb';
      const U8 = env.U8C || Uint8ClampedArray;
      this.data = data || new U8(w * h * 4);
    }
  }
  g.ImageData = ImageDataStub;
  class ImageBitmapStub { constructor(w, h) { this.width = w; this.height = h; } close() { this.width = 0; this.height = 0; } }
  g.ImageBitmap = ImageBitmapStub;
  g.createImageBitmap = (src) => { const w = src && src.width, h = src && src.height; return Number.isFinite(w) ? Promise.resolve(new ImageBitmapStub(w, h)) : Promise.reject(new TypeError("Failed to execute 'createImageBitmap': The provided value is not of type 'ImageBitmapSource'.")); };

  const isCanvasSource = (s) => s && ((s.nodeType === 1 && ['canvas', 'img', 'video'].includes(s.localName)) || s instanceof ImageBitmapStub || (env.OffscreenCanvasStub && s instanceof env.OffscreenCanvasStub));
  const badSource = (m) => new TypeError(`Failed to execute '${m}' on 'CanvasRenderingContext2D': The provided value is not of type '(CSSImageValue or HTMLImageElement or SVGImageElement or HTMLVideoElement or HTMLCanvasElement or ImageBitmap or OffscreenCanvas or VideoFrame)'.`);

  // -- shared path validation (Path2D and the context behave alike)
  const pathOps = {
    arc(m, a) { need(m, a, 5); if (!fin(...a.slice(0, 5))) return env.issue('nonFinite', `${m}(${a.join(', ')}) ignored`); if (num(a[2]) < 0) throw domErr(`Failed to execute '${m}': The radius provided (${a[2]}) is negative.`, 'IndexSizeError'); },
    arcTo(m, a) { need(m, a, 5); if (!fin(...a.slice(0, 5))) return env.issue('nonFinite', `${m}(${a.join(', ')}) ignored`); if (num(a[4]) < 0) throw domErr(`Failed to execute '${m}': The radius provided (${a[4]}) is negative.`, 'IndexSizeError'); },
    ellipse(m, a) { need(m, a, 7); if (!fin(...a.slice(0, 7))) return env.issue('nonFinite', `${m}(${a.join(', ')}) ignored`); if (num(a[2]) < 0 || num(a[3]) < 0) throw domErr(`Failed to execute '${m}': The major or minor radius provided is negative.`, 'IndexSizeError'); },
    roundRect(m, a) {
      need(m, a, 4);
      if (!fin(...a.slice(0, 4))) return env.issue('nonFinite', `${m}(${a.join(', ')}) ignored`);
      const r = a[4] === undefined ? [0] : Array.isArray(a[4]) ? a[4] : [a[4]];
      if (r.length < 1 || r.length > 4) throw new RangeError(`Failed to execute '${m}': ${r.length} radii provided. Between one and four radii are necessary.`);
      for (const x of r) { const v = typeof x === 'object' && x ? Math.min(num(x.x), num(x.y)) : num(x); if (v < 0) throw new RangeError(`Failed to execute '${m}': Radius value ${v} is negative.`); }
    },
    line(m, a, k) { need(m, a, k); if (!fin(...a.slice(0, k))) env.issue('nonFinite', `${m}(${a.join(', ')}) ignored`); },
  };
  class Path2DStub {
    constructor(arg) { this._n = 0; if (arg instanceof Path2DStub) this._n = arg._n; else if (typeof arg === 'string') this._n = (arg.match(/[a-zA-Z]/g) || []).length; }
    moveTo(...a) { pathOps.line('moveTo', a, 2); this._n++; } lineTo(...a) { pathOps.line('lineTo', a, 2); this._n++; }
    bezierCurveTo(...a) { pathOps.line('bezierCurveTo', a, 6); this._n++; } quadraticCurveTo(...a) { pathOps.line('quadraticCurveTo', a, 4); this._n++; }
    arc(...a) { pathOps.arc('arc', a); this._n++; } arcTo(...a) { pathOps.arcTo('arcTo', a); this._n++; } ellipse(...a) { pathOps.ellipse('ellipse', a); this._n++; }
    rect(...a) { pathOps.line('rect', a, 4); this._n++; } roundRect(...a) { pathOps.roundRect('roundRect', a); this._n++; } closePath() { this._n++; }
    addPath(p) { if (!(p instanceof Path2DStub)) throw new TypeError("Failed to execute 'addPath' on 'Path2D': parameter 1 is not of type 'Path2D'."); this._n += p._n; }
  }
  g.Path2D = Path2DStub;

  const STATE_DEFAULTS = () => ({
    fillStyle: '#000000', strokeStyle: '#000000', shadowColor: 'rgba(0, 0, 0, 0)', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
    lineDashOffset: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', direction: 'ltr', imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low', filter: 'none', fontKerning: 'auto', fontStretch: 'normal', fontVariantCaps: 'normal', letterSpacing: '0px', wordSpacing: '0px', textRendering: 'auto',
  });

  class Ctx2DStub {
    constructor(canvas) { this.canvas = canvas; this._n = {}; this._reset(); }
    _reset() { this._s = STATE_DEFAULTS(); this._t = [1, 0, 0, 1, 0, 0]; this._stack = []; this._depth = 0; this._dash = []; }
    get _fontPx() { const m = FONT_RE.exec(this._s.font); return m ? parseFloat(m[1]) * (m[2] === 'px' ? 1 : m[2] === 'pt' ? 1.333 : 16) : 10; }
  }
  const ctxProto = Ctx2DStub.prototype;
  const setProp = (name, check, describe) => Object.defineProperty(ctxProto, name, {
    get() { return this._s[name]; },
    set(v) { const r = check(v); if (r === undefined) { env.issue('ignoredValue', `ctx.${name} = ${describe ? describe(v) : String(v)} was ignored (invalid, like a browser)`); return; } this._s[name] = r; },
    enumerable: true, configurable: true,
  });
  const colorProp = (name) => setProp(name, (v) => (typeof v === 'string' ? (validCssColor(v) ? v : undefined) : (v instanceof CanvasGradientStub || v instanceof CanvasPatternStub ? v : undefined)), (v) => JSON.stringify(v && v._kind ? '[gradient]' : v));
  ['fillStyle', 'strokeStyle'].forEach(colorProp);
  setProp('shadowColor', (v) => (validCssColor(v) ? v : undefined), (v) => JSON.stringify(v));
  setProp('globalAlpha', (v) => { v = Number(v); return v >= 0 && v <= 1 ? v : undefined; });
  setProp('globalCompositeOperation', (v) => (COMPOSITE_OPS.has(v) ? v : undefined), (v) => JSON.stringify(v));
  setProp('lineWidth', (v) => { v = Number(v); return Number.isFinite(v) && v > 0 ? v : undefined; });
  setProp('miterLimit', (v) => { v = Number(v); return Number.isFinite(v) && v > 0 ? v : undefined; });
  setProp('lineDashOffset', (v) => { v = Number(v); return Number.isFinite(v) ? v : undefined; });
  setProp('shadowBlur', (v) => { v = Number(v); return Number.isFinite(v) && v >= 0 ? v : undefined; });
  ['shadowOffsetX', 'shadowOffsetY'].forEach((n) => setProp(n, (v) => { v = Number(v); return Number.isFinite(v) ? v : undefined; }));
  const oneOf = (name, list) => setProp(name, (v) => (list.includes(v) ? v : undefined), (v) => JSON.stringify(v));
  oneOf('lineCap', ['butt', 'round', 'square']); oneOf('lineJoin', ['round', 'bevel', 'miter']);
  oneOf('textAlign', ['start', 'end', 'left', 'right', 'center']); oneOf('textBaseline', ['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom']);
  oneOf('direction', ['ltr', 'rtl', 'inherit']); oneOf('imageSmoothingQuality', ['low', 'medium', 'high']); oneOf('fontKerning', ['auto', 'normal', 'none']);
  oneOf('textRendering', ['auto', 'optimizeSpeed', 'optimizeLegibility', 'geometricPrecision']);
  setProp('imageSmoothingEnabled', (v) => !!v);
  setProp('font', (v) => (typeof v === 'string' && FONT_RE.test(v.trim()) ? v.trim() : undefined), (v) => JSON.stringify(v));
  setProp('filter', (v) => String(v));
  setProp('fontStretch', (v) => String(v)); setProp('fontVariantCaps', (v) => String(v)); setProp('wordSpacing', (v) => String(v));
  setProp('letterSpacing', (v) => (/^-?\d*\.?\d+(px|em|rem|pt)$/.test(String(v)) ? String(v) : undefined), (v) => JSON.stringify(v));

  const method = (name, fn) => Object.defineProperty(ctxProto, name, { value: function (...args) { count(this, name); return fn.apply(this, args); }, writable: true, configurable: true });
  const mul = (t, m) => [t[0] * m[0] + t[2] * m[1], t[1] * m[0] + t[3] * m[1], t[0] * m[2] + t[2] * m[3], t[1] * m[2] + t[3] * m[3], t[0] * m[4] + t[2] * m[5] + t[4], t[1] * m[4] + t[3] * m[5] + t[5]];
  method('save', function () { this._stack.push({ s: { ...this._s }, t: this._t.slice(), d: this._dash.slice() }); this._depth++; });
  method('restore', function () {
    const top = this._stack.pop();
    if (!top) { env.issue('unbalanced', 'restore() without a matching save()'); return; }
    this._s = top.s; this._t = top.t; this._dash = top.d; this._depth--;
  });
  method('reset', function () { this._reset(); });
  method('scale', function (...a) { need('scale', a, 2); if (!fin(a[0], a[1])) return env.issue('nonFinite', `scale(${a.join(', ')}) ignored`); this._t = mul(this._t, [num(a[0]), 0, 0, num(a[1]), 0, 0]); });
  method('rotate', function (...a) { need('rotate', a, 1); if (!fin(a[0])) return env.issue('nonFinite', `rotate(${a[0]}) ignored`); const c = Math.cos(a[0]), s = Math.sin(a[0]); this._t = mul(this._t, [c, s, -s, c, 0, 0]); });
  method('translate', function (...a) { need('translate', a, 2); if (!fin(a[0], a[1])) return env.issue('nonFinite', `translate(${a.join(', ')}) ignored`); this._t = mul(this._t, [1, 0, 0, 1, num(a[0]), num(a[1])]); });
  method('transform', function (...a) { need('transform', a, 6); if (!fin(...a.slice(0, 6))) return env.issue('nonFinite', `transform(${a.join(', ')}) ignored`); this._t = mul(this._t, a.slice(0, 6).map(num)); });
  method('setTransform', function (...a) {
    if (a.length === 0 || (a.length === 1 && a[0] === undefined)) { this._t = [1, 0, 0, 1, 0, 0]; return; }
    if (a.length === 1 && typeof a[0] === 'object') { const m = a[0]; this._t = [m.a, m.b, m.c, m.d, m.e, m.f].map(num); return; }
    need('setTransform', a, 6);
    if (!fin(...a.slice(0, 6))) return env.issue('nonFinite', `setTransform(${a.join(', ')}) ignored`);
    this._t = a.slice(0, 6).map(num);
  });
  method('resetTransform', function () { this._t = [1, 0, 0, 1, 0, 0]; });
  method('getTransform', function () { return new DOMMatrixStub(this._t); });
  for (const nm of ['fillRect', 'strokeRect', 'clearRect']) method(nm, function (...a) { need(nm, a, 4); if (!fin(...a.slice(0, 4))) env.issue('nonFinite', `${nm}(${a.slice(0, 4).join(', ')}) ignored`); });
  method('beginPath', function () {}); method('closePath', function () {});
  method('moveTo', function (...a) { pathOps.line('moveTo', a, 2); }); method('lineTo', function (...a) { pathOps.line('lineTo', a, 2); });
  method('bezierCurveTo', function (...a) { pathOps.line('bezierCurveTo', a, 6); }); method('quadraticCurveTo', function (...a) { pathOps.line('quadraticCurveTo', a, 4); });
  method('rect', function (...a) { pathOps.line('rect', a, 4); });
  method('arc', function (...a) { pathOps.arc('arc', a); }); method('arcTo', function (...a) { pathOps.arcTo('arcTo', a); });
  method('ellipse', function (...a) { pathOps.ellipse('ellipse', a); }); method('roundRect', function (...a) { pathOps.roundRect('roundRect', a); });
  const fillRule = (m, a) => {
    let i = 0;
    if (a[0] !== undefined && typeof a[0] === 'object') { if (!(a[0] instanceof Path2DStub)) throw new TypeError(`Failed to execute '${m}' on 'CanvasRenderingContext2D': parameter 1 is not of type 'Path2D'.`); i = 1; }
    if (a[i] !== undefined && a[i] !== 'nonzero' && a[i] !== 'evenodd') throw new TypeError(`Failed to execute '${m}' on 'CanvasRenderingContext2D': The provided value '${a[i]}' is not a valid enum value of type CanvasFillRule.`);
  };
  method('fill', function (...a) { fillRule('fill', a); }); method('clip', function (...a) { fillRule('clip', a); });
  method('stroke', function (...a) { if (a[0] !== undefined && !(a[0] instanceof Path2DStub)) throw new TypeError("Failed to execute 'stroke' on 'CanvasRenderingContext2D': parameter 1 is not of type 'Path2D'."); });
  method('isPointInPath', function (...a) { need('isPointInPath', a, 2); return false; }); method('isPointInStroke', function (...a) { need('isPointInStroke', a, 2); return false; });
  method('drawFocusIfNeeded', function () {});
  method('drawImage', function (...a) {
    need('drawImage', a, 3);
    const src = a[0];
    if (!isCanvasSource(src)) throw badSource('drawImage');
    if (![3, 5, 9].includes(a.length)) throw new TypeError(`Failed to execute 'drawImage' on 'CanvasRenderingContext2D': Valid arities are: [3, 5, 9], but ${a.length} arguments provided.`);
    if (src.nodeType === 1 && src.localName === 'canvas' && (src.width === 0 || src.height === 0)) throw domErr(`Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The image argument is a canvas element with a width or height of 0.`, 'InvalidStateError');
    if (env.OffscreenCanvasStub && src instanceof env.OffscreenCanvasStub && (src.width === 0 || src.height === 0)) throw domErr("Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The image argument is an OffscreenCanvas with a width or height of 0.", 'InvalidStateError');
    if (src instanceof ImageBitmapStub && src.width === 0) throw domErr("Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The image source is detached.", 'InvalidStateError');
    if (src.nodeType === 1 && src.localName === 'img' && src._img && src._img.failed) throw domErr("Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The HTMLImageElement provided is in the 'broken' state.", 'InvalidStateError');
    if (!fin(...a.slice(1))) env.issue('nonFinite', `drawImage(..., ${a.slice(1).join(', ')}) ignored`);
  });
  method('fillText', function (...a) { need('fillText', a, 3); if (!fin(a[1], a[2])) env.issue('nonFinite', `fillText(${JSON.stringify(String(a[0]))}, ${a[1]}, ${a[2]}) ignored`); });
  method('strokeText', function (...a) { need('strokeText', a, 3); if (!fin(a[1], a[2])) env.issue('nonFinite', `strokeText(${JSON.stringify(String(a[0]))}, ${a[1]}, ${a[2]}) ignored`); });
  method('measureText', function (...a) {
    need('measureText', a, 1);
    const s = String(a[0]), px2 = this._fontPx, w = s.length * px2 * 0.55 + Math.max(0, s.length - 1) * (parseFloat(this._s.letterSpacing) || 0);
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px2 * 0.75, actualBoundingBoxDescent: px2 * 0.2, fontBoundingBoxAscent: px2 * 0.9, fontBoundingBoxDescent: px2 * 0.25, emHeightAscent: px2 * 0.8, emHeightDescent: px2 * 0.2, alphabeticBaseline: 0, hangingBaseline: px2 * 0.7, ideographicBaseline: -px2 * 0.1 };
  });
  method('createLinearGradient', function (...a) { need('createLinearGradient', a, 4); if (!fin(...a.slice(0, 4))) throw new TypeError("Failed to execute 'createLinearGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite."); return new CanvasGradientStub('linear', a); });
  method('createRadialGradient', function (...a) {
    need('createRadialGradient', a, 6);
    if (!fin(...a.slice(0, 6))) throw new TypeError("Failed to execute 'createRadialGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite.");
    if (num(a[2]) < 0 || num(a[5]) < 0) throw domErr("Failed to execute 'createRadialGradient' on 'CanvasRenderingContext2D': The radius provided is negative.", 'IndexSizeError');
    return new CanvasGradientStub('radial', a);
  });
  method('createConicGradient', function (...a) { need('createConicGradient', a, 3); if (!fin(...a.slice(0, 3))) throw new TypeError("Failed to execute 'createConicGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite."); return new CanvasGradientStub('conic', a); });
  method('createPattern', function (...a) {
    need('createPattern', a, 2);
    if (!isCanvasSource(a[0])) throw badSource('createPattern');
    if (a[1] !== null && !['repeat', 'repeat-x', 'repeat-y', 'no-repeat', ''].includes(a[1])) throw domErr(`Failed to execute 'createPattern' on 'CanvasRenderingContext2D': The provided type ('${a[1]}') is not a valid repetition.`, 'SyntaxError');
    return new CanvasPatternStub(a[0], a[1]);
  });
  method('createImageData', function (...a) {
    if (a.length === 1 && a[0] instanceof ImageDataStub) return new ImageDataStub(a[0].width, a[0].height);
    need('createImageData', a, 2);
    const w = Math.abs(Number(a[0]) | 0), h = Math.abs(Number(a[1]) | 0);
    if (!w || !h) throw domErr("Failed to execute 'createImageData' on 'CanvasRenderingContext2D': The source width and height must be nonzero.", 'IndexSizeError');
    return new ImageDataStub(w, h);
  });
  method('getImageData', function (...a) {
    need('getImageData', a, 4);
    const w = Math.abs(Number(a[2]) | 0), h = Math.abs(Number(a[3]) | 0);
    if (!w || !h) throw domErr("Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The source width and height must be nonzero.", 'IndexSizeError');
    return new ImageDataStub(w, h);
  });
  method('putImageData', function (...a) { need('putImageData', a, 3); if (!(a[0] instanceof ImageDataStub)) throw new TypeError("Failed to execute 'putImageData' on 'CanvasRenderingContext2D': parameter 1 is not of type 'ImageData'."); });
  method('setLineDash', function (...a) {
    need('setLineDash', a, 1);
    if (a[0] == null || typeof a[0][Symbol.iterator] !== 'function') throw new TypeError("Failed to execute 'setLineDash' on 'CanvasRenderingContext2D': The provided value cannot be converted to a sequence.");
    const arr = [...a[0]].map(Number);
    if (arr.some((v) => !Number.isFinite(v) || v < 0)) return;
    this._dash = arr.length % 2 ? arr.concat(arr) : arr;
  });
  method('getLineDash', function () { return this._dash.slice(); });
  method('getContextAttributes', function () { return { alpha: true, desynchronized: false, colorSpace: 'srgb', willReadFrequently: false }; });
  method('isContextLost', function () { return false; });
  g.CanvasRenderingContext2D = Ctx2DStub;

  env.canvasContext = (canvas, type) => {
    if (type !== '2d') return null;
    return canvas._ctx2d || (canvas._ctx2d = new Ctx2DStub(canvas));
  };
  env.canvasResized = (canvas) => { if (canvas._ctx2d) canvas._ctx2d._reset(); };
  env.allCtxIssues = () => env.issues;

  // OffscreenCanvas is opt-in (see header)
  class OffscreenCanvasStub {
    constructor(w, h) { if (arguments.length < 2) throw new TypeError("Failed to construct 'OffscreenCanvas': 2 arguments required."); this._w = w >>> 0; this._h = h >>> 0; }
    get width() { return this._w; } set width(v) { this._w = v >>> 0; env.canvasResized(this); }
    get height() { return this._h; } set height(v) { this._h = v >>> 0; env.canvasResized(this); }
    getContext(type) { return env.canvasContext(this, String(type)); }
    convertToBlob() { return Promise.resolve(new g.Blob(['png'], { type: 'image/png' })); }
    transferToImageBitmap() { return new ImageBitmapStub(this._w, this._h); }
  }
  env.OffscreenCanvasStub = OffscreenCanvasStub;
  if (env.opts.offscreen) g.OffscreenCanvas = OffscreenCanvasStub;
}

// ======================================================================================
// runtime stubs: WebAudio (a constructible, checked, recording fake graph)
// ======================================================================================

function installAudio(env) {
  const g = env.g;
  const { EventTargetStub } = env;
  const A = env.audio = { contexts: [], created: {}, started: 0, stopped: 0, log: [] };
  const rec = (kind) => { A.created[kind] = (A.created[kind] || 0) + 1; };
  const note = (s) => { if (A.log.length < 2000) A.log.push(s); };
  const F32 = () => env.F32 || Float32Array;

  const timeArg = (m, t) => {
    if (typeof t !== 'number' || !Number.isFinite(t)) throw new TypeError(`Failed to execute '${m}' on 'AudioParam': The provided double value is non-finite.`);
    if (t < 0) throw new RangeError(`Failed to execute '${m}' on 'AudioParam': The provided time (${t}) is negative.`);
  };
  const valArg = (m, v) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`Failed to execute '${m}' on 'AudioParam': The provided float value is non-finite.`); };

  class AudioParamStub {
    constructor(ctx, name, v, min, max) { this._ctx = ctx; this.name = name; this._v = v; this.defaultValue = v; this.minValue = min == null ? -3.4028235e38 : min; this.maxValue = max == null ? 3.4028235e38 : max; this.automationRate = 'a-rate'; this._events = 0; }
    get value() { return this._v; }
    set value(v) { valArg('value', v); this._v = v; }
    setValueAtTime(v, t) { valArg('setValueAtTime', v); timeArg('setValueAtTime', t); this._v = v; this._events++; return this; }
    linearRampToValueAtTime(v, t) { valArg('linearRampToValueAtTime', v); timeArg('linearRampToValueAtTime', t); this._v = v; this._events++; return this; }
    exponentialRampToValueAtTime(v, t) {
      valArg('exponentialRampToValueAtTime', v); timeArg('exponentialRampToValueAtTime', t);
      if (Math.abs(v) < 1e-37) throw new RangeError(`Failed to execute 'exponentialRampToValueAtTime' on 'AudioParam': The float target value provided (${v}) should not be in the range (-1e-37, 1e-37).`);
      this._v = v; this._events++; return this;
    }
    setTargetAtTime(v, t, tc) { valArg('setTargetAtTime', v); timeArg('setTargetAtTime', t); valArg('setTargetAtTime', tc); if (tc < 0) throw new RangeError("Failed to execute 'setTargetAtTime' on 'AudioParam': The time constant provided is negative."); this._v = v; this._events++; return this; }
    setValueCurveAtTime(values, t, d) { timeArg('setValueCurveAtTime', t); valArg('setValueCurveAtTime', d); if (!(d > 0)) throw new RangeError("Failed to execute 'setValueCurveAtTime' on 'AudioParam': The curve duration provided must be positive."); if (!values || values.length < 2) throw domErr("Failed to execute 'setValueCurveAtTime' on 'AudioParam': The curve length provided (" + (values ? values.length : 0) + ') is less than the minimum bound (2).', 'InvalidStateError'); this._events++; return this; }
    cancelScheduledValues(t) { timeArg('cancelScheduledValues', t); return this; }
    cancelAndHoldAtTime(t) { timeArg('cancelAndHoldAtTime', t); return this; }
  }

  class AudioNodeStub extends EventTargetStub {
    constructor(ctx, kind, inputs, outputs) {
      super();
      this.context = ctx; this._kind = kind; this.numberOfInputs = inputs; this.numberOfOutputs = outputs;
      this.channelCount = 2; this.channelCountMode = 'max'; this.channelInterpretation = 'speakers'; this._out = [];
      rec(kind); ctx._nodes++;
    }
    connect(dest) {
      if (dest instanceof AudioParamStub) { if (dest._ctx !== this.context) throw domErr('Cannot connect to an AudioParam belonging to a different BaseAudioContext.', 'InvalidAccessError'); this._out.push(dest); return undefined; }
      if (!(dest instanceof AudioNodeStub)) throw new TypeError("Failed to execute 'connect' on 'AudioNode': parameter 1 is not of type 'AudioNode'.");
      if (dest.context !== this.context) throw domErr('Cannot connect to a destination belonging to a different BaseAudioContext.', 'InvalidAccessError');
      this._out.push(dest);
      return dest;
    }
    disconnect(dest) {
      if (dest === undefined) { this._out.length = 0; return; }
      const i = this._out.indexOf(dest);
      if (i < 0) throw domErr('the given destination is not connected.', 'InvalidAccessError');
      this._out.splice(i, 1);
    }
  }
  const mkNode = (name, kind, inputs, outputs, params, extra) => {
    const C = { [name]: class extends AudioNodeStub {
      constructor(ctx, options) {
        super(ctx, kind, inputs, outputs);
        for (const [pn, dv, lo, hi] of params) this[pn] = new AudioParamStub(ctx, pn, options && options[pn] !== undefined ? options[pn] : dv, lo, hi);
        if (extra) extra.call(this, ctx, options || {});
      }
    } }[name];
    return C;
  };
  const enumProp = (self, name, list, init, extraCheck) => {
    let v = init;
    Object.defineProperty(self, name, { get: () => v, set: (x) => { if (!list.includes(x)) return; if (extraCheck) extraCheck(x); v = x; }, enumerable: true });
  };

  // sources: start/stop rules and the 'ended' event on the virtual clock
  const source = (self, ctx, end) => {
    self._started = false; self._stopped = false; self.onended = null;
    self.start = function start(when = 0) {
      if (typeof when !== 'number' || !Number.isFinite(when)) throw new TypeError(`Failed to execute 'start' on '${self.constructor.name}': The provided double value is non-finite.`);
      if (when < 0) throw new RangeError(`Failed to execute 'start' on '${self.constructor.name}': The start time provided (${when}) is negative.`);
      if (self._started) throw domErr(`Failed to execute 'start' on '${self.constructor.name}': cannot call start more than once.`, 'InvalidStateError');
      self._started = true; A.started++; note(`start ${self._kind} @${when.toFixed(3)}`);
      if (end) { const at = end(self, arguments); if (at != null) self._endAt(at); }
    };
    self.stop = function stop(when = 0) {
      if (typeof when !== 'number' || !Number.isFinite(when)) throw new TypeError(`Failed to execute 'stop' on '${self.constructor.name}': The provided double value is non-finite.`);
      if (when < 0) throw new RangeError(`Failed to execute 'stop' on '${self.constructor.name}': The stop time provided (${when}) is negative.`);
      if (!self._started) throw domErr(`Failed to execute 'stop' on '${self.constructor.name}': cannot call stop without calling start first.`, 'InvalidStateError');
      note(`stop ${self._kind} @${when.toFixed(3)}`);
      self._endAt(when);
    };
    self._endAt = (atCtxTime) => {
      if (self._stopped) return;
      const ms = Math.max(0, (atCtxTime - ctx.currentTime) * 1000);
      env.setTimer(() => {
        if (self._stopped) return;
        self._stopped = true; A.stopped++;
        try { self.dispatchEvent(new env.ev.Event('ended')); } catch (e) { env.uncaught.push(e); }
      }, ms, [], false);
    };
  };

  class AudioBufferStub {
    constructor(opts2) {
      const o = opts2 || {};
      const ch = o.numberOfChannels == null ? 1 : o.numberOfChannels, len = o.length, rate = o.sampleRate;
      if (!(ch >= 1 && ch <= 32)) throw domErr(`Failed to construct 'AudioBuffer': The number of channels provided (${ch}) is outside the range [1, 32].`, 'NotSupportedError');
      if (!(len >= 1)) throw domErr(`Failed to construct 'AudioBuffer': The number of frames provided (${len}) is less than or equal to the minimum bound (0).`, 'NotSupportedError');
      if (!(rate >= 3000 && rate <= 768000)) throw domErr(`Failed to construct 'AudioBuffer': The sample rate provided (${rate}) is outside the range [3000, 768000].`, 'NotSupportedError');
      this.numberOfChannels = ch; this.length = Math.floor(len); this.sampleRate = rate; this.duration = this.length / rate; this._data = [];
      rec('buffer');
    }
    getChannelData(c) {
      if (!(c >= 0 && c < this.numberOfChannels)) throw domErr(`Failed to execute 'getChannelData' on 'AudioBuffer': channel index (${c}) exceeds number of channels (${this.numberOfChannels})`, 'IndexSizeError');
      return this._data[c] || (this._data[c] = new (F32())(this.length));
    }
    copyFromChannel(dst, c, start = 0) { const s = this.getChannelData(c); for (let i = 0; i < dst.length && start + i < s.length; i++) dst[i] = s[start + i]; }
    copyToChannel(src, c, start = 0) { const s = this.getChannelData(c); for (let i = 0; i < src.length && start + i < s.length; i++) s[start + i] = src[i]; }
  }

  const GainNodeStub = mkNode('GainNode', 'gain', 1, 1, [['gain', 1]]);
  const OscillatorNodeStub = mkNode('OscillatorNode', 'oscillator', 0, 1, [['frequency', 440, -24000, 24000], ['detune', 0]], function (ctx, o) {
    enumProp(this, 'type', ['sine', 'square', 'sawtooth', 'triangle'], o.type || 'sine');
    this._custom = false;
    this.setPeriodicWave = (w) => { if (!(w instanceof PeriodicWaveStub)) throw new TypeError("Failed to execute 'setPeriodicWave' on 'OscillatorNode': parameter 1 is not of type 'PeriodicWave'."); this._custom = true; };
    source(this, ctx, null);
  });
  const BufferSourceStub = mkNode('AudioBufferSourceNode', 'bufferSource', 0, 1, [['playbackRate', 1], ['detune', 0]], function (ctx, o) {
    this.buffer = o.buffer || null; this.loop = !!o.loop; this.loopStart = o.loopStart || 0; this.loopEnd = o.loopEnd || 0;
    source(this, ctx, (self, args) => {
      if (self.loop || !self.buffer) return null;
      const when = args[0] || 0, offset = args[1] || 0, dur = args[2];
      const len = dur !== undefined ? dur : Math.max(0, self.buffer.duration - offset);
      return Math.max(when, ctx.currentTime) + len / Math.max(1e-6, Math.abs(self.playbackRate.value));    // when in the past means now
    });
  });
  const ConstantSourceStub = mkNode('ConstantSourceNode', 'constantSource', 0, 1, [['offset', 1]], function (ctx) { source(this, ctx, null); });
  const BiquadStub = mkNode('BiquadFilterNode', 'biquad', 1, 1, [['frequency', 350, 0, 24000], ['detune', 0], ['Q', 1], ['gain', 0]], function (ctx, o) {
    enumProp(this, 'type', ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'], o.type || 'lowpass');
    this.getFrequencyResponse = (f, mag, ph) => { for (let i = 0; i < f.length; i++) { mag[i] = 1; ph[i] = 0; } };
  });
  const CompressorStub = mkNode('DynamicsCompressorNode', 'compressor', 1, 1, [['threshold', -24, -100, 0], ['knee', 30, 0, 40], ['ratio', 12, 1, 20], ['attack', 0.003, 0, 1], ['release', 0.25, 0, 1]], function () { this.reduction = 0; });
  const PannerStereoStub = mkNode('StereoPannerNode', 'stereoPanner', 1, 1, [['pan', 0, -1, 1]]);
  const DelayStub = mkNode('DelayNode', 'delay', 1, 1, [['delayTime', 0, 0, 180]]);
  const ConvolverStub = mkNode('ConvolverNode', 'convolver', 1, 1, [], function () { this.buffer = null; this.normalize = true; });
  const ShaperStub = mkNode('WaveShaperNode', 'waveShaper', 1, 1, [], function () { this.curve = null; enumProp(this, 'oversample', ['none', '2x', '4x'], 'none'); });
  const AnalyserStub = mkNode('AnalyserNode', 'analyser', 1, 1, [], function () {
    this.fftSize = 2048; this.minDecibels = -100; this.maxDecibels = -30; this.smoothingTimeConstant = 0.8;
    Object.defineProperty(this, 'frequencyBinCount', { get: () => this.fftSize / 2 });
    this.getByteTimeDomainData = (a) => a.fill(128); this.getByteFrequencyData = (a) => a.fill(0);
    this.getFloatTimeDomainData = (a) => a.fill(0); this.getFloatFrequencyData = (a) => a.fill(-100);
  });
  const SplitterStub = (n) => class extends AudioNodeStub { constructor(ctx) { super(ctx, 'channelSplitter', 1, n); } };
  const MergerStub = (n) => class extends AudioNodeStub { constructor(ctx) { super(ctx, 'channelMerger', n, 1); } };
  const PannerNodeStub = mkNode('PannerNode', 'panner', 1, 1, [['positionX', 0], ['positionY', 0], ['positionZ', 0], ['orientationX', 1], ['orientationY', 0], ['orientationZ', 0]], function () { this.panningModel = 'equalpower'; this.distanceModel = 'inverse'; this.setPosition = () => {}; this.setOrientation = () => {}; });
  class PeriodicWaveStub { constructor(ctx, o) { const r = (o && o.real) || []; if (r.length < 2) throw domErr("Failed to construct 'PeriodicWave': The real array length must be at least 2.", 'IndexSizeError'); rec('periodicWave'); } }

  class BaseAudioContextStub extends EventTargetStub {
    constructor(sampleRate) {
      super();
      this.sampleRate = sampleRate; this.state = 'suspended'; this._nodes = 0; this._born = env.now; this._pausedAt = env.now; this._pausedTotal = 0; this.onstatechange = null;
      this.baseLatency = 0.01; this.outputLatency = 0.02; this.audioWorklet = { addModule: () => Promise.reject(domErr('AudioWorklet is not available headless.', 'NotSupportedError')) };
      this.destination = new AudioDestinationStub(this);
      this.listener = { positionX: new AudioParamStub(this, 'positionX', 0), positionY: new AudioParamStub(this, 'positionY', 0), positionZ: new AudioParamStub(this, 'positionZ', 0), setPosition() {}, setOrientation() {} };
      A.contexts.push(this);
    }
    get currentTime() { return this.state === 'running' ? (env.now - this._born - this._pausedTotal) / 1000 : (this._pausedAt - this._born - this._pausedTotal) / 1000; }
    _setState(s) {
      if (this.state === s) return;
      if (this.state === 'running') this._pausedAt = env.now; else if (s === 'running') this._pausedTotal += env.now - this._pausedAt;
      this.state = s; note('state ' + s);
      queueMicrotask(() => { try { this.dispatchEvent(new env.ev.Event('statechange')); } catch (e) { env.uncaught.push(e); } });
    }
    resume() { if (this.state === 'closed') return Promise.reject(domErr('Cannot resume a closed AudioContext', 'InvalidStateError')); this._setState('running'); return Promise.resolve(); }
    suspend() { if (this.state === 'closed') return Promise.reject(domErr('Cannot suspend a closed AudioContext', 'InvalidStateError')); this._setState('suspended'); return Promise.resolve(); }
    close() { if (this.state === 'closed') return Promise.reject(domErr('Cannot close a closed AudioContext', 'InvalidStateError')); this._setState('closed'); return Promise.resolve(); }
    createBuffer(ch, len, rate) { if (arguments.length < 3) throw new TypeError("Failed to execute 'createBuffer' on 'BaseAudioContext': 3 arguments required."); return new AudioBufferStub({ numberOfChannels: ch, length: len, sampleRate: rate }); }
    createBufferSource() { return new BufferSourceStub(this); }
    createOscillator() { return new OscillatorNodeStub(this); }
    createGain() { return new GainNodeStub(this); }
    createBiquadFilter() { return new BiquadStub(this); }
    createDynamicsCompressor() { return new CompressorStub(this); }
    createStereoPanner() { return new PannerStereoStub(this); }
    createPanner() { return new PannerNodeStub(this); }
    createDelay(max = 1) { if (!(max > 0 && max < 180)) throw domErr(`Failed to execute 'createDelay' on 'BaseAudioContext': The max delay time (${max}) must be positive and less than 180.`, 'NotSupportedError'); const d = new DelayStub(this); d.delayTime.maxValue = max; return d; }
    createConvolver() { return new ConvolverStub(this); }
    createWaveShaper() { return new ShaperStub(this); }
    createAnalyser() { return new AnalyserStub(this); }
    createConstantSource() { return new ConstantSourceStub(this); }
    createChannelSplitter(n = 6) { return new (SplitterStub(n))(this); }
    createChannelMerger(n = 6) { return new (MergerStub(n))(this); }
    createPeriodicWave(real, imag) { return new PeriodicWaveStub(this, { real, imag }); }
    createScriptProcessor() { return new GainNodeStub(this); }
    decodeAudioData(buf, ok) { const b = new AudioBufferStub({ numberOfChannels: 1, length: this.sampleRate, sampleRate: this.sampleRate }); if (typeof ok === 'function') queueMicrotask(() => ok(b)); return Promise.resolve(b); }
  }
  class AudioDestinationStub extends AudioNodeStub { constructor(ctx) { super(ctx, 'destination', 1, 0); this.maxChannelCount = 2; } }
  const checkRate = (r) => { if (r !== undefined && !(r >= 8000 && r <= 96000)) throw domErr(`Failed to construct 'AudioContext': The sample rate provided (${r}) is outside the range [8000, 96000].`, 'NotSupportedError'); };
  class AudioContextStub extends BaseAudioContextStub {
    constructor(options) {
      if (env.loading && !env.opts.allowTopLevelDom) throw new Error(`top-level AudioContext construction while loading ${env.currentFile || 'scripts'}: create it lazily inside AUDIO.init (DESIGN section 2)`);
      const o = options || {};
      checkRate(o.sampleRate);
      super(o.sampleRate || env.opts.sampleRate || 44100);
      this.latencyHint = o.latencyHint || 'interactive'; note('new AudioContext');
    }
    getOutputTimestamp() { return { contextTime: this.currentTime, performanceTime: env.now }; }
    createMediaElementSource() { return new GainNodeStub(this); }
    createMediaStreamDestination() { return new GainNodeStub(this); }
  }
  class OfflineAudioContextStub extends BaseAudioContextStub {
    constructor(a, len, rate) {
      const o = typeof a === 'object' ? a : { numberOfChannels: a, length: len, sampleRate: rate };
      if (!(o.length >= 1)) throw domErr("Failed to construct 'OfflineAudioContext': The number of frames provided is less than or equal to the minimum bound (0).", 'NotSupportedError');
      if (!(o.sampleRate >= 3000 && o.sampleRate <= 768000)) throw domErr(`Failed to construct 'OfflineAudioContext': The sample rate provided (${o.sampleRate}) is outside the range.`, 'NotSupportedError');
      super(o.sampleRate); this.length = o.length; this._ch = o.numberOfChannels || 1; this.oncomplete = null;
    }
    startRendering() { const b = new AudioBufferStub({ numberOfChannels: this._ch, length: this.length, sampleRate: this.sampleRate }); this._setState('closed'); return Promise.resolve(b).then((r) => { if (typeof this.oncomplete === 'function') this.oncomplete({ renderedBuffer: r }); return r; }); }
  }
  Object.assign(g, {
    AudioContext: AudioContextStub, webkitAudioContext: AudioContextStub, OfflineAudioContext: OfflineAudioContextStub, webkitOfflineAudioContext: OfflineAudioContextStub,
    BaseAudioContext: BaseAudioContextStub, AudioNode: AudioNodeStub, AudioParam: AudioParamStub, AudioBuffer: AudioBufferStub, GainNode: GainNodeStub, OscillatorNode: OscillatorNodeStub,
    AudioBufferSourceNode: BufferSourceStub, ConstantSourceNode: ConstantSourceStub, BiquadFilterNode: BiquadStub, DynamicsCompressorNode: CompressorStub, StereoPannerNode: PannerStereoStub,
    DelayNode: DelayStub, ConvolverNode: ConvolverStub, WaveShaperNode: ShaperStub, AnalyserNode: AnalyserStub, PeriodicWave: PeriodicWaveStub, PannerNode: PannerNodeStub, AudioDestinationNode: AudioDestinationStub,
  });
}

// ======================================================================================
// runtime stubs: timers, storage, media queries, observers, navigator, location ...
// ======================================================================================

const banned = (what) => function () { throw new Error(`${what} is banned in Inkwoven (no network, no dialogs, no eval): see DESIGN section 2`); };
const DEFAULT_MEDIA = { '(prefers-reduced-motion: reduce)': false, '(prefers-reduced-motion: no-preference)': true, '(prefers-color-scheme: dark)': false, '(display-mode: standalone)': false };

function installWeb(env) {
  const g = env.g;
  const { EventTargetStub } = env;
  const opts = env.opts;
  const isEl2 = (n) => n && n.nodeType === 1;

  // ---- virtual clock: timers, rAF, idle callbacks
  env.setTimer = (fn, ms, args, repeat) => {
    ms = Number(ms);
    if (!(ms > 0)) ms = 0;
    if (ms > 2147483647) ms = 1;
    const id = ++env.tid;
    env.timers.push({ id, fn, args: args || [], at: env.now + ms, every: repeat ? Math.max(1, ms) : 0, seq: ++env.seq });
    return id;
  };
  env.clearTimer = (id) => { const i = env.timers.findIndex((t) => t.id === id); if (i >= 0) env.timers.splice(i, 1); };
  const nextDue = (limit) => { let best = null; for (const t of env.timers) if (t.at <= limit && (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq))) best = t; return best; };
  env.advanceTo = (target) => {
    let guard = 0, firstErr = null;
    for (let t = nextDue(target); t; t = nextDue(target)) {
      if (++guard > 200000) throw new Error('virtual clock: runaway timers (more than 200000 callbacks in one advance). Is a setInterval or a timeout loop rescheduling itself with 0ms?');
      env.now = Math.max(env.now, t.at);
      if (t.every) { t.at += t.every; t.seq = ++env.seq; } else env.timers.splice(env.timers.indexOf(t), 1);
      try { t.fn(...t.args); } catch (e) { firstErr = firstErr || e; }
    }
    env.now = Math.max(env.now, target);
    if (firstErr) throw firstErr;
  };
  env.runFrame = (ms) => {
    env.advanceTo(env.now + ms);
    if (env.document.hidden) return 0;                                // browsers pause rAF in hidden tabs
    const q = env.raf.splice(0);
    let firstErr = null;
    for (const r of q) { try { r.fn(env.now); } catch (e) { firstErr = firstErr || e; } }
    if (firstErr) throw firstErr;
    return q.length;
  };
  const timeFn = (name) => (fn, ms, ...args) => {
    if (typeof fn !== 'function') throw new TypeError(`${name}: the callback must be a function (string callbacks need eval, which is banned)`);
    return env.setTimer(fn, ms, args, name === 'setInterval');
  };
  Object.assign(g, {
    setTimeout: timeFn('setTimeout'), setInterval: timeFn('setInterval'),
    clearTimeout: (id) => env.clearTimer(id), clearInterval: (id) => env.clearTimer(id),
    requestAnimationFrame: (fn) => { if (typeof fn !== 'function') throw new TypeError("Failed to execute 'requestAnimationFrame' on 'Window': The callback provided as parameter 1 is not a function."); const id = ++env.rafId; env.raf.push({ id, fn }); return id; },
    cancelAnimationFrame: (id) => { const i = env.raf.findIndex((r) => r.id === id); if (i >= 0) env.raf.splice(i, 1); },
    requestIdleCallback: (fn) => env.setTimer(() => fn({ didTimeout: false, timeRemaining: () => 12 }), 1, [], false),
    cancelIdleCallback: (id) => env.clearTimer(id),
    queueMicrotask,
  });

  // ---- storage
  const makeStorage = (backing, name) => {
    const chk = (op) => { if (env.loading && !opts.allowTopLevelDom) throw new Error(`top-level ${name}.${op}() while loading ${env.currentFile || 'scripts'}: touch storage lazily (META.load runs from GAME.boot)`); };
    const mode = name === 'localStorage' && opts.failStorage ? (opts.failStorage === true ? 'set' : opts.failStorage) : null;
    const api = {
      getItem(k) { chk('getItem'); if (mode === 'get' || mode === 'all') throw domErr("Failed to read from storage: access is denied", 'SecurityError'); k = String(k); return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null; },
      setItem(k, v) { chk('setItem'); if (mode === 'set' || mode === 'all') throw domErr(`Failed to execute 'setItem' on 'Storage': Setting the value of '${k}' exceeded the quota.`, 'QuotaExceededError'); backing[String(k)] = String(v); },
      removeItem(k) { chk('removeItem'); if (mode === 'all') throw domErr('Failed to remove from storage: access is denied', 'SecurityError'); delete backing[String(k)]; },
      clear() { chk('clear'); for (const k of Object.keys(backing)) delete backing[k]; },
      key(i) { return Object.keys(backing)[i] === undefined ? null : Object.keys(backing)[i]; },
      get length() { return Object.keys(backing).length; },
    };
    return new Proxy(api, {
      get(t, p) { if (p in t) return t[p]; return typeof p === 'string' && Object.prototype.hasOwnProperty.call(backing, p) ? backing[p] : undefined; },
      set(t, p, v) { if (typeof p === 'string') t.setItem(p, v); return true; },
      deleteProperty(t, p) { delete backing[String(p)]; return true; },
      has(t, p) { return p in t || (typeof p === 'string' && Object.prototype.hasOwnProperty.call(backing, p)); },
      ownKeys() { return Object.keys(backing); },
      getOwnPropertyDescriptor(t, p) { return typeof p === 'string' && Object.prototype.hasOwnProperty.call(backing, p) ? { value: backing[p], enumerable: true, configurable: true, writable: true } : undefined; },
    });
  };
  const local = makeStorage(env.store, 'localStorage'), session = makeStorage(env.sessionStore, 'sessionStorage');
  if (opts.failStorage !== 'access') g.localStorage = local;          // 'access' is installed inside the page by boot() (see there)
  g.sessionStorage = session;
  g.Storage = class Storage {};

  // ---- location, history, navigator, screen, viewports
  const base = 'http://localhost/hocus_vocus/index.html';
  let search = opts.search ? (typeof opts.search === 'string' ? opts.search : '?' + new URLSearchParams(opts.search).toString()) : '';
  if (search && search[0] !== '?') search = '?' + search;
  if (opts.seed != null && !/[?&]seed=/.test(search)) search += (search ? '&' : '?') + 'seed=' + opts.seed;
  const loc = {
    origin: 'http://localhost', protocol: 'http:', host: 'localhost', hostname: 'localhost', port: '', pathname: '/hocus_vocus/index.html', search, hash: opts.hash ? (opts.hash[0] === '#' ? opts.hash : '#' + opts.hash) : '',
    get href() { return this.origin + this.pathname + this.search + this.hash; },
    assign(u) { env.navigations.push(String(u)); }, replace(u) { env.navigations.push(String(u)); }, reload() { env.reloads++; }, toString() { return this.href; },
  };
  env.location = loc;
  Object.defineProperty(g, 'location', { get: () => loc, set: (u) => { env.navigations.push(String(u)); }, configurable: true, enumerable: true });
  const applyUrl = (u) => { if (u == null) return; const url = new URL(String(u), loc.href); loc.pathname = url.pathname; loc.search = url.search; loc.hash = url.hash; };
  g.history = { length: 1, state: null, scrollRestoration: 'auto', pushState(s, t, u) { this.state = s; applyUrl(u); }, replaceState(s, t, u) { this.state = s; applyUrl(u); }, back() {}, forward() {}, go() {} };
  const touch = !!opts.touch;
  g.navigator = {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 InkwovenTest', platform: 'Linux x86_64', vendor: 'Google Inc.', language: 'en-US', languages: ['en-US', 'en'], onLine: true, cookieEnabled: true,
    hardwareConcurrency: 4, maxTouchPoints: touch ? 5 : 0, webdriver: true,
    vibrate(p) { env.vibrations.push(p); return true; }, getGamepads: () => [],
    clipboard: { writeText(s) { env.clipboard = String(s); return Promise.resolve(); }, readText() { return Promise.resolve(env.clipboard); } },
    storage: { estimate: () => Promise.resolve({ usage: 0, quota: 1e9 }), persist: () => Promise.resolve(false) },
    wakeLock: { request: () => Promise.resolve({ release: () => Promise.resolve() }) },
    sendBeacon: banned('navigator.sendBeacon'),
  };
  g.screen = {
    get width() { return env.viewport.w; }, get height() { return env.viewport.h; }, get availWidth() { return env.viewport.w; }, get availHeight() { return env.viewport.h; }, colorDepth: 24, pixelDepth: 24,
    orientation: { get type() { return env.viewport.w >= env.viewport.h ? 'landscape-primary' : 'portrait-primary'; }, angle: 0, lock(o) { env.orientationLocks.push(o); return Promise.resolve(); }, unlock() {}, addEventListener() {}, removeEventListener() {} },
  };
  class VisualViewportStub extends EventTargetStub {
    get width() { return env.viewport.w; } get height() { return env.viewport.h; } get scale() { return 1; } get offsetLeft() { return 0; } get offsetTop() { return 0; } get pageLeft() { return 0; } get pageTop() { return 0; }
  }
  env.visualViewport = new VisualViewportStub();
  g.visualViewport = env.visualViewport;
  Object.assign(g, {
    innerWidth: env.viewport.w, innerHeight: env.viewport.h, outerWidth: env.viewport.w, outerHeight: env.viewport.h, devicePixelRatio: opts.dpr || 1,
    scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0, screenX: 0, screenY: 0, screenLeft: 0, screenTop: 0, isSecureContext: true, origin: 'http://localhost', name: '', opener: null, closed: false,
    document: env.document,
    open: () => null, close() {}, focus() {}, blur() {}, print() {}, scrollTo() {}, scroll() {}, scrollBy() {}, stop() {},
    postMessage(data) { env.setTimer(() => { const ev = new env.ev.Event('message'); ev.data = data; env.winTarget.dispatchEvent(ev); }, 0, [], false); },
    getSelection: () => env.selection,
    alert: banned('alert()'), confirm: banned('confirm()'), prompt: banned('prompt()'),
    fetch: banned('fetch()'), XMLHttpRequest: banned('XMLHttpRequest'), WebSocket: banned('WebSocket'), EventSource: banned('EventSource'), Worker: banned('Worker'), SharedWorker: banned('SharedWorker'),
    CSS: { supports: () => true, escape: (s) => String(s).replace(/[^\w-]/g, (c) => '\\' + c) },
    performance: { now: () => env.now, timeOrigin: env.epoch, mark() {}, measure() {}, getEntriesByName: () => [], getEntriesByType: () => [], clearMarks() {}, clearMeasures() {}, toJSON: () => ({}) },
    console: env.consoleApi,
    URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone, atob, btoa, Blob, AbortController, AbortSignal, DOMException,
  });
  env.selection = { removeAllRanges() {}, addRange() {}, toString: () => '', rangeCount: 0 };
  env.fonts = { ready: Promise.resolve(), status: 'loaded', load: () => Promise.resolve([]), check: () => true, add() {}, delete() { return true; }, forEach() {}, addEventListener() {}, removeEventListener() {} };
  const wt = env.winTarget;
  g.addEventListener = (...a) => wt.addEventListener(...a);
  g.removeEventListener = (...a) => wt.removeEventListener(...a);
  g.dispatchEvent = (ev) => wt.dispatchEvent(ev);
  if (touch) g.ontouchstart = null;
  g.__HEADLESS = !opts.realtime;
  g.__NO_AUTOBOOT = !opts.autoboot;
  g.__errors = []; g.__missing = [];                          // the inline watchdog in index.html makes these in a real page

  // ---- constructors that need the document
  g.Image = function Image(w, h) { const el = env.document.createElement('img'); if (w != null) el.setAttribute('width', String(w)); if (h != null) el.setAttribute('height', String(h)); return el; };
  g.Audio = function Audio(src) { const el = env.document.createElement('audio'); if (src) el.setAttribute('src', src); return el; };
  g.Option = function Option(text, value, dsel, sel) { const o = env.document.createElement('option'); if (text != null) o.textContent = text; if (value != null) o.setAttribute('value', value); if (sel) o.setAttribute('selected', ''); return o; };

  // ---- media queries
  env.media = Object.assign({}, DEFAULT_MEDIA, touch ? { '(pointer: coarse)': true, '(hover: none)': true, '(any-pointer: coarse)': true } : { '(pointer: fine)': true, '(hover: hover)': true }, opts.media || {});
  const evalMedia = (q) => {
    q = String(q).trim();
    if (Object.prototype.hasOwnProperty.call(env.media, q)) return !!env.media[q];
    if (q === 'all' || q === '') return true;
    const parts = q.split(/\s+and\s+/i);
    if (parts.length > 1) return parts.every(evalMedia);
    let m;
    if ((m = /^\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(q))) return env.viewport.w >= +m[1];
    if ((m = /^\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(q))) return env.viewport.w <= +m[1];
    if ((m = /^\(\s*min-height\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(q))) return env.viewport.h >= +m[1];
    if ((m = /^\(\s*max-height\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(q))) return env.viewport.h <= +m[1];
    if ((m = /^\(\s*orientation\s*:\s*(portrait|landscape)\s*\)$/i.exec(q))) return (env.viewport.h > env.viewport.w) === (m[1] === 'portrait');
    if ((m = /^\(\s*min-resolution\s*:\s*(\d+(?:\.\d+)?)dppx\s*\)$/i.exec(q))) return (g.devicePixelRatio || 1) >= +m[1];
    return false;
  };
  class MediaQueryListStub extends EventTargetStub {
    constructor(q) { super(); this.media = q; this.onchange = null; this._last = evalMedia(q); env.mqls.push(this); }
    get matches() { return evalMedia(this.media); }
    addListener(fn) { this.addEventListener('change', fn); } removeListener(fn) { this.removeEventListener('change', fn); }
  }
  g.matchMedia = (q) => { env.guardDom('matchMedia()'); return new MediaQueryListStub(q); };
  g.MediaQueryList = MediaQueryListStub;
  env.setMedia = (q, v) => {
    env.media[q] = !!v;
    for (const m of env.mqls) {
      const now = m.matches;
      if (now !== m._last) { m._last = now; const ev = new env.ev.Event('change'); ev.matches = now; ev.media = m.media; m.dispatchEvent(ev); }
    }
  };

  // ---- getComputedStyle
  const INHERITED = new Set(['visibility', 'cursor', 'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'pointer-events', 'direction', 'user-select', 'white-space', 'letter-spacing']);
  const INLINE_TAGS = new Set(['span', 'a', 'b', 'i', 'em', 'strong', 'label', 'small', 'code', 'img', 'button', 'input', 'select', 'textarea', 'sup', 'sub']);
  const HIDDEN_TAGS = new Set(['head', 'script', 'style', 'title', 'meta', 'link', 'template', 'noscript']);
  g.getComputedStyle = (el) => {
    env.guardDom('getComputedStyle()');
    if (!isEl2(el)) throw new TypeError("Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.");
    const lookup = (prop) => {
      for (let n = el; isEl2(n); n = n.parentNode) {
        const v = n._style && n._style.getPropertyValue(prop);
        if (v) return v;
        if (!INHERITED.has(prop) && !prop.startsWith('--')) break;
      }
      const r = el.getBoundingClientRect();
      switch (prop) {
        case 'display': return el.hasAttribute('hidden') || HIDDEN_TAGS.has(el.localName) ? 'none' : INLINE_TAGS.has(el.localName) ? 'inline' : 'block';
        case 'position': return 'static'; case 'visibility': return 'visible'; case 'opacity': return '1'; case 'pointer-events': return 'auto'; case 'transform': return 'none';
        case 'z-index': return 'auto'; case 'overflow': return 'visible'; case 'cursor': return 'auto'; case 'font-size': return '16px'; case 'color': return 'rgb(0, 0, 0)'; case 'background-color': return 'rgba(0, 0, 0, 0)';
        case 'width': return r.width + 'px'; case 'height': return r.height + 'px';
        default: return '';
      }
    };
    const api = { getPropertyValue: (p) => lookup(String(p)), getPropertyPriority: () => '', item: () => '', length: 0 };
    return new Proxy(api, { get(t, p) { if (p in t) return t[p]; return typeof p === 'string' ? lookup(kebab(p)) : undefined; } });
  };

  // ---- observers
  class ResizeObserverStub {
    constructor(cb) { if (typeof cb !== 'function') throw new TypeError("Failed to construct 'ResizeObserver': The callback provided as parameter 1 is not a function."); this._cb = cb; this._els = new Set(); env.observers.push(this); }
    observe(el) { this._els.add(el); } unobserve(el) { this._els.delete(el); } disconnect() { this._els.clear(); }
  }
  class IntersectionObserverStub {
    constructor(cb, o) { if (typeof cb !== 'function') throw new TypeError("Failed to construct 'IntersectionObserver': The callback provided as parameter 1 is not a function."); this._cb = cb; this._els = new Set(); this.root = (o && o.root) || null; this.rootMargin = (o && o.rootMargin) || '0px'; this.thresholds = [0]; env.observers.push(this); }
    observe(el) { this._els.add(el); } unobserve(el) { this._els.delete(el); } disconnect() { this._els.clear(); } takeRecords() { return []; }
  }
  class MutationObserverStub { constructor(cb) { this._cb = cb; } observe() {} disconnect() {} takeRecords() { return []; } }
  class PerformanceObserverStub { constructor(cb) { this._cb = cb; } observe() {} disconnect() {} takeRecords() { return []; } }
  Object.assign(g, { ResizeObserver: ResizeObserverStub, IntersectionObserver: IntersectionObserverStub, MutationObserver: MutationObserverStub, PerformanceObserver: PerformanceObserverStub });
  env.triggerResize = (el, size) => {
    const w = (size && size.width) != null ? size.width : el.getBoundingClientRect().width, h = (size && size.height) != null ? size.height : el.getBoundingClientRect().height;
    const rect = { x: 0, y: 0, width: w, height: h, top: 0, left: 0, right: w, bottom: h };
    for (const o of env.observers) if (o instanceof ResizeObserverStub && o._els.has(el)) o._cb([{ target: el, contentRect: rect, borderBoxSize: [{ inlineSize: w, blockSize: h }], contentBoxSize: [{ inlineSize: w, blockSize: h }] }], o);
  };
  env.triggerIntersect = (el, ratio) => {
    for (const o of env.observers) if (o instanceof IntersectionObserverStub && o._els.has(el)) o._cb([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio, time: env.now, boundingClientRect: el.getBoundingClientRect(), intersectionRect: el.getBoundingClientRect(), rootBounds: null }], o);
  };
}

// The page's console: collected, never printed unless console:'pass'.
function makeConsole(env) {
  const c = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug', 'trace']) {
    c[k] = (...a) => {
      const line = util.format(...a);
      env.console[k === 'trace' ? 'debug' : k].push(line);
      if (env.opts.console === 'pass') process.stderr.write(`[page ${k}] ${line}\n`);
    };
  }
  for (const k of ['assert', 'clear', 'count', 'countReset', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'table', 'time', 'timeEnd', 'timeLog', 'timeStamp', 'profile', 'profileEnd']) c[k] = () => {};
  return c;
}

// ======================================================================================
// boot
// ======================================================================================

export class BootError extends Error {
  constructor(errors) {
    super([`boot: ${errors.length} script${errors.length > 1 ? 's' : ''} failed to load`].concat(errors.map((e) => `  ${e.file}${e.line ? ':' + e.line : ''} (${e.kind}): ${e.message}${e.stack ? '\n' + e.stack.split('\n').slice(0, 4).map((l) => '      ' + l).join('\n') : ''}`))
      .concat(['  Fix that file, or pass {continue:true} to boot without it, or {skip:[name]} to leave it out.']).join('\n'));
    this.name = 'BootError'; this.errors = errors; this.file = errors[0] && errors[0].file;
  }
}
const warnedImplicit = new Set();

function createEnv(opts, dir) {
  const vp = opts.viewport || {};
  const env = {
    opts, dir, g: {}, now: 0, epoch: opts.epoch != null ? opts.epoch : Date.UTC(2026, 0, 1), timers: [], tid: 0, seq: 0, raf: [], rafId: 0,
    counts: {}, issues: [], console: { log: [], info: [], warn: [], error: [], debug: [] }, loading: false, currentFile: null, active: null, els: [], observers: [], mqls: [], uncaught: [],
    pointerCapture: {}, reloads: 0, navigations: [], orientationLocks: [], vibrations: [], clipboard: '', store: Object.assign({}, opts.store || {}), sessionStore: {}, viewport: { w: vp.w || 1280, h: vp.h || 720 },
    document: null, winTarget: null, fullscreenElement: null,
  };
  env.consoleApi = makeConsole(env);
  installEvents(env);
  env.winTarget = new env.EventTargetStub();
  installDom(env);
  installCanvas(env);
  installAudio(env);
  const htmlPath = path.join(dir, 'index.html');
  buildDocument(env, opts.html != null ? opts.html : fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
  installWeb(env);
  return env;
}

const KEY_CODES = { Enter: 13, Escape: 27, ' ': 32, Tab: 9, Backspace: 8, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46, Shift: 16, Control: 17, Alt: 18 };
const keyCode = (k) => KEY_CODES[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
const keyCodeName = (k) => (/^[a-z]$/i.test(k) ? 'Key' + k.toUpperCase() : /^[0-9]$/.test(k) ? 'Digit' + k : k === ' ' ? 'Space' : k);

export function boot(opts = {}) {
  opts = { ...opts };
  const dir = path.resolve(opts.dir || DIR);
  const plan = resolveScripts({ only: opts.only, skip: opts.skip, dir });
  const env = createEnv(opts, dir);
  const g = env.g;
  const ctx = vm.createContext(g, { codeGeneration: { strings: !!opts.allowEval, wasm: false } });
  g.__rbNow = () => env.epoch + env.now;
  vm.runInContext(`(function () {
    globalThis.window = globalThis; globalThis.self = globalThis; globalThis.top = globalThis; globalThis.parent = globalThis; globalThis.frames = globalThis;
    const RealDate = Date, nowFn = globalThis.__rbNow;
    function FakeDate(...a) { if (!new.target) return new RealDate(nowFn()).toString(); return Reflect.construct(RealDate, a.length ? a : [nowFn()], new.target); }
    FakeDate.prototype = RealDate.prototype; FakeDate.now = () => Math.floor(nowFn()); FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
    Object.defineProperty(RealDate.prototype, 'constructor', { value: FakeDate, writable: true, configurable: true });
    globalThis.Date = FakeDate;
    ${opts.allowRandom ? '' : "Math.random = function random() { throw new Error('Math.random is banned in Inkwoven: use U.rng (DESIGN section 2)'); };"}
    ${opts.failStorage === 'access' ? `Object.defineProperty(globalThis, 'localStorage', { get() { throw new DOMException("Failed to read the 'localStorage' property from 'Window': Access is denied for this document.", 'SecurityError'); }, configurable: true, enumerable: true });` : ''}
  })();`, ctx, { filename: 'rb-bootstrap' });
  delete g.__rbNow;
  const pageGlobal = vm.runInContext('globalThis', ctx);
  env.winTarget._self = pageGlobal;
  env.U8C = vm.runInContext('Uint8ClampedArray', ctx);
  env.F32 = vm.runInContext('Float32Array', ctx);

  // -- evaluate each script in its own guarded step
  const errors = [], loaded = [];
  const strict = opts.strict !== false;
  for (const f of plan.files) {
    const full = path.join(dir, f);
    if (!fs.existsSync(full)) continue;
    const implicit = !plan.explicit.has(f);
    const rec = (kind, e) => {
      const stack = String((e && e.stack) || e);
      const m = new RegExp(kind === 'syntax' ? '^' + full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)' : full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+):\\d+').exec(stack);
      errors.push({ file: f, kind, message: String((e && e.message) || e), line: m ? +m[1] : 0, stack, implicit });
    };
    let script;
    try { script = new vm.Script((strict ? '"use strict";' : '') + fs.readFileSync(full, 'utf8'), { filename: full }); } catch (e) { rec('syntax', e); continue; }
    env.currentFile = f; env.loading = true; env.document.readyState = 'loading';
    try { script.runInContext(ctx, { timeout: opts.loadTimeout || 10000 }); loaded.push(f); } catch (e) { rec('runtime', e); } finally { env.loading = false; env.currentFile = null; env.document.readyState = 'complete'; }
  }
  const fatal = errors.filter((e) => !e.implicit);
  const warnings = errors.filter((e) => e.implicit);
  errors.length = 0; errors.push(...fatal);                          // api._errors: only files the suite asked for
  for (const e of warnings) {
    const key = e.file + '|' + e.message;
    if (!warnedImplicit.has(key)) { warnedImplicit.add(key); process.stderr.write(`boot: skipped ${e.file}${e.line ? ':' + e.line : ''}, it is broken (${e.kind}: ${e.message}); it was only pulled in as a dependency. Fix it, or list it in {skip:[...]} to silence this.\n`); }
  }
  if (fatal.length && !opts.continue) throw new BootError(fatal);

  const ns = vm.runInContext('({' + NAMES.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(',') + '})', ctx);
  const api = Object.assign({}, ns);
  const D = () => env.document;
  const pick = (t) => {
    if (typeof t !== 'string') return t;
    const el = D().querySelector(t);
    if (!el) throw new Error(`no element matches "${t}"`);
    return el;
  };
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const settle = async () => { await new Promise((r) => setImmediate(r)); };
  const fire = (el, ev) => el.dispatchEvent(ev);
  const focusables = () => {
    const arr = [];
    const walk = (x) => { for (const k of x.childNodes) if (k.nodeType === 1) { if (env.isFocusable(k) && k.tabIndex >= 0) arr.push(k); walk(k); } };
    walk(env.document);
    return arr.filter((e) => e.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex).concat(arr.filter((e) => e.tabIndex === 0));
  };
  const nextFocus = (shift) => {
    const pos = focusables();
    if (!pos.length) return null;
    const i = pos.indexOf(env.active);
    return pos[(i < 0 ? (shift ? pos.length - 1 : 0) : (i + (shift ? -1 : 1) + pos.length) % pos.length)];
  };
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({
    _env: env, _win: pageGlobal, _doc: env.document, _store: env.store, _counts: env.counts, _els: env.els, _errors: errors, _loaded: loaded, _missing: plan.missing, _skipped: plan.listed.filter((f) => !plan.files.includes(f)),
    _warnings: warnings, _issues: env.issues, _console: env.console, _audio: env.audio, _seed: opts.seed, _uncaught: env.uncaught, _navigations: env.navigations, _vibrations: env.vibrations,
    get _ctx() { const v = env.document.querySelector('#view'); return v ? v.getContext('2d') : null; },
    get _timers() { return env.timers; },
    get _reloads() { return env.reloads; },
    get _clipboard() { return env.clipboard; },
    get _byId() { return new Proxy({}, { get: (t, id) => (typeof id === 'string' ? env.document.getElementById(id) : undefined) }); },
    _run: (code) => vm.runInContext(String(code), ctx, { filename: 'rb-run' }),
    _resetCounts() { for (const k of Object.keys(env.counts)) delete env.counts[k]; env.issues.length = 0; },
    // ---- time
    _now: () => env.now,
    _flush(ms) {
      if (ms != null) { env.advanceTo(env.now + ms); return; }
      for (let n = 0; n < 1000; n++) {
        const one = env.timers.filter((t) => !t.every);
        if (!one.length) return;
        env.advanceTo(Math.max(...one.map((t) => t.at)));
      }
      throw new Error('_flush(): pending timeouts keep rescheduling themselves');
    },
    _raf(ms = 16) { return env.runFrame(ms); },
    _frames(n, dt = 16) { let ran = 0; for (let i = 0; i < n; i++) ran += env.runFrame(dt); return ran; },
    _advance(ms, step = 16) { env.advanceTo(env.now); let left = ms; while (left > 0) { const d = Math.min(step, left); env.runFrame(d); left -= d; } },
    _settle: settle,
    async _tick(ms, step = 16) { await settle(); env.advanceTo(env.now); let left = ms; while (left > 0) { const d = Math.min(step, left); env.runFrame(d); await settle(); left -= d; } },
    async _until(pred, o = {}) {
      const limit = o.ms == null ? 20000 : o.ms, step = o.step || 16;
      await settle();
      for (let t = 0; t <= limit; t += step) { if (pred()) return true; env.runFrame(step); await settle(); }
      if (pred()) return true;
      throw new Error(`_until: condition still false after ${limit} virtual ms`);
    },
    // ---- input
    _click(target, o = {}) {
      const el = pick(target);
      if (el.disabled === true) return false;
      const p = centre(el), ptype = o.pointerType || 'mouse';
      const init = { bubbles: true, cancelable: true, clientX: o.x == null ? p.x : o.x, clientY: o.y == null ? p.y : o.y, pointerType: ptype, button: 0, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt, metaKey: !!o.meta };
      fire(el, new env.ev.PointerEvent('pointerover', init)); fire(el, new env.ev.MouseEvent('mouseover', init));
      const down = fire(el, new env.ev.PointerEvent('pointerdown', { ...init, buttons: 1 })); const mdown = fire(el, new env.ev.MouseEvent('mousedown', { ...init, buttons: 1 }));
      if (down && mdown) { let f = el; while (f && !env.isFocusable(f)) f = f.parentNode && f.parentNode.nodeType === 1 ? f.parentNode : null; if (f) f.focus(); else if (env.active) env.active.blur(); }
      fire(el, new env.ev.PointerEvent('pointerup', init)); fire(el, new env.ev.MouseEvent('mouseup', init));
      if (el.localName === 'input' && el.type === 'checkbox') el.checked = !el.checked;
      if (el.localName === 'input' && el.type === 'radio') el.checked = true;
      const ok = fire(el, new env.ev.MouseEvent('click', { ...init, detail: 1 }));
      if (ok && el.localName === 'input' && /^(checkbox|radio)$/.test(el.type)) { fire(el, new env.ev.InputEvent('input', { bubbles: true })); fire(el, new env.ev.Event('change', { bubbles: true })); }
      return true;
    },
    _pointer(type, target, o = {}) {
      const el = pick(target);
      const t = /^pointer|^mouse|^touch/.test(type) ? type : 'pointer' + type;
      const id = o.id == null ? 1 : o.id;
      const dest = t !== 'pointerdown' && env.pointerCapture[id] ? env.pointerCapture[id] : el;
      const p = centre(el);
      const ev = new env.ev.PointerEvent(t, { bubbles: !/enter$|leave$/.test(t), cancelable: !/enter$|leave$|cancel$/.test(t), clientX: o.x == null ? p.x : o.x, clientY: o.y == null ? p.y : o.y, pointerId: id, pointerType: o.pointerType || 'mouse', button: o.button || 0, buttons: o.buttons == null ? (t === 'pointerup' || t === 'pointercancel' ? 0 : 1) : o.buttons, ctrlKey: !!o.ctrl, shiftKey: !!o.shift });
      fire(dest, ev);
      if (t === 'pointerup' || t === 'pointercancel') delete env.pointerCapture[id];
      return ev;
    },
    _drag(target, from, to, steps = 8, o = {}) {
      const el = pick(target), id = o.id == null ? 1 : o.id;
      const at = (x, y, buttons) => ({ x, y, id, buttons, pointerType: o.pointerType || 'mouse' });
      api._pointer('pointerdown', el, at(from[0], from[1], 1));
      for (let i = 1; i <= steps; i++) api._pointer('pointermove', el, at(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, 1));
      api._pointer('pointerup', el, at(to[0], to[1], 0));
    },
    _key(key, o = {}) {
      const target = o.target ? pick(o.target) : (env.active && env.active.isConnected ? env.active : env.document.body);
      const base = { bubbles: true, cancelable: true, key, code: o.code || keyCodeName(key), keyCode: keyCode(key), ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt, metaKey: !!o.meta, repeat: !!o.repeat };
      const type = o.type || 'press';
      let ok = true;
      if (type === 'down' || type === 'press') {
        ok = fire(target, new env.ev.KeyboardEvent('keydown', base));
        if (ok && key === 'Enter' && (target.localName === 'button' || (target.localName === 'a' && target.hasAttribute('href')) || (target.localName === 'input' && /^(button|submit|checkbox)$/.test(target.type)))) target.click();
        if (ok && key === 'Tab') { const n = nextFocus(!!o.shift); if (n) n.focus(); }
      }
      if (type === 'up' || type === 'press') {
        const upOk = fire(target, new env.ev.KeyboardEvent('keyup', base));
        if (upOk && ok && key === ' ' && (target.localName === 'button' || (target.localName === 'input' && /^(button|submit|checkbox)$/.test(target.type)))) target.click();
      }
      return ok;
    },
    _tab(shift = false) { const n = nextFocus(shift); if (n) n.focus(); return n; },
    _input(target, value) {
      const el = pick(target);
      el.value = value;
      fire(el, new env.ev.InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertText' }));
      fire(el, new env.ev.Event('change', { bubbles: true }));
    },
    _fire(type, data) {
      const d = data || {};
      const E = /^key/.test(type) ? env.ev.KeyboardEvent : /^pointer/.test(type) ? env.ev.PointerEvent : /^(mouse|click|dblclick|contextmenu)/.test(type) ? env.ev.MouseEvent : /^wheel/.test(type) ? env.ev.WheelEvent : /^(focus|blur)/.test(type) ? env.ev.FocusEvent : env.ev.Event;
      const ev = new E(type, { bubbles: true, cancelable: true, ...d });
      for (const k of Object.keys(d)) if (!(k in ev) || ev[k] === undefined) ev[k] = d[k];
      env.document.dispatchEvent(ev);
      return ev;
    },
    // ---- environment
    _resize(w, h) {
      env.viewport.w = w; env.viewport.h = h;
      Object.assign(g, { innerWidth: w, innerHeight: h, outerWidth: w, outerHeight: h });
      env.winTarget.dispatchEvent(new env.ev.Event('resize')); env.visualViewport.dispatchEvent(new env.ev.Event('resize'));
      for (const m of env.mqls) { const now = m.matches; if (now !== m._last) { m._last = now; const ev = new env.ev.Event('change'); ev.matches = now; ev.media = m.media; m.dispatchEvent(ev); } }
    },
    _media: (q, v) => env.setMedia(q, v),
    _hide() { env.document.hidden = true; env.document.visibilityState = 'hidden'; env.document.dispatchEvent(new env.ev.Event('visibilitychange', { bubbles: true })); },
    _show() { env.document.hidden = false; env.document.visibilityState = 'visible'; env.document.dispatchEvent(new env.ev.Event('visibilitychange', { bubbles: true })); },
    _listeners: (t) => env.document._count(t) + env.winTarget._count(t),
    _triggerResize: (el, size) => env.triggerResize(pick(el), size),
    _triggerIntersect: (el, ratio) => env.triggerIntersect(pick(el), ratio),
  }));
  if (opts.autoboot) { env.document.dispatchEvent(new env.ev.Event('DOMContentLoaded', { bubbles: true })); env.winTarget.dispatchEvent(new env.ev.Event('load')); }
  return api;
}
