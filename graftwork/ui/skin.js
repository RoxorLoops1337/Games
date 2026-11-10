// SKIN: the painted UI parts (assets/ui, loaded by ui/templates.js) drawn where the procedural chrome used to be. Every function answers false
// when its part is not there (preview off, still loading, headless, minimal graphics tier): the caller then draws its old look, in the same
// rectangle, so nothing jumps when the image arrives.
//
//   nine(ctx, id, x, y, w, h, o?)        a sliced frame (panel, modal, button, chip), BAKED once per size into a canvas at device resolution:
//                                        a frame redrawn every tick is one drawImage. Edges of a `tile` frame repeat whole (rope, rivets never
//                                        smear), a `scale: 'height'` frame is a pill whose caps follow the height. o: { tone, rim, wash, key }
//   part(ctx, id, x, y, w, h)            a single image, stretched into the rectangle
//   icon(ctx, id, x, y, size)            an icon of the manifest, centred on (x, y)
//   hpBar(ctx, x, y, w, h, pct, trail)   the glass tube: track, trail, tiled liquid, frame over it
//   gauge(ctx, x, y, h, n)               the Budget gauge frame for n sockets -> { w, cell, x0, socket } (where the code puts the pips), or null
//   hasPart(id)                          the part is decoded and may be drawn now
import { templates, drawNineSlice } from './templates.js';
import { deviceScale } from './smoothing.js';

const SKIN_PIXELS = 20e6, SKIN_ENTRIES = 300;
const C = { map: new Map(), pixels: 0, ver: -1 };

function mk(w, h) {
  let c = null;
  if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(1, 1);
  if (!c) return null;
  c.width = w; c.height = h;
  const g = c.getContext && c.getContext('2d');
  return g ? { c, g } : null;
}
const frame = (id) => { templates.ensure(); return templates.ready() ? templates.frameImg(id) : null; };
export const hasPart = (id) => !!frame(id);

