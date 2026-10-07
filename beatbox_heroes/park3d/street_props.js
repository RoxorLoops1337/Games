// Neon Row props (W-STREET): ground (sidewalk, curb, road, markings), lamps, parked cars, the juice cart, the bus stop with its map board, street furniture,
// puddles with neon reflection streaks, and the small live things (steam vents, the cat on the wall) that street.js animates.
import { THREE, flatMat } from './kit.js';
import { Z0, SIDE_TOP as G, PAL, NEON, lampPost, mix, mul, col } from './street_kit.js';
import { Buf, bar } from './flat_kit.js';
import { MAPSPOT } from './street_row.js';

const cr = (c, k) => mul(col(c), k === undefined ? 1 : k);
export const VENTS = [{ x: -7.5, y: 0.2, z: -5.5 }, { x: 7.1, y: 0.2, z: -5.0 }, { x: 18.6, y: G, z: 6.0 }, { x: -9.2, y: G, z: 0.4 }];
export const LAMP_X = [-32, -24, -16, -8, 0, 8, 16, 24, 32];
// Sidewalk zones (z): frontage -3.0..-0.4 (door bays, bins, the juice cart, the map board), the CLEAR WALK LANE -0.4..2.2 (no colliders, ever),
// the kerb strip 2.2..3.0 (lamps, hydrants, mailbox, bus pole, bench), then the kerb and the road (not walkable). The zebra crossing is paint only.
export const LANE = { z0: -0.4, z1: 2.2 }, KERB_Z = 2.62, CROSSWALK = { x0: -13.6, x1: -7.4 };

// ---------------------------------------------------------------- ground
export function buildGround(S) {
  const B = S.B, R = S.R, X0 = -70, X1 = 70, SW0 = Z0, SW1 = 3.0, RD1 = 14.5;
  S.floor(B, -200, 200, -60, 60, -0.06, cr('#3a3050')); // far ground under everything (fades into the fog)
  S.floor(B, X0, X1, Z0 - 14, Z0, 0.01, cr('#2b2240')); // back lots behind the row
  // sidewalk: slab, paving tiles with joint lines, curb
  B.box(0, 0, (SW0 + SW1) / 2, X1 - X0, G - 0.002, SW1 - SW0, cr('#cbb09e'), { base: 0, tint: 0, top: cr('#cbb09e') });
  const tw = 1.5, nz = 5, dz = (SW1 - SW0) / nz;
  for (let i = 0; i < (X1 - X0) / tw; i++) for (let j = 0; j < nz; j++) {
    const c = PAL.paving[(i * 7 + j * 3 + ((R() * 3) | 0)) % 3]; const k = 0.9 + R() * 0.16, x = X0 + i * tw;
    S.floor(B, x + 0.03, x + tw - 0.03, SW0 + j * dz + 0.03, SW0 + (j + 1) * dz - 0.03, G + 0.004, [c[0] * k, c[1] * k, c[2] * k]);
  }
  B.box(0, 0, SW1 + 0.15, X1 - X0, G, 0.3, PAL.curb, { base: 0.1, top: mul(PAL.curb, 1.08) });
  // road: two-tone asphalt, gutter, centre dashes, crosswalk, manholes, drains
  S.floor(B, X0, X1, SW1 + 0.3, RD1, 0.0, PAL.asphalt); S.floor(B, X0, X1, SW1 + 0.3, SW1 + 1.1, 0.004, PAL.asphaltD);
  for (let i = 0; i < 22; i++) { const x = X0 + R() * (X1 - X0), z = 4.5 + R() * 8, w = 1.5 + R() * 3.5, d = 0.8 + R() * 1.6, k = 0.88 + R() * 0.1; S.floor(B, x, x + w, z, z + d, 0.006, [PAL.asphalt[0] * k, PAL.asphalt[1] * k, PAL.asphalt[2] * k]); }
  for (let x = X0 + 1; x < X1; x += 5) { if (x + 2.4 > CROSSWALK.x0 - 0.6 && x < CROSSWALK.x1 + 0.6) continue; S.floor(B, x, x + 2.4, 8.3, 8.5, 0.012, cr('#e8d2a0')); }
  for (let i = 0; i < 9; i++) S.floor(B, CROSSWALK.x0 + i * 0.7, CROSSWALK.x0 + i * 0.7 + 0.42, SW1 + 0.55, RD1 - 0.4, 0.012, cr('#efe3c8'));
  for (const sx of [CROSSWALK.x0 - 2.2, CROSSWALK.x1 + 1.6]) S.floor(B, sx, sx + 0.3, sx < CROSSWALK.x0 ? SW1 + 0.6 : 8.6, sx < CROSSWALK.x0 ? 8.1 : RD1 - 0.5, 0.012, cr('#efe3c8')); // stop lines before the zebra, one per lane
  for (const [mx, mz] of [[18.6, 6.0], [-30, 5.2], [38, 6.2]]) { for (let k = 0; k < 10; k++) { const a0 = k / 10 * 6.283, a1 = (k + 1) / 10 * 6.283; B.tri([mx, 0.015, mz], [mx + Math.cos(a1) * 0.55, 0.015, mz + Math.sin(a1) * 0.55], [mx + Math.cos(a0) * 0.55, 0.015, mz + Math.sin(a0) * 0.55], k % 2 ? cr('#2b2438') : cr('#3f3857')); } }
  for (const dx of [-26, -2, 22, 36]) { S.floor(B, dx, dx + 1.1, SW1 + 0.36, SW1 + 0.78, 0.008, cr('#1d1730')); for (let k = 0; k < 4; k++) S.floor(B, dx + 0.12 + k * 0.26, dx + 0.2 + k * 0.26, SW1 + 0.36, SW1 + 0.78, 0.012, cr('#4a4268')); }
  // far side: kerb and pavement
  B.box(0, 0, RD1 + 0.15, X1 - X0, G, 0.3, PAL.curb, { base: 0.1 }); B.box(0, 0, RD1 + 3.3, X1 - X0, G - 0.002, 6.2, cr('#b9a3b8'), { base: 0, tint: 0, top: cr('#b9a3b8') });
}

