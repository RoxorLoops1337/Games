// doodle_heroes.js: the DOODLE version of RoxorLoops, Jasmin, Loopy and the logo: a child's crayon portrait of the duo on notebook paper.
// Same API as art_heroes.js: drawHero (feet centre), drawBust (centre of the bust box), drawLoopy (centre), drawLogo (centre), setArtScale.
// Every pose is baked once into 3 "boil" frames (doodle_kit style) and replayed, so a hero costs a drawImage per frame. Bobbing, jumping, squash and
// sway are applied on top. Pose variants (arms up or down, mouth open or shut, blink) are separate baked sprites, chosen from the time `t`.
import { Pen, C, clamp, arc, rect, star, heart, makeCanvas, getScale, setScale, BOIL_FPS } from './doodle_kit.js';

const TAU = Math.PI * 2;
const INK = C.ink;
export function setArtScale(n) { setScale(n); cache.clear(); }
export { makeCanvas };

// ------------------------------------------------------------------------------------------------ baking (own small LRU)
const cache = new Map();
const MAX_SPRITES = 70;
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
// draw(pen, ctx) paints in a w x h box centred on (0, 0)
function bake(key, w, h, draw) {
  const sc = getScale(), k = key + '|' + sc;
  let e = cache.get(k);
  if (e) { cache.delete(k); cache.set(k, e); return e; }
  e = { w, h, key, draw, frames: [], direct: false };
  for (let f = 0; f < 3; f++) {
    const cv = makeCanvas(w * sc, h * sc), c = cv && cv.getContext && cv.getContext('2d');
    if (!c) { e.direct = true; e.frames.length = 0; break; }
    c.scale(sc, sc); c.translate(w / 2, h / 2);
    draw(new Pen(c, hashStr(key) + f * 977, 1), c);
    e.frames.push(cv);
  }
  cache.set(k, e);
  if (cache.size > MAX_SPRITES) cache.delete(cache.keys().next().value);
  return e;
}
function put(ctx, e, x, y, t, phase = 0, s = 1) {
  if (e.direct) { ctx.save(); ctx.translate(x, y); if (s !== 1) ctx.scale(s, s); e.draw(new Pen(ctx, hashStr(e.key), 1), ctx); ctx.restore(); return; }
  const f = Math.abs(Math.floor((t + phase) * BOIL_FPS)) % e.frames.length;
  ctx.drawImage(e.frames[f], x - e.w * s / 2, y - e.h * s / 2, e.w * s, e.h * s);
}
const eyeBlink = (t, seed) => { const c = (t + seed * 1.7) % 3.6; return c > 3.46; };

// ------------------------------------------------------------------------------------------------ poses
// hands in figure space (feet at 0,0, head centre about (0,-80)). h: [left, right] hands, alt: second variant. mic: angle. eye, mouth: closed | open | alt (toggles) | o | sad
const POSE = {
  idle:  { sp: 2.2, bob: 1.6, hands: [[-25, -30], [26, -32]], mic: -0.5, eye: 'open', mouth: 'closed' },
  cheer: { sp: 5, bob: 2.4, jump: 5, hands: [[-36, -104], [37, -106]], alt: [[-32, -94], [33, -97]], mic: -0.15, eye: 'happy', mouth: 'open' },
  sing:  { sp: 2.4, bob: 1.4, hands: [[-28, -42], [25, -40]], alt: [[-31, -46], [24, -43]], mic: -2.15, eye: 'happy', mouth: 'alt', micMouth: true, tilt: -0.05 },
  beat:  { sp: 8, bob: 3, hands: [[-26, -62], [25, -40]], alt: [[-24, -50], [24, -43]], mic: -2.15, eye: 'happy', mouth: 'alt', micMouth: true, foot: true },
  sad:   { sp: 1.2, bob: 0.8, hands: [[-15, -26], [15, -38]], mic: 1.5, eye: 'sad', mouth: 'sad', tilt: 0.09, slump: 5 },
  shock: { sp: 14, bob: 1.2, jump: 2.5, hands: [[-44, -74], [44, -74]], mic: -0.4, eye: 'wide', mouth: 'o', tilt: -0.03 },
  talk:  { sp: 2.4, bob: 1.4, hands: [[-23, -30], [38, -62]], alt: [[-23, -30], [41, -74]], mic: -0.7, eye: 'open', mouth: 'alt', talkOnly: true, tilt: 0.03 },
  point: { sp: 2.4, bob: 1.6, hands: [[-23, -30], [55, -68]], mic: 0.3, eye: 'open', mouth: 'closed', point: true, tilt: -0.04 },
  hype:  { sp: 6, bob: 2.6, jump: 4, hands: [[-31, -98], [31, -98]], alt: [[-28, -84], [28, -84]], mic: -0.3, eye: 'happy', mouth: 'open' },
};

