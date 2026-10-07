// Neon Row, the building row (W-STREET): common facade helpers, the five door modules in x order (park gate -29, home stoop -15, thrift shop 0, sound lab 13, bar 27),
// the alleys between them and the filler blocks at both ends. Every module writes into the shared stores from street_kit.js; the parts that change when a door is
// locked live in sections named open_<id> / closed_<id>.
import { Z0, SIDE_TOP as G, PAL, NEON, WINCOL, win, awningStripes, mix, mul, col } from './street_kit.js';

export const DOORS = {
  park: { x: -29, z: -1.7, label: 'PARK', icon: 'gate', color: '#9dff4a', color2: '#2ee6ff' },
  home: { x: -15, z: -1.7, label: 'HOME', icon: 'door', color: '#ff8a3d', color2: '#ffe14d' },
  shop: { x: 0, z: -1.7, label: 'SHOP', icon: 'racks', color: '#2ec4b6', color2: '#ffe14d' },
  studio: { x: 13, z: -1.7, label: 'STUDIO', icon: 'mixer', color: '#a86bff', color2: '#2ee6ff' },
  bar: { x: 27, z: -1.7, label: 'BAR', icon: 'counter', color: '#ff3ea5', color2: '#2ee6ff' },
};
export const MAPSPOT = { x: 6, z: 0.45 }; // in the walk lane, in front of the board (the board stands at the frontage edge)

const cr = (c, k) => mul(col(c), k === undefined ? 1 : k);
// oriented bar between two points in the x-y plane (facing +z), thickness t, depth d
export function seg(buf, x0, y0, x1, y1, z, t, d, color) {
  const L = Math.hypot(x1 - x0, y1 - y0), th = Math.atan2(y1 - y0, x1 - x0); buf.push((x0 + x1) / 2, (y0 + y1) / 2, z, 0, 1, 0, th); buf.box(0, -t / 2, 0, L, t, d, color, { base: 0, tint: 0.02 }); buf.pop();
}
// plain building block: body, roof, cornice, optional string courses and corner pilasters
export function block(S, x0, x1, top, depth, base, o) {
  o = o || {}; const w = x1 - x0, cx = (x0 + x1) / 2, B = S.B, roof = o.roof || mix(base, PAL.ink, 0.5), trim = o.trim || mix(PAL.cream, base, 0.25);
  B.box(cx, 0, Z0 - depth / 2, w, top, depth, base, { base: o.ao === undefined ? 0.4 : o.ao, tint: 0.035, top: roof });
  B.box(cx, top - 0.3, Z0 + 0.1, w + 0.34, 0.34, 0.62, trim, { base: 0.05 }); // cornice
  B.box(cx, top + 0.0, Z0 - 0.25, w + 0.1, 0.55, 0.28, mix(base, PAL.ink, 0.25), { base: 0.1 }); // parapet lip
  for (const y of o.courses || []) B.box(cx, y, Z0 + 0.04, w + 0.06, 0.15, 0.14, trim, { base: 0.1 });
  if (o.pilasters !== false) for (const px of [x0 + 0.22, x1 - 0.22]) B.box(px, 0, Z0 + 0.05, 0.44, top - 0.3, 0.16, mix(base, trim, 0.4), { base: 0.25 });
  if (o.plinth) B.box(cx, 0, Z0 + 0.04, w + 0.06, o.plinth, 0.12, o.plinthColor || PAL.stoneD, { base: 0.1 });
  return { cx, w };
}
// a grid of upper-floor windows. levels = y (centres), cols = x list. lit probability p
export function windowGrid(S, cols, levels, w, h, p, o) {
  o = o || {}; const R = S.R;
  for (const y of levels) for (const x of cols) {
    if (o.skip && o.skip(x, y)) continue;
    const lit = R() < p ? WINCOL[(R() * WINCOL.length) | 0] : null; win(S, x, y, w, h, lit, o);
  }
}
function roofClutter(S, x0, x1, top, seed, o) {
  o = o || {}; const R = S.R, B = S.B, n = o.n || 3;
  for (let i = 0; i < n; i++) {
    const x = x0 + 1.2 + R() * (x1 - x0 - 2.4), z = Z0 - 1.2 - R() * 5, k = R();
    if (k < 0.4) { B.box(x, top, z, 1.4 + R(), 0.9 + R() * 0.5, 1.2, PAL.steel, { base: 0.2 }); B.box(x, top + 0.9, z, 1.2, 0.08, 1.0, PAL.steelD, { base: 0 }); }
    else if (k < 0.7) { B.cyl(x, top, z, 0.28, 0.28, 1.4, 6, PAL.steelD, { base: 0.1 }); B.cyl(x, top + 1.4, z, 0.4, 0.05, 0.25, 6, PAL.steel); }
    else { B.box(x, top, z, 0.12, 3 + R() * 2, 0.12, PAL.iron, { base: 0 }); B.box(x, top + 2.4, z, 1.0, 0.06, 0.06, PAL.iron, { base: 0 }); S.GLOW.box(x, top + 3.0 + R() * 1.4, z, 0.14, 0.14, 0.14, NEON.red, { base: 0 }); }
  }
}
function waterTank(S, x, z, top) {
  const B = S.B; for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B.box(x + dx, top, z + dz, 0.14, 1.4, 0.14, PAL.woodD, { base: 0 });
  B.box(x, top + 1.4, z, 2.2, 0.14, 2.2, PAL.woodD, { base: 0 }); B.cyl(x, top + 1.54, z, 1.05, 1.05, 2.0, 9, mix(PAL.wood, PAL.woodD, 0.3), { base: 0.2 }); B.cyl(x, top + 3.54, z, 1.15, 0.0, 0.8, 9, PAL.woodD);
}
function bars(S, cx, cy, w, h, z, n, color) { for (let i = 0; i < n; i++) { const x = cx - w / 2 + (i + 0.5) * w / n; S.wall(S.B, x, cy, z, 0.035, h, color); } S.wall(S.B, cx, cy + h * 0.2, z, w, 0.04, color); }

