// VIGNETTES: HOME (world 'flat', owner VIG). The P1 scenes of VIGNETTES.md 2.1 to 2.7, 2.14 and 2.15, written for the vignette runtime (r3/vig.js) and the cutscene engine.
// Each entry: VIGNETTES[id](ctx) -> { events, ... } (see vignette_kit.js for ctx and the helpers). Every scene has four lengths: FIRST (all of it), FULL (the beat), SHORT (the action
// and the payoff), MICRO (one clip in the gameplay camera, under 1.5 s). Reels are built on an absolute clock (R.at(t, cues)) and sorted, so a scene reads top to bottom.
// Staging notes (flat.js, metres, +z = south towards the gameplay camera, face 0 = +z, 90 = +x, 180 = north). The south and east walls are cut low (a dollhouse): cameras live there.
//   kitchen counter run x 1.75..4.55 at z -5.2 (front edge -4.87, top 0.9): blender x 1.98, kettle x 2.2, sink x 3.45; table (3.25, -1.8) top 0.76, west stool (2.43, -1.75)
//   bed x -7.5..-5.4, z 2.37..3.93 (mattress 0.54), pillows at x -7.1, nightstand lamp (-7.28, 0.95, 4.32); couch (-4, -1.5) seat 0.46 faces the TV (-4, -5.2); coffee table (-4, -3.35)
//   desk (-0.25, -5.1) top 0.77, monitor screen (-0.6, 1.225, -5.198) 0.75 x 0.42, pad grid (-1.2, 0.8, -4.98), ring light (0.3, 1.32, -5.2)
//   booth x 5.45..7.5, z -5.5..-3.3 (door gap x 5.6..6.45), OCCUPIED sign (6.05, 1.69, -3.3); wardrobe (-7.16, -3); standing mirror (-7.22, z -1.45) faces +x
import { THREE } from './kit.js';
import { cue, shot, clip, place, face, look, mood, sfx, drum, word, say, stamp, call, ref, spawn, hold, put, gone, withProp, anim, BEAT } from './vignette_kit.js';
import { food, bowlOats, bowlBurrito, tub, dateBall, phone, blanket, pads, steam, glowBall, screen, mat, HAND } from './vignette_props.js';

const H = 'hero';
// an absolute-time reel builder: R.at(t, cue, cue...) ; R.end(t) ; R.list() sorted by time (stable)
function reel() {
  const L = []; let n = 0;
  const R = {
    at(t, ...cs) { for (const c of cs.flat()) if (c) L.push({ t: Math.max(0, t), i: n++, e: Object.assign({}, c, { t: Math.max(0, t) }) }); return R; },
    end(t) { return R.at(t, { do: 'pulse', v: 0 }); },
    list() { return L.sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.e); },
  };
  return R;
}
// a world camera (inserts of objects): from pos, looking at a point or an actor point ('hero:head')
const cam = (pos, lk, fov, o) => shot(Object.assign({ pos, look: lk, fov: fov || 34 }, o));
// subject relative framing (cine.js): yaw relative to the hero's facing at the cut (+ = the hero's left, the food hand side), w = frame width at the subject (9:16 reference).
// The cast is chibi (a 0.6 m head on a 1.6 m body): a portrait close up needs 2.5 m of room, a medium shot 3.5 m. Sizes: fs full figure, ms waist up, mcu chest up, cu the face.
const SH = { fs: { w: 2.3, h: 1.5, lookH: 0.85, fov: 44 }, ms: { w: 1.5, h: 1.45, lookH: 1.05, fov: 40 }, mcu: { w: 1.1, h: 1.38, lookH: 1.15, fov: 36 }, cu: { w: 0.8, h: 1.32, lookH: 1.2, fov: 30 } };
const S = (size, yaw, o) => shot(Object.assign({ on: H, yaw }, SH[size], o));
const xf = (ms) => ({ cut: 'blend', ms: ms || 380 });
const MICRO = (form) => form === 'micro';
const nightish = (ctx) => ctx.night > 0.6;
const off = (r) => call(() => { if (r.obj && r.obj.userData.setV) r.obj.userData.setV(0); });
const onV = (r, v) => call(() => { if (r.obj && r.obj.userData.setV) r.obj.userData.setV(v === undefined ? 1 : v); });

// ======================================================================= EATING (2.1)
const COUNTER = { y: 0.925 };
const EAT_AT = [3.2, -4.45], KF = -60;   // where the hero eats standing (in front of the counter) and the facing after the turn (west-south-west: the room behind the camera)
const BACK = { banana: -0.05, dates: -0.02, smoothie: -0.12, tea: -0.08, spoon: -0.06, fork: -0.06 };
const grip = (kind, o) => Object.assign({ aim: 'up', back: BACK[kind] || 0 }, o);
// spawn the food in the hero's hand (SHORT / MICRO, or after the reach)
function inHand(ctx, R, t, r, kind, o) { R.at(t, spawn(ctx, r, () => food(kind), [EAT_AT[0], 1, EAT_AT[1]]), hold(ctx, r, H, grip(kind, o))); }
// MICRO eating: the bite in the gameplay camera, PAY on the bite
function eatMicro(ctx, kind, o) {
  const R = reel(), r = ref(); o = o || {};
  inHand(ctx, R, 0, r, kind); if (o.prep) R.at(0, withProp(r, o.prep));
  if (o.drink) R.at(0, clip(H, 'v_drink', { at: 0.3, gulp: 0.4 })); else R.at(0, clip(H, 'v_eat', { bites: 1, every: 0.75, lead: 0.02 }));
  R.at(0.34, sfx(o.drink ? 'swoosh' : 'eat', { pitch: o.drink ? 0.6 : 1 }), drum('B'), withProp(r, (p) => p.userData.bite(o.drink ? 0.5 : 0.34)), ctx.PAY);
  R.end(0.85);
  return { events: R.list() };
}
// the reach: the hero (at the counter, facing it) takes the food off the counter top in front of him
function reachFor(ctx, R, t0, r, make, kind) {
  R.at(t0, place(H, EAT_AT, 180), clip(H, 'v_reach', { to: [0.13, 0.98, 0.5], hold: 0.25 }), spawn(ctx, r, make, [EAT_AT[0] + 0.12, COUNTER.y, -4.98]));
  R.at(t0 + 0.42, hold(ctx, r, H, grip(kind)), sfx('click', { pitch: 0.7, quiet: true }));
}

function eatBanana(ctx) {
  const f = ctx.form; if (MICRO(f)) return eatMicro(ctx, 'banana', { prep: (p) => p.userData.peel(1) });
  const R = reel(), b = ref(), peel = ref(), first = f === 'first', v = first ? 0 : ctx.pick(3);
  let t = 0;
  if (first) {
    // 1 MS 3/4 from behind, the table side: the hero turns to the fruit on the counter
    R.at(0, S('ms', 150, { to: { yaw: 132 }, dur: 1.4 }));
    reachFor(ctx, R, 0, b, () => food('banana'), 'banana');
    t = 1.0;
  } else inHand(ctx, R, 0, b, 'banana');
  // 2 MCU the peel: three pulls on the beat, each a hi-hat
  R.at(t, place(H, EAT_AT, -150), face(H, KF, 450), clip(H, 'v_hold', { y: 0.9, z: 0.3, look: 1 }));
  if (f !== 'short') {
    R.at(t, S('mcu', 25, Object.assign({ lookH: 1.05, to: { w: 0.95, lookH: 1.12 }, dur: 2.2 }, first ? xf(300) : {})));
    [0, 1, 2].forEach((i) => R.at(t + 0.35 + i * BEAT * 0.5, drum('t'), withProp(b, (p) => p.userData.peel((i + 1) / 3)), word('t', [0.62 + i * 0.06, 0.4 - i * 0.04], { size: 3.2, color: '#2ee6ff', ms: 500 })));
    t += 0.35 + BEAT * 1.5 + 0.1;
  } else R.at(t, withProp(b, (p) => p.userData.peel(1)), S('mcu', 25, { w: 0.95 }));
  // 3 the bite: PAY on the bite (a kick), the chew
  R.at(t, clip(H, 'v_eat', { bites: f === 'short' ? 1 : 2, every: 0.85, lead: 0.05, chew: 1 }));
  const bite1 = t + 0.05 + 0.85 * 0.42;
  R.at(bite1, drum('B'), sfx('eat'), withProp(b, (p) => p.userData.bite(0.34)), ctx.PAY, word('B', 'hero:mouth', { size: 5, color: '#ffd35c', ms: 520 }));
  if (f !== 'short') R.at(bite1 + 0.85, drum('B'), sfx('eat', { pitch: 1.1 }), withProp(b, (p) => p.userData.bite(0.67)));
  if (f === 'short') { R.end(bite1 + 0.7); return { events: R.list() }; }
  t = bite1 + 1.15;
  // 4 the peel toss: at the produce crate (the compost), without looking. FULL rotates: in (fist pump), miss (stare, shrug), behind the back (after 10 bananas)
  const bin = [1.45, 0.3, -4.55], miss = v === 1, behind = v === 2 && ctx.n >= 9;
  R.at(t, gone(ctx, b), spawn(ctx, peel, () => { const g = food('banana'); g.userData.bite(1); g.userData.peel(1); return g; }, [EAT_AT[0], 1.0, EAT_AT[1]]),
    anim(ctx, (T) => { if (!peel.obj) return; const u = Math.min(1, T / 0.7), p0 = [2.95, 1.05, -4.3], p1 = miss ? [1.95, 0.02, -4.2] : bin; peel.obj.position.set(p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u + Math.sin(u * Math.PI) * 0.55, p0[2] + (p1[2] - p0[2]) * u); peel.obj.rotation.set(u * 9, u * 4, 0); }),
    clip(H, behind ? 'v_shrug' : 'v_reach', { to: [0.4, 1.05, 0.15], hold: 0.1 }), sfx('swoosh', { pitch: 1.4 }),
    cam([3.75, 1.55, -3.35], [1.6, 0.45, -4.55], 40, xf(250)));
  R.at(t + 0.72, miss ? sfx('step', { pitch: 1.6 }) : drum('K'), miss ? null : word('K', [0.3, 0.6], { size: 4.6, color: '#ff3ea5', ms: 600 }));
  if (miss) R.at(t + 0.9, look(H, [1.95, 0.05, -4.2]), clip(H, 'idle'), S('mcu', -30)).at(t + 1.7, clip(H, 'v_shrug'), look(H, null));
  else R.at(t + 0.85, clip(H, behind ? 'v_guns' : 'cheer'), mood(H, 'happy'), S('ms', 20));
  R.end(t + (miss ? 2.5 : 1.8));
  return { events: R.list() };
}

