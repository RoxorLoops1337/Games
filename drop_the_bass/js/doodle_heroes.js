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
  const c = pen.ctx; c.save(); c.translate(0, -80); c.scale(1.1, 1.1); c.translate(0, 80); fn(pen, st, onesie);
  if (st.ox) headOutfit(pen, st.who, st.ox, st);
  c.restore();
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
  if (st.ox) { bodyOutfit(pen, who, st, bust); return; }
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
  const sp = st.ox ? SPEC[st.ox + ':' + who] : null, A = sp ? sp.arm : null;
  const sleeve = onesie ? (roxor ? C.green : '#f1e8ff') : BLK;
  const armCol = A ? (A.col || SKIN[who]) : onesie ? (roxor ? C.green : '#f1e8ff') : SKIN[who];
  const oc = A ? (A.oc || LN.skin) : onesie ? (roxor ? LN.green : LN.lav) : LN.skin;
  const sh = [[-16, -54 + (st.slump || 0)], [16, -54 + (st.slump || 0)]];
  const micHand = st.micMouth || st.pose === 'sing' || st.pose === 'beat' ? 1 : (st.pose === 'point' ? 0 : 1);
  for (let i = 0; i < 2; i++) {
    if (only != null && i !== only) continue;
    const s = i === 0 ? -1 : 1, h = hands[i];
    limb(pen, sh[i][0], sh[i][1], h[0], h[1], armCol, 6, s * 5, oc);
    if (A) armOutfit(pen, A, sh[i], h, s);
    if (A) { if (A.cap) pf(pen, pen.blob(sh[i][0] + s * 3, sh[i][1] + 5, A.capR || 8, A.capR ? A.capR - 0.4 : 7.6, 10, 0.04), A.cap, A.capTone, A.capLine, { gap: 2.2, hi: A.capHi, lw: 1.4 }); }
    else if (!onesie && roxor) pf(pen, pen.blob(sh[i][0] + s * 3, sh[i][1] + 5, 8, 7.6, 10, 0.04), sleeve, '#26222f', LN.blk, { gap: 2.2, hi: BLK2, lw: 1.4 });
  }
  for (let i = 0; i < 2; i++) {
    if (only != null && i !== only) continue;
    const h = hands[i], hc = onesie ? (roxor ? C.green : '#fff') : SKIN[who];
    if (i === micHand) { mic(pen, h[0], h[1], st.mic, roxor ? '#43d84a' : PINKC); hand(pen, h[0], h[1], hc, 5.2, oc); }
    else if (st.point) { hand(pen, h[0], h[1], hc, 4.6, oc); pen.ln([h[0], h[1], h[0] + 14, h[1] - 3], oc, 5.6, false, 0.2); pen.ln([h[0], h[1], h[0] + 14, h[1] - 3], hc, 3.2, false, 0.2); }
    else if (h[1] < -55) (roxor ? rockHand : openHand)(pen, h[0], h[1], hc, oc);
    else hand(pen, h[0], h[1], hc, 5, oc);
    if (A && A.bands) wristBands(pen, sh[i], h, A.bands);
  }
}

// ------------------------------------------------------------------------------------------------ wardrobe: stage, beach, rocker, moon, gold
// Faces and hair never change. A wardrobe outfit swaps the legs, shoes, torso and sleeves (bodyOutfit) and adds head gear on top of the hair (headOutfit).
// Public outfit ids: 'stage', 'beach', 'rocker', 'moon', 'outfit_gold' (drawn as 'gold'). Anything else draws the classic look.
const NEWOX = ['stage', 'beach', 'rocker', 'moon', 'gold'];
const oxOf = (id) => { const v = id === 'outfit_gold' ? 'gold' : id; return NEWOX.includes(v) ? v : ''; };
const GOLD = { a: '#ffd23c', b: '#e0a800', c: '#fff0a0', d: '#a67c00' };
const SILVER = '#dfe3f0';
function bbox(p) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } return [x0, y0, x1, y1]; }
// sequins: n tiny glints scattered inside a polygon
function seq(pen, p, cols, n, r = 0.9) { const b = bbox(p); clipped(pen, p, () => { for (let i = 0; i < n; i++) pen.dot(pen.rr(b[0], b[2]), pen.rr(b[1], b[3]), r, cols[i % cols.length]); }); }
function spark(pen, x, y, r, col, w = 1.1) { pen.ln([x - r, y, x + r, y], col, w, false, 0.05); pen.ln([x, y - r, x, y + r], col, w, false, 0.05); }
function flower(pen, x, y, r, petal, centre, line) {
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - 1.57; pen.dot(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, r * 0.62, line); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - 1.57; pen.dot(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, r * 0.5, petal); }
  pen.dot(x, y, r * 0.5, centre);
}
function holo(pen, p, o = {}) { pf(pen, p, '#cdeeff', '#ff9ad2', o.line || '#7a6cc8', { gap: 2.2, ang: -0.6, hi: '#b8a6ff', ha: 0.55, a: 0.55 }); pen.hatch(p, '#7ff0e0', 3.4, 0.5, 0.35); }
function crescent(pen, x, y, r, col, line) {
  const pts = arc(x, y, r, r, 75, 285, 14).concat(arc(x + r * 0.5, y, r * 0.74, r * 0.84, 285, 75, 14));
  pf(pen, pts, col, null, line, { lw: 1.2 });
}