// ------------------------------------------------------------------------------------------------ the figures
// Look (from the crayon duo reference): Roxor has an auburn mohawk, shaved tan sides, a long mullet, big blue eyes, a black tee with a yellow smiley,
// black cargo pants and chunky black sneakers. Jasmin has long wavy auburn hair in a high ponytail with a pink scrunchie and clip, big brown eyes
// (a wink when happy), hoop earring, bead necklace, pink crop top, pink baggy cargo pants and white-pink sneakers. Both hold black mics (green / pink band).
// Drawing style: fine coloured-pencil contours (about 1.5 px) in a darker tint of each fill, soft layered hatching, many thin hair strands.
// Eyes, mouth and lashes keep one thin dark line. Small sizes stay readable through colour contrast, not line weight.
const HAIR = { dark: '#5c1810', mid: '#8e2a16', lite: '#d4601f', hi: '#f2a04a' };
const SKIN = { roxor: '#f8c8a2', jasmin: '#fdd8b8' };
const SKIN2 = { roxor: '#eaa57c', jasmin: '#f2bd98' };
const BLK = '#3b3746', BLK2 = '#6b6578';
const PINKC = '#ff7fbf', PINK2 = '#ffb0d9', PINKD = '#d93c8a';
const BLUSH = '#ff8a9a';
// contour tints (darker version of the fill) and fine-line colours
const LN = { skin: '#b5654a', hair: '#4a160f', blk: '#16131d', pink: '#c42f7c', green: '#2b7a33', lav: '#8c7cc6', white: '#a8a0c0', eye: '#2a1620', mouth: '#7a2230', gold: '#b88a00' };
const W_OUT = 1.6, W_FINE = 1.2;
function solid(pen, p, col) { const c = pen.ctx; c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.fillStyle = col; c.fill(); }
// pencil fill: a solid base, a darker hatch tone, a lighter cross hatch, then a thin contour in a tint
function pf(pen, p, base, tone, line, o = {}) {
  solid(pen, p, base);
  const gap = o.gap || 2.4, ang = o.ang !== undefined ? o.ang : -0.7 + pen.rr(-0.2, 0.2);
  if (tone) pen.hatch(p, tone, gap, ang, o.a || 0.4);
  if (o.hi) pen.hatch(p, o.hi, gap * 1.8, ang + 1.25, o.ha || 0.35);
  if (line) pen.ln(p, line, o.lw || W_OUT, true, o.j || 0.6);
}
function el(c, x, y, rx, ry, col, a = 1) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = col; c.globalAlpha = a; c.fill(); c.globalAlpha = 1; }
function limb(pen, x0, y0, x1, y1, col, w, bend = 0, oc = LN.blk) {
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2 + Math.abs(bend) * 0.4;
  const p = [x0, y0, mx, my, x1, y1];
  pen.ln(p, oc, w + 2.8, false, 0.4); pen.ln(p, col, w, false, 0.3);
}
function hand(pen, x, y, skin, r = 5.2, oc = LN.skin) { pen.dot(x, y, r + 1, oc); pen.dot(x, y, r, skin); pen.ln([x - 1, y + 1, x + 2, y + 2], oc, 0.9, false, 0.1); }
// Roxor's signature rock-on sign: index and pinky up, thumb out, two curled knuckles
function rockHand(pen, x, y, skin, oc = LN.skin) {
  const F = [[[x - 2, y - 3, x - 5, y - 14], 3.6], [[x + 3, y - 3, x + 6, y - 12], 3.3], [[x - 5, y + 1, x - 10, y - 2], 3.2]];
  for (const [p, w] of F) pen.ln(p, oc, w + 1.8, false, 0.15);
  pen.dot(x, y, 6.6, oc);
  for (const [p, w] of F) pen.ln(p, skin, w, false, 0.15);
  pen.dot(x, y, 5.4, skin);
  pen.ln([x - 1, y + 1, x + 4, y + 2], oc, 1, false, 0.1); pen.ln([x + 1, y + 4, x + 5, y + 4], oc, 1, false, 0.1);
}
// Jasmin's open waving hand (fingers fanned)
function openHand(pen, x, y, skin, oc = LN.skin) {
  const f = [[-6, -9], [-2, -12], [3, -12], [7, -8]];
  for (const [dx, dy] of f) pen.ln([x + dx * 0.4, y - 2, x + dx, y + dy], oc, 4.4, false, 0.15);
  pen.dot(x, y, 6.6, oc);
  for (const [dx, dy] of f) pen.ln([x + dx * 0.4, y - 2, x + dx, y + dy], skin, 2.6, false, 0.15);
  pen.dot(x, y, 5.4, skin);
}
function mic(pen, hx, hy, ang, band) {
  const ca = Math.cos(ang), sa = Math.sin(ang), ex = hx + ca * 17, ey = hy + sa * 17;
  pen.ln([hx, hy, ex, ey], LN.blk, 8.6, false, 0.3); pen.ln([hx, hy, ex, ey], '#4a4456', 5.4, false, 0.3);
  pen.ln([hx + ca * 8, hy + sa * 8, hx + ca * 12.5, hy + sa * 12.5], band, 6, false, 0.2);
  const hx2 = ex + ca * 6.5, hy2 = ey + sa * 6.5;
  pf(pen, pen.blob(hx2, hy2, 7.4, 7.4, 10, 0.04), '#8e8aa4', '#5f5a74', LN.blk, { gap: 2.2, hi: '#cfcde0', lw: 1.4 });
  pen.ln([hx2 - 3, hy2 - 3, hx2 + 1, hy2 - 4], '#fff', 1.6, false, 0.1);
}
function lashes(pen, x, y, r, sx) {
  pen.ln([x + sx * r * 0.85, y - r * 0.55, x + sx * (r + 4.5), y - r * 0.95], LN.eye, 1.5, false, 0.1);
  pen.ln([x + sx * (r + 0.4), y - r * 0.1, x + sx * (r + 5), y - r * 0.28], LN.eye, 1.4, false, 0.1);
}
// a big glossy anime eye: white, deep iris with a lighter lower rim, dark pupil, two sparkles, a bold upper lash line
function eyeBall(pen, x, y, r, iris, look, lash, sx) {
  const c = pen.ctx, rx = r * 0.92, ry = r * 1.1;
  el(c, x, y, rx + 0.7, ry + 0.7, '#8a5a56'); el(c, x, y, rx, ry, '#fff');
  const ix = x + Math.cos(look) * r * 0.14, iy = y + Math.sin(look) * r * 0.1 + r * 0.06;
  el(c, ix, iy, r * 0.8, r * 0.98, iris[1]);
  el(c, ix, iy + r * 0.3, r * 0.6, r * 0.6, iris[0], 0.95);
  el(c, ix, iy - r * 0.02, r * 0.36, r * 0.46, '#170d1c');
  el(c, ix - r * 0.3, iy - r * 0.38, r * 0.27, r * 0.27, '#fff');
  el(c, ix + r * 0.3, iy + r * 0.34, r * 0.12, r * 0.12, '#fff');
  el(c, ix + r * 0.05, iy + r * 0.52, r * 0.07, r * 0.07, '#fff', 0.8);
  pen.ln(arc(x, y + 0.5, rx + 0.5, ry + 0.4, 192, 348), LN.eye, 2.3, false, 0.12);
  if (lash) lashes(pen, x, y, r, sx);
}
function eyes(pen, who, st, hx, hy, spread, r) {
  const rox = who === 'roxor', iris = rox ? ['#5aa0ff', '#1c4aa6'] : ['#c27a3c', '#5a2a10'], lash = !rox;
  for (const sx of [-1, 1]) {
    const x = hx + sx * spread, y = hy;
    if (st.blink) { pen.ln(arc(x, y - 1, r * 0.9, r * 0.45, 20, 160), LN.eye, 1.8, false, 0.2); if (lash) lashes(pen, x, y + 1, r * 0.8, sx); continue; }
    const happy = st.eye === 'happy';
    if (happy && lash && sx > 0) { pen.ln(arc(x, y + 2, r, r * 0.8, 200, 340), LN.eye, 2.2, false, 0.2); lashes(pen, x, y + 1, r, sx); continue; }   // the wink
    if (st.eye === 'wide') { eyeBall(pen, x, y, r * 1.2, iris, -1.57, lash, sx); continue; }
    eyeBall(pen, x, y, r, iris, happy ? -0.45 : st.look, lash, sx);
    if (st.eye === 'sad') { pen.ln([x - sx * r * 1.2, y - r * 1.5 - 1, x + sx * r * 1.1, y - r * 1.1 + 4], LN.hair, 1.6, false, 0.2); pen.shp(pen.blob(x + sx * r * 0.7, y + r * 1.9, 2, 3.2, 8, 0.05), C.cyan, '#2a8fb0', 1.1, { gap: 1.6 }); }
  }
}
function mouth(pen, who, st, cx, cy) {
  const m = st.mouth, c = pen.ctx;
  if (m === 'open') {   // a sweet open smile: D shape, pink tongue, tiny teeth
    const p = [cx - 8, cy - 4, cx + 8, cy - 4, cx + 6.8, cy + 3, cx + 3, cy + 8, cx - 3, cy + 8, cx - 6.8, cy + 3];
    solid(pen, p, '#c9304a'); pen.hatch(p, '#e2506a', 1.8, -0.5, 0.5);
    pen.dot(cx, cy + 6, 3.6, '#ff93ae');
    pen.ln([cx - 6.4, cy - 3, cx + 6.4, cy - 3], '#fff', 2.2, false, 0.15);
    pen.ln(p, LN.mouth, 1.4, true, 0.3);
  } else if (m === 'o') { el(c, cx, cy + 2, 4.8, 5.6, LN.mouth); el(c, cx, cy + 3.4, 3, 3.4, '#e0506a'); }
  else if (m === 'sad') pen.ln(arc(cx, cy + 8, 6.5, 4.5, 215, 325), LN.mouth, 1.7, false, 0.2);
  else if (who === 'roxor') {   // a cheeky grin
    pen.ln(arc(cx + 1, cy - 3, 8, 5.2, 18, 162), LN.mouth, 1.8, false, 0.25);
    pen.ln([cx - 4.5, cy + 1.2, cx + 5.5, cy + 1.2], '#fff', 1.8, false, 0.15);
  } else pen.ln(arc(cx, cy - 2, 7.4, 5, 22, 158), LN.mouth, 1.8, false, 0.25);
}
function blush(pen, hx, hy, y, spread, big) {
  for (const sx of [-1, 1]) { const b = pen.blob(hx + sx * spread, hy + y, big, big * 0.6, 10, 0.06); solid(pen, b, 'rgba(255,128,150,0.28)'); pen.hatch(b, BLUSH, 1.8, -0.5, 0.35); }
}
// thin strands: n curved pencil lines fanned between two edge points
function fan(pen, x0, y0, x1, y1, n, cols, w, curve, spread) {
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0.5, o = (f - 0.5) * spread, j = (pen.rnd() - 0.5) * 2;
    const ax = x0 + o + j, ay = y0 + j, bx = x1 + o * 0.6 + (pen.rnd() - 0.5) * 3, by = y1 + (pen.rnd() - 0.5) * 3;
    pen.ln([ax, ay, (ax + bx) / 2 + curve + (f - 0.5) * 4, (ay + by) / 2, bx, by], cols[i % cols.length], w, false, 0.25);
  }
}
function clipped(pen, p, fn) { const c = pen.ctx; c.save(); c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.clip(); fn(); c.restore(); }
function polyAt(hx, hy, a, ky = 1) { const o = []; for (let i = 0; i < a.length; i += 2) o.push(hx + a[i], hy + a[i + 1] * ky); return o; }
// head wrapper: a rounder, bigger chibi head (drawn at 1.1x around the head centre)
function bigHead(pen, fn, st, onesie) {
  const c = pen.ctx; c.save(); c.translate(0, -80); c.scale(1.1, 1.1); c.translate(0, 80); fn(pen, st, onesie); c.restore();
}

