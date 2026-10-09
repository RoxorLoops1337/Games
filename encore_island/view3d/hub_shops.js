// Encore Island 3D, the three money fixtures: the SELL stall (with its keeper), the Vault (coin stacks grow with S.pallet) and the Encore Tour monument.
// Each builder returns { group, update(dt, t, focus), dispose() }; local frame = the 2D position (X = x*W, Z = y*W), +z faces the camera.
import * as THREE from 'three';
import { Builder, C, INK, W, TAU, PI, seg, GB, GOLD, SHINY, lit, glow, damp, clamp, hash01 } from './kit.js';
import { Inst, ringQuad, QuadSet, rod, outline, rbx, bll } from './hub_fx.js';
import { bakeActor } from './bake.js';

const WOOD = 0xd9a468, WOOD_D = 0xa8703c, GOLDC = 0xffd84d;
const GOLDM = { m: GOLD, c: GOLDC };

// ------------------------------------------------------------------ SELL stall
export function buildStall(V, fx) {
  const g = new THREE.Group(); g.name = 'stall'; g.position.set(SELL.x * W, 0, SELL.y * W);
  const b = new Builder({ ao: 0.18 });
  // counter in front, keeper behind it, open shelves at the back; the awning only roofs the back half so the keeper stays visible from the high camera
  rbx(b, WOOD, 0, 0.43, 0.9, 2.2, 0.84, 0.8, 0.2); rbx(b, C.cream, 0, 0.9, 0.9, 2.36, 0.09, 0.94, 0.45); rbx(b, 0xfff0d8, 0, 0.945, 0.9, 2.2, 0.03, 0.8, 0.5);
  for (const y of [0.22, 0.5]) rbx(b, WOOD_D, 0, y, 1.305, 2.12, 0.035, 0.03, 0.4);
  rbx(b, GOLDM, 0, 0.5, 1.325, 0.5, 0.36, 0.05, 0.4); bll(b, 0x3a2410, 0, 0.5, 1.365, 0.045, 1); // little gold plaque with a coin slot
  rbx(b, 0xc88a50, 0, 1.0, -0.68, 2.28, 2.0, 0.12, 0.1);
  for (const y of [0.98, 1.44]) rbx(b, 0xe8c49a, 0, y, -0.5, 2.12, 0.07, 0.3, 0.4);
  const cols = [C.pink, C.mint, C.sky, C.gold, C.violet, C.orange];
  for (let i = 0; i < 6; i++) { const x = -0.88 + i * 0.35, y = i % 2 ? 1.0 : 1.47; bll(b, cols[i], x, y + 0.14, -0.5, 0.14, 0.85); bll(b, C.cream, x - 0.05, y + 0.2, -0.4, 0.035, 1); }
  for (const sx of [-1, 1]) for (const z of [-0.7, 0.35]) { b.cyl(WOOD, sx * 1.16, 0, z, 0.075, 2.1, 10); bll(b, GOLDM, sx * 1.16, 2.12, z, 0.1, 0.8); }
  // striped awning: sloping stripes with a scalloped front
  const n = 7, sw = 2.84 / n, slope = 0.26, rl = 1.15, zc = -0.2, y0 = 2.13;
  for (let i = 0; i < n; i++) {
    const x = -1.42 + sw * (i + 0.5), col = i % 2 ? C.cream : C.hotPink, fy = y0 - rl * 0.5 * Math.sin(slope), fz = zc + rl * 0.5 * Math.cos(slope);
    b.part(GB.box(), col, x, y0, zc, sw * 0.98, 0.09, rl, slope, 0, 0);
    b.part(GB.box(), col, x, fy - 0.08, fz - 0.01, sw * 0.98, 0.16, 0.06, 0.05, 0, 0);
    b.part(GB.ico(1), col, x, fy - 0.17, fz + 0.01, sw * 0.49, sw * 0.34, 0.035, 0, 0, 0);
  }
  // sign leaning back on the roof so the high camera reads it
  const qs = new QuadSet(), tilt = -0.62, sy = 2.78, sz = -0.58, sn = [0, -Math.sin(tilt), Math.cos(tilt)];
  rbx(b, 0x5a3a1e, 0, sy, sz, 1.9, 0.68, 0.1, 0.4, 0, tilt); for (const sx of [-0.6, 0.6]) rbx(b, WOOD_D, sx, 2.4, -0.5, 0.08, 0.5, 0.08, 0.4);
  fx.atlas.quad(qs, 'SELL', 1.8, 0, sy + sn[1] * 0.056, sz + sn[2] * 0.056, 0, tilt, 0.6);
  // coin pile + till on the counter
  for (let i = 0; i < 5; i++) b.cyl({ m: GOLD, c: i % 2 ? 0xffe066 : 0xf0b422 }, 0.7, 0.98 + i * 0.045, 0.9, 0.14, 0.045, 12);
  b.cyl(INK, -0.7, 0.98, 0.92, 0.2, 0.05, 14); b.cyl(C.mint, -0.7, 0.99, 0.92, 0.17, 0.05, 14); b.cyl(INK, -0.7, 1.04, 0.92, 0.03, 0.2, 8); rbx(b, C.cream, -0.7, 1.26, 0.92, 0.38, 0.05, 0.08, 0.5);
  g.add(outline(b.build({ cast: true })));
  const sign = fx.atlas.mesh(qs); g.add(sign);
  // keeper: heroes3d builds jordan; ask lazily, then park him behind the counter
  let keeper = null, tried = 0, kt = 0; const stK = { speed: 0, atk: false, cast: false, cheer: false, hurt: 0, singing: false, die: 0, elite: false, gold: false, slow: false, glow: false, dash: false, carry: [] };
  return {
    group: g,
    update(dt, t) {
      if (!keeper && (tried += dt) > 0.5 && tried < 1e5) { tried = -1; const H = V.mods && (V.mods.heroes || V.mods.heroes3d); if (H && H.makeHero) { try { keeper = H.makeHero('jordan'); keeper.group.position.set(0, 0, -0.05); keeper.group.userData.hubKeeper = true; g.add(keeper.group); try { bakeActor(keeper); } catch (e) { /* unbaked keeper still renders */ } } catch (e) { keeper = null; tried = 1e6; } } else tried = 0; }
      if (keeper) { stK.cheer = (t * 0.7 | 0) % 6 === 0; try { keeper.update(dt, t, stK); } catch (e) { /* keeper is optional */ } }
      void kt;
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); }); }
  };
}

