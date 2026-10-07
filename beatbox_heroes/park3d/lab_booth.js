// Sound Lab vocal booth (Interior Artist INT-A): glass walls with steel and magenta frames (door gap in the south pane), foam, condenser mic on a boom with shock mount and pop filter,
// reflection shield, stool, lyric stand, headphones, a REC lamp over the door and an ON AIR sign. The lamp and sign are separate tiny meshes so they can switch state (setRec).
import { THREE } from './kit.js';
import { P, mix, mul, bar, col } from './flat_kit.js';
import { foam, rect, cable } from './lab_room.js';

const C = (h) => col(h);
export const BOOTH = { x0: 1.7, x1: 4.5, z0: -3.5, z1: -0.55, door0: 1.85, door1: 2.95, mic: { x: 2.85, z: -1.8 }, stand: { x: 3.5, z: -1.8 } };

export function buildBooth(S, F, atlasRect) {
  const B = S.B, G = S.GLOW, GL = S.GLASS, hit = S.hit, b = BOOTH, steel = C('#7d7aa0'), steelD = C('#4a4668'), pink = C('#ff4f8b');
  S.soft(3.1, -2.0, 1.5, 1.5, 0.3);
  // ---- west glass wall (x = 1.7, z -3.5..-0.55) and south glass wall (z = -0.55, x 1.7..4.5 with a door gap): posts, rails, kick panel, glass
  const glass = [0.55, 0.85, 1.0, 0.15], H = 2.2;
  const post = (x, z) => { B.box(x, 0, z, 0.08, H, 0.08, steel, { base: 0.2, tint: 0.03, top: mix(steel, P.cream, 0.2) }); };
  [-3.46, -2.5, -1.5, -0.59].forEach((z) => post(b.x0, z)); [b.x0 + 0.04, b.door0, b.door1, 3.7, b.x1 - 0.06].forEach((x) => post(x, b.z1));
  B.box(b.x0, H, -2.02, 0.1, 0.05, 2.97, steel, { base: 0 }); B.box(b.x0, 0.0, -2.02, 0.1, 0.16, 2.97, steelD, { base: 0.1 }); B.box(b.x0, 0.0, -2.02, 0.12, 0.012, 2.97, pink, { base: 0 });
  B.box((b.x0 + b.door0) / 2 + 0.0, H, b.z1, 0.2, 0.05, 0.1, steel, { base: 0 }); B.box((b.door1 + b.x1) / 2, H, b.z1, b.x1 - b.door1, 0.05, 0.1, steel, { base: 0 }); B.box((b.door1 + b.x1) / 2, 0.0, b.z1, b.x1 - b.door1, 0.16, 0.1, steelD, { base: 0.1 });
  B.box((b.door0 + b.door1) / 2, 1.96, b.z1, b.door1 - b.door0 + 0.08, 0.26, 0.1, steelD, { base: 0.1, top: steel }); B.box((b.door0 + b.door1) / 2, 1.94, b.z1, b.door1 - b.door0 + 0.12, 0.03, 0.12, pink, { base: 0 });
  B.box((b.door0 + b.door1) / 2, 0.0, b.z1, b.door1 - b.door0, 0.012, 0.1, mix(P.pink, P.ink, 0.2), { base: 0 }); // threshold
  const zq = (zA, zB) => { GL.quad([b.x0, 0.16, zA], [b.x0, 0.16, zB], [b.x0, H, zB], [b.x0, H, zA], glass); GL.quad([b.x0, 0.16, zB], [b.x0, 0.16, zA], [b.x0, H, zA], [b.x0, H, zB], glass); };
  zq(-3.42, -2.54); zq(-2.46, -1.54); zq(-1.46, -0.63);
  const xq = (xA, xB) => { GL.quad([xA, 0.16, b.z1], [xB, 0.16, b.z1], [xB, H, b.z1], [xA, H, b.z1], glass); GL.quad([xB, 0.16, b.z1], [xA, 0.16, b.z1], [xA, H, b.z1], [xB, H, b.z1], glass); };
  xq(b.door1 + 0.04, 3.66); xq(3.74, b.x1 - 0.1); xq(b.x0 + 0.04, b.door0 - 0.04);
  // etched glass band and a warm light strip on the posts
  G.box(b.x0 - 0.01, 2.1, -2.02, 0.012, 0.02, 2.9, [3.2, 0.5, 1.6], { base: 0, tint: 0 }); G.box(b.door1 + 0.1, 2.12, b.z1 + 0.03, b.x1 - b.door1 - 0.1, 0.02, 0.012, [3.2, 0.5, 1.6], { base: 0, tint: 0 });
  hit.box(b.x0, -2.02, 0.06, 1.5, 0); hit.box((b.x0 + b.door0) / 2, b.z1, (b.door0 - b.x0) / 2 + 0.04, 0.06, 0); hit.box((b.door1 + b.x1) / 2, b.z1, (b.x1 - b.door1) / 2, 0.06, 0);
  // ---- foam on the booth's north wall (u from 6.2 on) and the lower east wall, with a hole for the ON AIR sign
  foam(B, F.N, 6.25, 9.0, 0.5, 2.6, rect(7.2, 8.7, 2.1, 2.5), 3); foam(B, F.E, 0.2, 2.9, 0.12, 0.88, null, 4, 0.25);
  // ---- mic (local frame: +z points at the singer, who stands east of the mic): round base, stand, boom, shock mount with a large-diaphragm condenser, pop filter on a gooseneck, reflection shield behind
  { const mx = b.mic.x, mz = b.mic.z, my = 1.5; S.soft(mx + 0.1, mz, 0.5, 0.5, 0.4); B.push(mx, 0, mz, Math.PI / 2);
    B.cyl(0, 0, -0.06, 0.24, 0.24, 0.03, 10, P.black); B.cyl(0, 0.03, -0.06, 0.03, 0.03, 1.5, 6, P.steelL); bar(B, [0, 1.5, -0.06], [0, my + 0.1, 0.0], 0.026, 0.026, P.steelL); B.box(0, 1.5, -0.06, 0.06, 0.06, 0.06, P.ink, { base: 0 });
    B.cyl(0, my - 0.14, 0, 0.07, 0.07, 0.012, 12, P.black); [-0.07, 0.07].forEach((dx) => B.box(dx, my - 0.13, 0, 0.012, 0.27, 0.012, P.black, { base: 0 })); B.box(0, my + 0.13, 0, 0.16, 0.012, 0.012, P.black, { base: 0 });
    B.lathe([[0.045, 0, C('#2a2a38')], [0.052, 0.04, C('#3a3a50')], [0.056, 0.22, C('#d8b04a')], [0.045, 0.255, C('#e8c86a')], [0.0, 0.26, C('#e8c86a')]], 10, 0, my - 0.13, 0, {}); B.lathe([[0.046, 0.0, mix(C('#d8b04a'), P.ink, 0.5)], [0.046, 0.18, mix(C('#d8b04a'), P.ink, 0.6)]], 10, 0, my - 0.1, 0, {});
    const fz = 0.17; B.push(0, my + 0.02, fz, 0, 1, Math.PI / 2); B.lathe([[0.11, 0.0, P.black], [0.11, 0.016, P.inkL], [0.0, 0.016, mix(P.ink, P.steelL, 0.5)]], 14, 0, 0, 0, {}); B.pop(); B.push(0, my + 0.02, fz + 0.002, 0, 1, Math.PI / 2); B.lathe([[0.1, 0.0, mix(P.cream, P.ink, 0.5)], [0.0, 0.0, mix(P.cream, P.ink, 0.5)]], 14, 0, 0, 0, {}); B.pop();
    bar(B, [0, 0.95, 0.0], [0.0, 1.3, 0.1], 0.016, 0.016, P.steelD); bar(B, [0, 1.3, 0.1], [0, my + 0.0, fz], 0.016, 0.016, P.steelD);
    B.cyl(0, 0, -0.75, 0.22, 0.22, 0.03, 8, P.black); B.cyl(0, 0.03, -0.75, 0.03, 0.03, 1.1, 6, P.steelD); [[0, 0], [-0.33, -0.55], [0.33, 0.55]].forEach(([dx, ang], i) => { B.push(dx, 0.95, -0.75 + (i ? 0.1 : 0), ang * 0.6); B.box(0, 0, 0, 0.42, 0.62, 0.06, C('#2a2438'), { base: 0.2 }); B.box(0, 0.04, 0.034, 0.38, 0.54, 0.01, [C('#5a4a98'), C('#2f7d86'), C('#6a3b8f')][i], { base: 0 }); for (let k = 0; k < 4; k++) for (let j = 0; j < 5; j++) { B.push(-0.15 + k * 0.1, 0.1 + j * 0.1, 0.045, 0, 1, Math.PI / 2); B.pyr(0, 0, 0, 0.095, 0.03, [C('#6a5ab8'), C('#3f9aa6'), C('#8a4ba8')][i], 0); B.pop(); } B.pop(); });
    B.pop(); S.lights.push({ x: mx + 0.6, y: 1.9, z: mz, color: '#ff6aa8', r: 3.4, i: 0.55, kind: 'neon' }); hit.circle(mx, mz, 0.2); hit.box(mx - 0.75, mz, 0.2, 0.5, 0); }
  // stool with a towel and a water bottle; lyric stand with a sheet; headphones on a wall hook; a coiled cable
  { const sx = 4.12, sz = -0.95; S.soft(sx, sz, 0.4, 0.4, 0.35); B.lathe([[0.18, 0.62, C('#e8604a')], [0.19, 0.67, C('#f07a5a')], [0.0, 0.67, C('#f89a7a')]], 10, sx, 0, sz, {}); [0, 2.09, 4.19].forEach((a) => bar(B, [sx + Math.cos(a) * 0.13, 0.62, sz + Math.sin(a) * 0.13], [sx + Math.cos(a) * 0.22, 0, sz + Math.sin(a) * 0.22], 0.025, 0.025, P.steelD)); B.cyl(sx, 0.28, sz, 0.17, 0.17, 0.014, 8, P.steelD);
    B.lathe([[0.03, 0, C('#35c8e0')], [0.034, 0.16, C('#58d8f0')], [0.016, 0.2, P.cream], [0.0, 0.22, P.cream]], 8, sx + 0.05, 0.67, sz - 0.02, {}); B.box(sx - 0.07, 0.67, sz + 0.05, 0.2, 0.02, 0.16, P.cream, { base: 0.1, ry: 0.4 }); hit.circle(sx, sz, 0.24);
    const lx = 2.4, lz = -2.75; B.cyl(lx, 0, lz, 0.2, 0.2, 0.025, 8, P.black); B.cyl(lx, 0.025, lz, 0.016, 0.016, 1.15, 6, P.steelD); B.push(lx, 1.12, lz, 0.5, 1, -0.3); B.box(0, 0, 0, 0.5, 0.012, 0.3, P.black, { base: 0 }); B.box(0, 0.01, 0.0, 0.42, 0.003, 0.26, P.cream, { base: 0 }); B.box(0, 0.0, 0.14, 0.5, 0.03, 0.02, P.black, { base: 0 }); B.pop(); hit.circle(lx, lz, 0.2);
    // headphones on the wall, a patch of gaffa tape, a small wall speaker cube
    bar(B, [2.35, 1.6, -3.46], [2.35, 1.6, -3.38], 0.012, 0.012, P.steelL); [-0.07, 0.07].forEach((dx) => B.lathe([[0.055, 0, P.pink], [0.055, 0.04, P.pinkL], [0, 0.04, P.pink]], 8, 2.35 + dx, 1.4, -3.38, { sx: 0.8 })); bar(B, [2.28, 1.46, -3.38], [2.35, 1.6, -3.38], 0.014, 0.014, P.ink); bar(B, [2.35, 1.6, -3.38], [2.42, 1.46, -3.38], 0.014, 0.014, P.ink);
    B.box(4.4, 1.9, -3.4, 0.2, 0.2, 0.18, C('#20202e'), { base: 0.2 }); B.lathe([[0.07, 0, P.black], [0.07, 0.01, P.inkL], [0, 0.02, P.steelD]], 8, 4.4, 2.0, -3.3, { ry: 0 }); }
  S.decal('rug_l2', 3.2, 0.017, -1.65, 1.5, 1.05, 0.0, -Math.PI / 2, [1, 1, 1]);
  cable(B, [[b.mic.x, b.mic.z - 0.06], [3.7, -2.3], [3.9, -3.0], [4.2, -3.4]], 0.02, P.ink, 0.014);
  // ---- ON AIR sign (north wall) and the REC lamp (over the door): own small meshes so they can change state
  const R = atlasRect, tex = S.atlas.tex, mkPlane = (rc, w, h, x, y, z, ry, name) => { const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, rc[0] + uv.getX(k) * (rc[2] - rc[0]), rc[1] + uv.getY(k) * (rc[3] - rc[1])); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })); m.position.set(x, y, z); m.rotation.y = ry; m.name = name; m.renderOrder = 3; return m; };
  const onA = mkPlane(R.onair, 0.78, 0.29, 3.45, 2.28, -3.46, 0, 'lab_onair'), offA = mkPlane(R.onair_off, 0.78, 0.29, 3.45, 2.28, -3.46, 0, 'lab_onair_off'); B.box(3.45, 2.1, -3.47, 0.84, 0.36, 0.04, P.ink, { base: 0 }); [-0.34, 0.34].forEach((dx) => bar(B, [3.45 + dx, 2.46, -3.48], [3.45 + dx, 2.6, -3.48], 0.01, 0.01, P.steelD));
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.04, 0.04), toneMapped: false }), lampG = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14); lampG.rotateX(Math.PI / 2); const lampM = new THREE.Mesh(lampG, lampMat); lampM.position.set((b.door0 + b.door1) / 2, 2.0, b.z1 + 0.08); lampM.name = 'lab_reclamp';
  B.cyl((b.door0 + b.door1) / 2 - 0.0, 2.2, b.z1 + 0.08, 0.13, 0.13, 0.03, 10, P.black); B.box((b.door0 + b.door1) / 2, 1.88, b.z1 + 0.02, 0.4, 0.04, 0.02, P.black, { base: 0 });
  S.extraMeshes = (S.extraMeshes || []).concat([onA, offA, lampM]);
  S.booth = { onA, offA, lampM, lampMat, light: null, rec: false };
  S.lights.push({ x: (b.door0 + b.door1) / 2, y: 2.1, z: b.z1 + 0.5, color: '#ff3a3a', r: 3.2, i: 0.0, kind: 'neon' }); S.booth.light = S.lights[S.lights.length - 1];
  const set = (rec) => { S.booth.rec = !!rec; onA.visible = !!rec; offA.visible = !rec; lampMat.color.setRGB(rec ? 3.4 : 0.3, rec ? 0.25 : 0.05, rec ? 0.2 : 0.05); S.booth.light.i = rec ? 0.9 : 0.12; }; set(false); S.booth.set = set;
}
