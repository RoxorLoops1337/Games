#!/usr/bin/env node
// Graftwork profiling harness (repeatable). Loads the game from a local static server in real Chromium at phone size
// (1000x462, DPR 2, touch), applies CDP CPU throttling (4x and 6x) and, for the load scenarios, Slow 4G, drives each
// scenario and records frame time p50/p95/p99, dropped frames, long tasks, JS heap, a GPU/raster cost proxy from a devtools
// trace, decoded image memory, canvas backing-store memory, canvas ops per frame (separate unthrottled pass, so the op
// wrappers never disturb the timings) and the load metrics (bytes transferred, time to first interactive title, time to Ward ready).
//
//   node tools/graftwork_profile.mjs                       all scenarios, throttle 4 and 6, writes graftwork/design/PERF_RESULT.json
//   node tools/graftwork_profile.mjs --out graftwork/design/PERF_BASELINE.json --label baseline
//   node tools/graftwork_profile.mjs --scenarios title_idle,combat3 --throttle 4 --quick
//   node tools/graftwork_profile.mjs --soak 40             leak soak: 40 combat/Ward cycles, heap after GC, canvases, listeners
//   node tools/graftwork_profile.mjs --list
//
// Notes: headless Chromium has no real GPU (SwiftShader), so "gpu" numbers are a PROXY (trace time in GPU/raster tasks), good for
// before/after, not absolute. Frame deltas are measured between game ticks (the wrapped app.tick), so a deliberate 30 fps cap shows
// as 33 ms deltas: the report keeps `fps` (ticks per second) next to the percentiles. Needs the repo's playwright + chromium.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let ROOT = REPO;
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
if (args.includes('--root')) ROOT = path.resolve(args[args.indexOf('--root') + 1]); // serve another copy of the repo (a baseline snapshot)
const QUICK = !!opt('quick', false);
const THROTTLES = String(opt('throttle', '4,6')).split(',').map(Number).filter(Boolean);
const OUT = opt('out', 'graftwork/design/PERF_RESULT.json');
const LABEL = opt('label', 'run');
const GRAPHICS = String(opt('graphics', 'default')); // auto | high | low | default (leave the game's own default)
const VIEW = { width: 1000, height: 462 };
const DPR = Number(opt('dpr', 2));
const SLOW4G = { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 };
const S = (ms) => (QUICK ? Math.max(1500, ms / 3) : ms); // scenario durations in ms, a third of them with --quick

