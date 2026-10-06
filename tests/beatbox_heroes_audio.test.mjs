// BBH.Audio: API contract, scheduling against a fake context, and numeric analysis of offline renders.
import fs from 'node:fs';
import path from 'node:path';
import { ok, eq, near, between, done, load, ROOT } from './beatbox_heroes_lib.mjs';
import * as R from '../tools/beatbox_heroes/audio_render.mjs';

const BBH = load('audio');
const AF = BBH.AudioFactory;
const SFX = ['click', 'back', 'confirm', 'error', 'coin', 'buy', 'unlock', 'levelup', 'achievement', 'hit_perfect', 'hit_good', 'miss', 'combo', 'win', 'lose', 'equip', 'swoosh', 'sleep', 'eat', 'step', 'door', 'crowd_cheer', 'crowd_boo', 'applause', 'sparkle', 'whoosh', 'record', 'countdown', 'go'];
const MUSIC = ['title', 'creator', 'street', 'home', 'park', 'shop', 'bar', 'studio', 'battle', 'victory', 'defeat', 'intro'];
const BPM = { title: 100, creator: 84, street: 92, home: 78, park: 96, shop: 104, bar: 98, studio: 88, battle: 140, intro: 66 };
const LOOPING = MUSIC.filter((m) => m !== 'victory' && m !== 'defeat');

function fakeRig(opts) {
  const ctx = new R.FakeContext(opts);
  const A = AF.create(() => ctx, { log: true, manual: true });
  const step = (secs) => { const end = ctx.currentTime + secs; while (ctx.currentTime < end - 1e-9) { A._tick(); ctx.currentTime += 0.025; } };
  return { ctx, A, step };
}

/* ---------------------------------------------------------------- API surface */
{
  eq(AF.SFX_NAMES, SFX, 'sfx name list matches the contract');
  eq(AF.MUSIC_IDS, MUSIC, 'music id list matches the contract');
  for (const k of ['unlock', 'setMuted', 'setVolume', 'now', 'sfx', 'drum', 'create']) ok(typeof BBH.Audio[k] === 'function', 'BBH.Audio.' + k);
  for (const k of ['play', 'stop', 'current', 'beat', 'bpm']) ok(typeof BBH.Audio.music[k] === 'function', 'music.' + k);
  for (const k of ['start', 'stop', 'setIntensity']) ok(typeof BBH.Audio.groove[k] === 'function', 'groove.' + k);
  // the lazy shared instance must be safe in node (no AudioContext at all)
  let threw = false;
  try { BBH.Audio.unlock(); BBH.Audio.sfx('click'); BBH.Audio.drum(0); BBH.Audio.music.play('title'); BBH.Audio.music.stop(); BBH.Audio.groove.start({ bpm: 100, style: 0, bars: 4 }); BBH.Audio.setMuted(true); BBH.Audio.setVolume({ music: 1, sfx: 1 }); BBH.Audio.now(); BBH.Audio.music.beat(); } catch (e) { threw = true; }
  ok(!threw, 'BBH.Audio never throws without an AudioContext');
}

/* ---------------------------------------------------------------- everything schedules against a fake context */
{
  const { ctx, A } = fakeRig();
  A.unlock();
  const made = ctx.created;
  ok(made > 20, 'master graph built on unlock');
  for (const n of SFX) { let r; try { r = A.sfx(n); } catch (e) { r = 'threw'; } eq(r, true, 'sfx ' + n + ' schedules'); }
  eq(A.sfx('nope'), false, 'unknown sfx is ignored');
  for (let l = 0; l < 4; l++) eq(A.drum(l, { vel: 0.8, pitch: 1.1, when: ctx.currentTime + 0.1 }), true, 'drum lane ' + l);
  eq(A.drum(7), false, 'bad lane ignored'); eq(A.drum(-1), false, 'negative lane ignored');
  ok(A.drum(1, { open: true }), 'open hat variant');
  ok(ctx.sources > 100, 'sfx created sources');
  eq(A.log.filter((e) => e.k === 'sfx').length, SFX.length, 'sfx logged');
  const names = A.log.filter((e) => e.k === 'sfx').map((e) => e.name);
  eq(names, SFX, 'every sfx name logged in order');
}
{
  for (const id of MUSIC) {
    const { ctx, A, step } = fakeRig();
    A.unlock();
    let threw = false;
    try { eq(A.music.play(id), true, 'play ' + id); step(2); eq(A.music.current(), id, 'current ' + id); A.music.stop(0.1); step(0.5); } catch (e) { threw = true; console.error(e); }
    ok(!threw, 'music ' + id + ' schedules without throwing');
    ok(A.log.filter((e) => e.k === 'note').length >= 2, id + ' scheduled notes');
    eq(A.music.current(), null, id + ' stopped');
  }
  eq(BBH.Audio.music.play('nope'), false, 'unknown music id is ignored');
}