// ===================================================================================== PARK GATE (-35.5 .. -22.5, gate -29)
const s0 = (i) => 0.9 + (i % 4) * 0.12;
export function buildPark(S) {
  const B = S.B, R = S.R, cx = -29, brick = PAL.brick[1], cap = mix(PAL.stone, PAL.cream, 0.4), zc = Z0 - 0.4;
  // wall (stops for the pillars) + fence. The wall runs on west past the end of the street so the corridor has no hole
  B.box(-41.5, 0, zc, 21, 1.5, 0.7, brick, { base: 0.3, tint: 0.05, top: cap }); B.box(-26.1, 0, zc, 7.2, 1.5, 0.7, brick, { base: 0.3, tint: 0.05, top: cap });
  for (const [a, b] of [[-45, -31.0], [-27.0, -22.6]]) { // iron fence on the walls
    B.box((a + b) / 2, 1.5, zc, b - a, 0.08, 0.08, PAL.iron, { base: 0 }); B.box((a + b) / 2, 2.45, zc, b - a, 0.07, 0.07, PAL.iron, { base: 0 });
    for (let x = a + 0.15; x < b; x += 0.34) { S.wall(B, x, 2.0, zc + 0.04, 0.05, 0.95, PAL.iron); B.box(x, 2.48, zc, 0.08, 0.16, 0.08, mul(PAL.iron, 1.5), { base: 0 }); }
  }
  for (const px of [-30.6, -27.4]) { // stone pillars with caps and lanterns
    B.box(px, 0, zc, 0.95, 3.3, 0.95, PAL.stone, { base: 0.35, tint: 0.03 }); B.box(px, 3.3, zc, 1.15, 0.22, 1.15, cap, { base: 0 }); B.pyr(px, 3.52, zc, 1.1, 0.4, PAL.stoneD);
    B.box(px, 3.9, zc, 0.5, 0.06, 0.5, PAL.iron, { base: 0 }); for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) B.box(px + dx, 3.96, zc + dz, 0.05, 0.5, 0.05, PAL.iron, { base: 0 }); B.pyr(px, 4.46, zc, 0.55, 0.28, PAL.iron);
  }
  // iron arch over the opening (half ring of bars)
  const ar = 1.2, acy = 3.1; let pa = null;
  for (let k = 0; k <= 12; k++) { const a = Math.PI - (k / 12) * Math.PI, p = [cx + Math.cos(a) * ar, acy + Math.sin(a) * ar]; if (pa) seg(B, pa[0], pa[1], p[0], p[1], zc, 0.11, 0.11, PAL.iron); pa = p; }
  for (let k = 1; k < 12; k += 2) { const a = Math.PI - (k / 12) * Math.PI; S.wall(B, cx + Math.cos(a) * ar * 0.82, acy + Math.sin(a) * ar * 0.82 * 0.5, zc, 0.04, 0.5, PAL.iron); }
  B.box(cx, acy + ar + 0.02, zc, 0.5, 0.5, 0.1, mul(PAL.iron, 1.4), { base: 0 }); // crest
  // brick pad before the gate + the lawn and trees beyond it
  S.floor(S.B, -46, -22.5, Z0 - 20, Z0 - 0.7, 0.02, cr('#3f7a4a', 0.85));
  for (let i = 0; i < 18; i++) { const x = -45 + R() * 22, z = Z0 - 1.5 - R() * 17; S.B.blob(x, 0.1, z, 0.9 + R() * 0.8, 0.22, 0.9 + R() * 0.8, cr('#2f7d4e'), cr('#7ac96c'), { detail: 0 }); }
  S.floor(B, cx - 1.1, cx + 1.1, Z0 - 17, Z0 - 0.7, 0.04, cr('#e6c8a2')); // path through the gate
  for (let z = Z0 - 1.5; z > Z0 - 17; z -= 1.8) S.floor(B, cx - 1.1, cx + 1.1, z - 0.08, z + 0.04, 0.05, cr('#caa77a'));
  const trees = [[-33.5, -7.5], [-25.4, -7], [-31.5, -11], [-26.5, -12], [-36, -10], [-39, -7], [-42, -11], [-34, -15], [-29, -16], [-24, -15], [-38, -16], [-44, -8]];
  trees.forEach(([x, z], i) => {
    const s = 0.9 + (i % 4) * 0.12; B.cyl(x, 0, z, 0.2 * s, 0.14 * s, 2.6 * s, 6, PAL.woodD, { base: 0.3 });
    S.GLOW.blob(x, 3.7 * s, z, 1.9 * s, 1.4 * s, 1.9 * s, [0.02, 0.18, 0.12], [0.1 + (i % 3) * 0.03, 0.5, 0.2], { detail: 1, jit: 0.5 }); // canopies are lit from inside: they glow beyond the gate
    S.GLOW.blob(x + 0.9 * s, 4.9 * s, z - 0.4, 1.2 * s, 1.0 * s, 1.2 * s, [0.05, 0.26, 0.14], [0.36, 0.6, 0.16], { detail: 1, jit: 0.5 });
  });
  S.section('park_glow', () => { // fairy lights and lit leaf patches: the trees glow beyond the gate
    trees.forEach(([x, z], i) => { for (let k = 0; k < 7; k++) { const a = (k + i) * 2.4, r = 0.9 + (k % 3) * 0.5, s = 0.9 + (i % 4) * 0.12; S.GLOW.box(x + Math.cos(a) * r * s, (3.4 + (k % 4) * 0.45) * s, z + Math.sin(a) * r * s, 0.1, 0.1, 0.1, [NEON.warm, NEON.yellow, NEON.green, NEON.warm][k % 4], { base: 0 }); }
      S.halo(x, 4.2 * s0(i), z + 1.2, 4.6, 3.6, [0.3, 0.5, 0.18]); });
  });
  S.section('open_park', () => {
    for (const px of [-30.6, -27.4]) { S.GLOW.box(px, 3.98, zc, 0.34, 0.4, 0.34, NEON.warm, { base: 0 }); S.halo(px, 4.2, zc + 0.5, 2.4, 2.4, [0.9, 0.55, 0.2]); }
    for (const sgn of [-1, 1]) { // gate leaves swung open inwards
      const hx = cx + sgn * 1.12; B.push(hx, 0, zc, -sgn * 1.2, 1); B.box(-sgn * 0.55, 0.3, 0, 1.1, 0.07, 0.07, PAL.iron, { base: 0 }); B.box(-sgn * 0.55, 2.25, 0, 1.1, 0.07, 0.07, PAL.iron, { base: 0 });
      for (let i = 0; i < 6; i++) B.box(-sgn * (0.08 + i * 0.2), 0.3, 0, 0.045, 1.95, 0.045, PAL.iron, { base: 0 }); B.pop();
    }
    S.sign('park', cx, 4.95, zc + 0.12, 3.0, 0.75, 0, [1, 1, 1]); B.box(cx - 1.4, 3.95, zc + 0.02, 0.06, 0.55, 0.06, PAL.iron, { base: 0 }); B.box(cx + 1.4, 3.95, zc + 0.02, 0.06, 0.55, 0.06, PAL.iron, { base: 0 });
    S.halo(cx, 2.6, zc - 2.5, 7, 5.5, [0.28, 0.42, 0.14]); S.halo(cx, 3.8, zc - 0.2, 5.5, 3.2, [0.5, 0.42, 0.18]);
    S.halo(cx, 0.1, Z0 + 1.8, 5.0, 4.4, [0.36, 0.5, 0.18], { flat: true });
  });
  // string lights over the path inside the park
  S.section('park_lights', () => { for (let k = 0; k < 14; k++) { const t = k / 13, x = cx - 2.2 + t * 4.4, y = 4.3 - Math.sin(t * Math.PI) * 0.5; S.GLOW.box(x, y, Z0 - 2.4, 0.11, 0.11, 0.11, [NEON.warm, NEON.pink, NEON.cyan, NEON.yellow][k % 4], { base: 0 }); } for (let q = 0; q < 3; q++) { const z = Z0 - 4 - q * 3.6; B.cyl(cx - 1.5, 0, z, 0.07, 0.05, 3.2, 6, PAL.iron, { base: 0 }); S.GLOW.box(cx - 1.5, 3.2, z, 0.3, 0.3, 0.3, NEON.warm, { base: 0 }); S.halo(cx - 1.5, 3.4, z + 0.3, 3.2, 3.2, [0.8, 0.5, 0.2]); } });
  S.section('closed_park', () => {
    for (const sgn of [-1, 1]) { const hx = cx + sgn * 1.12; B.box(hx - sgn * 0.55, 0.3, zc, 1.1, 0.07, 0.07, PAL.iron, { base: 0 }); B.box(hx - sgn * 0.55, 2.25, zc, 1.1, 0.07, 0.07, PAL.iron, { base: 0 }); for (let i = 0; i < 6; i++) B.box(hx - sgn * (0.08 + i * 0.2), 0.3, zc, 0.045, 1.95, 0.045, PAL.iron, { base: 0 }); }
    B.box(cx, 1.15, zc + 0.06, 0.9, 0.06, 0.06, PAL.steel, { base: 0 }); S.dec('lock', cx, 1.15, zc + 0.12, 0.5, 0.5, 0); S.sign('closed', cx, 2.9, zc + 0.14, 1.4, 0.7, 0);
  });
  S.hit.box(-28.9, Z0 - 0.4, 6.9, 0.4); S.hit.box(-36, Z0 - 0.4, 10, 0.4);
  // cat's wall segment gets graffiti and a flyer
  S.dec('g4', -33.4, 0.75, Z0 + 0.01, 1.7, 1.28, 0); S.dec('poster4', -24.4, 0.95, Z0 + 0.01, 0.55, 0.83, 0);
}