// ---------------------------------------------------------------- lamps (one every 8 m on the kerb) + wall lanterns
export function buildLamps(S) {
  for (const x of LAMP_X) lampPost(S, x, KERB_Z, { arm: 0.85 });
  S.dec('streetname', -16.0, G + 3.6, KERB_Z + 0.17, 0.7, 0.18, 0); S.dec('streetname', 16.0, G + 3.6, KERB_Z + 0.17, 0.7, 0.18, 0);
  for (const x of LAMP_X) S.halo(x, 0.2, 2.4, 3.4, 3.0, [0.34, 0.22, 0.09], { flat: true });
}

// ---------------------------------------------------------------- cars
const CARS = [[-26.5, 5.0, 0, '#2ec4b6'], [-18.5, 5.0, 0, '#e9a23b'], [2.8, 5.0, 0, '#d9534f'], [-0.9, 5.2, 0, '#6b7fd7'], [14.8, 5.0, 0, '#e870a0'], [24.5, 5.1, 0, '#e8d9c0'], [34, 5.0, 0, '#2ec4b6'], [-40, 5.0, 0, '#ffd23f']];
CARS.splice(3, 1); // keep the shop front clear
function car(S, x, z, ry, color) {
  const B = S.B, c = cr(color), lo = mix(c, PAL.ink, 0.35); B.push(x, 0, z, ry, 1);
  B.box(0, 0.28, 0, 4.2, 0.62, 1.85, c, { base: 0.35, tint: 0.02, top: mul(c, 1.1) }); B.box(0, 0.9, -0.02, 2.2, 0.62, 1.62, PAL.glassD, { taper: 0.82, base: 0.1, top: c }); // body and glass cabin
  B.box(-1.06, 0.9, 0, 0.1, 0.62, 1.66, lo, { base: 0 }); B.box(1.06, 0.9, 0, 0.1, 0.62, 1.66, lo, { base: 0 }); B.box(0, 0.28, 0.92, 4.22, 0.08, 0.04, lo, { base: 0 });
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.9, 0.9]) { B.push(sx, 0.34, sz, 0, 1, Math.PI / 2, 0); B.cyl(0, -0.12, 0, 0.34, 0.34, 0.24, 8, PAL.ink, { base: 0 }); B.pop(); B.box(sx, 0.2, sz + (sz > 0 ? 0.03 : -0.03), 0.34, 0.34, 0.04, cr('#9a9ab8'), { base: 0 }); }
  S.GLOW.box(-2.12, 0.55, -0.6, 0.06, 0.16, 0.3, [3.0, 0.4, 0.35], { base: 0 }); S.GLOW.box(-2.12, 0.55, 0.6, 0.06, 0.16, 0.3, [3.0, 0.4, 0.35], { base: 0 }); // tail lights
  S.GLOW.box(2.12, 0.55, -0.6, 0.06, 0.14, 0.28, [0.6, 0.55, 0.4], { base: 0 }); S.GLOW.box(2.12, 0.55, 0.6, 0.06, 0.14, 0.28, [0.6, 0.55, 0.4], { base: 0 });
  B.pop(); S.hit.box(x, z, 2.2, 1.0);
}
export function buildCars(S) { for (const [x, z, ry, c] of CARS) car(S, x, z, ry, c); }

