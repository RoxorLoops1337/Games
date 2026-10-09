// Encore Island 3D, the festival dressing of the plaza: lamp posts (HUBLAMPS) with beat-pulsing glow, bunting strung between them, balloon clusters,
// flower rings, arrow signposts (HUBSIGNS) and falling confetti around the stage. Everything sits on the 2D lists, which already keep clear of plates and boulevards.
import * as THREE from 'three';
import { Builder, C, INK, W, TAU, PI, seg, GB, GOLD, glow, lit, extr, hash01, rng, clamp } from './kit.js';
import { Inst, QuadSet, rod, outline, rbx, bll, stat } from './hub_fx.js';

const FLAG = [C.hotPink, C.cream, C.mint, C.gold, C.violet, C.sky];
const BALLOON = [[1.0, 0.45, 0.7], [0.45, 0.95, 0.7], [1.0, 0.85, 0.3], [0.62, 0.5, 1.0], [0.5, 0.85, 1.0]];
const tri = () => { const s = new THREE.Shape(); s.moveTo(-0.1, 0); s.lineTo(0.1, 0); s.lineTo(0, -0.24); s.closePath(); return s; };

export function buildTown(V, fx) {
  const g = new THREE.Group(); g.name = 'townProps';
  const lamps = (typeof HUBLAMPS !== 'undefined' ? HUBLAMPS : []).map((l) => ({ x: l.x * W, z: l.y * W, ph: l.ph }));
  const signs = (typeof HUBSIGNS !== 'undefined' ? HUBSIGNS : []).map((s) => ({ x: s.x * W, z: s.y * W, txt: s.txt, dir: s.dir }));
  const b = new Builder({ ao: 0.2 }), LH = 2.05; // lamp pole height
  lamps.forEach((l, i) => {
    b.local(l.x, 0, l.z, hash01(i + 5) * TAU, (q) => {
      q.cyl(0x6a4aa8, 0, 0, 0, 0.26, 0.1, 10, 0.8); q.cyl(0x8a6cc8, 0, 0.08, 0, 0.17, 0.2, 10, 0.6); q.cyl(0x8a6cc8, 0, 0.2, 0, 0.06, LH - 0.2, 8); q.cyl(0xc9b0f0, -0.025, 0.4, 0.03, 0.012, LH - 0.7, 4);
      q.cyl(GOLD_M, 0, LH - 0.03, 0, 0.1, 0.07, 8); q.cyl(C.pink, 0, LH + 0.02, 0, 0.16, 0.08, 8, 0.6); q.cyl(0x4a3a88, 0, LH + 0.5, 0, 0.19, 0.04, 8);
      for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) q.cyl(0x4a3a88, sx * 0.2, LH + 0.08, sz * 0.2, 0.02, 0.44, 4);
      q.cone(C.pink, 0, LH + 0.53, 0, 0.23, 0.2, 7); bll(q, GOLD_M, 0, LH + 0.78, 0, 0.06, 1);
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; bll(q, k % 3 === 0 ? C.cream : k % 3 === 1 ? C.blossom : C.gold, Math.cos(a) * 0.36, 0.09, Math.sin(a) * 0.36, 0.085, 1); } // flower ring
      bll(q, C.green, 0.3, 0.07, 0.22, 0.1, 0.8); bll(q, C.grass2, -0.3, 0.07, -0.18, 0.1, 0.8);
    });
  });
  g.add(stat(outline(b.build({ cast: true }))));
  const coreG = new THREE.IcosahedronGeometry(1, 1), coreM = new THREE.MeshBasicMaterial({ fog: true }); coreM.userData.noLook = true;
  const cores = new Inst(coreG, coreM, Math.max(1, lamps.length), { colors: true }); g.add(cores.mesh);
  // bunting: connect close lamp pairs (each lamp at most twice), pennants hang on a sagging cord
  // keep the cords off the stage (they would cross the hero's head in the high camera) and off the plates
  const keepPts = (typeof HUB_KEEP !== 'undefined' ? HUB_KEEP : []).map((o, i) => [o.x * W, o.y * W + (i === 0 ? 0.4 : 0), i === 0 ? 3.5 : o.r * W * 0.9]);
  const clearOf = (A, B) => { for (const [kx, kz, kr] of keepPts) { const vx = B.x - A.x, vz = B.z - A.z, t0 = clamp(((kx - A.x) * vx + (kz - A.z) * vz) / (vx * vx + vz * vz || 1), 0, 1); if (Math.hypot(A.x + vx * t0 - kx, A.z + vz * t0 - kz) < kr) return false; } return true; };
  const links = [], deg = new Array(lamps.length).fill(0), cand = [];
  for (let i = 0; i < lamps.length; i++) for (let j = i + 1; j < lamps.length; j++) { const d = Math.hypot(lamps[i].x - lamps[j].x, lamps[i].z - lamps[j].z); if (d > 1.6 && d < 5.6 && clearOf(lamps[i], lamps[j])) cand.push([d, i, j]); }
  cand.sort((p, q) => p[0] - q[0]); for (const [d, i, j] of cand) if (deg[i] < 2 && deg[j] < 2 && links.length < 22) { links.push([i, j, d]); deg[i]++; deg[j]++; }
  const bb = new Builder({ ao: 0 }), triG = extr(tri(), 0.012, 0, 'hubPennant'), wire = [];
  links.forEach(([i, j, d], li) => {
    const A = lamps[i], B = lamps[j], ay = LH + 0.42, sag = 0.22 + d * 0.05, yaw = Math.atan2(-(B.z - A.z), B.x - A.x), pts = []; const n = 10;
    for (let k = 0; k <= n; k++) { const u = k / n; pts.push([A.x + (B.x - A.x) * u, ay - sag * Math.sin(u * PI), A.z + (B.z - A.z) * u]); }
    for (let k = 0; k < n; k++) rod(bb, GB.cyl, 0x4a3a70, pts[k][0], pts[k][1], pts[k][2], pts[k + 1][0], pts[k + 1][1], pts[k + 1][2], 0.012, 4);
    const nf = Math.max(4, Math.round(d * 1.7));
    for (let k = 0; k < nf; k++) { const u = (k + 0.5) / nf, x = A.x + (B.x - A.x) * u, z = A.z + (B.z - A.z) * u, y = ay - sag * Math.sin(u * PI); bb.part(triG, FLAG[(k + li) % FLAG.length], x, y, z, 1, 1, 1, 0, yaw, 0); }
  });
  g.add(stat(bb.build({ cast: false, ao: 0 })));
  // balloon clusters on every fifth lamp, strings tied to the lantern cap
  const balloonG = new THREE.IcosahedronGeometry(1, 2), bm = lit(0xffffff, { rough: 0.25 }), balloons = new Inst(balloonG, bm, 64, { colors: true }), strs = new Builder({ ao: 0 }), bl = [];
  lamps.forEach((l, i) => { if (i % 5 !== 2) return; for (let k = 0; k < 3; k++) { const a = k * 2.1 + i, x = l.x + Math.cos(a) * 0.32, z = l.z + Math.sin(a) * 0.32, y = LH + 1.4 + k * 0.28, c = BALLOON[(i + k * 2) % 5]; bl.push([x, y, z, c, i + k]); rod(strs, GB.cyl, 0xfff4e6, l.x, LH + 0.95, l.z, x, y - 0.3, z, 0.008, 3); } });
  g.add(stat(strs.build({ cast: false, ao: 0 }))); g.add(balloons.mesh);
  // signposts: wooden post + tilted arrow board with the atlas lettering
  const sb = new Builder({ ao: 0.2 }), qs = new QuadSet(), tilt = -0.5;
  const arrow = (dir) => extr(((w, h, tp) => { const s = new THREE.Shape(); s.moveTo(-w / 2 * dir, -h / 2); s.lineTo((w / 2 - tp) * dir, -h / 2); s.lineTo(w / 2 * dir, 0); s.lineTo((w / 2 - tp) * dir, h / 2); s.lineTo(-w / 2 * dir, h / 2); s.closePath(); return s; })(1.64, 0.5, 0.24), 0.07, 0.015, 'hubArrow' + dir);
  signs.forEach((s, i) => {
    const dir = s.dir >= 0 ? 1 : -1, bx = s.x + dir * 0.62, by = 1.66;
    sb.cyl(0x6a4020, s.x, 0, s.z, 0.12, 0.1, 10, 0.8); sb.cyl(0xb07840, s.x, 0.05, s.z, 0.07, 1.76, 8); bll(sb, GOLD_M, s.x, 1.86, s.z, 0.085, 0.9);
    sb.part(arrow(dir), 0xc08850, bx, by, s.z + 0.02, 1, 1, 1, tilt, 0, 0);
    fx.atlas.quad(qs, 'p:' + s.txt, 1.38, bx - dir * 0.0, by + Math.sin(-tilt) * -0.0 + 0.0 + 0.0 + (-Math.sin(tilt)) * 0.05, s.z + 0.02 + Math.cos(tilt) * 0.05, 0, tilt, 0.46);
  });
  g.add(stat(outline(sb.build({ cast: true })))); g.add(stat(fx.atlas.mesh(qs)));
  // confetti drifting around the stage
  const cg = new THREE.PlaneGeometry(1, 1), cmat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true }); cmat.userData.noLook = true;
  const conf = new Inst(cg, cmat, 56, { colors: true }); g.add(conf.mesh); const CC = [[1, 0.5, 0.75], [0.5, 1, 0.75], [1, 0.9, 0.4], [0.7, 0.6, 1], [0.6, 0.9, 1]];
  const cx = STAGE.x * W, cz = STAGE.y * W;
  return {
    group: g,
    update(dt, t) {
      const beat = fx.beat();
      cores.begin(); for (let i = 0; i < lamps.length; i++) { const l = lamps[i], pu = 0.7 + 0.3 * beat + Math.sin(t * 3 + l.ph) * 0.06; cores.put(l.x, LH + 0.3, l.z, 0, 0, 0, 0.21, 0.25, 0.21, 2.0 * pu, 1.5 * pu, 0.65 * pu); fx.glow(l.x, LH + 0.3, l.z, 2.5 + beat * 0.5, 1.0, 0.72, 0.32, 0.34 * pu); } cores.end();
      balloons.begin(); for (let bi = 0; bi < bl.length; bi++) { const e = bl[bi], x = e[0], y = e[1], z = e[2], c = e[3], k = e[4], s = Math.sin(t * 1.3 + k * 1.9); balloons.put(x + s * 0.05, y + Math.sin(t * 1.7 + k) * 0.07, z + Math.cos(t * 1.1 + k) * 0.05, 0, 0, 0, 0.26, 0.31, 0.26, c[0], c[1], c[2]); } balloons.end();
      conf.begin(); for (let i = 0; i < 56; i++) { const ph = (t * (0.12 + hash01(i) * 0.08) + hash01(i + 90)) % 1, a = hash01(i + 7) * TAU, r = 1.6 + hash01(i + 33) * 3.2, c = CC[i % 5]; conf.put(cx + Math.cos(a + t * 0.05) * r + Math.sin(t * 0.8 + i) * 0.2, 4.6 * (1 - ph) + 0.05, cz + 1.0 + Math.sin(a + t * 0.05) * r * 0.8 + Math.cos(t * 0.7 + i) * 0.2, t * (2 + i % 3) + i, t * 1.6 + i * 2, 0.4 * i, 0.09, 0.15, 1, c[0], c[1], c[2]); } conf.end();
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); }); coreM.dispose(); cmat.dispose(); }
  };
}
const GOLD_M = { m: GOLD, c: 0xffd84d };
