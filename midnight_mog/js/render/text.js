// Midnight Mog canvas text: palette font stacks, ink outline, neon glow, wrapping, fitting, number formatting.
// Pure canvas 2D, no DOM access at import time. Safe in node with the recording mock context.
//
// drawText(ctx, str, x, y, o)  o = {size=16, weight=700, kind='body'|'display'|'mono', color=bone, align='left',
//     baseline='alphabetic', stroke=true|px|false (ink outline, default on), strokeColor=ink, glow=0|px (neon bloom radius),
//     glowColor=color, maxWidth (squeezes horizontally, never overflows), upper (default true for display), track (em, display 0.06),
//     alpha=1, gradient=[topHex,bottomHex], scale=1, rotate=0 (radians around x,y), shadow=false|px (hard drop shadow)}
//   Returns the drawn width in px (0 for empty).
// wrapText(ctx, str, maxWidth, o) -> string[]     greedy word wrap, honours \n, breaks over-long words by character
// fitText(ctx, str, maxWidth, o)  -> {size, text, width}   largest size <= o.size (down to o.min) that fits; ellipsis at min
// drawWrapped(ctx, str, x, y, maxWidth, lineHeight, o) -> {lines, height}
// formatNum(n, o) -> '1.2K' | '3.4M' | '5.6B' | '7.8T' | '1.23e18'   endless-game safe, never NaN
// formatTime(sec) -> '45s' | '12m 05s' | '3h 07m' | '2d 4h'      formatPct(x, digits) -> '12%'
import { PAL, font, rgba } from '../palette.js';

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ------------------------------------------------------------------------------------------------ numbers
const SUFFIX = ['', 'K', 'M', 'B', 'T'];

/**
 * Compact number for an endless game. <1000 plain (integers; o.decimals for small fractions), then K M B T with one decimal
 * below 100 (trailing .0 dropped) and none from 100 up, then scientific ("1.23e18") from 1e15. Negative keeps a minus sign.
 * NaN -> '0', +/-Infinity -> an infinity sign. Never throws.
 */
