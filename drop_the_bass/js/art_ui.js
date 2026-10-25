// art_ui.js: AAA icon set, gear icons, crates and rarity frames. All canvas code, no files.
// Every glyph goes through one premium pipeline: draw the flat glyph into a cached sprite, then light it (top-left key light, rim light on the lit
// edge, shaded lower edge, glossy sheen, specular dot, contact shadow). The six currency glyphs (coin, diamond, record, heart, star, fans) are redrawn
// from scratch as hero assets. Sprites are cached by name, colour and pixel size; in node (no document) everything falls back to the flat draw.
// Contract: see drop_the_bass/CLAUDE.md. Every draw function restores ctx state. No Math.random, no Date: motion comes from t.
import { RARITY, COL } from './data_core.js';
import {
  drawGlyph as flatGlyph, GLYPH_NAMES, drawGear as flatGear, drawCrate as flatCrate, setArtScale as legacyScale,
} from './legacy_entities.js';

export { GLYPH_NAMES };
const TAU = Math.PI * 2;
const OUT = '#140a2c';
let ART_SCALE = 2;
const cache = new Map();
export function setArtScale(n) { ART_SCALE = Math.max(1, Math.min(4, +n || 2)); cache.clear(); legacyScale(ART_SCALE); }
export function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = (v) => v - Math.floor(v);
const hn = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const RANK = ['common', 'rare', 'epic', 'legendary', 'mythic'];

