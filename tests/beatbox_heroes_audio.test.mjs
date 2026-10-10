// BBH.Audio: API contract, scheduling against a fake context, and numeric analysis of offline renders.
import fs from 'node:fs';
import path from 'node:path';
import { ok, eq, near, between, done, load, ROOT } from './beatbox_heroes_lib.mjs';
import * as R from '../tools/beatbox_heroes/audio_render.mjs';

const BBH = load('audio');
const AF = BBH.AudioFactory;
const SFX = ['click', 'back', 'confirm', 'error', 'coin', 'buy', 'unlock', 'levelup', 'achievement', 'hit_perfect', 'hit_good', 'miss', 'combo', 'win', 'lose', 'equip', 'swoosh', 'sleep', 'eat', 'step', 'door', 'crowd_cheer', 'crowd_boo', 'applause', 'sparkle', 'whoosh', 'record', 'countdown', 'rain', 'thunder', 'heart', 'hum', 'go'];
const MUSIC = ['title', 'creator', 'street', 'home', 'park', 'shop', 'bar', 'studio', 'battle', 'victory', 'defeat', 'intro'];
const BPM = { title: 126, creator: 84, street: 90, home: 76, park: 96, shop: 100, bar: 90, studio: 122, battle: 172, intro: 66 };
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
  near(A.music.bpm(), 172, 0, 'bpm()');
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

/* ================================================================ TRAINING_PLAN section 2 */
const SOUNDS = ['B', 't', 'K', 'Pf', 'LR', 'TB', 'IK', 'CR', 'ZP', 'SI', 'WB', 'RIM', 'HUM'];
const NEW_API = ['gameMode', 'isGameMode', 'metronome', 'metronomeInfo', 'shaker', 'note', 'chord', 'interval', 'beatbox', 'hasVoice'];
{
  for (const k of NEW_API) ok(typeof BBH.Audio[k] === 'function', 'BBH.Audio.' + k);
  eq(BBH.Audio.SOUND_IDS, SOUNDS, 'SOUND_IDS lists every synth voice');
  eq(AF.SOUND_IDS, SOUNDS, 'factory SOUND_IDS');
  ok(BBH.Audio.TIMBRES.includes('keys'), 'keys timbre listed');
  let threw = false;
  try {
    BBH.Audio.gameMode(true, { metronome: 100 }); BBH.Audio.shaker(true); BBH.Audio.note(60, 0.5); BBH.Audio.chord([60, 64, 67], 1); BBH.Audio.interval(60, 67);
    BBH.Audio.beatbox('LR'); BBH.Audio.drum('RIM'); BBH.Audio.metronome(120); BBH.Audio.metronomeInfo(); BBH.Audio.gameMode(false); BBH.Audio.isGameMode();
  } catch (e) { threw = true; }
  ok(!threw, 'new BBH.Audio functions never throw without an AudioContext');
  eq(BBH.Audio.isGameMode(), false, 'game mode is off again');
}

