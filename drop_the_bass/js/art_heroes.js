// art_heroes.js: RoxorLoops, Jasmin, Loopy the pedal and the DROP THE BASS logo. AAA pass: lit volumes (key light top left, cool rim light bottom right),
// ambient occlusion, glossy eyes with catchlights and eyelids, hair with highlight bands and lagging secondary motion, plush onesies, brushed metal.
// All canvas code, no files. ctx state is restored by every public function. No Math.random and no Date: all motion comes from t.
// ANCHORS: drawHero (x,y) is the FEET centre (size = full body height). drawBust (x,y) is the centre of the bust box. drawLoopy (x,y) is the centre of the pedal.
// drawLogo (x,y) is the centre of the lockup (w = width).
import { COL } from './data_core.js';

let ART_SCALE = 2;
const logoCache = new Map();
export function setArtScale(n) { ART_SCALE = Math.max(1, Math.min(3, n || 2)); logoCache.clear(); }
export function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}

const OUT = '#140a2c';
const TAU = Math.PI * 2;
const fract = (v) => v - Math.floor(v);
const hn = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------------------------------------ colour helpers
function hexRgb(hex) {
  if (hex[0] === 'r') { const m = hex.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; }
  let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hexA(hex, a) { const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function mix(a, b, k) { const pa = hexRgb(a), pb = hexRgb(b); return 'rgb(' + Math.round(lerp(pa[0], pb[0], k)) + ',' + Math.round(lerp(pa[1], pb[1], k)) + ',' + Math.round(lerp(pa[2], pb[2], k)) + ')'; }
// k > 0 lightens towards white, k < 0 darkens towards the ink colour
function shade(hex, k) { return k >= 0 ? mix(hex, '#ffffff', k) : mix(hex, '#1a0a30', -k); }

// ------------------------------------------------------------------------------------------------ shape helpers (every path builder starts its own path)
function rrP(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
const ellP = (ctx, x, y, rx, ry, rot) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); };
const circP = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); };
function lineW(ctx, x1, y1, x2, y2, w, col, cap) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineCap = cap || 'round'; ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
function glow(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function star4(ctx, x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.26 : r; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fill();
}
function noteGlyph(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ellP(ctx, 0, 0, 4.4, 3.2, -0.4); ctx.fill(); ctx.beginPath(); ctx.moveTo(3.6, -1); ctx.lineTo(3.6, -13); ctx.quadraticCurveTo(8, -11, 8, -6); ctx.stroke(); ctx.restore();
}

// Soft contact shadow / ambient occlusion blob
function aoBlob(ctx, x, y, rx, ry, a, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, hexA(col || '#14082c', a)); g.addColorStop(1, hexA(col || '#14082c', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
}

// A lit volume. fn(ctx) builds the shape path. b is its bounding box {x,y,w,h} in the current space.
// pal = { hi, mid, lo, rim, edge } ; the key light comes from the top left, the rim light from the lower right.
function vol(ctx, fn, b, pal, o) {
  o = o || {};
  const lw = (o.lw == null ? 2.6 : o.lw) * 0.78;
  fn(ctx);
  const cx = b.x + b.w * 0.34, cy = b.y + b.h * 0.28, R = Math.max(b.w, b.h) * 0.98;
  const g = ctx.createRadialGradient(cx, cy, R * 0.04, cx + b.w * 0.1, cy + b.h * 0.12, R);
  g.addColorStop(0, pal.hi); g.addColorStop(0.45, pal.mid); g.addColorStop(1, pal.lo);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); fn(ctx); ctx.clip();
  if (pal.rim) {
    const rg = ctx.createLinearGradient(b.x + b.w * 0.1, b.y + b.h * 0.1, b.x + b.w * 0.95, b.y + b.h * 0.95);
    rg.addColorStop(0, hexA(pal.rim, 0)); rg.addColorStop(0.55, hexA(pal.rim, 0)); rg.addColorStop(1, hexA(pal.rim, o.rimA == null ? 0.75 : o.rimA));
    fn(ctx); ctx.lineWidth = (o.rimW || 3.4); ctx.strokeStyle = rg; ctx.lineJoin = 'round'; ctx.stroke();
  }
  if (o.inner !== false) {
    // feathered inner shadow on the side away from the key light: this is what makes the shape read as a volume
    const sg = ctx.createLinearGradient(b.x + b.w * 0.2, b.y + b.h * 0.2, b.x + b.w, b.y + b.h);
    sg.addColorStop(0, 'rgba(30,8,60,0)'); sg.addColorStop(0.5, 'rgba(30,8,60,0)'); sg.addColorStop(1, 'rgba(30,8,60,0.30)');
    const base = Math.min(b.w, b.h);
    ctx.lineJoin = 'round'; ctx.strokeStyle = sg;
    for (const k of [0.34, 0.22, 0.12]) { fn(ctx); ctx.lineWidth = base * k; ctx.stroke(); }
  }
  if (o.sheen !== false) {
    const hg = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.8, b.y + b.h * 0.8);
    hg.addColorStop(0, 'rgba(255,255,255,0.5)'); hg.addColorStop(0.35, 'rgba(255,255,255,0)');
    fn(ctx); ctx.lineWidth = 2; ctx.strokeStyle = hg; ctx.stroke();
  }
  if (o.inside) o.inside(ctx);
  ctx.restore();
  if (lw > 0) {
    fn(ctx); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
    // heavier ink on the shadow side
    const eg = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    eg.addColorStop(0, hexA(OUT, 0)); eg.addColorStop(0.5, hexA(OUT, 0)); eg.addColorStop(1, hexA(OUT, 1));
    fn(ctx); ctx.lineWidth = lw + 0.9; ctx.strokeStyle = eg; ctx.stroke();
  }
}
function palOf(base, rim) { return { hi: shade(base, 0.38), mid: base, lo: shade(base, -0.34), rim: rim || null }; }

// tapered limb (capsule with a different width at each end), drawn as a lit volume
function limbVol(ctx, x1, y1, x2, y2, w1, w2, pal, bend, o) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const mx = (x1 + x2) / 2 + nx * (bend || 0), my = (y1 + y2) / 2 + ny * (bend || 0);
  const fn = (c) => {
    c.beginPath();
    c.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
    c.quadraticCurveTo(mx + nx * (w1 + w2) / 4, my + ny * (w1 + w2) / 4, x2 + nx * w2 / 2, y2 + ny * w2 / 2);
    c.arc(x2, y2, w2 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, false);
    c.quadraticCurveTo(mx - nx * (w1 + w2) / 4, my - ny * (w1 + w2) / 4, x1 - nx * w1 / 2, y1 - ny * w1 / 2);
    c.arc(x1, y1, w1 / 2, Math.atan2(ny, nx) + Math.PI, Math.atan2(ny, nx), false);
    c.closePath();
  };
  const xs = [x1 - w1, x1 + w1, x2 - w2, x2 + w2, mx], ys = [y1 - w1, y1 + w1, y2 - w2, y2 + w2, my];
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  vol(ctx, fn, { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }, pal, Object.assign({ lw: 2.4 }, o));
  return { mx, my };
}

// ================================================================================================================ POSES
const POSES = {
  idle:  { bob: 1.3, sp: 2.2, hl: [-6, 17], hr: [8, 14], micAng: -0.5, mouth: 0, eye: 'open', tilt: 0 },
  cheer: { bob: 2.2, sp: 5, jump: 4, hl: [-17, -27], hr: [17, -27], micAng: -0.2, mouth: 0.85, eye: 'happy', wave: 3 },
  sing:  { bob: 1.2, sp: 2.4, hl: [-15, 5], hr: [-7, -19], micAng: -1.25, micMouth: true, mouth: 0.6, eye: 'happy', tilt: -0.06, sway: 2 },
  beat:  { bob: 2.6, sp: 8, hl: [-5, -13], hr: [-7, -19], micAng: -1.25, micMouth: true, mouth: 0.3, eye: 'happy', tilt: 0.0, cheeks: true, foot: true },
  sad:   { bob: 0.6, sp: 1.2, hl: [-4, 20], hr: [4, 20], micAng: 1.2, mouth: 0, eye: 'sad', tilt: 0.1, slump: 4 },
  shock: { bob: 1, sp: 14, jump: 2, hl: [-25, -8], hr: [25, -8], micAng: -0.4, mouth: 1, eye: 'wide', tilt: -0.03 },
  talk:  { bob: 1.2, sp: 2.4, hl: [-8, 16], hr: [22, -4], micAng: -0.7, mouth: 0.5, eye: 'open', tilt: 0.04, wave: 4, talkOnly: true },
  point: { bob: 1.4, sp: 2.4, hl: [-9, 13], hr: [36, -13], micAng: 0, mouth: 0.2, eye: 'open', tilt: -0.05 },
  hype:  { bob: 2.4, sp: 6, jump: 3, hl: [-15, -22], hr: [15, -22], micAng: -0.3, mouth: 0.9, eye: 'happy', pump: true },
};
function eyeBlink(t, seed) { const c = (t + seed * 1.7) % 3.6; return c > 3.46 ? 1 - Math.abs(c - 3.53) / 0.07 : 0; }