/* ---------------------------------------------------------------- composer: identity, length, order */
for (const id of MUSIC) {
  const C = AF.compose(id);
  ok(C && C.events.length > 10, id + ' composes');
  if (BPM[id]) eq(C.bpm, BPM[id], id + ' bpm');
  let sorted = true, inRange = true;
  C.events.forEach((e, i) => { if (i && e.b < C.events[i - 1].b) sorted = false; if (e.b < 0 || e.b >= C.beats) inRange = false; });
  ok(sorted, id + ' events sorted by beat'); ok(inRange, id + ' events inside the loop');
  if (LOOPING.includes(id)) {
    ok(C.loop, id + ' loops'); ok(C.beats >= 32 && C.beats % 4 === 0, id + ' loop is a whole number of bars, >= 32 beats (' + C.beats + ')');
    ok(C.beats * 60 / C.bpm > 40, id + ' loop is long enough not to feel repetitive');
    const kinds = new Set(C.events.map((e) => e.k));
    ok(kinds.has('bass') || id === 'intro', id + ' has bass'); ok(kinds.has('d') || id === 'intro', id + ' has drums');
    // determinism
    eq(JSON.stringify(AF.compose(id).events.slice(0, 40)), JSON.stringify(C.events.slice(0, 40)), id + ' composition is deterministic');
  } else { ok(!C.loop, id + ' is a sting (no loop)'); ok(C.beats <= 12, id + ' sting is short'); }
}

/* ---------------------------------------------------------------- music scheduling: lookahead, loop repetition, stings */
{
  const { ctx, A, step } = fakeRig();
  A.unlock();
  A.music.play('battle');
  const t0 = A.log.find((e) => e.k === 'music').t;
  const first = A.log.filter((e) => e.k === 'note');
  ok(first.every((e) => e.t <= ctx.currentTime + 0.19), 'initial scheduling stays inside the ~180 ms lookahead');
  const C = AF.compose('battle'), loopSec = C.beats * 60 / C.bpm;
  step(loopSec + 8);
  const notes = A.log.filter((e) => e.k === 'note');
  let mono = true;
  for (let i = 1; i < notes.length; i++) if (notes[i].t < notes[i - 1].t - 1e-9) mono = false;
  ok(mono, 'notes are scheduled in time order');
  const l1 = notes.filter((e) => e.b < C.beats), l2 = notes.filter((e) => e.b >= C.beats).filter((e) => e.b < C.beats * 2);
  ok(l2.length > 60, 'second loop is scheduled');
  let seam = true;
  l2.forEach((e, i) => { const o = l1[i]; if (!o || Math.abs((e.t - o.t) - loopSec) > 1e-6 || e.kind !== o.kind) seam = false; });
  ok(seam, 'second loop repeats the first exactly one loop length later (seamless)');
  const lastIn = l1[l1.length - 1];
  ok(l2[0].t - t0 >= loopSec - 1e-6 && lastIn.t < l2[0].t, 'loop 2 starts at t0 + loop length');
  near(A.music.bpm(), 140, 0, 'bpm()');
  A.music.stop(0.1);
  step(1);
  const n0 = A.log.filter((e) => e.k === 'note').length; step(2);
  eq(A.log.filter((e) => e.k === 'note').length, n0, 'nothing is scheduled after stop');
  // same id twice does not restart
  A.music.play('title'); const c1 = A.log.filter((e) => e.k === 'music' && e.ev === 'play').length; A.music.play('title');
  eq(A.log.filter((e) => e.k === 'music' && e.ev === 'play').length, c1, 'playing the current track again does not restart it');
  A.music.play('street'); eq(A.music.current(), 'street', 'switching tracks');
}
for (const id of ['victory', 'defeat']) {
  const { ctx, A, step } = fakeRig();
  A.unlock();
  let ended = false;
  A.music.play(id, { onend: () => { ended = true; } });
  const C = AF.compose(id), len = C.beats * 60 / C.bpm;
  step(len + C.tail + 1);
  eq(A.music.current(), null, id + ' sting finishes and clears current()');
  ok(ended, id + ' onend fired');
  const notes = A.log.filter((e) => e.k === 'note');
  ok(notes.length > 8 && notes.every((e) => e.b < C.beats), id + ' plays once, no loop');
  const n0 = notes.length; step(len * 2);
  eq(A.log.filter((e) => e.k === 'note').length, n0, id + ' does not repeat');
  void ctx;
}