// oats and the burrito bowl are table food: the hero sits on the west stool, the bowl on the table, the spoon or fork in the left hand
const STOOL = [2.43, -1.75], TABLE_Y = 0.765;
function eatTable(ctx, kind) {
  const f = ctx.form, oats = kind === 'oats', R = reel(), bowl = ref(), ut = ref(), st = ref(), first = f === 'first', u = oats ? 'spoon' : 'fork';
  const bowlAt = [2.86, TABLE_Y, -1.72], seat = 0.49, make = oats ? bowlOats : bowlBurrito;
  if (MICRO(f)) {
    inHand(ctx, R, 0, ut, u); R.at(0, clip(H, 'v_eat', { bites: 1, every: 0.75, lead: 0.02 }));   // MICRO: wherever the hero stands
    R.at(0.34, sfx('eat'), drum('B'), withProp(ut, (p) => p.userData.bite(1)), ctx.PAY).end(0.85); return { events: R.list() };
  }
  let t = 0;
  if (first) {
    // 1 the bowl comes off the counter (the oats steam), then the jump cut to the table
    R.at(0, S('ms', 150, { to: { yaw: 135 }, dur: 1.2 }), place(H, EAT_AT, 180), clip(H, 'v_reach', { to: [0.13, 0.98, 0.5], hold: 0.3 }), spawn(ctx, bowl, make, [EAT_AT[0] + 0.12, COUNTER.y, -4.98]));
    if (oats) R.at(0, spawn(ctx, st, () => steam(4), [EAT_AT[0] + 0.12, COUNTER.y + 0.08, -4.98]), anim(ctx, (T) => st.obj && st.obj.userData.step(T)));
    R.at(0.5, sfx('click', { pitch: 0.6, quiet: true })); t = 1.05;
  }
  // 2 at the table: seated, the bowl in front, the long lens across the table (oats), or TOP: three fast bites in eighths (the burrito bowl)
  R.at(t, place(H, STOOL, 90, { y: 0 }), clip(H, 'sit', { seat, slump: 0.9 }), first ? put(ctx, bowl, bowlAt) : spawn(ctx, bowl, make, bowlAt),
    spawn(ctx, ut, () => food(u), [STOOL[0], 1, STOOL[1]]), hold(ctx, ut, H, grip(u)));
  if (oats) R.at(t, first ? put(ctx, st, [bowlAt[0], bowlAt[1] + 0.08, bowlAt[2]]) : spawn(ctx, st, () => steam(4), [bowlAt[0], bowlAt[1] + 0.08, bowlAt[2]]), first ? null : anim(ctx, (T) => st.obj && st.obj.userData.step(T)));
  const bites = f === 'short' ? 1 : oats ? 2 : 3, every = oats ? 1.0 : 0.45, from = [0.26, TABLE_Y - 0.02, 0.45], lead = oats ? 0.3 : 0.15;
  if (oats || f === 'short') R.at(t, S('mcu', 10, Object.assign({ h: 1.85, lookH: 1.0, w: 1.2, to: { w: 1.08 }, dur: 3 }, first ? { cut: 'xfade', ms: 300 } : {})));
  else R.at(t, S('mcu', -28, Object.assign({ h: 2.0, lookH: 1.0, w: 1.25, to: { w: 1.1 }, dur: 2 }, first ? { cut: 'xfade', ms: 300 } : {})));   // high, from the right: three fast bites in eighths
  R.at(t + 0.05, clip(H, 'v_eat', { bites, every, lead, from, chew: 1, warm: oats ? 1 : 0, small: oats ? 0.4 : 0, sit: seat }));
  if (oats) R.at(t + 0.18, sfx('swoosh', { pitch: 0.5, quiet: true }));   // a blow on the spoon
  for (let i = 0; i < bites; i++) {
    const tb = t + 0.05 + lead + every * (i + 0.42);
    R.at(tb, drum(oats ? 'B' : i === 2 ? 'K' : 't'), sfx('eat', { pitch: 1 + i * 0.08 }), withProp(ut, (p) => p.userData.bite(1)), withProp(bowl, (p) => p.userData.fill(1 - (i + 1) / (bites + 1))), i === 0 ? ctx.PAY : null);
    R.at(tb + every * 0.45, withProp(ut, (p) => p.userData.bite(0)));
  }
  t += 0.05 + lead + every * bites + 0.2;
  if (f === 'short') { R.end(t + 0.2); return { events: R.list() }; }
  // 3 the beat: oats = the warm face (eyes close for one beat); burrito = food coma (lean back, a slow blink)
  if (oats) R.at(t, S('cu', 12, Object.assign({ h: 1.55, lookH: 1.32, w: 0.92 }, xf(300))), mood(H, 'happy'), clip(H, 'sit', { seat, slump: 0.8, drowsy: 1 })).end(t + 1.3);
  else R.at(t, S('mcu', 30, Object.assign({ h: 1.55, lookH: 1.28, to: { w: 0.9 }, dur: 1.6 }, xf(300))), clip(H, 'sit', { seat, slump: 1.6, drowsy: 1 }), gone(ctx, ut), mood(H, 'happy'), sfx('heart', { pitch: 0.7 })).end(t + 1.8);
  return { events: R.list() };
}

function eatDates(ctx) {
  const f = ctx.form, R = reel(), tb = ref(), d = ref(), d2 = ref(), first = f === 'first', miss = !first && f === 'full' && ctx.pick(4) === 0, dbl = f === 'full' && ctx.n >= 5 && !miss;
  if (MICRO(f)) return eatMicro(ctx, 'dates');
  let t = 0;
  R.at(0, spawn(ctx, tb, tub, [EAT_AT[0] + 0.15, COUNTER.y, -4.98]));
  if (first) { R.at(0, S('ms', 150, { to: { yaw: 135 }, dur: 1.2 }), place(H, EAT_AT, 180), clip(H, 'v_reach', { to: [0.05, 0.98, 0.5], hold: 0.2 })); t = 0.9; }
  R.at(t, place(H, EAT_AT, -150), face(H, KF, 400), spawn(ctx, d, () => food('dates'), [EAT_AT[0], 1, EAT_AT[1]]), hold(ctx, d, H, grip('dates')));
  // LOW, looking up: the ball against the ceiling
  R.at(t, S('mcu', 20, Object.assign({ h: 0.75, lookH: 1.35, fov: 40, w: 1.25, to: { w: 1.15 }, dur: 1.6 }, first ? xf(260) : {})));
  R.at(t + 0.15, clip(H, 'v_toss', { catchAt: 0.75, miss }), sfx('swoosh', { pitch: 1.6, quiet: true }));
  // the flight: off the hand, up, into the mouth (a pure function of time, so the shot tool sees it)
  const tmp = [new THREE.Vector3(), new THREE.Vector3()];
  R.at(t + 0.35, gone(ctx, d), spawn(ctx, d2, () => { const o = dateBall(); o.scale.setScalar(HAND * 1.3); return o; }, [3.0, 1.0, -4.3]), anim(ctx, (T) => {
    const o = d2.obj, hero = ctx.api && ctx.api.actor(H); if (!o || !hero) return; const m = hero.c.anchors.mouth.getWorldPosition(tmp[0]), h = hero.c.anchors.handL.getWorldPosition(tmp[1]), u = Math.min(1, T / 0.55);
    o.position.set(h.x + (m.x - h.x) * u, h.y + (m.y - h.y) * u + Math.sin(u * Math.PI) * 0.5, h.z + (m.z - h.z) * u); o.visible = u < 1 || miss;
    if (miss && u >= 1) o.position.set(m.x + 0.08, Math.max(0.05, m.y - (T - 0.55) * 1.8), m.z + 0.15);
  }));
  const ct = t + 0.15 + 0.75;
  R.at(ct, drum('B'), sfx('eat'), ctx.PAY, word('B', 'hero:mouth', { size: 5.4, color: '#ffd35c', ms: 600 }));
  if (dbl) R.at(ct + 0.18, drum('B'), word('B', [0.6, 0.3], { size: 5.4, color: '#ffd35c', ms: 600 }));
  if (miss) R.at(ct + 0.3, look(H, 'cam'), S('cu', 0)).end(ct + 1.6);
  else R.at(ct + 0.2, S('cu', 25), mood(H, 'happy'), clip(H, 'v_nod', { n: 2 })).end(ct + (f === 'short' ? 0.7 : 1.4));
  return { events: R.list() };
}

