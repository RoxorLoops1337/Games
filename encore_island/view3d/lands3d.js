// Encore Island 3D, everything built ON the lands (islands 1..n, S.lands[k-1]); the ground and props belong to env3d.js.
//   per land : build plates + the Headliner altar plate (plate3d), the three towers, War Drums / Amp Up / Crowd Gate upgrades, the creature
//              den, the HOME warp pad (once S.waygate)                                   -> lands_towers.js, lands_den.js
//   global   : the unlock portal for the next island and the locked-island teaser          -> lands_portal.js
//   features : mastery flags, secrets, land events, rival banners and pad                  -> lands_feat.js
// The module syncs itself from S every frame (create / dispose as S.lands grows, resets on prestige or load) and never writes S.
// Things pop in with a spring when they appear DURING play (a tower built, a new island); on load / prestige they just appear.
//   const lands = init(V);  lands.update(dt, t, { x, z });  lands.dispose();
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { W, PI } from './kit.js';
import { makePlate } from './plate3d.js';
import { speakerTower, discoTower, boomBox, drumKit, ampWall, crowdGate } from './lands_towers.js';
import { makeDen, makePad } from './lands_den.js';
import { makePortal, makeTeaser } from './lands_portal.js';
import { makeFeat } from './lands_feat.js';
import { easeBack, beamMesh, disposeDeep, fixPlate } from './lands_fx.js';

const PILL_CD = { c1: '#ffffff', c2: '#dccaff', px: 12 }, PLATE_R = 42 * W, ALTAR_R = 38 * W, POP = 0.7, NEAR_PAD = 110;
const TOWER_MAKE = { archer: speakerTower, wizard: discoTower, catapult: boomBox };
const near2 = (ax, ay, bx, by, r) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy < r * r; };
const collect = (g) => { const out = []; g.traverse((o) => { if (o.userData && o.userData.billboard) out.push(o); }); return out; };
const plateOf = (z, id) => z.plates.find((p) => p.id === id);
/** where to stand an add-on (Amp Up wall) near its plate: the clearest of 8 directions, north preferred (behind the plate sign). Obstacles: plates, den, pad, towers, drum kit. */
function clearSpot(L, pl, D, half) {
  const z = L.z, obs = [];
  for (const q of z.plates) if (q !== pl) obs.push([q.x * W, q.y * W, 1.4]);
  obs.push([z.g.den.x * W, z.g.den.y * W, 1.9], [z.pad.x * W, z.pad.y * W, 1.3]); for (const t of z.towers) obs.push([t.x * W, t.y * W, 1.1]);
  const gp = plateOf(z, 'gate2'); if (gp && z.hordeLvl > 0) obs.push([gp.x * W, gp.y * W - 1.15, 1.5]);
  let best = null, bs = -1e9; const cx = pl.x * W, cz = pl.y * W, R = z.g.r * W;
  for (let i = 0; i < 8; i++) { // NE, NW, E, W, N, SE, SW, S: diagonal-back first so the plate's own sign does not stand in front of the amps
    const a = [-PI / 4, -3 * PI / 4, 0, PI, -PI / 2, PI / 4, 3 * PI / 4, PI / 2][i], dd = D + 0.9 * Math.abs(Math.cos(a)), x = cx + Math.cos(a) * dd, zz = cz + Math.sin(a) * dd; let c = 1e9;
    for (const dx of [-half, 0, half]) for (const o of obs) c = Math.min(c, Math.hypot(x + dx - o[0], zz - o[1]) - o[2]);
    const rim = Math.hypot(x - z.g.x * W, zz - z.g.y * W) - R * 0.82; // keep off the shore
    const sc = Math.min(c, 0.3) * 3 - i * 0.3 - Math.max(0, rim) * 3; if (sc > bs) { bs = sc; best = { x, z: zz }; }
  }
  return best;
}
/** Fold the static parts of a land's build plates (stone bases, studs, sign posts) into 3 meshes: a land with 6 plates drops ~20 draw calls.
 *  Signs, rings, icons and badges stay live. Re-run whenever the set of built (hidden) plates changes. Silently skips if plate3d's layout is not the expected one. */
