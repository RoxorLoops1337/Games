// Room shell shared by the Thrift Shop and the Sound Lab (Interior Artist INT-A). A parametric dollhouse cutaway in the house style of flat_shell.js:
// north and west walls full height (windows, dressing), south and east walls cut low (brick outside, plaster inside), slab and a lower storey under the floor.
// Frames follow flat: N u = x - minX, W u = maxZ - z, S u = maxX - x, E u = z - minZ; n is the inward normal.
//   buildShell(S, cfg) -> { F, windows }   S = makeStore() from flat_kit.js; cfg: see below
import { P, wallFace, wallCells, col, mix, mul, aoTint, fbm, vnoise, bar } from './flat_kit.js';

export const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function frame(name, ox, oz, dx, dz, len) { const nx = -dz, nz = dx, ry = Math.atan2(-dz, dx); return { name, ox, oz, dx, dz, nx, nz, len, ry, pt(u, off) { return [ox + dx * u + nx * (off || 0), oz + dz * u + nz * (off || 0)]; } }; }
export function roomFrames(b) {
  const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
  return { N: frame('N', b.minX, b.minZ, 1, 0, W), W: frame('W', b.minX, b.maxZ, 0, -1, D), S: frame('S', b.maxX, b.maxZ, -1, 0, W), E: frame('E', b.maxX, b.minZ, 0, 1, D) };
}
// box on a wall: u centre along the wall, off centre depth from the inner face (into the room), y0 base, w along the wall, h, dep
export function wbox(B, f, u, off, y0, w, h, dep, color, o) { const p = f.pt(u, off); B.box(p[0], y0, p[1], w, h, dep, color, Object.assign({ ry: f.ry }, o || {})); }
// decal on a wall face: returns the world transform for S.decal (ry so that the decal faces into the room)
export function wallDecal(S, f, name, u, off, y, w, h, tint, rz) { const p = f.pt(u, off); S.decal(name, p[0], y, p[1], w, h, Math.atan2(f.nx, f.nz), 0, tint || [1.05, 1.05, 1.05], rz); }
export function wallScreen(S, f, name, u, off, y, w, h, tint) { const p = f.pt(u, off); S.screen(name, p[0], y, p[1], w, h, Math.atan2(f.nx, f.nz), 0, tint || [1.2, 1.2, 1.2]); }