// whole-pixel cuts of one axis: [source start, source length, dest start, dest length] for the leading margin, the middle (n repeats when it tiles) and
// the trailing margin. s0 / sLen: the part in image px; m0 / m1: the margins in image px; d: the dest length in px; e0 / e1: the margins in dest px.
function cuts(s0, sLen, m0, m1, d, e0, e1, tile, k) {
  const out = [];
  if (e0 + e1 > d) { const f = d / (e0 + e1); e0 = Math.round(e0 * f); e1 = d - e0; }
  if (e0 > 0 && m0 > 0) out.push([s0, m0, 0, e0]);
  const sm = sLen - m0 - m1, dm = d - e0 - e1;
  if (sm > 0 && dm > 0) {
    const n = tile ? Math.max(1, Math.round(dm / (sm * k))) : 1; // whole repeats, each a little wider or narrower than natural
    for (let i = 0; i < n; i++) { const a = Math.round((dm * i) / n), b = Math.round((dm * (i + 1)) / n); if (b > a) out.push([s0 + m0, sm, e0 + a, b - a, 1]); }
  }
  if (e1 > 0 && m1 > 0) out.push([s0 + sLen - m1, m1, d - e1, e1]);
  return out;
}
// paint a sliced frame into a canvas of pw x ph pixels (S = canvas px per logical px)
function bake(g, fr, pw, ph, S) {
  const { img, def, src } = fr, sl = def.slice;
  g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) { /* fake ctx */ }
  if (!sl) { g.drawImage(img, src.sx, src.sy, src.sw, src.sh, 0, 0, pw, ph); return; }
  const k = src.k; // image px per logical px
  let xs, ys;
  if (def.scale === 'height') { // a pill: one band top to bottom, caps as wide as the height makes them
    const sc = ph / (src.lh * S), e0 = Math.round(sl[0] * sc * S), e1 = Math.round(sl[2] * sc * S);
    xs = cuts(src.sx, src.sw, sl[0] * k, sl[2] * k, pw, e0, e1, !!def.tile, (sc * S) / k);
    ys = [[src.sy, src.sh, 0, ph]];
  } else {
    let sc = 1; const w = pw / S, h = ph / S;
    if (sl[0] + sl[2] > w) sc = Math.min(sc, w / (sl[0] + sl[2])); if (sl[1] + sl[3] > h) sc = Math.min(sc, h / (sl[1] + sl[3]));
    xs = cuts(src.sx, src.sw, sl[0] * k, sl[2] * k, pw, Math.round(sl[0] * sc * S), Math.round(sl[2] * sc * S), !!def.tile, (sc * S) / k);
    ys = cuts(src.sy, src.sh, sl[1] * k, sl[3] * k, ph, Math.round(sl[1] * sc * S), Math.round(sl[3] * sc * S), !!def.tile, (sc * S) / k);
  }
  for (const Y of ys) for (const X of xs) {
    if (def.fill === false && X[4] && Y[4]) continue; // a border-only frame has no centre
    g.drawImage(img, X[0], Y[0], X[1], Y[1], X[2], Y[2], X[3], Y[3]);
  }
}
// the same silhouette filled with one colour (a mask for tints)
function silhouette(src, col) {
  const t = mk(src.width, src.height); if (!t) return null;
  t.g.drawImage(src, 0, 0); t.g.globalCompositeOperation = 'source-in'; t.g.fillStyle = col; t.g.fillRect(0, 0, src.width, src.height);
  return t.c;
}
// o.tone: a colour whose hue the leather takes (a primary or a chosen button); o.wash: [colour, alpha, blend] laid over the part (hover, pressed, disabled
// states made from one image); o.rim: [colour, radius, inset] an outline inside the edge (the caller's state colour).
function finish(cv, g, S, o) {
  if (o.tone) { const m = silhouette(cv, o.tone); if (m) { g.globalCompositeOperation = 'color'; g.globalAlpha = 0.72; g.drawImage(m, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } }
  if (o.wash) { const m = silhouette(cv, o.wash[0]); if (m) { g.globalCompositeOperation = o.wash[2] || 'source-over'; g.globalAlpha = o.wash[1]; g.drawImage(m, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } }
  if (o.rim) {
    const [col, rad, inset] = o.rim, i = inset * S, w = cv.width - 2 * i, h = cv.height - 2 * i, r = Math.max(0, Math.min(rad * S, w / 2, h / 2));
    g.beginPath(); if (g.roundRect) g.roundRect(i, i, w, h, r); else g.rect(i, i, w, h);
    g.lineWidth = Math.max(1.5, 2 * S); g.strokeStyle = col; g.stroke();
  }
}
const bucket = (s) => (s <= 1.05 ? 1 : s <= 1.6 ? 1.5 : s <= 2.2 ? 2 : s <= 3.2 ? 3 : 4);
// Draw a sliced frame into (x, y, w, h). Baked per (part, size, device scale, variant); without a canvas (node) it is drawn directly.
export function nine(ctx, id, x, y, w, h, o) {
  const fr = frame(id); if (!fr || !(w > 0 && h > 0)) return false;
  if (C.ver !== templates.ver || C.pixels > SKIN_PIXELS || C.map.size > SKIN_ENTRIES) { C.map.clear(); C.pixels = 0; C.ver = templates.ver; }
  const ds = deviceScale(ctx), S = bucket(ds > 0 ? ds : 1);
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  const key = id + '|' + W + 'x' + H + '@' + S + (o && o.key ? '|' + o.key : '');
  let cv = C.map.get(key);
  if (cv === undefined) {
    const t = mk(Math.max(1, Math.round(W * S)), Math.max(1, Math.round(H * S)));
    if (t) { bake(t.g, fr, t.c.width, t.c.height, S); if (o) finish(t.c, t.g, S, o); cv = t.c; C.pixels += cv.width * cv.height; } else cv = null;
    C.map.set(key, cv);
  }
  if (cv) { ctx.drawImage(cv, x + (w - W) / 2, y + (h - H) / 2, W, H); return true; }
  drawNineSlice(ctx, fr, x, y, w, h); // no canvas to bake into: the plain 9-slice
  return true;
}
export function part(ctx, id, x, y, w, h) {
  const fr = frame(id); if (!fr) return false;
  ctx.drawImage(fr.img, fr.src.sx, fr.src.sy, fr.src.sw, fr.src.sh, x, y, w, h);
  return true;
}
export function icon(ctx, id, x, y, size) {
  templates.ensure();
  return templates.ready() ? templates.drawIcon(ctx, id, x - size / 2, y - size / 2, size, size) : false;
}

// The HP tube. (x, y, w, h) is the bar the procedural code draws; the caps stand a little outside it, the liquid runs between them.
export function hpBar(ctx, x, y, w, h, pct, trail) {
  const fr = frame('bar.hp.frame'), fill = frame('bar.hp.fill'); if (!fr || !fill) return false;
  const k = h / 16, over = 6 * k, x0 = x + 9 * k, x1 = x + w - 9 * k, iw = x1 - x0; // the caps stand 6 px outside the old bar, the glass starts 9 px inside it
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y, iw, h); ctx.clip();
  ctx.fillStyle = 'rgba(10,8,8,.85)'; ctx.fillRect(x0, y, iw, h);
  if (trail > pct) { ctx.fillStyle = '#f3e9d2'; ctx.fillRect(x0, y, iw * trail, h); }
  const fw = iw * pct;
  if (fw > 0) {
    ctx.beginPath(); ctx.rect(x0, y, fw, h); ctx.clip();
    const s = fill.src, tw = s.lw * k; // the strip is one half of a mirrored pair: every second tile is flipped, so it never shows a seam
    for (let i = 0, tx = x0; tx < x0 + fw; i++, tx += tw) {
      if (i & 1) { ctx.save(); ctx.translate(tx + tw, 0); ctx.scale(-1, 1); ctx.drawImage(fill.img, s.sx, s.sy, s.sw, s.sh, 0, y, tw + 0.5, h); ctx.restore(); }
      else ctx.drawImage(fill.img, s.sx, s.sy, s.sw, s.sh, tx, y, tw + 0.5, h);
    }
    if (pct < 1) { ctx.fillStyle = 'rgba(255,241,200,.7)'; ctx.fillRect(x0 + fw - 1.5, y + 1, 1.5, h - 2); }
  }
  ctx.restore();
  nine(ctx, 'bar.hp.frame', x - over, y - 4 * k, w + 2 * over, h + 8 * k);
  return true;
}
// The Budget gauge frame: left cap, n socket cells, right cap, h tall. Returns where the sockets are, or null.
export function gauge(ctx, x, y, h, n) {
  const l = frame('gauge.budget.l'), c = frame('gauge.budget.cell'), r = frame('gauge.budget.r'); if (!l || !c || !r || !(n > 0)) return null;
  const k = h / c.src.lh, lw = l.src.lw * k, cw = c.src.lw * k, rw = r.src.lw * k;
  ctx.drawImage(l.img, l.src.sx, l.src.sy, l.src.sw, l.src.sh, x, y, lw + 0.5, h);
  for (let i = 0; i < n; i++) ctx.drawImage(c.img, c.src.sx, c.src.sy, c.src.sw, c.src.sh, x + lw + i * cw, y, cw + 0.5, h);
  ctx.drawImage(r.img, r.src.sx, r.src.sy, r.src.sw, r.src.sh, x + lw + n * cw, y, rw, h);
  return { w: lw + n * cw + rw, cell: cw, x0: x + lw + cw / 2, socket: (c.def.socket || c.src.lh * 0.38) * k };
}
// how wide gauge() will be for n sockets at height h (0 when the part is not there)
export function gaugeWidth(h, n) {
  const l = frame('gauge.budget.l'), c = frame('gauge.budget.cell'), r = frame('gauge.budget.r'); if (!l || !c || !r) return 0;
  const k = h / c.src.lh; return (l.src.lw + n * c.src.lw + r.src.lw) * k;
}
