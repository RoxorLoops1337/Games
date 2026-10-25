// doodle_fx.js: the DOODLE effects layer (crayon notebook style). Drop-in replacements for the Fx draw methods in fx.js, called as fn(fx, ctx, ...).
// No glow, no additive blending, no gradients, no blur, no bloom, no chromatic fringe, no vignette: effects are flat crayon marks (wobbly rings,
// inked stars, dashed trails, tape-coloured daubs), combat numbers are the kit stroke font with a white halo, and the "post" pass is a paper grain
// overlay plus a red crayon border when the stage is low. Jitter comes from a hash of position and the boil frame (never Math.random or Date).
// Safe in node with a mock ctx (text sprites fall back to live drawing when there is no document).
import * as K from './doodle_kit.js';

const C = K.C, INK = C.ink, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hh = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const frameOf = (f) => Math.floor(f.t * K.BOIL_FPS) % 3;
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const HAND = '"Patrick Hand", "Gochi Hand", "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif';

// a closed wobbly ring path (smoothed through midpoints). seed picks the doodle, fr is the boil frame.
function ringPath(ctx, x, y, rad, seed, fr, amp = 0.07) {
  const n = clamp(Math.round(rad / 3.2), 12, 36), pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, r = rad * (1 + (hh(i * 7.13 + fr * 13.7 + seed) - 0.5) * amp * 2);
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.beginPath(); ctx.moveTo((pts[0] + pts[pts.length - 2]) / 2, (pts[1] + pts[pts.length - 1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2);
  }
  ctx.closePath();
}
function poly(ctx, p) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); }

