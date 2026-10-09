// VIGNETTES: THE THRIFT SHOP (world 'shop', owner VIG town crew). VIGNETTES.md 2.10 (try on, buy, wear, the shelves job) and the shop's refusals (2.15), written for the
// vignette runtime (r3/vig.js) and the cutscene engine. Each entry: VIGNETTES[id](ctx) -> { events, ... }; every id has FIRST / FULL / SHORT / MICRO (MICRO: one clip in the
// gameplay camera, under 1.5 s). The try on is MICRO in every form: it happens many times a minute, and it plays under the open shop panel without touching the drag to spin camera.
// Staging (shop.js, metres, +z toward the gameplay camera; face 0 = +z, 90 = +x, 180 = north). The cast is chibi (a 0.9 m head on 1.72 m): a medium shot needs 3.5 m of room,
// so every camera stays INSIDE the room (x -5..5, z -4..4): the low south and east walls are brick to the shoulder, a camera behind them sees bricks.
//   counter x 2.45..4.75, z -2.38..-1.72, top 1.0 (register 3.35..3.75; bell 2.85,-2.0; jars 3.0,-2.15 and 3.15,-1.95); the clerk's mark (3.55,-3.0) faces south
//   try on platform centre (-3.55, 2.2), r 1.0, deck 0.14 high; the mirror plane x -5.04 (a real mirrored copy of the player), ring light (-2.15, 1.62, 1.1)
//   tops rail x -2.85..-0.35 at z -1.3, 1.5 high; the open floor x -2..2, z 0..3.5 (the jobs happen there)
import { cue, shot, clip, place, face, look, mood, sfx, drum, word, say, call, ref, spawn, hold, put, gone, withProp, anim, BEAT } from './vignette_kit.js';
import { glowBall } from './vignette_props.js';
import { scanner, shopBag, cash, envelope, hanger, jumper, lanyard, donationBox, folded, moth } from './vig_town_props.js';
import { H, reel, S, xf, cam, MICRO, micro1, trm, coins, fullFrame, itemOf, slotColor, bbh, show, mirrorPOV } from './vig_town_kit.js';

const TOP = 1.0, HERO_AT = [2.85, -1.42], CLERK_AT = [2.85, -2.62], ITEM_AT = [2.62, TOP, -1.96];
const MIR = { c: [-3.55, 2.2], y: 0.14 };
// the coverage at the counter: the room wide from the door side, over the hero's shoulder onto the clerk, and the reverse from the north wall onto the hero's face
const COUNTER_WIDE = (o) => cam([4.75, 2.55, 1.9], [2.85, 1.0, -2.0], 44, o);
const OTS_CLERK = (o) => S('mcu', 18, Object.assign({ w: 1.45, h: 1.78, lookH: 1.05, fov: 38 }, o), 'clerk');
const HERO_CU = (o) => cam([1.75, 1.82, -3.82], [2.8, 1.1, -1.42], 58, o);
const FLOOR = { at: [0.3, 0.45], box: [0.74, 0, 0.89], clerk: [1.6, 0.0] };
const FLOOR_CAM = (o) => cam([1.6, 2.3, 3.75], [0.75, 0.85, 0.3], 50, o);
const shopLook = () => { try { const S0 = bbh().Eng.scene; return (S0 && S0.shop && S0.shop.look) || null; } catch (e) { return null; } };
const saveLook = () => { try { return bbh().G.ch.look; } catch (e) { return null; } };
const setLook = (ctx, l) => call(() => { try { if (l) ctx.world.setLook(l); } catch (e) { /* ignore */ } });

