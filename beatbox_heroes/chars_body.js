// BEATBOX HEROES -- chars_body.js
// Part 1 of the character renderer: the drawing kit, the skeleton / pose system and the naked body
// (legs, torso, arms, head, ears, face, marks, facial hair).
// Load order: pix, catalog, chars_body, chars_hair, chars_gear, chars (see the top of chars.js).
//
// RESOLUTION MODEL. All art is authored in "design units" (the old 44x64 grid: x 0..43, y 0..63, mirror axis
// 21.5) and rasterised natively onto the CURRENT grid (Kit.setGrid). The game sprite grid is 58x85; the
// portrait uses a bigger grid (about 2.6x design) so heads get real detail instead of doubled pixels.
// Masks are rasterised at native resolution (smooth edges, native banded shading), 1px details (dots, lines)
// are 1 native pixel at sprite scale and 2 at portrait scale. Nothing is blurred or anti-aliased.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
  }
  const { Pix, PAL, ramp, mix, toHsl } = BBH;

  /* ------------------------------------------------------------------- grid */
  const DW = 44, DH = 64, CX = 21.5, HY = 11;          // design size, mirror axis, head top row
  const GR = { W: 58, H: 85, kx: 58 / 44, ky: 85 / 64, k: 1.323, t: 1 };
  function setGrid(W, H) {
    GR.W = W; GR.H = H; GR.kx = W / DW; GR.ky = H / DH; GR.k = (GR.kx + GR.ky) / 2;
    GR.t = Math.max(1, Math.round(GR.k * 0.72));
  }
  const X = (x) => (x + 0.5) * GR.kx - 0.5, Y = (y) => (y + 0.5) * GR.ky - 0.5;       // design pixel centre -> native centre
  const iX = (n) => (n + 0.5) / GR.kx - 0.5, iY = (n) => (n + 0.5) / GR.ky - 0.5;     // native -> design
  const nx = (dx) => Math.round(dx * GR.kx), ny = (dy) => Math.round(dy * GR.ky);       // design offset -> native offset
  const T0 = 29;                                                                       // torso row 0 (design y)

  /* ------------------------------------------------------------------ masks */
  // Masks hold native pixels; the construction API takes DESIGN coordinates (pixel centres, like the old grid).
  class Mask {
    constructor() { this.w = GR.W; this.h = GR.H; this.d = new Uint8Array(this.w * this.h); }
    get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
    set(x, y, v) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = v === undefined ? 1 : v; return this; }
    clone() { const m = new Mask(); m.d.set(this.d); return m; }
    // native bounding box covering a design box
    static box(x0, y0, x1, y1) {
      return [Math.max(0, Math.floor((x0 + 0.5) * GR.kx) - 1), Math.max(0, Math.floor((y0 + 0.5) * GR.ky) - 1), Math.min(GR.W - 1, Math.ceil((x1 + 0.5) * GR.kx) + 1), Math.min(GR.H - 1, Math.ceil((y1 + 0.5) * GR.ky) + 1)];
    }
    // arbitrary analytic shape: f(x, y) gets DESIGN coordinates of each native pixel centre
    fn(x0, y0, x1, y1, f) {
      const b = Mask.box(x0, y0, x1, y1);
      for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) if (f(iX(x), iY(y))) this.set(x, y);
      return this;
    }
    // design pixel rectangle (covers design pixels x..x+w-1, y..y+h-1)
    rect(x, y, w, h) {
      const x0 = Math.round(x * GR.kx), x1 = Math.round((x + w) * GR.kx) - 1, y0 = Math.round(y * GR.ky), y1 = Math.round((y + h) * GR.ky) - 1;
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) this.set(i, j);
      return this;
    }
    span(y, x0, x1) { return this.rect(x0, y, x1 - x0 + 1, 1); }
    ellipse(cx, cy, rx, ry) {
      const ncx = X(cx), ncy = Y(cy), rX = (rx + 0.5) * GR.kx - 0.5 + 0.02, rY = (ry + 0.5) * GR.ky - 0.5 + 0.02;
      for (let y = Math.max(0, Math.floor(ncy - rY)); y <= Math.min(GR.H - 1, Math.ceil(ncy + rY)); y++) for (let x = Math.max(0, Math.floor(ncx - rX)); x <= Math.min(GR.W - 1, Math.ceil(ncx + rX)); x++) {
        const a = (x - ncx) / rX, b = (y - ncy) / rY;
        if (a * a + b * b <= 1) this.set(x, y);
      }
      return this;
    }
    capsule(x0, y0, x1, y1, r0, r1, s0, s1) {
      s0 = s0 === undefined ? 0 : s0; s1 = s1 === undefined ? 1 : s1;
      const ax = X(x0), ay = Y(y0), bx = X(x1), by = Y(y1), dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const R0 = (r0 + 0.5) * GR.k - 0.62, R1 = (r1 + 0.5) * GR.k - 0.62, rm = Math.max(R0, R1) + 1;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - rm)); y <= Math.min(GR.H - 1, Math.ceil(Math.max(ay, by) + rm)); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - rm)); x <= Math.min(GR.W - 1, Math.ceil(Math.max(ax, bx) + rm)); x++) {
          const u = ((x - ax) * dx + (y - ay) * dy) / L2, c = u < 0 ? 0 : u > 1 ? 1 : u;
          if (u < s0 && s0 > 0) continue;
          if (u > s1 && s1 < 1) continue;
          const px = ax + dx * c, py = ay + dy * c, r = R0 + (R1 - R0) * c;
          if ((x - px) * (x - px) + (y - py) * (y - py) <= r * r + 0.01) this.set(x, y);
        }
      }
      return this;
    }
    // polygon, vertices in design pixel-centre coordinates
    poly(pts) {
      const P = pts.map((p) => [X(p[0]), Y(p[1])]);
      let y0 = 1e9, y1 = -1e9;
      for (const p of P) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      for (let y = Math.max(0, Math.ceil(y0)); y <= Math.min(GR.H - 1, Math.floor(y1)); y++) {
        const xs = [];
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.001); x <= Math.floor(xs[i + 1] + 0.001); x++) this.set(x, y);
      }
      return this;
    }
    // symmetric silhouette: hws[i] is the half width (in design px) of design row y0+i, centred on cx.
    // The outline runs smoothly through the row centres, so it rasterises cleanly at any grid.
    rows(y0, hws, cx) {
      cx = cx === undefined ? CX : cx;
      const n = hws.length, L = [], R = [];
      L.push([cx - hws[0], y0 - 0.5]); R.push([cx + hws[0], y0 - 0.5]);
      for (let i = 0; i < n; i++) { L.push([cx - hws[i], y0 + i]); R.push([cx + hws[i], y0 + i]); }
      L.push([cx - hws[n - 1], y0 + n - 0.5]); R.push([cx + hws[n - 1], y0 + n - 0.5]);
      return this.poly(L.concat(R.reverse()));
    }
    or(o) { for (let i = 0; i < this.d.length; i++) if (o.d[i]) this.d[i] = 1; return this; }
    sub(o) { for (let i = 0; i < this.d.length; i++) if (o.d[i]) this.d[i] = 0; return this; }
    and(o) { for (let i = 0; i < this.d.length; i++) if (!o.d[i]) this.d[i] = 0; return this; }
    // keep design rows y0..y1 (inclusive)
    clipY(y0, y1) {
      const a = Math.round(y0 * GR.ky), b = Math.round((y1 + 1) * GR.ky) - 1;
      for (let y = 0; y < this.h; y++) if (y < a || y > b) for (let x = 0; x < this.w; x++) this.d[y * this.w + x] = 0;
      return this;
    }
    clipX(x0, x1) {
      const a = Math.round(x0 * GR.kx), b = Math.round((x1 + 1) * GR.kx) - 1;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (x < a || x > b) this.d[y * this.w + x] = 0;
      return this;
    }
    shiftN(dx, dy) { const m = new Mask(); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) m.set(x + dx, y + dy); return m; }
    shift(dx, dy) { return dx || dy ? this.shiftN(nx(dx), ny(dy)) : this; }          // design offset
    mirror() { const m = new Mask(); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) m.set(this.w - 1 - x, y); return m; }
    sym() { return this.or(this.mirror()); }
    grow(n) { let m = this; for (let k = 0; k < (n || 1); k++) { const g = m.clone(); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (!m.d[y * this.w + x] && (m.get(x - 1, y) || m.get(x + 1, y) || m.get(x, y - 1) || m.get(x, y + 1))) g.set(x, y); m = g; } return m === this ? this.clone() : m; }
    growD(vol) { return this.grow(Math.max(1, Math.round(vol * GR.k))); }               // grow by design pixels
    bounds() {
      let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : { x0, y0, x1, y1 };
    }
    each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) fn(x, y); }
    count() { let n = 0; for (let i = 0; i < this.d.length; i++) if (this.d[i]) n++; return n; }
  }
  const M = () => new Mask();

  /* ---------------------------------------------------------------- painter */
  // D paints in DESIGN coordinates onto a Pix: dots are t x t native pixels, lines are t thick.
  class Painter {
    constructor(P) { this.P = P; this.ox = 0; this.oy = 0; }
    shift(dx, dy) { this.ox = nx(dx); this.oy = ny(dy); return this; }
    shiftN(x, y) { this.ox = x; this.oy = y; return this; }
    px(x, y, c, a) { const t = GR.t, X0 = Math.round(X(x) - (t - 1) / 2) + this.ox, Y0 = Math.round(Y(y) - (t - 1) / 2) + this.oy; for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) this.P.px(X0 + i, Y0 + j, c, a); return this; }
    n(x, y, c, a) { this.P.px(x + this.ox, y + this.oy, c, a); return this; }
    add(x, y, c, a) { const t = GR.t, X0 = Math.round(X(x) - (t - 1) / 2) + this.ox, Y0 = Math.round(Y(y) - (t - 1) / 2) + this.oy; for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) this.P.add(X0 + i, Y0 + j, c, a); return this; }
    hl(x0, x1, y, c, th) { const t = th || GR.t, a = Math.round(X(Math.min(x0, x1))) + this.ox, b = Math.round(X(Math.max(x0, x1))) + this.ox, Y0 = Math.round(Y(y) - (t - 1) / 2) + this.oy; for (let j = 0; j < t; j++) for (let i = a; i <= b; i++) this.P.px(i, Y0 + j, c); return this; }
    vl(x, y0, y1, c, th) { const t = th || GR.t, a = Math.round(Y(Math.min(y0, y1))) + this.oy, b = Math.round(Y(Math.max(y0, y1))) + this.oy, X0 = Math.round(X(x) - (t - 1) / 2) + this.ox; for (let j = a; j <= b; j++) for (let i = 0; i < t; i++) this.P.px(X0 + i, j, c); return this; }
    line(x0, y0, x1, y1, c, th) {
      const t = th || GR.t, a = Math.round(X(x0)) + this.ox, b = Math.round(Y(y0)) + this.oy, e = Math.round(X(x1)) + this.ox, f = Math.round(Y(y1)) + this.oy;
      if (t === 1) this.P.line(a, b, e, f, c); else this.P.line(a, b, e, f, c, t);
      return this;
    }
    poly(pts, c, th) { for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, th); return this; }
    rect(x, y, w, h, c) {
      const x0 = Math.round(x * GR.kx) + this.ox, x1 = Math.round((x + w) * GR.kx) + this.ox, y0 = Math.round(y * GR.ky) + this.oy, y1 = Math.round((y + h) * GR.ky) + this.oy;
      this.P.rect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), c); return this;
    }
    get(x, y) { return this.P.get(Math.round(X(x)) + this.ox, Math.round(Y(y)) + this.oy); }
    mask(m, c) { m.each((x, y) => this.P.px(x + this.ox, y + this.oy, c)); return this; }
  }

  /* ---------------------------------------------------------------- shading */
  // Banded shading of a mask, light from the upper left. For each pixel we measure how far it is from the lit
  // edge (a) and the shaded edge (b) along the light diagonal, in design units; that gives hi/light/base/shade/deep
  // bands that read as a rounded volume at any size. P is a RAW Pix and the mask must already sit at its final place.
  // o: ctx (mask used to measure), cap (design px), hi, deep, bias, dither, dir, tip {rp,y0,y1,up,cut}, fn(x,y,i,col)
  function shade(P, m, rp, o) {
    o = o || {};
    const t = o.ctx || m, k = GR.k, cap = Math.max(2, Math.round((o.cap || 4) * k)), dx = o.dir ? o.dir[0] : -1, dy = o.dir ? o.dir[1] : -1, bias = o.bias || 0;
    const cols = [rp.hi, rp.light, rp.base, rp.shade, rp.deep], tp = o.tip;
    const tc = tp ? [tp.rp.hi, tp.rp.light, tp.rp.base, tp.rp.shade, tp.rp.deep] : null;
    m.each((x, y) => {
      let a = 1, b = 1;
      while (a < cap && t.get(x + a * dx, y + a * dy)) a++;
      while (b < cap && t.get(x - b * dx, y - b * dy)) b++;
      let s = (b - a) / k - bias;
      if (o.dither) { const f = s - Math.round(s); if (Math.abs(f) > 0.28 && ((x + y) & 1)) s += f > 0 ? 0.6 : -0.6; }
      const i = s >= 2.9 ? (o.hi ? 0 : 1) : s >= 1.9 ? 1 : s <= -2.9 ? (o.deep ? 4 : 3) : s <= -1.9 ? 3 : 2;
      let col = cols[i];
      if (tp) {
        let q = (y - tp.y0) / Math.max(1, tp.y1 - tp.y0); if (tp.up) q = 1 - q;
        const cut = tp.cut === undefined ? 0.62 : tp.cut;
        if (q > cut + 0.08 || (q > cut - 0.02 && ((x + y) & 1))) col = tc[i];
      }
      if (o.fn) { const r = o.fn(x, y, i, col); if (r) col = r; }
      P.px(x, y, col);
    });
    return P;
  }
  const flat = (P, m, c) => { m.each((x, y) => P.px(x, y, c)); return P; };
  function darkenAt(P, m, col, k) {
    m.each((x, y) => { if (P.alphaAt(x, y) > 200) { const p = P.get(x, y); P.px(x, y, mix([p[0], p[1], p[2]], col, k)); } });
  }
  // pixels just outside mask m (4-neighbourhood), optionally restricted to `within`
  function ring(m, within) {
    const r = M();
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (!m.d[y * m.w + x] && (!within || within.d[y * m.w + x]) && (m.get(x - 1, y) || m.get(x + 1, y) || m.get(x, y - 1) || m.get(x, y + 1))) r.set(x, y);
    return r;
  }
  // pixels of m whose neighbour at offset (ox,oy) native is outside m
  function edge(m, ox, oy) { const r = M(); m.each((x, y) => { if (!m.get(x + ox, y + oy)) r.set(x, y); }); return r; }
  const mirX = (x) => DW - 1 - x;

  /* --------------------------------------------------------------- geometry */
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
  // Arms are [elbowOut, elbowDown, handOut, handDown] from the shoulder (out = away from the body), design units.
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
      { dy: 0, L: [1, 5, 1, 10], R: [2, 3, -4, -5], mouth: 'o', eyes: 'open', front: 'R', mic: 1 },
      { dy: 1, L: [2, 4, 2, 9], R: [2, 3, -4, -5], mouth: 'puff', eyes: 'happy', puff: 1, front: 'R', mic: 1 },
      { dy: 0, L: [1, 5, 1, 10], R: [2, 3, -4, -5], mouth: 'open', eyes: 'open', front: 'R', mic: 1 },
      { dy: 1, L: [2, 4, 2, 9], R: [2, 3, -4, -5], mouth: 'puff', eyes: 'happy', puff: 1, front: 'R', mic: 1 },
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
      { dy: 2, spread: 2, L: [3, 3, 6, 6], R: [3, 3, 6, 6], mouth: 'grit', eyes: 'open', brow: 'angry' },
      { dy: -3, air: 1, L: [4, 0, 8, 1], R: [2, -4, 3, -11], mouth: 'shout', eyes: 'closed', brow: 'angry', front: 'R', legs: { L: [-1, 0], R: [2, 0] } },
      { dy: -4, air: 1, L: [5, 0, 10, 0], R: [5, 0, 10, 0], mouth: 'shout', eyes: 'closed', brow: 'angry', legs: { L: [-2, 0], R: [2, 0] } },
      { dy: 1, spread: 1, L: [3, 3, 5, 6], R: [3, 3, 5, 6], mouth: 'grit', eyes: 'open', brow: 'angry' },
    ],
    hit: [
      { dy: 0, tx: -2, hd: [-1, 0], L: [4, 2, 6, 6], R: [3, 3, 4, 8], mouth: 'o', eyes: 'hurt', brow: 'sad' },
      { dy: 0, tx: -1, hd: [0, 1], L: [3, 3, 5, 8], R: [2, 4, 3, 9], mouth: 'open', eyes: 'hurt', brow: 'sad' },
    ],
  };
  const FOOT_Y = 58;
  function skeleton(body, pose, frame, opts) {
    const G = GEO[body] || GEO.neutral, tbl = FR[pose] || FR.idle, f = tbl[((frame % tbl.length) + tbl.length) % tbl.length];
    opts = opts || {};
    const dy = f.dy || 0, tx = f.tx || 0, hd = f.hd || [0, 0];
    const S = {
      pose, frame, G, body, dy, tx, sit: !!f.sit, air: !!f.air, f,
      head: { x: CX + tx + hd[0], y: HY + dy + hd[1] },     // x = mirror axis of the head, y = top row (design units)
      sh: { L: [G.sx + tx, 32 + dy], R: [mirX(G.sx) + tx, 32 + dy] },
      face: { mouth: f.mouth || 'smile', eyes: f.eyes || 'open', brow: f.brow || 'neutral', puff: !!f.puff, tear: !!f.tear },
      front: f.front || '', mic: !!f.mic, point: f.point || '', arms: {}, legs: {},
    };
    if (opts.blink && S.face.eyes === 'open') S.face.eyes = 'blink';
    if (opts.mood) Object.assign(S.face, opts.mood);
    for (const side of ['L', 'R']) {
      const a = f[side], sg = side === 'L' ? -1 : 1, sh = S.sh[side];
      S.arms[side] = { sh, el: [sh[0] + sg * a[0], sh[1] + a[1]], ha: [sh[0] + sg * a[2], sh[1] + a[3]] };
    }
    const spread = f.spread || 0;
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1, lg = (f.legs && f.legs[side]) || [0, 0], hx = G.legX[side === 'L' ? 0 : 1];
      const lift = lg[1] + (S.air ? -dy : 0), hipY = 44 + dy;
      if (S.sit) S.legs[side] = { hip: [hx, hipY], kn: [hx + sg * 1.5, hipY + 5], ft: [hx + sg * 3, FOOT_Y], sit: true };
      else {
        const fx = hx + sg * spread + lg[0];
        S.legs[side] = { hip: [hx, hipY], kn: [(hx + fx) / 2, (hipY + FOOT_Y - lift) / 2], ft: [fx, S.air ? FOOT_Y + dy : FOOT_Y - lift], lift };
      }
    }
    return S;
  }

  /* ------------------------------------------------------------- body masks */
  function armMask(a, G, t0, t1, k) {
    const m = M(), r0 = G.armR[0] + k, r1 = G.armR[1] + k, rm = (r0 + r1) / 2 + 0.05;
    if (t0 < 0.5) m.capsule(a.sh[0], a.sh[1], a.el[0], a.el[1], r0, rm, Math.max(0, t0 * 2), Math.min(1, t1 * 2));
    if (t1 > 0.5) m.capsule(a.el[0], a.el[1], a.ha[0], a.ha[1], rm, r1, Math.max(0, t0 * 2 - 1), Math.min(1, t1 * 2 - 1));
    return m;
  }
  function legMask(S, side, y0, y1, k) {
    const L = S.legs[side], G = S.G, m = M(), r0 = G.legR[0] + k, r1 = G.legR[1] + k * 0.8;
    if (L.sit) { m.capsule(L.hip[0], L.hip[1], L.kn[0], L.kn[1], r0, r0 - 0.1); m.capsule(L.kn[0], L.kn[1], L.ft[0], L.ft[1], r0 - 0.1, r1); }
    else m.capsule(L.hip[0], L.hip[1], L.ft[0], L.ft[1], r0, r1);
    if (y0 !== 0 || y1 !== 1) { const a = L.hip[1] + (L.ft[1] - L.hip[1]) * y0, b = L.hip[1] + (L.ft[1] - L.hip[1]) * y1; m.clipY(Math.round(a), Math.round(b)); }
    return m;
  }
  function torsoMask(S) { const m = M().rows(T0 + S.dy, S.G.tor); return S.tx ? m.shift(S.tx, 0) : m; }
  function hipMask(S) { const m = M().rows(T0 + S.dy + 14, [S.G.hip, S.G.hip, S.G.hip]); return S.tx ? m.shift(S.tx, 0) : m; }
  function bodyMasks(S) {
    const G = S.G, B = { arm: {}, hand: {}, leg: {}, thumb: {} };
    B.torso = torsoMask(S);
    for (const side of ['L', 'R']) {
      const a = S.arms[side];
      B.arm[side] = armMask(a, G, 0, 1, 0);
      B.hand[side] = M().ellipse(a.ha[0], a.ha[1], 1.6, 1.7);
      B.leg[side] = legMask(S, side, 0, 1, 0);
    }
    return B;
  }
  // un-posed head mask (local space) + the posed one
  function headMask(S, local) {
    const G = S.G, hws = G.head.slice();
    if (S.face.puff) for (let i = 11; i <= 15; i++) hws[i] += 1;
    return local ? M().rows(HY, hws, CX) : M().rows(Math.round(S.head.y), hws, S.head.x);
  }

  /* ------------------------------------------------------------ skin colours */
  function skinCols(skin) {
    const r = ramp(skin), [h, s, l] = toHsl(skin);
    const dark = l < 0.3, light = l > 0.78;
    const lid = dark ? PAL.ink : mix(r.deep, PAL.ink, light ? 0.62 : 0.72);
    const lipBase = mix(r.base, '#c0446a', dark ? 0.35 : light ? 0.45 : 0.4);
    return {
      r, lid, dark, light, l,
      lip: mix(lipBase, r.shade, 0.15), lipHi: mix(lipBase, '#ffd6e0', 0.35), lipDk: mix(lipBase, r.deep, 0.5),
      mouth: dark ? mix(PAL.ink, '#6a1a30', 0.5) : mix(r.deep, '#7a1f3a', 0.45),
      white: '#ffffff', whiteSh: dark ? '#cfc4e8' : mix('#cdc2e4', r.shade, 0.25),
      blush: mix(r.base, '#ff5f8f', dark ? 0.32 : 0.5),
      sock: mix(r.shade, r.deep, 0.25),
    };
  }

  /* ------------------------------------------------------------------- face */
  // Everything on the face is built in LOCAL design coordinates (head top row HY, axis CX), then painted with the
  // pose's head offset. u = design px from the axis, v = design row.
  const EYE = {
    round: { rw: 2.3, rh: 2.8, ri: 1.6 }, sharp: { rw: 2.55, rh: 2.2, ri: 1.45, tilt: -0.35, lash: 1 }, sleepy: { rw: 2.4, rh: 2.3, ri: 1.6, lid: 0.42 },
    wide: { rw: 2.5, rh: 3.3, ri: 2.0, big: 1 }, lashes: { rw: 2.3, rh: 2.8, ri: 1.6, lash: 3 }, cat: { rw: 2.6, rh: 2.3, ri: 1.55, tilt: 0.55, lash: 2, slit: 1 },
    happy: { rw: 2.4, rh: 2.4, ri: 1.5 }, star: { rw: 2.5, rh: 3.0, ri: 1.7, star: 1 },
  };
  const FACE = { eyeU: 5.0, eyeV: 9.8 };

  function faceCtx(S) {
    const dx = Math.round(S.head.x - CX), dy = Math.round(S.head.y - HY);
    return { ox: nx(dx), oy: ny(dy), dx, dy };
  }
  const loc = (P, S) => { const f = faceCtx(S), D = new Painter(P); D.shiftN(f.ox, f.oy); return { D, f }; };

  function drawEye(P, D, side, S, look, K, ctx) {
    const st = EYE[look.eyes.style] || EYE.round, state = S.face.eyes, sd = side;      // sd: -1 left, +1 right
    const cx = CX + sd * FACE.eyeU, cy = FACE.eyeV, sh = ctx.ox, sv = ctx.oy;
    const ir = ramp(look.eyes.color), pup = mix(PAL.ink, look.eyes.color, 0.15);
    const putMask = (m, c) => m.each((x, y) => P.px(x + sh, y + sv, c));
    const kk = GR.k, lw = GR.t;
    // ---- closed / special states
    if (state === 'blink' || state === 'closed') {
      const arc = M().fn(cx - 3.2, cy - 1, cx + 3.2, cy + 3, (x, y) => { const u = (x - cx) / 2.6; return Math.abs(u) <= 1 && Math.abs(y - (cy + 0.9 + 0.55 * u * u * 0.0 + 0.7 * (u * u))) <= 0.42 + lw * 0.1; });
      putMask(arc, K.lid);
      if (st.lash || look.eyes.style === 'lashes' || look.eyes.style === 'cat') { D.line(cx + sd * 2.4, cy + 1.3, cx + sd * 3.6, cy + 0.5, K.lid); }
      return;
    }
    if (state === 'happy') {
      const A = (x, y) => { const u = (x - cx) / 2.5; return u * u + ((y - (cy + 1.2)) / 2.0) ** 2 <= 1; };
      const B = (x, y) => { const u = (x - cx) / 2.5; return u * u + ((y - (cy + 1.2 + 0.95)) / 2.0) ** 2 <= 1; };
      const arc = M().fn(cx - 3, cy - 2, cx + 3, cy + 3, (x, y) => A(x, y) && !B(x, y) && y < cy + 1.6);
      putMask(arc, K.lid);
      D.line(cx + sd * 2.3, cy + 0.5, cx + sd * 3.5, cy - 0.3, K.lid);
      return;
    }
    if (state === 'hurt') {
      D.poly([[cx + sd * 2.1, cy - 1.7], [cx - sd * 1.9, cy + 0.1], [cx + sd * 2.1, cy + 1.9]], K.lid);
      D.px(cx - sd * 1.9, cy + 0.1, K.lid);
      return;
    }
    // ---- open eye
    const rw = st.rw, big = st.big, down = state === 'down';
    const rh = down ? st.rh * 0.86 : st.rh, tilt = st.tilt || 0, ecy = cy + (down ? 0.5 : 0);
    const inSock = (x, y) => { const du = (x - cx), dv = (y - ecy) + tilt * du * sd; return (du / rw) ** 2 + (dv / rh) ** 2 <= 1; };
    const sock = M().fn(cx - rw - 1, ecy - rh - 2, cx + rw + 1, ecy + rh + 2, inSock);
    // heavy lid for sleepy / sad-down eyes
    const lidCut = (st.lid || (down ? 0.3 : 0)) ;
    const lidY = ecy - rh + rh * 2 * lidCut;
    const open = lidCut ? sock.clone().sub(M().fn(cx - 4, ecy - 4, cx + 4, lidY, () => true)) : sock;
    // whites
    open.each((x, y) => { const yy = iY(y); P.px(x + sh, y + sv, yy < ecy - rh + 1.05 + (lidCut ? rh * 2 * lidCut : 0) ? K.whiteSh : K.white); });
    // iris
    const icx = cx + (-sd) * 0.0, icy = ecy + 0.25 + (down ? 0.55 : 0), ri = st.ri;
    const irisM = M().fn(icx - ri - 1, icy - ri - 1, icx + ri + 1, icy + ri + 1, (x, y) => {
      const a = (x - icx) / (st.slit ? ri * 0.82 : ri), b = (y - icy) / (ri * (st.slit ? 1.18 : 1.0)); return a * a + b * b <= 1;
    }).and(open);
    irisM.each((x, y) => {
      const yy = iY(y), t = (yy - (icy - ri)) / (2 * ri), dist = Math.hypot(iX(x) - icx, yy - icy) / ri;
      let c = t < 0.3 ? ir.deep : t < 0.62 ? ir.base : t < 0.85 ? mix(ir.base, ir.light, 0.5) : ir.light;
      if (dist > 0.82 && GR.k > 1.8) c = ir.shade;
      P.px(x + sh, y + sv, c);
    });
    if (st.star) {
      const star = M().fn(icx - 2, icy - 2, icx + 2, icy + 2, (x, y) => {
        const dx = x - icx, dy = y - icy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2, seg = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5;
        const R = 0.95 + 0.9 * Math.cos(seg * 2.5) * 0 + 0.85 * Math.max(0, 1 - Math.abs(seg) / (Math.PI / 5)); return r <= R;
      });
      star.each((x, y) => P.px(x + sh, y + sv, '#ffe14d'));
      D.px(icx, icy, '#fff7b0');
    } else {
      // pupil
      const pm = M().fn(icx - 1.2, icy - 1.5, icx + 1.2, icy + 1.5, (x, y) => ((x - icx) / (st.slit ? 0.3 : 0.78)) ** 2 + ((y - (icy - 0.1)) / (st.slit ? 1.35 : 0.82)) ** 2 <= 1).and(open);
      pm.each((x, y) => P.px(x + sh, y + sv, pup));
      // main highlight (upper left of the iris) and a tiny bounce light
      D.px(icx - 0.55, icy - 0.7, '#ffffff');
      if (kk > 1.8 || big) { D.px(icx + 0.75, icy + 0.8, '#fff0f8'); }
      if (kk > 1.8) { D.px(icx - 0.55, icy - 0.0, '#ffffff'); }
    }
    // lid line (upper edge of the open eye) + lower lid hint
    const topEdge = M(); open.each((x, y) => { let free = true; for (let q = 1; q <= lw; q++) if (open.get(x, y - q)) { free = false; break; } if (free) topEdge.set(x, y); });
    putMask(topEdge, K.lid);
    // outer corner thickening
    const corner = M(); topEdge.each((x, y) => { const u = (iX(x) - cx) * sd; if (u > rw * 0.35) corner.set(x, y - 1); });
    putMask(corner, K.lid);
    if (lidCut) { const lm = sock.clone().and(M().fn(cx - 4, ecy - 4, cx + 4, lidY, () => true)); lm.each((x, y) => P.px(x + sh, y + sv, K.r.shade)); }
    const low = M(); sock.each((x, y) => { if (!sock.get(x, y + 1)) low.set(x, y + 1); }); low.sub(sock);
    low.each((x, y) => { if (P.alphaAt(x + sh, y + sv) > 200) P.px(x + sh, y + sv, K.sock, 150); });
    // lashes / wings
    const lash = st.lash || 0, ox0 = cx + sd * (rw - 0.3), oy0 = ecy - rh * 0.55 + tilt * sd * -0.3;
    if (lash >= 1) D.line(ox0, oy0, ox0 + sd * 1.7, oy0 - 1.0, K.lid);
    if (lash >= 2) D.line(ox0 + sd * 1.7, oy0 - 1.0, ox0 + sd * 3.0, oy0 - 2.0, K.lid);
    if (lash >= 3) { D.line(ox0 - sd * 0.8, oy0 - 1.2, ox0 + sd * 0.8, oy0 - 2.6, K.lid); D.line(ox0 - sd * 2.1, oy0 - 1.7, ox0 - sd * 1.1, oy0 - 3.0, K.lid); }
  }

  function drawEyes(P, S, look, K) {
    const { D, f } = loc(P, S);
    drawEye(P, D, -1, S, look, K, f); drawEye(P, D, 1, S, look, K, f);
  }

  function drawBrows(P, S, look, hairR) {
    const id = look.brows; if (id === 'none') return;
    const { D } = loc(P, S);
    const tilt = S.face.brow === 'angry' ? [0.4, 0, -0.5, -1.3] : S.face.brow === 'sad' ? [-0.9, -0.3, 0.5, 1.4] : S.face.brow === 'up' ? [-0.6, -1.1, -1.1, -0.6] : [0, 0, 0, 0];
    const SH = {
      soft: [[-2.6, 0.7], [-0.8, -0.1], [1.4, -0.05], [2.7, 0.5]], straight: [[-2.6, 0.1], [-0.8, 0], [1.4, 0], [2.7, 0.1]],
      arched: [[-2.6, 1.0], [-1.0, -0.2], [0.8, -0.7], [2.7, 0.6]], thin: [[-2.2, 0.6], [-0.7, 0], [1.2, 0], [2.4, 0.3]],
      thick: [[-2.7, 0.9], [-0.9, 0], [1.4, -0.1], [2.8, 0.4]],
    }[id];
    const th = id === 'thick' ? Math.max(2, Math.round(GR.k * 1.45)) : id === 'thin' ? 1 : GR.t;
    const base = 6.2, col = hairR.shade, hi = hairR.base;
    for (const sd of [-1, 1]) {
      const ex = CX + sd * FACE.eyeU;
      const pts = SH.map((p, i) => [ex + sd * p[0], base + p[1] + tilt[i]]);
      // pts run outer -> inner for sd = -1 (outer is -u). For sd=+1 outer is +u: the same list mirrored already.
      D.poly(pts, col, th);
      if (th >= 2) D.poly(pts.map((p) => [p[0], p[1] - 0.45]), hi, 1);
    }
  }

  function drawNose(P, S, K) {
    const { D } = loc(P, S);
    D.px(CX + 0.6, 12.9, K.r.shade); D.px(CX - 0.6, 12.9, mix(K.r.shade, K.r.base, 0.4));
    if (K.l > 0.25) { D.px(CX - 0.7, 11.6, K.r.light); D.px(CX - 0.7, 12.3, K.r.light); }
    D.px(CX + 0.6, 13.7, mix(K.r.shade, K.r.deep, 0.3), 120);
    if (GR.k > 1.8) { D.px(CX - 1.5, 12.8, K.r.shade); D.px(CX + 1.7, 12.8, K.r.shade); }
  }

  // mouth: lines and filled shapes in local design coordinates
  function drawMouth(P, S, look, K) {
    const { D, f } = loc(P, S), m = S.face.mouth, v = 14.5, dk = K.mouth, lip = K.lip;
    const tooth = '#fffaf2', tg = '#ff6f8f', put = (mk, c) => mk.each((x, y) => P.px(x + f.ox, y + f.oy, c));
    const cc = CX;
    const smileCurve = (w, dep, c) => { const pts = []; for (let i = 0; i <= 8; i++) { const u = -w + (2 * w * i) / 8; pts.push([cc + u, v + dep * (1 - (u / w) ** 2) ]); } D.poly(pts, c); };
    const openMouth = (rx, ry, teeth, tongue, lipRing) => {
      const mk = M().ellipse(cc, v + ry * 0.55, rx, ry);
      if (lipRing) { put(mk.clone().grow(), lip); }
      put(mk, dk);
      if (teeth) { const tm = mk.clone().and(M().fn(cc - 6, v - 3, cc + 6, v + teeth, () => true)); put(tm, tooth); const edgeT = M(); tm.each((x, y) => { if (!tm.get(x, y + 1)) edgeT.set(x, y); }); put(edgeT, '#d8cfe4'); }
      if (tongue) { const tg2 = mk.clone().and(M().fn(cc - 6, v + ry * 0.6, cc + 6, v + ry * 2.4, () => true)).and(M().ellipse(cc, v + ry * 1.3, rx * 0.72, ry * 0.58)); put(tg2, tg); }
      // lower lip highlight
      D.px(cc - 0.5, v + ry * 1.55 + 0.9, K.lipHi);
    };
    switch (m) {
      case 'smile': smileCurve(2.5, 0.9, dk); D.px(cc, v + 1.7, K.lipHi); D.px(cc - 2.9, v - 0.2, K.r.shade); D.px(cc + 2.9, v - 0.2, K.r.shade); break;
      case 'closed': D.hl(cc - 2.4, cc + 2.4, v + 0.4, dk); D.hl(cc - 1.2, cc + 1.2, v + 1.5, K.lipHi); break;
      case 'smirk': D.poly([[cc - 2.2, v + 0.9], [cc, v + 1.1], [cc + 2.0, v + 0.4], [cc + 3.0, v - 0.5]], dk); D.px(cc + 3.4, v - 0.9, K.r.shade); D.px(cc + 0.4, v + 2, K.lipHi); break;
      case 'sad': D.poly([[cc - 2.4, v + 1.5], [cc - 1.2, v + 0.4], [cc + 1.2, v + 0.4], [cc + 2.4, v + 1.5]], dk); D.px(cc, v + 1.9, K.lipHi); break;
      case 'puff': D.hl(cc - 1.6, cc + 1.6, v + 0.5, dk); D.px(cc - 2.2, v - 0.2, K.r.shade); D.px(cc + 2.2, v - 0.2, K.r.shade); break;
      case 'grit': {
        const mk = M().fn(cc - 3.3, v - 0.8, cc + 3.3, v + 1.9, (x, y) => Math.abs(x - cc) <= 3.0 && y > v - 0.6 && y < v + 1.7);
        put(mk, tooth);
        const bd = M(); mk.each((x, y) => { if (!mk.get(x, y - 1) || !mk.get(x - 1, y) || !mk.get(x + 1, y) || !mk.get(x, y + 1)) bd.set(x, y); }); put(bd, dk);
        for (let q = -2; q <= 2; q += 1.5) D.vl(cc + q, v - 0.4, v + 1.5, '#cfc6e4');
        D.hl(cc - 3, cc + 3, v + 0.55, dk);
        break;
      }
      case 'grin': {
        const mk = M().fn(cc - 3.6, v - 1.2, cc + 3.6, v + 3.4, (x, y) => { const u = (x - cc) / 3.4; return y >= v - 0.2 + 0.9 * u * u * 0 && u * u + ((y - (v - 0.2)) / 2.9) ** 2 <= 1; });
        put(mk, dk);
        const teeth = mk.clone().and(M().fn(cc - 4, v - 1, cc + 4, v + 0.95, () => true)); put(teeth, tooth);
        const tg2 = mk.clone().and(M().ellipse(cc, v + 2.7, 2.3, 1.0)).and(M().fn(cc - 4, v + 1.4, cc + 4, v + 4, () => true)); put(tg2, tg);
        const bd = M(); mk.each((x, y) => { if (!mk.get(x, y - 1)) bd.set(x, y - 1); }); put(bd, dk);
        D.px(cc - 3.6, v - 0.8, K.r.shade); D.px(cc + 3.6, v - 0.8, K.r.shade);
        break;
      }
      case 'o': openMouth(1.15, 1.7, 0, 0, true); break;
      case 'open': openMouth(2.2, 1.55, 0.7, 1, true); break;
      case 'shout': openMouth(3.0, 2.35, 1.0, 1, true); break;
      default: smileCurve(2.5, 0.9, dk);
    }
  }

  // face marks keep their own colours
  function drawMarks(P, S, look, K) {
    const { D, f } = loc(P, S), has = (id) => look.marks.indexOf(id) >= 0, c = CX;
    const put = (mk, col, a) => mk.each((x, y) => P.px(x + f.ox, y + f.oy, col, a));
    if (has('freckles')) {
      const fc = K.dark ? mix(K.r.light, '#e0a070', 0.3) : mix(K.r.deep, '#a05030', 0.45);
      for (const sd of [-1, 1]) for (const [u, v] of [[3.2, 12.2], [4.8, 12.9], [6.4, 12.0], [4.0, 14.0], [5.6, 14.2], [2.6, 13.4], [7.0, 13.4]]) D.px(c + sd * u, v, fc);
    }
    if (has('blush')) for (const sd of [-1, 1]) put(M().ellipse(c + sd * 6.3, 13.2, 2.2, 1.1), K.blush, 160);
    if (has('beauty')) { D.px(c + 4.2, 15.4, K.dark ? '#120d1f' : '#3a2230'); }
    if (has('scar')) {
      const sc = K.dark ? '#b88a80' : '#e8a0a0';
      D.poly([[c + 4.6, 6.8], [c + 5.4, 8.4], [c + 6.0, 10.2], [c + 6.8, 11.8]], sc);
      for (const q of [8.0, 10.0]) D.hl(c + 3.8 + (q - 8) * 0.2, c + 6.9 + (q - 8) * 0.2, q + 0.1, '#fff0e8');
    }
    if (has('bandaid')) {
      const bm = M().poly([[c + 3.0, 12.6], [c + 7.6, 11.0], [c + 8.3, 12.7], [c + 3.7, 14.3]]);
      put(bm, '#f2c9a0'); const pad = M().poly([[c + 4.8, 12.2], [c + 6.4, 11.65], [c + 6.8, 13.1], [c + 5.2, 13.7]]); put(pad, '#e0b080');
      D.poly([[c + 3.0, 12.6], [c + 3.7, 14.3]], '#d8a070'); D.poly([[c + 7.6, 11.0], [c + 8.3, 12.7]], '#d8a070');
    }
    if (has('starpaint')) {
      const sx = c - 7.0, sy = 12.4, st = M().fn(sx - 2.2, sy - 2.2, sx + 2.2, sy + 2.2, (x, y) => { const dx = x - sx, dy = y - sy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2, s = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5; return r <= 0.7 + 1.4 * Math.max(0, 1 - Math.abs(s) / (Math.PI / 5) * 1.05); });
      put(st, '#2ee6ff'); D.px(sx, sy, '#e8ffff'); D.px(sx - 0.8, sy - 0.6, '#b8f6ff');
    }
    if (has('tear')) {
      const tm = M().poly([[c - 7.1, 11.6], [c - 6.1, 13.4], [c - 8.1, 13.4]]).or(M().ellipse(c - 7.1, 14.1, 1.0, 1.0));
      put(tm, '#2a4fd6'); D.px(c - 7.4, 13.7, '#9fb8ff');
    }
    if (has('warpaint')) {
      for (const sd of [-1, 1]) {
        const bm = M().poly([[c + sd * 3.5, 12.2], [c + sd * 9, 11.0], [c + sd * 9.5, 12.0], [c + sd * 4, 13.4]]);
        put(bm, '#ff2f4f');
        const wm = M().poly([[c + sd * 3.8, 13.6], [c + sd * 9.4, 12.4], [c + sd * 9.6, 13.1], [c + sd * 4.3, 14.4]]); put(wm, '#fff6e8');
      }
    }
    if (S.face.tear) { D.px(c - 7, 12.4, '#8fc0ff'); D.px(c - 7, 13.4, '#cfe6ff'); D.px(c - 7, 14.4, '#8fc0ff'); }
  }

  // facial hair in the hair colour
  function drawFacial(P, S, look, hairR) {
    const id = look.facial; if (id === 'none') return;
    const { D, f } = loc(P, S), c = CX, hm = headMask(S, true);
    const put = (mk, col, a) => mk.each((x, y) => P.px(x + f.ox, y + f.oy, col, a));
    if (id === 'stubble') {
      const jaw = hm.clone().and(M().fn(0, HY + 12.2, 44, 40, () => true));
      jaw.each((x, y) => { const v = iY(y); if (v < 14.5 && Math.abs(iX(x) - c) < 3.4) return; if (((x * 7 + y * 11) % 5) < 2) P.px(x + f.ox, y + f.oy, hairR.shade, 190); });
      return;
    }
    const stache = () => {
      const sm = M().poly([[c - 4.2, 13.1], [c - 2, 12.6], [c, 13.0], [c + 2, 12.6], [c + 4.2, 13.1], [c + 4.6, 14.4], [c + 3.0, 14.2], [c, 13.9], [c - 3.0, 14.2], [c - 4.6, 14.4]]);
      shade(P, sm.shift(f.dx * 0, 0).shiftN(f.ox, f.oy), hairR, { cap: 2, hi: true });
      D.px(c - 2.4, 12.9, hairR.hi);
    };
    if (id === 'mustache') { stache(); return; }
    if (id === 'goatee') {
      const gm = M().poly([[c - 2.6, 16.2], [c + 2.6, 16.2], [c + 2.2, 18.6], [c, 19.4], [c - 2.2, 18.6]]).or(M().poly([[c - 1.2, 15], [c + 1.2, 15], [c + 2.6, 16.2], [c - 2.6, 16.2]])).and(hm.clone().or(M().ellipse(c, 17, 3, 3)));
      shade(P, gm.shiftN(f.ox, f.oy), hairR, { cap: 3, hi: true });
      stache(); return;
    }
    // full beard
    const bm = M();
    hm.each((x, y) => {
      const v = iY(y), u = Math.abs(iX(x) - c);
      if (v >= 17) bm.set(x, y);
      else if (v >= 15.4) bm.set(x, y);
      else if (v >= 12.4 && u > 6.2 + (v < 13.5 ? 0.6 : 0)) bm.set(x, y);
    });
    // mouth hole
    bm.sub(M().fn(c - 3.6, 14.0, c + 3.6, 16.3, (x, y) => { const u = (x - c) / 3.5; return u * u + ((y - 15.2) / 1.5) ** 2 <= 1; }));
    bm.sub(M().rect(Math.round(c - 3), 12, 6, 2));
    if (id === 'longbeard') bm.or(M().rows(HY + 18, [5, 5.2, 5, 4.6, 4, 3.4, 2.6, 1.6]).and(M().rect(0, 0, 44, 40)));
    const bmN = bm.shiftN(f.ox, f.oy);
    shade(P, bmN, hairR, { cap: 3, hi: true, ctx: bmN });
    bm.each((x, y) => { if (iY(y) > 15.5 && ((x * 5 + y * 3) % 7 === 0)) P.px(x + f.ox, y + f.oy, hairR.shade); if (iY(y) > 15.5 && ((x * 3 + y * 7) % 11 === 0)) P.px(x + f.ox, y + f.oy, hairR.light); });
    stache();
  }

  /* ------------------------------------------------------------ body drawing */
  function drawLegs(P, S, B, K) { for (const side of ['L', 'R']) shade(P, B.leg[side], K.r, { cap: 3 }); }
  function drawTorsoSkin(P, S, B, K) {
    const tm = B.torso.clone().or(hipMask(S));
    shade(P, tm, K.r, { cap: 4 });
    return tm;
  }
  function drawArmSkin(P, S, B, K, side) {
    shade(P, B.arm[side], K.r, { cap: 3 });
    shade(P, B.hand[side], K.r, { cap: 3 });
  }
  function drawHeadSkin(P, S, look, K) {
    const hm = headMask(S), f = faceCtx(S), hy = Math.round(S.head.y), D = new Painter(P).shiftN(f.ox, f.oy);
    // ears first (the head covers their inner part)
    for (const sg of [-1, 1]) {
      const ear = M().ellipse(CX + sg * 10.4, HY + 10.2, 1.55, 2.4).shiftN(f.ox, f.oy);
      shade(P, ear, K.r, { cap: 2 });
      D.px(CX + sg * 10.5, HY + 10.4, K.r.deep); D.px(CX + sg * 10.5, HY + 9.4, K.r.shade);
    }
    // neck, shadowed under the chin
    const nk = M().rows(HY + 15, [S.G.neck, S.G.neck, S.G.neck, S.G.neck, S.G.neck]).shiftN(f.ox, f.oy);
    flat(P, nk, K.r.shade);
    nk.each((x, y) => { const v = iY(y - f.oy); if (v >= HY + 17.2) P.px(x, y, mix(K.r.shade, K.r.deep, 0.5)); else if (v >= HY + 15.9 && ((x + y) & 1)) P.px(x, y, mix(K.r.shade, K.r.deep, 0.35)); });
    shade(P, hm, K.r, { cap: 4, hi: false, dither: true });
    // cheek and forehead light, jaw shadow
    const hl = M().ellipse(CX - 4.2, HY + 4.2, 2.4, 1.3).shiftN(f.ox, f.oy).and(hm); hl.each((x, y) => P.px(x, y, K.r.light, 190));
    const ck = M().ellipse(CX - 5.6, HY + 12.0, 1.7, 1.0).shiftN(f.ox, f.oy).and(hm); ck.each((x, y) => P.px(x, y, K.r.light, 140));
    const jw = hm.clone().and(M().fn(0, HY + 15.6, 44, HY + 19, () => true)); jw.each((x, y) => { if ((x + y) & 1) P.px(x, y, K.r.shade, 150); });
    return hm;
  }

  Object.assign(BBH, {
    CharsKit: {
      DW, DH, CX, HY, T0, GR, setGrid, X, Y, iX, iY, nx, ny, GEO, POSES, FR, FOOT_Y, Mask, M, Painter, shade, flat, darkenAt, ring, edge, mirX,
      skeleton, bodyMasks, armMask, legMask, hipMask, torsoMask, headMask, faceCtx, skinCols,
      drawEyes, drawBrows, drawMouth, drawNose, drawMarks, drawFacial, drawLegs, drawTorsoSkin, drawArmSkin, drawHeadSkin,
    },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsKit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