const HERO = {
  roxor: {
    skin: '#f3c49d', skinHi: '#ffe3c8', skinLo: '#cf9470', warm: '#ee9a78',
    hair: '#7a4428', hairHi: '#d27a42', hairLo: '#341a0c', rim: '#58ffd2',
    tee: '#2c2531', tee2: '#4a4152', pants: '#86ad38', shoe: '#d6ed6b', sole: '#f4ffc4', band: '#9dff3a', eyeI: '#8aa0c8', eyeLo: '#44557c',
    fur: '#46b02c', furHi: '#85e857', furLo: '#2a7618', accent: '#9dff3a', belly: '#b7f27e',
  },
  jasmin: {
    skin: '#f8d5b8', skinHi: '#fff0e0', skinLo: '#d9a888', warm: '#f09a90',
    hair: '#2e1a40', hairHi: '#8a64b8', hairLo: '#150a22', rim: '#ff9ad8',
    top: '#ff63b4', pants: '#3f55ac', shoe: '#ffffff', sole: '#ffd0ea', band: '#ff5fb0', eyeI: '#7a4a2a', eyeLo: '#3a1f10',
    fur: '#f1e6ff', furHi: '#ffffff', furLo: '#c3a8ec', accent: '#ff5fb0', belly: '#ffd8f0',
  },
};

// ------------------------------------------------------------------------------------------------ microphone (held in the hand)
function micDraw(ctx, x, y, ang, band, scale, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(scale || 1, scale || 1);
  // handle: brushed dark metal with a coloured band and a spec streak
  vol(ctx, (c) => rrP(c, -2.9, -2, 5.8, 14, 2.8), { x: -3, y: -2, w: 6, h: 14 }, { hi: '#5c5c70', mid: '#2f2f3c', lo: '#14141c', rim: '#9fe8ff' }, { lw: 2 });
  rrP(ctx, -3, 3, 6, 3.4, 1); const bg = ctx.createLinearGradient(-3, 0, 3, 0); bg.addColorStop(0, shade(band, 0.3)); bg.addColorStop(1, shade(band, -0.3)); ctx.fillStyle = bg; ctx.fill();
  lineW(ctx, -1.2, 7, -1.2, 11, 0.9, 'rgba(255,255,255,0.35)');
  // grille ball with mesh
  vol(ctx, (c) => circP(c, 0, -6, 5.6), { x: -5.6, y: -11.6, w: 11.2, h: 11.2 }, { hi: '#9a9ab0', mid: '#4d4d60', lo: '#1c1c28', rim: '#9fe8ff' }, { lw: 2.2 });
  ctx.save(); circP(ctx, 0, -6, 5.4); ctx.clip(); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let i = -8; i <= 8; i += 2.4) { ctx.beginPath(); ctx.moveTo(i, -12); ctx.lineTo(i + 6, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i + 6, -12); ctx.lineTo(i, 0); ctx.stroke(); }
  ctx.restore();
  circP(ctx, -1.8, -8, 1.5); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ eyes
function eyeDraw(ctx, who, s, kind, blink, ex, ey, skin) {
  const H = HERO[who], j = who === 'jasmin';
  const x = s * ex;
  if (kind === 'happy') {
    ctx.beginPath(); ctx.arc(x, ey + 3, 4.9, Math.PI * 1.08, Math.PI * 1.92); ctx.lineWidth = 3.3; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
    if (j) { lineW(ctx, x + s * 4.4, ey - 1.2, x + s * 7.2, ey - 3.2, 1.7, OUT); lineW(ctx, x + s * 3.8, ey - 0.2, x + s * 6.6, ey - 1, 1.5, OUT); }
    return;
  }
  const rx = j ? 6 : 5.3, ry = kind === 'wide' ? 8.6 : j ? 7.6 : 6.5;
  const lookX = kind === 'sad' ? 0.5 : 0.9, lookY = kind === 'sad' ? 2.4 : 0.5;
  ctx.save(); ellP(ctx, x, ey, rx, ry); ctx.clip();
  const sg = ctx.createLinearGradient(0, ey - ry, 0, ey + ry); sg.addColorStop(0, '#c7bfdc'); sg.addColorStop(0.3, '#f7f4ff'); sg.addColorStop(1, '#ffffff');
  ctx.fillStyle = sg; ctx.fillRect(x - rx, ey - ry, rx * 2, ry * 2);
  const ir = kind === 'wide' ? 3.2 : j ? 4.9 : 4.1, ix = x + lookX, iy = ey + lookY;
  const ig = ctx.createRadialGradient(ix, iy + ir * 0.25, ir * 0.1, ix, iy, ir);
  ig.addColorStop(0, shade(H.eyeI, 0.35)); ig.addColorStop(0.6, H.eyeI); ig.addColorStop(1, H.eyeLo);
  circP(ctx, ix, iy, ir); ctx.fillStyle = ig; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(8,4,20,0.55)'; ctx.stroke();
  circP(ctx, ix, iy, ir * (kind === 'wide' ? 0.36 : 0.5)); ctx.fillStyle = '#080414'; ctx.fill();
  // upper eyelid shadow
  const lg = ctx.createLinearGradient(0, ey - ry, 0, ey - ry * 0.2); lg.addColorStop(0, 'rgba(20,6,40,0.45)'); lg.addColorStop(1, 'rgba(20,6,40,0)');
  ctx.fillStyle = lg; ctx.fillRect(x - rx, ey - ry, rx * 2, ry * 1.2);
  // catchlights: a big one up and right, a small one down and left, and a thin lower glow
  circP(ctx, ix + ir * 0.42, iy - ir * 0.46, ir * 0.36); ctx.fillStyle = '#fff'; ctx.fill();
  circP(ctx, ix - ir * 0.4, iy + ir * 0.42, ir * 0.16); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  ctx.beginPath(); ctx.arc(ix, iy, ir * 0.78, 0.35, 1.2); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  // eyelid for the blink
  if (blink > 0.04) {
    const lh = (ry * 2 + 2) * blink;
    const kg = ctx.createLinearGradient(0, ey - ry, 0, ey - ry + lh); kg.addColorStop(0, shade(skin, -0.12)); kg.addColorStop(1, skin);
    ctx.fillStyle = kg; ctx.fillRect(x - rx - 1, ey - ry - 1, rx * 2 + 2, lh + 1);
    ctx.beginPath(); ctx.moveTo(x - rx, ey - ry + lh); ctx.lineTo(x + rx, ey - ry + lh); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
  }
  ctx.restore();
  // lash line (heavier on top), eye wing and lower lashes for Jasmin
  ctx.beginPath(); ctx.ellipse(x, ey, rx + 0.3, ry + 0.3, 0, Math.PI * 1.04, Math.PI * 1.96); ctx.lineWidth = j ? 2.6 : 2.1; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, ey, rx, ry, 0, 0.1, Math.PI - 0.1); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20,6,40,0.55)'; ctx.stroke();
  if (j) {
    lineW(ctx, x + s * (rx + 0.2), ey - ry * 0.35, x + s * (rx + 3.4), ey - ry * 0.72, 2.1, OUT);
    lineW(ctx, x + s * (rx - 0.4), ey - ry * 0.7, x + s * (rx + 2.4), ey - ry * 1.05, 1.5, OUT);
    lineW(ctx, x - s * 2.4, ey + ry - 0.2, x - s * 3.6, ey + ry + 1.8, 1.2, 'rgba(20,6,40,0.7)');
  }
}

// ------------------------------------------------------------------------------------------------ mouth
function mouthDraw(ctx, who, open, kind, my, talkPhase, cheeks) {
  const j = who === 'jasmin';
  if (kind === 'sad') {
    ctx.beginPath(); ctx.moveTo(-4.5, my + 2.2); ctx.quadraticCurveTo(0, my - 2.2, 4.5, my + 2.2); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke(); return;
  }
  if (open > 0.12) {
    // visemes: o grows with the talk phase, the jaw drops, upper teeth and a tongue show
    const o = open * (0.62 + 0.38 * Math.sin(talkPhase)), wide = 0.75 + 0.25 * Math.sin(talkPhase * 0.5 + 1);
    const w = (kind === 'wide' ? 4.4 : 6.4) * wide, h = 1.8 + o * 6.2;
    const fn = (c) => { c.beginPath(); c.moveTo(-w, my); c.bezierCurveTo(-w * 0.8, my - h * 0.55, w * 0.8, my - h * 0.55, w, my); c.bezierCurveTo(w * 0.9, my + h * 1.5, -w * 0.9, my + h * 1.5, -w, my); c.closePath(); };
    fn(ctx); const g = ctx.createLinearGradient(0, my - h * 0.5, 0, my + h * 1.5); g.addColorStop(0, '#3a0a1e'); g.addColorStop(1, '#8a1a3a'); ctx.fillStyle = g; ctx.fill();
    ctx.save(); fn(ctx); ctx.clip();
    ellP(ctx, 0, my + h * 1.2, w * 0.7, h * 0.7); ctx.fillStyle = '#ff8294'; ctx.fill();
    rrP(ctx, -w * 0.78, my - 1.6, w * 1.56, 2.8 + o * 0.6, 1.2); const tg = ctx.createLinearGradient(0, my - 2, 0, my + 1.4); tg.addColorStop(0, '#fff'); tg.addColorStop(1, '#dcd4e8'); ctx.fillStyle = tg; ctx.fill();
    ctx.restore();
    fn(ctx); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
    if (j) { ctx.beginPath(); ctx.moveTo(-w + 0.8, my - 0.2); ctx.bezierCurveTo(-w * 0.5, my - h * 0.7, w * 0.5, my - h * 0.7, w - 0.8, my - 0.2); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,120,160,0.8)'; ctx.stroke(); }
    return;
  }
  if (who === 'roxor') {
    ctx.beginPath(); ctx.moveTo(-6, my + 1); ctx.quadraticCurveTo(0, my + 5.4, 7.6, my - 1.6); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.6, my + 3.2); ctx.quadraticCurveTo(2.5, my + 3.6, 5.6, my + 0.6); ctx.lineTo(5.1, my - 0.4); ctx.quadraticCurveTo(2, my + 2, -1.6, my + 1.8); ctx.closePath();
    const tg = ctx.createLinearGradient(0, my, 0, my + 3.4); tg.addColorStop(0, '#fff'); tg.addColorStop(1, '#d9d0e6'); ctx.fillStyle = tg; ctx.fill();
    circP(ctx, 8.2, my - 1.4, 1.1); ctx.fillStyle = 'rgba(120,70,60,0.5)'; ctx.fill();  // smirk dimple
  } else {
    ctx.beginPath(); ctx.moveTo(-5.6, my); ctx.quadraticCurveTo(0, my + 6.2, 5.6, my); ctx.quadraticCurveTo(0, my + 2.2, -5.6, my); ctx.closePath();
    const lg = ctx.createLinearGradient(0, my, 0, my + 5); lg.addColorStop(0, '#f0708a'); lg.addColorStop(1, '#c43a62'); ctx.fillStyle = lg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
    ellP(ctx, -1.2, my + 2.2, 1.7, 0.7); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  }
}