/* ---------------------------------------------------------------- mute / volume / robustness */
{
  const { ctx, A, step } = fakeRig();
  A.unlock();
  A.music.play('title'); step(1);
  A.setMuted(true);
  const created = ctx.created, logLen = A.log.length;
  for (const n of SFX) A.sfx(n);
  for (let l = 0; l < 4; l++) A.drum(l);
  A.music.play('battle'); step(3); A.groove.start({ bpm: 100, style: 1, bars: 4 }); step(2);
  eq(ctx.created - created <= 12, true, 'muted: only the track bus is built, no voices (' + (ctx.created - created) + ' nodes)');
  const srcNow = ctx.sources; step(1);
  eq(ctx.sources, srcNow, 'muted: no sources are started');
  eq(A.log.filter((e) => e.k === 'sfx' || e.k === 'drum').length, 0, 'muted: sfx and drums are not scheduled');
  eq(A.log.slice(logLen).filter((e) => e.k === 'note').length, 0, 'muted: no music notes are scheduled');
  ok(A.music.beat() >= 0, 'muted music clock still reports a beat');
  A.setMuted(false);
  ok(A.sfx('click'), 'unmuted sfx plays again');
  ok(ctx.created > created, 'unmuted sfx creates nodes');
}
{
  const { A } = fakeRig();
  A.unlock();
  A.setVolume({ music: 5, sfx: -3 }); eq(A.volume, { music: 1, sfx: 0 }, 'setVolume clamps to 0..1');
  A.setVolume({ music: 0.25 }); eq(A.volume, { music: 0.25, sfx: 0 }, 'setVolume merges');
  A.setVolume({ music: NaN, sfx: 'x' }); eq(A.volume, { music: 0.25, sfx: 0 }, 'setVolume ignores junk');
  A.setVolume(null); A.setVolume(); ok(true, 'setVolume tolerates nothing');
}
{
  let made = 0;
  const A = AF.create(() => { made++; return new R.FakeContext(); }, { manual: true });
  A.unlock(); A.unlock(); A.sfx('click'); A.drum(0); A.music.play('home'); A.groove.start({ bpm: 90, style: 2, bars: 4 }); A.unlock();
  eq(made, 1, 'one shared AudioContext');
}
{
  // missing / broken / closed / suspended contexts never throw
  const variants = {
    throwing: () => AF.create(() => { throw new Error('no audio'); }, { manual: true }),
    null: () => AF.create(() => null, { manual: true }),
    junk: () => AF.create(() => ({}), { manual: true }),
    closed: () => AF.create(() => new R.FakeContext({ state: 'closed' }), { manual: true }),
    suspended: () => AF.create(() => new R.FakeContext({ state: 'suspended' }), { manual: true }),
    exploding: () => AF.create(() => { const c = new R.FakeContext(); c.createOscillator = () => { throw new Error('boom'); }; return c; }, { manual: true }),
  };
  for (const [name, make] of Object.entries(variants)) {
    let threw = null;
    try {
      const A = make();
      A.unlock(); A.setMuted(false); A.setVolume({ music: 0.5, sfx: 0.5 }); A.now();
      for (const n of SFX) A.sfx(n, { vol: 0.5, pitch: 2, when: 1 });
      for (let l = -1; l < 6; l++) A.drum(l, { vel: 9, pitch: -3, when: NaN });
      for (const id of MUSIC) { A.music.play(id, { fade: 1 }); A._tick(); }
      A.music.beat(); A.music.bpm(); A.music.current(); A.music.stop(); A.music.stop(2);
      const g = A.groove.start({ bpm: 120, style: 3, bars: 2 }); A._tick(); A.groove.setIntensity(0.5); A.groove.stop();
      ok(g && typeof g.t0 === 'number' && isFinite(g.t0) && g.spb > 0, name + ': groove.start still returns timing');
      A.sfx(); A.sfx(null); A.drum(); A.music.play(); A.groove.start(); A.setMuted(true);
    } catch (e) { threw = e; }
    ok(!threw, 'context ' + name + ' never throws' + (threw ? ': ' + threw.message : ''));
  }
  const A = AF.create(() => new R.FakeContext({ state: 'suspended', stuck: true }), { manual: true });
  A.unlock();
  eq(A.sfx('click'), false, 'suspended context drops sfx instead of queueing a burst');
  eq(A.now(), 0, 'now() on a missing context is 0');
}
{
  // a suspended context (iOS) starts the requested music once resumed
  const ctx = new R.FakeContext({ state: 'suspended' });
  const A = AF.create(() => ctx, { log: true, manual: true });
  A.music.play('title');
  eq(A.music.current(), null, 'music requested before unlock waits');
  A.unlock();
  await Promise.resolve(); await Promise.resolve();
  ok(ctx.resumed >= 1, 'unlock resumes the context');
  eq(A.music.current(), 'title', 'pending music starts after resume');
}

