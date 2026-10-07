// Bar counter (Stage and Club Artist INT-B): the juice counter along the west wall with six stools, the back bar (cabinets, shelves of bottles, mirror, neon beer sign), the green juice machine,
// a cooler, till and tips jar, pendant lamps hanging from the ceiling beam. Rohzel stands behind the counter (anchor rohzel).
import { mix, mul, K, bar, lightPool, cylT, aoTint, truss, PINKN, CYANN, WARM, WARMS, GREENN, LIMEN, GOLDN, ORANGEN, YELN } from './venue_kit.js';
import { BAR } from './bar_shell.js';

export const STOOLS = [-3.3, -2.4, -1.5, -0.6, 0.3, 1.2].map((z) => ({ x: -3.4, z }));

export function buildCounter(S) {
  const B = S.B, GL = S.GLOW, c = BAR.counter, R = S.rand, cw = c.x1 - c.x0, cl = c.z1 - c.z0, cz = (c.z0 + c.z1) / 2, cxm = (c.x0 + c.x1) / 2, TOP = 1.05;
  // ---------------------------------------------------------------- the counter
  B.box(cxm, 0, cz, cw, TOP - 0.06, cl, K.woodD, { base: 0.35, tint: 0.03 });
  // front panels (facing +x): vertical boards with a teal tile band and a brass rail
  const np = Math.round(cl / 0.5);
  for (let i = 0; i < np; i++) { const za = c.z0 + cl * i / np + 0.02, zb = c.z0 + cl * (i + 1) / np - 0.02, k = 0.92 + 0.1 * ((i * 3) % 4) / 4; B.box(c.x1 + 0.012, 0.12, (za + zb) / 2, 0.03, 0.55, zb - za, mul(K.wood, k), { base: 0.2, tint: 0.03 }); B.box(c.x1 + 0.014, 0.74, (za + zb) / 2, 0.03, 0.26, zb - za, mix(K.teal, K.tealD, (i % 2) * 0.4), { base: 0.1, tint: 0.03 }); }
  B.box(c.x1 + 0.03, 0.66, cz, 0.05, 0.05, cl, K.gold, { base: 0 });             // brass band
  cylT(B, c.x1 + 0.2, 0.2, c.z0 + 0.1, 0.03, 0.03, cl - 0.2, 6, K.gold, { rx: Math.PI / 2 });   // brass foot rail
  [c.z0 + 0.3, cz, c.z1 - 0.3].forEach((z) => bar(B, [c.x1 + 0.2, 0.2, z], [c.x1 + 0.03, 0.4, z], 0.03, 0.03, K.gold));
  GL.box(c.x1 + 0.02, 0.05, cz, 0.02, 0.025, cl - 0.1, CYANN, { base: 0, tint: 0 }); // kick light
  B.box(cxm + 0.04, TOP - 0.06, cz, cw + 0.18, 0.06, cl + 0.06, K.woodL, { base: 0.1, tint: 0.03, top: mix(K.woodL, K.cream, 0.15) }); // bar top overhang
  B.box(c.x1 + 0.1, TOP - 0.005, cz, 0.04, 0.012, cl, K.gold, { base: 0 });
  S.hit.box(cxm - 0.05, cz, cw / 2 + 0.55, cl / 2 + 0.1, 0); S.soft(c.x1 + 0.25, cz, 0.6, cl / 2 + 0.1, 0.35);
  // ---------------------------------------------------------------- stools
  STOOLS.forEach((s) => { const x = s.x, z = s.z; S.soft(x, z, 0.3, 0.3, 0.35);
    [0, 1, 2].forEach((k) => { const a = k * 2.094 + 0.4; bar(B, [x + Math.cos(a) * 0.19, 0, z + Math.sin(a) * 0.19], [x + Math.cos(a) * 0.06, 0.56, z + Math.sin(a) * 0.06], 0.035, 0.035, K.steelL, { base: 0.1 }); });
    B.lathe([[0.17, 0.2, K.steelD], [0.17, 0.225, K.steel], [0.11, 0.225, K.steel]], 8, x, 0, z, {});
    B.lathe([[0.2, 0.56, mix(K.velvetD, K.ink, 0.3)], [0.21, 0.6, K.velvetD], [0.19, 0.68, K.velvet], [0.1, 0.7, K.velvetL], [0, 0.7, K.velvetL]], 10, x, 0, z, {});
    S.hit.circle(x, z, 0.24); });
  // ---------------------------------------------------------------- back bar (west wall): cabinets, shelves, mirror
  const bx0 = -5.97, bx1 = -5.4, bz0 = -4.15, bz1 = 1.7, bw = bx1 - bx0, bcz = (bz0 + bz1) / 2, BH = 0.95;
  B.box((bx0 + bx1) / 2, 0, bcz, bw, BH - 0.05, bz1 - bz0, K.woodD, { base: 0.3, tint: 0.03 });
  for (let z = bz0 + 0.2; z < bz1 - 0.3; z += 0.62) B.box(bx1 + 0.005, 0.1, z + 0.28, 0.02, BH - 0.28, 0.54, mix(K.wood, K.woodD, 0.4), { base: 0.2, tint: 0.04 }); // cabinet doors
  B.box((bx0 + bx1) / 2 + 0.03, BH - 0.05, bcz, bw + 0.08, 0.05, bz1 - bz0 + 0.04, mix(K.cream, K.creamD, 0.4), { base: 0.1, tint: 0.02 }); // counter top (stone)
  S.hit.box((bx0 + bx1) / 2, bcz, bw / 2 + 0.05, (bz1 - bz0) / 2, 0);
  // two shelves with bottles (decal strips + a few 3D bottles) and a mirror behind them
  B.quad([-5.995, 1.2, -3.9], [-5.995, 1.2, 1.4], [-5.995, 2.35, 1.4], [-5.995, 2.35, -3.9], mix(K.mint, K.teal, 0.4), mix(K.mint, K.teal, 0.4), mix(K.mint, K.teal, 0.7), mix(K.mint, K.teal, 0.7));
  [1.45, 1.95].forEach((y, si) => { B.box(-5.84, y, -1.25, 0.28, 0.04, 5.3, K.woodL, { base: 0.15 }); [-3.9, -0.4, 1.4].forEach((z) => B.box(-5.88, y - 0.18, z, 0.2, 0.18, 0.04, K.woodD, { base: 0 }));
    for (let z = -3.7; z < 1.3; z += 1.0) S.decal('bottles', -5.7, y + 0.2, z + 0.5, 0.95, 0.24, Math.PI / 2, 0, [1, 1, 1]);
    for (let k = 0; k < 9; k++) { const z = -3.6 + R() * 4.9, cc = [K.green, K.violet, K.orange, K.pink, K.yellow, K.cyan][(R() * 6) | 0]; B.cyl(-5.8, y + 0.04, z, 0.045, 0.05, 0.2, 6, cc, { base: 0.1 }); B.cyl(-5.8, y + 0.24, z, 0.018, 0.026, 0.1, 5, mul(cc, 0.85)); } });
  // wall menu and the neon beer sign / juice sign (screens: always lit)
  S.decal('menu', -5.98, 1.68, -3.35, 0.9, 0.56, Math.PI / 2, 0, [1.05, 1.05, 1.05]);
  S.screen('sign_beer', -5.96, 2.62, 0.35, 0.86, 0.86, Math.PI / 2, 0, [1.2, 1.2, 1.2]); S.lights.push({ x: -5.5, y: 2.5, z: 0.35, color: '#ffb23a', r: 2.0, i: 0.56, flicker: 0.25, kind: 'neon' });
  S.screen('sign_juice', -5.96, 2.78, -2.4, 1.3, 0.5, Math.PI / 2, 0, [1.2, 1.2, 1.2]); S.lights.push({ x: -5.5, y: 2.6, z: -2.4, color: '#9dff4a', r: 1.9, i: 0.49, kind: 'neon' });
  S.decal('records', -5.98, 1.1, 1.05, 0.7, 0.35, Math.PI / 2, 0, [1, 1, 1]);
  // ---------------------------------------------------------------- the green juice machine on the back bar (z = -2.2)
  { const jx = -5.62, jz = -2.2, y0 = BH;
    B.box(jx, y0, jz, 0.5, 0.2, 0.62, K.steelD, { base: 0.2, tint: 0.02, top: K.steel }); B.box(jx + 0.0, y0 + 0.2, jz, 0.46, 0.1, 0.58, K.steel, { base: 0.1 });
    // two big tanks (glass with glowing green juice) and a dome
    [-0.17, 0.17].forEach((dz, i) => { const z = jz + dz, jc = i ? GREENN : LIMEN;
      B.lathe([[0.13, 0.0, K.steelD], [0.14, 0.02, K.steel], [0.14, 0.05, K.steelL], [0.0, 0.05, K.steel]], 10, jx + 0.02, y0 + 0.3, z, {});
      GL.lathe([[0.115, 0.06, jc], [0.125, 0.3, jc], [0.12, 0.62, mul(jc, 0.9)], [0, 0.62, mul(jc, 0.9)]], 10, jx + 0.02, y0 + 0.3, z, { tint: 0.03 });
      B.lathe([[0.15, 0.64, K.steelL], [0.15, 0.68, K.steel], [0.1, 0.78, K.steelL], [0.03, 0.82, K.steel]], 10, jx + 0.02, y0 + 0.3, z, {});
      // glass shell (transparent) drawn as thin ring lines
      for (let k = 0; k < 10; k++) { const a = k * 0.628; bar(B, [jx + 0.02 + Math.cos(a) * 0.14, y0 + 0.36, z + Math.sin(a) * 0.14], [jx + 0.02 + Math.cos(a) * 0.14, y0 + 0.92, z + Math.sin(a) * 0.14], 0.01, 0.01, K.steelL); }
      B.box(jx + 0.26, y0 + 0.08, z, 0.06, 0.05, 0.05, K.steelD, { base: 0 }); B.box(jx + 0.3, y0 + 0.02, z, 0.025, 0.09, 0.025, K.steelL, { base: 0 }); }); // spigots
    B.box(jx + 0.22, y0 + 0.0, jz, 0.18, 0.02, 0.5, K.ink, { base: 0 }); // drip tray
    GL.box(jx + 0.24, y0 + 0.2, jz, 0.01, 0.06, 0.4, GREENN, { base: 0, tint: 0 }); // glowing label strip
    S.lights.push({ x: jx + 0.3, y: y0 + 0.7, z: jz, color: '#7dff8a', r: 1.4, i: 0.56, kind: 'fridge' });
    // blender + a bowl of fruit next to it
    B.lathe([[0.08, 0, K.steelD], [0.09, 0.1, K.steel], [0.0, 0.1, K.steel]], 8, jx, y0, jz + 0.62, {}); B.lathe([[0.075, 0.1, mix(K.mint, K.ink, 0.1)], [0.1, 0.34, mix(K.mint, K.cream, 0.4)], [0.0, 0.34, K.mint]], 8, jx, y0, jz + 0.62, {}); B.box(jx, y0 + 0.34, jz + 0.62, 0.12, 0.04, 0.12, K.ink, { base: 0 });
    B.lathe([[0.14, 0, K.cream], [0.2, 0.07, K.creamD], [0.0, 0.07, K.cream]], 8, jx + 0.0, y0, jz - 0.65, {}); [[K.orange, 0.0, 0.0], [K.yellow, 0.07, 0.04], [K.red, -0.05, 0.05], [K.lime, 0.04, -0.07]].forEach(([c0, dx, dz], i) => B.blob(jx + dx, y0 + 0.12 + (i > 1 ? 0.05 : 0), jz - 0.65 + dz, 0.065, 0.06, 0.065, mul(c0, 0.7), c0, { detail: 0, jit: 0.04 })); }
  // cooler (glass door glowing) at z = -3.55
  { const fx = -5.62, fz = -3.5; B.box(fx, 0, fz, 0.6, 0.0, 0.7, K.steelD, { base: 0 }); GL.box(fx + 0.3, 0.12, fz, 0.012, 1.0, 0.56, [0.7, 1.4, 1.5], { base: 0, tint: 0 }); S.lights.push({ x: fx + 0.5, y: 0.8, z: fz, color: '#aef0ff', r: 1.3, i: 0.35, kind: 'fridge' }); }
  // ---------------------------------------------------------------- on the counter: till, tips jar, jugs, tap tower, bell
  { const x = -4.35, ty = TOP;
    B.box(x, ty, -3.5, 0.4, 0.18, 0.36, K.steelD, { base: 0.1, top: K.steel }); B.push(x, ty + 0.18, -3.5, 0, 1, -0.5); B.box(0, 0, 0, 0.3, 0.2, 0.04, K.ink, { base: 0 }); GL.push(x, ty + 0.18, -3.5, 0, 1, -0.5); GL.quad([-0.12, 0.02, 0.022], [0.12, 0.02, 0.022], [0.12, 0.17, 0.022], [-0.12, 0.17, 0.022], [0.5, 1.8, 0.8]); GL.pop(); B.pop();
    B.lathe([[0.1, 0, K.cream], [0.11, 0.06, K.mint], [0.1, 0.2, mix(K.mint, K.cream, 0.5)], [0.07, 0.24, K.steelL], [0, 0.24, K.steelL]], 8, x + 0.05, ty, 0.6, {}); S.decal('tips', x + 0.14, ty + 0.1, 0.6, 0.17, 0.085, Math.PI / 2, 0, [1.05, 1.05, 1.05]); B.box(x + 0.05, ty + 0.14, 0.6, 0.12, 0.05, 0.1, K.green, { base: 0, tint: 0.1 }); // tips jar with notes
    [-1.2, -0.7].forEach((z, i) => { const cc = i ? K.orange : K.pink; B.lathe([[0.07, 0, mul(cc, 0.8)], [0.09, 0.12, cc], [0.07, 0.24, mix(cc, K.cream, 0.4)]], 8, x + 0.0, ty, z, {}); GL.lathe([[0.075, 0.02, mul(cc, 2.0)], [0.085, 0.12, mul(cc, 2.0)], [0, 0.12, mul(cc, 2.0)]], 8, x + 0.0, ty, z, { tint: 0 }); });
    [0, 1, 2].forEach((i) => B.box(x - 0.1, ty, 1.35 + i * 0.12, 0.04, 0.16 + (i % 2) * 0.03, 0.04, [K.pink, K.cyan, K.yellow][i], { base: 0.1 }));
    B.lathe([[0.06, 0, K.goldD], [0.05, 0.03, K.gold], [0.0, 0.05, K.gold]], 8, x + 0.1, ty, -0.1, {}); }
  // ---------------------------------------------------------------- pendant lamps on the ceiling beam
  [-3.6, -2.5, -1.4, -0.3, 0.8].forEach((z, i) => { const x = -4.4, top = 3.04, ly = 2.35; bar(B, [x, top, z], [x, ly + 0.24, z], 0.012, 0.012, K.ink);
    B.lathe([[0.04, 0.24, K.ink], [0.14, 0.12, mix(K.velvetD, K.goldD, 0.4)], [0.2, 0.0, K.gold], [0.19, -0.01, mix(K.goldD, K.ink, 0.4)]], 9, x, ly, z, {});
    GL.lathe([[0.08, 0.02, WARMS], [0.0, 0.03, WARMS]], 8, x, ly - 0.02, z, {}); });
  S.lights.push({ x: -4.4, y: 2.3, z: -2.9, color: '#ffc46b', r: 2.0, i: 0.56, kind: 'lamp' }, { x: -4.4, y: 2.3, z: -0.4, color: '#ffc46b', r: 2.0, i: 0.56, kind: 'lamp' });
  [-3.6, -1.9, -0.2, 1.0].forEach((z) => lightPool(S.SOFT, -3.9, 0.02, z, 1.3, 1.0, '#ffb060', 0.2));
  // anchors
  S.anchors.rohzel = { x: -5.0, z: -0.7, rot: Math.PI / 2 }; S.anchors.counterSpot = { x: -2.55, z: -0.9, rot: -Math.PI / 2 };
  STOOLS.forEach((s, i) => { S.anchors['stool' + i] = { x: s.x, z: s.z, rot: -Math.PI / 2, seatY: 0.68 }; });
}
