// Thrift Shop try-on corner (Interior Artist INT-A): a full-length wall mirror with hollywood bulbs, a 2 m round try-on platform and a ring light on a tripod.
// The mirror is a REAL reflection: the wall opening looks into a small mirrored stage behind the wall, and a mirrored copy of the player (same skeleton, mirrored model matrix,
// 3 extra draw calls) stands in it, so the player sees themselves from every angle the camera takes.
import { THREE } from './kit.js';
import { P, mix, mul, bar, col } from './flat_kit.js';
import { wbox } from './shop_shell.js';

const C = (h) => col(h);
export const MIRROR = { cx: -3.55, cz: 2.2, r: 1.0, h: 0.14, planeX: -5.04, u0: 1.15, u1: 2.45, v0: 0.04, v1: 2.2 };
export const mirrorHole = () => ({ wall: 'W', u0: MIRROR.u0, u1: MIRROR.u1, v0: MIRROR.v0, v1: MIRROR.v1 });
export const platformHeight = (x, z) => { const d = Math.hypot(x - MIRROR.cx, z - MIRROR.cz); return MIRROR.h * Math.max(0, Math.min(1, (MIRROR.r - d) / 0.14)); };

export function buildMirror(S, F) {
  const B = S.B, G = S.GLOW, GL = S.GLASS, hit = S.hit, f = F.W, M = MIRROR, uc = (M.u0 + M.u1) / 2, zc = 4 - uc, W = M.u1 - M.u0;
  // ---- frame (walnut) and bulbs (emissive): bars on the wall face around the opening
  const wood = C('#6a3f2a'), brass = C('#d8b04a');
  wbox(B, f, M.u0 - 0.07, 0.04, M.v0, 0.14, M.v1 - M.v0 + 0.1, 0.08, wood, { base: 0.1, tint: 0.03 }); wbox(B, f, M.u1 + 0.07, 0.04, M.v0, 0.14, M.v1 - M.v0 + 0.1, 0.08, wood, { base: 0.1, tint: 0.03 });
  wbox(B, f, uc, 0.04, M.v1, W + 0.28, 0.14, 0.08, wood, { base: 0.1, tint: 0.03 }); wbox(B, f, uc, 0.04, M.v0 - 0.08, W + 0.28, 0.1, 0.08, wood, { base: 0.1, tint: 0.03 });
  wbox(B, f, uc, 0.09, M.v1 + 0.14, W + 0.3, 0.02, 0.02, brass, { base: 0 });
  const bulb = [3.2, 2.5, 1.5]; for (let i = 0; i < 9; i++) { const u = M.u0 - 0.07 + (W + 0.14) * i / 8, q = f.pt(u, 0.1); G.blob(q[0], M.v1 + 0.07, q[1], 0.032, 0.032, 0.032, bulb, bulb, { detail: 0, jit: 0.02 }); }
  for (let j = 0; j < 8; j++) { const v = M.v0 + 0.12 + (M.v1 - M.v0 - 0.2) * j / 7; [M.u0 - 0.07, M.u1 + 0.07].forEach((u) => { const q = f.pt(u, 0.1); G.blob(q[0], v, q[1], 0.03, 0.03, 0.03, bulb, bulb, { detail: 0, jit: 0.02 }); }); }
  S.lights.push({ x: -4.5, y: 1.9, z: zc, color: '#ffc884', r: 4.2, i: 0.6, kind: 'lamp' });
  // ---- the reflection stage behind the wall: floor, a violet back wall, the mirrored platform. Mirror plane x = planeX (inside the wall opening)
  const xm = M.planeX, mx = (x) => 2 * xm - x, wf = C('#a86d48'), z0 = zc - 2.4, z1 = zc + 2.4, xb = -9.6;
  for (let i = 0; i < 6; i++) { const xa = xm - 0.2 - (i + 1) * 0.84, xe = xa + 0.84; for (let j = 0; j < 6; j++) { const za = z0 + j * 0.8, ze = za + 0.8, c = mix(wf, C('#c88a5e'), ((i + j) % 2) * 0.5); B.quad([xa, 0, za], [xa, 0, ze], [xe, 0, ze], [xe, 0, za], mul(mix(c, C('#7a5a98'), 0.18), 0.92)); } }
  B.quad([xb, 0, z1], [xb, 0, z0], [xb, 3.2, z0], [xb, 3.2, z1], C('#3a2c68'), C('#3a2c68'), C('#7a5aa8'), C('#7a5aa8'));
  // lit hanging bulbs far back, as the reflection of the east side lamps
  [[xb + 0.05, 1.7, zc - 1.2], [xb + 0.05, 2.1, zc + 0.5], [xb + 0.05, 1.5, zc + 1.7]].forEach(([x, y, z]) => G.blob(x, y, z, 0.2, 0.2, 0.06, [2.6, 1.7, 0.9], [2.6, 1.7, 0.9], { detail: 0, jit: 0.02 }));
  // ---- the try-on platform (2 m): bevelled round deck with a pink glow band and brass trim; the same shape mirrored in the stage
  const deck = (cx, cz) => { B.lathe([[M.r, 0, C('#4a3a6a')], [M.r, 0.03, C('#6a5a8a')], [M.r - 0.14, M.h, C('#8a7ab0')], [0, M.h, C('#a090c8')]], 18, cx, 0, cz, { tint: 0.02 }); B.lathe([[M.r - 0.18, M.h + 0.003, brass], [M.r - 0.2, M.h + 0.003, brass]], 18, cx, 0, cz, {}); };
  deck(M.cx, M.cz); deck(mx(M.cx), M.cz); G.lathe([[M.r + 0.004, 0.0, [3.0, 0.6, 1.6]], [M.r + 0.004, 0.032, [3.0, 0.6, 1.6]]], 18, M.cx, 0, M.cz, {});
  S.soft(M.cx, M.cz, 1.25, 1.25, 0.35);
  // concentric rings on the deck top
  B.lathe([[0.62, M.h + 0.002, C('#c0b0e8')], [0.6, M.h + 0.002, C('#c0b0e8')]], 18, M.cx, 0, M.cz, {}); B.lathe([[0.3, M.h + 0.002, C('#c0b0e8')], [0.28, M.h + 0.002, C('#c0b0e8')]], 14, M.cx, 0, M.cz, {});
  // ---- glass: a cool pane in the opening plus sheen streaks (decal) so it reads as a mirror
  const gc = [0.7, 0.8, 1.0, 0.13];
  GL.quad([xm, M.v0, zc + W / 2], [xm, M.v0, zc - W / 2], [xm, M.v1, zc - W / 2], [xm, M.v1, zc + W / 2], gc); GL.quad([xm, M.v0, zc - W / 2], [xm, M.v0, zc + W / 2], [xm, M.v1, zc + W / 2], [xm, M.v1, zc - W / 2], gc);
  S.decal('sheen', xm + 0.012, (M.v0 + M.v1) / 2, zc, W, M.v1 - M.v0, Math.PI / 2, 0, [1, 1, 1]);
  // ---- ring light on a tripod beside the platform, facing it
  { const rx = -2.15, rz = 1.1, ry = Math.atan2(M.cx - rx, M.cz - rz), ay = 1.62, r = 0.27, n = 16; S.soft(rx, rz, 0.5, 0.5, 0.35);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.6; bar(B, [rx, 0.95, rz], [rx + Math.cos(a) * 0.32, 0.0, rz + Math.sin(a) * 0.32], 0.022, 0.022, P.ink); } bar(B, [rx, 0.9, rz], [rx, ay - r, rz], 0.03, 0.03, P.steelD);
    B.push(rx, ay, rz, ry); for (let i = 0; i < n; i++) { const a0 = i / n * 6.283, a1 = (i + 1) / n * 6.283; bar(G, [Math.cos(a0) * r, Math.sin(a0) * r, 0], [Math.cos(a1) * r, Math.sin(a1) * r, 0], 0.036, 0.036, [2.9, 2.6, 2.2]); bar(B, [Math.cos(a0) * (r + 0.03), Math.sin(a0) * (r + 0.03), -0.03], [Math.cos(a1) * (r + 0.03), Math.sin(a1) * (r + 0.03), -0.03], 0.05, 0.05, P.ink); }
    B.box(0.0, -0.05, -0.03, 0.1, 0.18, 0.02, P.black, { base: 0 }); B.box(0, -0.04, -0.015, 0.09, 0.15, 0.01, P.ink, { base: 0 }); B.pop();
    S.lights.push({ x: rx + Math.sin(ry) * 0.4, y: ay, z: rz + Math.cos(ry) * 0.4, color: '#fff0dc', r: 5.0, i: 0.9, kind: 'lamp' }); hit.circle(rx, rz, 0.3); }
  // a small bench and a basket of try-on picks beside the platform
  { const bx = -3.2, bz = 3.62; S.soft(bx, bz, 0.7, 0.3, 0.35); B.box(bx, 0.3, bz, 0.9, 0.06, 0.32, P.woodL, { base: 0.1, tint: 0.03 }); [-0.4, 0.4].forEach((dx) => B.box(bx + dx, 0, bz, 0.06, 0.3, 0.28, P.woodD, { base: 0.3 })); B.box(bx - 0.2, 0.36, bz, 0.36, 0.1, 0.26, C('#e8604a'), { base: 0.1, tint: 0.06 }); B.box(bx + 0.2, 0.36, bz, 0.3, 0.06, 0.24, C('#34a199'), { base: 0.1, tint: 0.06 }); hit.box(bx, bz, 0.46, 0.2, 0); }
  S.mirror = Object.assign({ xm, zc, mx }, M);
}

