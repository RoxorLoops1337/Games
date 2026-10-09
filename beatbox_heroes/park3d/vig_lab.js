// VIGNETTES: THE SOUND LAB (world 'lab', owner VIG town crew). VIGNETTES.md 1.4, 2.5, 2.6 (studio variants) and 2.11: the training bookends at the condenser mic, the training
// games' lead ins, the beat maker at the MPC, the sound recorder, quick practice, the jukebox, and the lab's refusals. A real studio: an engineer (Dex, spawned for the scene) on the
// other side of the glass, the talkback, the count in, ON AIR and the REC lamp, the cans going on, the VU needles kicking with the beat.
// Staging (lab.js, metres, +z toward the gameplay camera; face 0 = +z, 90 = +x, 180 = north, -90 = west):
//   booth x 1.7..4.5, z -3.5..-0.55, glass walls (posts at z -3.46 -2.5 -1.5 -0.59 on x 1.7; the door gap x 1.85..2.95 on z -0.55); the condenser on its stand at (2.85,-1.8), the singer's mark
//   (3.5,-1.8) facing west (the mic spot), the reflection shield west of the mic; ON AIR sign (3.45, 2.28, -3.46), REC lamp over the door; world.setBeat bounces the VU meters and flashes the pads
//   desk centre (-1.95,-1.5), top 0.8, mixer spot (-1.95,-0.38); MPC pad table (0.75,-1.45) top 0.85; jukebox (-4.05,-1.25) facing east; couch on the west wall z 0.95..2.95
import { THREE } from './kit.js';
import { cue, shot, clip, place, face, look, mood, sfx, drum, word, say, stamp, call, ref, spawn, hold, gone, withProp, anim, BEAT } from './vignette_kit.js';
import { pads, glowBall, phone } from './vignette_props.js';
import { headphones, notebook } from './vig_town_props.js';
import { H, reel, S, xf, cam, MICRO, micro1, clockAt, fullFrame, follow } from './vig_town_kit.js';

const MIC_AT = [3.5, -1.8], ENG = 'eng', ENG_AT = [1.45, -0.95];
// Dex, the house engineer: hoodie, round glasses, earmuffs that pass for cans
const ENG_LOOK = { name: 'Dex', body: 'boy', skin: '#8f5632', hair: { style: 'fadewave', color: '#1a1420' }, eyes: { style: 'sleepy', color: '#4a2c1a' }, brows: 'thick', facial: 'stubble',
  top: { id: 'hoodiebig', color: '#3a3560', color2: '#ff3ea5' }, bottom: { id: 'jeans', color: '#17141f' }, shoes: { id: 'retro', color: '#f7f2e8' }, hat: { id: 'headphonehat', color: '#ff3ea5' },
  glasses: { id: 'round', color: '#17141f' }, acc: { neck: { id: 'none_neck' }, hand: { id: 'none_hand' } } };
// the camera set: the booth through the open door (wide), the profile at the pop filter (close), Dex at the glass with the booth behind him (two shot), the ON AIR sign
const BOOTH_WIDE = (o) => cam([2.55, 1.95, 1.75], [3.15, 1.12, -1.8], 40, o);
const POP_CU = (o) => cam([3.65, 1.65, -0.62], [3.1, 1.05, -1.85], 68, o);
const GLASS_TWO = (o) => cam([-1.7, 2.4, 2.6], [2.3, 1.05, -1.5], 50, o);
const ON_AIR = (o) => cam([2.55, 1.75, -1.15], [3.45, 2.2, -3.46], 42, o);
const rec = (ctx, on) => call(() => { try { const t = ctx.world.terrain; if (t && t.setRec) t.setRec(!!on); } catch (e) { /* ignore */ } });
const beatW = (ctx, v) => call(() => { try { if (ctx.world.setBeat) ctx.world.setBeat(v); } catch (e) { /* ignore */ } });
// put the room back: the REC lamp and ON AIR as they were
function keepRec(ctx) { let was = false; try { const t = ctx.world.terrain; was = !!(t && t.isRec && t.isRec()); } catch (e) { /* ignore */ } ctx.own(() => { try { const t = ctx.world.terrain; if (t && t.setRec) t.setRec(was); } catch (e) { /* ignore */ } }); }
function dex(R, ctx, at, faceDeg, clipName, opts) { R.at(0, cue('spawn', { id: ENG, look: ENG_LOOK, at: at || ENG_AT, face: faceDeg === undefined ? 95 : faceDeg, clip: clipName || 'idle', opts: opts || {} })); }
function atMic(R, t) { R.at(t, place(H, MIC_AT, -90)); }
// the cans: on the head bone, a band over the hair
function cans(ctx, R, t, r) { R.at(t, spawn(ctx, r, headphones, [MIC_AT[0], 1.6, MIC_AT[1]]), follow(ctx, r, H, 'head', [0, 0.36, 0.02])); }

