// VIGNETTES: THE PARK (world 'park', owner VIG park crew). The scenes of VIGNETTES.md 2.8 (busk, jam, bench, run, flyers), 2.9 (BeeAmGee's bench), 2.13 (the park gate)
// and the park refusals of 2.15, written for the vignette runtime (r3/vig.js) and the cutscene engine (park3d/cine.js, CINE.md). Same contract as vig_flat.js: VIGNETTES[id](ctx) -> { events, ... },
// four lengths per id (FIRST, FULL, SHORT, MICRO under 1.5 s in the gameplay camera), reels built on an absolute clock (R.at(t, cues)) and sorted.
// The story films (firstJam, sightJam, sightBusk, meet, pigpen, famous in cine_reels.js) are never duplicated here: r3/vig.js plays no outro when a story beat is in the held effects.
// Staging notes (terrain.js anchors, metres, +z = south towards the gate, face 0 = +z, 90 = +x):
//   busk spot (8, -8) faces 0, the crate stage backdrop at z -11.5 (string lights z -11.6), a hat with coins at (10.1, -10.7); the 'busk' path runs (4.2,-4.2) -> (7.5,-7.1)
//   the cypher JAM_AT (5.5, -20) faces 180 (the graffiti wall at z -25.6), the ring r 2.3..3.1 open towards +z; mira at (6.83, -21.06), luca at (4.17, -21.06), both facing the centre
//   benches: (-9.85,-0.18) rot 1.55, the old one (-9,-4) rot 1.1526 (BeeAmGee sits 0.55 m to its right: (-9.22,-3.5)), (-6.73,-7.19) rot 0.75; seat 0.46
//   runStart (12, 14) faces 0, the 'start' path along z 13.4..13.8 to the west; flyers corner (4, 22) faces 180, a lamp post at (-2.5, 21.6); the gate (0, 26), arch at z 26.5; start (0, 10) faces 180
//   the fountain (0, 0) radius 4.15
import { THREE } from './kit.js';
import { cue, shot, clip, place, face, look, mood, sfx, drum, word, say, stamp, call, ref, spawn, hold, put, gone, withProp, anim, BEAT } from './vignette_kit.js';
import { phone, steam, glowBall, mat } from './vignette_props.js';
import { tin, coin, cap, crate, pigeon, flyer, stack, plane, envelope, notes, earbud, cloudMic, leaf, CRATE_H } from './vig_park_props.js';
import './vig_park_clips.js';
import { crowdLook } from './char_cast.js';
import { DOOR_OUT, doorIn } from './vig_doors.js';

