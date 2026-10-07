// Flat3D outside (Interior Artist): the neighbouring blocks seen across the street through the north and west windows (and over the walls).
// Two meshes named 'skyline' and 'skyline_windows' so lighting.js tints them by time of day (body by sky tint, windows by the window level).
import { THREE, rng } from './kit.js';
import { Buf, col, mix, mul } from './flat_kit.js';

export function buildOutside() {
  const R = rng(55), body = new Buf({ rng: rng(56) }), lit = new Buf({ rng: rng(57) }), group = new THREE.Group(); group.name = 'outside';
  const hues = ['#9b86b8', '#8e7fb4', '#a98cb0', '#b497b8', '#8a8cc0', '#b08aa6'];
  const wcol = [[2.6, 1.7, 0.7], [2.6, 1.9, 1.0], [0.6, 2.0, 2.2], [2.4, 0.9, 1.5], [2.2, 2.2, 1.6]];
  // a building whose face looks toward +z (north row) or +x (west row)
  function block(side, a, w, depth, top, bot, layer) {
    const base = mix(col(hues[(R() * hues.length) | 0]), col('#d9a0b0'), layer * 0.35), hi = mul(base, 1.12), lo = mul(base, 0.72);
    const cx = side === 'N' ? a + w / 2 : a - depth / 2, cz = side === 'N' ? a - depth / 2 : 0; void cz;
    return { base, hi, lo };
  }
  const buildings = [];
  // north row: faces at z = zf looking +z. x ranges cover the whole width the camera can see
  let x = -26; for (let i = 0; i < 12; i++) { const w = 4 + R() * 4.5, h = 9 + R() * 16, zf = -12.5 - R() * 3; buildings.push({ side: 'N', a: x, w, zf, d: 6 + R() * 4, top: h - 1.5, layer: 0 }); x += w + 0.2 + R() * 0.8; if (x > 20) break; }
  // west row: faces at x = xf looking +x, spanning z
  let z = -22; for (let i = 0; i < 10; i++) { const w = 4 + R() * 4.5, h = 9 + R() * 16, xf = -13.5 - R() * 3; buildings.push({ side: 'W', a: z, w, zf: xf, d: 6 + R() * 4, top: h - 1.5, layer: 0 }); z += w + 0.2 + R() * 0.8; if (z > 14) break; }
  // far haze layers behind the first row
  x = -34; for (let i = 0; i < 9; i++) { const w = 6 + R() * 6, h = 20 + R() * 20; buildings.push({ side: 'N', a: x, w, zf: -30 - R() * 6, d: 8, top: h, layer: 1 }); x += w + 0.5; if (x > 28) break; }
  z = -30; for (let i = 0; i < 8; i++) { const w = 6 + R() * 6, h = 20 + R() * 20; buildings.push({ side: 'W', a: z, w, zf: -32 - R() * 6, d: 8, top: h, layer: 1 }); z += w + 0.5; if (z > 22) break; }

  buildings.forEach((b) => {
    const lay = b.layer, base = mix(col(hues[(R() * hues.length) | 0]), col('#d9a0b0'), lay * 0.38), bot = -16;
    const sw = b.side === 'N', cx = sw ? b.a + b.w / 2 : b.zf - b.d / 2, cz = sw ? b.zf - b.d / 2 : b.a + b.w / 2, W = sw ? b.w : b.d, D = sw ? b.d : b.w;
    body.box(cx, bot, cz, W, b.top - bot, D, base, { base: 0.0, tint: 0.06, top: mul(base, 1.15) });
    // roof details
    if (lay === 0 && R() < 0.7) { const rx = cx + (R() - 0.5) * W * 0.5, rz = cz + (R() - 0.5) * D * 0.5; body.box(rx, b.top, rz, 1.2 + R(), 0.8 + R() * 0.7, 1.0, mul(base, 0.85), { base: 0 }); if (R() < 0.5) body.lathe([[0.55, 0, mul(base, 0.6)], [0.6, 0.8, mul(base, 0.7)], [0.5, 0.9, mul(base, 0.9)], [0, 1.3, mul(base, 1)]], 6, rx + 1.5, b.top, rz, {}); }
    // windows on the faces toward the flat
    const faces = sw ? [{ n: [0, 1], p: (u, v) => [b.a + u, v, b.zf + 0.04], len: b.w }] : [{ n: [1, 0], p: (u, v) => [b.zf + 0.04, v, b.a + u], len: b.w }];
    faces.forEach((f) => {
      const cols = Math.max(1, Math.floor(f.len / 1.9)), step = f.len / cols; for (let c = 0; c < cols; c++) for (let v = -14; v < b.top - 1.6; v += 2.4) {
        const u0 = c * step + step * 0.22, u1 = c * step + step * 0.78, v0 = v + 0.5, v1 = v + 1.8, on = R() < (lay ? 0.0 : 0.42), cc = on ? wcol[(R() * wcol.length) | 0] : mix(base, col('#2b2a5e'), 0.62);
        const a = f.p(u0, v0), b2 = f.p(u1, v0), c2 = f.p(u1, v1), d = f.p(u0, v1); const buf = on ? lit : body;
        if (sw) buf.quad(a, b2, c2, d, cc); else buf.quad(a, d, c2, b2, cc);
      }
    });
  });
  const bmat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), lmat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false });
  const m1 = new THREE.Mesh(body.geometry(false), bmat); m1.name = 'skyline'; m1.frustumCulled = false; const m2 = new THREE.Mesh(lit.geometry(false), lmat); m2.name = 'skyline_windows'; m2.frustumCulled = false;
  group.add(m1, m2); return group;
}
