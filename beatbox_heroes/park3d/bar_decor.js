// Bar decor (Stage and Club Artist INT-B): round tables with stools, the velvet banquette under the chalkboard, jukebox, gig posters, dartboard, plants, sandwich board, OPEN sign,
// the glowing dance-floor tiles (two meshes so the beat can chase them), the chalkboard and the programme banner quads (live canvas), the disco ball.
import { THREE, flatMat } from './kit.js';
import { Buf, col, mix, mul, aoTint, bar, cylT, K, PINKN, CYANN, GOLDN, VIOLETN, WARMS, LIMEN, ORANGEN, P } from './venue_kit.js';
import { plant } from './flat_kit.js';
import { BAR } from './bar_shell.js';
import { drawChalkboard, drawBanner } from './bar_atlas.js';

export const TABLES = [{ x: -1.15, z: -1.25 }, { x: -1.0, z: 2.1 }, { x: -2.55, z: 3.5 }];
export const SEATS = {
  regular0: { x: -3.2, z: -4.42, rot: 0, seatY: 0.5 },          // banquette under the chalkboard, facing the room
  regular1: { x: -1.95, z: -1.25, rot: Math.PI / 2, seatY: 0.68 },   // stool at the first table, facing east (the table)
  regular2: { x: -3.4, z: -2.4, rot: -Math.PI / 2, seatY: 0.68 },   // counter stool 1, facing the counter
};

