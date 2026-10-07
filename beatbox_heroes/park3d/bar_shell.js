// Bar shell (Stage and Club Artist INT-B): slab, building body, plank floor, the four walls (north and west full height, south and east cut low for the dollhouse view),
// door frame and leaf, wainscot, brick, picture rail, ceiling beams and truss posts. Layout in metres, +z toward the camera, origin = middle of the room (x -6..6, z -5..5).
import { col, mix, mul, aoTint, bar, K, sm, truss, parCan, PINKN, CYANN } from './venue_kit.js';
import { wallFace, fbm, vnoise } from './flat_kit.js';

export const BAR = {
  minX: -6, maxX: 6, minZ: -5, maxZ: 5, wallH: 3.2, lowH: 0.95, T: 0.28, ceilY: 3.25,
  door: { x0: -1.0, x1: 0.4 },                                            // opening in the south wall
  stage: { x0: 1.0, x1: 6.0, z0: -5.0, z1: -2.5, h: 0.38 },               // 5 x 2.5 m, right-back
  counter: { x0: -4.75, x1: -4.0, z0: -4.0, z1: 1.9 },                    // along the west wall, left
};
const H = BAR.wallH, LOW = BAR.lowH;

export function buildShell(S) {
  const B = S.B, R = S.rand, st = BAR.stage;
  // ---------------------------------------------------------------- slab and the building body below
  const slabC = col('#7a6a8c');
  B.box(0, -0.57, 0, 12.56, 0.55, 10.56, slabC, { base: 0.1, tint: 0.03, top: mix(slabC, K.cream, 0.15), bottom: true });
  const lower = (a, b, nrm) => wallFace(B, a, b, nrm, 3.4, (u, v, uc, vc) => { const brick = K.brick; const k = ((Math.floor(uc / 0.5) + Math.floor(vc / 0.5) * 3) % 4 + 4) % 4; return mix(aoTint(mul(mix(brick, K.brickL, k / 3), 0.85), 0.35), col('#6a4a8a'), 0.2 + 0.55 * (1 - sm(0, 3.4, v))); }, { y0: -3.95, stepU: 0.6, vBreaks: [0.8, 1.6, 2.4] });
  lower([-6.28, 5.28], [6.28, 5.28], [0, 1]); lower([6.28, 5.28], [6.28, -5.28], [1, 0]);
  [[-4.5, 5.29], [-2.0, 5.29], [3.0, 5.29], [5.0, 5.29]].forEach(([x, z]) => B.box(x, -3.1, z - 0.01, 1.1, 1.2, 0.04, col('#34264a'), { base: 0, tint: 0.1 })); [[6.29, -3.0], [6.29, 0.4]].forEach(([x, z]) => B.box(x - 0.01, -3.1, z, 0.04, 1.2, 1.1, col('#34264a'), { base: 0, tint: 0.1 }));

  // ---------------------------------------------------------------- floor: dark walnut planks (E-W), violet contact shade near the tall walls
  const wallAO = (x, z) => { let k = 0; k += 0.42 * (1 - sm(0, 1.0, z + 5)); k += 0.42 * (1 - sm(0, 1.0, x + 6)); k += 0.2 * (1 - sm(0, 0.6, 5 - z)); k += 0.2 * (1 - sm(0, 0.6, 6 - x)); return Math.min(0.75, k); };
  const grime = (x, z) => 1 - 0.18 * sm(0.45, 0.8, fbm(x * 0.7, z * 0.7, 5));
  B.poly([[-6, -5], [6, -5], [6, 5], [-6, 5]], -0.004, col('#1f1630'));
  const plank = [col('#8a5a58'), col('#7a4a50'), col('#9a6a60'), col('#6e4048')]; const ROW = 0.26;
  for (let z = -5; z < 5 - 0.01; z += ROW) {
    const z1 = Math.min(5, z + ROW - 0.012); let x = -6 - R() * 1.2;
    while (x < 6) { const len = 1.6 + R() * 2.2, xa = Math.max(-6, x), xb = Math.min(6, x + len - 0.012); x += len; if (xb - xa < 0.05) continue;
      const base = mix(plank[(R() * 4) | 0], plank[(R() * 4) | 0], R()), tn = 0.94 + R() * 0.12, cc = (px, pz) => aoTint(mul(base, tn * grime(px, pz)), wallAO(px, pz));
      B.quad([xa, 0, z], [xa, 0, z1], [xb, 0, z1], [xb, 0, z], cc(xa, z), cc(xa, z1), cc(xb, z1), cc(xb, z)); } }

  // ---------------------------------------------------------------- wall colour logic
  const brickAt = (uc, vc, wall) => { const row = Math.floor(vc / 0.2), off = row % 2 ? 0.2 : 0, k = (Math.floor((uc + off) / 0.4) * 7 + row * 13 + wall * 5), pick = ((k % 4) + 4) % 4; const c = mix(mix(K.brickD, K.brick, 0.55), K.brickL, [0, 0.35, 0.7, 0.15][pick]); return mul(c, 0.92 + 0.14 * vnoise(uc * 1.7, vc * 1.7, 4 + wall)); };
  const vb = [0.12, 1.0, 1.1, 2.1, 2.3, 2.6, 2.95];
  for (let v = 1.3; v < 1.0 + 2.2; v += 0.2) vb.push(+v.toFixed(3)); for (let v = 2.3; v < H; v += 0.2) vb.push(+v.toFixed(3));
  const North = (u, v, uc, vc) => {
    const x = uc - 6; let b;
    if (vc < 0.12) b = K.cream; else if (vc < 1.0) b = mul(mix(K.tealD, K.teal, 0.3 + 0.15 * Math.sin(uc * 2.2)), 0.9 + 0.1 * ((Math.floor(uc / 0.3)) % 2)); else if (vc < 1.1) b = K.creamD; else b = brickAt(uc, vc, 0);
    const k = 0.4 * (1 - sm(0, 0.5, v)) * (vc < 0.2 ? 0.3 : 1) + 0.3 * sm(H - 0.8, H, v) + 0.35 * (1 - sm(0, 0.45, u)) + 0.35 * (1 - sm(0, 0.45, 12 - u)) + 0.1 * sm(0.35, 0.8, fbm(uc * 1.3, vc * 1.3, 8));
    void x; return aoTint(b, Math.min(0.8, k));
  };
  const West = (u, v, uc, vc) => { // u from the south end going north (z = 5 - u)
    let b; if (vc < 0.12) b = K.cream; else if (vc < 1.0) b = mul(K.woodD, 0.9 + 0.1 * ((Math.floor(uc / 0.28)) % 2)); else if (vc < 1.1) b = K.goldD;
    else if (vc < 2.25) { const t = ((Math.floor(uc / 0.22) + Math.floor((vc - 1.1) / 0.22)) % 2); b = mul(mix(K.tealD, K.mint, 0.18 + 0.1 * t), 0.78 + 0.14 * vnoise(uc * 3, vc * 3, 11)); } else b = brickAt(uc, vc, 1);
    const k = 0.4 * (1 - sm(0, 0.5, v)) * (vc < 0.2 ? 0.3 : 1) + 0.3 * sm(H - 0.8, H, v) + 0.35 * (1 - sm(0, 0.45, u)) + 0.35 * (1 - sm(0, 0.45, 10 - u)) + 0.1 * sm(0.35, 0.8, fbm(uc * 1.3, vc * 1.3, 18));
    return aoTint(b, Math.min(0.8, k));
  };
  const vbW = [0.12, 1.0, 1.1, 2.25]; for (let v = 1.32; v < 2.25; v += 0.22) vbW.push(+v.toFixed(3)); for (let v = 2.45; v < H; v += 0.2) vbW.push(+v.toFixed(3));
  const vbN = [0.12, 1.0, 1.1]; for (let v = 1.3; v < H; v += 0.2) vbN.push(+v.toFixed(3));
  wallFace(B, [-6, -5], [6, -5], [0, 1], H, North, { stepU: 0.3, vBreaks: vbN });
  wallFace(B, [-6, 5], [-6, -5], [1, 0], H, West, { stepU: 0.22, vBreaks: vbW });
  // low south wall (door cut) and low east wall: plum plaster with a wooden cap, cream skirting
  const lowIn = (len) => (u, v, uc, vc) => { const b = vc < 0.12 ? K.cream : mix(K.plum, K.plumL, 0.25 + 0.15 * Math.sin(uc * 3)); return aoTint(b, Math.min(0.7, 0.35 * (1 - sm(0, 0.4, v)) + 0.3 * (1 - sm(0, 0.4, u)) + 0.3 * (1 - sm(0, 0.4, len - u)))); };
  const dU0 = 6 - BAR.door.x1, dU1 = 6 - BAR.door.x0;
  wallFace(B, [6, 5], [-6, 5], [0, -1], LOW, lowIn(12), { stepU: 0.5, vBreaks: [0.12], holes: [{ u0: dU0, u1: dU1, v0: -1, v1: LOW + 1 }] });
  wallFace(B, [6, -5], [6, 5], [-1, 0], LOW, lowIn(10), { stepU: 0.5, vBreaks: [0.12] });
  // wall caps (the cut tops of the low walls and the tall ones), so the dollhouse section reads as a solid
  const cap = (x0, z0, x1, z1, y, c) => { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz * 0.14, nz = ux * 0.14; B.quad([x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz], [x0 + nx, y, z0 + nz], c); };
  // exterior faces: brick on the south and east (the camera sees these), plaster for north and west
  const brickOut = (a, b, nrm, y0, top) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); wallFace(B, a, b, nrm, top - y0, (u, v, uc, vc) => { const row = Math.floor((vc + y0) / 0.2), pick = ((Math.floor((uc + (row % 2 ? 0.2 : 0)) / 0.4) * 7 + row * 13) % 4 + 4) % 4; return mul(aoTint(mix(K.brickD, K.brickL, [0.1, 0.4, 0.7, 0.25][pick]), 0.1 + 0.3 * (1 - sm(0, 0.5, vc + y0 + 0.55))), 0.9 + 0.12 * vnoise(uc * 2, vc * 5, 12)); }, { y0, stepU: 0.4, vBreaks: [0.4, 0.6, 0.8, 1.0, 1.2, 1.4] }); void L; };
  B.box(0, -0.55, 5.26, 12.56, LOW + 0.55, 0.03, col('#b89a86'), { base: 0, tint: 0.02 }); B.box(6.26, -0.55, 0, 0.03, LOW + 0.55, 10.5, col('#b89a86'), { base: 0, tint: 0.02 });
  brickOut([-6.28, 5.29], [6.28, 5.29], [0, 1], -0.55, LOW); brickOut([6.29, 5.28], [6.29, -5.28], [1, 0], -0.55, LOW);
  const plaster = (u, v, uc, vc) => aoTint(mix(col('#a08aa8'), col('#8a789c'), 0.3 + 0.3 * vnoise(uc * 0.8, vc * 0.8, 31)), 0.18 * (1 - sm(0, 1, v)));
  wallFace(B, [6.28, -5.28], [-6.28, -5.28], [0, -1], H + 0.55, plaster, { y0: -0.55, stepU: 1.0 }); wallFace(B, [-6.28, -5.28], [-6.28, 5.28], [-1, 0], H + 0.55, plaster, { y0: -0.55, stepU: 1.0 });
  // wall tops and thickness: top of the tall walls (north, west) and the low ones as cream/wood caps
  cap(-6.28, -5.14, 6.28, -5.14, H, K.creamD); cap(-6.14, -5.28, -6.14, 5.28, H, K.creamD);
  cap(-6.28, 5.14, BAR.door.x0, 5.14, LOW, K.woodL); cap(BAR.door.x1, 5.14, 6.28, 5.14, LOW, K.woodL); cap(6.14, -5.28, 6.14, 5.28, LOW, K.woodL);
  B.quad([6.28, LOW, 5.28], [6.28, LOW, 5.0], [6.0, LOW, 5.0], [6.0, LOW, 5.28], K.woodL);
  // end caps of the tall walls
  B.quad([6.28, -0.55, -5.28], [6.28, H, -5.28], [6.28, H, -5.0], [6.28, -0.55, -5.0], mix(K.creamD, col('#6a4a8a'), 0.2)); B.quad([-6.28, -0.55, 5.28], [-6.28, -0.55, 5.0], [-6.28, H, 5.0], [-6.28, H, 5.28], mix(K.creamD, col('#6a4a8a'), 0.2));
  // picture rail and crown moulding (north and west)
  B.box(0, 2.58, -4.93, 12, 0.07, 0.1, K.goldD, { base: 0 }); B.box(-5.93, 2.58, 0, 0.1, 0.07, 10, K.goldD, { base: 0 }); B.box(0, 3.1, -4.9, 12, 0.1, 0.2, K.creamD, { base: 0 }); B.box(-5.9, 3.1, 0, 0.2, 0.1, 10, K.creamD, { base: 0 });

  // ---------------------------------------------------------------- door: frame, half-open leaf, lintel and the sign above (the opening is cut into the low south wall)
  const dxm = (BAR.door.x0 + BAR.door.x1) / 2, dw = BAR.door.x1 - BAR.door.x0, dz = 5.0;
  B.box(BAR.door.x0 - 0.06, 0, dz, 0.14, 2.35, 0.34, K.woodD, { base: 0.2, tint: 0.03 }); B.box(BAR.door.x1 + 0.06, 0, dz, 0.14, 2.35, 0.34, K.woodD, { base: 0.2, tint: 0.03 }); B.box(dxm, 2.3, dz, dw + 0.34, 0.2, 0.34, K.woodD, { base: 0.1, top: K.woodL });
  B.push(BAR.door.x0 + 0.02, 0, dz - 0.08, -1.1); B.box(dw * 0.46, 0, 0, dw * 0.92, 2.2, 0.06, mix(K.plumD, K.plum, 0.4), { base: 0.2, tint: 0.04 }); B.box(dw * 0.46, 0.9, 0.031, dw * 0.6, 0.8, 0.02, mix(K.plumL, K.plum, 0.5), { base: 0 }); B.box(dw * 0.88, 1.0, 0.0, 0.05, 0.05, 0.12, K.gold, { base: 0 }); B.pop();
  B.box(dxm, 0, dz + 0.1, 1.15, 0.025, 0.7, mix(K.plumD, K.ink, 0.4), { base: 0.3, tint: 0.02 }); S.decal('mat', dxm, 0.03, dz - 0.5, 1.1, 0.55, 0, -Math.PI / 2, [1, 1, 1]);
  S.screen('sign_exit', dxm, 2.62, dz + 0.1, 0.56, 0.22, 0, 0, [1.3, 1.3, 1.3]); S.lights.push({ x: dxm, y: 2.2, z: dz - 0.2, color: '#ff6a5a', r: 1.4, i: 0.39, kind: 'neon' });
  S.soft(dxm, dz - 0.3, 0.8, 0.5, 0.4);
  S.anchors.door = { x: dxm, z: 4.45, rot: 0 };
}

