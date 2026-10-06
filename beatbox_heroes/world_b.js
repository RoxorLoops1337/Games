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
    mood: (p) => { p.ellipse(5.5, 5.5, 4.5, 4.5, '#ffd23f'); fin(p); p.px(4, 4, KK); p.px(7, 4, KK); p.px(4, 5, KK); p.px(7, 5, KK); p.px(3, 7, KK); p.px(8, 7, KK); p.rect(4, 8, 4, 1, KK); p.px(2, 6, '#ff9a4a'); p.px(9, 6, '#ff9a4a'); },
    cash: (p) => { p.ellipse(5.5, 5.5, 4.5, 4.5, '#ffbe55'); fin(p); p.ellipse(5.5, 5.5, 3, 3, '#d4a017'); p.px(5, 2, '#8a5a1c'); p.px(6, 2, '#8a5a1c'); p.rect(5, 3, 3, 1, '#fff0c9'); p.px(4, 4, '#fff0c9'); p.rect(5, 5, 2, 1, '#fff0c9'); p.px(7, 6, '#fff0c9'); p.rect(4, 7, 3, 1, '#fff0c9'); p.px(5, 9, '#8a5a1c'); p.px(6, 9, '#8a5a1c'); },
    fans: (p) => { p.ellipse(2.5, 6, 1.7, 1.7, '#a86bff'); p.ellipse(8.5, 6, 1.7, 1.7, '#a86bff'); p.ellipse(2.5, 9.5, 2, 1.2, '#a86bff'); p.ellipse(8.5, 9.5, 2, 1.2, '#a86bff'); p.ellipse(5.5, 4, 2.3, 2.3, '#ff6bb5'); p.ellipse(5.5, 8.5, 3.3, 2, '#ff6bb5'); fin(p); p.px(4, 3, WH); },
    level: (p) => { p.poly([[5.5, 0.5], [10, 2.5], [10, 7], [5.5, 10.5], [1, 7], [1, 2.5]], '#2ee6ff'); fin(p, true); p.outline((c) => mix(darken(c, 0.5), '#2c1d4d', 0.5)); p.line(3, 6, 5, 4, WH); p.line(7, 6, 5, 4, WH); p.line(3, 8, 5, 6, '#e8fbff'); p.line(7, 8, 5, 6, '#e8fbff'); },
    mus: (p) => { p.ellipse(4, 8.5, 2.5, 2, '#2ee6ff'); p.rect(6, 1, 2, 8, '#2ee6ff'); p.poly([[8, 1], [11, 3], [11, 6], [8, 4]], '#2ee6ff'); fin(p); p.px(3, 8, WH); },
    tech: (p) => { gearShape(p, '#9fb2d8', 5.5, 5.5, 4.5, 3.4, 8); fin(p); p.ellipse(5.5, 5.5, 1.5, 1.5, '#3a2a63'); p.px(5, 5, '#2ee6ff'); p.px(6, 5, '#2ee6ff'); },
    ori: (p) => { p.ellipse(5.5, 4.5, 3.5, 3.5, '#ffe14d'); p.rect(4, 7, 4, 3, '#a7a3c4'); fin(p); p.hline(4, 8, 4, '#6a6788'); p.px(4, 3, WH); p.px(5, 4, '#ff9a4a'); p.px(6, 5, '#ff9a4a'); p.px(7, 4, '#ff9a4a'); },
    show: (p) => { p.poly([[1, 3], [3.5, 6], [5.5, 2], [7.5, 6], [10, 3], [9.5, 9.5], [1.5, 9.5]], '#ffd23f'); fin(p); p.px(2, 8, '#ff3ea5'); p.px(5, 8, '#2ee6ff'); p.px(8, 8, '#ff3ea5'); p.px(5, 3, WH); },
    lock: (p) => { p.rect(2, 5, 8, 6, '#ffbe55'); p.rect(3, 1, 6, 5, '#a7a3c4'); p.rect(5, 3, 2, 4, '#6a6788'); p.rect(2, 5, 8, 6, '#ffbe55'); fin(p); p.px(5, 7, KK); p.px(6, 7, KK); p.px(5, 8, KK); p.px(6, 8, KK); p.px(5, 9, KK); },
    check: (p) => { p.line(2, 6, 4, 8, '#4fdf6f', 2); p.line(4, 8, 9, 2, '#4fdf6f', 2); fin(p); },
    cross: (p) => { p.line(2, 2, 9, 9, '#ff4f5e', 2); p.line(9, 2, 2, 9, '#ff4f5e', 2); fin(p); },
    heart: (p) => { heartShape(p, '#ff4f6e', 5.5, 5.5, 4.6); fin(p); p.px(3, 3, WH); p.px(2, 4, '#ffd0dc'); },
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
    gear: (p) => { gearShape(p, '#c7bfd8', 5.5, 5.5, 5, 3.6, 8); fin(p); p.ellipse(5.5, 5.5, 1.4, 1.4, '#46405e'); },
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
    shuffle: (p) => { p.line(1, 3, 3, 3, '#2ee6ff'); p.line(3, 3, 7, 8, '#2ee6ff', 2); p.line(1, 9, 3, 9, '#2ee6ff'); p.line(3, 9, 7, 4, '#2ee6ff', 2); p.poly([[7, 7], [11, 8.5], [7, 11]], '#2ee6ff'); p.poly([[7, 1], [11, 2.5], [7, 5]], '#2ee6ff'); fin(p); },
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

  /* ================================================================ HOME */
  reg('home', (variant) => {
    const night = variant === 'night', rr = rng(1701), p = new Z(W, H);
    p.fill('#2c1d4d');
    // ---- bedroom wall + floor
    p.rect(0, 0, W, 206, night ? '#6b3f86' : '#7c4a92');
    for (let x = 0; x < W; x += 12) { p.rect(x, 0, 6, 206, night ? '#744492' : '#8654a0'); dfill(p, x + 6, 0, 1, 206, '#5a3374', 2); }
    for (let y = 8; y < 200; y += 14) for (let x = (y % 28 ? 3 : 9); x < W; x += 12) p.px(x, y, '#9a62b4');
    grain(p, 0, 0, W, 198, ['#5a3374', '#9a62b4', '#6a3f86', '#8654a0'], 0.05, 1);
    for (let y = 10; y < 196; y += 16) for (let x = ((y / 16 | 0) % 2 ? 9 : 3); x < W; x += 12) { p.px(x - 1, y, '#8654a0'); p.px(x + 1, y, '#8654a0'); p.px(x, y - 1, '#8654a0'); p.px(x, y + 1, '#8654a0'); }
    for (let x = 0; x < W; x += 12) p.rect(x + 6, 0, 1, 198, '#5a3374');
    p.rect(0, 198, W, 8, '#3a2260'); p.rect(0, 198, W, 1, '#6a4a9a'); p.rect(0, 205, W, 1, '#241540');
    floorPlanks(p, 0, 206, W, 30, '#a8683f', rr, 6);
    // rug
    p.ellipse(134, 224, 60, 7, '#2a7a86'); p.ellipse(134, 224, 52, 5, '#e0556f'); p.ellipse(134, 224, 40, 3.5, '#ffbe55'); p.ellipse(134, 224, 28, 2, '#2a7a86');
    for (let i = -58; i < 60; i += 4) p.px(134 + i, 224 + Math.round(Math.sqrt(Math.max(0, 1 - (i / 60) ** 2)) * 7), '#fff0c9');
    // slab between floors
    p.rect(0, 236, W, 12, '#241540'); p.rect(0, 236, W, 2, '#5a3a8a'); p.rect(0, 238, W, 1, '#3a2260'); p.rect(0, 246, W, 2, '#150f30');
    for (let x = 6; x < W; x += 30) p.rect(x, 241, 18, 2, '#3a2260');

    // ---- window with curtains
    p.rect(105, 26, 60, 98, '#3a2038'); p.rect(106, 27, 58, 96, '#e8c9a0'); p.rect(107, 28, 56, 94, '#b4804c');
    p.rect(101, 118, 68, 6, '#e8c9a0'); p.rect(101, 118, 68, 1, '#fff0c9'); p.rect(101, 123, 68, 1, '#8a5a3c');   // sill
    // curtains
    const cu = rp('#d6446f');
    for (const [cx0, dir] of [[96, -1], [166, 1]]) {
      p.poly([[cx0 - 1, 22], [cx0 + 11, 22], [cx0 + 9 + dir * 2, 130], [cx0 - 1 + dir * 2, 130]], cu.base);
      for (let k = 0; k < 4; k++) p.vline(cx0 + 1 + k * 3, 24, 104, k % 2 ? cu.shade : cu.light);
    }
    p.rect(92, 20, 86, 3, '#4a2a3c'); p.rect(92, 20, 86, 1, '#8a5a6c'); p.rect(90, 19, 3, 5, '#ffbe55'); p.rect(177, 19, 3, 5, '#ffbe55');

    // ---- posters
    poster(p, 20, 50, 32, 48, 'beat', '#2a1a5a', '#ff3ea5');
    poster(p, 178, 44, 30, 44, 'bass', '#d6446f', '#ffe14d');
    poster(p, 214, 40, 26, 22, 'wave', '#1f3a6a', '#2ee6ff');
    poster(p, 216, 68, 24, 28, 'face', '#e0a43c', '#2a1a5a');
    poster(p, 56, 62, 18, 24, 'record', '#3a5fcd', '#ffbe55');
    p.rect(48, 70, 5, 5, '#ffe14d'); txt(p, '!', 49, 71, '#2a1a5a');         // sticky note
    p.rect(76, 60, 5, 5, '#9dff4a');
    // shelf above desk
    p.rect(176, 106, 86, 4, '#6a3f3c'); p.rect(176, 106, 86, 1, '#a8704c'); p.rect(176, 110, 86, 1, '#3a2038');
    const bk = ['#2ee6ff', '#ff3ea5', '#ffbe55', '#9dff4a', '#a86bff', '#ff6b6b'];
    for (let i = 0; i < 6; i++) box(p, 180 + i * 4, 106 - 12 - (i % 3) * 2, 3, 12 + (i % 3) * 2, bk[i]);
    p.ellipse(214, 99, 6, 6, '#241a3c'); p.ellipse(214, 99, 2, 2, '#ff3ea5'); p.px(211, 96, '#6a5fa0');   // vinyl leaning
    plant(p, 238, 106, 0.6, rr); p.rect(250, 100, 8, 6, '#2a1a3c'); p.rect(251, 101, 6, 1, '#ffbe55'); p.px(254, 103, '#2ee6ff');   // tiny radio
    // hanging plant trailing from shelf
    p.vline(262, 110, 8, '#2f8f5a'); p.vline(261, 116, 8, '#4fbf6f'); p.vline(263, 114, 6, '#2f8f5a');
    // lamp shelf over bed
    p.rect(40, 134, 62, 4, '#6a3f3c'); p.rect(40, 134, 62, 1, '#a8704c');
    box(p, 46, 121, 4, 13, '#ffbe55'); box(p, 51, 124, 3, 10, '#2ee6ff'); box(p, 55, 120, 4, 14, '#ff6b6b');
    p.rect(80, 124, 8, 3, '#8a5a3c'); p.rect(83, 127, 2, 7, '#8a5a3c'); p.poly([[76, 124], [92, 124], [88, 112], [80, 112]], '#ffe9a8'); p.rect(80, 112, 8, 1, '#fff0c9');

    // ---- bed
    const wd = rp('#7a4a3c');
    p.rect(8, 146, 8, 62, wd.base); p.rect(8, 146, 8, 2, wd.light); p.rect(8, 146, 1, 62, wd.light); p.rect(15, 146, 1, 62, wd.shade);
    p.rect(14, 190, 90, 16, wd.shade); p.rect(14, 190, 90, 2, wd.light); p.rect(14, 205, 90, 1, wd.deep); p.rect(100, 204, 4, 4, wd.deep);
    p.rect(16, 172, 86, 20, '#efe6f7'); p.rect(16, 172, 86, 2, '#fffaf0'); p.rect(16, 190, 86, 2, '#c9b8e0');
    p.shadedEllipse(30, 169, 12, 6, rp('#f6eefc'));                       // pillow
    p.line(22, 168, 36, 166, '#c9b8e0'); p.line(24, 172, 38, 171, '#a898c8');
    const bl = rp('#d6446f');
    p.poly([[44, 177], [56, 173], [72, 176], [88, 172], [102, 175], [102, 200], [44, 200]], bl.base);
    p.poly([[44, 177], [56, 173], [72, 176], [88, 172], [102, 175], [102, 177], [88, 174], [72, 178], [56, 175], [44, 179]], bl.light);
    for (let k = 0; k < 5; k++) { const x0 = 50 + k * 11; p.line(x0, 180, x0 + 6, 196, bl.shade); p.line(x0 + 1, 180, x0 + 7, 196, bl.light); }
    for (let y = 183; y < 198; y += 6) dfill(p, 44, y, 58, 2, '#fff0c9', 2);     // stripes dithered
    p.rect(44, 198, 58, 2, bl.deep); p.rect(44, 197, 58, 1, bl.shade);
    for (let x = 46; x < 102; x += 4) p.px(x, 200, bl.shade);
    // fox plush on the bed
    p.ellipse(52, 169, 4, 4, '#ff8a3c'); p.poly([[48, 166], [49, 161], [52, 165]], '#ff8a3c'); p.poly([[56, 166], [55, 161], [52, 165]], '#ff8a3c'); p.rect(50, 169, 5, 2, '#fff0c9'); p.px(50, 167, '#2a1a3c'); p.px(54, 167, '#2a1a3c'); p.px(52, 169, '#2a1a3c');
    // clothes on the floor
    p.ellipse(110, 232, 8, 2, '#3a5fcd'); p.rect(104, 229, 14, 3, '#4a6fdd'); p.line(106, 230, 116, 230, '#7a9aff');
    p.rect(96, 230, 7, 4, '#ff3ea5'); p.rect(96, 230, 7, 1, '#ff8ac8'); p.rect(96, 233, 7, 1, '#2a1a3c');   // sneaker
    // foxy cushion
    p.ellipse(148, 228, 15, 4, '#ff8a3c'); p.ellipse(148, 226, 13, 3, '#ffb36a'); p.ellipse(148, 226, 8, 1.5, '#ff9a4a');

    // ---- desk
    const dk = rp('#8a5a3c');
    p.rect(168, 160, 96, 6, dk.base); p.rect(168, 160, 96, 1, dk.hi); p.rect(168, 166, 96, 1, dk.deep);
    p.rect(172, 166, 5, 40, dk.shade); p.rect(172, 166, 1, 40, dk.base);
    p.rect(228, 166, 36, 40, dk.shade); p.rect(228, 166, 1, 40, dk.light);
    for (let k = 0; k < 3; k++) { p.rect(231, 170 + k * 12, 30, 10, dk.base); p.rect(231, 170 + k * 12, 30, 1, dk.light); p.rect(231, 179 + k * 12, 30, 1, dk.deep); p.rect(243, 173 + k * 12, 6, 2, '#ffbe55'); }
    // pc tower under desk + glowing strip
    p.rect(190, 172, 26, 34, '#2c2748'); p.rect(190, 172, 26, 1, '#4a4478'); p.rect(190, 172, 1, 34, '#4a4478'); p.rect(215, 172, 1, 34, '#18122c');
    p.rect(194, 178, 18, 2, '#18122c'); p.rect(194, 185, 18, 14, '#201a3c');
    for (let i = 0; i < 16; i += 2) p.rect(196 + i, 197, 1, 1, '#ff3ea5');
    // cables
    cable(p, [[204, 206], [214, 212], [232, 211], [250, 216]], '#18122c'); cable(p, [[196, 160], [190, 170], [182, 190], [184, 206]], '#18122c');
    // keyboard, mouse
    p.rect(188, 157, 32, 3, '#3a3560'); p.rect(188, 157, 32, 1, '#6a6598'); for (let i = 0; i < 15; i++) p.px(189 + i * 2, 158, '#18122c');
    p.rect(226, 158, 4, 2, '#3a3560');
    // monitor
    p.rect(214, 150, 6, 8, '#2c2748'); p.rect(206, 157, 22, 3, '#2c2748'); p.rect(206, 157, 22, 1, '#4a4478');
    p.rect(192, 118, 50, 34, '#2c2748'); p.rect(192, 118, 50, 1, '#6a6598'); p.rect(192, 118, 1, 34, '#4a4478'); p.rect(241, 118, 1, 34, '#18122c'); p.rect(192, 151, 50, 1, '#18122c');
    // screen painted in the emissive pass (below)
    // desk lamp-less; headphones hanging off the monitor
    p.ring(246.5, 134, 6, 8, '#2c2748'); p.ring(246.5, 134, 5, 7, '#3a3560');
    p.rect(240, 138, 5, 9, '#ff3ea5'); p.rect(240, 138, 1, 9, '#ff8ac8'); p.rect(248, 138, 5, 9, '#ff3ea5'); p.rect(252, 138, 1, 9, '#a0205a'); p.rect(241, 146, 3, 1, '#a0205a');
    // condenser mic on boom arm + pop filter
    p.rect(178, 156, 14, 4, '#2c2748'); p.rect(184, 128, 2, 29, '#8a87a8'); p.line(185, 130, 197, 126, '#8a87a8');
    p.rect(195, 124, 6, 8, '#c7bfd8'); p.rect(195, 124, 2, 8, '#fff'); p.rect(200, 124, 1, 8, '#6a6788'); dfill(p, 196, 126, 4, 5, '#6a6788', 2);
    p.ring(199, 136, 4, 4, '#2c2748'); p.ring(199, 136, 3, 3, '#4a4478');
    // small speaker left of desk
    box(p, 170, 130, 14, 26, '#3a3560'); p.ellipse(176.5, 143, 4, 4, '#18122c'); p.ellipse(176.5, 143, 2, 2, '#6a6598'); p.ellipse(176.5, 136, 2, 2, '#18122c');
    // coffee/tea mug + notebook
    cup(p, 222, 158, '#fff0c9', 5, 6); p.px(224, 152, '#c7bfd8'); p.px(223, 150, '#c7bfd8');
    // beanbag chair silhouette next to desk is skipped; floor items
    p.rect(264, 195, 6, 12, '#2c2748');

    // ---- bedroom detail pass
    { const rd = rng(88);
      books(p, 58, 134, 4, rd, 11); p.ellipse(96, 133, 3, 1, '#2a1a3c');
      // photo string with clothes pegs
      p.line(14, 30, 98, 36, '#2a1a3c');
      [['#ff8ac8', 22, 31], ['#6fcf6f', 40, 32], ['#7fb2ff', 58, 33], ['#ffbe55', 76, 34]].forEach(([c, x, y], i) => { p.rect(x, y, 9, 11, '#fffaf0'); p.rect(x + 1, y + 1, 7, 7, c); p.px(x + 3, y + 3, '#fffaf0'); p.rect(x + 2, y + 6, 5, 2, mix(c, '#2a1a3c', 0.4)); p.rect(x + 3, y - 1, 3, 2, '#c98a5a'); });
      // desk props
      box(p, 244, 153, 12, 7, '#ff6b6b'); p.rect(246, 155, 8, 1, '#fff0c9'); cup(p, 258, 160, '#2ee6ff', 5, 6); p.px(257, 152, '#ffe14d'); p.px(259, 153, '#ff3ea5'); p.px(260, 152, '#9dff4a');
      p.rect(194, 119, 4, 4, '#ffe14d'); p.rect(237, 119, 4, 4, '#ff8ac8'); p.px(195, 120, '#a02a58'); p.px(238, 120, '#a02a58');
      for (let r = 0; r < 2; r++) for (let k = 0; k < 15; k++) p.px(189 + k * 2, 157.5 + r, k % 5 === 2 ? '#ff3ea5' : '#8a87a8');
      streaks(p, 168, 160, 96, 6, ['#a8704c', '#7a4a30'], 12, 8, 4); streaks(p, 228, 166, 36, 40, ['#9a6a44', '#6a3a28'], 10, 8, 5);
      // blanket weave + stitching
      dfill(p, 44, 176, 58, 22, '#a02a58', 1); for (let x = 46; x < 100; x += 6) p.px(x, 198, '#ff8aa8');
      p.line(18, 172, 34, 172, '#fffaf0'); p.line(20, 175, 32, 175, '#e6dcf4');
      // shadows under furniture
      p.rect(8, 206, 100, 2, '#241540', 120); p.rect(170, 206, 96, 2, '#241540', 120);
      streaks(p, 8, 150, 6, 56, ['#9a6a4c', '#5a3a2a'], 6, 5, 6);
      // plant by the bed
      plant(p, 112, 214, 0.9, rng(14));
      addDust(p, 90, 110, 70, 90, 28, 41);
    }
    // ---- string lights
    const bulbsA = stringLights(p, 4, 8, 134, 12, 12, ['#ffbe55', '#ff3ea5', '#2ee6ff', '#9dff4a'], 9, rr);
    const bulbsB = stringLights(p, 134, 12, 266, 8, 11, ['#ff3ea5', '#ffe14d', '#2ee6ff', '#ffbe55'], 9, rr);

    // ============ LOWER ROOM ============
    p.rect(0, 248, W, 192, night ? '#3f7d88' : '#4f8f94');
    for (let x = 0; x < W; x += 10) p.rect(x, 248, 1, 192, night ? '#38727e' : '#478890');
    p.rect(0, 432, W, 8, '#2a4a5a'); p.rect(0, 432, W, 1, '#6aa0a8'); p.rect(0, 439, W, 1, '#1a3040');
    floorPlanks(p, 0, 440, W, 40, '#9a5a38', rr, 8);
    // rug
    p.ellipse(130, 462, 64, 10, '#2a1a5a'); p.ellipse(130, 462, 59, 8, '#ff3ea5'); p.ellipse(130, 462, 50, 6.5, '#2ee6ff'); p.ellipse(130, 462, 41, 5, '#ffbe55'); p.ellipse(130, 462, 30, 3.5, '#43296f');
    for (let i = -60; i <= 60; i += 3) p.px(130 + i, 462 + Math.round(Math.sqrt(Math.max(0, 1 - (i / 64) ** 2)) * 10), '#fff0c9');
    grain(p, 0, 250, W, 182, ['#38727e', '#5aa0a4', '#2f6a74'], 0.04, 2);
    // kitchen window
    p.rect(58, 262, 40, 52, '#3a2038'); p.rect(59, 263, 38, 50, '#e8c9a0');
    p.rect(54, 312, 48, 4, '#e8c9a0'); p.rect(54, 312, 48, 1, '#fff0c9'); p.rect(54, 315, 48, 1, '#8a5a3c');
    // fridge
    const fr = rp('#9fe8d0');
    p.rect(8, 296, 38, 142, fr.base); p.rect(8, 296, 38, 2, fr.light); p.rect(8, 296, 2, 142, fr.light); p.rect(44, 296, 2, 142, fr.shade); p.rect(8, 436, 38, 2, fr.deep);
    p.rect(8, 338, 38, 2, fr.deep); p.rect(38, 306, 3, 24, '#c7bfd8'); p.rect(38, 346, 3, 40, '#c7bfd8'); p.rect(38, 306, 1, 24, '#fff');
    for (const [mx, my, mc] of [[14, 308, '#ff3ea5'], [22, 316, '#ffe14d'], [16, 350, '#2ee6ff'], [26, 360, '#9dff4a']]) p.rect(mx, my, 4, 4, mc);
    p.rect(14, 322, 12, 10, '#fff0c9'); p.line(15, 330, 18, 325, '#ff6b6b'); p.line(18, 325, 22, 329, '#3a5fcd');       // kid-style drawing
    txt(p, 'EAT', 14, 372, '#2a7a4a', { scale: 1 }); p.px(30, 380, '#ff3ea5');
    // counter
    const cn = rp('#c98a5a');
    p.rect(46, 372, 84, 66, cn.base); p.rect(46, 372, 84, 2, cn.light);
    for (let k = 0; k < 3; k++) { p.rect(49 + k * 27, 378, 24, 54, cn.shade); p.rect(50 + k * 27, 379, 22, 52, cn.base); p.rect(50 + k * 27, 379, 22, 1, cn.light); p.rect(58 + k * 27, 384, 6, 2, '#ffe9a8'); }
    p.rect(46, 436, 84, 2, cn.deep);
    p.rect(44, 364, 88, 8, '#e8c98a'); p.rect(44, 364, 88, 1, '#fff0c9'); p.rect(44, 371, 88, 1, '#8a5a3c');      // top
    // backsplash tiles
    for (let y = 318; y < 364; y += 6) for (let x = 46; x < 130; x += 8) { p.rect(x + ((y / 6 | 0) % 2 ? 4 : 0), y, 7, 5, '#f6ecd6'); p.rect(x + ((y / 6 | 0) % 2 ? 4 : 0), y + 4, 7, 1, '#d4c4a4'); }
    p.rect(46, 316, 84, 2, '#c7b490');
    // kettle, blender, fruit bowl, board
    p.ellipse(60, 352, 7, 7, '#9fb2d8'); p.rect(53, 352, 14, 12, '#9fb2d8'); p.rect(53, 352, 3, 12, '#d8e4ff'); p.rect(65, 352, 2, 12, '#6a7aa8'); p.rect(52, 363, 16, 1, '#4a5a88'); p.rect(58, 343, 4, 2, '#4a5a88'); p.line(68, 348, 73, 345, '#6a7aa8'); p.rect(70, 345, 3, 3, '#6a7aa8');
    p.rect(80, 358, 10, 6, '#3a3560'); p.rect(81, 335, 8, 24, '#cfeaf0'); p.rect(81, 345, 8, 14, '#6fcf6f'); p.rect(81, 345, 8, 2, '#9dff4a'); p.rect(81, 335, 2, 24, '#fff'); p.rect(80, 332, 10, 3, '#3a3560'); p.px(88, 361, '#ff3ea5');
    p.ellipse(110, 362, 12, 3, '#d6446f'); p.rect(98, 358, 24, 4, '#d6446f'); p.rect(98, 358, 24, 1, '#ff8aa8');
    fruit(p, 104, 356, 4, '#ff9a4a'); fruit(p, 112, 355, 4, '#ff4f5e'); fruit(p, 118, 357, 3, '#9dff4a'); p.line(100, 356, 118, 352, '#ffe14d', 2); p.line(106, 352, 120, 354, '#e8c43a');
    p.px(118, 352, '#6f3d2b');
    // jars / shelf above fridge area
    p.rect(8, 270, 38, 4, '#6a3f3c'); p.rect(8, 270, 38, 1, '#a8704c');
    for (let i = 0; i < 4; i++) { p.rect(12 + i * 9, 258, 7, 12, '#cfeaf0'); p.rect(13 + i * 9, 262 + (i % 2), 5, 8 - (i % 2), ['#ffbe55', '#9a5a3c', '#ff6b6b', '#6fcf6f'][i]); p.rect(12 + i * 9, 256, 7, 2, '#c9577f'); }
    // clock + wall calendar
    p.ellipse(116, 276, 9, 9, '#fff0c9'); p.ring(116, 276, 9, 9, '#3a2038'); p.vline(116, 270, 7, '#3a2038'); p.hline(116, 277, 5, '#3a2038'); p.px(116, 277, '#d6446f');
    // wall cabinet
    box(p, 104, 292, 28, 20, '#c98a5a'); p.rect(117, 296, 1, 14, '#8a5a3c'); p.rect(114, 300, 2, 4, '#ffe9a8'); p.rect(119, 300, 2, 4, '#ffe9a8');
    // wardrobe with mirror
    const wr = rp('#8a4a3c');
    p.rect(142, 322, 48, 116, wr.base); p.rect(142, 322, 48, 3, wr.light); p.rect(142, 322, 2, 116, wr.light); p.rect(188, 322, 2, 116, wr.shade); p.rect(140, 318, 52, 5, wr.deep); p.rect(140, 318, 52, 1, wr.base);
    p.rect(146, 328, 18, 100, wr.shade); p.rect(147, 329, 16, 98, wr.base); p.rect(147, 329, 16, 1, wr.light); p.rect(147, 329, 1, 98, wr.light);
    p.rect(168, 328, 18, 100, wr.shade); p.rect(169, 329, 16, 98, '#241540'); mirrorGlass(p, 170, 330, 14, 96, night);
    p.rect(164, 372, 2, 8, '#ffe9a8'); p.rect(167, 372, 2, 8, '#ffe9a8'); p.rect(142, 436, 6, 4, wr.deep); p.rect(184, 436, 6, 4, wr.deep);
    p.rect(150, 308, 22, 10, '#c9577f'); p.rect(150, 308, 22, 2, '#ff8aa8'); p.rect(150, 315, 22, 3, '#8a2a50');   // hat box on top
    p.rect(176, 304, 14, 14, '#2ee6ff'); p.rect(176, 304, 14, 1, '#b8f6ff'); p.rect(176, 316, 14, 2, '#1f8aa8');
    p.rect(150, 331, 12, 3, '#ffbe55');  // hanging scarf peeking out
    // door
    const dr = rp('#c9577f');
    p.rect(204, 306, 56, 134, '#3a2038'); p.rect(206, 308, 52, 132, dr.base); p.rect(206, 308, 52, 2, dr.light); p.rect(206, 308, 2, 132, dr.light); p.rect(256, 308, 2, 132, dr.shade);
    for (const [bx, by, bw, bh] of [[212, 316, 40, 40], [212, 366, 40, 62]]) { p.rect(bx, by, bw, bh, dr.shade); p.rect(bx + 1, by + 1, bw - 2, bh - 2, dr.base); p.rect(bx + 1, by + 1, bw - 2, 1, dr.deep); p.rect(bx + 1, by + 1, 1, bh - 2, dr.deep); p.rect(bx + bw - 2, by + 1, 1, bh - 2, dr.light); }
    p.rect(216, 322, 32, 20, night ? '#3a2a6e' : '#ffbe55'); dfill(p, 216, 322, 32, 8, night ? '#5a4a9e' : '#fff0c9', 2); p.rect(231, 322, 2, 20, dr.base);
    p.ellipse(246, 394, 3, 3, '#ffe9a8'); p.px(245, 393, '#fff'); p.ellipse(231, 351, 2, 2, '#2a1a3c');   // knob, peephole
    txt(p, '4B', 222, 357, '#ffe9a8');
    // doormat + shoes + coat hooks
    p.rect(214, 444, 36, 10, '#2a1a5a'); p.rect(214, 444, 36, 1, '#6a5fa0'); txt(p, 'HI', 224, 446, '#ffe14d');
    p.rect(192, 334, 11, 2, '#8a87a8'); p.poly([[193, 336], [201, 336], [202, 368], [192, 368]], '#3a5fcd'); p.rect(193, 336, 2, 32, '#5a7aff'); p.rect(199, 336, 2, 32, '#2c4aa0');
    p.rect(200, 436, 8, 4, '#ff3ea5'); p.rect(200, 436, 8, 1, '#ffb0dd');
    // hanging plant + bike? string: little hanging bulbs in kitchen
    for (let i = 0; i < 9; i++) p.px(10 + i * 4, 252 + Math.round(Math.sin(i / 8 * Math.PI) * 5), '#2a1a3c');
    { const rd = rng(99);
      streaks(p, 8, 296, 38, 142, ['#c4f4e4', '#8fd8c4'], 14, 8, 7);
      streaks(p, 46, 378, 84, 54, ['#d89a62', '#a8703c'], 22, 10, 8); streaks(p, 142, 328, 46, 108, ['#9a5a3c', '#6a3028'], 20, 9, 9); streaks(p, 206, 308, 52, 130, ['#d85a88', '#a83a64'], 20, 9, 10);
      for (let x = 46; x < 130; x += 8) p.px(x + 4, 319, '#ffffff');
      // bananas in the bowl
      p.line(96, 358, 108, 352, '#ffe14d', 2); p.line(98, 360, 110, 354, '#e8c43a'); p.px(95, 357, '#6f3d2b'); p.px(110, 352, '#6f3d2b');
      // utensil rail
      p.rect(104, 326, 24, 1, '#8a87a8'); for (const [ux, uc] of [[108, '#c7bfd8'], [114, '#ffbe55'], [121, '#c7bfd8']]) { p.vline(ux, 327, 12, uc); p.ellipse(ux, 341, 2, 2, uc); }
      // herbs and a cutting board
      p.rect(112, 360, 14, 3, '#c98a5a'); p.px(114, 359, '#ff9a4a'); p.px(115, 359, '#ff9a4a'); p.px(118, 359, '#6fcf6f'); p.px(119, 359, '#6fcf6f');
      // fridge shopping list + more magnets
      p.rect(28, 350, 10, 12, '#fffaf0'); for (let k = 0; k < 4; k++) p.hline(29, 352 + k * 2, 7 - (k % 2) * 2, '#6a5fa0'); p.px(33, 349, '#ff3ea5');
      // rug fringe
      for (let i = -62; i <= 62; i += 3) { const yy = 462 + Math.round(Math.sqrt(Math.max(0, 1 - (i / 66) ** 2)) * 10.5); p.px(130 + i, yy + 1, '#fff0c9'); }
      // door details
      p.hline(214, 330, 36, '#8a2a50'); p.px(244, 392, '#ffe9a8'); p.vline(210, 330, 20, '#c7bfd8'); p.rect(246, 350, 4, 2, '#ffe9a8');
      // wall plate / light switch
      p.rect(196, 392, 4, 6, '#fff0c9'); p.px(197, 394, '#8a87a8'); p.px(198, 394, '#8a87a8');
      addDust(p, 56, 262, 60, 60, 20, 42);
    }
    // lower vignette
    vignette(p, 0, 248, W, 192, 0.8);
    vignette(p, 0, 0, W, 236, 0.9);

    // ============ GRADE + EMISSIVE ============
    if (night) {
      p.tint('#7b6fc6', 0.92);
      // lamp-lit zones return in the emissive pass
    }
    // window glass, blinds and sill plants are painted after the grade so they stay bright
    citySky(p, 109, 30, 52, 76, night, rng(1701), [{ c: '#ff3ea5' }, { c: '#2ee6ff' }]);
    const mull = night ? '#9a8ab0' : '#e8c9a0', mullHi = night ? '#c7bfd8' : '#fff0c9';
    p.rect(133, 30, 3, 76, mull); p.rect(109, 66, 52, 3, mull); p.rect(133, 30, 1, 76, mullHi); p.rect(109, 66, 52, 1, mullHi);
    venetian(p, 109, 30, 52, 22, night ? '#6a5f9a' : '#d8c8e8');
    plant(p, 150, 118, 0.7, rng(5));
    citySky(p, 61, 265, 34, 44, night, rng(9), null);
    p.rect(77, 265, 2, 44, mull); p.rect(61, 285, 34, 2, mull);
    plant(p, 66, 312, 0.6, rng(6));
    for (let i = 0; i < 3; i++) p.rect(86 + i * 4, 306, 3, 6, ['#ffbe55', '#9dff4a', '#ff6b6b'][i]);
    // monitor screen (emissive)
    p.rect(195, 121, 44, 28, '#15102b');
    p.rect(195, 121, 44, 4, '#2c2060'); for (let i = 0; i < 5; i++) p.px(198 + i * 5, 123, ['#ff3ea5', '#2ee6ff', '#9dff4a', '#ffe14d', '#a86bff'][i]);
    const tr = [['#ff3ea5', 3, 20], ['#2ee6ff', 14, 24], ['#9dff4a', 6, 14], ['#ffe14d', 22, 14]];
    tr.forEach(([c, x0, w0], i) => { p.rect(197 + x0, 127 + i * 5, w0, 4, c); p.rect(197 + x0, 127 + i * 5, w0, 1, lighten(c, 0.5)); for (let k = 2; k < w0 - 1; k += 2) p.px(197 + x0 + k, 129 + i * 5, '#15102b'); });
    p.vline(213, 125, 24, '#fffaf0');
    // night glow pools / day light shafts
    if (night) {
      glow(p, 217, 138, 54, '#8a6bff', 0.8, 40); glow(p, 217, 138, 24, '#ff3ea5', 0.5, 20);
      glow(p, 84, 118, 62, '#ffbe55', 0.95, 52);
      glow(p, 134, 66, 70, '#6a7aff', 0.45, 60); glow(p, 134, 96, 34, '#ff3ea5', 0.25, 20);
      glow(p, 78, 292, 38, '#6a7aff', 0.5, 40);
      p.poly([[76, 124], [92, 124], [88, 112], [80, 112]], '#fff0c9'); p.rect(80, 112, 8, 2, '#ffffff');
      glow(p, 20, 330, 40, '#ffbe55', 0.2, 60);
    } else {
      beam(p, 124, 108, 14, 66, 226, 20, '#ffbe55', 0.8); beam(p, 140, 108, 12, 96, 226, 18, '#ffbe55', 0.7); beam(p, 154, 108, 10, 128, 226, 16, '#ffbe55', 0.6);
      glow(p, 134, 70, 80, '#ffbe55', 0.55, 66); glow(p, 217, 138, 36, '#2ee6ff', 0.3, 26);
      glow(p, 78, 292, 44, '#ffbe55', 0.5, 40); glow(p, 134, 456, 70, '#ffbe55', 0.2, 20);
    }
    paintBulbs(p, bulbsA, true); paintBulbs(p, bulbsB, true);
    return scene('home', variant, p, {
      floorY: 456,
      spots: { stand: { x: 135, y: 456 }, bed: { x: 62, y: 226 }, desk: { x: 214, y: 228 }, kitchen: { x: 72, y: 456 }, wardrobe: { x: 166, y: 456 }, foxy: { x: 148, y: 230 } },
      hotspots: [
        { id: 'bed', label: 'Bed', x: 6, y: 144, w: 100, h: 66 },
        { id: 'desk', label: 'Desk', x: 166, y: 114, w: 98, h: 94 },
        { id: 'kitchen', label: 'Kitchen', x: 6, y: 254, w: 126, h: 184 },
        { id: 'wardrobe', label: 'Wardrobe', x: 140, y: 318, w: 52, h: 120 },
        { id: 'door', label: 'Door', x: 204, y: 306, w: 56, h: 134 },
      ],
      lights: [
        { x: 84, y: 118, r: 64, color: '#ffbe55', a: 0.5, flicker: 0.04, kind: 'lamp' },
        { x: 217, y: 138, r: 70, color: '#a86bff', a: 0.5, flicker: 0.06, kind: 'screen' },
        { x: 134, y: 66, r: 90, color: night ? '#6a7aff' : '#ffbe55', a: night ? 0.35 : 0.45, flicker: 0, kind: 'window' },
        { x: 70, y: 22, r: 50, color: '#ffbe55', a: 0.3, flicker: 0.1, kind: 'lamp' },
        { x: 200, y: 20, r: 50, color: '#ff3ea5', a: 0.3, flicker: 0.1, kind: 'lamp' },
        { x: 78, y: 292, r: 40, color: night ? '#6a7aff' : '#ffbe55', a: 0.3, flicker: 0, kind: 'window' },
      ],
      anim: [{ kind: 'steam', x: 66, y: 342 }, { kind: 'neon_flicker', x: 134, y: 96 }],
    });
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

  //@@SCENES@@

  if (typeof module !== 'undefined' && module.exports) module.exports = World;
})(typeof globalThis !== 'undefined' ? globalThis : this);