// ------------------------------------------------------------------------------------------------ the face (shared egg shape)
const faceP = (c) => {
  c.beginPath(); c.moveTo(0, -19.6);
  c.bezierCurveTo(14, -19.6, 22.4, -10, 21.8, 2); c.bezierCurveTo(21.2, 13, 12.5, 19.8, 0, 20);
  c.bezierCurveTo(-12.5, 19.8, -21.2, 13, -21.8, 2); c.bezierCurveTo(-22.4, -10, -14, -19.6, 0, -19.6); c.closePath();
};
function faceBase(ctx, who, p, t, onesie) {
  const H = HERO[who], j = who === 'jasmin';
  // ears with inner shade
  for (const s of [-1, 1]) {
    vol(ctx, (c) => ellP(c, s * 21.4, 2.5, 4.6, 5.6), { x: s * 21.4 - 4.6, y: -3, w: 9.2, h: 11 }, { hi: H.skinHi, mid: H.skin, lo: H.skinLo, rim: H.rim }, { lw: 2.2, rimA: 0.35 });
    ellP(ctx, s * 21.8, 3, 1.9, 2.8); ctx.fillStyle = hexA(H.warm, 0.55); ctx.fill();
  }
  vol(ctx, faceP, { x: -22, y: -20, w: 44, h: 40 }, { hi: H.skinHi, mid: H.skin, lo: H.skinLo, rim: H.rim }, {
    lw: 3, rimA: 0.4,
    inside: (c) => {
      // jaw core shadow, chin AO, cheek blush, temple warmth
      aoBlob(c, 0, 21, 21, 10, 0.4, '#a0503c');
      aoBlob(c, 12, 4, 11, 9, 0.18, '#a04a3a'); aoBlob(c, 0, -17, 20, 7, 0.28, '#4a2020');
      for (const s of [-1, 1]) aoBlob(c, s * 12.6, 6, j ? 6.4 : 5.6, 4.4, j ? 0.55 : 0.4 + (p.cheeks ? 0.25 : 0), '#ff6a8a');
      // nose: shadow side plus a tiny highlight
      ctx.beginPath(); ctx.moveTo(0.6, 2.6); ctx.quadraticCurveTo(3.2, 5.4, 0.8, 6.8); ctx.lineWidth = 1.7; ctx.strokeStyle = hexA('#8a4a3a', 0.8); ctx.lineCap = 'round'; ctx.stroke();
      circP(c, -0.4, 4.4, 0.9); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
      circP(c, -3.2, -1.6, 7); const sg = c.createRadialGradient(-5, -6, 0, -5, -6, 9); sg.addColorStop(0, 'rgba(255,255,255,0.22)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sg; c.fill();
    },
  });
}

// ------------------------------------------------------------------------------------------------ hair helpers
function hairVol(ctx, fn, b, base, rim, o) {
  vol(ctx, fn, b, { hi: shade(base, 0.45), mid: base, lo: shade(base, -0.55), rim }, Object.assign({ lw: 2.8, rimW: 3 }, o));
}
function strand(ctx, pts, w, col) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.stroke();
}

function headRoxor(ctx, p, t, onesie) {
  const H = HERO.roxor, wob = Math.sin(t * 2.1) * 0.8, lag = Math.sin(t * 2.1 - 0.8);
  if (!onesie) {
    // mullet tail behind, swinging with a lag
    hairVol(ctx, (c) => { c.beginPath(); c.moveTo(-13, 6); c.quadraticCurveTo(-31, 7 + lag, -28 + lag * 2.4, 26); c.quadraticCurveTo(-17, 23, -10, 14); c.closePath(); }, { x: -31, y: 6, w: 22, h: 20 }, H.hair, H.rim);
  } else hoodBack(ctx, 'roxor', t);
  faceBase(ctx, 'roxor', p, t, onesie);
  // stubble and shaved sides
  ctx.save(); faceP(ctx); ctx.clip();
  aoBlob(ctx, 0, 18, 20, 9, 0.28, '#5f3c30');
  for (let i = 0; i < 26; i++) circP(ctx, -15 + hn(i) * 30, 5 + hn(i + 40) * 14, 0.55, 0), ctx.fillStyle = 'rgba(70,40,34,0.5)', ctx.fill();
  if (!onesie) {
    ctx.fillStyle = 'rgba(96,60,42,0.46)'; ellP(ctx, -30, -4, 14, 24); ctx.fill(); ellP(ctx, 30, -4, 14, 24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-24, -26); ctx.lineTo(24, -26); ctx.lineTo(24, -5); ctx.quadraticCurveTo(11, -15, 0, -15.5); ctx.quadraticCurveTo(-11, -15, -24, -5); ctx.closePath(); ctx.fillStyle = '#6a3a22'; ctx.fill();
  }
  ctx.restore();
  // brows, eyes, mouth
  const bw = p.eye === 'sad' ? 1 : 0, ex = 8.6, ey = -2.4;
  for (const s of [-1, 1]) eyeDraw(ctx, 'roxor', s, p.eye, p.blink, ex, ey, H.skin);
  const brow = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 1.8, x2, y2); ctx.lineWidth = 2.5; ctx.strokeStyle = H.hairLo; ctx.lineCap = 'round'; ctx.stroke(); };
  brow(-14, -10.5 - bw * 2, -3.6, -12.5 + bw * 3.4); brow(3.6, -12.5 + bw * 3.4, 14, -10.5 - bw * 2 - (p.eye === 'wide' ? 2 : 0));
  mouthDraw(ctx, 'roxor', p.mouth, p.eye, 11.4, p.talkPh, p.cheeks);
  if (!onesie) {
    // the swooping mohawk: layered lock shapes, highlight bands, a cool rim
    const hp = (c) => {
      c.beginPath(); c.moveTo(-18, -8); c.bezierCurveTo(-27, -22, -23, -38, -9, -42 + wob); c.bezierCurveTo(-3, -53, 11, -50, 15, -44 + wob); c.bezierCurveTo(26, -44, 35, -35, 32, -24);
      c.bezierCurveTo(31, -21, 27, -20, 25, -19); c.bezierCurveTo(27, -26, 23, -28, 18, -25); c.bezierCurveTo(11, -23, 4, -20, -2, -17); c.bezierCurveTo(-8, -15, -13, -12, -18, -8); c.closePath();
    };
    hairVol(ctx, hp, { x: -27, y: -53, w: 62, h: 46 }, H.hair, H.rim, {
      inside: (c) => {
        c.globalCompositeOperation = 'screen';
        strand(c, [-16, -20, -14, -33, -4, -42, 9, -41], 3.4, hexA(H.hairHi, 0.55)); strand(c, [4, -38, 14, -39, 24, -35, 28, -28], 3, hexA(H.hairHi, 0.5));
        strand(c, [-9, -24, -4, -32, 3, -35, 11, -34], 1.6, 'rgba(255,220,170,0.55)');
        c.globalCompositeOperation = 'source-over';
        strand(c, [-7, -22, 0, -29, 8, -27, 15, -24], 2.2, hexA(H.hairLo, 0.6)); strand(c, [-18, -12, -14, -16, -8, -18, -3, -17], 2.4, hexA(H.hairLo, 0.7));
      },
    });
  } else hoodFront(ctx, 'roxor', t);
}

