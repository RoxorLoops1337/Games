'use strict';
// ===================== ART_SCENES: sticker-zine non-combat screens =====================
// Owned by the art_scenes agent. Re-themes the menu / char-select / map / reward / shop / event /
// encounter / end scenes in the "RoxorLoops & Jasmin" sticker-zine language (see reference/STYLE_BIBLE.md):
// cream paper, pastel pink+lime spray splats with stipple overspray and drips, black marker doodles,
// inflated bubble lettering (Baloo 2 800) with ink outline + white sticker border, marker captions.
// Only prototype.draw is overridden; every hit box, click handler, In.click consumption order,
// transition and data mutation is copied 1:1 from scenes.js. Static art is rendered once into
// offscreen layers keyed by (render resolution, font readiness) so frames are mostly drawImage.
// Research notes that shaped this pass:
//  - zine covers keep a clear reserved band for the title amid sticker clutter (morphic.com/resources/images/zine-cover-image,
//    libguides.butler.edu/creating-digital-zines/make) -> every screen reserves a clean title band + plain text areas.
//  - illustrated maps: choose landmarks first, artistic licence over accuracy, handwritten labels add character
//    (dribbble.com/stories/2019/03/27/how-to-create-an-illustrated-map-in-8-simple-steps, creativebloq.com/how-to/map-illustration).
//  - bubble letters: wide rounded outline around a skeleton, highlights on the light-facing side, a second outer line
//    (lettering-daily.com/bubble-letters) -> ink outline + white sticker border + inner rim light/shade + glints.
//  - spray paint: many tiny random dots inside a radius with soft, transparent build-up
//    (cdn.jsdelivr.net/npm/scratchcard-js@1.5.5/src/Brush.ts, artrage.com/manuals/natural-media-tools/airbrush/)
//    -> stacked soft radial lobes + stipple overspray ring + drips.

// ---------------------------------------------------------------- shared utilities
const SCN = { cache: {}, maps: new WeakMap(), bufs: {} };
const ZK = '#15101c';
const ZP = {
  lime: '#6cc22e', limeL: '#a6e65a', limeD: '#3f8f1a', pink: '#f06aa0', pinkL: '#ff9cc6', pinkD: '#d63a82',
  cyan: '#3fd8e8', cyanD: '#1597b0', lav: '#b79ae8', sky: '#7fd0e8', yel: '#ffd23a', orange: '#ff8a2a',
  cream: '#fbf7ea', navy: '#14182b', denim: '#3a3f6a'
};
const SCN_CONF = [ZP.pink, ZP.lime, ZP.cyan, ZP.yel, ZP.lav, ZP.orange];
const SCN_MC = document.createElement('canvas').getContext('2d');

