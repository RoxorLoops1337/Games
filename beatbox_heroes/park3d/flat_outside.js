// Flat3D outside (Interior Artist): neighbouring blocks across the street, seen through the north and west windows and over the walls.
// Two meshes named 'skyline' and 'skyline_windows' so lighting.js tints them by time of day (body by the sky tint, windows by the window level).
import { THREE, rng } from './kit.js';
import { Buf, col, mix, mul } from './flat_kit.js';

export function buildOutside() {
  const R = rng(55), body = new Buf({ rng: rng(56) }), lit = new Buf({ rng: rng(57) }), group = new THREE.Group(); group.name = 'outside';
  const hues = ['#7d6a9c', '#8a6a8e', '#6f7aa8', '#9a6c7e', '#7a6fa6', '#6a8296', '#a07a8a'];
  const wlit = [[1.9, 1.25, 0.55], [1.9, 1.4, 0.7], [0.45, 1.5, 1.7], [1.8, 0.7, 1.1], [1.6, 1.6, 1.2]];
  const hazeC = col('#d9a0b0');
  const buildings = [];
  let x = -30; for (let i = 0; i < 14; i++) { const w = 5 + R() * 4.5; buildings.push({ side: 'N', a: x, w, zf: -12.8 - R() * 2.5, d: 7 + R() * 4, top: 7 + R() * 14, layer: 0 }); x += w + 0.15 + R() * 0.7; if (x > 22) break; }
  let z = -26; for (let i = 0; i < 12; i++) { const w = 5 + R() * 4.5; buildings.push({ side: 'W', a: z, w, zf: -14.8 - R() * 2.5, d: 7 + R() * 4, top: 7 + R() * 14, layer: 0 }); z += w + 0.15 + R() * 0.7; if (z > 16) break; }
  x = -40; for (let i = 0; i < 9; i++) { const w = 7 + R() * 6, h = 18 + R() * 22; buildings.push({ side: 'N', a: x, w, zf: -30 - R() * 6, d: 9, top: h, layer: 1 }); x += w + 0.5; if (x > 34) break; }
  z = -40; for (let i = 0; i < 8; i++) { const w = 7 + R() * 6, h = 18 + R() * 22; buildings.push({ side: 'W', a: z, w, zf: -32 - R() * 6, d: 9, top: h, layer: 1 }); z += w + 0.5; if (z > 28) break; }

  buildings.forEach((b, bi) => {
    const lay = b.layer, base = mix(col(hues[(R() * hues.length) | 0]), hazeC, lay * 0.4), bot = -18, sw = b.side === 'N';
    const cx = sw ? b.a + b.w / 2 : b.zf - b.d / 2, cz = sw ? b.zf - b.d / 2 : b.a + b.w / 2, W = sw ? b.w : b.d, D = sw ? b.d : b.w;
    // body: darker toward the street, lighter roof
    body.box(cx, bot, cz, W, b.top - bot, D, mul(base, 0.8), { base: 0.0, tint: 0.07, top: mul(base, 1.25) });
    // cornice and roof details
    const roofY = b.top; body.box(cx, roofY, cz, W + 0.2, 0.25, D + 0.2, mul(base, 1.05), { base: 0 });
    if (lay === 0) {
      const rx = cx + (R() - 0.5) * W * 0.5, rz = cz + (R() - 0.5) * D * 0.5; body.box(rx, roofY + 0.25, rz, 1.6 + R() * 1.2, 0.9 + R() * 0.8, 1.4, mul(base, 0.7), { base: 0 });
      if (R() < 0.6) { const tx = cx + (R() - 0.5) * W * 0.6, tz = cz + (R() - 0.5) * D * 0.6; body.lathe([[0.7, 0, mul(base, 0.5)], [0.75, 1.0, mul(base, 0.62)], [0.62, 1.1, mul(base, 0.8)], [0, 1.6, mul(base, 0.9)]], 7, tx, roofY + 0.25, tz, {}); }
      const ax = cx + (R() - 0.5) * W * 0.6, az = cz + (R() - 0.5) * D * 0.6; body.box(ax, roofY + 0.25, az, 0.06, 1.8 + R() * 1.5, 0.06, mul(base, 0.45), { base: 0 }); body.box(ax, roofY + 1.2, az, 0.7, 0.05, 0.05, mul(base, 0.45), { base: 0 });
    }
    // facade: windows (small, with sills), AC units, a neon blade sign on some
    const faceP = sw ? (u, v, off) => [b.a + u, v, b.zf + 0.04 + (off || 0)] : (u, v, off) => [b.zf + 0.04 + (off || 0), v, b.a + u];
    const Lf = b.w, cols = Math.max(1, Math.floor(Lf / 1.15)), step = Lf / cols, rowH = lay ? 3.0 : 1.7;
    const winQuad = (buf, u0, u1, v0, v1, c, off) => { const a = faceP(u0, v0, off), b2 = faceP(u1, v0, off), c2 = faceP(u1, v1, off), d = faceP(u0, v1, off); if (sw) buf.quad(a, b2, c2, d, c); else buf.quad(a, d, c2, b2, c); };
    for (let c = 0; c < cols; c++) for (let v = -16; v < b.top - 1.6; v += rowH) {
      const u0 = c * step + step * 0.2, u1 = c * step + step * 0.8, v0 = v + 0.45, v1 = v + 0.45 + (lay ? 1.3 : 1.0), on = lay === 0 && R() < 0.42, cc = on ? wlit[(R() * wlit.length) | 0] : mix(base, col('#20204a'), 0.6);
      if (lay === 1 && R() < 0.5) continue;
      winQuad(on ? lit : body, u0, u1, v0, v1, cc, 0.0); if (lay === 0) winQuad(body, u0 - 0.05, u1 + 0.05, v0 - 0.08, v0 - 0.01, mul(base, 1.2), 0.03);
      if (lay === 0 && !on && R() < 0.12) winQuad(body, u0 + 0.1, u1 - 0.1, v1 + 0.05, v1 + 0.45, mix(base, col('#2b2438'), 0.5), 0.05); // AC unit above
    }
    if (lay === 0 && bi % 3 === 1) { const u = b.w * 0.5, v0 = 1 + R() * 3; const neon = [[3.0, 0.5, 1.5], [0.5, 2.6, 3.0], [3.0, 2.2, 0.4]][bi % 3]; winQuad(lit, u - 0.12, u + 0.12, v0, v0 + 2.6, neon, 0.35); winQuad(body, u - 0.2, u + 0.2, v0 - 0.05, v0 + 2.65, mul(base, 0.5), 0.3); }
  });
  const bmat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), lmat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false });
  const m1 = new THREE.Mesh(body.geometry(false), bmat); m1.name = 'skyline'; m1.frustumCulled = false; const m2 = new THREE.Mesh(lit.geometry(false), lmat); m2.name = 'skyline_windows'; m2.frustumCulled = false;
  group.add(m1, m2); return group;
}
