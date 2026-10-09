// Encore Island 3D, travel and underground: the Backstage stairway (HATCH: grated and chained until paid, then an open lit stairwell under a neon arch)
// and the warp pad at the Travel Dock (WAYPAD, once S.waygate). Local frames = the 2D positions, +z faces the camera.
import * as THREE from 'three';
import { Builder, C, INK, W, TAU, PI, seg, GB, GOLD, lit, damp, clamp, hash01 } from './kit.js';
import { Inst, QuadSet, ringQuad, rod, outline, rbx, bll, floorMat } from './hub_fx.js';
import { iconTex } from './plate3d.js';

const GOLDM = { m: GOLD, c: 0xffd84d };
const sg = (tilt, x, y, z, off) => [x, y - Math.sin(tilt) * off, z + Math.cos(tilt) * off];

export function buildHatch(V, fx) {
  const g = new THREE.Group(); g.name = 'hatch'; g.position.set(HATCH.x * W, 0, HATCH.y * W);
  const wx = g.position.x, wz = g.position.z;
  // landing + well (everything within 0.06 so the hero can stand on the steps)
  const FM = (c) => ({ m: floorMat(), c }), f = new Builder({ ao: 0 }); // the landing paving itself comes from env3d; this is only the well
  f.box(FM(INK), 0, 0.04, 0.1, 2.38, 0.02, 1.7); f.box(FM(0x8a7aa8), 0, 0.043, 0.1, 2.3, 0.02, 1.62);
  for (let i = 0; i < 5; i++) { const k = i / 4; f.box(FM(new THREE.Color().setHSL(0.7, 0.35, 0.34 - k * 0.2).getHex()), 0, 0.055, 0.62 - i * 0.28, 2.1 - i * 0.12, 0.014, 0.26); f.box(FM(0x9a8ad0), 0, 0.0625, 0.745 - i * 0.28, 2.1 - i * 0.12, 0.004, 0.03); }
  const fl = f.build({ cast: false, ao: 0 }); fl.children.forEach((m) => { m.receiveShadow = true; }); g.add(fl);
  // posts, arch and chain (static)
  const b = new Builder({ ao: 0.18 }), qs = new QuadSet();
  for (const sx of [-1, 1]) { b.cyl(0x6a4a20, sx * 1.35, 0, -0.75, 0.15, 0.1, 12, 0.8); b.cyl(GOLDM, sx * 1.35, 0.05, -0.75, 0.065, 1.05, 10); bll(b, GOLDM, sx * 1.35, 1.12, -0.75, 0.14, 0.9); b.cyl(0xb02a60, sx * 1.35, 0, 0.95, 0.06, 0.05, 8); }
  for (const sx of [-1, 1]) rbx(b, 0x6a4cc4, sx * 1.15, 1.3, -1.0, 0.22, 2.6, 0.22, 0.3);
  const tilt = -0.5, sy = 2.45, sz = -1.05; rbx(b, 0x2d1a6a, 0, sy, sz, 2.7, 0.7, 0.14, 0.4, 0, tilt); rbx(b, GOLDM, 0, sy + 0.4, sz - 0.1, 2.76, 0.07, 0.12, 0.5, 0, tilt);
  { const sp = sg(tilt, 0, sy, sz, 0.08); fx.atlas.quad(qs, 'BACKSTAGE', 2.5, sp[0], sp[1], sp[2], 0, tilt, 0.74); }
  g.add(outline(b.build({ cast: true }), 0.028)); g.add(fx.atlas.mesh(qs));
  // locked props: grate + chain + padlock (separate meshes so they can hide when the stairs open)
  const lk = new THREE.Group(); const gb = new Builder({ ao: 0.1 });
  for (let i = 0; i < 11; i++) rbx(gb, 0x8a8aa0, -1.0 + i * 0.2, 0.105, 0.1, 0.05, 0.05, 1.5, 0.5);
  for (const z of [-0.55, 0.0, 0.55]) rbx(gb, 0x6a6a88, 0, 0.12, 0.1 + z, 2.2, 0.05, 0.06, 0.5);
  { const A = [-1.35, 1.02, -0.75], B = [1.35, 1.02, -0.75], n = 16; for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 1) / n, s0 = 0.34 * Math.sin(u0 * PI), s1 = 0.34 * Math.sin(u1 * PI); rod(gb, GB.cyl, 0x9a9ab8, A[0] + (B[0] - A[0]) * u0, A[1] - s0, A[2] + 0.3 * Math.sin(u0 * PI), A[0] + (B[0] - A[0]) * u1, A[1] - s1, A[2] + 0.3 * Math.sin(u1 * PI), 0.03, 5); } }
  lk.add(gb.build({ cast: false }));
  const pb = new Builder({ ao: 0.1 }); rbx(pb, GOLDM, 0, 0, 0, 0.5, 0.42, 0.2, 0.3); pb.tor(GOLDM, 0, 0.26, 0, 0.15, 0.045, 6, seg(16)); rbx(pb, INK, 0, -0.02, 0.1, 0.08, 0.14, 0.03, 0.5); const pad = outline(pb.build({ cast: true }), 0.025); pad.position.set(0, 1.0, -0.2); lk.add(pad); g.add(lk);
  // open-state effects
  const ring = ringQuad({ r: 1.5, rin: 0.9, rout: 1.0, col: 0xff9ac8, prog: 0, a: 1 }); ring.position.set(0, 0.07, 0.1); g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 3.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.75), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); beam.position.set(0, 1.7, 0.1); beam.scale.set(1.2, 1, 0.8); beam.renderOrder = 5; g.add(beam);
  const pole = new THREE.Group(); // velvet rope hung to one side when open
  { const rb = new Builder({ ao: 0 }); const A = [-1.35, 0.98, -0.75], B = [-1.35, 0.35, 0.95], n = 12; for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 1) / n; const P = (u) => [A[0] - 0.1 * Math.sin(u * PI), A[1] + (B[1] - A[1]) * u - 0.12 * Math.sin(u * PI), A[2] + (B[2] - A[2]) * u]; const p0 = P(u0), p1 = P(u1); rod(rb, GB.cyl, 0xff5fa6, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.04, 6); } pole.add(rb.build({ cast: false, ao: 0 })); }
  g.add(pole);
  const bulbPos = []; for (let i = 0; i < 12; i++) bulbPos.push([-1.2 + 2.4 * i / 11, 2.45 + 0.4 - 0.07, -1.05 - 0.12]);
  let open = 0;
  return {
    group: g,
    update(dt, t, focus) {
      const n = S.lands.length, show = n >= BACKSTAGE_SHOW; g.visible = show; if (!show) return;
      const isOpen = !!S.bsPlate.built; open = damp(open, isOpen ? 1 : 0, 5, dt); const beat = fx.beat();
      lk.visible = !isOpen; pole.visible = isOpen;
      pad.visible = !isOpen && n < BACKSTAGE_OPEN; if (pad.visible) pad.position.y = 1.0 + Math.sin(t * 2) * 0.06;
      beam.material.opacity = open * (0.08 + 0.04 * Math.sin(t * 3) + 0.05 * beat); const hold = (S.place === 'hub' && S.bsHold > 0 && typeof BS_HOLD !== 'undefined') ? clamp(S.bsHold / BS_HOLD, 0, 1) : 0;
      ring.userData.u.uProg.value = hold; ring.userData.u.uA.value = hold > 0 ? 1 : 0;
      if (isOpen) { fx.glow(wx, 0.5, wz + 0.1, 3.4 + beat * 0.5, 1.4, 0.55, 0.95, 0.4 + 0.1 * Math.sin(t * 3)); for (let k = 0; k < 6; k++) { const ph = (t * 0.45 + k / 6) % 1, id = k * 7 + Math.floor(t * 0.45 + k / 6); fx.glow(wx + (hash01(id) - 0.5) * 1.8, 0.2 + ph * 2.2, wz + 0.1 + (hash01(id + 3) - 0.5) * 1.0, 0.2 * Math.sin(ph * PI) + 0.02, 1.8, 1.0, 1.4, 0.9 * Math.sin(ph * PI)); } }
      for (let i = 0; i < bulbPos.length; i++) { const on = isOpen ? (((t * 5) | 0) % 2 === i % 2 ? 1 : 0.35) : 0.12, p = bulbPos[i]; fx.bulb(wx + p[0], p[1], wz + p[2], 0.06, 1.5 * on + 0.15, 1.2 * on + 0.1, 0.5 * on + 0.1); }
      const L = V.labels; if (L) {
        if (!isOpen && n < BACKSTAGE_OPEN) L.pill('Opens at ' + BACKSTAGE_OPEN + ' lands  (' + n + '/' + BACKSTAGE_OPEN + ')', wx, 0.05, wz + 1.4, { c1: '#e6dcff', c2: '#a99ad8', px: 11 });
        if (isOpen && focus && (focus.x - wx) * (focus.x - wx) + (focus.z - wz) * (focus.z - wz) < 9) L.pill('stand still to go down', wx, 0.05, wz + 1.5, { c1: '#ffffff', c2: '#dccaff', px: 11 });
      }
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.isMeshBasicMaterial) o.material.dispose(); }); }
  };
}

