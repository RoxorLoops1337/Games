'use strict';
// Encore Island — shared helpers: math, seeded RNG streams, number formatting, colour mixing.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// integer hash -> 0..1 (stable per index; used for world generation)
function hash01(n) { let x = (n | 0) * 374761393 + 668265263; x = (x ^ (x >>> 13)) * 1274126177; x = x ^ (x >>> 16); return (x >>> 0) / 4294967296; }
function mkRng(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
// gameplay stream (determinism-sensitive: spawns, drops, crits) and a separate visual stream (sparks, jitter)
let mainSeed = 1337, visSeed = 4242;
function seedMain(n) { mainSeed = n >>> 0; }
function rnd() { mainSeed = (mainSeed * 1664525 + 1013904223) >>> 0; return mainSeed / 4294967296; }
function vrnd() { visSeed = (visSeed * 1103515245 + 12345) & 0x7fffffff; return visSeed / 0x7fffffff; }
const SUFFIX = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const e = Math.floor(Math.log10(n) / 3);
  if (e >= SUFFIX.length) return n.toExponential(2).replace('+', '');
  const v = n / Math.pow(1000, e);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + SUFFIX[e];
}
function fmtTime(s) { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? h + 'h ' + m + 'm' : m + 'm ' + (s % 60) + 's'; }
function hexRgb(c) {
  if (c.charCodeAt(0) !== 35) { const m = c.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255]; } // rgb()/rgba() strings from mixc
  if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function mixc(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' + Math.round(lerp(A[1], B[1], t)) + ',' + Math.round(lerp(A[2], B[2], t)) + ')'; }
function rgba(c, a) { const v = hexRgb(c); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + a + ')'; }
// in-place array compaction (no allocation)
function compact(a, keep) { let w = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (keep(v)) a[w++] = v; } a.length = w; }