// the green smoothie: the blender is a drum machine. The hero cannot help it: beatboxes over the whir (the mic comes up), pours, gulps, shudders, nods
const BLENDER = [1.98, 0.92, -5.15];
function eatSmoothie(ctx) {
  const f = ctx.form, R = reel(), gl = ref(), vx = ref(), first = f === 'first';
  if (MICRO(f)) return eatMicro(ctx, 'smoothie', { drink: true });
  const spot = [2.2, -4.42];
  R.at(0, spawn(ctx, vx, () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.068, 0.22, 9, 1, true), mat('#7ccf3a', { transparent: true, opacity: 0.9 })); m.position.y = 0.135; g.add(m); g.userData.m = m; return g; }, [BLENDER[0], BLENDER[1] + 0.1, BLENDER[2]]));
  let t = 0;
  if (f !== 'short') {
    // 1 INS the blender: the hand comes in and presses the button
    R.at(0, place(H, spot, 193), clip(H, 'v_reach', { to: [-0.02, 1.0, 0.52], hold: 0.35 }), cam([2.95, 1.25, -4.78], [1.98, 1.08, -5.12], 36, { to: { pos: [2.9, 1.24, -4.8] }, dur: 1.2 }));
    R.at(0.45, drum('K'), sfx('click', { pitch: 0.5 }));
    t = 0.6;
  } else R.at(0, place(H, spot, 193));
  // 2 the whir is the bass: the vortex spins, the hero turns to us and beatboxes over it, mic up at the lips
  const bars = first ? 'B t B t K . t B' : 'B . t . K . t .';
  R.at(t, anim(ctx, (T) => { const o = vx.obj; if (!o) return; o.rotation.y = T * 30; o.userData.m.scale.set(1 + 0.05 * Math.sin(T * 40), 1 + 0.08 * Math.sin(T * 13), 1); }), sfx('whoosh', { pitch: 0.45 }));
  R.at(t, face(H, 35, 300), S('ms', 18, Object.assign({ to: { w: 1.25 }, dur: 2.6 }, f === 'short' ? {} : xf(260))));
  R.at(t + 0.1, cue('beat', { who: H, pattern: bars, bpm: 100, step: 0.5, rings: true, words: first }));
  if (first && ctx.foxy) R.at(t + 0.7, word('clap', [0.2, 0.3], { size: 3.4, color: '#9dff4a', ms: 700 }), drum('K'));
  t += 0.1 + bars.split(' ').length * 0.3 + 0.05;
  // 3 the glass in the left hand: a long gulp, the shudder (green), then the nod
  R.at(t, clip(H, 'v_drink', { at: 0.35, gulp: 0.9, shudder: true }), spawn(ctx, gl, () => food('smoothie'), [spot[0], 1, spot[1]]), hold(ctx, gl, H, grip('smoothie')), S('mcu', 25, xf(220)));
  R.at(t + 0.4, sfx('swoosh', { pitch: 0.55 }), ctx.PAY).at(t + 0.9, withProp(gl, (p) => p.userData.bite(0.6))).at(t + 1.4, withProp(gl, (p) => p.userData.bite(1)), mood(H, 'sad'));
  R.at(t + 2.0, mood(H, 'happy'), clip(H, 'v_nod', { n: 2 }), word('Pf', 'hero:mouth', { size: 4, color: '#9dff4a', ms: 600 }), drum('Pf')).end(t + (f === 'short' ? 2.5 : 2.9));
  return { events: R.list() };
}

// ginger tea: the kettle whistles and climbs, the hero hums to match it and lands it at the peak. The mug, a sip, the shoulders drop: the cosy shot
const KETTLE = [2.2, 0.93, -5.1];
function eatTea(ctx) {
  const f = ctx.form, R = reel(), mg = ref(), st = ref(), flat = ctx.ch && ctx.ch.stats && ctx.ch.stats.mus < 10, night = ctx.hour >= 21 || ctx.hour < 5;
  if (MICRO(f)) return eatMicro(ctx, 'tea', { drink: true });
  const spot = [2.4, -4.42];
  R.at(0, place(H, spot, 190), spawn(ctx, st, () => steam(5), [KETTLE[0] - 0.14, KETTLE[1] + 0.2, KETTLE[2] + 0.02]), anim(ctx, (T) => st.obj && st.obj.userData.step(T, Math.min(1, T / 0.8))));
  let t = 0;
  if (f !== 'short') {
    // 1 INS the kettle: steam, the whistle climbs (three notes)
    R.at(0, cam([3.45, 1.32, -4.5], [2.2, 1.05, -5.05], 30, { to: { pos: [3.3, 1.3, -4.55] }, dur: 1.6 }));
    [0, 1, 2].forEach((i) => R.at(0.2 + i * 0.4, call(() => ctx.note(72 + i * 4, 0.45, { timbre: 'flute', vel: 0.35 }))));
    // 2 the hero turns, hums along (mouth closed) and lands the top note with the kettle
    R.at(1.25, face(H, 45, 300), S('mcu', 20, xf(260)), clip(H, 'v_hold', { y: 0.84, look: 0.2 }), mood(H, 'happy'));
    R.at(1.3, call(() => ctx.note(flat ? 82 : 84, 0.7, { timbre: 'flute', vel: 0.4 })), call(() => ctx.note(flat ? 83 : 84, 0.7, { timbre: 'keys', vel: 0.3 })), word(flat ? 'hm?' : 'hmm', 'hero:mouth', { size: 3.6, color: '#ffd35c', ms: 800 }));
    if (flat) R.at(1.9, mood(H, 'sad'), clip(H, 'v_shrug'));
    t = 2.1;
  } else R.at(0, face(H, 45, 0));
  // 3 the mug, a sip, the warm face; at night the lamp light and the long lens (the mug is held a beat longer)
  R.at(t, spawn(ctx, mg, () => food('tea'), [spot[0], 1, spot[1]]), hold(ctx, mg, H, grip('tea')), clip(H, 'v_drink', { at: 0.45, gulp: 0.3, warm: true }), mood(H, 'happy'),
    S('cu', 22, Object.assign({ fov: night ? 26 : 30, w: 1.0, lookH: 1.15, to: { w: 0.88 }, dur: 2 }, f === 'short' ? {} : xf(260))));
  R.at(t + 0.5, sfx('swoosh', { pitch: 0.4, quiet: true }), ctx.PAY).at(t + 0.9, withProp(mg, (p) => p.userData.bite(0.5)));
  R.end(t + (f === 'short' ? 1.5 : night ? 2.6 : 2.1));
  return { events: R.list() };
}