// ======================================================================= TRY ON (MICRO in every form)
// extra (from r3/vig.js): { from (the look before the tap), to (the look tried on), tab, restore() (puts the panel's current look back) }
function tryon(ctx) {
  const ex = ctx.extra || {}, tab = ex.tab || 'top', R = reel();
  ctx.own(() => { try { if (ex.restore) ex.restore(); } catch (e) { /* ignore */ } });
  if (ex.from) R.at(0, setLook(ctx, ex.from));
  if (tab === 'hat') {
    R.at(0, clip(H, 'v_hattip')).at(0.16, setLook(ctx, ex.to), drum('K'), word('pop', 'hero:top', { size: 3, color: '#ffd35c', ms: 420 }));
  } else if (tab === 'glasses') {
    R.at(0, clip(H, 'v_shades')).at(0.24, setLook(ctx, ex.to), drum('t'), sfx('swoosh', { pitch: 1.8, quiet: true })).at(0.36, word('oh?', 'hero:top', { size: 3, color: '#2ee6ff', ms: 420 }));
  } else {
    R.at(0, clip(H, 'v_spin', { dur: 0.6, dir: ctx.n % 2 ? -1 : 1 }), sfx('swoosh', { pitch: 1.3, quiet: true })).at(0.3, setLook(ctx, ex.to), drum('K')).at(0.6, drum('t', { vel: 0.5 }));
  }
  // every 8th try on: the clerk glances over the counter, one eyebrow up, then back to the till
  if (ctx.n % 8 === 7) R.at(0.05, look('clerk', 'hero:head'), mood('clerk', 'happy')).at(0.62, look('clerk', null));
  R.at(0.45, ctx.PAY).end(0.75);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}