// ---------------------------------------------------------------- static server (gzip for text like the CDN)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const gz = new Map();
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      const ext = path.extname(f), ct = MIME[ext] || 'application/octet-stream';
      const text = /\.(html|js|mjs|json|css|svg)$/.test(ext);
      const h = { 'Content-Type': ct, 'Cache-Control': 'public, max-age=0, must-revalidate' };
      // honour the repo's _headers immutable rules so cache behaviour matches production
      // --cache-headers: the _headers rule for painted art (fresh 10 min, then served stale while it revalidates); the default mimics Cloudflare Pages (ETag revalidation)
      if (/^\/graftwork\/assets\//.test(p) && !/manifest\.json$/.test(p) && HEADERS.cacheArt) h['Cache-Control'] = 'public, max-age=600, stale-while-revalidate=86400';
      let buf = fs.readFileSync(f);
      const etag = '"' + buf.length + '-' + fs.statSync(f).mtimeMs.toString(36) + '"'; h.ETag = etag;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
      if (text && /gzip/.test(req.headers['accept-encoding'] || '')) { let z = gz.get(f); if (!z) { z = zlib.gzipSync(buf, { level: 6 }); gz.set(f, z); } buf = z; h['Content-Encoding'] = 'gzip'; }
      h['Content-Length'] = buf.length;
      res.writeHead(200, h); res.end(buf);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const HEADERS = { cacheArt: false };

// ---------------------------------------------------------------- page instrumentation
const INIT = `(() => {
  const P = window.__pf = { ticks: [], tickMs: [], long: [], ops: null, opsOn: false, canv: [], t0: performance.now(), firstTick: 0, titleTick: 0, kitTick: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  // canvases: weak registry so backing-store memory can be summed later
  const reg = (c) => { try { P.canv.push(new WeakRef(c)); P.who.set(c, (new Error().stack || '').split('\\n').slice(2, 5).map((l) => l.replace(/^.*graftwork\\//, '').replace(/\\)$/, '')).join(' < ')); } catch (e) {} return c; };
  P.who = new WeakMap();
  const ce = document.createElement.bind(document);
  document.createElement = function (n, o) { const el = ce(n, o); if (String(n).toLowerCase() === 'canvas') reg(el); return el; };
  if (window.OffscreenCanvas) { const OC = window.OffscreenCanvas; window.OffscreenCanvas = class extends OC { constructor(w, h) { super(w, h); reg(this); } }; }
  // canvas 2D op counters (only switched on in the ops pass)
  const C = CanvasRenderingContext2D.prototype, cnt = { calls: 0, draw: 0, grad: 0, text: 0, measure: 0, getImage: 0, shadow: 0, filter: 0, path: 0, state: 0, putImage: 0 };
  P.cnt = cnt;
  const GROUP = { drawImage: 'draw', createLinearGradient: 'grad', createRadialGradient: 'grad', createConicGradient: 'grad', fillText: 'text', strokeText: 'text', measureText: 'measure', getImageData: 'getImage', putImageData: 'putImage', save: 'state', restore: 'state', stroke: 'path', fill: 'path', clip: 'path' };
  for (const k of Object.getOwnPropertyNames(C)) {
    const d = Object.getOwnPropertyDescriptor(C, k);
    if (d && typeof d.value === 'function' && k !== 'constructor') {
      const f = d.value, g = GROUP[k];
      C[k] = function () { if (P.opsOn) { cnt.calls++; if (g) cnt[g]++; } return f.apply(this, arguments); };
    }
  }
  for (const k of ['shadowBlur', 'filter']) {
    const d = Object.getOwnPropertyDescriptor(C, k);
    if (d && d.set) Object.defineProperty(C, k, { get: d.get, set(v) { if (P.opsOn && v && v !== 'none' && v !== 0) cnt[k === 'filter' ? 'filter' : 'shadow']++; d.set.call(this, v); }, configurable: true });
  }
  const hook = () => {
    const gw = window.__gw; if (!gw || !gw.app || P.hooked) return !!P.hooked;
    P.hooked = true; const app = gw.app, tick = app.tick; P.opsFrames = [];
    app.tick = function (raw) {
      const s = performance.now();
      if (!P.firstTick) P.firstTick = s;
      for (const k in cnt) cnt[k] = 0;
      const r = tick.call(this, raw);
      const e = performance.now();
      P.ticks.push(s); P.tickMs.push(e - s);
      if (P.opsOn) P.opsFrames.push(Object.assign({}, cnt));
      if (P.ticks.length > 20000) { P.ticks.splice(0, 10000); P.tickMs.splice(0, 10000); }
      return r;
    };
    return true;
  };
  const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 5);
})();`;

// ---------------------------------------------------------------- in-page helpers (strings evaluated by name)
const PAGE = {
  // stats since mark
  mark: () => { const P = window.__pf; P.m = { i: P.ticks.length, long: P.long.length, t: performance.now(), heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; },
  collect: () => {
    const P = window.__pf, m = P.m, t = P.ticks.slice(m.i), ms = P.tickMs.slice(m.i), now = performance.now();
    const a = window.__gw.app; return { tier: a.perf ? a.perf.q.tier : null, drops: a.perf ? a.perf.q.drops : null, rises: a.perf ? a.perf.q.rises : null, dpr: a.dpr, backing: [a.canvas.width, a.canvas.height], ticksPerSec: null, t, ms, long: P.long.slice(m.long).filter((l) => l[0] >= m.t), dur: now - m.t, heap0: m.heap, heap1: performance.memory ? performance.memory.usedJSHeapSize : 0 };
  },
  mem: async () => {
    const P = window.__pf, out = { images: 0, imageBytes: 0, canvases: 0, canvasBytes: 0, bigCanvas: [] };
    try {
      const { assets } = await import('/graftwork/ui/assets.js');
      for (const [k, e] of assets.imgs) if (e.ok && e.img) { const w = e.img.naturalWidth || e.img.width || 0, h = e.img.naturalHeight || e.img.height || 0; out.images++; out.imageBytes += w * h * 4; }
    } catch (e) { out.err = String(e); }
    const seen = new Set();
    for (const r of P.canv) { const c = r.deref(); if (!c || seen.has(c)) continue; seen.add(c); const b = c.width * c.height * 4; out.canvases++; out.canvasBytes += b; if (b > 1.5e6) out.bigCanvas.push([c.width, c.height, !!c.isConnected, P.who.get(c) || '']); }
    out.bigCanvas.sort((a, b) => b[0] * b[1] - a[0] * a[1]); out.bigCanvas = out.bigCanvas.slice(0, 8);
    return out;
  },
};

// ---------------------------------------------------------------- scenario drivers (run in node, talk to the page)
const SCENE_READY = () => !!window.__scene && ['kit', 'keyart', 'fallback'].includes(window.__scene.mode);
const SCENE_PAINTED = () => !!window.__scene && ['kit', 'keyart'].includes(window.__scene.mode);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function gwWait(page, expr, timeout = 60000) { // own poll loop: page.waitForFunction hung on string expressions under load
  if (opt('verbose', false)) console.log('    wait', String(expr).slice(0, 70));
  const end = Date.now() + timeout;
  for (;;) {
    let ok = false; try { ok = await (typeof expr === 'function' ? page.evaluate(expr) : page.evaluate(`!!(${expr})`)); } catch (e) { /* page busy or navigating */ }
    if (ok) return;
    if (Date.now() > end) { const st = await page.evaluate(() => ({ cur: window.__gw && window.__gw.app.current, frame: window.__gw && window.__gw.app.frame })).catch(() => null); throw new Error('wait failed: ' + String(expr).slice(0, 60) + ' ' + JSON.stringify(st)); }
    await wait(250);
  }
}

async function logical(page, x, y) { return page.evaluate(([x, y]) => { const a = window.__gw.app; return { x: a.offX + x * a.scale, y: a.offY + y * a.scale }; }, [x, y]); }
async function tap(page, x, y) { const p = await logical(page, x, y); await page.mouse.move(p.x, p.y); await page.mouse.down(); await wait(40); await page.mouse.up(); }
async function sweep(page, n = 6) { for (let i = 0; i < n; i++) { const p = await logical(page, 200 + i * 150, 220 + (i % 3) * 90); await page.mouse.move(p.x, p.y, { steps: 6 }); await wait(120); } }

const SC = {};
// 1. title idle: the painted scene alone, 10 s, no input after the intro was used up
SC.title_idle = { desc: 'title scene idle 10 s', async setup(page) { await gwWait(page, "window.__gw && window.__gw.app.current==='title'"); await page.evaluate(async () => { const { SCENE } = await import('/graftwork/ui/title.js'); window.__scene = SCENE; }); if (opt('verbose', false)) for (let i = 0; i < 6; i++) { console.log('    state', JSON.stringify(await page.evaluate(() => ({ f: window.__gw.app.frame, m: window.__scene.mode })))); await wait(2000); }
 await gwWait(page, SCENE_READY, 40000); await wait(S(3500)); }, async run(page) { await wait(S(10000)); } };
// 2. title intro: the needle sews the wordmark (first title of a page load)
SC.title_intro = { desc: 'title intro (3.6 s needle) + 3 s', fresh: true, async setup(page) { await gwWait(page, "window.__gw && window.__gw.app.current==='title'"); await page.evaluate(async () => { const m = await import('/graftwork/ui/title.js'); m.resetTitleIntro(); window.__gw.app.go('title', { intro: true }); }); }, async run(page) { await wait(S(6600)); } };

const WARD_SETUP = async () => {
  const RUN = await import('/graftwork/engine/run.js'), WD = await import('/graftwork/engine/ward.js');
  const { app, flow } = window.__gw;
  const run = RUN.newRun({ hero: 'marrow', seed: 'prof', mode: 'ward' });
  const w = run.ward;
  w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
  // a 12 room hospital: a corridor spine on row 2, rooms above and below
  const spec = [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_corridor', 2, 2], ['rm_ward', 3, 2], ['rm_corridor', 4, 2], ['rm_ward', 5, 2], ['rm_corridor', 6, 2], ['rm_theatre', 8, 2],
    ['rm_dispensary', 3, 1], ['rm_chapel', 5, 1], ['rm_workshop', 3, 3], ['rm_generator', 5, 3]];
  const ids = [];
  for (const [type, x, y] of spec) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
  const MON = ['gauze_mummy', 'bedpan_slime', 'crutchling', 'night_nurse'];
  for (const id of [ids[3], ids[5]]) for (let k = 0; k < 3; k++) w.rooms[id].contents.push({ kind: 'monster', id: MON[(k + id.length) % 4] });
  w.hero.room = ids[0]; WD.wardPower(run);
  app.shared.run = run; flow.route();
  window.__ward = { ids };
};
SC.ward12 = { desc: 'Ward map, 12 rooms, hero walking, monsters wandering', async setup(page) { await gwWait(page, "window.__gw && window.__gw.app.current==='title'"); await page.evaluate(WARD_SETUP); const t0 = Date.now(); await gwWait(page, "window.__gw.app.current==='ward'"); await page.evaluate(async () => { const { assets } = await import('/graftwork/ui/assets.js'), ISO = await import('/graftwork/ui/ward_iso.js'); const t = performance.now(), allKit = () => { const k = ISO.lastKit(); return !!k && k.rooms.size >= Object.keys(window.__gw.app.shared.run.ward.rooms).length; }; /* every built room is drawn from the kit */ window.__wardReady = new Promise((res) => { const iv = setInterval(() => { if (assets.ready() && allKit()) { clearInterval(iv); res(performance.now() - t); } }, 50); setTimeout(() => { clearInterval(iv); res(-1); }, 90000); }); }); this.readyMs = await page.evaluate(() => window.__wardReady); await wait(S(1500)); },
  async run(page) { const end = Date.now() + S(10000); let i = 0; while (Date.now() < end) { await page.evaluate(async (i) => { const ward = (await import('/graftwork/ui/ward.js')).default, ids = window.__ward.ids, app = window.__gw.app; const run = app.shared.run; if (!run.ward.walk) ward.walkTo(app, ids[i % 2 ? 0 : 2], 0); }, i++); await wait(1400); } } };

const COMBAT_SETUP = async () => {
  const RUN = await import('/graftwork/engine/run.js');
  const { app, flow } = window.__gw;
  const run = RUN.newRun({ hero: 'marrow', seed: 'prof2' });
  run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime', 'gauze_mummy', 'crutchling'] };
  app.shared.run = run; flow.route();
};
const COMBAT_STEP = async () => {
  const combat = (await import('/graftwork/ui/combat.js')).default, ENG = await import('/graftwork/engine/combat.js');
  const app = window.__gw.app; if (app.current !== 'combat') return { done: true };
  const a = combat.api(), c = a.c, L = (x, y) => ({ x: app.offX + x * app.scale, y: app.offY + y * app.scale });
  if (a.busy || a.ending || a.pending) return { wait: true, turn: c.turn };
  if (c.over) return { wait: true, over: true };
  let hi = -1; for (let i = 0; i < c.hand.length; i++) { const ck = ENG.canPlay(c, i); if (ck.ok) { hi = i; break; } }
  if (hi < 0) { const e = a.endTurn; return { click: [L(e.x, e.y)], turn: c.turn, ended: true }; }
  const hp = a.handPos(hi), tgt = ENG.needsTarget(c, hi), live = c.enemies.findIndex((e) => !e.dead);
  const clicks = [L(hp.x, hp.y)]; if (tgt) { const ep = a.enemyPos(live); clicks.push(L(ep.x, ep.y)); } else clicks.push(L(520, 200));
  return { click: clicks, turn: c.turn };
};
SC.combat3 = { desc: 'combat, 3 enemies, one full turn then idle', async setup(page) { await gwWait(page, "window.__gw && window.__gw.app.current==='title'"); await page.evaluate(COMBAT_SETUP); await gwWait(page, "window.__gw.app.current==='combat'"); await wait(S(3500)); },
  async run(page) { const end = Date.now() + S(14000); let endedTurn = -1; while (Date.now() < end) { const st = await page.evaluate(COMBAT_STEP); if (st.done) break; if (st.click) { for (const c of st.click) { await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.down(); await wait(30); await page.mouse.up(); await wait(150); } if (st.ended) endedTurn = st.turn; } else await wait(120); } } };

const SCREEN_RUN = async (kind) => {
  const RUN = await import('/graftwork/engine/run.js'), { app, flow } = window.__gw;
  const run = RUN.newRun({ hero: 'marrow', seed: 'prof3-' + kind });
  app.shared.run = run;
  if (kind === 'reward') { run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'elite', enemies: ['bedpan_slime'] }; RUN.resolveFight(run, { win: true, shattered: [], damageTaken: 0, turns: 3 }); }
  else if (kind === 'graft') RUN.startGraftPick(run);
  else if (kind === 'shop') { run.gold = 400; run.phase = 'shop'; run.pending = RUN.makeShop(run); }
  flow.route();
};
for (const k of ['reward', 'graft', 'shop']) SC[k] = { desc: k + ' screen with pointer sweeps', async setup(page) { await gwWait(page, "window.__gw && window.__gw.app.current==='title'"); await page.evaluate(SCREEN_RUN, k); await wait(S(2500)); }, async run(page) { const end = Date.now() + S(8000); while (Date.now() < end) await sweep(page, 3); } };
SC.deck40 = { desc: 'deck view with 40 cards, scrolling', async setup(page) { await gwWait(page, "window.__gw && window.__gw.app.current==='title'"); await page.evaluate(async () => { const RUN = await import('/graftwork/engine/run.js'), { CARD_LIST } = await import('/graftwork/data/index.js'); const { app, flow } = window.__gw; const run = RUN.newRun({ hero: 'marrow', seed: 'prof4' }); const pool = CARD_LIST.filter((c) => c.hero === 'marrow' && c.rarity !== 'starter' && c.type !== 'junk'); let i = 0; while (run.deck.length < 40) { run.deck.push({ uid: RUN.nextUid(run), id: pool[i++ % pool.length].id, grafts: [], fused: [], up: false }); } app.shared.run = run; flow.route(); flow.openDeck(); }); await wait(S(2500)); },
  async run(page) { const end = Date.now() + S(8000); let d = 1; while (Date.now() < end) { const p = await logical(page, 640, 360); await page.mouse.move(p.x, p.y); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120 * d); await wait(90); } d = -d; } } };

