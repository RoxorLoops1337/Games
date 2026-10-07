// Sound Lab room dressing (Interior Artist INT-A): floor and wall colour functions for the shell, acoustic foam, the jukebox corner, couch and coffee table, the jam corner
// (guitar, amp, flight cases, beanbag), plants, string lights, posters and the cable spaghetti.
import { P, mix, mul, bar, plant, col, aoTint, fbm, WARM, PINKN, CYANN, YELN, GREENN, WHITEN } from './flat_kit.js';
import { sm, wallDecal, wallScreen, wbox } from './shop_shell.js';

const C = (h) => col(h);
export const LAB = { b: { minX: -4.5, maxX: 4.5, minZ: -3.5, maxZ: 3.5 }, H: 2.75, LOW: 0.9, T: 0.28 };
const hash = (i, j, s) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul((s || 0) + 1, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const inBooth = (x, z) => x > 1.7 && z < -0.55;

export function floorFn() {
  const wallAO = (x, z) => Math.min(0.75, 0.42 * (1 - sm(0, 0.9, z + 3.5)) + 0.42 * (1 - sm(0, 0.9, x + 4.5)) + 0.2 * (1 - sm(0, 0.6, 3.5 - z)) + 0.2 * (1 - sm(0, 0.6, 4.5 - x)));
  return (x, z, i, j) => {
    const xc = -4.5 + (i + 0.5) * 0.25, zc = -3.5 + (j + 0.5) * 0.25; let base;
    if (inBooth(xc, zc)) base = ((Math.floor((xc - 1.7) / 0.5) + Math.floor((zc + 3.5) / 0.5)) % 2) ? C('#5a4f82') : C('#4b4270');
    else if (xc > 1.55 && xc < 1.7 && zc < -0.4) base = P.pink; // magenta threshold strip along the booth glass
    else if (Math.abs(xc + 1.75) < 0.55 && zc > -0.2) base = mix(C('#8a6a72'), C('#a87a6a'), hash(i, j, 3)); // worn walkway from the door to the desk
    else { const ch = (Math.floor((xc + 4.5) / 0.5) + Math.floor((zc + 3.5) / 0.5)) % 2 === 0; base = mix(ch ? C('#5a5480') : C('#4e4a76'), C('#6a6290'), hash(i, j, 5) * 0.4); }
    const gr = 1 - 0.1 * sm(0.5, 0.8, fbm(x * 0.8, z * 0.8, 9));
    return aoTint(mul(base, gr), wallAO(x, z));
  };
}
export function wallFns() {
  const H = LAB.H, ao = (u, v, vc, len, seed, uc) => Math.min(0.8, 0.4 * (1 - sm(0, 0.5, v)) * (vc < 0.2 ? 0.3 : 1) + 0.28 * sm(H - 0.7, H, v) + 0.35 * (1 - sm(0, 0.45, u)) + 0.35 * (1 - sm(0, 0.45, len - u)) + 0.1 * sm(0.35, 0.8, fbm(uc * 1.3, vc * 1.3, seed)));
  const dado = (uc, vc) => { if (vc < 0.12) return C('#2a2040'); const q = (Math.floor(uc / 0.3) + Math.floor(vc / 0.3)) % 2; return q ? C('#5a2f6e') : C('#6a3a7e'); };
  const upper = (uc, vc) => mix(C('#2e2658'), C('#3a3070'), 0.5 + 0.3 * Math.sin(uc * 2.1 + vc * 1.7));
  const N = (u, v, uc, vc) => aoTint(vc < 0.95 ? dado(uc, vc) : vc < 1.0 ? C('#d8b04a') : upper(uc, vc), ao(u, v, vc, 9, 8, uc));
  const W = (u, v, uc, vc) => aoTint(vc < 0.95 ? dado(uc, vc) : vc < 1.0 ? C('#d8b04a') : upper(uc, vc), ao(u, v, vc, 7, 18, uc));
  return { N, W };
}

// foam: pyramids on a wall frame f between u0..u1 and y0..y1. skip(u, y) -> true leaves a hole (decals, windows, racks)
const FOAM = [C('#3a4470'), C('#5a4a98'), C('#2f7d86'), C('#4b3a7a'), C('#2c3a64'), C('#6a3b8f')];
export function foam(B, f, u0, u1, y0, y1, skip, seed, cell) {
  cell = cell || 0.3; const R = (a, b) => hash(a, b, seed || 1);
  for (let i = 0, u = u0 + cell / 2; u < u1 - cell / 2 + 1e-3; i++, u += cell) for (let j = 0, y = y0 + cell / 2; y < y1 - cell / 2 + 1e-3; j++, y += cell) {
    if (skip && skip(u, y)) continue; const p = f.pt(u, 0.012); let c = FOAM[((i * 3 + j * 5 + ((R(i, j) * 3) | 0)) % 6 + 6) % 6]; if ((i * 7 + j * 3) % 11 === 0) c = C('#c0408a'); // the odd hot-pink tile
    B.push(p[0], y, p[1], Math.atan2(f.nx, f.nz), 1, Math.PI / 2); B.pyr(0, 0, 0, cell * 0.98, 0.1, c, 0); B.pop();
  }
}
export const rect = (u0, u1, y0, y1) => (u, y) => u > u0 && u < u1 && y > y0 && y < y1;

const cable = (B, pts, w, c, y0) => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; bar(B, [a[0], (y0 || 0.014) + (a[2] || 0), a[1]], [b[0], (y0 || 0.014) + (b[2] || 0), b[1]], w, w, c); } };
export { cable };