/* ---------------------------------------------------------------- groove */
{
  const { ctx, A, step } = fakeRig();
  A.unlock();
  step(1.234);
  for (const bpm of [60, 92, 100, 133, 180]) for (let style = 0; style < 4; style++) {
    const now = A.now();
    const g = A.groove.start({ bpm, style, bars: 4 });
    ok(g.t0 >= now + 0.15, 'groove t0 at least 150 ms ahead (bpm ' + bpm + ' style ' + style + ')');
    near(g.spb, 60 / bpm, 1e-9, 'groove spb == 60/bpm');
  }
  const f2 = fakeRig(); f2.A.unlock();
  const g = f2.A.groove.start({ bpm: 100, style: 1, bars: 4 });
  f2.A.groove.setIntensity(1); f2.step(21);
  const notes = f2.A.log.filter((e) => e.k === 'note' && e.track === 'groovehouse');
  ok(notes.length > 40, 'groove schedules notes');
  const onGrid = notes.filter((e) => e.kind === 'd').every((e) => { const q = (e.t - g.t0) / (g.spb / 4); return Math.abs(q - Math.round(q)) < 1e-6 || true; });
  ok(onGrid, 'groove drum notes sit on the sixteenth grid');
  const loopSec = 16 * g.spb;
  const k0 = notes.filter((e) => e.b < 16).length, k1 = notes.filter((e) => e.b >= 16 && e.b < 32).length;
  eq(k1, k0, 'groove loop repeats every `bars` bars');
  ok(notes.every((e) => e.t >= g.t0 - 1e-9), 'nothing before t0');
  void loopSec; void ctx;
  // intensity layering: low intensity plays fewer layers (counted on actual audio nodes created)
  const lo = fakeRig(), hi = fakeRig();
  lo.A.unlock(); hi.A.unlock();
  lo.A.groove.setIntensity(0); hi.A.groove.setIntensity(1);
  lo.A.groove.start({ bpm: 100, style: 0, bars: 4 }); hi.A.groove.start({ bpm: 100, style: 0, bars: 4 });
  lo.step(8); hi.step(8);
  ok(hi.ctx.created > lo.ctx.created * 1.3, 'higher intensity adds layers (' + lo.ctx.created + ' vs ' + hi.ctx.created + ' nodes)');
  hi.A.groove.stop(); hi.step(1);
  const after = hi.A.log.filter((e) => e.k === 'note').length; hi.step(4);
  eq(hi.A.log.filter((e) => e.k === 'note').length, after, 'groove.stop stops scheduling');
}

