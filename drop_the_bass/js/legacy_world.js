// art_world.js: heroes, Loopy, logo, backdrops, board floor, stage base, cutscene scenes, title scene. All canvas code, no files.
// Contract: see drop_the_bass/CLAUDE.md. Every draw function leaves ctx state as found. No Math.random, no Date: all motion comes from t.
// ANCHORS: drawHero (x,y) is the FEET centre (stand it on the ground, size = full body height). drawBust (x,y) is the centre of the bust box.
// drawLoopy (x,y) is the centre of the pedal. drawLogo (x,y) is the centre of the lockup. drawStageBase (x,y) is the stage tile centre.
import { BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TILE, COLS, ROWS, COL, WORLD_BY_ID, buildMap, laneAt, tileCx, tileCy } from './data_core.js';

let ART_SCALE = 2;
export function setArtScale(n) { ART_SCALE = Math.max(1, Math.min(3, n || 2)); cacheBg.clear(); cacheBoard.clear(); }
export function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}

const OUT = '#140a2c';
const TAU = Math.PI * 2;
const fract = (v) => v - Math.floor(v);
const hn = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);       // deterministic noise 0..1
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); }
function fs(ctx, fill, lw, stroke) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (lw !== 0) { ctx.strokeStyle = stroke || OUT; ctx.lineWidth = lw == null ? 3 : lw; ctx.lineJoin = 'round'; ctx.stroke(); } }
function poly(ctx, pts, close) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close !== false) ctx.closePath(); }
function circle(ctx, x, y, r, fill, lw, stroke) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); fs(ctx, fill, lw == null ? 0 : lw, stroke); }
function line(ctx, x1, y1, x2, y2, w, col, cap) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineCap = cap || 'round'; ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
function limb(ctx, x1, y1, x2, y2, w, col, bend) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const cx = mx - dy / L * (bend || 0), cy = my + dx / L * (bend || 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.strokeStyle = OUT; ctx.lineWidth = w + 3.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}
function glow(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function hexA(hex, a) {
  if (hex[0] !== '#') return hex;
  let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
}
function mix(a, b, k) {
  const pa = hexRgb(a), pb = hexRgb(b);
  return 'rgb(' + Math.round(lerp(pa[0], pb[0], k)) + ',' + Math.round(lerp(pa[1], pb[1], k)) + ',' + Math.round(lerp(pa[2], pb[2], k)) + ')';
}
function hexRgb(hex) {
  if (hex[0] === 'r') { const m = hex.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
  let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function vgrad(ctx, y0, y1, c0, c1, c2) {
  const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); if (c2) { g.addColorStop(0.5, c1); g.addColorStop(1, c2); } else g.addColorStop(1, c1); return g;
}
function note(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ell(ctx, 0, 0, 4.4, 3.2, -0.4); ctx.fill(); ctx.beginPath(); ctx.moveTo(3.6, -1); ctx.lineTo(3.6, -13); ctx.quadraticCurveTo(8, -11, 8, -6); ctx.stroke(); ctx.restore();
}
function star4(ctx, x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.28 : r; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fill();
}

// ===================================================================================================================== HEROES
// Design space: origin = feet centre, y up is negative, total height about 110 units (mohawk tip -110). Faces +x slightly, drawn front on.
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
  roxor: { skin: '#f0bf96', skinSh: '#d79f78', hair: '#6b3a22', hairHi: '#a0522d', hairSh: '#3a1d0f', tee: '#2e2630', teeHi: '#4a3f4d', pants: '#7fa631', pantsSh: '#5a7f20', shoe: '#d6ed6b', sole: '#f2f9b4', band: '#9dff3a', eyeI: '#7f93b8', fur: '#4fae2c', furSh: '#397d1d', furLt: '#7be04a', accent: '#9dff3a' },
  jasmin: { skin: '#f6cfae', skinSh: '#deae8a', hair: '#2a1838', hairHi: '#5a3a74', hairSh: '#170c22', top: '#ff5fb0', topSh: '#d93f8e', pants: '#3b4fa0', pantsSh: '#2a3a7c', shoe: '#ffffff', sole: '#ffd0ea', band: '#ff5fb0', eyeI: '#4a2a1a', fur: '#f3e6ff', furSh: '#cdb6ee', furLt: '#ffffff', accent: '#ff5fb0' },
};

function micDraw(ctx, x, y, ang, band, scale) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(scale || 1, scale || 1);
  rr(ctx, -2.6, -2, 5.2, 13, 2.5); fs(ctx, '#2a2a34', 2.2);
  rr(ctx, -2.8, 2.5, 5.6, 3, 1); ctx.fillStyle = band; ctx.fill();
  circle(ctx, 0, -5.4, 5.2, '#4a4a58', 2.4); ctx.beginPath(); ctx.arc(-1.4, -6.8, 1.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fill();
  ctx.restore();
}

function eyes(ctx, who, kind, blink, ex, ey) {
  const H = HERO[who], j = who === 'jasmin';
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (kind === 'happy') {
      ctx.beginPath(); ctx.arc(x, ey + 2.5, 4.6, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
      continue;
    }
    if (blink > 0.5) { line(ctx, x - 4.6, ey + 1, x + 4.6, ey + 1, 2.6, OUT); continue; }
    const rx = j ? 5.6 : 5, ry = (kind === 'wide' ? 8.4 : j ? 7 : 6.2) * (1 - blink * 0.8);
    ell(ctx, x, ey, rx, ry); fs(ctx, '#ffffff', 2.2);
    const ir = kind === 'wide' ? 2.8 : j ? 4.4 : 3.6;
    circle(ctx, x + (kind === 'sad' ? 0.6 : 1), ey + (kind === 'sad' ? 2 : 0.6), ir, H.eyeI, 0);
    circle(ctx, x + (kind === 'sad' ? 0.6 : 1), ey + (kind === 'sad' ? 2 : 0.6), ir * 0.5, '#0b0716', 0);
    circle(ctx, x + 2.4, ey - 1.6, 1.5, '#fff', 0);
    if (j) { line(ctx, x - 5.4, ey - 3.6, x - 8, ey - 6, 1.8, OUT); line(ctx, x + 5.4, ey - 3.6, x + 8, ey - 6, 1.8, OUT); }
  }
}

function mouthDraw(ctx, who, open, kind, my, talkPhase, cheeks) {
  if (cheeks) { circle(ctx, -9, my - 3, 5.2, 'rgba(255,170,130,.7)', 0); circle(ctx, 9, my - 3, 5.2, 'rgba(255,170,130,.7)', 0); }
  if (kind === 'sad') { ctx.beginPath(); ctx.moveTo(-4.5, my + 2); ctx.quadraticCurveTo(0, my - 2.5, 4.5, my + 2); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke(); return; }
  if (open > 0.12) {
    const o = open * (0.7 + 0.3 * Math.sin(talkPhase)), w = kind === 'wide' ? 4.2 : 6.5;
    ell(ctx, 0, my + 1, w, 2 + o * 5.6); fs(ctx, '#5a1020', 2.2);
    ctx.save(); ell(ctx, 0, my + 1, w, 2 + o * 5.6); ctx.clip(); ell(ctx, 0, my + 4 + o * 3, 4, 3); ctx.fillStyle = '#ff7a8a'; ctx.fill();
    if (who === 'roxor') { rr(ctx, -4.5, my - 1.2, 9, 2.6, 1); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.restore();
    return;
  }
  ctx.beginPath();
  if (who === 'roxor') { // cheeky smirk with a flash of teeth
    ctx.moveTo(-6, my + 1); ctx.quadraticCurveTo(0, my + 5, 7.5, my - 1.5); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.5, my + 3); ctx.quadraticCurveTo(2.5, my + 3.4, 5.5, my + 0.6); ctx.lineTo(5, my - 0.3); ctx.quadraticCurveTo(2, my + 2, -1.5, my + 1.8); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
  } else {
    ctx.moveTo(-5.5, my); ctx.quadraticCurveTo(0, my + 6, 5.5, my); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
  }
}

// head for Roxor in head space (origin head centre)
function headRoxor(ctx, o, p, t, onesie) {
  const H = HERO.roxor;
  if (!onesie) { // mullet tail behind
    ctx.beginPath(); ctx.moveTo(-13, 6); ctx.quadraticCurveTo(-30, 8, -28 + Math.sin(t * 2.4) * 1.5, 26); ctx.quadraticCurveTo(-17, 22, -10, 14); ctx.closePath(); fs(ctx, H.hair, 2.8);
  } else hoodBack(ctx, 'roxor', t);
  // ears
  circle(ctx, -21, 2, 4.4, H.skin, 2.4, OUT); circle(ctx, 21, 2, 4.4, H.skin, 2.4, OUT);
  // face
  ell(ctx, 0, 0, 21.5, 19.5); fs(ctx, H.skin, 3);
  ctx.save(); ell(ctx, 0, 0, 21.5, 19.5); ctx.clip();
  ell(ctx, 0, 15, 22, 11); ctx.fillStyle = 'rgba(120,80,60,.22)'; ctx.fill();             // stubble jaw
  for (let i = 0; i < 14; i++) circle(ctx, -14 + hn(i) * 28, 8 + hn(i + 40) * 10, 0.7, 'rgba(70,40,30,.5)', 0);
  if (!onesie) { ctx.fillStyle = 'rgba(105,66,48,.42)'; ell(ctx, -31, -2, 15, 24); ctx.fill(); ell(ctx, 31, -2, 15, 24); ctx.fill(); } // shaved sides
  ctx.restore();
  eyes(ctx, 'roxor', p.eye, p.blink, 8.4, -2);
  const bw = p.eye === 'sad' ? 0.3 : 0;
  line(ctx, -13, -10 - bw * 3, -4, -12 + bw * 3, 2.6, onesie ? H.hairSh : H.hairSh); line(ctx, 4, -12.6, 13, -10.5 + bw * 2, 2.6, H.hairSh);
  ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(2.4, 6, 0.4, 6.8); ctx.lineWidth = 1.8; ctx.strokeStyle = H.skinSh; ctx.stroke();
  mouthDraw(ctx, 'roxor', p.mouth, p.eye, 11, p.talkPh, p.cheeks);
  if (!onesie) {
    // swooping mohawk pushed up and forward
    const wob = Math.sin(t * 2.1) * 0.8;
    ctx.beginPath(); ctx.moveTo(-17, -9); ctx.bezierCurveTo(-26, -22, -22, -36, -9, -40 + wob);
    ctx.bezierCurveTo(-3, -50, 10, -48, 14, -42 + wob); ctx.bezierCurveTo(24, -42, 33, -34, 31, -24);
    ctx.bezierCurveTo(30, -21, 26, -20, 24, -19); ctx.bezierCurveTo(26, -25, 22, -27, 17, -24); ctx.bezierCurveTo(10, -22, 4, -19, -2, -17);
    ctx.bezierCurveTo(-8, -15, -13, -12, -17, -9); ctx.closePath(); fs(ctx, H.hair, 3);
    ctx.beginPath(); ctx.moveTo(-12, -22); ctx.bezierCurveTo(-10, -33, -2, -40, 8, -39); ctx.strokeStyle = H.hairHi; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -35); ctx.bezierCurveTo(14, -36, 22, -33, 26, -27); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -22); ctx.quadraticCurveTo(0, -28, 8, -26); ctx.strokeStyle = H.hairSh; ctx.lineWidth = 2; ctx.stroke();
  } else hoodFront(ctx, 'roxor', t);
}

function headJasmin(ctx, o, p, t, onesie) {
  const H = HERO.jasmin, sw = Math.sin(t * 2.3) * 4;
  if (!onesie) {
    // long hair behind and a high ponytail with a pink scrunchie
    ctx.beginPath(); ctx.moveTo(-22, -4); ctx.quadraticCurveTo(-28, 22, -18, 34 + sw * 0.3); ctx.quadraticCurveTo(0, 26, 18, 34 - sw * 0.3); ctx.quadraticCurveTo(28, 22, 22, -4); ctx.closePath(); fs(ctx, H.hair, 3);
    ctx.beginPath(); ctx.moveTo(-6, -26); ctx.bezierCurveTo(-26 + sw, -50, -44 + sw * 2, -34, -38 + sw * 2.4, -4); ctx.bezierCurveTo(-34 + sw * 2, 10, -26 + sw, 6, -24 + sw, 12);
    ctx.bezierCurveTo(-22, -4, -14, -18, -6, -26); ctx.closePath(); fs(ctx, H.hair, 3);
    ctx.beginPath(); ctx.moveTo(-12, -36); ctx.bezierCurveTo(-26 + sw, -40, -34 + sw * 2, -26, -32 + sw * 2, -10); ctx.strokeStyle = H.hairHi; ctx.lineWidth = 2.4; ctx.stroke();
  } else hoodBack(ctx, 'jasmin', t);
  circle(ctx, -21, 3, 4.2, H.skin, 2.4, OUT); circle(ctx, 21, 3, 4.2, H.skin, 2.4, OUT);
  ell(ctx, 22.6, 11, 2.4, 3.4); ctx.lineWidth = 1.8; ctx.strokeStyle = '#ffc83d'; ctx.stroke();       // hoop earring
  ell(ctx, 0, 0, 21.5, 19.5); fs(ctx, H.skin, 3);
  eyes(ctx, 'jasmin', p.eye, p.blink, 8.2, -1);
  line(ctx, -13.5, -10.5, -4, -11.5, 2.2, H.hairSh); line(ctx, 4, -11.5, 13.5, -10.5, 2.2, H.hairSh);
  circle(ctx, -13, 6, 4, 'rgba(255,110,150,.35)', 0); circle(ctx, 13, 6, 4, 'rgba(255,110,150,.35)', 0);
  ctx.beginPath(); ctx.moveTo(0, 4.5); ctx.quadraticCurveTo(1.8, 6, 0.2, 6.6); ctx.lineWidth = 1.6; ctx.strokeStyle = H.skinSh; ctx.stroke();
  mouthDraw(ctx, 'jasmin', p.mouth, p.eye, 11, p.talkPh, false);
  if (!onesie) {
    // top hair cap with side swept fringe
    ctx.beginPath(); ctx.moveTo(-22, -3); ctx.bezierCurveTo(-26, -24, -10, -30, 2, -29); ctx.bezierCurveTo(16, -30, 26, -22, 22, -3);
    ctx.bezierCurveTo(21, -10, 16, -16, 8, -17); ctx.bezierCurveTo(0, -12, -8, -13, -14, -9); ctx.bezierCurveTo(-18, -8, -20, -5, -22, -3); ctx.closePath(); fs(ctx, H.hair, 3);
    ctx.beginPath(); ctx.moveTo(-14, -22); ctx.quadraticCurveTo(-4, -28, 8, -26); ctx.strokeStyle = H.hairHi; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke();
    // ponytail swinging out behind the top
    ctx.save(); ctx.translate(-14, -27); ctx.rotate(-0.5 + sw * 0.03);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-8, -6, -22, -2, -24, 14); ctx.bezierCurveTo(-24, 26, -16, 34, -12, 40); ctx.bezierCurveTo(-10, 28, -4, 16, 4, 6); ctx.closePath(); fs(ctx, H.hair, 3);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-18, 6, -16, 24); ctx.strokeStyle = H.hairHi; ctx.lineWidth = 2.2; ctx.stroke();
    rr(ctx, -4, -4, 10, 9, 3.5); fs(ctx, '#ff5fb0', 2.6); line(ctx, -1, -2, -1, 3, 1.6, '#ff9ad2'); ctx.restore();
  } else hoodFront(ctx, 'jasmin', t);
}

