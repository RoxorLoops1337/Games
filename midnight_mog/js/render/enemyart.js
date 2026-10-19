// Midnight Mog enemy art: every enemy and boss drawn procedurally ("rats cut, cats curve").
// Pure render module: never touches sim state, never calls Math.random. Per-entity variation comes from a seeded hash.
//
// API (names are binding for the other modules):
//   drawEnemy(ctx, enemyId, x, y, size, o)            (x,y) = feet centre, size = tile size in px (bosses are scaled up inside by data.size)
//   drawEnemyPortrait(ctx, enemyId, x, y, w, h, o)    (x,y) = top left
//   o = {t, anim:'walk'|'attack'|'hit'|'die'|'burrow'|'stun', animT:0..1, hitFlash:0..1, affix:id|[ids], shield:0..1|true,
//        phase:0..3 (boss phase index), facing:-1 (enemies face left; 1 mirrors), seed, noScale}
//   Extras: enemyScale(id), enemyAnchors(id, size) -> {top, cy, rx, ry, scale}, ENEMY_IDS, clearEnemyArt(), AFFIX_COLOR
//
// How it is built: each enemy has a painter that draws its body in "unit space" (u = size/32, feet at 0,0, facing left,
// y up is negative). Painters are baked into offscreen canvases per animation frame (8 walk, 6 attack) and boss phase, lazily.
// Live per frame: ground contact, aura, hit tint, glowing eyes, drips, trait marks, shield bubble, affix aura, die dissolve.
// Without any canvas (node tests) the painters run directly on the given context.
import { PAL, ENEMY_COLOR, rgba, mix, shade, glow as palGlow } from '../palette.js';
import { ENEMIES, ENEMY_BY_ID } from '../data/enemies.js';

const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, sqrt = Math.sqrt;
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const frac = (v) => v - Math.floor(v);
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = (t) => 1 - Math.pow(1 - t, 3);

function hsh(a, b = 0) {
  let n = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35);
  n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d); n ^= n >>> 12; n = Math.imul(n, 0x297a2d39); n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// sprite box in unit space
const BX0 = -42, BY0 = -64, BW = 80, BH = 74;
const NW = 8, NA = 6;       // baked walk and attack frames
const NO = {};

const FAC_RIM = PAL.magenta;
const FAC_BOUNCE = { vermin: PAL.lime, feral: PAL.cyan, tech: PAL.cyan, spirit: PAL.lime, boss: PAL.cyan };
export const AFFIX_COLOR = Object.freeze({
  swift: PAL.cyan, plated: PAL.violetHi, regenerating: PAL.lime, volatile: ENEMY_COLOR.feral, warded: PAL.bone, vampiric: PAL.magenta,
});

// ------------------------------------------------------------------------------------------------ canvas helpers
function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  try { if (typeof OffscreenCanvas !== 'undefined') { const c = new OffscreenCanvas(w, h); if (c.getContext) return c; } } catch (e) { /* fall through */ }
  try { if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } } catch (e) { /* none */ }
  return null;
}

// painter state (set per bake): rim colour, bounce colour, eye colour, collected glow lights
const ST = { rim: FAC_RIM, bounce: PAL.lime, eye: PAL.magenta, lights: null, ph: 0, core: null };

// ------------------------------------------------------------------------------------------------ shape toolkit
// Every part: 2u ink outline (stroked first), 3 tone fill lit from the upper right, magenta rim upper right,
// bounce light from below, optional halftone shadow lower left, optional grime cracks and a detail callback.
function part(c, build, bb, base, o) {
  o = o || NO;
  const x0 = bb[0], y0 = bb[1], x1 = bb[2], y1 = bb[3];
  if (!o.noLine) { c.save(); build(c); c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = PAL.ink; c.stroke(); c.restore(); }
  c.save();
  build(c); c.clip();
  if (o.flat) { c.fillStyle = base; c.fillRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8); } else {
    const g = c.createLinearGradient(x1, y0, x0, y1);
    g.addColorStop(0, shade(base, 0.26)); g.addColorStop(0.42, base); g.addColorStop(1, shade(base, -0.42));
    c.fillStyle = g; c.fillRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
  }
  if (o.ht) halftone(c, x0, y0, x1, y1, base);
  if (o.detail) o.detail(c);
  if (o.crack) cracks(c, x0, y0, x1, y1, base);
  if (!o.norim) {
    const rg = c.createLinearGradient(x1, y0, x0 + (x1 - x0) * 0.45, y0 + (y1 - y0) * 0.55);
    rg.addColorStop(0, rgba(o.rim || ST.rim, 0.95)); rg.addColorStop(1, rgba(o.rim || ST.rim, 0));
    build(c); c.lineJoin = 'round'; c.lineWidth = 2.6; c.strokeStyle = rg; c.stroke();
    const bg = c.createLinearGradient(0, y1, 0, y0 + (y1 - y0) * 0.6);
    bg.addColorStop(0, rgba(ST.bounce, 0.6)); bg.addColorStop(1, rgba(ST.bounce, 0));
    build(c); c.lineWidth = 2.6; c.strokeStyle = bg; c.stroke();
  }
  c.restore();
}

function halftone(c, x0, y0, x1, y1, base) {
  const sp = 3, w = x1 - x0, h = y1 - y0;
  c.fillStyle = shade(base, -0.55); c.beginPath();
  let row = 0;
  for (let y = y0; y <= y1; y += sp * 0.7071, row++) {
    for (let x = x0 + (row & 1 ? sp * 0.5 : 0); x <= x1; x += sp) {
      const d = ((x1 - x) / (w || 1) + (y - y0) / (h || 1)) * 0.5;
      const r = 1.1 * cl((d - 0.5) / 0.5, 0, 1);
      if (r > 0.18) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    }
  }
  c.fill();
}

function cracks(c, x0, y0, x1, y1, base) {
  c.strokeStyle = shade(base, -0.5); c.lineWidth = 0.6; c.lineJoin = 'miter';
  const s = ((x0 * 7 + y0 * 13) | 0) + 91;
  for (let k = 0; k < 3; k++) {
    let x = lerp(x0, x1, 0.2 + hsh(s, k) * 0.6), y = lerp(y0, y1, 0.15 + hsh(s, k + 9) * 0.4);
    c.beginPath(); c.moveTo(x, y);
    for (let i = 0; i < 4; i++) { x += (hsh(s, k * 7 + i) - 0.5) * 5; y += 1.4 + hsh(s, k * 5 + i + 3) * 2.4; c.lineTo(x, y); }
    c.stroke();
  }
}

function polyBuild(pts, smooth) {
  const n = pts.length >> 1;
  return (c) => {
    c.beginPath();
    if (!smooth) {
      c.moveTo(pts[0], pts[1]);
      for (let i = 1; i < n; i++) c.lineTo(pts[i * 2], pts[i * 2 + 1]);
      c.closePath();
    } else {
      c.moveTo((pts[(n - 1) * 2] + pts[0]) / 2, (pts[(n - 1) * 2 + 1] + pts[1]) / 2);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        c.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2);
      }
      c.closePath();
    }
  };
}
function boundsOf(pts) {
  let a = 1e9, b = 1e9, d = -1e9, e = -1e9;
  for (let i = 0; i < pts.length; i += 2) { if (pts[i] < a) a = pts[i]; if (pts[i] > d) d = pts[i]; if (pts[i + 1] < b) b = pts[i + 1]; if (pts[i + 1] > e) e = pts[i + 1]; }
  return [a, b, d, e];
}
/** polygon part; pts flat [x,y,...]; o.smooth rounds it */
function P(c, pts, base, o) { part(c, polyBuild(pts, o && o.smooth), boundsOf(pts), base, o); }
/** ellipse part */
function E(c, cx, cy, rx, ry, base, o) {
  const rot = (o && o.rot) || 0;
  const m = rot ? Math.max(rx, ry) : 0;
  part(c, (cc) => { cc.beginPath(); cc.ellipse(cx, cy, rx, ry, rot, 0, TAU); }, m ? [cx - m, cy - m, cx + m, cy + m] : [cx - rx, cy - ry, cx + rx, cy + ry], base, o);
}
/** chamfered rectangle part (x,y = top left) */
function R(c, x, y, w, h, base, o) {
  const k = Math.min((o && o.cut) != null ? o.cut : 1.4, w / 2.2, h / 2.2);
  P(c, [x + k, y, x + w - k, y, x + w, y + k, x + w, y + h - k, x + w - k, y + h, x + k, y + h, x, y + h - k, x, y + k], base, o);
}
/** tapered limb from (x0,y0) w0 wide to (x1,y1) w1 wide */
function L(c, x0, y0, x1, y1, w0, w1, base, o) {
  const dx = x1 - x0, dy = y1 - y0, d = sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
  P(c, [x0 + nx * w0 / 2, y0 + ny * w0 / 2, x1 + nx * w1 / 2, y1 + ny * w1 / 2, x1 - nx * w1 / 2, y1 - ny * w1 / 2, x0 - nx * w0 / 2, y0 - ny * w0 / 2], base, o);
}
/** smooth ribbon through points (flat) with width fn(i/(n-1)) */
function ribbon(c, pts, wf, base, o) {
  const n = pts.length >> 1, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = pts[b * 2] - pts[a * 2], dy = pts[b * 2 + 1] - pts[a * 2 + 1];
    const d = sqrt(dx * dx + dy * dy) || 1; dx /= d; dy /= d;
    const w = (typeof wf === 'function' ? wf(i / (n - 1)) : wf) / 2;
    left.push(pts[i * 2] - dy * w, pts[i * 2 + 1] + dx * w);
    right.push(pts[i * 2] + dy * w, pts[i * 2 + 1] - dx * w);
  }
  const all = left.slice();
  for (let i = n - 1; i >= 0; i--) all.push(right[i * 2], right[i * 2 + 1]);
  P(c, all, base, o);
}
/** hot almond eye with ink slit pupil; registers a live glow */
function eye(c, x, y, w, h, col, ang) {
  col = col || ST.eye; ang = ang || 0; w *= 1.3; h *= 1.25;
  c.save(); c.translate(x, y); c.rotate(ang);
  c.beginPath(); c.moveTo(-w, 0.15 * h); c.lineTo(-w * 0.2, -h); c.lineTo(w, -h * 0.15); c.lineTo(w * 0.3, h); c.closePath();
  c.fillStyle = col; c.fill(); c.lineWidth = 0.6; c.strokeStyle = PAL.ink; c.stroke();
  c.fillStyle = PAL.ink; c.fillRect(-w * 0.12, -h * 0.7, w * 0.26, h * 1.4);
  c.fillStyle = PAL.bone; c.fillRect(-w * 0.62, -h * 0.5, Math.max(0.5, w * 0.24), Math.max(0.5, h * 0.34));
  c.restore();
  if (ST.lights) ST.lights.push([x, y, w * 2.2, col, 0]);
}
/** round eyeball (bone white, coloured iris, ink pupil) for blobs and ducks */
function ball(c, x, y, r, col, look) {
  c.beginPath(); c.arc(x, y, r + 0.8, 0, TAU); c.fillStyle = PAL.ink; c.fill();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = PAL.bone; c.fill();
  const ix = x + (look == null ? -0.25 : look) * r, ir = r * 0.62;
  c.beginPath(); c.arc(ix, y, ir, 0, TAU); c.fillStyle = col || ST.eye; c.fill();
  c.fillStyle = PAL.ink; c.fillRect(ix - ir * 0.14, y - ir * 0.8, ir * 0.28, ir * 1.6);
  if (ST.lights) ST.lights.push([ix, y, r * 1.4, col || ST.eye, 0]);
}
/** row of bone teeth along a line, depth sign picks the side */
function teeth(c, x0, y0, x1, y1, n, dep, col) {
  const dx = x1 - x0, dy = y1 - y0, d = sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, m = (i + 0.5) / n;
    c.moveTo(x0 + dx * a, y0 + dy * a); c.lineTo(x0 + dx * m + nx * dep, y0 + dy * m + ny * dep); c.lineTo(x0 + dx * b, y0 + dy * b);
  }
  c.fillStyle = col || PAL.bone; c.fill(); c.lineWidth = 0.5; c.strokeStyle = PAL.ink; c.stroke();
}
function line(c, pts, col, w) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
}
function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); }
/** neon stroke: 3 layer bloom along a polyline */
function neon(c, pts, col, w) {
  const op = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter';
  line(c, pts, rgba(col, 0.12), w * 6); line(c, pts, rgba(col, 0.3), w * 3);
  c.globalCompositeOperation = op; line(c, pts, col, w);
}
function rivets(c, x, y, n, dx, dy, r) { for (let i = 0; i < n; i++) dot(c, x + dx * i, y + dy * i, r || 0.7, PAL.boneDim); }
/** walking legs: far then near leg, straight tapered, foot wedge pointing left */
function legs(c, hx, hy, len, w, wph, amp, base, foot, gap) {
  for (let k = 0; k < 2; k++) {
    const ph = wph + k * PI, lift = Math.max(0, cos(ph)) * len * 0.22, g = k ? (gap || 0) : -(gap || 0);
    const fx = hx + g + sin(ph) * amp, fy = -lift;
    const col = k ? base : shade(base, -0.25);
    L(c, hx + g, hy, fx, fy - 1, w, w * 0.78, col, { norim: !k });
    P(c, [fx + w * 0.5, fy - 1.4, fx - (foot || 3), fy - 1.2, fx - (foot || 3) - 1, fy, fx + w * 0.5, fy], col, { norim: !k });
  }
}
function armorPlate(c, x, y, w, h, base) {
  P(c, [x, y + h * 0.3, x + w * 0.5, y, x + w, y + h * 0.25, x + w * 0.85, y + h, x + w * 0.15, y + h], base);
  rivets(c, x + w * 0.25, y + h * 0.35, 2, w * 0.5, 0, 0.55);
}
function spikeRow(c, x0, y0, x1, y1, n, hgt, base, o) {
  const dx = x1 - x0, dy = y1 - y0, d = sqrt(dx * dx + dy * dy) || 1, nx = dy / d, ny = -dx / d;
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, m = (i + 0.5) / n, hh = hgt * (0.75 + 0.5 * hsh(i, n * 3));
    P(c, [x0 + dx * a, y0 + dy * a, x0 + dx * m + nx * hh, y0 + dy * m + ny * hh, x0 + dx * b, y0 + dy * b], base, o);
  }
}
function wingShape(c, x, y, ang, len, base, o) {
  c.save(); c.translate(x, y); c.rotate(ang); const k = len / 17;
  P(c, [0, -2 * k, 6 * k, -5 * k, 12 * k, -6.5 * k, 17 * k, -5 * k, 14 * k, -3 * k, 18 * k, -1 * k, 14 * k, 0.5 * k, 17 * k, 3 * k, 11 * k, 2.2 * k, 5 * k, 3.5 * k, 0, 3 * k], base, o);
  c.restore();
}

// ================================================================================================ painters
// Signature: painter(c, a, ph). a = {w: walk phase radians, atk: -1..1 (wind-up to thrust), ph: boss phase index}.
// Everything faces LEFT (enemies march toward the base on the left). Feet at y = 0, up is negative.
const PAINT = {};
const tone = {
  slateD: () => mix(PAL.slate, PAL.ink, 0.35),
  plum: () => mix(PAL.violet, PAL.ink, 0.35),
  steel: () => mix(PAL.slate, PAL.cyanDeep, 0.42),
  steelD: () => mix(PAL.slate, PAL.ink, 0.5),
  moss: () => mix(PAL.limeDeep, PAL.ink, 0.5),
  rust: () => mix(ENEMY_COLOR.feral, PAL.ink, 0.62),
  orange: () => ENEMY_COLOR.feral,
  pink: () => mix(PAL.magenta, PAL.boneDim, 0.5),
  bread: () => mix(ENEMY_COLOR.feral, PAL.bone, 0.55),
  crust: () => mix(ENEMY_COLOR.feral, PAL.ink, 0.55),
};

// ------------------------------------------------------------------------------------------------ district 1: pigeons
function pigeon(c, a, o) {
  const fl = sin(a.w), cy = -28, fat = o.bomb ? 1.18 : 1;
  const body = o.bomb ? mix(PAL.slate, PAL.violet, 0.5) : mix(PAL.boneDim, PAL.slate, 0.55);
  const wingC = shade(body, -0.22);
  wingShape(c, 3, cy - 4, -0.2 - 0.85 * sin(a.w - 0.55), 15, shade(wingC, -0.2));
  P(c, [8, cy - 1, 19, cy - 5.5, 15.5, cy - 2, 21, cy, 15.5, cy + 1.6, 19, cy + 5.5, 8, cy + 3], wingC);
  if (o.bomb) {
    line(c, [-1, cy + 4, 3, cy + 0.5], PAL.boneDim, 0.8);
    E(c, -1, cy + 11, 6.6, 6.2, mix(PAL.ink3, PAL.violet, 0.3), { detail: (cc) => { cc.fillStyle = rgba(PAL.magenta, 0.85); cc.fillRect(-9, cy + 8.5, 16, 2); cc.fillRect(-9, cy + 12.5, 16, 1.2); } });
    ST.lights && ST.lights.push([3, cy + 0.5, 4, ENEMY_COLOR.feral, 2]);
    dot(c, 3, cy + 0.5, 1, PAL.bone);
  }
  E(c, 0, cy, 10 * fat, 7 * fat, body, { rot: -0.12, ht: 1 });
  E(c, -7, cy - 2.6, 3.8, 3, mix(PAL.cyanDeep, PAL.magenta, 0.5), { norim: true, noLine: true });
  P(c, [-3, cy + 5.5, -4.8, cy + 9.5, -2, cy + 7, -0.4, cy + 9.6, 0.6, cy + 5.5], tone.orange(), { norim: true });
  E(c, -10, cy - 6, 4.7, 4.4, body, { norim: false });
  const bk = o.bomb ? 0.5 : 0;
  P(c, [-14, cy - 7.4, -20.5, cy - 4.6 + bk, -14, cy - 3.4], tone.orange());
  P(c, [-11.5, cy - 9.6, -11, cy - 14.5, -9.4, cy - 10.4, -7.6, cy - 14.8, -6.2, cy - 9.6], shade(body, -0.28), { norim: false });
  eye(c, -11.6, cy - 7.2, 1.9, 1.1, null, -0.2);
  line(c, [-14.5, cy - 9.4, -9.4, cy - 7.8], PAL.ink, 1);
  if (o.bomb) { ring(c, -11.6, cy - 7.2, 3.6, PAL.cyan); line(c, [-7.8, cy - 7.6, -3, cy - 5.2], PAL.boneDim, 1.2); }
  wingShape(c, -1, cy - 5.5, -0.25 - 0.85 * fl, 17, wingC);
}
PAINT.pigeon_scout = (c, a) => pigeon(c, a, {});
PAINT.pigeon_bomber = (c, a) => pigeon(c, a, { bomb: 1 });