// ---------------------------------------------------------------------------------------------------- world layer
export function drawWorld(f, ctx) {
  const fr = frameOf(f);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'source-over';
  // 1) light: a pale marker daub on the paper, and light pillars as tall crayon stripes
  for (const L of f.lights) {
    const k = 1 - L.t / L.life;
    ctx.globalAlpha = clamp(L.a * k * 0.3, 0, 0.3); ctx.fillStyle = L.color;
    ringPath(ctx, L.x, L.y, L.r * (0.55 + 0.3 * (1 - k)), L.x * 0.37 + L.y, fr, 0.1); ctx.fill();
  }
  for (const P of f.pillars) {
    const k = P.t / P.life, a = (1 - k) * (k < 0.15 ? k / 0.15 : 1), w = 34 * (1 - k * 0.6);
    const j = (i) => (hh(i + fr * 5.3 + P.x) - 0.5) * 5;
    const top = P.y - P.h, L = P.x - w / 2, Rr = P.x + w / 2;
    ctx.globalAlpha = a * 0.4; ctx.fillStyle = P.color;
    ctx.beginPath(); ctx.moveTo(L + j(1), top + j(2)); ctx.lineTo(Rr + j(3), top + j(4)); ctx.lineTo(Rr + 6 + j(5), P.y + 10); ctx.lineTo(L - 6 + j(6), P.y + 10); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = a * 0.85; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L + j(1), top + j(2)); ctx.lineTo(L - 6 + j(6), P.y + 10); ctx.moveTo(Rr + j(3), top + j(4)); ctx.lineTo(Rr + 6 + j(5), P.y + 10); ctx.stroke();
    ctx.globalAlpha = a * 0.9; ctx.fillStyle = P.color; poly(ctx, K.star(P.x, P.y, 40 * (1 - k * 0.4), 0.5, fr * 0.2)); ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
  }
  // 2) cones: a coloured wedge with a dashed ink edge
  for (const c of f.cones) {
    const k = c.t / c.life, rr = c.range * (0.4 + 0.6 * k);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, rr, c.ang - c.spread, c.ang + c.spread); ctx.closePath();
    ctx.globalAlpha = (1 - k) * 0.32; ctx.fillStyle = c.color; ctx.fill();
    ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
  }
  // 3) beams and chains: ink line, fat crayon line over it, a pale highlight, a daub at each end
  for (const l of f.lines) {
    const k = l.t / l.life, a = 1 - k, pts = [l.pts[0].x, l.pts[0].y];
    for (let i = 1; i < l.pts.length; i++) {
      const A = l.pts[i - 1], B = l.pts[i];
      if (l.zig) pts.push((A.x + B.x) / 2 + (hh(i * 3.1 + fr * 7 + A.x) - 0.5) * 18, (A.y + B.y) / 2 + (hh(i * 5.7 + fr * 9 + A.y) - 0.5) * 18);
      pts.push(B.x, B.y);
    }
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); };
    path(); ctx.globalAlpha = a * 0.9; ctx.strokeStyle = INK; ctx.lineWidth = l.w * 1.15 + 4; ctx.stroke();
    path(); ctx.globalAlpha = a; ctx.strokeStyle = l.color; ctx.lineWidth = l.w * (1 + k * 0.3); ctx.stroke();
    path(); ctx.globalAlpha = a * 0.75; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, l.w * 0.28); ctx.stroke();
    const e = l.pts[l.pts.length - 1];
    ctx.globalAlpha = a; ctx.fillStyle = l.color; ctx.lineWidth = 2.4; ctx.strokeStyle = INK;
    ringPath(ctx, e.x, e.y, 5 + l.w * 0.8, e.x + e.y, fr, 0.12); ctx.fill(); ctx.stroke();
  }
  // 4) trails: dashed crayon ribbon, fading to the tail
  for (const tr of f.trails.values()) {
    const n = tr.pts.length; if (n < 2) continue;
    ctx.strokeStyle = tr.color;
    for (let i = 1; i < n; i++) {
      const A = tr.pts[i - 1], B = tr.pts[i], k = i / n, age = 1 - clamp((f.t - B.t) / 0.22, 0, 1);
      ctx.globalAlpha = k * age * 0.8; ctx.lineWidth = tr.w * k * 1.3;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
  }
  // 5) shockwaves: a wobbly crayon ring in the colour over an ink ring, a second faint ring inside for the big ones
  for (const r of f.rings) {
    const k = r.t / r.life, e = 1 - Math.pow(1 - k, 2.2), rad = r.r0 + (r.r - r.r0) * e, a = 1 - k, seed = r.x * 0.31 + r.y * 0.17;
    if (r.fill) { ctx.globalAlpha = a * 0.22; ctx.fillStyle = r.color; ringPath(ctx, r.x, r.y, rad, seed, fr, 0.05); ctx.fill(); }
    const lw = Math.max(1.5, r.w * (1 - k * 0.6));
    ctx.globalAlpha = a * 0.85; ctx.strokeStyle = INK; ctx.lineWidth = lw + 3.2; ringPath(ctx, r.x, r.y, rad + 1, seed, fr); ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = r.color; ctx.lineWidth = lw; ringPath(ctx, r.x, r.y, rad, seed + 3, fr + 1); ctx.stroke();
    if (r.chroma) { ctx.globalAlpha = a * 0.5; ctx.lineWidth = Math.max(1.5, lw * 0.45); ctx.setLineDash([10, 8]); ringPath(ctx, r.x, r.y, rad * 0.9, seed + 5, fr + 2); ctx.stroke(); ctx.setLineDash([]); }
  }
  // 6) ray bursts: flat coloured wedges and an inked star in the middle
  for (const R of f.rays) {
    const k = R.t / R.life, a = (1 - k) * (k < 0.1 ? k / 0.1 : 1), len = R.r * (0.3 + 0.7 * Math.min(1, k * 3));
    ctx.globalAlpha = a * 0.28; ctx.fillStyle = R.color;
    for (let i = 0; i < R.n; i++) {
      const ang = (i / R.n) * TAU + k * 0.6, w = 0.045 + 0.02 * Math.sin(i * 7.3);
      ctx.beginPath(); ctx.moveTo(R.x, R.y); ctx.lineTo(R.x + Math.cos(ang - w) * len, R.y + Math.sin(ang - w) * len); ctx.lineTo(R.x + Math.cos(ang + w) * len, R.y + Math.sin(ang + w) * len); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = a; ctx.fillStyle = '#fff6c8'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    poly(ctx, K.star(R.x, R.y, R.r * 0.2 * (1 - k * 0.4), 0.5, fr * 0.15, 8)); ctx.fill(); ctx.stroke();
  }
  // 7) particles: three doodle kinds (daub, star, ticks) so a burst reads as scribbled confetti
  const lite = f.parts.length > 220;
  ctx.lineWidth = 1.8; ctx.strokeStyle = INK;
  for (const p of f.parts) {
    const k = p.life / p.max, al = Math.min(1, k * 1.7);
    if (p.shape === 'rect') {
      ctx.globalAlpha = al; ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.x * 0.1 + p.y * 0.07 + f.t * 5); ctx.scale(1, Math.abs(Math.sin(f.t * 9 + p.x)) * 0.8 + 0.2);
      ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); if (!lite) ctx.strokeRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore();
    } else if (p.shape === 'spark') {
      const sp = Math.hypot(p.vx, p.vy), len = Math.min(24, 4 + sp * 0.06), ux = sp ? p.vx / sp : 0, uy = sp ? p.vy / sp : 0;
      ctx.globalAlpha = al; ctx.lineCap = 'round';
      if (!lite) { ctx.strokeStyle = INK; ctx.lineWidth = p.size * 0.9 + 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * len, p.y - uy * len); ctx.stroke(); }
      ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.9 + 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * len, p.y - uy * len); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    } else if (p.shape === 'flare') {
      const r = p.size * (0.6 + 0.8 * k);
      ctx.globalAlpha = al; ctx.fillStyle = p.color; poly(ctx, K.star(p.x, p.y, r * 1.1, 0.4, p.ang || 0, 4)); ctx.fill(); ctx.stroke();
    } else {
      const kind = p.k == null ? 0 : p.k, s = p.size * (1.1 + 0.9 * k);
      ctx.globalAlpha = al; ctx.fillStyle = p.color;
      if (kind === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.8, 0, TAU); ctx.fill(); if (!lite) ctx.stroke(); }
      else if (kind === 1) { poly(ctx, K.star(p.x, p.y, s * 1.25, 0.45, p.x * 0.05)); ctx.fill(); if (!lite) ctx.stroke(); }
      else {
        const a0 = p.x * 0.07 + p.y * 0.03; ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = 0; i < 3; i++) { const an = a0 + i * 2.094; ctx.moveTo(p.x + Math.cos(an) * s * 0.5, p.y + Math.sin(an) * s * 0.5); ctx.lineTo(p.x + Math.cos(an) * s * 1.6, p.y + Math.sin(an) * s * 1.6); }
        ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- combat text (baked stroke font, white halo)