function scn_rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function scn_res() { const rs = (typeof renderScale !== 'undefined') ? renderScale : 1; return clamp(Math.ceil(rs * 2) / 2, 1, 2); }
function scn_fontsReady() { try { return !document.fonts || (document.fonts.check('800 40px "Baloo 2"') && document.fonts.check('20px "Permanent Marker"') && document.fonts.check('20px "Patrick Hand"')); } catch (e) { return true; } }
function scn_layer(key, w, h, build, res) {
  res = res || scn_res(); const fr = scn_fontsReady(); let L = SCN.cache[key];
  if (L && L.res === res && L.fr === fr) return L;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(w * res); cv.height = Math.ceil(h * res);
  const c = cv.getContext('2d'); c.scale(res, res);
  L = { cv, w, h, res, fr }; build(c, w, h, L); SCN.cache[key] = L; return L;
}
function scn_blit(c, L, x, y, w, h) { c.drawImage(L.cv, x, y, w == null ? L.w : w, h == null ? L.h : h); }
function scn_blitC(c, L, x, y, s = 1) { c.drawImage(L.cv, x - L.w * s / 2, y - L.h * s / 2, L.w * s, L.h * s); }
function scn_poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
function scn_smoothPoly(c, pts) {
  const n = pts.length; c.beginPath(); c.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
  c.closePath();
}
function scn_rrect(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function scn_rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function scn_rgba(h, a) { const r = scn_rgb(h); return `rgba(${r[0]},${r[1]},${r[2]},${a})`; }
function scn_mix(a, b, t) { const A = scn_rgb(a), B = scn_rgb(b); return '#' + A.map((v, i) => clamp(Math.round(v + (B[i] - v) * t), 0, 255).toString(16).padStart(2, '0')).join(''); }
function pick2(rr, a) { return a[(rr() * a.length) | 0]; }

// cream zine paper: soft mottling, grain, fibres
function scn_paper(c, x, y, w, h, seed, base) {
  const r = scn_rng(seed); c.save(); c.fillStyle = base || ZP.cream; c.fillRect(x, y, w, h);
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  for (let i = 0; i < 7; i++) { const px = x + r() * w, py = y + r() * h, R = 160 + r() * 260, g = c.createRadialGradient(px, py, 0, px, py, R); g.addColorStop(0, r() < .55 ? 'rgba(255,255,255,.4)' : 'rgba(214,196,160,.13)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(px - R, py - R, R * 2, R * 2); }
  const n = (w * h / 85) | 0;
  c.fillStyle = 'rgba(120,96,70,.075)'; c.beginPath(); for (let i = 0; i < n; i++) c.rect(x + r() * w, y + r() * h, .6 + r() * 1.2, .6 + r() * 1.2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); for (let i = 0; i < n * .4; i++) c.rect(x + r() * w, y + r() * h, .6 + r() * 1.4, .6 + r() * 1.4); c.fill();
  c.strokeStyle = 'rgba(140,110,80,.06)'; c.lineWidth = .7; c.beginPath();
  for (let i = 0; i < w * h / 3200; i++) { const fx = x + r() * w, fy = y + r() * h, a = r() * 6.3, l = 6 + r() * 22; c.moveTo(fx, fy); c.quadraticCurveTo(fx + Math.cos(a + .5) * l * .5, fy + Math.sin(a + .5) * l * .5, fx + Math.cos(a) * l, fy + Math.sin(a) * l); }
  c.stroke(); c.restore();
}
// spray-paint splat: soft lobes (or a hard felt blob) + stipple overspray + optional drips
function scn_spray(c, x, y, R, col, r, o = {}) {
  const rgb = scn_rgb(col), A = o.a == null ? .7 : o.a, sx = o.sx || 1, sy = o.sy || .85, rgba = a => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  c.save();
  if (o.hard) {
    const pts = [], N = 20; for (let i = 0; i < N; i++) { const a = i / N * 6.283, k = .8 + r() * .26; pts.push([x + Math.cos(a) * R * k * sx, y + Math.sin(a) * R * k * sy]); }
    scn_smoothPoly(c, pts); c.fillStyle = rgba(A); c.fill();
    c.save(); scn_smoothPoly(c, pts); c.clip(); c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); for (let i = 0; i < R * R / 10; i++) c.rect(x + (r() - .5) * R * 2 * sx, y + (r() - .5) * R * 2 * sy, 1.2, 1.2); c.fill();
    c.fillStyle = rgba(.25); c.beginPath(); for (let i = 0; i < R * R / 14; i++) c.rect(x + (r() - .5) * R * 2 * sx, y + (r() - .5) * R * 2 * sy, 1.3, 1.3); c.fill(); c.restore();
  } else {
    const n = o.lobes || 5;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = R * .36 * r(), px = x + Math.cos(a) * d * sx, py = y + Math.sin(a) * d * sy, rr = R * (.52 + r() * .42);
      const g = c.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, rgba(A * .55)); g.addColorStop(.55, rgba(A * .4)); g.addColorStop(1, rgba(0));
      c.fillStyle = g; c.beginPath(); c.arc(px, py, rr, 0, 6.283); c.fill();
    }
  }
  const dots = o.dots != null ? o.dots : Math.min(1600, (R * R / 13) | 0);
  c.fillStyle = rgba(Math.min(1, A * .9)); c.beginPath();
  for (let i = 0; i < dots; i++) { const a = r() * 6.283, d = R * (o.hard ? .78 + Math.pow(r(), 2) * .55 : .3 + Math.pow(r(), .7) * .9), s = .5 + r() * r() * 2.4; c.rect(x + Math.cos(a) * d * sx, y + Math.sin(a) * d * sy, s, s); }
  c.fill();
  for (let i = 0; i < (o.drips || 0); i++) {
    const dx = x + (r() - .5) * R * 1.1 * sx, top = y + R * sy * .45, len = R * (.25 + r() * .7), w = 2.2 + r() * R * .06;
    c.strokeStyle = rgba(Math.min(1, A * .95)); c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(dx, top - R * .2); c.lineTo(dx, top + len); c.stroke();
    c.fillStyle = rgba(Math.min(1, A)); c.beginPath(); c.arc(dx, top + len, w * .95, 0, 6.283); c.fill();
  }
  c.restore();
}
// ---------------------------------------------------------------- marker doodles
function scn_star(c, R, ri, n = 5) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? ri : R; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); }
function scn_heartPath(c, s) { c.beginPath(); c.moveTo(0, s * .8); c.bezierCurveTo(-s * 1.25, -s * .05, -s * .7, -s * 1.05, 0, -s * .4); c.bezierCurveTo(s * .7, -s * 1.05, s * 1.25, -s * .05, 0, s * .8); c.closePath(); }
function scn_doodle(c, kind, x, y, s, o = {}) {
  const ink = o.col || ZK, lw = o.lw || Math.max(1.6, s * .15);
  c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); c.lineCap = 'round'; c.lineJoin = 'round';
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  const paint = (fill) => {
    if (o.sticker) { c.save(); c.shadowColor = 'rgba(21,16,28,.22)'; c.shadowOffsetY = 2.5; c.shadowBlur = 2; c.strokeStyle = '#fff'; c.lineWidth = lw + o.sticker * 2; c.stroke(); if (fill) { c.fillStyle = '#fff'; c.fill(); } c.restore(); }
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.strokeStyle = ink; c.lineWidth = lw; c.stroke();
  };
  const dot = (px, py, rr, col) => { c.fillStyle = col || ink; c.beginPath(); c.arc(px, py, rr, 0, 6.283); c.fill(); };
  switch (kind) {
    case 'heart': scn_heartPath(c, s); paint(o.fill); if (o.fill && o.shine !== false) { c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = lw * .8; c.beginPath(); c.arc(-s * .4, -s * .3, s * .22, 3.5, 4.6); c.stroke(); } break;
    case 'star': scn_star(c, s, s * .48); paint(o.fill); if (o.fill && o.shine !== false) { c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-s * .16, -s * .28, s * .12, s * .06, -.6, 0, 6.283); c.fill(); } break;
    case 'sparkle': c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * .12, -s * .12, s, 0); c.quadraticCurveTo(s * .12, s * .12, 0, s); c.quadraticCurveTo(-s * .12, s * .12, -s, 0); c.quadraticCurveTo(-s * .12, -s * .12, 0, -s); c.closePath(); paint(o.fill); break;
    case 'plus': c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(0, -s); c.lineTo(0, s); paint(); break;
    case 'note': {
      c.beginPath(); c.moveTo(-s * .3, s * .5); c.lineTo(-s * .3, -s * .62); c.lineTo(s * .62, -s * .84); c.lineTo(s * .62, s * .28); paint();
      c.lineWidth = lw * 2.3; c.beginPath(); c.moveTo(-s * .3, -s * .55); c.lineTo(s * .62, -s * .77); c.stroke();
      for (const [hx, hy] of [[-s * .52, s * .55], [s * .4, s * .33]]) { c.beginPath(); c.ellipse(hx, hy, s * .27, s * .2, -.4, 0, 6.283); c.fillStyle = o.fill || ink; c.fill(); c.lineWidth = lw * .8; c.strokeStyle = ink; c.stroke(); }
      break;
    }
    case 'note1': {
      c.beginPath(); c.moveTo(s * .2, s * .55); c.lineTo(s * .2, -s * .9); c.quadraticCurveTo(s * .3, -s * .4, s * .75, -s * .3); paint();
      c.beginPath(); c.ellipse(-s * .05, s * .58, s * .3, s * .22, -.4, 0, 6.283); c.fillStyle = o.fill || ink; c.fill(); c.lineWidth = lw * .8; c.strokeStyle = ink; c.stroke(); break;
    }
    case 'cat': {
      c.beginPath(); c.moveTo(-s, s * .1); c.lineTo(-s * .85, -s * .85); c.lineTo(-s * .32, -s * .45); c.quadraticCurveTo(0, -s * .58, s * .32, -s * .45); c.lineTo(s * .85, -s * .85); c.lineTo(s, s * .1);
      c.quadraticCurveTo(s * .95, s * .8, 0, s * .8); c.quadraticCurveTo(-s * .95, s * .8, -s, s * .1); c.closePath(); paint(o.fill);
      dot(-s * .38, 0, s * .1); dot(s * .38, 0, s * .1);
      if (o.fill) { c.fillStyle = scn_rgba(ZP.pink, .55); c.beginPath(); c.ellipse(-s * .58, s * .3, s * .14, s * .08, 0, 0, 6.283); c.ellipse(s * .58, s * .3, s * .14, s * .08, 0, 0, 6.283); c.fill(); }
      c.fillStyle = ink; c.beginPath(); c.moveTo(-s * .08, s * .18); c.lineTo(s * .08, s * .18); c.lineTo(0, s * .27); c.closePath(); c.fill();
      c.strokeStyle = ink; c.lineWidth = lw * .75; c.beginPath(); c.moveTo(-s * .16, s * .38); c.quadraticCurveTo(-s * .08, s * .46, 0, s * .32); c.quadraticCurveTo(s * .08, s * .46, s * .16, s * .38);
      for (const sg of [-1, 1]) { c.moveTo(sg * s * .7, s * .25); c.lineTo(sg * s * 1.4, s * .12); c.moveTo(sg * s * .7, s * .4); c.lineTo(sg * s * 1.4, s * .45); }
      c.stroke(); break;
    }
    case 'smiley': c.beginPath(); c.arc(0, 0, s, 0, 6.283); paint(o.fill); c.fillStyle = ink; c.beginPath(); c.ellipse(-s * .33, -s * .22, s * .1, s * .17, 0, 0, 6.283); c.ellipse(s * .33, -s * .22, s * .1, s * .17, 0, 0, 6.283); c.fill(); c.lineWidth = lw; c.beginPath(); c.arc(0, s * .02, s * .55, .35, Math.PI - .35); c.stroke(); break;
    case 'dash': c.beginPath(); for (let k = 0; k < 3; k++) { const yy = (k - 1) * s * .5, l = [1, .7, 1][k] * s; c.moveTo(-l, yy); c.lineTo(l * .8, yy); } paint(); break;
    case 'rays': c.beginPath(); for (let k = -1; k <= 1; k++) { const a = -Math.PI / 2 + k * .55; c.moveTo(Math.cos(a) * s * .35, Math.sin(a) * s * .35); c.lineTo(Math.cos(a) * s, Math.sin(a) * s); } paint(); break;
    case 'loop': c.beginPath(); for (let i = 0; i <= 64; i++) { const t = i / 64 * 6.283, d = 1 + Math.sin(t) * Math.sin(t); const px = s * Math.cos(t) / d, py = s * 1.2 * Math.sin(t) * Math.cos(t) / d; i ? c.lineTo(px, py) : c.moveTo(px, py); } paint(); break;
    case 'eq': c.beginPath(); for (let i = 0; i < 5; i++) { const h = s * (.5 + ((i * 3 + 2) % 5) / 5 * 1.3); c.rect(-s + i * s * .42, s - h, s * .3, h); } paint(o.fill || ZP.lime); break;
    case 'swirl': c.beginPath(); for (let i = 0; i <= 50; i++) { const t = i / 50 * 4 * Math.PI, rr = s * i / 50; i ? c.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : c.moveTo(0, 0); } paint(); break;
    case 'zig': c.beginPath(); c.moveTo(-s, 0); for (let i = 1; i <= 6; i++) c.lineTo(-s + i * s / 3, (i % 2 ? -1 : 1) * s * .3); paint(); break;
    case 'vinyl': c.beginPath(); c.arc(0, 0, s, 0, 6.283); paint(o.fill || '#221a2c'); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; for (const k of [.82, .68, .55]) { c.beginPath(); c.arc(0, 0, s * k, 0, 6.283); c.stroke(); } c.beginPath(); c.arc(0, 0, s * .34, 0, 6.283); c.fillStyle = o.label || ZP.pink; c.fill(); c.strokeStyle = ink; c.lineWidth = lw * .7; c.stroke(); dot(0, 0, s * .07, '#fff'); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = lw * .8; c.beginPath(); c.arc(0, 0, s * .75, 3.7, 4.5); c.stroke(); break;
    case 'drop': c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * .75, s * .05, s * .55, s * .45); c.arc(0, s * .35, s * .56, .2, Math.PI - .2); c.quadraticCurveTo(-s * .75, s * .05, 0, -s); c.closePath(); paint(o.fill || ZP.sky); break;
    case 'cloud': c.beginPath(); c.moveTo(-s, s * .35); c.arc(-s * .55, s * .05, s * .42, Math.PI * .7, Math.PI * 1.6); c.arc(0, -s * .2, s * .55, Math.PI * 1.15, Math.PI * 1.9); c.arc(s * .6, s * .05, s * .42, Math.PI * 1.45, Math.PI * .3); c.closePath(); paint(o.fill || '#fff'); break;
    case 'mic': scn_rrect(c, -s * .16, -s * .1, s * .32, s * 1.05, s * .12); paint(o.fill || ZP.denim); c.beginPath(); c.arc(0, -s * .45, s * .4, 0, 6.283); paint('#ecebf3'); c.save(); c.beginPath(); c.arc(0, -s * .45, s * .4, 0, 6.283); c.clip(); c.lineWidth = lw * .45; c.beginPath(); for (let k = -3; k <= 3; k++) { c.moveTo(k * s * .13, -s); c.lineTo(k * s * .13, 0); c.moveTo(-s, -s * .45 + k * s * .13); c.lineTo(s, -s * .45 + k * s * .13); } c.stroke(); c.restore(); c.beginPath(); c.arc(0, -s * .45, s * .4, 0, 6.283); c.lineWidth = lw; c.stroke(); break;
    case 'speaker': scn_rrect(c, -s * .7, -s, s * 1.4, s * 2, s * .14); paint(o.fill || ZP.navy); for (const [cy, cr] of [[-s * .5, s * .3], [s * .3, s * .48]]) { c.beginPath(); c.arc(0, cy, cr, 0, 6.283); c.fillStyle = '#5a5f80'; c.fill(); c.strokeStyle = ink; c.lineWidth = lw * .8; c.stroke(); dot(0, cy, cr * .35, '#2a2d44'); } break;
    case 'cassette': scn_rrect(c, -s, -s * .62, s * 2, s * 1.24, s * .14); paint(o.fill || ZP.lav); scn_rrect(c, -s * .7, -s * .4, s * 1.4, s * .5, s * .1); c.fillStyle = '#fff'; c.fill(); c.lineWidth = lw * .8; c.stroke(); for (const sg of [-1, 1]) { c.beginPath(); c.arc(sg * s * .38, -s * .15, s * .14, 0, 6.283); c.fillStyle = ZK; c.fill(); } c.beginPath(); c.moveTo(-s * .55, s * .62); c.lineTo(-s * .4, s * .3); c.lineTo(s * .4, s * .3); c.lineTo(s * .55, s * .62); c.stroke(); break;
    case 'bolt': c.beginPath(); c.moveTo(s * .2, -s); c.lineTo(-s * .45, s * .1); c.lineTo(0, s * .1); c.lineTo(-s * .2, s); c.lineTo(s * .45, -s * .15); c.lineTo(0, -s * .15); c.closePath(); paint(o.fill || ZP.yel); break;
    case 'crown': c.beginPath(); c.moveTo(-s, s * .5); c.lineTo(-s, -s * .45); c.lineTo(-s * .5, 0); c.lineTo(0, -s * .7); c.lineTo(s * .5, 0); c.lineTo(s, -s * .45); c.lineTo(s, s * .5); c.closePath(); paint(o.fill || ZP.yel); dot(0, s * .2, s * .14, ZP.pink); dot(-s * .55, s * .22, s * .1, ZP.cyan); dot(s * .55, s * .22, s * .1, ZP.lime); break;
    case 'bandaid': c.rotate(o.r2 || 0); scn_rrect(c, -s, -s * .3, s * 2, s * .6, s * .3); paint(o.fill || '#ffd2b0'); scn_rrect(c, -s * .35, -s * .28, s * .7, s * .56, s * .1); c.fillStyle = '#f5b896'; c.fill(); c.lineWidth = lw * .6; c.stroke(); c.fillStyle = 'rgba(21,16,28,.35)'; for (let i = 0; i < 4; i++) dot(-s * .18 + (i % 2) * s * .36, -s * .12 + (i >> 1) * s * .24, s * .04, 'rgba(21,16,28,.4)'); break;
    case 'brokenheart': scn_heartPath(c, s); paint(o.fill || ZP.pinkL); c.beginPath(); c.moveTo(0, -s * .4); c.lineTo(-s * .15, -s * .05); c.lineTo(s * .12, s * .15); c.lineTo(-s * .05, s * .5); c.lineWidth = lw; c.stroke(); break;
    case 'flower': for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; c.beginPath(); c.arc(Math.cos(a) * s * .5, Math.sin(a) * s * .5, s * .42, 0, 6.283); paint(o.fill || ZP.pinkL); } c.beginPath(); c.arc(0, 0, s * .32, 0, 6.283); paint(ZP.yel); break;
  }
  c.restore();
}
// cached doodle sprite (for animated sprinkles)
function scn_dsprite(kind, s, o = {}) {
  const key = 'ds_' + kind + s + JSON.stringify(o), pad = s * .7 + (o.sticker || 0) * 2 + 6;
  return scn_layer(key, s * 2 + pad * 2, s * 2 + pad * 2, (c, w, h) => scn_doodle(c, kind, w / 2, h / 2, s, o));
}
// ---------------------------------------------------------------- bubble lettering
function scn_bubble(c, text, cx, cy, size, col, o = {}) {
  const font = `800 ${size}px ${FD}`;
  c.save(); c.font = font; c.textBaseline = 'middle';
  const chars = [...text], sp = o.sp != null ? o.sp * size : -size * .02, heart = o.heartI;
  const m = c.measureText('R'), top = -(m.actualBoundingBoxAscent || size * .36), bot = (m.actualBoundingBoxDescent || size * .32), yo = -(top + bot) / 2;
  const ws = chars.map(ch => (heart && ch === 'i') ? size * .3 : c.measureText(ch).width);
  const tot = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  if (o.maxW && tot > o.maxW) { c.restore(); return scn_bubble(c, text, cx, cy, size * o.maxW / tot, col, Object.assign({}, o, { maxW: 0 })); }
  const wv = o.wave == null ? 1 : o.wave, sd = o.seed || 0, lets = []; let lx = cx - tot / 2;
  chars.forEach((ch, i) => { lets.push({ ch, w: ws[i], x: lx + ws[i] / 2, y: cy + yo + wv * Math.sin(i * 2.1 + sd) * size * .035, rot: wv * Math.sin(i * 1.7 + sd) * .055, stem: heart && ch === 'i' }); lx += ws[i] + sp; });
  const stemW = size * .2, sTop = top + (bot - top) * .36;
  const glyph = (x, l, lw, mode) => { // mode: 'stroke' | 'fill'
    if (l.stem) { x.lineCap = 'round'; x.lineWidth = stemW + (mode === 'fill' ? 0 : lw); if (mode === 'fill') x.strokeStyle = x.fillStyle; x.beginPath(); x.moveTo(0, sTop + stemW / 2); x.lineTo(0, bot - stemW / 2); x.stroke(); }
    else if (mode === 'fill') x.fillText(l.ch, 0, 0); else { x.lineWidth = lw; x.strokeText(l.ch, 0, 0); }
  };
  const pass = (x, dx, dy, fn) => { for (const l of lets) { if (l.ch === ' ') continue; x.save(); x.translate(l.x + dx, l.y + dy); x.rotate(l.rot); x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineCap = 'round'; fn(x, l); x.restore(); } };
  const strokeAll = (x, dx, dy, lw, style) => pass(x, dx, dy, (x, l) => { x.strokeStyle = style; glyph(x, l, lw, 'stroke'); });
  const inkW = size * (o.ink || .17), bw = size * (o.border == null ? .44 : o.border);
  if (bw > 0) {
    strokeAll(c, size * .02, size * .06, bw + inkW * .2, 'rgba(21,16,28,.22)');
    strokeAll(c, 0, 0, bw + 2.5, 'rgba(21,16,28,.4)');
    strokeAll(c, 0, 0, bw, '#ffffff');
  }
  strokeAll(c, 0, 0, inkW, ZK);
  // face on its own canvas so texture / rim light / glints clip to the letters
  const F = scn_buf('bubF', c.canvas.width, c.canvas.height), fc = F.getContext('2d');
  fc.setTransform(1, 0, 0, 1, 0, 0); fc.globalCompositeOperation = 'source-over'; fc.globalAlpha = 1; fc.clearRect(0, 0, F.width, F.height);
  fc.setTransform(c.getTransform());
  const lt = scn_mix(col, '#ffffff', .38), dk = scn_mix(col, '#000000', .16);
  pass(fc, 0, 0, (x, l) => { const g = x.createLinearGradient(0, top, 0, bot); g.addColorStop(0, lt); g.addColorStop(.45, col); g.addColorStop(1, dk); x.fillStyle = g; glyph(x, l, 0, 'fill'); });
  fc.globalCompositeOperation = 'source-atop';
  const r = scn_rng((o.seed || 3) * 77 + text.length), bx = cx - tot / 2, by = cy + top - size * .1, bh = (bot - top) + size * .2;
  fc.fillStyle = 'rgba(255,255,255,.22)'; fc.beginPath(); for (let i = 0; i < tot * size * .05; i++) fc.rect(bx + r() * tot, by + r() * bh, 1.1, 1.1); fc.fill();
  fc.fillStyle = 'rgba(0,0,0,.09)'; fc.beginPath(); for (let i = 0; i < tot * size * .05; i++) fc.rect(bx + r() * tot, by + r() * bh, 1.1, 1.1); fc.fill();
  // rim light / core shade = glyph minus a shifted copy of itself (fonts with overlapping contours stripe if stroked)
  const Hb = scn_buf('bubH', F.width, F.height), hc = Hb.getContext('2d');
  const rim = (dx, dy, style) => {
    hc.setTransform(1, 0, 0, 1, 0, 0); hc.globalCompositeOperation = 'source-over'; hc.clearRect(0, 0, Hb.width, Hb.height); hc.setTransform(c.getTransform());
    pass(hc, 0, 0, (x, l) => { x.fillStyle = style; glyph(x, l, 0, 'fill'); });
    hc.globalCompositeOperation = 'destination-out'; pass(hc, dx, dy, (x, l) => { x.fillStyle = '#000'; glyph(x, l, 0, 'fill'); }); hc.globalCompositeOperation = 'source-over';
    fc.save(); fc.setTransform(1, 0, 0, 1, 0, 0); fc.drawImage(Hb, 0, 0); fc.restore();
  };
  rim(size * .03, size * .05, 'rgba(255,255,255,.5)');
  rim(-size * .025, -size * .045, 'rgba(0,0,0,.15)');
  pass(fc, 0, 0, (x, l) => { x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(-l.w * .2, top + (bot - top) * .2, size * .065, size * .028, -.6, 0, 6.283); x.fill(); });
  fc.globalCompositeOperation = 'source-over';
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(F, 0, 0); c.restore();
  if (heart) lets.forEach(l => { if (l.stem) scn_doodle(c, 'heart', l.x, l.y + sTop - size * .17, size * .15, { fill: o.heartCol || ZP.pink, lw: Math.max(2, size * .04), sticker: size * .04 }); });
  c.restore();
}
function scn_buf(name, w, h) { let b = SCN.bufs[name]; if (!b || b.width < w || b.height < h) { b = document.createElement('canvas'); b.width = Math.max(w, b ? b.width : 0); b.height = Math.max(h, b ? b.height : 0); SCN.bufs[name] = b; } return b; }
function scn_bubbleLayer(text, size, col, o = {}) {
  SCN_MC.font = `800 ${size}px ${FD}`; let tw = SCN_MC.measureText(text).width; if (o.maxW) tw = Math.min(tw, o.maxW);
  return scn_layer('bub_' + text + '|' + size + col + JSON.stringify(o), tw + size * 1.2, size * 1.75, (c, w, h) => scn_bubble(c, text, w / 2, h / 2, size, col, o));
}
// cheap per-frame bubble text (for changing numbers)
function scn_bubbleLive(c, s, x, y, size, col, o = {}) {
  const base = { size, font: FD, weight: 800, align: o.align || 'center', base: 'middle', rot: o.rot };
  txt(c, s, x, y, Object.assign({}, base, { color: '#fff', stroke: '#fff', sw: size * .4 }));
  txt(c, s, x, y, Object.assign({}, base, { color: col, stroke: ZK, sw: size * .17, grad: true }));
}
function scn_marker(c, s, x, y, size, col, o = {}) { txt(c, s, x, y, Object.assign({ size, font: FM, color: col || ZK, align: 'center' }, o)); }
// sticker panel: soft shadow, white die-cut border, flat fill, thick ink line, optional inner band
function scn_sticker(c, x, y, w, h, r, fill, o = {}) {
  const pad = o.pad == null ? 6 : o.pad;
  c.save();
  if (o.shadow !== false) { c.fillStyle = 'rgba(21,16,28,.2)'; scn_rrect(c, x - pad + 2, y - pad + 5, w + pad * 2, h + pad * 2, r + pad); c.fill(); }
  if (pad) { c.fillStyle = '#fff'; scn_rrect(c, x - pad, y - pad, w + pad * 2, h + pad * 2, r + pad); c.fill(); c.strokeStyle = 'rgba(21,16,28,.28)'; c.lineWidth = 1.2; c.stroke(); }
  scn_rrect(c, x, y, w, h, r); c.fillStyle = fill; c.fill();
  if (o.gloss) { c.save(); scn_rrect(c, x, y, w, h, r); c.clip(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(x + w * .3, y + 4, w * .45, h * .18, -.05, 0, 6.283); c.fill(); c.restore(); }
  if (o.band) { c.lineWidth = o.bandW || 6; c.strokeStyle = o.band; scn_rrect(c, x + 7, y + 7, w - 14, h - 14, Math.max(2, r - 6)); c.stroke(); }
  c.lineWidth = o.lw || 3.5; c.strokeStyle = ZK; scn_rrect(c, x, y, w, h, r); c.stroke();
  c.restore();
}
function scn_btnBack(c, x, y, w, h) { c.save(); c.fillStyle = 'rgba(21,16,28,.16)'; scn_rrect(c, x - 5, y - 3, w + 10, h + 15, 16); c.fill(); c.fillStyle = '#fff'; scn_rrect(c, x - 7, y - 7, w + 14, h + 17, 17); c.fill(); c.strokeStyle = 'rgba(21,16,28,.3)'; c.lineWidth = 1.2; c.stroke(); c.restore(); }
function scn_tape(c, x, y, w, h, rot, col) {
  c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = .82; c.beginPath(); c.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= 6; i++) c.lineTo(-w / 2 + (i % 2) * 3, -h / 2 + i * h / 6);
  for (let i = 6; i >= 0; i--) c.lineTo(w / 2 - (i % 2) * 3, -h / 2 + i * h / 6);
  c.closePath(); c.fillStyle = col; c.fill(); c.clip(); c.fillStyle = 'rgba(255,255,255,.35)'; for (let k = -w; k < w; k += 10) { c.beginPath(); c.moveTo(k, -h / 2); c.lineTo(k + 5, -h / 2); c.lineTo(k + 5 + h, h / 2); c.lineTo(k + h, h / 2); c.fill(); }
  c.restore();
}
function scn_box(c, x, y, w, h, fill, r = 3, lw = 2.2) { scn_rrect(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); c.strokeStyle = ZK; c.lineWidth = lw; c.stroke(); }
// scatter doodles in a rect, avoiding rects [x,y,w,h]
function scn_scatter(c, r, n, x0, y0, w, h, avoid = [], o = {}) {
  const kinds = o.kinds || ['heart', 'star', 'sparkle', 'note', 'note1', 'plus', 'dash', 'loop', 'smiley', 'zig', 'swirl', 'cat', 'eq'];
  const placed = [];
  for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
    const s = (o.smin || 9) + r() * ((o.smax || 20) - (o.smin || 9)), x = x0 + r() * w, y = y0 + r() * h;
    if (avoid.some(a => x + s * 1.4 > a[0] && x - s * 1.4 < a[0] + a[2] && y + s * 1.4 > a[1] && y - s * 1.4 < a[1] + a[3])) continue;
    if (placed.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 < (p[2] + s + 14) ** 2)) continue;
    placed.push([x, y, s]); i++;
    const k = pick2(r, kinds), cr = r(), col = cr < .62 ? ZK : cr < .82 ? ZP.pink : ZP.limeD;
    const fill = (k === 'heart' || k === 'star') && r() < .45 ? pick2(r, [ZP.pinkL, ZP.limeL, ZP.yel]) : k === 'smiley' ? ZP.yel : k === 'cat' ? '#fff' : null;
    scn_doodle(c, k, x, y, s, { col: fill ? ZK : col, fill, rot: (r() - .5) * .6, alpha: o.alpha, sticker: fill && r() < .5 ? 3 : 0 });
  }
  return placed;
}
function scn_cone(col) {
  return scn_layer('cone_' + col, 260, 640, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, scn_rgba(col, .6)); g.addColorStop(.7, scn_rgba(col, .18)); g.addColorStop(1, scn_rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.moveTo(118, 0); c.lineTo(142, 0); c.lineTo(260, 640); c.lineTo(0, 640); c.closePath(); c.fill();
  }, 1);
}
function scn_drawCone(c, col, x, y, ang, len, a) { const L = scn_cone(col); c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha *= a; c.drawImage(L.cv, -130 * len / 640, 0, 260 * len / 640, len); c.restore(); }
function scn_confetti(c, t, n, seed, o = {}) {
  c.save(); c.lineWidth = 1.2; c.strokeStyle = ZK; c.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const k = ((i * 7919 + seed * 13) % 1000) / 1000, sp = (o.speed || 50) * (.6 + k), x = ((i * 173.3 + seed * 31) % W) + Math.sin(t * (1 + k) + i) * 18;
    const y = ((t * sp + i * 97.7 + seed * 53) % (H + 60)) - 30;
    c.save(); c.translate(x, y); c.rotate(t * (1 + k * 3) + i); c.scale(1, Math.cos(t * (2 + k * 3) + i)); c.fillStyle = SCN_CONF[(i + seed) % 6];
    c.beginPath(); const sh = i % 3; if (sh === 0) c.rect(-5, -3, 10, 6); else if (sh === 1) c.arc(0, 0, 3.6, 0, 6.283); else scn_star(c, 5.5, 2.6);
    c.fill(); c.stroke(); c.restore();
  }
  c.restore();
}
function scn_twinkles(c, t, pts, s = 10) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], k = .5 + .5 * Math.sin(t * 3 + i * 1.9); if (k < .08) continue;
    const L = scn_dsprite('sparkle', s, { fill: i % 2 ? ZP.limeL : '#fff', lw: 2, sticker: 0 });
    c.save(); c.globalAlpha = k; scn_blitC(c, L, p[0], p[1], .5 + k * .6); c.restore();
  }
}
// generic zine backdrop layer
function scn_zineBg(key, seed, o = {}) {
  return scn_layer(key, W, H, (c) => {
    const r = scn_rng(seed);
    scn_paper(c, 0, 0, W, H, seed, o.base);
    (o.splats || []).forEach(s => scn_spray(c, s[0], s[1], s[2], s[3], r, Object.assign({ a: .55 }, s[4] || {})));
    if (o.extra) o.extra(c, r);
    if (o.doodles) scn_scatter(c, r, o.doodles, 10, 10, W - 20, H - 20, o.avoid || [], o.dopt || {});
  });
}
function scn_stats(c, x, y, run) {
  const mins = Math.round((Date.now() - run.stats.start) / 60000);
  const rows = [['Fights won', run.stats.fights], ['Talks won', run.stats.talks], ['Stops visited', run.stats.nodes], ['Shil earned', run.stats.gold], ['Deck size', run.deck.length + run.ndeck.length], ['Grafts', run.grafts.length], ['Time', mins + ' min']];
  rows.forEach((r, i) => { txt(c, r[0], x - 150, y + i * 34, { size: 24, color: ZK }); txt(c, String(r[1]), x + 150, y + i * 34, { size: 25, font: FD, weight: 800, color: i % 2 ? ZP.limeD : ZP.pinkD, align: 'right' }); });
}
function scn_statsPanel(kind) {
  return scn_layer('stats_' + kind, 460, 300, (c) => {
    const win = kind === 'win';
    scn_sticker(c, 20, 18, 420, 264, 22, '#fffdf6', { pad: 7, band: win ? ZP.limeL : ZP.lav, bandW: 5 });
    c.strokeStyle = scn_rgba(ZP.sky, .45); c.lineWidth = 1.2; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(60, 56 + i * 34); c.lineTo(400, 56 + i * 34); c.stroke(); }
    scn_tape(c, 70, 22, 70, 20, -.25, win ? ZP.pinkL : ZP.sky); scn_tape(c, 392, 24, 70, 20, .3, win ? ZP.limeL : ZP.pinkL);
    scn_doodle(c, win ? 'star' : 'brokenheart', 418, 266, 18, { fill: win ? ZP.yel : ZP.pinkL, sticker: 3 });
  });
}

