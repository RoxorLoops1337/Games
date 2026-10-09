// Encore Island 3D environment: one boardwalk (g.path polyline of a land) as a real plank deck with stringers, piles standing in the sea, turned rail posts,
// a pink inlay line and little lanterns. Over the islands themselves the deck lies flat (no rails or piles); over water it gains all of them.
import * as THREE from 'three';
import * as kit from './kit.js';
import { W, WY, Acc, tpl, radiusSafe, runSync } from './env_util.js';

let _T = null;
function T() {
  if (_T) return _T;
  return (_T = {
    box: tpl((b) => b.box(0xffffff, 0, 0, 0, 1, 1, 1)),
    plank: tpl((b) => b.box(0xffffff, 0, 0, 0, 1, 1, 1)),
    pile: tpl((b) => b.part(kit.GB.cyl(kit.seg(9), 0.92), 0xffffff, 0, 0, 0, 1, 1, 1)),
    ball: tpl((b) => b.ball(0xffffff, 0, 0, 0, 1, 1, 1, kit.icoDetail(1))),
    cap: tpl((b) => b.part(kit.GB.cyl(kit.seg(9), 1.25), 0xffffff, 0, 0, 0, 1, 1, 1)),
  });
}
const sh = (hex, a, r) => new THREE.Color(hex).offsetHSL(0, 0, (r() - 0.5) * a);
const woodCols = [0xf2d6a6, 0xe9c898, 0xf6e0b4, 0xe2bf8c];

