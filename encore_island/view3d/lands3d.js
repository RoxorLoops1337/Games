// Encore Island 3D, everything built ON the lands (islands 1..n, S.lands[k-1]); the ground and props belong to env3d.js.
//   per land : build plates + the Headliner altar plate (plate3d), the three towers, War Drums / Amp Up / Crowd Gate upgrades, the creature
//              den, the HOME warp pad (once S.waygate)                                   -> lands_towers.js, lands_den.js
//   global   : the unlock portal for the next island and the locked-island teaser          -> lands_portal.js
//   features : mastery flags, secrets, land events, rival banners and pad                  -> lands_feat.js
// The module syncs itself from S every frame (create / dispose as S.lands grows, resets on prestige or load) and never writes S.
// Things pop in with a spring when they appear DURING play (a tower built, a new island); on load / prestige they just appear.
//   const lands = init(V);  lands.update(dt, t, { x, z });  lands.dispose();
import * as THREE from 'three';
import { W } from './kit.js';
import { makePlate } from './plate3d.js';
import { speakerTower, discoTower, boomBox, drumKit, ampWall, crowdGate } from './lands_towers.js';
import { makeDen, makePad } from './lands_den.js';
import { makePortal, makeTeaser } from './lands_portal.js';
import { makeFeat } from './lands_feat.js';
import { easeBack, beamMesh, disposeDeep, fixPlate } from './lands_fx.js';

const PLATE_R = 42 * W, ALTAR_R = 38 * W, POP = 0.7, NEAR_PAD = 110;
const TOWER_MAKE = { archer: speakerTower, wizard: discoTower, catapult: boomBox };
const near2 = (ax, ay, bx, by, r) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy < r * r; };
const collect = (g) => { const out = []; g.traverse((o) => { if (o.userData && o.userData.billboard) out.push(o); }); return out; };
const plateOf = (z, id) => z.plates.find((p) => p.id === id);
/** spring a group in: age counts seconds since it appeared (>= 90 means "already there") */
const pop = (grp, age, delay = 0) => { const s = age >= 90 ? 1 : easeBack((age - delay) / POP); grp.scale.setScalar(Math.max(0.001, s)); grp.visible = s > 0.002; };

