// VIGNETTE TOWN KIT (owner VIG town crew): the staging helpers the thrift shop, Sound Lab and bar reels share (vig_shop.js, vig_lab.js, vig_bar.js). On top of vignette_kit.js:
//   reel()                  an absolute clock reel builder: R.at(t, cue, cue...), R.end(t), R.list() (sorted, stable), like vig_flat.js
//   S(size, yaw, o, who)    a subject relative shot (fs ms mcu cu, yaw relative to the subject's facing, + = its left), on the hero unless who is given
//   two(a, b, o)            a two shot framed on the middle of two actors (w about 3.4 for side by side)
//   xf(ms)                  a glide from the live camera (a soft cut)      MICRO(form)      micro1(ctx, clip, opts, beats, dur)   a one clip MICRO in the gameplay camera
//   clockAt(ctx, dm)        the clock text dm minutes from the save time    trm(R, ctx, t, dm, mins)   the time ramp chip ('15:20|+120 MIN') that rides the clock on a TRM cut
//   follow(ctx, r, who, part, off, rot)   a prop rides a bone of an actor every frame (an apron at the hips, cans on the head): part = 'hips' | 'head' | 'chest'
//   coins(R, ctx, t, n, at) beat quantised coins: one clink per beat, a semitone up each (VIGNETTES.md 0.7)
//   npcLook(ctx, id)        the world NPC with that id (or a regular slot) or null; regularSlot(ctx, who) -> 'regular0'..2 for a Core.NPCS id
//   lookOf(ctx)             the BBH globals reels read (Core, the catalog); safe when they are missing
import { THREE } from './kit.js';
import { shot, clip, sfx, drum, word, stamp, call, BEAT } from './vignette_kit.js';
import './vig_town_clips.js';

export const H = 'hero';
export function reel() {
  const L = []; let n = 0;
  const R = {
    at(t, ...cs) { for (const c of cs.flat()) if (c) L.push({ t: Math.max(0, t), i: n++, e: Object.assign({}, c, { t: Math.max(0, t) }) }); return R; },
    end(t) { return R.at(t, { do: 'pulse', v: 0 }); },
    list() { return L.sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.e); },
  };
  return R;
}
export const SH = { ws: { w: 4.2, h: 2.1, lookH: 0.9, fov: 46 }, fs: { w: 2.3, h: 1.5, lookH: 0.85, fov: 44 }, ms: { w: 1.5, h: 1.45, lookH: 1.05, fov: 40 }, mcu: { w: 1.1, h: 1.38, lookH: 1.15, fov: 36 }, cu: { w: 0.8, h: 1.32, lookH: 1.2, fov: 30 } };
export const S = (size, yaw, o, who) => shot(Object.assign({ on: who || H, yaw }, SH[size], o));
export const two = (a, b, o) => shot(Object.assign({ on: [a, b], rel: false, yaw: 0, w: 3.0, h: 1.5, lookH: 1.0, fov: 40 }, o));
export const xf = (ms) => ({ cut: 'blend', ms: ms || 380 });
export const MICRO = (form) => form === 'micro';
export const cam = (pos, lk, fov, o) => shot(Object.assign({ pos, look: lk, fov: fov || 34 }, o));
export function micro1(ctx, clipName, opts, beats, dur) {
  const R = reel(); R.at(0, clip(H, clipName, opts || {})); (beats || []).forEach(([t, ...c]) => R.at(t, ...c)); R.at(Math.min((dur || 0.9) - 0.25, 0.6), ctx.PAY).end(dur || 0.9);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}
