// SPOTS module (Gameplay Engineer). Activity spots in the park with glowing world markers, floating icons, proximity prompts. CONTRACT:
//   buildSpots(ctx, terrain) -> { group, spots:[{id,label,icon,x,z,radius}], update(dt,t,playerPos), nearest(playerPos)->spot|null, activate(id) }
//   spot ids: busk (crate stage: play a set), bench (rest + talk to BeeAmGee + lesson), run (jog loop start), flyers (gate: odd job), jukebox or tuner (optional)
//   activate(id) emits ctx.events 'spot' with {id}. The game bridge (main.js) maps these onto the real game actions.
import { THREE } from './kit.js';
export function buildSpots(ctx, terrain) { const group = new THREE.Group(); const a = terrain.anchors; const spots = [{ id: 'busk', label: 'BUSK', icon: 'busk', x: a.buskSpot.x, z: a.buskSpot.z, radius: 2.2 }]; return { group, spots, update() {}, nearest() { return null; }, activate(id) { ctx.events.emit('spot', { id }); } }; }
