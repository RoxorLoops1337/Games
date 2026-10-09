// Encore Island 3D, the town districts from f_crew.js: Market (west), Arena (east) and Studio (north-west). Each shows once the town tier opens it
// (DISTRICTS[].on()) and reflects its own state: market level, arena ready, studio recording. Local frame = the district position, +z faces the camera.
import * as THREE from 'three';
import { Builder, C, INK, W, TAU, PI, seg, GB, GOLD, lit, latheGeo, damp, clamp, hash01 } from './kit.js';
import { Inst, QuadSet, outline, rbx, bll, floorMat } from './hub_fx.js';

const GOLDM = { m: GOLD, c: 0xffd84d };
const crew = () => { try { const f = FEATS.find((x) => x.id === 'crew'); return f && f.api ? f.api : null; } catch (e) { return null; } };
const isOn = (id, tier) => { const a = crew(); if (a && a.DISTRICTS) { const d = a.DISTRICTS.find((x) => x.id === id); if (d) return !!d.on(); } return typeof townTierIdx === 'function' && townTierIdx() >= tier; };
const posOf = (id, fb) => { const a = crew(); const d = a && a.DISTRICTS && a.DISTRICTS.find((x) => x.id === id); return d ? d.pos : fb; };
const sg = (tilt, x, y, z, off) => [x, y - Math.sin(tilt) * off, z + Math.cos(tilt) * off]; // point `off` along a tilted board's normal