export function clockAt(ctx, dm) { const m = ((((ctx.ch ? ctx.ch.minutes : 0) + (dm || 0) + 360) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
// a TRM cut: the clock chip flips to dm minutes before now (the action already spent the time), the mechanical flip on the beat
export function trm(R, ctx, t, dm, mins) { R.at(t, stamp(clockAt(ctx, dm) + '|+' + mins + ' MIN', 900), drum('t', { vel: 0.5, pulse: false }), sfx('click', { pitch: 0.55, quiet: true })); }
export function coins(R, ctx, t, n, at) {
  for (let i = 0; i < n; i++) R.at(t + i * BEAT * 0.5, sfx('coin', { pitch: 1 + i * 0.06 }), i === 0 ? null : drum('t', { vel: 0.35, pulse: false }), word('$', at || 'hero:top', { size: 3.4 + (i % 2) * 0.6, color: '#ffd35c', ms: 520 }));
}
const V1 = new THREE.Vector3(), Q1 = new THREE.Quaternion(), E1 = new THREE.Euler();
const BONES = { hips: ['hips', 'pelvis', 'root'], head: ['head'], chest: ['chest', 'spine2', 'spine'] };
function bone(c, part) { const m = c.rig && c.rig.map; if (!m) return null; for (const k of BONES[part] || [part]) if (m[k]) return m[k]; return null; }
// a prop that rides a bone: placed in world space every frame from the bone's world matrix (nothing is parented to the rig, so cleanup is the usual spawn removal)
export function follow(ctx, r, who, part, off, rot) {
  return call((api) => {
    const a = api.actor(who); if (!a || !r.obj) return; const b = bone(a.c, part) || a.c.object; if (r.follow) r.follow.on = false; const f = r.follow = { on: true }, o = off || [0, 0, 0];
    ctx.tick(() => {
      if (!f.on || !r.obj) return; a.c.object.updateMatrixWorld(true); b.getWorldPosition(V1); (part === 'head' ? b : a.c.object).getWorldQuaternion(Q1);
      const p = new THREE.Vector3(o[0], o[1], o[2]).applyQuaternion(Q1); r.obj.position.copy(V1).add(p); r.obj.quaternion.copy(Q1); if (rot) { E1.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); r.obj.quaternion.multiply(Q1.setFromEuler(E1)); }
    });
  });
}
// full frame: a DOM sheet (the shop panel, a menu) re-frames the controls camera into the band above it (a view offset). A staged reel hides the sheet, so it frames the
// whole canvas; the offset comes back at the end (before the land shot glides into the controls camera)
export function fullFrame(ctx) {
  return call((api) => { const c = api.camera; if (!c || !c.view || !c.view.enabled) return; const v = Object.assign({}, c.view); c.clearViewOffset(); c.updateProjectionMatrix(); ctx.own(() => { try { c.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height); c.updateProjectionMatrix(); } catch (e) { /* ignore */ } }); });
}
// a card held up to the camera: the prop rides the actor's hand and turns its face (+z) to the lens every frame (the lanyard, the napkin shown to us)
export function show(ctx, r, who, o) {
  o = o || {};
  return call((api) => {
    const a = api.actor(who); if (!a || !r.obj) return; const hand = o.hand === 'R' ? a.c.anchors.handR : a.c.anchors.handL; if (r.follow) r.follow.on = false; const f = r.follow = { on: true };
    ctx.tick(() => { if (!f.on || !r.obj) return; a.c.object.updateMatrixWorld(true); hand.getWorldPosition(V1); r.obj.position.copy(V1); r.obj.position.y += o.dy || 0; r.obj.lookAt(api.camera.position.x, r.obj.position.y + (o.tilt || 0), api.camera.position.z); });
  });
}
// the mirror's point of view: the frame is what the glass sees, flipped like a mirror, inside a walnut edge (the same trick as the home mirror)
export function mirrorPOV(ctx, on) {
  return call(() => {
    const gl = document.getElementById('gl'); if (!gl) return; gl.style.transform = on ? 'scaleX(-1)' : '';
    let fr = document.getElementById('vig-mirror'); if (on && !fr && gl.parentElement) { fr = document.createElement('div'); fr.id = 'vig-mirror'; fr.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2;box-shadow:inset 0 0 0 12px #6a3f2a,inset 0 0 0 16px #d8b04a,inset 0 0 50px 20px rgba(255,214,150,.25);background:linear-gradient(115deg,rgba(255,255,255,0) 38%,rgba(255,255,255,.08) 47%,rgba(255,255,255,0) 56%)'; gl.parentElement.appendChild(fr); }
    if (!on && fr) fr.remove();
    if (on) ctx.own(() => { const g = document.getElementById('gl'); if (g) g.style.transform = ''; const x = document.getElementById('vig-mirror'); if (x) x.remove(); });
  });
}
export const npc = (ctx, id) => (ctx.world.npcs || []).find((n) => n && n.id === id) || null;
export function regularSlot(ctx, who) {
  const list = ctx.world.npcs || []; const n = list.find((x) => x && x.who === who && /^regular\d$/.test(x.id)); if (n) return n.id;
  const W = ctx.world; for (const s of ['regular0', 'regular1', 'regular2']) { try { if (W.regularOf && W.regularOf(s) === who) return s; } catch (e) { /* ignore */ } }
  return list.find((x) => x && /^regular\d$/.test(x.id)) ? 'regular1' : null;
}
export const bbh = () => (typeof window !== 'undefined' && window.BBH) || {};
// the item a buy / equip action is about: { name, price, group, id } from the catalog (safe)
export function itemOf(action) {
  try { const C = bbh().CATALOG, g = action && action.group, id = action && action.id, it = C && C.GROUPS && C.GROUPS[g] && C.GROUPS[g].find((x) => x.id === id); if (it) return { name: it.name, price: (it.unlock && it.unlock.price) || 0, group: g, id }; } catch (e) { /* ignore */ }
  return { name: 'it', price: 0, group: (action && action.group) || 'top', id: (action && action.id) || '' };
}
// the colour of a look slot (a folded shirt on the counter in the colour the hero picked)
export function slotColor(look, g) { try { const s = g === 'acc' ? null : look && look[g]; return (s && s.color) || '#ff6ec7'; } catch (e) { return '#ff6ec7'; } }
export { BEAT };
