// envtex.js : procedural textures (color + bump) for Ludus Maximus 3D. No image files.
// All generators are seeded + tileable (lattice noise wraps) and return { map, bump } textures (DataTexture: sRGB RGBA color, single channel R8 bump).
// The pixel loops live in envtex_gen.js (pure, no DOM) so they can run in a Worker (envtex_worker.js). Boot flow:
//   prepare(PLAN.hub(...)) at the top of main.js -> IndexedDB hit (repeat visits) or worker bake -> READY -> the synchronous make*Texture calls inside
//   createLudus / createArena / createBuildings find their bytes ready and only wrap them in a DataTexture. A miss (no worker, timeout, spec not in the plan)
//   falls back to the same generator on the calling thread, so output is identical either way. stats() counts hits and misses.
import * as THREE from 'three';
import { GEN_VERSION, specKey, generate, tnoise, tfbm } from './envtex_gen.js';
export { tnoise, tfbm };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------- quality: texture size per tier and device memory
// K scales the big tiles (>= 512 px): low phones 0.75 (a 1024 sand tile becomes 768: 3.8 MB instead of 6.7 MB on the GPU), <= 2 GB devices 0.56. Medium on <= 3 GB 0.75.
// ?texq=1 forces full size (pixel-diff checks). High and desktop are untouched.
const Q = { K: 1, tier: 'high', mem: 0 };
export function configure({ tier = 'high', deviceMemory, force } = {}) {
  const mem = deviceMemory === undefined ? (typeof navigator !== 'undefined' && navigator.deviceMemory) || 0 : deviceMemory;
  let k = tier === 'low' ? 0.75 : 1;
  if (tier === 'medium' && mem && mem <= 3) k = 0.75;
  if (tier === 'low' && mem && mem <= 2) k = 0.56;
  if (force) k = +force;
  Q.K = k; Q.tier = tier; Q.mem = mem; return Q.K;
}
export const quality = () => ({ K: Q.K, tier: Q.tier, mem: Q.mem });
const fit = (size) => (Q.K >= 1 || size < 512 ? size : Math.max(256, Math.round((size * Q.K) / 16) * 16));

// ---------------------------------------------------------------- spec builders (the make* functions and the PLAN use the same ones, so keys always agree)
const SP = {
  sand: (size = 1024, seed = 3) => ({ k: 'sand', size: fit(size), seed }),
  stone: (size = 512, { bx = 4, by = 6, base = 0xe8dcc0, tint = 0xb69a6a, seed = 11, mortar = 0x7a6a55 } = {}) => ({ k: 'stone', size: fit(size), bx, by, base, tint, seed, mortar }),
  marble: (size = 512, seed = 21) => ({ k: 'marble', size: fit(size), seed }),
  ground: (size = 512, seed = 33) => ({ k: 'ground', size: fit(size), seed }),
  cloth: (size = 256) => ({ k: 'cloth', size: fit(size) }),
  roof: (size = 256, seed = 5) => ({ k: 'roof', size: fit(size), seed }),
};
const HUB_STONE = { bx: 4, by: 6, base: 0xe3d3ad, tint: 0xb89a66, seed: 31 };
/** What each scene asks for, in the order it is needed (KEEP IN SYNC with the make* calls in env_ludus.js, buildings.js, hub.js, env_arena.js). A call missing here still works (sync fallback) but shows up in stats().miss. */
export const PLAN = {
  hub: () => [SP.sand(512, 4), SP.stone(512, HUB_STONE), SP.marble(512), SP.ground(512), SP.sand(512, 6), SP.roof(256), SP.cloth(256)],
  arena: () => [SP.sand(1024, 3), SP.stone(512, { bx: 4, by: 6, seed: 11 })],
  themes: () => [
    SP.stone(512, { bx: 2, by: 10, base: 0x9a6a3c, tint: 0x6a4222, mortar: 0x24120a, seed: 5 }), SP.marble(512, 21),
    SP.stone(512, { bx: 3, by: 5, base: 0xe6c88c, tint: 0xc89a58, mortar: 0x8a6a40, seed: 9 }), SP.stone(512, { bx: 4, by: 6, base: 0xe8eef8, tint: 0xaebcd4, mortar: 0x6a7890, seed: 13 }),
    SP.stone(512, { bx: 4, by: 6, base: 0x8a7870, tint: 0x4e3e3a, mortar: 0x2a1a18, seed: 17 })],
};