// ------------------------------------------------------------------ Market
export function buildMarket(V, fx) {
  const P = posOf('market', { x: -500, y: -150 }), g = new THREE.Group(); g.name = 'market'; g.position.set(P.x * W - 0.55, 0, P.y * W - 0.2);
  let built = null, lvl = -1; const fruit = [C.pink, C.orange, C.gold, C.mint, C.violet, C.hotPink];
  function build(L) {
    if (built) { built.removeFromParent(); built.traverse((o) => { if (o.geometry && !o.userData.keep) o.geometry.dispose(); }); }
    const b = new Builder({ ao: 0.18 }), qs = new QuadSet(), grp = new THREE.Group();
    rbx(b, 0xe8dcc4, 0, 0.04, 0.2, 3.3, 0.08, 2.4, 0.4); // plank apron
    rbx(b, 0xd9a468, 0, 0.45, 0.62, 2.4, 0.9, 0.9, 0.2); rbx(b, C.cream, 0, 0.93, 0.62, 2.55, 0.09, 1.05, 0.45); for (const y of [0.24, 0.56]) rbx(b, 0xa8703c, 0, y, 1.085, 2.3, 0.035, 0.03, 0.4);
    rbx(b, 0xc88a50, 0, 1.05, -0.62, 2.5, 2.1, 0.12, 0.1);
    for (const sx of [-1, 1]) for (const z of [-0.65, 0.2]) { b.cyl(0xb07840, sx * 1.28, 0, z, 0.08, 2.2, 10); bll(b, GOLDM, sx * 1.28, 2.22, z, 0.1, 0.8); }
    const n = 8, sw = 3.1 / n, slope = 0.26, rl = 1.15, zc = -0.2, y0 = 2.25;
    for (let i = 0; i < n; i++) { const x = -1.55 + sw * (i + 0.5), col = i % 2 ? C.cream : 0xffa63a, fy = y0 - rl * 0.5 * Math.sin(slope), fz = zc + rl * 0.5 * Math.cos(slope);
      b.part(GB.box(), col, x, y0, zc, sw * 0.98, 0.09, rl, slope, 0, 0); b.part(GB.box(), col, x, fy - 0.08, fz - 0.01, sw * 0.98, 0.16, 0.06, 0.05, 0, 0); b.part(GB.ico(1), col, x, fy - 0.17, fz + 0.01, sw * 0.49, sw * 0.34, 0.035, 0, 0, 0); }
    // crates of produce around the stall; every market level adds more
    const crate = (x, z, c1, ry) => { b.local(x, 0, z, ry, (q) => { rbx(q, 0xc88a50, 0, 0.2, 0, 0.62, 0.4, 0.5, 0.2); rbx(q, 0xa8703c, 0, 0.3, 0.255, 0.58, 0.05, 0.02, 0.4); for (let k = 0; k < 6; k++) bll(q, fruit[(k + c1) % 6], -0.2 + (k % 3) * 0.2, 0.47, -0.1 + Math.floor(k / 3) * 0.2, 0.1, 0.95); }); };
    crate(-1.0, 1.7, 0, 0.1); if (L >= 1) crate(0.9, 1.75, 2, -0.15); if (L >= 2) crate(-1.9, 0.4, 4, 0.5); if (L >= 3) crate(1.95, 0.3, 1, -0.4); if (L >= 4) { crate(-1.85, -0.9, 3, 0.8); crate(1.9, -0.8, 5, -0.7); }
    if (L >= 5) for (const sx of [-1, 1]) rbx(b, GOLDM, sx * 1.55, 2.28, 0.08, 0.06, 0.06, 1.1, 0.5);
    // sign
    const tilt = -0.62, sy = 2.95, sz = -0.6; rbx(b, 0x5a3a1e, 0, sy, sz, 2.1, 0.74, 0.1, 0.4, 0, tilt); for (const sx of [-0.7, 0.7]) rbx(b, 0xa8703c, sx, 2.52, -0.52, 0.08, 0.5, 0.08, 0.4);
    const sp = sg(tilt, 0, sy, sz, 0.056); fx.atlas.quad(qs, 'MARKET', 2.0, sp[0], sp[1], sp[2], 0, tilt, 0.66);
    // hot item plate on the counter
    b.cyl(0x4a2a1e, 0.85, 0.98, 0.62, 0.3, 0.04, 14); b.cyl(0xff7a2a, 0.85, 1.02, 0.62, 0.26, 0.03, 14);
    grp.add(outline(b.build({ cast: true }), 0.028)); grp.add(fx.atlas.mesh(qs)); built = grp; g.add(grp); lvl = L;
  }
  return {
    group: g,
    update(dt, t) {
      const on = isOn('market', 1); g.visible = on; if (!on) return;
      let L = 0; try { L = Math.min(5, ((S.feat.crew || {}).market || {}).lvl || 0); } catch (e) { L = 0; } if (L !== lvl) build(L);
      const px = g.position.x, pz = g.position.z, beat = fx.beat();
      for (let i = 0; i < 5; i++) { const ph = (t * 0.8 + i / 5) % 1; fx.glow(px + 0.85 + Math.sin(i * 2.4 + t) * 0.2, 1.1 + ph * 0.7, pz + 0.62, 0.2 * Math.sin(ph * PI) + 0.02, 1.8, 1.0, 0.3, 0.9 * Math.sin(ph * PI)); }
      fx.glow(px + 0.85, 1.1, pz + 0.62, 0.9 + beat * 0.2, 1.2, 0.6, 0.2, 0.35);
      const a = crew(), L2 = V.labels; if (L2 && a && a.hotK) L2.pill('HOT  Lv ' + a.hotK() + '  x2', px, 0.05, pz + 1.65, { c1: '#ffb060', c2: '#ff7a2a', px: 11 });
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  };
}

// ------------------------------------------------------------------ Arena
export function buildArena(V, fx) {
  const P = posOf('arena', { x: 500, y: 60 }), g = new THREE.Group(); g.name = 'arena'; g.position.set(P.x * W, 0, P.y * W);
  const b = new Builder({ ao: 0.2 }), qs = new QuadSet(), RO = 1.55;
  b.cyl({ m: floorMat(), c: 0xc89a62 }, 0, 0, 0, RO - 0.3, 0.07, seg(32)); b.cyl({ m: floorMat(), c: 0xe0b078 }, 0, 0.07, 0, 0.7, 0.02, seg(24)); b.tor(0xb07a48, 0, 0.09, 0, 0.55, 0.03, 6, seg(24), PI / 2);
  // curved wall: radial blocks with a gap in front for the gate; arched alcoves on the outer face, crenels on top
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, front = Math.abs(Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2))); if (front < 0.3) continue;
    b.local(Math.cos(a) * RO, 0, Math.sin(a) * RO, -a + PI / 2, (q) => {
      rbx(q, i % 2 ? 0xff9a8a : 0xffaa9a, 0, 0.58, 0, 0.62, 1.16, 0.4, 0.14); rbx(q, 0xd8384f, 0, 0.07, 0.03, 0.66, 0.16, 0.44, 0.3); rbx(q, C.cream, 0, 1.14, 0.0, 0.68, 0.1, 0.46, 0.4);
      if (i % 2) rbx(q, 0xffd0c8, 0, 1.3, 0, 0.3, 0.22, 0.32, 0.3);
      if (a > 0.2 && a < PI - 0.2) { rbx(q, 0x7a1c3a, 0, 0.5, 0.2, 0.3, 0.5, 0.05, 0.45); q.cyl(0x7a1c3a, 0, 0.72, 0.2, 0.15, 0.05, 10, 1); }
    });
  }
  // gate: two pillars and the sign across the top
  for (const sx of [-1, 1]) { rbx(b, 0xff9a8a, sx * 0.56, 0.7, RO, 0.3, 1.4, 0.4, 0.2); rbx(b, C.cream, sx * 0.56, 1.42, RO, 0.38, 0.1, 0.48, 0.4); bll(b, GOLDM, sx * 0.56, 1.58, RO, 0.12, 0.9); }
  const tilt = -0.55, sy = 1.98, sz = RO - 0.02; rbx(b, 0x5a1a2a, 0, sy, sz, 1.9, 0.68, 0.1, 0.4, 0, tilt); for (const sx of [-0.6, 0.6]) rbx(b, 0xb02a40, sx, 1.62, RO + 0.02, 0.08, 0.45, 0.08, 0.4);
  { const sp = sg(tilt, 0, sy, sz, 0.056); fx.atlas.quad(qs, 'ARENA', 1.8, sp[0], sp[1], sp[2], 0, tilt, 0.6); }
  for (const sx of [-1, 1]) { b.cyl(0xa8703c, sx * 2.2, 0, 0.7, 0.06, 2.4, 8); bll(b, GOLDM, sx * 2.2, 2.45, 0.7, 0.09, 0.9); }
  g.add(outline(b.build({ cast: true }), 0.028)); g.add(fx.atlas.mesh(qs));
  // waving pennants (instanced, 2 draws total with the "!" marker)
  const flagG = new THREE.PlaneGeometry(1, 1, 6, 1); flagG.translate(0.5, 0, 0); const fm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true }); fm.userData.noLook = true;
  const flags = new Inst(flagG, fm, 2, { colors: true }); g.add(flags.mesh);
  const bang = new THREE.Group(); { const bb = new Builder({ ao: 0 }); rbx(bb, GOLDM, 0, 0.3, 0, 0.2, 0.5, 0.2, 0.5); bll(bb, GOLDM, 0, -0.1, 0, 0.12, 1); bang.add(outline(bb.build({ cast: false }), 0.03)); } bang.position.y = 3.0; g.add(bang);
  return {
    group: g,
    update(dt, t) {
      const on = isOn('arena', 2); g.visible = on; if (!on) return;
      const px = g.position.x, pz = g.position.z, a = crew(); let ready = false; try { ready = !!(a && a.arenaReady && a.arenaReady()); } catch (e) { ready = false; }
      flags.begin(); for (const sx of [-1, 1]) { const w = Math.sin(t * 5 + sx) * 0.18; flags.put(sx * 2.2, 2.2, 0.7, 0, sx > 0 ? PI : 0, w, 0.6, 0.3, 1, sx < 0 ? 1.0 : 1.0, sx < 0 ? 0.7 : 0.25, sx < 0 ? 0.1 : 0.55); } flags.end();
      bang.visible = ready; if (ready) { bang.position.y = 3.0 + Math.sin(t * 4) * 0.1; bang.rotation.y = Math.sin(t * 2) * 0.4; fx.glow(px, 3.05 + Math.sin(t * 4) * 0.1, pz, 1.5 + fx.beat() * 0.4, 1.4, 1.0, 0.3, 0.5); }
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); fm.dispose(); }
  };
}

