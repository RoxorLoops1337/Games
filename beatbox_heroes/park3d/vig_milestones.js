// VIGNETTES: MILESTONES (owner VIG milestone crew). The P2 moments of VIGNETTES.md section 3 that no story film and no P1 scene covers: the progress beats (a level up,
// a new sound, an achievement, a cosmetic unlock, and the burst of several at once), the fan and money milestones, running out of money, rent day (paid or covered by Foxy),
// a new crew member, the first song release, the first stream and a new rung on the battle ladder.
// This module is not a world: r3/vig.js (the MILESTONES section at its end) makes its table the shared base of every world's table (a world's own entry always wins), and its
// queue plays the fx driven moments once the place is quiet: after the action's own vignette, never on top of a story film, a dialog or the morning, a burst collapsed into one scene.
// Every id has four forms like the P1 scenes (FIRST, FULL, SHORT, MICRO: one clip in the gameplay camera, under 1.5 s). ctx.extra carries what the queue knows:
//   { items: [{ k: 'levelup', level } | { k: 'ach', id, name, desc } | { k: 'unlock', name, group, id } | { k: 'sound', id, name }], level, name, desc, ... } (all optional: a reel without
//   them reads the save).
// STAGING ANYWHERE. Progress beats play wherever the hero stands. The lens lives on the line from the hero to the gameplay camera (the player sees the hero along it, so it is clear
// of walls), pulled in to a full figure or a medium; a raycast against the set pushes it back toward the gameplay camera when a shelf or a counter is in the way. The hero turns to
// that lens. Extras (a passer-by, a fan, a kid) stand beside the hero across the lens axis, on the side that is free. World scenes (rent at the fridge, the release at the desk,
// the crew and the ladder in the bar) have fixed, hand placed wide cameras and play only in their world (anywhere else the reel is empty and the reward simply lands).
import { THREE } from './kit.js';
import { cue, clip, place, face, look, mood, sfx, drum, word, say, stamp, call, ref, spawn, hold, put, gone, withProp, anim, BEAT } from './vignette_kit.js';
import { phone, glowBall, screen, mat, HAND } from './vignette_props.js';
import { cash, moth, notebook } from './vig_town_props.js';
import { H, reel, S, xf, cam, MICRO, coins, show } from './vig_town_kit.js';

const D2R = Math.PI / 180;
// the four stat colours (scenes_train.js COL): musicality, technicality, originality, showmanship
const COL = ['#2ee6ff', '#ff3ea5', '#ffd35c', '#9dff4a'];
const LOOK = {
  stranger: { name: 'Stranger', body: 'neutral', skin: '#c99a6e', hair: { style: 'bob', color: '#2b1d14' }, top: { id: 'windbreaker', color: '#5a6fd6', color2: '#f7f2e8' }, bottom: { id: 'jeans', color: '#34303f' }, shoes: { id: 'sneakers', color: '#f7f2e8' }, hat: { id: 'none' } },
  teen: { name: 'Teen', body: 'girl', skin: '#f2c4ae', hair: { style: 'bun', color: '#ff6ec7' }, top: { id: 'tracktop', color: '#ffd23f', color2: '#17141f' }, bottom: { id: 'joggers', color: '#17141f' }, shoes: { id: 'hightops', color: '#ff6ec7' }, hat: { id: 'none' } },
  kid: { name: 'Kid', body: 'boy', skin: '#a87844', hair: { style: 'crop', color: '#1a1420' }, top: { id: 'jersey', color: '#2a9d8f', color2: '#f7f2e8' }, bottom: { id: 'sweatpants', color: '#34303f' }, shoes: { id: 'retro', color: '#ff3ea5' }, hat: { id: 'fitted', color: '#ff3ea5' } },
  fanA: { name: 'Fan', body: 'boy', skin: '#d9a46e', hair: { style: 'fadewave', color: '#1a1420' }, top: { id: 'bomber', color: '#ff3ea5', color2: '#17141f' }, bottom: { id: 'cargo', color: '#34303f' }, shoes: { id: 'retro', color: '#f7f2e8' }, hat: { id: 'none' } },
  fanB: { name: 'Fan', body: 'girl', skin: '#8f5632', hair: { style: 'long', color: '#2b1d14' }, top: { id: 'hoodiebig', color: '#2ee6ff', color2: '#17141f' }, bottom: { id: 'leggings', color: '#17141f' }, shoes: { id: 'platform', color: '#2ee6ff' }, hat: { id: 'none' } },
};
const bbh = () => (typeof window !== 'undefined' && window.BBH) || {};
const core = () => bbh().Core || {};
const up = (s) => String(s || '').toUpperCase();