const tcache = new Map(), TMAX = 150;
const coverable = (s) => { for (let i = 0; i < s.length; i++) { const c = s[i]; if (c !== ' ' && !K.GLYPHS[c]) return false; } return true; };
function bakeText(str, size, color, crit) {
  const key = str + '|' + size + '|' + color + '|' + (crit ? 1 : 0) + '|' + K.getScale();
  let e = tcache.get(key);
  if (e) { tcache.delete(key); tcache.set(key, e); return e; }
  const tw = str.length * 5.2 * size / 6, w = Math.ceil(Math.max(tw + size * 1.2 + 14, crit ? size * 3.4 : 0)), h = Math.ceil(crit ? size * 3 : size * 1.7 + 12);
  const draw = (pen, c) => {
    if (crit) {   // a spiky doodle burst behind the number
      const n = 9, ro = size * 1.25;
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU + 0.2, r0 = size * 0.85 + pen.rr(-2, 2), r1 = ro * pen.rr(0.85, 1.1);
        pen.ln([Math.cos(an) * r0 * 1.5, Math.sin(an) * r0 * 0.9, Math.cos(an) * r1 * 1.5, Math.sin(an) * r1 * 0.9], INK, 4.4, false, 0.6);
        pen.ln([Math.cos(an) * r0 * 1.5, Math.sin(an) * r0 * 0.9, Math.cos(an) * r1 * 1.5, Math.sin(an) * r1 * 0.9], color, 2.4, false, 0.4);
      }
    }
    const lw = Math.max(2.2, size * 0.15);
    pen.txt(str, 0, size / 2, size, INK, { align: 'c', out: '#ffffff', ow: 8, w: lw + 3 });
    pen.txt(str, 0, size / 2, size, color, { align: 'c', w: lw });
  };
  e = { w, h, draw };
  const cv = K.makeCanvas(w * K.getScale(), h * K.getScale()), c = cv && cv.getContext && cv.getContext('2d');
  if (c) {
    c.scale(K.getScale(), K.getScale()); c.translate(w / 2, h / 2);
    draw(new K.Pen(c, (str.length * 31 + size * 7 + (crit ? 5 : 0)) | 0 || 1, 1), c);
    e.cv = cv;
  } else e.direct = true;
  tcache.set(key, e);
  if (tcache.size > TMAX) tcache.delete(tcache.keys().next().value);
  return e;
}
export function drawFloaters(f, ctx) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const fl of f.floats) {
    const k = fl.t / fl.life;
    const pop = k < 0.18 ? 0.35 + easeOutBack(k / 0.18) * 0.75 : 1.1 - Math.min(0.12, (k - 0.18) * 0.2);
    const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    let x = fl.x, y = fl.y;
    if (fl.crit && k < 0.3) { x += (fl.seed - 0.5) * 4 * (1 - k / 0.3); y += Math.sin(f.t * 60) * 1.5; }
    const want = fl.size * 1.18, str = String(fl.text).toUpperCase();
    ctx.globalAlpha = a;
    if (coverable(str) && str.length <= 14) {
      const sz = clamp(Math.round(want / 2) * 2, 14, 44), e = bakeText(str, sz, fl.color, fl.crit), s = pop * want / sz;
      if (e.cv) ctx.drawImage(e.cv, x - e.w * s / 2, y - e.h * s / 2, e.w * s, e.h * s);
      else { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); e.draw(new K.Pen(ctx, str.length * 31 + sz * 7, 1), ctx); ctx.restore(); }
    } else {   // characters the stroke font does not have: hand font with a halo
      const size = Math.round(fl.size * pop);
      ctx.font = '700 ' + size + 'px ' + HAND; ctx.lineWidth = Math.max(4, size * 0.34); ctx.strokeStyle = '#fff'; ctx.strokeText(fl.text, x, y);
      ctx.lineWidth = Math.max(2, size * 0.14); ctx.strokeStyle = INK; ctx.strokeText(fl.text, x, y); ctx.fillStyle = fl.color; ctx.fillText(fl.text, x, y);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- full-screen light (aurora) as wavy crayon bands
export function drawScreenLight(f, ctx, W, H) {
  if (!f.auroras.length) return;
  const fr = frameOf(f);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const A of f.auroras) {
    const k = A.t / A.life, a = (1 - k) * Math.min(1, k * 6);
    for (let i = 0; i < 4; i++) {
      const y0 = H * (0.12 + i * 0.22) + Math.sin(A.t * 2.4 + i * 1.7) * 40 + k * 90;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = a * (pass ? 0.8 : 0.3); ctx.strokeStyle = pass ? A.color : INK; ctx.lineWidth = pass ? 12 : 17;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 36) {
          const y = y0 + Math.sin(x * 0.014 + A.t * 3 + i) * 26 + (hh(x * 0.1 + i * 3 + fr * 4 + pass * 9) - 0.5) * 5;
          if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
// speed lines: faint graphite whoosh dashes
export function speedLines(f, ctx, W, H, speed) {
  if (speed < 2) return;
  ctx.save(); ctx.strokeStyle = INK; ctx.lineCap = 'round';
  const n = speed >= 3 ? 14 : 7;
  for (let i = 0; i < n; i++) {
    const k = (f.t * (speed >= 3 ? 2.6 : 1.7) + i * 0.137) % 1, x = ((i * 97.3) % 1) * W, len = 60 + (i % 5) * 24, y = (k * (H + 200)) - 100;
    ctx.globalAlpha = 0.05 + 0.07 * Math.sin(k * Math.PI); ctx.lineWidth = 2 + (i % 3);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y + len); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- post: paper grain and the red crayon border
let grain = null, grainTried = false;
function grainPattern(ctx) {
  if (grainTried) return grain; grainTried = true;
  const cv = K.makeCanvas(128, 128), c = cv && cv.getContext && cv.getContext('2d');
  if (!c || typeof ctx.createPattern !== 'function') return null;
  for (let i = 0; i < 260; i++) {   // fine specks
    c.globalAlpha = 0.05 + hh(i * 1.7) * 0.07; c.fillStyle = hh(i * 3.3) > 0.45 ? '#5a4a3a' : '#ffffff';
    c.fillRect(hh(i * 12.9) * 128, hh(i * 78.2) * 128, 1 + hh(i * 5.1) * 1.4, 1 + hh(i * 9.7) * 1.4);
  }
  c.strokeStyle = '#7a6a52'; c.lineWidth = 0.7;   // a few paper fibres
  for (let i = 0; i < 16; i++) { c.globalAlpha = 0.06; const x = hh(i * 4.4 + 1) * 128, y = hh(i * 6.1 + 2) * 128, a = hh(i * 2.9) * 6.28; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); c.stroke(); }
  grain = ctx.createPattern(cv, 'repeat');
  return grain;
}
// red crayon scribble border around the screen in device px. k 0..1 is the strength.
function redBorder(f, ctx, cw, ch, dpr, k, t) {
  const fr = Math.floor(t * K.BOIL_FPS) % 3, m = 9 * dpr, steps = 18;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = clamp(k, 0, 1) * (pass ? 0.9 : 0.35); ctx.strokeStyle = pass ? C.red : INK; ctx.lineWidth = (pass ? 9 : 14) * dpr * (0.7 + 0.5 * k);
    ctx.beginPath();
    const P = (u, v, i) => [m + u * (cw - 2 * m) + (hh(i * 3.7 + fr * 11 + pass * 5) - 0.5) * 7 * dpr, m + v * (ch - 2 * m) + (hh(i * 9.1 + fr * 7 + pass * 3) - 0.5) * 7 * dpr];
    let i = 0, q = P(0, 0, i++); ctx.moveTo(q[0], q[1]);
    for (let s = 1; s <= steps; s++) { q = P(s / steps, 0, i++); ctx.lineTo(q[0], q[1]); }
    for (let s = 1; s <= steps * 1.7; s++) { q = P(1, s / (steps * 1.7), i++); ctx.lineTo(q[0], q[1]); }
    for (let s = 1; s <= steps; s++) { q = P(1 - s / steps, 1, i++); ctx.lineTo(q[0], q[1]); }
    for (let s = 1; s <= steps * 1.7; s++) { q = P(0, 1 - s / (steps * 1.7), i++); ctx.lineTo(q[0], q[1]); }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}
export function post(f, ctx, o) {
  if (o.stage === 'world') return;   // no bloom, no chromatic fringe
  const cw = o.cw * o.dpr, ch = o.ch * o.dpr;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = grainPattern(ctx);
  if (g) { ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); }
  if (o.hp != null && o.hp < 0.4) {   // low stage health: a pulsing red crayon border (no vignette)
    const k = (0.4 - o.hp) / 0.4, beat = 0.5 + 0.5 * Math.sin(f.t * (3 + k * 4));
    redBorder(f, ctx, cw, ch, o.dpr, 0.35 + 0.5 * k * (0.4 + 0.6 * beat), f.t);
  }
  ctx.restore();
}
// a hit on the stage: a thick red scribble border that fades with the flash value (0..1)
export function hurt(f, ctx, cw, ch, dpr, v) {
  if (v <= 0.01) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); redBorder(f, ctx, cw, ch, dpr, Math.min(1, v * 1.1), f.t); ctx.restore();
}
// full-screen flash: a flat wash of the colour (no radial glow)
export function drawFlash(f, ctx, w, h) {
  if (f.flash <= 0.01) return;
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(0.4, f.flash * 0.5);
  ctx.fillStyle = f.flashColor; ctx.fillRect(0, 0, w, h); ctx.restore();
}