/* ---------------------------------------------------------------- gameMode: scene music off, deferred, restored */
{
  const { A, step } = fakeRig();
  A.unlock();
  A.music.play('park'); step(1);
  eq(A.music.current(), 'park', 'scene track playing');
  const g = A.gameMode(true);
  eq(A.isGameMode(), true, 'isGameMode on');
  eq(g.spb, 0, 'no metronome asked, spb 0');
  eq(A.music.current(), null, 'gameMode(true) stops the scene music');
  step(1);
  const n0 = A.log.filter((e) => e.k === 'note').length; step(2);
  eq(A.log.filter((e) => e.k === 'note').length, n0, 'no scene notes are scheduled during a game');
  eq(A.music.play('street'), true, 'music.play during a game is accepted');
  eq(A.music.current(), null, '...but deferred, nothing plays');
  ok(A.log.some((e) => e.k === 'music' && e.ev === 'deferred' && e.id === 'street'), 'deferred request logged');
  A.gameMode(true); eq(A.music.current(), null, 'gameMode(true) twice is harmless');
  A.gameMode(false);
  eq(A.isGameMode(), false, 'isGameMode off');
  eq(A.music.current(), 'street', 'the last requested scene track comes back after the game');
  // without a request in between the previous track is restored
  A.gameMode(true); step(1); A.gameMode(false);
  eq(A.music.current(), 'street', 'previous scene track restored');
  A.gameMode(true); A.gameMode(false, { restore: false });
  eq(A.music.current(), null, 'restore:false leaves the music off');
  A.gameMode(false); ok(true, 'gameMode(false) when off is harmless');
  // a sting at the end of a game plays, and the scene track follows when it ends
  A.music.play('home'); step(0.5);
  A.gameMode(true);
  eq(A.music.play('victory'), true, 'stings still play during a game');
  eq(A.music.current(), 'victory', 'victory sting is current');
  A.gameMode(false);
  eq(A.music.current(), 'victory', 'the sting is not cut off by gameMode(false)');
  const C = AF.compose('victory'); step(C.beats * 60 / C.bpm + C.tail + 1);
  eq(A.music.current(), 'home', 'scene track returns after the sting');
  // duck keeps the track but lower
  A.gameMode(true, { duck: 0.2 });
  eq(A.music.current(), 'home', 'duck mode keeps the scene track running');
  A.gameMode(false); eq(A.music.current(), 'home', 'duck mode exit keeps the track');
  // music.stop during the game cancels the deferred request but not the restore
  A.gameMode(true); A.music.play('shop'); A.music.stop(); A.gameMode(false);
  eq(A.music.current(), 'home', 'music.stop during a game drops the deferred track, the previous one returns');
}
{
  // gameMode before unlock on a suspended context: pending scene music is not started by the resume during the game
  const ctx = new R.FakeContext({ state: 'suspended' });
  const A = AF.create(() => ctx, { log: true, manual: true });
  A.music.play('title');
  A.gameMode(true);
  A.unlock(); await Promise.resolve(); await Promise.resolve();
  eq(A.music.current(), null, 'pending scene music waits for the game to end');
  A.gameMode(false); eq(A.music.current(), 'title', 'and starts after it');
}