// ======================================================================= staging anywhere: the lens on the gameplay camera's line, the free side for an extra
const RC = new THREE.Raycaster(), VA = new THREE.Vector3(), VD = new THREE.Vector3();
function ownedBy(o, root) { for (let x = o; x; x = x.parent) if (x === root) return true; return false; }
// the solid set, collected once per reel: visible meshes that block a lens (no characters, no glows, no see-through, no big instanced grass)
function solids(ctx) {
  if (ctx.__solids) return ctx.__solids; const out = [], pl = ctx.world.player && ctx.world.player.object;
  const walk = (o) => {
    if (!o.visible || (o.name && /^(vig_|passerby)/.test(o.name)) || (o.userData && o.userData.cineSpawn) || o === pl || o.isSkinnedMesh) return;
    if (o.isMesh && !(o.isInstancedMesh && o.count > 160)) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!(m && ((m.transparent && m.opacity < 0.6) || m.blending === THREE.AdditiveBlending))) out.push(o); }
    for (const c of o.children) walk(c);
  };
  try { ctx.world.scene.children.forEach(walk); } catch (e) { /* ignore */ }
  return (ctx.__solids = out);
}
// true when the set (walls, furniture) is between two world points
function blocked(ctx, a, b) {
  try {
    VD.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = VD.length(); if (len < 0.1) return false; VD.divideScalar(len);
    RC.set(VA.set(a[0], a[1], a[2]), VD); RC.near = 0.05; RC.far = len - 0.25;
    return RC.intersectObjects(solids(ctx), false).length > 0;
  } catch (e) { return false; }
}
// the frame of the moment: where the hero stands and where the gameplay camera looks from
function frameOf(ctx) {
  const w = ctx.world, pl = w.player && w.player.object, c = (w.ctx && w.ctx.camera) || w.camera;
  const x = pl ? pl.position.x : 0, z = pl ? pl.position.z : 0, y = pl ? pl.position.y : 0;
  let dx = c ? c.position.x - x : 0, dz = c ? c.position.z - z : 5; const D = Math.max(0.5, Math.hypot(dx, dz)); dx /= D; dz /= D;
  return { x, y, z, dx, dz, D, cy: c ? c.position.y - y : 3, face: Math.atan2(dx, dz) / D2R };
}
// a point fwd metres toward the gameplay camera and side metres to the screen right of the hero
const ptAt = (F, fwd, side) => [F.x + F.dx * fwd + F.dz * side, F.z + F.dz * fwd - F.dx * side];
// the lens: d metres out on the camera line turned by a degrees around the subject (side to the right, h high), looking at lookH. The whole frame must be clear: the centre and
// both edges at the subject. Tried in order: the gameplay line, then turned 18 and 36 degrees either way, then pulled back toward the gameplay camera (which sees the hero).
function lensTry(ctx, F, d, side, h, lookH, a, k) {
  const r = a * D2R, ca = Math.cos(r), sa = Math.sin(r), ux = F.dx * ca + F.dz * sa, uz = F.dz * ca - F.dx * sa;
  const dd = Math.max(0.8, Math.min(d + (F.D - d) * k, F.D * 0.95)), hh = h + (F.cy - h) * k * 0.8, s = (side || 0) * (1 - k);
  return [F.x + ux * dd + uz * s, F.y + hh, F.z + uz * dd - ux * s, ux, uz];
}
function lensPos(ctx, F, d, side, h, lookH, fixA) {
  const tgt = [F.x, F.y + lookH, F.z], clear = (p) => {
    if (blocked(ctx, p, tgt)) return false; const ex = p[4] * 0.6, ez = -p[3] * 0.6;   // the frame edges, about a metre apart at the subject
    return !blocked(ctx, p, [F.x + ex, F.y + lookH, F.z + ez]) && !blocked(ctx, p, [F.x - ex, F.y + lookH, F.z - ez]);
  };
  const angs = fixA !== undefined ? [fixA] : [0, 18, -18, 36, -36];
  for (const k of [0, 0.35, 0.7]) for (const a of angs) { const p = lensTry(ctx, F, d, side, h, lookH, a, k); if (clear(p)) return { pos: p.slice(0, 3), a }; }
  for (const k of [0, 0.35, 0.7, 1]) { const p = lensTry(ctx, F, d, side, h, lookH, fixA || 0, k); if (k === 1 || !blocked(ctx, p, tgt)) return { pos: p.slice(0, 3), a: fixA || 0 }; }
  return { pos: lensTry(ctx, F, d, 0, h, lookH, 0, 1).slice(0, 3), a: 0 };
}
// a shot on the camera line: size 'fs' (full figure) | 'ms' (waist up) | 'wide'; o: { side, h, lookH, fov, mid: [x, z] (frame two people: the centre between them), to: { d, side, h }, dur, cut }
// (the cast is chibi and wide: on a 9:16 phone the frame WIDTH is what limits, so a full figure wants about 1.9 m of width: 5.6 m out at 40 degrees)
const SIZE = { wide: { d: 7.2, h: 2.0, lookH: 0.85, fov: 44 }, fs: { d: 5.6, h: 1.55, lookH: 0.85, fov: 40 }, ms: { d: 4.2, h: 1.45, lookH: 1.0, fov: 38 } };
function L(ctx, F, size, o) {
  o = o || {}; const sz = Object.assign({}, SIZE[size] || SIZE.fs, o), Fc = o.mid ? Object.assign({}, F, { x: (F.x + o.mid[0]) / 2, z: (F.z + o.mid[1]) / 2 }) : F, lk = [Fc.x, Fc.y + sz.lookH, Fc.z];
  const P = lensPos(ctx, Fc, sz.d, sz.side || 0, sz.h, sz.lookH), ex = {};
  if (o.to) { const t = Object.assign({}, sz, o.to); ex.to = { pos: lensPos(ctx, Fc, t.d, t.side || 0, t.h, t.lookH, P.a).pos }; ex.dur = o.dur || 2; }
  if (o.cut) { ex.cut = o.cut; ex.ms = o.ms; }
  return cam(P.pos, lk, sz.fov, ex);
}
// people in the way: the park's walkers (and the like) that stand between the lens and the hero, or right beside the hero, step out of the picture while the scene plays
// (raycasts skip characters, so a stranger on the line would fill the frame); they are back the moment the scene ends
function clearLine(ctx) {
  return call(() => {
    const w = ctx.world, pb = w.ctx && w.ctx.passersby, list = pb && pb.walkers; if (!list || !list.length) return;
    const F = frameOf(ctx), hid = new Set();
    const near = (x, z) => { const px = x - F.x, pz = z - F.z, u = px * F.dx + pz * F.dz, lat = Math.abs(px * F.dz - pz * F.dx); return (u > -1.2 && u < 9 && lat < 1.6) || Math.hypot(px, pz) < 1.6; };
    const step = () => { for (const k of list) { const o = k.c && k.c.object; if (!o) continue; const n = near(o.position.x, o.position.z); if (n && o.visible && !hid.has(o)) { o.visible = false; hid.add(o); } else if (!n && hid.has(o)) { o.visible = true; hid.delete(o); } } };
    step(); ctx.tick(step); ctx.own(() => { hid.forEach((o) => { o.visible = true; }); hid.clear(); });
  });
}
const anywhere = (fn) => (ctx) => { const r = fn(ctx); if (r && Array.isArray(r.events) && ctx.form !== 'micro') r.events.unshift(Object.assign(clearLine(ctx), { t: 0 })); return r; };
// where an extra can stand beside the hero: the side of the lens axis with nothing in between (fwd metres toward the lens, dist across)
function freeSide(ctx, F, fwd, dist) {
  const hy = F.y + 1.0, c = [F.x, hy, F.z];
  for (const s of [1, -1]) { for (const k of [1, 0.75]) { const p = ptAt(F, fwd, s * dist * k); if (!blocked(ctx, c, [p[0], hy, p[1]])) return { at: p, s, k }; } }
  return { at: ptAt(F, fwd + 0.6, dist * 0.6), s: 1, k: 0.6 };
}
// the hero turns to the lens (the engine puts the facing back at the end)
const lensPt = (F) => [F.x + F.dx * 3, F.y + 1.35, F.z + F.dz * 3];
const turn = (F, ms, dDeg) => face(H, F.face + (dDeg || 0), ms === undefined ? 320 : ms);
// a ring of the four stat colours drawn around the feet on four beats (kick, hat, snare, hat)
function statRing(R, t, step) { ['B', 't', 'K', 't'].forEach((k, i) => R.at(t + i * (step || BEAT * 0.5), cue('fx', { kind: 'ripple', at: 'hero', color: COL[i], n: 1 }), drum(k, { vel: 0.7 }))); }
// MICRO: one clip in the gameplay camera, a word over the head, PAY, out (under 1.5 s)
function micro(ctx, clipName, text, color, o) {
  const R = reel(); o = o || {};
  R.at(0, clip(H, clipName, o.opts || {}), o.sfx ? sfx(o.sfx) : drum('K', { vel: 0.7 }), text ? word(text, 'hero:top', { size: o.size || 3.4, color: color || '#ffd35c', ms: 800 }) : null);
  R.at(0.5, ctx.PAY).end(o.dur || 1.0);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}
const itemsOf = (ctx) => (ctx.extra && Array.isArray(ctx.extra.items) ? ctx.extra.items : []);
const firstItem = (ctx, k) => itemsOf(ctx).find((x) => x && x.k === k) || null;

// ======================================================================= PROGRESS BEATS (VIGNETTES.md 3.4)
// LEVEL UP: the moment nearly freezes, the four colours ring the feet on four beats, the card, the cheer. Milestone levels hold a beat longer with their own line.
const LEVEL_LINE = { 5: 'Getting warm.', 10: 'Double digits. The cape fits now.', 15: 'The World Cup board has your name on the list.', 20: 'Veteran. There is grey in the reflection.', 30: 'Max level. Somewhere a bench creaks.' };
function levelUp(ctx) {
  const f = ctx.form, F = frameOf(ctx), it = firstItem(ctx, 'levelup'), lv = (ctx.extra && ctx.extra.level) || (it && it.level) || (ctx.ch && ctx.ch.level) || 2;
  if (MICRO(f)) return micro(ctx, 'cheer', 'LV ' + lv, '#9dff4a', { sfx: 'levelup' });
  const R = reel(), big = !!LEVEL_LINE[lv] && f !== 'short';
  R.at(0, turn(F, 0), clip(H, 'idle'), L(ctx, F, 'fs', { to: { d: 4.9 }, dur: 2.4 }), sfx('levelup'));
  let t = 0;
  if (f !== 'short') { R.at(0.05, cue('speed', { v: 0.2, ms: 160 }), cue('vignette', { v: 0.75, ms: 300 })); t = 0.2; }
  statRing(R, t + 0.1);
  t += 0.1 + BEAT * 2;
  R.at(t, cue('speed', { v: 1, ms: 200 }), cue('vignette', { v: 0, ms: 400 }), clip(H, 'cheer'), mood(H, 'happy'), cue('fx', { kind: 'sparks', at: 'hero:top', color: '#9dff4a', n: 50 }), drum('B'),
    cue('title', { style: 'card', text: 'LEVEL ' + lv, sub: 'Max energy up', at: 'top' }), ctx.PAY);
  if (big) {
    // the punchline: a short push to a medium on the face, the milestone line as a sub; level 10 lifts a gust (the cape), level 20 a grey shimmer
    R.at(t + 1.1, L(ctx, F, 'ms', { cut: 'blend', ms: 420, to: { d: 3.2 }, dur: 1.6 }), say(null, LEVEL_LINE[lv], { dur: 1.9 }));
    if (lv === 10) R.at(t + 1.2, sfx('whoosh', { pitch: 0.7 }), cue('fx', { kind: 'sparks', at: 'hero:head', color: '#fff6e8', n: 30 }));
    if (lv === 20) R.at(t + 1.3, cue('fx', { kind: 'sparks', at: 'hero:top', color: '#c9c3dd', n: 24 }), drum('t', { vel: 0.4 }));
    R.at(t + 3.1, cue('untitle', { ms: 300 })).end(t + 3.4);
  } else R.at(t + (f === 'short' ? 0.8 : 1.3), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 1.0 : 1.6));
  return { events: R.list() };
}