function hoodBack(ctx, who, t) {
  const H = HERO[who];
  if (who === 'roxor') {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 11, -17); ctx.lineTo(s * 17, -38); ctx.lineTo(s * 22, -15); ctx.closePath(); fs(ctx, '#f6d5a2', 2.8); }
    ell(ctx, 0, -2, 26, 24); fs(ctx, H.fur, 3);
  } else {
    // rainbow mane streaming behind the hood
    const cols = ['#ff5fb0', '#ffb02e', '#9dff3a', '#2fe6ff', '#9b6bff'];
    for (let i = 0; i < cols.length; i++) { const w = Math.sin(t * 2.2 + i * 0.7) * 3; ctx.beginPath(); ctx.moveTo(-14 + i * 2, -22); ctx.quadraticCurveTo(-34 + w, -6 + i * 6, -28 + w * 1.5, 26 + i * 2); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.stroke(); }
    for (let i = 0; i < cols.length; i++) { const w = Math.sin(t * 2.2 + i * 0.7) * 3; ctx.beginPath(); ctx.moveTo(-14 + i * 2, -22); ctx.quadraticCurveTo(-34 + w, -6 + i * 6, -28 + w * 1.5, 26 + i * 2); ctx.lineWidth = 3.4; ctx.strokeStyle = cols[i]; ctx.stroke(); }
    ell(ctx, 0, -2, 26, 24); fs(ctx, H.fur, 3);
  }
}
function hoodFront(ctx, who, t) {
  const H = HERO[who];
  // hood rim arc over the forehead + side panels
  ctx.beginPath(); ctx.moveTo(-24, 8); ctx.bezierCurveTo(-28, -30, 28, -30, 24, 8); ctx.bezierCurveTo(21, -10, 14, -20, 0, -20); ctx.bezierCurveTo(-14, -20, -21, -10, -24, 8); ctx.closePath(); fs(ctx, H.fur, 3);
  ctx.beginPath(); ctx.moveTo(-17, -12); ctx.quadraticCurveTo(0, -24, 17, -12); ctx.lineWidth = 2.2; ctx.strokeStyle = H.furLt; ctx.stroke();
  if (who === 'roxor') {
    for (const s of [-1, 1]) { circle(ctx, s * 12, -26, 2.2, H.furSh, 0); }
    // tuft of mohawk poking through
    ctx.beginPath(); ctx.moveTo(-6, -20); ctx.quadraticCurveTo(-3, -34, 8, -36); ctx.quadraticCurveTo(4, -28, 8, -20); ctx.closePath(); fs(ctx, HERO.roxor.hair, 2.6);
  } else {
    // unicorn horn on the forehead + pink ears
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 15, -22); ctx.lineTo(s * 21, -40); ctx.lineTo(s * 8, -26); ctx.closePath(); fs(ctx, '#ffb6dc', 2.6); }
    ctx.save(); ctx.translate(0, -24); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, -26); ctx.lineTo(6, 0); ctx.closePath(); fs(ctx, '#ffd36b', 2.8);
    ctx.clip(); for (let i = 0; i < 4; i++) line(ctx, -8, -4 - i * 6, 8, -9 - i * 6, 2, '#fff1b8'); ctx.restore();
    star4(ctx, 12, -34 + Math.sin(t * 3) * 1.2, 4, '#fff');
  }
}

function bodyHero(ctx, who, p, t, onesie, bounce, bust) {
  const H = HERO[who];
  const lean = p.lean || 0;
  // legs
  if (!bust) {
    const footUp = p.foot ? Math.max(0, Math.sin(t * p.sp)) * 5 : 0;
    for (const s of [-1, 1]) {
      const lift = s < 0 ? footUp : 0;
      const legCol = onesie ? H.fur : H.pants;
      rr(ctx, s * 7 - 5.5, -26, 11, 20 - lift, 4.5); fs(ctx, legCol, 3);
      ell(ctx, s * 8 + (s > 0 ? 1.5 : 0.5), -4 - lift, 9.4, 5.4); fs(ctx, onesie ? (who === 'roxor' ? H.furSh : '#ffb6dc') : H.shoe, 3);
      if (!onesie) { ctx.beginPath(); ctx.ellipse(s * 8 + 1, -1.8 - lift, 8.6, 2.4, 0, 0, Math.PI); ctx.fillStyle = H.sole; ctx.fill(); if (who === 'jasmin') line(ctx, s * 8 - 3, -7 - lift, s * 8 + 5, -7 - lift, 2, '#ff5fb0'); }
    }
  }
  // torso
  const tors = onesie ? H.fur : (who === 'roxor' ? H.tee : H.top);
  ctx.save(); ctx.translate(lean, 0);
  rr(ctx, -15, -52, 30, 32, 10); fs(ctx, tors, 3);
  if (onesie) {
    rr(ctx, -9, -44, 18, 20, 8); ctx.fillStyle = who === 'roxor' ? H.furLt : '#fff'; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
    if (who === 'roxor') for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-12 + i * 8, -26); ctx.lineTo(-9 + i * 8, -22); ctx.lineTo(-6 + i * 8, -26); ctx.strokeStyle = H.furSh; ctx.lineWidth = 2; ctx.stroke(); }
    else star4(ctx, 0, -36, 5, '#ffd0ea');
  } else if (who === 'roxor') {
    circle(ctx, 0, -37, 8.5, '#ffb44d', 2.6); circle(ctx, -3, -39, 1.3, OUT, 0); circle(ctx, 3, -39, 1.3, OUT, 0);
    ctx.beginPath(); ctx.arc(0, -36, 4.5, 0.2, Math.PI - 0.2); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
  } else {
    rr(ctx, -15, -27, 30, 7, 3); ctx.fillStyle = H.pants; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke();
    // heart necklace
    ctx.beginPath(); ctx.moveTo(-8, -52); ctx.quadraticCurveTo(0, -38, 8, -52); ctx.lineWidth = 1.4; ctx.strokeStyle = '#ffe9a8'; ctx.stroke();
    ctx.save(); ctx.translate(0, -42); ctx.beginPath(); ctx.moveTo(0, 3.6); ctx.bezierCurveTo(-6, -1, -4, -5, 0, -2.4); ctx.bezierCurveTo(4, -5, 6, -1, 0, 3.6); fs(ctx, '#ff3d7f', 1.8); ctx.restore();
  }
  ctx.restore();
  // neck
  rr(ctx, -4.5, -56, 9, 7, 2); ctx.fillStyle = onesie ? H.fur : H.skin; ctx.fill();
}

function armsHero(ctx, who, p, t, onesie, o, side) {
  const H = HERO[who], sleeve = onesie ? H.fur : (who === 'roxor' ? H.skin : H.skin);
  const ph = t * (p.sp || 2);
  let hl = [p.hl[0], p.hl[1]], hr = [p.hr[0], p.hr[1]];
  if (p.wave) { hr[0] += Math.sin(ph * 1.1) * p.wave; hr[1] += Math.cos(ph) * p.wave; hl[0] += Math.sin(ph * 1.1 + 2) * p.wave * 0.6; }
  if (p.pump) { hl[1] += Math.sin(ph) * 7; hr[1] += Math.sin(ph + Math.PI) * 7; }
  if (p.sway) { hl[0] += Math.sin(ph) * p.sway; hl[1] += Math.cos(ph) * p.sway; }
  if (p.micMouth && p.mouth > 0) hr[0] += Math.sin(ph * 2) * 0.6;
  if (p.foot) { hl[1] += Math.sin(ph) * 2.4; }
  const sh = [[-13, -46], [13, -46]];
  const sl = onesie ? H.fur : (who === 'roxor' ? H.skin : H.skin);
  const longSleeve = onesie;
  if (side !== 'r') {
  limb(ctx, sh[0][0], sh[0][1], sh[0][0] + hl[0], sh[0][1] + hl[1], 7.4, longSleeve ? H.fur : sl, 2);
  circle(ctx, sh[0][0] + hl[0], sh[0][1] + hl[1], 4.4, onesie ? H.furLt : H.skin, 2.4, OUT);
  }
  if (side === 'l') return;
  // right arm holds the mic
  const hx = sh[1][0] + hr[0], hy = sh[1][1] + hr[1];
  limb(ctx, sh[1][0], sh[1][1], hx, hy, 7.4, longSleeve ? H.fur : sl, -2);
  micDraw(ctx, hx, hy, p.micAng + (p.tilt || 0), H.band, 0.95);
  circle(ctx, hx, hy, 4.4, onesie ? H.furLt : H.skin, 2.4, OUT);
}

// size = full body height in px. (x,y) = feet centre.
export function drawHero(ctx, who, x, y, size, o) {
  o = o || {}; who = who === 'jasmin' ? 'jasmin' : 'roxor';
  const t = o.t || 0, onesie = o.outfit === 'onesie', k = size / 112;
  const base = POSES[o.pose] || POSES.idle;
  const p = Object.assign({}, base);
  if (o.talk && !p.mouth) p.mouth = 0.55;
  if (o.talk) p.mouth = Math.max(p.mouth, 0.55);
  if (p.talkOnly && !o.talk) p.mouth = 0.1;
  p.blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  p.talkPh = t * 16;
  const ph = t * p.sp;
  const bob = Math.sin(ph) * (p.bob || 1);
  const jump = p.jump ? Math.abs(Math.sin(ph * 0.9)) * p.jump : 0;
  ctx.save();
  ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1);
  ctx.scale(k, k);
  // soft ground shadow
  ell(ctx, 0, 0, 22 - jump * 0.6, 5); ctx.fillStyle = 'rgba(8,4,20,.35)'; ctx.fill();
  ctx.translate(0, -jump - (p.slump ? p.slump * 0.4 : 0));
  ctx.save(); ctx.translate(0, Math.abs(bob) * 0.0);
  bodyHero(ctx, who, p, t, onesie, bob, false);
  armsHero(ctx, who, p, t, onesie, o, p.micMouth ? 'l' : null);
  ctx.restore();
  // head
  ctx.save(); ctx.translate(Math.sin(ph) * (p.sway ? 1.2 : 0.4), -73 + bob * 0.8 + (p.slump || 0)); ctx.rotate(p.tilt + Math.sin(ph * 0.5) * 0.02);
  (who === 'roxor' ? headRoxor : headJasmin)(ctx, o, p, t, onesie);
  ctx.restore();
  if (p.micMouth) { ctx.save(); ctx.translate(0, Math.abs(bob) * 0.0); armsHero(ctx, who, p, t, onesie, o, 'r'); ctx.restore(); }
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
  bodyHero(ctx, who, p, t, onesie, 0, true);
  ctx.save(); ctx.translate(0, -73 + (p.slump || 0)); ctx.rotate(p.tilt);
  (who === 'roxor' ? headRoxor : headJasmin)(ctx, o, p, t, onesie);
  ctx.restore();
  ctx.restore();
}

// ===================================================================================================================== LOOPY
// Loopy the loop-station pedal. (x,y) = centre of the pedal, size = height of the whole sprite.
export function drawLoopy(ctx, x, y, size, o) {
  o = o || {}; const t = o.t || 0, mood = o.mood || 'happy', k = size / 100;
  const hop = mood === 'excited' ? Math.abs(Math.sin(t * 7)) * 6 : mood === 'sleepy' ? 0 : Math.sin(t * 2.4) * 1.5;
  ctx.save(); ctx.translate(x, y - hop * k); ctx.scale(k, k);
  ell(ctx, 0, 52 + hop, 40 - hop * 0.5, 6); ctx.fillStyle = 'rgba(8,4,20,.35)'; ctx.fill();
  // cable tail
  ctx.beginPath(); ctx.moveTo(40, 22); ctx.bezierCurveTo(62, 26 + Math.sin(t * 3) * 3, 56, 50, 70, 44 + Math.sin(t * 3 + 1) * 3); ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#ffc83d'; ctx.stroke();
  // body
  rr(ctx, -44, -34, 88, 78, 16); fs(ctx, '#4a35a8', 3.4);
  rr(ctx, -44, -34, 88, 30, 16); ctx.fillStyle = '#6a50d8'; ctx.fill();
  rr(ctx, -44, -34, 88, 78, 16); ctx.lineWidth = 3.4; ctx.strokeStyle = OUT; ctx.stroke();
  line(ctx, -36, -10, 36, -10, 1.6, 'rgba(255,255,255,.18)');
  // knobs
  for (let i = 0; i < 3; i++) { const kx = -26 + i * 26; circle(ctx, kx, -27, 5.4, '#d9d2ff', 2.4); line(ctx, kx, -27, kx + Math.sin(t * 0.7 + i) * 3, -27 - 4, 1.8, OUT); }
  // screen face
  rr(ctx, -34, -16, 68, 32, 8); fs(ctx, '#0b0a24', 3);
  const gl = mood === 'excited' ? '#9dff3a' : mood === 'worried' ? '#ffb02e' : mood === 'sleepy' ? '#7a8cff' : '#2fe6ff';
  const bl = (t % 3.2) > 3.06 ? 0.15 : 1;
  const ey = mood === 'sleepy' ? 0.25 : bl;
  for (const s of [-1, 1]) {
    const ex = s * 12;
    if (mood === 'excited') { ctx.beginPath(); ctx.arc(ex, -2, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 3.4; ctx.strokeStyle = gl; ctx.lineCap = 'round'; ctx.stroke(); }
    else { ell(ctx, ex, -3, 5.4, 6.6 * ey); ctx.fillStyle = gl; ctx.fill(); if (ey > 0.5) circle(ctx, ex + 1.6, -4.6, 1.8, '#fff', 0); }
    if (mood === 'worried') line(ctx, ex - 6, -13 + s * -1.5, ex + 6, -11 + s * 1.5, 2, gl);
  }
  const mo = o.talk ? 1 + Math.sin(t * 17) : 0;
  if (o.talk) { rr(ctx, -6, 6 - mo, 12, 3 + mo * 2.2, 2.4); ctx.fillStyle = gl; ctx.fill(); }
  else if (mood === 'worried') { ctx.beginPath(); ctx.moveTo(-6, 10); ctx.quadraticCurveTo(0, 5, 6, 10); ctx.lineWidth = 2.4; ctx.strokeStyle = gl; ctx.stroke(); }
  else if (mood === 'sleepy') { rr(ctx, -3, 7, 6, 3, 1.5); ctx.fillStyle = gl; ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-6, 6); ctx.quadraticCurveTo(0, 12, 6, 6); ctx.lineWidth = 2.4; ctx.strokeStyle = gl; ctx.lineCap = 'round'; ctx.stroke(); }
  // footswitch feet
  for (const s of [-1, 1]) {
    const fx = s * 22, press = mood === 'excited' ? Math.max(0, Math.sin(t * 7 + (s > 0 ? Math.PI : 0))) * 2 : 0;
    circle(ctx, fx, 31 + press, 10.5, '#c8c8dc', 3); circle(ctx, fx, 31 + press, 6.5, '#8f8fae', 2);
    circle(ctx, fx - 2, 29 + press, 2, 'rgba(255,255,255,.6)', 0);
    const on = (Math.floor(t * 2) + (s > 0 ? 1 : 0)) % 2;
    circle(ctx, fx, 18, 2.8, on ? (s < 0 ? '#ff4a5e' : '#9dff3a') : '#3a2a5a', 1.6);
  }
  if (mood === 'excited') for (let i = 0; i < 3; i++) star4(ctx, -30 + i * 30, -44 - ((t * 20 + i * 9) % 14), 3.4, '#fff3a0');
  if (mood === 'sleepy') { ctx.fillStyle = '#c9bcff'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('z', 34, -36 - (t * 6) % 8); }
  ctx.restore();
}

