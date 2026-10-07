// Lab3D interior (Interior Artist INT-A): the Sound Lab, a 9 x 7 m dollhouse: control room (desk with bouncing VU meters, racks, MPC pads, jukebox corner, couch) and a glass vocal booth.
// Contract = the flat terrain contract with spots mic, mixer, door. Profile 'studio'. Extras: terrain.setRec(bool), terrain.setBeat(b), terrain.cameraPresets { desk, pads, booth, wide }.
//   Layout (metres, +z toward the camera): x -4.5..4.5, z -3.5..3.5. Door on the south wall at x -2.2..-1.3.
import { makeStore, P, col, mix } from './flat_kit.js';
import { assembleInterior, mkSpot } from './shop_asm.js';
import { buildShell, windowContract } from './shop_shell.js';
import { makeLabAtlas } from './lab_atlas.js';
import { makeDyn } from './lab_dyn.js';
import { LAB, floorFn, wallFns, buildRoom } from './lab_room.js';
import { buildDesk, makeDeskAnim, DESK } from './lab_desk.js';
import { buildBooth, BOOTH } from './lab_booth.js';

export function buildLab(ctx) {
  const S = makeStore(); S.atlas = makeLabAtlas(); S.updaters = []; S.dyn = makeDyn();
  const guard = (name, fn) => { try { fn(); } catch (e) { console.error('[lab3d] ' + name + ' failed: ' + (e && e.stack || e)); } };
  const wins = [{ wall: 'W', u: 3.3, w: 1.3, y0: 1.75, h: 0.7, wood: col('#3f3857') }, { wall: 'N', u: 2.1, w: 1.4, y0: 2.0, h: 0.6, wood: col('#3f3857') }];
  const walls = wallFns(); let sh = null;
  guard('shell', () => { sh = buildShell(S, { b: LAB.b, H: LAB.H, LOW: LAB.LOW, T: LAB.T, floor: floorFn(), floorStep: 0.25, wallN: walls.N, wallW: walls.W, windows: wins, vBreaks: [0.12, 0.95, 1.0, 2.55, 0.3, 0.6], lowBase: col('#4a4070'), slabColor: col('#6a5f8a'),
    door: { u0: 5.8, u1: 6.7, color: col('#3f5f86'), cut: true }, sidewalk: true, trim: { skirt: col('#2a2040'), rail: col('#d8b04a'), railH: 0.97, corn: col('#2f2858') } }); });
  const F = sh.F;
  guard('room', () => buildRoom(S, F)); guard('desk', () => buildDesk(S, F)); guard('booth', () => buildBooth(S, F, S.atlas.rect));
  const dm = makeDyn; void dm; const dynMesh = S.dyn.finish(); S.extraMeshes = (S.extraMeshes || []).concat([dynMesh]);
  const anim = makeDeskAnim(S); S.updaters.push((dt, t) => anim.update(dt, t));
  // door ring dressing: the soundproof door seen as a lit plaque on the south wall posts is not needed (cutaway); a QUIET sign hangs on the booth post instead
  const A = (x, z, rot) => ({ x, z, rot });
  const anchors = { start: A(-0.2, 1.3, Math.PI), door: A(-1.75, 2.7, 0), doorSpot: A(-1.75, 2.7, 0), micSpot: A(BOOTH.stand.x, BOOTH.stand.z, -Math.PI / 2), mixerSpot: A(DESK.cx, -0.38, Math.PI), lamps: [] };
  anchors.mic = anchors.micSpot; anchors.mixer = anchors.mixerSpot;
  const spotDefs = [mkSpot('mic', 'micSpot', 'TRAIN', 'mic', '#ff3ea5', '#ffe14d', 'beatbox', { zoom: 0.26 }), mkSpot('mixer', 'mixerSpot', 'MIXER', 'mixer', '#2ee6ff', '#9dff4a', 'talk', { zoom: 0.22 }), mkSpot('door', 'doorSpot', 'LEAVE', 'door', '#9dff4a', '#2ee6ff', 'wave', null, 'door')];
  const cameraPresets = {
    desk: { target: { x: DESK.cx, y: 0.95, z: -1.3 }, dist: 4.4, pitch: 30, yaw: 12, ms: 800 }, pads: { target: { x: 0.75, y: 0.9, z: -1.5 }, dist: 3.0, pitch: 36, yaw: 18, ms: 700 },
    booth: { target: { x: 3.1, y: 1.2, z: -1.8 }, dist: 5.0, pitch: 34, yaw: 30, ms: 800 }, wide: { target: { x: 0, y: 0.8, z: 0 }, dist: 12.5, pitch: 50, yaw: 35, ms: 800 },
  };
  const paths = [{ id: 'main', w: 1.4, points: [{ x: -1.75, z: 3.2 }, { x: -1.75, z: 0.0 }, { x: -1.9, z: -0.4 }] }, { id: 'booth', w: 1.4, points: [{ x: -1.0, z: 0.2 }, { x: 1.0, z: -0.2 }, { x: 2.4, z: -0.2 }, { x: 2.4, z: -0.9 }, { x: 3.45, z: -1.35 }] }];
  const t = assembleInterior(S, { name: 'lab', bounds: LAB.b, anchors, spotDefs, windows: windowContract(F, wins, LAB.T), paths, cameraPresets, camera: { dist: 9.4, pitch: 50, yaw: 35, fov: 34, minDist: 6.2, maxDist: 13.5, focusY: 0.8 } });
  t.setBeat = (b) => anim.setBeat(b); t.setRec = (r) => { if (S.booth) S.booth.set(r); }; t.isRec = () => !!(S.booth && S.booth.rec); t.vu = S.ui; t.dynQuads = S.dyn.count.n;
  return t;
}
