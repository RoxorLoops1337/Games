// STUB world for ids that artists have not built yet (title, creator, street, shop, lab, bar, hood, office, arena): a painted ground, a label, ambient light,
// anchors.start and no spots, so every owner can render and walk something from day one. Replace by pointing the id in worlds.js at your own module.
// Same contract as every world module: create(ctx, args) -> { terrain, flora?, npcSpecs, profile, camera?, update?, dispose }.
import { THREE, box, merged, flatMat, mesh, canvasTex } from './kit.js';

// per id: footprint (x by z metres), ground colours, label colour, profile (lighting family)
export const STUBS = {
  title: { w: 24, d: 20, a: '#4b3a63', b: '#5a4673', c: '#ff7ab8', profile: 'out' },
  creator: { w: 14, d: 14, a: '#3b3158', b: '#4a3f6c', c: '#2ee6ff', profile: 'studio' },
  street: { w: 70, d: 22, a: '#58506a', b: '#6a6280', c: '#ffd23f', profile: 'out' },
  shop: { w: 10, d: 8, a: '#8a6a52', b: '#9a7a5e', c: '#ffb26b', profile: 'in' },
  lab: { w: 9, d: 7, a: '#4a4663', b: '#58547a', c: '#9dff4a', profile: 'studio' },
  bar: { w: 12, d: 10, a: '#4a3550', b: '#5a4262', c: '#ff3ea5', profile: 'club' },
  hood: { w: 24, d: 24, a: '#5a6a5a', b: '#6a7a68', c: '#9dff4a', profile: 'out' },
  office: { w: 10, d: 8, a: '#6a6a7a', b: '#7a7a8a', c: '#e8e4f0', profile: 'in' },
  arena: { w: 20, d: 16, a: '#4a3a5a', b: '#5a4a6a', c: '#ff5a5a', profile: 'stage' },
};

export default function create(ctx) {
  const id = ctx.worldId || 'stub', S = STUBS[id] || { w: 20, d: 20, a: '#4b3a63', b: '#5a4673', c: '#ffd23f', profile: 'out' };
  const group = new THREE.Group(); group.name = 'stub_' + id;
  const parts = [], hw = S.w / 2, hd = S.d / 2;
  // checker floor in 2 m tiles so scale and walking speed are readable
  const nx = Math.ceil(S.w / 2), nz = Math.ceil(S.d / 2);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) parts.push(box(2, 0.1, 2, (i + j) % 2 ? S.a : S.b, -hw + 1 + i * 2, -0.05, -hd + 1 + j * 2));
  const ground = mesh(merged(parts), flatMat(), { cast: false }); ground.name = 'stub_ground'; group.add(ground);
  // painted label lying on the floor near the start
  const tex = canvasTex(256, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(23,16,43,0.55)'; g.fillRect(8, 24, w - 16, h - 48); g.fillStyle = S.c; g.font = '800 46px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(id.toUpperCase(), w / 2, h / 2); });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  label.rotation.x = -Math.PI / 2; label.position.set(0, 0.03, Math.min(hd - 2, 1)); label.name = 'stub_label'; group.add(label);
  group.add(new THREE.AmbientLight('#ffffff', 0.35));
  const bounds = { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd };
  const terrain = { group, bounds, blocked: () => false, heightAt: () => 0, pathDist: () => 1e9, keepout: () => false, paths: [], spotDefs: [], anchors: { start: { x: 0, z: Math.max(0, hd - 3), rot: Math.PI }, lamps: [] } };
  // interior-family profiles (in, club, studio, stage) use the interior lighting pipeline: it needs the interior flag, window and light lists and the dollhouse camera
  if (S.profile !== 'out') { terrain.interior = true; terrain.windows = []; terrain.lights = []; terrain.camera = { dist: 11, pitch: 50, yaw: 35, fov: 34, minDist: 7, maxDist: 15, focusY: 0.8 }; }
  return { terrain, flora: null, npcSpecs: [], profile: S.profile };
}
