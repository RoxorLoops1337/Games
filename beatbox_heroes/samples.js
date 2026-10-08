/* BBH.Samples: per-save-slot store for the player's recorded beatbox sounds.
 *
 * A sound is a lane number 0..3 (B T K Pf) or a Core.SOUNDS id ('B', 't', 'K', 'Pf' map to lanes 0..3; 'LR', 'TB', ... are extra sounds).
 * Reads are synchronous (served from an in-memory Map); writes go to IndexedDB in the background
 * (database 'beatbox-heroes-samples', store 'samples', key `slot{N}:lane{L}` for the four lanes, `slot{N}:snd{ID}` for extra sounds -> { f32: Float32Array, rate },
 * plus raw (the untouched take) and fx ('clean' | 'raw') for takes made through the studio chain; export / import carry f32 only).
 * play(id) plays a sound everywhere the same way: your recording when there is one, else the synth voice (BBH.Audio).
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

  const LANE_ID = ['B', 't', 'K', 'Pf'];
  const ID_LANE = { B: 0, t: 1, T: 1, K: 2, Pf: 3, PF: 3, P: 3 };
  /** lane 0..3 of a sound (number or id), -1 for an extra sound, null for garbage */
  function laneOf(s) {
    if (typeof s === 'number') return s >= 0 && s <= 3 && s === Math.floor(s) ? s : null;
    if (typeof s !== 'string' || !/^[A-Za-z]{1,8}$/.test(s)) return null;
    return ID_LANE[s] !== undefined ? ID_LANE[s] : -1;
  }
  const idOf = (s) => { const l = laneOf(s); return l === null ? null : l >= 0 ? LANE_ID[l] : s; };
  const key = (slot, s) => { const l = laneOf(s); return l === null ? null : 'slot' + (slot | 0) + (l >= 0 ? ':lane' + l : ':snd' + s); };
  const okLane = (s) => laneOf(s) !== null;
  const extraKeys = (slot) => { const pre = 'slot' + (slot | 0) + ':snd', out = []; mem.forEach((v, k) => { if (k.indexOf(pre) === 0) out.push(k.slice(pre.length)); }); return out; };

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
            if (k.indexOf(prefix) === 0 && !mem.has(k) && c.value && c.value.f32 && c.value.f32.length) mem.set(k, entry(c.value.f32, c.value.rate, c.value));
            c.continue();
          };
          tx.oncomplete = function () { resolve({ ok: true, count: list(slot).length, persistent: true }); };
          tx.onerror = tx.onabort = function () { resolve({ ok: false, count: list(slot).length, persistent: true }); };
        } catch (e) { resolve({ ok: false, count: list(slot).length, persistent: false }); }
      });
    }).catch(function () { return { ok: false, count: 0, persistent: false }; });
  }

  /* a stored sound: { f32, rate } plus, for takes made through the studio chain (voicefx.js), raw (the untouched take) and
   * fx ('clean' | 'raw': which version f32 holds). Both are optional; entries saved before they existed load as they are. */
  function entry(f32, rate, extra) {
    const e = { f32, rate };
    if (extra && extra.raw && extra.raw.length) { e.raw = extra.raw; e.fx = extra.fx === 'raw' ? 'raw' : 'clean'; }
    return e;
  }
  /** put(slot, lane | id, f32, rate, extra?): extra { raw: Float32Array, fx: 'clean' | 'raw' } keeps the raw take for CLEAN / RAW */
  function put(slot, lane, f32, rate, extra) {
    if (!okLane(lane) || !f32 || !(f32.length > 0)) return false;
    const r = typeof rate === 'number' && rate > 0 ? rate : 44100, k = key(slot, lane);
    const copy = f32 instanceof Float32Array ? f32.slice() : Float32Array.from(f32);
    const raw = extra && extra.raw && extra.raw.length ? (extra.raw instanceof Float32Array ? extra.raw.slice() : Float32Array.from(extra.raw)) : null;
    const e = entry(copy, r, raw ? { raw, fx: extra.fx } : null);
    mem.set(k, e);
    write(function (st) { st.put(Object.assign({}, e), k); });
    return true;
  }
  function get(slot, lane) {
    if (!okLane(lane)) return null;
    const v = mem.get(key(slot, lane));
    return v ? Object.assign({}, v) : null;
  }
  /**
   * Switch a stored take between the CLEAN studio version and the RAW take (same cut, level-matched), rebuilt from its raw take
   * with BBH.VoiceFX (deterministic, so CLEAN is always the same sample). Returns the new { f32, rate, raw, fx } or null when
   * the sound has no raw take (recorded before the studio chain, imported) or VoiceFX is missing.
   */
  function setMode(slot, lane, mode) {
    if (!okLane(lane)) return null;
    const v = mem.get(key(slot, lane)), FX = BBH.VoiceFX;
    if (!v || !v.raw || !FX) return null;
    let res = null;
    try { res = FX.process(v.raw, v.rate, idOf(lane)); } catch (e) { res = null; }
    if (!res || !res.data.length) return null;
    const fx = mode === 'raw' ? 'raw' : 'clean';
    put(slot, lane, fx === 'raw' ? res.dry : res.data, v.rate, { raw: v.raw, fx });
    return get(slot, lane);
  }
  function remove(slot, lane) {
    if (!okLane(lane)) return false;
    const k = key(slot, lane), had = mem.delete(k);
    write(function (st) { st.delete(k); });
    return had;
  }
  function removeAll(slot) {
    let n = 0;
    const ks = [0, 1, 2, 3].map((l) => key(slot, l)).concat(extraKeys(slot).map((id) => key(slot, id)));
    for (const k of ks) if (mem.delete(k)) n++;
    write(function (st) { for (const k of ks) st.delete(k); });
    return n;
  }
  /** [{ lane, id, rate, length, seconds }] for the sounds that have a sample (lane -1 for extra sounds) */
  function list(slot) {
    const out = [];
    for (let l = 0; l < 4; l++) { const v = mem.get(key(slot, l)); if (v) out.push({ lane: l, id: LANE_ID[l], rate: v.rate, length: v.f32.length, seconds: v.f32.length / v.rate }); }
    for (const id of extraKeys(slot)) { const v = mem.get(key(slot, id)); if (v) out.push({ lane: -1, id, rate: v.rate, length: v.f32.length, seconds: v.f32.length / v.rate }); }
    return out;
  }
  const has = (slot, s) => { const k = key(slot, s); return !!(k && mem.has(k)); };

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
    const lanes = {}, sounds = {};
    for (let l = 0; l < 4; l++) { const v = mem.get(key(slot, l)); if (v) lanes[l] = { rate: v.rate, n: v.f32.length, pcm: f32ToPcmB64(v.f32) }; }
    for (const id of extraKeys(slot)) { const v = mem.get(key(slot, id)); if (v) sounds[id] = { rate: v.rate, n: v.f32.length, pcm: f32ToPcmB64(v.f32) }; }
    return Object.keys(sounds).length ? { v: 1, lanes, sounds } : { v: 1, lanes };
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
      const so = obj.sounds && typeof obj.sounds === 'object' ? obj.sounds : {};
      for (const id in so) {
        const e = so[id];
        if (laneOf(id) !== -1 || !e || typeof e.pcm !== 'string' || !(e.rate > 0)) continue;
        const f = pcmB64ToF32(e.pcm);
        if (f.length) fresh.push([id, f, e.rate]);
      }
      removeAll(slot);
      fresh.forEach((x) => put(slot, x[0], x[1], x[2]));
      return fresh.length;
    } catch (e) { return 0; }
  }
  /** Push the slot's samples into BBH.Audio (lanes without a sample are cleared so the synth plays). Returns lanes set.
   *  Extra sounds are offered to Audio.setSample(id) too (when it takes ids); play(id) covers them either way. */
  let active = 0;
  function applyToAudio(slot) {
    active = slot | 0;
    const A = BBH.Audio;
    if (!A || typeof A.setSample !== 'function') return 0;
    let n = 0;
    for (let l = 0; l < 4; l++) {
      const v = mem.get(key(slot, l));
      try {
        if (v) { if (A.setSample(l, v.f32, v.rate)) n++; } else A.clearSample(l);
      } catch (e) { /* ignore */ }
    }
    for (const id of extraKeys(slot)) { const v = mem.get(key(slot, id)); try { if (v) A.setSample(id, v.f32, v.rate); } catch (e) { /* ignore */ } }
    return n;
  }

  /* ---- playback by sound id: your recording first, then the synth voice ---- */
  const curSlot = () => { try { return (BBH.G && BBH.G.slot) || active || 1; } catch (e) { return 1; } };
  const ctxOf = (A) => { try { return A && A.ctx && A.ctx.state === 'running' ? A.ctx : null; } catch (e) { return null; } };
  /** does Audio itself hold a sample for this sound id? */
  const audioHas = (A, s) => { try { return !!(A && A.hasSample && A.hasSample(s)); } catch (e) { return false; } };
  // our own buffer playback for extra sounds when BBH.Audio only knows the four lanes
  const bufs = new WeakMap();
  function ownPlay(A, v, opts) {
    const ac = ctxOf(A); if (!ac || A.muted) return false;
    try {
      let b = bufs.get(v); if (!b || b.ctx !== ac) { const nb = ac.createBuffer(1, v.f32.length, v.rate); nb.getChannelData(0).set(v.f32); b = { ctx: ac, buf: nb }; bufs.set(v, b); }
      const src = ac.createBufferSource(), g = ac.createGain(), sfx = (() => { try { const E = BBH.Eng || BBH.E; return E && E.settings && typeof E.settings.sfx === 'number' ? E.settings.sfx : 0.8; } catch (e) { return 0.8; } })();
      src.buffer = b.buf; g.gain.value = Math.max(0, Math.min(1, (opts && opts.vel !== undefined ? opts.vel : 0.9))) * 0.9 * sfx;
      src.connect(g); g.connect(ac.destination); src.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
      src.start(Math.max(ac.currentTime, (opts && opts.when) || 0)); return true;
    } catch (e) { return false; }
  }
  // the synth voice of a sound id (AUDIO's voices: Audio.beatbox(id) or Audio.drum(id)); a soft blip when the build has neither
  function synthExtra(A, id, opts) {
    try { if (A.beatbox) { const r = A.beatbox(id, opts); if (r !== false) return true; } } catch (e) { /* ignore */ }
    try { const r = A.drum(id, opts); if (r) return true; } catch (e) { /* ignore */ }
    const ac = ctxOf(A); if (!ac || A.muted) return false;
    try {
      const t = Math.max(ac.currentTime, (opts && opts.when) || 0), o = ac.createOscillator(), g = ac.createGain(), seed = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      o.type = seed % 2 ? 'square' : 'triangle'; o.frequency.setValueAtTime(90 + (seed % 9) * 60, t); o.frequency.exponentialRampToValueAtTime(50 + (seed % 5) * 20, t + 0.18);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.25); return true;
    } catch (e) { return false; }
  }
  /**
   * Play a sound by lane or id. opts: { vel, when, synth:true (always the synth voice), mine:true (only your recording) }.
   * Recorded samples replace the synth voice, exactly like the four lanes always did. Never throws, returns true when something played.
   */
  function play(s, opts) {
    opts = opts || {};
    const A = BBH.Audio, l = laneOf(s); if (!A || l === null) return false;
    try {
      if (l >= 0) {
        if (opts.mine && !A.hasSample(l)) return false;
        const v = mem.get(key(curSlot(), l));
        if (opts.synth && v && A.hasSample(l)) {                             // the synth version even when you recorded your own: lift the sample off for this one hit
          A.clearSample(l); let r = false; try { r = A.drum(l, opts); } finally { if (v) A.setSample(l, v.f32, v.rate); } return !!r;
        }
        return !!A.drum(l, opts);
      }
      const v = mem.get(key(curSlot(), s));
      if (opts.synth) { if (v && audioHas(A, s) && A.clearSample) { A.clearSample(s); try { return synthExtra(A, s, opts); } finally { A.setSample(s, v.f32, v.rate); } } return synthExtra(A, s, opts); }
      if (audioHas(A, s)) return !!(A.beatbox ? A.beatbox(s, opts) : A.drum(s, opts));
      if (v) return ownPlay(A, v, opts);
      if (opts.mine) return false;
      return synthExtra(A, s, opts);
    } catch (e) { return false; }
  }
  /** Resolves once every background write has settled (useful before reload or in tests). */
  function flush() { return pending ? new Promise(function (r) { idle.push(r); }) : Promise.resolve(); }

  BBH.Samples = { init, put, get, setMode, has, remove, removeAll, list, exportSlot, importSlot, applyToAudio, play, laneOf, idOf, LANE_ID, flush, isPersistent: () => persistent, _clearMemory: () => mem.clear() };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
