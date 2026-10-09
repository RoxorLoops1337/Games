// Encore Island 3D environment: decor for one island, merged into ONE vertex-coloured mesh (plus one glow mesh at night and one soft ground-shadow mesh).
// Trees (round blossom / tiered pine / spotted mushroom by biome prop style), bushes, faceted rocks, flowers and grass tufts, 2 to 3 variants each,
// with GPU wind sway (aSw / aPh attributes) chained after kit's look patch.
import * as THREE from 'three';
import * as kit from './kit.js';
import { W, Acc, tpl, facetGeo, patchMat, radiusSafe, smoothBlob, runSync } from './env_util.js';

const C3 = (h) => new THREE.Color(h);
const BROWN = 0x8a5e3e, BROWN2 = 0x6a4430;
// grey template vertices take the instance tint; coloured ones keep their colour (see Acc.add). shade() bakes a light/dark ramp from the normal.
function shade(g, lo = 0.8, hi = 1.12, bot = 0.0) {
  const c = g.attributes.color, n = g.attributes.normal, p = g.attributes.position; if (!c) return g;
  for (let i = 0; i < c.count; i++) { const r = c.getX(i), gg = c.getY(i), b = c.getZ(i); if (Math.abs(r - gg) < 0.004 && Math.abs(gg - b) < 0.004) { const k = lo + (hi - lo) * (n.getY(i) * 0.5 + 0.5); c.setXYZ(i, r * k, gg * k, b * k); } }
  return g;
}
const blob = (b, g, x, y, z, r, sy = 0.9, det = 1, seed = 1) => b.shape(smoothBlob(kit.icoDetail(det - 1), 0.1, seed, sy), g, x, y, z, r); // det 2 = main crown, 1 = side lobes