// ---- shoes
function shoeNew(pen, sp, s, fx, fy) {
  const S = sp.shoe, x0 = fx - 10 + (s > 0 ? 2 : -2), x1 = fx + 12 + (s > 0 ? 3 : -1);
  if (S.kind === 'sandal') {
    pf(pen, [x0 + 1, fy - 4, x1 - 2, fy - 4, x1, fy + 2, x0, fy + 2], SKIN[sp.who], SKIN2[sp.who], LN.skin, { gap: 2.2, lw: 1.1, a: 0.25 });
    pf(pen, [x0 - 1, fy + 1.5, x1 + 1, fy + 1.5, x1 + 1, fy + 4.8, x0 - 1, fy + 4.8], S.base, S.tone, S.line, { gap: 2, lw: 1.1 });
    pen.ln([fx - 3, fy - 4, fx + 3, fy + 1.5], S.line, 1.7, false, 0.1); pen.ln([fx + 3, fy - 4, fx - 3, fy + 1.5], S.line, 1.7, false, 0.1);
    pen.ln([fx - 3, fy - 4, fx + 3, fy + 1.5], S.strap, 1, false, 0.1); pen.ln([fx + 3, fy - 4, fx - 3, fy + 1.5], S.strap, 1, false, 0.1);
    return;
  }
  if (S.kind === 'boot') {
    const hh = S.shaft || 16, sh = [fx - 8.5, fy - 5 - hh, fx + 8.5, fy - 5 - hh, fx + 9.5, fy - 5, fx - 9.5, fy - 5];
    pf(pen, sh, S.base, S.tone, S.line, { gap: 2.2, hi: S.hi || '#8a849c', lw: 1.3 });
    pen.ln([fx - 8.5, fy - 2 - hh, fx + 8.5, fy - 2 - hh], S.line, 1.2, false, 0.2);
    for (let i = 0; i < Math.floor((hh - 4) / 3.4); i++) pen.ln([fx - 3.5, fy - 2 - hh + 3 + i * 3.4, fx + 3.5, fy - 2 - hh + 4 + i * 3.4], S.lace || '#fff', 1.1, false, 0.1);
    if (S.stud) { pen.dot(fx + 7, fy - 2 - hh, 1.3, SILVER); pen.dot(fx - 7, fy - 2 - hh, 1.3, SILVER); }
  }
  pf(pen, [x0, fy - 6, x1 - 1, fy - 6, x1 + 1, fy + 4, x0 - 1, fy + 4], S.base, S.tone, S.line, { gap: 2.2, hi: S.hi });
  pf(pen, [x0 - 0.5, fy + 0.5, x1 + 1, fy + 0.5, x1 + 1, fy + 4.5, x0 - 1, fy + 4.5], S.sole, null, S.line, { gap: 2, lw: 1.1 });
  if (S.glow) pen.ln([x0 + 1, fy + 5.4, x1, fy + 5.4], S.glow, 1.6, false, 0.1);
  if (S.kind !== 'boot') pen.ln([fx - 1 + s, fy - 5, fx + 5 + s, fy - 3], S.lace || '#fff', 1.3, false, 0.1);
}
function legsNew(pen, sp, st) {
  const P = sp.pants;
  for (const s of [-1, 1]) {
    const lift = st.foot && s > 0 ? -8 : 0, foot = lift ? [s * 14, -8] : [s * 10, -2];
    limb(pen, s * 7, -28, foot[0], foot[1] - 5, P.col, P.w, 0, P.oc);
    const fx = foot[0], fy = foot[1];
    if (P.stripe) pen.ln([s * 10.5, -26, fx + s * 4.5, fy - 7], P.stripe, 1.6, false, 0.3);
    if (P.rip && s < 0) {
      const mx = (s * 7 + fx) / 2, my = (-28 + fy - 5) / 2;
      pf(pen, [mx - 4, my - 3, mx + 4, my - 4, mx + 4, my + 3, mx - 4, my + 4], SKIN2[sp.who], null, '#2c3d6e', { lw: 1 });
      pen.ln([mx - 4, my - 1.5, mx + 4, my - 1.5], '#e8eefc', 1, false, 0.2); pen.ln([mx - 4, my + 1.5, mx + 4, my + 1.5], '#e8eefc', 1, false, 0.2);
    }
    shoeNew(pen, sp, s, fx, fy);
  }
}

