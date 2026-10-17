'use strict';
// ===================== ART_UI: RoxorLoops & Jasmin STICKER-ZINE cards, illustrations, HUD, buttons, panels =====================
// Owned by the art_ui agent. Loaded after art.js/style.js/scenes.js and overrides:
//   drawCard, hpBar, shieldBadge, intentBubble, glossRect, drawHUD, drawTip, UI.btn,
//   BattleScene/NegotiationScene.prototype.drawHUDParts, PauseModal/HelpModal/DeckModal.prototype.draw
// Visual language (see reference/STYLE_BIBLE.md): collectible vinyl stickers - white die-cut border, thick even
// black outline, flat saturated fills (lime / hot pink / cyan / lavender / sunny yellow) on cream zine paper,
// airbrushed spray splats + stipple grain, marker doodles (stars, hearts, sparkles, notes, speed dashes).
// Performance model: each card face (frame + illustration + rules text) is rendered ONCE into an offscreen
// canvas (LRU keyed by card content + resolution) and blitted; only cheap dynamic layers (glow, shadow,
// foil sweep, dim) are drawn per frame. HUD bar, panels, card backs are cached sprites. No shadowBlur per frame.

const AUI = { faces: new Map(), arts: new Map(), sprites: {}, max: 110, res: 0, fontsOK: false, btnT: {}, stats: { hit: 0, miss: 0 } };
const UAK = '#15101c'; // ink
const TAU = Math.PI * 2;
const PAL = {
  lime: '#6cc22e', limeL: '#a6e65a', limeD: '#3f8f1a', pink: '#f06aa0', pinkL: '#ff9cc6', pinkD: '#d63a82',
  cyan: '#3fd8e8', cyanD: '#1597b0', lav: '#b79ae8', lavD: '#7a5ac8', sky: '#7fd0e8', yel: '#ffd23a', org: '#ff8a2a',
  cream: '#fbf7ea', navy: '#14182b', white: '#ffffff', grey: '#aaa4b2', skin: '#ffd6b8'
};

// ---------- colour + math helpers ----------
function auiHex(h) {
  if (typeof h !== 'string') return [128, 128, 128];
  if (h[0] === '#') { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; const n = parseInt(h.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const m = h.match(/\d+(\.\d+)?/g); return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}
function auiMix(a, b, t) { const A = auiHex(a), B = auiHex(b); return '#' + A.map((v, i) => clamp(Math.round(v + (B[i] - v) * t), 0, 255).toString(16).padStart(2, '0')).join(''); }
function auiA(h, a) { const A = auiHex(h); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
function auiHash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function auiRng(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x % 1000003) / 1000003; }; }
// rounded rect; sub=true appends a sub-path (for unions) instead of starting a new path
function auiRR(c, x, y, w, h, r, sub) { r = Math.max(0, Math.min(r, w / 2, h / 2)); if (!sub) c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function auiCirc(c, x, y, r, sub) { if (!sub) c.beginPath(); c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); c.closePath(); }
function auiCanvas(w, h) { const p = document.createElement('canvas'); p.width = Math.max(1, Math.ceil(w)); p.height = Math.max(1, Math.ceil(h)); return p; }
// polygon with rounded corners (puffy stars, bolts, crowns)
function auiPolyR(c, pts, r, sub) {
  const n = pts.length; if (!sub) c.beginPath();
  c.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; c.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, r); }
  c.closePath();
}
function auiStarPts(x, y, r1, r2, n = 5, rot = -Math.PI / 2) { const p = []; for (let i = 0; i < n * 2; i++) { const t = rot + i / (n * 2) * TAU, r = i % 2 ? r2 : r1; p.push([x + Math.cos(t) * r, y + Math.sin(t) * r]); } return p; }
function auiHeartPath(c, x, y, s, sub) { if (!sub) c.beginPath(); c.moveTo(x, y + s * .9); c.bezierCurveTo(x - s * 1.35, y + s * .05, x - s * .85, y - s * 1.05, x, y - s * .38); c.bezierCurveTo(x + s * .85, y - s * 1.05, x + s * 1.35, y + s * .05, x, y + s * .9); c.closePath(); }
function auiFontsReady() {
  if (AUI.fontsOK) return true;
  try { AUI.fontsOK = !document.fonts || (document.fonts.check(`800 20px ${FD}`) && document.fonts.check(`20px ${FB}`) && document.fonts.check(`20px ${FM}`)); } catch (e) { AUI.fontsOK = true; }
  if (!AUI.fontsOK && G.time > 5) AUI.fontsOK = true; // give up waiting (offline): cache with fallback fonts
  return AUI.fontsOK;
}
try { if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { AUI.fontsOK = false; AUI.faces.clear(); }); } catch (e) { }
function auiRes() {
  const r = clamp(Math.round(renderScale * 1.4 * 4) / 4, 1.25, 3);
  if (r !== AUI.res) { AUI.res = r; AUI.faces.clear(); AUI.arts.clear(); AUI.sprites = {}; }
  return r;
}
// map the game's legacy UI colours (C.teal, C.mustard ...) onto the sticker palette
const AUI_COLMAP = {};
(function () {
  const m = { teal: PAL.cyan, teal2: PAL.cyanD, mustard: PAL.yel, orange: PAL.org, red: PAL.pink, plum: PAL.lav, green: PAL.lime, blue: '#6aa8f4', grey: PAL.grey, pink: PAL.pinkL, sky: PAL.sky, cream: PAL.cream };
  for (const k in m) if (C[k]) AUI_COLMAP[String(C[k]).toLowerCase()] = m[k];
  AUI_COLMAP['#e04a42'] = PAL.pink;
})();
function auiCol(col) { if (typeof col !== 'string') return col; return AUI_COLMAP[col.toLowerCase()] || col; }