// ===================================================================================== HOME STOOP (-22.5 .. -8.5, door -15)
export function buildHome(S) {
  const B = S.B, R = S.R, x0 = -22.5, x1 = -8.5, top = 13.2, dx = -15, brick = cr('#a24a40');
  block(S, x0, x1, top, 9, brick, { courses: [4.45, 7.45, 10.45], plinth: 0.95, roof: cr('#4b3547') });
  for (const cx of [-13.2, -16.8]) B.box(cx, G, Z0 + 0.06, 0.2, 2.9, 0.16, PAL.stone, { base: 0.1 }); // door surround pilasters
  B.box(dx, G + 2.9, Z0 + 0.4, 3.0, 0.14, 0.9, PAL.stone, { base: 0.05, top: mix(PAL.stone, PAL.cream, 0.3) }); for (const sg of [-1, 1]) seg(B, dx + sg * 1.35, G + 2.7, dx + sg * 1.35, G + 2.9, Z0 + 0.8, 0.05, 0.05, PAL.iron); // door canopy and brackets
  B.box(dx, G + 0.5, Z0 + 0.0, 1.5, 2.1, 0.22, cr('#241a33'), { base: 0 }); // door recess
  for (let i = 0; i < 3; i++) { const dep = 1.3 - i * 0.4; B.box(dx, 0, Z0 + dep / 2, 2.6 - i * 0.3, G + 0.17 * (i + 1), dep, mix(PAL.stone, PAL.stoneD, 0.15 + i * 0.12), { base: 0.3 }); }
  B.box(dx, G + 0.52, Z0 + 0.15, 1.3, 2.05, 0.1, cr('#2a8c7a'), { base: 0.1 }); // door leaf
  for (const py of [G + 0.75, G + 1.75]) { S.wall(B, dx - 0.32, py + 0.38, Z0 + 0.21, 0.5, 0.7, cr('#1f6a5e')); S.wall(B, dx + 0.32, py + 0.38, Z0 + 0.21, 0.5, 0.7, cr('#1f6a5e')); }
  for (const sg of [-1, 1]) { // stoop rails
    seg(B, dx + sg * 1.35, G + 0.5, dx + sg * 1.35, G + 1.5, Z0 + 0.7, 0.06, 0.06, PAL.iron); B.box(dx + sg * 1.35, G, Z0 + 1.1, 0.06, 0.9, 0.06, PAL.iron, { base: 0 }); B.box(dx + sg * 1.35, G + 0.9, Z0 + 0.9, 0.05, 0.05, 0.85, PAL.iron, { base: 0 }); B.box(dx + sg * 1.35, G + 0.9, Z0 + 0.45, 0.06, 0.06, 0.06, PAL.iron, { base: 0 });
  }
  S.dec('buzzer', dx + 1.8, G + 1.45, Z0 + 0.04, 0.46, 0.92, 0); S.dec('rent', dx - 0.3, G + 2.0, Z0 + 0.27, 0.36, 0.45, 0, [1, 1, 1]); S.dec('hours', dx + 2.9, G + 1.2, Z0 + 0.03, 0.4, 0.25, 0);
  B.box(dx + 2.9, G + 0.3, Z0 + 0.4, 0.4, 0.3, 0.3, mix(PAL.plum, PAL.ink, 0.4), { base: 0.1 }); // mailbox-ish crate
  // ground floor windows with bars, a hanging plant box and an AC unit
  for (const wx of [-19.8, -10.4]) { win(S, wx, G + 1.95, 1.4, 1.5, null, { sill: true }); bars(S, wx, G + 1.95, 1.4, 1.5, Z0 + 0.1, 5, PAL.iron); }
  S.section('open_home', () => {
    for (const wx of [-19.8, -10.4]) { S.wall(S.GLOW, wx, G + 1.95, Z0 + 0.06, 1.36, 1.46, WINCOL[0], mul(WINCOL[1], 0.7)); S.halo(wx, G + 1.95, Z0 + 0.6, 3.6, 3.2, [0.45, 0.28, 0.1]); }
    S.GLOW.box(dx, G + 2.62, Z0 + 0.1, 1.1, 0.34, 0.06, WINCOL[2], { base: 0 }); S.GLOW.box(dx + 1.0, G + 2.1, Z0 + 0.25, 0.24, 0.34, 0.24, NEON.warm, { base: 0 }); S.halo(dx + 1.0, G + 2.3, Z0 + 0.7, 2.6, 2.6, [0.8, 0.55, 0.22]); S.halo(dx, 0.2, Z0 + 2.2, 4.2, 3.4, [0.45, 0.3, 0.12], { flat: true });
    S.GLOW.box(dx + 0.58, G + 1.25, Z0 + 0.22, 0.07, 0.07, 0.05, NEON.yellow, { base: 0 });
  });
  S.section('closed_home', () => { S.wall(B, dx, G + 2.62, Z0 + 0.1, 1.1, 0.34, PAL.glassD); for (const wx of [-19.8, -10.4]) S.wall(B, wx, G + 1.95, Z0 + 0.07, 1.36, 1.46, PAL.glassD, PAL.glassL); S.dec('lock', dx, G + 1.4, Z0 + 0.26, 0.5, 0.5, 0); });
  // upper floors
  const levels = [6.0, 9.0, 11.9], cols = [-20.7, -18.3, -15.0, -12.4, -10.1];
  windowGrid(S, cols, levels, 1.15, 1.7, 0.62, { skip: (x, y) => false });
  for (const [x, y] of [[-18.3, 6.0], [-10.1, 9.0]]) { // flower boxes
    B.box(x, y - 1.05, Z0 + 0.3, 1.3, 0.28, 0.32, mix(PAL.wood, PAL.woodD, 0.3), { base: 0.1 }); for (let k = -2; k <= 2; k++) B.blob(x + k * 0.24, y - 0.74, Z0 + 0.3, 0.17, 0.15, 0.17, PAL.leaf[2], [PAL.pinkC, PAL.yellowC, cr('#fff0e0')][(k + 2) % 3], { detail: 0 });
  }
  // fire escape over the right two columns
  const fx0 = -13.4, fx1 = -9.0, fz = Z0 + 1.0;
  for (let i = 0; i < 3; i++) {
    const y = 4.55 + i * 3.0; B.box((fx0 + fx1) / 2, y, Z0 + 0.55, fx1 - fx0, 0.09, 1.1, PAL.iron, { base: 0.1 });
    B.box((fx0 + fx1) / 2, y + 0.95, fz, fx1 - fx0, 0.05, 0.05, PAL.iron, { base: 0 }); for (let x = fx0 + 0.1; x < fx1; x += 0.55) B.box(x, y + 0.09, fz, 0.035, 0.86, 0.035, PAL.iron, { base: 0 });
    for (const sx of [fx0, fx1]) B.box(sx, y + 0.09, Z0 + 0.55, 0.035, 0.86, 1.1, PAL.iron, { base: 0, tint: 0 });
    if (i < 2) { const sxa = fx0 + 0.3, sxb = fx0 + 1.9; seg(B, sxa, y + 0.1, sxb, y + 3.0, Z0 + 0.35, 0.08, 0.08, PAL.iron); seg(B, sxa + 0.35, y + 0.1, sxb + 0.35, y + 3.0, Z0 + 0.35, 0.08, 0.08, PAL.iron); for (let s = 0; s < 6; s++) { const t = s / 6; B.box(sxa + 0.18 + (sxb - sxa) * t, y + 0.1 + 2.9 * t, Z0 + 0.35, 0.5, 0.04, 0.08, PAL.iron, { base: 0 }); } }
  }
  seg(B, fx0 + 0.3, 1.0, fx0 + 1.5, 4.5, Z0 + 0.35, 0.07, 0.07, PAL.iron); // drop ladder
  // laundry line + ivy + rooftop
  S.wall(B, -20.2, 8.1, Z0 + 0.4, 0.5, 0.5, cr('#ff4f8b')); S.wall(B, -19.5, 8.15, Z0 + 0.4, 0.4, 0.55, cr('#fff0e0')); S.wall(B, -18.9, 8.1, Z0 + 0.4, 0.45, 0.45, cr('#2ec4b6')); B.box(-19.6, 8.4, Z0 + 0.4, 2.0, 0.025, 0.025, PAL.iron, { base: 0 });
  for (let i = 0; i < 8; i++) B.blob(x0 + 0.3 + R() * 0.4, 0.8 + i * 0.75 + R() * 0.3, Z0 + 0.12, 0.35, 0.4, 0.2, PAL.leaf[2], PAL.leaf[3], { detail: 0 });
  waterTank(S, -11.6, Z0 - 4.5, top); roofClutter(S, x0, x1, top, 3, { n: 3 });
  S.hit.box(dx, Z0 + 0.7, 1.45, 0.65);
  S.dec('poster1', -8.6 + 0.01, 1.4, Z0 - 2.2, 1.0, 1.5, Math.PI / 2); S.dec('g1', -8.59, 2.6, Z0 - 6.2, 2.6, 1.95, Math.PI / 2);
}

