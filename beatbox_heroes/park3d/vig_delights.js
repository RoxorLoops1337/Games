// VIGNETTES: DELIGHTS (owner VIG delights crew). The P3 moments of VIGNETTES.md section 4: small, rare, unasked for. Nobody presses a button for these: the
// DELIGHTS section at the end of r3/vig.js plays them when the hero has stood still for a while and the place is quiet (no story film, no vignette, no milestone
// waiting, no menu or dialog), at most one every few minutes, never on SCENES: OFF, and any touch or key hands back at once (the touch goes on to the game).
// Like the milestones this module is not a world: its table is the last link of every world's table (world -> milestones -> delights), so V.has and V.play find
// the ids anywhere; a reel that belongs to one world returns null elsewhere (no scene, nothing lands). Nothing here pays: PAY only marks the end of the beat.
//   anywhere   p3.growl (hunger < 22: the stomach is a kick drum, the mouth answers with the snare), p3.yawn (energy < 22: a yawn that becomes an Inward K),
//              p3.idle.beat (a long idle: "boots and cats" under the breath, or the mic check every jam starts with), p3.late.warning (01:30: the body files a complaint)
//   home       p3.idle.flat (by the clock: the morning hum, an afternoon vocal scratch, dancing alone at night, the whispered beat after 23:00), p3.week.one (day 8:
//              Foxy's cupcake, the candle goes out on a Pf snare), p3.weekend (Saturday morning: "battle night")
//   park       p3.fountain.coin (a coin into the fountain on the beat, the splash is the snare), p3.pigeon (the ringed regular bobs to the hero's groove, his coo
//              lands on the backbeat), p3.sunset (golden hour: the hero frames the sun with a hand, the shutter), p3.closing.park (19:45: the lamps click on in four)
//   bar        p3.closing.bar (01:45: Rohzel flicks the lights twice), p3.egg.both (singing and drumming at once, the old masters' trick: the hero chokes)
// Staging: the milestones' lens on the gameplay camera's line (frameOf / L, full figure 5.6 m out at 40 degrees, a medium at 4.2 m at the closest), so a delight
// never jumps the hero to a set; the hero stays on the mark. Every id has a MICRO (one clip in the gameplay camera, under 1.5 s).
import { THREE } from './kit.js';
import { cue, clip, place, face, look, mood, sfx, drum, word, say, stamp, call, ref, spawn, hold, gone, anim, BEAT } from './vignette_kit.js';
import { mat, glowBall } from './vignette_props.js';
import { coin, pigeon } from './vig_park_props.js';
import { H, reel, MICRO } from './vig_town_kit.js';
import { frameOf, L, turn, lensPt, freeSide, anywhere, ptAt, hasFoxy } from './vig_milestones.js';
import './vig_park_clips.js';