// ---------- sticker primitives ----------
// aSticker: white die-cut border -> fill -> soft shade -> gloss highlight -> ink outline.
// o.u (union mode): build() may contain several overlapping sub-paths; the outline is stroked UNDER the fill at
// double width so internal edges vanish (bubbly union of circles/rects).
function aSticker(c, build, fill, o = {}) {
  const ink = o.ink != null ? o.ink : 2.4, wh = o.white || 0;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  if (o.drop) { c.save(); c.translate(o.drop[0], o.drop[1]); build(); c.fillStyle = o.dropCol || 'rgba(21,16,28,.22)'; c.fill(); if (wh) { c.lineWidth = ink * 2 + wh * 2; c.strokeStyle = c.fillStyle; c.stroke(); } c.restore(); }
  if (wh) { build(); c.lineWidth = (o.u ? ink * 2 : ink) + wh * 2; c.strokeStyle = o.wcol || '#ffffff'; c.stroke(); }
  if (o.u && ink) { build(); c.lineWidth = ink * 2; c.strokeStyle = o.inkCol || UAK; c.stroke(); }
  build(); c.fillStyle = fill; c.fill();
  if (o.box || o.hl || o.grain) {
    c.save(); build(); c.clip();
    if (o.box) { const b = o.box, g = c.createLinearGradient(b[0], b[1], b[2], b[3]); g.addColorStop(0, 'rgba(255,255,255,.3)'); g.addColorStop(.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(21,16,28,.2)'); c.fillStyle = g; c.fillRect(Math.min(b[0], b[2]) - 80, Math.min(b[1], b[3]) - 80, Math.abs(b[2] - b[0]) + 160, Math.abs(b[3] - b[1]) + 160); }
    if (o.hl) { const h = o.hl; c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(h[0], h[1], h[2], h[3], h[4] || 0, 0, TAU); c.fill(); }
    if (o.grain) { const r = auiRng(o.grain), b = o.gbox; for (let i = 0; i < (b[2] * b[3]) / 14; i++) { c.fillStyle = r() < .5 ? 'rgba(255,255,255,.16)' : 'rgba(21,16,28,.07)'; c.fillRect(b[0] + r() * b[2], b[1] + r() * b[3], 1, 1); } }
    c.restore();
  }
  if (!o.u && ink) { build(); c.lineWidth = ink; c.strokeStyle = o.inkCol || UAK; c.stroke(); }
  c.restore();
}
// several parts sharing ONE white die-cut border
function aGroup(c, parts, o = {}) {
  const wh = o.white || 0, ink = o.ink != null ? o.ink : 2.4;
  if (wh) { c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = '#ffffff'; for (const p of parts) { p.b(); c.lineWidth = (p.u ? ink * 2 : ink) + wh * 2; c.stroke(); c.fillStyle = '#ffffff'; c.fill(); } c.restore(); }
  for (const p of parts) aSticker(c, p.b, p.f, Object.assign({ ink }, p));
}
function aStar(c, x, y, r, col, o = {}) { aSticker(c, () => auiPolyR(c, auiStarPts(x, y, r, r * (o.k || .5), o.n || 5, (o.rot || 0) - Math.PI / 2), r * .14), col, { ink: o.ink != null ? o.ink : Math.max(1.4, r * .16), white: o.white || 0, hl: o.hl ? [x - r * .25, y - r * .3, r * .22, r * .13, -.5] : null }); }
function aHeart(c, x, y, s, col, o = {}) { aSticker(c, () => auiHeartPath(c, x, y, s), col, { ink: o.ink != null ? o.ink : Math.max(1.4, s * .14), white: o.white || 0, hl: [x - s * .45, y - s * .35, s * .22, s * .14, -.6] }); }
function aSpark(c, x, y, s, col, lw) {
  c.save(); c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.closePath();
  c.fillStyle = col; c.fill(); c.lineJoin = 'round'; c.lineWidth = lw || Math.max(1, s * .14); c.strokeStyle = UAK; c.stroke(); c.restore();
}
function aPlus(c, x, y, s, col = UAK, lw = 1.6) { c.save(); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke(); c.restore(); }
function aNote(c, x, y, s, col = UAK, dbl) {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  const head = (hx) => { c.beginPath(); c.ellipse(hx, y, s * .48, s * .34, -.45, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = Math.max(1, s * .14); c.strokeStyle = UAK; c.stroke(); };
  c.strokeStyle = UAK; c.lineWidth = Math.max(1.2, s * .17);
  if (dbl) { c.beginPath(); c.moveTo(x + s * .4, y - s * .1); c.lineTo(x + s * .4, y - s * 1.5); c.lineTo(x + s * 1.5, y - s * 1.75); c.lineTo(x + s * 1.5, y - s * .35); c.stroke(); head(x); head(x + s * 1.1); c.restore(); return; }
  c.beginPath(); c.moveTo(x + s * .4, y - s * .1); c.lineTo(x + s * .4, y - s * 1.5); c.quadraticCurveTo(x + s * .6, y - s * .9, x + s * 1.1, y - s * .8); c.stroke();
  head(x); c.restore();
}
function aDash(c, x, y, ang, n, len, col, lw = 2.4, spread = .9, d0 = 0) {
  c.save(); c.lineCap = 'round'; c.strokeStyle = col; c.lineWidth = lw;
  for (let i = 0; i < n; i++) { const t = ang + (n > 1 ? (i / (n - 1) - .5) * spread : 0); c.beginPath(); c.moveTo(x + Math.cos(t) * d0, y + Math.sin(t) * d0); c.lineTo(x + Math.cos(t) * (d0 + len), y + Math.sin(t) * (d0 + len)); c.stroke(); }
  c.restore();
}
function aSmooth(c, pts) { const n = pts.length; c.beginPath(); c.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2); for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } c.closePath(); }
// airbrushed spray-paint splat: soft core, lumpy blob, stipple over-spray, optional drip
function aSplat(c, x, y, r, col, rng, a = .55, drip = false) {
  let g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, auiA(col, a)); g.addColorStop(.55, auiA(col, a * .7)); g.addColorStop(1, auiA(col, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  const pts = []; for (let k = 0; k < 11; k++) { const t = k / 11 * TAU, rr = r * .58 * (.72 + rng() * .45); pts.push([x + Math.cos(t) * rr, y + Math.sin(t) * rr * .9]); }
  aSmooth(c, pts); c.fillStyle = auiA(col, a * .55); c.fill();
  for (let i = 0; i < r * 2.4; i++) { const t = rng() * TAU, d = r * (.45 + rng() * .8), s = .5 + rng() * 1.3; c.fillStyle = auiA(col, .2 + rng() * .5); c.fillRect(x + Math.cos(t) * d, y + Math.sin(t) * d, s, s); }
  if (drip) { const dx = x + (rng() - .5) * r * .7, l = r * (.5 + rng() * .6), w = 1.6 + rng() * 2; c.fillStyle = auiA(col, a * .85); c.fillRect(dx - w / 2, y + r * .25, w, l); c.beginPath(); c.arc(dx, y + r * .25 + l, w * .9, 0, TAU); c.fill(); }
}
function aHalftone(c, x0, y0, w, h, col, a, step = 5) {
  c.fillStyle = auiA(col, a);
  for (let y = y0; y < y0 + h; y += step) for (let x = x0 + ((y - y0) / step % 2) * step / 2; x < x0 + w; x += step) { const k = ((x - x0) / w + (y - y0) / h) / 2; if (k > .2) { c.beginPath(); c.arc(x, y, (k - .2) * step * .55, 0, TAU); c.fill(); } }
}
function aGrain(c, rng, w, h, n) { for (let i = 0; i < n; i++) { c.fillStyle = rng() < .55 ? 'rgba(21,16,28,.06)' : 'rgba(255,255,255,.22)'; c.fillRect(rng() * w, rng() * h, 1 + rng(), 1); } }
// bubbly display text: white sticker border -> ink outline -> fill (+ optional glossy top)
function auiBub(c, s, x, y, size, fill, o = {}) {
  c.save(); c.font = `800 ${size}px ${FD}`; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle'; c.lineJoin = 'round';
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  if (o.rot) { c.translate(x, y); c.rotate(o.rot); x = 0; y = 0; }
  if (o.maxW) { let sz = size; while (sz > 8 && c.measureText(s).width > o.maxW) { sz -= 1; c.font = `800 ${sz}px ${FD}`; } size = sz; }
  const sw = o.sw != null ? o.sw : Math.max(3, size * .2), wh = o.white != null ? o.white : Math.max(2.5, size * .13);
  if (wh) { c.lineWidth = sw + wh * 2; c.strokeStyle = o.wcol || '#ffffff'; c.strokeText(s, x, y); }
  if (sw) { c.lineWidth = sw; c.strokeStyle = UAK; c.strokeText(s, x, y); }
  c.fillStyle = fill; c.fillText(s, x, y);
  c.restore();
}

// ---------- card themes ----------
const AUI_TH = {
  atk: { k: 'atk', base: '#f2557f', light: '#ff9cc6', deep: '#c42a5e', sp: ['#ff9cc6', '#ffd23a'], label: 'ATTACK' },
  skl: { k: 'skl', base: '#3fd8e8', light: '#a8f0f8', deep: '#1597b0', sp: ['#7fd0e8', '#a6e65a'], label: 'SKILL' },
  pwr: { k: 'pwr', base: '#b79ae8', light: '#ddd0fa', deep: '#7a5ac8', sp: ['#c8b0f0', '#ff9cc6'], label: 'POWER' },
  inf: { k: 'inf', base: '#6cc22e', light: '#a6e65a', deep: '#3f8f1a', sp: ['#a6e65a', '#ff9cc6'], label: 'INFLUENCE' },
  comp: { k: 'comp', base: '#ffd23a', light: '#ffe98a', deep: '#c08a06', sp: ['#ffe27a', '#7fd0e8'], label: 'COMPOSURE' },
  tac: { k: 'tac', base: '#ff8a2a', light: '#ffc48a', deep: '#c85a08', sp: ['#ffb070', '#c8b0f0'], label: 'TACTIC' },
  curse: { k: 'curse', base: '#a29cab', light: '#cfc9d6', deep: '#5e5868', sp: ['#cfc9d6', '#b8b0c4'], label: 'CURSE' }
};
function auiTheme(d) {
  let t;
  if (d.kind === 'n') t = d.pwr ? 'tac' : d.arg ? 'tac' : d.comp && !d.inf ? 'comp' : 'inf';
  else t = d.type === 'curse' ? 'curse' : d.type === 'atk' ? 'atk' : d.type === 'pwr' ? 'pwr' : 'skl';
  const th = AUI_TH[t];
  let label = th.label;
  if (d.kind === 'n') label = d.pwr ? 'TACTIC' : d.arg ? 'ARGUMENT' : d.inf ? 'INFLUENCE' : d.comp ? 'COMPOSURE' : 'TRICK';
  return { th, label };
}

// =====================================================================================
// ILLUSTRATIONS  (126 x 84 logical px poster-style mini stickers, drawn once per art key + theme + variant)
// =====================================================================================
const UAW = 126, UAH = 84;
function aBG(c, th, r) {
  c.fillStyle = PAL.cream; c.fillRect(0, 0, UAW, UAH);
  aSplat(c, 16 + r() * 34, 12 + r() * 22, 30 + r() * 14, th.sp[0], r, .6, true);
  aSplat(c, 82 + r() * 34, 46 + r() * 26, 28 + r() * 16, th.sp[1], r, .5, r() < .5);
  aSplat(c, 30 + r() * 70, 60 + r() * 20, 12 + r() * 8, th.sp[0], r, .4);
  aHalftone(c, UAW - 46, 0, 46, 34, th.base, .3);
}
function aFinish(c, r) { aGrain(c, r, UAW, UAH, 260); }
const AWH = { white: 3, ink: 2.4 };

const AUI_ART = {
  sword(c, th, r) { // microphone + soundwave slash
    aBG(c, th, r);
    const cols = [th.k === 'atk' ? PAL.pink : th.base, PAL.yel, PAL.cyan];
    for (let i = 0; i < 3; i++) { c.save(); c.lineCap = 'round'; c.beginPath(); c.arc(26, 80, 30 + i * 14, -1.5, -.12); c.lineWidth = 8.5; c.strokeStyle = UAK; c.stroke(); c.lineWidth = 4.4; c.strokeStyle = cols[i]; c.stroke(); c.restore(); }
    c.save(); c.translate(80, 46); c.rotate(.62);
    aGroup(c, [
      { b: () => auiRR(c, -6, -2, 12, 36, 6), f: '#3a3448', box: [-6, 0, 6, 0], hl: [-2.6, 14, 1.4, 11, 0] },
      { b: () => auiRR(c, -9, -6, 18, 8, 4), f: PAL.yel, box: [0, -6, 0, 2] },
      { b: () => auiCirc(c, 0, -17, 14), f: '#e2e6f0', box: [-14, -31, 14, -3] }
    ], AWH);
    c.save(); auiCirc(c, 0, -17, 12.6); c.clip(); c.strokeStyle = 'rgba(21,16,28,.32)'; c.lineWidth = .9; c.beginPath(); for (let i = -28; i < 28; i += 4.5) { c.moveTo(i - 14, -31); c.lineTo(i + 14, -3); c.moveTo(i + 14, -31); c.lineTo(i - 14, -3); } c.stroke();
    c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(-5, -24, 4.5, 2.8, -.6, 0, TAU); c.fill(); c.restore();
    c.restore();
    aSpark(c, 108, 14, 8, PAL.yel); aSpark(c, 14, 16, 5, '#fff'); aNote(c, 104, 66, 7, th.k === 'atk' ? PAL.cyan : PAL.pink); aDash(c, 56, 16, -2.1, 3, 8, PAL.pink, 2.6, .9, 4);
  },
  dagger(c, th, r) { // crossed drumsticks
    aBG(c, th, r);
    const stick = (rot, col) => {
      c.save(); c.translate(63, 46); c.rotate(rot);
      aGroup(c, [
        { b: () => { c.beginPath(); c.moveTo(-3.4, 36); c.lineTo(-2, -26); c.lineTo(2, -26); c.lineTo(3.4, 36); c.quadraticCurveTo(0, 39, -3.4, 36); c.closePath(); }, f: '#f4c47e', box: [-3, 0, 3, 0] },
        { b: () => { c.beginPath(); c.ellipse(0, -29, 3.8, 5.2, 0, 0, TAU); }, f: '#f4c47e' },
        { b: () => auiRR(c, -3.6, 18, 7.2, 14, 2), f: col }
      ], { white: 2.6, ink: 2.2 });
      c.restore();
    };
    stick(-.6, th.k === 'atk' ? PAL.yel : PAL.pink); stick(.6, PAL.cyan);
    aStar(c, 63, 46, 7, PAL.yel, { ink: 1.8 });
    aDash(c, 40, 16, -2.3, 3, 9, PAL.pink, 2.6, .8, 3); aDash(c, 86, 16, -.8, 3, 9, PAL.lime, 2.6, .8, 3);
    aSpark(c, 22, 60, 6, '#fff'); aSpark(c, 106, 62, 7, PAL.yel); aPlus(c, 100, 30, 3);
  },
  axe(c, th, r) { // electric guitar + lightning
    aBG(c, th, r);
    const body = th.k === 'atk' ? PAL.cyan : PAL.pink;
    c.save(); c.translate(54, 54); c.rotate(-.62); c.scale(.84, .84);
    aSticker(c, () => auiRR(c, -3.6, -50, 7.2, 46, 2), '#d7a060', { ink: 2.2, white: 2.6, box: [-4, 0, 4, 0] });
    c.strokeStyle = 'rgba(21,16,28,.55)'; c.lineWidth = .9; for (let y = -46; y < -6; y += 6) { c.beginPath(); c.moveTo(-3.6, y); c.lineTo(3.6, y); c.stroke(); }
    aSticker(c, () => { c.beginPath(); c.moveTo(-5, -50); c.lineTo(5, -50); c.lineTo(7, -62); c.quadraticCurveTo(0, -66, -7, -62); c.closePath(); }, '#3a3448', { ink: 2.2, white: 2.6 });
    aSticker(c, () => { auiCirc(c, -9, 4, 13); auiCirc(c, 9, 2, 12, true); auiCirc(c, 0, 17, 16, true); }, body, { u: 1, ink: 2.4, white: 3, box: [-20, -10, 20, 32], hl: [-12, -1, 4, 2.4, -.6] });
    c.fillStyle = UAK; auiRR(c, -7, 3, 14, 3.6, 1.8); c.fill(); auiRR(c, -7, 10, 14, 3.6, 1.8); c.fill(); auiRR(c, -6, 22, 12, 3, 1.5); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = .6; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 1.6, -58); c.lineTo(i * 1.6, 23); c.stroke(); }
    for (const [kx, ky] of [[10, 18], [13, 25]]) { c.beginPath(); c.arc(kx, ky, 2.2, 0, TAU); c.fillStyle = PAL.yel; c.fill(); c.lineWidth = 1; c.strokeStyle = UAK; c.stroke(); }
    c.restore();
    aSticker(c, () => auiPolyR(c, [[100, 8], [116, 8], [106, 28], [116, 28], [94, 62], [100, 36], [90, 36]], 1.5), PAL.yel, { ink: 2.2, white: 2.6, hl: [104, 14, 2.5, 1.5, 0] });
    aNote(c, 26, 26, 7, PAL.lime); aSpark(c, 84, 72, 6, '#fff'); aDash(c, 110, 70, 0, 3, 7, PAL.pink, 2.4, .9, 3);
  },
  hammer(c, th, r) { // snare drum + giant stick BOOM
    aBG(c, th, r);
    const shell = th.k === 'atk' ? PAL.cyan : PAL.pink;
    aSticker(c, () => { c.beginPath(); c.moveTo(28, 50); c.lineTo(28, 70); c.ellipse(56, 70, 28, 8, 0, Math.PI, 0, true); c.lineTo(84, 50); c.ellipse(56, 50, 28, 8, 0, 0, Math.PI, false); c.closePath(); }, shell, { ink: 2.4, white: 3, box: [28, 40, 84, 78] });
    c.save(); c.strokeStyle = UAK; c.lineWidth = 1.3; c.beginPath(); for (let i = 0; i < 7; i++) { const x = 32 + i * 8; c.moveTo(x, 55); c.lineTo(x + 4, 68); c.lineTo(x + 8, 55); } c.stroke(); c.restore();
    aSticker(c, () => { c.beginPath(); c.ellipse(56, 50, 28, 8, 0, 0, TAU); }, '#fffaf0', { ink: 2.4 });
    aStar(c, 60, 44, 16, PAL.yel, { n: 9, k: .58, ink: 2.2 });
    c.save(); c.translate(62, 42); c.rotate(-2.3);
    aGroup(c, [{ b: () => { c.beginPath(); c.moveTo(-2.4, 4); c.lineTo(-4, 44); c.quadraticCurveTo(0, 47, 4, 44); c.lineTo(2.4, 4); c.closePath(); }, f: '#f4c47e', box: [-4, 0, 4, 0] }, { b: () => { c.beginPath(); c.ellipse(0, 1, 4, 5.5, 0, 0, TAU); }, f: '#f4c47e' }], { white: 2.6, ink: 2.2 });
    c.restore();
    aDash(c, 60, 44, -1.9, 4, 9, PAL.pink, 2.6, 1.6, 20);
    aNote(c, 16, 30, 7, PAL.lime); aNote(c, 104, 70, 6, PAL.cyan, true); aSpark(c, 108, 18, 6, '#fff');
  },
  shield(c, th, r) { // speaker inside a bubble shield
    aBG(c, th, r);
    c.save(); auiCirc(c, 60, 44, 36); c.fillStyle = 'rgba(150,240,250,.32)'; c.fill(); c.lineWidth = 7.5; c.strokeStyle = '#fff'; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = UAK; c.stroke(); c.restore();
    aSticker(c, () => auiRR(c, 43, 20, 34, 48, 7), '#2c3150', { ink: 2.4, box: [43, 20, 77, 68] });
    for (const [y, rr] of [[33, 7.5], [53, 11]]) { aSticker(c, () => auiCirc(c, 60, y, rr), '#c8cce0', { ink: 1.8 }); aSticker(c, () => auiCirc(c, 60, y, rr * .38), '#3a3448', { ink: 1.4 }); }
    c.fillStyle = PAL.cyan; c.beginPath(); c.arc(70, 24, 1.8, 0, TAU); c.fill();
    c.save(); c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 4; c.beginPath(); c.arc(60, 44, 30, -2.75, -1.95); c.stroke(); c.lineWidth = 3; c.beginPath(); c.arc(60, 44, 30, -1.75, -1.55); c.stroke(); c.restore();
    for (let i = 0; i < 3; i++) { c.save(); c.lineCap = 'round'; c.beginPath(); c.arc(84, 44, 20 + i * 7, -.5, .5); c.lineWidth = 5.5; c.strokeStyle = UAK; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = [PAL.pink, PAL.yel, PAL.lime][i]; c.stroke(); c.restore(); }
    aStar(c, 18, 18, 7, PAL.yel); aSpark(c, 20, 66, 5, '#fff'); aPlus(c, 112, 12, 3);
  },
  fist(c, th, r) { // POW fist
    aBG(c, th, r);
    aStar(c, 63, 42, 38, PAL.yel, { n: 12, k: .7, ink: 2.4, white: 0 });
    c.save(); c.translate(63, 46); c.rotate(-.15);
    aGroup(c, [
      { b: () => auiRR(c, -13, 16, 26, 18, 4), f: th.k === 'atk' ? PAL.cyan : PAL.pink, box: [0, 16, 0, 34] },
      { b: () => auiRR(c, -20, -12, 40, 32, 11), f: PAL.skin, box: [-20, -12, 20, 20] },
      { b: () => auiRR(c, -20, -21, 11, 17, 5.5), f: PAL.skin }, { b: () => auiRR(c, -10, -23, 11, 18, 5.5), f: PAL.skin },
      { b: () => auiRR(c, 0, -23, 11, 18, 5.5), f: PAL.skin }, { b: () => auiRR(c, 10, -21, 11, 17, 5.5), f: PAL.skin },
      { b: () => auiRR(c, -24, -2, 24, 11, 5.5), f: PAL.skin, hl: [-16, 1, 4, 1.6, 0] }
    ], { white: 3, ink: 2.3 });
    c.fillStyle = 'rgba(240,106,160,.45)'; c.beginPath(); c.ellipse(10, 8, 5, 3, 0, 0, TAU); c.fill();
    c.restore();
    aDash(c, 63, 42, -Math.PI / 2, 5, 8, PAL.pink, 2.6, 2.6, 40);
    aSpark(c, 16, 18, 6, '#fff'); aSpark(c, 110, 68, 6, PAL.pink);
  },
  bolt(c, th, r) { // lightning bolt + note
    aBG(c, th, r);
    aSticker(c, () => { auiCirc(c, 30, 12, 12); auiCirc(c, 46, 8, 14, true); auiCirc(c, 62, 12, 11, true); auiCirc(c, 18, 16, 8, true); }, '#f1ecff', { u: 1, ink: 2, white: 2.5 });
    aSticker(c, () => auiPolyR(c, [[54, 6], [80, 6], [66, 34], [84, 34], [48, 82], [58, 46], [40, 46]], 2), PAL.yel, { ink: 2.6, white: 3.2, box: [40, 6, 84, 82], hl: [62, 14, 4, 2, -.4] });
    aNote(c, 96, 52, 9, PAL.pink); aNote(c, 22, 60, 7, PAL.cyan, true);
    aDash(c, 64, 46, 0, 3, 8, PAL.lime, 2.6, 1.2, 26); aDash(c, 64, 46, Math.PI, 3, 8, PAL.pink, 2.6, 1.2, 26);
    aSpark(c, 106, 18, 7, '#fff'); aPlus(c, 30, 76, 3);
  },
  drop(c, th, r) { // glossy hot-pink drops
    aBG(c, th, r);
    const dp = (x, y, s) => () => { c.beginPath(); c.moveTo(x, y - 36 * s); c.bezierCurveTo(x + 7 * s, y - 20 * s, x + 23 * s, y - 6 * s, x + 23 * s, y + 10 * s); c.bezierCurveTo(x + 23 * s, y + 26 * s, x + 13 * s, y + 36 * s, x, y + 36 * s); c.bezierCurveTo(x - 13 * s, y + 36 * s, x - 23 * s, y + 26 * s, x - 23 * s, y + 10 * s); c.bezierCurveTo(x - 23 * s, y - 6 * s, x - 7 * s, y - 20 * s, x, y - 36 * s); c.closePath(); };
    aSticker(c, dp(63, 44, 1), PAL.pink, { ink: 2.6, white: 3.2, box: [40, 8, 86, 80], hl: [54, 52, 4.5, 9, .3] });
    aSticker(c, dp(22, 30, .34), PAL.pinkD, { ink: 1.8, white: 2, hl: [20, 32, 1.4, 3, .3] });
    aSticker(c, dp(102, 58, .4), PAL.pink, { ink: 1.8, white: 2, hl: [99, 60, 1.6, 3.4, .3] });
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(56, 66, 2.2, 0, TAU); c.fill();
    aHeart(c, 104, 20, 6, PAL.lime); aSpark(c, 30, 66, 5, '#fff'); aDash(c, 63, 44, -Math.PI / 2, 3, 7, PAL.cyan, 2.4, .9, 42);
  },
  heart(c, th, r) { // glossy heart + band-aid
    aBG(c, th, r);
    aSticker(c, () => auiHeartPath(c, 63, 42, 30), PAL.pink, { ink: 2.6, white: 3.2, box: [30, 10, 96, 76], hl: [48, 30, 7, 4, -.6] });
    c.save(); c.translate(64, 46); c.rotate(-.5);
    aSticker(c, () => auiRR(c, -28, -7.5, 56, 15, 7.5), '#f8e6c8', { ink: 2, box: [0, -7, 0, 8] });
    aSticker(c, () => auiRR(c, -8, -5, 16, 10, 2.5), '#f2c89a', { ink: 1.2 });
    c.fillStyle = 'rgba(21,16,28,.35)'; for (const x of [-20, -15, 15, 20]) for (const y of [-2.5, 2.5]) { c.beginPath(); c.arc(x, y, .9, 0, TAU); c.fill(); }
    c.restore();
    aSpark(c, 20, 18, 7, PAL.yel); aSpark(c, 108, 64, 6, '#fff'); aPlus(c, 106, 16, 4, UAK, 2); aHeart(c, 18, 64, 5, PAL.lime);
  },
  coin(c, th, r) { // coin stacks + star coin
    aBG(c, th, r);
    const coin = (x, y, rx, ry) => aSticker(c, () => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }, PAL.yel, { ink: 2, box: [x, y - ry, x, y + ry] });
    for (let i = 0; i < 6; i++) coin(30, 76 - i * 5, 18, 6);
    for (let i = 0; i < 4; i++) coin(98, 78 - i * 5, 15, 5.4);
    aSticker(c, () => auiCirc(c, 64, 36, 21), PAL.yel, { ink: 2.6, white: 3.2, box: [43, 15, 85, 57], hl: [56, 26, 5, 3, -.6] });
    c.save(); c.beginPath(); c.arc(64, 36, 15, 0, TAU); c.lineWidth = 2; c.strokeStyle = '#d89a10'; c.stroke(); c.restore();
    aStar(c, 64, 37, 9, '#fff1a0', { ink: 1.6 });
    aSpark(c, 92, 14, 7, '#fff'); aSpark(c, 36, 16, 5, PAL.pink); aDash(c, 64, 36, -Math.PI / 2, 3, 6, PAL.pink, 2.4, 1, 28);
  },
  skull(c, th, r) { // cute skull with a bow
    aBG(c, th, r);
    aSticker(c, () => { auiCirc(c, 63, 38, 24); auiRR(c, 49, 46, 28, 22, 8, true); }, '#fffaf0', { u: 1, ink: 2.4, white: 3, box: [39, 14, 87, 68] });
    for (const ex of [54, 72]) { c.fillStyle = UAK; c.beginPath(); c.ellipse(ex, 40, 7, 8, 0, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + 2.4, 37, 2.4, 0, TAU); c.fill(); c.beginPath(); c.arc(ex - 2, 43.5, 1.1, 0, TAU); c.fill(); }
    aHeart(c, 63, 51, 3, PAL.pink, { ink: 1.2 });
    c.strokeStyle = UAK; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); for (const x of [57, 63, 69]) { c.moveTo(x, 60); c.lineTo(x, 67); } c.stroke();
    c.fillStyle = 'rgba(240,106,160,.45)'; c.beginPath(); c.ellipse(46, 50, 4, 2.4, 0, 0, TAU); c.ellipse(80, 50, 4, 2.4, 0, 0, TAU); c.fill();
    aGroup(c, [{ b: () => { c.beginPath(); c.moveTo(80, 16); c.lineTo(68, 8); c.lineTo(70, 24); c.closePath(); }, f: PAL.pink }, { b: () => { c.beginPath(); c.moveTo(80, 16); c.lineTo(92, 8); c.lineTo(90, 24); c.closePath(); }, f: PAL.pink }, { b: () => auiCirc(c, 80, 16, 3.6), f: PAL.pinkD }], { ink: 2, white: 2.5 });
    aSpark(c, 20, 20, 6, PAL.yel); aSpark(c, 106, 62, 6, '#fff'); aNote(c, 22, 66, 6, PAL.lime);
  },
  eye(c, th, r) { // big glossy anime eye
    aBG(c, th, r);
    const ey = () => { c.beginPath(); c.moveTo(14, 46); c.quadraticCurveTo(63, 4, 112, 46); c.quadraticCurveTo(63, 82, 14, 46); c.closePath(); };
    aSticker(c, ey, '#ffffff', { ink: 2.6, white: 3 });
    const ic = th.k === 'skl' ? PAL.lav : th.k === 'inf' ? PAL.cyan : th.base;
    c.save(); ey(); c.clip();
    const g = c.createLinearGradient(0, 22, 0, 66); g.addColorStop(0, auiMix(ic, UAK, .45)); g.addColorStop(.55, ic); g.addColorStop(1, auiMix(ic, '#ffffff', .45));
    c.beginPath(); c.arc(63, 44, 21, 0, TAU); c.fillStyle = g; c.fill(); c.lineWidth = 2.2; c.strokeStyle = UAK; c.stroke();
    c.fillStyle = UAK; c.beginPath(); c.arc(63, 44, 9.5, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(71, 35, 6.5, 5, -.4, 0, TAU); c.fill(); c.beginPath(); c.arc(55, 53, 2.6, 0, TAU); c.fill();
    c.restore();
    c.save(); c.lineCap = 'round'; c.strokeStyle = UAK; c.lineWidth = 4.6; c.beginPath(); c.moveTo(14, 46); c.quadraticCurveTo(63, 4, 112, 46); c.stroke();
    c.lineWidth = 2.6; for (const [x, y, dx, dy] of [[100, 34, 10, -6], [106, 40, 11, -2], [92, 29, 7, -9]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y + dy); c.stroke(); } c.restore();
    aSpark(c, 18, 16, 7, PAL.yel); aSpark(c, 110, 72, 6, PAL.pink); aPlus(c, 30, 74, 3);
  },
  mouth(c, th, r) { // singing mouth + soundwaves
    aBG(c, th, r);
    for (let i = 0; i < 3; i++) for (const s of [0, Math.PI]) { c.save(); c.lineCap = 'round'; c.beginPath(); c.arc(63, 44, 32 + i * 9, s - .45, s + .45); c.lineWidth = 5.6; c.strokeStyle = UAK; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = [PAL.lime, PAL.yel, PAL.cyan][i]; c.stroke(); c.restore(); }
    const lip = th.k === 'atk' ? PAL.lav : PAL.pink;
    aSticker(c, () => { c.beginPath(); c.ellipse(63, 44, 24, 20, 0, 0, TAU); }, lip, { ink: 2.6, white: 3, box: [39, 24, 87, 64] });
    c.save(); c.beginPath(); c.ellipse(63, 46, 16, 12.5, 0, 0, TAU); c.fillStyle = '#6a1636'; c.fill(); c.clip();
    c.fillStyle = '#fff'; c.fillRect(44, 32, 40, 6); c.fillStyle = PAL.pinkL; c.beginPath(); c.ellipse(63, 57, 10, 6, 0, 0, TAU); c.fill(); c.restore();
    c.lineWidth = 2; c.strokeStyle = UAK; c.beginPath(); c.ellipse(63, 46, 16, 12.5, 0, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(50, 31, 5, 2.4, -.5, 0, TAU); c.fill();
    aNote(c, 18, 22, 7, PAL.pink); aNote(c, 98, 18, 6, PAL.lime, true); aSpark(c, 108, 70, 6, '#fff');
  },
  smoke(c, th, r) { // puffy happy cloud
    aBG(c, th, r);
    const cl = [[40, 50, 16], [58, 38, 20], [80, 42, 17], [96, 54, 12], [28, 60, 11], [62, 58, 18], [84, 62, 13]];
    aSticker(c, () => { c.beginPath(); for (const [x, y, rr] of cl) auiCirc(c, x, y, rr, true); }, '#efe8ff', { u: 1, ink: 2.4, white: 3, box: [20, 18, 108, 76] });
    c.save(); c.lineCap = 'round'; c.strokeStyle = UAK; c.lineWidth = 2.4; c.beginPath(); c.arc(54, 50, 4, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.beginPath(); c.arc(72, 50, 4, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(63, 54, 4, .2, Math.PI - .2); c.stroke(); c.restore();
    c.fillStyle = 'rgba(240,106,160,.5)'; c.beginPath(); c.ellipse(46, 55, 4.5, 2.6, 0, 0, TAU); c.ellipse(80, 55, 4.5, 2.6, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.ellipse(50, 28, 6, 3, -.4, 0, TAU); c.fill();
    aSticker(c, () => { auiCirc(c, 104, 18, 7); auiCirc(c, 112, 22, 5, true); auiCirc(c, 96, 22, 5, true); }, '#efe8ff', { u: 1, ink: 1.8, white: 2 });
    aSpark(c, 18, 18, 6, PAL.yel); aDash(c, 12, 44, Math.PI, 3, 8, PAL.pink, 2.4, .7, 0); aPlus(c, 112, 72, 3);
  },
  fire(c, th, r) { // hot pink flame
    aBG(c, th, r);
    const fl = () => { c.beginPath(); c.moveTo(63, 80); c.bezierCurveTo(34, 80, 30, 58, 40, 42); c.bezierCurveTo(44, 50, 50, 52, 51, 46); c.bezierCurveTo(48, 32, 56, 18, 66, 6); c.bezierCurveTo(68, 22, 80, 26, 82, 38); c.bezierCurveTo(86, 34, 88, 30, 88, 26); c.bezierCurveTo(100, 44, 98, 80, 63, 80); c.closePath(); };
    aSticker(c, fl, th.k === 'pwr' ? PAL.org : PAL.pink, { ink: 2.6, white: 3.2, box: [36, 6, 96, 80] });
    aSticker(c, () => { c.beginPath(); c.moveTo(63, 78); c.bezierCurveTo(48, 78, 46, 64, 54, 54); c.bezierCurveTo(58, 48, 60, 40, 64, 32); c.bezierCurveTo(68, 44, 76, 48, 76, 58); c.bezierCurveTo(80, 66, 74, 78, 63, 78); c.closePath(); }, PAL.yel, { ink: 2 });
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(63, 68, 5, 7, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(52, 40, 2.6, 6, .4, 0, TAU); c.fill();
    aSpark(c, 26, 22, 6, PAL.yel); aSpark(c, 102, 16, 5, '#fff'); aStar(c, 104, 60, 5, PAL.yel); aHeart(c, 22, 60, 4, PAL.pinkL);
  },
  cards(c, th, r) { // fan of mini sticker cards
    aBG(c, th, r);
    const card = (x, y, a, col, dood) => {
      c.save(); c.translate(x, y); c.rotate(a);
      aSticker(c, () => auiRR(c, -15, -21, 30, 42, 6), col, { ink: 2.2, white: 2.6, box: [-15, -21, 15, 21] });
      if (dood === 'heart') aHeart(c, 0, 0, 7, '#fff', { ink: 1.6 }); else if (dood === 'star') aStar(c, 0, 0, 8, '#fff', { ink: 1.6 }); else aNote(c, -2, 5, 7, '#fff');
      c.restore();
    };
    card(38, 50, -.45, PAL.cyan, 'star'); card(54, 44, -.15, PAL.lime, 'note'); card(72, 44, .15, PAL.yel, 'heart'); card(88, 50, .45, PAL.pink, 'heart');
    aSpark(c, 104, 14, 7, '#fff'); aSpark(c, 20, 16, 5, PAL.yel); aDash(c, 63, 30, -Math.PI / 2, 3, 6, PAL.pink, 2.4, 1, 18);
  },
  clock(c, th, r) { // cute alarm clock
    aBG(c, th, r);
    const body = th.k === 'skl' || th.k === 'comp' ? PAL.pink : PAL.cyan;
    c.save(); c.strokeStyle = UAK; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(48, 66); c.lineTo(42, 76); c.moveTo(78, 66); c.lineTo(84, 76); c.stroke(); c.restore();
    aSticker(c, () => auiCirc(c, 44, 20, 9), PAL.yel, { ink: 2.2, white: 2.6 }); aSticker(c, () => auiCirc(c, 82, 20, 9), PAL.yel, { ink: 2.2, white: 2.6 });
    aSticker(c, () => auiCirc(c, 63, 46, 26), body, { ink: 2.6, white: 3, box: [37, 20, 89, 72] });
    aSticker(c, () => auiCirc(c, 63, 46, 18.5), '#fffaf0', { ink: 2 });
    c.fillStyle = UAK; for (let i = 0; i < 12; i++) { const t = i / 12 * TAU; c.beginPath(); c.arc(63 + Math.cos(t) * 15, 46 + Math.sin(t) * 15, i % 3 ? .9 : 1.6, 0, TAU); c.fill(); }
    c.save(); c.lineCap = 'round'; c.strokeStyle = UAK; c.lineWidth = 2.6; c.beginPath(); c.moveTo(63, 46); c.lineTo(63, 35); c.moveTo(63, 46); c.lineTo(71, 50); c.stroke(); c.restore();
    c.fillStyle = PAL.pink; c.beginPath(); c.arc(63, 46, 2.4, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(52, 30, 6, 2.6, -.6, 0, TAU); c.fill();
    aDash(c, 30, 12, -2.4, 3, 7, PAL.pink, 2.4, .9, 2); aDash(c, 96, 12, -.7, 3, 7, PAL.lime, 2.4, .9, 2);
    aSpark(c, 108, 66, 6, '#fff'); aNote(c, 18, 60, 6, PAL.lav);
  },
  mask(c, th, r) { // masquerade mask
    aBG(c, th, r);
    const col = th.k === 'atk' || th.k === 'tac' ? PAL.lav : PAL.pink;
    c.save(); c.lineCap = 'round'; c.strokeStyle = UAK; c.lineWidth = 5.4; c.beginPath(); c.moveTo(26, 54); c.lineTo(12, 80); c.stroke(); c.strokeStyle = PAL.yel; c.lineWidth = 2.6; c.stroke(); c.restore();
    aSticker(c, () => { c.beginPath(); c.moveTo(98, 30); c.quadraticCurveTo(104, 6, 120, 4); c.quadraticCurveTo(116, 22, 98, 30); c.closePath(); }, PAL.cyan, { ink: 2, white: 2.4 });
    aSticker(c, () => { c.beginPath(); c.moveTo(18, 40); c.bezierCurveTo(22, 22, 52, 20, 63, 33); c.bezierCurveTo(74, 20, 104, 22, 108, 40); c.bezierCurveTo(110, 58, 86, 62, 74, 54); c.quadraticCurveTo(63, 46, 52, 54); c.bezierCurveTo(40, 62, 16, 58, 18, 40); c.closePath(); }, col, { ink: 2.6, white: 3, box: [18, 20, 108, 62], hl: [36, 30, 7, 2.6, -.2] });
    c.fillStyle = UAK; c.beginPath(); c.ellipse(44, 42, 9.5, 6.2, .15, 0, TAU); c.fill(); c.beginPath(); c.ellipse(82, 42, 9.5, 6.2, -.15, 0, TAU); c.fill();
    for (let i = 0; i < 7; i++) { const t = i / 6, x = lerp(28, 98, t), y = 30 - Math.sin(t * Math.PI) * 3 + (Math.abs(t - .5) < .1 ? 4 : 0); c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fillStyle = i % 2 ? PAL.yel : '#fff'; c.fill(); c.lineWidth = .8; c.strokeStyle = UAK; c.stroke(); }
    aSpark(c, 20, 14, 7, PAL.yel); aSpark(c, 110, 66, 6, '#fff'); aHeart(c, 63, 70, 5, PAL.lime);
  },
  thorn(c, th, r) { // smiley cactus
    aBG(c, th, r);
    aSticker(c, () => { auiRR(c, 54, 18, 22, 50, 11); auiRR(c, 36, 30, 12, 22, 6, true); auiRR(c, 40, 44, 18, 9, 4.5, true); auiRR(c, 82, 24, 12, 22, 6, true); auiRR(c, 72, 38, 18, 9, 4.5, true); }, th.k === 'inf' ? PAL.cyan : PAL.lime, { u: 1, ink: 2.4, white: 3, box: [36, 18, 94, 68] });
    c.save(); c.strokeStyle = UAK; c.lineWidth = 1.2; c.lineCap = 'round'; const rr = auiRng(9);
    for (let i = 0; i < 16; i++) { const x = 40 + rr() * 52, y = 22 + rr() * 40; if ((x > 56 && x < 74) || (x < 48 && y > 30 && y < 52) || (x > 82 && y > 24 && y < 46)) { c.beginPath(); c.moveTo(x - 1.5, y - 1.5); c.lineTo(x, y); c.lineTo(x + 1.5, y - 1.5); c.stroke(); } } c.restore();
    c.fillStyle = UAK; c.beginPath(); c.arc(60, 40, 1.8, 0, TAU); c.arc(70, 40, 1.8, 0, TAU); c.fill();
    c.save(); c.strokeStyle = UAK; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.arc(65, 44, 3.2, .3, Math.PI - .3); c.stroke(); c.restore();
    aSticker(c, () => { c.beginPath(); c.moveTo(42, 62); c.lineTo(88, 62); c.lineTo(83, 82); c.lineTo(47, 82); c.closePath(); }, PAL.org, { ink: 2.4, white: 3, box: [42, 62, 88, 82] });
    aSticker(c, () => auiRR(c, 38, 58, 54, 9, 3), '#ffb070', { ink: 2.2 });
    aSticker(c, () => { c.beginPath(); for (let i = 0; i < 5; i++) { const t = i / 5 * TAU - 1.57; auiCirc(c, 65 + Math.cos(t) * 5, 15 + Math.sin(t) * 5, 4.4, true); } }, PAL.pink, { u: 1, ink: 1.8, white: 2 });
    aSticker(c, () => auiCirc(c, 65, 15, 3), PAL.yel, { ink: 1.4 });
    aSpark(c, 20, 20, 6, PAL.yel); aSpark(c, 108, 68, 5, '#fff'); aPlus(c, 108, 14, 3);
  },
  boot(c, th, r) { // high-top sneaker dash
    aBG(c, th, r);
    for (let i = 0; i < 4; i++) { c.save(); c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = [PAL.pink, PAL.lime, PAL.cyan, PAL.yel][i]; c.beginPath(); c.moveTo(4 + i * 3, 30 + i * 9); c.lineTo(22 + i * 2, 30 + i * 9); c.stroke(); c.restore(); }
    const shoe = () => { c.beginPath(); c.moveTo(34, 20); c.lineTo(60, 18); c.quadraticCurveTo(62, 40, 76, 44); c.quadraticCurveTo(100, 46, 104, 58); c.lineTo(104, 62); c.lineTo(30, 62); c.quadraticCurveTo(28, 40, 34, 20); c.closePath(); };
    aSticker(c, shoe, '#f6f8ff', { ink: 2.6, white: 3, box: [30, 18, 104, 62] });
    c.save(); shoe(); c.clip();
    c.fillStyle = PAL.cyan; c.beginPath(); c.moveTo(36, 50); c.quadraticCurveTo(66, 44, 98, 52); c.lineTo(98, 58); c.quadraticCurveTo(66, 52, 36, 58); c.closePath(); c.fill(); c.lineWidth = 1.6; c.strokeStyle = UAK; c.stroke();
    c.fillStyle = th.k === 'atk' ? PAL.yel : PAL.pink; c.fillRect(30, 16, 40, 8); c.restore();
    aStar(c, 44, 36, 6, PAL.yel, { ink: 1.5 });
    c.save(); c.strokeStyle = PAL.pinkD; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(56 + i * 3, 26 + i * 5); c.lineTo(64 + i * 3, 24 + i * 5); } c.stroke(); c.restore();
    aSticker(c, () => auiRR(c, 26, 60, 82, 10, 5), PAL.lime, { ink: 2.4, white: 3 });
    c.fillStyle = 'rgba(21,16,28,.35)'; for (let x = 32; x < 104; x += 6) c.fillRect(x, 66, 3, 1.4);
    aSpark(c, 110, 22, 7, '#fff'); aNote(c, 90, 30, 6, PAL.lav);
  },
  body(c, th, r) { // flexing arm (stroke-built bubbly union)
    aBG(c, th, r);
    aStar(c, 72, 40, 34, PAL.yel, { n: 10, k: .72, ink: 2 });
    const segs = [[[22, 60], [66, 60], 22], [[66, 60], [80, 24], 18]], blobs = [[44, 50, 15], [80, 18, 12.5]];
    const pass = (extra, col) => { c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.fillStyle = col; for (const [a, b, w] of segs) { c.lineWidth = w + extra; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); } for (const [x, y, rr] of blobs) { c.beginPath(); c.arc(x, y, rr + extra / 2, 0, TAU); c.fill(); } c.restore(); };
    pass(11, '#ffffff'); pass(5, UAK); pass(0, PAL.skin);
    aSticker(c, () => auiRR(c, 6, 46, 20, 28, 7), th.k === 'atk' ? PAL.cyan : PAL.pink, { ink: 2.4, white: 3 });
    c.save(); c.strokeStyle = 'rgba(21,16,28,.7)'; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath(); c.arc(44, 52, 10, -2.7, -1.0); c.stroke();
    c.beginPath(); c.moveTo(74, 14); c.lineTo(84, 13); c.moveTo(73, 19); c.lineTo(84, 18); c.moveTo(75, 24); c.lineTo(83, 23); c.stroke(); c.restore();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(39, 42, 5, 2.4, -.4, 0, TAU); c.fill(); c.beginPath(); c.ellipse(76, 10, 3, 1.6, -.3, 0, TAU); c.fill();
    c.fillStyle = 'rgba(240,106,160,.45)'; c.beginPath(); c.ellipse(52, 58, 4, 2.2, 0, 0, TAU); c.fill();
    aDash(c, 44, 32, -Math.PI / 2, 3, 6, PAL.pink, 2.4, 1.2, 4); aSpark(c, 106, 70, 6, '#fff'); aSpark(c, 16, 18, 5, PAL.pink); aNote(c, 104, 20, 6, PAL.lav);
  },
  quake(c, th, r) { // subwoofer shockwave
    aBG(c, th, r);
    for (let i = 0; i < 2; i++) { c.save(); c.beginPath(); c.ellipse(63, 44, 44 + i * 10, 34 + i * 8, 0, 0, TAU); c.lineWidth = 6; c.strokeStyle = UAK; c.setLineDash([12, 8]); c.lineDashOffset = i * 6; c.stroke(); c.lineWidth = 3; c.strokeStyle = [PAL.pink, PAL.lime][i]; c.stroke(); c.restore(); }
    aSticker(c, () => auiRR(c, 38, 16, 50, 54, 9), '#2c3150', { ink: 2.6, white: 3, box: [38, 16, 88, 70] });
    aSticker(c, () => auiCirc(c, 63, 44, 19), '#4c5272', { ink: 2 }); aSticker(c, () => auiCirc(c, 63, 44, 12), '#6c7294', { ink: 1.6 }); aSticker(c, () => auiCirc(c, 63, 44, 5.5), '#d0d4e6', { ink: 1.4, hl: [61, 42, 2, 1.2, 0] });
    c.fillStyle = PAL.cyan; c.beginPath(); c.arc(80, 22, 1.8, 0, TAU); c.fill();
    c.save(); c.strokeStyle = UAK; c.lineWidth = 1.8; c.lineJoin = 'round'; c.beginPath(); c.moveTo(14, 82); c.lineTo(22, 74); c.lineTo(28, 80); c.lineTo(36, 72); c.moveTo(112, 82); c.lineTo(104, 75); c.lineTo(98, 80); c.lineTo(90, 72); c.stroke(); c.restore();
    for (let i = 0; i < 4; i++) { const h = [14, 24, 10, 19][i]; aSticker(c, () => auiRR(c, 6 + i * 6, 62 - h, 4.5, h, 2), [PAL.lime, PAL.pink, PAL.yel, PAL.cyan][i], { ink: 1.4 }); aSticker(c, () => auiRR(c, 98 + i * 6, 62 - h * .8, 4.5, h * .8, 2), [PAL.cyan, PAL.yel, PAL.pink, PAL.lime][i], { ink: 1.4 }); }
  },
  dust(c, th, r) { // glitter cloud toss
    aBG(c, th, r);
    aSticker(c, () => { for (const [x, y, rr] of [[70, 44, 18], [88, 36, 15], [54, 50, 13], [92, 54, 13], [76, 60, 12]]) auiCirc(c, x, y, rr, true); }, '#fff1b8', { u: 1, ink: 2.2, white: 2.8, box: [40, 20, 106, 72] });
    const cols = [PAL.pink, PAL.cyan, PAL.lime, PAL.lav, PAL.yel];
    for (let i = 0; i < 14; i++) { const x = 20 + r() * 96, y = 8 + r() * 70; aSpark(c, x, y, 2.5 + r() * 4, cols[i % cols.length], 1.1); }
    aStar(c, 30, 60, 6, PAL.pink); aStar(c, 110, 18, 5, PAL.cyan);
    aDash(c, 4, 70, -.5, 4, 14, PAL.lime, 2.6, .6, 6);
  },
  bottle(c, th, r) { // soda bottle with straw
    aBG(c, th, r);
    const liq = th.k === 'atk' ? PAL.yel : th.k === 'pwr' || th.k === 'tac' ? PAL.lav : PAL.lime;
    const bt = () => { c.beginPath(); c.moveTo(56, 10); c.lineTo(70, 10); c.lineTo(70, 24); c.quadraticCurveTo(88, 32, 88, 52); c.lineTo(88, 74); c.quadraticCurveTo(88, 80, 82, 80); c.lineTo(44, 80); c.quadraticCurveTo(38, 80, 38, 74); c.lineTo(38, 52); c.quadraticCurveTo(38, 32, 56, 24); c.closePath(); };
    c.save(); c.translate(74, 4); c.rotate(.4); aSticker(c, () => auiRR(c, -2.5, -6, 5, 40, 2.5), '#fff', { ink: 1.8, white: 2.4 }); c.fillStyle = PAL.pink; for (let y = -4; y < 32; y += 7) c.fillRect(-2.5, y, 5, 3); c.restore();
    aSticker(c, bt, '#eafcff', { ink: 2.6, white: 3.2 });
    c.save(); bt(); c.clip(); c.fillStyle = liq; c.beginPath(); c.moveTo(36, 44); c.quadraticCurveTo(63, 38, 90, 44); c.lineTo(90, 82); c.lineTo(36, 82); c.closePath(); c.fill(); c.lineWidth = 1.6; c.strokeStyle = UAK; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(43, 30, 4, 46);
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(52 + r() * 28, 50 + r() * 24, 1 + r() * 2, 0, TAU); c.stroke(); } c.restore();
    bt(); c.lineWidth = 2.6; c.strokeStyle = UAK; c.stroke();
    aSticker(c, () => auiRR(c, 46, 54, 34, 14, 4), PAL.pink, { ink: 2 }); aHeart(c, 63, 61, 4, '#fff', { ink: 1.2 });
    aSticker(c, () => auiRR(c, 54, 4, 18, 8, 3), PAL.pinkD, { ink: 2, white: 2.4 });
    aSpark(c, 20, 20, 6, PAL.yel); aSpark(c, 106, 64, 6, '#fff'); aPlus(c, 104, 20, 3);
  },
  needle(c, th, r) { // capsule pill
    aBG(c, th, r);
    const pill = (x, y, a, s, colA, colB) => {
      c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
      aGroup(c, [
        { b: () => { c.beginPath(); c.moveTo(0, -12); c.lineTo(-18, -12); c.arc(-18, 0, 12, -Math.PI / 2, Math.PI / 2, true); c.lineTo(0, 12); c.closePath(); }, f: colA, box: [0, -12, 0, 12] },
        { b: () => { c.beginPath(); c.moveTo(0, -12); c.lineTo(18, -12); c.arc(18, 0, 12, -Math.PI / 2, Math.PI / 2, false); c.lineTo(0, 12); c.closePath(); }, f: colB, box: [0, -12, 0, 12] }
      ], { white: 3, ink: 2.4 / s });
      c.fillStyle = 'rgba(255,255,255,.75)'; auiRR(c, -24, -8, 40, 3.4, 1.7); c.fill();
      c.restore();
    };
    pill(63, 44, -.55, 1, th.k === 'skl' ? PAL.pink : PAL.cyan, '#ffffff');
    pill(22, 66, .5, .4, PAL.lime, '#fff'); pill(106, 20, -.2, .38, PAL.yel, '#fff');
    aSpark(c, 100, 66, 7, '#fff'); aSpark(c, 22, 16, 5, PAL.pink); aDash(c, 63, 44, -2.4, 3, 7, PAL.lime, 2.4, .9, 34);
  },
  crown(c, th, r) { // party crown
    aBG(c, th, r);
    aSticker(c, () => auiPolyR(c, [[34, 66], [30, 26], [47, 42], [63, 16], [79, 42], [96, 26], [92, 66]], 2.4), PAL.yel, { ink: 2.6, white: 3.2, box: [30, 16, 96, 66], hl: [44, 50, 6, 2, 0] });
    aSticker(c, () => auiRR(c, 32, 56, 62, 12, 5), PAL.org, { ink: 2.2 });
    for (const [x, col] of [[46, PAL.cyan], [63, PAL.pink], [80, PAL.lime]]) aSticker(c, () => auiCirc(c, x, 62, 3.6), col, { ink: 1.4, hl: [x - 1, 61, 1.2, .8, 0] });
    for (const [x, y] of [[30, 26], [63, 16], [96, 26]]) aSticker(c, () => auiCirc(c, x, y, 3.8), '#fff', { ink: 1.6 });
    aSpark(c, 18, 16, 7, PAL.pink); aSpark(c, 108, 14, 6, PAL.cyan); aStar(c, 110, 68, 5, PAL.yel); aDash(c, 63, 16, -Math.PI / 2, 3, 6, PAL.pink, 2.4, 1.2, 6);
  },
  curse(c, th, r) { // grumpy scribble cloud
    aBG(c, AUI_TH.curse, r);
    c.save(); c.strokeStyle = 'rgba(21,16,28,.5)'; c.lineWidth = 1.6; c.lineJoin = 'round'; c.beginPath(); let px = 63, py = 44; c.moveTo(px, py);
    for (let i = 0; i < 26; i++) { const t = i * 1.9 + r(); px = 63 + Math.cos(t) * (16 + r() * 22); py = 44 + Math.sin(t) * (10 + r() * 16); c.lineTo(px, py); } c.stroke(); c.restore();
    aSticker(c, () => { for (const [x, y, rr] of [[48, 44, 15], [64, 34, 17], [82, 42, 14], [64, 52, 15]]) auiCirc(c, x, y, rr, true); }, '#c2bcca', { u: 1, ink: 2.4, white: 3, box: [32, 16, 96, 68] });
    c.save(); c.strokeStyle = UAK; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(50, 36); c.lineTo(58, 40); c.moveTo(78, 36); c.lineTo(70, 40); c.stroke();
    c.fillStyle = UAK; c.beginPath(); c.arc(56, 45, 2.4, 0, TAU); c.arc(72, 45, 2.4, 0, TAU); c.fill(); c.beginPath(); c.arc(64, 58, 5, Math.PI + .4, -.4); c.stroke(); c.restore();
    aSticker(c, () => auiPolyR(c, [[84, 60], [92, 60], [88, 68], [94, 68], [82, 82], [85, 72], [80, 72]], 1), PAL.yel, { ink: 1.6 });
    for (const [x, y] of [[44, 70], [54, 76], [70, 72]]) aSticker(c, () => { c.beginPath(); c.ellipse(x, y, 1.8, 3, 0, 0, TAU); }, PAL.cyan, { ink: 1.2 });
    aPlus(c, 20, 18, 4); aPlus(c, 108, 18, 3);
  }
};
AUI_ART.gear = AUI_ART.shield;
function auiArtFallback(c, key, th, r) {
  aBG(c, th, r);
  aSplat(c, 63, 42, 30, th.base, r, .5);
  try { icon(c, key || 'star', 63, 42, 26, { seed: 7 }); } catch (e) { }
  aSpark(c, 20, 18, 6, PAL.yel); aSpark(c, 106, 66, 6, '#fff');
}
function auiArt(key, th, v) {
  const R = AUI.res || auiRes(), id = key + '|' + th.k + '|' + v + '|' + R;
  let a = AUI.arts.get(id); if (a) return a;
  a = auiCanvas(UAW * R, UAH * R); const c = a.getContext('2d'); c.scale(R, R);
  const rng = auiRng(auiHash(id) + 11);
  const fn = AUI_ART[key];
  c.save();
  if (v === 1 && fn && !['eye', 'mouth', 'skull', 'mask', 'crown', 'bottle', 'clock', 'curse', 'smoke', 'thorn'].includes(key)) { c.translate(UAW, 0); c.scale(-1, 1); } // mirrored variant
  try { if (fn) fn(c, th, rng, v); else auiArtFallback(c, key, th, rng); } catch (e) { console.warn('art_ui illustration failed', key, e); c.restore(); c.save(); auiArtFallback(c, key, th, rng); }
  c.restore();
  aFinish(c, rng);
  AUI.arts.set(id, a); return a;
}

// =====================================================================================
// CARD FACE  (white die-cut border, ink outline, coloured sticker frame, name label, art window, rules box)
// =====================================================================================
const AUI_PAD = 16;
const AX = -63, AY = -68; // art window origin (relative to card centre)
const APY = 24, APB = 92;  // rules panel top / bottom
function auiArtWindowPath(c, d, ax, ay, aw, ah) { auiRR(c, ax, ay, aw, ah, d.kind === 'n' ? 18 : 10); }
function auiRarity(c, rar, x, y) {
  if (rar === 'rare') { aStar(c, x, y, 12, PAL.yel, { ink: 2.2, white: 2.6, hl: 1 }); aSpark(c, x + 13, y - 8, 4, '#fff', 1); }
  else if (rar === 'uncommon') aStar(c, x, y, 10, PAL.cyan, { ink: 2.2, white: 2.6, hl: 1 });
  else if (rar === 'curse') { aSticker(c, () => auiCirc(c, x, y, 8), PAL.grey, { ink: 2.2, white: 2.6 }); c.save(); c.strokeStyle = UAK; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 3.5, y - 3.5); c.lineTo(x + 3.5, y + 3.5); c.moveTo(x + 3.5, y - 3.5); c.lineTo(x - 3.5, y + 3.5); c.stroke(); c.restore(); }
  else if (rar === 'starter') aSticker(c, () => auiCirc(c, x, y, 6), PAL.cream, { ink: 2, white: 2.6 });
  else aSticker(c, () => auiCirc(c, x, y, 7.5), '#ffffff', { ink: 2.2, white: 2.6, hl: [x - 2, y - 2.5, 2.2, 1.4, -.5] });
}
function auiFace(c, d, o) {
  const hw = CW / 2, hh = CH / 2, { th, label } = auiTheme(d), rar = d.type === 'curse' ? 'curse' : (['starter', 'common', 'uncommon', 'rare'].includes(d.rarity) ? d.rarity : 'common');
  const up = !!(o.upg || d.up), fr = auiRng(auiHash(d.id || d.name || 'p'));
  // ---- die-cut white border + ink outline ----
  auiRR(c, -hw, -hh, CW, CH, 18); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(21,16,28,.28)'; c.stroke();
  auiRR(c, -hw + 3.5, -hh + 3.5, CW - 7, CH - 7, 15); c.fillStyle = UAK; c.fill();
  // ---- coloured sticker body: flat fill, polka dots, felt grain, soft light ----
  c.save(); auiRR(c, -hw + 7, -hh + 7, CW - 14, CH - 14, 12); c.clip();
  c.fillStyle = th.base; c.fillRect(-hw, -hh, CW, CH);
  c.fillStyle = auiA(th.light, .55);
  for (let y = -hh + 4, row = 0; y < hh; y += 9, row++) for (let x = -hw + (row % 2) * 4.5; x < hw; x += 9) { c.beginPath(); c.arc(x, y, 1.7, 0, TAU); c.fill(); }
  for (let i = 0; i < 260; i++) { c.fillStyle = fr() < .5 ? 'rgba(255,255,255,.14)' : 'rgba(21,16,28,.07)'; c.fillRect(-hw + fr() * CW, -hh + fr() * CH, 1, 1); }
  let g = c.createLinearGradient(-hw, -hh, hw * .3, hh); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(21,16,28,.12)'); c.fillStyle = g; c.fillRect(-hw, -hh, CW, CH);
  if (d.type === 'curse') { c.strokeStyle = 'rgba(21,16,28,.45)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-hw + 8, hh - 30); for (let i = 0; i < 12; i++) c.lineTo(-hw + 10 + fr() * 20, hh - 40 + fr() * 30); c.moveTo(hw - 8, -hh + 40); for (let i = 0; i < 10; i++) c.lineTo(hw - 28 + fr() * 20, -hh + 30 + fr() * 30); c.stroke(); }
  c.restore();
  if (up) { auiRR(c, -hw + 9.5, -hh + 9.5, CW - 19, CH - 19, 10); c.setLineDash([4, 3]); c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke(); c.setLineDash([]); }
  // ---- art window ----
  const aw = UAW, ah = UAH;
  auiArtWindowPath(c, d, AX - 3, AY - 3, aw + 6, ah + 6); c.fillStyle = UAK; c.fill();
  c.save(); auiArtWindowPath(c, d, AX, AY, aw, ah); c.clip();
  const v = auiHash(d.id || d.name || 'x') % 3;
  c.drawImage(auiArt(d.art || 'sword', th, v), AX, AY, aw, ah);
  c.restore();
  auiArtWindowPath(c, d, AX + 2, AY + 2, aw - 4, ah - 4); c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke();
  // ---- name label (cream sticker pill) ----
  const nx0 = -hw + 29, nx1 = hw - 9, ny = -hh + 9, nh = 23;
  aSticker(c, () => auiRR(c, nx0, ny, nx1 - nx0, nh, nh / 2), PAL.cream, { ink: 2.6, hl: null });
  c.fillStyle = 'rgba(255,255,255,.75)'; auiRR(c, nx0 + 8, ny + 3, (nx1 - nx0) * .4, 3, 1.5); c.fill();
  const nm = d.name + (up ? '+' : '');
  let fs = 17; c.font = `800 ${fs}px ${FD}`; while (fs > 10 && c.measureText(nm).width > nx1 - nx0 - 14) { fs -= 1; c.font = `800 ${fs}px ${FD}`; }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = up ? PAL.limeD : UAK; c.fillText(nm, (nx0 + nx1) / 2 + 2, ny + nh / 2 + 1.5);
  // ---- rules box (cream paper label with coloured inner border, like the poster box) ----
  const px = AX, py = APY, pw = aw, pb = APB, ph = pb - py;
  auiRR(c, px - 2.5, py - 2.5, pw + 5, ph + 5, 12); c.fillStyle = UAK; c.fill();
  auiRR(c, px, py, pw, ph, 10); c.fillStyle = PAL.cream; c.fill();
  c.save(); auiRR(c, px, py, pw, ph, 10); c.clip(); aGrain(c, fr, CW, CH, 0); for (let i = 0; i < 90; i++) { c.fillStyle = fr() < .5 ? 'rgba(21,16,28,.05)' : 'rgba(255,255,255,.4)'; c.fillRect(px + fr() * pw, py + fr() * ph, 1 + fr() * 2, 1); } c.restore();
  auiRR(c, px + 3, py + 3, pw - 6, ph - 6, 7.5); c.lineWidth = 1.6; c.strokeStyle = auiA(th.k === 'comp' ? th.deep : th.base, .9); c.stroke();
  const tTop = py + 10, tBot = pb - 5, maxW = pw - 14, text = String(d.text || '');
  if ('letterSpacing' in c) c.letterSpacing = '0.2px';
  let size = 15, lines = 1;
  for (const s of [15, 14, 13, 12, 11]) { size = s; c.font = `${s}px ${FB}`; lines = wrapLines(c, text, maxW).length; if ((lines - 1) * (s + 1) + s * .8 <= tBot - tTop) break; }
  const lh = size + 1, block = (lines - 1) * lh + size * .78, y0 = tTop + Math.max(0, (tBot - tTop - block) / 2) + size * .78;
  const oR = C.red, oO = C.orange; C.red = PAL.pinkD; C.orange = '#e0600e';
  try { richText(c, text, 0, y0, maxW, lh, size, 'center', UAK); } finally { C.red = oR; C.orange = oO; }
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  // ---- type tag (tilted marker label straddling art / rules) ----
  c.save(); c.translate(0, AY + ah + 4); c.rotate(-.035);
  c.font = `10px ${FM}`; const tw = Math.max(46, c.measureText(label).width + 20);
  aSticker(c, () => auiRR(c, -tw / 2, -7.5, tw, 15, 7.5), '#ffffff', { ink: 2 });
  c.fillStyle = th.base; c.beginPath(); c.arc(-tw / 2 + 7, 0, 2.4, 0, TAU); c.arc(tw / 2 - 7, 0, 2.4, 0, TAU); c.fill();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = UAK; c.fillText(label, 0, 1);
  c.restore();
  // ---- rarity badge ----
  auiRarity(c, rar, 0, hh - 6);
  // ---- doodles on the frame ----
  if (rar === 'rare' || up) aStar(c, hw - 9, hh - 9, 6, up ? PAL.limeL : PAL.yel, { ink: 1.6 });
  // ---- cost gem (bubbly sticker circle) ----
  if (d.cost != null || d.type !== 'curse') {
    const cx = -hw + 15, cy = -hh + 15, R = 16;
    const gc = o.unaff ? '#bdb8c4' : (d.kind === 'n' ? PAL.yel : PAL.yel);
    aSticker(c, () => auiCirc(c, cx, cy, R), gc, { ink: 3, white: 3.4, box: [cx - R, cy - R, cx + R, cy + R], hl: [cx - 6, cy - 7, 5, 2.8, -.6] });
    if (!o.unaff) aSpark(c, cx + 13, cy + 12, 3.6, '#fff', 1);
    auiBub(c, d.cost == null ? '' : String(d.cost), cx, cy + 1.5, 24, '#ffffff', { sw: 5, white: 0 });
  }
  if (up) { aStar(c, hw - 10, -hh + 10, 9, PAL.lime, { ink: 2, white: 2.4 }); aPlus(c, hw - 10, -hh + 10.5, 3.4, '#fff', 2.2); }
}
function auiFaceKey(d, o) { return [d.id, d.name, d.text, d.cost, d.rarity, d.type, d.kind, d.art, d.pwr ? 1 : 0, d.arg ? 1 : 0, d.inf ? 1 : 0, d.comp ? 1 : 0, (o.upg || d.up) ? 1 : 0, o.unaff ? 1 : 0, AUI.res].join('|'); }
function auiFaceCanvas(d, o) {
  const R = auiRes(), key = auiFaceKey(d, o);
  let f = AUI.faces.get(key);
  if (f) { AUI.faces.delete(key); AUI.faces.set(key, f); AUI.stats.hit++; return f; }
  if (!auiFontsReady()) return null;
  AUI.stats.miss++;
  f = auiCanvas((CW + AUI_PAD * 2) * R, (CH + AUI_PAD * 2) * R); const c = f.getContext('2d');
  c.scale(R, R); c.translate(CW / 2 + AUI_PAD, CH / 2 + AUI_PAD);
  auiFace(c, d, o);
  AUI.faces.set(key, f);
  if (AUI.faces.size > AUI.max) AUI.faces.delete(AUI.faces.keys().next().value);
  return f;
}
// soft sprites (glow / shadow) - blurred once, blitted many times
function auiSoft(kind, col) {
  const key = kind + col; if (AUI.sprites[key]) return AUI.sprites[key];
  const m = 40, p = auiCanvas(CW + m * 2, CH + m * 2), c = p.getContext('2d');
  c.translate(m, m);
  if (kind === 'glow') { c.shadowColor = col; c.shadowBlur = 24; c.fillStyle = col; auiRR(c, 0, 0, CW, CH, 18); c.fill(); c.shadowBlur = 10; c.fill(); }
  else { c.shadowColor = 'rgba(30,14,48,1)'; c.shadowBlur = 10; c.fillStyle = 'rgba(30,14,48,.85)'; auiRR(c, 2, 2, CW - 4, CH - 4, 18); c.fill(); }
  AUI.sprites[key] = p; return p;
}
function auiFoil(c, d, x, y, rare) {
  const hw = CW / 2, hh = CH / 2, t = G.time;
  c.save(); auiRR(c, -hw + 3.5, -hh + 3.5, CW - 7, CH - 7, 15); c.clip();
  // keep the rules text box free of foil so text stays legible
  c.beginPath(); c.rect(-hw, -hh, CW, CH); c.rect(AX - 3, APY - 3, UAW + 6, APB - APY + 6); c.clip('evenodd');
  if (rare) {
    const ph = ((t * .25 + x * .0015 + y * .001) % 1 + 1) % 1, off = (ph - .5) * 260;
    const g = c.createLinearGradient(-hw + off, -hh, hw + off, hh);
    const hues = ['#ff9cc6', '#ffe27a', '#a6e65a', '#7fe8f4', '#c8b0f0', '#ff9cc6'];
    hues.forEach((h, i) => g.addColorStop(i / (hues.length - 1), auiA(h, .5)));
    c.globalCompositeOperation = 'overlay'; c.fillStyle = g; c.fillRect(-hw, -hh, CW, CH);
    c.globalCompositeOperation = 'source-over';
    c.save(); auiArtWindowPath(c, d, AX, AY, UAW, UAH); c.clip(); c.globalAlpha *= .16; c.fillStyle = g; c.fillRect(-hw, -hh, CW, CH); c.restore();
    const rng = auiRng(auiHash(d.id) + 3);
    for (let i = 0; i < 7; i++) { const sx = AX + rng() * UAW, sy = -hh + 8 + rng() * (APY + hh - 8), k = Math.max(0, Math.sin(t * 2.2 + i * 1.7 + x * .01)); if (k > .55) aSpark(c, sx, sy, (k - .55) * 14, '#ffffff', 1); }
  }
  const per = rare ? 3.2 : 5.5, k = (((t + x * .002) / per) % 1 + 1) % 1, bx = lerp(-hw - 90, hw + 90, k);
  const g2 = c.createLinearGradient(bx - 24, -hh, bx + 24, hh * .2);
  g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(.5, `rgba(255,255,255,${rare ? .4 : .28})`); g2.addColorStop(1, 'rgba(255,255,255,0)');
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillStyle = g2; c.fillRect(-hw, -hh, CW, CH);
  c.restore();
}

drawCard = function (c, d, x, y, rot = 0, sc = 1, o = {}) {
  c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (sc !== 1) c.scale(sc, sc);
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  const hw = CW / 2, hh = CH / 2, ga = c.globalAlpha;
  if (o.glow) { c.globalAlpha = ga * (.8 + Math.sin(G.time * 5) * .15); c.drawImage(auiSoft('glow', auiCol(o.glow)), -hw - 40, -hh - 40); c.globalAlpha = ga; }
  c.globalAlpha = ga * .4; c.drawImage(auiSoft('shadow', '#000'), -hw - 40 + 4, -hh - 40 + 7); c.globalAlpha = ga;
  const f = auiFaceCanvas(d, o);
  if (f) c.drawImage(f, -hw - AUI_PAD, -hh - AUI_PAD, CW + AUI_PAD * 2, CH + AUI_PAD * 2);
  else auiFace(c, d, o);
  if (!o.dim && (d.rarity === 'rare' || o.glow || d.rarity === 'uncommon')) auiFoil(c, d, x, y, d.rarity === 'rare');
  if (o.dim) { c.fillStyle = 'rgba(48,36,72,.55)'; auiRR(c, -hw, -hh, CW, CH, 18); c.fill(); }
  c.restore();
};

// =====================================================================================
// HUD PIECES
// =====================================================================================
glossRect = function (c, x, y, w, h, r = 8) { // vinyl sticker shine
  c.save(); auiRR(c, x, y, w, h, r); c.clip();
  c.fillStyle = 'rgba(255,255,255,.4)'; auiRR(c, x + Math.min(8, w * .1), y + 3, w * .55, Math.max(2, h * .2), h * .1); c.fill();
  c.fillStyle = 'rgba(21,16,28,.1)'; c.fillRect(x, y + h * .8, w, h * .2);
  c.restore();
};
shieldBadge = function (c, x, y, n, s = 1) { // cyan puffy star bubble
  c.save(); c.translate(x, y); c.scale(s, s);
  aSticker(c, () => auiPolyR(c, auiStarPts(0, 0, 21, 13, 5), 4), PAL.cyan, { ink: 3, white: 3.4, box: [-20, -20, 20, 20], hl: [-6, -8, 4, 2.4, -.6] });
  auiBub(c, String(n), 0, 2.5, 17, '#ffffff', { sw: 4, white: 0 });
  c.restore();
};
hpBar = function (c, u, cx, y, w = 130, h = 16, o = {}) {
  const x = cx - w / 2, r = h / 2, blk = u.block > 0;
  const base = auiCol(o.col || C.red);
  c.save();
  auiRR(c, x - 5, y - 5, w + 10, h + 10, r + 5); c.fillStyle = blk ? PAL.cyan : '#ffffff'; c.fill();
  auiRR(c, x - 2.5, y - 2.5, w + 5, h + 5, r + 2.5); c.fillStyle = UAK; c.fill();
  auiRR(c, x, y, w, h, r); c.fillStyle = auiMix(base, '#3a2a48', .72); c.fill();
  c.save(); auiRR(c, x, y, w, h, r); c.clip();
  const k = clamp(u.dhp / u.maxhp, 0, 1), k2 = clamp(u.hp / u.maxhp, 0, 1);
  if (k > k2) { c.fillStyle = PAL.yel; c.fillRect(x, y, w * k, h); }
  c.fillStyle = base; auiRR(c, x, y, Math.max(h, w * k2), h, r); if (k2 > 0) c.fill();
  c.fillStyle = 'rgba(21,16,28,.16)'; c.fillRect(x, y + h * .68, w * k2, h * .32);
  c.fillStyle = 'rgba(255,255,255,.6)'; if (w * k2 > 12) { auiRR(c, x + 5, y + 2.4, w * k2 - 10, Math.max(2, h * .22), 2); c.fill(); }
  const sx = x + ((G.time * 40) % (w + 60)) - 30; const gg = c.createLinearGradient(sx - 12, 0, sx + 12, 0); gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(.5, 'rgba(255,255,255,.25)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gg; c.fillRect(Math.max(x, sx - 12), y, Math.min(24, w * k2), h);
  if (u.maxhp <= 300) { c.fillStyle = 'rgba(21,16,28,.22)'; const step = u.maxhp > 120 ? 25 : 10; for (let v = step; v < u.maxhp; v += step) c.fillRect(Math.round(x + w * v / u.maxhp), y + h * .55, 1.2, h * .45); }
  c.restore();
  auiBub(c, `${Math.max(0, Math.ceil(u.hp))}/${u.maxhp}`, cx, y + h / 2 + 1, 13, '#ffffff', { sw: 3.4, white: 0 });
  if (blk) shieldBadge(c, x - 8, y + h / 2, u.block, .9);
  c.restore();
};
intentBubble = function (c, x, y, ic, label, col = '#e04a42') { // white speech bubble sticker
  const ac = auiCol(col);
  c.save();
  aSticker(c, () => { auiCirc(c, x, y, 27); c.moveTo(x - 9, y + 20); c.lineTo(x + 2, y + 38); c.lineTo(x + 9, y + 21); c.closePath(); }, '#fffdf6', { u: 1, ink: 2.4, white: 3, box: [x - 27, y - 27, x + 27, y + 27] });
  c.beginPath(); c.arc(x, y, 21, 0, TAU); c.fillStyle = auiA(ac, .22); c.fill(); c.lineWidth = 2.2; c.setLineDash([5, 4]); c.strokeStyle = auiA(ac, .9); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(x - 12, y - 16, 6, 3, -.6, 0, TAU); c.fill();
  icon(c, ic, x, y - 1, 16);
  if (label) auiBub(c, label, x + 33, y + 3, 30, auiMix(ac, '#ffffff', .15), { align: 'left', sw: 6, white: 4, rot: -.04 });
  c.restore();
};

// ---------- buttons: chunky glossy stickers that sink when pressed ----------
UI.btn = function (x, y, w, h, label, o = {}) {
  const dis = !!o.disabled, hov = !dis && UI.hit(x, y, w, h);
  const id = label + '|' + x + '|' + y;
  if (hov) { UI.hotCur = id; UI.cursor = 'pointer'; if (UI.hotPrev !== id) Snd.play('hover'); }
  const press = hov && In.down;
  const ht = AUI.btnT[id] = lerp(AUI.btnT[id] || 0, hov ? 1 : 0, .3);
  const c = ctx; c.save(); c.translate(x + w / 2, y + h / 2);
  if (ht > .01 && !press) c.rotate(Math.sin(G.time * 7) * .012 * ht);
  const col = dis ? '#c4bfca' : auiCol(o.col || C.mustard);
  const hw = w / 2, hh = h / 2, depth = Math.max(3, Math.min(6, h * .12)), dy = press ? depth - 1 : -ht * 2;
  const rad = Math.min(h / 2, 18);
  const path = (oy, g = 0) => {
    if (o.slant) { const s = 12; auiPolyR(c, [[-hw + s - g, -hh - g + oy], [hw + g, -hh - g + oy], [hw - s + g, hh + g + oy], [-hw - g, hh + g + oy]], 7 + g); }
    else auiRR(c, -hw - g, -hh - g + oy, w + g * 2, h + g * 2, rad + g);
  };
  // shadow + white die-cut border around slab and face
  path(depth + 3, 3.5); c.fillStyle = 'rgba(21,16,28,.22)'; c.fill();
  c.fillStyle = '#ffffff'; path(depth, 3.5); c.fill(); path(dy, 3.5); c.fill();
  // slab
  path(depth); c.fillStyle = auiMix(col, UAK, .42); c.fill(); c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = UAK; c.stroke();
  // face
  path(dy); c.fillStyle = hov ? auiMix(col, '#ffffff', .12) : col; c.fill();
  c.save(); path(dy); c.clip();
  c.fillStyle = 'rgba(255,255,255,.18)'; for (let i = -hw - h; i < hw; i += 14) { c.beginPath(); c.moveTo(i, hh + dy); c.lineTo(i + h, -hh + dy); c.lineTo(i + h + 4, -hh + dy); c.lineTo(i + 4, hh + dy); c.fill(); }
  c.fillStyle = 'rgba(21,16,28,.12)'; c.fillRect(-hw, hh * .45 + dy, w, hh);
  c.fillStyle = 'rgba(255,255,255,.5)'; auiRR(c, -hw + Math.min(14, w * .1), -hh + 4 + dy, w * .5, Math.max(3, h * .16), 3); c.fill();
  c.beginPath(); c.arc(hw - Math.min(14, w * .1), -hh + 7 + dy, Math.max(1.5, h * .06), 0, TAU); c.fill();
  c.restore();
  path(dy); c.lineWidth = 3; c.strokeStyle = UAK; c.stroke();
  // label
  let size = o.size || Math.min(28, h * 0.52);
  c.font = `800 ${size}px ${FD}`; while (size > 10 && c.measureText(label).width > w - 18) { size -= 1; c.font = `800 ${size}px ${FD}`; }
  auiBub(c, label, 0, dy + 1.5, size, dis ? '#eeeaf2' : (o.tc && o.tc !== C.cream ? o.tc : '#ffffff'), { sw: Math.max(3, size * .2), white: 0 });
  if (ht > .3) aSpark(c, hw - 4, -hh - 2 + dy, 6 * ht, PAL.yel, 1.3);
  c.restore();
  if (hov && In.click) { In.click = null; Snd.play('click'); return true; }
  return false;
};

// ---------- tooltip: cream speech-label with lime inner border ----------
drawTip = function (c) {
  const t = G.tip; if (!t) return;
  c.save(); c.font = `18px ${FB}`; if ('letterSpacing' in c) c.letterSpacing = '0.3px';
  const lines = wrapLines(c, t.body || '', 262); if ('letterSpacing' in c) c.letterSpacing = '0px'; const h = 50 + lines.length * 22, w = 292;
  const x = clamp(t.x + 18, 10, W - w - 10), y = clamp(t.y + 24, 70, H - h - 10);
  const tx = clamp(t.x, x + 14, x + 60), tyTip = y - 12;
  const shape = () => { auiRR(c, x, y, w, h, 16); c.moveTo(tx - 2, y + 2); c.lineTo(tx + 2, tyTip); c.lineTo(tx + 18, y + 2); c.closePath(); };
  c.save(); c.translate(4, 6); shape(); c.fillStyle = 'rgba(21,16,28,.25)'; c.fill(); c.restore();
  aSticker(c, shape, PAL.cream, { u: 1, ink: 2.4, white: 3.4 });
  c.save(); shape(); c.clip(); const r = auiRng(auiHash(t.title || 'tip')); aSplat(c, x + w - 30, y + h - 12, 46, PAL.pinkL, r, .3); aSplat(c, x + 20, y + 10, 40, PAL.limeL, r, .25); c.restore();
  auiRR(c, x + 6, y + 6, w - 12, h - 12, 11); c.lineWidth = 2.6; c.strokeStyle = PAL.lime; c.stroke();
  aStar(c, x + w - 4, y + 4, 10, PAL.yel, { ink: 2, white: 2.4, rot: .2 });
  auiBub(c, t.title || '', x + 18, y + 25, 21, PAL.pink, { align: 'left', sw: 4, white: 0, maxW: w - 40 });
  c.save(); c.strokeStyle = PAL.pink; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 18, y + 39); c.lineTo(x + 70, y + 38); c.moveTo(x + 76, y + 38); c.lineTo(x + 84, y + 38); c.stroke(); c.restore();
  const oldR = C.red, oldO = C.orange; C.red = PAL.pinkD; C.orange = '#e0600e';
  try { if ('letterSpacing' in c) c.letterSpacing = '0.3px'; richText(c, t.body || '', x + 16, y + 60, 262, 22, 18, 'left', UAK); if ('letterSpacing' in c) c.letterSpacing = '0px'; } finally { C.red = oldR; C.orange = oldO; }
  c.restore();
};

// ---------- top HUD: rounded cream sticker bar ----------
function auiHudBar() {
  const R = auiRes(), key = 'hudbar' + W + 'x' + R; if (AUI.sprites[key]) return AUI.sprites[key];
  const hgt = 70, p = auiCanvas(W * R, hgt * R), c = p.getContext('2d'); c.scale(R, R);
  c.fillStyle = 'rgba(21,16,28,.25)'; auiRR(c, 6, 8, W - 10, 54, 27); c.fill();
  c.fillStyle = '#ffffff'; auiRR(c, 3, 2, W - 6, 58, 29); c.fill();
  c.fillStyle = UAK; auiRR(c, 6, 5, W - 12, 52, 26); c.fill();
  c.save(); auiRR(c, 9, 8, W - 18, 46, 23); c.clip();
  c.fillStyle = PAL.cream; c.fillRect(0, 0, W, hgt);
  const r = auiRng(77);
  for (const [sx, col] of [[150, PAL.pinkL], [520, PAL.limeL], [760, PAL.sky], [930, PAL.pinkL], [1110, PAL.limeL]]) aSplat(c, sx + r() * 40, 20 + r() * 20, 40 + r() * 16, col, r, .42);
  aGrain(c, r, W, hgt, 1600);
  c.globalAlpha = .3; aStar(c, 990, 20, 6, PAL.yel, { ink: 1.4 }); aHeart(c, 1020, 40, 5, PAL.pink, { ink: 1.3 }); aNote(c, 1036, 24, 6, PAL.lime); aSpark(c, 560, 18, 5, '#fff', 1); c.globalAlpha = 1;
  c.restore();
  auiRR(c, 13, 12, W - 26, 38, 19); c.lineWidth = 1.4; c.setLineDash([6, 5]); c.strokeStyle = 'rgba(21,16,28,.18)'; c.stroke(); c.setLineDash([]);
  AUI.sprites[key] = p; return p;
}
function auiChip(c, x, y, w, h, col, k = 1) {
  auiRR(c, x - 3.5, y - 3.5, w + 7, h + 7, h / 2 + 3.5); c.fillStyle = '#ffffff'; c.fill();
  auiRR(c, x - 1, y - 1, w + 2, h + 2, h / 2 + 1); c.fillStyle = UAK; c.fill();
  auiRR(c, x + 1.5, y + 1.5, w - 3, h - 3, h / 2 - 1.5); c.fillStyle = auiMix(col, '#ffffff', .72); c.fill();
  c.save(); auiRR(c, x + 1.5, y + 1.5, w - 3, h - 3, h / 2 - 1.5); c.clip();
  c.fillStyle = col; auiRR(c, x + 1.5, y + 1.5, Math.max(h, (w - 3) * k), h - 3, h / 2 - 1.5); if (k > 0) c.fill();
  c.fillStyle = 'rgba(21,16,28,.12)'; c.fillRect(x, y + h * .66, w, h);
  c.fillStyle = 'rgba(255,255,255,.55)'; auiRR(c, x + h * .6, y + 4, (w - h) * .7, 3.6, 1.8); c.fill();
  c.restore();
}
drawHUD = function (c, run, o = {}) {
  const ch = charById(run.char);
  c.save();
  c.drawImage(auiHudBar(), 0, 0, W, 70);
  // portrait sticker
  aSticker(c, () => auiCirc(c, 38, 31, 24), PAL.lime, { ink: 3, white: 4 });
  c.save(); c.beginPath(); c.arc(38, 31, 22.5, 0, TAU); c.clip();
  c.fillStyle = PAL.limeL; c.beginPath(); c.arc(30, 22, 16, 0, TAU); c.fill();
  c.translate(36, 31 + 54 * .3); c.scale(.3, .3); drawFigure(c, ch.spec, { t: 0, atk: 0, talk: 0 }); c.restore();
  c.beginPath(); c.arc(38, 31, 23.5, 0, TAU); c.lineWidth = 3; c.strokeStyle = UAK; c.stroke();
  aHeart(c, 56, 50, 5.5, PAL.pink, { ink: 1.6, white: 1.8 });
  auiBub(c, ch.name, 70, 26, 22, PAL.limeL, { align: 'left', sw: 4.5, white: 3, maxW: 118 });
  { let ts = 12; c.font = `${ts}px ${FM}`; while (ts > 8 && c.measureText(ch.title).width > 112) { ts -= .5; c.font = `${ts}px ${FM}`; } txt(c, ch.title, 71, 46, { size: ts, font: FM, color: '#5a4868' }); }
  // hp capsule
  const hp = o.battle ? Math.ceil(o.battle.P.hp) : run.hp, hk = clamp(hp / run.maxhp, 0, 1);
  let x = 196; auiChip(c, x, 14, 118, 30, PAL.pink, hk);
  aHeart(c, x + 4, 29, 11, PAL.pink, { ink: 2.2, white: 2.6 });
  auiBub(c, `${hp}/${run.maxhp}`, x + 66, 30, 21, '#ffffff', { sw: 4.4, white: 0 });
  if (UI.hit(x - 14, 8, 132, 40)) tip('Health', 'Your life. Carries between encounters.');
  x = 334; auiChip(c, x, 14, 92, 30, PAL.yel, 1);
  aSticker(c, () => auiCirc(c, x + 4, 29, 11), PAL.yel, { ink: 2.2, white: 2.6, hl: [x + 1, 25, 3, 1.8, -.6] }); aStar(c, x + 4, 29.5, 5, '#fff3b0', { ink: 1.2 });
  auiBub(c, `${run.money}`, x + 54, 30, 21, '#ffffff', { sw: 4.4, white: 0 });
  if (UI.hit(x - 14, 8, 106, 40)) tip('Shil', 'The local currency. Buy cards, grafts, and favours.');
  x = 446; auiChip(c, x, 14, 104, 30, PAL.lav, 1);
  aStar(c, x + 4, 29, 12, PAL.cyan, { ink: 2.2, white: 2.6 });
  auiBub(c, `Act ${run.act}`, x + 60, 30, 20, '#ffffff', { sw: 4.4, white: 0 });
  // graft sockets: round cyan stickers
  run.grafts.forEach((gk, i) => {
    const gx = 588 + i * 42, G_ = GRAFTS[gk];
    aSticker(c, () => auiCirc(c, gx, 29, 16), i % 2 ? PAL.sky : PAL.cyan, { ink: 2.6, white: 3, hl: [gx - 6, 21, 4, 2, -.6] });
    icon(c, G_.icon, gx, 29, 10);
    if (UI.hit(gx - 18, 8, 36, 42)) tip(G_.name, G_.desc);
  });
  if (!o.hideBtns) {
    if (UI.btn(1060, 11, 96, 36, 'DECK', { col: C.teal, size: 21 })) openDeckView('Your Decks', { b: run.deck, n: run.ndeck });
    if (UI.btn(1168, 11, 96, 36, 'MENU', { col: C.plum, size: 21 })) openPause();
  }
  c.restore();
};

// ---------- battle piles + AP star (behaviour copied from battle.js drawHUDParts) ----------
function auiCardBack() {
  const R = auiRes(), key = 'back' + R; if (AUI.sprites[key]) return AUI.sprites[key];
  const w = 68, h = 92, p = auiCanvas((w + 8) * R, (h + 8) * R), c = p.getContext('2d'); c.scale(R, R); c.translate(4, 4);
  auiRR(c, 0, 0, w, h, 11); c.fillStyle = '#fff'; c.fill(); c.lineWidth = .8; c.strokeStyle = 'rgba(21,16,28,.3)'; c.stroke();
  auiRR(c, 2.5, 2.5, w - 5, h - 5, 9); c.fillStyle = UAK; c.fill();
  c.save(); auiRR(c, 5, 5, w - 10, h - 10, 7); c.clip(); c.fillStyle = PAL.pink; c.fillRect(0, 0, w, h);
  c.fillStyle = PAL.lime; c.beginPath(); c.moveTo(0, h * .62); c.quadraticCurveTo(w * .5, h * .42, w, h * .5); c.lineTo(w, h); c.lineTo(0, h); c.fill();
  c.fillStyle = 'rgba(255,255,255,.3)'; for (let yy = 4, row = 0; yy < h; yy += 7, row++) for (let xx = (row % 2) * 3.5; xx < w; xx += 7) { c.beginPath(); c.arc(xx, yy, 1.2, 0, TAU); c.fill(); }
  c.restore();
  aSticker(c, () => auiCirc(c, w / 2, h / 2, 17), PAL.cream, { ink: 2.2 });
  c.save(); c.lineCap = 'round'; c.lineWidth = 6; c.strokeStyle = UAK; const loop = () => { c.beginPath(); c.ellipse(w / 2 - 6, h / 2, 6, 5, 0, 0, TAU); c.moveTo(w / 2 + 12, h / 2); c.ellipse(w / 2 + 6, h / 2, 6, 5, 0, 0, TAU); }; loop(); c.stroke(); c.lineWidth = 3; c.strokeStyle = PAL.pink; loop(); c.stroke(); c.restore();
  aStar(c, 14, 14, 5, PAL.yel, { ink: 1.3 }); aHeart(c, w - 14, h - 14, 4, '#fff', { ink: 1.2 }); aSpark(c, w - 13, 14, 4, '#fff', 1);
  AUI.sprites[key] = p; return p;
}
function auiDrawHUDParts(c) {
  const dp = this.drawPile.length, dc = this.discard.length;
  const back = auiCardBack();
  const pile = (x, y, n, lbl, bump) => {
    const s = 1 + (bump > 0 ? bump * .6 : 0);
    c.save(); c.fillStyle = 'rgba(21,16,28,.3)'; c.beginPath(); c.ellipse(x + 4, y + 48, 38, 7, 0, 0, TAU); c.fill(); c.restore();
    for (let i = 2; i >= 0; i--) { if (n > i) { c.save(); c.translate(x - i * 3, y - i * 3); c.rotate(-.1 + i * .06); c.scale(s, s); c.drawImage(back, -38, -50, 76, 100); c.restore(); } }
    if (!n) { c.save(); c.setLineDash([6, 5]); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2.6; auiRR(c, x - 34, y - 46, 68, 92, 11); c.stroke(); c.restore(); }
    aSticker(c, () => auiCirc(c, x, y, 18), lbl === 'DRAW' ? PAL.cyan : PAL.pink, { ink: 3, white: 3.4, hl: [x - 6, y - 8, 4, 2.2, -.6] });
    auiBub(c, String(n), x, y + 2, 22, '#ffffff', { sw: 4.4, white: 0 });
    c.save(); c.translate(x, y + 47); c.rotate(-.04);
    aSticker(c, () => auiRR(c, -34, -10, 68, 20, 10), PAL.cream, { ink: 2.4, white: 2.8 });
    c.font = `13px ${FM}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = UAK; c.fillText(lbl, 0, 1); c.restore();
    if (UI.hit(x - 40, y - 50, 80, 100)) { UI.cursor = 'pointer'; if (In.click) { In.click = null; Snd.play('click'); return true; } }
    return false;
  };
  if (pile(62, 652, dp, 'DRAW', 0)) openPileView('Draw Pile (shuffled)', this.drawPile.slice().sort((a, b) => a.id.localeCompare(b.id)));
  if (pile(1218, 652, dc, 'DISCARD', this.pileBump)) openPileView('Discard Pile', this.discard);
  if (this.exhaust && this.exhaust.length) auiBub(c, `Exhausted: ${this.exhaust.length}`, 1218, 536, 15, PAL.lav, { sw: 3.6, white: 2.6 });
  // AP: big bubbly star badge
  const ax = 100, ay = 555, sh = this.apShake > 0 ? Math.sin(this.apShake * 60) * 6 : 0, on = this.ap > 0;
  c.save(); c.translate(ax + sh, ay);
  const pulse = 1 + Math.sin(G.time * 4) * .03; c.scale(pulse, pulse);
  if (on) { const g = c.createRadialGradient(0, 0, 10, 0, 0, 78); g.addColorStop(0, 'rgba(255,210,58,.45)'); g.addColorStop(1, 'rgba(255,210,58,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 78, 0, TAU); c.fill(); }
  c.save(); c.rotate(Math.sin(G.time * 1.6) * .06);
  aSticker(c, () => auiPolyR(c, auiStarPts(0, 0, 50, 31, 5), 9), on ? PAL.yel : '#c4bfca', { ink: 4, white: 5, box: [-40, -40, 40, 40], hl: [-13, -18, 9, 4.5, -.6] });
  c.restore();
  if (on) { aSpark(c, 46, -40, 6, '#fff', 1.4); aSpark(c, -48, 30, 4.5, PAL.pinkL, 1.2); }
  const mx = Math.max(this.maxAp, this.ap);
  for (let i = 0; i < mx; i++) { const t = -1.5708 + (i - (mx - 1) / 2) * .36, px = Math.cos(t) * 64, py = Math.sin(t) * 64; const lit = i < this.ap; aSticker(c, () => auiCirc(c, px, py, 5.6), lit ? PAL.lime : '#5e5868', { ink: 2, white: 2, hl: lit ? [px - 1.5, py - 2, 1.8, 1.1, -.5] : null }); }
  auiBub(c, `${this.ap}/${this.maxAp}`, 0, 5, 27, '#ffffff', { sw: 5.6, white: 0 });
  c.save(); c.translate(0, 42); c.rotate(-.05);
  aSticker(c, () => auiRR(c, -21, -10, 42, 20, 10), PAL.pink, { ink: 2.6, white: 3 });
  auiBub(c, 'AP', 0, 1, 15, '#ffffff', { sw: 3.4, white: 0 }); c.restore();
  c.restore();
  if (UI.hit(ax - 42, ay - 42, 84, 84)) tip('Action Points', 'Cards cost AP to play. Refills each turn.');
}
if (typeof BattleScene !== 'undefined') BattleScene.prototype.drawHUDParts = auiDrawHUDParts;
if (typeof NegotiationScene !== 'undefined') NegotiationScene.prototype.drawHUDParts = auiDrawHUDParts;

// =====================================================================================
// MODAL PANELS: zine pages (behaviour copied verbatim from scenes.js, visuals restyled)
// =====================================================================================
function auiPanel(c, x, y, w, h) {
  const key = 'panel' + w + 'x' + h + 'r' + AUI.res;
  let p = AUI.sprites[key];
  if (!p) {
    const R = auiRes(), m = 30; p = auiCanvas((w + m * 2) * R, (h + m * 2) * R); const c2 = p.getContext('2d'); c2.scale(R, R); c2.translate(m, m);
    c2.fillStyle = 'rgba(21,16,28,.35)'; auiRR(c2, 8, 12, w, h, 26); c2.fill();
    c2.fillStyle = '#ffffff'; auiRR(c2, 0, 0, w, h, 26); c2.fill();
    c2.fillStyle = UAK; auiRR(c2, 5, 5, w - 10, h - 10, 22); c2.fill();
    c2.save(); auiRR(c2, 10, 10, w - 20, h - 20, 18); c2.clip();
    c2.fillStyle = PAL.cream; c2.fillRect(0, 0, w, h);
    const rng = auiRng(w * 7 + h);
    aSplat(c2, w * .12, h * .1, 110, PAL.pinkL, rng, .45, true); aSplat(c2, w * .92, h * .2, 100, PAL.limeL, rng, .45, true);
    aSplat(c2, w * .85, h * .92, 120, PAL.pinkL, rng, .4); aSplat(c2, w * .08, h * .85, 100, PAL.limeL, rng, .4); aSplat(c2, w * .5, h * .55, 90, PAL.sky, rng, .16);
    aHalftone(c2, w - 140, h - 110, 130, 100, PAL.pink, .18, 7);
    aGrain(c2, rng, w, h, w * h / 40);
    c2.restore();
    auiRR(c2, 22, 22, w - 44, h - 44, 12); c2.lineWidth = 3.4; c2.strokeStyle = PAL.lime; c2.stroke();
    // washi tape
    for (const [tx, ty, rot, col] of [[44, 4, -.5, PAL.pinkL], [w - 44, 4, .5, PAL.limeL]]) {
      c2.save(); c2.translate(tx, ty); c2.rotate(rot); c2.fillStyle = auiA(col, .85); c2.fillRect(-34, -11, 68, 22);
      c2.fillStyle = 'rgba(255,255,255,.35)'; for (let i = -30; i < 34; i += 9) c2.fillRect(i, -11, 4, 22);
      c2.strokeStyle = 'rgba(21,16,28,.18)'; c2.lineWidth = 1; c2.strokeRect(-34, -11, 68, 22); c2.restore();
    }
    // corner doodles
    aStar(c2, 26, h - 26, 15, PAL.lime, { ink: 2.6, white: 3, rot: -.2, hl: 1 });
    aHeart(c2, w - 28, h - 26, 13, PAL.pink, { ink: 2.6, white: 3 });
    aSpark(c2, w - 30, 40, 7, PAL.yel); aDash(c2, 40, h - 50, -2.2, 3, 10, PAL.pink, 2.6, .8, 12);
    AUI.sprites[key] = p;
  }
  c.drawImage(p, x - 30, y - 30, w + 60, h + 60);
}
function auiDim(c, a) {
  c.fillStyle = `rgba(28,20,46,${a * .9})`; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 820); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,6,20,.45)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function auiSlider(c, sx, y, sw, v) {
  auiRR(c, sx - 5, y - 18, sw + 10, 18, 9); c.fillStyle = '#fff'; c.fill();
  auiRR(c, sx - 2.5, y - 15.5, sw + 5, 13, 6.5); c.fillStyle = UAK; c.fill();
  auiRR(c, sx, y - 13, sw, 8, 4); c.fillStyle = '#efe6f6'; c.fill();
  c.save(); auiRR(c, sx, y - 13, sw, 8, 4); c.clip(); c.fillStyle = PAL.lime; c.fillRect(sx, y - 13, sw * v, 8); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(sx, y - 12, sw * v, 2.4); c.restore();
  const kx = sx + sw * v; aSticker(c, () => auiCirc(c, kx, y - 9, 11), PAL.pink, { ink: 3, white: 3.4, hl: [kx - 4, y - 13, 3.6, 2, -.6] });
}
if (typeof PauseModal !== 'undefined') PauseModal.prototype.draw = function (c) {
  UI.enabled = true;
  auiDim(c, .74);
  const px = W / 2 - 230, py = 90;
  auiPanel(c, px, py, 460, 540);
  if (this.view === 'main') {
    auiBub(c, 'PAUSED', W / 2, py + 64, 58, PAL.limeL, { sw: 8, white: 6, rot: -.03 });
    if (UI.btn(px + 60, py + 120, 340, 56, 'RESUME', { col: C.teal })) closeModal();
    if (G.run && UI.btn(px + 60, py + 190, 340, 56, 'VIEW DECKS', { col: C.mustard })) { closeModal(); openDeckView('Your Decks', { b: G.run.deck, n: G.run.ndeck }); }
    if (UI.btn(px + 60, py + 260, 340, 56, 'OPTIONS', { col: C.blue })) this.view = 'opt';
    if (UI.btn(px + 60, py + 330, 340, 56, 'HOW TO PLAY', { col: C.plum })) { closeModal(); openHelp(); }
    if (G.run) {
      if (!this.confirm) { if (UI.btn(px + 60, py + 420, 340, 56, 'ABANDON RUN', { col: C.red })) this.confirm = true; }
      else {
        txt(c, 'Abandon this run for good?', W / 2, py + 410, { size: 20, font: FM, align: 'center', color: UAK });
        if (UI.btn(px + 60, py + 425, 160, 50, 'YES', { col: C.red })) { store.del('rg_run'); G.run = null; closeModal(); go(() => setScene(new MenuScene())); }
        if (UI.btn(px + 240, py + 425, 160, 50, 'NO', { col: C.teal })) this.confirm = false;
      }
    } else if (UI.btn(px + 60, py + 420, 340, 56, 'MAIN MENU', { col: C.red })) { closeModal(); go(() => setScene(new MenuScene())); }
  } else {
    auiBub(c, 'OPTIONS', W / 2, py + 60, 50, PAL.pink, { sw: 7, white: 5, rot: -.03 });
    const s = G.settings;
    const sl = (y, label, key) => {
      txt(c, label, px + 40, y, { size: 20, font: FM, color: UAK });
      const sx = px + 200, sw = 210;
      auiSlider(c, sx, y, sw, s[key]);
      if (In.down && Math.abs(In.y - (y - 8)) < 22 && In.x > sx - 14 && In.x < sx + sw + 14 && In.dx > sx - 20 && In.dx < sx + sw + 20 && Math.abs(In.dy - (y - 8)) < 24) { s[key] = clamp((In.x - sx) / sw, 0, 1); Snd.updateVol(); this.dirty = true; }
    };
    sl(py + 140, 'Sound FX', 'sfx'); sl(py + 200, 'Music', 'music'); sl(py + 260, 'Screen Shake', 'shake');
    const tog = (y, label, key) => {
      txt(c, label, px + 40, y + 28, { size: 20, font: FM, color: UAK });
      if (UI.btn(px + 280, y, 130, 42, s[key] ? 'ON' : 'OFF', { col: s[key] ? C.green : C.grey, size: 22 })) { s[key] = s[key] ? 0 : 1; saveSettings(); }
    };
    tog(py + 290, 'Line Boil (wobble)', 'boil'); tog(py + 345, 'Fast Animations', 'fast');
    if (UI.btn(px + 60, py + 410, 340, 48, 'FULLSCREEN', { col: C.blue, size: 24 })) { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { } }
    if (UI.btn(px + 60, py + 470, 340, 48, 'BACK', { col: C.teal, size: 24 })) { this.view = 'main'; saveSettings(); }
    if (!In.down && this.dirty) { saveSettings(); this.dirty = false; }
  }
};
if (typeof HelpModal !== 'undefined') HelpModal.prototype.draw = function (c) {
  UI.enabled = true;
  auiDim(c, .8);
  auiPanel(c, 140, 60, 1000, 600);
  const pages = [
    { t: 'THE BASICS', icon: 'compass', l: ['Travel the map from left to right. Every stop is a fight, a fast talk, a shop, a campfire or a strange event.', 'Reach the BOSS at the end to clear the act. Clear both acts to rule the Rustgrift.', 'You carry two decks: a BATTLE deck of weapons and tricks, and a TALK deck of arguments and charm. Add to them after each win.'] },
    { t: 'BATTLE', icon: 'sword', l: ['Each turn you get 3 AP and draw 5 cards. Click a card (or drag it up) to play it. Click a target if it needs one.', 'Enemies telegraph their next move above their heads. Block absorbs damage. Hover icons to learn what they do.', 'Bleed hurts at turn start. Weak lowers damage dealt. Vulnerable raises damage taken. Strength adds damage.'] },
    { t: 'TALKING', icon: 'mouth', l: ['Pick TALK instead of FIGHT when an enemy can be reasoned with. Win without losing HP, and earn more shil.', 'Spend AP on Influence to wear down their Resolve. Destroy their Arguments before they pressure you or shield their core.', 'Composure soaks pressure first. If your Resolve hits zero, they get angry and the fight begins with them enraged!'] },
    { t: 'CONTROLS', icon: 'star', l: ['Mouse: click cards, drag them onto enemies, click buttons. Right-click cancels.', 'Keys: 1-9 select a card, E or Enter ends the turn, Esc opens the menu.', 'Your run auto-saves at every map stop. Use CONTINUE from the title screen.'] }
  ];
  const p = pages[this.page];
  auiBub(c, p.t, W / 2, 132, 58, [PAL.limeL, PAL.pink, PAL.cyan, PAL.yel][this.page % 4], { sw: 8, white: 6, rot: -.025 });
  aSticker(c, () => { c.beginPath(); for (const [dx, dy, rr] of [[0, 0, 34], [-24, 8, 20], [24, 6, 22], [0, 20, 22]]) auiCirc(c, W / 2 + dx, 215 + dy, rr, true); }, PAL.cream, { u: 1, ink: 3, white: 3.4 });
  icon(c, p.icon, W / 2, 218, 40);
  aSpark(c, W / 2 + 54, 190, 8, PAL.yel); aSpark(c, W / 2 - 58, 238, 6, PAL.pink);
  c.font = `26px ${FB}`; let y = 290;
  p.l.forEach(s => { const ls = wrapLines(c, s, 860); ls.forEach(l => { txt(c, l, W / 2, y, { size: 26, align: 'center', color: UAK }); y += 34; }); y += 14; });
  for (let i = 0; i < pages.length; i++) { const hx = W / 2 - (pages.length - 1) * 13 + i * 26; if (i === this.page) aHeart(c, hx, 568, 8, PAL.pink, { ink: 2, white: 2 }); else aSticker(c, () => auiCirc(c, hx, 568, 5), '#fff', { ink: 2 }); }
  if (this.page > 0 && UI.btn(170, 590, 140, 48, '< PREV', { col: C.blue, size: 24 })) this.page--;
  if (this.page < pages.length - 1 && UI.btn(970, 590, 140, 48, 'NEXT >', { col: C.teal, size: 24 })) this.page++;
  if (UI.btn(W / 2 - 80, 585, 160, 50, 'CLOSE', { col: C.red, size: 26 })) closeModal();
};
if (typeof DeckModal !== 'undefined') DeckModal.prototype.draw = function (c) {
  UI.enabled = true;
  auiDim(c, .84);
  const items = this.items(); const cols = 6, sw = 170, sh = 205, x0 = (W - cols * sw) / 2 + sw / 2, top = 195;
  const rows = Math.ceil(items.length / cols), maxScroll = Math.max(0, rows * sh - (H - top - 20));
  this.scroll = clamp(this.scroll, 0, maxScroll);
  c.save(); c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = PAL.pink; c.beginPath(); c.moveTo(W / 2 - 180, 90); c.quadraticCurveTo(W / 2, 84, W / 2 + 180, 90); c.stroke(); c.restore();
  auiBub(c, this.title, W / 2, 54, 46, PAL.limeL, { sw: 7, white: 5, rot: -.02, maxW: 820 });
  aStar(c, W / 2 - 230, 50, 11, PAL.yel, { ink: 2.2, white: 2.4, rot: -.3 }); aHeart(c, W / 2 + 232, 52, 10, PAL.pink, { ink: 2.2, white: 2.4 });
  const tabs = Object.keys(this.lists);
  if (tabs.length > 1) tabs.forEach((k, i) => {
    const bx = W / 2 - 170 + i * 180;
    if (UI.btn(bx, 98, 160, 44, (k === 'b' ? 'BATTLE ' : 'TALK ') + `(${this.lists[k].length})`, { col: this.tab === k ? C.orange : C.grey, size: 22 })) { this.tab = k; this.scroll = 0; }
  });
  else txt(c, `${items.length} cards`, W / 2, 130, { size: 20, font: FM, color: PAL.cream, align: 'center' });
  if (this.o.hint) txt(c, this.o.hint, W / 2, 172, { size: 18, font: FM, color: PAL.cream, align: 'center' });
  c.save(); c.beginPath(); c.rect(0, top - 40, W, H - top + 30); c.clip();
  let hov = -1;
  items.forEach((inst, i) => {
    const col = i % cols, row = (i / cols) | 0; const x = x0 + col * sw, y = top + 90 + row * sh - this.scroll;
    if (y < top - 120 || y > H + 120) return;
    const inside = Math.abs(In.x - x) < 70 && Math.abs(In.y - y) < 98 && In.y > top - 30;
    if (inside) hov = i;
    const d = cd(inst); const ok = this.o.canPick ? this.o.canPick(inst, this.tab) : true;
    drawCard(c, d, x, y, 0, inside ? 0.98 : 0.86, { dim: this.o.pick && !ok, glow: inside && ok && this.o.pick ? C.mustard : null });
    if (inside && In.click && this.o.pick && ok) {
      In.click = null; Snd.play('click'); closeModal(); this.o.pick(inst, this.tab); return;
    }
  });
  c.restore();
  const g = c.createLinearGradient(0, top - 40, 0, top - 10); g.addColorStop(0, 'rgba(28,20,46,.9)'); g.addColorStop(1, 'rgba(28,20,46,0)'); c.fillStyle = g; c.fillRect(0, top - 40, W, 30);
  if (hov >= 0 && this.o.preview) { const hi = items[hov]; if (hi && !hi.up) { drawCard(c, cd({ id: hi.id, up: true }), W - 150, 330, 0, 1.3, { glow: C.green }); auiBub(c, 'UPGRADED', W - 150, 478, 26, PAL.limeL, { sw: 5, white: 4, rot: -.04 }); } }
  if (hov >= 0) UI.cursor = this.o.pick ? 'pointer' : 'default';
  if (maxScroll > 0) {
    const k = this.scroll / maxScroll, th = H - top - 20;
    auiRR(c, W - 18, top, 12, th, 6); c.fillStyle = 'rgba(255,255,255,.25)'; c.fill(); c.lineWidth = 2; c.strokeStyle = UAK; c.stroke();
    aSticker(c, () => auiRR(c, W - 20, top + k * (th - 60), 16, 60, 8), PAL.lime, { ink: 2.4, white: 2.4 });
  }
  if (UI.btn(W - 160, 20, 130, 46, this.o.pick ? 'CANCEL' : 'CLOSE', { col: C.red, size: 26 })) { closeModal(); if (this.o.onClose) this.o.onClose(); }
  if (!items.length) auiBub(c, 'Nothing here.', W / 2, 400, 40, PAL.cream, { sw: 6, white: 0 });
};
// debug/perf helper
window.__aui = AUI;