// ------------------------------------------------------------------ the Vault
export function buildVault(V, fx) {
  const g = new THREE.Group(); g.name = 'vault'; g.position.set(VAULT.x * W, 0, VAULT.y * W);
  const b = new Builder({ ao: 0.15 }), BW = 2.8, BD = 1.5, BHT = 0.98;
  rbx(b, 0xb8793c, 0, BHT / 2, 0.0, BW, BHT, BD, 0.14);
  for (const y of [0.22, 0.46, 0.7]) rbx(b, 0x96602e, 0, y, BD / 2 + 0.005, BW - 0.06, 0.03, 0.04, 0.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { rbx(b, GOLDM, sx * (BW / 2 - 0.04), BHT / 2, sz * (BD / 2 - 0.04), 0.14, BHT + 0.04, 0.14, 0.3); bll(b, GOLDM, sx * (BW / 2 - 0.04), BHT + 0.04, sz * (BD / 2 - 0.04), 0.1, 0.8); }
  rbx(b, GOLDM, 0, BHT / 2, BD / 2 + 0.02, 0.34, BHT + 0.02, 0.06, 0.4); rbx(b, 0x5a3a1e, 0, 0.55, BD / 2 + 0.07, 0.3, 0.34, 0.05, 0.4); rbx(b, GOLDM, 0, 0.55, BD / 2 + 0.09, 0.22, 0.26, 0.05, 0.4); bll(b, INK, 0, 0.55, BD / 2 + 0.13, 0.035, 1);
  // open-top frame and a dark floor the coins sit on
  rbx(b, GOLDM, 0, BHT + 0.04, BD / 2 - 0.05, BW - 0.1, 0.1, 0.12, 0.4); rbx(b, GOLDM, 0, BHT + 0.04, -BD / 2 + 0.05, BW - 0.1, 0.1, 0.12, 0.4);
  rbx(b, GOLDM, -BW / 2 + 0.07, BHT + 0.04, 0, 0.12, 0.1, BD - 0.1, 0.4); rbx(b, GOLDM, BW / 2 - 0.07, BHT + 0.04, 0, 0.12, 0.1, BD - 0.1, 0.4);
  b.box(0x5a3a1e, 0, BHT - 0.02, 0, BW - 0.2, 0.04, BD - 0.2);
  g.add(outline(b.build({ cast: true })));
  // coins
  const coinG = new THREE.CylinderGeometry(1, 1, 1, 12).toNonIndexed(); coinG.deleteAttribute('uv');
  const coinM = lit(0xffffff, { rough: 0.3, metal: 0.25, emissive: 0x6a4000, ei: 0.2 }), coins = new Inst(coinG, coinM, 380, { colors: true, cast: true }); g.add(coins.mesh);
  const ring = ringQuad({ r: VAULT.r * W, rin: 0.95, rout: 1.0, col: 0xffd84d, dash: 22, spin: 0.08, a: 0.5 }); ring.position.y = 0.045; g.add(ring);
  const cols = 8, rowsN = 7, sh = { n: 0 }, hsh = [];
  for (let i = 0; i < 56; i++) hsh.push(2 + ((i * 7 + 3) % 5));
  const topY = BHT, CR = 0.115, CH = 0.05;
  const stackPos = (i) => { const c = i % cols, r = Math.floor(i / cols), x = -1.05 + c * 0.3 + (r % 2) * 0.1, z = 0.52 - r * 0.17; return [x, z, r]; };
  const sparks = []; for (let k = 0; k < 6; k++) sparks.push(k / 6);
  return {
    group: g,
    update(dt, t) {
      const target = COIN_STACKS(S.pallet || 0); sh.n = damp(sh.n, target, 6, dt); if (Math.abs(sh.n - target) < 0.01) sh.n = target;
      coins.begin();
      for (let i = 0; i < 56; i++) {
        const vis = clamp(sh.n - i, 0, 1); if (vis <= 0.001) continue;
        const [x, z, r] = stackPos(i), h = hsh[i], base = topY + 0.0 + r * 0.02;
        for (let j = 0; j < h; j++) { const top = j === h - 1, k = vis * (1 + (top ? 0.0 : 0)), tw = j % 2 ? 0.0 : 0.0; coins.put(x + tw, base + CH / 2 + j * CH * vis, z, 0, i * 1.7 + j, 0, CR * k, CH * k + 0.001, CR * k, top ? 1.0 : j % 2 ? 0.98 : 0.9, top ? 0.8 : j % 2 ? 0.68 : 0.5, top ? 0.25 : j % 2 ? 0.14 : 0.06); }
      }
      coins.end();
      if (S.pallet > 0) for (let k = 0; k < 6; k++) { const ph = (t * 1.1 + sparks[k]) % 1, id = Math.floor(t * 1.1 + sparks[k]) * 7 + k, x = (hash01(id * 3 + 1) - 0.5) * 2.4, z = (hash01(id * 5 + 2) - 0.5) * 1.0, a = Math.sin(ph * PI), y = BHT + 0.25 + ph * 0.5; fx.glow(g.position.x + x, y, g.position.z + z, 0.28 * a + 0.05, 1.6, 1.4, 0.7, 0.9 * a); }
      // label above the coins (dynamic text goes to the HUD overlay)
      const L = V.labels; if (L) L.pill(S.pallet > 0 ? fmt(S.pallet) : 'Vault', g.position.x, 0.05, g.position.z + 1.45, { c1: '#ffe98a', c2: '#f0b422', px: 14 });
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  };
}

// ------------------------------------------------------------------ Encore Tour monument
export function buildMonument(V, fx) {
  const g = new THREE.Group(); g.name = 'monument'; g.position.set(MONU.x * W, 0, MONU.y * W);
  const b = new Builder({ ao: 0.14 });
  b.cyl(0xe6d3a3, 0, 0, 0, 1.2, 0.16, seg(32)); b.cyl(0xf3e4bd, 0, 0.16, 0, 0.92, 0.16, seg(28)); b.cyl(C.cream, 0, 0.32, 0, 0.74, 0.05, seg(24));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; bll(b, { m: GOLD, c: GOLDC }, Math.cos(a) * 1.1, 0.17, Math.sin(a) * 1.1, 0.045, 0.7); }
  const bl = b.build({ cast: true }); g.add(outline(bl));
  // plinth: ink slab + two materials (gold / lavender) toggled by readiness
  const mk = (col, trim) => { const p = new Builder({ ao: 0.16 }); rbx(p, col, 0, 0.95, 0, 1.08, 1.2, 1.1, 0.2); rbx(p, trim, 0, 1.55, 0, 1.28, 0.16, 1.28, 0.4); rbx(p, trim, 0, 0.42, 0, 1.24, 0.14, 1.24, 0.4);
    rbx(p, trim, 0, 0.95, 0.56, 0.5, 0.5, 0.06, 0.4); rbx(p, INK, 0, 0.95, 0.58, 0.4, 0.4, 0.05, 0.4); return outline(p.build({ cast: true })); };
  const plR = mk(0xffd84d, 0xfff4e6), plN = mk(0xb9b2d0, 0xe6dcff); g.add(plR, plN);
  const emb = new THREE.Mesh(new THREE.ShapeGeometry(starShapeGeo(), 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.5), fog: true })); emb.position.set(0, 0.95, 0.64); emb.scale.setScalar(0.17); g.add(emb);
  // crown (two copies, gold when the tour is ready, lavender otherwise)
  const mkCrown = (body, spike, gem1, gem2) => { const cb = new Builder({ ao: 0.1 }); cb.cyl(body, 0, 0, 0, 0.5, 0.26, seg(20), 0.92); cb.cyl(spike, 0, 0.22, 0, 0.48, 0.07, seg(20), 1.0);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4; cb.cone(spike, x, 0.24, z, 0.15, 0.42, 8); bll(cb, i % 2 ? gem1 : gem2, x, 0.68, z, 0.07, 1); }
    bll(cb, gem1, 0, 0.14, 0.5, 0.08, 1); bll(cb, gem2, -0.34, 0.14, 0.36, 0.065, 1); bll(cb, gem2, 0.34, 0.14, 0.36, 0.065, 1); return cb.build({ cast: false }); };
  const crR = mkCrown({ m: GOLD, c: 0xffd84d }, { m: GOLD, c: 0xffe27a }, 0xff5fa6, 0x6ee0d8), crN = mkCrown(0xb9b2d0, 0xd8d0ec, 0xe6dcff, 0xc8bfe8);
  const crownPivot = new THREE.Group(); crownPivot.add(crR, crN); crownPivot.scale.setScalar(1.2); g.add(crownPivot);
  const ring = ringQuad({ r: 1.55, rin: 0.9, rout: 1.0, col: 0xffd84d, prog: 0, a: 1 }); ring.position.y = 0.2; g.add(ring);
  const track = ringQuad({ r: 1.55, rin: 0.9, rout: 1.0, col: 0xffffff, prog: 1, a: 0.0 }); track.position.y = 0.19; g.add(track);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 5, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.85, 0.4), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); beam.position.y = 2.7; beam.renderOrder = 5; g.add(beam);
  let readyK = 0;
  return {
    group: g,
    update(dt, t) {
      const ready = S.lands.length >= PRESTIGE_MIN, chg = clamp((S.prestT || 0) / PREST_T, 0, 1); readyK = damp(readyK, ready ? 1 : 0, 6, dt);
      plR.visible = ready; plN.visible = !ready; crR.visible = ready; crN.visible = !ready;
      const bob = Math.sin(t * 2) * 0.08, beat = fx.beat();
      crownPivot.position.y = 2.35 + bob + chg * 0.25; crownPivot.rotation.y = t * (0.7 + chg * 5); crownPivot.scale.setScalar(1.2 + (ready ? 0.08 * beat : 0) + chg * 0.15);
      emb.visible = ready; ring.userData.u.uProg.value = chg; ring.userData.u.uA.value = ready ? 1 : 0; track.userData.u.uA.value = 0.2 * readyK; ring.userData.u.uT.value = t;
      beam.visible = readyK > 0.02; track.visible = readyK > 0.02; beam.material.opacity = readyK * (0.03 + 0.02 * Math.sin(t * 3) + 0.08 * chg);
      const px = g.position.x, pz = g.position.z;
      if (ready) { fx.glow(px, 2.35 + bob, pz, 2.2 + beat * 0.4 + chg * 1.2, 1.2, 0.9, 0.3, 0.4 + 0.3 * chg); for (let k = 0; k < 5; k++) { const ph = (t * 0.5 + k / 5) % 1, a = k * 2.4 + t * 0.4; fx.glow(px + Math.cos(a) * (0.5 + ph * 0.6), 1.5 + ph * 2.2, pz + Math.sin(a) * (0.5 + ph * 0.6), 0.22 * Math.sin(ph * PI) + 0.03, 1.6, 1.4, 0.7, 0.9 * Math.sin(ph * PI)); } }
      const L = V.labels; if (L) {
        if (ready) { L.pill('ENCORE TOUR  +' + crownsToGain() + ' crowns', px, 3.6, pz, { c1: '#ffe98a', c2: '#f0b422', px: 12 }); L.pill('stand still to begin', px, 3.25, pz, { c1: '#ffffff', c2: '#dccaff', px: 10 }); }
        else L.pill('Encore Tour: ' + S.lands.length + '/' + PRESTIGE_MIN + ' lands', px, 3.6, pz, { c1: '#ffffff', c2: '#dccaff', px: 12 });
      }
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); emb.material.dispose(); beam.material.dispose(); }
  };
}
function starShapeGeo() { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + PI / 2, r = i % 2 ? 0.45 : 1, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