function headJasmin(ctx, p, t, onesie) {
  const H = HERO.jasmin, sw = Math.sin(t * 2.3) * 4, lag = Math.sin(t * 2.3 - 0.9) * 4;
  if (!onesie) {
    // long hair behind
    hairVol(ctx, (c) => { c.beginPath(); c.moveTo(-23, -4); c.quadraticCurveTo(-30, 22, -19, 35 + sw * 0.3); c.quadraticCurveTo(0, 27, 19, 35 - sw * 0.3); c.quadraticCurveTo(30, 22, 23, -4); c.closePath(); },
      { x: -30, y: -4, w: 60, h: 40 }, H.hair, H.rim, { inside: (c) => { c.globalCompositeOperation = 'screen'; strand(c, [-18, 4, -22, 16, -16, 26, -12, 32], 3.4, hexA(H.hairHi, 0.5)); strand(c, [18, 4, 22, 16, 17, 26, 13, 32], 2.4, hexA(H.hairHi, 0.35)); c.globalCompositeOperation = 'source-over'; } });
    // ponytail with lagging swing
    ctx.save(); ctx.translate(-14, -27); ctx.rotate(-0.5 + lag * 0.035);
    hairVol(ctx, (c) => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-9, -7, -25, -2, -26, 15); c.bezierCurveTo(-26, 29, -17, 38, -12, 44); c.bezierCurveTo(-10, 30, -3, 17, 5, 6); c.closePath(); },
      { x: -26, y: -7, w: 31, h: 51 }, H.hair, H.rim, { inside: (c) => { c.globalCompositeOperation = 'screen'; strand(c, [-8, 0, -20, 6, -19, 24, -14, 38], 3.6, hexA(H.hairHi, 0.6)); strand(c, [-3, 2, -12, 8, -11, 22, -8, 32], 1.6, 'rgba(255,230,255,0.45)'); c.globalCompositeOperation = 'source-over'; } });
    ctx.restore();
  } else hoodBack(ctx, 'jasmin', t);
  ellP(ctx, 22.8, 11.5, 2.5, 3.6); ctx.lineWidth = 1.9; ctx.strokeStyle = '#ffc83d'; ctx.stroke();  // hoop earring
  ellP(ctx, 22.8, 11.5, 2.5, 3.6); ctx.lineWidth = 0.8; ctx.strokeStyle = '#fff3b0'; ctx.stroke();
  faceBase(ctx, 'jasmin', p, t, onesie);
  for (const s of [-1, 1]) eyeDraw(ctx, 'jasmin', s, p.eye, p.blink, 8.3, -1.2, H.skin);
  const brow = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 1.4, x2, y2); ctx.lineWidth = 2; ctx.strokeStyle = H.hairLo; ctx.lineCap = 'round'; ctx.stroke(); };
  const sad = p.eye === 'sad' ? 1 : 0;
  brow(-13.8, -11.6 - sad * 2, -3.8, -12 + sad * 3); brow(3.8, -12 + sad * 3, 13.8, -11.6 - sad * 2);
  mouthDraw(ctx, 'jasmin', p.mouth, p.eye, 11.4, p.talkPh, false);
  if (!onesie) {
    // hair cap with side-swept fringe and loose strands
    const cap = (c) => {
      c.beginPath(); c.moveTo(-23, -2); c.bezierCurveTo(-27, -25, -10, -31, 2, -30); c.bezierCurveTo(17, -31, 27, -23, 23, -2);
      c.bezierCurveTo(22, -10, 17, -16, 9, -17.5); c.bezierCurveTo(1, -12, -8, -13, -14, -9); c.bezierCurveTo(-18, -8, -21, -5, -23, -2); c.closePath();
    };
    hairVol(ctx, cap, { x: -27, y: -31, w: 54, h: 29 }, H.hair, H.rim, { inside: (c) => { c.globalCompositeOperation = 'screen'; strand(c, [-18, -20, -9, -29, 4, -29, 14, -25], 3.6, hexA(H.hairHi, 0.7)); strand(c, [-10, -14, -4, -21, 4, -23, 9, -21], 1.6, 'rgba(255,230,255,0.5)'); c.globalCompositeOperation = 'source-over'; } });
    // two thin face-framing strands
    strand(ctx, [-21, -4, -23, 6, -21, 16, -19, 22 + sw * 0.2], 2.6, H.hair); strand(ctx, [21, -4, 23, 6, 21, 16, 19, 22 - sw * 0.2], 2.6, H.hair);
    // scrunchie
    ctx.save(); ctx.translate(-12, -26); ctx.rotate(-0.5 + lag * 0.035);
    vol(ctx, (c) => rrP(c, -5, -5, 11, 10, 4), { x: -5, y: -5, w: 11, h: 10 }, { hi: '#ffb0dc', mid: '#ff5fb0', lo: '#b82a78', rim: '#ffe0f0' }, { lw: 2.3 });
    lineW(ctx, -2, -3.4, -2.4, 3.6, 1.2, 'rgba(120,10,70,0.5)'); lineW(ctx, 2.4, -3.6, 2.2, 3.8, 1.2, 'rgba(120,10,70,0.5)'); lineW(ctx, -3.4, -4, 1, -4.4, 1, 'rgba(255,255,255,0.6)');
    ctx.restore();
  } else hoodFront(ctx, 'jasmin', t);
}

// ------------------------------------------------------------------------------------------------ plush hoods (onesies)
function furTexture(ctx, fn, b, light, dark, n, seed) {
  ctx.save(); fn(ctx); ctx.clip();
  ctx.lineWidth = 0.9; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = b.x + hn(seed + i * 1.7) * b.w, y = b.y + hn(seed + i * 3.1 + 7) * b.h, a = 1.2 + hn(seed + i) * 0.5, l = 2 + hn(seed + i * 5) * 2.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l * 0.6, y + Math.sin(a) * l); ctx.strokeStyle = i % 2 ? hexA(light, 0.5) : hexA(dark, 0.4); ctx.stroke();
  }
  ctx.restore();
}
function fuzzEdge(ctx, fn, col) { fn(ctx); ctx.save(); ctx.setLineDash([0.9, 1.9]); ctx.lineWidth = 1.7; ctx.strokeStyle = col; ctx.stroke(); ctx.restore(); }

function hoodBack(ctx, who, t) {
  const H = HERO[who];
  const body = (c) => ellP(c, 0, -2, 26.5, 24.5);
  if (who === 'roxor') {
    // two cream horns with a ridged shading
    for (const s of [-1, 1]) {
      const hf = (c) => { c.beginPath(); c.moveTo(s * 10, -17); c.quadraticCurveTo(s * 15, -30, s * 14, -42); c.quadraticCurveTo(s * 23, -32, s * 24, -14); c.closePath(); };
      vol(ctx, hf, { x: s > 0 ? 10 : -24, y: -42, w: 14, h: 28 }, { hi: '#fff3d6', mid: '#f1cf96', lo: '#b9854c', rim: '#58ffd2' }, { lw: 2.6, rimA: 0.4 });
      for (let i = 0; i < 3; i++) lineW(ctx, s * (12 + i * 1.6), -20 - i * 6, s * (17 + i * 1.6), -22 - i * 6, 1.1, 'rgba(120,70,30,0.5)');
    }
    vol(ctx, body, { x: -26.5, y: -26.5, w: 53, h: 49 }, { hi: H.furHi, mid: H.fur, lo: H.furLo, rim: '#58ffd2' }, { lw: 3, rimA: 0.35 });
    furTexture(ctx, body, { x: -26, y: -26, w: 52, h: 48 }, H.furHi, H.furLo, 60, 3);
  } else {
    // rainbow mane streaming behind, glossy ribbons
    const cols = ['#ff5fb0', '#ffb02e', '#9dff3a', '#2fe6ff', '#9b6bff'];
    for (let i = 0; i < cols.length; i++) {
      const w = Math.sin(t * 2.2 + i * 0.7) * 3;
      const fn = (c) => { c.beginPath(); c.moveTo(-14 + i * 2, -22); c.quadraticCurveTo(-35 + w, -6 + i * 6, -29 + w * 1.5, 27 + i * 2); };
      fn(ctx); ctx.lineWidth = 7.4; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
      fn(ctx); ctx.lineWidth = 4.4; ctx.strokeStyle = cols[i]; ctx.stroke();
      fn(ctx); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 14 - i * 5; ctx.stroke(); ctx.setLineDash([]);
    }
    vol(ctx, body, { x: -26.5, y: -26.5, w: 53, h: 49 }, { hi: H.furHi, mid: H.fur, lo: H.furLo, rim: '#ff9ad8' }, { lw: 3, rimA: 0.4 });
    furTexture(ctx, body, { x: -26, y: -26, w: 52, h: 48 }, '#ffffff', H.furLo, 60, 9);
  }
}
function hoodFront(ctx, who, t) {
  const H = HERO[who];
  const rim = (c) => { c.beginPath(); c.moveTo(-25, 9); c.bezierCurveTo(-29, -31, 29, -31, 25, 9); c.bezierCurveTo(22, -10, 14, -21, 0, -21); c.bezierCurveTo(-14, -21, -22, -10, -25, 9); c.closePath(); };
  vol(ctx, rim, { x: -29, y: -31, w: 58, h: 40 }, { hi: H.furHi, mid: H.fur, lo: H.furLo, rim: who === 'roxor' ? '#58ffd2' : '#ff9ad8' }, { lw: 3, rimA: 0.4 });
  furTexture(ctx, rim, { x: -29, y: -31, w: 58, h: 40 }, '#ffffff', H.furLo, 40, 21);
  fuzzEdge(ctx, (c) => { c.beginPath(); c.moveTo(-23, 6); c.bezierCurveTo(-21, -10, -14, -19, 0, -19.5); c.bezierCurveTo(14, -19, 21, -10, 23, 6); }, hexA(H.furHi, 0.9));
  if (who === 'roxor') {
    // a tuft of mohawk poking through, tiny stitched stars
    hairVol(ctx, (c) => { c.beginPath(); c.moveTo(-6, -20); c.quadraticCurveTo(-3, -35, 9, -37); c.quadraticCurveTo(4, -29, 8, -20); c.closePath(); }, { x: -6, y: -37, w: 15, h: 17 }, HERO.roxor.hair, '#58ffd2', { lw: 2.4 });
    for (const s of [-1, 1]) { circP(ctx, s * 12.5, -25, 1.8); ctx.fillStyle = H.furLo; ctx.fill(); }
  } else {
    for (const s of [-1, 1]) {
      vol(ctx, (c) => { c.beginPath(); c.moveTo(s * 15, -22); c.lineTo(s * 22, -41); c.lineTo(s * 7, -26); c.closePath(); }, { x: s > 0 ? 7 : -22, y: -41, w: 15, h: 19 }, { hi: '#ffd8ee', mid: '#ffb6dc', lo: '#d97ab4', rim: '#fff' }, { lw: 2.4 });
    }
    // golden spiral horn with shine and a pulsing sparkle
    ctx.save(); ctx.translate(0, -24);
    vol(ctx, (c) => { c.beginPath(); c.moveTo(-6.4, 0); c.lineTo(0, -28); c.lineTo(6.4, 0); c.closePath(); }, { x: -6.4, y: -28, w: 12.8, h: 28 }, { hi: '#fff2b8', mid: '#ffd36b', lo: '#d98f1c', rim: '#fff' }, { lw: 2.6 });
    ctx.save(); ctx.beginPath(); ctx.moveTo(-6.4, 0); ctx.lineTo(0, -28); ctx.lineTo(6.4, 0); ctx.closePath(); ctx.clip();
    for (let i = 0; i < 5; i++) lineW(ctx, -8, -2 - i * 5.6, 8, -8 - i * 5.6, 1.9, i % 2 ? 'rgba(255,255,255,0.8)' : 'rgba(190,110,10,0.5)', 'butt');
    ctx.restore(); ctx.restore();
    star4(ctx, 13, -35 + Math.sin(t * 3) * 1.2, 3.6 + Math.sin(t * 5) * 1, '#fff');
  }
}