// ---------------------------------------------------------------- measuring
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const r1 = (x) => Math.round(x * 10) / 10;
function frameStats(c) {
  const d = []; for (let i = 1; i < c.t.length; i++) d.push(c.t[i] - c.t[i - 1]);
  const vs = 1000 / 60;
  let dropped = 0; for (const x of d) if (x > vs * 1.5) dropped += Math.round(x / vs) - 1;
  const total = c.t.length ? (c.t[c.t.length - 1] - c.t[0]) : 0;
  return {
    ticks: c.t.length, fps: total > 0 ? r1((c.t.length - 1) / (total / 1000)) : 0,
    frame_p50: r1(pct(d, 50)), frame_p95: r1(pct(d, 95)), frame_p99: r1(pct(d, 99)), frame_max: r1(Math.max(0, ...d)),
    dropped_frames: dropped, dropped_pct: d.length ? r1((dropped / (d.length + dropped)) * 100) : 0,
    js_p50: r1(pct(c.ms, 50)), js_p95: r1(pct(c.ms, 95)), js_p99: r1(pct(c.ms, 99)),
    long_tasks: c.long.length, long_task_ms: r1(c.long.reduce((s, l) => s + l[1], 0)), long_task_max: r1(Math.max(0, ...c.long.map((l) => l[1]))),
    heap_mb: r1(c.heap1 / 1048576), heap_delta_mb: r1((c.heap1 - c.heap0) / 1048576),
  };
}
const TRACE_NAMES = ['GPUTask', 'RasterTask', 'ImageDecodeTask', 'Decode Image', 'Decode LazyPixelRef', 'Paint', 'PrePaint', 'Layerize', 'UpdateLayer', 'CompositeLayers', 'Commit', 'FunctionCall', 'v8.run', 'EvaluateScript', 'MinorGC', 'MajorGC', 'V8.GC_MC_BACKGROUND_MARKING', 'RunTask', 'ThreadControllerImpl::RunTask', 'TileManager::ScheduledTasks', 'DrawFrame', 'BeginMainThreadFrame', 'FrameView::UpdateAllLifecyclePhases'];
function traceSummary(events, from, to) {
  const sum = {}, cnt = {};
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur || e.ts < from || e.ts > to) continue;
    if (!TRACE_NAMES.includes(e.name)) continue;
    sum[e.name] = (sum[e.name] || 0) + e.dur / 1000; cnt[e.name] = (cnt[e.name] || 0) + 1;
  }
  const o = {}; for (const k of Object.keys(sum)) o[k] = { ms: r1(sum[k]), n: cnt[k] };
  const gpuMs = (sum.GPUTask || 0) + (sum.RasterTask || 0) + (sum.ImageDecodeTask || 0) + (sum['Decode Image'] || 0);
  return { gpu_proxy_ms: r1(gpuMs), detail: o };
}