// ======================================================================= BED: nap, sleep, wake (2.2)
const BED = { edge: [-6.25, 3.86], lie: [-6.2, 3.15], lieFace: 90, lamp: [-7.28, 0.98, 4.32], seat: 0.55 };
// the blanket over the sleeper (world space)
const blanketAt = (ctx, r) => spawn(ctx, r, () => blanket(1.45, 1.42), [-6.15, 1.0, 3.15]);
// sleep letters rise from the sleeper: beatbox letters (the hero beatboxes in their sleep)
function sleepLetters(ctx, R, t0, n, step) {
  const L = ['B', 't', 'K', 'Pf'], col = { B: '#ffd35c', t: '#2ee6ff', K: '#ff3ea5', Pf: '#9dff4a' };
  for (let i = 0; i < n; i++) { const l = L[i % L.length]; R.at(t0 + i * step, word(l, 'hero:top', { size: 3.2 + (i % 2) * 0.8, color: col[l], ms: 900 }), drum(l, { vel: 0.25, pulse: false })); }
}
// the clock text minutes before or after the current save time (VHS stamp)
function clockAt(ctx, dm) { const m = ((((ctx.ch ? ctx.ch.minutes : 0) + (dm || 0) + 360) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
// a top shot of the bed from the foot end: steep, the frame runs along the bed
const bedTop = (o) => cam([-4.75, 3.2, 3.15], [-6.35, 0.6, 3.15], 46, o);
function nap(ctx) {
  const f = ctx.form, R = reel(), bl = ref(), tired = ctx.pre && ctx.pre.energy < 10, dusk = ctx.hour >= 17;
  if (MICRO(f)) {
    R.at(0, clip(H, 'sit', { seat: 0.54, drowsy: 1, slump: 1.3 }), sfx('sleep', { pitch: 1.2 }), word('z', 'hero:top', { size: 3.6, color: '#2ee6ff', ms: 600 }));
    R.at(0.45, ctx.PAY).end(0.9); return { events: R.list() };
  }
  let t = 0;
  if (f !== 'short') {
    // 1 MS side of the bed: sit on the edge, kick off the shoes (two kicks)
    R.at(0, place(H, BED.edge, 0, { y: 0 }), clip(H, 'sit', { seat: BED.seat, slump: 1.1 }), S('ms', 78, { h: 1.55, lookH: 1.1, w: 1.45, to: { w: 1.3 }, dur: 1.4 }));
    R.at(0.45, drum('B'), sfx('step', { pitch: 0.8 })).at(0.45 + BEAT * 0.5, drum('B'), sfx('step', { pitch: 0.7 }));
    // 2 falls back (the blanket puffs)
    R.at(1.0, clip(H, 'v_flop', { seat: BED.seat, at: 0.05 }), sfx('swoosh', { pitch: 0.6 }));
    R.at(1.35, cue('fx', { kind: 'sparks', at: [-6.2, 0.8, 3.5], color: '#fff3d0', n: 26 }), drum('K', { vel: 0.4 }));
    t = 1.65;
  }
  // 3 TOP, slow push down: under the blanket, the clock ramps +90 min, the light slides, the sleep letters rise
  R.at(t, place(H, BED.lie, BED.lieFace, { y: 0 }), clip(H, 'v_lie', { y: 0.2, snore: true }), blanketAt(ctx, bl), mood(H, 'neutral'),
    bedTop(Object.assign({ to: { pos: [-5.0, 2.8, 3.15] }, dur: f === 'short' ? 1.2 : 2.2 }, f === 'short' ? {} : { cut: 'xfade', ms: 350 })));
  R.at(t, stamp(clockAt(ctx, -90) + '|+90 MIN', 1400));
  sleepLetters(ctx, R, t + 0.25, f === 'short' ? 2 : 4, 0.38);
  if (dusk && f !== 'short') R.at(t + 0.3, cue('light', { time: Math.min(1, ctx.night + 0.25) }));
  t += f === 'short' ? 1.0 : 1.9;
  // 4 sit up and stretch. PAY (+22 energy)
  R.at(t, stamp(''), gone(ctx, bl), clip(H, 'v_situp', { tries: tired ? 2 : 1, y: 0.2, seat: BED.seat }), S('mcu', 10, Object.assign({ h: 1.75, lookH: 1.05, w: 1.4 }, xf(300))), sfx('confirm', { pitch: 0.8 }));
  R.at(t + (tired ? 1.6 : 0.8), ctx.PAY, mood(H, 'happy'));
  R.end(t + (tired ? 2.6 : 1.8));
  return { events: R.list(), holdSync: dusk };
}

// bedtime: the phone (the day's numbers), the lamp clicks off on the beat, the windows go out, black. The wake scene follows the morning load
function sleepScene(ctx) {
  const f = ctx.form, R = reel(), ph = ref(), lamp = ref(), bl = ref(), first = f === 'first', ch = ctx.ch || {}, late = ctx.extra.late, moodV = ch.mood || 50;
  const fans = ch.fans || 0, cash = ch.cash || 0, day = ch.day || 1;
  R.at(0, spawn(ctx, lamp, () => glowBall('#ffc27a', 0.15), BED.lamp), onV(lamp, 0.75));
  if (MICRO(f)) { R.at(0, clip(H, 'sit', { seat: 0.54, drowsy: 1, slump: 1.3 }), sfx('sleep')).at(0.5, off(lamp), drum('K', { vel: 0.5 }), cue('dip', { v: 1, ms: 400, color: '#07040e' })).end(1.0); return { events: R.list(), keepDip: true }; }
  let t = 0;
  if (!late && f !== 'short') {
    // 1 MCU on the bed edge, the phone lights the face: today's numbers
    R.at(0, place(H, BED.edge, 0), clip(H, 'v_hold', { y: 0.95, z: 0.3, look: 1, sit: BED.seat }), spawn(ctx, ph, () => phone(), [BED.edge[0], 1, BED.edge[1]]), hold(ctx, ph, H, { aim: 'face' }),
      call(() => ph.obj && ph.obj.userData.draw((g, w, h) => { g.fillStyle = '#120d1f'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd35c'; g.font = '700 26px sans-serif'; g.textAlign = 'center'; g.fillText('DAY ' + day, w / 2, 70); g.fillStyle = '#2ee6ff'; g.font = '700 22px sans-serif'; g.fillText(fans + ' FANS', w / 2, 130); g.fillStyle = '#9dff4a'; g.fillText('$' + cash, w / 2, 170); g.fillStyle = '#fff6e8'; g.font = '500 15px sans-serif'; g.fillText('good night', w / 2, 250); })),
      cam([-5.75, 1.45, 5.35], [-6.2, 1.1, 3.9], 60, { to: { pos: [-5.8, 1.43, 5.25] }, dur: 2 }));
    // the day's numbers, read off the phone (lowercase after midnight, like the tired NPC lines)
    const txt = 'Day ' + day + '. ' + fans + ' fans. $' + cash + '.' + (first ? ' Still here.' : ''), late2 = ctx.hour < 6;
    R.at(0.35, say(null, late2 ? txt.toLowerCase() : txt, { dur: first ? 2.0 : 1.4 })).at(first ? 2.2 : 1.5, call((api) => api.screen.clearSub(300)));
    R.at(1.3, sfx('click', { pitch: 1.6, quiet: true }), drum('t', { vel: 0.4, pulse: false }), gone(ctx, ph));
    t = first ? 2.3 : 1.6;
  }
  // 2 the nightstand lamp: the hand reaches in, clicks it off ON the beat; the room drops to moonlight
  R.at(t, place(H, BED.lie, BED.lieFace), clip(H, 'v_lie', { y: 0.2, awake: moodV < 30 ? 0.8 : 0.25, turn: moodV < 30 ? 0.5 : 0, smile: moodV > 80 }), blanketAt(ctx, bl),
    cam([-5.6, 1.35, 5.3], [-7.2, 0.85, 4.25], 34, { to: { pos: [-5.7, 1.32, 5.2] }, dur: 1.2 }));
  R.at(t + 0.55, drum('K'), sfx('click', { pitch: 0.6 }), off(lamp), cue('light', { time: 1, instant: !!ctx.reduce }), cue('vignette', { v: 0.7, ms: 400 }));
  t += 1.0;
  // 3 WS from the doorway: the shape under the blanket, the city windows go out (4 beats), a single held pad
  R.at(t, cam([-2.6, 2.4, 6.4], [-6.3, 0.6, 3.2], 40, Object.assign({ to: { pos: [-2.8, 2.3, 6.2] }, dur: 2.4 }, xf(400))));
  if (f !== 'short') [0, 1, 2, 3].forEach((i) => R.at(t + 0.3 + i * BEAT, drum(i === 3 ? 'K' : 't', { vel: 0.3 }), cue('pulse', { v: 0.6 - i * 0.12 })));
  R.at(t + (f === 'short' ? 0.4 : 1.6), sfx('sleep', { pitch: 0.9 }), ctx.PAY);
  // 4 black, a held beat
  const tb = t + (f === 'short' ? 0.7 : 2.2);
  R.at(tb, cue('dip', { v: 1, ms: 600, color: '#07040e' })).end(tb + 0.9);
  return { events: R.list(), holdSync: true, keepDip: true, letterbox: f !== 'short' };
}

// the morning: dawn, the alarm is a hi-hat pattern, eyes open, a yawn, sitting up, the stretch. The morning event gets its own beat. Then the morning card (r3/vig.js)
function wake(ctx) {
  const f = ctx.form, R = reel(), bl = ref(), ph = ref(), m = ctx.morning || {}, ev = m.event || null, late = (m.lines || []).some((l) => /slept late/i.test(l)), rain = ((m.day || 0) % 5) === 0 || ev === 'rain';
  const dname = String(m.name || '').slice(0, 3).toUpperCase() || 'DAY';
  R.at(0, cue('dip', { v: 0, ms: 700, color: '#07040e' }), cue('light', { time: 0.15, instant: true }), rain ? cue('light', { weather: 'rain' }) : null, place(H, BED.lie, BED.lieFace), clip(H, 'v_lie', { y: 0.2, slow: true }), blanketAt(ctx, bl), stamp(dname + ' 07:00|REC', 900));
  if (MICRO(f)) { R.at(0, bedTop()).at(0.1, gone(ctx, bl), clip(H, 'v_situp', { y: 0.2, seat: BED.seat })).at(0.6, ctx.PAY).end(1.1); return { events: R.list(), holdSync: true, letterbox: false, dipIn: true }; }
  // 1 WS the room at dawn: the hero is a lump. The alarm is a hi-hat pattern on the phone
  R.at(0, cam([-3.3, 2.5, 6.2], [-6.3, 0.7, 3.1], 40, { to: { pos: [-3.5, 2.35, 5.9] }, dur: 2.4 }));
  if (ev !== 'drums') ['t', 't', '.', 't', 't', 't', '.', 'K'].forEach((k, i) => { if (k !== '.') R.at(0.35 + i * 0.15, drum(k, { vel: 0.5 })); });
  let t = 1.6;
  if (ev === 'drums') {
    // the neighbour drums through the wall at 6 am; half asleep, the hero beatboxes back at the wall; silence; one knock; two back
    R.at(0.3, cue('beat', { pattern: 'B . K . B B K .', bpm: 110, step: 0.5, pulse: true }), cue('shake', { amp: 0.02, dur: 1.2 }));
    R.at(1.4, bedTop(xf(260)), cue('beat', { who: H, pattern: 'B t K t', bpm: 110, step: 0.5, rings: true }));
    R.at(2.6, drum('K', { vel: 0.7 }), word('knock', [0.25, 0.35], { size: 3, color: '#fff6e8', ms: 600 })).at(3.1, drum('K'), word('knock knock', [0.7, 0.4], { size: 3, color: '#ffd35c', ms: 700 }));
    t = 3.5;
  } else if (late) {
    R.at(1.5, bedTop(xf(260)), clip(H, 'v_lie', { y: 0.2, awake: 0.4, turn: 0.4 }), mood(H, 'sad'), sfx('lose', { pitch: 1.6, quiet: true }));
    t = 2.6;
  } else if (rain) {
    R.at(1.4, bedTop(xf(300)), clip(H, 'v_lie', { y: 0.2, awake: 0.5, smile: true }), sfx('rain', { n: 3 }), mood(H, 'happy'));
    t = 3.0;
  }
  // 2 the eyes open, sitting up with the stretch
  R.at(t, S('ms', -50, Object.assign({ h: 2.3, lookH: 0.95, w: 1.6, to: { w: 1.45 }, dur: 1.4 }, xf(280))), clip(H, 'v_situp', { y: 0.2, seat: BED.seat }), gone(ctx, bl));
  if (ev === 'dream') R.at(t + 0.1, mood(H, 'shout'), sfx('heart'), cue('shake', { amp: 0.03, dur: 0.3 })).at(t + 0.9, word('B?', 'hero:mouth', { size: 4, color: '#c9c3dd', ms: 600 })).at(t + 1.4, drum('B', { vel: 1 }), word('B', 'hero:mouth', { size: 6, color: '#ffd35c', ms: 800 }), mood(H, 'happy'));
  t += f === 'short' ? 1.0 : 1.6;
  // 3 on the edge of the bed: the morning event's beat. PAY with the morning numbers
  R.at(t, place(H, BED.edge, 0), clip(H, 'sit', { seat: BED.seat, slump: 1.0 }), S('mcu', 22, Object.assign({ h: 1.45, lookH: 1.3 }, xf(300))), mood(H, 'happy'));
  if (ev === 'streamed' || ev === 'mum') {
    R.at(t + 0.2, spawn(ctx, ph, () => phone(), [BED.edge[0], 1, BED.edge[1]]), hold(ctx, ph, H, { aim: 'face' }), clip(H, 'v_hold', { y: 0.95, z: 0.3, sit: BED.seat }),
      call(() => ph.obj && ph.obj.userData.draw((g, w, h) => { g.fillStyle = ev === 'mum' ? '#2a7d4f' : '#2c1d4d'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff6e8'; g.font = '700 20px sans-serif'; g.textAlign = 'center'; if (ev === 'mum') { g.fillText('MUM', w / 2, 50); g.font = '500 17px sans-serif'; g.fillText('Eat something', w / 2, 120); g.fillText('green!', w / 2, 145); } else { g.fillText('+6 FANS', w / 2, 60); g.fillStyle = '#2ee6ff'; g.fillRect(18, 90, w - 36, 110); g.fillStyle = '#17141f'; g.font = '700 40px sans-serif'; g.fillText('▶', w / 2, 160); } })),
      sfx('click', { pitch: 1.8 }), drum('t'));
    R.at(t + 1.3, clip(H, 'sit', { seat: BED.seat, wave: ev === 'mum' }), gone(ctx, ph));
    t += 1.0;
  } else if (ev === 'five') {
    R.at(t + 0.1, clip(H, 'v_pockets', { sit: BED.seat })).at(t + 1.4, spawn(ctx, ph, () => { const g = new THREE.Group(); const n = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.006), mat('#7fc97a')); g.add(n); return g; }, [BED.edge[0], 1, BED.edge[1]]), hold(ctx, ph, H, { aim: 'face' }), clip(H, 'v_hold', { y: 1.15, z: 0.35, look: 0.6, sit: BED.seat }), sfx('coin'));
    t += 1.6;
  } else if (ev === 'oats') {
    R.at(t + 0.4, word('oats?', [0.5, 0.3], { size: 3.4, color: '#ffd35c', ms: 900 }), clip(H, 'v_shrug', { sit: BED.seat }));
  }
  R.at(t + 0.9, ctx.PAY, sfx('confirm', { pitch: 1.1 }));
  R.end(t + (f === 'short' ? 1.2 : 1.7));
  return { events: R.list(), holdSync: true, dipIn: true };
}

// ======================================================================= COUCH (2.3)
const COUCH = [-4.4, -1.55];
function couchRest(ctx) {
  const f = ctx.form, R = reel(), tape = ref(), sad = ctx.ch && ctx.ch.mood < 30, night = nightish(ctx);
  if (MICRO(f)) { R.at(0, clip(H, 'sit', { seat: 0.46, slump: 1.5, drowsy: 1 }), sfx('sleep', { pitch: 1.4 })).at(0.5, ctx.PAY).end(0.95); return { events: R.list() }; }
  // 1 MS the TV's view of the couch: drops onto it, feet up; the heel knocks a tape off the coffee table on the downbeat (FULL: sometimes caught with the foot)
  const catchIt = f === 'full' && ctx.pick(2) === 0;
  R.at(0, place(H, COUCH, 180), clip(H, 'sit', { seat: 0.46, slump: 1.35, armBack: !sad }), S('ms', -70, { h: 1.75, lookH: 1.05, w: 1.35, fov: 40, to: { w: 1.2 }, dur: 2.4 }), sfx('swoosh', { pitch: 0.5 }), drum('B', { vel: 0.6 }));
  if (f !== 'short') {
    R.at(0.4, spawn(ctx, tape, () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.025, 0.1), mat('#2b2438')), new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.026, 0.06), mat('#ffd35c'))); g.scale.setScalar(1.5); return g; }, [-4.35, 0.46, -3.1]),
      anim(ctx, (T) => { const o = tape.obj; if (!o) return; const u = Math.min(1, Math.max(0, (T - 0.3) / 0.45)); o.position.set(-4.35, 0.46 - (catchIt ? Math.min(u, 0.6) * 0.25 : u * 0.44), -3.1 + u * 0.25); o.rotation.set(u * (catchIt ? 1.2 : 2.6), 0, u * 0.5); }));
    R.at(0.75, drum('K', { vel: 0.7 }), word(catchIt ? 'caught' : 'clack', [0.62, 0.66], { size: 3, color: catchIt ? '#9dff4a' : '#ff3ea5', ms: 600 }));
  }
  // 2 CU eyes closed, head back: a speed ramp, the string lights twinkle on the beat, +30 min
  const t = f === 'short' ? 0.3 : 1.2;
  R.at(t, S('cu', -55, Object.assign({ h: 1.6, lookH: 1.38, w: 0.95, fov: 32, to: { w: 0.85 }, dur: 1.4 }, f === 'short' ? {} : xf(300))), clip(H, 'sit', { seat: 0.46, slump: 1.5, drowsy: 1, armBack: !sad }), mood(H, sad ? 'sad' : 'happy'),
    stamp(clockAt(ctx, -30) + '|+30 MIN', 1100));
  [0, 1, 2, 3].forEach((i) => R.at(t + 0.2 + i * 0.3, cue('pulse', { v: 0.8 }), drum('t', { vel: 0.2, pulse: false })));
  if (ctx.foxy && f === 'first') R.at(t + 0.4, say('foxy', '...', { dur: 1.0 }));
  // 3 PAY, one eye opens
  R.at(t + 1.3, stamp(''), ctx.PAY, sfx('sparkle', { quiet: true }), clip(H, 'sit', { seat: 0.46, slump: 1.1 }));
  R.end(t + (f === 'short' ? 1.6 : 2.0));
  return { events: R.list(), holdSync: night };
}

// ======================================================================= DESK: the stream, quick practice (2.4)
const DESK = { sit: [-0.45, -4.5], seat: 0.5, mon: [-0.6, 1.225, -5.18], monW: 0.75, monH: 0.42, ring: [0.3, 1.32, -5.12] };
const CHAT = ['first', 'B t K t!!', 'do the lip roll', 'is that a plant', 'hi from the bus', 'louder', 'that kick tho', 'W', 'again again', 'TURN IT UP'];
// a gaming chair under the hero at the desk (the flat's own chair is pushed back by the wall): it spins a quarter on the landing
function chair() {
  const g = new THREE.Group(), pink = mat('#ff6ec7'), ink = mat('#2b2438'); g.name = 'vig_chair';
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.5), ink); seat.position.y = 0.45; const cush = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.44), pink); cush.position.y = 0.52;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.1), ink); back.position.set(0, 0.86, -0.28); back.rotation.x = -0.12; const bp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.04), pink); bp.position.set(0, 0.84, -0.22); bp.rotation.x = -0.12;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6), mat('#6b6b80')); post.position.y = 0.2; const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 5), ink); base.position.y = 0.03;
  g.add(seat, cush, back, bp, post, base); return g;
}
function stream(ctx) {
  const f = ctx.form, R = reel(), ov = ref(), rl = ref(), chr = ref(), ch = ctx.ch || {}, viewers = (ch.flags && ch.flags.lastViewers) || 12, tips = Math.max(0, (ch.cash || 0) - ((ctx.pre && ctx.pre.cash) || 0)), fans = Math.max(0, (ch.fans || 0) - ((ctx.pre && ctx.pre.fans) || 0)), sleepy = ctx.pre && ctx.pre.energy < 30, bot = viewers < 15;
  const k0 = ctx.pick(5), lines = bot ? ['first', 'hot singles in your area'] : (sleepy ? ['sleepy', 'sleepy?'] : []).concat(CHAT.slice(k0, k0 + 5));
  // the monitor overlay: LIVE, the viewer counter (rolls up on every kick), chat, tips
  const draw = (k, chatN, tipK) => (g, w, h) => {
    g.fillStyle = '#120d1f'; g.fillRect(0, 0, w, h); g.fillStyle = '#2c1d4d'; g.fillRect(0, 0, w * 0.6, h); g.fillStyle = '#ff3a5c'; g.fillRect(12, 12, 58, 24); g.fillStyle = '#fff'; g.font = '700 16px sans-serif'; g.fillText('LIVE', 21, 30);
    g.fillStyle = '#fff6e8'; g.font = '700 17px sans-serif'; g.fillText('● ' + Math.round(viewers * k), 80, 30); g.fillStyle = '#ffd35c'; g.font = '700 44px sans-serif'; g.textAlign = 'center'; g.fillText('B t K t', w * 0.3, h * 0.62); g.textAlign = 'left';
    const n = Math.min(chatN, lines.length); for (let i = 0; i < n; i++) { g.fillStyle = ['#2ee6ff', '#ff6ec7', '#9dff4a', '#ffd35c'][i % 4]; g.font = '600 14px sans-serif'; g.fillText(lines[i], w * 0.63, h - 16 - (n - 1 - i) * 24); }
    if (tipK > 0) { g.fillStyle = 'rgba(255,211,92,' + Math.min(1, tipK) + ')'; g.font = '700 22px sans-serif'; g.fillText('+$' + tips + '  +' + fans + ' fans', w * 0.04, h - 14); }
  };
  R.at(0, spawn(ctx, ov, () => screen(DESK.monW, DESK.monH, 384), [DESK.mon[0], DESK.mon[1], DESK.mon[2] + 0.012]), call(() => ov.obj && ov.obj.userData.draw(draw(0, 0, 0))));
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 100 }), cue('beat', { who: H, pattern: 'B t K t', bpm: 100, step: 0.5 })).at(0.6, ctx.PAY).end(1.2); return { events: R.list() }; }
  // 1 MS from the side: the hero drops into the gaming chair (it spins a quarter on the landing), the ring light comes ON (a key light on the face)
  const FACE = 205 * Math.PI / 180;
  R.at(0, place(H, DESK.sit, 205), clip(H, 'v_type', { seat: DESK.seat }), spawn(ctx, chr, chair, [DESK.sit[0], 0, DESK.sit[1] + 0.02], FACE), spawn(ctx, rl, () => glowBall('#fff4e2', 0.3), DESK.ring), off(rl),
    anim(ctx, (T) => { if (chr.obj) chr.obj.rotation.y = FACE + (f === 'short' ? 0 : Math.max(0, 1 - T / 0.5) * 1.4); }));
  let t = 0;
  if (f !== 'short') {
    R.at(0, S('ms', 65, { h: 2.1, lookH: 1.1, w: 1.6, fov: 42, to: { w: 1.45 }, dur: 1.4 }), sfx('swoosh', { pitch: 0.7 }));
    R.at(0.5, drum('K'), onV(rl), cue('cone', { id: 'ring', at: [0.3, 1.5, -5.0], to: 'hero:head', color: '#fff4e2', r: 0.5, v: 0.8, ms: 120 }), sfx('click', { pitch: 1.2 }));
    t = 1.1;
  } else R.at(0, onV(rl));
  // 2 INS the monitor over the shoulder: LIVE, the counter rolls from 0, chat bubbles float up
  R.at(t, cam([-1.55, 1.5, -3.65], [-0.6, 1.22, -5.18], 42, Object.assign({ to: { pos: [-1.5, 1.48, -3.75] }, dur: 1.1 }, xf(250))));
  for (let i = 0; i <= 6; i++) R.at(t + i * 0.15, call(() => ov.obj && ov.obj.userData.draw(draw(i / 6, Math.floor(i / 2), 0))));
  t += 1.05;
  // 3 MCU the hero at the mic: two bars, the counter climbs on every kick
  R.at(t, S('mcu', 62, Object.assign({ h: 1.95, lookH: 1.3, w: 1.0 }, xf(220))), clip(H, 'v_type', { seat: DESK.seat, mic: true, bpm: 100 }), cue('beat', { who: H, pattern: 'B . t . K . t . B B t . K . t .', bpm: 100, step: 0.5, rings: true }));
  for (let i = 0; i < 8; i++) R.at(t + i * 0.3, call(() => ov.obj && ov.obj.userData.draw(draw(1 + i * 0.02, 3 + Math.floor(i / 2), 0))));
  t += f === 'short' ? 1.2 : 2.4;
  // 4 INS tips pop as coins on the beat. PAY
  R.at(t, cam([-1.55, 1.5, -3.65], [-0.6, 1.22, -5.18], 38, xf(200)), ctx.PAY);
  [0, 1, 2].forEach((i) => R.at(t + i * 0.3, sfx('coin', { pitch: 1 + i * 0.06 }), call(() => ov.obj && ov.obj.userData.draw(draw(1.15, lines.length, (i + 1) / 3)))));
  t += 1.0;
  // 5 MS the wave at the webcam, END; the ring light off
  R.at(t, S('ms', 62, Object.assign({ h: 2.0, lookH: 1.2, w: 1.35 }, xf(250))), clip(H, 'sit', { seat: DESK.seat, wave: true }), mood(H, 'happy'));
  R.at(t + 0.9, off(rl), cue('cone', { id: 'ring', v: 0, ms: 200 }), drum('K', { vel: 0.5 })).end(t + 1.3);
  return { events: R.list() };
}
// quick practice: the clip of the stat Core picked, a speed ramp, the clock +60, the stopwatch nod
const STAT_CLIP = { mus: 'talk', tech: 'battle', ori: 'point', show: 'dance' };
function quick(ctx) {
  const f = ctx.form, R = reel(), st = (ctx.action && ctx.action.stat) || 'tech', c = STAT_CLIP[st] || 'beatbox', ph = ref();
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 110 }), cue('beat', { who: H, pattern: 'B t K t', bpm: 120, step: 0.5 })).at(0.6, ctx.PAY).end(1.1); return { events: R.list() }; }
  const at = ctx.spot === 'booth' ? [6.05, -2.75] : [-0.4, -3.9];
  R.at(0, place(H, at, 15), clip(H, c, { bpm: 120 }), S('fs', 15, { to: { w: 1.9 }, dur: 1.3 }));
  R.at(0, cue('speed', { v: 1.9, ms: 200 }), stamp(clockAt(ctx, -60) + '|+60 MIN', 1200), cue('beat', { who: H, pattern: 'B t K t B t K t', bpm: 150, step: 0.5, clip: false }));
  R.at(1.25, cue('speed', { v: 1, ms: 200 }), stamp(''), ctx.PAY, spawn(ctx, ph, () => phone(), [at[0], 1, at[1]]), hold(ctx, ph, H, { aim: 'face' }), call(() => ph.obj && ph.obj.userData.draw((g, w, h) => { g.fillStyle = '#17141f'; g.fillRect(0, 0, w, h); g.fillStyle = '#9dff4a'; g.font = '700 30px sans-serif'; g.textAlign = 'center'; g.fillText('60:00', w / 2, h / 2); })),
    clip(H, 'v_hold', { y: 0.95, z: 0.3, look: 1 }), drum('K'), S('mcu', 18, xf(220)));
  R.at(1.9, clip(H, 'v_nod', { n: 1, deep: true })).end(f === 'short' ? 2.2 : 2.6);
  return { events: R.list() };
}

