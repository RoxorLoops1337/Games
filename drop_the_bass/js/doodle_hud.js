// doodle_hud.js: the DOODLE HUD toolkit (crayon notebook style). Same exports and signatures as hud.js.
// Panels are taped paper cut-outs with wobbly crayon borders, buttons are fat crayon-filled shapes with a thick ink outline, bars are scribble-filled
// tubes, bezels are doodled rings, text is hand-written. Everything static is baked into 3 boil frames (doodle_kit sprite) and replayed, so the
// per-frame cost is a drawImage. Without document (node tests) sprites draw straight onto the given context.
import * as K from './doodle_kit.js';
import { mix, lighten, darken, rgba } from './hud.js';

export { mix, lighten, darken, rgba };
export const FONT = '"Patrick Hand", "Gochi Hand", "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif';
const INK = K.C.ink, PAPER = K.C.paper;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let T = 0;
// the HUD has no clock of its own: the battle view hands it the time before drawing so the boil frames advance
export function setHudTime(t) { T = t || 0; }
export function setHudScale(n) { K.setScale(n); }

export function rrectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); rrectPath(ctx, x, y, w, h, r); }

const isHex = (c) => typeof c === 'string' && c[0] === '#' && (c.length === 7 || c.length === 4);
const hex6 = (c) => (c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c);
const paperOf = (edge) => (isHex(edge) ? mix(hex6(edge), 0.86) : PAPER);