const D2R = Math.PI / 180;
const has = (ctx, s) => !!(ctx.ch && Array.isArray(ctx.ch.sounds) && ctx.ch.sounds.indexOf(s) >= 0);
const hhmm = (ctx) => { const m = ((((ctx.ch ? ctx.ch.minutes : 0) + 360) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
// the variant: ctx.extra.v wins (tests, the shot tool), else the seeded pick
const vOf = (ctx, n) => (ctx.extra && ctx.extra.v !== undefined ? +ctx.extra.v % n : ctx.pick(n));
// MICRO: one clip in the gameplay camera, a word over the head, one or two drums, out (about 1 s)
function m1(ctx, clipName, opts, text, color, drums) {
  const R = reel();
  R.at(0, clip(H, clipName, opts || {}), text ? word(text, 'hero:top', { size: 3.2, color: color || '#ffd35c', ms: 800 }) : null);
  (drums || [['B', 0]]).forEach(([d, t, v]) => R.at(t || 0, drum(d, { vel: v || 0.7 })));
  R.at(0.5, ctx.PAY).end(1.0);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}
// the out: a beat after the last moment
const out = (R, t, f) => R.end(t + (f === 'short' ? 0.25 : 0.5));

// ======================================================================= ANYWHERE (hunger, energy, the clock, an idle beat)
// p3.growl: the stomach growls; it is a kick drum. The hero looks down, looks at us, answers with the snare: a bar of stomach and mouth
function growl(ctx) {
  const f = ctx.form, F = frameOf(ctx);
  if (MICRO(f)) return m1(ctx, 'v_hold', { y: 0.82, z: 0.22, look: 1 }, 'grrr', '#ffb067', [['B', 0, 1], ['K', 0.45, 0.6]]);
  const R = reel(), short = f === 'short';
  R.at(0, turn(F, 0), clip(H, 'v_hold', { y: 0.82, z: 0.22, look: 1 }), L(ctx, F, 'fs', { to: { d: 5.0 }, dur: 3.2 }));
  let t = short ? 0.1 : 0.45;
  R.at(t, drum('B', { vel: 1 }), word('grrr', 'hero', { size: 3.2, color: '#ffb067', ms: 700 }), cue('shake', { amp: 0.012, dur: 0.2 }));
  if (!short) { R.at(t + 0.75, clip(H, 'idle'), look(H, lensPt(F)), mood(H, 'shout')).at(t + 1.2, drum('B', { vel: 1 }), word('grrr', 'hero', { size: 3, color: '#ffb067', ms: 600 })); t += 1.6; }
  R.at(t, look(H, null), mood(H, 'happy'), drum('K'), word('K!', 'hero:mouth', { size: 3.4, color: '#2ee6ff', ms: 600 }), clip(H, 'beatbox', { bpm: 100 }));
  R.at(t + 0.3, cue('beat', { who: H, pattern: 'B . K . B B K .', bpm: 100, step: 0.5, rings: true, vel: 0.7 }));
  t += 0.3 + 8 * BEAT * 0.5;
  R.at(t, clip(H, 'v_shrug'), ctx.PAY);
  if (f === 'first') R.at(t, say(null, 'The stomach keeps better time than you do. Feed the drummer.', { dur: 2.2 }));
  else if (f === 'full') R.at(t, say(null, ['Feed the drummer.', 'Somebody is hungry. It is the kick.', 'Four on the floor. One in the belly.'][vOf(ctx, 3)], { dur: 1.5 }));
  return { events: out(R, t + (f === 'first' ? 2.0 : short ? 0.6 : 1.4), f).list() };
}
// p3.yawn: a yawn; with the Inward K unlocked, the gasp at the top of it IS the Inward K (the hero freezes: did that just happen?) and two bars follow
function yawn(ctx) {
  const f = ctx.form, F = frameOf(ctx), ik = has(ctx, 'IK');
  if (MICRO(f)) return m1(ctx, 'v_yawn', {}, ik ? 'hk!' : 'haaah', '#cfe8ff', [[ik ? 'IK' : 't', 0.5, 0.6]]);
  const R = reel(), short = f === 'short';
  R.at(0, turn(F, 0), clip(H, 'v_yawn'), L(ctx, F, 'fs', { to: { d: 5.0 }, dur: 3 }), mood(H, 'sad'));
  let t = 0.6;
  if (ik) {
    R.at(t, drum('IK', { vel: 0.9 }), word('hk!', 'hero:mouth', { size: 3.4, color: '#cfe8ff', ms: 700 }));
    if (!short) { R.at(t + 0.4, clip(H, 'idle'), mood(H, 'shout'), look(H, lensPt(F)), cue('speed', { v: 0.4, ms: 120 })).at(t + 1.1, cue('speed', { v: 1, ms: 200 }), look(H, null)); t += 1.2; }
    R.at(t + 0.1, mood(H, 'happy'), clip(H, 'beatbox', { bpm: 100 }), cue('beat', { who: H, pattern: 'B IK B IK', bpm: 100, step: 0.5, rings: true }));
    t += 0.1 + 4 * BEAT * 0.5;
  } else {
    R.at(t, drum('t', { vel: 0.3 }), word('haaah', 'hero:top', { size: 3, color: '#cfe8ff', ms: 900 }));
    R.at(t + (short ? 0.4 : 0.9), clip(H, 'v_nod', { n: 1, deep: true })); t += short ? 0.9 : 1.6;
  }
  R.at(t, ctx.PAY);
  if (f === 'first') R.at(t, say(null, ik ? 'Out of air, a gasp in. Even the yawns are drums now.' : 'Energy low. A nap would be a good idea.', { dur: 2.0 }));
  return { events: out(R, t + (f === 'first' ? 1.9 : 0.4), f).list() };
}
// p3.idle.beat: standing around too long, the mouth starts on its own. A: "boots and cats", the phrase every beatboxer learned first. B: the mic check every jam starts with.
// The hero catches us watching. (FIRST and FULL rotate: the seeded pick, never the same twice in a row on one day)
function idleBeat(ctx) {
  const f = ctx.form, F = frameOf(ctx), v = vOf(ctx, 2);
  if (MICRO(f)) return m1(ctx, 'beatbox', { bpm: 100 }, v ? 'one two' : 'boots & cats', '#2ee6ff', [['B', 0, 0.5], ['K', 0.6, 0.5]]);
  const R = reel(), short = f === 'short';
  R.at(0, turn(F, 0, 15), clip(H, v ? 'v_micup' : 'beatbox', { bpm: 100 }), L(ctx, F, 'fs', { side: 0.3, to: { d: 4.8, side: 0.15 }, dur: 4 }));
  let t = 0.25;
  if (!v) {
    const W = ['boots', 'and', 'cats', 'and'], D = ['B', 't', 'K', 't'], n = short ? 4 : 8;
    for (let i = 0; i < n; i++) R.at(t + i * BEAT * 0.5, drum(D[i % 4], { vel: 0.45 }), word(W[i % 4], 'hero:top', { size: 2.8 + (i % 4 === 2 ? 0.5 : 0), color: i % 4 === 2 ? '#ff3ea5' : '#2ee6ff', ms: 420 }));
    t += n * BEAT * 0.5;
  } else {
    R.at(t, drum('t', { vel: 0.5 }), word('tk', 'hero:mouth', { size: 2.6, color: '#c9c3dd', ms: 400 })).at(t + BEAT * 0.5, drum('t', { vel: 0.5 }), word('tk', 'hero:mouth', { size: 2.6, color: '#c9c3dd', ms: 400 }));
    R.at(t + BEAT * 1.2, word('one two', 'hero:top', { size: 3, color: '#2ee6ff', ms: 700 }), drum('B', { vel: 0.5 }));
    if (!short) R.at(t + BEAT * 2.4, word('one two', 'hero:top', { size: 3, color: '#2ee6ff', ms: 700 }), drum('K', { vel: 0.5 }));
    t += short ? BEAT * 2.2 : BEAT * 3.6;
  }
  // caught: the hero sees the lens, the shrug, the grin
  R.at(t, clip(H, 'v_shrug'), look(H, lensPt(F)), mood(H, 'happy'), ctx.PAY);
  if (f === 'first') R.at(t + 0.2, say(null, v ? 'Mic check. Every jam on earth starts with these two words.' : 'Boots and cats. Every beatboxer on earth started here.', { dur: 2.0 }));
  return { events: out(R, t + (f === 'first' ? 2.0 : short ? 0.5 : 0.9), f).list() };
}
// p3.late.warning: 01:30 anywhere. The lens drifts like a tired head, the eyelids go, the head drops, a jerk awake on the snare. The clock in the corner: two o'clock is the floor.
function lateWarning(ctx) {
  const f = ctx.form, F = frameOf(ctx);
  if (MICRO(f)) return m1(ctx, 'v_nod', { n: 1, deep: true }, 'zz', '#c9c3dd', [['t', 0, 0.3], ['K', 0.7, 0.6]]);
  const R = reel(), short = f === 'short';
  R.at(0, turn(F, 0), clip(H, 'idle'), mood(H, 'sad'), Object.assign(L(ctx, F, 'fs', { to: { d: 5.0, side: 0.2 }, dur: 3.5 }), { hand: 0.05 }), stamp(hhmm(ctx) + '|LATE', short ? 1300 : 2600), cue('vignette', { v: 0.8, ms: 600 }));
  let t = short ? 0.2 : 0.7;
  R.at(t, clip(H, 'v_nod', { n: 1, deep: true }), cue('blur', { px: 3, ms: 500 }));
  t += short ? 0.7 : 1.1;
  R.at(t, clip(H, 'idle'), mood(H, 'shout'), drum('K', { vel: 0.8 }), word('!', 'hero:top', { size: 3.6, color: '#ff4f6a', ms: 500 }), cue('blur', { px: 0, ms: 200 }), cue('vignette', { v: 0.3, ms: 300 }), ctx.PAY);
  if (f !== 'short') R.at(t + 0.3, say(null, f === 'first' ? 'Half past one. At two the body decides for you. Home, bed.' : 'Bed. Before the floor picks you.', { dur: 1.8 }));
  R.at(t + (short ? 0.4 : 1.6), cue('vignette', { v: 0, ms: 400 }));
  return { events: out(R, t + (f === 'first' ? 2.0 : short ? 0.5 : 1.7), f).list() };
}

// ======================================================================= HOME (the flat)
// p3.idle.flat by the clock: morning (5 to 11) the first sound of the day is a hum; afternoon a vocal scratch on an imaginary deck; evening dancing alone; after 23:00
// the whispered beat (Foxy is asleep). In place, full figure: the flat is small, the lens stays on the gameplay line
const FLAT_PART = (h) => (h >= 5 && h < 11 ? 0 : h >= 11 && h < 18 ? 1 : h >= 18 && h < 23 ? 2 : 3);
function idleFlat(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'flat') return null;
  const F = frameOf(ctx), p = ctx.extra && ctx.extra.part !== undefined ? ctx.extra.part : FLAT_PART(ctx.hour), short = f === 'short';
  if (MICRO(f)) return m1(ctx, ['v_stretch', 'v_reach', 'dance', 'beatbox'][p], p === 1 ? { to: [0.15, 1.0, 0.45], hold: 0.2 } : { bpm: 100 }, ['mmm', 'wikka', 'step', 'shh'][p], ['#ffd35c', '#ff3ea5', '#9dff4a', '#c9c3dd'][p], [[p === 3 ? 't' : 'B', 0, p === 3 ? 0.25 : 0.6]]);
  const R = reel(); let t = 0.2, line = '';
  if (p === 0) {
    R.at(0, turn(F, 0, 25), clip(H, 'v_stretch'), L(ctx, F, 'fs', { to: { d: 5.0 }, dur: 3.4 }), mood(H, 'sad'));
    [64, 67, 69, 67].forEach((n, i) => R.at(0.5 + i * BEAT * 0.6, call(() => ctx.note(n, 0.32, { timbre: 'flute', vel: 0.25 })), word('m', 'hero:mouth', { size: 2.4 + i * 0.2, color: '#ffd35c', ms: 380 })));
    R.at(1.9, clip(H, 'idle'), mood(H, 'happy'), drum('B', { vel: 0.5 })); t = short ? 1.7 : 2.3; line = 'The first sound of the day is always a hum.';
  } else if (p === 1) {
    R.at(0, turn(F, 0, -20), clip(H, 'idle'), L(ctx, F, 'fs', { side: 0.3, to: { d: 4.8 }, dur: 3.4 }));
    for (let i = 0; i < (short ? 2 : 4); i++) R.at(0.2 + i * BEAT * 0.5, clip(H, 'v_reach', { to: [0.15, 1.0, 0.45], hold: 0.05 }), sfx('whoosh', { pitch: i % 2 ? 0.8 : 1.6, quiet: true }), drum(i % 2 ? 'K' : 't', { vel: 0.45 }), word('wikka', 'hero:top', { size: 2.8, color: '#ff3ea5', ms: 380 }));
    t = 0.2 + (short ? 2 : 4) * BEAT * 0.5 + 0.2; R.at(t - 0.1, clip(H, 'v_guns'), mood(H, 'happy')); line = 'A vocal scratch on an imaginary deck. Nobody heard. Good.';
  } else if (p === 2) {
    R.at(0, clip(H, 'dance', { bpm: 100 }), L(ctx, F, 'wide', { to: { d: 6.4 }, dur: 4 }), mood(H, 'happy'), cue('beat', { pattern: 'B t K t B B K t', bpm: 100, step: 0.5, pulse: true, vel: 0.4 }));
    t = short ? 1.6 : 2.6; line = 'Dancing alone counts. It is called practice.';
  } else {
    R.at(0, turn(F, 0), clip(H, 'beatbox', { bpm: 92 }), L(ctx, F, 'fs', { to: { d: 5.0 }, dur: 3.4 }), cue('vignette', { v: 0.45, ms: 500 }));
    ['B', 't', 'K', 't', 'B', 'B', 'K', 't'].slice(0, short ? 4 : 8).forEach((d, i) => R.at(0.2 + i * 60 / 92 * 0.5, drum(d, { vel: 0.22 })));
    R.at(0.5, word('shh', 'hero:top', { size: 2.6, color: '#c9c3dd', ms: 700 }));
    t = short ? 1.5 : 2.8; R.at(t - 0.2, clip(H, 'v_nod', { n: 1 }), cue('vignette', { v: 0, ms: 500 })); line = 'shh. foxy is asleep.';
  }
  R.at(t, ctx.PAY);
  if (!short) R.at(t, say(null, line, { dur: f === 'first' ? 2.0 : 1.5 }));
  return { events: out(R, t + (f === 'first' ? 1.9 : short ? 0.3 : 1.4), f).list() };
}
// Foxy beside the hero on the free side (the flat's own Foxy, shown for the scene and hidden again by the engine, or a stand in)
function foxyBy(ctx, R, F, fwd, dist) {
  const fs = freeSide(ctx, F, fwd, dist), fid = hasFoxy(ctx) ? 'foxy' : 'foxyS', fc = Math.atan2(F.x + F.dx * 2.2 - fs.at[0], F.z + F.dz * 2.2 - fs.at[1]) / D2R;   // 3/4 to the lens, the eyes on the hero
  if (fid === 'foxy') R.at(0, place('foxy', fs.at, fc), cue('show', { who: 'foxy', v: true }), clip('foxy', 'idle')); else R.at(0, cue('spawn', { id: 'foxyS', look: 'foxy', at: fs.at, face: fc }));
  return { id: fid, at: fs.at, s: fs.s };
}
// the cupcake with one candle (origin = the bottom of the cup)
function cupcake() {
  const g = new THREE.Group(); g.name = 'vig_cupcake';
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.036, 0.05, 10), mat('#ff6ec7')); cup.position.y = 0.025; g.add(cup);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#fff1e0')); top.position.y = 0.05; g.add(top);
  const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 6), mat('#2ee6ff')); cd.position.y = 0.13; g.add(cd);
  const fl = glowBall('#ffcf7a', 0.05); fl.position.y = 0.175; fl.userData.setV(1); g.add(fl);
  g.userData.blow = () => fl.userData.setV(0); g.userData.dispose = () => fl.userData.dispose();
  g.scale.setScalar(2.4); return g;
}
// p3.week.one: day 8. Foxy, a cupcake with one candle. The held beat, then the line. The candle goes out on a Pf snare.
function weekOne(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'flat') return null;
  const F = frameOf(ctx), cc = ref(), short = f === 'short';
  if (MICRO(f)) return m1(ctx, 'cheer', {}, 'ONE WEEK', '#ffd35c', [['B', 0, 0.7], ['K', 0.4, 0.7]]);
  const R = reel(), fx = foxyBy(ctx, R, F, 0.3, 1.0);
  R.at(0, turn(F, 0, -fx.s * 25), clip(H, 'idle'), L(ctx, F, 'fs', { mid: fx.at, d: 6.4, to: { d: 6.0 }, dur: 4 }), spawn(ctx, cc, cupcake, [fx.at[0], F.y + 1.1, fx.at[1]]), hold(ctx, cc, fx.id, { aim: 'up', tilt: 0 }),
    clip(fx.id, 'v_hold', { y: 1.2, z: 0.4, x: 0.1, look: 0 }), look(fx.id, 'hero:head'));
  let t = short ? 0.6 : 1.4;
  if (!short) { R.at(0.4, look(H, fx.id + ':head')); R.at(t, say(fx.id, 'one week.', { name: 'FOXY', color: '#9dff4a', dur: 1.2 })); t += 1.3; R.at(t, say(fx.id, 'you did not quit.', { name: 'FOXY', color: '#9dff4a', dur: 1.6 })); t += 1.8; }
  // the Pf: the candle goes out on the snare
  R.at(t, drum('K', { vel: 0.9 }), word('pf', 'hero:mouth', { size: 3, color: '#fff6e8', ms: 500 }), call(() => cc.obj && cc.obj.userData.blow()), mood(H, 'happy'), mood(fx.id, 'happy'));
  R.at(t + 0.4, cue('title', { style: 'card', text: 'ONE WEEK', sub: 'still here', at: 'top' }), clip(H, 'cheer'), ctx.PAY);
  R.at(t + (short ? 1.0 : 1.9), cue('untitle', { ms: 300 }));
  return { events: out(R, t + (short ? 1.1 : 2.1), f).list() };
}
// p3.weekend: Saturday morning. Foxy, two fingers at the hero: battle night. The hero gives it back.
function weekend(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'flat') return null;
  const F = frameOf(ctx), short = f === 'short';
  if (MICRO(f)) return m1(ctx, 'v_guns', {}, 'SATURDAY', '#ff3ea5', [['B', 0, 0.7], ['K', 0.45, 0.7]]);
  const R = reel(), fx = foxyBy(ctx, R, F, 0.4, 1.1);
  R.at(0, turn(F, 0, -fx.s * 20), clip(H, 'idle'), L(ctx, F, 'fs', { mid: fx.at, d: 6.4, to: { d: 6.0 }, dur: 3.5 }), look(fx.id, 'hero:head'));
  let t = short ? 0.3 : 0.6;
  R.at(t, clip(fx.id, 'v_guns'), drum('B'), drum('K', { vel: 0.5 }), say(fx.id, 'saturday. battle night.', { name: 'FOXY', color: '#9dff4a', dur: 1.5 }));
  t += short ? 0.9 : 1.6;
  R.at(t, face(H, fx.id, 300), clip(H, 'v_guns'), mood(H, 'happy'), drum('K'), ctx.PAY);
  if (f === 'first') R.at(t + 0.6, say(null, 'The bar runs battles on weekends. The ladder is waiting.', { dur: 1.9 }));
  return { events: out(R, t + (f === 'first' ? 2.1 : short ? 0.6 : 1.0), f).list() };
}