// ---------------------------------------------------------------- bytes ready for the synchronous make* calls
const READY = new Map();        // key -> { w, h, color: Uint8ClampedArray, bump: Uint8ClampedArray }
const PENDING = new Map();      // key -> Promise (in flight in the cache or a worker)
const ST = { hit: 0, miss: 0, idb: 0, worker: 0, workerMs: 0, syncMs: 0, fromCache: 0, total: 0, done: 0, idbMs: 0, mode: 'none', missKeys: [] };
export const stats = () => Object.assign({}, ST, { missKeys: ST.missKeys.slice() });
/** { done, total } of everything prepare() was asked for so far (boot progress bar) */
export const progress = () => ({ done: ST.done, total: ST.total });

// IndexedDB: raw bytes per spec, keyed by generator version + spec key (the spec carries the tier-scaled size, so tiers never collide)
let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const rq = indexedDB.open('lm3d_tex', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('tex'); };
      rq.onsuccess = () => res(rq.result); rq.onerror = rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
const ckey = (key) => GEN_VERSION + '|' + key;
async function idbGetMany(keys) {
  const db = await openDB(); if (!db || !keys.length) return new Map();
  return new Promise((res) => {
    const out = new Map();
    try {
      const tx = db.transaction('tex', 'readonly'), os = tx.objectStore('tex');
      for (const k of keys) { const rq = os.get(ckey(k)); rq.onsuccess = () => { const v = rq.result; if (v && v.color && v.bump && v.color.byteLength === v.w * v.h * 4 && v.bump.byteLength === v.w * v.h) out.set(k, v); }; }
      tx.oncomplete = tx.onerror = tx.onabort = () => res(out);
    } catch (e) { res(out); }
  });
}
let swept = false;
function idbPut(key, r) {
  const later = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 3000 }) : (f) => setTimeout(f, 200);
  later(async () => {
    try {
      const db = await openDB(); if (!db) return;
      const tx = db.transaction('tex', 'readwrite'), os = tx.objectStore('tex');
      os.put({ w: r.w, h: r.h, color: r.color.buffer.slice(0), bump: r.bump.buffer.slice(0) }, ckey(key));
      if (!swept) { swept = true; const cur = os.openKeyCursor(); cur.onsuccess = () => { const c = cur.result; if (!c) return; if (!String(c.key).startsWith(GEN_VERSION + '|')) os.delete(c.key); c.continue(); }; }   // old generator versions
    } catch (e) { /* quota or blocked: the cache is optional */ }
  });
}