// ================================================================ WORLD MAP (DIY tour zine)
const SCN_NODE = { fight: '#ff9cc6', elite: '#b79ae8', shop: '#ffd23a', rest: '#a6e65a', event: '#7fd0e8', chest: '#ffb36b', boss: '#f06aa0' };
const SCN_PLACE = {
  1: { venue: ['The Loop Club', 'Mic Drop Cafe', 'Bass Bunker'], school: ['Skole Hall'], records: ['Vinyl Vault'], stage: ['Gutter Stage', 'Echo Park'], ferris: ['Beat Street Fair'] },
  2: { tent: ['Dust Fest', 'Tumbleweed Tent'], stage: ['Cactus Stage', 'Dry Gulch Gig'], ferris: ['Mirage Fair'], records: ['Last Pump Records'], sun: ['Sunburn Hill'] }
};
function scn_glyph(c, type, x, y, s) {
  c.save(); c.translate(x, y); c.lineJoin = 'round'; c.lineCap = 'round'; const lw = Math.max(1.6, s * .12); c.strokeStyle = ZK; c.lineWidth = lw;
  const P = (fill) => { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = ZK; c.stroke(); };
  if (type === 'fight') { // crossed microphones
    for (const sg of [-1, 1]) {
      c.save(); c.rotate(sg * .62); c.translate(0, s * .12);
      scn_rrect(c, -s * .14, -s * .2, s * .28, s * .95, s * .12); P(sg < 0 ? ZP.denim : '#5a3a7a');
      c.fillStyle = sg < 0 ? ZP.pink : ZP.lime; c.fillRect(-s * .14, -s * .18, s * .28, s * .13); c.lineWidth = lw * .7; c.strokeRect(-s * .14, -s * .18, s * .28, s * .13);
      c.beginPath(); c.arc(0, -s * .5, s * .34, 0, 6.283); P('#eeedf5');
      c.save(); c.beginPath(); c.arc(0, -s * .5, s * .34, 0, 6.283); c.clip(); c.lineWidth = lw * .45; c.beginPath(); for (let k = -2; k <= 2; k++) { c.moveTo(k * s * .13, -s); c.lineTo(k * s * .13, 0); c.moveTo(-s, -s * .5 + k * s * .13); c.lineTo(s, -s * .5 + k * s * .13); } c.stroke(); c.restore();
      c.beginPath(); c.arc(0, -s * .5, s * .34, 0, 6.283); c.lineWidth = lw; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(-s * .12, -s * .64, s * .09, s * .05, -.6, 0, 6.283); c.fill();
      c.restore();
    }
  } else if (type === 'elite') { // skull with sunglasses
    c.beginPath(); c.moveTo(-s * .64, s * .02); c.bezierCurveTo(-s * .78, -s * .98, s * .78, -s * .98, s * .64, s * .02); c.quadraticCurveTo(s * .58, s * .32, s * .36, s * .38); c.lineTo(s * .36, s * .64); c.quadraticCurveTo(0, s * .78, -s * .36, s * .64); c.lineTo(-s * .36, s * .38); c.quadraticCurveTo(-s * .58, s * .32, -s * .64, s * .02); c.closePath(); P('#fffaf0');
    c.lineWidth = lw * .6; c.beginPath(); for (const k of [-1, 0, 1]) { c.moveTo(k * s * .15, s * .44); c.lineTo(k * s * .15, s * .67); } c.stroke();
    c.fillStyle = ZK; c.beginPath(); c.moveTo(0, s * .1); c.lineTo(-s * .09, s * .27); c.lineTo(s * .09, s * .27); c.closePath(); c.fill();
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * s * .05, -s * .3); c.lineTo(sg * s * .66, -s * .36); c.quadraticCurveTo(sg * s * .64, s * .02, sg * s * .33, 0); c.quadraticCurveTo(sg * s * .07, -s * .02, sg * s * .05, -s * .3); c.closePath(); c.fill(); }
    c.lineWidth = lw; c.beginPath(); c.moveTo(-s * .78, -s * .38); c.lineTo(s * .78, -s * .38); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = lw * .55; for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * s * .2 - s * .05, -s * .24); c.lineTo(sg * s * .2 + s * .08, -s * .14); c.stroke(); }
    c.fillStyle = scn_rgba(ZP.pink, .6); c.beginPath(); c.ellipse(-s * .45, s * .16, s * .1, s * .06, 0, 0, 6.283); c.ellipse(s * .45, s * .16, s * .1, s * .06, 0, 0, 6.283); c.fill();
  } else if (type === 'shop') { // merch-stall storefront
    scn_rrect(c, -s * .62, -s * .2, s * 1.24, s * .9, s * .06); P('#fffaf0');
    scn_rrect(c, -s * .44, s * .05, s * .36, s * .65, s * .05); P(ZP.pink);
    scn_rrect(c, s * .02, s * .05, s * .42, s * .3, s * .04); P(ZP.sky);
    c.save(); c.beginPath(); c.moveTo(-s * .76, -s * .62); c.lineTo(s * .76, -s * .62); c.lineTo(s * .76, -s * .2);
    for (let k = 3; k >= 0; k--) c.arc(-s * .76 + (k + .5) * s * .38, -s * .2, s * .19, 0, Math.PI);
    c.closePath(); c.fillStyle = '#fff'; c.fill(); c.clip(); c.fillStyle = ZP.pink; for (let k = 0; k < 4; k += 2) c.fillRect(-s * .76 + k * s * .38, -s * .7, s * .38, s * .7); c.restore();
    c.beginPath(); c.moveTo(-s * .76, -s * .62); c.lineTo(s * .76, -s * .62); c.lineTo(s * .76, -s * .2); for (let k = 3; k >= 0; k--) c.arc(-s * .76 + (k + .5) * s * .38, -s * .2, s * .19, 0, Math.PI); c.closePath(); c.lineWidth = lw; c.stroke();
    scn_doodle(c, 'heart', s * .23, s * .2, s * .1, { fill: ZP.pink, lw: lw * .6, shine: false });
  } else if (type === 'rest') { // tent with fairy lights
    c.beginPath(); c.moveTo(-s * .85, s * .6); c.lineTo(0, -s * .72); c.lineTo(s * .85, s * .6); c.closePath(); P(ZP.yel);
    c.beginPath(); c.moveTo(-s * .26, s * .6); c.lineTo(0, -s * .05); c.lineTo(s * .26, s * .6); c.closePath(); P(ZP.denim);
    c.beginPath(); c.moveTo(0, -s * .72); c.lineTo(0, -s * .95); c.stroke(); c.beginPath(); c.moveTo(0, -s * .95); c.lineTo(s * .3, -s * .86); c.lineTo(0, -s * .78); c.closePath(); P(ZP.pink);
    c.lineWidth = lw * .6; c.beginPath(); c.moveTo(-s * .62, s * .05); c.quadraticCurveTo(0, s * .38, s * .62, s * .05); c.stroke();
    const bul = [ZP.pink, ZP.cyan, ZP.lime, ZP.orange, ZP.lav];
    for (let k = 0; k < 5; k++) { const t = (k + .5) / 5, bx = lerp(-s * .62, s * .62, t), by = s * .05 + 4 * t * (1 - t) * s * .33 * .75 + s * .06; c.beginPath(); c.arc(bx, by, s * .085, 0, 6.283); c.fillStyle = bul[k]; c.fill(); c.lineWidth = lw * .5; c.stroke(); }
  } else if (type === 'event') { // ? speech bubble
    c.beginPath(); c.ellipse(0, -s * .1, s * .78, s * .62, 0, 0, 6.283); c.moveTo(-s * .2, s * .42); P('#fff');
    c.beginPath(); c.moveTo(-s * .3, s * .38); c.lineTo(-s * .5, s * .78); c.lineTo(-s * .02, s * .48); c.fillStyle = '#fff'; c.fill(); c.lineWidth = lw; c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, -s * .1, s * .78 - lw * .6, s * .62 - lw * .6, 0, 0, 6.283); c.fill();
    txt(c, '?', 0, -s * .06, { size: s * 1.05, font: FD, weight: 800, color: ZP.pink, stroke: ZK, sw: lw * 1.4, align: 'center', base: 'middle' });
  } else if (type === 'chest') { // gift box
    scn_rrect(c, -s * .6, -s * .12, s * 1.2, s * .78, s * .05); P(ZP.pink);
    scn_rrect(c, -s * .7, -s * .36, s * 1.4, s * .28, s * .06); P(ZP.pinkL);
    c.fillStyle = ZP.lime; c.fillRect(-s * .12, -s * .36, s * .24, s * 1.02); c.lineWidth = lw * .8; c.strokeRect(-s * .12, -s * .36, s * .24, s * 1.02);
    for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(sg * s * .26, -s * .52, s * .26, s * .15, sg * .5, 0, 6.283); P(ZP.lime); }
    c.beginPath(); c.arc(0, -s * .44, s * .1, 0, 6.283); P(ZP.limeL);
  } else if (type === 'boss') scn_doodle(c, 'crown', 0, s * .05, s * .8, { fill: ZP.yel, lw: lw });
  c.restore();
}
function scn_nodePath(c, type, cx, cy, rad) {
  if (type === 'boss') { c.save(); c.translate(cx, cy); scn_star(c, rad * 1.3, rad * .82, 6); c.restore(); }
  else if (type === 'elite') { c.beginPath(); for (let i = 0; i <= 96; i++) { const a = i / 96 * 6.283, rr = rad * (.95 + .06 * Math.cos(a * 12)); c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }
  else { c.beginPath(); c.arc(cx, cy, rad, 0, 6.283); }
}
function scn_nodeSprite(type, r, mode = '') {
  return scn_layer('nd_' + type + r + mode, r * 3.2, r * 3.2, (c, w, h) => {
    const cx = w / 2, cy = h / 2, col = SCN_NODE[type] || '#fff', rr = scn_rng(r * 31 + type.length * 7);
    if (mode === 'g') c.filter = 'saturate(.25) brightness(1.08)';
    c.lineJoin = 'round';
    scn_nodePath(c, type, cx + 2, cy + 4, r + 6); c.fillStyle = 'rgba(21,16,28,.22)'; c.fill();
    scn_nodePath(c, type, cx, cy, r + 6); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = 'rgba(21,16,28,.3)'; c.lineWidth = 1.2; c.stroke();
    scn_nodePath(c, type, cx, cy, r); const g = c.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r * 1.2); g.addColorStop(0, scn_mix(col, '#ffffff', .45)); g.addColorStop(.6, col); g.addColorStop(1, scn_mix(col, '#000000', .12)); c.fillStyle = g; c.fill();
    c.save(); scn_nodePath(c, type, cx, cy, r); c.clip();
    c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); for (let i = 0; i < r * r * .4; i++) c.rect(cx + (rr() - .5) * r * 2.6, cy + (rr() - .5) * r * 2.6, 1, 1); c.fill();
    c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.ellipse(cx - r * .38, cy - r * .55, r * .38, r * .16, -.5, 0, 6.283); c.fill();
    c.restore();
    scn_nodePath(c, type, cx, cy, r); c.strokeStyle = ZK; c.lineWidth = 3.5; c.stroke();
    scn_glyph(c, type, cx, cy + 1, r * .62);
  });
}
function scn_nodeR(n) { return n.type === 'boss' ? 46 : n.type === 'elite' ? 34 : 29; }
function scn_edgeFn(n, m) {
  const cx = (n.x + m.x) / 2, cy = (n.y + m.y) / 2 + (n.id != null ? Math.sin(n.id) * 14 : 0);
  return t => [(1 - t) * (1 - t) * n.x + 2 * t * (1 - t) * cx + t * t * m.x, (1 - t) * (1 - t) * n.y + 2 * t * (1 - t) * cy + t * t * m.y];
}
const SCN_START = { x: 50, y: 410 };
// ---- landmark doodles (x,y = centre; ground at y + s*.75)
function scn_lm(c, kind, x, y, s, r, act) {
  const gy = y + s * .75; c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = ZK; c.lineWidth = 2.2;
  const shadow = (w) => { c.fillStyle = 'rgba(21,16,28,.12)'; c.beginPath(); c.ellipse(x, gy + 2, w, s * .12, 0, 0, 6.283); c.fill(); };
  if (kind === 'venue') {
    const w = s * 1.5, h = s * 1.0, col = pick2(r, [ZP.lav, '#ffc0da', '#bfe9f5']); shadow(w * .6);
    scn_box(c, x - w / 2, gy - h, w, h, col);
    scn_box(c, x - w * .44, gy - h - s * .44, w * .88, s * .4, ZP.yel, 6);
    txt(c, 'LIVE', x, gy - h - s * .24, { size: s * .3, font: FD, weight: 800, color: ZP.pink, stroke: ZK, sw: 2.2, align: 'center', base: 'middle' });
    for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#fff' : ZP.orange; c.beginPath(); c.arc(x - w * .38 + i * w * .76 / 6, gy - h - s * .44, 2.2, 0, 6.283); c.fill(); }
    c.beginPath(); c.moveTo(x - s * .16, gy); c.lineTo(x - s * .16, gy - s * .38); c.arc(x, gy - s * .38, s * .16, Math.PI, 0); c.lineTo(x + s * .16, gy); c.fillStyle = ZP.navy; c.fill(); c.stroke();
    for (const sg of [-1, 1]) { scn_box(c, x + sg * w * .32 - s * .12, gy - h * .75, s * .24, s * .22, '#fff', 2, 1.6); scn_doodle(c, 'star', x + sg * w * .32, gy - h * .64, s * .07, { fill: ZP.pink, lw: 1, shine: false }); }
  } else if (kind === 'school') {
    const w = s * 2, h = s * .85; shadow(w * .55);
    scn_box(c, x - w / 2, gy - h, w, h, '#ffe9a8');
    c.beginPath(); c.moveTo(x - s * .45, gy - h); c.lineTo(x, gy - h - s * .55); c.lineTo(x + s * .45, gy - h); c.closePath(); c.fillStyle = ZP.pinkL; c.fill(); c.stroke();
    c.beginPath(); c.arc(x, gy - h - s * .2, s * .12, 0, 6.283); c.fillStyle = ZP.yel; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + w * .38, gy - h); c.lineTo(x + w * .38, gy - h - s * .55); c.stroke(); c.beginPath(); c.moveTo(x + w * .38, gy - h - s * .55); c.lineTo(x + w * .38 + s * .3, gy - h - s * .46); c.lineTo(x + w * .38, gy - h - s * .37); c.closePath(); c.fillStyle = ZP.lime; c.fill(); c.stroke();
    for (let i = 0; i < 4; i++) { if (i === 1 || i === 2) continue; for (let j = 0; j < 2; j++) scn_box(c, x - w * .42 + i * w * .23, gy - h + s * .14 + j * s * .3, s * .22, s * .2, ZP.sky, 2, 1.5); }
    scn_box(c, x - s * .15, gy - s * .45, s * .3, s * .45, ZP.pink, 2, 1.8);
  } else if (kind === 'records') {
    const w = s * 1.5, h = s * .9; shadow(w * .6);
    scn_doodle(c, 'vinyl', x + w * .18, gy - h - s * .3, s * .4, { label: ZP.lime, lw: 2 });
    scn_box(c, x - w / 2, gy - h, w, h, '#c9f3dd');
    c.save(); c.beginPath(); c.rect(x - w / 2 - 3, gy - h - 2, w + 6, s * .3); c.clip(); for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#fff' : ZP.pink; c.fillRect(x - w / 2 - 3 + k * (w + 6) / 8, gy - h - 2, (w + 6) / 8 + .5, s * .3); } c.restore();
    c.beginPath(); c.rect(x - w / 2 - 3, gy - h - 2, w + 6, s * .3); c.stroke();
    scn_box(c, x - w * .4, gy - h * .55, w * .45, h * .4, '#fff', 2, 1.6); scn_doodle(c, 'vinyl', x - w * .18, gy - h * .35, s * .14, { lw: 1 });
    scn_box(c, x + w * .12, gy - h * .55, s * .3, h * .55, ZP.lav, 2, 1.8);
  } else if (kind === 'stage') {
    const w = s * 1.1; shadow(w * 1.1);
    for (const [col, ax] of [[ZP.pink, -.6], [ZP.cyan, .6]]) { c.save(); c.globalAlpha = .28; c.fillStyle = col; c.beginPath(); c.moveTo(x + ax * w * .6, gy - s * 1.25); c.lineTo(x + ax * w * .6 - s * .5 - ax * s * .3, gy - s * .3); c.lineTo(x + ax * w * .6 + s * .5 - ax * s * .3, gy - s * .3); c.closePath(); c.fill(); c.restore(); }
    scn_box(c, x - w, gy - s * .32, w * 2, s * .32, ZP.lav, 3);
    c.lineWidth = 2; c.beginPath(); for (const sg of [-1, 1]) { c.moveTo(x + sg * w * .9, gy - s * .32); c.lineTo(x + sg * w * .9, gy - s * 1.35); } c.moveTo(x - w * .95, gy - s * 1.32); c.lineTo(x + w * .95, gy - s * 1.32); c.stroke();
    c.lineWidth = 1; c.beginPath(); for (let k = 0; k < 6; k++) { const a = x - w * .9 + k * w * 1.8 / 6; c.moveTo(a, gy - s * 1.32); c.lineTo(a + w * .3, gy - s * 1.22); } c.stroke();
    [ZP.pink, ZP.yel, ZP.cyan, ZP.lime].forEach((col, k) => { c.beginPath(); c.arc(x - w * .55 + k * w * .37, gy - s * 1.22, s * .07, 0, 6.283); c.fillStyle = col; c.fill(); c.lineWidth = 1.4; c.stroke(); });
    for (const sg of [-1, 1]) scn_doodle(c, 'speaker', x + sg * w * .72, gy - s * .55, s * .2, { lw: 1.5 });
    scn_doodle(c, 'note1', x, gy - s * .75, s * .18, { lw: 1.6, col: ZP.pinkD });
  } else if (kind === 'speakers') {
    shadow(s * .7);
    for (let i = 0; i < 2; i++) for (let j = 0; j < (i ? 1 : 2); j++) scn_doodle(c, 'speaker', x - s * .3 + j * s * .62 + i * s * .3, gy - s * .42 - i * s * .8, s * .38, { lw: 2 });
    scn_doodle(c, 'rays', x + s * .5, gy - s * 1.3, s * .3, { col: ZP.pinkD, rot: .5, lw: 2 });
  } else if (kind === 'hill') {
    const w = s * 1.25, h = s * (.85 + r() * .3), col = act === 2 ? pick2(r, ['#ffd99a', '#ffc0da']) : pick2(r, [ZP.limeL, '#c9f0a0']);
    c.beginPath(); c.moveTo(x - w, gy); c.bezierCurveTo(x - w * .6, gy - h * 1.3, x + w * .6, gy - h * 1.3, x + w, gy); c.closePath(); c.fillStyle = col; c.fill(); c.stroke();
    c.fillStyle = ZK; c.beginPath(); c.ellipse(x - s * .22, gy - h * .55, 2.4, 3.4, 0, 0, 6.283); c.ellipse(x + s * .22, gy - h * .55, 2.4, 3.4, 0, 0, 6.283); c.fill();
    c.lineWidth = 2; c.beginPath(); c.arc(x, gy - h * .5, s * .16, .4, Math.PI - .4); c.stroke();
    c.fillStyle = scn_rgba(ZP.pink, .5); c.beginPath(); c.ellipse(x - s * .38, gy - h * .4, 5, 3, 0, 0, 6.283); c.ellipse(x + s * .38, gy - h * .4, 5, 3, 0, 0, 6.283); c.fill();
    c.lineWidth = 1.4; c.beginPath(); for (let k = 0; k < 4; k++) { const gx = x - w * .7 + k * w * .45 + r() * 6; c.moveTo(gx, gy - 3); c.lineTo(gx - 2, gy - 8); c.moveTo(gx + 3, gy - 3); c.lineTo(gx + 4, gy - 9); } c.stroke();
  } else if (kind === 'cat') {
    scn_doodle(c, 'cat', x, gy - s * .7, s * .62, { fill: '#fff', sticker: 3, lw: 2.2 });
  } else if (kind === 'bus') {
    const w = s * 1.15; shadow(w);
    scn_box(c, x - w, gy - s * .78, w * 2, s * .62, ZP.pinkL, s * .14);
    c.fillStyle = ZP.lime; c.fillRect(x - w + 2, gy - s * .38, w * 2 - 4, s * .1);
    for (let k = 0; k < 4; k++) scn_box(c, x - w * .85 + k * w * .38, gy - s * .7, w * .28, s * .2, ZP.sky, 3, 1.5);
    scn_box(c, x + w * .72, gy - s * .7, w * .22, s * .3, ZP.sky, 3, 1.5);
    txt(c, 'TOUR', x - w * .25, gy - s * .22, { size: s * .2, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 2, align: 'center', base: 'middle' });
    for (const sg of [-.6, .6]) { c.beginPath(); c.arc(x + sg * w, gy - s * .14, s * .14, 0, 6.283); c.fillStyle = ZP.navy; c.fill(); c.stroke(); c.beginPath(); c.arc(x + sg * w, gy - s * .14, s * .05, 0, 6.283); c.fillStyle = '#ccc'; c.fill(); }
  } else if (kind === 'tree') {
    shadow(s * .45);
    c.fillStyle = '#c98a5a'; c.fillRect(x - s * .07, gy - s * .6, s * .14, s * .6); c.strokeRect(x - s * .07, gy - s * .6, s * .14, s * .6);
    c.beginPath(); c.arc(x, gy - s * .9, s * .45, 0, 6.283); c.fillStyle = act === 2 ? ZP.yel : ZP.limeL; c.fill(); c.stroke();
    for (let k = 0; k < 3; k++) scn_doodle(c, 'heart', x + (r() - .5) * s * .5, gy - s * .9 + (r() - .5) * s * .4, s * .08, { fill: ZP.pink, lw: 1, shine: false });
  } else if (kind === 'tent') {
    const w = s * 1.05; shadow(w);
    c.save(); c.beginPath(); c.moveTo(x - w, gy); c.quadraticCurveTo(x - w * .3, gy - s * .6, x, gy - s * 1.2); c.quadraticCurveTo(x + w * .3, gy - s * .6, x + w, gy); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.clip();
    c.fillStyle = act === 2 ? ZP.orange : ZP.pink; for (let k = -4; k < 4; k += 2) { c.beginPath(); c.moveTo(x, gy - s * 1.25); c.lineTo(x + k * w / 4, gy + 2); c.lineTo(x + (k + 1) * w / 4, gy + 2); c.closePath(); c.fill(); } c.restore();
    c.beginPath(); c.moveTo(x - w, gy); c.quadraticCurveTo(x - w * .3, gy - s * .6, x, gy - s * 1.2); c.quadraticCurveTo(x + w * .3, gy - s * .6, x + w, gy); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(x, gy - s * 1.2); c.lineTo(x, gy - s * 1.45); c.stroke(); c.beginPath(); c.moveTo(x, gy - s * 1.45); c.lineTo(x + s * .32, gy - s * 1.36); c.lineTo(x, gy - s * 1.27); c.closePath(); c.fillStyle = ZP.lime; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - s * .18, gy); c.quadraticCurveTo(x, gy - s * .55, x + s * .18, gy); c.fillStyle = ZP.navy; c.fill(); c.stroke();
  } else if (kind === 'cactus') {
    shadow(s * .4);
    const g = '#7fd06a'; c.lineWidth = 2.2;
    const arm = (sx, y0, y1) => { c.beginPath(); c.moveTo(x + sx * s * .14, gy - s * y0); c.lineTo(x + sx * s * .4, gy - s * y0); c.lineTo(x + sx * s * .4, gy - s * y1); c.lineWidth = s * .2 + 4.4; c.strokeStyle = ZK; c.stroke(); c.lineWidth = s * .2; c.strokeStyle = g; c.stroke(); };
    arm(-1, .55, .85); arm(1, .7, 1.05);
    scn_rrect(c, x - s * .2, gy - s * 1.3, s * .4, s * 1.3, s * .2); c.fillStyle = g; c.fill(); c.lineWidth = 2.2; c.strokeStyle = ZK; c.stroke();
    c.fillStyle = ZK; c.beginPath(); c.arc(x - s * .08, gy - s * .9, 2, 0, 6.283); c.arc(x + s * .08, gy - s * .9, 2, 0, 6.283); c.fill(); c.lineWidth = 1.6; c.beginPath(); c.arc(x, gy - s * .84, s * .06, .3, Math.PI - .3); c.stroke();
    scn_doodle(c, 'flower', x, gy - s * 1.32, s * .14, { lw: 1.2 });
  } else if (kind === 'ferris') {
    const R = s * .9, cy = gy - s * 1.05; shadow(s * .7);
    c.lineWidth = 2; c.beginPath(); c.moveTo(x - s * .5, gy); c.lineTo(x, cy); c.lineTo(x + s * .5, gy); c.stroke();
    c.beginPath(); c.arc(x, cy, R, 0, 6.283); c.stroke(); c.lineWidth = 1.2; c.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; c.moveTo(x, cy); c.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R); } c.stroke();
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; scn_box(c, x + Math.cos(a) * R - s * .1, cy + Math.sin(a) * R - s * .02, s * .2, s * .17, SCN_CONF[k % 6], 3, 1.5); }
    c.beginPath(); c.arc(x, cy, s * .1, 0, 6.283); c.fillStyle = ZP.yel; c.fill(); c.lineWidth = 2; c.stroke();
  } else if (kind === 'sun') {
    const R = s * .52, cy = gy - s * .8;
    c.lineWidth = 2; c.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; c.moveTo(x + Math.cos(a) * R * 1.2, cy + Math.sin(a) * R * 1.2); c.lineTo(x + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 1.55); } c.stroke();
    c.beginPath(); c.arc(x, cy, R, 0, 6.283); c.fillStyle = ZP.yel; c.fill(); c.lineWidth = 2.2; c.stroke();
    c.fillStyle = ZK; for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(x + sg * R * .36, cy - R * .12, R * .3, R * .18, 0, 0, 6.283); c.fill(); } c.lineWidth = 2; c.beginPath(); c.moveTo(x - R * .7, cy - R * .2); c.lineTo(x + R * .7, cy - R * .2); c.stroke();
    c.beginPath(); c.arc(x, cy + R * .2, R * .35, .3, Math.PI - .3); c.stroke();
  }
  c.restore();
}
function scn_mapArt(map, act) {
  const res = scn_res(), fr = scn_fontsReady();
  let rec = SCN.maps.get(map);
  if (rec && rec.res === res && rec.fr === fr) return rec;
  rec = scn_buildMap(map, act); rec.res = res; rec.fr = fr; SCN.maps.set(map, rec); return rec;
}
function scn_buildMap(map, act) {
  const nodes = map.nodes, res = scn_res();
  let seed = act * 7919 + 13; nodes.forEach(n => { seed = (Math.imul(seed, 31) + ((n.x * 13 + n.y * 7) | 0)) >>> 0; });
  const r = scn_rng(seed);
  const FX0 = 16, FY0 = 70, FX1 = W - 16, FY1 = H - 10;
  const edgePts = [];
  nodes.forEach(n => n.next.forEach(id => { const f = scn_edgeFn(n, nodes[id]); for (let i = 0; i <= 24; i++) edgePts.push(f(i / 24)); }));
  nodes.filter(n => n.col === 0).forEach(m => { const f = scn_edgeFn(SCN_START, m); for (let i = 0; i <= 16; i++) edgePts.push(f(i / 16)); });
  const ph = r() * 6, roadY = x => 690 + Math.sin(x / 170 + ph) * 5;
  const TITLE = { x: W / 2, y: 114, rx: 330, ry: 62 }, LEG = { x0: 1088, y0: 72, x1: 1270, y1: 254 };
  const free = (x, y, s) => {
    if (x - s < FX0 + 10 || x + s > FX1 - 10 || y - s * 1.3 < FY0 + 14 || y + s * 1.2 > roadY(x) - 16) return false;
    for (const n of nodes) { const rr = scn_nodeR(n) * 1.25 + s + 8; if ((n.x - x) ** 2 + (n.y - y) ** 2 < rr * rr) return false; }
    if ((SCN_START.x - x) ** 2 + (SCN_START.y - y) ** 2 < (s + 60) ** 2) return false;
    for (const p of edgePts) { if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < (s + 10) ** 2) return false; }
    if (((x - TITLE.x) / (TITLE.rx + s)) ** 2 + ((y - TITLE.y) / (TITLE.ry + s)) ** 2 < 1) return false;
    if (x + s > LEG.x0 && y - s * 1.3 < LEG.y1) return false;
    if (x - s < 210 && y + s > 640) return false;
    return true;
  };
  const props = [];
  const tryPlace = (n, smin, smax, cls) => {
    for (let i = 0, k = 0; i < 1600 && k < n; i++) {
      const s = smin + r() * (smax - smin), x = FX0 + r() * (FX1 - FX0), y = FY0 + r() * (FY1 - FY0);
      if (!free(x, y, s)) continue;
      if (cls === 'big' && !(free(x - s * .8, y + s * .95, s * .45) && free(x + s * .8, y + s * .95, s * .45))) continue;
      if (props.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < (p.s + s + 10) ** 2)) continue;
      props.push({ x, y, s, cls }); k++;
    }
  };
  tryPlace(9, 40, 54, 'big'); tryPlace(14, 22, 32, 'mid'); tryPlace(46, 8, 14, 'small');
  const bigK = act === 2 ? ['tent', 'stage', 'ferris', 'hill', 'bus', 'sun', 'records', 'tent'] : ['venue', 'school', 'records', 'stage', 'hill', 'bus', 'ferris', 'venue'];
  const midK = act === 2 ? ['cactus', 'cactus', 'speakers', 'cat', 'hill', 'tree'] : ['speakers', 'tree', 'cat', 'hill', 'tree', 'speakers'];
  const names = SCN_PLACE[act] || SCN_PLACE[1], used = {}; let bi = 0;
  props.forEach(p => {
    if (p.cls === 'big') { p.k = bigK[bi++ % bigK.length]; const l = names[p.k]; if (l) { const k = used[p.k] = (used[p.k] || 0) + 1; if (k <= l.length) p.name = l[k - 1]; } }
    else if (p.cls === 'mid') p.k = pick2(r, midK);
    else p.k = 'doodle';
  });
  const rec = { roadY };
  rec.L = { w: W, h: H, cv: document.createElement('canvas') }; rec.L.cv.width = Math.ceil(W * res); rec.L.cv.height = Math.ceil(H * res);
  const c = rec.L.cv.getContext('2d'); c.scale(res, res);
  scn_paper(c, 0, 0, W, H, seed, act === 2 ? '#fdf5e4' : ZP.cream);
  // pastel spray washes (under everything)
  const wash = act === 2 ? [ZP.yel, '#ffc48a', ZP.pinkL, ZP.limeL, ZP.yel] : [ZP.pinkL, ZP.limeL, ZP.sky, ZP.lav, ZP.pinkL];
  for (let gx = 0; gx < 5; gx++) for (let gyy = 0; gyy < 3; gyy++) { if (r() < .25) continue; scn_spray(c, 120 + gx * 260 + (r() - .5) * 140, 180 + gyy * 200 + (r() - .5) * 120, 90 + r() * 80, wash[(gx + gyy * 2) % wash.length], r, { a: .32 + r() * .14, dots: 500 }); }
  // tour road along the bottom
  c.save(); c.lineCap = 'round';
  c.strokeStyle = act === 2 ? '#f3dcb0' : '#e9e2f2'; c.lineWidth = 22; c.beginPath(); for (let x = FX0; x <= FX1; x += 8) { x === FX0 ? c.moveTo(x, roadY(x)) : c.lineTo(x, roadY(x)); } c.stroke();
  c.strokeStyle = ZK; c.lineWidth = 2; for (const o of [-11, 11]) { c.beginPath(); for (let x = FX0; x <= FX1; x += 8) { x === FX0 ? c.moveTo(x, roadY(x) + o) : c.lineTo(x, roadY(x) + o); } c.stroke(); }
  c.setLineDash([10, 9]); c.strokeStyle = ZP.yel; c.lineWidth = 3; c.beginPath(); for (let x = FX0; x <= FX1; x += 8) { x === FX0 ? c.moveTo(x, roadY(x)) : c.lineTo(x, roadY(x)); } c.stroke(); c.setLineDash([]);
  c.restore();
  scn_marker(c, act === 1 ? 'next stop: the dust belt  >>' : 'encore this way  >>', FX1 - 26, roadY(FX1 - 120) - 18, 15, ZK, { align: 'right', rot: -.02 });
  // landmarks & doodles, back to front
  props.sort((a, b) => a.y - b.y).forEach(p => {
    if (p.k === 'doodle') {
      const k = pick2(r, ['heart', 'star', 'sparkle', 'note', 'note1', 'plus', 'loop', 'smiley', 'flower', 'dash', 'swirl']);
      const fill = k === 'smiley' ? ZP.yel : (k === 'heart' || k === 'star' || k === 'flower') && r() < .6 ? pick2(r, [ZP.pinkL, ZP.limeL, ZP.yel, ZP.sky]) : null;
      scn_doodle(c, k, p.x, p.y, p.s, { fill, col: fill ? ZK : (r() < .7 ? ZK : ZP.pinkD), rot: (r() - .5) * .6, lw: 2 });
    } else {
      scn_lm(c, p.k, p.x, p.y, p.s, r, act);
      if (p.name) scn_marker(c, p.name, p.x, p.y + p.s * .75 + 17, 14, ZK, { rot: (r() - .5) * .06 });
    }
  });
  rec.twinkles = props.filter(p => p.cls === 'small').slice(0, 8).map(p => [p.x + p.s, p.y - p.s]);
  // start sticker
  scn_doodle(c, 'star', 34, 450, 15, { fill: ZP.limeL, sticker: 3, lw: 2.4 });
  scn_marker(c, 'START', 46, 478, 17, ZK, { rot: -.06 });
  // hand-drawn page frame with corner stars
  c.save(); c.strokeStyle = ZK; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath();
  const fr = scn_rng(seed + 9), wob = () => (fr() - .5) * 2.2; c.moveTo(FX0 + 20, FY0 + wob());
  for (let x = FX0 + 20; x <= FX1 - 20; x += 40) c.lineTo(x, FY0 + wob()); c.arcTo(FX1, FY0, FX1, FY0 + 20, 20);
  for (let y = FY0 + 20; y <= FY1 - 20; y += 40) c.lineTo(FX1 + wob(), y); c.arcTo(FX1, FY1, FX1 - 20, FY1, 20);
  for (let x = FX1 - 20; x >= FX0 + 20; x -= 40) c.lineTo(x, FY1 + wob()); c.arcTo(FX0, FY1, FX0, FY1 - 20, 20);
  for (let y = FY1 - 20; y >= FY0 + 20; y -= 40) c.lineTo(FX0 + wob(), y); c.arcTo(FX0, FY0, FX0 + 20, FY0, 20);
  c.stroke(); c.restore();
  scn_doodle(c, 'star', FX0 + 8, FY1 - 8, 14, { fill: ZP.pinkL, sticker: 3, lw: 2.2, rot: .2 });
  // title banner: bubble letters on a spray splat
  scn_spray(c, TITLE.x, TITLE.y - 4, 150, act === 1 ? ZP.pink : ZP.lime, r, { hard: true, sx: 2.25, sy: .42, a: .5, drips: 4, dots: 900 });
  scn_doodle(c, 'dash', TITLE.x - 345, TITLE.y - 18, 16, { col: act === 1 ? ZP.pinkD : ZP.limeD, rot: -.5, lw: 3.4 });
  scn_doodle(c, 'dash', TITLE.x + 345, TITLE.y - 18, 16, { col: act === 1 ? ZP.pinkD : ZP.limeD, rot: Math.PI + .5, lw: 3.4 });
  scn_bubble(c, act === 1 ? 'THE RUST QUARTER' : 'THE DUST BELT', TITLE.x, TITLE.y - 10, 58, act === 1 ? ZP.lime : ZP.pink, { maxW: 600, seed: act });
  scn_marker(c, act === 1 ? '~ act one: the tour kicks off! ~' : '~ act two: festival season ~', TITLE.x, TITLE.y + 44, 18, ZK, { rot: -.015 });
  // key / legend sticker
  const lx = LEG.x0 + 8, ly = LEG.y0 + 8, lw2 = LEG.x1 - LEG.x0 - 16, lh = 176;
  c.save(); c.translate(lx + lw2 / 2, ly + lh / 2); c.rotate(.02); c.translate(-(lx + lw2 / 2), -(ly + lh / 2));
  scn_sticker(c, lx, ly, lw2, lh, 14, '#fffdf7', { pad: 5, band: ZP.limeL, bandW: 4, lw: 3 });
  scn_marker(c, 'TOUR KEY', lx + lw2 / 2, ly + 26, 18, ZK);
  [['fight', 'Gig fight'], ['elite', 'Headliner'], ['shop', 'Merch stall'], ['rest', 'Chill tent'], ['event', 'Weird stuff'], ['chest', 'Free gift'], ['boss', 'Big boss']].forEach((e, i) => {
    const yy = ly + 46 + i * 18.4, L = scn_nodeSprite(e[0], 29); c.drawImage(L.cv, lx + 18 - 13, yy - 13, 26, 26);
    txt(c, e[1], lx + 36, yy + 5, { size: 14, font: FM, color: ZK });
  });
  c.restore();
  scn_tape(c, lx + lw2 / 2, ly - 4, 64, 18, -.06, ZP.pinkL);
  scn_marker(c, '1 cm = 1 gig', 120, 662, 15, ZK, { rot: -.04 });
  c.strokeStyle = ZK; c.lineWidth = 2.2; c.beginPath(); c.moveTo(70, 670); c.lineTo(170, 668); c.moveTo(70, 664); c.lineTo(70, 676); c.moveTo(170, 662); c.lineTo(170, 674); c.stroke();
  return rec;
}
function scn_reach(nodes, av) {
  const S = new Set(av), q = av.slice();
  while (q.length) { const id = q.pop(); for (const nx of nodes[id].next) if (!S.has(nx)) { S.add(nx); q.push(nx); } }
  return S;
}
function scn_busSprite() {
  return scn_layer('tourbus', 96, 54, (c) => { c.lineJoin = 'round'; scn_lm(c, 'bus', 48, 30, 38, scn_rng(4), 1); });
}
function scn_bandLayer() {
  return scn_layer('m_band', W, 240, (c) => {
    const r = scn_rng(808);
    c.fillStyle = 'rgba(251,247,234,.9)'; c.fillRect(0, 20, W, 200);
    for (let i = 0; i < 7; i++) scn_spray(c, 90 + i * 190 + r() * 40, 120 + (r() - .5) * 50, 110, i % 2 ? ZP.limeL : ZP.pinkL, r, { a: .55, dots: 700 });
    c.strokeStyle = ZK; c.lineWidth = 3; for (const y of [20, 220]) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 40) c.lineTo(x, y + (r() - .5) * 2.5); c.stroke(); }
    scn_scatter(c, r, 18, 10, 30, W - 20, 180, [[300, 30, 680, 180]], { smax: 16 });
  });
}
MapScene.prototype.draw = function (c) {
  const run = G.run, map = this.map, nodes = map.nodes, t = G.time;
  const art = scn_mapArt(map, run.act);
  scn_blit(c, art.L, 0, 0, W, H);
  // tour bus cruising the road
  const bus = scn_busSprite(), span = W + 200, bx = ((t * 38) % span) - 100;
  c.save(); c.beginPath(); c.rect(18, 600, W - 36, 110); c.clip();
  c.drawImage(bus.cv, bx - 48, art.roadY(bx) - 44 + Math.abs(Math.sin(t * 9)) * -1.5, 96, 54);
  for (let k = 0; k < 3; k++) { const p = (t * 1.2 + k / 3) % 1; c.globalAlpha = 1 - p; scn_blitC(c, scn_dsprite('heart', 5, { fill: ZP.pinkL, lw: 1.2, shine: false }), bx - 52 - p * 30, art.roadY(bx) - 18 - p * 20, .8 + p * .6); }
  c.restore();
  scn_twinkles(c, t, art.twinkles || [], 8);
  // ---- routes
  const av = this.avail(), reach = scn_reach(nodes, av);
  const groups = { trail: [], live: [], reach: [], dim: [] };
  const push = (g, from, to) => groups[g].push([from, to]);
  nodes.forEach(n => n.next.forEach(id => {
    const m = nodes[id];
    if (n.done && m.done) push('trail', n, m);
    else if (run.pos === n.id && !this.travel) push('live', n, m);
    else if ((n.id === run.pos || reach.has(n.id)) && reach.has(m.id)) push('reach', n, m);
    else push('dim', n, m);
  }));
  nodes.filter(n => n.col === 0).forEach(m => { if (m.done) push('trail', SCN_START, m); else if (run.pos < 0) push(this.travel ? 'reach' : 'live', SCN_START, m); });
  const path = (list) => { c.beginPath(); list.forEach(([n, m]) => { const cx = (n.x + m.x) / 2, cy = (n.y + m.y) / 2 + (n.id != null ? Math.sin(n.id) * 14 : 0); c.moveTo(n.x, n.y); c.quadraticCurveTo(cx, cy, m.x, m.y); }); };
  c.save(); c.lineCap = 'round';
  c.strokeStyle = 'rgba(21,16,28,.2)'; c.lineWidth = 3; c.setLineDash([.1, 11]); path(groups.dim); c.stroke();
  c.strokeStyle = 'rgba(21,16,28,.75)'; c.lineWidth = 4.5; c.setLineDash([.1, 10]); path(groups.reach); c.stroke();
  c.strokeStyle = scn_rgba(ZP.pink, .55); c.lineWidth = 11; c.setLineDash([]); path(groups.trail); c.stroke();
  c.strokeStyle = ZP.pinkD; c.lineWidth = 3.4; c.setLineDash([12, 7]); path(groups.trail); c.stroke();
  if (groups.live.length) {
    c.setLineDash([]); c.strokeStyle = scn_rgba(ZP.limeL, .7); c.lineWidth = 14; path(groups.live); c.stroke();
    c.strokeStyle = ZK; c.lineWidth = 4; c.setLineDash([9, 8]); c.lineDashOffset = -t * 24; path(groups.live); c.stroke();
  }
  c.restore();
  let mx, my, gy;
  if (this.travel) {
    const tr = this.travel, k = ease.inOut(clamp(tr.t, 0, 1)), f = scn_edgeFn(tr.from, tr.to);
    c.save(); c.lineCap = 'round'; c.strokeStyle = scn_rgba(ZP.pink, .55); c.lineWidth = 11; c.beginPath();
    for (let i = 0; i <= 20; i++) { const p = f(k * i / 20); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke();
    c.strokeStyle = ZP.pinkD; c.lineWidth = 3.4; c.setLineDash([12, 7]); c.stroke(); c.restore();
    const p = f(k); mx = p[0]; gy = p[1]; my = p[1] - Math.sin(k * Math.PI) * 30;
  } else if (run.pos >= 0) { mx = nodes[run.pos].x; my = gy = nodes[run.pos].y; }
  else { mx = 50; my = gy = 410; }
  // ---- nodes (hit logic identical to scenes.js)
  this.hoverId = -1; let hovNode = null;
  nodes.forEach(n => {
    const a = av.includes(n.id) && !this.travel, boss = n.type === 'boss', r = boss ? 46 : n.type === 'elite' ? 34 : 29;
    const hov = a && UI.hit(n.x - r - 6, n.y - r - 6, (r + 6) * 2, (r + 6) * 2);
    if (hov) { this.hoverId = n.id; UI.cursor = 'pointer'; hovNode = n; }
    const isCur = run.pos === n.id, faded = !n.done && !a && !isCur && !reach.has(n.id);
    const pulse = a ? 1 + Math.sin(t * 5 + n.id) * .06 : 1;
    c.save(); c.translate(n.x, n.y); const s = pulse * (hov ? 1.2 : 1); c.scale(s, s);
    if (boss) { // orbiting hype doodles
      for (let i = 0; i < 5; i++) { const an = t * .8 + i * 1.2566, L = scn_dsprite(i % 2 ? 'note' : 'star', 8, { fill: i % 2 ? null : [ZP.yel, ZP.limeL, ZP.pinkL][i % 3], lw: 2 }); scn_blitC(c, L, Math.cos(an) * (r + 30), Math.sin(an) * (r + 22) - 6, 1); }
    }
    if (a) {
      c.save(); c.rotate(t * .9); c.setLineDash([8, 6]); c.lineCap = 'round'; c.strokeStyle = ZP.lime; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, r + 13, 0, 6.3); c.stroke(); c.restore();
      const sp = (t * 1.3 + n.id * .37) % 1; scn_blitC(c, scn_dsprite('sparkle', 8, { fill: '#fff', lw: 2 }), r * .85, -r * .85, .6 + Math.sin(sp * Math.PI) * .6);
    }
    if (isCur) { c.save(); c.strokeStyle = ZP.pink; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, r + 11, 0, 6.3); c.stroke(); c.restore(); }
    c.globalAlpha = n.done && !isCur ? .6 : faded ? .62 : 1;
    const L = scn_nodeSprite(n.type, r, faded || (n.done && !isCur) ? 'g' : ''); c.drawImage(L.cv, -L.w / 2, -L.h / 2, L.w, L.h);
    if (n.done) { c.globalAlpha = 1; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(-r * .6, -r * .02); c.lineTo(-r * .12, r * .5); c.lineTo(r * .75, -r * .55); c.strokeStyle = '#fff'; c.lineWidth = 12; c.stroke(); c.strokeStyle = ZP.pinkD; c.lineWidth = 6.5; c.stroke(); }
    c.restore();
    if (hov) { tip(this.nodeName(n), n.type === 'fight' ? 'Fight or talk your way past.' : n.type === 'elite' ? 'A dangerous foe. Better rewards, including a Graft.' : n.type === 'boss' ? 'The big one. Prepare yourself.' : n.type === 'shop' ? 'Spend shil on cards and grafts.' : n.type === 'rest' ? 'Heal or sharpen a card.' : n.type === 'event' ? 'Something odd is happening here.' : 'Free graft inside.'); if (In.click) { In.click = null; Snd.play('click'); this.travel = { from: run.pos >= 0 ? nodes[run.pos] : { x: 40, y: 400 }, to: n, t: 0 }; } }
  });
  // hover name label sticker
  if (hovNode) {
    const r = scn_nodeR(hovNode) * 1.2, name = this.nodeName(hovNode); c.save(); c.font = `19px ${FM}`; const tw = c.measureText(name).width + 26, px = hovNode.x - tw / 2, py = hovNode.y + r + 10;
    scn_sticker(c, px, py, tw, 28, 14, SCN_NODE[hovNode.type], { pad: 4, lw: 2.6 }); c.restore();
    scn_marker(c, name, hovNode.x, py + 21, 19, ZK);
  }
  // ---- hero marker (bouncing on the route)
  c.save(); c.fillStyle = 'rgba(21,16,28,.22)'; c.beginPath(); c.ellipse(mx, gy + 2, 17, 5, 0, 0, 6.3); c.fill(); c.restore();
  const bounce = Math.abs(Math.sin(t * (this.travel ? 9 : 4))) * (this.travel ? 6 : 4);
  c.save(); c.translate(mx, my - 36 - bounce); c.scale(.28, .28); drawFigure(c, charById(run.char).spec, { t: t * (this.travel ? 3 : 1), atk: 0, talk: 0 }); c.restore();
  drawHUD(c, run);
  if (this.banner) {
    const b = this.banner, k = b.t / 2.6, a = k < .1 ? k / .1 : k > .8 ? (1 - k) / .2 : 1, e = ease.out(clamp(b.t * 3, 0, 1));
    c.save(); c.globalAlpha = a; c.translate(W / 2, 330); c.scale(1, e); c.translate(-W / 2, -330); scn_blit(c, scn_bandLayer(), 0, 210); c.restore();
    c.save(); c.globalAlpha = a; const A = scn_bubbleLayer(b.text, 100, ZP.lime, { seed: 2 }); c.translate(W / 2, 296); c.rotate(-.03); scn_blitC(c, A, 0, 0, e); c.restore();
    c.save(); c.globalAlpha = a; const S = scn_bubbleLayer(b.sub, 50, ZP.pink, { seed: 5 }); c.translate(W / 2, 384); c.rotate(.015); scn_blitC(c, S, 0, 0, 1); c.restore();
  }
};