// A NEW SOUND (VIGNETTES.md 3.4, p2.sound.<id>): the body discovers it by accident, the hero stops, tries it on purpose, and it is a drum. The card: NEW SOUND.
const SOUND = {
  RIM: { name: 'Rimshot', oops: 'tk!', clip: 'v_nod', try: 'B . RIM . B B RIM .', line: 'The tongue clicked on a tooth. It sounded like a stick on a rim.' },
  LR: { name: 'Lip roll', oops: 'pffbt', clip: 'v_liproll', opts: { spit: true }, try: 'LR . . . B . LR .', line: 'First try: spit. Second try: a motorboat.' },
  TB: { name: 'Throat bass', oops: 'grrr', clip: 'v_micup', try: 'TB . . TB B . TB .', line: 'A growl from somewhere below the chest.' },
  CR: { name: 'Click roll', oops: 'trrrk', clip: 'v_nod', opts: { n: 3 }, try: 'CR . t . CR . K .', line: 'The tongue rattled while waiting. The needles jumped.' },
  IK: { name: 'Inward K', oops: 'hk!', clip: 'v_micup', try: 'B IK B IK B IK B IK', line: 'Out of air, a gasp in. The gasp was a snare.' },
  WB: { name: 'Water drop', oops: 'bloop', clip: 'v_nod', try: 'B . WB . B WB . .', line: 'A cheek pop. A round little bloop.' },
  ZP: { name: 'Zipper', oops: 'zzip', clip: 'v_reach', opts: { to: [0.0, 1.2, 0.18], hold: 0.3 }, try: 'B . ZP . B . ZP ZP', line: 'The jacket zip was too musical. Up, down, up.' },
  HUM: { name: 'Hum bass', oops: 'mmm', clip: 'v_micup', try: 'HUM . t . HUM . K .', line: 'A hum under the drums. The first melody.' },
  SI: { name: 'Siren', oops: 'weeoo', clip: 'v_micup', try: 'SI . . . B . K .', line: 'A siren went by. The hero sent it back.' },
};
const SND_COL = ['#2ee6ff', '#ff3ea5', '#ffd35c', '#9dff4a', '#ff7b5c'];
function soundScene(ctx, sid) {
  const f = ctx.form, F = frameOf(ctx), s = SOUND[sid] || SOUND.RIM, it = firstItem(ctx, 'sound'), nm = up((it && it.name) || s.name), col = SND_COL[Object.keys(SOUND).indexOf(sid) % SND_COL.length];
  if (MICRO(f)) return micro(ctx, 'beatbox', s.oops, col, { opts: { bpm: 100 } });
  const R = reel();
  // 1 the accident: a full figure, the hero mid nothing; the sound happens, the hero freezes
  R.at(0, turn(F, 0), clip(H, s.clip, s.opts || {}), L(ctx, F, 'fs', { to: { d: 4.9 }, dur: 2 }));
  R.at(0.35, drum(sid, { vel: 0.9 }), word(s.oops, 'hero:mouth', { size: 3.4, color: col, ms: 800 }));
  let t = 0.9;
  if (f === 'first') { R.at(0.95, clip(H, 'idle'), mood(H, 'shout'), look(H, lensPt(F))).at(1.0, say(null, s.line, { dur: 2.0 })); t = 2.3; }
  else if (f === 'full') { R.at(0.95, clip(H, 'idle'), mood(H, 'shout')); t = 1.3; }
  // 2 on purpose: a medium, two bars with the new sound in the groove
  R.at(t, look(H, null), mood(H, 'happy'), L(ctx, F, 'ms', { cut: 'blend', ms: 380, to: { d: 3.7 }, dur: 2 }), cue('beat', { who: H, pattern: s.try, bpm: 100, step: 0.5, rings: true, words: f === 'first' }));
  t += f === 'short' ? 1.4 : 2.5;
  // 3 the card
  R.at(t, clip(H, 'v_guns'), cue('title', { style: 'card', text: 'NEW SOUND', sub: nm + '  /  record it in the Sound Recorder', at: 'top' }), drum('K'), ctx.PAY);
  R.at(t + (f === 'short' ? 0.9 : 1.5), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 1.1 : 1.8));
  return { events: R.list() };
}

// AN ACHIEVEMENT: the stamp slams on the downbeat, the hero glances at it as if the HUD were there (the only fourth wall look in the game)
function achScene(ctx) {
  const f = ctx.form, F = frameOf(ctx), it = firstItem(ctx, 'ach') || {}, nm = up(it.name || (ctx.extra && ctx.extra.name) || 'ACHIEVEMENT'), desc = it.desc || (ctx.extra && ctx.extra.desc) || '';
  if (MICRO(f)) return micro(ctx, 'v_guns', nm.length < 14 ? nm : 'TROPHY', '#ffd35c', { sfx: 'achievement', size: 2.8 });
  const R = reel();
  R.at(0, turn(F, 0), clip(H, 'idle'), L(ctx, F, 'fs', { side: 0.4, to: { d: 4.9, side: 0.25 }, dur: 2.2 }));
  R.at(f === 'short' ? 0.1 : 0.45, drum('B'), drum('K'), cue('flash', { color: '#ffd35c', ms: 160 }), cue('shake', { amp: 0.03, dur: 0.25 }), sfx('achievement'), cue('title', { style: 'card', text: nm, sub: desc, at: 'top' }), ctx.PAY);
  const tg = f === 'short' ? 0.35 : 0.9;
  R.at(tg, look(H, [F.x + F.dx * 2 - F.dz * 0.4, F.y + 2.6, F.z + F.dz * 2 + F.dx * 0.4]), mood(H, 'happy'));
  R.at(tg + 0.7, look(H, null), clip(H, f === 'short' ? 'cheer' : 'v_guns'));
  R.at(tg + (f === 'short' ? 0.9 : 1.5), cue('untitle', { ms: 300 })).end(tg + (f === 'short' ? 1.1 : 1.8));
  return { events: R.list() };
}

// A COSMETIC UNLOCK: a glowing little token of the item at the shoulder, one spin, then it flies off home. "In your wardrobe: <name>"
function token(group) {
  const g = new THREE.Group(); g.name = 'vig_token'; const gold = mat('#ffd35c'), pink = mat('#ff6ec7');
  const shape = group === 'hat' ? new THREE.CylinderGeometry(0.07, 0.11, 0.08, 8) : group === 'glasses' ? new THREE.TorusGeometry(0.06, 0.018, 5, 10) : group === 'shoes' ? new THREE.BoxGeometry(0.16, 0.07, 0.08) : new THREE.OctahedronGeometry(0.08, 0);
  const m = new THREE.Mesh(shape, group === 'top' || group === 'bottom' ? pink : gold); g.add(m);
  const halo = glowBall('#fff1c9', 0.22); halo.userData.setV(0.7); g.add(halo); g.userData.dispose = () => halo.userData.dispose();
  g.scale.setScalar(1.9); return g;
}
function unlockScene(ctx) {
  const f = ctx.form, F = frameOf(ctx), it = firstItem(ctx, 'unlock') || {}, nm = it.name || (ctx.extra && ctx.extra.name) || 'a new look', tk = ref();
  if (MICRO(f)) return micro(ctx, 'v_guns', 'NEW', '#ff6ec7', { sfx: 'unlock' });
  const R = reel(), sh = [F.x + F.dz * 0.5 + F.dx * 0.35, F.y + 1.75, F.z - F.dx * 0.5 + F.dz * 0.35], off = [F.x - F.dz * 6 + F.dx * 1.5, F.y + 3.2, F.z + F.dx * 6 + F.dz * 1.5];
  R.at(0, turn(F, 0), clip(H, 'idle'), L(ctx, F, 'ms', { d: 4.4, to: { d: 3.9 }, dur: 2 }), spawn(ctx, tk, () => token(it.group), sh), sfx('unlock'));
  const spinT = f === 'short' ? 0.5 : 1.1;
  R.at(0, anim(ctx, (T) => { const o = tk.obj; if (!o) return; const u = Math.max(0, (T - spinT) / 0.6), e = u * u; o.rotation.y = T * 5; o.position.set(sh[0] + (off[0] - sh[0]) * e, sh[1] + Math.sin(T * 3) * 0.04 + (off[1] - sh[1]) * e, sh[2] + (off[2] - sh[2]) * e); o.visible = u < 1; }));
  R.at(0.2, look(H, sh), mood(H, 'happy')).at(spinT, sfx('whoosh', { pitch: 1.4 }), look(H, null), clip(H, 'v_guns'));
  R.at(spinT + 0.2, say(null, 'In your wardrobe: ' + nm + '.', { dur: 1.4 }), ctx.PAY);
  R.end(spinT + (f === 'short' ? 0.9 : 1.6));
  return { events: R.list() };
}

