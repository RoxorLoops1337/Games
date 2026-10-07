// Flat3D shell (Interior Artist): slab and plinth, wood / tile / carpet floors, the four walls (north and west full height, south and east cut low for the dollhouse view),
// skirting, picture rail, windows with frames, glass, curtains and blinds, the front door, the access walkway outside, the half wall of the bedroom.
import { P, FLAT, wallFace, wallCells, col, mix, mul, aoTint, fbm, vnoise, bar } from './flat_kit.js';

const H = FLAT.wallH, LOW = FLAT.lowH, T = FLAT.thick;
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// wall frames: u runs along d, n is the inward normal. pt(u, off) is a floor point, off > 0 into the room
function frame(name, ox, oz, dx, dz, len) { const nx = -dz, nz = dx, ry = Math.atan2(-dz, dx); return { name, ox, oz, dx, dz, nx, nz, len, ry, pt(u, off) { return [ox + dx * u + nx * (off || 0), oz + dz * u + nz * (off || 0)]; } }; }
export const WALLS = { N: frame('N', -7.5, -5.5, 1, 0, 15), W: frame('W', -7.5, 5.5, 0, -1, 11), S: frame('S', 7.5, 5.5, -1, 0, 15), E: frame('E', 7.5, -5.5, 0, 1, 11) };
// box on a wall: u centre along the wall, off centre depth from the inner face (into the room), y0 base, w along the wall, h, dep
export function wbox(B, f, u, off, y0, w, h, dep, color, o) { const p = f.pt(u, off); B.box(p[0], y0, p[1], w, h, dep, color, Object.assign({ ry: f.ry }, o || {})); }
export const toWorld = (f, u, off) => f.pt(u, off);

// windows: wall, centre u (along the wall), width, bottom y, height
export const WINDOWS = [
  { wall: 'N', u: 7.5 - 0.25, w: 1.7, y0: 1.1, h: 1.25, name: 'desk', style: 'blind' },
  { wall: 'N', u: 7.5 + 3.4, w: 1.25, y0: 1.3, h: 1.0, name: 'kitchen', style: 'cafe' },
  { wall: 'W', u: 5.5 - 3.15, w: 1.4, y0: 1.05, h: 1.35, name: 'bed', style: 'curtain' },
];
const DOOR = { u0: 1.45, u1: 2.55 };