function headRoxor(pen, st, onesie) {
  const hx = 0, hy = -80, H = HAIR, sad = st.eye === 'sad';
  if (onesie) {   // monster hood: green fur with cream horns
    pf(pen, pen.spiky(35, 34, 11, 0.1, hx, hy + 1), C.green, '#2f9a38', LN.green, { gap: 2.6, hi: C.lime });
    for (const sx of [-1, 1]) pf(pen, [hx + sx * 15, hy - 28, hx + sx * 22, hy - 52, hx + sx * 30, hy - 26], '#f6e7c4', '#e1c889', '#b89a58', { gap: 2.2 });
  } else {   // the long mullet tail behind the head
    const tail = [hx - 18, hy - 8, hx - 34, hy - 6, hx - 40, hy + 6, hx - 48, hy + 22, hx - 40, hy + 20, hx - 43, hy + 36, hx - 33, hy + 28, hx - 31, hy + 42, hx - 21, hy + 28, hx - 12, hy + 18];
    pf(pen, tail, H.mid, H.dark, LN.hair, { gap: 2.2, ang: 1.2, hi: H.lite });
    clipped(pen, tail, () => fan(pen, hx - 24, hy - 6, hx - 38, hy + 36, 9, [H.lite, H.hi, H.dark, H.lite], 1, -2, 14));
  }
  { const f = pen.blob(hx, hy, 27, 26, 18, 0.02); pf(pen, f, SKIN.roxor, SKIN2.roxor, LN.skin, { gap: 2.6, a: 0.3, ang: -0.9, lw: 1.5 }); }
  pen.dot(hx - 27, hy + 2, 5.6, LN.skin); pen.dot(hx - 27, hy + 2, 4.5, SKIN.roxor); pen.ln([hx - 28, hy, hx - 26, hy + 4], '#d98a6a', 1.1, false, 0.1);   // ear
  if (!onesie) {
    // shaved tan side
    const side = [hx - 26, hy - 3, hx - 27, hy - 16, hx - 20, hy - 27, hx - 12, hy - 22, hx - 14, hy - 10, hx - 20, hy - 3];
    solid(pen, side, '#d2a37a'); pen.hatch(side, '#a67a54', 1.8, 1.1, 0.7);
    // swept up mohawk spikes leaning forward
    const crest = [-17, -12, -27, -30, -19, -28, -21, -44, -11, -36, -10, -54, -2, -40, 6, -58, 11, -42, 21, -56, 21, -36, 35, -46, 31, -28, 42, -32, 29, -19, 22, -17, 12, -24, 2, -20, -8, -24, -14, -19];
    const cr = polyAt(hx, hy, crest);
    pf(pen, cr, H.mid, H.dark, LN.hair, { gap: 2.4, ang: -1.1, hi: H.lite, ha: 0.5 });
    // many fine strands from the hairline up to the spike tips (clipped to the crest so the silhouette stays clean)
    clipped(pen, cr, () => {
      for (let i = 0; i < 30; i++) {
        const f = i / 29, bx = -17 + f * 36 + (pen.rnd() - 0.5) * 2, by = -20 + (pen.rnd() - 0.5) * 3;
        const hgt = 30 + 24 * Math.sin(f * Math.PI) * (0.75 + 0.45 * pen.rnd()), tx = bx + (f - 0.4) * 14 + 4, ty = by - hgt;
        pen.ln([hx + bx, hy + by, hx + (bx + tx) / 2 + 3 * (pen.rnd() - 0.3), hy + (by + ty) / 2, hx + tx, hy + ty], [H.hi, H.lite, H.dark, H.lite, H.mid][i % 5], 1, false, 0.2);
      }
    });
    for (let i = 0; i < 4; i++) pen.dot(hx - 23 + pen.rnd() * 3, hy - 8 + i * 3 + pen.rnd() * 2, 0.7, '#8a6040');
  } else {   // a tuft of auburn spikes peeks out of the hood
    const tuft = polyAt(hx, hy, [-12, -20, -14, -35, -6, -27, -2, -40, 4, -28, 10, -37, 14, -22, 4, -18]);
    pf(pen, tuft, H.mid, H.dark, LN.hair, { gap: 2.2, ang: -1.1, hi: H.lite });
  }
  // face
  eyes(pen, 'roxor', st, hx + 1, hy - 3, 11.2, 8.6);
  if (!sad) { pen.ln([hx - 19, hy - 17, hx - 7, hy - 19.5], LN.hair, 1.8, false, 0.2); pen.ln([hx + 6, hy - 19.5, hx + 19, hy - 16], LN.hair, 1.8, false, 0.2); }
  pen.ln([hx + 1, hy + 6, hx + 3, hy + 8, hx + 0.5, hy + 8.6], '#c4805e', 1.2, false, 0.1);   // small neat nose
  mouth(pen, 'roxor', st, hx + 1, hy + 14);
  blush(pen, hx, hy, 9, 19, 5);
}
function headJasmin(pen, st, onesie) {
  const hx = 0, hy = -80, H = HAIR;
  const maneCols = ['#ff5fb0', '#ff9226', '#ffd60a', '#43b94a', '#2f7de1', '#7b4fd0'];
  if (!onesie) {   // long wavy hair behind and the high ponytail
    const back = [hx - 26, hy - 12, hx - 35, hy + 6, hx - 33, hy + 26, hx - 26, hy + 38, hx - 20, hy + 24, hx - 19, hy + 8, hx + 19, hy + 8, hx + 21, hy + 26, hx + 28, hy + 44, hx + 36, hy + 32, hx + 40, hy + 48, hx + 44, hy + 26, hx + 40, hy + 4, hx + 28, hy - 12];
    pf(pen, back, H.mid, H.dark, LN.hair, { gap: 2.2, ang: 1.2, hi: H.lite });
    const tailp = [hx + 6, hy - 30, hx + 14, hy - 50, hx + 28, hy - 62, hx + 46, hy - 58, hx + 56, hy - 42, hx + 58, hy - 20, hx + 52, hy, hx + 56, hy + 10, hx + 46, hy - 2, hx + 42, hy - 18, hx + 40, hy - 34, hx + 32, hy - 40, hx + 24, hy - 34, hx + 18, hy - 26];
    pf(pen, tailp, H.mid, H.dark, LN.hair, { gap: 2.2, ang: -0.6, hi: H.lite, ha: 0.5 });
    // flowing strands down the ponytail and the back hair
    clipped(pen, tailp, () => { fan(pen, hx + 18, hy - 56, hx + 54, hy + 4, 14, [H.hi, H.lite, H.dark, H.lite], 1, 7, 26); fan(pen, hx + 12, hy - 40, hx + 50, hy - 10, 6, [H.hi, H.lite, H.dark], 1, 4, 12); });
    clipped(pen, back, () => { fan(pen, hx + 26, hy + 6, hx + 32, hy + 46, 9, [H.lite, H.hi, H.dark], 1, 2, 22); fan(pen, hx - 28, hy + 2, hx - 27, hy + 38, 7, [H.lite, H.hi, H.dark], 1, -2, 14); });
  } else {   // unicorn hood with a rainbow mane down the back
    pf(pen, pen.blob(hx, hy + 1, 34, 33, 18, 0.03), '#f1e8ff', C.lav, LN.lav, { gap: 2.6, hi: '#fff', lw: 1.6 });
    for (let i = 0; i < 6; i++) pen.ln([hx + 22 + i * 1.5, hy - 24 + i * 7, hx + 40 + i * 3, hy - 14 + i * 9, hx + 36 + i * 3, hy + 4 + i * 9], maneCols[i], 3.6, false, 1);
    for (const sx of [-1, 1]) pf(pen, [hx + sx * 18, hy - 26, hx + sx * 25, hy - 46, hx + sx * 31, hy - 22], '#f1e8ff', C.pink, LN.lav, { gap: 2.2 });
  }
  { const f = pen.blob(hx, hy, 26.5, 25.5, 18, 0.02); pf(pen, f, SKIN.jasmin, SKIN2.jasmin, LN.skin, { gap: 2.6, a: 0.28, ang: -0.9, lw: 1.5 }); }
  pen.dot(hx - 26, hy + 3, 5.2, LN.skin); pen.dot(hx - 26, hy + 3, 4.2, SKIN.jasmin);
  // swept fringe over the forehead (smaller under the hood)
  const ky = onesie ? 0.8 : 1, bang = [-27, -6, -28, -24, -16, -36, 4, -39, 22, -33, 28, -16, 28, -4, 22, -14, 14, -24, 6, -20, -2, -26, -10, -20, -20, -12];
  const bg = polyAt(hx, hy, bang, ky);
  pf(pen, bg, H.mid, H.dark, LN.hair, { gap: 2.2, ang: -0.8, hi: H.lite });
  clipped(pen, bg, () => { fan(pen, hx - 8, hy - 38 * ky, hx - 24, hy - 8 * ky, 8, [H.hi, H.lite, H.dark], 1, -2, 14); fan(pen, hx + 6, hy - 38 * ky, hx + 26, hy - 6 * ky, 8, [H.hi, H.lite, H.dark], 1, 2, 14); });
  // small pink hair clip
  pf(pen, [hx - 21, hy - 29 * ky, hx - 14, hy - 33 * ky, hx - 11, hy - 26 * ky, hx - 18, hy - 22 * ky], PINKC, PINK2, LN.pink, { gap: 1.8, lw: 1.2 });
  pen.ln([hx - 18, hy - 28 * ky, hx - 15, hy - 29 * ky], '#fff', 1.2, false, 0.1);
  if (!onesie) {
    pf(pen, pen.blob(hx + 15, hy - 36, 9.5, 6.8, 10, 0.06), PINKC, PINK2, LN.pink, { gap: 1.8, hi: '#fff', lw: 1.4 });   // pink scrunchie
    pen.ln([hx + 9, hy - 37, hx + 15, hy - 33, hx + 21, hy - 38], PINKD, 1.2, false, 0.1); pen.ln([hx + 10, hy - 39, hx + 16, hy - 40], '#fff', 1.2, false, 0.2);
  } else {
    pf(pen, [hx - 6, hy - 28, hx + 4, hy - 62, hx + 12, hy - 28], '#ffd75a', '#ffb020', LN.gold, { gap: 2 });   // golden horn
    pen.ln([hx - 3, hy - 38, hx + 9, hy - 40], LN.gold, 1.3, false, 0.2); pen.ln([hx - 1, hy - 48, hx + 7, hy - 50], LN.gold, 1.3, false, 0.2);
  }
  pen.ln(arc(hx - 27, hy + 13, 5, 6.6, 0, 360), '#7f8396', 2.4, true, 0.1); pen.ln(arc(hx - 27, hy + 13, 5, 6.6, 0, 360), '#e4e7f2', 1.1, true, 0.1);   // silver hoop earring
  // face
  eyes(pen, 'jasmin', st, hx, hy - 3, 10.8, 9);
  if (st.eye !== 'sad') { pen.ln([hx - 17, hy - 17, hx - 6, hy - 19], LN.hair, 1.6, false, 0.2); pen.ln([hx + 6, hy - 19, hx + 17, hy - 17], LN.hair, 1.6, false, 0.2); }
  pen.ln([hx, hy + 6, hx + 1.8, hy + 8], '#c4805e', 1.2, false, 0.1);
  mouth(pen, 'jasmin', st, hx, hy + 14);
  blush(pen, hx, hy, 9, 17.5, 5.4);
}