// ======================================================================= THE BOOTH: idle training entry, the training games' intros (2.5)
// staged in the booth doorway, facing the room: the foam and the OCCUPIED sign behind the hero
const BOOTH = { at: [6.05, -3.05] };
function boothIn(ctx, stat) {
  const f = ctx.form, R = reel(), nb = ref();
  if (MICRO(f)) { R.at(0, clip(H, stat === 'show' ? 'v_guns' : stat === 'ori' ? 'point' : 'beatbox', { bpm: 96 })).at(0.4, drum('K')).at(0.5, ctx.PAY).end(0.9); return { events: R.list() }; }
  // the OCCUPIED sign pulses on above the door
  R.at(0, place(H, BOOTH.at, 0), S('ms', 28, { w: 1.35, to: { w: 1.2 }, dur: 2.4 }), cue('cone', { id: 'occ', at: [6.05, 2.6, -3.2], to: [6.05, 0, -2.9], color: '#ff4a3a', r: 0.7, v: 0.55, ms: 300 }));
  if (stat === 'mus') R.at(0.1, clip(H, 'v_hold', { y: 1.28, x: 0.26, z: 0.05, look: 0 }), sfx('click', { pitch: 0.8 })).at(0.7, clip(H, 'talk'), mood(H, 'happy'), call(() => [60, 62, 64, 65, 67].forEach((m, i) => setTimeout(() => ctx.note(m, 0.25, { timbre: 'keys', vel: 0.25 }), i * 180))), word('do re mi', 'hero:top', { size: 3, color: '#2ee6ff', ms: 900 }));
  if (stat === 'tech') R.at(0.1, clip(H, 'v_stretch', { dur: 0.8 })).at(0.4, drum('t'), word('crack', [0.35, 0.4], { size: 3, color: '#fff6e8', ms: 500 })).at(0.7, drum('t'), word('crack', [0.6, 0.35], { size: 3, color: '#fff6e8', ms: 500 })).at(0.9, clip(H, 'battle', { bpm: 100 }), mood(H, 'angry'));
  if (stat === 'ori') R.at(0.1, spawn(ctx, nb, () => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.012), mat('#fffdf4')); const c = new THREE.Mesh(new THREE.BoxGeometry(0.166, 0.115, 0.004), mat('#ff5cb0')); c.position.z = -0.008; g.add(p, c); g.scale.setScalar(HAND); return g; }, [BOOTH.at[0], 1, BOOTH.at[1]]), hold(ctx, nb, H, { aim: 'face' }), clip(H, 'v_hold', { y: 0.95, z: 0.3 }))
    .at(0.6, word('B t ? K', [0.5, 0.58], { size: 3.6, color: '#ff5cb0', ms: 1100 }), sfx('click', { pitch: 2, quiet: true }));
  if (stat === 'show') R.at(0.1, clip(H, 'v_guns'), mood(H, 'happy'), sfx('sparkle', { quiet: true })).at(0.9, mood(H, 'sad'), clip(H, 'v_shrug'));
  const T = f === 'first' ? 2.2 : f === 'full' ? 1.5 : 0.9;
  R.at(Math.min(T - 0.3, 1.2), ctx.PAY).end(T);
  return { events: R.list() };
}
// the training games: the lead-in in the booth doorway, ending on a beat for the scene's first frame
function playIn(ctx, game) {
  const f = ctx.form, R = reel();
  if (game === 'make') return padsIn(ctx);
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 100 })).at(0.3, drum('K'), ctx.PAY).end(0.6); return { events: R.list() }; }
  R.at(0, place(H, BOOTH.at, 0), S('mcu', 28, { to: { w: 1.0 }, dur: 1.6 }));
  if (game === 'ear') R.at(0.1, clip(H, 'v_hold', { y: 1.28, x: 0.27, z: 0.08, look: 0 }), call(() => { ctx.note(64, 0.3, { timbre: 'keys', vel: 0.35 }); setTimeout(() => ctx.note(67, 0.3, { timbre: 'keys', vel: 0.35 }), 300); }), word('?', [0.6, 0.35], { size: 5, color: '#2ee6ff', ms: 800 }));
  if (game === 'tune') R.at(0.15, clip(H, 'beatbox', { bpm: 100, amp: 0.4 })).at(0.3, drum('B'), word('check', [0.4, 0.4], { size: 3, color: '#fff6e8', ms: 500 })).at(0.6, drum('B'), word('check', [0.6, 0.35], { size: 3, color: '#fff6e8', ms: 500 }));
  if (game === 'beat') ['1', '2', '3', '4'].forEach((n, i) => R.at(0.2 + i * 0.3, drum(i === 3 ? 'K' : 't'), word(n, [0.5, 0.42], { size: 6, color: '#ffd35c', ms: 300 }), i === 0 ? clip(H, 'v_nod', { n: 4 }) : null));
  if (game === 'pose') R.at(0.1, clip(H, 'v_stretch', { dur: 0.8 })).at(0.6, cue('cone', { id: 'key', at: [6.05, 2.8, -2.7], to: 'hero', color: '#fff1c9', r: 0.8, v: 1, ms: 150 }), drum('B'), clip(H, 'v_guns'));
  const T = f === 'first' ? 1.8 : 1.3; R.at(T - 0.25, ctx.PAY).end(T);
  return { events: R.list() };
}
// the beat maker (the booth menu, or the training PLAY for Originality): cut to the desk, finger drums on the four lanes, the pads light up in sequence
function padsIn(ctx) {
  const f = ctx.form, R = reel(), pd = ref(), chr = ref();
  R.at(0, spawn(ctx, pd, () => pads(0.06), [-1.2, 0.815, -4.98]));
  if (MICRO(f)) { R.at(0, call(() => pd.obj && pd.obj.userData.light(5, 1)), drum('B')).at(0.4, ctx.PAY).end(0.7); return { events: R.list(), letterbox: false }; }
  R.at(0, place(H, [-1.15, -4.45], 195), clip(H, 'v_type', { seat: 0.5 }), spawn(ctx, chr, chair, [-1.15, 0, -4.43], 195 * Math.PI / 180), cam([-0.1, 1.6, -4.62], [-1.2, 0.82, -4.98], 34, { to: { pos: [-0.2, 1.56, -4.66] }, dur: 1.6 }));
  [0, 5, 10, 15, 1, 6, 11, 12].forEach((p, i) => R.at(0.15 + i * 0.15, drum(['B', 't', 'K', 't'][i % 4], { vel: 0.7 }), call(() => { if (!pd.obj) return; for (let k = 0; k < 16; k++) pd.obj.userData.light(k, k === p ? 1 : 0.15); })));
  R.at(1.4, S('mcu', 72, Object.assign({ h: 1.6, lookH: 1.32, w: 1.05 }, xf(220))), mood(H, 'happy'), call(() => { if (pd.obj) for (let k = 0; k < 16; k++) pd.obj.userData.light(k, 0.9); }), drum('K'));
  const T = f === 'first' ? 2.1 : 1.8; R.at(T - 0.3, ctx.PAY).end(T);
  return { events: R.list() };
}
// the sound recorder: lean into the mic in the booth doorway, the REC lamp comes on
function recordIn(ctx) {
  const f = ctx.form, R = reel(), rec = ref();
  R.at(0, spawn(ctx, rec, () => glowBall('#ff2a3a', 0.1), [6.05, 1.98, -3.22]), off(rec));
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 96 })).at(0.3, onV(rec), drum('B'), ctx.PAY).end(0.7); return { events: R.list() }; }
  R.at(0, place(H, BOOTH.at, 0), clip(H, 'beatbox', { bpm: 96, amp: 0.3 }), S('mcu', 24, { h: 1.55, lookH: 1.35, to: { w: 0.9 }, dur: 1.8 }));
  R.at(0.5, onV(rec), sfx('record'), stamp('REC|●', 900));
  R.at(0.9, drum('B'), word('B', 'hero:mouth', { size: 5, color: '#ffd35c', ms: 600 }), cue('fx', { kind: 'rings', at: 'hero:mouth', color: '#ff3ea5', n: 2 }));
  if (f === 'first') R.at(1.5, mood(H, 'happy'), clip(H, 'cheer')).at(2.2, mood(H, 'neutral'), clip(H, 'beatbox', { bpm: 96, amp: 0.6 }), drum('B'));
  const T = f === 'first' ? 2.8 : 1.6; R.at(T - 0.3, stamp(''), ctx.PAY).end(T);
  return { events: R.list() };
}

