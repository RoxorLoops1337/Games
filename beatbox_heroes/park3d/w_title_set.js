// SHELL: the static set of the title alley (brick canyon, pallet stage, props, windows, fire escape, string lights, back wall mural, skyline).
// buildSet(ctx, tex) -> { group, lights[], washMats[], glowMats{}, stage, bulbs[], ... }.  Metres, +z toward the camera, stage centre at (0, 0, -2.4). No em dashes.
import { THREE, rng, flatMat, canvasTex } from './kit.js';
import { Buf, col, mix, mul, fbm } from './terrain_util.js';

export const AL = { hw: 2.6, zF: 9.5, zB: -9, wallH: 17, endH: 7.6, stage: { x: 0, z: -1.8, w: 3.6, d: 2.4, h: 0.26 } };
const NEON = { pink: '#ff3ea5', cyan: '#2ee6ff', yellow: '#ffe14d', violet: '#a86bff', lime: '#9dff4a', warm: '#ffc46b' };
// the light sources that paint the bricks (baked into vertex colours) and that the world turns into point lights / glow cards
export const LIGHTS = [
  { id: 'sign', p: [0, 5.4, -4.4], c: NEON.pink, r: 3.6, k: 1.15 },
  { id: 'signC', p: [-1.6, 5.2, -4.2], c: NEON.cyan, r: 3.0, k: 0.7 },
  { id: 'bladeL', p: [-2.0, 3.9, -4.6], c: NEON.cyan, r: 2.3, k: 0.95 },
  { id: 'bladeR', p: [2.0, 3.6, -5.6], c: NEON.yellow, r: 2.1, k: 0.85 },
  { id: 'under', p: [0, 0.5, -1.5], c: NEON.pink, r: 2.6, k: 0.8 },
  { id: 'parL', p: [-1.9, 2.4, -2.2], c: NEON.cyan, r: 2.4, k: 0.65 },
  { id: 'parR', p: [1.9, 2.4, -2.2], c: NEON.pink, r: 2.4, k: 0.65 },
  { id: 'lampL', p: [-2.45, 3.3, -0.4], c: NEON.warm, r: 3.2, k: 0.75 },
  { id: 'lampR', p: [2.45, 3.2, -7.4], c: NEON.warm, r: 3.0, k: 0.7 },
  { id: 'win1', p: [-2.5, 6.6, -6.8], c: '#ff9a6a', r: 2.6, k: 0.55 },
  { id: 'win2', p: [2.5, 7.0, -3.4], c: '#9a8cff', r: 2.6, k: 0.5 },
];
const LC = LIGHTS.map((l) => { const c = new THREE.Color(l.c); return { p: l.p, c: [c.r, c.g, c.b], r: l.r, k: l.k }; });

// ---------------------------------------------------------------- brick wall grid with a baked neon wash (lit mesh + additive wash mesh share the grid)
function wallGrid(p0, p1, y0, y1, o) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, st = o.step || 0.55;
  const nu = Math.max(2, Math.round(len / st)), nv = Math.max(2, Math.round((y1 - y0) / st)), P = [], U = [], Cc = [], Wc = [], Nn = [], I = [], base = o.base, ao = col('#3a2c63');
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, x = p0[0] + dx * u, z = p0[1] + dz * u, y = y0 + (y1 - y0) * v;
    P.push(x, y, z); U.push((o.u0 + u * len) / 1.2, y / 1.12); Nn.push(nx, 0, nz);
    // ambient: the wall fades into the dark toward the roofs, darker in the corners and at the base (contact AO), a little noise for hand painted variety
    const n = fbm(x * 0.7 + z * 0.9, y * 0.8, 3), hf = 1 - Math.min(1, Math.max(0, (y - 1.2) / 9)) * 0.7, bf = 0.7 + 0.3 * Math.min(1, y / 1.2);
    const k = (0.46 + 0.42 * n) * hf * bf; const c = mix(mul(base, k), ao, 0.12 + 0.3 * (1 - hf)); Cc.push(c[0], c[1], c[2]);
    let r = 0, g = 0, b = 0;
    for (const L of LC) { const lx = L.p[0] - x, ly = L.p[1] - y, lz = L.p[2] - z, d2 = lx * lx + ly * ly + lz * lz, dl = Math.sqrt(d2) || 1, dt = Math.max(0, (lx * nx + lz * nz) / dl), f = L.k * (0.35 + 0.65 * dt) / (1 + d2 / (L.r * L.r)) * (d2 < 90 ? 1 : 0); r += L.c[0] * f; g += L.c[1] * f; b += L.c[2] * f; }
    Wc.push(r * 0.55, g * 0.55, b * 0.55);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = b + nu + 1, d = a + nu + 1; I.push(a, b, c, a, c, d); }
  const mk = (colors) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(I); return g; };
  return { lit: mk(Cc), wash: mk(Wc) };
}

