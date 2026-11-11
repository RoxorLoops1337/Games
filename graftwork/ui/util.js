// Small helpers shared by ui/, art/ and lab/. A leaf: this file imports nothing, so a module of art/ can use it without pulling in
// the app (ui/core.js re-exports clamp and lerp for the screens that already import them from there).
// Each helper here replaced copies whose bodies were the same text; a look-alike with another body stays where it is (see clampOrdered).

export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); // any bounds; with a > b it returns a
// The ternary clamp of the battle, post, puppet and transition code. The same as clamp for ordered bounds, except that it hands back
// -0 and NaN unchanged; its callers pass constant, ordered bounds. Kept apart so their numbers stay bit for bit what they were.
export const clampOrdered = (v, a, b) => (v < a ? a : v > b ? b : v);

// FNV-1a over the UTF-16 code units of a string: hash32 as an unsigned 32 bit integer, hash01 as a float in [0, 1).
// Pass a string: anything without a length hashes to the offset basis.
export const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const hash01 = (s) => hash32(s) / 4294967296;
// mulberry32: a seeded generator of floats in [0, 1) (the procedural backdrops and event plates).
export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a float in [a, b) from Math.random (screen effects that are not part of the seeded run)
export const randRange = (a, b) => a + Math.random() * (b - a);

// An offscreen canvas of at least 1 x 1 (sizes rounded) and its 2D context as { c, x }, or null without a DOM or a context.
export function offscreen(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const x = c.getContext('2d'); return x ? { c, x } : null; } catch (e) { return null; }
}
// A canvas of exactly w x h (a DOM canvas, else an OffscreenCanvas) and its 2D context as { c, g }, or null. Used by the chrome and
// skin bakes, which also run where only OffscreenCanvas exists.
export function canvas2d(w, h) {
  let c = null;
  if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(1, 1);
  if (!c) return null;
  c.width = w; c.height = h;
  const g = c.getContext && c.getContext('2d');
  return g ? { c, g } : null;
}