// ================================================================ TITLE SCREEN (concert poster)
const SCN_MENU_FIG = [ // back to front: the four Hocus Vocus kit heroes flank the logo buttons
  { spec: () => CHARS[1].spec, x: 150, y: 624, s: 1.2, ph: 2 },
  { spec: () => CHARS[3].spec, x: 1170, y: 620, s: -1.2, ph: 5 },
  { spec: () => ENEMIES.sludge.spec, x: 830, y: 668, s: -0.8, ph: 4 },
  { spec: () => CHARS[0].spec, x: 345, y: 628, s: 1.2, ph: 0 },
  { spec: () => CHARS[2].spec, x: 990, y: 628, s: -1.2, ph: 1 },
  { spec: () => ENEMIES.rat.spec, x: 470, y: 672, s: 0.8, ph: 3 }
];
function scn_menuBg() {
  return scn_layer('m_bg', W, H, (c) => {
    const r = scn_rng(2024);
    scn_paper(c, 0, 0, W, H, 77);
    [[170, 170, 200, ZP.pinkL, .6], [1130, 150, 180, ZP.limeL, .6], [640, 220, 290, ZP.pinkL, .42], [1190, 440, 190, ZP.lav, .45], [90, 450, 170, ZP.limeL, .5], [640, 600, 300, ZP.sky, .28], [450, 330, 120, ZP.limeL, .35], [860, 330, 120, ZP.pinkL, .4]]
      .forEach(s => scn_spray(c, s[0], s[1], s[2], s[3], r, { a: s[4] }));
    // string lights
    c.save(); c.strokeStyle = ZK; c.lineWidth = 2; c.beginPath(); c.moveTo(-10, 18); c.quadraticCurveTo(W / 2, 92, W + 10, 18); c.stroke();
    for (let i = 1; i < 26; i++) { const tt = i / 26, x = lerp(-10, W + 10, tt), y = (1 - tt) * (1 - tt) * 18 + 2 * tt * (1 - tt) * 92 + tt * tt * 18; c.beginPath(); c.ellipse(x, y + 7, 4.5, 6.5, 0, 0, 6.283); c.fillStyle = SCN_CONF[i % 6]; c.fill(); c.lineWidth = 1.5; c.stroke(); }
    c.restore();
    // stage
    c.save();
    c.beginPath(); c.moveTo(0, 548); c.lineTo(W, 548); c.lineTo(W, 684); c.lineTo(0, 684); c.closePath(); c.fillStyle = '#f4e8f6'; c.fill();
    c.clip(); c.strokeStyle = 'rgba(21,16,28,.12)'; c.lineWidth = 1.5; c.beginPath(); for (let k = -12; k <= 12; k++) { c.moveTo(640 + k * 30, 548); c.lineTo(640 + k * 110, 684); } c.stroke();
    scn_spray(c, 640, 640, 260, ZP.pinkL, r, { a: .35, sx: 2.2, sy: .3, dots: 700 });
    for (const f of [[150, 612], [335, 600], [990, 606], [1190, 660], [895, 668]]) { const g = c.createRadialGradient(f[0], f[1], 4, f[0], f[1], 110); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(f[0], f[1], 120, 28, 0, 0, 6.283); c.fill(); }
    c.restore();
    c.strokeStyle = ZK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 548); c.lineTo(W, 548); c.stroke();
    c.fillStyle = ZP.limeL; c.fillRect(0, 684, W, 36); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, 688, W, 5);
    c.beginPath(); c.moveTo(0, 684); c.lineTo(W, 684); c.lineWidth = 3.5; c.stroke();
    for (let x = 40; x < W; x += 80) { c.beginPath(); c.arc(x, 703, 6, 0, 6.283); c.fillStyle = ZP.yel; c.fill(); c.lineWidth = 2; c.stroke(); }
    // speaker stacks at the wings
    for (const sx of [44, W - 44]) for (let k = 0; k < 3; k++) scn_doodle(c, 'speaker', sx, 500 - k * 92, 44, { lw: 3 });
    // beatbox / vocals / loops tag (poster quote)
    scn_spray(c, 112, 116, 84, ZP.lime, r, { hard: true, a: .85, sx: 1.08, sy: .95, drips: 4, dots: 700 });
    ['BEATBOX', 'VOCALS', 'LOOPS'].forEach((w, i) => scn_marker(c, w, 112 + i * 3, 88 + i * 27, 21, ZK, { rot: -.12 }));
    // LIVE ON TOUR caption
    scn_marker(c, 'LIVE ON', 1150, 112, 30, ZK, { rot: -.1 }); scn_marker(c, 'TOUR!', 1160, 148, 34, ZK, { rot: -.1 });
    c.save(); c.strokeStyle = ZP.pink; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(1090, 172); c.quadraticCurveTo(1160, 160, 1235, 150); c.stroke(); c.restore();
    // hand-placed doodles (poster composition)
    const D = (k, x, y, s, o) => scn_doodle(c, k, x, y, s, Object.assign({ lw: 3 }, o || {}));
    D('heart', 1080, 300, 26, { fill: ZP.pink, sticker: 4, rot: .2 }); D('heart', 1235, 260, 14, { rot: -.2 });
    D('star', 60, 248, 20, { fill: ZP.pinkL, sticker: 4, rot: -.2 }); D('star', 450, 270, 16, { fill: ZP.limeL, sticker: 3 });
    D('cat', 880, 270, 28, { fill: '#fff' }); D('note', 545, 268, 18, {}); D('note1', 760, 262, 16, { col: ZP.pinkD });
    D('sparkle', 230, 300, 14, { fill: ZP.limeL }); D('sparkle', 1240, 330, 12, {});
    D('dash', 430, 360, 16, { col: ZP.limeD, rot: -2.4, lw: 4 }); D('dash', 850, 360, 16, { col: ZP.pinkD, rot: -.7, lw: 4 });
    D('loop', 880, 470, 24, { col: ZP.limeD, lw: 4 }); D('smiley', 410, 470, 18, { fill: ZP.yel }); D('eq', 1235, 540, 18, {});
    D('swirl', 140, 330, 12, {}); D('plus', 900, 420, 8, {}); D('rays', 300, 300, 20, { col: ZP.limeD, rot: -.4, lw: 4 }); D('rays', 1010, 300, 20, { col: ZP.pinkD, rot: .3, lw: 4 });
  });
}
function scn_logo() {
  return scn_layer('logo2', 1000, 300, (c, w, h) => {
    scn_doodle(c, 'dash', 70, 120, 26, { col: ZP.pinkD, rot: -.4, lw: 6 });
    scn_doodle(c, 'dash', 930, 200, 24, { col: ZP.limeD, rot: Math.PI - .3, lw: 6 });
    scn_bubble(c, 'RUSTGRiFT', w / 2, h / 2 + 6, 168, ZP.lime, { maxW: 820, heartI: true, seed: 4 });
    scn_doodle(c, 'star', 912, 70, 34, { fill: ZP.limeL, sticker: 5, lw: 4.5, rot: .2 });
    scn_doodle(c, 'heart', 92, 222, 28, { fill: ZP.pink, sticker: 5, lw: 4.5, rot: -.25 });
    scn_doodle(c, 'sparkle', 140, 60, 16, { fill: '#fff', lw: 3 });
    scn_doodle(c, 'loop', 860, 250, 20, { col: ZP.pinkD, lw: 4.5 });
  });
}
function scn_tagline() {
  return scn_layer('tagline2', 600, 92, (c) => {
    scn_rrect(c, 28, 14, 544, 66, 26); c.fillStyle = 'rgba(21,16,28,.18)'; c.save(); c.translate(2, 5); c.fill(); c.restore();
    c.fillStyle = ZP.limeL; c.fill(); c.strokeStyle = ZK; c.lineWidth = 3.5; c.stroke();
    scn_rrect(c, 38, 22, 524, 50, 19); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.stroke();
    scn_marker(c, 'Fight dirty. Talk dirtier.', 300, 58, 31, ZK);
    c.strokeStyle = ZP.pink; c.lineWidth = 4.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(372, 66); c.quadraticCurveTo(430, 72, 502, 64); c.stroke();
    scn_doodle(c, 'rays', 26, 20, 16, { col: ZP.pinkD, rot: -.8, lw: 3.5 }); scn_doodle(c, 'rays', 576, 76, 16, { col: ZP.pinkD, rot: 2.3, lw: 3.5 });
    scn_doodle(c, 'star', 566, 18, 13, { fill: ZP.lime, sticker: 3, lw: 2.6 });
  });
}
MenuScene.prototype.draw = function (c) {
  const t = G.time;
  scn_blit(c, scn_menuBg(), 0, 0);
  // swaying stage lights
  [[ZP.pink, 150, -.42], [ZP.cyan, 640, 0], [ZP.lime, 1130, .42]].forEach(([col, x, a0], i) => scn_drawCone(c, col, x, -20, a0 * .6 + Math.sin(t * .55 + i * 2) * .22, 700, .5));
  // heroes + cute enemies posing on the stage
  SCN_MENU_FIG.forEach(f => { c.save(); c.translate(f.x, f.y); c.scale(f.s, Math.abs(f.s)); drawFigure(c, f.spec(), { t: t + f.ph, atk: 0, talk: 0 }); c.restore(); });
  // notes floating up from the mics
  for (let i = 0; i < 6; i++) { const p = (t * .35 + i / 6) % 1, src = i % 2 ? [990, 400] : [335, 395], x = src[0] + Math.sin(p * 6 + i) * 22 + (i % 2 ? -1 : 1) * p * 50, y = src[1] - p * 150; c.save(); c.globalAlpha = Math.sin(p * Math.PI); scn_blitC(c, scn_dsprite(i % 3 ? 'note1' : 'note', 11, { col: i % 2 ? ZP.pinkD : ZK, lw: 2.6 }), x, y, .8 + p * .4); c.restore(); }
  scn_twinkles(c, t, [[250, 210], [1040, 210], [560, 300], [720, 300], [120, 520], [1160, 520]], 9);
  scn_confetti(c, t, 22, 3, { speed: 45 });
  // logo with elastic entrance + gentle bob
  const k = ease.elastic(clamp(this.t * .9, 0, 1)), LG = scn_logo();
  c.save(); c.translate(W / 2, 140 + Math.sin(t * 1.6) * 3); c.rotate(-.03 + Math.sin(t * 1.1) * .008); c.scale(k, k); c.drawImage(LG.cv, -LG.w / 2, -LG.h / 2, LG.w, LG.h); c.restore();
  const tg = scn_tagline(); c.save(); c.translate(W / 2, 262); c.rotate(-.02); c.drawImage(tg.cv, -tg.w / 2, -50, tg.w, tg.h); c.restore();
  // ---- buttons (identical behaviour)
  const bx = W / 2 - 150;
  let y = 310;
  scn_btnBack(c, bx - 6, 304, 312, this.hasSave ? 260 : 190);
  if (this.hasSave) { if (UI.btn(bx, y, 300, 58, 'CONTINUE', { col: ZP.lime, size: 34 })) this.cont(); y += 70; }
  if (UI.btn(bx, y, 300, 58, 'NEW RUN', { col: ZP.pink, size: 34 })) go(() => setScene(new CharSelectScene())); y += 70;
  if (UI.btn(bx, y, 300, 52, 'CARD CODEX', { col: ZP.cyanD, size: 28 })) go(() => setScene(new CodexScene())); y += 62;
  if (UI.btn(bx, y, 145, 48, 'HOW TO', { col: '#9a78d8', size: 24 })) openHelp();
  if (UI.btn(bx + 155, y, 145, 48, 'OPTIONS', { col: ZP.orange, size: 24 })) { G.modal = new PauseModal(); G.modal.view = 'opt'; }
  scn_sticker(c, W / 2 - 220, 690, 440, 26, 13, '#fff', { pad: 3, lw: 2.4 });
  txt(c, `Runs: ${G.meta.runs}   Wins: ${G.meta.wins}   Best: Act ${G.meta.best || 0}`, W / 2, 710, { size: 18, font: FM, color: ZK, align: 'center' });
  txt(c, 'An original homage to deckbuilding roguelikes', W - 16, 676, { size: 13, color: ZK, align: 'right', alpha: .7 });
};