function groundGrid() {
  const P = [], Cc = [], Wc = [], Nn = [], I = [], x0 = -AL.hw, x1 = AL.hw, z0 = AL.zB, z1 = AL.zF, st = 0.5, nu = Math.round((x1 - x0) / st), nv = Math.round((z1 - z0) / st);
  const asp = col('#2c2650'), walk = col('#453e68'), stg = col('#2a2248');
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const x = x0 + (x1 - x0) * i / nu, z = z0 + (z1 - z0) * j / nv, side = Math.abs(x) > 1.62; P.push(x, side ? 0.13 : 0, z); Nn.push(0, 1, 0);
    const n = fbm(x * 1.3, z * 1.1, 9), cr = fbm(x * 3.1 + 4, z * 2.7, 4), k = 0.7 + 0.5 * n - (cr > 0.62 ? 0.12 : 0), c = mul(mix(side ? walk : asp, stg, 0.15), k);
    const gut = Math.exp(-Math.pow((Math.abs(x) - 1.62) / 0.18, 2)); const cc = mul(c, 1 - 0.35 * gut); Cc.push(cc[0], cc[1], cc[2]);
    let r = 0, g = 0, b = 0; for (const L of LC) { const lx = L.p[0] - x, ly = L.p[1], lz = L.p[2] - z, d2 = lx * lx + ly * ly + lz * lz, f = L.k * (ly / Math.sqrt(d2)) * 0.9 / (1 + d2 / (L.r * L.r * 1.6)); r += L.c[0] * f; g += L.c[1] * f; b += L.c[2] * f; }
    Wc.push(r * 0.3, g * 0.3, b * 0.3); const lc = Cc.length - 3; Cc[lc] = Cc[lc] * 0.7 + r * 0.075; Cc[lc + 1] = Cc[lc + 1] * 0.7 + g * 0.075; Cc[lc + 2] = Cc[lc + 2] * 0.7 + b * 0.075;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = b + nu + 1, d = a + nu + 1; I.push(a, d, c, a, c, b); }
  const mk = (colors) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(I); return g; };
  return { lit: mk(Cc), wash: mk(Wc) };
}

