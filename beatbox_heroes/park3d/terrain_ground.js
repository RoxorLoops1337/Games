// Terrain ground: hills, hand-painted grass, curved sand paths with stone edging, the paved plaza and seating apron, the red jogging track and the street outside the gate.
import { THREE } from './kit.js';
import { Buf, col, mix, mul, sat, smooth, lerp, fbm, vnoise, curve, aoTint, distToSamples } from './terrain_util.js';

export const PLAZA = { x: 0, z: 0, r: 7.5 };
export const APRON = { a0: (146 * Math.PI) / 180, a1: (262 * Math.PI) / 180, r0: 7.5, r1: 10.9 }; // bench seating crescent (angles from +x toward +z)
export const PATHS = [
  { id: 'main', w: 3.4, pts: [[0.2, 29], [0.5, 23], [-0.6, 15.5], [0.3, 9], [0, 3]], kerb: true },
  { id: 'north', w: 3.0, pts: [[0, -3], [0.4, -9], [-1.3, -15], [0.2, -20], [0, -23.4]], kerb: true },
  { id: 'busk', w: 2.5, pts: [[4.2, -4.2], [6.3, -5.2], [8, -8]], kerb: true },
  { id: 'east', w: 2.4, pts: [[6.5, 2.2], [9.5, 4], [13, 4.6]], kerb: true },
  { id: 'start', w: 2.4, pts: [[0, 13.8], [6, 13.1], [10.9, 13.9]], kerb: true },
  { id: 'flyers', w: 2.2, pts: [[0.6, 22.3], [2.6, 22.9], [4.2, 22.5]], kerb: false },
];
export const LOOP = [[-9.5, -19.6], [0, -20.6], [9.2, -19.4], [12.2, -13], [12.9, -3], [12.9, 7], [12.4, 14], [9.8, 17.3], [0, 18.3], [-9.8, 17.3], [-12.6, 11], [-13.2, 1], [-12.8, -9], [-12, -16]];
export const LOOP_W = 3.2;
export const WEAR = [ // worn bare spots on the lawn: x, z, radius x, radius z
  { x: 8, z: -8, rx: 3.3, rz: 3.3, k: 1.0 }, { x: -6.5, z: 8.5, rx: 2.4, rz: 3.2, k: 0.55 }, { x: 5, z: -1.5, rx: 2.0, rz: 1.4, k: 0.4 }, { x: 4, z: 22, rx: 3.0, rz: 2.2, k: 0.7 },
  { x: -7.4, z: -9.5, rx: 2.6, rz: 1.4, k: 0.5 }, { x: 12.3, z: 14, rx: 2.4, rz: 3.0, k: 0.45 }, { x: 3.5, z: 6.5, rx: 1.4, rz: 2.4, k: 0.35 },
];

const G = { base: col('#66A453'), light: col('#9DC65C'), mid: col('#4F9552'), dark: col('#35794F'), teal: col('#26705F'), dry: col('#B5B062'), dirt: col('#C9A872'), edge: col('#335F50') };
const SAND = [col('#E8CD8F'), col('#DFBF82'), col('#F0D9A0')], SAND_EDGE = col('#C99D63'), SAND_DARK = col('#A9774F');
const TRACK = [col('#BE6650'), col('#B45C4A'), col('#C77055')], TRACK_EDGE = col('#9A4C48'), LINE = col('#F2E3C6');
const STONE = [col('#BDB2C2'), col('#ADA3B6'), col('#CBC0C8')], STONE_DK = col('#7F7592');