async function newPage(browser, { cpu, net, ops = false, trace = false }) { // ops: 'cpu' also opens a CDP session for the sampling profiler
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript(INIT);
  if (opt('init', false)) await ctx.addInitScript(String(opt('init'))); // --init '<js>': extra page script (experiments)
  if (opt('flags', false)) await ctx.addInitScript(`window.__gwFlags = ${JSON.stringify(Object.fromEntries(String(opt('flags')).split(',').map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)])))};`); // --flags smooth=0,faceLod=0: A/B the round 2 levers (ui/perf_flags.js)
  if (GRAPHICS !== 'default') await ctx.addInitScript(`try { if (!localStorage.getItem('graftwork_meta_v1')) localStorage.setItem('graftwork_meta_v1', JSON.stringify({ v: 1, settings: { graphics: '${GRAPHICS}' } })); } catch (e) {}`);
  const page = await ctx.newPage();
  const cdp = (cpu > 1 || net || trace || ops === 'cpu') ? await ctx.newCDPSession(page) : null;
  if (net || trace) { await cdp.send('Network.enable'); if (net) await cdp.send('Network.emulateNetworkConditions', net); } // only the load runs count bytes
  if (cdp && cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const net_ = { bytes: 0, reqs: 0, images: 0, imageBytes: 0, byType: {} };
  const types = new Map();
  if (cdp) cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.response.mimeType));
  if (cdp) cdp.on('Network.loadingFinished', (e) => { net_.reqs++; net_.bytes += e.encodedDataLength; const t = types.get(e.requestId) || '?'; net_.byType[t] = (net_.byType[t] || 0) + e.encodedDataLength; if (/image/.test(t)) { net_.images++; net_.imageBytes += e.encodedDataLength; } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  return { ctx, page, cdp, net: net_, errs };
}

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + what)), ms))]);
// a fixed JS workload: how fast this machine is RIGHT NOW (the sandbox is shared, so runs are only comparable when calib_ms is similar)
async function calibrate(page) { return page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 3e7; i++) x = (x + i * 7) % 1000003; return performance.now() - t + (x < 0 ? 1 : 0); }); }
async function runOne(browser, base, name, cpu, mode) {
  try { return await withTimeout(runOne0(browser, base, name, cpu, mode), Number(opt('timeout', 240)) * 1000, name + ' ' + mode); } catch (e) { console.log('  ' + e.message); return { error: e.message }; }
}
async function runOne0(browser, base, name, cpu, mode) {
  const S_ = SC[name];
  const h = await newPage(browser, { cpu, ops: mode === 'cpu' ? 'cpu' : mode === 'ops', net: null });
  const { page } = h;
  await page.goto(base + '/graftwork/', { waitUntil: 'commit' });
  const V = (m) => { if (opt('verbose', false)) console.log('    step', m); };
  await S_.setup.call(S_, page); V('setup done');
  if (opt('settle', false)) await wait(Number(opt('settle'))); // let the Auto quality controller converge before the window starts
  const calib = await calibrate(page);
  V('calib ' + calib);
  const mem0 = await page.evaluate(PAGE.mem); V('mem0');
  await page.evaluate(PAGE.mark);
  if (mode === 'ops') await page.evaluate(() => { window.__pf.opsOn = true; window.__pf.opsFrames = []; });
  let tr = null, tFrom = 0;
  if (mode === 'trace') { await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'gpu', 'cc', 'viz', 'toplevel', 'v8.gc', 'blink'] }); }
  if (mode === 'cpu') { await h.cdp.send('Profiler.enable'); await h.cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await h.cdp.send('Profiler.start'); }
  await S_.run.call(S_, page); V('run done');
  let out;
  if (mode === 'ops') {
    const of = await page.evaluate(() => { window.__pf.opsOn = false; return window.__pf.opsFrames; });
    const keys = of.length ? Object.keys(of[0]) : [];
    out = { frames: of.length };
    for (const k of keys) { const a = of.map((f) => f[k]); out[k] = { mean: r1(a.reduce((s, x) => s + x, 0) / a.length), p95: pct(a, 95), max: Math.max(...a) }; }
  } else if (mode === 'cpu') {
    const { profile } = await h.cdp.send('Profiler.stop'); const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)); });
    const agg = new Map(); for (const [id, us] of self) { const n = byId.get(id), cf = n.callFrame, key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/graftwork\//, '')}:${cf.lineNumber + 1}`; agg.set(key, (agg.get(key) || 0) + us); }
    const tot = [...agg.values()].reduce((a, b) => a + b, 0);
    out = { total_ms: r1(tot / 1000), top: [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, us]) => [k, r1(us / 1000), r1((us / tot) * 100)]) };
  } else {
    const col = await page.evaluate(PAGE.collect);
    out = frameStats(col); out.tier = col.tier; out.tier_changes = col.drops === null ? null : [col.drops, col.rises]; out.dpr = col.dpr; out.backing = col.backing; out.graphics = GRAPHICS;
    out.mem = await page.evaluate(PAGE.mem);
    out.mem_before = mem0;
    if (opt('dump', false)) { try { out.dump = await page.evaluate(String(opt('dump'))); } catch (e) { out.dump = String(e); } } // --dump '<expr>': evaluated in the page after the window (experiments)
    if (mode === 'trace') {
      const buf = await browser.stopTracing(); const ev = JSON.parse(buf.toString()).traceEvents || [];
      const xs = ev.filter((e) => e.ph === 'X'); const from = Math.min(...xs.map((e) => e.ts)), to = Math.max(...xs.map((e) => e.ts + e.dur));
      out.trace = traceSummary(ev, from, to); out.trace.window_ms = r1((to - from) / 1000);
    }
  }
  out.calib_ms = r1(calib); out.loadavg1 = r1(os.loadavg()[0]);
  if (S_.readyMs !== undefined) out.ready_ms = r1(S_.readyMs);
  out.errors = h.errs;
  await h.ctx.close();
  return out;
}