function hexRgb(hex) {
  if (typeof hex !== 'string' || hex[0] !== '#') return [255, 255, 255];
  let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(hex, a) { const [r, g, b] = hexRgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function shade(hex, k) { // k > 0 lighten toward white, k < 0 darken toward ink
  const [r, g, b] = hexRgb(hex), to = k > 0 ? 255 : 8, f = Math.abs(k);
  return 'rgb(' + Math.round(r + (to - r) * f) + ',' + Math.round(g + (to - g) * f) + ',' + Math.round(b + (to - b) * f) + ')';
}
function rrp(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function sparkle4(c, x, y, r, col, a) {
  c.save(); const pa = c.globalAlpha; c.globalAlpha = pa * (a == null ? 1 : a); c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.22 : r; c.lineTo(x + Math.cos(an) * rad, y + Math.sin(an) * rad); }
  c.closePath(); c.fill(); c.globalAlpha = pa; c.restore();
}

// ---------------------------------------------------------------------------------------------------- premium lighting pipeline
// G is a square canvas holding a flat, centred drawing. Returns a new canvas with shadow, gloss, bevel and specular baked in.
function light(G, S, o) {
  o = o || {};
  const F = makeCanvas(S, S), B = makeCanvas(S, S), E = makeCanvas(S, S), D = makeCanvas(S, S);
  if (!F || !B || !E || !D) return G;
  const f = F.getContext('2d'), b = B.getContext('2d'), e = E.getContext('2d'), dd = D.getContext('2d');
  const d = Math.max(1, S * 0.02);
  // contact shadow from the silhouette
  const sil = E; e.drawImage(G, 0, 0); e.globalCompositeOperation = 'source-in'; e.fillStyle = '#0a0220'; e.fillRect(0, 0, S, S); e.globalCompositeOperation = 'source-over';
  f.globalAlpha = 0.34; f.drawImage(sil, d * 0.4, d * 1.9); f.globalAlpha = 1;
  // body with gloss and specular
  b.drawImage(G, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  const lg = b.createLinearGradient(0, S * 0.15, 0, S * 0.85);
  lg.addColorStop(0, 'rgba(255,255,255,' + (o.gloss == null ? 0.5 : o.gloss) + ')'); lg.addColorStop(0.42, 'rgba(255,255,255,0.04)'); lg.addColorStop(0.6, 'rgba(10,0,40,0)'); lg.addColorStop(1, 'rgba(12,0,48,0.36)');
  b.fillStyle = lg; b.fillRect(0, 0, S, S);
  const sg = b.createRadialGradient(S * 0.36, S * 0.3, 0, S * 0.36, S * 0.3, S * 0.2);
  sg.addColorStop(0, 'rgba(255,255,255,0.65)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = sg; b.fillRect(0, 0, S, S);
  // rim light on the lit (top left) edge and a dark bevel on the far edge
  e.setTransform(1, 0, 0, 1, 0, 0); e.globalCompositeOperation = 'source-over'; e.clearRect(0, 0, S, S); e.drawImage(G, 0, 0);
  e.globalCompositeOperation = 'destination-out'; e.drawImage(G, d, d * 1.2); e.globalCompositeOperation = 'source-in'; e.fillStyle = '#fff'; e.fillRect(0, 0, S, S);
  b.globalAlpha = 0.7; b.drawImage(E, 0, 0);
  dd.drawImage(G, 0, 0); dd.globalCompositeOperation = 'destination-out'; dd.drawImage(G, -d, -d * 1.2); dd.globalCompositeOperation = 'source-in'; dd.fillStyle = '#1a0838'; dd.fillRect(0, 0, S, S);
  b.globalAlpha = 0.45; b.drawImage(D, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
  f.drawImage(B, 0, 0);
  return F;
}
function sprite(key, S, draw, o) {
  let c = cache.get(key);
  if (c !== undefined) return c;
  if (cache.size > 700) cache.clear();
  c = null;
  const G = makeCanvas(S, S);
  if (G) {
    const g = G.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    draw(g, S);
    c = (o && o.raw) ? G : light(G, S, o);
  }
  cache.set(key, c);
  return c;
}
const bucket = (px) => Math.max(16, Math.ceil(px / 8) * 8);

// ---------------------------------------------------------------------------------------------------- hero currency glyphs, drawn at unit size u = glyph box
function coinArt(g, S, col) {
  const u = S * 0.62, cx = S / 2, cy = S / 2, base = col || '#ffd44d';
  const gr = g.createRadialGradient(cx - u * 0.18, cy - u * 0.22, u * 0.05, cx, cy, u * 0.55);
  gr.addColorStop(0, shade(base, 0.62)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, -0.38));
  g.beginPath(); g.arc(cx, cy, u * 0.5, 0, TAU); g.fillStyle = gr; g.fill(); g.lineWidth = u * 0.06; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.arc(cx, cy, u * 0.38, 0, TAU); g.lineWidth = u * 0.04; g.strokeStyle = shade(base, -0.45); g.stroke();
  g.beginPath(); g.arc(cx, cy, u * 0.34, 0, TAU); g.lineWidth = u * 0.025; g.strokeStyle = shade(base, 0.55); g.stroke();
  // embossed note
  g.fillStyle = shade(base, -0.5); g.beginPath(); g.ellipse(cx - u * 0.07, cy + u * 0.14, u * 0.1, u * 0.075, -0.4, 0, TAU); g.fill();
  g.fillRect(cx + u * 0.0, cy - u * 0.2, u * 0.04, u * 0.36);
  g.beginPath(); g.moveTo(cx + u * 0.04, cy - u * 0.2); g.quadraticCurveTo(cx + u * 0.2, cy - u * 0.14, cx + u * 0.15, cy - u * 0.02); g.lineTo(cx + u * 0.04, cy - u * 0.08); g.fill();
}
function diamondArt(g, S, col) {
  const u = S * 0.66, cx = S / 2, cy = S / 2 + u * 0.02, base = col || '#5fe8ff';
  const top = cy - u * 0.34, mid = cy - u * 0.12, bot = cy + u * 0.46, L = cx - u * 0.46, R = cx + u * 0.46;
  const pts = (arr, fill) => { g.beginPath(); arr.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
  pts([[L, mid], [cx - u * 0.26, top], [cx + u * 0.26, top], [R, mid], [cx, bot]], shade(base, -0.2));      // body
  pts([[L, mid], [cx - u * 0.26, top], [cx - u * 0.1, mid]], shade(base, 0.45));                            // crown facets
  pts([[cx - u * 0.26, top], [cx + u * 0.26, top], [cx + u * 0.1, mid], [cx - u * 0.1, mid]], shade(base, 0.7));
  pts([[cx + u * 0.26, top], [R, mid], [cx + u * 0.1, mid]], base);
  pts([[L, mid], [cx - u * 0.1, mid], [cx, bot]], shade(base, 0.12));                                       // pavilion facets
  pts([[cx - u * 0.1, mid], [cx + u * 0.1, mid], [cx, bot]], shade(base, 0.38));
  pts([[cx + u * 0.1, mid], [R, mid], [cx, bot]], shade(base, -0.28));
  g.lineJoin = 'round'; g.lineWidth = u * 0.055; g.strokeStyle = OUT;
  g.beginPath(); g.moveTo(L, mid); g.lineTo(cx - u * 0.26, top); g.lineTo(cx + u * 0.26, top); g.lineTo(R, mid); g.lineTo(cx, bot); g.closePath(); g.stroke();
  g.lineWidth = u * 0.025; g.strokeStyle = 'rgba(20,10,44,.55)'; g.beginPath(); g.moveTo(L, mid); g.lineTo(R, mid); g.moveTo(cx - u * 0.1, mid); g.lineTo(cx, bot); g.moveTo(cx + u * 0.1, mid); g.lineTo(cx, bot); g.stroke();
  sparkle4(g, cx - u * 0.22, top + u * 0.06, u * 0.16, '#fff', 0.95);
}
function recordArt(g, S, col) {
  const u = S * 0.64, cx = S / 2, cy = S / 2, lab = col || '#ff8ad8';
  g.beginPath(); g.arc(cx, cy, u * 0.5, 0, TAU); const gr = g.createRadialGradient(cx - u * 0.15, cy - u * 0.15, u * 0.05, cx, cy, u * 0.5); gr.addColorStop(0, '#46406a'); gr.addColorStop(1, '#0c0818'); g.fillStyle = gr; g.fill();
  g.lineWidth = u * 0.06; g.strokeStyle = OUT; g.stroke();
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx, cy, u * (0.42 - i * 0.045), 0, TAU); g.lineWidth = u * 0.012; g.strokeStyle = 'rgba(180,170,230,' + (0.16 + (i % 2) * 0.1) + ')'; g.stroke(); }
  g.save(); g.beginPath(); g.arc(cx, cy, u * 0.5, 0, TAU); g.clip();
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(cx - u * 0.5, cy - u * 0.12); g.lineTo(cx - u * 0.1, cy - u * 0.5); g.lineTo(cx + u * 0.12, cy - u * 0.5); g.lineTo(cx - u * 0.5, cy + u * 0.1); g.closePath(); g.fill(); g.restore();
  g.beginPath(); g.arc(cx, cy, u * 0.19, 0, TAU); const lg = g.createRadialGradient(cx - u * 0.05, cy - u * 0.06, 0, cx, cy, u * 0.19); lg.addColorStop(0, shade(lab, 0.5)); lg.addColorStop(1, shade(lab, -0.2)); g.fillStyle = lg; g.fill(); g.lineWidth = u * 0.03; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.arc(cx, cy, u * 0.04, 0, TAU); g.fillStyle = '#0c0818'; g.fill();
}
function heartArt(g, S, col) {
  const u = S * 0.66, cx = S / 2, cy = S / 2 + u * 0.04, base = col || '#ff4a5e';
  g.beginPath(); g.moveTo(cx, cy + u * 0.44);
  g.bezierCurveTo(cx - u * 0.72, cy - u * 0.02, cx - u * 0.4, cy - u * 0.58, cx, cy - u * 0.2);
  g.bezierCurveTo(cx + u * 0.4, cy - u * 0.58, cx + u * 0.72, cy - u * 0.02, cx, cy + u * 0.44); g.closePath();
  const gr = g.createRadialGradient(cx - u * 0.18, cy - u * 0.22, u * 0.04, cx, cy, u * 0.6); gr.addColorStop(0, shade(base, 0.5)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, -0.4));
  g.fillStyle = gr; g.fill(); g.lineJoin = 'round'; g.lineWidth = u * 0.07; g.strokeStyle = OUT; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.65)'; g.beginPath(); g.ellipse(cx - u * 0.25, cy - u * 0.2, u * 0.1, u * 0.055, -0.7, 0, TAU); g.fill();
}
function starArt(g, S, col) {
  const u = S * 0.7, cx = S / 2, cy = S / 2 + u * 0.03, base = col || '#ffc83d';
  g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? u * 0.22 : u * 0.5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath();
  const gr = g.createLinearGradient(cx, cy - u * 0.5, cx, cy + u * 0.4); gr.addColorStop(0, shade(base, 0.55)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, -0.35));
  g.fillStyle = gr; g.fill(); g.lineJoin = 'round'; g.lineWidth = u * 0.07; g.strokeStyle = OUT; g.stroke();
  g.lineWidth = u * 0.02; g.strokeStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(cx, cy - u * 0.4); g.lineTo(cx - u * 0.1, cy - u * 0.12); g.stroke();
}
const HERO_GLYPH = { coin: coinArt, diamond: diamondArt, record: recordArt, heart: heartArt, star: starArt };