// ---- tops
function roxorJacket(pen, sl, o) {
  const tee = [-10, -58 + sl, 10, -58 + sl, 14, -27, -14, -27];
  pf(pen, tee, o.tee, o.teeTone, o.teeLine || o.line, { gap: 2.2, lw: 1.2 });
  if (o.motif) o.motif(pen);
  for (const s of [-1, 1]) {
    const half = [s * 18, -58 + sl, s * 8.5, -58 + sl, s * 12, -27, s * 24, -27];
    pf(pen, half, o.col, o.tone, o.line, { gap: 2.2, ang: -0.5, hi: o.hi, ha: 0.45 });
    if (o.seq) seq(pen, half, o.seq, 16, 0.85);
    pf(pen, [s * 8.5, -58 + sl, s * 15, -57 + sl, s * 9, -46 + sl], o.lapel, o.lapelTone || o.tone, o.line, { gap: 1.8, lw: 1.1 });
    if (o.studs) for (let i = 0; i < 4; i++) pen.dot(s * (11 + i * 1.6), -54 + sl + i * 5, 1.15, SILVER);
  }
  pen.ln([-24, -29, -12, -29], o.line, 1.2, false, 0.2); pen.ln([24, -29, 12, -29], o.line, 1.2, false, 0.2);
}
const SPEC = {};
SPEC['stage:roxor'] = {
  who: 'roxor',
  pants: { col: '#2b2733', oc: LN.blk, w: 11.5, stripe: GOLD.a },
  shoe: { kind: 'sneaker', base: GOLD.a, tone: GOLD.c, line: GOLD.d, sole: '#fff', hi: '#fff5c4', lace: GOLD.d },
  arm: { col: '#8a4fe0', oc: '#3d1d80', cap: '#8a4fe0', capTone: '#5b2fb0', capLine: '#3d1d80', capHi: '#c9a6ff', fx: 'seq', fxCols: ['#fff', GOLD.c], bands: null },
  top(pen, st) {
    roxorJacket(pen, st.slump || 0, { col: '#8a4fe0', tone: '#5b2fb0', line: '#3d1d80', hi: '#c9a6ff', tee: '#fff', teeTone: '#e3d8fa', seq: ['#fff', GOLD.c, '#ff9ad2'], lapel: GOLD.a, lapelTone: GOLD.b,
      motif: (p) => { pf(p, star(0, -42, 7.5, 0.45), GOLD.a, GOLD.c, GOLD.d, { gap: 1.8, lw: 1.1 }); } });
    pen.ln([-22, -29, 22, -29], GOLD.a, 1.6, false, 0.2); spark(pen, -19, -50, 2.6, '#fff'); spark(pen, 17, -36, 2.2, GOLD.c);
  },
};
SPEC['stage:jasmin'] = {
  who: 'jasmin',
  pants: { col: SKIN.jasmin, oc: LN.skin, w: 8.5 },
  shoe: { kind: 'boot', base: '#c9cde0', tone: '#9fa5c4', line: '#6a6f90', sole: '#fff', hi: '#fff', lace: '#6a6f90' },
  arm: { col: null, oc: null, cap: null, bands: [GOLD.a, GOLD.c], bandW: 2.6 },
  top(pen, st) { sequinDress(pen, st, { col: '#ff4fa8', tone: '#c2247c', line: '#9a1a62', hi: '#ff9ad2', seq: ['#fff', GOLD.c, '#7ff0e0'], trim: GOLD.a }); },
};
function sequinDress(pen, st, o) {
  const sl = st.slump || 0;
  const skirt = [-12, -44, 12, -44, 17, -30, 25, -15, 17, -12.5, 9, -15, 0, -12.5, -9, -15, -17, -12.5, -25, -15, -17, -30];
  pf(pen, skirt, o.col, o.tone, o.line, { gap: 2.2, ang: 1.1, hi: o.hi, ha: 0.45 });
  seq(pen, skirt, o.seq, 26, 0.9);
  pen.ln([-25, -15, -17, -12.5, -9, -15, 0, -12.5, 9, -15, 17, -12.5, 25, -15], o.trim, 1.6, false, 0.2);
  const bod = [-14, -56 + sl, 14, -56 + sl, 12.5, -43, -12.5, -43];
  pf(pen, bod, o.col, o.tone, o.line, { gap: 2.2, hi: o.hi, ha: 0.45 }); seq(pen, bod, o.seq, 10, 0.85);
  pen.ln([-12.5, -43, 12.5, -43], o.trim, 1.8, false, 0.2);
  pf(pen, star(0, -49 + sl * 0.5, 5.2, 0.45), o.trim, GOLD.c, GOLD.d, { gap: 1.6, lw: 1 });
  spark(pen, 19, -26, 2.4, '#fff'); spark(pen, -17, -22, 2, GOLD.c);
}
SPEC['beach:roxor'] = {
  who: 'roxor',
  pants: { col: SKIN.roxor, oc: LN.skin, w: 8.8 },
  shoe: { kind: 'sandal', base: '#b9783c', tone: '#8a5326', line: '#5a3418', strap: '#ff6f61' },
  arm: { col: null, oc: null, cap: '#2fb7b0', capTone: '#1d8a86', capLine: '#146a66', capHi: '#8af0e6', capR: 9.4 },
  top(pen, st, bust) {
    const sl = st.slump || 0;
    if (!bust) for (const s of [-1, 1]) {   // board shorts
      const sh = [s * 0.5, -31, s * 16, -31, s * 17.5, -11, s * 3, -11];
      pf(pen, sh, '#ff8f3c', '#d9601a', '#a33f0a', { gap: 2.2, hi: '#ffd08a' });
      pen.ln([s * 15.5, -30, s * 17, -12], '#fff', 2, false, 0.2);
    }
    const body = [-18, -58 + sl, 18, -58 + sl, 24, -26, -24, -26];
    pf(pen, body, '#2fb7b0', '#1d8a86', '#146a66', { gap: 2.4, ang: -0.4, hi: '#8af0e6' });
    clipped(pen, body, () => {
      const fl = [[-12, -50, '#ff6f91'], [12, -44, '#ffd60a'], [-14, -36, '#fff'], [8, -33, '#ff6f91'], [-3, -42, '#ffd60a'], [18, -54, '#fff']];
      for (const [x, y, c] of fl) flower(pen, x, y + sl * 0.3, 3.8, c, c === '#ffd60a' ? '#ff8f3c' : '#ffd60a', '#146a66');
    });
    pf(pen, [-5, -58 + sl, 5, -58 + sl, 0, -46 + sl], SKIN.roxor, SKIN2.roxor, LN.skin, { gap: 2.4, lw: 1.1, a: 0.3 });   // open collar
    pf(pen, [-5, -58 + sl, -13, -56 + sl, -9, -47 + sl, 0, -46 + sl], '#1fa39d', '#146a66', '#146a66', { gap: 2, lw: 1.1 });
    pf(pen, [5, -58 + sl, 13, -56 + sl, 9, -47 + sl, 0, -46 + sl], '#1fa39d', '#146a66', '#146a66', { gap: 2, lw: 1.1 });
    pen.ln([-23, -29, 23, -29], '#146a66', 1.2, false, 0.3);
  },
};
SPEC['beach:jasmin'] = {
  who: 'jasmin',
  pants: { col: SKIN.jasmin, oc: LN.skin, w: 8.5 },
  shoe: { kind: 'sandal', base: '#ffb0d9', tone: '#ff7fbf', line: '#c42f7c', strap: '#fff' },
  arm: { col: null, oc: null, cap: null },
  top(pen, st) {
    const sl = st.slump || 0;
    pf(pen, [-13, -58 + sl, 13, -58 + sl, 13, -50 + sl, -13, -50 + sl], SKIN.jasmin, SKIN2.jasmin, LN.skin, { gap: 2.4, lw: 1.1, a: 0.2 });
    const skirt = [-12, -44, 12, -44, 16, -30, 24, -14, 12, -16, 0, -13, -12, -16, -24, -14, -16, -30];
    pf(pen, skirt, '#ffe066', '#f5b82e', '#b88a00', { gap: 2.3, ang: 1.1, hi: '#fff5b0' });
    clipped(pen, skirt, () => { for (const [x, y, c] of [[-14, -22, '#ff6f91'], [-3, -30, '#fff'], [10, -20, '#ff6f91'], [16, -33, '#fff'], [3, -17, '#7ec8ff'], [-17, -34, '#7ec8ff']]) flower(pen, x, y, 3.2, c, '#ff9226', '#b88a00'); });
    const bod = [-12.5, -52 + sl, 12.5, -52 + sl, 12, -43, -12, -43];
    pf(pen, bod, '#ffe066', '#f5b82e', '#b88a00', { gap: 2.3, hi: '#fff5b0' });
    pen.ln(arc(0, -52 + sl, 12.5, 2.2, 10, 170), '#b88a00', 1.1, false, 0.2);
    for (const sx of [-1, 1]) pen.ln([sx * 8.5, -52 + sl, sx * 7, -58 + sl], '#ffe066', 2.2, false, 0.1);
    flower(pen, 0, -47 + sl * 0.5, 3.4, '#ff6f91', '#fff', '#b88a00');
    pen.ln([-24, -15, -12, -16, 0, -13, 12, -16, 24, -14], '#b88a00', 1.1, false, 0.2);
  },
};
SPEC['rocker:roxor'] = {
  who: 'roxor',
  pants: { col: '#4a6aa8', oc: '#26365e', w: 11.5, rip: true },
  shoe: { kind: 'boot', base: '#2b2733', tone: '#46404f', line: LN.blk, sole: '#6b6578', hi: '#6b6578', lace: '#dfe3f0', stud: true, shaft: 9 },
  arm: { col: '#2b2733', oc: LN.blk, cap: '#2b2733', capTone: '#17141d', capLine: LN.blk, capHi: '#6b6578', fx: 'studs', bands: [SILVER], bandW: 3.4 },
  top(pen, st) {
    roxorJacket(pen, st.slump || 0, { col: '#2b2733', tone: '#17141d', line: LN.blk, hi: '#6b6578', tee: '#d8332f', teeTone: '#a31f20', teeLine: '#7a1416', lapel: '#3a3646', studs: true,
      motif: (p) => { p.ln([2, -52, -4, -44, 3, -43, -3, -34], '#fff', 2.4, false, 0.1); p.ln([2, -52, -4, -44, 3, -43, -3, -34], '#ffd60a', 1.2, false, 0.1); } });
    pen.ln([-22, -29, 22, -29], SILVER, 1.4, false, 0.2);
    pen.ln([18, -29, 21, -22, 17, -16], '#9fa5c4', 1.2, false, 0.1);   // wallet chain
  },
};
SPEC['rocker:jasmin'] = {
  who: 'jasmin',
  pants: { col: SKIN.jasmin, oc: LN.skin, w: 8.5 },
  shoe: { kind: 'boot', base: '#2b2733', tone: '#46404f', line: LN.blk, sole: '#6b6578', hi: '#6b6578', lace: '#ff7fbf', stud: true },
  arm: { col: null, oc: null, cap: null, fx: 'net', bands: ['#2b2733'], bandW: 3 },
  top(pen, st) {
    const sl = st.slump || 0;
    const skirt = [-12, -34, 12, -34, 24, -13, 12, -11.5, 0, -13, -12, -11.5, -24, -13];
    pf(pen, skirt, '#c4304f', '#8e1a35', '#4a0e1c', { gap: 2.4, hi: '#ff7a8f' });
    clipped(pen, skirt, () => { for (let i = -5; i <= 5; i++) { pen.ln([i * 4.6, -35, i * 7.5, -10], '#2b2733', 1.5, false, 0.1); } for (let j = 0; j < 4; j++) pen.ln([-26, -31 + j * 5.2, 26, -31 + j * 5.2], '#2b2733', 1.5, false, 0.1); pen.ln([-26, -28.4, 26, -28.4], '#ffd60a', 0.8, false, 0.1); });
    pen.ln([-12, -34, 12, -34], '#2b2733', 2.4, false, 0.1); for (let i = -2; i <= 2; i++) pen.dot(i * 5, -34, 1.1, SILVER);
    pf(pen, [-10, -41, 10, -41, 10, -33, -10, -33], SKIN.jasmin, SKIN2.jasmin, LN.skin, { gap: 2.4, lw: 1.3, a: 0.2 });
    const tee = [-15, -57 + sl, 15, -57 + sl, 12, -40, -12, -40];
    pf(pen, tee, '#2b2733', '#17141d', LN.blk, { gap: 2.2, hi: '#6b6578' });
    pf(pen, heart(0, -46.5 + sl * 0.5, 7), '#ff5fb0', '#ff9ad2', '#c42f7c', { gap: 1.6, lw: 1 });
    pen.ln([-5, -49 + sl * 0.5, 5, -44 + sl * 0.5], '#fff', 1, false, 0.1);
  },
  neck(pen, st) {   // black choker with a stud
    const sl = st.slump || 0; pen.ln([-6, -56.5 + sl, 0, -54.5 + sl, 6, -56.5 + sl], '#17141d', 3, false, 0.1); pen.dot(0, -54.6 + sl, 1.5, SILVER);
  },
};
SPEC['moon:roxor'] = {
  who: 'roxor',
  pants: { col: '#1f2670', oc: '#0d1240', w: 11.5, stripe: '#5fe8ff' },
  shoe: { kind: 'sneaker', base: '#dfe9ff', tone: '#b8a6ff', line: '#4a4a9a', sole: '#fff', hi: '#fff', glow: '#5fe8ff', lace: '#7a6cc8' },
  arm: { col: '#bfe6ff', oc: '#7a6cc8', cap: '#bfe6ff', capTone: '#ff9ad2', capLine: '#7a6cc8', capHi: '#7ff0e0', fx: 'holo', bands: ['#9dff3a', '#ff5fb0', '#5fe8ff'], bandW: 3, glow: true },
  top(pen, st) {
    const sl = st.slump || 0;
    pf(pen, [-10, -58 + sl, 10, -58 + sl, 14, -27, -14, -27], '#1a1a4a', '#0d1240', '#0d1240', { gap: 2.2, lw: 1.2, hi: '#3a3a8a' });
    crescent(pen, -1, -43, 6.4, '#fff3b0', '#e0a800', '#1a1a4a'); spark(pen, 6, -50, 2, '#5fe8ff'); spark(pen, 5, -36, 1.8, '#ff9ad2');
    for (const s of [-1, 1]) {
      const half = [s * 18, -58 + sl, s * 8.5, -58 + sl, s * 12, -27, s * 24, -27];
      holo(pen, half); pen.ln([s * 8.5, -58 + sl, s * 12, -27], '#7a6cc8', 1.3, false, 0.2); pen.ln(half, '#7a6cc8', 1.4, true, 0.4);
    }
    pen.ln([-24, -29, -12, -29], '#5fe8ff', 1.6, false, 0.2); pen.ln([24, -29, 12, -29], '#5fe8ff', 1.6, false, 0.2);
  },
};
SPEC['moon:jasmin'] = {
  who: 'jasmin',
  pants: { col: '#1f2670', oc: '#0d1240', w: 10.5, stripe: '#ff5fb0' },
  shoe: { kind: 'sneaker', base: '#dfe9ff', tone: '#ffb0d9', line: '#7a6cc8', sole: '#fff', hi: '#fff', glow: '#ff5fb0', lace: '#7a6cc8' },
  arm: { col: '#bfe6ff', oc: '#7a6cc8', cap: null, fx: 'holo', bands: ['#ff5fb0', '#9dff3a', '#5fe8ff'], bandW: 3, glow: true },
  top(pen, st) {
    const sl = st.slump || 0;
    pf(pen, [-12, -33, 12, -33, 19, -24, -19, -24], '#1f2670', '#0d1240', '#0d1240', { gap: 2.2, hi: '#3a3a8a' });
    pen.ln([-12, -31, 12, -31], '#5fe8ff', 1.5, false, 0.3);
    pf(pen, [-10, -41, 10, -41, 10, -32, -10, -32], SKIN.jasmin, SKIN2.jasmin, LN.skin, { gap: 2.4, lw: 1.3, a: 0.2 });
    pf(pen, [-14, -57 + sl, 14, -57 + sl, 11, -40, -11, -40], '#1a1a4a', '#0d1240', '#0d1240', { gap: 2.2, hi: '#3a3a8a' });
    crescent(pen, -1, -48 + sl * 0.5, 4.6, '#fff3b0', '#e0a800', '#1a1a4a');
    for (const s of [-1, 1]) { const half = [s * 16, -57 + sl, s * 5, -57 + sl, s * 7, -38, s * 14, -39]; holo(pen, half); pen.ln(half, '#7a6cc8', 1.4, true, 0.4); }
    pen.ln([-12, -40, 12, -40], '#5fe8ff', 1.2, false, 0.3);
  },
};
SPEC['gold:roxor'] = {
  who: 'roxor',
  pants: { col: '#2b2733', oc: LN.blk, w: 11.5, stripe: GOLD.a },
  shoe: { kind: 'sneaker', base: GOLD.a, tone: GOLD.c, line: GOLD.d, sole: '#fff', hi: '#fff5c4', lace: GOLD.d },
  arm: { col: GOLD.a, oc: GOLD.d, cap: GOLD.a, capTone: GOLD.b, capLine: GOLD.d, capHi: GOLD.c, fx: 'seq', fxCols: ['#fff', '#fff'], bands: [GOLD.c], bandW: 3 },
  top(pen, st) {
    roxorJacket(pen, st.slump || 0, { col: GOLD.a, tone: GOLD.b, line: GOLD.d, hi: GOLD.c, tee: '#2b2733', teeTone: '#17141d', teeLine: LN.blk, seq: ['#fff', GOLD.c, '#fff'], lapel: '#fff5c4', lapelTone: GOLD.c,
      motif: (p) => { pf(p, star(0, -42, 7.5, 0.45), '#fff', GOLD.c, GOLD.d, { gap: 1.8, lw: 1.1 }); } });
    pen.ln([-22, -29, 22, -29], '#fff', 1.4, false, 0.2); spark(pen, -19, -50, 2.8, '#fff'); spark(pen, 17, -36, 2.4, '#fff');
  },
};
SPEC['gold:jasmin'] = {
  who: 'jasmin',
  pants: { col: SKIN.jasmin, oc: LN.skin, w: 8.5 },
  shoe: { kind: 'boot', base: GOLD.a, tone: GOLD.c, line: GOLD.d, sole: '#fff', hi: '#fff5c4', lace: GOLD.d },
  arm: { col: null, oc: null, cap: null, bands: [GOLD.a, '#fff'], bandW: 2.8 },
  top(pen, st) { sequinDress(pen, st, { col: GOLD.a, tone: GOLD.b, line: GOLD.d, hi: GOLD.c, seq: ['#fff', '#fff5c4', GOLD.d], trim: '#fff' }); },
};

