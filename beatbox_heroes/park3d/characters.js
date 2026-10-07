// CHARACTERS module (Character Artist + Animator). Low-poly chibi characters built from code, driven by the game's look object
// (see ../catalog.js DEFAULT_LOOK): skin, hair {style,color,tip}, top {id,color,color2}, bottom, shoes, hat, glasses, acc. CONTRACT:
//   createCharacter(ctx, look) -> { object: THREE.Group (feet at y=0, +z forward), setLook(look), play(clip, opts), update(dt, t), height, anchors:{head,mouth,handR,handL,feet} }
//   CLIPS: idle, walk, run, beatbox, dance, sit, wave, cheer, talk. Walk/run speed is driven by opts.speed. Procedural animation (rig of THREE.Group joints, IK-free poses are fine).
//   createNPC(ctx, id) -> same shape for 'beeamgee' (old grey-bearded man with a boombox, seated), 'foxy', 'rohzel'.
//
// IMPLEMENTATION: one SkinnedMesh per layer (lit, glow, outline hull) sharing a 37-bone skeleton. All geometry is built from code (char_*.js):
//   char_geo.js (primitives, skeleton, hull), char_body.js (head, face, limbs), char_hair.js (hair, hats), char_wear.js (tops, bottoms, shoes),
//   char_gear.js (glasses, accessories), char_anim.js (poses, IK, springs, clips). setLook rebuilds only the CPU geometry (about 2 ms).
import { THREE } from './kit.js';
import { C, MB, K, BONE_NAMES, BI, boneSpec, restWorld, dims, loft, finalize, makeHull, shade } from './char_geo.js';
import { buildHead, buildFace, buildFacial, buildArms, buildLegs } from './char_body.js';
import { buildHair, buildHat, HAT_COVER } from './char_hair.js';
import { buildTop, buildBottom, buildShoes, wearMeta, bodyR } from './char_wear.js';
import { buildGlasses, buildAccessories } from './char_gear.js';
import { Animator } from './char_anim.js';

export const CLIPS = ['idle', 'walk', 'run', 'beatbox', 'dance', 'sit', 'wave', 'cheer', 'talk'];
const DEF = { name: 'Hero', body: 'neutral', skin: '#c68b5e', hair: { style: 'crop', color: '#2a2024' }, eyes: { style: 'round', color: '#4a2c1a' }, brows: 'soft', facial: 'none', marks: [], top: { id: 'tee', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'jeans', color: '#3a5fcd' }, shoes: { id: 'sneakers', color: '#f7f2e8' }, hat: { id: 'none', color: '#17141f' }, glasses: { id: 'none', color: '#17141f' }, acc: {} };
export function normLook(l) {
  l = l || {}; const o = {}; for (const k in DEF) { const dv = DEF[k], v = l[k]; o[k] = v === undefined || v === null ? (typeof dv === 'object' && !Array.isArray(dv) ? Object.assign({}, dv) : dv) : (typeof dv === 'object' && !Array.isArray(dv) && typeof v === 'object' ? Object.assign({}, dv, v) : v); }
  if (typeof o.hair === 'string') o.hair = { style: o.hair, color: DEF.hair.color }; if (typeof o.hat === 'string') o.hat = { id: o.hat, color: DEF.hat.color }; if (typeof o.glasses === 'string') o.glasses = { id: o.glasses, color: DEF.glasses.color };
  if (typeof o.top === 'string') o.top = { id: o.top, color: DEF.top.color }; if (typeof o.bottom === 'string') o.bottom = { id: o.bottom, color: DEF.bottom.color }; if (typeof o.shoes === 'string') o.shoes = { id: o.shoes, color: DEF.shoes.color };
  if (typeof o.eyes === 'string') o.eyes = { style: o.eyes, color: DEF.eyes.color }; if (!o.hair.style) o.hair.style = 'crop'; if (!o.acc) o.acc = {};
  return o;
}

// ------------------------------------------------------------------ shared materials (one set for every character: recolouring is vertex colours, not materials)
let MATS = null;
export function sharedMats() { return mats(); }
function mats() {
  if (MATS) return MATS;
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // albedo-modulated cool violet fill light so shadows stay hue-shifted and readable (no black skin, no grey shadows)
  lit.onBeforeCompile = (sh) => { sh.uniforms.uFill = { value: new THREE.Color(0.2, 0.15, 0.27) }; sh.fragmentShader = 'uniform vec3 uFill;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse += diffuseColor.rgb * uFill;'); };
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const hull = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, color: new THREE.Color(0.24, 0.2, 0.32) });
  hull.onBeforeCompile = (sh) => { sh.uniforms.uHull = { value: 0.013 }; sh.vertexShader = 'attribute vec3 hullN;\nuniform float uHull;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + hullN * uHull;'); };
  MATS = { lit, glow, hull }; return MATS;
}

// ------------------------------------------------------------------ rig
function makeRig(object) {
  const d0 = dims('neutral'), spec = boneSpec(d0), bones = [], map = {};
  spec.forEach(([n, p, x, y, z]) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); (p ? map[p] : object).add(b); map[n] = b; bones.push(b); });
  const inv = bones.map(() => new THREE.Matrix4()), skeleton = new THREE.Skeleton(bones, inv);
  return { bones, map, skeleton };
}
function fitRig(rig, d) {
  const spec = boneSpec(d), W = restWorld(d);
  spec.forEach(([n, p, x, y, z], i) => { rig.map[n].position.set(x, y, z); rig.map[n].userData.rest = [x, y, z]; rig.skeleton.boneInverses[i].makeTranslation(-W[n][0], -W[n][1], -W[n][2]); });
}