PAINT.gutter_gull = (c, a) => {
  const w = a.w, body = mix(PAL.bone, PAL.slate, 0.5), wing = mix(PAL.slate, PAL.violet, 0.4);
  P(c, [9, -21, 19, -23, 18, -17, 20, -14, 9, -13], shade(body, -0.2));
  legs(c, 2, -10, 10, 2.2, w, 4, tone.orange(), 3.5, 3);
  E(c, 1, -20, 11.5, 9, body, { rot: -0.1, ht: 1 });
  P(c, [-3, -24, 8, -27.5, 18, -21, 11, -14, -2, -16], wing, { smooth: false });
  line(c, [4, -23, 13, -19], shade(wing, -0.4), 0.6); line(c, [2, -19, 10, -16.4], shade(wing, -0.4), 0.6);
  P(c, [-11, -22, -5.5, -25, -3, -17, -8, -12.5, -11.5, -15.5], mix(PAL.boneDim, PAL.cyan, 0.18), { detail: (cc) => { line(cc, [-10, -21, -5, -15], rgba(PAL.ink, 0.35), 0.6); line(cc, [-7, -23, -4.6, -18.5], rgba(PAL.ink, 0.35), 0.6); } });
  E(c, -9, -29.5, 5.3, 5.1, body);
  for (let i = 0; i < 4; i++) R(c, -13 + i * 2.7 - (i === 3 ? 0 : 0), -42 - (i % 2) * 2.5, 1.9, 9, mix(PAL.bone, ENEMY_COLOR.feral, 0.35), { cut: 0.5, norim: true });
  P(c, [-14, -33, -13, -39, -2.6, -39, -2, -33], mix(PAL.magenta, PAL.ink, 0.35), { detail: (cc) => { cc.fillStyle = rgba(PAL.bone, 0.85); cc.fillRect(-14, -37, 13, 1.6); cc.fillRect(-14, -34.5, 13, 0.9); } });
  P(c, [-13.5, -31.5, -22, -29.5, -22.5, -26.5, -19, -26, -14, -27.5], tone.orange());
  dot(c, -20.8, -27.2, 0.9, PAL.magenta);
  eye(c, -11.4, -30.4, 2, 1.1);
  line(c, [-14.6, -32.8, -9.6, -31], PAL.ink, 1);
};

PAINT.antenna_raven = (c, a) => {
  const cy = -27, ink = mix(PAL.violet, PAL.ink, 0.6), fl = sin(a.w), op = Math.max(0, a.atk) * 3.2;
  const fan = (ang, len, col) => {
    for (let i = 0; i < 5; i++) {
      c.save(); c.translate(3, cy - 6); c.rotate(ang + i * 0.22);
      P(c, [0, -1.8, len * 0.88, -1.4, len, 0.4, len * 0.82, 1.4, 0, 2], col);
      c.restore();
    }
  };
  fan(-0.55 - 0.7 * sin(a.w - 0.6), 19, shade(ink, -0.25));
  P(c, [8, cy + 3, 24, cy + 7, 9, cy + 6], ink); P(c, [8, cy + 5, 22, cy + 11, 9, cy + 8], shade(ink, -0.2));
  L(c, -4, cy + 10, -5, cy + 17, 1.4, 1, tone.orange(), { norim: true }); L(c, 1, cy + 10, 1, cy + 17, 1.4, 1, tone.orange(), { norim: true });
  E(c, 2, cy, 8.4, 11, ink, { rot: 0.5, ht: 1 });
  L(c, 5, cy - 5, 7, cy - 24, 1.4, 1.4, PAL.slate, { norim: true });
  P(c, [3, cy - 19, 10, cy - 22, 9, cy - 25, 4, cy - 23], mix(PAL.slate, PAL.cyanDeep, 0.4), { norim: true });
  dot(c, 7, cy - 24.5, 1.1, PAL.lime); ST.lights && ST.lights.push([7, cy - 24.5, 4.5, PAL.lime, 2]);
  E(c, -6, cy - 10, 4.9, 4.7, ink);
  P(c, [-9.5, cy - 11, -21, cy - 9 - op * 0.4, -9.6, cy - 8.2], mix(PAL.boneDim, PAL.slate, 0.5));
  P(c, [-9.6, cy - 8, -19, cy - 7.4 + op, -9.2, cy - 6], shade(mix(PAL.boneDim, PAL.slate, 0.5), -0.25));
  eye(c, -7.6, cy - 12, 1.9, 1.1);
  P(c, [-8, cy - 14, -6, cy - 19, -3, cy - 14], shade(ink, 0.1), { norim: true });
  fan(-0.3 - 0.75 * fl, 21, ink);
};

PAINT.king_coo = (c, a) => {
  const w = a.w, ph = a.ph, body = mix(PAL.boneDim, PAL.slate, 0.5), crumb = tone.bread(), crust = tone.crust();
  legs(c, -8, -9, 7, 3.2, w, 3.5, tone.orange(), 3, 0); legs(c, 9, -9, 7, 3.2, w + PI, 3.5, tone.orange(), 3, 0);
  // cape
  const capeC = mix(PAL.magenta, PAL.ink, ph >= 2 ? 0.55 : 0.4);
  const tear = ph >= 2 ? 3 : 0;
  P(c, [-12, -38, 14, -38, 21, -10 + tear, 17, -7, 13, -11, 9, -6 - tear, 4, -11, -2, -5, -8, -11, -14, -7 - tear, -19, -12], capeC, { ht: 1 });
  // throne
  P(c, [-15, -12, -17, -36, -13, -46, -6, -48, 0, -43, 6, -48, 13, -46, 17, -36, 15, -12], crust);
  P(c, [-12, -13, -13.6, -35, -10.5, -43, -5.5, -44.5, 0, -40, 5.5, -44.5, 10.5, -43, 13.6, -35, 12, -13], crumb, { norim: true, detail: (cc) => { dotsB(cc, -12, -42, 12, -14, crust, 14); } });
  R(c, -19, -13, 38, 7, crust);
  R(c, -17, -12.5, 34, 3, crumb, { norim: true, cut: 0.8 });
  // king
  E(c, 1, -23, 13, 12, body, { ht: 1, rot: -0.05 });
  if (ph >= 2) spikeRow(c, 6, -34, 13, -16, 5, 5, shade(body, -0.2));
  P(c, [-6, -24, 2, -29, 8, -22, 4, -15, -4, -16], shade(body, 0.2), { norim: true });
  // bib ruffle
  c.fillStyle = PAL.bone; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(-9 + i * 3.6, -35.5, 2.4, 0, TAU); c.fill(); c.lineWidth = 0.5; c.strokeStyle = PAL.ink; c.stroke(); }
  // sceptre arm (drumstick)
  const sw = ph >= 1 ? -0.2 : 0;
  L(c, -9, -29, -19, -24, 5.5, 4, shade(body, -0.15));
  L(c, -20, -22, -24 + sw, -46, 2, 2, PAL.bone);
  E(c, -24 + sw, -49.5, 4.2, 3.4, tone.rust(), { rot: 0.3 });
  dot(c, -24 + sw, -53.4, 1.1, PAL.bone);
  E(c, -19.5, -23, 3.4, 3, body);
  // head
  E(c, -5, -38, 8, 7.4, body, { ht: 1 });
  P(c, [-11.5, -39, -21, -34.5, -11, -32.6], tone.orange());
  P(c, [-11, -35.5, -17, -33.6, -11, -32], shade(tone.orange(), -0.3), { norim: true });
  eye(c, -8.4, -40.4, 2.7, 1.5);
  line(c, [-12.6, -43.2, -5.5, -40.6], PAL.ink, 1.3);
  // crown
  const gem = ph >= 1 ? PAL.lime : PAL.magenta;
  P(c, [-11, -44, -10, -54, -6.6, -48, -4, -56, -1, -48, 2, -54, 3, -44], mix(PAL.boneDim, PAL.bone, 0.3));
  dot(c, -6.6, -47, 1.1, gem); dot(c, -1, -47, 1.1, gem);
  if (ph >= 2) line(c, [-4, -56, -5, -50, -2.6, -47], PAL.ink, 0.8);
};
function dotsB(c, x0, y0, x1, y1, col, n) {
  c.fillStyle = rgba(col, 0.55); c.beginPath();
  for (let i = 0; i < n; i++) { const x = lerp(x0, x1, hsh(i, 11)), y = lerp(y0, y1, hsh(i, 23)), r = 0.5 + hsh(i, 5) * 0.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  c.fill();
}

// ------------------------------------------------------------------------------------------------ district 2: alley
PAINT.rat_courier = (c, a) => {
  const w = a.w, fur = mix(PAL.slate, PAL.violet, 0.35), pink = tone.pink();
  const tp = []; for (let i = 0; i < 8; i++) tp.push(11 + i * 2.7, -9 + sin(w + i * 0.7) * (0.6 + i * 0.45) + i * 0.35);
  ribbon(c, tp, (t) => 2.4 * (1 - t) + 0.5, pink, { norim: true });
  legs(c, 6, -7, 7, 2.6, w, 4, shade(fur, -0.1), 2.4, 0); legs(c, -4, -7, 7, 2.6, w + 1.6, 4, fur, 2.4, 0);
  E(c, 2, -10, 10.5, 5.8, fur, { rot: 0.1, ht: 1 });
  P(c, [-1, -13.5, 8, -12.5, 9, -5.5, 0, -5.2], mix(PAL.magenta, PAL.ink, 0.5), { detail: (cc) => { cc.fillStyle = PAL.bone; cc.fillRect(1.5, -10, 4.5, 3); } });
  line(c, [-6, -13, 8, -6], PAL.boneDim, 0.9);
  P(c, [-8, -14, -15, -12.5, -20, -8.6, -15, -5.4, -8, -5.8], fur, { smooth: true });
  dot(c, -19.6, -8.8, 1.1, PAL.magenta);
  P(c, [-7.5, -13.5, -7, -21.5, -4.5, -19, -3, -22, -1, -14], fur);
  P(c, [-6.5, -14.5, -6.3, -19.2, -4.6, -17.4, -3.2, -19.5, -2.2, -14.6], pink, { norim: true });
  eye(c, -12.6, -10.6, 1.8, 1.05);
  P(c, [-17, -6, -15.6, -3.6, -14.6, -6], PAL.bone, { norim: true });
  line(c, [-19, -8, -24, -10, -19.5, -7.6, -24, -7.2], PAL.boneDim, 0.45);
};

PAINT.dumpster_raccoon = (c, a) => {
  const w = a.w, fur = mix(PAL.slate, PAL.ink, 0.2), lid = mix(PAL.boneDim, PAL.slate, 0.55), tl = a.atk;
  const tp = []; for (let i = 0; i < 7; i++) tp.push(8 + i * 2.5, -14 - i * 2.2 + sin(w + i * 0.6) * (0.4 + i * 0.35));
  ribbon(c, tp, 6, fur, { detail: (cc) => { cc.fillStyle = rgba(PAL.ink, 0.8); for (let i = 1; i < 7; i += 2) cc.fillRect(8 + i * 2.5 - 1.2, -40, 2.6, 40); cc.fillRect(8 + 6 * 2.5, -40, 4, 40); } });
  legs(c, 1, -12, 12, 5, w, 3.4, fur, 3.6, 3);
  E(c, 1, -18, 10.5, 10.5, fur, { ht: 1 });
  E(c, -3, -16, 5.2, 6.4, shade(fur, 0.28), { norim: true });
  L(c, -3, -21, -9, -15, 4.4, 3.8, fur);
  // dented lid shield
  E(c, -14, -15, 8.8, 8.8, lid, { detail: (cc) => { cc.strokeStyle = rgba(PAL.ink, 0.5); cc.lineWidth = 0.7; for (const r of [6.4, 3.6]) { cc.beginPath(); cc.arc(-14, -15, r, 0, TAU); cc.stroke(); } cc.fillStyle = rgba(PAL.magenta, 0.35); cc.fillRect(-19, -13, 7, 3); line(cc, [-17, -21, -11, -12], rgba(PAL.bone, 0.5), 0.8); } });
  R(c, -16, -17, 4, 4.2, PAL.slate, { cut: 0.8 }); rivets(c, -20.4, -19.5, 3, 2.2, 2.4, 0.6);
  // head
  E(c, -5, -30, 7.2, 6.2, fur, { ht: 1 });
  P(c, [-8, -34, -6.6, -41, -3, -35.5], fur); P(c, [-1.5, -35.5, 1.5, -41, 3, -34], fur);
  P(c, [-12, -31.6, -4, -33.4, 3, -31.6, 0, -26.6, -5, -28, -11.4, -26.6], PAL.ink, { norim: true, noLine: true });
  eye(c, -8.7, -30.2, 2, 1.15); eye(c, -1.6, -30.6, 1.8, 1.05);
  P(c, [-11.4, -28, -16, -26, -11.6, -23.8], shade(fur, 0.3), { norim: true }); dot(c, -15.6, -26.2, 1, PAL.magenta);
  c.save(); c.translate(-3, -37.5); c.rotate(-0.28);
  E(c, 0, 0, 8.6, 3.2, lid, {}); R(c, -1.6, -5.5, 3.2, 3, PAL.slate, { cut: 0.6 });
  c.restore();
  L(c, 4, -21, 8 + tl * 2, -10, 3.6, 3, fur);
  P(c, [8 + tl * 2, -12, 13, -9, 12, -6, 7, -8], shade(fur, 0.15), { norim: true });
};

PAINT.stray_mutt = (c, a) => {
  const w = a.w, fur = mix(tone.rust(), PAL.slate, 0.35), op = Math.max(0, a.atk) * 4.5, lean = a.atk * 1.5;
  ribbon(c, [14, -19, 19, -23, 22, -29, 21, -34], 3, shade(fur, -0.1), { norim: true });
  legs(c, 10, -13, 13, 4.2, w, 5.5, shade(fur, -0.1), 3.2, 0); legs(c, -9, -13, 13, 4.2, w + 1.9, 5.5, fur, 3.2, 0);
  P(c, [-12, -23, -2, -27, 10, -25.5, 17, -20, 13, -12.5, 1, -11, -11, -13.5], fur, { smooth: true, ht: 1 });
  spikeRow(c, -10, -25, 13, -24.5, 5, 3.2, shade(fur, -0.25), { norim: true });
  for (let i = 0; i < 3; i++) line(c, [-3 + i * 4, -22, -1 + i * 4, -15], rgba(PAL.ink, 0.35), 0.7);
  // head
  E(c, -16 - lean, -24, 6.2, 5.8, fur, { ht: 1 });
  P(c, [-19 - lean, -27, -28.5 - lean, -23.6, -28.5 - lean, -20.2, -19 - lean, -19.5], shade(fur, 0.1));
  P(c, [-19 - lean, -19.6, -27.6 - lean, -20.3 + op, -26.6 - lean, -16.6 + op, -18 - lean, -16], shade(fur, -0.15));
  teeth(c, -28 - lean, -20.6, -19.5 - lean, -19.6, 4, -2.2); if (op > 0.5) teeth(c, -27 - lean, -17.8 + op, -19 - lean, -17.2, 3, 2);
  dot(c, -28 - lean, -23.2, 1.2, PAL.ink);
  P(c, [-15 - lean, -28, -12.6 - lean, -36, -9 - lean, -29], fur); P(c, [-14 - lean, -29, -12.7 - lean, -34, -10.6 - lean, -29.6], tone.pink(), { norim: true });
  P(c, [-11 - lean, -27.5, -7 - lean, -33, -5 - lean, -26], shade(fur, -0.25), { norim: true });
  eye(c, -19.6 - lean, -25.4, 2, 1.15);
  P(c, [-12 - lean, -22, -4 - lean, -21.4, -4 - lean, -18.6, -12 - lean, -18.8], mix(PAL.magenta, PAL.ink, 0.4), { norim: true });
  spikeRow(c, -12 - lean, -22, -4 - lean, -21.5, 3, 2.6, PAL.boneDim, { norim: true });
};

PAINT.rat_shaman = (c, a) => {
  const w = a.w, rob = mix(PAL.violet, PAL.ink, 0.25), cheese = mix(PAL.lime, PAL.bone, 0.55), g = Math.max(0, a.atk);
  // cheese halo
  E(c, 9, -35, 9, 9, cheese, { detail: (cc) => { cc.fillStyle = rgba(PAL.ink, 0.6); for (const p of [[2, -39, 2], [8, -42, 1.4], [9, -34, 1.8], [1, -33, 1.1], [4, -45, 1]]) { cc.beginPath(); cc.arc(p[0], p[1], p[2], 0, TAU); cc.fill(); } } });
  neon(c, [7, -42.5, 10.5, -37, 7, -32, 12, -27.5], PAL.lime, 0.7 + g * 0.5);
  ST.lights && ST.lights.push([9, -35, 10 + g * 3, PAL.lime, 0]);
  L(c, -12, -4, -13, -42, 1.8, 1.8, PAL.boneDim, { norim: true });
  P(c, [-13, -42, -17, -44, -16, -39], PAL.bone, { norim: true });
  P(c, [-9, -29, 9, -29, 12, -9, 9, -3.4, 6, -7, 3, -2.6, 0, -7, -3, -2.6, -6, -7, -9, -3.4, -12, -9], rob, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.magenta, 0.55); cc.fillRect(-12, -17, 24, 1.6); } });
  for (let i = 0; i < 5; i++) dot(c, -6 + i * 3, -27 + Math.abs(i - 2) * 0.8, 0.9, PAL.bone);
  legs(c, 0, -5, 5, 2.4, w, 2, tone.pink(), 2, 2.5);
  L(c, -6, -24, -12.5, -22 - g * 2, 3.6, 3, rob);
  dot(c, -13, -22.6 - g * 2, 2.1, tone.pink());
  L(c, 6, -24, 12, -29, 3.4, 3, rob); dot(c, 12.5, -29.5, 2, tone.pink());
  P(c, [-10, -29, -9.5, -39, -3, -44, 4, -40, 5, -29], shade(rob, -0.15), { smooth: true });
  P(c, [-8.6, -35.4, -18, -31.4, -8.4, -28.4], mix(PAL.slate, PAL.violet, 0.3));
  dot(c, -17.4, -31.5, 1.1, PAL.magenta);
  eye(c, -8.2, -34.2, 1.8, 1.05);
  P(c, [-10, -39.5, -12, -45, -7, -41], PAL.bone, { norim: true }); P(c, [-2, -43, 0, -49, 2, -42.5], PAL.bone, { norim: true });
  line(c, [-17.8, -32.5, -22, -34, -17.8, -31, -22, -30.6], PAL.boneDim, 0.4);
};