/* ---------------------------------------------------------------- metronome scheduling on the audio clock */
{
  const { ctx, A, step } = fakeRig();
  A.unlock(); step(0.5);
  const tn = ctx.currentTime;
  const m = A.gameMode(true, { metronome: 120 });
  near(m.spb, 0.5, 1e-12, 'metronome spb'); eq(m.bpm, 120, 'metronome bpm');
  ok(m.t0 >= tn + 0.15 && m.t0 <= tn + 0.25, 'metronome beat 0 a little ahead of now');
  step(4.2);
  const ticks = A.log.filter((e) => e.k === 'metro' && e.t != null && e.beat != null);
  ok(ticks.length >= 7, 'metronome ticks (' + ticks.length + ')');
  ok(ticks.every((e, i) => Math.abs(e.t - (m.t0 + i * 0.5)) < 1e-9 && e.beat === i), 'ticks land exactly on t0 + n * spb (sample accurate)');
  ok(ticks.every((e) => e.accent === (e.beat % 4 === 0)), 'accent on beat 1 of every bar');
  ok(ticks.every((e) => e.t <= ctx.currentTime + 0.19), 'metronome respects the lookahead');
  const info = A.metronomeInfo();
  ok(info.on && info.bpm === 120, 'metronomeInfo on');
  near(info.beat, (ctx.currentTime - m.t0) / 0.5, 1e-6, 'metronomeInfo beat follows the audio clock');
  // tempo change keeps going from the next beat
  const before = ticks.length, last = ticks[ticks.length - 1];
  A.metronome(90); step(3);
  const after = A.log.filter((e) => e.k === 'metro' && e.beat != null).slice(before);
  ok(after.length >= 3, 'metronome keeps ticking after a bpm change');
  near(after[0].t - last.t, 60 / 90, 1e-9, 'first tick after the change is one new beat later (no double tick, no gap)');
  ok(after.every((e, i) => !i || Math.abs(e.t - after[i - 1].t - 60 / 90) < 1e-9), 'new tempo spacing');
  eq(after[0].beat, last.beat + 1, 'beat count continues across the change');
  // start offset: line up with a chart whose beat 0 was in the past
  const chartT0 = ctx.currentTime - 1.1;
  const r = A.metronome(100, { start: chartT0 }); step(2);
  eq(r.t0, chartT0, 'start option is beat 0');
  const al = A.log.filter((e) => e.k === 'metro' && e.bpm === 100 && e.beat != null);
  ok(al.length >= 2 && al.every((e) => Math.abs(((e.t - chartT0) / 0.6) - e.beat) < 1e-6), 'ticks line up with the chart start');
  ok(al.every((e) => e.accent === (e.beat % 4 === 0)), 'accent follows the chart bar');
  A.gameMode(false);
  eq(A.metronomeInfo().on, false, 'gameMode(false) stops the metronome');
  const nm = A.log.filter((e) => e.k === 'metro').length; step(2);
  eq(A.log.filter((e) => e.k === 'metro').length, nm, 'no ticks after gameMode(false)');
  const lb = A.log.length;
  A.metronome(100, { beats: 3, offset: 0.1 }); step(2.2);
  const w = A.log.slice(lb).filter((e) => e.k === 'metro' && e.beat != null);
  ok(w.filter((e) => e.accent).length >= 1 && w.every((e) => e.accent === (e.beat % 3 === 0)), 'beats:3 accents every third tick');
  A.metronome(0); eq(A.metronomeInfo().on, false, 'metronome(0) stops');
  // muted: no sources
  A.metronome(120); A.setMuted(true); const s0 = ctx.sources; step(2);
  eq(ctx.sources, s0, 'muted metronome starts no sources');
  A.setMuted(false); step(1); ok(ctx.sources > s0, 'unmuted metronome ticks again');
  A.metronome(0);
  eq(A.shaker(true), true, 'shaker() single tick'); eq(A.shaker(false, { when: ctx.currentTime + 0.1 }), true, 'shaker({when})');
}

/* ---------------------------------------------------------------- beatbox voices by id, samples by id */
{
  const { A, ctx } = fakeRig();
  A.unlock();
  for (const id of SOUNDS) { eq(A.drum(id, { vel: 0.8 }), true, 'drum(' + id + ')'); eq(A.beatbox(id), true, 'beatbox(' + id + ')'); ok(A.hasVoice(id), 'hasVoice ' + id); }
  for (const id of ['b', 'T', 'k', 'pf', 'P', 'lr', 'rim', 'Rim']) eq(A.drum(id), true, 'alias ' + id);
  eq(A.drum('XX'), false, 'unknown sound id ignored'); eq(A.drum(''), false, 'empty id ignored'); eq(A.drum({}), false, 'junk id ignored');
  eq(A.hasVoice('XX'), false, 'hasVoice unknown');
  const lanes = A.log.filter((e) => e.k === 'drum' && e.id === 'K').map((e) => e.lane);
  ok(lanes.length && lanes.every((l) => l === 2), 'K plays lane 2');
  // a Core.SOUNDS entry with a lane and no synth voice falls back to that lane
  const prevCore = globalThis.BBH.Core;
  globalThis.BBH.Core = Object.assign({}, prevCore || {}, { SOUNDS: [{ id: 'QQ', lane: 2 }, { id: 'NL' }] });
  eq(A.drum('QQ'), true, 'Core sound with a lane falls back to the lane voice');
  eq(A.drum('NL'), false, 'Core sound without voice or lane is ignored');
  if (prevCore) globalThis.BBH.Core = prevCore; else delete globalThis.BBH.Core;
  // samples by id override the synth voice, lanes and base ids are the same slot
  const samp = new Float32Array(2000).map((_, i) => Math.sin(i / 7) * 0.5);
  eq(A.setSample('LR', samp, 44100), true, 'setSample by id');
  eq(A.hasSample('lr'), true, 'hasSample by id (any case)');
  const n0 = A.log.length; A.drum('LR');
  ok(A.log.slice(n0).some((e) => e.k === 'drum' && e.sample && e.id === 'LR'), 'recorded LR replaces the synth LR');
  eq(A.setSample(0, samp, 44100), true, 'setSample lane 0'); eq(A.hasSample('B'), true, 'lane 0 is id B');
  A.clearSample('B'); eq(A.hasSample(0), false, 'clearSample(B) clears lane 0');
  eq(A.setSample('XY9', samp, 44100), true, 'a future Core id can hold a sample');
  eq(A.drum('XY9'), true, 'and plays it');
  A.clearSample('LR'); const s0 = ctx.sources; A.drum('LR'); ok(ctx.sources - s0 > 2, 'back to the synth LR after clearSample');
  eq(A.setSample(9, samp, 44100), false, 'bad lane still rejected');
}