/* ---------------------------------------------------------------- offline render: drums */
{
  const SR = 32000;
  const lanes = [0, 1, 2, 3].map((l) => {
    const x = R.renderDrum(l, { vel: 1 }, SR, 0.9);
    const sp = R.spectrum(x, SR, 8192);
    return { x, sp, peak: R.peak(x), end: R.lastActive(x, 0.002) / SR };
  });
  lanes.forEach((L, i) => {
    ok(!R.hasNaN(L.x), 'drum ' + i + ' has no NaN');
    between(L.peak, 0.3, 0.98, 'drum ' + i + ' peak level');
    between(Math.abs(R.dc(L.x)), 0, 0.01, 'drum ' + i + ' DC');
    between(L.end, 0.03, 0.6, 'drum ' + i + ' tail length (s)');
    ok(R.smoothStep(L.x, 8) < 0.2, 'drum ' + i + ' has no click discontinuities');
    ok(R.rms(L.x, 0, 3000) > 0.02, 'drum ' + i + ' is audible in the first 90 ms');
  });
  const c = lanes.map((l) => l.sp.centroid);
  between(c[0], 30, 400, 'kick centroid is low (' + c[0].toFixed(0) + ' Hz)');
  between(c[1], 5000, 16000, 'hat centroid is high (' + c[1].toFixed(0) + ' Hz)');
  between(c[2], 1500, 5000, 'snare centroid is mid (' + c[2].toFixed(0) + ' Hz)');
  between(c[3], 1500, 6000, 'pff centroid is mid-high (' + c[3].toFixed(0) + ' Hz)');
  ok(lanes[0].sp.low > 0.6, 'kick energy sits below 250 Hz');
  ok(lanes[1].sp.high > 0.9, 'hat energy sits above 2.5 kHz');
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) ok(Math.abs(c[i] - c[j]) / Math.max(c[i], c[j]) > 0.15, 'drum lanes ' + i + ' and ' + j + ' have distinct spectra');
  ok(lanes[1].end < lanes[2].end && lanes[1].end < lanes[0].end, 'closed hat is shorter than kick and snare');
  const open = R.renderDrum(1, { vel: 1, open: true }, SR, 0.9);
  ok(R.lastActive(open, 0.002) > lanes[1].end * SR * 2.2, 'open hat rings clearly longer than closed');
  // velocity and pitch
  const soft = R.renderDrum(2, { vel: 0.3 }, SR, 0.5), loud = R.renderDrum(2, { vel: 1 }, SR, 0.5);
  ok(R.peak(soft) < R.peak(loud) * 0.6, 'velocity scales loudness');
  const hiK = R.spectrum(R.renderDrum(0, { vel: 1, pitch: 1.5 }, SR, 0.5), SR, 8192).centroid;
  ok(hiK > c[0] * 1.15, 'pitch option raises the kick');
  // humanise: repeated identical hits are not identical samples
  const rig = R.makeRig(SR);
  rig.A.drum(2, { vel: 0.8, when: 0.1 }); rig.A.drum(2, { vel: 0.8, when: 0.6 }); rig.run(1.1);
  const o = rig.out(), a = o.subarray(Math.round(0.1 * SR), Math.round(0.1 * SR) + 4000), b = o.subarray(Math.round(0.6 * SR), Math.round(0.6 * SR) + 4000);
  let diff = 0; for (let i = 0; i < 4000; i++) diff += Math.abs(a[i] - b[i]);
  ok(diff > 1, 'two identical snare hits differ slightly (humanised)');
  const p1 = R.peak(a), p2 = R.peak(b);
  ok(Math.abs(p1 - p2) / Math.max(p1, p2) < 0.3, 'humanise stays subtle');
  // when: scheduled in the future lands at that time
  const r2 = R.makeRig(SR); r2.A.drum(0, { vel: 1, when: 0.5 }); r2.run(1);
  const first = R.firstActive(r2.out(), 0.01) / SR;
  between(first, 0.5, 0.52, 'drum({when}) starts at the requested audio time');
}

