// Clawspire 2.0 trailer: shared toolkit.
// Everything here is deterministic: no Math.random, no clocks. Shots receive
// their local time and draw; the same t always paints the same pixels.
//
// Layout space: shots draw in a fixed design space (1920x1080 for the 16:9
// master, 1080x1920 for the vertical cut). The canvas itself may be smaller
// (?scale=0.25 for previews); base(g) applies that scale, so shots never call
// setTransform(1,0,0,1,0,0) themselves.
'use strict';

const QS = new URLSearchParams(location.search);
const VERT = QS.get('fmt') === 'v';
const W = VERT ? 1080 : 1920, H = VERT ? 1920 : 1080, FPS = 60;
const SCALE = +(QS.get('scale') || 1);
const CW = Math.round(W * SCALE), CH = Math.round(H * SCALE);
const ART = '../../clawspire/';
// pick a value per format: L(horizontal, vertical)
const L = (h, v) => VERT ? v : h;

// ---------------------------------------------------------------- music clock
const BPM = 144, BEAT = 60 / BPM, BAR = BEAT * 4, DUR = 25;
const b = n => n * BEAT;                                   // beats -> seconds
// the shared cue sheet (audio.py reads the same file); loaded synchronously so shots can use it at definition time
const CUES = (() => { const x = new XMLHttpRequest(); x.open('GET', 'cues.json', false); x.send(); return JSON.parse(x.responseText); })();
const HITS = {};
for (const h of CUES.hits) (HITS[h.k] = HITS[h.k] || []).push(h.b);
const HB = (k, i = 0) => HITS[k][i];                       // beat of the i-th hit named k

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, c = 1) => Math.max(a, Math.min(c, x));
const lerp = (a, c, u) => a + (c - a) * u;
const inv = (a, c, x) => clamp((x - a) / (c - a));
const smooth = u => u * u * (3 - 2 * u);
const E = {
  linear: u => u,
  inQuad: u => u * u,
  outQuad: u => 1 - (1 - u) * (1 - u),
  inCubic: u => u * u * u,
  outCubic: u => 1 - Math.pow(1 - u, 3),
  inOutCubic: u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  inOutQuad: u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2,
  outQuint: u => 1 - Math.pow(1 - u, 5),
  inQuint: u => u * u * u * u * u,
  inQuart: u => u * u * u * u,
  outQuart: u => 1 - Math.pow(1 - u, 4),
  outExpo: u => u >= 1 ? 1 : 1 - Math.pow(2, -10 * u),
  inExpo: u => u <= 0 ? 0 : Math.pow(2, 10 * u - 10),
  inOutExpo: u => u <= 0 ? 0 : u >= 1 ? 1 : u < .5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2,
  outBack: (u, s = 1.70158) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
  inBack: (u, s = 1.70158) => (s + 1) * u * u * u - s * u * u,
  outElastic: u => u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - .75) * (2 * Math.PI) / 3) + 1,
};
// damped spring 0 -> 1 with overshoot; u in seconds
const spring = (u, freq = 9, damp = 6) => u <= 0 ? 0 : 1 - Math.exp(-damp * u) * Math.cos(freq * u);

function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return n - Math.floor(n); }
function rng(seed) {                                      // mulberry32
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }
// camera shake: smooth noise, amplitude a (px), frequency f (Hz) -> [dx, dy, rot]
function shake(t, a, f = 22, seed = 0) {
  return [(vnoise(t * f + seed) - .5) * 2 * a, (vnoise(t * f + 57.3 + seed) - .5) * 2 * a, (vnoise(t * f * .7 + 91.1 + seed) - .5) * a * .0015];
}
const kick = (t, t0, tau = .12) => t < t0 ? 0 : Math.exp(-(t - t0) / tau);
const pulse = (t, t0, dur) => t >= t0 && t < t0 + dur ? 1 - (t - t0) / dur : 0;
// keyframed scalar: keys [[t, v, ease?], ...] (ease applies to the segment ending at that key)
function keys(ks, t) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1, e] = ks[i];
    if (t <= t1) { const [t0, v0] = ks[i - 1]; return lerp(v0, v1, (e || E.inOutCubic)(inv(t0, t1, t))); }
  }
  return ks[ks.length - 1][1];
}

// ---------------------------------------------------------------- canvas
function base(g) { g.setTransform(SCALE, 0, 0, SCALE, 0, 0); }
function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
const _baked = new Map();
// static art drawn once (keys must change if the content does)
function baked(key, w, h, fn) {
  let c = _baked.get(key);
  if (!c) { c = makeCanvas(w, h); fn(c.getContext('2d'), c); _baked.set(key, c); }
  return c;
}

// ---------------------------------------------------------------- assets
const IMG = {};
const _pending = [];
function img(path) {
  if (IMG[path]) return IMG[path];
  const im = new Image();
  const p = new Promise(res => { im.onload = () => res(); im.onerror = () => { im._bad = true; console.warn('missing', path); res(); }; });
  im.src = path;
  IMG[path] = im;
  _pending.push(p);
  return im;
}
function ok(im) {
  if (!im) return false;
  if (im instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap)) return im.width > 0;
  return im.complete && !im._bad && im.naturalWidth > 0;
}
function assetsReady() { return Promise.all(_pending); }

// ---------------------------------------------------------------- palette + fonts
const C = {
  pink: '#ff4f9a', teal: '#2ee6d6', gold: '#ffc94d', violet: '#120b24', ink: '#0b0618',
  hotpink: '#ff2d86', mint: '#8bfff2', cream: '#fff4e0', orange: '#ff8a1f', purple: '#8a4dff',
};
// families: display (Boldonse, wide heavy), candy (Erica One, the logo),
// ui (Outfit), cond (Big Shoulders, labels)
const F = {
  disp: s => `${s}px "Boldonse"`,
  candy: s => `${s}px "Erica One"`,
  ui: s => `700 ${s}px "Outfit"`,
  uiR: s => `400 ${s}px "Outfit"`,
  cond: s => `700 ${s}px "Big Shoulders"`,
};
function fontsReady() {
  const faces = [['Boldonse', 'fonts/Boldonse-Regular.ttf', '400'], ['Erica One', 'fonts/EricaOne-Regular.ttf', '400'],
    ['Outfit', 'fonts/Outfit-Bold.ttf', '700'], ['Outfit', 'fonts/Outfit-Regular.ttf', '400'], ['Big Shoulders', 'fonts/BigShoulders-Bold.ttf', '700']];
  return Promise.all(faces.map(([fam, url, w]) => new FontFace(fam, `url(${url})`, { weight: w }).load().then(f => document.fonts.add(f))));
}