// load metrics: cold cache, Slow 4G, CPU throttled. Time to the first interactive title (first tick with the title buttons live) and to the Ward ready.
async function loadMetrics(browser, base, cpu) {
  const h = await newPage(browser, { cpu, net: SLOW4G });
  const { page, cdp } = h;
  const t0 = Date.now();
  await page.goto(base + '/graftwork/', { waitUntil: 'commit' });
  await gwWait(page, "window.__pf && window.__pf.firstTick > 0", 240000);
  const first = await page.evaluate(() => window.__pf.firstTick), tFirst = Date.now() - t0;
  const bytesAtTitle = h.net.bytes;
  // title interactive: the title screen drew a frame with registered buttons
  await gwWait(page, "window.__gw.app.current==='title' && window.__gw.app.frame>3");
  const tInteractive = Date.now() - t0;
  // painted title scene (kit/keyart mode) = visually complete
  await page.evaluate(async () => { const { SCENE } = await import('/graftwork/ui/title.js'); window.__scene = SCENE; });
  let sceneMs = -1;
  try { await gwWait(page, SCENE_PAINTED, 240000); sceneMs = Date.now() - t0; } catch (e) { /* stays -1 */ }
  const bytesAtScene = h.net.bytes;
  await page.evaluate(WARD_SETUP);
  const tw0 = Date.now();
  await gwWait(page, "window.__gw.app.current==='ward'");
  let wardMs = -1;
  try { await gwWait(page, "(async()=>1)() && window.__wardOk===true", 1).catch(() => {}); } catch (e) { /* ignore */ }
  await page.evaluate(async () => { const { assets } = await import('/graftwork/ui/assets.js'), ISO = await import('/graftwork/ui/ward_iso.js'); window.__wardOk = false; const iv = setInterval(() => { const k = ISO.lastKit(); if (assets.ready() && k && k.rooms.size >= Object.keys(window.__gw.app.shared.run.ward.rooms).length) { window.__wardOk = true; clearInterval(iv); } }, 50); }); // every built room is drawn from the kit
  try { await gwWait(page, 'window.__wardOk===true', 300000); wardMs = Date.now() - tw0; } catch (e) { /* stays -1 */ }
  await wait(1500);
  const cold = { bytes: h.net.bytes, reqs: h.net.reqs };
  // repeat visit: same browser cache, reload the page; title interactive and scene painted again, bytes and requests actually transferred
  const b0 = h.net.bytes, r0 = h.net.reqs, w0 = Date.now();
  await page.reload({ waitUntil: 'commit' });
  await gwWait(page, "window.__gw && window.__gw.app.current==='title' && window.__gw.app.frame>3", 240000);
  const warmInteractive = Date.now() - w0;
  await page.evaluate(async () => { const { SCENE } = await import('/graftwork/ui/title.js'); window.__scene = SCENE; });
  let warmScene = -1; try { await gwWait(page, SCENE_PAINTED, 240000); warmScene = Date.now() - w0; } catch (e) { /* -1 */ }
  await wait(1000);
  const warm = { t_title_interactive_ms: warmInteractive, t_title_scene_painted_ms: warmScene, bytes: h.net.bytes - b0, requests: h.net.reqs - r0 };
  const res = {
    warm_reload: warm,
    cpu, network: 'slow4g(1.6Mbps,150ms)', t_first_frame_ms: tFirst, t_title_interactive_ms: tInteractive, t_title_scene_painted_ms: sceneMs, t_ward_ready_after_enter_ms: wardMs,
    bytes_at_interactive: bytesAtTitle, bytes_at_scene: bytesAtScene, bytes_total: cold.bytes, requests: cold.reqs, image_requests: h.net.images, image_bytes: h.net.imageBytes, by_type: h.net.byType, calib_ms: r1(await calibrate(page)), loadavg1: r1(os.loadavg()[0]),
    mem: await page.evaluate(PAGE.mem), errors: h.errs,
  };
  await h.ctx.close();
  return res;
}