export function init(V) {
  const root = new THREE.Group(); root.name = 'lands3d'; V.world.add(root);
  const views = [], dying = []; let teaser = null, portal = null, first = true;
  const feat = makeFeat(V);
  const burst = (x, y, z, c) => { const fx = V.fx; if (fx && fx.burst) { try { fx.burst(x, y, z, c); } catch (e) { /* cosmetic only */ } } };

  // ------------------------------------------------------------ one land
  function buildLand(z, animate) {
    const g = new THREE.Group(); g.name = 'land' + z.k; root.add(g);
    const L = { z, g, age: animate ? 0 : 99, life: 0, plates: [], towers: new Map(), den: makeDen(z), pad: null, drums: null, amps: null, gate: null, altar: null, ampN: 0, gateN: 0, bb: [] };
    z.plates.forEach((pl, i) => {
      const altar = pl.id === 'altar', p = fixPlate(makePlate(V, { r: PLATE_R, icon: pl.icon, c1: altar ? '#c85a5a' : undefined, c2: altar ? '#6a1f3a' : undefined }));
      p.group.position.set(pl.x * W, 0, pl.y * W); g.add(p.group); L.plates.push({ pl, p, i });
    });
    L.den.g.position.set(z.g.den.x * W, 0, z.g.den.y * W); g.add(L.den.g); L.bb = collect(g); return L;
  }
  function disposeLand(L) {
    L.plates.forEach(({ p }) => p.dispose()); L.towers.forEach((v) => v.dispose()); L.den.dispose(); [L.pad, L.drums, L.amps, L.gate, L.altar].forEach((v) => v && v.dispose());
    disposeDeep(L.g); root.remove(L.g);
  }
  // an add-on that appears during play springs in (age 0); one that is already there when we first see the land just stands (age 99)
  const born = (L, v) => { v.age = L.life < 0.3 ? 99 : 0; return v; };

  function updateLand(L, dt, t) {
    const z = L.z, g = L.g, p = S.player; L.age += dt; L.life += dt;
    // build plates
    for (const { pl, p: pv, i } of L.plates) {
      const rem = Math.max(0, pl.cost - pl.paid);
      pv.setState({ hidden: !!pl.built, afford: S.wallet >= rem, paid: pl.paid, cost: pl.cost, rem, lvl: pl.repeat ? pl.lvl + 1 : undefined, label: pl.name + (pl.repeat ? ' LV' + (pl.lvl + 1) : ''), near: near2(p.x, p.y, pl.x, pl.y, PLATE_R / W + NEAR_PAD) });
      pv.update(dt, t); if (!pl.built) pop(pv.group, L.age, i * 0.06);
    }
    // the Headliner altar: one plate for ready, one for resting (a plate's colours are fixed when it is built)
    if (z.altar && !L.altar) {
      const a = z.altar, mk = (ready) => { const pv = fixPlate(makePlate(V, { r: ALTAR_R, icon: 'altar', noBob: !ready, c1: ready ? '#e05a7a' : '#6a5a88', c2: ready ? '#6a1f3a' : '#3e3076', ring: '#ffb0c8' })); pv.group.position.set(a.x * W, 0, a.y * W); g.add(pv.group); return pv; };
      const beam = beamMesh(0.7, 0.4, 3.2, { c: 0xff7a9a, a: 0.12, fall: 1.2, stripes: 4, spd: 2 }); beam.position.set(a.x * W, 0.15, a.y * W); g.add(beam);
      const ready = mk(true), rest = mk(false); L.altar = born(L, { ready, rest, beam, dispose() { ready.dispose(); rest.dispose(); } }); L.bb = collect(g);
    }
    if (L.altar) {
      const a = z.altar, ready = a.cd <= 0, A = L.altar, near = near2(p.x, p.y, a.x, a.y, ALTAR_R / W + NEAR_PAD);
      A.ready.setState({ hidden: !ready, afford: true, paid: 0, cost: 0, rem: 0, near, label: 'Summon Headliner' });
      A.rest.setState({ hidden: ready, afford: false, paid: 0, cost: 0, rem: 0, near, label: 'Headliner resting' });
      A.ready.update(dt, t); A.rest.update(dt, t); A.age += dt; A.beam.visible = ready; A.beam.userData.u.uA.value = 0.1 + 0.05 * Math.sin(t * 4);
      if (!ready && V.labels) V.labels.pill(Math.ceil(a.cd) + 's', a.x * W, 0.05, a.y * W + 1.2, { c1: '#ffffff', c2: '#dccaff', px: 12 });
      pop(A.ready.group, A.age); pop(A.rest.group, A.age);
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
    if (lvlA > 0 && L.ampN !== lvlA) { const pl = plateOf(z, 'towersUp'); if (pl) { if (L.amps) { L.amps.dispose(); g.remove(L.amps.g); } L.amps = born(L, ampWall(lvlA)); L.ampN = lvlA; L.amps.g.position.set(pl.x * W, 0, pl.y * W - 2.1); g.add(L.amps.g); } }
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
    const lands = S.lands, n = lands.length;
    for (let i = views.length - 1; i >= 0; i--) if (views[i].z !== lands[i]) { disposeLand(views[i]); views.splice(i, 1); } // prestige / load swap the objects
    while (views.length > n) disposeLand(views.pop());
    for (let k = views.length; k < n; k++) {
      const z = lands[k], grow = !first && n === views.length + 1 && S.t - z.born < 2; views.push(buildLand(z, grow));
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
      for (const L of views) { // lands far from the hero cost nothing
        const gg = L.z.g, near = Math.hypot(fx - gg.x * W, fz - gg.y * W) < gg.r * W + 34; L.g.visible = near;
        if (near) { updateLand(L, dt, t); face(L.bb, cam); }
      }
      const u = S.unlockPlate;
      if (portal) { const ok = !!u && Math.hypot(fx - u.x * W, fz - u.y * W) < 40; portal.g.visible = ok; if (ok) { portal.update(dt, t, u, S.wallet >= Math.max(0, u.cost - u.paid), (S.beaconUntil || 0) > S.t, false, u.x * W, u.y * W); face(portal.bb, cam); } }
      if (teaser) { const gg = geoOf(teaser.n), ok = Math.hypot(fx - gg.x * W, fz - gg.y * W) < gg.r * W + 45; teaser.g.visible = ok; if (ok) { teaser.update(dt, t); face(teaser.bb, cam); } }
      for (let i = dying.length - 1; i >= 0; i--) { const d = dying[i]; d.update(dt, t); face(d.bb, cam); if (d.done) { d.dispose(); root.remove(d.g); dying.splice(i, 1); } }
      feat.update(dt, t, focus);
    },
    views, feat,
    dispose() {
      for (const L of views) disposeLand(L); views.length = 0; if (portal) { portal.dispose(); root.remove(portal.g); portal = null; } if (teaser) { teaser.dispose(); root.remove(teaser.g); teaser = null; }
      dying.forEach((d) => d.dispose()); dying.length = 0; feat.dispose(); V.world.remove(root);
    },
  };
}
