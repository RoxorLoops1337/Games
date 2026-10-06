// BEATBOX HEROES -- world_b.js
// World part B: interiors (home, shop, studio, bar), the battle stage, the creator stage,
// HUD icons (World.icon) and particle sprites (World.fx). All painted procedurally into Pix buffers.
// World.builders.<id>(variant) -> scene (cached). The dispatcher World.scene lives in world_a.js.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined' && !BBH.Pix) require('./pix.js');
  if (typeof require !== 'undefined' && !BBH.Font) require('./font.js');
  const { Pix, PAL, ramp, rng, mix, lighten, darken, C, hex } = BBH;
  const Font = BBH.Font;
  const World = BBH.World || (BBH.World = {});
  World.builders = World.builders || {};
  World.cache = World.cache || {};
  // Scenes are DESIGNED on a 270x480 grid (W,H) and PAINTED natively at 360x640 (x4/3): the Z wrapper maps design
  // coordinates to native pixels (rect/ellipse/poly/line edges are re-rasterised at the finer grid, never resampled),
  // and detail layers (grain, dithers, glows, text, outlines) are drawn directly in native pixels.
  const W = 270, H = 480, K = 4 / 3, NW = 360, NH = 640;
  const sc = (v) => Math.round(v * K);
  const cxy = (v) => Math.round((v + 0.5) * K - 0.5);                // pixel index -> native pixel index
  class Z {
    constructor(lw, lh, pix) { this.lw = lw; this.lh = lh; this.n = pix || new Pix(sc(lw), sc(lh)); }
    get w() { return this.lw; } get h() { return this.lh; }
    px(x, y, c, a) { this.n.px(sc(x), sc(y), c, a); return this; }
    add(x, y, c, a) { this.n.add(sc(x), sc(y), c, a); return this; }
    rectc(x, y, w, h, c) { const x0 = sc(x), y0 = sc(y); this.n.rect(x0, y0, sc(x + w) - x0, sc(y + h) - y0, c); return this; }
    cov(x, y, c, a) { const x0 = sc(x), y0 = sc(y), x1 = sc(x + 1), y1 = sc(y + 1); for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.n.px(i, j, c, a); return this; }
    rect(x, y, w, h, c, rep) {
      const x0 = sc(x), y0 = sc(y); let ww = sc(x + w) - x0, hh = sc(y + h) - y0;
      if (Math.round(w) === 1) ww = 1; if (Math.round(h) === 1) hh = 1;
      this.n.rect(x0, y0, ww, hh, c, rep); return this;
    }
    hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
    vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }
    frame(x, y, w, h, c) { const x0 = sc(x), y0 = sc(y); this.n.frame(x0, y0, sc(x + w) - x0, sc(y + h) - y0, c); return this; }
    line(x0, y0, x1, y1, c, t) { this.n.line(cxy(x0), cxy(y0), cxy(x1), cxy(y1), c, t > 1 ? Math.round(t * K) : 1); return this; }
    ellipse(cx, cy, rx, ry, c) { this.n.ellipse((cx + 0.5) * K - 0.5, (cy + 0.5) * K - 0.5, (rx + 0.5) * K - 0.5, (ry + 0.5) * K - 0.5, c); return this; }
    shadedEllipse(cx, cy, rx, ry, rp2, lx, ly) { this.n.shadedEllipse((cx + 0.5) * K - 0.5, (cy + 0.5) * K - 0.5, (rx + 0.5) * K - 0.5, (ry + 0.5) * K - 0.5, rp2, lx, ly); return this; }
    ring(cx, cy, rx, ry, c) { this.n.ring((cx + 0.5) * K - 0.5, (cy + 0.5) * K - 0.5, (rx + 0.5) * K - 0.5, (ry + 0.5) * K - 0.5, c); return this; }
    poly(pts, c) { this.n.poly(pts.map((q) => [q[0] * K, q[1] * K]), c); return this; }
    outline(f, d) { this.n.outline(f, d); return this; }
    tint(c, k) { this.n.tint(c, k); return this; }
    fill(c) { this.n.fill(c); return this; }
  }

  /* ================================================================ painting helpers */
  const BAY = [0, 2, 3, 1];
  const bay = (x, y) => BAY[(x & 1) | ((y & 1) << 1)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const rp = (c) => ramp(c);
  const gr = (p) => p.n || p;                                          // native Pix behind a Z (or the Pix itself)

  // quantised, dithered intensity 0..1 in 4 steps (native pixel coordinates)
  function dq(v, x, y) {
    if (v <= 0) return 0; if (v >= 1) return 1;
    const s = v * 3, b = Math.floor(s);
    return (b + ((s - b) * 4 > bay(x, y) ? 1 : 0)) / 3;
  }
  // bayer dithered rectangle, level 0..4 (design coords)
  function dfill(p, x, y, w, h, c, lvl) {
    const n = gr(p), x0 = sc(x), y0 = sc(y), x1 = sc(x + w), y1 = sc(y + h);
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) if (bay(i, j) < lvl) n.px(i, j, c);
  }
  // sprinkled single-pixel speckle texture (native density): colours array, density 0..1
  function grain(p, x, y, w, h, cols, dens, seed) {
    const n = gr(p), r = rng((seed || 1) * 977 + sc(x) * 31 + sc(y)), x0 = sc(x), y0 = sc(y), x1 = sc(x + w), y1 = sc(y + h);
    const cnt = Math.floor((x1 - x0) * (y1 - y0) * dens);
    for (let i = 0; i < cnt; i++) n.px(x0 + Math.floor(r() * (x1 - x0)), y0 + Math.floor(r() * (y1 - y0)), cols[Math.floor(r() * cols.length)]);
  }
  // short horizontal wood-grain / scratch streaks
  function streaks(p, x, y, w, h, cols, count, maxLen, seed) {
    const n = gr(p), r = rng((seed || 1) * 613 + sc(x) * 17 + sc(y)), x0 = sc(x), y0 = sc(y), x1 = sc(x + w), y1 = sc(y + h);
    for (let i = 0; i < count; i++) { const sx = x0 + Math.floor(r() * (x1 - x0)), sy = y0 + Math.floor(r() * (y1 - y0)), L = 2 + Math.floor(r() * maxLen); n.rect(sx, sy, Math.min(L, x1 - sx), 1, cols[Math.floor(r() * cols.length)]); }
  }
  // additive radial glow (dithered falloff), design coords
  function glow(p, cx, cy, r, color, a, ry) {
    a = a === undefined ? 1 : a; ry = ry || r;
    const n = gr(p), k = C(color), X = cx * K, Y = cy * K, RX = r * K, RY = ry * K;
    for (let y = Math.max(0, Math.floor(Y - RY)); y <= Math.min(n.h - 1, Math.ceil(Y + RY)); y++) for (let x = Math.max(0, Math.floor(X - RX)); x <= Math.min(n.w - 1, Math.ceil(X + RX)); x++) {
      const d = Math.hypot((x - X) / RX, (y - Y) / RY); if (d >= 1) continue;
      const v = dq((1 - d) * (1 - d) * 1.15 * a, x, y);
      if (v > 0) n.add(x, y, k, 255 * v * 0.55);
    }
  }
  // additive light cone from (x0,y0,w0) to (x1,y1,w1), design coords
  function beam(p, x0, y0, w0, x1, y1, w1, color, a) {
    a = a === undefined ? 1 : a; const n = gr(p), k = C(color);
    x0 *= K; y0 *= K; w0 *= K; x1 *= K; y1 *= K; w1 *= K;
    const ya = Math.floor(Math.min(y0, y1)), yb = Math.ceil(Math.max(y0, y1));
    for (let y = Math.max(0, ya); y <= Math.min(n.h - 1, yb); y++) {
      const t = (y - y0) / ((y1 - y0) || 1), cx = lerp(x0, x1, t), hw = lerp(w0, w1, t) / 2;
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
        if (x < 0 || x >= n.w) continue;
        const e = 1 - Math.abs(x - cx) / (hw + 0.5); if (e <= 0) continue;
        const v = dq(Math.sqrt(e) * (1 - t * 0.65) * a, x, y);
        if (v > 0) n.add(x, y, k, 255 * v * 0.42);
      }
    }
  }
  // lit box with bevel edges: light top/left, shade bottom/right
  function box(p, x, y, w, h, c, o) {
    const R = typeof c === 'string' ? rp(c) : c; o = o || {};
    p.rect(x, y, w, h, R.base);
    if (!o.flat) {
      p.rect(x, y, w, 1, R.light); p.rect(x, y, 1, h, R.light);
      p.rect(x, y + h - 1, w, 1, R.shade); p.rect(x + w - 1, y, 1, h, R.shade);
      p.px(x, y, R.hi);
    }
    return p;
  }
  // additive horizontal/vertical strip (neon tube light), design coords
  function addStrip(p, x, y, w, h, c, a) { const n = gr(p), x0 = sc(x), y0 = sc(y), x1 = sc(x + w), y1 = sc(y + h); for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) n.add(i, j, c, a); }
  // text is always drawn in native pixels (5x7 font): design coords for the origin
  const TSP = (scale) => ((scale || 1) === 1 ? 2 : 4);
  function txt(p, s, x, y, col, o) { o = o || {}; Font.draw(gr(p), s, sc(x), sc(y), col, Object.assign({ spacing: TSP(o.scale) }, o)); }
  const tw = (s, scale) => Font.width(String(s), scale || 1, TSP(scale)) / K;       // text width in design units
  // neon sign painted straight into the scene: core, light core line, additive dithered halo (native)
  function neon(p, s, cx, cy, color, scale, o) {
    o = o || {}; scale = scale || 1; const n = gr(p), sp = TSP(scale), w = Font.width(s, scale, sp), h = 7 * scale;
    const x = Math.round(cx * K - w / 2), y = Math.round(cy * K - h / 2), P = 7;
    const m = new Pix(w + P * 2, h + P * 2); Font.draw(m, s, P, P, '#fff', { scale, spacing: sp });
    const R = rp(color), hal = o.halo === undefined ? 1 : o.halo;
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
      if (m.alphaAt(i, j) > 0) continue;
      let best = 9;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { if (m.alphaAt(i + dx, j + dy) > 0) { const d = Math.max(Math.abs(dx), Math.abs(dy)); if (d < best) best = d; } }
      if (best <= 5) { const v = dq((1 - (best - 1) / 5) * 0.8 * hal, i, j); if (v > 0) n.add(x - P + i, y - P + j, color, 255 * v * 0.5); }
    }
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
      if (m.alphaAt(i, j) === 0) continue;
      const lit = m.alphaAt(i - 1, j) === 0 || m.alphaAt(i, j - 1) === 0;
      n.px(x - P + i, y - P + j, scale > 1 ? (lit ? R.hi : R.light) : R.hi);
    }
    if (scale > 1) for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.alphaAt(i, j) && m.alphaAt(i - 1, j) && m.alphaAt(i + 1, j) && m.alphaAt(i, j - 1) && m.alphaAt(i, j + 1)) n.px(x - P + i, y - P + j, '#fffaf0');
    return { x, y, w, h };
  }
  // final safety: nothing pure black
  function noBlack(n) {
    const d = n.data;
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; if (d[i] < 14) d[i] = 14; if (d[i + 1] < 10) d[i + 1] = 10; if (d[i + 2] < 24) d[i + 2] = 24; }
    n._dirty = true; return n;
  }
  // a vertical gradient made of dithered bands between two colours
  function band(p, x, y, w, h, c1, c2, steps) {
    steps = steps || 5;
    for (let s = 0; s < steps; s++) {
      const y0 = y + Math.floor(h * s / steps), y1 = y + Math.floor(h * (s + 1) / steps);
      p.rectc(x, y0, w, y1 - y0, mix(c1, c2, s / (steps - 1)));
      if (s < steps - 1) dfill(p, x, y1 - 1, w, 1.5, mix(c1, c2, (s + 1) / (steps - 1)), 2);
    }
  }
  function cut(p, cx, cy, rx, ry) {   // erase an ellipse (alpha 0), design coords
    const n = gr(p), X = (cx + 0.5) * K - 0.5, Y = (cy + 0.5) * K - 0.5, RX = (rx + 0.5) * K - 0.5, RY = (ry + 0.5) * K - 0.5;
    for (let y = Math.floor(Y - RY); y <= Math.ceil(Y + RY); y++) for (let x = Math.floor(X - RX); x <= Math.ceil(X + RX); x++) {
      const nx = (x - X) / (RX + 0.5), ny = (y - Y) / (RY + 0.5);
      if (nx * nx + ny * ny <= 1 && n.inb(x, y)) n.data[(y * n.w + x) * 4 + 3] = 0;
    }
  }
  function mk(w, h, fn) { const z = new Z(w, h); fn(z); return z.n; }

  function scene(id, variant, p, extra) {
    const n = gr(p); noBlack(n);
    const S = (v) => Math.round(v * K);
    const e = Object.assign({ floorY: 440, spots: {}, hotspots: [], lights: [], anim: [] }, extra);
    if (e.fg) { e.fg = gr(e.fg); }
    const spots = {}; for (const k in e.spots) spots[k] = { x: S(e.spots[k].x), y: S(e.spots[k].y) };
    const hotspots = e.hotspots.map((h) => { const x0 = S(h.x), y0 = S(h.y); return { id: h.id, label: h.label, x: x0, y: y0, w: Math.min(NW, S(h.x + h.w)) - x0, h: Math.min(NH, S(h.y + h.h)) - y0 }; });
    const lights = e.lights.map((l) => Object.assign({}, l, { x: S(l.x), y: S(l.y), r: S(l.r) }));
    const anim = e.anim.map((a) => { const o = Object.assign({}, a); for (const k of ['x', 'y', 'w', 'h']) if (o[k] !== undefined) o[k] = S(o[k]); return o; });
    return { id, variant: variant || null, w: NW, h: NH, layers: [{ pix: n, speed: 1 }], fg: e.fg || null, floorY: S(e.floorY), spots, hotspots, lights, anim };
  }
  const _bcache = {};
  function reg(id, fn) {
    World.builders[id] = (variant) => {
      const key = id + ':' + (variant || '');
      return _bcache[key] || (_bcache[key] = fn(variant || null));
    };
  }

  /* ================================================================ common props */
  function plant(p, x, y, s, rr) {      // potted leafy plant, base centre (x,y) at the pot bottom
    rr = rr || rng(x * 7 + y); s = s || 1;
    const pot = rp('#c9577f'), lf = [rp('#2f8f5a'), rp('#4fbf6f'), rp('#7fe08a')];
    p.poly([[x - 5 * s, y - 8 * s], [x + 5 * s, y - 8 * s], [x + 4 * s, y], [x - 4 * s, y]], pot.base);
    p.rect(x - 5 * s, y - 9 * s, 10 * s, 2, pot.light); p.rect(x - 4 * s, y - 2, 8 * s, 2, pot.shade); p.rect(x + 3 * s, y - 8 * s, 2, 8 * s, pot.shade);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.34 + (rr() - 0.5) * 0.2, L = (13 + rr() * 9) * s;
      const ex = x + Math.cos(a) * L, ey = y - 9 * s + Math.sin(a) * L;
      p.line(x, y - 9 * s, ex, ey, lf[0].shade);
      p.ellipse(ex, ey, 3 * s, 2 * s, lf[i % 3 === 0 ? 1 : 0].base);
      p.px(ex - 1, ey - 1, lf[2].base); p.px(ex, ey - 1, lf[1].light);
    }
  }
  function frameBox(p, x, y, w, h, c) { p.rect(x - 1, y - 1, w + 2, h + 2, mix(c, '#120d1f', 0.5)); p.rect(x, y, w, h, c); }
  // poster with hand-pixelled design: kind 'beat' | 'bass' | 'record' | 'wave' | 'face'
  function poster(p, x, y, w, h, kind, c1, c2, tilt) {
    const bg = rp(c1), R2 = rp(c2);
    p.rect(x + 1, y + 1, w, h, '#120d1f', 70);       // paper shadow
    p.rect(x, y, w, h, bg.base); p.rect(x, y, w, 1, bg.light); p.rect(x, y, 1, h, bg.light); p.rect(x, y + h - 1, w, 1, bg.shade);
    if (kind === 'beat') {
      p.ellipse(x + w / 2 - 0.5, y + h * 0.4, w * 0.33, w * 0.33, R2.base);
      p.ellipse(x + w / 2 - 0.5, y + h * 0.4, w * 0.2, w * 0.2, bg.deep);
      p.ellipse(x + w / 2 - 0.5, y + h * 0.4, 1, 1, R2.hi);
      txt(p, 'BEAT', x + Math.round((w - tw('BEAT')) / 2), y + h - 17, '#fffaf0');
      txt(p, 'BOX', x + Math.round((w - tw('BOX')) / 2), y + h - 9, R2.hi);
    } else if (kind === 'bass') {
      p.rect(x + 2, y + 2, w - 4, 1, R2.base);
      txt(p, 'DROP', x + Math.round((w - 20) / 2), y + 5, '#fffaf0');
      txt(p, 'BASS', x + Math.round((w - 20) / 2), y + 13, R2.hi);
      txt(p, 'NOT', x + Math.round((w - 15) / 2), y + 21, '#fffaf0');
      txt(p, 'BOMBS', x + Math.round((w - 29) / 2), y + 29, R2.hi);
      for (let i = 0; i < 4; i++) p.rect(x + 3 + i * 4, y + h - 10 - (i % 2) * 4, 2, 8 + (i % 2) * 4, R2.base);
    } else if (kind === 'record') {
      p.ellipse(x + w / 2 - 0.5, y + h / 2 - 0.5, w / 2 - 2, w / 2 - 2, '#241a3c');
      p.ellipse(x + w / 2 - 0.5, y + h / 2 - 0.5, w / 4, w / 4, R2.base);
      p.px(x + w / 2 - 1, y + h / 2 - 1, '#fff0c9');
    } else if (kind === 'wave') {
      for (let i = 2; i < w - 2; i += 2) { const hh = 3 + Math.abs(Math.sin(i * 0.7) * (h / 3)); p.rect(x + i, y + h / 2 - hh / 2, 1, hh, i % 4 ? R2.base : R2.hi); }
    } else if (kind === 'face') {
      p.ellipse(x + w / 2 - 0.5, y + h * 0.45, w * 0.28, w * 0.34, '#e6a77f');
      p.rect(x + 4, y + h * 0.3 | 0, w - 8, 3, '#2a1a3c'); p.rect(x + 5, y + h * 0.45 | 0, w - 10, 2, R2.base);
      p.rect(x + 3, y + h - 8, w - 6, 5, R2.shade);
    }
    p.px(x, y, R2.hi); p.px(x + w - 1, y, R2.hi);
  }
  function bottle(p, x, y, h, c, o) {   // x centre, y bottom
    o = o || {}; const R = rp(c), w = o.w || 4;
    p.rect(x - w / 2, y - h * 0.6, w, h * 0.6, R.base);
    p.rect(x - w / 2, y - h * 0.6, 1, h * 0.6, R.light);
    p.rect(x + w / 2 - 1, y - h * 0.6, 1, h * 0.6, R.shade);
    p.rect(x - 1, y - h, 2, h * 0.4, R.base); p.px(x - 1, y - h, R.light);
    p.rect(x - 1, y - h - 1, 2, 1, o.cap || R.deep);
    if (o.label) p.rect(x - w / 2 + 1, y - h * 0.35, w - 2, 3, o.label);
    p.px(x - w / 2 + 1, y - h * 0.5, R.hi);
  }
  function cup(p, x, y, c, w, h) { w = w || 6; h = h || 7; const R = rp(c); p.poly([[x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2 - 1, y], [x - w / 2 + 1, y]], R.base); p.rect(x - w / 2, y - h, w, 1, R.light); p.rect(x + w / 2 - 2, y - h, 1, h, R.shade); }
  function fruit(p, x, y, r, c) {       // x,y centre, shaded round fruit
    const R = rp(c); p.shadedEllipse(x, y, r, r, R); p.px(x - r + 1, y - r + 1, R.hi);
  }
  function cable(p, pts, c) { for (let i = 0; i + 1 < pts.length; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c); }
  // sagging string of lights between two points: returns bulb positions
  function stringLights(p, x0, y0, x1, y1, sag, cols, n, rr) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([lerp(x0, x1, t), lerp(y0, y1, t) + Math.sin(t * Math.PI) * sag]); }
    for (let i = 0; i < 40; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], '#2a1a3c');
    const bulbs = [];
    for (let i = 0; i < n; i++) { const q = pts[Math.round((i + 0.5) / n * 40)]; bulbs.push({ x: Math.round(q[0]), y: Math.round(q[1]) + 2, c: cols[i % cols.length] }); }
    return bulbs;
  }
  function paintBulbs(p, bulbs, glowOn) {
    for (const b of bulbs) {
      const R = rp(b.c);
      p.px(b.x, b.y - 1, '#2a1a3c');
      p.rect(b.x - 1, b.y, 3, 3, R.base); p.px(b.x - 1, b.y, R.hi); p.px(b.x + 1, b.y + 2, R.shade);
      if (glowOn) glow(p, b.x, b.y + 1, 9, b.c, 0.55);
    }
  }
  // crowd silhouette row (backs of heads + shoulders). rim = warm rim light colour
  function crowd(p, y, x0, x1, rr, body, rim, size, raised) {
    size = size || 1; const people = [];
    for (let x = x0; x < x1; x += Math.round((9 + rr() * 6) * size)) people.push({ x, s: 0.85 + rr() * 0.35, up: raised && rr() < 0.5, hat: rr() < 0.18, ph: rr() });
    for (const q of people) {
      const hr = Math.round(4.5 * q.s * size), sw = Math.round(8.5 * q.s * size), sh = Math.round(sw * 0.7), yy = y + Math.round((1 - q.s) * 8);
      const top = yy - sh, hy = top - hr + 1;
      const shape = (c, ox, oy) => {
        p.ellipse(q.x + ox, yy + oy, sw, sh, c);
        p.rect(q.x - 1 + ox, top - 2 + oy, 3, 4, c);
        p.ellipse(q.x + ox, hy + oy, hr, hr + 0.5, c);
        if (q.hat) p.rect(q.x - hr - 1 + ox, hy - 1 + oy, hr * 2 + 3, 2, c);
        if (q.up) { const ah = Math.round(12 * size), d = q.ph > 0.5 ? 3 : 0; p.rect(q.x - sw + 1 + ox, top - ah + oy, 2, ah + 3, c); p.rect(q.x + sw - 3 + ox, top - ah + d + oy, 2, ah + 3 - d, c); p.rect(q.x - sw + oy * 0 + ox, top - ah - 1 + oy, 4, 2, c); p.rect(q.x + sw - 4 + ox, top - ah - 1 + d + oy, 4, 2, c); }
      };
      shape(rim, -1, -1); shape(body, 0, 0);
      p.px(q.x - 2, hy - 1, mix(rim, '#ffffff', 0.5));
    }
  }
  // clothing hanger rack item: coat on hanger
  function garment(p, x, y, kind, c, h) {
    const R = rp(c); h = h || 20;
    p.px(x, y - 2, '#c7bfd8'); p.px(x - 1, y - 1, '#c7bfd8'); p.px(x + 1, y - 1, '#c7bfd8');
    p.line(x - 4, y, x + 4, y, '#9c93b8');
    if (kind === 'dress') { p.poly([[x - 3, y + 1], [x + 3, y + 1], [x + 6, y + h], [x - 6, y + h]], R.base); p.rect(x - 3, y + 1, 1, h - 1, R.light); p.rect(x + 3, y + 3, 2, h - 3, R.shade); dfill(p, x - 6, y + h - 3, 12, 3, R.deep, 2); }
    else if (kind === 'tee') { p.rect(x - 5, y + 1, 10, 6, R.base); p.rect(x - 3, y + 7, 6, h - 7, R.base); p.rect(x - 5, y + 1, 10, 1, R.light); p.rect(x + 3, y + 7, 2, h - 7, R.shade); p.px(x, y + 1, R.deep); p.px(x - 1, y + 1, R.deep); p.px(x + 1, y + 1, R.deep); }
    else { p.rect(x - 5, y + 1, 10, h, R.base); p.rect(x - 5, y + 1, 2, h, R.light); p.rect(x + 3, y + 1, 2, h, R.shade); p.vline(x, y + 3, h - 3, R.deep); p.px(x - 1, y + 5, R.hi); p.px(x + 1, y + 8, R.hi); }
  }
  function hat(p, x, y, kind, c) {   // x centre, y bottom of the hat
    const R = rp(c);
    if (kind === 'cap') { p.ellipse(x, y - 4, 5, 4, R.base); p.rect(x - 5, y - 1, 11, 2, R.shade); p.rect(x + 2, y - 1, 7, 2, R.deep); p.px(x - 2, y - 6, R.light); p.px(x - 3, y - 5, R.hi); p.px(x, y - 8, R.deep); }
    else if (kind === 'fedora') { p.ellipse(x, y - 1, 8, 1.5, R.shade); p.rect(x - 4, y - 8, 9, 7, R.base); p.rect(x - 4, y - 8, 2, 7, R.light); p.rect(x - 4, y - 3, 9, 2, R.deep); p.hline(x - 3, y - 9, 7, R.base); p.px(x + 3, y - 3, '#ffbe55'); }
    else if (kind === 'beanie') { p.ellipse(x, y - 5, 5, 5, R.base); p.rect(x - 5, y - 2, 11, 3, R.shade); dfill(p, x - 4, y - 8, 4, 2, R.light, 2); p.px(x, y - 11, R.hi); p.px(x - 1, y - 10, R.light); p.px(x + 1, y - 10, R.light); }
    else if (kind === 'bucket') { p.poly([[x - 4, y - 8], [x + 4, y - 8], [x + 5, y - 2], [x - 5, y - 2]], R.base); p.ellipse(x, y - 1, 8, 1.5, R.shade); p.rect(x - 4, y - 8, 2, 6, R.light); p.rect(x - 4, y - 3, 9, 1, R.deep); }
    else { p.rect(x - 7, y - 3, 15, 2, R.shade); p.poly([[x - 4, y - 3], [x + 4, y - 3], [x + 3, y - 9], [x - 3, y - 9]], R.base); p.rect(x - 3, y - 9, 2, 6, R.light); }
  }
  function shades(p, x, y, c, w) {     // sunglasses, x,y = top left
    w = w || 11; const R = rp(c);
    p.rect(x, y, 4, 3, R.base); p.rect(x + w - 4, y, 4, 3, R.base); p.hline(x + 4, y, w - 8, R.shade);
    p.px(x, y, R.hi); p.px(x + w - 4, y, R.hi); p.px(x + 1, y + 1, '#7fb2ff'); p.px(x + w - 3, y + 1, '#7fb2ff');
    p.px(x - 1, y, R.deep); p.px(x + w, y, R.deep);
  }

  /* ================================================================ icons */
  const ICON_NAMES = ['energy', 'food', 'mood', 'cash', 'fans', 'level', 'mus', 'tech', 'ori', 'show', 'lock', 'check', 'cross', 'heart', 'star', 'note', 'mic', 'hat', 'glasses', 'shirt', 'pants', 'shoe', 'sleep', 'eat', 'train', 'busk', 'battle', 'shop', 'home', 'park', 'bar', 'studio', 'gear', 'sound', 'mute', 'back', 'left', 'right', 'coin', 'trophy', 'clock', 'sun', 'moon', 'dice', 'shuffle', 'camera', 'palette', 'wand'];
  // bevel: 1px light on top/left silhouette edges, 1px shade on bottom/right, then a coloured outline
  function fin(z, noOutline) {
    const p = gr(z), w = p.w, h = p.h, src = p.data.slice(), a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a(x, y) < 128) continue;
      const i = (y * w + x) * 4, c = [src[i], src[i + 1], src[i + 2]];
      if (a(x, y - 1) < 128 || a(x - 1, y) < 128) p.px(x, y, lighten(c, 0.38));
      else if (a(x, y + 1) < 128 || a(x + 1, y) < 128) p.px(x, y, mix(darken(c, 0.25), '#43296f', 0.25));
    }
    if (!noOutline) p.outline((c) => mix(darken(c, 0.45), '#2c1d4d', 0.5));
  }
  const KK = '#43296f', WH = '#fffaf0';
  const ICON_DRAW = {
    energy: (p) => { p.poly([[8, 1], [1.5, 7], [5, 7], [4, 11], [10.5, 4.5], [7, 4.5], [9.5, 1]], '#ffd23f'); fin(p); p.px(7, 2, WH); p.px(6, 3, '#fff0c9'); },
    food: (p) => { p.ellipse(4, 6.5, 2.6, 3.2, '#ff4f5e'); p.ellipse(7, 6.5, 2.6, 3.2, '#ff4f5e'); p.poly([[6, 4], [7, 1], [10, 1], [10, 3], [8, 4]], '#4fbf6f'); fin(p); p.px(6, 2, '#6f3d2b'); p.px(3, 5, WH); },
    mood: (p) => { const n = gr(p); n.ellipse(7.5, 7.5, 6.6, 6.6, '#ffd23f'); fin(p); n.ellipse(6, 5, 3, 2, '#fff0a8'); n.rect(5, 5, 2, 3, KK); n.rect(10, 5, 2, 3, KK); n.px(5, 5, '#8a6aff'); n.px(10, 5, '#8a6aff'); n.px(4, 9, KK); n.px(11, 9, KK); n.rect(5, 10, 6, 1, KK); n.rect(6, 11, 4, 1, KK); n.px(3, 8, '#ff8a6b'); n.px(12, 8, '#ff8a6b'); n.px(3, 9, '#ff8a6b'); n.px(12, 9, '#ff8a6b'); },
    cash: (p) => { const n = gr(p); n.ellipse(7.5, 7.5, 6.6, 6.6, '#ffbe55'); fin(p); n.ring(7.5, 7.5, 5, 5, '#d4a017'); n.ring(7.5, 7.5, 4, 4, '#e8a21c'); Font.draw(n, '$', 5, 4, '#7a4a14'); Font.draw(n, '$', 5, 3, '#fff0c9'); Font.draw(n, '$', 5, 4, '#8a5a1c'); n.px(3, 3, WH); n.px(4, 2, WH); },
    fans: (p) => { const n = gr(p); for (const [x, y, c, r] of [[3.5, 5.5, '#a86bff', 2.2], [12, 5.5, '#a86bff', 2.2]]) { n.ellipse(x, y, r, r, c); n.ellipse(x, y + 5.5, 3, 2.4, c); } n.ellipse(7.8, 5, 2.9, 2.9, '#ff6bb5'); n.ellipse(7.8, 11.5, 4.6, 3.2, '#ff6bb5'); fin(p); n.px(6, 3, WH); n.px(7, 3, WH); n.px(6, 11, '#ffc0e0'); n.px(5, 12, '#ffc0e0'); n.rect(12, 1, 1, 3, '#ffe14d'); n.rect(11, 2, 3, 1, '#ffe14d'); },
    level: (p) => { const n = gr(p); n.poly([[8, 0.5], [14, 3], [14, 9], [8, 15], [2, 9], [2, 3]], '#2ee6ff'); fin(p); n.line(5, 8, 8, 5, WH); n.line(8, 5, 11, 8, WH); n.line(5, 9, 8, 6, WH); n.line(8, 6, 11, 9, WH); n.line(5, 11, 8, 8, '#b8f6ff'); n.line(8, 8, 11, 11, '#b8f6ff'); n.px(4, 3, WH); n.px(3, 4, '#b8f6ff'); },
    mus: (p) => { p.ellipse(4, 8.5, 2.5, 2, '#2ee6ff'); p.rect(6, 1, 2, 8, '#2ee6ff'); p.poly([[8, 1], [11, 3], [11, 6], [8, 4]], '#2ee6ff'); fin(p); p.px(3, 8, WH); },
    tech: (p) => { const n = gr(p); n.rect(3, 3, 10, 10, '#8a87a8'); for (let i = 0; i < 4; i++) { n.rect(1, 4 + i * 2.5 | 0, 2, 1, '#c7bfd8'); n.rect(13, 4 + i * 2.5 | 0, 2, 1, '#c7bfd8'); n.rect(4 + i * 2.5 | 0, 1, 1, 2, '#c7bfd8'); n.rect(4 + i * 2.5 | 0, 13, 1, 2, '#c7bfd8'); } fin(p); n.rect(5, 5, 6, 6, '#2c2748'); n.rect(6, 6, 4, 4, '#2ee6ff'); n.px(6, 6, WH); n.px(7, 7, '#b8f6ff'); n.px(4, 4, '#c7bfd8'); n.px(3, 3, '#e8e4f6'); },
    ori: (p) => { p.ellipse(5.5, 4.5, 3.5, 3.5, '#ffe14d'); p.rect(4, 7, 4, 3, '#a7a3c4'); fin(p); p.hline(4, 8, 4, '#6a6788'); p.px(4, 3, WH); p.px(5, 4, '#ff9a4a'); p.px(6, 5, '#ff9a4a'); p.px(7, 4, '#ff9a4a'); },
    show: (p) => { p.poly([[1, 3], [3.5, 6], [5.5, 2], [7.5, 6], [10, 3], [9.5, 9.5], [1.5, 9.5]], '#ffd23f'); fin(p); p.px(2, 8, '#ff3ea5'); p.px(5, 8, '#2ee6ff'); p.px(8, 8, '#ff3ea5'); p.px(5, 3, WH); },
    lock: (p) => { p.rect(2, 5, 8, 6, '#ffbe55'); p.rect(3, 1, 6, 5, '#a7a3c4'); p.rect(5, 3, 2, 4, '#6a6788'); p.rect(2, 5, 8, 6, '#ffbe55'); fin(p); p.px(5, 7, KK); p.px(6, 7, KK); p.px(5, 8, KK); p.px(6, 8, KK); p.px(5, 9, KK); },
    check: (p) => { p.line(2, 6, 4, 8, '#4fdf6f', 2); p.line(4, 8, 9, 2, '#4fdf6f', 2); fin(p); },
    cross: (p) => { p.line(2, 2, 9, 9, '#ff4f5e', 2); p.line(9, 2, 2, 9, '#ff4f5e', 2); fin(p); },
    heart: (p) => { const n = gr(p); n.ellipse(5, 5.5, 3.8, 3.8, '#ff4f6e'); n.ellipse(10.5, 5.5, 3.8, 3.8, '#ff4f6e'); n.poly([[1.2, 7], [14.3, 7], [7.8, 14.5]], '#ff4f6e'); fin(p); n.px(3, 3, WH); n.px(4, 3, WH); n.px(3, 4, '#ffd0dc'); n.px(2, 5, '#ffd0dc'); },
    star: (p) => { starShape(p, '#ffd23f', 5.5, 5.8, 5.2, 2.3); fin(p); p.px(5, 3, WH); },
    note: (p) => { p.ellipse(3, 8.5, 2, 1.6, '#ff3ea5'); p.ellipse(8, 7.5, 2, 1.6, '#ff3ea5'); p.rect(4, 2, 1, 7, '#ff3ea5'); p.rect(9, 1, 1, 7, '#ff3ea5'); p.rect(4, 1, 6, 2, '#ff3ea5'); fin(p); p.px(2, 8, WH); },
    mic: (p) => { p.ellipse(5.5, 3.5, 3, 3.2, '#c7bfd8'); p.rect(4, 6, 4, 1, '#8a87a8'); p.poly([[4, 7], [8, 7], [7, 11], [5, 11]], '#46405e'); fin(p); p.hline(3, 3, 5, '#6a6788'); p.px(4, 2, WH); p.px(7, 5, '#6a6788'); },
    hat: (p) => { p.ellipse(5, 5.5, 4, 3.5, '#3a5fcd'); p.rect(1, 7, 10, 2, '#3a5fcd'); p.rect(6, 8, 5, 2, '#2c4aa0'); fin(p); p.px(3, 3, '#9fc2ff'); p.px(5, 1, '#ff3ea5'); },
    glasses: (p) => { p.rect(1, 3, 4, 4, '#2c1d4d'); p.rect(7, 3, 4, 4, '#2c1d4d'); p.rect(5, 3, 2, 1, '#2c1d4d'); fin(p); p.px(2, 4, '#2ee6ff'); p.px(3, 5, '#7fb2ff'); p.px(8, 4, '#2ee6ff'); p.px(9, 5, '#7fb2ff'); },
    shirt: (p) => { p.poly([[4, 1], [8, 1], [11, 3.5], [9.5, 6], [8, 5], [8, 10], [4, 10], [4, 5], [2.5, 6], [1, 3.5]], '#ff6b6b'); fin(p); p.px(5, 1, KK); p.px(6, 2, KK); p.px(7, 1, KK); p.px(5, 6, WH); p.px(6, 6, WH); },
    pants: (p) => { p.poly([[2, 1], [10, 1], [10, 11], [7, 11], [6, 5], [5, 11], [2, 11]], '#3a5fcd'); fin(p); p.hline(2, 2, 8, '#2c4aa0'); p.px(5, 3, '#ffd23f'); p.px(4, 7, '#7fa2ff'); },
    shoe: (p) => { p.poly([[1, 3], [4, 3], [5, 5], [9, 6], [11, 8], [11, 10], [1, 10]], '#ff3ea5'); fin(p); p.hline(1, 9, 10, WH); p.px(5, 4, WH); p.px(4, 6, WH); p.px(2, 4, '#ffb0dd'); },
    sleep: (p) => { p.ellipse(4.5, 6.5, 3.8, 3.8, '#ffe14d'); cut(p, 6.5, 5.5, 3.2, 3.2); fin(p); p.rect(6, 1, 5, 1, '#a86bff'); p.px(10, 2, '#a86bff'); p.px(9, 3, '#a86bff'); p.px(8, 4, '#a86bff'); p.rect(7, 5, 4, 1, '#a86bff'); },
    eat: (p) => { p.poly([[1, 5], [10, 5], [9, 9], [2, 9]], '#fff0c9'); p.hline(1, 5, 10, '#fff0c9'); p.ellipse(3.5, 4, 2, 1.8, '#4fbf6f'); p.ellipse(7, 3.5, 2.2, 2, '#ff6b6b'); p.ellipse(5.5, 3, 1.6, 1.4, '#7fe08a'); fin(p); p.px(3, 7, '#ffbe55'); },
    train: (p) => { p.rect(0 + 1, 3, 2, 5, '#9fb2d8'); p.rect(3, 4, 1, 3, '#6a6788'); p.rect(4, 5, 4, 1, '#c7bfd8'); p.rect(8, 4, 1, 3, '#6a6788'); p.rect(9, 3, 2, 5, '#9fb2d8'); fin(p); p.px(1, 4, WH); p.px(9, 4, WH); },
    busk: (p) => { p.ellipse(3.5, 8.5, 2.8, 2.4, '#c9783c'); p.ellipse(5, 6.5, 2.2, 2, '#c9783c'); p.line(6, 5, 10, 1, '#6f3d2b', 2); fin(p); p.px(3, 8, '#43296f'); p.px(4, 8, '#43296f'); p.px(3, 7, '#ffbe55'); p.px(9, 0, '#ffe14d'); },
    battle: (p) => { p.line(2, 9, 8, 3, '#c7bfd8', 2); p.line(9, 9, 3, 3, '#c7bfd8', 2); p.ellipse(8.5, 2.5, 1.8, 1.8, '#ff3ea5'); p.ellipse(2.5, 2.5, 1.8, 1.8, '#2ee6ff'); fin(p); },
    shop: (p) => { p.rect(2, 4, 8, 7, '#ffbe55'); p.rect(4, 1, 1, 3, '#a7a3c4'); p.rect(7, 1, 1, 3, '#a7a3c4'); p.hline(4, 1, 4, '#a7a3c4'); fin(p); p.px(5, 6, KK); p.px(6, 6, KK); p.px(5, 7, '#ff3ea5'); p.px(6, 7, '#ff3ea5'); p.px(3, 5, WH); },
    home: (p) => { p.poly([[5.5, 0.5], [11, 5.5], [1, 5.5]], '#ff6b6b'); p.rect(2, 5, 8, 6, '#ffbe55'); fin(p); p.rect(5, 7, 2, 4, '#6a3b8f'); p.px(3, 6, '#7fb2ff'); p.px(8, 6, '#7fb2ff'); },
    park: (p) => { p.ellipse(5.5, 4, 4, 3.4, '#3f9b5a'); p.ellipse(4, 3.5, 2.5, 2, '#4fbf6f'); p.rect(5, 7, 2, 4, '#8a5a3c'); fin(p); p.px(3, 2, '#9ff0a0'); },
    bar: (p) => { p.poly([[1, 1], [11, 1], [6.5, 6], [6.5, 9], [4.5, 9], [4.5, 6]], '#ff3ea5'); p.rect(3, 10, 6, 1, '#ff3ea5'); fin(p); p.px(5, 2, WH); p.px(9, 0, '#9dff4a'); },
    studio: (p) => { p.ring(5.5, 5.5, 4.5, 4.5, '#a7a3c4'); p.ring(5.5, 5.5, 3.5, 3.5, '#a7a3c4'); { const n = gr(p); for (let y = 8; y < 16; y++) for (let x = 0; x < 16; x++) n.data[(y * 16 + x) * 4 + 3] = 0; } p.rect(1, 6, 3, 5, '#2ee6ff'); p.rect(8, 6, 3, 5, '#2ee6ff'); fin(p); p.px(2, 7, WH); p.px(9, 7, WH); },
    gear: (p) => { const n = gr(p); n.ellipse(7.5, 7.5, 4.8, 4.8, '#c7bfd8'); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; n.rect(Math.round(7.5 + Math.cos(a) * 5.6 - 1), Math.round(7.5 + Math.sin(a) * 5.6 - 1), 3, 3, '#c7bfd8'); } fin(p); n.ellipse(7.5, 7.5, 2.2, 2.2, '#46405e'); n.px(6, 6, '#6a6788'); n.px(4, 4, WH); n.px(3, 6, '#e8e4f6'); },
    sound: (p) => { p.poly([[1, 4], [4, 4], [7, 1], [7, 10], [4, 7], [1, 7]], '#c7bfd8'); fin(p); p.px(9, 4, '#2ee6ff'); p.px(10, 3, '#2ee6ff'); p.px(10, 7, '#2ee6ff'); p.px(9, 6, '#2ee6ff'); p.vline(10, 4, 3, '#2ee6ff'); },
    mute: (p) => { p.poly([[0, 4], [3, 4], [6, 1], [6, 10], [3, 7], [0, 7]], '#8a87a8'); fin(p); p.line(8, 3, 11, 8, '#ff4f5e'); p.line(11, 3, 8, 8, '#ff4f5e'); },
    back: (p) => { p.poly([[1, 4.5], [4.5, 1], [4.5, 3.5], [8, 3.5], [10.5, 6], [10.5, 10], [8.5, 10], [8.5, 7], [7, 5.5], [4.5, 5.5], [4.5, 8]], '#fff0c9'); fin(p); },
    left: (p) => { p.poly([[8, 1], [8, 10], [2, 5.5]], '#fff0c9'); fin(p); },
    right: (p) => { p.poly([[2, 1], [2, 10], [8, 5.5]], '#fff0c9'); fin(p); },
    coin: (p) => { p.ellipse(5.5, 5.5, 4.5, 4.5, '#ffd23f'); fin(p); p.ring(5.5, 5.5, 3, 3, '#d4a017'); p.rect(5, 4, 2, 4, '#fff0c9'); p.px(5, 4, '#fff0c9'); },
    trophy: (p) => { p.poly([[2, 1], [9, 1], [8.5, 5], [7, 7], [4, 7], [2.5, 5]], '#ffd23f'); p.rect(0, 2, 2, 3, '#ffd23f'); p.rect(9, 2, 2, 3, '#ffd23f'); p.rect(5, 7, 1, 2, '#d4a017'); p.rect(3, 9, 5, 2, '#ffbe55'); fin(p); p.px(3, 2, WH); p.vline(3, 3, 2, '#fff0c9'); },
    clock: (p) => { p.ellipse(5.5, 5.5, 4.6, 4.6, '#fff0c9'); fin(p); p.ring(5.5, 5.5, 4, 4, '#a86bff'); p.vline(5, 3, 3, KK); p.hline(5, 5, 3, KK); p.px(5, 1, '#a86bff'); },
    sun: (p) => { p.ellipse(5.5, 5.5, 3, 3, '#ffd23f'); for (const [x, y] of [[5, 0], [5, 10], [0, 5], [10, 5], [1, 1], [9, 1], [1, 9], [9, 9]]) p.px(x + 0.4, y + 0.4, '#ffbe55'); p.px(6, 0, '#ffbe55'); p.px(6, 10, '#ffbe55'); p.px(0, 6, '#ffbe55'); p.px(10, 6, '#ffbe55'); p.px(4, 4, WH); p.px(3, 3, '#fff0c9'); fin(p, true); },
    moon: (p) => { p.ellipse(5, 5.5, 4.5, 4.8, '#ffe9a8'); cut(p, 7.5, 4.5, 3.8, 3.8); p.px(8, 8, '#ffe9a8'); fin(p); p.px(3, 5, '#fff'); p.px(9, 2, '#fff0c9'); },
    dice: (p) => { p.rect(1, 1, 10, 10, '#fffaf0'); fin(p); for (const [x, y] of [[3, 3], [8, 3], [5, 6], [3, 8], [8, 8]]) p.rect(x, y, 2, 2, '#ff3ea5'); },
    shuffle: (p) => { const n = gr(p); n.rect(1, 4, 9, 2, '#2ee6ff'); n.poly([[9, 1.5], [14.5, 5], [9, 8.5]], '#2ee6ff'); n.rect(6, 10, 9, 2, '#2ee6ff'); n.poly([[7, 7.5], [1.5, 11], [7, 14.5]], '#2ee6ff'); fin(p); n.px(2, 4, WH); n.px(7, 10, WH); },
    camera: (p) => { p.rect(1, 3, 10, 7, '#8a87a8'); p.rect(3, 1, 4, 2, '#8a87a8'); fin(p); p.ellipse(5.5, 6.5, 2.2, 2.2, '#2c1d4d'); p.ellipse(5.5, 6.5, 1, 1, '#2ee6ff'); p.px(9, 4, '#ff3ea5'); p.px(4, 5, WH); },
    palette: (p) => { p.ellipse(5.5, 5.5, 5, 4.2, '#d9a46e'); cut(p, 8, 7.5, 1.5, 1.2); fin(p); p.px(3, 4, '#ff3ea5'); p.px(5, 2, '#2ee6ff'); p.px(8, 3, '#ffe14d'); p.px(2, 6, '#9dff4a'); p.px(4, 8, '#a86bff'); },
    wand: (p) => { p.line(1, 10, 8, 3, '#6a3b8f', 2); p.px(8, 3, '#fff0c9'); starShape(p, '#ffe14d', 8.5, 2.8, 2.8, 1.2); fin(p); p.px(2, 7, '#ffe14d'); p.px(10, 7, '#ff3ea5'); p.px(4, 1, '#2ee6ff'); },
  };
  function gearShape(p, c, cx, cy, ro, ri, n) {
    p.ellipse(cx, cy, ri - 0.3, ri - 0.3, c);
    for (let k = 0; k < n; k++) { const a = k * Math.PI * 2 / n; p.rect(Math.round(cx + Math.cos(a) * (ri + 0.9) - 1), Math.round(cy + Math.sin(a) * (ri + 0.9) - 1), 2, 2, c); }
  }
  function heartShape(p, c, cx, cy, r) {   // two lobes + a point, fits 2r x 2r around (cx,cy)
    const k = r / 4.6;
    p.ellipse(cx - 1.7 * k, cy - 1.5 * k, 2.8 * k, 2.8 * k, c); p.ellipse(cx + 1.7 * k, cy - 1.5 * k, 2.8 * k, 2.8 * k, c);
    p.poly([[cx - 4.4 * k, cy - 0.6 * k], [cx + 4.4 * k, cy - 0.6 * k], [cx, cy + 4.9 * k]], c);
  }
  function starShape(p, c, cx, cy, ro, ri) {
    const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    p.poly(pts, c);
  }
  const _icons = {};
  World.icon = function (name) {
    if (_icons[name]) return _icons[name];
    const fn = ICON_DRAW[name];
    const pxs = new Z(12, 12);
    if (fn) fn(pxs); else { pxs.rect(2, 2, 8, 8, '#ff3ea5'); fin(pxs); }
    return (_icons[name] = pxs.n);
  };
  World.iconNames = ICON_NAMES;

  /* ================================================================ fx sprites */
  const _fx = {};
  function fxBuild(name) {
    const m = (w, h, fn) => mk(w, h, fn);
    switch (name) {
      case 'note': return m(9, 11, (p) => { p.ellipse(3, 8.5, 2.2, 1.8, '#2ee6ff'); p.rect(4, 2, 2, 7, '#2ee6ff'); p.rect(6, 2, 2, 2, '#2ee6ff'); p.px(8, 4, '#2ee6ff'); fin(p); p.px(2, 8, WH); });
      case 'note2': return m(12, 11, (p) => { p.ellipse(3, 8.5, 2, 1.6, '#ff3ea5'); p.ellipse(8, 7.5, 2, 1.6, '#ff3ea5'); p.rect(4, 2, 1, 7, '#ff3ea5'); p.rect(9, 1, 1, 7, '#ff3ea5'); p.rect(4, 1, 6, 2, '#ff3ea5'); fin(p); p.px(2, 8, WH); });
      case 'star': return m(9, 9, (p) => { p.px(4, 4, WH); p.rect(3, 3, 3, 3, '#fff0c9'); p.vline(4, 0, 9, '#ffe14d'); p.hline(0, 4, 9, '#ffe14d'); p.px(4, 1, WH); p.px(4, 7, WH); p.px(1, 4, WH); p.px(7, 4, WH); p.px(4, 4, WH); p.px(3, 3, '#ffbe55'); p.px(5, 5, '#ffbe55'); p.px(5, 3, '#ffbe55'); p.px(3, 5, '#ffbe55'); });
      case 'heart': return m(11, 10, (p) => { heartShape(p, '#ff4f6e', 5, 4.5, 4.4); p.px(3, 2, WH); p.px(2, 3, '#ffd0dc'); fin(p); });
      case 'spark': return m(7, 7, (p) => { p.px(3, 3, WH); p.px(3, 2, '#fff0c9'); p.px(3, 4, '#fff0c9'); p.px(2, 3, '#fff0c9'); p.px(4, 3, '#fff0c9'); p.px(3, 1, '#ffbe55'); p.px(3, 5, '#ffbe55'); p.px(1, 3, '#ffbe55'); p.px(5, 3, '#ffbe55'); p.px(1, 1, '#ff9a4a'); p.px(5, 5, '#ff9a4a'); });
      case 'ring': return [8, 14, 20].map((s, k) => m(s + 2, s + 2, (p) => { const r = s / 2 - 0.5, c = (s + 1) / 2; p.ring(c, c, r, r, k === 0 ? WH : k === 1 ? '#2ee6ff' : '#2e8fa8'); if (k < 2) p.ring(c, c, r - 1, r - 1, k === 0 ? '#2ee6ff' : '#2e8fa8'); }));
      case 'coin': return [[5, 5], [4, 5], [2, 5], [4, 5]].map(([rx, ry], k) => m(12, 12, (p) => { p.ellipse(5.5, 5.5, rx, ry + 0.5, '#ffd23f'); p.outline((c) => mix(darken(c, 0.4), '#2c1d4d', 0.5)); if (rx > 3) { p.rect(5, 3, 2, 5, '#fff0c9'); p.px(3, 3, WH); } else if (rx > 1) p.vline(5, 2, 7, '#fff0c9'); else p.vline(5, 1, 9, '#d4a017'); }));
      case 'confetti': return ['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a'].map((c) => m(2, 3, (p) => { p.rect(0, 0, 2, 3, c); p.px(0, 0, lighten(c, 0.5)); }));
      case 'puff': return m(11, 9, (p) => { p.ellipse(3.5, 5.5, 3, 3, '#e8e4f6'); p.ellipse(7, 4.5, 3.5, 3.5, '#f4f1ff'); p.ellipse(5.5, 6, 4, 2.5, '#d4cfe8'); p.px(6, 3, WH); p.px(7, 3, WH); p.hline(2, 8, 8, '#a7a3c4'); });
      case 'drop': return m(5, 7, (p) => { p.poly([[2.5, 0], [4.5, 4], [4, 6], [1, 6], [0.5, 4]], '#2ee6ff'); p.px(1, 4, WH); p.px(1, 3, '#b8f6ff'); p.px(3, 5, '#2e8fa8'); });
      default: return m(5, 5, (p) => p.rect(0, 0, 5, 5, '#ff3ea5'));
    }
  }
  World.fx = function (name) { return _fx[name] || (_fx[name] = fxBuild(name)); };

  /* ================================================================ scenes */
  /* ---------------------------------------------------------------- shared room bits */
  function floorPlanks(p, x, y, w, h, base, rr, plankH) {
    const R = rp(base); plankH = plankH || 8;
    p.rect(x, y, w, h, R.base);
    for (let j = 0, r = 0; j < h; j += plankH, r++) {
      p.rect(x, y + j, w, 1, R.shade);
      for (let i = (r % 2) * 22 + Math.floor(rr() * 10); i < w; i += 44 + Math.floor(rr() * 20)) p.rect(x + i, y + j, 1, plankH, R.shade);
      for (let k = 0; k < 3; k++) { const gx = x + Math.floor(rr() * w), gy = y + j + 1 + Math.floor(rr() * (plankH - 2)); p.hline(gx, gy, 3 + Math.floor(rr() * 6), R.light); }
    }
    p.rect(x, y, w, 2, R.deep);
    streaks(p, x, y, w, h, [R.light, R.shade], Math.floor(w * h / 40), 9, 21); grain(p, x, y, w, h, [R.hi, R.deep], 0.006, 22);
    for (let j = 0; j < h; j += plankH) for (let k = 0; k < 2; k++) { const nx = x + Math.floor(rr() * w); p.px(nx, y + j + 2, R.deep); p.px(nx + 1, y + j + 2, R.light); }
  }
  function vignette(p, x, y, w, h, strength) {   // dithered dark corners, cool violet (native loop)
    const n = gr(p), s = strength || 1, x0 = sc(x), y0 = sc(y), nw = sc(w), nh = sc(h);
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      const dx = Math.abs(i - nw / 2) / (nw / 2), dy = Math.abs(j - nh / 2) / (nh / 2), d = Math.max(0, Math.pow(Math.max(dx, dy), 3) * 0.75 + (dx * dx + dy * dy) * 0.18 - 0.16);
      if (d * s < 0.1) continue;
      const v = dq(d * s, x0 + i, y0 + j); if (v > 0) n.px(x0 + i, y0 + j, '#1a1033', 110 * v);
    }
  }
  function citySky(P, X, Y, w, h, night, rr, neonCols) {
    const p = new Z(w, h), x = 0, y = 0;
    if (!night) {   // low amber sunset
      band(p, x, y, w, h, '#7a4aa8', '#ffbe55', 7);
      p.ellipse(x + w * 0.62, y + h - 14, 7, 7, '#fff0c9'); p.ellipse(x + w * 0.62, y + h - 14, 5, 5, '#ffe9a8');
      for (let i = 0; i < 3; i++) { dfill(p, x + 6 + i * 11, y + 8 + i * 5, 9, 2, '#ffd7a0', 2); }
    } else {
      band(p, x, y, w, h, '#150f30', '#3a2a6e', 6);
      for (let i = 0; i < 14; i++) p.px(x + Math.floor(rr() * w), y + Math.floor(rr() * h * 0.6), i % 3 ? '#c7bfd8' : '#fff');
      p.ellipse(x + w - 12, y + 12, 5, 5, '#ffe9a8'); cut(p, x + w - 9, y + 10, 4, 4); p.px(x + w - 15, y + 11, '#fff0c9');
    }
    // skyline silhouettes (two depths)
    const cols = night ? ['#241a4c', '#150f30'] : ['#a2548f', '#5b2a6e'];
    for (let layer = 0; layer < 2; layer++) {
      let cx = x - 2;
      while (cx < x + w) {
        const bw = 7 + Math.floor(rr() * 8), bh = Math.min(h - 8, 10 + layer * 8 + Math.floor(rr() * 20));
        p.rect(cx, y + h - bh, bw, bh, cols[layer]);
        if (night && layer === 1) for (let k = 0; k < 6; k++) if (rr() < 0.6) p.px(cx + 1 + Math.floor(rr() * (bw - 2)), y + h - bh + 2 + Math.floor(rr() * (bh - 3)), rr() < 0.5 ? '#ffbe55' : '#2ee6ff');
        if (!night && layer === 1) for (let k = 0; k < 3; k++) p.px(cx + 1 + Math.floor(rr() * (bw - 2)), y + h - bh + 3 + Math.floor(rr() * (bh - 4)), '#ffd7a0');
        cx += bw;
      }
    }
    if (night && neonCols) neonCols.forEach((c, i) => { p.rect(x + 6 + i * 20, y + h - 30 - i * 6, 8, 2, c.c); });
    gr(P).blit(p.n, sc(X), sc(Y));
  }
  function venetian(p, x, y, w, h, c) {
    const R = rp(c);
    for (let yy = y; yy < y + h; yy += 3) { p.rect(x, yy, w, 2, R.light); p.rect(x, yy + 2, w, 1, R.shade); }
    p.rect(x, y + h, w, 3, R.deep); p.rect(x, y + h, w, 1, R.base);
    p.vline(x + w - 6, y + h + 3, 12, '#d8c8e8'); p.rect(x + w - 7, y + h + 15, 3, 3, '#ffbe55');
  }
  function mirrorGlass(p, x, y, w, h, night) {
    p.rect(x, y, w, h, night ? '#4a5a9a' : '#b8d8ee');
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = (i + j * 0.6) % 20; if (v < 2) p.px(x + i, y + j, night ? '#7a8ad0' : '#eaf6ff'); }
    dfill(p, x, y + h - 12, w, 12, night ? '#2a2a5a' : '#8aa8d0', 2);
  }

  /* ---------------------------------------------------------------- extra detail props */
  function books(p, x, y, n, rr, maxH) {          // a run of book spines standing on y; returns end x
    const cs = ['#ff3ea5', '#2ee6ff', '#ffbe55', '#9dff4a', '#a86bff', '#ff6b6b', '#3a5fcd', '#fff0c9'];
    let cx = x;
    for (let i = 0; i < n; i++) {
      const bw = 2 + Math.floor(rr() * 3), bh = maxH - 4 + Math.floor(rr() * 6), c = cs[Math.floor(rr() * cs.length)], R = rp(c);
      p.rect(cx, y - bh, bw, bh, R.base); p.rect(cx, y - bh, 1, bh, R.light); p.rect(cx + bw - 1, y - bh, 1, bh, R.shade);
      p.rect(cx, y - bh + 2, bw, 1, R.hi); p.rect(cx, y - 3, bw, 1, R.deep);
      cx += bw;
    }
    return cx;
  }
  function sneaker(p, x, y, c, flip) {             // x,y = left-bottom, ~14 wide
    const R = rp(c), d = flip ? -1 : 1, X = (dx) => (flip ? x + 13 - dx : x + dx);
    p.rect(Math.min(X(0), X(13)), y - 2, 14, 2, '#fffaf0'); p.rect(Math.min(X(0), X(13)), y, 14, 1, '#a7a3c4');
    p.poly([[X(1), y - 2], [X(1), y - 7], [X(5), y - 8], [X(8), y - 5], [X(13), y - 4], [X(13), y - 2]], R.base);
    p.px(X(4), y - 7, R.hi); p.px(X(6), y - 6, '#fffaf0'); p.px(X(7), y - 5, '#fffaf0'); p.px(X(9), y - 4, '#fffaf0');
    p.rect(Math.min(X(1), X(3)), y - 6, 2, 3, R.shade);
  }
  function laser(p, x0, y0, x1, y1, color, a) {      // additive 1px native line (design coords)
    const n = gr(p), ax = x0 * K, ay = y0 * K, bx = x1 * K, by = y1 * K, L = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let i = 0; i <= L; i++) { const t = i / L, x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t); n.add(x, y, color, 200 * (1 - t * 0.5) * a); n.add(x + 1, y, color, 50 * a); }
  }
  function reflect(p, cx, y0, y1, hw, color, a, stripe) {   // soft vertical light streak on a glossy floor (native loop)
    const n = gr(p), Y0 = sc(y0), Y1 = sc(y1), X0 = sc(cx - hw), X1 = sc(cx + hw), CX = cx * K, HW = hw * K;
    for (let y = Y0; y < Y1; y++) { const f = 1 - (y - Y0) / (Y1 - Y0); for (let x = X0; x <= X1; x++) { const v = dq(f * a * (1 - Math.abs(x - CX) / HW) * (y % stripe ? 1 : 0.2), x, y); if (v > 0) n.add(x, y, typeof color === 'function' ? color(x, y) : color, 255 * v * 0.3); } }
  }
  function sparkle4(p, x, y, c) { const n = gr(p), X = sc(x), Y = sc(y); n.add(X, Y, '#ffffff', 255); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) n.add(X + dx, Y + dy, c, 200); n.add(X + 2, Y, c, 90); n.add(X - 2, Y, c, 90); n.add(X, Y + 2, c, 90); n.add(X, Y - 2, c, 90); }
  function addDust(p, x, y, w, h, count, seed, col) { const n = gr(p), r = rng(seed), x0 = sc(x), y0 = sc(y), nw = sc(w), nh = sc(h); for (let i = 0; i < count; i++) n.add(x0 + Math.floor(r() * nw), y0 + Math.floor(r() * nh), col || '#fff0c9', 80 + Math.floor(r() * 160)); }

  /* ================================================================ HOME (full flat cutaway) */
  function wallTop(p, x, y, w, h) {
    p.rect(x, y, w, h, '#7f9c9a'); p.rect(x, y, w, 1, '#c2dcd2'); p.rect(x, y, 1, h, '#9fbcb2'); p.rect(x, y + h - 1, w, 1, '#3f5862'); p.rect(x + w - 1, y, 1, h, '#4a6670');
    streaks(p, x, y, w, h, ['#8fb0aa', '#6a8a88'], Math.floor(w * h / 30), 6, 61);
  }
  function roomFace(p, x, y, w, h, c, seed) {
    const R = rp(c); p.rect(x, y, w, h, R.base); p.rect(x, y, w, 3, R.shade); p.rect(x, y + h - 6, w, 6, R.shade); p.rect(x, y + h - 6, w, 1, R.light); p.rect(x, y + h - 1, w, 1, R.deep);
    for (let i = x + 6; i < x + w; i += 12) dfill(p, i, y + 3, 1, h - 9, R.shade, 1);
    grain(p, x, y, w, h, [R.shade, R.light], 0.04, seed);
  }
  function monitorBody(p, x, y, w, h) { p.rect(x, y, w, h, '#2c2748'); p.rect(x, y, w, 1, '#6a6598'); p.rect(x, y, 1, h, '#4a4478'); p.rect(x + w - 1, y, 1, h, '#18122c'); p.rect(x + w / 2 - 2, y + h, 4, 3, '#2c2748'); p.rect(x + w / 2 - 5, y + h + 2, 10, 2, '#4a4478'); }
  reg('home', (variant) => {
    const night = variant === 'night', rr = rng(1701), p = new Z(W, H), fg = new Z(W, H);
    // ---- outside + building shell
    band(p, 0, 0, W, H, night ? '#120a28' : '#9fa0d8', night ? '#2a1a5a' : '#dccce8', 9);
    if (night) for (let i = 0; i < 40; i++) p.px(Math.floor(rr() * W), Math.floor(rr() * 80), i % 3 ? '#c7bfd8' : '#fff');
    p.rect(11, 12, 258, 468, '#120d1f', 70);
    p.rect(6, 6, 258, 466, '#7f9c9a');
    // ---- BEDROOM  x12..126
    roomFace(p, 12, 12, 114, 50, '#e6cfae', 11);
    floorPlanks(p, 12, 62, 114, 96, '#b8743f', rr, 7);
    // window frame (glass later)
    p.rect(21, 15, 32, 42, '#6a3f2c'); p.rect(22, 16, 30, 40, '#e8c9a0'); p.rect(21, 56, 34, 3, '#e8c9a0'); p.rect(21, 59, 34, 1, '#8a5a3c');
    poster(p, 55, 20, 22, 32, 'beat', '#2a1a5a', '#ff3ea5');
    p.rect(80, 22, 10, 10, '#fffaf0'); p.rect(81, 23, 8, 6, '#7fb2ff'); p.rect(92, 24, 10, 10, '#fffaf0'); p.rect(93, 25, 8, 6, '#ff8ac8');
    // desk with two monitors
    const dk = rp('#8a5a3c');
    monitorBody(p, 78, 32, 16, 20); monitorBody(p, 96, 34, 14, 18);
    p.rect(74, 38, 4, 16, '#3a3560'); p.rect(74, 38, 4, 1, '#8a87a8'); p.ellipse(76, 50, 1.5, 1.5, '#18122c');
    p.rect(76, 58, 36, 5, dk.light); p.rect(76, 58, 36, 1, dk.hi); p.rect(76, 63, 36, 1, dk.deep);
    p.rect(78, 63, 5, 24, dk.shade); p.rect(105, 63, 5, 24, dk.shade); p.rect(83, 63, 22, 6, dk.base);
    p.rect(80, 59, 22, 2, '#3a3560'); p.rect(104, 59, 4, 3, '#18122c');           // keyboard + mouse
    cup(p, 70, 63, '#fff0c9', 4, 5);
    // bookshelf
    p.rect(113, 18, 12, 44, '#5a3a3c'); p.rect(113, 18, 12, 1, '#a8704c'); for (const yy of [30, 42, 54]) p.rect(113, yy, 12, 1, '#a8704c');
    books(p, 114, 29, 3, rng(5), 9); books(p, 114, 41, 3, rng(6), 9); books(p, 114, 53, 3, rng(7), 9);
    // chair seen from behind
    p.ellipse(100, 98, 9, 11, '#2a2548'); p.rect(94, 90, 12, 18, '#2a2548'); p.rect(94, 90, 2, 18, '#4a4478'); p.rect(99, 108, 2, 8, '#4a4478'); p.line(92, 118, 108, 118, '#4a4478'); p.px(92, 119, '#18122c'); p.px(108, 119, '#18122c'); p.px(100, 121, '#18122c');
    // bed with headboard on the wall
    const wd = rp('#7a4a3c');
    p.rect(14, 54, 54, 8, wd.base); p.rect(14, 54, 54, 1, wd.light); p.rect(14, 61, 54, 1, wd.deep);
    p.rect(15, 62, 52, 58, '#efe6f7'); p.rect(15, 62, 52, 1, '#fffaf0');
    for (const px0 of [30, 52]) { p.ellipse(px0, 71, 9, 5, '#d8cce8'); p.ellipse(px0, 70, 9, 5, '#fffaf0'); p.ellipse(px0 - 2, 69, 5, 2, '#ffffff'); p.line(px0 - 4, 73, px0 + 4, 73, '#c9b8e0'); }
    const bl = rp('#2a7a86');
    p.rect(15, 80, 52, 40, bl.base); p.rect(15, 80, 52, 2, bl.light); p.rect(15, 118, 52, 2, bl.deep); p.rect(65, 80, 2, 40, bl.shade);
    for (let k = 0; k < 5; k++) { p.line(20 + k * 10, 86, 25 + k * 10, 114, bl.shade); p.line(21 + k * 10, 86, 26 + k * 10, 114, bl.light); }
    p.ellipse(40, 96, 5, 3, '#ff8a3c'); p.poly([[36, 94], [37, 89], [40, 93]], '#ff8a3c'); p.px(43, 95, '#fff0c9');      // cat/fox curled on the blanket
    p.rect(14, 120, 54, 3, wd.shade);
    // laundry basket + rug
    p.rect(16, 126, 22, 16, '#c98a5a'); p.rect(16, 126, 22, 2, '#e8b07a'); for (let k = 0; k < 4; k++) p.vline(19 + k * 5, 128, 14, '#8a5a3c'); p.ellipse(24, 125, 6, 2, '#ff6b6b'); p.ellipse(32, 126, 4, 2, '#3a5fcd');
    p.ellipse(80, 138, 28, 9, '#2a5a7a'); p.ellipse(80, 138, 25, 7.5, '#d6446f'); p.ellipse(80, 138, 18, 5, '#ffbe55'); p.ellipse(80, 138, 10, 3, '#2a7a86');
    p.rect(102, 120, 8, 4, '#ff3ea5'); p.rect(102, 120, 8, 1, '#ffb0dd');           // sneaker
    plant(p, 117, 150, 0.8, rng(8));
    // ---- VOCAL BOOTH  x132..258
    const fc = ['#3a2f5c', '#2f3a6a', '#43296f', '#3a2f5c', '#2a4a6a'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) foamPanel(p, 132 + c * 18, 12 + r * 17, 18, 17, fc[(r * 2 + c) % 5], 4);
    p.rect(132, 56, 126, 6, '#241a3c'); p.rect(132, 56, 126, 1, '#6a5fa0');
    floorPlanks(p, 132, 62, 126, 96, '#5a3a4c', rr, 7);
    p.ellipse(194, 112, 50, 30, '#1c1038'); p.ellipse(194, 112, 46, 27, '#7a2a5a'); p.ellipse(194, 112, 36, 20, '#2a3a6a'); p.ellipse(194, 112, 22, 12, '#7a2a5a');
    for (let i = -48; i <= 48; i += 4) p.px(194 + i, 112 + Math.round(Math.sqrt(Math.max(0, 1 - (i / 50) ** 2)) * 30), '#fff0c9');
    // sign: DROP BASS NOT BOMBS
    p.rect(214, 20, 40, 34, '#4a2a1c'); p.rect(215, 21, 38, 32, '#1c1030'); p.frame(214, 20, 40, 34, '#a8704c');
    txt(p, 'DROP', 219, 24, '#fffaf0'); txt(p, 'BASS', 219, 32, '#ff3ea5'); txt(p, 'NOT', 219, 40, '#fffaf0'); txt(p, 'BOMBS', 219, 47, '#ffe14d');
    // second panel art + hooks
    poster(p, 140, 22, 22, 26, 'wave', '#1f3a6a', '#2ee6ff'); poster(p, 168, 24, 20, 24, 'record', '#2a1a5a', '#ffbe55');
    // mic on a tripod stand with a pop filter
    p.line(198, 132, 190, 138, '#46405e', 2); p.line(198, 132, 208, 138, '#46405e', 2); p.line(198, 132, 198, 140, '#46405e', 2);
    p.rect(197, 90, 2, 44, '#8a87a8'); p.rect(197, 90, 1, 44, '#c7bfd8'); p.line(198, 92, 190, 84, '#8a87a8', 2);
    p.rect(186, 76, 7, 11, '#c7bfd8'); p.rect(186, 76, 2, 11, '#fff'); p.rect(192, 76, 1, 11, '#6a6788'); dfill(p, 187, 78, 5, 8, '#6a6788', 2); p.rect(185, 75, 9, 2, '#ffbe55');
    p.ring(181, 82, 9, 9, '#2c2748'); p.ring(181, 82, 8, 8, '#4a4478'); for (let i = -6; i < 7; i += 2) for (let j = -6; j < 7; j += 2) if (i * i + j * j < 45) p.px(181 + i, 82 + j, '#2a2548');
    // side table with gear, speaker, stool
    box(p, 224, 80, 30, 6, '#8a5a3c'); p.rect(226, 86, 3, 28, '#5a3a3c'); p.rect(250, 86, 3, 28, '#5a3a3c');
    p.rect(228, 70, 22, 10, '#2c2748'); p.rect(228, 70, 22, 1, '#6a6598'); for (let i = 0; i < 6; i++) p.px(231 + i * 3, 74, ['#ff3ea5', '#2ee6ff', '#9dff4a'][i % 3]);
    speaker(p, 240, 108, 14, 22, '#3a3560', rr); p.rect(142, 98, 14, 4, '#c9577f'); p.ellipse(149, 100, 8, 3, '#d6446f'); p.rect(145, 102, 2, 16, '#8a87a8'); p.rect(151, 102, 2, 16, '#8a87a8');
    cable(p, [[198, 140], [206, 148], [226, 150], [240, 134]], '#120d1f'); p.rect(142, 134, 20, 12, '#2c2748'); p.rect(142, 134, 20, 1, '#8a87a8'); p.rect(150, 138, 4, 3, '#c7bfd8');
    // ---- HALLWAY  x66..160  (face 166..216, floor continues down into the living room)
    roomFace(p, 66, 166, 94, 50, '#d9c4a0', 21);
    floorPlanks(p, 66, 216, 94, 138, '#c98a52', rr, 8);
    // front door
    p.rect(96, 170, 28, 48, '#1c1030'); p.rect(98, 172, 24, 46, '#3a2a3c'); p.rect(98, 172, 24, 1, '#6a5a6c'); p.rect(98, 172, 1, 46, '#5a4a5c');
    p.rect(101, 177, 18, 14, '#2c2030'); p.rect(101, 195, 18, 18, '#2c2030'); p.rect(116, 196, 3, 6, '#ffbe55'); p.rect(114, 180, 4, 4, '#c7bfd8'); p.px(115, 181, '#18122c'); txt(p, '4B', 106, 184, '#ffe9a8');
    // arches to the bedroom and booth (corridors through the wall)
    for (const [ax, aw] of [[68, 22], [134, 22]]) { p.rect(ax - 2, 166, aw + 4, 50, '#3a2a3c'); p.rect(ax, 160, aw, 56, ax < 100 ? '#b8743f' : '#5a3a4c'); for (let y = 164; y < 216; y += 7) p.rect(ax, y, aw, 1, ax < 100 ? '#8a5a3c' : '#3a2a3c'); p.rect(ax, 160, 1, 56, '#3a2a3c'); p.rect(ax + aw - 1, 160, 1, 56, '#3a2a3c'); }
    // coat hooks
    p.rect(126, 186, 28, 2, '#8a5a3c'); for (const [hx, hc] of [[130, '#3a5fcd'], [138, '#d6446f'], [146, '#2a2548']]) { p.px(hx, 188, '#c7bfd8'); p.poly([[hx - 3, 189], [hx + 4, 189], [hx + 5, 209], [hx - 4, 209]], hc); p.rect(hx - 3, 189, 1, 20, lighten(hc, 0.35)); }
    // runner rug, doormat, wardrobe + mirror, shoe rack, bins
    p.rect(100, 230, 26, 122, '#4a2a5a'); p.rect(101, 231, 24, 120, '#c9577f'); p.rect(104, 234, 18, 114, '#e8b070'); p.rect(106, 236, 14, 110, '#6a3a6a'); for (let y = 240; y < 344; y += 12) { p.px(113, y, '#fff0c9'); p.px(112, y + 1, '#fff0c9'); p.px(114, y + 1, '#fff0c9'); p.px(113, y + 2, '#fff0c9'); }
    p.rect(100, 222, 26, 8, '#6a4a3c'); p.rect(100, 222, 26, 1, '#a8704c'); txt(p, 'HOME', 104, 223, '#ffe14d');
    const wr = rp('#8a4a3c');
    p.rect(68, 226, 26, 70, wr.base); p.rect(68, 226, 26, 3, wr.light); p.rect(68, 226, 1, 70, wr.light); p.rect(93, 226, 1, 70, wr.shade); p.rect(66, 222, 30, 5, wr.deep);
    p.rect(71, 232, 9, 58, wr.shade); p.rect(72, 233, 7, 56, wr.base); p.rect(82, 232, 9, 58, '#241540'); mirrorGlass(p, 83, 233, 7, 56, night);
    p.rect(80, 258, 1, 6, '#ffe9a8'); p.rect(82, 258, 1, 6, '#ffe9a8'); p.rect(68, 294, 26, 2, wr.deep);
    p.rect(134, 262, 22, 4, '#6a3f3c'); p.rect(134, 262, 22, 1, '#a8704c'); sneaker(p, 136, 262, '#ff3ea5'); sneaker(p, 144, 262, '#2ee6ff', true);
    p.rect(138, 280, 14, 16, '#5a6a7a'); p.rect(138, 280, 14, 2, '#8a9aaa'); p.line(142, 280, 140, 266, '#ffbe55', 2); p.line(147, 280, 150, 262, '#c9577f', 2);
    // ---- KITCHEN  x164..258
    roomFace(p, 164, 166, 94, 50, '#f0e0c0', 31);
    for (let y = 192; y < 216; y += 6) for (let x = 164; x < 258; x += 8) { p.rect(x + ((y / 6 | 0) % 2 ? 4 : 0), y, 7, 5, '#fff8e8'); p.rect(x + ((y / 6 | 0) % 2 ? 4 : 0), y + 4, 7, 1, '#d8c8a8'); }
    for (let y = 216; y < 296; y += 8) for (let x = 164; x < 258; x += 8) p.rect(x, y, 8, 8, ((x + y) / 8 | 0) % 2 ? '#f2d7a8' : '#e0a870');
    for (let y = 216; y < 296; y += 8) p.rect(164, y, 94, 1, '#b8884a'); for (let x = 164; x < 258; x += 8) p.rect(x, 216, 1, 80, '#b8884a');
    // upper cabinets, window with plant, stove, sink, fridge
    box(p, 166, 172, 24, 16, '#c98a5a'); p.rect(177, 174, 1, 12, '#8a5a3c'); p.rect(173, 180, 2, 3, '#ffe9a8'); p.rect(179, 180, 2, 3, '#ffe9a8');
    p.rect(197, 172, 32, 24, '#3a2038'); p.rect(198, 173, 30, 22, '#e8c9a0'); p.rect(196, 195, 34, 3, '#e8c9a0');
    box(p, 164, 198, 24, 30, '#e8e4f0'); p.rect(166, 212, 20, 12, '#2c2748'); p.rect(167, 213, 18, 10, '#4a4478'); p.rect(176, 210, 2, 1, '#c7bfd8');       // stove
    p.rect(166, 194, 20, 4, '#6a6788'); for (const bx of [170, 180]) { p.ellipse(bx, 196, 3, 1.5, '#18122c'); } for (let i = 0; i < 4; i++) p.px(168 + i * 5, 200, '#ff6b6b');
    p.rect(168, 190, 14, 5, '#9fb2d8'); p.rect(168, 190, 14, 1, '#d8e4ff'); p.rect(170, 187, 10, 3, '#9fb2d8');          // pot on the stove
    box(p, 192, 198, 40, 30, '#c98a5a'); p.rect(192, 194, 40, 5, '#e8c98a'); p.rect(192, 194, 40, 1, '#fff0c9'); for (let k = 0; k < 2; k++) { p.rect(196 + k * 18, 204, 16, 20, '#8a5a3c'); p.rect(197 + k * 18, 205, 14, 18, '#c98a5a'); p.rect(203 + k * 18, 207, 3, 2, '#ffe9a8'); }
    p.rect(204, 191, 16, 4, '#9fb2d8'); p.rect(210, 185, 2, 6, '#c7bfd8'); p.rect(210, 185, 5, 1, '#c7bfd8');                   // sink + tap
    fruit(p, 222, 191, 3, '#ff4f6e'); fruit(p, 226, 192, 3, '#ff9a4a'); cup(p, 190, 194, '#2ee6ff', 4, 6);
    const fr = rp('#9fe8d0');
    p.rect(236, 170, 20, 62, fr.base); p.rect(236, 170, 20, 2, fr.light); p.rect(236, 170, 2, 62, fr.light); p.rect(254, 170, 2, 62, fr.shade); p.rect(236, 230, 20, 2, fr.deep); p.rect(236, 196, 20, 2, fr.deep);
    p.rect(250, 178, 2, 14, '#c7bfd8'); p.rect(250, 202, 2, 20, '#c7bfd8'); p.rect(240, 180, 4, 4, '#ff3ea5'); p.rect(242, 204, 4, 4, '#ffe14d'); p.rect(240, 212, 6, 7, '#fffaf0');
    // table with bowls and fruit, two stools, plant, bin
    p.ellipse(212, 266, 21, 8, '#5a3a2a'); p.ellipse(212, 264, 21, 8, '#a8704c'); p.ellipse(210, 263, 15, 5, '#c98a5a'); p.rect(206, 270, 3, 18, '#5a3a2a'); p.rect(216, 270, 3, 18, '#5a3a2a');
    p.ellipse(200, 263, 5, 2.5, '#fffaf0'); p.ellipse(200, 262, 3.5, 1.5, '#9dff4a'); p.ellipse(214, 263, 6, 3, '#d6446f'); fruit(p, 211, 260, 2.5, '#ff9a4a'); fruit(p, 215, 260, 2.5, '#ff4f6e'); fruit(p, 218, 261, 2, '#9dff4a'); cup(p, 224, 264, '#ffe14d', 4, 6); cup(p, 205, 267, '#ff3ea5', 4, 4);
    for (const sx of [190, 236]) { p.ellipse(sx, 270, 6, 2.5, '#5a3a3c'); p.ellipse(sx, 268, 6, 2.5, '#d6446f'); p.rect(sx - 1, 270, 2, 12, '#5a3a3c'); }
    plant(p, 250, 292, 0.8, rng(9)); p.rect(166, 280, 14, 14, '#8a9aaa'); p.rect(166, 280, 14, 2, '#c7d8e8'); p.rect(168, 284, 10, 1, '#5a6a7a');
    // ---- LIVING ROOM (left nook, hall column, couch wall) y304..466
    roomFace(p, 12, 304, 54, 50, '#d6b890', 41); roomFace(p, 160, 304, 98, 50, '#d6b890', 42);
    floorPlanks(p, 12, 354, 246, 112, '#b8743f', rr, 8); floorPlanks(p, 12, 330, 54, 24, '#b8743f', rr, 8); floorPlanks(p, 160, 330, 98, 24, '#b8743f', rr, 8);
    p.rect(66, 296, 94, 58, '#b8743f'); floorPlanks(p, 66, 296, 94, 58, '#c98a52', rr, 8);
    p.rect(100, 296, 26, 58, '#4a2a5a'); p.rect(101, 296, 24, 58, '#c9577f'); p.rect(104, 296, 18, 58, '#e8b070'); p.rect(106, 296, 14, 58, '#6a3a6a'); for (let y = 300; y < 352; y += 12) { p.px(113, y, '#fff0c9'); p.px(112, y + 1, '#fff0c9'); p.px(114, y + 1, '#fff0c9'); p.px(113, y + 2, '#fff0c9'); }
    // TV and stand
    p.rect(14, 340, 46, 34, '#5a3a2a'); p.rect(14, 340, 46, 2, '#a8704c'); p.rect(14, 372, 46, 2, '#3a2038'); p.rect(18, 346, 18, 22, '#3a2038'); p.rect(40, 346, 16, 10, '#2c2748');
    p.rect(20, 312, 36, 28, '#18122c'); p.rect(20, 312, 36, 1, '#6a6598'); p.rect(20, 340, 36, 2, '#2c2748'); p.rect(34, 342, 8, 2, '#46405e');
    speaker(p, 14, 382, 14, 26, '#2c2748', rr); p.rect(34, 392, 18, 8, '#3a3560'); p.rect(34, 392, 18, 1, '#8a87a8'); cable(p, [[36, 372], [40, 392], [30, 410]], '#120d1f');
    p.rect(16, 418, 8, 8, '#d6446f'); p.ellipse(32, 426, 6, 3, '#3a5fcd');
    // couch against the wall, poster, lamp
    poster(p, 196, 308, 26, 32, 'face', '#9a6a3c', '#2a1a5a'); poster(p, 166, 312, 20, 24, 'record', '#3a2a6a', '#b4804c');
    const cu = rp('#b4604a');
    p.rect(168, 322, 80, 26, cu.shade); p.rect(168, 322, 80, 2, cu.light); p.rect(172, 326, 72, 20, cu.base); for (let k = 0; k < 3; k++) { p.rect(173 + k * 24, 326, 22, 18, cu.base); p.rect(173 + k * 24, 326, 22, 1, cu.light); p.rect(194 + k * 24, 326, 1, 18, cu.deep); }
    p.rect(166, 332, 10, 34, cu.base); p.rect(166, 332, 10, 2, cu.light); p.rect(240, 332, 10, 34, cu.base); p.rect(240, 332, 10, 2, cu.light);
    p.rect(176, 346, 64, 18, cu.base); p.rect(176, 346, 64, 2, cu.light); p.rect(176, 362, 64, 2, cu.deep); for (let k = 0; k < 2; k++) p.rect(207 + k * 0, 346, 1, 16, cu.deep);
    p.rect(168, 364, 4, 4, '#3a2038'); p.rect(244, 364, 4, 4, '#3a2038');
    p.poly([[182, 326], [198, 324], [200, 340], [184, 342]], '#2a7a86'); p.poly([[222, 332], [236, 330], [236, 344], [222, 344]], '#ffbe55'); dfill(p, 222, 332, 14, 12, '#fff0c9', 1);
    p.rect(250, 316, 2, 76, '#46405e'); p.rect(246, 388, 10, 3, '#2c2748'); p.line(251, 316, 244, 308, '#46405e', 2); p.poly([[236, 308], [250, 308], [246, 300], [240, 300]], '#ffe9a8');
    // big rug, coffee table with clutter, plant
    p.ellipse(130, 422, 70, 22, '#2a1a5a'); p.ellipse(130, 422, 66, 20, '#8a2a4a'); p.ellipse(130, 422, 56, 16, '#d6a050'); p.ellipse(130, 422, 44, 12, '#2a5a7a'); p.ellipse(130, 422, 30, 8, '#8a2a4a');
    for (let i = -66; i <= 66; i += 3) p.px(130 + i, 422 + Math.round(Math.sqrt(Math.max(0, 1 - (i / 70) ** 2)) * 22), '#fff0c9');
    const ct = rp('#7a4a2c');
    p.rect(104, 408, 56, 4, ct.hi); p.rect(104, 412, 56, 12, ct.base); p.rect(104, 412, 56, 1, ct.light); p.rect(106, 424, 4, 6, ct.deep); p.rect(154, 424, 4, 6, ct.deep);
    cup(p, 112, 408, '#2ee6ff', 4, 6); cup(p, 122, 409, '#ff9a4a', 4, 5); p.rect(130, 405, 14, 3, '#fffaf0'); p.rect(131, 404, 12, 1, '#ff3ea5'); p.rect(148, 405, 8, 3, '#2c2748'); p.px(150, 405, '#ff3ea5'); fruit(p, 140, 406, 2.5, '#ff4f6e');
    plant(p, 240, 458, 1.4, rng(12));
    p.rect(22, 436, 28, 18, '#6a3f3c'); p.rect(22, 436, 28, 2, '#a8704c'); p.rect(24, 438, 24, 14, '#2a2548'); for (let i = 0; i < 6; i++) p.rect(26 + i * 3.5, 440, 3, 12, ['#ff3ea5', '#2ee6ff', '#ffe14d', '#a86bff', '#ff6b6b', '#9dff4a'][i]);   // vinyl crate
    p.ellipse(86, 448, 8, 3, '#d6446f'); p.ellipse(190, 446, 6, 2.5, '#3a5fcd');           // cushions on the floor
    // walls (tops) over everything, with doorway notches
    for (const [x, y, w, h] of [[6, 6, 258, 6], [6, 466, 258, 6], [6, 6, 6, 466], [258, 6, 6, 466], [126, 12, 6, 148], [6, 158, 258, 8], [62, 166, 4, 134], [160, 166, 4, 134], [6, 296, 60, 8], [160, 296, 104, 8], [62, 296, 4, 34], [160, 296, 4, 34]]) wallTop(p, x, y, w, h);
    // doorway notches in the wall tops
    for (const [ax, aw] of [[68, 22], [134, 22]]) { p.rect(ax, 158, aw, 8, ax < 100 ? '#b8743f' : '#5a3a4c'); }
    p.rect(160, 238, 4, 38, '#c98a52');
    // exterior void left of the hallway: roof texture + AC unit
    p.rect(12, 166, 50, 130, night ? '#1a1530' : '#8a8aa8'); for (let y = 166; y < 296; y += 6) p.rect(12, y, 50, 1, night ? '#241c40' : '#7a7a98'); grain(p, 12, 166, 50, 130, ['#6a6a88', '#a0a0c0'], 0.05, 77);
    box(p, 18, 230, 30, 22, '#9fb2d8'); p.rect(22, 234, 22, 14, '#46405e'); for (let i = 0; i < 5; i++) p.rect(23, 236 + i * 2.5, 20, 1, '#8a87a8'); p.ellipse(33, 241, 6, 6, '#2c2748'); p.line(33, 235, 33, 247, '#8a87a8'); p.line(27, 241, 39, 241, '#8a87a8');
    p.line(48, 252, 60, 288, '#6a6788', 2); p.rect(14, 190, 20, 3, '#6a6788'); for (let i = 0; i < 6; i++) p.px(16 + i * 3, 187, '#3f9b5a');
    // ---- details
    { const rd = rng(222);
      grain(p, 12, 62, 114, 96, ['#e8b07a', '#7a4a2c'], 0.01, 71);
      addDust(p, 20, 20, 100, 130, 24, 31); addDust(p, 140, 70, 110, 80, 18, 32); addDust(p, 70, 220, 80, 120, 18, 33);
    }
    vignette(p, 6, 6, 258, 466, 0.7);
    // ======= grade + emissive
    if (night) p.tint('#6a5fb0', 0.9);
    // bedroom window and kitchen window glass
    citySky(p, 23, 17, 28, 36, night, rng(1701), [{ c: '#ff3ea5' }]);
    p.rect(36, 17, 2, 36, night ? '#9a8ab0' : '#e8c9a0'); p.rect(23, 33, 28, 2, night ? '#9a8ab0' : '#e8c9a0');
    venetian(p, 23, 17, 28, 10, night ? '#6a5f9a' : '#d8c8e8');
    citySky(p, 198, 173, 30, 20, night, rng(9), null); p.rect(212, 173, 2, 20, night ? '#9a8ab0' : '#e8c9a0');
    plant(p, 207, 196, 0.45, rng(6));
    // screens
    p.rect(80, 34, 12, 16, '#15102b'); p.rect(98, 36, 10, 14, '#15102b');
    for (let i = 0; i < 4; i++) { p.rect(81, 36 + i * 3.5, 5 + (i * 3) % 6, 2, ['#ff3ea5', '#2ee6ff', '#9dff4a', '#ffe14d'][i]); }
    for (let i = 0; i < 5; i++) p.rect(99 + i * 1.6, 48 - (i * 5) % 9 - 2, 1, (i * 5) % 9 + 2, i % 2 ? '#2ee6ff' : '#ff3ea5');
    p.rect(22, 316, 32, 20, '#15102b'); p.rect(24, 318, 28, 16, night ? '#2a4a8a' : '#2a3a6a'); dfill(p, 24, 318, 28, 7, '#6a8aff', 2); p.rect(40, 326, 8, 6, '#ff9a4a');                // TV
    const bulbs = stringLights(p, 134, 18, 256, 18, 7, ['#ffbe55', '#ff3ea5', '#2ee6ff', '#9dff4a'], 10, rr);
    paintBulbs(p, bulbs, true);
    p.poly([[236, 308], [250, 308], [246, 300], [240, 300]], '#fff0c9');
    if (night) {
      glow(p, 92, 46, 40, '#8a6bff', 0.7, 28); glow(p, 38, 36, 40, '#6a7aff', 0.4, 36); glow(p, 38, 328, 44, '#4a7aff', 0.8, 34); glow(p, 243, 306, 48, '#ffbe55', 0.9, 40);
      glow(p, 194, 44, 54, '#ffbe55', 0.6, 30); glow(p, 212, 182, 30, '#6a7aff', 0.4, 20); glow(p, 110, 270, 40, '#ffbe55', 0.35, 34); glow(p, 130, 420, 60, '#ffbe55', 0.3, 20);
      glow(p, 192, 104, 40, '#ffbe55', 0.35, 20);
    } else {
      beam(p, 30, 54, 14, 56, 150, 22, '#ffbe55', 0.8); beam(p, 44, 54, 10, 80, 150, 18, '#ffbe55', 0.6);
      glow(p, 38, 38, 44, '#ffbe55', 0.6, 38); glow(p, 212, 184, 40, '#ffbe55', 0.5, 26); glow(p, 38, 328, 30, '#6a8aff', 0.35, 24);
      beam(p, 206, 196, 16, 190, 290, 30, '#ffbe55', 0.5);
      glow(p, 110, 190, 30, '#ffbe55', 0.3, 20);
    }
    // front lip of the building (fg): bottom wall hides feet that wander off
    wallTop(fg, 6, 462, 258, 10); fg.rect(6, 472, 258, 1, '#120d1f', 80);
    if (night) fg.tint('#6a5fb0', 0.9);
    const sp = { stand: [116, 258], bed: [46, 148], desk: [102, 124], booth: [176, 130], kitchen: [198, 244], couch: [208, 372], wardrobe: [102, 286], foxy: [222, 270] };
    const spots = {}; for (const k in sp) spots[k] = { x: sp[k][0], y: sp[k][1] };
    const nodes = Object.assign({}, spots, {
      door: { x: 110, y: 228 }, hubH: { x: 116, y: 242 }, hubM: { x: 112, y: 306 }, hubL: { x: 112, y: 372 },
      archBedHall: { x: 79, y: 222 }, archBedRoom: { x: 79, y: 152 }, bedHub: { x: 80, y: 136 },
      archBoothHall: { x: 145, y: 222 }, archBoothRoom: { x: 145, y: 152 }, boothHub: { x: 158, y: 132 },
      kitDoorHall: { x: 150, y: 256 }, kitDoorKit: { x: 172, y: 256 }, kitHub: { x: 196, y: 250 },
    });
    const edges = [['stand', 'hubH'], ['hubH', 'door'], ['hubH', 'wardrobe'], ['hubH', 'archBedHall'], ['archBedHall', 'archBedRoom'], ['archBedRoom', 'bedHub'], ['bedHub', 'bed'], ['bedHub', 'desk'],
      ['hubH', 'archBoothHall'], ['archBoothHall', 'archBoothRoom'], ['archBoothRoom', 'boothHub'], ['boothHub', 'booth'], ['hubH', 'kitDoorHall'], ['kitDoorHall', 'kitDoorKit'], ['kitDoorKit', 'kitHub'],
      ['kitHub', 'kitchen'], ['kitHub', 'foxy'], ['hubH', 'hubM'], ['hubM', 'hubL'], ['hubL', 'couch']];
    const sc2 = scene('home', variant, p, {
      fg, floorY: 258,
      spots,
      hotspots: [
        { id: 'bed', label: 'Bed', x: 12, y: 54, w: 60, h: 100 },
        { id: 'desk', label: 'Desk', x: 70, y: 28, w: 46, h: 96 },
        { id: 'booth', label: 'Vocal booth', x: 150, y: 66, w: 80, h: 80 },
        { id: 'kitchen', label: 'Kitchen', x: 164, y: 166, w: 94, h: 130 },
        { id: 'couch', label: 'Couch', x: 164, y: 306, w: 92, h: 66 },
        { id: 'wardrobe', label: 'Wardrobe', x: 66, y: 222, w: 30, h: 76 },
        { id: 'door', label: 'Door', x: 94, y: 168, w: 32, h: 52 },
      ],
      lights: [
        { x: 92, y: 46, r: 46, color: '#a86bff', a: 0.5, flicker: 0.06, kind: 'screen' },
        { x: 38, y: 36, r: 56, color: night ? '#6a7aff' : '#ffbe55', a: night ? 0.35 : 0.5, flicker: 0, kind: 'window' },
        { x: 194, y: 28, r: 70, color: '#ffbe55', a: 0.5, flicker: 0.1, kind: 'lamp' },
        { x: 212, y: 182, r: 36, color: night ? '#6a7aff' : '#ffbe55', a: 0.35, flicker: 0, kind: 'window' },
        { x: 38, y: 328, r: 50, color: '#4a7aff', a: 0.6, flicker: 0.12, kind: 'screen' },
        { x: 243, y: 306, r: 56, color: '#ffbe55', a: 0.6, flicker: 0.02, kind: 'lamp' },
        { x: 110, y: 190, r: 40, color: '#ffbe55', a: 0.3, flicker: 0.02, kind: 'lamp' },
      ],
      anim: [{ kind: 'steam', x: 176, y: 188 }, { kind: 'tv_flicker', x: 38, y: 328 }, { kind: 'neon_flicker', x: 194, y: 20 }],
    });
    const S = (v) => Math.round(v * K); sc2.nav = { nodes: {}, edges };
    for (const k in nodes) sc2.nav.nodes[k] = { x: S(nodes[k].x), y: S(nodes[k].y) };
    return sc2;
  });

  /* ================================================================ SHOP */
  function perspFloor(p, y0, y1, base, rr, vx) {
    const R = rp(base); p.rect(0, y0, W, y1 - y0, R.base); let y = y0, hh = 7, row = 0;
    while (y < y1) {
      p.rect(0, y, W, 1, R.shade);
      const step = 18 + hh * 2;
      for (let x = ((row % 2) * step / 2 + Math.floor(rr() * 8)) % step - step; x < W; x += step) p.rect(x, y, 1, hh, R.shade);
      for (let k = 0; k < 4; k++) p.hline(Math.floor(rr() * W), y + 1 + Math.floor(rr() * (hh - 2)), 4 + Math.floor(rr() * 8), R.light);
      y += hh; hh += 1; row++;
    }
    p.rect(0, y0, W, 2, R.deep);
    streaks(p, 0, y0, W, y1 - y0, [R.light, R.shade], Math.floor(W * (y1 - y0) / 40), 10, 23); grain(p, 0, y0, W, y1 - y0, [R.hi, R.deep], 0.006, 24);
  }
  function mannequinHead(p, x, y, c) {
    p.rect(x - 1, y + 9, 3, 6, '#8a87a8'); p.rect(x - 4, y + 14, 9, 2, '#8a87a8');
    p.ellipse(x, y + 4, 4, 5, '#e6b79a'); p.poly([[x - 5, y + 2], [x + 5, y + 2], [x + 6, y + 12], [x + 3, y + 10], [x - 3, y + 10], [x - 6, y + 12]], c); p.ellipse(x, y + 1, 5, 3, c); p.px(x - 2, y + 5, '#2a1a3c'); p.px(x + 2, y + 5, '#2a1a3c'); p.px(x, y + 8, '#c9577f');
  }
  reg('shop', (variant) => {
    const night = variant === 'night', rr = rng(2202), p = new Z(W, H), fg = new Z(W, H);
    // wall: teal wallpaper with a brick wainscot
    p.fill('#2a2a52'); p.rect(0, 0, W, 300, night ? '#4a4890' : '#5a58a8');
    for (let x = 0; x < W; x += 16) { p.rect(x, 0, 8, 300, night ? '#524f9a' : '#6664b6'); }
    for (let y = 6; y < 270; y += 12) for (let x = (y % 24 ? 4 : 12); x < W; x += 16) p.px(x, y, '#8a86d0');
    // brick wainscot lower wall
    p.rect(0, 232, W, 70, '#8a3f3f');
    for (let y = 232, r = 0; y < 300; y += 7, r++) { p.rect(0, y, W, 1, '#5b2a35'); for (let x = (r % 2) * 9; x < W; x += 18) p.rect(x, y, 1, 7, '#5b2a35'); for (let k = 0; k < 8; k++) p.rect(Math.floor(rr() * W), y + 1 + Math.floor(rr() * 5), 6, 1, '#b4604a'); }
    p.rect(0, 230, W, 3, '#2a1a3c'); p.rect(0, 230, W, 1, '#8a5a6c');
    grain(p, 0, 12, W, 218, ['#4a4890', '#7a76c8', '#3a3878', '#6664b6'], 0.03, 3);
    for (let y = 14; y < 228; y += 16) for (let x = ((y / 16 | 0) % 2 ? 10 : 2); x < W; x += 16) { p.px(x - 1, y, '#7a76c8'); p.px(x + 1, y, '#7a76c8'); p.px(x, y - 1, '#7a76c8'); p.px(x, y + 1, '#7a76c8'); }
    streaks(p, 0, 232, W, 68, ['#b4604a', '#7a3438', '#c97a5a'], 90, 7, 4);
    perspFloor(p, 300, H, '#a8683f', rr);
    // ceiling beam + pendant lamps
    p.rect(0, 0, W, 12, '#2a1a3c'); p.rect(0, 10, W, 2, '#4a2a4c'); p.rect(0, 0, W, 1, '#6a4a6c');
    for (const lx of [92, 206]) { p.vline(lx, 12, 24, '#18122c'); p.poly([[lx - 9, 44], [lx + 9, 44], [lx + 4, 34], [lx - 4, 34]], '#d6446f'); p.rect(lx - 9, 43, 18, 2, '#8a2a50'); p.rect(lx - 4, 34, 3, 9, '#ff8aa8'); }
    // ---- shop window (left)
    p.rect(24, 52, 118, 70, '#3a2038'); p.rect(26, 54, 114, 66, '#e8c9a0'); p.rect(27, 55, 112, 64, '#b4804c');
    // glass is painted after the grade
    // shelf with boxes + mannequin head above the rack
    p.rect(54, 176, 96, 4, '#6a3f3c'); p.rect(54, 176, 96, 1, '#a8704c');
    const sh = ['#ff3ea5', '#2ee6ff', '#ffbe55', '#9dff4a', '#a86bff'];
    for (let i = 0; i < 6; i++) { p.rect(58 + i * 14, 160, 12, 16, '#3a3560'); p.rect(58 + i * 14, 160, 12, 2, '#6a6598'); p.rect(60 + i * 14, 166, 8, 3, sh[i % 5]); }
    mannequinHead(p, 112, 144, '#ff3ea5'); mannequinHead(p, 136, 144, '#2ee6ff');
    // ---- hat wall (pegboard)
    p.rect(156, 28, 108, 130, '#2c2748'); p.rect(156, 28, 108, 2, '#6a6598'); p.rect(156, 28, 2, 130, '#4a4478'); p.rect(262, 28, 2, 130, '#18122c');
    for (let y = 36; y < 156; y += 5) for (let x = 162; x < 262; x += 5) p.px(x, y, '#18122c');
    const hats = [['cap', '#ff3ea5'], ['fedora', '#8a5a3c'], ['beanie', '#2ee6ff'], ['bucket', '#9dff4a'], ['cap', '#ffe14d'], ['beanie', '#a86bff'], ['fedora', '#2a1a5a'], ['cap', '#ff6b6b'], ['bucket', '#ffbe55'], ['beanie', '#ff3ea5'], ['cap', '#3a5fcd'], ['fedora', '#c9577f']];
    hats.forEach(([k, c], i) => { const cx = 176 + (i % 4) * 26, cy = 56 + Math.floor(i / 4) * 38; hat(p, cx, cy, k, c); p.rect(cx - 9, cy + 1, 18, 2, '#8a5a3c'); p.rect(cx - 9, cy + 1, 18, 1, '#c98a5a'); p.px(cx + 4, cy + 5, '#fff0c9'); p.rect(cx + 3, cy + 5, 6, 3, '#fff0c9'); p.px(cx + 4, cy + 6, '#d6446f'); });
    // sunglasses display case on the wall
    p.rect(156, 166, 108, 40, '#3a2038'); p.rect(158, 168, 104, 36, '#241a3c');
    for (let i = 0; i < 4; i++) { const sx = 164 + i * 25; p.rect(sx - 2, 186, 24, 1, '#6a5f9a'); shades(p, sx, 172, ['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a'][i], 11); shades(p, sx + 2, 191, ['#a86bff', '#ff6b6b', '#fff0c9', '#3a5fcd'][i], 11); }
    p.rect(158, 168, 104, 1, '#8a87a8'); p.rect(158, 204, 104, 1, '#4a4478');
    // price tags
    for (const [tx, ty] of [[160, 150], [236, 152], [186, 108]]) { p.rect(tx, ty, 8, 5, '#fff0c9'); txt(p, '$', tx + 2, ty - 1, '#d6446f'); }
    // ---- clothing rack
    p.rect(58, 206, 92, 3, '#c7bfd8'); p.rect(58, 206, 92, 1, '#fff'); p.rect(56, 206, 3, 112, '#8a87a8'); p.rect(149, 206, 3, 112, '#8a87a8'); p.rect(56, 206, 1, 112, '#c7bfd8');
    p.rect(50, 316, 16, 3, '#6a6788'); p.rect(141, 316, 16, 3, '#6a6788');
    const kinds = ['dress', 'tee', 'coat', 'tee', 'dress', 'coat', 'tee', 'dress', 'coat'], cols = ['#ff3ea5', '#2ee6ff', '#ffbe55', '#9dff4a', '#a86bff', '#ff6b6b', '#ffe14d', '#3a5fcd', '#c9577f', '#4fbf6f'];
    for (let i = 0; i < 9; i++) garment(p, 66 + i * 9, 209, kinds[i], cols[(i * 3) % 10], 24 + (i % 3) * 5);
    // lower shelf crate with folded stack
    p.rect(60, 296, 86, 20, '#5a3a3c'); p.rect(60, 296, 86, 2, '#a8704c'); for (let i = 0; i < 4; i++) { p.rect(64 + i * 20, 286 + (i % 2) * 2, 18, 10 - (i % 2) * 2, cols[(i * 2 + 1) % 10]); p.rect(64 + i * 20, 286 + (i % 2) * 2, 18, 1, '#fff0c9'); }
    // sale sign hanging from the rack
    p.rect(88, 240, 22, 12, '#ffe14d'); p.rect(88, 240, 22, 1, '#fff'); txt(p, 'SALE', 90, 243, '#d6446f'); p.vline(92, 234, 6, '#18122c'); p.vline(106, 234, 6, '#18122c');
    // ---- standing mirror (left)
    const mf = rp('#c98a5a');
    p.rect(6, 150, 44, 168, mf.shade); p.rect(8, 152, 40, 164, mf.base); p.rect(8, 152, 40, 1, mf.hi); p.rect(8, 152, 1, 164, mf.light);
    p.rect(12, 156, 32, 156, '#2a1a3c');
    mirrorGlass(p, 13, 157, 30, 154, night);
    p.rect(14, 316, 4, 4, mf.deep); p.rect(38, 316, 4, 4, mf.deep); p.rect(16, 312, 24, 3, mf.deep);
    // reflection hints: a hat on a rack and a lamp
    p.ellipse(30, 190, 6, 5, '#d6446f'); p.rect(24, 194, 12, 2, '#8a2a50');
    // clothes bin in front
    p.rect(14, 392, 70, 28, '#7a4a3c'); p.rect(14, 392, 70, 3, '#c98a5a'); p.rect(14, 392, 2, 28, '#c98a5a'); p.rect(82, 392, 2, 28, '#4a2a2c'); p.rect(14, 419, 70, 2, '#3a2038');
    for (let i = 0; i < 7; i++) { p.ellipse(22 + i * 9, 391, 5, 3, cols[(i * 3 + 2) % 10]); p.px(20 + i * 9, 389, '#fff0c9'); }
    p.rect(30, 400, 40, 6, '#ffe14d'); txt(p, 'ALL $5', 33, 399, '#d6446f');
    // floor mats, shoes
    p.ellipse(120, 452, 54, 9, '#2a1a5a'); p.ellipse(120, 452, 50, 7, '#c9577f'); p.ellipse(120, 452, 40, 5, '#ffbe55'); p.ellipse(120, 452, 28, 3, '#2a1a5a');
    p.rect(88, 330, 10, 4, '#ff3ea5'); p.rect(100, 331, 10, 3, '#2ee6ff');
    p.rect(228, 410, 20, 8, '#8a5a3c'); p.rect(228, 410, 20, 2, '#c98a5a'); p.rect(232, 404, 12, 6, '#ff6b6b');

    // ---- counter (foreground so the clerk stands behind it)
    const co = rp('#a8683f');
    fg.rect(142, 330, 128, 6, co.hi); fg.rect(142, 330, 128, 1, '#fff0c9'); fg.rect(142, 336, 128, 62, co.base);
    for (let k = 0; k < 4; k++) { const bx = 148 + k * 30; fg.rect(bx, 342, 26, 50, co.shade); fg.rect(bx + 1, 343, 24, 48, co.base); fg.rect(bx + 1, 343, 24, 1, co.light); fg.rect(bx + 1, 390, 24, 1, co.deep); }
    fg.rect(142, 396, 128, 4, co.deep); fg.rect(142, 336, 2, 60, co.light);
    fg.rect(142, 400, 128, 3, '#241a3c', 90);
    // things on the counter (also fg)
    // register
    fg.rect(222, 316, 34, 14, '#46405e'); fg.rect(222, 316, 34, 1, '#8a87a8'); fg.rect(226, 304, 18, 12, '#2a2548'); fg.rect(228, 306, 14, 8, '#9dff4a'); txt(fg, '9.5', 229, 307, '#1a3a1a');
    for (let i = 0; i < 6; i++) fg.rect(226 + i * 5, 320, 3, 2, ['#ff3ea5', '#2ee6ff', '#ffe14d'][i % 3]);
    fg.rect(222, 328, 34, 2, '#241a3c');
    fg.rect(249, 300, 5, 9, '#fffaf0'); fg.px(250, 302, '#8a87a8'); fg.px(251, 304, '#8a87a8'); fg.rect(144, 322, 5, 8, '#c98a5a'); fg.rect(144, 322, 5, 1, '#e8b07a');
    streaks(fg, 142, 336, 128, 62, ['#c4885a', '#8a5a3c'], 24, 9, 31);
    fg.rect(150, 318, 10, 12, '#fff0c9'); fg.rect(150, 318, 10, 2, '#ffbe55'); fg.rect(152, 322, 6, 2, '#d6446f');             // paper bag
    fg.rect(166, 326, 10, 4, '#c7bfd8'); fg.rect(169, 322, 4, 4, '#ffd23f'); fg.rect(170, 322, 2, 1, '#fff');                   // bell
    fg.rect(184, 312, 30, 18, '#3a5fcd'); fg.rect(184, 312, 30, 2, '#7a9aff'); fg.rect(184, 320, 30, 1, '#2c4aa0'); fg.rect(188, 306, 22, 6, '#ff6b6b'); fg.rect(188, 306, 22, 1, '#ffa09a');   // folded stack
    // shop sign + string of little flags above counter hang in the bg
    const fairy = stringLights(p, 158, 22, 262, 22, 7, ['#ffbe55', '#ff3ea5', '#2ee6ff'], 9, rr);
    for (let i = 0; i < 16; i++) { const fx = 146 + i * 8, fy = 218 + Math.round(Math.sin(i / 15 * Math.PI) * 6); p.poly([[fx, fy], [fx + 6, fy], [fx + 3, fy + 6]], cols[(i * 2) % 10]); }
    p.line(146, 217, 270, 217, '#18122c'); 
    // ---- detail pass
    { const rd = rng(33);
      p.rect(58, 358, 84, 4, '#5a3a3c'); p.rect(58, 358, 84, 1, '#a8704c'); sneaker(p, 62, 358, '#ff3ea5'); sneaker(p, 80, 358, '#2ee6ff', true); sneaker(p, 100, 358, '#ffe14d'); sneaker(p, 120, 358, '#9dff4a', true);
      for (let i = 0; i < 9; i++) { p.px(66 + i * 9 + 3, 214 + (i % 2) * 3, '#fffaf0'); if (i % 3 === 0) dfill(p, 66 + i * 9 - 4, 212, 8, 18, '#fff0c9', 1); }
      for (let i = 0; i < 9; i++) p.px(66 + i * 9, 209, '#ffffff');
      // hat wall details: pegs and tags
      for (let k = 0; k < 12; k++) { const cx = 176 + (k % 4) * 26, cy = 56 + Math.floor(k / 4) * 38; p.px(cx - 8, cy - 2, '#8a87a8'); p.px(cx + 8, cy - 2, '#8a87a8'); }
      // shades case reflections
      for (let i = 0; i < 4; i++) p.line(166 + i * 26, 204, 176 + i * 26, 170, '#6a6598');
      // mirror frame detail
      p.vline(8, 154, 160, '#e8b07a'); p.px(26, 154, '#fff0c9'); p.px(30, 154, '#fff0c9');
      // floor plant + umbrella stand by the mirror
      p.rect(2, 392, 14, 26, '#5a3a3c'); p.rect(2, 392, 14, 2, '#c98a5a'); p.line(6, 390, 4, 360, '#2ee6ff', 2); p.line(11, 390, 12, 352, '#ff3ea5', 2);
      addDust(p, 40, 80, 100, 220, 30, 17);
    }
    // ---- vignette
    vignette(p, 0, 12, W, 300, 0.7);
    vignette(p, 0, 300, W, 180, 0.8);

    // ======= grade + emissive
    if (night) p.tint('#7b6fc6', 0.9);
    // window glass
    const mull = night ? '#9a8ab0' : '#e8c9a0';
    citySky(p, 28, 56, 110, 62, night, rng(77), [{ c: '#ff3ea5' }]);
    // street shopfront glimpse
    p.rect(28, 100, 110, 18, night ? '#2a2552' : '#6a3b6f'); dfill(p, 28, 100, 110, 3, night ? '#3a3572' : '#8a5a8f', 2);
    p.rect(82, 56, 3, 62, mull); p.rect(28, 86, 110, 2, mull);
    p.rect(28, 56, 110, 1, night ? '#c7bfd8' : '#fff0c9');
    // glass glint
    for (let i = 0; i < 3; i++) { p.line(40 + i * 40, 118, 52 + i * 40, 90, '#fff0c9'); }
    if (night) { glow(p, 83, 85, 60, '#ff3ea5', 0.5, 42); } else { glow(p, 83, 80, 70, '#ffbe55', 0.65, 50); beam(p, 70, 120, 24, 70, 300, 60, '#ffbe55', 0.55); beam(p, 110, 120, 20, 150, 300, 56, '#ffbe55', 0.45); }
    // hanging neon OPEN (backwards-readable in the window, drawn upright for the game)
    p.line(60, 52, 60, 66, '#18122c'); p.line(106, 52, 106, 66, '#18122c');
    p.rect(54, 66, 58, 22, night ? '#2a1a3c' : '#43296f'); p.rect(55, 67, 56, 20, '#1a1033');
    if (night) { neon(p, 'OPEN', 83, 77, '#ff3ea5', 2); p.rect(55, 67, 56, 1, '#ff3ea5'); p.rect(55, 86, 56, 1, '#ff3ea5'); }
    else { txt(p, 'OPEN', 83 - tw('OPEN', 2) / 2, 70, '#a8456f', { scale: 2 }); p.rect(55, 67, 56, 1, '#8a3a6a'); p.rect(55, 86, 56, 1, '#8a3a6a'); }
    paintBulbs(p, fairy, true);
    // pendant lamp glows
    for (const lx of [92, 206]) { p.rect(lx - 4, 34, 8, 3, '#fff0c9'); glow(p, lx, 46, night ? 54 : 34, '#ffbe55', night ? 1 : 0.6, night ? 50 : 30); }
    if (night) { glow(p, 210, 100, 70, '#ffbe55', 0.4, 60); glow(p, 100, 220, 70, '#ffbe55', 0.3, 40); }
    if (night) { fg.tint('#7b6fc6', 0.9); fg.rect(228, 306, 14, 8, '#9dff4a'); txt(fg, '9.5', 229, 307, '#1a3a1a'); }
    return scene('shop', variant, p, {
      fg, floorY: 440,
      spots: { stand: { x: 112, y: 440 }, clerk: { x: 212, y: 342 } },
      hotspots: [
        { id: 'hats', label: 'Hats', x: 154, y: 26, w: 112, h: 182 },
        { id: 'racks', label: 'Racks', x: 48, y: 196, w: 108, h: 126 },
        { id: 'counter', label: 'Counter', x: 142, y: 300, w: 128, h: 102 },
        { id: 'mirror', label: 'Mirror', x: 4, y: 148, w: 48, h: 174 },
        { id: 'door', label: 'Door', x: 4, y: 330, w: 12, h: 120 },
      ],
      lights: [
        { x: 92, y: 46, r: 70, color: '#ffbe55', a: 0.5, flicker: 0.03, kind: 'lamp' },
        { x: 206, y: 46, r: 70, color: '#ffbe55', a: 0.5, flicker: 0.03, kind: 'lamp' },
        { x: 83, y: 77, r: 70, color: '#ff3ea5', a: night ? 0.8 : 0.25, flicker: 0.12, kind: 'neon' },
        { x: 83, y: 90, r: 100, color: night ? '#6a7aff' : '#ffbe55', a: night ? 0.3 : 0.5, flicker: 0, kind: 'window' },
      ],
      anim: [{ kind: 'neon_flicker', x: 83, y: 77 }],
    });
  });

  /* ================================================================ STUDIO */
  function foamPanel(p, x, y, w, h, c, cell) {
    cell = cell || 6; const R = rp(c), lt = mix(R.base, R.light, 0.55), sd = mix(R.base, R.shade, 0.7), dp = mix(R.base, R.deep, 0.6);
    p.rect(x, y, w, h, R.base);
    for (let j = 0; j < h; j += cell) for (let i = 0; i < w; i += cell) {
      const cw = Math.min(cell, w - i), ch = Math.min(cell, h - j), m = Math.floor(cell / 2);
      p.rect(x + i, y + j, Math.min(m, cw), 1, lt); p.rect(x + i, y + j, 1, Math.min(m, ch), lt);
      if (cw >= cell && ch >= cell) { p.rect(x + i + m, y + j + cell - 1, cell - m, 1, sd); p.rect(x + i + cell - 1, y + j + m, 1, cell - m, sd); p.px(x + i + m - 1, y + j + m - 1, dp); }
    }
    p.frame(x, y, w, h, mix(c, '#120d1f', 0.6));
  }
  function speaker(p, x, y, w, h, c, rr) {
    box(p, x, y, w, h, c); const cx = x + w / 2 - 0.5;
    p.ellipse(cx, y + h * 0.7, w * 0.32, w * 0.32, '#18122c'); p.ellipse(cx, y + h * 0.7, w * 0.22, w * 0.22, '#3a3560'); p.ellipse(cx, y + h * 0.7, w * 0.08, w * 0.08, '#8a87a8');
    p.ellipse(cx, y + h * 0.22, w * 0.12, w * 0.12, '#18122c'); p.ellipse(cx, y + h * 0.22, w * 0.05, w * 0.05, '#8a87a8'); p.px(x + w - 4, y + h - 3, '#9dff4a');
  }
  reg('studio', (variant) => {
    const night = variant === 'night', rr = rng(3303), p = new Z(W, H);
    p.fill('#241540');
    // wall of foam panels
    const pc = ['#3a2f5c', '#43296f', '#2f3a6a', '#3a2f5c', '#6a3b8f', '#1f5a6a', '#3a2f5c'];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) foamPanel(p, c * 36 - 3, 12 + r * 36, 36, 36, pc[(r * 3 + c * 5 + (r > 4 ? 2 : 0)) % pc.length], 6);
    grain(p, 0, 12, W, 288, ['#1c1038', '#6a5fa0', '#241540'], 0.045, 5);
    // ceiling and beam
    p.rect(0, 0, W, 12, '#18122c'); p.rect(0, 10, W, 2, '#3a2f5c');
    // floor
    perspFloor(p, 300, H, '#6a4a5c', rr);
    // wall skirting
    p.rect(0, 296, W, 6, '#18122c'); p.rect(0, 296, W, 1, '#4a3a6c');
    // ---- soundproof door (left)
    const dr = rp('#2f4a6a');
    p.rect(4, 176, 52, 128, '#18122c'); p.rect(6, 178, 48, 126, dr.base); p.rect(6, 178, 48, 2, dr.light); p.rect(6, 178, 2, 126, dr.light); p.rect(52, 178, 2, 126, dr.shade);
    p.rect(12, 190, 36, 30, '#18122c'); p.rect(13, 191, 34, 28, night ? '#3a2a6e' : '#ffbe55'); dfill(p, 13, 191, 34, 10, night ? '#5a4a9e' : '#fff0c9', 2); p.rect(29, 191, 2, 28, '#18122c');
    p.rect(12, 232, 36, 60, dr.shade); p.rect(13, 233, 34, 58, dr.base); for (let y = 238; y < 290; y += 8) p.rect(13, y, 34, 1, dr.shade);
    p.rect(44, 250, 4, 12, '#c7bfd8'); p.rect(44, 250, 1, 12, '#fff');
    p.rect(14, 178, 28, 8, '#ffe14d'); txt(p, 'EXIT', 17, 179, '#2a1a3c', { scale: 1 });
    // ---- window slit (day/night)
    p.rect(64, 34, 56, 40, '#18122c');
    // glass after grade
    // gold records + framed things
    for (const [x, y] of [[66, 98], [92, 98], [66, 126], [92, 126]]) { p.rect(x, y, 22, 22, '#3a2038'); p.rect(x + 1, y + 1, 20, 20, '#18122c'); p.ellipse(x + 10.5, y + 10.5, 8, 8, '#ffd23f'); p.ellipse(x + 10.5, y + 10.5, 6, 6, '#d4a017'); p.ellipse(x + 10.5, y + 10.5, 2, 2, '#fff0c9'); p.px(x + 6, y + 6, '#fff'); }
    p.rect(66, 152, 48, 3, '#ffbe55'); txt(p, 'HITS', 78, 160, '#ffbe55');
    // ---- sofa corner
    const sf = rp('#2a7a86');
    p.rect(2, 330, 94, 28, sf.base); p.rect(2, 318, 94, 14, sf.base); p.rect(2, 318, 94, 2, sf.light); p.rect(2, 318, 2, 54, sf.light);
    p.rect(0, 340, 14, 32, sf.shade); p.rect(84, 340, 12, 32, sf.shade); p.rect(0, 340, 3, 32, sf.light); p.rect(14, 346, 70, 26, sf.base); p.rect(14, 346, 70, 2, sf.light); p.rect(14, 370, 70, 2, sf.deep); p.vline(48, 348, 22, sf.shade);
    p.rect(4, 372, 4, 4, '#18122c'); p.rect(88, 372, 4, 4, '#18122c');
    // cushions + blanket
    p.poly([[20, 336], [38, 332], [40, 348], [22, 350]], '#ff3ea5'); p.poly([[20, 336], [38, 332], [38, 335], [21, 339]], '#ff8ac8'); p.px(28, 342, '#fff0c9'); p.px(30, 342, '#fff0c9'); p.px(29, 343, '#fff0c9');
    p.poly([[58, 334], [76, 336], [74, 351], [57, 349]], '#ffbe55'); p.rect(60, 337, 14, 2, '#fff0c9'); p.rect(60, 342, 12, 2, '#fff0c9');
    p.poly([[50, 350], [84, 346], [84, 368], [50, 372]], '#a86bff'); for (let i = 0; i < 5; i++) p.vline(54 + i * 6, 352 - i, 18, '#7a4ac8'); p.rect(50, 350, 34, 1, '#c9a8ff');
    // side table + lamp + plant
    p.rect(100, 340, 22, 3, '#8a5a3c'); p.rect(100, 340, 22, 1, '#c98a5a'); p.rect(103, 343, 2, 30, '#5a3a3c'); p.rect(117, 343, 2, 30, '#5a3a3c'); p.rect(100, 372, 22, 2, '#8a5a3c');
    cup(p, 106, 340, '#fff0c9', 6, 6);
    plant(p, 114, 340, 0.5, rr);
    // floor lamp
    p.rect(124, 270, 2, 70, '#8a87a8'); p.rect(120, 338, 10, 3, '#46405e'); p.poly([[114, 270], [136, 270], [131, 252], [119, 252]], '#ffe9a8'); p.rect(119, 252, 12, 2, '#fff0c9');
    // rug + cables
    p.ellipse(140, 450, 66, 12, '#241540'); p.ellipse(140, 450, 62, 10, '#a86bff'); p.ellipse(140, 450, 52, 8, '#2ee6ff'); p.ellipse(140, 450, 40, 6, '#2a1a5a');
    for (let i = -60; i <= 60; i += 3) p.px(140 + i, 450 + Math.round(Math.sqrt(Math.max(0, 1 - (i / 66) ** 2)) * 12), '#fff0c9');
    // ---- mixing desk (right)
    const dk = rp('#4a3a6c');
    p.rect(166, 330, 104, 8, dk.base); p.rect(166, 330, 104, 1, dk.hi); p.rect(166, 338, 104, 1, dk.deep);
    p.rect(170, 338, 96, 60, dk.shade); p.rect(170, 338, 96, 1, dk.base);
    for (let k = 0; k < 3; k++) { p.rect(176 + k * 30, 346, 26, 44, dk.deep); p.rect(177 + k * 30, 347, 24, 42, dk.shade); p.rect(184 + k * 30, 366, 10, 2, '#ffbe55'); }
    p.rect(166, 396, 104, 3, '#18122c');
    // monitor speakers on stands
    for (const sx of [170, 244]) { speaker(p, sx, 262, 26, 36, '#3a3560', rr); p.rect(sx + 11, 298, 4, 32, '#8a87a8'); p.rect(sx + 3, 328, 20, 3, '#6a6788'); }
    // mixer board
    p.poly([[184, 314], [248, 314], [254, 330], [178, 330]], '#2c2748'); p.rect(184, 314, 64, 1, '#6a6598');
    for (let i = 0; i < 10; i++) { p.rect(188 + i * 6, 318, 2, 9, '#18122c'); p.rect(187 + i * 6, 320 + (i * 7) % 6, 4, 2, ['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a'][i % 4]); }
    for (let i = 0; i < 8; i++) p.px(190 + i * 7, 316, ['#ff6b6b', '#ffbe55', '#9dff4a'][i % 3]);
    // laptop
    p.poly([[196, 296], [226, 296], [226, 314], [196, 314]], '#3a3560'); p.rect(197, 297, 28, 16, '#15102b'); p.rect(196, 296, 30, 1, '#8a87a8');
    p.poly([[192, 314], [230, 314], [234, 320], [188, 320]], '#6a6788'); p.rect(192, 314, 38, 1, '#c7bfd8');
    // headphones on the desk + cables on the floor
    p.ring(256, 322, 5, 5, '#2c2748'); p.rect(250, 322, 3, 6, '#ff3ea5'); p.rect(259, 322, 3, 6, '#ff3ea5');
    cable(p, [[210, 330], [214, 372], [200, 400], [170, 420], [150, 438]], '#18122c'); cable(p, [[230, 330], [236, 380], [226, 410], [190, 428], [156, 440]], '#2a1a5a');
    // ---- mic on stand with pop filter (centre-right of the standing spot)
    p.ellipse(154, 442, 12, 3, '#18122c'); p.rect(142, 440, 24, 3, '#46405e'); p.rect(153, 400, 2, 42, '#8a87a8'); p.rect(153, 400, 1, 42, '#c7bfd8');
    p.line(154, 400, 140, 388, '#8a87a8', 2);
    p.rect(132, 380, 9, 13, '#c7bfd8'); p.rect(132, 380, 3, 13, '#fff'); p.rect(139, 380, 2, 13, '#6a6788'); dfill(p, 133, 382, 6, 9, '#6a6788', 2); p.rect(131, 378, 11, 2, '#ffbe55'); p.rect(131, 392, 11, 2, '#46405e');
    p.ring(128, 386, 10, 10, '#2c2748'); p.ring(128, 386, 9, 9, '#4a4478'); for (let i = -7; i < 8; i += 2) for (let j = -7; j < 8; j += 2) if (i * i + j * j < 64) p.px(128 + i, 386 + j, '#2a2548');
    // (the pop filter is a mesh disc: dither fill)
    p.px(122, 380, '#8a87a8'); p.px(121, 381, '#c7bfd8');
    // wall: cable loom, headphone hooks
   
    // ---- ON AIR box (emissive painted later), frame now
    p.rect(180, 36, 76, 28, '#18122c'); p.rect(182, 38, 72, 24, '#2a0a14'); p.frame(180, 36, 76, 28, '#4a3a6c');
    { const rd = rng(55);
      // guitar on the wall
      p.rect(147, 98, 5, 32, '#6f3d2b'); p.rect(147, 98, 1, 32, '#a8704c'); p.rect(145, 86, 9, 13, '#3a2038');
      for (let i = 0; i < 3; i++) { p.px(144, 88 + i * 3, '#c7bfd8'); p.px(154, 88 + i * 3, '#c7bfd8'); }
      p.ellipse(149.5, 142, 11, 11, '#c9783c'); p.ellipse(149.5, 128, 8, 8, '#c9783c'); p.ellipse(146, 138, 5, 6, '#e8a86a');
      p.ellipse(149.5, 138, 4, 4, '#18122c'); p.ring(149.5, 138, 5, 5, '#6f3d2b'); p.rect(144, 150, 11, 2, '#3a2038');
      for (const dx of [-1, 0, 1, 2]) p.vline(148 + dx, 100, 51, '#c7bfd8');
      // rack unit with LEDs
      for (let k = 0; k < 3; k++) { p.rect(196, 78 + k * 12, 54, 10, '#2c2748'); p.rect(196, 78 + k * 12, 54, 1, '#6a6598'); p.rect(196, 87 + k * 12, 54, 1, '#18122c'); for (let i = 0; i < 6; i++) { p.ellipse(204 + i * 6, 83 + k * 12, 1.5, 1.5, '#8a87a8'); p.px(204 + i * 6, 82 + k * 12, '#fff'); } for (let i = 0; i < 8; i++) p.px(238 + (i % 4) * 2, 81 + k * 12 + (i > 3 ? 3 : 0), ['#9dff4a', '#ff6b6b', '#ffbe55', '#2ee6ff'][(i + k) % 4]); }
      cable(p, [[200, 120], [196, 190], [190, 262], [192, 300]], '#18122c'); cable(p, [[246, 120], [250, 200], [252, 262]], '#2a1a5a');
      // knobs on the mixer
      for (let i = 0; i < 10; i++) { p.px(188 + i * 6, 327.4, '#c7bfd8'); p.px(189 + i * 6, 327.4, '#6a6598'); }
      // sofa weave and wall frames above it
      dfill(p, 14, 346, 70, 26, '#1f6a76', 1); dfill(p, 2, 318, 94, 14, '#1f6a76', 1);
      poster(p, 62, 208, 18, 26, 'wave', '#2a1a5a', '#2ee6ff'); poster(p, 86, 214, 20, 20, 'record', '#6a3b8f', '#ffbe55');
      // mug, notebook and cables on the side table
      p.rect(103, 336, 8, 4, '#d6446f'); p.rect(103, 336, 8, 1, '#ff8aa8');
      p.rect(0, 296, W, 2, '#241a3c', 100);
      addDust(p, 20, 40, 220, 250, 36, 18);
    }
    vignette(p, 0, 12, W, 290, 0.8); vignette(p, 0, 300, W, 180, 0.9);
    // ======= grade + emissive
    if (night) p.tint('#7b6fc6', 0.88);
    citySky(p, 66, 36, 52, 36, night, rng(11), [{ c: '#2ee6ff' }]);
    for (let y = 36; y < 54; y += 3) { p.rect(66, y, 52, 2, night ? '#6a5f9a' : '#d8c8e8'); p.rect(66, y + 2, 52, 1, night ? '#3a3560' : '#8a7aa8'); }
    p.rect(66, 54, 52, 2, night ? '#4a4478' : '#a898c8'); p.rect(66, 66, 52, 1, '#c7bfd8'); p.rect(91, 36, 2, 36, night ? '#6a5f9a' : '#d8c8e8');
    p.rect(66, 36, 52, 1, '#c7bfd8');
    // neon ON AIR
    neon(p, 'ON AIR', 218, 50, '#ff2f4f', 2);
    // mixer LEDs
    for (let i = 0; i < 8; i++) glow(p, 190 + i * 7, 316, 3, ['#ff6b6b', '#ffbe55', '#9dff4a'][i % 3], 0.4);
    // laptop screen
    p.rect(197, 297, 28, 16, '#15102b'); for (let i = 0; i < 6; i++) { p.rect(199 + i * 4, 311 - ((i * 5) % 9 + 3), 3, (i * 5) % 9 + 3, ['#ff3ea5', '#2ee6ff', '#9dff4a'][i % 3]); }
    glow(p, 210, 304, 34, '#2ee6ff', night ? 0.7 : 0.4, 26);
    if (night) { glow(p, 218, 50, 70, '#ff2f4f', 0.9, 40); glow(p, 125, 262, 60, '#ffbe55', 0.9, 50); glow(p, 92, 54, 50, '#6a7aff', 0.4, 36); }
    else { glow(p, 218, 50, 46, '#ff2f4f', 0.6, 24); glow(p, 92, 60, 70, '#ffbe55', 0.6, 40); beam(p, 80, 72, 22, 40, 300, 60, '#ffbe55', 0.5); beam(p, 104, 72, 18, 90, 300, 56, '#ffbe55', 0.4); glow(p, 125, 262, 40, '#ffbe55', 0.5, 36); }
    p.poly([[114, 270], [136, 270], [131, 252], [119, 252]], '#ffe9a8'); p.rect(119, 252, 12, 2, '#fff0c9');
    return scene('studio', variant, p, {
      floorY: 440,
      spots: { stand: { x: 112, y: 442 } },
      hotspots: [
        { id: 'mic', label: 'Mic', x: 120, y: 372, w: 52, h: 76 },
        { id: 'mixer', label: 'Mixer', x: 166, y: 258, w: 104, h: 142 },
        { id: 'door', label: 'Door', x: 4, y: 176, w: 52, h: 128 },
      ],
      lights: [
        { x: 218, y: 50, r: 80, color: '#ff2f4f', a: 0.7, flicker: 0.05, kind: 'neon' },
        { x: 125, y: 262, r: 70, color: '#ffbe55', a: 0.5, flicker: 0.02, kind: 'lamp' },
        { x: 210, y: 304, r: 50, color: '#2ee6ff', a: 0.4, flicker: 0.08, kind: 'screen' },
        { x: 92, y: 54, r: 80, color: night ? '#6a7aff' : '#ffbe55', a: night ? 0.3 : 0.5, flicker: 0, kind: 'window' },
      ],
      anim: [{ kind: 'neon_flicker', x: 218, y: 50 }],
    });
  });

  /* ================================================================ BAR */
  function haze(p, y0, y1, color, k, rr) {      // dithered smoke bands (native loop)
    const n = gr(p), ph = rr() * 6, Y0 = sc(y0), Y1 = sc(y1);
    for (let y = Y0; y < Y1; y++) for (let x = 0; x < n.w; x++) {
      const lx = x / K, ly = y / K;
      const w = Math.sin(lx * 0.045 + ly * 0.07 + ph) * 0.5 + Math.sin(lx * 0.11 - ly * 0.05 + ph * 2) * 0.3 + 0.5;
      const edge = Math.sin((y - Y0) / (Y1 - Y0) * Math.PI);
      const v = dq(w * edge * k, x, y); if (v > 0) n.add(x, y, color, 255 * v * 0.3);
    }
  }
  function barStool(p, x, y, c) {     // x centre, y = seat top
    const R = rp(c);
    p.rect(x - 1, y + 4, 3, 38, '#6a6788'); p.rect(x - 1, y + 4, 1, 38, '#c7bfd8'); p.ellipse(x, y + 42, 7, 2, '#46405e'); p.ring(x, y + 30, 5, 1.5, '#8a87a8');
    p.ellipse(x, y + 2, 9, 3, R.shade); p.ellipse(x, y, 9, 3, R.base); p.ellipse(x - 2, y - 1, 4, 1, R.light); p.rect(x - 9, y + 1, 19, 2, R.deep);
  }
  function roundTable(p, x, y, rr, glass) {   // y = table top centre
    p.ellipse(x, y + 44, 14, 3, '#18122c'); p.rect(x - 2, y + 4, 4, 40, '#46405e'); p.rect(x - 2, y + 4, 1, 40, '#8a87a8');
    p.ellipse(x, y + 3, 24, 7, '#5a3a3c'); p.ellipse(x, y + 1, 24, 7, '#8a5a3c'); p.ellipse(x - 3, y, 16, 4, '#a8704c'); p.ellipse(x - 6, y - 1, 6, 1.5, '#c98a5a');
    // tea light and drinks
    p.rect(x - 2, y - 3, 4, 3, '#fff0c9'); p.px(x, y - 5, '#ffbe55'); p.px(x, y - 6, '#fff0c9');
    cup(p, x - 14, y, '#2a7a86', 6, 8); p.px(x - 14, y - 9, '#c7bfd8');
    bottle(p, x + 12, y + 1, 13, '#6fcf6f', { w: 4, label: '#fff0c9' });
    cup(p, x + 5, y + 2, '#ff9a4a', 5, 7);
  }
  function sit(p, x, y, body, rim, rr) {         // seated silhouette: head + shoulders, y = shoulder line
    p.ellipse(x, y, 8, 6, body); p.rect(x - 1, y - 8, 3, 6, body); p.ellipse(x, y - 11, 4.5, 4.5, body);
    p.px(x - 4, y - 11, rim); p.px(x - 3, y - 14, rim); p.px(x - 8, y - 1, rim); p.px(x - 7, y - 3, rim);
  }
  reg('bar', () => {
    const rr = rng(4404), p = new Z(W, H), fg = new Z(W, H);
    p.fill('#150f26');
    // brick back wall
    p.rect(0, 0, W, 272, '#3a1d2e');
    for (let y = 0, r = 0; y < 272; y += 8, r++) { p.rect(0, y, W, 1, '#24121f'); for (let x = (r % 2) * 10; x < W; x += 20) p.rect(x, y, 1, 8, '#24121f'); for (let k = 0; k < 7; k++) p.rect(Math.floor(rr() * W), y + 2 + Math.floor(rr() * 5), 5 + Math.floor(rr() * 6), 1, rr() < 0.5 ? '#5b2a35' : '#2f1828'); }
    p.rect(0, 0, W, 14, '#150f26');
    grain(p, 0, 14, W, 258, ['#5b2a35', '#24121f', '#8a3f3f', '#6a3a4a'], 0.06, 7);
    // floor
    const fl = rp('#33224e'); p.rect(0, 272, W, 208, fl.base);
    for (let y = 272, hh = 7, r = 0; y < H; y += hh, hh++, r++) { p.rect(0, y, W, 1, fl.deep); for (let x = (r % 2) * 20; x < W; x += 40 + hh) p.rect(x, y, 1, hh, fl.deep); for (let k = 0; k < 3; k++) p.hline(Math.floor(rr() * W), y + 2, 5 + Math.floor(rr() * 8), fl.shade); }
    p.rect(0, 270, W, 3, '#18122c'); p.rect(0, 270, W, 1, '#6a3b5c');
    // ---- stage (left)
    p.rect(6, 76, 130, 164, '#150f26');
    // star backdrop in the gap
    for (let i = 0; i < 26; i++) p.px(46 + Math.floor(rr() * 48), 100 + Math.floor(rr() * 130), i % 4 ? '#6a5fa0' : '#c7bfd8');
    const cu = rp('#a01f44');
    for (const [x0, x1] of [[6, 48], [94, 136]]) {
      p.rect(x0, 78, x1 - x0, 162, cu.base);
      for (let x = x0, k = 0; x < x1; x += 4, k++) { p.rect(x, 78, 2, 162, k % 2 ? cu.shade : cu.light); p.rect(x + 2, 78, 1, 162, cu.deep); }
      for (let y = 78; y < 240; y++) { const sw = Math.round(Math.sin((y - 78) / 162 * Math.PI) * 6); if (x0 < 50) p.rect(x1 - sw, y, sw, 1, cu.deep); else p.rect(x0, y, sw, 1, cu.deep); }
    }
    p.rect(6, 76, 130, 12, cu.deep); for (let x = 6; x < 136; x += 10) { p.ellipse(x + 5, 88, 5, 4, cu.base); p.px(x + 3, 86, cu.hi); }
    for (let x = 8; x < 134; x += 3) p.px(x, 96, '#d4a017');
    // platform
    p.rect(2, 238, 136, 14, '#7a4a3c'); for (let x = 2; x < 138; x += 14) p.rect(x, 238, 1, 14, '#4a2a2c'); p.rect(2, 238, 136, 1, '#c98a5a');
    p.rect(2, 252, 136, 18, '#3a2038'); p.rect(2, 252, 136, 2, '#8a5a6c'); p.rect(2, 268, 136, 2, '#18122c');
    for (let x = 6; x < 136; x += 8) { p.rect(x, 258, 3, 3, '#ffbe55'); p.px(x + 1, 258, '#fff0c9'); }
    // mic stand, amp, monitor wedge, mic
    p.rect(88, 250, 12, 3, '#18122c'); p.rect(93, 212, 2, 38, '#8a87a8'); p.rect(93, 212, 1, 38, '#c7bfd8'); p.line(94, 212, 88, 204, '#8a87a8'); p.ellipse(87, 202, 3, 3, '#c7bfd8'); p.px(86, 201, '#fff'); p.ellipse(87, 203, 2, 1, '#6a6788');
    box(p, 108, 212, 22, 26, '#2c2748'); p.rect(110, 216, 18, 18, '#18122c'); dfill(p, 110, 216, 18, 18, '#3a3560', 2); p.rect(112, 236, 14, 1, '#ff3ea5');
    p.poly([[14, 252], [40, 252], [34, 242], [20, 242]], '#3a3560'); p.rect(14, 252, 26, 1, '#6a6598'); p.ellipse(27, 247, 5, 2, '#18122c');
    // truss and par cans
    p.rect(6, 14, 130, 6, '#46405e'); p.rect(6, 14, 130, 1, '#c7bfd8'); for (let x = 6; x < 136; x += 6) { p.px(x, 18, '#18122c'); p.px(x + 3, 16, '#8a87a8'); }
    for (const x of [26, 70, 114]) { p.rect(x - 5, 20, 10, 8, '#2c2748'); p.rect(x - 5, 20, 10, 1, '#8a87a8'); p.rect(x - 4, 28, 8, 2, '#18122c'); }
    // neon OPEN MIC above the curtain handled below (emissive). Sign backing:
    // ---- back bar: chalkboard + shelves + door
    p.rect(138, 20, 94, 70, '#3a2038'); p.rect(140, 22, 90, 66, '#1f2a2a'); p.rect(140, 22, 90, 1, '#4a5a5a'); dfill(p, 140, 22, 90, 66, '#2a3a38', 1);
    txt(p, 'TODAY', 144, 26, '#fff0c9'); p.hline(144, 35, 82, '#9a9a8a');
    const menu = [['GREEN JUICE', '4', '#9dff4a'], ['KOMBUCHA', '5', '#ffbe55'], ['MATCHA', '5', '#6fcf6f'], ['HERBAL TEA', '3', '#ff9ac8'], ['FLAT WHITE', '4', '#fff0c9']];
    menu.forEach(([n, pr, c], i) => { txt(p, n, 144, 40 + i * 9, c); txt(p, '$' + pr, 212, 40 + i * 9, '#fff0c9'); });
    p.rect(140, 87, 90, 2, '#8a5a3c'); p.rect(176, 84, 4, 3, '#fff0c9'); p.rect(184, 85, 3, 2, '#ff6b6b');       // chalk
    p.rect(138, 20, 94, 2, '#c98a5a'); p.rect(138, 88, 94, 2, '#8a5a3c'); p.rect(138, 20, 2, 70, '#c98a5a'); p.rect(230, 20, 2, 70, '#8a5a3c');
    // shelves with bottles, juices, jars
    for (const sy of [136, 176, 216]) { p.rect(138, sy, 94, 4, '#6a3f3c'); p.rect(138, sy, 94, 1, '#a8704c'); p.rect(138, sy + 4, 94, 1, '#241220'); }
    const bc = ['#6fcf6f', '#ff9a4a', '#ff3ea5', '#ffe14d', '#2ee6ff', '#a86bff', '#c9577f', '#9dff4a', '#3a5fcd', '#ffbe55'];
    [[136, 22], [176, 20], [216, 18]].forEach(([sy, hh], row) => { for (let i = 0; i < 9; i++) { const bx = 146 + i * 10 + (row % 2) * 2, c = bc[(i * 3 + row * 2) % 10]; bottle(p, bx, sy, hh - (i % 3) * 3, c, { w: 5, label: i % 2 ? '#fff0c9' : null }); } });
    for (let i = 0; i < 3; i++) { p.rect(150 + i * 28, 100, 16, 20, '#cfeaf0'); p.rect(151 + i * 28, 106, 14, 14, ['#ff9a4a', '#6fcf6f', '#ff3ea5'][i]); p.rect(151 + i * 28, 106, 14, 2, '#fff0c9'); p.rect(150 + i * 28, 98, 16, 2, '#c7bfd8'); }
    // mirror behind the shelves (cool diagonal glints)
    p.rect(138, 96, 94, 2, '#c98a5a');
    // door (right)
    p.rect(236, 150, 34, 122, '#18122c'); p.rect(238, 152, 30, 120, '#3a5fcd'); p.rect(238, 152, 2, 120, '#7a9aff'); p.rect(266, 152, 2, 120, '#2c4aa0');
    p.rect(242, 160, 22, 40, '#241a3c'); p.rect(243, 161, 20, 38, '#6a3b8f'); dfill(p, 243, 161, 20, 20, '#a86bff', 2); p.rect(242, 220, 22, 44, '#2c4aa0'); p.rect(260, 214, 4, 10, '#c7bfd8');
    // ---- crowd (backs of heads, warm rim)
    crowd(p, 300, 20, 136, rng(53), '#100a20', '#7a4a9a', 0.85, false);
    crowd(p, 316, 6, 140, rng(51), '#150f26', '#ffbe55', 1, true);
    crowd(p, 342, 0, 118, rng(52), '#1a1230', '#ff6bb5', 1.15, false);
    // standing silhouettes near the counter
    sit(p, 168, 340, '#150f26', '#ffbe55'); sit(p, 214, 340, '#150f26', '#2ee6ff');
    // tables
    roundTable(p, 44, 390, rr); sit(p, 22, 388, '#150f26', '#ff6bb5');
    roundTable(p, 226, 412, rr); sit(p, 250, 404, '#150f26', '#ffbe55'); 
    barStool(p, 160, 352, '#ff3ea5'); barStool(p, 192, 354, '#2ee6ff'); barStool(p, 224, 352, '#ffbe55');
    // ---- fg: counter and its stuff
    const co = rp('#6a3b4c');
    fg.rect(134, 250, 100, 10, '#c98a5a'); fg.rect(134, 250, 100, 1, '#fff0c9'); fg.rect(134, 260, 100, 2, '#8a5a3c');
    fg.rect(136, 262, 96, 68, co.base); fg.rect(136, 262, 96, 2, co.light);
    for (let k = 0; k < 4; k++) { fg.rect(140 + k * 23, 268, 20, 54, co.shade); fg.rect(141 + k * 23, 269, 18, 52, co.base); fg.rect(141 + k * 23, 269, 18, 1, co.light); }
    fg.rect(136, 326, 96, 4, '#18122c');
    // taps
    fg.rect(138, 242, 30, 8, '#8a87a8'); fg.rect(138, 242, 30, 1, '#fff'); fg.rect(140, 234, 26, 8, '#46405e'); fg.rect(140, 234, 26, 1, '#8a87a8');
    for (let i = 0; i < 4; i++) { const hx = 143 + i * 6, hc = ['#ff3ea5', '#2ee6ff', '#9dff4a', '#ffbe55'][i]; fg.rect(hx, 220, 3, 14, hc); fg.rect(hx, 220, 1, 14, lighten(hc, 0.5)); fg.rect(hx, 242, 3, 8, '#c7bfd8'); }
    // glasses + drip tray
    for (let i = 0; i < 3; i++) cup(fg, 176 + i * 5, 249, '#cfeaf0', 4, 7);
    // juice jars with taps
    for (let i = 0; i < 2; i++) { const jx = 208 + i * 13; fg.rect(jx, 226, 12, 24, '#cfeaf0'); fg.rect(jx + 1, 232, 10, 18, ['#ff9a4a', '#6fcf6f'][i]); fg.rect(jx + 1, 232, 10, 2, '#fff0c9'); fg.rect(jx, 222, 12, 4, '#c7bfd8'); fg.rect(jx + 5, 250, 4, 2, '#c7bfd8'); fg.rect(jx + 1, 228, 2, 22, '#ffffff'); fg.px(jx + 4, 238, '#fff0c9'); fg.px(jx + 7, 242, '#fff0c9'); }
    // fruit + tea pot on the end
    fruit(fg, 170, 247, 3, '#ff4f5e'); fruit(fg, 167, 250, 3, '#ff9a4a');
    // foreground crowd heads in the corners (depth)
    crowd(fg, 478, -4, 26, rng(61), '#120d1f', '#ffbe55', 1.8, false);
    { const rd = rng(66);
      poster(p, 240, 26, 26, 32, 'face', '#5a2a4a', '#ffbe55'); poster(p, 242, 66, 22, 24, 'record', '#2a1a5a', '#2ee6ff');
      cable(p, [[96, 251], [102, 255], [110, 252], [112, 248]], '#0e0a1c');
      for (let i = 0; i < 5; i++) { p.px(8 + i * 26, 236, '#ffbe55'); p.px(9 + i * 26, 236, '#fff0c9'); }
      streaks(p, 2, 238, 136, 14, ['#a8704c', '#4a2a2c'], 20, 9, 3);
      // stickers on the counter front are in fg; brass rail on the floor along the bar
      const bb = stringLights(p, 138, 10, 232, 12, 5, ['#ffbe55', '#fff0c9', '#ff9a4a'], 7, rd);
      paintBulbs(p, bb, true);
      addDust(p, 10, 100, 240, 180, 40, 19, '#ffd7a0');
    }
    for (let i = 0; i < 6; i++) { fg.rect(146 + i * 15, 276 + (i % 2) * 3, 5, 4, ['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a', '#a86bff', '#ff6b6b'][i]); }
    streaks(fg, 136, 262, 96, 68, ['#8a4a5c', '#4a2038'], 22, 9, 30);
    // neon reflections on the floor (additive streaks) + smoke
    // ======= emissive: neon signs, light cones, haze
    haze(p, 150, 290, '#a86bff', 0.8, rr); haze(p, 270, 400, '#ff3ea5', 0.45, rr);
    for (const [cx, c, a] of [[26, '#ff3ea5', 1], [70, '#2ee6ff', 0.9], [114, '#ffbe55', 1]]) { beam(p, cx, 30, 6, cx + (cx < 60 ? 16 : cx > 100 ? -14 : 0), 248, cx < 60 ? 38 : 34, c, a); p.rect(cx - 3, 29, 6, 1, '#fff'); }
    for (const [cx, c] of [[26, '#ff3ea5'], [70, '#2ee6ff'], [114, '#ffbe55']]) glow(p, cx + (cx < 60 ? 16 : cx > 100 ? -14 : 0), 244, 26, c, 0.5, 8);
    neon(p, 'OPEN MIC', 71, 52, '#2ee6ff', 2);
    neon(p, 'JUICE', 253, 124, '#9dff4a', 1);
    neon(p, 'EXIT', 253, 140, '#ff2f4f', 1);
    // pink neon tube art over the door-side wall: a mic outline
    // chalkboard warm lamp pools + counter underglow
    glow(p, 186, 60, 60, '#ffbe55', 0.55, 40); glow(p, 186, 190, 70, '#ffbe55', 0.5, 50); glow(p, 253, 124, 34, '#9dff4a', 0.4, 20);
    fg.rect(136, 328, 96, 1, '#2ee6ff'); addStrip(fg, 136, 329, 96, 1.5, '#2ee6ff', 120);
    glow(p, 186, 320, 70, '#2ee6ff', 0.4, 24);
    glow(p, 253, 150, 36, '#ff2f4f', 0.7, 28);
    // floor reflections
    for (const [cx, c, w] of [[71, '#2ee6ff', 40], [186, '#ff3ea5', 36], [100, '#ffbe55', 30], [26, '#ff3ea5', 20]]) reflect(p, cx, 276, 372, w / 2, c, 0.5, 5);
    // table candles glow
    glow(p, 44, 384, 26, '#ffbe55', 0.8, 14); glow(p, 226, 406, 26, '#ffbe55', 0.8, 14);
    vignette(p, 0, 0, W, H, 1.1);
    // stage floor hot spot
    glow(p, 70, 246, 50, '#fff0c9', 0.35, 10);
    return scene('bar', 'night', p, {
      fg, floorY: 440,
      spots: { stand: { x: 122, y: 430 }, rohzel: { x: 186, y: 270 }, stage: { x: 66, y: 250 } },
      hotspots: [
        { id: 'stage', label: 'Stage', x: 4, y: 76, w: 134, h: 196 },
        { id: 'counter', label: 'Counter', x: 134, y: 20, w: 100, h: 312 },
        { id: 'door', label: 'Door', x: 236, y: 150, w: 34, h: 122 },
      ],
      lights: [
        { x: 40, y: 244, r: 60, color: '#ff3ea5', a: 0.6, flicker: 0.04, kind: 'lamp' },
        { x: 70, y: 244, r: 60, color: '#2ee6ff', a: 0.6, flicker: 0.04, kind: 'lamp' },
        { x: 100, y: 244, r: 60, color: '#ffbe55', a: 0.6, flicker: 0.04, kind: 'lamp' },
        { x: 71, y: 52, r: 70, color: '#2ee6ff', a: 0.8, flicker: 0.1, kind: 'neon' },
        { x: 253, y: 124, r: 44, color: '#9dff4a', a: 0.5, flicker: 0.1, kind: 'neon' },
        { x: 253, y: 140, r: 40, color: '#ff2f4f', a: 0.6, flicker: 0.05, kind: 'neon' },
        { x: 186, y: 190, r: 80, color: '#ffbe55', a: 0.4, flicker: 0.02, kind: 'lamp' },
        { x: 44, y: 384, r: 36, color: '#ffbe55', a: 0.5, flicker: 0.25, kind: 'fire' },
        { x: 226, y: 406, r: 36, color: '#ffbe55', a: 0.5, flicker: 0.25, kind: 'fire' },
      ],
      anim: [{ kind: 'crowd', x: 6, y: 316, w: 134 }, { kind: 'neon_flicker', x: 71, y: 52 }, { kind: 'steam', x: 150, y: 244 }],
    });
  });

  /* ================================================================ STAGE */
  const STAGE_V = {
    pink: { a: '#ff3ea5', b: '#a86bff', top: '#150a2a', bot: '#2c1450', seed: 11 },
    cyan: { a: '#2ee6ff', b: '#3a5fcd', top: '#07142b', bot: '#10264a', seed: 12 },
    lime: { a: '#9dff4a', b: '#2ee6ff', top: '#06201a', bot: '#0f3a30', seed: 13 },
    gold: { a: '#ffbe55', b: '#ff6b6b', top: '#1f0f1f', bot: '#3f1d33', seed: 14 },
  };
  function speakerStack(p, x, y, w, cabs, ac, flip) {
    const ch = 40;
    for (let i = 0; i < cabs; i++) {
      const cy = y + i * ch, big = i >= cabs - 2;
      box(p, x, cy, w, ch, '#2a2548');
      p.rect(x + 2, cy + 2, w - 4, ch - 4, '#18122c'); dfill(p, x + 2, cy + 2, w - 4, ch - 4, '#26204a', 1);
      const cx = x + w / 2 - 0.5, r = Math.min(w / 2 - 4, big ? 11 : 8);
      p.ellipse(cx, cy + ch * (big ? 0.5 : 0.68), r, r, '#0e0a1c'); p.ellipse(cx, cy + ch * (big ? 0.5 : 0.68), r - 2, r - 2, '#3a3560'); p.ellipse(cx, cy + ch * (big ? 0.5 : 0.68), r - 5, r - 5, '#0e0a1c'); p.px(cx - 2, cy + ch * (big ? 0.5 : 0.68) - r + 2, '#8a87a8');
      if (!big) { p.ellipse(cx, cy + ch * 0.25, 3, 3, '#0e0a1c'); p.ellipse(cx, cy + ch * 0.25, 1.5, 1.5, '#6a6598'); }
      p.px(x + 4, cy + ch - 5, ac); p.px(x + 4, cy + 4, '#c7bfd8'); p.px(x + w - 5, cy + 4, '#c7bfd8');
      p.rect(flip ? x : x + w - 2, cy, 2, ch, mix(ac, '#150a2a', 0.45));   // inner rim lit by the stage
    }
  }
  reg('stage', (variant) => {
    const V = STAGE_V[variant] || STAGE_V.pink, rr = rng(V.seed * 101), p = new Z(W, H), fg = new Z(W, H);
    band(p, 0, 0, W, 300, V.top, V.bot, 9);
    // back wall panels
    for (let x = 0; x < W; x += 30) { p.rect(x, 0, 1, 300, mix(V.bot, '#000000', 0.35)); dfill(p, x + 1, 0, 1, 300, mix(V.bot, V.b, 0.2), 1); }
    for (let y = 40; y < 300; y += 40) p.rect(0, y, W, 1, mix(V.top, V.bot, 0.3));
    // big LED screen (dim)
    p.rect(40, 66, 190, 124, '#0a0716'); p.frame(40, 66, 190, 124, mix(V.b, '#150a2a', 0.5)); p.frame(41, 67, 188, 122, mix(V.a, '#150a2a', 0.75));
    for (let y = 70; y < 188; y += 4) for (let x = 44; x < 228; x += 4) p.px(x, y, mix(V.bot, V.b, 0.15));
    for (let i = 0; i < 31; i++) { const bh = 8 + Math.floor((Math.sin(i * 0.7 + V.seed) * 0.5 + 0.5) * 40 + rr() * 8); for (let y = 0; y < bh; y += 3) p.rect(48 + i * 6, 184 - y, 4, 2, mix(V.bot, y > 30 ? V.a : V.b, y > 30 ? 0.3 : 0.22)); }
    // truss
    p.rect(0, 12, W, 4, '#4a4478'); p.rect(0, 12, W, 1, '#c7bfd8'); p.rect(0, 28, W, 3, '#3a3560'); p.rect(0, 28, W, 1, '#8a87a8');
    for (let x = 0; x < W; x += 9) { p.line(x, 16, x + 4, 28, '#6a6598'); p.line(x + 4, 28, x + 9, 16, '#6a6598'); }
    // banner flags + led strips
    for (let i = 0; i < 18; i++) { const bx = 8 + i * 15, c = i % 2 ? V.a : V.b; p.rect(bx, 32, 8, 4, c); p.rect(bx, 32, 8, 1, lighten(c, 0.5)); p.px(bx + 1, 36, mix(c, '#000000', 0.4)); }
    // speaker stacks (left and right)
    speakerStack(p, 0, 112, 30, 5, V.a, false); speakerStack(p, 240, 112, 30, 5, V.a, true);
    // stage floor
    const fl = mix(V.bot, '#120d1f', 0.45);
    p.rect(0, 300, W, 112, fl);
    for (let y = 300, hh = 6; y < 412; y += hh, hh += 2) { p.rect(0, y, W, 1, mix(fl, V.b, 0.35)); }
    for (let k = -8; k <= 8; k++) p.line(135 + k * 14, 300, 135 + k * 34, 412, mix(fl, V.b, 0.22));
    p.rect(0, 298, W, 3, '#18122c'); p.rect(0, 298, W, 1, V.b);
    // stage lip
    p.rect(0, 412, W, 10, '#241a44'); p.rect(0, 412, W, 2, V.a); p.rect(0, 414, W, 1, lighten(V.a, 0.5)); p.rect(0, 421, W, 2, '#120d1f');
    for (let x = 4; x < W; x += 10) { p.rect(x, 417, 4, 2, mix(V.a, '#120d1f', 0.5)); }
    // pit and crowd area
    p.rect(0, 423, W, 57, '#0f0a1e'); dfill(p, 0, 423, W, 12, '#1c1236', 2);
    // judges riser
    p.rect(150, 256, 114, 8, mix(V.bot, V.b, 0.35)); p.rect(150, 256, 114, 1, lighten(V.b, 0.3)); p.rect(150, 264, 114, 34, '#150e2c'); p.rect(150, 264, 114, 1, V.b);
    for (let x = 156; x < 262; x += 12) p.rect(x, 272, 8, 20, '#1c1438');
    p.rect(150, 296, 114, 2, mix(V.a, '#150a2a', 0.4));
    // beams from the truss (kept toward the sides so the centre stays calm)
    const cans = [[22, -1], [62, -1], [104, -1], [166, 1], [208, 1], [248, 1]];
    cans.forEach(([cx, d], i) => {
      p.rect(cx - 5, 30, 10, 7, '#2c2748'); p.rect(cx - 5, 30, 10, 1, '#8a87a8'); p.rect(cx - 3, 37, 6, 2, i % 2 ? V.a : V.b); p.px(cx - 1, 38, '#fff');
    });
    cans.forEach(([cx, d], i) => { beam(p, cx, 38, 5, cx + d * (30 + (i % 3) * 12) * (cx < 135 ? 1 : -1) * -1 + (cx < 135 ? 40 : -40), 360, 40 + (i % 3) * 8, i % 2 ? V.a : V.b, 0.55); });
    haze(p, 60, 300, V.b, 0.55, rr); haze(p, 290, 420, V.a, 0.35, rr);
    // light pools on the floor + reflections
    glow(p, 84, 376, 50, V.a, 0.55, 12); glow(p, 186, 376, 50, V.b, 0.55, 12); glow(p, 135, 345, 70, V.a, 0.25, 14);
    for (const [cx, c] of [[30, V.b], [76, V.a], [200, V.b], [240, V.a]]) reflect(p, cx, 304, 410, 9, c, 0.35, 4);
    // edge neon strip glow
    addStrip(p, 0, 410.5, W, 1.5, V.a, 130); addStrip(p, 0, 409.5, W, 1, V.a, 50); addStrip(p, 0, 424, W, 1, V.a, 30);
    // top glow behind truss
    { const nn = gr(p); for (let y = 0; y < sc(28); y++) for (let x = 0; x < nn.w; x++) { const v = dq((1 - y / sc(28)) * 0.35, x, y); if (v > 0) nn.add(x, y, V.b, 255 * v * 0.25); } }
    // ---- judges table (foreground occluder) at the upper right
    const tb = rp('#3a2f5c');
    fg.rect(160, 238, 96, 6, tb.light); fg.rect(160, 238, 96, 1, lighten(V.a, 0.4)); fg.rect(160, 244, 96, 20, tb.base); fg.rect(160, 244, 96, 2, tb.shade);
     fg.rect(160, 244, 2, 22, tb.light);
    for (let i = 0; i < 3; i++) { const jx = 176 + i * 30; fg.rect(jx, 250, 18, 10, '#120d1f'); fg.rect(jx + 1, 251, 16, 8, mix(V.a, '#150a2a', 0.65)); txt(fg, 'J' + (i + 1), jx + 4, 252, lighten(V.a, 0.5)); }
    for (let i = 0; i < 3; i++) { const jx = 178 + i * 30; fg.rect(jx, 228, 3, 10, '#c7bfd8'); fg.rect(jx - 1, 226, 5, 3, '#2c2748'); }   // mics on the table
    fg.rect(236, 230, 8, 8, '#cfeaf0'); fg.rect(237, 233, 6, 5, '#2ee6ff'); fg.rect(236, 230, 1, 8, '#fff');
    fg.rect(160, 262, 96, 3, mix(V.a, '#150a2a', 0.2)); for (let x = 160; x < 256; x++) fg.add(x, 263, V.a, 110);
    for (let i = 0; i < 3; i++) glow(p, 185 + i * 30, 222, 22, '#fff0c9', 0.35, 30);
    // ---- crowd: two rows with raised hands, rim lit in the stage colours
    const bodyC = '#0b0716';
    crowd(p, 466, 2, W, rng(V.seed + 70), '#150c28', V.b, 1.25, true);
    crowd(fg, 492, -4, W, rng(V.seed + 90), bodyC, V.a, 1.9, true);
    // lasers, confetti and sparkles
    { const rd = rng(V.seed + 5);
      for (let i = 0; i < 5; i++) { laser(p, 22, 40, -10 + i * 14, 150 + i * 14, i % 2 ? V.a : V.b, 0.6); laser(p, 248, 40, 280 - i * 14, 150 + i * 14, i % 2 ? V.b : V.a, 0.6); }
      for (let i = 0; i < 40; i++) { const nn = gr(p), cx0 = sc(8 + rd() * 254), cy0 = sc(60 + rd() * 340); nn.rect(cx0, cy0, 2, 3, [V.a, V.b, '#fff0c9', '#ffe14d'][i % 4], false); }
      for (let i = 0; i < 6; i++) sparkle4(p, 20 + rd() * 230, 110 + rd() * 220, V.a);
      txt(p, 'BEAT BATTLE', 135 - tw('BEAT BATTLE', 2) / 2, 74, mix(V.bot, V.a, 0.32), { scale: 2 });
    }
    // phones / glowsticks in the crowd
    for (let i = 0; i < 9; i++) { const gx = 10 + Math.floor(rr() * 250), gy = 420 + Math.floor(rr() * 20); p.rect(gx, gy, 2, 5, i % 2 ? V.a : '#fff0c9'); glow(p, gx, gy + 2, 6, i % 2 ? V.a : '#fff0c9', 0.5); }
    vignette(p, 0, 0, W, H, 0.75);
    return scene('stage', variant, p, {
      fg, floorY: 380,
      spots: { player: { x: 84, y: 376 }, opponent: { x: 186, y: 376 }, judge1: { x: 185, y: 258 }, judge2: { x: 215, y: 258 }, judge3: { x: 245, y: 258 } },
      hotspots: [],
      lights: cans.map(([cx], i) => ({ x: cx, y: 40, r: 70, color: i % 2 ? V.a : V.b, a: 0.45, flicker: 0.05, kind: 'lamp' })).concat([
        { x: 84, y: 376, r: 60, color: V.a, a: 0.4, flicker: 0.03, kind: 'lamp' }, { x: 186, y: 376, r: 60, color: V.b, a: 0.4, flicker: 0.03, kind: 'lamp' },
        { x: 135, y: 411, r: 140, color: V.a, a: 0.35, flicker: 0.1, kind: 'neon' },
      ]),
      anim: [{ kind: 'crowd', x: 0, y: 466, w: W }, { kind: 'neon_flicker', x: 135, y: 411 }],
    });
  });

  /* ================================================================ CREATOR */
  reg('creator', () => {
    const rr = rng(6606), p = new Z(W, H);
    band(p, 0, 0, W, 336, '#120a28', '#2c1650', 9);
    // wall panels / brick hints
    for (let y = 14; y < 336; y += 14) { p.rect(0, y, W, 1, '#1c1038'); for (let x = ((y / 14) % 2) * 18; x < W; x += 36) p.rect(x, y, 1, 14, '#1c1038'); }
    // dim posters + records + graffiti, kept to the two outer columns
    poster(p, 8, 40, 30, 44, 'beat', '#2a1a5a', '#a02a78'); poster(p, 44, 54, 24, 30, 'wave', '#1f3a6a', '#2a8aa0'); poster(p, 14, 94, 22, 22, 'record', '#3a2a6a', '#b4804c');
    poster(p, 232, 36, 30, 40, 'bass', '#7a2a4a', '#b49a3c'); poster(p, 204, 50, 22, 28, 'face', '#9a6a3c', '#2a1a5a'); poster(p, 236, 84, 22, 22, 'record', '#2a1a5a', '#2a8aa0');
    // darken them a bit so the wall stays calm
    for (const [x, y, w, h] of [[8, 40, 66, 80], [204, 36, 62, 74]]) p.rect(x, y, w, h, '#120a2846');
    // graffiti: tags + arrows + stars in low-contrast spray colours
    const sp = (x, y, s, c) => { txt(p, s, x, y, mix(c, '#2c1650', 0.8), { scale: 2 }); txt(p, s, x - 1, y - 1, mix(c, '#2c1650', 0.62), { scale: 2 }); };
    sp(10, 140, 'FLOW', '#ff3ea5'); sp(206, 128, 'BBH', '#2ee6ff'); sp(14, 190, 'SPIN', '#9dff4a'); sp(200, 176, 'BEATS', '#ffe14d');
    p.line(14, 166, 60, 168, '#6a2a7a'); p.line(60, 168, 54, 163, '#6a2a7a'); p.line(60, 168, 54, 172, '#6a2a7a');
    for (const [x, y] of [[70, 150], [196, 156], [40, 230], [236, 220]]) { p.vline(x, y - 3, 7, '#8a4a9a'); p.hline(x - 3, y, 7, '#8a4a9a'); p.px(x, y, '#c9a8e0'); }
    // sound-wave mural strip
    for (let i = 0; i < 20; i++) { const hh = 4 + Math.abs(Math.sin(i * 0.9)) * 18; p.rect(8 + i * 3, 262 - hh / 2, 2, hh, '#43296f'); p.rect(206 + i * 3, 262 - hh / 2, 2, hh, '#43296f'); }
    // wall base + floor
    p.rect(0, 330, W, 8, '#120a28'); p.rect(0, 330, W, 1, '#6a3b8f');
    const fl = '#1c1038'; p.rect(0, 338, W, 142, fl);
    for (let y = 338, hh = 6; y < H; y += hh, hh += 2) p.rect(0, y, W, 1, '#2c1a50');
    for (let k = -9; k <= 9; k++) p.line(135 + k * 12, 338, 135 + k * 30, H, '#2c1a50');
    // ---- truss + cans
    p.rect(0, 10, W, 4, '#4a4478'); p.rect(0, 10, W, 1, '#c7bfd8'); p.rect(0, 22, W, 3, '#3a3560');
    for (let x = 0; x < W; x += 9) { p.line(x, 14, x + 4, 22, '#6a6598'); p.line(x + 4, 22, x + 9, 14, '#6a6598'); }
    const cans = [[28, '#ff3ea5'], [82, '#2ee6ff'], [135, '#fff0c9'], [188, '#2ee6ff'], [242, '#ff3ea5']];
    for (const [cx, c] of cans) { p.rect(cx - 5, 25, 10, 7, '#2c2748'); p.rect(cx - 5, 25, 10, 1, '#8a87a8'); p.rect(cx - 3, 32, 6, 2, c); p.px(cx - 1, 33, '#fff'); }
    // cases and a clothes rail at the sides
    box(p, 0, 352, 30, 40, '#2c2748'); p.rect(0, 360, 30, 2, '#6a6598'); p.rect(0, 382, 30, 2, '#6a6598'); p.rect(12, 372, 6, 4, '#c7bfd8');
    box(p, 238, 356, 32, 36, '#2c2748'); p.rect(238, 364, 32, 2, '#6a6598'); p.rect(238, 382, 32, 2, '#6a6598'); p.rect(250, 372, 8, 4, '#c7bfd8');
    p.rect(246, 346, 8, 10, '#ff3ea5'); p.rect(246, 346, 8, 1, '#ff8ac8'); p.rect(256, 349, 8, 7, '#2ee6ff');   // stickers
    p.rect(4, 337, 3, 70, '#8a87a8'); p.rect(4, 337, 38, 2, '#c7bfd8'); for (let i = 0; i < 4; i++) { const c = ['#ff3ea5', '#2ee6ff', '#ffbe55', '#a86bff'][i]; p.rect(10 + i * 8, 342, 6, 30, c); p.rect(10 + i * 8, 342, 1, 30, lighten(c, 0.4)); }
    p.rect(2, 404, 10, 3, '#46405e'); p.rect(34, 404, 10, 3, '#46405e');
    cable(p, [[30, 400], [60, 420], [90, 424]], '#0e0a1c'); cable(p, [[238, 396], [210, 416], [190, 424]], '#0e0a1c');
    const cx = 135, cy = 402;
    // ---- beams, haze, glows
    beam(p, 28, 36, 8, 96, 400, 56, '#ff3ea5', 0.5); beam(p, 242, 36, 8, 174, 400, 56, '#ff3ea5', 0.5);
    beam(p, 82, 36, 6, 116, 400, 36, '#2ee6ff', 0.42); beam(p, 188, 36, 6, 154, 400, 36, '#2ee6ff', 0.42);
    beam(p, 135, 36, 10, 135, 400, 96, '#fff0c9', 0.18);
    haze(p, 60, 340, '#a86bff', 0.5, rr); haze(p, 330, 440, '#ff3ea5', 0.3, rr);
    glow(p, cx, cy + 6, 96, '#ff3ea5', 0.3, 20); glow(p, cx, cy + 14, 60, '#2ee6ff', 0.2, 10);
    for (const [x, c] of [[cx - 74, '#2ee6ff'], [cx + 74, '#ff3ea5'], [cx, '#ffe14d']]) glow(p, x, cy + 8, 14, c, 0.5, 6);
    // floor reflection of the glowing disc + streaks
    reflect(p, cx, cy + 20, cy + 74, 74, (x, y) => ((x + y) % 9 < 4 ? '#ff3ea5' : '#2ee6ff'), 0.4, 4);
    // ---- turntable platform
    p.ellipse(cx, cy + 10, 78, 18, '#0a0716');                                     // contact shadow
    p.ellipse(cx, cy + 6, 74, 17, '#2c2748'); p.rect(cx - 74, cy - 1, 149, 7, '#2c2748');
    p.ellipse(cx, cy + 6, 74, 17, '#241f40');
    // side wall of the platform (cylinder) with lit LED ring
    { const nn = gr(p); for (let X = sc(cx - 74); X <= sc(cx + 74); X++) { const t = (X / K - cx) / 75, hh = Math.sqrt(Math.max(0, 1 - t * t)) * 17, Y0 = Math.round((cy + hh - 1) * K); nn.rect(X, Y0, 1, sc(8), t < -0.2 ? '#46405e' : t < 0.4 ? '#2c2748' : '#1c1838'); nn.px(X, Y0 + sc(8) - 1, '#120d1f'); } }
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, bx = cx + Math.cos(a) * 73, by = cy + 2 + Math.sin(a) * 16 + 3; if (Math.sin(a) > -0.1) { p.rect(bx - 1, by, 3, 2, i % 3 === 0 ? '#2ee6ff' : i % 3 === 1 ? '#ff3ea5' : '#ffe14d'); } }
    p.ellipse(cx, cy, 72, 16, '#3a3560'); p.ellipse(cx, cy, 70, 15, '#18122c');
    // vinyl grooves
    for (let k = 0; k < 7; k++) { const rx = 68 - k * 8, ry = 14.2 - k * 1.8; if (ry > 1) p.ring(cx, cy, rx, ry, k % 2 ? '#241a44' : '#2c2056'); }
    p.ellipse(cx, cy, 14, 3.4, '#a02a78'); p.ellipse(cx, cy, 12, 2.8, '#ff3ea5'); p.ellipse(cx, cy, 4, 1.2, '#fff0c9'); p.px(cx, cy, '#18122c');
    // highlight arc on the vinyl (light from the upper left)
    for (let a = 3.3; a < 4.5; a += 0.012) p.px(cx + Math.cos(a) * 60, cy + Math.sin(a) * 11.6, '#6a5fa0');
    // arm of the turntable at the right edge (decor)
    p.line(cx + 62, cy - 4, cx + 40, cy + 1, '#8a87a8'); p.rect(cx + 60, cy - 7, 6, 5, '#46405e');
    // platform rim light on top
    for (let a2 = 0; a2 < 6.3; a2 += 0.02) { const bx = cx + Math.cos(a2) * 72, by = cy + Math.sin(a2) * 16; p.add(bx, by, a2 > 3.1 ? '#2ee6ff' : '#ff3ea5', 90); }
    // dust
    for (let i = 0; i < 46; i++) { const x = 30 + Math.floor(rr() * 210), y = 40 + Math.floor(rr() * 360); p.add(x, y, i % 3 ? '#fff0c9' : '#b8f6ff', 90 + Math.floor(rr() * 140)); if (i % 7 === 0) { p.add(x + 1, y, '#fff0c9', 60); p.add(x, y + 1, '#fff0c9', 60); } }
    { const rd = rng(77);
      // record shelves on both flanks
      for (const sx of [8, 206]) { p.rect(sx, 240, 56, 3, '#4a2a4c'); p.rect(sx, 240, 56, 1, '#8a5a8c'); let cx = sx + 2; for (let i = 0; i < 9; i++) { const c = ['#a02a78', '#2a8aa0', '#b49a3c', '#6a3b8f', '#3a5fcd'][i % 5]; p.rect(cx, 240 - 22 + (i % 3), 4, 22 - (i % 3), mix(c, '#120a28', 0.35)); p.rect(cx, 240 - 22 + (i % 3), 1, 22 - (i % 3), mix(c, '#fff0c9', 0.2)); cx += 5; } }
      // dim neon arcs
      p.ring(-6, 262, 40, 70, '#7a2a8a'); p.ring(276, 262, 40, 70, '#2a7a9a'); glow(p, 34, 262, 20, '#ff3ea5', 0.25, 60); glow(p, 236, 262, 20, '#2ee6ff', 0.25, 60);
      for (let i = 0; i < 7; i++) sparkle4(p, 24 + rd() * 220, 60 + rd() * 300, i % 2 ? '#ff8ac8' : '#8af0ff');
      grain(p, 0, 338, W, 142, ['#2c1a50', '#4a2a7a'], 0.02, 9);
      // floor cables to the platform
      cable(p, [[44, 396], [70, 410], [100, 414], [120, 410]], '#0e0a1c'); cable(p, [[226, 392], [200, 408], [170, 412], [152, 408]], '#0e0a1c');
    }
    vignette(p, 0, 0, W, H, 0.9);
    return scene('creator', null, p, {
      floorY: cy,
      spots: { hero: { x: cx, y: cy } },
      hotspots: [],
      lights: [
        { x: cx, y: cy, r: 100, color: '#ff3ea5', a: 0.35, flicker: 0.03, kind: 'neon' },
        { x: 28, y: 36, r: 70, color: '#ff3ea5', a: 0.3, flicker: 0.04, kind: 'lamp' },
        { x: 242, y: 36, r: 70, color: '#ff3ea5', a: 0.3, flicker: 0.04, kind: 'lamp' },
        { x: 135, y: 36, r: 90, color: '#fff0c9', a: 0.3, flicker: 0.02, kind: 'lamp' },
      ],
      anim: [{ kind: 'neon_flicker', x: cx, y: cy }],
    });
  });

  /* ================================================================ HOODMAP (neighbourhood map) */
  function hLamp(p, x, y) {          // street lamp: foot at (x,y); returns the head position
    p.rect(x - 1, y - 40, 2, 40, '#46405e'); p.rect(x - 1, y - 40, 1, 40, '#8a87a8'); p.rect(x - 3, y - 2, 6, 2, '#2c2748');
    p.line(x, y - 40, x + 7, y - 44, '#46405e', 2); p.rect(x + 5, y - 46, 8, 4, '#2c2748'); p.rect(x + 6, y - 43, 6, 2, '#fff0c9');
    return { x: x + 9, y: y - 42 };
  }
  function hHydrant(p, x, y) { p.rect(x - 2, y - 8, 5, 8, '#d6304a'); p.rect(x - 2, y - 8, 1, 8, '#ff7a8a'); p.rect(x - 3, y - 10, 7, 3, '#b02440'); p.rect(x - 1, y - 12, 3, 2, '#d6304a'); p.rect(x - 4, y - 6, 2, 3, '#b02440'); p.rect(x + 3, y - 6, 2, 3, '#b02440'); p.rect(x - 3, y, 7, 1, '#120d1f', 90); }
  function hManhole(p, x, y) { p.ellipse(x, y, 7, 3, '#120d1f'); p.ellipse(x, y, 6, 2.5, '#3a3560'); for (let i = -4; i <= 4; i += 2) p.vline(x + i, y - 2, 4, '#241a40'); p.hline(x - 5, y, 11, '#241a40'); p.px(x - 5, y - 1, '#6a6598'); }
  function hCrate(p, x, y, w, h) { p.rect(x, y, w, h, '#a8704c'); p.rect(x, y, w, 1, '#e8b07a'); p.rect(x, y, 1, h, '#c98a5a'); p.rect(x + w - 1, y, 1, h, '#5a3a2a'); p.rect(x, y + h - 1, w, 1, '#5a3a2a'); p.line(x + 1, y + 1, x + w - 2, y + h - 2, '#7a4a30'); p.line(x + w - 2, y + 1, x + 1, y + h - 2, '#7a4a30'); }
  function hBin(p, x, y) { p.rect(x, y - 10, 8, 10, '#5a6a7a'); p.rect(x, y - 10, 8, 2, '#9aaaba'); p.rect(x, y - 10, 1, 10, '#8a9aaa'); p.rect(x + 7, y - 10, 1, 10, '#3a4a5a'); p.rect(x + 2, y - 7, 4, 1, '#3a4a5a'); }
  function hTree(p, x, y, r, rr) {   // base at (x,y)
    p.ellipse(x, y + 1, r * 0.9, r * 0.28, '#0e2a1c'); p.rect(x - 2, y - r * 0.8, 4, r * 0.9, '#5a3a2a'); p.rect(x - 2, y - r * 0.8, 1, r * 0.9, '#8a5a3c');
    const g = [rp('#1f6a3a'), rp('#2f8a4a')];
    for (const [dx, dy, rad] of [[-r * 0.5, -r * 1.05, r * 0.7], [r * 0.5, -r * 1.0, r * 0.7], [0, -r * 1.6, r * 0.8], [0, -r * 1.0, r * 0.9]]) p.shadedEllipse(x + dx, y + dy, rad, rad * 0.85, g[0]);
    p.shadedEllipse(x - r * 0.3, y - r * 1.5, r * 0.45, r * 0.4, g[1]);
    for (let i = 0; i < 14; i++) p.px(x - r + rr() * r * 2, y - r * 2.3 + rr() * r * 1.6, i % 2 ? '#5fbf6a' : '#0f4a2a');
  }
  function hBench(p, x, y) { p.rect(x, y - 6, 14, 2, '#a8704c'); p.rect(x, y - 6, 14, 1, '#e8b07a'); p.rect(x, y - 3, 14, 2, '#8a5a3c'); p.rect(x + 1, y - 1, 2, 3, '#2c2748'); p.rect(x + 11, y - 1, 2, 3, '#2c2748'); }
  function steamPuff(p, x, y, n, a, seed) { const r = rng(seed); for (let k = 0; k < n; k++) glow(p, x + Math.sin(k * 1.3) * 3 + r() * 2, y - k * 5, 5 + k * 1.1, '#e8e4f6', a * (1 - k / (n + 1)), 5 + k * 1.1); }
  function awning(p, x, y, w, h, c1, c2) { for (let i = 0; i < w; i += 5) p.rect(x + i, y, Math.min(5, w - i), h, (i / 5 | 0) % 2 ? c2 : c1); p.rect(x, y, w, 1, '#fff0c9'); for (let i = 0; i < w; i += 5) p.ellipse(x + i + 2, y + h, 2.5, 1.5, (i / 5 | 0) % 2 ? c2 : c1); p.rect(x, y + h - 1, w, 1, '#120d1f', 60); }
  reg('hoodmap', (variant) => {
    const night = variant === 'night', dusk = variant === 'dusk', rr = rng(8808), p = new Z(W, H);
    const wins = [], lamps = [], steams = [];
    // ---- sky and skyline
    band(p, 0, 0, W, 112, night ? '#120a2a' : dusk ? '#3a2060' : '#6aa2f0', night ? '#3a2060' : dusk ? '#ff9a6a' : '#d8ecff', 11);
    if (night) for (let i = 0; i < 36; i++) p.px(Math.floor(rr() * W), Math.floor(rr() * 56), i % 3 ? '#c7bfd8' : '#fff');
    if (night) { p.ellipse(236, 22, 8, 8, '#ffe9a8'); p.ellipse(240, 20, 7, 7, '#1c1238'); p.px(233, 20, '#fff'); } else if (dusk) { p.ellipse(60, 100, 20, 20, '#ffe9a8'); p.ellipse(60, 100, 14, 14, '#fff0c9'); dfill(p, 0, 80, W, 16, '#ffbe55', 1); } else { p.ellipse(220, 28, 12, 12, '#fff0c9'); }
    const skyC = night ? ['#3a2a6a', '#2a1e52', '#1c1438'] : dusk ? ['#6a3a7a', '#52306a', '#3a2252'] : ['#9ab0d8', '#7a92c8', '#6078b0'];
    for (let layer = 0; layer < 3; layer++) { let cx = -4; const base = 118; while (cx < W) { const bw = 8 + Math.floor(rr() * 12), bh = 14 + (2 - layer) * 10 + Math.floor(rr() * 34); p.rect(cx, base - bh, bw, bh + 6, skyC[layer]); if (rr() < 0.3) p.rect(cx + bw / 2, base - bh - 6, 1, 6, skyC[layer]); if (layer === 1) for (let k = 0; k < 4; k++) if (rr() < 0.7) wins.push([cx + 2 + Math.floor(rr() * (bw - 4)), base - bh + 3 + Math.floor(rr() * (bh - 4)), 1, 1, 'sky']); cx += bw; } }
    // ---- ground and cracked asphalt
    p.rect(0, 112, W, H - 112, '#3a3656');
    grain(p, 0, 112, W, H - 112, ['#241f38', '#3a3556', '#1c1a2b'], 0.06, 3);
    const road = (x, y, w, h) => { p.rect(x, y, w, h, '#423e60'); grain(p, x, y, w, h, ['#363250', '#52507a'], 0.05, 5); };
    const walk = (x, y, w, h) => { p.rect(x, y, w, h, '#6a6588'); p.rect(x, y, w, 1, '#9a97b4'); p.rect(x, y + h - 1, w, 1, '#3a3556'); for (let i = x + 8; i < x + w; i += 12) p.vline(i, y + 1, h - 2, '#5a5578'); for (let j = y + 8; j < y + h; j += 12) p.hline(x + 1, j, w - 2, '#5a5578'); grain(p, x, y, w, h, ['#7a7794', '#4a4568'], 0.05, 6); };
    road(0, 156, 206, 30); road(176, 156, 28, 184); road(0, 304, 270, 36); road(0, 458, 270, 22);
    walk(0, 140, 270, 16); walk(0, 186, 204, 6); walk(204, 184, 8, 156); walk(0, 340, 270, 14); walk(48, 190, 8, 114); walk(170, 190, 6, 114); walk(0, 436, 270, 22); walk(204, 232, 66, 12);
    // road markings
    for (let x = 6; x < 196; x += 14) p.rect(x, 170, 7, 1, '#b89a48'); for (let y = 164; y < 336; y += 14) p.rect(190, y, 1, 7, '#b89a48'); for (let x = 6; x < 266; x += 14) p.rect(x, 321, 7, 1, '#b89a48'); for (let x = 6; x < 266; x += 14) p.rect(x, 468, 7, 1, '#9a97b4');
    for (let i = 0; i < 6; i++) p.rect(182 + i * 4, 188, 2, 8, '#8a87a8'); for (let i = 0; i < 7; i++) p.rect(8 + i * 4, 306, 8, 2, '#8a87a8');
    // cracks
    { const rc = rng(404); for (let i = 0; i < 26; i++) { let x = rc() * W, y = [170, 170, 320, 320, 250, 470, 400][i % 7] + (rc() - 0.5) * 20, ang = rc() * 6.28; for (let k = 0; k < 10; k++) { const nx = x + Math.cos(ang) * 4, ny = y + Math.sin(ang) * 2.5; p.line(x, y, nx, ny, '#14121f'); p.px(x + 1, y + 1, '#4a4668'); x = nx; y = ny; ang += (rc() - 0.5) * 1.2; if (rc() < 0.12) p.line(x, y, x + Math.cos(ang + 1.2) * 6, y + Math.sin(ang + 1.2) * 4, '#14121f'); } } }
    // ---- HOME apartment (top left)
    p.rect(10, 70, 90, 34, '#3a2a3c'); p.rect(10, 70, 90, 2, '#6a5a6c'); p.rect(14, 74, 82, 26, '#4a3a4c'); grain(p, 14, 74, 82, 26, ['#2c2030', '#6a5a6c'], 0.1, 15); p.rect(20, 80, 14, 10, '#5a6a7a'); p.ellipse(27, 85, 4, 4, '#2c2748'); p.line(23, 85, 31, 85, '#8a87a8'); p.rect(72, 78, 16, 14, '#6a7a8a'); p.rect(72, 78, 16, 2, '#9aaaba'); p.line(84, 62, 84, 74, '#8a87a8'); p.line(80, 66, 88, 66, '#8a87a8'); p.rect(44, 90, 20, 3, '#2c2030'); p.rect(60, 62, 8, 8, '#3a2a3c'); p.rect(62, 56, 4, 6, '#5a4a5c');   // roof + chimney
    p.rect(10, 104, 90, 40, '#8a3f3f'); for (let y = 104, r = 0; y < 144; y += 5, r++) { p.rect(10, y, 90, 1, '#5b2a35'); for (let x = 10 + (r % 2) * 5; x < 100; x += 10) p.vline(x, y, 5, '#5b2a35'); }
    p.rect(10, 104, 90, 2, '#b4604a'); p.rect(10, 142, 90, 2, '#2c2030'); p.rect(10, 104, 2, 40, '#b4604a'); p.rect(98, 104, 2, 40, '#5b2a35');
    p.rect(100, 112, 30, 32, '#6a3a4c'); p.rect(100, 108, 30, 4, '#3a2a3c'); for (let y = 112, r = 0; y < 144; y += 5, r++) { p.rect(100, y, 30, 1, '#4a2a3c'); }
    for (const wx of [18, 36, 54, 72, 86]) for (const wy of [110, 126]) { if (wx === 54 && wy === 126) continue; p.rect(wx - 1, wy - 1, 11, 11, '#2c2030'); wins.push([wx, wy, 9, 9, 'w']); }
    for (const wx of [106, 118]) { p.rect(wx - 1, 118, 11, 11, '#2c2030'); wins.push([wx, 119, 9, 9, 'w']); }
    p.rect(52, 124, 16, 20, '#1c1030'); p.rect(54, 126, 12, 18, '#2a6a6a'); p.rect(54, 126, 12, 1, '#5aa0a0'); p.rect(62, 134, 2, 2, '#ffe9a8'); p.rect(48, 144, 24, 4, '#8a87a8'); p.rect(50, 148, 20, 3, '#6a6788');
    p.rect(30, 140, 6, 4, '#3a5fcd'); p.rect(102, 136, 4, 8, '#5a6a7a'); p.rect(112, 138, 6, 6, '#2a8a5a');
    // ---- SOUND LAB (left, cyan sign)
    p.rect(0, 190, 48, 16, '#2a3a4a'); p.rect(0, 190, 48, 1, '#5a7a8a'); p.rect(0, 206, 48, 56, '#3a4a5a'); for (let y = 206; y < 262; y += 4) p.rect(0, y, 48, 1, '#2f3e4e'); p.rect(0, 206, 48, 2, '#6a8a9a');
    p.rect(2, 192, 14, 12, '#5a6a7a'); p.ellipse(9, 198, 4, 4, '#2c2748'); p.line(5, 198, 13, 198, '#8a87a8'); p.line(9, 194, 9, 202, '#8a87a8');
    p.rect(4, 220, 40, 14, '#18222c'); p.rect(4, 220, 40, 1, '#2ee6ff'); p.rect(14, 238, 14, 24, '#1c1030'); p.rect(16, 240, 10, 22, '#2a4a6a'); p.rect(24, 250, 2, 2, '#ffe9a8');
    wins.push([32, 238, 10, 10, 'w']); p.rect(31, 237, 12, 12, '#2c3a4a');
    p.rect(6, 264, 36, 2, '#120d1f', 70);
    // ---- BAR (right)
    p.rect(212, 118, 58, 54, '#241a3c'); p.rect(212, 118, 58, 2, '#5a4a7c'); p.rect(216, 122, 50, 46, '#1c1432'); grain(p, 216, 122, 50, 46, ['#2a2048', '#150f28'], 0.08, 8);
    for (const [vx, vy] of [[222, 128], [246, 126]]) { p.rect(vx - 7, vy, 16, 12, '#5a6a7a'); p.rect(vx - 7, vy, 16, 2, '#9aaaba'); p.ellipse(vx + 1, vy + 6, 5, 4, '#2c2748'); p.line(vx - 4, vy + 6, vx + 6, vy + 6, '#8a87a8'); p.line(vx + 1, vy + 2, vx + 1, vy + 10, '#8a87a8'); steams.push([vx + 1, vy - 2]); }
    p.rect(212, 172, 58, 62, '#4a2030'); for (let y = 172, r = 0; y < 234; y += 5, r++) { p.rect(212, y, 58, 1, '#2f1420'); for (let x = 212 + (r % 2) * 6; x < 270; x += 12) p.vline(x, y, 5, '#2f1420'); }
    p.rect(212, 172, 58, 2, '#8a3f4a'); p.rect(212, 232, 58, 2, '#120d1f', 90);
    p.rect(222, 178, 40, 16, '#1c1030'); p.frame(222, 178, 40, 16, '#a02a3a');       // LIVE sign board
    awning(p, 214, 204, 54, 8, '#a02a3a', '#3a1a2a'); p.rect(238, 214, 14, 20, '#1c1030'); p.rect(240, 216, 10, 18, '#6a2a3a'); p.rect(248, 226, 2, 2, '#ffbe55'); wins.push([218, 218, 16, 10, 'w']); wins.push([254, 218, 12, 10, 'w']);
    p.rect(206, 190, 6, 28, '#18222c'); p.rect(207, 191, 4, 26, '#0c1a22'); // vertical neon sign board
    // ---- CORNER SHOP (bottom right)
    p.rect(122, 372, 148, 22, '#1f3a42'); p.rect(122, 372, 148, 2, '#5a8a90'); p.rect(126, 376, 140, 14, '#162a30'); box(p, 232, 378, 16, 12, '#5a6a7a'); p.ellipse(240, 384, 4, 4, '#2c2748'); p.line(236, 384, 244, 384, '#8a87a8'); p.line(240, 380, 240, 388, '#8a87a8');
    p.rect(122, 394, 148, 42, '#3a2a4c'); for (let y = 394; y < 436; y += 4) p.rect(122, y, 148, 1, '#2f2040'); p.rect(122, 394, 148, 2, '#6a5a8c'); p.rect(122, 434, 148, 2, '#120d1f', 80);
    p.rect(132, 380, 76, 14, '#18122c'); p.frame(132, 380, 76, 14, '#ff9a4a');            // sign board
    awning(p, 126, 410, 82, 10, '#ff8a2a', '#fff0c9');
    p.rect(150, 420, 22, 16, '#18122c'); p.rect(152, 422, 18, 14, '#3a2a1c'); wins.push([130, 424, 16, 10, 'w']); wins.push([176, 424, 26, 10, 'w']); p.rect(158, 421, 6, 2, '#ffbe55');
    p.rect(222, 396, 40, 20, '#143a8a'); p.frame(222, 396, 40, 20, '#9fc2ff'); p.rect(214, 398, 6, 38, '#2a4a8a'); p.rect(228, 424, 18, 12, '#5a3a2a');   // NEWS sign + stand
    for (let i = 0; i < 4; i++) p.rect(230 + i * 4, 426, 3, 8, ['#ff3ea5', '#ffe14d', '#2ee6ff', '#fff0c9'][i]);
    p.rect(176, 436, 20, 6, '#3a5fcd'); p.rect(176, 436, 20, 1, '#9fc2ff'); p.rect(180, 430, 12, 6, '#2c4aa0');   // mailbox
    p.rect(258, 420, 8, 16, '#a8704c'); p.rect(258, 420, 8, 1, '#e8b07a');
    // ---- PARK (centre)
    p.rect(52, 190, 120, 114, '#2f5a3a'); p.rect(58, 196, 108, 102, '#2a6a3a'); grain(p, 58, 196, 108, 102, ['#1f4a2c', '#3a8a4a', '#2a5a34'], 0.14, 9);
    for (const [gx, gy, gw, gh] of [[70, 262, 36, 14], [130, 214, 30, 16]]) { p.ellipse(gx + gw / 2, gy + gh / 2, gw / 2, gh / 2, '#256030'); }
    p.rect(110, 196, 6, 102, '#8a7a5a'); p.rect(58, 272, 108, 6, '#8a7a5a'); for (let i = 0; i < 40; i++) p.px(58 + rr() * 108, 272 + rr() * 6, '#a89a78');
    for (let i = 0; i < 10; i++) { p.px(112 + rr() * 2, 196 + rr() * 100, '#a89a78'); }
    // fountain
    p.ellipse(113, 275, 15, 7, '#5a5578'); p.ellipse(113, 273, 15, 7, '#9a97b4'); p.ellipse(113, 274, 12, 5, '#4aa0c8'); dfill(p, 103, 270, 20, 8, '#8ad0e8', 1); p.rect(111, 262, 4, 10, '#8a87a8'); p.ellipse(113, 262, 5, 2, '#9a97b4');
    hTree(p, 84, 238, 14, rr); hTree(p, 150, 232, 14, rr); p.shadedEllipse(76, 292, 12, 7, rp('#1f6a3a')); p.shadedEllipse(150, 290, 12, 7, rp('#1f6a3a'));
    hBench(p, 66, 262); hBench(p, 150, 262); hBench(p, 90, 214, 0);
    hBin(p, 134, 250); p.rect(106, 246, 6, 3, '#a8704c');
    // iron fence + graffiti walls
    p.rect(52, 188, 120, 2, '#18122c'); for (let x = 54; x < 172; x += 6) { p.vline(x, 190, 6, '#2c2748'); p.px(x, 189, '#6a6788'); }
    p.rect(52, 300, 120, 6, '#18122c'); for (const [gx, gw, gc, t] of [[54, 34, '#ff3ea5', 'SMASH'], [92, 28, '#2ee6ff', 'BBH'], [124, 44, '#ffe14d', 'FLOW']]) { p.rect(gx, 288, gw, 14, '#5a5870'); p.rect(gx, 288, gw, 1, '#9a97b4'); p.rect(gx, 301, gw, 1, '#2c2a40'); txt(p, t, gx + 3, 291, gc); txt(p, t, gx + 2, 290, lighten(gc, 0.4)); }
    p.rect(52, 190, 2, 114, '#18122c'); p.rect(170, 190, 2, 114, '#18122c');
    // ---- props: lamps, hydrants, manholes, crates, bins, litter
    lamps.push(hLamp(p, 168, 300)); lamps.push(hLamp(p, 104, 346)); lamps.push(hLamp(p, 154, 432)); lamps.push(hLamp(p, 36, 188));
    hHydrant(p, 20, 262); hHydrant(p, 12, 444); hHydrant(p, 62, 452); hHydrant(p, 214, 342); hHydrant(p, 78, 150);
    for (const [mx, my] of [[110, 166], [190, 262], [82, 396]]) { hManhole(p, mx, my); steams.push([mx, my - 2]); }
    hCrate(p, 8, 280, 10, 10); hCrate(p, 20, 284, 8, 8); hCrate(p, 24, 276, 9, 9); hCrate(p, 8, 400, 12, 12); hCrate(p, 24, 404, 9, 9); hCrate(p, 206, 252, 10, 10); hCrate(p, 220, 262, 8, 8);
    hBin(p, 36, 292); hBin(p, 244, 262); hBin(p, 148, 150); hBin(p, 150, 350);
    p.rect(228, 252, 30, 14, '#2a6a4a'); p.rect(228, 252, 30, 2, '#5aa07a'); p.rect(228, 262, 30, 4, '#1a4a30');   // dumpster
    { const rl = rng(515); for (let i = 0; i < 90; i++) { const x = rl() * W, y = 112 + rl() * 368; p.px(x, y, ['#fff0c9', '#ff6b6b', '#2ee6ff', '#a89a78', '#e8e4f6'][i % 5]); if (i % 4 === 0) p.px(x + 1, y, '#8a87a8'); } }
    // bus-stop sign / street signs
    p.rect(196, 338, 2, 26, '#8a87a8'); p.rect(192, 336, 10, 6, '#2a8a5a'); txt(p, 'ST', 193, 336, '#fffaf0');
    // plaza details
    for (let i = 0; i < 6; i++) p.rect(12 + i * 18, 354, 10, 1, '#fff0c9');
    if (!night && !dusk) addStrip(p, 0, 112, W, H - 112, '#fff0d8', 40);
    vignette(p, 0, 0, W, H, 0.9);
    // ======= grade
    if (night) p.tint('#7c74c8', 0.82); else if (dusk) p.tint('#e8a8b0', 0.5);
    // ======= emissive: windows, neon, lamps, steam
    const litProb = night ? 0.8 : dusk ? 0.5 : 0, wr = rng(77);
    for (const [x, y, w, h, kind] of wins) {
      if (kind === 'sky') { if (litProb && wr() < 0.7) p.px(x, y, '#ffbe55'); continue; }
      const lit = wr() < litProb;
      if (lit) { p.rect(x, y, w, h, '#ffbe55'); p.rect(x, y, w, 2, '#fff0c9'); p.rect(x, y + h - 2, w, 2, '#ff9a4a'); if (w > 8) { p.vline(x + w / 2, y, h, '#8a4a2a'); p.hline(x, y + h / 2, w, '#8a4a2a'); } glow(p, x + w / 2, y + h / 2, w * 1.2, '#ffbe55', 0.55, w * 1.2); }
      else { p.rect(x, y, w, h, night ? '#1c2040' : dusk ? '#4a4a7a' : '#8aa8c8'); p.rect(x, y, w, 1, night ? '#3a4070' : '#d8ecff'); if (w > 8) { p.vline(x + w / 2, y, h, '#2c2a48'); p.hline(x, y + h / 2, w, '#2c2a48'); } if (!night) { p.line(x + 1, y + h - 2, x + 4, y + 2, '#ffffff'); } }
    }
    const neonOn = night || dusk;
    const sign = (s, cx, cy, col, sc2, dull) => { if (neonOn) neon(p, s, cx, cy, col, sc2); else txt(p, s, cx - tw(s, sc2) / 2, cy - 3.5 * sc2 / K * 1.0, mix(col, '#2c2a40', 0.45), { scale: sc2 }); };
    sign('LIVE', 242, 186, '#ff2f4f', 2); if (neonOn) { p.rect(222, 178, 40, 1, '#ff2f4f'); p.rect(222, 193, 40, 1, '#ff2f4f'); }
    sign('B', 209, 198, '#2ee6ff', 1); sign('A', 209, 206, '#2ee6ff', 1); sign('R', 209, 214, '#2ee6ff', 1);
    sign('CORNER SHOP', 170, 387, '#ff9a4a', 1); sign('SOUND LAB', 24, 227, '#2ee6ff', 1); sign('OPEN', 162, 428, '#ff3ea5', 1);
    txt(p, 'NEWS', 228, 402, '#fffaf0');
    for (const [sx, sy] of steams) steamPuff(p, sx, sy, 5, night ? 0.7 : 0.55, sx * 7 + sy);
    if (neonOn) {
      reflect(p, 242, 196, 260, 22, '#ff2f4f', 0.5, 4); reflect(p, 170, 392, 456, 30, '#ff9a4a', 0.4, 4); reflect(p, 24, 232, 300, 14, '#2ee6ff', 0.4, 4);
      glow(p, 242, 186, 40, '#ff2f4f', 0.7, 24); glow(p, 170, 387, 44, '#ff9a4a', 0.6, 20); glow(p, 24, 227, 28, '#2ee6ff', 0.6, 16); glow(p, 160, 428, 40, '#ffbe55', 0.35, 20);
      for (const l of lamps) { beam(p, l.x, l.y + 2, 6, l.x + 2, l.y + 46, 40, '#ffbe55', 0.9); glow(p, l.x + 2, l.y + 44, 26, '#ffbe55', 0.8, 9); glow(p, l.x, l.y, 10, '#fff0c9', 0.8); p.px(l.x, l.y, '#ffffff'); }
      for (const [mx, my] of [[110, 166], [190, 262], [82, 396]]) glow(p, mx, my, 16, '#a86bff', 0.25, 8);
      if (night) glow(p, 113, 270, 28, '#6a7aff', 0.4, 12);
    } else {
      for (const l of lamps) { p.rect(l.x - 3, l.y + 1, 6, 2, '#fff0c9'); }
      glow(p, 220, 28, 40, '#fff0c9', 0.35, 30);
    }
    addDust(p, 0, 112, W, 360, night ? 60 : 36, 55, night ? '#ffd7a0' : '#ffffff');
    const spots = { home: { x: 60, y: 154 }, park: { x: 120, y: 244 }, shop: { x: 200, y: 446 }, studio: { x: 28, y: 270 }, bar: { x: 240, y: 246 } };
    return scene('hoodmap', variant, p, {
      floorY: 330, spots,
      hotspots: [
        { id: 'home', label: 'Home', x: 8, y: 54, w: 124, h: 100 },
        { id: 'park', label: 'Park', x: 50, y: 186, w: 124, h: 120 },
        { id: 'shop', label: 'Corner shop', x: 120, y: 372, w: 150, h: 88 },
        { id: 'studio', label: 'Sound Lab', x: 0, y: 188, w: 50, h: 82 },
        { id: 'bar', label: 'Bar', x: 206, y: 118, w: 64, h: 128 },
      ],
      lights: [
        { x: 60, y: 118, r: 70, color: '#ffbe55', a: night ? 0.5 : dusk ? 0.35 : 0.1, flicker: 0.03, kind: 'window' },
        { x: 242, y: 186, r: 80, color: '#ff2f4f', a: night ? 0.8 : dusk ? 0.5 : 0.1, flicker: 0.1, kind: 'neon' },
        { x: 170, y: 387, r: 80, color: '#ff9a4a', a: night ? 0.7 : dusk ? 0.5 : 0.1, flicker: 0.06, kind: 'neon' },
        { x: 24, y: 227, r: 50, color: '#2ee6ff', a: night ? 0.7 : dusk ? 0.5 : 0.1, flicker: 0.12, kind: 'neon' },
      ].concat(lamps.map((l) => ({ x: l.x, y: l.y, r: 50, color: '#ffbe55', a: night ? 0.6 : dusk ? 0.35 : 0, flicker: 0.02, kind: 'lamp' })).filter((l) => l.a > 0)),
      anim: steams.map(([x, y]) => ({ kind: 'steam', x, y })).concat([{ kind: 'neon_flicker', x: 242, y: 186 }]),
    });
  });


  //@@SCENES@@

  if (typeof module !== 'undefined' && module.exports) module.exports = World;
})(typeof globalThis !== 'undefined' ? globalThis : this);
