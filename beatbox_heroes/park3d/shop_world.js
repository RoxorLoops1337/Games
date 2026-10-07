// World module: the Thrift Shop (shop*.js), an interior dollhouse. See host.js and worlds.js for the world-module contract.
//   spots: hats racks mirror counter door. NPC: the clerk behind the counter (tap = ACTIONS.shop.counter). Camera presets: world.focus('mirror' | 'hats' | 'racks' | 'counter').
//   The player's mirrored copy is drawn in the mirror opening, so a live setLook() from the try-on sheet shows from front and back.
import { THREE } from './kit.js';
import { buildShop, attachReflection } from './shop.js';
import { CLERK_LOOK } from './char_cast.js';

const NOP = () => {};
export default function create(ctx, args) {
  args = args || {}; ctx.todInit = args.time !== undefined ? args.time : 'dusk';
  let terrain;
  try { terrain = buildShop(ctx); } catch (e) { console.error('[park3d] shop terrain failed: ' + (e && e.stack || e)); terrain = { group: new THREE.Group(), bounds: { minX: -5, maxX: 5, minZ: -4, maxZ: 4 }, blocked: () => false, anchors: { start: { x: 0, z: 2, rot: Math.PI }, lamps: [] }, interior: true, windows: [], lights: [], spotDefs: [] }; }
  const refl = (() => { try { return attachReflection(ctx); } catch (e) { console.error('[park3d] shop reflection failed: ' + (e && e.stack || e)); return null; } })();
  let clerk = null, placed = false, hello = 0, near = false;
  const A = terrain.anchors && terrain.anchors.clerk || { x: 3.55, z: -3.0, rot: 0 };
  const spec = {
    terrain, flora: { group: new THREE.Group(), update: NOP }, npcSpecs: [{ id: 'clerk', look: args.clerkLook || CLERK_LOOK }], profile: 'in',
    update(dt, t) {
      if (!placed) { clerk = (ctx.npcs || []).find((n) => n && n.id === 'clerk') || null; if (clerk) { clerk.place(A.x, A.z, A.rot); clerk.play('idle'); placed = true; } }
      if (refl) refl.update(dt, t);
      const w = ctx.host && ctx.host.world, p = w && w.player && w.player.object.position;
      if (clerk && p) { const d = Math.hypot(p.x - A.x, p.z - A.z), n = d < 3.4; if (n !== near) { near = n; hello = n ? 1.6 : 0; if (n) clerk.play('wave', { duration: 1.4, then: 'idle' }); } }
    },
    // camera presets: world.focus('mirror') frames the try-on platform from the front-right; anything else falls through to the controls (npc ids, points)
    focus(target, o) {
      const pr = typeof target === 'string' && terrain.cameraPresets[target]; if (!pr) return undefined;
      const w = ctx.host && ctx.host.world, c = w && w.controls; if (!c || !c.focus) return false; o = o || {};
      if (target === 'mirror' && refl) refl.setActive(true);
      return c.focus(pr.target, { dist: o.dist || pr.dist, pitch: o.pitch !== undefined ? o.pitch : pr.pitch, yaw: o.yaw !== undefined ? o.yaw : pr.yaw, ms: o.ms !== undefined ? o.ms : pr.ms });
    },
    dispose() { placed = false; clerk = null; },
  };
  void hello;
  return spec;
}