// ================================================================ CHARACTER SELECT
const SCN_HERO = {
  rook: { base: '#dcf5fb', a: ZP.cyan, b: ZP.lav, name: ZP.lime, motif: 'tie' },
  mourn: { base: '#fff3c4', a: ZP.yel, b: ZP.denim, name: ZP.yel, motif: 'smile' },
  pia: { base: '#ffe3ef', a: ZP.pinkL, b: ZP.pink, name: ZP.pink, motif: 'heart' },
  claw: { base: '#ece2ff', a: ZP.lav, b: '#a77bff', name: '#a77bff', motif: 'tie' }
};
function scn_heroCard(i, sel) {
  const ch = CHARS[i], th = SCN_HERO[ch.id] || SCN_HERO.rook;
  return scn_layer('hc2_' + i + (sel ? 's' : ''), 384, 544, (c) => {
    c.translate(12, 12); const pw = 360, ph = 520, r = scn_rng(90 + i);
    scn_sticker(c, 0, 0, pw, ph, 24, sel ? scn_mix(th.base, '#ffffff', .25) : th.base, { pad: 8, lw: 4.5 });
    c.save(); scn_rrect(c, 0, 0, pw, ph, 24); c.clip();
    if (th.motif === 'tie') for (let k = 0; k < 14; k++) scn_spray(c, r() * pw, r() * ph, 40 + r() * 40, k % 2 ? th.a : th.b, r, { a: .28, dots: 120 });
    else for (let k = 0; k < 22; k++) scn_doodle(c, th.motif === 'smile' ? 'smiley' : 'heart', 14 + r() * (pw - 28), 290 + r() * 230, 7 + r() * 5, { col: scn_rgba(th.motif === 'smile' ? ZP.denim : ZP.pink, .22), lw: 1.8, rot: (r() - .5) * .8 });
    c.restore();
    const wx = 24, wy = 24, ww = pw - 48, wh = 256;
    c.save(); scn_rrect(c, wx, wy, ww, wh, 16); c.clip();
    let g = c.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, '#fffdf7'); g.addColorStop(1, scn_mix(th.a, '#ffffff', .55)); c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
    scn_spray(c, wx + 80, wy + 90, 110, th.a, r, { a: .6 }); scn_spray(c, wx + ww - 70, wy + 120, 100, th.b, r, { a: .45 }); scn_spray(c, wx + ww / 2, wy + 60, 70, ZP.limeL, r, { a: .4 });
    g = c.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, 'rgba(255,255,255,.65)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(pw / 2 - 24, wy); c.lineTo(pw / 2 + 24, wy); c.lineTo(pw / 2 + 120, wy + wh); c.lineTo(pw / 2 - 120, wy + wh); c.fill();
    scn_scatter(c, r, 9, wx + 6, wy + 6, ww - 12, 150, [[pw / 2 - 80, wy, 160, wh]], { smax: 13 });
    c.fillStyle = scn_rgba(th.b, .35); c.beginPath(); c.ellipse(pw / 2, 266, 98, 17, 0, 0, 6.283); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke();
    c.restore();
    c.strokeStyle = ZK; c.lineWidth = 3.5; scn_rrect(c, wx, wy, ww, wh, 16); c.stroke();
    c.beginPath(); c.arc(wx + 24, wy + 24, 17, 0, 6.283); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(wx + 24, wy + 24, 14, 0, 6.283); c.fillStyle = ZP.yel; c.fill(); c.lineWidth = 2.5; c.stroke();
    txt(c, String(i + 1), wx + 24, wy + 25, { size: 20, font: FD, weight: 800, color: ZK, align: 'center', base: 'middle' });
    scn_bubble(c, ch.name.toUpperCase(), pw / 2, 300, 50, th.name, { maxW: 290, seed: i + 1 });
    scn_marker(c, ch.title, pw / 2, 346, 21, ZK);
    c.font = `17px ${FB}`; wrapLines(c, ch.desc, pw - 50).forEach((l, k) => txt(c, l, pw / 2, 367 + k * 18, { size: 17, align: 'center', color: '#2a2234' }));
    const pill = (x, y, w2, col, ic, label, frac) => {
      scn_sticker(c, x, y, w2, 34, 17, col, { pad: 3, lw: 2.6 });
      c.fillStyle = 'rgba(21,16,28,.25)'; scn_rrect(c, x + 36, y + 24, w2 - 48, 5, 2.5); c.fill(); c.fillStyle = '#fff'; scn_rrect(c, x + 36, y + 24, (w2 - 48) * clamp(frac, 0, 1), 5, 2.5); c.fill();
      icon(c, ic, x + 18, y + 17, 11); txt(c, label, x + 38, y + 21, { size: 19, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 4 });
    };
    pill(22, 438, 152, ZP.pink, 'heart', `${ch.hp} HP`, ch.hp / 90);
    pill(186, 438, 152, ZP.cyanD, 'mouth', `${ch.nres} Resolve`, ch.nres / 50);
    const gr = GRAFTS[ch.graft];
    scn_rrect(c, 22, 482, pw - 44, 28, 14); c.fillStyle = scn_rgba(ZP.lav, .35); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2; c.stroke();
    const gs = gr.name + ': ' + gr.desc; c.font = `15px ${FB}`; const gsz = Math.min(15, 15 * (pw - 92) / c.measureText(gs).width);
    icon(c, gr.icon, 40, 496, 11); txt(c, gs, 58, 501, { size: gsz, color: ZK });
    if (sel) { scn_doodle(c, 'star', pw - 10, ph - 14, 18, { fill: ZP.yel, sticker: 4, lw: 3 }); scn_doodle(c, 'heart', 10, ph - 20, 14, { fill: ZP.pink, sticker: 4, lw: 3 }); }
  });
}
function scn_csBg() {
  return scn_zineBg('cs_bg', 606, {
    splats: [[200, 120, 220, ZP.pinkL], [1080, 110, 220, ZP.limeL], [640, 380, 330, ZP.sky, { a: .3 }], [120, 600, 200, ZP.lav], [1180, 620, 200, ZP.pinkL], [640, 700, 260, ZP.limeL, { a: .45 }]],
    doodles: 44, avoid: [[50, 90, 1180, 548], [300, 20, 680, 80]], dopt: { smax: 22 }
  });
}
CharSelectScene.prototype.draw = function (c) {
  const t = G.time;
  scn_blit(c, scn_csBg(), 0, 0);
  const L4 = RGHeroCards(CHARS.length);
  CHARS.forEach((ch, i) => { const q = L4[i], cx = q.cx, sel = this.sel === i, hov = UI.hit(q.x, q.y, q.w, q.h); if (sel || hov) scn_drawCone(c, [ZP.cyan, ZP.yel, ZP.pink, ZP.lav][i % 4], cx, -30, 0, 760, sel ? .55 : .25); });
  const TL = scn_bubbleLayer('CHOOSE YOUR HUSTLER', 58, ZP.lime, { seed: 7 }); c.save(); c.translate(W / 2, 56); c.rotate(-.012); scn_blitC(c, TL, 0, 0, 1); c.restore();
  CHARS.forEach((ch, i) => {
    const q = L4[i], px = q.x, py = q.y, pw = 360, ph = 520;
    const hov = UI.hit(q.x, q.y, q.w, q.h), sel = this.sel === i;
    c.save(); c.translate(px + q.w / 2, py + q.h / 2); const s = (sel ? 1.03 : hov ? 1.015 : 1) * q.k; c.scale(s, s); c.rotate((i - 1) * .012 * (sel ? 0 : 1)); c.translate(-pw / 2, -ph / 2);
    const L = scn_heroCard(i, sel); c.drawImage(L.cv, -12, -12, L.w, L.h);
    c.save(); c.translate(pw / 2, 268); c.scale(.86, .86); drawFigure(c, ch.spec, { t: G.time + i, atk: sel ? (Math.sin(G.time * 2) > .96 ? .5 : 0) : 0, talk: 0 }); c.restore();
    if (sel) {
      c.save(); c.setLineDash([16, 10]); c.lineDashOffset = -t * 30; c.lineCap = 'round'; c.strokeStyle = ZP.lime; c.lineWidth = 5; scn_rrect(c, -14, -14, pw + 28, ph + 28, 34); c.stroke(); c.restore();
      c.save(); c.translate(pw - 58, 44); c.rotate(.2 + Math.sin(t * 3) * .04); scn_sticker(c, -54, -18, 108, 36, 18, ZP.pink, { pad: 4, lw: 3 }); txt(c, 'CHOSEN!', 0, 1, { size: 22, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 4, align: 'center', base: 'middle' }); c.restore();
      for (let k = 0; k < 5; k++) { const p = (t * .4 + k / 5) % 1; c.save(); c.globalAlpha = Math.sin(p * Math.PI); scn_blitC(c, scn_dsprite(k % 2 ? 'heart' : 'note1', 9, k % 2 ? { fill: ZP.pinkL, lw: 2, shine: false } : { lw: 2.4 }), pw / 2 + Math.sin(k * 2.3 + p * 4) * 120, 250 - p * 200, 1); c.restore(); }
    } else if (!hov) { c.fillStyle = 'rgba(251,247,234,.18)'; scn_rrect(c, 0, 0, pw, ph, 24); c.fill(); }
    c.restore();
    if (hov && In.click) { In.click = null; Snd.play('click'); this.sel = i; }
  });
  scn_btnBack(c, W / 2 - 150, 640, 300, 60); scn_btnBack(c, 30, 650, 130, 46);
  if (UI.btn(W / 2 - 150, 640, 300, 60, 'START RUN', { col: ZP.pink, size: 38 })) {
    G.run = newRun(CHARS[this.sel].id); G.meta.runs++; saveMeta(); saveRun();
    go(() => setScene(makeMapScene({ intro: true })));
  }
  if (UI.btn(30, 650, 130, 46, 'BACK', { col: '#9a78d8', size: 24 })) go(() => setScene(new MenuScene()));
};