const H = 'hero', B = 'beeamgee', D2R = Math.PI / 180;
function reel() {
  const L = []; let n = 0;
  const R = {
    at(t, ...cs) { for (const c of cs.flat()) if (c) L.push({ t: Math.max(0, t), i: n++, e: Object.assign({}, c, { t: Math.max(0, t) }) }); return R; },
    end(t) { return R.at(t, { do: 'pulse', v: 0 }); },
    list() { return L.sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.e); },
  };
  return R;
}
const cam = (pos, lk, fov, o) => shot(Object.assign({ pos, look: lk, fov: fov || 34 }, o));
// subject relative framing (cine.js shot sizes, the chibi cast): yaw relative to the subject's facing at the cut
const SH = { ws: { w: 4.2, h: 1.9, lookH: 0.95, fov: 46 }, fs: { w: 2.4, h: 1.5, lookH: 0.85, fov: 44 }, ms: { w: 1.6, h: 1.45, lookH: 1.05, fov: 40 }, mcu: { w: 1.15, h: 1.38, lookH: 1.15, fov: 36 }, cu: { w: 0.85, h: 1.32, lookH: 1.2, fov: 30 } };
const S = (size, yaw, o) => shot(Object.assign({ on: H, yaw }, SH[size], o));
const xf = (ms) => ({ cut: 'blend', ms: ms || 380 });
const whip = { cut: 'whip', ms: 240 };
const MICRO = (f) => f === 'micro';
const F = (o, f) => (o[f] !== undefined ? o[f] : o.full);
const gy = (ctx, x, z) => { const t = ctx.world && ctx.world.terrain; const h = t && t.heightAt ? t.heightAt(x, z) : 0; return isFinite(h) ? h : 0; };
const P3 = (ctx, x, z, dy) => [x, gy(ctx, x, z) + (dy || 0), z];
// the clock text minutes before or after the save's time (the VHS stamp of a time skip)
function clockAt(ctx, dm) { const m = ((((ctx.ch ? ctx.ch.minutes : 0) + (dm || 0) + 360) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
const spent = (ctx, d) => { const a = ctx.pre && ctx.pre.minutes, b = ctx.ch && ctx.ch.minutes; return a !== undefined && b !== undefined && b > a ? b - a : d; };
const rain = (ctx) => !!(ctx.world && ctx.world.weather === 'rain');
const fxOf = (ctx, t) => (ctx.fx || []).find((f) => f.t === t) || null;
const toastOf = (ctx, re) => { const f = (ctx.fx || []).find((x) => x.t === 'toast' && re.test(x.text || '')); return f ? f.text : null; };
const bmgHere = (ctx) => { const n = (ctx.world.npcs || []).find((x) => x && x.id === B); return !!(n && n.object.visible); };
// strangers for the crowd: a seeded crowd look per index (char_cast.js), never the same three faces on a save
const stranger = (ctx, i) => crowdLook(i, 900 + ((ctx.ch && ctx.ch.day) || 1) * 7 + i * 13);
// a spawned extra: look, place, facing, clip
const extra = (ctx, id, i, at, faceDeg, clipName, opts) => ({ do: 'spawn', id, look: stranger(ctx, i), at, face: faceDeg, clip: clipName || 'idle', opts: opts || {} });
// the walkers of the park step out of the frame while a scene is staged close to their path (they come back at the end); MICRO never hides anything
function clearWalkers(ctx, x, z, r) {
  return call(() => {
    const pb = ctx.world.ctx && ctx.world.ctx.passersby; if (!pb || !pb.walkers) return; const hid = [];
    for (const w of pb.walkers) { const o = w.c.object; if (o.visible && Math.hypot(o.position.x - x, o.position.z - z) < r) { o.visible = false; hid.push(o); } }
    ctx.own(() => hid.forEach((o) => { o.visible = true; }));
  });
}
// a seated BeeAmGee gesture: his own play() turns every clip into his seated idle, so the gesture goes straight to his animator (the engine puts him back to sit at the end)
function bmg(ctx, g, o) {
  return call((api) => { const a = api.actor(B); if (!a) return; const an = a.c.anim; if (an && an.play) an.play('v_sitx', Object.assign({ seat: 0.46, slump: 1.4, g }, o || {})); a.touched.clip = 1; });
}
// fly a list of props along arcs: each item { r (ref), from [x,y,z] | fn, to [x,y,z] | fn, t0 (s after the cue), dur, h (arc height), spin, land(obj) } ; pure function of time
function flights(ctx, items) {
  const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
  const pt = (p, out) => (typeof p === 'function' ? out.copy(p()) : out.set(p[0], p[1], p[2]));
  return anim(ctx, (T) => {
    for (const it of items) {
      const o = it.r.obj; if (!o) continue; const u = (T - it.t0) / it.dur;
      if (u < 0) { o.visible = !!it.pre; if (it.pre) pt(it.from, o.position); continue; }
      if (u >= 1) { o.visible = it.stay !== false; pt(it.to, o.position); if (!it.landed) { it.landed = true; if (it.land) it.land(o); } continue; }
      it.landed = false; o.visible = true; pt(it.from, V1); pt(it.to, V2); o.position.lerpVectors(V1, V2, u); o.position.y += Math.sin(u * Math.PI) * (it.h === undefined ? 0.5 : it.h);
      if (it.spin && o.userData.spin) o.userData.spin(T); if (it.face) { o.lookAt(V2.x, V2.y, V2.z); }
    }
  });
}
const handPos = (ctx, who, side) => () => { const a = ctx.api && ctx.api.actor(who); const v = new THREE.Vector3(); if (!a) return v; a.c.object.updateMatrixWorld(true); return (side === 'R' ? a.c.anchors.handR : a.c.anchors.handL).getWorldPosition(v); };
const hostRate = (ctx, v) => cue('speed', { v, ms: 220 });

// ======================================================================= BUSK (2.8)
const BUSK = { at: [8, -8], tinZ: -7.32 };
const tinAt = (ctx) => P3(ctx, BUSK.at[0] + 0.05, BUSK.tinZ, 0);
function onCrate(ctx, R, t) {
  const cr = ref(); R.at(t, spawn(ctx, cr, crate, P3(ctx, BUSK.at[0], BUSK.at[1] - 0.04, 0)), place(H, BUSK.at, 0, { y: gy(ctx, BUSK.at[0], BUSK.at[1]) + CRATE_H }));
  return cr;
}
function buskIn(ctx) {
  const f = ctx.form, R = reel(), tn = ref(), args = (ctx.action && ctx.action.args) || {}, hard = args.style === 1 || (args.difficulty || 0) > 0.5, auto = !!args.auto, y0 = gy(ctx, BUSK.at[0], BUSK.at[1]);
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 92, amp: 0.4 })).at(0.3, drum('t', { vel: 0.5 })).at(0.55, drum('t', { vel: 0.5 }), ctx.PAY).end(0.9); return { events: R.list(), letterbox: false };
  }
  R.at(0, clearWalkers(ctx, 8, -8, 7));
  let t = 0;
  if (f !== 'short') {
    // 1 MS from the plaza side: the hero steps up onto the crate, the tin comes out of the jacket and drops upside down (it lands right side up, the rattle on the beat)
    const cr = ref(); R.at(0, spawn(ctx, cr, crate, P3(ctx, BUSK.at[0], BUSK.at[1] - 0.04, 0)), place(H, [BUSK.at[0], BUSK.at[1] + 0.62], 180, { y: y0 }), clip(H, 'walk', { speed: 1.2 }));
    R.at(0, cam(P3(ctx, 9.7, -4.6, 1.15), P3(ctx, 8, -8, 0.95), 42, { to: { pos: P3(ctx, 9.45, -4.9, 1.2) }, dur: 1.4 }));
    R.at(0, anim(ctx, (T) => { const a = ctx.api && ctx.api.actor(H); if (!a) return; const u = Math.min(1, T / 0.42), k = u * u * (3 - 2 * u); a.pos = [BUSK.at[0], BUSK.at[1] + 0.62 * (1 - k)]; a.y = y0 + CRATE_H * Math.min(1, k * 1.25) + Math.sin(u * Math.PI) * 0.06; }));
    R.at(0.42, face(H, 0, 260), clip(H, 'idle'), drum('B', { vel: 0.6 }), sfx('step', { pitch: 0.8 }));
    R.at(0.72, clip(H, 'v_throw', { at: 0.2 }), spawn(ctx, tn, tin, tinAt(ctx)), call(() => { if (tn.obj) tn.obj.visible = false; }));
    R.at(0.72, flights(ctx, [{ r: tn, from: handPos(ctx, H), to: tinAt(ctx), t0: 0.22, dur: 0.38, h: 0.25 }]));
    R.at(1.1, drum('t'), sfx('coin', { pitch: 0.7 }), sfx('click', { pitch: 0.5, quiet: true }), word('tink', [0.42, 0.7], { size: 3, color: '#c9ced9', ms: 500 }));
    t = 1.3;
  } else { onCrate(ctx, R, 0); R.at(0, spawn(ctx, tn, tin, tinAt(ctx))); }
  // HARD: the sleeves go up first (two knuckle cracks). AUTO: the hero sits on the crate, the phone is the speaker
  if (hard && f !== 'short') { R.at(t, clip(H, 'v_stretch', { dur: 0.7 }), S('ms', 25, xf(240))).at(t + 0.25, drum('t'), word('crack', [0.35, 0.36], { size: 3, color: '#fff6e8', ms: 450 })).at(t + 0.5, drum('t'), word('crack', [0.62, 0.32], { size: 3, color: '#fff6e8', ms: 450 })); t += 0.8; }
  if (auto) {
    const ph = ref();
    R.at(t, clip(H, 'v_hold', { sit: CRATE_H + 0.02, y: CRATE_H + 0.5, z: 0.32, look: 0.6 }), place(H, BUSK.at, 0, { y: y0 }), spawn(ctx, ph, () => phone(), P3(ctx, BUSK.at[0], BUSK.at[1], 1)), hold(ctx, ph, H, { aim: 'face' }),
      call(() => ph.obj && ph.obj.userData.draw((g, w, h) => { g.fillStyle = '#120d1f'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd35c'; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText('AUTO', w / 2, 60); g.fillStyle = '#2ee6ff'; for (let i = 0; i < 4; i++) g.fillRect(20 + i * 32, 110 + (i % 2) * 20, 22, 60 - (i % 2) * 20); })),
      S('ms', 20, Object.assign({ h: 1.2, lookH: 0.8 }, xf(260))), cue('beat', { pattern: 'B . t . K . t .', bpm: 92, step: 0.5, pulse: true }));
    R.at(t + 1.2, ctx.PAY).end(t + 1.5); return { events: R.list() };
  }
  // 2 LOW from the tin: the hero above, the sky and the string lights behind. Two taps on the mic, a look left and right, then the downbeat
  const tp = tinAt(ctx);
  R.at(t, cam([tp[0] + 0.6, tp[1] + 0.2, tp[2] + 2.7], [BUSK.at[0], y0 + CRATE_H + 1.05, BUSK.at[1]], 50, Object.assign({ to: { pos: [tp[0] + 0.5, tp[1] + 0.18, tp[2] + 2.45] }, dur: 1.4 }, f === 'short' ? {} : xf(260))), clip(H, 'beatbox', { bpm: 92, amp: 0.25 }), mood(H, 'happy'));
  R.at(t + 0.2, drum('t', { vel: 0.6 }), word('tap', 'hero:mouth', { size: 2.6, color: '#fff6e8', ms: 400 })).at(t + 0.5, drum('t', { vel: 0.6 }), word('tap', 'hero:mouth', { size: 2.6, color: '#fff6e8', ms: 400 }));
  if (f !== 'short') R.at(t + 0.75, look(H, P3(ctx, 4.5, -5, 1.4))).at(t + 1.15, look(H, P3(ctx, 11.5, -5, 1.4))).at(t + 1.55, look(H, null), drum('B'));
  const T = t + F({ first: 1.9, full: 1.8, short: 0.8 }, f); R.at(T - 0.2, ctx.PAY).end(T);
  return { events: R.list() };
}
// the crowd for the busk out: three people in a loose arc in front of the crate (one walks in from the path and stops), facing the hero
const AUD = [[7.35, -5.3, 160], [9.35, -6.55, 225], [8.95, -4.35, 195]];
function buskOut(ctx) {
  const f = ctx.form, R = reel(), tn = ref(), res = (fxOf(ctx, 'result') || {}).res || {}, rk = res.rank || 'B', auto = !!res.auto, top = rk === 'S' || rk === 'A', mid = rk === 'B' || rk === 'C', y0 = gy(ctx, BUSK.at[0], BUSK.at[1]);
  const nCoins = rk === 'S' ? 6 : rk === 'A' ? 5 : rk === 'B' ? 2 : rk === 'C' ? 1 : 0;
  if (MICRO(f)) {
    R.at(0, clip(H, 'v_bow', { deep: 0.5 }), sfx(nCoins ? 'coin' : 'swoosh', { pitch: 1.1, quiet: !nCoins })).at(0.45, ctx.PAY);
    if (nCoins) R.at(0.6, sfx('coin', { pitch: 1.2 })); R.end(0.95); return { events: R.list(), letterbox: false };
  }
  R.at(0, clearWalkers(ctx, 8, -6, 8), spawn(ctx, tn, tin, tinAt(ctx)), withProp(tn, (o) => o.userData.fill(0.12)));
  if (rain(ctx)) R.at(0, withProp(tn, (o) => o.userData.water(0.7)));
  const cr = onCrate(ctx, R, 0);
  const crowd = f === 'short' ? (top ? 2 : mid ? 1 : 0) : top ? 3 : mid ? 2 : 1;
  for (let i = 0; i < crowd; i++) { const a = AUD[i]; R.at(0, extra(ctx, 'fan' + i, i, [a[0], a[1]], a[2], 'idle')); }
  // a passer-by stops: the third one walks in along the busk path and turns to the crate
  if (crowd >= 3 && f !== 'short') R.at(0, place('fan2', [11.4, -3.6], 220)).at(0.05, { do: 'walk', who: 'fan2', to: [[AUD[2][0], AUD[2][1]]], speed: 1.5, face: AUD[2][2], then: 'idle' });
  let t = 0;
  // 1 MS the last bar, the bow. The rank picks the beat
  R.at(0, f === 'short' ? S('fs', 18, { h: 1.35, lookH: 1.15, w: 2.4 }) : cam(P3(ctx, 8.45, -1.7, 2.15), P3(ctx, 8, -8, 1.1), 40, { to: { pos: P3(ctx, 8.4, -2.1, 2.05) }, dur: 2.0 }), clip(H, auto ? 'v_sitbox' : 'beatbox', auto ? { seat: CRATE_H + 0.02, bpm: 92 } : { bpm: 92 }), cue('beat', { who: auto ? null : H, pattern: 'B t K t', bpm: 92, step: 0.5 }));
  if (auto) R.at(0, place(H, BUSK.at, 0, { y: y0 }));
  t = 0.75;
  R.at(t, clip(H, auto ? 'v_sitx' : 'v_bow', auto ? { seat: CRATE_H + 0.02, slump: 1, g: 'nod', at: 0.1 } : { deep: top ? 0.8 : 0.5 }), drum('K', { vel: 0.6 }));
  if (top) {
    for (let i = 0; i < crowd; i++) R.at(t + 0.15 + i * 0.1, clip('fan' + i, i === 1 && rk === 'S' ? 'cheer' : 'v_clap', { bpm: 112, up: rk === 'S' ? 0.7 : 0.2, phase: i * 0.3 }));
    R.at(t + 0.2, sfx('applause'), mood(H, 'happy'));
    if (f !== 'short' && crowd >= 3) R.at(t + 0.95, clip('fan2', 'beatbox', { bpm: 112, amp: 0.7 }), word('B?', 'fan2:mouth', { size: 3.6, color: '#ffd35c', ms: 600 }), drum('B', { vel: 0.5 }));
  } else if (mid) {
    R.at(t + 0.3, clip('fan0', 'v_clap', { bpm: 70, amp: 0.6 }), sfx('applause', { quiet: true }));
    if (crowd > 1) R.at(t + 0.4, look('fan1', 'hero:head'));
    R.at(t + 1.0, clip(H, 'v_nod', { n: 1 }), mood(H, 'happy'));
  } else {
    // D: nobody claps. One walks on. Silence: the pause after the line is the line
    R.at(t + 0.2, { do: 'walk', who: 'fan0', to: [[4.6, -4.4]], speed: 1.3, then: 'idle' }, mood(H, 'sad'));
  }
  t += f === 'short' ? 0.6 : 1.1;
  // 2 INS the tin: the coins arc in on the beat, one clink each, pitched up a semitone. PAY on the first one (D: a bottle cap and a pigeon)
  const tinCam = () => { const p = tinAt(ctx); return cam([p[0] - 0.55, p[1] + 1.05, p[2] + 1.65], [p[0] - 0.1, p[1] + 0.25, p[2] - 0.2], 40, Object.assign({ to: { pos: [p[0] - 0.45, p[1] + 0.9, p[2] + 1.4] }, dur: 1.8 }, xf(260))); };
  R.at(t, tinCam());
  if (nCoins) {
    const cs = [], items = []; for (let i = 0; i < nCoins; i++) { const r = ref(); cs.push(r); const a = AUD[i % Math.max(1, crowd)]; R.at(t, spawn(ctx, r, coin, [a[0], 1, a[1]])); items.push({ r, from: [a[0] + (i % 2 ? 0.1 : -0.1), gy(ctx, a[0], a[1]) + 1.05, a[1] + 0.05], to: () => { const p = tinAt(ctx); return new THREE.Vector3(p[0] + 0.02 * Math.sin(i * 2), p[1] + 0.06, p[2] + 0.02 * Math.cos(i * 2)); }, t0: i * BEAT * 0.5, dur: 0.42, h: 0.55, spin: true, stay: false }); }
    R.at(t, flights(ctx, items));
    for (let i = 0; i < nCoins; i++) { const tl = t + i * BEAT * 0.5 + 0.42; R.at(tl, call(() => ctx.note(84 + i, 0.12, { timbre: 'keys', vel: 0.3 })), sfx('coin', { pitch: Math.pow(2, i / 12) }), withProp(tn, (o) => o.userData.fill(0.12 + 0.88 * (i + 1) / nCoins)), i === 0 ? ctx.PAY : null); }
    if (rk === 'S') R.at(t + nCoins * BEAT * 0.5 + 0.45, cue('fx', { kind: 'sparks', at: (() => { const p = tinAt(ctx); return [p[0], p[1] + 0.2, p[2]]; })(), color: '#ffd35c', n: 24 }));
    t += nCoins * BEAT * 0.5 + 0.55;
  } else {
    const cp = ref(), pg = ref(), p = tinAt(ctx);
    R.at(t, spawn(ctx, cp, cap, [p[0], p[1] + 0.02, p[2]]), spawn(ctx, pg, () => pigeon(), [p[0] + 0.5, p[1], p[2] + 0.35], -2.2), withProp(tn, (o) => o.userData.fill(0)));
    R.at(t, anim(ctx, (T) => { const o = pg.obj; if (!o) return; const u = Math.min(1, T / 0.7); o.position.set(p[0] + 0.5 - 0.32 * u, p[1], p[2] + 0.35 - 0.2 * u); o.userData.step(T, T > 0.75 && T < 1.4 ? 'peck' : 'idle'); }));
    R.at(t + 0.9, ctx.PAY, drum('t', { vel: 0.3 })).at(t + 1.3, S('mcu', 30, Object.assign({ h: 1.5, lookH: 1.25 }, xf(260))), look(H, [p[0] + 0.15, p[1] + 0.1, p[2] + 0.2]));
    t += f === 'short' ? 1.4 : 2.2;
  }
  if (f === 'short') { R.end(t + 0.15); return { events: R.list() }; }
  // 3 LAND: the hero steps off the crate and picks up the tin
  R.at(t, S('fs', 28, Object.assign({ h: 1.3, lookH: 0.8, w: 2.4 }, xf(300))), gone(ctx, cr), place(H, [BUSK.at[0], BUSK.at[1] + 0.28], 0, { y: y0 }), clip(H, 'v_reach', { to: [0.12, 0.35, 0.55], hold: 0.25 }), sfx('step', { pitch: 0.9 }));
  R.at(t + 0.45, hold(ctx, tn, H, { aim: 'up', tilt: 0 }), sfx('coin', { pitch: 0.8, quiet: true }));
  R.end(t + 1.1);
  return { events: R.list() };
}

// ======================================================================= THE JAM (2.8)
const JAM = { c: [5.5, -20], mira: [6.83, -21.06], luca: [4.17, -21.06], gap: [5.5, -17.15] };
const jamCrowd = (ctx) => { const s = ctx.world.terrain && ctx.world.terrain.story; return s && s.jam ? s.jam.crowd : null; };
function crowdE(ctx, v, cheer) { return call(() => { const c = jamCrowd(ctx); if (!c) return; if (c.setEnergy) c.setEnergy(v); if (cheer && c.cheer) c.cheer(cheer); }); }
const jamRestore = (ctx) => call(() => ctx.own(() => { const c = jamCrowd(ctx); if (c && c.setEnergy) c.setEnergy(0.6); }));
function jamIn(ctx) {
  const f = ctx.form, R = reel(), y = gy(ctx, JAM.c[0], JAM.c[1]);
  if (MICRO(f)) { R.at(0, clip(H, 'beatbox', { bpm: 96, amp: 0.5 }), drum('B', { vel: 0.6 })).at(0.5, ctx.PAY).end(0.9); return { events: R.list(), letterbox: false }; }
  R.at(0, jamRestore(ctx), clearWalkers(ctx, 5.5, -18, 8), clip('mira', 'beatbox', { bpm: 96 }), clip('luca', 'v_clap', { bpm: 96, amp: 0.5 }));
  let t = 0;
  if (f !== 'short') {
    // 1 WS from inside the ring, the wall behind the lens: the hero walks in through the gap while Mira finishes her round
    R.at(0, place(H, [JAM.gap[0], JAM.gap[1] + 1.2], 180, { y }), { do: 'walk', who: H, to: [[JAM.c[0], JAM.c[1] + 0.5]], speed: 1.25, face: 180, then: 'idle' });
    R.at(0, cam([JAM.c[0] + 0.9, y + 2.1, JAM.c[1] + 8.2], [JAM.c[0], y + 1.0, JAM.c[1] - 0.6], 34, { to: { pos: [JAM.c[0] + 0.7, y + 2.0, JAM.c[1] + 7.4] }, dur: 1.8 }));
    R.at(0.1, cue('beat', { who: 'mira', pattern: 'B . t K . t B .', bpm: 96, step: 0.5, rings: true }));
    // 2 Mira lands her last kick and points the round at the hero. The ring goes "oh"
    R.at(1.2, face('mira', H, 200), clip('mira', 'point', { dir: 0 }), crowdE(ctx, 0.85, 0.6), word('ohh', [0.3, 0.3], { size: 3.4, color: '#9dff4a', ms: 600 }), sfx('crowd_cheer', { quiet: true }));
    t = 1.75;
  } else R.at(0, place(H, [JAM.c[0], JAM.c[1] + 0.5], 180, { y }), face('mira', H, 0), clip('mira', 'point', { dir: 0 }));
  // 3 MCU the hero steps in: the mic comes up, the face sets
  R.at(t, face(H, 'mira', 0), cam([JAM.c[0] - 0.3, y + 1.75, JAM.c[1] - 1.95], 'hero:head', 46, Object.assign({ to: { pos: [JAM.c[0] - 0.2, y + 1.7, JAM.c[1] - 1.8] }, dur: 1.2 }, f === 'short' ? {} : xf(260))), clip(H, 'beatbox', { bpm: 96, amp: 0.3 }), mood(H, 'angry'), drum('K', { vel: 0.7 }));
  R.at(t + 0.4, crowdE(ctx, 0.6), clip('mira', 'v_fold', { bpm: 96 }));
  const T = t + F({ first: 1.2, full: 1.0, short: 0.8 }, f); R.at(T - 0.25, ctx.PAY).end(T);
  return { events: R.list(), cast: { mira: { rest: { clip: 'beatbox', opts: { bpm: 96 } } }, luca: { rest: { clip: 'cheer', opts: { bpm: 96 } } } } };
}
function jamOut(ctx) {
  const f = ctx.form, R = reel(), res = (fxOf(ctx, 'result') || {}).res || {}, rk = res.rank || 'B', top = rk === 'S' || rk === 'A', low = rk === 'D', y = gy(ctx, JAM.c[0], JAM.c[1]), line = toastOf(ctx, /cypher taught/i);
  const cast = { mira: { rest: { clip: 'beatbox', opts: { bpm: 96 } } }, luca: { rest: { clip: 'cheer', opts: { bpm: 96 } } } };
  if (MICRO(f)) { R.at(0, clip(H, 'point', { dir: 0.5 }), drum('K', { vel: 0.6 })).at(0.5, ctx.PAY).end(0.95); return { events: R.list(), letterbox: false, cast }; }
  R.at(0, jamRestore(ctx), clearWalkers(ctx, 5.5, -18, 8), place(H, JAM.c, 15, { y }), clip('mira', 'v_fold', { bpm: 96 }), clip('luca', 'v_fold', { bpm: 96 }));
  // 1 MS the last bar, then the hero passes the round: a point at Luca
  R.at(0, cam([JAM.c[0] + 0.5, y + 1.45, JAM.c[1] + 3.3], [JAM.c[0], y + 1.15, JAM.c[1]], 40, { to: { pos: [JAM.c[0] + 0.35, y + 1.42, JAM.c[1] + 2.9] }, dur: 1.8 }), clip(H, 'beatbox', { bpm: 100 }), cue('beat', { who: H, pattern: 'B t K B', bpm: 100, step: 0.5, rings: true }));
  R.at(0.65, face(H, 'luca', 220), clip(H, 'point', { dir: 0 }), face('luca', H, 200), drum('K'));
  let t = 1.15;
  if (top) {
    // S/A: the ring jumps; Luca steps in for the dap
    R.at(t, crowdE(ctx, 0.95, 1.6), sfx('crowd_cheer'), mood(H, 'happy'), cam([JAM.c[0] + 1.3, y + 2.2, JAM.c[1] + 4.2], [JAM.c[0] - 0.4, y + 1.0, JAM.c[1] - 0.25], 40, Object.assign({ to: { pos: [JAM.c[0] + 1.15, y + 2.1, JAM.c[1] + 3.8] }, dur: 1.6 }, xf(240))));
    R.at(t, { do: 'walk', who: 'luca', to: [[JAM.c[0] - 0.62, JAM.c[1] - 0.3]], speed: 1.6, face: H, then: 'idle' }, clip('mira', 'cheer'));
    R.at(t + 0.75, clip('luca', 'v_dap', { at: 0.3 }), clip(H, 'v_dap', { at: 0.3 })).at(t + 1.05, drum('K'), word('dap', [0.5, 0.42], { size: 3.6, color: '#ffd35c', ms: 500 }), ctx.PAY);
    t += 1.6;
  } else if (low) {
    // D: polite silence, then one voice: "again!" and the ring laughs (warm, not mean)
    R.at(t, crowdE(ctx, 0.15), face(H, 0, 300), S('mcu', 15, Object.assign({ h: 1.45, lookH: 1.25 }, xf(260))), mood(H, 'sad'), clip(H, 'idle'));
    R.at(t + 0.9, word('again!', [0.72, 0.3], { size: 3.8, color: '#9dff4a', ms: 800 }), crowdE(ctx, 0.7, 0.5), sfx('applause', { quiet: true }), clip('luca', 'cheer')).at(t + 1.2, mood(H, 'happy'), ctx.PAY);
    t += 1.8;
  } else {
    R.at(t, crowdE(ctx, 0.7, 0.4), sfx('applause'), clip('luca', 'beatbox', { bpm: 100 }), mood(H, 'happy'), clip(H, 'v_nod', { n: 2 })).at(t + 0.4, ctx.PAY);
    t += 1.0;
  }
  if (line && f !== 'short') R.at(t - 0.3, say(null, line, { dur: 1.2 })).at(t + 0.9, call((api) => api.screen.clearSub(250)));
  R.end(t + (line && f !== 'short' ? 1.0 : 0.2));
  return { events: R.list(), cast };
}
function jamListen(ctx) {
  const f = ctx.form, R = reel(), y = gy(ctx, JAM.gap[0], JAM.gap[1]);
  if (MICRO(f)) { R.at(0, clip(H, 'v_fold', { bpm: 96 })).at(0.5, ctx.PAY).end(1.0); return { events: R.list(), letterbox: false }; }
  // MS from inside the ring looking out: the hero at the edge, arms folded, the head goes with the beat; the foot starts, then the lips, then the hero catches it
  R.at(0, jamRestore(ctx), clearWalkers(ctx, 5.5, -17, 7), place(H, JAM.gap, 180, { y }), clip(H, 'v_fold', { bpm: 96, tap: 0, lips: 0 }), clip('mira', 'beatbox', { bpm: 96 }));
  R.at(0, cam([JAM.c[0] + 0.6, y + 1.5, JAM.c[1] - 1.4], [JAM.gap[0], y + 1.0, JAM.gap[1]], 44, { to: { pos: [JAM.c[0] + 0.5, y + 1.45, JAM.c[1] - 0.9] }, dur: 2.4 }), cue('beat', { who: 'mira', pattern: 'B . t . K . t . B B t . K . t .', bpm: 96, step: 0.5 }), stamp(clockAt(ctx, -spent(ctx, 30)) + '|+' + spent(ctx, 30) + ' MIN', 1600));
  if (f === 'short') { R.at(0.3, clip(H, 'v_fold', { bpm: 96, tap: 1, lips: 0.6 })).at(0.8, stamp(''), ctx.PAY).end(1.2); return { events: R.list() }; }
  R.at(0.7, clip(H, 'v_fold', { bpm: 96, tap: 1, lips: 0 }), drum('t', { vel: 0.3 }));
  R.at(1.3, S('ms', -15, Object.assign({ h: 1.4, lookH: 1.1, w: 1.5 }, xf(260))), clip(H, 'v_fold', { bpm: 96, tap: 1, lips: 1, stop: 0.75 }), word('b..t..', 'hero:mouth', { size: 2.6, color: '#c9c3dd', ms: 600 }));
  R.at(2.1, mood(H, 'happy'), stamp(''), ctx.PAY, drum('K', { vel: 0.4 }));
  R.end(f === 'first' ? 2.9 : 2.6);
  return { events: R.list(), cast: { mira: { rest: { clip: 'beatbox', opts: { bpm: 96 } } } } };
}

// ======================================================================= THE BENCH: rest (2.8)
const BENCH = { at: [-9, -4], rot: 1.1526, seat: 0.46 };
const benchFace = BENCH.rot / D2R;
// a point beside the hero on the bench (lateral metres, + = the hero's left), at the seat
const benchSide = (ctx, lat, dy) => [BENCH.at[0] + lat * Math.cos(BENCH.rot), gy(ctx, BENCH.at[0], BENCH.at[1]) + BENCH.seat + (dy || 0), BENCH.at[1] - lat * Math.sin(BENCH.rot)];
const benchAhead = (ctx, d, h) => [BENCH.at[0] + Math.sin(BENCH.rot) * d, gy(ctx, BENCH.at[0], BENCH.at[1]) + h, BENCH.at[1] + Math.cos(BENCH.rot) * d];
function benchRest(ctx) {
  const f = ctx.form, R = reel(), pg = ref(), cl = ref(), bee = bmgHere(ctx), ringed = ctx.n >= 9, cloud = f === 'first' || ctx.pick(50) === 0;
  if (MICRO(f)) { R.at(0, clip(H, 'sit', { seat: BENCH.seat, slump: 1.2, armBack: true })).at(0.5, ctx.PAY).end(0.95); return { events: R.list(), letterbox: false }; }
  const sp = benchSide(ctx, 0.32, 0); R.at(0, place(H, [sp[0], sp[2]], benchFace), clip(H, 'sit', { seat: BENCH.seat, slump: 1.1, armBack: !bee }), clearWalkers(ctx, -8, -3, 6));
  let t = 0;
  // 1 WS the bench from the plaza: sitting down, arms along the backrest (BeeAmGee: the rest is shared)
  if (f !== 'short') { R.at(0, S('ws', -28, { h: 1.6, lookH: 0.8, w: bee ? 3.6 : 3.0, fov: 40, to: { w: bee ? 3.3 : 2.7, yaw: -20 }, dur: 1.4, shift: bee ? -0.2 : 0 }), sfx('swoosh', { pitch: 0.5 }), drum('B', { vel: 0.5 })); if (bee) R.at(0.6, bmg(ctx, 'nod', { at: 0.05 })); t = 1.2; }
  // 2 POV up: the clouds (FIRST, or rarely: one cloud is a microphone)
  const sky = benchAhead(ctx, 30, 22);
  if (cloud) R.at(0, spawn(ctx, cl, cloudMic, benchAhead(ctx, 36, 21), BENCH.rot + Math.PI));
  R.at(t, cam(benchAhead(ctx, 0.6, 1.15), sky, 50, Object.assign({ to: { look: benchAhead(ctx, 30, 24) }, dur: 1.4 }, f === 'short' ? {} : xf(320))), stamp(clockAt(ctx, -30) + '|+30 MIN', 1300));
  if (bee) R.at(t, look(H, sky), call((api) => { const a = api.actor(B); if (a) { a.look = sky; a.touched.look = 1; } }));
  [0, 1, 2].forEach((i) => R.at(t + 0.25 + i * BEAT, drum('t', { vel: 0.2, pulse: false })));
  t += f === 'short' ? 0.7 : 1.3;
  // 3 the pigeon lands next to the hero; FULL: a crumb, and it bobs its head on the beat
  const seatP = benchSide(ctx, 0.92, 0.0);
  R.at(t, look(H, null), spawn(ctx, pg, () => pigeon({ ring: ringed }), seatP, BENCH.rot + Math.PI * 0.75),
    anim(ctx, (T) => { const o = pg.obj; if (!o) return; const u = Math.min(1, T / 0.5), k = 1 - (1 - u) * (1 - u); o.position.set(seatP[0] + 0.9 * (1 - k), seatP[1] + 1.6 * (1 - k) * (1 - k), seatP[2] - 0.6 * (1 - k)); o.userData.step(T, u < 1 ? 'fly' : f === 'full' || f === 'first' ? (T > 0.9 ? 'bob' : 'idle') : 'idle'); }),
    S('fs', 42, Object.assign({ h: 1.2, lookH: 0.7, w: 2.6, to: { w: 2.4 }, dur: 1.6 }, xf(280))), sfx('swoosh', { pitch: 1.6, quiet: true }));
  R.at(t + 0.5, drum('t', { vel: 0.4 }), word('coo', [0.62, 0.44], { size: 3, color: '#c9c3dd', ms: 500 }), look(H, seatP));
  if (f !== 'short') {
    const cr = ref(); R.at(t + 0.75, clip(H, 'v_offer', { sit: BENCH.seat, x: 0.32, y: BENCH.seat + 0.15, z: 0.3, at: 0.3, hold: 0.8 }), mood(H, 'happy'));
    R.at(t + 1.0, spawn(ctx, cr, () => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), mat('#e8d3a0')); m.name = 'vig_crumb'; return m; }, [seatP[0], seatP[1] + 0.01, seatP[2]]));
    [0, 1, 2, 3].forEach((i) => R.at(t + 0.95 + i * BEAT, drum(i % 2 ? 't' : 'B', { vel: 0.35 })));
    if (bee) R.at(t + 1.4, bmg(ctx, 'nod', { at: 0.05, long: true }));
    if (ringed && f === 'full') R.at(t + 1.2, word('again?', 'hero:top', { size: 2.6, color: '#ffd35c', ms: 700 }));
  }
  R.at(t + (f === 'short' ? 0.5 : 1.3), stamp(''), ctx.PAY, sfx('sparkle', { quiet: true }));
  R.end(t + F({ first: 2.8, full: 2.4, short: 0.9 }, f));
  return { events: R.list() };
}