// ===================================================================================== THRIFT SHOP (-6.5 .. 6.5, door 0)
function mannequin(S, x, z, c1, c2) {
  const B = S.B; B.cyl(x, G + 0.8, z, 0.2, 0.17, 0.05, 8, PAL.iron); B.cyl(x, G + 0.85, z, 0.03, 0.03, 0.55, 5, PAL.iron); B.cyl(x, G + 1.4, z, 0.2, 0.13, 0.6, 7, c1, { base: 0.1 }); B.cyl(x, G + 1.15, z, 0.16, 0.2, 0.26, 7, c2, { base: 0.1 }); B.blob(x, G + 2.13, z, 0.1, 0.12, 0.1, cr('#d9c2b0'), cr('#f1dccb'), { detail: 0, jit: 0.2 });
}
export function buildShop(S) {
  const B = S.B, R = S.R, x0 = -6.5, x1 = 6.5, top = 8.4, base = cr('#4a929a');
  block(S, x0, x1, top, 8.5, base, { courses: [4.2], plinth: 0.9, plinthColor: cr('#274a56'), roof: cr('#5a4a5a') });
  // storefront: two display windows and a glass door
  for (const wx of [-3.1, 3.1]) {
    B.box(wx, G + 0.0, Z0 + 0.03, 4.1, 0.95, 0.2, cr('#7a4a32'), { base: 0.2 }); B.box(wx, G + 0.95, Z0 + 0.04, 4.2, 0.1, 0.2, cr('#f2e2c4')); B.box(wx, G + 2.95, Z0 + 0.04, 4.2, 0.12, 0.2, cr('#7a4a32'));
    S.wall(B, wx, G + 2.0, Z0 + 0.06, 3.9, 1.9, PAL.glassD, PAL.glassL);
  }
  B.box(0, G, Z0 + 0.0, 1.9, 3.0, 0.2, cr('#7a4a32'), { base: 0.1 }); S.wall(B, 0, G + 1.45, Z0 + 0.14, 1.5, 2.6, PAL.glassD, PAL.glassL); B.box(0, G + 1.0, Z0 + 0.16, 1.5, 0.05, 0.05, PAL.steel, { base: 0 }); B.box(0.6, G + 1.0, Z0 + 0.18, 0.05, 0.6, 0.06, PAL.steel, { base: 0 });
  // window dressing: mannequins, shelf, hanging garments
  const cc = [cr('#ff4f8b'), cr('#2ec4b6'), cr('#ffd23f'), cr('#a86bff'), cr('#ff8a3d'), cr('#4fa3ff')];
  mannequin(S, -3.9, Z0 + 0.55, cc[0], cc[5]); mannequin(S, -2.5, Z0 + 0.6, cc[1], cc[4]); mannequin(S, 2.4, Z0 + 0.55, cc[2], cc[3]); mannequin(S, 3.9, Z0 + 0.6, cc[3], cc[0]);
  B.box(-3.1, G + 1.0, Z0 + 0.35, 3.6, 0.05, 0.3, PAL.woodD, { base: 0 }); B.box(3.1, G + 1.0, Z0 + 0.35, 3.6, 0.05, 0.3, PAL.woodD, { base: 0 });
  for (let i = 0; i < 7; i++) S.wall(B, 0.75 + i * 0.1 + (i > 3 ? 0.9 : 0), G + 2.3, Z0 + 0.3, 0.26, 0.7, cc[i % 6]);
  S.section('open_shop', () => {
    for (const wx of [-3.1, 3.1]) { S.wall(S.GLOW, wx, G + 2.0, Z0 + 0.05, 3.86, 1.86, [2.6, 1.6, 0.8], [3.0, 2.1, 1.0]); S.halo(wx, G + 1.8, Z0 + 0.8, 7.0, 4.2, [0.5, 0.32, 0.12]); }
    S.wall(S.GLOW, 0, G + 1.45, Z0 + 0.13, 1.46, 2.56, [2.4, 1.5, 0.75], [2.8, 1.9, 0.9]);
    S.sign('open', -1.45, G + 2.55, Z0 + 0.12, 0.85, 0.42, 0); S.halo(-1.45, G + 2.55, Z0 + 0.5, 2.0, 1.5, [0.4, 1.0, 0.35]); S.halo(0, 0.2, Z0 + 2.4, 8, 3.6, [0.55, 0.38, 0.14], { flat: true });
    S.sign('thrift', 0, G + 4.75, Z0 + 0.18, 4.6, 1.15, 0); S.halo(0, G + 4.8, Z0 + 0.7, 7.2, 3.2, [0.28, 0.4, 0.22]);
    for (let i = 0; i < 9; i++) S.GLOW.box(-4.4 + i * 1.1, G + 3.55, Z0 + 1.52, 0.12, 0.12, 0.12, i % 2 ? NEON.yellow : NEON.pink, { base: 0 });
  });
  S.section('closed_shop', () => { for (const wx of [-3.1, 3.1]) S.wall(B, wx, G + 2.0, Z0 + 0.07, 3.86, 1.86, mul(PAL.glassD, 0.7), PAL.glassL); S.wall(B, 0, G + 1.45, Z0 + 0.15, 1.46, 2.56, mul(PAL.glassD, 0.7), PAL.glassD); S.sign('closed', -1.45, G + 2.55, Z0 + 0.12, 0.95, 0.47, 0); S.dec('lock', 0, G + 1.35, Z0 + 0.2, 0.55, 0.55, 0); S.sign('closed', 0, G + 4.75, Z0 + 0.18, 2.6, 1.3, 0, [0.5, 0.5, 0.55]); });
  awningStripes(S, 0, G + 3.0, 9.8, 1.5, 0.75, cr('#ff6f61'), cr('#f6efde'), 18);
  S.dec('sale', -4.6, G + 1.45, Z0 + 0.08, 0.6, 0.6, 0); S.dec('sale', 4.8, G + 2.6, Z0 + 0.08, 0.5, 0.5, 0); S.dec('hours', 1.35, G + 1.7, Z0 + 0.2, 0.34, 0.22, 0);
  windowGrid(S, [-4.6, -1.6, 1.6, 4.6], [6.3], 1.4, 1.5, 0.75);
  B.box(0, 7.0, Z0 + 0.5, 0.06, 0.9, 0.06, PAL.iron, { base: 0 }); // blade sign bracket
  S.section('shop_blade', () => { B.box(-5.7, G + 3.75, Z0 + 0.45, 0.06, 0.06, 0.8, PAL.iron, { base: 0 }); S.GLOW.box(-5.7, G + 3.2, Z0 + 0.82, 0.12, 0.7, 0.4, NEON.pink, { base: 0 }); });
  // outside: clothes rack and the record crate
  const rx = -3.6, rz = -2.45; for (const sx of [-0.9, 0.9]) { B.cyl(rx + sx, G, rz, 0.03, 0.03, 1.6, 5, PAL.steel, { base: 0 }); B.box(rx + sx, G, rz, 0.06, 0.05, 0.6, PAL.steel, { base: 0 }); for (const wz of [-0.28, 0.28]) B.cyl(rx + sx, G, rz + wz, 0.07, 0.07, 0.07, 6, PAL.ink); }
  B.box(rx, G + 1.58, rz, 1.9, 0.04, 0.04, PAL.steel, { base: 0 });
  for (let i = 0; i < 9; i++) { const c = cc[(i * 5) % 6], x = rx - 0.75 + i * 0.19; B.box(x, G + 0.75, rz, 0.15, 0.82, 0.3, c, { base: 0.25, tint: 0.06 }); B.box(x, G + 1.56, rz, 0.02, 0.1, 0.02, PAL.steel, { base: 0 }); }
  S.hit.box(rx, rz, 1.05, 0.4);
  B.box(3.8, G, -2.55, 1.2, 0.5, 0.7, PAL.woodD, { base: 0.2 }); for (let i = 0; i < 9; i++) B.box(3.4 + i * 0.1, G + 0.5, -2.55, 0.08, 0.38, 0.6, cc[i % 6], { base: 0.1 }); S.hit.box(3.8, -2.55, 0.65, 0.4);
  S.dec('vinyl', 3.8, G + 0.2, -2.18, 0.35, 0.35, 0);
  waterTank(S, 3.4, Z0 - 3.5, top); roofClutter(S, x0, x1, top, 5, { n: 2 });
  S.dec('g2', 6.51, 2.3, Z0 - 5.0, 2.6, 1.95, Math.PI / 2); S.dec('poster2', 6.51, 1.5, Z0 - 2.2, 0.9, 1.35, Math.PI / 2);
}