export const buildWalk = (g) => runSync(buildWalkG(g));
export function* buildWalkG(g) {
  const t = T(),  A = new Acc(), GL = new Acc(), r = kit.rng(g.seed * 3 + 11), P = g.path, par = geoOf(g.parent);
  const half = PATH_HALF * W, curve = new THREE.CatmullRomCurve3(P.map((p) => new THREE.Vector3(p.x * W, 0, p.y * W)), false, 'centripetal'), len = curve.getLength();
  const over = (x, z) => radiusSafe(par, x / W - par.x, z / W - par.y) > 38 || radiusSafe(g, x / W - g.x, z / W - g.y) > 38; // standing on an island: no rails or piles there
  const pitch = 0.36, n = Math.max(2, Math.round(len / pitch)), dk = new THREE.Color(0x8a6444), cream = new THREE.Color(0xfff4e6), pink = new THREE.Color(0xff9ec8);
  const pts = [], v = new THREE.Vector3(), tg = new THREE.Vector3();
  for (let i = 0; i <= n; i++) { const u = i / n; curve.getPointAt(u, v); curve.getTangentAt(u, tg); pts.push({ x: v.x, z: v.z, tx: tg.x, tz: tg.z, nx: -tg.z, nz: tg.x, wet: !over(v.x, v.z), u }); }
  const yawOf = (dx, dz) => Math.atan2(-dz, dx), DECK = 0.05, TH = 0.075, wid = half * 2 + 0.06;
  yield;
  // planks across the path
  for (let i = 0; i < n; i++) {
    if (i % 30 === 29) yield; const a = pts[i], b = pts[i + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = yawOf(a.nx, a.nz) + (r() - 0.5) * 0.03, c = sh(woodCols[(r() * 4) | 0], 0.06, r), jitter = (r() - 0.5) * 0.03;
    A.add(t.plank, mx + a.nx * jitter, DECK - TH / 2, mz + a.nz * jitter, ang, wid, TH, pitch * 0.86, c, 0, 0, 0.12); }
  // pink inlay dashes along the middle (the 2D boardwalk's dashed line)
  for (let i = 0; i < n; i += 2) { const a = pts[i]; A.add(t.box, a.x, DECK + 0.003, a.z, yawOf(a.tx, a.tz), 0.2, 0.012, 0.07, pink, 0, 0, 0); }
  // side stringers (two long beams under the deck edges) and cross beams, piles, rails
  for (let i = 0; i < n; i += 3) { const a = pts[i], b = pts[Math.min(n, i + 3)], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, l = Math.hypot(b.x - a.x, b.z - a.z) + 0.04, ang = yawOf(b.x - a.x, b.z - a.z);
    for (const sd of [-1, 1]) A.add(t.box, mx + a.nx * (half - 0.02) * sd, DECK - TH - 0.06, mz + a.nz * (half - 0.02) * sd, ang, l, 0.14, 0.12, dk, 0, 0, 0.2); }
  yield; let pileI = 0, postI = 0, lantI = 0;
  for (let i = 0; i <= n; i++) {
    if (i % 30 === 29) yield;
    const a = pts[i]; if (!a.wet) continue;
    if (i % 7 === 0) { // piles: pairs standing in the water, with a cross beam on top
      A.add(t.box, a.x, DECK - TH - 0.17, a.z, yawOf(a.nx, a.nz), wid + 0.1, 0.12, 0.2, dk, 0, 0, 0.2);
      for (const sd of [-1, 1]) { const px = a.x + a.nx * (half - 0.1) * sd, pz = a.z + a.nz * (half - 0.1) * sd, H = DECK - TH - 0.05 - (WY - 0.5); A.add(t.pile, px, (DECK - TH - 0.05 + WY - 0.5) / 2, pz, r() * 6, 0.13, H, 0.13, sh(0x9a7050, 0.1, r), 0, 0, 0.3); A.add(t.cap, px, DECK - TH - 0.1, pz, 0, 0.14, 0.05, 0.14, new THREE.Color(0xb88a58), 0, 0, 0); } pileI++;
    }
    if (i % 4 === 0) { // rail posts on both sides, a taller one every third carries a lantern
      const tall = postI % 3 === 1; postI++;
      for (const sd of [-1, 1]) { const px = a.x + a.nx * (half + 0.1) * sd, pz = a.z + a.nz * (half + 0.1) * sd, h = tall ? 1.15 : 0.62;
        A.add(t.pile, px, DECK + h / 2, pz, 0, 0.055, h, 0.055, sh(0xb88a58, 0.08, r), 0, 0, 0.2); A.add(t.ball, px, DECK + h + 0.03, pz, 0, tall ? 0.085 : 0.075, tall ? 0.085 : 0.075, tall ? 0.085 : 0.075, tall ? pink : cream, 0, 0, 0);
        if (tall && sd === (lantI++ % 2 ? 1 : -1)) { A.add(t.box, px - a.nx * 0.0, DECK + h - 0.1, pz, 0, 0.2, 0.025, 0.2, dk, 0, 0, 0); GL.add(t.ball, px, DECK + h - 0.2, pz, 0, 0.1, 0.13, 0.1, new THREE.Color(2.2, 1.5, 0.7), 0, 0, 0); A.add(t.cap, px, DECK + h + 0.0, pz, 0, 0.1, 0.07, 0.1, pink, 0, 0, 0); } }
    }
  }
  // rails: top and mid bars between consecutive post positions on the wet stretches
  for (let i = 0; i + 4 <= n; i += 4) { const a = pts[i], b = pts[i + 4]; if (!a.wet || !b.wet) continue; const l = Math.hypot(b.x - a.x, b.z - a.z) + 0.05, ang = yawOf(b.x - a.x, b.z - a.z);
    for (const sd of [-1, 1]) { const mx = (a.x + b.x) / 2 + (a.nx + b.nx) / 2 * (half + 0.1) * sd, mz = (a.z + b.z) / 2 + (a.nz + b.nz) / 2 * (half + 0.1) * sd;
      A.add(t.plank, mx, DECK + 0.6, mz, ang, l, 0.065, 0.085, cream, 0, 0, 0.1); A.add(t.plank, mx, DECK + 0.33, mz, ang, l, 0.045, 0.06, new THREE.Color(0xf6c8dc), 0, 0, 0.1); } }
  const grp = new THREE.Group(); grp.name = 'walk' + g.k;
  const geo = A.build(false); if (geo) { const m = new THREE.Mesh(geo, kit.SOLID); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
  const gg = GL.build(false); if (gg) { const m = new THREE.Mesh(gg, kit.glow(1, 1, 1, { vc: true })); m.castShadow = false; grp.add(m); }
  // soft shadow of the deck on the water: a ribbon at sea level with an alpha-faded edge, nudged away from the sun. It is handed to the island's decal mesh
  // (env_decor) so the whole land shares one transparent draw call; positions are world units, colours rgba.
  { const pos = [], col = [], idx = [], ox = 0.5, oz = -0.4, wd = half + 0.9;
    for (let i = 0; i <= n; i++) { const a = pts[i], wet = a.wet ? 1 : 0; for (const [s, al] of [[-1, 0], [-0.45, 0.3], [0.45, 0.3], [1, 0]]) { pos.push(a.x + a.nx * wd * s + ox, WY + 0.045, a.z + a.nz * wd * s + oz); col.push(0.02, 0.05, 0.16, al * wet * 0.85); } if (i) { const b0 = (i - 1) * 4, b1 = i * 4; for (let q = 0; q < 3; q++) idx.push(b0 + q, b1 + q, b0 + q + 1, b0 + q + 1, b1 + q, b1 + q + 1); } }
    grp.userData.ribbon = { pos, col, idx }; }
  return grp;
}
