// Cell Serpent: everything that is drawn in code, in the Hocus Vocus "chibi candy" look:
// an even warm-brown outline (never black), flat base colour + one hard cel shadow on the
// lower left + one gloss band on the upper right, big flat-cel eyes with a big and a small
// catchlight, round bouncy shapes. Light comes from the upper right.
//
// createArtDraw(makeCanvas) returns the drawing kit. `makeCanvas(w, h)` gives an offscreen
// canvas (the browser passes document.createElement, the tests pass a stub), so baked
// sprites are cached once and blitted. Anything that must move its face (heads) is drawn
// live with drawHead().
import { createEnemyFaces } from './enemy_faces.js';
export const INK = '#2d170f';
const TAU = Math.PI * 2;

const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const MIXC = new Map();
export const mix = (a, b, t) => { let m = MIXC.get(a); if (!m) { if (MIXC.size > 300) return mixRaw(a, b, t); MIXC.set(a, m = new Map()); } let n = m.get(b); if (!n) m.set(b, n = new Map()); let v = n.get(t); if (v === undefined) { v = mixRaw(a, b, t); if (n.size < 64) n.set(t, v); } return v; };
const mixRaw = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
export const shade = (h, k = 0.28) => mix(h, '#4a1a30', k);
export const tint = (h, k = 0.35) => mix(h, '#ffffff', k);

// ------------------------------------------------------------------ path helpers
const circ = (x, y, r) => g => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
const ell = (x, y, rx, ry, rot = 0) => g => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); };
const poly = pts => g => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
const star = (n, r1, r2, rot = 0) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1; return [Math.cos(a) * r, Math.sin(a) * r]; }));

// Base colour, one cel shadow crescent (lower left), one gloss band (upper right), warm outline.
function cel(g, base, path, o = {}) {
  const R = o.r || 20, lw = o.lw || Math.max(2, R * 0.1);
  g.save(); path(g); g.clip();
  g.fillStyle = o.shadow || shade(base); g.fillRect(-400, -400, 800, 800);
  g.save(); g.translate(R * 0.14, -R * 0.14); path(g); g.fillStyle = base; g.fill(); g.restore();
  if (o.hi !== false) {
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1.5, R * 0.1); g.lineCap = 'round';
    g.beginPath(); g.arc(o.hx || 0, o.hy || 0, (o.hr || R) * 0.66, -1.25, -0.45); g.stroke();
  }
  g.restore();
  g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = INK; path(g); g.stroke();
}
const ink = (g, w, col = INK) => { g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; };
function line(g, pts, w, col = INK) { ink(g, w, col); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
// a stick with a coloured core: outline first, colour on top
function stick(g, a, b, w, col) { line(g, [a, b], w, INK); line(g, [a, b], w * 0.55, col); }

// A big flat-cel eye. look: [-1..1, -1..1], open: 0..1 (blink).
function eye(g, x, y, rx, ry, o = {}) {
  const open = o.open === undefined ? 1 : o.open, iris = o.iris || '#7a4a22', lk = o.look || [0, 0];
  g.save(); g.translate(x, y);
  if (open < 0.2) { line(g, [[-rx, 0], [rx, 0.1 * ry]], Math.max(2, rx * 0.22)); g.restore(); return; }
  g.save(); ell(0, 0, rx, ry * open)(g); g.clip();
  g.fillStyle = '#fffaf0'; g.fillRect(-rx * 2, -ry * 2, rx * 4, ry * 4);
  const ix = lk[0] * rx * 0.28, iy = lk[1] * ry * 0.25;
  g.fillStyle = iris; ell(ix, iy, rx * 0.72, ry * 0.86)(g); g.fill();
  g.fillStyle = shade(iris, 0.5); ell(ix, iy + ry * 0.12, rx * 0.5, ry * 0.58)(g); g.fill();
  g.fillStyle = INK; ell(ix, iy, rx * 0.34, ry * 0.42)(g); g.fill();
  g.fillStyle = '#fff'; circ(ix - rx * 0.26, iy - ry * 0.3, rx * 0.2)(g); g.fill(); circ(ix + rx * 0.22, iy + ry * 0.26, rx * 0.09)(g); g.fill();
  g.restore();
  g.lineWidth = Math.max(2, rx * 0.2); g.strokeStyle = INK; ell(0, 0, rx, ry * open)(g); g.stroke();
  g.restore();
}
function brow(g, x0, y0, x1, y1, w) { line(g, [[x0, y0], [x1, y1]], w); }
function blush(g, x, y, r, col = '#ff6fa8') { g.save(); g.globalAlpha = 0.55; g.fillStyle = col; ell(x, y, r, r * 0.6)(g); g.fill(); g.restore(); }
function fangsMouth(g, x, y, w, open = 1, col = '#7a1633') {
  g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + w, y); g.quadraticCurveTo(x, y + w * (0.5 + open * 1.1), x - w, y); g.closePath();
  g.fillStyle = col; g.fill(); ink(g, Math.max(2, w * 0.18)); g.stroke();
  g.fillStyle = '#fffaf0'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * w * 0.9, y); g.lineTo(x + s * w * 0.45, y); g.lineTo(x + s * w * 0.68, y + w * 0.5); g.closePath(); g.fill(); ink(g, Math.max(1.2, w * 0.1)); g.stroke(); }
}
function sparkle(g, x, y, r, col = '#fff8ec') { g.save(); g.translate(x, y); star(4, r, r * 0.22, 0)(g); g.fillStyle = col; g.fill(); ink(g, Math.max(1, r * 0.12)); g.stroke(); g.restore(); }

// ------------------------------------------------------------------ palettes
// One species per stage. Colour, cell style, face and headgear all differ. No yellow here: yellow is the upgrade cell.
export const SPECIES = {
  love: { name: 'Love-Struck', base: '#ff7eb6', sh: '#d9488f', lite: '#ffc2dc', eye: '#ff5a8a', acc: '#ff9ac6', cell: 'round', face: 'love', hat: 'hearts' },
  rust: { name: 'Rustic', base: '#e07a5f', sh: '#a8452f', lite: '#f6b8a3', eye: '#3a2a8a', acc: '#c98a4a', cell: 'hex', face: 'goggles', hat: 'antenna' },
  sneezy: { name: 'Sneezy', base: '#6fe0a8', sh: '#2fae78', lite: '#c4f5dc', eye: '#2d170f', acc: '#9affcd', cell: 'fuzzy', face: 'sneeze', hat: 'none' },
  grumpy: { name: 'Grumpy', base: '#6fc8ff', sh: '#3d8fd6', lite: '#cdeaff', eye: '#2d170f', acc: '#ff5a78', cell: 'crystal', face: 'grumpy', hat: 'horns' },
  sleepy: { name: 'Sleepy', base: '#a88bff', sh: '#6a4cd6', lite: '#dccfff', eye: '#2d170f', acc: '#ff9ac6', cell: 'lobed', face: 'sleepy', hat: 'cap' },
  disco: { name: 'Disco', base: '#3fd0c9', sh: '#1f8f9a', lite: '#a8f5ee', eye: '#2d170f', acc: '#ff7eb6', cell: 'disco', face: 'shades', hat: 'antenna' },
  sour: { name: 'Sour', base: '#5fb85f', sh: '#2f7a3a', lite: '#b7f0a8', eye: '#2d170f', acc: '#ff9ac0', cell: 'drop', face: 'sour', hat: 'none' },
  mighty: { name: 'Mighty', base: '#8fa3c7', sh: '#5b6d94', lite: '#d3def2', eye: '#ff5a78', acc: '#7ad04a', cell: 'stone', face: 'cyclops', hat: 'horns' },
  frosty: { name: 'Frosty', base: '#bfe9ff', sh: '#6fb4e0', lite: '#f0fbff', eye: '#2d170f', acc: '#ff7eb6', cell: 'snow', face: 'shy', hat: 'none' },
  piggy: { name: 'Piggy Bank', base: '#ffa8b8', sh: '#d9648f', lite: '#ffd6de', eye: '#2d170f', acc: '#ffd84d', cell: 'round', face: 'shy', hat: 'hearts' },
  gloomy: { name: 'Gloomy', base: '#6a4cb0', sh: '#3a2670', lite: '#a58be0', eye: '#ff5a8a', acc: '#9dff6d', cell: 'blob', face: 'sad', hat: 'spikes' },
};
const UPGRADE_PAL = { base: '#ffd84d', sh: '#d49a1e', lite: '#fff1a8' };
const heartPath = (x, y, s) => g => { g.beginPath(); g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.8, y - s * 1.1, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.8, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); g.closePath(); };
const KIND = { armor: '#aebbd6', bomb: '#ff4d6d' };