// ---------------------------------------------------------------- field: curves, distances, height
export function makeField() {
  const paths = PATHS.map((p) => Object.assign({ cv: curve(p.pts, false, 0.5) }, p));
  const loop = curve(LOOP, true, 0.5);
  const near = [], loopNear = [];
  paths.forEach((p) => { const sm = curve(p.pts, false, 0.9); sm.forEach((q) => near.push({ x: q.x, z: q.z, w: p.w / 2 })); });
  curve(LOOP, true, 0.9).forEach((q) => { near.push({ x: q.x, z: q.z, w: LOOP_W / 2 }); loopNear.push({ x: q.x, z: q.z, w: LOOP_W / 2 }); });
  function dLoop(x, z) { let best = 1e9; for (let i = 0; i < loopNear.length; i++) { const q = loopNear[i], dx = x - q.x, dz = z - q.z, d = Math.sqrt(dx * dx + dz * dz) - q.w; if (d < best) best = d; } return best; }
  function dOther(x, z) {
    let best = 1e9; for (let i = 0; i < near.length - loopNear.length; i++) { const q = near[i], dx = x - q.x, dz = z - q.z, d = Math.sqrt(dx * dx + dz * dz) - q.w; if (d < best) best = d; }
    const dp = Math.hypot(x - PLAZA.x, z - PLAZA.z) - PLAZA.r; if (dp < best) best = dp;
    const ang = Math.atan2(z, x), a = ang < 0 ? ang + Math.PI * 2 : ang, rr = Math.hypot(x, z);
    if (a > APRON.a0 - 0.1 && a < APRON.a1 + 0.1) { const d = Math.max(APRON.r0 - rr, rr - APRON.r1); if (d < best) best = d; }
    return best;
  }
  // distance to the nearest walkable surface (negative inside)
  function pathDist(x, z) {
    let best = 1e9; for (let i = 0; i < near.length; i++) { const q = near[i], dx = x - q.x, dz = z - q.z, d = Math.sqrt(dx * dx + dz * dz) - q.w; if (d < best) best = d; }
    const dp = Math.hypot(x - PLAZA.x, z - PLAZA.z) - PLAZA.r; if (dp < best) best = dp;
    const ang = Math.atan2(z, x), a = ang < 0 ? ang + Math.PI * 2 : ang, rr = Math.hypot(x, z);
    if (a > APRON.a0 - 0.1 && a < APRON.a1 + 0.1) { const d = Math.max(APRON.r0 - rr, rr - APRON.r1); if (d < best) best = d; }
    return best;
  }
  // gentle hills: faint swells everywhere, a rolling berm along both side fences, flat near the gate and the mural wall; never on paths
  function heightAt(x, z) {
    const ax = Math.abs(x), az = Math.abs(z);
    const n = fbm(x * 0.17 + 3, z * 0.17 + 9, 5);
    const berm = smooth(13.4, 16.2, ax) * (1 - smooth(18.6, 24.4, az)) * (1 - smooth(16.6, 18.1, ax)) * (0.35 + 0.8 * n);
    const mound = Math.max(0, fbm(x * 0.085 + 40, z * 0.085 + 7, 2) - 0.36) * 0.62 * (1 - smooth(17, 22.5, az)) * (1 - smooth(14.5, 17.5, ax));
    let h = berm + mound;
    h *= smooth(0.9, 3.4, dOther(x, z)) * smooth(0.1, 1.25, dLoop(x, z));
    const w = wear(x, z); h *= 1 - 0.9 * sat(w * 1.4);
    return h;
  }
  function wear(x, z) { let w = 0; for (const s of WEAR) { const dx = (x - s.x) / s.rx, dz = (z - s.z) / s.rz, d = dx * dx + dz * dz; if (d < 1.6) w += s.k * (1 - smooth(0.3, 1.5, d)); } return sat(w); }
  return { paths, loop, pathDist, heightAt, wear, near };
}