export function buildWarp(V, fx) {
  const g = new THREE.Group(); g.name = 'warpPad'; g.position.set(WAYPAD.x * W, 0, WAYPAD.y * W);
  const wx = g.position.x, wz = g.position.z, R = 0.92;
  const FM = (c) => ({ m: floorMat(), c }), b = new Builder({ ao: 0 });
  b.cyl(FM(INK), 0, 0, 0, R + 0.16, 0.05, seg(40)); b.cyl(FM(0xdff8ff), 0, 0, 0, R + 0.08, 0.09, seg(40)); b.cyl(FM(0x2a5a9a), 0, 0, 0, R, 0.11, seg(40)); b.cyl(FM(0x4aa0cc), 0, 0, 0, R * 0.82, 0.118, seg(40)); b.cyl(FM(0x6ec9e0), 0, 0, 0, R * 0.52, 0.124, seg(32)); b.cyl(FM(0xb8f4ff), 0, 0, 0, R * 0.2, 0.13, seg(20));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; bll(b, GOLDM, Math.cos(a) * (R + 0.04), 0.1, Math.sin(a) * (R + 0.04), 0.045, 0.7); }
  g.add(b.build({ cast: false, ao: 0 }));
  const rune = ringQuad({ r: R * 0.9, rin: 0.62, rout: 0.72, col: 0xb8f4ff, dash: 12, spin: 0.25, a: 1 }); rune.position.y = 0.14; g.add(rune);
  const rune2 = ringQuad({ r: R * 0.9, rin: 0.9, rout: 0.97, col: 0x6ec9e0, a: 0.6 }); rune2.position.y = 0.14; g.add(rune2);
  const im = new THREE.MeshBasicMaterial({ map: iconTex('way'), transparent: true, alphaTest: 0.04, depthWrite: false, fog: false }); im.userData.noCast = true; im.userData.noLook = true;
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), im); sigil.renderOrder = 6; g.add(sigil);
  return {
    group: g,
    update(dt, t) {
      g.visible = !!S.waygate; if (!S.waygate) return;
      const beat = fx.beat(); rune.userData.u.uT.value = t; rune2.userData.u.uA.value = 0.35 + 0.3 * Math.sin(t * 4 + wx) + 0.2 * beat;
      sigil.position.y = 1.35 + Math.sin(t * 2.5 + wx) * 0.1; sigil.quaternion.copy(V.camera.quaternion); sigil.scale.setScalar(1 + 0.06 * beat);
      fx.glow(wx, 1.35 + Math.sin(t * 2.5 + wx) * 0.1, wz, 2.0 + beat * 0.3, 0.4, 0.9, 1.4, 0.4); fx.glow(wx, 0.2, wz, 2.6, 0.4, 0.8, 1.3, 0.25 + 0.1 * Math.sin(t * 4 + wx));
      for (let k = 0; k < 6; k++) { const a = t * 1.4 + k / 6 * TAU, ph = (t * 0.5 + k / 6) % 1; fx.glow(wx + Math.cos(a) * 0.8, 0.2 + ph * 1.6, wz + Math.sin(a) * 0.8, 0.14 * Math.sin(ph * PI) + 0.02, 0.8, 1.6, 1.8, 0.9 * Math.sin(ph * PI)); }
      const L = V.labels; if (L) L.pill('TO NEWEST', wx, 0.05, wz + 1.3, { c1: '#b8f4ff', c2: '#6ec9e0', px: 11 });
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); im.dispose(); }
  };
}