export function buildRoom(S, F) {
  const B = S.B, G = S.GLOW, hit = S.hit, R = S.rand, N = F.N, Wf = F.W;
  // ---------------------------------------------------------------- acoustic foam (control room side); booth foam is built with the booth
  const skipN = (u, y) => rect(0.1, 1.2, 0.9, 2.3)(u, y) /* posters */ || rect(1.3, 2.85, 0.9, 2.7)(u, y) /* racks + window */ || rect(2.7, 4.15, 0.9, 2.7)(u, y) /* whiteboard + sign */;
  foam(B, N, 0.1, 6.1, 1.0, 2.6, skipN, 1);
  foam(B, Wf, 0.1, 6.9, 1.0, 2.6, (u, y) => (u < 2.6 && y < 2.3) /* pictures over the couch */ || rect(2.55, 4.05, 1.0, 2.7)(u, y) /* window */ || (u > 4.15 && u < 5.35 && y < 1.55) /* jukebox */, 2);
  // ---------------------------------------------------------------- jukebox corner (west wall, facing east): arch top, neon tubes, record window, grille
  { const jx = -4.05, jz = -1.25, w = 0.95, d = 0.55; S.soft(jx + 0.1, jz, 0.7, 0.9, 0.4);
    B.box(jx, 0, jz, d, 1.0, w, C('#7a2f6e'), { base: 0.3, tint: 0.03, top: C('#8f3f80') });
    B.box(jx, 0, jz, d + 0.04, 0.14, w + 0.04, C('#2b2438'), { base: 0.1 });
    // arch: semicircle in the y-z plane, extruded along x
    const r = w / 2, n = 10, top = 1.0, x1 = jx + d / 2, x0 = jx - d / 2, cB = C('#9a4a8c'), cF = C('#c7bfd8'), pts = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1]; B.tri([x1, top, jz], [x1, top + b[1], jz + b[0]], [x1, top + a[1], jz + a[0]], mix(C('#241438'), C('#3a2060'), 0.4)); B.quad([x0, top + a[1], jz + a[0]], [x1, top + a[1], jz + a[0]], [x1, top + b[1], jz + b[0]], [x0, top + b[1], jz + b[0]], mix(cB, P.ink, 0.1 * i / n), mix(cB, P.ink, 0.1 * i / n), mix(cB, P.ink, 0.1 * (i + 1) / n), mix(cB, P.ink, 0.1 * (i + 1) / n)); }
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1]; bar(G, [x1 + 0.01, top + a[1] * 0.92, jz + a[0] * 0.92], [x1 + 0.01, top + b[1] * 0.92, jz + b[0] * 0.92], 0.04, 0.04, i % 2 ? [3.2, 0.7, 1.8] : [0.6, 2.8, 3.2]); bar(B, [x1 + 0.005, top + a[1], jz + a[0]], [x1 + 0.005, top + b[1], jz + b[0]], 0.05, 0.05, cF); }
    S.screen('jukebox', x1 + 0.02, 0.83, jz, 0.62, 0.42, Math.PI / 2, 0, [1.1, 1.1, 1.1]); B.box(x1 + 0.004, 0.62, jz, 0.02, 0.5, 0.74, P.ink, { base: 0 }); // window frame behind the decal
    for (let i = 0; i < 6; i++) B.box(x1 + 0.01, 0.2 + i * 0.015, jz, 0.012, 0.01, 0.6, P.ink, { base: 0 }); B.box(x1 + 0.012, 0.16, jz, 0.01, 0.18, 0.62, mix(P.ink, P.violet, 0.3), { base: 0 });
    [-1, 1].forEach((sd) => { G.box(x1 + 0.01, 0.12, jz + sd * (w / 2 - 0.03), 0.02, 0.84, 0.03, sd < 0 ? [3.2, 0.7, 1.8] : [0.6, 2.8, 3.2], { base: 0, tint: 0 }); });
    B.box(x1 + 0.01, 0.52, jz + 0.34, 0.02, 0.1, 0.1, C('#d8b04a'), { base: 0 });
    S.lights.push({ x: jx + 0.9, y: 1.1, z: jz, color: '#ff4fa0', r: 4.8, i: 0.8, kind: 'neon' }); hit.box(jx, jz, d / 2 + 0.02, w / 2 + 0.02, 0); S.jukebox = { x: jx, z: jz };
  }
  // ---------------------------------------------------------------- couch against the west wall, coffee table, rug, floor lamp, framed records
  { const cx = -3.98, z0 = 0.95, z1 = 2.95, cz = (z0 + z1) / 2, teal = C('#2a8f90'), tealL = C('#3aa8a6'), tealD = C('#1f6a74'); S.soft(cx + 0.1, cz, 0.9, 1.3, 0.4);
    S.decal('rug_l', -2.95, 0.017, 1.95, 2.9, 2.0, 0, -Math.PI / 2, [1, 1, 1]);
    B.box(cx, 0.12, cz, 0.84, 0.32, z1 - z0, teal, { base: 0.3, tint: 0.04 }); B.box(cx - 0.34, 0.12, cz, 0.16, 0.8, z1 - z0, teal, { base: 0.2, tint: 0.04, taper: 0.97 });
    [z0 + 0.1, z1 - 0.1].forEach((z) => B.box(cx, 0.12, z, 0.84, 0.52, 0.2, tealD, { base: 0.1, tint: 0.04 }));
    for (let i = 0; i < 3; i++) B.box(cx + 0.07, 0.42, z0 + 0.34 + i * 0.44, 0.62, 0.17, 0.42, mix(tealL, teal, i % 2 * 0.4), { base: 0.2, tint: 0.04, top: mix(tealL, P.cream, 0.1) });
    for (let i = 0; i < 3; i++) B.box(cx - 0.22, 0.52, z0 + 0.34 + i * 0.44, 0.2, 0.42, 0.42, mix(teal, tealL, 0.3), { base: 0.1, tint: 0.04, rz: -0.12 });
    [z0 + 0.14, z1 - 0.14].forEach((z) => [-1, 1].forEach((sd) => B.box(cx + sd * 0.34, 0, z, 0.06, 0.12, 0.06, P.woodD, { base: 0 })));
    B.box(cx + 0.02, 0.6, z0 + 0.38, 0.1, 0.34, 0.34, P.mustard, { base: 0.1, tint: 0.05, ry: 0.0, rx: -0.15 }); B.box(cx + 0.0, 0.58, z1 - 0.36, 0.1, 0.3, 0.3, P.coral, { base: 0.1, tint: 0.05, rx: 0.2 }); B.box(cx + 0.2, 0.43, cz + 0.2, 0.34, 0.07, 0.5, mix(P.pink, P.cream, 0.2), { base: 0.1, tint: 0.04, ry: 0.4 });
    hit.box(cx, cz, 0.45, (z1 - z0) / 2 + 0.03, 0);
    // coffee table with mugs, a snapback and a tape
    const tx = -2.7, tz = 1.95; S.soft(tx, tz, 0.55, 0.8, 0.35); B.box(tx, 0.28, tz, 0.55, 0.05, 1.0, P.woodL, { base: 0.1, tint: 0.03 }); [[-0.22, -0.42], [0.22, -0.42], [-0.22, 0.42], [0.22, 0.42]].forEach(([dx, dz]) => B.box(tx + dx, 0, tz + dz, 0.05, 0.28, 0.05, P.woodD, { base: 0.3 })); B.box(tx, 0.1, tz, 0.5, 0.02, 0.9, P.woodD, { base: 0 });
    B.lathe([[0.04, 0, P.cream], [0.045, 0.09, P.cream], [0.0, 0.09, P.coral]], 8, tx - 0.08, 0.33, tz - 0.3, {}); B.lathe([[0.04, 0, P.mustard], [0.045, 0.09, P.mustard], [0.0, 0.09, P.coral]], 8, tx + 0.1, 0.33, tz + 0.1, {});
    B.box(tx, 0.33, tz + 0.36, 0.2, 0.02, 0.13, P.ink, { base: 0, ry: 0.3 }); B.box(tx + 0.03, 0.35, tz + 0.36, 0.14, 0.002, 0.06, P.pinkL, { base: 0, ry: 0.3 }); B.box(tx - 0.12, 0.33, tz + 0.15, 0.2, 0.02, 0.2, P.yellow, { base: 0.1, ry: 0.5 }); hit.box(tx, tz, 0.3, 0.55, 0);
    // floor lamp with a warm shade by the couch, and a fiddle leaf in the north-west corner
    { const lx = -4.15, lz = 3.15; S.soft(lx, lz, 0.4, 0.4, 0.35); B.cyl(lx, 0, lz, 0.14, 0.14, 0.03, 8, P.ink); B.cyl(lx, 0.03, lz, 0.02, 0.02, 1.55, 6, P.steelD); B.lathe([[0.2, 0, C('#e8604a')], [0.1, 0.22, C('#f07a5a')], [0.0, 0.22, C('#f89a7a')]], 8, lx, 1.5, lz, { tint: 0.02 }); G.lathe([[0.19, 0.01, [3.0, 1.7, 0.8]], [0.095, 0.21, [3.0, 1.7, 0.8]]], 8, lx, 1.5, lz, {}); S.lights.push({ x: lx + 0.2, y: 1.5, z: lz - 0.2, color: '#ffb066', r: 5.0, i: 0.85, kind: 'lamp' }); hit.circle(lx, lz, 0.2); }
    plant(S, -4.1, 0, -3.1, 'fiddle', 1.2, { pot: C('#3a3a58'), pr: 0.24, ph: 0.32 }); S.soft(-4.1, -3.1, 0.5, 0.5, 0.35); hit.circle(-4.1, -3.1, 0.28);
    // gold records and a poster above the couch
    wallDecal(S, Wf, 'gold0', 1.9, 0.025, 1.8, 0.4, 0.4, [1.1, 1.1, 1.1]); wallDecal(S, Wf, 'gold1', 1.4, 0.025, 1.78, 0.4, 0.4, [1.1, 1.1, 1.1]); wallDecal(S, Wf, 'poster_l2', 0.85, 0.03, 1.8, 0.46, 0.64, [1.05, 1.05, 1.05]);
    wbox(B, Wf, 1.9, 0.012, 1.57, 0.46, 0.46, 0.03, C('#d8b04a'), { base: 0 }); wbox(B, Wf, 1.4, 0.012, 1.55, 0.46, 0.46, 0.03, C('#d8b04a'), { base: 0 }); wbox(B, Wf, 0.85, 0.012, 1.46, 0.52, 0.7, 0.03, P.ink, { base: 0 });
  }
  // ---------------------------------------------------------------- the jam corner (east side, south of the booth): beanbag, guitar on a stand, amp, flight cases with stickers, mini fridge
  { const bx = 2.65, bz = 2.05; S.soft(bx, bz, 0.8, 0.8, 0.4); B.lathe([[0.0, 0, C('#e8604a')], [0.46, 0.0, C('#d85a44')], [0.54, 0.1, C('#e8604a')], [0.5, 0.24, C('#f07a5a')], [0.36, 0.36, C('#f2806a')], [0.2, 0.4, C('#f2806a')], [0.0, 0.34, C('#d85a44')]], 10, bx, 0, bz, { tint: 0.05, sx: 1.05 }); hit.circle(bx, bz, 0.5);
    S.decal('rug_l2', 2.9, 0.017, 2.0, 1.9, 1.3, 0.2, -Math.PI / 2, [1, 1, 1]);
    { const gx = 3.45, gz = 3.0; B.push(gx, 0, gz, -0.5); [0.0, 2.1, 4.2].forEach((a) => bar(B, [0, 0.55, 0], [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], 0.02, 0.02, P.ink)); B.push(0, 0.1, 0, 0, 1, -0.14); B.box(0, 0, 0, 0.36, 0.5, 0.07, C('#d9a54a'), { base: 0.1, tint: 0.04, taper: 0.8 }); B.box(0, 0.18, 0.04, 0.12, 0.12, 0.012, P.ink, { base: 0 }); B.box(0, 0.45, 0, 0.1, 0.55, 0.05, C('#8a5a3a'), { base: 0.1, taper: 0.6 }); B.box(0, 0.98, 0, 0.14, 0.14, 0.05, C('#8a5a3a'), { base: 0.1 }); B.pop(); B.pop(); hit.circle(gx, gz, 0.3); }
    { const ax = 4.2, az = 2.0; S.soft(ax, az, 0.5, 0.5, 0.35); B.box(ax, 0, az, 0.45, 0.55, 0.62, C('#2b2438'), { base: 0.3, tint: 0.03, top: C('#3f3857'), ry: -0.1 }); B.push(ax, 0, az, -0.1); B.box(-0.0, 0.07, 0.32, 0.36, 0.4, 0.012, C('#c7a14a'), { base: 0 }); B.box(0, 0.42, 0.32, 0.38, 0.06, 0.014, P.ink, { base: 0 }); for (let i = 0; i < 4; i++) B.box(-0.12 + i * 0.08, 0.45, 0.33, 0.035, 0.03, 0.02, P.cream, { base: 0 }); B.pop(); hit.box(ax, az, 0.3, 0.34, -0.1); }
    S.soft(4.0, 1.25, 0.8, 0.6, 0.4); B.box(4.05, 0, 1.2, 0.78, 0.6, 0.5, C('#3a3a4a'), { base: 0.2, tint: 0.03, top: C('#4a4a5c'), ry: 0.1 }); B.box(4.0, 0.6, 1.22, 0.7, 0.45, 0.46, C('#4a3a58'), { base: 0.1, tint: 0.03, top: C('#5a4a68'), ry: -0.08 });
    [[-0.34, 0.0], [0.34, 0.0]].forEach(([dx]) => { B.box(4.05 + dx, 0.0, 1.48, 0.05, 0.6, 0.05, P.steelL, { base: 0.1 }); }); B.box(4.05, 0.28, 1.47, 0.64, 0.04, 0.03, P.steelL, { base: 0 });
    S.decal('stk0', 3.8, 0.4, 1.48, 0.2, 0.2, 0.1, 0, [1.05, 1.05, 1.05], 0.2); S.decal('stk2', 4.3, 0.34, 1.48, 0.2, 0.2, 0.1, 0, [1.05, 1.05, 1.05], -0.15); S.decal('stk1', 4.0, 0.9, 1.46, 0.2, 0.2, -0.08, -0.05, [1.05, 1.05, 1.05]); S.decal('stk3', 4.28, 0.78, 1.46, 0.18, 0.18, -0.08, -0.05, [1.05, 1.05, 1.05], 0.3); hit.box(4.05, 1.22, 0.42, 0.28, 0.1);
    // mini fridge with a note and a bottle crate at the east wall
    S.soft(4.12, 3.0, 0.5, 0.5, 0.35); B.box(4.15, 0, 3.0, 0.5, 0.9, 0.5, C('#8fd6c0'), { base: 0.3, tint: 0.03, top: C('#a8e6d2') }); B.box(4.15, 0.62, 3.0 - 0.255, 0.44, 0.015, 0.01, mul(C('#8fd6c0'), 0.7), { base: 0 }); B.box(3.9, 0.4, 3.0 - 0.27, 0.025, 0.2, 0.03, P.steelL, { base: 0 }); B.box(3.9, 0.7, 3.0 - 0.27, 0.025, 0.14, 0.03, P.steelL, { base: 0 }); hit.box(4.15, 3.0, 0.28, 0.28, 0);
  }
  // ---------------------------------------------------------------- string lights across the control room, a CONTROL sign and posters; cables on the floor
  { const y = 2.45; for (let i = 0; i < 12; i++) { const t = i / 11, x = -4.4 + t * 5.8, z = -3.4 + t * 0.2 + 0.0, yy = y - 0.12 * Math.sin(t * Math.PI * 3); const c = [[3.2, 2.0, 0.6], [0.6, 2.6, 2.8], [3.0, 0.8, 1.6], [1.0, 2.8, 0.8]][i % 4]; G.blob(x, yy, z + 0.12, 0.03, 0.03, 0.03, c, c, { detail: 0, jit: 0.02 }); if (i) bar(B, [x - 0.5, yy + 0.03 * Math.sin(i), z + 0.12], [x, yy, z + 0.12], 0.006, 0.006, P.ink); } }
  wallDecal(S, N, 'poster_l1', 0.45, 0.03, 1.6, 0.4, 0.55, [1.05, 1.05, 1.05]); wbox(B, N, 0.45, 0.012, 1.31, 0.46, 0.64, 0.03, P.ink, { base: 0 });
  wallDecal(S, N, 'poster_l0', 0.95, 0.03, 1.6, 0.4, 0.55, [1.05, 1.05, 1.05]); wbox(B, N, 0.95, 0.012, 1.31, 0.46, 0.64, 0.03, P.ink, { base: 0 });
  wallScreen(S, N, 'sign_control', 3.55, 0.03, 2.28, 0.9, 0.2, [1.1, 1.1, 1.1]); S.lights.push({ x: -1.0, y: 2.3, z: -3.0, color: '#35f2e0', r: 4.2, i: 0.45, kind: 'neon' });
  wallDecal(S, N, 'whiteboard', 3.4, 0.03, 1.5, 1.28, 0.8, [1.05, 1.05, 1.05]); wbox(B, N, 3.4, 0.012, 1.08, 1.34, 0.84, 0.03, C('#a8a6b4'), { base: 0 }); B.box(-1.1, 1.05, -3.44, 0.7, 0.02, 0.07, C('#a8a6b4'), { base: 0 }); B.box(-1.25, 1.07, -3.44, 0.1, 0.015, 0.02, P.red, { base: 0 }); B.box(-1.0, 1.07, -3.44, 0.1, 0.015, 0.02, P.cyan, { base: 0 });
  // fixed cable spaghetti: console to racks, console to booth, pads, a coil by the amp
  { const col1 = [P.ink, P.red, P.pink, P.cyan, P.yellow, P.lime, P.steelD]; for (let k = 0; k < 7; k++) cable(B, [[-3.0 + k * 0.1, -2.0], [-2.7 + k * 0.17 + R() * 0.1, -2.5 - R() * 0.1], [-2.9 + k * 0.2 + R() * 0.2, -2.9 + 0.1 * k], [-2.5 + k * 0.1, -3.15]], 0.02, col1[k], 0.012 + k * 0.0005);
    for (let k = 0; k < 5; k++) cable(B, [[-0.6, -1.8 + k * 0.1], [0.2 + R() * 0.2, -1.5 + k * 0.25], [1.1 + R() * 0.4, -1.2 + R() * 0.2], [1.68, -1.0 - k * 0.3]], 0.02, col1[(k + 2) % 7], 0.012);
    for (let k = 0; k < 4; k++) cable(B, [[0.6 + k * 0.1, -1.1], [0.2, -0.5 + k * 0.1], [-0.2 - k * 0.1, -0.7], [-0.6, -0.95]], 0.018, col1[(k + 4) % 7], 0.012);
    for (let k = 0; k < 3; k++) { const pts = []; for (let a = 0; a <= 7; a++) pts.push([3.55 + Math.cos(a * 0.9 + k) * (0.12 + a * 0.012), 1.4 + Math.sin(a * 0.9 + k) * (0.1 + a * 0.012)]); cable(B, pts, 0.02, col1[k], 0.012); } }
}
