'use strict';
// ===================== ART: creatures & machines (beasts, blobs, bots) =====================
// Owned by the art_creatures agent. Overrides drawBeast / drawBlob / drawBot from art.js.
// RoxorLoops & Jasmin "vinyl sticker cartoon" pass (see reference/STYLE_BIBLE.md):
//  * every part is queued in a small display list (Path2D + the transform it was built under); flush() then
//    strokes ONE white sticker border around the union silhouette and paints the parts back-to-front
//  * a part = thick even ink outline + flat saturated fill + crisp lower-right shadow crescent + soft puffy
//    light + felt grain + a small white specular highlight (the bubbly-letter look of the logo)
//  * chibi rules: huge glossy eyes (iris gradient, two white highlights), grumpy slanted lids/brows,
//    oversized heads/paws/teeth, stubby legs; playful doodles: hearts, stars, notes, soundwave rings
//  * animation: volume-preserving squash & stretch about the feet, anticipation crouch, lunge + shear,
//    hurt flash/wobble with dizzy stars; secondary motion on ears, tails, antennas, gum bubbles
// Contract: feet at (0,0), facing right; spec {kind, coat, accent, eye, seed, scale, variant};
// pose {t, atk, hurt, noShadow}. noShadow (= sprite export) disables ground shadows & additive glows.
const CRE_ART = (() => {
  const TAU = Math.PI * 2, INK = '#15101c', STK = '#ffffff';
  // palette (pinks kept just under the export magenta key threshold: min(r,b)-g < 45)
  const C = { lime: '#6cc22e', limeL: '#a6e65a', limeD: '#3f8f1a', pink: '#f2709a', pinkL: '#ff9cc6', pinkD: '#d4547c', cyan: '#3fd8e8', cyanD: '#1597b0',
    lav: '#b79ae8', sky: '#7fd0e8', yel: '#ffd23a', org: '#ff8a2a', navy: '#2c3150', cream: '#fff3dc', mouth: '#5c1a34', tongue: '#ff8fb0', silver: '#dcecf4' };
  // colours of the retired dusk palette still present in data.js -> replaced by per-creature defaults
  const LEGACY = new Set(['#8a7968', '#a0623a', '#6c4f3a', '#4a4a52', '#6c9140', '#5d3b6b', '#7d756a', '#35577a', '#7a2b24', '#e3a82a', '#b9362f', '#dd6a2c']);
  const pick = (v, d) => (v && !LEGACY.has(String(v).toLowerCase())) ? v : d;
  let ADD = true, LW = 4.2, BRD = 3.2, FL = 0, CX = null, DL = [];
  const Q = { tex: 1, glaze: 1, bands: 1, border: 1 }; // quality switches (perf tuning)
  const E = {};
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const sm = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
  const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

  // ---------------- colour ----------------
  const PC = {};
  function prgb(col) {
    let v = PC[col]; if (v) return v;
    if (col[0] === '#') { let h = col.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    else { const m = col.match(/[\d.]+/g); v = [+m[0], +m[1], +m[2]]; }
    return (PC[col] = v);
  }
  function mix(a, b, k) { const A = prgb(a), B = prgb(b); return 'rgb(' + (A[0] + (B[0] - A[0]) * k | 0) + ',' + (A[1] + (B[1] - A[1]) * k | 0) + ',' + (A[2] + (B[2] - A[2]) * k | 0) + ')'; }
  function rgba(col, a) { const A = prgb(col); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }
  const TC = {};
  function tones(b) { // FL = hurt flash amount (tints every part toward white)
    const key = b + FL; let T = TC[key]; if (T) return T;
    const B = FL ? mix(b, '#ffffff', FL) : b;
    return (TC[key] = { b: B, sh: mix(B, '#3a2050', .3), lt: mix(B, '#ffffff', .5), dk: mix(B, INK, .45) });
  }
  const shadeOf = (col, k) => mix(col, '#3a2050', k == null ? .25 : k);

  // ---------------- felt grain texture (cached, tiled) ----------------
  let GRAIN = null; const PAT = new WeakMap();
  function grainCanvas() {
    if (GRAIN) return GRAIN;
    const S = 96, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); const r = rng(77);
    for (let i = 0; i < 900; i++) { x.fillStyle = r() < .5 ? `rgba(30,10,40,${.05 + r() * .12})` : `rgba(255,255,255,${.06 + r() * .16})`; x.beginPath(); x.arc(r() * S, r() * S, .5 + r() * 1.1, 0, TAU); x.fill(); }
    return (GRAIN = cv);
  }
  function pat(c) { let p = PAT.get(c); if (!p) { p = c.createPattern(grainCanvas(), 'repeat'); PAT.set(c, p); } return p; }
  function rng(seed) { let s = ((seed * 2654435761) >>> 0) || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  // ---------------- geometry -> Path2D ----------------
  function trace(p, pts) { // smooth closed path through mid-points; [x,y,1] = hard corner
    const n = pts.length, a = pts[n - 1], b = pts[0];
    p.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (let i = 0; i < n; i++) {
      const q = pts[i], r = pts[i + 1 < n ? i + 1 : 0], mx = (q[0] + r[0]) / 2, my = (q[1] + r[1]) / 2;
      if (q[2]) { p.lineTo(q[0], q[1]); p.lineTo(mx, my); } else p.quadraticCurveTo(q[0], q[1], mx, my);
    }
    p.closePath();
  }
  function bbox(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; }
  function pPts(pts) { const p = new Path2D(); trace(p, pts); return { p, bb: bbox(pts) }; }
  function pEll(cx, cy, rx, ry, rot) { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); const m = Math.max(rx, ry), k = rot ? 1 : 0; return { p, bb: [cx - (k ? m : rx), cy - (k ? m : ry), cx + (k ? m : rx), cy + (k ? m : ry)] }; }
  function rrP(x, y, w, h, r) { const p = new Path2D(); r = Math.min(r, w / 2, h / 2); p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); return p; }
  function pRR(x, y, w, h, r) { return { p: rrP(x, y, w, h, r), bb: [x, y, x + w, y + h] }; }
  function cloud(cx, cy, rx, ry, n, amp, rot, a0) { // scalloped fluffy outline
    const p = new Path2D(), cr = Math.cos(rot || 0), sr = Math.sin(rot || 0); a0 = a0 || 0;
    const P = (a, k) => { const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k; return [cx + x * cr - y * sr, cy + x * sr + y * cr]; };
    let q = P(a0, 1); p.moveTo(q[0], q[1]);
    for (let i = 1; i <= n; i++) { const c1 = P(a0 + (i - .5) / n * TAU, 1 + amp), e = P(a0 + i / n * TAU, 1); p.quadraticCurveTo(c1[0], c1[1], e[0], e[1]); }
    p.closePath(); const m = Math.max(rx, ry) * (1 + amp * .5);
    return { p, bb: rot ? [cx - m, cy - m, cx + m, cy + m] : [cx - rx * (1 + amp * .5), cy - ry * (1 + amp * .5), cx + rx * (1 + amp * .5), cy + ry * (1 + amp * .5)] };
  }
  function norm(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
  function tube(cs, ws) { // outline of a tapered tube along a centre line, round caps
    const n = cs.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = cs[i > 0 ? i - 1 : 0], b = cs[i < n - 1 ? i + 1 : n - 1]; let tx = b[0] - a[0], ty = b[1] - a[1]; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
      const w = ws[i] / 2; L.push([cs[i][0] - ty * w, cs[i][1] + tx * w]); R.push([cs[i][0] + ty * w, cs[i][1] - tx * w]);
    }
    const t0 = norm(cs[0], cs[1]), t1 = norm(cs[n - 2], cs[n - 1]);
    return L.concat([[cs[n - 1][0] + t1[0] * ws[n - 1] * .62, cs[n - 1][1] + t1[1] * ws[n - 1] * .62]], R.reverse(), [[cs[0][0] - t0[0] * ws[0] * .62, cs[0][1] - t0[1] * ws[0] * .62]]);
  }
  function starPath(x, y, r, rot, k) { const p = new Path2D(); k = k || .5; for (let i = 0; i < 10; i++) { const a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * k : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) p.lineTo(px, py); else p.moveTo(px, py); } p.closePath(); return p; }
  function heartPath(x, y, r, rot) {
    const h = new Path2D(); h.moveTo(0, r * .95); h.bezierCurveTo(-r * 1.35, 0, -r * .95, -r * 1.15, 0, -r * .38); h.bezierCurveTo(r * .95, -r * 1.15, r * 1.35, 0, 0, r * .95); h.closePath();
    if (!rot && !x && !y) return h; const p = new Path2D(); p.addPath(h, new DOMMatrix().translateSelf(x, y).rotateSelf(rot * 180 / Math.PI)); return p;
  }

  // ---------------- display list ----------------
  function shape(g, fill, o) { DL.push({ k: 0, m: CX.getTransform(), p: g.p, bb: g.bb, f: fill, o: o || E }); }
  function fx(fn) { DL.push({ k: 1, m: CX.getTransform(), fn }); }
  function flush(c) {
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    if (Q.border) { // white vinyl-sticker border around the union of all silhouette parts
      c.strokeStyle = STK;
      for (const d of DL) if (!d.k && d.o.b !== 0) { c.setTransform(d.m); c.globalAlpha = 1; c.lineWidth = (d.o.lw == null ? LW : d.o.lw) * 2 + BRD * 2; c.stroke(d.p); }
    }
    for (const d of DL) { c.setTransform(d.m); c.globalAlpha = 1; c.lineJoin = 'round'; c.lineCap = 'round'; if (d.k) { c.save(); d.fn(c); c.restore(); } else paint(c, d); }
    c.restore(); c.globalAlpha = 1; DL = [];
  }
  // o: lw, b (0 = no sticker border), sh (shadow shift, 0 = flat), soft (0 = no puffy light), inner(c,T,bb), tex (0 = none), texA, spec (size, 0 = none), hx, hy, a, paint(c,d)
  function paint(c, d) {
    const o = d.o; if (o.paint) { c.save(); o.paint(c, d); c.restore(); return; }
    const T = tones(d.f), a = o.a == null ? 1 : o.a, lw = o.lw == null ? LW : o.lw;
    c.globalAlpha = a;
    if (lw > 0) { c.lineWidth = lw * 2; c.strokeStyle = INK; c.stroke(d.p); }
    const x0 = d.bb[0], y0 = d.bb[1], w = d.bb[2] - x0, h = d.bb[3] - y0;
    const s = o.sh == null ? Math.min(w, h) * .13 + 1.5 : o.sh;
    c.fillStyle = s ? T.sh : T.b; c.fill(d.p);
    c.save(); c.clip(d.p);
    if (s) { c.translate(-s * .55, -s); c.fillStyle = T.b; c.fill(d.p); c.translate(s * .55, s); }
    if (o.soft !== 0 && Q.glaze) { const R = Math.max(w, h) * .62, gx = x0 + w * .3, gy = y0 + h * .25, g = c.createRadialGradient(gx, gy, 0, gx, gy, R); g.addColorStop(0, rgba(T.lt, .5)); g.addColorStop(1, rgba(T.lt, 0)); c.fillStyle = g; c.fillRect(x0, y0, w, h); }
    if (o.inner) { c.save(); o.inner(c, T, d.bb); c.restore(); c.globalAlpha = a; }
    if (o.tex !== 0 && Q.tex) { c.globalAlpha = a * (o.texA || .5); c.fillStyle = pat(c); c.fillRect(x0, y0, w, h); c.globalAlpha = a; }
    if (o.spec !== 0) {
      const r = Math.min(w, h) * (o.spec || .09) + .6, sx = x0 + w * (o.hx == null ? .27 : o.hx), sy = y0 + h * (o.hy == null ? .22 : o.hy);
      c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.ellipse(sx, sy, r * 1.3, r * .7, -.65, 0, TAU); c.fill();
      c.beginPath(); c.arc(sx + r * 1.55, sy - r * .95, r * .34, 0, TAU); c.fill();
    }
    c.restore(); c.globalAlpha = 1;
  }

  // ---------------- doodles & small direct-draw pieces ----------------
  function stk(c, path, fill, lw, white) {
    c.lineJoin = c.lineCap = 'round';
    if (white) { c.lineWidth = lw * 2 + BRD * 1.6; c.strokeStyle = STK; c.stroke(path); }
    c.lineWidth = lw * 2; c.strokeStyle = INK; c.stroke(path); c.fillStyle = fill; c.fill(path);
  }
  function glint(c, x, y, r) { c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(x, y, r, r * .6, -.6, 0, TAU); c.fill(); }
  function star(c, x, y, r, col, rot, white) { stk(c, starPath(x, y, r, rot), col, Math.max(1.4, r * .15), white); glint(c, x - r * .2, y - r * .22, r * .17); }
  function heart(c, x, y, r, col, rot, white) { stk(c, heartPath(x, y, r, rot || 0), col, Math.max(1.4, r * .15), white); glint(c, x - r * .4 * Math.cos(rot || 0), y - r * .35, r * .2); }
  function note(c, x, y, s, col, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.lineCap = c.lineJoin = 'round';
    c.beginPath(); c.moveTo(s * .42, 0); c.lineTo(s * .42, -s * 1.5); c.quadraticCurveTo(s * .95, -s * 1.25, s * 1.0, -s * .7);
    c.lineWidth = s * .36; c.strokeStyle = INK; c.stroke(); c.lineWidth = s * .13; c.strokeStyle = col; c.stroke();
    c.beginPath(); c.ellipse(0, 0, s * .52, s * .37, -.4, 0, TAU); c.lineWidth = s * .26; c.strokeStyle = INK; c.stroke(); c.fillStyle = col; c.fill();
    glint(c, -s * .15, -s * .1, s * .14); c.restore();
  }
  function sparkle(c, x, y, r, col) {
    c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.closePath();
    c.lineWidth = Math.max(1.6, r * .22); c.strokeStyle = INK; c.stroke(); c.fillStyle = col || '#fff'; c.fill();
  }
  function waves(c, x, y, ang, k, t, sc) { // soundwave rings ")))" in lime / pink / cyan
    if (k <= .02 || !ADD) return; sc = sc || 1; // FX only in-game (keeps exported sprite cells compact) c.save(); c.lineCap = 'round';
    const cols = [C.cyan, C.pink, C.lime];
    for (let i = 0; i < 3; i++) {
      const ph = (t * 2.2 + i / 3) % 1, r = (12 + ph * 50) * sc, a = Math.min(1, k * 1.5 * (1 - ph * .85)); if (a <= .02) continue;
      const sp = .5 + ph * .3; c.globalAlpha = a;
      c.beginPath(); c.arc(x, y, r, ang - sp, ang + sp); c.lineWidth = 9 * sc; c.strokeStyle = INK; c.stroke(); c.lineWidth = 4.4 * sc; c.strokeStyle = cols[i]; c.stroke();
    }
    c.restore();
  }
  function dashes(c, x, y, k) { // speed lines behind a lunge
    if (k < .12 || !ADD) return; c.save(); c.globalAlpha = Math.min(1, k * 1.5); c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const yy = y + (i - 1) * 18, L = (30 - Math.abs(i - 1) * 8) * k, xx = x - Math.abs(i - 1) * 8; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx - L, yy); c.lineWidth = 7.5; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.4; c.strokeStyle = i === 1 ? C.pink : C.lime; c.stroke(); }
    c.restore();
  }
  function dizzy(c, x, y, t, R) { for (let i = 0; i < 3; i++) { const a = t * 4 + i * TAU / 3; star(c, x + Math.cos(a) * R, y + Math.sin(a) * R * .3, 7.5, i % 2 ? C.yel : C.pinkL, a, true); } }
  function scratches(c, x, y, s, rot) { // doodle fur / scuff marks
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.lineCap = 'round'; c.strokeStyle = 'rgba(21,16,28,.72)'; c.lineWidth = 2.3 * s;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(i * 6 * s, 0); c.quadraticCurveTo(i * 6 * s + 3 * s, -5 * s, i * 6 * s + s, -10 * s); c.stroke(); }
    c.restore();
  }
  function brow(c, x0, y0, x1, y1, w) { c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = INK; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - w * .5, x1, y1); c.stroke(); }
  function blush(c, x, y, rx) { c.fillStyle = 'rgba(255,110,160,.5)'; c.beginPath(); c.ellipse(x, y, rx, rx * .55, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - rx * .3, y - rx * .15, rx * .14, 0, TAU); c.fill(); }
  function puffCloud(c, x, y, r, col, a) { c.save(); c.globalAlpha = a; const p = cloud(x, y, r, r * .8, 6, .35).p; stk(c, p, col, 2); glint(c, x - r * .3, y - r * .3, r * .18); c.restore(); }
  function blink(t, sd) { return Math.pow(Math.max(0, Math.sin(t * 1.15 + sd * 3.1)), 70); }
  // big glossy chibi eye. o: lid (grumpy cover 0..1), tilt (+ = lid lower toward the right), lidCol, look [x,y], blink, shut (+1 '>' / -1 '<')
  function eye(c, x, y, r, iris, o) {
    const lw = Math.max(2.2, r * .17);
    c.lineJoin = c.lineCap = 'round';
    if (o.shut) {
      const d = o.shut; c.strokeStyle = INK; c.lineWidth = lw * 1.5;
      c.beginPath(); c.moveTo(x - r * .7 * d, y - r * .6); c.lineTo(x + r * .55 * d, y); c.lineTo(x - r * .7 * d, y + r * .6); c.stroke(); return;
    }
    const rx = r * .82, ry = r;
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.lineWidth = lw * 2; c.strokeStyle = INK; c.stroke(); c.fillStyle = '#ffffff'; c.fill();
    c.save(); c.clip();
    const lk = o.look || [.35, .1], ir = r * .68, ix = x + lk[0] * r * .2, iy = y + lk[1] * r * .16 + r * .06;
    const g = c.createLinearGradient(0, iy - ir, 0, iy + ir); g.addColorStop(0, mix(iris, INK, .6)); g.addColorStop(.5, iris); g.addColorStop(1, mix(iris, '#ffffff', .55));
    c.beginPath(); c.ellipse(ix, iy, ir * .84, ir, 0, 0, TAU); c.fillStyle = g; c.fill(); c.lineWidth = r * .08; c.strokeStyle = mix(iris, INK, .65); c.stroke();
    c.beginPath(); c.ellipse(ix + ir * .04, iy + ir * .06, ir * .42, ir * .52, 0, 0, TAU); c.fillStyle = INK; c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(ix - ir * .3, iy - ir * .36, ir * .3, ir * .36, -.45, 0, TAU); c.fill();
    c.beginPath(); c.arc(ix + ir * .36, iy + ir * .4, ir * .14, 0, TAU); c.fill();
    const L = Math.min(1, (o.lid || 0) + (o.blink || 0) * 1.2);
    if (L > .01) {
      const tl = (o.tilt == null ? .35 : o.tilt) * (1 - (o.blink || 0)), yl = y - ry + L * ry * 2.05;
      c.beginPath(); c.moveTo(x - rx - 3, y - ry - 3); c.lineTo(x + rx + 3, y - ry - 3); c.lineTo(x + rx + 3, yl + tl * r * .7); c.lineTo(x - rx - 3, yl - tl * r * .7); c.closePath();
      c.fillStyle = o.lidCol || '#888'; c.fill();
      c.beginPath(); c.moveTo(x - rx - 3, yl - tl * r * .7); c.lineTo(x + rx + 3, yl + tl * r * .7); c.lineWidth = lw * 1.3; c.strokeStyle = INK; c.stroke();
    }
    c.restore();
  }
  function googly(c, x, y, r, t, ph, hurt, lid, lidCol) {
    const lw = Math.max(2.4, r * .15);
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.lineWidth = lw * 2; c.strokeStyle = INK; c.stroke(); c.fillStyle = '#ffffff'; c.fill();
    if (hurt) { c.beginPath(); for (let a = 0; a < 12.5; a += .35) { const rr = r * .06 + a / 12.5 * r * .62, px = x + Math.cos(a + t * 6) * rr, py = y + Math.sin(a + t * 6) * rr; if (a) c.lineTo(px, py); else c.moveTo(px, py); } c.lineWidth = lw * .8; c.strokeStyle = INK; c.stroke(); return; }
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    const px = x + (.3 + Math.sin(t * 5.3 + ph) * .28) * r * .42, py = y + (.38 + Math.cos(t * 4.1 + ph) * .2) * r * .42;
    c.beginPath(); c.arc(px, py, r * .5, 0, TAU); c.fillStyle = INK; c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(px - r * .17, py - r * .2, r * .15, r * .12, -.5, 0, TAU); c.fill(); c.beginPath(); c.arc(px + r * .18, py + r * .16, r * .06, 0, TAU); c.fill();
    if (lid) { const yl = y - r + lid * r * 2; c.beginPath(); c.moveTo(x - r - 2, y - r - 2); c.lineTo(x + r + 2, y - r - 2); c.lineTo(x + r + 2, yl + r * .25); c.lineTo(x - r - 2, yl - r * .25); c.closePath(); c.fillStyle = lidCol; c.fill(); c.beginPath(); c.moveTo(x - r - 2, yl - r * .25); c.lineTo(x + r + 2, yl + r * .25); c.lineWidth = lw * 1.2; c.strokeStyle = INK; c.stroke(); }
    c.restore();
    c.beginPath(); c.arc(x - r * .45, y - r * .5, r * .1, 0, TAU); c.fillStyle = 'rgba(255,255,255,.9)'; c.fill();
  }
  function tooth(c, x, y, w, len, col) { // rounded triangle tooth, len<0 points up
    c.beginPath(); c.moveTo(x - w / 2, y); c.quadraticCurveTo(x - w * .32, y + len * .75, x, y + len); c.quadraticCurveTo(x + w * .32, y + len * .75, x + w / 2, y); c.closePath();
    c.fillStyle = col || '#ffffff'; c.fill(); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
  }
  function foot(x, y, rx, ry, col, o) {
    shape(pEll(x, y, rx, ry), col, Object.assign({ sh: 3, spec: .12, inner: c => { c.strokeStyle = 'rgba(21,16,28,.8)'; c.lineWidth = 2.2; for (const k of [.05, .45]) { c.beginPath(); c.moveTo(x + rx * k, y + ry); c.quadraticCurveTo(x + rx * (k + .08), y + ry * .2, x + rx * (k - .02), y - ry * .1); c.stroke(); } } }, o));
  }
  function gShadow(c, x, rx) {
    if (!ADD) return; c.save(); c.translate(x, 1); c.scale(1, .16);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(21,16,28,.36)'); g.addColorStop(.7, 'rgba(21,16,28,.18)'); g.addColorStop(1, 'rgba(21,16,28,0)');
    c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore();
  }
  function glow(c, x, y, r, col, a) {
    if (!ADD || r <= 0) return; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }

  // ---------------- animation ----------------
  function anim(p) {
    const a = p.atk || 0;
    return { t: p.t || 0, a, hurt: p.hurt ? 1 : 0,
      crouch: a <= 0 ? 0 : a < .3 ? sm(a / .3) : sm(1 - (a - .3) / .14),   // anticipation squash
      strike: a < .3 ? 0 : a < .5 ? sm((a - .3) / .2) : sm(1 - (a - .5) / .5) }; // lunge / stretch, peaks at .5
  }
  function begin(c, s, p) {
    CX = c; DL = []; ADD = !p.noShadow;
    const sc = s.scale || 1, lk = Math.max(.8, Math.min(1.45, 1 / Math.pow(sc, .6)));
    LW = 4.2 * lk; BRD = 3.4 * lk;
    const P = anim(p); FL = P.hurt ? (Math.sin(P.t * 28) > 0 ? .55 : .2) : 0; return P;
  }
  // volume-preserving squash & stretch about the feet + lean (shear) + lunge
  function bounce(c, P, sd, lunge, lean) {
    const b = Math.sin(P.t * 3.4 + sd);
    let sx = 1 + b * .028, sy = 1 - b * .032;
    sx *= 1 + P.crouch * .1 + P.strike * .12; sy *= 1 - P.crouch * .12 - P.strike * .07;
    if (P.hurt) { const w = Math.sin(P.t * 32) * .035; sx *= .95 + w; sy *= 1.05 - w; }
    c.translate(P.strike * lunge - P.crouch * lunge * .3 - P.hurt * 10, 0);
    const k = lean == null ? .14 : lean;
    c.transform(1, 0, -k * P.strike + k * .6 * P.crouch + .1 * P.hurt, 1, 0, 0);
    c.scale(sx, sy);
    return b;
  }

  // ======================================================================
  // BEASTS
  // ======================================================================
  function beastVariant(s) {
    const ok = { rat: 1, hound: 1, pit: 1, rustjaw: 1 };
    if (s.variant && ok[s.variant]) return s.variant;
    const m = { 61: 'rat', 62: 'hound', 102: 'pit', 112: 'rustjaw' }[s.seed]; if (m) return m;
    const sc = s.scale || 1; return sc < .75 ? 'rat' : sc > 1.3 ? 'rustjaw' : (s.seed || 0) % 2 ? 'hound' : 'pit';
  }

  // ---- Gutter Rat: chubby lavender rat, giant ears, buck teeth, curly tail with a heart tip ----
  function rat(c, s, P, sd) {
    const t = P.t, coat = pick(s.coat, C.lav), far = shadeOf(coat), pk = C.pinkL, iris = pick(s.eye, C.lime);
    const b = Math.sin(t * 3.4 + sd), hb = Math.sin(t * 3.4 + sd - .7), by = -42 + b * 1.6 + P.crouch * 4;
    foot(-40, -8, 14, 8, shadeOf(pk)); foot(18, -8, 13, 8, shadeOf(pk));
    // curly tail
    const sw = Math.sin(t * 2.2 + sd) * .22 + P.strike * .5 - P.hurt * .4, cs = [[-46, by + 10]], ws = [12];
    for (let i = 1; i <= 12; i++) { const u = i / 12, a = .9 + sw * u - u * TAU * .85, R = 30 * (1 - u * .6); cs.push([-86 + Math.cos(a) * R, by - 24 + Math.sin(a) * R]); ws.push(12 - u * 6); }
    shape(pPts(tube(cs, ws)), pk, { sh: 3, spec: 0 });
    const e = cs[12], e2 = cs[11]; fx(c => heart(c, e[0], e[1], 12, C.pink, Math.atan2(e2[1] - e[1], e2[0] - e[0]) - Math.PI / 2 + Math.PI, false));
    // body
    shape(pEll(-8, by, 48, 36), coat, { inner: c => scratches(c, -36, by - 8, 1, -.3) });
    shape(pEll(12, by + 14, 26, 16, -.2), C.cream, { lw: 0, b: 0, spec: 0, sh: 3, soft: 0 });
    foot(-26, -7, 15, 9, pk); foot(36, -7, 14, 9, pk);
    const hx = 40 + P.strike * 16 - P.crouch * 6 - P.hurt * 6, hy = -84 + hb * 2.2 + P.crouch * 8 + P.hurt * 2;
    shape(pEll(hx - 4 + P.strike * 30, by + 8 - P.strike * 16, 9, 8), pk, { sh: 2, spec: .15 }); // little paw
    // head
    const ha = -.06 + P.crouch * .14 - P.strike * .12 - P.hurt * .22 + Math.sin(t * 1.3 + sd) * .03;
    const ew = Math.sin(t * 5 + sd) * .05 - P.hurt * .3 + P.strike * .15, op = P.strike * .9 + P.crouch * .3 + P.hurt * .4, bl = blink(t, sd);
    c.save(); c.translate(hx, hy); c.rotate(ha); c.scale(1.12, 1.12);
    c.save(); c.translate(20, -26); c.rotate(.38 + ew); shape(pEll(0, -20, 21, 24), far, { sh: 4 }); shape(pEll(1, -18, 12, 15), shadeOf(C.pink, .15), { lw: 0, b: 0, spec: 0, sh: 3, soft: 0 }); c.restore();
    shape(pEll(0, 0, 38, 34), coat, { spec: .1 });
    shape(pEll(30, 10, 24, 18, -.12), coat, { sh: 4, spec: .12, hx: .45 });
    shape(pEll(33, 16, 15, 8, -.12), C.cream, { lw: 0, b: 0, spec: 0, sh: 2, soft: 0, tex: 0 });
    fx(c => {
      const mx = 40, my = 24;
      if (op > .06) { c.beginPath(); c.ellipse(mx, my + 3 * op, 10, 3 + op * 9, 0, 0, TAU); c.fillStyle = C.mouth; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); }
      else { c.beginPath(); c.moveTo(mx - 9, my); c.quadraticCurveTo(mx - 4.5, my + 4, mx, my); c.quadraticCurveTo(mx + 4.5, my + 4, mx + 9, my - 1); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke(); }
      for (const tx of [mx - 7, mx + .5]) { const p = rrP(tx, my - 2, 7, 10 + op * 3, 2.5); c.lineWidth = 4.4; c.strokeStyle = INK; c.stroke(p); c.fillStyle = '#ffffff'; c.fill(p); }
      c.lineCap = 'round';
      for (let k = 0; k < 3; k++) { const a = -.35 + k * .32 + Math.sin(t * 7 + k) * .06; c.beginPath(); c.moveTo(46, 8 + k * 3); c.quadraticCurveTo(46 + Math.cos(a) * 16, 8 + k * 3 + Math.sin(a) * 16 - 3, 46 + Math.cos(a + .12) * 30, 8 + k * 3 + Math.sin(a + .12) * 30); c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke(); }
      blush(c, -6, 13, 8);
    });
    shape(pEll(54, 3, 8, 6.5), C.pink, { sh: 2, spec: .22, hx: .3, hy: .25 });
    fx(c => {
      eye(c, 8, -6, 17, iris, { lid: .14 + P.crouch * .12, tilt: .4, lidCol: tones(coat).b, blink: bl, look: [.55, .25], shut: P.hurt ? 1 : 0 });
      eye(c, 34, -10, 12, iris, { lid: .14 + P.crouch * .12, tilt: -.4, lidCol: tones(coat).b, blink: bl, look: [.55, .25], shut: P.hurt ? -1 : 0 });
      brow(c, -7, -28, 16, -22, 4.5); brow(c, 27, -25, 42, -30, 3.6);
    });
    c.save(); c.translate(-14, -28); c.rotate(-.38 - ew); shape(pEll(0, -20, 22, 25), coat, { sh: 4 }); shape(pEll(1, -18, 13, 16), C.pinkL, { lw: 0, b: 0, spec: 0, sh: 3, soft: 0 }); c.restore();
    if (P.hurt) fx(c => dizzy(c, 4, -78, t, 34));
    if (P.strike > .05) fx(c => waves(c, 62, 18, 0, P.strike, t, .8));
    c.restore();
    if (P.strike > .1) fx(c => dashes(c, -112, by - 6, P.strike));
  }

  // ---- Feral Hound: scruffy fluffy orange mutt, oversized spiked pink collar, goofy-fierce grin ----
  function hound(c, s, P, sd) {
    const t = P.t, coat = pick(s.coat, C.org), far = shadeOf(coat), cream = C.cream, iris = pick(s.eye, C.cyan), col = C.pink;
    const b = Math.sin(t * 3.4 + sd), hb = Math.sin(t * 3.4 + sd - .7), by = -70 + b * 2 + P.crouch * 6;
    const wag = Math.sin(t * (7 + P.strike * 8) + sd) * .28;
    c.save(); c.translate(-56, by - 18); c.rotate(1.05 + wag + P.hurt * .4); shape(cloud(-30, 0, 34, 17, 10, .34), coat, { sh: 4, spec: .1 }); c.restore();
    const leg = (x, col0, pc, reach) => {
      const fx0 = x + 6 + reach * 40, fy = -10 - reach * 24;
      shape(pPts(tube([[x, by + 8], [x + 1 + reach * 20, (by + fy) / 2 + 6], [fx0 - 4, fy - 4]], [26, 22, 20])), col0, { sh: 4, spec: 0 });
      foot(fx0, fy + 1, 17, 11, pc);
    };
    leg(-34, far, shadeOf(cream), 0); leg(36, far, shadeOf(cream), 0);
    shape(cloud(-6, by, 58, 38, 13, .2), coat, { inner: c => { scratches(c, -40, by - 6, 1.1, -.4); scratches(c, -6, by - 18, .9, -.2); } });
    shape(cloud(32, by + 8, 20, 22, 7, .3), cream, { lw: 3, b: 0, sh: 3, spec: 0 });
    leg(-46, coat, cream, 0); leg(24, coat, cream, P.strike);
    const hx = 56 + P.strike * 18 - P.crouch * 8 - P.hurt * 8, hy = -124 + hb * 2.4 + P.crouch * 10 + P.hurt * 3;
    const ha = .02 + P.crouch * .14 - P.strike * .1 - P.hurt * .2 + Math.sin(t * 1.2 + sd) * .03;
    // oversized spiked collar
    c.save(); c.translate(hx - 32, hy + 32); c.rotate(-.55);
    for (const k of [-22, -6, 10, 26]) shape(pPts([[-10, k - 7], [-30, k], [-10, k + 7]]), C.silver, { lw: 3, sh: 2, spec: .2, hx: .4 });
    shape(pRR(-13, -36, 26, 72, 13), col, { inner: c => { c.fillStyle = 'rgba(255,255,255,.35)'; for (const k of [-22, -6, 10, 26]) { c.beginPath(); c.arc(-4, k, 3, 0, TAU); c.fill(); } } });
    const sw = Math.sin(t * 3 + sd) * .3 + P.strike * .5;
    fx(c => { c.translate(4, 34); c.rotate(.55 + sw); c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 8); c.stroke(); star(c, 0, 18, 12, C.yel, 0, true); });
    c.restore();
    const ew = Math.sin(t * 4 + sd) * .12 - P.strike * .25 + P.hurt * .4, op = .2 + P.strike * .9 + P.crouch * .3 + P.hurt * .3, bl = blink(t, sd);
    c.save(); c.translate(hx, hy); c.rotate(ha); c.scale(1.1, 1.1);
    shape(pPts([[6, -22], [20, -60], [31, -64], [42, -24]]), far, { sh: 4 });
    shape(pPts([[-36, -12], [-32, -46, 1], [-20, -30], [-8, -56, 1], [4, -34], [18, -50, 1], [26, -24]]), coat, { sh: 3, spec: 0 });
    shape(cloud(0, 0, 42, 37, 11, .14), coat, { spec: .08 });
    shape(pEll(34, 12, 27, 19), cream, { sh: 4, spec: .1, hx: .5 });
    fx(c => { // goofy-fierce grin with fangs and a tongue flopping out
      const mp = new Path2D(); mp.moveTo(12, 14); mp.quadraticCurveTo(36, 22, 62, 9); mp.quadraticCurveTo(42, 28 + op * 26, 12, 14); mp.closePath();
      c.lineWidth = 6.4; c.strokeStyle = INK; c.stroke(mp); c.fillStyle = C.mouth; c.fill(mp);
      c.save(); c.clip(mp); c.fillStyle = C.tongue; c.beginPath(); c.ellipse(34, 24 + op * 20, 14, 9, 0, 0, TAU); c.fill(); c.restore();
      tooth(c, 22, 16, 7, 8 + op * 3); tooth(c, 52, 12.5, 7, 9 + op * 3);
      const tl = Math.sin(t * 3.3 + sd) * .12;
      c.save(); c.translate(46, 19 + op * 8); c.rotate(-.25 + tl); const tg = rrP(-6, -2, 13, 20 + op * 6, 6.5); c.lineWidth = 4.4; c.strokeStyle = INK; c.stroke(tg); c.fillStyle = C.tongue; c.fill(tg);
      c.beginPath(); c.moveTo(.5, 2); c.lineTo(.5, 12 + op * 4); c.lineWidth = 1.8; c.stroke(); glint(c, -2, 6, 2.2); c.restore();
      blush(c, 6, 14, 7);
    });
    shape(pEll(60, 0, 10, 7.5), '#2a2236', { sh: 2, spec: .25, hx: .3, hy: .25 });
    fx(c => {
      eye(c, 6, -10, 16.5, iris, { lid: .16 + P.crouch * .14, tilt: .4, lidCol: tones(coat).b, blink: bl, look: [.6, .2], shut: P.hurt ? 1 : 0 });
      eye(c, 32, -14, 12, iris, { lid: .16 + P.crouch * .14, tilt: -.4, lidCol: tones(coat).b, blink: bl, look: [.6, .2], shut: P.hurt ? -1 : 0 });
      brow(c, -9, -30, 15, -23, 5); brow(c, 25, -27, 41, -32, 4);
    });
    c.save(); c.translate(-24, -20); c.rotate(ew); shape(pPts([[2, 2], [-14, -10], [-32, 4], [-32, 28], [-20, 36], [-8, 18]]), shadeOf(coat, .12), { sh: 4 }); c.restore();
    if (P.hurt) fx(c => dizzy(c, 4, -78, t, 36));
    if (P.strike > .05) fx(c => waves(c, 72, 18, 0, P.strike, t, 1));
    c.restore();
    if (P.strike > .1) fx(c => dashes(c, -112, by, P.strike));
  }

  // ---- Pit Hound: stocky sky-blue bulldog, underbite fangs, chain collar with a heart tag, band-aid ----
  function pit(c, s, P, sd) {
    const t = P.t, coat = pick(s.coat, C.sky), far = shadeOf(coat), cream = C.cream, iris = pick(s.eye, C.pink), patch = mix(coat, C.cyanD, .45);
    const b = Math.sin(t * 3.4 + sd), hb = Math.sin(t * 3.4 + sd - .7), by = -66 + b * 1.6 + P.crouch * 5;
    const wag = Math.sin(t * 9 + sd) * .35;
    c.save(); c.translate(-58, by - 20); c.rotate(-.5 + wag); shape(pEll(-9, 0, 13, 8.5), coat, { sh: 3 }); c.restore();
    const leg = (x, col0, pc, reach, d) => {
      const fx0 = x + 8 * d + reach * 38, fy = -10 - reach * 18;
      shape(pPts(tube([[x, by + 16], [x + 10 * d + reach * 14, -28 - reach * 6], [fx0, fy - 2]], [30, 26, 22])), col0, { sh: 4, spec: 0 });
      foot(fx0 + 4, fy + 1, 19, 11, pc);
    };
    leg(-26, far, shadeOf(cream), 0, -1); leg(44, far, shadeOf(cream), 0, 1);
    shape(pRR(-62, by - 36, 116, 74, 36), coat, { inner: c => { scratches(c, -44, by - 14, 1, -.3); } });
    shape(pEll(-24, by - 14, 20, 13, -.1), patch, { lw: 0, b: 0, sh: 2, spec: 0, soft: 0 });
    shape(pEll(36, by + 8, 20, 24, .2), cream, { lw: 0, b: 0, sh: 3, spec: 0, soft: 0 });
    leg(-40, coat, cream, 0, -1); leg(32, coat, cream, P.strike, 1);
    const hx = 50 + P.strike * 18 - P.crouch * 8 - P.hurt * 8, hy = -108 + hb * 2 + P.crouch * 9 + P.hurt * 3;
    const ha = .03 + P.crouch * .12 - P.strike * .1 - P.hurt * .2 + Math.sin(t * 1.2 + sd) * .025;
    // chain collar + heart tag
    const ca = [hx - 52, hy + 6], cb = [hx - 26, hy + 46];
    fx(c => {
      for (let i = 0; i <= 5; i++) { const q = lerp2(ca, cb, i / 5); c.save(); c.translate(q[0] + Math.sin(i * 1.7) * 2, q[1]); c.rotate(i % 2 ? .9 : -.6); c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, TAU); c.lineWidth = 7.5; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.6; c.strokeStyle = C.yel; c.stroke(); c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 3.6, 4.6); c.lineWidth = 1.4; c.strokeStyle = '#fff'; c.stroke(); c.restore(); }
      c.translate(cb[0] + 2, cb[1] + 4); c.rotate(Math.sin(t * 3 + sd) * .3 + P.strike * .4); c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 7); c.stroke(); heart(c, 0, 17, 12, C.pink, 0, true);
    });
    const op = .1 + P.strike * .9 + P.crouch * .25 + P.hurt * .35, bl = blink(t, sd);
    c.save(); c.translate(hx, hy); c.rotate(ha); c.scale(1.16, 1.16);
    shape(pPts([[14, -28], [28, -46], [40, -30]]), far, { sh: 3, spec: 0 });
    shape(pRR(-44, -38, 90, 70, 32), coat, { inner: c => { c.fillStyle = rgba(patch, 1); c.beginPath(); c.ellipse(0, -10, 19, 17, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(21,16,28,.7)'; c.lineWidth = 2.4; for (const k of [0, 1]) { c.beginPath(); c.moveTo(14 + k * 3, -33 + k * 6); c.quadraticCurveTo(22 + k * 3, -36 + k * 6, 30 + k * 3, -32 + k * 6); c.stroke(); } } });
    fx(c => { c.beginPath(); c.ellipse(36, 28 + op * 5, 22, 3 + op * 11, 0, 0, TAU); c.fillStyle = C.mouth; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); });
    shape(pRR(10, 22 + op * 12, 58, 20, 10), coat, { sh: 3, spec: .1 }); // underbite jaw
    shape(pEll(30, 14, 28, 16), coat, { sh: 4, spec: .1, hx: .5 }); // jowls
    shape(pEll(31, 19, 16, 8), cream, { lw: 0, b: 0, sh: 2, spec: 0, soft: 0, tex: 0 });
    fx(c => { tooth(c, 46, 25 + op * 12, 9, -13); tooth(c, 60, 25 + op * 12, 8, -11); blush(c, 2, 16, 7); });
    shape(pEll(52, -2, 11, 8), '#2a2236', { sh: 2, spec: .25, hx: .3, hy: .25 });
    fx(c => {
      eye(c, 2, -10, 14, iris, { lid: .2 + P.crouch * .12, tilt: .45, lidCol: tones(patch).b, blink: bl, look: [.6, .3], shut: P.hurt ? 1 : 0 });
      eye(c, 27, -12, 10.5, iris, { lid: .2 + P.crouch * .12, tilt: -.45, lidCol: tones(coat).b, blink: bl, look: [.6, .3], shut: P.hurt ? -1 : 0 });
      brow(c, -12, -28, 12, -20, 6); brow(c, 20, -22, 36, -27, 5);
      c.save(); c.translate(-22, -30); c.rotate(-.4); const ba = rrP(-13, -5, 26, 10, 5); stk(c, ba, '#ffd9b4', 1.6, true); c.fillStyle = '#f0b890'; c.fillRect(-4, -4.4, 8, 8.8); c.lineWidth = 1.4; c.strokeStyle = INK; c.strokeRect(-4, -4.4, 8, 8.8); c.restore();
    });
    shape(pPts([[-30, -34], [-46, -42], [-56, -26], [-44, -16], [-34, -22]]), shadeOf(coat, .12), { sh: 3, spec: 0 });
    if (P.hurt) fx(c => dizzy(c, 0, -62, t, 36));
    if (P.strike > .05) fx(c => waves(c, 74, 22, 0, P.strike, t, 1));
    c.restore();
    if (P.strike > .1) fx(c => dashes(c, -100, by, P.strike));
  }

  // ---- Rustjaw: giant junk wolf, graffiti stripes & stickers, cartoon bear-trap jaw ----
  function rustjaw(c, s, P, sd) {
    const t = P.t, steel = pick(s.coat, '#9aa3c7'), dark = shadeOf(steel, .32), iris = pick(s.eye, C.yel), gA = C.lime, gB = C.pink;
    const b = Math.sin(t * 3.4 + sd), hb = Math.sin(t * 3.4 + sd - .7), by = -88 + b * 2 + P.crouch * 6;
    c.translate(-20, 0); // long snout: keep the silhouette centred over the feet
    // segmented scrap tail
    let tp = [-78, by - 10], ta = -2.35 + Math.sin(t * 3 + sd) * .14 + P.strike * .2;
    for (let i = 0; i < 4; i++) { const r = 16 - i * 2.4; tp = [tp[0] + Math.cos(ta) * 16, tp[1] + Math.sin(ta) * 16]; shape(pEll(tp[0], tp[1], r, r * .74, ta), i % 2 ? dark : steel, { sh: 3, spec: .12 }); ta += .26 + Math.sin(t * 3 - i + sd) * .05; }
    const tipP = tp; fx(c => star(c, tipP[0] + Math.cos(ta) * 12, tipP[1] + Math.sin(ta) * 12, 10, gA, t, true));
    // exhaust pipe + cute smoke puffs
    shape(pPts(tube([[-30, by - 30], [-36, by - 70]], [18, 18])), dark, { sh: 3, spec: .15 });
    shape(pEll(-36, by - 72, 12, 5), mix(dark, INK, .3), { sh: 0, spec: 0, tex: 0 });
    fx(c => { for (let i = 0; i < 3; i++) { const ph = (t * .45 + i / 3) % 1; puffCloud(c, -40 - ph * 16, by - 82 - ph * 50, 7 + ph * 9 + P.strike * 3, i % 2 ? C.pinkL : C.limeL, Math.sin(ph * Math.PI) * .95); } });
    for (const [x, col] of [[-50, gB], [-16, gA], [18, gB]]) shape(pPts([[x - 15, by - 36], [x - 4, by - 66], [x + 14, by - 36]]), col, { sh: 3, spec: .12 }); // spine fins
    const leg = (x, col0, pc, reach) => {
      const fx0 = x + 10 + reach * 46, fy = -12 - reach * 26;
      shape(pPts(tube([[x, by + 22], [x + 8 + reach * 22, -40 - reach * 10], [fx0 - 2, fy - 4]], [36, 28, 26])), col0, { sh: 4, spec: .08 });
      fx(c => { c.beginPath(); c.arc(x + 8 + reach * 22, -40 - reach * 10, 6, 0, TAU); c.fillStyle = C.yel; c.fill(); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke(); });
      shape(pEll(fx0 + 6, fy + 1, 26, 13), pc, { sh: 3, spec: .12 });
      fx(c => { for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(fx0 + 18 + i * 6 - 6, fy + 9, 4.2, 5, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke(); } });
    };
    leg(-40, dark, shadeOf(dark, .2), 0); leg(44, dark, shadeOf(dark, .2), 0);
    // armoured junk body with graffiti
    shape(pRR(-88, by - 46, 160, 92, 44), steel, { texA: .4, inner: c => {
      c.lineCap = 'butt';
      for (const [x, col] of [[-60, gB], [-34, gA], [10, gB], [30, gA]]) { c.beginPath(); c.moveTo(x, by + 60); c.lineTo(x + 34, by - 60); c.lineWidth = 19; c.strokeStyle = INK; c.stroke(); c.lineWidth = 12; c.strokeStyle = col; c.stroke(); }
      c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.moveTo(-72, by + 22); c.bezierCurveTo(-60, by + 8, -54, by + 34, -42, by + 18); c.bezierCurveTo(-34, by + 8, -30, by + 30, -20, by + 22); c.stroke();
      for (const [x, y] of [[-70, by - 26], [54, by - 26], [-70, by + 26], [54, by + 28]]) { c.beginPath(); c.arc(x, y, 3.6, 0, TAU); c.fillStyle = '#e6ecf8'; c.fill(); c.lineWidth = 2; c.stroke(); }
    } });
    shape(pEll(-56, by - 4, 30, 28), mix(steel, '#ffffff', .12), { sh: 4 });
    shape(pEll(36, by - 8, 36, 32), mix(steel, '#ffffff', .12), { sh: 4 });
    fx(c => {
      heart(c, -56, by - 4, 12, gB, -.2, true);
      star(c, 36, by - 10, 15, C.yel, .2, true);
      c.save(); c.translate(-12, by + 14); c.rotate(.15); const sp = new Path2D(); sp.arc(0, 0, 11, 0, TAU); stk(c, sp, C.yel, 2, true);
      c.fillStyle = INK; c.beginPath(); c.arc(-3.5, -3, 1.7, 0, TAU); c.arc(3.5, -3, 1.7, 0, TAU); c.fill(); c.beginPath(); c.arc(0, 1, 6, .3, Math.PI - .3); c.lineWidth = 2; c.strokeStyle = INK; c.stroke(); c.restore();
    });
    leg(-56, steel, mix(steel, '#ffffff', .1), 0); leg(28, steel, mix(steel, '#ffffff', .1), P.strike);
    // head
    const hx = 72 + P.strike * 24 - P.crouch * 10 - P.hurt * 8, hy = -140 + hb * 2 + P.crouch * 10 + P.hurt * 3;
    const ha = .05 + P.crouch * .12 - P.strike * .08 - P.hurt * .2 + Math.sin(t * 1.1 + sd) * .025;
    const jaw = .08 + P.crouch * .1 + P.strike * .55 + P.hurt * .25 + Math.max(0, b) * .04, bl = blink(t, sd);
    const ew = Math.sin(t * 2.6 + sd) * .06 - P.strike * .2 + P.hurt * .3;
    c.save(); c.translate(hx, hy); c.rotate(ha); c.scale(1.08, 1.08);
    c.save(); c.translate(18, -34); c.rotate(.15 + ew); shape(pPts([[-14, 2], [-4, -40], [6, -44], [16, 0]]), dark, { sh: 3 }); shape(pPts([[-7, -2], [-2, -30], [3, -32], [9, -2]]), gB, { lw: 0, b: 0, sh: 2, spec: 0, soft: 0 }); c.restore();
    shape(pRR(-46, -44, 90, 68, 28), steel, { inner: c => { c.lineWidth = 9; c.strokeStyle = INK; c.beginPath(); c.moveTo(-50, -12); c.lineTo(50, -34); c.stroke(); c.lineWidth = 5; c.strokeStyle = gA; c.stroke(); } });
    const hinge = [10, 10], lt = [hinge[0] + Math.cos(jaw) * 74 - Math.sin(jaw) * 6, hinge[1] + Math.sin(jaw) * 74 + Math.cos(jaw) * 6];
    fx(c => { c.beginPath(); c.moveTo(hinge[0], hinge[1] - 4); c.lineTo(86, 6); c.lineTo(lt[0] + 4, lt[1]); c.closePath(); c.fillStyle = C.mouth; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); });
    c.save(); c.translate(hinge[0], hinge[1]); c.rotate(jaw);
    shape(pRR(-4, 2, 80, 26, 13), dark, { sh: 3, spec: .1, inner: c => { c.lineWidth = 8; c.strokeStyle = INK; c.beginPath(); c.moveTo(8, 20); c.lineTo(62, 18); c.stroke(); c.lineWidth = 4.5; c.strokeStyle = gB; c.stroke(); } });
    c.restore();
    shape(pRR(4, -24, 84, 34, 17), steel, { spec: .14, hx: .5 });
    shape(pEll(86, -13, 11, 8.5), C.navy, { sh: 2, spec: .25, hx: .3, hy: .25 });
    // trap teeth drawn over the lips so they interlock like a zipper
    c.save(); c.translate(hinge[0], hinge[1]); c.rotate(jaw);
    fx(c => { for (let i = 0; i < 5; i++) tooth(c, 14 + i * 13, 9, 13, -16 - (i === 3 ? 5 : 0)); });
    c.restore();
    fx(c => { for (let i = 0; i < 5; i++) tooth(c, 21 + i * 13, 6, 13, 16 + (i === 1 ? 5 : 0)); });
    fx(c => {
      eye(c, 4, -14, 18, iris, { lid: .2 + P.crouch * .12, tilt: .4, lidCol: tones(steel).b, blink: bl, look: [.6, .2], shut: P.hurt ? 1 : 0 });
      eye(c, 33, -19, 12.5, iris, { lid: .2 + P.crouch * .12, tilt: -.4, lidCol: tones(steel).b, blink: bl, look: [.6, .2], shut: P.hurt ? -1 : 0 });
      c.save(); c.translate(6, -36); c.rotate(.24); const bp = rrP(-22, -6, 44, 12, 6); stk(c, bp, tones(gB).b, 2.4); c.restore();
      c.save(); c.translate(-24, 8); const sp = new Path2D(); sp.arc(0, 0, 8.5, 0, TAU); stk(c, sp, C.cyan, 1.8, true); star(c, 0, 0, 5, '#ffffff', 0); c.restore();
    });
    c.save(); c.translate(-22, -34); c.rotate(-.18 - ew); shape(pPts([[-16, 2], [-8, -44], [2, -48], [14, 0]]), steel, { sh: 3 }); shape(pPts([[-9, -2], [-5, -32], [0, -34], [7, -2]]), gA, { lw: 0, b: 0, sh: 2, spec: 0, soft: 0 }); c.restore();
    if (P.hurt) fx(c => dizzy(c, 0, -96, t, 44));
    if (P.strike > .05) fx(c => waves(c, 96, 22, .15, P.strike, t, 1.3));
    c.restore();
    if (P.strike > .1) fx(c => dashes(c, -104, by, P.strike));
  }
  const BEASTS = { rat: [rat, 26, 70], hound: [hound, 30, 96], pit: [pit, 28, 100], rustjaw: [rustjaw, 30, 120] };
  function beast(c, s, p) {
    const vk = beastVariant(s), [fn, lunge, shw] = BEASTS[vk], sd = s.seed || 5, P = begin(c, s, p);
    c.save();
    if (!p.noShadow) gShadow(c, 10 + P.strike * lunge, shw);
    bounce(c, P, sd, lunge);
    fn(c, s, P, sd);
    c.restore(); flush(c);
  }

  // ======================================================================
  // BLOBS — translucent bubblegum slime with floating junk, googly eyes and a gum bubble
  // ======================================================================
  const BLV = {
    sludge: { w: 80, h: 152, coat: C.lime, eyes: [[10, -110, 25], [56, -100, 18]], mouth: [34, -58, 1.05], arms: 1,
      junk: [['can', -38, -62, 1, .5], ['tape', 6, -26, 1, -.25], ['vinyl', -30, -122, .8, 0]] },
    mire: { w: 96, h: 178, coat: '#a97ee0', eyes: [[4, -134, 23], [52, -122, 19], [-38, -112, 14]], mouth: [30, -66, 1.2], arms: 2, crown: 1,
      junk: [['duck', -50, -62, 1, .3], ['sneaker', 6, -24, 1, -.2], ['vinyl', -64, -132, .8, 0], ['can', 70, -40, .7, 1]] },
  };
  function junk(c, kind, x, y, k, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k); c.lineJoin = c.lineCap = 'round';
    if (kind === 'can') {
      const p = rrP(-12, -18, 24, 36, 5); stk(c, p, C.cyan, 2.2); c.save(); c.clip(p); c.fillStyle = C.yel; c.fillRect(-12, -7, 24, 14); c.restore(); c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke(p);
      star(c, 0, 0, 5.5, C.pink, 0); c.beginPath(); c.ellipse(0, -18, 12, 3.5, 0, 0, TAU); c.fillStyle = '#e8eef6'; c.fill(); c.lineWidth = 2; c.stroke(); glint(c, -7, -8, 2.4);
    } else if (kind === 'tape') {
      stk(c, rrP(-21, -14, 42, 28, 4), C.navy, 2.2); stk(c, rrP(-17, -11, 34, 13, 3), C.pink, 1.2);
      for (const sx of [-8, 8]) { c.beginPath(); c.arc(sx, 4, 4.5, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke(); }
      c.fillStyle = INK; c.fillRect(-4, 2, 8, 4);
    } else if (kind === 'vinyl') {
      const p = new Path2D(); p.arc(0, 0, 19, 0, TAU); stk(c, p, '#2a2436', 2.2);
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; for (const r of [9, 13, 16]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
      c.beginPath(); c.arc(0, 0, 6.5, 0, TAU); c.fillStyle = C.pink; c.fill(); c.beginPath(); c.arc(0, 0, 1.6, 0, TAU); c.fillStyle = INK; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 14, 3.6, 4.4); c.stroke();
    } else if (kind === 'sneaker') {
      const p = new Path2D(); trace(p, [[-20, 7], [-19, -6], [-8, -12], [0, -4], [12, -2], [21, 4], [20, 10, 1], [-20, 10, 1]]); stk(c, p, '#ffffff', 2.2);
      c.fillStyle = C.lime; c.fillRect(-20, 5, 41, 5); c.lineWidth = 2; c.strokeStyle = INK; c.stroke(p);
      c.beginPath(); c.moveTo(-12, 0); c.quadraticCurveTo(0, 5, 12, -1); c.lineWidth = 3; c.strokeStyle = C.pink; c.stroke();
    } else if (kind === 'duck') {
      const p = new Path2D(); p.ellipse(0, 4, 18, 11, 0, 0, TAU); stk(c, p, C.yel, 2.2); const h = new Path2D(); h.arc(8, -10, 9, 0, TAU); stk(c, h, C.yel, 2.2);
      const bk = new Path2D(); bk.ellipse(18, -9, 6, 3.5, 0, 0, TAU); stk(c, bk, C.org, 1.6); c.fillStyle = INK; c.beginPath(); c.arc(10, -12, 1.8, 0, TAU); c.fill();
    }
    c.restore();
  }
  function popBurst(c, x, y, R, k) {
    c.save(); c.globalAlpha = Math.max(0, 1 - k);
    const p = starPath(x, y, R * (.7 + k * .6), k * .5, .55); c.lineWidth = 3; c.strokeStyle = INK; c.stroke(p); c.fillStyle = C.pinkL; c.fill(p);
    c.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3, d0 = R * (1 + k * .8), d1 = d0 + 9; c.beginPath(); c.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0); c.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1); c.lineWidth = 3.2; c.strokeStyle = INK; c.stroke(); }
    c.restore();
  }
  function blob(c, s, p) {
    const sd = s.seed || 9, P = begin(c, s, p), t = P.t;
    const vk = s.variant && BLV[s.variant] ? s.variant : sd === 104 ? 'mire' : sd === 63 ? 'sludge' : (s.scale || 1) > 1.1 ? 'mire' : 'sludge';
    const V = BLV[vk], coat = pick(s.coat, V.coat), T = tones(coat), Wd = V.w, Ht = V.h, cy = -Ht * .44;
    c.save();
    if (!p.noShadow) gShadow(c, 10, Wd * 1.4);
    bounce(c, P, sd, 30, .2);
    shape(pEll(6, -3, Wd * 1.22, 10), shadeOf(coat, .12), { sh: 3, spec: .12 }); // puddle
    // pseudopod arms (behind the body)
    const arm = (base, idle, up, slam, w0, ph) => {
      let tip = lerp2(idle, up, P.crouch); tip = lerp2(tip, slam, P.strike);
      const mid = [(base[0] + tip[0]) / 2 + 10 * Math.sign(tip[0] - base[0] || 1), Math.min(base[1], tip[1]) - 18 - P.strike * 12], cs = [], ws = [];
      for (let k = 0; k <= 6; k++) { const u = k / 6, v = 1 - u; cs.push([v * v * base[0] + 2 * u * v * mid[0] + u * u * tip[0], v * v * base[1] + 2 * u * v * mid[1] + u * u * tip[1] + Math.sin(t * 2.4 + ph + k) * 1.5]); ws.push(k === 6 ? w0 * .7 : w0 * (1 - u * .5)); }
      shape(pPts(tube(cs, ws)), coat, { sh: 5, spec: .12, hx: .5 });
      if (P.strike > .55) fx(c => { for (let i = 0; i < 5; i++) { const a = -Math.PI * (.12 + i * .19), d = 12 + P.strike * 18, pp = new Path2D(); pp.arc(tip[0] + Math.cos(a) * d, tip[1] + Math.sin(a) * d * .8 - 4, 3 + (i % 2) * 2, 0, TAU); stk(c, pp, i % 2 ? C.pinkL : coat, 1.4); } });
    };
    arm([Wd * .55, -Ht * .3], [Wd * 1.05, -Ht * .12 + Math.sin(t * 1.6 + sd) * 4], [Wd * .6, -Ht * 1.25], [Wd * 1.75, -16], 32, 0);
    if (V.arms === 2) arm([-Wd * .6, -Ht * .28], [-Wd * 1.08, -16 + Math.sin(t * 1.3) * 3], [-Wd * 1.0, -Ht * .5], [-Wd * .9, -Ht * .72], 25, 2);
    // body outline points (wobbling gumdrop)
    const N = 26, pts = [];
    for (let i = 0; i < N; i++) {
      const an = i / N * TAU, ca = Math.cos(an), sa = Math.sin(an);
      let r = 1 + .045 * Math.sin(an * 3 + t * 2.3 + sd) + .025 * Math.sin(an * 5 - t * 3.1 + sd);
      if (V.crown && sa < -.3) r += .07 * Math.max(0, Math.sin(an * 7 + t * .8));
      let x = ca * Wd * r * (1 + .2 * Math.max(0, sa)), y = cy + sa * (sa < 0 ? Ht * .58 : -cy) * r; if (y > -1) y = -1;
      pts.push([x, y]);
    }
    const lite = mix(coat, '#ffffff', .38);
    shape(pPts(pts), coat, { paint: (c, d) => {
      const x0 = d.bb[0], y0 = d.bb[1], w = d.bb[2] - x0, h = d.bb[3] - y0;
      c.lineWidth = LW * 2; c.strokeStyle = INK; c.stroke(d.p); c.fillStyle = tones(lite).b; c.fill(d.p);
      c.save(); c.clip(d.p);
      for (const j of V.junk) junk(c, j[0], j[1] + Math.sin(t * .7 + j[1]) * 4, j[2] + Math.cos(t * .6 + j[2]) * 5, j[3], j[4] + Math.sin(t * .5 + j[2]) * .25);
      c.globalAlpha = .4; c.fillStyle = T.b; c.fill(d.p); c.globalAlpha = 1;
      const q = new Path2D(); q.addPath(d.p); q.addPath(d.p, new DOMMatrix([1, 0, 0, 1, -11, -16])); c.globalAlpha = .6; c.fillStyle = T.sh; c.fill(q, 'evenodd'); c.globalAlpha = 1;
      const g = c.createRadialGradient(x0 + w * .34, y0 + h * .3, 0, x0 + w * .34, y0 + h * .3, w * .6); g.addColorStop(0, rgba(T.lt, .6)); g.addColorStop(1, rgba(T.lt, 0)); c.fillStyle = g; c.fillRect(x0, y0, w, h);
      const sc = [C.pinkL, C.yel, C.cyan, '#ffffff'];
      for (let i = 0; i < 8; i++) {
        const ph = (t * (.12 + (i % 3) * .04) + i * .31) % 1, bx = Math.sin(i * 2.3 + sd) * w * .32, byy = -10 - ph * h * .85, r = 2.5 + (i % 3) * 2;
        c.globalAlpha = Math.sin(ph * Math.PI) * .9; c.beginPath(); c.arc(bx, byy, r, 0, TAU); c.fillStyle = sc[i % 4]; c.fill(); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(bx - r * .35, byy - r * .35, r * .3, 0, TAU); c.fill();
      }
      c.globalAlpha = .35; c.fillStyle = pat(c); c.fillRect(x0, y0, w, h); c.globalAlpha = 1;
      c.lineCap = 'round'; c.beginPath(); c.moveTo(x0 + w * .13, y0 + h * .56); c.quadraticCurveTo(x0 + w * .15, y0 + h * .17, x0 + w * .42, y0 + h * .07);
      c.lineWidth = 10; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x0 + w * .53, y0 + h * .06, 4, 0, TAU); c.fill(); c.beginPath(); c.arc(x0 + w * .1, y0 + h * .66, 3, 0, TAU); c.fill();
      c.restore();
    } });
    // drips
    for (let i = 0; i < 3; i++) {
      const ph = (t * .4 + i * .37 + sd * .1) % 1, L = 8 + Math.sin(ph * Math.PI) * 14, ax = [-Wd * .82, Wd * .9, -Wd * .2][i], ay = [-Ht * .3, -Ht * .32, -Ht * .9][i];
      shape(pPts([[ax - 7, ay - 4], [ax + 7, ay - 4], [ax + 5, ay + L * .6], [ax, ay + L], [ax - 5, ay + L * .6]]), coat, { lw: LW * .8, b: 0, sh: 2, spec: .2, hx: .3, hy: .6 });
    }
    // face
    const eyX = V.eyes.reduce((a, e) => a + e[0], 0) / V.eyes.length;
    fx(c => {
      V.eyes.forEach((e, i) => {
        const x = e[0] + Math.sin(t * 1.4 + i * 2) * 1.5, y = e[1] + Math.cos(t * 1.2 + i) * 1.5, r = e[2] * (1 + P.strike * .12);
        googly(c, x, y, r, t, i * 1.7 + sd, P.hurt, .2 + P.crouch * .15 + blink(t, sd + i) * .8, tones(coat).b);
        const d = Math.sign(eyX - x) || 1; brow(c, x - d * r * .9, y - r * 1.25, x + d * r * .5, y - r * 1.02, Math.max(3.5, r * .28));
      });
    });
    const [mx, my, ms] = V.mouth, op = .2 + P.crouch * .25 + P.strike * .9 + P.hurt * .5;
    fx(c => {
      c.translate(mx, my); c.scale(ms, ms);
      const mp = new Path2D(); mp.moveTo(-26, -4); mp.quadraticCurveTo(0, 3, 26, -9); mp.quadraticCurveTo(4, 12 + op * 30, -26, -4); mp.closePath();
      c.lineWidth = 6.6; c.strokeStyle = INK; c.stroke(mp); c.fillStyle = C.mouth; c.fill(mp);
      c.save(); c.clip(mp); c.fillStyle = C.tongue; c.beginPath(); c.ellipse(-2, 8 + op * 26, 15, 10, 0, 0, TAU); c.fill(); c.restore();
      c.lineWidth = 2.2; c.strokeStyle = INK; const tp = rrP(-12, -3, 9, 9 + op * 2, 2.5); c.fillStyle = '#fff'; c.fill(tp); c.stroke(tp);
      blush(c, -36, 2, 9); blush(c, 34, -6, 7);
      // gum bubble: inflates, then pops (pops instantly when attacking)
      const gp = (t * .28 + sd * .13) % 1;
      if (P.strike > .08) popBurst(c, 34, -12, 22, clamp01((P.a - .3) / .5));
      else if (gp < .82) {
        const r = 4 + 30 * sm(gp / .82), bx = 22 + r * .75, byy = -6 - r * .25;
        c.globalAlpha = .88; const bp = new Path2D(); bp.arc(bx, byy, r, 0, TAU); c.lineWidth = 6; c.strokeStyle = INK; c.stroke(bp); c.fillStyle = C.pinkL; c.fill(bp); c.globalAlpha = 1;
        c.lineCap = 'round'; c.beginPath(); c.arc(bx, byy, r * .7, 3.5, 4.4); c.lineWidth = Math.max(2, r * .14); c.strokeStyle = '#fff'; c.stroke();
        c.beginPath(); c.arc(bx + r * .35, byy + r * .35, r * .08 + .8, 0, TAU); c.fillStyle = '#fff'; c.fill();
      } else popBurst(c, 34, -12, 20, (gp - .82) / .18);
    });
    if (P.hurt) fx(c => dizzy(c, eyX, -Ht - 16, t, 40));
    if (P.strike > .05) fx(c => waves(c, mx + 40, my - 6, 0, P.strike, t, 1.1));
    c.restore(); flush(c);
  }

  // ======================================================================
  // BOTS — chunky toy robots with speaker faces
  // ======================================================================
  function woofer(c, x, y, r, col, t, ph) {
    const p = new Path2D(); p.arc(x, y, r, 0, TAU); stk(c, p, C.navy, 2.4);
    const g = c.createRadialGradient(x - r * .2, y - r * .25, 0, x, y, r * .8); g.addColorStop(0, mix(col, '#ffffff', .4)); g.addColorStop(1, mix(col, '#3a2050', .35));
    c.beginPath(); c.arc(x, y, r * .74, 0, TAU); c.fillStyle = g; c.fill(); c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke();
    c.strokeStyle = 'rgba(21,16,28,.35)'; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, r * .5, 0, TAU); c.stroke();
    const d = new Path2D(); d.arc(x, y, r * .26, 0, TAU); stk(c, d, mix(col, '#ffffff', .2), 1.6); glint(c, x - r * .1, y - r * .1, r * .08);
    c.fillStyle = C.lime; for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .78; c.beginPath(); c.arc(x + Math.cos(a) * r * .87, y + Math.sin(a) * r * .87, 1.8, 0, TAU); c.fill(); }
  }
  function grill(c, x, y, w, h, t, k) { // speaker-grill mouth
    const p = rrP(x, y, w, h, Math.min(h / 2, 8)); stk(c, p, C.navy, 2.4);
    c.save(); c.clip(p);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 7; i++) { const px = x + 5 + i * (w - 10) / 6, py = y + h * (.25 + j * .25), pu = .5 + .5 * Math.sin(t * 9 - i * .8 + j); c.beginPath(); c.arc(px, py, 1.4 + pu * (1 + k * 1.4), 0, TAU); c.fillStyle = j === 1 ? C.lime : C.cyan; c.fill(); }
    c.restore();
  }
  function stripeSticker(c, x, y, w, h, rot) { // rounded hazard-stripe sticker
    c.save(); c.translate(x, y); c.rotate(rot || 0); const p = rrP(-w / 2, -h / 2, w, h, h / 2); stk(c, p, C.yel, 2.2, true);
    c.save(); c.clip(p); c.fillStyle = INK; for (let k = -w; k < w; k += h * .9) { c.beginPath(); c.moveTo(k, h); c.lineTo(k + h * .45, h); c.lineTo(k + h * 1.25, -h); c.lineTo(k + h * .8, -h); c.closePath(); c.fill(); } c.restore();
    c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke(p); c.restore();
  }
  function warnSticker(c, x, y, r, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); const p = new Path2D(); p.moveTo(0, -r); p.lineTo(r * .95, r * .7); p.lineTo(-r * .95, r * .7); p.closePath(); stk(c, p, C.yel, 2.4, true);
    c.lineCap = 'round'; c.lineWidth = r * .2; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, -r * .35); c.lineTo(0, r * .2); c.stroke(); c.beginPath(); c.arc(0, r * .45, r * .1, 0, TAU); c.fillStyle = INK; c.fill(); c.restore();
  }
  function mitt(x, y, r, col) { shape(pEll(x, y, r * 1.1, r), col, { sh: 3, spec: .14 }); }

  // ---- Scrap Drone: yellow toy robot, headphone ear cups, speaker-grill mouth, star antenna, boxing glove ----
  function drone(c, s, P, sd) {
    const t = P.t, coat = pick(s.coat, C.yel), acc = pick(s.accent, C.pink), iris = pick(s.eye, C.cyan), dk = shadeOf(coat, .3);
    const bob = Math.sin(t * 2.6 + sd) * 6, Y = -150 + bob + P.crouch * 8 - P.strike * 6 + P.hurt * 4;
    const tilt = Math.sin(t * 1.7 + sd) * .05 + P.strike * .2 - P.crouch * .16 - P.hurt * .25, bl = blink(t, sd);
    c.save(); c.translate(0, Y); c.rotate(tilt);
    fx(c => { for (let i = 0; i < 3; i++) { const ph = (t * 1.4 + i / 3) % 1; c.globalAlpha = (1 - ph) * .9; c.beginPath(); c.ellipse(0, 64 + ph * 44, 20 + ph * 26, 5 + ph * 6, 0, 0, TAU); c.lineWidth = 6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = i % 2 ? C.pink : C.cyan; c.stroke(); } c.globalAlpha = 1; });
    fx(c => glow(c, 0, 66, 40, C.cyan, .45));
    shape(pRR(-22, 38, 44, 22, 10), C.navy, { sh: 3, spec: .1, inner: c => { c.fillStyle = C.cyan; c.fillRect(-14, 52, 28, 4); } });
    shape(pPts(tube([[-40, 24], [-56, 42], [-52, 58]], [13, 11, 11])), dk, { sh: 2, spec: 0 }); mitt(-52, 62, 10, shadeOf(acc));
    shape(pRR(50, -30, 18, 42, 8), shadeOf(acc), { sh: 3 });
    // antenna with a star
    const sw = Math.sin(t * 3.1 + sd) * 6 - P.strike * 10 + P.hurt * Math.sin(t * 20) * 10;
    fx(c => { c.lineCap = 'round'; c.beginPath(); c.moveTo(4, -50); c.quadraticCurveTo(0, -74, 2 + sw, -94); c.lineWidth = 7; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3; c.strokeStyle = C.silver; c.stroke(); star(c, 2 + sw, -100, 12, acc, Math.sin(t * 2) * .3, true); });
    shape(pRR(-62, -56, 124, 108, 38), coat, { inner: c => { scratches(c, 34, 36, .9, -.3); } });
    shape(pRR(-46, -40, 96, 64, 24), C.cream, { b: 0, lw: 3, sh: 3, spec: .06, hx: .15 });
    fx(c => {
      eye(c, -12, -12, 15, iris, { lid: .14 + P.crouch * .12, tilt: .4, lidCol: C.cream, blink: bl, look: [.6, .2], shut: P.hurt ? 1 : 0 });
      eye(c, 24, -12, 13.5, iris, { lid: .14 + P.crouch * .12, tilt: -.4, lidCol: C.cream, blink: bl, look: [.6, .2], shut: P.hurt ? -1 : 0 });
      brow(c, -24, -32, -2, -26, 4.5); brow(c, 14, -27, 34, -32, 4.5);
      const k = P.strike + P.crouch * .3; grill(c, 0 - k * 3, 6, 34 + k * 8, 12 + k * 10, t, k);
      blush(c, -32, 8, 7); blush(c, 42, 8, 6);
      heart(c, -40, 36, 9, acc, -.2, true);
      for (const [x, y] of [[-50, -44], [50, -44], [-50, 40]]) { c.beginPath(); c.arc(x, y, 3.2, 0, TAU); c.fillStyle = C.lime; c.fill(); c.lineWidth = 1.8; c.strokeStyle = INK; c.stroke(); }
    });
    // headphones: band + near ear cup
    const band = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (1.06 + i * .088); band.push([Math.cos(a) * 68, -4 + Math.sin(a) * 66]); }
    shape(pPts(tube(band, band.map(() => 11))), acc, { sh: 2, spec: 0 });
    shape(pRR(-76, -30, 24, 48, 11), acc, { inner: c => { c.lineWidth = 3; c.strokeStyle = C.cyan; c.beginPath(); c.ellipse(-64, -6, 6, 14, 0, 0, TAU); c.stroke(); } });
    // near arm + boxing glove punch
    const ns = [40, 28], ne = [56 + P.strike * 28, 46 - P.strike * 6 + P.crouch * 6], nh = [68 + P.strike * 60, 52 - P.strike * 10 + P.crouch * 8];
    shape(pPts(tube([ns, ne, nh], [14, 12, 12])), dk, { sh: 2, spec: 0 });
    shape(pRR(nh[0] - 8, nh[1] - 8, 10, 16, 4), '#ffffff', { sh: 2, spec: 0 });
    shape(pEll(nh[0] + 10, nh[1], 16, 14), acc, { sh: 4, spec: .14 });
    if (P.hurt) fx(c => dizzy(c, 0, -76, t, 46));
    if (P.strike > .05) fx(c => waves(c, 52, 14, 0, P.strike, t, 1));
    fx(c => { const ph = (t * .4 + sd * .1) % 1; c.globalAlpha = Math.sin(ph * Math.PI); note(c, -76 - ph * 10, -50 - ph * 40, 9, C.lime, -.2); });
    c.restore();
  }

  // ---- Wire Wardens: twin boom-box robots with EQ-bar faces, joined by a curly audio cable ----
  function boombox(c, x, y, k, coat, acc, P, ph, front) {
    const t = P.t, hop = Math.abs(Math.sin(t * 3 + ph)) * 5 * (1 - P.crouch);
    c.save(); c.translate(x, y - hop); c.scale(k, k); c.rotate(Math.sin(t * 1.5 + ph) * .03);
    for (const lx of [-28, 22]) { shape(pPts(tube([[lx, -46], [lx + 2, -14]], [16, 14])), C.navy, { sh: 2, spec: 0 }); shape(pRR(lx - 12, -17, 32, 17, 8), '#ffffff', { sh: 3, spec: .1, inner: c => { c.fillStyle = acc; c.fillRect(lx - 12, -6, 32, 4); } }); }
    fx(c => {
      const hp = new Path2D(); hp.moveTo(-50, -136); hp.lineTo(-46, -158); hp.quadraticCurveTo(-44, -168, -34, -168); hp.lineTo(34, -168); hp.quadraticCurveTo(44, -168, 46, -158); hp.lineTo(50, -136);
      c.lineCap = c.lineJoin = 'round'; c.lineWidth = 15 + BRD * 2; c.strokeStyle = STK; c.stroke(hp); c.lineWidth = 15; c.strokeStyle = INK; c.stroke(hp); c.lineWidth = 7.5; c.strokeStyle = C.navy; c.stroke(hp);
      for (const [bx, col] of [[-30, C.lime], [-12, C.yel], [6, acc]]) stk(c, rrP(bx, -150, 13, 10, 3), col, 2);
    });
    shape(pRR(-78, -144, 156, 102, 26), coat, { texA: .35, inner: c => { c.fillStyle = rgba(mix(coat, '#3a2050', .25), 1); c.fillRect(-80, -60, 160, 20); } });
    const pulse = 1 + .07 * Math.max(0, Math.sin(t * 8 + ph)) + P.strike * .16 * (front ? 1 : .5);
    fx(c => {
      woofer(c, -48, -94, 23 * pulse, acc, t, ph); woofer(c, 48, -94, 23 * pulse, acc, t, ph);
      const sp = rrP(-24, -134, 48, 60, 10); stk(c, sp, C.navy, 2.4);
      c.save(); c.clip(sp);
      const fl = !(P.hurt && Math.sin(t * 40) > 0);
      if (P.hurt) { c.lineCap = 'round'; c.lineWidth = 3.4; c.strokeStyle = C.cyan; for (const [ex, d] of [[-10, 1], [10, -1]]) { c.beginPath(); c.moveTo(ex - 5 * d, -122); c.lineTo(ex + 4 * d, -116); c.lineTo(ex - 5 * d, -110); c.stroke(); } }
      else if (fl) for (const [ex, d] of [[-10, 1], [10, -1]]) {
        const bl = blink(t, ph * 3); c.fillStyle = C.cyan; c.beginPath(); c.ellipse(ex, -115, 5.5, 8 * (1 - bl * .85), 0, 0, TAU); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex - 1.8, -118, 1.9, 0, TAU); c.fill();
        c.fillStyle = C.navy; c.beginPath(); c.moveTo(ex - 8, -126); c.lineTo(ex + 8, -126); c.lineTo(ex + 8, -119 + d * 4); c.lineTo(ex - 8, -119 - d * 4); c.closePath(); c.fill(); // grumpy slant
      }
      for (let i = 0; i < 6; i++) { // EQ-bar mouth
        const hh = 4 + (P.hurt ? 2 : (.35 + .65 * Math.abs(Math.sin(t * 6.5 + i * 1.7 + ph))) * (12 + P.strike * 10)), bx = -19 + i * 6.6;
        c.fillStyle = hh > 15 ? C.pink : hh > 10 ? C.yel : C.lime; c.fillRect(bx, -80 - hh, 4.6, hh);
      }
      c.restore();
      stk(c, rrP(-22, -66, 44, 16, 4), mix(coat, '#3a2050', .4), 2);
      for (const sx of [-9, 9]) { c.beginPath(); c.arc(sx, -58, 4, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke(); }
      star(c, 62, -134, 9, C.yel, .3, true); blush(c, -64, -60, 6);
    });
    mitt(-82, -76, 10, shadeOf(acc));
    const reach = front ? P.strike : 0;
    shape(pPts(tube([[70, -84], [84 + reach * 20, -68 - reach * 14]], [12, 11])), C.navy, { sh: 2, spec: 0 });
    mitt(90 + reach * 24, -66 - reach * 16, 11, acc);
    if (P.hurt) fx(c => dizzy(c, 0, -182, t + ph, 44));
    if (front && P.strike > .05) fx(c => waves(c, 74, -94, 0, P.strike, t, 1.2));
    if (!front && P.strike > .05) fx(c => waves(c, 74, -94, 0, P.strike * .6, t + .3, .9));
    c.restore();
  }
  function wardens(c, s, P, sd) {
    const coat = pick(s.coat, C.cyan), acc = pick(s.accent, C.pink), t = P.t;
    boombox(c, -72, -4, .82, C.pink, C.cyan, P, 1.7, false);
    fx(c => { // curly audio cable with little notes running along it
      const A = [-14, -40], B = [-30, -50], cpt = [-22, 4], pt = u => { const v = 1 - u; return [v * v * A[0] + 2 * u * v * cpt[0] + u * u * B[0], v * v * A[1] + 2 * u * v * cpt[1] + u * u * B[1]]; };
      const path = new Path2D(); for (let i = 0; i <= 40; i++) { const u = i / 40, q = pt(u), o = Math.sin(u * 40 + t * 3) * 4; if (i) path.lineTo(q[0] + o, q[1] + Math.cos(u * 40 + t * 3) * 3); else path.moveTo(q[0], q[1]); }
      c.lineCap = c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = INK; c.stroke(path); c.lineWidth = 3; c.strokeStyle = C.yel; c.stroke(path);
    });
    boombox(c, 40, 0, 1, coat, acc, P, 0, true);
    fx(c => { for (let i = 0; i < 2; i++) { const ph = (t * .45 + i * .5) % 1; c.globalAlpha = Math.sin(ph * Math.PI); note(c, -20 + i * 40 + Math.sin(ph * 6 + i) * 6, -190 - ph * 40, 9, i ? C.pinkL : C.limeL, -.2); } });
  }

  // ---- Siege Drone: heavy lime tank-bot on treads with a megaphone cannon and hazard stickers ----
  function siege(c, s, P, sd) {
    const t = P.t, coat = pick(s.coat, C.lime), acc = pick(s.accent, C.pink), iris = pick(s.eye, C.yel), dk = shadeOf(coat, .3), bl = blink(t, sd);
    shape(pRR(-102, -38, 200, 38, 19), C.navy, { sh: 4, spec: .05 });
    fx(c => {
      for (let i = 0; i < 5; i++) { const x = -74 + i * 37, p = new Path2D(); p.arc(x, -19, 12, 0, TAU); stk(c, p, '#c9cfe6', 2); c.save(); c.translate(x, -19); c.rotate(t * 2 + i); c.lineWidth = 2.4; c.strokeStyle = INK; for (let k = 0; k < 3; k++) { c.rotate(TAU / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -8); c.stroke(); } c.restore(); }
      c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 12; i++) c.fillRect(-88 + i * 15 + (t * 20 % 15), -36, 6, 3);
    });
    shape(pRR(-88, -204, 18, 64, 7), dk, { sh: 3, spec: .1 });
    fx(c => { for (let i = 0; i < 3; i++) { const ph = (t * .5 + i / 3) % 1; puffCloud(c, -80 - ph * 18, -214 - ph * 46, 8 + ph * 10, i % 2 ? C.pinkL : '#ffffff', Math.sin(ph * Math.PI) * .95); } });
    shape(pRR(-48, -222, 96, 74, 32), mix(coat, '#ffffff', .2), { spec: .12 });
    fx(c => { const p = new Path2D(); p.arc(0, -224, 10, Math.PI, 0); p.closePath(); stk(c, p, acc, 2); glow(c, Math.cos(t * 5) * 14, -226, 30, acc, .55); });
    shape(pRR(-92, -162, 174, 128, 40), coat, { texA: .35, inner: c => { scratches(c, -70, -50, 1, -.3); scratches(c, 50, -140, .9, .2); } });
    fx(c => {
      const vp = rrP(-40, -206, 80, 44, 22); stk(c, vp, C.navy, 2.4);
      eye(c, -16, -184, 15, iris, { lid: .2 + P.crouch * .15, tilt: .45, lidCol: C.navy, blink: bl, look: [.6, .2], shut: P.hurt ? 1 : 0 });
      eye(c, 17, -184, 15, iris, { lid: .2 + P.crouch * .15, tilt: -.45, lidCol: C.navy, blink: bl, look: [.6, .2], shut: P.hurt ? -1 : 0 });
      stripeSticker(c, -6, -58, 120, 18, 0);
      warnSticker(c, -58, -122, 17, -.12);
      star(c, -22, -108, 11, acc, .2, true);
      heart(c, 4, -130, 9, C.cyan, .2, true);
      blush(c, -40, -150, 7);
    });
    // megaphone cannon
    const rec = P.strike, wob = Math.sin(t * 1.5 + sd) * .02;
    c.save(); c.translate(54 - rec * 14 + P.crouch * 4, -122 + P.crouch * 4); c.rotate(-.1 - rec * .1 + P.crouch * .08 + wob);
    shape(pRR(-18, -12, 30, 34, 9), C.navy, { sh: 3, spec: .1 });
    shape(pPts([[-4, -15, 1], [92, -42, 1], [92, 42, 1], [-4, 15, 1]]), C.yel, { inner: c => { c.fillStyle = acc; c.beginPath(); c.moveTo(38, -28); c.lineTo(54, -33); c.lineTo(54, 33); c.lineTo(38, 28); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(58, -34); c.lineTo(63, -35.5); c.lineTo(63, 35.5); c.lineTo(58, 34); c.closePath(); c.fill(); } });
    shape(pEll(94, 0, 13, 45), acc, { sh: 3, spec: .1 });
    shape(pEll(97, 0, 8, 36), C.navy, { b: 0, lw: 2.4, sh: 0, spec: 0, tex: 0, soft: 0, inner: c => { c.lineWidth = 3; c.strokeStyle = C.cyan; c.beginPath(); c.ellipse(98, 0, 4, 22 + Math.sin(t * 9) * 3, 0, 0, TAU); c.stroke(); } });
    if (P.strike > .05) fx(c => { waves(c, 108, 0, 0, P.strike, t, 1.7); if (P.strike > .3) { c.globalAlpha = P.strike; star(c, 118, 0, 18 + P.strike * 14, C.yel, t * 3, true); } });
    if (P.crouch > .2) fx(c => { c.globalAlpha = P.crouch; sparkle(c, 112, -40, 9, C.cyan); sparkle(c, 120, 36, 7, C.pinkL); });
    c.restore();
    shape(pPts(tube([[30, -96], [48, -86], [52 - rec * 10, -106]], [16, 14, 14])), dk, { sh: 2, spec: 0 }); mitt(56 - rec * 12, -108, 11, acc);
    if (P.hurt) fx(c => dizzy(c, 0, -246, t, 54));
    fx(c => { const ph = (t * .35 + sd * .1) % 1; c.globalAlpha = Math.sin(ph * Math.PI); note(c, -112 - ph * 10, -150 - ph * 50, 10, C.pinkL, -.2); });
  }
  const BOTS = { drone: [drone, 26, 52], twins: [wardens, 22, 150], siege: [siege, -14, 112] };
  function bot(c, s, p) {
    const vk = s.variant && BOTS[s.variant] ? s.variant : ({ 64: 'drone', 65: 'twins', 103: 'siege' })[s.seed] || ((s.scale || 1) >= 1.05 ? 'siege' : 'drone');
    const [fn, lunge, shw] = BOTS[vk], sd = s.seed || 64, P = begin(c, s, p);
    c.save();
    if (!p.noShadow) { if (vk === 'twins') { gShadow(c, -72, 70); gShadow(c, 40 + P.strike * lunge, 86); } else gShadow(c, P.strike * lunge, shw); }
    bounce(c, P, sd, lunge, vk === 'siege' ? -.06 : .1);
    fn(c, s, P, sd);
    c.restore(); flush(c);
  }

  // legacy helper kept for compatibility: paint a single point-list part immediately
  function part(c, pts, base, o) { CX = c; DL = []; shape(pPts(pts), base, Object.assign({ b: 0 }, o)); flush(c); }
  return { beast, blob, bot, part, tones, mix, Q };
})();

function drawBeast(c, s, p) { CRE_ART.beast(c, s, p); }
function drawBlob(c, s, p) { CRE_ART.blob(c, s, p); }
function drawBot(c, s, p) { CRE_ART.bot(c, s, p); }