function bodyOutfit(pen, who, st, bust) {
  const sp = SPEC[st.ox + ':' + who];
  if (!bust) legsNew(pen, sp, st);
  sp.top(pen, st, bust);
  const slump = st.slump || 0;
  pf(pen, [-6, -60 + slump, 6, -60 + slump, 6, -54 + slump, -6, -54 + slump], SKIN[who], SKIN2[who], LN.skin, { gap: 2.4, lw: 1.2, a: 0.3 });
  if (who === 'jasmin') for (let i = 0; i < 8; i++) { const a = (20 + i * 20) * Math.PI / 180, bx = Math.cos(a) * 8, by = -57 + slump + Math.sin(a) * 6 + 1; pen.dot(bx, by, 2.1, '#8a8fa6'); pen.dot(bx, by, 1.5, '#f0f2fa'); }
  if (sp.neck) sp.neck(pen, st);
}
// extra marks along an arm path: sequin glints, studs, holo stripes, fishnet
function armOutfit(pen, A, sh, h, s) {
  const mx = (sh[0] + h[0]) / 2 + s * 5, my = (sh[1] + h[1]) / 2 + Math.abs(s * 5) * 0.4;
  const at = (f) => { const a = (1 - f) * (1 - f), b = 2 * f * (1 - f), c = f * f; return [a * sh[0] + b * mx + c * h[0], a * sh[1] + b * my + c * h[1]]; };
  if (A.fx === 'seq') for (let i = 1; i < 5; i++) { const q = at(i / 5); pen.dot(q[0] + (i % 2 ? 1 : -1), q[1], 0.85, A.fxCols[i % A.fxCols.length]); }
  else if (A.fx === 'studs') for (let i = 1; i < 4; i++) { const q = at(i / 4); pen.dot(q[0], q[1], 1.1, SILVER); }
  else if (A.fx === 'holo') { pen.ln([sh[0], sh[1], mx, my, h[0], h[1]], '#ff9ad2', 1.8, false, 0.1); for (let i = 1; i < 4; i++) { const q = at(i / 4); pen.dot(q[0], q[1], 1, '#fff'); } }
  else if (A.fx === 'net') for (let i = 1; i < 6; i++) { const q = at(i / 6.5); pen.ln([q[0] - 2.4, q[1] - 2.4, q[0] + 2.4, q[1] + 2.4], '#2b2733', 0.9, false, 0.05); pen.ln([q[0] + 2.4, q[1] - 2.4, q[0] - 2.4, q[1] + 2.4], '#2b2733', 0.9, false, 0.05); }
}
// glow sticks and bangles at the wrist, perpendicular to the forearm
function wristBands(pen, sh, h, cols) {
  const dx = sh[0] - h[0], dy = sh[1] - h[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  cols.forEach((col, i) => {
    const wx = h[0] + ux * (7 + i * 3.2), wy = h[1] + uy * (7 + i * 3.2), r = 5.2;
    pen.ln([wx - nx * r, wy - ny * r, wx + nx * r, wy + ny * r], col === SILVER ? '#8a849c' : LN.blk, 4.4, false, 0.05);
    pen.ln([wx - nx * r, wy - ny * r, wx + nx * r, wy + ny * r], col, 2.8, false, 0.05);
    pen.ln([wx - nx * 2, wy - ny * 2, wx + nx * 1, wy + ny * 1], '#fff', 0.9, false, 0.05);
  });
}

// ---- head gear (drawn over the hair, in head space, centre (0, -80))
function headOutfit(pen, who, ox, st) {
  const hx = 0, hy = -80, roxor = who === 'roxor';
  const star1 = (x, y, r, a, b, d) => pf(pen, star(x, y, r, 0.46), a, b, d, { gap: 1.6, lw: 1 });
  if (ox === 'stage') {
    if (roxor) { star1(hx - 20, hy - 12, 5.2, GOLD.a, GOLD.c, GOLD.d); spark(pen, hx + 31, hy - 26, 3.4, GOLD.a); spark(pen, hx - 30, hy - 30, 2.4, '#7ff0e0'); }
    else { star1(hx - 17, hy - 28, 6.4, GOLD.a, GOLD.c, GOLD.d); spark(pen, hx + 30, hy - 34, 3.2, GOLD.a); star1(hx - 27, hy + 20, 3, GOLD.a, GOLD.c, GOLD.d); }
  } else if (ox === 'beach') {
    if (roxor) {   // straw hat band with the spikes poking out of the open crown, and a hibiscus
      const brim = arc(hx, hy - 24, 36, 7.2, 0, 360, 24), crown = [hx - 17, hy - 25, hx + 17, hy - 25, hx + 15, hy - 36, hx - 15, hy - 36];
      pf(pen, brim, '#f3d27a', '#d9a93a', '#a67c24', { gap: 2.2, ang: 0.2, hi: '#fff0b8', lw: 1.4 });
      pf(pen, crown, '#f3d27a', '#d9a93a', '#a67c24', { gap: 2, ang: 1.2, hi: '#fff0b8', lw: 1.4 });
      pen.ln(arc(hx, hy - 36, 15, 3.2, 0, 360, 14), '#a67c24', 1.3, true, 0.1);
      pf(pen, [hx - 17, hy - 26, hx + 17, hy - 26, hx + 16.4, hy - 30, hx - 16.4, hy - 30], '#ff6f61', '#d93c3c', '#a32727', { gap: 1.8, lw: 1.1 });
      flower(pen, hx + 12, hy - 29, 5, '#ff4f6f', '#ffd60a', '#8e1a35'); pen.ln([hx + 12, hy - 29, hx + 15, hy - 33], '#ffd60a', 1.1, false, 0.1);
    } else {   // flower crown
      for (let i = 0; i < 9; i++) {
        const a = (196 + i * 18.5) * Math.PI / 180, x = hx + Math.cos(a) * 28, y = hy - 8 + Math.sin(a) * 28;
        const cols = [['#ff6f91', '#ffd60a'], ['#fff', '#ff9226'], ['#7ec8ff', '#ffd60a'], ['#ffd60a', '#ff6f91']][i % 4];
        flower(pen, x, y, 4.6, cols[0], cols[1], '#6a2a4a');
        if (i % 2) { pen.ln([x - 4, y + 3, x - 7, y + 5], '#43b94a', 2, false, 0.1); }
      }
    }
  } else if (ox === 'rocker') {
    if (roxor) { for (let i = 0; i < 3; i++) pen.dot(hx - 28, hy - 3 + i * 5, 1.3, SILVER); pen.ln(arc(hx - 27, hy + 12, 3.2, 4.6, 60, 380), '#9fa5c4', 1.3, false, 0.1); }
    else {   // black lightning clip over the pink one
      pf(pen, [hx - 22, hy - 30, hx - 12, hy - 33, hx - 10, hy - 25, hx - 20, hy - 22], '#2b2733', '#46404f', LN.blk, { gap: 1.8, lw: 1.1 });
      pen.ln([hx - 16, hy - 31, hx - 19, hy - 27, hx - 14, hy - 27, hx - 17, hy - 23], '#ffd60a', 1.5, false, 0.05);
    }
  } else if (ox === 'moon') {
    if (roxor) {   // star visor: a glassy band across the forehead
      const outer = arc(hx, hy - 9, 29, 22, 196, 344, 18), inner = arc(hx, hy - 9, 29, 17.5, 344, 196, 18);
      const band = outer.concat(inner);
      pf(pen, band, 'rgba(95,232,255,0.92)', '#7a6cc8', '#4a4a9a', { gap: 1.6, hi: '#fff', lw: 1.3, ha: 0.5 });
      star1(hx, hy - 28.5, 6.4, GOLD.a, GOLD.c, GOLD.d); spark(pen, hx + 20, hy - 34, 2.6, '#fff'); spark(pen, hx - 21, hy - 33, 2, '#ff9ad2');
    } else {   // crescent moon clip
      crescent(pen, hx - 17, hy - 30, 8.2, '#fff3b0', '#e0a800', HAIR.mid); star1(hx - 9, hy - 36, 3, '#5fe8ff', '#fff', '#4a4a9a'); spark(pen, hx + 28, hy - 14, 2.4, '#5fe8ff');
    }
  } else if (ox === 'gold') {
    if (roxor) {
      const outer = arc(hx, hy - 9, 29, 22, 196, 344, 18), inner = arc(hx, hy - 9, 29, 18.5, 344, 196, 18);
      pf(pen, outer.concat(inner), GOLD.a, GOLD.c, GOLD.d, { gap: 1.6, hi: '#fff', lw: 1.3 });
      star1(hx, hy - 29, 6.8, '#fff', GOLD.c, GOLD.d); spark(pen, hx + 22, hy - 33, 2.6, '#fff');
    } else {   // little tiara
      const ti = [hx - 15, hy - 30, hx - 11, hy - 40, hx - 6, hy - 33, hx, hy - 44, hx + 6, hy - 33, hx + 11, hy - 40, hx + 15, hy - 30];
      pf(pen, ti, GOLD.a, GOLD.c, GOLD.d, { gap: 1.8, hi: '#fff', lw: 1.2 });
      pen.dot(hx, hy - 38, 1.6, '#ff5fb0'); pen.dot(hx - 10, hy - 35, 1.1, '#7ff0e0'); pen.dot(hx + 10, hy - 35, 1.1, '#7ff0e0');
      spark(pen, hx + 26, hy - 20, 2.6, GOLD.a);
    }
  }
}

function drawFigure(pen, ctx, who, pose, onesie, v) {
  const P = POSE[pose], hands = (v && P.alt) ? P.alt : P.hands;
  const st = { who, ox: v.ox, pose, eye: P.eye, mouth: v.mouth, blink: v.blink, look: who === 'roxor' ? 0.25 : 0.1, mic: P.mic, micMouth: P.micMouth, slump: P.slump || 0, foot: P.foot && v.alt, point: P.point };
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
  const t = o.t || 0, pose = POSE[o.pose] ? o.pose : 'idle', P = POSE[pose], onesie = o.outfit === 'onesie', ox = oxOf(o.outfit), k = size / 118;
  const ph = t * P.sp, bob = Math.sin(ph) * P.bob, jump = P.jump ? Math.abs(Math.sin(ph * 0.9)) * P.jump * 1.4 : 0;
  const alt = P.alt || P.foot ? (Math.floor(t * P.sp * 0.55 + (who === 'jasmin' ? 0.5 : 0)) % 2 === 1 ? 1 : 0) : 0;
  const mouthSt = mouthAt(P, t, !!o.talk), blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  const key = ['hero', who, pose, onesie ? 'o' : (ox || 'd'), alt, mouthSt, blink ? 1 : 0].join('|');
  const e = bake(key, BOX_W, BOX_H, (pen, c) => { c.translate(0, FEET); drawFigure(pen, c, who, pose, onesie, { alt, mouth: mouthSt, blink, ox }); });
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
  const t = o.t || 0, pose = POSE[o.pose] ? o.pose : 'idle', P = POSE[pose], onesie = o.outfit === 'onesie', ox = oxOf(o.outfit), k = size / 100;
  const mouthSt = mouthAt(P, t, !!o.talk), blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  const key = ['bust', who, pose, onesie ? 'o' : (ox || 'd'), mouthSt, blink ? 1 : 0].join('|');
  const e = bake(key, 112, 100, (pen, c) => {
    c.save(); c.beginPath(); c.rect(-56, -50, 112, 100); c.clip();
    c.translate(0, 64); c.scale(0.76, 0.76);
    const st = { who, ox, pose, eye: P.eye, mouth: mouthSt, blink, look: who === 'roxor' ? 0.25 : 0.1, mic: P.mic, slump: P.slump || 0 };
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
