// Shared math and helper functions. Everything hangs off the global U namespace.
const U = {
  TAU: Math.PI * 2,

  clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(min, max) { return min + Math.random() * (max - min); },
  randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  },

  dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  },

  angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },

  angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= U.TAU;
    while (d < -Math.PI) d += U.TAU;
    return d;
  },

  rotate(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
  },

  // Circle-vs-circle overlap with optional padding.
  circleOverlap(ax, ay, ar, bx, by, br, pad = 0) {
    const r = ar + br + pad;
    return U.dist2(ax, ay, bx, by) < r * r;
  },

  // Convert speed (world units per second) into a rough MPH for the HUD.
  toMph(speed) { return Math.abs(speed) * 0.18; },

  formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  },

  // Roll a weighted choice from an array of [item, weight] pairs.
  weighted(table) {
    let total = 0;
    for (const [, w] of table) total += w;
    let r = Math.random() * total;
    for (const [item, w] of table) {
      if ((r -= w) <= 0) return item;
    }
    return table[table.length - 1][0];
  },
};