export function formatNum(n, o) {
  if (typeof n === 'bigint') n = Number(n);
  n = Number(n);
  if (Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const neg = n < 0;
  let a = Math.abs(n);
  const dec = o && o.decimals ? Math.max(0, Math.min(3, o.decimals | 0)) : 0;
  let s;
  if (a < 1000) {
    if (dec && a < 100 && a !== Math.floor(a)) s = trimZeros(a.toFixed(dec));
    else s = String(Math.round(a));
    if (s === '1000') s = '1K';
  } else if (a < 1e15) {
    let i = Math.floor(Math.log10(a) / 3);
    let v = a / Math.pow(1000, i);
    // guard float error at powers of 1000
    if (v >= 1000) { v /= 1000; i++; }
    let t = v < 100 ? trimZeros(v.toFixed(1)) : String(Math.round(v));
    if (parseFloat(t) >= 1000 && i < 4) { i++; t = trimZeros((parseFloat(t) / 1000).toFixed(1)); }
    s = t + SUFFIX[Math.min(4, i)];
  } else {
    let e = Math.floor(Math.log10(a));
    let m = a / Math.pow(10, e);
    if (!Number.isFinite(m)) { m = a / Math.pow(10, e - 1) / 10; }
    let t = m.toFixed(2);
    if (parseFloat(t) >= 10) { e++; t = (m / 10).toFixed(2); }
    s = trimZeros(t) + 'e' + e;
  }
  return neg && s !== '0' ? '-' + s : s;
}
function trimZeros(t) { return t.indexOf('.') < 0 ? t : t.replace(/0+$/, '').replace(/\.$/, ''); }

export function formatTime(sec) {
  sec = Math.max(0, Math.floor(fin(sec)));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  if (m > 0) return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
  return s + 's';
}

export function formatPct(x, digits = 0) {
  const v = fin(x) * 100;
  return trimZeros(v.toFixed(Math.max(0, Math.min(3, digits)))) + '%';
}

// ------------------------------------------------------------------------------------------------ measuring
const widthCache = new Map();
function measure(ctx, str) {
  const key = ctx.font + '|' + str;
  let w = widthCache.get(key);
  if (w === undefined) {
    w = fin(ctx.measureText(str).width);
    if (widthCache.size > 3000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}
export function clearTextCache() { widthCache.clear(); }

// Accessibility text size (Settings). Only text of 18 px and under grows: headlines already read at a distance and their panels are tight.
let TSCALE = 1;
export function setTextScale(k) { TSCALE = k >= 1 && k <= 2 ? k : 1; }
export function getTextScale() { return TSCALE; }
const scaled = (sz) => (TSCALE === 1 || sz > 18 ? sz : sz * TSCALE);

function setFont(ctx, o, size) {
  const kind = o && o.kind ? o.kind : 'body';
  const weight = o && o.weight ? o.weight : 700;
  ctx.font = font(size, weight, kind);
}

function trackOf(o) {
  if (!o) return 0;
  if (o.track !== undefined) return fin(o.track);
  return o.kind === 'display' ? 0.06 : 0;
}

/** Width of a string under the options (accounts for tracking and uppercase). */
export function textWidth(ctx, str, o) {
  o = o || {};
  const size = scaled(fin(o.size, 16));
  str = prep(str, o);
  ctx.save();
  setFont(ctx, o, size);
  const w = measure(ctx, str) + trackOf(o) * size * Math.max(0, str.length - 1);
  ctx.restore();
  return w;
}

function prep(str, o) {
  str = str === undefined || str === null ? '' : String(str);
  const upper = o && o.upper !== undefined ? o.upper : o && o.kind === 'display';
  return upper ? str.toUpperCase() : str;
}

// ------------------------------------------------------------------------------------------------ drawing
export function drawText(ctx, str, x, y, o) {
  o = o || {};
  str = prep(str, o);
  if (!str) return 0;
  x = fin(x); y = fin(y);
  const size = Math.max(1, scaled(fin(o.size, 16)));
  const track = trackOf(o);
  const color = o.color || PAL.bone;
  ctx.save();
  setFont(ctx, o, size);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const hasLS = 'letterSpacing' in ctx;
  let ls = 0;
  if (track > 0) { ls = track * size; if (hasLS) ctx.letterSpacing = ls + 'px'; }
  let w = measure(ctx, str) + (hasLS ? ls * str.length : 0);
  const sc = fin(o.scale, 1);
  const sq = o.maxWidth > 0 && w > o.maxWidth ? o.maxWidth / w : 1;
  if (o.alpha !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, fin(o.alpha, 1))) * ctx.globalAlpha;
  const rot = fin(o.rotate, 0);
  if (rot !== 0 || sc !== 1 || sq !== 1) {
    ctx.translate(x, y);
    if (rot !== 0) ctx.rotate(rot);
    ctx.scale(sc * sq, sc);
    x = 0; y = 0;
  }
  // letter spacing shifts centred text by half a gap; compensate so centred text stays centred
  if (hasLS && ls > 0) { if (ctx.textAlign === 'center') x += ls / 2; else if (ctx.textAlign === 'right' || ctx.textAlign === 'end') x += ls; }
  if (o.shadow) {
    const d = o.shadow === true ? Math.max(1, size * 0.1) : fin(o.shadow, 1);
    ctx.fillStyle = rgba(PAL.void, 0.7);
    ctx.fillText(str, x + d, y + d);
  }
  if (o.glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = o.glowColor || color;
    ctx.shadowBlur = o.glow;
    ctx.fillStyle = rgba(o.glowColor || color, 0.55);
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  if (o.stroke !== false) {
    const sw = typeof o.stroke === 'number' ? o.stroke : o.kind === 'display' ? Math.max(3, size * 0.16) : Math.max(2, size * 0.14);
    ctx.lineWidth = sw;
    ctx.strokeStyle = o.strokeColor || PAL.ink;
    ctx.strokeText(str, x, y);
  }
  if (o.gradient && o.gradient.length >= 2) {
    const g = ctx.createLinearGradient(0, y - size, 0, y + size * 0.2);
    g.addColorStop(0, o.gradient[0]);
    g.addColorStop(1, o.gradient[1]);
    ctx.fillStyle = g;
  } else ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
  return w * sq * sc;
}

// ------------------------------------------------------------------------------------------------ wrapping and fitting
export function wrapText(ctx, str, maxWidth, o) {
  o = o || {};
  str = str === undefined || str === null ? '' : String(str);
  maxWidth = Math.max(1, fin(maxWidth, 100));
  ctx.save();
  setFont(ctx, o, scaled(fin(o.size, 14)));
  const out = [];
  const paras = str.split('\n');
  for (let p = 0; p < paras.length; p++) {
    const words = paras[p].split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let i = 0; i < words.length; i++) {
      let w = words[i];
      const test = line ? line + ' ' + w : w;
      if (measure(ctx, test) <= maxWidth) { line = test; continue; }
      if (line) { out.push(line); line = ''; }
      // word alone too wide: break by characters
      while (measure(ctx, w) > maxWidth && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && measure(ctx, w.slice(0, k)) > maxWidth) k--;
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      line = w;
    }
    if (line) out.push(line);
  }
  ctx.restore();
  return out;
}

export function fitText(ctx, str, maxWidth, o) {
  o = o || {};
  str = prep(str, o);
  const max = Math.max(1, fin(o.size, 16));
  const min = Math.max(1, Math.min(max, fin(o.min, Math.max(8, max * 0.55))));
  maxWidth = Math.max(1, fin(maxWidth, 100));
  const tr = trackOf(o);
  ctx.save();
  let size = max, w = 0;
  for (; size >= min; size -= 1) {
    setFont(ctx, o, scaled(size));
    w = measure(ctx, str) + tr * scaled(size) * Math.max(0, str.length - 1);
    if (w <= maxWidth) { ctx.restore(); return { size, text: str, width: w }; }
  }
  size = min;
  setFont(ctx, o, scaled(size));
  let t = str;
  while (t.length > 1) {
    t = t.slice(0, -1);
    w = measure(ctx, t + '…') + tr * scaled(size) * t.length;
    if (w <= maxWidth) break;
  }
  ctx.restore();
  return { size, text: t + '…', width: w };
}

export function drawWrapped(ctx, str, x, y, maxWidth, lineHeight, o) {
  o = o || {};
  const lines = wrapText(ctx, str, maxWidth, o);
  const lh = fin(lineHeight, fin(o.size, 14) * 1.25);
  const max = o.maxLines > 0 ? Math.min(lines.length, o.maxLines) : lines.length;
  for (let i = 0; i < max; i++) {
    let s = lines[i];
    if (i === max - 1 && max < lines.length) s = s.replace(/\s*\S?$/, '') + '…';
    drawText(ctx, s, x, y + i * lh, o);
  }
  return { lines: max, height: max * lh };
}