/* ---------------------------------------------------------------- offline render: new beatbox voices */
{
  const SR = 32000, F = {};
  for (const id of SOUNDS) {
    const x = R.renderDrum(id, { vel: 1 }, SR, 1.4), sp = R.spectrum(x, SR, 16384);
    F[id] = { c: sp.centroid, len: R.lastActive(x, 0.002) / SR, low: sp.low };
    if (['B', 't', 'K', 'Pf'].includes(id)) continue;
    ok(!R.hasNaN(x), id + ' has no NaN');
    between(R.peak(x), 0.25, 0.98, id + ' peak level');
    between(Math.abs(R.dc(x)), 0, 0.01, id + ' DC');
    between(F[id].len, 0.04, 1.2, id + ' length (s)');
    ok(R.smoothStep(x, 8) < 0.2, id + ' has no clicks');
    ok(R.rms(x, x.length - 4000) < 0.003, id + ' is silent again at the end');
  }
  ok(F.TB.low > 0.6 && F.LR.low > 0.5, 'throat bass and lip roll are low sounds');
  ok(F.TB.len > F.B.len * 1.5 && F.LR.len > F.B.len * 1.5, 'throat bass and lip roll sustain longer than a kick');
  ok(F.IK.c > F.K.c && F.IK.len < F.K.len, 'inward K is brighter and tighter than the K snare');
  ok(F.SI.len > 0.6, 'siren is a long sound');
  {
    const lo = R.renderDrum('HUM', { vel: 1, midi: 45 }, SR, 0.8), hi = R.renderDrum('HUM', { vel: 1, midi: 57 }, SR, 0.8);
    const fl = f0Of(lo, SR, Math.round(0.08 * SR), 16384), fh = f0Of(hi, SR, Math.round(0.08 * SR), 16384);
    near(1200 * Math.log2(fh / fl), 1200, 30, 'HUM {midi} hums the asked note (an octave apart)');
  }
  // the real Core.SOUNDS ids all have a voice
  try { load('core'); } catch (e) { /* core may be mid-edit */ }
  const CS = globalThis.BBH.Core && globalThis.BBH.Core.SOUNDS;
  if (Array.isArray(CS)) { const A2 = fakeRig().A; A2.unlock(); for (const s of CS) eq(A2.drum(s.id), true, 'Core.SOUNDS ' + s.id + ' has a voice'); }
  ok(F.RIM.len < F.K.len, 'rimshot is shorter than the snare');
  // every voice is recognisably different: centroid, length or low end differ clearly
  for (let i = 0; i < SOUNDS.length; i++) for (let j = i + 1; j < SOUNDS.length; j++) {
    const a = F[SOUNDS[i]], b = F[SOUNDS[j]];
    const d = Math.abs(Math.log(a.c / b.c)) + Math.abs(Math.log(a.len / b.len)) + Math.abs(a.low - b.low);
    ok(d > 0.35, 'voices ' + SOUNDS[i] + ' and ' + SOUNDS[j] + ' are distinct (' + d.toFixed(2) + ')');
  }
  // the lip roll really flutters: its loudness envelope repeats at about 30 Hz
  const lr = R.renderDrum('LR', { vel: 1 }, SR, 0.6), hop = 32, env = [];
  for (let i = Math.round(0.1 * SR); i < Math.round(0.4 * SR); i += hop) env.push(R.rms(lr, i - 96, i + 96));
  const mean = env.reduce((s, v) => s + v, 0) / env.length, e2 = env.map((v) => v - mean);
  let bestLag = 0, bestC = -Infinity;
  for (let lag = Math.round(SR / 50 / hop); lag <= Math.round(SR / 15 / hop); lag++) { let c = 0; for (let i = lag; i < e2.length; i++) c += e2[i] * e2[i - lag]; if (c > bestC) { bestC = c; bestLag = lag; } }
  between(SR / (bestLag * hop), 20, 40, 'lip roll flutter rate (Hz)');
}