let _T = null;
function* T() {
  if (_T) return _T; const t = { round: [], pine: [], mush: [], bush: [], rock: [], flower: [], tuft: null, dot: null, quad: null };
  const trunk = (b, h, r0 = 0.15, r1 = 0.1, lean = 0) => b.part(kit.GB.cyl(kit.seg(7), r1 / r0), BROWN, lean * h * 0.3, h / 2, 0, r0, h, r0, 0, 0, -lean);
  // round blossom trees
  t.round[0] = tpl((b) => { trunk(b, 1.05, 0.17, 0.11); b.ball(BROWN2, 0, 0.12, 0, 0.26, 0.5); blob(b, 0xffffff, 0, 1.75, 0, 0.98, 0.88, 2, 3); blob(b, 0xf0f0f0, -0.62, 1.5, 0.2, 0.62, 0.9, 1, 4); blob(b, 0xf4f4f4, 0.6, 1.55, -0.15, 0.64, 0.9, 1, 5); blob(b, 0xffffff, 0.05, 2.4, 0.05, 0.62, 0.9, 1, 6); blob(b, 0xf8f8f8, 0.1, 1.55, 0.62, 0.55, 0.85, 1, 7); });
  t.round[1] = tpl((b) => { trunk(b, 0.85, 0.2, 0.12, 0.25); b.ball(BROWN2, 0, 0.1, 0, 0.3, 0.45); blob(b, 0xffffff, 0.15, 1.5, 0, 0.92, 0.7, 2, 8); blob(b, 0xf2f2f2, -0.8, 1.35, 0.1, 0.7, 0.75, 1, 9); blob(b, 0xf6f6f6, 0.95, 1.4, -0.1, 0.72, 0.75, 1, 10); blob(b, 0xfafafa, 0.1, 1.55, 0.8, 0.62, 0.8, 1, 11); blob(b, 0xffffff, -0.1, 1.9, -0.55, 0.6, 0.8, 1, 12); });
  t.round[2] = tpl((b) => { trunk(b, 1.35, 0.14, 0.09); blob(b, 0xffffff, 0, 1.95, 0, 0.78, 0.95, 2, 13); blob(b, 0xf6f6f6, 0, 2.55, 0, 0.58, 0.95, 1, 14); blob(b, 0xfcfcfc, 0, 3.0, 0, 0.38, 1, 1, 15); blob(b, 0xf0f0f0, 0.45, 1.85, 0.2, 0.5, 0.9, 1, 16); });
  yield;
  // tiered pines with snow caps (the caps are coloured white, so they ignore the tint)
  const pine = (b, tiers, h0, k) => { trunk(b, 0.7, 0.14, 0.1); let y = 0.35; const sn = 0xf6fbff; for (let i = 0; i < tiers; i++) { const r = (1.05 - i * (0.8 / tiers)) * k, h = 0.95 - i * 0.07; b.part(kit.GB.cone(kit.seg(9)), 0xffffff, 0, y + h / 2, 0, r, h, r); b.part(kit.GB.cone(kit.seg(9)), sn, 0, y + h * 0.7, 0, r * 0.5, h * 0.52, r * 0.5); y += h * 0.62; } b.part(kit.GB.cone(kit.seg(7)), sn, 0, y + 0.2, 0, 0.16 * k, 0.42, 0.16 * k); };
  t.pine[0] = tpl((b) => pine(b, 4, 0, 1)); t.pine[1] = tpl((b) => pine(b, 3, 0, 1.1)); t.pine[2] = tpl((b) => pine(b, 5, 0, 0.9));
  yield;
  // mushrooms: cream stem, tinted dome, cream spots, dark gills
  const mush = (b, cap, stemH, spots) => { b.lathe(0xfff0dc, [[0.0, 0], [0.3, 0], [0.22, stemH * 0.4], [0.2, stemH * 0.8], [0.26, stemH], [0.0, stemH]], 0, 0, 0, kit.seg(10)); b.lathe(0xffffff, [[0.0, 0], [cap, 0], [cap * 1.02, 0.1 * cap], [cap * 0.9, 0.42 * cap], [cap * 0.6, 0.7 * cap], [cap * 0.28, 0.88 * cap], [0, 0.93 * cap]].map(([x, y]) => [x, y + stemH - 0.05]), 0, 0, 0, kit.seg(14)); b.part(kit.GB.cyl(kit.seg(12), 0.9), 0x8a5a8a, 0, stemH - 0.06, 0, cap * 0.98, 0.1, cap * 0.98);
    const r = kit.rng(spots); for (let i = 0; i < 7; i++) { const a = r() * 6.28, el = 0.25 + r() * 0.75, rr = cap * (0.98 - 0.6 * el * el), y = stemH - 0.05 + cap * (0.12 + 0.8 * el * 0.98 * (1 - 0.22 * el)); b.ball(0xfff4e6, Math.cos(a) * rr * 0.93, y, Math.sin(a) * rr * 0.93, 0.15 + r() * 0.07, 0.4, 1, 1); } };
  t.mush[0] = tpl((b) => mush(b, 1.05, 0.9, 3)); t.mush[1] = tpl((b) => mush(b, 0.85, 1.2, 5)); t.mush[2] = tpl((b) => mush(b, 1.25, 0.7, 7));
  yield;
  // bushes
  t.bush[0] = tpl((b) => { blob(b, 0xffffff, 0, 0.42, 0, 0.55, 0.8, 2, 21); blob(b, 0xf0f0f0, -0.4, 0.33, 0.12, 0.38, 0.8, 1, 22); blob(b, 0xf6f6f6, 0.42, 0.34, -0.06, 0.4, 0.8, 1, 23); });
  t.bush[1] = tpl((b) => { blob(b, 0xffffff, 0, 0.36, 0, 0.5, 0.75, 2, 24); blob(b, 0xf2f2f2, 0.35, 0.28, 0.25, 0.34, 0.8, 1, 25); blob(b, 0xf8f8f8, -0.3, 0.5, -0.1, 0.32, 0.9, 1, 26); blob(b, 0xececec, 0.0, 0.3, -0.38, 0.3, 0.8, 1, 27); });
  yield;
  // rocks: faceted on purpose, mossy tops
  for (let i = 0; i < 3; i++) t.rock[i] = tpl((b) => { const g = facetGeo(1, 0.34, 31 + i * 5, 0.75 + i * 0.1), c = g.attributes.color; b.shape(g, 0xffffff, 0, 0.3 * (0.75 + i * 0.1), 0, 0.5 + i * 0.07); if (i !== 1) b.shape(facetGeo(1, 0.3, 40 + i, 0.8), 0xf4f4f4, 0.5, 0.18, 0.15, 0.26); });
  yield;
  // flowers: stem + petals (tinted) + centre
  t.flower[0] = tpl((b) => { b.part(kit.GB.cyl(4, 0.8), 0x5fb85a, 0, 0.22, 0, 0.022, 0.44, 0.022); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; b.ball(0xffffff, Math.cos(a) * 0.11, 0.47, Math.sin(a) * 0.11, 0.09, 0.45, 1, 0); } b.ball(0xffd84d, 0, 0.485, 0, 0.065, 0.7, 1, 0); b.part(kit.GB.cone(4), 0x5fb85a, 0.06, 0.12, 0, 0.07, 0.16, 0.025, 0, 0, -0.8); });
  t.flower[1] = tpl((b) => { b.part(kit.GB.cyl(4, 0.8), 0x5fb85a, 0, 0.25, 0, 0.022, 0.5, 0.022); b.part(kit.GB.cone(6), 0xffffff, 0, 0.55, 0, 0.13, 0.22, 0.13, Math.PI, 0, 0); b.ball(0xffffff, 0, 0.5, 0, 0.1, 0.6, 1, 0); b.part(kit.GB.cone(5), 0x5fb85a, -0.06, 0.12, 0, 0.07, 0.16, 0.025, 0, 0, 0.8); });
  yield;
  // grass tuft: five slanted blades
  t.tuft = tpl((b) => { const r = kit.rng(5); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + r(), l = 0.22 + r() * 0.16; b.part(kit.GB.cone(4), 0xffffff, Math.cos(a) * 0.05, l / 2, Math.sin(a) * 0.05, 0.035, l, 0.012, 0, a, 0.3 * Math.cos(a * 1.7)); } });
  t.dot = tpl((b) => b.ball(0xffffff, 0, 0, 0, 1, 1, 1, 1));
  return (_T = t);
}