function bodyParts(pen, who, onesie, st, bust) {
  const roxor = who === 'roxor';
  const slump = st.slump || 0;
  const oc = onesie ? (roxor ? LN.green : LN.lav) : (roxor ? LN.blk : LN.pink);
  if (!bust) {
    const legCol = onesie ? (roxor ? C.green : '#f1e8ff') : (roxor ? BLK : PINKC);
    for (const s of [-1, 1]) {
      const lift = st.foot && s > 0 ? -8 : 0, foot = lift ? [s * 14, -8] : [s * 10, -2];
      limb(pen, s * 7, -28, foot[0], foot[1] - 5, legCol, onesie ? 9 : 11.5, 0, oc);
      const fx = foot[0], fy = foot[1], x0 = fx - 10 + (s > 0 ? 2 : -2), x1 = fx + 12 + (s > 0 ? 3 : -1);
      if (!onesie) {
        const my = (-28 + fy - 5) / 2, mx = (s * 7 + fx) / 2 + s * 2.5;
        pf(pen, [mx - 5, my - 3, mx + 5, my - 3, mx + 5, my + 6, mx - 5, my + 6], roxor ? '#4a4558' : PINK2, roxor ? '#c77a2a' : LN.pink, { gap: 2, lw: 1.1, a: 0.3 });   // cargo pocket
        if (roxor) pen.ln([s * 12, -27, fx + s * 6, fy - 7], C.orange, 1.1, false, 0.3);   // orange stitching
        else pf(pen, pen.blob(fx, fy - 7, 8.5, 4, 8, 0.06), PINKC, PINK2, LN.pink, { gap: 2, lw: 1.2 });   // baggy cuff
      }
      const shoe = [x0, fy - 6, x1 - 1, fy - 6, x1 + 1, fy + 4, x0 - 1, fy + 4];
      pf(pen, shoe, onesie ? (roxor ? C.lime : C.pink) : (roxor ? '#3a3646' : '#fff'), onesie ? (roxor ? '#c7ff7a' : '#ff9ad2') : (roxor ? '#55506a' : PINK2), onesie ? (roxor ? LN.green : LN.pink) : (roxor ? LN.blk : '#c98fb5'), { gap: 2.2 });
      if (!onesie) {
        pf(pen, [x0 - 0.5, fy + 0.5, x1 + 1, fy + 0.5, x1 + 1, fy + 4.5, x0 - 1, fy + 4.5], roxor ? '#fff' : PINK2, null, roxor ? LN.blk : '#c98fb5', { gap: 2, lw: 1.1 });   // sole
        pen.ln([fx - 1 + s, fy - 5, fx + 5 + s, fy - 3], roxor ? '#fff' : PINKC, 1.3, false, 0.1);   // laces
      }
    }
  }
  // torso
  if (onesie) {
    pf(pen, [-17, -57 + slump, 17, -57 + slump, 19, -26, -19, -26], roxor ? C.green : '#f1e8ff', roxor ? '#2f9a38' : C.lav, oc, { gap: 2.6, hi: roxor ? C.lime : '#fff' });
    pf(pen, pen.blob(0, -41, 10, 11, 10, 0.04), roxor ? '#e8f7b0' : C.pink, roxor ? '#c9e078' : '#ff9ad2', oc, { gap: 2, lw: 1.2, a: 0.3 });
    if (roxor) for (let i = 0; i < 3; i++) pen.ln([-8 + i * 8, -34, -5 + i * 8, -30], LN.green, 1.3, false, 0.3);
  } else if (roxor) {   // oversized black tee with a yellow smiley
    pf(pen, [-18, -58 + slump, 18, -58 + slump, 24, -27, -24, -27], BLK, '#26222f', LN.blk, { gap: 2.2, ang: -0.4, hi: BLK2, ha: 0.3 });
    pen.ln([-23, -30, 23, -30], BLK2, 1.1, false, 0.4);
    pf(pen, pen.blob(0, -42, 9, 9, 14, 0.03), '#ffd60a', '#ffe65a', LN.gold, { gap: 2, lw: 1.2, a: 0.35 });
    pen.dot(-3.2, -44.5, 1.1, LN.blk); pen.dot(3.2, -44.5, 1.1, LN.blk); pen.ln(arc(0, -42, 5, 4, 25, 155), LN.blk, 1.3, false, 0.2);
  } else {   // pink crop top, bare midriff, pink cargo waist
    pf(pen, [-12, -33, 12, -33, 19, -24, -19, -24], PINKC, PINKD, LN.pink, { gap: 2.2, hi: PINK2 });   // slim waistband that flares into the baggy pants
    pen.ln([-12, -31, 12, -31], PINKD, 1.3, false, 0.3);
    pf(pen, [-10, -41, 10, -41, 10, -32, -10, -32], SKIN.jasmin, SKIN2.jasmin, LN.skin, { gap: 2.4, lw: 1.3, a: 0.2 });   // short, narrow midriff (no navel dot: it read as a belly)
    pf(pen, [-15, -57 + slump, 15, -57 + slump, 12, -40, -12, -40], PINKC, PINKD, LN.pink, { gap: 2.2, hi: PINK2 });   // crop top tapering to the waist
    pen.ln([-12, -41, -6, -39.5, 0, -41, 6, -39.5, 12, -41], PINKD, 1.1, false, 0.4);
    pen.ln([-9, -57 + slump, 0, -50 + slump, 9, -57 + slump], SKIN2.jasmin, 4, false, 0.1);
  }
  // neck, with Jasmin's bead necklace
  pf(pen, [-6, -60 + slump, 6, -60 + slump, 6, -54 + slump, -6, -54 + slump], SKIN[who], SKIN2[who], LN.skin, { gap: 2.4, lw: 1.2, a: 0.3 });
  if (!roxor) for (let i = 0; i < 8; i++) { const a = (20 + i * 20) * Math.PI / 180, bx = Math.cos(a) * 8, by = -57 + slump + Math.sin(a) * 6 + 1; pen.dot(bx, by, 2.1, '#8a8fa6'); pen.dot(bx, by, 1.5, '#f0f2fa'); }
}