// ---------------------------------------------------------------- small prop helpers writing into a Buf
function pallet(B, x, y, z, ry, c1, c2) {
  B.push(x, y, z, ry, 1);
  for (let i = -1; i <= 1; i++) B.box(i * 0.5, 0, 0, 0.1, 0.04, 0.8, c2, { base: 0.5, tint: 0.05 });          // feet boards along z
  for (let k = -1; k <= 1; k++) B.box(0, 0.04, k * 0.34, 1.2, 0.06, 0.09, c2, { base: 0.3, tint: 0.05 });      // stringers along x
  for (let i = -2; i <= 2; i++) B.box(i * 0.285, 0.1, 0, 0.12, 0.03, 0.8, c1, { base: 0.1, tint: 0.09 });      // top boards along z
  B.pop();
}
function speaker(B, G, x, z, ry, y0) {
  B.push(x, y0, z, ry, 1);
  B.box(0, 0, 0, 0.62, 1.0, 0.5, col('#2a2540'), { base: 0.4, tint: 0.03, taper: 0.97 });
  B.box(0, 0.0, 0.0, 0.66, 0.05, 0.54, col('#5a5478'), { base: 0 });
  B.box(0, 0.95, 0, 0.66, 0.05, 0.54, col('#5a5478'), { base: 0 });
  [[0.28, 0.2], [0.68, 0.14]].forEach(([y, r]) => { B.push(0, y, 0.255, 0, 1, Math.PI / 2, 0); B.lathe([[r, 0, col('#14111f')], [r * 0.9, 0.02, col('#3a3555')], [r * 0.45, 0.06, col('#26223c')], [0.02, 0.07, col('#5a5478')]], 10, 0, 0, 0); B.pop(); });
  B.pop(); void G;
}
function crate(B, x, y, z, ry, s, c, c2) { B.push(x, y, z, ry, 1); const w = 0.5 * s; B.box(0, 0, 0, w, 0.04, w, c2, { base: 0.5 }); for (const k of [-1, 1]) { B.box(k * (w / 2 - 0.02), 0.04, 0, 0.045, 0.42 * s, w, c, { base: 0.3, tint: 0.06 }); B.box(0, 0.04, k * (w / 2 - 0.02), w, 0.42 * s, 0.045, c, { base: 0.3, tint: 0.06 }); } B.box(0, 0.46 * s, 0, w, 0.04, w, c2, { base: 0.1 }); B.pop(); }
function dumpster(B, x, z, ry, c) { B.push(x, 0.13, z, ry, 1); B.box(0, 0.16, 0, 1.5, 0.95, 0.8, c, { base: 0.38, taper: 0.98, tint: 0.04 }); B.box(0, 1.1, 0, 1.58, 0.08, 0.88, mul(c, 1.25), { base: 0.1 }); B.box(0, 0.5, 0.41, 1.5, 0.05, 0.03, mul(c, 0.7), { base: 0 }); [-0.62, 0.62].forEach((k) => B.cyl(k, 0, 0.0, 0.08, 0.08, 0.16, 6, col('#1c1830'))); B.pop(); }
function bin(B, x, z, c) { B.cyl(x, 0.13, z, 0.28, 0.24, 0.62, 8, c, { base: 0.4 }); B.cyl(x, 0.75, z, 0.26, 0.27, 0.06, 8, mul(c, 1.3)); }
function pipe(B, x, y0, y1, z, r, c) { B.cyl(x, y0, z, r, r, y1 - y0, 6, c, { base: 0.15 }); for (let y = y0 + 0.6; y < y1; y += 1.6) B.cyl(x, y, z, r * 1.5, r * 1.5, 0.07, 6, mul(c, 0.7), { base: 0 }); }
function hpipe(B, x0, x1, y, z, r, c) { B.push((x0 + x1) / 2, y, z, 0, 1, 0, Math.PI / 2); B.cyl(0, -Math.abs(x1 - x0) / 2, 0, r, r, Math.abs(x1 - x0), 6, c, { base: 0.1 }); B.pop(); }
function acUnit(B, G, x, y, z, dir, c) { B.push(x, y, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 1); B.box(0, 0, 0, 0.9, 0.55, 0.4, c, { base: 0.3, tint: 0.05 }); B.cyl(0, 0.06, 0.2, 0.2, 0.2, 0.03, 10, col('#161226')); for (let i = 0; i < 4; i++) B.box(-0.3 + i * 0.2, 0.52, 0, 0.05, 0.03, 0.34, mul(c, 0.7), { base: 0 }); B.box(0, -0.2, 0, 0.8, 0.06, 0.34, col('#2e2848')); B.pop(); void G; }