export function buildDecor(S) {
  const B = S.B, GL = S.GLOW, R = S.rand;
  // ---------------------------------------------------------------- tables and stools
  TABLES.forEach((t, i) => { const { x, z } = t; S.soft(x, z, 0.6, 0.6, 0.38);
    B.lathe([[0.25, 0, K.steelD], [0.24, 0.03, K.steel], [0.05, 0.06, K.steel], [0.04, 0.7, K.steelL], [0.4, 0.72, K.woodL], [0.42, 0.75, K.wood], [0.0, 0.75, mix(K.wood, K.cream, 0.2)]], 10, x, 0, z, {});
    B.lathe([[0.025, 0.0, K.cream], [0.03, 0.06, K.creamD], [0.0, 0.07, K.cream]], 6, x + 0.1, 0.75, z - 0.05, {}); GL.lathe([[0.012, 0.075, YEL()], [0, 0.1, YEL()]], 5, x + 0.1, 0.75, z - 0.05, {});
    S.hit.circle(x, z, 0.5);
    const seats = i === 0 ? [[-0.8, 0], [0.8, 0.1]] : i === 1 ? [[-0.75, 0.2], [0.75, -0.1]] : [[0.1, -0.78], [0.05, 0.78]];
    seats.forEach(([dx, dz]) => { const sx = x + dx, sz = z + dz; if (i === 0 && dx < 0) { /* regular1 seat */ }
      [0, 1, 2].forEach((k) => { const a = k * 2.094 + 0.4; bar(B, [sx + Math.cos(a) * 0.17, 0, sz + Math.sin(a) * 0.17], [sx + Math.cos(a) * 0.05, 0.58, sz + Math.sin(a) * 0.05], 0.03, 0.03, K.steelL, { base: 0.1 }); });
      B.lathe([[0.2, 0.58, K.plumD], [0.21, 0.62, K.plum], [0.18, 0.68, K.plumL], [0, 0.69, K.plumL]], 10, sx, 0, sz, {}); S.hit.circle(sx, sz, 0.22); S.soft(sx, sz, 0.25, 0.25, 0.3); }); });
  S.anchors.table0 = { x: TABLES[0].x, z: TABLES[0].z };
  // ---------------------------------------------------------------- banquette under the chalkboard (north wall)
  { const x0 = -3.7, x1 = -1.75, cx = (x0 + x1) / 2, z = -4.62, w = x1 - x0;
    B.box(cx, 0, z, w, 0.34, 0.62, K.woodD, { base: 0.3, tint: 0.03 }); B.box(cx, 0.34, z + 0.02, w - 0.04, 0.14, 0.56, K.velvetD, { base: 0.1, tint: 0.04, top: K.velvet }); // seat
    for (let i = 0; i < 3; i++) B.box(x0 + 0.33 + i * 0.65, 0.34, z + 0.03, 0.6, 0.15, 0.52, mix(K.velvetD, K.velvet, 0.3), { base: 0.1, tint: 0.05, taper: 0.92 });
    B.box(cx, 0.45, z - 0.28, w, 0.55, 0.12, K.velvet, { base: 0.15, tint: 0.04, taper: 0.97 }); for (let i = 0; i < 7; i++) B.box(x0 + 0.14 + i * (w - 0.28) / 6, 0.6, z - 0.215, 0.05, 0.05, 0.03, K.gold, { base: 0 }); // buttons
    S.hit.box(cx, z, w / 2, 0.34, 0); S.soft(cx, z + 0.3, w / 2 + 0.1, 0.5, 0.35);
    // small low table in front
    B.lathe([[0.22, 0, K.steelD], [0.04, 0.05, K.steel], [0.04, 0.46, K.steelL], [0.3, 0.48, K.woodL], [0.0, 0.5, K.wood]], 8, cx, 0, z + 0.85, {}); S.hit.circle(cx, z + 0.85, 0.36); }
  // ---------------------------------------------------------------- jukebox (north wall, between the chalkboard and the stage)
  { const jx = -0.15, jz = -4.62, JW = 0.95;
    B.box(jx, 0, jz, JW, 1.05, 0.56, K.velvetD, { base: 0.3, tint: 0.04 }); cylT(B, jx, 1.05, jz - 0.28, JW * 0.5, JW * 0.5, 0.56, 10, mix(K.velvetD, K.plum, 0.4), { rx: Math.PI / 2 });
    B.box(jx, 0, jz + 0.28, JW + 0.04, 0.12, 0.04, K.gold, { base: 0 });
    S.decal('jukebox', jx, 0.78, jz + 0.29, 0.82, 1.22, 0, 0, [1.1, 1.1, 1.1]);
    [-1, 1].forEach((s) => GL.box(jx + s * (JW / 2 - 0.02), 0.1, jz + 0.29, 0.035, 1.3, 0.025, s < 0 ? PINKN : CYANN, { base: 0, tint: 0 }));
    S.lights.push({ x: jx, y: 1.1, z: jz + 0.6, color: '#ff8ad0', r: 1.5, i: 0.49, flicker: 0.15, kind: 'tv' });
    S.hit.box(jx, jz, JW / 2 + 0.05, 0.34, 0); S.soft(jx, jz + 0.4, 0.6, 0.35, 0.4); S.anchors.jukebox = { x: jx, z: jz + 1.0, rot: Math.PI }; }
  // ---------------------------------------------------------------- posters, photos, dartboard on the walls
  S.decal('poster_open', -5.55, 1.95, -4.97, 0.56, 0.78, 0, 0, [1.05, 1.05, 1.05]); S.decal('poster_batt', -4.85, 1.95, -4.97, 0.56, 0.78, 0, 0, [1.05, 1.05, 1.05]); S.decal('poster_tour', -4.2, 1.82, -4.97, 0.52, 0.72, 0.0, 0, [1.05, 1.05, 1.05]);
  S.decal('poster_kara', 0.75, 1.55, -4.97, 0.5, 0.7, 0, 0, [1.05, 1.05, 1.05]); S.decal('poster_show', -0.9, 1.65, -4.97, 0.52, 0.73, 0, 0, [1.05, 1.05, 1.05]);
  S.decal('photos', -5.98, 1.7, 3.2, 1.2, 0.6, Math.PI / 2, 0, [1.05, 1.05, 1.05]); S.decal('dart', -5.98, 1.55, 4.15, 0.55, 0.55, Math.PI / 2, 0, [1.05, 1.05, 1.05]);
  B.box(-5.9, 0.0, 3.2, 0.1, 0.0, 0.1, K.woodD, { base: 0 });
  // ---------------------------------------------------------------- plants, sandwich board, mat, OPEN sign on the outside of the low wall
  plant(S, 5.35, 0, 3.9, 'fiddle', 1.3, { pot: P.terracotta, pr: 0.25, ph: 0.34 }); S.soft(5.35, 3.9, 0.5, 0.5, 0.35); S.hit.circle(5.35, 3.9, 0.3);
  plant(S, -5.2, 0, 4.3, 'monstera', 1.15, { pot: P.cream, pr: 0.26, ph: 0.34 }); S.soft(-5.2, 4.3, 0.5, 0.5, 0.35); S.hit.circle(-5.2, 4.3, 0.3);
  plant(S, 0.4, 0, -3.6, 'snake', 1.1, { pot: P.teal, pr: 0.2, ph: 0.3 }); S.hit.circle(0.4, -3.6, 0.25);
  { const sx = -1.9, sz = 4.2; B.push(sx, 0, sz, 0.3); B.box(0, 0, 0.0, 0.62, 0.9, 0.04, K.woodD, { base: 0.1, taper: 1 }); B.box(0, 0, -0.26, 0.58, 0.88, 0.03, K.woodD, { base: 0.1 }); B.pop(); S.decal('sandwich', sx + 0.0, 0.5, sz + 0.03, 0.54, 0.8, 0.3, 0, [1.05, 1.05, 1.05]); S.hit.circle(sx, sz, 0.35); S.soft(sx, sz, 0.5, 0.4, 0.3); }
  S.screen('sign_open', 2.1, 0.5, 5.31, 0.7, 0.3, 0, 0, [1.2, 1.2, 1.2]); S.lights.push({ x: 2.1, y: 0.8, z: 5.7, color: '#ff3d9a', r: 1.3, i: 0.39, kind: 'neon' });
  // ---------------------------------------------------------------- a speaker + record crate by the stage steps, tip bucket
  B.box(0.55, 0, -2.9, 0.5, 0.35, 0.4, K.wood, { base: 0.2, tint: 0.06 }); B.box(0.55, 0.35, -2.9, 0.44, 0.02, 0.34, K.cream, { base: 0 }); S.hit.box(0.55, -2.9, 0.28, 0.23, 0);
  // ---------------------------------------------------------------- cables on the floor (cyan tape path from the stage to the speaker)
  B.box(3.5, 0, -2.2, 0.04, 0.012, 0.5, K.ink, { base: 0 });
}
const YEL = () => [3.2, 2.5, 0.5];