// ---------------------------------------------------------------- the grass
function grassColor(F, x, z, h) {
  const n1 = fbm(x * 0.15, z * 0.15, 1), n2 = fbm(x * 0.55 + 20, z * 0.55, 3), n3 = fbm(x * 0.26 + 50, z * 0.26 + 10, 7);
  let c = mix(G.base, G.light, smooth(0.42, 0.72, n1) * 0.85);
  c = mix(c, G.mid, smooth(0.5, 0.8, n2) * 0.55);
  c = mix(c, G.dark, smooth(0.6, 0.82, n3) * 0.85);
  c = mix(c, G.teal, smooth(0.78, 0.95, fbm(x * 0.2 + 5, z * 0.2 + 70, 9)) * 0.55);
  c = mix(c, G.light, sat(h * 0.5));
  const pd = F.pathDist(x, z), w = F.wear(x, z);
  const worn = Math.max(1 - smooth(0.15, 2.6, pd), w);
  c = mix(c, G.dry, worn * 0.6); c = mix(c, G.dirt, Math.max((1 - smooth(0.0, 1.0, pd)) * 0.7, smooth(0.55, 1.0, w) * 0.85));
  const stripe = Math.sin((x * 0.62 + z * 0.4) * 1.25) > 0 ? 1.045 : 0.965; c = mul(c, 1 + (stripe - 1) * smooth(1.5, 3.5, pd) * (1 - 0.6 * smooth(0.3, 0.9, w)));
  const ed = Math.min(18 - Math.abs(x), 28 - Math.abs(z)); c = aoTint(c, (1 - smooth(0, 2.6, ed)) * 0.5);
  return c;
}
export function buildGroundGeo(F, S) {
  const B = new Buf({ rng: S.rand }), X0 = -18, X1 = 18, Z0 = -28, Z1 = 28, cs = 1.0, nx = Math.round((X1 - X0) / cs), nz = Math.round((Z1 - Z0) / cs);
  const vx = (i) => X0 + (i * (X1 - X0)) / nx, vz = (j) => Z0 + (j * (Z1 - Z0)) / nz, hc = [], cc = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = vx(i), z = vz(j), h = F.heightAt(x, z); hc.push(h); cc.push(grassColor(F, x, z, h)); }
  const id = (i, j) => j * (nx + 1) + i, P = (i, j) => [vx(i), hc[id(i, j)], vz(j)], C = (i, j) => cc[id(i, j)];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1), avg = (...q) => [(q[0][0] + q[1][0] + q[2][0]) / 3, (q[0][1] + q[1][1] + q[2][1]) / 3, (q[0][2] + q[1][2] + q[2][2]) / 3], jt = () => 1 + (S.rand() - 0.5) * 0.13;
    // one flat colour per facet (hand painted look); normal up: (a, d, c, b) order, diagonal alternates
    if ((i + j) % 2) { B.tri(a, d, c, mul(avg(C(i, j), C(i, j + 1), C(i + 1, j + 1)), jt())); B.tri(a, c, b, mul(avg(C(i, j), C(i + 1, j + 1), C(i + 1, j)), jt())); }
    else { B.tri(a, d, b, mul(avg(C(i, j), C(i, j + 1), C(i + 1, j)), jt())); B.tri(b, d, c, mul(avg(C(i + 1, j), C(i, j + 1), C(i + 1, j + 1)), jt())); }
  }
  return B.geometry(false);
}

// ---------------------------------------------------------------- ribbons and tiles
function ribbon(buf, cv, halfW, y, colorFn) {
  const us = [-1, -0.55, 0.55, 1], n = cv.length, last = cv.closed ? n : n - 1, pt = (c, u) => { const hw = halfW(c); return [c.x + c.tz * hw * u, y, c.z - c.tx * hw * u]; };
  for (let i = 0; i < last; i++) { const a = cv[i], b = cv[(i + 1) % n]; for (let k = 0; k < 3; k++) { const u0 = us[k], u1 = us[k + 1], c0 = colorFn(a, u0), c1 = colorFn(b, u0), c2 = colorFn(b, u1), c3 = colorFn(a, u1); buf.quad(pt(a, u0), pt(b, u0), pt(b, u1), pt(a, u1), c0, c1, c2, c3); } }
}
function ringTiles(buf, cx, cz, r0, r1, n, a0, a1, y, colorFn, gap) {
  for (let i = 0; i < n; i++) {
    const ta = a0 + ((a1 - a0) * i) / n, tb = a0 + ((a1 - a0) * (i + 1)) / n, ra = r0 + gap, rb = r1 - gap, ga = gap / ((ra + rb) / 2);
    const p = (r, a) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)], c = colorFn(i, n);
    buf.quad(p(ra, ta + ga), p(ra, tb - ga), p(rb, tb - ga), p(rb, ta + ga), mul(c, 0.96), mul(c, 0.96), c, c);
  }
}
function softDisc(buf, x, y, z, rx, rz, color, a, ry, seg) {
  seg = seg || 10; const c0 = color.concat([a]), c1 = color.concat([a * 0.55]), c2 = color.concat([0]), cs = Math.cos(ry || 0), sn = Math.sin(ry || 0);
  const p = (k, f) => { const t = (k / seg) * Math.PI * 2, lx = Math.cos(t) * rx * f, lz = Math.sin(t) * rz * f; return [x + lx * cs - lz * sn, y, z + lx * sn + lz * cs]; };
  for (let k = 0; k < seg; k++) { buf.tri([x, y, z], p(k + 1, 0.6), p(k, 0.6), c0, c1, c1); buf.quad(p(k, 0.6), p(k + 1, 0.6), p(k + 1, 1), p(k, 1), c1, c1, c2, c2); }
}
export { softDisc };