// ------------------------------------------------------------------------------------------------ body
function bodyHero(ctx, who, p, t, onesie, bust, br) {
  const H = HERO[who];
  if (!bust) {
    const footUp = p.foot ? Math.max(0, Math.sin(t * p.sp)) * 5 : 0;
    for (const s of [-1, 1]) {
      const lift = s < 0 ? footUp : 0;
      const legBase = onesie ? H.fur : H.pants;
      // leg
      vol(ctx, (c) => rrP(c, s * 7.2 - 5.8, -27, 11.6, 21 - lift, 4.8), { x: s * 7.2 - 6, y: -27, w: 12, h: 21 }, { hi: shade(legBase, 0.34), mid: legBase, lo: shade(legBase, -0.42), rim: onesie ? '#ffffff' : '#9fe8ff' }, {
        lw: 2.6, rimA: 0.35,
        inside: (c) => { if (!onesie) { lineW(c, s * 7 - 4, -19, s * 7 + 3, -17, 1.2, hexA(shade(legBase, -0.55), 0.5)); lineW(c, s * 7 - 3, -13, s * 7 + 4, -12, 1.1, hexA(shade(legBase, -0.55), 0.4)); } },
      });
      // shoe
      const sx = s * 8.4 + (s > 0 ? 1.4 : 0.6), sy = -5 - lift;
      const shoeCol = onesie ? (who === 'roxor' ? H.furLo : '#ffb6dc') : H.shoe;
      vol(ctx, (c) => { c.beginPath(); c.moveTo(sx - 8.6, sy + 1); c.bezierCurveTo(sx - 9, sy - 6, sx - 2, sy - 8, sx + 2, sy - 6); c.bezierCurveTo(sx + 8, sy - 5, sx + 11, sy - 2, sx + 10, sy + 1.5); c.lineTo(sx - 8.6, sy + 3); c.closePath(); },
        { x: sx - 9, y: sy - 8, w: 20, h: 11 }, { hi: shade(shoeCol, 0.4), mid: shoeCol, lo: shade(shoeCol, -0.4), rim: '#ffffff' }, { lw: 2.5, rimA: 0.4 });
      if (!onesie) {
        rrP(ctx, sx - 9.4, sy + 0.6, 20.4, 3.4, 1.6); const sg = ctx.createLinearGradient(0, sy, 0, sy + 4); sg.addColorStop(0, '#fff'); sg.addColorStop(1, H.sole); ctx.fillStyle = sg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        for (let i = 0; i < 3; i++) lineW(ctx, sx - 2 + i * 2.6, sy - 5 + i * 0.4, sx + 0.4 + i * 2.6, sy - 4 + i * 0.4, 1, 'rgba(20,10,40,0.55)');
        if (who === 'jasmin') lineW(ctx, sx - 5, sy - 1, sx + 6, sy - 1.5, 1.8, '#ff5fb0');
      }
      aoBlob(ctx, sx, 2, 11, 3, 0.18);
    }
  }
  // torso (breathes)
  const breathe = 1 + br * 0.018;
  ctx.save(); ctx.translate(0, -36); ctx.scale(1, breathe); ctx.translate(0, 36);
  const torsoFn = (c) => {
    c.beginPath(); c.moveTo(-14.6, -52); c.quadraticCurveTo(0, -55.5, 14.6, -52); c.bezierCurveTo(17.6, -48, 16.6, -34, 15.6, -21.5);
    c.quadraticCurveTo(0, -17.5, -15.6, -21.5); c.bezierCurveTo(-16.6, -34, -17.6, -48, -14.6, -52); c.closePath();
  };
  const tb = { x: -17.6, y: -55.5, w: 35.2, h: 38 };
  if (onesie) {
    vol(ctx, torsoFn, tb, { hi: H.furHi, mid: H.fur, lo: H.furLo, rim: who === 'roxor' ? '#58ffd2' : '#ff9ad8' }, { lw: 3, rimA: 0.4 });
    furTexture(ctx, torsoFn, tb, '#ffffff', H.furLo, 70, 13);
    // belly patch
    ellP(ctx, 0, -35, 8.6, 11.4); ctx.fillStyle = hexA(H.belly, 0.7); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = hexA(H.furLo, 0.5); ctx.stroke();
    if (who === 'roxor') { ctx.save(); torsoFn(ctx); ctx.clip(); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-12 + i * 8, -26); ctx.lineTo(-9 + i * 8, -21); ctx.lineTo(-6 + i * 8, -26); ctx.closePath(); ctx.fillStyle = '#f6e6c4'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); } ctx.restore(); }
    else star4(ctx, 0, -36, 5.4 + Math.sin(t * 3) * 0.4, '#ffd36b');
    lineW(ctx, 0, -52, 0, -21.5, 1.4, hexA(H.furLo, 0.6));  // zipper line
    fuzzEdge(ctx, torsoFn, hexA(H.furHi, 0.8));
  } else if (who === 'roxor') {
    vol(ctx, torsoFn, tb, { hi: shade(H.tee, 0.28), mid: H.tee, lo: shade(H.tee, -0.5), rim: '#58ffd2' }, {
      lw: 3, rimA: 0.5,
      inside: (c) => {
        // cloth folds and a collar shadow
        for (const f of [[-9, -46, -5, -30], [8, -47, 6, -29], [-3, -26, 3, -23]]) { c.beginPath(); c.moveTo(f[0], f[1]); c.quadraticCurveTo((f[0] + f[2]) / 2 - 3, (f[1] + f[3]) / 2, f[2], f[3]); c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.38)'; c.stroke(); c.beginPath(); c.moveTo(f[0] + 2, f[1]); c.quadraticCurveTo((f[0] + f[2]) / 2 - 1, (f[1] + f[3]) / 2, f[2] + 2, f[3]); c.lineWidth = 0.9; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.stroke(); }
        ellP(c, 0, -53, 7, 3.2); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
      },
    });
    // the orange smiley, glossy
    vol(ctx, (c) => circP(c, 0, -37, 8.8), { x: -8.8, y: -45.8, w: 17.6, h: 17.6 }, { hi: '#ffe0a0', mid: '#ffb44d', lo: '#e07a1c', rim: '#fff' }, { lw: 2.4, rimA: 0.3 });
    circP(ctx, -3, -39.4, 1.4); ctx.fillStyle = OUT; ctx.fill(); circP(ctx, 3, -39.4, 1.4); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -36.6, 4.8, 0.2, Math.PI - 0.2); ctx.lineWidth = 1.9; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
    ellP(ctx, -3.4, -43, 2.6, 1.2, -0.5); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill();
  } else {
    vol(ctx, torsoFn, tb, { hi: shade(H.top, 0.4), mid: H.top, lo: shade(H.top, -0.38), rim: '#ffe0f4' }, {
      lw: 3, rimA: 0.55,
      inside: (c) => {
        for (const f of [[-9, -46, -6, -32], [9, -46, 6, -32]]) { c.beginPath(); c.moveTo(f[0], f[1]); c.quadraticCurveTo((f[0] + f[2]) / 2 - 2, (f[1] + f[3]) / 2, f[2], f[3]); c.lineWidth = 1.4; c.strokeStyle = hexA(shade(H.top, -0.6), 0.5); c.stroke(); }
        ellP(c, 0, -53, 6.5, 3); c.fillStyle = 'rgba(120,10,70,0.4)'; c.fill();
        lineW(c, -15, -30, 15, -30, 1.4, hexA(shade(H.top, -0.6), 0.45));
      },
    });
    // jeans waistband
    vol(ctx, (c) => rrP(c, -15.6, -27.5, 31.2, 7.4, 3), { x: -15.6, y: -27.5, w: 31.2, h: 7.4 }, { hi: shade(H.pants, 0.3), mid: H.pants, lo: shade(H.pants, -0.45), rim: '#9fe8ff' }, { lw: 2.4, rimA: 0.35 });
    circP(ctx, 0, -23.8, 1.4); ctx.fillStyle = '#ffd36b'; ctx.fill();
    // heart necklace
    ctx.beginPath(); ctx.moveTo(-8.4, -52); ctx.quadraticCurveTo(0, -37.5, 8.4, -52); ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffe9a8'; ctx.stroke();
    ctx.save(); ctx.translate(0, -42);
    vol(ctx, (c) => { c.beginPath(); c.moveTo(0, 3.8); c.bezierCurveTo(-6.4, -1, -4.4, -5.6, 0, -2.6); c.bezierCurveTo(4.4, -5.6, 6.4, -1, 0, 3.8); }, { x: -5.4, y: -4.4, w: 10.8, h: 8.2 }, { hi: '#ff9ac0', mid: '#ff3d7f', lo: '#a01650', rim: '#fff' }, { lw: 1.8, rimA: 0.3 });
    circP(ctx, -1.8, -1.6, 0.9); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill(); ctx.restore();
  }
  ctx.restore();
  // neck with a core shadow where the head sits
  vol(ctx, (c) => rrP(c, -4.8, -57, 9.6, 8, 2), { x: -4.8, y: -57, w: 9.6, h: 8 }, onesie ? { hi: H.furHi, mid: H.fur, lo: H.furLo } : { hi: H.skinHi, mid: H.skin, lo: H.skinLo }, { lw: 0, sheen: false });
  aoBlob(ctx, 0, -54, 8, 3.4, 0.4, '#3a1010');
}