// ======================================================================= BUY (the clerk scans, bags it with a doodle, the cash lands with a pff)
function doodleFor(it, ctx) { return it.price >= 80 ? 'crown' : it.id === 'catears' ? 'cat' : it.id === 'cowboy' ? 'cowboy' : ctx.pick(2) ? 'heart' : 'star'; }
function buy(ctx) {
  const f = ctx.form, it = itemOf(ctx.action), price = it.price, R = reel(), sc = ref(), item = ref(), bag = ref(), money = ref(), first = f === 'first';
  const hat = it.group === 'hat', tryL = shopLook() || ctx.look, before = saveLook();
  if (MICRO(f)) {
    R.at(0, clip(H, 'v_nod', { n: 1 })).at(0.25, drum('Pf'), word('-$' + price, 'hero:top', { size: 3.4, color: '#9dff4a', ms: 600 })).at(0.4, ctx.PAY).end(0.85);
    return { events: R.list(), letterbox: false, hide: false, max: 2 };
  }
  // hats are not bagged: the hero leans in and the clerk crowns them (the preview hat comes off first, so it can go back on)
  const bare = hat && before ? Object.assign({}, tryL, { hat: before.hat }) : null;
  R.at(0, fullFrame(ctx), place(H, HERO_AT, 180), place('clerk', CLERK_AT, 0), clip(H, 'idle'), bare ? setLook(ctx, bare) : null,
    hat ? null : spawn(ctx, item, () => folded(slotColor(tryL, it.group)), ITEM_AT, 0.2));
  let t = 0;
  if (first) {
    // 1 the room from the door side: the hero sets the pick on the counter, the clerk looks it over (a beat)
    R.at(0, COUNTER_WIDE({ to: { pos: [4.3, 2.3, 0.85] }, dur: 1.6 }), clip(H, 'v_pat', { y: 1.02, z: 0.45, n: 1 }), sfx('swoosh', { pitch: 0.7, quiet: true }));
    R.at(0.15, clip('clerk', 'idle'), look('clerk', ITEM_AT)).at(0.6, drum('B', { vel: 0.5 }), word(it.name.toUpperCase(), [0.5, 0.3], { size: 3, color: '#fff6e8', ms: 900 }));
    t = 1.3;
  }
  // 2 over the hero's shoulder: the price gun comes up, two beeps (two hi hats), the red beam on the tag
  R.at(t, OTS_CLERK(f === 'short' ? {} : Object.assign({ to: { w: 1.25 }, dur: 1.1 }, first ? xf(260) : {})));
  R.at(t + 0.05, clip('clerk', 'v_pat', { y: 1.22, z: 0.36, x: 0.06, n: 2 }), spawn(ctx, sc, scanner, [CLERK_AT[0], 1, CLERK_AT[1]]), hold(ctx, sc, 'clerk', { aim: [ITEM_AT[0], TOP, ITEM_AT[2]], back: -0.05 }), look('clerk', ITEM_AT));
  R.at(t + 0.4, clip('clerk', 'v_pat', { y: 1.22, z: 0.36, x: 0.06, n: 2 }));   // (again: the clerk's hello wave must not take the hand)
  [0, 1].forEach((i) => R.at(t + 0.35 + i * BEAT * 0.5, drum('t'), sfx('click', { pitch: 2.2, quiet: true }), withProp(sc, (p) => p.userData.beam(1)), word('beep', [0.38 + i * 0.18, 0.34 - i * 0.04], { size: 2.8, color: '#ff3a3a', ms: 360 })).at(t + 0.47 + i * BEAT * 0.5, withProp(sc, (p) => p.userData.beam(0))));
  if (f === 'short') { R.at(t + 0.85, drum('Pf'), word('-$' + price, [0.5, 0.62], { size: 3.4, color: '#9dff4a', ms: 600 }), ctx.PAY).end(t + 1.2); return { events: R.list() }; }
  t += 1.1;
  // 3 the bag and the doodle note (a hat goes straight on the head: the hero leans in, the clerk crowns them on the kick)
  const dood = doodleFor(it, ctx);
  if (hat) {
    R.at(t, gone(ctx, sc), HERO_CU(xf(300)), clip(H, 'v_bow', { hold: 0.6 }), clip('clerk', 'v_offer', { to: 0.62 }));
    R.at(t + 0.55, setLook(ctx, tryL), drum('K'), sfx('equip'), word('crowned', [0.5, 0.3], { size: 3.2, color: '#ffd35c', ms: 700 }), cue('fx', { kind: 'sparks', at: 'hero:top', color: '#ffd35c', n: 18 }));
    t += 1.15;
  } else {
    // the bag opens on the counter, the pick drops in from above, the note is slapped on with a doodle
    R.at(t, gone(ctx, sc), spawn(ctx, bag, () => shopBag(), [ITEM_AT[0], TOP, ITEM_AT[2] - 0.04], 0.15), withProp(bag, (p) => p.userData.fill(0)), clip('clerk', 'v_pat', { y: 1.25, z: 0.36, x: 0.08, n: 1 }));
    R.at(t, anim(ctx, (T) => { const o = item.obj; if (!o) return; const u = Math.min(1, T / 0.45); o.position.set(ITEM_AT[0], TOP + 0.62 - u * 0.4, ITEM_AT[2]); o.scale.setScalar(1.45 * (1 - 0.5 * u)); o.visible = u < 1; }));
    R.at(t + 0.45, drum('B', { vel: 0.6 }), withProp(bag, (p) => p.userData.fill(1)), sfx('swoosh', { pitch: 0.6, quiet: true }));
    R.at(t + 0.75, drum('K'), withProp(bag, (p) => p.userData.note(dood)), word('slap', [0.36, 0.44], { size: 3, color: '#ffe14d', ms: 420 }));
    t += 1.1;
  }
  // 4 the reverse: the cash on the counter, a soft pff (the Pf snare). PAY
  R.at(t, COUNTER_WIDE(xf(260)), clip(H, 'v_pat', { y: 1.02, z: 0.44, n: 1 }), spawn(ctx, money, () => cash(3), [HERO_AT[0], 1, HERO_AT[1]]), hold(ctx, money, H, { aim: 'up', back: -0.03 }));
  R.at(t + 0.32, put(ctx, money, [2.95, TOP + 0.01, -1.84], 0.3), drum('Pf'), sfx('swoosh', { pitch: 0.45, quiet: true }), word('pff', [0.55, 0.62], { size: 3, color: '#9dff4a', ms: 420 }), ctx.PAY);
  R.at(t + 0.62, gone(ctx, money));
  t += 0.85;
  // 5 the bag comes over the counter, a nod each (FIRST and FULL)
  if (!hat) R.at(t, hold(ctx, bag, H, { aim: 'up', back: -0.02 }), clip(H, 'v_hold', { y: 0.78, z: 0.22, look: 0.2 }), mood(H, 'happy'), COUNTER_WIDE(xf(300)));
  R.at(t, clip('clerk', 'v_nod', { n: 1 }), first ? say('clerk', dood === 'crown' ? 'Big spender.' : dood === 'cat' ? 'Meow.' : dood === 'cowboy' ? 'Yeehaw?' : 'Wear it loud.', { dur: 1.3 }) : null, first ? null : clip(H, 'v_nod', { n: 1 }));
  R.end(t + (first ? 1.35 : 0.7));
  return { events: R.list() };
}