function glyphSprite(name, size, color) {
  const S = bucket(size * ART_SCALE * 1.3);
  const key = 'g:' + name + ':' + (color || '') + ':' + S;
  return sprite(key, S, (g, S2) => {
    if (HERO_GLYPH[name]) { HERO_GLYPH[name](g, S2, color); return; }
    g.translate(S2 / 2, S2 / 2); flatGlyph(g, name, 0, 0, S2 / 1.3, color);
  }, { gloss: HERO_GLYPH[name] ? 0.22 : 0.5 });
}
export function drawGlyph(ctx, name, x, y, size, color) {
  if (!(size > 0)) return;
  const sp = glyphSprite(name, size, color);
  if (!sp) { flatGlyph(ctx, name, x, y, size, color); return; }
  const full = size * 1.3;
  ctx.drawImage(sp, x - full / 2, y - full / 2, full, full);
}
export const drawIcon = drawGlyph;

// ---------------------------------------------------------------------------------------------------- gear
const GEAR_TINT = { common: '#b9c2d6', rare: '#4d9bff', epic: '#b66bff', legendary: '#ffb02e', mythic: '#ff4fa0' };
export function drawGear(ctx, slot, id, rarity, x, y, size) {
  if (!(size > 0)) return;
  const rank = Math.max(0, RANK.indexOf(rarity));
  const S = bucket(size * ART_SCALE * 1.4);
  const key = 'gear:' + slot + ':' + id + ':' + rarity + ':' + S;
  const sp = sprite(key, S, (g, S2) => {
    const c = S2 / 2;
    if (rank >= 1) { const gr = g.createRadialGradient(c, c, 0, c, c, S2 * 0.48); gr.addColorStop(0, hexA(GEAR_TINT[rarity], 0.5 + rank * 0.08)); gr.addColorStop(1, hexA(GEAR_TINT[rarity], 0)); g.fillStyle = gr; g.fillRect(0, 0, S2, S2); }
    flatGear(g, slot, id, rarity, c, c, S2 / 1.4);
    // tier ornaments baked into the sprite
    if (rank >= 2) { sparkle4(g, c + S2 * 0.27, c - S2 * 0.27, S2 * 0.075, '#fff', 0.95); sparkle4(g, c - S2 * 0.3, c + S2 * 0.2, S2 * 0.045, GEAR_TINT[rarity], 0.9); }
    if (rank >= 3) { sparkle4(g, c - S2 * 0.22, c - S2 * 0.3, S2 * 0.06, '#fff', 0.9); for (let i = 0; i < rank - 2; i++) { g.fillStyle = GEAR_TINT[rarity]; g.beginPath(); g.arc(c - S2 * 0.1 + i * S2 * 0.1, c + S2 * 0.4, S2 * 0.025, 0, TAU); g.fill(); } }
  }, { gloss: 0.34 });
  const full = size * 1.4;
  if (!sp) { flatGear(ctx, slot, id, rarity, x, y, size); return; }
  ctx.drawImage(sp, x - full / 2, y - full / 2, full, full);
}

