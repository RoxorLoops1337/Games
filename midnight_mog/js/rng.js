// Seeded RNG shared by the sim, the loot tables and the bots. Never use Math.random in js/sim or js/data.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const raw = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next: raw,
    int: (lo, hi) => lo + Math.floor(raw() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(raw() * arr.length)],
    chance: (p) => raw() < p,
    weighted(items, weightFn) {
      let total = 0;
      for (const it of items) total += weightFn(it);
      let r = raw() * total;
      for (const it of items) { r -= weightFn(it); if (r < 0) return it; }
      return items[items.length - 1];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(raw() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    },
    getState: () => s,
    setState: (v) => { s = v >>> 0; },
  };
}