// ======================================================================= IDLE TRAINING at the condenser (the bookend before the session ticks)
function idleIn(ctx, stat) {
  const f = ctx.form, R = reel(), nb = ref(), hp = ref(), first = f === 'first';
  if (MICRO(f)) { R.at(0, clip(H, stat === 'show' ? 'v_guns' : stat === 'ori' ? 'point' : 'beatbox', { bpm: 96 })).at(0.4, drum('K')).at(0.5, ctx.PAY).end(0.9); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  keepRec(ctx); R.at(0, fullFrame(ctx)); dex(R, ctx); atMic(R, 0);
  let t = 0;
  if (f !== 'short') {
    // 1 through the glass: Dex leans on the talkback, the booth waits. The ON AIR sign hits on the downbeat
    R.at(0, GLASS_TWO({ to: { pos: [-1.35, 2.12, 2.1] }, dur: 1.8 }), clip(ENG, 'v_count', { bpm: 100, n: first ? 4 : 2 }), clip(H, 'v_micup', { eyes: false }), mood(ENG, 'happy'));
    if (first) R.at(0.15, say(ENG, 'Rolling. Take one.', { dur: 1.3, name: 'DEX', color: '#ff3ea5' }));
    (first ? [0, 1, 2, 3] : [0, 1]).forEach((i) => R.at(0.2 + i * BEAT, drum('t', { vel: 0.4 }), word(String(i + 1), [0.66, 0.36], { size: 4.4, color: '#2ee6ff', ms: 360 })));
    t = 0.2 + (first ? 4 : 2) * BEAT;
    R.at(t, rec(ctx, true), drum('K'), cue('pulse', { v: 1 }), BOOTH_WIDE(xf(200)), word('ON AIR', [0.5, 0.3], { size: 3.4, color: '#ff3a5c', ms: 600 }));
    t += 0.6;
  } else R.at(0, rec(ctx, true));
  // 2 at the pop filter (the profile, close): what this skill sounds like in a real booth
  R.at(t, POP_CU(f === 'short' ? {} : xf(240)));
  if (stat === 'mus') {
    cans(ctx, R, t, hp);
    R.at(t, clip(H, 'v_micup', { eyes: true }), mood(H, 'happy'));
    [60, 62, 64, 65, 67].forEach((m, i) => R.at(t + 0.15 + i * 0.22, call(() => ctx.note(m, 0.3, { timbre: 'flute', vel: 0.3 })), beatW(ctx, 0.6)));
    R.at(t + 0.2, word('do re mi', 'hero:top', { size: 3, color: '#2ee6ff', ms: 1000 }));
  } else if (stat === 'tech') {
    R.at(t, cue('beat', { who: H, pattern: f === 'short' ? 'B t K t' : 'B t K t B B K t', bpm: 110, step: 0.5, rings: true }), mood(H, 'angry'));
    for (let i = 0; i < (f === 'short' ? 2 : 4); i++) R.at(t + i * 0.55, beatW(ctx, 1));
  } else if (stat === 'ori') {
    R.at(t, clip(H, 'v_hold', { y: 0.98, z: 0.3, look: 1 }), spawn(ctx, nb, notebook, [MIC_AT[0], 1, MIC_AT[1]]), hold(ctx, nb, H, { aim: 'face' }), sfx('click', { pitch: 2, quiet: true }));
    R.at(t + 0.5, word('B t ? K', [0.5, 0.58], { size: 3.6, color: '#ff5cb0', ms: 1100 }), drum('t', { vel: 0.5 }));
  } else {
    // showmanship in a two by three metre booth: the move hits the glass, Dex winces
    R.at(t, clip(H, 'dance', { bpm: 108 }), mood(H, 'happy'), BOOTH_WIDE(f === 'short' ? {} : xf(220)));
    R.at(t + 0.75, drum('K'), cue('shake', { amp: 0.04, dur: 0.3 }), word('bonk', [0.36, 0.42], { size: 3.2, color: '#fff6e8', ms: 500 }));
    if (f !== 'short') R.at(t + 1.0, GLASS_TWO(xf(200)), mood(ENG, 'sad'), clip(ENG, 'v_no', { n: 2 }));
  }
  const T = t + (f === 'short' ? 0.9 : 1.6);
  if (f === 'first' && stat !== 'show') R.at(T - 0.5, GLASS_TWO(xf(240)), clip(ENG, 'v_thumb'), mood(ENG, 'happy'));
  R.at(T - 0.3, ctx.PAY).end(T + (first ? 0.4 : 0.1));
  return { events: R.list() };
}

// ======================================================================= the TRAINING GAMES and the mixer tools: lead ins that end on a beat for the game's first frame
function gameIn(ctx, game) {
  const f = ctx.form, R = reel(), hp = ref(), first = f === 'first';
  if (game === 'make') return padsIn(ctx);
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 100 })).at(0.3, drum('K'), ctx.PAY).end(0.6); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  keepRec(ctx); R.at(0, fullFrame(ctx)); dex(R, ctx); atMic(R, 0);
  if (game === 'ear') {
    // the cans go on; Dex plays two notes from the desk: higher or lower?
    cans(ctx, R, 0.15, hp);
    R.at(0, POP_CU({ to: { pos: [3.25, 1.4, -0.9] }, dur: 1.6 }), clip(H, 'v_micup', { eyes: false }), sfx('click', { pitch: 0.8 }));
    R.at(0.5, call(() => ctx.note(64, 0.3, { timbre: 'keys', vel: 0.35 }))).at(0.8, call(() => ctx.note(67, 0.3, { timbre: 'keys', vel: 0.35 })), word('?', [0.6, 0.35], { size: 5, color: '#2ee6ff', ms: 800 }));
  } else if (game === 'tune') {
    // check, check into the condenser; the needles kick; Dex: thumbs up
    R.at(0, POP_CU(), clip(H, 'beatbox', { bpm: 100, amp: 0.4 }));
    [0, 1].forEach((i) => R.at(0.3 + i * BEAT * 0.75, drum('B'), beatW(ctx, 1), word('check', [0.36 + i * 0.26, 0.4 - i * 0.04], { size: 3, color: '#fff6e8', ms: 500 })));
    R.at(1.0, GLASS_TWO(xf(200)), clip(ENG, 'v_thumb'), mood(ENG, 'happy'));
  } else if (game === 'beat') {
    // the count in through the glass, one finger per beat
    R.at(0, GLASS_TWO(), clip(ENG, 'v_count', { bpm: 100, n: 4 }), clip(H, 'v_micup', { eyes: false }));
    ['1', '2', '3', '4'].forEach((n, i) => R.at(0.15 + i * BEAT, drum(i === 3 ? 'K' : 't'), beatW(ctx, i === 3 ? 1 : 0.5), word(n, [0.62, 0.38], { size: 6, color: '#ffd35c', ms: 300 })));
  } else if (game === 'pose') {
    // the booth becomes a stage for a second: a key light, the pose
    R.at(0, BOOTH_WIDE(), clip(H, 'v_stretch', { dur: 0.8 }));
    R.at(0.6, cue('cone', { id: 'key', at: [3.5, 2.6, -1.4], to: 'hero', color: '#fff1c9', r: 0.7, v: 1, ms: 150 }), drum('B'), clip(H, 'v_guns'), mood(H, 'happy'));
  } else if (game === 'record') {
    // the sound recorder: REC on the downbeat, the lean into the mic, one clean B
    R.at(0, GLASS_TWO(), clip(H, 'v_micup', { eyes: false }), clip(ENG, 'v_thumb'));
    R.at(0.5, rec(ctx, true), sfx('record'), stamp('REC|●', 800), drum('K', { vel: 0.5 }));
    R.at(0.8, POP_CU(xf(200)), clip(H, 'beatbox', { bpm: 96, amp: 0.6 })).at(1.0, drum('B'), word('B', 'hero:mouth', { size: 5, color: '#ffd35c', ms: 600 }), cue('fx', { kind: 'rings', at: 'hero:mouth', color: '#ff3ea5', n: 2 }), beatW(ctx, 1));
    if (first) R.at(1.5, mood(H, 'happy'), clip(H, 'cheer')).at(2.2, mood(H, 'neutral'), clip(H, 'beatbox', { bpm: 96, amp: 0.6 }), drum('B'), beatW(ctx, 1));
    const T = first ? 2.8 : 1.6; R.at(T - 0.3, stamp(''), ctx.PAY).end(T);
    return { events: R.list() };
  }
  const T = first ? 2.0 : 1.4; R.at(T - 0.25, ctx.PAY).end(T);
  return { events: R.list() };
}
// the beat maker at the MPC table: finger drums on the four lanes, the pads light in sequence, Dex nods along from the desk
const MPC = [0.67, 0.93, -1.43];
function padsIn(ctx) {
  const f = ctx.form, R = reel(), pd = ref();
  R.at(0, spawn(ctx, pd, () => { const g = pads(0.075); g.rotation.x = 0.2; return g; }, MPC));
  if (MICRO(f)) { R.at(0, call(() => pd.obj && pd.obj.userData.light(5, 1)), drum('B'), beatW(ctx, 1)).at(0.4, ctx.PAY).end(0.7); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  R.at(0, fullFrame(ctx)); dex(R, ctx, [-1.6, -0.75], 150, 'v_nod', { n: 8 });
  // the hero behind the table, facing the room; the pads between us
  R.at(0, place(H, [0.72, -2.08], 0), clip(H, 'v_scrub', { y: 0.9, bpm: 100, hum: false }), shot({ on: H, rel: false, yaw: 12, w: 1.7, h: 2.0, lookH: 0.95, fov: 40, to: { w: 1.45 }, dur: 1.8 }));
  [0, 5, 10, 15, 1, 6, 11, 12].forEach((p, i) => R.at(0.15 + i * 0.15, drum(['B', 't', 'K', 't'][i % 4], { vel: 0.7 }), beatW(ctx, i % 4 === 0 ? 1 : 0.5), call(() => { if (!pd.obj) return; for (let k = 0; k < 16; k++) pd.obj.userData.light(k, k === p ? 1 : 0.15); })));
  R.at(1.4, S('ms', 0, Object.assign({ h: 1.7, lookH: 1.1, w: 1.5 }, xf(220))), mood(H, 'happy'), call(() => { if (pd.obj) for (let k = 0; k < 16; k++) pd.obj.userData.light(k, 0.9); }), drum('K'), clip(H, 'v_nod', { n: 2 }));
  const T = f === 'first' ? 2.2 : 1.9; R.at(T - 0.3, ctx.PAY).end(T);
  return { events: R.list() };
}

// ======================================================================= QUICK PRACTICE in the booth (the clock runs +60, Dex taps his wrist)
const STAT_CLIP = { mus: 'talk', tech: 'battle', ori: 'point', show: 'dance' };
function quick(ctx) {
  const f = ctx.form, R = reel(), st = (ctx.action && ctx.action.stat) || 'tech', c = STAT_CLIP[st] || 'beatbox';
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 110 }), cue('beat', { who: H, pattern: 'B t K t', bpm: 120, step: 0.5 })).at(0.6, ctx.PAY).end(1.1); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  keepRec(ctx); R.at(0, fullFrame(ctx)); dex(R, ctx); atMic(R, 0);
  R.at(0, rec(ctx, true), clip(H, c, { bpm: 120 }), BOOTH_WIDE({ to: { pos: [2.6, 1.85, 1.3] }, dur: 1.3 }), cue('speed', { v: 1.9, ms: 200 }), stamp(clockAt(ctx, -60) + '|+60 MIN', 1200), cue('beat', { who: H, pattern: 'B t K t B t K t', bpm: 150, step: 0.5, clip: false }));
  for (let i = 0; i < 4; i++) R.at(0.1 + i * 0.3, beatW(ctx, 1));
  R.at(1.25, cue('speed', { v: 1, ms: 200 }), stamp(''), ctx.PAY, GLASS_TWO(xf(220)), clip(ENG, 'v_pat', { y: 0.95, z: 0.3, x: -0.05, n: 2 }), word('time', [0.64, 0.4], { size: 3, color: '#ffd35c', ms: 600 }), drum('K'));
  R.at(1.8, clip(H, 'v_nod', { n: 1, deep: true })).end(f === 'short' ? 2.2 : 2.6);
  return { events: R.list() };
}

