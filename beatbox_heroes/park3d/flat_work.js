// Flat3D desk nook and the vocal booth (Interior Artist): stream desk with PC, monitor, ring light, mic arm, pad controller, gaming chair; padded booth with foam, mic and the glowing OCCUPIED sign.
import { P, mix, mul, bar, plant, WARM, WARMS, PINKN, CYANN, YELN, WHITEN, GREENN, REDN } from './flat_kit.js';
import { WALLS, wbox } from './flat_shell.js';

export function buildWork(S) {
  const B = S.B, G = S.GLOW, hit = S.hit, R = S.rand;

  // ---------------------------------------------------------------- desk nook under the north window
  { const dx = -0.25, dz = -5.1, W = 2.5, D = 0.7, h = 0.75, ty = h + 0.02;
    S.soft(dx, dz + 0.3, 1.6, 0.9, 0.4);
    B.box(dx, h - 0.03, dz, W, 0.05, D, mix(P.pine, P.woodL, 0.3), { base: 0.1, tint: 0.03, top: mix(P.pine, P.cream, 0.35) });
    // left legs (black steel), right drawer pedestal
    B.box(dx - W / 2 + 0.05, 0, dz + D / 2 - 0.05, 0.05, h - 0.03, 0.05, P.black, { base: 0.3 }); B.box(dx - W / 2 + 0.05, 0, dz - D / 2 + 0.05, 0.05, h - 0.03, 0.05, P.black, { base: 0.3 });
    const px = dx + W / 2 - 0.3; B.box(px, 0.04, dz, 0.55, h - 0.07, D - 0.04, mix(P.tealD, P.teal, 0.5), { base: 0.35, tint: 0.03 });
    [0.1, 0.32, 0.54].forEach((y, i) => { B.box(px, y, dz + D / 2 - 0.015, 0.5, 0.2, 0.016, mix(P.teal, P.tealL, i * 0.2), { base: 0.1, tint: 0.04 }); B.box(px, y + 0.1, dz + D / 2 + 0.005, 0.14, 0.016, 0.02, P.steelL, { base: 0 }); });
    // PC tower under the desk with an RGB strip
    { const tx = dx - 0.7, tz = dz - 0.05; B.box(tx, 0, tz, 0.24, 0.5, 0.5, P.ink, { base: 0.3, tint: 0.02, top: P.inkL }); G.box(tx + 0.125, 0.06, tz - 0.2, 0.012, 0.36, 0.03, PINKN, { base: 0, tint: 0 }); G.box(tx + 0.125, 0.06, tz - 0.05, 0.012, 0.36, 0.03, CYANN, { base: 0, tint: 0 }); G.box(tx + 0.125, 0.06, tz + 0.1, 0.012, 0.36, 0.03, YELN, { base: 0, tint: 0 }); }
    // monitor (livestream) with the stream UI
    { const mx = dx - 0.35, mz = dz - 0.12; B.box(mx, ty, mz, 0.3, 0.02, 0.2, P.ink, { base: 0, taper: 0.8 }); B.box(mx, ty + 0.02, mz - 0.02, 0.06, 0.2, 0.04, P.ink, { base: 0 });
      B.box(mx, ty + 0.2, mz + 0.0, 0.8, 0.47, 0.04, P.ink, { base: 0, tint: 0.01 }); S.screen('monitor', mx, ty + 0.2 + 0.235, mz + 0.022, 0.75, 0.42, 0, 0, [1.1, 1.1, 1.1]); }
    // second device: tablet with a chat window, pad controller
    { const cx = dx - 0.95, cz = dz + 0.12; B.box(cx, ty, cz, 0.3, 0.025, 0.3, P.inkL, { base: 0, ry: 0.3 }); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const c = [PINKN, CYANN, YELN, GREENN][(i + j) % 4]; G.box(cx - 0.09 + i * 0.06 - 0.025 + 0.0, ty + 0.025, cz - 0.09 + j * 0.06 - 0.025, 0.05, 0.012, 0.05, c, { base: 0, tint: 0 }); } }
    // keyboard and mouse on a deskmat
    B.box(dx - 0.22, ty, dz + 0.18, 0.95, 0.008, 0.28, P.inkL, { base: 0, top: mix(P.inkL, P.violet, 0.2) }); B.box(dx - 0.35, ty + 0.008, dz + 0.2, 0.42, 0.02, 0.14, P.black, { base: 0 }); G.box(dx - 0.35, ty + 0.028, dz + 0.26, 0.4, 0.004, 0.012, PINKN, { base: 0, tint: 0 }); G.box(dx - 0.35, ty + 0.028, dz + 0.14, 0.4, 0.004, 0.012, CYANN, { base: 0, tint: 0 }); B.box(dx + 0.12, ty + 0.008, dz + 0.2, 0.07, 0.025, 0.11, P.ink, { base: 0, ry: 0.2 });
    // ring light on a stand behind the monitor, phone in the middle
    { const rx = dx + 0.55, ry = ty + 0.55, rz = dz - 0.1, r = 0.24, n = 14; bar(B, [rx, ty, rz], [rx, ry - r, rz], 0.03, 0.03, P.black); B.box(rx, ty, rz, 0.24, 0.02, 0.2, P.black, { base: 0, taper: 0.8 });
      for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283; bar(G, [rx + Math.cos(a0) * r, ry + Math.sin(a0) * r, rz], [rx + Math.cos(a1) * r, ry + Math.sin(a1) * r, rz], 0.03, 0.03, WHITEN); bar(B, [rx + Math.cos(a0) * (r + 0.02), ry + Math.sin(a0) * (r + 0.02), rz - 0.02], [rx + Math.cos(a1) * (r + 0.02), ry + Math.sin(a1) * (r + 0.02), rz - 0.02], 0.045, 0.045, P.ink); }
      B.box(rx - 0.05, ry - 0.09, rz + 0.02, 0.1, 0.18, 0.012, P.black, { base: 0 }); B.box(rx, ry - 0.01, rz + 0.012, 0.1, 0.01, 0.01, P.steelD, { base: 0 });
      S.lights.push({ x: rx, y: ry, z: rz + 0.8, color: '#fff1dc', r: 4.5, i: 0.8, kind: 'lamp' }); }
    // mic arm clamped to the desk edge, condenser mic and pop filter
    { const cx = dx + 0.95, cz = dz + 0.33; B.box(cx, h - 0.1, cz, 0.06, 0.1, 0.07, P.black, { base: 0 }); bar(B, [cx, h - 0.04, cz], [cx, ty + 0.5, cz], 0.025, 0.025, P.black); bar(B, [cx, ty + 0.5, cz], [cx - 0.5, ty + 0.58, cz - 0.05], 0.022, 0.022, P.black); bar(B, [cx - 0.5, ty + 0.58, cz - 0.05], [cx - 0.5, ty + 0.5, cz + 0.0], 0.02, 0.02, P.steelD);
      B.lathe([[0.03, 0, P.steelD], [0.04, 0.04, P.ink], [0.04, 0.16, mix(P.mustard, P.ink, 0.2)], [0.0, 0.17, P.mustard]], 8, cx - 0.5, ty + 0.34, cz + 0.0, {}); B.push(cx - 0.5, ty + 0.4, cz + 0.1, 0, 1, Math.PI / 2); B.lathe([[0.09, 0, P.black], [0.09, 0.012, P.inkL], [0.0, 0.012, P.inkL]], 10, 0, 0, 0, {}); B.pop(); }
    // headphones on a stand, mug, cactus, notes
    bar(B, [dx + 1.05, ty, dz - 0.1], [dx + 1.05, ty + 0.3, dz - 0.1], 0.02, 0.02, P.steelD); B.lathe([[0.03, 0, P.pink], [0.03, 0.04, P.pinkL], [0, 0.04, P.pink]], 8, dx + 1.0, ty + 0.3, dz - 0.1, {}); B.lathe([[0.03, 0, P.pink], [0.03, 0.04, P.pinkL], [0, 0.04, P.pink]], 8, dx + 1.1, ty + 0.3, dz - 0.1, {}); bar(B, [dx + 1.0, ty + 0.34, dz - 0.1], [dx + 1.05, ty + 0.39, dz - 0.1], 0.015, 0.015, P.ink); bar(B, [dx + 1.05, ty + 0.39, dz - 0.1], [dx + 1.1, ty + 0.34, dz - 0.1], 0.015, 0.015, P.ink);
    B.lathe([[0.04, 0, P.cream], [0.045, 0.09, P.cream], [0.0, 0.09, P.coral]], 8, dx - 1.1, ty, dz + 0.22, {}); plant(S, dx - 1.0, ty, dz - 0.2, 'cactus', 0.7, { pot: P.mustard, pr: 0.1, ph: 0.12 });
    B.box(dx + 0.7, ty, dz + 0.22, 0.2, 0.02, 0.28, P.cream, { base: 0, ry: 0.2 }); B.box(dx + 0.52, ty, dz + 0.24, 0.07, 0.006, 0.07, P.yellow, { base: 0, ry: 0.4 }); B.box(dx + 0.46, ty + 0.006, dz + 0.22, 0.07, 0.006, 0.07, P.pinkL, { base: 0, ry: 0.1 });
    hit.box(dx, dz + 0.05, W / 2 + 0.02, D / 2 + 0.05, 0);
    // wall dressing: posters, neon BEAT sign, calendar
    B.box(-1.5, 1.45, -5.488, 0.5, 0.74, 0.012, P.ink, { base: 0 }); S.decal('poster_e', -1.5, 1.82, -5.478, 0.46, 0.66, 0, 0, [1.05, 1.05, 1.05]);
    S.screen('beatsign', 1.28, 1.98, -5.485, 0.72, 0.27, 0, 0, [1.25, 1.25, 1.25]); S.lights.push({ x: 1.28, y: 1.95, z: -5.0, color: '#ff3d9a', r: 4, i: 0.5, kind: 'neon' });
    S.decal('calendar', 1.5, 1.35, -5.49, 0.26, 0.34, 0, 0, [1.05, 1.05, 1.05], -0.03);
    S.anchors.deskSpot = { x: -0.4, z: -4.05, rot: Math.PI };
  }
  // gaming chair, pushed back and turned toward the desk
  { const cx = 0.7, cz = -3.55, ry = 0.55; S.soft(cx, cz, 0.45, 0.45, 0.4);
    B.push(cx, 0, cz, ry);
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; bar(B, [0, 0.12, 0], [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], 0.04, 0.03, P.black); B.box(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0.05, 0.05, 0.05, P.ink, { base: 0 }); }
    B.cyl(0, 0.1, 0, 0.03, 0.03, 0.32, 6, P.steelD); B.box(0, 0.42, 0, 0.5, 0.09, 0.5, P.ink, { base: 0.3, taper: 0.92, top: P.inkL }); B.box(0, 0.46, 0, 0.36, 0.07, 0.46, P.pink, { base: 0, taper: 0.9 }); // seat
    B.push(0, 0.5, 0.25, 0, 1, -0.14); B.box(0, 0, 0, 0.48, 0.72, 0.1, P.ink, { base: 0.1, taper: 0.94, top: P.inkL }); B.box(0, 0.08, -0.03, 0.26, 0.56, 0.06, P.pink, { base: 0, taper: 0.92 }); B.box(0, 0.7, -0.01, 0.3, 0.2, 0.1, P.ink, { base: 0, taper: 0.9 }); B.box(-0.22, 0.04, -0.02, 0.06, 0.4, 0.08, P.inkL, { base: 0, tint: 0.03 }); B.box(0.22, 0.04, -0.02, 0.06, 0.4, 0.08, P.inkL, { base: 0, tint: 0.03 }); B.pop();
    [-1, 1].forEach((s) => { B.box(s * 0.28, 0.52, 0.0, 0.05, 0.04, 0.3, P.inkL, { base: 0 }); B.box(s * 0.28, 0.5, 0.1, 0.025, 0.1, 0.025, P.steelD, { base: 0 }); });
    B.pop(); hit.circle(cx, cz, 0.34); }

  // ---------------------------------------------------------------- vocal booth (north-east corner): foam, mic, OCCUPIED sign
  { const x0 = 5.45, x1 = 7.5, z0 = -5.5, z1 = -3.3, shell = col2('#3b2f5a'), tall = 2.2, low = 1.2;
    S.soft(6.5, -4.4, 1.3, 1.3, 0.3);
    B.box((x0 + 0.08), 0, (z0 + z1) / 2, 0.16, tall, z1 - z0, shell, { base: 0.2, tint: 0.03 }); // west wall (full)
    B.box(x0 + 0.08 + 0.0, tall, (z0 + z1) / 2, 0.2, 0.05, z1 - z0 + 0.04, P.pink, { base: 0 }); // top trim
    // front wall with a door gap (x 5.6..6.45), east wall of the booth, both cut low
    const fz = z1 - 0.07; B.box((6.45 + x1) / 2, 0, fz, x1 - 6.45, low, 0.14, shell, { base: 0.2, tint: 0.03, top: mix(shell, P.pink, 0.4) }); B.box((x0 + 0.16 + 0.0) + 0.0, 0, fz, 0.0001, 0.0001, 0.0001, shell, { base: 0 });
    B.box(x1 - 0.2, 0, (z0 + z1) / 2 - 0.0, 0.2, low, z1 - z0 - 0.0, shell, { base: 0.2, tint: 0.03, top: mix(shell, P.pink, 0.4) });
    B.box(5.53 + 0.0, 0, fz, 0.0001, 0.0001, 0.0001, shell, { base: 0 });
    // door frame posts rising above the front wall carry the sign
    B.box(5.68, 0, fz, 0.08, 1.55, 0.14, mix(shell, P.ink, 0.2), { base: 0.1 }); B.box(6.42, 0, fz, 0.08, 1.55, 0.14, mix(shell, P.ink, 0.2), { base: 0.1 });
    B.box(6.05, 1.52, fz, 0.86, 0.34, 0.1, P.ink, { base: 0 }); G.box(6.05 - 0.4, 1.54, fz + 0.056, 0.8, 0.3, 0.012, [2.2, 0.35, 0.3], { base: 0, tint: 0 });
    S.screen('occupied', 6.05, 1.69, fz + 0.064, 0.78, 0.26, 0, 0, [1.4, 1.4, 1.4]); S.lights.push({ x: 6.05, y: 1.65, z: fz + 0.5, color: '#ff4a3a', r: 3.0, i: 0.6, kind: 'neon' });
    G.box(6.0, low, fz + 0.075, 1.5, 0.03, 0.012, PINKN, { base: 0, tint: 0 }); // LED lip
    // foam panels: pyramids on the north wall (facing +z) and the west wall (facing +x)
    const fc = [col2('#2b2f4a'), col2('#4a3a78'), col2('#2f5d6e'), col2('#3b2f5a')];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) { const x = x0 + 0.16 + 0.17 + i * 0.3, y = 0.7 + j * 0.3, c = ((i + j) % 4 === 0 && j > 1) ? col2('#7a2f6e') : fc[(i * 3 + j) % 4]; B.push(x, y, z0 + 0.01, 0, 1, Math.PI / 2); B.pyr(0, 0, 0, 0.28, 0.1, c, 0.0); B.pop(); }
    for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) { const z = z0 + 0.17 + i * 0.3, y = 0.7 + j * 0.3, c = ((i * 2 + j) % 5 === 0 && j > 1) ? col2('#7a2f6e') : fc[(i + j * 2) % 4]; B.push(x0 + 0.16, y, z, 0, 1, 0, -Math.PI / 2); B.pyr(0, 0, 0, 0.28, 0.1, c, 0.0); B.pop(); }
    B.box(6.5, 0.0, z0 + 0.012, 1.7, 0.7, 0.012, mix(shell, P.ink, 0.3), { base: 0.2 }); B.box(x0 + 0.16, 0.0, -4.4, 0.012, 0.7, 2.1, mix(shell, P.ink, 0.3), { base: 0.2 });
    // vocal mic on a stand with a pop filter, lyrics stand, stool, towel and water bottle
    { const mx = 6.85, mz = -4.5; B.cyl(mx, 0.0, mz, 0.2, 0.2, 0.02, 7, P.black); bar(B, [mx, 0.02, mz], [mx, 1.35, mz], 0.025, 0.025, P.steelD); bar(B, [mx, 1.35, mz], [mx - 0.05, 1.5, mz + 0.18], 0.02, 0.02, P.steelD);
      B.lathe([[0.04, 0, P.ink], [0.05, 0.04, P.ink], [0.05, 0.2, P.mustard], [0.0, 0.21, P.mustardD]], 8, mx - 0.05, 1.42, mz + 0.18, {}); B.push(mx - 0.05, 1.55, mz + 0.32, 0, 1, Math.PI / 2); B.lathe([[0.1, 0, P.black], [0.1, 0.012, P.inkL], [0.0, 0.012, P.inkL]], 10, 0, 0, 0, {}); B.pop();
      B.cyl(6.1, 0, -4.9, 0.17, 0.2, 0.55, 7, P.coral); B.cyl(6.1, 0.55, -4.9, 0.2, 0.2, 0.04, 7, mix(P.coral, P.cream, 0.3)); B.box(6.1, 0.59, -4.9, 0.3, 0.02, 0.18, P.cream, { base: 0, ry: 0.4 }); // stool and towel
      B.lathe([[0.04, 0, P.tealL], [0.04, 0.2, P.tealL], [0.02, 0.24, P.ink]], 7, 6.45, 0, -3.65, {});
      bar(B, [5.95, 0.02, -3.8], [5.95, 1.2, -3.8], 0.02, 0.02, P.steelD); B.box(5.95, 1.1, -3.82, 0.3, 0.2, 0.01, P.cream, { base: 0 }); void mz;
      hit.box(6.47, -4.4, 1.03, 1.1, 0); }
    S.lights.push({ x: 6.5, y: 2.0, z: -4.6, color: '#c77dff', r: 3.2, i: 0.5, kind: 'neon' });
    S.anchors.boothSpot = { x: 6.05, z: -2.55, rot: Math.PI };
  }
}
import { col } from './flat_kit.js';
function col2(h) { return col(h); }
