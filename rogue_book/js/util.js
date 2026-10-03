// Inkwoven -- shared utilities. Loaded first; every other module may use U.
// Pure helpers only: no game state. DOM helpers touch `document` lazily.
const U = (() => {
  // mulberry32: small, fast, identical everywhere. The closure state is a single
  // uint32, exposed by .seed(), so a stream can be saved and resumed: U.rng(r.seed()).
  // Seed 0 maps to a fixed odd constant so U.rng(0) and U.rng(1) are different streams.
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    const next = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));      // inclusive both ends
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (arr) => {
      const b = arr.slice();
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = b[i]; b[i] = b[j]; b[j] = t;
      }
      return b;
    };
    // weighted pick over [[item, weight], ...] or over items with a weight fn
    next.weighted = (entries, wfn) => {
      let total = 0;
      const ws = entries.map((e) => { const w = wfn ? wfn(e) : e[1]; total += Math.max(0, w); return Math.max(0, w); });
      if (total <= 0) return null;
      let r = next() * total;
      for (let i = 0; i < entries.length; i++) { r -= ws[i]; if (r < 0) return wfn ? entries[i] : entries[i][0]; }
      const last = entries[entries.length - 1];
      return wfn ? last : last[0];
    };
    next.sample = (arr, n) => next.shuffle(arr).slice(0, n);
    next.seed = () => a >>> 0;
    return next;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const wrap = (v, n) => ((v % n) + n) % n;
  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inBack: (t) => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
    outElastic: (t) => (t === 0 || t === 1) ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  let uidN = 1;
  const uid = () => uidN++;                           // small ints: card instance uids, event ids
  const resetUid = (n) => { uidN = n || 1; };
  const uidPeek = () => uidN;

  // FNV-1a string hash, and a combiner so seeds can be derived: U.hash(seed, 'ch2', 'map').
  const hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const hash = (...parts) => hashStr(parts.map(String).join('|'));

  // YYYYMMDD integer for a Date the caller passes in (logic never reads the clock itself: GAME does).
  const dateKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

  const deepCopy = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
  const commas = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const mmss = (sec) => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

  // ---- colour helpers (hex strings in, hex or rgba strings out) ----
  const color = {
    rgb(hex) {
      let h = String(hex).replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    hex(r, g, b) {
      const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
      return '#' + c(r) + c(g) + c(b);
    },
    rgba(hex, a) { const [r, g, b] = color.rgb(hex); return `rgba(${r},${g},${b},${a})`; },
    mix(h1, h2, t) {
      const a = color.rgb(h1), b = color.rgb(h2);
      return color.hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
    },
    lighten(hex, t) { return color.mix(hex, '#ffffff', t); },
    darken(hex, t) { return color.mix(hex, '#000000', t); },
    // hue-shifted shadow: darker and pulled toward indigo, the house cel-shading recipe
    shadow(hex, t) { return color.mix(color.darken(hex, (t == null ? 0.35 : t)), '#2a1a6a', 0.28); },
    hsl(h, s, l) {
      h = wrap(h, 360) / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
      const f = (p, q, t) => { t = wrap(t, 1); return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      if (s === 0) { const v = Math.round(l * 255); return color.hex(v, v, v); }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      return color.hex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
    },
  };

  // ---- seeded value noise (1D / 2D), smooth, deterministic ----
  const noise = (() => {
    const h2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const n2 = (x, y, seed) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi), s = seed | 0;
      return lerp(lerp(h2(xi, yi, s), h2(xi + 1, yi, s), xf), lerp(h2(xi, yi + 1, s), h2(xi + 1, yi + 1, s), xf), yf);
    };
    const n1 = (x, seed) => n2(x, 0.5, seed);
    const fbm = (x, y, seed, oct) => { let a = 0.5, f = 1, t = 0; for (let i = 0; i < (oct || 3); i++) { t += a * n2(x * f, y * f, (seed | 0) + i * 31); a *= 0.5; f *= 2; } return t; };
    return { n1, n2, fbm };
  })();

  // ---- tiny event bus ----
  function bus() {
    const m = {};
    return {
      on(t, fn) { (m[t] || (m[t] = [])).push(fn); return () => this.off(t, fn); },
      off(t, fn) { if (m[t]) m[t] = m[t].filter((f) => f !== fn); },
      emit(t, d) { (m[t] || []).slice().forEach((f) => f(d)); (m['*'] || []).slice().forEach((f) => f(t, d)); },
    };
  }

  // ---- DOM helper (browser only, safe to define headless) ----
  // U.el('div', {class:'x', style:{left:'4px'}, dataset:{a:1}, onclick:fn, text:'hi'}, child, 'text')
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style') { if (typeof v === 'string') e.style.cssText = v; else Object.assign(e.style, v); }
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    return e;
  }

  // Escape user-facing text for innerHTML
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return { rng, clamp, lerp, inv, smooth, wrap, ease, uid, resetUid, uidPeek, hashStr, hash, dateKey, deepCopy, sum, range, dist, fmt, cap, plural, roman, commas, mmss, color, noise, bus, el, esc };
})();