// ================================================================ REWARD / LOOT
const SCN_RARITY = { common: ZP.yel, uncommon: ZP.cyan, rare: ZP.pink, starter: ZP.yel, curse: ZP.lav };
function scn_coin(c, x, y, r, tilt = .45) {
  c.lineWidth = 1.8; c.strokeStyle = ZK;
  c.fillStyle = '#e09a12'; c.beginPath(); c.ellipse(x, y + r * .18, r, r * tilt, 0, 0, 6.3); c.fill(); c.stroke();
  c.fillStyle = ZP.yel; c.beginPath(); c.ellipse(x, y, r, r * tilt, 0, 0, 6.3); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(x - r * .15, y - r * tilt * .2, r * .5, r * tilt * .45, 0, 3.4, 4.6); c.stroke();
}
function scn_coinPile() {
  return scn_layer('coinpile2', 200, 130, (c) => {
    const r = scn_rng(8);
    c.fillStyle = 'rgba(21,16,28,.15)'; c.beginPath(); c.ellipse(100, 110, 90, 12, 0, 0, 6.3); c.fill();
    for (let row = 0; row < 6; row++) { const n = 9 - row, w = 150 - row * 22; for (let i = 0; i < n; i++) scn_coin(c, 100 - w / 2 + (i + .5) * w / n + (r() - .5) * 6, 104 - row * 11 + (r() - .5) * 4, 11 + r() * 3); }
    for (let k = 0; k < 6; k++) scn_coin(c, 168, 106 - k * 7, 12, .4);
    for (let k = 0; k < 4; k++) scn_coin(c, 32, 106 - k * 7, 11, .4);
    scn_doodle(c, 'sparkle', 150, 30, 10, { fill: '#fff', lw: 2 }); scn_doodle(c, 'heart', 30, 40, 10, { fill: ZP.pink, lw: 2 });
  });
}
function scn_rewardBg() {
  return scn_zineBg('rew_bg2', 515, {
    splats: [[640, 110, 300, ZP.pinkL, { a: .5 }], [150, 250, 180, ZP.limeL], [1120, 260, 200, ZP.lav], [320, 640, 220, ZP.sky, { a: .35 }], [980, 640, 220, ZP.limeL, { a: .45 }]],
    extra: (c) => { c.save(); c.translate(W / 2, 120); for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283, d = Math.PI / 28; c.fillStyle = i % 2 ? scn_rgba(ZP.yel, .22) : scn_rgba(ZP.pinkL, .2); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a - d) * 900, Math.sin(a - d) * 900); c.lineTo(Math.cos(a + d) * 900, Math.sin(a + d) * 900); c.closePath(); c.fill(); } c.restore(); },
    doodles: 30, avoid: [[60, 60, 1160, 590]], dopt: { smax: 18 }
  });
}
function scn_graftCase(id) {
  const g = GRAFTS[id];
  return scn_layer('gcase2_' + id, 200, 260, (c) => {
    c.translate(100, 130);
    scn_sticker(c, -85, -115, 170, 230, 18, '#ebe2fb', { pad: 6, band: ZP.cyan, bandW: 4 });
    c.save(); scn_rrect(c, -85, -115, 170, 230, 18); c.clip(); const r = scn_rng(id.length * 13); scn_spray(c, 0, -32, 70, ZP.cyan, r, { a: .35, dots: 300 }); c.restore();
    scn_sticker(c, -48, -108, 96, 26, 13, ZP.cyanD, { pad: 3, lw: 2.4 }); txt(c, 'GRAFT', 0, -94, { size: 20, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 4, align: 'center', base: 'middle' });
    c.beginPath(); c.arc(0, -32, 42, 0, 6.283); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(0, -32, 37, 0, 6.283); c.fillStyle = ZP.sky; c.fill(); c.strokeStyle = ZK; c.lineWidth = 3.5; c.stroke();
    icon(c, g.icon, 0, -32, 25);
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-14, -54, 14, 6, -.5, 0, 6.283); c.fill();
    txt(c, g.name, 0, 30, { size: 22, font: FD, weight: 800, color: ZP.pinkD, align: 'center', base: 'middle' });
    c.font = `16px ${FB}`; wrapLines(c, g.desc, 140).forEach((l, i) => txt(c, l, 0, 60 + i * 18, { size: 16, align: 'center', color: ZK }));
    scn_doodle(c, 'sparkle', 70, -100, 10, { fill: '#fff', lw: 2 });
  });
}
RewardScene.prototype.draw = function (c) {
  const run = G.run, r = this.r, t = G.time;
  scn_blit(c, scn_rewardBg(), 0, 0);
  const TL = scn_bubbleLayer(r.chest ? 'HIDDEN CACHE' : r.talk ? 'SMOOTH TALKER!' : 'SPOILS OF WAR', 76, ZP.lime, { seed: 9 });
  c.save(); c.translate(W / 2, 110 + Math.sin(t * 1.5) * 2); c.rotate(-.015); scn_blitC(c, TL, 0, 0, 1); c.restore();
  const pile = scn_coinPile(), pxl = W / 2 - 360, pyl = 146; scn_blit(c, pile, pxl, pyl);
  for (let k = 0; k < 4; k++) { const ph = (t * .7 + k * .37) % 1; c.save(); c.globalAlpha = Math.sin(ph * Math.PI); scn_blitC(c, scn_dsprite('sparkle', 8, { fill: '#fff', lw: 2 }), pxl + 35 + ((k * 53) % 130), pyl + 30 + ((k * 31) % 50), 1); c.restore(); }
  if (this.goldShown < r.gold && this.t > .4) for (let k = 0; k < 4; k++) { const ph = (t * 2.2 + k / 4) % 1, x = lerp(pxl + 100, W / 2 - 100, ph), y = lerp(pyl + 50, 190, ph) - Math.sin(ph * Math.PI) * 70; scn_coin(c, x, y, 9, .45 + Math.sin(t * 20 + k) * .4); }
  scn_sticker(c, W / 2 - 128, 166, 296, 48, 24, '#fff', { pad: 5, band: ZP.yel, bandW: 4 });
  icon(c, 'coin', W / 2 - 98, 190, 24); scn_bubbleLive(c, `+${this.goldShown} shil`, W / 2 + 26, 190, 38, ZP.orange);
  if (r.cards.length) {
    scn_marker(c, this.picked ? 'Added to your deck!' : `Choose a ${r.kind === 'b' ? 'BATTLE' : 'TALK'} card`, W / 2, 262, 26, ZK);
    const n = r.cards.length, x0 = W / 2 - (n - 1) * 110 - (r.graft ? 130 : 0);
    r.cards.forEach((id, i) => {
      const x = x0 + i * 220, base = 470, ap = ease.out(clamp((this.t - .6 - i * .15) * 3, 0, 1));
      const y = base + (1 - ap) * 400;
      const hov = !this.picked && UI.hit(x - 90, y - 125, 180, 250);
      if (this.pickAnim && this.pickAnim.i === i) { const k = clamp((this.t - this.pickAnim.t0) * 2.5, 0, 1); c.save(); c.globalAlpha = 1 - k; c.translate(x, y - k * 150); c.rotate(k * 2); scn_blitC(c, scn_dsprite('sparkle', 60, { fill: ZP.yel, lw: 5 }), 0, 0, 1 + k * 1.5); c.restore(); drawCard(c, cd({ id, up: false }), x, y - k * 150, 0, 1.35 + k * .1, { alpha: 1 - k, glow: C.mustard }); return; }
      if (this.picked) return;
      const d = BC[id] || NC[id], col = SCN_RARITY[d && d.rarity] || SCN_RARITY.common, rare = d && d.rarity === 'rare';
      if (ap > .05) { // sticker burst halo behind the card
        c.save(); c.globalAlpha = ap * (hov ? 1 : .8); c.translate(x, y); c.rotate(t * (rare ? .5 : .25) * (i % 2 ? -1 : 1));
        c.fillStyle = scn_rgba(col, .55); scn_star(c, hov ? 175 : 160, hov ? 135 : 122, 14); c.fill(); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke(); c.restore();
      }
      const tl = this.t - .6 - i * .15 - .34;
      if (tl > 0 && tl < .5) { for (let k = 0; k < 6; k++) { c.save(); c.globalAlpha = 1 - tl / .5; scn_blitC(c, scn_dsprite(k % 2 ? 'star' : 'heart', 9, { fill: SCN_CONF[k], lw: 2 }), x + Math.cos(k * 1.05) * (100 + tl * 160), y + Math.sin(k * 1.05) * (130 + tl * 180), 1); c.restore(); } }
      drawCard(c, cd({ id, up: false }), x, y - (hov ? 16 : 0), hov ? 0 : (i - 1) * .03, hov ? 1.4 : 1.3, { glow: hov ? C.mustard : null });
      if (rare && ap >= 1) { c.save(); c.globalAlpha = .5 + .5 * Math.sin(t * 6 + i); scn_blitC(c, scn_dsprite('sparkle', 10, { fill: '#fff', lw: 2 }), x + 60 * Math.cos(t * 2 + i), y - 90 + 20 * Math.sin(t * 3 + i), 1); c.restore(); }
      if (hov) { UI.cursor = 'pointer'; if (In.click) { In.click = null; this.take(i, id); } }
    });
    if (!this.picked) { scn_btnBack(c, 60, 640, 140, 46); if (UI.btn(60, 640, 140, 46, 'SKIP CARD', { col: '#9a78d8', size: 24 })) { this.picked = true; Snd.play('click'); } }
  }
  if (r.graft) {
    const gx = r.cards.length ? W - 190 : W / 2, gy = r.cards.length ? 430 : 400, g = GRAFTS[r.graft];
    const hov = !this.gotGraft && UI.hit(gx - 90, gy - 120, 180, 240);
    if (!this.gotGraft) { c.save(); c.translate(gx, gy); c.rotate(-t * .3); c.fillStyle = scn_rgba(ZP.cyan, .35); scn_star(c, 150 + Math.sin(t * 3) * 8, 118, 12); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke(); c.restore(); for (let k = 0; k < 5; k++) { const ph = (t * .5 + k * .2) % 1; c.save(); c.globalAlpha = Math.sin(ph * Math.PI); scn_blitC(c, scn_dsprite('sparkle', 8, { fill: ZP.cyan, lw: 2 }), gx + Math.cos(k * 1.3 + t * .3) * 105, gy - 60 + Math.sin(k * 2.1) * 120 - ph * 30, 1); c.restore(); } }
    c.save(); c.translate(gx, gy + Math.sin(G.time * 2) * 5); const s = hov ? 1.08 : 1; c.scale(s, s); c.rotate(.03);
    c.globalAlpha = this.gotGraft ? .35 : 1;
    const L = scn_graftCase(r.graft); c.drawImage(L.cv, -100, -130, L.w, L.h);
    c.restore();
    if (hov) { UI.cursor = 'pointer'; if (In.click) { In.click = null; this.gotGraft = true; addGraft(run, r.graft); Snd.play('buff'); burst(gx, gy, 40, { col: [C.teal, C.mustard, C.cream], shape: 'star', min: 100, max: 400, up: 100 }); shake(6, .2); toast(g.name + ' attached!'); } }
  }
  if (this.t > 1) { scn_btnBack(c, W / 2 - 130, 650, 260, 56); if (UI.btn(W / 2 - 130, 650, 260, 56, this.picked && this.gotGraft ? 'CONTINUE' : 'SKIP ALL & GO', { col: this.picked && this.gotGraft ? ZP.lime : ZP.orange, size: 30 })) this.next(); }
  drawHUD(c, run);
};