// worker pool (module workers: Chrome 80, Safari 15, Firefox 114; anything else just takes the synchronous path)
const COST = { sand: 1, stone: 1, marble: 0.7, ground: 0.65, roof: 0.7, cloth: 0.15 };   // rough relative bake cost per pixel
const POOL = { workers: [], idle: [], q: [], jobs: new Map(), id: 0, dead: false, max: 0 };
function poolStart() {
  if (POOL.workers.length || POOL.dead) return !POOL.dead;
  try {
    if (typeof Worker === 'undefined') { POOL.dead = true; return false; }
    const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
    POOL.max = Math.max(1, Math.min(3, hc - 1));   // main thread + GPU process keep a core each
    for (let i = 0; i < POOL.max; i++) {
      const w = new Worker(new URL('./envtex_worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const m = e.data, j = POOL.jobs.get(m.id); POOL.jobs.delete(m.id); POOL.idle.push(w);
        if (j) { if (m.err) j.res(null); else { ST.workerMs += m.ms || 0; j.res({ w: m.w, h: m.h, color: new Uint8ClampedArray(m.color), bump: new Uint8ClampedArray(m.bump) }); } }
        poolPump();
      };
      w.onerror = () => { POOL.dead = true; for (const [, j] of POOL.jobs) j.res(null); POOL.jobs.clear(); for (const j of POOL.q.splice(0)) j.res(null); try { for (const x of POOL.workers) x.terminate(); } catch (er) { /* gone */ } POOL.workers.length = POOL.idle.length = 0; };
      POOL.workers.push(w); POOL.idle.push(w);
    }
    return true;
  } catch (e) { POOL.dead = true; return false; }
}
function poolPump() {
  while (POOL.q.length && POOL.idle.length && !POOL.dead) {
    const j = POOL.q.shift(); if (j.ctl && j.ctl.cancelled) { j.res(null); continue; }   // the cache answered first
    const w = POOL.idle.pop(), id = ++POOL.id; POOL.jobs.set(id, j);
    try { w.postMessage({ id, spec: j.spec }); } catch (e) { POOL.jobs.delete(id); POOL.idle.push(w); j.res(null); }
  }
}
function bake(spec, ctl) {
  return new Promise((res) => {
    if (!poolStart()) return res(null);
    const j = { spec, res, ctl }; const pr = spec._prio || 0; delete spec._prio;
    // lower prio first; inside a prio the biggest job first (longest-processing-time-first keeps the workers' finish times close)
    j.pr = pr; j.cost = spec.size * spec.size * (COST[spec.k] || 1);
    let i = POOL.q.length; while (i > 0 && ((POOL.q[i - 1].pr || 0) > pr || ((POOL.q[i - 1].pr || 0) === pr && POOL.q[i - 1].cost < j.cost))) i--; POOL.q.splice(i, 0, j); poolPump();
  });
}

/**
 * Make sure the bytes for `specs` are in READY. Resolves when all are (or after `timeout` ms: whatever is missing is baked synchronously on demand).
 * opts.prio orders the worker queue (lower first), opts.cache = false skips IndexedDB.
 */
export function prepare(specs, { prio = 0, cache = true, timeout = 15000 } = {}) {
  const todo = []; const seen = new Set();
  for (const s of specs) { const key = specKey(s); if (seen.has(key)) continue; seen.add(key); if (!READY.has(key)) todo.push([key, s]); }
  ST.total += todo.filter(([k]) => !PENDING.has(k)).length;
  const run = async () => {
    const mine = todo.filter(([k]) => !PENDING.has(k));
    if (!mine.length) return;
    const t0 = performance.now(), jobs = [], live = new Map();
    // the cache read and the worker start race: a repeat visit answers from IndexedDB within a few ms, a first visit (the DB does not even exist yet) must not wait for it
    const cached = cache ? idbGetMany(mine.map(([k]) => k)).then((h) => { ST.idbMs += performance.now() - t0; return h; }) : Promise.resolve(new Map());
    const first = await Promise.race([cached, new Promise((r) => setTimeout(() => r(null), 90))]);
    const take0 = (h) => { for (const [key] of mine) { const v = h.get(key); if (v && !READY.has(key)) { READY.set(key, { w: v.w, h: v.h, color: new Uint8ClampedArray(v.color), bump: new Uint8ClampedArray(v.bump) }); ST.idb++; ST.done++; ST.mode = 'cache'; const j = live.get(key); if (j) j.cancelled = true; } } };
    if (first) take0(first);
    for (const [key, spec] of mine) {
      if (READY.has(key)) continue;
      const sp = Object.assign({}, spec, { _prio: prio }), job = { cancelled: false };
      live.set(key, job);
      jobs.push(bake(sp, job).then((r) => { if (!r) { if (!job.cancelled) ST.done++; return; } if (READY.has(key)) return; READY.set(key, r); ST.worker++; ST.done++; if (cache) idbPut(key, r); if (ST.mode === 'none') ST.mode = 'worker'; }));
    }
    if (!first) cached.then(take0);
    await Promise.all(jobs);
  };
  const waits = todo.map(([k]) => PENDING.get(k)).filter(Boolean);
  const mineP = run(); for (const [k] of todo) if (!PENDING.has(k)) PENDING.set(k, mineP);
  const all = Promise.all([mineP, ...waits]).then(() => { for (const [k] of todo) PENDING.delete(k); });
  return Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
}

/** take the bytes for a spec: from READY (hit) or baked right here (miss) */
function take(spec) {
  const key = specKey(spec), r = READY.get(key);
  if (r) { ST.hit++; return r; }   // kept: two scenes may ask for the same spec (the textures share the one byte array), and a live texture holds it anyway
  const t0 = performance.now(); const g = generate(spec); ST.miss++; ST.syncMs += performance.now() - t0; if (ST.missKeys.length < 12) ST.missKeys.push(key);
  return g;
}

// ---------------------------------------------------------------- textures
const TEXSET = new Set();   // every texture made here (WeakRef-free: they are few and live for the session)
function dtex(data, w, h, srgb) {
  const rgba = srgb, u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const t = new THREE.DataTexture(u8, w, h, rgba ? THREE.RGBAFormat : THREE.RedFormat, THREE.UnsignedByteType);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.flipY = false; t.unpackAlignment = rgba ? 4 : 1; t.needsUpdate = true;
  t.userData.lmTex = true; t.userData.lmBytes = Math.round(w * h * (rgba ? 4 : 1) * 1.34); TEXSET.add(t);
  return t;
}
function tex(c, srgb = true, repeat = true) {   // canvas textures (courtyard floor, facade, radial blobs)
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.userData.lmTex = true; t.userData.lmBytes = Math.round(c.width * c.height * 4 * 1.34); TEXSET.add(t);
  return t;
}
/** spec -> { map, bump, mapCanvas (lazy, only the courtyard floor pattern asks for it) } */
function build(spec) {
  const g = take(spec), res = { map: dtex(g.color, g.w, g.h, true), bump: dtex(g.bump, g.w, g.h, false) };
  let cv = null;
  Object.defineProperty(res, 'mapCanvas', { get() {
    if (cv) return cv; cv = canvas(g.w, g.h);
    const id = new ImageData(g.w, g.h), s = g.color, d = id.data;
    for (let y = 0; y < g.h; y++) d.set(s.subarray((g.h - 1 - y) * g.w * 4, (g.h - y) * g.w * 4), y * g.w * 4);   // rows were stored bottom-up
    cv.getContext('2d').putImageData(id, 0, 0); return cv;
  } });
  return res;
}

/** Sun-baked raked sand: blotches, wind ripples, grain speckle. Tile = ~4 m. */
export function makeSandTexture(size = 1024, seed = 3) { return build(SP.sand(size, seed)); }

/** Travertine ashlar blocks. Tile covers `bx` x `by` blocks. Mortar is dark + recessed. */
// PERF: identical stone parameters (the hub buildings and the ludus walls ask for the same travertine) are generated once and shared
const STONE_MEMO = new Map();
export function makeStoneTexture(size = 512, o = {}) {
  const spec = SP.stone(size, o), key = specKey(spec), hit = STONE_MEMO.get(key); if (hit) return hit;
  const res = build(spec); STONE_MEMO.set(key, res); return res;
}

/** Marble with warped veins. Tile = ~2 m. */
export function makeMarbleTexture(size = 512, seed = 21) { return build(SP.marble(size, seed)); }

/** Terrain/grass detail (grayscale-ish, multiplies vertex colors). Tile ~6 m. */
export function makeGroundDetail(size = 512, seed = 33) { return build(SP.ground(size, seed)); }

/** Woven cloth (grayscale). Tile covers 24 threads. */
export function makeClothTexture(size = 256) { return build(SP.cloth(size)); }

/** Terracotta roof tiles (curved rows). Tile = 2 m x 2 m (8 columns x 8 rows). */
export function makeRoofTexture(size = 256, seed = 5) { return build(SP.roof(size, seed)); }

/** Soft radial gradient texture (blob shadows, glows). */
export function makeRadialTexture(size = 128, stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]) {
  const c = canvas(size, size), x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return tex(c, true, false);
}