PAINT.rat_emperor = (c, a) => {
  const w = a.w, ph = a.ph, coat = mix(PAL.boneDim, PAL.violet, 0.58), pink = tone.pink(), fur = mix(PAL.slate, PAL.violet, 0.3);
  for (let k = 0; k < 4; k++) {
    const tp = []; for (let i = 0; i < 7; i++) tp.push(-12 + k * 8 + sin(w + k + i * 0.8) * (1 + i * 0.6), -6 + i * 0.9);
    ribbon(c, tp, (t) => 2.2 * (1 - t) + 0.5, pink, { norim: true });
  }
  legs(c, 0, -9, 8, 5.4, w, 3, PAL.ink3, 4.5, 5);
  const coatPts = [-17, -40, 17, -41, 22, -8, 15, -3, 8, -7, 1, -3, -6, -7, -13, -3, -22, -8];
  P(c, coatPts, coat, { smooth: false, ht: 1, detail: (cc) => {
    const lumps = ph >= 1 ? 6 : 4;
    for (let i = 0; i < lumps; i++) {
      const lx = -12 + hsh(i, 3) * 24, ly = -14 - hsh(i, 8) * 18 + sin(w + i * 1.7) * 1.1, lr = 3.6 + hsh(i, 5) * 1.6;
      cc.beginPath(); cc.arc(lx, ly, lr, 0, TAU); cc.fillStyle = shade(coat, 0.14); cc.fill(); cc.lineWidth = 0.7; cc.strokeStyle = rgba(PAL.ink, 0.6); cc.stroke();
      cc.fillStyle = PAL.magenta; cc.fillRect(lx - lr * 0.55, ly - 0.8, 1.4, 1.1); cc.fillRect(lx + lr * 0.1, ly - 0.8, 1.4, 1.1);
    }
    cc.fillStyle = rgba(PAL.ink, 0.5); cc.fillRect(-0.6, -40, 1.2, 36);
    for (let i = 0; i < 3; i++) dot(cc, 4, -34 + i * 8, 1.1, PAL.boneDim);
  } });
  if (ph >= 2) {
    P(c, [-3, -36, 8, -36, 11, -9, 2, -12, -4, -9], PAL.ink2, { norim: true, detail: (cc) => {
      cc.fillStyle = PAL.magenta;
      for (let i = 0; i < 9; i++) { const ex = -1 + hsh(i, 2) * 10, ey = -33 + hsh(i, 9) * 22 + sin(w + i) * 0.8; cc.fillRect(ex, ey, 1.2, 0.9); cc.fillRect(ex + 2.4, ey, 1.2, 0.9); }
      cc.fillStyle = rgba(PAL.slate, 0.9); for (let i = 0; i < 5; i++) { const ex = hsh(i, 31) * 10 - 1; cc.beginPath(); cc.moveTo(ex, -30 + i * 4.5); cc.lineTo(ex + 1.5, -33 + i * 4.5); cc.lineTo(ex + 3, -30 + i * 4.5); cc.fill(); }
    } });
    ST.lights && ST.lights.push([4, -22, 9, PAL.magenta, 0]);
  }
  P(c, [-17, -40, -12, -45, -7, -39, 0, -42, 7, -39, 12, -45, 17, -41, 12, -34, 0, -32, -12, -34], shade(coat, -0.25));
  // head
  P(c, [-6, -44, -15, -46, -27, -38, -17, -30, -6, -32, -1, -38], fur, { smooth: true, ht: 1 });
  dot(c, -26.4, -38, 1.7, PAL.magenta);
  P(c, [-4, -44, -2, -55, 3, -51, 7, -56, 9, -43], fur); P(c, [-2.6, -45, -1.4, -52, 2.6, -49, 5.6, -53, 6.4, -44], pink, { norim: true });
  eye(c, -14, -39, 2.4, 1.4); ring(c, -14, -39, 4.4, PAL.boneDim); line(c, [-14, -34.6, -11, -29, -8, -26], PAL.boneDim, 0.5);
  teeth(c, -23, -35, -15, -33.4, 3, 2.4); line(c, [-27, -38, -33, -41, -27, -37, -33, -35.4], PAL.boneDim, 0.45);
  // crown hat
  const hc = ph >= 2 ? mix(PAL.boneDim, PAL.ink, 0.2) : PAL.bone;
  P(c, [-7, -45, -7.4, -57, -4, -52, -1, -59, 2, -52, 5, -57, 4.6, -45], mix(PAL.violet, PAL.ink, 0.25), { detail: (cc) => { cc.fillStyle = hc; cc.fillRect(-8, -49, 14, 2); cc.fillStyle = PAL.magenta; cc.fillRect(-1.6, -49.2, 3.6, 2.4); } });
  // arm + scepter
  L(c, -14, -33, -24, -26, 7, 5, coat); dot(c, -25, -25.4, 2.8, pink);
  L(c, -25, -22, -27, -49, 1.8, 1.8, PAL.boneDim, { norim: true });
  P(c, [-27, -49, -31.6, -52.5, -27, -57, -22.6, -53], mix(PAL.lime, PAL.bone, 0.55), { detail: (cc) => { dot(cc, -28, -52, 1, rgba(PAL.ink, 0.6)); } });
};
function ring(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.lineWidth = 0.8; c.strokeStyle = col; c.stroke(); }

// ------------------------------------------------------------------------------------------------ district 3: sewers
PAINT.sewer_gator = (c, a) => {
  const w = a.w, g = mix(PAL.limeDeep, PAL.ink, 0.45), belly = mix(g, PAL.bone, 0.3), op = Math.max(0, a.atk) * 5.5;
  const tp = []; for (let i = 0; i < 9; i++) tp.push(14 + i * 2.5, -9 + sin(w + i * 0.5) * (0.5 + i * 0.4) + i * 0.4);
  ribbon(c, tp, (t) => 9 * (1 - t) + 1, g, { ht: 1 });
  spikeRow(c, 14, -14, 34, -9, 6, 3, shade(g, -0.2), { norim: true });
  legs(c, -9, -8, 8, 5.2, w, 3, shade(g, -0.1), 4, 1); legs(c, 10, -8, 8, 5.2, w + 1.7, 3, g, 4, 1);
  P(c, [-14, -10, -7, -18, 6, -19, 16, -14, 24, -9, 16, -5, 0, -4, -12, -4], g, { smooth: true, ht: 1, crack: 1 });
  P(c, [-10, -5, 0, -4, 14, -5.5, 4, -8, -8, -8], belly, { norim: true });
  spikeRow(c, -9, -18, 15, -15.4, 6, 4, shade(g, -0.25));
  // cart
  c.save(); c.translate(3, -24); c.rotate(-0.18);
  P(c, [-8, -10, 9, -10, 7, 2, -6, 2], mix(PAL.slate, PAL.ink, 0.55), { detail: (cc) => { cc.strokeStyle = PAL.boneDim; cc.lineWidth = 0.55; for (let x = -6; x <= 7; x += 3) { cc.beginPath(); cc.moveTo(x, -10); cc.lineTo(x * 0.85, 2); cc.stroke(); } for (let y = -7; y <= 0; y += 3.4) { cc.beginPath(); cc.moveTo(-8, y); cc.lineTo(9, y); cc.stroke(); } } });
  L(c, 9, -10, 13, -14, 1.4, 1.4, PAL.boneDim, { norim: true });
  ring(c, -3, 6, 2.2, PAL.boneDim);
  c.restore();
  // head
  P(c, [-12, -19, -22, -21, -31, -15.4, -31, -12, -12, -12.4], shade(g, 0.05), { ht: 1 });
  P(c, [-12, -11.4, -30.4, -11.2 + op, -29.6, -7.6 + op, -12, -6.4], shade(g, -0.18));
  teeth(c, -30.5, -12.5, -13, -12.6, 6, -2.8); teeth(c, -29, -9 + op, -13, -9, 5, 2.4);
  dot(c, -29.6, -15.2, 0.9, PAL.ink);
  E(c, -16, -21, 3.9, 3.4, shade(g, 0.1));
  eye(c, -16.6, -21.4, 2.2, 1.3);
};

function blob(c, a, o) {
  const r = o.r, cy = -r * 0.92, N = 14, pts = [];
  const body = o.col || mix(PAL.limeDeep, PAL.violet, 0.5), w = a.w, sq = o.squash || 0.95;
  for (let i = 0; i < N; i++) {
    const an = (i / N) * TAU, rr = r * (1 + 0.075 * sin(w * 2 + i * 1.9) + 0.04 * sin(w + i * 3.1));
    let x = cos(an) * rr * 1.1, y = cy + sin(an) * rr * sq; if (y > -1) y = -1 + (y + 1) * 0.1;
    pts.push(x, y);
  }
  if (o.drips) for (let i = 0; i < 3; i++) E(c, -r * 0.5 + i * r * 0.5, -1, r * 0.22, r * 0.12, shade(body, -0.2), { norim: true, noLine: true });
  P(c, pts, body, { smooth: true, ht: 1, detail: (cc) => {
    cc.fillStyle = rgba(PAL.bone, 0.22);
    for (let i = 0; i < 4; i++) { cc.beginPath(); cc.arc((hsh(i, o.s || 1) - 0.5) * r * 1.3 + sin(w + i) * 0.8, cy + (hsh(i, 9) - 0.2) * r * 0.9, r * (0.1 + 0.09 * hsh(i, 4)), 0, TAU); cc.fill(); }
    if (o.seam) { cc.strokeStyle = rgba(PAL.bone, 0.7); cc.lineWidth = 0.7; cc.setLineDash && cc.setLineDash([1.6, 1.6]); cc.beginPath(); cc.moveTo(r * 0.15, cy - r); cc.lineTo(-r * 0.1, cy - r * 0.3); cc.lineTo(r * 0.2, cy + r * 0.3); cc.lineTo(0, cy + r); cc.stroke(); cc.setLineDash && cc.setLineDash([]); }
  } });
  const ec = o.eye || ST.eye;
  if (o.one) { ball(c, -r * 0.3, cy - r * 0.1, r * 0.4, ec); } else { ball(c, -r * 0.46, cy - r * 0.2, r * 0.3, ec); ball(c, r * 0.14, cy - r * 0.3, r * 0.22, ec, -0.4); }
  const my = cy + r * 0.38, mw = r * 0.7;
  c.beginPath(); c.moveTo(-mw * 0.9, my); for (let i = 0; i <= 5; i++) c.lineTo(-mw * 0.9 + i * mw * 0.36, my + (i % 2 ? r * 0.2 : -r * 0.04));
  c.lineWidth = 0.9; c.strokeStyle = PAL.ink; c.stroke();
  if (o.spikes) for (let i = 0; i < 4; i++) P(c, [r * (-0.6 + i * 0.4), cy - r * 0.85, r * (-0.5 + i * 0.4), cy - r * 1.35, r * (-0.3 + i * 0.4), cy - r * 0.85], shade(body, -0.25), { norim: true });
}
PAINT.sludge_blob = (c, a) => blob(c, a, { r: 14, seam: 1, drips: 1, s: 3, squash: 0.92 });
PAINT.sludge_glob = (c, a) => blob(c, a, { r: 8, one: 1, spikes: 1, s: 7, col: mix(PAL.limeDeep, PAL.violet, 0.35) });

PAINT.mud_mole = (c, a) => {
  const w = a.w, fur = mix(PAL.slate, PAL.violet, 0.45), dirt = tone.rust(), dig = sin(w) * 2 + a.atk * 6;
  P(c, [-17, 0, -13, -4.4, -7, -3, -1, -8, 7, -3, 14, -5.4, 19, 0], dirt, { smooth: true, ht: 1, detail: (cc) => dotsB(cc, -15, -7, 17, 0, PAL.boneDim, 8) });
  legs(c, 6, -7, 7, 4, w, 2.4, shade(fur, -0.1), 3.6, 0);
  E(c, 3, -15, 11.5, 9.4, fur, { rot: -0.2, ht: 1 });
  E(c, 6, -12, 5.4, 4.6, shade(fur, 0.18), { norim: true });
  L(c, 11, -14, 16, -8, 3, 2.5, shade(fur, -0.3), { norim: true });
  P(c, [-5, -22, -13.5, -21.5, -19, -16, -14, -11.4, -6, -12.4], fur, { smooth: true });
  for (let i = 0; i < 7; i++) { const an = -0.9 + i * 0.3 + 3.14; P(c, [-19 + cos(an) * 0.6, -16 + sin(an) * 0.6, -19 + cos(an - 0.14) * 4, -16 + sin(an - 0.14) * 4, -19 + cos(an + 0.14) * 4, -16 + sin(an + 0.14) * 4], tone.pink(), { norim: true, noLine: true }); }
  dot(c, -19.2, -16, 1.4, PAL.magenta);
  E(c, -9, -19, 3.8, 3.8, PAL.ink3, { norim: false }); ring(c, -9, -19, 3.8, PAL.cyan);
  eye(c, -9.4, -19, 1.9, 1.1);
  line(c, [-5.2, -21, 2, -23], PAL.boneDim, 1);
  // digging arm
  L(c, -3, -15, -12 - dig * 0.4, -9 + dig * 0.2, 5.4, 4.6, fur);
  P(c, [-12 - dig * 0.4, -12 + dig * 0.2, -20 - dig * 0.4, -10.4 + dig * 0.2, -22 - dig * 0.4, -7.4 + dig * 0.2, -20 - dig * 0.4, -5 + dig * 0.2, -11 - dig * 0.4, -5.6 + dig * 0.2], shade(fur, 0.12));
  for (let i = 0; i < 3; i++) P(c, [-20 - dig * 0.4, -10 + i * 2.4 + dig * 0.2, -26 - dig * 0.4, -9.2 + i * 2.4 + dig * 0.2, -20 - dig * 0.4, -8 + i * 2.4 + dig * 0.2], PAL.bone, { norim: true });
};

PAINT.toxic_toad = (c, a) => {
  const w = a.w, sk = mix(PAL.limeDeep, PAL.violet, 0.28), hop = Math.abs(sin(w)) * 1.4, g = Math.max(0, a.atk), sac = 5.2 + g * 3.4 + sin(w * 2) * 0.4;
  c.save(); c.translate(0, -hop);
  L(c, 10, -9, 15, -2, 8, 6, shade(sk, -0.1)); P(c, [11, -2.6, 18, -3, 21, 0, 11, 0], shade(sk, -0.1), { norim: true });
  E(c, 0, -12, 16, 10.5, sk, { ht: 1, crack: 1 });
  E(c, -10, -7, sac, sac * 0.85, mix(PAL.lime, PAL.limeDeep, 0.35), { detail: (cc) => { cc.fillStyle = rgba(PAL.bone, 0.45); cc.beginPath(); cc.arc(-12, -9, 1.6, 0, TAU); cc.fill(); } });
  ST.lights && ST.lights.push([-10, -7, 8 + g * 4, PAL.lime, 0]);
  for (const p of [[-2, -18, 1.4], [5, -17, 1.8], [9, -12, 1.4], [0, -9, 1.2], [4, -6, 1.5]]) { dot(c, p[0], p[1], p[2], shade(sk, 0.28)); }
  L(c, -8, -8, -13, -1.4, 4, 3.4, shade(sk, -0.05));
  P(c, [-13, -2.4, -19.4, -2, -20, 0, -12, 0], shade(sk, -0.05), { norim: true });
  // mouth
  c.beginPath(); c.moveTo(-15.4, -11); c.lineTo(-10, -9 + g * 2); c.lineTo(-3, -10.6); c.lineWidth = 1.1; c.strokeStyle = PAL.ink; c.stroke();
  teeth(c, -15, -11, -4, -10.4, 4, 1.8);
  // eyes
  E(c, -9, -21, 4.2, 4, sk); E(c, -1, -22.4, 3.8, 3.6, shade(sk, 0.06));
  eye(c, -10, -21.2, 2.2, 1.3); eye(c, -2, -22.6, 2, 1.2);
  c.restore();
};