// ------------------------------------------------------------------------------------------------ arms and hands
function handDraw(ctx, x, y, who, onesie, grip, ang) {
  const H = HERO[who];
  const pal = onesie ? { hi: H.furHi, mid: H.fur, lo: H.furLo, rim: '#fff' } : { hi: H.skinHi, mid: H.skin, lo: H.skinLo, rim: H.rim };
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
  vol(ctx, (c) => ellP(c, 0, 0, 4.9, 4.4), { x: -4.9, y: -4.4, w: 9.8, h: 8.8 }, pal, { lw: 2.3, rimA: 0.4 });
  if (grip) { // fingers wrapped over the mic handle
    for (let i = 0; i < 3; i++) { vol(ctx, (c) => rrP(c, -4.6 + i * 3.1, -0.4, 3.1, 4.6, 1.5), { x: -4.6 + i * 3.1, y: -0.4, w: 3.1, h: 4.6 }, { hi: pal.hi, mid: pal.mid, lo: pal.lo }, { lw: 1.4, sheen: false }); }
    vol(ctx, (c) => ellP(c, -4.4, -2.2, 1.9, 2.8, 0.5), { x: -6, y: -5, w: 3.6, h: 5.6 }, pal, { lw: 1.4, sheen: false });
  }
  ctx.restore();
}
function armsHero(ctx, who, p, t, onesie, side) {
  const H = HERO[who];
  const ph = t * (p.sp || 2);
  const hl = [p.hl[0], p.hl[1]], hr = [p.hr[0], p.hr[1]];
  if (p.wave) { hr[0] += Math.sin(ph * 1.1) * p.wave; hr[1] += Math.cos(ph) * p.wave; hl[0] += Math.sin(ph * 1.1 + 2) * p.wave * 0.6; }
  if (p.pump) { hl[1] += Math.sin(ph) * 7; hr[1] += Math.sin(ph + Math.PI) * 7; }
  if (p.sway) { hl[0] += Math.sin(ph) * p.sway; hl[1] += Math.cos(ph) * p.sway; }
  if (p.micMouth && p.mouth > 0) hr[0] += Math.sin(ph * 2) * 0.6;
  if (p.foot) hl[1] += Math.sin(ph) * 2.4;
  const sh = [[-13, -46.5], [13, -46.5]];
  const skinPal = { hi: H.skinHi, mid: H.skin, lo: H.skinLo, rim: H.rim };
  const furPal = { hi: H.furHi, mid: H.fur, lo: H.furLo, rim: '#ffffff' };
  const sleeveCol = who === 'roxor' ? HERO.roxor.tee : H.top;
  const drawArm = (s, hand, bend, mic) => {
    const x0 = sh[s][0], y0 = sh[s][1], x1 = x0 + hand[0], y1 = y0 + hand[1];
    limbVol(ctx, x0, y0, x1, y1, 8, 6.4, onesie ? furPal : skinPal, bend);
    if (!onesie) { // short sleeve cap over the shoulder
      const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      limbVol(ctx, x0 - ux * 1.5, y0 - uy * 1.5, x0 + ux * 8.5, y0 + uy * 8.5, 10.4, 9.4, { hi: shade(sleeveCol, 0.32), mid: sleeveCol, lo: shade(sleeveCol, -0.45), rim: '#ffffff' }, bend * 0.2, { lw: 2.4 });
    }
    return [x1, y1];
  };
  if (side !== 'r') {
    const [hx, hy] = drawArm(0, hl, 2);
    handDraw(ctx, hx, hy, who, onesie, false, 0);
  }
  if (side === 'l') return;
  const [hx, hy] = drawArm(1, hr, -2);
  micDraw(ctx, hx, hy, p.micAng + (p.tilt || 0), H.band, 0.95, t);
  handDraw(ctx, hx, hy + 1.5, who, onesie, true, p.micAng + (p.tilt || 0));
}

// ------------------------------------------------------------------------------------------------ public: hero and bust
export function drawHero(ctx, who, x, y, size, o) {
  o = o || {}; who = who === 'jasmin' ? 'jasmin' : 'roxor';
  const t = o.t || 0, onesie = o.outfit === 'onesie', k = size / 112;
  const p = Object.assign({}, POSES[o.pose] || POSES.idle);
  if (o.talk) p.mouth = Math.max(p.mouth || 0, 0.55);
  if (p.talkOnly && !o.talk) p.mouth = 0.1;
  p.blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  p.talkPh = t * 16;
  const ph = t * p.sp;
  const bob = Math.sin(ph) * (p.bob || 1);
  const jump = p.jump ? Math.abs(Math.sin(ph * 0.9)) * p.jump : 0;
  const weight = Math.sin(t * 1.1) * 0.8;      // slow weight shift
  ctx.save();
  ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1);
  ctx.scale(k, k);
  aoBlob(ctx, 0, 1, 25 - jump * 0.7, 6, 0.5);                // soft contact shadow
  ctx.translate(weight * 0.5, -jump - (p.slump ? p.slump * 0.4 : 0));
  ctx.save();
  bodyHero(ctx, who, p, t, onesie, false, Math.sin(t * 1.9));
  armsHero(ctx, who, p, t, onesie, p.micMouth ? 'l' : null);
  ctx.restore();
  ctx.save(); ctx.translate(Math.sin(ph) * (p.sway ? 1.2 : 0.4) + weight * 0.4, -73 + bob * 0.8 + (p.slump || 0)); ctx.rotate(p.tilt + Math.sin(ph * 0.5) * 0.02 + Math.sin(t * 1.3) * 0.012);
  (who === 'roxor' ? headRoxor : headJasmin)(ctx, p, t, onesie);
  ctx.restore();
  if (p.micMouth) armsHero(ctx, who, p, t, onesie, 'r');
  ctx.restore();
}

// head and shoulders portrait. (x,y) = centre of the bust box, size = box height.
export function drawBust(ctx, who, x, y, size, o) {
  o = o || {}; who = who === 'jasmin' ? 'jasmin' : 'roxor';
  const t = o.t || 0, onesie = o.outfit === 'onesie', k = size / 78;
  const p = Object.assign({}, POSES[o.pose] || POSES.idle);
  if (o.talk) p.mouth = Math.max(p.mouth || 0, 0.55);
  p.blink = eyeBlink(t, who === 'jasmin' ? 2 : 0); p.talkPh = t * 16;
  ctx.save(); ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1); ctx.scale(k, k); ctx.translate(0, 77);
  ctx.beginPath(); ctx.rect(-44, -118, 88, 82); ctx.clip();
  const bob = Math.sin(t * p.sp) * p.bob * 0.5;
  ctx.translate(0, bob);
  bodyHero(ctx, who, p, t, onesie, true, Math.sin(t * 1.9));
  ctx.save(); ctx.translate(0, -73 + (p.slump || 0)); ctx.rotate(p.tilt + Math.sin(t * 1.3) * 0.012);
  (who === 'roxor' ? headRoxor : headJasmin)(ctx, p, t, onesie);
  ctx.restore();
  ctx.restore();
}