// fire escape on a wall: platforms, railings, diagonal stairs. side = -1 left wall (x=-hw), +1 right wall
function fireEscape(B, side, z0, z1, ys) {
  const x0 = side * AL.hw, w = 0.85, c = col('#3d3a58'), cL = col('#6a6890'), xm = x0 - side * w / 2;
  ys.forEach((y, i) => {
    B.box(xm, y, (z0 + z1) / 2, w, 0.07, Math.abs(z1 - z0), c, { base: 0.1 }); B.box(xm - side * (w / 2 - 0.02), y + 0.07, (z0 + z1) / 2, 0.04, 0.05, Math.abs(z1 - z0), cL, { base: 0 });
    const rx = x0 - side * w; B.box(rx + side * 0.02, y + 0.07, (z0 + z1) / 2, 0.035, 0.035, Math.abs(z1 - z0), cL, { base: 0 }); B.box(rx + side * 0.02, y + 0.5, (z0 + z1) / 2, 0.035, 0.035, Math.abs(z1 - z0), cL, { base: 0 });
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 0.01; z += 0.45) B.box(rx + side * 0.02, y + 0.07, z, 0.035, 0.46, 0.035, cL, { base: 0 });
    for (const zz of [z0, z1]) { B.box(xm, y + 0.07, zz, w, 0.035, 0.035, cL, { base: 0 }); B.box(xm, y + 0.5, zz, w, 0.035, 0.035, cL, { base: 0 }); }
    if (i < ys.length - 1) { // stair flight to the next platform (diagonal along z)
      const y1 = ys[i + 1], n = 9, zs = i % 2 ? z1 : z0, ze = i % 2 ? z0 : z1;
      for (let k = 0; k < n; k++) { const t = k / n, zz = zs + (ze - zs) * t * 0.92, yy = y + (y1 - y) * t; B.box(xm, yy, zz, w * 0.8, 0.05, 0.26, c, { base: 0.1 }); }
      B.box(xm - side * (w * 0.4), y, (zs + ze) / 2, 0.04, 0.08, Math.abs(ze - zs), cL, { base: 0 });
    }
  });
}

// lit window: frame + glass (glow Buf) + sill; on = lit colour or null
function windowAt(B, G, side, z, y, w, h, on, curtain) {
  const x = side * (AL.hw - 0.02), fr = col('#2b2342');
  B.box(x - side * 0.04, y - h / 2 - 0.05, z, 0.12, 0.07, w + 0.24, mul(fr, 1.5), { base: 0 });
  B.box(x - side * 0.01, y - h / 2, z - w / 2 - 0.05, 0.08, h, 0.1, fr, { base: 0 }); B.box(x - side * 0.01, y - h / 2, z + w / 2 + 0.05, 0.08, h, 0.1, fr, { base: 0 }); B.box(x - side * 0.01, y + h / 2 - 0.04, z, 0.08, 0.1, w + 0.2, fr, { base: 0 });
  const gx = x - side * 0.03, c = on ? col(on) : col('#17122e'); const k = on ? 1.5 : 1;
  G.quad([gx, y - h / 2, z - w / 2], [gx, y - h / 2, z + w / 2], [gx, y + h / 2 - 0.03, z + w / 2], [gx, y + h / 2 - 0.03, z - w / 2], on ? [c[0] * k, c[1] * k, c[2] * k] : c);
  if (on) { const m = col(curtain || '#ff6a8a'); G.quad([gx - side * 0.005, y - h / 2, z - w / 2], [gx - side * 0.005, y - h / 2, z - w / 2 + w * 0.3], [gx - side * 0.005, y + h / 2 - 0.03, z - w / 2 + w * 0.22], [gx - side * 0.005, y + h / 2 - 0.03, z - w / 2], [m[0] * 0.8, m[1] * 0.8, m[2] * 0.8]); }
  if (on) B.box(gx - side * 0.01, y - h * 0.1, z, 0.05, 0.05, w, fr, { base: 0 }); // mullion
}