// ceiling hardware: a wood beam over the counter for the pendants, a truss across the BACK of the stage (so it never blocks the camera that looks in from the south-east),
// a steel boom from the counter beam across the room that carries the disco ball chain
export function buildRig(S) {
  const B = S.B, GL = S.GLOW, st = BAR.stage;
  B.box(-4.4, 3.04, -2.1, 0.16, 0.2, 6.4, K.woodD, { base: 0.1, tint: 0.03 }); bar(B, [-4.4, 3.04, 1.1], [-5.0, 3.1, 1.6], 0.07, 0.07, K.woodD); bar(B, [-5.95, 3.15, 1.6], [-4.4, 3.04, 1.1], 0.06, 0.06, K.woodD);
  // stage back truss, posts in the back corners
  const ty = 3.0, tz = st.z0 + 0.75, s = 0.28;
  truss(B, [st.x0 + 0.2, ty, tz], [st.x1 - 0.2, ty, tz], s, K.steel, K.steelD, 0.5);
  [st.x0 + 0.2, st.x1 - 0.2].forEach((x) => { truss(B, [x, st.h, tz], [x, ty - s / 2, tz], s * 0.85, K.steel, K.steelD, 0.5); B.box(x, st.h, tz, 0.46, 0.05, 0.46, K.steelD, { base: 0 }); S.hit.circle(x, tz, 0.3); });
  // disco ball boom (pipe) from the counter beam over the dance floor
  bar(B, [-4.4, 3.2, 0.2], [3.4, 3.2, 0.2], 0.07, 0.07, K.steelD, { base: 0.1 }); bar(B, [-4.4, 3.04, 0.2], [-4.4, 3.2, 0.2], 0.05, 0.05, K.steelD); B.box(3.4, 3.1, 0.2, 0.2, 0.12, 0.2, K.steel, { base: 0 });
  bar(B, [3.4, 3.12, 0.2], [3.4, 2.82, 0.2], 0.018, 0.018, K.steelL);
  S.anchors.discoBall = { x: 3.4, y: 2.55, z: 0.2 }; S.discoPos = { x: 3.4, y: 2.55, z: 0.2 };
  // par cans on the back truss, aimed forward and down at the stage and the dance floor
  [[1.8, PINKN], [2.9, CYANN], [4.1, PINKN], [5.2, CYANN]].forEach(([x, g], i) => parCan(B, GL, x, ty - 0.2, tz + 0.05, (i % 2 ? -0.12 : 0.12), 0.8, g, 0.1));
  parCan(B, GL, 3.4, 3.0, 0.2, Math.PI, 0.8, PINKN, 0.1);
  S.anchors.rig = [{ x: 1.8, y: ty - 0.25, z: tz }, { x: 2.9, y: ty - 0.25, z: tz }, { x: 4.1, y: ty - 0.25, z: tz }, { x: 5.2, y: ty - 0.25, z: tz }, { x: 3.4, y: 3.0, z: 0.2 }, { x: -4.4, y: 3.0, z: -0.6 }];
}
