// VIGNETTE KIT (shared, owner VIG): what a world's vignette module (vig_<world>.js) builds its reels with. See VIGNETTES.md section 0 "How to add a world".
// A vignette is a cine.js reel (the same cue language as the films, park3d/CINE.md) plus a few runtime extras the game glue (r3/vig.js) hands over in ctx:
//   ctx = { id, form ('first'|'full'|'short'|'micro'), n (times this id played before on this save), pick(k) (seeded variant 0..k-1), ch (the save after the action), pre (before),
//           action, fx, world, A (terrain anchors), reduce, low, hour, night (0 day .. 1 night), foxy (Foxy is home and visible), look, name, morning (the morning effect), ev (morning event index),
//           place, spot, PAY (a cue: the reward lands here: toasts, HUD, sfx), own(obj|fn) (cleaned at the end), now() (real seconds into the reel), tick(fn(T, dt)) (per frame until the end) }
// Helpers below return cues (plain objects), so a reel reads like a shooting script:  [ shot({...}), clip('hero', 'v_eat', {...}), sfx('eat'), at(1.2, ctx.PAY), ... ]
// Props: const banana = ref();  spawn(ctx, banana, () => food('banana'), [x, y, z])  hold(ctx, banana, 'hero', { aim: 'mouth' })  put(ctx, banana, [x, y, z])  gone(ctx, banana)
// A reel returns { events, cast?, end?, letterbox?, hide?, holdSync?, max? }. The runtime adds the letterbox (FIRST / FULL), hides the HUD and menus (not MICRO), the tap to skip,
// the 300 ms land shot back to the controls camera, and fires PAY at the end when the reel never reached it.
import { THREE } from './kit.js';
import './vignette_clips.js';
export * as props from './vignette_props.js';

// ------------------------------------------------------------------ cues
export const cue = (k, o) => Object.assign({ do: k }, o);
export const shot = (o) => Object.assign({ do: 'shot' }, o);
export const wait = (s, o) => Object.assign({ do: 'wait', s }, o);
export const call = (fn, o) => Object.assign({ do: 'call', fn }, o);
export const clip = (who, name, opts, o) => Object.assign({ do: 'clip', who, clip: name, opts: opts || {} }, o);
export const place = (who, at, face, o) => Object.assign({ do: 'place', who, at, face }, o);
export const face = (who, to, ms, o) => Object.assign({ do: 'face', who, to, ms }, o);
export const look = (who, at, o) => Object.assign({ do: 'look', who, at }, o);
export const mood = (who, m, o) => Object.assign({ do: 'mood', who, mood: m }, o);
export const sfx = (name, opts, o) => Object.assign({ do: 'sfx', name, o: opts || {} }, o);
export const drum = (id, o) => Object.assign({ do: 'drum', id }, o);
export const word = (text, at, o) => Object.assign({ do: 'word', text, at }, o);
export const say = (who, text, o) => Object.assign({ do: 'say', who, text, wait: false }, o);
export const stamp = (text, ms, o) => Object.assign({ do: 'stamp', text, ms }, o);
// at(t, cue): the same cue at an absolute reel time (seconds)
export const at = (t, e) => Object.assign({}, e, { t });

