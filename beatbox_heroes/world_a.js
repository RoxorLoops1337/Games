// BEATBOX HEROES -- world_a.js
// BBH.World part A: title key art, logo, neon text, the 1080x640 street (day/dusk/night), the park, intro plates 1..6.
// Part B (world_b.js) adds interiors/stage/creator/icons/fx into the same BBH.World through World.builders.
//
// RESOLUTION: the game grid is 360x640. Scenes are painted at native density: the painters work in a 270x480 "design"
// space through the SP wrapper (every rect/line/polygon/ellipse is re-rasterised crisp at x4/3, no interpolation),
// while texture, dithering, glow, brick, reflection and grime passes run directly on native pixels. All coordinates
// in the returned scene objects (spots, hotspots, lights, anim) are native.
//
// PARALLAX RULE (street): a layer with speed s < 1 has a Pix of width 360 + (1080 - 360) * s, so that for a camera
// scroll cx in 0..720 the layer is drawn at x = -cx * s and always covers the 360 px viewport. Layer speed 1 is 1080 wide.
// Everything is deterministic (BBH.rng with fixed seeds) and cached in World.cache.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined' && !BBH.Pix) require('./pix.js');
  if (typeof require !== 'undefined' && !BBH.Font) require('./font.js');
  const { Pix, PAL, C, mix, ramp, lighten, darken, rng, clamp, lerp } = BBH;
  const Font = BBH.Font;
  const World = BBH.World = BBH.World || {};
  World.builders = World.builders || {};
  World.cache = World.cache || {};

  World.scene = function (id, variant) {
    const key = id + ':' + (variant || '');
    if (World.cache[key]) return World.cache[key];
    const b = World.builders[id];
    if (!b) throw new Error('BBH.World.scene: unknown scene id "' + id + '"');
    const s = b(variant);
    World.cache[key] = s;
    return s;
  };

  /* ------------------------------------------------------------------ scale wrapper */
  const S = 4 / 3, R = Math.round;
  const sc_ = (v) => R(v * S);
  // SP: a Pix-like painter in 270x480 design units. Every primitive is rasterised natively at x4/3 (crisp, no filtering).
  class SP {
    constructor(w, h) { this.S = S; this.w = w; this.h = h; this.raw = new Pix(R(w * S), R(h * S)); }
    px(x, y, c, a) { this.raw.px(R(x * S), R(y * S), c, a); return this; }
    add(x, y, c, a) { this.raw.add(R(x * S), R(y * S), c, a); return this; }
    get(x, y) { return this.raw.get(R(x * S), R(y * S)); }
    alphaAt(x, y) { return this.raw.alphaAt(R(x * S), R(y * S)); }
    rect(x, y, w, h, c, rep) { const x0 = R(x * S), y0 = R(y * S); this.raw.rect(x0, y0, Math.max(1, R((x + w) * S) - x0), Math.max(1, R((y + h) * S) - y0), c, rep); return this; }
    hline(x, y, w, c) { const x0 = R(x * S); this.raw.rect(x0, R(y * S), Math.max(1, R((x + w) * S) - x0), 1, c); return this; }
    vline(x, y, h, c) { const y0 = R(y * S); this.raw.rect(R(x * S), y0, 1, Math.max(1, R((y + h) * S) - y0), c); return this; }
    frame(x, y, w, h, c) { const x0 = R(x * S), y0 = R(y * S); this.raw.frame(x0, y0, Math.max(2, R((x + w) * S) - x0), Math.max(2, R((y + h) * S) - y0), c); return this; }
    line(x0, y0, x1, y1, c, t) { this.raw.line(R(x0 * S), R(y0 * S), R(x1 * S), R(y1 * S), c, t); return this; }
    ellipse(cx, cy, rx, ry, c) { this.raw.ellipse(cx * S, cy * S, rx * S, ry * S, c); return this; }
    shadedEllipse(cx, cy, rx, ry, rp, lx, ly) { this.raw.shadedEllipse(cx * S, cy * S, rx * S, ry * S, rp, lx, ly); return this; }
    ring(cx, cy, rx, ry, c) { this.raw.ring(cx * S, cy * S, rx * S, ry * S, c); return this; }
    poly(pts, c) { this.raw.poly(pts.map((q) => [q[0] * S, q[1] * S]), c); return this; }
    blit(src, dx, dy, o) { this.raw.blit(src.raw || src, R(dx * S), R(dy * S), o); return this; }
    fill(c) { this.raw.fill(c); return this; }
  }
  const mk = (w, h) => new SP(w, h);
  const NP = (p) => p.raw || p;
  // font in design coordinates: scale 1 stays 1 (finer signs), scale 2 becomes 3, etc.
  const fs = (sc) => (sc <= 1 ? 1 : sc === 2 ? 3 : R(sc * S));
  function FD(p, str, x, y, color, o) {
    o = Object.assign({}, o || {}); const sc = fs(o.scale || 1); o.scale = sc;
    if (o.shadow === null) delete o.shadow;
    Font.draw(NP(p), str, R(x * S), R(y * S), color, o); return p;
  }
  const FW = (str, sc) => Font.width(String(str), fs(sc), 1) / S;      // text width in design units
  const FH = (sc) => 7 * fs(sc) / S;

  /* ------------------------------------------------------------------ low level helpers (native, params in design units) */
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;      // ordered dither threshold 0..1 (native coords)
  const PI = Math.PI;
  function setpx(p, x, y, k) {
    if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
    const i = (y * p.w + x) * 4, d = p.data; d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = 255;
  }
  // fill a design-unit box natively: fn(u, v, nx, ny) -> colour | null, u/v 0..1 inside the box
  function fillFn(p, x, y, w, h, fn) {
    const r = NP(p), x0 = R(x * S), y0 = R(y * S), x1 = R((x + w) * S), y1 = R((y + h) * S);
    for (let ny = y0; ny < y1; ny++) for (let nx = x0; nx < x1; nx++) { const c = fn((nx - x0) / Math.max(1, x1 - x0 - 1), (ny - y0) / Math.max(1, y1 - y0 - 1), nx, ny); if (c) { if (c.length === 5) r.px(nx, ny, c[0], c[4]); else r.px(nx, ny, c); } }
  }
  // vertical banded gradient with ordered dither between stops [[t,color],...]
  function vgrad(p, x, y, w, h, stops, soft) {
    soft = soft || 2.2; const r = NP(p), ks = stops.map((s) => C(s[1])), x0 = R(x * S), y0 = R(y * S), W = R((x + w) * S) - x0, H = R((y + h) * S) - y0;
    for (let j = 0; j < H; j++) {
      const t = H > 1 ? j / (H - 1) : 0; let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
      const t0 = stops[i][0], t1 = stops[i + 1][0], f = clamp(((t - t0) / Math.max(1e-6, t1 - t0) - 0.5) * soft + 0.5, 0, 1);
      for (let k = 0; k < W; k++) setpx(r, x0 + k, y0 + j, bay(x0 + k, y0 + j) < f ? ks[i + 1] : ks[i]);
    }
  }
  // dithered additive radial glow (a = strength 0..1). sx/sy stretch the ellipse. r in design units.
  function glow(p, cx, cy, r, color, a, o) {
    o = o || {}; const q = NP(p); cx *= S; cy *= S; r *= S;
    const rx = r * (o.sx || 1), ry = r * (o.sy || 1), L = o.levels || 6, k = C(color);
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = Math.max(0, y0); y <= Math.min(q.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(q.w - 1, x1); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d2 = dx * dx + dy * dy; if (d2 >= 1) continue;
      let v = 1 - Math.sqrt(d2); v = v * v * a;
      const lv = Math.floor(v * L + bay(x, y)) / L; if (lv <= 0) continue;
      if (o.over) q.px(x, y, k, Math.min(255, lv * 255)); else q.add(x, y, k, Math.min(255, lv * 255));
    }
  }
  function cone(p, x, y, len, w, color, a) {          // vertical light cone, design units
    const q = NP(p), k = C(color); x = R(x * S); y = R(y * S); len = R(len * S); w *= S;
    for (let j = 0; j < len; j++) {
      const t = j / len, hw = 2 + w * t, fall = (1 - t * 0.85) * a;
      for (let i = -Math.ceil(hw); i <= Math.ceil(hw); i++) {
        const e = 1 - Math.abs(i) / hw; if (e <= 0) continue;
        const lv = Math.floor(fall * e * 5 + bay(x + i, y + j)) / 5; if (lv > 0) q.add(x + i, y + j, k, lv * 255);
      }
    }
  }
  const sh = (c, k) => darken(c, k), li = (c, k) => lighten(c, k);
  // keep the art free of pure black: lift the darkest channels (violet floor)
  function lift(p) {
    const d = NP(p).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { if (d[i] < 16) d[i] = 16; if (d[i + 1] < 11) d[i + 1] = 11; if (d[i + 2] < 26) d[i + 2] = 26; }
    return p;
  }
  function sparkle(p, x, y, c, big) {
    const q = NP(p); x = R(x * S); y = R(y * S);
    q.px(x, y, '#ffffff'); q.px(x - 1, y, c); q.px(x + 1, y, c); q.px(x, y - 1, c); q.px(x, y + 1, c);
    if (big) for (let k = 2; k <= 5; k++) { const a = k < 4 ? 170 : 90; q.px(x - k, y, c, a); q.px(x + k, y, c, a); q.px(x, y - k, c, a); q.px(x, y + k, c, a); }
  }
  // flip the area above baseY (design units) vertically under it, faded and rippled (wet ground)
  function wet(p, baseY, depth, alpha, tintc, seed, opt) {
    opt = opt || {}; const q = NP(p), r = rng(seed), src = q.clone(), x0 = R((opt.x0 || 0) * S), x1 = opt.x1 ? R(opt.x1 * S) : q.w, tk = C(tintc), B = R(baseY * S), D = R(depth * S);
    for (let j = 1; j <= D; j++) {
      const y = B + j, ys = B - j; if (y >= q.h || ys < 0) break;
      const fade = alpha * (1 - j / (D + 3));
      const off = Math.round(Math.sin(j * 1.3 + seed) * (0.6 + j / 18) + (r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0));
      const skip = (j % 6 === 3) ? 0.55 : (j % 6 === 0 ? 0.2 : 0);
      for (let x = x0; x < x1; x++) {
        const sx = clamp(x + off, 0, q.w - 1), si = (ys * q.w + sx) * 4, sd = src.data;
        if (sd[si + 3] < 128) continue;
        if (skip && bay(x, y) < skip) continue;
        q.px(x, y, [sd[si] * 0.7 + tk[0] * 0.3, sd[si + 1] * 0.7 + tk[1] * 0.3, sd[si + 2] * 0.7 + tk[2] * 0.3, 255], fade * 255);
      }
    }
  }
  // paint a sprite (SP) with feet at (x, baseY) plus a faded rippled mirror image beneath it
  function standing(p, spr, x, baseY, refl) {
    const q = NP(p), sp = spr.raw, bx = R(x * S - sp.w / 2), B = R(baseY * S), by = B - sp.h;
    q.blit(sp, bx, by);
    if (refl === 0) return;
    refl = refl === undefined ? 0.42 : refl;
    for (let j = 0; j < sp.h; j++) {
      const y = B + 1 + j, fade = refl * (1 - j / (sp.h + 5)), off = Math.round(Math.sin(j * 1.5 + x) * (0.7 + j / 16));
      if (y >= q.h || (j % 5 === 4)) continue;
      for (let i = 0; i < sp.w; i++) {
        const si = ((sp.h - 1 - j) * sp.w + i) * 4, a = sp.data[si + 3]; if (a < 128) continue;
        q.px(bx + i + off, y, [sp.data[si], sp.data[si + 1], sp.data[si + 2], 255], fade * 255);
      }
    }
  }
  function rimLight(spr, color, xmax, dark, right, xmin) {    // coloured rim on the lit edge of a silhouette sprite (native)
    const q = spr.raw, x1 = xmax === undefined ? q.w : R(xmax * S), x0 = xmin === undefined ? 0 : R(xmin * S);
    for (let y = 0; y < q.h; y++) for (let x = x0; x < Math.min(q.w, x1); x++) {
      const a = q.alphaAt(x, y), edge = right ? !q.alphaAt(x + 1, y) : (!q.alphaAt(x - 1, y) || !q.alphaAt(x, y - 1));
      if (a && edge && (!dark || q.get(x, y)[0] < dark)) q.px(x, y, color);
    }
  }
  function rain(p, seed, count, len, color, a, y0, y1) {     // design units; native streaks
    const q = NP(p), r = rng(seed), k = C(color); count = R(count * 1.7); len = R(len * S); y0 = R(y0 * S); y1 = R(y1 * S);
    for (let n = 0; n < count; n++) {
      const x = r.int(q.w + 20) - 4, y = y0 + r.int(Math.max(1, y1 - y0)), l = len + r.int(len);
      for (let j = 0; j < l; j++) q.px(x - (j >> 1), y + j, k, a * (1 - j / (l + 1)) * (0.5 + r() * 0.5));
    }
  }
  function ripples(p, seed, count, x0, y0, x1, y1, color) {
    const q = NP(p), r = rng(seed), k = C(color); count = R(count * 1.6); x0 = R(x0 * S); x1 = R(x1 * S); y0 = R(y0 * S); y1 = R(y1 * S);
    for (let n = 0; n < count; n++) {
      const x = x0 + r.int(x1 - x0), y = y0 + r.int(y1 - y0), rad = 2 + r.int(4 + (y - y0) / 20);
      for (let t = -rad; t <= rad; t++) { const dy = Math.round(Math.sqrt(Math.max(0, rad * rad - t * t)) * 0.35); q.px(x + t, y - dy, k, 130); q.px(x + t, y + dy, k, 70); }
    }
  }
  // scatter specks natively inside a design box: n specks, colours picked by fn(r)
  function speckle(p, x, y, w, h, n, seed, colFn, a) {
    const q = NP(p), r = rng(seed), x0 = R(x * S), y0 = R(y * S), W = R(w * S), H = R(h * S);
    for (let i = 0; i < n; i++) q.px(x0 + r.int(W), y0 + r.int(H), colFn(r), a);
  }
  function mkScene(id, variant, w, h, o) {
    return Object.assign({ id, variant: variant || null, w, h, layers: [], fg: null, floorY: h - 80, spots: {}, hotspots: [], lights: [], anim: [] }, o || {});
  }
  const sLights = (ls) => ls.map((l) => Object.assign({}, l, { x: R(l.x * S), y: R(l.y * S), r: Math.max(1, R(l.r * S)) }));
  const sAnim = (as) => as.map((a) => { const o = Object.assign({}, a); if (o.x !== undefined) o.x = R(o.x * S); if (o.y !== undefined) o.y = R(o.y * S); return o; });
  const sSpots = (sp) => { const o = {}; for (const k of Object.keys(sp)) o[k] = { x: R(sp[k].x * S), y: R(sp[k].y * S) }; return o; };
  const sHot = (hs) => hs.map((h) => Object.assign({}, h, { x: R(h.x * S), y: R(h.y * S), w: R(h.w * S), h: R(h.h * S) }));

  /* ------------------------------------------------------------------ neon text */
  // World.neon(text, colorHex, scale=1, opts?) -> Pix with 6px of transparent padding and a dithered halo (native pixels).
  // opts.off: unlit tube (daylight): no halo, dull colour.
  World.neon = function (text, color, scale, opts) {
    scale = scale || 1; opts = opts || {}; text = String(text);
    const base = Font.text(text, { color: '#ffffff', scale, spacing: 1 }), pad = 6;
    const out = new Pix(base.w + pad * 2, base.h + pad * 2), W = out.w, H = out.h;
    const mask = new Uint8Array(W * H), dist = new Float32Array(W * H).fill(9);
    for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) if (base.data[(y * base.w + x) * 4 + 3] > 0) mask[(y + pad) * W + x + pad] = 1;
    if (!opts.off) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) {
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const d = Math.sqrt(dx * dx + dy * dy), i = yy * W + xx; if (d < dist[i]) dist[i] = d;
        }
      }
      const hk = C(color), A = [0, 0.64, 0.44, 0.28, 0.16, 0.08];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (mask[i] || dist[i] > 5.2) continue;
        const d = Math.max(1, Math.round(dist[i])), a = A[Math.min(5, d)];
        if (bay(x, y) < a + 0.12 * (d === 1)) out.px(x, y, hk, 150 * Math.min(1, a * 1.6));
      }
    }
    const core = opts.off ? mix(color, '#2c1d4d', 0.55) : lighten(color, 0.62), edge = opts.off ? mix(color, '#2c1d4d', 0.7) : color;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) {
      const inner = mask[y * W + x - 1] && mask[y * W + x + 1] && mask[(y - 1) * W + x] && mask[(y + 1) * W + x];
      out.px(x, y, scale === 1 || inner ? core : edge);
    }
    return out;
  };

  /* ------------------------------------------------------------------ logo */
  function bevelText(str, scale, spacing, depth, pad) {
    const t = Font.text(str, { scale, spacing, color: '#ffffff' }), W = t.w + pad * 2 + depth, H = t.h + pad * 2 + depth;
    const m = new Uint8Array(W * H), out = new Pix(W, H);
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.data[(y * t.w + x) * 4 + 3]) m[(y + pad) * W + x + pad] = 1;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
    const ex = ['#6a46ae', '#5b3a9a', '#4c2f86', '#43296f', '#3a2362', '#2c1d4d', '#241640', '#1c1133'];
    for (let k = depth; k >= 1; k--) {
      const col = ex[Math.min(ex.length - 1, Math.floor((k - 1) * ex.length / depth))];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x - k, y - k)) out.px(x, y, (x + y) % 2 && k > depth - 2 ? ex[ex.length - 1] : col);
    }
    const bands = ['#fffbd8', '#fff0a0', '#ffe66a', '#ffd23a', '#e9ae14', '#D4A017', '#b97c10', '#8c5410'];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) {
      const fy = (y - pad) / (t.h - 1);
      let c = fy < 0.1 ? bands[2] : fy < 0.3 ? bands[3] : fy < 0.45 ? bands[4] : fy < 0.6 ? bands[5] : fy < 0.8 ? bands[6] : bands[7];
      if (!at(x, y - 1) || !at(x - 1, y)) c = bands[0];
      else if (!at(x, y - 2) || !at(x - 2, y)) c = bands[1];
      else if (!at(x, y + 1) || !at(x + 1, y)) c = '#6a3f0c';
      else if (!at(x, y + 2) || !at(x + 2, y)) c = bands[7];
      else if (fy < 0.55 && at(x, y - 3) && ((x - pad) + (y - pad)) % 23 < 3) c = bands[1];
      else if (fy > 0.5 && ((x - pad) * 3 + (y - pad)) % 5 === 0 && bay(x, y) < 0.3) c = bands[6];
      out.px(x, y, c);
    }
    return { pix: out, tw: t.w, th: t.h };
  }
  function neonRing(p, c0, c1) {      // outline + dithered halo, colour sweeps c0 -> c1 left to right
    const w = p.w, h = p.h, src = p.data.slice();
    const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 40;
    const dist = new Float32Array(w * h).fill(9);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y)) {
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const d = Math.sqrt(dx * dx + dy * dy), i = yy * w + xx; if (d < dist[i]) dist[i] = d;
      }
    }
    const k0 = C(c0), k1 = C(c1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue; const d = dist[y * w + x]; if (d > 5.2) continue;
      const f = x / w, col = bay(x * 3 + 1, y) < f ? k1 : k0;
      if (d <= 1.01) p.px(x, y, col);
      else if (d <= 2.1) p.px(x, y, lighten(hexOf(col), 0.0), 235);
      else if (d <= 3.2) { if (bay(x, y) < 0.55) p.px(x, y, col, 130); }
      else if (d <= 4.2) { if (bay(x, y) < 0.26) p.px(x, y, col, 110); }
      else if (bay(x, y) < 0.1) p.px(x, y, col, 90);
    }
    return p;
  }
  const hexOf = (k) => '#' + [k[0], k[1], k[2]].map((v) => (v < 16 ? '0' : '') + Math.round(v).toString(16)).join('');
  World.logo = function () {
    if (World.cache.__logo) return World.cache.__logo;
    const A = bevelText('BEATBOX', 7, 1, 5, 3), Bt = bevelText('HEROES', 5, 4, 4, 3);
    const W = 330, pad = 8, out = new Pix(W, A.pix.h + Bt.pix.h + 30 + pad * 2);
    const ax = Math.round((W - A.pix.w) / 2), ay = pad;
    out.blit(A.pix, ax, ay);
    const hy = ay + A.th + 16, hx = Math.round((W - Bt.pix.w) / 2);
    out.blit(Bt.pix, hx, hy);
    const midY = hy + Bt.th / 2 + 4, bcol = ['#2ee6ff', '#ff3ea5'];
    for (let s = 0; s < 2; s++) for (let i = 0; i < 6; i++) {
      const hh = [8, 16, 26, 14, 21, 11][i], bx = s ? hx + Bt.tw + 12 + i * 5 : hx - 12 - 5 * 6 + i * 5 + 5;
      const c = bcol[(i + s) % 2], r2 = ramp(c), y0 = Math.round(midY - hh / 2);
      if (bx < 4 || bx + 5 > W - 4) continue;
      out.rect(bx, y0, 4, hh, c); out.rect(bx, y0, 1, hh, r2.hi); out.rect(bx + 4, y0 + 1, 1, hh, '#241640'); out.rect(bx + 1, y0, 2, 1, '#ffffff');
      for (let j = y0 + 3; j < y0 + hh; j += 4) out.hline(bx, j, 4, r2.shade);
    }
    const uy = hy + Bt.th + 12, ux = hx + 3, uw = Bt.tw - 6;
    out.rect(ux + 4, uy + 2, uw, 4, '#241640');
    out.rect(ux, uy, uw, 4, '#D4A017'); out.rect(ux, uy, uw, 1, '#fff0a0'); out.rect(ux, uy + 1, uw, 1, '#ffe66a'); out.rect(ux, uy + 3, uw, 1, '#b97c10');
    for (let x = ux + 14; x < ux + uw - 16; x += 38) { out.rect(x, uy - 2, 2, 7, '#ff3ea5'); out.rect(x + 4, uy - 5, 2, 13, '#2ee6ff'); out.rect(x + 8, uy - 1, 2, 5, '#fff6b8'); out.rect(x + 12, uy - 3, 2, 9, '#ff3ea5'); }
    neonRing(out, '#2ee6ff', '#ff3ea5');
    const sp = [[ax + 12, ay + 6, 1], [ax + A.tw - 8, ay + 3, 1], [hx + 26, hy + 30, 0], [hx + Bt.tw + 8, hy - 4, 1], [ax + 126, ay - 1, 0], [ax + 4, ay + A.th + 6, 0]];
    for (const s of sp) sparkle(out, s[0] / S, s[1] / S, '#fff6b8', s[2]);
    const b = out.bounds(), fin = new Pix(b.w, b.h);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const i = ((y + b.y) * out.w + x + b.x) * 4; fin.data.set(out.data.subarray(i, i + 4), (y * b.w + x) * 4); }
    lift(fin); World.cache.__logo = fin;
    return fin;
  };

  /* ------------------------------------------------------------------ TITLE (360x640): one-point-perspective wet canyon street at dusk */
  World.builders.title = function () {
    const p = mk(270, 480), q = p.raw, NW = q.w, NH = q.h, r = rng(7001);
    const V = { x: 135, y: 226 }, K = 118, HE = 1.5, XW = 1.7, CB = 1.25;
    const px_ = (s, X, z) => V.x + s * X * K / z, py_ = (Y, z) => V.y + (HE - Y) * K / z;
    const gy = (x) => V.y + HE * Math.abs(V.x - x) / XW;             // wall base line y at design column x
    // sky
    vgrad(p, 0, 0, 270, 236, [[0, '#150d33'], [0.18, '#241647'], [0.34, '#3b2468'], [0.46, '#5a3290'], [0.57, '#8e4a9c'], [0.67, '#c9567f'], [0.76, '#ff6e5c'], [0.85, '#ffa050'], [0.93, '#ffc86a'], [1, '#ffe39a']], 2.6);
    for (let i = 0; i < 140; i++) { const x = r.int(360), y = r.int(170), a = 1 - y / 190; if (r() < a) { q.px(x, y, r() < 0.2 ? '#ffd0f0' : '#d8d4ff'); if (r() < 0.09) { q.px(x + 1, y, '#8e7ac8'); q.px(x - 1, y, '#8e7ac8'); q.px(x, y - 1, '#8e7ac8'); q.px(x, y + 1, '#8e7ac8'); } } }
    for (let n = 0; n < 9; n++) {                                     // thin dithered cloud streaks lit from below
      const cy = R((112 + n * 12 + r.int(6)) * S), cx = r.int(NW), len = 50 + r.int(110), c = ['#8e4a9c', '#a85aa8', '#d8587f', '#ff7a55'][Math.min(3, n >> 1)];
      for (let x = cx - len; x < cx + len; x++) { const t = Math.abs(x - cx) / len, th = Math.round((1 - t) * 3.2); for (let j = 0; j < th; j++) if (bay(x, cy + j) < 0.85 - t * 0.5) q.px(x, cy + j, c, 150); }
    }
    // the sun: retro slatted disc low over the street
    const SX = 135, SY = 196, SR = 46;
    glow(p, SX, SY, 124, '#ff5fa8', 0.55, { levels: 8 }); glow(p, SX, SY, 78, '#ffb04a', 0.62, { levels: 8 });
    { const cx = SX * S, cy = SY * S, rr = SR * S;
      for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
        const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > rr * rr) continue;
        const t = (y - (cy - rr)) / (2 * rr);
        if (t > 0.46 && (((y - cy) % 9) + 9) % 9 < (t - 0.42) * 12) continue;
        const f = clamp((t - 0.08) * 1.3, 0, 1), L = [[0.2, '#fff4b0'], [0.38, '#ffe05a'], [0.54, '#ffb43a'], [0.7, '#ff8a4a'], [0.85, '#ff5f7a'], [1, '#ff3ea5']];
        let k = 0; while (k < L.length - 1 && f > L[k][0]) k++;
        const c1 = L[k][1], c0 = L[Math.max(0, k - 1)][1];
        q.px(x, y, (L[k][0] - f < 0.05 && bay(x, y) < 0.5) ? c0 : c1);
      } }
    // distant cross-street skyline (behind the walls, fogged)
    for (let i = 0; i < 30; i++) {
      const x = 78 + i * 3.8 + r.int(2), w = 3 + r.int(6), top = 150 + r.int(60) + Math.abs(i - 15) * 1.8, c = i % 3 ? '#6c3a86' : '#7a4390';
      p.rect(x, top, w, 240 - top, c); p.hline(x, top, w, '#c76a96');
      if (r() < 0.4) p.rect(x + 1 + r.int(Math.max(1, w - 1)), top - 5 - r.int(8), 1, 8, '#6c3a86');
      for (let wy = top + 3; wy < 224; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) if (r() < 0.36) p.rect(wx, wy, 1, 1, r() < 0.3 ? '#ff8ad0' : '#ffd37a');
    }
    // canyon walls, far to near
    const sides = [-1, 1], litCols = ['#ffd37a', '#ffbe55', '#ffe9a8', '#ff8ad0', '#7ae9ff', '#ffc86a'];
    const bays = []; let z = 1.2; for (; z < 40;) { bays.push([z, z * 1.22]); z *= 1.22; }
    const palettes = [['#4a2a45', '#5b2a35'], ['#3a2a66', '#43296f'], ['#2c3a6a', '#2c3157'], ['#5e3350', '#6a2f45']];
    const fogCol = '#d8587f', signs = [];
    for (let bi = bays.length - 1; bi >= 0; bi--) for (const s of sides) {
      const [za, zb] = bays[bi], rr = rng(100 + bi * 7 + (s > 0 ? 3 : 0));
      const Hh = clamp(3.7 + rr() * 1.9 + (bi % 6 === 3 ? 2.6 : 0) + (bi > 10 ? 1.5 : 0), 3.2, 9), pal = palettes[(bi * 2 + (s > 0 ? 1 : 0) + rr.int(2)) % 4];
      const f = clamp((za - 1.1) / (za + 7), 0, 0.78), fq = Math.round(f * 8) / 8;
      const wallC = mix(pal[0], fogCol, fq * 0.82), wallL = mix(pal[1], fogCol, fq * 0.82);
      const A = [px_(s, XW, za), py_(Hh, za)], B = [px_(s, XW, zb), py_(Hh, zb)], B2 = [px_(s, XW, zb), py_(0, zb)], A2 = [px_(s, XW, za), py_(0, za)];
      p.poly([A, B, B2, A2], wallC);
      // brick courses in perspective: faint horizontal bands every 0.16 units
      for (let yy = 0.16; yy < Hh; yy += 0.16) p.line(px_(s, XW, za), py_(yy, za), px_(s, XW, zb), py_(yy, zb), mix(wallC, '#150d33', 0.18));
      p.line(A[0], A[1], B[0], B[1], mix('#ffbe55', fogCol, fq * 0.5)); p.line(A[0], A[1] + 1, B[0], B[1] + 1, mix(wallL, '#2c1d4d', 0.2));
      p.line(A[0], A[1] + 2, B[0], B[1] + 2, mix(wallL, '#150d33', 0.35));
      const nf = Math.max(1, Math.floor((Hh - 1.0) / 0.62));
      for (let fl = 0; fl < nf; fl++) {
        const Y0 = 1.0 + fl * 0.62 + 0.1, Y1 = Y0 + 0.4;
        for (let c = 0; c < 3; c++) {
          const za2 = za + (zb - za) * (c / 3 + 0.07), zb2 = za + (zb - za) * (c / 3 + 0.26);
          const q4 = [[px_(s, XW, za2), py_(Y1, za2)], [px_(s, XW, zb2), py_(Y1, zb2)], [px_(s, XW, zb2), py_(Y0, zb2)], [px_(s, XW, za2), py_(Y0, za2)]];
          const lit = rr() < 0.42, base = lit ? mix(rr.pick(litCols), fogCol, fq * 0.4) : mix('#1f1536', fogCol, fq * 0.5);
          p.poly(q4, base);
          if (lit && za < 8) { p.line(q4[0][0], q4[0][1], q4[1][0], q4[1][1], '#fff3c4'); p.line((q4[0][0] + q4[1][0]) / 2, (q4[0][1] + q4[1][1]) / 2, (q4[2][0] + q4[3][0]) / 2, (q4[2][1] + q4[3][1]) / 2, mix(base, '#8a4a2a', 0.5)); }
          else if (!lit && za < 8) p.line(q4[0][0], q4[0][1], q4[2][0], q4[2][1], mix(base, '#7a8ae0', 0.35));
          p.line(q4[3][0], q4[3][1] + 1, q4[2][0], q4[2][1] + 1, mix(wallL, '#e8d0b0', 0.25 - fq * 0.2));
        }
        p.line(px_(s, XW, za), py_(Y0 - 0.06, za), px_(s, XW, zb), py_(Y0 - 0.06, zb), mix(wallL, '#150d33', 0.25));
      }
      if (bi < 8 && rr() < 0.3) for (let fl = 0; fl < nf; fl += 2) {
        const Y0 = 1.0 + fl * 0.62 + 0.04, XE = XW - 0.16, c = mix('#150d33', fogCol, fq * 0.5);
        p.line(px_(s, XE, za * 1.04), py_(Y0, za * 1.04), px_(s, XE, zb * 0.97), py_(Y0, zb * 0.97), c, bi < 3 ? 2 : 1);
        p.line(px_(s, XE, za * 1.04), py_(Y0 + 0.2, za * 1.04), px_(s, XE, zb * 0.97), py_(Y0 + 0.2, zb * 0.97), c);
        p.line(px_(s, XE, za * 1.05), py_(Y0, za * 1.05), px_(s, XE, zb * 0.96), py_(Y0 - 0.6, zb * 0.96), c);
      }
      if (za < 16) {
        const zs = za + (zb - za) * 0.1, ze = zb - (zb - za) * 0.1, tone = rr.pick(['#ffbe55', '#ff8ad0', '#7ae9ff', '#ffd37a']);
        const q4 = [[px_(s, XW, zs), py_(0.82, zs)], [px_(s, XW, ze), py_(0.82, ze)], [px_(s, XW, ze), py_(0.12, ze)], [px_(s, XW, zs), py_(0.12, zs)]];
        p.poly(q4, mix(tone, fogCol, fq * 0.5));
        const q2 = [q4[0], q4[1], [q4[1][0], q4[1][1] + (q4[2][1] - q4[1][1]) * 0.28], [q4[0][0], q4[0][1] + (q4[3][1] - q4[0][1]) * 0.28]];
        p.poly(q2, mix(darken(tone, 0.45), fogCol, fq * 0.5));
        for (let m = 0; m <= 4; m++) { const zm = zs + (ze - zs) * m / 4; p.line(px_(s, XW, zm), py_(0.84, zm), px_(s, XW, zm), py_(0.1, zm), mix('#2c1d4d', fogCol, fq * 0.4)); }
        for (let k = 1; k < 4; k++) { const zk = zs + (ze - zs) * (k - 0.5) / 4; p.line(px_(s, XW, zk), py_(0.62, zk), px_(s, XW, zk + (ze - zs) / 8), py_(0.62, zk + (ze - zs) / 8), mix('#fff0c9', tone, 0.4)); }   // merchandise shelf
        p.line(q4[0][0], q4[0][1], q4[1][0], q4[1][1], '#fff6d6');
        p.line(px_(s, XW, zs), py_(0.9, zs), px_(s, XW, ze), py_(0.9, ze), rr.pick(['#ff3ea5', '#2ee6ff', '#9dff4a']), 1);
        signs.push({ s, z: (zs + ze) / 2, c: tone });
      }
    }
    // projecting neon signs
    const neons = [[1, 2.6, 2.2, 'LIVE', '#ff2f4f', 3], [-1, 3.3, 1.9, 'BAR', '#ff3ea5', 3], [1, 4.7, 1.5, 'OPEN', '#2ee6ff', 1], [-1, 5.6, 1.5, 'JAZZ', '#ffe14d', 1]];
    for (const [s, zz, Hn, txt, col, sc] of neons) {
      const n = World.neon(txt, col, sc), cx = px_(s, XW - 0.2, zz), cy = py_(Hn, zz);
      p.line(px_(s, XW, zz), cy, cx, cy, '#2c1d4d'); p.blit(n, cx - n.w / S / 2, cy - n.h / S / 2);
      glow(p, cx, cy, 26 / Math.sqrt(zz), col, 0.35, { sx: 1.4 });
    }
    // overhead cables strung across the canyon
    for (const [zz, Hc] of [[1.8, 3.4], [3.1, 3.2], [5.2, 3.0], [8.5, 2.9]]) {
      const xa = px_(-1, XW, zz) * S, xb = px_(1, XW, zz) * S, yy = py_(Hc, zz) * S, sag = 9 / Math.sqrt(zz);
      for (let x = Math.round(xa); x <= xb; x++) { const t = (x - xa) / (xb - xa), y = yy + Math.sin(t * PI) * sag; q.px(x, Math.round(y), '#2c2650'); if (x % 5 === 0) q.px(x, Math.round(y) + 1, '#46405e', 150); }
    }
    const above = q.clone();                                          // everything above ground, to be mirrored

    // ground: asphalt, sidewalks, curbs (native)
    const gyN = (nx) => (V.y + HE * Math.abs(V.x - nx / S) / XW) * S;
    for (let ny = R(226 * S); ny < NH; ny++) for (let nx = 0; nx < NW; nx++) {
      if (ny <= gyN(nx)) continue;
      const t = (ny / S - 226) / 254, i = t < 0.2 ? 0 : t < 0.45 ? 1 : t < 0.7 ? 2 : 3, cs = ['#46405e', '#3a2f56', '#2d2a42', '#241f38', '#1c1a2b'];
      q.px(nx, ny, bay(nx, ny) < ((t * 5) % 1) * 0.5 ? cs[i + 1] : cs[i]);
      if (((nx * 7 + ny * 13) % 29) === 0) q.px(nx, ny, '#5a5478', 120);
    }
    for (const s of sides) {
      const pa = [[px_(s, XW, 0.7), py_(0, 0.7)], [px_(s, XW, 60), py_(0, 60)], [px_(s, CB, 60), py_(0, 60)], [px_(s, CB, 0.7), py_(0, 0.7)]];
      p.poly(pa, '#4b4468');
      p.line(pa[3][0], pa[3][1], pa[2][0], pa[2][1], '#8e86b4'); p.line(pa[3][0] + s, pa[3][1], pa[2][0] + s, pa[2][1], '#2c1d4d');
      for (let zz = 1; zz < 30; zz *= 1.2) { const x0 = px_(s, XW, zz), x1 = px_(s, CB, zz), y = py_(0, zz); p.line(x0, y, x1, y, '#3a3458'); }
    }
    // wet reflection of the canyon and sunset in the road + sidewalks
    const rr2 = rng(31);
    for (let ny = R(227 * S); ny < NH; ny++) {
      const off = Math.round(Math.sin(ny * 0.7) * (0.5 + (ny / S - 226) / 45) + (rr2() < 0.25 ? (rr2() < 0.5 ? -1 : 1) : 0)), gap = (ny % 5 === 4);
      for (let nx = 0; nx < NW; nx++) {
        const b = gyN(nx); if (ny <= b + 1) continue;
        const ys = Math.round(2 * b - ny); if (ys < 0 || (gap && bay(nx, ny) < 0.55)) continue;
        const sx = clamp(nx + off, 0, NW - 1), i = (ys * NW + sx) * 4, d = above.data;
        const a = clamp(0.8 - (ny - b) / (300 * S), 0.28, 0.8) * (1 - (ny / S - 226) / 520);
        q.px(nx, ny, [d[i] * 0.86 + 14, d[i + 1] * 0.8 + 8, d[i + 2] * 0.86 + 26, 255], a * 255);
      }
    }
    for (let zz = 1.1; zz < 30; zz *= 1.4) { const z2 = zz * 1.16; p.poly([[px_(1, 0.03, zz), py_(0, zz)], [px_(1, 0.03, z2), py_(0, z2)], [px_(-1, 0.03, z2), py_(0, z2)], [px_(-1, 0.03, zz), py_(0, zz)]], '#d8c89a'); }
    // lamp posts on the sidewalks (with their own reflections), light pools
    const lampZ = [[-1, 1.3], [1, 1.85], [-1, 2.7], [1, 4.0], [-1, 5.8], [1, 8.6], [-1, 12]];
    for (const [s, zz] of lampZ) {
      const bx = px_(s, 1.4, zz), by = py_(0, zz), top = py_(2.6, zz), sc = K / zz, spr = mk(Math.ceil(sc * 0.9) + 8, Math.ceil(by - top) + 4);
      const ox = spr.w / 2, th = sc > 60 ? 2 : 1;
      spr.line(ox, spr.h - 1, ox, 3, '#2c1d4d', th); spr.line(ox, 3, ox - s * sc * 0.28, 3, '#2c1d4d', th);
      const hx = ox - s * sc * 0.3; spr.rect(hx - 2, 3, 5, 2, '#ffe9a8'); spr.px(hx, 2, '#4f2d7e');
      standing(p, spr, bx, by, 0.4);
      const lx = bx - s * sc * 0.3, ly = top + 3;
      glow(p, lx, ly, 8 + 34 / zz, '#ffbe55', 0.8, { levels: 7 });
      glow(p, lx, by - 1, 18 + 90 / zz, '#ff9a4a', 0.35, { sy: 0.22, levels: 6 });
      glow(p, lx, by + 6 + 20 / zz, 4 + 14 / zz, '#ffe9a8', 0.8, { sy: 3.4, levels: 5 });
    }
    for (const sg of signs) if (sg.z < 14) { const x = px_(sg.s, XW - 0.3, sg.z), y = py_(0, sg.z) + 3; glow(p, x, y, 10 + 40 / sg.z, sg.c, 0.34, { sx: 1, sy: 0.35 }); glow(p, x - sg.s * 6, y + 18 + 30 / sg.z, 3 + 8 / sg.z, sg.c, 0.5, { sy: 3 }); }
    // the lone hero walking toward the sun, boombox on shoulder
    {
      const hs = mk(28, 46), ink = '#170f2c';
      hs.poly([[9, 6], [11, 1], [14, 0], [17, 3], [17, 9], [15, 12], [10, 12]], ink);
      hs.poly([[7, 12], [18, 12], [19, 22], [17, 29], [8, 29], [6, 22]], ink);
      hs.rect(5, 13, 2, 14, ink); hs.rect(6, 25, 2, 3, ink);
      hs.poly([[18, 12], [21, 10], [22, 13], [20, 20], [18, 19]], ink);
      hs.rect(8, 28, 4, 16, ink); hs.rect(13, 28, 4, 16, ink); hs.rect(7, 43, 5, 3, ink); hs.rect(13, 43, 5, 3, ink);
      hs.rect(16, 4, 11, 7, '#43296f'); hs.frame(16, 4, 11, 7, '#6a3b8f'); hs.hline(16, 4, 11, '#c9577f');
      hs.rect(18, 6, 2, 2, '#2ee6ff'); hs.rect(23, 6, 2, 2, '#ff3ea5'); hs.hline(18, 10, 7, '#2c1d4d');
      rimLight(hs, '#ff9a4a', 15);
      standing(p, hs, 134, 270, 0.5);
    }
    // steam from a manhole
    for (let n = 0; n < 7; n++) glow(p, 188 + n * 1.4 - Math.sin(n) * 3, 336 - n * 9, 11 + n * 2.2, '#d8c8ff', 0.2, { sx: 0.8, sy: 1.3, levels: 5 });
    p.ellipse(188, 340, 9, 2, '#1c1a2b'); p.hline(181, 340, 15, '#46405e'); p.hline(183, 341, 11, '#2d2a42');
    // rain and ripples
    rain(p, 5, 190, 5, '#d8d0ff', 120, 0, 380);
    ripples(p, 6, 36, 20, 330, 250, 468, '#e8e0ff');
    // calm, darker bottom third for the menu buttons, plus side vignette
    for (let ny = R(330 * S); ny < NH; ny++) { const a = clamp((ny / S - 330) / 150, 0, 1) * 0.78; for (let nx = 0; nx < NW; nx++) if (bay(nx, ny) < a) q.px(nx, ny, '#150d33', 225); }
    for (let ny = 0; ny < NH; ny++) for (let nx = 0; nx < NW; nx++) { const e = Math.max(0, Math.abs(nx / S - 135) - 100) / 35; if (e > 0 && bay(nx, ny) < e * 0.45) q.px(nx, ny, '#150d33', 180); }
    lift(q);
    return mkScene('title', null, NW, NH, { layers: [{ pix: q, speed: 1 }], floorY: R(440 * S), anim: sAnim([{ kind: 'steam', x: 188, y: 340 }, { kind: 'neon_flicker', x: 206, y: 160 }, { kind: 'rain' }]),
      lights: sLights([{ x: 135, y: 196, r: 90, color: '#ff9a4a', a: 0.4, flicker: 0, kind: 'neon' }]) });
  };

  /* ------------------------------------------------------------------ shared scenery toolkit (street + park), design units */
  function memo(fn) { const m = new Map(); return (c) => { let v = m.get(c); if (v === undefined) { v = fn(c); m.set(c, v); } return v; }; }
  // time-of-day themes. grade = push a "daylight" colour into the theme.
  const TH = {
    day: {
      name: 'day', sky: [[0, '#4d9fe8'], [0.4, '#7fc0fa'], [0.78, '#bfe3ff'], [1, '#fff0d0']], farA: '#a9c0e6', farB: '#8fa9d8', fog: '#d6e6fa', fogK: 0.5,
      mid: ['#d49a72', '#c08468', '#a87260', '#e0b088'], win: 0.05, neon: false, lamp: false, wet: 0.16, glass: ['#7fb8ee', '#5e98d4'], sidewalk: ['#aaa5c0', '#968fb0', '#7f7aa0'], road: ['#5f5b78', '#4f4b68'], leaf: '#4fae52', grass: '#5cbf5c', puddle: '#9fd0ff', stars: false,
      grade: memo((c) => mix(c, '#fff0c8', 0.06)),
    },
    dusk: {
      name: 'dusk', sky: [[0, '#2c1d6a'], [0.25, '#5a2f8f'], [0.48, '#a1488f'], [0.66, '#ee6a78'], [0.82, '#ffa056'], [1, '#ffd98a']], farA: '#7a4590', farB: '#5d3382', fog: '#c76a96', fogK: 0.42,
      mid: ['#8a4a6a', '#6e3a62', '#5a3258', '#9a5a72'], win: 0.5, neon: true, lamp: true, wet: 0.42, glass: ['#3a2a66', '#2c1d4d'], sidewalk: ['#7a6a9a', '#5f5282', '#4a4068'], road: ['#3d3354', '#2d2a42'], leaf: '#3f8f5a', grass: '#3f8f5a', puddle: '#ff9a7a', stars: false,
      grade: memo((c) => mix(mix(c, '#7a3f8f', 0.3), '#ff9a4a', 0.07)),
    },
    night: {
      name: 'night', sky: [[0, '#0e0a26'], [0.35, '#1a1240'], [0.7, '#2c1d58'], [1, '#43296f']], farA: '#2b2057', farB: '#221846', fog: '#43296f', fogK: 0.5,
      mid: ['#3a2a5c', '#30244f', '#27204a', '#44306a'], win: 0.62, neon: true, lamp: true, wet: 0.62, glass: ['#1d1a44', '#141233'], sidewalk: ['#4b4468', '#3d3658', '#322c4a'], road: ['#241f38', '#1c1a2b'], leaf: '#2f6f6a', grass: '#2d6a58', puddle: '#7a8cff', stars: true,
      grade: memo((c) => mix(darken(c, 0.32), '#2a2470', 0.5)),
    },
  };
  const LIT = ['#ffd37a', '#ffbe55', '#ffe9a8', '#ffc86a', '#ffdca0'];
  function box(p, x, y, w, h, c, edge) {
    const r = ramp(c); p.rect(x, y, w, h, r.base);
    if (edge !== false) { p.hline(x, y, w, r.light); p.vline(x, y, h, r.light); p.hline(x, y + h - 1, w, r.shade); p.vline(x + w - 1, y, h, r.shade); }
  }
  function plate(p, x, y, w, h, bg, fg, text, sc, o) {        // framed sign plate with centred pixel-font text
    o = o || {}; const rb = ramp(bg);
    p.rect(x, y, w, h, rb.base); p.frame(x, y, w, h, o.edge || rb.light); p.hline(x + 1, y + h - 1, w - 2, rb.deep);
    p.hline(x + 1, y + 1, w - 2, rb.light); p.px(x + 1, y + 1, rb.hi);
    const tw = FW(text, sc), th = FH(sc);
    FD(p, text, x + (w - tw) / 2, y + (h - th) / 2, fg, { scale: sc, shadow: o.shadow === undefined ? rb.deep : o.shadow });
  }
  // brick wall: native 10x5 bricks with 1px mortar, per-brick tone, speckle, grime. pal [mortar, b0, b1, b2]
  function brick(p, x, y, w, h, pal, r, grime) {
    const q = NP(p), x0 = R(x * S), y0 = R(y * S), X1 = R((x + w) * S), Y1 = R((y + h) * S), mo = pal[0];
    q.rect(x0, y0, X1 - x0, Y1 - y0, mo);
    for (let j = 0, ry = y0; ry < Y1; j++, ry += 5) {
      const off = (j & 1) * 5, hh = Math.min(4, Y1 - ry);
      for (let bx = x0 - off; bx < X1; bx += 10) {
        const a = Math.max(bx, x0), b = Math.min(bx + 9, X1), rv = r();
        if (b > a) {
          const c = rv < 0.45 ? pal[1] : rv < 0.78 ? pal[2] : pal[3];
          q.rect(a, ry, b - a, hh, c);
          if (hh > 1 && b - a > 3) { q.hline(a, ry, b - a, rv < 0.45 ? mix(c, '#ffffff', 0.1) : mix(c, '#ffffff', 0.14)); if (r() < 0.3) q.px(a + r.int(b - a), ry + r.int(hh), mix(c, '#150d33', 0.35)); }
        }
      }
    }
    if (grime) for (let n = 0; n < (X1 - x0) / 6; n++) {                 // vertical grime streaks
      const gx = x0 + r.int(X1 - x0), gl = 6 + r.int(26), gy0 = y0 + r.int(Math.max(1, Y1 - y0 - gl));
      for (let j = 0; j < gl; j++) if (bay(gx, gy0 + j) < 0.5 * (1 - j / gl)) q.px(gx, gy0 + j, '#150d33', 90);
    }
  }
  function shadowTop(p, x, y, w, rows, c) { const k = C(c); fillFn(p, x, y, w, rows, (u, v, nx, ny) => (bay(nx, ny) < (1 - v) * 0.85 ? [c, 0, 0, 0, 230] : null)); }
  function shadowBottom(p, x, y, w, rows, c, a) { fillFn(p, x, y, w, rows, (u, v, nx, ny) => (bay(nx, ny) < (1 - v) * (a || 0.8) ? [c, 0, 0, 0, 230] : null)); }
  function grimeUnder(p, x, y, w, len, c) {              // dithered drip stains under a sill/ledge
    const q = NP(p), x0 = R(x * S), y0 = R(y * S), W = R(w * S), L = R(len * S), r = rng(x0 * 31 + y0);
    for (let i = 2; i < W - 1; i += 2 + r.int(3)) { const l = (L >> 1) + r.int(L >> 1); for (let j = 0; j < l; j++) if (bay(x0 + i, y0 + j) < 0.65 * (1 - j / l)) q.px(x0 + i, y0 + j, c, 120); }
  }
  function cornice(p, x, y, w, T, c) {
    const g = T.grade; c = c || '#c9a98a';
    p.rect(x - 2, y, w + 4, 3, g(c)); p.hline(x - 2, y, w + 4, g(li(c, 0.5))); p.hline(x - 2, y + 1, w + 4, g(li(c, 0.25))); p.rect(x - 2, y + 3, w + 4, 1, g(sh(c, 0.45)));
    for (let i = x; i < x + w - 2; i += 4) { p.rect(i, y + 4, 2, 3, g(sh(c, 0.15))); p.vline(i, y + 4, 3, g(li(c, 0.2))); }
    p.hline(x - 1, y + 7, w + 2, g(sh(c, 0.5))); p.hline(x - 1, y + 8, w + 2, g(sh(c, 0.7)));
  }
  function ledge(p, x, y, w, T, c) { const g = T.grade; p.rect(x, y, w, 2, g(c || '#c9a98a')); p.hline(x, y, w, g(li(c || '#c9a98a', 0.4))); shadowBottom(p, x, y + 2, w, 4, g('#1f1536'), 0.7); grimeUnder(p, x, y + 2, w, 7, '#150d33'); }
  function acUnit(p, x, y, T) {
    const g = T.grade; p.rect(x, y, 11, 8, g('#9a96b0')); p.hline(x, y, 11, g('#d0ccea')); p.vline(x, y, 8, g('#b8b4d0')); p.rect(x + 1, y + 2, 6, 5, g('#5c5878'));
    for (let i = 0; i < 4; i++) p.hline(x + 1, y + 3 + i, 6, g('#78749a')); p.rect(x + 8, y + 2, 2, 5, g('#6c6888')); p.vline(x + 5, y + 8, 3, g('#7fb8e8')); p.px(x + 5, y + 11, g('#7fb8e8'));
    p.hline(x + 1, y + 7, 9, g('#46405e'));
  }
  function plant(p, x, y, T, r, big) {
    const g = T.grade, lf = ramp(T.leaf), n = big ? 6 : 4;
    p.rect(x - 3, y - 4, 7, 4, g('#a0583a')); p.hline(x - 3, y - 4, 7, g('#c97a52')); p.hline(x - 2, y - 1, 5, g('#6e3a2e')); p.rect(x - 4, y - 5, 9, 1, g('#c97a52'));
    for (let i = 0; i < n; i++) { const dx = (i - (n - 1) / 2) * 1.8, h = (big ? 9 : 5) + (i % 2) * 2; p.line(x + dx * 0.3, y - 5, x + dx, y - 5 - h, g(lf.shade)); p.ellipse(x + dx, y - 6 - h, 2, 1.6, g(i % 2 ? lf.base : lf.light)); p.px(x + dx - 1, y - 7 - h, g(lf.hi)); }
  }
  // a window with frame, glass and (when lit) a tiny interior vignette. pushes a window light when lit.
  function windowAt(c, x, y, w, h, lit, kind) {
    const { p, T, r } = c, g = T.grade;
    const frame = kind === 'dark' ? '#3a2a55' : '#d8c8aa';
    p.rect(x - 1.5, y - 1.5, w + 3, h + 3, g(frame)); p.hline(x - 1.5, y - 1.5, w + 3, g(li(frame, 0.35))); p.vline(x - 1.5, y - 1.5, h + 3, g(li(frame, 0.2))); p.vline(x + w + 0.5, y - 1.5, h + 3, g(sh(frame, 0.3)));
    if (lit) {
      const col = r.pick(LIT), warm = ramp(col);
      p.rect(x, y, w, h, col);
      fillFn(p, x, y, w, h, (u, v, nx, ny) => (bay(nx, ny) < v * 0.55 ? warm.light : (v < 0.12 && bay(nx, ny) > 0.5 ? warm.hi : null)));
      const v = r.int(6), cx = x + (w >> 1), by = y + h - 1;
      if (v === 0) { p.ellipse(cx, by - 8, 3, 3, '#2c1d4d'); p.rect(cx - 5, by - 5, 11, 6, '#2c1d4d'); p.px(cx - 1, by - 8, '#4a3a6a'); }
      else if (v === 1) { p.poly([[cx - 4, by - 10], [cx + 5, by - 10], [cx + 3, by - 6], [cx - 2, by - 6]], '#ff6b6b'); p.hline(cx - 4, by - 10, 9, '#ff9a8a'); p.vline(cx, by - 6, 6, '#6e3a2e'); }
      else if (v === 2) { p.rect(x + 2, y + (h >> 1), w - 4, h >> 1, '#2ee6ff'); p.hline(x + 2, y + (h >> 1), w - 4, '#cffaff'); p.rect(x + 2, by, w - 4, 1, '#2c1d4d'); for (let k = 0; k < 3; k++) p.hline(x + 3, y + (h >> 1) + 2 + k * 3, w - 7, '#7ae0ff'); }
      else if (v === 3) { p.rect(x, y, w, 4, '#c9577f'); p.rect(x, y + 4, w, 1, '#8a3f5f'); for (let k = 0; k < w; k += 3) p.vline(x + k, y, 4, '#a84a6a'); plant(p, x + 5, by + 1, T, r); }
      else if (v === 4) { for (let i = 1; i < w - 1; i += 2) p.px(x + i, y + 3 + (i % 3), ['#ff3ea5', '#2ee6ff', '#ffe14d'][i % 3]); p.rect(x + 2, by - 4, w - 4, 4, '#6e3a5e'); }
      p.vline(x + (w >> 1), y, h, g('#8a6a4a')); p.hline(x, y + (h >> 1) - 2, w, g('#8a6a4a')); p.vline(x + (w >> 1) + 1, y, h, mix(warm.shade, '#ffffff', 0.1));
      if (T.lamp || T.name === 'night') c.lights.push({ x: x + (w >> 1), y: y + (h >> 1), r: Math.round(w * 1.9), color: col, a: 0.34, flicker: v === 2 ? 0.25 : 0.04, kind: 'window' });
    } else {
      p.rect(x, y, w, h, g(T.glass[0])); p.rect(x, y + (h >> 1), w, h - (h >> 1), g(T.glass[1]));
      p.line(x + 2, y + h - 3, x + w - 4, y + 2, g('#9ec8ff'), 1); p.line(x + 4, y + h - 2, x + w - 2, y + 4, g('#6f9ae0')); p.line(x + 6, y + h - 1, x + w, y + 7, g('#5a80c8'));
      p.vline(x + (w >> 1), y, h, g('#d8c8aa')); p.hline(x, y + (h >> 1) - 2, w, g('#d8c8aa'));
      if (r() < 0.3) { p.rect(x + 1, y + 1, (w >> 1) - 1, h >> 1, g('#c9577f')); for (let k = 1; k < (w >> 1); k += 2) p.vline(x + k, y + 1, h >> 1, g('#a84a6a')); }
    }
    p.rect(x - 2, y + h + 1, w + 4, 2, g('#c9b69a')); p.hline(x - 2, y + h + 1, w + 4, g('#efe2c8')); shadowBottom(p, x - 2, y + h + 3, w + 4, 5, g('#1f1536'), 0.6);
    grimeUnder(p, x - 1, y + h + 3, w + 2, 12, '#150d33');
  }
  function fireEscape(p, x, y, w, floors, fh, T) {
    const g = T.grade, c = g('#201a38'), c2 = g('#3a3358');
    for (let f = 0; f < floors; f++) {
      const py = y + f * fh;
      p.rect(x, py, w, 2, c); p.hline(x, py - 6, w, c); p.hline(x, py - 3, w, c2); p.hline(x, py + 2, w, c2);
      for (let i = 0; i <= w; i += 3) p.vline(x + i, py - 5, 5, c);
      if (f < floors - 1) { const sx = (f & 1) ? x + 2 : x + w - 12; for (let k = 0; k < 10; k++) { p.line(sx + ((f & 1) ? k : 10 - k), py + 3 + k * (fh - 5) / 10, sx + ((f & 1) ? k + 2 : 10 - k - 2), py + 3 + k * (fh - 5) / 10 + 1, c); } p.line(sx, py + 2, sx + ((f & 1) ? 10 : 0), py + fh, c, 1); p.line(sx + 1, py + 2, sx + ((f & 1) ? 11 : 1), py + fh, c2, 1); }
    }
  }
  function poster(c, x, y, w, h, seed) {
    const { p, T } = c, g = T.grade, r = rng(seed), cols = [['#ff3ea5', '#2ee6ff', '#ffe14d'], ['#9dff4a', '#a86bff', '#ffffff'], ['#ff6b6b', '#ffe14d', '#2c1d4d'], ['#2ee6ff', '#ff3ea5', '#fff0c9']][seed % 4];
    p.rect(x, y, w, h, g(cols[2] === '#ffffff' ? '#2c1d4d' : '#fff0c9')); p.rect(x, y, w, (h * 0.55) | 0, g(cols[0]));
    p.ellipse(x + w / 2, y + h * 0.35, w * 0.28, h * 0.22, g(cols[1])); p.ellipse(x + w / 2 - 1, y + h * 0.33, w * 0.14, h * 0.1, g(cols[2]));
    for (let i = 0; i < 4; i++) p.hline(x + 2, y + ((h * 0.64) | 0) + i * 2.5, w - 4 - (i === 3 ? 5 : 0), g('#2c1d4d'));
    p.frame(x, y, w, h, g('#d8c8aa')); p.hline(x + 1, y + 1, w - 2, g(li(cols[0], 0.4)));
    if (r() < 0.6) { p.px(x + w - 1, y + h - 1, g('#2c1d4d')); p.px(x + w - 2, y + h - 1, g('#2c1d4d')); p.px(x, y, g('#2c1d4d')); }
  }
  function graffiti(c, text, x, y, sc, col, col2) {
    const { p, T } = c, g = T.grade, f = fs(sc), pitch = 6 * f / S;
    FD(p, text, x, y, g(col), { scale: sc, outline: g('#1c1233'), shadow: g(col2) });
    for (let i = 0; i < text.length; i += 2) p.vline(x + i * pitch + 2, y + 7 * f / S + 1, 3 + ((i * 7) % 6), g(col));
  }
  function trash(p, x, y, T) {
    const g = T.grade; p.rect(x - 5, y - 13, 11, 13, g('#6c7a8c')); p.vline(x - 5, y - 13, 13, g('#9aa8ba')); p.vline(x - 4, y - 13, 13, g('#8a98ac')); p.vline(x + 5, y - 13, 13, g('#46506a'));
    for (let j = 0; j < 4; j++) p.hline(x - 5, y - 10 + j * 3, 11, g('#46506a')); p.rect(x - 6, y - 15, 13, 3, g('#8c9ab0')); p.hline(x - 6, y - 15, 13, g('#c8d4e4')); p.rect(x - 1, y - 17, 3, 2, g('#46506a'));
    p.px(x - 2, y - 11, g('#e0e8f4')); shadowBottom(p, x - 7, y, 16, 3, g('#150d33'), 0.8);
  }
  function hydrant(p, x, y, T) {
    const g = T.grade; p.rect(x - 3, y - 11, 7, 11, g('#d63c3c')); p.vline(x - 3, y - 11, 11, g('#ff7a6a')); p.vline(x - 2, y - 11, 11, g('#f05a4a')); p.rect(x - 4, y - 13, 9, 3, g('#b02e3a')); p.rect(x - 2, y - 15, 5, 2, g('#d63c3c')); p.hline(x - 2, y - 15, 5, g('#ff8a7a'));
    p.rect(x - 6, y - 8, 3, 3, g('#b02e3a')); p.rect(x + 4, y - 8, 3, 3, g('#b02e3a')); p.hline(x - 4, y - 1, 9, g('#8a2a34')); p.px(x, y - 12, g('#ffe14d'));
  }
  function bike(p, x, y, T) {
    const g = T.grade, c = g('#2ee6ff'), tire = g('#1c1233');
    for (const cx of [x, x + 17]) { p.ring(cx, y - 7, 7, 7, tire); p.ring(cx, y - 7, 6, 6, g('#46405e')); p.px(cx, y - 7, g('#ffe14d')); for (let a = 0; a < 8; a++) p.line(cx, y - 7, cx + Math.cos(a * 0.785) * 5.5, y - 7 + Math.sin(a * 0.785) * 5.5, g('#6c6888')); }
    p.line(x, y - 7, x + 7, y - 14, c); p.line(x + 7, y - 14, x + 14, y - 14, c); p.line(x + 14, y - 14, x + 17, y - 7, c); p.line(x + 7, y - 14, x + 9, y - 7, c); p.line(x, y - 7, x + 9, y - 7, c);
    p.line(x + 14, y - 14, x + 13, y - 18, g('#9a96b0')); p.hline(x + 11, y - 18, 5, g('#9a96b0')); p.hline(x + 4, y - 15, 6, g('#1c1233'));
  }
  function puddle(p, x, y, w, T, r, hue) {
    const q = NP(p), col = hue || T.puddle, k = C(col), cx = x * S, cy = y * S, rx = w * S, ry = 3 * S;
    for (let ny = Math.floor(cy - ry); ny <= cy + ry; ny++) for (let nx = Math.floor(cx - rx); nx <= cx + rx; nx++) {
      const e = ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2; if (e > 1) continue;
      const base = q.get(nx, ny); if (!base[3]) continue;
      const m = e > 0.75 ? 0.2 : e > 0.4 ? 0.4 : 0.5, rip = ((ny + (nx >> 2)) % 4 === 0) ? 0.12 : 0;
      q.px(nx, ny, [base[0] * (1 - m - rip) + k[0] * (m + rip), base[1] * (1 - m - rip) + k[1] * (m + rip), base[2] * (1 - m - rip) + k[2] * (m + rip), 255]);
    }
    for (let i = -rx + 4; i < rx - 3; i += 5 + r.int(4)) q.px(Math.round(cx + i), Math.round(cy - 1 + r.int(3)), '#ffffff', 150);
  }
  function tree(p, cx, cy, rad, T, r, trunkH) {
    const g = T.grade, lf = ramp(T.leaf), tones = [g(lf.deep), g(lf.shade), g(lf.base), g(lf.light), g(lf.hi)];
    if (trunkH) {
      p.rect(cx - 3, cy + rad * 0.45, 6, trunkH, g('#5e3a3a')); p.vline(cx - 3, cy + rad * 0.45, trunkH, g('#8a5a4a')); p.vline(cx + 2, cy + rad * 0.45, trunkH, g('#3a2230'));
      p.rect(cx - 5, cy + rad * 0.45 + trunkH - 3, 10, 3, g('#5e3a3a')); p.line(cx, cy + rad * 0.55, cx - rad * 0.45, cy + 2, g('#5e3a3a'), 2); p.line(cx, cy + rad * 0.55, cx + rad * 0.45, cy, g('#5e3a3a'), 2);
    }
    const cl = [], n = 11 + Math.round(rad / 3);
    for (let i = 0; i < n; i++) { const a = r() * PI * 2, d = Math.sqrt(r()) * rad * 0.62; cl.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.72, rad * (0.22 + r() * 0.2)]); }
    cl.push([cx, cy, rad * 0.5]);
    for (let layer = 0; layer < 4; layer++) for (const [bx, by, br] of cl) {
      const up = (by - cy) / rad;
      if (layer >= 2 && up > 0.25 - layer * 0.08) continue;
      const k = layer * 0.1, rr = br * (1 - layer * 0.17);
      p.ellipse(bx - k * rad * 0.7, by - k * rad * 0.8, rr, rr * 0.82, tones[layer]);
    }
    for (let i = 0; i < rad * 3; i++) { const a = r() * PI * 2, d = Math.sqrt(r()) * rad * 0.7, x = cx + Math.cos(a) * d - rad * 0.12, y = cy + Math.sin(a) * d * 0.7 - rad * 0.12; if (p.alphaAt(x, y) && y < cy + rad * 0.1) { p.px(x, y, tones[4]); p.px(x + 1, y + 1, tones[3]); p.px(x - 1, y + 1, tones[0]); } }
  }
  function lampSprite(T, h, arm) {
    const g = T.grade, spr = mk(Math.abs(arm) + 12, h + 4), ox = arm < 0 ? spr.w - 5 : 4;
    spr.rect(ox - 1, 6, 3, h - 6, g('#2c2650')); spr.vline(ox - 1, 6, h - 6, g('#4a4274')); spr.rect(ox - 3, h - 4, 7, 4, g('#2c2650')); spr.rect(ox - 2, h - 8, 5, 3, g('#3a3358'));
    for (let j = 14; j < h - 10; j += 18) spr.hline(ox - 2, j, 5, g('#3a3358'));
    const hx = ox + arm; spr.hline(Math.min(ox, hx), 4, Math.abs(arm) + 1, g('#2c2650')); spr.hline(Math.min(ox, hx), 3, Math.abs(arm) + 1, g('#4a4274'));
    spr.rect(hx - 3, 5, 7, 3, g('#2c2650')); spr.hline(hx - 3, 5, 7, g('#4a4274')); spr.rect(hx - 2, 8, 5, 2, T.lamp ? '#fff3c4' : g('#c8c4dc')); spr.px(hx, 2, g('#4a4274'));
    return { spr, hx, hy: 9, ox };
  }

  /* ------------------------------------------------------------------ STREET */
  const SW = 810, SH = 480, FLOOR = 412, GROUND = 400;       // design units (x4/3 natively: 1080x640, floor 549)
  const sizeFor = (speed) => Math.round(270 + (SW - 270) * speed);

  function streetFar(T) {
    const W = sizeFor(0.25), p = mk(W, SH), r = rng(8101), g = T.grade;
    vgrad(p, 0, 0, W, 380, T.sky, 2.2);
    p.rect(0, 380, W, 100, T.farB);
    if (T.stars) for (let i = 0; i < 170; i++) { const x = r.int(W), y = r.int(230), a = 1 - y / 260; if (r() < a) { p.px(x, y, r() < 0.15 ? '#ffd0f0' : r() < 0.5 ? '#d8d4ff' : '#9a8ad8'); if (r() < 0.06) { p.px(x + 1, y, '#8e7ac8'); p.px(x - 1, y, '#8e7ac8'); p.px(x, y - 1, '#8e7ac8'); p.px(x, y + 1, '#8e7ac8'); } } }
    if (T.name === 'night') {                              // moon with craters + halo
      glow(p, 232, 84, 62, '#8a7cff', 0.34, { levels: 6 }); glow(p, 232, 84, 34, '#d8e4ff', 0.3, { levels: 5 });
      p.shadedEllipse(232, 84, 19, 19, { deep: '#8a90c0', shade: '#b5bce0', base: '#dce4ff', light: '#f3f6ff', hi: '#ffffff' }, -0.5, -0.5);
      p.ellipse(226, 80, 3, 3, '#aab2dc'); p.ellipse(238, 91, 4, 3, '#b3bbe2'); p.ellipse(237, 76, 2, 2, '#aab2dc'); p.px(225, 79, '#c9d0f0');
    } else if (T.name === 'dusk') {                        // huge low sun
      glow(p, 205, 215, 140, '#ff7a6a', 0.6, { levels: 7 }); glow(p, 205, 215, 84, '#ffd070', 0.6, { levels: 7 });
      { const q = p.raw, cx = 205 * S, cy = 215 * S, rr = 38 * S; for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > rr * rr) continue; const t = (y - (cy - rr)) / (2 * rr); if (t > 0.5 && ((y % 8) < (t - 0.45) * 11)) continue; const band = t < 0.3 ? 0 : t < 0.55 ? 1 : t < 0.8 ? 2 : 3, cs = ['#fff2a8', '#ffd24a', '#ff9a4a', '#ff5f7a'], edge = ((t * 100) % 12.5) < 1.2 && bay(x, y) < 0.5; q.px(x, y, edge && band > 0 ? cs[band - 1] : cs[band]); } }
    } else {
      glow(p, 250, 80, 70, '#fff0b0', 0.5, { levels: 6 }); p.ellipse(250, 80, 15, 15, '#fff4b8'); p.ellipse(250, 80, 12, 12, '#ffe66a'); p.ellipse(247, 77, 6, 6, '#fffbe0');
      for (let n = 0; n < 9; n++) {                         // banded clouds
        const cx = 20 + r.int(W - 40), cy = 40 + r.int(150), cw = 22 + r.int(36);
        for (let k = 0; k < 4; k++) { const ox = cx + (k - 1.5) * cw * 0.28, rw = cw * 0.3 + r.int(6); p.ellipse(ox, cy - (k % 2) * 3, rw, 5 + (k % 2) * 2, '#ffffff'); }
        p.rect(cx - cw * 0.5, cy + 3, cw, 3, '#dfe8fa'); p.rect(cx - cw * 0.45, cy + 5, cw * 0.9, 2, '#c4d2f0');
      }
    }
    // skyline in two depth rows + a landmark tower
    const rowsDef = [[T.farB, 180, 90, 0.22], [T.farA, 230, 80, 0.3]];
    for (const [col, topMin, topVar, wl] of rowsDef) {
      let x = -6;
      while (x < W) {
        const w = 14 + r.int(22), top = topMin + r.int(topVar) - (x > 80 && x < 140 ? 40 : 0), rim = T.name === 'night' ? '#4f3d8a' : T.name === 'dusk' ? '#e0789a' : '#ffffff';
        p.rect(x, top, w, 380 - top, col); p.hline(x, top, w, mix(col, rim, 0.45));
        if (r() < 0.3) { p.rect(x + 3, top - 4, w - 6, 4, col); p.hline(x + 3, top - 4, w - 6, mix(col, rim, 0.4)); }
        if (r() < 0.35) p.vline(x + (w >> 1), top - 8 - r.int(8), 9, col);
        if (T.win > 0.2) for (let wy = top + 4; wy < 370; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (r() < wl * T.win) p.rect(wx, wy, 1, 1, T.name === 'night' ? (r() < 0.2 ? '#ff8ad0' : '#ffbe55') : '#ffd37a', 190);
        x += w + r.int(3);
      }
    }
    const lx = 112; p.rect(lx, 128, 10, 252, mix(T.farB, T.fog, 0.15)); p.rect(lx + 3, 96, 4, 34, mix(T.farB, T.fog, 0.15)); p.vline(lx + 4, 70, 28, mix(T.farB, T.fog, 0.2));
    p.px(lx + 4, 69, T.name === 'day' ? '#ff6b6b' : '#ff2f4f'); if (T.name !== 'day') glow(p, lx + 4, 69, 7, '#ff2f4f', 0.7, { levels: 4 });
    for (let wy = 140; wy < 370; wy += 6) p.hline(lx + 1, wy, 8, mix(T.farB, T.fog, 0.35));
    // low haze band where the skyline meets the street
    fillFn(p, 0, 300, W, 92, (u, v, nx, ny) => (bay(nx, ny) < v * 0.85 ? [T.fog, 0, 0, 0, 170] : null));
    lift(p);
    return p;
  }

  function streetMid(T) {
    const W = sizeFor(0.6), p = mk(W, SH), r = rng(8202), g = T.grade, blink = [];
    let x = -10, i = 0;
    while (x < W) {
      const w = 34 + r.int(34), top = 105 + r.int(120) + (i % 4 === 2 ? 40 : 0), base = T.mid[i % 4], col = mix(base, T.fog, T.fogK * 0.55), edge = mix(base, T.fog, 0.15);
      p.rect(x, top, w, 420 - top, col); p.rect(x, top, w, 3, mix(col, '#ffffff', T.name === 'day' ? 0.18 : 0.08)); p.vline(x, top, 420 - top, mix(col, '#ffffff', 0.1)); p.vline(x + w - 1, top, 420 - top, mix(col, '#150d33', 0.25));
      p.rect(x - 1, top - 2, w + 2, 2, mix(col, '#ffffff', 0.18));
      // window grid
      const cw = 9, chh = 12;
      for (let wy = top + 8; wy < 380; wy += chh) for (let wx = x + 4; wx + 5 < x + w - 2; wx += cw) {
        const lit = r() < T.win * 0.75;
        if (lit) { const lc = T.name === 'day' ? '#bfe0ff' : mix(r.pick(['#ffd37a', '#ffbe55', '#ffe9a8', '#ff9ad0', '#8ae8ff']), col, 0.28); p.rect(wx, wy, 5, 7, lc); p.hline(wx, wy + 6, 5, mix(lc, '#c9577f', 0.4)); if (T.name !== 'day' && r() < 0.18) glow(p, wx + 2, wy + 3, 9, lc, 0.28, { levels: 4 }); }
        else p.rect(wx, wy, 5, 7, mix(col, '#150d33', T.name === 'day' ? 0.35 : 0.5));
      }
      // rooftop clutter
      const k = r.int(5);
      if (k === 0) { p.rect(x + 6, top - 9, 12, 7, mix(col, '#150d33', 0.15)); p.hline(x + 6, top - 9, 12, mix(col, '#fff', 0.25)); }
      else if (k === 1) { p.vline(x + (w >> 1), top - 22, 20, mix(col, '#150d33', 0.2)); p.hline(x + (w >> 1) - 4, top - 18, 9, mix(col, '#150d33', 0.2)); p.hline(x + (w >> 1) - 3, top - 13, 7, mix(col, '#150d33', 0.2)); if (T.name !== 'day') { p.px(x + (w >> 1), top - 23, '#ff2f4f'); glow(p, x + (w >> 1), top - 23, 5, '#ff2f4f', 0.7, { levels: 3 }); } }
      else if (k === 2) {                                   // water tank on stilts
        const tx = x + 8; p.rect(tx, top - 8, 2, 8, mix(col, '#150d33', 0.3)); p.rect(tx + 14, top - 8, 2, 8, mix(col, '#150d33', 0.3));
        p.rect(tx - 1, top - 22, 18, 14, mix('#6e4a3a', T.fog, T.fogK * 0.4)); p.vline(tx - 1, top - 22, 14, mix('#a07058', T.fog, 0.2)); for (let q = 0; q < 3; q++) p.hline(tx - 1, top - 19 + q * 4, 18, mix('#3a2230', T.fog, 0.2)); p.poly([[tx - 2, top - 22], [tx + 8, top - 29], [tx + 18, top - 22]], mix('#3a2230', T.fog, 0.3));
      }
      x += w + 1 + r.int(3) + (r() < 0.24 ? 18 + r.int(26) : 0); i++;
    }
    // a neon billboard on the mid skyline (dusk / night)
    const bx = 366, by = 150; p.rect(bx - 2, by - 2, 62, 24, mix('#2c1d4d', T.fog, 0.2)); p.vline(bx + 10, by + 22, 40, mix('#2c1d4d', T.fog, 0.2)); p.vline(bx + 46, by + 22, 40, mix('#2c1d4d', T.fog, 0.2));
    p.rect(bx, by, 58, 20, T.name === 'day' ? '#ffe6a8' : '#1f1536');
    const nb = World.neon('BEATS FM', T.name === 'day' ? '#ff6ba8' : '#ff3ea5', 1, { off: T.name === 'day' });
    p.blit(nb, bx + 29 - nb.w / S / 2, by + 10 - nb.h / S / 2);
    lift(p);
    return p;
  }

  // ---- near layer building painters. c = { p, T, r, lights, anim, hot }
  function neonOn(c, text, color, sc, x, y, o) {
    o = o || {}; const n = World.neon(text, color, fs(sc), { off: !c.T.neon }), dw = n.w / S, dh = n.h / S;
    const lx = o.cx ? x - dw / 2 : x;
    c.p.blit(n, lx, y);
    if (c.T.neon) c.lights.push({ x: lx + dw / 2, y: y + dh / 2, r: Math.round(dw * 0.75), color, a: 0.42, flicker: o.flicker === undefined ? 0.08 : o.flicker, kind: 'neon' });
    return n;
  }
  function doorFrame(c, cx, top, w, h, wood, stone) {
    const { p, T } = c, g = T.grade, x = cx - (w >> 1);
    p.rect(x - 4, top - 4, w + 8, h + 4, g(stone)); p.hline(x - 4, top - 4, w + 8, g(li(stone, 0.4))); p.vline(x - 4, top - 4, h + 4, g(li(stone, 0.25))); p.vline(x + w + 3, top - 4, h + 4, g(sh(stone, 0.35)));
    p.rect(x, top, w, h, g(wood));
  }
  function building(c, x, w, top, pal, ctrl) {
    const { p, T, r } = c, g = T.grade;
    brick(p, x, top, w, GROUND - top, [g(pal[0]), g(pal[1]), g(pal[2]), g(pal[3])], r);
    shadowTop(p, x, top + 8, w, 12, g('#1f1536'));
    p.rect(x, top, 4, GROUND - top, g(ctrl || '#b9a58a')); p.vline(x, top, GROUND - top, g(li(ctrl || '#b9a58a', 0.35))); p.rect(x + w - 4, top, 4, GROUND - top, g(ctrl || '#b9a58a')); p.vline(x + w - 1, top, GROUND - top, g(sh(ctrl || '#b9a58a', 0.3)));
    for (let j = 0; j < GROUND - top; j += 8) { p.hline(x, top + j, 4, g(sh(ctrl || '#b9a58a', 0.25))); p.hline(x + w - 4, top + j, 4, g(sh(ctrl || '#b9a58a', 0.25))); }
    cornice(c.p, x, top, w, T, ctrl);
    shadowBottom(p, x, GROUND - 10, w, 10, g('#1f1536'), 0.0);
  }

  function paintPark(c) {                               // x 0..150, gate centre 70
    const { p, T, r } = c, g = T.grade;
    for (const [cx, cy, rad] of [[22, 296, 30], [60, 278, 36], [110, 290, 34], [142, 300, 28], [84, 318, 22]]) tree(p, cx, cy, rad, T, r);
    for (let x = -4; x < 150; x += 20) p.ellipse(x + 10, 346 + (x % 3), 11, 8, g(ramp(T.leaf).shade));        // hedge
    // inside the gate: path into the park
    p.rect(53, 330, 34, 70, g('#1d3a3a')); vgrad(p, 53, 330, 34, 70, [[0, g('#2a5a4a')], [0.5, g('#2f6a4e')], [1, g('#244a40')]]);
    p.poly([[57, 400], [83, 400], [74, 340], [66, 340]], g('#d8bc92')); p.poly([[57, 400], [63, 400], [67, 340], [66, 340]], g('#a8926e')); for (let j = 346; j < 400; j += 9) p.hline(66 - (j - 340) * 0.15, j, 8 + (j - 340) * 0.3, g('#b89a74'));
    p.ellipse(60, 345, 6, 10, g('#2f7a52')); p.ellipse(80, 348, 6, 9, g('#2f7a52')); p.rect(58, 352, 2, 20, g('#4a2f3a')); p.rect(80, 354, 2, 18, g('#4a2f3a'));
    if (T.lamp) glow(p, 70, 350, 24, '#ffbe55', 0.4, { levels: 5 });
    // fence + wall base
    const iron = g('#241d40'), iron2 = g('#4a4274');
    for (const [fx, fw] of [[0, 40], [100, 50]]) {
      p.rect(fx, 378, fw, 22, g('#8a8aa8')); p.hline(fx, 378, fw, g('#c8c8e0')); for (let j = 384; j < 400; j += 5) p.hline(fx, j, fw, g('#6c6c88'));
      for (let i = 0; i < fw; i += 5) { p.vline(fx + i, 346, 32, iron); p.px(fx + i, 345, iron2); p.px(fx + i - 1, 347, iron); p.px(fx + i + 1, 347, iron); }
      p.hline(fx, 352, fw, iron); p.hline(fx, 372, fw, iron); p.hline(fx, 351, fw, iron2);
    }
    // stone pillars with caps and ball finials
    for (const px of [38, 88]) {
      p.rect(px, 318, 14, 82, g('#9a96b8')); p.vline(px, 318, 82, g('#c4c0e0')); p.vline(px + 13, 318, 82, g('#6a668a')); for (let j = 326; j < 400; j += 9) p.hline(px, j, 14, g('#7c78a0'));
      p.rect(px - 2, 314, 18, 5, g('#b4b0d0')); p.hline(px - 2, 314, 18, g('#dcd8f0')); p.hline(px - 2, 318, 18, g('#5c5880'));
      p.ellipse(px + 7, 308, 4, 4, g('#b4b0d0')); p.px(px + 6, 306, g('#f4f0ff'));
    }
    // wrought iron arch
    { const q = p.raw; for (let nx = R(52 * S); nx <= R(88 * S); nx++) { const t = (nx / S - 70) / 18, ny = R((328 - Math.sqrt(Math.max(0, 1 - t * t)) * 13) * S); q.px(nx, ny, iron2); q.px(nx, ny + 1, iron); q.px(nx, ny + 2, iron); q.px(nx, ny - 1, g('#6a62a0')); if (nx % 5 === 0) q.rect(nx, ny + 3, 1, 4, iron); } }
    p.vline(70, 313, 6, iron); p.px(70, 311, g('#ffe14d')); p.px(69, 312, g('#ffe14d')); p.px(71, 312, g('#ffe14d'));
    // sign plate hung on chains
    p.vline(46, 296, 20, iron); p.vline(94, 296, 20, iron); p.vline(47, 296, 20, iron2);
    plate(p, 40, 286, 60, 20, T.name === 'day' ? '#2f8a55' : '#1f6a4a', '#fff0c9', 'PARK', 2, { edge: g('#d8c8aa') });
    if (T.lamp) c.lights.push({ x: 70, y: 296, r: 36, color: '#9dff9a', a: 0.14, flicker: 0, kind: 'neon' });
    // gate pillar lamps
    for (const px of [45, 95]) { p.rect(px - 3, 301, 7, 6, g('#e8e0c8')); p.rect(px - 2, 302, 5, 4, T.lamp ? '#ffe9a8' : g('#cfc8b0')); if (T.lamp) { glow(p, px, 304, 14, '#ffbe55', 0.6, { levels: 5 }); c.lights.push({ x: px, y: 304, r: 42, color: '#ffbe55', a: 0.4, flicker: 0.03, kind: 'lamp' }); } }
    // park rules sign on the fence
    plate(p, 6, 356, 26, 14, '#c9577f', '#fff0c9', 'NO', 1, {});
  }

  function paintHome(c) {                               // x 150..300, door centre 225
    const { p, T, r } = c, g = T.grade, X = 150, Wd = 150, top = 96;
    building(c, X, Wd, top, ['#2a1a2a', '#8a3f3f', '#7a3438', '#9b4a42'], '#c7ad92');
    for (let fl = 0; fl < 4; fl++) for (let col = 0; col < 4; col++) {
      const wx = 162 + col * 30, wy = 112 + fl * 52;
      windowAt(c, wx, wy, 20, 32, r() < T.win, 'x');
      if (r() < 0.25 && fl > 0) acUnit(p, wx + 4, wy + 38, T);
      if (r() < 0.22) plant(p, wx + 5, wy + 33, T, r);
    }
    fireEscape(p, 216, 160, 66, 4, 52, T);
    ledge(p, X, 306, Wd, T);
    // laundry line
    p.line(160, 200, 206, 206, g('#d8c8aa')); for (let i = 0; i < 4; i++) { const lx = 166 + i * 11; p.rect(lx, 202 + (i > 1 ? 1 : 0), 6, 7, g(['#ff6b6b', '#2ee6ff', '#ffe14d', '#ffffff'][i])); }
    // doorway with fanlight, steps, plaque, buzzers
    doorFrame(c, 225, 340, 34, 60, '#5a2a45', '#cdb9a0');
    p.rect(209, 342, 32, 3, g('#3a1d2e')); for (const [px, py, pw, ph] of [[211, 348, 12, 20], [227, 348, 12, 20], [211, 372, 12, 24], [227, 372, 12, 24]]) { p.rect(px, py, pw, ph, g('#6e3454')); p.frame(px, py, pw, ph, g('#3a1d2e')); p.hline(px + 1, py + 1, pw - 2, g('#8a4a6c')); }
    p.ellipse(225, 334, 12, 5, g('#cdb9a0')); p.ellipse(225, 335, 9, 3, T.lamp ? '#ffd37a' : g('#7fb8ee')); p.rect(213, 335, 25, 6, g('#cdb9a0')); p.rect(215, 336, 21, 4, T.lamp ? '#ffd37a' : g('#7fb8ee')); p.vline(225, 331, 9, g('#8a6a4a'));
    p.rect(238, 372, 3, 3, g('#e8c040')); p.px(238, 372, '#fff6b8');
    p.rect(204, 396, 42, 4, g('#a8a2c0')); p.hline(204, 396, 42, g('#dcd8f0')); p.rect(208, 392, 34, 4, g('#9a94b8')); p.hline(208, 392, 34, g('#d0ccea'));
    p.rect(244, 360, 8, 18, g('#2c2650')); for (let i = 0; i < 3; i++) { p.rect(246, 362 + i * 5, 4, 3, T.lamp && i === 1 ? '#ffe9a8' : g('#c8c4dc')); }
    plate(p, 197, 308, 56, 20, T.name === 'day' ? '#1f6a7a' : '#1f6a7a', '#fff0c9', 'HOME', 2, { edge: g('#d8c8aa') });
    p.rect(198, 330, 54, 3, g('#cdb9a0')); p.hline(198, 330, 54, g('#efe2c8'));
    // house number on a brass disc
    p.ellipse(266, 346, 7, 7, g('#9a7a20')); p.ellipse(266, 346, 6, 6, g('#e8c040')); p.ellipse(265, 345, 3, 3, g('#fff0a0')); FD(p, '12', 261, 343, g('#4a2f10'), { scale: 1 });
    // ground floor flank: barred window + graffiti + poster
    p.rect(164, 350, 30, 28, g('#2a2450')); p.frame(164, 350, 30, 28, g('#cdb9a0')); for (let i = 168; i < 192; i += 5) p.vline(i, 351, 26, g('#6c668a')); p.hline(165, 363, 28, g('#6c668a'));
    if (T.win > 0.3) { p.rect(165, 351, 28, 26, g('#6a4a3a')); for (let i = 168; i < 192; i += 5) p.vline(i, 351, 26, g('#2a2450')); p.hline(165, 363, 28, g('#2a2450')); c.lights.push({ x: 179, y: 364, r: 30, color: '#ffbe55', a: 0.3, flicker: 0.03, kind: 'window' }); }
    graffiti(c, 'YO', 158, 380, 2, '#ff9a4a', '#ff3ea5');
    poster(c, 264, 372, 18, 24, 1); poster(c, 284, 376, 11, 16, 2);
    p.vline(296, 110, 290, g('#5c5880')); p.vline(295, 110, 290, g('#8a86a8'));
  }

  function paintShop(c) {                               // x 335..465, door centre 395
    const { p, T, r } = c, g = T.grade, X = 335, Wd = 130, top = 236;
    building(c, X, Wd, top, ['#3a1d2e', '#b4604a', '#a45444', '#c4705a'], '#d9c3a0');
    for (const wx of [350, 394, 438]) windowAt(c, wx, 252, 22, 30, r() < T.win, 'x');
    plant(p, 361, 285, T, r, true); acUnit(p, 400, 288, T);
    ledge(p, X, 293, Wd, T);
    // sign board
    p.rect(344, 297, 112, 29, g('#2c1d4d')); p.frame(344, 297, 112, 29, g('#d4a017')); p.frame(346, 299, 108, 25, g('#7a5c10'));
    const em = (c) => (T.name === 'day' ? g(c) : c);
    FD(p, 'THRIFT', 350, 302, em('#ffd23a'), { scale: 2, shadow: g('#150d33') }); FD(p, 'SHOP', 434, 302, em('#ff9ad0'), { scale: 1, shadow: g('#150d33') });
    FD(p, '@ $1 @', 432, 313, em('#9dff4a'), { scale: 1 });
    if (T.lamp) c.lights.push({ x: 400, y: 311, r: 56, color: '#ffd23a', a: 0.14, flicker: 0.02, kind: 'neon' });
    // striped awning with scalloped edge
    for (let i = 0; i < 112; i += 8) { const col = (i / 8) % 2 ? '#fff0d0' : '#d63c4a'; p.poly([[344 + i, 330], [352 + i, 330], [352 + i + 1, 342], [344 + i - 1, 342]], g(col)); p.ellipse(348 + i, 343, 4, 2, g(col)); }
    p.hline(342, 329, 116, g('#7a1f2f')); p.hline(342, 330, 116, g('#a02a3a')); shadowBottom(p, 344, 346, 112, 8, g('#150d33'), 0.8);
    // store windows: left clothes rack + hats, right shades + mannequin
    const lit = (T.name !== 'day');
    for (const [wx, ww] of [[343, 28], [419, 38]]) { p.rect(wx, 348, ww, 46, g('#2a2450')); p.rect(wx + 1, 349, ww - 2, 44, lit ? '#ffcf78' : g('#cdb8d8')); fillFn(p, wx + 1, 349, ww - 2, 44, (u, v, nx, ny) => (bay(nx, ny) < v * 0.75 ? [lit ? '#ffb15a' : g('#a898c0'), 0, 0, 0, 255] : null)); p.frame(wx, 348, ww, 46, g('#f0e4cc')); p.hline(wx + 1, 349, ww - 2, '#fff7d8'); }
    p.hline(345, 365, 24, g('#8a6a4a')); for (let i = 0; i < 5; i++) { p.rect(347 + i * 5, 366, 3, 16, g(['#ff6b6b', '#2ee6ff', '#a86bff', '#ffe14d', '#9dff4a'][i])); p.px(348 + i * 5, 365, g('#46405e')); }
    for (let i = 0; i < 3; i++) { p.ellipse(351 + i * 9, 355, 4, 2, g(['#c9577f', '#3a5fcd', '#e8c040'][i])); p.hline(348 + i * 9, 356, 7, g('#2c1d4d')); }
    p.rect(425, 372, 8, 20, g('#d8b098')); p.ellipse(429, 366, 4, 4, g('#d8b098')); p.rect(423, 374, 12, 14, g('#ff9ad0')); p.hline(423, 374, 12, g('#ffd0ea')); p.rect(445, 385, 8, 8, g('#8a3f3f')); p.ellipse(449, 381, 5, 3, g('#e8c040'));
    p.rect(437, 360, 16, 5, g('#2c1d4d')); p.rect(438, 361, 6, 3, g('#2ee6ff')); p.rect(446, 361, 6, 3, g('#2ee6ff')); p.hline(444, 362, 2, g('#2c1d4d'));
    p.rect(423, 351, 24, 7, g('#d63c4a')); FD(p, 'SALE', 425, 352, g('#fff0c9'), { scale: 1 });
    // door with glass and OPEN sign
    doorFrame(c, 395, 342, 30, 58, '#2a2450', '#d9c3a0');
    p.rect(382, 356, 26, 36, lit ? '#ffcf78' : g('#cdb8d8')); p.frame(381, 355, 28, 38, g('#6a4a3a')); p.vline(395, 356, 36, g('#6a4a3a')); p.rect(383, 362, 8, 12, g('#c9577f')); p.rect(399, 368, 6, 14, g('#3a5fcd'));
    p.rect(391, 376, 3, 6, g('#e8c040'));
    plate(p, 386, 344, 18, 8, '#150d33', '#fff0c9', 'OPEN', 1, { shadow: null });
    if (c.T.neon) { c.lights.push({ x: 395, y: 342, r: 20, color: '#ff3ea5', a: 0.3, flicker: 0.1, kind: 'neon' }); }
    if (lit) { c.lights.push({ x: 357, y: 372, r: 42, color: '#ffbe55', a: 0.34, flicker: 0.02, kind: 'window' }); c.lights.push({ x: 438, y: 372, r: 46, color: '#ffbe55', a: 0.34, flicker: 0.02, kind: 'window' }); }
    // hanging "SALE" tags
    p.vline(341, 262, 8, g('#4a4274'));
  }

  function paintStudio(c) {                             // x 478..640, door centre 560
    const { p, T, r } = c, g = T.grade, X = 478, Wd = 162, top = 176;
    building(c, X, Wd, top, ['#141a30', '#243a5a', '#1f3250', '#2c4668'], '#5a7a9a');
    for (let fl = 0; fl < 2; fl++) for (let col = 0; col < 4; col++) windowAt(c, 488 + col * 38, 194 + fl * 50, 22, 30, r() < T.win, 'dark');
    for (let col = 0; col < 4; col++) if (col === 1) { p.rect(526, 196, 22, 26, g('#2c1d4d')); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) p.rect(527 + i * 5, 197 + j * 6, 4, 5, g((i + j) % 2 ? '#3a2a66' : '#4f3a88')); }
    ledge(p, X, 296, Wd, T, '#5a7a9a');
    // dish + roof stuff
    p.ellipse(500, 170, 8, 4, g('#c8c4dc')); p.vline(500, 170, 6, g('#6c6888')); p.px(504, 166, '#ff2f4f');
    // neon SOUND LAB
    p.rect(494, 298, 132, 34, g('#101a30')); p.frame(494, 298, 132, 34, g('#2a4a6a')); p.hline(496, 300, 128, g('#1a2a48'));
    const nl = neonOn(c, 'SOUND LAB', '#2ee6ff', 2, 560, 300, { cx: true });
    for (let i = 0; i < 9; i++) { const hh = [2, 3, 4, 2, 4, 3, 2, 4, 3][i]; p.rect(528 + i * 6, 328 - hh, 2, hh, g(i % 2 ? '#ff3ea5' : '#2ee6ff')); }
    // studio door: padded with porthole, ON AIR light
    doorFrame(c, 560, 342, 34, 58, '#1c1c34', '#5a7a9a');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) p.rect(545 + i * 11, 348 + j * 12, 9, 10, g((i + j) % 2 ? '#2a2a50' : '#34346a'));
    p.ellipse(560, 366, 6, 6, g('#9a96b0')); p.ellipse(560, 366, 4, 4, T.lamp ? '#7ae9ff' : g('#7fb8ee')); p.px(558, 364, '#ffffff'); p.rect(570, 372, 3, 6, g('#c0c0d8'));
    plate(p, 548, 334, 24, 8, '#8a1f2f', '#fff0c9', 'REC', 1, { shadow: null }); if (T.name !== 'day') { glow(p, 560, 338, 14, '#ff2f4f', 0.7, { levels: 4 }); c.lights.push({ x: 560, y: 338, r: 28, color: '#ff2f4f', a: 0.36, flicker: 0.12, kind: 'neon' }); }
    // side windows: foam wall + mic
    for (const wx of [484, 588]) { p.rect(wx, 346, 46, 48, g('#101a30')); p.frame(wx, 346, 46, 48, g('#5a7a9a')); p.rect(wx + 1, 347, 44, 46, T.name === 'day' ? g('#6a5a9a') : '#43296f'); for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) { const q = (i + j) % 2; p.rect(wx + 2 + i * 7, 348 + j * 9, 6, 8, q ? g('#34246a') : g('#52389a')); p.hline(wx + 2 + i * 7, 348 + j * 9, 6, g('#7a5ac0')); } }
    p.rect(610, 360, 2, 26, g('#9a96b0')); p.ellipse(611, 358, 4, 5, g('#c8c4dc')); p.hline(607, 386, 9, g('#9a96b0'));
    for (const sx of [490, 520]) { p.rect(sx, 372, 14, 20, g('#1c1c34')); p.ellipse(sx + 7, 378, 4, 4, g('#46405e')); p.ellipse(sx + 7, 386, 3, 3, g('#46405e')); p.px(sx + 7, 378, g('#7ae9ff')); }
    if (T.name !== 'day') { c.lights.push({ x: 507, y: 370, r: 36, color: '#a86bff', a: 0.3, flicker: 0.05, kind: 'window' }); c.lights.push({ x: 611, y: 370, r: 36, color: '#a86bff', a: 0.3, flicker: 0.05, kind: 'window' }); }
  }

  function paintBar(c) {                                // x 650..810, door centre 725
    const { p, T, r } = c, g = T.grade, X = 650, Wd = 160, top = 196;
    building(c, X, Wd, top, ['#220f1e', '#5b2a35', '#4e2330', '#6a303a'], '#a88a78');
    for (let fl = 0; fl < 2; fl++) for (let col = 0; col < 4; col++) windowAt(c, 662 + col * 36, 214 + fl * 50, 22, 30, r() < T.win, 'x');
    // window neon beer sign in the middle upper window
    if (T.neon) { const n = World.neon('OPEN', '#9dff4a', 1); p.blit(n, 698 - 5 + 1, 226); }
    ledge(p, X, 296, Wd, T, '#a88a78');
    // neon THE BAR + martini + mic
    p.rect(666, 297, 100, 29, g('#1a0d1a')); p.frame(666, 297, 100, 29, g('#7a3a4a'));
    neonOn(c, 'THE BAR', '#ff3ea5', 2, 716, 298, { cx: true });
    // martini glass neon
    const mc = T.neon ? '#2ee6ff' : g('#7a9ab0');
    p.poly([[775, 300], [793, 300], [784, 313]], mc); p.poly([[777, 301], [791, 301], [784, 311]], T.neon ? '#0f1a30' : g('#2a2450')); p.vline(784, 313, 10, mc); p.hline(779, 323, 11, mc); p.ellipse(786, 304, 2, 2, T.neon ? '#9dff4a' : g('#4f9a4a')); p.line(783, 300, 790, 297, T.neon ? '#ffe14d' : g('#9a8a30'));
    if (T.neon) { glow(p, 784, 310, 18, '#2ee6ff', 0.4, { levels: 4 }); c.lights.push({ x: 784, y: 310, r: 34, color: '#2ee6ff', a: 0.32, flicker: 0.06, kind: 'neon' }); }
    // door + awning
    doorFrame(c, 725, 340, 34, 60, '#3a1d1f', '#8a6a5a');
    for (const dx of [708, 726]) { p.rect(dx + 1, 342, 15, 54, g('#4e2a2a')); p.frame(dx + 1, 342, 15, 54, g('#2a1418')); p.ellipse(dx + 8, 358, 4, 4, g('#2a1418')); p.ellipse(dx + 8, 358, 3, 3, T.lamp ? '#ffb15a' : g('#8a8aa8')); p.rect(dx + 3, 372, 11, 20, g('#5e3434')); }
    p.rect(721, 372, 2, 7, g('#e8c040')); p.rect(728, 372, 2, 7, g('#e8c040'));
    for (let i = 0; i < 56; i += 8) { const col = (i / 8) % 2 ? '#150d33' : '#c9577f'; p.poly([[698 + i, 328], [706 + i, 328], [707 + i, 339], [697 + i, 339]], g(col)); } p.hline(696, 327, 58, g('#ff3ea5')); shadowBottom(p, 698, 340, 56, 6, g('#150d33'), 0.8);
    if (T.lamp) c.lights.push({ x: 725, y: 372, r: 44, color: '#ff9a4a', a: 0.32, flicker: 0.03, kind: 'window' });
    // chalkboard A-frame on the sidewalk
    p.poly([[672, 366], [692, 366], [695, 400], [669, 400]], g('#5e3a2a')); p.poly([[674, 369], [690, 369], [692, 397], [672, 397]], g('#1c2a2a')); FD(p, 'LIVE', 676, 372, '#fff0c9', { scale: 1 }); FD(p, 'MIC', 678, 381, '#ff9ad0', { scale: 1 }); FD(p, 'NITE', 676, 390, '#9dff4a', { scale: 1 });
    poster(c, 764, 350, 16, 22, 3); poster(c, 784, 360, 14, 20, 0);
  }

  function paintStreet(c) {
    const { p, T, r } = c, g = T.grade;
    paintPark(c); paintHome(c); paintShop(c); paintStudio(c); paintBar(c);
    // alley bits
    c.p.rect(300, 372, 24, 28, g('#2f6a4a')); p.hline(300, 372, 24, g('#4f9a6a')); p.rect(298, 368, 28, 5, g('#245a3c')); p.hline(298, 368, 28, g('#5fae7a')); for (let j = 380; j < 398; j += 6) p.hline(300, j, 24, g('#245a3c')); p.rect(302, 392, 3, 8, g('#150d33'));
    graffiti(c, 'BOX', 304, 352, 1, '#9dff4a', '#ff3ea5');
    // bus stop pole + sign
    p.vline(331, 340, 60, g('#7a78a0')); p.vline(332, 340, 60, g('#4a4674')); p.ellipse(331, 337, 7, 7, g('#3a5fcd')); p.ellipse(331, 337, 6, 6, g('#e8f0ff')); p.ellipse(331, 337, 5, 5, g('#2a4fb0')); FD(p, 'BUS', 326, 335, g('#ffffff'), { scale: 1 });
    p.rect(327, 350, 9, 6, g('#e8f0ff')); p.hline(328, 352, 7, g('#7a78a0')); p.hline(328, 354, 5, g('#7a78a0'));
    // between shop and studio / studio and bar: drain pipes and posters
    p.vline(470, 250, 150, g('#5c5880')); p.vline(645, 200, 200, g('#5c5880'));
    hydrant(p, 153, GROUND + 9, T); bike(p, 438, GROUND + 6, T); trash(p, 515, GROUND + 8, T); trash(p, 528, GROUND + 9, T); trash(p, 262, GROUND + 9, T);
    // newspaper box and crate
    p.rect(603, 380, 14, 20, g('#2a5fb0')); p.hline(603, 380, 14, g('#5a8ae0')); p.rect(605, 383, 10, 6, g('#cfe0ff')); p.rect(603, 399, 14, 1, g('#150d33'));
  }

  function paintGround(c) {
    const { p, T, r } = c, g = T.grade;
    // sidewalk 400..432, curb 432..436, road 436..480 (native painting)
    const q = p.raw, GN = R(GROUND * S), CN = R(432 * S), RN = R(436 * S);
    for (let ny = GN; ny < CN; ny++) for (let nx = 0; nx < q.w; nx++) {
      const t = (ny - GN) / (CN - GN), i = t < 0.45 ? 0 : t < 0.8 ? 1 : 2;
      q.px(nx, ny, bay(nx, ny) < ((t * 5) % 1) * 0.4 ? T.sidewalk[Math.min(2, i + 1)] : T.sidewalk[i]);
    }
    for (let x = 0; x < q.w; x += 40) { const o = ((x / 40) % 2) ? 20 : 0; q.rect(x + o, GN + 1, 1, 21, T.sidewalk[2]); q.rect(x + 20 - o, GN + 22, 1, CN - GN - 23, T.sidewalk[2]); }
    q.rect(0, GN, q.w, 1, T.sidewalk[2]); q.rect(0, GN + 21, q.w, 1, T.sidewalk[2]); q.rect(0, GN + 1, q.w, 1, mix(T.sidewalk[0], '#ffffff', 0.15));
    for (let n = 0; n < 60; n++) { const cx = r.int(q.w), cy = GN + 2 + r.int(CN - GN - 4), l = 4 + r.int(10); let x = cx, y = cy; for (let k = 0; k < l; k++) { q.px(x, y, T.sidewalk[2]); x += r.int(3) - 1 + 1; y += r.int(2); } }   // cracks
    for (let n = 0; n < 14; n++) q.px(r.int(q.w), GN + 2 + r.int(CN - GN - 4), g('#a89a8a'), 160);                                                                 // gum
    p.rect(0, 432, SW, 4, g('#9a94b8')); p.hline(0, 432, SW, g('#cfcbe6')); p.hline(0, 435, SW, g('#4a4468'));
    for (let ny = RN; ny < q.h; ny++) for (let nx = 0; nx < q.w; nx++) { const t = (ny - RN) / (q.h - RN); q.px(nx, ny, bay(nx, ny) < t * 0.6 ? T.road[1] : T.road[0]); }
    for (let i = 0; i < 900; i++) q.px(r.int(q.w), RN + 1 + r.int(q.h - RN - 1), g(r() < 0.6 ? '#5a5672' : '#2a2640'));          // asphalt speckle
    for (let n = 0; n < 7; n++) { let x = r.int(q.w), y = RN + 4 + r.int(q.h - RN - 12); for (let k = 0; k < 30; k++) { q.px(x, y, g('#15102a')); x += 1; y += r.int(3) - 1; } }                    // road cracks
    q.rect(300, RN + 14, 70, 9, g(mix(T.road[0], '#000000', 0.12))); q.rect(940, RN + 20, 50, 8, g(mix(T.road[1], '#ffffff', 0.04)));                                        // patched asphalt
    for (let x = 14; x < q.w; x += 62) q.rect(x, R(468 * S), 35, 3, g('#c8b88a'));                                                                                    // lane dashes
    // manhole
    p.ellipse(250, 449, 11, 3, g('#1c1a2b')); p.ellipse(250, 449, 9, 2, g('#46405e')); for (let i = -6; i <= 6; i += 3) p.vline(250 + i, 448, 2, g('#241f38'));
    // curb drain + litter
    p.rect(120, 433, 12, 3, g('#150d33'));
    for (let i = 0; i < 46; i++) q.px(14 + r.int(1050), GN + 3 + r.int(40), r.pick(['#fff0c9', '#ff6b6b', '#c9577f', '#8a86a8', '#ffe14d']));
    p.rect(412, 424, 5, 3, g('#fff0c9')); p.rect(414, 425, 3, 2, g('#d63c4a')); p.rect(566, 420, 4, 3, g('#e8c040'));
  }

  function lampPosts(c, xs) {
    const { p, T } = c;
    for (const x of xs) {
      const ls = lampSprite(T, 92, x > 400 ? -22 : 22, 1), by = 428;
      standing(p, ls.spr, x + (ls.spr.w >> 1) - ls.ox, by, T.wet * 0.9);
      const hx = x - ls.ox + (ls.spr.w >> 1) + (ls.hx - (ls.spr.w >> 1)), hy = by - ls.spr.h + ls.hy;
      c.lampXY = c.lampXY || []; c.lampXY.push([hx, hy, by]);
    }
  }

  function lightPass(c) {
    const { p, T } = c;
    // lamp halos, cones and wet streaks
    for (const [hx, hy, by] of c.lampXY || []) {
      if (!T.lamp) continue;
      glow(p, hx, hy, 20, '#ffd070', 0.9, { levels: 6 }); cone(p, hx, hy + 2, by - hy - 6, 34, '#ffb04a', 0.28);
      glow(p, hx, 414, 46, '#ffb04a', 0.34, { sy: 0.3, levels: 5 }); glow(p, hx, 452, 5, '#ffe9a8', 0.8, { sy: 5, levels: 4 });
      c.lights.push({ x: hx, y: hy, r: 78, color: '#ffbe55', a: 0.5, flicker: 0.02, kind: 'lamp' });
    }
    // glow pools on the pavement under lit shop windows / neon
    if (T.neon) for (const l of c.lights) {
      if (l.kind === 'neon') { glow(p, l.x, 408, Math.min(40, l.r), l.color, 0.18, { sy: 0.4, levels: 4 }); glow(p, l.x, 452, 6, l.color, 0.5, { sy: 5, levels: 4 }); }
      if (l.kind === 'window' && l.y > 330) glow(p, l.x, 412, l.r, l.color, 0.2, { sy: 0.32, levels: 4 });
    }
  }

  function car(c, x, baseY) {                          // parked hatchback seen from the side, facing right
    const { p, T } = c, g = T.grade, spr = mk(74, 30), body = '#d63c4a', RR = ramp(body);
    spr.poly([[2, 22], [2, 14], [10, 11], [22, 3], [48, 3], [58, 11], [70, 14], [72, 22]], g(RR.base));
    spr.poly([[24, 5], [47, 5], [55, 11], [14, 11]], g('#2a2450')); spr.poly([[26, 6], [34, 6], [34, 10], [20, 10]], g('#7fb8ee')); spr.poly([[37, 6], [46, 6], [52, 10], [37, 10]], g('#7fb8ee')); spr.vline(35, 5, 6, g(RR.deep));
    spr.hline(4, 14, 66, g(RR.light)); spr.hline(3, 21, 68, g(RR.shade)); spr.hline(24, 4, 24, g(RR.light)); spr.rect(2, 22, 70, 2, g('#2c2650'));
    spr.rect(66, 15, 5, 3, T.lamp ? '#fff3c4' : g('#e8e0c8')); spr.rect(2, 15, 3, 3, T.lamp ? '#ff2f4f' : g('#8a2a34')); spr.hline(34, 17, 4, g(RR.deep));
    for (const wx of [15, 56]) { spr.ellipse(wx, 23, 6, 6, g('#1c1233')); spr.ellipse(wx, 23, 3, 3, g('#9a96b0')); spr.px(wx, 23, g('#e8e8f8')); }
    standing(p, spr, x, baseY, T.wet * 1.1);
    if (T.lamp) { glow(p, x + 35, baseY - 12, 14, '#fff3c4', 0.9, { levels: 4 }); glow(p, x + 54, baseY - 8, 26, '#ffe9a8', 0.3, { sx: 1.6, sy: 0.4, levels: 4 }); glow(p, x - 35, baseY - 13, 12, '#ff2f4f', 0.7, { levels: 4 }); c.lights.push({ x: x + 36, y: baseY - 12, r: 36, color: '#ffe9a8', a: 0.4, flicker: 0, kind: 'lamp' }, { x: x - 34, y: baseY - 12, r: 20, color: '#ff2f4f', a: 0.35, flicker: 0, kind: 'lamp' }); }
  }
  function streetNear(T) {
    const p = mk(SW, SH), r = rng(8303 + T.name.length * 7), c = { p, T, r, lights: [], anim: [], lampXY: [] };
    paintStreet(c);
    paintGround(c);
    if (T.wet > 0.1) wet(p, GROUND, 34, Math.min(0.85, T.wet * 1.25), T.puddle, 17, { x0: 0, x1: SW });
    car(c, 590, 474);
    lampPosts(c, [146, 470, 648]);
    // puddles with sky reflections
    for (const [x, y, w] of [[90, 418, 16], [255, 424, 12], [420, 420, 18], [600, 417, 14], [700, 426, 20], [182, 450, 20], [520, 455, 24], [380, 462, 18], [770, 454, 18]]) puddle(p, x, y, w, T, r);
    lightPass(c);
    ripples(p, 55, T.name === 'day' ? 4 : 16, 0, 440, SW, 478, T.name === 'day' ? '#ffffff' : '#c8c0ff');
    lift(p);
    return c;
  }

  function streetFg(T, c) {
    const f = mk(SW, SH), g = T.grade, r = rng(8404);
    // sagging power cables between poles, with a pair of sneakers over one wire
    const fq = f.raw, cab = (x0, y0, x1, y1, sag) => { x0 = R(x0 * S); y0 = R(y0 * S); x1 = R(x1 * S); y1 = R(y1 * S); sag = sag * S; for (let x = x0; x <= x1; x++) { const t = (x - x0) / (x1 - x0), y = y0 + (y1 - y0) * t + Math.sin(t * PI) * sag; fq.px(x, Math.round(y), g('#2c2650')); if (x % 3 === 0) fq.px(x, Math.round(y) + 1, g('#46405e'), 140); if (x % 47 === 0) fq.rect(x, Math.round(y) - 2, 2, 3, g('#6a62a0')); } };
    cab(-4, 30, 270, 46, 12); cab(270, 46, 540, 36, 14); cab(540, 36, 814, 52, 12); cab(-4, 42, 330, 52, 10); cab(330, 52, 814, 40, 9); cab(-4, 54, 400, 62, 8); cab(400, 62, 814, 48, 7);
    const sx = 205, sy = 38; f.line(sx, sy, sx, sy + 7, g('#d8c8aa')); f.line(sx + 5, sy + 1, sx + 5, sy + 8, g('#d8c8aa')); f.rect(sx - 2, sy + 7, 5, 3, g('#ff3ea5')); f.rect(sx + 3, sy + 8, 5, 3, g('#2ee6ff')); f.hline(sx - 2, sy + 10, 5, g('#fff0c9')); f.hline(sx + 3, sy + 11, 5, g('#fff0c9'));
    // festival bunting over the bar side
    for (let i = 0; i < 12; i++) { const x = 560 + i * 20, y = 60 + Math.round(Math.sin(i / 11 * PI) * 10); f.px(x, y, g('#2c2650')); f.poly([[x, y + 1], [x + 8, y + 1], [x + 4, y + 8]], g(['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a'][i % 4])); }
    for (let nx = R(560 * S); nx < R(800 * S); nx++) fq.px(nx, R((60 + Math.sin((nx / S - 560) / 220 * PI) * 10) * S), g('#2c2650'));
    // leaves hanging in from the top-left corner (from the park trees)
    for (let i = 0; i < 28; i++) { const x = r.int(46), y = r.int(30) + (x < 20 ? 6 : 0); f.ellipse(x, y, 4 + r.int(4), 3 + r.int(2), g(ramp(T.leaf)[['deep', 'shade', 'base'][r.int(3)]])); }
    return lift(f);
  }

  function buildStreet(variant) {
    const v = variant || 'night'; const T = TH[v];
    if (!T) throw new Error('BBH.World.scene street: unknown variant "' + v + '" (day|dusk|night)');
    const far = streetFar(T), mid = streetMid(T), c = streetNear(T);
    const doors = [['park', 70, 'Park'], ['home', 225, 'Home'], ['shop', 395, 'Thrift Shop'], ['studio', 560, 'Sound Lab'], ['bar', 725, 'The Bar']];
    const hotspots = doors.map(([id, x, label]) => ({ id, label, x: x - 24, y: 322, w: 48, h: 84 }));
    const spots = {}; for (const [id, x] of doors) spots['door_' + id] = { x, y: FLOOR };
    spots.stand = { x: 225, y: FLOOR };
    const anim = [{ kind: 'steam', x: 250, y: 447 }, { kind: 'cat', x: 316, y: 370, dir: 1 }, { kind: 'neon_flicker', x: 560, y: 312 }, { kind: 'neon_flicker', x: 720, y: 310 }, { kind: 'rain', on: false }];
    return mkScene('street', v, R(SW * S), R(SH * S), {
      layers: [{ pix: far.raw, speed: 0.25 }, { pix: mid.raw, speed: 0.6 }, { pix: c.p.raw, speed: 1 }], fg: streetFg(T, c).raw, floorY: R(FLOOR * S), spots: sSpots(spots), hotspots: sHot(hotspots), lights: sLights(c.lights), anim: sAnim(anim),
    });
  }
  World.builders.street = buildStreet;

  /* ------------------------------------------------------------------ PARK (270x480) */
  function skylineRow(p, r, T, x0, x1, baseY, topMin, topVar, col, wl, step) {
    const rim = T.name === 'night' ? '#4f3d8a' : T.name === 'dusk' ? '#e0789a' : '#ffffff'; let x = x0;
    while (x < x1) {
      const w = 10 + r.int(16), top = topMin + r.int(topVar);
      p.rect(x, top, w, baseY - top, col); p.hline(x, top, w, mix(col, rim, 0.4));
      if (r() < 0.3) p.vline(x + (w >> 1), top - 6 - r.int(6), 7, col);
      if (T.win > 0.2) for (let wy = top + 3; wy < baseY - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (r() < wl * T.win) p.rect(wx, wy, 1, 1, T.name === 'night' ? (r() < 0.2 ? '#ff8ad0' : '#ffbe55') : '#ffd37a', 200);
      x += w + r.int(2);
    }
  }
  function bench(p, x, y, T, wide) {                    // wooden bench, feet at y, left edge x
    const g = T.grade, w = wide || 92, iron = g('#241d40');
    p.rect(x + 4, y - 22, w - 8, 3, g('#a8683a')); p.rect(x + 4, y - 18, w - 8, 3, g('#a8683a')); p.rect(x + 4, y - 14, w - 8, 3, g('#a8683a'));
    p.hline(x + 4, y - 22, w - 8, g('#d8905a')); p.hline(x + 4, y - 18, w - 8, g('#d8905a')); p.hline(x + 4, y - 14, w - 8, g('#d8905a'));
    p.rect(x + 2, y - 10, w - 4, 4, g('#8a4f30')); p.hline(x + 2, y - 10, w - 4, g('#c8804e')); p.rect(x + 2, y - 6, w - 4, 1, g('#4a2a28'));
    for (const lx of [x + 6, x + w - 9]) { p.rect(lx, y - 26, 3, 26, iron); p.rect(lx - 2, y - 2, 7, 2, iron); p.vline(lx, y - 26, 26, g('#4a4274')); p.rect(lx - 2, y - 11, 7, 2, iron); }
    shadowBottom(p, x, y, w, 4, g('#150d33'), 0.8);
  }
  function fountain(p, cx, y, T, r) {                   // y = ground line of the basin front
    const g = T.grade, night = T.name === 'night', water = night ? '#3a7ae8' : T.name === 'dusk' ? '#6a8ae8' : '#6fc8ff';
    p.ellipse(cx, y - 4, 24, 8, g('#9a96b8')); p.ellipse(cx, y - 5, 22, 7, g('#c4c0e0')); p.ellipse(cx, y - 5, 19, 5, g(water)); p.ellipse(cx - 4, y - 6, 9, 2, g(li(water, 0.35)));
    p.hline(cx - 24, y - 2, 49, g('#6a668a'));
    p.rect(cx - 3, y - 22, 6, 18, g('#b4b0d0')); p.vline(cx - 3, y - 22, 18, g('#dcd8f0')); p.vline(cx + 2, y - 22, 18, g('#7c78a0'));
    p.ellipse(cx, y - 22, 11, 3, g('#b4b0d0')); p.ellipse(cx, y - 23, 9, 2, g(li(water, 0.1))); p.ellipse(cx, y - 14, 5, 2, g('#a4a0c4'));
    for (const s of [-1, 1]) for (let t = 0; t < 14; t++) { const u = t / 13, x = cx + s * (u * 13), yy = y - 36 + Math.round((u * u) * 18 + (1 - u) * 0); p.px(x, yy, night ? '#9ad0ff' : '#e8f8ff'); if (t % 3 === 0) p.px(x + s, yy + 1, g(li(water, 0.5))); }
    p.vline(cx, y - 34, 12, night ? '#9ad0ff' : '#e8f8ff'); p.px(cx, y - 36, '#ffffff');
    for (let i = 0; i < 9; i++) p.px(cx - 16 + r.int(32), y - 7 + r.int(4), '#ffffff', 170);
  }
  function parkTrunkLeaf(p, T, r, x, baseY, topY, w) {
    const g = T.grade, tw = Math.max(6, w * 0.55), hw = w / 2, ht = tw / 2;
    p.poly([[x - hw, baseY], [x - ht, topY], [x + ht, topY], [x + hw, baseY]], g('#5e3a3a'));
    p.poly([[x - hw, baseY], [x - ht, topY], [x - ht + 3, topY], [x - hw + 4, baseY]], g('#8a5a4a'));
    p.poly([[x + hw - 4, baseY], [x + ht - 2, topY], [x + ht, topY], [x + hw, baseY]], g('#3a2230'));
    for (let j = topY + 10; j < baseY - 6; j += 11) p.hline(x - hw / 2 + (j % 3), j, 3, g('#3a2230'));
    p.poly([[x - hw - 7, baseY + 1], [x - hw + 1, baseY - 12], [x + hw - 1, baseY - 12], [x + hw + 7, baseY + 1]], g('#5e3a3a'));
    p.line(x, topY + 6, x - 18, topY - 14, g('#5e3a3a'), 4); p.line(x, topY + 8, x + 20, topY - 10, g('#5e3a3a'), 4); p.line(x - 1, topY + 6, x - 17, topY - 15, g('#8a5a4a'), 1);
  }

  function buildPark(variant) {
    const v = variant || 'dusk', T = TH[v];
    if (!T) throw new Error('BBH.World.scene park: unknown variant "' + v + '" (day|dusk|night)');
    const W = 270, H = 480, p = mk(W, H), r = rng(9100 + v.length * 13), g = T.grade, lights = [];
    vgrad(p, 0, 0, W, 330, T.sky, 2.2);
    if (T.stars) for (let i = 0; i < 130; i++) { const x = r.int(W), y = r.int(190), a = 1 - y / 220; if (r() < a) { p.px(x, y, r() < 0.15 ? '#ffd0f0' : r() < 0.5 ? '#d8d4ff' : '#9a8ad8'); if (r() < 0.05) { p.px(x + 1, y, '#8e7ac8'); p.px(x - 1, y, '#8e7ac8'); p.px(x, y - 1, '#8e7ac8'); p.px(x, y + 1, '#8e7ac8'); } } }
    if (v === 'night') { glow(p, 70, 78, 56, '#8a7cff', 0.34, { levels: 6 }); p.shadedEllipse(70, 78, 17, 17, { deep: '#8a90c0', shade: '#b5bce0', base: '#dce4ff', light: '#f3f6ff', hi: '#ffffff' }, -0.5, -0.5); p.ellipse(65, 74, 3, 3, '#aab2dc'); p.ellipse(75, 84, 4, 3, '#b3bbe2'); }
    else if (v === 'dusk') { glow(p, 160, 232, 120, '#ff7a6a', 0.55, { levels: 7 }); glow(p, 160, 232, 70, '#ffd070', 0.55, { levels: 7 }); { const q = p.raw, cx = 160 * S, cy = 232 * S, rr = 30 * S; for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > rr * rr) continue; const t = (y - (cy - rr)) / (2 * rr); if (t > 0.5 && (y % 8) < (t - 0.45) * 11) continue; q.px(x, y, t < 0.3 ? '#fff2a8' : t < 0.55 ? '#ffd24a' : t < 0.8 ? '#ff9a4a' : '#ff5f7a'); } } }
    else { glow(p, 200, 60, 60, '#fff0b0', 0.5, { levels: 6 }); p.ellipse(200, 60, 13, 13, '#fff4b8'); p.ellipse(200, 60, 10, 10, '#ffe66a'); p.ellipse(197, 57, 5, 5, '#fffbe0'); for (let n = 0; n < 5; n++) { const cx = 20 + r.int(230), cy = 28 + r.int(110), cw = 20 + r.int(26); for (let k = 0; k < 4; k++) p.ellipse(cx + (k - 1.5) * cw * 0.28, cy - (k % 2) * 3, cw * 0.3 + r.int(5), 5 + (k % 2) * 2, '#ffffff'); p.rect(cx - cw * 0.5, cy + 3, cw, 3, '#dfe8fa'); } }
    skylineRow(p, r, T, -4, W, 300, 170, 60, T.farB, 0.22, 0); skylineRow(p, r, T, -4, W, 300, 215, 50, T.farA, 0.28, 0);
    fillFn(p, 0, 250, W, 50, (u, v2, nx, ny) => (bay(nx, ny) < v2 * 0.8 ? [T.fog, 0, 0, 0, 160] : null));
    // far tree line
    for (let x = -10; x < W + 10; x += 22) tree(p, x + 8, 296 + (x % 5), 20 + (x % 7), T, r);
    // graffiti wall (left)
    const wallTop = 276, wallBase = 352, wall = [g('#241524'), g('#7a3a40'), g('#6a3038'), g('#8a4a48')];
    brick(p, 0, wallTop, 150, wallBase - wallTop, wall, r); shadowTop(p, 0, wallTop + 6, 150, 10, g('#1f1536'));
    p.rect(-2, wallTop - 4, 154, 5, g('#b4a098')); p.hline(-2, wallTop - 4, 154, g(li('#b4a098', 0.4))); p.hline(-2, wallTop + 1, 154, g('#5c4a58'));
    p.rect(146, wallTop - 4, 6, wallBase - wallTop + 4, g('#b4a098')); p.vline(146, wallTop - 4, wallBase - wallTop + 4, g('#e0d0c8'));
    const gc = { p, T };
    graffiti(gc, 'BEAT', 24, 288, 3, '#ff3ea5', '#2ee6ff'); graffiti(gc, 'BOX', 78, 314, 3, '#ffe14d', '#ff6b6b');
    graffiti(gc, 'MC', 26, 324, 2, '#9dff4a', '#3a5fcd'); p.ellipse(124, 296, 8, 8, g('#2c1d4d')); p.ellipse(124, 296, 6, 6, g('#ff3ea5')); p.ellipse(124, 296, 3, 3, g('#2ee6ff')); sparkle(p, 134, 288, g('#fff0c9'), false);
    poster(gc, 134, 322, 11, 18, 2);
    p.rect(0, wallBase - 8, 150, 8, g('#6a3038')); for (let i = 0; i < 20; i++) p.px(r.int(150), wallBase - 8 + r.int(8), g('#3a1d2e'));
    // iron fence + gate on the right
    const iron = g('#241d40'), iron2 = g('#4a4274');
    p.rect(150, 326, 120, 26, g('#183a3a')); for (let x = 152; x < 270; x += 12) p.ellipse(x + 6, 324 + (x % 3), 8, 6, g(ramp(T.leaf).shade));
    for (let x = 152; x < 270; x += 5) { p.vline(x, 308, 44, iron); p.px(x, 307, iron2); p.px(x - 1, 309, iron); p.px(x + 1, 309, iron); }
    p.hline(150, 316, 120, iron); p.hline(150, 342, 120, iron); p.hline(150, 315, 120, iron2);
    for (const px of [218, 262]) { p.rect(px, 292, 12, 62, g('#9a96b8')); p.vline(px, 292, 62, g('#c4c0e0')); p.vline(px + 11, 292, 62, g('#6a668a')); p.rect(px - 2, 288, 16, 5, g('#b4b0d0')); p.hline(px - 2, 288, 16, g('#dcd8f0')); p.ellipse(px + 6, 282, 4, 4, g('#b4b0d0')); p.px(px + 5, 280, g('#f4f0ff')); }
    p.rect(230, 300, 32, 52, g('#183a3a')); for (let x = 231; x < 262; x += 5) { p.vline(x, 300, 52, iron); p.px(x, 299, iron2); } p.hline(230, 322, 32, iron); p.hline(230, 346, 32, iron); for (let x = 233; x < 260; x += 8) p.ellipse(x, 312, 2, 3, iron);
    p.poly([[236, 352], [256, 352], [258, 300], [234, 300]], g('#1f4a3a')); for (let x = 237; x < 258; x += 5) p.vline(x, 301, 51, iron);
    p.ellipse(246, 300, 12, 6, g('#183a3a')); p.line(234, 300, 246, 292, iron); p.line(258, 300, 246, 292, iron);
    plate(p, 232, 276, 28, 11, '#1f6a4a', '#fff0c9', 'EXIT', 1, { edge: g('#d8c8aa') });
    // grass with mowing bands + path
    { const q = p.raw, g0 = [g(ramp(T.grass).deep), g(ramp(T.grass).shade), g(T.grass)], gl = g(ramp(T.grass).light); fillFn(p, 0, 352, W, H - 352, (u, v2, nx, ny) => { const band = (Math.floor((ny / S - 352) / 14)) & 1, t = v2; let c = bay(nx, ny) < t * 0.5 ? (band ? g0[1] : g0[0]) : (band ? g0[2] : g0[1]); if (((nx * 13 + ny * 7) % 23) === 0) c = gl; return c; }); }
    p.hline(0, 352, W, g(ramp(T.grass).light));
    const path = [[236, 352], [258, 352], [270, 380], [270, 400], [190, 430], [150, 480], [20, 480], [90, 440], [190, 392], [226, 372]];
    p.poly(path, g('#b89a74'));
    p.poly([[236, 352], [244, 352], [236, 372], [190, 392], [90, 440], [20, 480], [10, 480], [80, 436], [186, 388], [226, 370]], g('#9a7e5e'));
    for (let i = 0; i < 220; i++) { const x = r.int(W), y = 372 + r.int(108); if (p.get(x, y)[0] > 140 && p.get(x, y)[1] > 110) p.px(x, y, g(r() < 0.5 ? '#d8bc92' : '#8a6e50')); }
    // tufts + flowers
    for (let i = 0; i < 90; i++) { const x = r.int(W), y = 356 + r.int(122), c = p.get(x, y); if (c[1] > c[0]) { p.vline(x, y - 3, 3, g(ramp(T.grass).light)); p.px(x - 1, y - 2, g(ramp(T.grass).light)); p.px(x + 1, y - 2, g(ramp(T.grass).light)); } }
    for (let i = 0; i < 36; i++) { const x = r.int(W), y = 360 + r.int(116), c = p.get(x, y); if (c[1] > c[0]) { p.px(x, y, g(r.pick(['#ffe14d', '#ffffff', '#ff9ad0', '#ff6b6b']))); p.px(x, y + 1, g('#2f7a52')); } }
    // big trees (right + left), trunks run down to the lawn
    parkTrunkLeaf(p, T, r, 186, 358, 210, 22); parkTrunkLeaf(p, T, r, 6, 354, 200, 18);
    tree(p, 182, 168, 58, T, r); tree(p, 222, 196, 36, T, r); tree(p, 146, 196, 28, T, r); tree(p, 190, 128, 30, T, r);
    tree(p, 16, 184, 44, T, r); tree(p, 50, 210, 26, T, r); tree(p, 10, 138, 28, T, r);
    // fountain, bench, bin
    fountain(p, 128, 384, T, r);
    bench(p, 8, 400, T, 94); trash(p, 112, 399, T);
    // litter + fallen leaves
    for (let i = 0; i < 30; i++) p.px(10 + r.int(250), 400 + r.int(70), r.pick(['#fff0c9', '#ff6b6b', '#e8c040', '#c9577f']));
    p.rect(100, 402, 4, 3, g('#fff0c9')); p.rect(78, 404, 3, 3, g('#d63c4a'));
    // busking spot: worn lit patch + hat with coins
    const bx = 178, by = 414;
    if (T.lamp) { glow(p, bx, by, 40, '#ffd070', 0.9, { sy: 0.26, levels: 6 }); glow(p, bx, by, 24, '#fff3c4', 0.8, { sy: 0.26, levels: 5 }); }
    else { glow(p, bx, by, 36, '#ffffff', 0.22, { sy: 0.26, levels: 4 }); }
    p.ellipse(bx - 26, by + 5, 6, 2, g('#2a2450')); p.ellipse(bx - 26, by + 3, 5, 2, g('#4a3a7a')); p.px(bx - 28, by + 3, '#ffe14d'); p.px(bx - 25, by + 2, '#ffe14d'); p.px(bx - 23, by + 3, '#e8c040');
    // lamp post by the fountain side, throwing a cone on the busk spot
    const ls = lampSprite(T, 94, -16, 1), lpx = 196, lpb = 392;
    p.blit(ls.spr, lpx - ls.ox, lpb - ls.spr.h);
    const hx = lpx - ls.ox + ls.hx, hy = lpb - ls.spr.h + ls.hy;
    if (T.lamp) { glow(p, hx, hy, 18, '#ffd070', 0.9, { levels: 6 }); cone(p, hx, hy + 2, by - hy - 4, 28, '#ffcf70', 0.34); lights.push({ x: hx, y: hy, r: 80, color: '#ffbe55', a: 0.5, flicker: 0.02, kind: 'lamp' }, { x: bx, y: by, r: 52, color: '#ffe9a8', a: 0.5, flicker: 0.02, kind: 'lamp' }); }
    if (v === 'night') { glow(p, 128, 372, 34, '#3a9aff', 0.35, { sy: 0.8, levels: 5 }); lights.push({ x: 128, y: 372, r: 44, color: '#4aa0ff', a: 0.3, flicker: 0.1, kind: 'neon' }); }
    if (v === 'dusk') lights.push({ x: 160, y: 232, r: 100, color: '#ff9a4a', a: 0.22, flicker: 0, kind: 'neon' });
    // dusk/night warm glow on the bench from the lamp
    // dust motes / fireflies at night
    if (v === 'night') for (let i = 0; i < 14; i++) { const x = r.int(W), y = 330 + r.int(110); p.px(x, y, '#d8ff7a'); p.add(x + 1, y, '#9dff4a', 90); p.add(x - 1, y, '#9dff4a', 90); p.add(x, y + 1, '#9dff4a', 90); p.add(x, y - 1, '#9dff4a', 90); }
    // gentle vignette on the bottom for the UI
    fillFn(p, 0, 440, W, 40, (u, v2, nx, ny) => (bay(nx, ny) < v2 * 0.5 ? ['#150d33', 0, 0, 0, 200] : null));
    lift(p);
    // foreground: hanging leaves from the top corners + a few tall grass blades at the bottom edge
    const f = mk(W, H), fr = rng(9300);
    for (let i = 0; i < 26; i++) { const x = fr.int(54), y = fr.int(26) + (x < 24 ? 8 : 0); f.ellipse(x, y, 4 + fr.int(5), 3 + fr.int(2), g(ramp(T.leaf)[['deep', 'shade', 'base'][fr.int(3)]])); }
    for (let i = 0; i < 22; i++) { const x = W - fr.int(60), y = fr.int(22) + (x > W - 28 ? 8 : 0); f.ellipse(x, y, 4 + fr.int(5), 3 + fr.int(2), g(ramp(T.leaf)[['deep', 'shade', 'base'][fr.int(3)]])); }
    { const fq = f.raw; for (let nx = 4; nx < fq.w; nx += 7 + fr.int(9)) { const h = 8 + fr.int(11); for (let j = 0; j < h; j++) fq.px(nx + Math.round(j * 0.25), fq.h - 1 - j, g(j > h / 2 ? ramp(T.grass).light : ramp(T.grass).deep)); } }
    lift(f);
    return mkScene('park', v, R(W * S), R(H * S), {
      layers: [{ pix: p.raw, speed: 1 }], fg: f.raw, floorY: R(420 * S),
      spots: sSpots({ stand: { x: 110, y: 440 }, busk: { x: 178, y: 414 }, bench: { x: 76, y: 400 }, beeamgee: { x: 34, y: 400 } }),
      hotspots: sHot([{ id: 'spot', label: 'Busking spot', x: 140, y: 366, w: 76, h: 68 }, { id: 'bench', label: 'Bench', x: 8, y: 360, w: 96, h: 46 }, { id: 'gate', label: 'To the street', x: 222, y: 296, w: 44, h: 108 }]),
      lights: sLights(lights), anim: sAnim([{ kind: 'fountain', x: 128, y: 350 }, { kind: v === 'night' ? 'fireflies' : 'birds', x: 135, y: 200 }]),
    });
  }
  World.builders.park = buildPark;

  /* ------------------------------------------------------------------ INTRO PLATES (270x270) */
  const IW = 270;
  function plate0(id, seed) { return { p: mk(IW, IW), r: rng(seed) }; }
  function vignette(p, strength) {                      // dithered dark corners, keeps focus in the middle (native)
    const q = NP(p), cx = q.w / 2, cy = q.h / 2, m = Math.hypot(cx, cy);
    for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
      const d = Math.hypot(x - cx, y - cy) / m, a = clamp((d - 0.62) * 1.6, 0, 1) * strength;
      if (a > 0 && bay(x, y) < a) q.px(x, y, '#120d1f', 200);
    }
  }
  function finishPlate(id, p, extra) {
    vignette(p, 0.6); lift(p);
    const o = Object.assign({ layers: [{ pix: p.raw, speed: 1 }], floorY: R(240 * S) }, extra || {});
    if (o.spots) o.spots = sSpots(o.spots);
    return mkScene(id, null, R(IW * S), R(IW * S), o);
  }
  function walkerSprite(T, o) {                          // hooded figure walking, head down, box under the arm; faces +x
    const spr = mk(34, 50), ink = '#1a1230', mid = '#2c2150', rim = o.rim || '#ffbe55';
    spr.poly([[10, 12], [13, 6], [19, 5], [22, 9], [23, 15], [20, 19], [12, 19]], ink);       // hood, bowed
    spr.poly([[9, 18], [24, 18], [26, 30], [22, 34], [10, 34], [7, 28]], ink);                // coat
    spr.poly([[9, 33], [23, 33], [24, 46], [20, 46], [17, 38], [14, 46], [9, 46]], ink);      // legs
    spr.rect(8, 46, 6, 3, ink); spr.rect(19, 46, 7, 3, ink);
    spr.poly([[14, 12], [20, 12], [21, 17], [14, 17]], mid);                                  // shadowed face
    spr.px(19, 14, '#7a6a9a');
    spr.rect(17, 24, 15, 11, '#9a6a3a'); spr.hline(17, 24, 15, '#c8905a'); spr.vline(17, 24, 11, '#c8905a'); spr.hline(17, 34, 15, '#5e3a28'); spr.vline(31, 24, 11, '#5e3a28');
    spr.rect(22, 24, 5, 11, '#b07a46');
    for (let i = 0; i < 3; i++) { spr.ellipse(22 + i * 2, 21 - (i % 2), 2, 3, '#4fae52'); } spr.px(23, 20, '#8ae08a');         // plant peeking out of the box
    spr.poly([[24, 20], [28, 24], [22, 27]], ink); spr.rect(22, 23, 5, 2, ink);                // arm around the box
    rimLight(spr, rim, undefined, 60);
    return spr;
  }

  // ---- 1: grey office at night, the box on the desk
  World.builders.intro1 = function () {
    const { p, r } = plate0('intro1', 1101);
    vgrad(p, 0, 0, IW, 200, [[0, '#262a40'], [0.5, '#3a415c'], [1, '#4a526e']], 2);
    for (let x = 0; x < IW; x += 30) { p.vline(x, 0, 200, '#323852'); p.vline(x + 1, 0, 200, '#4c5472'); }
    p.rect(0, 150, IW, 50, '#2e3350'); p.hline(0, 150, IW, '#5a6280'); p.hline(0, 151, IW, '#1f2338');
    // ceiling with dead fluorescent panels, one flickering
    p.rect(0, 0, IW, 14, '#20243a'); for (const x of [20, 100, 180]) { p.rect(x, 3, 60, 8, x === 180 ? '#e8f0ff' : '#383e5a'); p.frame(x, 3, 60, 8, '#5a6280'); if (x === 180) { p.hline(x + 1, 4, 58, '#ffffff'); glow(p, x + 30, 14, 70, '#9ab4ff', 0.25, { sy: 0.7, levels: 4 }); } }
    // window with the cold city and ONE lit window far away
    p.rect(16, 26, 112, 124, '#566078'); const wx = 22, wy = 32, ww = 100, wh = 112;
    vgrad(p, wx, wy, ww, wh, [[0, '#0e1236'], [0.6, '#222a66'], [1, '#3a3f86']], 2);
    for (let i = 0; i < 18; i++) p.px(wx + r.int(ww), wy + r.int(50), '#9aa8ff');
    let bx = wx; while (bx < wx + ww) { const bw = 10 + r.int(14), top = wy + 50 + r.int(40), c = r() < 0.5 ? '#1a1f50' : '#242a64'; p.rect(bx, top, Math.min(bw, wx + ww - bx), wy + wh - top, c); p.hline(bx, top, bw, '#4a54a8'); for (let k = 0; k < 6; k++) { const px = bx + 2 + r.int(Math.max(1, bw - 4)), py = top + 3 + r.int(30); if (py < wy + wh - 3 && r() < 0.18) p.px(px, py, '#6a74c8'); } bx += bw + 1; }
    p.rect(wx + 60, wy + 74, 7, 9, '#ffcf6a'); p.hline(wx + 60, wy + 74, 7, '#fff3c0'); p.vline(wx + 63, wy + 74, 9, '#c08a2a'); glow(p, wx + 63, wy + 78, 14, '#ffbe55', 0.55, { levels: 4 });
    for (let i = 0; i < 40; i++) { const x = wx + r.int(ww), y = wy + r.int(wh); p.line(x, y, x - 2, y + 6, '#8a9aff'); }
    for (let k = 1; k < 4; k++) p.vline(wx + k * 25, wy, wh, '#566078'); p.hline(wx, wy + 56, ww, '#566078'); p.rect(12, 148, 120, 5, '#7a84a0'); p.hline(12, 148, 120, '#aab4cc');
    // window light falling on the carpet
    p.rect(0, 200, IW, 70, '#242840'); for (let y = 204; y < 270; y += 9) p.hline(0, y, IW, '#2c3150');
    for (let k = 0; k < 4; k++) p.poly([[wx + k * 25 + 2, 202], [wx + k * 25 + 23, 202], [wx + k * 25 + 60, 262], [wx + k * 25 + 34, 262]], '#4a5a9a');
    { const q = p.raw; for (let y = R(200 * S); y < q.h; y++) for (let x = 0; x < q.w; x++) if (bay(x, y) < 0.35 && q.get(x, y)[2] > 130) q.px(x, y, '#2e3a70'); }
    // cubicle farm in the dark
    for (let i = 0; i < 3; i++) { const x = 146 + i * 42; p.rect(x, 112, 36, 86, '#2a2f48'); p.rect(x, 112, 36, 3, '#4a526e'); p.rect(x + 4, 140, 16, 12, '#10142c'); p.hline(x + 4, 140, 16, '#2a3050'); p.rect(x + 10, 152, 4, 4, '#2a2f48'); p.rect(x + 22, 168, 10, 30, '#1c2038'); p.hline(x, 170, 36, '#3a415c'); }
    // chair with its back turned
    p.rect(40, 168, 36, 6, '#161a30'); p.rect(44, 146, 28, 22, '#1f2440'); p.hline(44, 146, 28, '#3a4268'); p.rect(56, 174, 4, 24, '#161a30'); p.rect(44, 196, 28, 3, '#161a30');
    // desk: laminate top, front panel with drawers
    p.poly([[30, 192], [270, 192], [270, 206], [18, 206]], '#8c90aa'); p.hline(30, 192, 240, '#c0c4dc'); p.hline(18, 206, 252, '#555a78');
    p.rect(18, 207, 252, 63, '#3c4160'); p.rect(18, 207, 252, 2, '#555a78'); p.rect(30, 214, 90, 40, '#323654'); p.frame(30, 214, 90, 40, '#4a4f70'); p.hline(60, 230, 30, '#b0b4cc');
    p.rect(150, 214, 100, 22, '#323654'); p.frame(150, 214, 100, 22, '#4a4f70'); p.hline(190, 224, 20, '#b0b4cc'); p.rect(150, 240, 100, 22, '#323654'); p.frame(150, 240, 100, 22, '#4a4f70'); p.hline(190, 250, 20, '#b0b4cc');
    // dead monitor with a pink slip taped on
    p.rect(52, 142, 54, 40, '#161a30'); p.frame(52, 142, 54, 40, '#4a526e'); p.rect(55, 145, 48, 32, '#0e1226'); p.line(58, 174, 80, 148, '#1c2240'); p.rect(76, 182, 6, 10, '#2a2f48'); p.rect(66, 190, 26, 3, '#2a2f48');
    p.rect(66, 156, 20, 14, '#fff0c9'); p.hline(66, 156, 20, '#ffffff'); p.hline(68, 160, 14, '#c9577f'); p.hline(68, 163, 16, '#8a86a8'); p.hline(68, 166, 10, '#8a86a8'); p.rect(70, 154, 6, 3, '#e8c040'); Font.draw(p, 'OUT', 70, 169, '#8a1f2f', { scale: 1 });
    p.rect(108, 186, 40, 5, '#1c2038'); for (let i = 0; i < 9; i++) p.px(110 + i * 4, 188, '#3a415c');       // keyboard
    // the cardboard box with the plant and the mug
    const bx0 = 158, by0 = 160;
    p.poly([[bx0, by0 + 8], [bx0 + 70, by0 + 8], [bx0 + 68, by0 + 32], [bx0 + 2, by0 + 32]], '#b07a46'); p.poly([[bx0, by0 + 8], [bx0 + 70, by0 + 8], [bx0 + 68, by0 + 12], [bx0 + 2, by0 + 12]], '#8a5a30');
    p.rect(bx0 + 2, by0 + 12, 66, 2, '#d9a066'); p.vline(bx0 + 1, by0 + 9, 22, '#d9a066'); p.rect(bx0 + 24, by0 + 18, 22, 5, '#d8c8a0'); p.hline(bx0 + 24, by0 + 18, 22, '#fff0c9');
    p.poly([[bx0 - 6, by0 + 8], [bx0 + 2, by0 + 8], [bx0 + 2, by0 + 12], [bx0 - 12, by0 + 20]], '#c8905a'); p.poly([[bx0 + 70, by0 + 8], [bx0 + 78, by0 + 18], [bx0 + 70, by0 + 12]], '#c8905a');
    for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.35, lx = bx0 + 28 + Math.sin(a) * 18, ly = by0 - 6 - Math.cos(a) * 16; p.line(bx0 + 30, by0 + 8, lx, ly, '#2f7a52'); p.ellipse(lx, ly, 4, 3, i % 2 ? '#4fae52' : '#6fcf6f'); }
    p.rect(bx0 + 44, by0 - 8, 16, 16, '#4a3a6a'); p.frame(bx0 + 44, by0 - 8, 16, 16, '#8a7ac8'); p.rect(bx0 + 47, by0 - 5, 10, 10, '#c9a07a'); p.rect(bx0 + 50, by0 - 3, 4, 4, '#2c1d4d');    // framed photo
    p.rect(bx0 + 4, by0 - 2, 9, 10, '#d63c4a'); p.hline(bx0 + 4, by0 - 2, 9, '#ff8a7a'); p.rect(bx0 + 13, by0 + 1, 3, 5, '#d63c4a'); p.px(bx0 + 15, by0 + 3, '#150d33');   // mug
    p.hline(bx0 + 6, by0 - 8, 3, '#8a86a8', 1); p.px(bx0 + 7, by0 - 5, '#c8d0f0'); p.px(bx0 + 9, by0 - 7, '#c8d0f0');
    glow(p, bx0 + 35, by0 + 12, 52, '#ffbe55', 0.16, { levels: 4 });
    // desk lamp, switched off, bent over
    p.line(236, 192, 246, 166, '#3a415c', 2); p.line(246, 166, 232, 156, '#3a415c', 2); p.poly([[224, 152], [240, 150], [236, 160], [226, 160]], '#4a526e');
    // dust in the light
    for (let i = 0; i < 24; i++) p.px(wx + r.int(ww + 30), 160 + r.int(100), '#9aaaf0', 120);
    return finishPlate('intro1', p, { spots: { box: { x: 190, y: 192 } } });
  };

  // ---- 2: walking home in the rain
  World.builders.intro2 = function () {
    const { p, r } = plate0('intro2', 1202);
    vgrad(p, 0, 0, IW, 200, [[0, '#0b0a22'], [0.45, '#1a1440'], [1, '#33265e']], 2);
    // row of dark facades with a few lit windows and neon
    let x = -4; while (x < IW) { const w = 28 + r.int(26), top = 52 + r.int(36), c = r() < 0.5 ? '#231a42' : '#2a2050'; p.rect(x, top, w, 196 - top, c); p.hline(x, top, w, '#4a3a7a'); p.vline(x, top, 196 - top, '#34285c');
      for (let wy = top + 8; wy < 176; wy += 16) for (let wx = x + 4; wx < x + w - 8; wx += 12) { const lit = r() < 0.2; p.rect(wx, wy, 7, 9, lit ? '#ffbe55' : '#150f33'); if (lit) { p.hline(wx, wy + 8, 7, '#c9577f'); glow(p, wx + 3, wy + 4, 9, '#ffbe55', 0.3, { levels: 3 }); } }
      x += w + 1 + r.int(3); }
    p.rect(188, 120, 56, 24, '#150f33'); p.frame(188, 120, 56, 24, '#6a3a8a'); const nb = World.neon('OPEN', '#ff3ea5', 2); p.blit(nb, 216 - (nb.w >> 1), 132 - (nb.h >> 1));
    p.rect(10, 70, 12, 50, '#150f33'); p.frame(10, 70, 12, 50, '#2a6a8a'); for (let i = 0; i < 4; i++) Font.draw(p, 'INN'[i] || '', 12, 74 + i * 11, '#2ee6ff', { scale: 1 }); glow(p, 16, 95, 26, '#2ee6ff', 0.4, { levels: 4 });
    p.rect(0, 196, IW, 26, '#3a3458'); p.hline(0, 196, IW, '#6a6490'); p.hline(0, 221, IW, '#8e86b4'); p.rect(0, 222, IW, 48, '#1a1730');
    for (let xx = 0; xx < IW; xx += 30) p.vline(xx, 197, 24, '#2c2848');
    glow(p, 216, 200, 40, '#ff3ea5', 0.25, { sy: 0.4, levels: 4 }); glow(p, 16, 200, 30, '#2ee6ff', 0.25, { sy: 0.4, levels: 4 });
    wet(p, 196, 72, 0.7, '#2a1f55', 7, {});
    // streetlight: pole, arm, cone of light with rain lit inside it
    const lx = 78, hx = 112, hy = 52;
    p.rect(lx - 1, hy, 3, 166, '#2c2650'); p.vline(lx - 1, hy, 166, '#4a4274'); p.rect(lx - 4, 204, 9, 12, '#2c2650'); p.hline(lx, hy - 1, hx - lx, '#2c2650'); p.hline(lx, hy, hx - lx, '#4a4274'); p.rect(hx - 6, hy, 13, 4, '#2c2650'); p.rect(hx - 4, hy + 4, 9, 2, '#fff3c4');
    cone(p, hx, hy + 6, 160, 52, '#ffcf70', 0.42); glow(p, hx, hy + 6, 30, '#ffd070', 0.9, { levels: 7 }); glow(p, hx, 212, 56, '#ffb04a', 0.5, { sy: 0.24, levels: 6 });
    { const q = p.raw; for (let i = 0; i < 170; i++) { const yy = 60 + r.int(150), t = (yy - 56) / 160, hw = 4 + 52 * t, xx = R((hx + (r() * 2 - 1) * hw) * S), y0 = R(yy * S); for (let j = 0; j < 10; j++) q.px(xx - (j >> 1), y0 + j, '#fff3d0', 150 * (1 - j / 11)); } }
    // the walker with the box, plus a long shadow and reflection
    const wk = walkerSprite(null, { rim: '#ffd070' });
    for (let k = 0; k < 22; k++) p.hline(112 + k, 214 + (k >> 3), 12, '#120d24', 90);
    standing(p, wk, 128, 216, 0.5);
    // neon puddles + rain
    for (const [px, py, pw, c] of [[190, 232, 24, '#ff3ea5'], [60, 246, 28, '#2ee6ff'], [140, 252, 34, '#ffbe55'], [230, 258, 22, '#a86bff']]) {
      const q = p.raw, cx = px * S, cy = py * S, rx = pw * S, ry = 2.6 * S;
      for (let ny = Math.floor(cy - ry); ny <= cy + ry; ny++) for (let nx = Math.floor(cx - rx); nx <= cx + rx; nx++) { const e = ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2; if (e <= 1) q.px(nx, ny, mix('#241a4a', c, e > 0.7 ? 0.35 : e > 0.35 ? 0.55 : 0.68)); }
      for (let i = -rx + 4; i < rx - 3; i += 6) q.px(Math.round(cx + i), Math.round(cy - 1), '#fff0ff', 160);
    }
    ripples(p, 8, 30, 10, 224, 260, 266, '#e8e0ff');
    rain(p, 9, 240, 7, '#c8c0ff', 150, 0, 270);
    return finishPlate('intro2', p, { spots: { walker: { x: 128, y: 216 } } });
  };

  // ---- 3: the shabby apartment door with light leaking underneath
  World.builders.intro3 = function () {
    const { p, r } = plate0('intro3', 1303);
    vgrad(p, 0, 0, IW, 236, [[0, '#1c3038'], [0.5, '#2a4a50'], [1, '#2f5058']], 2);
    for (let x = 0; x < IW; x += 12) { p.vline(x, 0, 236, '#264248'); p.vline(x + 1, 0, 236, '#34585e'); if ((x / 12) % 3 === 0) p.vline(x + 5, 0, 236, '#2a4a50'); }
    p.rect(0, 150, IW, 86, '#243a3e'); p.hline(0, 150, IW, '#4a7a80'); p.hline(0, 151, IW, '#162a2e');   // dado rail
    for (const [px, py, pw, ph] of [[20, 60, 26, 40], [214, 100, 20, 36]]) { p.poly([[px, py], [px + pw, py + 4], [px + pw - 6, py + ph], [px + 3, py + ph - 2]], '#a89a8a'); p.poly([[px + 2, py + 2], [px + pw - 2, py + 6], [px + pw - 8, py + ph - 3]], '#8a7a6a'); }   // peeled wallpaper
    p.rect(0, 236, IW, 34, '#2a2438'); for (let x = 0; x < IW; x += 30) for (let y = 236; y < 270; y += 17) p.rect(x + ((y / 17) % 2 ? 15 : 0), y, 15, 17, ((x / 30 + y / 17) % 2) ? '#322a46' : '#262036');
    // hallway bulb on a cord, cold light
    p.vline(40, 0, 22, '#161a2a'); p.rect(37, 22, 7, 8, '#161a2a'); p.ellipse(40, 33, 3, 3, '#cfe8ff'); glow(p, 40, 33, 64, '#8ab8e0', 0.3, { levels: 5 });
    // door
    const dx = 82, dy = 34, dw = 106, dh = 202;
    p.rect(dx - 8, dy - 8, dw + 16, dh + 8, '#4a3a3a'); p.hline(dx - 8, dy - 8, dw + 16, '#7a6a68'); p.vline(dx - 8, dy - 8, dh + 8, '#6a5a58'); p.vline(dx + dw + 7, dy - 8, dh + 8, '#2a1f28');
    p.rect(dx, dy, dw, dh, '#6a3a2a'); fillFn(p, dx, dy, dw, dh, (u, v, nx, ny) => (bay(nx, ny) < 0.18 + u * 0.25 ? '#5a2f24' : null));
    for (const [px, py, pw, ph] of [[dx + 12, dy + 14, 36, 62], [dx + 58, dy + 14, 36, 62], [dx + 12, dy + 92, 36, 90], [dx + 58, dy + 92, 36, 90]]) { p.rect(px, py, pw, ph, '#7a4632'); p.hline(px, py, pw, '#3a1d1d'); p.vline(px, py, ph, '#3a1d1d'); p.hline(px, py + ph - 1, pw, '#9a5a42'); p.vline(px + pw - 1, py, ph, '#9a5a42'); }
    for (let i = 0; i < 18; i++) { const x = dx + 4 + r.int(dw - 8), y = dy + 6 + r.int(dh - 14); p.rect(x, y, 2 + r.int(4), 1 + r.int(2), '#a67058'); }       // chipped paint
    // number plate "4B" hanging by one screw, peephole, chain, knob, locks
    p.poly([[dx + 36, dy + 22], [dx + 70, dy + 26], [dx + 69, dy + 40], [dx + 35, dy + 36]], '#caa43a'); p.poly([[dx + 36, dy + 22], [dx + 70, dy + 26], [dx + 70, dy + 28], [dx + 36, dy + 24]], '#fff0a0'); p.px(dx + 38, dy + 24, '#6a4a10'); Font.draw(p, '4', dx + 41, dy + 26, '#3a2810', { scale: 1 }); Font.draw(p, 'B', dx + 53, dy + 28, '#3a2810', { scale: 1 });
    p.line(dx + 68, dy + 38, dx + 66, dy + 44, '#6a4a10');
    p.ellipse(dx + 53, dy + 52, 4, 4, '#caa43a'); p.ellipse(dx + 53, dy + 52, 2, 2, '#10142c'); p.px(dx + 52, dy + 51, '#aab4ff');
    p.rect(dx + 88, dy + 96, 5, 12, '#9a96b0'); p.hline(dx + 82, dy + 100, 12, '#6c6888'); p.ellipse(dx + 90, dy + 118, 5, 5, '#caa43a'); p.ellipse(dx + 89, dy + 117, 2, 2, '#fff0a0'); p.rect(dx + 86, dy + 128, 8, 10, '#6c6888'); p.px(dx + 90, dy + 132, '#10142c');
    p.line(dx + 6, dy + 112, dx + 20, dy + 114, '#9a96b0'); for (let i = 0; i < 4; i++) p.ellipse(dx + 8 + i * 4, dy + 112 + i * 0.5, 2, 1, '#caa43a');
    // light leaking under and around the door
    for (let y = 0; y < 5; y++) p.hline(dx + 2, 234 + y - 3, dw - 4, y < 2 ? '#fff3c4' : '#ffd070');
    p.vline(dx + dw - 1, dy + 4, dh - 6, '#ffd070'); p.vline(dx - 1, dy + 4, dh - 6, '#caa43a');
    glow(p, 135, 240, 84, '#ffd070', 0.9, { sy: 0.34, levels: 7 }); glow(p, 135, 237, 50, '#fff3c4', 0.7, { sy: 0.2, levels: 5 });
    cone(p, 135, 236, 28, 52, '#ffe9a8', 0.0);
    // doormat, a little frayed, with mail on it
    p.poly([[dx + 4, 246], [dx + dw - 4, 246], [dx + dw + 6, 264], [dx - 6, 264]], '#6a4a2a'); for (let i = 0; i < 70; i++) p.px(dx - 4 + r.int(dw + 8), 247 + r.int(17), r() < 0.5 ? '#8a6a3a' : '#4a3220');
    p.frame(dx + 8, 249, dw - 16, 12, '#c8a060'); Font.draw(p, 'WELCOME', 110, 252, '#e8d0a0', { scale: 1 });
    p.rect(dx - 14, 252, 11, 8, '#fff0c9'); p.rect(dx - 12, 254, 11, 8, '#c9577f'); p.hline(dx - 11, 257, 8, '#fff0c9');
    // fire extinguisher cabinet + pipe + water stain
    p.rect(214, 156, 28, 44, '#8a1f2f'); p.frame(214, 156, 28, 44, '#c8404a'); p.rect(218, 162, 20, 32, '#1c2038'); p.rect(224, 168, 8, 22, '#d63c3c'); p.rect(226, 164, 4, 5, '#2c2650'); p.px(225, 172, '#ff9a8a');
    p.vline(250, 0, 150, '#34585e'); p.vline(251, 0, 150, '#6a9a9a'); for (let i = 0; i < 60; i++) p.px(240 + r.int(24), 4 + r.int(40), '#1a3238');
    for (let i = 0; i < 14; i++) p.px(135 + Math.round(Math.sin(i * 1.2) * 4), 238 - i * 2 + (i % 3), '#ffe9a8', 160 - i * 8);     // warm dust lifting from the gap
    return finishPlate('intro3', p, { spots: { door: { x: 135, y: 244 } } });
  };

  // ---- 4: the cluttered couch room, TV glow, headphones on the arm
  World.builders.intro4 = function () {
    const { p, r } = plate0('intro4', 1404);
    vgrad(p, 0, 0, IW, 196, [[0, '#1e1634'], [0.6, '#2c2048'], [1, '#382a5a']], 2);
    for (let x = 6; x < IW; x += 18) p.vline(x, 0, 190, '#2a1f45');
    p.rect(0, 186, IW, 10, '#241a3c'); p.hline(0, 186, IW, '#4a3a70');
    // floor: dark planks
    p.rect(0, 196, IW, 74, '#2a1f33'); for (let y = 196; y < 270; y += 9) { p.hline(0, y, IW, '#1e1628'); for (let x = (y / 9 % 2) * 30; x < IW; x += 60) p.vline(x, y, 9, '#1e1628'); }
    // posters + fairy lights
    for (const [x, y, w, h, s] of [[22, 38, 30, 42, 0], [60, 52, 24, 34, 1], [24, 88, 28, 36, 3]]) { p.rect(x + 1, y + 1, w, h, '#150d33'); poster({ p, T: TH.night }, x, y, w, h, s); }
    for (let x = 0; x < IW; x += 2) { const y = 14 + Math.sin(x / 270 * PI * 3) * 7, y2 = 14 + Math.sin((x + 2) / 270 * PI * 3) * 7; p.line(x, y, x + 2, y2, '#46405e'); }
    for (let x = 6; x < IW; x += 14) { const y = 14 + Math.round(Math.sin(x / 270 * PI * 3) * 7), c = ['#ffbe55', '#ff3ea5', '#2ee6ff', '#9dff4a'][((x / 14) | 0) % 4]; p.rect(x, y + 1, 2, 3, c); glow(p, x + 1, y + 3, 7, c, 0.5, { levels: 3 }); }
    // window with blinds, neon bleeding through
    p.rect(150, 30, 84, 84, '#46405e'); p.rect(154, 34, 76, 76, '#120d33'); vgrad(p, 154, 34, 76, 76, [[0, '#120d33'], [1, '#3a1f66']], 2);
    p.rect(190, 70, 16, 40, '#1a1450'); p.rect(176, 82, 12, 28, '#241a60'); for (let i = 0; i < 5; i++) p.px(162 + r.int(60), 40 + r.int(26), '#9a8ad8');
    p.ellipse(212, 50, 6, 6, '#dce4ff'); p.ellipse(215, 48, 5, 5, '#120d33'); p.px(194, 94, '#ff3ea5'); p.px(196, 94, '#ff3ea5'); p.rect(166, 92, 8, 3, '#2ee6ff');
    for (let y = 36; y < 110; y += 6) { p.hline(154, y, 76, '#8a7ac8'); p.hline(154, y + 1, 76, '#46405e'); p.hline(154, y + 2, 76, '#2c2650'); }
    p.vline(172, 34, 76, '#46405e'); p.rect(160, 112, 64, 3, '#6a5a9a'); p.vline(224, 34, 70, '#c8c0e0'); p.rect(222, 100, 5, 6, '#c8c0e0');
    for (let k = 0; k < 6; k++) p.poly([[158 + k * 11, 118], [165 + k * 11, 118], [186 + k * 11, 190], [176 + k * 11, 190]], '#3a2a6a');
    // TV on a low stand, left: the main light source
    p.rect(12, 180, 108, 34, '#3a2a4a'); p.hline(12, 180, 108, '#6a5a8a'); p.rect(16, 196, 44, 14, '#241a2c'); p.hline(20, 202, 36, '#6a5a8a'); p.rect(70, 200, 6, 6, '#9dff4a'); p.rect(80, 200, 28, 8, '#1c1630'); for (let i = 0; i < 3; i++) p.rect(82 + i * 8, 202, 6, 4, ['#c9577f', '#2ee6ff', '#ffe14d'][i]);
    p.rect(20, 112, 84, 68, '#20203a'); p.hline(20, 112, 84, '#4a4a70'); p.vline(20, 112, 68, '#3a3a5a'); p.rect(26, 118, 72, 54, '#0c1630');
    vgrad(p, 28, 120, 68, 50, [[0, '#3a8ae8'], [0.5, '#6ad0ff'], [1, '#2a5ac8']], 1.4);
    for (let i = 0; i < 7; i++) p.rect(28 + i * 9.7, 120, 9, 10, ['#ffffff', '#ffe14d', '#2ee6ff', '#9dff4a', '#ff3ea5', '#ff3e3e', '#3a5fff'][i]);
    { let py0 = 150; for (let x = 28; x < 96; x++) { const y = 150 + Math.sin(x * 0.45) * 9 * Math.sin(x * 0.07 + 1); p.line(x - 1, py0, x, y, '#ffffff'); p.line(x - 1, py0 + 1, x, y + 1, '#2ee6ff'); py0 = y; } }
    for (let y = 120; y < 170; y += 2) p.hline(28, y, 68, '#102060');
    p.rect(26, 118, 12, 3, '#cfe8ff'); p.rect(100, 126, 3, 3, '#ff3ea5'); p.rect(100, 134, 3, 5, '#9a96b0'); p.line(52, 112, 40, 96, '#9a96b0'); p.line(70, 112, 84, 94, '#9a96b0');
    glow(p, 60, 150, 120, '#5ab8ff', 0.5, { levels: 7 }); glow(p, 70, 236, 90, '#5ab8ff', 0.4, { sy: 0.35, levels: 6 });
    // couch
    p.rect(124, 146, 138, 40, '#7a2f55'); p.rect(124, 146, 138, 4, '#a84a76'); p.ellipse(128, 160, 6, 14, '#7a2f55'); p.hline(124, 146, 138, '#c8607e');
    for (let i = 0; i < 3; i++) { p.rect(130 + i * 44, 150, 40, 32, '#8a3a62'); p.hline(130 + i * 44, 150, 40, '#c8607e'); p.vline(130 + i * 44, 150, 32, '#b04a72'); p.vline(169 + i * 44, 150, 32, '#5a2040'); }
    p.rect(120, 180, 146, 30, '#8a3a62'); p.hline(120, 180, 146, '#d8708a'); p.rect(120, 204, 146, 8, '#5a2040'); for (let i = 0; i < 3; i++) { p.rect(126 + i * 46, 182, 42, 20, '#a04a72'); p.hline(126 + i * 46, 182, 42, '#e0809a'); p.vline(126 + i * 46, 182, 20, '#c8607e'); p.vline(167 + i * 46, 182, 20, '#6a2a4c'); }
    p.rect(238, 160, 30, 54, '#7a2f55'); p.rect(238, 160, 30, 5, '#c8607e'); p.vline(238, 160, 54, '#b04a72'); p.vline(267, 160, 54, '#4a1a38'); p.rect(238, 212, 30, 4, '#3a1a2c');
    for (let i = 0; i < 4; i++) p.vline(124 + i * 3, 184, 24, '#5a2040', 1);
    p.poly([[130, 176], [170, 172], [176, 206], [128, 208]], '#2a5a8a'); for (let i = 0; i < 5; i++) p.line(132 + i * 9, 176, 134 + i * 9, 207, i % 2 ? '#ffe14d' : '#e8f0ff'); p.hline(130, 176, 40, '#6aa0d8');
    p.rect(186, 160, 30, 26, '#2c9aa8'); p.hline(186, 160, 30, '#7ae9ff'); p.vline(186, 160, 26, '#5ad0e0'); p.rect(194, 170, 12, 8, '#ff3ea5'); p.px(198, 174, '#fff0c9');
    // headphones draped over the arm (focal point)
    p.ring(250, 148, 12, 12, '#2a2450'); p.ring(250, 148, 11, 11, '#4a4274'); p.rect(236, 148, 28, 10, '#7a2f55'); p.rect(237, 146, 5, 5, '#2a2450');
    for (const cx of [239, 262]) { p.rect(cx - 5, 150, 11, 16, '#150d33'); p.rect(cx - 4, 151, 9, 14, '#ff3ea5'); p.hline(cx - 4, 151, 9, '#ffb0d8'); p.vline(cx - 4, 151, 14, '#ff80c0'); p.ellipse(cx, 158, 3, 4, '#2ee6ff'); p.ellipse(cx, 158, 1, 2, '#e8ffff'); }
    glow(p, 250, 156, 44, '#ff3ea5', 0.28, { levels: 5 }); glow(p, 250, 158, 22, '#2ee6ff', 0.2, { levels: 4 });
    sparkle(p, 246, 142, '#ffd0f0', true);
    // floor clutter: rug, pizza box, cans, cables, remote
    p.ellipse(130, 252, 118, 14, '#3a2a66'); p.ellipse(130, 252, 108, 11, '#4a3a88'); for (let i = 0; i < 8; i++) p.hline(40 + i * 20, 250 + (i % 2) * 3, 12, '#ff3ea5', 1);
    p.rect(30, 232, 52, 16, '#d8b080'); p.hline(30, 232, 52, '#fff0c9'); p.poly([[30, 232], [82, 232], [78, 222], [34, 222]], '#e8c898'); p.ellipse(52, 240, 10, 4, '#d63c4a'); p.ellipse(68, 241, 6, 3, '#ffe14d'); p.hline(30, 247, 52, '#8a6a4a');
    for (const [x, y, c] of [[100, 238, '#d63c4a'], [110, 244, '#2ee6ff'], [92, 248, '#9dff4a']]) { p.rect(x, y, 6, 9, c); p.hline(x, y, 6, '#ffffff'); p.vline(x, y, 9, mix(c, '#fff', 0.35)); p.hline(x, y + 8, 6, '#2a2450'); }
    p.line(100, 186, 94, 214, '#1c1230'); p.line(94, 214, 120, 230, '#1c1230'); p.rect(150, 230, 12, 5, '#2a2450'); p.px(153, 232, '#ff3e3e');
    for (let i = 0; i < 20; i++) p.px(r.int(IW), 200 + r.int(70), '#fff0c9', 120);
    return finishPlate('intro4', p, { spots: { headphones: { x: 250, y: 160 } } });
  };

  // ---- 5: the first beats: sound rings around a mic in a dark room
  World.builders.intro5 = function () {
    const { p, r } = plate0('intro5', 1505);
    vgrad(p, 0, 0, IW, IW, [[0, '#0a0620'], [0.5, '#150c36'], [1, '#1e1248']], 2);
    // the room, barely there: window with crescent, bed, poster, speaker
    p.rect(196, 26, 52, 58, '#1c1448'); p.frame(196, 26, 52, 58, '#34286a'); p.vline(222, 26, 58, '#34286a'); p.hline(196, 54, 52, '#34286a'); p.ellipse(210, 40, 7, 7, '#c8d0ff'); p.ellipse(213, 38, 6, 6, '#1c1448');
    p.rect(14, 176, 78, 40, '#1c1448'); p.hline(14, 176, 78, '#34286a'); p.rect(14, 164, 22, 14, '#241a5a'); p.rect(14, 214, 4, 20, '#150c36'); p.rect(88, 214, 4, 20, '#150c36'); p.rect(30, 188, 56, 4, '#34286a');
    p.rect(204, 160, 40, 74, '#1c1448'); p.frame(204, 160, 40, 74, '#34286a'); p.ellipse(224, 182, 10, 10, '#150c36'); p.ellipse(224, 182, 8, 8, '#2a1f66'); p.ellipse(224, 182, 3, 3, '#4a3a99'); p.ellipse(224, 214, 13, 13, '#150c36'); p.ellipse(224, 214, 11, 11, '#2a1f66'); p.ellipse(224, 214, 5, 5, '#4a3a99');
    p.rect(0, 234, IW, 36, '#150c36'); p.hline(0, 234, IW, '#34286a'); for (let y = 240; y < 270; y += 7) p.hline(0, y, IW, '#1a1040');
    const cx = 135, cy = 120, cols = ['#2ee6ff', '#ffe14d', '#9dff4a', '#ff3ea5'];
    // glow pools behind the rings
    glow(p, cx, cy, 130, '#6a3fd8', 0.3, { levels: 6 });
    // sound rings: broken arcs, solid core + dithered halo
    const radii = [30, 47, 64, 82, 100, 118];
    radii.forEach((RR, i) => {
      const q = p.raw, col = cols[i % 4], k = C(col), hi = lighten(col, 0.55), ph = i * 1.3, ccx = cx * S, ccy = cy * S, rad = RR * S;
      for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
        const dx = x - ccx, dy = y - ccy, d = Math.sqrt(dx * dx + dy * dy), e = Math.abs(d - rad); if (e > 5.4) continue;
        const a = Math.atan2(dy, dx), gap = Math.sin(a * 3 + ph) + Math.sin(a * 5 - ph * 1.7) * 0.6;
        if (gap > 0.95) continue;
        const fade = 1 - i * 0.1;
        if (e <= 1) q.px(x, y, hi); else if (e <= 2.2) q.px(x, y, k, 255 * fade); else if (e <= 3.6) { if (bay(x, y) < 0.5) q.px(x, y, k, 150 * fade); } else if (bay(x, y) < 0.22) q.px(x, y, k, 120 * fade);
        if (e <= 4) q.add(x, y, k, 40 * fade);
      }
    });
    // mic: ball head with grille, yoke, stand
    p.rect(cx - 2, cy + 30, 5, 100, '#6a6a90'); p.vline(cx - 2, cy + 30, 100, '#a8a8d0'); p.vline(cx + 2, cy + 30, 100, '#3a3a5a'); p.ellipse(cx, 234, 22, 5, '#3a3a5a'); p.ellipse(cx, 232, 20, 4, '#6a6a90'); p.hline(cx - 14, 231, 28, '#a8a8d0');
    p.rect(cx - 6, cy + 24, 12, 8, '#2a2a4a'); p.hline(cx - 6, cy + 24, 12, '#6a6a90');
    for (let a = 0; a < 70; a++) { const t = a / 69 * PI; p.px(cx - Math.round(Math.cos(t) * 20), cy + 6 + Math.round(Math.sin(t) * 22), '#a8a8d0'); p.px(cx - Math.round(Math.cos(t) * 21), cy + 6 + Math.round(Math.sin(t) * 22), '#6a6a90'); }
    p.shadedEllipse(cx, cy, 15, 17, { deep: '#3a3a6a', shade: '#5a5a8a', base: '#8888b8', light: '#b8b8dc', hi: '#f0f0ff' }, -0.55, -0.7);
    fillFn(p, cx - 15, cy - 17, 31, 35, (u, v, nx, ny) => { const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2; if (dx * dx + dy * dy > 1) return null; if ((nx + ny) % 4 === 0 && dx * dx + dy * dy > 0.04) return ['#2a2a4a', 0, 0, 0, 150]; if (nx % 4 === 0 && ny % 3 === 0) return ['#d8d8f0', 0, 0, 0, 130]; return null; });
    p.rect(cx - 15, cy + 2, 31, 3, '#2a2a4a'); p.hline(cx - 15, cy + 2, 31, '#a8a8d0'); p.px(cx - 8, cy - 9, '#ffffff'); p.px(cx - 7, cy - 10, '#ffffff'); p.px(cx - 9, cy - 8, '#ffffff');
    // floating notes + sparkles
    const gl = ['^', '^', '@', '~'];
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2 + 0.4, rad = 52 + (i % 4) * 20, x = Math.round(cx + Math.cos(a) * rad), y = Math.round(cy + Math.sin(a) * rad * 0.8); if (y > 226) continue; Font.draw(p, gl[i % 4], x - 3, y - 3, cols[i % 4], { scale: i % 3 === 0 ? 2 : 1, shadow: '#150c36' }); }
    for (let i = 0; i < 30; i++) p.px(r.int(IW), r.int(230), '#c8c0ff', 160);
    for (const [x, y] of [[76, 60], [196, 100], [50, 130], [226, 140], [160, 36]]) sparkle(p, x, y, '#fff0c9', true);
    // equalizer at the bottom edge
    for (let i = 0; i < 30; i++) { const hh = 6 + Math.round((Math.sin(i * 0.8) + 1.2) * 9 + (i * 37 % 7)), c = cols[i % 4], x = 6 + i * 9; p.rect(x, 268 - hh, 6, hh, c); p.hline(x, 268 - hh, 6, lighten(c, 0.6)); p.vline(x + 5, 268 - hh, hh, mix(c, '#150c36', 0.4)); glow(p, x + 3, 268 - hh, 7, c, 0.4, { levels: 3 }); }
    return finishPlate('intro5', p, { spots: { mic: { x: cx, y: 232 } } });
  };

  // ---- 6: dawn in the park, BeeAmGee on his bench with the boombox
  function oldManSprite(rim) {
    const s = mk(50, 64), skin = ramp('#d8a080'), coat = ramp('#7a5a3a'), grey = ramp('#c8c4d4');
    s.rect(10, 56, 12, 6, '#2a1f28'); s.rect(26, 56, 12, 6, '#2a1f28'); s.hline(10, 56, 12, '#5a4a4a'); s.hline(26, 56, 12, '#5a4a4a');            // boots
    s.poly([[11, 38], [36, 38], [38, 46], [36, 57], [27, 57], [26, 46], [21, 46], [20, 57], [11, 57], [9, 46]], '#4a4a68'); s.hline(11, 38, 25, '#6a6a8a'); s.vline(12, 40, 16, '#5a5a7a');   // trousers, knees forward
    s.poly([[9, 18], [38, 18], [41, 40], [34, 44], [14, 44], [7, 38]], coat.base);                                                                   // coat
    s.poly([[9, 18], [18, 18], [14, 44], [7, 38]], coat.light); s.poly([[34, 18], [38, 18], [41, 40], [34, 44]], coat.shade); s.vline(24, 24, 20, coat.deep);
    s.rect(14, 28, 5, 5, '#5a3a22'); s.rect(30, 30, 5, 5, '#5a3a22');                                                                                 // elbow patches
    s.rect(14, 15, 20, 6, '#e8742a'); s.hline(14, 15, 20, '#ffb060'); s.rect(30, 18, 5, 14, '#e8742a'); s.vline(33, 20, 12, '#b04a1a'); for (let i = 0; i < 3; i++) s.hline(30, 22 + i * 4, 5, '#ffd070');   // scarf
    s.ellipse(11, 38, 4, 3, skin.base); s.ellipse(37, 40, 4, 3, skin.shade);                                                                          // hands
    s.shadedEllipse(24, 11, 10, 11, skin, -0.5, -0.6);                                                                                                // head
    s.poly([[12, 14], [36, 14], [34, 28], [24, 31], [14, 28]], grey.base);                                                                            // beard
    s.poly([[12, 14], [18, 14], [16, 28], [14, 28]], grey.hi); s.poly([[30, 16], [36, 14], [34, 28], [28, 30]], grey.shade);
    for (let i = 0; i < 8; i++) s.px(15 + i * 2, 24 + (i % 3) * 2, grey.light); s.hline(18, 16, 12, grey.hi);
    s.rect(18, 14, 12, 3, grey.hi); s.px(24, 17, '#c08a70'); s.rect(22, 15, 5, 3, skin.shade);                                                       // moustache + nose
    s.hline(18, 10, 4, '#2a1f28'); s.hline(27, 10, 4, '#2a1f28'); s.px(17, 9, '#2a1f28'); s.px(31, 9, '#2a1f28'); s.hline(16, 8, 6, '#9a96b0'); s.hline(26, 8, 6, '#9a96b0');    // closed eyes, little glasses
    s.poly([[12, 6], [36, 6], [38, 3], [30, 0], [16, 0], [10, 3]], '#3a4a5a'); s.hline(10, 6, 30, '#5a6a7a'); s.rect(32, 4, 9, 3, '#2a3a4a'); s.hline(14, 1, 12, '#6a7a8a');   // flat cap
    rimLight(s, rim, undefined, undefined, true, 24);
    return s;
  }
  World.builders.intro6 = function () {
    const { p, r } = plate0('intro6', 1606);
    const DAWN = Object.assign({}, TH.dusk, { leaf: '#3f7a5a', grass: '#4a8a62', grade: memo((c) => mix(mix(c, '#c76a96', 0.22), '#ffb070', 0.1)) }), g = DAWN.grade;
    vgrad(p, 0, 0, IW, 160, [[0, '#4a3a8a'], [0.3, '#a0508f'], [0.55, '#ee6a78'], [0.8, '#ffa056'], [1, '#ffe08a']], 2);
    for (let i = 0; i < 24; i++) { const x = r.int(IW), y = r.int(50); if (r() < 0.7) p.px(x, y, '#e8d8ff', 150); }
    const sx = 196, sy = 150; glow(p, sx, sy, 130, '#ff9a6a', 0.6, { levels: 7 }); glow(p, sx, sy, 70, '#ffe08a', 0.7, { levels: 7 });
    p.ellipse(sx, sy, 27, 27, '#ffe9a0'); p.ellipse(sx, sy, 24, 24, '#fff4c8'); p.ellipse(sx - 4, sy - 5, 12, 12, '#fffbe8');
    for (let n = 0; n < 5; n++) { const cx = 20 + r.int(220), cy = 52 + r.int(70), cw = 26 + r.int(30); for (let k = 0; k < 3; k++) p.ellipse(cx + (k - 1) * cw * 0.3, cy, cw * 0.3, 3, mix('#ffb0a0', '#ff7a8a', r())); p.hline(cx - cw * 0.5, cy + 3, cw, '#c9577f'); }
    skylineRow(p, r, DAWN, -4, IW, 172, 126, 28, '#b0588f', 0.12, 0);
    fillFn(p, 0, 130, IW, 50, (u, v, nx, ny) => { const a = 0.85 - Math.abs(v * 50 - 26) / 30; return a > 0 && bay(nx, ny) < a ? ['#ffc0a0', 0, 0, 0, 120] : null; });
    for (let x = -8; x < IW + 10; x += 18) tree(p, x + 8, 168 + (x % 7), 18 + (x % 5) * 2, DAWN, r);
    // ground
    fillFn(p, 0, 172, IW, 98, (u, v, nx, ny) => { const band = Math.floor((ny / S - 172) / 8) & 1; return bay(nx, ny) < v * 0.4 + 0.1 ? g(ramp(DAWN.grass).shade) : g(band ? DAWN.grass : ramp(DAWN.grass).shade); });
    p.hline(0, 172, IW, g(ramp(DAWN.grass).light));
    p.poly([[40, 270], [96, 196], [190, 196], [270, 262], [270, 270]], g('#b89a74')); p.poly([[40, 270], [96, 196], [106, 196], [64, 270]], g('#9a7e5e'));
    for (let i = 0; i < 60; i++) p.px(60 + r.int(200), 200 + r.int(70), g(r() < 0.5 ? '#d8bc92' : '#8a6e50'));
    // big dark trees at both sides, rim-lit by the sun
    parkTrunkLeaf(p, DAWN, r, 26, 262, 150, 22); tree(p, 28, 92, 52, DAWN, r); tree(p, 6, 130, 30, DAWN, r); tree(p, 60, 120, 24, DAWN, r);
    parkTrunkLeaf(p, DAWN, r, 252, 258, 140, 20); tree(p, 244, 80, 46, DAWN, r); tree(p, 262, 120, 26, DAWN, r);
    // sun shafts + mist
    { const q = p.raw; for (let k = 0; k < 6; k++) { const a0 = 196 - k * 38, a1 = a0 - 16; for (let y = R(150 * S); y < q.h; y++) { const t = (y / S - 150) / 120, xa = (sx + (a0 - sx) * t * 1.6) * S, xb = (sx + (a1 - sx) * t * 1.6) * S; for (let x = Math.round(Math.min(xa, xb)); x < Math.max(xa, xb); x++) if (bay(x, y) < 0.2 * (1 - t * 0.5)) q.add(x, y, '#ffd890', 70); } } }
    // bench + boombox + BeeAmGee
    const bx = 62, by = 226;
    bench(p, bx, by, DAWN, 150);
    const man = oldManSprite('#ffd070'); p.blit(man, 130, by - 70);
    p.rect(190, 196, 3, 34, '#4a3a2a'); p.hline(188, 196, 7, '#6a5a3a');                                      // cane leaning on the bench
    // boombox on the bench seat
    const ox = 80, oy = by - 38;
    p.rect(ox, oy, 38, 20, '#2a2450'); p.hline(ox, oy, 38, '#6a5a9a'); p.vline(ox, oy, 20, '#4a4274'); p.vline(ox + 37, oy, 20, '#150d33'); p.hline(ox, oy + 19, 38, '#150d33');
    p.rect(ox + 4, oy - 4, 30, 4, '#9a96b0'); p.hline(ox + 4, oy - 4, 30, '#d0ccea'); p.vline(ox + 4, oy - 4, 5, '#6c6888'); p.vline(ox + 33, oy - 4, 5, '#6c6888');
    for (const cx of [ox + 9, ox + 29]) { p.ellipse(cx, oy + 10, 6, 6, '#150d33'); p.ellipse(cx, oy + 10, 5, 5, '#46405e'); p.ellipse(cx, oy + 10, 3, 3, '#6a5a9a'); p.px(cx, oy + 10, '#c8c0e0'); p.ring(cx, oy + 10, 6, 6, '#ff3ea5'); }
    p.rect(ox + 15, oy + 4, 8, 7, '#150d33'); p.hline(ox + 16, oy + 6, 6, '#2ee6ff'); p.px(ox + 17, oy + 8, '#9dff4a'); p.px(ox + 20, oy + 8, '#ffe14d'); for (let i = 0; i < 4; i++) p.px(ox + 15 + i * 2, oy + 14, '#ffe14d');
    p.line(ox + 34, oy - 4, ox + 40, oy - 18, '#9a96b0'); p.px(ox + 40, oy - 19, '#ff3ea5');
    glow(p, ox + 19, oy + 8, 30, '#ff3ea5', 0.18, { levels: 4 });
    // music: notes + rings rising from the boombox
    for (const [x, y, c, gch] of [[ox + 8, oy - 24, '#ff3ea5', '^'], [ox + 24, oy - 36, '#2ee6ff', '@'], [ox + 40, oy - 50, '#ffe14d', '^'], [ox + 4, oy - 54, '#9dff4a', '~']]) { Font.draw(p, gch, x, y, c, { scale: 2, shadow: '#3a1d3a' }); sparkle(p, x + 12, y - 2, '#fff0c9', false); }
    // pigeons + leaves
    for (const [x, y, f] of [[100, 252, 0], [124, 258, 1], [210, 248, 0]]) { p.ellipse(x, y, 4, 3, '#8a8aa8'); p.ellipse(x + 4, y - 2, 2, 2, '#aaaac8'); p.px(x + 5, y - 2, '#150d33'); p.px(x + 6, y - 1, '#e8a040'); p.vline(x - 1, y + 3, 3, '#e8a040'); p.vline(x + 1, y + 3, 3, '#e8a040'); p.hline(x - 4, y - 1, 3, '#6a6a88'); if (f) p.poly([[x - 2, y - 2], [x - 8, y - 8], [x - 4, y]], '#aaaac8'); }
    for (let i = 0; i < 26; i++) { const x = r.int(IW), y = 60 + r.int(190); p.px(x, y, '#ffe9a8', 190); p.add(x + 1, y, '#ffcf70', 80); p.add(x, y + 1, '#ffcf70', 80); }
    return finishPlate('intro6', p, { spots: { bench: { x: 160, y: by } } });
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = World;
})(typeof globalThis !== 'undefined' ? globalThis : this);