// ================================================================================================================ LOOPY
// Loopy the loop-station pedal: painted metal case, glass screen with a glowing pixel face, chrome footswitch feet, a cable tail with lagging physics.
// (x,y) = centre of the pedal, size = height of the whole sprite.
const MOODS = { happy: '#2fe6ff', excited: '#9dff3a', worried: '#ffb02e', sleepy: '#8a9cff' };
// 5 x 6 pixel eye shapes
const EYE_PX = {
  open:  ['.###.', '#####', '#####', '#####', '#####', '.###.'],
  wide:  ['.###.', '##.##', '#...#', '##.##', '#####', '.###.'],
  half:  ['.....', '.....', '#####', '#####', '.###.', '.....'],
  line:  ['.....', '.....', '.....', '#####', '.....', '.....'],
  happy: ['.###.', '#...#', '#...#', '.....', '.....', '.....'],
  shut:  ['.....', '.....', '.....', '.###.', '#...#', '.....'],
};
function pixelBlock(ctx, rows, x, y, px, col) {
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') ctx.fillRect(x + c * px, y + r * px, px - 0.15, px - 0.15);
}
export function drawLoopy(ctx, x, y, size, o) {
  o = o || {}; const t = o.t || 0, mood = MOODS[o.mood] ? o.mood : 'happy', k = size / 100, gl = MOODS[mood];
  const hopPh = Math.abs(Math.sin(t * 7)), hop = mood === 'excited' ? hopPh * 7 : mood === 'sleepy' ? 0 : Math.sin(t * 2.4) * 1.5;
  const squash = mood === 'excited' ? 1 - 0.1 * Math.pow(1 - hopPh, 3) + 0.05 * hopPh : 1 + Math.sin(t * 2.4) * 0.012 * (mood === 'sleepy' ? 0.4 : 1);
  ctx.save(); ctx.translate(x, y - Math.max(0, hop) * k); ctx.scale(k, k);
  aoBlob(ctx, 0, 52 + hop, 44 - hop * 0.6, 7, 0.5);
  // cable tail: a chain of segments, each lagging the one before
  { let px = 40, py = 24, a = 0.05; const segs = 9, len = 5.4; const pts = [[px, py]];
    for (let i = 0; i < segs; i++) { a += Math.sin(t * 3 - i * 0.55) * 0.2 + 0.09; px += Math.cos(a) * len; py += Math.sin(a) * len + 0.45; pts.push([px, py]); }
    const path = (c) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); };
    path(ctx); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 7.4; ctx.strokeStyle = OUT; ctx.stroke();
    path(ctx); ctx.lineWidth = 4.6; ctx.strokeStyle = '#ffb02e'; ctx.stroke();
    path(ctx); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.translate(-0.8, -1); ctx.stroke(); ctx.translate(0.8, 1);
    const e = pts[pts.length - 1]; vol(ctx, (c) => rrP(c, e[0] - 1, e[1] - 4, 10, 8, 2), { x: e[0] - 1, y: e[1] - 4, w: 10, h: 8 }, { hi: '#e8e8f4', mid: '#9a9ab4', lo: '#4a4a62' }, { lw: 2 }); }
  ctx.save(); ctx.translate(0, 44); ctx.scale(1, squash); ctx.translate(0, -44);
  // chassis: painted metal with a bevelled top and brushed lines
  const body = (c) => rrP(c, -44, -34, 88, 78, 16);
  vol(ctx, body, { x: -44, y: -34, w: 88, h: 78 }, { hi: '#9c86ff', mid: '#5a44c4', lo: '#2a1c78', rim: '#9fe8ff' }, {
    lw: 3.2, rimA: 0.6,
    inside: (c) => {
      c.lineWidth = 0.6; for (let i = 0; i < 26; i++) { c.beginPath(); c.moveTo(-44, -33 + i * 3); c.lineTo(44, -33 + i * 3 + (i % 3) * 0.3); c.strokeStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(10,0,40,0.1)'; c.stroke(); }
      rrP(c, -44, -34, 88, 22, 16); const tg = c.createLinearGradient(0, -34, 0, -12); tg.addColorStop(0, 'rgba(255,255,255,0.34)'); tg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = tg; c.fill();
      lineW(c, -40, 41, 40, 41, 2, 'rgba(0,0,30,0.3)');
    },
  });
  for (const sx of [-37, 37]) for (const sy of [-27, 37]) { circP(ctx, sx, sy, 2.6); const sg = ctx.createRadialGradient(sx - 0.8, sy - 0.8, 0.2, sx, sy, 2.6); sg.addColorStop(0, '#fff'); sg.addColorStop(1, '#8a8aa8'); ctx.fillStyle = sg; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.stroke(); lineW(ctx, sx - 1.5, sy + 0.8, sx + 1.5, sy - 0.8, 0.9, 'rgba(20,10,40,0.7)'); }
  // knurled chrome knobs with coloured pointers
  for (let i = 0; i < 3; i++) {
    const kx = -22 + i * 22, ky = -25, ang = Math.sin(t * 0.7 + i * 1.3) * 0.6 - 0.3 + i * 0.4;
    aoBlob(ctx, kx + 1, ky + 3, 8, 4, 0.45);
    vol(ctx, (c) => circP(c, kx, ky, 6), { x: kx - 6, y: ky - 6, w: 12, h: 12 }, { hi: '#ffffff', mid: '#b4b4cc', lo: '#5a5a78', rim: '#9fe8ff' }, { lw: 1.9, rimA: 0.5 });
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(ang); for (let n = 0; n < 12; n++) { ctx.rotate(TAU / 12); lineW(ctx, 4.4, 0, 5.6, 0, 0.8, 'rgba(30,20,60,0.55)'); } lineW(ctx, 0, -0.4, 0, -5, 1.6, ['#ff4a5e', '#ffd23c', '#9dff3a'][i]); ctx.restore();
  }
  // glass screen
  const scr = (c) => rrP(c, -35, -16, 70, 33, 8);
  vol(ctx, scr, { x: -35, y: -16, w: 70, h: 33 }, { hi: '#1c1a48', mid: '#0a0924', lo: '#04041a' }, { lw: 3, sheen: false, inner: false });
  ctx.save(); scr(ctx); ctx.clip();
  glow(ctx, 0, 0, 34, gl, 0.28 + 0.06 * Math.sin(t * 3));
  const blinkOn = (t % 3.2) > 3.06;
  const px = 3.1;
  ctx.fillStyle = gl;
  const eyeKind = mood === 'excited' ? 'happy' : mood === 'worried' ? 'wide' : mood === 'sleepy' ? (Math.sin(t * 0.8) > 0.2 ? 'line' : 'half') : (blinkOn ? 'line' : 'open');
  const ey = -11 + (mood === 'sleepy' ? 2 : 0) + (mood === 'excited' ? -Math.abs(Math.sin(t * 7)) * 0.8 : 0);
  for (const s of [-1, 1]) {
    const exx = s * 12.5 - 7.75;
    ctx.save(); ctx.shadowColor = gl; ctx.shadowBlur = 0; pixelBlock(ctx, EYE_PX[eyeKind], exx, ey, px, gl);
    if (eyeKind === 'open') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(exx + px * 3, ey + px * 0.8, px, px); ctx.fillStyle = gl; }
    ctx.restore();
    if (mood === 'worried') { ctx.fillRect(s * 13 - 8, ey - 4 + (s < 0 ? 0 : 0), 16, 2); ctx.fillRect(s * 13 + s * 4 - 3, ey - 6 + (s > 0 ? -1 : 0), 6, 2); }
  }
  // mouth in pixel rows
  const my = 7;
  if (o.talk) { const mh = 1 + Math.floor(1.5 + 1.5 * Math.sin(t * 17)); ctx.fillRect(-6, my - mh / 2, 12, mh * 1.6 + 1); }
  else if (mood === 'worried') { ctx.fillRect(-5, my + 1, 10, 2); ctx.fillRect(-7, my + 3, 3, 2); ctx.fillRect(4, my + 3, 3, 2); }
  else if (mood === 'sleepy') { ctx.fillRect(-3, my + 1, 6, 2); }
  else { ctx.fillRect(-7, my, 3, 2); ctx.fillRect(-4, my + 2, 8, 2); ctx.fillRect(4, my, 3, 2); }
  ctx.fillStyle = gl;
  // scanlines, vignette and the glass reflection
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (let yy = -16; yy < 18; yy += 2.4) ctx.fillRect(-35, yy, 70, 1);
  const rg = ctx.createLinearGradient(-35, -16, 20, 17); rg.addColorStop(0, 'rgba(255,255,255,0.22)'); rg.addColorStop(0.42, 'rgba(255,255,255,0.05)'); rg.addColorStop(0.43, 'rgba(255,255,255,0)'); ctx.fillStyle = rg; ctx.fillRect(-35, -16, 70, 33);
  ctx.restore();
  scr(ctx); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke();
  // footswitches: chrome domes that squash when pressed, with glowing LEDs
  for (const s of [-1, 1]) {
    const fx = s * 22, press = mood === 'excited' ? Math.max(0, Math.sin(t * 7 + (s > 0 ? Math.PI : 0))) * 2.4 : 0;
    const on = (Math.floor(t * 2) + (s > 0 ? 1 : 0)) % 2, led = s < 0 ? '#ff4a5e' : '#9dff3a';
    glow(ctx, fx, 22.5, 9, on ? led : '#3a2a5a', on ? 0.6 : 0);
    circP(ctx, fx, 22.5, 2.5); ctx.fillStyle = on ? led : '#3a2a5a'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
    aoBlob(ctx, fx + 1, 35, 12, 5, 0.5);
    ctx.save(); ctx.translate(fx, 31 + press); ctx.scale(1, 1 - press * 0.04);
    vol(ctx, (c) => circP(c, 0, 0, 10.4), { x: -10.4, y: -10.4, w: 20.8, h: 20.8 }, { hi: '#ffffff', mid: '#b8b8d2', lo: '#58587a', rim: '#9fe8ff' }, { lw: 2.6, rimA: 0.5 });
    circP(ctx, 0, 0, 6.6); ctx.fillStyle = 'rgba(60,60,100,0.35)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
    ellP(ctx, -3, -4, 3.4, 1.8, -0.5); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  if (mood === 'excited') for (let i = 0; i < 3; i++) star4(ctx, -30 + i * 30, -44 - ((t * 20 + i * 9) % 14), 3.4, '#fff3a0');
  if (mood === 'sleepy') for (let i = 0; i < 2; i++) { const zz = (t * 0.7 + i * 0.5) % 1; ctx.globalAlpha = 1 - zz; ctx.fillStyle = '#c9bcff'; ctx.font = '900 ' + (11 + i * 5) + 'px sans-serif'; ctx.fillText('z', 34 + i * 7, -36 - zz * 18); ctx.globalAlpha = 1; }
  ctx.restore();
}