PAINT.gator_mayor = (c, a) => {
  const w = a.w, ph = a.ph, g = mix(PAL.limeDeep, PAL.ink, 0.45), suit = mix(PAL.violet, PAL.ink, 0.45), op = Math.max(0, a.atk) * 6;
  const tp = []; for (let i = 0; i < 8; i++) tp.push(10 + i * 3, -15 + sin(w + i * 0.5) * (0.7 + i * 0.4) + i * 0.7);
  ribbon(c, tp, (t) => 11 * (1 - t) + 1, g, { ht: 1 });
  if (ph < 2) spikeRow(c, 10, -20, 32, -10, 6, 3.4, mix(PAL.slate, PAL.boneDim, 0.3), { norim: false });
  legs(c, 0, -19, 18, 8.6, w, 4.4, mix(suit, PAL.ink, 0.1), 5, 4.4);
  P(c, [-13, -37, 13, -38, 17, -17, -16, -16], suit, { ht: 1, detail: (cc) => { cc.strokeStyle = rgba(PAL.bone, 0.14); cc.lineWidth = 0.6; for (let x = -14; x < 17; x += 3.2) { cc.beginPath(); cc.moveTo(x, -40); cc.lineTo(x * 1.08, -14); cc.stroke(); } } });
  if (ph >= 2) { P(c, [2, -30, 9, -33, 7, -26, 12, -24, 6, -20, 3, -24], mix(g, PAL.bone, 0.3), { norim: true }); }
  P(c, [-5, -38, 5, -38, 0, -22], PAL.bone, { norim: true });
  P(c, [-13, -37, -5, -38, 0, -22, -9, -19], shade(suit, -0.2), { norim: true }); P(c, [13, -38, 5, -38, 0, -22, 10, -19], shade(suit, -0.2), { norim: true });
  P(c, [-1.4, -35, 1.4, -35, 2.2, -26, 0, -22, -2.2, -26], PAL.magenta, { norim: true });
  P(c, [-12, -36, -8, -38, 15, -22, 12, -18], PAL.magenta, { detail: (cc) => { line(cc, [-9, -36, 13, -20], rgba(PAL.bone, 0.8), 0.7); } });
  ring(c, 2, -28, 2.6, PAL.bone); dot(c, 2, -28, 1.2, PAL.boneDim);
  // far arm and near arm
  L(c, 10, -34, 14, -24, 6, 5, suit); dot(c, 14.6, -22.6, 2.6, g);
  L(c, -11, -34, -19, -26 - op * 0.3, 7, 5.6, suit);
  R(c, -22, -29.8 - op * 0.3, 5, 3, PAL.bone, { cut: 0.6 });
  dot(c, -21.5, -25 - op * 0.3, 3, g);
  c.save(); c.translate(-23, -24 - op * 0.3); c.rotate(-0.5 - a.atk * 0.9);
  R(c, -1, -9, 2, 10, mix(PAL.boneDim, PAL.slate, 0.5), { cut: 0.4 }); R(c, -4, -12.5, 8, 4.4, PAL.slate, { cut: 0.8 });
  c.restore();
  // head
  P(c, [-8, -46, -20, -48, -34, -42.6, -34, -39.6, -9, -39], g, { ht: 1 });
  P(c, [-9, -39, -33, -39 + op, -32, -35.6 + op, -9, -34.6], shade(g, -0.18));
  teeth(c, -33.6, -40, -10, -40, 7, -3); teeth(c, -31.6, -36 + op, -10, -35.4, 6, 2.6);
  dot(c, -33, -42, 1, PAL.ink);
  E(c, -13, -48, 4.1, 3.5, shade(g, 0.1));
  eye(c, -13.6, -48.4, 2.4, 1.4);
  L(c, -33, -37.4 + op * 0.4, -39, -35.6 + op * 0.4, 2.4, 2.2, tone.rust(), { norim: true });
  dot(c, -39.4, -35.4 + op * 0.4, 1.2, ENEMY_COLOR.feral); ST.lights && ST.lights.push([-39.4, -35.4 + op * 0.4, 4.5, ENEMY_COLOR.feral, 2]);
  if (ph < 2) {
    const tilt = ph >= 1 ? 0.35 : 0;
    c.save(); c.translate(-9, -48); c.rotate(tilt);
    R(c, -11, -3, 22, 3.4, mix(PAL.violet, PAL.ink, 0.5), { cut: 0.8 });
    R(c, -7, -17, 14, 14.4, mix(PAL.violet, PAL.ink, 0.6), { cut: 1.2, detail: (cc) => { cc.fillStyle = PAL.magenta; cc.fillRect(-8, -6.4, 16, 2.6); } });
    c.restore();
  }
};

// ------------------------------------------------------------------------------------------------ district 4: laser strip
function rotor(c, x, y, r, w) {
  c.save(); c.globalAlpha = 0.28; c.beginPath(); c.ellipse(x, y, r, r * 0.28, 0, 0, TAU); c.fillStyle = PAL.boneDim; c.fill(); c.restore();
  const k = cos(w * 2), s = sin(w * 2);
  line(c, [x - r * k, y - r * 0.28 * s, x + r * k, y + r * 0.28 * s], PAL.bone, 0.9);
  line(c, [x + r * 0.7 * s, y - r * 0.2 * k, x - r * 0.7 * s, y + r * 0.2 * k], PAL.boneDim, 0.7);
}
PAINT.red_dot_drone = (c, a) => {
  const w = a.w, hull = tone.steel(), cy = -28;
  L(c, 4, cy - 2, 12, cy - 9, 2.2, 2, tone.steelD(), { norim: true }); L(c, 4, cy + 2, 12, cy + 6, 2.2, 2, tone.steelD(), { norim: true });
  rotor(c, 12, cy - 10, 9, w); rotor(c, 12, cy + 7, 9, w + 1);
  P(c, [-9, cy - 4, 0, cy - 8, 12, cy - 4, 14, cy + 1, 4, cy + 5, -9, cy + 3], hull, { ht: 1 });
  P(c, [-9, cy - 4, -14, cy - 1, -9, cy + 3], shade(hull, -0.3));
  L(c, 2, cy - 7, 8, cy - 14, 1.6, 1.4, tone.steelD(), { norim: true });
  dot(c, 8, cy - 14.4, 1, PAL.lime); ST.lights && ST.lights.push([8, cy - 14.4, 4, PAL.lime, 2]);
  rotor(c, -3, cy - 10, 8, w + 2); rotor(c, -3, cy + 7, 8, w + 3);
  L(c, -4, cy - 2, -3, cy - 9, 2, 1.8, tone.steelD(), { norim: true }); L(c, -4, cy + 2, -3, cy + 6, 2, 1.8, tone.steelD(), { norim: true });
  E(c, -7, cy - 0.4, 3.6, 3.2, PAL.ink3); ring(c, -7, cy - 0.4, 3.6, PAL.boneDim);
  eye(c, -7.6, cy - 0.4, 2, 1.3);
  R(c, -5, cy + 3, 6, 4, tone.steelD(), { cut: 0.8 });
  neon(c, [-9, cy + 7, -22, cy + 14], PAL.magenta, 0.6);
  dot(c, -23, cy + 14.4, 1.6, PAL.bone); ST.lights && ST.lights.push([-23, cy + 14.4, 6, PAL.magenta, 1]);
};

PAINT.strobe_sentry = (c, a) => {
  const w = a.w, body = tone.steel(), pulse = 0.5 + 0.5 * sin(w * 2);
  for (let k = 0; k < 3; k++) { const ang = -0.5 + k * 0.5, hx = k * 4 - 4; L(c, hx, -16, hx + (k - 1) * 7 * (1 + 0.08 * sin(w + k * 2)), 0, 3.2, 2.4, tone.steelD()); P(c, [hx + (k - 1) * 7 + 3, -1.4, hx + (k - 1) * 7 - 4, -1.4, hx + (k - 1) * 7 - 5, 0, hx + (k - 1) * 7 + 3, 0], tone.steelD(), { norim: true }); }
  P(c, [-9, -16, 9, -16, 7, -30, -7, -30], body, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.ink, 0.55); for (let i = 0; i < 4; i++) cc.fillRect(-6, -28 + i * 3.4, 12, 1); cc.fillStyle = PAL.magenta; cc.fillRect(-9, -21, 18, 1.4); } });
  R(c, -10, -33, 20, 5, tone.steelD(), { cut: 1.4 });
  // strobe head: hex lens array
  P(c, [-11, -34, -7, -42, 7, -42, 11, -34], mix(PAL.slate, PAL.ink, 0.3));
  for (let i = 0; i < 4; i++) { const lx = -7.5 + i * 5, on = (i + Math.floor(w / 1.57)) % 2 === 0; E(c, lx, -38, 2.2, 2.6, on ? PAL.bone : PAL.ink3, { norim: true }); if (ST.lights) ST.lights.push([lx, -38, 5.5, i % 2 ? PAL.lime : PAL.cyan, 1]); }
  eye(c, -5, -29.6, 1.8, 0.9, PAL.lime); eye(c, 4, -29.6, 1.8, 0.9, PAL.lime);
  L(c, 0, -42, 0, -49, 1.4, 1.4, PAL.boneDim, { norim: true }); dot(c, 0, -49.5, 1.2, PAL.lime);
  P(c, [-11, -29, -17, -26, -11, -24], tone.steelD()); P(c, [11, -29, 17, -26, 11, -24], tone.steelD());
};

PAINT.arcade_clanker = (c, a) => {
  const w = a.w, cab = mix(PAL.violet, PAL.ink, 0.35), g = Math.max(0, a.atk);
  legs(c, 0, -14, 14, 6, w, 3.6, tone.steelD(), 5, 5);
  rivets(c, -8, -4, 1, 0, 0);
  P(c, [-12, -16, 12, -16, 12, -48, 8, -52, -8, -52, -12, -48], cab, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.magenta, 0.55); cc.fillRect(-12, -33, 3, 18); cc.fillRect(9, -33, 3, 18); cc.fillStyle = rgba(PAL.lime, 0.65); cc.fillRect(-12, -47, 24, 1.4); } });
  R(c, -9, -50, 18, 5, PAL.ink3, { cut: 1, detail: (cc) => { cc.fillStyle = PAL.lime; for (let i = 0; i < 6; i++) cc.fillRect(-7.5 + i * 2.8, -48.4, 1.6, 2); } });
  R(c, -9, -43, 18, 14, PAL.ink, { cut: 1.6, norim: true, detail: (cc) => { cc.fillStyle = rgba(PAL.cyan, 0.16); for (let y = -42; y < -29; y += 2) cc.fillRect(-9, y, 18, 0.7); } });
  // angry pixel face
  c.fillStyle = PAL.lime; for (const p of [[-6, -40], [-5, -39], [-4, -38], [-3, -37], [-6, -39]]) c.fillRect(p[0] - 0.5, p[1], 1.9, 1.9);
  for (const p of [[3, -37], [4, -38], [5, -39], [6, -40], [6, -39]]) c.fillRect(p[0] - 0.5, p[1], 1.9, 1.9);
  c.fillRect(-4.5, -33, 9, 1.4); c.fillRect(-3.5, -34.4, 1.4, 1.4); c.fillRect(2.1, -34.4, 1.4, 1.4);
  ST.lights && ST.lights.push([-4, -37, 6, PAL.lime, 0], [4, -37, 6, PAL.lime, 0]);
  P(c, [-11, -28, 11, -28, 12, -22, -12, -22], mix(PAL.slate, PAL.ink, 0.3), { detail: (cc) => { dot(cc, -6, -25, 1.4, PAL.bone); cc.fillStyle = PAL.magenta; cc.fillRect(-1, -24.6, 2, 2); cc.fillStyle = PAL.cyan; cc.fillRect(3, -24.6, 2, 2); cc.fillStyle = PAL.lime; cc.fillRect(7, -24.6, 2, 2); } });
  R(c, -3, -20, 6, 3.4, PAL.ink, { cut: 0.6, norim: true });
  // arms: hydraulic
  L(c, -11, -36, -17, -26 - g * 3, 5, 4.4, tone.steelD()); R(c, -22, -30 - g * 3, 8, 6, tone.steel(), { cut: 1.2 });
  L(c, 11, -38, 17, -28, 4.4, 3.6, tone.steelD());
  armorPlate(c, -14, -52, 8, 6, PAL.slate);
};

PAINT.glitch_bug = (c, a) => {
  const w = a.w, base = mix(PAL.limeDeep, PAL.ink, 0.4), hop = 0;
  const body = (dx, dy, col, al, lines) => {
    c.save(); c.globalAlpha = al; c.translate(dx, dy);
    const o = lines ? {} : { noLine: true, norim: true, flat: true };
    P(c, [-10, -14, -4, -19, 6, -19, 12, -14, 11, -8, 4, -6, -6, -6, -11, -9], col, { ...o, ht: lines ? 1 : 0 });
    P(c, [-14, -16, -9, -14, -10, -10, -15, -11], col, o);
    c.restore();
  };
  // legs: angular six
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1, k = i % 3, hx = -5 + k * 6, sw = sin(w + i * 1.3) * 2.5;
    line(c, [hx, -9, hx + side * 5 + sw, -12 + (i % 2) * 2, hx + side * 8 + sw, -1], PAL.ink, 3.2);
    line(c, [hx, -9, hx + side * 5 + sw, -12 + (i % 2) * 2, hx + side * 8 + sw, -1], i < 3 ? tone.steelD() : mix(PAL.limeDeep, PAL.bone, 0.2), 1.2);
  }
  body(2.2, 0, PAL.magenta, 0.55, false); body(-2.2, 0.6, PAL.cyan, 0.5, false);
  body(0, 0, base, 1, true);
  c.fillStyle = rgba(PAL.lime, 0.8);
  for (let i = 0; i < 4; i++) c.fillRect(-8 + hsh(i, 4) * 10, -17 + i * 2.6, 3 + hsh(i, 8) * 5, 1.3);
  // slice displacement bars (glitch)
  c.fillStyle = PAL.bone; const gy = -18 + Math.floor(w * 1.9) % 10; c.fillRect(-14 + (Math.floor(w) % 3) * 2, gy, 9, 1);
  line(c, [-12, -18, -15, -25, -21, -27], PAL.ink, 2.6); line(c, [-12, -18, -15, -25, -21, -27], PAL.lime, 1); line(c, [-8, -19, -9, -27, -14, -31], PAL.ink, 2.6); line(c, [-8, -19, -9, -27, -14, -31], PAL.lime, 1); dot(c, -21, -27, 1.2, PAL.lime); dot(c, -14, -31, 1.2, PAL.lime);
  R(c, -14, -15.4, 3, 2.6, PAL.lime, { cut: 0.2, norim: true, noLine: true });
  eye(c, -11.6, -14, 1.6, 1);
  teeth(c, -15, -11, -11, -9.6, 2, 1.4);
};
PAINT.glitch_byte = (c, a) => {
  const w = a.w, hop = Math.abs(sin(w)) * 4, pix = (dx, col, al) => {
    c.save(); c.globalAlpha = al; c.translate(dx, -hop);
    R(c, -7, -14, 14, 13, col, { cut: 1.4, norim: dx === 0 ? false : true, noLine: dx !== 0, flat: dx !== 0, ht: dx === 0 ? 1 : 0 }); c.restore();
  };
  E(c, 0, -0.6, 7 - hop * 0.5, 1.6, rgba(PAL.ink, 0.5), { flat: true, norim: true, noLine: true });
  pix(1.8, PAL.magenta, 0.55); pix(-1.8, PAL.cyan, 0.5); pix(0, mix(PAL.limeDeep, PAL.ink, 0.35), 1);
  c.save(); c.translate(0, -hop);
  c.fillStyle = PAL.lime; c.fillRect(-5, -11, 3.2, 2.4); c.fillRect(1.6, -11, 3.2, 2.4);
  c.fillStyle = PAL.ink; c.fillRect(-4.2, -10.6, 1.2, 1.8); c.fillRect(2.4, -10.6, 1.2, 1.8);
  c.fillStyle = PAL.bone; c.fillRect(-4, -5.6, 8, 1.4); c.fillStyle = PAL.ink; c.fillRect(-2.2, -5.6, 0.9, 1.4); c.fillRect(0.6, -5.6, 0.9, 1.4);
  c.fillStyle = PAL.lime; c.fillRect(-7.6, -7, 2, 1.1); c.fillRect(5.6, -3, 2.4, 1.1);
  c.restore();
  if (ST.lights) { ST.lights.push([-3.4, -11.2 - hop, 4, PAL.lime, 0], [3.2, -11.2 - hop, 4, PAL.lime, 0]); }
};

PAINT.dot_overlord = (c, a) => {
  const w = a.w, ph = a.ph, hull = mix(PAL.slate, PAL.violet, 0.4), cy = -34, g = Math.max(0, a.atk);
  // orbit pods
  for (let i = 0; i < (ph >= 2 ? 3 : 2); i++) {
    const an = w + i * 2.1, px = 6 + cos(an) * 20, py = cy + 4 + sin(an) * 9;
    E(c, px, py, 3.4, 3.4, tone.steelD()); dot(c, px - 1, py - 0.5, 1.1, ph >= 2 ? PAL.bone : PAL.lime);
    if (ST.lights) ST.lights.push([px - 1, py - 0.5, 4, ph >= 2 ? PAL.bone : PAL.lime, 1]);
  }
  // tail antenna and clip
  L(c, 14, cy - 1, 26, cy - 6, 3, 1.6, hull, { norim: true }); dot(c, 26.4, cy - 6.4, 1.6, PAL.magenta);
  P(c, [10, cy - 9, 21, cy - 13, 20, cy - 10, 11, cy - 6], PAL.slate);
  // body tube
  c.save(); c.translate(0, cy); c.rotate(-0.12);
  P(c, [-16, -9, 8, -10, 18, -8, 20, 0, 18, 8, 8, 10, -16, 9], hull, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.ink, 0.5); for (let x = -4; x < 18; x += 4) cc.fillRect(x, -10, 1.2, 20); cc.fillStyle = rgba(PAL.magenta, 0.6); cc.fillRect(-16, -2, 34, 1.6); } });
  c.restore();
  if (ph >= 2) { neon(c, [0, cy - 9, 3, cy - 3, -1, cy + 2, 4, cy + 8], PAL.bone, 0.8); }
  R(c, 6, cy - 6, 5, 3.2, PAL.magenta, { cut: 0.6 });
  // great lens
  const lx = -19, lr = 14;
  E(c, lx, cy, lr, lr * 1.05, mix(PAL.violet, PAL.ink, 0.55));
  const ring2 = ph >= 1 ? PAL.cyan : PAL.magenta;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(lx, cy, lr * (0.85 - i * 0.18), 0, TAU); c.lineWidth = 1.1; c.strokeStyle = i % 2 ? rgba(PAL.ink, 0.9) : rgba(ring2, 0.9); c.stroke(); }
  for (let k = 0; k < 3; k++) { c.beginPath(); for (let i = 0; i <= 14; i++) { const t = i / 14, an = w * (ph >= 1 ? 2.6 : 1.4) + k * 2.09 + t * 3.6, rr = t * lr * 0.8; const px = lx + cos(an) * rr, py = cy + sin(an) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.lineWidth = 1.4; c.strokeStyle = rgba(PAL.bone, 0.85); c.stroke(); }
  dot(c, lx, cy, 4.2 + g * 1.5, ST.eye); dot(c, lx, cy, 1.8, PAL.bone);
  ST.lights && ST.lights.push([lx, cy, 17 + g * 4, ST.eye, 0]);
  P(c, [lx - lr - 1, cy - 8, lx - lr - 6, cy - 14, lx - lr + 3, cy - lr + 1], mix(PAL.magenta, PAL.ink, 0.4), { norim: true });
  P(c, [lx - lr - 1, cy + 8, lx - lr - 6, cy + 14, lx - lr + 3, cy + lr - 1], mix(PAL.magenta, PAL.ink, 0.4), { norim: true });
  // the dot
  const dx = lx - 17, dy = cy + 14 + sin(w * 2) * 1.5;
  neon(c, [lx - lr + 4, cy + 4, dx, dy], PAL.magenta, 0.7);
  dot(c, dx, dy, 4.2, PAL.magenta); dot(c, dx - 0.8, dy - 0.8, 1.6, PAL.bone);
  ST.lights && ST.lights.push([dx, dy, 10, PAL.magenta, 1]);
};