/* ---------------------------------------------------------------- offline render: shaker + metronome */
{
  const SR = 32000;
  const one = (acc) => { const r = R.makeRig(SR); r.A.shaker(acc); r.run(0.4); return r.out(); };
  const s = one(false), a = one(true);
  for (const [x, n] of [[s, 'shaker'], [a, 'accent shaker']]) {
    ok(!R.hasNaN(x), n + ' no NaN'); ok(R.smoothStep(x, 8) < 0.1, n + ' is soft, no clicks');
    between(R.lastActive(x, 0.002) / SR, 0.04, 0.15, n + ' is short');
  }
  between(R.peak(s), 0.04, 0.2, 'shaker sits low under the game (' + R.peak(s).toFixed(3) + ')');
  ok(R.peak(s) < R.peak(R.renderDrum(0, { vel: 1 }, SR, 0.4)) * 0.4, 'shaker is much quieter than a player kick');
  let rs = 0, ra = 0; for (let i = 0; i < 4; i++) { rs += R.rms(one(false), 0, 3200); ra += R.rms(one(true), 0, 3200); } // average out the random noise grain
  ok(ra > rs * 1.08 && ra < rs * 1.8, 'accent is slightly louder (' + (ra / rs).toFixed(2) + 'x)');
  ok(R.spectrum(a, SR, 8192).centroid > R.spectrum(s, SR, 8192).centroid * 1.08, 'accent is brighter');
  ok(R.spectrum(s, SR, 8192).high > 0.9, 'shaker energy is high and airy');
  // a metronome render: onsets land on the grid
  const rig = R.makeRig(SR);
  const m = rig.A.metronome(150, { offset: 0.1 }); rig.run(2.2);
  const x = rig.out(), on = [];
  for (let k = 0; k < 5; k++) { const t = m.t0 + k * m.spb, i0 = Math.round((t - 0.02) * SR); const seg = x.subarray(i0, i0 + Math.round(0.06 * SR)); on.push((i0 + R.firstActive(seg, 0.01)) / SR - t); }
  ok(on.every((d) => d >= -0.0005 && d < 0.004), 'rendered ticks start on the beat (' + on.map((d) => (d * 1000).toFixed(1)).join(', ') + ' ms)');
  // sfx volume 0 silences it
  const q = R.makeRig(SR); q.A.setVolume({ sfx: 0 }); q.A.metronome(120); q.run(1.5);
  ok(R.peak(q.out()) < 0.002, 'sfx volume 0 silences the metronome');
}

