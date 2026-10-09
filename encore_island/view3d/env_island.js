// Encore Island 3D environment: one floating island = flat walkable top (y = 0, never displaced) with a sandy rim and a rolled lip, plus a chunky
// stratified cliff skirt that drops into the sea and keeps tapering underwater with hanging rocks and roots.
// The outline is the same B-spline the 2D game strokes, so shore, foam and walkable area line up with the classic view.
import * as THREE from 'three';
import * as kit from './kit.js';
import { W, WY, outline, Acc, tpl, facetGeo, vnoise, fbm, patchMat } from './env_util.js';

const TILE = 4.2, _c = new THREE.Color(), _d = new THREE.Color();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- ground textures: neutral grey tiles that MULTIPLY the vertex colours (tufts darker, a few highlights), tiled by world position
const _gt = {};
export function groundTex(style) {
  if (_gt[style]) return _gt[style];
  return (_gt[style] = kit.canvasTex(256, 256, (g, w, h) => {
    const r = kit.rng(style.length * 977 + style.charCodeAt(0)), wrap = (f) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) f(dx, dy); };
    g.fillStyle = '#ececec'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 40, a = r() < 0.5; wrap((dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); gr.addColorStop(0, a ? 'rgba(255,255,255,0.45)' : 'rgba(120,120,120,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2); }); }
    g.lineCap = 'round';
    if (style === 'dunes') { // wind ripples
      for (let i = 0; i < 16; i++) { const y = (i + r() * 0.6) * h / 16; for (const [col, off, lw] of [['rgba(255,255,255,0.7)', -2, 2.2], ['rgba(150,120,90,0.30)', 2.5, 2.6]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let x = -8; x <= w + 8; x += 8) { const yy = y + off + Math.sin(x * 0.045 + i * 1.7) * 3.2 + Math.sin(x * 0.11 + i) * 1.4; x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); } }
    } else if (style === 'snow') { // sparkly drifts
      for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h; wrap((dx, dy) => { g.fillStyle = 'rgba(150,170,205,0.20)'; g.beginPath(); g.ellipse(x + dx, y + dy + 3, 15 + r() * 15, 4 + r() * 3, 0, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(x + dx, y + dy, 14 + r() * 12, 3.5, 0, 0, 6.3); g.fill(); }); }
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(r() * w, r() * h, 2, 2); }
    } else { // grass tufts: three blades fanning out, a darker stroke and a pale highlight
      const N = style === 'night' ? 60 : 78;
      for (let i = 0; i < N; i++) {
        const x = r() * w, y = r() * h, hh = 6 + r() * 7;
        wrap((dx, dy) => { for (const [col, ox, oy, lw] of [['rgba(150,150,150,0.85)', 0, 0, 2.6], ['rgba(255,255,255,0.95)', -1.2, -1.2, 1.2]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
          g.moveTo(x + dx - 4 + ox, y + dy + oy); g.quadraticCurveTo(x + dx - 5 + ox, y + dy - hh * 0.5 + oy, x + dx - 7 + ox, y + dy - hh * 0.9 + oy);
          g.moveTo(x + dx + ox, y + dy + oy); g.quadraticCurveTo(x + dx + 1 + ox, y + dy - hh * 0.6 + oy, x + dx + ox, y + dy - hh - 3 + oy);
          g.moveTo(x + dx + 4 + ox, y + dy + oy); g.quadraticCurveTo(x + dx + 5 + ox, y + dy - hh * 0.5 + oy, x + dx + 8 + ox, y + dy - hh * 0.8 + oy); g.stroke(); } });
      }
      if (style === 'night') for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(r() * w, r() * h, 1.3, 0, 6.3); g.fill(); }
    }
  }, { repeat: true, aniso: 8 }));
}
const _gm = {};
const groundStyle = (bi) => (bi === 2 || bi === 7 ? 'dunes' : bi === 3 ? 'snow' : bi === 6 ? 'night' : 'grass');
export function groundMat(bi) {
  const st = groundStyle(bi); if (_gm[st]) return _gm[st];
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex(st), roughness: 0.96, metalness: 0 }); m.userData.shared = true; return (_gm[st] = m);
}
export const ROCK_MAT = kit.lit(0xffffff, { vc: true, flat: true, rough: 0.92 });

