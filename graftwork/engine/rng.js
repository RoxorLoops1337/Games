// Seeded RNG (mulberry32). State is one uint32 so a run can be saved and resumed exactly.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h || 1;
}
export function makeRng(seed) {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    int: (n) => Math.floor(next() * n),
    range: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (a) => a[Math.floor(next() * a.length)],
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    sample(a, n) { return r.shuffle(a.slice()).slice(0, n); },
    weighted(items, wf) {
      let tot = 0; for (const it of items) tot += wf(it);
      let x = next() * tot;
      for (const it of items) { x -= wf(it); if (x <= 0) return it; }
      return items[items.length - 1];
    },
    get state() { return s; },
    set state(v) { s = v >>> 0; },
  };
  return r;
}