// ===================================================================================================================== LOGO
export function drawLogo(ctx, x, y, w, t) {
  t = t || 0; const bass = (t * 2) % 1; const pulse = Math.pow(Math.max(0, 1 - bass * 2.4), 2);
  ctx.save(); ctx.translate(x, y);
  // speaker cone + shockwaves behind the words
  for (let i = 0; i < 3; i++) {
    const k = ((t * 0.55) + i / 3) % 1;
    ctx.beginPath(); ctx.ellipse(0, 0, w * (0.18 + k * 0.5), w * (0.1 + k * 0.28), 0, 0, TAU); ctx.lineWidth = 3 + (1 - k) * 4; ctx.strokeStyle = hexA('#ff5fb0', 0.5 * (1 - k)); ctx.stroke();
  }
  glow(ctx, 0, 0, w * 0.62, '#9b6bff', 0.35 + pulse * 0.25);
  const scale = 1 + pulse * 0.045;
  ctx.scale(scale, scale);
  const fam = '"Impact","Arial Black","Haettenschweiler",sans-serif';
  const fit = (txt, target) => { ctx.font = '900 100px ' + fam; const m = ctx.measureText ? ctx.measureText(txt) : null; const mw = m && m.width > 0 ? m.width : txt.length * 58; return 100 * target / mw; };
  const big = Math.min(fit('DROP', w * 0.92), w * 0.34), sm = big * 0.34;
  const word = (txt, yy, size, colA, colB, ext) => {
    ctx.font = '900 ' + size + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let d = ext; d >= 1; d--) { ctx.fillStyle = mix(colB, '#140a2c', 0.45 + d / ext * 0.4); ctx.fillText(txt, 0, yy + d * 1.2); ctx.lineWidth = size * 0.12; ctx.strokeStyle = OUT; ctx.strokeText(txt, 0, yy + d * 1.2); ctx.fillText(txt, 0, yy + d * 1.2); }
    ctx.lineWidth = size * 0.13; ctx.strokeStyle = OUT; ctx.strokeText(txt, 0, yy);
    const g = ctx.createLinearGradient(0, yy - size * 0.5, 0, yy + size * 0.5); g.addColorStop(0, colA); g.addColorStop(1, colB);
    ctx.fillStyle = g; ctx.fillText(txt, 0, yy);
    ctx.lineWidth = Math.max(1, size * 0.025); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.strokeText(txt, 0, yy - size * 0.05);
  };
  const g1 = -big * 0.52, g2 = big * 0.52;
  ctx.save(); ctx.rotate(-0.045); word('DROP', g1, big, '#ffd0ea', '#ff3d9a', 7); ctx.restore();
  ctx.save(); ctx.rotate(0.03); word('BASS', g2, big * 1.02, '#f1ffb8', '#7de02a', 7); ctx.restore();
  // THE ribbon
  ctx.save(); ctx.rotate(-0.04); rr(ctx, -sm * 1.3, -sm * 0.55, sm * 2.6, sm * 1.1, sm * 0.3); fs(ctx, '#2fe6ff', 3);
  ctx.font = '900 ' + sm * 0.8 + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = OUT; ctx.fillText('THE', 0, sm * 0.04); ctx.restore();
  // sparkles
  for (let i = 0; i < 5; i++) { const a = hn(i + 9) * TAU, r = w * (0.38 + hn(i) * 0.12); const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7); star4(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.55, 3 + tw * 5, i % 2 ? '#ffd0ea' : '#f1ffb8'); }
  note(ctx, -w * 0.46, -big * 0.9 - Math.sin(t * 2) * 3, 1.5, '#ff5fb0'); note(ctx, w * 0.46, big * 0.9 + Math.sin(t * 2.3) * 3, 1.5, '#9dff3a');
  ctx.restore();
}

// ===================================================================================================================== BACKDROPS
const cacheBg = new Map(), cacheBoard = new Map();
const SKY = {
  title: ['#0b0524', '#3a1470', '#d24fa6'], hub: ['#1a0f3e', '#53226e', '#ff8a7a'],
  garage: ['#150a2c', '#2c1850', '#4a2a70'], busk: ['#0d1f44', '#24488a', '#6a8fd0'], club: ['#16062e', '#3d0f5e', '#8a1f86'],
  festival: ['#3a1850', '#d6486a', '#ffb454'], arena: ['#050520', '#1b0d52', '#4a1a8a'],
};
function skyOf(id) { return SKY[id] || SKY.title; }

function skylineLayer(ctx, w, base, seed, hmin, hmax, wmin, wmax, fill, winCol, winP, edge) {
  let x = -20, i = 0;
  while (x < w + 20) {
    const bw = wmin + hn(seed + i * 3.1) * (wmax - wmin), bh = hmin + hn(seed + i * 7.7 + 1) * (hmax - hmin);
    ctx.fillStyle = fill; ctx.fillRect(x, base - bh, bw + 1, bh + 2);
    if (edge) { ctx.fillStyle = edge; ctx.fillRect(x, base - bh, bw + 1, 2.2); }
    if (hn(seed + i * 5.3) > 0.72) { ctx.fillRect(x + bw * 0.45, base - bh - 14, 2.4, 14); }
    if (winCol) {
      const cw = 7, ch = 9;
      for (let wy = base - bh + 8; wy < base - 8; wy += 14) for (let wx = x + 5; wx < x + bw - 8; wx += 12) {
        if (hn(seed + wx * 0.37 + wy * 1.13) < winP) { ctx.fillStyle = hn(wx + wy) > 0.8 ? '#ff9ad2' : winCol; ctx.fillRect(wx, wy, cw, ch); }
      }
    }
    x += bw + (hn(seed + i) > 0.7 ? 6 : 0); i++;
  }
}
function starsStatic(ctx, w, hz, n, seed) {
  for (let i = 0; i < n; i++) { const sx = hn(seed + i) * w, sy = hn(seed + i + 99) * hz * 0.85; ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + hn(i + seed + 5) * 0.5) + ')'; ctx.fillRect(sx, sy, 1.6, 1.6); }
}
function moon(ctx, x, y, r, col) {
  glow(ctx, x, y, r * 3, col || '#ffe9c4', 0.35); circle(ctx, x, y, r, col || '#fff1d0', 0);
  circle(ctx, x - r * 0.3, y - r * 0.2, r * 0.18, 'rgba(200,170,150,.35)', 0); circle(ctx, x + r * 0.35, y + r * 0.3, r * 0.26, 'rgba(200,170,150,.3)', 0);
}
function speakerStack(ctx, x, yb, s, col) {
  for (let i = 0; i < 3; i++) {
    const yy = yb - (i + 1) * 40 * s; rr(ctx, x, yy, 54 * s, 38 * s, 5 * s); fs(ctx, col || '#241a3e', 3);
    circle(ctx, x + 27 * s, yy + 21 * s, 12 * s, '#120c24', 2.4); circle(ctx, x + 27 * s, yy + 21 * s, 5 * s, '#3a2c66', 0); circle(ctx, x + 27 * s, yy + 8 * s, 3.5 * s, '#251a42', 1.8);
  }
}
function bunting(ctx, x1, y1, x2, y2, sag, n, cols) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  for (let i = 1; i < n; i++) {
    const k = i / n, px = lerp(x1, x2, k), py = (1 - k) * (1 - k) * y1 + 2 * k * (1 - k) * (Math.max(y1, y2) + sag) + k * k * y2;
    poly(ctx, [[px - 7, py], [px + 7, py], [px, py + 15]]); fs(ctx, cols[i % cols.length], 1.8);
  }
}

function bgStatic(ctx, id, w, h) {
  const sk = skyOf(id), hz = h * 0.62;
  ctx.fillStyle = vgrad(ctx, 0, h, sk[0], sk[1], sk[2]); ctx.fillRect(0, 0, w, h);
  if (id === 'garage') { garageStatic(ctx, w, h); return; }
  if (id === 'club') { clubStatic(ctx, w, h); return; }
  if (id === 'arena') { arenaStatic(ctx, w, h); return; }
  const outdoors = true;
  if (id !== 'festival') starsStatic(ctx, w, hz, Math.round(w / 6), id.length * 3);
  if (id === 'title' || id === 'hub') moon(ctx, w * 0.78, h * 0.2, Math.min(w, h) * 0.07);
  if (id === 'busk') moon(ctx, w * 0.2, h * 0.17, Math.min(w, h) * 0.055);
  if (id === 'festival') {
    glow(ctx, w * 0.5, hz, w * 0.7, '#ffd070', 0.5); circle(ctx, w * 0.5, hz - 10, Math.min(w, h) * 0.16, '#ffe9a8', 0);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(80,20,70,.28)'; ctx.fillRect(0, hz - 70 + i * 8, w, 2.2); }
    // distant hills
    ctx.fillStyle = '#7a2f5e'; ctx.beginPath(); ctx.moveTo(0, hz); for (let x = 0; x <= w; x += 20) ctx.lineTo(x, hz - 26 - Math.sin(x * 0.012) * 18 - hn(x) * 6); ctx.lineTo(w, hz); ctx.fill();
    ctx.fillStyle = '#5a2250'; ctx.beginPath(); ctx.moveTo(0, hz + 4); for (let x = 0; x <= w; x += 20) ctx.lineTo(x, hz - 8 - Math.sin(x * 0.02 + 2) * 14); ctx.lineTo(w, hz + 4); ctx.fill();
    // tents
    for (let i = 0; i < Math.ceil(w / 120); i++) {
      const tx = 40 + i * 120 + hn(i) * 30, ty = hz + 2, tw = 54 + hn(i + 4) * 20, th = 36 + hn(i + 8) * 14;
      poly(ctx, [[tx - tw / 2, ty], [tx, ty - th], [tx + tw / 2, ty]]); fs(ctx, i % 2 ? '#ffe9d0' : '#ff6a8a', 2.6);
      ctx.save(); poly(ctx, [[tx - tw / 2, ty], [tx, ty - th], [tx + tw / 2, ty]]); ctx.clip();
      for (let s = -3; s < 4; s += 2) { ctx.fillStyle = i % 2 ? '#ff9ab0' : '#fff'; ctx.fillRect(tx + s * 7 - 3.5, ty - th, 7, th); } ctx.restore();
      poly(ctx, [[tx - tw / 2, ty], [tx, ty - th], [tx + tw / 2, ty]]); ctx.lineWidth = 2.6; ctx.strokeStyle = OUT; ctx.stroke();
    }
    bunting(ctx, 0, hz - 90, w, hz - 70, 30, 18, ['#ff5fb0', '#ffd23c', '#9dff3a', '#2fe6ff']);
  } else if (id === 'busk') {
    skylineLayer(ctx, w, hz, 7, 80, 190, 40, 82, '#10224a', '#ffd88a', 0.3, '#1c3a78');
    skylineLayer(ctx, w, hz + 8, 31, 50, 130, 50, 96, '#0a1634', '#ffcf6a', 0.4, '#16295a');
    bunting(ctx, 0, hz - 40, w, hz - 20, 24, 16, ['#ff5fb0', '#ffd23c', '#2fe6ff']);
  } else {
    skylineLayer(ctx, w, hz - 4, 3, 70, 190, 34, 76, mix(sk[1], '#0b0524', 0.55), null, 0, null);
    skylineLayer(ctx, w, hz + 6, 17, 40, 150, 44, 92, id === 'hub' ? '#1b0f3c' : '#10082c', id === 'hub' ? '#ffcf8a' : '#ff9ad2', 0.35, 'rgba(255,120,200,.4)');
  }
  // ground
  const g = id === 'busk' ? ['#2a3560', '#141c3c'] : id === 'festival' ? ['#4c2a58', '#26143a'] : ['#241446', '#10082a'];
  ctx.fillStyle = vgrad(ctx, hz, h, g[0], g[1]); ctx.fillRect(0, hz, w, h - hz);
  if (id === 'busk') { // cobbles
    for (let y = hz + 6, r = 0; y < h; y += 14 + r * 2, r++) for (let x = (r % 2) * 11 - 20; x < w; x += 24 + r) { rr(ctx, x, y, 20 + r, 10 + r * 0.5, 4); ctx.fillStyle = hn(x * 3 + y) > 0.5 ? 'rgba(120,150,220,.16)' : 'rgba(0,0,20,.18)'; ctx.fill(); }
  }
  if (id === 'festival') { for (let i = 0; i < w / 6; i++) { const gx = hn(i) * w, gy = hz + hn(i + 3) * (h - hz); line(ctx, gx, gy, gx + 2, gy - 6 - hn(i + 8) * 5, 1.6, 'rgba(255,170,120,.22)'); } }
  if (id === 'title' || id === 'hub') { ctx.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 8; i++) ctx.fillRect(0, hz + 12 + i * i * 4, w, 2); }
}