// ---------------------------------------------------------------- the reflection itself: mirrored SkinnedMesh copies of the player (and the clerk if near)
export function attachReflection(ctx) {
  const M = MIRROR, state = { clones: [], player: null, active: true, ready: false }, mat = new THREE.Matrix4().set(-1, 0, 0, 2 * M.planeX, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  function setup(player) {
    if (!player || !player.object || state.ready) return state.ready; const srcs = []; player.object.traverse((o) => { if (o.isSkinnedMesh) srcs.push(o); }); if (srcs.length < 2) return false;
    state.player = player; srcs.forEach((src) => { const m = new THREE.SkinnedMesh(src.geometry, src.material); m.bindMode = THREE.DetachedBindMode; m.bind(src.skeleton, new THREE.Matrix4()); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.matrix.copy(mat); m.matrixWorld.copy(mat); m.name = 'reflect_' + src.name; m.userData.src = src; ctx.scene.add(m); state.clones.push(m); });
    state.ready = true; return true;
  }
  function update() {
    const w = ctx.host && ctx.host.world; if (!state.ready && !(w && setup(w.player))) return;
    const p = state.player.object.position, near = p.x < 0.4 && Math.abs(p.z - M.cz) < 3.2 && state.active;
    for (const m of state.clones) { const s = m.userData.src; if (m.geometry !== s.geometry) m.geometry = s.geometry; m.visible = near && s.visible && s.geometry.attributes.position && s.geometry.attributes.position.count > 0; m.matrixWorld.copy(mat); }
  }
  return { update, state, setActive(b) { state.active = !!b; } };
}
