// Clawspire -- shared utilities. Loaded first; every other module may use U.
// Pure functions only: no DOM, no state beyond the rng closures it hands out.
const U = (() => {
  // mulberry32: small, fast, good enough, and identical everywhere.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const next = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)); // inclusive
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = a2[i]; a2[i] = a2[j]; a2[j] = t;
      }
      return a2;
    };
    next.seed = () => a >>> 0;
    return next;
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
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
  const uid = () => 'u' + (uidN++).toString(36);
  const resetUid = (n) => { uidN = n || 1; };
  // Deterministic string hash (FNV-1a) for seeding from names.
  const hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const deepCopy = (o) => JSON.parse(JSON.stringify(o));
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  return { rng, clamp, lerp, ease, uid, resetUid, hashStr, deepCopy, fmt, dist };
})();