function armsAndMic(pen, who, onesie, st, hands, only) {
  const roxor = who === 'roxor';
  const sleeve = onesie ? (roxor ? C.green : '#f1e8ff') : BLK;
  const armCol = onesie ? (roxor ? C.green : '#f1e8ff') : SKIN[who];
  const oc = onesie ? (roxor ? LN.green : LN.lav) : LN.skin;
  const sh = [[-16, -54 + (st.slump || 0)], [16, -54 + (st.slump || 0)]];
  const micHand = st.micMouth || st.pose === 'sing' || st.pose === 'beat' ? 1 : (st.pose === 'point' ? 0 : 1);
  for (let i = 0; i < 2; i++) {
    if (only != null && i !== only) continue;
    const s = i === 0 ? -1 : 1, h = hands[i];
    limb(pen, sh[i][0], sh[i][1], h[0], h[1], armCol, 6, s * 5, oc);
    if (!onesie && roxor) pf(pen, pen.blob(sh[i][0] + s * 3, sh[i][1] + 5, 8, 7.6, 10, 0.04), sleeve, '#26222f', LN.blk, { gap: 2.2, hi: BLK2, lw: 1.4 });
  }
  for (let i = 0; i < 2; i++) {
    if (only != null && i !== only) continue;
    const h = hands[i], hc = onesie ? (roxor ? C.green : '#fff') : SKIN[who];
    if (i === micHand) { mic(pen, h[0], h[1], st.mic, roxor ? '#43d84a' : PINKC); hand(pen, h[0], h[1], hc, 5.2, oc); }
    else if (st.point) { hand(pen, h[0], h[1], hc, 4.6, oc); pen.ln([h[0], h[1], h[0] + 14, h[1] - 3], oc, 5.6, false, 0.2); pen.ln([h[0], h[1], h[0] + 14, h[1] - 3], hc, 3.2, false, 0.2); }
    else if (h[1] < -55) (roxor ? rockHand : openHand)(pen, h[0], h[1], hc, oc);
    else hand(pen, h[0], h[1], hc, 5, oc);
  }
}