export function buildShell(S, cfg) {
  const B = S.B, GL = S.GLASS, R = S.rand, b = cfg.b, H = cfg.H || 2.75, LOW = cfg.LOW || 0.9, T = cfg.T || 0.28, F = roomFrames(b);
  const W = b.maxX - b.minX, D = b.maxZ - b.minZ, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, trim = cfg.trim;
  const wins = cfg.windows || [], holes = cfg.holes || [], door = cfg.door;
  // ---------------------------------------------------------------- slab and the lower storey (exterior faces of south and east)
  const slabC = cfg.slabColor || col('#9a8fa8');
  B.box(cx, -0.57, cz, W + 0.56, 0.55, D + 0.56, slabC, { base: 0.1, tint: 0.03, top: mix(slabC, P.cream, 0.2), bottom: true });
  const lower = (a, c, nrm) => wallFace(B, a, c, nrm, 3.4, (u, v, uc, vc) => { const brick = P.brick[((Math.floor(uc / 0.5) + Math.floor(vc / 0.5) * 3) % 4 + 4) % 4]; return mix(aoTint(mul(brick, 0.9), 0.35), col('#7a5a96'), 0.18 + 0.55 * (1 - sm(0, 3.4, v))); }, { y0: -3.95, stepU: 0.6, vBreaks: [0.8, 1.6, 2.4] });
  lower([b.minX - 0.28, b.maxZ + 0.28], [b.maxX + 0.28, b.maxZ + 0.28], [0, 1]); lower([b.maxX + 0.28, b.maxZ + 0.28], [b.maxX + 0.28, b.minZ - 0.28], [1, 0]);
  for (let x = b.minX + 1.4; x < b.maxX - 0.8; x += 3.1) B.box(x, -3.1, b.maxZ + 0.27, 1.1, 1.2, 0.04, col('#3b2d52'), { base: 0, tint: 0.1 });
  for (let z = b.minZ + 1.2; z < b.maxZ - 0.8; z += 3.0) B.box(b.maxX + 0.27, -3.1, z, 0.04, 1.2, 1.1, col('#3b2d52'), { base: 0, tint: 0.1 });

  // ---------------------------------------------------------------- floor: a grid of vertex-coloured cells (cfg.floor(x, z) -> colour)
  const st = cfg.floorStep || 0.25, nx = Math.round(W / st), nz = Math.round(D / st);
  B.poly([[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]], -0.004, col('#2e2036'));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = b.minX + W * i / nx, xb = b.minX + W * (i + 1) / nx, za = b.minZ + D * j / nz, zb = b.minZ + D * (j + 1) / nz, f = cfg.floor;
    B.quad([xa, 0, za], [xa, 0, zb], [xb, 0, zb], [xb, 0, za], f(xa, za, i, j), f(xa, zb, i, j), f(xb, zb, i, j), f(xb, za, i, j));
  }
  // ---------------------------------------------------------------- walls (inner faces). holes: windows + extra openings
  const allHoles = (wn) => wins.filter((w) => w.wall === wn).map((w) => ({ u0: w.u - w.w / 2, u1: w.u + w.w / 2, v0: w.y0, v1: w.y0 + w.h })).concat(holes.filter((h) => h.wall === wn));
  const vb = cfg.vBreaks || [0.12, 0.95, 1.0, 2.55];
  wallFace(B, F.N.pt(0, 0), F.N.pt(W, 0), [0, 1], H, cfg.wallN, { stepU: 0.25, vBreaks: vb, holes: allHoles('N') });
  wallFace(B, F.W.pt(0, 0), F.W.pt(D, 0), [1, 0], H, cfg.wallW, { stepU: 0.25, vBreaks: vb, holes: allHoles('W') });
  const lowIn = (len) => (u, v, uc, vc) => { const c = vc < 0.12 ? (cfg.lowBase || P.cream) : mix(cfg.lowBase || P.cream, P.creamD, 0.35 + 0.2 * Math.sin(uc * 3)); return aoTint(c, Math.min(0.7, 0.35 * (1 - sm(0, 0.4, v)) + 0.3 * (1 - sm(0, 0.4, u)) + 0.3 * (1 - sm(0, 0.4, len - u)))); };
  const dh = door ? [{ u0: door.u0, u1: door.u1, v0: -1, v1: LOW + 1 }] : [];
  wallFace(B, F.S.pt(0, 0), F.S.pt(W, 0), [0, -1], LOW, lowIn(W), { stepU: 0.5, vBreaks: [0.12], holes: dh });
  wallFace(B, F.E.pt(0, 0), F.E.pt(D, 0), [-1, 0], LOW, lowIn(D), { stepU: 0.5, vBreaks: [0.12] });
  // exterior brick of south and east (the camera sees these), mortar backing so gaps read as mortar
  const mort = col('#b89a86'), brick = (a, c, nrm, y0, top, skipU) => { const rows = []; for (let y = 0; y + 0.09 <= top - y0 + 1e-6; y += 0.103) rows.push([y, y + 0.09]); wallCells(B, a, c, nrm, (uc, vc, row) => { if (skipU && uc > skipU[0] && uc < skipU[1]) return null; const k = (Math.floor(uc / 0.28) * 7 + row * 13) % 4, base = P.brick[(k + 4) % 4], wob = 0.88 + 0.22 * vnoise(uc * 2.1, vc * 5, 12); return mul(aoTint(base, 0.1 + 0.3 * (1 - sm(0, 0.5, vc + y0))), wob); }, { y0, rows, cell: 0.28, offset: true, gap: 0.014 }); };
  B.box(cx, -0.55, b.maxZ + 0.26, W + 0.56, LOW + 0.55, 0.03, mort, { base: 0, tint: 0.02 }); B.box(b.maxX + 0.26, -0.55, cz, 0.03, LOW + 0.55, D, mort, { base: 0, tint: 0.02 });
  brick([b.minX - 0.28, b.maxZ + 0.29], [b.maxX + 0.28, b.maxZ + 0.29], [0, 1], -0.55, LOW, door ? [W - door.u1 + 0.28, W - door.u0 + 0.28] : null); brick([b.maxX + 0.29, b.maxZ], [b.maxX + 0.29, b.minZ], [1, 0], -0.55, LOW);
  // end caps and tops of the cut walls (cut section: light cream)
  const cap = mix(P.cream, col('#fff2dc'), 0.4);
  [-1, 1].forEach((sx) => { const x = sx < 0 ? b.minX - 0.28 : b.maxX + 0.28; B.quad([x, -0.55, b.minZ - 0.28], [x, H, b.minZ - 0.28], [x, H, b.minZ], [x, -0.55, b.minZ], mix(P.creamD, col('#7a5a96'), 0.2)); });
  B.quad([b.minX - 0.28, H, b.minZ - 0.28], [b.minX - 0.28, H, b.minZ], [b.maxX + 0.28, H, b.minZ], [b.maxX + 0.28, H, b.minZ - 0.28], cap); B.quad([b.minX - 0.28, H, b.minZ], [b.minX - 0.28, H, b.maxZ], [b.minX, H, b.maxZ], [b.minX, H, b.minZ], cap);
  if (door) { const segs = [[b.minX - 0.28, F.S.pt(door.u1, 0)[0]], [F.S.pt(door.u0, 0)[0], b.maxX + 0.28]]; segs.forEach(([x0, x1]) => B.quad([x0, LOW, b.maxZ], [x0, LOW, b.maxZ + 0.28], [x1, LOW, b.maxZ + 0.28], [x1, LOW, b.maxZ], cap)); } else B.quad([b.minX - 0.28, LOW, b.maxZ], [b.minX - 0.28, LOW, b.maxZ + 0.28], [b.maxX + 0.28, LOW, b.maxZ + 0.28], [b.maxX + 0.28, LOW, b.maxZ], cap);
  B.quad([b.maxX, LOW, b.minZ], [b.maxX, LOW, b.maxZ + 0.28], [b.maxX + 0.28, LOW, b.maxZ + 0.28], [b.maxX + 0.28, LOW, b.minZ], cap);
  // ---------------------------------------------------------------- skirting, chair rail, cornice
  const skirt = trim.skirt || mix(P.cream, P.creamD, 0.25);
  wbox(B, F.N, W / 2, 0.02, 0, W, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 }); wbox(B, F.W, D / 2, 0.02, 0, D, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 }); wbox(B, F.E, D / 2, 0.02, 0, D, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 });
  if (door) { wbox(B, F.S, door.u0 / 2, 0.02, 0, door.u0, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 }); wbox(B, F.S, (door.u1 + W) / 2, 0.02, 0, W - door.u1, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 }); } else wbox(B, F.S, W / 2, 0.02, 0, W, 0.12, 0.04, skirt, { base: 0.4, tint: 0.03 });
  if (trim.rail) { wbox(B, F.N, W / 2, 0.02, trim.railH - 0.02, W, 0.045, 0.035, trim.rail, { base: 0.1 }); wbox(B, F.W, D / 2, 0.02, trim.railH - 0.02, D, 0.045, 0.035, trim.rail, { base: 0.1 }); }
  const corn = trim.corn || mix(P.mustardD, P.woodL, 0.3); wbox(B, F.N, W / 2, 0.03, H - 0.09, W, 0.09, 0.07, corn, { base: 0.1, tint: 0.03 }); wbox(B, F.W, D / 2, 0.03, H - 0.09, D, 0.09, 0.07, corn, { base: 0.1, tint: 0.03 });
  // ---------------------------------------------------------------- window frames, reveals, glass
  wins.forEach((w) => {
    const f = F[w.wall], u0 = w.u - w.w / 2, u1 = w.u + w.w / 2, y0 = w.y0, y1 = w.y0 + w.h, wood = w.wood || mix(P.cream, P.woodL, 0.25), inner = mix(P.cream, P.creamD, 0.4);
    const p = (u, off, y) => { const q = f.pt(u, off); return [q[0], y, q[1]]; };
    B.quad(p(u0, 0, y0), p(u0, -T, y0), p(u1, -T, y0), p(u1, 0, y0), mul(inner, 1.05)); B.quad(p(u0, 0, y1), p(u1, 0, y1), p(u1, -T, y1), p(u0, -T, y1), mul(inner, 0.85));
    B.quad(p(u0, 0, y0), p(u0, 0, y1), p(u0, -T, y1), p(u0, -T, y0), mul(inner, 0.92)); B.quad(p(u1, 0, y0), p(u1, -T, y0), p(u1, -T, y1), p(u1, 0, y1), mul(inner, 0.97));
    wbox(B, f, w.u, 0.025, y0 - 0.05, w.w + 0.22, 0.05, 0.2, wood, { base: 0.05 });
    wbox(B, f, u0 - 0.03, 0.02, y0, 0.07, w.h, 0.04, wood, { base: 0.1 }); wbox(B, f, u1 + 0.03, 0.02, y0, 0.07, w.h, 0.04, wood, { base: 0.1 }); wbox(B, f, w.u, 0.02, y1 - 0.02, w.w + 0.14, 0.08, 0.04, wood, { base: 0.1 });
    const sc = mix(wood, P.mustardD, 0.2); (w.mull || [0.5]).forEach((m) => wbox(B, f, u0 + w.w * m, -0.14, y0, 0.05, w.h, 0.05, sc, { base: 0 })); wbox(B, f, w.u, -0.14, y0 + w.h * 0.62, w.w, 0.045, 0.05, sc, { base: 0 });
    const q = (u, y) => p(u, -0.14, y), gc = [0.62, 0.85, 0.95, 0.16]; GL.quad(q(u0, y0), q(u1, y0), q(u1, y1), q(u0, y1), gc); GL.quad(q(u0, y0), q(u0, y1), q(u1, y1), q(u1, y0), gc);
  });
  // ---------------------------------------------------------------- front door (south wall): frame, ajar leaf (swung into the room), threshold
  if (door) {
    const f = F.S, dw = door.u1 - door.u0, dc = (door.u0 + door.u1) / 2, fr = door.color || col('#3f8f8a');
    if (door.cut) { // cutaway doorway: two stout posts at wall height with lantern caps, threshold, no leaf (the dollhouse cut takes the door too)
      const ph = LOW + 0.2; [door.u0 - 0.1, door.u1 + 0.1].forEach((u) => { wbox(B, f, u, -T / 2, 0, 0.2, ph, T + 0.1, fr, { base: 0.1 }); wbox(B, f, u, -T / 2, ph, 0.26, 0.05, T + 0.16, mix(fr, P.cream, 0.35), { base: 0 }); const q = f.pt(u, -T / 2); S.GLOW.box(q[0] - 0.07, ph + 0.05, q[1] - 0.07, 0.14, 0.15, 0.14, [3.0, 2.0, 0.9], { base: 0, tint: 0, top: [3.4, 2.4, 1.1] }); wbox(B, f, u, -T / 2, ph + 0.2, 0.2, 0.04, 0.2, P.ink, { base: 0 }); S.lights.push({ x: q[0], y: ph + 0.15, z: q[1] + 0.25, color: '#ffd9a0', r: 3.2, i: 0.4, kind: 'lamp' }); });
      wbox(B, f, dc, -T / 2, 0, dw, 0.02, T, P.woodL, { base: 0 }); S.doorFrame = { f, dc, dw }; S.hit.box(f.pt(dc, 0)[0], f.pt(dc, 0)[1] + 0.12, dw / 2, 0.1, 0);
    } else {
    wbox(B, f, door.u0 - 0.04, -T / 2, 0, 0.09, 2.15, T + 0.08, fr, { base: 0.1 }); wbox(B, f, door.u1 + 0.04, -T / 2, 0, 0.09, 2.15, T + 0.08, fr, { base: 0.1 }); wbox(B, f, dc, -T / 2, 2.07, dw + 0.22, 0.13, T + 0.08, fr, { base: 0.1 });
    wbox(B, f, dc, -T / 2, 0, dw, 0.02, T, P.woodL, { base: 0 });
    const hinge = f.pt(door.u0, 0), ang = door.ang === undefined ? 1.3 : door.ang, dirx = f.dx * Math.cos(ang) + f.nx * Math.sin(ang), dirz = f.dz * Math.cos(ang) + f.nz * Math.sin(ang);
    const lx = hinge[0] + dirx * dw / 2, lz = hinge[1] + dirz * dw / 2, lry = Math.atan2(-dirz, dirx);
    const lf = door.leaf || fr;
    if (door.glass) { B.box(lx, 0.02, lz, dw - 0.03, 1.24, 0.05, lf, { ry: lry, base: 0.15 }); B.box(lx, 1.86, lz, dw - 0.03, 0.18, 0.05, lf, { ry: lry, base: 0.1 }); [-1, 1].forEach((sd) => B.box(lx + f.dx * sd * (dw / 2 - 0.06), 1.26, lz + f.dz * sd * (dw / 2 - 0.06), 0.1, 0.6, 0.05, lf, { ry: lry, base: 0.1 })); }
    else B.box(lx, 0.02, lz, dw - 0.03, 2.02, 0.05, lf, { ry: lry, base: 0.15 });
    S.leaf = { x: lx, z: lz, ry: lry, dw }; S.hit.box(lx, lz, door.ang === 0 ? dw / 2 : 0.1, 0.1, 0);
    S.doorFrame = { f, dc, dw };
    }
  }
  // exterior walkway (sidewalk) along the south side with a kerb: the camera looks down on it
  if (cfg.sidewalk) { const wz0 = b.maxZ + 0.28, wz1 = wz0 + 1.7, wc = col('#8f8499'); B.box(cx, -0.2, (wz0 + wz1) / 2, W + 0.56, 0.19, wz1 - wz0, wc, { base: 0.15, tint: 0.03, top: mix(wc, P.cream, 0.12) });
    for (let x = b.minX - 0.28; x < b.maxX + 0.28; x += 0.9) B.quad([x, -0.008, wz0 + 0.02], [x, -0.008, wz1], [x + 0.02, -0.008, wz1], [x + 0.02, -0.008, wz0 + 0.02], mix(wc, P.ink, 0.25));
    B.box(cx, -0.01, wz1 - 0.07, W + 0.56, 0.0, 0.14, col('#d8b23f'), { base: 0 }); B.quad([b.minX - 0.28, -0.0085, wz1 - 0.14], [b.minX - 0.28, -0.0085, wz1], [b.maxX + 0.28, -0.0085, wz1], [b.maxX + 0.28, -0.0085, wz1 - 0.14], col('#d8b23f')); }
  return { F, W, D };
}
export function windowContract(F, wins, T) { return wins.map((w) => { const f = F[w.wall], p = f.pt(w.u, -0.14); return { x: p[0], y: w.y0 + w.h / 2, z: p[1], w: w.w, h: w.h, nx: -f.nx, nz: -f.nz }; }); }
export { P, wallFace, col, mix, mul, aoTint, fbm, vnoise, bar };
