// Encore Island 3D, every hub upgrade circle: 5 hero plates, 3 gem plates, smelter, smelter upgrade, warp pads, backstage stairway.
// Same costs and affordability as render_world.js drawHubPlates/drawPlate; reads S, never writes it.
import * as THREE from 'three';
import { W, SOLID, GOLD } from './kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePlate } from './plate3d.js';

const px2 = (a, b) => a * a + b * b;

export function buildPlates(V, fx) {
  const g = new THREE.Group(); g.name = 'hubPlates';
  const list = []; // { plate, rpx, x, y, tick(state), st (reused state object), hidden }
  const mk = (x, y, rpx, o, tick) => { const plate = makePlate(V, Object.assign({ r: rpx * W }, o)); plate.group.position.set(x * W, 0, y * W); g.add(plate.group); const e = { plate, rpx, x, y, tick, st: { hidden: false, doneTxt: null, near: false }, hidden: false }; list.push(e); return e; };
  for (const key of Object.keys(UPG)) { // the Training Terrace
    const u = UPG[key], pos = UPG_POS[key];
    mk(pos.x, pos.y, 46, { icon: u.icon }, (st) => { const c = upgCost(key, S.up[key]), paid = S.upPaid[key], rem = Math.max(0, c - paid); st.label = u.name; st.lvl = S.up[key] + 1; st.cost = c; st.paid = paid; st.rem = rem; st.afford = S.wallet >= rem; });
  }
  for (const key of Object.keys(GEMU)) { // Hall of Fame + Market gem plates
    const pos = GEM_POS[key], u = GEMU[key];
    mk(pos.x, pos.y, 42, { icon: key === 'coin' ? 'coin' : key, gem: true, c1: '#46c8c0', c2: '#1a6a8a', ring: '#b8fff6' }, (st) => { const c = gemUpCost(key, S.gemUp[key]), paid = S.gemPaid[key], rem = Math.max(0, c - paid); st.label = u.name + ' · ' + u.what; st.lvl = S.gemUp[key]; st.cost = c; st.paid = paid; st.rem = rem; st.afford = S.gems >= rem; });
  }
  mk(FORGE.x, FORGE.y, 52, { icon: 'forge', c1: '#ff9a4e', c2: '#c8501e', ring: '#ffd84d', lvl: false }, (st) => { const p = S.forgePlate; st.hidden = !!S.forge || S.lands.length < 1; st.label = 'Smelter'; st.cost = p.cost; st.paid = p.paid; st.rem = Math.max(0, p.cost - p.paid); st.afford = S.wallet >= st.rem; });
  mk(FUP.x, FUP.y, 40, { icon: 'amp', c1: '#ffb060', c2: '#c8601e', ring: '#ffd84d', lvl: false }, (st) => { const c = forgeUpCost(S.forgeLvl), paid = S.forgeUpPlate.paid; st.hidden = !S.forge || S.forgeLvl >= FORGE_LVL_MAX; st.label = 'Upgrade Smelter'; st.cost = c; st.paid = paid; st.rem = Math.max(0, c - paid); st.afford = S.wallet >= st.rem; });
  mk(WAYPLATE.x, WAYPLATE.y, 44, { icon: 'way', c1: '#5ab8e8', c2: '#2a5a9a', ring: '#b8f4ff', lvl: false }, (st) => { const p = S.wayPlate; st.hidden = !!S.waygate || S.lands.length < 2; st.label = 'Warp Pads'; st.cost = p.cost; st.paid = p.paid; st.rem = Math.max(0, p.cost - p.paid); st.afford = S.wallet >= st.rem; });
  mk(HATCH.x, HATCH.y, 46, { icon: 'lock', c1: '#c86aa8', c2: '#5a2a6a', ring: '#ff9ac8', lvl: false }, (st) => { // opens the Backstage stairway once BACKSTAGE_OPEN lands exist
    const p = S.bsPlate, cost = p.cost || (typeof bsPlateCost === 'function' ? bsPlateCost() : 0); st.hidden = S.lands.length < BACKSTAGE_OPEN || p.built; st.label = 'Backstage'; st.cost = cost; st.paid = p.paid; st.rem = Math.max(0, cost - p.paid); st.afford = S.wallet >= st.rem; });
  // batching: every plate's static stone, studs and post are folded into two shared meshes (rebuilt only when a plate shows or hides);
  // only the animated sign (bobbing disc, icon, badge) and the ring shader stay per plate. Saves ~3 draw calls per plate.
  g.updateMatrixWorld(true);
  const mergedS = new THREE.Mesh(new THREE.BufferGeometry(), SOLID), mergedG = new THREE.Mesh(new THREE.BufferGeometry(), GOLD); mergedS.castShadow = true; mergedS.receiveShadow = true; mergedG.receiveShadow = true; mergedS.frustumCulled = mergedG.frustumCulled = false; g.add(mergedS, mergedG);
  for (const e of list) {
    e.solid = []; e.gold = []; const kill = [];
    e.plate.group.traverse((o) => { if (!o.isMesh || !o.geometry || o.material !== SOLID && o.material !== GOLD) return; for (let p = o; p; p = p.parent) if (p === e.plate.sign) return; kill.push(o); });
    for (const o of kill) { const gm = o.geometry.clone().applyMatrix4(o.matrixWorld); (o.material === GOLD ? e.gold : e.solid).push(gm); o.parent.remove(o); }
  }
  let sig = -1;
  const rebuild = () => { for (const [mesh, key] of [[mergedS, 'solid'], [mergedG, 'gold']]) { const parts = []; for (const e of list) if (!e.hidden) parts.push(...e[key]); const old = mesh.geometry; mesh.geometry = parts.length ? mergeGeometries(parts, false) : new THREE.BufferGeometry(); old.dispose(); mesh.visible = parts.length > 0; } };
  return {
    group: g,
    update(dt, t, focus) {
      let ns = 0, bit = 1;
      for (const e of list) {
        const st = e.st; st.hidden = false; st.doneTxt = null; const dx = focus.x - e.x * W, dz = focus.z - e.y * W, r = (e.rpx + 110) * W;
        try { e.tick(st); } catch (er) { st.hidden = true; }
        st.near = dx * dx + dz * dz < r * r; e.plate.setState(st); e.plate.update(dt, t); e.hidden = !!st.hidden; if (e.hidden) ns |= bit; bit <<= 1;
      }
      if (ns !== sig) { sig = ns; rebuild(); }
    },
    dispose() { g.removeFromParent(); for (const e of list) { e.plate.dispose && e.plate.dispose(); for (const gm of e.solid.concat(e.gold)) gm.dispose(); } g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  };
}
