/* BBH.Samples: per-save-slot store for the player's recorded drum samples (lanes 0..3 = B T K Pf).
 *
 * Reads are synchronous (served from an in-memory Map); writes go to IndexedDB in the background
 * (database 'beatbox-heroes-samples', store 'samples', key `slot{N}:lane{L}` -> { f32: Float32Array, rate }).
 * When IndexedDB is missing or blocked (node tests, private mode) everything keeps working in memory. Nothing here throws.
 *
 * No em dashes anywhere in this file (project rule).
 */
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  const DB_NAME = 'beatbox-heroes-samples', STORE = 'samples';
  const mem = new Map(); // key -> { f32, rate }
  let dbp = null, persistent = false, pending = 0;
  const idle = [];

  const key = (slot, lane) => 'slot' + (slot | 0) + ':lane' + (lane | 0);
  const okLane = (l) => typeof l === 'number' && l >= 0 && l <= 3 && l === Math.floor(l);

  function getDB() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        const idb = root.indexedDB;
        if (!idb) { resolve(null); return; }
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = function () { try { req.result.createObjectStore(STORE); } catch (e) { /* ignore */ } };
        req.onsuccess = function () { persistent = true; resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function track(p) {
    pending++;
    p.then(function () { done(); }, function () { done(); });
  }
  function done() {
    pending = Math.max(0, pending - 1);
    if (!pending) { const l = idle.splice(0); l.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); }
  }
  /** run fn(store) in a readwrite transaction in the background; resolves true when committed, false otherwise */
  function write(fn) {
    const p = getDB().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          fn(tx.objectStore(STORE));
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = tx.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
    track(p);
    return p;
  }

  /**
   * Load every stored lane of a slot into memory. Resolves { ok, count, persistent } and never rejects.
   * Call (and await) it before get/applyToAudio on a freshly loaded page. Samples put in this session are kept.
   */
  function init(slot) {
    return getDB().then(function (db) {
      if (!db) return { ok: true, count: list(slot).length, persistent: false };
      return new Promise(function (resolve) {
        try {
          const prefix = 'slot' + (slot | 0) + ':';
          const tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
          const rq = st.openCursor();
          rq.onsuccess = function () {
            const c = rq.result;
            if (!c) return;
            const k = String(c.key);
            if (k.indexOf(prefix) === 0 && !mem.has(k) && c.value && c.value.f32 && c.value.f32.length) mem.set(k, { f32: c.value.f32, rate: c.value.rate });
            c.continue();
          };
          tx.oncomplete = function () { resolve({ ok: true, count: list(slot).length, persistent: true }); };
          tx.onerror = tx.onabort = function () { resolve({ ok: false, count: list(slot).length, persistent: true }); };
        } catch (e) { resolve({ ok: false, count: list(slot).length, persistent: false }); }
      });
    }).catch(function () { return { ok: false, count: 0, persistent: false }; });
  }

  function put(slot, lane, f32, rate) {
    if (!okLane(lane) || !f32 || !(f32.length > 0)) return false;
    const r = typeof rate === 'number' && rate > 0 ? rate : 44100, k = key(slot, lane);
    const copy = f32 instanceof Float32Array ? f32.slice() : Float32Array.from(f32);
    mem.set(k, { f32: copy, rate: r });
    write(function (st) { st.put({ f32: copy, rate: r }, k); });
    return true;
  }
  function get(slot, lane) {
    if (!okLane(lane)) return null;
    const v = mem.get(key(slot, lane));
    return v ? { f32: v.f32, rate: v.rate } : null;
  }
  function remove(slot, lane) {
    if (!okLane(lane)) return false;
    const k = key(slot, lane), had = mem.delete(k);
    write(function (st) { st.delete(k); });
    return had;
  }
  function removeAll(slot) {
    let n = 0;
    for (let l = 0; l < 4; l++) if (mem.delete(key(slot, l))) n++;
    write(function (st) { for (let l = 0; l < 4; l++) st.delete(key(slot, l)); });
    return n;
  }
  /** [{ lane, rate, length, seconds }] for the lanes that have a sample */
  function list(slot) {
    const out = [];
    for (let l = 0; l < 4; l++) { const v = mem.get(key(slot, l)); if (v) out.push({ lane: l, rate: v.rate, length: v.f32.length, seconds: v.f32.length / v.rate }); }
    return out;
  }

  /* ---- base64 of Int16 PCM (little endian), no btoa dependency ---- */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64R = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i++) B64R[B64.charCodeAt(i)] = i;
  function toB64(bytes) {
    let s = '';
    const n = bytes.length;
    for (let i = 0; i < n; i += 3) {
      const a = bytes[i], b = i + 1 < n ? bytes[i + 1] : 0, c = i + 2 < n ? bytes[i + 2] : 0;
      s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < n ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < n ? B64[c & 63] : '=');
    }
    return s;
  }
  function fromB64(str) {
    const clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
    const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let o = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const a = B64R[clean.charCodeAt(i)], b = B64R[clean.charCodeAt(i + 1)];
      const c = i + 2 < clean.length ? B64R[clean.charCodeAt(i + 2)] : -1, d = i + 3 < clean.length ? B64R[clean.charCodeAt(i + 3)] : -1;
      if (o < out.length) out[o++] = (a << 2) | (b >> 4);
      if (c >= 0 && o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
      if (d >= 0 && o < out.length) out[o++] = ((c & 3) << 6) | d;
    }
    return out;
  }
  function f32ToPcmB64(f32) {
    const bytes = new Uint8Array(f32.length * 2), dv = new DataView(bytes.buffer);
    for (let i = 0; i < f32.length; i++) { const v = f32[i] < -1 ? -1 : f32[i] > 1 ? 1 : f32[i]; dv.setInt16(i * 2, Math.round(v * 32767), true); }
    return toB64(bytes);
  }
  function pcmB64ToF32(str) {
    const bytes = fromB64(str), n = bytes.length >> 1, dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2), f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 32767;
    return f;
  }

  /** JSON-able snapshot of a slot: { v:1, lanes: { '0': { rate, n, pcm } } } (Int16 PCM as base64), or { v:1, lanes:{} } when empty */
  function exportSlot(slot) {
    const lanes = {};
    for (let l = 0; l < 4; l++) { const v = mem.get(key(slot, l)); if (v) lanes[l] = { rate: v.rate, n: v.f32.length, pcm: f32ToPcmB64(v.f32) }; }
    return { v: 1, lanes };
  }
  /** Replace the samples of a slot with an exportSlot() object. Returns the number of lanes imported (0 for bad input, slot untouched). */
  function importSlot(slot, obj) {
    try {
      if (!obj || typeof obj !== 'object' || !obj.lanes || typeof obj.lanes !== 'object') return 0;
      const fresh = [];
      for (let l = 0; l < 4; l++) {
        const e = obj.lanes[l];
        if (!e || typeof e.pcm !== 'string' || !(e.rate > 0)) continue;
        const f = pcmB64ToF32(e.pcm);
        if (f.length) fresh.push([l, f, e.rate]);
      }
      removeAll(slot);
      fresh.forEach((x) => put(slot, x[0], x[1], x[2]));
      return fresh.length;
    } catch (e) { return 0; }
  }
  /** Push the slot's samples into BBH.Audio (lanes without a sample are cleared so the synth plays). Returns lanes set. */
  function applyToAudio(slot) {
    const A = BBH.Audio;
    if (!A || typeof A.setSample !== 'function') return 0;
    let n = 0;
    for (let l = 0; l < 4; l++) {
      const v = mem.get(key(slot, l));
      try {
        if (v) { if (A.setSample(l, v.f32, v.rate)) n++; } else A.clearSample(l);
      } catch (e) { /* ignore */ }
    }
    return n;
  }
  /** Resolves once every background write has settled (useful before reload or in tests). */
  function flush() { return pending ? new Promise(function (r) { idle.push(r); }) : Promise.resolve(); }

  BBH.Samples = { init, put, get, remove, removeAll, list, exportSlot, importSlot, applyToAudio, flush, isPersistent: () => persistent, _clearMemory: () => mem.clear() };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