// ================================================================ SHOP (pastel merch stall / record shop)
function scn_shopStatic() {
  return scn_layer('shop_static2', W, H, (c) => {
    const r = scn_rng(31);
    scn_paper(c, 0, 0, W, H, 31, '#fff0f5');
    [[160, 250, 220, ZP.pinkL], [600, 230, 200, ZP.limeL], [1100, 220, 220, ZP.sky], [400, 560, 260, ZP.lav], [1000, 560, 240, ZP.pinkL]].forEach(s => scn_spray(c, s[0], s[1], s[2], s[3], r, { a: .4 }));
    // merch board
    scn_sticker(c, 50, 190, 720, 500, 18, '#fffaf0', { pad: 6, lw: 4 });
    c.fillStyle = scn_rgba(ZP.lav, .45); for (let y = 210; y < 680; y += 22) for (let x = 66; x < 760; x += 22) { c.beginPath(); c.arc(x, y, 2.2, 0, 6.3); c.fill(); }
    scn_tape(c, 70, 194, 70, 20, -.3, ZP.limeL); scn_tape(c, 752, 196, 70, 20, .3, ZP.pinkL);
    // shelves
    for (const sy of [420, 658]) { scn_box(c, 44, sy, 732, 16, ZP.lime, 6, 3); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(52, sy + 3, 716, 3); for (const bx of [120, 400, 690]) { c.beginPath(); c.moveTo(bx, sy + 16); c.lineTo(bx + 18, sy + 16); c.lineTo(bx, sy + 36); c.closePath(); c.fillStyle = ZP.pink; c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.2; c.stroke(); } }
    // graft counter (merch table)
    scn_box(c, 742, 618, 336, 22, ZP.pink, 8, 3); scn_box(c, 752, 640, 316, 82, ZP.pinkL, 4, 3);
    [[800, 680, ZP.lime], [880, 684, ZP.cyan], [1020, 680, ZP.yel]].forEach(v => scn_doodle(c, 'vinyl', v[0], v[1], 22, { label: v[2], lw: 2.5 }));
    scn_marker(c, 'MERCH', 952, 692, 22, ZK, { rot: -.05 });
    // keeper's record counter
    scn_box(c, 1078, 380, 202, 18, ZP.cyanD, 8, 3); scn_box(c, 1086, 398, 194, 240, ZP.sky, 4, 3);
    c.strokeStyle = 'rgba(21,16,28,.25)'; c.lineWidth = 2; for (let x = 1110; x < 1270; x += 34) { c.beginPath(); c.moveTo(x, 404); c.lineTo(x, 630); c.stroke(); }
    c.save(); c.translate(1182, 520); c.rotate(-.06); scn_sticker(c, -72, -42, 144, 84, 14, '#fff', { pad: 5, band: ZP.yel, bandW: 4 }); scn_marker(c, 'NO', 0, -6, 26, ZP.pinkD); scn_marker(c, 'REFUNDS!', 0, 24, 24, ZK); c.restore();
    // wall decor: mini gig poster + records
    c.save(); c.translate(865, 345); c.rotate(-.05); scn_sticker(c, -52, -44, 104, 88, 6, ZP.cream, { pad: 4, lw: 2.5 }); scn_spray(c, 0, -6, 34, ZP.pinkL, r, { a: .7, dots: 120 }); scn_marker(c, 'ROXOR', 0, -12, 16, ZP.limeD); scn_marker(c, '& JASMIN', 0, 8, 14, ZP.pinkD); scn_marker(c, 'LIVE!', 0, 32, 15, ZK); c.restore();
    scn_tape(c, 860, 300, 44, 14, .1, ZP.limeL);
    scn_doodle(c, 'vinyl', 975, 335, 30, { label: ZP.pink, lw: 3 }); scn_doodle(c, 'vinyl', 1040, 360, 22, { label: ZP.lime, lw: 2.5 });
    scn_doodle(c, 'cassette', 1225, 300, 22, { lw: 2.5, rot: .2 });
    // section tags
    const tag = (x, y, w2, label, col) => { scn_sticker(c, x, y, w2, 28, 14, col, { pad: 3, lw: 2.6 }); scn_marker(c, label, x + w2 / 2, y + 21, 18, ZK); };
    tag(100, 182, 104, 'BATTLE', ZP.pinkL); tag(42, 422, 80, 'TALK', ZP.sky); tag(890, 408, 106, 'GRAFTS', ZP.lav);
    scn_scatter(c, r, 12, 790, 140, 480, 200, [[790, 200, 300, 90], [1080, 160, 200, 230], [800, 290, 130, 110]], { smax: 13 });
  });
}
function scn_awning() {
  return scn_layer('shop_awning2', W, 160, (c) => {
    scn_box(c, -10, 50, W + 20, 16, ZP.lime, 6, 3);
    for (let i = 0; i < 14; i++) {
      const x0 = i * 96 - 10, col = i % 2 ? ZP.pink : '#fff';
      c.beginPath(); c.moveTo(x0, 64); c.lineTo(x0 + 96, 64); c.lineTo(x0 + 96, 110);
      for (let k = 2; k >= 0; k--) { const cx = x0 + k * 32 + 16; c.arc(cx, 110, 16, 0, Math.PI); }
      c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = ZK; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(x0 + 8, 70, 10, 30);
    }
    c.fillStyle = 'rgba(21,16,28,.12)'; c.fillRect(0, 128, W, 10);
  });
}
function scn_shopSign() {
  return scn_layer('shop_sign2', 620, 130, (c) => {
    c.strokeStyle = ZK; c.lineWidth = 3; for (const x of [130, 490]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 32); c.stroke(); }
    scn_sticker(c, 50, 30, 520, 86, 30, '#fff', { pad: 6, band: ZP.limeL, bandW: 6 });
    scn_bubble(c, 'THE GRIFT MARKET', 310, 73, 48, ZP.pink, { maxW: 460, seed: 3 });
    scn_doodle(c, 'star', 560, 34, 15, { fill: ZP.yel, sticker: 3, lw: 3 }); scn_doodle(c, 'heart', 58, 110, 13, { fill: ZP.lime, sticker: 3, lw: 3 });
  });
}
function scn_priceTag(c, x, y, price, afford, sy) {
  c.save(); c.strokeStyle = ZK; c.lineWidth = 1.6; if (sy != null) { c.beginPath(); c.moveTo(x - 24, sy); c.lineTo(x - 30, y + 6); c.stroke(); }
  c.translate(x, y); c.rotate(-.05);
  c.beginPath(); c.moveTo(-34, 0); c.lineTo(40, 0); c.lineTo(40, 28); c.lineTo(-34, 28); c.lineTo(-46, 14); c.closePath();
  c.fillStyle = 'rgba(21,16,28,.18)'; c.save(); c.translate(2, 3); c.fill(); c.restore();
  c.save(); c.strokeStyle = '#fff'; c.lineWidth = 8; c.lineJoin = 'round'; c.stroke(); c.restore();
  c.fillStyle = afford ? ZP.yel : '#d9d4de'; c.fill(); c.lineWidth = 2.4; c.lineJoin = 'round'; c.strokeStyle = ZK; c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(-34, 14, 3.2, 0, 6.3); c.fill(); c.lineWidth = 1.4; c.stroke();
  icon(c, 'coin', -15, 14, 9); txt(c, String(price), 6, 23, { size: 21, font: FD, weight: 800, color: afford ? ZK : '#8a5a6a' });
  c.restore();
}
function scn_graftDisplay(id) {
  const g = GRAFTS[id];
  return scn_layer('gshop2_' + id, 140, 170, (c) => {
    c.translate(70, 95);
    scn_sticker(c, -62, -90, 124, 150, 14, '#ece3fb', { pad: 4, lw: 3 });
    c.beginPath(); c.arc(0, -48, 27, 0, 6.283); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(0, -48, 23, 0, 6.283); c.fillStyle = ZP.sky; c.fill(); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke();
    icon(c, g.icon, 0, -48, 16);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-9, -62, 9, 4, -.5, 0, 6.283); c.fill();
    txt(c, g.name, 0, -4, { size: 17, font: FD, weight: 800, color: ZP.pinkD, align: 'center', base: 'middle' });
    c.font = `14px ${FB}`; wrapLines(c, g.desc, 108).forEach((l, k) => txt(c, l, 0, 16 + k * 15, { size: 14, align: 'center', color: ZK }));
  });
}
ShopScene.prototype.draw = function (c) {
  const run = G.run, t = G.time;
  scn_blit(c, scn_shopStatic(), 0, 0);
  scn_blit(c, scn_awning(), 0, 0);
  // fairy lights under the awning
  c.save(); c.strokeStyle = ZK; c.lineWidth = 1.6; c.beginPath(); for (let s = 0; s < 4; s++) { const x0 = s * 330 - 10, x1 = x0 + 330; c.moveTo(x0, 128); c.quadraticCurveTo((x0 + x1) / 2, 168, x1, 128); } c.stroke();
  for (let i = 0; i < 40; i++) { const s = Math.floor(i / 10), tt = (i % 10 + .5) / 10, x0 = s * 330 - 10, x = lerp(x0, x0 + 330, tt), y = 128 + 2 * tt * (1 - tt) * 40 + 6, on = .55 + .45 * Math.sin(t * 4 + i * 1.3); c.globalAlpha = .6 + on * .4; c.fillStyle = SCN_CONF[i % 6]; c.beginPath(); c.ellipse(x, y, 4, 5.5, 0, 0, 6.283); c.fill(); c.globalAlpha = 1; c.lineWidth = 1.2; c.stroke(); }
  c.restore();
  const sg = scn_shopSign(); c.save(); c.translate(W / 2, 104); c.rotate(Math.sin(t * 1.1) * .012); c.drawImage(sg.cv, -sg.w / 2, -24, sg.w, sg.h); c.restore();
  const item = (it, x, y, kind, shelfY) => {
    if (it.sold) { return; }
    const d = cd({ id: it.id }); const afford = run.money >= it.price;
    const hov = UI.hit(x - 78, y - 108, 156, 216);
    if (hov && afford) { c.save(); c.translate(x, y); c.rotate(t * .4); c.fillStyle = scn_rgba(ZP.yel, .5); scn_star(c, 128, 100, 12); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke(); c.restore(); }
    drawCard(c, d, x, y - (hov ? 8 : 0), 0, hov ? 1.0 : 0.93, { glow: hov && afford ? C.mustard : null, dim: !afford });
    scn_priceTag(c, x + 4, y + 114, it.price, afford, shelfY);
    if (hov && In.click) { In.click = null; if (!afford) { Snd.play('error'); toast('Not enough shil'); } else { run.money -= it.price; it.sold = true; (kind === 'b' ? run.deck : run.ndeck).push({ id: it.id, up: false }); Snd.play('coin'); burst(x, y, 20, { col: [C.mustard, C.cream], shape: 'star' }); } }
  };
  this.bcards.forEach((it, i) => item(it, 160 + i * 175, 318, 'b', 428));
  this.ncards.forEach((it, i) => item(it, 160 + i * 175, 556, 'n', 666));
  this.grafts.forEach((it, i) => {
    if (it.sold) return; const x = 830 + i * 150, y = 540, g = GRAFTS[it.id], afford = run.money >= it.price; const hov = UI.hit(x - 62, y - 90, 124, 180);
    if (hov) { c.save(); c.translate(x, y - 20); c.rotate(-t * .4); c.fillStyle = scn_rgba(ZP.cyan, .45); scn_star(c, 100, 80, 10); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke(); c.restore(); }
    c.save(); c.translate(x, y - (hov ? 6 : 0)); c.rotate((i ? 1 : -1) * .025); const L = scn_graftDisplay(it.id); c.drawImage(L.cv, -70, -95, L.w, L.h);
    scn_priceTag(c, 2, 66, it.price, afford);
    c.restore();
    if (hov && In.click) { In.click = null; if (!afford) { Snd.play('error'); toast('Not enough shil'); } else { run.money -= it.price; it.sold = true; addGraft(run, it.id); Snd.play('buff'); burst(x, y, 30, { col: [C.teal, C.cream, C.mustard], shape: 'star' }); toast(g.name + ' installed!'); } }
  });
  const aff = run.money >= this.removeCost;
  scn_btnBack(c, 800, 215, 270, 60);
  if (UI.btn(800, 215, 270, 60, `REMOVE CARD (${this.removeCost})`, { col: aff ? '#9a78d8' : C.grey, size: 24 })) {
    if (!aff) { Snd.play('error'); toast('Not enough shil'); } else openDeckView('Remove a Card', { b: run.deck, n: run.ndeck }, { pick: (inst, tab) => { run.money -= this.removeCost; run.removed = (run.removed || 0) + 1; this.removeCost += 25; const l = tab === 'b' ? run.deck : run.ndeck; const k = l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) l.splice(k, 1); Snd.play('stamp'); burst(W / 2, 360, 40, { col: [C.orange, C.ink], up: 100 }); toast('Card removed.'); }, hint: 'Choose a card to remove forever.' });
  }
  c.save(); c.translate(1170, 380); c.scale(.85, .85); c.scale(-1, 1); drawFigure(c, this.shopkeeper, { t: G.time, atk: 0, talk: 0 }); c.restore();
  if (UI.hit(1100, 170, 140, 210)) tip('Shopkeeper', this.line);
  scn_btnBack(c, 1080, 640, 170, 52);
  if (UI.btn(1080, 640, 170, 52, 'LEAVE', { col: ZP.pink, size: 32 })) go(() => setScene(makeMapScene()));
  drawHUD(c, run);
};