// ===================================================================================== SOUND LAB (7.7 .. 19.3, door 13)
export function buildStudio(S) {
  const B = S.B, R = S.R, x0 = 7.7, x1 = 19.3, top = 10.6, dx = 13, base = cr('#5e70b0');
  block(S, x0, x1, top, 9, base, { courses: [4.2, 7.4], plinth: 1.0, plinthColor: cr('#262a4a'), roof: cr('#2a2640') });
  // foam window (left), steel door, speaker stack and posters (right)
  const fx = 10.2, fw = 3.2, fy = G + 1.95, fh = 1.7; B.box(fx, G + 0.05, Z0 + 0.02, fw + 0.5, fh + 0.8, 0.24, cr('#1d2038'), { base: 0.1 });
  S.wall(B, fx, fy, Z0 + 0.15, fw, fh, cr('#2a2050'), cr('#4a2f80'));
  const fc = [cr('#6a4aa8'), cr('#2a6f8a'), cr('#3a2f5e'), cr('#8a3f8a')];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { B.push(fx - fw / 2 + 0.23 + i * 0.45, fy - fh / 2 + 0.3 + j * 0.55, Z0 + 0.17, 0, 1, Math.PI / 2, 0); B.pyr(0, 0, 0, 0.43, 0.28, fc[(i + j * 2) % 4]); B.pop(); }
  B.box(dx, G, Z0 + 0.0, 1.9, 2.8, 0.22, cr('#232846'), { base: 0.1 }); B.box(dx, G + 0.02, Z0 + 0.14, 1.4, 2.5, 0.1, cr('#6a6e8e'), { base: 0.15, top: cr('#8a8eae') }); S.wall(B, dx, G + 1.95, Z0 + 0.2, 0.6, 0.5, PAL.glassD, PAL.glassL); B.box(dx + 0.5, G + 1.1, Z0 + 0.22, 0.12, 0.05, 0.12, PAL.steel, { base: 0 });
  for (const sy of [0.0, 0.95]) { B.box(17.1, G + sy, Z0 + 0.7 - 0.0, 1.05, 0.9, 0.7, cr('#17102b'), { base: 0.2 }); for (const sx of [-0.2, 0.2]) { B.cyl(17.1 + sx, G + sy + 0.45, Z0 + 1.06, 0.26, 0.2, 0.05, 8, cr('#4a4268'), { base: 0 }); } } S.hit.box(17.1, Z0 + 0.7, 0.55, 0.4);
  S.dec('poster3', 16.0, G + 2.0, Z0 + 0.03, 0.8, 1.2, 0); S.dec('poster4', 15.1, G + 1.8, Z0 + 0.03, 0.7, 1.05, 0); S.dec('poster1', 18.5, G + 2.2, Z0 + 0.03, 0.7, 1.05, 0);
  B.box(dx, G + 2.7, Z0 + 0.15, 0.5, 0.42, 0.34, cr('#2a1a2a'), { base: 0.1 }); // REC lamp housing (lens is a separate live mesh)
  S.section('open_studio', () => {
    S.wall(S.GLOW, fx, fy, Z0 + 0.14, fw - 0.1, fh - 0.1, [1.4, 0.5, 2.4], [0.5, 1.6, 2.6]); S.halo(fx, fy, Z0 + 0.9, 6.4, 3.8, [0.42, 0.2, 0.62]); S.halo(fx, 0.2, Z0 + 2.0, 5.4, 3.0, [0.26, 0.12, 0.42], { flat: true });
    S.wall(S.GLOW, dx, G + 1.95, Z0 + 0.19, 0.5, 0.4, [1.6, 2.2, 3.0]);
    S.sign('onair', dx, G + 3.35, Z0 + 0.16, 1.0, 0.37, 0); S.halo(dx, G + 3.2, Z0 + 0.7, 3.0, 2.2, [0.8, 0.12, 0.1]);
    S.sign('soundlab', dx, G + 5.1, Z0 + 0.14, 4.6, 1.15, 0); S.halo(dx, G + 5.1, Z0 + 0.7, 8.0, 3.8, [0.14, 0.42, 0.5]); S.halo(dx, 0.2, Z0 + 2.8, 8.2, 4.2, [0.1, 0.34, 0.42], { flat: true });
    for (let i = 0; i < 5; i++) S.GLOW.box(17.1 - 0.4 + i * 0.2, G + 2.0, Z0 + 1.07, 0.1, 0.06 + (i % 3) * 0.05, 0.06, [NEON.green, NEON.yellow, NEON.red, NEON.green, NEON.cyan][i], { base: 0 });
  });
  S.section('closed_studio', () => { S.wall(B, fx, fy, Z0 + 0.16, fw - 0.1, fh - 0.1, cr('#15122a'), cr('#2a2450')); S.sign('closed', dx, G + 3.35, Z0 + 0.16, 1.0, 0.5, 0); S.dec('lock', dx, G + 1.2, Z0 + 0.26, 0.5, 0.5, 0); S.sign('soundlab', dx, G + 5.1, Z0 + 0.14, 4.6, 1.15, 0, [0.22, 0.22, 0.3]); });
  windowGrid(S, [9.4, 11.7, 14.3, 16.6, 18.0], [6.0, 9.0], 1.3, 1.7, 0.6, { skip: (x, y) => x === 18.0 });
  // rooftop dish and mast
  B.cyl(15.0, top, Z0 - 3, 0.08, 0.08, 1.5, 5, PAL.iron); B.push(15.0, top + 1.7, Z0 - 3, 0.5, 1, -0.7, 0); B.lathe([[0, 0, mul(PAL.steel, 1.2)], [0.8, 0.28, PAL.steel], [0.85, 0.3, mul(PAL.steel, 0.8)]], 10, 0, 0, 0, {}); B.pop();
  roofClutter(S, x0, x1, top, 7, { n: 2 }); S.dec('g3', 19.31, 2.4, Z0 - 5.0, 2.8, 2.1, Math.PI / 2); S.dec('stencil', 19.31, 0.7, Z0 - 2.2, 1.0, 0.5, Math.PI / 2);
}