// ---------------------------------------------------------------- juice cart
export function buildCart(S) {
  const B = S.B, x = -10.6, z = -2.05, wood = PAL.wood; // parked against the facade, out of the walk lane
  B.box(x, G + 0.3, z, 2.0, 0.85, 0.95, cr('#2ec4b6'), { base: 0.3, top: cr('#f6efde') }); B.box(x, G + 0.64, z + 0.49, 2.0, 0.14, 0.04, cr('#f6efde'), { base: 0 }); B.box(x, G + 1.15, z, 2.1, 0.08, 1.05, wood, { base: 0.1 });
  for (const sx of [-0.75, 0.75]) { B.push(x + sx, G + 0.32, z + 0.55, 0, 1, Math.PI / 2, 0); B.cyl(0, -0.05, 0, 0.32, 0.32, 0.1, 9, PAL.ink, { base: 0 }); B.pop(); B.box(x + sx, G + 0.0, z - 0.7, 0.08, 0.32, 0.08, PAL.iron, { base: 0 }); }
  const ux = x + 0.2, uz = z - 0.1, uy = G + 2.55, R0 = 1.32; B.cyl(ux, G + 1.2, uz, 0.03, 0.03, 1.85, 5, PAL.iron, { base: 0 }); // umbrella pole + striped panels
  for (let i = 0; i < 10; i++) { const a0 = i / 10 * 6.283, a1 = (i + 1) / 10 * 6.283, c = i % 2 ? cr('#ff8a3d') : cr('#f6efde'); B.tri([ux, uy + 0.5, uz], [ux + Math.cos(a1) * R0, uy, uz + Math.sin(a1) * R0], [ux + Math.cos(a0) * R0, uy, uz + Math.sin(a0) * R0], mul(c, 1.1), mul(c, 0.82), mul(c, 0.82)); }
  const jc = [cr('#ff8a3d'), cr('#8fd14f'), cr('#ff4f6b'), cr('#ffd23f')];
  for (let i = 0; i < 4; i++) { B.cyl(x - 0.7 + i * 0.5, G + 1.23, z - 0.1, 0.17, 0.17, 0.46, 7, jc[i], { base: 0.1 }); S.GLOW.box(x - 0.7 + i * 0.5, G + 1.5, z + 0.08, 0.1, 0.22, 0.02, mul(jc[i], 3.0), { base: 0 }); }
  for (let i = 0; i < 6; i++) B.blob(x + 0.6 + (i % 3) * 0.2, G + 1.33, z + 0.25 - Math.floor(i / 3) * 0.2, 0.1, 0.1, 0.1, jc[i % 4], mul(jc[i % 4], 1.2), { detail: 0, jit: 0.1 });
  S.dec('juice', x, G + 0.78, z + 0.5, 1.4, 0.52, 0); S.dec('fruit', x, G + 1.78, z + 0.52, 0.8, 0.4, 0);
  S.section('cart_lights', () => { for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; S.GLOW.box(ux + Math.cos(a) * R0 * 0.96, uy - 0.1, uz + Math.sin(a) * R0 * 0.96, 0.1, 0.1, 0.1, i % 2 ? NEON.orange : NEON.yellow, { base: 0 }); } S.halo(x, G + 2.2, z + 0.9, 4.0, 3.2, [0.6, 0.34, 0.1]); S.halo(x, 0.2, z + 1.4, 4.6, 3.0, [0.5, 0.3, 0.1], { flat: true }); });
  S.hit.box(x, z, 1.15, 0.6);
}