function drawFigure(pen, ctx, who, pose, onesie, v) {
  const P = POSE[pose], hands = (v && P.alt) ? P.alt : P.hands;
  const st = { pose, eye: P.eye, mouth: v.mouth, blink: v.blink, look: who === 'roxor' ? 0.25 : 0.1, mic: P.mic, micMouth: P.micMouth, slump: P.slump || 0, foot: P.foot && v.alt, point: P.point };
  ctx.save(); ctx.translate(0, P.slump ? P.slump * 0.4 : 0);
  bodyParts(pen, who, onesie, st, false);
  const hh = hands.map((h) => [h[0], h[1] + (P.slump || 0) * 0.3]);
  armsAndMic(pen, who, onesie, st, hh, P.micMouth ? 0 : null);
  ctx.save(); ctx.translate(0, P.slump || 0); ctx.rotate((P.tilt || 0) * 0.8);
  bigHead(pen, who === 'roxor' ? headRoxor : headJasmin, st, onesie);
  ctx.restore();
  if (P.micMouth) armsAndMic(pen, who, onesie, st, hh, 1);   // the singing arm and mic go in front of the face
  ctx.restore();
}

// mouth state for time t
function mouthAt(P, t, talk) {
  let m = P.mouth;
  if (talk && (m === 'closed' || m === 'alt')) m = 'alt';
  if (m === 'alt') return Math.sin(t * 15) > -0.1 ? 'open' : 'closed';
  return m;
}