const _inv = new THREE.Matrix4();
function mergePlates(L) {
  if (L.merged) { L.merged.forEach((m) => { L.g.remove(m); m.geometry.dispose(); }); L.merged = null; }
  const buckets = new Map(); L.g.updateMatrixWorld(true); _inv.copy(L.g.matrixWorld).invert();
  for (const { pl, p } of L.plates) {
    const base = p.group.children[0], srcs = [];
    if (!base || !base.isGroup) return;
    base.children.forEach((m) => srcs.push([m, 'b']));
    p.group.updateMatrixWorld(true);
    for (const [m, kind] of srcs) {
      if (!m.isMesh) return; m.visible = false; if (pl.built) continue;
      const key = kind + m.material.uuid; let b = buckets.get(key); if (!b) buckets.set(key, b = { mat: m.material, geos: [], cast: kind === 'p' });
      const g = m.geometry.clone(); g.applyMatrix4(_m4.multiplyMatrices(_inv, m.matrixWorld)); b.geos.push(g);
    }
  }
  L.merged = [];
  for (const b of buckets.values()) { const geo = mergeGeometries(b.geos, false); b.geos.forEach((g) => g.dispose()); const m = new THREE.Mesh(geo, b.mat); m.castShadow = b.cast; m.receiveShadow = true; L.g.add(m); L.merged.push(m); }
}
const _m4 = new THREE.Matrix4();
/** spring a group in: age counts seconds since it appeared (>= 90 means "already there") */
const pop = (grp, age, delay = 0) => { const s = age >= 90 ? 1 : easeBack((age - delay) / POP); grp.scale.setScalar(Math.max(0.001, s)); grp.visible = s > 0.002; };

