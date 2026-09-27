// No Room For Heroes trailer: shared toolkit for the shots.
// Everything here is deterministic: no Math.random, no clocks. Shots receive
// their local time and draw; the same t always paints the same pixels.
'use strict';

const W = 1920, H = 1080, FPS = 60;
const ART = '../../no_room_for_heroes/';

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const inv = (a, b, x) => clamp((x - a) / (b - a));           // 0..1 progress of x through [a,b]
const smooth = u => u * u * (3 - 2 * u);
const E = {
  linear: u => u,
  inQuad: u => u * u,
  outQuad: u => 1 - (1 - u) * (1 - u),
  inCubic: u => u * u * u,
  outCubic: u => 1 - Math.pow(1 - u, 3),
  inOutCubic: u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  outQuint: u => 1 - Math.pow(1 - u, 5),
  inQuint: u => u * u * u * u * u,
  outExpo: u => u >= 1 ? 1 : 1 - Math.pow(2, -10 * u),
  inExpo: u => u <= 0 ? 0 : Math.pow(2, 10 * u - 10),
  inOutExpo: u => u <= 0 ? 0 : u >= 1 ? 1 : u < .5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2,
  outBack: (u, s = 1.70158) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
  inBack: (u, s = 1.70158) => (s + 1) * u * u * u - s * u * u,
  outElastic: u => u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - .75) * (2 * Math.PI) / 3) + 1,
};
// damped spring from 0 to 1 (overshoot), u in seconds
const spring = (u, freq = 9, damp = 6) => u <= 0 ? 0 : 1 - Math.exp(-damp * u) * Math.cos(freq * u);

// deterministic hash noise
function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return n - Math.floor(n); }
function hash2(a, b) { return hash(a * 12.9898 + b * 78.233); }
function rng(seed) {                                      // mulberry32
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }
// camera shake: smooth noise, amplitude a (px), frequency f (Hz)
function shake(t, a, f = 22, seed = 0) {
  return [(vnoise(t * f + seed) - .5) * 2 * a, (vnoise(t * f + 57.3 + seed) - .5) * 2 * a, (vnoise(t * f * .7 + 91.1 + seed) - .5) * a * .0015];
}
// decaying impulse: 1 at t0, e-folding over tau
const kick = (t, t0, tau = .12) => t < t0 ? 0 : Math.exp(-(t - t0) / tau);
// hit-stop: time stands still for `dur` seconds from `at`, then resumes (delayed)
const hitstop = (t, at, dur) => t < at ? t : t < at + dur ? at : t - dur;
const pulse = (t, t0, dur) => t >= t0 && t < t0 + dur ? 1 - (t - t0) / dur : 0;

// ---------------------------------------------------------------- assets
const IMG = {};
const _pending = [];
function img(path) {
  if (IMG[path]) return IMG[path];
  const im = new Image();
  im.decoding = 'sync';
  const p = new Promise(res => { im.onload = () => res(); im.onerror = () => { im._bad = true; console.warn('missing', path); res(); }; });
  im.src = ART + path;
  IMG[path] = im;
  _pending.push(p);
  return im;
}
function ok(im) {
  if (!im) return false;
  if (im instanceof HTMLCanvasElement) return im.width > 0;     // baked canvases are always ready
  return im.complete && !im._bad && im.naturalWidth > 0;
}
function assetsReady() { return Promise.all(_pending); }

// ---------------------------------------------------------------- caches
// Software canvas filters (blur, brightness...) and high-quality downscales are
// the expensive part of a frame, so anything static is baked once.
const _baked = new Map();
function baked(key, w, h, fn) {
  let c = _baked.get(key);
  if (!c) { c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); fn(c.getContext('2d'), c); _baked.set(key, c); }
  return c;
}
// mip pyramid: for a draw at `scr` screen px per source px, return a pre-halved
// level so the per-frame resample is a cheap bilinear one. -> [image, factor]
const _mips = new Map();
function mip(im, scr) {
  if (!(scr < .5) || !ok(im)) return [im, 1];
  const L = Math.min(5, Math.floor(-Math.log2(scr)));
  let lv = _mips.get(im);
  if (!lv) { lv = [im]; _mips.set(im, lv); }
  while (lv.length <= L) {
    const prev = lv[lv.length - 1];
    const pw = prev.naturalWidth || prev.width, ph = prev.naturalHeight || prev.height;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(pw / 2)); c.height = Math.max(1, Math.round(ph / 2));
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(prev, 0, 0, c.width, c.height);
    lv.push(c);
  }
  return [lv[L], Math.pow(2, L)];
}