function garageStatic(ctx, w, h) {
  const fl = h * 0.72;
  ctx.fillStyle = '#2a1848'; ctx.fillRect(0, 0, w, fl);
  for (let y = 0, r = 0; y < fl; y += 20, r++) { ctx.fillStyle = r % 2 ? '#2f1c50' : '#271543'; ctx.fillRect(0, y, w, 19); for (let x = (r % 2) * 20; x < w; x += 40) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y, 2, 19); } }
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, 0, w, 6);
  // window with moon
  const wx = w * 0.12, wy = h * 0.1, ww = Math.min(w * 0.3, 190), wh = ww * 0.8;
  rr(ctx, wx - 8, wy - 8, ww + 16, wh + 16, 8); fs(ctx, '#5a3a2a', 3.4); ctx.fillStyle = vgrad(ctx, wy, wy + wh, '#101a4a', '#3a3a90'); ctx.fillRect(wx, wy, ww, wh);
  ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip(); ctx.fillStyle = vgrad(ctx, wy, wy + wh, '#101a4a', '#3a3a90'); ctx.fillRect(wx, wy, ww, wh);
  for (let i = 0; i < 16; i++) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(wx + hn(i) * ww, wy + hn(i + 7) * wh * 0.8, 1.8, 1.8); }
  moon(ctx, wx + ww * 0.7, wy + wh * 0.3, ww * 0.12); ctx.restore();
  line(ctx, wx + ww / 2, wy, wx + ww / 2, wy + wh, 5, '#5a3a2a'); line(ctx, wx, wy + wh / 2, wx + ww, wy + wh / 2, 5, '#5a3a2a');
  // posters
  const posters = [['#ff5fb0', w * 0.5, h * 0.09, 70, 96], ['#9dff3a', w * 0.62, h * 0.14, 80, 60], ['#2fe6ff', w * 0.78, h * 0.08, 64, 90]];
  for (const [c, px, py, pw, ph] of posters) { ctx.save(); ctx.translate(px, py); ctx.rotate((hn(px) - 0.5) * 0.12); rr(ctx, 0, 0, pw, ph, 3); fs(ctx, c, 3); circle(ctx, pw / 2, ph * 0.4, pw * 0.2, 'rgba(20,10,44,.75)', 0); rr(ctx, pw * 0.15, ph * 0.72, pw * 0.7, 6, 3); ctx.fillStyle = 'rgba(20,10,44,.7)'; ctx.fill(); ctx.restore(); }
  // shelf with boxes
  const sy = h * 0.4; ctx.fillStyle = '#6a4a34'; ctx.fillRect(w * 0.45, sy, w * 0.5, 8); ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.strokeRect(w * 0.45, sy, w * 0.5, 8);
  for (let i = 0; i < 6; i++) { const bx = w * 0.47 + i * w * 0.08, bw = 30 + hn(i) * 18, bh = 22 + hn(i + 2) * 22; rr(ctx, bx, sy - bh, bw, bh, 3); fs(ctx, ['#b0803c', '#8a5a8a', '#3c7a8a', '#a04a4a'][i % 4], 2.6); }
  // floor
  ctx.fillStyle = vgrad(ctx, fl, h, '#4a3224', '#2a1a14'); ctx.fillRect(0, fl, w, h - fl);
  for (let x = -w; x < w * 2; x += 46) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(w / 2 + (x - w / 2) * 0.4, fl); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, fl, w, 4);
  speakerStack(ctx, w * 0.84, fl + 16, 1.2, '#2a1c46');
  // drum kit silhouette
  const dx = w * 0.3, dy = fl + 12; circle(ctx, dx, dy - 34, 30, '#3a2858', 3); circle(ctx, dx, dy - 34, 14, '#241a3e', 0); circle(ctx, dx - 54, dy - 54, 18, '#3a2858', 3); circle(ctx, dx + 54, dy - 52, 18, '#3a2858', 3);
  line(ctx, dx - 80, dy - 90, dx - 80, dy, 3, '#5a4a7a'); ell(ctx, dx - 80, dy - 92, 20, 4); fs(ctx, '#ffd23c', 2.6);
  // pegboard
  ctx.fillStyle = 'rgba(0,0,0,.2)'; rr(ctx, w * 0.06, h * 0.42, 130, 80, 6); ctx.fill();
  for (let i = 0; i < 6; i++) { line(ctx, w * 0.06 + 14 + i * 20, h * 0.42 + 12, w * 0.06 + 14 + i * 20, h * 0.42 + 22 + hn(i) * 30, 5, ['#ff5fb0', '#9dff3a', '#ffd23c'][i % 3]); }
}
function clubStatic(ctx, w, h) {
  const hz = h * 0.58;
  ctx.fillStyle = vgrad(ctx, 0, hz, '#12041f', '#35104f'); ctx.fillRect(0, 0, w, hz);
  // neon wall grid
  for (let x = 0; x < w; x += 36) line(ctx, x, 0, x, hz, 1.4, 'rgba(255,79,208,.1)');
  for (let y = 0; y < hz; y += 36) line(ctx, 0, y, w, y, 1.4, 'rgba(47,230,255,.08)');
  // truss
  for (let i = 0; i < 2; i++) { const ty = 16 + i * 26; line(ctx, 0, ty, w, ty, 4, '#4a4a68'); for (let x = 0; x < w; x += 24) line(ctx, x, ty, x + 12, ty + 12, 2, '#3a3a58'); }
  // neon sign
  ctx.save(); ctx.shadowColor = '#ff4fd0'; ctx.shadowBlur = 18; ctx.font = '900 34px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd0f0'; ctx.fillText('NEON', w * 0.5, hz * 0.52); ctx.restore();
  speakerStack(ctx, w * 0.04, hz + 30, 1.5, '#2a1448'); speakerStack(ctx, w * 0.96 - 80, hz + 30, 1.5, '#2a1448');
  // dance floor tiles in perspective
  ctx.fillStyle = vgrad(ctx, hz, h, '#1e0c38', '#0c0418'); ctx.fillRect(0, hz, w, h - hz);
  const cols = ['#ff4fd0', '#2fe6ff', '#9dff3a', '#ffd23c'];
  for (let r = 0; r < 9; r++) for (let c = -6; c < 14; c++) {
    const y0 = hz + (r / 9) * (r / 9) * (h - hz), y1 = hz + ((r + 1) / 9) * ((r + 1) / 9) * (h - hz);
    const k0 = (y0 - hz) / (h - hz), k1 = (y1 - hz) / (h - hz), cx = w / 2, sw0 = (w / 8) * (0.35 + k0 * 1.2), sw1 = (w / 8) * (0.35 + k1 * 1.2);
    poly(ctx, [[cx + (c - 4) * sw0, y0], [cx + (c - 3) * sw0, y0], [cx + (c - 3) * sw1, y1], [cx + (c - 4) * sw1, y1]]);
    ctx.fillStyle = hexA(cols[(r * 3 + c + 40) % 4], 0.12 + 0.1 * ((r + c) & 1)); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.stroke();
  }
}
function arenaStatic(ctx, w, h) {
  const hz = h * 0.56;
  ctx.fillStyle = vgrad(ctx, 0, hz, '#04041a', '#1a0d4c'); ctx.fillRect(0, 0, w, hz);
  // stands: rows of seats arcing around
  for (let r = 0; r < 9; r++) {
    const y = hz - 20 - r * 22, inset = r * 12, rw = w - inset * 2;
    ctx.fillStyle = r % 2 ? '#22115a' : '#2a1670'; ctx.fillRect(inset - 20, y, rw + 40, 20);
    for (let x = inset; x < w - inset; x += 11) { ctx.fillStyle = hn(x * 3 + r) > 0.5 ? 'rgba(255,95,176,.55)' : hn(x + r * 9) > 0.5 ? 'rgba(47,230,255,.5)' : 'rgba(255,255,255,.25)'; ctx.fillRect(x, y + 4 + (r * 3 % 4), 5, 6); }
  }
  // roof rigging
  for (let i = 0; i < 3; i++) line(ctx, 0, 12 + i * 14, w, 12 + i * 14, 3, '#34345a');
  for (let x = 0; x < w; x += 40) { circle(ctx, x + 20, 30, 6, '#222244', 2); }
  ctx.fillStyle = vgrad(ctx, hz, h, '#2a1668', '#0e0830'); ctx.fillRect(0, hz, w, h - hz);
  // floor stripes
  for (let i = 0; i < 12; i++) { const k = i / 12; ctx.fillStyle = 'rgba(255,255,255,' + (0.025 + k * 0.03) + ')'; ctx.fillRect(0, hz + k * k * (h - hz), w, 3 + k * 6); }
  line(ctx, 0, hz, w, hz, 5, '#ff5fb0');
}

function staticCreep(ctx, w, h, t, amt) {
  if (!(amt > 0)) return;
  amt = Math.min(1, amt);
  const n = 90, m = Math.min(w, h);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, per = 2 * (w + h), pos = u * per; let px, py, nx, ny;
    if (pos < w) { px = pos; py = 0; nx = 0; ny = 1; } else if (pos < w + h) { px = w; py = pos - w; nx = -1; ny = 0; } else if (pos < 2 * w + h) { px = 2 * w + h - pos; py = h; nx = 0; ny = -1; } else { px = 0; py = per - pos; nx = 1; ny = 0; }
    const depth = amt * m * (0.1 + hn(i + 3) * 0.28), jit = Math.sin(t * 5 + i * 1.3) * 3;
    const r = 14 + hn(i + 11) * 26;
    const cx = px + nx * (depth * hn(i + 21)) + ny * jit, cy = py + ny * (depth * hn(i + 21)) + nx * jit;
    const rad = r * (0.5 + amt * 0.8), sp = 9;
    ctx.beginPath();
    for (let k = 0; k < sp * 2; k++) { const a = k / (sp * 2) * TAU + i, rd = rad * (k % 2 ? 0.7 : 1.1 + hn(i * 3 + k) * 0.15); const qx = cx + Math.cos(a) * rd, qy = cy + Math.sin(a) * rd; k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
    ctx.closePath(); ctx.fillStyle = hexA(hn(i) > 0.5 ? '#c9c4d6' : '#a29cba', 0.8 + amt * 0.2); ctx.fill();
    if (hn(i + 5) > 0.78) { circle(ctx, cx - rad * 0.28, cy - rad * 0.1, rad * 0.22, '#fff', 0); circle(ctx, cx + rad * 0.28, cy - rad * 0.1, rad * 0.22, '#fff', 0); circle(ctx, cx - rad * 0.24, cy - rad * 0.08, rad * 0.1, OUT, 0); circle(ctx, cx + rad * 0.32, cy - rad * 0.08, rad * 0.1, OUT, 0); }
  }
  // grey wash and glitch bars
  const g = ctx.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75); g.addColorStop(0, 'rgba(170,165,190,0)'); g.addColorStop(1, 'rgba(170,165,190,' + (0.5 * amt) + ')');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (amt > 0.35) for (let i = 0; i < 4; i++) { const gy = ((t * 70 + i * h / 4) % h); ctx.fillStyle = 'rgba(200,196,214,' + 0.1 * amt + ')'; ctx.fillRect(0, gy, w, 2 + hn(Math.floor(t * 4) + i) * 6); }
  ctx.restore();
}