// ---- hanging rock / root / boulder templates
let _T = null;
function tpls() {
  if (_T) return _T; _T = { rocks: [], roots: [] };
  for (let i = 0; i < 3; i++) _T.rocks.push(tpl((b) => b.shape(facetGeo(1, 0.36, 11 + i * 7, 0.9 + i * 0.12), 0xffffff, 0, 0, 0, 1)));
  for (let i = 0; i < 3; i++) _T.roots.push(tpl((b) => { // a bent tapering root: stacked slanted cylinders
    let x = 0, y = 0, a = 0; const segs = 5, L = 0.55; for (let s = 0; s < segs; s++) { const r0 = 0.12 * (1 - s / segs) + 0.025, r1 = 0.12 * (1 - (s + 1) / segs) + 0.015; a += (i - 1) * 0.15 + (s % 2 ? 0.12 : -0.1); b.part(kit.GB.cyl(5, r0 / r1), kit.mixc(0x7a5a4a, 0x4a3030, s / segs), x + Math.sin(a) * L * 0.5, y - Math.cos(a) * L * 0.5, 0, r1, L, r1, 0, 0, a); x += Math.sin(a) * L; y -= Math.cos(a) * L; }
  }));
  return _T;
}

/**
 * Build the meshes of one island in a Group centred on the island (local coords). Returns { grp, top, rock, R }.
 * g: geoOf(k) (or HUB_GEO), B: its biome, bi: biome index.
 */
