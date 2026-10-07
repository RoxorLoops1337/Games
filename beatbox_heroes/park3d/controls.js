// CONTROLS module (Gameplay Engineer). Third-person camera rig for a PORTRAIT phone (3/4 view, pitch about 50 to 58 degrees, follow with critically damped smoothing,
// slight look-ahead), tap-to-move with grid A* over terrain.blocked(), an optional on-screen joystick, collision against blocked(), walk/run blending.
// CONTRACT: createControls(ctx, { player (character), terrain, spots, dom }) -> { update(dt,t), moveTo(x,z), stop(), onTapWorld(x,z), setEnabled(b), camera rig is applied to ctx.camera }
import { THREE } from './kit.js';
export function createControls(ctx, o) {
  const p = o.player; p.object.position.set(o.terrain.anchors.start.x, 0, o.terrain.anchors.start.z); ctx.camera.position.set(0, 14, 22); ctx.camera.lookAt(0, 0, 8);
  return { update() {}, moveTo() {}, stop() {}, setEnabled() {} };
}