function bgDynamic(ctx, id, w, h, t, beat, amt) {
  const hz = h * 0.62, sk = skyOf(id), acc = (WORLD_BY_ID[id] && WORLD_BY_ID[id].accent) || '#ff5fb0';
  if (id !== 'garage' && id !== 'club' && id !== 'arena' && id !== 'festival') for (let i = 0; i < 12; i++) { const tw = Math.sin(t * 2 + i * 2.3); if (tw > 0.6) { ctx.fillStyle = 'rgba(255,255,255,' + (tw - 0.5) + ')'; ctx.fillRect(hn(i + 40) * w, hn(i + 70) * hz * 0.8, 2.4, 2.4); } }
  if (id === 'title') { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + Math.sin(t * 0.6 + i * 2.1) * 0.5, bx = w * (0.2 + i * 0.3), by = hz; poly(ctx, [[bx - 5, by], [bx + 5, by], [bx + Math.cos(a) * h + 70, by + Math.sin(a) * h], [bx + Math.cos(a) * h - 70, by + Math.sin(a) * h]]); ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill(); } }
  if (id === 'hub') for (let i = 0; i < 18; i++) { const bx = hn(i) * w, by = hz - 30 + hn(i + 4) * (h - hz), r = 5 + hn(i + 8) * 14 + beat * 3; glow(ctx, bx + Math.sin(t * 0.5 + i) * 10, by, r * 2, ['#ff8ad8', '#ffd23c', '#2fe6ff'][i % 3], 0.35); }
  if (id === 'garage') {
    const lx = w * 0.5, sw = Math.sin(t * 1.3) * 5;
    line(ctx, lx, 0, lx + sw, h * 0.2, 2, '#222'); ell(ctx, lx + sw, h * 0.21, 22, 12); fs(ctx, '#d6a050', 2.6);
    glow(ctx, lx + sw, h * 0.22, 190, '#ffcf8a', 0.32 + beat * 0.1);
    ctx.fillStyle = 'rgba(255,225,170,.06)'; poly(ctx, [[lx + sw - 20, h * 0.22], [lx + sw + 20, h * 0.22], [lx + sw + 170, h * 0.74], [lx + sw - 170, h * 0.74]]); ctx.fill();
    for (let i = 0; i < 20; i++) { const mx = (hn(i) * w + t * (3 + hn(i + 5) * 5)) % w, my = (hn(i + 9) * h * 0.7 + Math.sin(t * 0.7 + i) * 10); ctx.fillStyle = 'rgba(255,240,200,.35)'; ctx.fillRect(mx, my, 1.8, 1.8); }
  } else if (id === 'busk') {
    for (let i = 0; i < 4; i++) { const lx = w * (0.12 + i * 0.26), ly = hz + 4; line(ctx, lx, ly, lx, ly - 90, 4, '#0a1230'); circle(ctx, lx, ly - 92, 7, '#ffe9a8', 2.4); glow(ctx, lx, ly - 90, 80 + beat * 12, '#ffd88a', 0.4 + Math.sin(t * 7 + i) * 0.03); }
    for (let i = 0; i < 8; i++) { const nx = (hn(i) * w + Math.sin(t * 0.8 + i) * 18), ny = (hn(i + 3) * h * 0.9 - t * 18) % h; note(ctx, nx, ny < 0 ? ny + h : ny, 0.8, hexA('#ffd0ea', 0.5)); }
  } else if (id === 'club') {
    const hzz = h * 0.58;
    for (let i = 0; i < 7; i++) { const ox = w * (0.1 + i * 0.13), a = Math.PI / 2 + Math.sin(t * 1.2 + i * 1.1) * 0.7, L = h * 0.9, c = ['#ff4fd0', '#2fe6ff', '#9dff3a'][i % 3]; ctx.beginPath(); ctx.moveTo(ox, 22); ctx.lineTo(ox + Math.cos(a) * L, 22 + Math.sin(a) * L); ctx.lineWidth = 3; ctx.strokeStyle = hexA(c, 0.55 + beat * 0.2); ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = hexA(c, 0.12); ctx.stroke(); }
    // disco ball
    const bx = w * 0.5, by = h * 0.2, r = Math.min(w, h) * 0.07; line(ctx, bx, 0, bx, by - r, 2, '#999');
    circle(ctx, bx, by, r, '#cfd4ee', 2.6); for (let i = 0; i < 18; i++) { const a = t * 1.5 + i * 1.7, fx = bx + Math.cos(a) * r * 0.78 * Math.sin(i), fy = by + Math.sin(i * 3.1) * r * 0.8; if (Math.cos(a) > 0) { ctx.fillStyle = ['#fff', '#2fe6ff', '#ff4fd0'][i % 3]; ctx.fillRect(fx - 2.5, fy - 2.5, 5, 5); } }
    for (let i = 0; i < 10; i++) { const a = t * 0.6 + i * 0.63, sx = (Math.cos(a) * 0.5 + 0.5) * w, sy = hzz * 0.2 + (Math.sin(a * 1.3) * 0.5 + 0.5) * hzz * 0.7; circle(ctx, sx, sy, 5 + beat * 3, hexA(['#ffffff', '#2fe6ff', '#ff4fd0'][i % 3], 0.5), 0); }
    const fg = ctx.createLinearGradient(0, h * 0.5, 0, h); fg.addColorStop(0, 'rgba(180,120,255,0)'); fg.addColorStop(1, 'rgba(180,120,255,.2)'); ctx.fillStyle = fg; ctx.fillRect(0, h * 0.5, w, h * 0.5);
  } else if (id === 'festival') {
    // ferris wheel
    const fx = w * 0.78, fy = hz - 70, R = Math.min(w, h) * 0.13;
    line(ctx, fx, fy, fx - R * 0.5, hz + 4, 4, '#3a1a44'); line(ctx, fx, fy, fx + R * 0.5, hz + 4, 4, '#3a1a44');
    ctx.beginPath(); ctx.arc(fx, fy, R, 0, TAU); ctx.lineWidth = 3.4; ctx.strokeStyle = '#3a1a44'; ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = t * 0.25 + i * TAU / 8, px = fx + Math.cos(a) * R, py = fy + Math.sin(a) * R; line(ctx, fx, fy, px, py, 2, '#4a2454'); rr(ctx, px - 6, py, 12, 9, 3); fs(ctx, ['#ff5fb0', '#ffd23c', '#2fe6ff', '#9dff3a'][i % 4], 2); }
    for (let i = 0; i < 8; i++) { const lx = (hn(i) * w + t * 10) % w, ly = h * 0.15 + hn(i + 3) * h * 0.3 + Math.sin(t + i) * 8; circle(ctx, lx, ly, 6, '#ffd07a', 1.8); glow(ctx, lx, ly, 26, '#ffb454', 0.5); }
  } else if (id === 'arena') {
    const sx = w * 0.5 - Math.min(w * 0.3, 150), sw = Math.min(w * 0.6, 300), sy = h * 0.1, sh = sw * 0.36;
    rr(ctx, sx - 6, sy - 6, sw + 12, sh + 12, 8); fs(ctx, '#0a0830', 3.4); ctx.fillStyle = '#1c0a40'; ctx.fillRect(sx, sy, sw, sh);
    for (let i = 0; i < 20; i++) { const bh = (0.2 + 0.8 * Math.abs(Math.sin(t * (2 + hn(i) * 3) + i)) * (0.5 + beat * 0.5)) * sh * 0.9; ctx.fillStyle = i % 3 ? '#ff5fb0' : '#2fe6ff'; ctx.fillRect(sx + 6 + i * (sw - 12) / 20, sy + sh - 4 - bh, (sw - 12) / 20 - 3, bh); }
    for (let i = 0; i < 5; i++) { const ox = w * (0.1 + i * 0.2), a = Math.PI / 2 + Math.sin(t * 0.9 + i * 1.7) * 0.5; ctx.beginPath(); ctx.moveTo(ox, 24); ctx.lineTo(ox + Math.cos(a) * h * 0.9 - 40, 24 + Math.sin(a) * h * 0.9); ctx.lineTo(ox + Math.cos(a) * h * 0.9 + 40, 24 + Math.sin(a) * h * 0.9); ctx.closePath(); ctx.fillStyle = hexA(['#ffffff', '#ff5fb0', '#2fe6ff'][i % 3], 0.07 + beat * 0.04); ctx.fill(); }
    for (let i = 0; i < 6; i++) { const fl = Math.sin(t * 9 + i * 7.3); if (fl > 0.93) { const fx = hn(i + Math.floor(t * 3)) * w, fy = h * 0.3 + hn(i + 9) * h * 0.2; star4(ctx, fx, fy, 9, '#fff'); } }
  }
  if (beat > 0.02) { glow(ctx, w / 2, hz, Math.max(w, h) * 0.55, acc, 0.16 * beat); }
  staticCreep(ctx, w, h, t, amt);
}

export function drawBackdrop(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0; id = SKY[id] ? id : 'title';
  ctx.save();
  const sc = ART_SCALE > 1 ? 1.5 : 1, key = id + '|' + Math.round(w) + '|' + Math.round(h) + '|' + sc;
  let c = cacheBg.get(key);
  if (!c) {
    const cv = makeCanvas(w * sc, h * sc);
    if (cv) {
      const cc = cv.getContext('2d'); if (cc) { cc.scale(sc, sc); bgStatic(cc, id, w, h); c = cv; if (cacheBg.size > 8) cacheBg.delete(cacheBg.keys().next().value); cacheBg.set(key, c); }
    }
  }
  if (c) ctx.drawImage(c, 0, 0, w, h); else bgStatic(ctx, id, w, h);
  bgDynamic(ctx, id, w, h, t, clamp(o.beat || 0, 0, 1), o.staticAmt || 0);
  ctx.restore();
}

// ===================================================================================================================== BOARD
const THEMES = {
  garage:   { pathA: '#6e667e', pathB: '#625b73', edge: '#3e3750', pad: '#41306e', pad2: '#4a3779', padHi: '#6a54a8', ground: '#241640', stripe: '#ffd23c', decor: ['speaker', 'crate', 'tire', 'amp'] },
  busk:     { pathA: '#8089ab', pathB: '#737c9e', edge: '#3a4268', pad: '#2a3d74', pad2: '#324780', padHi: '#5373b8', ground: '#16224a', stripe: '#ffd88a', decor: ['bin', 'plant', 'crate', 'lamp'] },
  club:     { pathA: '#241442', pathB: '#1d1036', edge: '#ff4fd0', pad: '#32205f', pad2: '#3a2670', padHi: '#6a46b8', ground: '#150a2a', stripe: '#2fe6ff', decor: ['speaker', 'amp', 'cone', 'plant'] },
  festival: { pathA: '#c79563', pathB: '#b98556', edge: '#7a5236', pad: '#3c7550', pad2: '#448058', padHi: '#6cb27c', ground: '#2c3a3a', stripe: '#fff0c0', decor: ['plant', 'crate', 'bin', 'speaker'] },
  arena:    { pathA: '#2c2068', pathB: '#251a5a', edge: '#2fe6ff', pad: '#2a1d5c', pad2: '#32246c', padHi: '#5a42b0', ground: '#140c34', stripe: '#ff5fb0', decor: ['speaker', 'amp', 'cone', 'crate'] },
};
function decor(ctx, kind, cx, cy, accent, seed) {
  ctx.save(); ctx.translate(cx, cy);
  if (kind === 'speaker') { rr(ctx, -17, -24, 34, 46, 5); fs(ctx, '#2a2250', 3); circle(ctx, 0, 6, 11, '#0e0a22', 2.4); circle(ctx, 0, 6, 4.5, '#4a3c88', 0); circle(ctx, 0, -12, 4.5, '#1a1438', 2); circle(ctx, 0, -12, 1.8, accent, 0); }
  else if (kind === 'amp') { rr(ctx, -20, -14, 40, 32, 5); fs(ctx, '#33264e', 3); rr(ctx, -16, -8, 32, 14, 3); ctx.fillStyle = '#161026'; ctx.fill(); for (let i = 0; i < 4; i++) circle(ctx, -11 + i * 7.3, 12, 2.2, accent, 0); for (let i = 0; i < 4; i++) line(ctx, -12 + i * 8, -4, -12 + i * 8, 2, 2, '#4a3c88'); }
  else if (kind === 'crate') { rr(ctx, -18, -14, 36, 32, 4); fs(ctx, '#8a5a34', 3); line(ctx, -14, -10, 14, 14, 3, '#5a3820'); line(ctx, 14, -10, -14, 14, 3, '#5a3820'); rr(ctx, -18, -14, 36, 32, 4); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); }
  else if (kind === 'tire') { circle(ctx, 0, 4, 18, '#26222e', 3); circle(ctx, 0, 4, 8, '#5a5468', 2.4); }
  else if (kind === 'bin') { rr(ctx, -13, -14, 26, 32, 5); fs(ctx, '#4a7a6a', 3); rr(ctx, -16, -20, 32, 9, 4); fs(ctx, '#5f9a86', 2.6); line(ctx, -6, -6, -6, 12, 2, 'rgba(0,0,0,.3)'); line(ctx, 6, -6, 6, 12, 2, 'rgba(0,0,0,.3)'); }
  else if (kind === 'plant') { rr(ctx, -12, 4, 24, 16, 4); fs(ctx, '#b4553a', 3); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * 6, -8 - Math.abs(i) * -1.5, 5, 13, i * 0.3, 0, TAU); fs(ctx, i % 2 ? '#4fae5a' : '#3a9a4a', 2.4); } }
  else if (kind === 'lamp') { line(ctx, 0, 20, 0, -18, 4, '#0a1230'); circle(ctx, 0, -22, 7, '#ffe9a8', 2.4); glow(ctx, 0, -22, 34, '#ffd88a', 0.45); }
  else if (kind === 'cone') { poly(ctx, [[-13, 18], [13, 18], [0, -22]]); fs(ctx, '#ff7a3c', 3); rr(ctx, -8, -2, 16, 6, 2); ctx.fillStyle = '#fff'; ctx.fill(); rr(ctx, -16, 16, 32, 6, 2); fs(ctx, '#d65a24', 2.4); }
  ctx.restore();
}

