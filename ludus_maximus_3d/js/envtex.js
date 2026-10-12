// tex.js : procedural canvas textures (color + bump) for Ludus Maximus 3D. No image files.
// All generators are seeded + tileable (lattice noise wraps), return { map, bump } CanvasTextures.
// Budget: 512px tile ~40 ms, 1024px ~150 ms on desktop. Generate once at boot and share.
import * as THREE from 'three';

function hash(ix, iy, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
/** Tileable value noise. x,y in lattice units, `per` = lattice period (wraps). */
export function tnoise(x, y, per, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % per) + per) % per;
  const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed);
  const c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function tfbm(x, y, per, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * tnoise(x * f, y * f, per * f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
/** Build color+bump canvases per pixel. fn(u,v,px,py) -> {h:0..1, c:[r,g,b]} written into both images. */
function bake(size, fn, w = size, h = size) {
  const cc = canvas(w, h), bc = canvas(w, h);
  const cx = cc.getContext('2d'), bx = bc.getContext('2d');
  const ci = cx.createImageData(w, h), bi = bx.createImageData(w, h);
  const res = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fn(x / w, y / h, x, y, res);
    const i = (y * w + x) * 4;
    ci.data[i] = res.c[0]; ci.data[i + 1] = res.c[1]; ci.data[i + 2] = res.c[2]; ci.data[i + 3] = 255;
    const hv = Math.max(0, Math.min(255, res.h * 255));
    bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = hv; bi.data[i + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0);
  return { map: tex(cc, true), bump: tex(bc, false), mapCanvas: cc, bumpCanvas: bc };
}

/** Sun-baked raked sand: blotches, wind ripples, grain speckle. Tile = ~4 m. */
export function makeSandTexture(size = 1024, seed = 3) {
  const A = hex(0xd9b27c), B = hex(0xb98a55), C = hex(0xefd3a2), D = hex(0x9a6f42);
  return bake(size, (u, v, px, py, o) => {
    const big = tfbm(u * 4, v * 4, 4, 4, seed);
    const warp = tfbm(u * 8, v * 8, 8, 3, seed + 5);
    const rip = Math.sin((v * 22 + warp * 3.2) * Math.PI * 2 * 0.5 * 2) * 0.5 + 0.5; // 22 ripples, integer -> tiles
    const grain = hash(px, py, seed + 9);
    const fine = tfbm(u * 64, v * 64, 64, 2, seed + 2);
    let t = clamp01(big * 1.4 - 0.2);
    let c = mix3(A, B, t * 0.8);
    c = mix3(c, C, clamp01(rip * 0.35 + fine * 0.25 - 0.1));
    if (grain > 0.93) c = mix3(c, C, 0.5); else if (grain < 0.06) c = mix3(c, D, 0.45);
    o.c = c; o.h = 0.45 + rip * 0.12 + fine * 0.25 + (grain - 0.5) * 0.18;
  });
}

/** Travertine ashlar blocks. Tile covers `bx` x `by` blocks. Mortar is dark + recessed. */
export function makeStoneTexture(size = 512, { bx = 4, by = 6, base = 0xe8dcc0, tint = 0xb69a6a, seed = 11, mortar = 0x7a6a55 } = {}) {
  const A = hex(base), T = hex(tint), M = hex(mortar);
  return bake(size, (u, v, px, py, o) => {
    const row = Math.floor(v * by), off = (row % 2) * 0.5;
    const fu = ((u * bx + off) % 1 + 1) % 1, fv = (v * by) % 1;
    const col = Math.floor(u * bx + off);
    const id = hash(((col % bx) + bx) % bx, row, seed);
    const ex = Math.min(fu, 1 - fu) * (size / bx), ey = Math.min(fv, 1 - fv) * (size / by);
    const e = Math.min(ex, ey);
    const edge = clamp01(e / 3.2);                                      // 0 mortar -> 1 face
    const n1 = tfbm(u * 16, v * 16, 16, 4, seed);
    const n2 = tfbm(u * 64, v * 64, 64, 2, seed + 3);
    const pit = tnoise(u * 90, v * 90, 90, seed + 6) > 0.8 ? 1 : 0;
    let c = mix3(A, T, clamp01(id * 0.55 + n1 * 0.6 - 0.25));
    const sh = 0.86 + n2 * 0.22 - pit * 0.12 + (id - 0.5) * 0.08;
    c = [c[0] * sh, c[1] * sh, c[2] * sh];
    c = mix3(M, c, edge);
    o.c = c; o.h = edge * (0.55 + n1 * 0.25 + n2 * 0.1) - pit * 0.12;
  });
}

/** Marble with warped veins. Tile = ~2 m. */
export function makeMarbleTexture(size = 512, seed = 21) {
  const W = hex(0xf2ede2), G = hex(0x9a96a0), Wm = hex(0xe3d8c3);
  return bake(size, (u, v, px, py, o) => {
    const w1 = tfbm(u * 4, v * 4, 4, 4, seed), w2 = tfbm(u * 8 + 3, v * 8, 8, 3, seed + 4);
    const vein = Math.abs(Math.sin((u * 6 + w1 * 4.5 + w2 * 1.2) * Math.PI));
    const line = Math.pow(1 - vein, 14);
    let c = mix3(W, Wm, clamp01(w2 * 1.2 - 0.3));
    c = mix3(c, G, line * 0.55);
    o.c = c; o.h = 0.7 + w2 * 0.1 - line * 0.05;
  });
}

/** Terrain/grass detail (grayscale-ish, multiplies vertex colors). Tile ~6 m. */
export function makeGroundDetail(size = 512, seed = 33) {
  return bake(size, (u, v, px, py, o) => {
    const a = tfbm(u * 12, v * 12, 12, 4, seed), b = tfbm(u * 96, v * 96, 96, 2, seed + 1);
    const blades = hash(px, py, seed) > 0.9 ? 0.08 : 0;
    const k = clamp01(0.72 + (a - 0.5) * 0.5 + (b - 0.5) * 0.28 + blades) * 255;
    o.c = [k, k * 0.99, k * 0.96]; o.h = 0.4 + a * 0.4 + b * 0.2;
  });
}

/** Woven cloth (grayscale). Tile covers 24 threads. */
export function makeClothTexture(size = 256) {
  return bake(size, (u, v, px, py, o) => {
    const n = 32, a = Math.floor(u * n), b = Math.floor(v * n);
    const over = (a + b) % 2 === 0;
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const thread = over ? Math.sin(fu * Math.PI) : Math.sin(fv * Math.PI);
    const k = (0.78 + thread * 0.22 + (hash(a, b, 5) - 0.5) * 0.06) * 255;
    o.c = [k, k, k]; o.h = 0.4 + thread * 0.4;
  });
}

/** Soft radial gradient texture (blob shadows, glows). */
export function makeRadialTexture(size = 128, stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]) {
  const c = canvas(size, size), x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return tex(c, true, false);
}

/** Courtyard floor: packed sand + flagstone paths + worn training ring. Returns CanvasTexture (rect mapped 1:1). */
export function makeCourtyardFloor(w = 1536, h = 1250, sandTile, seed = 7) {
  const c = canvas(w, h), x = c.getContext('2d');
  const pat = x.createPattern(sandTile.mapCanvas, 'repeat');
  x.fillStyle = pat; x.fillRect(0, 0, w, h);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // dirt wear patches
  for (let i = 0; i < 70; i++) {
    const px = rnd() * w, py = rnd() * h, r = 40 + rnd() * 120;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = rnd() > 0.4;
    g.addColorStop(0, dark ? 'rgba(120,84,48,0.22)' : 'rgba(240,215,165,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // training ring
  x.strokeStyle = 'rgba(95,64,36,0.28)'; x.lineWidth = 10;
  x.beginPath(); x.ellipse(w * 0.5, h * 0.5, w * 0.17, h * 0.2, 0, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(${i % 2 ? '255,230,180' : '110,76,44'},0.10)`; x.lineWidth = 2; x.beginPath(); x.ellipse(w * 0.5, h * 0.5, w * (0.05 + i * 0.012), h * (0.06 + i * 0.014), 0, 0, Math.PI * 2); x.stroke(); }
  // flagstones along a central cross path (front gate axis = bottom edge)
  const paving = (x0, y0, x1, y1, ps) => {
    for (let yy = y0; yy < y1; yy += ps) {
      let xx = x0 + (((yy - y0) / ps) % 2) * ps * 0.5 - ps * 0.5;
      for (; xx < x1; xx += ps) {
        const jx = (rnd() - 0.5) * 6, jy = (rnd() - 0.5) * 6;
        const l = 168 + rnd() * 40;
        x.fillStyle = `rgb(${l},${l * 0.93},${l * 0.8})`;
        x.fillRect(xx + 3 + jx, yy + 3 + jy, ps - 6, ps - 6);
        x.fillStyle = 'rgba(70,50,30,0.35)'; x.fillRect(xx + ps - 5 + jx, yy + 3 + jy, 3, ps - 6); x.fillRect(xx + 3 + jx, yy + ps - 5 + jy, ps - 6, 3);
      }
    }
  };
  x.save(); x.beginPath(); x.rect(w * 0.44, h * 0.62, w * 0.12, h * 0.38); x.clip(); paving(w * 0.44, h * 0.62, w * 0.56, h, 46); x.restore();
  x.save(); x.beginPath(); x.rect(w * 0.1, h * 0.46, w * 0.8, h * 0.07); x.clip(); paving(w * 0.1, h * 0.46, w * 0.9, h * 0.53, 46); x.restore();
  // edge soften: darker near walls (contact AO)
  const vg = x.createLinearGradient(0, 0, w, 0);
  vg.addColorStop(0, 'rgba(60,36,30,0.5)'); vg.addColorStop(0.06, 'rgba(60,36,30,0)'); vg.addColorStop(0.94, 'rgba(60,36,30,0)'); vg.addColorStop(1, 'rgba(60,36,30,0.5)');
  x.fillStyle = vg; x.fillRect(0, 0, w, h);
  const vg2 = x.createLinearGradient(0, 0, 0, h);
  vg2.addColorStop(0, 'rgba(60,36,30,0.5)'); vg2.addColorStop(0.07, 'rgba(60,36,30,0)'); vg2.addColorStop(0.93, 'rgba(60,36,30,0)'); vg2.addColorStop(1, 'rgba(60,36,30,0.5)');
  x.fillStyle = vg2; x.fillRect(0, 0, w, h);
  return tex(c, true, false);
}

/** Terracotta roof tiles (curved rows). Tile = 2 m x 2 m (8 columns x 8 rows). */
export function makeRoofTexture(size = 256, seed = 5) {
  return bake(size, (u, v, px, py, o) => {
    const cols = 8, rows = 8;
    const row = Math.floor(v * rows), off = (row % 2) * 0.5;
    const fu = ((u * cols + off) % 1 + 1) % 1, fv = (v * rows) % 1;
    const id = hash(Math.floor(u * cols + off) % cols, row, seed);
    const curve = Math.sin(fu * Math.PI);                       // convex tile profile
    const lap = Math.min(1, fv * 3);                            // shaded overlap at the tile top edge
    const n = tfbm(u * 24, v * 24, 24, 3, seed);
    const k = 0.55 + curve * 0.4 + lap * 0.12 + (id - 0.5) * 0.18 + (n - 0.5) * 0.2;
    const c = mix3(hex(0x8f3d22), hex(0xcf7a48), clamp01(k - 0.35));
    o.c = [c[0] * (0.7 + k * 0.45), c[1] * (0.7 + k * 0.45), c[2] * (0.7 + k * 0.45)];
    o.h = 0.3 + curve * 0.5 - (1 - lap) * 0.15;
  });
}

/** Distant Colosseum facade strip (3 arch tiers + attic). Wraps horizontally every `bays` bays. Color only. */
export function makeColosseumFacade(w = 1024, h = 512, bays = 8) {
  const c = canvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e9dcbc'); g.addColorStop(1, '#cdb88f');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${90 + (i * 7) % 60},${70 + (i * 5) % 40},50,0.05)`; x.fillRect((i * 97) % w, (i * 53) % h, 18 + (i % 9) * 6, 3); }
  const bw = w / bays, tierH = h * 0.27, attic = h - tierH * 3;
  for (let t = 0; t < 3; t++) {
    const yb = h - t * tierH;                                    // tier bottom (canvas y grows down)
    for (let b = 0; b < bays; b++) {
      const cx = b * bw + bw / 2, aw = bw * 0.54, ah = tierH * 0.74;
      x.fillStyle = '#2c2230'; x.beginPath(); x.moveTo(cx - aw / 2, yb - 4); x.lineTo(cx - aw / 2, yb - ah + aw / 2); x.arc(cx, yb - ah + aw / 2, aw / 2, Math.PI, 0); x.lineTo(cx + aw / 2, yb - 4); x.fill();
      x.fillStyle = 'rgba(255,230,190,0.35)'; x.fillRect(cx - aw / 2 - 5, yb - ah, 5, ah - 4);                  // lit pier edge
      x.fillStyle = 'rgba(70,50,40,0.28)'; x.fillRect(cx + aw / 2, yb - ah, 5, ah - 4);
    }
    x.fillStyle = 'rgba(80,60,45,0.55)'; x.fillRect(0, yb - tierH, w, 4);                                         // cornice shadow line
    x.fillStyle = 'rgba(255,240,210,0.4)'; x.fillRect(0, yb - tierH - 3, w, 3);
  }
  for (let b = 0; b < bays; b++) { x.fillStyle = '#4a3a3a'; x.fillRect(b * bw + bw * 0.4, attic * 0.35, bw * 0.2, attic * 0.35); }
  const t = tex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