// A BURST: several progress beats at once collapse into one scene. The headline beat (a level, else a sound, else a trophy, else a look) plays its moment; the card lists the rest.
function burstTitle(items) {
  const lv = items.filter((x) => x.k === 'levelup'), sd = items.filter((x) => x.k === 'sound'), ac = items.filter((x) => x.k === 'ach'), ul = items.filter((x) => x.k === 'unlock'), parts = [];
  if (lv.length) parts.push('LEVEL ' + Math.max(...lv.map((x) => x.level || 0)));
  if (sd.length) parts.push(sd.length > 1 ? sd.length + ' NEW SOUNDS' : 'NEW SOUND');
  if (ac.length) parts.push(ac.length > 1 ? ac.length + ' TROPHIES' : 'TROPHY');
  if (ul.length) parts.push(ul.length > 1 ? ul.length + ' UNLOCKS' : 'UNLOCK');
  const names = [].concat(sd.map((x) => x.name), ac.map((x) => x.name), ul.map((x) => x.name)).filter(Boolean);
  return { text: parts.join(' + ') || 'LEVEL UP', sub: names.slice(0, 4).join('  /  ') + (names.length > 4 ? '  / ...' : '') };
}
function burst(ctx) {
  const f = ctx.form, F = frameOf(ctx), items = itemsOf(ctx).length ? itemsOf(ctx) : [{ k: 'levelup', level: (ctx.ch && ctx.ch.level) || 2 }, { k: 'unlock', name: 'a new look' }], T0 = burstTitle(items);
  if (MICRO(f)) return micro(ctx, 'cheer', T0.text.length < 16 ? T0.text : 'LEVEL UP', '#9dff4a', { sfx: 'levelup', size: 2.6 });
  const R = reel(), snd = items.find((x) => x.k === 'sound');
  R.at(0, turn(F, 0), clip(H, 'idle'), L(ctx, F, 'fs', { to: { d: 4.9 }, dur: 2.6 }), sfx('levelup'));
  if (f !== 'short') R.at(0.05, cue('speed', { v: 0.25, ms: 160 }), cue('vignette', { v: 0.7, ms: 300 }));
  statRing(R, 0.15);
  let t = 0.15 + BEAT * 2;
  if (snd && f !== 'short') { R.at(t, cue('speed', { v: 1, ms: 160 }), cue('beat', { who: H, pattern: 'B . ' + snd.id + ' . B B ' + snd.id + ' .', bpm: 110, step: 0.5, rings: true })); t += 1.15; }
  R.at(t, cue('speed', { v: 1, ms: 160 }), cue('vignette', { v: 0, ms: 300 }), clip(H, 'cheer'), mood(H, 'happy'), drum('B'), drum('K'), cue('flash', { color: '#fff6e8', ms: 160 }),
    cue('fx', { kind: 'confetti', at: 'hero:top', n: 70 }), cue('title', { style: 'card', text: T0.text, sub: T0.sub, at: 'top' }), ctx.PAY);
  R.at(t + (f === 'short' ? 1.0 : 1.7), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 1.2 : 2.0));
  return { events: R.list() };
}