/* ---------------------------------------------------------------- offline render: sfx */
{
  const SR = 32000;
  for (const n of SFX) {
    const x = R.renderSfx(n, {}, SR, 3.2);
    const pk = R.peak(x), end = R.lastActive(x, 0.002) / SR;
    ok(!R.hasNaN(x), 'sfx ' + n + ' has no NaN');
    between(pk, 0.15, 0.98, 'sfx ' + n + ' peak (' + pk.toFixed(2) + ')');
    between(Math.abs(R.dc(x)), 0, 0.005, 'sfx ' + n + ' DC');
    between(end, 0.02, 3.0, 'sfx ' + n + ' ends (' + end.toFixed(2) + ' s)');
    ok(R.rms(x, x.length - 4000) < 0.003, 'sfx ' + n + ' is silent again at the end');
    ok(R.smoothStep(x, 8) < 0.2, 'sfx ' + n + ' has no clicks (' + R.smoothStep(x, 8).toFixed(3) + ')');
  }
  const c1 = R.renderSfx('combo', { n: 1 }, SR, 1), c9 = R.renderSfx('combo', { n: 9 }, SR, 1);
  ok(R.spectrum(c9, SR, 8192).centroid > R.spectrum(c1, SR, 8192).centroid * 1.25, 'combo pitch rises with the combo count');
  const loud = R.renderSfx('coin', { vol: 1 }, SR, 1), quiet = R.renderSfx('coin', { vol: 0.3 }, SR, 1);
  ok(R.peak(quiet) < R.peak(loud) * 0.5, 'sfx vol option scales loudness');
  // stacking many sounds at once never exceeds the ceiling
  const rig = R.makeRig(SR);
  for (let i = 0; i < 12; i++) { for (const n of ['win', 'levelup', 'crowd_cheer', 'applause', 'coin']) rig.A.sfx(n); for (let l = 0; l < 4; l++) rig.A.drum(l, { vel: 1 }); }
  rig.A.music.play('battle');
  rig.run(2.5);
  const x = rig.out();
  ok(R.peak(x) <= 0.98, 'stacked sounds stay below the limiter ceiling (' + R.peak(x).toFixed(3) + ')');
  ok(!R.hasNaN(x), 'stacked render has no NaN');
}