// ---------------------------------------------------------------------------------------------------- panel: taped paper cut-out
function bakePanel(pen, c, w, h, r, edge, taped) {
  const x = -w / 2, y = -h / 2, poly = K.rect(x, y, w, h, Math.min(r, h / 2, w / 2));
  const shadow = K.rect(x + 3, y + 5, w, h, Math.min(r, h / 2, w / 2));
  pen.hatch(shadow, '#6b6477', 6, -0.7, 0.35);
  c.beginPath(); c.moveTo(poly[0], poly[1]); for (let i = 2; i < poly.length; i += 2) c.lineTo(poly[i], poly[i + 1]); c.closePath();
  c.fillStyle = paperOf(edge); c.fill();
  pen.hatch(poly, '#ffffff', 9, -0.5, 0.28);
  if (isHex(edge)) { const inner = K.rect(x + 5, y + 5, w - 10, h - 10, Math.max(2, Math.min(r, h / 2) - 4)); pen.ln(inner, hex6(edge), 2.6, true, 0.9); }
  pen.ln(poly, INK, 4, true, 1.3);
  if (taped) {
    for (const [tx, ty, rot] of [[x + 22, y + 2, -0.5], [x + w - 22, y + 2, 0.5]]) {
      c.save(); c.translate(tx, ty); c.rotate(rot);
      c.globalAlpha = 0.82; c.fillStyle = '#ffe28a'; c.fillRect(-17, -7, 34, 14); c.globalAlpha = 1;
      pen.ln(K.rect(-17, -7, 34, 14), 'rgba(43,39,51,0.55)', 1.6, true, 0.5); c.restore();
    }
  }
}
export function glass(ctx, x, y, w, h, r = 14, o = {}) {
  const edge = o.edge || null, taped = w >= 190 && h >= 40;
  const e = K.sprite('dh:panel:' + w + 'x' + h + ':' + r + ':' + edge + ':' + taped, w + 28, h + 28, (pen, c) => bakePanel(pen, c, w, h, r, edge, taped));
  K.blit(ctx, e, x + w / 2, y + h / 2, T);
  if (o.glow) {   // a marching dashed crayon ring in the glow colour
    ctx.save(); ctx.globalAlpha = o.glowA == null ? 0.5 : clamp(o.glowA, 0, 1); ctx.setLineDash([9, 8]); ctx.lineDashOffset = -T * 22;
    rrect(ctx, x - 3, y - 3, w + 6, h + 6, r + 3); ctx.strokeStyle = o.glow; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------------- button: fat crayon fill, thick ink outline
export function button(ctx, r, color, o = {}) {
  const down = o.press > 0.2, dy = down ? 3 : 0, rad = o.radius || 14;
  const x = r.x, y = r.y + dy, w = r.w, h = r.h - dy;
  ctx.save();
  if (o.dim) ctx.globalAlpha = 0.7;
  const base = isHex(color) ? hex6(color) : '#7a5cff';
  const e = K.sprite('dh:btn:' + w + 'x' + h + ':' + base + ':' + rad + ':' + (down ? 1 : 0), w + 28, h + 30, (pen, c) => {
    const hh = h - 5, x0 = -w / 2, y0 = -hh / 2 - 2;
    if (!down) pen.hatch(K.rect(x0 + 1, y0 + 5, w, hh, rad), '#6b6477', 6, -0.7, 0.45);
    pen.shp(K.rect(x0, y0, w, hh, rad), base, INK, 4.6, { gap: 5.2, f2: lighten(base, 0.5), j: 1.1 });
    pen.ln([x0 + rad * 0.9, y0 + 7, x0 + w * 0.42, y0 + 6], 'rgba(255,255,255,0.85)', 3.2, false, 0.7);
    pen.ln([x0 + rad * 0.9, y0 + 13, x0 + w * 0.22, y0 + 12.5], 'rgba(255,255,255,0.6)', 2.4, false, 0.6);
  });
  K.blit(ctx, e, x + w / 2, y + h / 2 - 2 + 2, T);
  ctx.globalAlpha = o.dim ? 0.7 : 1;
  const cx = x + w / 2, bodyH = r.h - 5 - dy;
  if (o.glow) { ctx.save(); ctx.globalAlpha = clamp(o.glow, 0, 1) * 0.9; ctx.setLineDash([8, 7]); ctx.lineDashOffset = -T * 24; rrect(ctx, x - 3, y - 3, w + 6, bodyH + 8, rad + 3); ctx.strokeStyle = o.glowColor || '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); }
  if (o.shine != null) {   // a doodled sparkle sliding across the top
    const sx = x + 14 + (w - 28) * o.shine, st = K.star(sx, y + 12, 7, 0.4, T * 2);
    ctx.save(); ctx.beginPath(); ctx.moveTo(st[0], st[1]); for (let i = 2; i < st.length; i += 2) ctx.lineTo(st[i], st[i + 1]); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9; ctx.fill(); ctx.restore();
  }
  if (o.draw) o.draw(ctx, x, y, bodyH);
  if (o.icon && o.glyph) o.glyph(ctx, o.icon, cx, y + bodyH / 2 - (o.sub ? 8 : 0), o.sub ? 30 : 28, '#fff');
  if (o.label) text(ctx, o.label, cx, y + bodyH / 2 - (o.sub ? 7 : 0), o.size || 18, '#fff', 'center');
  if (o.sub) text(ctx, o.sub, cx, y + bodyH - 10, (o.size && o.icon) ? o.size : 12, 'rgba(255,255,255,0.95)', 'center', 800);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- bar: a scribble-filled tube
export function liquidBar(ctx, x, y, w, h, f, c0, c1, t, o = {}) {
  f = clamp(f, 0, 1);
  const PAD = 10, rad = h / 2, tt = t == null ? T : t;
  const tube = K.sprite('dh:tube:' + w + 'x' + h, w + PAD * 2, h + PAD * 2, (pen, c) => {
    const poly = K.rect(-w / 2, -h / 2, w, h, rad);
    c.beginPath(); c.moveTo(poly[0], poly[1]); for (let i = 2; i < poly.length; i += 2) c.lineTo(poly[i], poly[i + 1]); c.closePath(); c.fillStyle = '#fffdf4'; c.fill();
    pen.hatch(poly, '#dcd5c2', 8, -0.4, 0.4);
  });
  K.blit(ctx, tube, x + w / 2, y + h / 2, tt);
  const a = isHex(c0) ? hex6(c0) : '#43b94a', b = isHex(c1) ? hex6(c1) : a;
  const fill = K.sprite('dh:fill:' + w + 'x' + h + ':' + a + ':' + b, w + PAD * 2, h + PAD * 2, (pen, c) => {
    const poly = K.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, Math.max(2, rad - 2));
    pen.hatch(poly, a, 4.6, -0.6, 0.95);
    const half = K.rect(0, -h / 2 + 2, w / 2 - 2, h - 4, 2);
    pen.hatch(half, b, 5.4, 0.7, 0.85);
    pen.ln([-w / 2 + rad, -h / 2 + 5, w / 2 - rad, -h / 2 + 5], 'rgba(255,255,255,0.7)', 2.4, false, 0.6);
  });
  ctx.save(); rrect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.max(2, rad - 1.5)); ctx.clip();
  if (o.lag != null && o.lag > f) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x, y, w * clamp(o.lag, 0, 1), h); ctx.fillStyle = 'rgba(232,64,63,0.35)'; ctx.fillRect(x + w * f, y, w * (clamp(o.lag, 0, 1) - f), h); }
  const fw = f > 0.001 || o.min ? Math.max(h * 0.9, w * f) : 0;
  if (fw > 0) {
    if (fill.direct || !fill.frames.length) { ctx.fillStyle = b; ctx.fillRect(x, y, fw, h); }
    else {
      const S = K.getScale(), fr = fill.frames[Math.floor((tt + 0.17) * K.BOIL_FPS) % fill.frames.length];
      ctx.drawImage(fr, PAD * S, PAD * S, Math.min(fw, w) * S, h * S, x, y, Math.min(fw, w), h);
    }
  }
  ctx.restore();
  if (fw > 0 && f < 0.995) {   // a crayon scribble at the leading edge
    ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
    const ex = x + fw - 1; for (let i = 0; i <= 4; i++) { const yy = y + 2 + (h - 4) * i / 4, jx = Math.sin(tt * 9 + i * 2.1) * 1.4; i ? ctx.lineTo(ex + jx, yy) : ctx.moveTo(ex + jx, yy); } ctx.stroke(); ctx.restore();
  }
  if (o.ticks) { ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; for (const k of o.ticks) { ctx.beginPath(); ctx.moveTo(x + w * k, y + 1); ctx.lineTo(x + w * k, y + h - 1); ctx.stroke(); } ctx.restore(); }
  const ring = K.sprite('dh:tubering:' + w + 'x' + h, w + PAD * 2, h + PAD * 2, (pen) => pen.ln(K.rect(-w / 2, -h / 2, w, h, rad), INK, 3.8, true, 1.1));
  K.blit(ctx, ring, x + w / 2, y + h / 2, tt);
  if (o.glow && f > 0.02) { ctx.save(); ctx.globalAlpha = clamp(o.glow, 0, 1) * (0.5 + 0.4 * Math.sin(tt * 8)); ctx.setLineDash([6, 6]); ctx.lineDashOffset = -tt * 18; rrect(ctx, x - 2, y - 2, w + 4, h + 4, rad + 2); ctx.strokeStyle = b; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
}

// ---------------------------------------------------------------------------------------------------- bezel: a doodled ring for round buttons
export function bezel(ctx, cx, cy, r, color, o = {}) {
  const base = isHex(color) ? hex6(color) : '#9a9aa6';
  const e = K.sprite('dh:bezel:' + r + ':' + base, r * 2 + 28, r * 2 + 28, (pen, c) => {
    pen.hatch(K.arc(2, 5, r, r, 0, 360, 18), '#6b6477', 6, -0.7, 0.4);
    pen.shp(K.arc(0, 0, r, r, 0, 360, 22), base, INK, 4.4, { gap: 5, f2: lighten(base, 0.5) });
    c.beginPath(); c.arc(0, 0, r - 7, 0, 6.3); c.fillStyle = '#fff8e6'; c.fill();
    pen.ln(K.arc(0, 0, r - 7, r - 7, 0, 360, 18), INK, 3, true, 0.9);
    pen.ln(K.arc(0, 0, r - 2, r - 2, 200, 280, 6), 'rgba(255,255,255,0.8)', 2.6, false, 0.5);
  });
  K.blit(ctx, e, cx, cy, T);
}

// ---------------------------------------------------------------------------------------------------- text
let textBaked = 0;
const strokeOk = (s) => { for (const ch of s.toUpperCase()) if (ch !== ' ' && !K.GLYPHS[ch]) return false; return true; };
export function text(ctx, s, x, y, size, color, align = 'left', weight = 900, o) {
  s = String(s);
  if (size >= 26 && s.length <= 16 && textBaked < 140 && strokeOk(s) && isHex(color)) {
    // big words use the hand-made stroke font (baked once per string)
    const col = hex6(color), wTot = K.Pen.prototype.textWidth(s, size), pw = Math.ceil(wTot + size * 0.9), ph = Math.ceil(size * 1.9);
    const key = 'dh:txt:' + s + ':' + size + ':' + col;
    const e = K.sprite(key, pw, ph, (pen) => pen.txt(s, -wTot / 2, size * 0.5, size, col, { out: INK, ow: Math.max(5, size * 0.22), w: Math.max(2.6, size * 0.15) }));
    if (e && !e.direct) {
      textBaked++;
      const off = align === 'left' ? wTot / 2 : align === 'right' ? -wTot / 2 : 0;
      K.blit(ctx, e, x + off, y, T);
      return;
    }
  }
  ctx.save();
  ctx.font = (size >= 15 ? 'bold ' : '') + size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  // the paper panels are light: pale neutral text (white, lavender) becomes ink with a white halo so it reads on paper and on the dark board; coloured text keeps its colour with a thin ink outline
  let paleNeutral = false;
  if (isHex(color)) { const h = hex6(color).slice(1), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); paleNeutral = (r + g + b) / 3 > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 60; }
  if (paleNeutral) {
    ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = '#fffdf4'; ctx.strokeText(s, x, y + 1);
    ctx.fillStyle = INK; ctx.fillText(s, x, y);
  } else {
    ctx.lineWidth = Math.max(2.5, size * 0.14); ctx.strokeStyle = INK; ctx.strokeText(s, x, y + 1);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  ctx.restore();
}
export function wrapText(ctx, s, x, y, maxW, size, lh, color, align = 'left') {
  ctx.save(); ctx.font = size + 'px ' + FONT;
  const words = String(s).split(' '); let line = ''; const lines = [];
  for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  if (line) lines.push(line);
  ctx.restore();
  lines.slice(0, 5).forEach((l, i) => { ctx.save(); ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(l, x, y + i * lh); ctx.restore(); });
}