// ---------------------------------------------------------------- paths, plaza, track, street
export function buildFlats(F, S) {
  const OV = S.OV, R = S.rand, SOFT = S.SOFT;
  // jogging track (lowest layer)
  const trackY = 0.012;
  ribbon(OV, F.loop, () => LOOP_W / 2, trackY, (c, u) => { const nz = vnoise(c.s * 0.35, 4 + (u > 0 ? 3 : 0), 3), b = mix(TRACK[1], TRACK[2], smooth(0.3, 0.8, nz)); return mix(mix(b, TRACK[0], 0.25 * (1 - Math.abs(u))), TRACK_EDGE, smooth(0.7, 1, Math.abs(u)) * 0.6); });
  // lane lines: two edge lines and a dashed centre line
  const lane = (off, w, dash) => { const cv = F.loop, n = cv.length; for (let i = 0; i < n; i++) { if (dash && Math.floor(cv[i].s / 1.1) % 2) continue; const a = cv[i], b = cv[(i + 1) % n], pt = (c, o) => [c.x + c.tz * o, trackY + 0.003, c.z - c.tx * o], k = 0.94 + R() * 0.06, c = mul(LINE, k); OV.quad(pt(a, off - w), pt(b, off - w), pt(b, off + w), pt(a, off + w), c); } };
  lane(-1.42, 0.05, false); lane(1.42, 0.05, false); lane(0, 0.04, true);
  // checkered start line at the run start (12.4, 14)
  { let best = null, bd = 1e9; F.loop.forEach((c) => { const d = Math.hypot(c.x - 12.4, c.z - 14); if (d < bd) { bd = d; best = c; } }); S.runStartSample = best;
    const c = best, cols = 8, rows = 2, cw = (LOOP_W - 0.5) / cols, rh = 0.34; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const u0 = -(LOOP_W - 0.5) / 2 + i * cw, u1 = u0 + cw, s0 = (j - 1) * rh, s1 = s0 + rh, P = (u, s) => [c.x + c.tz * u + c.tx * s, trackY + 0.004, c.z - c.tx * u + c.tz * s], on = (i + j) % 2 === 0; OV.quad(P(u0, s0), P(u0, s1), P(u1, s1), P(u1, s0), on ? col('#F1E5CE') : col('#3b3350')); } }
  // sand paths, each on its own height so junctions never z-fight
  F.paths.forEach((p, idx) => {
    const y = 0.016 + (F.paths.length - 1 - idx) * 0.0022, seed = 10 + idx * 7; p.y = y;
    ribbon(OV, p.cv, (c) => (p.w / 2) * (1 + 0.1 * (vnoise(c.s * 0.7, seed, 4) - 0.5)), y, (c, u) => {
      const n = vnoise(c.s * 0.5, seed + 3, 5) , base = mix(SAND[0], SAND[1], smooth(0.3, 0.7, n)), wob = vnoise(c.s * 0.25 + 3, u * 2, 8);
      let k = mix(base, SAND[2], smooth(0.55, 0.9, wob) * 0.6 * (1 - Math.abs(u))); k = mix(k, SAND_EDGE, smooth(0.5, 1, Math.abs(u)) * 0.85); return k;
    });
    // pebbles and scuffs
    const len = p.cv.len, cnt = Math.round(len * 5);
    for (let k = 0; k < cnt; k++) { const s = R() * len, i = Math.min(p.cv.length - 1, Math.floor((s / len) * (p.cv.length - 1))), c = p.cv[i], u = (R() - 0.5) * 1.7 * (p.w / 2), sz = 0.04 + R() * 0.08, x = c.x + c.tz * u, z = c.z - c.tx * u, a = R() * 6.28, cc = R() < 0.55 ? mul(SAND_DARK, 0.9 + R() * 0.3) : mul(SAND[2], 1.05);
      OV.tri([x + Math.cos(a) * sz, y + 0.0015, z + Math.sin(a) * sz], [x + Math.cos(a + 2.4) * sz * 0.8, y + 0.0015, z + Math.sin(a + 2.4) * sz * 0.8], [x + Math.cos(a + 4.1) * sz * 0.9, y + 0.0015, z + Math.sin(a + 4.1) * sz * 0.9], cc); }
  });
  // plaza paving: dark joint underlay + fanned tiles in warm sand, rose and lavender, inlay ring of small coloured diamonds
  const PY = 0.03, pr = PLAZA.r, cx = PLAZA.x, cz = PLAZA.z, under = col('#A59AB0');
  { const seg = 48; for (let k = 0; k < seg; k++) { const a = (k / seg) * 6.2832, b = ((k + 1) / seg) * 6.2832; OV.tri([cx, PY - 0.002, cz], [cx + pr * Math.cos(b), PY - 0.002, cz + pr * Math.sin(b)], [cx + pr * Math.cos(a), PY - 0.002, cz + pr * Math.sin(a)], under); } }
  const rings = [[3.2, 4.35, 22], [4.35, 5.5, 30], [5.5, 6.55, 38], [6.55, 7.5, 44]], PAL = [col('#DCC4A4'), col('#CDB8B6'), col('#B9B0C6'), col('#E4D2B4'), col('#C3B3BD')];
  rings.forEach((rg, ri) => { ringTiles(OV, cx, cz, rg[0], rg[1], rg[2], 0 + (ri % 2) * 0.07, Math.PI * 2 + (ri % 2) * 0.07, PY, (i) => { const n = vnoise(i * 1.7 + ri * 9, ri, 6); let c = PAL[Math.floor(R() * PAL.length)]; if (ri === 3) c = mix(c, col('#E8D6B8'), 0.4); const d = (Math.hypot(0, 0) , 0); return mul(mix(c, PAL[(i + ri) % PAL.length], 0.35), 0.93 + n * 0.14); }, 0.03); });
  // inlay: ring of little diamonds (pink / teal / yellow) between ring 2 and 3
  { const n = 36, rr = 5.5, acc = [col('#E4709F'), col('#4FC1C6'), col('#F0C95E')]; for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832 + 0.05, p = (dr, da) => [cx + (rr + dr) * Math.cos(a + da), PY + 0.003, cz + (rr + dr) * Math.sin(a + da)], c = acc[i % 3]; OV.quad(p(-0.2, 0), p(0, 0.05), p(0.2, 0), p(0, -0.05), c); } }
  // seating apron: the same paving continues as a crescent for the benches
  { const a0 = APRON.a0, a1 = APRON.a1, rs = [[7.5, 8.7, 0], [8.7, 9.85, 0], [9.85, 10.9, 0]];
    rs.forEach((rg, ri) => { const arc = ((rg[0] + rg[1]) / 2) * (a1 - a0), n = Math.round(arc / 1.15); ringTiles(OV, cx, cz, rg[0], rg[1], n, a0 + (ri % 2) * 0.05, a1 + (ri % 2) * 0.05, PY, (i) => mul(mix(PAL[Math.floor(R() * PAL.length)], PAL[2], 0.3), 0.93 + R() * 0.13), 0.03); });
    const seg = 24; for (let k = 0; k < seg; k++) { const a = a0 + ((a1 - a0) * k) / seg, b = a0 + ((a1 - a0) * (k + 1)) / seg, p = (r, t) => [cx + r * Math.cos(t), PY - 0.002, cz + r * Math.sin(t)]; OV.quad(p(7.5, a), p(7.5, b), p(10.9, b), p(10.9, a), under); } }
  // mural apron: paving in front of the wall with spray splats on it
  { const x0 = -7.6, z0 = -25.45, cw = 0.8, rw = 0.84, cols = 19, rows = 3, ya = 0.031; OV.quad([x0, ya - 0.002, z0 + rows * rw], [x0 + cols * cw, ya - 0.002, z0 + rows * rw], [x0 + cols * cw, ya - 0.002, z0], [x0, ya - 0.002, z0], under);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const xo = (j % 2) * 0.4, xa = x0 + i * cw + xo + 0.025, xb = xa + cw - 0.05, za = z0 + j * rw + 0.025, zb = za + rw - 0.05; if (xb > x0 + cols * cw) continue; const c = mul(PAL[Math.floor(R() * PAL.length)], 0.92 + R() * 0.14); OV.quad([xa, ya, zb], [xb, ya, zb], [xb, ya, za], [xa, ya, za], mul(c, 0.97), mul(c, 0.97), c, c); }
    const neon = [col('#FF4F8B'), col('#29D3C7'), col('#FFD23F'), col('#9B7BFF')]; for (let k = 0; k < 16; k++) { const cx = -6 + R() * 12, cz = -25 + R() * 2.0, r = 0.08 + R() * 0.22, c = neon[(R() * 4) | 0], n = 8, pts = []; for (let q = 0; q < n; q++) { const a = (q / n) * 6.2832, rr = r * (0.6 + R() * 0.7) * (q % 2 ? 1 : 1.4); pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.8]); } OV.poly(pts, ya + 0.003 + k * 0.0001, mul(c, 0.95)); }
  }
  // flyers apron: a small round paved patch of two tile rings
  { const x = 4.1, z = 22.2; const sq = (r0, r1, n, rot) => ringTiles(OV, x, z, r0, r1, n, rot, rot + Math.PI * 2, 0.034, () => mul(PAL[Math.floor(R() * PAL.length)], 0.94 + R() * 0.12), 0.03); sq(0.7, 1.35, 10, 0.2); sq(1.35, 2.05, 15, 0.5);
    const seg = 10; for (let k = 0; k < seg; k++) { const a = (k / seg) * 6.2832, b = ((k + 1) / seg) * 6.2832; OV.tri([x, 0.034, z], [x + 0.72 * Math.cos(b), 0.034, z + 0.72 * Math.sin(b)], [x + 0.72 * Math.cos(a), 0.034, z + 0.72 * Math.sin(a)], mul(PAL[k % PAL.length], 0.96)); }
    const seg2 = 24; for (let k = 0; k < seg2; k++) { const a = (k / seg2) * 6.2832, b = ((k + 1) / seg2) * 6.2832; OV.tri([x, 0.031, z], [x + 2.06 * Math.cos(b), 0.031, z + 2.06 * Math.sin(b)], [x + 2.06 * Math.cos(a), 0.031, z + 2.06 * Math.sin(a)], under); } }
  // busking spot: pale lit worn patch (clean ground, radius 2.5), soft dusty rim
  { const x = 8, z = -8, seg = 28, pale = col('#F0DEBB'), pale2 = col('#E3CC9E'), rim = col('#C9BB84'); const rr = (k, f) => f * (1 + 0.045 * Math.sin(k * 0.45 + 0.7) + 0.035 * Math.sin(k * 0.95 + 2.1)), p = (k, f) => { const a = (k / seg) * 6.2832; return [x + rr(k, f) * Math.cos(a), 0.036, z + rr(k, f) * Math.sin(a)]; };
    for (let k = 0; k < seg; k++) { const n = vnoise(k * 0.7, 3, 4); OV.tri([x, 0.036, z], p(k + 1, 1.2), p(k, 1.2), mul(pale, 1.03)); OV.quad(p(k, 1.2), p(k + 1, 1.2), p(k + 1, 2.1), p(k, 2.1), mul(pale, 0.99), mul(pale, 0.99), mix(pale2, SAND[0], 0.3 + n * 0.3), mix(pale2, SAND[0], 0.3 + n * 0.3)); OV.quad(p(k, 2.1), p(k + 1, 2.1), p(k + 1, 2.7), p(k, 2.7), mix(pale2, SAND[0], 0.3 + n * 0.3), mix(pale2, SAND[0], 0.3 + n * 0.3), mix(rim, G.dry, 0.5 + n * 0.3), mix(rim, G.dry, 0.5 + n * 0.3)); } }

  // contact shadows (soft violet blobs) are added by the props; here the street
  buildStreet(S);
}