// ======================================================================= FANS AND MONEY (VIGNETTES.md 3.5, 3.6)
// 25 fans: a passer-by slows down, looks twice, keeps walking. Nothing else. The hero turns to watch.
function fans25(ctx) {
  const f = ctx.form, F = frameOf(ctx);
  if (MICRO(f)) return micro(ctx, 'v_nod', '25 FANS', '#ff6ec7');
  const R = reel(), a = ptAt(F, 1.5, -2.6), b = ptAt(F, 1.5, 2.6), mid = ptAt(F, 1.5, 0.15);
  if (blocked(ctx, [a[0], F.y + 1, a[1]], [b[0], F.y + 1, b[1]])) { a[0] = F.x + (a[0] - F.x) * 0.5; a[1] = F.z + (a[1] - F.z) * 0.5; b[0] = F.x + (b[0] - F.x) * 0.5; b[1] = F.z + (b[1] - F.z) * 0.5; }
  R.at(0, turn(F, 0, -15), clip(H, 'idle'), L(ctx, F, 'wide', { to: { d: 6.3 }, dur: 3.4 }), cue('spawn', { id: 'pb', look: LOOK.stranger, at: a, face: 0 }));
  const sp = f === 'short' ? 1.6 : 1.1;
  R.at(0.05, cue('walk', { who: 'pb', to: [mid, b], speed: sp }));
  R.at(f === 'short' ? 0.9 : 1.35, look('pb', 'hero:head'), drum('t', { vel: 0.5 })).at(f === 'short' ? 1.2 : 1.75, look('pb', null)).at(f === 'short' ? 1.4 : 2.0, look('pb', 'hero:head'), word('?', 'pb:top', { size: 3, color: '#fff6e8', ms: 600 }));
  R.at(f === 'short' ? 1.6 : 2.3, look('pb', null), look(H, 'pb:head'), mood(H, 'happy'));
  R.at(f === 'short' ? 1.8 : 2.8, cue('title', { style: 'card', text: '25 FANS', sub: 'somebody knows your face', at: 'top' }), ctx.PAY);
  R.at(f === 'short' ? 2.4 : 3.8, cue('untitle', { ms: 300 })).end(f === 'short' ? 2.6 : 4.0);
  return { events: R.list() };
}
// 100 fans (Hundred Hearts): a teenager asks for a selfie; the hero does not know how to pose; the teen poses for both
function fans100(ctx) {
  const f = ctx.form, F = frameOf(ctx), ph = ref();
  if (MICRO(f)) return micro(ctx, 'v_guns', '100 FANS', '#ff6ec7');
  const R = reel(), fs = freeSide(ctx, F, 0.35, 0.95), tAt = fs.at;
  R.at(0, turn(F, 0, -fs.s * 12), clip(H, 'idle'), L(ctx, F, 'fs', { mid: tAt, d: 6.6, to: { d: 6.0 }, dur: 3 }), cue('spawn', { id: 'teen', look: LOOK.teen, at: tAt, face: F.face + fs.s * 20 }),
    spawn(ctx, ph, () => phone(), [tAt[0], F.y + 1.2, tAt[1]]));
  let t = 0;
  if (f !== 'short') { R.at(0.1, clip('teen', 'wave'), look('teen', 'hero:head'), say('teen', 'Wait. You are the one from the park!', { name: 'FAN', dur: 1.6 })); t = 1.5; }
  // the phone up at arm's length; the hero tries three poses on three beats, the teen fixes it: two peace signs
  R.at(t, hold(ctx, ph, 'teen', { aim: 'face' }), clip('teen', 'v_hold', { y: 1.5, z: 0.5, x: 0.15, look: 0.3 }), look('teen', null), look(H, lensPt(F)));
  if (f !== 'short') ['point', 'v_shrug', 'battle'].forEach((c, i) => R.at(t + 0.3 + i * BEAT, clip(H, c), drum(i === 2 ? 'K' : 't', { vel: 0.6 })));
  const tp = t + (f === 'short' ? 0.4 : 0.3 + BEAT * 3);
  R.at(tp, clip(H, 'v_guns'), clip('teen', 'v_guns'), mood(H, 'happy'), mood('teen', 'happy'), cue('flash', { color: '#ffffff', ms: 220 }), sfx('click', { pitch: 1.6 }), drum('K'));
  R.at(tp + 0.35, cue('title', { style: 'card', text: 'HUNDRED HEARTS', sub: '100 fans', at: 'top' }), ctx.PAY);
  R.at(tp + (f === 'short' ? 1.0 : 1.7), cue('untitle', { ms: 300 })).end(tp + (f === 'short' ? 1.2 : 1.9));
  return { events: R.list() };
}
// 500 fans (Half a Thousand): a kid beatboxes the hero's own groove back at them, badly, perfectly
function fans500(ctx) {
  const f = ctx.form, F = frameOf(ctx);
  if (MICRO(f)) return micro(ctx, 'cheer', '500 FANS', '#ffd35c');
  const R = reel(), fs = freeSide(ctx, F, 0.6, 1.1);
  R.at(0, turn(F, 0, -fs.s * 18), clip(H, 'idle'), L(ctx, F, 'fs', { mid: fs.at, d: 6.4, to: { d: 5.8 }, dur: 3.2 }), cue('spawn', { id: 'kid', look: LOOK.kid, at: fs.at, face: F.face + fs.s * 50 }),
    call((api) => { const k = api.actor('kid'); if (k) k.o.scale.setScalar(0.78); }), look('kid', 'hero:head'));
  let t = 0.2;
  if (f !== 'short') { R.at(0.2, cue('beat', { who: 'kid', pattern: 'B t K . B B K t', bpm: 104, step: 0.5, words: true, vel: 0.55 })); t = 0.2 + 8 * 60 / 104 * 0.5 + 0.1; }
  else { R.at(0.2, cue('beat', { who: 'kid', pattern: 'B t K .', bpm: 104, step: 0.5, vel: 0.55 })); t = 1.4; }
  R.at(t, look(H, 'kid:head'), mood(H, 'happy'), clip(H, 'v_nod', { n: 2 }), clip('kid', 'cheer'), drum('B'));
  R.at(t + 0.6, clip(H, 'v_clap', { bpm: 104 }), cue('title', { style: 'card', text: 'HALF A THOUSAND', sub: '500 fans. The kids know the groove.', at: 'top' }), ctx.PAY);
  R.at(t + (f === 'short' ? 1.1 : 1.8), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 1.3 : 2.1));
  return { events: R.list() };
}
// 2000 fans (Local Legend): the people around stop and clap, the confetti, the hero stands in the same pose a mural would
function fans2000(ctx) {
  const f = ctx.form, F = frameOf(ctx);
  if (MICRO(f)) return micro(ctx, 'v_guns', 'LEGEND', '#ffd35c');
  const R = reel(), l = freeSide(ctx, F, 0.5, 1.0), r2 = ptAt(F, 0.5, -l.s * 1.0 * l.k);
  R.at(0, turn(F, 0), clip(H, 'idle'), L(ctx, F, 'wide', { to: { d: 6.3 }, dur: 3.5 }), cue('spawn', { id: 'fa', look: LOOK.fanA, at: l.at, face: F.face + 180 + l.s * 30 }), cue('spawn', { id: 'fb', look: LOOK.fanB, at: r2, face: F.face + 180 - l.s * 30 }),
    face('fa', H, 0), face('fb', H, 0));
  R.at(0.3, clip('fa', 'v_clap', { bpm: 100 }), clip('fb', 'v_clap', { bpm: 100, up: 1 }), sfx('applause'));
  const tp = f === 'short' ? 0.7 : 1.6;
  R.at(tp, clip(H, 'finisher'), mood(H, 'happy'), drum('B'), drum('K'), cue('fx', { kind: 'confetti', at: 'hero:top', n: 90 }), cue('flash', { color: '#ffd35c', ms: 200 }),
    cue('title', { style: 'card', text: 'LOCAL LEGEND', sub: '2000 fans', at: 'top' }), ctx.PAY);
  R.at(tp + (f === 'short' ? 1.1 : 1.9), cue('untitle', { ms: 300 })).end(tp + (f === 'short' ? 1.3 : 2.2));
  return { events: R.list() };
}
// money: $100 for the first time (the notes counted on the beat, the coins land one per beat), $500 (Tip Jar Full: a one second fantasy on a pile of gold, then the real count)
function goldPile() {
  const g = new THREE.Group(); g.name = 'vig_gold'; const m = mat('#ffd35c'), d = mat('#c99a12'), geo = new THREE.CylinderGeometry(0.07, 0.07, 0.018, 9);
  let s = 7; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.85, c = new THREE.Mesh(geo, i % 3 ? m : d); c.position.set(Math.cos(a) * r, 0.02 + (0.85 - r) * 0.42 * R() + 0.01 * i % 0.05, Math.sin(a) * r); c.rotation.set(R() * 0.8, 0, R() * 0.8); g.add(c); }
  g.userData.dispose = () => geo.dispose(); return g;
}
function money(ctx, n) {
  const f = ctx.form, F = frameOf(ctx), cs = ref(), pile = ref();
  if (MICRO(f)) return micro(ctx, 'v_guns', '$' + n, '#9dff4a', { sfx: 'coin' });
  const R = reel(); let t = 0;
  if (n >= 500 && f !== 'short') {
    // the fantasy: a dip to gold, the hero lying on a heap of coins, a held second, a dip back
    R.at(0, cue('dip', { v: 1, ms: 0, color: '#ffd35c' }), turn(F, 0, 90), spawn(ctx, pile, goldPile, [F.x, F.y, F.z]), clip(H, 'v_lie', { y: 0.32, smile: true, awake: 0.6 }),
      cam([F.x + F.dx * 1.2, F.y + 3.6, F.z + F.dz * 1.2], [F.x, F.y + 0.3, F.z], 46), cue('dip', { v: 0, ms: 420, color: '#ffd35c' }), sfx('coin'), drum('B'));
    [0, 1, 2, 3].forEach((i) => R.at(0.3 + i * 0.18, sfx('coin', { pitch: 1 + i * 0.07 })));
    R.at(1.3, cue('dip', { v: 1, ms: 260, color: '#ffd35c' })).at(1.6, gone(ctx, pile), cue('dip', { v: 0, ms: 320, color: '#ffd35c' }));
    t = 1.6;
  }
  // the real thing: a medium, the notes held up and counted on the beat
  R.at(t, turn(F, 0), clip(H, 'v_hold', { y: 1.05, z: 0.32, look: 1 }), spawn(ctx, cs, () => cash(4), [F.x, F.y + 1, F.z]), hold(ctx, cs, H, { aim: 'face' }), mood(H, 'happy'), L(ctx, F, 'ms', { to: { d: 3.7 }, dur: 2 }));
  coins(R, ctx, t + 0.3, f === 'short' ? 3 : 5, 'hero:top');
  const tp = t + (f === 'short' ? 1.1 : 1.8);
  R.at(tp, clip(H, n >= 500 ? 'finisher' : 'cheer'), gone(ctx, cs), drum('K'), cue('title', { style: 'card', text: n >= 500 ? 'TIP JAR FULL' : '$' + n, sub: n >= 500 ? '$500 in your pocket at once' : 'the most money since the office', at: 'top' }), ctx.PAY);
  R.at(tp + (f === 'short' ? 0.9 : 1.6), cue('untitle', { ms: 300 })).end(tp + (f === 'short' ? 1.1 : 1.9));
  return { events: R.list() };
}
// broke: the wallet is empty (pockets inside out, a moth), the phone buzzes: Foxy, "busk. the park pays."
function broke(ctx) {
  const f = ctx.form, F = frameOf(ctx), mt = ref(), ph = ref();
  if (MICRO(f)) return micro(ctx, 'v_pockets', '$0', '#c9c3dd', { dur: 1.2 });
  const R = reel();
  R.at(0, turn(F, 0), clip(H, 'v_pockets'), L(ctx, F, 'fs', { to: { d: 4.9 }, dur: 3 }), mood(H, 'sad'), sfx('lose', { pitch: 1.2, quiet: true }));
  R.at(0.9, spawn(ctx, mt, moth, [F.x, F.y + 0.9, F.z]), anim(ctx, (T) => { const o = mt.obj; if (!o) return; o.userData.flap(T); o.position.set(F.x + F.dx * 0.3 + Math.sin(T * 3) * 0.3, F.y + 0.9 + T * 0.55, F.z + F.dz * 0.3 + Math.cos(T * 2.3) * 0.2); o.visible = T < 2.5; }),
    drum('t', { vel: 0.3 }), word('$0', 'hero:top', { size: 3.6, color: '#c9c3dd', ms: 900 }));
  let t = f === 'short' ? 1.3 : 2.0;
  R.at(t, spawn(ctx, ph, () => phone(), [F.x, F.y + 1, F.z]), hold(ctx, ph, H, { aim: 'face' }), clip(H, 'v_hold', { y: 0.95, z: 0.3, look: 1 }), sfx('click', { pitch: 1.8 }), drum('t'),
    call(() => ph.obj && ph.obj.userData.draw((g, w, h) => { g.fillStyle = '#17141f'; g.fillRect(0, 0, w, h); g.fillStyle = '#9dff4a'; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText('FOXY', w / 2, 60); g.fillStyle = '#fff6e8'; g.font = '500 18px sans-serif'; g.fillText('busk.', w / 2, 130); g.fillText('the park pays.', w / 2, 160); })),
    say('foxy', 'busk. the park pays.', { dur: 1.6, name: 'FOXY', color: '#9dff4a' }), L(ctx, F, 'ms', { cut: 'blend', ms: 360 }));
  R.at(t + 0.7, ctx.PAY).at(t + 1.4, gone(ctx, ph), clip(H, 'v_nod', { n: 1, deep: true }), mood(H, 'neutral')).end(t + 2.0);
  return { events: R.list() };
}

// ======================================================================= RENT DAY (VIGNETTES.md 3.5): the flat, the fridge with the rent notice (flat_kitchen.js: the fridge (4.97, -5.15), the notice at y 1.46)
// The fridge stands against the north wall, so the lens never sees a face at it head on: the pinning is a profile from the west, across the counter run (the hand on the lens
// side); the two of them talking is a two shot from the south east, past the monstera (both in profile); Foxy's look is over the hero's shoulder, the hero stepped back south of her.
const FRIDGE = { at: [4.85, -4.25], note: [5.05, 1.42, -4.79], cam: [1.0, 1.8, -3.25], cam2: [1.25, 1.75, -3.35], look: [4.95, 1.05, -4.35], two: [7.3, 2.1, 0.0], twoLook: [5.2, 1.0, -3.95],
  back: [4.85, -3.3], ots: [3.9, 4.1, 0.5], otsLook: [4.95, 1.2, -4.3] };