/** Courtyard floor: packed sand + flagstone paths + worn training ring. Returns CanvasTexture (rect mapped 1:1). */
// k < 1 draws the same picture (logical w x h) onto a smaller canvas: low / medium tiers keep the look at a fraction of the GPU memory (1536x1250 + mips = 10 MB)
export function makeCourtyardFloor(w = 1536, h = 1250, sandTile, seed = 7, k = 1) {
  const c = canvas(Math.round(w * k), Math.round(h * k)), x = c.getContext('2d'); x.scale(k, k);
  const pat = x.createPattern(sandTile.mapCanvas, 'repeat');
  const ps = 512 / sandTile.mapCanvas.width; if (ps !== 1 && pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix([ps, 0, 0, ps, 0, 0]));   // a downscaled sand tile keeps the 512 px repeat period
  x.fillStyle = pat; x.fillRect(0, 0, w, h);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // dirt wear patches
  for (let i = 0; i < 70; i++) {
    const px = rnd() * w, py = rnd() * h, r = 40 + rnd() * 120;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = rnd() > 0.4;
    g.addColorStop(0, dark ? 'rgba(120,84,48,0.22)' : 'rgba(240,215,165,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // training ring
  x.strokeStyle = 'rgba(95,64,36,0.28)'; x.lineWidth = 10;
  x.beginPath(); x.ellipse(w * 0.5, h * 0.5, w * 0.17, h * 0.2, 0, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(${i % 2 ? '255,230,180' : '110,76,44'},0.10)`; x.lineWidth = 2; x.beginPath(); x.ellipse(w * 0.5, h * 0.5, w * (0.05 + i * 0.012), h * (0.06 + i * 0.014), 0, 0, Math.PI * 2); x.stroke(); }
  // flagstones along a central cross path (front gate axis = bottom edge)
  const paving = (x0, y0, x1, y1, ps) => {
    for (let yy = y0; yy < y1; yy += ps) {
      let xx = x0 + (((yy - y0) / ps) % 2) * ps * 0.5 - ps * 0.5;
      for (; xx < x1; xx += ps) {
        const jx = (rnd() - 0.5) * 6, jy = (rnd() - 0.5) * 6;
        const l = 168 + rnd() * 40;
        x.fillStyle = `rgb(${l},${l * 0.93},${l * 0.8})`;
        x.fillRect(xx + 3 + jx, yy + 3 + jy, ps - 6, ps - 6);
        x.fillStyle = 'rgba(70,50,30,0.35)'; x.fillRect(xx + ps - 5 + jx, yy + 3 + jy, 3, ps - 6); x.fillRect(xx + 3 + jx, yy + ps - 5 + jy, ps - 6, 3);
      }
    }
  };
  x.save(); x.beginPath(); x.rect(w * 0.44, h * 0.62, w * 0.12, h * 0.38); x.clip(); paving(w * 0.44, h * 0.62, w * 0.56, h, 46); x.restore();
  x.save(); x.beginPath(); x.rect(w * 0.1, h * 0.46, w * 0.8, h * 0.07); x.clip(); paving(w * 0.1, h * 0.46, w * 0.9, h * 0.53, 46); x.restore();
  // edge soften: darker near walls (contact AO)
  const vg = x.createLinearGradient(0, 0, w, 0);
  vg.addColorStop(0, 'rgba(60,36,30,0.5)'); vg.addColorStop(0.06, 'rgba(60,36,30,0)'); vg.addColorStop(0.94, 'rgba(60,36,30,0)'); vg.addColorStop(1, 'rgba(60,36,30,0.5)');
  x.fillStyle = vg; x.fillRect(0, 0, w, h);
  const vg2 = x.createLinearGradient(0, 0, 0, h);
  vg2.addColorStop(0, 'rgba(60,36,30,0.5)'); vg2.addColorStop(0.07, 'rgba(60,36,30,0)'); vg2.addColorStop(0.93, 'rgba(60,36,30,0)'); vg2.addColorStop(1, 'rgba(60,36,30,0.5)');
  x.fillStyle = vg2; x.fillRect(0, 0, w, h);
  return tex(c, true, false);
}

/** Distant Colosseum facade strip (3 arch tiers + attic). Wraps horizontally every `bays` bays. Color only. */
export function makeColosseumFacade(w = 1024, h = 512, bays = 8) {
  const c = canvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e9dcbc'); g.addColorStop(1, '#cdb88f');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${90 + (i * 7) % 60},${70 + (i * 5) % 40},50,0.05)`; x.fillRect((i * 97) % w, (i * 53) % h, 18 + (i % 9) * 6, 3); }
  const bw = w / bays, tierH = h * 0.27, attic = h - tierH * 3;
  for (let t = 0; t < 3; t++) {
    const yb = h - t * tierH;                                    // tier bottom (canvas y grows down)
    for (let b = 0; b < bays; b++) {
      const cx = b * bw + bw / 2, aw = bw * 0.54, ah = tierH * 0.74;
      x.fillStyle = '#2c2230'; x.beginPath(); x.moveTo(cx - aw / 2, yb - 4); x.lineTo(cx - aw / 2, yb - ah + aw / 2); x.arc(cx, yb - ah + aw / 2, aw / 2, Math.PI, 0); x.lineTo(cx + aw / 2, yb - 4); x.fill();
      x.fillStyle = 'rgba(255,230,190,0.35)'; x.fillRect(cx - aw / 2 - 5, yb - ah, 5, ah - 4);                  // lit pier edge
      x.fillStyle = 'rgba(70,50,40,0.28)'; x.fillRect(cx + aw / 2, yb - ah, 5, ah - 4);
    }
    x.fillStyle = 'rgba(80,60,45,0.55)'; x.fillRect(0, yb - tierH, w, 4);                                         // cornice shadow line
    x.fillStyle = 'rgba(255,240,210,0.4)'; x.fillRect(0, yb - tierH - 3, w, 3);
  }
  for (let b = 0; b < bays; b++) { x.fillStyle = '#4a3a3a'; x.fillRect(b * bw + bw * 0.4, attic * 0.35, bw * 0.2, attic * 0.35); }
  const t = tex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------------------------------------------------------------- memory: release / re-warm GPU copies of the procedural textures (low tier, memory pressure)
/** every procedural texture the materials of `root` use */
export function sceneTextures(root) {
  const out = new Set();
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k of ['map', 'bumpMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap']) { const t = m[k]; if (t && t.userData && t.userData.lmTex) out.add(t); }
  });
  return out;
}
/** MB of procedural textures currently resident on the GPU */
export function residentMB(renderer) { let b = 0; for (const t of TEXSET) if (renderer.properties.has(t)) b += t.userData.lmBytes; return b / 1048576; }
/** free the GPU copy (the CPU bytes stay: three re-uploads on the next use). Returns MB freed. */
export function releaseTextures(renderer, set) { let b = 0; for (const t of set) if (renderer.properties.has(t)) { b += t.userData.lmBytes; t.dispose(); } return b / 1048576; }
/** upload now (before the scene is shown) so the first frame has no upload hitch. Returns the count. */
export function warmTextures(renderer, set) { let n = 0; for (const t of set) if (!renderer.properties.has(t)) { renderer.initTexture(t); n++; } return n; }