// ================================================================================================================ LOGO
// DROP THE BASS. Candy-pink DROP over acid-green BASS with a cyan THE ribbon: extruded, outlined, glossy, with a light sweep and bass shockwaves.
const FAM = '"Impact","Arial Black","Haettenschweiler",sans-serif';
const PAL_DROP = { top: '#ffe0f0', mid: '#ff4fa6', bot: '#d4137a', deep: '#7a0a46', glow: '#ff5fb0' };
const PAL_BASS = { top: '#f6ffc8', mid: '#a6ff3c', bot: '#38a01a', deep: '#1f5a10', glow: '#9dff3a' };
function logoGeom(w, measure) {
  const mw = measure ? measure('DROP', 100) : 4 * 58;
  const big = Math.min(100 * (w * 0.92) / mw, w * 0.34);
  return { big, sm: big * 0.34, g1: -big * 0.5, g2: big * 0.54 };
}
function paintWord(c, txt, yy, size, pal, rot, faceOnly) {
  c.save(); c.rotate(rot); c.font = '900 ' + size + 'px ' + FAM; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  const ext = Math.max(5, Math.round(size * 0.11));
  if (!faceOnly) {
    // extrusion: one outline at the deepest point, then coloured slabs from deep to shallow so the sides read as a solid candy block
    c.lineWidth = size * 0.17; c.strokeStyle = OUT; c.strokeText(txt, ext * 0.5, yy + ext * 1.15);
    for (let d = ext; d >= 1; d--) { const k = d / ext; c.fillStyle = mix(pal.bot, pal.deep, k * 0.9); c.fillText(txt, d * 0.5, yy + d * 1.15); c.lineWidth = size * 0.012; c.strokeStyle = hexA(OUT, 0.35); c.strokeText(txt, d * 0.5, yy + d * 1.15); }
    c.lineWidth = size * 0.15; c.strokeStyle = OUT; c.strokeText(txt, 0, yy);
  }
  const g = c.createLinearGradient(0, yy - size * 0.5, 0, yy + size * 0.5);
  g.addColorStop(0, pal.top); g.addColorStop(0.42, pal.mid); g.addColorStop(1, pal.bot);
  c.fillStyle = g; c.fillText(txt, 0, yy);
  if (!faceOnly) {
    // bounce light from below, a glossy top highlight and a thin bright rim
    const bg = c.createLinearGradient(0, yy + size * 0.1, 0, yy + size * 0.5); bg.addColorStop(0, hexA(pal.glow, 0)); bg.addColorStop(1, hexA(pal.top, 0.65)); c.fillStyle = bg; c.fillText(txt, 0, yy);
    const hg = c.createLinearGradient(0, yy - size * 0.5, 0, yy + size * 0.02); hg.addColorStop(0, 'rgba(255,255,255,0.8)'); hg.addColorStop(0.75, 'rgba(255,255,255,0.12)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = hg; c.fillText(txt, 0, yy - size * 0.02);
    c.lineWidth = Math.max(1, size * 0.02); c.strokeStyle = hexA(pal.top, 0.95); c.strokeText(txt, 0, yy - size * 0.008);
  }
  c.restore();
}
function paintTheRibbon(c, sm) {
  c.save(); c.rotate(-0.04);
  vol(c, (cc) => rrP(cc, -sm * 1.3, -sm * 0.55, sm * 2.6, sm * 1.1, sm * 0.3), { x: -sm * 1.3, y: -sm * 0.55, w: sm * 2.6, h: sm * 1.1 }, { hi: '#a8f6ff', mid: '#2fe6ff', lo: '#0c8ec8', rim: '#ffffff' }, { lw: 3.4, rimA: 0.5 });
  c.font = '900 ' + sm * 0.8 + 'px ' + FAM; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = sm * 0.1; c.strokeStyle = 'rgba(255,255,255,0.5)'; c.strokeText('THE', 0, sm * 0.07); c.fillStyle = OUT; c.fillText('THE', 0, sm * 0.04);
  c.restore();
}
function paintLogoLayers(c, G, face) {
  c.save(); c.rotate(0); 
  if (!face) {
    c.save(); paintWord(c, 'DROP', G.g1, G.big, PAL_DROP, -0.045); c.restore();
    c.save(); paintWord(c, 'BASS', G.g2, G.big * 1.02, PAL_BASS, 0.03); c.restore();
    paintTheRibbon(c, G.sm);
  } else {
    c.fillStyle = '#fff';
    paintWord(c, 'DROP', G.g1, G.big, { top: '#fff', mid: '#fff', bot: '#fff' }, -0.045, true);
    paintWord(c, 'BASS', G.g2, G.big * 1.02, { top: '#fff', mid: '#fff', bot: '#fff' }, 0.03, true);
  }
  c.restore();
}

export function drawLogo(ctx, x, y, w, t) {
  t = t || 0; const bass = (t * 2) % 1, pulse = Math.pow(Math.max(0, 1 - bass * 2.4), 2);
  ctx.save(); ctx.translate(x, y);
  // bass-drop shockwaves and a speaker-cone glow behind the words
  for (let i = 0; i < 3; i++) {
    const kk = ((t * 0.55) + i / 3) % 1;
    ctx.beginPath(); ctx.ellipse(0, 0, w * (0.18 + kk * 0.5), w * (0.1 + kk * 0.28), 0, 0, TAU); ctx.lineWidth = 3 + (1 - kk) * 5; ctx.strokeStyle = hexA('#ff5fb0', 0.5 * (1 - kk)); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = hexA('#2fe6ff', 0.35 * (1 - kk)); ctx.stroke();
  }
  glow(ctx, 0, 0, w * 0.66, '#9b6bff', 0.38 + pulse * 0.28);
  glow(ctx, -w * 0.18, -w * 0.12, w * 0.4, '#ff5fb0', 0.25 + pulse * 0.2); glow(ctx, w * 0.2, w * 0.14, w * 0.4, '#9dff3a', 0.18 + pulse * 0.16);
  const sc = 1 + pulse * 0.045;
  ctx.scale(sc, sc);
  const meas = (txt, sz) => { ctx.font = '900 ' + sz + 'px ' + FAM; const m = ctx.measureText ? ctx.measureText(txt) : null; return m && m.width > 0 ? m.width : txt.length * sz * 0.58; };
  const G = logoGeom(w, meas);
  const cw = Math.ceil(w * 1.2), ch = Math.ceil(w * 0.82);
  const key = Math.round(w) + '|' + ART_SCALE;
  let ent = logoCache.get(key);
  if (!ent) {
    ent = { base: null, mask: null, tmp: null };
    const mk = (face) => {
      const cv = makeCanvas(cw * ART_SCALE, ch * ART_SCALE); if (!cv) return null; const c = cv.getContext('2d'); if (!c) return null;
      c.scale(ART_SCALE, ART_SCALE); c.translate(cw / 2, ch / 2); paintLogoLayers(c, G, face); return cv;
    };
    ent.base = mk(false); ent.mask = mk(true); ent.tmp = makeCanvas(cw * ART_SCALE, ch * ART_SCALE);
    logoCache.set(key, ent);
  }
  if (ent.base) {
    ctx.drawImage(ent.base, -cw / 2, -ch / 2, cw, ch);
    // light sweep clipped to the letter faces
    if (ent.mask && ent.tmp) {
      const tc = ent.tmp.getContext('2d'), sw = ((t * 0.32) % 1.6) - 0.3;
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, ent.tmp.width, ent.tmp.height);
      tc.setTransform(ART_SCALE, 0, 0, ART_SCALE, 0, 0);
      const bx = sw * cw, gr = tc.createLinearGradient(bx - cw * 0.12, 0, bx + cw * 0.12, ch * 0.4);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      tc.fillStyle = gr; tc.fillRect(0, 0, cw, ch);
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'destination-in'; tc.drawImage(ent.mask, 0, 0); tc.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(ent.tmp, -cw / 2, -ch / 2, cw, ch); ctx.restore();
    }
  } else { paintLogoLayers(ctx, G, false); }
  // sparkles and floating notes
  for (let i = 0; i < 6; i++) { const a = hn(i + 9) * TAU, r = w * (0.4 + hn(i) * 0.13); const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7); star4(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.55, 3 + tw * 6, i % 2 ? '#ffd0ea' : '#f1ffb8'); }
  noteGlyph(ctx, -w * 0.46, -G.big * 0.95 - Math.sin(t * 2) * 4, 1.6, '#ff5fb0'); noteGlyph(ctx, w * 0.46, G.big * 0.95 + Math.sin(t * 2.3) * 4, 1.6, '#9dff3a');
  noteGlyph(ctx, w * 0.42, -G.big * 0.8 + Math.sin(t * 1.7) * 4, 1.2, '#2fe6ff');
  ctx.restore();
}