// ------------------------------------------------------------------------------------------------ district 5: appliance heights
PAINT.roomba_rover = (c, a) => {
  const w = a.w, hull = tone.steel(), spin = w * 2;
  E(c, 0, -1, 14, 2.4, rgba(PAL.ink, 0.4), { flat: true, norim: true, noLine: true });
  P(c, [-15, -3, -13, -9, -6, -12, 8, -12, 14, -8, 16, -3, 12, 0, -12, 0], hull, { ht: 1 });
  P(c, [-15, -3, -13, -9, -15.4, -7, -17, -3.4], mix(PAL.magenta, PAL.ink, 0.3), { norim: true });
  R(c, -14, -3, 28, 1.8, mix(PAL.magenta, PAL.ink, 0.2), { cut: 0.4, norim: true });
  P(c, [-4, -11, -2, -16, 0, -11.4, 3, -17, 5, -11.4, 8, -15, 9, -11], tone.steelD(), { norim: false });
  E(c, -6, -9, 3.6, 2.6, PAL.ink3); ring(c, -6, -9, 3.6, PAL.boneDim);
  eye(c, -6.4, -9, 2, 1.2);
  R(c, 5, -10.4, 5, 2, PAL.lime, { cut: 0.4, norim: true });
  // spinning side brush
  c.save(); c.translate(-14, -2.4);
  for (let i = 0; i < 3; i++) { const an = spin + i * 2.09; P(c, [0, 0, cos(an) * 5.6, sin(an) * 2.2 - 1, cos(an + 0.4) * 3, sin(an + 0.4) * 1.4], PAL.bone, { norim: true }); }
  c.restore();
  dot(c, -3, -3, 2.4, tone.steelD()); dot(c, 8, -3, 2.4, tone.steelD());
  ST.lights && ST.lights.push([8, -11.4, 3, PAL.lime, 1]);
};

PAINT.vacuum_mech = (c, a) => {
  const w = a.w, hull = tone.steel(), g = a.atk;
  legs(c, 0, -17, 17, 7, w, 4, tone.steelD(), 5, 5);
  P(c, [-8, -17, 8, -17, 12, -26, 10, -34, -10, -34, -12, -26], hull, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.cyan, 0.18); cc.fillRect(-9, -33, 18, 12); cc.fillStyle = rgba(PAL.bone, 0.6); for (let i = 0; i < 6; i++) { cc.beginPath(); cc.arc(-6 + hsh(i, 2) * 12, -31 + hsh(i, 6) * 9, 0.7, 0, TAU); cc.fill(); } cc.fillStyle = PAL.magenta; cc.fillRect(-10, -19.4, 20, 1.5); } });
  // dust window swirl
  neon(c, [-6, -30, 0, -26, 5, -30, 1, -23], PAL.boneDim, 0.5);
  P(c, [-7, -35, 7, -35, 9, -41, 0, -45, -9, -41], tone.steelD(), { ht: 1 });
  R(c, -11, -42.6, 8, 5, mix(PAL.ink, PAL.violet, 0.3), { cut: 1, norim: true });
  eye(c, -9, -40.2, 1.7, 1, PAL.lime); eye(c, -4.4, -40.2, 1.7, 1, PAL.lime);
  armorPlate(c, 4, -42, 10, 8, PAL.slate); armorPlate(c, -17, -37, 9, 9, PAL.slate);
  // hose arm: ribbed hose to nozzle
  const reach = 3 + g * 6, pts = [-9, -33, -15 - reach * 0.4, -26 + sin(w) * 1.5, -22 - reach, -22 + sin(w + 1) * 1.5];
  ribbon(c, pts, 4, tone.steelD(), { detail: (cc) => { cc.strokeStyle = rgba(PAL.ink, 0.55); cc.lineWidth = 0.8; for (let i = 0; i < 8; i++) { const x = -9 - i * 2.2 - reach * 0.2 * (i / 8); cc.beginPath(); cc.moveTo(x, -36); cc.lineTo(x - 0.4, -16); cc.stroke(); } } });
  const nx = -22 - reach;
  P(c, [nx + 1, -26, nx - 6, -29, nx - 8, -16, nx - 1, -17], PAL.slate);
  c.fillStyle = PAL.ink; c.fillRect(nx - 7.2, -26, 1.4, 7);
  for (let i = 0; i < 5; i++) { c.fillStyle = PAL.bone; c.fillRect(nx - 7.8, -27 + i * 2.2, 1.6, 0.9); }
  neon(c, [nx - 8, -27, nx - 8, -17], PAL.cyan, 0.5);
  L(c, 10, -32, 15, -24, 5, 4, tone.steelD()); P(c, [13, -24, 21, -24, 19, -19, 14, -19], PAL.slate); spikeRow(c, 21, -23.8, 20, -19.6, 2, 3, PAL.bone, { norim: true });
};

PAINT.toaster_turret = (c, a) => {
  const w = a.w, chrome = mix(PAL.boneDim, PAL.slate, 0.45), g = Math.max(0, a.atk), pop = (sin(w * 2) * 0.5 + 0.5) * 5 + g * 4;
  for (let k = 0; k < 3; k++) L(c, -9 + k * 9, -12, -10 + k * 9 + sin(w + k) * 2.4, 0, 3.4, 2.6, tone.steelD());
  // toast slices
  P(c, [-8, -21, -8.4, -27 - pop, -5, -29 - pop, -1, -27 - pop, -1.6, -21], tone.bread(), { norim: false, detail: (cc) => { cc.fillStyle = rgba(tone.rust(), 0.7); cc.fillRect(-9, -29 - pop, 9, 2); } });
  P(c, [2, -21, 1.6, -26 - pop * 0.7, 5, -28 - pop * 0.7, 9, -26 - pop * 0.7, 8.4, -21], mix(tone.bread(), PAL.ink, 0.25));
  P(c, [-13, -12, 13, -12, 15, -17, 13, -24, -13, -24, -15, -17], chrome, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.bone, 0.5); cc.fillRect(-12, -22.6, 24, 1); cc.fillStyle = rgba(ENEMY_COLOR.feral, 0.9); for (let i = 0; i < 4; i++) cc.fillRect(-12 + i * 6.4, -15, 3.4, 1.6); cc.fillStyle = PAL.ink; cc.fillRect(-14, -17.4, 28, 0.9); } });
  R(c, -9, -25, 8, 2.6, PAL.ink, { cut: 0.6, norim: true, noLine: true }); R(c, 1, -25, 8, 2.6, PAL.ink, { cut: 0.6, norim: true, noLine: true });
  neon(c, [-8.5, -23.8, -1.5, -23.8], ENEMY_COLOR.feral, 0.7); neon(c, [1.5, -23.8, 8.5, -23.8], ENEMY_COLOR.feral, 0.7);
  ST.lights && ST.lights.push([-5, -24, 7, ENEMY_COLOR.feral, 2], [5, -24, 7, ENEMY_COLOR.feral, 2]);
  // barrel
  R(c, -26 - g * 2, -22, 14, 5, tone.steelD(), { cut: 1 }); R(c, -29 - g * 2, -23.4, 4, 8, PAL.slate, { cut: 0.8 });
  neon(c, [-29.4 - g * 2, -19.4, -31 - g * 4, -19.4], ENEMY_COLOR.feral, 0.8 + g);
  // lever and dial
  L(c, 12, -20, 17, -26 + sin(w) * 1.2, 1.6, 1.6, PAL.magenta, { norim: true }); dot(c, 17.4, -26.6 + sin(w) * 1.2, 1.8, PAL.magenta);
  eye(c, -6, -18, 1.9, 0.9, ENEMY_COLOR.feral); eye(c, 5, -18, 1.9, 0.9, ENEMY_COLOR.feral);
  ST.core = [0, -19];
};

PAINT.microwave_medic = (c, a) => {
  const w = a.w, box = mix(PAL.boneDim, PAL.slate, 0.4);
  legs(c, 0, -11, 11, 5, w, 3, tone.steelD(), 4, 4.5);
  P(c, [-14, -11, 14, -11, 15, -14, 15, -36, 13, -38, -13, -38, -15, -36, -15, -14], box, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.ink, 0.35); cc.fillRect(8, -36, 7, 24); } });
  R(c, -12, -35, 17, 20, PAL.ink, { cut: 1.8, norim: true, detail: (cc) => {
    const gl = cc.createLinearGradient(-12, -35, 5, -15); gl.addColorStop(0, rgba(PAL.lime, 0.55)); gl.addColorStop(1, rgba(PAL.limeDeep, 0.25));
    cc.fillStyle = gl; cc.fillRect(-12, -35, 17, 20);
    cc.fillStyle = PAL.bone; cc.fillRect(-5, -29, 3, 11); cc.fillRect(-9, -25, 11, 3);
    cc.fillStyle = rgba(PAL.ink, 0.5); cc.beginPath(); cc.ellipse(-3.5, -17, 8, 2, 0, 0, TAU); cc.fill();
    cc.strokeStyle = rgba(PAL.bone, 0.7); cc.lineWidth = 0.7; cc.beginPath(); cc.moveTo(-12, -33); cc.lineTo(-10, -33); cc.stroke();
  } });
  ST.lights && ST.lights.push([-3.5, -24, 12, PAL.lime, 0]);
  R(c, 6.4, -36, 7, 4, PAL.ink, { cut: 0.6, norim: true, detail: (cc) => { cc.fillStyle = PAL.lime; cc.fillRect(7.4, -35, 1.4, 2); cc.fillRect(9.6, -35, 1.4, 2); cc.fillRect(11.4, -35, 1, 2); } });
  for (let i = 0; i < 3; i++) dot(c, 10, -29 + i * 3.6, 1.1, i === 1 ? PAL.magenta : PAL.boneDim);
  R(c, 5.4, -22, 1.4, 8, PAL.slate, { cut: 0.3, norim: true });
  eye(c, -9.4, -36.4, 1.8, 0.9, PAL.lime);
  L(c, 0, -38, 3, -44, 1.4, 1.4, PAL.boneDim, { norim: true }); E(c, 3.4, -45, 3.4, 1.4, PAL.boneDim, { norim: true });
  L(c, -14, -28, -20, -22 + sin(w) * 1.2, 4, 3.4, tone.steelD()); dot(c, -20.6, -21.6 + sin(w) * 1.2, 2, PAL.slate);
};

PAINT.hoovermatron_prime = (c, a) => {
  const w = a.w, ph = a.ph, hull = tone.steel(), g = Math.max(0, a.atk);
  const hot = ph >= 2 ? ENEMY_COLOR.feral : PAL.magenta;
  // back exhaust and bay
  P(c, [10, -34, 24, -38, 24, -30, 12, -26], tone.steelD(), { ht: 1 });
  for (let i = 0; i < 3; i++) L(c, 14 + i * 3, -38 - i * 0.6, 17 + i * 3, -49 - i * 3, 3.4, 2, shade(PAL.slate, -0.2), { norim: true });
  ST.lights && ST.lights.push([26, -34, 8, hot, 0]);
  legs(c, 3, -20, 20, 10, w, 4.4, tone.steelD(), 6, 6);
  // canister torso
  c.save(); c.translate(0, -34); c.rotate(-0.06);
  P(c, [-16, -14, 16, -15, 20, -6, 20, 8, 14, 14, -14, 14, -19, 8, -19, -6], hull, { ht: 1, crack: ph >= 1, detail: (cc) => { cc.fillStyle = rgba(hot, 0.7); cc.fillRect(-20, 1, 40, 2); cc.fillStyle = rgba(PAL.ink, 0.35); for (let i = 0; i < 4; i++) cc.fillRect(-14 + i * 8, -12, 1.2, 24); } });
  c.restore();
  // dust bag chest window
  E(c, 6, -34, 7, 8, PAL.ink, { norim: true, detail: (cc) => { cc.fillStyle = rgba(hot, 0.35 + 0.1 * ph); cc.fillRect(-2, -44, 16, 20); cc.fillStyle = rgba(PAL.bone, 0.7); for (let i = 0; i < 7; i++) { cc.beginPath(); cc.arc(1 + hsh(i, 2) * 10, -40 + hsh(i, 7) * 12 + sin(w + i) * 0.6, 0.8, 0, TAU); cc.fill(); } } });
  ST.lights && ST.lights.push([6, -34, 11, hot, 0]);
  // intake maw
  const mx = -17, my = -30;
  P(c, [mx + 3, my - 11, mx - 9, my - 13, mx - 12, my, mx - 9, my + 13, mx + 3, my + 11], tone.steelD());
  c.fillStyle = PAL.ink; c.beginPath(); c.ellipse(mx - 6, my, 4.2 + g * 0.8, 9.6, 0, 0, TAU); c.fill();
  for (let i = 0; i < 6; i++) { const an = w * 3 + i * 1.05; line(c, [mx - 6, my, mx - 6 + cos(an) * 3.6, my + sin(an) * 8.4], i % 2 ? PAL.bone : PAL.boneDim, 1.1); }
  spikeRow(c, mx + 3, my - 11, mx - 9, my - 13, 3, 3, PAL.bone, { norim: true }); spikeRow(c, mx - 9, my + 13, mx + 3, my + 11, 3, 3, PAL.bone, { norim: true });
  ST.lights && ST.lights.push([mx - 6, my, 12, hot, 1]);
  // head
  P(c, [-9, -50, 4, -52, 8, -46, 5, -42, -9, -42], tone.steelD(), { ht: 1 });
  R(c, -9, -49, 14, 5, PAL.ink, { cut: 1, norim: true });
  eye(c, -6, -46.4, 1.8, 1); eye(c, -1.4, -46.4, 1.8, 1); eye(c, 3.2, -46.4, 1.8, 1);
  L(c, -2, -52, -6, -58, 1.4, 1.2, PAL.slate, { norim: true }); dot(c, -6.4, -58.6, 1.4, hot);
  // shoulder cannon + drones
  if (ph < 2) { armorPlate(c, 4, -57, 14, 11, PAL.slate); armorPlate(c, -16, -52, 10, 9, PAL.slate); }
  R(c, 16, -44, 12, 6, tone.steelD(), { cut: 1 }); dot(c, 17, -41, 1.6, hot);
  // hose cannon arm
  const k = g * 5;
  L(c, 16, -26, 22, -18, 8, 6, tone.steelD()); R(c, 17, -19, 10, 7, PAL.slate, { cut: 1.4 });
  L(c, -14, -24, -22 - k, -17, 7, 5.6, tone.steelD()); P(c, [-22 - k, -22, -29 - k, -19.4, -28 - k, -12, -21 - k, -13], PAL.slate);
  spikeRow(c, -29 - k, -19.4, -28 - k, -12, 2, 3, PAL.bone, { norim: true });
  if (ph >= 1) neon(c, [-16, -42, -13, -37, -16, -32], hot, 0.7);
};

// ------------------------------------------------------------------------------------------------ district 6: bathtub bay
PAINT.rubber_duck_raider = (c, a) => {
  const w = a.w, duck = mix(PAL.bone, PAL.magenta, 0.32), cy = -26, fl = sin(w);
  wingShape(c, 3, cy - 3, 0.3 - 0.5 * sin(w - 0.5), 8, shade(duck, -0.25), { norim: true });
  P(c, [10, cy - 2, 17, cy - 6, 14, cy, 12, cy + 3], duck);
  E(c, 1, cy, 11, 8.4, duck, { rot: -0.05, ht: 1 });
  E(c, -8, cy - 8, 6.4, 6, duck);
  P(c, [-13, cy - 8, -21, cy - 6.6, -14, cy - 3.6], tone.orange());
  teeth(c, -21, cy - 6.2, -14.5, cy - 3.6, 3, -1.8);
  eye(c, -9.8, cy - 9.2, 2, 1.1);
  P(c, [-15, cy - 13, -8, cy - 15, -2, cy - 11.4, -3, cy - 8.6, -13, cy - 9.4], mix(PAL.magenta, PAL.ink, 0.15), { detail: (cc) => { cc.fillStyle = rgba(PAL.bone, 0.8); dot(cc, -9, cy - 12, 1, PAL.bone); dot(cc, -5, cy - 10.6, 0.8, PAL.bone); } });
  P(c, [-3, cy - 9.4, 6, cy - 5, 4, cy - 3, -4, cy - 7], mix(PAL.magenta, PAL.ink, 0.15), { norim: true });
  P(c, [-11.6, cy - 11.4, -7.4, cy - 11.4, -9, cy - 8.4], PAL.ink, { norim: true, noLine: true });
  wingShape(c, -1, cy - 2, -0.2 - 0.9 * fl, 11, shade(duck, -0.1));
  L(c, -6, cy + 3, -14, cy - 2 - Math.max(0, a.atk) * 3, 2, 1.4, PAL.boneDim, { norim: true });
  P(c, [-14, cy - 1, -22, cy - 5 - Math.max(0, a.atk) * 3, -15, cy - 3.2], PAL.bone, { norim: true });
  E(c, -2, cy + 7.4, 6, 1.8, rgba(PAL.cyan, 0.5), { flat: true, norim: true, noLine: true });
};