// ---------------------------------------------------------------------------------------------------- crates
const CRATE_GLOW = { garage: '#ffb454', studio: '#5fe8ff', platinum: '#ffe0f4' };
function ray(ctx, x, y, ang, len, w0, w1, col, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -w0 / 2); ctx.lineTo(len, -w1 / 2); ctx.lineTo(len, w1 / 2); ctx.lineTo(0, w0 / 2); ctx.closePath(); ctx.fill(); ctx.restore();
}
function softSprite(col) {
  const key = 'soft:' + col; let c = cache.get(key); if (c !== undefined) return c;
  c = makeCanvas(64, 64);
  if (c) { const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.3, hexA(col, 0.5)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  cache.set(key, c); return c;
}
function softGlow(ctx, col, x, y, r, a) {
  if (!(a > 0) || !(r > 0)) return;
  const sp = softSprite(col); ctx.save(); const pa = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a) * pa;
  if (sp) ctx.drawImage(sp, x - r, y - r, r * 2, r * 2); else { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(col, 1)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.globalAlpha = pa; ctx.restore();
}
export function drawCrate(ctx, tier, x, y, size, o) {
  o = o || {};
  const t = o.t || 0, open = clamp(o.open || 0, 0, 1), col = CRATE_GLOW[tier] || CRATE_GLOW.garage, k = size / 100;
  ctx.save();
  // ground shadow and an aura that breathes, stronger for better crates
  const tierRank = tier === 'platinum' ? 2 : tier === 'studio' ? 1 : 0;
  ctx.fillStyle = 'rgba(6,2,20,.38)'; ctx.beginPath(); ctx.ellipse(x, y + 46 * k, 50 * k, 9 * k, 0, 0, TAU); ctx.fill();
  softGlow(ctx, col, x, y + 4 * k, size * (0.75 + tierRank * 0.14 + open * 0.5), (0.16 + tierRank * 0.08) * (0.8 + 0.2 * Math.sin(t * 2.4)) + open * 0.3);
  // god rays from the open lid
  if (open > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.2 + Math.sin(t * 0.9 + i) * 0.05; ray(ctx, x, y - 8 * k, a, size * (1.2 + 0.2 * hn(i)), 10 * k, 60 * k, col, 0.3 * open); }
    ctx.globalCompositeOperation = 'source-over';
  }
  flatCrate(ctx, tier, x, y, size, o);
  // sparkle burst and a bright core when it opens
  if (open > 0.02) {
    softGlow(ctx, '#ffffff', x, y - 10 * k, size * 0.38 * open, 0.7 * open);
    for (let i = 0; i < 12; i++) {
      const ph = fract(t * 0.55 + i / 12), a = -Math.PI / 2 + (hn(i + 2) - 0.5) * 1.6, r = ph * size * (0.55 + hn(i) * 0.5);
      sparkle4(ctx, x + Math.cos(a) * r, y - 10 * k + Math.sin(a) * r, (3 + hn(i + 7) * 5) * k * (1 - ph * 0.6), i % 3 ? col : '#fff', (1 - ph) * open);
    }
  } else if (tierRank >= 1) {
    const ph = fract(t * 0.4); sparkle4(ctx, x - 30 * k + ph * 60 * k, y - 18 * k + Math.sin(ph * 6) * 4 * k, 5 * k, '#fff', Math.sin(ph * Math.PI));
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- rarity frames
export function drawRarityFrame(ctx, rarity, x, y, w, h, t) {
  const R = RARITY[rarity] || RARITY.common, rank = Math.max(0, RANK.indexOf(rarity)); t = t || 0;
  const rad = Math.min(18, w / 5, h / 5), L = -w / 2, T = -h / 2;
  ctx.save(); ctx.translate(x, y);
  // outer bloom
  if (rank >= 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = R.color; const pa0 = ctx.globalAlpha; ctx.shadowBlur = 8 + rank * 4; ctx.globalAlpha = 0.28 + rank * 0.08 + (rank >= 3 ? 0.08 * Math.sin(t * 3) : 0); rrp(ctx, L, T, w, h, rad); ctx.strokeStyle = R.color; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = pa0; ctx.restore(); }
  // card body: deep tinted gradient with an inner glow from the bottom
  rrp(ctx, L, T, w, h, rad);
  const g = ctx.createLinearGradient(0, T, 0, -T); g.addColorStop(0, shade(R.color, -0.62)); g.addColorStop(1, shade(R.color, -0.86)); ctx.fillStyle = g; ctx.fill();
  ctx.save(); rrp(ctx, L, T, w, h, rad); ctx.clip();
  const ig = ctx.createRadialGradient(0, -T * 0.9, 0, 0, -T * 0.9, Math.max(w, h) * 0.8); ig.addColorStop(0, hexA(R.color, 0.32 + rank * 0.05)); ig.addColorStop(1, hexA(R.color, 0)); ctx.fillStyle = ig; ctx.fillRect(L, T, w, h);
  // top gloss band
  const gl = ctx.createLinearGradient(0, T, 0, T + h * 0.5); gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gl; ctx.fillRect(L, T, w, h * 0.5);
  // diagonal shimmer sweep for epic and up
  if (rank >= 2) {
    const kk = ((t * (0.4 + rank * 0.08)) % 2.2) - 0.5; ctx.save(); ctx.translate(L + kk * (w + h), 0); ctx.rotate(0.55);
    const sg = ctx.createLinearGradient(-14, 0, 14, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,' + (0.2 + rank * 0.04) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(-14, -h * 1.4, 28, h * 2.8); ctx.restore();
  }
  ctx.restore();
  // border: bevelled gradient (light top left, dark bottom right); mythic cycles colours
  rrp(ctx, L, T, w, h, rad);
  let bg;
  if (rarity === 'mythic') { bg = ctx.createLinearGradient(L, T, -L, -T); const cols = ['#ff4fa0', '#ffc83d', '#6dff8a', '#2fe6ff', '#b66bff', '#ff4fa0']; for (let i = 0; i <= 5; i++) bg.addColorStop(i / 5, cols[(i + Math.floor(t * 2)) % 5]); }
  else { bg = ctx.createLinearGradient(L, T, -L, -T); bg.addColorStop(0, shade(R.color, 0.6)); bg.addColorStop(0.5, R.color); bg.addColorStop(1, shade(R.color, -0.45)); }
  ctx.strokeStyle = bg; ctx.lineWidth = rank >= 2 ? 3.6 : 2.8; ctx.stroke();
  rrp(ctx, L - 1.6, T - 1.6, w + 3.2, h + 3.2, rad + 1.5); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  rrp(ctx, L + 3, T + 3, w - 6, h - 6, Math.max(2, rad - 3)); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
  // ornaments: corner studs for epic and up, orbiting sparkles for legendary and mythic
  if (rank >= 2) for (const [cx, cy] of [[L + 5, T + 5], [-L - 5, T + 5], [L + 5, -T - 5], [-L - 5, -T - 5]]) { ctx.beginPath(); ctx.arc(cx, cy, 2.2 + (rank >= 3 ? 0.8 : 0), 0, TAU); ctx.fillStyle = shade(R.color, 0.55); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.stroke(); }
  if (rank >= 3) {
    const per = 2 * (w + h);
    for (let i = 0; i < 2 + (rank - 3) * 2; i++) {
      let d = ((t * 0.12 + i / (2 + (rank - 3) * 2)) % 1) * per, px, py;
      if (d < w) { px = L + d; py = T; } else if (d < w + h) { px = -L; py = T + (d - w); } else if (d < 2 * w + h) { px = -L - (d - w - h); py = -T; } else { px = L; py = -T - (d - 2 * w - h); }
      sparkle4(ctx, px, py, 5 + Math.sin(t * 6 + i) * 1.5, '#fff', 0.95); softGlow(ctx, rarity === 'mythic' ? '#ff9ad2' : '#ffd24a', px, py, 14, 0.5);
    }
  }
  ctx.restore();
}