// glowing dance floor: two checker meshes, tinted every beat. returns { group, update(t, beat, energy), setTheme(a, b) }
export function buildDanceFloor(x0, x1, z0, z1, tile) {
  const A = new Buf({ rng: () => 0.5 }), Bb = new Buf({ rng: () => 0.5 }); const nx = Math.round((x1 - x0) / tile), nz = Math.round((z1 - z0) / tile), g = 0.035;
  const white = [1, 1, 1];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const xa = x0 + (x1 - x0) * i / nx + g, xb = x0 + (x1 - x0) * (i + 1) / nx - g, za = z0 + (z1 - z0) * j / nz + g, zb = z0 + (z1 - z0) * (j + 1) / nz - g, buf = (i + j) % 2 ? Bb : A; buf.quad([xa, 0.014, za], [xa, 0.014, zb], [xb, 0.014, zb], [xb, 0.014, za], white); }
  const mk = (buf, c) => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(c), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); const me = new THREE.Mesh(buf.geometry(false), m); me.frustumCulled = false; me.renderOrder = 1; me.name = 'dance_floor'; return me; };
  const a = mk(A, '#ff3d9a'), b = mk(Bb, '#35f2e0'); const group = new THREE.Group(); group.add(a, b);
  const ca = new THREE.Color('#ff3d9a'), cb = new THREE.Color('#35f2e0'); let tA = ca.clone(), tB = cb.clone();
  return { group, tris: (A.p.length + Bb.p.length) / 9,
    setTheme(c1, c2) { tA.set(c1); tB.set(c2); },
    update(t, beatN, energy, pulseIn) { pulseIn = pulseIn === undefined ? 0 : 1 - pulseIn; const ph = ((beatN % 2) + 2) % 2, pulse = Math.exp(-pulseIn * 3.2), on = (ph < 1) ? 1 : 0; const ka = 0.22 + 0.2 * energy + (on ? 0.85 : 0.1) * pulse * (0.4 + energy), kb = 0.22 + 0.2 * energy + (on ? 0.1 : 0.85) * pulse * (0.4 + energy); a.material.color.copy(tA).multiplyScalar(ka); b.material.color.copy(tB).multiplyScalar(kb); } };
}