function makeSkinned(geo, material, castShadow) {
  const m = new THREE.SkinnedMesh(geo, material); m.frustumCulled = false; m.castShadow = !!castShadow; m.receiveShadow = !!castShadow; return m;
}

// lighting adaptation: very dark skin tones are lifted toward a readable floor so faces keep their form in golden-hour light
function liftSkin(c) { const hsl = {}; c.getHSL(hsl); const floor = 0.3; if (hsl.l < floor) hsl.l += (floor - hsl.l) * 0.55; hsl.s = Math.min(1, hsl.s * 1.06); return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l); }
export function createCharacter(ctx, look, extra) {
  const object = new THREE.Group(); object.name = 'character';
  const rig = makeRig(object), M = mats(), meshes = {};
  const state = { look: null, geoKey: '' };
  const api = { object, height: 1.6, anchors: {}, rig, tris: 0, draws: 3, cast: extra && extra.cast };

  ['lit', 'glow', 'hull'].forEach((k) => { const m = makeSkinned(new THREE.BufferGeometry(), M[k], k === 'lit'); m.name = 'char_' + k; object.add(m); m.bind(rig.skeleton, new THREE.Matrix4()); meshes[k] = m; });
  meshes.glow.castShadow = false; meshes.hull.castShadow = false;

  function build(look) {
    const d = dims(look.body); fitRig(rig, d);
    const cx = { look, d, rest: restWorld(d), skin: liftSkin(C(look.skin)), shoeAccent: null };
    const meta = wearMeta(look), lit = new MB(11), glow = new MB(12);
    const hatId = look.hat && look.hat.id, hatCover = HAT_COVER[hatId || 'none'] || 0;
    cx.hairVol = 0;
    const slot = {}; let mark = 0; const tk = (n) => { slot[n] = lit.tris - mark; mark = lit.tris; };
    const sf = (n, fn) => { try { fn(); } catch (e) { if (!build.warned) build.warned = {}; if (!build.warned[n]) { build.warned[n] = 1; console.error('[characters] ' + n + ' failed: ' + (e && e.stack || e)); } } tk(n); };
    sf('head', () => buildHead(lit, cx)); sf('face', () => buildFace(lit, glow, cx)); sf('facial', () => buildFacial(lit, cx));
    sf('arms', () => buildArms(lit, cx, d, meta.sleeveEnd)); sf('legs', () => buildLegs(lit, cx, d, meta.legEnd));
    if (meta.top.f === 'tank' && meta.top.crop) { sf('midriff', () => { const sk = cx.skin; loft(lit, [0.46, 0.52, 0.58, 0.64].map((y, i) => { const b = bodyR(y, d); return { y, rx: b.rx + 0.006, rz: b.rz + 0.006, cz: 0.004, sk: K('hips'), c: shade(sk, 0.9 + i * 0.03) }; }), { n: 10, sq: 0.8 }); }); }
    sf('top', () => buildTop(lit, cx, d)); sf('bottom', () => buildBottom(lit, cx, d)); sf('shoes', () => buildShoes(lit, cx, d));
    sf('hair', () => buildHair(lit, cx, hatCover)); sf('hat', () => buildHat(lit, glow, cx));
    sf('glasses', () => buildGlasses(lit, glow, cx)); sf('acc', () => buildAccessories(lit, glow, cx, api)); api.slotTris = slot;
    const g = finalize([lit]), gg = finalize([glow]), hg = makeHull(g, [lit]);
    [['lit', g], ['glow', gg], ['hull', hg]].forEach(([k, geo]) => { const m = meshes[k]; if (m.geometry) m.geometry.dispose(); m.geometry = geo; m.visible = geo.attributes.position.count > 0; });
    api.tris = (g.attributes.position.count + gg.attributes.position.count + hg.attributes.position.count) / 3; api.triParts = { lit: g.attributes.position.count / 3, glow: gg.attributes.position.count / 3, hull: hg.attributes.position.count / 3 };
    api.draws = 3 - (gg.attributes.position.count ? 0 : 1);
    const W = cx.rest, hh = 1.5 + (hatId && hatId !== 'none' ? 0.1 : 0); api.height = hh;
    api.d = d; api.rest = W; api.look = look; state.look = look;
    if (api.anim) api.anim.refit(d, W);
  }

  api.setLook = (l) => { build(normLook(l)); };
  api.getLook = () => state.look;
  api.anim = new Animator(api, rig, THREE);
  api.play = (clip, opts) => api.anim.play(clip, opts);
  api.update = (dt, t) => api.anim.update(dt, t);
  api.lookAt = (p) => api.anim.setLookAt(p);
  api.setLook(look);
  // anchors: Object3Ds that follow the bones (world getters via object.getWorldPosition)
  const anchor = (bone, off) => { const o = new THREE.Object3D(); o.position.set(off[0], off[1], off[2]); rig.map[bone].add(o); return o; };
  api.anchors = { head: anchor('head', [0, 0.3, 0]), mouth: anchor('mouth', [0, 0, 0.06]), handR: anchor('wrR', [0, -0.07, 0]), handL: anchor('wrL', [0, -0.07, 0]), feet: object, top: anchor('head', [0, 0.75, 0]) };
  api.anim.finishInit();
  return api;
}

export { createNPC } from './char_npc.js';
if (typeof window !== 'undefined') window.__chars = { createCharacter, normLook };
