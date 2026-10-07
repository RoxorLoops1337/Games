// World module: the Sound Lab (lab*.js), an interior dollhouse with profile 'studio'. spots: mic mixer door. No NPC.
//   world.setBeat(b) bounces the VU ladders and needles and flashes the MPC pads; world.setSpotState('mic', { badge: 'REC' }) (or { rec: true }) lights the REC lamp and the ON AIR sign.
//   world.focus('desk' | 'pads' | 'booth' | 'wide') are the camera presets (Beat Maker and Recorder sit on desk / pads).
import { THREE } from './kit.js';
import { buildLab } from './lab.js';

const NOP = () => {};
export default function create(ctx, args) {
  args = args || {}; ctx.todInit = args.time !== undefined ? args.time : 'dusk';
  let terrain;
  try { terrain = buildLab(ctx); } catch (e) { console.error('[park3d] lab terrain failed: ' + (e && e.stack || e)); terrain = { group: new THREE.Group(), bounds: { minX: -4.5, maxX: 4.5, minZ: -3.5, maxZ: 3.5 }, blocked: () => false, anchors: { start: { x: 0, z: 2, rot: Math.PI }, lamps: [] }, interior: true, windows: [], lights: [], spotDefs: [] }; }
  terrain.focusPreset = (name, o) => {
    const pr = terrain.cameraPresets && terrain.cameraPresets[name]; if (!pr) return false; const w = ctx.host && ctx.host.world, c = w && w.controls; if (!c || !c.focus) return false; o = o || {};
    return c.focus(pr.target, { dist: o.dist || pr.dist, pitch: o.pitch !== undefined ? o.pitch : pr.pitch, yaw: o.yaw !== undefined ? o.yaw : pr.yaw, ms: o.ms !== undefined ? o.ms : pr.ms });
  };
  return {
    terrain, flora: { group: new THREE.Group(), update: NOP }, npcSpecs: [], profile: 'studio',
    setBeat(b) { if (terrain.setBeat) terrain.setBeat(b); },
    setSpotState(id, st) { if (id === 'mic' && terrain.setRec) { st = st || {}; if ('rec' in st) terrain.setRec(!!st.rec); else if ('badge' in st) terrain.setRec(!!st.badge); } },
    focus(target, o) { return typeof target === 'string' && terrain.cameraPresets && terrain.cameraPresets[target] ? terrain.focusPreset(target, o) : undefined; },
  };
}
