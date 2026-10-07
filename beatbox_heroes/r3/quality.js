// BEATBOX HEROES r3 -- quality.js (PLAT). Quality tier auto-pick and the 3 s frame probe (PORT_PLAN 2.9). Classic script, no dependencies.
//   BBH.R3Quality.pick(cap)          cap = { memory, cores, dpr, gpu, soft, mobile } -> { q:'low'|'med'|'high', why }
//   BBH.R3Quality.probe(q, onStep)   -> { push(dtMs) , done, median }.  Feed it real frame times; after 0.5 s of warm-up it collects 3 s, then if the MEDIAN frame is above
//                                    24 ms it calls onStep(lowerTier) ONCE. Never steps up. 'low' never steps (nothing below it).
//   BBH.R3Quality.lower(q) / ORDER   tier helpers
(function (root) {
  'use strict';
  const BBH = root.BBH = root.BBH || {};
  const ORDER = ['low', 'med', 'high'];
  const WEAK_GPU = /mali-(4|t[0-7])|adreno \(tm\) ?([2-5])\d\d|powervr|videocore|vivante|sgx|intel.*(gma|hd graphics [2-4]\d{2}\b)/i;
  const lower = (q) => ORDER[Math.max(0, ORDER.indexOf(q) - 1)] || 'low';
  const cap = (q, max) => (ORDER.indexOf(q) > ORDER.indexOf(max) ? max : q);
  function pick(c) {
    c = c || {}; let q = 'high', why = 'default';
    if (c.soft) return { q: 'low', why: 'software renderer' };
    if (c.memory && c.memory <= 2) return { q: 'low', why: 'deviceMemory ' + c.memory };
    if (c.memory && c.memory <= 4) { q = cap(q, 'med'); why = 'deviceMemory ' + c.memory; }
    if (c.gpu && WEAK_GPU.test(c.gpu)) return { q: 'low', why: 'weak gpu' };
    if (c.cores && c.cores <= 4) { q = cap(q, 'med'); why = 'cores ' + c.cores; }
    if (c.mobile && !c.memory) { q = cap(q, 'med'); why = 'mobile, memory unknown'; }
    if ((c.dpr || 1) >= 3 && c.mobile) { q = cap(q, 'med'); why = 'dpr ' + c.dpr; }
    return { q, why };
  }
  const WARM = 500, WINDOW = 3000, LIMIT = 24;
  function probe(q, onStep) {
    const buf = new Float32Array(512); let n = 0, t = 0; const p = { done: false, median: 0 };
    p.push = function (dt) {
      if (p.done) return; t += dt; if (t < WARM) return;
      if (n < buf.length) buf[n++] = dt;
      if (t >= WARM + WINDOW) {
        p.done = true; const a = Array.prototype.slice.call(buf, 0, n).sort((x, y) => x - y); p.median = a.length ? a[a.length >> 1] : 0;
        if (n >= 10 && p.median > LIMIT && q !== 'low') { try { onStep(lower(q), p.median); } catch (e) { console.error(e); } } else { try { onStep(null, p.median); } catch (e) { console.error(e); } }
      }
    };
    return p;
  }
  BBH.R3Quality = { ORDER, pick, probe, lower, LIMIT_MS: LIMIT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