export function buildIsland(g, B, bi) {
  const O = outline(g, 4), n = O.length / 2, rnd = kit.rng(g.seed * 7 + 3), cx = g.x * W, cz = g.y * W;
  const rr = new Float32Array(n), ux = new Float32Array(n), uz = new Float32Array(n); let minR = 1e9, sumR = 0;
  for (let i = 0; i < n; i++) { rr[i] = Math.hypot(O[i * 2], O[i * 2 + 1]); ux[i] = O[i * 2] / rr[i]; uz[i] = O[i * 2 + 1] / rr[i]; minR = Math.min(minR, rr[i]); sumR += rr[i]; }
  const R = sumR / n, seedN = g.seed * 0.37;
  // ---------------- top
  const g0 = new THREE.Color(B.g[0]), g1 = new THREE.Color(B.g[1]), tuft = new THREE.Color(B.tuft), deep = new THREE.Color(B.deep), shore = new THREE.Color(B.shore), sand = new THREE.Color(0xf6e7c8).lerp(shore, 0.45);
  if (bi === 2 || bi === 7) sand.set(B.g[0]).multiplyScalar(0.96); // dune and gala ground already reads as sand: the rim only gets paler
  const insets = [0, 0.06, 0.14, 0.24, 0.36, 0.55, 0.85, 1.3, 2.0, 3.0, 4.4, 6.2, 8.6].filter((v) => v < minR * 0.86);
  const rows = insets.length, pos = new Float32Array((1 + rows * n) * 3), col = new Float32Array((1 + rows * n) * 3), uv = new Float32Array((1 + rows * n) * 2), idx = [];
  const texBoost = 1.2; // the grey tile multiplies vertex colours, so lift them a little
  const colAt = (x, z, inset, out) => {
    const nz = fbm((cx + x) * 0.16 + seedN, (cz + z) * 0.16, 3), nz2 = vnoise((cx + x) * 0.5, (cz + z) * 0.5);
    out.copy(g0).lerp(g1, kit.clamp(nz * 1.3 - 0.1, 0, 1)); out.lerp(tuft, sstep(0.55, 0.85, nz2) * 0.25);
    const rad = Math.hypot(x, z) / R; out.multiplyScalar(1.06 - 0.12 * rad * rad);                                   // centre a touch lighter, like the 2D radial fill
    out.lerp(deep, 0.30 * (1 - sstep(0.4, 2.6, inset)));                                                            // the 2D game's soft inner edge shade
    out.lerp(sand, 1 - sstep(0.5, 1.05, inset) * 1);                                                                 // pale sandy rim
    if (inset < 0.3) out.multiplyScalar(0.9 + 0.1 * (inset / 0.3));
    out.multiplyScalar(texBoost);
  };
  const setV = (vi, x, y, z, inset) => { pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z; uv[vi * 2] = (cx + x) / TILE; uv[vi * 2 + 1] = (cz + z) / TILE; colAt(x, z, inset, _c); col[vi * 3] = _c.r; col[vi * 3 + 1] = _c.g; col[vi * 3 + 2] = _c.b; };
  setV(0, 0, 0, 0, 99);
  for (let j = 0; j < rows; j++) {
    const ins = insets[j], y = -0.22 * Math.pow(1 - Math.min(1, ins / 0.34), 2);
    for (let i = 0; i < n; i++) { const s = Math.max(0, 1 - ins / rr[i]); setV(1 + j * n + i, O[i * 2] * s, y, O[i * 2 + 1] * s, ins); }
  }
  const vi = (j, i) => 1 + j * n + ((i % n) + n) % n;
  for (let i = 0; i < n; i++) idx.push(0, vi(rows - 1, i + 1), vi(rows - 1, i));          // centre fan (innermost ring)
  for (let j = rows - 1; j > 0; j--) for (let i = 0; i < n; i++) { const a = vi(j, i), b = vi(j, i + 1), c = vi(j - 1, i), d = vi(j - 1, i + 1); idx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  const top = new THREE.Mesh(tg, groundMat(bi)); top.receiveShadow = true; top.castShadow = false; top.name = 'islandTop';
  // ---------------- rock: skirt, underside, boulders, roots (one flat-shaded vertex coloured mesh)
  const acc = new Acc(), depthK = Math.sqrt(Math.max(0.8, Math.min(2.2, R / 6.3)));
  const cliff = new THREE.Color(B.cliff), dark = new THREE.Color(0x1a0a30), warm = new THREE.Color(0xe8c8a0), turfA = new THREE.Color(B.g[1]).lerp(deep, 0.45), turfB = new THREE.Color(B.g[1]).lerp(deep, 0.7).multiplyScalar(0.95), sea = new THREE.Color(0x2a5a78);
  const cols = { turfA, turfB, c0: cliff.clone().lerp(warm, 0.32).multiplyScalar(1.12), c0d: cliff.clone().lerp(warm, 0.1), c1: cliff.clone().multiplyScalar(0.98), c1d: cliff.clone().lerp(dark, 0.28), c2: cliff.clone().lerp(dark, 0.22), c2d: cliff.clone().lerp(dark, 0.45), c3: cliff.clone().lerp(sea, 0.45).lerp(dark, 0.3), c3d: cliff.clone().lerp(sea, 0.5).lerp(dark, 0.5),
    u0: cliff.clone().lerp(sea, 0.5).lerp(dark, 0.5), u1: cliff.clone().lerp(sea, 0.5).lerp(dark, 0.6), u2: cliff.clone().lerp(sea, 0.4).lerp(dark, 0.7), u3: cliff.clone().lerp(dark, 0.78) };
  // wall rows: [y, outward offset, noise amplitude, band noise id, colour key]
  const wall = [[-0.22, 0, 0, 0, 'turfA'], [-0.32, 0.03, 0.04, 0, 'turfB'], [-0.48, 0.02, 0.06, 0, 'c0'], [-0.88, 0, 0.2, 1, 'c0d'], [-0.92, -0.13, 0.14, 2, 'c1'], [-1.42, -0.15, 0.22, 2, 'c1d'],
    [-1.46, -0.3, 0.14, 3, 'c2'], [-2.0, -0.32, 0.22, 3, 'c2d'], [-2.05, -0.5, 0.14, 4, 'c3'], [-3.1, -0.58, 0.32, 4, 'c3d']];
  const wrow = wall.map(([y, off, amp, nid, ck], r) => {
    const P = new Float32Array(n * 3), Cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const nzz = (vnoise(i * 0.27 + nid * 9.1 + seedN, nid * 3.3) - 0.5) * 2 + (vnoise(i * 0.8 + nid * 4.4, 7.7 + seedN) - 0.5) * 0.7, o = off + amp * nzz;
      P[i * 3] = O[i * 2] + ux[i] * o; P[i * 3 + 1] = y; P[i * 3 + 2] = O[i * 2 + 1] + uz[i] * o;
      _c.copy(cols[ck]); if (r === 2) _c.lerp(cols.turfB, sstep(0.46, 0.62, vnoise(i * 0.55 + seedN, 2.2)));                  // moss drips over the top band
      if (r === 3) _c.lerp(cols.turfB, sstep(0.5, 0.68, vnoise(i * 0.55 + seedN, 2.2)) * 0.45);
      _c.multiplyScalar(0.93 + 0.14 * vnoise(i * 0.35 + r * 5.5, seedN + 1.7)); Cc[i * 3] = _c.r; Cc[i * 3 + 1] = _c.g; Cc[i * 3 + 2] = _c.b;
    }
    return { P, Cc, n };
  });
  const colv = (R_, i) => { _c.setRGB(R_.Cc[i * 3], R_.Cc[i * 3 + 1], R_.Cc[i * 3 + 2]); return _c; };
  const _ca = new THREE.Color(), _cb = new THREE.Color(), _cc = new THREE.Color(), _cd = new THREE.Color();
  const strip = (A, Bw, step = 1) => { // outward-facing quads between two rows (Bw below A)
    const m = A.n; for (let i = 0; i < m; i += step) {
      const i1 = (i + step) % m, a0 = i * 3, a1 = i1 * 3; _ca.setRGB(A.Cc[a0], A.Cc[a0 + 1], A.Cc[a0 + 2]); _cb.setRGB(A.Cc[a1], A.Cc[a1 + 1], A.Cc[a1 + 2]); _cc.setRGB(Bw.Cc[a0], Bw.Cc[a0 + 1], Bw.Cc[a0 + 2]); _cd.setRGB(Bw.Cc[a1], Bw.Cc[a1 + 1], Bw.Cc[a1 + 2]);
      acc.triv(A.P[a0], A.P[a0 + 1], A.P[a0 + 2], _ca, A.P[a1], A.P[a1 + 1], A.P[a1 + 2], _cb, Bw.P[a0], Bw.P[a0 + 1], Bw.P[a0 + 2], _cc);
      acc.triv(A.P[a1], A.P[a1 + 1], A.P[a1 + 2], _cb, Bw.P[a1], Bw.P[a1 + 1], Bw.P[a1 + 2], _cd, Bw.P[a0], Bw.P[a0 + 1], Bw.P[a0 + 2], _cc);
    }
  };
  for (let r = 0; r + 1 < wrow.length; r++) strip(wrow[r], wrow[r + 1]);
  // underside: half the vertex count, tapering toward a tip with lumpy noise; each row is [y, scale, amp, colour]
  const half = n / 2, under = [[-4.3, 0.9, 0.3, 'u0'], [-5.9, 0.72, 0.45, 'u1'], [-7.6, 0.5, 0.55, 'u2'], [-9.2, 0.26, 0.5, 'u3']];
  const mk = (y, s, amp, ck, rid) => {
    const P = new Float32Array(half * 3), Cc = new Float32Array(half * 3);
    for (let h = 0; h < half; h++) { const i = h * 2, nzz = (vnoise(h * 0.33 + rid * 5.7 + seedN, rid * 2.1) - 0.5) * 2, k = s + amp * 0.18 * nzz, o = -0.2 * rid * nzz;
      P[h * 3] = O[i * 2] * k + ux[i] * o; P[h * 3 + 1] = y * depthK; P[h * 3 + 2] = O[i * 2 + 1] * k + uz[i] * o;
      _c.copy(cols[ck]).multiplyScalar(0.9 + 0.2 * vnoise(h * 0.4 + rid * 3, seedN)); Cc[h * 3] = _c.r; Cc[h * 3 + 1] = _c.g; Cc[h * 3 + 2] = _c.b; }
    return { P, Cc, n: half };
  };
  const last = wrow[wrow.length - 1], u0 = { P: new Float32Array(half * 3), Cc: new Float32Array(half * 3), n: half };
  for (let h = 0; h < half; h++) for (let k = 0; k < 3; k++) { u0.P[h * 3 + k] = last.P[h * 2 * 3 + k]; u0.Cc[h * 3 + k] = last.Cc[h * 2 * 3 + k]; }
  let prev = u0; under.forEach(([y, s, amp, ck], r) => { const row = mk(y, s, amp, ck, r + 1); strip(prev, row); prev = row; });
  { // tip fan
    const tipY = -10.6 * depthK, ct = cols.u3; const tx = (rnd() - 0.5) * 0.6, tz = (rnd() - 0.5) * 0.6;
    for (let h = 0; h < half; h++) { const h1 = (h + 1) % half; _ca.setRGB(prev.Cc[h * 3], prev.Cc[h * 3 + 1], prev.Cc[h * 3 + 2]); _cb.setRGB(prev.Cc[h1 * 3], prev.Cc[h1 * 3 + 1], prev.Cc[h1 * 3 + 2]);
      acc.triv(prev.P[h * 3], prev.P[h * 3 + 1], prev.P[h * 3 + 2], _ca, prev.P[h1 * 3], prev.P[h1 * 3 + 1], prev.P[h1 * 3 + 2], _cb, tx, tipY, tz, ct); }
  }
  const T = tpls(), tint = new THREE.Color();
  // boulders at the waterline and hanging rocks below
  const nb = 4 + Math.round(R * 0.5);
  for (let q = 0; q < nb; q++) {
    const i = Math.floor(rnd() * n), s = 0.42 + rnd() * 0.5, onWater = q < nb * 0.55, y = onWater ? WY + 0.1 + rnd() * 0.5 : (-3.2 - rnd() * 5) * depthK, rad = onWater ? 0.1 + rnd() * 0.25 : (-0.6 - rnd() * 0.6), k = onWater ? 1 : 0.55 + rnd() * 0.3;
    tint.copy(onWater ? cols.c2 : cols.u1).multiplyScalar(0.85 + rnd() * 0.5);
    acc.add(T.rocks[q % 3], O[i * 2] * k + ux[i] * rad, y, O[i * 2 + 1] * k + uz[i] * rad, rnd() * 6.3, s * (0.9 + rnd() * 0.5), s * (0.8 + rnd() * 0.5), s * (0.9 + rnd() * 0.5), tint, 0, 0, 0.3);
  }
  const nr = 5 + Math.round(R * 0.7);
  for (let q = 0; q < nr; q++) { const i = Math.floor(rnd() * n), y = (-2.6 - rnd() * 2.2) * depthK ** 0.5, s = 0.8 + rnd() * 0.9, k = 0.96 - rnd() * 0.06; tint.copy(cols.u0).lerp(new THREE.Color(0x6a4a3a), 0.5);
    acc.add(T.roots[q % 3], O[i * 2] * k, y, O[i * 2 + 1] * k, rnd() * 6.3, s * 0.9, s, s * 0.9, null, 0, 0, 0.1); }
  const rg = acc.build(false), rock = new THREE.Mesh(rg, ROCK_MAT); rock.castShadow = false; rock.receiveShadow = false; rock.name = 'islandRock';
  const grp = new THREE.Group(); grp.name = 'island'; grp.position.set(cx, 0, cz); grp.add(top, rock);
  return { grp, top, rock, R };
}