// ======================================================================= THE JUKEBOX (MICRO, a bar of the new track): a nod; the pigeon bob for Pigeon Pluck, snaps on 2 and 4 for Thrift Jazz
function jukebox(ctx) {
  const tr = (ctx.extra && ctx.extra.track) || '', R = reel();
  if (tr === 'park') R.at(0, clip(H, 'v_bob', { bpm: 104 })).at(0.15, word('coo', 'hero:top', { size: 3, color: '#c9c3dd', ms: 500 }));
  else if (tr === 'shop') { R.at(0, clip(H, 'v_snap', { bpm: 92 })); [0.65].forEach((t) => R.at(t, drum('t', { vel: 0.4, pulse: false }))); }
  else if (tr === 'battle') R.at(0, clip(H, 'battle', { bpm: 120 }));
  else R.at(0, clip(H, 'v_nod', { n: 2 }));
  R.at(0.4, ctx.PAY).end(0.8);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}

// ======================================================================= REFUSALS (MICRO): the studio fee, too tired, too late
const REFUSALS = {
  'p1.refuse.cash': (ctx) => micro1(ctx, 'v_pockets', {}, [[0.6, word('$15?', 'hero:top', { size: 3, color: '#c9c3dd', ms: 500 })], [0.9, cue('fx', { kind: 'sparks', at: 'hero:head', color: '#c9b9a0', n: 6 })]], 1.3),
  'p1.refuse.tired': (ctx) => micro1(ctx, 'v_yawn', {}, [[0.55, drum('t', { vel: 0.4 }), word('yawn', 'hero:mouth', { size: 3, color: '#c9c3dd', ms: 500 })]], 1.2),
  'p1.refuse.late': (ctx) => micro1(ctx, 'v_yawn', {}, [[0.5, word('bed', 'hero:top', { size: 3, color: '#2ee6ff', ms: 600 })]], 1.1),
};

export const VIGNETTES = Object.assign({
  'p1.train.idle.mus': (c) => idleIn(c, 'mus'), 'p1.train.idle.tech': (c) => idleIn(c, 'tech'), 'p1.train.idle.ori': (c) => idleIn(c, 'ori'), 'p1.train.idle.show': (c) => idleIn(c, 'show'),
  'p1.train.play.ear': (c) => gameIn(c, 'ear'), 'p1.train.play.tune': (c) => gameIn(c, 'tune'), 'p1.train.play.beat': (c) => gameIn(c, 'beat'), 'p1.train.play.make': (c) => gameIn(c, 'make'), 'p1.train.play.pose': (c) => gameIn(c, 'pose'),
  'p1.beatmaker.in': padsIn, 'p1.record.in': (c) => gameIn(c, 'record'), 'p1.tune.in': (c) => gameIn(c, 'tune'),
  'p1.train.quick': quick, 'p3.jukebox.lab': jukebox,
}, REFUSALS);
export const WORLD = 'lab';
void THREE; void ON_AIR; void face; void look; void gone; void withProp; void anim; void glowBall; void phone;