// leak soak: repeat combat <-> Ward cycles, force GC, watch heap / canvases / DOM counters
async function soak(browser, base, cycles) {
  const h = await newPage(browser, { cpu: 1, net: null, trace: true });
  const { page, cdp } = h;
  await page.goto(base + '/graftwork/', { waitUntil: 'commit' });
  await gwWait(page, "window.__gw && window.__gw.app.current==='title'");
  const sample = async (tag) => {
    await cdp.send('HeapProfiler.collectGarbage'); await wait(200); await cdp.send('HeapProfiler.collectGarbage');
    const heap = await page.evaluate(() => performance.memory.usedJSHeapSize);
    const dom = await cdp.send('Memory.getDOMCounters');
    const m = await page.evaluate(PAGE.mem);
    const live = await page.evaluate(() => { let n = 0, det = 0; for (const r of window.__pf.canv) { const c = r.deref(); if (c) { n++; if (c instanceof HTMLCanvasElement && !c.isConnected) det++; } } return { n, det }; });
    return { tag, heap_mb: r1(heap / 1048576), nodes: dom.nodes, listeners: dom.jsEventListeners, canvases_alive: live.n, detached_html_canvases: live.det, canvas_mb: r1(m.canvasBytes / 1048576), image_mb: r1(m.imageBytes / 1048576) };
  };
  const rows = [];
  await page.evaluate(WARD_SETUP);
  await wait(3000);
  rows.push(await sample('start'));
  for (let i = 1; i <= cycles; i++) {
    await page.evaluate(COMBAT_SETUP); await gwWait(page, "window.__gw.app.current==='combat'");
    const end = Date.now() + 5000; while (Date.now() < end) { const st = await page.evaluate(COMBAT_STEP); if (st.done) break; if (st.click) for (const c of st.click) { await page.mouse.move(c.x, c.y); await page.mouse.down(); await wait(20); await page.mouse.up(); await wait(100); } else await wait(80); }
    await page.evaluate(WARD_SETUP); await wait(1500);
    await page.evaluate(() => window.__gw.app.go('title')); await wait(1500);
    if (i % Math.max(1, Math.floor(cycles / 6)) === 0 || i === cycles) rows.push(await sample('cycle ' + i));
  }
  await h.ctx.close();
  const a = rows[1] || rows[0], b = rows[rows.length - 1];
  return { cycles, rows, heap_growth_mb: r1(b.heap_mb - a.heap_mb), canvas_growth_mb: r1(b.canvas_mb - a.canvas_mb), detached_canvases_end: b.detached_html_canvases, errors: h.errs };
}