export function init(V) {
  const root = new THREE.Group(); root.name = 'lands3d'; V.world.add(root);
  const slots = [], dying = []; let teaser = null, portal = null, first = true; // slots[k] = { z: land state, L: its 3D view (built only while the hero is near), grow: spring in when built }
  const feat = makeFeat(V);
  // the 2D sim already queues ring + star bursts for a new island (fx3d bridges them); this adds a 3D sparkle fountain and shock ring on top
  const burst = (x, y, z, c) => { const fx = V.fx; if (!fx) return; try { if (fx.burst) fx.burst({ x, y, z, n: 36, colors: [c.c1, c.c2, 0xfff4e6, 0x9af0b4], speed: 6.5, up: 4, size: 0.22, life: 1, star: 0.5 }); if (fx.ring) fx.ring(x, z, c.r, c.c1, 0.9); } catch (e) { /* cosmetic only */ } };

  // ------------------------------------------------------------ one land
  function buildLand(z, animate) {
    const g = new THREE.Group(); g.name = 'land' + z.k; root.add(g);
    const L = { z, g, age: animate ? 0 : 99, life: 0, plates: [], towers: new Map(), den: makeDen(z), pad: null, drums: null, amps: null, gate: null, altar: null, ampN: 0, gateN: 0, bb: [], merged: null, mkey: -1 };
    z.plates.forEach((pl, i) => {
      const altar = pl.id === 'altar', p = fixPlate(makePlate(V, { r: PLATE_R, icon: pl.icon, c1: altar ? '#c85a5a' : undefined, c2: altar ? '#6a1f3a' : undefined }));
      p.group.position.set(pl.x * W, 0, pl.y * W); g.add(p.group); L.plates.push({ pl, p, i, st: {}, lv: -1, label: '' });
    });
    L.den.g.position.set(z.g.den.x * W, 0, z.g.den.y * W); g.add(L.den.g); L.bb = collect(g); return L;
  }
  function disposeLand(L) {
    L.plates.forEach(({ p }) => { p.dispose(); p.sign.children.forEach((c) => { if (c.userData && c.userData.tex) { c.userData.tex.dispose(); c.material.dispose(); } }); }); if (L.merged) L.merged.forEach((m) => m.geometry.dispose()); L.towers.forEach((v) => v.dispose()); L.den.dispose(); [L.pad, L.drums, L.amps, L.gate, L.altar].forEach((v) => v && v.dispose());
    disposeDeep(L.g); root.remove(L.g);
  }
  // an add-on that appears during play springs in (age 0); one that is already there when we first see the land just stands (age 99)
  const born = (L, v) => { v.age = L.life < 0.3 ? 99 : 0; return v; };

  function updateLand(L, dt, t) {
    const z = L.z, g = L.g, p = S.player; L.age += dt; L.life += dt;
    // build plates
    let key = 0;
    for (let i = 0; i < L.plates.length; i++) {
      const e = L.plates[i], pl = e.pl, pv = e.p, st = e.st, rem = Math.max(0, pl.cost - pl.paid), lv = pl.repeat ? pl.lvl + 1 : undefined;
      if (lv !== e.lv) { e.lv = lv; e.label = pl.name + (pl.repeat ? ' LV' + lv : ''); } // the label string only changes with the level
      st.hidden = !!pl.built; st.afford = S.wallet >= rem; st.paid = pl.paid; st.cost = pl.cost; st.rem = rem; st.lvl = lv; st.label = e.label; st.near = near2(p.x, p.y, pl.x, pl.y, PLATE_R / W + NEAR_PAD);
      pv.setState(st); pv.update(dt, t); if (!pl.built) { pop(pv.group, L.age, i * 0.06); key |= 1 << i; }
    }
    if (L.age > 1.5 && key !== L.mkey) { L.mkey = key; mergePlates(L); } // after the spring-in has settled
    // the Headliner altar: one plate for ready, one for resting (a plate's colours are fixed when it is built)
    if (z.altar && !L.altar) {
      const a = z.altar, mk = (ready) => { const pv = fixPlate(makePlate(V, { r: ALTAR_R, icon: 'altar', noBob: !ready, c1: ready ? '#e05a7a' : '#6a5a88', c2: ready ? '#6a1f3a' : '#3e3076', ring: '#ffb0c8' })); pv.group.position.set(a.x * W, 0, a.y * W); g.add(pv.group); return pv; };
      const beam = beamMesh(0.7, 0.4, 3.2, { c: 0xff7a9a, a: 0.12, fall: 1.2, stripes: 4, spd: 2 }); beam.position.set(a.x * W, 0.15, a.y * W); g.add(beam);
      const ready = mk(true), rest = mk(false); L.altar = born(L, { ready, rest, beam, sr: { hidden: false, afford: true, paid: 0, cost: 0, rem: 0, near: false, label: 'Summon Headliner' }, sz: { hidden: false, afford: false, paid: 0, cost: 0, rem: 0, near: false, label: 'Headliner resting' }, dispose() { for (const pv of [ready, rest]) { pv.dispose(); pv.sign.children.forEach((c) => { if (c.userData && c.userData.tex) { c.userData.tex.dispose(); c.material.dispose(); } }); } } }); L.bb = collect(g);
    }
    if (L.altar) {
      const a = z.altar, ready = a.cd <= 0, A = L.altar, near = near2(p.x, p.y, a.x, a.y, ALTAR_R / W + NEAR_PAD);
      let o = A.sr; o.hidden = !ready; o.near = near; A.ready.setState(o); o = A.sz; o.hidden = ready; o.near = near; A.rest.setState(o);
      A.ready.update(dt, t); A.rest.update(dt, t); A.age += dt; A.beam.visible = ready; A.beam.userData.u.uA.value = 0.1 + 0.05 * Math.sin(t * 4);
      if (!ready && V.labels) V.labels.pill(Math.ceil(a.cd) + 's', a.x * W, 0.05, a.y * W + 1.2, PILL_CD);
      pop(ready ? A.ready.group : A.rest.group, A.age); // only the plate in use (pop would otherwise re-show the hidden one)
    }
    // towers (built from plates; the tower stands where its plate was)
    for (const tw of z.towers) {
      let v = L.towers.get(tw);
      if (!v) { v = born(L, (TOWER_MAKE[tw.type] || speakerTower)(tw)); v.g.position.set(tw.x * W, 0, tw.y * W); g.add(v.g); L.towers.set(tw, v); L.bb = collect(g); }
      v.age += dt; v.update(dt, t, z); pop(v.g, v.age);
    }
    if (L.towers.size !== z.towers.length) for (const [tw, v] of L.towers) if (!z.towers.includes(tw)) { v.dispose(); g.remove(v.g); L.towers.delete(tw); L.bb = collect(g); }
    // War Drums: a kit where the drums plate stood
    if (z.drums && !L.drums) { const pl = plateOf(z, 'drums'); if (pl) { L.drums = born(L, drumKit()); L.drums.g.position.set(pl.x * W, 0, pl.y * W); g.add(L.drums.g); } }
    if (L.drums) { L.drums.update(dt, t); L.drums.age += dt; pop(L.drums.g, L.drums.age); }
    // Amp Up (a wall of amps behind its plate, one per level) and Crowd Gate (an arch behind its plate, bigger per level): rebuilt on a level change
    const lvlA = Math.min(6, z.towerLvl | 0), lvlG = Math.min(4, z.hordeLvl | 0);
    if (lvlA > 0 && L.ampN !== lvlA) { const pl = plateOf(z, 'towersUp'); if (pl) { if (L.amps) { L.amps.dispose(); g.remove(L.amps.g); } L.amps = born(L, ampWall(lvlA)); L.ampN = lvlA; const sp = clearSpot(L, pl, 2.2, 1.3); L.amps.g.position.set(sp.x, 0, sp.z); g.add(L.amps.g); } }
    if (L.amps) { L.amps.age += dt; pop(L.amps.g, L.amps.age); }
    if (lvlG > 0 && L.gateN !== lvlG) { const pl = plateOf(z, 'gate2'); if (pl) { if (L.gate) { L.gate.dispose(); g.remove(L.gate.g); } L.gate = born(L, crowdGate(lvlG)); L.gateN = lvlG; L.gate.g.position.set(pl.x * W, 0, pl.y * W - 1.15); g.add(L.gate.g); } }
    if (L.gate) { L.gate.age += dt; pop(L.gate.g, L.gate.age); }
    // den + the HOME warp pad (once the Warp Pads plate is paid)
    L.den.update(dt, t); pop(L.den.g, L.age, 0.1);
    if (S.waygate && !L.pad) { L.pad = born(L, makePad(V, 'HOME')); L.pad.g.position.set(z.pad.x * W, 0, z.pad.y * W); g.add(L.pad.g); L.bb = collect(g); }
    if (L.pad) { L.pad.update(dt, t, z.pad.x * W, z.pad.y * W); L.pad.age += dt; pop(L.pad.g, L.pad.age); }
  }

  // ------------------------------------------------------------ sync with S
  function sync() {
    const lands = S.lands, n = lands.length; let i = 0;
    while (i < slots.length && i < n && slots[i].z === lands[i]) i++; // prestige / load swap the land objects: drop everything from the first mismatch
    while (slots.length > i) { const sl = slots.pop(); if (sl.L) disposeLand(sl.L); }
    for (let k = slots.length; k < n; k++) {
      const z = lands[k], grow = !first && n === slots.length + 1 && S.t - z.born < 2; slots.push({ z, L: null, grow });
      if (grow) { const gg = z.g; burst(gg.x * W, 0.6, gg.y * W, { c1: 0xffe98a, c2: 0xff9ac8, r: gg.r * W * 0.9 }); }
    }
    if (portal && portal.n !== n + 1) { portal.dispose(); root.remove(portal.g); portal = null; }
    if (!portal && S.unlockPlate) { portal = makePortal(V, n + 1); root.add(portal.g); portal.bb = collect(portal.g); }
    if (!teaser || teaser.n !== n + 1) { // the old teaser dissolves when its island opens; any other change just replaces it
      if (teaser) { if (!first && n + 1 - teaser.n === 1) { teaser.die(); dying.push(teaser); } else { teaser.dispose(); root.remove(teaser.g); } }
      teaser = makeTeaser(V, n + 1); root.add(teaser.g); teaser.bb = collect(teaser.g);
    }
    first = false;
  }
  const face = (list, cam) => { if (cam) for (const o of list) o.quaternion.copy(cam.quaternion); };

  return {
    update(dt, t, focus) {
      if (typeof S === 'undefined' || !S.lands) return; dt = Math.min(dt, 0.1); sync();
      const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0, cam = V.camera;
      for (const sl of slots) { // lands are built when the hero comes near and dropped when far: a 40-land save does not keep 40 lands of meshes alive
        const gg = sl.z.g, d = Math.hypot(fx - gg.x * W, fz - gg.y * W), near = d < gg.r * W + 15;
        if (near && !sl.L) { sl.L = buildLand(sl.z, sl.grow); sl.grow = false; } else if (sl.L && d > gg.r * W + 40) { disposeLand(sl.L); sl.L = null; }
        const L = sl.L; if (L) { L.g.visible = near; if (near) { updateLand(L, dt, t); face(L.bb, cam); } }
      }
      const u = S.unlockPlate;
      if (portal) { const ok = !!u && Math.hypot(fx - u.x * W, fz - u.y * W) < 40; portal.g.visible = ok; if (ok) { portal.update(dt, t, u, S.wallet >= Math.max(0, u.cost - u.paid), (S.beaconUntil || 0) > S.t, false, u.x * W, u.y * W); face(portal.bb, cam); } }
      if (teaser) { const gg = geoOf(teaser.n), ok = Math.hypot(fx - gg.x * W, fz - gg.y * W) < gg.r * W + 45; teaser.g.visible = ok; if (ok) { teaser.update(dt, t); face(teaser.bb, cam); } }
      for (let i = dying.length - 1; i >= 0; i--) { const d = dying[i]; d.update(dt, t); face(d.bb, cam); if (d.done) { d.dispose(); root.remove(d.g); dying.splice(i, 1); } }
      feat.update(dt, t, focus);
    },
    slots, feat, get views() { return slots.map((sl) => sl.L); },
    dispose() {
      for (const sl of slots) if (sl.L) disposeLand(sl.L); slots.length = 0; if (portal) { portal.dispose(); root.remove(portal.g); portal = null; } if (teaser) { teaser.dispose(); root.remove(teaser.g); teaser = null; }
      dying.forEach((d) => d.dispose()); dying.length = 0; feat.dispose(); V.world.remove(root);
    },
  };
}
