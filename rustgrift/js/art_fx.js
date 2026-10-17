'use strict';
// owned by the art_fx agent
// ===================== ART_FX: "RoxorLoops & Jasmin" sticker-zine VFX =====================
// Joyful, loud, musical: comic POW starbursts, soundwave rings, bubbly paint-swoosh slashes, sticker particles
// (notes, hearts, stars, sparkles, confetti), bubble-letter banners, pastel ambience and a bright, clean post pass.
// Everything is procedural Canvas 2D. Expensive things (sticker sprites, letter bitmaps, rays, vignettes) are cached.
// Public API (all global):
//   fxImpact(x,y,power,o)  fxSlash(x,y,ang,o)  fxHeal(x,y,o)  fxBuff(x,y,col,o)  fxDebuff(x,y,col,o)
//   fxBlock(x,y,o)  fxDeath(x,y,col,o)  fxShockwave(x,y,r,col,o)  fxFlash(x,y,r,col,o)  fxPow(x,y,r,o)  fxConfetti(x,y,n,o)
// Overrides (signature compatible): burst, floatText, updateFx, drawFx, bloomPass (-> no-op, done in postFx),
//   BattleScene.prototype.drawSlash / drawBanner; light auto-wiring wrappers (FX.autoWire) on hit/kill/addStatus.
// Burst shapes: sticker 'note' 'notes' 'heart' 'star' 'spark4' 'plusheart' 'bubble' 'swirl' 'burst' 'cloud'(='smoke'),
//   'confetti'(='rect') 'dash'(='spark','line') 'ring' 'glitter'(='ember') 'glow' 'ink'(paint drop) 'shard' 'plus' 'circle'.

const FX = { autoWire: true, hit: null, hitI: 0, grade: true, grain: false, bloomA: .32, ambient: true, words: true, cost: 0 };
G.fxx = G.fxx || [];

// ---------- palette (style bible) ----------
const FXP = {
  lime: '#6cc22e', limeL: '#a6e65a', limeD: '#3f8f1a', pink: '#f06aa0', pinkL: '#ff9cc6', pinkD: '#d63a82',
  cyan: '#3fd8e8', cyanD: '#1597b0', lav: '#b79ae8', sky: '#7fd0e8', yel: '#ffd23a', org: '#ff8a2a',
  cream: '#fbf7ea', ink: '#15101c', navy: '#14182b', white: '#ffffff'
};
const FX_CONF = [FXP.lime, FXP.pink, FXP.cyan, FXP.yel, FXP.lav, FXP.org, FXP.limeL, FXP.pinkL];
const FX_PASTEL = ['#ffb3d4', '#c8f08f', '#9fe8f2', '#ffe48a', '#d4c2f4'];