// ---- materials: sway patched lit vertex-colour material, glow (night flowers), ground shadow
let _mat = null, _glow = null, _sh = null;
const SWAY_V = `attribute float aSw; attribute float aPh; uniform float uWT;`;
const SWAY_B = `#include <begin_vertex>
 { float sw = aSw * (0.05 + 0.025 * sin(uWT * 0.6 + aPh * 0.7)); transformed.x += sin(uWT * 1.8 + aPh) * sw + sin(uWT * 3.1 + aPh * 2.0) * sw * 0.25; transformed.z += cos(uWT * 1.4 + aPh * 1.3) * sw * 0.6; }`;
function decorMat() {
  if (_mat) return _mat; const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  patchMat(m, 'sway', (sh) => { sh.uniforms.uWT = kit.LOOK.t; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SWAY_V).replace('#include <begin_vertex>', SWAY_B); }); m.userData.shared = true; return (_mat = m);
}
function glowMat() {
  if (_glow) return _glow; const m = new THREE.MeshBasicMaterial({ vertexColors: true }); m.onBeforeCompile = (sh) => { sh.uniforms.uWT = kit.LOOK.t; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SWAY_V).replace('#include <begin_vertex>', SWAY_B); }; m.customProgramCacheKey = () => 'glowsway'; m.userData.noCast = true; m.userData.noLook = true; return (_glow = m);
}
function shadowMat() { // soft ground decals: the shared round-shadow texture times a per-vertex rgba (tree shadows and the boardwalk's shadow on the water)
  if (_sh) return _sh; const m = new THREE.MeshBasicMaterial({ map: kit.softTex('shadow'), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); m.userData.noCast = true; m.userData.noLook = true; return (_sh = m);
}

const SZ = { tree: [1.0, 0.9, 1.0], pine: [0.85, 0.85, 0.85], mush: [1.0, 1.0, 1.0] };
/**
 * g: land geometry, B: biome, bi: biome index, items: decorOf(g) or HUBDECOR, extras: [{x,y}] positions in px to keep clear (plates...), blocked(x,y) -> true where tufts must not grow.
 * Returns a Group in island-local coordinates (origin at the island centre).
 */
export const buildDecor = (g, B, bi, items, o) => runSync(buildDecorG(g, B, bi, items, o));
export function* buildDecorG(g, B, bi, items, o = {}) {
  const dens = (o.density === undefined ? 1 : o.density), t = yield* T(), A = new Acc(), GL = new Acc(), rnd = kit.rng(g.seed * 13 + 1), cx = g.x, cy = g.y, night = bi === 6, style = B.prop || 'round';
  const treeTint = (r) => C3(B.tree[0]).lerp(C3(B.tree[1]), r()).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.08);
  const stone = C3(B.cliff).lerp(C3(0xe6e0f4), 0.5), tuftC = C3(B.tuft).lerp(C3(0xffffff), 0.1), bushC = C3(B.g[1]).lerp(C3(B.deep), 0.45), shadows = [];
  const L = (p) => [(p.x - cx) * W, (p.y - cy) * W];
  const flowerCols = B.flowers.map(C3);
  const addFlowerHead = (x, y, z, s, col, ph) => { const th = night ? GL : A, c = col.clone(); if (night) c.multiplyScalar(2.0); th.add(t.dot, x, y, z, 0, 0.1 * s, 0.07 * s, 0.1 * s, c, 1.4, ph, 0); };
  let step = 0;
  for (const it of items) {
    if (++step % 6 === 0) yield;
    const [x, z] = L(it), s = it.s || 1, v = it.v % 3, ph = rnd() * 6.28, yaw = rnd() * 6.28; if (it.t !== 'tree' && dens < 1 && rnd() > dens) continue;
    if (it.t === 'tree') {
      const tp = style === 'pine' ? t.pine[v] : style === 'mush' ? t.mush[v] : t.round[v], k = style === 'mush' ? 1.15 : 1;
      A.add(tp, x, 0, z, yaw, s * k, s * k * (0.95 + rnd() * 0.15), s * k, style === 'pine' ? C3(0x3a8a86).lerp(C3(B.tree[1]), 0.12 + rnd() * 0.2).offsetHSL(0, 0, (rnd() - 0.5) * 0.07) : treeTint(rnd), 1, ph);
      shadows.push([x + 0.28 * s, z - 0.2 * s, (style === 'mush' ? 1.25 : 1.15) * s]);
    } else if (it.t === 'bush') {
      A.add(t.bush[v % 2], x, 0, z, yaw, s, s * (0.9 + rnd() * 0.2), s, bushC.clone().lerp(treeTint(rnd), 0.35), 0.8, ph);
      for (let q = 0; q < 3; q++) { const a = rnd() * 6.28, rr = 0.25 + rnd() * 0.3; addFlowerHead(x + Math.cos(a) * rr * s, 0.55 * s * (0.7 + rnd() * 0.4), z + Math.sin(a) * rr * s, 0.9 * s, flowerCols[(rnd() * flowerCols.length) | 0], ph); }
      shadows.push([x + 0.15 * s, z - 0.1 * s, 0.85 * s]);
    } else if (it.t === 'rock') {
      A.add(t.rock[v], x, 0, z, yaw, s, s * (0.8 + rnd() * 0.5), s, stone.clone().multiplyScalar(0.9 + rnd() * 0.25), 0, 0, 0.3); shadows.push([x + 0.12 * s, z - 0.1 * s, 0.75 * s]);
    } else if (it.t === 'flower') {
      for (let q = 0; q < 3; q++) { const fx = x + (rnd() - 0.5) * 0.7, fz = z + (rnd() - 0.5) * 0.7, c = flowerCols[(rnd() * flowerCols.length) | 0], sc = s * (0.8 + rnd() * 0.5);
        if (night) { A.add(t.tuft, fx, 0, fz, rnd() * 6, 1.3, 1.5 * sc, 1.3, tuftC, 1.2, ph + q, 0); addFlowerHead(fx, 0.5 * sc, fz, 1.7 * sc, c, ph + q); }
        else A.add(t.flower[(q + v) % 2], fx, 0, fz, rnd() * 6, sc, sc, sc, c, 1.6, ph + q, 0.1); }
    }
  }
  // grass tufts everywhere on open ground
  const R = g.r * W, nT = Math.round(R * R * (o.hub ? 1.1 : 2.0) * Math.min(1, dens)), keep = o.keep || [];
  for (let i = 0; i < nT; i++) {
    if (i % 40 === 39) yield;
    const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * 0.93, px = g.x + Math.cos(a) * g.r * rr, py = g.y + Math.sin(a) * g.r * rr; if (radiusSafe(g, px - g.x, py - g.y) < 70) continue;
    if (o.blocked && o.blocked(px, py)) continue; let bad = false; for (const q of keep) if ((px - q.x) * (px - q.x) + (py - q.y) * (py - q.y) < q.r * q.r) { bad = true; break; } if (bad) continue;
    const s = 0.7 + rnd() * 0.7; A.add(t.tuft, (px - cx) * W, 0, (py - cy) * W, rnd() * 6.28, s, s, s, tuftC.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.1), 1.5, rnd() * 6.28, 0.15);
    if (rnd() < 0.12) addFlowerHead((px - cx) * W + 0.05, 0.3 * s, (py - cy) * W, 0.55, flowerCols[(rnd() * flowerCols.length) | 0], 0);
  }
  // meadow patches (flower clusters in two biome colours with taller grass around them) and pebbles: the "life" between the plates
  const nP = Math.round(R * (o.hub ? 1.0 : 2.0) * dens), okSpot = (px, py) => { if (radiusSafe(g, px - g.x, py - g.y) < 110) return false; if (o.blocked && o.blocked(px, py)) return false; for (const q of keep) if ((px - q.x) * (px - q.x) + (py - q.y) * (py - q.y) < q.r * q.r) return false; return true; };
  for (let i = 0, tries = 0; i < nP && tries < nP * 6; tries++) {
    if (tries % 3 === 2) yield;
    const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * 0.86, px = g.x + Math.cos(a) * g.r * rr, py = g.y + Math.sin(a) * g.r * rr; if (!okSpot(px, py)) continue; i++;
    const c1 = flowerCols[(rnd() * flowerCols.length) | 0], c2 = flowerCols[(rnd() * flowerCols.length) | 0], n = 4 + ((rnd() * 5) | 0), lx = (px - cx) * W, lz = (py - cy) * W;
    for (let q = 0; q < n; q++) { const aa = rnd() * 6.28, d = 0.12 + rnd() * 0.55, fx = lx + Math.cos(aa) * d, fz = lz + Math.sin(aa) * d, sc = 0.75 + rnd() * 0.6, ph = rnd() * 6.28, c = q % 3 ? c1 : c2;
      if (night) { A.add(t.tuft, fx, 0, fz, rnd() * 6, 1.3, 1.5 * sc, 1.3, tuftC, 1.2, ph, 0); addFlowerHead(fx, 0.5 * sc, fz, 1.7 * sc, c, ph); } else A.add(t.flower[q % 2], fx, 0, fz, rnd() * 6, sc, sc, sc, c, 1.6, ph, 0.1);
      A.add(t.tuft, fx + 0.1, 0, fz - 0.08, rnd() * 6, 1.1, 1.3, 1.1, tuftC, 1.5, ph, 0.1); }
  }
  for (let i = 0, tries = 0; i < Math.round(R * 1.2 * dens) && tries < 200; tries++) { const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * 0.9, px = g.x + Math.cos(a) * g.r * rr, py = g.y + Math.sin(a) * g.r * rr; if (!okSpot(px, py)) continue; i++; const sc = 0.18 + rnd() * 0.22; A.add(t.rock[(rnd() * 3) | 0], (px - cx) * W, 0, (py - cy) * W, rnd() * 6.28, sc, sc * 0.8, sc, stone.clone().multiplyScalar(0.95 + rnd() * 0.2), 0, 0, 0.3); }
  yield; const grp = new THREE.Group(); grp.name = 'decor';
  const gm = yield* A.buildG(true); if (gm) { const m = new THREE.Mesh(gm, decorMat()); m.castShadow = true; m.receiveShadow = true; m.name = 'decorMesh'; grp.add(m); }
  const gg = yield* GL.buildG(true); if (gg) { const m = new THREE.Mesh(gg, glowMat()); m.name = 'decorGlow'; grp.add(m); }
  if (shadows.length || o.ribbon) { // merged soft quads (rgba vertex colours) plus the boardwalk shadow ribbon
    const pos = [], uv = [], col = [], idx = []; shadows.forEach(([x, z, r], i) => { const y = 0.014, b = i * 4; pos.push(x - r, y, z - r, x + r, y, z - r, x + r, y, z + r, x - r, y, z + r); uv.push(0, 0, 1, 0, 1, 1, 0, 1); for (let q = 0; q < 4; q++) col.push(0.02, 0.008, 0.06, 0.34); idx.push(b, b + 2, b + 1, b, b + 3, b + 2); });
    if (o.ribbon) { const rb = o.ribbon, base = pos.length / 3; for (let i = 0; i < rb.pos.length; i += 3) { pos.push(rb.pos[i] - cx * W, rb.pos[i + 1], rb.pos[i + 2] - cy * W); uv.push(0.5, 0.5); } for (const c of rb.col) col.push(c); for (const i of rb.idx) idx.push(base + i); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); sg.setIndex(idx); const m = new THREE.Mesh(sg, shadowMat()); m.renderOrder = -3; m.name = 'decorShadow'; grp.add(m); }
  return grp;
}
