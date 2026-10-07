// The brick graffiti wall along the north edge: individually coloured, slightly tilted bricks over a mortar body, stone coping and pilasters,
// the BEAT BOX mural (canvas) in a stone frame with a neon strip, tags and stickers on the brick, wall lamps, and the storytelling props at its foot.
import { THREE } from './kit.js';
import { col, mix, mul, smooth, vnoise } from './terrain_util.js';
import { muralTexture } from './terrain_atlas.js';

const BRICK = [col('#B5573F'), col('#A24C3F'), col('#C4664A'), col('#AE5242'), col('#9A4A44')], MORTAR = col('#CFB49E'), STONE = col('#B5ADBF'), STONE_D = col('#8F86A0');
export const WALL = { z: -25.6, h: 3.3, x0: -17.6, x1: 17.6, muralW: 12, muralH: 3 };

export function buildWall(S) {
  const B = S.B, R = S.rand, zF = WALL.z, H = WALL.h; B.gy = 0;
  // body (mortar coloured, its front sits 3 cm behind the bricks) and coping
  B.box(0, 0, zF - 0.4, 35.2, H, 0.74, MORTAR, { base: 0.35 });
  for (let x = WALL.x0; x < WALL.x1 - 0.1; x += 1.2) B.box(x + 0.6, H, zF - 0.38, 1.17, 0.2, 1.0, mix(STONE, STONE_D, R() * 0.5), { tint: 0.07, base: 0 });
  // bricks
  const ROWS = 16, rh = H / ROWS, bw = 0.5, mw = WALL.muralW / 2 + 0.16;
  for (let r = 0; r < ROWS; r++) {
    const y0 = r * rh + 0.022, y1 = (r + 1) * rh - 0.022, off = (r % 2) * 0.25;
    for (let xs = WALL.x0 - 0.5 + off; xs < WALL.x1; xs += bw) {
      let x0 = Math.max(xs + 0.022, WALL.x0), x1 = Math.min(xs + bw - 0.022, WALL.x1); if (x1 - x0 < 0.12) continue;
      if (x1 > -mw && x0 < mw && y1 > 0.1 && y0 < 3.4) continue;
      let c = BRICK[(R() * BRICK.length) | 0]; const dis = R();
      if (dis < 0.06) c = col('#8C4A5E'); else if (dis < 0.11) c = col('#CC7A52'); else if (dis < 0.13) c = MORTAR;
      c = mul(c, 0.9 + R() * 0.2);
      const low = 1 - smooth(0, 0.7, y0), top = smooth(H - 0.55, H, y1);
      if (r < 2) c = mix(c, col('#5E7C4C'), 0.22 * R() * (1 - r * 0.4)); // damp moss at the foot
      c = mix(c, col('#4A3A6E'), 0.26 * top + 0.34 * low * (0.6 + 0.4 * vnoise(xs * 0.8, 3, 2)));
      const lo = mix(c, col('#4A3A6E'), 0.1), hi = mul(c, 1.06), t1 = (R() - 0.5) * 0.03, t2 = (R() - 0.5) * 0.03;
      B.quad([x0, y0, zF + 0.0], [x1, y0, zF + t1 * 0.4], [x1, y1, zF + t1], [x0, y1, zF + t2], lo, lo, hi, hi);
    }
  }
  // pilasters flanking the mural and at both ends, in warm stone with a cap
  [-17.2, -9.5, -6.55, 6.55, 9.5, 17.2].forEach((x, i) => {
    const w = i === 0 || i === 5 ? 1.0 : 0.62;
    B.box(x, 0, zF - 0.12, w, H + 0.12, 0.5, mix(STONE, col('#C9A98F'), 0.35), { tint: 0.06, base: 0.4 });
    B.box(x, H + 0.12, zF - 0.16, w + 0.3, 0.16, 0.7, STONE, { base: 0 }); B.box(x, 0, zF - 0.1, w + 0.2, 0.28, 0.62, STONE_D, { base: 0.5 });
    if (i === 0 || i === 5) { B.pyr(x, H + 0.28, zF - 0.16, w + 0.1, 0.5, STONE); B.blob(x, H + 0.86, zF - 0.16, 0.16, 0.16, 0.16, STONE_D, STONE, { detail: 0 }); }
  });
  // mural frame: stone trim, and the neon (cyan frame + pink strip above)
  const fw = WALL.muralW / 2 + 0.1, my0 = 0.18, my1 = my0 + WALL.muralH + 0.14;
  B.box(0, my0 - 0.08, zF + 0.05, fw * 2 + 0.3, 0.16, 0.2, STONE_D, { base: 0 }); B.box(0, my1 - 0.06, zF + 0.05, fw * 2 + 0.3, 0.16, 0.2, STONE, { base: 0 });
  B.box(-fw - 0.07, my0, zF + 0.05, 0.16, my1 - my0, 0.2, STONE, { base: 0.1 }); B.box(fw + 0.07, my0, zF + 0.05, 0.16, my1 - my0, 0.2, STONE, { base: 0.1 });
  const cy = [0.45, 2.2, 2.2], pk = [3.4, 0.35, 1.7], gl = (x, y, z, w, h, d, c) => S.GLOW.box(x, y, z, w, h, d, c, { base: 0, tint: 0, top: c });
  gl(0, my1 + 0.0, zF + 0.16, fw * 2 + 0.2, 0.05, 0.05, cy); gl(0, my0 - 0.12, zF + 0.16, fw * 2 + 0.2, 0.05, 0.05, cy); gl(-fw - 0.14, my0, zF + 0.16, 0.05, my1 - my0, 0.05, cy); gl(fw + 0.14, my0, zF + 0.16, 0.05, my1 - my0, 0.05, cy);
  // pink strip light above the coping on little brackets
  const sy = H + 0.55; gl(0, sy, zF + 0.18, fw * 2 + 1, 0.09, 0.09, pk);
  for (let i = 0; i < 7; i++) { const x = -fw + (i * fw * 2) / 6; B.box(x, H + 0.2, zF + 0.16, 0.07, 0.4, 0.07, col('#3A3550'), { base: 0 }); }
  S.anchors.neon = [{ x: 0, y: sy, z: zF + 0.2, w: fw * 2 + 1, color: '#FF3D9A' }, { x: 0, y: my1, z: zF + 0.2, w: fw * 2, color: '#35F2E0' }];
  // soft light pools on the ground in front (pink under the strip, cyan at the foot)
  S.soft(0, -24.5, 8.5, 2.2, col('#FF5FA8'), 0.2, 0, 0.045, 18); S.soft(0, -25.0, 17.4, 1.2, col('#3a2d5c'), 0.34, 0, 0.044, 22);
  // wall lamps: iron arm and a little lantern each side of the mural
  [-7.7, 7.7].forEach((x) => { const y = 2.7; B.box(x, y - 0.1, zF + 0.1, 0.1, 0.1, 0.5, col('#3A3550'), { base: 0 }); B.box(x, y - 0.4, zF + 0.34, 0.2, 0.12, 0.2, col('#3A3550'), { base: 0 }); S.GLOW.box(x, y - 0.28, zF + 0.34, 0.15, 0.28, 0.15, [3.2, 2.1, 0.9], { base: 0, tint: 0, top: [3.2, 2.1, 0.9] }); B.pyr(x, y, zF + 0.34, 0.26, 0.2, col('#3A3550')); S.lamps.push({ x, y: y - 0.2, z: zF + 0.4 }); });
  // the mural itself
  const tex = muralTexture(); tex.anisotropy = 8; const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.3 });
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(WALL.muralW, WALL.muralH), mat); mural.position.set(0, my0 + 0.07 + WALL.muralH / 2, zF + 0.04); mural.receiveShadow = true; mural.name = 'mural'; S.group.add(mural);
  // tags, stickers and paste-ups on the brick
  const D = S.decal, wz = zF + 0.012;
  D('tagA', -11.8, 1.55, wz, 3.8, 1.9, 0, 0, 0, 0.04); D('tagB', 11.4, 1.35, wz, 3.4, 1.7, 0, 0, 0, -0.03);
  D('smiley', -8.4, 0.85, wz, 0.75, 0.75, 0, 0, 0, 0.2); D('burst', 14.4, 2.55, wz, 0.95, 0.95, 0, 0, 0, -0.15); D('vinyl', -15.1, 2.5, wz, 0.8, 0.8, 0, 0, 0, 0); D('yo', 8.5, 2.65, wz, 0.9, 0.9, 0, 0, 0, 0.08);
  D('fly1', -13.6, 1.0, wz, 0.75, 0.75, 0, 0, 0, 0.06); D('fly3', -13.0, 0.82, wz + 0.002, 0.7, 0.7, 0, 0, 0, -0.1); D('fly2', 15.3, 1.0, wz, 0.7, 0.7, 0, 0, 0, 0.1); D('burst', -9.3, 2.75, wz, 0.55, 0.55, 0, 0, 0, 0.3); D('smiley', 7.7, 0.55, wz, 0.5, 0.5, 0, 0, 0, -0.2);
  // the foot of the wall: spray cans on a milk crate, a paint bucket, a skateboard, a stack of crates at the end
  const cans = [['#FF4F8B', 0], ['#29D3C7', 1], ['#FFD23F', 2]];
  B.at(-4.9, 0, -25.0, 0.4, 1, () => { B.box(0, 0, 0, 0.5, 0.34, 0.4, col('#3F6FA8'), { tint: 0.08 }); cans.forEach(([c, i]) => { const x = -0.14 + i * 0.14, z = (i % 2) * 0.04 - 0.02; B.cyl(x, 0.34, z, 0.036, 0.036, 0.2, 6, mix(col(c), col('#fff2dc'), 0.1), {}); B.cyl(x, 0.54, z, 0.03, 0.025, 0.04, 6, col('#2B2438'), {}); }); });
  S.hit.circle(-4.9, -25.0, 0.4);
  B.cyl(-3.9, 0, -24.8, 0.19, 0.22, 0.34, 8, col('#E2554B'), {}); B.cyl(-3.9, 0.32, -24.8, 0.17, 0.17, 0.03, 8, mix(col('#FF4F8B'), col('#fff2dc'), 0.2), {}); B.box(-3.7, 0, -24.55, 0.05, 0.04, 0.5, col('#FF4F8B'), { ry: 0.5, base: 0 });
  S.hit.circle(-3.9, -24.8, 0.3);
  B.at(9.6, 0, -25.25, -0.3, 1, () => { B.box(0, 0.12, 0, 0.8, 0.035, 0.24, col('#29D3C7'), { rz: 1.22, base: 0, tint: 0.03 }); [[-0.2, 0], [0.2, 0]].forEach((w, i) => { B.cyl(0.52 - i * 0.02 + 0.0, 0.09, -0.1, 0.05, 0.05, 0.05, 6, col('#FFD23F'), { base: 0 }); }); });
  B.at(-15.6, 0, -24.5, 0.2, 1, () => { crate(B, S, 0, 0, 0, 1.0, col('#A8693B')); crate(B, S, 1.05, 0, 0.1, 0.9, col('#8E5530')); crate(B, S, 0.45, 1.0, 0.04, 0.85, col('#C07F48')); });
  S.hit.box(-15.2, -24.4, 1.1, 0.7, 0); S.hit.box(0, -26, 17.7, 0.75, 0);
  S.anchors.wall = { z: zF, h: H, muralW: WALL.muralW, muralCenter: { x: 0, y: my0 + 0.07 + WALL.muralH / 2, z: zF + 0.04 } };
}

