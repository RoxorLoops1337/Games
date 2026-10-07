// CHARACTERS module (Character Artist + Animator). Low-poly chibi characters built from code, driven by the game's look object
// (see ../catalog.js DEFAULT_LOOK): skin, hair {style,color}, top {id,color,color2}, bottom, shoes, hat, glasses, acc. Support at least 8 hair styles, 6 hats,
// 4 tops, 3 bottoms, 3 shoes, 3 glasses. CONTRACT:
//   createCharacter(ctx, look) -> { object: THREE.Group (feet at y=0, +z forward), setLook(look), play(clip, opts), update(dt, t), height, anchors:{head,mouth,handR,handL,feet} }
//   CLIPS: idle, walk, run, beatbox, dance, sit, wave, cheer, talk. Walk/run speed is driven by opts.speed. Procedural animation (rig of THREE.Group joints, IK-free poses are fine).
//   createNPC(ctx, id) -> same shape for 'beeamgee' (old grey-bearded man with a boombox, seated), 'foxy', 'rohzel'.
import { THREE, solidMat } from './kit.js';
export const CLIPS = ['idle', 'walk', 'run', 'beatbox', 'dance', 'sit', 'wave', 'cheer', 'talk'];
export function createCharacter(ctx, look) { const object = new THREE.Group(); const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 8), solidMat('#d9a46e')); b.position.y = 0.8; object.add(b); return { object, setLook() {}, play() {}, update() {}, height: 1.6, anchors: {} }; }
export function createNPC(ctx, id) { return createCharacter(ctx, {}); }
