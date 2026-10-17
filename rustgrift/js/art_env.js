'use strict';
// ===================== ART_ENV: RoxorLoops & Jasmin zine/concert backdrops =====================
// Overrides style.js makeBackdrop/drawBackdrop. Each (kind,seed) is painted ONCE into a cached 1280x720
// canvas in the act's identity: pastel spray-paint colour fields (soft airbrush blobs + stipple + drips),
// cream paper grain, bubbly cartoon props with thick ink outlines and flat saturated fills, marker doodles
// (hearts, stars, sparkles, notes, cat face, smileys, loops, speed dashes). drawBackdrop then adds cheap
// per-frame animation from baked sprites (bunting, twinkling bulbs, neon flicker, pulsing EQ bars and
// speaker cones, sweeping spotlights, confetti, rising notes/hearts, balloons, disco glints...).
// Composition rule: busy detail lives at the top (y<240), the side edges (x<150 / x>1150) and the very
// front of the floor; the combat band (x150-1150, y250-520) gets calm mid-value fields + a soft veil.
// Everything is deterministic in (kind, seed, t).
var ENVART = (function () {
  const TAU = Math.PI * 2;
  const HZ = typeof HORIZON !== 'undefined' ? HORIZON : 416;
  const INK = '#15101c', CREAM = '#fbf7ea';
  const K = {
    lime: '#6cc22e', limeL: '#a6e65a', limeD: '#3f8f1a', pink: '#f06aa0', pinkL: '#ff9cc6', pinkD: '#d63a82',
    cyan: '#3fd8e8', cyanD: '#1597b0', lav: '#b79ae8', sky: '#7fd0e8', yel: '#ffd23a', org: '#ff8a2a', navy: '#14182b'
  };
  const BPM = 112;
  const FDF = typeof FD !== 'undefined' ? FD : '"Baloo 2",Impact,sans-serif';
  const FMF = typeof FM !== 'undefined' ? FM : '"Permanent Marker",cursive';

  // ---------- small utils ----------
  function mkRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const hh = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function mk(w, h) { const p = document.createElement('canvas'); p.width = Math.max(1, w | 0); p.height = Math.max(1, h | 0); return p; }
  const HEX = {};
  function hex2(h) {
    if (HEX[h]) return HEX[h];
    let s = h.replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16); return (HEX[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  function mixh(a, b, t) {
    const A = hex2(a), B = hex2(b);
    const r = Math.round(A[0] + (B[0] - A[0]) * t), g = Math.round(A[1] + (B[1] - A[1]) * t), bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function rgba(h, a) { const A = hex2(h); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
  const gauss = r => (r() + r() + r() - 1.5) / 1.5;
  const pick = (r, a) => a[(r() * a.length) | 0];
  function quadPt(x1, y1, cx, cy, x2, y2, u) { const v = 1 - u; return [v * v * x1 + 2 * u * v * cx + u * u * x2, v * v * y1 + 2 * u * v * cy + u * u * y2]; }
  function beat(t) { const b = (t * BPM / 60) % 1; return Math.exp(-b * 5); }
  function pixCanvas(w, h, fn) {
    const p = mk(w, h), x = p.getContext('2d'), id = x.createImageData(w, h), d = id.data, o = [0, 0, 0, 0];
    let k = 0;
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { o[3] = 255; fn(i, y, o); d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3]; k += 4; }
    x.putImageData(id, 0, 0); return p;
  }
  function blurred(src, f) {
    const w = Math.max(1, src.width / f | 0), h = Math.max(1, src.height / f | 0);
    const a = mk(w, h), ac = a.getContext('2d'); ac.imageSmoothingEnabled = true; ac.drawImage(src, 0, 0, w, h);
    const b = mk(src.width, src.height), bc = b.getContext('2d'); bc.imageSmoothingEnabled = true; bc.drawImage(a, 0, 0, src.width, src.height);
    return b;
  }
  // soft glow sprite (neon/lamp halos)
  const GLOW = {};
  function glow(col) {
    if (GLOW[col]) return GLOW[col];
    const p = mk(64, 64), x = p.getContext('2d'), A = hex2(col), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${A},1)`); g.addColorStop(.2, `rgba(${A},.6)`); g.addColorStop(.5, `rgba(${A},.18)`); g.addColorStop(1, `rgba(${A},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (GLOW[col] = p);
  }
  function dglow(c, col, x, y, r, a) { c.globalAlpha = a; c.drawImage(glow(col), x - r, y - r, r * 2, r * 2); }
  // airbrush sprite: dense body with a soft over-sprayed edge
  const SOFT = {};
  function softS(col) {
    if (SOFT[col]) return SOFT[col];
    const p = mk(128, 128), x = p.getContext('2d'), A = hex2(col), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${A},.95)`); g.addColorStop(.45, `rgba(${A},.8)`); g.addColorStop(.72, `rgba(${A},.32)`); g.addColorStop(1, `rgba(${A},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (SOFT[col] = p);
  }
  function soft(c, col, x, y, rx, ry, a) { c.globalAlpha = a; c.drawImage(softS(col), x - rx, y - ry, rx * 2, ry * 2); c.globalAlpha = 1; }

  // ---------- spray-paint brush: overlapping airbrush blobs + stipple overspray + drips ----------
  function splat(c, r, x, y, R, col, o) {
    o = o || {}; const a = o.a == null ? .8 : o.a, sq = o.sq || .85;
    const n = 4 + (r() * 4 | 0);
    for (let i = 0; i < n; i++) { const an = r() * TAU, d = r() * R * .42, rr = R * (.42 + r() * .38); soft(c, col, x + Math.cos(an) * d, y + Math.sin(an) * d * sq, rr, rr * sq, a * (.45 + r() * .4)); }
    const dots = o.dots == null ? (R * R * .045) | 0 : o.dots;
    c.fillStyle = col;
    for (let i = 0; i < dots; i++) {
      const an = r() * TAU, d = R * (.5 + Math.abs(gauss(r)) * .55), s = .6 + r() * r() * 2.6;
      c.globalAlpha = a * (.3 + r() * .6); c.fillRect(x + Math.cos(an) * d, y + Math.sin(an) * d * sq, s, s);
    }
    const dr = o.drips || 0;
    for (let i = 0; i < dr; i++) {
      const dx = (r() - .5) * R * 1.1, y0 = y + R * sq * (.25 + r() * .25), L = R * (.25 + r() * .8), w = 2 + r() * 3;
      c.globalAlpha = a * .8; c.fillRect(x + dx - w / 2, y0, w, L);
      c.beginPath(); c.arc(x + dx, y0 + L, w * .85, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  function stipple(c, r, x0, y0, w, h, cols, n, a) {
    for (let i = 0; i < n; i++) { c.fillStyle = cols[(r() * cols.length) | 0]; c.globalAlpha = a * (.3 + r() * .7); const s = .7 + r() * r() * 2.2; c.fillRect(x0 + r() * w, y0 + r() * h, s, s); }
    c.globalAlpha = 1;
  }

  // ---------- ink & sticker shape helpers ----------
  function inkS(c, lw, col) { c.lineWidth = lw == null ? 4 : lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = col || INK; c.stroke(); }
  function rrp(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // flat fill + gloss/shade gradient + uniform ink outline
  function rbox(c, x, y, w, h, r, fill, lw, shade) {
    c.beginPath(); rrp(c, x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (shade) {
      c.save(); c.clip(); const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, `rgba(255,255,255,${.3 * shade})`); g.addColorStop(.35, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(30,10,40,${.25 * shade})`);
      c.fillStyle = g; c.fillRect(x, y, w, h); c.restore();
    }
    if (lw) inkS(c, lw);
  }
  // union of circles with a single outer ink outline (puffy clouds, cacti, bushes)
  function puff(c, cs, fill, lw, shade) {
    lw = lw == null ? 4 : lw;
    if (lw) { c.fillStyle = INK; for (const q of cs) { c.beginPath(); c.arc(q[0], q[1], q[2] + lw, 0, TAU); c.fill(); } }
    c.fillStyle = fill; for (const q of cs) { c.beginPath(); c.arc(q[0], q[1], q[2], 0, TAU); c.fill(); }
    if (shade) {
      c.save(); c.beginPath(); for (const q of cs) { c.moveTo(q[0] + q[2], q[1]); c.arc(q[0], q[1], q[2], 0, TAU); } c.clip();
      c.fillStyle = shade; for (const q of cs) { c.beginPath(); c.arc(q[0] + q[2] * .12, q[1] + q[2] * .5, q[2] * .85, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,.55)'; const q = cs[0]; c.beginPath(); c.ellipse(q[0] - q[2] * .35, q[1] - q[2] * .4, q[2] * .28, q[2] * .14, -.5, 0, TAU); c.fill();
      c.restore();
    }
  }
  // ---------- doodle vocabulary ----------
  function starP(c, x, y, R, rot, ir) { rot = rot || 0; ir = ir || .5; c.beginPath(); for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * ir : R; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  function star(c, x, y, R, fill, rot, lw) { starP(c, x, y, R, rot); if (fill) { c.fillStyle = fill; c.fill(); } inkS(c, lw == null ? 3 : lw); }
  function heartP(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * .9); c.bezierCurveTo(x - s * 1.5, y + s * .05, x - s * .95, y - s * 1.05, x, y - s * .35); c.bezierCurveTo(x + s * .95, y - s * 1.05, x + s * 1.5, y + s * .05, x, y + s * .9); c.closePath(); }
  function heart(c, x, y, s, fill, lw) { heartP(c, x, y, s); if (fill) { c.fillStyle = fill; c.fill(); } inkS(c, lw == null ? 3 : lw); }
  function sparkP(c, x, y, s) { const k = s * .14; c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x + k, y - k, x + s, y); c.quadraticCurveTo(x + k, y + k, x, y + s); c.quadraticCurveTo(x - k, y + k, x - s, y); c.quadraticCurveTo(x - k, y - k, x, y - s); c.closePath(); }
  function sparkle(c, x, y, s, fill, lw) { sparkP(c, x, y, s); c.fillStyle = fill || '#fff'; c.fill(); if (lw) inkS(c, lw); }
  function note(c, x, y, s, col) { // two beamed eighth notes, first head at (x,y)
    c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round';
    c.beginPath(); c.ellipse(x, y, s * .4, s * .3, -.4, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(x + s * 1.15, y - s * .25, s * .4, s * .3, -.4, 0, TAU); c.fill();
    c.lineWidth = s * .15; c.beginPath(); c.moveTo(x + s * .34, y - s * .05); c.lineTo(x + s * .34, y - s * 1.45); c.moveTo(x + s * 1.49, y - s * .3); c.lineTo(x + s * 1.49, y - s * 1.7); c.stroke();
    c.beginPath(); c.moveTo(x + s * .27, y - s * 1.45); c.lineTo(x + s * 1.56, y - s * 1.72); c.lineTo(x + s * 1.56, y - s * 1.36); c.lineTo(x + s * .27, y - s * 1.09); c.closePath(); c.fill();
  }
  function cat(c, x, y, s, lw) {
    c.beginPath(); c.moveTo(x - s, y + s * .1); c.lineTo(x - s * .85, y - s * .95); c.lineTo(x - s * .35, y - s * .55); c.quadraticCurveTo(x, y - s * .68, x + s * .35, y - s * .55);
    c.lineTo(x + s * .85, y - s * .95); c.lineTo(x + s, y + s * .1); c.quadraticCurveTo(x + s, y + s * .75, x, y + s * .75); c.quadraticCurveTo(x - s, y + s * .75, x - s, y + s * .1); c.closePath();
    inkS(c, lw || 3);
    c.fillStyle = INK; c.beginPath(); c.arc(x - s * .38, y - s * .05, s * .1, 0, TAU); c.arc(x + s * .38, y - s * .05, s * .1, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(x - s * .12, y + s * .18); c.quadraticCurveTo(x - s * .06, y + s * .32, x, y + s * .2); c.quadraticCurveTo(x + s * .06, y + s * .32, x + s * .12, y + s * .18);
    for (const k of [-1, 1]) for (const j of [-.12, .1]) { c.moveTo(x + k * s * .62, y + s * (.2 + j * .3)); c.lineTo(x + k * s * 1.3, y + s * (.12 + j * 1.6)); }
    inkS(c, (lw || 3) * .7);
  }
  function smiley(c, x, y, R, fill, lw) {
    c.beginPath(); c.arc(x, y, R, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } inkS(c, lw || 3);
    c.fillStyle = INK; c.beginPath(); c.ellipse(x - R * .33, y - R * .2, R * .1, R * .18, 0, 0, TAU); c.ellipse(x + R * .33, y - R * .2, R * .1, R * .18, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(x, y + R * .02, R * .55, .2 * Math.PI, .8 * Math.PI); inkS(c, (lw || 3) * .9);
  }
  function dashes(c, x, y, ang, len, col, lw) {
    c.beginPath(); for (const k of [-.42, 0, .42]) { const a = ang + k; c.moveTo(x + Math.cos(a) * len * .25, y + Math.sin(a) * len * .25); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); }
    inkS(c, lw || 4, col);
  }
  function loopSym(c, x, y, s, col, lw) { c.beginPath(); for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, d = 1 + Math.sin(a) * Math.sin(a); const px = x + s * Math.cos(a) / d, py = y + s * Math.sin(a) * Math.cos(a) / d; i ? c.lineTo(px, py) : c.moveTo(px, py); } inkS(c, lw || 4, col); }
  function squig(c, x, y, w, col, lw) { c.beginPath(); c.moveTo(x, y); for (let i = 1; i <= 6; i++) c.quadraticCurveTo(x + (i - .5) * w / 6, y + (i % 2 ? -8 : 8), x + i * w / 6, y); inkS(c, lw || 3, col); }
  // random doodle from the vocabulary
  function doodle(c, r, x, y, s, cols) {
    const k = (r() * 9) | 0, col = pick(r, cols);
    if (k === 0) star(c, x, y, s, col, r() * .6 - .3);
    else if (k === 1) heart(c, x, y, s * .8, col);
    else if (k === 2) sparkle(c, x, y, s, col, 2.5);
    else if (k === 3) note(c, x - s * .6, y + s * .6, s * .9, INK);
    else if (k === 4) cat(c, x, y, s * .9);
    else if (k === 5) smiley(c, x, y, s * .85, col);
    else if (k === 6) dashes(c, x, y, r() * TAU, s * 1.2, col);
    else if (k === 7) loopSym(c, x, y, s * 1.1, col);
    else star(c, x, y, s * .7, null, r());
  }
  // ---------- lettering ----------
  function bubble(c, txt, x, y, size, fill, o) {
    o = o || {}; c.save(); c.translate(x, y); c.rotate(o.rot || 0);
    c.font = `800 ${size}px ${FDF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    if (o.white !== false) { c.strokeStyle = o.white || '#fff'; c.lineWidth = size * .42; c.strokeText(txt, 0, 0); }
    c.strokeStyle = INK; c.lineWidth = size * .2; c.strokeText(txt, 0, 0);
    const g = c.createLinearGradient(0, -size * .45, 0, size * .45); g.addColorStop(0, mixh(fill, '#ffffff', .35)); g.addColorStop(.55, fill); g.addColorStop(1, mixh(fill, INK, .18));
    c.fillStyle = g; c.fillText(txt, 0, 0);
    c.restore();
  }
  function marker(c, txt, x, y, size, col, rot, align) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.font = `${size}px ${FMF}`; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = col || INK; c.fillText(txt, 0, 0); c.restore();
  }
  // neon tube: baked "off" tube in the backdrop + an "on" sprite (with bloom) for the per-frame flicker
  function neon(c, E, txt, x, y, size, col, o) {
    o = o || {}; const font = `800 ${size}px ${FDF}`;
    c.save(); c.font = font; const tw = c.measureText(txt).width; c.restore();
    const pad = size * .5, bw = tw + pad * 2, bh = size * 1.25 + pad;
    if (o.board !== false) {
      rbox(c, x - bw / 2, y - bh / 2, bw, bh, 14, o.board || '#221d3c', 4, .6);
      c.fillStyle = '#9aa0c0'; for (const sx of [-1, 1]) { c.beginPath(); c.arc(x + sx * (bw / 2 - 9), y - bh / 2 + 9, 2.5, 0, TAU); c.fill(); }
    }
    c.save(); c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.strokeStyle = mixh(col, '#3a3550', .55); c.lineWidth = size * .11; c.strokeText(txt, x, y); c.restore();
    const sw = Math.ceil(bw + size), sh = Math.ceil(bh + size), img = mk(sw, sh), s = img.getContext('2d');
    s.font = font; s.textAlign = 'center'; s.textBaseline = 'middle'; s.lineJoin = 'round';
    s.shadowColor = col; s.shadowBlur = size * .45; s.strokeStyle = col; s.lineWidth = size * .11;
    s.strokeText(txt, sw / 2, sh / 2); s.strokeText(txt, sw / 2, sh / 2);
    s.shadowBlur = 0; s.strokeStyle = mixh(col, '#ffffff', .75); s.lineWidth = size * .035; s.strokeText(txt, sw / 2, sh / 2);
    E.A.neon.push({ img, x: x - sw / 2, y: y - sh / 2, col, gx: x, gy: y, gr: Math.max(bw, bh) * .75, ph: E.r() * 50 });
    return { w: bw, h: bh };
  }

  // ---------- reusable props ----------
  function windowsGrid(c, r, x, y, w, h, lit, dark, o) {
    o = o || {}; const ww = o.ww || 13, wh = o.wh || 17, gx = o.gx || 24, gy = o.gy || 30;
    const cols = Math.max(1, Math.floor((w - 12) / gx)), rows = Math.max(1, Math.floor((h - 26) / gy));
    const ox = x + (w - (cols - 1) * gx - ww) / 2;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const wx = ox + i * gx, wy = y + 16 + j * gy, on = r() < (o.on || .55);
      if (on && r() < .08) { heart(c, wx + ww / 2, wy + wh / 2, 7, pick(r, [K.pinkL, '#ffe08a']), 2); continue; }
      rbox(c, wx, wy, ww, wh, 4, on ? pick(r, lit) : dark, o.lw == null ? 2 : o.lw);
    }
  }
  function bldg(c, r, x, base, w, h, fill, o) {
    o = o || {}; const top = base - h, lw = o.lw == null ? 3.5 : o.lw;
    if (o.roof === 'dome') { c.beginPath(); c.ellipse(x + w / 2, top + 4, w * .32, w * .22, 0, Math.PI, TAU); c.fillStyle = mixh(fill, '#ffffff', .2); c.fill(); inkS(c, lw); }
    if (o.roof === 'tank') { const tx = x + w * .62; rbox(c, tx, top - 34, 30, 26, 8, mixh(fill, '#6a4a5a', .35), lw); c.beginPath(); c.moveTo(tx + 6, top - 8); c.lineTo(tx + 3, top); c.moveTo(tx + 24, top - 8); c.lineTo(tx + 27, top); inkS(c, lw * .8); }
    if (o.roof === 'ant') { c.beginPath(); c.moveTo(x + w * .3, top); c.lineTo(x + w * .3, top - 40); inkS(c, lw * .8); c.beginPath(); c.arc(x + w * .3, top - 42, 5, 0, TAU); c.fillStyle = o.antCol || K.pink; c.fill(); inkS(c, 2.5); if (o.A) o.A.glows.push([x + w * .3, top - 42, 16, o.antCol || K.pink, .5, 2 + r() * 2]); }
    rbox(c, x, top, w, h + 8, o.rad == null ? 12 : o.rad, fill, lw, .7);
    if (o.win !== false) windowsGrid(c, r, x, top, w, h - 10, o.lit || ['#ffe08a', '#fff2b8', K.pinkL, '#bff3ff'], o.dark || mixh(fill, INK, .35), { on: o.on, lw: o.wlw });
  }
  function speakerCab(c, r, A, x, y, w, h, o) {
    o = o || {};
    rbox(c, x, y, w, h, 10, o.body || '#2a2638', 4, .5);
    rbox(c, x + 8, y + 8, w - 16, h - 16, 6, '#1e1b2c', 0);
    const n = o.cones || (h > w * 1.3 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const R = Math.min(w, h / n) * .36, cx = x + w / 2, cy = y + h * (i + .5) / n;
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = '#4a4562'; c.fill(); inkS(c, 3);
      c.beginPath(); c.arc(cx, cy, R * .82, 0, TAU); c.fillStyle = '#34304a'; c.fill(); inkS(c, 2);
      A.spk.push([cx, cy, R * .78, r() * .3]);
    }
    c.fillStyle = '#c9cce0'; for (const [sx, sy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { c.beginPath(); rrp(c, sx - 7, sy - 7, 14, 14, 3); c.fill(); inkS(c, 2); }
    if (o.stickers !== false) for (let i = 0; i < 2; i++) stickerBadge(c, r, x + 12 + r() * (w - 24), y + 12 + r() * (h - 24), 9 + r() * 5);
  }
  function stickerBadge(c, r, x, y, s) {
    const k = (r() * 5) | 0, col = pick(r, [K.pink, K.lime, K.cyan, K.yel, K.lav, K.org]);
    c.save(); c.translate(x, y); c.rotate((r() - .5) * .6);
    if (k === 0) { starP(c, 0, 0, s * 1.15, 0); c.fillStyle = '#fff'; c.fill(); star(c, 0, 0, s * .9, col, 0, 2); }
    else if (k === 1) { heartP(c, 0, 0, s * 1.05); c.fillStyle = '#fff'; c.fill(); heart(c, 0, 0, s * .85, col, 2); }
    else if (k === 2) { c.beginPath(); c.arc(0, 0, s * 1.12, 0, TAU); c.fillStyle = '#fff'; c.fill(); smiley(c, 0, 0, s * .9, K.yel, 2); }
    else if (k === 3) { rbox(c, -s * 1.2, -s * .7, s * 2.4, s * 1.4, 5, '#fff', 0); rbox(c, -s, -s * .5, s * 2, s, 4, col, 2); }
    else { c.beginPath(); c.arc(0, 0, s * 1.1, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(0, 0, s * .9, 0, TAU); c.fillStyle = col; c.fill(); inkS(c, 2); loopSym(c, 0, 0, s * .55, INK, 2); }
    c.restore();
  }
  function bricks(c, r, x, y, w, h, col, o) {
    o = o || {}; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = col; c.fillRect(x, y, w, h);
    const bh = o.bh || 22, bw = o.bw || 48, ln = mixh(col, INK, .22);
    for (let j = 0, yy = y; yy < y + h; j++, yy += bh) {
      for (let xx = x - (j % 2 ? bw / 2 : 0); xx < x + w; xx += bw) { c.fillStyle = mixh(col, r() < .5 ? '#ffffff' : INK, r() * .1); c.fillRect(xx + 2, yy + 2, bw - 4, bh - 4); }
    }
    c.strokeStyle = ln; c.lineWidth = 2; c.beginPath();
    for (let j = 0, yy = y; yy < y + h; j++, yy += bh) { c.moveTo(x, yy); c.lineTo(x + w, yy); for (let xx = x - (j % 2 ? bw / 2 : 0); xx < x + w; xx += bw) { c.moveTo(xx, yy); c.lineTo(xx, yy + bh); } }
    c.stroke(); c.restore();
  }
  function cloudToon(c, x, y, s, fill, shade) { puff(c, [[x, y, 26 * s], [x - 30 * s, y + 10 * s, 18 * s], [x + 32 * s, y + 8 * s, 20 * s], [x + 12 * s, y - 14 * s, 18 * s], [x - 50 * s, y + 18 * s, 11 * s], [x + 55 * s, y + 18 * s, 11 * s]], fill, 3.5, shade); }
  function cloudSprite(s, fill, shade) {
    const p = mk(150 * s, 80 * s), c = p.getContext('2d');
    cloudToon(c, 75 * s, 42 * s, s, fill, shade); return p;
  }
  // string of bunting flags / bulbs (animated each frame)
  function wire(A, x1, y1, x2, y2, sag, n, kind, cols, o) {
    o = o || {}; const items = [];
    for (let i = 0; i < n; i++) items.push({ u: (i + .5) / n, t: kind, col: cols[i % cols.length], ph: i * 1.7 + x1 * .01 });
    A.wires.push({ x1, y1, x2, y2, sag, items, sp: o.sp || .9, ph: x1 * .013 + y1 * .01, lw: o.lw || 2.5, sz: o.sz || 1 });
  }
  function groundPersp(c, y0, y1, vx, vy, n, col, lw) {
    c.save(); c.beginPath(); c.rect(0, y0, W, y1 - y0); c.clip(); c.strokeStyle = col; c.lineWidth = lw || 2; c.beginPath();
    for (let i = -n; i <= n; i++) { const bx = vx + i * (W / n) * 1.4; c.moveTo(vx + (bx - vx) * ((y0 - vy) / (y1 - vy)), y0); c.lineTo(bx, y1); }
    c.stroke(); c.restore();
  }
  function lampPost(c, r, A, x, base, top, col, lampCol) {
    rbox(c, x - 8, top + 20, 16, base - top - 20, 7, col, 4, .8);
    for (let i = 0; i < 6; i++) stickerBadge(c, r, x + (r() - .5) * 6, top + 50 + r() * (base - top - 90), 7 + r() * 3);
    rbox(c, x - 22, base - 14, 44, 16, 6, mixh(col, INK, .25), 4);
    c.beginPath(); c.moveTo(x - 20, top + 24); c.quadraticCurveTo(x, top - 14, x + 20, top + 24); c.closePath(); c.fillStyle = mixh(col, INK, .2); c.fill(); inkS(c, 4);
    c.beginPath(); c.arc(x, top + 30, 12, 0, TAU); c.fillStyle = '#fff6c8'; c.fill(); inkS(c, 3.5);
    A.glows.push([x, top + 30, 70, lampCol || '#ffd88a', .5, 1.5]);
  }
  function cactus(c, x, base, s, o) {
    o = o || {}; const g = o.col || '#5fbf5a', sh = mixh(g, INK, .25);
    const arm = (sx, y, h) => { c.beginPath(); c.moveTo(x + sx * 18 * s, base - y * s); c.quadraticCurveTo(x + sx * 46 * s, base - y * s, x + sx * 46 * s, base - (y + 18) * s); c.lineTo(x + sx * 46 * s, base - (y + h) * s); inkS(c, 26 * s + 8); c.strokeStyle = g; c.lineWidth = 26 * s; c.stroke(); };
    arm(-1, 60, 50); arm(1, 82, 38);
    rbox(c, x - 22 * s, base - 150 * s, 44 * s, 150 * s, 22 * s, g, 4, .6);
    c.strokeStyle = sh; c.lineWidth = 2; c.beginPath(); for (const k of [-9, 0, 9]) { c.moveTo(x + k * s, base - 135 * s); c.lineTo(x + k * s, base - 10 * s); } c.stroke();
    if (o.glasses) { // cool sunglasses + smile
      const gy = base - 118 * s; c.fillStyle = INK; c.beginPath(); c.ellipse(x - 10 * s, gy, 10 * s, 7 * s, 0, 0, TAU); c.ellipse(x + 10 * s, gy, 10 * s, 7 * s, 0, 0, TAU); c.fill(); c.fillRect(x - 20 * s, gy - 6 * s, 40 * s, 3 * s);
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x - 15 * s, gy - 3 * s, 4 * s, 2 * s); c.fillRect(x + 5 * s, gy - 3 * s, 4 * s, 2 * s);
      c.beginPath(); c.arc(x, gy + 10 * s, 7 * s, .15 * Math.PI, .85 * Math.PI); inkS(c, 2.5);
    }
    if (o.flower) { for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + 6 * s + Math.cos(i / 5 * TAU) * 6 * s, base - 152 * s + Math.sin(i / 5 * TAU) * 6 * s, 5 * s, 0, TAU); c.fillStyle = K.pinkL; c.fill(); inkS(c, 1.5); } c.beginPath(); c.arc(x + 6 * s, base - 152 * s, 3.5 * s, 0, TAU); c.fillStyle = K.yel; c.fill(); }
  }
  function awning(c, x, y, w, h, a, b, n) {
    const sw = w / n;
    for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo(x + i * sw, y); c.lineTo(x + (i + 1) * sw, y); c.lineTo(x + (i + 1) * sw, y + h); c.arc(x + (i + .5) * sw, y + h, sw / 2, 0, Math.PI); c.closePath(); c.fillStyle = i % 2 ? b : a; c.fill(); inkS(c, 3); }
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); inkS(c, 4);
  }
  function vinylRec(c, x, y, R, lab) {
    c.beginPath(); c.arc(x, y, R, 0, TAU); c.fillStyle = '#1c1826'; c.fill(); inkS(c, 3);
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; for (let k = .45; k < .95; k += .12) { c.beginPath(); c.arc(x, y, R * k, 0, TAU); c.stroke(); }
    c.beginPath(); c.arc(x, y, R * .33, 0, TAU); c.fillStyle = lab || K.pink; c.fill(); inkS(c, 2);
    c.fillStyle = INK; c.beginPath(); c.arc(x, y, 2.5, 0, TAU); c.fill();
  }

  // ---------- sky + paper fields ----------
  function skyGrad(c, stops, y1) { const g = c.createLinearGradient(0, 0, 0, y1 || HZ); for (const s of stops) g.addColorStop(s[0], s[1]); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  function nightStars(c, E, n, y1) {
    const r = E.r;
    for (let i = 0; i < n; i++) { const x = r() * W, y = Math.pow(r(), 1.4) * (y1 || HZ - 80), s = r() < .1 ? 2.4 : r() < .35 ? 1.6 : 1; c.fillStyle = `rgba(255,250,235,${.3 + r() * .6})`; c.fillRect(x, y, s, s); if (r() < .12) E.A.stars.push([x + s / 2, y + s / 2, 2 + r() * 3, r() * 10]); }
  }
  function doodleScatter(c, E, n, zones, cols, smin, smax) {
    const r = E.r;
    for (let i = 0; i < n; i++) { const z = zones[(r() * zones.length) | 0]; doodle(c, r, z[0] + r() * (z[2] - z[0]), z[1] + r() * (z[3] - z[1]), smin + r() * (smax - smin), cols); }
  }

  // =============================================================================================
  // KIND PAINTERS
  // =============================================================================================
  const KIND = {};

  // ---- ALLEY: pastel-sunset street party in a graffiti alley ----
  KIND.alley = function (E, c) {
    const r = E.r, A = E.A;
    skyGrad(c, [[0, '#a48be0'], [.35, '#e69ad2'], [.62, '#ffb0b8'], [.85, '#ffcf9e'], [1, '#ffe6a8']]);
    splat(c, r, 150, 70, 150, K.pinkL, { a: .55, dots: 380 }); splat(c, r, 1150, 80, 140, K.limeL, { a: .5, dots: 360 }); splat(c, r, 640, 30, 110, '#c8b4ff', { a: .4 });
    // sticker sun with a sleepy smile, sinking behind the rooftops
    const sx = 905 + (r() - .5) * 40, sy = 205;
    soft(c, '#fff0a0', sx, sy, 170, 170, .55);
    c.beginPath(); c.arc(sx, sy, 72, 0, TAU); c.fillStyle = '#ffd84a'; c.fill(); inkS(c, 4);
    c.save(); c.beginPath(); c.arc(sx, sy, 72, 0, TAU); c.clip(); c.fillStyle = 'rgba(255,138,42,.35)'; c.beginPath(); c.arc(sx + 20, sy + 30, 70, 0, TAU); c.fill(); c.restore();
    c.beginPath(); c.arc(sx - 24, sy - 8, 10, Math.PI * 1.1, Math.PI * 1.9); c.moveTo(sx + 34, sy - 8); c.arc(sx + 24, sy - 8, 10, Math.PI * 1.1, Math.PI * 1.9); inkS(c, 3.5);
    c.beginPath(); c.arc(sx, sy + 12, 16, .2 * Math.PI, .8 * Math.PI); inkS(c, 3.5);
    c.fillStyle = rgba(K.pink, .45); c.beginPath(); c.ellipse(sx - 40, sy + 12, 10, 6, 0, 0, TAU); c.ellipse(sx + 40, sy + 12, 10, 6, 0, 0, TAU); c.fill();
    cloudToon(c, 330, 120, 1.1, '#fff4f4', 'rgba(230,150,200,.45)'); cloudToon(c, 1110, 205, .8, '#fff4f4', 'rgba(230,150,200,.45)');
    A.clouds.push({ img: cloudSprite(.8, '#fff6f8', 'rgba(220,150,210,.4)'), x: 200, y: 30, sp: 6 });
    // far skyline (washed pastel, low contrast behind the fighters)
    const fcols = ['#c7a7e8', '#f2b0c8', '#a8dcc8', '#ffc8a0', '#b4c8f0'];
    let x = 150;
    while (x < 1140) { const w = 90 + r() * 70, h = 150 + r() * 120; bldg(c, r, x, HZ + 2, w, h, mixh(pick(r, fcols), '#ffd8d0', .25), { lw: 3, roof: pick(r, ['tank', 'dome', 'ant', null, null]), A, antCol: pick(r, [K.pink, K.cyan, K.lime]), on: .42, wlw: 1.5 }); x += w + 4 + r() * 10; }
    c.fillStyle = 'rgba(246,206,226,.28)'; c.fillRect(140, 100, 1010, HZ - 98);
    // bubble "LOOPS" billboard on the skyline roof (upper area, out of the combat band)
    rbox(c, 470, 150, 300, 78, 18, CREAM, 4, .5); c.beginPath(); c.moveTo(510, 228); c.lineTo(510, 262); c.moveTo(730, 228); c.lineTo(730, 262); inkS(c, 5);
    splat(c, r, 520, 175, 40, K.pinkL, { a: .5, dots: 40 }); bubble(c, 'LOOPS', 620, 189, 52, K.lime, { rot: -.03 }); star(c, 755, 160, 13, K.yel, .2);
    // sidewalk + street
    let g = c.createLinearGradient(0, HZ, 0, H); g.addColorStop(0, '#b6a6d4'); g.addColorStop(.4, '#a091c6'); g.addColorStop(1, '#8a7cb4'); c.fillStyle = g; c.fillRect(0, HZ, W, H - HZ);
    c.fillStyle = '#e0d0ec'; c.fillRect(0, HZ, W, 26); c.beginPath(); c.moveTo(0, HZ); c.lineTo(W, HZ); c.moveTo(0, HZ + 26); c.lineTo(W, HZ + 26); inkS(c, 3);
    c.strokeStyle = 'rgba(80,60,120,.25)'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < W; i += 64) { c.moveTo(i, HZ); c.lineTo(i - 10, HZ + 26); } c.stroke();
    groundPersp(c, HZ + 26, H, 640, 300, 9, 'rgba(70,50,110,.12)', 2);
    c.fillStyle = '#ffe07a'; for (let i = 0; i < 9; i++) { const dx = 640 + (i - 4) * 150; c.save(); c.translate(dx, 640); c.beginPath(); rrp(c, -40, -6, 80, 12, 6); c.fill(); inkS(c, 2.5); c.restore(); }
    // chalk/spray doodles on the street front
    splat(c, r, 260, 690, 90, K.pinkL, { a: .45, dots: 160 }); splat(c, r, 1020, 680, 80, K.limeL, { a: .45, dots: 140 });
    doodleScatter(c, E, 9, [[30, 560, 600, 715], [700, 560, 1250, 715]], [K.pink, K.lime, K.cyan, K.yel], 10, 18);
    // LEFT brick wall with graffiti
    bricks(c, r, 0, 40, 205, HZ - 40, '#f3a0c0'); c.beginPath(); c.moveTo(205, 40); c.lineTo(205, HZ); c.moveTo(0, 40); c.lineTo(205, 40); inkS(c, 4);
    splat(c, r, 90, 150, 70, K.limeL, { a: .7, drips: 4 }); bubble(c, 'ROXOR', 100, 140, 40, K.lime, { rot: -.12 });
    heart(c, 160, 250, 16, K.pink); cat(c, 60, 270, 22); star(c, 40, 80, 12, K.yel); dashes(c, 165, 95, -.6, 30, K.lime);
    marker(c, 'LIVE LOVE LOOP', 106, 330, 16, INK, -.08); smiley(c, 150, 380, 18, K.yel);
    // RIGHT brick wall (lavender) with neon signs
    bricks(c, r, 1090, 30, 190, HZ - 30, '#c4aef0'); c.beginPath(); c.moveTo(1090, 30); c.lineTo(1090, HZ); c.moveTo(1090, 30); c.lineTo(1280, 30); inkS(c, 4);
    splat(c, r, 1200, 330, 60, K.pinkL, { a: .65, drips: 3 }); loopSym(c, 1205, 330, 26, INK, 4);
    neon(c, E, 'LIVE', 1185, 110, 46, K.cyan); neon(c, E, 'BAR', 1180, 225, 34, K.pink, { board: '#2a1f40' });
    heart(c, 1120, 285, 12, K.lime); star(c, 1255, 270, 11, K.yel); sparkle(c, 1130, 380, 10, '#fff', 2);
    // lamp posts with stickers
    lampPost(c, r, A, 232, HZ + 40, 170, '#58c8d8', '#ffe2a0'); lampPost(c, r, A, 1060, HZ + 40, 180, '#f08ab8', '#ffe2a0');
    // speaker stacks at the edges
    speakerCab(c, r, A, 12, 340, 120, 110); speakerCab(c, r, A, 22, 450, 110, 120, { cones: 1 });
    speakerCab(c, r, A, 1148, 340, 120, 110); speakerCab(c, r, A, 1158, 450, 110, 120, { cones: 1 });
    // bunting + bulbs across the top
    wire(A, 0, 26, 1280, 34, 52, 22, 'flag', [K.pink, K.lime, K.cyan, K.yel, K.lav]);
    wire(A, 205, 60, 1090, 52, 70, 18, 'bulb', ['#ffe08a', K.pinkL, '#bff3ff', K.limeL]);
    A.emit.push({ x: 72, y: 330, n: 4, rise: 200, spr: ['notePink', 'noteCyan', 'heart'] }, { x: 1208, y: 330, n: 4, rise: 200, spr: ['noteLime', 'notePink', 'star'] });
    A.conf = { n: 26, cols: [K.pink, K.lime, K.cyan, K.yel, K.lav] };
    A.twk.push([sx - 60, sy - 70, 9, 1, '#fff'], [sx + 80, sy - 40, 7, 3, '#fff'], [620, 140, 8, 2, '#fff'], [40, 200, 7, 4, '#fff']);
  };

  // ---- DESERT: sunny festival in the desert ----
  KIND.desert = function (E, c) {
    const r = E.r, A = E.A;
    skyGrad(c, [[0, '#62c4ea'], [.45, '#a8e4f0'], [.8, '#ffeaa8'], [1, '#ffc97a']]);
    splat(c, r, 1180, 60, 150, K.pinkL, { a: .45, dots: 360 }); splat(c, r, 700, 40, 110, '#fff2a0', { a: .5 }); splat(c, r, 60, 260, 110, K.limeL, { a: .35 });
    // sun with sunglasses (rays rotate per frame)
    const sx = 170, sy = 115;
    const rays = mk(320, 320), rc = rays.getContext('2d');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; rc.save(); rc.translate(160, 160); rc.rotate(a); rc.beginPath(); rc.moveTo(-14, -84); rc.quadraticCurveTo(0, -150, 14, -84); rc.closePath(); rc.fillStyle = i % 2 ? '#ffb43a' : '#ffe066'; rc.fill(); rc.lineWidth = 3.5; rc.lineJoin = 'round'; rc.strokeStyle = INK; rc.stroke(); rc.restore(); }
    A.sunRays = { img: rays, x: sx, y: sy };
    c.beginPath(); c.arc(sx, sy, 78, 0, TAU); c.fillStyle = '#ffd23a'; c.fill(); inkS(c, 4.5);
    c.save(); c.beginPath(); c.arc(sx, sy, 78, 0, TAU); c.clip(); c.fillStyle = 'rgba(255,138,42,.35)'; c.beginPath(); c.arc(sx + 26, sy + 34, 78, 0, TAU); c.fill(); c.restore();
    c.fillStyle = INK; c.beginPath(); rrp(c, sx - 52, sy - 22, 46, 30, 12); rrp(c, sx + 6, sy - 22, 46, 30, 12); c.fill(); c.fillRect(sx - 8, sy - 18, 16, 6);
    c.fillStyle = 'rgba(127,208,232,.8)'; c.fillRect(sx - 44, sy - 16, 10, 5); c.fillRect(sx + 14, sy - 16, 10, 5);
    c.beginPath(); c.arc(sx, sy + 18, 22, .15 * Math.PI, .85 * Math.PI); inkS(c, 4);
    cloudToon(c, 560, 95, 1, '#ffffff', 'rgba(127,208,232,.35)'); cloudToon(c, 1020, 70, .8, '#ffffff', 'rgba(127,208,232,.35)');
    A.clouds.push({ img: cloudSprite(.7, '#ffffff', 'rgba(127,208,232,.35)'), x: 700, y: 8, sp: 5 });
    // distant dunes + bubbly mesas
    c.fillStyle = '#f7c0a8'; c.beginPath(); c.moveTo(0, HZ); for (let i = 0; i <= 8; i++) c.quadraticCurveTo(i * 160 - 80, HZ - 50 - r() * 30, i * 160, HZ - 20); c.lineTo(W, HZ + 5); c.lineTo(0, HZ + 5); c.fill();
    const mesa = (x0, x1, top, col) => { c.beginPath(); c.moveTo(x0, HZ + 4); c.quadraticCurveTo(x0 + 20, top + 10, x0 + 50, top); c.lineTo(x1 - 50, top); c.quadraticCurveTo(x1 - 20, top + 10, x1, HZ + 4); c.closePath(); c.fillStyle = col; c.fill(); c.save(); c.clip(); c.fillStyle = mixh(col, '#d0605a', .3); for (let y = top + 22; y < HZ; y += 26) c.fillRect(x0, y, x1 - x0, 7); c.restore(); inkS(c, 3.5); };
    mesa(-30, 300, 285, '#f4a07a'); mesa(950, 1310, 270, '#f29a86'); mesa(240, 420, 345, '#f6b490');
    // big striped festival tent
    const tx = 640, eave = 252, peak = 120, tw = 250;
    c.beginPath(); c.moveTo(tx - tw, eave); c.quadraticCurveTo(tx - 90, peak + 60, tx, peak); c.quadraticCurveTo(tx + 90, peak + 60, tx + tw, eave); c.closePath(); c.save(); c.clip();
    for (let i = -6; i < 6; i++) { c.fillStyle = i % 2 ? '#ff9cc6' : '#fff4e6'; c.beginPath(); c.moveTo(tx, peak); c.lineTo(tx + i * 48, eave + 4); c.lineTo(tx + (i + 1) * 48, eave + 4); c.closePath(); c.fill(); }
    c.restore(); c.beginPath(); c.moveTo(tx - tw, eave); c.quadraticCurveTo(tx - 90, peak + 60, tx, peak); c.quadraticCurveTo(tx + 90, peak + 60, tx + tw, eave); inkS(c, 4);
    // tent walls (pastel, calm) and the stage opening
    rbox(c, tx - tw + 20, eave, tw * 2 - 40, HZ - eave + 8, 4, '#ffe2ec', 4);
    c.save(); c.beginPath(); c.rect(tx - tw + 20, eave, tw * 2 - 40, HZ - eave); c.clip(); c.fillStyle = 'rgba(240,106,160,.18)'; for (let i = 0; i < 12; i++) c.fillRect(tx - tw + 20 + i * 42, eave, 20, HZ); c.restore();
    rbox(c, tx - 170, eave + 30, 340, HZ - eave - 22, 22, '#9a84d6', 4);
    let g = c.createLinearGradient(0, eave + 30, 0, HZ); g.addColorStop(0, 'rgba(255,240,180,.35)'); g.addColorStop(1, 'rgba(255,240,180,0)'); c.fillStyle = g; c.fillRect(tx - 166, eave + 34, 332, HZ - eave - 30);
    for (let i = 0; i < 5; i++) { const lx = tx - 120 + i * 60; c.beginPath(); c.arc(lx, eave + 44, 7, 0, TAU); c.fillStyle = [K.pink, K.yel, K.cyan, K.lime, K.pink][i]; c.fill(); inkS(c, 2.5); A.glows.push([lx, eave + 44, 30, [K.pink, K.yel, K.cyan, K.lime, K.pink][i], .35, 2 + i]); }
    awning(c, tx - tw, eave - 6, tw * 2, 14, K.lime, K.yel, 14);
    bubble(c, 'LOOPS FEST', tx, eave - 50, 34, K.pink, { rot: -.02 });
    // pennant on the tent peak
    c.beginPath(); c.moveTo(tx, peak); c.lineTo(tx, peak - 46); inkS(c, 4); c.beginPath(); c.moveTo(tx, peak - 46); c.lineTo(tx + 40, peak - 36); c.lineTo(tx, peak - 26); c.closePath(); c.fillStyle = K.lime; c.fill(); inkS(c, 3);
    // sand ground
    g = c.createLinearGradient(0, HZ, 0, H); g.addColorStop(0, '#ffe0a0'); g.addColorStop(.5, '#ffd38a'); g.addColorStop(1, '#f6b870'); c.fillStyle = g; c.fillRect(0, HZ, W, H - HZ);
    c.beginPath(); c.moveTo(0, HZ); c.lineTo(W, HZ); inkS(c, 3);
    c.strokeStyle = 'rgba(214,130,70,.35)'; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const y = HZ + 30 + r() * (H - HZ - 30), x0 = r() * W, L = 60 + r() * 140 * (y / H); c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(x0 + L / 2, y - 8, x0 + L, y); c.stroke(); }
    splat(c, r, 200, 690, 100, K.pinkL, { a: .4, dots: 160 }); splat(c, r, 1080, 700, 90, K.org, { a: .3, dots: 140 }); splat(c, r, 640, 720, 120, K.limeL, { a: .25, dots: 100 });
    for (let i = 0; i < 40; i++) { const x = r() * W, y = HZ + 120 + r() * 180; c.fillStyle = mixh('#c08050', '#ffffff', r() * .4); c.beginPath(); c.ellipse(x, y, 2 + r() * 4, 1.5 + r() * 2, 0, 0, TAU); c.fill(); }
    doodleScatter(c, E, 7, [[20, 590, 560, 715], [760, 600, 1260, 715]], [K.pink, K.lime, K.cyan, K.yel], 10, 16);
    // cacti: small mid ones, big cool ones at the edges
    cactus(c, 330, HZ + 18, .42, { flower: 1 }); cactus(c, 960, HZ + 20, .48, { col: '#6cc96a' });
    cactus(c, 75, 600, 1.15, { glasses: 1, flower: 1 });
    // lemonade stand on the right edge
    const lx = 1060, lb = 520;
    rbox(c, lx + 10, lb - 190, 10, 190, 4, '#fff4e6', 3); rbox(c, lx + 190, lb - 190, 10, 190, 4, '#fff4e6', 3);
    awning(c, lx - 6, lb - 200, 222, 20, K.yel, '#fffaf0', 7);
    rbox(c, lx, lb - 92, 210, 92, 8, '#ffe066', 4, .7); rbox(c, lx - 6, lb - 100, 222, 14, 5, '#ff9cc6', 3.5);
    marker(c, 'LEMONADE', lx + 105, lb - 52, 24, INK, -.04); heart(c, lx + 30, lb - 20, 8, K.pink, 2); star(c, lx + 180, lb - 22, 9, K.lime, .2, 2);
    // pitcher + cups
    rbox(c, lx + 30, lb - 140, 36, 42, 10, 'rgba(255,240,140,.95)', 3); c.beginPath(); c.arc(lx + 70, lb - 120, 10, -Math.PI / 2, Math.PI / 2); inkS(c, 3);
    for (let i = 0; i < 3; i++) { rbox(c, lx + 100 + i * 28, lb - 124, 20, 26, 5, i % 2 ? K.pinkL : K.limeL, 3); }
    A.twk.push([lx + 44, lb - 132, 7, 1, '#fff'], [lx + 150, lb - 128, 6, 2.5, '#fff']);
    // bunting garlands from poles to tent peak
    rbox(c, 34, 150, 14, HZ - 150 + 20, 6, '#ff9cc6', 4, .6); rbox(c, 1238, 140, 14, 210, 6, '#a6e65a', 4, .6);
    star(c, 41, 140, 16, K.yel); star(c, 1245, 130, 16, K.pink);
    wire(A, 41, 150, tx, peak - 4, 50, 14, 'flag', [K.pink, K.yel, K.cyan, K.lime, K.org]);
    wire(A, tx, peak - 4, 1245, 140, 50, 14, 'flag', [K.lime, K.pink, K.yel, K.cyan, K.lav]);
    A.balloons = { n: 7, cols: [K.pink, K.lime, K.cyan, K.yel, K.lav, K.org] };
    A.emit.push({ x: tx, y: eave + 70, n: 4, rise: 230, spread: 120, spr: ['notePink', 'noteLime', 'heart', 'star'] });
    A.conf = { n: 16, cols: [K.pink, K.lime, K.cyan, K.yel] };
  };

  // ---- FOUNDRY: backstage warehouse ----
  KIND.foundry = function (E, c) {
    const r = E.r, A = E.A;
    // back wall: corrugated panels in dusty lavender
    let g = c.createLinearGradient(0, 0, 0, HZ); g.addColorStop(0, '#5a4f8a'); g.addColorStop(.35, '#8a80bc'); g.addColorStop(1, '#a49ccc'); c.fillStyle = g; c.fillRect(0, 0, W, HZ);
    for (let x = 0; x < W; x += 18) { c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x, 90, 6, HZ - 90); c.fillStyle = 'rgba(30,20,60,.1)'; c.fillRect(x + 10, 90, 4, HZ - 90); }
    for (const y of [210, 330]) { c.fillStyle = 'rgba(30,20,60,.25)'; c.fillRect(0, y, W, 4); }
    // spray-paint splats on the wall (edges + top)
    splat(c, r, 330, 150, 90, K.pinkL, { a: .55, drips: 4 }); splat(c, r, 980, 140, 80, K.limeL, { a: .55, drips: 4 }); splat(c, r, 640, 150, 70, K.cyan, { a: .3, drips: 2 });
    marker(c, 'BACKSTAGE', 640, 150, 40, INK, -.03); dashes(c, 820, 130, -.4, 34, K.pink); dashes(c, 460, 130, Math.PI + .4, 34, K.lime);
    // taped gig posters
    const poster = (x, y, w, h, bg, txt, col, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot); rbox(c, -w / 2, -h / 2, w, h, 6, bg, 3.5, .4);
      splat(c, r, -w * .2, -h * .2, w * .35, col, { a: .5, dots: 30 }); bubble(c, txt, 0, -h * .12, w * .26, col, { white: '#fff' }); star(c, w * .3, h * .3, 8, K.yel, 0, 2); heart(c, -w * .28, h * .3, 7, K.pink, 2);
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(-12, -h / 2 - 6, 24, 10); c.restore();
    };
    poster(300, 270, 90, 120, CREAM, 'LIVE', K.pink, -.06); poster(410, 255, 80, 104, '#d8f5b0', 'LOOP', K.lime, .05); poster(870, 265, 86, 112, '#ffe0ee', 'JAM!', K.cyan, .04);
    // dressing-room door with a star
    rbox(c, 960, 210, 100, HZ - 206, 8, '#c4b8e8', 4, .6); rbox(c, 972, 222, 76, 80, 6, '#d8ceff', 3);
    star(c, 1010, 262, 26, K.yel, .1, 3.5); marker(c, 'ROXOR', 1010, 264, 13, INK); c.beginPath(); c.arc(1046, 330, 5, 0, TAU); c.fillStyle = K.yel; c.fill(); inkS(c, 2);
    // ceiling + truss with stage cans
    c.fillStyle = '#2a2448'; c.fillRect(0, 0, W, 92); c.beginPath(); c.moveTo(0, 92); c.lineTo(W, 92); inkS(c, 3);
    for (let i = 0; i < 9; i++) { c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(i * 150, 0, 70, 92); }
    const ty = 58;
    rbox(c, -10, ty - 12, W + 20, 8, 3, '#d4d8ea', 3); rbox(c, -10, ty + 14, W + 20, 8, 3, '#d4d8ea', 3);
    c.beginPath(); for (let x = 0; x < W; x += 24) { c.moveTo(x, ty - 4); c.lineTo(x + 12, ty + 14); c.lineTo(x + 24, ty - 4); } inkS(c, 2.5, '#9aa0c0');
    const cans = [[260, K.pink], [470, K.cyan], [810, K.lime], [1020, K.pink]];
    for (const [cx, col] of cans) {
      c.beginPath(); c.moveTo(cx, ty + 20); c.lineTo(cx, ty + 30); inkS(c, 4);
      c.save(); c.translate(cx, ty + 44); rbox(c, -16, -16, 32, 34, 8, '#2a2638', 4, .5); c.beginPath(); c.ellipse(0, 18, 14, 6, 0, 0, TAU); c.fillStyle = mixh(col, '#ffffff', .5); c.fill(); inkS(c, 2.5); c.restore();
      A.beams.push({ x: cx, y: ty + 62, ang: (cx < 640 ? -.35 : .35), amp: .35, sp: .35 + r() * .2, ph: r() * 6, col, a: .32, len: 560 });
      A.glows.push([cx, ty + 64, 26, col, .5, 3]);
    }
    // hanging cable loops from truss to speaker tops
    const cable = (x1, y1, x2, y2, s, col, lw) => { c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + s, x2, y2); inkS(c, lw + 4); inkS(c, lw, col); };
    cable(120, ty + 18, 330, ty + 18, 70, '#3a3650', 5); cable(150, ty + 18, 250, ty + 18, 40, K.pinkD, 4); cable(960, ty + 18, 1180, ty + 18, 80, '#3a3650', 5); cable(1050, ty + 18, 1150, ty + 18, 46, K.cyanD, 4);
    // floor: warm stage boards with gaffer tape marks
    g = c.createLinearGradient(0, HZ, 0, H); g.addColorStop(0, '#b98a6a'); g.addColorStop(1, '#94684c'); c.fillStyle = g; c.fillRect(0, HZ, W, H - HZ);
    c.strokeStyle = 'rgba(60,30,30,.25)'; c.lineWidth = 2; c.beginPath(); for (let y = HZ + 14, k = 14; y < H; k *= 1.18, y += k) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
    groundPersp(c, HZ, H, 640, 200, 10, 'rgba(60,30,30,.18)', 2);
    c.beginPath(); c.moveTo(0, HZ); c.lineTo(W, HZ); inkS(c, 3);
    const tape = (x, y, col, s) => { c.save(); c.translate(x, y); for (const a of [.6, -.6]) { c.rotate(a); c.fillStyle = col; c.fillRect(-16 * s, -3.5 * s, 32 * s, 7 * s); c.rotate(-a); } c.restore(); };
    tape(420, 470, K.pinkL, 1); tape(860, 476, K.limeL, 1); tape(640, 600, '#ffe066', 1.4); tape(300, 660, K.cyan, 1.3);
    // setlist taped at the front
    c.save(); c.translate(640, 690); c.rotate(-.04); rbox(c, -60, -30, 120, 70, 4, '#ffffff', 3); marker(c, 'SETLIST', 0, -14, 16, INK); squig(c, -40, 2, 80, K.pink, 2.5); squig(c, -40, 16, 60, K.lime, 2.5); c.restore();
    // floor cables snaking at the front
    for (const [col, y0] of [['#2a2638', 620], [K.pinkD, 650], [K.cyanD, 700]]) { c.beginPath(); c.moveTo(-10, y0); c.bezierCurveTo(300, y0 - 60, 500, y0 + 50, 760, y0 - 10); c.bezierCurveTo(950, y0 - 50, 1100, y0 + 40, 1290, y0 - 20); inkS(c, 10); inkS(c, 6, col); }
    // speaker walls on both edges
    for (const side of [0, 1]) {
      const bx = side ? 1060 : 0, w = 220;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) speakerCab(c, r, A, bx + 4 + i * (w / 2), 122 + j * 132, w / 2 - 8, 124, { cones: 2 });
      // amp head with blinking LEDs on top
      rbox(c, bx + 20, 92, w - 40, 30, 6, '#3a3650', 4, .5); for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(bx + 44 + k * 26, 107, 5, 0, TAU); c.fillStyle = '#9aa0c0'; c.fill(); inkS(c, 2); }
      A.leds.push([bx + 30, 100, side ? K.cyan : K.pink, 1 + side], [bx + w - 30, 100, K.lime, 3 + side]);
    }
    // flight cases with stickers (front, out of the combat band)
    const fcase = (x, y, w, h) => { rbox(c, x, y, w, h, 8, '#c9cde0', 4, .9); c.fillStyle = '#2a2638'; c.fillRect(x + 2, y + h * .48, w - 4, 6); for (const [sx, sy] of [[x, y], [x + w - 18, y], [x, y + h - 18], [x + w - 18, y + h - 18]]) { rbox(c, sx, sy, 18, 18, 4, '#3a3650', 2.5); } for (let i = 0; i < 4; i++) stickerBadge(c, r, x + 24 + r() * (w - 48), y + 16 + r() * (h - 32), 10 + r() * 5); };
    fcase(150, 560, 170, 100); fcase(990, 570, 160, 96); fcase(1020, 520, 110, 54);
    A.motes = { n: 26 };
    A.emit.push({ x: 110, y: 200, n: 3, rise: 140, spr: ['notePink', 'noteCyan'] }, { x: 1170, y: 200, n: 3, rise: 140, spr: ['noteLime', 'star'] });
  };

  // ---- MARKET: school hall / market stalls in cream + pastel ----
  KIND.market = function (E, c) {
    const r = E.r, A = E.A;
    c.fillStyle = CREAM; c.fillRect(0, 0, W, HZ);
    // poster-style spray clouds of pink & lime
    for (const [x, y, R, col] of [[90, 60, 150, K.pinkL], [1200, 90, 150, K.limeL], [420, 20, 110, K.limeL], [880, 30, 120, K.pinkL], [40, 330, 110, K.limeL], [1250, 330, 120, K.pinkL]]) splat(c, r, x, y, R, col, { a: .55, dots: 260, drips: r() < .5 ? 3 : 0 });
    // tall windows with sky
    for (let i = 0; i < 4; i++) {
      const wx = 320 + i * 170, wy = 40;
      rbox(c, wx, wy, 120, 150, 60, '#bfeaf6', 4);
      c.save(); c.beginPath(); rrp(c, wx, wy, 120, 150, 60); c.clip(); cloudToon(c, wx + 40 + r() * 40, wy + 90, .45, '#ffffff', null); c.restore();
      c.beginPath(); c.moveTo(wx + 60, wy); c.lineTo(wx + 60, wy + 150); c.moveTo(wx, wy + 90); c.lineTo(wx + 120, wy + 90); inkS(c, 4, '#b79ae8'); c.beginPath(); rrp(c, wx, wy, 120, 150, 60); inkS(c, 4);
    }
    // hanging banner with the act's name
    c.beginPath(); c.moveTo(380, 196); c.lineTo(380, 182); c.moveTo(900, 196); c.lineTo(900, 182); inkS(c, 3);
    rbox(c, 380, 194, 520, 56, 14, '#ffffff', 4); c.beginPath(); rrp(c, 388, 200, 504, 44, 10); inkS(c, 3, K.lime);
    bubble(c, 'ROXORLOOPS', 560, 220, 30, K.lime, { white: false }); bubble(c, '& JASMIN', 748, 222, 30, K.pink, { white: false });
    star(c, 380, 196, 14, K.lime); star(c, 900, 248, 13, K.pink); heart(c, 905, 196, 10, K.pink);
    // wall doodles at the top/edges
    doodleScatter(c, E, 12, [[20, 20, 300, 170], [980, 20, 1260, 170], [300, 196, 360, 240]], [K.pink, K.lime, K.cyan, K.yel], 10, 18);
    marker(c, 'SKOLE KONCERT', 1150, 200, 22, INK, -.1); c.beginPath(); c.moveTo(1060, 222); c.quadraticCurveTo(1150, 212, 1240, 214); inkS(c, 4, K.pink);
    // pastel lower wall (wainscot) with a stripe
    rbox(c, -10, 318, W + 20, HZ - 318 + 10, 0, '#c8eea0', 4); c.fillStyle = '#ffc0d8'; c.fillRect(0, 330, W, 10); c.beginPath(); c.moveTo(0, 330); c.lineTo(W, 330); c.moveTo(0, 340); c.lineTo(W, 340); inkS(c, 2.5);
    c.strokeStyle = 'rgba(63,143,26,.18)'; c.lineWidth = 2; c.beginPath(); for (let x = 40; x < W; x += 80) { c.moveTo(x, 350); c.lineTo(x, HZ); } c.stroke();
    // gym floor
    let g = c.createLinearGradient(0, HZ, 0, H); g.addColorStop(0, '#f0d2a0'); g.addColorStop(1, '#dcae74'); c.fillStyle = g; c.fillRect(0, HZ, W, H - HZ);
    c.strokeStyle = 'rgba(150,90,40,.2)'; c.lineWidth = 2; c.beginPath(); for (let y = HZ + 12, k = 12; y < H; k *= 1.16, y += k) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
    groundPersp(c, HZ, H, 640, 220, 12, 'rgba(150,90,40,.14)', 1.5);
    c.lineWidth = 6; c.strokeStyle = rgba(K.lime, .7); c.beginPath(); c.ellipse(640, 640, 300, 70, 0, Math.PI * 1.03, Math.PI * 1.97); c.stroke();
    c.strokeStyle = rgba(K.pink, .65); c.beginPath(); c.moveTo(0, 470); c.lineTo(W, 470); c.stroke(); c.beginPath(); c.arc(640, 690, 36, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(0, HZ); c.lineTo(W, HZ); inkS(c, 3);
    splat(c, r, 160, 700, 80, K.pinkL, { a: .35, dots: 120 }); splat(c, r, 1120, 700, 80, K.limeL, { a: .35, dots: 120 });
    // stalls at both edges
    const stall = (x, w, a, b, sign, goods) => {
      rbox(c, x + 6, 250, 12, 230, 4, '#fff4e6', 3); rbox(c, x + w - 18, 250, 12, 230, 4, '#fff4e6', 3);
      awning(c, x - 6, 236, w + 12, 26, a, b, 6);
      rbox(c, x, 420, w, 100, 10, mixh(a, '#ffffff', .25), 4, .7);
      marker(c, sign, x + w / 2, 470, 26, INK, -.05);
      goods(x, w);
    };
    stall(-10, 250, K.pinkL, '#fffaf0', 'MERCH', (x, w) => {
      vinylRec(c, x + 60, 395, 26, K.lime); vinylRec(c, x + 110, 392, 28, K.pink);
      for (let i = 0; i < 2; i++) { const tx = x + 70 + i * 80, ty = 300; c.beginPath(); c.moveTo(tx - 24, ty); c.lineTo(tx + 24, ty); c.lineTo(tx + 36, ty + 14); c.lineTo(tx + 26, ty + 22); c.lineTo(tx + 24, ty + 56); c.lineTo(tx - 24, ty + 56); c.lineTo(tx - 26, ty + 22); c.lineTo(tx - 36, ty + 14); c.closePath(); c.fillStyle = i ? '#15101c' : K.cyan; c.fill(); inkS(c, 3); smiley(c, tx, ty + 30, 10, K.yel, 2); }
      c.beginPath(); c.moveTo(x + 20, 300); c.lineTo(x + 230, 300); inkS(c, 3);
    });
    stall(1040, 250, K.limeL, '#fffaf0', 'SNACKS', (x, w) => {
      for (let i = 0; i < 3; i++) { const cx = x + 60 + i * 60; rbox(c, cx - 16, 386, 32, 26, 6, [K.pinkL, '#fff2b8', K.lav][i], 3); puff(c, [[cx, 380, 15], [cx - 9, 384, 10], [cx + 9, 384, 10]], ['#fff6fa', '#ffd0e4', '#d8fbb8'][i], 3); c.beginPath(); c.arc(cx, 366, 5, 0, TAU); c.fillStyle = '#ff4a6a'; c.fill(); inkS(c, 2); }
      rbox(c, x + 180, 290, 50, 70, 10, '#ffe066', 3); marker(c, '2kr', x + 205, 325, 16, INK);
    });
    // string lights
    wire(A, 0, 12, 640, 20, 60, 14, 'bulb', ['#ffe08a', K.pinkL, K.limeL, '#bff3ff']);
    wire(A, 640, 20, 1280, 12, 60, 14, 'bulb', ['#ffe08a', K.pinkL, K.limeL, '#bff3ff']);
    wire(A, 260, 238, 1040, 238, 22, 20, 'flag', [K.pink, K.lime, K.yel, K.cyan], { sz: .7 });
    A.emit.push({ x: 120, y: 360, n: 3, rise: 180, spr: ['heart', 'notePink'] }, { x: 1160, y: 360, n: 3, rise: 180, spr: ['noteLime', 'star'] });
    A.conf = { n: 18, cols: [K.pink, K.lime, K.cyan, K.yel] };
    A.twk.push([360, 70, 8, 1, '#fff'], [700, 60, 7, 2, '#fff'], [1030, 90, 8, 3, '#fff']);
  };

  // ---- NIGHT: navy club rooftop with cyan+pink neon ----
  KIND.night = function (E, c) {
    const r = E.r, A = E.A;
    skyGrad(c, [[0, '#0d1024'], [.4, '#14182b'], [.78, '#2a2552'], [1, '#4a3274']]);
    soft(c, K.pinkD, 220, 330, 360, 120, .28); soft(c, K.cyanD, 1060, 320, 360, 120, .25); soft(c, '#6a4ac0', 640, 380, 500, 110, .25);
    nightStars(c, E, 200, 330);
    splat(c, r, 120, 60, 110, '#3a2a70', { a: .5, dots: 200 });
    for (let i = 0; i < 8; i++) star(c, 60 + r() * 1160, 20 + r() * 150, 5 + r() * 5, pick(r, ['#ffe08a', K.pinkL, '#bff3ff']), r(), 2);
    // disco-ball moon
    const mx = 1000 + (r() - .5) * 60, my = 115, R = 62;
    soft(c, '#b4a8ff', mx, my, 190, 190, .35);
    c.save(); c.beginPath(); c.arc(mx, my, R, 0, TAU); c.clip();
    for (let j = -6; j <= 6; j++) for (let i = -7; i <= 7; i++) {
      const lat = j / 6.5 * Math.PI / 2, y = my + Math.sin(lat) * R, h = R * Math.PI / 13 * Math.cos(lat) + 1, wC = Math.cos(lat) * R;
      const lon = i / 7 * Math.PI / 2, x = mx + Math.sin(lon) * wC, w = wC * Math.PI / 15 * Math.cos(lon) + 1;
      const lv = .55 + .45 * Math.cos(lon + .6) * Math.cos(lat + .5) + (r() - .5) * .25;
      c.fillStyle = mixh('#3a3a6a', r() < .1 ? K.pinkL : r() < .1 ? '#bff3ff' : '#f4f2ff', Math.max(0, Math.min(1, lv))); c.fillRect(x - w / 2, y - h / 2, w - 1, h - 1);
    }
    c.restore(); c.beginPath(); c.arc(mx, my, R, 0, TAU); inkS(c, 4);
    c.beginPath(); c.moveTo(mx, my - R); c.lineTo(mx, 0); inkS(c, 3, '#9aa0c0');
    A.disco = { x: mx, y: my, R };
    // equalizer skyline: animated each frame (windows via a pattern)
    const wp = mk(20, 22), wc = wp.getContext('2d'); wc.fillStyle = '#252554'; wc.fillRect(0, 0, 20, 22); wc.fillStyle = 'rgba(255,224,138,.55)'; wc.fillRect(5, 6, 6, 8); wc.fillStyle = 'rgba(191,243,255,.25)'; wc.fillRect(13, 6, 4, 8);
    A.skyEq = { pat: c.createPattern(wp, 'repeat'), base: 404, n: 30, w: 38, gap: 5.6 };
    c = E.layer(); // everything below is in front of the animated skyline
    // rooftop parapet
    rbox(c, -10, 392, W + 20, 34, 4, '#2c2a56', 4, .6); c.fillStyle = rgba(K.cyan, .85); c.fillRect(0, 398, W, 3);
    A.glows.push([320, 399, 120, K.cyan, .18, 1.2], [960, 399, 120, K.cyan, .18, 1.6]);
    // floor: dark dance tiles in perspective
    let g = c.createLinearGradient(0, HZ, 0, H); g.addColorStop(0, '#22244a'); g.addColorStop(1, '#151733'); c.fillStyle = g; c.fillRect(0, 426, W, H - 426);
    const rows = [426, 450, 482, 524, 580, 650, 740], vx = 640, vy = 250, cols = 14;
    const tx = (k, y) => vx + (k - cols / 2) * (W / cols) * 1.6 * (y - vy) / (H - vy);
    c.strokeStyle = 'rgba(120,130,220,.25)'; c.lineWidth = 2; c.beginPath();
    for (const y of rows) { c.moveTo(0, y); c.lineTo(W, y); }
    for (let k = 0; k <= cols; k++) { c.moveTo(tx(k, 426), 426); c.lineTo(tx(k, H), H); }
    c.stroke();
    for (let j = 3; j < rows.length - 1; j++) for (let k = 0; k < cols; k++) {
      const xc = (tx(k, rows[j]) + tx(k + 1, rows[j])) / 2; if (xc > 260 && xc < 1020 && j < 5) continue;
      if (r() < .55) A.tiles.push([tx(k, rows[j]), tx(k + 1, rows[j]), tx(k + 1, rows[j + 1]), tx(k, rows[j + 1]), rows[j], rows[j + 1], pick(r, [K.pink, K.cyan, K.lime, K.lav]), r() * 50]);
    }
    soft(c, K.pink, 140, 520, 160, 40, .2); soft(c, K.cyan, 1150, 520, 160, 40, .2);
    // left: water tower with LOOPS neon sign
    const wx = 70;
    c.beginPath(); c.moveTo(wx - 40, 392); c.lineTo(wx - 30, 300); c.moveTo(wx + 40, 392); c.lineTo(wx + 30, 300); c.moveTo(wx - 36, 360); c.lineTo(wx + 36, 330); inkS(c, 5, '#4a4680');
    rbox(c, wx - 50, 220, 100, 90, 20, '#3e3a72', 4, .6); c.beginPath(); c.moveTo(wx - 60, 222); c.quadraticCurveTo(wx, 170, wx + 60, 222); c.closePath(); c.fillStyle = '#4a4688'; c.fill(); inkS(c, 4);
    neon(c, E, 'LOOPS', 150, 150, 40, K.pink, { board: '#1d1838' });
    // right: LIVE sign scaffold + speaker
    c.beginPath(); c.moveTo(1180, 392); c.lineTo(1180, 270); c.moveTo(1260, 392); c.lineTo(1260, 270); inkS(c, 5, '#4a4680');
    neon(c, E, 'LIVE', 1220, 250, 40, K.cyan, { board: '#1d1838' });
    speakerCab(c, r, A, 1170, 470, 100, 150, { body: '#24223e' }); speakerCab(c, r, A, 14, 480, 100, 140, { body: '#24223e' });
    // tiny doodle stickers on the parapet edges
    stickerBadge(c, r, 220, 408, 11); stickerBadge(c, r, 1100, 410, 11); smiley(c, 260, 409, 9, K.yel, 2);
    wire(A, 0, 30, 640, 60, 50, 13, 'bulb', [K.pinkL, '#bff3ff', K.limeL, '#ffe08a'], { lw: 2 });
    wire(A, 640, 60, 1280, 20, 50, 13, 'bulb', [K.pinkL, '#bff3ff', K.limeL, '#ffe08a'], { lw: 2 });
    A.beams.push({ x: 120, y: 720, ang: .45, amp: .4, sp: .3, ph: 0, col: K.pink, a: .16, len: 760 }, { x: 1160, y: 720, ang: -.45, amp: .4, sp: .27, ph: 2, col: K.cyan, a: .16, len: 760 });
    A.emit.push({ x: 1220, y: 470, n: 4, rise: 220, spr: ['noteCyan', 'notePink', 'star'] }, { x: 64, y: 480, n: 3, rise: 220, spr: ['notePink', 'heart'] });
    A.shoot = true;
  };

  // ---- CAMP: cosy night rooftop with a tent, fairy lights, speaker & vinyl ----
  KIND.camp = function (E, c) {
    const r = E.r, A = E.A;
    skyGrad(c, [[0, '#121838'], [.45, '#24285a'], [.8, '#4a3e80'], [1, '#7a5e9a']]);
    soft(c, '#8a6ac0', 640, 380, 600, 120, .35); soft(c, K.pinkD, 200, 120, 220, 120, .15);
    nightStars(c, E, 260, 360);
    for (let i = 0; i < 10; i++) star(c, 40 + r() * 1200, 15 + r() * 170, 4 + r() * 5, pick(r, ['#ffe08a', '#fff4c0', K.pinkL]), r(), 2);
    // sleepy crescent moon
    const mx = 1080, my = 105;
    soft(c, '#fff0b0', mx, my, 130, 130, .3);
    c.beginPath(); c.arc(mx, my, 50, Math.PI * .35, Math.PI * 1.65); c.quadraticCurveTo(mx - 6, my, mx + 50 * Math.cos(Math.PI * .35), my + 50 * Math.sin(Math.PI * .35)); c.closePath();
    c.fillStyle = '#fff1a8'; c.fill(); inkS(c, 4);
    c.beginPath(); c.arc(mx - 26, my - 4, 6, .1 * Math.PI, .9 * Math.PI); inkS(c, 3); c.fillStyle = rgba(K.pink, .55); c.beginPath(); c.ellipse(mx - 30, my + 12, 6, 4, 0, 0, TAU); c.fill();
    marker(c, 'z', mx + 30, my - 40, 18, '#fff4c0'); marker(c, 'z', mx + 46, my - 62, 24, '#fff4c0');
    // distant cosy city
    let x = -20;
    while (x < W) { const w = 60 + r() * 70, h = 50 + r() * 90; bldg(c, r, x, 392, w, h, mixh('#3a3672', '#4a3e80', r()), { lw: 2.5, lit: ['#ffe08a', '#ffc070', K.pinkL], dark: '#2c2a5c', on: .35, wlw: 0, rad: 10 }); x += w + 6; }
    // rooftop parapet with planters
    rbox(c, -10, 384, W + 20, 36, 4, '#5a4a7e', 4, .6);
    for (const px of [560, 1010]) { rbox(c, px - 30, 360, 60, 30, 6, '#ff9cc6', 3.5, .6); puff(c, [[px - 14, 352, 13], [px + 8, 348, 15], [px + 22, 356, 9]], '#6cc22e', 3, 'rgba(63,143,26,.5)'); }
    // deck floor
    let g = c.createLinearGradient(0, HZ, 0, H); g.addColorStop(0, '#7a5a7a'); g.addColorStop(1, '#5a4060'); c.fillStyle = g; c.fillRect(0, 420, W, H - 420);
    c.strokeStyle = 'rgba(30,15,40,.3)'; c.lineWidth = 2; c.beginPath(); for (let y = 432, k = 12; y < H; k *= 1.2, y += k) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
    groundPersp(c, 420, H, 640, 220, 10, 'rgba(30,15,40,.18)', 2);
    c.beginPath(); c.moveTo(0, 420); c.lineTo(W, 420); inkS(c, 3);
    soft(c, '#ffb060', 800, 560, 360, 120, .22);
    // striped rug on the left (under the chair, clear of the fire spot)
    c.save(); c.beginPath(); c.ellipse(400, 600, 230, 54, 0, 0, TAU); c.clip(); for (let i = 0; i < 12; i++) { c.fillStyle = mixh([K.pinkL, '#fff4e6', K.lav, '#bff3ff'][i % 4], '#6a4a70', .35); c.fillRect(170 + i * 40, 540, 40, 130); } c.restore();
    c.beginPath(); c.ellipse(400, 600, 230, 54, 0, 0, TAU); inkS(c, 3.5);
    // tent (warm glow inside)
    const tx = 210, tb = 470, tp = 240;
    c.beginPath(); c.moveTo(tx - 170, tb); c.quadraticCurveTo(tx - 90, tp + 80, tx, tp); c.quadraticCurveTo(tx + 90, tp + 80, tx + 170, tb); c.closePath(); c.save(); c.clip();
    for (let i = -5; i < 5; i++) { c.fillStyle = i % 2 ? '#ff9cc6' : '#fff0e0'; c.beginPath(); c.moveTo(tx, tp); c.lineTo(tx + i * 40, tb + 4); c.lineTo(tx + (i + 1) * 40, tb + 4); c.closePath(); c.fill(); } c.restore();
    c.beginPath(); c.moveTo(tx - 170, tb); c.quadraticCurveTo(tx - 90, tp + 80, tx, tp); c.quadraticCurveTo(tx + 90, tp + 80, tx + 170, tb); c.closePath(); inkS(c, 4);
    c.beginPath(); c.moveTo(tx, tp + 40); c.quadraticCurveTo(tx - 50, tb - 40, tx - 70, tb); c.lineTo(tx + 70, tb); c.quadraticCurveTo(tx + 50, tb - 40, tx, tp + 40); c.closePath();
    g = c.createRadialGradient(tx, tb - 30, 5, tx, tb - 30, 110); g.addColorStop(0, '#fff2b0'); g.addColorStop(.6, '#ffb860'); g.addColorStop(1, '#e8806a'); c.fillStyle = g; c.fill(); inkS(c, 3.5);
    puff(c, [[tx - 30, tb - 14, 16], [tx + 22, tb - 12, 18]], K.limeL, 3, 'rgba(63,143,26,.35)');
    A.glows.push([tx, tb - 40, 130, '#ffb860', .35, 1, 1]);
    c.beginPath(); c.moveTo(tx, tp); c.lineTo(tx, tp - 30); inkS(c, 4); c.beginPath(); c.moveTo(tx, tp - 30); c.lineTo(tx + 30, tp - 22); c.lineTo(tx, tp - 14); c.closePath(); c.fillStyle = K.lime; c.fill(); inkS(c, 3);
    // cushions + beanbag
    puff(c, [[60, 640, 34], [100, 650, 28]], K.lav, 3.5, 'rgba(90,60,140,.35)'); puff(c, [[1000, 650, 30], [1040, 640, 24]], K.limeL, 3.5, 'rgba(63,143,26,.35)');
    puff(c, [[560, 690, 40], [600, 680, 36], [630, 700, 30]], K.pinkL, 3.5, 'rgba(214,58,130,.3)');
    // crate + turntable + speaker on the right
    rbox(c, 1040, 470, 150, 90, 6, '#d8a06a', 4, .6); c.strokeStyle = 'rgba(90,50,30,.4)'; c.lineWidth = 3; c.beginPath(); c.moveTo(1040, 500); c.lineTo(1190, 500); c.moveTo(1040, 530); c.lineTo(1190, 530); c.stroke();
    for (let i = 0; i < 3; i++) stickerBadge(c, r, 1060 + r() * 110, 485 + r() * 60, 10);
    rbox(c, 1046, 446, 138, 26, 6, '#3a3650', 4, .5);
    c.save(); c.translate(1100, 452); c.scale(1, .32); vinylRec(c, 0, 0, 44, K.pink); c.restore();
    c.beginPath(); c.moveTo(1170, 448); c.lineTo(1160, 440); c.lineTo(1124, 452); inkS(c, 3, '#c9cde0');
    A.vinyl = { x: 1100, y: 452, R: 44 };
    speakerCab(c, r, A, 1196, 380, 80, 180, { cones: 2 });
    // fairy lights: parapet + tent apex to the right pole
    rbox(c, 1236, 190, 12, 200, 5, '#c9a0e0', 3.5, .6); star(c, 1242, 182, 14, K.yel);
    wire(A, tx, tp - 20, 1242, 196, 70, 22, 'bulb', ['#ffe08a', K.pinkL, '#bff3ff', K.limeL, '#ffcf7a']);
    wire(A, 390, 388, 790, 388, 10, 10, 'bulb', ['#ffe08a', K.pinkL, '#ffcf7a'], { lw: 2 });
    wire(A, 790, 388, 1190, 388, 10, 10, 'bulb', ['#ffe08a', '#bff3ff', '#ffcf7a'], { lw: 2 });
    A.emit.push({ x: 1236, y: 400, n: 4, rise: 220, spr: ['notePink', 'noteCyan', 'heart'], spread: 30 }, { x: 1110, y: 430, n: 2, rise: 160, spr: ['noteLime'], spread: 20 });
    A.flies = { n: 16 };
    A.shoot = true;
  };

  // ---------- colour grade: paper grain, overspray stipple, combat-band veil, soft vignette ----------
  const GRADE = {
    alley: { grain: .55, veil: '#cbb2e0', veilA: .2, vig: '#6a3a8a', vigA: .28, dots: [K.pink, K.lime, '#fff'] },
    desert: { grain: .5, veil: '#ffe2c0', veilA: .18, vig: '#c0604a', vigA: .22, dots: [K.pink, K.org, '#fff'] },
    foundry: { grain: .5, veil: '#9a90c8', veilA: .2, vig: '#20183a', vigA: .4, dots: [K.pink, K.lime, K.cyan] },
    market: { grain: .65, veil: '#f0e4d4', veilA: .2, vig: '#a07a9a', vigA: .22, dots: [K.pink, K.lime] },
    night: { grain: .3, veil: '#2a2a5a', veilA: .2, vig: '#05061a', vigA: .5, dots: [K.pink, K.cyan] },
    camp: { grain: .3, veil: '#4a3e78', veilA: .12, vig: '#05061a', vigA: .45, dots: ['#ffe08a', K.pinkL] }
  };
  let GRAIN = null;
  function grainTex() {
    if (GRAIN) return GRAIN;
    const r = mkRng(4242);
    GRAIN = pixCanvas(256, 256, (i, j, o) => { let v = 238 + (r() - .5) * 26; if (r() < .012) v -= 60 + r() * 50; if ((i * 7 + j * 3) % 97 === 0 && r() < .3) v -= 20; o[0] = v; o[1] = v * .985; o[2] = v * .96; });
    return GRAIN;
  }
  function grade(c, E, kind) {
    const G = GRADE[kind], r = E.r;
    c.save();
    // combat-band veil: compresses contrast where the fighters stand
    c.setTransform(1, 0, 0, .3, 0, 385 * .7);
    let g = c.createRadialGradient(650, 385, 40, 650, 385, 600); g.addColorStop(0, rgba(G.veil, G.veilA)); g.addColorStop(.7, rgba(G.veil, G.veilA * .6)); g.addColorStop(1, rgba(G.veil, 0));
    c.fillStyle = g; c.fillRect(0, -1200, W, 3000); c.setTransform(1, 0, 0, 1, 0, 0);
    // overspray stipple everywhere (spray-zine texture)
    stipple(c, r, 0, 0, W, H, G.dots, 900, .25);
    // paper grain
    c.globalCompositeOperation = 'multiply'; c.globalAlpha = G.grain; c.fillStyle = c.createPattern(grainTex(), 'repeat'); c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    // soft tinted vignette
    g = c.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 900); g.addColorStop(0, rgba(G.vig, 0)); g.addColorStop(1, rgba(G.vig, G.vigA)); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.restore();
  }

  // ---------- floating sprites (notes, hearts, stars) ----------
  let SPRS = null;
  function sprites() {
    if (SPRS) return SPRS;
    const one = (fn) => { const p = mk(56, 56), x = p.getContext('2d'); fn(x); return p; };
    const outlineNote = (col) => one(x => { x.save(); x.translate(1.5, 1.5); note(x, 16, 40, 20, INK); x.restore(); note(x, 16, 40, 20, INK); x.save(); x.translate(-1, -1); note(x, 16, 40, 17.5, col); x.restore(); });
    SPRS = {
      notePink: outlineNote(K.pink), noteCyan: outlineNote(K.cyan), noteLime: outlineNote(K.lime),
      heart: one(x => heart(x, 28, 30, 17, K.pink, 3.5)),
      star: one(x => star(x, 28, 29, 21, K.yel, 0, 3.5))
    };
    return SPRS;
  }
  const BEAM = {};
  function beamImg(col) {
    if (BEAM[col]) return BEAM[col];
    const s = mk(140, 640), x = s.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, rgba(mixh(col, '#ffffff', .4), .9)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.beginPath(); x.moveTo(62, 0); x.lineTo(78, 0); x.lineTo(140, 640); x.lineTo(0, 640); x.closePath(); x.fill();
    return (BEAM[col] = blurred(s, 4));
  }

  // ---------- build ----------
  function fontsReady() { try { return !document.fonts || (document.fonts.check(`800 20px ${FDF}`) && document.fonts.check(`20px ${FMF}`)); } catch (e) { return true; } }
  function build(kind, seed) {
    const k = KIND[kind] ? kind : 'alley';
    const rs = hashStr(k + ':' + seed);
    const E = { seed: rs, r: mkRng(rs), A: { kind: k, stars: [], neon: [], wires: [], glows: [], beams: [], spk: [], emit: [], clouds: [], twk: [], tiles: [], leds: [] } };
    const p = mk(W, H), c = p.getContext('2d');
    E.layer = () => { E.front = mk(W, H); return E.front.getContext('2d'); };
    KIND[k](E, c);
    if (E.front) c.drawImage(E.front, 0, 0);
    grade(c, E, k);
    if (E.front) { // graded copy of the foreground layer, drawn over animated mid-layers each frame
      const f = mk(W, H), fc = f.getContext('2d'); fc.drawImage(p, 0, 0); fc.globalCompositeOperation = 'destination-in'; fc.drawImage(E.front, 0, 0);
      E.A.frontImg = f;
    }
    for (const b of E.A.beams) b.img = beamImg(b.col);
    sprites();
    p.anim = E.A; p.lampOn = false; p.glow = '255,200,230'; p.provisional = !fontsReady();
    return p;
  }

  // ---------- per-frame animation (cheap: baked sprites + a few paths) ----------
  function flick(t, ph) {
    const a = Math.sin(t * 1.7 + ph) * Math.sin(t * 2.9 + ph * 1.3);
    if (a > .93) return Math.sin(t * 57 + ph) > 0 ? .2 : .8;
    return .9 + .1 * Math.sin(t * 13 + ph);
  }
  function animate(c, A, t) {
    const bt = beat(t);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // drifting cartoon clouds
    for (const cl of A.clouds) { const span = W + cl.img.width * 2, x = ((cl.x + t * cl.sp) % span) - cl.img.width; c.drawImage(cl.img, x, cl.y); }
    // rotating sun rays (drawn under the baked sun? the sun disc is baked, so rays peek out around it)
    if (A.sunRays) { const s = A.sunRays; c.translate(s.x, s.y); c.rotate(t * .12); c.drawImage(s.img, -160, -160); c.rotate(-t * .12); c.translate(-s.x, -s.y); sunCap(c, s); }
    // star twinkle (night kinds)
    if (A.stars.length) {
      c.fillStyle = '#fff8e0';
      for (const s of A.stars) { const a = .5 + .5 * Math.sin(t * (1.3 + s[3] * .2) + s[3] * 7); if (a < .6) continue; c.globalAlpha = (a - .5) * 1.8; c.fillRect(s[0] - s[2], s[1] - .75, s[2] * 2, 1.5); c.fillRect(s[0] - .75, s[1] - s[2], 1.5, s[2] * 2); }
      c.globalAlpha = 1;
    }
    if (A.shoot) {
      const per = 9, k = Math.floor(t / per), u = (t - k * per) / 1.1;
      if (u > 0 && u < 1) {
        const x0 = 300 + hh(k) * 700, y0 = 30 + hh(k + 3) * 100, x = x0 - u * 280, y = y0 + u * 100;
        c.strokeStyle = `rgba(255,240,200,${(1 - u) * .9})`; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 90, y - 32); c.stroke();
        c.globalAlpha = 1 - u; c.fillStyle = '#fff8d0'; sparkP(c, x, y, 7); c.fill(); c.globalAlpha = 1;
      }
    }
    // disco moon: rotating light specks + glints
    if (A.disco) {
      const d = A.disco;
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 26; i++) {
        const a = hh(i) * TAU + t * (.15 + hh(i + 9) * .1), rr = d.R * 1.6 + hh(i + 4) * 520, x = d.x + Math.cos(a) * rr, y = d.y + Math.sin(a) * rr * .45 + 60;
        if (y > 380 || y < 0) continue;
        c.globalAlpha = .25 + .25 * Math.sin(t * 2 + i); c.fillStyle = i % 3 === 0 ? K.pinkL : i % 3 === 1 ? '#bff3ff' : '#ffffff'; c.fillRect(x, y, 3, 3);
      }
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) { const k = Math.floor(t * 1.6 + i * .25), u = (t * 1.6 + i * .25) - k, a = hh(k * 4 + i) * TAU, rr = hh(k * 4 + i + 1) * d.R * .85; const s = 9 * Math.sin(u * Math.PI); c.globalAlpha = .95; sparkP(c, d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr, s + 1); c.fill(); }
      c.globalAlpha = 1;
    }
    // equalizer skyline
    if (A.skyEq) {
      const q = A.skyEq; c.fillStyle = q.pat;
      for (let i = 0; i < q.n; i++) {
        const lv = .45 + .35 * Math.abs(Math.sin(t * (.9 + hh(i) * 1.4) + i * 1.3)) + .2 * bt * hh(i + 7), h = 40 + lv * (95 + hh(i + 2) * 55), x = i * (q.w + q.gap) - 4;
        c.fillStyle = q.pat; c.fillRect(x, q.base - h, q.w, h);
        c.fillStyle = i % 2 ? K.cyan : K.pink; c.globalAlpha = .85; c.fillRect(x, q.base - h - 4, q.w, 4); c.globalAlpha = .18; c.fillRect(x - 3, q.base - h - 9, q.w + 6, 12); c.globalAlpha = 1;
      }
    }
    if (A.frontImg) c.drawImage(A.frontImg, 0, 0);
    // spotlights (screen blend, faint so the combat band stays readable)
    if (A.beams.length) {
      c.globalCompositeOperation = 'screen';
      for (const b of A.beams) {
        const a = b.ang + Math.sin(t * b.sp + b.ph) * b.amp, up = b.y > 400;
        c.translate(b.x, b.y); c.rotate(up ? a + Math.PI : a); c.globalAlpha = b.a * (.8 + .4 * bt);
        c.drawImage(b.img, -70 * b.len / 640, 0, 140 * b.len / 640, b.len);
        c.rotate(-(up ? a + Math.PI : a)); c.translate(-b.x, -b.y);
      }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    // night floor tiles light up on the beat
    if (A.tiles.length) {
      c.globalCompositeOperation = 'lighter'; const bi = Math.floor(t * BPM / 60);
      for (const q of A.tiles) { if (hh(bi * 13 + q[7]) < .55) continue; c.globalAlpha = .28 * (.4 + .6 * bt); c.fillStyle = q[6]; c.beginPath(); c.moveTo(q[0], q[4]); c.lineTo(q[1], q[4]); c.lineTo(q[2], q[5]); c.lineTo(q[3], q[5]); c.closePath(); c.fill(); }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    // neon signs
    for (const n of A.neon) {
      const f = flick(t, n.ph);
      c.globalAlpha = f; c.drawImage(n.img, n.x, n.y);
      c.globalCompositeOperation = 'lighter'; dglow(c, n.col, n.gx, n.gy, n.gr, .16 * f); c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = 1;
    // practical lamps
    if (A.glows.length) {
      c.globalCompositeOperation = 'lighter';
      for (const g of A.glows) { const f = g[6] ? 1 + .12 * Math.sin(t * 9) + .07 * Math.sin(t * 23 + 1) : 1 + .15 * Math.sin(t * g[5]); dglow(c, g[3], g[0], g[1], g[2], g[4] * f); }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    // amp LEDs
    for (const l of A.leds) { if (Math.sin(t * 3 * l[3] + l[3]) < .2) continue; c.globalCompositeOperation = 'lighter'; dglow(c, l[2], l[0], l[1], 9, .9); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillStyle = '#fff'; c.fillRect(l[0] - 1.5, l[1] - 1.5, 3, 3); }
    // speaker cones pump on the beat
    for (const s of A.spk) {
      const k = beat(t + s[3] * .05), R = s[2] * (.86 + .14 * k);
      c.beginPath(); c.arc(s[0], s[1], R, 0, TAU); c.fillStyle = '#3e3958'; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.arc(s[0], s[1], R * .38, 0, TAU); c.fillStyle = '#5a5478'; c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(s[0] - R * .12, s[1] - R * .14, R * .1, 0, TAU); c.fill();
      if (k > .55) { c.globalAlpha = (k - .55) * 1.4; c.strokeStyle = K.pinkL; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], s[2] * 1.25 + (1 - k) * 18, -.6, .6); c.stroke(); c.beginPath(); c.arc(s[0], s[1], s[2] * 1.25 + (1 - k) * 18, Math.PI - .6, Math.PI + .6); c.stroke(); c.globalAlpha = 1; }
    }
    // spinning vinyl
    if (A.vinyl) {
      const v = A.vinyl, a = t * 3.4; c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.beginPath();
      for (const o of [0, Math.PI]) { const a0 = a + o; c.moveTo(v.x + Math.cos(a0) * v.R * .5, v.y + Math.sin(a0) * v.R * .5 * .32); c.lineTo(v.x + Math.cos(a0) * v.R * .9, v.y + Math.sin(a0) * v.R * .9 * .32); }
      c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(v.x + Math.cos(a) * v.R * .2, v.y + Math.sin(a) * v.R * .2 * .32, 2, 0, TAU); c.fill();
    }
    // bunting & bulbs
    for (const w of A.wires) drawWire(c, w, t);
    // balloons
    if (A.balloons) {
      const b = A.balloons;
      for (let i = 0; i < b.n; i++) {
        const per = 16 + hh(i) * 8, u = ((t + hh(i + 1) * per) / per) % 1, side = i % 2;
        const x = (side ? 1110 + hh(i + 2) * 150 : 20 + hh(i + 2) * 150) + Math.sin(t * .9 + i) * 14, y = 600 - u * 760;
        if (y < -60) continue;
        c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y + 26); c.quadraticCurveTo(x + Math.sin(t * 2 + i) * 8, y + 46, x, y + 64); c.stroke();
        c.fillStyle = b.cols[i % b.cols.length]; c.beginPath(); c.ellipse(x, y, 20, 25, 0, 0, TAU); c.fill(); c.lineWidth = 3; c.stroke();
        c.beginPath(); c.moveTo(x - 4, y + 29); c.lineTo(x + 4, y + 29); c.lineTo(x, y + 24); c.closePath(); c.fill(); c.lineWidth = 2; c.stroke();
        c.fillStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.ellipse(x - 7, y - 9, 4, 7, -.5, 0, TAU); c.fill();
      }
    }
    // floating notes / hearts / stars rising from emitters
    if (A.emit.length) {
      const S = SPRS || sprites();
      for (let e = 0; e < A.emit.length; e++) {
        const em = A.emit[e];
        for (let i = 0; i < em.n; i++) {
          const id = e * 17 + i, per = 3.2 + hh(id) * 2, u = ((t + hh(id + 1) * per * 3) / per) % 1;
          const x = em.x + (hh(id + 2) - .5) * (em.spread || 60) + Math.sin(t * 2.2 + id) * 12 * u, y = em.y - u * em.rise, s = 22 + hh(id + 3) * 12;
          c.globalAlpha = Math.min(1, u * 5) * (1 - u); const img = S[em.spr[i % em.spr.length]];
          const rot = Math.sin(t * 2 + id) * .25; c.translate(x, y); c.rotate(rot); c.drawImage(img, -s / 2, -s / 2, s, s); c.rotate(-rot); c.translate(-x, -y);
        }
      }
      c.globalAlpha = 1;
    }
    // confetti (fades out over the centre of the combat band)
    if (A.conf) {
      const q = A.conf;
      for (let i = 0; i < q.n; i++) {
        const sp = 40 + hh(i) * 50, y = ((t * sp + hh(i + 1) * 800) % 800) - 40, x = hh(i + 2) * W + Math.sin(t * 1.3 + i) * 24;
        let a = 1; if (x > 150 && x < 1150) a = Math.max(0, 1 - (y - 210) / 70); if (y > 700) a = 0;
        if (a <= 0) continue;
        const rot = t * (2 + hh(i + 3) * 4) + i, sq = Math.cos(t * 5 + i);
        c.globalAlpha = a; c.fillStyle = q.cols[i % q.cols.length]; c.translate(x, y); c.rotate(rot); c.fillRect(-4, -6 * sq, 8, 12 * sq); c.rotate(-rot); c.translate(-x, -y);
      }
      c.globalAlpha = 1;
    }
    // dust motes / glitter in the spotlights (backstage)
    if (A.motes) {
      c.fillStyle = '#fff6e0';
      for (let i = 0; i < A.motes.n; i++) { const x = 180 + hh(i) * 920 + Math.sin(t * .4 + i) * 30, y = 110 + ((hh(i + 1) * 300 + t * (6 + hh(i + 2) * 10)) % 300); c.globalAlpha = .25 + .35 * Math.abs(Math.sin(t * 1.7 + i)); c.fillRect(x, y, 2, 2); }
      c.globalAlpha = 1;
    }
    // fireflies (camp)
    if (A.flies) {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < A.flies.n; i++) {
        const x = (i % 2 ? 40 + hh(i) * 560 : 640 + hh(i) * 600) + Math.sin(t * .7 + i * 2) * 40 + Math.sin(t * 2.3 + i) * 8, y = 250 + hh(i + 1) * 180 + Math.cos(t * .9 + i * 1.3) * 26;
        const a = .5 + .5 * Math.sin(t * 2.5 + i * 3); if (a < .2) continue; dglow(c, '#ffe88a', x, y, 8, a * .8);
      }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    // glitter twinkles
    for (const s of A.twk) { const a = Math.sin(t * 2.4 + s[3] * 2); if (a < .1) continue; c.globalAlpha = a; c.fillStyle = s[4]; sparkP(c, s[0], s[1], s[2] * (.6 + .4 * a)); c.fill(); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
  function sunCap(c, s) { // re-draw the sun face over the rotating rays (cheap path drawing)
    c.beginPath(); c.arc(s.x, s.y, 78, 0, TAU); c.fillStyle = '#ffd23a'; c.fill(); c.lineWidth = 4.5; c.strokeStyle = INK; c.stroke();
    c.fillStyle = 'rgba(255,138,42,.3)'; c.beginPath(); c.arc(s.x + 12, s.y + 16, 58, 0, TAU); c.fill();
    c.fillStyle = INK; c.beginPath(); rrp(c, s.x - 52, s.y - 22, 46, 30, 12); rrp(c, s.x + 6, s.y - 22, 46, 30, 12); c.fill(); c.fillRect(s.x - 8, s.y - 18, 16, 6);
    c.fillStyle = 'rgba(127,208,232,.85)'; c.fillRect(s.x - 44, s.y - 16, 10, 5); c.fillRect(s.x + 14, s.y - 16, 10, 5);
    c.beginPath(); c.arc(s.x, s.y + 18, 22, .15 * Math.PI, .85 * Math.PI); c.lineWidth = 4; c.lineCap = 'round'; c.stroke();
  }
  function drawWire(c, w, t) {
    const sw = Math.sin(t * w.sp + w.ph), sag = w.sag * (1 + sw * .06);
    const cx = (w.x1 + w.x2) / 2 + sw * 8, cy = (w.y1 + w.y2) / 2 + sag * 2;
    c.strokeStyle = INK; c.lineWidth = w.lw; c.beginPath(); c.moveTo(w.x1, w.y1); c.quadraticCurveTo(cx, cy, w.x2, w.y2); c.stroke();
    const z = w.sz;
    for (const it of w.items) {
      const p = quadPt(w.x1, w.y1, cx, cy, w.x2, w.y2, it.u), x = p[0], y = p[1];
      if (it.t === 'flag') {
        const a = Math.sin(t * 2.2 + it.ph) * .16 + sw * .06;
        c.translate(x, y); c.rotate(a);
        c.beginPath(); c.moveTo(-11 * z, 0); c.lineTo(11 * z, 0); c.lineTo(0, 26 * z); c.closePath(); c.fillStyle = it.col; c.fill(); c.lineWidth = 2.5; c.lineJoin = 'round'; c.stroke();
        c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-7 * z, 2, 5 * z, 2.5);
        c.rotate(-a); c.translate(-x, -y);
      } else {
        const tw = .7 + .3 * Math.sin(t * 2.6 + it.ph * 3);
        c.globalCompositeOperation = 'lighter'; dglow(c, it.col, x, y + 7, 20, .5 * tw); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        c.fillStyle = mixh(it.col, '#ffffff', .5 * tw); c.beginPath(); c.ellipse(x, y + 7, 4.5, 6, 0, 0, TAU); c.fill(); c.lineWidth = 1.8; c.stroke();
        c.fillStyle = INK; c.fillRect(x - 2.5, y - 1, 5, 4);
      }
    }
  }
  return { build, animate, PAL: GRADE, fontsReady };
})();

function makeBackdrop(kind, seed = 1) {
  const key = kind + seed, hit = BG_CACHE[key];
  if (hit && !(hit.provisional && ENVART.fontsReady())) return hit;
  const p = ENVART.build(kind, seed);
  if (p.provisional && typeof G !== 'undefined' && G && G.time > 6) p.provisional = false; // offline: keep fallback fonts
  BG_CACHE[key] = p; return p;
}
function drawBackdrop(c, kind, seed, t) {
  const img = typeof SPR !== 'undefined' && SPR.bgs && SPR.bgs[kind];
  if (img) { c.drawImage(img, 0, 0, W, H); const g = c.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 900); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,3,20,.45)'); c.fillStyle = g; c.fillRect(0, 0, W, H); return; }
  const bg = makeBackdrop(kind, seed == null ? 1 : seed); c.drawImage(bg, 0, 0, W, H);
  if (bg.anim) { c.save(); ENVART.animate(c, bg.anim, t || 0); c.restore(); }
}