// ---------- colour + sprite caches ----------
const _rgbC = {};
function fxRGB(col) {
  let r = _rgbC[col]; if (r) return r;
  let v = [255, 255, 255];
  if (typeof col === 'string') {
    if (col[0] === '#') {
      let h = col.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h.slice(0, 6), 16); if (!isNaN(n)) v = [n >> 16, (n >> 8) & 255, n & 255];
    } else { const m = col.match(/[\d.]+/g); if (m && m.length >= 3) v = [+m[0], +m[1], +m[2]]; }
  }
  v.lum = (v[0] * .3 + v[1] * .59 + v[2] * .11) / 255;
  return (_rgbC[col] = v);
}
const fxA = (col, a) => { const v = fxRGB(col); return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${a})`; };
const fxHex6 = col => { const v = fxRGB(col); return '#' + ((1 << 24) | (v[0] << 16) | (v[1] << 8) | v[2]).toString(16).slice(1); };
function fxShade(col, k) { const v = fxRGB(col); let [r, g, b] = v; if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; } return `rgb(${r | 0},${g | 0},${b | 0})`; }
function fxMk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
// old dusk palette -> RoxorLoops palette (by value, so callers in battle.js etc. land on-theme automatically)
let _remap = null;
function fxCol(col) {
  if (typeof col !== 'string') return col;
  if (!_remap) {
    _remap = {};
    const m = [['red', FXP.pink], ['orange', FXP.org], ['mustard', FXP.yel], ['teal', FXP.cyan], ['teal2', FXP.cyanD], ['green', FXP.lime], ['sky', FXP.cyan],
    ['plum', FXP.lav], ['white', FXP.white], ['cream', FXP.cream], ['metal', FXP.sky], ['pink', FXP.pinkL], ['blue', FXP.cyanD], ['grey', FXP.lav], ['brown', FXP.org], ['paper', FXP.cream], ['paper2', FXP.yel]];
    for (const [k, v] of m) if (C[k]) _remap[C[k].toLowerCase()] = v;
    _remap['#fff'] = FXP.white; _remap['#fff6dc'] = FXP.white; _remap['#d9b3e8'] = FXP.lav;
  }
  return _remap[col.toLowerCase()] || col;
}
const _glowC = {};
function glowSprite(col) { // soft halo; 64px
  let s = _glowC[col]; if (s) return s;
  s = fxMk(64, 64); const g = s.getContext('2d'), v = fxRGB(col);
  const hot = `rgba(${(v[0] + 255 * 2) / 3 | 0},${(v[1] + 255 * 2) / 3 | 0},${(v[2] + 255 * 2) / 3 | 0},`;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hot + '1)'); gr.addColorStop(.18, fxA(col, .85)); gr.addColorStop(.45, fxA(col, .28)); gr.addColorStop(.75, fxA(col, .07)); gr.addColorStop(1, fxA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (_glowC[col] = s);
}
function smokeSprite(col) { return fxShapeSprite('cloud', fxRGB(col).lum < .4 ? FXP.cream : col); } // compat: puffs are cartoon clouds now
const _beamC = {};
function beamSprite(col = '#fff4e0') { // vertical soft light beam, tinted
  if (_beamC[col]) return _beamC[col];
  const s = fxMk(64, 256), g = s.getContext('2d');
  const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, fxA(col, 0)); h.addColorStop(.5, fxA(col, 1)); h.addColorStop(1, fxA(col, 0));
  g.fillStyle = h; g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(.6, 'rgba(0,0,0,.45)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v; g.fillRect(0, 0, 64, 256);
  return (_beamC[col] = s);
}
// seeded rng
function fxRng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// composed transform helper: base matrix B * T(x,y) * R(r) * S(s)
function fxSetT(c, B, x, y, r, s) {
  const co = Math.cos(r) * s, si = Math.sin(r) * s;
  c.setTransform(B.a * co + B.c * si, B.b * co + B.d * si, -B.a * si + B.c * co, -B.b * si + B.d * co, B.a * x + B.c * y + B.e, B.b * x + B.d * y + B.f);
}

// ---------- sticker shapes (unit radius ~1) ----------
function fxStarPath(g, n, ro, ri, a0 = -Math.PI / 2) { g.moveTo(Math.cos(a0) * ro, Math.sin(a0) * ro); for (let i = 1; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = a0 + i * Math.PI / n; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
function fxHeartPath(g, s = 1, ox = 0, oy = 0) {
  g.moveTo(ox, oy + .9 * s); g.bezierCurveTo(ox - 1.3 * s, oy + .05 * s, ox - .95 * s, oy - 1.1 * s, ox, oy - .42 * s);
  g.bezierCurveTo(ox + .95 * s, oy - 1.1 * s, ox + 1.3 * s, oy + .05 * s, ox, oy + .9 * s); g.closePath();
}
const FX_SHAPES = {
  star(g) { fxStarPath(g, 5, 1, .5); },
  burst(g) { fxStarPath(g, 12, 1, .66, -Math.PI / 2 + .1); },
  heart(g) { fxHeartPath(g, 1.05, 0, .05); },
  plusheart(g) { fxHeartPath(g, 1.05, 0, .05); },
  spark4(g) { g.moveTo(0, -1.1); g.quadraticCurveTo(.13, -.13, 1.1, 0); g.quadraticCurveTo(.13, .13, 0, 1.1); g.quadraticCurveTo(-.13, .13, -1.1, 0); g.quadraticCurveTo(-.13, -.13, 0, -1.1); g.closePath(); },
  note(g) {
    g.ellipse(-.3, .6, .38, .27, -.45, 0, 6.283); g.closePath();
    g.rect(-.02, -.98, .17, 1.52);
    g.moveTo(.1, -.98); g.bezierCurveTo(.42, -.72, .9, -.6, .62, .02); g.bezierCurveTo(.66, -.36, .42, -.46, .12, -.52); g.closePath();
  },
  notes(g) {
    g.ellipse(-.62, .62, .32, .23, -.45, 0, 6.283); g.closePath(); g.ellipse(.5, .42, .32, .23, -.45, 0, 6.283); g.closePath();
    g.rect(-.4, -.75, .15, 1.35); g.rect(.72, -.95, .15, 1.35);
    g.moveTo(-.4, -.75); g.lineTo(.87, -.95); g.lineTo(.87, -.62); g.lineTo(-.4, -.42); g.closePath();
  },
  bubble(g) { g.arc(0, 0, .95, 0, 6.283); },
  cloud(g) { for (const [x, y, r] of [[0, .05, .56], [-.52, .2, .4], [.52, .2, .42], [-.24, -.34, .42], [.28, -.3, .45]]) { g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.283); } },
  swirl: null // stroke-based, handled below
};
const _shapeC = {};
const FXS_U = 44, FXS_HALF = 72; // sprite: 144px canvas, unit radius 44px (2x res for crisp stickers)
function fxShapeSprite(shape, col) {
  const key = shape + '|' + col; let s = _shapeC[key]; if (s) return s;
  s = fxMk(FXS_HALF * 2, FXS_HALF * 2); const g = s.getContext('2d');
  g.translate(FXS_HALF, FXS_HALF); g.lineJoin = 'round'; g.lineCap = 'round';
  const U = FXS_U, path = () => { g.beginPath(); g.save(); g.scale(U, U); FX_SHAPES[shape](g); g.restore(); };
  if (shape === 'swirl') { // stink spiral
    const sp = () => { g.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * 6.283 * 2.2, r = (.12 + t * .85) * U; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } };
    sp(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 26; g.stroke(); g.strokeStyle = FXP.ink; g.lineWidth = 17; g.stroke(); g.strokeStyle = col; g.lineWidth = 8; g.stroke();
    return (_shapeC[key] = s);
  }
  const bub = shape === 'bubble';
  // white sticker border, ink outline, fill
  path(); if (!bub) { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 20; g.stroke(); }
  g.strokeStyle = bub ? fxShade(col, -.35) : FXP.ink; g.lineWidth = bub ? 6 : 10; g.stroke();
  const gr = g.createLinearGradient(0, -U, 0, U);
  if (bub) { gr.addColorStop(0, fxA(col, .1)); gr.addColorStop(1, fxA(col, .45)); }
  else if (shape === 'cloud') { gr.addColorStop(0, '#ffffff'); gr.addColorStop(.6, col); gr.addColorStop(1, fxShade(col === FXP.cream ? FXP.lav : col, -.12)); }
  else { gr.addColorStop(0, fxShade(col, .42)); gr.addColorStop(.5, col); gr.addColorStop(1, fxShade(col, -.18)); }
  g.fillStyle = gr; g.fill();
  if (!bub) { // felt grain speckle (logo texture)
    g.save(); g.clip(); const R = fxRng(shape.length * 13 + col.length);
    for (let i = 0; i < 90; i++) { g.fillStyle = R() < .5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.08)'; g.fillRect((R() - .5) * 2.2 * U, (R() - .5) * 2.2 * U, 2, 2); }
    g.restore();
  }
  if (shape === 'plusheart') { g.fillStyle = '#fff'; g.strokeStyle = FXP.ink; g.lineWidth = 5; g.beginPath(); const a = .17 * U, b = .5 * U, cy = .02 * U; g.moveTo(-a, cy - b); g.lineTo(a, cy - b); g.lineTo(a, cy - a); g.lineTo(b, cy - a); g.lineTo(b, cy + a); g.lineTo(a, cy + a); g.lineTo(a, cy + b); g.lineTo(-a, cy + b); g.lineTo(-a, cy + a); g.lineTo(-b, cy + a); g.lineTo(-b, cy - a); g.lineTo(-a, cy - a); g.closePath(); g.stroke(); g.fill(); }
  // specular highlight
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath();
  if (shape === 'note' || shape === 'notes') g.ellipse(shape === 'note' ? -.42 * U : -.72 * U, .5 * U, .11 * U, .06 * U, -.45, 0, 6.283);
  else if (bub) { g.ellipse(-.38 * U, -.42 * U, .22 * U, .12 * U, -.7, 0, 6.283); g.fill(); g.beginPath(); g.arc(.45 * U, .45 * U, .06 * U, 0, 6.283); }
  else if (shape === 'heart' || shape === 'plusheart') g.ellipse(-.45 * U, -.38 * U, .16 * U, .09 * U, -.7, 0, 6.283);
  else if (shape !== 'spark4') g.ellipse(-.25 * U, -.4 * U, .16 * U, .08 * U, -.5, 0, 6.283);
  g.fill();
  return (_shapeC[key] = s);
}
// draw a cached sticker centered at x,y with radius r (world px)
function fxSticker(c, B, shape, col, x, y, r, rot = 0) {
  const s = fxShapeSprite(shape, col); fxSetT(c, B, x, y, rot, r / FXS_U); c.drawImage(s, -FXS_HALF, -FXS_HALF);
}

// ---------- particles ----------
const FX_ADD = { glow: 1, ember: 1, glitter: 1 };
const FX_STICK = { note: 1, notes: 1, heart: 1, star: 1, spark4: 1, plusheart: 1, bubble: 1, swirl: 1, burst: 1, cloud: 1, smoke: 1, plus: 1 };
function burst(x, y, n, o = {}) {
  const shape = o.shape || 'rect', sp0 = o.spread != null ? o.spread : .6, jit = o.jit || 0, life = o.life || .4;
  const conf = shape === 'rect' || shape === 'confetti';
  const cols = Array.isArray(o.col) ? o.col.map(fxCol) : [fxCol(o.col || (conf ? null : FXP.ink)) || null];
  for (let i = 0; i < n; i++) {
    const a = o.a != null ? o.a + rnd(-sp0, sp0) : rnd(0, Math.PI * 2);
    const sp = rnd(o.min != null ? o.min : 80, o.max || 320);
    let col = pick(cols);
    if (!col || ((conf || shape === 'ink' || shape === 'circle') && fxRGB(col).lum < .2)) col = pick(FX_CONF); // dark debris -> confetti colours
    if ((shape === 'smoke' || shape === 'cloud') && fxRGB(col).lum < .45) col = FXP.cream;
    G.particles.push({
      x: x + rnd(-jit, jit), y: y + rnd(-jit, jit), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
      life: 0, max: rnd(life, life * 1.8), size: rnd(o.s0 || 4, o.s1 || 9), col,
      grav: o.grav != null ? o.grav : 500, rot: FX_STICK[shape] ? rnd(-.4, .4) : rnd(0, 6), vr: FX_STICK[shape] ? rnd(-3, 3) : rnd(-10, 10), shape, drag: o.drag != null ? o.drag : 0.5,
      seed: Math.random() * 1000 | 0, ph: Math.random() * 6.3, add: o.add != null ? o.add : !!FX_ADD[shape]
    });
  }
  if (G.particles.length > 700) G.particles.splice(0, G.particles.length - 700);
}
function fxConfetti(x, y, n = 30, o = {}) {
  burst(x, y, n, Object.assign({ shape: 'confetti', col: FX_CONF, min: 200, max: 620, up: 260, grav: 520, drag: .9, life: 1.1, s0: 6, s1: 11, jit: 20 }, o));
}

// ---------- floating text (sticker numbers) ----------
function floatText(x, y, text, col = C.cream, size = 36, o = {}) {
  text = String(text);
  for (const f of G.floaters) if (f.life < .35 && Math.abs(f.x - x) < 70 && Math.abs(f.y0 - y) < 34) y -= 34;
  const num = /^[-+]?\d+$/.test(text);
  G.floaters.push({
    x, y, y0: y, oy: 0, text, col, size, life: 0, max: o.life || (num ? 1.2 : 1.3), vy: o.vy || -70, vx: o.vx != null ? o.vx : rnd(-20, 20),
    num, crit: num && size >= 50, hvy: num ? -(size >= 50 ? 400 : 320) : 0, rot: num ? rnd(-.16, .16) : rnd(-.05, .05)
  });
}
function fxNumCol(f) { // floater fill colour on the new palette
  const c0 = (f.col || '').toLowerCase();
  if (f.num) {
    if (c0 === (C.white || '').toLowerCase() || c0 === '#fff' || c0 === '#ffffff' || c0 === (C.cream || '').toLowerCase()) return FXP.yel;
    if (c0 === (C.mustard || '').toLowerCase()) return FXP.lime;
  }
  return fxHex6(fxCol(f.col));
}
function fxFelt(g, w, h, seed) { // speckled felt texture via source-atop
  const R = fxRng(seed); g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < w * h / 90; i++) { g.fillStyle = R() < .55 ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.09)'; g.fillRect(R() * w, R() * h, 1.6, 1.6); }
  g.globalCompositeOperation = 'source-over';
}
// renders text as an inflated sticker: white border, ink outline, gradient + felt fill, gloss highlight
function fxStickerText(text, S, col, o = {}) {
  const rs = o.rs || Math.min(2, renderScale) * 1.3, font = `800 ${S}px ${FD}`;
  const m = ctx; m.save(); m.font = font; const tw = m.measureText(text).width; m.restore();
  const bw = S * (o.border != null ? o.border : .42), w = tw + bw * 2 + S * .35, h = S * 1.55 + bw * 2;
  const cv2 = fxMk(w * rs, h * rs), g = cv2.getContext('2d');
  g.scale(rs, rs); g.translate(w / 2, h / 2 + S * .08); if (o.skew !== false) g.transform(1, 0, -.08, 1, 0, 0);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
  // 3D ink drop (sticker shadow)
  const lay = o.layer || 'all';
  if (lay !== 'body') {
    if (o.drop !== false) { g.lineWidth = bw * 2; g.strokeStyle = 'rgba(21,16,28,.35)'; g.strokeText(text, S * .05, S * .09); }
    g.lineWidth = bw * 2; g.strokeStyle = '#fff'; g.strokeText(text, 0, 0);
    if (lay === 'border') return { cv: cv2, w, h };
  }
  g.lineWidth = Math.max(4, S * .22); g.strokeStyle = FXP.ink; g.strokeText(text, 0, 0);
  // fill on its own layer so texture + gloss only touch the letter body
  const fl = fxMk(w * rs, h * rs), f = fl.getContext('2d');
  f.scale(rs, rs); f.translate(w / 2, h / 2 + S * .08); if (o.skew !== false) f.transform(1, 0, -.08, 1, 0, 0);
  f.font = font; f.textAlign = 'center'; f.textBaseline = 'middle';
  const gr = f.createLinearGradient(0, -S * .45, 0, S * .45); gr.addColorStop(0, fxShade(col, .38)); gr.addColorStop(.45, col); gr.addColorStop(1, fxShade(col, -.22));
  f.fillStyle = gr; f.fillText(text, 0, 0);
  f.setTransform(1, 0, 0, 1, 0, 0); fxFelt(f, w * rs, h * rs, text.length * 7 + S);
  // gloss: white sheen on upper part of the glyphs
  f.globalCompositeOperation = 'source-atop'; f.fillStyle = 'rgba(255,255,255,.38)'; f.fillRect(0, 0, w * rs, (h / 2 - S * .2) * rs);
  f.globalCompositeOperation = 'source-over';
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(fl, 0, 0);
  return { cv: cv2, w, h };
}
function fxTextBitmap(f) {
  const r = fxStickerText(f.text, f.size, fxNumCol(f), { border: f.num ? .3 : .26 });
  f._bmp = r.cv; f._bw = r.w; f._bh = r.h;
}

// ---------- update ----------
function updateFx(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i]; p.life += dt;
    if (p.life >= p.max) { G.particles.splice(i, 1); continue; }
    p.vy += p.grav * dt; const d = Math.pow(1 - p.drag * 0.5, dt * 6); p.vx *= d;
    const sh = p.shape;
    if (sh === 'spark' || sh === 'smoke' || sh === 'cloud' || sh === 'dash' || sh === 'line') p.vy *= d;
    else if ((sh === 'rect' || sh === 'confetti') && p.vy > 0) { p.vy = Math.min(p.vy, 170); p.vx += Math.sin(G.time * 7 + p.ph) * 220 * dt; } // flutter
    else if (FX_STICK[sh] && p.grav < 0) p.vx += Math.sin(G.time * 5 + p.ph) * 60 * dt; // floaty sway
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (FX_STICK[sh]) p.vr *= Math.pow(.3, dt);
  }
  for (let i = G.floaters.length - 1; i >= 0; i--) {
    const f = G.floaters[i]; f.life += dt;
    if (f.life >= f.max) { G.floaters.splice(i, 1); continue; }
    if (f.num) {
      f.hvy += 1000 * dt; if (f.life > .5) f.hvy *= Math.pow(.02, dt);
      f.oy += f.hvy * dt; if (f.oy > 10) { f.oy = 10; f.hvy *= -.45; } // bouncier landing
      f.x += f.vx * 1.6 * dt; f.vx *= Math.pow(.15, dt);
    } else { f.x += f.vx * dt; f.y += f.vy * dt; f.vy *= Math.pow(.2, dt); }
  }
  const L = G.fxx;
  for (let i = L.length - 1; i >= 0; i--) { const e = L[i]; e.t += dt; if (e.t >= e.max + (e.delay || 0)) L.splice(i, 1); }
  if (G.shakeT > 0) { G.shakeT -= dt; if (G.shakeT <= 0) G.shake = 0; else G.shake *= Math.pow(.04, dt); }
  G.zoomPunch *= Math.pow(.001, dt); G.flash *= Math.pow(.0001, dt);
  FX.hitI *= Math.pow(.0005, dt);
}

// ---------- draw ----------
function drawFx(c) {
  const t0 = performance.now();
  const B = c.getTransform();
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  for (const p of G.particles) {
    if (p.add) continue;
    const k = 1 - p.life / p.max, al = clamp(k * 2.2, 0, 1);
    c.globalAlpha = al;
    const sh = p.shape;
    if (FX_STICK[sh]) {
      const pop = p.life < .12 ? ease.back(p.life / .12) : 1, s = p.size * pop * (sh === 'smoke' || sh === 'cloud' ? (1 + (1 - k) * 1.4) : (.55 + k * .45));
      const shp = sh === 'smoke' ? 'cloud' : sh === 'plus' ? 'plusheart' : sh;
      if (sh === 'smoke' || sh === 'cloud') c.globalAlpha = al * .85;
      if (sh === 'spark4' || sh === 'star') c.globalAlpha = al * (.8 + .2 * Math.sin(G.time * 24 + p.ph));
      fxSticker(c, B, shp, p.col, p.x, p.y, s, p.rot);
      continue;
    }
    switch (sh) {
      case 'spark': case 'dash': case 'line': { // speed-dash marker strokes
        const v = Math.hypot(p.vx, p.vy) || 1, len = Math.min(60, 8 + v * .04) * (sh === 'line' ? 1.4 : 1), ux = p.vx / v, uy = p.vy / v, w = p.size * (.6 + k * .4);
        c.setTransform(B); c.strokeStyle = FXP.ink; c.lineWidth = w * 1.5 + 3;
        c.beginPath(); c.moveTo(p.x - ux * len, p.y - uy * len); c.lineTo(p.x, p.y); c.stroke();
        c.strokeStyle = p.col; c.lineWidth = w * 1.5; c.stroke(); break;
      }
      case 'ring': { // soundwave ring
        const e = 1 - k, s = p.size * (1 + ease.out(e) * 4.5); c.setTransform(B);
        c.beginPath(); c.arc(p.x, p.y, s, 0, 6.3); c.strokeStyle = FXP.ink; c.lineWidth = 5 * k + 2.5; c.stroke();
        c.strokeStyle = p.col; c.lineWidth = 5 * k; c.stroke(); break;
      }
      case 'ink': { // paint drop with ink rim
        const s = p.size * (.6 + .4 * k); fxSetT(c, B, p.x, p.y, Math.atan2(p.vy, p.vx), 1);
        const st = 1 + Math.min(1.4, Math.hypot(p.vx, p.vy) / 500);
        c.beginPath(); c.ellipse(0, 0, s * st, s / Math.sqrt(st), 0, 0, 6.3); c.fillStyle = p.col; c.strokeStyle = FXP.ink; c.lineWidth = 1.6; c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(-s * .2, -s * .35, s * .25, 0, 6.3); c.fill(); break;
      }
      case 'circle': {
        const s = p.size * (0.4 + k * 0.6); c.setTransform(B);
        c.fillStyle = p.col; c.strokeStyle = FXP.ink; c.lineWidth = 1.8; c.beginPath(); c.arc(p.x, p.y, s, 0, 6.3); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(p.x - s * .35, p.y - s * .35, s * .3, 0, 6.3); c.fill(); break;
      }
      case 'shard': { // candy crystal chip
        const s = p.size * (0.5 + k * 0.5); fxSetT(c, B, p.x, p.y, p.rot, s);
        c.fillStyle = p.col; c.strokeStyle = FXP.ink; c.lineWidth = 2 / s;
        c.beginPath(); c.moveTo(0, -1.3); c.lineTo(.6, 0); c.lineTo(0, 1.1); c.lineTo(-.6, 0); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.moveTo(0, -1.05); c.lineTo(.3, -.1); c.lineTo(0, .1); c.closePath(); c.fill(); break;
      }
      default: { // 'rect' / 'confetti' -> fluttering paper confetti
        const s = p.size * (0.7 + k * 0.3); fxSetT(c, B, p.x, p.y, p.rot, 1);
        const fl = Math.cos(G.time * 9 + p.ph); c.scale(1, fl < 0 ? Math.min(-.15, fl) : Math.max(.15, fl));
        c.fillStyle = fl < 0 ? fxShade(p.col, -.18) : p.col; c.strokeStyle = FXP.ink; c.lineWidth = 1.4;
        if (p.seed % 4 === 0) { c.beginPath(); c.arc(0, 0, s * .45, 0, 6.3); c.fill(); c.stroke(); }
        else { c.fillRect(-s * .5, -s * .28, s, s * .56); c.strokeRect(-s * .5, -s * .28, s, s * .56); }
      }
    }
  }
  // additive pass: glitter / soft glow
  c.setTransform(B); c.globalCompositeOperation = 'lighter';
  for (const p of G.particles) {
    if (!p.add) continue;
    const k = 1 - p.life / p.max, al = clamp(k * 2, 0, 1);
    if (p.shape === 'ember' || p.shape === 'glitter') {
      const s = p.size * (0.5 + k * 0.5), tw = .5 + .5 * Math.sin(G.time * 26 + p.ph);
      c.globalAlpha = al * .45 * tw; const gs = s * 2.6; c.drawImage(glowSprite(p.col), p.x - gs, p.y - gs, gs * 2, gs * 2);
      c.globalAlpha = al * (.4 + .6 * tw); c.fillStyle = '#fff'; const L = s * 1.9 * (.6 + .4 * tw), q = s * .2;
      c.beginPath(); c.moveTo(p.x - L, p.y); c.lineTo(p.x, p.y - q); c.lineTo(p.x + L, p.y); c.lineTo(p.x, p.y + q); c.closePath();
      c.moveTo(p.x, p.y - L); c.lineTo(p.x + q, p.y); c.lineTo(p.x, p.y + L); c.lineTo(p.x - q, p.y); c.closePath(); c.fill();
    } else {
      const s = p.size * (1 + (1 - k) * .6) * 2; c.globalAlpha = al * .7; c.drawImage(glowSprite(p.col), p.x - s, p.y - s, s * 2, s * 2);
    }
  }
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  // custom effects
  for (const e of G.fxx) { const t = e.t - (e.delay || 0); if (t >= 0) { const f = FXR[e.k]; if (f) { c.setTransform(B); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; f(c, e, t / e.max, t, B); } } }
  c.setTransform(B); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  for (const f of G.floaters) drawFloater(c, f, B);
  c.restore();
  FX.cost = performance.now() - t0;
}
function drawFloater(c, f, B) {
  if (!f._bmp) fxTextBitmap(f);
  const k = f.life / f.max, t = f.life; let a = k > .75 ? 1 - (k - .75) / .25 : 1, x = f.x, y = f.y + f.oy, r = f.rot, sx, sy;
  if (f.num) {
    const pk = f.crit ? 1.3 : 1.12;
    const sc = t < .34 ? ease.elastic(t / .34) * pk - (pk - 1) * (t / .34) : 1; // bouncy elastic pop
    const sq = .2 * Math.sin(t * 30) * Math.exp(-t * 9); // squash & stretch wobble
    sx = sc * (1 + sq); sy = sc * (1 - sq);
    if (f.crit && t < .25) { x += rnd(-2.5, 2.5); y += rnd(-2.5, 2.5); }
    if (k > .75) { const e = (k - .75) / .25; sx *= 1 - e * .5; sy *= 1 - e * .5; y -= e * 30; }
  } else {
    const sc = k < .2 ? ease.elastic(k / .2) : 1; sx = sy = sc;
    if (k > .8) { const e = (k - .8) / .2; sx *= 1 - e * .3; sy *= 1 - e * .3; }
  }
  if (f.crit) { // spinning yellow starburst sticker behind crits
    c.globalAlpha = a * .95; fxSticker(c, B, 'burst', FXP.pink, x, y + 2, f.size * .95 * Math.min(1, sx), G.time * 1.5 + f.rot);
  }
  fxSetT(c, B, x, y, r, 1); c.scale(sx, sy); c.globalAlpha = a;
  c.drawImage(f._bmp, -f._bw / 2, -f._bh / 2, f._bw, f._bh);
  if (f.num && t < .07) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - t / .07) * .7; c.drawImage(f._bmp, -f._bw / 2, -f._bh / 2, f._bw, f._bh); c.globalCompositeOperation = 'source-over'; }
  c.globalAlpha = 1;
}

// ---------- comic words (cached bitmaps) ----------
const _wordC = {};
function fxWord(text, size, col) {
  const k = text + '|' + size + '|' + col; if (_wordC[k]) return _wordC[k];
  return (_wordC[k] = fxStickerText(text, size, col, { border: .34 }));
}
const FX_WORDS = ['POW!', 'BAM!', 'WHAM!', 'BOOM!', 'ZAP!', 'BONK!', 'KAPOW!', 'THUD!'];
const FX_WORDS_P = ['OOF!', 'OUCH!', 'BONK!', 'WHAM!'];

// ---------- custom effect renderers (G.fxx entries) ----------
function fxBurstPath(c, e, sc) { c.beginPath(); const n = e.spikes.length; for (let i = 0; i < n; i++) { const s = e.spikes[i], r = e.r * sc * (i % 2 ? .58 : s.l); c.lineTo(e.x + Math.cos(s.a) * r, e.y + Math.sin(s.a) * r); } c.closePath(); }
const FXR = {
  flash(c, e, k, t) { // comic POW starburst (+ optional word)
    const pop = k < .22 ? ease.back(k / .22) : 1 + (k - .22) * .12, a = k > .62 ? 1 - (k - .62) / .38 : 1;
    if (e.spikes) {
      // speed lines radiating out
      if (k < .55) {
        c.globalAlpha = (1 - k / .55); c.strokeStyle = FXP.ink; c.lineWidth = 3; c.beginPath();
        for (let i = 0; i < e.spikes.length; i += 2) { const s = e.spikes[i], ca = Math.cos(s.a + .13), sa = Math.sin(s.a + .13), r0 = e.r * (1.05 + k * .9), r1 = r0 + e.r * .35 * (1 - k); c.moveTo(e.x + ca * r0, e.y + sa * r0); c.lineTo(e.x + ca * r1, e.y + sa * r1); }
        c.stroke();
      }
      c.globalAlpha = a; c.lineJoin = 'round';
      fxBurstPath(c, e, pop); c.strokeStyle = '#fff'; c.lineWidth = 12; c.stroke(); c.strokeStyle = FXP.ink; c.lineWidth = 5.5; c.stroke(); c.fillStyle = e.col; c.fill();
      fxBurstPath(c, e, pop * .62); c.fillStyle = e.col2 || '#fff'; c.fill();
      if (k < .3) { c.globalAlpha = (1 - k / .3); c.fillStyle = '#fff'; c.beginPath(); c.arc(e.x, e.y, e.r * .3 * pop, 0, 6.3); c.fill(); }
    } else { // soft flash only
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - k) * (1 - k) * .55; const r = e.r * (.6 + ease.out(k) * .6);
      c.drawImage(glowSprite(e.col), e.x - r, e.y - r, r * 2, r * 2);
    }
    if (e.word) {
      const wb = fxWord(e.word, e.wsize || 46, e.wcol || FXP.pink), ws = (k < .3 ? ease.elastic(k / .3) : 1) * (1 + k * .1);
      fxSetT(c, e._B || c.getTransform(), e.x + e.wox, e.y + e.woy - k * 14, e.wrot, ws); c.globalAlpha = k > .7 ? 1 - (k - .7) / .3 : 1;
      c.drawImage(wb.cv, -wb.w / 2, -wb.h / 2, wb.w, wb.h);
    }
  },
  ring(c, e, k) { // soundwave rings (concentric, marker outlined)
    c.save(); c.translate(e.x, e.y); c.scale(1, e.flat || 1);
    const n = e.n || (e.flat && e.flat < 1 ? 1 : 2);
    for (let j = 0; j < n; j++) {
      const kk = clamp(k * 1.15 - j * .14, 0, 1); if (kk <= 0 || kk >= 1) continue;
      const r = lerp(e.r0, e.r * (1 - j * .18), ease.out(kk)), lw = e.lw * (1 - kk) * .6 + 1.5;
      c.globalAlpha = (1 - kk) * Math.min(1, (1 - kk) * 1.6);
      c.beginPath();
      if (e.wave) { for (let i = 0; i <= 64; i++) { const an = i / 64 * 6.283, rr = r + Math.sin(an * 10 + j) * lw * .9; i ? c.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : c.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); } c.closePath(); }
      else c.arc(0, 0, r, 0, 6.3);
      if (e.ink !== false) { c.strokeStyle = FXP.ink; c.lineWidth = lw + 4; c.stroke(); }
      c.strokeStyle = j % 2 ? (e.col2 || '#fff') : e.col; c.lineWidth = lw; c.stroke();
    }
    c.restore();
  },
  slash(c, e, k) { fxDrawSlashArc(c, e.x, e.y, e.ang, k, e.col, e.big, e.len); },
  column(c, e, k) { // pastel stage light beam (heal / buff)
    const a = Math.sin(Math.min(1, k) * Math.PI), w = e.w * (1 - k * .4), h = e.h;
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * (e.a || .4) * .6;
    c.drawImage(glowSprite(e.col), e.x - w, e.y - h * .9, w * 2, h * 1.1);
    c.globalAlpha = a * (e.a || .4); const b = beamSprite(fxHex6(e.col)); c.save(); c.translate(e.x, e.y); c.scale(1, -1); c.drawImage(b, -w * .4, -h * .1, w * .8, h * 1.05); c.restore();
  },
  chev(c, e, k) { // bouncy sticker arrows
    const dir = e.dir || -1, y = e.y + dir * ease.out(k) * 90, a = Math.sin(k * Math.PI);
    c.save(); c.translate(e.x, y); c.lineJoin = 'round'; c.lineCap = 'round';
    const s = e.s * (k < .25 ? ease.back(k / .25) : 1);
    c.beginPath(); c.moveTo(-s, -dir * s * .55); c.lineTo(0, dir * s * .55); c.lineTo(s, -dir * s * .55);
    c.globalAlpha = a; c.strokeStyle = '#fff'; c.lineWidth = s * .85; c.stroke();
    c.strokeStyle = FXP.ink; c.lineWidth = s * .58; c.stroke();
    c.strokeStyle = e.col; c.lineWidth = s * .32; c.stroke();
    c.restore();
  },
  aura(c, e, k) { // floor spotlight pool + marker ring
    c.save(); c.translate(e.x, e.y); c.scale(1, .3);
    const r = e.r * (.5 + ease.out(k) * .7), a = Math.sin(k * Math.PI);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * (e.dark ? .25 : .5); c.drawImage(glowSprite(e.col), -r, -r, r * 2, r * 2);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = a * .8; c.setLineDash([18, 14]); c.lineDashOffset = -k * 60;
    c.beginPath(); c.arc(0, 0, r * .8, 0, 6.3); c.strokeStyle = FXP.ink; c.lineWidth = 8; c.stroke(); c.strokeStyle = e.col; c.lineWidth = 4.5; c.stroke();
    c.restore();
  },
  shield(c, e, k) { // cyan star shield sticker
    const a = k < .12 ? k / .12 : 1 - Math.max(0, k - .45) / .55, r = e.r * (k < .3 ? ease.elastic(k / .3) : 1);
    c.save(); c.translate(e.x, e.y); c.rotate(Math.sin(k * 6) * .06); c.globalAlpha = a; c.lineJoin = 'round';
    const path = () => { c.beginPath(); c.save(); c.scale(r, r * 1.02); fxStarPath(c, 5, 1, .62); c.restore(); };
    path(); c.strokeStyle = '#fff'; c.lineWidth = 14; c.stroke(); c.strokeStyle = FXP.ink; c.lineWidth = 6; c.stroke();
    c.globalAlpha = a * .45; c.fillStyle = e.col; c.fill();
    // inner star outline
    c.globalAlpha = a * .9; c.beginPath(); c.save(); c.scale(r * .62, r * .62); fxStarPath(c, 5, 1, .62); c.restore(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
    // glint sweep
    path(); c.clip(); const sx = lerp(-r * 1.4, r * 1.4, ease.inOut(Math.min(1, k * 1.8)));
    c.globalAlpha = a * .8; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(sx - 18, -r * 1.2); c.lineTo(sx + 8, -r * 1.2); c.lineTo(sx - 30, r * 1.2); c.lineTo(sx - 56, r * 1.2); c.closePath(); c.fill();
    c.restore();
  },
  wisp(c, e, k, t, B) { // rising bubble trio (post-KO)
    for (let i = 0; i < 3; i++) {
      const kk = clamp(k * 1.3 - i * .15, 0, 1); if (kk <= 0 || kk >= 1) continue;
      const y = e.y - ease.out(kk) * 150 - i * 10, x = e.x + Math.sin(kk * 8 + i * 2) * 18 + (i - 1) * 22;
      c.globalAlpha = 1 - kk; fxSticker(c, B, 'bubble', i === 1 ? FXP.pinkL : FXP.cyan, x, y, 12 + i * 4, 0);
    }
  },
  orbit(c, e, k, t, B) { // dizzy KO stars orbiting
    const a = k > .7 ? 1 - (k - .7) / .3 : Math.min(1, k * 6);
    for (let i = 0; i < e.n; i++) {
      const an = t * 5 + i / e.n * 6.283, x = e.x + Math.cos(an) * e.r, y = e.y + Math.sin(an) * e.r * .32, front = Math.sin(an) > 0;
      c.globalAlpha = a * (front ? 1 : .75); fxSticker(c, B, i % 2 ? 'star' : 'spark4', e.cols[i % e.cols.length], x, y, (front ? 13 : 10), an);
    }
  },
  swirl(c, e, k, t, B) { // purple stink spirals + wavy stink lines
    const a = k < .15 ? k / .15 : 1 - Math.max(0, k - .6) / .4;
    for (let i = 0; i < 2; i++) {
      const x = e.x + (i ? 34 : -30), y = e.y - ease.out(k) * 30 - i * 14, s = (i ? 16 : 20) * (k < .2 ? ease.back(k / .2) : 1);
      c.globalAlpha = a; fxSticker(c, B, 'swirl', e.col, x, y, s, -t * (i ? 7 : 6));
    }
    c.setTransform(B); c.globalAlpha = a * .9; c.lineCap = 'round';
    for (let j = -1; j <= 1; j++) {
      c.beginPath(); const x0 = e.x + j * 26, yb = e.y + 30 - k * 40;
      for (let i = 0; i <= 12; i++) { const yy = yb - i * 5, xx = x0 + Math.sin(i * .9 - t * 9 + j) * 6; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
      c.strokeStyle = FXP.ink; c.lineWidth = 6; c.stroke(); c.strokeStyle = e.col2 || FXP.lime; c.lineWidth = 3; c.stroke();
    }
  },
  eq(c, e, k) { // equalizer bars popping (buff)
    const a = k < .1 ? k / .1 : 1 - Math.max(0, k - .65) / .35, n = 7, bw = 9, gap = 4, x0 = e.x - (n * (bw + gap) - gap) / 2;
    c.globalAlpha = a; c.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const h = (10 + 34 * Math.abs(Math.sin(k * 14 + i * 1.3)) * Math.sin(Math.min(1, k * 1.5) * Math.PI)) * (1 - Math.abs(i - 3) * .12);
      const x = x0 + i * (bw + gap), y = e.y - h;
      c.fillStyle = i % 2 ? e.col : (e.col2 || FXP.yel); c.strokeStyle = FXP.ink; c.lineWidth = 3;
      c.beginPath(); if (c.roundRect) c.roundRect(x, y, bw, h, 4); else c.rect(x, y, bw, h); c.fill(); c.stroke();
    }
  }
};

// ---------- slash: bubbly paint swoosh / soundwave arc ----------
function fxDrawSlashArc(c, x, y, ang, k, col, big, len) {
  col = fxCol(col); if (col === FXP.white) col = FXP.lime;
  const L = len || (big ? 220 : 150), Wm = (big ? 36 : 25);
  const hd = ease.out(clamp(k / .38, 0, 1)), tl = Math.pow(clamp((k - .12) / .88, 0, 1), 1.5);
  if (hd - tl < .01) return;
  const N = 18, top = [], bot = [], mid = [];
  const fade = 1 - Math.pow(Math.max(0, k - .6) / .4, 1.5);
  for (let i = 0; i <= N; i++) {
    const u = i / N, s = lerp(tl, hd, u) * 2 - 1;
    const px = s * L, py = -(1 - s * s) * L * .34;
    const tx = 1, ty = 2 * s * .34; const tn = Math.hypot(tx, ty), nx = -ty / tn, ny = tx / tn;
    const w = Wm * Math.pow(Math.sin(u * Math.PI * .92 + .08), .8) * (.4 + .6 * fade); // bubbly: rounded at both ends
    top.push([px - nx * w * .8, py - ny * w * .8]); bot.push([px + nx * w * .25, py + ny * w * .25]); mid.push([px - nx * w * .28, py - ny * w * .28]);
  }
  c.save(); c.translate(x, y); c.rotate(ang); c.lineJoin = 'round'; c.lineCap = 'round';
  const poly = (A, Bp) => { c.beginPath(); c.moveTo(A[0][0], A[0][1]); for (let i = 1; i < A.length; i++) c.lineTo(A[i][0], A[i][1]); for (let i = Bp.length - 1; i >= 0; i--) c.lineTo(Bp[i][0], Bp[i][1]); c.closePath(); };
  const line = (P, off) => { c.beginPath(); for (let i = 0; i <= N; i++) { const q = P[i]; i ? c.lineTo(q[0], q[1] - off) : c.moveTo(q[0], q[1] - off); } };
  c.globalAlpha = Math.min(1, fade * 1.3);
  // trailing soundwave echoes (thin marker arcs outside the swoosh)
  for (let j = 1; j <= 2; j++) {
    const off = Wm * (.75 + j * .55); line(top, off); c.globalAlpha = fade * (1 - j * .3);
    c.strokeStyle = FXP.ink; c.lineWidth = 7 - j; c.stroke(); c.strokeStyle = j === 1 ? FXP.pink : FXP.cyan; c.lineWidth = 3.5 - j * .7; c.stroke();
  }
  c.globalAlpha = Math.min(1, fade * 1.3);
  // white sticker border, ink outline, colour body, white core
  poly(top, bot); c.strokeStyle = '#fff'; c.lineWidth = big ? 15 : 12; c.stroke();
  c.strokeStyle = FXP.ink; c.lineWidth = big ? 7 : 5.5; c.stroke(); c.fillStyle = col; c.fill();
  const core = top.map((q, i) => [lerp(bot[i][0], q[0], .55), lerp(bot[i][1], q[1], .55)]);
  poly(core, bot); c.fillStyle = '#fff'; c.fill();
  // gloss dots along body
  c.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 5; i < N - 3; i += 5) { const q = top[i], m = mid[i]; c.beginPath(); c.arc(lerp(m[0], q[0], .55), lerp(m[1], q[1], .55), Wm * .09, 0, 6.3); c.fill(); }
  // speed dashes off the head
  const h = mid[N - 1];
  if (k < .6) {
    c.globalAlpha = (1 - k / .6); c.lineWidth = 4;
    for (let i = 0; i < 3; i++) { const yy = h[1] - 18 + i * 16, xx = h[0] + 18 + i * 6; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + 22 - i * 4, yy - 4 + i * 4); c.strokeStyle = FXP.ink; c.lineWidth = 7; c.stroke(); c.strokeStyle = i % 2 ? FXP.pink : FXP.lime; c.lineWidth = 3.5; c.stroke(); }
  }
  c.restore();
}
function fxSlash(x, y, ang = rnd(-.5, .5), o = {}) {
  const big = !!o.big; let col = fxCol(o.col || pick([FXP.lime, FXP.pink, FXP.cyan])); if (col === FXP.white) col = pick([FXP.lime, FXP.pink, FXP.cyan]);
  G.fxx.push({ k: 'slash', x, y, ang, t: 0, max: o.dur || .3, col, big, len: o.len });
  if (big || o.cross) G.fxx.push({ k: 'slash', x, y, ang: ang + 1.9 + rnd(-.2, .2), t: 0, delay: .06, max: o.dur || .3, col: col === FXP.pink ? FXP.lime : FXP.pink, big, len: (o.len || (big ? 220 : 150)) * .85 });
  burst(x, y, big ? 10 : 6, { shape: 'dash', col: [FXP.yel, FXP.pink, FXP.lime, col], a: ang, spread: .5, min: 400, max: 850, grav: 200, drag: .9, life: .18, s0: 2, s1: 3.5 });
  burst(x, y, big ? 4 : 2, { shape: 'spark4', col: [FXP.yel, '#fff'], a: ang, spread: .8, min: 120, max: 300, grav: 100, life: .35, s0: 7, s1: 11 });
}

// ---------- public effects ----------
function fxFlash(x, y, r = 90, col = FXP.yel, o = {}) {
  const spikes = []; const n = (o.spikes != null ? o.spikes : 10) * 2;
  for (let i = 0; i < n; i++) spikes.push({ a: i / n * 6.283 + rnd(-.08, .08), l: rnd(.85, 1.35) });
  col = fxCol(col); if (fxRGB(col).lum > .85 || /^#ff(d|e)/i.test(col)) col = FXP.yel;
  G.fxx.push({ k: 'flash', x, y, r: r * .7, col, col2: o.col2 || '#fff', t: 0, max: o.dur || .22, spikes: n ? spikes : null, delay: o.delay || 0, word: o.word || null, wsize: o.wsize, wcol: o.wcol, wox: o.wox || 0, woy: o.woy || 0, wrot: o.wrot != null ? o.wrot : rnd(-.22, .22) });
}
function fxPow(x, y, r = 80, o = {}) { // explicit comic word burst
  fxFlash(x, y, r, o.col || FXP.yel, Object.assign({ spikes: 9, dur: .55, word: o.word || pick(FX_WORDS), wsize: o.wsize || 44, wcol: o.wcol || FXP.pink, col2: o.col2 || FXP.pinkL }, o));
}
function fxShockwave(x, y, r = 120, col = FXP.cyan, o = {}) {
  G.fxx.push({ k: 'ring', x, y, r0: o.r0 || 8, r, col: fxCol(col), col2: o.col2, lw: o.lw || 10, flat: o.flat || 1, ink: o.ink, wave: !!o.wave, n: o.n, t: 0, max: (o.dur || .32) * 1.25, delay: o.delay || 0 });
}
function fxImpact(x, y, power = 1, o = {}) {
  const p = clamp(power, .2, 3), dir = o.dir != null ? o.dir : null, toP = dir === Math.PI;
  const col = fxCol(o.col || (toP ? FXP.pink : FXP.lime));
  const word = FX.words && !o.noWord && (o.word || (p >= 1.1 ? pick(toP ? FX_WORDS_P : FX_WORDS) : null));
  const B = x < W / 2 ? 1 : -1; // comic word leans toward screen centre (more room, avoids neighbours)
  fxFlash(x, y, 55 + 30 * p, FXP.yel, { spikes: p > .9 ? 9 : 7, dur: word ? .5 : .16 + .05 * p, col2: toP ? FXP.pinkL : '#fff', word, wsize: 34 + 10 * p, wcol: toP ? FXP.pink : (p > 1.6 ? FXP.pink : FXP.lime), wox: B * (78 + 12 * p), woy: 10, wrot: B * rnd(.08, .22) });
  fxShockwave(x, y, 60 + 60 * p, col, { lw: 6 + 4 * p, dur: .3 + .05 * p, col2: FXP.cyan });
  if (p > 1.4) fxShockwave(x, y + 70, 140 * p, FXP.pinkL, { flat: .3, lw: 8, dur: .4, delay: .03 });
  const bo = dir != null ? { a: dir, spread: 1.1 } : {};
  burst(x, y, Math.round(6 + 5 * p), Object.assign({ shape: 'dash', col: [FXP.yel, FXP.pink, FXP.lime, FXP.cyan], min: 320, max: 650 + 250 * p, grav: 500, drag: .85, life: .2, s0: 2, s1: 3.6 }, bo));
  burst(x, y, Math.round(2 + 2 * p), Object.assign({ shape: pick(['star', 'note', 'spark4']), col: [FXP.yel, FXP.pink, FXP.cyan, FXP.lime], min: 160, max: 380, up: 140, grav: 700, drag: .6, life: .5, s0: 8, s1: 13 }, bo));
  burst(x, y, Math.round(1 + 1.5 * p), Object.assign({ shape: 'cloud', col: FXP.cream, min: 30, max: 110, grav: -50, drag: .9, life: .45, s0: 12, s1: 18 }, bo));
  if (p > .9) fxConfetti(x, y, Math.round(5 * p), Object.assign({ min: 180, max: 420, up: 120, life: .7, s0: 5, s1: 9 }, bo));
  FX.hit = { x, y }; FX.hitI = Math.max(FX.hitI, clamp((p - .6) / 1.6, 0, .8));
}
function fxHeal(x, y, o = {}) {
  const col = fxCol(o.col || FXP.lime);
  G.fxx.push({ k: 'column', x, y: y + 110, w: 70, h: 300, col: FXP.limeL, t: 0, max: .9, a: .4 });
  G.fxx.push({ k: 'aura', x, y: y + 110, r: 120, col, t: 0, max: .9 });
  fxShockwave(x, y + 110, 120, col, { flat: .3, lw: 6, dur: .6 });
  burst(x, y + 60, 9, { shape: 'plusheart', col: [col, FXP.limeL], min: 10, max: 60, up: 130, grav: -150, drag: .6, life: .9, s0: 10, s1: 15, jit: 50 });
  burst(x, y + 40, 4, { shape: 'heart', col: [FXP.pink, FXP.pinkL], min: 10, max: 60, up: 110, grav: -140, drag: .6, life: .9, s0: 7, s1: 10, jit: 50 });
  burst(x, y + 80, 10, { shape: 'glitter', col: [col, '#eaffc8'], min: 10, max: 50, up: 90, grav: -200, drag: .5, life: .9, s0: 3, s1: 5, jit: 60 });
}
function fxBuff(x, y, col = FXP.yel, o = {}) {
  col = fxCol(col);
  for (let i = 0; i < 3; i++) G.fxx.push({ k: 'chev', x, y: y + 30, s: 22, col: i % 2 ? FXP.lime : col, t: 0, max: .7, delay: i * .1, dir: -1 });
  G.fxx.push({ k: 'aura', x, y: y + 110, r: 110, col, t: 0, max: .7 });
  G.fxx.push({ k: 'eq', x, y: y - 70, col: FXP.lime, col2: col, t: 0, max: .8 });
  burst(x, y + 60, 4, { shape: pick(['note', 'notes']), col: [FXP.lime, FXP.pink, FXP.cyan, col], min: 10, max: 60, up: 150, grav: -170, drag: .6, life: .75, s0: 9, s1: 13, jit: 55 });
  burst(x, y + 40, 4, { shape: 'star', col: [col, FXP.yel], min: 10, max: 60, up: 140, grav: -160, drag: .6, life: .7, s0: 7, s1: 11, jit: 55 });
  burst(x, y + 60, 8, { shape: 'glitter', col: [col, '#fff2b0'], min: 10, max: 60, up: 140, grav: -200, drag: .6, life: .7, s0: 2.5, s1: 4.5, jit: 55 });
}
function fxDebuff(x, y, col = FXP.lav, o = {}) {
  col = fxCol(col); const pur = fxRGB(col).lum > .75 ? FXP.lav : col;
  G.fxx.push({ k: 'swirl', x, y: y - 70, col: pur === FXP.lav ? '#9a6fe0' : pur, col2: FXP.limeL, t: 0, max: 1 });
  for (let i = 0; i < 2; i++) G.fxx.push({ k: 'chev', x: x + (i ? 40 : -40), y: y - 40, s: 16, col: pur, t: 0, max: .7, delay: i * .12, dir: 1 });
  burst(x, y - 40, 4, { shape: 'cloud', col: ['#d9c9f6', '#cdeaa0'], min: 10, max: 50, grav: -30, drag: .8, life: .8, s0: 11, s1: 16, jit: 40 });
  burst(x, y - 30, 6, { shape: 'ink', col: [pur, '#9a6fe0'], min: 20, max: 80, grav: 500, drag: .3, life: .6, s0: 3, s1: 5, jit: 40 });
}
function fxBlock(x, y, o = {}) {
  G.fxx.push({ k: 'shield', x, y, r: o.r || 70, col: fxCol(o.col || FXP.cyan), t: 0, max: .6 });
  burst(x, y, 5, { shape: 'spark4', col: [FXP.cyan, '#fff', FXP.sky], min: 120, max: 300, grav: 300, life: .45, s0: 7, s1: 11 });
  burst(x, y, 5, { shape: 'shard', col: [FXP.cyan, FXP.sky, '#e8fbff'], min: 120, max: 300, grav: 600, life: .4, s0: 5, s1: 8 });
}
function fxDeath(x, y, col = FXP.pink, o = {}) {
  fxFlash(x, y, 140, FXP.yel, { spikes: 11, dur: .7, col2: FXP.pinkL, word: FX.words ? 'K.O.!' : null, wsize: 64, wcol: FXP.pink, woy: -10 });
  fxShockwave(x, y, 220, FXP.lime, { lw: 14, dur: .45, col2: FXP.pink, n: 3 });
  fxShockwave(x, y + 90, 260, FXP.yel, { flat: .28, lw: 10, dur: .55, delay: .05 });
  burst(x, y, 6, { shape: 'cloud', col: FXP.cream, min: 40, max: 170, up: 60, grav: -50, drag: .85, life: .8, s0: 16, s1: 26, jit: 30 });
  fxConfetti(x, y, 26, { up: 320 });
  burst(x, y, 7, { shape: 'star', col: [FXP.yel, FXP.pink, FXP.lime, FXP.cyan], min: 150, max: 420, up: 200, grav: 600, life: .9, s0: 9, s1: 15 });
  burst(x, y, 3, { shape: 'note', col: [FXP.lime, FXP.pink, FXP.cyan], min: 60, max: 180, up: 200, grav: -80, life: 1, s0: 10, s1: 14 });
  G.fxx.push({ k: 'orbit', x, y: y - 40, r: 46, n: 5, cols: [FXP.yel, FXP.pink, FXP.cyan, FXP.lime], t: 0, max: 1.6, delay: .2 });
  G.fxx.push({ k: 'wisp', x, y: y - 20, t: 0, max: 1.2, delay: .25 });
  FX.hit = { x, y }; FX.hitI = Math.max(FX.hitI, .7);
}

// ---------- BattleScene overrides ----------
if (typeof BattleScene !== 'undefined') {
  const BP = BattleScene.prototype;
  BP.drawSlash = function (c, f) {
    const k = f.t / f.max;
    if (!f._sp) { f._sp = 1; f._c = (f.col && fxCol(f.col) !== FXP.white) ? fxCol(f.col) : pick([FXP.lime, FXP.pink, FXP.cyan]); burst(f.x, f.y, f.big ? 9 : 6, { shape: 'dash', col: [FXP.yel, FXP.pink, FXP.lime], a: f.a + .6, spread: .45, min: 400, max: 850, grav: 200, drag: .9, life: .16, s0: 2, s1: 3.4 }); }
    fxDrawSlashArc(c, f.x, f.y, f.a + .6, k, f._c, f.big);
    if (f.big) fxDrawSlashArc(c, f.x, f.y, f.a + .6 + 1.95, clamp((f.t - .05) / f.max, 0, 1), f._c === FXP.pink ? FXP.lime : FXP.pink, true, 180);
  };
  BP.drawBanner = function (c) { fxDrawBanner(c, this.banner); };
  const oHit = BP.hit, oKill = BP.kill, oStat = BP.addStatus;
  BP.hit = function* (src, tgt, dmg, o = {}) {
    if (FX.autoWire && tgt && !tgt.dead && !this.over) {
      const d = dmg - Math.min(tgt.block, dmg), cx = tgt.x, cy = tgt.y - 110 * tgt.scale;
      if (d > 0) fxImpact(cx, cy, clamp(d / 10, .5, 2.4), { dir: tgt === this.P ? Math.PI : 0, col: tgt === this.P ? FXP.pink : FXP.lime, noWord: d >= tgt.hp && tgt !== this.P });
      else fxBlock(cx, cy, { r: 60 + 25 * tgt.scale });
    }
    return yield* oHit.call(this, src, tgt, dmg, o);
  };
  BP.kill = function (u) { if (FX.autoWire && u && u !== this.P && !u.dead) fxDeath(u.x, u.y - 100 * u.scale, (u.spec && u.spec.coat) || FXP.pink); return oKill.call(this, u); };
  BP.addStatus = function (u, k, n, quiet) {
    const r = oStat.call(this, u, k, n, quiet);
    if (FX.autoWire && !quiet && u && typeof STATUS !== 'undefined' && STATUS[k]) {
      const bad = ['bleed', 'weak', 'vuln'].includes(k), y = u.y - 110 * u.scale, col = STATUS[k].col;
      if (bad === n > 0) fxDebuff(u.x, y, col); else fxBuff(u.x, y, col);
    }
    return r;
  };
}
// heuristic hooks via floating text (heals / block gains are inline in battle.js)
{
  const oFT = floatText;
  floatText = function (x, y, text, col, size, o) {
    const sn = G.scene && G.scene.constructor && G.scene.constructor.name;
    if (FX.autoWire && (sn === 'BattleScene' || sn === 'NegotiationScene')) {
      const s = String(text);
      if (col === C.green && /^\+\d+$/.test(s)) fxHeal(x, y + 100);
      else if (col === C.sky && /^\+\d+ (Block|Composure)$/.test(s)) fxBlock(x, y + 120, { r: 80 });
    }
    return oFT(x, y, text, col, size, o);
  };
}

// ---------- banners: inflated bubble-letter stickers ----------
const FX_BAN = [
  [/VICTORY/, FXP.lime, FXP.pink, 'you rocked the house!', 1],
  [/DEFEAT/, FXP.pink, FXP.lav, 'encore next time...', -1],
  [/TALKS BREAK/, FXP.pink, FXP.lav, 'totally off key...', -1],
  [/PERSUADED/, FXP.lime, FXP.pink, 'smooth moves!', 1],
  [/YOUR TURN/, FXP.lime, FXP.pink, 'drop the beat!', 0],
  [/ENEMY TURN|THEIR TURN/, FXP.pink, FXP.cyan, 'heads up!', 0],
  [/BATTLE/, FXP.lime, FXP.pink, "let's jam!", 1],
  [/NEGOTIATION/, FXP.cyan, FXP.pink, 'talk it out', 1]
];
function fxBannerStyle(b) {
  for (const r of FX_BAN) if (r[0].test(b.text)) return { main: r[1], alt: r[2], cap: r[3], mood: r[4] };
  const m = fxCol(b.col || FXP.lime); return { main: m === FXP.yel ? FXP.lime : m, alt: m === FXP.pink ? FXP.lime : FXP.pink, cap: '', mood: 0 };
}
const _letC = {};
function fxLetter(ch, size, col, layer) { // layer 'border' (white sticker edge, shared under all letters) or 'body'
  const k = ch + '|' + size + '|' + col + '|' + layer; if (_letC[k]) return _letC[k];
  return (_letC[k] = fxStickerText(ch, size, layer === 'border' ? '#ffffff' : col, { border: .3, skew: false, drop: true, layer }));
}
let _raysS = null;
function raysSprite() { // pastel candy-stripe rays
  if (_raysS) return _raysS;
  const s = fxMk(512, 512), g = s.getContext('2d'); g.translate(256, 256);
  for (let i = 0; i < 20; i++) { const a = i / 20 * 6.283; g.fillStyle = FX_PASTEL[i % FX_PASTEL.length]; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 256, a, a + 6.283 / 20 * .62); g.closePath(); g.fill(); }
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createRadialGradient(0, 0, 30, 0, 0, 256); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(-256, -256, 512, 512);
  return (_raysS = s);
}
const _sprayC = {};
function fxSpraySprite(col) { // airbrushed spray-paint splat with stipple + drips (poster look)
  if (_sprayC[col]) return _sprayC[col];
  const s = fxMk(256, 160), g = s.getContext('2d'), R = fxRng(col.length * 17 + 3);
  for (let i = 0; i < 7; i++) {
    const x = 60 + R() * 136, y = 50 + R() * 50, r = 30 + R() * 34, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, fxA(col, .7)); gr.addColorStop(.6, fxA(col, .45)); gr.addColorStop(1, fxA(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
  }
  for (let i = 0; i < 700; i++) { const a = R() * 6.283, r = 40 + R() * 70; g.fillStyle = fxA(col, .25 + R() * .4); g.fillRect(128 + Math.cos(a) * r * 1.4, 78 + Math.sin(a) * r * .6, 1.5, 1.5); }
  g.fillStyle = fxA(col, .55); for (let i = 0; i < 4; i++) { const x = 80 + R() * 100, y = 95 + R() * 10, h = 18 + R() * 30; g.fillRect(x, y, 3, h); g.beginPath(); g.arc(x + 1.5, y + h, 3, 0, 6.3); g.fill(); }
  return (_sprayC[col] = s);
}
function fxDrawBanner(c, b) {
  if (!b) return;
  const T = b.t, k = T / b.max, st = b._st || (b._st = fxBannerStyle(b));
  const big = st.mood !== 0, sad = st.mood < 0;
  let size = big ? 96 : 76;
  const text = b.text, chars = [...text];
  // layout (measure once per banner)
  if (!b._lay) {
    c.save(); c.font = `800 ${size}px ${FD}`; let tw = 0; const ws = chars.map(ch => c.measureText(ch).width * 1.02); tw = ws.reduce((a, v) => a + v, 0);
    if (tw > W - 160) { size = Math.floor(size * (W - 160) / tw); c.font = `800 ${size}px ${FD}`; ws.forEach((_, i) => ws[i] = c.measureText(chars[i]).width * 1.02); tw = ws.reduce((a, v) => a + v, 0); }
    c.restore();
    let wi = 0, x = -tw / 2; const L = [];
    chars.forEach((ch, i) => { if (ch === ' ') wi++; L.push({ ch, x: x + ws[i] / 2, col: wi % 2 ? st.alt : st.main, r: (((i * 37) % 7) - 3) * .028 }); x += ws[i]; });
    b._lay = { L, tw, size };
  }
  const { L, tw } = b._lay; size = b._lay.size;
  const B = c.getTransform();
  const inK = ease.out(clamp(T / .25, 0, 1)), outK = k > .86 ? ease.inOut((k - .86) / .14) : 0;
  const cx = W / 2, cy = 270 + Math.sin(T * 3) * 2;
  c.save();
  // soft cream band for readability (lavender when sad)
  c.globalAlpha = .55 * inK * (1 - outK);
  const bg = c.createLinearGradient(0, cy - 130, 0, cy + 130), bc = sad ? '60,40,90' : '255,250,236';
  bg.addColorStop(0, `rgba(${bc},0)`); bg.addColorStop(.5, `rgba(${bc},.8)`); bg.addColorStop(1, `rgba(${bc},0)`);
  c.fillStyle = bg; c.fillRect(0, cy - 130, W, 260);
  // spinning pastel rays
  c.save(); c.globalAlpha = (big ? .42 : .3) * inK * (1 - outK) * (sad ? .5 : 1);
  c.translate(cx, cy); c.rotate(T * (sad ? .12 : .4)); const rs = (big ? 440 : 300) * (.6 + .4 * inK) + Math.sin(T * 2) * 14; c.scale(1, big ? 1 : .55); c.drawImage(raysSprite(), -rs, -rs, rs * 2, rs * 2); c.restore();
  // spray splats behind the lettering
  const sp = ease.back(clamp(T / .3, 0, 1));
  c.globalAlpha = .85 * (1 - outK);
  c.drawImage(fxSpraySprite(st.alt), cx - tw * .55 - 110 * sp, cy - 95 * sp, 300 * sp, 190 * sp);
  c.drawImage(fxSpraySprite(st.main), cx + tw * .55 - 190 * sp, cy - 70 * sp, 300 * sp, 190 * sp);
  // speed-dash doodles either side
  const dk = clamp((T - .15) / .2, 0, 1);
  if (dk > 0) {
    c.globalAlpha = (1 - outK); c.lineCap = 'round';
    for (const sgn of [-1, 1]) for (let i = 0; i < 3; i++) {
      const a = (sgn < 0 ? Math.PI : 0) + (i - 1) * .45, r0 = tw / 2 + 30, r1 = r0 + (34 + (i === 1 ? 14 : 0)) * ease.back(dk);
      const ox = cx + Math.cos(a) * r0, oy = cy + Math.sin(a) * size * .55, ex = cx + Math.cos(a) * r1, ey = cy + Math.sin(a) * (size * .55 + (r1 - r0) * .9);
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(ex, ey); c.strokeStyle = i === 1 ? st.alt : st.main; c.lineWidth = 7; c.stroke();
    }
  }
  // letters: staggered elastic pop-in, idle bob, sequential pop-out
  const n = L.length; let landed = true; const LT = [];
  for (let i = 0; i < n; i++) {
    const l = L[i]; if (l.ch === ' ') continue;
    const t0 = .04 + i * .035, tt = T - t0; if (tt <= 0) { landed = false; continue; }
    const pk = clamp(tt / .42, 0, 1); if (pk < 1) landed = false;
    let sc = ease.elastic(pk), dy = (1 - ease.out(clamp(tt / .2, 0, 1))) * -60;
    let rot = l.r + Math.sin(T * 4 + i * .9) * .04 + (sad ? Math.min(.25, Math.max(0, T - .6) * .2) * (i % 2 ? 1 : -1) : 0);
    dy += Math.sin(T * 5 + i * .7) * 3 + (sad ? Math.min(14, Math.max(0, T - .6) * 6 * ((i * 7) % 3)) : 0);
    if (outK > 0) { const ok = clamp(outK * 1.6 - (i / n) * .6, 0, 1); sc *= 1 - ease.back(ok) * .999; }
    if (sc <= .01) continue;
    LT.push([l, cx + l.x, cy + dy, rot - .03, sc]);
  }
  c.globalAlpha = 1;
  for (const pass of ['border', 'body']) for (const [l, x, y, r, sc] of LT) { // shared white sticker edge under all letters, then bodies
    const lb = fxLetter(l.ch, size, l.col, pass); fxSetT(c, B, x, y, r, sc); c.drawImage(lb.cv, -lb.w / 2, -lb.h / 2, lb.w, lb.h);
  }
  c.setTransform(B);
  // celebratory slam once all letters land
  if (landed && !b._slam) {
    b._slam = 1;
    if (!sad) {
      fxConfetti(cx, cy, big ? 44 : 14, { min: 250, max: big ? 900 : 600, up: 300, jit: tw * .3, s0: 7, s1: 13, life: big ? 1.4 : .9 });
      burst(cx, cy, big ? 8 : 3, { shape: 'star', col: [FXP.yel, FXP.pink, FXP.lime, FXP.cyan], min: 250, max: 650, up: 250, grav: 500, life: 1, s0: 11, s1: 18, jit: tw * .3 });
      if (big) burst(cx, cy, 5, { shape: pick(['heart', 'note']), col: [FXP.pink, FXP.lime, FXP.cyan], min: 200, max: 500, up: 280, grav: 450, life: 1.1, s0: 12, s1: 18, jit: tw * .3 });
    } else burst(cx, cy + 30, 8, { shape: 'ink', col: [FXP.lav, FXP.cyan], min: 40, max: 160, grav: 700, life: .9, s0: 4, s1: 7, jit: tw * .35 });
  }
  // corner sticker doodles
  const dpop = clamp((T - .3) / .3, 0, 1);
  if (dpop > 0) {
    const s = ease.elastic(dpop) * (1 - outK); c.globalAlpha = 1;
    if (s > .02) {
      fxSticker(c, B, sad ? 'swirl' : 'star', sad ? FXP.lav : FXP.yel, cx - tw / 2 - 26, cy - size * .52, 22 * s, -.3 + Math.sin(T * 3) * .15);
      fxSticker(c, B, big && !sad ? 'heart' : 'spark4', big && !sad ? FXP.pink : FXP.cyan, cx + tw / 2 + 28, cy - size * .48, 20 * s, .25 + Math.sin(T * 3 + 1) * .15);
      if (big) fxSticker(c, B, sad ? 'bubble' : 'note', sad ? FXP.cyan : FXP.lime, cx + tw / 2 + 12, cy + size * .5, 17 * s, .2);
      c.setTransform(B);
    }
  }
  // hand-lettered marker caption
  if (st.cap && T > .35) {
    const ck = clamp((T - .35) / .35, 0, 1), cs = big ? 30 : 24;
    c.save(); c.translate(cx + tw * .12, cy + size * .62 + 14); c.rotate(-.045); c.globalAlpha = 1 - outK;
    c.font = `${cs}px ${FM}`; c.textAlign = 'center'; c.textBaseline = 'middle'; const cw = c.measureText(st.cap).width;
    c.beginPath(); c.rect(-cw / 2 - 10, -cs, (cw + 20) * ck, cs * 2.4); c.clip();
    c.lineJoin = 'round'; c.lineWidth = 8; c.strokeStyle = '#fff'; c.strokeText(st.cap, 0, 0); c.fillStyle = FXP.ink; c.fillText(st.cap, 0, 0);
    // marker underline swoosh
    c.beginPath(); c.moveTo(-cw * .45, cs * .72); c.quadraticCurveTo(0, cs * .9, cw * .48, cs * .6); c.lineCap = 'round';
    c.strokeStyle = st.alt; c.lineWidth = 5; c.stroke();
    c.restore();
  }
  c.restore();
}

// ---------- ambience: confetti, notes, bubbles, sparkles, stage beams, spotlight sweeps ----------
const FX_AMB = {
  alley: { n: 22, kinds: ['confetti', 'confetti', 'note', 'bubble', 'sparkle', 'heart'], beams: [FXP.pinkL, FXP.cyan, FXP.limeL], spot: 1 },
  market: { n: 22, kinds: ['confetti', 'note', 'heart', 'bubble', 'sparkle'], beams: [FXP.yel, FXP.pinkL], spot: 0 },
  desert: { n: 18, kinds: ['bubble', 'bubble', 'sparkle', 'note', 'confetti'], beams: ['#ffe9a8', '#ffd0a0'], spot: 0, sun: 1 },
  night: { n: 26, kinds: ['glitter', 'glitter', 'note', 'sparkle', 'bubble', 'confetti'], beams: [FXP.cyan, FXP.pink, FXP.lav], spot: 1, club: 1 },
  camp: { n: 20, kinds: ['glitter', 'glitter', 'note', 'sparkle', 'heart'], beams: null, spot: 0 },
  paper: { n: 10, kinds: ['sparkle', 'sparkle', 'glitter'], beams: null, spot: 0 }
};
const FX_SCENE_BG = { MenuScene: 'alley', CharSelectScene: 'market', ShopScene: 'market', RestScene: 'camp', EventScene: 'night', GameOverScene: 'night', CodexScene: 'night', MapScene: 'paper', RewardScene: 'paper', VictoryScene: 'paper' };
function fxSceneKey() {
  const s = G.scene; if (!s) return 'alley';
  if (s.bg && FX_AMB[s.bg]) return s.bg;
  const n = s.constructor && s.constructor.name;
  if (n === 'EncounterScene' && typeof ENC !== 'undefined' && G.run) { const e = ENC[G.run.act] || ENC[1]; if (e && FX_AMB[e.bg]) return e.bg; }
  return FX_SCENE_BG[n] || 'alley';
}
const AMB = { list: [], last: 0, key: '' };
function fxSpawnMote(kind, fresh) {
  const m = { kind, x: rnd(0, W), y: fresh ? rnd(0, H) : 0, life: 0, max: rnd(5, 10), s: 1, vx: 0, vy: 0, ph: rnd(0, 6.3), rot: rnd(-.4, .4) };
  if (kind === 'confetti') { m.y = fresh ? rnd(0, H) : -10; m.vx = rnd(-12, 12); m.vy = rnd(22, 46); m.s = rnd(5, 8); m.col = pick(FX_CONF); m.rot = rnd(0, 6); m.max = rnd(10, 18); }
  else if (kind === 'note') { m.y = fresh ? rnd(120, H) : H + 20; m.vx = rnd(-6, 10); m.vy = rnd(-34, -18); m.s = rnd(7, 11); m.col = pick([FXP.lime, FXP.pink, FXP.cyan, FXP.lav]); m.shape = Math.random() < .3 ? 'notes' : 'note'; m.max = rnd(8, 14); }
  else if (kind === 'heart') { m.y = fresh ? rnd(120, H) : H + 20; m.vx = rnd(-6, 6); m.vy = rnd(-28, -14); m.s = rnd(6, 9); m.col = pick([FXP.pink, FXP.pinkL]); m.max = rnd(8, 14); }
  else if (kind === 'bubble') { m.y = fresh ? rnd(100, H) : H + 20; m.vx = rnd(-5, 5); m.vy = rnd(-30, -14); m.s = rnd(6, 13); m.col = pick([FXP.cyan, FXP.pinkL, FXP.limeL, FXP.lav]); m.max = rnd(8, 15); }
  else if (kind === 'sparkle') { m.y = rnd(20, H - 60); m.s = rnd(6, 10); m.col = pick([FXP.yel, '#fff', FXP.pinkL, FXP.cyan]); m.max = rnd(1.6, 3.2); }
  else { m.y = rnd(40, H - 40); m.vx = rnd(-8, 8); m.vy = rnd(-8, 4); m.s = rnd(1.4, 2.6); m.col = pick(['#fff3b0', FXP.pinkL, FXP.cyan, '#ffffff']); m.max = rnd(3, 7); }
  return m;
}
function drawAmbient(c) {
  if (!FX.ambient) return;
  const t0 = performance.now();
  const key = fxSceneKey(), P = FX_AMB[key] || FX_AMB.alley;
  let dt = clamp(G.time - AMB.last, 0, .05); AMB.last = G.time;
  if (key !== AMB.key) { AMB.key = key; AMB.list = []; for (let i = 0; i < P.n; i++) AMB.list.push(fxSpawnMote(pick(P.kinds), true)); }
  const B = c.getTransform(), L = AMB.list, T = G.time;
  c.save();
  // stage light beams (pastel, sweeping)
  if (P.beams) {
    c.globalCompositeOperation = 'lighter';
    const nb = P.beams.length;
    for (let i = 0; i < nb; i++) {
      const sw = P.sun ? Math.sin(T * .15 + i) * .04 : Math.sin(T * (.35 + i * .07) + i * 2.1) * (P.club ? .38 : .22);
      const a = (P.club ? .13 : .08) + .04 * Math.sin(T * .7 + i * 2.1);
      const x = W * (i + .5) / nb + Math.sin(T * .2 + i) * 30;
      c.globalAlpha = a; fxSetT(c, B, x, -30, (P.sun ? -.38 : (i - (nb - 1) / 2) * .25) + sw, 1);
      c.drawImage(beamSprite(P.beams[i]), -70, 0, 140, 640);
    }
    c.setTransform(B);
  }
  // spotlight pools sweeping the floor
  if (P.spot) {
    c.globalCompositeOperation = 'lighter'; c.save(); c.scale(1, .22);
    for (let i = 0; i < 2; i++) {
      const x = W / 2 + Math.sin(T * (.45 + i * .17) + i * 2.4) * 420, y = (470 + i * 18) / .22, r = 200;
      c.globalAlpha = (P.club ? .2 : .13); c.drawImage(glowSprite(i ? FXP.pinkL : (P.club ? FXP.cyan : '#fff4d0')), x - r, y - r, r * 2, r * 2);
    }
    c.restore();
  }
  // motes
  for (let i = 0; i < L.length; i++) {
    const m = L[i]; m.life += dt;
    m.x += (m.vx + Math.sin(T * .8 + m.ph) * (m.kind === 'confetti' ? 22 : 9)) * dt; m.y += m.vy * dt;
    if (m.life > m.max || m.y < -30 || m.y > H + 30 || m.x < -30 || m.x > W + 30) { L[i] = fxSpawnMote(pick(P.kinds), false); if (L[i].kind === 'sparkle' || L[i].kind === 'glitter') L[i].x = rnd(0, W); continue; }
    const a = Math.min(1, m.life * 1.2, (m.max - m.life) * 1.2);
    if (m.kind === 'glitter') {
      c.setTransform(B); c.globalCompositeOperation = 'lighter';
      const tw = Math.max(0, Math.sin(T * 3 + m.ph)), s = m.s * 3;
      c.globalAlpha = a * tw * .8; c.drawImage(glowSprite(m.col), m.x - s, m.y - s, s * 2, s * 2);
      continue;
    }
    c.globalCompositeOperation = 'source-over';
    if (m.kind === 'confetti') {
      fxSetT(c, B, m.x, m.y, m.rot + T * 1.5 + m.ph, 1); const fl = Math.cos(T * 4 + m.ph); c.scale(1, Math.abs(fl) < .15 ? .15 : fl);
      c.globalAlpha = a * .75; c.fillStyle = m.col; c.fillRect(-m.s * .5, -m.s * .28, m.s, m.s * .56);
      continue;
    }
    if (m.kind === 'sparkle') {
      const k = m.life / m.max, s = m.s * Math.sin(k * Math.PI);
      c.globalAlpha = .75; if (s > .5) fxSticker(c, B, 'spark4', m.col, m.x, m.y, s, 0);
      continue;
    }
    c.globalAlpha = a * (m.kind === 'bubble' ? .7 : .6);
    fxSticker(c, B, m.kind === 'note' ? m.shape : m.kind, m.col, m.x, m.y, m.s, m.rot + Math.sin(T * 1.6 + m.ph) * .25);
  }
  c.restore();
  FX.ambCost = performance.now() - t0;
}

// ---------- post processing: bright, clean, slightly bloomy pastel ----------
const FX_GRADE = {
  alley: { top: '#c9b2f0', bot: '#ffd2a8', a: .1, vig: .16, vc: '#c86aa0' },
  desert: { top: '#a8dcf2', bot: '#ffd890', a: .09, vig: .14, vc: '#e08a6a' },
  market: { top: '#ffb8d8', bot: '#ffe49a', a: .1, vig: .14, vc: '#d07aa8' },
  night: { top: '#4a4ab0', bot: '#e47ac8', a: .12, vig: .28, vc: '#10123a', bl: 1.3 },
  camp: { top: '#c0a8f0', bot: '#ffaa70', a: .11, vig: .18, vc: '#7a4aa0' },
  paper: { top: '#ffe6f2', bot: '#eaffd2', a: .06, vig: .1, vc: '#d890b8', bl: .6 }
};
const POST = { b1: null, b2: null, b3: null, hr: null, hc: null, vig: {}, grain: null, gpat: null, grads: {}, edge: null };
const _noBloom = function () { };
bloomPass = _noBloom; // bloom now lives in postFx
function fxVig(col) { // soft tinted vignette (cached per colour)
  if (POST.vig[col]) return POST.vig[col];
  const v = fxMk(320, 180), g = v.getContext('2d'), gr = g.createRadialGradient(160, 92, 70, 160, 90, 205);
  gr.addColorStop(0, fxA(col, 0)); gr.addColorStop(.6, fxA(col, .3)); gr.addColorStop(1, fxA(col, 1)); g.fillStyle = gr; g.fillRect(0, 0, 320, 180);
  return (POST.vig[col] = v);
}
function fxPostInit() {
  POST.b1 = fxMk(320, 180); POST.b2 = fxMk(160, 90); POST.b3 = fxMk(80, 45);
  POST.filt = 'filter' in POST.b2.getContext('2d');
  // pink heart vignette: pink frame with a soft heart-shaped window
  POST.heart = fxMk(320, 180); let g = POST.heart.getContext('2d');
  let gr = g.createRadialGradient(160, 90, 40, 160, 90, 200); gr.addColorStop(0, fxA(FXP.pinkL, .6)); gr.addColorStop(1, fxA(FXP.pinkD, 1));
  g.fillStyle = gr; g.fillRect(0, 0, 320, 180);
  const hm = fxMk(320, 180), hg = hm.getContext('2d'); hg.fillStyle = '#000'; hg.beginPath(); hg.save(); hg.translate(160, 96); hg.scale(118, 92); fxHeartPath(hg, 1, 0, -.02); hg.restore(); hg.fill();
  g.globalCompositeOperation = 'destination-out'; if (POST.filt) g.filter = 'blur(16px)'; g.drawImage(hm, 0, 0); g.drawImage(hm, 0, 0); g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  // edge mask for aberration
  POST.edge = fxMk(320, 180); g = POST.edge.getContext('2d'); gr = g.createRadialGradient(160, 90, 30, 160, 90, 185);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, 320, 180);
  // paper grain tile (off by default; FX.grain=true to enable)
  POST.grain = fxMk(128, 128); g = POST.grain.getContext('2d'); const id = g.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (Math.random() - .5) * 2 * 60 | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  POST.gpat = ctx.createPattern(POST.grain, 'repeat');
}
function postFx(c) {
  const t0 = performance.now();
  if (!POST.b1) fxPostInit();
  if (bloomPass !== _noBloom) bloomPass = _noBloom;
  const key = fxSceneKey(), GR = FX_GRADE[key] || FX_GRADE.alley;
  c.save();
  const I = FX.hitI, doBloom = G.settings.bloom !== 0;
  if (I > .04 || doBloom) { const b1 = POST.b1.getContext('2d'); b1.globalCompositeOperation = 'copy'; b1.drawImage(cv, 0, 0, 320, 180); }
  // --- impact frame: gentle zoom pulse + pink/cyan split on the edges (transient, big hits only) ---
  if (I > .04) {
    if (!POST.hr) { POST.hr = fxMk(320, 180); POST.hc = fxMk(320, 180); }
    const hx = FX.hit ? FX.hit.x : W / 2, hy = FX.hit ? FX.hit.y : H / 2;
    c.globalAlpha = .18 * I;
    for (let i = 1; i <= 2; i++) { const z = 1 + .035 * i * I; c.drawImage(POST.b1, hx - hx * z, hy - hy * z, W * z, H * z); }
    const tint = (cvT, col) => { const g = cvT.getContext('2d'); g.globalCompositeOperation = 'copy'; g.drawImage(POST.b1, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, 320, 180); g.globalCompositeOperation = 'destination-in'; g.drawImage(POST.edge, 0, 0); };
    tint(POST.hr, '#ff3c9a'); tint(POST.hc, '#20d8f0');
    const d = 6 * I; c.globalCompositeOperation = 'lighter'; c.globalAlpha = .35 * I;
    c.drawImage(POST.hr, -d, 0, W, H); c.drawImage(POST.hc, d, 0, W, H);
    c.globalCompositeOperation = 'source-over';
  }
  // --- bloom: steep threshold (x^16 knee) so only highlights glow on a bright scene; soft screen back ---
  if (doBloom) {
    const b1 = POST.b1.getContext('2d'), b2 = POST.b2.getContext('2d'), b3 = POST.b3.getContext('2d');
    b1.globalCompositeOperation = 'multiply'; for (let i = 0; i < 4; i++) b1.drawImage(POST.b1, 0, 0);
    b2.globalCompositeOperation = 'copy'; if (POST.filt) b2.filter = 'blur(2px)'; b2.drawImage(POST.b1, 0, 0, 160, 90); b2.filter = 'none';
    b3.globalCompositeOperation = 'copy'; if (POST.filt) b3.filter = 'blur(2px)'; b3.drawImage(POST.b2, 0, 0, 80, 45); b3.filter = 'none';
    c.globalCompositeOperation = 'screen'; c.imageSmoothingEnabled = true;
    const bA = FX.bloomA * (GR.bl || 1); c.globalAlpha = bA * .7; c.drawImage(POST.b2, 0, 0, W, H);
    c.globalAlpha = bA; c.drawImage(POST.b3, 0, 0, W, H);
  }
  // --- warm pastel grade + gentle tinted vignette ---
  if (FX.grade) {
    let g = POST.grads[key];
    if (!g) { g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, GR.top); g.addColorStop(.55, '#808080'); g.addColorStop(1, GR.bot); POST.grads[key] = g; }
    c.globalCompositeOperation = 'soft-light'; c.globalAlpha = GR.a * 2.2; c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = GR.vig; c.drawImage(fxVig(GR.vc), 0, 0, W, H);
  }
  // --- low HP: pink pulsing heart-vignette ---
  const run = G.run, sn = G.scene && G.scene.constructor && G.scene.constructor.name;
  if (run && run.maxhp && (sn === 'BattleScene' || sn === 'NegotiationScene') && !G.scene.over) {
    const hp = G.scene.P && G.scene.P.hp != null ? G.scene.P.hp : run.hp, mx = G.scene.P && G.scene.P.maxhp || run.maxhp, r = hp / mx;
    if (r < .4 && hp > 0) {
      const dng = clamp((.4 - r) / .3, 0, 1), rate = 1.1 + dng * 0.9, ph = (G.time * rate) % 1;
      const beat = Math.exp(-ph * 14) + .6 * Math.exp(-Math.max(0, ph - .18) * 14) * (ph > .18 ? 1 : 0);
      const z = 1 + beat * .05; c.globalCompositeOperation = 'source-over';
      c.globalAlpha = (.3 + .4 * beat) * (.5 + .5 * dng); c.drawImage(POST.heart, W / 2 - W * z / 2, H / 2 - H * z / 2, W * z, H * z);
      c.globalAlpha = .55 + .45 * beat; const B = c.getTransform(), hs = (20 + beat * 8) * (.7 + .3 * dng);
      fxSticker(c, B, 'heart', FXP.pink, 40, 150, hs, -.2); fxSticker(c, B, 'heart', FXP.pinkL, W - 40, 150, hs * .85, .2);
      fxSticker(c, B, 'heart', FXP.pinkL, 34, H - 300, hs * .8, .15); fxSticker(c, B, 'heart', FXP.pink, W - 36, H - 300, hs, -.15);
      c.setTransform(B);
    }
  }
  // --- optional paper grain ---
  if (FX.grain && POST.gpat) {
    const f = Math.floor(G.time * 12); const ox = (f * 73) % 128, oy = (f * 151) % 128;
    c.globalCompositeOperation = 'overlay'; c.globalAlpha = .035; c.fillStyle = POST.gpat;
    c.translate(-ox, -oy); c.fillRect(0, 0, W + 128, H + 128); c.translate(ox, oy);
  }
  c.restore();
  FX.postCost = performance.now() - t0;
}