export function buildShell(S) {
  const B = S.B, GL = S.GLASS, R = S.rand;
  // ---------------------------------------------------------------- slab, plinth and the building body below the flat
  const slabC = col('#9a8fa8');
  B.box(0, -0.55, 0, 15.56, 0.55, 11.56, slabC, { base: 0.1, tint: 0.03, top: mix(slabC, P.cream, 0.2), bottom: true });
  // lower storey (mist fades to violet): exterior faces of south and east only matter
  const lower = (a, b, nrm) => wallFace(B, a, b, nrm, 3.4, (u, v, uc, vc) => { const brick = P.brick[((Math.floor(uc / 0.5) + Math.floor(vc / 0.5) * 3) % 4 + 4) % 4]; const mist = sm(0.0, 3.4, 3.4 - v) * 0.0; return mix(aoTint(mul(brick, 0.9), 0.35), col('#7a5a96'), 0.18 + 0.55 * (1 - sm(0, 3.4, v))); }, { y0: -3.95, stepU: 0.6, vBreaks: [0.8, 1.6, 2.4] });
  lower([-7.78, 5.78], [7.78, 5.78], [0, 1]); lower([7.78, 5.78], [7.78, -5.78], [1, 0]);
  // dark windows of the flat below (a few)
  [[-4.5, 5.79], [-1.5, 5.79], [2.0, 5.79], [6.5, 5.79]].forEach(([x, z]) => B.box(x, -3.1, z - 0.01, 1.1, 1.2, 0.04, col('#3b2d52'), { base: 0, tint: 0.1 })); [[7.79, -3.0], [7.79, 0.4], [7.79, 3.4]].forEach(([x, z]) => B.box(x - 0.01, -3.1, z, 0.04, 1.2, 1.1, col('#3b2d52'), { base: 0, tint: 0.1 }));

  // ---------------------------------------------------------------- floors
  const wallAO = (x, z) => { // violet contact shade near the tall walls, a little near the low ones
    let k = 0; k += 0.42 * (1 - sm(0, 0.9, z + 5.5)); k += 0.42 * (1 - sm(0, 0.9, x + 7.5)); k += 0.2 * (1 - sm(0, 0.6, 5.5 - z)); k += 0.2 * (1 - sm(0, 0.6, 7.5 - x)); return Math.min(0.75, k);
  };
  const grime = (x, z) => { const n = fbm(x * 0.7, z * 0.7, 5); return 1 - 0.14 * sm(0.45, 0.8, n); };
  // underlay (the dark seams between the planks)
  B.poly([[-7.5, -5.5], [-7.5, 5.5], [7.5, 5.5], [7.5, -5.5]], -0.004, col('#4a3040'));
  // planks run east-west, 0.22 wide
  const ROW = 0.22; let zRow = 0;
  for (let z = -5.5; z < 5.5 - 0.01; z += ROW) {
    const z1 = Math.min(5.5, z + ROW - 0.012); let x = -7.5 - R() * 1.2; zRow++;
    while (x < 7.5) {
      const len = 1.3 + R() * 1.9, xa = Math.max(-7.5, x), xb = Math.min(7.5, x + len - 0.012); x += len; if (xb - xa < 0.05) continue;
      const base = mix(P.wood[(R() * 4) | 0], P.wood[(R() * 4) | 0], R()), tn = 0.93 + R() * 0.14;
      const nseg = Math.max(1, Math.round((xb - xa) / 0.7));
      for (let s = 0; s < nseg; s++) {
        const xs = xa + (xb - xa) * s / nseg, xe = xa + (xb - xa) * (s + 1) / nseg;
        const cc = (px, pz) => { const g = grime(px, pz), k = wallAO(px, pz); return aoTint(mul(base, tn * g), k); };
        B.quad([xs, 0, z], [xs, 0, z1], [xe, 0, z1], [xe, 0, z], cc(xs, z), cc(xs, z1), cc(xe, z1), cc(xe, z));
      }
    }
  }
  // flat floor patches (tile, carpet): grid of vertex coloured cells raised a little, with an edge skirt
  const patch = (x0, z0, x1, z1, y, step, colorFn, edge) => {
    const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz; const c = colorFn(xa, za, xb, zb, i, j); B.quad([xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za], c[0], c[1], c[2], c[3]); }
    if (edge) { const e = edge; const ring = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]; ring.forEach(([ax, az, bx, bz]) => { B.quad([ax, 0, az], [bx, 0, bz], [bx, y, bz], [ax, y, az], mul(e, 0.6)); B.quad([ax, 0, az], [ax, y, az], [bx, y, bz], [bx, 0, bz], mul(e, 0.6)); }); }
  };
  // kitchen tile (teal and cream checker, 0.5 m), grimy grout feel by darker edges
  const KT = { x0: 1.7, x1: 5.45, z0: -5.5, z1: -0.4 };
  patch(KT.x0, KT.z0, KT.x1, KT.z1, 0.012, 0.5, (xa, za, xb, zb, i, j) => { const ch = (i + j) % 2 === 0, b = ch ? P.tealL : P.cream, c = (x, z) => aoTint(mul(mix(b, ch ? P.teal : P.creamD, 0.2), grime(x, z)), wallAO(x, z) * 1.1); return [c(xa, za), c(xa, zb), c(xb, zb), c(xb, za)]; }, P.creamD);
  // threshold strip between tile and wood
  B.box((KT.x0 + KT.x1) / 2, 0, KT.z1, KT.x1 - KT.x0, 0.02, 0.06, P.woodL, { base: 0 }); B.box(KT.x0, 0, (KT.z0 + KT.z1) / 2, 0.06, 0.02, KT.z1 - KT.z0, P.woodL, { base: 0 });
  // bedroom carpet
  const BR = { x0: -7.5, x1: -3.6, z0: 1.6, z1: 5.5 };
  patch(BR.x0, BR.z0, BR.x1, BR.z1, 0.022, 0.55, (xa, za, xb, zb, i, j) => { const b = mix(col('#a49cd6'), col('#c4a6d8'), vnoise(i * 0.7, j * 0.7, 3)), c = (x, z) => aoTint(mul(b, grime(x, z)), wallAO(x, z) * 0.9); return [c(xa, za), c(xa, zb), c(xb, zb), c(xb, za)]; }, col('#8a80b8'));
  // entry tile (dark slate with cream checker)
  const ET = { x0: 4.15, x1: 7.5, z0: 3.3, z1: 5.5 };
  patch(ET.x0, ET.z0, ET.x1, ET.z1, 0.012, 0.55, (xa, za, xb, zb, i, j) => { const ch = (i + j) % 2 === 0, b = ch ? col('#6a5a82') : col('#c9b79a'), c = (x, z) => aoTint(mul(b, grime(x, z) * 0.98), wallAO(x, z)); return [c(xa, za), c(xa, zb), c(xb, zb), c(xb, za)]; }, P.slabD);
  B.box((ET.x0 + ET.x1) / 2, 0, ET.z0, ET.x1 - ET.x0, 0.02, 0.06, P.woodL, { base: 0 }); B.box(ET.x0, 0, (ET.z0 + ET.z1) / 2, 0.06, 0.02, ET.z1 - ET.z0, P.woodL, { base: 0 });
  // booth floor (ink rubber tiles with a magenta edge)
  const BF = { x0: 5.45, x1: 7.5, z0: -5.5, z1: -3.25 };
  patch(BF.x0, BF.z0, BF.x1, BF.z1, 0.012, 0.5, (xa, za, xb, zb, i, j) => { const b = (i + j) % 2 ? col('#3b3354') : col('#332c4a'), c = (x, z) => aoTint(b, wallAO(x, z) * 0.6); return [c(xa, za), c(xa, zb), c(xb, zb), c(xb, za)]; }, P.pink);

  // ---------------------------------------------------------------- wall colour logic
  const zoneN = (x) => (x < -1.75 ? 'liv' : x < 1.7 ? 'desk' : 'kit');
  const wallBase = { liv: P.plum, livL: P.plumL, livD: P.plumD, desk: P.teal, deskD: P.tealD, kit: P.sage, kitD: P.sageD, bed: P.indigo, bedL: P.indigoL };
  const stripe = (u) => (Math.floor(u / 0.25) % 2 === 0 ? 1 : 0.94);
  // north wall inner face (visible to the camera)
  const North = (u, v, uc, vc) => {
    const xc = uc - 7.5, x = u - 7.5, z = zoneN(xc); let b;
    if (z === 'liv') b = vc < 0.95 ? mix(P.plumD, P.plum, 0.35) : mul(P.plum, stripe(uc) * (1.0 + 0.04 * Math.sin(uc * 9)));
    else if (z === 'desk') b = vc < 0.95 ? mul(P.tealD, 1.0) : mul(P.teal, 1.0);
    else if (vc > 0.9 && vc < 1.5) b = ((Math.floor(uc / 0.15) + Math.floor(vc / 0.15)) % 2 ? P.cream : mix(P.cream, P.mustard, 0.18)); else b = vc < 0.9 ? P.sageD : P.sage;
    if (vc < 0.12) b = P.cream; if (Math.abs(vc - 0.95) < 0.0) b = P.cream;
    const k = 0.4 * (1 - sm(0, 0.5, v)) * (vc < 0.2 ? 0.3 : 1) + 0.28 * sm(H - 0.7, H, v) + 0.35 * (1 - sm(0, 0.45, u)) + 0.35 * (1 - sm(0, 0.45, 15 - u)) + 0.1 * sm(0.35, 0.8, fbm(uc * 1.3, vc * 1.3, 8));
    return aoTint(b, Math.min(0.8, k));
  };
  const West = (u, v, uc, vc) => { // u from the south end (z = 5.5) going north
    const zc = 5.5 - uc; let b; const bed = zc > 1.6;
    if (bed) b = vc < 0.95 ? mix(P.indigo, P.plumD, 0.3) : mul(P.indigoL, stripe(uc) * 0.9 + 0.1); else b = vc < 0.95 ? mix(P.plumD, P.plum, 0.35) : mul(P.plum, stripe(uc) * (1.0 + 0.04 * Math.sin(uc * 9)));
    if (vc < 0.12) b = P.cream;
    const k = 0.4 * (1 - sm(0, 0.5, v)) * (vc < 0.2 ? 0.3 : 1) + 0.28 * sm(H - 0.7, H, v) + 0.35 * (1 - sm(0, 0.45, u)) + 0.35 * (1 - sm(0, 0.45, 11 - u)) + 0.1 * sm(0.35, 0.8, fbm(uc * 1.3, vc * 1.3, 18));
    return aoTint(b, Math.min(0.8, k));
  };
  const holesFor = (wn, scale) => WINDOWS.filter((w) => w.wall === wn).map((w) => ({ u0: w.u - w.w / 2, u1: w.u + w.w / 2, v0: w.y0, v1: w.y0 + w.h }));
  const vb = [0.12, 0.95, 1.0, 2.55];
  wallFace(B, WALLS.N.pt(0, 0), WALLS.N.pt(15, 0), [0, 1], H, North, { stepU: 0.25, vBreaks: vb.concat([0.9, 1.05, 1.2, 1.35, 1.5]), holes: holesFor('N') });
  wallFace(B, WALLS.W.pt(0, 0), WALLS.W.pt(11, 0), [1, 0], H, West, { stepU: 0.25, vBreaks: vb, holes: holesFor('W') });
  // low south wall inner face (plaster) and east wall inner face
  const lowIn = (len) => (u, v, uc, vc) => { const b = vc < 0.12 ? P.cream : mix(P.cream, P.creamD, 0.35 + 0.2 * Math.sin(uc * 3)); return aoTint(b, Math.min(0.7, 0.35 * (1 - sm(0, 0.4, v)) + 0.3 * (1 - sm(0, 0.4, u)) + 0.3 * (1 - sm(0, 0.4, len - u)))); };
  wallFace(B, WALLS.S.pt(0, 0), WALLS.S.pt(15, 0), [0, -1], LOW, lowIn(15), { stepU: 0.5, vBreaks: [0.12], holes: [{ u0: DOOR.u0, u1: DOOR.u1, v0: -1, v1: LOW + 1 }] });
  wallFace(B, WALLS.E.pt(0, 0), WALLS.E.pt(11, 0), [-1, 0], LOW, lowIn(11), { stepU: 0.5, vBreaks: [0.12] });
  // ---------------------------------------------------------------- exterior faces: brick for south and east (the camera sees these), plaster for north and west
  const outer = T + FLAT.maxZ;
  const brick = (a, b, nrm, y0, top) => { const rows = []; for (let y = 0; y + 0.09 <= top - y0 + 1e-6; y += 0.103) rows.push([y, y + 0.09]); wallCells(B, a, b, nrm, (uc, vc, row, u0) => { const k = (Math.floor(uc / 0.28) * 7 + row * 13) % 4; const base = P.brick[(k + 4) % 4], wob = 0.88 + 0.22 * vnoise(uc * 2.1, vc * 5, 12); return mul(aoTint(base, 0.1 + 0.3 * (1 - sm(0, 0.5, vc + y0))), wob); }, { y0, rows, cell: 0.28, offset: true, gap: 0.014 }); };
  // mortar backing so gaps read as mortar
  const mort = col('#b89a86');
  B.box(0, -0.55, 5.76, 15.56, LOW + 0.55, 0.03, mort, { base: 0, tint: 0.02 }); B.box(7.76, -0.55, 0, 0.03, LOW + 0.55, 11.1, mort, { base: 0, tint: 0.02 });
  brick([-7.78, 5.79], [7.78, 5.79], [0, 1], -0.55, LOW); brick([7.79, 5.5], [7.79, -5.5], [1, 0], -0.55, LOW);
  // end caps of the north and south walls
  [-1, 1].forEach((sx) => { B.quad([sx * 7.78, -0.55, -5.78], [sx * 7.78, H, -5.78], [sx * 7.78, H, -5.5], [sx * 7.78, -0.55, -5.5], mix(P.creamD, col('#7a5a96'), 0.2)); });
  const plaster = (u, v, uc, vc) => aoTint(mix(col('#c9a98c'), col('#b49ab4'), 0.3 + 0.2 * vnoise(uc * 0.8, vc * 0.8, 31)), 0.18 * (1 - sm(0, 1, v)));
  const outerHoles = (wn) => WINDOWS.filter((w) => w.wall === wn).map((w) => { const c = wn === 'N' ? 15.28 - w.u : 11.0 + 0.0 - (w.u - 0) + 0.0; return { u0: c - w.w / 2, u1: c + w.w / 2, v0: w.y0 + 0.55 + 0, v1: w.y0 + w.h + 0.55 }; });
  // north outer face at z = -5.78 going -x ; west outer face at x = -7.78 going +z (u from z = -5.5)
  wallFace(B, [7.78, -5.78], [-7.78, -5.78], [0, -1], H + 0.55, plaster, { y0: -0.55, stepU: 1.0, holes: outerHoles('N') });
  wallFace(B, [-7.78, -5.5], [-7.78, 5.5], [-1, 0], H + 0.55, plaster, { y0: -0.55, stepU: 1.0, holes: WINDOWS.filter((w) => w.wall === 'W').map((w) => { const c = 5.5 - w.u + 5.5 - 0 - 5.5 + 0; const zc = 5.5 - w.u; const uu = zc + 5.5; return { u0: uu - w.w / 2, u1: uu + w.w / 2, v0: w.y0 + 0.55, v1: w.y0 + w.h + 0.55 }; }) });
  // ---------------------------------------------------------------- caps (cut section: light cream)
  const cap = mix(P.cream, col('#fff2dc'), 0.4), capD = mix(P.creamD, P.cream, 0.5);
  B.quad([-7.78, H, -5.78], [-7.78, H, -5.5], [7.78, H, -5.5], [7.78, H, -5.78], cap); B.quad([-7.78, H, -5.5], [-7.78, H, 5.5], [-7.5, H, 5.5], [-7.5, H, -5.5], cap);
  const segsS = [[-7.78, WALLS.S.pt(DOOR.u1, 0)[0]], [WALLS.S.pt(DOOR.u0, 0)[0], 7.78]]; segsS.forEach(([x0, x1]) => B.quad([x0, LOW, 5.5], [x0, LOW, 5.78], [x1, LOW, 5.78], [x1, LOW, 5.5], cap));
  B.quad([7.5, LOW, -5.5], [7.5, LOW, 5.5], [7.78, LOW, 5.5], [7.78, LOW, -5.5], cap); void capD;
  // ---------------------------------------------------------------- skirting, chair rail, cornice
  const skirt = mix(P.cream, P.creamD, 0.25);
  wbox(B, WALLS.N, 7.5, 0.02, 0, 15, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 }); wbox(B, WALLS.W, 5.5, 0.02, 0, 11, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 }); wbox(B, WALLS.E, 5.5, 0.02, 0, 11, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 });
  wbox(B, WALLS.S, DOOR.u0 / 2, 0.02, 0, DOOR.u0, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 }); wbox(B, WALLS.S, (DOOR.u1 + 15) / 2, 0.02, 0, 15 - DOOR.u1, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 });
  const rail = col('#e6cfa8'); wbox(B, WALLS.N, 2.9, 0.02, 0.94, 5.8, 0.045, 0.035, rail, { base: 0.1 }); wbox(B, WALLS.W, 5.5, 0.02, 0.94, 11, 0.045, 0.035, rail, { base: 0.1 });
  const corn = mix(P.mustardD, P.woodL, 0.3); wbox(B, WALLS.N, 7.5, 0.03, H - 0.09, 15, 0.09, 0.07, corn, { base: 0.1, tint: 0.03 }); wbox(B, WALLS.W, 5.5, 0.03, H - 0.09, 11, 0.09, 0.07, corn, { base: 0.1, tint: 0.03 });

  // ---------------------------------------------------------------- windows
  WINDOWS.forEach((w) => {
    const f = WALLS[w.wall], u0 = w.u - w.w / 2, u1 = w.u + w.w / 2, y0 = w.y0, y1 = w.y0 + w.h, wood = mix(P.cream, P.woodL, 0.25), inner = mix(P.cream, P.creamD, 0.4);
    // reveals through the wall thickness
    const p = (u, off, y) => { const q = f.pt(u, off); return [q[0], y, q[1]]; };
    B.quad(p(u0, 0, y0), p(u0, -T, y0), p(u1, -T, y0), p(u1, 0, y0), mul(inner, 1.05)); B.quad(p(u0, 0, y1), p(u1, 0, y1), p(u1, -T, y1), p(u0, -T, y1), mul(inner, 0.85));
    B.quad(p(u0, 0, y0), p(u0, 0, y1), p(u0, -T, y1), p(u0, -T, y0), mul(inner, 0.92)); B.quad(p(u1, 0, y0), p(u1, -T, y0), p(u1, -T, y1), p(u1, 0, y1), mul(inner, 0.97));
    // frame on the inner face
    wbox(B, f, w.u, 0.025, y0 - 0.05, w.w + 0.22, 0.05, 0.2, wood, { base: 0.05 }); // sill
    wbox(B, f, u0 - 0.03, 0.02, y0, 0.07, w.h, 0.04, wood, { base: 0.1 }); wbox(B, f, u1 + 0.03, 0.02, y0, 0.07, w.h, 0.04, wood, { base: 0.1 }); wbox(B, f, w.u, 0.02, y1 - 0.02, w.w + 0.14, 0.08, 0.04, wood, { base: 0.1 });
    // sash and mullions set back in the wall
    const sc = mix(wood, P.mustardD, 0.2); wbox(B, f, w.u, -0.14, y0, 0.05, w.h, 0.05, sc, { base: 0 }); wbox(B, f, w.u, -0.14, y0 + w.h * 0.58, w.w, 0.045, 0.05, sc, { base: 0 });
    // glass (nearly clear, a cool tint; the lighting artist tints it through userData.windowPane)
    const q = (u, y) => p(u, -0.14, y), gc = [0.62, 0.85, 0.95, 0.16]; GL.quad(q(u0, y0), q(u1, y0), q(u1, y1), q(u0, y1), gc); GL.quad(q(u0, y0), q(u0, y1), q(u1, y1), q(u1, y0), gc);
    // dressing
    const nn = (u, off) => f.pt(u, off);
    if (w.style === 'curtain') { // two pleated panels and a rod
      const rodY = y1 + 0.28; const rod = f.pt(w.u, 0.08); void rod; wbox(B, f, w.u, 0.1, rodY, w.w + 0.7, 0.035, 0.035, col('#3f3857'), { base: 0 });
      [[-1], [1]].forEach(([sd]) => { const base = sd < 0 ? w.u - w.w / 2 - 0.22 : w.u + w.w / 2 + 0.22, cw = 0.38; for (let i = 0; i < 6; i++) { const ua = base + sd * 0 + (i / 6 - 0.5) * cw * 2, ub = base + ((i + 1) / 6 - 0.5) * cw * 2, oa = 0.1 + (i % 2) * 0.06, ob = 0.1 + ((i + 1) % 2) * 0.06; const c0 = mix(col('#ff8aa8'), col('#c25a90'), i % 2 * 0.5), top = rodY, bot = y0 - 0.45; const pa = nn(ua, oa), pb = nn(ub, ob); B.quad([pa[0], bot, pa[1]], [pb[0], bot, pb[1]], [pb[0], top, pb[1]], [pa[0], top, pa[1]], aoTint(c0, 0.45), aoTint(c0, 0.45), c0, c0); } });
    } else if (w.style === 'blind') { // roller blind pulled halfway
      const bot = y1 - 0.45; wbox(B, f, w.u, 0.06, bot, w.w + 0.06, y1 - bot - 0.02, 0.025, mix(P.cream, P.mustard, 0.22), { base: 0.1 }); wbox(B, f, w.u, 0.06, bot - 0.03, 0.4, 0.05, 0.03, P.woodD, { base: 0 }); wbox(B, f, w.u, 0.07, y1 - 0.06, w.w + 0.1, 0.08, 0.08, P.woodD, { base: 0 });
    } else if (w.style === 'cafe') { // short cafe curtain, gingham
      const bot = y1 - 0.38; for (let i = 0; i < 8; i++) { const ua = u0 - 0.02 + (w.w + 0.04) * i / 8, ub = u0 - 0.02 + (w.w + 0.04) * (i + 1) / 8, oa = 0.07 + (i % 2) * 0.035, ob = 0.07 + ((i + 1) % 2) * 0.035, c0 = i % 2 ? col('#f5ead2') : col('#e8604a'), pa = nn(ua, oa), pb = nn(ub, ob); B.quad([pa[0], bot, pa[1]], [pb[0], bot, pb[1]], [pb[0], y1 - 0.04, pb[1]], [pa[0], y1 - 0.04, pa[1]], aoTint(c0, 0.3), aoTint(c0, 0.3), c0, c0); } wbox(B, f, w.u, 0.08, y1 - 0.05, w.w + 0.1, 0.03, 0.03, P.woodD, { base: 0 });
    }
    // blocked: none (windows are above the floor), the sill collider is not needed
  });

  // ---------------------------------------------------------------- front door (south wall) and the walkway outside
  { const f = WALLS.S, dw = DOOR.u1 - DOOR.u0, dc = (DOOR.u0 + DOOR.u1) / 2, fr = col('#3f8f8a');
    wbox(B, f, DOOR.u0 - 0.04, -T / 2, 0, 0.09, 2.15, T + 0.08, fr, { base: 0.1 }); wbox(B, f, DOOR.u1 + 0.04, -T / 2, 0, 0.09, 2.15, T + 0.08, fr, { base: 0.1 }); wbox(B, f, dc, -T / 2, 2.07, dw + 0.22, 0.13, T + 0.08, fr, { base: 0.1 });
    wbox(B, f, dc, -T / 2, 0, dw, 0.02, T, P.woodL, { base: 0 }); // threshold
    // leaf ajar: hinged at u0 side (east), swung inward to about 75 degrees
    const hinge = f.pt(DOOR.u0, 0), ang = 1.3, dirx = f.dx * Math.cos(ang) + f.nx * Math.sin(ang), dirz = f.dz * Math.cos(ang) + f.nz * Math.sin(ang);
    // leaf direction is measured from +d (toward u1), as the leaf closed spans u0..u1 at off 0; we want it to rotate into the room (+n)
    const lx = hinge[0] + dirx * dw / 2, lz = hinge[1] + dirz * dw / 2, lry = Math.atan2(-dirz, dirx);
    B.box(lx, 0.02, lz, dw - 0.03, 2.02, 0.05, col('#3f8f8a'), { ry: lry, base: 0.15 });
    S.leaf = { x: lx, z: lz, ry: lry, dw };
    S.hit.box(lx, lz, 0.1, 0.1, 0);
    // porch lamp outside (glows at night)
    const pl = f.pt(dc, -T - 0.06); S.GLOW.box(pl[0] - 0.09, 2.3, pl[1] - 0.09, 0.18, 0.2, 0.18, [3.0, 2.0, 0.9], { base: 0, tint: 0, top: [3.4, 2.4, 1.1] }); B.box(pl[0], 2.5, pl[1], 0.24, 0.05, 0.24, P.ink, { base: 0 }); B.box(pl[0], 2.22, pl[1], 0.24, 0.05, 0.24, P.ink, { base: 0 });
    S.lights.push({ x: pl[0], y: 2.3, z: pl[1] + 0.1, color: '#ffd9a0', r: 4, i: 0.5, kind: 'lamp' });
    // walkway slab with a yellow safety stripe, railing, a few posts
    const wz0 = 5.78, wz1 = 7.35, wc = col('#8f8499');
    B.box(0, -0.2, (wz0 + wz1) / 2, 15.56, 0.19, wz1 - wz0, wc, { base: 0.15, tint: 0.03, top: mix(wc, P.cream, 0.12) });
    B.quad([-7.78, -0.009, wz1 - 0.34], [-7.78, -0.009, wz1 - 0.24], [7.78, -0.009, wz1 - 0.24], [7.78, -0.009, wz1 - 0.34], col('#d8b23f'));
    const rc = col('#34304a'); for (let x = -7.7; x <= 7.75; x += 0.78) B.box(x, -0.01, wz1 - 0.04, 0.05, 1.02, 0.05, rc, { base: 0.1, top: P.steel }); B.box(0, 0.98, wz1 - 0.04, 15.5, 0.05, 0.08, P.steelD, { base: 0 }); B.box(0, 0.62, wz1 - 0.04, 15.5, 0.03, 0.03, rc, { base: 0 }); B.box(0, 0.28, wz1 - 0.04, 15.5, 0.03, 0.03, rc, { base: 0 });
  }

  // ---------------------------------------------------------------- bedroom half wall (an L, 1.05 high)
  { const hw = col('#8c82bf'), capw = P.woodL, hh = 1.05;
    B.box(-5.475, 0, 1.6, 4.05, hh, 0.14, hw, { base: 0.3, tint: 0.03, top: capw }); B.box(-3.6, 0, 2.75, 0.14, hh, 2.3, hw, { base: 0.3, tint: 0.03, top: capw });
    B.box(-5.475, hh, 1.6, 4.1, 0.04, 0.2, capw, { base: 0 }); B.box(-3.6, hh, 2.75, 0.2, 0.04, 2.34, capw, { base: 0 });
    S.hit.box(-5.475, 1.6, 2.05, 0.1, 0); S.hit.box(-3.6, 2.75, 0.1, 1.2, 0); }
  return { WALLS };
}