// ---------------------------------------------------------------- bus stop + the map board (spot id `map`)
export function buildBusStop(S) {
  const B = S.B, mx = MAPSPOT.x, mz = -1.05, py = G;
  for (const sx of [-1.3, 1.3]) B.box(mx + sx, py, mz, 0.12, 2.9, 0.12, PAL.iron, { base: 0.1 });
  B.box(mx, py + 0.5, mz, 2.9, 2.3, 0.14, cr('#1b1838'), { base: 0.1 }); B.box(mx, py + 2.85, mz + 0.0, 3.1, 0.2, 0.3, PAL.iron, { base: 0.05 }); B.box(mx, py + 0.4, mz + 0.05, 3.0, 0.1, 0.2, PAL.iron);
  S.sign('map', mx, py + 1.72, mz + 0.085, 2.62, 1.64, 0, [1.15, 1.15, 1.2]);
  S.section('map_lights', () => { S.GLOW.box(mx, py + 2.76, mz + 0.16, 2.6, 0.06, 0.1, NEON.cyan, { base: 0 }); S.halo(mx, py + 1.8, mz + 0.8, 4.2, 2.8, [0.1, 0.3, 0.38]); S.halo(mx, 0.2, mz + 1.2, 3.0, 2.0, [0.04, 0.16, 0.2], { flat: true }); });
  // pole sign + bench
  B.cyl(3.4, py, KERB_Z, 0.05, 0.05, 3.0, 6, PAL.iron, { base: 0 }); S.dec('bus', 3.4, py + 2.5, KERB_Z + 0.07, 0.5, 1.0, 0); S.dec('bus', 3.4, py + 2.5, KERB_Z - 0.07, 0.5, 1.0, Math.PI);
  const bz = KERB_Z; B.box(9.1, py + 0.36, bz, 1.7, 0.08, 0.5, PAL.wood, { base: 0.1 }); for (const sx of [-0.7, 0.7]) B.box(9.1 + sx, py, bz, 0.08, 0.38, 0.4, PAL.iron, { base: 0 }); B.box(9.1, py + 0.48, bz - 0.24, 1.7, 0.4, 0.06, PAL.wood, { base: 0.1 });
  S.hit.box(mx, mz, 1.5, 0.2); S.hit.circle(3.4, KERB_Z, 0.2); S.hit.box(9.1, bz, 0.9, 0.28);
}