// ======================================================================= THE PARK
// p3.fountain.coin: a coin into the fountain on the beat (presentation only: the coin is imaginary, Core never sees it). The splash is the snare.
const fountainOf = (ctx) => { const a = ctx.A && ctx.A.fountain; return a ? { x: a.x, z: a.z, r: a.radius || 4 } : { x: 0, z: 0, r: 4.15 }; };
function fountainCoin(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'park') return null;
  if (MICRO(f)) return m1(ctx, 'v_throw', { at: 0.3 }, 'plink', '#ffd35c', [['t', 0.3, 0.5], ['K', 0.8, 0.6]]);
  const F = frameOf(ctx), Fo = fountainOf(ctx), dx = F.x - Fo.x, dz = F.z - Fo.z, dd = Math.max(0.5, Math.hypot(dx, dz)), k = Math.min(dd - 0.5, Fo.r * 0.55) / dd;
  const tgt = [Fo.x + dx * k, F.y + 0.5, Fo.z + dz * k], fc = Math.atan2(tgt[0] - F.x, tgt[2] - F.z) / D2R, cn = ref(), R = reel(), short = f === 'short';
  const from = [F.x + (tgt[0] - F.x) / dd * 0.3, F.y + 1.5, F.z + (tgt[2] - F.z) / dd * 0.3];
  R.at(0, face(H, fc, 350), clip(H, 'idle'), L(ctx, F, 'wide', { side: 0.5, to: { d: 6.6, side: 0.4 }, dur: 4 }));
  let t = short ? 0.2 : 0.6;
  if (!short) R.at(0.3, clip(H, 'v_hold', { y: 1.15, z: 0.3, look: 1 }), sfx('coin', { pitch: 1.3, quiet: true }));
  R.at(t, clip(H, 'v_throw', { at: 0.3 }));
  const tr = t + 0.3, fly = 0.9;
  R.at(tr, spawn(ctx, cn, () => { const c = coin(); c.scale.multiplyScalar(2.2); return c; }, from), drum('t', { vel: 0.5 }), sfx('coin', { pitch: 1.5 }),
    anim(ctx, (T) => { const o = cn.obj; if (!o) return; const u = Math.min(1, T / fly); o.position.set(from[0] + (tgt[0] - from[0]) * u, from[1] + (tgt[1] - from[1]) * u + Math.sin(u * Math.PI) * 1.4, from[2] + (tgt[2] - from[2]) * u); o.rotation.x = T * 18; o.visible = u < 1; }));
  R.at(tr + fly, drum('K'), cue('fx', { kind: 'ripple', at: tgt, color: '#bfefff', n: 2 }), word('plink', [0.5, 0.36], { size: 3, color: '#bfefff', ms: 600 }));
  t = tr + fly + 0.3;
  R.at(t, face(H, F.face, 400), clip(H, 'v_nod', { n: 1 }), mood(H, 'happy'), ctx.PAY);
  if (f !== 'short') R.at(t + 0.2, say(null, f === 'first' ? 'A wish. The coin was imaginary. The wish was not.' : ['Same wish as last time.', 'A wish on the backbeat.'][vOf(ctx, 2)], { dur: 1.8 }));
  return { events: out(R, t + (f === 'first' ? 2.0 : short ? 0.4 : 1.6), f).list() };
}
// p3.pigeon: the ringed pigeon from the bench (a regular now) lands by the hero's feet; the hero tries a groove on it, it bobs on the beat, and its coo lands on the backbeat
function pigeonScene(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'park') return null;
  if (MICRO(f)) return m1(ctx, 'v_nod', { n: 2 }, 'coo', '#c9c3dd', [['B', 0, 0.6], ['K', 0.6, 0.6]]);
  const F = frameOf(ctx), fs = freeSide(ctx, F, 0.9, 0.75), pg = ref(), R = reel(), short = f === 'short', land = [fs.at[0], F.y, fs.at[1]], sky = [fs.at[0] + 2, F.y + 3.2, fs.at[1] - 2];
  const yaw = Math.atan2(F.x - land[0], F.z - land[2]);
  R.at(0, turn(F, 0, -fs.s * 30), clip(H, 'idle'), L(ctx, F, 'fs', { mid: [fs.at[0], fs.at[1]], d: 5.4, to: { d: 5.0 }, dur: 4 }), spawn(ctx, pg, () => pigeon({ ring: true }), sky, yaw));
  const tl = short ? 0.5 : 0.9, tb = tl + 0.4, bars = short ? 4 : 8, tEnd = tb + bars * BEAT * 0.5;
  R.at(0, anim(ctx, (T) => {
    const o = pg.obj; if (!o) return;
    if (T < tl) { const u = T / tl, e = 1 - (1 - u) * (1 - u); o.position.set(sky[0] + (land[0] - sky[0]) * e, sky[1] + (land[1] - sky[1]) * e, sky[2] + (land[2] - sky[2]) * e); o.userData.step(T, 'fly'); return; }
    o.position.set(land[0], land[1], land[2]);
    if (T < tb) o.userData.step(T, 'peck', 0.6); else if (T < tEnd) o.userData.step(T - tb, 'bob'); else if (T < tEnd + 0.6) o.userData.step(T, 'idle');
    else { const u = T - tEnd - 0.6; o.position.set(land[0] - u * 1.8, land[1] + u * u * 2.4 + u, land[2] + u * 1.2); o.userData.step(T, 'fly'); }
  }));
  R.at(tl, sfx('whoosh', { pitch: 1.8, quiet: true }), look(H, [land[0], land[1] + 0.2, land[2]]));
  if (f === 'first') R.at(tl + 0.1, cue('title', { style: 'card', text: 'PIGEON', sub: 'regular  /  ring on left leg', at: 'top' })).at(tb + 1.2, cue('untitle', { ms: 300 }));
  R.at(tb, clip(H, 'beatbox', { bpm: 100 }), mood(H, 'happy'), cue('beat', { who: H, pattern: 'B t . t B t . t'.slice(0, short ? 7 : 15), bpm: 100, step: 0.5, vel: 0.6 }));
  // the coo IS the snare (on 2 and 4 of the bar, where the hero left the gap)
  for (let i = 2; i < bars; i += 4) R.at(tb + i * BEAT * 0.5, drum('K', { vel: 0.7 }), word('coo', [0.62, 0.44], { size: 2.8, color: '#c9c3dd', ms: 420 }));
  R.at(tEnd, clip(H, 'idle'), look(H, lensPt(F)), mood(H, 'shout'), ctx.PAY);
  if (f !== 'short') R.at(tEnd + 0.3, say(null, f === 'first' ? 'He has better timing than most of the open mic.' : 'Same time tomorrow, then.', { dur: 1.7 }), mood(H, 'happy'));
  R.at(tEnd + 0.6, sfx('whoosh', { pitch: 1.4, quiet: true }));
  return { events: out(R, tEnd + (f === 'first' ? 2.0 : short ? 0.6 : 1.6), f).list() };
}
// p3.sunset: golden hour in the park. The hero stops, frames the low sun with a hand, and the frame becomes a film frame for a breath (the shutter on the kick)
function sunset(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'park') return null;
  if (MICRO(f)) return m1(ctx, 'v_reach', { to: [0.05, 1.55, 0.45], hold: 0.5 }, 'click', '#ffb067', [['B', 0.5, 0.6]]);
  const F = frameOf(ctx), R = reel(), short = f === 'short';
  R.at(0, turn(F, 0, 70), clip(H, 'idle'), L(ctx, F, 'fs', { side: -0.3, to: { d: 5.0, side: -0.2 }, dur: 4 }));
  let t = short ? 0.2 : 0.8;
  R.at(t, clip(H, 'v_reach', { to: [0.05, 1.55, 0.45], hold: short ? 1.0 : 1.8 }), cue('vignette', { v: 0.55, ms: 600 }));
  t += short ? 0.6 : 1.1;
  R.at(t, cue('flash', { color: '#fff1c9', ms: 140 }), sfx('click', { pitch: 0.7 }), drum('B', { vel: 0.6 }), stamp('GOLDEN HOUR|' + hhmm(ctx), short ? 900 : 1600));
  t += short ? 0.5 : 1.0;
  R.at(t, clip(H, 'idle'), cue('vignette', { v: 0, ms: 500 }), mood(H, 'happy'), ctx.PAY);
  if (f !== 'short') R.at(t, say(null, f === 'first' ? 'Some frames you keep without a phone.' : 'Kept.', { dur: f === 'first' ? 1.9 : 1.0 }));
  return { events: out(R, t + (f === 'first' ? 1.9 : short ? 0.3 : 1.0), f).list() };
}
// p3.closing.park: 19:45, the park closes at eight. The four lamps nearest the hero click on one by one, a four beat count; the groundskeeper whistles two notes off screen
function closingPark(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'park') return null;
  if (MICRO(f)) return m1(ctx, 'v_nod', { n: 2 }, 'click', '#ffd27a', [['t', 0, 0.5], ['K', 0.6, 0.5]]);
  const F = frameOf(ctx), R = reel(), short = f === 'short', lamps = ((ctx.world.terrain && ctx.world.terrain.lamps) || []).slice().sort((a, b) => Math.hypot(a.x - F.x, a.z - F.z) - Math.hypot(b.x - F.x, b.z - F.z)).slice(0, 4);
  R.at(0, turn(F, 0), clip(H, 'idle'), L(ctx, F, 'fs', { h: 1.9, to: { d: 5.0 }, dur: 4 }));
  const g = lamps.map(() => ref());
  lamps.forEach((lp, i) => R.at(0.2, spawn(ctx, g[i], () => glowBall('#ffd27a', 0.55), [lp.x, lp.y, lp.z])));
  const t0 = short ? 0.3 : 0.6;
  for (let i = 0; i < 4; i++) R.at(t0 + i * BEAT, call(() => { const o = g[i] && g[i].obj; if (o) o.userData.setV(1); }), sfx('click', { pitch: 0.6 + i * 0.1, quiet: true }), drum(['B', 't', 'K', 't'][i], { vel: 0.55 }), word('click', [0.2 + i * 0.2, 0.3], { size: 2.4, color: '#ffd27a', ms: 400 }));
  let t = t0 + 4 * BEAT;
  R.at(t - BEAT * 2, clip(H, 'v_nod', { n: 2 }));
  if (!short) { R.at(t, call(() => { ctx.note(84, 0.25, { timbre: 'flute', vel: 0.3 }); setTimeout(() => ctx.note(79, 0.45, { timbre: 'flute', vel: 0.3 }), 280); }), say(null, 'Park closes at eight!', { name: 'GROUNDSKEEPER', color: '#c9c3dd', dur: 1.5 })); t += 1.4; }
  R.at(t, look(H, lensPt(F)), mood(H, 'happy'), ctx.PAY);
  return { events: out(R, t + (short ? 0.4 : 0.9), f).list() };
}