PAINT.soap_slimer = (c, a) => {
  const w = a.w, soap = mix(PAL.cyan, PAL.bone, 0.45), bar = mix(soap, PAL.violet, 0.35), sk = sin(w) * 1.2;
  E(c, 0, -1, 14, 2.6, rgba(PAL.cyan, 0.4), { flat: true, norim: true, noLine: true });
  P(c, [-13 + sk, -3, -14 + sk, -22, -9 + sk, -31, 8 + sk, -32, 14 + sk, -22, 14, -3, 6, 0, -6, 0], bar, { smooth: false, ht: 1, detail: (cc) => { cc.strokeStyle = rgba(PAL.bone, 0.3); cc.lineWidth = 0.7; cc.beginPath(); cc.moveTo(-4 + sk, -30); cc.lineTo(-9, -4); cc.stroke(); cc.beginPath(); cc.moveTo(6, -4); cc.lineTo(10, -22); cc.stroke(); } });
  // seams
  c.beginPath(); c.moveTo(0 + sk, -32); c.lineTo(-2, -22); c.lineTo(2, -12); c.lineTo(0, -1); c.lineWidth = 0.8; c.strokeStyle = rgba(PAL.bone, 0.85); c.setLineDash && c.setLineDash([1.4, 1.4]); c.stroke(); c.setLineDash && c.setLineDash([]);
  // foam crown
  c.fillStyle = PAL.bone; for (let i = 0; i < 6; i++) { const bx = -11 + i * 4.6 + sk, by = -31 - hsh(i, 3) * 3 - sin(w + i) * 0.6; c.beginPath(); c.arc(bx, by, 2.8 + hsh(i, 6) * 1.6, 0, TAU); c.fill(); c.lineWidth = 0.6; c.strokeStyle = PAL.ink; c.stroke(); }
  for (let i = 0; i < 4; i++) { const bx = -12 + i * 8 + sk, by = -12 + hsh(i, 9) * 8; c.beginPath(); c.arc(bx, by, 1.4 + hsh(i, 2), 0, TAU); c.strokeStyle = rgba(PAL.bone, 0.8); c.lineWidth = 0.7; c.stroke(); }
  ball(c, -5.4 + sk, -21, 3.4, ST.eye); ball(c, 3.6 + sk, -22, 2.8, ST.eye, -0.4);
  line(c, [-9 + sk, -26, -2 + sk, -23.6], PAL.ink, 1.4); line(c, [8 + sk, -26.4, 1.4 + sk, -24.4], PAL.ink, 1.4);
  c.beginPath(); c.moveTo(-8 + sk, -11); for (let i = 0; i <= 5; i++) c.lineTo(-8 + i * 3.2 + sk, -11 + (i % 2 ? 3 : -0.5)); c.lineWidth = 1.2; c.strokeStyle = PAL.ink; c.stroke();
  for (let i = 0; i < 3; i++) { E(c, -9 + i * 9, -1, 1.6, 2.6 + hsh(i, 4) * 2, soap, { norim: true, noLine: true }); }
};

PAINT.soap_bubble = (c, a) => {
  const w = a.w, cy = -24, r = 8.6 + sin(w * 2) * 0.5;
  E(c, 0, 0, 4.6, 1.2, rgba(PAL.ink, 0.3), { flat: true, norim: true, noLine: true });
  for (let i = 0; i < 4; i++) { const an = Math.PI * (0.62 + i * 0.25); P(c, [cos(an) * r * 0.85, cy + sin(an) * r * 0.85, cos(an + 0.25) * (r + 3.6), cy + sin(an + 0.25) * (r + 3.6), cos(an + 0.5) * r * 0.85, cy + sin(an + 0.5) * r * 0.85], mix(PAL.cyan, PAL.bone, 0.5), { norim: true }); }
  c.beginPath(); c.arc(0, cy, r, 0, TAU);
  const g = c.createRadialGradient(-r * 0.3, cy - r * 0.3, r * 0.1, 0, cy, r);
  g.addColorStop(0, rgba(PAL.cyan, 0.15)); g.addColorStop(0.75, rgba(PAL.violetHi, 0.28)); g.addColorStop(1, rgba(PAL.magenta, 0.55));
  c.lineWidth = 3.6; c.strokeStyle = PAL.ink; c.stroke(); c.fillStyle = g; c.fill();
  c.beginPath(); c.arc(0, cy, r, 0, TAU); c.lineWidth = 1.2; c.strokeStyle = rgba(PAL.magenta, 0.9); c.stroke();
  c.beginPath(); c.arc(0, cy, r - 1.4, PI * 1.55, PI * 1.95); c.lineWidth = 1; c.strokeStyle = rgba(PAL.cyan, 0.9); c.stroke();
  c.beginPath(); c.arc(0, cy, r * 0.72, PI * 1.1, PI * 1.4); c.lineWidth = 1.5; c.strokeStyle = rgba(PAL.bone, 0.9); c.stroke();
  eye(c, -2.6, cy + 0.6, 2.6, 1.5);
  line(c, [-6, cy - 3.6, 0, cy - 1.4], PAL.ink, 1.2);
};

PAINT.plunger_crab = (c, a) => {
  const w = a.w, shell = mix(PAL.magenta, PAL.ink, 0.6), cup = mix(PAL.magenta, PAL.boneDim, 0.2), g = Math.max(0, a.atk), sw = sin(w) * 2;
  for (let k = 0; k < 3; k++) { const hx = -8 + k * 7, ang = sin(w + k * 1.7) * 2.4; line(c, [hx, -9, hx + 6 + k, -14 + ang, hx + 12 + k * 2, -1], PAL.ink, 3.6); line(c, [hx, -9, hx + 6 + k, -14 + ang, hx + 12 + k * 2, -1], mix(shell, PAL.bone, 0.2), 1.5); }
  P(c, [-17, -9, -12, -17, -3, -20, 9, -19, 17, -13, 14, -6, 0, -4, -13, -5], shell, { ht: 1, crack: 1, detail: (cc) => { cc.strokeStyle = rgba(PAL.magenta, 0.5); cc.lineWidth = 0.8; for (let i = 0; i < 3; i++) { cc.beginPath(); cc.moveTo(-8 + i * 7, -19); cc.lineTo(-6 + i * 7, -6); cc.stroke(); } } });
  spikeRow(c, -12, -17, 14, -13.4, 5, 4, mix(shell, PAL.boneDim, 0.25));
  for (const sx of [-9, -4]) { L(c, sx, -18, sx - 2, -25, 1.6, 1.4, shell, { norim: true }); }
  dot(c, -11, -25.4, 2.2, PAL.bone); dot(c, -6, -25.4, 2.2, PAL.bone);
  eye(c, -11.6, -25.4, 1.6, 1, ENEMY_COLOR.feral); eye(c, -6.6, -25.4, 1.6, 1, ENEMY_COLOR.feral);
  teeth(c, -14, -9.4, -7, -8.4, 3, -1.8);
  // plunger claws
  const claw = (sx, sy, ex, ey, col) => {
    L(c, sx, sy, ex, ey, 3.4, 2.8, PAL.boneDim);
    c.save(); c.translate(ex, ey); c.rotate(Math.atan2(ey - sy, ex - sx));
    P(c, [0, -2.4, 3, -9, 8, -9.4, 9, 0, 8, 9.4, 3, 9, 0, 2.4], col, { smooth: true, ht: 1 });
    E(c, 6, 0, 2.8, 6.4, shade(col, -0.35), { norim: true }); ring(c, 5, 0, 5, rgba(PAL.bone, 0.5));
    c.restore();
  };
  claw(-12, -12, -21 - g * 5, -15 + sw * 0.4, shade(cup, -0.15));
  claw(-6, -14, -15 - g * 4, -20 - sw * 0.3, cup);
};

PAINT.faucet_eel = (c, a) => {
  const w = a.w, eel = mix(PAL.cyanDeep, PAL.ink, 0.42), pipe = tone.steel(), g = Math.max(0, a.atk);
  // pipe stub base
  P(c, [-6, -9, 12, -9, 14, 0, -8, 0], pipe, { ht: 1 }); R(c, -8, -12, 22, 4, tone.steelD(), { cut: 0.8 }); rivets(c, -5, -10, 4, 5, 0, 0.7);
  L(c, 12, -6, 18, -6, 4, 4, pipe); ring(c, 12, -6, 3, PAL.boneDim);
  const pts = []; for (let i = 0; i < 12; i++) { const t = i / 11; pts.push(2 + sin(t * 5.2 + w) * (4 + t * 3) - t * 9, -10 - t * 32 + sin(t * 3 + w * 1.5) * 0.8); }
  ribbon(c, pts, (t) => 9 * (1 - 0.3 * t) + 1, eel, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.bone, 0.2); cc.fillRect(-30, -24, 60, 1); cc.strokeStyle = rgba(PAL.cyan, 0.5); cc.lineWidth = 0.7; for (let i = 0; i < 6; i++) { cc.beginPath(); cc.moveTo(-12, -14 - i * 5); cc.lineTo(12, -16 - i * 5); cc.stroke(); } } });
  const hx = pts[22], hy = pts[23];
  P(c, [hx + 3, hy - 4, hx - 5, hy - 8 - g, hx - 18, hy - 3, hx - 18, hy + 1, hx - 6, hy + 2 + g * 2, hx + 3, hy + 4], eel, { ht: 1 });
  teeth(c, hx - 18, hy - 2, hx - 5, hy - 3, 4, 2.4);
  // faucet spout nozzle on head
  R(c, hx - 8, hy - 14, 4, 8, PAL.slate, { cut: 0.6 }); P(c, [hx - 8, hy - 14, hx - 16, hy - 14, hx - 16, hy - 11.4, hx - 8, hy - 10], PAL.boneDim);
  dot(c, hx - 16, hy - 8, 0.9, PAL.cyan);
  spikeRow(c, hx + 4, hy - 5, hx + 2, hy - 18, 3, 4, shade(eel, 0.25), { norim: true });
  eye(c, hx - 6, hy - 3, 2, 1.1);
  for (let i = 1; i < 11; i += 3) { const px = pts[i * 2], py = pts[i * 2 + 1]; P(c, [px + 4, py - 1, px + 11, py - 4, px + 5, py + 2], shade(eel, 0.25), { norim: true }); }
  neon(c, [hx - 2, hy - 16, hx + 3, hy - 22, hx - 1, hy - 28], PAL.cyan, 0.5);
  ST.lights && ST.lights.push([hx - 4, hy - 20, 7, PAL.cyan, 1]);
};

PAINT.kraken_tentacle = (c, a) => {
  const w = a.w, sk = mix(PAL.violet, PAL.magentaDeep, 0.35), pts = [];
  E(c, 0, -0.6, 13, 2.4, mix(PAL.cyan, PAL.violet, 0.3), { norim: true, noLine: true, flat: true });
  for (let i = 0; i < 12; i++) { const t = i / 11; pts.push(sin(t * 4.4 + w) * (3 + t * 7) + t * t * -10 + 2, -t * 52 + 1); }
  ribbon(c, pts, (t) => 13 * (1 - t) + 2, sk, { ht: 1, detail: (cc) => {
    for (let i = 0; i < 9; i++) { const t = i / 11, j = Math.min(10, i + 1), x = pts[i * 2] - (11 * (1 - t) + 1) * 0.22, y = pts[i * 2 + 1]; cc.beginPath(); cc.arc(x, y, 1.9 * (1 - t) + 0.7, 0, TAU); cc.fillStyle = rgba(tone.pink(), 0.85); cc.fill(); cc.lineWidth = 0.5; cc.strokeStyle = rgba(PAL.ink, 0.6); cc.stroke(); }
  } });
  for (let i = 1; i < 10; i += 2) { const t = i / 11, x = pts[i * 2] + (13 * (1 - t) + 2) * 0.45, y = pts[i * 2 + 1]; P(c, [x - 1, y - 2, x + 4 + (1 - t) * 3, y - 0.5, x - 1, y + 2], shade(sk, 0.25), { norim: true }); }
  const tx = pts[22], ty = pts[23];
  P(c, [tx - 2, ty + 1, tx - 7, ty - 4, tx - 3, ty - 3, tx - 4, ty - 9, tx, ty - 4, tx + 3, ty - 8, tx + 3, ty - 1], PAL.bone, { norim: true });
  P(c, [-14, -4, -8, -9, -3, -3], shade(sk, 0.1), { norim: true });
};

PAINT.bathtub_kraken = (c, a) => {
  const w = a.w, ph = a.ph, por = mix(PAL.bone, PAL.violetHi, 0.4), sk = mix(PAL.violet, PAL.magentaDeep, ph >= 3 ? 0.55 : 0.3), g = Math.max(0, a.atk);
  // back tentacles (behind tub)
  const tent = (bx, by, dir, len, wob, wd, col) => {
    const pts = []; for (let i = 0; i < 9; i++) { const t = i / 8; pts.push(bx + dir * (t * len * 0.6) + sin(t * 4 + w + wob) * (3 + 6 * t), by - t * len); }
    ribbon(c, pts, (t) => wd * (1 - t * 0.85) + 1.2, col, { norim: wob > 3, detail: (cc) => { for (let i = 1; i < 8; i++) { cc.beginPath(); cc.arc(pts[i * 2] - 1, pts[i * 2 + 1], 1.4 * (1 - i / 9) + 0.5, 0, TAU); cc.fillStyle = rgba(tone.pink(), 0.8); cc.fill(); } } });
    return pts;
  };
  const up = ph >= 2 ? 6 : 0;
  tent(-12, -26, -1, 34 + up, 0, 8, shade(sk, -0.2)); tent(14, -26, 1, 32 + up, 2, 8, shade(sk, -0.2)); tent(0, -28, 0.2, 40 + up, 4, 7, shade(sk, -0.12));
  // head dome
  P(c, [-13, -24, -15, -37, -8, -49, 3, -52, 12, -46, 15, -36, 13, -24], sk, { smooth: true, ht: 1, crack: ph >= 3 });
  for (let i = 0; i < 4; i++) P(c, [-8 + i * 5, -49, -6 + i * 5, -57 - (i % 2) * 3, -4 + i * 5, -49], shade(sk, -0.3), { norim: true });
  // duck hat
  E(c, 1, -55, 5, 3.6, mix(PAL.bone, PAL.magenta, 0.32)); E(c, -3, -59, 3, 2.8, mix(PAL.bone, PAL.magenta, 0.32)); P(c, [-5.4, -59.2, -8.4, -58.4, -5.2, -57.2], tone.orange(), { norim: true }); dot(c, -3.6, -59.6, 0.6, PAL.ink);
  // eyes
  ball(c, -6, -38, 5, ST.eye); ball(c, 6.5, -38.6, 4.2, ST.eye, -0.5);
  line(c, [-12, -44, -2, -40.4], PAL.ink, 1.6); line(c, [12, -44.4, 3, -40.8], PAL.ink, 1.6);
  ST.lights && ST.lights.push([-6, -38, 9, ST.eye, 0], [6.5, -38.6, 8, ST.eye, 0]);
  teeth(c, -9, -29, 8, -29, 5, 3);
  // front tentacles gripping the rim
  const f1 = tent(-17, -22, -1.3, 14 + g * 5, 5, 7, sk), f2 = tent(18, -22, 1.2, 12, 6, 7, sk);
  // tub
  for (const lx of [-17, -7, 8, 18]) { L(c, lx, -8, lx + (lx < 0 ? -1.5 : 1.5), -2, 3.4, 2.6, PAL.boneDim); P(c, [lx - 2, -2.6, lx + 3, -2.6, lx + 3.6, 0, lx - 3, 0], PAL.boneDim, { norim: true }); }
  P(c, [-24, -22, 24, -22, 22, -13, 14, -8, -14, -8, -22, -13], por, { ht: 1, detail: (cc) => { cc.fillStyle = rgba(PAL.cyan, 0.2); cc.fillRect(-26, -14, 52, 2); cc.fillStyle = rgba(PAL.magenta, 0.35); cc.fillRect(-26, -19, 52, 1.2); } });
  R(c, -26, -25, 52, 5, shade(por, 0.15), { cut: 2 });
  // water
  c.save(); c.beginPath(); c.ellipse(0, -25, 22, 3, 0, 0, TAU); c.fillStyle = mix(PAL.violet, PAL.cyanDeep, 0.35); c.fill(); c.restore();
  if (ph >= 2) { for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, -25, 20 - i * 6, 2.6 - i * 0.7, 0, w + i, w + i + 4.4); c.lineWidth = 0.9; c.strokeStyle = rgba(PAL.bone, 0.75); c.stroke(); } }
  // tap
  L(c, 26, -24, 28, -34, 3, 3, PAL.boneDim); P(c, [24, -37, 31, -37, 29, -33, 25, -33], PAL.boneDim); dot(c, 28, -38, 2, PAL.magenta); dot(c, 22, -38, 1.8, PAL.cyan);
  // foam and ink
  const foam = ph >= 3 ? 9 : 4;
  c.fillStyle = PAL.bone; for (let i = 0; i < foam; i++) { const bx = -20 + hsh(i, 1) * 40, by = -26 - hsh(i, 2) * (ph >= 3 ? 7 : 3) + sin(w + i) * 0.5, br = 2 + hsh(i, 3) * 2.6; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill(); c.lineWidth = 0.6; c.strokeStyle = PAL.ink; c.stroke(); }
  if (ph === 1) { c.fillStyle = rgba(PAL.ink, 0.6); for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(-14 + i * 6 + sin(w + i) * 2, -50 + hsh(i, 4) * 10, 5 + hsh(i, 5) * 3, 0, TAU); c.fill(); } }
};