export function crate(B, S, x, y, z, s, color, ry) {
  const R = S.rand; B.at(x, y, z, ry || (R() - 0.5) * 0.5, s, () => {
    const w = 0.9, wood = color, dark = mul(color, 0.8), lite = mul(color, 1.12);
    B.box(0, 0, 0, w, w * 0.7, w, wood, { tint: 0.06, base: 0.3 });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => B.box(a * (w / 2 - 0.035), 0, b * (w / 2 - 0.035), 0.09, w * 0.7 + 0.02, 0.09, dark, { base: 0.2, tint: 0.05 }));
    [-0.19, 0.19].forEach((yy) => { B.box(0, 0.245 + yy, w / 2 + 0.01, w - 0.04, 0.06, 0.03, lite, { base: 0, tint: 0.05 }); B.box(0, 0.245 + yy, -w / 2 - 0.01, w - 0.04, 0.06, 0.03, lite, { base: 0, tint: 0.05 }); B.box(w / 2 + 0.01, 0.245 + yy, 0, 0.03, 0.06, w - 0.04, lite, { base: 0, tint: 0.05 }); B.box(-w / 2 - 0.01, 0.245 + yy, 0, 0.03, 0.06, w - 0.04, lite, { base: 0, tint: 0.05 }); });
  });
}