// the two live canvas quads (north wall): chalkboard (day + programme) and the programme banner
export function buildBoards(group) {
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { c, g: c.getContext('2d'), t }; };
  const cb = mkCanvas(256, 340), bn = mkCanvas(512, 128);
  const mat = (t) => new THREE.MeshLambertMaterial({ map: t, emissive: new THREE.Color(0.28, 0.26, 0.3), emissiveMap: t });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.86), mat(cb.t)); board.position.set(-2.72, 2.0, -4.945); board.name = 'chalkboard'; board.receiveShadow = true;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), mat(bn.t)); banner.position.set(-0.5, 2.72, -4.935); banner.name = 'banner'; banner.receiveShadow = true;
  // frame for the board and rods for the banner
  const fr = new Buf({ rng: () => 0.5 }); fr.box(-2.72, 1.05, -4.955, 1.5, 0.05, 0.06, K.woodL, { base: 0 }); fr.box(-2.72, 2.88, -4.955, 1.5, 0.06, 0.06, K.woodL, { base: 0 }); [-1, 1].forEach((s) => fr.box(-2.72 + s * 0.72, 1.05, -4.955, 0.06, 1.89, 0.06, K.woodL, { base: 0 }));
  fr.box(-0.5, 2.4, -4.945, 2.5, 0.03, 0.04, K.gold, { base: 0 }); fr.box(-0.5, 3.0, -4.945, 2.5, 0.03, 0.04, K.gold, { base: 0 });
  const frame = new THREE.Mesh(fr.geometry(false), flatMat()); frame.frustumCulled = false; frame.name = 'board_frames';
  group.add(board, banner, frame);
  const api = { board, banner, frame, set(info) { drawChalkboard(cb.g, 256, 340, info); cb.t.needsUpdate = true; drawBanner(bn.g, 512, 128, info); bn.t.needsUpdate = true; } };
  return api;
}

// disco ball: faceted sphere (one mesh) that turns; facets sparkle through the vertex colours and a bright emissive tint on the beat
export function buildDiscoBall(pos) {
  const g = new THREE.IcosahedronGeometry(0.34, 1), ng = g.index ? g.toNonIndexed() : g, p = ng.attributes.position, c = new Float32Array(p.count * 3), R = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i += 3) { const k = 0.55 + 0.9 * R(i), tint = R(i + 7) < 0.25 ? [1.0, 0.5, 0.9] : R(i + 9) < 0.5 ? [0.6, 0.9, 1.0] : [1, 1, 1]; for (let q = 0; q < 3; q++) { c[(i + q) * 3] = tint[0] * k; c[(i + q) * 3 + 1] = tint[1] * k; c[(i + q) * 3 + 2] = tint[2] * k; } }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.dispose();
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(0.55, 0.5, 0.65), emissiveIntensity: 0.9 }); m.userData.noGlow = true;
  const mesh = new THREE.Mesh(ng, m); mesh.position.set(pos.x, pos.y, pos.z); mesh.name = 'disco_ball'; mesh.castShadow = false;
  return { mesh, update(dt, t, beat) { mesh.rotation.y += dt * 0.9; m.emissiveIntensity = 0.7 + 0.8 * beat; } };
}