// ---------------------------------------------------------------- street furniture
export function buildFurniture(S) {
  const B = S.B, R = S.R;
  // hydrant, mailbox, bins, planters, bollards, a bicycle
  const hy = (x, z) => { B.cyl(x, G, z, 0.17, 0.15, 0.62, 7, cr('#e0453f'), { base: 0.2 }); B.cyl(x, G + 0.62, z, 0.13, 0.04, 0.16, 7, cr('#c0332f')); B.box(x, G + 0.32, z, 0.5, 0.1, 0.1, cr('#e0453f'), { base: 0 }); S.hit.circle(x, z, 0.28); };
  hy(-19.2, KERB_Z); hy(21.4, KERB_Z);
  B.box(-4.6, G, KERB_Z, 0.55, 1.1, 0.5, cr('#2b5fb0'), { base: 0.2, top: cr('#2b5fb0') }); B.cyl(-4.6, G + 1.1, KERB_Z, 0.27, 0.27, 0.04, 8, cr('#2b5fb0')); S.hit.box(-4.6, KERB_Z, 0.3, 0.27);
  for (const [x, z] of [[-6.1, -2.6], [8.9, -2.9], [19.9, -2.7], [-21.6, -2.6]]) { B.cyl(x, G, z, 0.3, 0.26, 0.82, 8, cr('#5a5a72'), { base: 0.2 }); B.cyl(x, G + 0.82, z, 0.33, 0.33, 0.07, 8, cr('#7a7a92')); S.hit.circle(x, z, 0.34); }
  for (const x of [-31.6, -26.4]) { B.box(x, G, -2.4, 1.2, 0.7, 0.8, cr('#8d8397'), { base: 0.3 }); for (let i = 0; i < 4; i++) B.blob(x + (i - 1.5) * 0.3, G + 0.85, -2.4 + (i % 2) * 0.1, 0.34, 0.3, 0.3, PAL.leaf[2], PAL.leaf[i % 4], { detail: 0 }); S.hit.box(x, -2.4, 0.6, 0.4); }
  for (let i = 0; i < 4; i++) { const x = 1.6 + i * 1.0; if (Math.abs(x - 3.4) < 0.4) continue; B.cyl(x, G, 2.8, 0.08, 0.08, 0.7, 6, PAL.iron, { base: 0 }); S.hit.circle(x, 2.8, 0.1); }
  // bicycle against the lab wall: two wheels (thin tori as 8-sided rings), frame
  const bx = 9.9, bz = -2.95; for (const dx of [-0.45, 0.45]) { for (let k = 0; k < 10; k++) { const a0 = k / 10 * 6.283, a1 = (k + 1) / 10 * 6.283; B.quad([bx + dx + Math.cos(a0) * 0.33, G + 0.34 + Math.sin(a0) * 0.33, bz], [bx + dx + Math.cos(a1) * 0.33, G + 0.34 + Math.sin(a1) * 0.33, bz], [bx + dx + Math.cos(a1) * 0.29, G + 0.34 + Math.sin(a1) * 0.29, bz], [bx + dx + Math.cos(a0) * 0.29, G + 0.34 + Math.sin(a0) * 0.29, bz], PAL.ink); } }
  B.box(bx, G + 0.34, bz, 0.9, 0.04, 0.04, cr('#ff4f8b'), { base: 0 }); seg2(B, bx - 0.45, G + 0.34, bx - 0.1, G + 0.7, bz, cr('#ff4f8b')); seg2(B, bx + 0.45, G + 0.34, bx + 0.25, G + 0.72, bz, cr('#ff4f8b')); B.box(bx - 0.15, G + 0.7, bz, 0.22, 0.05, 0.08, PAL.ink); S.hit.box(bx, bz, 0.7, 0.2);
  // posters + stencil on the kerb side wall panels, tags on the alley walls
  S.dec('stencil', -1.5, 0.014, 6.4, 1.6, 0.8, 0, [1, 1, 1], -Math.PI / 2);
}
function seg2(B, x0, y0, x1, y1, z, c) { const L = Math.hypot(x1 - x0, y1 - y0), th = Math.atan2(y1 - y0, x1 - x0); B.push((x0 + x1) / 2, (y0 + y1) / 2, z, 0, 1, 0, th); B.box(0, -0.02, 0, L, 0.04, 0.04, c, { base: 0 }); B.pop(); }

// ---------------------------------------------------------------- puddles + neon reflection streaks (rain and night make them show)
export function buildPuddles(S) {
  const P = [ // x, z, rx, rz, streak colour, on road?
    [27.0, 0.6, 1.5, 0.7, [1.0, 0.18, 0.6]], [29.8, 1.9, 1.1, 0.5, [0.0, 0.7, 0.9]], [24.5, 1.6, 0.9, 0.45, [1.0, 0.18, 0.6]], [13.0, 0.9, 1.4, 0.65, [0.1, 0.8, 0.95]], [15.0, 2.0, 0.8, 0.4, [0.5, 0.25, 1.0]],
    [1.5, 1.5, 1.2, 0.55, [0.2, 0.9, 0.7]], [-1.8, 0.4, 0.8, 0.4, [1.0, 0.75, 0.2]], [-14.2, 0.8, 1.1, 0.5, [1.0, 0.6, 0.25]], [-20, 1.9, 0.9, 0.45, [1.0, 0.6, 0.25]], [-28.5, 0.5, 1.2, 0.6, [0.5, 1.0, 0.3]],
    [6.0, 3.4, 1.3, 0.5, [0.1, 0.8, 0.95]], [22.0, 4.2, 1.6, 0.7, [1.0, 0.18, 0.6]], [-5.0, 6.2, 1.5, 0.6, [1.0, 0.75, 0.2]], [10.5, 7.0, 1.8, 0.7, [0.5, 0.25, 1.0]], [32.0, 3.6, 1.2, 0.5, [0.1, 0.8, 0.95]],
  ];
  for (const [x, z, rx, rz, c] of P) { const road = z > 3.2, y = road ? 0.012 : G + 0.012; S.puddle(x, z, rx, rz, 0.8, 0, y); S.streak(x, z + 0.2, rx * 0.55, rz * 3.2, c, road ? 0.02 : G + 0.02); }
}