// ------------------------------------------------------------------ props in the world
export const ref = () => ({ obj: null, follow: null });
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion();
const vec = (p, out) => (Array.isArray(p) ? out.set(p[0], p[1], p[2]) : out.copy(p));
// spawn(ctx, r, make, at, rotY): build the prop when the cue fires and add it to the world (removed at the end)
export function spawn(ctx, r, make, at, rotY, o) {
  return call(() => { const obj = make(); if (!obj) return; r.obj = obj; if (at) vec(typeof at === 'function' ? at() : at, obj.position); if (rotY !== undefined) obj.rotation.y = rotY; ctx.world.scene.add(obj); ctx.own(obj); }, o);
}
// hold(ctx, r, who, o): the prop rides an actor's hand every frame. o.hand 'L' (default: the mic stays in the right hand) | 'R', o.aim: 'mouth' (the bite end points at the mouth),
// 'up' (stays upright, turns its top to the mouth as the hand comes close: a banana, a glass, a mug; o.tilt 0..1 scales the turn), 'face' (a screen turned to the eyes: the phone), [x,y,z] (a world point), o.back (m, slides the
// prop along the aim: negative = the fist holds it further up), o.side (m, along the hand's left), o.tip (radians, extra tilt for the upright aim)
export function hold(ctx, r, who, o) {
  o = o || {};
  return call((api) => {
    const a = api.actor(who); if (!a || !r.obj) return; const c = a.c, hand = (o.hand === 'R' ? c.anchors.handR : c.anchors.handL), head = c.anchors.mouth || c.anchors.head;
    if (r.follow) r.follow.on = false; const f = r.follow = { on: true };
    ctx.tick(() => {
      if (!f.on || !r.obj) return; c.object.updateMatrixWorld(true); hand.getWorldPosition(V1); head.getWorldPosition(V2); const obj = r.obj;
      if (o.aim === 'face') { V3.copy(V2); V3.y += 0.12; obj.position.copy(V1); obj.position.y += 0.02; obj.lookAt(V3); obj.rotateX(-0.15); }
      else {
        let d; if (o.aim === 'mouth') d = V3.subVectors(V2, V1).normalize();
        else if (Array.isArray(o.aim)) d = V3.set(o.aim[0], o.aim[1], o.aim[2]).sub(V1).normalize();
        else { const near = Math.max(0, Math.min(1, (0.5 - V1.distanceTo(V2)) / 0.25)), k = near * near * (3 - 2 * near) * (o.tilt === undefined ? 1 : o.tilt); d = V3.subVectors(V2, V1).normalize().lerp(UP, 1 - k).normalize(); }
        Q.setFromUnitVectors(UP, d); obj.quaternion.copy(Q); obj.position.copy(V1).addScaledVector(d, o.back || 0);
        if (o.side) obj.position.addScaledVector(V2.set(1, 0, 0).applyQuaternion(c.object.quaternion), o.side);
      }
    });
  });
}
// put(ctx, r, at, rotY): let go of the prop and leave it at a world point (it stays until the end of the reel)
export function put(ctx, r, at, rotY, o) { return call(() => { if (r.follow) r.follow.on = false; if (!r.obj) return; vec(at, r.obj.position); r.obj.quaternion.identity(); if (rotY !== undefined) r.obj.rotation.y = rotY; }, o); }
export function gone(ctx, r, o) { return call(() => { if (r.follow) r.follow.on = false; if (r.obj) r.obj.visible = false; }, o); }
// with(r, fn): a cue that calls fn(obj) on the prop (bite, peel, fill, draw a screen)
export const withProp = (r, fn, o) => call(() => { if (r.obj) fn(r.obj); }, o);
// anim(ctx, fn, o): fn(T) every frame from this cue on, T = real seconds since the cue (a pure function of T keeps seek and the shot tool right)
export function anim(ctx, fn, o) { return call(() => { const t0 = ctx.now(); fn(0); ctx.tick(() => fn(ctx.now() - t0)); }, o); }

// ------------------------------------------------------------------ framing helpers
// a world camera: from [x,y,z] to [x,y,z] (or an actor point 'hero:head'), lens fov, optional move to another pose over dur
export const cam = (pos, lookAt, fov, o) => shot(Object.assign({ pos, look: lookAt, fov: fov || 34 }, o));
export const camTo = (pos, lookAt, fov, to, dur, o) => shot(Object.assign({ pos, look: lookAt, fov: fov || 34, to, dur }, o));
// timing helper: a beat at the place's tempo (100 bpm default = 0.6 s)
export const BEAT = 0.6;
// pick the form's value: F({ first: 5, full: 3, short: 1.6, micro: 0.8 }, ctx.form)
export const F = (o, form) => (o[form] !== undefined ? o[form] : o.full);