// ---------------------------------------------------------------- the world outside the fence
function buildStreet(S) {
  const O = S.OUT, R = S.rand; const q = (x0, z0, x1, z1, y, c0, c1) => O.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c0, c0, c1 || c0, c1 || c0);
  const far = col('#4F8A55'), farHaze = col('#7C9A6E'), grassIn = col('#3C7448');
  // meadow around (below the park ground)
  q(-18, -90, 18, -28, -0.04, grassIn);
  // rolling backdrop hills beyond the side fences (coarse height field, painted toward the haze with distance)
  { const cs = 4, xs = 18, xe = 66, zs = -66, ze = 28, hh = (x, z) => { const ax = Math.abs(x), t = smooth(18, 30, ax); return t * (1.2 + 5.5 * fbm(ax * 0.05 + 3, z * 0.045 + 9, 11) + 2.5 * smooth(40, 66, ax)); };
    const colAt = (x, z, h) => { const ax = Math.abs(x), n = fbm(x * 0.12, z * 0.12, 21); let c = mix(grassIn, col('#6FA24E'), smooth(0.35, 0.7, n) * 0.8); c = mix(c, col('#8FAE62'), sat(h * 0.12)); return mix(c, farHaze, smooth(26, 66, ax) * 0.75); };
    [-1, 1].forEach((sd) => { for (let zi = zs; zi < ze; zi += cs) for (let xi = xs; xi < xe; xi += cs) { const P = (a, b) => { const x = sd * a, hz = hh(x, b); return [x, -0.04 + hz, b, colAt(x, b, hz)]; }, p00 = P(xi, zi), p10 = P(xi + cs, zi), p11 = P(xi + cs, zi + cs), p01 = P(xi, zi + cs); const V = (p) => [p[0], p[1], p[2]]; const t = (k) => mul(k, 0.95 + R() * 0.1);
        // normal up for sd>0: (p00, p01, p11) order; flip for the mirrored side
        if (sd > 0) { O.tri(V(p00), V(p01), V(p11), t(p00[3]), t(p01[3]), t(p11[3])); O.tri(V(p00), V(p11), V(p10), t(p00[3]), t(p11[3]), t(p10[3])); } else { O.tri(V(p00), V(p11), V(p01), t(p00[3]), t(p11[3]), t(p01[3])); O.tri(V(p00), V(p10), V(p11), t(p00[3]), t(p10[3]), t(p11[3])); } } });
  }
  // sidewalk, kerb, road with centre dashes, zebra crossing at the gate
  const SW = [col('#CDBFC0'), col('#C0B3BB')];
  for (let i = 0; i < 40; i++) { const x0 = -60 + i * 3, c = SW[i % 2]; q(x0, 28, x0 + 3, 31.4, -0.02, mul(c, 0.96 + R() * 0.07)); }
  q(-60, 31.2, 60, 31.55, 0.05, col('#9F94AC')); O.quad([60, 0.05, 31.55], [-60, 0.05, 31.55], [-60, -0.03, 31.55], [60, -0.03, 31.55], col('#837895'));
  q(-60, 31.55, 60, 40, -0.03, col('#4C4562'), col('#554D6C'));
  for (let i = 0; i < 18; i++) { const x0 = -60 + i * 7; q(x0, 35.5, x0 + 3.2, 35.75, -0.025, col('#E7C877')); }
  q(-60, 31.9, 60, 32.0, -0.025, col('#B9B0C4')); q(-60, 39.4, 60, 39.5, -0.025, col('#B9B0C4'));
  for (let i = 0; i < 8; i++) { const x0 = -3.2 + i * 0.8; q(x0, 32.4, x0 + 0.45, 38.8, -0.022, col('#E9DFD0')); }
  q(-60, 40, 60, 43.5, -0.02, col('#C5B8BD')); q(-60, 43.5, 60, 90, -0.04, farHaze, far);
}

