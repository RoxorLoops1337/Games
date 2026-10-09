// Encore Island 3D, the Stage: pink platform with a lit star floor, a lighting truss with sweeping coloured spots, speaker stacks that kick on the beat
// and the ENCORE ISLAND marquee with chasing bulbs. Local frame: origin at STAGE (world X = x*W, Z = y*W), +z faces the camera.
import * as THREE from 'three';
import { Builder, C, INK, W, TAU, PI, seg, GB, GOLD, SHINY, glow, lit, canvasTex, stickerText, fitFont, starShape, damp, clamp } from './kit.js';
import { Inst, ringQuad, rod, textAtlas, rbx, bll, floorMat } from './hub_fx.js';

const PINK = 0xff9ac8, PINK_D = 0xd8559a, CZ = 0.36, R = 2.32; // platform centre z (local) and radius
const SPOT_COL = [[1.0, 0.45, 0.72], [0.45, 1.0, 0.7], [0.62, 0.5, 1.0], [1.0, 0.85, 0.35]];

export function buildStage(V, fx) {
  const g = new THREE.Group(); g.name = 'stage'; g.position.set(STAGE.x * W, 0, STAGE.y * W);
  // ---- floor: stepped rings, all within 0.06 so heroes can walk across it ----
  const FM = (c) => ({ m: floorMat(), c }), f = new Builder({ ao: 0 });
  f.cyl(FM(INK), 0, 0, CZ, R + 0.2, 0.057, seg(64)); f.cyl(FM(C.cream), 0, 0, CZ, R + 0.13, 0.065, seg(64)); f.cyl(FM(PINK_D), 0, 0, CZ, R + 0.06, 0.073, seg(64)); f.cyl(FM(PINK), 0, 0, CZ, R, 0.081, seg(64));
  f.cyl(FM(0xffb4d6), 0, 0, CZ, R * 0.72, 0.085, seg(48)); f.cyl(FM(PINK), 0, 0, CZ, R * 0.44, 0.089, seg(40));
  g.add(f.build({ cast: false }));
  // ---- lit stars: one big in the middle, a ring of small ones chasing around it ----
  const starGeo = new THREE.ShapeGeometry(starShape(5, 1, 0.45), 1).rotateX(-PI / 2).toNonIndexed(); starGeo.deleteAttribute('uv');
  const smat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }); smat.userData.noCast = true; smat.userData.noLook = true;
  const stars = new Inst(starGeo, smat, 16, { colors: true }); stars.mesh.position.y = 0.093; g.add(stars.mesh);
  const ringA = ringQuad({ r: R * 0.93, rin: 0.9, rout: 0.97, col: 0xff7eb6, a: 0.5, off: 8 }); ringA.position.set(0, 0.096, CZ); g.add(ringA);
  const ringB = ringQuad({ r: R * 0.62, rin: 0.9, rout: 0.97, col: 0xfff4e6, dash: 28, spin: 0.15, a: 0.8, off: 8 }); ringB.position.set(0, 0.098, CZ); g.add(ringB);
  // ---- backdrop: truss towers + top beam + hanging marquee board ----
  const t = new Builder({ ao: 0.12 }), TZ = -2.0, TH = 3.25, TX = 2.95, CH = 0xc9cfe6;
  const GBc = GB.cyl;
  for (const sd of [-1, 1]) { // square lattice towers
    const x = sd * TX, h = 0.19;
    t.cyl(INK, x, 0, TZ, 0.34, 0.1, seg(14)); t.cyl(0x8a6cc8, x, 0.1, TZ, 0.28, 0.08, seg(14)); // base plate
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rod(t, GBc, CH, x + cx * h, 0.1, TZ + cz * h, x + cx * h, TH, TZ + cz * h, 0.035, 6);
    const n = 9; for (let i = 0; i <= n; i++) { const y = 0.12 + (TH - 0.12) * i / n; for (const [a, bb] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].map((q) => [[q[0], q[1]], [q[2], q[3]]])) rod(t, GBc, CH, x + a[0] * h, y, TZ + a[1] * h, x + bb[0] * h, y, TZ + bb[1] * h, 0.018, 5); }
    for (let i = 0; i < n; i++) { const y0 = 0.12 + (TH - 0.12) * i / n, y1 = 0.12 + (TH - 0.12) * (i + 1) / n, s = i % 2 ? 1 : -1; rod(t, GBc, CH, x - h, y0, TZ + s * h, x + h, y1, TZ + s * h, 0.016, 5); rod(t, GBc, CH, x + s * h, y0, TZ - h, x - s * h, y1, TZ - h, 0.016, 5); }
    bll(t, { m: GOLD, c: C.gold }, x, TH + 0.14, TZ, 0.17, 0.9); t.cone({ m: GOLD, c: C.gold }, x, TH + 0.25, TZ, 0.09, 0.28, 8); // gold finial
  }
  { // top beam: a triangular lattice running along x
    const bh = 0.17, y = TH - 0.05;
    for (const [cy, cz] of [[1, 0], [-1, 1], [-1, -1]]) rod(t, GBc, CH, -TX - 0.1, y + cy * bh * 0.8, TZ + cz * bh, TX + 0.1, y + cy * bh * 0.8, TZ + cz * bh, 0.035, 6);
    const n = 30; for (let i = 0; i < n; i++) { const x0 = -TX + 2 * TX * i / n, x1 = -TX + 2 * TX * (i + 1) / n, s = i % 2; rod(t, GBc, CH, x0, y + (s ? 0.8 : -0.8) * bh, TZ + (s ? 0 : bh), x1, y + (s ? -0.8 : 0.8) * bh, TZ + (s ? bh : 0), 0.014, 5); rod(t, GBc, CH, x0, y + 0.8 * bh * (s ? 1 : -1), TZ + (s ? 0 : -bh), x1, y + 0.8 * bh * (s ? -1 : 1), TZ + (s ? -bh : 0), 0.014, 5); }
  }
  // board: ink slab, violet face, gold trim, sits between the towers hanging from the beam
  const BY = 1.95, BW = 5.2, BH = 1.3;
  rbx(t, INK, 0, BY, TZ - 0.02, BW + 0.3, BH + 0.26, 0.22, 0.4); rbx(t, 0x3a2a86, 0, BY, TZ, BW + 0.12, BH + 0.1, 0.24, 0.35); rbx(t, 0x5a44c4, 0, BY + 0.05, TZ + 0.03, BW - 0.1, BH - 0.12, 0.22, 0.3); rbx(t, 0x7a62dc, 0, BY + BH * 0.3, TZ + 0.06, BW - 0.3, BH * 0.28, 0.2, 0.5);
  for (const sd of [-1, 1]) { rod(t, GBc, INK, sd * (TX - 0.05), TH - 0.1, TZ + 0.0, sd * 2.3, BY + BH / 2 + 0.1, TZ, 0.03, 5); rod(t, GBc, INK, sd * 1.2, TH - 0.1, TZ, sd * 1.2, BY + BH / 2 + 0.1, TZ, 0.03, 5); }
  // trim lines
  t.box({ m: GOLD, c: C.gold }, 0, BY + BH / 2 - 0.04, TZ + 0.16, BW - 0.05, 0.05, 0.05); t.box({ m: GOLD, c: C.gold }, 0, BY - BH / 2 + 0.07, TZ + 0.16, BW - 0.05, 0.05, 0.05);
  const bd = t.build({ cast: true }); g.add(bd);
  // lettering
  const lt = canvasTex(1024, 256, (c, w, h) => { const sz = fitFont(c, 'ENCORE ISLAND', w - 90, 150); stickerText(c, 'ENCORE ISLAND', w / 2, h * 0.5, sz, '#ffc9de', '#ff5fa6', sz * 0.17); }, {});
  const lm = new THREE.MeshBasicMaterial({ map: lt, transparent: true, alphaTest: 0.04, depthWrite: false, fog: true }); lm.userData.noCast = true;
  const letters = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.125), lm); letters.position.set(0, BY + 0.02, TZ + 0.19); letters.renderOrder = 3; g.add(letters);
  // ---- speakers ----
  const sp = new Builder({ ao: 0.2 }), woofs = [];
  for (const sd of [-1, 1]) {
    const x = sd * 3.3, z = -0.9, yaw = -sd * 0.3;
    sp.local(x, 0, z, yaw, (b) => {
      rbx(b, INK, 0, 0.52, 0, 1.14, 1.06, 0.88, 0.25); rbx(b, 0x7a62dc, 0, 0.52, 0.08, 1.02, 0.96, 0.8, 0.25); rbx(b, C.pink, 0, 1.0, 0.09, 1.0, 0.07, 0.8, 0.5); rbx(b, C.pink, 0, 0.06, 0.09, 1.04, 0.07, 0.8, 0.5);
      rbx(b, INK, 0, 1.4, 0, 1.0, 0.8, 0.76, 0.25); rbx(b, 0x8a72e8, 0, 1.4, 0.08, 0.88, 0.7, 0.68, 0.25); rbx(b, C.pink, 0, 1.77, 0.08, 0.8, 0.05, 0.6, 0.5);
      b.cyl(INK, 0.28, 1.76, 0, 0.05, 0.28, 8); b.cone({ m: SHINY, c: C.gold }, 0.28, 2.0, 0, 0.17, 0.2, 14); // horn
      bll(b, C.cream, -0.25, 1.56, 0.38, 0.09, 0.9); bll(b, C.cream, 0.25, 1.56, 0.38, 0.09, 0.9);
    });
    woofs.push([x, 0.55, z, yaw, 0.34], [x, 1.18, z, yaw, 0.24]);
  }
  g.add(sp.build({ cast: true }));
  const wb = new Builder({ ao: 0 }); wb.tor(C.cream, 0, 0, 0, 1, 0.14, 8, seg(24)); wb.cylc(0x241a52, 0, 0, 0, 0.9, 0.05, seg(24), PI / 2); wb.part(GB.ico(2), 0x6a5cd8, 0, 0, 0.0, 0.62, 0.62, 0.28); wb.part(GB.ico(1), C.gold, 0, 0, 0.1, 0.2, 0.2, 0.12);
  const woof = new Inst(wb.geometry(), lit(0xffffff, { vc: true, rough: 0.5 }), 4, {}); g.add(woof.mesh);
  // ---- spotlights ----
  const headG = new Builder({ ao: 0 }); headG.cyl(0x2a2050, 0, -0.16, 0, 0.13, 0.32, 10, 0.8); headG.cyl(C.cream, 0, 0.14, 0, 0.14, 0.04, 10); headG.cyl(0xfff4c0, 0, 0.16, 0, 0.1, 0.03, 10); bll(headG, 0x3a2a86, 0, -0.18, 0, 0.12, 0.8);
  const heads = new Inst(headG.geometry(), lit(0xffffff, { vc: true, rough: 0.5 }), 4, { cast: false }); g.add(heads.mesh);
  const coneGeo = new THREE.ConeGeometry(1, 1, seg(16), 1, true), cp = coneGeo.attributes.position, cc = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++) cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = 0.05 + 0.95 * (cp.getY(i) + 0.5);
  coneGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const coneMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.2 }); coneMat.userData.noCast = true; coneMat.userData.noLook = true;
  const cones = new Inst(coneGeo, coneMat, 4, { colors: true }); cones.mesh.renderOrder = 5; g.add(cones.mesh);
  // marquee bulbs positions (world), chased in update
  const bulbs = []; for (let i = 0; i < 21; i++) { const x = -2.5 + 5 * i / 20; bulbs.push([x, BY + BH / 2 + 0.01, TZ + 0.2], [x, BY - BH / 2 + 0.0, TZ + 0.2]); }
  const foot = []; for (let i = 0; i < 17; i++) { const a = PI * (0.12 + 0.76 * i / 16); foot.push([Math.cos(a) * (R + 0.1), 0.13, CZ + Math.sin(a) * (R + 0.1)]); }
  const wx = STAGE.x * W, wz = STAGE.y * W, _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), HX = [-1.8, -0.6, 0.6, 1.8], HY = 2.95, HZ = -1.55;
  let pulse = 0;
  return {
    group: g,
    update(dt, tt) {
      const beat = fx.beat(); pulse = damp(pulse, beat, 22, dt);
      // stars
      stars.begin(); const hue = (i) => SPOT_COL[i % 4];
      { const c = hue(((tt * 1.5) | 0) % 4), s = 1.0 + 0.1 * pulse; stars.put(0, 0, CZ, 0, tt * 0.25, 0, s, 1, s, c[0] * 1.2, c[1] * 1.2, c[2] * 1.2); }
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + tt * 0.15, c = hue(i + ((tt * 2) | 0)), on = 0.55 + 0.45 * Math.max(0, Math.sin(tt * 3 - i * 0.9)), s = 0.2 + 0.05 * pulse; stars.put(Math.cos(a) * R * 0.8, 0, CZ + Math.sin(a) * R * 0.8, 0, -a + PI / 2, 0, s, 1, s, c[0] * on * 1.1, c[1] * on * 1.1, c[2] * on * 1.1); }
      stars.end();
      ringA.userData.u.uA.value = 0.3 + 0.55 * pulse; ringA.scale.setScalar(R * (0.93 + 0.02 * pulse)); ringB.userData.u.uT.value = tt; ringB.rotation.y = 0;
      // speakers
      woof.begin(); for (const [x, y, z, yaw, r] of woofs) { const k = 1 + 0.14 * pulse; const off = r > 0.3 ? 0.485 : 0.435; woof.put(x + Math.sin(yaw) * off, y, z + Math.cos(yaw) * off, 0, yaw, 0, r, r, r * (0.7 + 0.5 * pulse)); void k; } woof.end();
      // spots: aim at a point sweeping across the stage floor
      heads.begin(); cones.begin();
      for (let i = 0; i < 4; i++) {
        const sw = Math.sin(tt * 0.9 + i * 2.1) * 1.5, sz = Math.cos(tt * 0.7 + i * 1.3) * 0.7, hx = HX[i], c = SPOT_COL[i];
        _v.set(sw + (i - 1.5) * 0.45 - hx, 0.09 - HY, 1.4 + CZ + sz - HZ); const len = _v.length(); _v.multiplyScalar(1 / len);
        _q.setFromUnitVectors(_Y, _v); heads.putQ(hx, HY, HZ, _q, 1, 1, 1);
        _qa.setFromUnitVectors(_Y, _d.copy(_v).negate()); const rad = 0.5 + 0.12 * Math.sin(tt * 2 + i), a = 0.6 + 0.5 * pulse;
        cones.putQ(hx + _v.x * len / 2, HY + _v.y * len / 2, HZ + _v.z * len / 2, _qa, rad, len, rad, c[0] * a, c[1] * a, c[2] * a);
        fx.glow(wx + hx + _v.x * len, 0.12, wz + HZ + _v.z * len, 1.1 + pulse * 0.3, c[0], c[1], c[2], 0.22 + 0.14 * pulse);
      }
      heads.end(); cones.end();
      // bulbs: marquee chase + footlights
      const ph = (tt * 5) | 0;
      for (let i = 0; i < bulbs.length; i++) { const b = bulbs[i], on = ((ph + (i >> 1)) & 1) === (i & 1) ? 1 : 0.28; fx.bulb(wx + b[0], b[1], wz + b[2], 0.075, 1.6 * on + 0.3, 1.25 * on + 0.2, 0.55 * on + 0.1); }
      for (let i = 0; i < foot.length; i++) { const b = foot[i], s = Math.max(0, Math.sin(tt * 4 - i * 0.55)); fx.bulb(wx + b[0], b[1], wz + b[2], 0.06, 1.2 + s, 0.9 + 0.5 * s, 0.7 + 0.8 * s); }
      for (const sd of [-1, 1]) fx.bulb(wx + sd * TX, TH + 0.4, wz + TZ, 0.05, 1.8, 1.4, 0.5);
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); lt.dispose && lt.dispose(); lm.dispose(); coneMat.dispose(); smat.dispose(); }
  };
}