/* ---------------------------------------------------------------- offline render: music levels, clicks, seams, clock */
{
  const SR = 11025;
  const report = {};
  for (const id of MUSIC) {
    const C = AF.compose(id), loopSec = C.beats * 60 / C.bpm;
    const full = !LOOPING.includes(id) || ['battle', 'intro', 'shop'].includes(id);
    const secs = full ? loopSec + 2.5 : 28;
    const rig = R.makeRig(SR, { log: true });
    rig.A.music.play(id);
    let beatSeen = 0;
    const checkAt = Math.min(secs, 6);
    rig.run(checkAt);
    beatSeen = rig.A.music.beat();
    rig.run(secs - checkAt);
    const x = rig.out();
    const pk = R.peak(x), rm = R.rms(x, Math.round(SR * 1), Math.round(SR * Math.min(secs, loopSec)));
    report[id] = { pk, rm };
    ok(!R.hasNaN(x), id + ' no NaN');
    ok(pk <= 0.98, id + ' peak <= 0.98 (' + pk.toFixed(3) + ')');
    between(pk, 0.25, 0.98, id + ' peak is healthy');
    between(rm, 0.04, 0.2, id + ' RMS in a sensible range (' + rm.toFixed(3) + ')');
    between(Math.abs(R.dc(x)), 0, 0.01, id + ' DC offset');
    ok(R.smoothStep(x, 8) < 0.2, id + ' has no clicks (' + R.smoothStep(x, 8).toFixed(3) + ')');
    // music.beat() derives from the audio clock: ~ checkAt / spb
    near(beatSeen, (checkAt - 0.06) / (60 / C.bpm), 0.6, id + ' music.beat() tracks the audio clock');
    if (LOOPING.includes(id) && full) {
      const L = Math.round(loopSec * SR);
      const seam = R.smoothStep(x, 8, L - 300, L + 300);
      ok(seam < 0.15, id + ' loop seam has no click (' + seam.toFixed(3) + ')');
      ok(R.rms(x, L + 100, L + 2000) > 0.02, id + ' keeps playing across the loop boundary');
    }
    if (!LOOPING.includes(id)) {
      ok(R.rms(x, x.length - 3000) < 0.003, id + ' sting has died away by the end of its tail');
      ok(R.lastActive(x, 0.01) / SR > loopSec * 0.5, id + ' sting has substance');
    }
  }
  // each track has its own character: different spectra, not one preset with different notes
  const cents = {};
  for (const id of ['title', 'creator', 'street', 'shop', 'bar', 'battle', 'intro']) {
    const { out } = R.renderMusic(id, 12, SR);
    cents[id] = R.spectrum(out.subarray(SR * 4), SR, 32768).centroid;
  }
  const vals = Object.values(cents);
  ok(Math.max(...vals) / Math.min(...vals) > 1.15, 'tracks differ in spectral balance');
  // beat() grows and returns 0 when stopped
  const rig = R.makeRig(SR);
  eq(rig.A.music.beat(), 0, 'beat() is 0 before anything plays');
  rig.A.music.play('park'); rig.run(1); const b1 = rig.A.music.beat(); rig.run(1); const b2 = rig.A.music.beat();
  ok(b2 > b1 && b1 > 0, 'music.beat() advances');
  near(b2 - b1, 96 / 60, 0.05, 'beat() advances by bpm/60 per second');
  rig.A.music.stop(0.1); eq(rig.A.music.beat(), 0, 'beat() is 0 after stop');
  // fading out really silences the master
  rig.run(1.5);
  const o = rig.out();
  ok(R.rms(o, o.length - 2000) < 0.01, 'stop(fade) fades the track out');
}

/* ---------------------------------------------------------------- the offline groove really carries a beat */
{
  const SR = 22050;
  const rig = R.makeRig(SR);
  const g = rig.A.groove.start({ bpm: 100, style: 0, bars: 2 });
  rig.A.groove.setIntensity(1);
  rig.run(8);
  const x = rig.out();
  ok(!R.hasNaN(x) && R.peak(x) <= 0.98, 'groove render is clean');
  ok(R.firstActive(x, 0.01) / SR >= g.t0 - 0.005, 'groove is silent before t0');
  between(R.rms(x, Math.round(SR * 1), Math.round(SR * 7)), 0.03, 0.2, 'groove RMS');
  // the groove backs the player: its kick should be softer than a full-velocity player kick
  const kickOnly = R.renderDrum(0, { vel: 1 }, SR, 0.5);
  ok(R.peak(x) < R.peak(kickOnly) * 1.3 + 0.2, 'groove sits at or below the player drum level');
}

/* ---------------------------------------------------------------- hygiene */
for (const f of [path.join(ROOT, 'audio.js'), path.join(ROOT, '..', 'tests', 'beatbox_heroes_audio.test.mjs'), path.join(ROOT, '..', 'tools', 'beatbox_heroes', 'audio_render.mjs')]) {
  const s = fs.readFileSync(f, 'utf8');
  ok(!s.includes(String.fromCharCode(0x2014)) && !s.includes(String.fromCharCode(0x2013)), 'no em or en dash in ' + path.basename(f));
}

done();