export function buildSet(ctx, T) {
  const R = rng(44), group = new THREE.Group(); group.name = 'title_set';
  const B = new Buf({ rng: rng(5) }), G = new Buf({ rng: rng(6) }), A = {};
  const matLit = flatMat(), glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  const brickMat = new THREE.MeshLambertMaterial({ map: T.brick, vertexColors: true, color: '#9a8cc0' });
  const washMat = (map) => new THREE.MeshBasicMaterial({ map: map || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const washes = [];
  const addWall = (p0, p1, y0, y1, base, u0, brick) => { const g = wallGrid(p0, p1, y0, y1, { base, u0, step: 0.6 }); const m = new THREE.Mesh(g.lit, brickMat); m.receiveShadow = true; m.castShadow = false; group.add(m); const w = new THREE.Mesh(g.wash, washMat(T.brickG)); w.renderOrder = 2; group.add(w); washes.push(w.material); void brick; };
  // side walls (left faces +x, right faces -x), end wall faces the camera and is lower; the skyline shows above it
  addWall([-AL.hw, AL.zF], [-AL.hw, AL.zB], 0, AL.wallH, col('#9a6078'), 0);
  addWall([AL.hw, AL.zB], [AL.hw, AL.zF], 0, AL.wallH, col('#8e5874'), 3);
  addWall([-AL.hw, AL.zB], [AL.hw, AL.zB], 0, AL.endH, col('#8a5a72'), 7);
  { const g = groundGrid(); const m = new THREE.Mesh(g.lit, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true })); group.add(m); A.ground = m; }
  // curb faces + cornice + end-wall roof edge
  const stone = col('#6c628a'), dark = col('#2a2340');
  for (const s of [-1, 1]) { B.box(s * 1.62, 0, (AL.zF + AL.zB) / 2, 0.06, 0.14, AL.zF - AL.zB, mul(stone, 1.15), { base: 0 }); B.box(s * (AL.hw - 0.05), 0, (AL.zF + AL.zB) / 2, 0.12, 0.2, AL.zF - AL.zB, dark, { base: 0 }); }
  B.box(0, AL.endH, AL.zB + 0.14, AL.hw * 2 + 0.2, 0.22, 0.4, col('#5a4a78'), { base: 0.1 });
  for (const s of [-1, 1]) B.box(s * AL.hw, 9.6, (AL.zF + AL.zB) / 2, 0.5, 0.35, AL.zF - AL.zB, col('#4a3c66'), { base: 0.1 });
  // ---- end wall: the mural panel (a textured plane, drawn separately), a roll-up shutter, a ladder, a water tank on the roof
  B.box(0, 0.0, AL.zB + 0.06, 5.0, 0.28, 0.1, dark, { base: 0 });
  // shutter door right + warm window left
  B.box(1.6, 0.13, AL.zB + 0.07, 1.1, 2.4, 0.07, col('#3c3a58'), { base: 0.3 }); for (let y = 0.2; y < 2.5; y += 0.14) B.box(1.6, 0.13 + y, AL.zB + 0.11, 1.06, 0.03, 0.02, col('#55527a'), { base: 0 });
  // roof: water tank on stilts, chimney, antenna
  B.cyl(1.4, AL.endH + 0.9, AL.zB + 0.7, 0.55, 0.55, 0.9, 8, col('#6a5a7a'), { base: 0.3 }); B.pyr(1.4, AL.endH + 1.8, AL.zB + 0.7, 1.1, 0.45, col('#4a3e66'));
  for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) B.box(1.4 + dx, AL.endH, AL.zB + 0.7 + dz, 0.08, 0.95, 0.08, dark, { base: 0 });
  B.box(-1.3, AL.endH, AL.zB + 0.6, 0.5, 1.2, 0.5, col('#7a5a66'), { base: 0.2 }); B.box(-1.3, AL.endH + 1.2, AL.zB + 0.6, 0.62, 0.1, 0.62, col('#4a3e66'), { base: 0 });
  B.box(0.2, AL.endH, AL.zB + 0.5, 0.05, 2.3, 0.05, dark, { base: 0 }); B.box(0.2, AL.endH + 1.6, AL.zB + 0.5, 0.8, 0.04, 0.04, dark, { base: 0 }); B.box(0.2, AL.endH + 1.2, AL.zB + 0.5, 0.55, 0.04, 0.04, dark, { base: 0 });
  // ---- windows on the two side walls (visible part of the canyon: z -3 .. -8.5), a mix of lit and dark
  const wins = [[-1, -4.2, 3.9, '#ffb36a', '#ff6a8a'], [-1, -6.3, 3.9, null], [-1, -8.0, 3.9, '#8fe8ff', '#6a8aff'], [-1, -4.2, 6.9, null], [-1, -6.3, 6.9, '#ff9a6a', '#ff4f8b'], [-1, -8.0, 6.9, '#ffd27a', '#ffa86a'], [-1, -2.4, 6.9, '#a8a0ff', '#6a60ff'], [-1, -5.2, 9.9, '#ffb36a'], [-1, -7.4, 9.9, null],
    [1, -3.2, 3.9, null], [1, -5.2, 3.9, '#ffd27a', '#ff9a6a'], [1, -8.0, 3.9, '#c8a0ff', '#8a60ff'], [1, -3.2, 6.9, '#ff9ad0', '#ff4f8b'], [1, -5.2, 6.9, null], [1, -7.2, 6.9, '#ffb36a', '#ff6a8a'], [1, -2.0, 6.9, null], [1, -4.2, 9.9, '#9af0ff', '#4aa0ff'], [1, -7.0, 9.9, '#ffd27a']];
  wins.forEach(([s, z, y, on, cu]) => windowAt(B, G, s, z, y, 0.85, 1.3, on, cu));
  // ---- fire escapes (right wall high up, left wall lower and shorter) + drain pipes + ac units + horizontal pipes
  fireEscape(B, 1, -8.1, -4.6, [3.0, 5.9, 8.8]); fireEscape(B, -1, -7.6, -5.0, [3.4, 6.3]);
  pipe(B, -AL.hw + 0.12, 0, 12, -1.1, 0.07, col('#4a4666')); pipe(B, AL.hw - 0.12, 0, 12, -2.0, 0.07, col('#4a4666')); pipe(B, -AL.hw + 0.12, 0, 11, -8.7, 0.1, col('#554f78')); pipe(B, AL.hw - 0.12, 0, 11, -8.7, 0.1, col('#554f78'));
  hpipe(B, -AL.hw + 0.12, AL.hw - 0.12, 2.6, AL.zB + 0.18, 0.06, col('#4a4666')); hpipe(B, -AL.hw + 0.12, AL.hw - 0.12, 3.1, AL.zB + 0.18, 0.04, col('#6a5a7a'));
  acUnit(B, G, -AL.hw + 0.22, 5.0, -2.6, 1, col('#8a8aa8')); acUnit(B, G, AL.hw - 0.22, 4.4, -1.2, -1, col('#7a7a9a')); acUnit(B, G, -AL.hw + 0.22, 8.2, -7.5, 1, col('#8a8aa8')); acUnit(B, G, AL.hw - 0.22, 7.6, -6.0, -1, col('#7a7a9a'));
  // ---- the stage: two layers of pallets, plywood front panel with painted lip, under-glow strip
  const S = AL.stage, c1 = col('#b07a44'), c2 = col('#8a5a34'), c3 = col('#c28a54');
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) { pallet(B, S.x + i * 1.2, 0, S.z + k * 0.8, 0, i % 2 ? c1 : c3, c2); pallet(B, S.x + i * 1.2 + (k % 2 ? 0.05 : -0.05), 0.13, S.z + k * 0.8, 0, (i + k) % 2 ? c3 : c1, c2); }
  B.box(S.x, 0.0, S.z + S.d / 2 + 0.03, S.w, 0.26, 0.05, col('#3a2f5c'), { base: 0.1 }); // dark skirt hides the gap, glow strip on top of it
  G.quad([S.x - S.w / 2, 0.02, S.z + S.d / 2 + 0.06], [S.x + S.w / 2, 0.02, S.z + S.d / 2 + 0.06], [S.x + S.w / 2, 0.1, S.z + S.d / 2 + 0.06], [S.x - S.w / 2, 0.1, S.z + S.d / 2 + 0.06], [1.5, 0.22, 1.0]);
  // speaker stacks, par can stands with coloured lenses, a mic stand
  const SX = 1.72, SZ = S.z - 0.35;
  speaker(B, G, S.x - SX, SZ, 0.4, S.h); speaker(B, G, S.x + SX, SZ, -0.4, S.h); speaker(B, G, S.x - SX, SZ, 0.4, S.h + 1.0); speaker(B, G, S.x + SX, SZ, -0.4, S.h + 1.0);
  // par cans clamped on top of the speaker stacks, aimed at the performers (lens = [x, y, z, colour, dirX, dirY, dirZ])
  const lens = [[S.x - SX, S.h + 2.12, SZ, '#2ee6ff', 1.0, -0.78, 0.3], [S.x + SX, S.h + 2.12, SZ, '#ff3ea5', -1.0, -0.78, 0.3]]; A.lens = lens;
  lens.forEach(([x, y, z, cc, dx, dy, dz], i) => {
    B.box(x, y - 0.02, z, 0.3, 0.06, 0.3, col('#2a2540'), { base: 0 });
    const d = new THREE.Vector3(dx, dy, dz).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d), e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    B.push(x, y + 0.12, z, e.y, 1, e.x, e.z); B.cyl(0, -0.02, 0, 0.14, 0.17, 0.34, 8, col('#2a2540')); B.pop();
    const c = col(cc); G.push(x, y + 0.12, z, e.y, 1, e.x, e.z); G.cyl(0, 0.32, 0, 0.15, 0.15, 0.03, 10, [c[0] * 2.4, c[1] * 2.4, c[2] * 2.4]); G.pop(); void i;
  });
  // crate for BeeAmGee + stacked crates and boxes
  const crateC = col('#c6593f'), crateD = col('#8a3a2f'); crate(B, S.x + 1.08, S.h, S.z + 0.15, -0.45, 1.1, crateC, crateD); A.crate = { x: S.x + 1.08, z: S.z + 0.15 };
  crate(B, 2.0, 0.13, -4.1, 0.3, 1.0, col('#4a8a6a'), col('#2f6a50')); crate(B, 2.0, 0.63, -4.1, 0.7, 1.0, col('#c6593f'), crateD); crate(B, 1.9, 0.13, -5.3, -0.2, 1.1, col('#4a6ac6'), col('#2f3f8a'));
  dumpster(B, -1.78, -4.9, 0.12, col('#2f7a6a')); dumpster(B, -1.82, -8.2, -0.05, col('#4a5aa8'));
  bin(B, -2.1, -2.9, col('#6a6a8a')); bin(B, -1.88, -2.6, col('#7a7a9a')); bin(B, 2.1, -3.0, col('#6a6a8a'));
  for (let i = 0; i < 6; i++) { const x = -1.2 + R() * 0.9, z = -5.9 + R() * 1.2; B.blob(x, 0.13 + 0.16, z, 0.25, 0.2, 0.22, col('#2a2540'), col('#4a4670'), { jit: 0.2 }); } // bin bags
  B.box(-1.7, 0.13, -6.2, 0.6, 0.35, 0.5, col('#b89a74'), { ry: 0.3, base: 0.3 }); B.box(-1.7, 0.48, -6.2, 0.5, 0.3, 0.42, col('#c8aa84'), { ry: -0.2, base: 0.2 });
  // bike leaning on the left wall (ring wheels as thin lathes)
  [[-2.0, -1.4], [-2.05, -0.7]].forEach(([x, z], i) => { B.push(x, 0.13, z, 0, 1, 0, 0); B.push(0, 0.32, 0, Math.PI / 2, 1, 0, 0); B.lathe([[0.3, -0.015, col('#2a2540')], [0.3, 0.015, col('#2a2540')], [0.26, 0.015, col('#3a3555')], [0.26, -0.015, col('#3a3555')]], 10, 0, 0, 0); B.pop(); B.pop(); void i; });
  B.box(-2.02, 0.45, -1.05, 0.04, 0.04, 0.8, col('#ff3ea5'), { base: 0 });
  // wall posters + graffiti tags are textured planes (decals), see below
  // lamps: cage lights on arms on each wall
  A.lamps = [{ x: -AL.hw + 0.3, y: 3.3, z: -0.4 }, { x: AL.hw - 0.3, y: 3.2, z: -7.4 }, { x: AL.hw - 0.3, y: 3.3, z: 3.2 }, { x: -AL.hw + 0.3, y: 3.4, z: -6.6 }];
  A.lamps.forEach((l) => { const s = l.x < 0 ? -1 : 1; B.box(l.x - s * 0.15, l.y + 0.05, l.z, 0.34, 0.05, 0.05, dark, { base: 0 }); B.cyl(l.x, l.y - 0.1, l.z, 0.09, 0.12, 0.2, 6, col('#3a3555')); G.quad([l.x - 0.07, l.y - 0.09, l.z - 0.07], [l.x + 0.07, l.y - 0.09, l.z - 0.07], [l.x + 0.07, l.y - 0.09, l.z + 0.07], [l.x - 0.07, l.y - 0.09, l.z + 0.07], [2.4, 1.7, 0.7]); });
  // ---- distant skyline behind the end wall (silhouettes with windows), two layers
  const SK = new Buf({ rng: rng(77) }), SW = new Buf({ rng: rng(78) });
  for (let L = 0; L < 2; L++) for (let i = 0; i < 12; i++) { const z = -21 - L * 12 - R() * 4, x = -34 + i * 6 + R() * 3, w = 3.5 + R() * 4, h = 9 + R() * 16 + L * 5, d = 4 + R() * 3, c = mix(col(L ? '#2c2756' : '#352d62'), col('#5a3a88'), R() * 0.25);
    SK.box(x, 0, z, w, h, d, c, { base: 0.1, tint: 0.04 });
    for (let wy = 2; wy < h - 1; wy += 1.5) for (let wx = -w / 2 + 0.6; wx < w / 2 - 0.4; wx += 1.1) if (R() < 0.3) { const cc = R() < 0.5 ? [1.5, 1.1, 0.6] : R() < 0.5 ? [1.4, 0.5, 1.0] : [0.6, 1.2, 1.5]; SW.quad([x + wx, wy, z + d / 2 + 0.02], [x + wx + 0.5, wy, z + d / 2 + 0.02], [x + wx + 0.5, wy + 0.7, z + d / 2 + 0.02], [x + wx, wy + 0.7, z + d / 2 + 0.02], cc); }
    if (R() < 0.4) SK.box(x + w * 0.2, h, z, 0.15, 3 + R() * 2, 0.15, col('#3a3060'), { base: 0 }); }
  const sky = new THREE.Mesh(SK.geometry(false), new THREE.MeshLambertMaterial({ vertexColors: true, fog: true })); sky.name = 'skyline'; sky.receiveShadow = false; group.add(sky);
  const skyW = new THREE.Mesh(SW.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, fog: true })); skyW.name = 'skyline_windows'; group.add(skyW);
  // ---- mount the geometry
  const main = new THREE.Mesh(B.geometry(false), matLit); main.castShadow = true; main.receiveShadow = true; main.name = 'title_main'; group.add(main);
  const glow = new THREE.Mesh(G.geometry(false), glowMat); glow.name = 'title_glow'; group.add(glow); A.glow = glow;
  // ---- textured decals: the mural, posters, blade signs, graffiti tags
  const decals = [];
  const plane = (tex, w, h, x, y, z, ry, o) => { o = o || {}; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: o.color || '#ffffff', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide, depthWrite: !!o.dw })); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; group.add(m); decals.push(m); return m; };
  // mural panel on the end wall (dimmer than neon so it stays a backdrop, the wash from the sign lights it)
  const mural = plane(T.mural, 5.0, 2.5, 0, 2.45, AL.zB + 0.12, 0, { color: '#8a82b8' }); mural.name = 'mural'; A.mural = mural;
  // posters on the walls
  [[-1, -1.9, 2.0, 0.9, 1.35, 0], [-1, -3.0, 2.15, 0.9, 1.35, 1], [1, -1.0, 2.0, 0.9, 1.35, 2], [1, -6.1, 1.9, 1.0, 1.5, 3], [-1, -7.9, 1.9, 0.9, 1.35, 1]].forEach(([s, z, y, w, h, k]) => {
    const t = T.posters[k % T.posters.length]; plane(t, w, h, s * (AL.hw - 0.03), y + h / 2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, { color: '#b8b0d8' }); });
  // blade signs (perpendicular to the wall, double sided)
  const blade = (tex, w, h, s, z, y) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: '#ffffff', side: THREE.DoubleSide })); m.rotation.y = Math.PI / 2; g.add(m); g.position.set(s * (AL.hw - 0.45), y, z); group.add(g); B.box(s * (AL.hw - 0.22), y + h / 2 - 0.25, z, 0.4, 0.04, 0.04, dark, { base: 0 }); return m; };
  A.bladeL = blade(T.bladeL, 0.55, 1.65, -1, -4.6, 3.9); A.bladeR = blade(T.bladeR, 0.55, 1.65, 1, -5.6, 3.6);
  main.geometry.dispose(); main.geometry = B.geometry(false); // rebuild after the late B.box calls
  A.group = group; A.washMats = washes; A.glowMat = glowMat; A.decals = decals; A.skyline = [sky, skyW];
  return A;
}
