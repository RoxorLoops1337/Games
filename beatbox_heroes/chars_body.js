// BEATBOX HEROES -- chars_body.js
// Part 1 of the character renderer: the drawing kit (masks, banded shading), the skeleton / pose
// system, and the naked body (legs, torso, arms, head, face, marks, facial hair).
// Load order: pix, catalog, chars_body, chars_hair, chars_gear, chars (see the top of chars.js).
// Everything is painted into typed-array Pix buffers: no DOM, no canvas.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
  }
  const { Pix, PAL, ramp, mix, hsl, toHsl, C } = BBH;

  const W = 44, H = 64, CX = 21.5;         // sprite size and the mirror axis (pixels 21 and 22 are the middle pair)
  const HY = 11;                           // y of the top row of the head (before pose offsets)

  /* ------------------------------------------------------------------ masks */
  class Mask {
    constructor() { this.d = new Uint8Array(W * H); }
    get(x, y) { return x >= 0 && y >= 0 && x < W && y < H ? this.d[y * W + x] : 0; }
    set(x, y, v) { if (x >= 0 && y >= 0 && x < W && y < H) this.d[y * W + x] = v === undefined ? 1 : v; return this; }
    clone() { const m = new Mask(); m.d.set(this.d); return m; }
    rect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j); return this; }
    span(y, x0, x1) { for (let x = x0; x <= x1; x++) this.set(x, y); return this; }
    // pixel (x,y) has its centre at (x,y); symmetric shapes use cx = 21.5
    ellipse(cx, cy, rx, ry) {
      for (let y = Math.ceil(cy - ry - 0.01); y <= cy + ry + 0.01; y++) for (let x = Math.ceil(cx - rx - 0.01); x <= cx + rx + 0.01; x++) {
        const nx = (x - cx) / (rx + 0.001), ny = (y - cy) / (ry + 0.001);
        if (nx * nx + ny * ny <= 1.0) this.set(x, y);
      }
      return this;
    }
    // capsule from (x0,y0) to (x1,y1), radius r0 to r1; s0..s1 restrict the covered part of the segment
    capsule(x0, y0, x1, y1, r0, r1, s0, s1) {
      s0 = s0 === undefined ? 0 : s0; s1 = s1 === undefined ? 1 : s1;
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, rm = Math.max(r0, r1) + 1;
      for (let y = Math.floor(Math.min(y0, y1) - rm); y <= Math.ceil(Math.max(y0, y1) + rm); y++) {
        for (let x = Math.floor(Math.min(x0, x1) - rm); x <= Math.ceil(Math.max(x0, x1) + rm); x++) {
          const u = ((x - x0) * dx + (y - y0) * dy) / L2, c = u < 0 ? 0 : u > 1 ? 1 : u;
          if (u < s0 && !(s0 <= 0)) continue;
          if (u > s1 && !(s1 >= 1)) continue;
          if (u < s0 - 0.0001 && s0 > 0) continue;
          const px = x0 + dx * c, py = y0 + dy * c, r = r0 + (r1 - r0) * c;
          if ((x - px) * (x - px) + (y - py) * (y - py) <= r * r + 0.01) this.set(x, y);
        }
      }
      return this;
    }
    poly(pts) {
      let y0 = 1e9, y1 = -1e9;
      for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.001); x <= Math.floor(xs[i + 1] + 0.001); x++) this.set(x, y);
      }
      return this;
    }
    // rows of symmetric half widths: hw[i] covers y0+i, centred on CX
    rows(y0, hws, cx) {
      cx = cx === undefined ? CX : cx;
      for (let i = 0; i < hws.length; i++) { const h = hws[i]; for (let x = Math.ceil(cx - h + 0.5 - 0.001); x <= Math.floor(cx + h - 0.5 + 0.001); x++) this.set(x, y0 + i); }
      return this;
    }
    or(o) { for (let i = 0; i < this.d.length; i++) if (o.d[i]) this.d[i] = 1; return this; }
    sub(o) { for (let i = 0; i < this.d.length; i++) if (o.d[i]) this.d[i] = 0; return this; }
    and(o) { for (let i = 0; i < this.d.length; i++) if (!o.d[i]) this.d[i] = 0; return this; }
    clipY(y0, y1) { for (let y = 0; y < H; y++) if (y < y0 || y > y1) for (let x = 0; x < W; x++) this.d[y * W + x] = 0; return this; }
    shift(dx, dy) { const m = new Mask(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.d[y * W + x]) m.set(x + dx, y + dy); return m; }
    mirror() { const m = new Mask(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.d[y * W + x]) m.set(W - 1 - x, y); return m; }
    sym() { return this.or(this.mirror()); }
    grow() { const m = this.clone(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!this.d[y * W + x] && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) m.set(x, y); return m; }
    bounds() {
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.d[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : { x0, y0, x1, y1 };
    }
    each(fn) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.d[y * W + x]) fn(x, y); }
  }
  const M = () => new Mask();

  /* ---------------------------------------------------------------- shading */
  // Banded shading of a mask, light from the upper left. For every pixel we measure how far it is from the
  // lit edge (a) and the shaded edge (b) along the light diagonal; that gives hi/light/base/shade/deep bands
  // that read as a rounded volume at any size.
  // o: ctx (mask used to measure, default m), cap (4), hi (allow the hi band), deep (allow the deep band),
  //    bias (shift towards shade, +), dither (checker between bands), dir [dx,dy] toward the light,
  //    tip { rp, y0, y1, up } dyed tip gradient, fn(x,y,idx)->colour override
  function shade(P, m, rp, o) {
    o = o || {};
    const t = o.ctx || m, cap = o.cap || 4, dx = o.dir ? o.dir[0] : -1, dy = o.dir ? o.dir[1] : -1, bias = o.bias || 0;
    const cols = [rp.hi, rp.light, rp.base, rp.shade, rp.deep];
    const tp = o.tip;
    m.each((x, y) => {
      let a = 1, b = 1;
      while (a < cap && t.get(x + a * dx, y + a * dy)) a++;
      while (b < cap && t.get(x - b * dx, y - b * dy)) b++;
      let s = b - a - bias, i;
      if (o.dither && ((x + y) & 1) && (s === 1 || s === -1)) s += s > 0 ? 1 : -1;
      i = s >= 3 ? (o.hi ? 0 : 1) : s >= 2 ? 1 : s <= -3 ? (o.deep ? 4 : 3) : s <= -2 ? 3 : 2;
      let col = cols[i];
      if (tp) {
        let k = (y - tp.y0) / Math.max(1, tp.y1 - tp.y0); if (tp.up) k = 1 - k;
        const tc = [tp.rp.hi, tp.rp.light, tp.rp.base, tp.rp.shade, tp.rp.deep];
        const cut = tp.cut === undefined ? 0.62 : tp.cut;
        if (k > cut + 0.1 || (k > cut && ((x + y) & 1))) col = tc[i];
        else if (k > cut - 0.08 && !((x + y) & 1) && k > cut) col = tc[i];
      }
      if (o.fn) { const r = o.fn(x, y, i, col); if (r) col = r; }
      P.px(x, y, col);
    });
    return P;
  }
  const flat = (P, m, c) => { m.each((x, y) => P.px(x, y, c)); return P; };
  // darken/tint pixels that already exist in P (contact shadow, ambient occlusion)
  function darkenAt(P, m, col, k) {
    m.each((x, y) => { const a = P.alphaAt(x, y); if (a > 200) { const p = P.get(x, y); P.px(x, y, mix([p[0], p[1], p[2]], col, k)); } });
  }
  // pixels just outside mask m (4-neighbourhood) that are inside `within`
  function ring(m, within) {
    const r = M();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!m.d[y * W + x] && (!within || within.d[y * W + x]) && (m.get(x - 1, y) || m.get(x + 1, y) || m.get(x, y - 1) || m.get(x, y + 1))) r.set(x, y);
    return r;
  }
  const mirX = (x) => W - 1 - x;

  /* --------------------------------------------------------------- geometry */
  // per body type: torso half-widths per row (row 0 is y=29), head half-widths per row, shoulder x etc.
  const T0 = 29;                          // y of torso row 0
  const GEO = {
    boy: {
      sx: 13, tor: [3, 5, 7, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7], neck: 3, armR: [1.9, 1.6], legX: [18, 25], legR: [2.5, 2.0],
      head: [5, 7, 8, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 8, 6, 4], hip: 7, waist: 7,
    },
    neutral: {
      sx: 14, tor: [3, 5, 6, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], neck: 3, armR: [1.8, 1.5], legX: [18, 25], legR: [2.4, 1.9],
      head: [5, 7, 8, 9, 9, 10, 10, 10, 10, 10, 10, 10, 9, 9, 8, 7, 6, 4], hip: 6, waist: 6,
    },
    girl: {
      sx: 15, tor: [2, 4, 5, 6, 6, 6, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6], neck: 2, armR: [1.6, 1.4], legX: [18.5, 24.5], legR: [2.1, 1.7],
      head: [5, 7, 8, 9, 9, 10, 10, 10, 10, 10, 10, 10, 9, 9, 8, 7, 5, 3], hip: 6, waist: 5,
    },
  };

  /* ---------------------------------------------------------------- skeleton */
  const POSES = {
    idle: { frames: 2, fps: 2 }, walk: { frames: 4, fps: 8 }, beatbox: { frames: 4, fps: 9 }, dance: { frames: 4, fps: 8 },
    cheer: { frames: 2, fps: 5 }, sad: { frames: 2, fps: 2 }, sit: { frames: 2, fps: 2 }, point: { frames: 2, fps: 3 },
    battle: { frames: 2, fps: 4 }, finisher: { frames: 4, fps: 10 }, hit: { frames: 2, fps: 6 },
  };
  // Frame tables. Arms are [elbowOut, elbowDown, handOut, handDown] from the shoulder (out = away from the body).
  // legs: { L:{dx,lift}, R:{dx,lift} }; air: feet follow the body (a hop); spread: stance width
  const FR = {
    idle: [
      { dy: 0, L: [1, 5, 1, 10], R: [1, 5, 1, 10], mouth: 'smile', eyes: 'open' },
      { dy: 1, L: [1, 5, 1, 10], R: [1, 5, 1, 10], mouth: 'smile', eyes: 'open' },
    ],
    walk: [
      { dy: 0, L: [1, 5, 0, 11], R: [2, 5, 3, 8], legs: { L: [0, 0], R: [-1, 3] }, mouth: 'smile', eyes: 'open' },
      { dy: 1, L: [1, 5, 1, 10], R: [1, 5, 1, 10], legs: { L: [0, 0], R: [0, 0] }, mouth: 'smile', eyes: 'open' },
      { dy: 0, L: [2, 5, 3, 8], R: [1, 5, 0, 11], legs: { L: [1, 3], R: [0, 0] }, mouth: 'smile', eyes: 'open' },
      { dy: 1, L: [1, 5, 1, 10], R: [1, 5, 1, 10], legs: { L: [0, 0], R: [0, 0] }, mouth: 'smile', eyes: 'open' },
    ],
    beatbox: [
      { dy: 0, tx: 0, L: [1, 5, 1, 10], R: [2, 3, -4, -5], mouth: 'o', eyes: 'open', front: 'R', mic: 1 },
      { dy: 1, tx: 0, L: [2, 4, 2, 9], R: [2, 3, -4, -5], mouth: 'puff', eyes: 'happy', puff: 1, front: 'R', mic: 1 },
      { dy: 0, tx: 0, L: [1, 5, 1, 10], R: [2, 3, -4, -5], mouth: 'open', eyes: 'open', front: 'R', mic: 1 },
      { dy: 1, tx: 0, L: [2, 4, 2, 9], R: [2, 3, -4, -5], mouth: 'puff', eyes: 'happy', puff: 1, front: 'R', mic: 1 },
    ],
    dance: [
      { dy: 0, tx: -1, hd: [-1, 0], L: [3, -2, 5, -8], R: [3, -2, 5, -8], legs: { L: [-1, 0], R: [1, 3] }, mouth: 'grin', eyes: 'open' },
      { dy: 1, tx: 0, L: [3, 0, 6, -4], R: [3, -2, 5, -9], legs: { L: [0, 0], R: [0, 0] }, mouth: 'smile', eyes: 'happy' },
      { dy: 0, tx: 1, hd: [1, 0], L: [3, -2, 5, -8], R: [3, -2, 5, -8], legs: { L: [-1, 3], R: [1, 0] }, mouth: 'grin', eyes: 'open' },
      { dy: 1, tx: 0, L: [3, -2, 5, -9], R: [3, 0, 6, -4], legs: { L: [0, 0], R: [0, 0] }, mouth: 'smile', eyes: 'happy' },
    ],
    cheer: [
      { dy: -2, air: 1, L: [2, -3, 4, -10], R: [2, -3, 4, -10], mouth: 'grin', eyes: 'happy', legs: { L: [-1, 0], R: [1, 0] } },
      { dy: 0, L: [3, -2, 5, -8], R: [3, -2, 5, -8], mouth: 'grin', eyes: 'happy' },
    ],
    sad: [
      { dy: 1, hd: [0, 1], L: [0, 5, 0, 11], R: [0, 5, 0, 11], mouth: 'sad', eyes: 'down', brow: 'sad' },
      { dy: 1, hd: [0, 2], L: [0, 5, 0, 11], R: [0, 5, 0, 11], mouth: 'sad', eyes: 'down', brow: 'sad', tear: 1 },
    ],
    sit: [
      { dy: 6, sit: 1, L: [2, 4, -1, 9], R: [2, 4, -1, 9], mouth: 'smile', eyes: 'open' },
      { dy: 6, hd: [0, 1], sit: 1, L: [2, 4, -1, 9], R: [2, 4, -1, 9], mouth: 'smile', eyes: 'open' },
    ],
    point: [
      { dy: 0, L: [3, 3, 0, 7], R: [4, 0, 9, -2], mouth: 'smirk', eyes: 'open', brow: 'up', point: 'R' },
      { dy: 1, L: [3, 3, 0, 7], R: [4, 1, 9, -1], mouth: 'smirk', eyes: 'open', brow: 'up', point: 'R' },
    ],
    battle: [
      { dy: 1, spread: 2, L: [3, 3, -1, -1], R: [3, 3, -1, -2], mouth: 'grit', eyes: 'open', brow: 'angry', front: 'LR' },
      { dy: 0, spread: 2, L: [3, 3, -1, -2], R: [3, 3, -1, -1], mouth: 'grit', eyes: 'open', brow: 'angry', front: 'LR' },
    ],
    finisher: [
      { dy: 2, spread: 2, tx: 0, L: [3, 3, 6, 6], R: [3, 3, 6, 6], mouth: 'grit', eyes: 'open', brow: 'angry' },
      { dy: -3, air: 1, L: [4, 0, 8, 1], R: [2, -4, 3, -11], mouth: 'shout', eyes: 'closed', brow: 'angry', front: 'R', legs: { L: [-1, 0], R: [2, 0] } },
      { dy: -4, air: 1, L: [5, 0, 10, 0], R: [5, 0, 10, 0], mouth: 'shout', eyes: 'closed', brow: 'angry', legs: { L: [-2, 0], R: [2, 0] } },
      { dy: 1, spread: 1, L: [3, 3, 5, 6], R: [3, 3, 5, 6], mouth: 'grit', eyes: 'open', brow: 'angry' },
    ],
    hit: [
      { dy: 0, tx: -2, hd: [-1, 0], L: [4, 2, 6, 6], R: [3, 3, 4, 8], mouth: 'o', eyes: 'hurt', brow: 'sad' },
      { dy: 0, tx: -1, hd: [0, 1], L: [3, 3, 5, 8], R: [2, 4, 3, 9], mouth: 'open', eyes: 'hurt', brow: 'sad' },
    ],
  };

  const FOOT_Y = 58;                        // ankle row; shoes cover rows 58..62, the outline takes row 63
  // Build the skeleton for a body/pose/frame. opts: blink, mood override
  function skeleton(body, pose, frame, opts) {
    const G = GEO[body] || GEO.neutral, tbl = FR[pose] || FR.idle, f = tbl[((frame % tbl.length) + tbl.length) % tbl.length];
    opts = opts || {};
    const dy = f.dy || 0, tx = f.tx || 0, hd = f.hd || [0, 0];
    const S = {
      pose, frame, G, body, dy, tx, sit: !!f.sit, air: !!f.air, f,
      head: { x: CX + tx + hd[0], y: HY + dy + hd[1] },    // x = mirror axis of the head, y = top row
      sh: { L: [G.sx + tx, 32 + dy], R: [mirX(G.sx) + tx, 32 + dy] },
      face: { mouth: f.mouth || 'smile', eyes: f.eyes || 'open', brow: f.brow || 'neutral', puff: !!f.puff, tear: !!f.tear },
      front: f.front || '', mic: !!f.mic, point: f.point || '',
      arms: {}, legs: {},
    };
    if (opts.blink && S.face.eyes === 'open') S.face.eyes = 'blink';
    if (opts.mood) Object.assign(S.face, opts.mood);
    for (const side of ['L', 'R']) {
      const a = f[side], sg = side === 'L' ? -1 : 1, sh = S.sh[side];
      // out is away from the body: left arm goes -x, right arm +x
      S.arms[side] = { sh, el: [sh[0] + sg * a[0], sh[1] + a[1]], ha: [sh[0] + sg * a[2], sh[1] + a[3]] };
    }
    const spread = f.spread || 0;
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1, lg = (f.legs && f.legs[side]) || [0, 0];
      const hx = G.legX[side === 'L' ? 0 : 1];
      const lift = lg[1] + (S.air ? -dy : 0);
      const hipY = 44 + dy + (S.sit ? 0 : 0);
      if (S.sit) {
        S.legs[side] = { hip: [hx, hipY], kn: [hx + sg * 1.5, hipY + 5], ft: [hx + sg * 3, FOOT_Y], sit: true };
      } else {
        const fx = hx + sg * spread + lg[0] * (side === 'L' ? 1 : 1);
        S.legs[side] = { hip: [hx, hipY], kn: [(hx + fx) / 2, (hipY + FOOT_Y - lift) / 2], ft: [fx, FOOT_Y - lift - (S.air ? 0 : 0) + (S.air ? -dy * 0 : 0)], lift };
        if (S.air) S.legs[side].ft[1] = FOOT_Y + dy + 0 - dy * 0; // airborne feet rise with the body
        if (S.air) S.legs[side].ft[1] = FOOT_Y + dy - 0;
      }
    }
    return S;
  }

  /* ------------------------------------------------------------- body masks */
  // Build every body-part mask once per render; clothes reuse them so they fit every pose and body.
  function bodyMasks(S) {
    const G = S.G, B = {};
    // torso (includes the neck row), shifted with the pose
    const ty = T0 + S.dy;
    B.torso = M().rows(ty, G.tor);
    if (S.tx) B.torso = B.torso.shift(S.tx, 0);
    // hips block so legs join the torso
    B.arm = {}; B.armSeg = {}; B.hand = {};
    for (const side of ['L', 'R']) {
      const a = S.arms[side];
      B.armSeg[side] = (t0, t1, k) => armMask(a, G, t0, t1, k || 0);
      B.arm[side] = B.armSeg[side](0, 1);
      B.hand[side] = M().ellipse(a.ha[0], a.ha[1], 1.55, 1.55);
    }
    B.leg = {};
    for (const side of ['L', 'R']) B.leg[side] = legMask(S, side, 0, 1, 0);
    B.legSeg = (side, y0, y1, k) => legMask(S, side, y0, y1, k || 0);
    return B;
  }
  // an arm as two capsules; t runs 0..1 along shoulder-elbow-hand; k widens the sleeve
  function armMask(a, G, t0, t1, k) {
    const m = M(), r0 = G.armR[0] + k, r1 = G.armR[1] + k, rm = (r0 + r1) / 2 + 0.05;
    if (t0 < 0.5) m.capsule(a.sh[0], a.sh[1], a.el[0], a.el[1], r0, rm, Math.max(0, t0 * 2), Math.min(1, t1 * 2));
    if (t1 > 0.5) m.capsule(a.el[0], a.el[1], a.ha[0], a.ha[1], rm, r1, Math.max(0, t0 * 2 - 1), Math.min(1, t1 * 2 - 1));
    return m;
  }
  function legMask(S, side, y0, y1, k) {
    const L = S.legs[side], G = S.G, m = M();
    const r0 = G.legR[0] + k, r1 = G.legR[1] + k * 0.8;
    if (L.sit) {
      m.capsule(L.hip[0], L.hip[1], L.kn[0], L.kn[1], r0, r0 - 0.1);
      m.capsule(L.kn[0], L.kn[1], L.ft[0], L.ft[1], r0 - 0.1, r1);
    } else m.capsule(L.hip[0], L.hip[1], L.ft[0], L.ft[1], r0, r1);
    if (y0 !== 0 || y1 !== 1) { const yy0 = L.hip[1] + (L.ft[1] - L.hip[1]) * y0, yy1 = L.hip[1] + (L.ft[1] - L.hip[1]) * y1; m.clipY(Math.round(yy0), Math.round(yy1)); }
    return m;
  }
  // the hips: joins the two legs under the torso
  function hipMask(S) {
    const G = S.G, y = T0 + S.dy + 14, m = M().rows(y, [G.hip, G.hip, G.hip]);
    return S.tx ? m.shift(S.tx, 0) : m;
  }

  /* ------------------------------------------------------------- face parts */
  function headMask(S) {
    const G = S.G, m = M(), hws = G.head.slice();
    if (S.face.puff) for (let i = 11; i <= 15; i++) hws[i] += 1;
    m.rows(Math.round(S.head.y), hws, S.head.x);
    return m;
  }

  // Skin colours: ramp + derived feature colours
  function skinCols(skin) {
    const r = ramp(skin), [h, s, l] = toHsl(skin);
    const dark = l < 0.3, light = l > 0.78;
    // lash / lid colour: dark, cool, never pure black
    const lid = dark ? PAL.ink : mix(r.deep, PAL.ink, light ? 0.62 : 0.72);
    const lipBase = mix(r.base, '#c0446a', dark ? 0.35 : light ? 0.45 : 0.4);
    return {
      r, lid, dark, light, l,
      lip: mix(lipBase, r.shade, 0.15), lipHi: mix(lipBase, '#ffd6e0', 0.35),
      mouth: dark ? mix(PAL.ink, '#6a1a30', 0.5) : mix(r.deep, '#7a1f3a', 0.45),
      white: '#ffffff', whiteSh: dark ? '#cfc4e8' : mix('#cdc2e4', r.shade, 0.25),
      blush: mix(r.base, '#ff5f8f', dark ? 0.32 : 0.5),
    };
  }

  // eye patterns for the LEFT eye (outer corner is column 0). Rows start at head row 8.
  // D lid line, d lash, W white, w shaded white, I iris, i light iris, j dark iris, P pupil, S crease, . nothing
  const EYES = {
    round: ['DDDD', 'wPPw', 'WIIW', '.ii.'],
    sharp: ['.DDD', 'wPPD', 'WIIW', '..ii'],
    sleepy: ['DDDD', 'SjjS', 'WIIW'],
    wide: ['.DD.', 'DwPPwD'.slice(0, 4), 'WIIW', 'WIIW', '.ii.'],
    lashes: ['dDDD', 'wPPw', 'WIIW', '.ii.'],
    cat: ['dDDD', 'wPPw', 'WIIW', '..i.'],
    happy: ['....', '.DD.', 'D..D'],
    star: ['DDDD', 'wSSw', 'WSSW', '.SS.'],
  };
  function drawEyes(P, S, look, K) {
    const st = look.eyes.style, ey = S.face.eyes, hx = S.head.x, hy = Math.round(S.head.y);
    const ir = ramp(look.eyes.color), pup = mix(PAL.ink, look.eyes.color, 0.15);
    const lx = Math.round(hx) - 7;         // x of the left eye's first column
    let rows = EYES[st] || EYES.round;
    const top = hy + 8;
    const put = (side, rowsArr, dyo) => {
      for (let j = 0; j < rowsArr.length; j++) for (let i = 0; i < rowsArr[j].length; i++) {
        const ch = rowsArr[j][i]; if (ch === '.') continue;
        const x = side === 'L' ? lx + i : (Math.round(hx * 2) - 1 - lx - i);   // mirror about the head axis
        const y = top + j + (dyo || 0);
        let c;
        switch (ch) {
          case 'D': c = K.lid; break; case 'd': c = K.lid; break; case 'W': c = K.white; break; case 'w': c = K.whiteSh; break;
          case 'I': c = ir.base; break; case 'i': c = ir.light; break; case 'j': c = ir.deep; break; case 'P': c = pup; break;
          case 'S': c = K.r.shade; break; default: continue;
        }
        P.px(x, y, c);
      }
    };
    const both = (arr, dyo) => { put('L', arr, dyo); put('R', arr, dyo); };
    if (ey === 'blink' || ey === 'closed') {
      const arr = ey === 'closed' ? ['....', 'DDDD'] : ['....', 'DDDD'];
      both(arr, 1);
      if (st === 'lashes' || st === 'cat') { P.px(lx - 1, top + 1, K.lid); P.px(Math.round(hx * 2) - 1 - lx + 1, top + 1, K.lid); }
      return;
    }
    if (ey === 'happy') { both(EYES.happy, 0); if (st === 'lashes') { P.px(lx - 1, top + 2, K.lid); P.px(Math.round(hx * 2) - lx, top + 2, K.lid); } return; }
    if (ey === 'hurt') {   // > < squint
      const L = ['D...', '.DD.', 'D...'.split('').reverse().join('')];
      const arrL = ['DD..', '..DD', 'DD..'], arrR = ['..DD', 'DD..', '..DD'];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
        if (arrL[j][i] === 'D') P.px(lx + i, top + 1 + j, K.lid);
        if (arrR[j][i] === 'D') P.px(Math.round(hx * 2) - 1 - lx - 3 + i, top + 1 + j, K.lid);
      }
      return;
    }
    both(rows, ey === 'down' ? 1 : 0);
    if (!K.dark) { const rxs = Math.round(hx * 2) - 1 - lx; for (const j of [1, 2]) { P.px(lx - 1, top + j, K.r.shade); P.px(rxs + 1, top + j, K.r.shade); } }
    {
      const rxo = Math.round(hx * 2) - 1 - lx, fy = ey === 'down' ? 1 : 0;
      if (st === 'lashes') { P.px(lx - 1, top + fy, K.lid); P.px(lx - 1, top - 1 + fy, K.lid); P.px(rxo + 1, top + fy, K.lid); P.px(rxo + 1, top - 1 + fy, K.lid); }
      if (st === 'cat') { P.px(lx - 1, top - 1 + fy, K.lid); P.px(lx - 2, top - 2 + fy, K.lid); P.px(rxo + 1, top - 1 + fy, K.lid); P.px(rxo + 2, top - 2 + fy, K.lid); }
    }
    if (ey === 'down') {  // lids heavy: shade the first iris row
      for (const side of ['L', 'R']) for (let i = 0; i < 4; i++) { const x = side === 'L' ? lx + i : Math.round(hx * 2) - 1 - lx - i; P.px(x, top, K.lid); }
    }
    // star eyes: replace the iris with a sparkly star
    if (st === 'star') {
      for (const side of ['L', 'R']) {
        const x0 = side === 'L' ? lx : Math.round(hx * 2) - 1 - lx - 3;
        const sc = '#ffe14d';
        P.px(x0 + 1, top + 1, sc); P.px(x0 + 2, top + 2, sc); P.px(x0 + 1, top + 2, '#fff7b0'); P.px(x0 + 2, top + 1, sc); P.px(x0 + 1, top + 3, sc);
        P.px(x0 + 2, top + 3, ir.base); P.px(x0, top + 2, ir.light);
      }
    }
    // the highlight: upper-left of the iris in both eyes
    const hl = '#ffffff', yo = ey === 'down' ? 1 : 0;
    if (st === 'wide') { P.px(lx + 1, top + 2 + yo, hl); P.px(Math.round(hx * 2) - 1 - lx - 2, top + 2 + yo, hl); }
    else if (st !== 'star') { P.px(lx + 1, top + 1 + yo, hl); P.px(Math.round(hx * 2) - 1 - lx - 2, top + 1 + yo, hl); }
    else { P.px(lx + 1, top + 1, '#ffffff'); }
  }

  // eyebrows. shape arrays are per column of the LEFT brow (col 0 = outer): [dy...] with -1 = row above base
  const BROWS = {
    soft: [[1, 0, 0, 1]], straight: [[0, 0, 0, 0]], arched: [[1, 0, -1, 0]], thin: [[1, 0, 0, null]],
    thick: [[1, 0, 0, 0], [2, 1, 1, 1]], none: null,
  };
  function drawBrows(P, S, look, hairR) {
    const sh = BROWS[look.brows]; if (!sh) return;
    const hx = S.head.x, hy = Math.round(S.head.y), lx = Math.round(hx) - 7;
    const tilt = S.face.brow === 'angry' ? [-1, 0, 1, 2] : S.face.brow === 'sad' ? [1, 0, -1, -2] : S.face.brow === 'up' ? [0, -1, -1, 0] : [0, 0, 0, 0];
    const lift = S.face.brow === 'up' ? 0 : 0;
    const col = hairR ? hairR.shade : '#2a2024', base = hy + 6;
    sh.forEach((row, ri) => row.forEach((d, ci) => {
      if (d === null) return;
      const dy2 = d + tilt[ci] + (ri === 1 ? 0 : 0);
      const c = ri === 1 ? hairR.deep : col;
      P.px(lx + ci, base + dy2 + lift, c);
      P.px(Math.round(hx * 2) - 1 - (lx + ci), base + dy2 + lift, c);
    }));
  }

  function drawMouth(P, S, look, K) {
    const hx = Math.round(S.head.x), hy = Math.round(S.head.y), m = S.face.mouth, y = hy + 14, xl = hx - 1, xr = hx;  // centre pair xl,xr
    const dk = K.mouth, lip = K.lip, tg = '#ff6f8f', tooth = '#fffaf2';
    const px = (x, yy, c) => P.px(x, yy, c);
    if (m === 'smile') { px(xl, y + 1, dk); px(xr, y + 1, dk); px(xl - 1, y, dk); px(xr + 1, y, dk); }
    else if (m === 'closed') { for (let x = xl - 1; x <= xr + 1; x++) px(x, y, dk); }
    else if (m === 'smirk') { px(xl, y + 1, dk); px(xr, y + 1, dk); px(xr + 1, y, dk); px(xr + 2, y - 1, dk); }
    else if (m === 'sad') { px(xl, y, dk); px(xr, y, dk); px(xl - 1, y + 1, dk); px(xr + 1, y + 1, dk); }
    else if (m === 'grit') { for (let x = xl - 1; x <= xr + 1; x++) px(x, y + 1, dk); px(xl - 1, y, tooth); px(xl, y, tooth); px(xr, y, tooth); px(xr + 1, y, tooth); }
    else if (m === 'grin') {
      for (let x = xl - 1; x <= xr + 1; x++) px(x, y, dk);
      px(xl - 1, y + 1, dk); px(xr + 1, y + 1, dk);
      px(xl, y + 1, tooth); px(xr, y + 1, tooth); px(xl, y + 2, dk); px(xr, y + 2, dk); px(xl - 1, y + 2, K.r.shade);
    } else if (m === 'o') {
      px(xl, y, lip); px(xr, y, lip); px(xl - 1, y + 1, lip); px(xr + 1, y + 1, lip); px(xl - 1, y + 2, lip); px(xr + 1, y + 2, lip);
      px(xl, y + 1, dk); px(xr, y + 1, dk); px(xl, y + 2, dk); px(xr, y + 2, dk); px(xl, y + 3, lip); px(xr, y + 3, lip);
    } else if (m === 'puff') { px(xl, y + 1, dk); px(xr, y + 1, dk); px(xl - 1, y, dk); px(xr + 1, y, dk); }
    else if (m === 'open') {
      for (let x = xl - 1; x <= xr + 1; x++) px(x, y, lip);
      for (let x = xl - 1; x <= xr + 1; x++) px(x, y + 1, dk); px(xl, y + 1, dk);
      px(xl, y + 2, tg); px(xr, y + 2, tg); px(xl - 1, y + 2, dk); px(xr + 1, y + 2, dk); px(xl, y + 3, dk); px(xr, y + 3, dk);
    } else if (m === 'shout') {
      for (let x = xl - 2; x <= xr + 2; x++) px(x, y - 1, tooth);
      for (let x = xl - 2; x <= xr + 2; x++) px(x, y, dk);
      for (let x = xl - 2; x <= xr + 2; x++) px(x, y + 1, dk);
      px(xl - 1, y + 2, dk); px(xl, y + 2, tg); px(xr, y + 2, tg); px(xr + 1, y + 2, dk); px(xl, y + 3, lip); px(xr, y + 3, lip);
      px(xl - 2, y + 1, K.r.shade); px(xr + 2, y + 1, K.r.shade);
    }
  }

  function drawNose(P, S, K) {
    const hx = Math.round(S.head.x), hy = Math.round(S.head.y);
    P.px(hx, hy + 12, K.r.shade);
    if (K.l > 0.25) P.px(hx - 1, hy + 11, K.r.light);
  }

  // face marks use their own colours; they sit on the cheeks, not on the features
  function drawMarks(P, S, look, K) {
    const hx = Math.round(S.head.x), hy = Math.round(S.head.y), has = (id) => look.marks.indexOf(id) >= 0;
    const px = (x, y, c, a) => P.px(x, y, c, a);
    const ax = hx * 2;                       // mirror helper: x' = ax - 1 - x
    const mr = (x) => ax - 1 - x;
    if (has('freckles')) {
      const fc = K.dark ? mix(K.r.light, '#e0a070', 0.3) : mix(K.r.deep, '#a05030', 0.45);
      for (const [x, y] of [[15, 12], [17, 13], [19, 12], [16, 14], [18, 11]]) { const xx = x - 21 + hx; px(xx, hy + y - 3 + 0, fc); px(mr(xx), hy + y - 3 + (x % 2 ? 0 : 1), fc); }
    }
    if (has('blush')) {
      for (const xx of [hx - 8, hx - 7, hx - 6]) { px(xx, hy + 12, K.blush); px(mr(xx), hy + 12, K.blush); }
      for (const xx of [hx - 7, hx - 6]) { px(xx, hy + 13, K.blush); px(mr(xx), hy + 13, K.blush); }
    }
    if (has('beauty')) px(hx + 4, hy + 15, K.dark ? '#120d1f' : '#3a2230');
    if (has('scar')) {
      const sc = K.dark ? '#b88a80' : '#e8a0a0';
      px(hx + 5, hy + 7, sc); px(hx + 5, hy + 8, sc); px(hx + 6, hy + 9, sc); px(hx + 6, hy + 10, sc); px(hx + 7, hy + 11, sc);
      px(hx + 4, hy + 9, '#fff0e8'); px(hx + 7, hy + 9, '#fff0e8');
    }
    if (has('bandaid')) {
      const bc = '#f2c9a0', bd = '#d8a070';
      P.rect(hx + 3, hy + 12, 5, 2, bc); px(hx + 3, hy + 12, bd); px(hx + 7, hy + 13, bd); px(hx + 5, hy + 12, '#e2b080'); px(hx + 5, hy + 13, '#e2b080');
    }
    if (has('starpaint')) {
      const c1 = '#2ee6ff', c2 = '#e8ffff';
      const sx = hx - 7, sy = hy + 12;
      px(sx, sy - 1, c1); px(sx - 1, sy, c1); px(sx, sy, c2); px(sx + 1, sy, c1); px(sx, sy + 1, c1);
    }
    if (has('tear')) { const tc = '#2a4fd6'; px(hx - 7, hy + 12, tc); px(hx - 7, hy + 13, tc); px(hx - 7, hy + 14, '#6a8fff'); px(hx - 8, hy + 14, tc); px(hx - 6, hy + 14, tc); }
    if (has('warpaint')) {
      const rc = '#ff2f4f', wc = '#fff6e8';
      for (const s of [1, -1]) { const sx2 = s < 0 ? hx - 8 : mr(hx - 8) - 3; P.rect(sx2, hy + 12, 4, 1, rc); P.rect(sx2 + (s < 0 ? 0 : 0), hy + 13, 4, 1, wc); px(sx2 + (s < 0 ? 0 : 3), hy + 11, rc); }
    }
    if (S.face.tear) { px(hx - 7, hy + 12, '#8fc0ff'); px(hx - 7, hy + 13, '#cfe6ff'); }
  }

  // facial hair (hair colour)
  function drawFacial(P, S, look, hairR, hcol) {
    const id = look.facial; if (id === 'none') return;
    const hx = Math.round(S.head.x), hy = Math.round(S.head.y), hr = hairR;
    const jaw = M();
    const hm = headMask(S);
    const px = (x, y, c) => P.px(x, y, c);
    if (id === 'stubble') {
      hm.each((x, y) => { if (y >= hy + 13 && ((x + y) & 1) && !(y <= hy + 14 && x > hx - 3 && x < hx + 2)) px(x, y, hr.shade); });
      for (let x = hx - 3; x <= hx + 2; x++) if (!((x + hy) & 1)) px(x, hy + 12, hr.shade);
      return;
    }
    if (id === 'mustache' || id === 'goatee' || id === 'beard' || id === 'longbeard') {
      // moustache part (all of them have it)
      const my = hy + 13;
      px(hx - 3, my, hr.base); px(hx - 2, my, hr.light); px(hx - 1, my, hr.base); px(hx, my, hr.base); px(hx + 1, my, hr.shade); px(hx + 2, my, hr.shade);
      px(hx - 3, my + 1, hr.shade); px(hx + 2, my + 1, hr.deep); px(hx - 4, my + 1, hr.deep); px(hx + 3, my + 1, hr.deep);
      if (id === 'mustache') return;
      if (id === 'goatee') {
        const g = M(); g.rows(hy + 15, [3, 3, 3, 2]);
        const gm = M().rows(hy + 15, [3, 3, 3]).shift(Math.round(hx - 22 + 0), 0);
        shade(P, gm.and(hm), hr, { cap: 3 });
        return;
      }
      // full beard: covers jaw from the sideburns around the chin, leaving the mouth open
      const bm = M();
      hm.each((x, y) => {
        const r = y - hy;
        if (r >= 11 && (Math.abs(x - (hx - 0.5)) > 5.5 - (r - 11) * 0.0 || r >= 15)) bm.set(x, y);
        if (r >= 12 && r < 15 && Math.abs(x - (hx - 0.5)) >= 4.5) bm.set(x, y);
        if (r >= 15) bm.set(x, y);
      });
      // lip / mouth hole
      for (let x = hx - 3; x <= hx + 2; x++) for (let y = hy + 14; y <= hy + 14; y++) bm.set(x, y, 0);
      bm.set(hx - 4, hy + 14, 0); bm.set(hx + 3, hy + 14, 0);
      for (let x = hx - 3; x <= hx + 2; x++) bm.set(x, hy + 13, 0);
      if (id === 'longbeard') {
        const ext = M().rows(hy + 18, [5, 5, 4, 4, 3, 2]).shift(Math.round(hx - 22), 0);
        bm.or(ext);
      }
      shade(P, bm, hr, { cap: 3, ctx: bm });
      // strand lines
      bm.each((x, y) => { if (y > hy + 15 && ((x * 3 + y) % 5 === 0)) px(x, y, hr.shade); });
      // moustache again on top
      px(hx - 3, my, hr.base); px(hx - 2, my, hr.light); px(hx - 1, my, hr.base); px(hx, my, hr.base); px(hx + 1, my, hr.shade); px(hx + 2, my, hr.shade);
    }
  }

  /* ------------------------------------------------------------ body drawing */
  function drawLegs(P, S, B, K) {
    const order = S.sit ? ['L', 'R'] : ['L', 'R'];
    for (const side of order) shade(P, B.leg[side], K.r, { cap: 3 });
  }
  function drawTorsoSkin(P, S, B, K) {
    const tm = B.torso.clone().or(hipMask(S));
    shade(P, tm, K.r, { cap: 4 });
    // neck: shadow under the chin
    return tm;
  }
  function drawArmSkin(P, S, B, K, side) {
    shade(P, B.arm[side], K.r, { cap: 3 });
    shade(P, B.hand[side], K.r, { cap: 3, hi: false });
  }

  function drawHeadSkin(P, S, look, K) {
    const hm = headMask(S), hy = Math.round(S.head.y), hx = S.head.x;
    // ears first (the head covers their inner part)
    const ear = M();
    for (const sg of [-1, 1]) { const ex = Math.round(hx + sg * 10.5); ear.rect(ex - (sg < 0 ? 0 : 0), hy + 8, 1, 4); ear.set(ex, hy + 12, 0); }
    for (const sg of [-1, 1]) { const ex = Math.round(hx + sg * 10.5 + (sg < 0 ? 0 : 0)); P.px(ex, hy + 9, K.r.base); P.px(ex, hy + 10, K.r.shade); P.px(ex, hy + 11, K.r.shade); P.px(ex, hy + 8, K.r.light); }
    // neck
    const nk = M().rows(hy + 15, [S.G.neck, S.G.neck, S.G.neck, S.G.neck, S.G.neck]);
    flat(P, nk, K.r.shade);
    nk.each((x, y) => { if (y >= hy + 17) P.px(x, y, mix(K.r.shade, K.r.deep, 0.5)); });
    shade(P, hm, K.r, { cap: 4, hi: false });
    return hm;
  }

  Object.assign(BBH, {
    CharsKit: {
      W, H, CX, HY, T0, GEO, POSES, FR, FOOT_Y, Mask, M, shade, flat, darkenAt, ring, mirX, skeleton, bodyMasks, armMask, legMask, hipMask, headMask,
      skinCols, drawEyes, drawBrows, drawMouth, drawNose, drawMarks, drawFacial, drawLegs, drawTorsoSkin, drawArmSkin, drawHeadSkin,
    },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsKit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