// ===================================================================================== BAR (20.5 .. 34, door 27)
export function buildBar(S) {
  const B = S.B, R = S.R, x0 = 20.5, x1 = 34, top = 9.6, dx = 27, base = cr('#6a4c8e');
  block(S, x0, x1, top, 9, base, { courses: [4.0, 7.0], plinth: 1.0, plinthColor: cr('#1c1230'), roof: cr('#241838'), trim: cr('#a870a8') });
  // door: double red doors with portholes, set in a pink-lined frame
  B.box(dx, G, Z0 + 0.0, 2.6, 3.1, 0.24, cr('#150d24'), { base: 0.1 }); B.box(dx - 0.55, G + 0.04, Z0 + 0.14, 1.05, 2.55, 0.1, cr('#b8283f'), { base: 0.15 }); B.box(dx + 0.55, G + 0.04, Z0 + 0.14, 1.05, 2.55, 0.1, cr('#b8283f'), { base: 0.15 });
  for (const sx of [-0.55, 0.55]) B.box(dx + sx, G + 1.0, Z0 + 0.2, 0.06, 0.06, 0.4, PAL.steel, { base: 0 });
  // dark front windows with purple light and patrons
  for (const wx of [23.4, 30.6]) { B.box(wx, G + 0.0, Z0 + 0.04, 2.9, 0.95, 0.2, cr('#150d24'), { base: 0.2 }); B.box(wx, G + 0.95, Z0 + 0.06, 3.0, 0.1, 0.22, cr('#8a5a8a')); S.wall(B, wx, G + 2.1, Z0 + 0.07, 2.6, 1.8, PAL.glassD, PAL.glassL); }
  // velvet rope
  for (const px of [24.2, 29.8]) { B.cyl(px, G, -2.2, 0.1, 0.07, 0.06, 8, cr('#d4a017')); B.cyl(px, G + 0.06, -2.2, 0.03, 0.03, 0.85, 6, cr('#d4a017')); B.blob(px, G + 0.95, -2.2, 0.07, 0.07, 0.07, cr('#e8c04a'), cr('#fff0a0'), { detail: 0, jit: 0 }); }
  B.box(25.1, G + 0.62, -2.2, 1.8, 0.06, 0.06, cr('#b8283f'), { base: 0 }); B.box(28.9, G + 0.62, -2.2, 1.8, 0.06, 0.06, cr('#b8283f'), { base: 0 }); S.hit.circle(24.2, -2.2, 0.2); S.hit.circle(29.8, -2.2, 0.2);
  B.box(31.2, G, -1.7, 0.72, 1.0, 0.1, cr('#2a2a2e'), { base: 0 }); S.dec('menu', 31.2, G + 0.55, -1.64, 0.62, 0.82, 0); S.hit.box(31.2, -1.7, 0.4, 0.15);
  S.section('open_bar', () => {
    for (const wx of [23.4, 30.6]) { S.wall(S.GLOW, wx, G + 2.1, Z0 + 0.06, 2.56, 1.76, [1.8, 0.5, 2.4], [2.6, 0.7, 1.9]); S.halo(wx, G + 2.0, Z0 + 0.9, 5.4, 3.6, [0.55, 0.14, 0.5]); }
    S.sign('bar', dx, G + 6.1, Z0 + 0.2, 5.2, 2.6, 0); S.halo(dx, G + 6.1, Z0 + 0.9, 11, 6.6, [0.62, 0.12, 0.42]); S.halo(dx + 1.6, G + 6.1, Z0 + 1.0, 4.2, 4.0, [0.0, 0.34, 0.4]);
    // neon tube frame around the door + awning lip lights
    const nf = NEON.pink, y0 = G + 0.05, y1 = G + 3.15;
    S.GLOW.box(dx - 1.42, y0, Z0 + 0.17, 0.07, y1 - y0, 0.07, nf, { base: 0 }); S.GLOW.box(dx + 1.42, y0, Z0 + 0.17, 0.07, y1 - y0, 0.07, nf, { base: 0 }); S.GLOW.box(dx, y1, Z0 + 0.17, 2.9, 0.07, 0.07, nf, { base: 0 });
    for (let i = 0; i < 12; i++) S.GLOW.box(dx - 2.75 + i * 0.5, G + 3.38, Z0 + 1.6, 0.14, 0.14, 0.14, i % 2 ? NEON.pink : NEON.cyan, { base: 0 });
    for (const sx of [-0.55, 0.55]) S.disc(S.GLOW, dx + sx, G + 1.55, Z0 + 0.21, 0.26, [1.6, 0.4, 2.2]);
    S.sign('live', 22.3, G + 3.5, Z0 + 0.12, 1.4, 0.7, 0); S.sign('cocktail', 31.7, G + 3.5, Z0 + 0.12, 1.9, 0.95, 0); S.halo(dx, 0.2, Z0 + 2.6, 9.0, 4.2, [0.52, 0.12, 0.36], { flat: true }); S.halo(dx + 2.2, 0.2, Z0 + 3.0, 5.0, 3.6, [0.0, 0.26, 0.32], { flat: true });
    S.GLOW.box(33.95, G + 2.9, Z0 + 0.6, 0.1, 3.4, 0.5, NEON.cyan, { base: 0 }); S.GLOW.box(33.95, G + 2.9, Z0 + 0.6, 0.1, 0.1, 0.5, NEON.pink, { base: 0 });
  });
  S.section('closed_bar', () => { for (const wx of [23.4, 30.6]) S.wall(B, wx, G + 2.1, Z0 + 0.08, 2.56, 1.76, cr('#120c20'), cr('#2a2048')); S.sign('bar', dx, G + 6.1, Z0 + 0.2, 5.2, 2.6, 0, [0.16, 0.14, 0.2]); S.sign('closed', dx, G + 3.9, Z0 + 0.14, 1.8, 0.9, 0); S.dec('lock', dx, G + 1.5, Z0 + 0.26, 0.55, 0.55, 0); });
  awningStripes(S, dx, G + 3.1, 5.6, 1.7, 0.7, cr('#2a1a44'), cr('#6a3a7a'), 14);
  windowGrid(S, [22.0, 24.6, 27.0, 29.4, 32.0], [6.0], 1.2, 1.6, 0.0, {}); // wall behind the big sign stays dark glass; the sign carries the light
  windowGrid(S, [22.3, 31.7], [8.2], 1.1, 1.0, 0.7, {});
  S.hit.box(dx, Z0 + 0.3, 1.4, 0.35); roofClutter(S, x0, x1, top, 11, { n: 3 }); S.dec('g1', 34.01, 1.5, Z0 - 2.0, 2.0, 1.5, Math.PI / 2); S.dec('poster2', 34.01, 1.9, Z0 - 4.0, 0.8, 1.2, Math.PI / 2);
  // bouncer's spot (npc placed by street.js), lit dais
  S.floor(S.B, 28.4, 30.2, -3.0, -2.0, G + 0.01, cr('#201432'));
}