// ================================================================ EVENT (zine diary page)
function scn_eventPage() {
  return scn_layer('ev_page2', W, H, (c) => {
    const r = scn_rng(4242);
    scn_paper(c, 0, 0, W, H, 4242, '#f4eefb');
    [[120, 160, 200, ZP.pinkL], [1160, 160, 200, ZP.limeL], [110, 600, 200, ZP.sky], [1170, 600, 200, ZP.lav], [640, 690, 300, ZP.pinkL, { a: .35 }]].forEach(s => scn_spray(c, s[0], s[1], s[2], s[3], r, Object.assign({ a: .5 }, s[4] || {})));
    scn_scatter(c, r, 26, 10, 70, W - 20, H - 80, [[180, 80, 920, 580], [60, 560, 120, 120], [1100, 540, 140, 130]], { smax: 20 });
    scn_doodle(c, 'cassette', 110, 616, 40, { lw: 3.5, rot: -.15, sticker: 4 });
    scn_doodle(c, 'cat', 1170, 600, 40, { fill: '#fff', lw: 3.5, sticker: 4 });
    // notebook page
    scn_sticker(c, 200, 100, 880, 540, 18, '#fffdf6', { pad: 7, lw: 4 });
    c.save(); scn_rrect(c, 200, 100, 880, 540, 18); c.clip();
    c.strokeStyle = scn_rgba(ZP.sky, .55); c.lineWidth = 1.4; for (let y = 306; y < 636; y += 36) { c.beginPath(); c.moveTo(200, y); c.lineTo(1080, y); c.stroke(); }
    c.strokeStyle = scn_rgba(ZP.pink, .7); c.lineWidth = 2; c.beginPath(); c.moveTo(238, 210); c.lineTo(238, 640); c.stroke();
    // header strip: spray wash + doodles
    scn_spray(c, 420, 158, 120, ZP.pinkL, r, { a: .6, sx: 1.6, sy: .5 }); scn_spray(c, 860, 158, 120, ZP.limeL, r, { a: .6, sx: 1.6, sy: .5 });
    c.restore();
    for (let y = 130; y < 620; y += 62) { c.beginPath(); c.arc(218, y, 6, 0, 6.283); c.fillStyle = '#f4eefb'; c.fill(); c.strokeStyle = 'rgba(21,16,28,.4)'; c.lineWidth = 1.5; c.stroke(); }
    scn_marker(c, 'dear diary...', 330, 150, 24, ZK, { rot: -.06 });
    scn_marker(c, 'tour day #?', 960, 146, 20, ZP.pinkD, { rot: .05 });
    [['star', 520, 132, 12, ZP.yel], ['heart', 760, 182, 11, ZP.pinkL], ['note', 820, 130, 12, null], ['sparkle', 470, 186, 10, null], ['dash', 1010, 184, 12, null], ['loop', 300, 190, 13, null]].forEach(d => scn_doodle(c, d[0], d[1], d[2], d[3], { fill: d[4], lw: 2.6, col: d[4] ? ZK : ZK }));
    c.strokeStyle = ZK; c.lineWidth = 2.5; c.setLineDash([2, 8]); c.lineCap = 'round'; c.beginPath(); c.moveTo(250, 208); c.lineTo(1050, 208); c.stroke(); c.setLineDash([]);
    scn_tape(c, 240, 102, 90, 24, -.35, ZP.pinkL); scn_tape(c, 1042, 104, 90, 24, .35, ZP.limeL); scn_tape(c, 1050, 634, 80, 22, -.4, ZP.sky);
    scn_doodle(c, 'heart', 1050, 600, 14, { fill: ZP.pink, sticker: 3, lw: 2.6 }); scn_doodle(c, 'star', 1020, 616, 10, { fill: ZP.yel, lw: 2 });
    for (const s of [-1, 1]) { c.strokeStyle = ZP.pink; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(W / 2 + s * 40, 272); c.quadraticCurveTo(W / 2 + s * 160, 264, W / 2 + s * 300, 272); c.stroke(); }
  });
}
EventScene.prototype.draw = function (c) {
  const run = G.run, ev = this.ev, t = G.time;
  scn_blit(c, scn_eventPage(), 0, 0);
  const seal = scn_nodeSprite('event', 32); c.save(); c.translate(W / 2, 158 + Math.sin(t * 2) * 3); c.rotate(Math.sin(t * 1.3) * .06); c.drawImage(seal.cv, -seal.w / 2, -seal.h / 2, seal.w, seal.h); c.restore();
  const TL = scn_bubbleLayer(ev.title, 50, ZP.pink, { maxW: 760, seed: 6 }); scn_blitC(c, TL, W / 2, 238, 1);
  c.font = `28px ${FB}`;
  const txtShow = this.result ? this.result.msg : ev.text;
  wrapLines(c, txtShow, 780).forEach((l, i) => { txt(c, l, 250, 300 + i * 36, { size: 28, color: '#221a2c' }); });
  if (!this.result) {
    ev.opts.forEach((o, i) => {
      const ok = !o.cond || o.cond(run);
      if (UI.btn(250, 440 + i * 64, 780, 52, o.label, { col: ok ? (i === ev.opts.length - 1 ? '#9a78d8' : ZP.cyanD) : C.grey, disabled: !ok, size: 26 })) {
        const res = o.fx(run); this.result = res; saveRun(); Snd.play('stamp');
        if (res.curse) { run.deck.push({ id: 'regret', up: false }); }
        if (res.graft) addGraft(run, rollGraft(run) || 'gold_tooth');
      }
    });
  } else {
    const r = this.result;
    let y = 470;
    if (r.card && !r.taken) { if (UI.btn(250, y, 780, 52, r.rare ? 'CHOOSE A RARE CARD' : 'CHOOSE A CARD', { col: ZP.orange, size: 26 })) this.cardPick(r); y += 64; }
    if (r.upgrade && !r.taken) { if (UI.btn(250, y, 780, 52, 'UPGRADE A CARD', { col: ZP.orange, size: 26 })) openDeckView('Upgrade', { b: run.deck, n: run.ndeck }, { pick: (inst, tab) => { const l = tab === 'b' ? run.deck : run.ndeck; const k = l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) l[k].up = true; r.taken = true; Snd.play('buff'); burst(W / 2, 300, 40, { col: [C.mustard, C.green], shape: 'star' }); }, canPick: inst => !inst.up && Object.keys((BC[inst.id] || NC[inst.id]).upg).length > 0, hint: 'Choose a card to upgrade.', preview: 1 }); y += 64; }
    if (r.removeCard && !r.taken) { if (UI.btn(250, y, 780, 52, 'REMOVE A CARD', { col: '#9a78d8', size: 26 })) openDeckView('Remove', { b: run.deck, n: run.ndeck }, { pick: (inst, tab) => { const l = tab === 'b' ? run.deck : run.ndeck; const k = l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) l.splice(k, 1); r.taken = true; Snd.play('stamp'); }, hint: 'Choose a card to remove.' }); y += 64; }
    if (r.tradeCard && !r.taken) { if (UI.btn(250, y, 780, 52, 'TRADE A CARD', { col: '#9a78d8', size: 26 })) openDeckView('Trade Away', { b: run.deck }, { pick: (inst) => { const k = run.deck.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) run.deck.splice(k, 1); const rares = Object.values(BC).filter(b => b.rarity === 'rare' && (b.cls === 'any' || b.cls === run.char)); run.deck.push({ id: pick(rares).id, up: false }); r.taken = true; Snd.play('buff'); toast('Traded for a rare card!'); }, hint: 'Choose a card to trade.' }); y += 64; }
    if (UI.btn(W / 2 - 130, 570, 260, 56, 'CONTINUE', { col: ZP.lime, size: 32 })) go(() => setScene(makeMapScene()));
  }
  drawHUD(c, run);
};

// ================================================================ ENCOUNTER INTRO
function scn_encBanner(kind) {
  const fill = kind === 'boss' ? ZP.navy : kind === 'elite' ? '#e6dcfa' : '#fff7fb', dash = kind === 'boss' ? ZP.cyan : kind === 'elite' ? ZP.pink : ZP.lime;
  return scn_layer('encb2_' + kind, W, 220, (c) => {
    const r = scn_rng(kind.length * 17);
    c.save(); c.translate(W / 2, 110); c.rotate(-.06); c.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const y = (r() - .5) * 120, x = (r() < .5 ? -1 : 1) * (340 + r() * 220), l = 40 + r() * 120; c.strokeStyle = i % 3 ? ZK : dash; c.lineWidth = 3 + r() * 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sign(x) * l, y); c.stroke(); }
    c.restore();
    c.save(); c.translate(W / 2, 110); c.rotate(-.02);
    scn_sticker(c, -320, -56, 640, 112, 40, fill, { pad: 8, lw: 4.5, band: dash, bandW: 5 });
    c.save(); scn_rrect(c, -320, -56, 640, 112, 40); c.clip(); scn_spray(c, -220, 0, 90, dash, r, { a: kind === 'boss' ? .35 : .45, dots: 300 }); scn_spray(c, 230, 0, 90, kind === 'boss' ? ZP.pink : ZP.pinkL, r, { a: .4, dots: 300 }); c.restore();
    scn_doodle(c, 'star', -322, -52, 18, { fill: ZP.yel, sticker: 4, lw: 3 }); scn_doodle(c, 'star', 326, 50, 18, { fill: ZP.limeL, sticker: 4, lw: 3 });
    c.restore();
  });
}
EncounterScene.prototype.draw = function (c) {
  const act = this.run.act, t = G.time;
  drawBackdrop(c, (ENC[act] || ENC[1]).bg, act * 3 + 1, t);
  const boss = this.node.type === 'boss', elite = this.node.type === 'elite';
  const fg = c.createLinearGradient(0, 470, 0, H); fg.addColorStop(0, 'rgba(20,24,43,0)'); fg.addColorStop(1, 'rgba(20,24,43,.55)'); c.fillStyle = fg; c.fillRect(0, 470, W, 250);
  if (boss || elite) scn_drawCone(c, boss ? ZP.yel : ZP.pink, 900, -40, Math.sin(t * .8) * .08, 560, .35 + Math.sin(t * 3) * .08);
  drawUnit(c, this.P, 1);
  const k = ease.out(clamp(this.t * 2, 0, 1));
  this.units.forEach((u, i) => { c.save(); c.globalAlpha = k; c.translate((1 - k) * 200, 0); drawUnit(c, u, -1); c.restore(); });
  const kb = ease.back(clamp(this.t * 3, 0, 1)), BL = scn_encBanner(boss ? 'boss' : elite ? 'elite' : 'fight');
  c.save(); c.globalAlpha = clamp(this.t * 4, 0, 1); c.translate(W / 2, 110); c.scale(.6 + kb * .4, .6 + kb * .4); c.drawImage(BL.cv, -W / 2, -110, W, 220); c.restore();
  c.save(); c.translate(W / 2, 110); c.rotate(-.02);
  if (boss || elite) for (const s of [-1, 1]) scn_blitC(c, scn_dsprite(boss ? 'crown' : 'bolt', 18, { fill: ZP.yel, lw: 3, sticker: 3 }), s * 262, -4, 1);
  const TL = scn_bubbleLayer(boss ? 'BOSS ENCOUNTER' : elite ? 'ELITE ENCOUNTER' : 'ENCOUNTER!', 56, boss ? ZP.yel : elite ? ZP.pink : ZP.lime, { seed: 2, maxW: 470 });
  scn_blitC(c, TL, 0, -4, Math.max(.01, ease.back(clamp(this.t * 3, 0, 1))));
  c.restore();
  const names = this.units.map(u => u.def.name).join(' & ');
  c.save(); c.font = `30px ${FM}`; const nw = c.measureText(names).width + 50; c.restore();
  scn_sticker(c, W / 2 - nw / 2, 158, nw, 44, 22, '#fff', { pad: 4, band: ZP.pinkL, bandW: 3, lw: 3 });
  scn_marker(c, names, W / 2, 191, 30, ZK);
  if (this.t > .5) {
    const by = 560;
    scn_btnBack(c, W / 2 - 330, by, 300, 74);
    if (UI.btn(W / 2 - 330, by, 300, 74, 'FIGHT', { col: ZP.pink, size: 48 })) go(() => setScene(new BattleScene({ enemies: this.node.enc, node: this.node, elite: elite, boss: boss })));
    scn_blitC(c, scn_bubbleLayer('OR', 30, ZP.yel, { wave: 0 }), W / 2, by + 37, 1);
    if (this.leader) {
      const tk = this.leader.def.talk;
      scn_btnBack(c, W / 2 + 30, by, 300, 74);
      if (UI.btn(W / 2 + 30, by, 300, 74, 'TALK', { col: ZP.cyanD, size: 48 })) go(() => setScene(new NegotiationScene({ enemy: this.leader.id, fightIds: this.node.enc, node: this.node, elite, boss })));
      txt(c, `Persuade ${this.leader.def.name} (${tk.core} Resolve). No HP lost on success; fail and they attack, enraged.`, W / 2 + 180, by + 100, { size: 17, color: '#fff', align: 'center', stroke: ZK, sw: 4 });
    } else {
      scn_sticker(c, W / 2 + 30, by, 300, 74, 14, '#d9d4de', { pad: 6, lw: 3.5 });
      c.save(); c.strokeStyle = ZP.pinkD; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(W / 2 + 46, by + 10); c.lineTo(W / 2 + 314, by + 64); c.stroke(); c.restore();
      scn_marker(c, 'NO TALKING', W / 2 + 180, by + 48, 32, '#6a6474');
      txt(c, 'Beasts and machines do not negotiate.', W / 2 + 180, by + 100, { size: 17, color: '#fff', align: 'center', stroke: ZK, sw: 4 });
    }
  }
  drawHUD(c, this.run);
};

// ================================================================ END SCREENS
function scn_goBg() {
  return scn_zineBg('go_bg', 1313, {
    base: '#f2eef7',
    splats: [[200, 140, 220, ZP.lav], [1080, 140, 220, ZP.sky], [640, 420, 320, ZP.lav, { a: .3 }], [160, 600, 200, ZP.pinkL, { a: .35 }], [1140, 600, 200, ZP.lav]],
    extra: (c, r) => { [[150, 330, 36], [1110, 300, 40], [330, 120, 26], [960, 110, 28]].forEach(p => { scn_doodle(c, 'cloud', p[0], p[1], p[2], { fill: '#fff', lw: 3, sticker: 3 }); for (let k = 0; k < 3; k++) scn_doodle(c, 'drop', p[0] - p[2] * .5 + k * p[2] * .5, p[1] + p[2] * .9 + (k % 2) * 10, p[2] * .16, { lw: 2 }); }); },
    doodles: 26, avoid: [[260, 40, 760, 640]], dopt: { kinds: ['brokenheart', 'swirl', 'drop', 'plus', 'zig', 'note1', 'star'], smax: 18 }
  });
}
GameOverScene.prototype.draw = function (c) {
  const t = G.time;
  scn_blit(c, scn_goBg(), 0, 0);
  // doodle rain
  for (let i = 0; i < 26; i++) { const sp = 120 + (i * 53 % 90), x = (i * 97.3 % (W + 100)) - 50, y = ((t * sp + i * 211) % (H + 80)) - 40; c.save(); c.globalAlpha = .75; scn_blitC(c, scn_dsprite('drop', 7, { lw: 1.8 }), x, y, 1); c.restore(); }
  const run = this.run; const k = ease.back(clamp(this.t * 2, 0, 1));
  const TL = scn_layer('go_title', 900, 220, (cc, w, h) => {
    scn_bubble(cc, 'ROUGHED UP', w / 2, h / 2, 120, ZP.pink, { seed: 13, maxW: 760 });
    scn_doodle(cc, 'bandaid', w / 2 - 230, h / 2 - 30, 38, { r2: .7, lw: 3, sticker: 3 }); scn_doodle(cc, 'bandaid', w / 2 + 250, h / 2 + 20, 34, { r2: -.6, lw: 3, sticker: 3 });
    scn_doodle(cc, 'swirl', w / 2 + 380, h / 2 - 50, 22, { lw: 4 }); scn_doodle(cc, 'brokenheart', w / 2 - 390, h / 2 + 40, 26, { lw: 4, sticker: 4 });
  });
  c.save(); c.translate(W / 2, 140); c.rotate(-.03); scn_blitC(c, TL, 0, 0, k); c.restore();
  scn_marker(c, `Left in the gutter by ${this.o.cause}.`, W / 2, 238, 28, ZK);
  if (run) {
    scn_blit(c, scn_statsPanel('lose'), W / 2 - 230, 262); scn_stats(c, W / 2, 314, run);
    const ch = charById(run.char); c.save(); c.translate(W / 2 + 330, 520); c.rotate(1.2); drawFigure(c, ch.spec, { t: G.time * .2, atk: 0, talk: 0 }); c.restore();
    for (let i = 0; i < 4; i++) { const a = t * 2.2 + i * 1.57; scn_blitC(c, scn_dsprite('star', 8, { fill: [ZP.yel, ZP.pinkL, ZP.limeL, ZP.sky][i], lw: 2 }), W / 2 + 470 + Math.cos(a) * 46, 440 + Math.sin(a) * 14, 1); }
  }
  scn_btnBack(c, W / 2 - 320, 600, 300, 64); scn_btnBack(c, W / 2 + 20, 600, 300, 64);
  if (UI.btn(W / 2 - 320, 600, 300, 64, 'TRY AGAIN', { col: ZP.pink, size: 38 })) go(() => setScene(new CharSelectScene()));
  if (UI.btn(W / 2 + 20, 600, 300, 64, 'MAIN MENU', { col: ZP.cyanD, size: 38 })) go(() => setScene(new MenuScene()));
};
function scn_vicBg() {
  return scn_zineBg('vic_bg', 505, {
    splats: [[640, 140, 330, ZP.pinkL, { a: .5 }], [150, 200, 200, ZP.limeL, { a: .65, drips: 4 }], [1130, 200, 200, ZP.yel, { a: .5 }], [280, 600, 230, ZP.pinkL], [1050, 600, 230, ZP.limeL], [640, 560, 240, ZP.sky, { a: .3 }]],
    doodles: 40, avoid: [[160, 30, 960, 600]], dopt: { smax: 22 }
  });
}
function scn_raysPastel() {
  return scn_layer('rays_pastel', 900, 900, (c) => {
    c.translate(450, 450); for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, d = Math.PI / 24; c.fillStyle = i % 2 ? scn_rgba(ZP.yel, .3) : scn_rgba(ZP.limeL, .25); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a - d) * 640, Math.sin(a - d) * 640); c.lineTo(Math.cos(a + d) * 640, Math.sin(a + d) * 640); c.closePath(); c.fill(); }
  }, 1);
}
VictoryScene.prototype.draw = function (c) {
  const t = G.time;
  scn_blit(c, scn_vicBg(), 0, 0);
  const rays = scn_raysPastel(); c.save(); c.translate(W / 2, 130); c.rotate(t * .08); c.drawImage(rays.cv, -800, -800, 1600, 1600); c.restore();
  // pastel doodle fireworks
  for (let f = 0; f < 3; f++) {
    const per = 2.2, ph = ((t + f * .73) % per) / per, seed = Math.floor((t + f * .73) / per) * 3 + f, fx = 180 + ((seed * 397) % 920), fy = 120 + ((seed * 131) % 200);
    const kind = ['star', 'heart', 'sparkle'][seed % 3], col = SCN_CONF[seed % 6];
    if (ph > .15) { const e = (ph - .15) / .85; c.save(); c.globalAlpha = 1 - e; for (let q = 0; q < 12; q++) { const a = q / 12 * 6.283, d = ease.out(e) * 110; scn_blitC(c, scn_dsprite(kind, 7, { fill: col, lw: 1.8, shine: false }), fx + Math.cos(a) * d, fy + Math.sin(a) * d + e * e * 40, 1); } c.restore(); }
    else { c.fillStyle = col; c.strokeStyle = ZK; c.lineWidth = 1.5; c.beginPath(); c.arc(fx, H - (H - fy) * (ph / .15), 4, 0, 6.3); c.fill(); c.stroke(); }
  }
  scn_confetti(c, t, 30, 11, { speed: 70 });
  const run = this.run, k = ease.elastic(clamp(this.t, 0, 1));
  const VT = scn_layer('vic_title2', 1400, 320, (vc) => {
    scn_doodle(vc, 'crown', 700, 78, 32, { fill: ZP.yel, lw: 5, sticker: 5 });
    scn_bubble(vc, 'RUSTGRiFT RULER!', 700, 190, 112, ZP.lime, { maxW: 1100, heartI: true, seed: 8 });
    scn_doodle(vc, 'star', 120, 110, 34, { fill: ZP.pinkL, sticker: 5, lw: 4.5, rot: -.2 }); scn_doodle(vc, 'star', 1290, 250, 30, { fill: ZP.yel, sticker: 5, lw: 4.5, rot: .3 });
    scn_doodle(vc, 'rays', 90, 230, 30, { col: ZP.pinkD, rot: -2, lw: 5 }); scn_doodle(vc, 'rays', 1320, 90, 30, { col: ZP.limeD, rot: .8, lw: 5 });
  });
  c.save(); c.translate(W / 2, 130); c.scale(k, k); c.rotate(-.02); c.drawImage(VT.cv, -700, -170, VT.w, VT.h); c.restore();
  scn_sticker(c, W / 2 - 330, 234, 660, 34, 17, '#fff', { pad: 4, band: ZP.limeL, bandW: 3, lw: 2.8 });
  scn_marker(c, 'You grifted, fought and sweet-talked your way to the top.', W / 2, 259, 20, ZK);
  if (run) {
    scn_blit(c, scn_statsPanel('win'), W / 2 - 230, 272); scn_stats(c, W / 2, 324, run);
    scn_drawCone(c, ZP.yel, W / 2 - 360, 260, 0, 380, .6);
    scn_sticker(c, W / 2 - 460, 588, 200, 34, 12, ZP.pink, { pad: 5, lw: 3.5 });
    scn_doodle(c, 'star', W / 2 - 360, 606, 13, { fill: ZP.yel, lw: 2.4 }); txt(c, 'No.1', W / 2 - 412, 614, { size: 20, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 4, align: 'center' }); txt(c, 'No.1', W / 2 - 308, 614, { size: 20, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 4, align: 'center' });
    c.save(); c.translate(W / 2 - 360, 592); c.scale(1.12, 1.12); drawFigure(c, charById(run.char).spec, { t: G.time, atk: 0, talk: 1 }); c.restore();
  }
  scn_btnBack(c, W / 2 - 150, 600, 300, 64);
  if (UI.btn(W / 2 - 150, 600, 300, 64, 'MAIN MENU', { col: ZP.cyanD, size: 38 })) go(() => setScene(new MenuScene()));
};