// ---------------------------------------------------------------- sprites
// A sprite anim: {img, fw, fh, n, row, fps, cols, flip}
//   grid sheets: frame i at (i % cols, row) in fw x fh cells
//   sequences:  {seq:[img...]}
function anim(def) {
  if (def.seq) def.seq = def.seq.map(p => typeof p === 'string' ? img(p) : p);
  else if (typeof def.img === 'string') def.img = img(def.img);
  return def;
}
// draw frame index fi of anim a with its feet (bottom-center of the cell,
// minus a.foot px of cell padding) at x,y; scale s; facing dir (+1 native, -1 mirrored)
function drawAnim(g, a, fi, x, y, s = 1, dir = 1, alpha = 1) {
  const n = a.seq ? a.seq.length : a.n;
  fi = ((Math.floor(fi) % n) + n) % n;
  let im, sx = 0, sy = 0, sw, sh;
  if (a.seq) { im = a.seq[fi]; if (!ok(im)) return; sw = im.naturalWidth; sh = im.naturalHeight; }
  else {
    im = a.img; if (!ok(im)) return;
    const cols = a.cols || Math.floor(im.naturalWidth / a.fw);
    sx = (fi % cols) * a.fw; sy = ((a.row || 0) + Math.floor(fi / cols) * (a.rowStride || 0)) * a.fh; sw = a.fw; sh = a.fh;
  }
  const ax = (a.ax != null ? a.ax : .5) * sw, ay = sh - (a.foot || 0);
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y);
  g.scale(s * dir * (a.flip ? -1 : 1), s);
  g.drawImage(im, sx, sy, sw, sh, -ax, -ay, sw, sh);
  g.restore();
}
function frameAt(a, t) { return Math.floor(t * (a.fps || 10)); }

// ---------------------------------------------------------------- drawing helpers
function cover(g, im, cx = .5, cy = .5, zoom = 1, ox = 0, oy = 0) {   // draw image cover-fit with zoom around (cx,cy)
  if (!ok(im)) return;
  const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * zoom;
  const w = im.naturalWidth * s, h = im.naturalHeight * s;
  g.drawImage(im, W / 2 - w * cx + ox, H / 2 - h * cy + oy, w, h);
}
function glow(g, x, y, r, col, a = 1) {                  // additive radial light
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col.replace('A', a));
  gr.addColorStop(.35, col.replace('A', a * .45));
  gr.addColorStop(1, col.replace('A', 0));
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
// fonts
const F = {
  pix: s => `${s}px "Press Start 2P"`,
  epic: s => `900 ${s}px "Cinzel"`,
  deco: s => `900 ${s}px "Cinzel Decorative"`,
  goth: s => `900 ${s}px "Grenze Gotisch"`,
  pirata: s => `${s}px "Pirata One"`,
};
function fontsReady() {
  const faces = [['Press Start 2P', 'fonts/PressStart2P.woff2', '400'], ['Cinzel', 'fonts/Cinzel900.woff2', '900'],
    ['Cinzel Decorative', 'fonts/CinzelDecorative900.woff2', '900'], ['Grenze Gotisch', 'fonts/GrenzeGotisch900.woff2', '900'],
    ['Pirata One', 'fonts/PirataOne.woff2', '400']];
  return Promise.all(faces.map(([fam, url, w]) => new FontFace(fam, `url(${url})`, { weight: w }).load().then(f => document.fonts.add(f))));
}