// ===================================================================================== alleys, fillers, far side
export function buildAlleys(S) {
  const B = S.B, R = S.R;
  for (const [a, b] of [[-8.5, -6.5], [6.5, 7.7], [19.3, 20.5]]) { // dark alley floors and back walls
    const cx = (a + b) / 2; S.floor(B, a, b, Z0 - 9, Z0 + 0.1, 0.03, cr('#1b1530')); B.box(cx, 0, Z0 - 9.2, b - a, 7, 0.3, cr('#2a2040'), { base: 0.2 });
    B.box(cx, 0, Z0 - 2.0, b - a - 0.5, 4.2, 0.4, cr('#1a1428'), { base: 0 }); // deep shadow
  }
  // alley A: dumpster, pipes, ladder
  B.box(-7.5, G, Z0 + 0.7, 1.4, 0.95, 0.8, cr('#2f8a5a'), { base: 0.3, top: cr('#256a46') }); B.box(-7.5, G + 0.95, Z0 + 0.7, 1.5, 0.1, 0.9, cr('#1f5a3c'), { base: 0 }); S.hit.box(-7.5, Z0 + 0.7, 0.75, 0.45);
  for (const px of [-8.2, -6.8]) B.cyl(px, 0, Z0 - 0.4, 0.07, 0.07, 6.5, 5, PAL.steelD, { base: 0 });
  // alley C (between studio and bar): crates and a bin with a red lamp
  B.box(19.9, G, Z0 + 0.5, 0.9, 0.6, 0.7, PAL.woodD, { base: 0.2 }); B.box(19.9, G + 0.6, Z0 + 0.55, 0.7, 0.5, 0.6, PAL.wood, { base: 0.2 }); S.hit.box(19.9, Z0 + 0.5, 0.5, 0.4);
  S.GLOW.box(20.0, 3.4, Z0 - 0.5, 0.2, 0.2, 0.2, NEON.red, { base: 0 }); S.halo(20.0, 3.4, Z0 + 0.1, 1.8, 1.8, [0.5, 0.1, 0.08]);
  // alley B: bike and a flyer-covered post
  B.cyl(7.1, G, Z0 + 0.4, 0.07, 0.07, 1.0, 5, PAL.iron); S.dec('poster4', 7.1, G + 0.7, Z0 + 0.49, 0.38, 0.57, 0);
}
export function buildFillers(S) {
  const B = S.B, R = S.R;
  // east end: a corner block with a laundromat glow, then plain blocks fading out
  block(S, 34, 46, 12.0, 9, cr('#6a5a8a'), { courses: [4.2, 7.4], plinth: 0.9, roof: cr('#3a2f50') });
  windowGrid(S, [35.6, 38.0, 40.4, 42.8, 45.0], [6.0, 9.0, 11.0], 1.2, 1.5, 0.55, {}); windowGrid(S, [36.0, 41.0], [G + 1.9], 1.9, 1.5, 0.0, {});
  S.section('launder', () => { S.wall(S.GLOW, 39.5, G + 1.95, Z0 + 0.06, 4.2, 1.8, [2.0, 2.4, 2.8], [1.4, 1.8, 2.4]); S.halo(39.5, G + 1.9, Z0 + 0.8, 8.0, 3.6, [0.22, 0.3, 0.4]); S.halo(39.5, 0.2, Z0 + 2.4, 6.0, 3.0, [0.2, 0.28, 0.36], { flat: true }); });
  B.box(39.5, G + 0.0, Z0 + 0.04, 4.6, 0.9, 0.2, cr('#2a2240'), { base: 0.2 }); B.box(39.5, G + 2.95, Z0 + 0.06, 4.6, 0.14, 0.24, cr('#2a2240')); // laundromat frame
  block(S, 46, 62, 9.0, 9, cr('#7a6a9a'), { courses: [4.2], plinth: 0.9, roof: cr('#3a2f50') }); windowGrid(S, [48, 51, 54, 57, 60], [6.0], 1.2, 1.5, 0.5, {});
  // west end: a tall block behind the park wall
  block(S, -62, -46, 14.0, 9, cr('#8a5a6a'), { courses: [4.2, 7.4, 10.4], plinth: 0.9, roof: cr('#3a2f50') }); windowGrid(S, [-60, -57, -54, -51, -48], [6.0, 9.0, 12.0], 1.2, 1.6, 0.5, {});
  // far side of the road (only seen from a fly-over): low blocks facing the street
  for (let i = 0; i < 6; i++) {
    const x = -44 + i * 15, w = 12 + (i % 2) * 2, h = 6 + (i % 3) * 2.5, zf = 13.2; const col0 = [cr('#7a6a9a'), cr('#9a6a7a'), cr('#6a7aa0')][i % 3];
    B.box(x, 0, zf + 4.5, w, h, 9, col0, { base: 0.4, top: mix(col0, PAL.ink, 0.5) });
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) { const lit = R() < 0.55; (lit ? S.GLOW : B).quad([x - w / 2 + 1 + k * (w - 2) / 4 + 0.6, 2.5 + j * 2.6, zf - 0.02], [x - w / 2 + 1 + k * (w - 2) / 4, 2.5 + j * 2.6, zf - 0.02], [x - w / 2 + 1 + k * (w - 2) / 4, 3.8 + j * 2.6, zf - 0.02], [x - w / 2 + 1 + k * (w - 2) / 4 + 0.6, 3.8 + j * 2.6, zf - 0.02], lit ? WINCOL[(R() * 6) | 0] : PAL.glassD); }
  }
}