// ================================================================================================ definitions
const BOSS_EYES = {
  king_coo: [PAL.magenta, ENEMY_COLOR.feral, PAL.lime, PAL.bone],
  rat_emperor: [PAL.magenta, ENEMY_COLOR.feral, PAL.lime, PAL.bone],
  gator_mayor: [ENEMY_COLOR.feral, PAL.magenta, PAL.bone, PAL.bone],
  dot_overlord: [PAL.magenta, PAL.cyan, PAL.bone, PAL.bone],
  hoovermatron_prime: [PAL.lime, ENEMY_COLOR.feral, PAL.magenta, PAL.bone],
  bathtub_kraken: [ENEMY_COLOR.spirit, PAL.cyan, PAL.magenta, PAL.bone],
};
// id: [faction, gait cycles per second, top, cy, rx, ry, shadow half width]
const META = {
  pigeon_scout: ['vermin', 2.6, -44, -28, 14, 12, 9],
  pigeon_bomber: ['vermin', 2.2, -44, -28, 14, 15, 10],
  gutter_gull: ['feral', 1.5, -44, -22, 13, 20, 12],
  antenna_raven: ['spirit', 1.9, -52, -28, 16, 20, 9],
  king_coo: ['boss', 0.8, -57, -30, 22, 28, 22],
  rat_courier: ['vermin', 2.4, -22, -10, 16, 11, 13],
  dumpster_raccoon: ['vermin', 1.2, -42, -20, 14, 20, 13],
  stray_mutt: ['feral', 2.0, -37, -21, 18, 16, 15],
  rat_shaman: ['spirit', 1.1, -50, -26, 13, 24, 10],
  rat_emperor: ['boss', 0.8, -59, -30, 23, 28, 20],
  sewer_gator: ['feral', 1.0, -35, -14, 24, 14, 24],
  sludge_blob: ['spirit', 1.3, -28, -13, 16, 14, 14],
  sludge_glob: ['spirit', 1.8, -17, -8, 9, 8, 8],
  mud_mole: ['feral', 1.4, -26, -13, 17, 13, 15],
  toxic_toad: ['feral', 1.2, -28, -12, 17, 12, 17],
  gator_mayor: ['boss', 0.7, -62, -34, 24, 30, 22],
  red_dot_drone: ['tech', 2.6, -48, -28, 16, 18, 9],
  strobe_sentry: ['tech', 1.0, -50, -26, 13, 24, 11],
  arcade_clanker: ['tech', 1.0, -53, -30, 14, 24, 13],
  glitch_bug: ['tech', 2.0, -26, -13, 16, 11, 13],
  glitch_byte: ['tech', 2.2, -20, -8, 9, 9, 8],
  dot_overlord: ['boss', 0.9, -50, -34, 30, 24, 20],
  roomba_rover: ['tech', 1.8, -17, -7, 16, 9, 15],
  vacuum_mech: ['tech', 1.0, -58, -32, 20, 26, 17],
  toaster_turret: ['feral', 1.2, -38, -20, 18, 17, 16],
  microwave_medic: ['tech', 1.0, -47, -28, 14, 20, 13],
  hoovermatron_prime: ['boss', 0.7, -63, -34, 26, 30, 24],
  rubber_duck_raider: ['feral', 2.4, -41, -27, 15, 14, 9],
  soap_slimer: ['spirit', 1.2, -36, -17, 16, 18, 15],
  soap_bubble: ['spirit', 2.0, -35, -24, 11, 11, 6],
  plunger_crab: ['vermin', 1.6, -28, -12, 21, 14, 18],
  faucet_eel: ['feral', 1.2, -58, -28, 14, 28, 12],
  kraken_tentacle: ['spirit', 0.9, -56, -26, 12, 28, 12],
  bathtub_kraken: ['boss', 0.7, -60, -30, 27, 30, 26],
};
const DEFS = Object.create(null);
export const ENEMY_IDS = Object.freeze(ENEMIES.map((e) => e.id));
ENEMIES.forEach((e, i) => {
  const m = META[e.id] || ['vermin', 1.4, -40, -20, 14, 18, 12];
  DEFS[e.id] = {
    id: e.id, i, h: strHash(e.id), e, paint: PAINT[e.id] || PAINT.sludge_glob, fac: m[0], gait: m[1], top: m[2], cy: m[3], rx: m[4], ry: m[5], sh: m[6],
    scale: e.size || 1, boss: !!e.boss, fly: !!e.flying, traits: e.traits || [], nph: e.boss ? Math.max(1, e.phases.length) : 1,
    eyes: BOSS_EYES[e.id] || null,
  };
});
const FALLBACK = Object.create(null);
function defOf(id) {
  const d = DEFS[id]; if (d) return d;
  let f = FALLBACK[id];
  if (!f) { f = Object.assign({}, DEFS.sludge_glob, { id: String(id), i: 40 + Object.keys(FALLBACK).length, h: strHash(String(id)) }); FALLBACK[id] = f; }
  return f;
}
const RING = {}; for (const k in ENEMY_COLOR) RING[k] = rgba(ENEMY_COLOR[k], 0.35);
const SH_GROUND = rgba(PAL.ink, 0.55), SH_AIR = rgba(PAL.ink, 0.3);
function eyeColor(def, ph) { return def.eyes ? def.eyes[Math.min(ph, def.eyes.length - 1)] : ENEMY_COLOR[def.fac]; }
export function enemyScale(id) { return defOf(id).scale; }
export function enemyAnchors(id, size) {
  const d = defOf(id), u = fin(size, 32) * d.scale / 32;
  return { top: d.top * u, cy: d.cy * u, rx: d.rx * u, ry: d.ry * u, scale: d.scale, shadow: d.sh * u };
}

// ================================================================================================ baking
const BUCKETS = [32, 48, 64, 96, 128, 192, 256, 320];
const CACHE = new Map(), CACHE_MAX = 420;
let bakeCount = 0;
function atkEnv(p) { return p < 0.34 ? -p / 0.34 : p < 0.5 ? -1 + ((p - 0.34) / 0.16) * 2 : 1 - (p - 0.5) / 0.5; }
const PARAMS = { w: 0, atk: 0, ph: 0 };
function paintInto(c, def, kind, idx, ph) {
  PARAMS.w = kind ? 0.6 + ((idx + 0.5) / NA) * 2.6 : (idx / NW) * TAU;
  PARAMS.atk = kind ? atkEnv((idx + 0.5) / NA) : 0;
  PARAMS.ph = ph;
  ST.rim = FAC_RIM; ST.bounce = FAC_BOUNCE[def.fac] || PAL.lime; ST.eye = eyeColor(def, ph); ST.core = null;
  const lights = ST.lights = [];
  def.paint(c, PARAMS);
  ST.lights = null;
  return lights;
}
/** Tight box of the non transparent pixels of a baked sprite, [sx, sy, sw, sh] in bitmap pixels (null when it cannot be read). Blitting only this box saves most of the fill rate on software canvases. */
function alphaBox(cx, w, h) {
  try {
    const d = cx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
    return (x1 - x0 + 1) * (y1 - y0 + 1) < w * h * 0.9 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null;
  } catch (e) { return null; }
}
function getSprite(def, kind, idx, ph, bi) {
  const key = ((((def.i * 2 + kind) * 8 + idx) * 4 + ph) * 8) + bi;
  let s = CACHE.get(key);
  if (s !== undefined) return s;
  const B = BUCKETS[bi], k = B / 32, cv = makeCanvas(BW * k, BH * k);
  let cx = null; try { cx = cv && cv.getContext('2d'); } catch (e) { cx = null; }
  if (!cx) { s = null; } else {
    cx.save(); cx.scale(cv.width / BW, cv.height / BH); cx.translate(-BX0, -BY0);
    const lights = paintInto(cx, def, kind, idx, ph);
    cx.restore();
    s = { cv, lights, core: ST.core, w: cv.width, h: cv.height, bb: alphaBox(cx, cv.width, cv.height) };
    bakeCount++;
  }
  CACHE.set(key, s === null ? false : s);
  if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  return s === null ? false : s;
}
export function clearEnemyArt() { CACHE.clear(); GLOWS.clear(); SCR.clear(); BUBBLES.clear(); }
export function enemyArtStats() { return { cached: CACHE.size, baked: bakeCount }; }

// ================================================================================================ live helpers
const GLOWS = new Map(), SCR = new Map(), BUBBLES = new Map();
function glowTex(col) {
  let g = GLOWS.get(col); if (g !== undefined) return g;
  g = null; const cv = makeCanvas(64, 64);
  try {
    const x = cv && cv.getContext('2d');
    if (x) { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.42)); gr.addColorStop(1, rgba(col, 0)); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); g = cv; }
  } catch (e) { g = null; }
  GLOWS.set(col, g); return g;
}
function softGlow(ctx, x, y, r, col, al) {
  if (!(r > 0) || !(al > 0)) return;
  const t = glowTex(col);
  if (t) {
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = cl(al, 0, 1);
    ctx.drawImage(t, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = po;
  } else palGlow(ctx, x, y, r, col, al);
}
function tinted(spr, col, al) {
  const key = spr.w * 4096 + spr.h;
  let s = SCR.get(key);
  if (s === undefined) { const cv = makeCanvas(spr.w, spr.h); let x = null; try { x = cv && cv.getContext('2d'); } catch (e) { x = null; } s = x ? { cv, x } : null; SCR.set(key, s); }
  if (!s) return null;
  const x = s.x;
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, spr.w, spr.h); x.drawImage(spr.cv, 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.globalAlpha = al; x.fillStyle = col; x.fillRect(0, 0, spr.w, spr.h);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  return s.cv;
}
function bubbleTex(col) {
  let b = BUBBLES.get(col); if (b !== undefined) return b;
  b = null; const cv = makeCanvas(128, 128);
  try {
    const x = cv && cv.getContext('2d');
    if (x) {
      const g = x.createRadialGradient(64, 64, 20, 64, 64, 62);
      g.addColorStop(0, rgba(col, 0.0)); g.addColorStop(0.72, rgba(col, 0.07)); g.addColorStop(1, rgba(col, 0.5));
      x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, TAU); x.fill();
      x.strokeStyle = rgba(PAL.bone, 0.13); x.lineWidth = 1;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const cx = 64 + i * 19 + (j & 1) * 9.5, cy = 64 + j * 16.5;
        if ((cx - 64) * (cx - 64) + (cy - 64) * (cy - 64) > 56 * 56) continue;
        x.beginPath(); for (let k = 0; k < 6; k++) { const an = k * PI / 3 + PI / 6; x.lineTo(cx + cos(an) * 10, cy + sin(an) * 10); } x.closePath(); x.stroke();
      }
      x.strokeStyle = rgba(col, 0.95); x.lineWidth = 2.4; x.beginPath(); x.arc(64, 64, 61, 0, TAU); x.stroke();
      x.strokeStyle = rgba(PAL.bone, 0.9); x.lineWidth = 3.2; x.beginPath(); x.arc(64, 64, 52, PI * 1.12, PI * 1.42); x.stroke();
      b = cv;
    }
  } catch (e) { b = null; }
  BUBBLES.set(col, b); return b;
}
function hasAff(aff, id) { return aff === id || (Array.isArray(aff) && aff.indexOf(id) >= 0); }
function affList(aff) { return typeof aff === 'string' ? [aff] : Array.isArray(aff) ? aff : null; }

function star4(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const rr = i & 1 ? r * 0.38 : r, an = rot + i * PI / 4; ctx.lineTo(x + cos(an) * rr, y + sin(an) * rr); }
  ctx.closePath();
}

// ---- affix auras, drawn in unit space around the enemy (centre 0,cy)
function affixBack(ctx, def, a, t, seed) {
  const cy = def.cy, rx = def.rx, ry = def.ry;
  if (a === 'swift') {
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const yy = cy + (i - 2) * ry * 0.38, len = 8 + hsh(seed, i) * 10, ph = frac(t * (1.6 + hsh(seed, i + 5)) + hsh(seed, i + 9));
      const x0 = rx * 0.55 + ph * rx * 0.9;
      ctx.strokeStyle = rgba(PAL.cyan, 0.85 * (1 - ph)); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + len, yy); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    softGlow(ctx, rx * 0.6, cy, rx * 1.1, PAL.cyan, 0.22);
  } else if (a === 'regenerating') {
    softGlow(ctx, 0, cy, Math.max(rx, ry) * 1.35, PAL.lime, 0.2 + 0.08 * sin(t * 2.4));
  } else if (a === 'volatile') {
    const p = 0.5 + 0.5 * sin(t * 7);
    softGlow(ctx, 0, cy, Math.max(rx, ry) * (1.35 + 0.2 * p), ENEMY_COLOR.feral, 0.26 + 0.16 * p);
  } else if (a === 'vampiric') {
    softGlow(ctx, 0, cy, Math.max(rx, ry) * 1.4, PAL.magentaDeep, 0.5);
  } else if (a === 'plated') {
    softGlow(ctx, 0, cy, Math.max(rx, ry) * 1.25, PAL.violetHi, 0.2);
  } else if (a === 'warded') {
    ctx.save(); ctx.translate(0, 0);
    ctx.strokeStyle = rgba(PAL.bone, 0.7); ctx.lineWidth = 0.9;
    const rr = rx * 1.25, rot = t * 0.9;
    ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.3, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) { const an = rot + i * TAU / 8, px = cos(an) * rr, py = sin(an) * rr * 0.3; ctx.beginPath(); ctx.moveTo(px, py - 1.8); ctx.lineTo(px + 1.2, py); ctx.lineTo(px, py + 1.8); ctx.lineTo(px - 1.2, py); ctx.closePath(); ctx.fillStyle = rgba(i & 1 ? PAL.cyan : PAL.bone, 0.85); ctx.fill(); }
    ctx.restore();
    softGlow(ctx, 0, 0, rx * 1.3, PAL.bone, 0.12);
  }
}
function affixFront(ctx, def, a, t, seed) {
  const cy = def.cy, rx = def.rx, ry = def.ry;
  if (a === 'plated') {
    for (let i = 0; i < 5; i++) {
      const an = t * 0.9 + i * TAU / 5, px = cos(an) * (rx * 1.1), py = cy + sin(an) * ry * 0.35 * 1.6 - ry * 0.1, front = sin(an) > -0.2;
      if (!front) continue;
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const aa = k * PI / 3; ctx.lineTo(px + cos(aa) * 4.2, py + sin(aa) * 4.2); }
      ctx.closePath(); ctx.fillStyle = PAL.boneDim; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.lineWidth = 0.7; ctx.strokeStyle = rgba(PAL.violetHi, 0.95); ctx.stroke();
    }
  } else if (a === 'regenerating') {
    for (let i = 0; i < 4; i++) {
      const ph = frac(t * 0.55 + i * 0.27 + hsh(seed, i) * 0.3), px = (hsh(seed, i + 3) - 0.5) * rx * 1.7, py = -ph * ry * 1.8;
      const al = Math.sin(ph * PI), s = 3.2;
      ctx.fillStyle = rgba(PAL.lime, al); ctx.fillRect(px - s * 0.3, py - s, s * 0.6, s * 2); ctx.fillRect(px - s, py - s * 0.3, s * 2, s * 0.6);
    }
  } else if (a === 'volatile') {
    const fl = hsh(Math.floor(t * 12), seed);
    ctx.lineWidth = 0.9; ctx.strokeStyle = rgba(ENEMY_COLOR.feral, 0.55 + 0.4 * fl); ctx.lineJoin = 'miter';
    for (let k = 0; k < 3; k++) {
      let px = (hsh(seed, k) - 0.5) * rx * 1.2, py = cy - ry * 0.5 + k * ry * 0.35;
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let i = 0; i < 4; i++) { px += (hsh(seed, k * 9 + i) - 0.5) * 7; py += 2 + hsh(seed, k * 5 + i + 2) * 3; ctx.lineTo(px, py); }
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) { const ph = frac(t * 1.1 + i * 0.33), px = (hsh(seed, i + 20) - 0.5) * rx * 1.6; ctx.fillStyle = rgba(PAL.bone, 1 - ph); ctx.fillRect(px, -ph * ry * 1.6 + cy * 0.2, 1, 1); }
  } else if (a === 'vampiric') {
    for (let i = 0; i < 5; i++) {
      const ph = frac(t * 0.7 + i * 0.2 + hsh(seed, i) * 0.2), an = hsh(seed, i + 7) * TAU, rr = (1 - ph) * rx * 1.7 + 2;
      const px = cos(an) * rr, py = cy + sin(an) * rr * 0.7;
      ctx.fillStyle = rgba(PAL.magenta, 0.85 * Math.sin(ph * PI)); ctx.beginPath(); ctx.arc(px, py, 1.2 + (1 - ph) * 0.8, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = PAL.bone;
    const fy = def.top + 3 + 0 * ry;
    ctx.beginPath(); ctx.moveTo(-3.5, fy); ctx.lineTo(-2.4, fy + 4); ctx.lineTo(-1.2, fy); ctx.moveTo(1.2, fy); ctx.lineTo(2.4, fy + 4); ctx.lineTo(3.5, fy); ctx.fill();
  } else if (a === 'warded') {
    for (let i = 0; i < 3; i++) {
      const an = t * 1.2 + i * TAU / 3, px = cos(an) * rx * 0.95, py = def.top - 3 + sin(an) * 2.5;
      ctx.save(); ctx.translate(px, py); ctx.rotate(t * 1.5 + i);
      ctx.beginPath(); ctx.moveTo(0, -2.6); ctx.lineTo(1.7, 0); ctx.lineTo(0, 2.6); ctx.lineTo(-1.7, 0); ctx.closePath(); ctx.fillStyle = rgba(i === 1 ? PAL.cyan : PAL.bone, 0.95); ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.restore();
    }
  }
}

// ---- live lights (eyes and lamps), positions come from the baked sprite
function drawLights(ctx, lights, t, seed, boost) {
  for (let i = 0; i < lights.length; i++) {
    const L0 = lights[i], kind = L0[4];
    let al = 0.55;
    if (kind === 0) al = 0.7 + 0.25 * sin(t * 5 + i * 1.7 + seed);
    else if (kind === 1) al = sin(t * 16 + L0[0] * 0.7) > 0.15 ? 0.95 : 0.12;
    else al = 0.45 + 0.5 * hsh(Math.floor(t * 14), i + seed);
    softGlow(ctx, L0[0], L0[1], L0[2] * (1 + boost * 0.35), L0[3], al * (1 + boost * 0.4));
  }
}

function drawGround(ctx, def, t, fly, ph, seed, lod) {
  const sw = def.sh, fc = def.boss ? eyeColor(def, ph) : ENEMY_COLOR[def.fac];
  ctx.fillStyle = fly ? SH_AIR : SH_GROUND; ctx.beginPath(); ctx.ellipse(0, 0, sw * (fly ? 0.72 : 1), sw * (fly ? 0.2 : 0.27), 0, 0, TAU); ctx.fill();
  if (lod && !def.boss) return;   // crowd level of detail: the shadow stays, the faction ring goes
  ctx.strokeStyle = def.boss ? rgba(fc, 0.5 + 0.15 * sin(t * 3)) : RING[def.fac]; ctx.lineWidth = def.boss ? 1.6 : 1.1;
  ctx.beginPath(); ctx.ellipse(0, 0, sw * 1.12, sw * 0.32, 0, 0, TAU); ctx.stroke();
  if (def.boss) { ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(0, 0, sw * 1.35 + sin(t * 2) * 1.5, sw * 0.4, 0, 0, TAU); ctx.strokeStyle = rgba(fc, 0.22); ctx.stroke(); }
}

function drawCrown(ctx, def, ph, t, seed) {
  const col = eyeColor(def, ph), bob = sin(t * 2.1 + seed) * 1.4, by = def.top - 8 + bob, n = 7, span = def.rx * 0.62;
  softGlow(ctx, 0, by - 3, span * 1.3, col, 0.3 + 0.1 * ph);
  ctx.lineJoin = 'miter';
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * 2 - 1, px = f * span, py = by + f * f * 3.4, hgt = 3.2 + 3 * (1 - abs(f)) + hsh(seed, i) * 1.4 + sin(t * 3 + i) * 0.6 + ph * 0.6;
    ctx.beginPath(); ctx.moveTo(px - 1.3, py); ctx.lineTo(px + f * 0.6, py - hgt); ctx.lineTo(px + 1.3, py); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = PAL.ink; ctx.stroke();
  }
  ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-span - 1.6, by - 0.4); ctx.quadraticCurveTo(0, by + 7.4, span + 1.6, by - 0.4); ctx.stroke();
}