function boardStatic(ctx, mapId, worldId) {
  const m = buildMap(mapId), th = THEMES[worldId] || THEMES.garage, wd = WORLD_BY_ID[worldId] || { accent: '#ff5fb0', ground: '#241640' };
  ctx.fillStyle = th.ground; rr(ctx, BOARD_X - 6, BOARD_Y - 6, BOARD_W + 12, BOARD_H + 12, 18); ctx.fill();
  ctx.save(); rr(ctx, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 12); ctx.clip();
  ctx.fillStyle = th.ground; ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if ((r + c) & 1) { ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(BOARD_X + c * TILE, BOARD_Y + r * TILE, TILE, TILE); } }
  // path: lane rectangles including off board entries
  const pw = TILE - 6;
  for (const lane of m.lanes) {
    for (let i = 1; i < lane.pts.length; i++) {
      const a = lane.pts[i - 1], b = lane.pts[i];
      const x0 = Math.min(a.x, b.x) - pw / 2 - 1, y0 = Math.min(a.y, b.y) - pw / 2 - 1, x1 = Math.max(a.x, b.x) + pw / 2 + 1, y1 = Math.max(a.y, b.y) + pw / 2 + 1;
      ctx.fillStyle = th.edge; rr(ctx, x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, 14); ctx.fill();
    }
  }
  for (const lane of m.lanes) {
    for (let i = 1; i < lane.pts.length; i++) {
      const a = lane.pts[i - 1], b = lane.pts[i];
      const x0 = Math.min(a.x, b.x) - pw / 2, y0 = Math.min(a.y, b.y) - pw / 2, x1 = Math.max(a.x, b.x) + pw / 2, y1 = Math.max(a.y, b.y) + pw / 2;
      const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, th.pathA); g.addColorStop(1, th.pathB);
      ctx.fillStyle = g; rr(ctx, x0, y0, x1 - x0, y1 - y0, 10); ctx.fill();
    }
  }
  // path texture
  for (const k of m.pathTiles) {
    const [c, r] = k.split(',').map(Number), px = BOARD_X + c * TILE, py = BOARD_Y + r * TILE;
    for (let i = 0; i < 6; i++) { const sx = px + 6 + hn(c * 13 + r * 7 + i) * (TILE - 12), sy = py + 6 + hn(c * 5 + r * 17 + i + 30) * (TILE - 12); ctx.fillStyle = worldId === 'festival' ? 'rgba(90,50,20,.18)' : 'rgba(255,255,255,.07)'; ctx.fillRect(sx, sy, 3 + hn(i + c) * 4, 2); }
    if (worldId === 'busk') { ctx.strokeStyle = 'rgba(20,28,60,.22)'; ctx.lineWidth = 1.6; ctx.strokeRect(px + 8, py + 8, TILE / 2 - 8, TILE / 2 - 8); ctx.strokeRect(px + TILE / 2, py + TILE / 2, TILE / 2 - 8, TILE / 2 - 8); }
    if (worldId === 'club' || worldId === 'arena') { ctx.fillStyle = hexA(th.edge, 0.07); ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10); }
  }
  // lane centre dashes
  for (const lane of m.lanes) for (let i = 1; i < lane.pts.length; i++) {
    const a = lane.pts[i - 1], b = lane.pts[i]; ctx.setLineDash([10, 12]); line(ctx, a.x, a.y, b.x, b.y, 2.4, hexA(th.stripe, 0.32), 'butt'); ctx.setLineDash([]);
  }
  // slots
  for (const s of m.slots) {
    const px = BOARD_X + s.c * TILE, py = BOARD_Y + s.r * TILE;
    rr(ctx, px + 4, py + 5, TILE - 8, TILE - 8, 12); ctx.fillStyle = 'rgba(5,2,16,.45)'; ctx.fill();
    rr(ctx, px + 4, py + 3, TILE - 8, TILE - 8, 12); fs(ctx, ((s.c + s.r) & 1) ? th.pad2 : th.pad, 2.4, 'rgba(10,4,30,.9)');
    ctx.save(); rr(ctx, px + 4, py + 3, TILE - 8, TILE - 8, 12); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px + 4, py + 3, TILE - 8, 12); ctx.restore();
    rr(ctx, px + 7, py + 6, TILE - 14, TILE - 14, 9); ctx.lineWidth = 1.6; ctx.strokeStyle = hexA(th.padHi, 0.55); ctx.stroke();
    if (s.blocked) decor(ctx, th.decor[(s.c * 3 + s.r * 5) % th.decor.length], px + TILE / 2, py + TILE / 2 + 2, wd.accent, s.c + s.r);
    else { // placeable mark: a soft plus
      line(ctx, px + TILE / 2 - 6, py + TILE / 2, px + TILE / 2 + 6, py + TILE / 2, 2, hexA(th.padHi, 0.45)); line(ctx, px + TILE / 2, py + TILE / 2 - 6, px + TILE / 2, py + TILE / 2 + 6, 2, hexA(th.padHi, 0.45));
    }
  }
  ctx.restore();
  // frame
  rr(ctx, BOARD_X - 2, BOARD_Y - 2, BOARD_W + 4, BOARD_H + 4, 14); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  rr(ctx, BOARD_X - 5, BOARD_Y - 5, BOARD_W + 10, BOARD_H + 10, 17); ctx.lineWidth = 2.4; ctx.strokeStyle = hexA(wd.accent, 0.7); ctx.stroke();
  // stage tile platform
  const b = m.base; ctx.save(); rr(ctx, b.x - 33, b.y - 33, 66, 66, 12); ctx.fillStyle = hexA(wd.accent, 0.28); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = wd.accent; ctx.stroke(); ctx.restore();
  // spawn gates
  for (const lane of m.lanes) {
    const p0 = lane.pts[0], p1 = lane.pts[1]; let gx = p0.x, gy = p0.y, ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    if (p0.c < 0) gx = BOARD_X; else if (p0.c >= COLS) gx = BOARD_X + BOARD_W; if (p0.r < 0) gy = BOARD_Y; else if (p0.r >= ROWS) gy = BOARD_Y + BOARD_H;
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang);
    ell(ctx, 0, 0, 12, 34); fs(ctx, '#0c0818', 3.4, '#8a84a4'); ell(ctx, 1, 0, 7, 24); ctx.fillStyle = '#4a4660'; ctx.fill();
    ctx.restore();
  }
}

function boardCanvas(mapId, worldId) {
  const key = mapId + '|' + worldId + '|' + ART_SCALE;
  let e = cacheBoard.get(key);
  if (e) return e;
  const pad = 30, cv = makeCanvas((BOARD_W + pad * 2) * ART_SCALE, (BOARD_H + pad * 2) * ART_SCALE);
  e = { cv, pad };
  if (cv) { const cc = cv.getContext('2d'); if (cc) { cc.scale(ART_SCALE, ART_SCALE); cc.translate(-BOARD_X + pad, -BOARD_Y + pad); boardStatic(cc, mapId, worldId); } else e.cv = null; }
  cacheBoard.set(key, e); return e;
}

export function drawBoard(ctx, mapId, worldId, t, o) {
  o = o || {}; t = t || 0;
  const m = buildMap(mapId), wd = WORLD_BY_ID[worldId] || { accent: '#ff5fb0' }, th = THEMES[worldId] || THEMES.garage;
  ctx.save();
  const e = boardCanvas(mapId, worldId);
  if (e.cv) ctx.drawImage(e.cv, BOARD_X - e.pad, BOARD_Y - e.pad, BOARD_W + e.pad * 2, BOARD_H + e.pad * 2);
  else boardStatic(ctx, mapId, worldId);
  const beat = clamp(o.beat || 0, 0, 1);
  // marching chevrons along each lane
  ctx.save(); rr(ctx, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 12); ctx.clip();
  for (const lane of m.lanes) {
    const sp = 54, off = (t * 34) % sp;
    for (let d = off; d < lane.total; d += sp) {
      const p = laneAt(lane, d); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(3, 0); ctx.lineTo(-4, 6); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = hexA(th.stripe, 0.28 + beat * 0.2); ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
  // spawn gate swirl
  for (const lane of m.lanes) {
    const p0 = lane.pts[0], p1 = lane.pts[1]; let gx = p0.x, gy = p0.y;
    if (p0.c < 0) gx = BOARD_X; else if (p0.c >= COLS) gx = BOARD_X + BOARD_W; if (p0.r < 0) gy = BOARD_Y; else if (p0.r >= ROWS) gy = BOARD_Y + BOARD_H;
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang);
    for (let i = 0; i < 6; i++) { const a = t * 3 + i * 1.05, rx = 3 + (i % 3) * 2.2, px = Math.cos(a) * rx, py = Math.sin(a) * (10 + (i % 3) * 7); circle(ctx, px, py, 3.4, hexA(i % 2 ? '#d6d2e6' : '#9a94b8', 0.8), 0); }
    glow(ctx, 0, 0, 40, '#c9c4d6', 0.22 + beat * 0.1); ctx.restore();
  }
  // hints
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  if (o.slotHint) for (const [c, r] of o.slotHint) { rr(ctx, BOARD_X + c * TILE + 4, BOARD_Y + r * TILE + 3, TILE - 8, TILE - 8, 12); ctx.fillStyle = hexA('#9dff3a', 0.12 + pulse * 0.1); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = hexA('#9dff3a', 0.5 + pulse * 0.3); ctx.stroke(); }
  if (o.hoverSlot) { const [c, r] = o.hoverSlot; rr(ctx, BOARD_X + c * TILE + 3, BOARD_Y + r * TILE + 2, TILE - 6, TILE - 6, 12); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  if (o.dropSlot) {
    const [c, r] = o.dropSlot, cx = tileCx(c), cy = tileCy(r);
    ctx.beginPath(); ctx.arc(cx, cy, 24 + pulse * 6, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = hexA(wd.accent, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 30 + pulse * 6, 0, TAU); ctx.lineWidth = 1.6; ctx.strokeStyle = hexA('#ffffff', 0.5); ctx.stroke();
    poly(ctx, [[cx - 8, cy - 40 - pulse * 5], [cx + 8, cy - 40 - pulse * 5], [cx, cy - 28 - pulse * 5]]); fs(ctx, wd.accent, 2);
  }
  if (beat > 0.02) { rr(ctx, BOARD_X - 5, BOARD_Y - 5, BOARD_W + 10, BOARD_H + 10, 17); ctx.lineWidth = 3 + beat * 3; ctx.strokeStyle = hexA(wd.accent, 0.25 * beat); ctx.stroke(); }
  ctx.restore();
}

// The stage the Static are attacking. (x,y) = stage tile centre. Draws tiny Roxor and Jasmin on it.
export function drawStageBase(ctx, worldId, x, y, o) {
  o = o || {}; const t = o.t || 0, hp = o.hp == null ? 1 : clamp(o.hp, 0, 1), hit = clamp(o.hit || 0, 0, 1), beat = clamp(o.beat || 0, 0, 1);
  const wd = WORLD_BY_ID[worldId] || { accent: '#ff5fb0' }, acc = wd.accent;
  ctx.save(); ctx.translate(x + (hit > 0.05 ? Math.sin(t * 90) * 2.4 * hit : 0), y + 4);
  // curtain / backdrop
  rr(ctx, -30, -34, 60, 38, 4); fs(ctx, hp > 0.34 ? '#2a1650' : '#2a2030', 3);
  for (let i = 0; i < 6; i++) { line(ctx, -26 + i * 10.4, -32, -26 + i * 10.4, 2, 2, hexA(acc, 0.35)); }
  // truss + lights
  line(ctx, -32, -38, 32, -38, 4, '#4a4a68'); 
  for (let i = 0; i < 4; i++) { const on = hp > 0.34 || (Math.sin(t * 17 + i * 3) > 0); const lc = ['#ff5fb0', '#2fe6ff', '#ffd23c', '#9dff3a'][i]; circle(ctx, -21 + i * 14, -35, 3.6, on ? lc : '#403858', 1.8); if (on) glow(ctx, -21 + i * 14, -30, 18 + beat * 8, lc, 0.28); }
  // speaker towers
  for (const s of [-1, 1]) { rr(ctx, s * 29 - 7, -22, 14, 28, 3); fs(ctx, '#2c2250', 2.6); circle(ctx, s * 29, -9, 4.6 + beat * 1.2, '#0e0a22', 1.8); circle(ctx, s * 29, -16, 2, acc, 0); }
  // slab
  rr(ctx, -34, 0, 68, 14, 5); fs(ctx, '#3a2a68', 3); rr(ctx, -34, 0, 68, 5, 4); ctx.fillStyle = hexA(acc, 0.6); ctx.fill();
  // the duo
  const pose = hp <= 0.34 ? 'sad' : hit > 0.2 ? 'shock' : (hp > 0.7 ? 'cheer' : 'beat');
  drawHero(ctx, 'roxor', -11, 7, 38, { t, pose });
  drawHero(ctx, 'jasmin', 11, 7, 36, { t: t + 0.4, pose: pose === 'beat' ? 'sing' : pose });
  if (hit > 0.05) { rr(ctx, -36, -40, 72, 58, 8); ctx.fillStyle = 'rgba(255,60,80,' + hit * 0.35 + ')'; ctx.fill(); }
  ctx.restore();
}

// ===================================================================================================================== SCENES
// All scenes: background fills the whole (w,h), foreground is composed in a 540 x 960 design space centred and scaled to fit.
function fuzzy(ctx, x, y, r, t, o) {
  o = o || {}; const n = 14, col = o.col || '#c9c4d6', seed = o.seed || 0;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU, rad = r * (i % 2 ? 0.86 : 1.08 + hn(i + seed) * 0.12) * (1 + Math.sin(t * 6 + i) * 0.03); const px = Math.cos(a) * rad, py = Math.sin(a) * rad * 0.92; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); fs(ctx, col, Math.max(2, r * 0.1));
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#2fe6ff'; ctx.fillRect(-r * 0.9, -r * 0.2 + Math.sin(t * 9 + seed) * 2, r * 1.8, r * 0.14); ctx.fillStyle = '#ff3cc8'; ctx.fillRect(-r * 0.9, r * 0.25 + Math.cos(t * 7 + seed) * 2, r * 1.8, r * 0.1); ctx.globalAlpha = 1;
  for (const s of [-1, 1]) { circle(ctx, s * r * 0.34, -r * 0.1, r * 0.3, '#fff', Math.max(1.5, r * 0.06)); circle(ctx, s * r * 0.34 + Math.sin(t * 2 + seed) * r * 0.08, -r * 0.08, r * 0.13, OUT, 0); }
  ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.4); ctx.quadraticCurveTo(0, r * (o.grin ? 0.7 : 0.25), r * 0.3, r * 0.4); ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = OUT; ctx.stroke();
  ctx.restore();
}
function sceneBegin(ctx, w, h) {
  const s = Math.min(w / 540, h / 960); ctx.save(); ctx.translate((w - 540 * s) / 2, (h - 960 * s) / 2); ctx.scale(s, s); return s;
}
function vanDraw(ctx, x, y, s, t, o) {
  o = o || {}; const bounce = Math.sin(t * 12) * 1.2 * s;
  ctx.save(); ctx.translate(x, y + bounce); ctx.scale(s, s);
  ell(ctx, 0, 46, 96, 8); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
  rr(ctx, -92, -40, 180, 80, 18); fs(ctx, '#ffd23c', 3.4);
  rr(ctx, -92, 8, 180, 16, 6); ctx.fillStyle = '#ff5fb0'; ctx.fill(); rr(ctx, -92, -40, 180, 80, 18); ctx.lineWidth = 3.4; ctx.strokeStyle = OUT; ctx.stroke();
  rr(ctx, 40, -30, 44, 30, 8); fs(ctx, '#9be8ff', 2.8); rr(ctx, -80, -28, 90, 26, 6); fs(ctx, '#9be8ff', 2.8); line(ctx, -34, -28, -34, -2, 2.4, OUT);
  for (let i = 0; i < 4; i++) rr(ctx, -80 + i * 22, -60, 18, 20, 4), fs(ctx, '#2a2250', 2.6);
  circle(ctx, 78, 6, 4, '#fff6b0', 1.8); glow(ctx, 110, 6, 70, '#fff6b0', 0.5);
  for (const wx of [-52, 52]) { circle(ctx, wx, 40, 16, '#1c1630', 3); ctx.save(); ctx.translate(wx, 40); ctx.rotate(t * 9); circle(ctx, 0, 0, 8, '#bbb', 2); line(ctx, -8, 0, 8, 0, 2, '#666'); ctx.restore(); }
  ctx.restore();
}
function playBtn(ctx, x, y, r, col) { poly(ctx, [[x - r * 0.6, y - r], [x + r, y], [x - r * 0.6, y + r]]); fs(ctx, col, r * 0.22); }
function crowd(ctx, w, yb, rows, t, beat, tint) {
  for (let r = rows - 1; r >= 0; r--) for (let x = -10 + (r % 2) * 14; x < w + 20; x += 30) {
    const yy = yb + r * 22 + Math.sin(t * 5 + x * 0.1 + r) * (3 + beat * 3), hs = hn(x + r * 31);
    const body = mix(tint || '#1a0c3a', '#000010', r * 0.1);
    ctx.fillStyle = body; ell(ctx, x, yy + 24, 14, 18); ctx.fill(); circle(ctx, x, yy, 9, body, 0);
    if (hs > 0.4) { const ar = Math.sin(t * 6 + x) * 0.3; line(ctx, x - 9, yy + 12, x - 15, yy - 14 + ar * 8, 5, body); line(ctx, x + 9, yy + 12, x + 15, yy - 12 - ar * 8, 5, body); if (hs > 0.8) circle(ctx, x + 15, yy - 16, 3, '#fff6b0', 0); }
  }
}

function sceneHeroes(ctx, t, a, b, ya, y2, sz) {
  drawHero(ctx, 'roxor', a.x, ya, sz, { t, pose: a.pose, talk: a.talk, flip: a.flip, outfit: a.outfit });
  drawHero(ctx, 'jasmin', b.x, y2 == null ? ya : y2, sz * 0.97, { t: t + 0.37, pose: b.pose, talk: b.talk, flip: b.flip, outfit: b.outfit });
}

const BOSS_BG = { compressor: 'garage', noisegate: 'busk', reverb: 'club', djglitch: 'festival', playback: 'arena' };
function bossBig(ctx, id, cx, cy, s, t, p) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  const sh = Math.sin(t * 3);
  if (id === 'compressor') {
    const sq = (0.5 + 0.5 * Math.sin(t * 2)) * 26;
    rr(ctx, -150, -150 + sq, 300, 40, 10); fs(ctx, '#5a6486', 4); rr(ctx, -150, 120 - sq, 300, 40, 10); fs(ctx, '#5a6486', 4);
    for (const sx of [-110, 110]) { rr(ctx, sx - 12, -112 + sq, 24, 232 - sq * 2, 6); fs(ctx, '#aab4d4', 3.4); }
    rr(ctx, -120, -100 + sq * 0.5, 240, 210 - sq, 22); fs(ctx, '#7d8bb0', 4.4);
    for (const sx of [-52, 52]) { circle(ctx, sx, -34, 46, '#f4f0dc', 4.4); ctx.beginPath(); ctx.arc(sx, -34, 38, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 6; ctx.strokeStyle = '#ff4a5e'; ctx.stroke(); const na = -Math.PI / 2 + Math.sin(t * 2.4 + sx) * 0.9 + 0.2; line(ctx, sx, -34, sx + Math.cos(na) * 36, -34 + Math.sin(na) * 36, 4, OUT); circle(ctx, sx, -34, 6, OUT, 0); }
    rr(ctx, -60, 40, 120, 40, 8); fs(ctx, '#2a3050', 3.4); for (let i = 0; i < 7; i++) line(ctx, -50 + i * 16.6, 46, -50 + i * 16.6, 74, 4, '#97a4c8');
    for (let i = 0; i < 4; i++) circle(ctx, -78 + i * 52, 98, 6, ['#ff4a5e', '#ffd23c', '#9dff3a', '#2fe6ff'][i], 2);
  } else if (id === 'noisegate') {
    rr(ctx, -150, -150, 300, 310, 20); fs(ctx, '#3a2c10', 4.4); rr(ctx, -128, -128, 256, 280, 16); fs(ctx, '#ffcf4a', 4);
    ctx.save(); rr(ctx, -112, -110, 224, 246, 10); ctx.clip(); ctx.fillStyle = '#1a1030'; ctx.fillRect(-112, -110, 224, 246);
    const drop = (0.55 + 0.45 * Math.sin(t * 1.6)) ; for (let i = 0; i < 8; i++) { const bx = -98 + i * 28; rr(ctx, bx, -110, 14, 20 + drop * 200, 5); fs(ctx, '#d6d0e6', 3); }
    ctx.restore();
    ell(ctx, 0, -10 + sh * 4, 54, 40 * (0.6 + 0.4 * Math.abs(Math.cos(t * 0.9)))); fs(ctx, '#fff', 4.4); circle(ctx, Math.sin(t) * 16, -10 + sh * 4, 22, '#ff4a5e', 3.4); circle(ctx, Math.sin(t) * 16, -10 + sh * 4, 9, OUT, 0);
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 130, -30); ctx.lineTo(sx * 160, -60 + sh * 5); ctx.lineWidth = 12; ctx.strokeStyle = OUT; ctx.stroke(); }
  } else if (id === 'reverb') {
    for (let i = 4; i >= 1; i--) { const k = (i + (t * 0.8) % 1); ctx.globalAlpha = 0.5 / i; ell(ctx, 0, 0, 120 + k * 22, 140 + k * 24); fs(ctx, '#9f7bff', 3, '#d6c7ff'); }
    ctx.globalAlpha = 1;
    for (const o2 of [[-30, 6, 0.3], [24, -4, 0.45]]) { ctx.globalAlpha = o2[2]; ell(ctx, o2[0] + Math.sin(t * 2) * 10, o2[1], 120, 140); fs(ctx, '#c5adff', 3); }
    ctx.globalAlpha = 1; ell(ctx, 0, 0, 120, 140); fs(ctx, '#9f7bff', 5);
    for (const sx of [-1, 1]) { circle(ctx, sx * 44, -26, 30, '#fff', 4.4); circle(ctx, sx * 44 + Math.sin(t * 2) * 8, -22, 12, OUT, 0); }
    ctx.beginPath(); ctx.arc(0, 36, 40, 0.15, Math.PI - 0.15); ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.stroke();
    for (let i = 0; i < 3; i++) { ell(ctx, 0, 0, 150 + i * 28 + ((t * 40) % 28), 170 + i * 28 + ((t * 40) % 28)); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(214,199,255,.35)'; ctx.stroke(); }
  } else if (id === 'djglitch') {
    for (const [dx, col] of [[-5, 'rgba(255,60,200,.55)'], [5, 'rgba(47,230,255,.55)']]) { ctx.save(); ctx.translate(dx + Math.sin(t * 20) * 2, 0); ctx.globalAlpha = 0.55; ell(ctx, 0, -60, 90, 100); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
    rr(ctx, -130, 40, 260, 120, 18); fs(ctx, '#232a48', 4.4);
    for (const sx of [-1, 1]) { circle(ctx, sx * 60, 100, 44, '#101018', 4); ctx.save(); ctx.translate(sx * 60, 100); ctx.rotate(t * 3 * sx); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 14 + i * 9, 0.3, 2.2); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); } circle(ctx, 0, 0, 10, '#35f0c8', 0); line(ctx, 0, 0, 40, 0, 2, '#fff'); ctx.restore(); }
    ell(ctx, 0, -50, 80, 90); fs(ctx, '#35f0c8', 4.4);
    rr(ctx, -66, -74, 132, 38, 14); fs(ctx, '#0b1230', 4); line(ctx, -50, -62, -18, -62, 4, '#ff3cc8'); line(ctx, 14, -62, 50, -62, 4, '#2fe6ff');
    ctx.beginPath(); ctx.arc(0, -52, 100, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 16; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 10; ctx.strokeStyle = '#ff5fb0'; ctx.stroke();
    for (const sx of [-1, 1]) { ell(ctx, sx * 100, -50, 20, 34); fs(ctx, '#ff5fb0', 4); }
    rr(ctx, -30, -22, 60, 12, 6); ctx.fillStyle = OUT; ctx.fill(); for (let i = 0; i < 5; i++) line(ctx, -22 + i * 11, -20, -22 + i * 11, -13, 2, '#fff');
    for (let i = 0; i < 5; i++) { const gy = -150 + hn(Math.floor(t * 8) + i) * 300; ctx.fillStyle = 'rgba(53,240,200,.4)'; ctx.fillRect(-120 + hn(i + Math.floor(t * 6)) * 60, gy, 150, 5); }
  } else {  // playback
    glow(ctx, 0, -20, 260, '#ff4fa0', 0.5);
    rr(ctx, -110, -170, 220, 250, 70); fs(ctx, '#ff7ec0', 5); rr(ctx, -96, -158, 192, 120, 56); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
    rr(ctx, -84, -110, 168, 100, 36); fs(ctx, '#2a0a3a', 4.4);
    playBtn(ctx, -42, -60, 24, '#ff4fa0'); rr(ctx, 20, -86, 14, 52, 4); fs(ctx, '#2fe6ff', 3.4); rr(ctx, 44, -86, 14, 52, 4); fs(ctx, '#2fe6ff', 3.4);
    ctx.beginPath(); ctx.arc(0, 20, 52, 0.25, Math.PI - 0.25); ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
    for (let i = 0; i < 8; i++) rr(ctx, -34 + i * 9, 40, 7, 10, 2), ctx.fillStyle = '#fff', ctx.fill();
    line(ctx, 0, -170, 0, -216, 5, OUT); circle(ctx, 0, -222, 10 + Math.sin(t * 5) * 2, '#ffd23c', 3.4);
    rr(ctx, -150, 80, 300, 60, 24); fs(ctx, '#d6358a', 4.4);
    for (let i = 0; i < 3; i++) { const bx = -80 + i * 80; circle(ctx, bx, 110, 20, '#2a0a3a', 3.4); if (i === 0) playBtn(ctx, bx, 110, 8, '#ff7ec0'); if (i === 1) { rr(ctx, bx - 6, 100, 4, 20, 1); ctx.fillStyle = '#2fe6ff'; ctx.fill(); rr(ctx, bx + 2, 100, 4, 20, 1); ctx.fill(); } if (i === 2) { poly(ctx, [[bx - 8, 100], [bx + 2, 110], [bx - 8, 120]]); ctx.fillStyle = '#ffd23c'; ctx.fill(); poly(ctx, [[bx + 2, 100], [bx + 12, 110], [bx + 2, 120]]); ctx.fill(); } }
  }
  ctx.restore();
}