// Foxy: the flat's own Foxy when the world has her (shown for the scene even when she is out: the engine hides her again at the end), else a stand in
const hasFoxy = (ctx) => (ctx.world.npcs || []).some((n) => n && n.id === 'foxy');
const foxyId = (ctx) => (hasFoxy(ctx) ? 'foxy' : 'foxyS');
function foxyIn(ctx, R, at, faceDeg, t) { if (hasFoxy(ctx)) R.at(t || 0, place('foxy', at, faceDeg), cue('show', { who: 'foxy', v: true })); else R.at(t || 0, cue('spawn', { id: 'foxyS', look: 'foxy', at, face: faceDeg })); }
function rentPaid(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'flat') return null;
  const ch = ctx.ch || {}, amt = (ctx.extra && ctx.extra.amount) || 60, nt = ref(), FX = foxyId(ctx), n4 = ch.n && ch.n.rentPaid >= 4;
  if (MICRO(f)) return micro(ctx, 'v_nod', '-$' + amt, '#9dff4a', { sfx: 'coin' });
  const R = reel();
  // 1 a full shot from the table: the hero pins the notes under the magnet, one note per beat (the coins leave: a falling pitch)
  R.at(0, place(H, FRIDGE.at, 180), clip(H, 'v_reach', { to: [-0.12, 1.42, 0.5], hold: 1.1 }), cam(FRIDGE.cam, FRIDGE.look, 40, { to: { pos: FRIDGE.cam2 }, dur: 3 }),
    spawn(ctx, nt, () => cash(3), FRIDGE.note));
  foxyIn(ctx, R, [6.3, -2.4], -130);
  [0, 1, 2].forEach((i) => R.at(0.35 + i * BEAT * 0.5, sfx('coin', { pitch: 1.1 - i * 0.07 }), drum('t', { vel: 0.5, pulse: false })));
  R.at(0.4, ctx.PAY, word('-$' + amt, [0.62, 0.32], { size: 3.6, color: '#9dff4a', ms: 900 }));
  let t = f === 'short' ? 1.0 : 1.4;
  if (f !== 'short') {
    // 2 Foxy walks past behind, takes it with a two finger salute
    R.at(t, cue('walk', { who: FX, to: [5.6, -3.95], speed: 1.6, face: -90 }), clip(H, 'idle'), face(H, 90, 400), cam(FRIDGE.two, FRIDGE.twoLook, 40, xf(380)));
    R.at(t + 1.2, gone(ctx, nt), clip(FX, 'v_hold', { y: 1.5, z: 0.25, x: 0.1 }), drum('K', { vel: 0.6 }), look(FX, 'hero:head'), say(FX, n4 ? 'Look at you. A responsible adult.' : 'Pleasure doing business.', { dur: 1.5, name: 'FOXY', color: '#9dff4a' }));
    if (n4) R.at(t + 2.0, clip(FX, 'v_offer', { to: 0.5 }), clip(H, 'v_offer', { to: 0.5 })).at(t + 2.6, mood(FX, 'happy'), mood(H, 'happy'), clip(H, 'cheer'));
    t += n4 ? 3.2 : 2.6;
  } else R.at(t - 0.3, gone(ctx, nt));
  R.at(t, cue('title', { style: 'card', text: 'RENT PAID', sub: '$' + amt + '. Foxy has the receipt in her head.', at: 'top' })).at(t + (f === 'short' ? 0.7 : 1.4), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 0.9 : 1.6));
  return { events: R.list(), holdSync: false };
}
// short: the wallet is not enough. Foxy puts $60 under the magnet, and the look: no line, no music, held. Then she leaves. The debt as a sub.
function rentShort(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'flat') return null;
  const ch = ctx.ch || {}, debt = (ctx.extra && ctx.extra.debt) || ch.rentDebt || 75, nt = ref(), FX = foxyId(ctx);
  if (MICRO(f)) return micro(ctx, 'v_pockets', 'rent...', '#c9c3dd', { dur: 1.2 });
  const R = reel();
  // 1 the hero at the fridge, the notice, the pockets: not enough
  R.at(0, place(H, FRIDGE.at, 180), clip(H, 'v_pockets'), mood(H, 'sad'), cam(FRIDGE.cam, FRIDGE.look, 40, { to: { pos: FRIDGE.cam2 }, dur: 2.4 }), cue('music', { id: null, fade: 0.6 }));
  foxyIn(ctx, R, [6.4, -2.3], -130);
  R.at(0.8, word('...', 'hero:top', { size: 3, color: '#c9c3dd', ms: 700 }));
  // 2 the hero steps back; Foxy takes the place at the fridge, the notes under the magnet
  const t1 = f === 'short' ? 0.6 : 1.4;
  R.at(t1, cue('walk', { who: H, to: FRIDGE.back, speed: 1.0, face: 180 }), cue('walk', { who: FX, to: [[5.6, -3.6], [4.95, -4.25]], speed: 1.5, face: 165 }));
  R.at(t1 + 1.6, spawn(ctx, nt, () => cash(3), FRIDGE.note), clip(FX, 'v_reach', { to: [0.0, 1.42, 0.45], hold: 0.4 }), sfx('click', { pitch: 0.6, quiet: true }), ctx.PAY);
  let t = t1 + 2.2;
  if (f !== 'short') {
    // 3 the look: Foxy turns round, a medium over the hero's shoulder, nothing said, 1.5 s of nothing. Tired, not angry
    R.at(t, face(FX, H, 400), look(FX, 'hero:head'), look(H, FX + ':head'), mood(FX, 'neutral'), cam(FRIDGE.ots, FRIDGE.otsLook, 38));
    t += 1.6;
    R.at(t, cue('walk', { who: FX, to: [[5.7, -3.6], [6.6, -1.5]], speed: 1.2 }), look(H, null), cam(FRIDGE.two, FRIDGE.twoLook, 40, xf(380)), face(H, 180, 500));
    t += 0.9;
  }
  R.at(t, say(null, 'You owe $' + debt + ' (late fee included).', { dur: 1.8 }), cue('music', { id: 'home', fade: 1.5 }));
  R.end(t + (f === 'short' ? 1.4 : 2.0));
  return { events: R.list() };
}