function drawTraits(ctx, def, spr, t, seed, anim, ph) {
  const tr = def.traits;
  if (tr.indexOf('healer') >= 0) {
    const topY = def.top - (def.boss ? 12 : 7), p = 0.5 + 0.5 * sin(t * 4);
    softGlow(ctx, 0, topY, 7 + p * 2, PAL.lime, 0.5);
    ctx.fillStyle = PAL.ink; ctx.fillRect(-1.9, topY - 4.6, 3.8, 9.2); ctx.fillRect(-4.6, topY - 1.9, 9.2, 3.8);
    ctx.fillStyle = PAL.lime; ctx.fillRect(-1.1, topY - 3.8, 2.2, 7.6); ctx.fillRect(-3.8, topY - 1.1, 7.6, 2.2);
    ctx.fillStyle = rgba(PAL.bone, 0.9); ctx.fillRect(-0.5, topY - 3, 1, 3);
    const pr = frac(t / 3);
    ctx.strokeStyle = rgba(PAL.lime, 0.5 * (1 - pr)); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, def.rx * (1 + pr * 2.2), def.rx * 0.3 * (1 + pr * 2.2), 0, 0, TAU); ctx.stroke();
  }
  if (tr.indexOf('explosive') >= 0) {
    const core = (spr && spr.core) || (ST.core) || null, cx = core ? core[0] : 0, cyy = core ? core[1] : def.cy;
    const p = 0.5 + 0.5 * sin(t * 6 + seed);
    softGlow(ctx, cx, cyy, def.rx * (0.8 + 0.3 * p), ENEMY_COLOR.feral, 0.2 + 0.2 * p);
  }
  if (tr.indexOf('burrower') >= 0 && anim !== 'burrow') {
    for (let i = 0; i < 3; i++) { const ph2 = frac(t * 0.8 + i * 0.33), px = (hsh(seed, i) - 0.5) * def.sh * 1.8; ctx.fillStyle = rgba(PAL.boneDim, 0.7 * (1 - ph2)); ctx.fillRect(px, -ph2 * 5, 1.2, 1.2); }
  }
}

function drawBubbleShield(ctx, def, s, t, hf) {
  const col = PAL.cyan, tex = bubbleTex(col), rx = def.rx * 1.22 + 3, ry = def.ry * 1.12 + 3, cy = def.cy - 1;
  const pulse = 1 + 0.025 * sin(t * 3.2), al = cl(0.35 + 0.5 * s + hf * 0.4, 0, 1);
  if (tex) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = al; ctx.drawImage(tex, -rx * pulse, cy - ry * pulse, rx * 2 * pulse, ry * 2 * pulse); ctx.globalAlpha = pa;
  } else {
    ctx.beginPath(); ctx.ellipse(0, cy, rx * pulse, ry * pulse, 0, 0, TAU); ctx.fillStyle = rgba(col, 0.12 * al); ctx.fill(); ctx.strokeStyle = rgba(col, 0.9 * al); ctx.lineWidth = 1.4; ctx.stroke();
  }
  const rp = frac(t * 0.7);
  ctx.strokeStyle = rgba(PAL.bone, 0.35 * (1 - rp) * al); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(0, cy, rx * (0.6 + rp * 0.4), ry * (0.6 + rp * 0.4), 0, 0, TAU); ctx.stroke();
}

// ================================================================================================ drawEnemy
function pickBucket(eff) {
  const need = eff * 1.35;
  for (let i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= need) return i;
  return BUCKETS.length - 1;
}

export function drawEnemy(ctx, enemyId, x, y, size, o) {
  o = o || NO;
  const def = defOf(enemyId);
  x = fin(x); y = fin(y); size = fin(size, 32);
  if (size <= 0) return;
  const t = fin(o.t, 0), seed = (def.h ^ (fin(o.seed, 0) | 0)) | 0;
  const anim = o.anim || 'walk', animT = cl(fin(o.animT, 0), 0, 1);
  const eff = size * (o.noScale ? 1 : def.scale), u = eff / 32;
  const ph = def.nph > 1 ? cl(Math.floor(fin(o.phase, 0)), 0, def.nph - 1) : 0;
  const flip = o.facing === 1 ? -1 : 1;
  const bi = pickBucket(eff);
  if (anim === 'die') { drawDie(ctx, def, x, y, u, t, animT, ph, seed, flip, bi); return; }

  let kind = 0, idx = 0;
  const gaitT = t * def.gait + hsh(seed) * 3;
  if (anim === 'attack') { kind = 1; idx = Math.min(NA - 1, Math.floor(animT * NA)); }
  else if (anim === 'walk') idx = Math.floor(frac(gaitT) * NW) % NW;
  else if (anim === 'stun') idx = Math.floor(frac(t * 0.8) * NW) % NW;
  const aff = o.affix, affs = affList(aff);
  const sv = o.shield === undefined ? (def.traits.indexOf('shielded') >= 0 ? 1 : 0) : (o.shield === true ? 1 : cl(fin(+o.shield, 0), 0, 1));
  const hf = cl(fin(o.hitFlash, 0), 0, 1);

  ctx.save();
  ctx.translate(x, y); ctx.scale(u, u);
  const bob = def.fly ? sin(t * 2.6 + seed) * 1.8 : 0;
  const lod = o.lod > 0 && !def.boss ? 1 : 0;   // set by the battle screen when the field is crowded
  drawGround(ctx, def, t, def.fly, ph, seed, lod);
  if (affs) { const fc = AFFIX_COLOR[affs[0]] || PAL.bone; ctx.strokeStyle = rgba(fc, 0.55); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(0, 0, def.sh * 0.85, def.sh * 0.24, 0, 0, TAU); ctx.stroke(); }
  if (anim === 'burrow') {
    const sink = animT;
    ctx.beginPath(); ctx.rect(-70, -120, 140, 120 + 0.5); ctx.clip();
    ctx.translate(sin(t * 38) * 0.5 * (1 - sink), sink * (-def.top + 8));
  }
  // dust for burrow (drawn before the body in the unclipped space is not possible, so it sits at the ground line after)
  ctx.scale(flip, 1);
  // aura (bosses and elites)
  if (def.boss) { const ec = eyeColor(def, ph); softGlow(ctx, 0, def.cy + bob, def.rx * (1.7 + 0.28 * ph) * (1 + 0.05 * sin(t * 3)), ec, 0.34 + 0.06 * ph); }
  if (affs) for (let i = 0; i < affs.length; i++) affixBack(ctx, def, affs[i], t, seed);

  // animation transform around the feet
  let sx = 1, sy = 1 + 0.015 * sin(t * TAU * 1.2 + seed), dx = 0, rot = 0;
  if (anim === 'attack') {
    const env = atkEnv(animT);
    dx = -env * 2.6;
    if (env < 0) { sx = 1 + 0.08 * env; sy *= 1 - 0.03 * env; } else { sx = 1 + 0.12 * env; sy *= 1 - 0.05 * env; }
  } else if (anim === 'hit') {
    const k = 1 - animT; dx = 2 * k; sx = 1 + 0.07 * k; sy *= 1 - 0.06 * k;
  } else if (anim === 'stun') rot = sin(t * 13) * 0.05;
  ctx.save();
  ctx.translate(dx, bob);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx, sy);

  const spr = getSprite(def, kind, idx, ph, bi);
  if (spr) {
    if (affs) {
      const ag = tinted(spr, AFFIX_COLOR[affs[0]] || PAL.bone, 1);
      if (ag) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 + 0.15 * sin(t * 4 + seed);
        ctx.translate(0, def.cy); ctx.scale(1.1, 1.1); ctx.translate(0, -def.cy); ctx.drawImage(ag, BX0, BY0, BW, BH); ctx.restore();
      }
    }
    let img = spr.cv;
    if (hf > 0.02) {
      const col = hf > 0.55 ? PAL.bone : PAL.magenta, tn = tinted(spr, col, hf > 0.55 ? 1 : cl(hf * 1.4, 0, 0.85));
      if (tn) img = tn;
    }
    const bb = spr.bb;
    if (bb) { const fx = BW / spr.w, fy = BH / spr.h; ctx.drawImage(img, bb[0], bb[1], bb[2], bb[3], BX0 + bb[0] * fx, BY0 + bb[1] * fy, bb[2] * fx, bb[3] * fy); }
    else ctx.drawImage(img, BX0, BY0, BW, BH);
    if (!lod) drawLights(ctx, spr.lights, t, seed, hf);
  } else {
    const lights = paintInto(ctx, def, kind, idx, ph);
    if (hf > 0.02) softGlow(ctx, 0, def.cy, def.rx * 1.3, hf > 0.55 ? PAL.bone : PAL.magenta, hf);
    drawLights(ctx, lights, t, seed, hf);
  }
  drawTraits(ctx, def, spr, t, seed, anim, ph);
  // dripping neon from the lower edge
  if (eff > 20 && !lod) {
    const dc = FAC_BOUNCE[def.fac] || PAL.lime, by = def.fly ? def.cy + def.ry * 0.55 : -2.5;
    for (let i = 0; i < 3; i++) {
      const p = frac(t * (0.42 + hsh(seed, i) * 0.25) + hsh(seed, i + 4)), px = (hsh(seed, i + 8) - 0.5) * def.rx * 1.5;
      ctx.fillStyle = rgba(dc, 0.85 * (1 - p)); ctx.fillRect(px - 0.4, by + p * p * (def.fly ? 16 : 5), 0.9, 1.6 + p * 2.2);
    }
  }
  ctx.restore();

  if (sv > 0.01) { ctx.save(); ctx.translate(0, bob); drawBubbleShield(ctx, def, sv, t, hf); ctx.restore(); }
  if (affs) for (let i = 0; i < affs.length; i++) affixFront(ctx, def, affs[i], t, seed);
  if (anim === 'stun') {
    for (let i = 0; i < 3; i++) { const an = t * 4.5 + i * TAU / 3, px = cos(an) * def.rx * 0.5, py = def.top - 3 + sin(an) * 2.2; star4(ctx, px, py, 2.6, t * 3 + i); ctx.fillStyle = i === 1 ? PAL.cyan : PAL.bone; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = PAL.ink; ctx.stroke(); }
  }
  if (def.boss) drawCrown(ctx, def, ph, t, seed);
  ctx.restore();

  if (anim === 'burrow') drawDust(ctx, x, y, u, def, t, animT, seed);
}

function drawDust(ctx, x, y, u, def, t, animT, seed) {
  ctx.save(); ctx.translate(x, y); ctx.scale(u, u);
  const mound = Math.sin(animT * PI);
  ctx.fillStyle = rgba(tone.rust(), 0.9); ctx.beginPath(); ctx.ellipse(0, 0, def.sh * (0.5 + mound * 0.4), 2 + mound * 3.4, 0, PI, TAU); ctx.fill();
  ctx.lineWidth = 0.9; ctx.strokeStyle = PAL.ink; ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const p = frac(t * 1.7 + i * 0.113), px = (hsh(seed, i) - 0.5) * def.sh * 1.9, py = -p * (6 + hsh(seed, i + 9) * 10) * (0.4 + mound);
    ctx.fillStyle = rgba(i & 1 ? PAL.boneDim : tone.rust(), 0.85 * (1 - p)); const s = 1 + hsh(seed, i + 3) * 1.6; ctx.fillRect(px, py, s, s);
  }
  ctx.strokeStyle = rgba(PAL.boneDim, 0.4); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(0, 0, def.sh * (0.8 + animT * 0.6), def.sh * 0.22, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

// neon dissolve: bone pop, horizontal strips slide and fade, neon edge pass, square sparks, ink smoke ring
function drawDie(ctx, def, x, y, u, t, p, ph, seed, flip, bi) {
  const spr = getSprite(def, 0, 0, ph, bi), ec = def.boss ? eyeColor(def, ph) : ENEMY_COLOR[def.fac], N = 16;
  ctx.save(); ctx.translate(x, y); ctx.scale(u, u);
  const fade = 1 - cl((p - 0.55) / 0.45, 0, 1);
  // ground ring pulse
  ctx.strokeStyle = rgba(ec, 0.6 * (1 - p)); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, def.sh * (1 + p * 1.6), def.sh * 0.3 * (1 + p * 1.6), 0, 0, TAU); ctx.stroke();
  ctx.scale(flip, 1);
  const pop = p < 0.12 ? 1 + 0.15 * (p / 0.12) : 1 + 0.15 * (1 - cl((p - 0.12) / 0.25, 0, 1));
  ctx.scale(pop, pop);
  if (spr) {
    if (p < 0.12) {
      const tn = tinted(spr, PAL.bone, 1); ctx.drawImage(tn || spr.cv, BX0, BY0, BW, BH);
    } else {
      const tn = tinted(spr, ec, 1), sh = spr.h / N, dh = BH / N;
      for (let i = 0; i < N; i++) {
        const d = (i / N) * 0.38 + hsh(seed, i) * 0.12, q = cl((p - 0.1 - d) / 0.5, 0, 1);
        if (q >= 1) continue;
        const xo = (hsh(seed, i + 40) - 0.5) * q * 14, yo = -q * q * 9;
        ctx.globalAlpha = 1 - q;
        ctx.drawImage(spr.cv, 0, i * sh, spr.w, sh, BX0 + xo, BY0 + i * dh + yo, BW, dh + 0.35);
        if (tn) {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.sin(q * PI) * 0.95;
          ctx.drawImage(tn, 0, i * sh, spr.w, sh, BX0 + xo, BY0 + i * dh + yo, BW, dh + 0.35);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.globalAlpha = 1 - p; paintInto(ctx, def, 0, 0, ph); ctx.globalAlpha = 1;
    if (p < 0.12) softGlow(ctx, 0, def.cy, def.rx * 1.5, PAL.bone, 1);
  }
  ctx.restore();
  // sparks and smoke
  ctx.save(); ctx.translate(x, y); ctx.scale(u, u);
  const cyy = def.cy, e = outCubic(p);
  for (let k = 0; k < 14; k++) {
    const an = hsh(seed, k) * TAU, sp = 8 + hsh(seed, k + 20) * 20 * (def.boss ? 1.6 : 1), px = cos(an) * sp * e, py = cyy + sin(an) * sp * e * 0.9 - e * 6, s = (1.2 + hsh(seed, k + 40) * 2.2) * (1 - p);
    ctx.fillStyle = rgba(k % 3 === 0 ? PAL.bone : k % 3 === 1 ? ec : (FAC_BOUNCE[def.fac] || PAL.lime), cl(1.2 * (1 - p), 0, 1));
    ctx.fillRect(px - s / 2, py - s / 2, s, s);
  }
  if (p > 0.05) { ctx.strokeStyle = rgba(PAL.ink, 0.5 * (1 - p)); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(0, cyy, def.rx * (0.5 + e * 1.3), def.ry * (0.4 + e * 0.9), 0, 0, TAU); ctx.stroke(); }
  if (p < 0.5) { softGlow(ctx, 0, cyy, def.rx * (1 + p * 2), ec, 0.5 * (1 - p * 2)); }
  star4(ctx, 0, def.top - 2 - e * 8, 3 * (1 - p), p * 6); ctx.fillStyle = rgba(PAL.bone, fade); ctx.fill();
  ctx.restore();
}

// ================================================================================================ portrait
const CUT = 6;
export function drawEnemyPortrait(ctx, enemyId, x, y, w, h, o) {
  o = o || NO;
  const def = defOf(enemyId);
  x = fin(x); y = fin(y); w = fin(w, 64); h = fin(h, 64);
  if (w <= 2 || h <= 2) return;
  const t = fin(o.t, 0), fc = def.boss ? eyeColor(def, o.phase | 0) : ENEMY_COLOR[def.fac];
  const k = Math.min(CUT, w / 4, h / 4);
  const body = (c) => { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + w - k, y); c.lineTo(x + w, y + k); c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x + k, y + h); c.lineTo(x, y + h - k); c.lineTo(x, y + k); c.closePath(); };
  ctx.save();
  body(ctx); ctx.clip();
  ctx.fillStyle = PAL.ink2; ctx.fillRect(x, y, w, h);
  const hg = ctx.createLinearGradient(x, y, x, y + h); hg.addColorStop(0, rgba(PAL.ink, 0.9)); hg.addColorStop(0.7, rgba(PAL.violet, 0.28)); hg.addColorStop(1, rgba(fc, 0.3));
  ctx.fillStyle = hg; ctx.fillRect(x, y, w, h);
  softGlow(ctx, x + w * 0.5, y + h * 0.58, Math.max(w, h) * 0.75, fc, 0.42 + 0.06 * sin(t * 2));
  // floor
  ctx.fillStyle = rgba(PAL.ink, 0.5); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.92, w * 0.42, h * 0.06, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(fc, 0.4); ctx.lineWidth = 1; ctx.stroke();
  // scale to fit
  const topU = -def.top + (def.boss ? 14 : 6) + (o.affix ? 3 : 0), wideU = def.rx * 2 + 10;
  const u = Math.min((h * 0.86) / topU, (w * 0.92) / wideU);
  drawEnemy(ctx, enemyId, x + w / 2, y + h * 0.93, u * 32, Object.assign({ noScale: true, shield: 0 }, o));
  // scanlines and vignette
  ctx.fillStyle = rgba(PAL.bone, 0.05); for (let yy = y + 1; yy < y + h; yy += 3) ctx.fillRect(x, yy, w, 1);
  const vg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, rgba(PAL.ink, 0)); vg.addColorStop(1, rgba(PAL.ink, 0.55)); ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
  ctx.restore();
  // frame
  ctx.save(); body(ctx); ctx.lineJoin = 'miter'; ctx.lineWidth = 2; ctx.strokeStyle = def.boss ? rgba(fc, 0.9) : PAL.violet; ctx.stroke();
  ctx.strokeStyle = rgba(PAL.bone, 0.08); ctx.lineWidth = 1; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.strokeStyle = rgba(PAL.cyan, 0.5); ctx.beginPath(); ctx.moveTo(x + k + 1, y + 1.5); ctx.lineTo(x + w * 0.4, y + 1.5); ctx.stroke();
  ctx.restore();
}