const WORLD_SCENE = { world_garage: 'garage', world_busk: 'busk', world_club: 'club', world_festival: 'festival', world_arena: 'arena' };
export const SCENE_IDS = ['garage_day', 'static_arrives', 'silent_town', 'build', 'van_night', 'boss_reveal', 'world_garage', 'world_busk', 'world_club', 'world_festival', 'world_arena', 'boss_compressor', 'boss_noisegate', 'boss_reverb', 'boss_djglitch', 'boss_playback', 'victory_stage', 'credits_van', 'defeat_quiet'];

export function drawScene(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0; const p = clamp(o.progress == null ? 0.5 : o.progress, 0, 1);
  ctx.save();
  if (id === 'garage_day') {
    drawBackdrop(ctx, 'garage', w, h, t, { beat: 0.5 + 0.5 * Math.sin(t * 6.5) * 0.6 });
    ctx.fillStyle = 'rgba(255,190,90,.12)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h); const z = 1 + p * 0.05; ctx.translate(270, 700); ctx.scale(z, z); ctx.translate(-270, -700);
    sceneHeroes(ctx, t, { x: 165, pose: 'beat' }, { x: 385, pose: 'sing' }, 830, 830, 330);
    drawLoopy(ctx, 270, 780, 96, { t, mood: 'happy' });
    for (let i = 0; i < 7; i++) { const k = ((t * 0.35 + i / 7) % 1); note(ctx, 120 + hn(i) * 300 + Math.sin(t * 2 + i) * 14, 640 - k * 420, 1.4, hexA(['#ff5fb0', '#9dff3a', '#ffd23c'][i % 3], 1 - k)); }
    ctx.restore();
  } else if (id === 'static_arrives') {
    drawBackdrop(ctx, 'garage', w, h, t, { staticAmt: 0.2 + p * 0.75 });
    ctx.fillStyle = 'rgba(10,6,30,' + (0.1 + p * 0.45) + ')'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h);
    // radio hissing + oscilloscope going flat
    rr(ctx, 70, 250, 400, 170, 16); fs(ctx, '#0b0a24', 4);
    ctx.beginPath(); for (let x = 0; x <= 380; x += 4) { const amp = (1 - p) * 56 * Math.sin(x * 0.12 + t * 8) + (p > 0.5 ? (hn(x + Math.floor(t * 20)) - 0.5) * 7 * p : 0); const px = 80 + x, py = 335 + amp; x ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.lineWidth = 4; ctx.strokeStyle = p > 0.6 ? '#c9c4d6' : '#9dff3a'; ctx.stroke();
    rr(ctx, 205, 700, 130, 80, 12); fs(ctx, '#7a4a30', 3.4); circle(ctx, 240, 740, 20, '#2a1a10', 2.6); line(ctx, 300, 700, 340, 640, 3, '#ccc');
    for (let i = 0; i < 3; i++) { const k = ((t * 0.8 + i / 3) % 1); ctx.beginPath(); ctx.arc(340, 640, 10 + k * 50, -2.4, -0.7); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(200,196,214,' + (0.7 * (1 - k)) + ')'; ctx.stroke(); }
    sceneHeroes(ctx, t, { x: 130, pose: 'shock' }, { x: 410, pose: 'shock', flip: true }, 880, 880, 320);
    drawLoopy(ctx, 270, 830, 90, { t, mood: 'worried', talk: p > 0.4 });
    ctx.restore();
  } else if (id === 'silent_town') {
    drawBackdrop(ctx, 'busk', w, h, t, { staticAmt: 0.45 });
    ctx.fillStyle = 'rgba(40,40,70,.45)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h);
    crowd(ctx, 560, 560, 3, t * 0.15, 0, '#6a6c88');
    for (let i = 0; i < 6; i++) fuzzy(ctx, 40 + i * 92, 330 + hn(i) * 80 + Math.sin(t * 2 + i) * 6, 22 + hn(i + 4) * 12, t, { seed: i });
    // muted speaker sign
    const a = ease(clamp(p * 2, 0, 1)); ctx.globalAlpha = a; rr(ctx, 170, 110, 200, 160, 24); fs(ctx, 'rgba(20,16,50,.8)', 4); poly(ctx, [[215, 170], [245, 170], [280, 140], [280, 240], [245, 210], [215, 210]]); fs(ctx, '#c9c4d6', 3.4); line(ctx, 300, 160, 340, 220, 8, '#ff4a5e'); line(ctx, 340, 160, 300, 220, 8, '#ff4a5e'); ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) note(ctx, 60 + i * 80, 830 + hn(i) * 20, 1.2, 'rgba(150,150,170,.7)');
    sceneHeroes(ctx, t, { x: 150, pose: p < 0.5 ? 'shock' : 'talk', talk: p > 0.5 }, { x: 390, pose: 'sad', flip: true }, 900, 900, 300);
    ctx.restore();
  } else if (id === 'build') {
    drawBackdrop(ctx, 'garage', w, h, t, { beat: 0.3 });
    sceneBegin(ctx, w, h);
    rr(ctx, 20, 560, 500, 40, 10); fs(ctx, '#6a4a34', 4); rr(ctx, 40, 600, 40, 200, 4); fs(ctx, '#5a3a28', 3); rr(ctx, 460, 600, 40, 200, 4); fs(ctx, '#5a3a28', 3);
    const parts = ease(clamp(p * 1.4, 0, 1));
    ctx.save(); ctx.translate(270, 500); ctx.scale(1 + Math.sin(t * 3) * 0.01, 1);
    rr(ctx, -70, -30 + (1 - parts) * 60, 140, 110, 14); ctx.globalAlpha = clamp(parts * 2, 0, 1); fs(ctx, '#ff7a3c', 4); circle(ctx, 0, 24, 36, '#1a1030', 4); circle(ctx, 0, 24, 14, '#ff7a3c', 3);
    ctx.save(); ctx.translate(0, 10 + (1 - parts) * 60); ctx.rotate(-0.7); rr(ctx, -15, -118, 30, 100, 8); fs(ctx, '#ffd9a0', 4); rr(ctx, -23, -138, 46, 28, 8); fs(ctx, '#4a3c88', 4); ctx.restore();
    ctx.globalAlpha = 1; ctx.restore();
    for (let i = 0; i < 10; i++) { const k = (t * 0.9 + i * 0.37) % 1; star4(ctx, 270 + Math.cos(i * 2.4) * 110 * k + 0, 480 - k * 150 + Math.sin(i * 2.4) * 40, 4 + hn(i) * 6, i % 2 ? '#ffd23c' : '#fff'); }
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(60 + i * 60, 590); ctx.bezierCurveTo(100 + i * 60, 640, 150, 540, 220 + i * 20, 580); ctx.lineWidth = 5; ctx.strokeStyle = ['#ff5fb0', '#9dff3a', '#2fe6ff'][i]; ctx.stroke(); }
    sceneHeroes(ctx, t, { x: 110, pose: 'point' }, { x: 430, pose: 'cheer', flip: true }, 900, 900, 310);
    drawLoopy(ctx, 270, 370, 100, { t, mood: 'excited', talk: true });
    ctx.restore();
  } else if (id === 'van_night') {
    ctx.fillStyle = vgrad(ctx, 0, h, '#07041c', '#2a1060', '#ff7ab0'); ctx.fillRect(0, 0, w, h);
    starsStatic(ctx, w, h * 0.55, 80, 11); moon(ctx, w * 0.2, h * 0.14, Math.min(w, h) * 0.06);
    const hz = h * 0.6; glow(ctx, w * (0.9 - p * 0.3), hz, w * 0.5, '#ff5fb0', 0.35 + p * 0.3);
    skylineLayer(ctx, w, hz, 5 + Math.floor(t / 30), 50, 130, 30, 70, '#140a34', '#ffd88a', 0.15, null);
    ctx.fillStyle = '#0a0620'; ctx.fillRect(0, hz, w, h - hz);
    ctx.fillStyle = '#1c1238'; ctx.fillRect(0, hz + 120, w, 200);
    for (let i = 0; i < 12; i++) { const dx = ((i * 120 - t * 260) % (w + 120) + w + 120) % (w + 120) - 60; ctx.fillStyle = '#ffd23c'; ctx.fillRect(dx, hz + 214, 54, 8); }
    sceneBegin(ctx, w, h); vanDraw(ctx, 270, 690, 1.9, t); drawBust(ctx, 'roxor', 300, 585, 70, { t, pose: 'beat' }); drawBust(ctx, 'jasmin', 220, 585, 68, { t: t + 0.2, pose: 'sing' }); ctx.restore();
    sceneBegin(ctx, w, h); for (let i = 0; i < 4; i++) note(ctx, 150 - i * 40 - ((t * 60) % 40), 560 - i * 20 + Math.sin(t * 3 + i) * 10, 1.3, hexA('#ffd0ea', 0.7 - i * 0.15)); ctx.restore();
    staticCreep(ctx, w, h, t, p * 0.5);
  } else if (id === 'boss_reveal') {
    drawBackdrop(ctx, 'arena', w, h, t, { beat: 0.2 });
    ctx.fillStyle = 'rgba(2,0,16,' + (0.78 - p * 0.15) + ')'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h); const a = ease(clamp(p * 1.6, 0, 1));
    ctx.globalAlpha = a; bossBig(ctx, 'playback', 270, 360, 1.05, t, p); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,79,160,' + 0.08 * a + ')'; poly(ctx, [[270, 300], [-100, 960], [640, 960]]); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.globalAlpha = 0.9; drawHero(ctx, i === 1 ? 'jasmin' : 'roxor', 130 + i * 140, 930, 200, { t, pose: 'shock' }); ctx.restore(); }
    ctx.fillStyle = 'rgba(2,0,20,.55)'; ctx.fillRect(0, 760, 540, 200); // silhouette them
    ctx.restore();
  } else if (WORLD_SCENE[id]) {
    const wid = WORLD_SCENE[id];
    drawBackdrop(ctx, wid, w, h, t, { beat: 0.5 + 0.5 * Math.sin(t * 7) * 0.5 });
    sceneBegin(ctx, w, h); const slide = (1 - ease(clamp(p * 3, 0, 1))) * 80;
    const gy = 890;
    ctx.fillStyle = 'rgba(8,4,24,.35)'; ctx.fillRect(-200, gy - 8, 940, 200);
    for (let i = 0; i < 4; i++) fuzzy(ctx, 520 - i * 4 + Math.sin(t * 2 + i) * 4, 470 + i * 70, 26 + hn(i) * 10, t, { seed: i, grin: true });
    ctx.save(); ctx.translate(-slide, 0); sceneHeroes(ctx, t, { x: 120, pose: 'point' }, { x: 320, pose: 'cheer' }, gy, gy, 310); ctx.restore();
    drawLoopy(ctx, 440, gy - 50, 86, { t, mood: 'excited' });
    ctx.restore();
  } else if (id.indexOf('boss_') === 0 && BOSS_BG[id.slice(5)]) {
    const bid = id.slice(5), wid = BOSS_BG[bid];
    drawBackdrop(ctx, wid, w, h, t, { beat: 0.4, staticAmt: 0.1 + p * 0.15 });
    ctx.fillStyle = 'rgba(6,2,22,.62)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h); const enter = ease(clamp(p * 2.5, 0, 1)); const sc = 1.25 - 0.15 * enter;
    glow(ctx, 270, 380, 320, WORLD_BY_ID[wid] ? WORLD_BY_ID[wid].accent : '#ff5fb0', 0.3);
    bossBig(ctx, bid, 270, 400 + (1 - enter) * -120, sc, t, p);
    ctx.fillStyle = 'rgba(8,4,24,.5)'; ctx.fillRect(-200, 780, 940, 220);
    sceneHeroes(ctx, t, { x: 140, pose: 'shock' }, { x: 400, pose: 'point', flip: true }, 920, 920, 250);
    ctx.restore();
  } else if (id === 'victory_stage') {
    drawBackdrop(ctx, 'arena', w, h, t, { beat: 0.5 + 0.5 * Math.sin(t * 8) });
    for (let i = 0; i < 4; i++) { const a = Math.sin(t * 1.4 + i * 1.6) * 0.5; ctx.beginPath(); ctx.moveTo(w * (0.15 + i * 0.23), 0); ctx.lineTo(w * (0.15 + i * 0.23) + Math.cos(a + 1.57) * h - 60, h); ctx.lineTo(w * (0.15 + i * 0.23) + Math.cos(a + 1.57) * h + 60, h); ctx.closePath(); ctx.fillStyle = hexA(['#ffd0ea', '#c4f1ff', '#f1ffb8', '#fff'][i], 0.12); ctx.fill(); }
    sceneBegin(ctx, w, h);
    rr(ctx, 20, 800, 500, 40, 10); fs(ctx, '#3a2a68', 4);
    sceneHeroes(ctx, t, { x: 170, pose: 'hype' }, { x: 370, pose: 'cheer', flip: true }, 810, 810, 360);
    drawLoopy(ctx, 270, 760, 100, { t, mood: 'excited' });
    ctx.restore();
    sceneBegin(ctx, w, h); crowd(ctx, 540, 850, 2, t, 0.5, '#0c0626'); ctx.restore();
    sceneBegin(ctx, w, h); for (let i = 0; i < 40; i++) { const k = ((t * 0.3 + hn(i)) % 1), cx = hn(i + 1) * 540, cy = k * 980 - 20; ctx.save(); ctx.translate(cx + Math.sin(t * 3 + i) * 12, cy); ctx.rotate(t * 4 + i); ctx.fillStyle = ['#ff5fb0', '#ffd23c', '#2fe6ff', '#9dff3a'][i % 4]; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); } ctx.restore();
  } else if (id === 'credits_van') {
    const hz = h * 0.58; ctx.fillStyle = vgrad(ctx, 0, hz, '#5a2a7a', '#ff7a9a', '#ffd38a'); ctx.fillRect(0, 0, w, hz);
    const sr = hz - 20 - ease(p) * 120; glow(ctx, w * 0.5, sr, w * 0.6, '#fff1a8', 0.7); circle(ctx, w * 0.5, sr, Math.min(w, h) * 0.12, '#fff7c8', 0);
    ctx.fillStyle = '#6a3a7a'; ctx.beginPath(); ctx.moveTo(0, hz); for (let x = 0; x <= w; x += 16) ctx.lineTo(x, hz - 30 - Math.sin(x * 0.01) * 24); ctx.lineTo(w, hz); ctx.fill();
    ctx.fillStyle = '#3a2a58'; ctx.fillRect(0, hz, w, h - hz); ctx.fillStyle = '#4a3a6a'; ctx.fillRect(0, hz + 100, w, 220);
    for (let i = 0; i < 10; i++) { const dx = ((i * 130 - t * 200) % (w + 130) + w + 130) % (w + 130) - 60; ctx.fillStyle = '#fff1a8'; ctx.fillRect(dx, hz + 206, 56, 8); }
    for (let i = 0; i < 5; i++) { const bx = ((hn(i) * w + t * 30) % (w + 40)), by = h * 0.18 + hn(i + 3) * h * 0.2; ctx.beginPath(); ctx.moveTo(bx - 8, by); ctx.quadraticCurveTo(bx - 4, by - 7 + Math.sin(t * 8 + i) * 3, bx, by); ctx.quadraticCurveTo(bx + 4, by - 7 + Math.sin(t * 8 + i) * 3, bx + 8, by); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke(); }
    sceneBegin(ctx, w, h); vanDraw(ctx, 270, 690, 1.9, t);
    drawHero(ctx, 'roxor', 230, 600, 150, { t, pose: 'cheer' }); drawHero(ctx, 'jasmin', 320, 600, 145, { t: t + 0.3, pose: 'cheer' });
    for (let i = 0; i < 5; i++) note(ctx, 90 - i * 30 - ((t * 50) % 30), 640 + Math.sin(t * 3 + i) * 12, 1.4, hexA(['#ff5fb0', '#9dff3a', '#fff'][i % 3], 0.9 - i * 0.15));
    ctx.restore();
  } else if (id === 'defeat_quiet') {
    drawBackdrop(ctx, 'hub', w, h, t, { staticAmt: 0.85 });
    ctx.fillStyle = 'rgba(4,2,16,.82)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h);
    glow(ctx, 270, 640, 300, '#2fe6ff', 0.3 + Math.sin(t * 2) * 0.05);
    drawLoopy(ctx, 270, 640, 140, { t, mood: 'worried' });
    ctx.globalAlpha = 0.9; sceneHeroes(ctx, t, { x: 100, pose: 'sad' }, { x: 440, pose: 'sad', flip: true }, 900, 900, 230); ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) fuzzy(ctx, 60 + i * 110, 180 + hn(i) * 80 + Math.sin(t + i) * 8, 30, t, { seed: i, grin: true });
    ctx.restore();
  } else {
    drawBackdrop(ctx, 'hub', w, h, t, {});
  }
  ctx.restore();
}