// ======================================================================= THE FIRST STREAM AND THE FIRST RELEASE (home desk: flat.js desk (-0.25, -5.1), the monitor (-0.6, 1.225, -5.198))
// the desk faces the north wall, so the face is seen 3/4 from the west (the TV side), across the living room
const DESK = { sit: [-0.45, -4.5], seat: 0.5, mon: [-0.6, 1.225, -5.18], monW: 0.75, monH: 0.42, wide: [-3.3, 1.75, -3.85], wide2: [-3.0, 1.72, -3.95], look: [-0.5, 0.95, -4.6], couch: [-4.1, 2.2, -4.75], couchLook: [-4.4, 0.75, -1.55] };
function deskScreen(ctx, r) { return spawn(ctx, r, () => screen(DESK.monW, DESK.monH, 384), [DESK.mon[0], DESK.mon[1], DESK.mon[2] + 0.012]); }
// the first stream (Going Live): the hero rehearses "hi everyone" three times before pressing LIVE; the counter starts at 1: it is Foxy, in the next room
function firstStream(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'flat') return null;
  const ov = ref(), FX = foxyId(ctx);
  const draw = (live, n, chat) => (g, w, h) => { g.fillStyle = '#120d1f'; g.fillRect(0, 0, w, h); g.fillStyle = live ? '#ff3a5c' : '#4a3d6a'; g.fillRect(12, 12, 70, 26); g.fillStyle = '#fff'; g.font = '700 17px sans-serif'; g.fillText(live ? 'LIVE' : 'READY', 20, 31); g.fillStyle = '#fff6e8'; g.fillText('● ' + n, 94, 31); if (chat) { g.fillStyle = '#9dff4a'; g.font = '600 18px sans-serif'; g.fillText(chat, w * 0.52, h - 26); } };
  if (MICRO(f)) { const R = reel(); R.at(0, deskScreen(ctx, ov), call(() => ov.obj && ov.obj.userData.draw(draw(true, 1, 'hi it\'s foxy'))), clip(H, 'v_type', { seat: DESK.seat })).at(0.4, drum('K'), ctx.PAY).end(1.0); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  const R = reel();
  R.at(0, place(H, DESK.sit, 205), clip(H, 'v_type', { seat: DESK.seat }), deskScreen(ctx, ov), call(() => ov.obj && ov.obj.userData.draw(draw(false, 0))), cam(DESK.wide, DESK.look, 48, { to: { pos: DESK.wide2 }, dur: 3 }));
  foxyIn(ctx, R, [-4.4, -1.55], 180);
  let t = 0.3;
  const tries = f === 'first' ? ['hi everyone', 'HI everyone!', 'hey... hi.'] : f === 'full' ? ['hi everyone', 'hey. hi.'] : ['hi.'];
  tries.forEach((s, i) => { R.at(t, say(H, s, { dur: 1.0, clip: i % 2 ? 'v_shrug' : 'talk', opts: { sit: DESK.seat } })); t += 1.05; });
  R.at(t, clip(H, 'v_type', { seat: DESK.seat }), drum('K'), sfx('click', { pitch: 1.2 }), call(() => ov.obj && ov.obj.userData.draw(draw(true, 0))), cam([-1.95, 2.0, -3.15], [-0.6, 1.12, -5.18], 40, xf(260)));
  R.at(t + 0.7, call(() => ov.obj && ov.obj.userData.draw(draw(true, 1))), sfx('click', { pitch: 2, quiet: true }), drum('t'));
  R.at(t + 1.3, call(() => ov.obj && ov.obj.userData.draw(draw(true, 1, 'hi it\'s foxy'))), sfx('click', { pitch: 1.6 }));
  // Foxy on the couch, thumbs on the phone, not looking up
  R.at(t + 1.8, cam(DESK.couch, DESK.couchLook, 54, xf(300)), clip(FX, 'sit', { seat: 0.46, slump: 1.1 }), look(FX, null), word('hi it\'s foxy', [0.5, 0.3], { size: 3, color: '#9dff4a', ms: 1100 }), ctx.PAY);
  R.at(t + 3.0, cam(DESK.wide, DESK.look, 48, xf(300)), clip(H, 'cheer', { sit: DESK.seat }), mood(H, 'happy'), cue('beat', { who: H, pattern: 'B t K t', bpm: 100, step: 0.5, rings: true }));
  R.end(t + 4.2);
  return { events: R.list() };
}
// the first release (Record Deal): upload, cannot watch: to the window and back; RELEASED. Foxy plays it from her phone, loud
function release(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'flat') return null;
  const ov = ref(), ph = ref(), FX = foxyId(ctx), song = (ctx.extra && ctx.extra.song) || (ctx.ch && ctx.ch.songs && ctx.ch.songs.length ? ctx.ch.songs[ctx.ch.songs.length - 1].name : 'Track 1');
  const bar = (k, done) => (g, w, h) => { g.fillStyle = '#120d1f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff6e8'; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText(done ? 'RELEASED' : 'UPLOADING', w / 2, h * 0.3); g.font = '600 16px sans-serif'; g.fillStyle = '#ffd35c'; g.fillText('"' + String(song).slice(0, 22) + '"', w / 2, h * 0.48); g.fillStyle = '#2b2440'; g.fillRect(w * 0.12, h * 0.62, w * 0.76, 22); g.fillStyle = done ? '#9dff4a' : '#2ee6ff'; g.fillRect(w * 0.12, h * 0.62, w * 0.76 * Math.min(1, k), 22); };
  if (MICRO(f)) { const R = reel(); R.at(0, deskScreen(ctx, ov), call(() => ov.obj && ov.obj.userData.draw(bar(1, true))), clip(H, 'cheer'), sfx('unlock')).at(0.5, ctx.PAY).end(1.0); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  const R = reel();
  R.at(0, place(H, [-0.45, -4.35], 190), clip(H, 'v_reach', { to: [0.05, 0.95, 0.5], hold: 0.25 }), deskScreen(ctx, ov), call(() => ov.obj && ov.obj.userData.draw(bar(0, false))), cam(DESK.wide, DESK.look, 48, { to: { pos: DESK.wide2 }, dur: 3.5 }));
  R.at(0.35, drum('K'), sfx('click', { pitch: 1.2 }));
  for (let i = 1; i <= 8; i++) R.at(0.35 + i * 0.35, call(() => ov.obj && ov.obj.userData.draw(bar(i / 8, false))));
  let t = 0.6;
  if (f !== 'short') {
    // cannot watch: the walk to the window and back, the hands in the hair
    R.at(t, cue('walk', { who: H, to: [0.95, -4.1], speed: 1.4, face: 150 })).at(t + 1.2, clip(H, 'v_shrug'), mood(H, 'sad')).at(t + 1.6, cue('walk', { who: H, to: [-0.45, -4.35], speed: 1.6, face: 190 }));
    t += 2.6;
  } else t = 2.0;
  R.at(Math.max(t, 3.2), call(() => ov.obj && ov.obj.userData.draw(bar(1, true))), drum('B'), drum('K'), sfx('unlock'), clip(H, 'cheer'), mood(H, 'happy'), cue('fx', { kind: 'sparks', at: [DESK.mon[0], DESK.mon[1] + 0.3, DESK.mon[2] + 0.2], color: '#9dff4a', n: 40 }), ctx.PAY);
  t = Math.max(t, 3.2) + 0.7;
  if (f !== 'short') {
    // Foxy in the kitchen, her phone up, the track loud (the drums play it)
    foxyIn(ctx, R, [2.7, -3.3], 26, t); R.at(t, cam([4.6, 1.9, 0.6], [2.65, 1.0, -3.2], 50, xf(300)), spawn(ctx, ph, () => phone(), [2.7, 1.2, -3.3]), hold(ctx, ph, FX, { aim: 'face' }), clip(FX, 'v_hold', { y: 1.3, z: 0.35, x: 0.1, look: 0 }), mood(FX, 'happy'),
      cue('beat', { pattern: 'B t K t B B K t', bpm: 100, step: 0.5, pulse: true }), word('LOUD', [0.5, 0.3], { size: 4, color: '#9dff4a', ms: 900 }));
    t += 2.3;
  }
  R.at(t, cue('title', { style: 'card', text: 'RECORD DEAL', sub: '"' + song + '" is out. Fans start tomorrow.', at: 'top' })).at(t + (f === 'short' ? 0.9 : 1.6), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 1.1 : 1.8));
  return { events: R.list() };
}

