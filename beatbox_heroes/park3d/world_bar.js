// World module: The Bar (bar*.js, Stage and Club Artist INT-B). Contract: see host.js and worlds.js.
//   args: { day, clock:{hour,day}, programme ('openmic'|'showcase'|'battle'|'karaoke'|'closed' | {id,name,desc,tag,color}), crowd (0..24), regulars:['luca','mira','sky'] (Core.ROMANCE ids), seed, Core }
//   world.setClock({hour, day}) re-reads the programme (Core.barProgramme when core.js is loaded) and rewrites the chalkboard, the banner, the LED screen, the crowd size and the floor theme.
//   Extra world methods (attached to the world object on the first frame, also on world.terrain.api and world.bar): setCrowd(n 8..24), setProgramme(p), setEnergy(e), setLyrics(lines|null), setTheme(name), regularOf('regular0') -> 'luca'.
//   NPC slots: 'rohzel' (tap -> ACTIONS.bar.counter) and 'regular0'..'regular2' (tap -> mingleMenu(world.regularOf(id))).
import { THREE } from './kit.js';
import { buildBar, DEF_REG } from './bar.js';
import { NPC_LOOKS } from './char_npc.js';

export default function create(ctx, args) {
  args = args || {}; ctx.todInit = 'night'; const Core = args.Core || (typeof window !== 'undefined' && window.BBH && window.BBH.Core) || null;
  let terrain;
  try { terrain = buildBar(ctx, args); } catch (e) { console.error('[park3d] bar failed: ' + (e && e.stack || e)); terrain = { group: new THREE.Group(), bounds: { minX: -5, maxX: 5, minZ: -4, maxZ: 4 }, blocked: () => false, heightAt: () => 0, pathDist: () => 1e9, keepout: () => false, paths: [], spotDefs: [], anchors: { start: { x: 0, z: 2, rot: Math.PI } }, interior: true, windows: [], lights: [], camera: { dist: 11, pitch: 50, yaw: 35, fov: 34, minDist: 7, maxDist: 15, focusY: 0.8 } }; }
  const look = (id) => (Core && Core.NPCS && Core.NPCS[id] && Core.NPCS[id].look) || NPC_LOOKS[id];
  const reg = (args.regulars || DEF_REG).slice(0, 3);
  const npcSpecs = [{ id: 'rohzel', look: look('rohzel') }].concat(reg.map((who, i) => ({ id: 'regular' + i, look: look(who) })));
  return { terrain, flora: null, npcSpecs, profile: 'club', update: null, setClock: terrain.setClock, setBeat: terrain.setBeat, dispose() { try { if (terrain.crowd) terrain.crowd.dispose(); } catch (e) { /* ignore */ } } };
}