// ---------------------------------------------------------------- the cat on the wall (own meshes: the tail sways) -- returns { group, update }
export function buildCat(x, y, z, ry) {
  const body = new Buf({ rng: () => 0.5 }), tailB = new Buf({ rng: () => 0.5 }), eyes = new Buf({ rng: () => 0.5 });
  const fur = col('#1f1830'), furL = col('#3a2f52'), ear = col('#4a2f5a');
  body.blob(0, 0.27, 0, 0.17, 0.2, 0.3, fur, furL, { detail: 1, jit: 0.1 }); body.blob(0, 0.5, 0.2, 0.15, 0.14, 0.14, fur, furL, { detail: 1, jit: 0.1 });
  body.lathe([[0.05, 0, ear], [0.0, 0.14, ear]], 3, -0.09, 0.6, 0.2, {}); body.lathe([[0.05, 0, ear], [0.0, 0.14, ear]], 3, 0.09, 0.6, 0.2, {});
  body.box(-0.1, 0, 0.12, 0.08, 0.14, 0.16, fur, { base: 0 }); body.box(0.1, 0, 0.12, 0.08, 0.14, 0.16, fur, { base: 0 });
  eyes.quad([-0.075, 0.5, 0.345], [-0.03, 0.5, 0.345], [-0.03, 0.54, 0.345], [-0.075, 0.54, 0.345], [0.7, 3.0, 0.5]); eyes.quad([0.03, 0.5, 0.345], [0.075, 0.5, 0.345], [0.075, 0.54, 0.345], [0.03, 0.54, 0.345], [0.7, 3.0, 0.5]);
  tailB.box(0, 0, 0, 0.07, 0.07, 0.4, fur, { base: 0 }); tailB.push(0, 0.0, 0.38, 0, 1, -0.5, 0); tailB.box(0, 0, 0, 0.06, 0.06, 0.34, furL, { base: 0 }); tailB.pop();
  const group = new THREE.Group(); group.name = 'cat'; group.position.set(x, y, z); group.rotation.y = ry || 0;
  const m = flatMat(); const gm = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const bm = new THREE.Mesh(body.geometry(false), m), tm = new THREE.Mesh(tailB.geometry(false), m), em = new THREE.Mesh(eyes.geometry(false), gm);
  tm.position.set(0, 0.1, -0.27); tm.rotation.x = 0.7; bm.castShadow = true; tm.castShadow = true; group.add(bm, tm, em);
  return { group, update(t) { tm.rotation.y = Math.sin(t * 1.3) * 0.5; tm.rotation.x = 0.7 + Math.sin(t * 0.9) * 0.15; em.visible = (t % 6.5) > 0.18; } };
}

// ---------------------------------------------------------------- bunting: string lights from the lamps to the facades across the sidewalk
export function buildBunting(S) {
  const B = S.B, cols = [NEON.warm, NEON.pink, NEON.cyan, NEON.yellow, NEON.violet];
  for (const x of [-24, -8, 8, 24]) {
    const a = [x, G + 5.4, Z0 + 0.12], b = [x, G + 4.1, KERB_Z + 0.85]; let prev = a;
    for (let k = 1; k <= 12; k++) { const t = k / 12, p = [x, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.55, a[2] + (b[2] - a[2]) * t]; bar(B, prev, p, 0.025, 0.025, PAL.iron, { base: 0 }); if (k < 12) S.GLOW.box(p[0], p[1] - 0.07, p[2], 0.1, 0.1, 0.1, cols[(k + Math.abs(x | 0)) % 5], { base: 0 }); prev = p; }
    S.halo(x, G + 4.2, 0.2, 1.2, 3.4, [0.3, 0.22, 0.2], { flat: false });
  }
}