// ======================================================================= THE BAR: a new crew member (p2.crew.<id>), a new rung on the ladder (bar.js: the room x -5.6..5.6, z -4.6..5.0)
// the crew handshake happens on the open floor in front of the counter end (south of the stools): the two a metre apart across the lens axis, both in profile, a wide lens from
// the south east corner (two chibi figures side by side want about 2.7 m of frame width on a phone)
const CREW_AT = { hero: [-2.35, 2.55], them: [-1.55, 1.85], cam: [2.6, 2.1, 4.95], cam2: [2.2, 2.0, 4.8], look: [-1.95, 0.9, 2.2] };
const CREW = {
  jaxx: { name: 'JAXX', role: 'four on the floor, all night' },
  noor: { name: 'NOOR', role: 'hears the wrong note before you play it' },
  duot: { name: 'DUO-T', role: 'two brothers, one mic' },
  glaze: { name: 'GLAZE', role: 'producer, ex radio host' },
  miro: { name: 'MIRO', role: 'perfect pitch, choir trained' },
};
const crewLook = (id) => { try { const m = (core().CREW || []).find((x) => x.id === id); return m && m.look; } catch (e) { return null; } };
function crewScene(ctx, id) {
  const f = ctx.form; if (ctx.world.id !== 'bar') return null;
  const c = CREW[id] || CREW.jaxx, lk = crewLook(id) || LOOK.fanA, nb = ref(), R = reel();
  if (MICRO(f)) return micro(ctx, 'cheer', c.name, '#ffd35c', { sfx: 'unlock' });
  const two = id === 'duot', A = 'crew', B2 = 'crew2', fc = Math.atan2(CREW_AT.hero[0] - CREW_AT.them[0], CREW_AT.hero[1] - CREW_AT.them[1]) / D2R;
  R.at(0, place(H, CREW_AT.hero, fc + 180), clip(H, 'idle'), cue('spawn', { id: A, look: lk, at: CREW_AT.them, face: fc }), cam(CREW_AT.cam, CREW_AT.look, 56, { to: { pos: CREW_AT.cam2 }, dur: 4 }));
  if (two) R.at(0, cue('spawn', { id: B2, look: lk, at: [CREW_AT.them[0] + 0.55, CREW_AT.them[1] + 0.5], face: fc - 20 }));
  let t = 0.3;
  if (f !== 'short') {
    if (id === 'jaxx') { [0, 1, 2, 3].forEach((i) => R.at(t + i * BEAT * 0.5, drum('B'), cue('shake', { amp: 0.015, dur: 0.12 }), word('stomp', [0.3 + i * 0.12, 0.6], { size: 2.6, color: '#ffd35c', ms: 400 }))); R.at(t, clip(A, 'dance', { bpm: 100 })); t += BEAT * 2 + 0.2; }
    if (id === 'noor') { R.at(t, clip(A, 'v_shades'), spawn(ctx, nb, notebook, [CREW_AT.them[0], 1.1, CREW_AT.them[1]]), hold(ctx, nb, A, { hand: 'R', aim: 'face' })).at(t + 0.8, word('B . t K  ->  B t . K', [0.5, 0.36], { size: 2.6, color: '#ff5cb0', ms: 1200 }), sfx('click', { pitch: 2, quiet: true })); t += 1.6; }
    if (id === 'duot') { R.at(t, look(A, 'cam'), look(B2, 'cam'), say(A, 'hi', { name: 'DUO-T', dur: 0.8 })).at(t + 0.5, drum('K'), word('bonk', [0.55, 0.32], { size: 3.4, color: '#ff3ea5', ms: 600 }), cue('shake', { amp: 0.02, dur: 0.2 }), clip(A, 'v_shrug'), clip(B2, 'v_shrug')); t += 1.3; }
    if (id === 'glaze') { R.at(t, clip(A, 'talk'), say(A, 'You are listening to...', { name: 'GLAZE', dur: 1.5 })).at(t + 1.5, say(H, (ctx.name || 'me') + '!', { dur: 0.9 }), clip(H, 'v_guns')); t += 2.4; }
    if (id === 'miro') { R.at(t, clip(A, 'v_micup'), call(() => ctx.note(81, 1.4, { timbre: 'flute', vel: 0.35 })), word('ting', [0.25, 0.4], { size: 2.8, color: '#cfe8ff', ms: 600 })).at(t + 0.4, word('ting', [0.7, 0.35], { size: 2.8, color: '#cfe8ff', ms: 600 }), drum('t', { vel: 0.4 })).at(t + 0.8, word('ting', [0.5, 0.25], { size: 2.8, color: '#cfe8ff', ms: 600 }), drum('t', { vel: 0.4 })); t += 1.7; }
  }
  // the handshake, the name card
  R.at(t, clip(H, 'v_offer', { to: 0.55 }), clip(A, 'v_offer', { to: 0.55 }), drum('K'), sfx('confirm'));
  R.at(t + 0.55, mood(H, 'happy'), mood(A, 'happy'), cue('title', { style: 'card', text: c.name, sub: 'joins your crew  /  ' + c.role, at: 'top' }), ctx.PAY);
  R.at(t + (f === 'short' ? 1.1 : 1.9), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 1.3 : 2.1));
  return { events: R.list() };
}
// the ladder: the LED wall over the stage turns into the ladder, the beaten names struck through, the next rung lit. The hero in front of it, from the back of the room.
const led = (ctx) => ctx.world.terrain && ctx.world.terrain.led;
const barApi = (ctx) => (ctx.world.terrain && ctx.world.terrain.api) || ctx.world.bar || null;
function ladderDraw(ctx, k) {
  const C = core(), O = C.OPPONENTS || [], beat = (ctx.ch && ctx.ch.beat) || {}, fresh = ctx.extra && ctx.extra.opp;
  return call(() => { try { const l = led(ctx); if (!l) return; l.draw((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#24104e'); gr.addColorStop(1, '#0b0620'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.textBaseline = 'middle';
    // the middle third of the wall carries it (a phone frame sees about that much of it from the back of the room): the rung count big, the beaten name struck through under it
    const n = O.length || 7, won = O.filter((o) => beat[o.id]).length, o = O.find((x) => x.id === fresh) || O[Math.max(0, won - 1)], cx = w / 2; g.textAlign = 'center';
    g.fillStyle = '#ffd35c'; g.font = '900 ' + Math.round(h * 0.12) + 'px sans-serif'; g.fillText('THE LADDER', cx, h * 0.16);
    g.fillStyle = k > 0.5 ? '#9dff4a' : '#fff6e8'; g.font = '900 ' + Math.round(h * 0.34) + 'px sans-serif'; g.fillText((k > 0.5 ? won : Math.max(0, won - 1)) + ' / ' + n, cx, h * 0.48);
    if (o) { const nm = up(o.name); g.font = '800 ' + Math.round(h * 0.11) + 'px sans-serif'; g.fillStyle = '#cfe8ff'; g.fillText(nm, cx, h * 0.78); const tw = g.measureText(nm).width * Math.max(0, Math.min(1, (k - 0.4) * 2)); if (tw > 0) { g.strokeStyle = '#ff4f6a'; g.lineWidth = Math.max(3, h * 0.018); g.beginPath(); g.moveTo(cx - g.measureText(nm).width / 2 - 6, h * 0.78); g.lineTo(cx - g.measureText(nm).width / 2 - 6 + tw + 12, h * 0.78); g.stroke(); } }
    g.fillStyle = 'rgba(15,8,35,.22)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  }); } catch (e) { /* ignore */ } });
}
function ladder(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'bar') return null;
  const ch = ctx.ch || {}, O = core().OPPONENTS || [], won = O.filter((o) => ch.beat && ch.beat[o.id]).length, next = O.find((o) => !(ch.beat && ch.beat[o.id])), R = reel();
  if (MICRO(f)) return micro(ctx, 'v_guns', won + ' / ' + (O.length || 7), '#9dff4a');
  const a = barApi(ctx); let st = null; try { st = a && a.state ? a.state() : null; } catch (e) { st = null; }
  ctx.own(() => { try { if (a) { a.setLyrics(null); if (st) { a.setEnergy(st.energy); a.setTheme(st.theme); } } } catch (e) { /* ignore */ } });
  // the hero up on the stage deck (above the crowd's heads), the wall over him, from the back of the room
  R.at(0, place(H, [2.15, -2.75], 150, { y: 0.38 }), clip(H, 'idle'), ladderDraw(ctx, 0), cam([2.3, 2.9, 4.5], [3.0, 1.6, -3.6], 40, { to: { pos: [2.45, 2.75, 3.8] }, dur: 3.5 }));
  for (let i = 1; i <= 6; i++) R.at(0.5 + i * 0.12, ladderDraw(ctx, i / 6));
  R.at(0.95, drum('K'), sfx('confirm'), word('#' + won, [0.5, 0.35], { size: 4.4, color: '#9dff4a', ms: 800 }));
  const t = f === 'short' ? 1.1 : 1.6;
  if (f !== 'short') R.at(1.2, face(H, 0, 500), clip(H, 'v_nod', { n: 1, deep: true }), mood(H, 'happy'));
  R.at(t, cue('title', { style: 'card', text: 'LADDER  ' + won + ' / ' + (O.length || 7), sub: next ? 'next: ' + next.name : 'nobody left on the ladder', at: 'top' }), ctx.PAY);
  R.at(t + (f === 'short' ? 0.9 : 1.6), cue('untitle', { ms: 300 })).end(t + (f === 'short' ? 1.1 : 1.8));
  return { events: R.list(), holdSync: true };
}

// ======================================================================= the table
export const SOUND_IDS = Object.keys(SOUND);
export const CREW_IDS = Object.keys(CREW);
export const VIGNETTES = {
  'p2.levelup': levelUp, 'p2.ach': achScene, 'p2.unlock.cosmetic': unlockScene, 'p2.beats': burst,
  'p2.fans.25': fans25, 'p2.fans.100': fans100, 'p2.fans.500': fans500, 'p2.fans.2000': fans2000,
  'p2.money.100': (c) => money(c, 100), 'p2.money.500': (c) => money(c, 500), 'p2.broke': broke,
  'p2.rent.paid': rentPaid, 'p2.rent.short': rentShort,
  'p2.first.stream': firstStream, 'p2.release': release, 'p2.ladder': ladder,
};
for (const k of SOUND_IDS) VIGNETTES['p2.sound.' + k] = (c) => soundScene(c, k);
for (const k in VIGNETTES) VIGNETTES[k] = anywhere(VIGNETTES[k]);
for (const k of CREW_IDS) VIGNETTES['p2.crew.' + k] = (c) => crewScene(c, k);
// where a world scene plays (the queue in r3/vig.js waits for that world, or lets the reward land without a scene)
export const HOME = { 'p2.rent.paid': 'flat', 'p2.rent.short': 'flat', 'p2.first.stream': 'flat', 'p2.release': 'flat', 'p2.ladder': 'bar' };
for (const k of CREW_IDS) HOME['p2.crew.' + k] = 'bar';
export const WORLD = 'milestones';
void stamp; void put; void show; void withProp; void HAND; void S; void glowBall;