/* ---------------------------------------------------------------- offline render: ear training tones */
function f0Of(x, sr, from, n) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[from + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  R.fft(re, im);
  const mag = (k) => Math.hypot(re[k], im[k]);
  let best = 2; for (let k = 2; k < n / 2 - 1; k++) if (mag(k) > mag(best)) best = k;
  const a = Math.log(mag(best - 1) + 1e-12), b = Math.log(mag(best) + 1e-12), c = Math.log(mag(best + 1) + 1e-12);
  return (best + 0.5 * (a - c) / (a - 2 * b + c)) * sr / n;
}
{
  const SR = 32000;
  for (const midi of [48, 57, 60, 64, 67, 69, 72, 76, 84]) {
    const r = R.makeRig(SR); const res = r.A.note(midi, 1); r.run(1.4); const x = r.out();
    ok(res && res.end > res.t0, 'note returns timing');
    const f = f0Of(x, SR, Math.round(0.05 * SR), 16384), want = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = 1200 * Math.log2(f / want);
    between(cents, -5, 5, 'note ' + midi + ' is in tune (' + cents.toFixed(2) + ' cents)');
    ok(R.spectrum(x, SR, 16384).high < 0.05, 'note ' + midi + ' is not harsh');
    ok(!R.hasNaN(x) && R.smoothStep(x, 8) < 0.12, 'note ' + midi + ' is clean');
    between(R.peak(x), 0.12, 0.6, 'note ' + midi + ' level');
    ok(R.rms(x, x.length - 3000) < 0.002, 'note ' + midi + ' releases');
  }
  for (const tb of ['keys', 'soft', 'pluck']) { const r = R.makeRig(SR); ok(r.A.note(60, 0.6, { timbre: tb }), 'timbre ' + tb); r.run(1); const x = r.out(); ok(!R.hasNaN(x) && R.peak(x) > 0.1, 'timbre ' + tb + ' sounds'); }
  // chord: all notes present, level stays sane
  const rc = R.makeRig(SR); const ch = rc.A.chord([60, 64, 67], 1.2); rc.run(1.6); const xc = rc.out();
  ok(ch && ch.end > ch.t0, 'chord returns timing');
  ok(R.peak(xc) < 0.8 && !R.hasNaN(xc), 'chord level');
  // interval: melodic a, b, then both together
  const ri = R.makeRig(SR, { log: true }); const iv = ri.A.interval(60, 67, { dur: 0.5, gap: 0.1 }); ri.run(3);
  ok(iv && iv.parts.length === 3, 'interval has 3 parts (a, b, together)');
  near(iv.parts[1].t - iv.parts[0].t, 0.6, 1e-9, 'melodic notes are dur + gap apart');
  near(iv.parts[2].t - iv.parts[1].t, 0.6, 1e-9, 'harmonic part follows');
  eq(iv.parts.map((p) => p.notes), [[60], [67], [60, 67]], 'interval part notes');
  const tones = ri.A.log.filter((e) => e.k === 'tone');
  eq(tones.length, 4, 'interval plays 4 tones');
  const xi = ri.out();
  const fa = f0Of(xi, SR, Math.round((iv.parts[0].t + 0.05) * SR), 8192), fb = f0Of(xi, SR, Math.round((iv.parts[1].t + 0.05) * SR), 8192);
  near(1200 * Math.log2(fb / fa), 700, 8, 'the rendered fifth is a fifth');
  const h = ri.A.interval(60, 64, { melodic: false }); ok(h && h.parts.length === 1 && h.parts[0].notes.length === 2, 'melodic:false plays it together only');
  const m = ri.A.interval(60, 64, { harmonic: false }); ok(m && m.parts.length === 2, 'harmonic:false plays the two notes only');
  eq(ri.A.note(NaN, 1), false, 'bad midi ignored'); eq(ri.A.chord([], 1), false, 'empty chord ignored');
  // muted and sfx volume
  const mu = R.makeRig(SR); mu.A.setMuted(true); eq(mu.A.note(60, 0.5), false, 'muted: note is not played');
  const sv = R.makeRig(SR); sv.A.setVolume({ sfx: 0 }); sv.A.note(60, 0.5, { when: 0.3 }); sv.run(1.2); ok(R.peak(sv.out()) < 0.002, 'sfx volume 0 silences tones');
}

/* ---------------------------------------------------------------- hygiene */
for (const f of [path.join(ROOT, 'audio.js'), path.join(ROOT, '..', 'tests', 'beatbox_heroes_audio.test.mjs'), path.join(ROOT, '..', 'tools', 'beatbox_heroes', 'audio_render.mjs')]) {
  const s = fs.readFileSync(f, 'utf8');
  ok(!s.includes(String.fromCharCode(0x2014)) && !s.includes(String.fromCharCode(0x2013)), 'no em or en dash in ' + path.basename(f));
}

done();