// ---------------------------------------------------------------- traffic: two cars pass along the road (own meshes, they move) -- returns { group, update(t, night) }
export function buildTraffic(haloTex) {
  const group = new THREE.Group(), cars = []; group.name = 'traffic';
  const carGeos = (color) => {
    const body = new Buf({ rng: () => 0.5 }), glow = new Buf({ rng: () => 0.5 }), c = cr(color);
    body.box(0, 0.28, 0, 4.2, 0.62, 1.85, c, { base: 0.35, top: mul(c, 1.1) }); body.box(-0.1, 0.9, 0, 2.2, 0.62, 1.62, PAL.glassD, { taper: 0.82, top: c });
    for (const sx of [-1.3, 1.3]) for (const sz of [-0.9, 0.9]) { body.push(sx, 0.34, sz, 0, 1, Math.PI / 2, 0); body.cyl(0, -0.12, 0, 0.34, 0.34, 0.24, 8, PAL.ink, { base: 0 }); body.pop(); }
    for (const sz of [-0.6, 0.6]) { glow.box(2.12, 0.55, sz, 0.06, 0.16, 0.3, [3.2, 3.0, 2.2], { base: 0 }); glow.box(-2.12, 0.55, sz, 0.06, 0.16, 0.3, [3.0, 0.4, 0.35], { base: 0 }); }
    return [body.geometry(false), glow.geometry(false)];
  };
  const mkOne = (lane, dir, speed, off, color) => {
    const [bg, gg] = carGeos(color), g = new THREE.Group(), m = new THREE.Mesh(bg, flatMat()); m.castShadow = true; const gm = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); g.add(m, gm);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.4), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, color: '#ffeab0' })); pool.rotation.x = -Math.PI / 2; pool.position.set(5.2, 0.05, 0); pool.renderOrder = 7;
    const uv = pool.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i)); g.add(pool);
    g.userData = { dir, speed, off, pool }; g.rotation.y = dir > 0 ? 0 : Math.PI; g.position.set(0, 0, lane); group.add(g); cars.push(g); return g;
  };
  mkOne(7.05, 1, 5.5, 0, '#e870a0'); mkOne(9.9, -1, 7.5, 40, '#2ec4b6');
  return { group, update(t, night) { for (const g of cars) { const u = g.userData, L = 140; g.position.x = ((t * u.speed * u.dir + u.off + 70) % L + L) % L - 70; u.pool.material.color.setScalar(0.12 + 0.55 * night); } } };
}

// ---------------------------------------------------------------- door mats, the bar's red carpet, litter and flyers on the pavement
export function buildMats(S) {
  const B = S.B, R = S.R, y = G + 0.012;
  const mat = (x, w, c, c2) => { S.floor(B, x - w / 2, x + w / 2, -3.2, -2.1, y, c); S.floor(B, x - w / 2 + 0.08, x + w / 2 - 0.08, -3.12, -2.18, y + 0.003, c2); };
  mat(-15, 1.7, cr('#6a3a2a'), cr('#8a5a3a')); mat(0, 1.7, cr('#1f7c78'), cr('#2ec4b6')); mat(13, 1.5, cr('#2a2a3a'), cr('#3a3a52')); mat(-29, 2.4, cr('#3f7a4a'), cr('#58b667'));
  S.floor(B, 26.1, 27.9, -3.4, 1.0, y, cr('#8a1830')); S.floor(B, 26.2, 26.28, -3.4, 1.0, y + 0.004, cr('#e8c04a')); S.floor(B, 27.72, 27.8, -3.4, 1.0, y + 0.004, cr('#e8c04a')); for (let z = -3.0; z < 1.0; z += 0.8) S.floor(B, 26.28, 27.72, z, z + 0.08, y + 0.004, cr('#a02240'));
  const paper = [cr('#f6efde'), cr('#ffd23f'), cr('#ff9ab8'), cr('#9ad0e8')];
  for (let i = 0; i < 26; i++) { const x = -32 + R() * 64, z = -2.6 + R() * 5.4, a = R() * 3.1, w = 0.14 + R() * 0.12, d = 0.18 + R() * 0.12, c = paper[(R() * 4) | 0]; if (S.hit.test(x, z)) continue; const ca = Math.cos(a), sa = Math.sin(a), p = (u, v) => [x + u * ca - v * sa, y + 0.002, z + u * sa + v * ca]; B.quad(p(-w, -d), p(w, -d), p(w, d), p(-w, d), c); }
  for (const [x, z] of [[-12.3, -2.0], [3.4, 1.9], [16.8, -1.2], [22.0, 1.4]]) { B.cyl(x, G, z, 0.04, 0.04, 0.2, 5, cr('#3a9a5a')); B.cyl(x, G + 0.2, z, 0.015, 0.02, 0.07, 5, cr('#3a9a5a')); }
}