// ------------------------------------------------------------------ the kit
export function createArtDraw(makeCanvas, dpr = 2) {
  const cache = new Map();
  // bake(key, w, h, fn): fn draws around (0,0); the sprite is w x h logical units.
  function bake(key, w, h, fn, scale = dpr) {
    const hit = cache.get(key);
    if (hit !== undefined) { if (key.charCodeAt(0) === 102 && key.startsWith('far|')) { cache.delete(key); cache.set(key, hit); } return hit; }   // cache hits are the per-frame path: one lookup, no startsWith unless it can be a far skyline   // far skylines (1.1 MB each) are kept most-recent-last
    if (key.startsWith('far|')) { let n = 0, first = null; for (const k of cache.keys()) if (k.startsWith('far|')) { n++; if (!first) first = k; } if (n >= FAR_KEEP) { const old = cache.get(first); if (old && old.c) old.c.width = 0; cache.delete(first); } }   // a long session visits all 50 skylines: drop the least recent
    let spr = null;
    const c = makeCanvas && makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
    if (c) { const g = c.getContext('2d'); g.scale(scale, scale); g.translate(w / 2, h / 2); fn(g); spr = { c, w, h }; }
    cache.set(key, spr); return spr;
  }
  const FAR_KEEP = 6;
  const B = 40;   // bake radius
  const EF = createEnemyFaces({ bake, cel, poly, circ, ell, line, heartPath, sparkle, shade, INK, mix });   // 01-enemy-art r7
  // layer(key, w, h, scale, fn): ONE big static layer (the background); a new key replaces the old one.
  let layerKey = null, layerSpr = null;
  function layer(key, w, h, scale, fn) {
    if (layerKey === key) return layerSpr;
    const c = makeCanvas && makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
    layerKey = key; layerSpr = null;
    if (c) { const g = c.getContext('2d'); g.scale(scale, scale); fn(g); layerSpr = { c, w, h }; }
    return layerSpr;
  }
  // a second static layer slot (the foreground of the background, so a far parallax layer can sit between the two)
  let layerKey2 = null, layerSpr2 = null;
  function layer2(key, w, h, scale, fn) {
    if (layerKey2 === key) return layerSpr2;
    const c = makeCanvas && makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
    layerKey2 = key; layerSpr2 = null;
    if (c) { const g = c.getContext('2d'); g.scale(scale, scale); fn(g); layerSpr2 = { c, w, h }; }
    return layerSpr2;
  }

  // ---- snake cells ----
  // One drawing per cell style; the species picks the style. Faces are only ever on the head.
  function cellShape(g, P, r, o = {}) {
    const st = o.style || P.cell, base = o.base || P.base, sh = o.sh || P.sh, lite = o.lite || P.lite, decor = o.decor !== false;
    const legs = o.legs !== false && st !== 'snow' && st !== 'fuzzy';
    if (legs) for (const s of [-1, 1]) for (const x of [-0.25, 0.3]) {   // stubby legs
      stick(g, [x * r, s * r * 0.7], [x * r + r * 0.12, s * r * 1.12], r * 0.26, tint(base, 0.15));
      cel(g, tint(base, 0.35), circ(x * r + r * 0.14, s * r * 1.14, r * 0.14), { r: r * 0.14, hi: false, lw: 1.8 });
    }
    const sample = (n, f) => poly(Array.from({ length: n }, (_, i) => { const an = (i / n) * TAU, rr = f(an) * r; return [Math.cos(an) * rr, Math.sin(an) * rr]; }));
    if (st === 'crystal') {
      cel(g, base, poly(Array.from({ length: 18 }, (_, i) => { const an = (i / 18) * TAU, rr = i % 2 ? r * 0.8 : r * 1.02; return [Math.cos(an) * rr, Math.sin(an) * rr]; })), { r, shadow: sh, lw: r * 0.09 });
      if (decor) cel(g, lite, poly(Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TAU + 0.3) * r * 0.42, Math.sin(i / 6 * TAU + 0.3) * r * 0.42])), { r: r * 0.4, shadow: tint(base, 0.3), hi: false, lw: 1.8 });
    } else if (st === 'hex') {
      const hx = poly(Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TAU + 0.52) * r, Math.sin(i / 6 * TAU + 0.52) * r]));
      cel(g, base, hx, { r, shadow: sh, lw: r * 0.1 });
      if (decor) { line(g, Array.from({ length: 7 }, (_, i) => [Math.cos(i / 6 * TAU + 0.52) * r * 0.6, Math.sin(i / 6 * TAU + 0.52) * r * 0.6]), r * 0.07, sh); for (let i = 0; i < 3; i++) cel(g, lite, circ(Math.cos(i * 2.09 + 1) * r * 0.62, Math.sin(i * 2.09 + 1) * r * 0.62, r * 0.08), { r: r * 0.1, hi: false, lw: 1.6 }); }
    } else if (st === 'fuzzy') {
      for (let i = 0; i < 22; i++) { const an = (i / 22) * TAU; stick(g, [Math.cos(an) * r * 0.8, Math.sin(an) * r * 0.8], [Math.cos(an) * r * 1.22, Math.sin(an) * r * 1.22], r * 0.14, tint(base, 0.1)); }
      cel(g, base, circ(0, 0, r * 0.94), { r, shadow: sh });
      if (decor) { g.save(); g.globalAlpha = 0.7; g.fillStyle = lite; for (const [x, y, s] of [[-0.3, -0.2, 0.12], [0.25, 0.3, 0.1], [0.3, -0.3, 0.07]]) { circ(x * r, y * r, s * r)(g); g.fill(); } g.restore(); }
    } else if (st === 'lobed') {
      cel(g, base, sample(48, an => 0.9 + 0.1 * Math.cos(7 * an)), { r, shadow: sh });
      if (decor) { g.save(); g.globalAlpha = 0.75; g.fillStyle = lite; for (const [x, y, s] of [[-0.35, -0.1, 0.13], [0.15, 0.35, 0.1], [0.3, -0.3, 0.09]]) { circ(x * r, y * r, s * r)(g); g.fill(); } g.restore(); }
    } else if (st === 'drop') {
      cel(g, base, poly([[-r * 0.7, -r * 0.55], [-r * 1.5, 0], [-r * 0.7, r * 0.55]]), { r: r * 0.6, shadow: sh, lw: r * 0.09, hi: false });
      cel(g, base, circ(0, 0, r * 0.92), { r, shadow: sh });
      if (decor) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = r * 0.1; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, r * 0.6, -2.3, -1.4); g.stroke(); }
    } else if (st === 'disco') {
      cel(g, base, circ(0, 0, r * 0.94), { r, shadow: sh });
      if (decor) { g.save(); circ(0, 0, r * 0.9)(g); g.clip(); g.strokeStyle = lite; g.globalAlpha = 0.8; g.lineWidth = r * 0.06; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * r * 0.3, -r); g.lineTo(i * r * 0.3, r); g.moveTo(-r, i * r * 0.3); g.lineTo(r, i * r * 0.3); g.stroke(); } g.restore(); sparkle(g, r * 0.35, -r * 0.35, r * 0.26); }
    } else if (st === 'stone') {
      cel(g, base, poly([[-r * 0.95, -r * 0.55], [-r * 0.55, -r * 0.95], [r * 0.55, -r * 0.95], [r * 0.95, -r * 0.55], [r * 0.95, r * 0.55], [r * 0.55, r * 0.95], [-r * 0.55, r * 0.95], [-r * 0.95, r * 0.55]]), { r, shadow: sh, lw: r * 0.1 });
      if (decor) { line(g, [[-r * 0.1, -r * 0.9], [r * 0.1, -r * 0.4], [-r * 0.2, -r * 0.05], [r * 0.15, r * 0.4]], r * 0.07, sh); cel(g, '#7ad04a', poly([[r * 0.35, r * 0.95], [r * 0.5, r * 0.6], [r * 0.7, r * 0.95]]), { r: r * 0.3, hi: false, lw: 2, shadow: '#4a9a2a' }); }
    } else if (st === 'snow') {
      cel(g, base, star(6, r * 1.08, r * 0.6, 0), { r, shadow: sh, lw: r * 0.09 });
      if (decor) { cel(g, lite, circ(0, 0, r * 0.38), { r: r * 0.4, shadow: tint(base, 0.4), hi: false, lw: 1.8 }); sparkle(g, r * 0.3, -r * 0.3, r * 0.2); }
    } else if (st === 'blob') {
      cel(g, base, sample(48, an => 0.92 + 0.07 * Math.sin(3 * an + 1) + 0.05 * Math.sin(5 * an)), { r, shadow: sh });
      if (decor) { g.save(); g.globalAlpha = 0.8; g.fillStyle = lite; for (const [x, y, s] of [[-0.3, -0.25, 0.14], [0.3, 0.2, 0.1]]) { circ(x * r, y * r, s * r)(g); g.fill(); } g.restore(); }
    } else {   // round
      cel(g, base, circ(0, 0, r * 0.94), { r, shadow: sh });
      if (decor) { g.save(); g.globalAlpha = 0.7; g.fillStyle = lite; for (const [x, y, s] of [[-0.35, 0.05, 0.1], [0.05, 0.38, 0.08], [0.1, -0.36, 0.07]]) { circ(x * r, y * r, s * r)(g); g.fill(); } g.restore(); }
    }
  }
  // per-species baked pattern layer: clipped to the cell, drawn under the gloss and the number pad
  const PAT = { love: 'hearts', rust: 'rivets', sneezy: 'spots', grumpy: 'scales', sleepy: 'waves', disco: 'checks', sour: 'wedges', mighty: 'cracks', frosty: 'frost', piggy: 'coins', gloomy: 'rain' };
  function pattern(g, P, species, r) {
    const kind = PAT[species]; if (!kind) return;
    const dk = P.sh, lt = P.lite;
    g.save(); circ(0, 0, r * 0.86)(g); g.clip(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'stripes') {
      g.globalAlpha = 0.5; g.strokeStyle = dk; g.lineWidth = r * 0.17;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * r * 0.36 - r, r); g.lineTo(i * r * 0.36 + r * 0.3, -r); g.stroke(); }
    } else if (kind === 'spots') {
      for (const [x, y, s] of [[-0.5, -0.45, 0.17], [0.52, -0.3, 0.14], [-0.6, 0.35, 0.13], [0.35, 0.58, 0.18], [0.0, -0.78, 0.1], [-0.12, 0.74, 0.1]]) { g.globalAlpha = 0.55; g.fillStyle = dk; circ(x * r, y * r, s * r)(g); g.fill(); g.globalAlpha = 0.8; g.fillStyle = lt; circ((x - 0.04) * r, (y - 0.05) * r, s * r * 0.35)(g); g.fill(); }
    } else if (kind === 'scales') {
      g.globalAlpha = 0.5; g.strokeStyle = dk; g.lineWidth = r * 0.07;
      for (let row = -3; row <= 3; row++) for (let c = -3; c <= 3; c++) { const x = (c + (row & 1 ? 0.5 : 0)) * r * 0.42, y = row * r * 0.3; g.beginPath(); g.arc(x, y, r * 0.21, 0.15, Math.PI - 0.15); g.stroke(); }
    } else if (kind === 'waves') {
      g.globalAlpha = 0.5; g.strokeStyle = dk; g.lineWidth = r * 0.1;
      for (let i = -3; i <= 3; i++) { g.beginPath(); for (let x = -1; x <= 1.01; x += 0.25) { const X = x * r, Y = i * r * 0.34 + Math.sin(x * 5) * r * 0.07; x === -1 ? g.moveTo(X, Y) : g.lineTo(X, Y); } g.stroke(); }
    } else if (kind === 'checks') {
      g.globalAlpha = 0.4; g.fillStyle = dk;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if ((i + j) & 1) g.fillRect(i * r * 0.3 - r * 0.15, j * r * 0.3 - r * 0.15, r * 0.3, r * 0.3);
    } else if (kind === 'cracks') {
      g.globalAlpha = 0.65; g.strokeStyle = dk; g.lineWidth = r * 0.07;
      for (const pts of [[[-0.8, -0.5], [-0.45, -0.3], [-0.5, 0.0], [-0.2, 0.2]], [[0.8, 0.45], [0.5, 0.3], [0.55, 0.0], [0.3, -0.15]], [[0.1, 0.9], [0.0, 0.6], [0.2, 0.45]], [[-0.3, -0.9], [-0.1, -0.7]]]) { g.beginPath(); pts.forEach((q, k) => k ? g.lineTo(q[0] * r, q[1] * r) : g.moveTo(q[0] * r, q[1] * r)); g.stroke(); }
    } else if (kind === 'frost') {
      g.globalAlpha = 0.7; g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.06;
      for (const [x, y] of [[-0.6, -0.4], [0.62, 0.35], [0.1, -0.75], [-0.35, 0.65]]) for (let k = 0; k < 3; k++) { const an = k * Math.PI / 3 + x; g.beginPath(); g.moveTo(x * r - Math.cos(an) * r * 0.2, y * r - Math.sin(an) * r * 0.2); g.lineTo(x * r + Math.cos(an) * r * 0.2, y * r + Math.sin(an) * r * 0.2); g.stroke(); }
      g.globalAlpha = 0.45; g.strokeStyle = dk; g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(-r * 0.9, r * 0.1); g.lineTo(-r * 0.4, -r * 0.1); g.lineTo(-r * 0.3, -r * 0.5); g.moveTo(r * 0.9, -r * 0.2); g.lineTo(r * 0.4, 0); g.lineTo(r * 0.35, r * 0.4); g.stroke();
    } else if (kind === 'rivets') {   // r6: riveted plates, a seam cross with a bolt in every corner
      g.globalAlpha = 0.55; g.strokeStyle = dk; g.lineWidth = r * 0.08; g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
      g.globalAlpha = 0.9; g.lineWidth = r * 0.035;
      for (const [x, y] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46], [0, 0.8], [0, -0.8], [0.8, 0], [-0.8, 0]]) { g.fillStyle = lt; g.strokeStyle = dk; circ(x * r, y * r, r * 0.07)(g); g.fill(); g.stroke(); g.fillStyle = dk; circ(x * r + r * 0.012, y * r + r * 0.016, r * 0.025)(g); g.fill(); }
    } else if (kind === 'wedges') {   // r6: a sliced sour fruit, light pith lines fanning out from the centre
      g.globalAlpha = 0.55; g.strokeStyle = lt; g.lineWidth = r * 0.09;
      for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + 0.2; g.beginPath(); g.moveTo(Math.cos(an) * r * 0.2, Math.sin(an) * r * 0.2); g.lineTo(Math.cos(an) * r, Math.sin(an) * r); g.stroke(); }
      g.globalAlpha = 0.5; g.strokeStyle = dk; g.lineWidth = r * 0.05; g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.stroke();
    } else if (kind === 'coins') {   // r6: a piggy bank is full of coins
      for (const [x, y, s] of [[-0.5, -0.4, 0.17], [0.52, -0.28, 0.14], [-0.5, 0.45, 0.14], [0.42, 0.55, 0.18], [0.02, -0.8, 0.1], [0, 0.82, 0.09]]) { g.globalAlpha = 0.8; g.fillStyle = '#ffd84d'; circ(x * r, y * r, s * r)(g); g.fill(); g.strokeStyle = '#b9760f'; g.lineWidth = r * 0.035; g.stroke(); g.globalAlpha = 0.9; g.strokeStyle = '#fff1a8'; g.lineWidth = r * 0.025; g.beginPath(); g.arc(x * r, y * r, s * r * 0.55, 0, TAU); g.stroke(); }
    } else if (kind === 'rain') {   // r6: a gloomy cell lives under its own little rain cloud
      g.globalAlpha = 0.6; g.strokeStyle = '#9fd8ff'; g.lineWidth = r * 0.055;
      for (const [x, y] of [[-0.62, -0.45], [-0.25, -0.1], [0.2, -0.55], [0.58, -0.15], [-0.5, 0.4], [0.05, 0.3], [0.45, 0.55], [-0.12, 0.78], [0.75, 0.3]]) { g.beginPath(); g.moveTo(x * r, y * r); g.lineTo(x * r - r * 0.09, y * r + r * 0.2); g.stroke(); }
      g.globalAlpha = 0.45; g.strokeStyle = dk; g.lineWidth = r * 0.07; g.beginPath(); g.arc(-0.1 * r, 0.1 * r, r * 0.9, 0.3, 0.9); g.stroke();
    } else if (kind === 'hearts') {
      for (const [x, y, s] of [[-0.55, -0.4, 0.15], [0.55, -0.3, 0.12], [-0.5, 0.45, 0.12], [0.45, 0.55, 0.16], [0.05, -0.8, 0.1]]) { g.globalAlpha = 0.6; g.fillStyle = P.sh; heartPath(x * r, y * r, s * r)(g); g.fill(); }
    }
    g.restore();
  }
  // a soft dark pad under the HP number so the white digits read on every cell colour
  function hpPad(g, r, k = 0.62, a = 0.34) {
    if (!g.createRadialGradient) return;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * k); gr.addColorStop(0, `rgba(45,23,15,${a})`); gr.addColorStop(0.7, `rgba(45,23,15,${a * 0.55})`); gr.addColorStop(1, 'rgba(45,23,15,0)');
    g.fillStyle = gr; circ(0, 0, r * k)(g); g.fill();
  }
  function glossDot(g, r, x = 0.46, y = -0.5) { g.save(); g.globalAlpha = 0.6; g.fillStyle = '#fff'; ell(x * r, y * r, r * 0.11, r * 0.07, -0.7)(g); g.fill(); circ((x + 0.14) * r, (y + 0.1) * r, r * 0.035)(g); g.fill(); g.restore(); }
  const plusPath = (r, w) => poly([[-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w]]);
  function bodyFn(species, boss, kind) {
    const P = SPECIES[species] || SPECIES.love;
    return g => {
      const r = B;
      if (kind === 'bomb') {   // a bomb cell: glossy red, steel cap, curly fuse with a spark
        cel(g, KIND.bomb, circ(0, 0, r * 0.92), { r, shadow: '#a8203f' });
        glossDot(g, r, 0.42, -0.46);
        cel(g, '#7b86a0', poly([[-r * 0.3, -r * 0.84], [r * 0.3, -r * 0.84], [r * 0.24, -r * 1.02], [-r * 0.24, -r * 1.02]]), { r: r * 0.3, shadow: '#4b5470', hi: false, lw: 2.4 });
        g.beginPath(); g.moveTo(0, -r * 1.0); g.bezierCurveTo(r * 0.05, -r * 1.25, r * 0.5, -r * 1.12, r * 0.42, -r * 1.34); ink(g, r * 0.17); g.stroke(); ink(g, r * 0.08, '#f1d9a0'); g.stroke();
        sparkle(g, r * 0.45, -r * 1.38, r * 0.28, '#ffd84d');
        hpPad(g, r, 0.6, 0.4);
        for (const s of [-1, 1]) line(g, [[s * r * 0.45, -r * 0.5], [s * r * 0.62, -r * 0.3]], r * 0.07, '#ffd0d8');   // worried brow ticks
        return;
      }
      if (kind === 'upgrade') {   // yellow: golden cell with a ring of light and a star badge, centre left clear for the number
        g.save(); g.globalAlpha = 0.9; for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + 0.2; poly([[Math.cos(an) * r * 0.95, Math.sin(an) * r * 0.95], [Math.cos(an + 0.13) * r * 1.3, Math.sin(an + 0.13) * r * 1.3], [Math.cos(an - 0.13) * r * 1.3, Math.sin(an - 0.13) * r * 1.3]])(g); g.fillStyle = '#fff1a8'; g.fill(); }
        g.restore();
        cellShape(g, P, r, { ...UPGRADE_PAL, decor: false, legs: false });
        g.save(); circ(0, 0, r * 0.9)(g); g.clip(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = r * 0.14; for (const o of [-0.5, 0.1]) { g.beginPath(); g.moveTo(-r + o * r, r); g.lineTo(o * r + r * 0.7, -r); g.stroke(); } g.restore();
        hpPad(g, r, 0.6, 0.38);
        g.save(); g.translate(r * 0.55, -r * 0.58); cel(g, '#fff8ec', star(5, r * 0.5, r * 0.22, -Math.PI / 2), { r: r * 0.5, shadow: '#f0b52a', lw: 2.6 }); g.restore();
        return;
      }
      if (kind === 'mender') {   // a soft green plus-shaped pillow with stitching
        cel(g, '#86e8a2', plusPath(r * 0.98, r * 0.46), { r, shadow: '#3fb067', lw: r * 0.1 });
        g.save(); plusPath(r * 0.98, r * 0.46)(g); g.clip();
        g.setLineDash && g.setLineDash([r * 0.12, r * 0.1]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = r * 0.05; plusPath(r * 0.82, r * 0.31)(g); g.stroke(); g.setLineDash && g.setLineDash([]);
        g.restore();
        for (const [x, y] of [[0, -0.74], [0, 0.74], [-0.74, 0], [0.74, 0]]) { cel(g, '#fff8ec', circ(x * r, y * r, r * 0.09), { r: r * 0.09, hi: false, lw: 1.6, shadow: '#cfeccf' }); }
        glossDot(g, r, 0.2, -0.76);
        hpPad(g, r, 0.62, 0.4);
        return;
      }
      cellShape(g, P, r);
      if (kind === 'armor') {
        const pl = poly(Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * TAU + 0.39) * r * 0.96, Math.sin(i / 8 * TAU + 0.39) * r * 0.96]));
        cel(g, '#9fb0d4', pl, { r, shadow: '#5b6b8e', hr: r * 0.9, lw: r * 0.12 });
        g.save(); pl(g); g.clip(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(-r, -r * 0.1); g.lineTo(-r * 0.1, -r); g.stroke(); g.restore();
        cel(g, '#6b7b9e', circ(0, 0, r * 0.58), { r: r * 0.58, shadow: '#47557a', hi: false, lw: 2.4 });
        hpPad(g, r, 0.55, 0.3);
        for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + 0.39; cel(g, '#eef3ff', circ(Math.cos(an) * r * 0.76, Math.sin(an) * r * 0.76, r * 0.07), { r: r * 0.08, hi: false, lw: 1.5, shadow: '#9aa8c8' }); }
        return;
      }
      pattern(g, P, species, r);
      if (kind === 'gold' || kind === 'gold2') {   // gold leaf (gold2: the last seconds, the leaf is flaking off so it is thinner) over the species body: only the painted pixels are tinted (source-atop), the shape stays readable
        g.save(); g.globalCompositeOperation = 'source-atop';
        g.fillStyle = kind === 'gold2' ? 'rgba(255,184,32,.3)' : 'rgba(255,184,32,.66)'; g.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
        g.fillStyle = 'rgba(255,246,190,.34)'; g.beginPath(); g.moveTo(-r * 1.3, r * 0.2); g.lineTo(-r * 1.0, r * 0.6); g.lineTo(r * 1.3, -r * 0.2); g.lineTo(r * 1.0, -r * 0.6); g.closePath(); g.fill();
        g.restore(); g.save(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = r * 0.07; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * 0.2, r * 0.68); g.lineTo(r * 0.42, r * 0.28); g.stroke(); g.restore();
      }
      glossDot(g, r); hpPad(g, r);
      if (boss) for (const s of [-1, 1]) for (const x of [-0.3, 0.2]) cel(g, P.acc, poly([[x * r - r * 0.12, s * r * 0.82], [x * r + r * 0.12, s * r * 0.82], [x * r, s * r * 1.22]]), { r: r * 0.2, hi: false, lw: 2, shadow: shade(P.acc) });   // boss spikes
    };
  }

  // ---- minions (upright) ----
  function face(g, r, mood, o = {}) {
    const ex = r * (o.ex || 0.3), ey = r * (o.ey || -0.12), rx = r * (o.rx || 0.2), ry = r * (o.ry || 0.25);
    eye(g, -ex, ey, rx, ry, { iris: o.iris || '#7a4a22' }); eye(g, ex, ey, rx, ry, { iris: o.iris || '#7a4a22' });
    if (mood !== 'calm') { brow(g, -ex - rx, ey - ry * 1.15, -ex + rx * 0.8, ey - ry * 0.75, r * 0.075); brow(g, ex + rx, ey - ry * 1.15, ex - rx * 0.8, ey - ry * 0.75, r * 0.075); }
    if (o.mouth !== false) fangsMouth(g, 0, r * (o.my || 0.34), r * 0.2, 0.5);
    if (o.blush) { blush(g, -ex - rx * 0.6, ey + ry * 1.2, rx * 0.7); blush(g, ex + rx * 0.6, ey + ry * 1.2, rx * 0.7); }
  }
  function virus(col, spikes, horns) {
    return g => {
      const r = B * 0.78;
      for (let i = 0; i < spikes; i++) { const a = i / spikes * TAU + 0.2, x = Math.cos(a), y = Math.sin(a); stick(g, [x * r * 0.8, y * r * 0.8], [x * r * 1.28, y * r * 1.28], r * 0.22, shade(col, 0.1)); cel(g, tint(col, 0.2), circ(x * r * 1.36, y * r * 1.36, r * 0.16), { r: r * 0.16, hi: false, lw: 1.8 }); }
      cel(g, col, circ(0, 0, r), { r, shadow: shade(col, 0.3) });
      if (horns) for (const s of [-1, 1]) cel(g, '#fff1a8', poly([[s * r * 0.5, -r * 0.7], [s * r * 0.85, -r * 0.55], [s * r * 0.9, -r * 1.2]]), { r: r * 0.3, hi: false, lw: 2, shadow: '#e0a82a' });
      face(g, r, 'angry', { iris: '#2d170f', blush: true });
    };
  }
  const MIN = {
    green: virus('#6fe05a', 10), red: virus('#ff5a6e', 12, true),
    yellow: g => {
      const r = B * 0.8;
      for (const s of [-1, 1]) { line(g, [[s * r * 0.3, -r * 0.8], [s * r * 0.6, -r * 1.25]], r * 0.1); cel(g, '#ff7eb6', circ(s * r * 0.62, -r * 1.3, r * 0.15), { r: r * 0.15, hi: false, lw: 2 }); }
      cel(g, '#ffd84d', ell(0, 0, r * 0.85, r * 0.98), { r, shadow: '#d49a1e' });
      face(g, r, 'angry', { iris: '#2d170f', blush: true, ey: -0.05 });
    },
    jelly: g => {
      const r = B * 0.85, pts = [];
      for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.95]); }
      for (let i = 0; i <= 8; i++) { const x = r - (i / 8) * 2 * r; pts.push([x, r * 0.1 + (i % 2 ? r * 0.5 : r * 0.78)]); }
      cel(g, '#6fc8ff', poly(pts), { r, shadow: '#3d8fd6' });
      face(g, r, 'angry', { iris: '#1b2a5a', blush: true, ey: -0.1 });
    },
    eye: g => {
      const r = B * 0.78;
      for (const s of [-1, 1]) for (const k of [0.35, 0.78]) stick(g, [s * r * k, r * 0.7], [s * r * (k + 0.35), r * 1.25], r * 0.2, '#c4405a');
      cel(g, '#fff8ec', circ(0, 0, r), { r, shadow: '#e8c9c0' });
      eye(g, 0, 0, r * 0.62, r * 0.7, { iris: '#ff5a78' });
      brow(g, -r * 0.8, -r * 0.8, r * 0.1, -r * 0.55, r * 0.1);
    },
    robot: g => {
      const r = B * 0.8;
      for (const s of [-1, 1]) cel(g, '#ff7eb6', poly([[s * r * 0.8, -r * 0.2], [s * r * 1.45, -r * 0.7], [s * r * 1.1, r * 0.4]]), { r: r * 0.4, hi: false, lw: 2.2, shadow: '#d9488f' });
      cel(g, '#dfe6f6', circ(0, 0, r), { r, shadow: '#9aa6c6' });
      cel(g, '#394a78', circ(0, 0, r * 0.62), { r: r * 0.6, hi: false, lw: 2.4, shadow: '#232f55' });
      g.fillStyle = '#39f0ff'; circ(0, 0, r * 0.42)(g); g.fill(); g.fillStyle = '#b7fbff'; circ(0, 0, r * 0.26)(g); g.fill();
      g.fillStyle = '#fff'; circ(-r * 0.14, -r * 0.14, r * 0.1)(g); g.fill();
      brow(g, -r * 0.55, -r * 0.7, r * 0.4, -r * 0.5, r * 0.09);
    },
    bat: g => {
      const r = B * 0.7;
      for (const s of [-1, 1]) cel(g, '#a05fe0', poly([[s * r * 0.7, -r * 0.2], [s * r * 1.7, -r * 1.0], [s * r * 1.5, -r * 0.1], [s * r * 1.35, r * 0.25], [s * r * 1.0, r * 0.1], [s * r * 0.8, r * 0.5]]), { r: r * 0.7, hi: false, lw: 2.4, shadow: '#6a3aa8' });
      cel(g, '#6a4cb0', circ(0, 0, r), { r, shadow: '#43307f' });
      for (const s of [-1, 1]) cel(g, '#6a4cb0', poly([[s * r * 0.35, -r * 0.8], [s * r * 0.7, -r * 1.3], [s * r * 0.85, -r * 0.55]]), { r: r * 0.3, hi: false, lw: 2, shadow: '#43307f' });
      face(g, r, 'angry', { iris: '#ff5a78', blush: true, ey: -0.08 });
    },
    ghost: g => {
      const r = B * 0.8, pts = [];
      for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      for (let i = 0; i <= 8; i++) { const x = r - (i / 8) * 2 * r; pts.push([x, r * 0.55 + Math.sin(i * 1.6) * r * 0.22 + (i % 2 ? r * 0.2 : 0)]); }
      g.save(); g.globalAlpha = 0.93; cel(g, '#e6d9ff', poly(pts), { r, shadow: '#b69cf0' }); g.restore();
      eye(g, -r * 0.34, -r * 0.1, r * 0.2, r * 0.27, { iris: '#39d0ff' }); eye(g, r * 0.34, -r * 0.1, r * 0.2, r * 0.27, { iris: '#39d0ff' });
      brow(g, -r * 0.6, -r * 0.5, -r * 0.15, -r * 0.35, r * 0.08); brow(g, r * 0.6, -r * 0.5, r * 0.15, -r * 0.35, r * 0.08);
      g.fillStyle = '#7a1633'; ell(0, r * 0.32, r * 0.14, r * 0.18)(g); g.fill(); ink(g, r * 0.06); g.stroke();
    },
  };

  // ---- pickups ----
  function PICK_CHEST(g, body, bodySh, lid, lidSh, band) {
    const r = B * 0.85;
    cel(g, body, poly([[-r, -r * 0.2], [r, -r * 0.2], [r, r * 0.8], [-r, r * 0.8]]), { r, shadow: bodySh, lw: 3, hi: false });
    cel(g, lid, poly([[-r, -r * 0.2], [-r * 0.9, -r * 0.8], [r * 0.9, -r * 0.8], [r, -r * 0.2]]), { r, shadow: lidSh, lw: 3, hi: false });
    g.fillStyle = band; g.fillRect(-r * 0.12, -r * 0.8, r * 0.24, r * 1.6); ink(g, 2); g.strokeRect(-r * 0.12, -r * 0.8, r * 0.24, r * 1.6);
    cel(g, '#fff1a8', circ(0, r * 0.12, r * 0.22), { r: r * 0.22, shadow: '#e0a82a', lw: 2.4, hi: false }); sparkle(g, r * 0.7, -r * 0.95, r * 0.3);
  }
  const PICK = {
    gem: g => { const r = B * 0.7; cel(g, '#39f0ff', poly([[0, -r], [r * 0.75, -r * 0.1], [0, r], [-r * 0.75, -r * 0.1]]), { r, shadow: '#1b9ccf', lw: 3 }); line(g, [[-r * 0.75, -r * 0.1], [r * 0.75, -r * 0.1]], 2.2, '#1b9ccf'); sparkle(g, r * 0.2, -r * 0.4, r * 0.28); },
    coin: g => { const r = B * 0.7; cel(g, '#ffd84d', circ(0, 0, r), { r, shadow: '#d49a1e' }); g.strokeStyle = '#d49a1e'; g.lineWidth = r * 0.12; circ(0, 0, r * 0.66)(g); g.stroke();
      // a music note: Beats
      line(g, [[r * 0.18, r * 0.2], [r * 0.18, -r * 0.45]], r * 0.2); line(g, [[r * 0.18, r * 0.2], [r * 0.18, -r * 0.45]], r * 0.1, '#b9760f');
      g.beginPath(); g.moveTo(r * 0.18, -r * 0.45); g.quadraticCurveTo(r * 0.55, -r * 0.35, r * 0.42, -r * 0.05); ink(g, r * 0.2); g.stroke(); ink(g, r * 0.1, '#b9760f'); g.stroke();
      cel(g, '#b9760f', ell(-r * 0.08, r * 0.22, r * 0.3, r * 0.22, -0.4), { r: r * 0.3, hi: false, lw: 2, shadow: '#7a4a08' }); },
    // Sparkles: a pink four-point star gem
    spark: g => { const r = B * 0.85; cel(g, '#ff7eb6', star(4, r, r * 0.38, 0), { r, shadow: '#c93a8f', lw: 3.2 });
      cel(g, '#ffc2dc', star(4, r * 0.5, r * 0.2, 0), { r: r * 0.5, hi: false, lw: 1.8, shadow: '#ff9ac6' }); sparkle(g, r * 0.5, -r * 0.5, r * 0.25); },
    egg: g => { const r = B * 0.8; cel(g, '#fff4dc', ell(0, 0, r * 0.78, r * 1.0), { r, shadow: '#e0c8a0' }); for (const [x, y, k, col] of [[-0.25, -0.3, 0.18, '#ff9ac0'], [0.28, 0.05, 0.2, '#6fe3ff'], [-0.12, 0.45, 0.15, '#b06cff']]) { g.fillStyle = col; circ(x * r, y * r, k * r)(g); g.fill(); } },
    boxbeat: g => PICK_CHEST(g, '#c9803c', '#8c4f22', '#e09a52', '#a8622b', '#ffd84d'),
    boxspark: g => PICK_CHEST(g, '#a070f0', '#6a3fc4', '#c49aff', '#8a5ae0', '#ff7eb6'),
    chest: g => PICK_CHEST(g, '#c9803c', '#8c4f22', '#e09a52', '#a8622b', '#ffd84d'),
    heal: g => { const r = B * 0.8; const path = gg => { gg.beginPath(); gg.moveTo(0, r * 0.85); gg.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.0, 0, -r * 0.35); gg.bezierCurveTo(r * 0.7, -r * 1.0, r * 1.4, -r * 0.1, 0, r * 0.85); gg.closePath(); };
      cel(g, '#ff5a7e', path, { r, shadow: '#c42a54', hy: -r * 0.2 }); g.fillStyle = '#fff8ec'; g.fillRect(-r * 0.1, -r * 0.3, r * 0.2, r * 0.6); g.fillRect(-r * 0.3, -r * 0.1, r * 0.6, r * 0.2); },
    shield: g => { const r = B * 0.85, path = gg => { gg.beginPath(); gg.moveTo(-r * 0.8, -r * 0.7); gg.quadraticCurveTo(0, -r * 1.05, r * 0.8, -r * 0.7); gg.lineTo(r * 0.8, -r * 0.05); gg.quadraticCurveTo(r * 0.7, r * 0.7, 0, r); gg.quadraticCurveTo(-r * 0.7, r * 0.7, -r * 0.8, -r * 0.05); gg.closePath(); };
      cel(g, '#4fb8ff', path, { r, shadow: '#2a78d6', hy: -r * 0.2 }); cel(g, '#bfe6ff', star(5, r * 0.34, r * 0.15, -Math.PI / 2), { r: r * 0.3, hi: false, lw: 1.6, shadow: '#7fc8ff' }); },
    rage: g => { const r = B * 0.85; cel(g, '#ff9a2e', star(8, r, r * 0.62, 0.2), { r, shadow: '#d6601a', lw: 3 }); cel(g, '#ffe14a', circ(0, 0, r * 0.45), { r: r * 0.45, shadow: '#e0a82a', hi: false, lw: 2 });
      g.fillStyle = '#c42a54'; poly([[-r * 0.1, -r * 0.32], [r * 0.2, -r * 0.05], [0, -r * 0.02], [r * 0.12, r * 0.32], [-r * 0.2, 0], [0, 0]])(g); g.fill(); },
  };

  // ---- weapon pieces (face +x unless upright) ----
  // A small eighth note glyph, used on skills and bubbles.
  function noteGlyph(g, x, y, s, col) {
    const stem = [[x + s * 0.5, y + s * 0.3], [x + s * 0.5, y - s * 1.2]];
    line(g, stem, s * 0.34); line(g, stem, s * 0.16, col);
    g.beginPath(); g.moveTo(x + s * 0.5, y - s * 1.2); g.bezierCurveTo(x + s * 1.5, y - s * 1.0, x + s * 1.3, y - s * 0.2, x + s * 1.0, y + s * 0.1); ink(g, s * 0.34); g.stroke(); ink(g, s * 0.16, col); g.stroke();
    cel(g, col, ell(x, y + s * 0.35, s * 0.62, s * 0.46, -0.4), { r: s * 0.6, lw: s * 0.14, shadow: shade(col, 0.3) });
  }
  // ---- cute animals: the skills (ids stay as save keys) and the pets ----
  // swab = Kitty Paws, dagger = Chick Circle, tower = Cow Choir, dragon = Dove Squad, needle = Hedgehog Quills,
  // stick = Bunny Thump, bubble = Duckling Splash, satellite = Owl Spotlight, maw = Bulldog Chomp.
  const dot = (g, x, y, r) => { g.fillStyle = INK; circ(x, y, r)(g); g.fill(); };
  const smile = (g, x, y, w) => { line(g, [[x - w, y - w * 0.2], [x - w * 0.4, y + w * 0.35], [x, y], [x + w * 0.4, y + w * 0.35], [x + w, y - w * 0.2]], Math.max(2, w * 0.28)); };
  // 02-animal-art: MOOD is read while a critter is baked: 0 normal, 1 blink, 2 alert (wide eyes), 3 happy (^ ^ eyes + open mouth)
  let MOOD = 0;
  const eyes2 = (g, dx, y, rr, iris = '#2d170f') => {
    if (MOOD === 3) { for (const s of [-1, 1]) { g.beginPath(); g.arc(s * dx, y + rr * 0.5, rr * 0.9, Math.PI * 1.1, Math.PI * 1.9); ink(g, Math.max(2.2, rr * 0.36)); g.stroke(); } return; }
    if (MOOD === 7) { for (const s of [-1, 1]) { g.beginPath(); g.arc(s * dx, y - rr * 0.1, rr * 0.9, Math.PI * 0.12, Math.PI * 0.88); ink(g, Math.max(2.2, rr * 0.36)); g.stroke(); line(g, [[s * (dx + rr * 1.2), y - rr * 1.4], [s * (dx - rr * 1.0), y - rr * 2.3]], Math.max(2, rr * 0.3)); } return; }   // 02-animal-art r7: slump face, shut sad eyes under worried brows
    const o = MOOD === 1 ? 0.05 : 1, k = MOOD >= 2 ? 1.22 : 1;
    eye(g, -dx, y, rr * k, rr * 1.15 * k, { iris, open: o, look: [0, MOOD >= 2 ? -0.6 : 0] }); eye(g, dx, y, rr * k, rr * 1.15 * k, { iris, open: o, look: [0, MOOD >= 2 ? -0.6 : 0] });
  };
  // little extra mouth for the alert / happy faces, drawn on top of the face
  function moodMouth(g, r, y) {
    if (MOOD === 3) { cel(g, '#c93a5a', ell(0, y, r * 0.17, r * 0.13), { r: r * 0.15, hi: false, lw: r * 0.06, shadow: '#7a1633' }); }
    else if (MOOD === 2) { cel(g, '#7a1633', ell(0, y, r * 0.07, r * 0.09), { r: r * 0.07, hi: false, lw: r * 0.05, shadow: '#7a1633' }); }
  }
  function critter(g, k, r) {
    if (k === 'chick') {
      for (const s of [-1, 1]) cel(g, '#ffd23a', ell(s * r * 0.98, r * 0.15, r * 0.3, r * 0.46, s * 0.4), { r: r * 0.4, hi: false, lw: r * 0.1, shadow: '#e0a82a' });
      cel(g, '#ffe14a', circ(0, 0, r), { r, shadow: '#e8b52a' });
      for (const a of [-0.35, 0, 0.35]) line(g, [[Math.sin(a) * r * 0.1, -r * 0.92], [Math.sin(a) * r * 0.5, -r * 1.3]], r * 0.12);
      eyes2(g, r * 0.36, -r * 0.1, r * 0.17);
      cel(g, '#ff9a2e', poly([[-r * 0.2, r * 0.12], [r * 0.2, r * 0.12], [0, r * 0.42]]), { r: r * 0.25, hi: false, lw: r * 0.08, shadow: '#d6601a' });
      blush(g, -r * 0.62, r * 0.2, r * 0.18); blush(g, r * 0.62, r * 0.2, r * 0.18);
    } else if (k === 'cow') {
      for (const s of [-1, 1]) { cel(g, '#fff1c9', poly([[s * r * 0.55, -r * 0.7], [s * r * 0.8, -r * 1.2], [s * r * 0.3, -r * 0.9]]), { r: r * 0.3, hi: false, lw: r * 0.09 }); cel(g, '#fffaf0', ell(s * r * 1.0, -r * 0.2, r * 0.36, r * 0.22, s * -0.4), { r: r * 0.3, hi: false, lw: r * 0.1, shadow: '#d9c9b0' }); }
      cel(g, '#fffaf0', circ(0, 0, r), { r, shadow: '#d9c9b0' });
      g.save(); circ(0, 0, r)(g); g.clip(); g.fillStyle = '#3a2d3a'; ell(-r * 0.62, -r * 0.55, r * 0.48, r * 0.4, 0.5)(g); g.fill(); g.restore();
      eyes2(g, r * 0.4, -r * 0.18, r * 0.15);
      cel(g, '#ffb3c7', ell(0, r * 0.42, r * 0.58, r * 0.4), { r: r * 0.5, hi: false, lw: r * 0.09, shadow: '#e88aa6' }); dot(g, -r * 0.2, r * 0.42, r * 0.06); dot(g, r * 0.2, r * 0.42, r * 0.06);
      if (MOOD >= 3) cel(g, '#7a1633', ell(0, r * 0.62, r * 0.26, r * (MOOD === 4 ? 0.2 : 0.12)), { r: r * 0.2, hi: false, lw: r * 0.06, shadow: '#7a1633' });   // MOO
    } else if (k === 'dove') {
      const wf = MOOD === 5 ? [-1.5, -0.5] : MOOD === 6 ? [0.15, 0.45] : [-1.0, -0.1];   // 02-animal-art r3: wing-up / wing-down frames for a real flap
      // 02-animal-art r6: feathered wings (three fanned feathers each, blue-grey tips) instead of one flat blade, plus a tail fan and a head tuft
      const wy = (wf[0] + wf[1]) / 2;
      for (const s of [-1, 1]) {
        const base = Math.atan2(wy * r * 1.1, r * 1.1);   // wing direction: up when wy < 0
        [[0.5, '#cfdcf5', 1.15], [0.2, '#e4ecfb', 1.0], [-0.12, '#ffffff', 0.82]].forEach(([off, col, len]) => {
          const ang = s > 0 ? base + off * 0.8 * Math.sign(wy || 1) : Math.PI - base - off * 0.8 * Math.sign(wy || 1), L = r * len * 0.62, cx = s * r * 0.42 + Math.cos(ang) * L, cy = r * 0.05 + Math.sin(ang) * L;
          cel(g, col, ell(cx, cy, L * 1.05, r * 0.3, ang), { r: r * 0.5, hi: false, lw: r * 0.09, shadow: '#a9bde4' });
        });
      }
      cel(g, '#dfe8fa', poly([[-r * 0.3, r * 0.5], [-r * 0.5, r * 0.98], [-r * 0.12, r * 0.82], [0, r * 1.05], [r * 0.12, r * 0.82], [r * 0.5, r * 0.98], [r * 0.3, r * 0.5]]), { r: r * 0.5, hi: false, lw: r * 0.08, shadow: '#a9bde4' });
      cel(g, '#ffffff', circ(0, r * 0.05, r * 0.72), { r, shadow: '#c9d8f2' });
      for (const a of [-0.28, 0.12]) cel(g, '#ffffff', ell(Math.sin(a) * r * 0.2, -r * 0.8, r * 0.1, r * 0.26, a), { r: r * 0.2, hi: false, lw: r * 0.07, shadow: '#c9d8f2' });   // head tuft
      eyes2(g, r * 0.26, -r * 0.05, r * 0.11);
      cel(g, '#ff9a2e', poly([[-r * 0.14, r * 0.12], [r * 0.14, r * 0.12], [0, r * 0.36]]), { r: r * 0.2, hi: false, lw: r * 0.07, shadow: '#d6601a' });
      blush(g, -r * 0.45, r * 0.2, r * 0.12); blush(g, r * 0.45, r * 0.2, r * 0.12);
    } else if (k === 'hedgehog') {
      g.save(); g.rotate(0.2); if (MOOD === 4) cel(g, '#9a6a44', star(11, r * 1.75, r * 0.95, -Math.PI / 2), { r: r * 1.3, hi: false, lw: r * 0.09, shadow: '#4a301c' });   // puffed quills
      cel(g, '#7a5236', star(11, r * 1.4, r * 0.95, -Math.PI / 2), { r: r * 1.1, hi: false, lw: r * 0.09, shadow: '#4a301c' }); g.restore();
      cel(g, '#f1cfa0', ell(0, r * 0.18, r * 0.85, r * 0.78), { r, shadow: '#d3a672' });
      eyes2(g, r * 0.3, 0, r * 0.14); dot(g, 0, r * 0.3, r * 0.1); smile(g, 0, r * 0.5, r * 0.16);
      blush(g, -r * 0.55, r * 0.3, r * 0.14); blush(g, r * 0.55, r * 0.3, r * 0.14);
    } else if (k === 'duck') {
      cel(g, '#ffe14a', circ(0, 0, r), { r, shadow: '#e8b52a' });
      cel(g, '#ffe14a', ell(0, -r * 0.95, r * 0.12, r * 0.22), { r: r * 0.2, hi: false, lw: r * 0.08 });
      eyes2(g, r * 0.4, -r * 0.2, r * 0.15);
      cel(g, '#ff9a2e', ell(0, r * 0.28, r * 0.5, r * 0.26), { r: r * 0.4, hi: false, lw: r * 0.09, shadow: '#d6601a' }); line(g, [[-r * 0.3, r * 0.28], [r * 0.3, r * 0.28]], r * 0.05);
      blush(g, -r * 0.68, r * 0.1, r * 0.15); blush(g, r * 0.68, r * 0.1, r * 0.15);
    } else if (k === 'owl') {
      for (const s of [-1, 1]) cel(g, '#8a6240', poly([[s * r * 0.3, -r * 0.8], [s * r * 0.95, -r * 1.2], [s * r * 0.85, -r * 0.35]]), { r: r * 0.4, hi: false, lw: r * 0.09, shadow: '#5a3a22' });
      cel(g, '#a8774c', circ(0, 0, r), { r, shadow: '#6e4a2c' });
      cel(g, '#e8cfa6', ell(0, r * 0.42, r * 0.55, r * 0.48), { r: r * 0.5, hi: false, lw: r * 0.08, shadow: '#c9a878' });
      for (const s of [-1, 1]) { cel(g, '#fff6dc', circ(s * r * 0.4, -r * 0.1, r * 0.34), { r: r * 0.34, hi: false, lw: r * 0.09, shadow: '#e6d3a0' }); if (MOOD === 3) { g.beginPath(); g.arc(s * r * 0.4, -r * 0.02, r * 0.18, Math.PI * 1.1, Math.PI * 1.9); ink(g, r * 0.07); g.stroke(); } else eye(g, s * r * 0.4, -r * 0.1, r * (MOOD >= 2 ? 0.25 : 0.2), r * (MOOD >= 2 ? 0.28 : 0.22), { iris: '#2d170f', open: MOOD === 1 ? 0.05 : 1, look: [0, MOOD >= 2 ? -0.5 : 0] }); }
      cel(g, '#ff9a2e', poly([[-r * 0.12, r * 0.08], [r * 0.12, r * 0.08], [0, r * 0.34]]), { r: r * 0.2, hi: false, lw: r * 0.07, shadow: '#d6601a' });
    } else if (k === 'bulldog') {
      for (const s of [-1, 1]) cel(g, '#6b4430', ell(s * r * 0.92, -r * 0.2, r * 0.3, r * 0.55, s * 0.3), { r: r * 0.5, hi: false, lw: r * 0.1, shadow: '#3f261a' });
      cel(g, '#d9a066', circ(0, 0, r), { r, shadow: '#a8703c' });
      cel(g, '#f1d2a4', ell(0, r * 0.42, r * 0.7, r * 0.5), { r: r * 0.6, hi: false, lw: r * 0.09, shadow: '#d3a672' });
      eyes2(g, r * 0.4, -r * 0.25, r * 0.15); dot(g, 0, r * 0.22, r * 0.17);
      line(g, [[-r * 0.45, r * 0.5], [0, r * 0.62], [r * 0.45, r * 0.5]], r * 0.07);
      if (MOOD === 4) {   // CHOMP: open jaw, teeth up top and bottom, pink tongue
        cel(g, '#7a1633', ell(0, r * 0.62, r * 0.55, r * 0.3), { r: r * 0.4, hi: false, lw: r * 0.07, shadow: '#4a0c20' }); cel(g, '#ff7e9a', ell(0, r * 0.74, r * 0.22, r * 0.12), { r: r * 0.15, hi: false, lw: r * 0.04 });
        for (const x of [-0.4, -0.14, 0.14, 0.4]) { cel(g, '#fffaf0', poly([[x * r - r * 0.09, r * 0.4], [x * r + r * 0.09, r * 0.4], [x * r, r * 0.58]]), { r: r * 0.1, hi: false, lw: r * 0.04 }); cel(g, '#fffaf0', poly([[x * r - r * 0.08, r * 0.86], [x * r + r * 0.08, r * 0.86], [x * r, r * 0.7]]), { r: r * 0.1, hi: false, lw: r * 0.04 }); }
      }
      for (const s of [-1, 1]) cel(g, '#fffaf0', poly([[s * r * 0.3, r * 0.55], [s * r * 0.4, r * 0.3], [s * r * 0.2, r * 0.42]]), { r: r * 0.2, hi: false, lw: r * 0.06 });
    } else if (k === 'kitten') {
      if (MOOD === 7) for (const s of [-1, 1]) cel(g, '#ffb56a', poly([[s * r * 0.35, -r * 0.8], [s * r * 1.35, -r * 0.62], [s * r * 0.95, -r * 0.2]]), { r: r * 0.5, hi: false, lw: r * 0.09, shadow: '#d88a3a' });   // r7: ears flat
      else for (const s of [-1, 1]) { cel(g, '#ffb56a', poly([[s * r * 0.35, -r * 0.7], [s * r * 0.95, -r * 1.2], [s * r * 0.95, -r * 0.25]]), { r: r * 0.5, hi: false, lw: r * 0.09, shadow: '#d88a3a' }); cel(g, '#ffc2dc', poly([[s * r * 0.55, -r * 0.7], [s * r * 0.8, -r * 0.95], [s * r * 0.8, -r * 0.45]]), { r: r * 0.2, hi: false, lw: 0.1 }); }
      cel(g, '#ffb56a', circ(0, 0, r), { r, shadow: '#d88a3a' });
      for (const x of [-0.18, 0, 0.18]) line(g, [[x * r, -r * 0.92], [x * r * 1.2, -r * 0.62]], r * 0.07, '#d88a3a');
      eyes2(g, r * 0.38, -r * 0.08, r * 0.16, '#3a8a4a');
      cel(g, '#ff7eb6', poly([[-r * 0.1, r * 0.18], [r * 0.1, r * 0.18], [0, r * 0.3]]), { r: r * 0.1, hi: false, lw: r * 0.05 });
      smile(g, 0, r * 0.42, r * 0.14); for (const s of [-1, 1]) for (const dy of [0, 0.12]) line(g, [[s * r * 0.5, r * (0.3 + dy)], [s * r * 1.05, r * (0.22 + dy * 2)]], r * 0.04);
      blush(g, -r * 0.62, r * 0.28, r * 0.15); blush(g, r * 0.62, r * 0.28, r * 0.15);
    } else if (k === 'puppy') {
      for (const s of [-1, 1]) cel(g, '#8a5a3a', MOOD === 7 ? ell(s * r * 0.97, r * 0.42, r * 0.3, r * 0.74, s * 0.08) : ell(s * r * 0.92, r * 0.05, r * 0.32, r * 0.6, s * 0.15), { r: r * 0.5, hi: false, lw: r * 0.1, shadow: '#5a3822' });   // r7: ears hang when slumped
      cel(g, '#f6e2c4', circ(0, 0, r), { r, shadow: '#d3b88c' });
      g.save(); circ(0, 0, r)(g); g.clip(); g.fillStyle = '#8a5a3a'; ell(r * 0.55, -r * 0.5, r * 0.4, r * 0.34, 0.4)(g); g.fill(); g.restore();
      eyes2(g, r * 0.36, -r * 0.1, r * 0.15); cel(g, '#2d1a14', ell(0, r * 0.2, r * 0.2, r * 0.15), { r: r * 0.2, hi: false, lw: r * 0.06 });
      if (MOOD === 7) line(g, [[-r * 0.2, r * 0.52], [-r * 0.08, r * 0.42], [r * 0.08, r * 0.42], [r * 0.2, r * 0.52]], r * 0.06);
      else { smile(g, 0, r * 0.42, r * 0.2); cel(g, '#ff7e9a', ell(0, r * 0.6, r * 0.12, r * 0.18), { r: r * 0.15, hi: false, lw: r * 0.06 }); }
      blush(g, -r * 0.62, r * 0.25, r * 0.14); blush(g, r * 0.62, r * 0.25, r * 0.14);
    } else if (k === 'piglet') {
      for (const s of [-1, 1]) cel(g, '#ff9ac0', poly([[s * r * 0.35, -r * 0.75], [s * r * 1.0, -r * 1.0], [s * r * 0.95, -r * 0.3]]), { r: r * 0.45, hi: false, lw: r * 0.09, shadow: '#d9648f' });
      cel(g, '#ffb3cf', circ(0, 0, r), { r, shadow: '#e07aa3' });
      eyes2(g, r * 0.4, -r * 0.2, r * 0.14);
      cel(g, '#ff8fb8', ell(0, r * 0.32, r * 0.42, r * 0.3), { r: r * 0.4, hi: false, lw: r * 0.09, shadow: '#d9648f' }); dot(g, -r * 0.14, r * 0.32, r * 0.055); dot(g, r * 0.14, r * 0.32, r * 0.055);
      blush(g, -r * 0.7, r * 0.15, r * 0.16); blush(g, r * 0.7, r * 0.15, r * 0.16);
    } else if (k === 'lamb') {
      for (const [x, y] of [[-0.8, -0.4], [-0.5, -0.85], [0, -1.0], [0.5, -0.85], [0.8, -0.4], [-0.85, 0.2], [0.85, 0.2]]) cel(g, '#fffaf0', circ(x * r, y * r, r * 0.4), { r: r * 0.4, hi: false, lw: r * 0.08, shadow: '#d8ccd8' });
      for (const s of [-1, 1]) cel(g, '#5a4a5a', ell(s * r * 0.95, r * 0.25, r * 0.3, r * 0.14, s * 0.4), { r: r * 0.3, hi: false, lw: r * 0.08 });
      cel(g, '#fffaf0', circ(0, -r * 0.4, r * 0.4), { r: r * 0.4, hi: false, lw: r * 0.08, shadow: '#d8ccd8' });
      cel(g, '#6a5668', ell(0, r * 0.15, r * 0.62, r * 0.72), { r, shadow: '#443748' });
      eyes2(g, r * 0.26, r * 0.02, r * 0.13, '#2d170f'); dot(g, 0, r * 0.3, r * 0.07); smile(g, 0, r * 0.42, r * 0.12);
      blush(g, -r * 0.42, r * 0.28, r * 0.1, '#ff9ac0'); blush(g, r * 0.42, r * 0.28, r * 0.1, '#ff9ac0');
    } else if (k === 'hamster') {
      for (const s of [-1, 1]) cel(g, '#e8b878', circ(s * r * 0.7, -r * 0.75, r * 0.3), { r: r * 0.3, hi: false, lw: r * 0.09, shadow: '#b88848' });
      cel(g, '#f0c48c', ell(0, 0, r * 1.05, r * 0.92), { r, shadow: '#c8935a' });
      cel(g, '#fff4e0', ell(0, r * 0.35, r * 0.7, r * 0.5), { r: r * 0.6, hi: false, lw: r * 0.08, shadow: '#e6d3b0' });
      eyes2(g, r * 0.38, -r * 0.15, r * 0.13); cel(g, '#ff9ab0', poly([[-r * 0.09, r * 0.12], [r * 0.09, r * 0.12], [0, r * 0.22]]), { r: r * 0.1, hi: false, lw: r * 0.05 }); smile(g, 0, r * 0.38, r * 0.14);
      blush(g, -r * 0.7, r * 0.2, r * 0.17); blush(g, r * 0.7, r * 0.2, r * 0.17);
    } else if (k === 'turtle' && MOOD === 7) {   // r7: it pulls its head and feet into the shell, only two eyes glint in the dark gap
      cel(g, '#4a9a42', ell(0, r * 0.62, r * 0.62, r * 0.2), { r: r * 0.3, hi: false, lw: r * 0.07, shadow: '#2f6e2c' });
      cel(g, '#2a2036', ell(0, r * 0.52, r * 0.5, r * 0.2), { r: r * 0.3, hi: false, lw: r * 0.07, shadow: '#1a1224' });
      for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(s * r * 0.2, r * 0.5, r * 0.07, r * 0.09, 0, 0, TAU); g.fill(); g.fillStyle = INK; g.beginPath(); g.arc(s * r * 0.2, r * 0.52, r * 0.04, 0, TAU); g.fill(); }
      cel(g, '#6fbf5a', ell(0, -r * 0.12, r * 1.0, r * 0.82), { r, shadow: '#3f8a3a' });
      for (const [x, y] of [[0, -0.5], [-0.5, -0.12], [0.5, -0.12], [-0.25, 0.28], [0.25, 0.28]]) cel(g, '#8fd878', circ(x * r, (y - 0.15) * r, r * 0.2), { r: r * 0.2, hi: false, lw: r * 0.07, shadow: '#5ab04a' });
    } else if (k === 'turtle') {
      cel(g, '#6fbf5a', circ(0, -r * 0.1, r * 0.95), { r, shadow: '#3f8a3a' });
      for (const [x, y] of [[0, -0.5], [-0.5, -0.1], [0.5, -0.1], [-0.25, 0.3], [0.25, 0.3]]) cel(g, '#8fd878', circ(x * r, (y - 0.15) * r, r * 0.22), { r: r * 0.22, hi: false, lw: r * 0.07, shadow: '#5ab04a' });
      cel(g, '#bfe38a', circ(0, r * 0.5, r * 0.45), { r: r * 0.45, shadow: '#8ab858' });
      eyes2(g, r * 0.2, r * 0.44, r * 0.1); smile(g, 0, r * 0.66, r * 0.1);
      blush(g, -r * 0.36, r * 0.62, r * 0.08); blush(g, r * 0.36, r * 0.62, r * 0.08);
    }
  }
  function pawPrint(g, r, col, shadow) {
    cel(g, col, ell(0, r * 0.28, r * 0.5, r * 0.42), { r: r * 0.5, hi: false, lw: r * 0.07, shadow });
    for (const [x, y, s] of [[-0.62, -0.15, 0.2], [-0.22, -0.52, 0.22], [0.22, -0.52, 0.22], [0.62, -0.15, 0.2]]) cel(g, col, ell(x * r, y * r, r * s, r * s * 1.15, x * 0.5), { r: r * 0.2, hi: false, lw: r * 0.06, shadow });
  }
  const WPN = {
    swab: g => { const r = B * 1.35;   // a glowing pad with a big paw print
      g.fillStyle = 'rgba(255,170,210,.32)'; circ(0, 0, r)(g); g.fill();
      for (const [k, col] of [[0.98, '#ff9ac6'], [0.76, '#ffc2dc']]) { g.strokeStyle = col; g.lineWidth = r * 0.06; circ(0, 0, r * k)(g); g.stroke(); }
      pawPrint(g, r * 0.72, '#ffe3f0', '#ff9ac6'); },
    dagger: g => { critter(g, 'chick', B * 0.8); },
    needle: g => { const r = B;   // 02-animal-art r3: a silver sewing needle, gold eye, a pink thread that curls behind it (+x is the tip)
      line(g, [[-r * 0.9, 0], [-r * 1.25, r * 0.28], [-r * 1.7, -r * 0.12], [-r * 2.05, r * 0.2]], r * 0.34, INK); line(g, [[-r * 0.9, 0], [-r * 1.25, r * 0.28], [-r * 1.7, -r * 0.12], [-r * 2.05, r * 0.2]], r * 0.16, '#ff7eb6');
      cel(g, '#e9eefc', poly([[r * 1.55, 0], [r * 1.0, -r * 0.2], [-r * 1.0, -r * 0.22], [-r * 1.0, r * 0.22], [r * 1.0, r * 0.2]]), { r: r * 0.7, hi: false, lw: 2.6, shadow: '#9fb0d8' });
      g.save(); g.globalAlpha = 0.85; line(g, [[-r * 0.1, -r * 0.1], [r * 1.0, -r * 0.1]], r * 0.07, '#fff'); g.restore();
      cel(g, '#ffd84d', ell(-r * 0.78, 0, r * 0.2, r * 0.12), { r: r * 0.2, hi: false, lw: 1.8, shadow: '#d49a1e' });
      g.fillStyle = '#7a4a2a'; ell(-r * 0.78, 0, r * 0.1, r * 0.05)(g); g.fill();
      sparkle(g, r * 1.5, -r * 0.12, r * 0.3); },
    stick: g => { const r = B;   // a fluffy bunny leg ending in a big foot with toe beans (+x)
      line(g, [[-r * 2, 0], [r * 1.0, 0]], r * 0.6); line(g, [[-r * 2, 0], [r * 1.0, 0]], r * 0.42, '#fffaf0');
      cel(g, '#fffaf0', ell(r * 1.4, 0, r * 0.7, r * 0.5), { r: r * 0.6, hi: false, lw: 3, shadow: '#d8ccd8' });
      for (const y of [-0.22, 0, 0.22]) cel(g, '#ffb3cf', circ(r * 1.75, y * r, r * 0.12), { r: r * 0.12, hi: false, lw: 1.6 });
      cel(g, '#ffb3cf', ell(r * 1.3, 0, r * 0.24, r * 0.3), { r: r * 0.24, hi: false, lw: 1.8 }); },
    tower: g => { const r = B * 0.95; critter(g, 'cow', r);   // 02-animal-art r3: a ribbon and a golden bell, it is a stage cow after all
      cel(g, '#ff7eb6', poly([[-r * 0.62, r * 0.78], [r * 0.62, r * 0.78], [r * 0.5, r * 0.98], [-r * 0.5, r * 0.98]]), { r: r * 0.3, hi: false, lw: r * 0.08, shadow: '#c93a8f' });
      cel(g, '#ffd84d', circ(0, r * 1.1, r * 0.2), { r: r * 0.2, hi: false, lw: r * 0.07, shadow: '#d49a1e' });
      g.strokeStyle = '#8a5a12'; g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(-r * 0.15, r * 1.12); g.lineTo(r * 0.15, r * 1.12); g.stroke(); },
    dragon: g => { critter(g, 'dove', B * 0.7); },
    bubble: g => { const r = B * 0.95; critter(g, 'duck', r * 0.55);   // a soap bubble with a rainbow rim and a shine
      const bg = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r); bg.addColorStop(0, 'rgba(255,255,255,.35)'); bg.addColorStop(0.7, 'rgba(190,235,255,.22)'); bg.addColorStop(1, 'rgba(255,170,230,.38)');
      g.fillStyle = bg; circ(0, 0, r)(g); g.fill(); ink(g, 4); g.stroke();
      g.strokeStyle = 'rgba(255,150,220,.7)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r * 0.9, 0.3, 1.5); g.stroke(); g.strokeStyle = 'rgba(120,230,255,.8)'; g.beginPath(); g.arc(0, 0, r * 0.9, 2.6, 3.7); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, r * 0.8, -2.5, -1.2); g.stroke();
      g.fillStyle = '#fff'; circ(r * 0.5, -r * 0.5, r * 0.07)(g); g.fill(); circ(r * 0.62, -r * 0.34, r * 0.04)(g); g.fill(); },
    hog: g => { critter(g, 'hedgehog', B * 0.8); },
    perch: g => { critter(g, 'owl', B * 0.95); },
    satellite: g => { const r = B * 0.9;
      { const cg = g.createLinearGradient(r * 0.3, 0, r * 1.7, 0); cg.addColorStop(0, 'rgba(255,246,170,.95)'); cg.addColorStop(0.6, 'rgba(255,226,110,.55)'); cg.addColorStop(1, 'rgba(255,200,90,.12)');   // 02-animal-art r3: a warm beam, a lamp, a glint
        g.fillStyle = cg; g.beginPath(); g.moveTo(r * 0.3, -r * 0.22); g.lineTo(r * 1.7, -r * 1.05); g.lineTo(r * 1.7, r * 1.05); g.lineTo(r * 0.3, r * 0.22); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(r * 0.4, -r * 0.2); g.lineTo(r * 1.6, -r * 0.95); g.stroke();
        cel(g, '#59607f', poly([[r * 0.15, -r * 0.3], [r * 0.5, -r * 0.4], [r * 0.5, r * 0.4], [r * 0.15, r * 0.3]]), { r: r * 0.3, hi: false, lw: 2, shadow: '#363b55' });
        cel(g, '#fff6c0', ell(r * 0.5, 0, r * 0.07, r * 0.36), { r: r * 0.2, hi: false, lw: 1.4, shadow: '#ffe14a' }); sparkle(g, r * 1.35, -r * 0.55, r * 0.22, '#fffbe0'); }
      g.save(); g.translate(-r * 0.35, 0); critter(g, 'owl', r * 0.75); g.restore(); },
    maw: g => { critter(g, 'bulldog', B * 1.0); },
  };
  // happy / alert mouths sit where each face has room; petAcc adds a tiny accessory per pet
  function petMood(g, k, r) {
    if (MOOD < 2) return;
    const y = { kitten: 0.46, puppy: 0.5, piglet: 0.55, lamb: 0.5, hamster: 0.5, turtle: 0.74 }[k] || 0.5;
    if (k === 'puppy') return;   // the puppy already has a tongue
    moodMouth(g, r, r * y);
  }
  function petAcc(g, k, r) {
    if (k === 'kitten') {   // a pink bow on one ear
      g.save(); g.translate(-r * 0.78, -r * 0.82); g.rotate(-0.4);
      for (const s of [-1, 1]) cel(g, '#ff7eb6', poly([[0, 0], [s * r * 0.42, -r * 0.26], [s * r * 0.42, r * 0.26]]), { r: r * 0.3, hi: false, lw: r * 0.06, shadow: '#c93a8f' });
      cel(g, '#ffc2dc', circ(0, 0, r * 0.12), { r: r * 0.12, hi: false, lw: r * 0.05, shadow: '#ff9ac6' }); g.restore();
    } else if (k === 'puppy') {   // a collar with a golden bell
      g.save(); g.beginPath(); g.arc(0, r * 0.2, r * 1.0, 0.95, Math.PI - 0.95); ink(g, r * 0.22); g.stroke(); ink(g, r * 0.12, '#6fe3ff'); g.stroke(); g.restore();
      cel(g, '#ffd84d', circ(0, r * 1.12, r * 0.15), { r: r * 0.15, lw: r * 0.05, shadow: '#d49a1e' });
    } else if (k === 'lamb') {   // a daisy
      g.save(); g.translate(r * 0.55, -r * 0.62);
      for (let i = 0; i < 5; i++) { g.save(); g.rotate(i / 5 * TAU); cel(g, '#fffaf0', ell(0, -r * 0.17, r * 0.1, r * 0.16), { r: r * 0.12, hi: false, lw: r * 0.04, shadow: '#e0d4e0' }); g.restore(); }
      cel(g, '#ffd84d', circ(0, 0, r * 0.1), { r: r * 0.1, hi: false, lw: r * 0.04, shadow: '#d49a1e' }); g.restore();
    } else if (k === 'piglet') {   // a tiny curly tail-bow on the ear: a heart
      g.save(); g.translate(r * 0.72, -r * 0.7); g.scale(r * 0.012, r * 0.012);
      g.beginPath(); g.moveTo(0, 10); g.bezierCurveTo(-20, -6, -8, -18, 0, -6); g.bezierCurveTo(8, -18, 20, -6, 0, 10); g.closePath(); g.fillStyle = '#ff5a7e'; g.fill(); ink(g, 3.4); g.stroke(); g.restore();
    } else if (k === 'hamster') {   // a sunflower seed in the cheek
      cel(g, '#3a2d3a', ell(r * 0.5, r * 0.62, r * 0.14, r * 0.07, -0.5), { r: r * 0.1, hi: false, lw: r * 0.04, shadow: '#1a141c' });
      g.beginPath(); g.arc(0, -r * 0.1, r * 1.0, Math.PI * 1.08, Math.PI * 1.92); ink(g, r * 0.16); g.stroke(); ink(g, r * 0.08, '#ff7eb6'); g.stroke();   // little headphones
      for (const s of [-1, 1]) cel(g, '#ff7eb6', ell(s * r * 0.98, -r * 0.1, r * 0.14, r * 0.24), { r: r * 0.2, hi: false, lw: r * 0.05, shadow: '#c93a8f' });
    } else if (k === 'turtle') {   // a leaf hat
      g.save(); g.translate(0, -r * 1.02); g.rotate(-0.3); cel(g, '#8fd878', ell(0, 0, r * 0.3, r * 0.14), { r: r * 0.2, lw: r * 0.05, shadow: '#3f8a3a' }); g.restore();
    }
  }
  function featherFn(g) {
    const r = B * 0.5; g.rotate(-0.6);
    cel(g, '#ffffff', ell(0, 0, r * 0.3, r * 0.9), { r: r * 0.5, hi: false, lw: 2, shadow: '#c9d8f2' });
    line(g, [[0, -r * 0.8], [0, r * 0.8]], 1.6, '#9fb4dc');
  }
  const PETSPR = { kitten: 'kitten', puppy: 'puppy', piglet: 'piglet', lamb: 'lamb', hamster: 'hamster', turtle: 'turtle' };

  // ---- shots: music notes (sound is the currency of this world) ----
  function noteFn(col, crit) {
    return g => {
      const r = B * 0.55;
      const stem = [[r * 0.5, r * 0.3], [r * 0.5, -r * 1.2]];
      line(g, stem, r * 0.34); line(g, stem, r * 0.16, col);
      g.beginPath(); g.moveTo(r * 0.5, -r * 1.2); g.bezierCurveTo(r * 1.5, -r * 1.0, r * 1.3, -r * 0.2, r * 1.0, r * 0.1); ink(g, r * 0.34); g.stroke(); ink(g, r * 0.16, col); g.stroke();
      cel(g, col, ell(0, r * 0.35, r * 0.62, r * 0.46, -0.4), { r: r * 0.6, lw: r * 0.14, shadow: shade(col, 0.3) });
      if (crit) sparkle(g, -r * 0.7, -r * 0.7, r * 0.55, '#fff8ec');
    };
  }
  function acidFn(g) { const r = B * 0.55; cel(g, '#8dff6a', circ(0, 0, r), { r, shadow: '#43b83a' }); fangsMouth(g, 0, r * 0.12, r * 0.28, 0.2, '#2f7a2a'); eye(g, -r * 0.3, -r * 0.3, r * 0.14, r * 0.18, { iris: '#2d170f' }); eye(g, r * 0.3, -r * 0.3, r * 0.14, r * 0.18, { iris: '#2d170f' }); }

  const BODY_MEMO = Object.create(null);
  const SPR = {
    body: (skin, boss, kind) => {   // called for every cell every frame: remember the sprite per (skin, boss, kind) instead of building the key string
      const kk = kind || '', slot = boss ? 1 : 0;
      let bs = BODY_MEMO[skin]; if (!bs) bs = BODY_MEMO[skin] = [{}, {}];
      let sp = bs[slot][kk];
      if (sp === undefined) { sp = bake(`body|${skin}|${slot}|${kk}`, B * 3.2, B * 3.2, bodyFn(skin, boss, kind)); if (sp) bs[slot][kk] = sp; }
      return sp;
    },
    minion: id => bake('min|' + id, B * 3.4, B * 3.4, MIN[id] || MIN.green),
    pickup: k => bake('pk|' + k, B * 2.4, B * 2.4, PICK[k] || PICK.gem),
    note: crit => bake('note|' + (crit ? 1 : 0), B * 2.4, B * 2.4, noteFn(crit ? '#ffd84d' : '#6fe3ff', crit), 1),
    dazed: skin => { const k = SPECIES[skin] ? skin : 'love', P = SPECIES[k]; return bake('dazed|' + k, B * 3.4, B * 3.4, g => { cellShape(g, P, B, { decor: false }); pattern(g, P, k, B); EF.dazed(g, B, P); }, 2); },   // 01-enemy-art r7: the face that pops out of a killed head
    tail: skin => { const k = SPECIES[skin] ? skin : 'love'; return EF.tailSpr(k, SPECIES[k], B); },
    acid: () => bake('acid', B * 1.6, B * 1.6, acidFn),
    pet: (id, mood = 0) => bake('pet|' + id + '|' + mood, B * 3, B * 3, g => { MOOD = mood; critter(g, PETSPR[id] || 'kitten', B * 0.9); petMood(g, PETSPR[id] || 'kitten', B * 0.9); petAcc(g, PETSPR[id] || 'kitten', B * 0.9); MOOD = 0; }, 1),
    // round discs that read on any cell colour: coin (gold cell), shield (ward cell), moon (lullaby cell)
    badge: k => bake('badge|' + k, B * 1.5, B * 1.5, g => {
      const r = B * 0.6, disc = (col, sh) => { cel(g, '#fff8ec', circ(0, 0, r), { r, hi: false, lw: 2.6, shadow: '#e6d6c8' }); cel(g, col, circ(0, 0, r * 0.84), { r: r * 0.84, hi: false, lw: 2.2, shadow: sh }); };
      if (k === 'coin') { disc('#ffd84d', '#d49a1e'); g.save(); g.scale(0.58, 0.58); PICK.coin(g); g.restore(); return; }
      if (k === 'coinx') { disc('#b9ad82', '#8a7f5a'); g.save(); g.scale(0.58, 0.58); PICK.coin(g); g.restore(); g.fillStyle = 'rgba(120,110,80,.55)'; circ(0, 0, r * 0.84)(g); g.fill(); line(g, [[-r * 0.05, -r * 0.8], [r * 0.18, -r * 0.2], [-r * 0.12, r * 0.1], [r * 0.14, r * 0.8]], r * 0.1, '#3a2f1c'); return; }   // 01-enemy-art r5: the gold has run out, a dull coin with a crack
      if (k === 'ward') {
        disc('#2b3f78', '#1b2a55'); const q = r * 0.44;
        cel(g, '#8fe3ff', poly([[-q, -q * 0.8], [q, -q * 0.8], [q, q * 0.1], [q * 0.8, q * 0.7], [0, q * 1.2], [-q * 0.8, q * 0.7], [-q, q * 0.1]]), { r: q * 1.2, hi: false, lw: 2, shadow: '#3fa8d8' });
        line(g, [[-q * 0.45, q * 0.05], [-q * 0.1, q * 0.45], [q * 0.5, -q * 0.35]], r * 0.17, '#fff'); return;
      }
      disc('#4a3590', '#2f2166');   // lullaby: crescent moon, a star and a z on a night disc
      g.beginPath(); g.arc(-r * 0.1, 0, r * 0.5, 0.55, TAU - 0.55); g.arc(r * 0.12, -r * 0.08, r * 0.4, TAU - 0.85, 0.85, true); g.closePath(); g.fillStyle = '#e6dcff'; g.fill(); ink(g, 1.6); g.stroke();
      sparkle(g, r * 0.42, -r * 0.36, r * 0.24, '#fff8ec'); text2(g, 'z', r * 0.36, r * 0.4, r * 0.34);
    }, 2),
    frost: () => bake('frost', B * 2.6, B * 2.6, g => {
      const r = B * 0.95; g.fillStyle = 'rgba(150,215,255,.55)'; circ(0, 0, r)(g); g.fill(); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4.5; g.stroke(); g.strokeStyle = 'rgba(70,150,230,.8)'; g.lineWidth = 1.8; circ(0, 0, r * 0.82)(g); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * 0.7, -r * 0.2); g.lineTo(-r * 0.25, -r * 0.05); g.lineTo(-r * 0.15, -r * 0.5); g.moveTo(r * 0.7, r * 0.3); g.lineTo(r * 0.3, r * 0.1); g.stroke();
      for (const [x, y, a] of [[-0.6, 0.78, 0], [0, 0.95, 0], [0.6, 0.78, 0]]) cel(g, '#e6f8ff', poly([[x * r - r * 0.11, y * r - r * 0.12], [x * r + r * 0.11, y * r - r * 0.12], [x * r, y * r + r * (x ? 0.28 : 0.4)]]), { r: r * 0.3, hi: false, lw: 1.8, shadow: '#7fc8ee' });
    }, 1),
    paw: () => bake('paw', B * 1.2, B * 1.2, g => { g.globalAlpha = 0.9; pawPrint(g, B * 0.42, '#ffffff', '#ffb3d6'); }, 1),
    feather: () => bake('feather', B * 1.4, B * 1.4, featherFn, 1),
    weapon: (id, mood = 0) => mood ? bake('wpn|' + id + '|' + mood, B * 4.6, B * 3.4, g => { MOOD = mood; (WPN[id] || WPN.dagger)(g); MOOD = 0; }, 1) : bake('wpn|' + id, B * 4.6, B * 3.4, WPN[id] || WPN.dagger, 1),
  };
  // steady frames look sprites up by value: the key string and the bake closure are only built the first time (cache.clear drops these too)
  const memo = new Map();
  let gen = 0;   // bumps whenever the baked sprites are dropped, so callers that remember a sprite know to look it up again
  { const clr = cache.clear.bind(cache); cache.clear = () => { clr(); memo.clear(); gen++; }; }
  const sprMemo = (tag, a, b, fn, x, y, z) => {
    let m = memo.get(tag); if (!m) memo.set(tag, m = new Map());
    let n = m.get(a); if (!n) m.set(a, n = new Map());
    let v = n.get(b); if (v === undefined) { v = fn(x, y, z); n.set(b, v === undefined ? null : v); }
    return v;
  };
  { const body = SPR.body, minion = SPR.minion, pickup = SPR.pickup, note = SPR.note, pet = SPR.pet, weapon = SPR.weapon;
    SPR.body = (skin, boss, kind) => sprMemo(boss ? 'bodyB' : 'body', skin, kind || '', body, skin, boss, kind);
    SPR.minion = id => sprMemo('min', id, 0, minion, id);
    SPR.pickup = k => sprMemo('pk', k, 0, pickup, k);
    SPR.note = crit => sprMemo('note', !!crit, 0, note, crit);
    SPR.pet = (id, mood = 0) => sprMemo('pet', id, mood, pet, id, mood);
    SPR.weapon = (id, mood = 0) => sprMemo('wpn', id, mood, weapon, id, mood);
  }

  // blit a baked sprite centred at (x, y), `size` wide, optional rotation / flip
  function blit(g, spr, x, y, size, rot = 0, flip = false, alpha = 1) {
    if (!spr) return false;
    const k = size / spr.w;
    g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flip) g.scale(-1, 1); if (alpha !== 1) g.globalAlpha *= alpha;
    g.drawImage(spr.c, -spr.w * k / 2, -spr.h * k / 2, spr.w * k, spr.h * k); g.restore(); return true;
  }

  // live head: body and feelers rotate with the snake, the FACE stays upright and looks at the player.
  const headBody = (skin, P, R) => bake('headbody|' + (SPECIES[skin] ? skin : 'love'), B * 3.4, B * 3.4, gg => { cellShape(gg, P, R, { decor: false }); pattern(gg, P, skin, R); }, 3);
  function drawHead(g, x, y, r, ang, o = {}) {
    const P = SPECIES[o.skin] || SPECIES.love, boss = !!o.boss, t = o.t || 0, R = B;
    g.save(); g.translate(x, y); g.scale(r / B, r / B);
    // squash when hit, stretch when it surges (along its heading), tremble before the surge
    let sq = 0; if (o.flash > 0) sq = -Math.min(1, o.flash / 0.12) * 0.16; if (o.sg === 'go') sq += 0.15; else if (o.sg === 'warn') sq -= 0.05 + Math.sin(t * 40) * 0.04;
    if (sq) { g.rotate(ang); g.scale(1 + sq, 1 - sq * 0.8); g.rotate(-ang); }
    if (boss && o.p2) p2Halo(g, R, t);
    if (o.sg === 'go' || (o.sg === 'warn' && boss && o.p2)) dashSpikes(g, R, ang, t, boss && !!o.p2, o.sg === 'warn', o.skin);
    if (!boss && (o.sg === 'go' || o.sg === 'warn')) EF.surgeRing(g, R, P, t, o.sg === 'warn');   // 01-enemy-art r7: the surge ring wears the species colours
    // the body never animates, only its heading: baked once per species at heading 0 and blitted rotated (cellShape + pattern cost ~15 clips and ~100 paths a head)
    const bodySpr = sprMemo('headbody', SPECIES[o.skin] ? o.skin : 'love', 0, headBody, o.skin, P, R);
    if (bodySpr) { g.save(); g.rotate(ang); g.drawImage(bodySpr.c, -bodySpr.w / 2, -bodySpr.h / 2, bodySpr.w, bodySpr.h); g.restore(); }
    else { g.save(); g.rotate(ang); cellShape(g, P, R, { decor: false }); pattern(g, P, o.skin, R); g.restore(); }
    glossDot(g, R, 0.46, -0.5);
    if (boss && o.p2) blit(g, bake('p2crack', B * 2.6, B * 2.6, p2CrackPaint), 0, 0, B * 2.6, 0, false, 0.75 + Math.sin(t * 9) * 0.25);
    if (boss) { bossRing(g, R, t, BOSS_METAL[o.skin]); blit(g, bake('bossorn|' + o.skin, B * 5, B * 5, gg => bossOrn(gg, B, o.skin, -1, P)), 0, 0, B * 5); bossLive(g, R, t, o.skin, !!o.p2); }
    // headgear (upright, on top of the head)
    const top = -R * 0.92, sw = Math.sin(t * 5) * R * 0.1;
    if (boss) {   // a cute little crown with jewels, tip pearls and a shine (static shape: baked once per species, only the bob moves)
      const bob = Math.sin(t * 3) * R * 0.02, cm = BOSS_METAL[o.skin] || ['#ffd84d', '#d98f1a'];
      hatSprite(g, 'crown|' + R + '|' + cm[0], R, c => crownPaint(c, R, top + R * 0.05, cm), 0, bob);
    } else if (P.hat === 'antenna' || P.hat === 'hearts') {
      for (const s of [-1, 1]) {
        line(g, [[s * R * 0.35, top + R * 0.1], [s * R * 0.6, top - R * 0.4 + sw * s], [s * R * 0.75, top - R * 0.7 + sw * s]], R * 0.14); line(g, [[s * R * 0.35, top + R * 0.1], [s * R * 0.6, top - R * 0.4 + sw * s], [s * R * 0.75, top - R * 0.7 + sw * s]], R * 0.07, P.base);
        if (P.hat === 'hearts') cel(g, '#ff7eb6', heartPath(s * R * 0.78, top - R * 0.78 + sw * s, R * 0.2), { r: R * 0.22, hi: false, lw: 2.2, shadow: '#d9488f' });
        else cel(g, P.acc, circ(s * R * 0.78, top - R * 0.78 + sw * s, R * 0.17), { r: R * 0.17, hi: false, lw: 2.2, shadow: shade(P.acc) });
      }
    } else if (P.hat === 'horns') {
      hatSprite(g, 'horns|' + R + P.acc, R, c => { for (const s of [-1, 1]) cel(c, P.acc, poly([[s * R * 0.25, top + R * 0.15], [s * R * 0.75, top - R * 0.55], [s * R * 0.62, top + R * 0.3]]), { r: R * 0.5, hi: false, lw: 2.8, shadow: shade(P.acc) }); });
    } else if (P.hat === 'cap') {   // a nightcap with a pompom
      cel(g, P.acc, poly([[-R * 0.6, top + R * 0.25], [R * 0.6, top + R * 0.25], [R * 0.3, top - R * 0.35], [R * 0.95, top - R * 0.2 + sw], [R * 0.1, top - R * 0.55]]), { r: R * 0.7, hi: false, lw: 3, shadow: shade(P.acc) });
      cel(g, '#fff8ec', circ(R * 0.95, top - R * 0.2 + sw, R * 0.16), { r: R * 0.16, hi: false, lw: 2, shadow: '#e6d6c8' });
    } else if (P.hat === 'spikes') {
      hatSprite(g, 'spikes|' + R + P.acc, R, c => { for (let i = -2; i <= 2; i++) cel(c, P.acc, poly([[i * R * 0.28 - R * 0.13, top + R * 0.25 - Math.abs(i) * R * 0.05], [i * R * 0.28 + R * 0.13, top + R * 0.25 - Math.abs(i) * R * 0.05], [i * R * 0.3, top - R * (0.35 - Math.abs(i) * 0.06)]]), { r: R * 0.3, hi: false, lw: 2.2, shadow: shade(P.acc) }); });
    }
    // the face stays upright and looks at the player
    g.translate(Math.cos(ang) * R * 0.18 + (o.look ? o.look[0] * R * 0.1 : 0), Math.sin(ang) * R * 0.18 - R * 0.04 + (o.look ? o.look[1] * R * 0.06 : 0));
    const hurt = o.flash > 0.02, open = (hurt || (t % 3.7) > 3.55 || (t % 9.1) > 8.78 && (t % 9.1) < 8.9) ? 0.1 : 1, look = o.look || [Math.sin(t * 0.8) * 0.5, Math.cos(t * 0.55) * 0.3],
      tongue = (t % 7) > 5.2 && (t % 7) < 5.9, sneezing = (t % 6) > 5.1, iris = boss ? '#ff3d5a' : P.eye;
    const eo = o.sg === 'warn' ? open * 0.72 : o.sg === 'go' ? Math.min(1.12, open * 1.12) : open;
    const E = (ex, ey, rx, ry) => eye(g, ex, ey, rx, ry, { iris, look, open: eo });
    const squint = (ex, dir) => line(g, [[ex - dir * R * 0.2, -R * 0.26], [ex + dir * R * 0.12, -R * 0.1], [ex - dir * R * 0.2, R * 0.06]], R * 0.1);
    const f = P.face;
    if (f === 'love') {
      for (const s of [-1, 1]) { cel(g, '#ff3d7a', heartPath(s * R * 0.36, -R * 0.1, R * 0.22), { r: R * 0.24, hi: false, lw: 2.4, shadow: '#c42a54' }); g.fillStyle = '#fff'; circ(s * R * 0.3, -R * 0.2, R * 0.05)(g); g.fill(); }
      blush(g, -R * 0.62, R * 0.2, R * 0.16); blush(g, R * 0.62, R * 0.2, R * 0.16);
      g.beginPath(); g.arc(0, R * 0.28, R * 0.2, 0.2, Math.PI - 0.2); ink(g, R * 0.08); g.stroke();
    } else if (f === 'goggles') {
      E(-R * 0.36, -R * 0.1, R * 0.2, R * 0.24); E(R * 0.36, -R * 0.1, R * 0.2, R * 0.24);
      line(g, [[-R * 0.95, -R * 0.1], [R * 0.95, -R * 0.1]], R * 0.1, P.acc);
      for (const s of [-1, 1]) { g.fillStyle = 'rgba(180,230,255,.25)'; circ(s * R * 0.36, -R * 0.1, R * 0.34)(g); g.fill(); ink(g, R * 0.13); g.stroke(); g.strokeStyle = P.acc; g.lineWidth = R * 0.07; g.stroke(); }
      fangsMouth(g, 0, R * 0.38, R * 0.26, 0.5);
    } else if (f === 'sneeze') {
      squint(-R * 0.36, -1); squint(R * 0.36, 1);
      g.fillStyle = '#7a1633'; ell(0, R * 0.38, R * 0.26 * (sneezing ? 1.2 : 0.7), R * 0.3 * (sneezing ? 1.1 : 0.6))(g); g.fill(); ink(g, R * 0.08); g.stroke();
      if (sneezing) { g.fillStyle = '#bfe9ff'; const k = (t % 6 - 5.1) / 0.9; for (const [dx, dy] of [[0.5, 0.55], [0.62, 0.35], [0.45, 0.8], [0.8, 0.6]]) { circ(R * (dx + k * 0.5), R * (dy + k * 0.2), R * 0.07)(g); g.fill(); } }
    } else if (f === 'grumpy') {
      E(-R * 0.34, -R * 0.05, R * 0.18, R * 0.22); E(R * 0.34, -R * 0.05, R * 0.18, R * 0.22);
      brow(g, -R * 0.7, -R * 0.42, -R * 0.08, -R * 0.2, R * 0.14); brow(g, R * 0.7, -R * 0.42, R * 0.08, -R * 0.2, R * 0.14);
      g.beginPath(); g.arc(0, R * 0.62, R * 0.24, Math.PI + 0.3, TAU - 0.3); ink(g, R * 0.09); g.stroke();
      cel(g, '#ff5a78', circ(0, R * 0.2, R * 0.1), { r: R * 0.1, hi: false, lw: 2 });
    } else if (f === 'sleepy' && boss) {   // a boss never naps: wide awake, scowling, with a little fang
      E(-R * 0.36, -R * 0.1, R * 0.2, R * 0.24); E(R * 0.36, -R * 0.1, R * 0.2, R * 0.24);
      fangsMouth(g, 0, R * 0.4, R * 0.24, 0.4);
    } else if (f === 'sleepy') {
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * R * 0.36, -R * 0.12, R * 0.2, 0.15, Math.PI - 0.15); ink(g, R * 0.09); g.stroke(); }
      g.fillStyle = '#7a1633'; ell(0, R * 0.4, R * 0.1, R * 0.12)(g); g.fill(); ink(g, R * 0.06); g.stroke();
      text2(g, 'z', R * 0.72, -R * 0.5 + sw, R * 0.3); text2(g, 'z', R * 0.95, -R * 0.78 + sw, R * 0.22);
    } else if (f === 'shades') {
      for (const s of [-1, 1]) { cel(g, '#2d1b4a', poly([[s * R * 0.08, -R * 0.3], [s * R * 0.68, -R * 0.3], [s * R * 0.6, R * 0.1], [s * R * 0.14, R * 0.1]]), { r: R * 0.4, hi: false, lw: 2.6, shadow: '#1a0f2e' }); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = R * 0.05; g.beginPath(); g.moveTo(s * R * 0.2, -R * 0.22); g.lineTo(s * R * 0.4, -R * 0.22); g.stroke(); }
      line(g, [[-R * 0.08, -R * 0.2], [R * 0.08, -R * 0.2]], R * 0.07);
      fangsMouth(g, 0, R * 0.36, R * 0.34, 0.8);
    } else if (f === 'sour') {
      squint(-R * 0.36, -1); E(R * 0.36, -R * 0.1, R * 0.22, R * 0.26);
      g.fillStyle = '#7a1633'; ell(0, R * 0.36, R * 0.26, R * 0.16)(g); g.fill(); ink(g, R * 0.08); g.stroke();
      cel(g, '#ff7a9a', ell(R * 0.06, R * 0.58, R * 0.14, R * 0.2), { r: R * 0.2, hi: false, lw: 2, shadow: '#d9486a' });
    } else if (f === 'cyclops') {
      eye(g, 0, -R * 0.06, R * 0.5, R * 0.5, { iris, look, open });
      brow(g, -R * 0.55, -R * 0.62, R * 0.55, -R * 0.62, R * 0.12);
      line(g, [[-R * 0.3, R * 0.52], [-R * 0.15, R * 0.62], [0, R * 0.52], [R * 0.15, R * 0.62], [R * 0.3, R * 0.52]], R * 0.08);
    } else if (f === 'shy') {
      E(-R * 0.34, -R * 0.1, R * 0.22, R * 0.26); E(R * 0.34, -R * 0.1, R * 0.22, R * 0.26);
      blush(g, -R * 0.6, R * 0.22, R * 0.2); blush(g, R * 0.6, R * 0.22, R * 0.2);
      g.fillStyle = '#7a1633'; ell(0, R * 0.42, R * 0.09, R * 0.1)(g); g.fill();
      line(g, [[-R * 0.75, R * 0.62], [R * 0.75, R * 0.62]], R * 0.14, '#ff7eb6');   // a little scarf
    } else if (f === 'sad') {
      E(-R * 0.34, -R * 0.02, R * 0.2, R * 0.26); E(R * 0.34, -R * 0.02, R * 0.2, R * 0.26);
      brow(g, -R * 0.62, -R * 0.2, -R * 0.1, -R * 0.45, R * 0.11); brow(g, R * 0.62, -R * 0.2, R * 0.1, -R * 0.45, R * 0.11);
      g.beginPath(); g.arc(0, R * 0.62, R * 0.2, Math.PI + 0.3, TAU - 0.3); ink(g, R * 0.08); g.stroke();
      g.fillStyle = '#9fd8ff'; ell(R * 0.55, R * 0.35, R * 0.07, R * 0.12)(g); g.fill();
    } else {
      E(-R * 0.36, -R * 0.1, R * 0.28, R * 0.34); E(R * 0.36, -R * 0.1, R * 0.28, R * 0.34); fangsMouth(g, 0, R * 0.34, R * 0.3, 0.6);
    }
    if (o.sg === 'go' && !hurt) EF.yell(g, R, P, t); else if (hurt) EF.wail(g, R, P, t);   // 01-enemy-art r7
    if (boss && f !== 'grumpy' && f !== 'sad' && f !== 'cyclops' && f !== 'shades') { brow(g, -R * 0.66, -R * 0.6, -R * 0.1, -R * 0.4, R * 0.13); brow(g, R * 0.66, -R * 0.6, R * 0.1, -R * 0.4, R * 0.13); }
    if (hurt) for (const s of [-1, 1]) sparkle(g, s * R * 0.86, -R * 0.3, R * 0.2, '#ffd84d');
    else if (o.alone && f !== 'sad') {   // the shield is gone: it sweats and trembles
      const k = (t * 1.6) % 1; g.fillStyle = '#bfe9ff';
      for (const [dx, ph] of [[0.78, 0], [-0.82, 0.5]]) { const q = (k + ph) % 1; g.save(); g.globalAlpha = 1 - q * q; g.translate(dx * R, -R * 0.42 + q * R * 0.5); g.beginPath(); g.moveTo(0, -R * 0.18); g.quadraticCurveTo(R * 0.15, R * 0.02, 0, R * 0.1); g.quadraticCurveTo(-R * 0.15, R * 0.02, 0, -R * 0.18); g.fill(); ink(g, R * 0.05); g.stroke(); g.restore(); }
    }
    if (o.fury > 0 && !hurt) {   // the manga anger mark pops on the brow
      const k = 1 + Math.sin(t * 14) * 0.12 * o.fury; g.save(); g.translate(R * 0.7, -R * 0.66); g.scale(k, k); g.lineCap = 'round';
      for (const [w, c] of [[R * 0.15, INK], [R * 0.08, '#ff3d5a']]) { g.lineWidth = w; g.strokeStyle = c; for (const s of [-1, 1]) for (const d of [-1, 1]) { g.beginPath(); g.moveTo(s * R * 0.06, d * R * 0.24); g.quadraticCurveTo(s * R * 0.24, d * R * 0.24, s * R * 0.24, d * R * 0.06); g.stroke(); } }
      g.restore();
    }
    if (tongue && (f === 'goggles' || f === 'shades' || f === 'grumpy' || f === 'shy')) cel(g, '#ff7a9a', ell(R * 0.1, R * (f === 'goggles' ? 0.62 : f === 'shades' ? 0.62 : f === 'grumpy' ? 0.72 : 0.56), R * 0.1, R * 0.13), { r: R * 0.13, hi: false, lw: 2, shadow: '#d9486a' });
    if (o.slow > 0) { g.fillStyle = 'rgba(140,225,255,.32)'; circ(0, 0, R * 1.0)(g); g.fill(); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = R * 0.07; g.stroke(); for (const k of [-0.5, 0, 0.5]) cel(g, '#e6f8ff', poly([[k * R - R * 0.1, R * 0.88], [k * R + R * 0.1, R * 0.88], [k * R, R * (1.2 + (k ? 0 : 0.15))]]), { r: R * 0.25, hi: false, lw: 1.8, shadow: '#7fc8ee' }); }
    if (o.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.7, o.flash * 5)})`; circ(0, 0, R * 1.05)(g); g.fill(); }
    g.restore();
  }
  // 01-enemy-art r6: a surging head grows a fan of hot spikes along its heading (boss phase 2: seven big ones with a white core and a
  // speed-line wake; every other surge: three short streaks). Baked once, drawn rotated and stretched, so a dash costs two drawImage calls.
  function dashSpikes(g, R, ang, t, big, warn, skin) {
    const SP = SPECIES[skin], key = big ? 'dashspk|big' : 'dashspk|min|' + (SP ? skin : ''), sz = R * 4.6;
    const spr = bake(key, sz, sz, c => {
      if (big) {
        for (const dy of [-0.55, 0, 0.55]) line(c, [[-R * 1.4, R * dy], [-R * 2.2 - (dy ? 0 : R * 0.1), R * dy]], R * (dy ? 0.07 : 0.1), 'rgba(255,200,120,.75)');
        for (let i = -3; i <= 3; i++) {
          const a = i * 0.34, L = R * (1.0 + (3 - Math.abs(i)) * 0.16), x0 = Math.cos(a) * R * 0.8, y0 = Math.sin(a) * R * 0.8, w = R * 0.19;
          const nx = -Math.sin(a), ny = Math.cos(a);
          cel(c, '#ff7a2a', poly([[x0 + nx * w, y0 + ny * w], [Math.cos(a) * (R * 0.8 + L) , Math.sin(a) * (R * 0.8 + L)], [x0 - nx * w, y0 - ny * w]]), { r: R * 0.5, hi: false, lw: 2.4, shadow: '#c42a2a' });
          line(c, [[x0, y0], [Math.cos(a) * (R * 0.8 + L * 0.7), Math.sin(a) * (R * 0.8 + L * 0.7)]], R * 0.05, '#fff1a8');
        }
      } else {
        if (SP) EF.streaks(c, R, SP); else for (const dy of [-0.45, 0, 0.45]) line(c, [[-R * 1.2, R * dy], [-R * (1.8 + (dy ? 0 : 0.35)), R * dy]], R * 0.07, 'rgba(255,255,255,.6)');
      }
    }, 2);
    if (!spr) return;
    const k = warn ? 0.4 + Math.sin(t * 40) * 0.06 : 1 + Math.sin(t * 36) * 0.06;
    g.save(); g.rotate(ang); g.scale(k, 1); if (warn) g.globalAlpha *= 0.8;
    g.drawImage(spr.c, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  // 01-enemy-art r5: boss phase 2 (below 40% hp) gets its own silhouette: a spinning crest of flames behind the body and a glowing crack across it
  function p2Halo(g, R, t) {
    const sz = R * 4.4, spr = bake('p2halo', sz, sz, c => {
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU, L = i % 2 ? 1.62 : 1.98, w = 0.2;
        c.save(); c.rotate(a);
        cel(c, '#ff5a2a', poly([[R * 0.8, -R * w], [R * 1.1, -R * w * 1.5], [R * L, 0], [R * 1.1, R * w * 0.4], [R * 0.8, R * w]]), { r: R * 1.2, hi: false, lw: 3, shadow: '#b8280f' });
        cel(c, '#ffd24a', poly([[R * 0.95, -R * 0.06], [R * (L - 0.3), 0], [R * 0.95, R * 0.08]]), { r: R * 0.5, hi: false, lw: 1.4 });
        c.restore();
      }
    }, 2);
    if (!spr) return;
    g.save(); g.rotate(t * 0.9); const k = 1 + Math.sin(t * 11) * 0.05; g.scale(k, k); g.drawImage(spr.c, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  function p2CrackPaint(g) {
    const R = B, pts = [[-0.62, -0.62], [-0.38, -0.3], [-0.5, -0.05], [-0.2, 0.2], [-0.3, 0.5], [0.02, 0.78]].map(p => [p[0] * R, p[1] * R]);
    for (const [w, c] of [[R * 0.13, INK], [R * 0.07, '#ff7a2a'], [R * 0.025, '#fff1a8']]) line(g, pts, w, c);
  }
  // cheap live layer for the boss ornaments: pieces that move are baked once and only drawn rotated, scaled or faded (a few drawImage calls, no paths)
  function bossLive(g, R, t, skin, p2) {
    const tw = bake('tw|spark', R * 0.8, R * 0.8, c => sparkle(c, 0, 0, R * 0.3, '#fffbe0'), 2);
    if (tw) for (const [x, y, ph] of [[-0.66, -1.34, 0], [0, -1.5, 2.1], [0.66, -1.34, 4.2]]) { const k = Math.max(0, Math.sin(t * 2.6 + ph)); if (k > 0.05) g.drawImage(tw.c, R * x - R * 0.4 * k, R * y - R * 0.4 * k, R * 0.8 * k, R * 0.8 * k); }
    if (skin === 'rust') {
      for (const [x, y, k, sp] of [[1.12, -0.05, 0.3, 1], [1.0, 0.38, 0.2, -1.6]]) {
        const rr = R * k, gs = bake('gear|' + k, rr * 3, rr * 3, c => { cel(c, '#c98a4a', poly(Array.from({ length: 16 }, (_, i) => { const a = i / 16 * TAU, q = i % 2 ? rr * 0.78 : rr * 1.12; return [Math.cos(a) * q, Math.sin(a) * q]; })), { r: rr, hi: false, lw: 2, shadow: '#8a4f22' }); cel(c, '#3a2a8a', circ(0, 0, rr * 0.32), { r: rr * 0.3, hi: false, lw: 1.6 }); }, 2);
        if (!gs) continue;
        for (const s of [-1, 1]) { g.save(); g.translate(s * R * x, R * y); g.rotate(t * sp * (p2 ? 2.2 : 1) * s); g.drawImage(gs.c, -rr * 1.5, -rr * 1.5, rr * 3, rr * 3); g.restore(); }
      }
    } else if (skin === 'love' || skin === 'sleepy') {   // little hearts / z's float up off the head and fade
      const sp = bake(skin === 'love' ? 'rise|heart' : 'rise|z', R * 0.7, R * 0.7, c => { if (skin === 'love') cel(c, '#ff9ac6', heartPath(0, -R * 0.03, R * 0.2), { r: R * 0.2, hi: false, lw: 2, shadow: '#d9488f' }); else text2(c, 'z', 0, 0, R * 0.4); }, 2);
      if (sp) for (let i = 0; i < 2; i++) { const q = (t * 0.45 + i * 0.5) % 1; g.save(); g.globalAlpha = Math.min(1, q * 5) * (1 - q * q); g.drawImage(sp.c, (i ? 0.72 : -0.78) * R + Math.sin(q * 6 + i) * R * 0.08 - R * 0.35, -R * 0.9 - q * R * 1.0 - R * 0.35, R * 0.7, R * 0.7); g.restore(); }
    } else if (skin === 'disco' && tw) {   // the mirror ball throws a glint
      const k = 0.5 + (0.5 + Math.sin(t * 5) * 0.5) * 0.9; g.drawImage(tw.c, R * 0.1 - R * 0.4 * k, -R * 1.64 - R * 0.4 * k, R * 0.8 * k, R * 0.8 * k);
    }
  }
  // each boss wears its own crown metal and a signature ornament, so a boss reads from its silhouette alone
  const BOSS_METAL = { rust: ['#d08a4a', '#8a4f22'], sleepy: ['#e6dcff', '#a58be0'], mighty: ['#c9d3e8', '#7a8aae'], frosty: ['#e4f6ff', '#8cc4e6'], gloomy: ['#9a6af0', '#4a2a90'], disco: ['#ff9ac6', '#d9488f'], sour: ['#b7f0a8', '#5fb85f'] };
  function bossOrn(g, R, skin, t, P) {
    const bob = Math.sin(t * 3) * R * 0.03, fy = -R * 1.58 + bob, side = (fn) => { for (const s of [-1, 1]) { g.save(); g.scale(s, 1); fn(s); g.restore(); } };
    if (skin === 'love') { cel(g, '#ff3d7a', heartPath(0, fy - R * 0.08, R * 0.3), { r: R * 0.3, hi: false, lw: 2.4, shadow: '#c42a54' }); side(() => cel(g, '#ff9ac6', heartPath(R * 1.12, -R * 0.2 + bob, R * 0.2), { r: R * 0.2, hi: false, lw: 2, shadow: '#d9488f' })); }
    else if (skin === 'rust') { if (t >= 0) side(() => { for (const [x, y, k] of [[1.12, -0.05, 0.3], [1.0, 0.38, 0.2]]) { const rr = R * k, an = t * (k > 0.25 ? 1 : -1.6); g.save(); g.translate(R * x, R * y); g.rotate(an); cel(g, '#c98a4a', poly(Array.from({ length: 16 }, (_, i) => { const a = i / 16 * TAU, q = i % 2 ? rr * 0.78 : rr * 1.12; return [Math.cos(a) * q, Math.sin(a) * q]; })), { r: rr, hi: false, lw: 2, shadow: '#8a4f22' }); cel(g, '#3a2a8a', circ(0, 0, rr * 0.32), { r: rr * 0.3, hi: false, lw: 1.6 }); g.restore(); } }); }
    else if (skin === 'sneezy') side(() => { for (const [a, k] of [[-0.9, 0.5], [-0.3, 0.62], [0.3, 0.5]]) { const x = Math.cos(a) * R * 1.02, y = Math.sin(a) * R * 1.02; cel(g, '#c4f5dc', poly([[x - R * 0.1, y + R * 0.1], [x + R * 0.1, y - R * 0.1], [x + Math.cos(a) * R * k, y + Math.sin(a) * R * k]]), { r: R * 0.3, hi: false, lw: 2, shadow: '#6fe0a8' }); } });
    else if (skin === 'grumpy') side(() => cel(g, '#ff5a78', poly([[R * 0.55, -R * 0.95], [R * 1.25, -R * 1.65], [R * 1.12, -R * 0.62], [R * 0.9, -R * 0.55]]), { r: R * 0.7, hi: false, lw: 2.8, shadow: '#c42a54' }));
    else if (skin === 'sleepy') { g.save(); g.translate(0, fy - R * 0.08); g.beginPath(); g.arc(0, 0, R * 0.28, 0.6, TAU - 0.6); g.arc(R * 0.14, -R * 0.04, R * 0.22, TAU - 0.9, 0.9, true); g.closePath(); g.fillStyle = '#fff1a8'; g.fill(); ink(g, 2.4); g.stroke(); g.restore(); sparkle(g, R * 0.4, fy + R * 0.05, R * 0.14, '#fff8ec'); }
    else if (skin === 'disco') { g.save(); g.translate(0, fy - R * 0.06 + bob); cel(g, '#dfe6f6', circ(0, 0, R * 0.3), { r: R * 0.3, hi: false, lw: 2.4, shadow: '#7f8fb8' }); g.save(); circ(0, 0, R * 0.3)(g); g.clip(); g.strokeStyle = 'rgba(80,100,160,.55)'; g.lineWidth = 1.4; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * R * 0.12, -R * 0.3); g.lineTo(i * R * 0.12, R * 0.3); g.moveTo(-R * 0.3, i * R * 0.12); g.lineTo(R * 0.3, i * R * 0.12); g.stroke(); } g.restore(); sparkle(g, R * 0.1, -R * 0.1, R * 0.12, '#fff'); g.restore(); }
    else if (skin === 'sour') side(() => cel(g, '#7ad04a', poly([[R * 0.5, -R * 1.02], [R * 1.35, -R * 1.4], [R * 1.2, -R * 0.75], [R * 0.7, -R * 0.78]]), { r: R * 0.7, hi: false, lw: 2.6, shadow: '#3f8f2a' }));
    else if (skin === 'mighty') side(() => { cel(g, '#8fa3c7', poly([[R * 0.8, -R * 0.5], [R * 1.4, -R * 0.7], [R * 1.25, R * 0.1], [R * 0.9, R * 0.35]]), { r: R * 0.6, hi: false, lw: 2.8, shadow: '#5b6d94' }); cel(g, '#d3def2', poly([[R * 1.1, -R * 0.62], [R * 1.5, -R * 1.05], [R * 1.38, -R * 0.45]]), { r: R * 0.3, hi: false, lw: 2, shadow: '#8fa3c7' }); });
    else if (skin === 'frosty') { cel(g, '#bfe9ff', poly([[-R * 0.14, fy + R * 0.2], [0, fy - R * 0.5], [R * 0.14, fy + R * 0.2]]), { r: R * 0.3, hi: false, lw: 2.2, shadow: '#6fb4e0' }); side(() => cel(g, '#bfe9ff', poly([[R * 0.52, -R * 1.02], [R * 0.88, -R * 1.62], [R * 0.78, -R * 0.98]]), { r: R * 0.4, hi: false, lw: 2.2, shadow: '#6fb4e0' })); sparkle(g, -R * 0.55, fy + R * 0.1, R * 0.14, '#fff'); }
    else if (skin === 'piggy') { cel(g, '#ffd84d', circ(0, fy - R * 0.02, R * 0.24), { r: R * 0.24, hi: false, lw: 2.4, shadow: '#d98f1a' }); line(g, [[-R * 0.05, fy - R * 0.1], [-R * 0.05, fy + R * 0.08]], R * 0.07, '#b9760f'); line(g, [[R * 0.08, fy - R * 0.08], [R * 0.08, fy + R * 0.06]], R * 0.07, '#b9760f'); cel(g, '#ff7eb6', poly([[-R * 0.62, -R * 0.55], [-R * 1.15, -R * 0.82], [-R * 1.15, -R * 0.28]]), { r: R * 0.4, hi: false, lw: 2.2, shadow: '#d9488f' }); cel(g, '#ff7eb6', poly([[-R * 0.62, -R * 0.55], [-R * 0.1, -R * 0.82], [-R * 0.1, -R * 0.28]]), { r: R * 0.4, hi: false, lw: 2.2, shadow: '#d9488f' }); cel(g, '#ff9ac6', circ(-R * 0.62, -R * 0.55, R * 0.12), { r: R * 0.12, hi: false, lw: 2 }); }
    else if (skin === 'gloomy') { side(() => { for (const [x, y, h] of [[0.9, -0.6, 0.75], [1.1, -0.2, 0.6]]) cel(g, '#9dff6d', poly([[R * x - R * 0.12, R * y + R * 0.12], [R * x + R * 0.12, R * y - R * 0.12], [R * (x + 0.4), R * (y - h * 0.5)]]), { r: R * 0.3, hi: false, lw: 2, shadow: '#4fb02a' }); }); }
  }
  // boss heads wear a gold collar of jewels around the body, so they read as royalty even without the crown
  // static headgear: baked once per size (each used to cost 2 to 6 clips a frame), then drawn as one image; the baked box is 2.4R x 1.6R centred 1R above the head centre
  function hatSprite(g, key, R, paint, dx = 0, dy = 0) {
    const w = R * 2.4, h = R * 1.6, spr = bake(key, w, h, c => { c.translate(0, R); paint(c); }, 3);
    if (spr) g.drawImage(spr.c, -w / 2 + dx, -R - h / 2 + dy, w, h); else paint(g);
  }
  function crownPaint(c, R, cy, cm) {
      cel(c, cm[0], poly([[-R * 0.62, cy + R * 0.14], [-R * 0.66, cy - R * 0.42], [-R * 0.33, cy - R * 0.14], [0, cy - R * 0.55], [R * 0.33, cy - R * 0.14], [R * 0.66, cy - R * 0.42], [R * 0.62, cy + R * 0.14]]), { r: R * 0.7, hi: false, lw: 3, shadow: cm[1] });
      line(c, [[-R * 0.5, cy + R * 0.02], [R * 0.5, cy + R * 0.02]], R * 0.05, cm[1]);
      for (const [x, y] of [[-0.66, -0.46], [0, -0.6], [0.66, -0.46]]) cel(c, '#fff8ec', circ(x * R, cy + (y + 0.04) * R, R * 0.085), { r: R * 0.09, hi: false, lw: 1.8, shadow: '#e6d6c8' });
      for (const [x, col] of [[-0.3, '#ff5a8a'], [0, '#6fe3ff'], [0.3, '#ff5a8a']]) cel(c, col, circ(x * R, cy - R * 0.1, R * 0.075), { r: R * 0.08, hi: false, lw: 1.6 });
      c.fillStyle = 'rgba(255,255,255,.7)'; ell(-R * 0.45, cy - R * 0.2, R * 0.04, R * 0.1, 0.5)(c); c.fill();
  }
  // the collar never animates, so it is baked once (a head used to run 6 clips and ~20 paths for it every frame)
  function bossRing(g, R, t, metal) {
    const sz = R * 2.7, spr = bake('bossring|' + R + '|' + (metal ? metal[0] : ''), sz, sz, c => bossRingPaint(c, R, t, metal), 3);
    if (spr) g.drawImage(spr.c, -sz / 2, -sz / 2, sz, sz); else bossRingPaint(g, R, t, metal);
  }
  function bossRingPaint(g, R, t, metal) {
    g.save(); g.lineCap = 'round';
    for (const [w, c] of [[R * 0.2, INK], [R * 0.11, metal ? metal[0] : '#ffd84d']]) { g.lineWidth = w; g.strokeStyle = c; g.beginPath(); g.arc(0, 0, R * 1.03, 0, TAU); g.stroke(); }
    g.lineWidth = R * 0.04; g.strokeStyle = '#fff1a8'; g.beginPath(); g.arc(0, 0, R * 1.03, -2.6, -1.7); g.stroke();
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + 0.5, c = i % 2 ? '#6fe3ff' : '#ff5a8a'; cel(g, c, circ(Math.cos(an) * R * 1.03, Math.sin(an) * R * 1.03, R * 0.1), { r: R * 0.1, hi: false, lw: 2 }); }
    g.restore();
  }
  function text2(g, ch, x, y, size) { g.font = `900 ${size}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = size * 0.25; g.strokeStyle = INK; g.strokeText(ch, x, y); g.fillStyle = '#fff'; g.fillText(ch, x, y); }

  // flat colour fallback shapes are not needed: the kit always draws. Expose helpers for UI art too.
  return { SPR, blit, drawHead, cel, eye, sparkle, SPECIES, MINION_IDS: Object.keys(MIN), cache, B, bake, layer, layer2, makeCanvas, dpr, get gen() { return gen; } };
}