// ------------------------------------------------------------------ Studio
export function buildStudio(V, fx) {
  const P = posOf('studio', { x: -250, y: -410 }), g = new THREE.Group(); g.name = 'studio'; g.position.set(P.x * W, 0, P.y * W);
  const b = new Builder({ ao: 0.2 }), qs = new QuadSet(), BW = 2.1, BHT = 1.5, BD = 1.4;
  rbx(b, 0xe8dcc4, 0, 0.04, 0.1, 2.8, 0.08, 2.2, 0.4);
  rbx(b, 0x9a7af0, 0, BHT / 2 + 0.05, 0, BW, BHT, BD, 0.1); rbx(b, 0xc6a8ff, 0, BHT + 0.1, 0, BW + 0.14, 0.18, BD + 0.14, 0.4); rbx(b, 0x7a5ad8, 0, 0.14, 0, BW + 0.1, 0.22, BD + 0.1, 0.3);
  rbx(b, 0x3a2a86, 0, 0.6, BD / 2 + 0.01, 0.6, 1.0, 0.06, 0.3); b.cyl(0x3a2a86, 0, 1.0, BD / 2 + 0.01, 0.3, 0.06, 14, 1); b.part(GB.cyl(14), 0x3a2a86, 0, 1.1, BD / 2 + 0.02, 0.3, 0.06, 0.3, PI / 2, 0, 0);
  rbx(b, C.cream, -0.38, 0.6, BD / 2 + 0.04, 0.09, 1.0, 0.06, 0.4); rbx(b, C.cream, 0.38, 0.6, BD / 2 + 0.04, 0.09, 1.0, 0.06, 0.4); rbx(b, C.cream, 0, 1.12, BD / 2 + 0.04, 0.85, 0.09, 0.06, 0.4);
  for (const sx of [-1, 1]) { rbx(b, C.cream, sx * 0.72, 0.95, BD / 2 + 0.03, 0.42, 0.34, 0.05, 0.3); rbx(b, 0x9ad8ff, sx * 0.72, 0.95, BD / 2 + 0.06, 0.34, 0.26, 0.05, 0.3); rbx(b, 0xdff4ff, sx * 0.72 - 0.06, 1.0, BD / 2 + 0.09, 0.12, 0.06, 0.03, 0.5); }
  // antenna mast, dish, mic stand
  b.cyl(0xc9cfe6, 0.78, BHT + 0.2, -0.1, 0.035, 1.2, 8); b.part(GB.sph(12, 8), 0xe6dcff, -0.7, BHT + 0.42, -0.1, 0.34, 0.14, 0.34, -0.7, 0, 0); b.cyl(0xc9cfe6, -0.7, BHT + 0.2, -0.1, 0.03, 0.2, 6);
  rbx(b, 0x2a1a5a, 0.3, BHT + 0.3, 0.35, 0.82, 0.34, 0.1, 0.4, 0, -0.5);
  { const sp = sg(-0.5, 0.3, BHT + 0.3, 0.35, 0.06); fx.atlas.quad(qs, 'ON AIR', 0.74, sp[0], sp[1], sp[2], 0, -0.5, 0.25); }
  const tilt = -0.6; rbx(b, 0x4a2a90, -0.4, BHT + 0.75, -0.3, 1.5, 0.56, 0.1, 0.4, 0, tilt); { const sp = sg(tilt, -0.4, BHT + 0.75, -0.3, 0.056); fx.atlas.quad(qs, 'STUDIO', 1.4, sp[0], sp[1], sp[2], 0, tilt, 0.46); }
  g.add(outline(b.build({ cast: true }), 0.028)); g.add(fx.atlas.mesh(qs));
  const beacon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshBasicMaterial({ color: 0xff3d6e })); beacon.position.set(0.78, BHT + 0.86, -0.1); g.add(beacon);
  return {
    group: g,
    update(dt, t) {
      const on = isOn('studio', 3); g.visible = on; if (!on) return;
      let rec = false; try { rec = ((S.feat.crew || {}).studio || { slots: [] }).slots.some((s) => !s.done); } catch (e) { rec = false; }
      const px = g.position.x, pz = g.position.z, blink = rec ? ((t * 1.2) % 2 < 1.4 ? 1 : 0.2) : 0.3;
      beacon.material.color.setRGB(2.2 * blink + 0.2, 0.2 * blink, 0.4 * blink + 0.1);
      fx.glow(px + 0.78, BHT + 0.86, pz - 0.1, 0.9 * blink + 0.2, 1.6, 0.2, 0.4, 0.7 * blink);
      if (rec) for (let k = 0; k < 3; k++) { const ph = (t * 0.7 + k / 3) % 1; fx.glow(px + 0.78, BHT + 0.86, pz - 0.1, 0.4 + ph * 2.2, 1.2, 0.5, 1.0, 0.5 * (1 - ph)); }
      const L = V.labels; if (L && rec) L.pill('ON AIR', px + 0.3, BHT + 0.75, pz + 0.4, { c1: '#ff9ab0', c2: '#ff3d6e', px: 10 });
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose && o.material.isMeshBasicMaterial) o.material.dispose(); }); }
  };
}