// ======================================================================= WARDROBE AND THE MIRROR (2.7)
const WARD = { at: [-6.2, -2.95], mirror: [-4.9, -0.55], mface: -113, mcam: [-7.0, 1.75, -1.45] };
function wardrobeIn(ctx) {
  const f = ctx.form, R = reel(), sock = ref();
  if (MICRO(f)) { R.at(0, clip(H, 'v_reach', { to: [0.15, 1.1, 0.5], hold: 0.15 }), sfx('door', { pitch: 1.3 })).at(0.4, ctx.PAY).end(0.75); return { events: R.list() }; }
  R.at(0, place(H, WARD.at, -90), clip(H, 'v_reach', { to: [0.12, 1.15, 0.52], hold: 0.3 }), S('fs', 170, { h: 1.6, lookH: 0.95, to: { w: 2.0 }, dur: 1.4 }), sfx('door', { pitch: 1.2 }));
  R.at(0.5, spawn(ctx, sock, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.16), mat('#ff6ec7')); m.scale.setScalar(HAND); return m; }, [-6.75, 1.0, -2.75]),
    anim(ctx, (T) => { const o = sock.obj; if (!o) return; const u = Math.min(1, T / 0.4), k = Math.max(0, (T - 0.6) / 0.35); o.position.set(-6.75 + u * 0.25 - Math.min(1, k) * 0.35, Math.max(0.03, 1.0 - u * u * 0.97 + (k > 0 && k < 1 ? Math.sin(k * Math.PI) * 0.35 : 0)), -2.75 + u * 0.1); o.rotation.set(u * 3, T * 2, 0); o.visible = k < 1; }));
  R.at(1.1, drum('K'), word('in', [0.35, 0.62], { size: 3, color: '#ffd35c', ms: 500 }));
  const T = f === 'first' ? 1.8 : 1.4; R.at(T - 0.25, ctx.PAY).end(T);
  return { events: R.list() };
}
// the mirror check: through-the-mirror shots are the room seen from the mirror and flipped (what a mirror shows), framed by the mirror's edge
function mirrorFlip(on) {
  return call(() => {
    const gl = document.getElementById('gl'); if (gl) gl.style.transform = on ? 'scaleX(-1)' : '';
    let fr = document.getElementById('vig-mirror'); if (on && !fr && gl && gl.parentElement) { fr = document.createElement('div'); fr.id = 'vig-mirror'; fr.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2;box-shadow:inset 0 0 0 10px #5a3d2a,inset 0 0 44px 18px rgba(180,200,255,.22);background:linear-gradient(115deg,rgba(255,255,255,0) 40%,rgba(255,255,255,.07) 48%,rgba(255,255,255,0) 56%)'; gl.parentElement.appendChild(fr); }
    if (!on && fr) fr.remove();
  });
}
function wardrobeOut(ctx) {
  const f = ctx.form, R = reel(), slot = (ctx.extra && ctx.extra.slot) || 'hat';
  if (MICRO(f)) { R.at(0, clip(H, 'v_guns'), sfx('equip')).at(0.45, ctx.PAY).end(0.9); return { events: R.list() }; }
  ctx.own(() => { const gl = document.getElementById('gl'); if (gl) gl.style.transform = ''; const fr = document.getElementById('vig-mirror'); if (fr) fr.remove(); });
  // 1 MS from behind: the hero walks up to the mirror
  R.at(0, place(H, WARD.mirror, WARD.mface), clip(H, 'idle'), cam([-3.4, 3.0, -0.2], [-5.9, 0.9, -1.0], 44, { to: { pos: [-3.6, 2.85, -0.3] }, dur: 1.3 }), sfx('equip'));
  // 2 MCU through the mirror: left, right, the touch on what changed
  R.at(0.9, mirrorFlip(true), cam([-7.0, 2.05, -1.45], [-4.9, 1.0, -0.55], 44, { to: { pos: [-6.95, 2.0, -1.4] }, dur: 2.2 }), clip(H, 'v_check', { slot }), mood(H, 'happy'));
  // 3 the pose: finger guns at the reflection
  const tp = f === 'short' ? 1.4 : 3.1;
  R.at(tp, clip(H, 'v_guns'), drum('B'), word('B', [0.5, 0.3], { size: 5, color: '#ffd35c', ms: 500 }), ctx.PAY);
  if (f === 'first') R.at(tp + 0.7, drum('K'), clip(H, 'v_guns', {}), word('again', [0.5, 0.62], { size: 3, color: '#fff6e8', ms: 600 }));
  R.at(tp + (f === 'first' ? 1.4 : 0.8), mirrorFlip(false)).end(tp + (f === 'first' ? 1.6 : 1.0));
  return { events: R.list() };
}

// ======================================================================= WAIT and REFUSALS (2.14, 2.15): MICRO only, in the gameplay camera
function micro1(ctx, clipName, opts, beats, dur) {
  const R = reel(); R.at(0, clip(H, clipName, opts || {})); (beats || []).forEach(([t, ...c]) => R.at(t, ...c)); R.at(Math.min((dur || 0.9) - 0.25, 0.6), ctx.PAY).end(dur || 0.9);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}
const wait = (ctx) => micro1(ctx, 'v_nod', { n: 1 }, [[0.1, sfx('click', { pitch: 0.7, quiet: true })], [0.3, stamp(clockAt(ctx, 0), 500)]], 0.8);
const REFUSALS = {
  'p1.refuse.cash': (ctx) => micro1(ctx, 'v_pockets', {}, [[0.6, word('...', 'hero:top', { size: 3, color: '#c9c3dd', ms: 500 })], [0.9, cue('fx', { kind: 'sparks', at: 'hero:head', color: '#c9b9a0', n: 6 })]], 1.3),
  'p1.refuse.tired': (ctx) => micro1(ctx, 'v_yawn', {}, [[0.55, drum('t', { vel: 0.4 }), word('yawn', 'hero:mouth', { size: 3, color: '#c9c3dd', ms: 500 })]], 1.2),
  'p1.refuse.sleep': (ctx) => micro1(ctx, 'v_shrug', {}, [[0.2, word('not sleepy', 'hero:top', { size: 2.8, color: '#2ee6ff', ms: 700 })]], 1.0),
  'p1.refuse.nap': (ctx) => micro1(ctx, 'point', { dir: -0.6 }, [[0.5, clip(H, 'point', { dir: 0.6 })]], 1.1),
  'p1.refuse.late': (ctx) => micro1(ctx, 'v_yawn', {}, [[0.5, word('bed', 'hero:top', { size: 3, color: '#2ee6ff', ms: 600 })]], 1.1),
  'p1.refuse.tape': (ctx) => micro1(ctx, 'v_reach', { to: [0.2, 1.0, 0.45], hold: 0.15 }, [[0.45, drum('t', { vel: 0.5 })], [0.6, drum('t', { vel: 0.5 }), word('tomorrow', 'hero:top', { size: 2.8, color: '#ffd35c', ms: 600 })]], 1.1),
  'p1.refuse.stream': (ctx) => micro1(ctx, 'v_shrug', {}, [[0.1, word('0', [0.5, 0.35], { size: 5, color: '#ff3a5c', ms: 600 })], [0.4, sfx('click', { pitch: 2.2, quiet: true }), word('chirp', [0.7, 0.3], { size: 2.6, color: '#9dff4a', ms: 500 })]], 1.1),
  'p1.refuse.release': (ctx) => micro1(ctx, 'v_shrug', {}, [[0.2, word('99%', [0.5, 0.35], { size: 4, color: '#ff3a5c', ms: 700 })]], 1.0),
};

// ======================================================================= the table
export const VIGNETTES = Object.assign({
  'p1.eat.banana': eatBanana, 'p1.eat.oats': (c) => eatTable(c, 'oats'), 'p1.eat.dates': eatDates, 'p1.eat.bowl': (c) => eatTable(c, 'bowl'), 'p1.eat.smoothie': eatSmoothie, 'p1.eat.tea': eatTea,
  'p1.nap': nap, 'p1.sleep': sleepScene, 'p1.wake': wake,
  'p1.couch.rest': couchRest, 'p1.stream': stream, 'p1.train.quick': quick,
  'p1.train.idle.mus': (c) => boothIn(c, 'mus'), 'p1.train.idle.tech': (c) => boothIn(c, 'tech'), 'p1.train.idle.ori': (c) => boothIn(c, 'ori'), 'p1.train.idle.show': (c) => boothIn(c, 'show'),
  'p1.train.play.ear': (c) => playIn(c, 'ear'), 'p1.train.play.tune': (c) => playIn(c, 'tune'), 'p1.train.play.beat': (c) => playIn(c, 'beat'), 'p1.train.play.make': (c) => playIn(c, 'make'), 'p1.train.play.pose': (c) => playIn(c, 'pose'),
  'p1.beatmaker.in': padsIn, 'p1.record.in': recordIn, 'p1.tune.in': (c) => playIn(c, 'tune'),
  'p1.wardrobe.in': wardrobeIn, 'p1.wardrobe': wardrobeOut,
  'p1.wait': wait,
}, REFUSALS);
export const WORLD = 'flat';