// ======================================================================= THE RUN (2.8)
const RUN = { at: [12, 14] };
function runIn(ctx) {
  const f = ctx.form, R = reel(), eb = ref(), y = gy(ctx, RUN.at[0], RUN.at[1]);
  if (MICRO(f)) { R.at(0, clip(H, 'v_calf', {})).at(0.5, ctx.PAY).end(0.9); return { events: R.list(), letterbox: false }; }
  const RS = [RUN.at[0] - 1.4, RUN.at[1] - 0.1];
  R.at(0, clearWalkers(ctx, 11, 14, 12), place(H, RS, -90, { y }));
  let t = 0;
  // 1 MS: the calf stretch, two pulses on the beat
  if (f !== 'short') { R.at(0, clip(H, 'v_calf', { side: 1 }), cam(P3(ctx, RS[0] - 1.9, RS[1] + 2.7, 1.1), P3(ctx, RS[0], RS[1], 0.75), 40, { to: { pos: P3(ctx, RS[0] - 1.75, RS[1] + 2.5, 1.05) }, dur: 1.2 }), drum('B', { vel: 0.5 })).at(BEAT, drum('B', { vel: 0.5 })); t = 0.9; }
  // 2 CU the earbud goes in (a click, the world goes quieter), 3 the first strides out of the frame
  R.at(t, clip(H, 'v_reach', { to: [0.3, 1.32, 0.05], hold: 0.2 }), cam(P3(ctx, RS[0] - 2.4, RS[1] + 2.4, 1.5), P3(ctx, RS[0], RS[1], 1.1), 38, f === 'short' ? {} : xf(220)), spawn(ctx, eb, earbud, P3(ctx, RS[0], RS[1], 1.2)), hold(ctx, eb, H, {}));
  R.at(t + 0.38, sfx('click', { pitch: 1.4 }), drum('t', { vel: 0.5 }), gone(ctx, eb), mood(H, 'happy'));
  R.at(t + 0.55, { do: 'walk', who: H, to: [[RS[0] - 3.4, RS[1] - 0.25]], run: true, speed: 3.2 }, cam(P3(ctx, RS[0] - 4.2, RS[1] + 2.4, 1.2), P3(ctx, RS[0] - 1.6, RS[1], 0.9), 40), drum('B'));
  const T = t + F({ first: 1.5, full: 1.4, short: 1.0 }, f); R.at(T - 0.2, ctx.PAY).end(T);
  return { events: R.list() };
}
function runOut(ctx) {
  const f = ctx.form, R = reel(), ph = ref(), pf = ref(), a = ctx.action || {}, y = gy(ctx, RUN.at[0], RUN.at[1]), cold = ctx.hour < 9 || rain(ctx), gain = Math.max(0, ((ctx.ch && ctx.ch.maxEnergy) || 0) - ((ctx.pre && ctx.pre.maxEnergy) || 0)), lowQ = (a.q || 0) < 0.35;
  if (MICRO(f)) { R.at(0, clip(H, 'v_knees', { hard: 0.6 }), sfx('step', { pitch: 0.8 })).at(0.55, ctx.PAY).end(1.0); return { events: R.list(), letterbox: false }; }
  R.at(0, clearWalkers(ctx, 10.5, 14, 12));
  let t = 0;
  // 1 WS: the hero jogs back into the frame and pulls up at the arch
  if (f !== 'short') { R.at(0, place(H, [RUN.at[0] - 3.4, RUN.at[1] - 0.35], 90, { y }), { do: 'walk', who: H, to: [RUN.at], run: true, speed: 3.0, face: 10, then: 'idle' }, cam(P3(ctx, 13.8, 16.6, 1.1), P3(ctx, 10.5, 13.8, 0.9), 42, { to: { pos: P3(ctx, 13.6, 16.3, 1.05) }, dur: 1.3 }), sfx('step', { pitch: 1.1 })); t = 1.2; }
  else R.at(0, place(H, RUN.at, 10, { y }));
  // 2 MS hands on the knees, the breath puffs (cold air before 09:00 or in the rain). Low pace: down on the grass instead
  if (lowQ) R.at(t, clip(H, 'sit', { seat: 0.12, slump: 1.6, drowsy: 1 }), mood(H, 'sad'));
  else R.at(t, clip(H, 'v_knees', { hard: 1 }));
  R.at(t, S('ms', 25, Object.assign({ h: lowQ ? 0.9 : 1.15, lookH: lowQ ? 0.5 : 0.85, w: 1.6, to: { w: 1.45 }, dur: 1.4 }, f === 'short' ? {} : xf(260))));
  R.at(t, spawn(ctx, pf, () => steam(5, cold ? '#ffffff' : '#dfe8ff'), P3(ctx, RUN.at[0], RUN.at[1], 0.9)), anim(ctx, (T) => { const o = pf.obj, h = ctx.api && ctx.api.actor(H); if (!o || !h) return; h.c.object.updateMatrixWorld(true); h.c.anchors.mouth.getWorldPosition(o.position); o.position.y -= 0.1; o.userData.step(T * 1.6, cold ? 1 : 0.35); }));
  [0, 1, 2].forEach((i) => R.at(t + 0.2 + i * BEAT, drum('Pf', { vel: 0.25, pulse: false })));
  R.at(t + 0.75, ctx.PAY);
  t += f === 'short' ? 0.9 : 1.3;
  // 3 stamina up: the hero straightens and checks the phone; the fitness ring closes
  if (gain && f !== 'short') {
    R.at(t, clip(H, 'v_hold', { y: 0.95, z: 0.3, look: 1 }), spawn(ctx, ph, () => phone(), P3(ctx, RUN.at[0], RUN.at[1], 1)), hold(ctx, ph, H, { aim: 'face' }), S('mcu', 20, xf(220)), mood(H, 'happy'));
    R.at(t, anim(ctx, (T) => { const o = ph.obj; if (!o) return; const k = Math.min(1, T / 0.8); o.userData.draw((g, w, h) => { g.fillStyle = '#120d1f'; g.fillRect(0, 0, w, h); g.lineWidth = 12; g.strokeStyle = '#2a2240'; g.beginPath(); g.arc(w / 2, h * 0.38, 44, 0, Math.PI * 2); g.stroke(); g.strokeStyle = '#9dff4a'; g.beginPath(); g.arc(w / 2, h * 0.38, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke(); g.fillStyle = '#fff6e8'; g.font = '700 17px sans-serif'; g.textAlign = 'center'; g.fillText('+' + gain + ' MAX', w / 2, h * 0.74); g.fillText('ENERGY', w / 2, h * 0.84); }); }));
    R.at(t + 0.85, sfx('confirm', { pitch: 1.2 }), drum('K')).end(t + 1.5);
  } else R.end(t + 0.3);
  return { events: R.list() };
}

// ======================================================================= ODD JOB: flyers (2.8, a time ramp montage)
// the hero works the path below the flyer board: facing the gate path (south), the board behind
const FLY = { at: [4, 22.3], lamp: [2.45, 26.5] };
function flyers(ctx) {
  const f = ctx.form, R = reel(), st = ref(), fl = ref(), pl = ref(), env = ref(), y = gy(ctx, FLY.at[0], FLY.at[1]), tired = ctx.pre && ctx.pre.energy < 30, wet = rain(ctx);
  const name = ctx.ch && ctx.ch.n && ctx.ch.n.openMics ? ctx.name : null, mins = spent(ctx, 90), X = FLY.at[0], Z = FLY.at[1];
  if (MICRO(f)) { R.at(0, clip(H, 'v_offer', { at: 0.25, hold: 0.3 }), sfx('swoosh', { pitch: 1.5, quiet: true })).at(0.5, ctx.PAY, sfx('coin')).end(0.95); return { events: R.list(), letterbox: false }; }
  R.at(0, clearWalkers(ctx, 3, 23, 9), place(H, FLY.at, 0, { y }), spawn(ctx, st, () => stack({ name }), P3(ctx, X, Z, 1)), hold(ctx, st, H, { aim: 'up', tilt: 0, back: -0.02 }));
  // the passers-by of the montage: P1 does not look, P2 takes one and reads it into the lamp post, P3 catches the plane
  R.at(0, extra(ctx, 'p1', 3, [X + 3.6, Z + 1.0], -90, 'walk', { speed: 1.4 }));
  if (f !== 'short') R.at(0, extra(ctx, 'p2', 4, [X + 4.5, Z + 3.5], -90, 'idle'), extra(ctx, 'p3', 5, [X + 5.5, Z - 1.2], 120, 'idle'));
  let t = 0;
  // 1 MS: the stack squared, two taps on the beat
  if (f !== 'short') { R.at(0, cam(P3(ctx, X + 0.9, Z + 3.7, 1.4), P3(ctx, X, Z, 0.95), 40, { to: { pos: P3(ctx, X + 0.8, Z + 3.4, 1.38) }, dur: 1.0 }), clip(H, 'v_hold', { y: 0.86, z: 0.34, look: 1 }), drum('t', { vel: 0.5 })).at(0.4, drum('t', { vel: 0.5 }), sfx('swoosh', { pitch: 1.8, quiet: true })); t = 0.75; }
  const flip = (k) => stamp(clockAt(ctx, -mins + Math.round(mins * k / 3)) + '|+' + Math.round(mins * k / 3) + ' MIN', 900);
  // 2 TRM shot A: the hero offers one, P1 walks past without a look
  R.at(t, cam(P3(ctx, X + 1.4, Z + 4.4, 1.5), P3(ctx, X - 0.2, Z + 0.4, 0.95), 42, f === 'short' ? {} : whip), clip(H, 'v_offer', { at: 0.3, hold: 0.6, z: 0.55 }), place('p1', [X + 2.6, Z + 1.0], -90), { do: 'walk', who: 'p1', to: [[X - 4.0, Z + 1.0]], speed: 1.7 }, flip(1));
  if (f !== 'short') {
    t += 1.0;
    // 3 TRM shot B: P2 takes one, reads it, walks into the lamp post (a stumble on the kick)
    R.at(t, place('p2', [X + 0.15, Z + 0.95], 180), face(H, 'p2', 0), cam(P3(ctx, X + 2.6, Z + 0.7, 1.4), P3(ctx, X, Z + 0.5, 1.0), 42, whip), clip(H, 'v_offer', { at: 0.2, hold: 0.3, z: 0.55 }), clip('p2', 'v_reach', { to: [0.0, 0.95, 0.5], hold: 0.15 }), flip(2));
    R.at(t, spawn(ctx, fl, () => flyer({ name }), P3(ctx, X, Z + 0.5, 1.0)), call(() => { if (fl.obj) fl.obj.visible = false; }));
    R.at(t + 0.35, call(() => { if (fl.obj) fl.obj.visible = true; }), hold(ctx, fl, 'p2', { aim: 'face' }), clip('p2', 'v_hold', { y: 0.95, z: 0.32, look: 1 }), sfx('swoosh', { pitch: 1.9, quiet: true }));
    R.at(t + 0.55, place('p2', [FLY.lamp[0], FLY.lamp[1] - 1.3], 0), { do: 'walk', who: 'p2', to: [[FLY.lamp[0] + 0.03, FLY.lamp[1] - 0.38]], speed: 1.0, then: 'idle' }, cam(P3(ctx, FLY.lamp[0] - 2.3, FLY.lamp[1] - 3.3, 1.6), P3(ctx, FLY.lamp[0], FLY.lamp[1] - 0.6, 1.0), 40, whip));
    R.at(t + 1.45, drum('K'), word('bonk', [0.4, 0.36], { size: 3.6, color: '#ff3ea5', ms: 520 }), cue('shake', { amp: 0.02, dur: 0.2 }), clip('p2', 'hit', { power: 0.8 }));
    t += 1.8;
    // 4 TRM shot C: a flyer folded into a plane, thrown on the beat, caught (low energy: sitting on the curb, handing them up)
    if (tired) {
      R.at(t, place(H, FLY.at, 0), clip(H, 'v_offer', { sit: 0.22, at: 0.25, hold: 0.6, y: 0.75, z: 0.45 }), cam(P3(ctx, X + 1.6, Z + 2.2, 1.0), P3(ctx, X, Z, 0.6), 40, whip), flip(3), place('p3', [X - 0.15, Z + 0.95], 180), clip('p3', 'v_reach', { to: [0.0, 0.75, 0.5], hold: 0.2 }));
    } else {
      R.at(t, place('p3', [X - 2.6, Z + 2.2], 125), place(H, FLY.at, -45), clip(H, 'v_throw', { at: 0.4 }), cam(P3(ctx, X + 2.0, Z - 1.7, 1.75), P3(ctx, X - 2.6, Z + 2.2, 0.9), 44, whip), flip(3), spawn(ctx, pl, plane, P3(ctx, X, Z, 1.1)), call(() => { if (pl.obj) pl.obj.visible = false; }));
      R.at(t, flights(ctx, [{ r: pl, from: handPos(ctx, H), to: () => { const v = handPos(ctx, 'p3')(); return v.lengthSq() ? v : new THREE.Vector3(X - 2.4, 1.0, Z + 2.1); }, t0: 0.4, dur: 0.75, h: 0.6, face: true }]));
      R.at(t + 0.4, sfx('swoosh', { pitch: 1.3 }), drum('B')).at(t + 0.95, clip('p3', 'v_reach', { to: [0.05, 1.2, 0.35], hold: 0.4 })).at(t + 1.15, drum('K'), word('catch', [0.38, 0.4], { size: 3.2, color: '#9dff4a', ms: 520 }));
    }
    t += 1.35;
  } else t += 0.9;
  if (wet && f !== 'short') { const um = ref(); R.at(t - 0.2, spawn(ctx, um, () => flyer({ name }), P3(ctx, X, Z, 1.6)), hold(ctx, um, H, { aim: 'face', hand: 'L' }), clip(H, 'v_reach', { to: [0.12, 1.62, 0.1], hold: 0.6 })); }
  // 5 INS the stack is gone, an envelope. PAY (+$14 as beat coins)
  R.at(t, stamp(''), gone(ctx, st), place(H, FLY.at, 0), spawn(ctx, env, envelope, P3(ctx, X, Z, 1)), hold(ctx, env, H, { aim: 'face' }), clip(H, 'v_hold', { y: 0.95, z: 0.32, look: 1 }),
    cam(P3(ctx, X + 0.5, Z + 2.8, 1.35), P3(ctx, X, Z, 0.95), 38, xf(240)), ctx.PAY);
  [0, 1, 2].forEach((i) => R.at(t + 0.15 + i * BEAT * 0.5, sfx('coin', { pitch: Math.pow(2, i / 12) })));
  if (f === 'first') R.at(t + 0.4, say(null, 'A few people ask who you are.', { dur: 1.4 })).at(t + 1.9, call((api) => api.screen.clearSub(250)));
  R.end(t + F({ first: 2.0, full: 1.2, short: 0.9 }, f));
  return { events: R.list() };
}
// ======================================================================= BEEAMGEE'S BENCH (2.9)
// the hero sits beside him on the old bench (his own place is 0.55 m to the hero's right)
const STAT_SOUND = { mus: 'mmm', tech: 'K', ori: 'B?t', show: 'B!' };
function coachFree(ctx, stat) {
  const f = ctx.form, R = reel(), mins = spent(ctx, 45), seatAt = benchSide(ctx, 0.32, 0);
  if (MICRO(f)) { R.at(0, clip(H, 'v_nod', { n: 1 }), bmg(ctx, 'nod', { at: 0.05 })).at(0.55, ctx.PAY).end(1.0); return { events: R.list(), letterbox: false }; }
  const sitAt = [seatAt[0], seatAt[2]];
  // 1 two shot, side on: both on the bench; he demonstrates one sound per stat, the hero copies
  R.at(0, clearWalkers(ctx, -8, -3, 6), place(H, sitAt, benchFace), clip(H, 'v_sitx', { seat: BENCH.seat, slump: 1.0, g: 'listen' }), look(H, 'beeamgee:head'),
    shot(Object.assign({ on: [H, B], rel: false, yaw: benchFace + 62, w: 2.5, h: 1.05, lookH: 0.82, fov: 38, to: { yaw: benchFace + 52, w: 2.3 }, dur: 3 })));
  let t = 0.25;
  if (stat === 'mus') {
    // he hums a note and holds a finger up until the hero matches it
    R.at(t, bmg(ctx, 'finger'), call(() => ctx.note(57, 1.1, { timbre: 'flute', vel: 0.35 })), word('hmm', 'beeamgee:mouth', { size: 3, color: '#ffd35c', ms: 900 }));
    R.at(t + 1.0, clip(H, 'v_sitx', { seat: BENCH.seat, slump: 1.0, g: 'none' }), call(() => ctx.note(56, 0.5, { timbre: 'flute', vel: 0.3 })), word('hm?', 'hero:mouth', { size: 2.8, color: '#c9c3dd', ms: 500 }));
    R.at(t + 1.5, call(() => ctx.note(57, 0.8, { timbre: 'flute', vel: 0.35 })), word('hmm', 'hero:mouth', { size: 3.2, color: '#2ee6ff', ms: 700 }), bmg(ctx, 'none'));
    t += 2.2;
  } else if (stat === 'tech') {
    // he taps a strict pulse on the slat with his ring, the hero locks to it
    R.at(t, bmg(ctx, 'tap', { bpm: 100 })); [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => R.at(t + i * BEAT, drum('t', { vel: 0.45, pulse: i % 2 === 0 })));
    R.at(t + 1.2, clip(H, 'v_sitbox', { seat: BENCH.seat, bpm: 100 }), cue('beat', { who: null, pattern: 'B . K . B . K .', bpm: 100, step: 0.5 }), look(H, null));
    t += 2.6;
  } else if (stat === 'ori') {
    // he plays a pattern, then breaks it on purpose and raises an eyebrow
    R.at(t, cue('beat', { pattern: 'B t K t B t K t', bpm: 100, step: 0.5, pulse: true })).at(t + 1.2, cue('beat', { pattern: 'B . . K t t . B', bpm: 100, step: 0.5, pulse: true }));
    R.at(t + 2.0, bmg(ctx, 'brow'), word('?', 'beeamgee:top', { size: 4.4, color: '#ffd35c', ms: 800 }));
    R.at(t + 2.3, clip(H, 'v_sitbox', { seat: BENCH.seat, bpm: 100 }), cue('beat', { pattern: 'B t . K B . t K', bpm: 100, step: 0.5 }), look(H, null));
    t += 3.0;
  } else {
    // show: "play to the back row": he points at the far end of the park
    R.at(t, bmg(ctx, 'point', { dir: -0.6 }), word('back row', [0.3, 0.3], { size: 3, color: '#ffd35c', ms: 900 }));
    R.at(t + 0.9, look(H, benchAhead(ctx, 30, 2)), clip(H, 'v_sitbox', { seat: BENCH.seat, bpm: 100, amp: 1.2 }), drum('B', { vel: 1 }), word('B!', 'hero:mouth', { size: 5, color: '#ff3ea5', ms: 600 }));
    t += 2.0;
  }
  if (f === 'short') { R.at(t - 0.3, ctx.PAY).end(t); return { events: R.list() }; }
  // 2 the time: the sun moves, the clock jumps; PAY. He never claps. He nods once
  R.at(t, S('mcu', -30, Object.assign({ h: 1.0, lookH: 0.95, w: 1.5 }, xf(300))), stamp(clockAt(ctx, -mins) + '|+' + mins + ' MIN', 1100), cue('light', { time: Math.min(1, ctx.night + 0.08) }), clip(H, 'v_sitx', { seat: BENCH.seat, slump: 1.0, g: 'none' }), look(H, 'beeamgee:head'));
  R.at(t + 0.7, stamp(''), ctx.PAY, bmg(ctx, 'nod', { at: 0.05, long: ctx.pick(3) === 0 }), drum('K', { vel: 0.4 }));
  R.end(t + 1.6);
  return { events: R.list(), holdSync: true };
}
// PRIVATE COACHING: the $50 goes in the busk tin (he gives it to the kids), then a real lesson by the fountain
const FOUNT = { hero: [-5.4, -0.6], bmg: [-5.35, 0.55] };
function coachPro(ctx) {
  const f = ctx.form, R = reel(), nt = ref(), tn = ref(), st = (ctx.action && ctx.action.stat) || 'tech';
  if (MICRO(f)) { R.at(0, clip(H, 'v_offer', { at: 0.3, hold: 0.3 }), bmg(ctx, 'nod', { at: 0.1 })).at(0.6, ctx.PAY, sfx('levelup', { quiet: true })).end(1.1); return { events: R.list(), letterbox: false }; }
  const stand = benchAhead(ctx, 1.05, 0), standAt = [stand[0], stand[2]];
  R.at(0, clearWalkers(ctx, -7, -2, 8), place(H, standAt, benchFace + 180), spawn(ctx, nt, notes, P3(ctx, standAt[0], standAt[1], 1)), hold(ctx, nt, H, { aim: 'up', tilt: 0 }));
  let t = 0;
  if (f !== 'short') {
    // 1 MS: the hero holds out the $50. He does not take it: he points at the tip tin of the busk spot
    R.at(0, shot({ on: [H, B], rel: false, yaw: benchFace + 75, w: 3.0, h: 1.3, lookH: 0.9, fov: 38, to: { w: 2.8 }, dur: 1.8 }), clip(H, 'v_offer', { at: 0.35, stay: true, x: 0.1, y: 0.92, z: 0.48 }), mood(H, 'happy'));
    R.at(0.8, bmg(ctx, 'point', { dir: 0.65 }), face(H, 70, 500));
    // 2 INS the tin at the busk spot: the notes go in (the kids get it back. Never explained)
    const p = tinAt(ctx);
    R.at(1.7, place(H, [BUSK.at[0] - 0.05, BUSK.tinZ + 0.6], 180, { y: gy(ctx, 8, -6.7) }), spawn(ctx, tn, tin, p), withProp(tn, (o) => o.userData.fill(0.5)), clip(H, 'v_reach', { to: [0.08, 0.45, 0.5], hold: 0.3 }),
      cam([p[0] + 0.8, p[1] + 0.6, p[2] + 0.55], [p[0], p[1] + 0.1, p[2]], 34, xf(260)));
    R.at(2.1, put(ctx, nt, [p[0], p[1] + 0.13, p[2]], 0.4), drum('t', { vel: 0.4 }), sfx('swoosh', { pitch: 1.6, quiet: true }));
    t = 2.6;
  } else R.at(0, gone(ctx, nt));
  // 3 TRM by the fountain, a real lesson: posture (his hands set the shoulders), breath (a hand in front of the mouth), the sound
  R.at(t, call((api) => { const a = api.actor(B); if (a) { a.o.visible = false; } }), { do: 'spawn', id: 'bmg2', look: 'beeamgee', at: FOUNT.bmg, face: 150, clip: 'idle' }, place(H, FOUNT.hero, 20, { y: gy(ctx, FOUNT.hero[0], FOUNT.hero[1]) }), face('bmg2', H, 0),
    gone(ctx, nt), cam(P3(ctx, -8.6, -0.9, 1.5), P3(ctx, -5.2, 0, 1.0), 42, Object.assign({ to: { pos: P3(ctx, -8.3, -0.7, 1.45) }, dur: 1 }, f === 'short' ? {} : whip)), stamp(clockAt(ctx, -60) + '|+30 MIN', 800));
  R.at(t + 0.1, clip('bmg2', 'v_reach', { to: [-0.15, 1.05, 0.55], hold: 0.5 }), clip(H, 'v_stretch', { dur: 0.8 }), drum('t', { vel: 0.4 }));
  if (f !== 'short') {
    R.at(t + 0.9, shot({ on: [H, 'bmg2'], rel: false, yaw: -70, w: 2.4, h: 1.3, lookH: 1.0, fov: 36, cut: 'whip', ms: 220 }), clip('bmg2', 'v_reach', { to: [0.0, 1.12, 0.62], hold: 0.6 }), clip(H, 'beatbox', { bpm: 90, amp: 0.3 }), stamp(clockAt(ctx, -30) + '|+60 MIN', 800), sfx('swoosh', { pitch: 0.4, quiet: true }));
    t += 0.9;
  }
  R.at(t + 0.9, S('ms', 25, Object.assign({ h: 1.35, lookH: 1.05 }, whip)), clip(H, 'beatbox', { bpm: 100 }), cue('beat', { who: H, pattern: st === 'mus' ? 'B . . B' : st === 'tech' ? 'K t K t' : st === 'ori' ? 'B t ? K'.replace('?', '.') : 'B . K B', bpm: 100, step: 0.5, rings: true }), stamp(clockAt(ctx, 0) + '|+90 MIN', 800), clip('bmg2', 'v_fold', { bpm: 100 }));
  R.at(t + 1.6, stamp(''), ctx.PAY, word(STAT_SOUND[st] || 'B', 'hero:mouth', { size: 4.6, color: '#ffd35c', ms: 700 }), clip('bmg2', 'v_nod', { n: 1, deep: true }), mood(H, 'happy'));
  R.end(t + 2.4);
  return { events: R.list() };
}

// ======================================================================= REFUSALS AND WAIT (2.14, 2.15): MICRO, in the gameplay camera
function micro1(ctx, clipName, opts, beats, dur) {
  const R = reel(); R.at(0, clip(H, clipName, opts || {})); (beats || []).forEach(([t, ...c]) => R.at(t, ...c)); R.at(Math.min((dur || 0.9) - 0.25, 0.6), ctx.PAY).end(dur || 0.9);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}
function noJam(ctx) {
  const lf = ref(), y = gy(ctx, JAM.c[0], JAM.c[1]);
  const r = micro1(ctx, 'idle', {}, [[0, look(H, [JAM.c[0], y + 1.2, JAM.c[1]])], [0, spawn(ctx, lf, leaf, [JAM.c[0] - 2, y + 1, JAM.c[1] + 1])],
    [0, anim(ctx, (T) => { const o = lf.obj; if (!o) return; o.position.set(JAM.c[0] - 2.2 + T * 3.4, y + 0.25 + 0.35 * Math.abs(Math.sin(T * 4)), JAM.c[1] + 1.4 + T * 0.5); o.rotation.set(T * 7, T * 3, T * 5); })],
    [0.3, sfx('swoosh', { pitch: 0.5, quiet: true })], [0.8, look(H, null)]], 1.2);
  return r;
}
const REFUSALS = {
  'p1.refuse.tired': (ctx) => micro1(ctx, 'v_yawn', {}, [[0.55, drum('t', { vel: 0.4 }), word('yawn', 'hero:mouth', { size: 3, color: '#c9c3dd', ms: 500 })]], 1.2),
  'p1.refuse.cash': (ctx) => micro1(ctx, 'v_pockets', {}, [[0.6, word('...', 'hero:top', { size: 3, color: '#c9c3dd', ms: 500 })]], 1.3),
  'p1.refuse.coach': (ctx) => micro1(ctx, 'idle', {}, [[0, look(H, 'beeamgee:head'), bmg(ctx, 'finger')], [0.45, drum('t', { vel: 0.4 })], [0.8, bmg(ctx, 'none'), look(H, null)]], 1.2),
  'p1.refuse.nojam': noJam,
  'p1.wait': (ctx) => micro1(ctx, 'v_nod', { n: 1 }, [[0.1, sfx('click', { pitch: 0.7, quiet: true })], [0.3, stamp(clockAt(ctx, 0), 500)]], 0.8),
};

// ======================================================================= DOORS (2.13): the park gate, out and in
// OUT: into the gate ring, a look back over the shoulder, the street light spills in through the arch (night: the jacket zips up first)
function gateOut(ctx) {
  const f = ctx.form, R = reel(), gate = [0, 26], y = gy(ctx, 0, 26), night = ctx.night > 0.6;
  if (MICRO(f)) return DOOR_OUT(ctx);
  R.at(0, place(H, [gate[0], gate[1] - 0.8], 0, { y }), clearWalkers(ctx, 0, 24, 6));
  let t = 0;
  if (night && f !== 'short') { R.at(0, clip(H, 'v_zip', { at: 0.05 }), S('mcu', 20, { h: 1.4, lookH: 1.2 }), sfx('swoosh', { pitch: 2.2, quiet: true }), drum('t', { vel: 0.4 })); t = 0.6; }
  R.at(t, cam(P3(ctx, 1.5, 21.4, 1.9), P3(ctx, 0, 26.2, 1.15), 40, Object.assign({ to: { pos: P3(ctx, 1.35, 21.9, 1.85) }, dur: 1.2 }, t ? xf(200) : {})), { do: 'walk', who: H, to: [[gate[0], gate[1] + 0.5]], speed: 1.35 },
    cue('cone', { id: 'gate', at: P3(ctx, 0, 27.6, 3.6), to: 'hero', color: night ? '#ffc27a' : '#fff1c9', r: 0.9, v: 0.65, ms: 240 }));
  // the gate creaks in two notes
  R.at(t + 0.15, call(() => { ctx.note(50, 0.18, { timbre: 'keys', vel: 0.25 }); setTimeout(() => ctx.note(53, 0.22, { timbre: 'keys', vel: 0.25 }), 180); }), sfx('door', { pitch: 1.3 }));
  if (f !== 'short') R.at(t + 0.55, look(H, 'cam')).at(t + 0.85, look(H, null));
  const T = t + F({ first: 1.3, full: 1.2, short: 0.55 }, f);
  R.at(T - 0.2, ctx.PAY, cue('cone', { id: 'gate', v: 0, ms: 200 })).end(T);
  return { events: R.list() };
}
// IN: from the street: the gate creaks its two notes, the pigeons on the path lift off as the hero walks in
function gateIn(ctx) {
  const f = ctx.form, R = reel(), A = ctx.A.start || { x: 0, z: 10, rot: Math.PI }, mark = [A.x, A.z], y = gy(ctx, A.x, A.z), pg = [ref(), ref(), ref()];
  if (MICRO(f)) return doorIn(ctx, 'park');
  const PG = [[-0.45, -1.4], [0.55, -1.15], [0.1, -1.9]].map(([dx, dz]) => [A.x + dx, gy(ctx, A.x + dx, A.z + dz), A.z + dz]);
  R.at(0, place(H, [mark[0], mark[1] + 2.4], 180, { y }), { do: 'walk', who: H, to: [mark], speed: 1.5, face: A.rot / D2R, then: 'idle' }, clearWalkers(ctx, 0, 11, 6));
  PG.forEach((p, i) => R.at(0, spawn(ctx, pg[i], () => pigeon({ scale: 1.0 + 0.1 * i }), p, i * 2.1), anim(ctx, (T) => { const o = pg[i].obj; if (!o) return; const lift = T - (0.45 + i * 0.12); if (lift < 0) { o.position.set(p[0], p[1], p[2]); o.userData.step(T + i, 'peck'); return; } const u = lift; o.position.set(p[0] + (i - 1) * 0.9 * u, p[1] + 2.4 * u * u + 0.9 * u, p[2] - 1.6 * u); o.userData.step(T, 'fly'); })));
  R.at(0, cam(P3(ctx, A.x + 1.0, A.z - 2.7, 0.55), P3(ctx, A.x, A.z + 1.3, 0.95), 46, { to: { pos: P3(ctx, A.x + 0.85, A.z - 2.8, 0.6) }, dur: 1.4 }), stamp(clockAt(ctx, 0) + '|+10 MIN', 900));
  R.at(0.05, call(() => { ctx.note(53, 0.18, { timbre: 'keys', vel: 0.25 }); setTimeout(() => ctx.note(50, 0.24, { timbre: 'keys', vel: 0.25 }), 180); }));
  R.at(0.5, sfx('swoosh', { pitch: 1.6 }), drum('t', { vel: 0.4 }), word('flap', [0.36, 0.34], { size: 2.8, color: '#c9c3dd', ms: 500 }));
  const T = F({ first: 1.5, full: 1.3, short: 0.6 }, f);
  R.at(T - 0.2, stamp(''), ctx.PAY).end(T);
  return { events: R.list() };
}

// ======================================================================= the table
export const VIGNETTES = Object.assign({
  'p1.busk.in': buskIn, 'p1.busk.out': buskOut,
  'p1.jam.in': jamIn, 'p1.jam.out': jamOut, 'p1.jam.listen': jamListen,
  'p1.bench.rest': benchRest, 'p1.run.in': runIn, 'p1.run.out': runOut, 'p1.job.flyers': flyers,
  'p1.coach.free.mus': (c) => coachFree(c, 'mus'), 'p1.coach.free.tech': (c) => coachFree(c, 'tech'), 'p1.coach.free.ori': (c) => coachFree(c, 'ori'), 'p1.coach.free.show': (c) => coachFree(c, 'show'),
  'p1.coach.pro': coachPro,
  'p1.door.out': gateOut, 'p1.door.in.park': gateIn,
}, REFUSALS);
// the trigger table entries the shared one cannot know: the 3D bench is a spot (the 2D hotspot key is not set), so a wait from the bench is the bench rest
export function pick(sig) {
  const a = sig.action || {};
  if (a.t === 'wait' && (sig.spot === 'bench' || sig.hot === 'bench')) return 'p1.bench.rest';
  return undefined;
}
export const WORLD = 'park';
void hostRate; void glowBall; void put;