// ------------------------------------------------------------------------------------------------ public: hero and bust
const BOX_W = 232, BOX_H = 204, FEET = 78;   // sprite box: feet sit FEET below the box centre
export function drawHero(ctx, who, x, y, size, o) {
  o = o || {}; who = who === 'jasmin' ? 'jasmin' : 'roxor';
  const t = o.t || 0, pose = POSE[o.pose] ? o.pose : 'idle', P = POSE[pose], onesie = o.outfit === 'onesie', k = size / 118;
  const ph = t * P.sp, bob = Math.sin(ph) * P.bob, jump = P.jump ? Math.abs(Math.sin(ph * 0.9)) * P.jump * 1.4 : 0;
  const alt = P.alt || P.foot ? (Math.floor(t * P.sp * 0.55 + (who === 'jasmin' ? 0.5 : 0)) % 2 === 1 ? 1 : 0) : 0;
  const mouthSt = mouthAt(P, t, !!o.talk), blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  const key = ['hero', who, pose, onesie ? 'o' : 'd', alt, mouthSt, blink ? 1 : 0].join('|');
  const e = bake(key, BOX_W, BOX_H, (pen, c) => { c.translate(0, FEET); drawFigure(pen, c, who, pose, onesie, { alt, mouth: mouthSt, blink }); });
  ctx.save(); ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(43,39,51,0.17)'; ctx.beginPath(); ctx.ellipse(0, 2, 26 - jump * 0.6, 5.5, 0, 0, TAU); ctx.fill();
  const sq = 1 + Math.sin(ph * 2) * 0.012 * P.bob - (jump > 0 ? jump * 0.004 : 0);
  ctx.translate(Math.sin(ph * 0.5) * (P.tilt ? 1.2 : 0.4), -jump - Math.max(0, bob) * 0.6);
  ctx.rotate((P.tilt || 0) * 0.35 + Math.sin(ph * 0.5) * 0.014 + Math.sin(t * 1.3) * 0.01);
  ctx.scale(1 / Math.sqrt(sq), sq);
  put(ctx, e, 0, -FEET, t, who === 'jasmin' ? 0.17 : 0);
  ctx.restore();
}

// head and shoulders portrait; (x, y) = centre of the bust box, size = box height
export function drawBust(ctx, who, x, y, size, o) {
  o = o || {}; who = who === 'jasmin' ? 'jasmin' : 'roxor';
  const t = o.t || 0, pose = POSE[o.pose] ? o.pose : 'idle', P = POSE[pose], onesie = o.outfit === 'onesie', k = size / 100;
  const mouthSt = mouthAt(P, t, !!o.talk), blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  const key = ['bust', who, pose, onesie ? 'o' : 'd', mouthSt, blink ? 1 : 0].join('|');
  const e = bake(key, 112, 100, (pen, c) => {
    c.save(); c.beginPath(); c.rect(-56, -50, 112, 100); c.clip();
    c.translate(0, 64); c.scale(0.76, 0.76);
    const st = { pose, eye: P.eye, mouth: mouthSt, blink, look: who === 'roxor' ? 0.25 : 0.1, mic: P.mic, slump: P.slump || 0 };
    bodyParts(pen, who, onesie, st, true);
    c.save(); c.translate(0, P.slump || 0); c.rotate((P.tilt || 0) * 0.8); bigHead(pen, who === 'roxor' ? headRoxor : headJasmin, st, onesie); c.restore();
    c.restore();
  });
  const bob = Math.sin(t * P.sp) * P.bob * 0.35;
  ctx.save(); ctx.translate(x, y + bob * k); if (o.flip) ctx.scale(-1, 1); ctx.scale(k, k);
  put(ctx, e, 0, 0, t, who === 'jasmin' ? 0.17 : 0);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ Loopy
const MOOD = { happy: '#19d3ff', excited: '#9dff3a', worried: '#ffb02e', sleepy: '#8aa0ff' };
function loopyBody(pen, mood, eyesOpen, mouthOpen) {
  const glow = MOOD[mood];
  pen.shp(rect(-42, -32, 84, 70, 14), C.purple, INK, 3.6, { gap: 5.2, f2: '#a58cf0', ang: -0.6 });
  pen.ln([-34, -26, -18, -29], '#fff', 2.4, false, 0.4);   // highlight scribble
  for (let i = 0; i < 3; i++) { const kx = -22 + i * 22; pen.dot(kx, -24, 7.6, INK); pen.dot(kx, -24, 6, '#d6d3e4'); pen.ln([kx, -24, kx + (i - 1) * 4, -29], INK, 2.2, false, 0.2); }
  // screen with a pixel-doodle face
  pen.shp(rect(-30, -13, 60, 33, 6), '#16142a', INK, 3, { gap: 3, alpha: 0.95 });
  const ex = [-12, 12], ey = 0;
  for (const x of ex) {
    if (mood === 'sleepy') pen.ln([x - 6, ey + 1, x + 6, ey + 1], glow, 3.4, false, 0.3);
    else if (!eyesOpen) pen.ln(arc(x, ey + 2, 6, 5, 200, 340), glow, 3.4, false, 0.3);
    else if (mood === 'excited') { pen.shp(star(x, ey, 7.5, 0.5), glow, null, 0, { gap: 2.4 }); }
    else { pen.dot(x, ey, mood === 'worried' ? 5.2 : 4.6, glow); pen.dot(x + 1, ey - 1, 1.5, '#fff'); }
  }
  if (mood === 'worried') { pen.ln([-19, -5, -6, -10], glow, 2.4, false, 0.3); pen.ln([6, -10, 19, -5], glow, 2.4, false, 0.3); }
  if (mouthOpen) pen.shp(pen.blob(0, 12, 5, 4, 8, 0.05), glow, null, 0, { gap: 2.6 });
  else if (mood === 'worried') pen.ln(arc(0, 16, 7, 4, 200, 340), glow, 2.6, false, 0.3);
  else if (mood === 'sleepy') pen.dot(0, 12, 2.2, glow);
  else pen.ln(arc(0, 8, 8, 5, 20, 160), glow, 2.8, false, 0.3);
  // two foot-switch feet
  for (const sx of [-1, 1]) { pen.shp(pen.blob(sx * 18, 33, 11, 6, 10, 0.06), '#c9c6d8', INK, 3, { gap: 3.4, f2: '#fff' }); pen.dot(sx * 18, 33, 4, '#8f8ba6'); }
}
export function drawLoopy(ctx, x, y, size, o) {
  o = o || {}; const t = o.t || 0, mood = MOOD[o.mood] ? o.mood : 'happy', k = size / 100;
  const hopPh = Math.abs(Math.sin(t * 7)), hop = mood === 'excited' ? hopPh * 8 : mood === 'sleepy' ? 0 : Math.sin(t * 2.4) * 1.6;
  const squash = mood === 'excited' ? 1 - 0.1 * Math.pow(1 - hopPh, 3) + 0.05 * hopPh : 1 + Math.sin(t * 2.4) * 0.015;
  const eyesOpen = !(Math.floor(t * 0.9 + 0.3) % 5 === 0 && (t * 0.9 + 0.3) % 1 < 0.14);
  const mouthOpen = !!o.talk && Math.sin(t * 13) > -0.1;
  const key = ['loopy', mood, eyesOpen ? 1 : 0, mouthOpen ? 1 : 0].join('|');
  const e = bake(key, 124, 104, (pen, c) => loopyBody(pen, mood, eyesOpen, mouthOpen));
  ctx.save(); ctx.translate(x, y - Math.max(0, hop) * k); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(43,39,51,0.17)'; ctx.beginPath(); ctx.ellipse(0, 46 + Math.max(0, hop), 40 - hop * 0.5, 5.5, 0, 0, TAU); ctx.fill();
  // cable tail: a wiggling crayon line (two cheap strokes)
  { const pts = []; let px = 42, py = 20, a = 0.1; pts.push([px, py]);
    for (let i = 0; i < 8; i++) { a += Math.sin(t * 3 - i * 0.6) * 0.22 + 0.1; px += Math.cos(a) * 5.4; py += Math.sin(a) * 5.4 + 0.5; pts.push([px, py]); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, col] of [[7.5, INK], [4.4, C.orange]]) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
    const l = pts[pts.length - 1]; ctx.fillStyle = INK; ctx.fillRect(l[0] - 1, l[1] - 4.5, 9, 9); ctx.fillStyle = '#b9b6c7'; ctx.fillRect(l[0] + 0.5, l[1] - 3, 6, 6); }
  ctx.translate(0, 38); ctx.scale(1 / Math.sqrt(squash), squash); ctx.translate(0, -38);
  put(ctx, e, 0, 0, t, 0.11);
  if (mood === 'sleepy') { const zz = (t * 0.7) % 1; ctx.globalAlpha = 1 - zz; ctx.font = '900 ' + (14 + zz * 8) + 'px "Trebuchet MS",sans-serif'; ctx.fillStyle = C.blue; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeText('z', 34 + zz * 8, -34 - zz * 22); ctx.fillText('z', 34 + zz * 8, -34 - zz * 22); ctx.globalAlpha = 1; }
  if (mood === 'excited') for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1, sx = Math.cos(a) * 50, sy = -22 + Math.sin(a) * 26; ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4); ctx.stroke(); }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the logo