export function drawTitle(ctx, w, h, t, o) {
  o = o || {}; t = t || 0; const beat = clamp(o.beat == null ? Math.pow(Math.max(0, 1 - ((t * 2) % 1) * 2.4), 2) : o.beat, 0, 1);
  ctx.save();
  drawBackdrop(ctx, 'title', w, h, t, { beat });
  sceneBegin(ctx, w, h);
  // rooftop stage
  rr(ctx, -40, 760, 620, 260, 20); fs(ctx, '#1c1240', 4); ctx.fillStyle = vgrad(ctx, 760, 960, '#2e1c5e', '#180e38'); rr(ctx, -40, 760, 620, 260, 20); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  line(ctx, -20, 770, 560, 770, 5, '#ff5fb0'); line(ctx, -20, 782, 560, 782, 2.4, 'rgba(255,255,255,.3)');
  speakerStack(ctx, -6, 770, 1.35, '#2a1c4e'); speakerStack(ctx, 486, 770, 1.35, '#2a1c4e');
  // equalizer
  for (let i = 0; i < 24; i++) { const bh = 8 + (0.3 + 0.7 * Math.abs(Math.sin(t * (2 + hn(i) * 3) + i))) * 36 * (0.6 + beat * 0.6); rr(ctx, 6 + i * 22.2, 940 - bh, 15, bh, 3); ctx.fillStyle = i % 2 ? '#ff5fb0' : '#9dff3a'; ctx.fill(); }
  sceneHeroes(ctx, t, { x: 170, pose: 'beat' }, { x: 380, pose: 'sing', flip: true }, 850, 850, 330);
  drawLoopy(ctx, 270, 810, 84, { t, mood: 'happy' });
  for (let i = 0; i < 5; i++) { const k = ((t * 0.3 + i / 5) % 1); note(ctx, 110 + i * 80 + Math.sin(t + i) * 12, 700 - k * 360, 1.5, hexA(['#ff5fb0', '#9dff3a', '#ffd23c', '#2fe6ff'][i % 4], 1 - k)); }
  // Static peeking in from the corners
  fuzzy(ctx, -8 + Math.sin(t * 1.2) * 6, 600, 46, t, { seed: 1, grin: true }); fuzzy(ctx, 548 + Math.sin(t * 1.4) * 6, 560, 52, t, { seed: 2, grin: true }); fuzzy(ctx, 24, 470 + Math.sin(t) * 8, 28, t, { seed: 3 });
  ctx.restore();
  ctx.restore();
}