// ======================================================================= THE BAR
// p3.closing.bar: 01:45. Rohzel flicks the lights twice (the room dips to black on the beat), the regulars groan, the last word is hers
function closingBar(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'bar') return null;
  const flick = (R, t) => R.at(t, cue('dip', { v: 0.7, ms: 50, color: '#1a1030' }), sfx('click', { pitch: 0.55 }), drum('K', { vel: 0.6 })).at(t + 0.16, cue('dip', { v: 0, ms: 60, color: '#1a1030' }));
  if (MICRO(f)) { const R = reel(); R.at(0, clip(H, 'idle'), look(H, [frameOf(ctx).x, 3, frameOf(ctx).z])); flick(R, 0.1); R.at(0.45, word('closing', 'hero:top', { size: 3, color: '#ffbe55', ms: 700 }), ctx.PAY).end(1.0); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  const F = frameOf(ctx), R = reel(), short = f === 'short', regs = (ctx.world.npcs || []).filter((n) => n && /^regular\d$/.test(n.id) && n.object && n.object.visible).map((n) => n.id).slice(0, 2);
  R.at(0, turn(F, 0), clip(H, 'idle'), L(ctx, F, 'wide', { h: 2.3, to: { d: 6.5 }, dur: 4 }));
  flick(R, 0.4); flick(R, 0.4 + BEAT);
  let t = 0.4 + BEAT * 2;
  R.at(t - 0.3, look(H, [F.x, F.y + 3, F.z - 1]));
  regs.forEach((id, i) => R.at(t + i * 0.2, word('awww', id + ':top', { size: 2.8, color: '#c9c3dd', ms: 800 })));
  if (!regs.length) R.at(t, word('awww', [0.3, 0.4], { size: 2.8, color: '#c9c3dd', ms: 800 }));
  t += 0.6;
  R.at(t, look(H, null), clip(H, 'v_shrug'), say('rohzel', short ? 'Closing.' : f === 'first' ? 'Last song. Then the chairs go up. Then you go home.' : 'Chairs up in fifteen.', { name: 'ROHZEL', color: '#ffbe55', dur: short ? 0.9 : 1.8 }), ctx.PAY);
  return { events: out(R, t + (f === 'first' ? 2.0 : short ? 0.9 : 1.7), f).list() };
}
// p3.egg.both: the hero tries to hum a melody and drum at the same time (the trick the old masters made famous). Two bars in, the air runs out: a cough on the snare. Rohzel saw.
function eggBoth(ctx) {
  const f = ctx.form; if (ctx.world.id !== 'bar') return null;
  if (MICRO(f)) return m1(ctx, 'beatbox', { bpm: 100 }, 'la-B-la-K', '#ffd35c', [['B', 0, 0.6], ['K', 0.6, 0.6]]);
  const F = frameOf(ctx), R = reel(), short = f === 'short', n = short ? 4 : 7;
  R.at(0, turn(F, 0), clip(H, 'beatbox', { bpm: 100 }), L(ctx, F, 'fs', { to: { d: 4.9 }, dur: 4 }), mood(H, 'happy'));
  const MEL = [64, 67, 69, 71, 69, 67, 64];
  for (let i = 0; i < n; i++) R.at(0.3 + i * BEAT * 0.5, drum(['B', 't', 'K', 't'][i % 4], { vel: 0.55 }), call(() => ctx.note(MEL[i % MEL.length], 0.26, { timbre: 'flute', vel: 0.28 })), i % 2 ? null : word('la', 'hero:top', { size: 2.6 + i * 0.1, color: '#ffd35c', ms: 360 }));
  let t = 0.3 + n * BEAT * 0.5;
  R.at(t, clip(H, 'hit'), mood(H, 'shout'), drum('t', { vel: 0.8 }), word('khh!', 'hero:mouth', { size: 3.4, color: '#ff4f6a', ms: 600 }), cue('shake', { amp: 0.02, dur: 0.2 }));
  t += 0.6;
  R.at(t, clip(H, 'v_shrug'), mood(H, 'happy'), ctx.PAY);
  if (!short) R.at(t + 0.1, say('rohzel', f === 'first' ? 'Singing and drumming at once. Took the best of them twenty years. Breathe.' : 'Breathe first. Then sing.', { name: 'ROHZEL', color: '#ffbe55', dur: f === 'first' ? 2.6 : 1.6 }));
  return { events: out(R, t + (f === 'first' ? 2.6 : short ? 0.5 : 1.6), f).list() };
}

// ======================================================================= the table
export const VIGNETTES = {
  'p3.growl': growl, 'p3.yawn': yawn, 'p3.idle.beat': idleBeat, 'p3.late.warning': lateWarning,
  'p3.idle.flat': idleFlat, 'p3.week.one': weekOne, 'p3.weekend': weekend,
  'p3.fountain.coin': fountainCoin, 'p3.pigeon': pigeonScene, 'p3.sunset': sunset, 'p3.closing.park': closingPark,
  'p3.closing.bar': closingBar, 'p3.egg.both': eggBoth,
};
for (const k in VIGNETTES) VIGNETTES[k] = anywhere(VIGNETTES[k]);
// where a delight belongs (null: anywhere the hero stands in a place)
export const HOME = { 'p3.idle.flat': 'flat', 'p3.week.one': 'flat', 'p3.weekend': 'flat', 'p3.fountain.coin': 'park', 'p3.pigeon': 'park', 'p3.sunset': 'park', 'p3.closing.park': 'park', 'p3.closing.bar': 'bar', 'p3.egg.both': 'bar' };
export const WORLD = 'delights';
void ptAt; void gone;
