// Headless suite for Encore Island's procedural audio (encore_island/js/audio.js).
// Evaluates the script in a vm sandbox against a stubbed WebAudio whose clock is advanced manually.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('encore_island_audio');
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'encore_island', 'js', 'audio.js'), 'utf8');

function mkParam() {
  const p = { value: 0, calls: 0, bad: false };
  const chk = (...a) => { p.calls++; if (a.some(x => typeof x !== 'number' || !isFinite(x))) p.bad = true; };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime'])
    p[m] = (...a) => { chk(...a); return p; };
  p.cancelScheduledValues = (...a) => { chk(...a); return p; };
  return p;
}
// returns { AUDIO, ctx (once created), stats, win }
function load({ withAC = true, noPanner = false } = {}) {
  const stats = { osc: 0, gain: 0, filt: 0, buf: 0, comp: 0, bad: false, live: 0, maxLive: 0, ctxs: 0, timers: [] };
  const mkNode = () => ({ connect() {}, disconnect() {} });
  class Ctx {
    constructor() {
      this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 8000; this.destination = mkNode(); stats.ctxs++; stats.ctx = this;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { stats.gain++; return Object.assign(mkNode(), { gain: mkParam() }); }
    createOscillator() {
      stats.osc++; stats.live++; stats.maxLive = Math.max(stats.maxLive, stats.live);
      const o = Object.assign(mkNode(), { type: 'sine', frequency: mkParam(), detune: mkParam(), started: false, stopT: null });
      o.start = (w) => { if (typeof w !== 'number' || !isFinite(w)) stats.bad = true; o.started = true; };
      o.stop = (w) => { if (typeof w !== 'number' || !isFinite(w)) stats.bad = true; o.stopT = w; };
      return o;
    }
    createBiquadFilter() { stats.filt++; return Object.assign(mkNode(), { type: 'lowpass', frequency: mkParam(), Q: mkParam(), gain: mkParam() }); }
    createDynamicsCompressor() { stats.comp++; return Object.assign(mkNode(), { threshold: mkParam(), knee: mkParam(), ratio: mkParam(), attack: mkParam(), release: mkParam() }); }
    createBuffer(ch, n, sr) { stats.buf++; const d = new Float32Array(n); return { getChannelData: () => d, length: n, sampleRate: sr }; }
    createBufferSource() {
      stats.osc++;
      const s = Object.assign(mkNode(), { buffer: null });
      s.start = (w) => { if (typeof w !== 'number' || !isFinite(w)) stats.bad = true; };
      s.stop = (w) => { if (typeof w !== 'number' || !isFinite(w)) stats.bad = true; };
      return s;
    }
    createConvolver() { return Object.assign(mkNode(), { buffer: null }); }
  }
  if (!noPanner) Ctx.prototype.createStereoPanner = function () { return Object.assign(mkNode(), { pan: mkParam() }); };
  const sb = {
    console, performance: { now: () => 5000 }, Promise, Math, Float32Array, Date, Object,
    setTimeout: (f, ms) => { const h = setTimeout(f, ms); h.unref && h.unref(); return h; },
    clearInterval, setInterval: (f, ms) => { stats.timers.push(f); const h = setInterval(f, 1000000); h.unref(); return h; },
  };
  if (withAC) sb.AudioContext = Ctx;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(src + '\n;globalThis.__A = AUDIO;', sb);
  return { A: sb.__A, stats, sb };
}

// ---- source hygiene
t.ok(!/Math\.random/.test(src), 'no Math.random in audio.js');
t.ok(/const AUDIO\s*=/.test(src), 'defines global const AUDIO');

// ---- uninitialised / no WebAudio: everything is a silent no-op
{
  const { A, stats } = load({ withAC: false });
  let threw = false;
  try {
    t.ok(A.init() === false, 'init() false without WebAudio');
    A.sfx('coin'); A.sfx('nope'); A.musicStart(); A.musicFade(1); A.musicStop(); A.setVolume(0.5, 0.5); A.setMuted(true);
    A.setMuted(false); A.intensity(0.9); A.setBiome(3); A.setEncore(true); A.duck(0.5); A.stinger('victory'); A.stinger('x');
    A.setBpm(120); A.onBeat(() => {}); A.beat(); A.beatPhase(); A.nearBeat(); A.state();
  } catch (e) { threw = true; console.log(e); }
  t.ok(!threw, 'no-WebAudio calls never throw');
  t.ok(stats.osc === 0, 'no nodes created without WebAudio');
  const s = A.state();
  t.ok(s.ready === false && s.playing === false, 'state not ready / not playing without WebAudio');
  t.ok(s.biome === 3 && s.intensity === 0.9 && s.bpm === 120, 'state() reflects setters even without audio');
}
{
  const { A, stats } = load();
  let threw = false;
  try { A.sfx('coin'); A.musicStart(); A.stinger('boss'); A.duck(1); A.musicFade(1); } catch (e) { threw = true; }
  t.ok(!threw && stats.osc === 0 && stats.ctxs === 0, 'calls before init are silent no-ops and do not create a context');
  t.ok(A.state().ready === false && A.state().playing === false, 'state before init');
  t.ok(A.beat() >= 0, 'beat() works before init (performance.now clock)');
}

// ---- init + every sfx kind
const KINDS = ['shoot', 'hit', 'kill', 'crit', 'pick', 'sell', 'coin', 'pour', 'built', 'unlock', 'levelup', 'hurt', 'die', 'zap', 'boom', 'gem',
  'smelt', 'warp', 'boss', 'chest', 'ui_tap', 'ui_open', 'ui_close', 'combo', 'encore', 'dash', 'ult', 'pet', 'spin', 'win'];
{
  const { A, stats } = load();
  t.ok(A.init() === true, 'init() true');
  t.ok(A.init() === true && stats.ctxs === 1, 'init() idempotent, single context');
  t.ok(A.state().ready && stats.comp === 1, 'ready, compressor in chain');
  t.ok(stats.ctx.state === 'running', 'context resumed');
  t.ok(KINDS.every(k => A.sfxKinds.includes(k)) && A.sfxKinds.length === KINDS.length, 'all required sfx kinds implemented');
  let ok = true, made = true;
  for (const k of KINDS) {
    const before = stats.osc;
    stats.ctx.currentTime += 0.5;
    try { if (A.sfx(k, 1, 1) !== true) ok = false; } catch (e) { ok = false; console.log(k, e); }
    if (stats.osc <= before) { made = false; console.log('no nodes for', k); }
  }
  t.ok(ok, 'every sfx kind plays without throwing');
  t.ok(made, 'every sfx kind creates audio nodes');
  t.ok(!stats.bad, 'no NaN/undefined times passed to start/stop');
  // pitch / vol args
  stats.ctx.currentTime += 1;
  t.ok(A.sfx('pick', 2.5, 0.5) && A.sfx('combo', 99, 9) && A.sfx('coin', -3, 'x'), 'odd pitch/vol args handled');
  t.ok(A.sfx('pick', 1, 0) === false, 'vol 0 is silent');
  t.ok(A.sfx('nope') === false, 'unknown kind ignored');
}

// ---- throttling
{
  const { A, stats } = load(); A.init();
  stats.ctx.currentTime = 10;
  let played = 0;
  for (let i = 0; i < 20; i++) if (A.sfx('coin')) played++;
  t.ok(played === 1, 'rapid same-kind sfx at same instant throttled to 1 (got ' + played + ')');
  stats.ctx.currentTime += 0.02; t.ok(!A.sfx('coin'), 'coin throttled inside 40ms');
  stats.ctx.currentTime += 0.05; t.ok(A.sfx('coin'), 'coin plays again after the gap');
  t.ok(A.sfx('hit') && A.sfx('shoot'), 'different kinds are not throttled by each other');
  for (const k of ['pick', 'hit', 'shoot']) { stats.ctx.currentTime += 1; A.sfx(k); stats.ctx.currentTime += 0.01; t.ok(!A.sfx(k), k + ' throttled at 10ms'); }
}

// ---- voice cap
{
  const { A, stats } = load(); A.init();
  stats.ctx.currentTime = 1;
  let n = 0;
  for (let i = 0; i < 60; i++) { stats.ctx.currentTime += 0.025; if (A.sfx('boss')) n++; }
  t.ok(n === 60, 'all 60 long sfx accepted (older dropped)');
  t.ok(A._voices() <= 24, 'voice cap holds (' + A._voices() + ' <= 24)');
  t.ok(A._voices() === 24, 'voices fill up to the cap');
  stats.ctx.currentTime += 10; A.sfx('ui_tap');
  t.ok(A._voices() <= 2, 'finished voices are pruned');
}

// ---- muted
{
  const { A, stats } = load(); A.init();
  stats.ctx.currentTime = 5;
  A.setMuted(true);
  t.ok(A.muted === true && A.state().muted === true, 'setMuted(true)');
  const before = stats.osc;
  t.ok(A.sfx('kill') === false && stats.osc === before, 'muted sfx is a no-op');
  A.musicStart(); stats.ctx.currentTime += 3;
  for (let i = 0; i < 80; i++) { stats.ctx.currentTime += 0.025; A._tick(); }
  t.ok(stats.osc === before, 'muted music schedules no notes (' + (stats.osc - before) + ')');
  t.ok(A.state().playing, 'music still counts as playing while muted');
  A.setMuted(false);
  stats.ctx.currentTime += 0.5;
  t.ok(A.sfx('kill') === true, 'unmuted sfx plays');
}

// ---- music scheduler
{
  const { A, stats } = load(); A.init();
  stats.ctx.currentTime = 2;
  A.intensity(1);
  t.ok(A.musicStart() === true && A.state().playing, 'musicStart');
  const bpm = A.bpm, stepDur = 60 / bpm / 4;
  const totalSteps = 16 * 8 * 2;  // two full 8-bar loops
  let maxPerTick = 0, last = stats.osc;
  const startSteps = A._step();
  for (let i = 0; i < Math.ceil(totalSteps * stepDur / 0.025) + 40; i++) {
    stats.ctx.currentTime += 0.025; A._tick();
    maxPerTick = Math.max(maxPerTick, stats.osc - last); last = stats.osc;
  }
  const stepped = A._step() - startSteps;
  t.ok(stepped >= totalSteps, 'scheduler advanced across >= 2 loops (' + stepped + ' steps)');
  t.ok(stats.osc > 300, 'music created many notes (' + stats.osc + ')');
  t.ok(!stats.bad, 'no invalid times in music scheduling');
  t.ok(maxPerTick < 60, 'no burst of nodes per tick (max ' + maxPerTick + ')');
  t.ok(stats.maxLive < 10000, 'sanity');

  // lookahead: scheduled time never lags
  // intensity 0 vs 1 node counts over the same bars
  function count(int, enc, biome) {
    const L = load(); L.A.init(); const c = L.stats.ctx; c.currentTime = 1;
    L.A.intensity(int); L.A.setBiome(biome || 0); L.A.setEncore(!!enc); L.A.musicStart();
    const b = L.stats.osc;
    for (let i = 0; i < 16 * 4 * stepDur / 0.025; i++) { c.currentTime += 0.025; L.A._tick(); }
    return { n: L.stats.osc - b, bad: L.stats.bad };
  }
  const c0 = count(0), c5 = count(0.5), c1 = count(1), ce = count(1, true);
  t.ok(c0.n > 0, 'intensity 0 still plays pad+kick+bass (' + c0.n + ')');
  t.ok(c0.n < c5.n && c5.n < c1.n, 'more nodes as intensity rises (' + [c0.n, c5.n, c1.n].join('<') + ')');
  t.ok(ce.n > c1.n, 'encore mode adds faster hats / more notes (' + ce.n + ' > ' + c1.n + ')');
  t.ok(!c0.bad && !c5.bad && !c1.bad && !ce.bad, 'no bad times at any intensity / encore');
  for (const b of [0, 1, 2, 3, 5, 7, 11, 40]) { const r = count(0.8, false, b); t.ok(r.n > 0 && !r.bad, 'biome ' + b + ' plays'); }

  // runtime changes don't throw and apply at bar boundary
  A.setBiome(4); A.setEncore(true); A.intensity(0.2); A.setBpm(130); A.setVolume(0.3, 0.4); A.duck(0.5);
  for (let i = 0; i < 200; i++) { stats.ctx.currentTime += 0.025; A._tick(); }
  t.ok(A.state().biome === 4 && A.state().bpm === 130 && A.state().encore, 'state after live changes');
  A.setEncore(false);
  A.musicFade(0.5);
  for (let i = 0; i < 40; i++) { stats.ctx.currentTime += 0.025; A._tick(); }
  t.ok(!A.state().playing, 'musicFade ends playback');
  const nb = stats.osc;
  for (let i = 0; i < 40; i++) { stats.ctx.currentTime += 0.025; A._tick(); }
  t.ok(stats.osc === nb, 'no notes after fade');
  A.musicStart(); t.ok(A.state().playing, 'restart after fade');
  A.musicStop(); t.ok(!A.state().playing, 'musicStop');

  // sleepy tab: huge time jump resyncs without flooding
  A.musicStart();
  const b2 = stats.osc; stats.ctx.currentTime += 60; A._tick();
  t.ok(stats.osc - b2 < 80, 'long gap does not flood (' + (stats.osc - b2) + ' nodes)');
  A.musicStop();
}

// ---- stingers / duck
{
  const { A, stats } = load(); A.init();
  for (const n of ['levelup', 'boss', 'victory', 'encore']) {
    stats.ctx.currentTime += 3;
    const b = stats.osc; let r;
    try { r = A.stinger(n); } catch (e) { r = null; }
    t.ok(r === true && stats.osc > b, 'stinger ' + n);
  }
  t.ok(A.stinger('bogus') === false, 'unknown stinger ignored');
  A.duck(0.5); A.duck(); A.duck(-5);
  t.ok(!stats.bad, 'duck/stinger times valid');
}

// ---- beat clock with fake time
{
  let { A } = load();
  A._fakeTime(0);
  const b0 = A.beat();
  t.ok(Math.abs(b0) < 1e-9, 'beat starts at 0 on fake clock');
  A._fakeTime(60 / 112);
  t.ok(Math.abs(A.beat() - 1) < 1e-6, 'one beat after 60/bpm sec');
  let prev = -1, mono = true;
  for (let i = 0; i < 500; i++) { A._fakeTime(0.7 + i * 0.013); const b = A.beat(); if (b < prev) mono = false; prev = b; }
  t.ok(mono, 'beat monotonic');
  A = load().A; A._fakeTime(0); A.beat();   // fresh clock (beat() never goes backwards)
  A._fakeTime(2 * 60 / 112 + 0.25 * 60 / 112);
  t.ok(Math.abs(A.beatPhase() - 0.25) < 1e-6, 'beatPhase 0.25');
  // nearBeat: exactly on beat
  const spb = 60 / 112;
  A._fakeTime(5 * spb); let nb = A.nearBeat();
  t.ok(nb.on && Math.abs(nb.err) < 1e-6, 'nearBeat on exact beat');
  A._fakeTime(6 * spb + 0.03); nb = A.nearBeat();
  t.ok(nb.on && Math.abs(nb.err - 0.03) < 1e-6, 'nearBeat late 30ms positive err (' + nb.err + ')');
  A._fakeTime(7 * spb - 0.03); nb = A.nearBeat();
  t.ok(nb.on && Math.abs(nb.err + 0.03) < 1e-6, 'nearBeat early negative err');
  A._fakeTime(8 * spb + spb / 2); nb = A.nearBeat();
  t.ok(nb.on && Math.abs(nb.err) < 1e-6, 'nearBeat on half-beat (8th)');
  A._fakeTime(10 * spb + spb / 4); nb = A.nearBeat();
  t.ok(!nb.on, 'nearBeat off-beat at 16th');
  A._fakeTime(10 * spb + spb / 4); t.ok(A.nearBeat(0.5).on, 'tolerance arg respected');
  // bpm change keeps beat continuous and monotonic
  const before = A.beat(); A.setBpm(140); const after = A.beat();
  t.ok(Math.abs(after - before) < 1e-6 && A.bpm === 140, 'setBpm continuous');
  const tNow = 10 * spb + spb / 4;
  A._fakeTime(tNow + 60 / 140);
  t.ok(Math.abs(A.beat() - (before + 1)) < 1e-6, 'beat advances at new bpm');
  A.setBpm(9999); t.ok(A.bpm === 220, 'bpm clamped'); A.setBpm(112);
  // onBeat callbacks
  const got = [];
  const cb = i => got.push(i);
  A._fakeTime(100); A.beat();
  A.onBeat(cb);
  const base = Math.floor(A.beat());
  for (let i = 1; i <= 10; i++) { A._fakeTime(100 + i * 60 / 112 + 0.001); A.poll(); }
  t.ok(got.length === 10, 'onBeat fired once per beat (' + got.length + ')');
  t.ok(got.every((v, i) => i === 0 || v === got[i - 1] + 1), 'beat indices consecutive');
  const n = got.length; A.poll(); A.poll(); t.ok(got.length === n, 'no double fire within one beat');
  A.offBeat(cb); A._fakeTime(200); A.poll(); t.ok(got.length === n, 'offBeat unregisters');
  A.onBeat(() => { throw new Error('boom'); }); A._fakeTime(300); let th = false; try { A.poll(); } catch (e) { th = true; }
  t.ok(!th, 'throwing beat callback is contained');
}
// beat clock follows the AudioContext once running + music aligns beat to the downbeat
{
  const { A, stats } = load();
  const b0 = A.beat();
  A.init(); const c = stats.ctx; c.currentTime = 3;
  const b1 = A.beat();
  t.ok(b1 >= b0, 'beat does not go backwards when switching to the audio clock');
  A.musicStart();
  let prev = A.beat(), mono = true;
  for (let i = 0; i < 400; i++) { c.currentTime += 0.025; A._tick(); const b = A.beat(); if (b < prev) mono = false; prev = b; }
  t.ok(mono, 'beat monotonic across musicStart on audio clock');
  t.ok(Math.abs((A.beat() - b1) - (prev - b1)) < 1e-9 && prev - b1 > 10 * 112 / 60 * 0.9, 'beat follows ctx clock (~' + (prev - b1).toFixed(1) + ' beats in 10s)');
  A.setBpm(120);
  const nb = A.nearBeat(); t.ok(typeof nb.on === 'boolean' && isFinite(nb.err), 'nearBeat valid on audio clock');
}

// ---- no stereo panner / misc robustness
{
  const { A, stats } = load({ noPanner: true }); A.init(); stats.ctx.currentTime = 1;
  t.ok(A.sfx('win') === true, 'works without StereoPanner');
  A.setVolume(5, -2); A.setVolume(0.5); A.intensity(7); t.ok(A.state().intensity === 1, 'intensity clamped');
  A.intensity(-1); t.ok(A.state().intensity === 0, 'intensity clamped low');
  A.setBiome(-3); A.setBiome('x'); A.setBiome(2.7); t.ok(A.state().biome === 2, 'biome sanitised');
  t.ok(A.musicStart() === true, 'music ok without panner');
}
// musicStart before init starts once init runs
{
  const { A, stats } = load();
  A.musicStart(); t.ok(!A.state().playing, 'musicStart before init does not claim playing');
  A.init(); t.ok(A.state().playing, 'deferred musicStart begins on init');
}
// suspended context stays silent
{
  const { A, stats } = load(); A.init(); stats.ctx.state = 'suspended';
  const b = stats.osc; t.ok(A.sfx('coin') === false && stats.osc === b, 'suspended context: sfx dropped');
  A.musicStart(); for (let i = 0; i < 10; i++) { stats.ctx.currentTime += 0.025; A._tick(); }
  t.ok(stats.osc === b, 'suspended context: music not scheduled');
}

t.done();