// ---------------------------------------------------------------- stone edging along the sand paths (merged into the solid mesh)
export function buildKerbs(F, S) {
  const B = S.B, R = S.rand, cols = [col('#B9B0BE'), col('#A89FB6'), col('#C4B9C2'), col('#B1A8A0')], h = 0.085, hw = 0.11, mossy = col('#6E9A5C');
  B.gy = 0;
  F.paths.forEach((p) => {
    if (!p.kerb) return; const cv = p.cv, n = cv.length;
    [-1, 1].forEach((side) => {
      for (let i = 0; i + 2 < n; i += 2) {
        const a = cv[i], b = cv[i + 2], m = cv[i + 1], off = p.w / 2 + 0.14, mx = m.x + side * m.tz * off, mz = m.z - side * m.tx * off;
        if (F.paths.some((q) => q !== p && distToSamples(mx, mz, q.cv) < q.w / 2 + 0.45) || distToSamples(mx, mz, F.loop) < LOOP_W / 2 + 0.4 || Math.hypot(mx, mz) < PLAZA.r + 0.5 || Math.hypot(mx - 8, mz + 8) < 3.1 || Math.hypot(mx - 4.1, mz - 22.2) < 2.3) continue;
        const ang = Math.atan2(mz, mx), aa = ang < 0 ? ang + 6.2832 : ang; if (aa > APRON.a0 - 0.15 && aa < APRON.a1 + 0.15 && Math.hypot(mx, mz) < APRON.r1 + 0.6) continue;
        const P = (c, u, y) => [c.x + side * c.tz * (off + u) , y, c.z - side * c.tx * (off + u)];
        const c0 = mix(cols[(R() * 4) | 0], mossy, R() < 0.12 ? 0.35 : 0), hi = mul(c0, 1.08), lo = aoTint(c0, 0.22), g = 0.03; const aT = { x: a.x + a.tx * g, z: a.z + a.tz * g, tx: a.tx, tz: a.tz }, bT = { x: b.x - b.tx * g, z: b.z - b.tz * g, tx: b.tx, tz: b.tz };
        // top (normal up) uses a right-hand ordering that depends on the side; flip accordingly
        const top = [P(aT, -hw, h), P(bT, -hw, h), P(bT, hw, h), P(aT, hw, h)];
        if (side > 0) B.quad(top[0], top[1], top[2], top[3], hi); else B.quad(top[3], top[2], top[1], top[0], hi);
        const face = (u, up) => { const q0 = P(aT, u, 0), q1 = P(bT, u, 0), q2 = P(bT, u, h), q3 = P(aT, u, h); return up ? [q0, q1, q2, q3] : [q1, q0, q3, q2]; };
        const o = side > 0 ? [face(hw, true), face(-hw, false)] : [face(hw, false), face(-hw, true)];
        // outer face is away from the path (u = +hw when side>0 means further out for side>0)
        B.quad(o[0][0], o[0][1], o[0][2], o[0][3], lo, lo, hi, hi); B.quad(o[1][0], o[1][1], o[1][2], o[1][3], lo, lo, hi, hi);
      }
    });
  });
}