// ---------------------------------------------------------------- main
async function main() {
  if (opt('list', false)) { for (const [k, v] of Object.entries(SC)) console.log(k.padEnd(14), v.desc); return; }
  if (opt('cache-headers', false)) HEADERS.cacheArt = true;
  if (opt('cpu', false)) { const { chromium } = require('playwright'); const srv0 = await serve(); const base0 = 'http://127.0.0.1:' + srv0.address().port; const br = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] }); for (const n of String(opt('cpu')).split(',')) { const r = await runOne(br, base0, n, Number(opt('throttle', 1)), 'cpu'); console.log('== ' + n + ' total ' + r.total_ms + ' ms'); for (const [k, ms, pc] of r.top || []) console.log(String(pc).padStart(5) + '%  ' + String(ms).padStart(8) + ' ms  ' + k); } await br.close(); srv0.close(); return; } // --cpu <scenarios>: self-time profile
  if (opt('serve', false)) { const sv = await serve(); console.log('http://127.0.0.1:' + sv.address().port + '/graftwork/'); return; } // just the static server (debugging)
  const { chromium } = require('playwright');
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  let prev = null; if (opt('merge', false) || String(opt('scenarios', '')) === 'none') { // --merge: keep what an earlier run wrote and replace only what this run measures
    try { prev = JSON.parse(fs.readFileSync(path.resolve(REPO, OUT), 'utf8')); } catch (e) { /* none */ } }
  const result = prev ? Object.assign(prev, { load: String(opt('scenarios', '')) === 'none' || !opt('noload', false) ? {} : prev.load || {} }) : { label: LABEL, date: new Date().toISOString(), viewport: VIEW, dpr: DPR, quick: QUICK, chromium: browser.version(), scenarios: {}, load: {}, soak: null };
  try {
    if (opt('soak', false)) { result.soak = await soak(browser, base, Number(opt('soak', 20))); console.log(JSON.stringify(result.soak, null, 1)); }
    else {
      const names = String(opt('scenarios', Object.keys(SC).join(','))).split(',').filter((n) => n !== 'none');
      if (!opt('noload', false)) for (const cpu of THROTTLES.slice(0, 2)) { process.stdout.write(`load cpu${cpu} ... `); result.load['cpu' + cpu] = await loadMetrics(browser, base, cpu); console.log(`interactive ${result.load['cpu' + cpu].t_title_interactive_ms} ms, ${(result.load['cpu' + cpu].bytes_total / 1048576).toFixed(1)} MB`); }
      for (const name of names) {
        if (!SC[name]) { console.error('unknown scenario', name); continue; }
        result.scenarios[name] = { desc: SC[name].desc };
        for (const cpu of THROTTLES) {
          process.stdout.write(`${name} cpu${cpu} ... `);
          const r = await runOne(browser, base, name, cpu, 'time');
          result.scenarios[name]['cpu' + cpu] = r;
          if (r.error) continue;
          console.log(`fps ${r.fps} p50 ${r.frame_p50} p95 ${r.frame_p95} p99 ${r.frame_p99} dropped ${r.dropped_pct}% js_p95 ${r.js_p95} long ${r.long_tasks} heap ${r.heap_mb}MB img ${(r.mem.imageBytes / 1048576).toFixed(0)}MB cv ${(r.mem.canvasBytes / 1048576).toFixed(0)}MB`);
        }
        if (!opt('notrace', false)) { process.stdout.write(`${name} trace ... `); const t = await runOne(browser, base, name, THROTTLES[0], 'trace'); result.scenarios[name].trace = t.trace || t; console.log('gpu proxy ' + (t.trace && t.trace.gpu_proxy_ms) + ' ms'); }
        process.stdout.write(`${name} ops ... `); const o = await runOne(browser, base, name, 1, 'ops'); result.scenarios[name].ops = o; if (!o.error) console.log(`calls/frame ${o.calls && o.calls.mean} draw ${o.draw && o.draw.mean} grad ${o.grad && o.grad.mean} text ${o.text && o.text.mean} measure ${o.measure && o.measure.mean}`);
      }
    }
  } finally { await browser.close(); srv.close(); }
  if (!opt('soak', false)) { fs.mkdirSync(path.dirname(path.resolve(REPO, OUT)), { recursive: true }); fs.writeFileSync(path.resolve(REPO, OUT), JSON.stringify(result, null, 1) + '\n'); console.log('wrote', OUT); }
  else if (opt('out', false)) fs.writeFileSync(path.resolve(REPO, OUT), JSON.stringify(result, null, 1) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