// ======================================================================= WEAR IT (the try on platform turns on the beat, the bulbs pop, the mirror's view, the pose)
const BULBS = []; for (let i = 0; i < 9; i++) BULBS.push([-4.93, 2.27, 2.92 - i * 0.18]);
const MIRROR_WIDE = (o) => cam([-0.9, 2.15, 3.75], [-3.75, 1.0, 2.2], 42, o);
const MIRROR_EYE = (o) => cam([-4.92, 1.45, 2.25], [-3.55, 1.12, 2.2], 64, o);   // what the glass sees (shown flipped)
function wear(ctx) {
  const f = ctx.form, R = reel(), first = f === 'first', bulbs = BULBS.map(() => ref()), shirt = ref(), it = itemOf(ctx.action);
  if (MICRO(f)) { R.at(0, clip(H, 'v_guns'), sfx('equip')).at(0.45, ctx.PAY).end(0.9); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  R.at(0, fullFrame(ctx));
  bulbs.forEach((b, i) => R.at(0, spawn(ctx, b, () => glowBall('#ffd9a0', 0.12), BULBS[i])));
  let t = 0;
  if (f !== 'short') {
    // 1 WS the platform turns 40 degrees a beat (the hero rides it), the hollywood bulbs pop on two by two
    R.at(0, place(H, MIR.c, 70, { y: MIR.y }), clip(H, 'idle'), MIRROR_WIDE({ to: { pos: [-1.1, 2.05, 3.5] }, dur: 2.6 }), sfx('equip'));
    [0, 1, 2, 3].forEach((i) => R.at(0.25 + i * BEAT, face(H, 70 - (i + 1) * 40, 220), drum(i === 3 ? 'K' : 't', { vel: 0.6 }), call(() => { [bulbs[i * 2], bulbs[i * 2 + 1], i === 3 ? bulbs[8] : null].forEach((b) => b && b.obj && b.obj.userData.setV(1)); })));
    t = 0.25 + 4 * BEAT;
  } else { R.at(0, place(H, MIR.c, -90, { y: MIR.y }), call(() => bulbs.forEach((b) => b.obj && b.obj.userData.setV(1)))); }
  // 2 the mirror's view (flipped): the hero checks what changed
  R.at(t, face(H, -90, 160), mirrorPOV(ctx, true), MIRROR_EYE({ to: { pos: [-4.92, 1.42, 2.12] }, dur: 1.8 }), clip(H, 'v_check', { slot: it.group === 'hat' ? 'hat' : it.group === 'glasses' ? 'glasses' : 'collar' }), mood(H, 'happy'));
  t += f === 'short' ? 0.5 : 1.6;
  // 3 the first move of the pose game: freeze. PAY
  R.at(t, clip(H, 'v_guns'), drum('B'), word('FREEZE', [0.5, 0.26], { size: 4, color: '#ffd35c', ms: 600 }), cue('flash', { color: '#fff6e8', ms: 140 }), ctx.PAY);
  if (!first) { R.at(t + (f === 'short' ? 0.45 : 0.8), mirrorPOV(ctx, false)).end(t + (f === 'short' ? 0.5 : 0.9)); return { events: R.list() }; }
  // FIRST: the fan greeting rehearsal in the glass (a wave, a cooler wave, a nod), then the turn: the clerk has been watching. Both pretend nothing happened
  R.at(t + 0.8, clip(H, 'wave'), word('hi', [0.42, 0.34], { size: 3, color: '#2ee6ff', ms: 500 })).at(t + 1.6, clip(H, 'v_guns'), word('hey', [0.56, 0.32], { size: 3.4, color: '#ff6ec7', ms: 500 })).at(t + 2.3, clip(H, 'v_nod', { n: 1, deep: true }));
  R.at(t + 0.8, place('clerk', [-1.35, 1.55], -100), clip('clerk', 'v_polish'), spawn(ctx, shirt, () => folded('#2ee6ff'), [-1.35, 1, 1.55]), hold(ctx, shirt, 'clerk', { aim: 'up', back: -0.04 }), look('clerk', 'hero:head'));
  R.at(t + 3.3, mirrorPOV(ctx, false), face(H, 75, 260), look(H, 'clerk:head'), mood(H, 'neutral'), cam([-0.7, 1.95, 1.2], [-3.55, 1.3, 2.25], 42));
  R.at(t + 3.95, mood('clerk', 'neutral'));
  R.at(t + 4.6, MIRROR_WIDE(xf(300)), look(H, null), look('clerk', null), face(H, -90, 400), clip(H, 'v_check', { slot: 'collar' }), clip('clerk', 'v_polish', { fast: true }), sfx('click', { pitch: 1.4, quiet: true }));
  R.end(t + 5.4);
  return { events: R.list() };
}

// ======================================================================= THE SHELVES JOB (TRM, 120 min) on the open floor and the end of the tops rail
const RAIL_END = { at: [-0.05, -1.3], cam: [1.45, 1.85, 1.45], look: [-0.45, 1.3, -1.3] };
function shelves(ctx) {
  const f = ctx.form, R = reel(), bx = ref(), jm = ref(), ly = ref(), en = ref(), first = f === 'first', hangers = [0, 1, 2, 3, 4, 5].map(() => ref());
  if (MICRO(f)) { R.at(0, clip(H, 'v_hang', { every: 0.3 })); [0, 1, 2, 3].forEach((i) => R.at(0.15 + i * 0.15, drum('t', { vel: 0.6 }))); R.at(0.6, ctx.PAY).end(0.95); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  R.at(0, fullFrame(ctx));
  let t = 0;
  if (f !== 'short') {
    // A: the donation box hits the floor (a dust puff on the downbeat), the flaps open
    R.at(0, place(H, FLOOR.at, 45), clip(H, 'v_pat', { y: 0.55, z: 0.5, n: 1 }), spawn(ctx, bx, donationBox, FLOOR.box, 0.8), withProp(bx, (p) => p.userData.flap(0)), FLOOR_CAM({ to: { pos: [1.4, 1.85, 3.5] }, dur: 1.2 }));
    trm(R, ctx, 0, -120, 120);
    R.at(0.35, drum('B'), cue('fx', { kind: 'sparks', at: [FLOOR.box[0], 0.15, FLOOR.box[2]], color: '#c9b9a0', n: 24 }), word('thud', [0.42, 0.66], { size: 3, color: '#c9b9a0', ms: 420 }));
    R.at(0.6, anim(ctx, (T) => { if (bx.obj) bx.obj.userData.flap(Math.min(1, T / 0.3)); }), sfx('swoosh', { pitch: 1.2, quiet: true }));
    t = 1.15;
  }
  // B: the end of the tops rail, hangers in sixteenths (the fastest the hero ever is): click click click
  R.at(t, place(H, RAIL_END.at, -90), clip(H, 'v_hang', { y: 1.42, every: 0.3 }), cam(RAIL_END.cam, RAIL_END.look, 40, { to: { pos: [1.25, 1.8, 1.2] }, dur: 1.2, cut: 'whip', ms: 240 }));
  trm(R, ctx, t, -80, 120);
  hangers.forEach((h, i) => R.at(t + 0.15 + i * 0.15, spawn(ctx, h, hanger, [-0.42 - i * 0.07, 1.42, -1.3], Math.PI / 2), drum('t', { vel: 0.55 + 0.08 * (i % 2) }), i % 2 ? null : sfx('click', { pitch: 2.4, quiet: true })));
  t += 1.15;
  if (f !== 'short') {
    // C: the terrible jumper held up at arm's length; a look to the clerk; the clerk shakes the head; into the NO pile
    R.at(t, place(H, FLOOR.at, 40), place('clerk', FLOOR.clerk, -115), clip(H, 'v_hold', { y: 1.2, z: 0.36, look: 0.3 }), spawn(ctx, jm, () => { const j = jumper(); j.scale.setScalar(1.4); return j; }, [FLOOR.at[0], 1.2, FLOOR.at[1]]), hold(ctx, jm, H, { aim: 'up', back: 0.0 }),
      FLOOR_CAM({ cut: 'whip', ms: 240 }));
    trm(R, ctx, t, -40, 120);
    R.at(t + 0.5, look(H, 'clerk:head'), clip('clerk', 'v_no', { n: 3, fold: true }), mood('clerk', 'angry'));
    R.at(t + 1.15, look(H, null), clip(H, 'v_reach', { to: [0.35, 1.0, 0.3], hold: 0.1 }), anim(ctx, (T) => { const o = jm.obj; if (!o) return; if (jm.follow) jm.follow.on = false; const u = Math.min(1, T / 0.55); o.position.set(0.6 - 0.9 * u, 1.3 + Math.sin(u * Math.PI) * 0.5 - 1.2 * u, 0.7 + 0.6 * u); o.rotation.set(u * 3, u * 2, 0); }));
    R.at(t + 1.7, drum('K'), word('NO', [0.3, 0.66], { size: 4.4, color: '#ff3a5c', ms: 520 }), mood('clerk', 'neutral'));
    t += 2.0;
  }
  // D: FIRST: the old office lanyard in the box. The hero holds it for a beat (silence), then puts it in the NO pile. Then the clerk's envelope, $20. PAY
  if (first) {
    R.at(t, place(H, FLOOR.at, 10), clip(H, 'v_hold', { y: 1.08, z: 0.34, look: 1 }), spawn(ctx, ly, lanyard, [FLOOR.at[0], 1.05, FLOOR.at[1]]), show(ctx, ly, H, {}), S('cu', 0, Object.assign({ h: 1.4, lookH: 1.0, w: 1.15, fov: 44, to: { w: 1.0 }, dur: 2.2 }, xf(400))), mood(H, 'sad'), cue('vignette', { v: 0.8, ms: 600 }));
    R.at(t + 1.7, clip(H, 'v_reach', { to: [0.35, 0.9, 0.35], hold: 0.15 }), mood(H, 'neutral')).at(t + 2.05, gone(ctx, ly), drum('K', { vel: 0.5 }), cue('vignette', { v: 0, ms: 400 }));
    t += 2.4;
  }
  R.at(t, place(H, FLOOR.at, 75), place('clerk', [1.4, 0.63], -100), clip('clerk', 'v_offer', { to: 0.5 }), spawn(ctx, en, envelope, [1.3, 1.0, 0.63]), hold(ctx, en, 'clerk', { hand: 'R', aim: 'up', back: -0.03 }),
    FLOOR_CAM(f === 'short' ? {} : xf(320)));
  trm(R, ctx, t, 0, 120);
  R.at(t + 0.5, hold(ctx, en, H, { aim: 'up', back: -0.03 }), clip(H, 'v_hold', { y: 0.95, z: 0.3, look: 0.6 }), withProp(en, (p) => p.userData.open(1)), clip('clerk', 'v_nod', { n: 1 }), mood(H, 'happy'), ctx.PAY);
  coins(R, ctx, t + 0.55, 3, 'hero:top');
  R.end(t + (f === 'short' ? 1.3 : 1.7));
  return { events: R.list() };
}

// ======================================================================= REFUSALS (MICRO, the gameplay camera)
function refuseCash(ctx) {
  const R = reel(), m = ref(), once = ctx.n === 0 || ctx.pick(3) === 0;
  R.at(0, clip(H, 'v_pockets'));
  if (once) R.at(0.95, spawn(ctx, m, moth, [0, 0, 0]), anim(ctx, (T) => { const o = m.obj, a = ctx.api && ctx.api.actor(H); if (!o || !a) return; const p = a.o.position; o.position.set(p.x + 0.25 + T * 0.3 + Math.sin(T * 9) * 0.05, 0.75 + T * 0.9, p.z + 0.25 + Math.cos(T * 7) * 0.06); o.userData.flap(T); }));
  R.at(0.6, word('...', 'hero:top', { size: 3, color: '#c9c3dd', ms: 500 })).at(0.85, ctx.PAY).end(1.2);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}
const REFUSALS = {
  'p1.refuse.cash': refuseCash,
  'p1.refuse.tired': (ctx) => micro1(ctx, 'v_yawn', {}, [[0.55, drum('t', { vel: 0.4 }), word('yawn', 'hero:mouth', { size: 3, color: '#c9c3dd', ms: 500 })]], 1.2),
};

export const VIGNETTES = Object.assign({ 'p1.shop.tryon': tryon, 'p1.shop.buy': buy, 'p1.shop.wear': wear, 'p1.job.shelves': shelves }, REFUSALS);
export const WORLD = 'shop';
void shot;
