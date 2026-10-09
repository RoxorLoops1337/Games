// Encore Island 3D, the home island: buildings, fixtures and every hub plate. Self-syncs from S each frame (reads only, never writes).
//   init(V) -> { update(dt, t, focus), dispose() }
// The pieces live in hub_*.js (stage, town props, shops, smelter, districts, backstage hatch, plates); this file wires them to shared light pools
// (bulbs, glows, puffs: one draw call each) and runs them.
import * as THREE from 'three';
import { Inst, Bill, signAtlas, batchStatics, DynBatch } from './hub_fx.js';
import { buildStage } from './hub_stage.js';
import { buildPlates } from './hub_plates.js';
import { buildStall, buildVault, buildMonument } from './hub_shops.js';
import { buildForge, buildTray } from './hub_forge.js';
import { buildTown } from './hub_town.js';
import { buildHatch, buildWarp } from './hub_hatch.js';
import { buildMarket, buildArena, buildStudio } from './hub_districts.js';

export function init(V) {
  const root = new THREE.Group(); root.name = 'hub3d'; const host = V.hubGroup || V.world || V.scene; if (host && host.add) host.add(root); V.hubRoot = root;
  const cam = V.camera || { quaternion: new THREE.Quaternion() };
  // shared pools: every module drops its lights into these each frame
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }); bulbMat.userData.noCast = true; bulbMat.userData.noLook = true;
  const bulbs = new Inst(new THREE.IcosahedronGeometry(1, 1), bulbMat, 360, { colors: true }); bulbs.mesh.renderOrder = 2;
  const glows = new Bill(cam, { max: 240, tex: 'glow', add: true, order: 7 });
  const puffs = new Bill(cam, { max: 96, tex: 'shadow', add: false, order: 6 });
  root.add(bulbs.mesh, glows.mesh, puffs.mesh);
  const atlas = signAtlas();
  const dyn = new DynBatch(root);
  const fx = { V, t: 0, atlas, root, dyn, beat: () => (V.LOOK ? V.LOOK.beat.value : 0),
    bulb: (x, y, z, s, r, g, b) => bulbs.put(x, y, z, 0, 0, 0, s, s, s, r, g, b),
    glow: (x, y, z, s, r, g, b, a) => glows.put(x, y, z, s, r, g, b, a),
    puff: (x, y, z, s, r, g, b, a) => puffs.put(x, y, z, s, r, g, b, a) };
  const mods = [];
  const add = (fn) => { try { const m = fn(V, fx); if (m) { mods.push(m); if (m.group) root.add(m.group); (m.dynGroups || []).forEach((o, i) => dyn.set(o, (m.group && m.group.name || 'm') + ':' + i)); } } catch (e) { console.error('hub3d module failed', e); } };
  add(buildStage);
  add(buildStall); add(buildVault); add(buildMonument);
  add(buildForge); add(buildTray);
  add(buildMarket); add(buildArena); add(buildStudio);
  add(buildHatch); add(buildWarp);
  add(buildTown);
  add(buildPlates);
  let statics = null; try { statics = batchStatics(root); } catch (e) { console.error('hub3d batch failed', e); }
  return {
    root, fx,
    update(dt, t, focus) {
      const fc = focus || { x: 0, z: 0 };
      // far from the hub (a distant land, the Backstage room): nothing of it can be on screen, so skip drawing and updating it
      if (fc.x * fc.x + fc.z * fc.z > 75 * 75) { root.visible = false; return; }
      root.visible = true; fx.t = t; bulbs.begin(); glows.begin(); puffs.begin();
      for (const m of mods) { try { m.update(dt, t, fc); } catch (e) { if (!m._err) { m._err = 1; console.error('hub3d update failed', e); } } }
      dyn.update(); bulbs.end(); glows.end(); puffs.end();
    },
    dispose() { for (const m of mods) try { m.dispose && m.dispose(); } catch (e) { /* ignore */ } if (statics) statics.children.forEach((m) => m.geometry.dispose()); dyn.dispose(); root.removeFromParent(); atlas.dispose(); bulbs.mesh.geometry.dispose(); glows.mesh.geometry.dispose(); puffs.mesh.geometry.dispose(); bulbMat.dispose(); glows.mesh.material.dispose(); puffs.mesh.material.dispose(); }
  };
}