const RAIN_TOP = [C.pink, C.orange, C.yellow, C.pink];
const RAIN_BOT = [C.lime, C.cyan, C.blue, C.lime];
function logoBase(pen, c, w) {
  const u = w;
  // doodled margins: notes, stars, hearts, a spiral
  const note = (nx, ny, s, col) => { pen.dot(nx, ny, 7 * s, col); pen.ln([nx + 6 * s, ny, nx + 6 * s, ny - 28 * s, nx + 18 * s, ny - 22 * s], col === C.ink ? INK : INK, 3, false, 0.5); pen.ln([nx + 6 * s, ny - 28 * s, nx + 18 * s, ny - 22 * s], col, 3, false, 0.4); };
  note(-u * 0.47, -u * 0.05, u / 500, C.pink); note(u * 0.44, u * 0.02, u / 480, C.green); note(-u * 0.30, u * 0.03, u / 700, C.blue); note(u * 0.30, -u * 0.04, u / 700, C.orange);
  pen.shp(star(-u * 0.34, -u * 0.37, u * 0.035), C.yellow, INK, 2.6, { gap: 3 }); pen.shp(star(u * 0.36, -u * 0.36, u * 0.028, 0.5, 0.3), C.cyan, INK, 2.6, { gap: 3 });
  pen.shp(heart(u * 0.47, u * 0.37, u * 0.05), C.red, INK, 2.6, { gap: 3 });
  const sp = []; for (let i = 0; i < 40; i++) { const a = i * 0.45, r = 3 + i * 1.1 * u / 500; sp.push(-u * 0.45 + Math.cos(a) * r, u * 0.36 + Math.sin(a) * r); } pen.ln(sp, C.purple, 3, false, 0.3);
  // the words
  const big = u * 0.215, ow = u * 0.016, lw = big * 0.2;
  pen.txt('DROP', 0, -u * 0.13, big, C.pink, { align: 'c', out: INK, ow, w: lw, rainbow: RAIN_TOP, rot: -0.025, ph: 0 });
  pen.txt('BASS', 0, u * 0.32, big, C.lime, { align: 'c', out: INK, ow, w: lw, rainbow: RAIN_BOT, rot: 0.02, ph: 1.4 });
  // THE on a blue felt-tip banner
  pen.shp([-u * 0.12, -u * 0.095, u * 0.12, -u * 0.115, u * 0.135, u * 0.005, -u * 0.11, u * 0.025], C.sky, INK, 3.2, { gap: 4.4, f2: '#cfeeff' });
  pen.txt('THE', 0, u * 0.0, u * 0.075, INK, { align: 'c', w: u * 0.016 });
}
export function drawLogo(ctx, x, y, w, t) {
  t = t || 0;
  const bass = (t * 2) % 1, pulse = Math.pow(Math.max(0, 1 - bass * 2.4), 2);
  const bw = Math.round(w / 8) * 8, key = 'logo|' + bw;
  const e = bake(key, Math.ceil(bw * 1.2), Math.ceil(bw * 0.82), (pen, c) => logoBase(pen, c, bw));
  ctx.save(); ctx.translate(x, y);
  // shock-wave scribbles: expanding wobbly rings (cheap live strokes)
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const kk = ((t * 0.55) + i / 3) % 1, rx = w * (0.2 + kk * 0.46), ry = w * (0.11 + kk * 0.25);
    ctx.globalAlpha = 0.8 * (1 - kk); ctx.strokeStyle = i % 2 ? C.cyan : C.pink; ctx.lineWidth = 3 + (1 - kk) * 4;
    ctx.beginPath(); for (let a = 0; a <= 36; a++) { const th = a / 36 * TAU, wob = 1 + Math.sin(th * 5 + t * 6 + i) * 0.025; ctx.lineTo(Math.cos(th) * rx * wob, Math.sin(th) * ry * wob); } ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const sc = 1 + pulse * 0.04; ctx.scale(sc, sc);
  put(ctx, e, 0, 0, t);
  // twinkling crayon sparkles
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7, sx = Math.cos(a) * w * 0.42, sy = Math.sin(a * 1.3) * w * 0.3, tw = Math.max(0, Math.sin(t * 3 + i * 1.9)), r = w * 0.016 * (0.4 + tw);
    if (tw < 0.05) continue; ctx.strokeStyle = i % 2 ? C.yellow : C.cyan; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy); ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r); ctx.stroke();
  }
  ctx.restore();
}
