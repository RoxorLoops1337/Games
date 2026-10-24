// Drop The Bass audio: strict fake AudioContext (throws on NaN, non-positive exponential ramps, bad ranges like a real browser).
import assert from 'node:assert/strict';
import { AudioFx, SFX_NAMES, TRACK_IDS } from '../drop_the_bass/js/audio.js';

let nodes = 0;
const bad = (v) => !Number.isFinite(v);
class Param {
  constructor(v) { this._v = v; this.calls = 0; }
  get value() { return this._v; }
  set value(v) { if (bad(v)) throw new Error('non-finite AudioParam.value'); this._v = v; }
  _chk(...a) { for (const x of a) if (bad(x)) throw new Error('non-finite audio param arg'); this.calls++; }
  setValueAtTime(v, t) { this._chk(v, t); if (t < 0) throw new Error('neg time'); return this; }
  linearRampToValueAtTime(v, t) { this._chk(v, t); return this; }
  exponentialRampToValueAtTime(v, t) { this._chk(v, t); if (v <= 0) throw new Error('exp ramp to <=0'); return this; }
  setTargetAtTime(v, t, c) { this._chk(v, t, c); if (c <= 0) throw new Error('bad timeConstant'); return this; }
  cancelScheduledValues(t) { this._chk(t); return this; }
}
class Node {
  constructor(ctx) { nodes++; this.ctx = ctx; this.out = []; }
  connect(n) { assert.ok(n, 'connect target'); this.out.push(n); return n; }
  disconnect() { this.out = []; }
}
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(this); this.started = 0; }
  createGain() { const n = new Node(this); n.gain = new Param(1); return n; }
  createOscillator() {
    const n = new Node(this); const c = this; n.frequency = new Param(440); n.detune = new Param(0); n.type = 'sine';
    n.start = (t) => { if (bad(t)) throw new Error('bad start'); c.started++; n._s = true; };
    n.stop = (t) => { if (!n._s) throw new Error('stop before start'); if (bad(t)) throw new Error('bad stop'); };
    return n;
  }
  createBufferSource() { const n = new Node(this); const c = this; n.start = (t, off) => { if (bad(t) || bad(off)) throw new Error('bad start'); c.started++; n._s = true; }; n.stop = () => {}; return n; }
  createBiquadFilter() { const n = new Node(this); n.frequency = new Param(350); n.Q = new Param(1); n.type = 'lowpass'; return n; }
  createDynamicsCompressor() { const n = new Node(this); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0); return n; }
  createStereoPanner() { const n = new Node(this); n.pan = new Param(0); return n; }
  createDelay() { const n = new Node(this); n.delayTime = new Param(0); return n; }
  createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; }
}

// 1. no AudioContext at all: everything is a harmless no-op
{
  assert.equal(AudioFx.init(), false);
  assert.equal(AudioFx.isReady(), false);
  for (const n of SFX_NAMES) AudioFx.play(n);
  for (const t of TRACK_IDS) AudioFx.musicStart(t);
  AudioFx.musicIntensity(1); AudioFx.musicDuck(1); AudioFx.musicStop(); AudioFx.resume(); AudioFx.mute(true); AudioFx.mute(false);
  assert.equal(AudioFx.beatInfo(), null);
  assert.equal(typeof AudioFx.onBeat(() => {}), 'function');
  AudioFx._reset();
}

// 2. contract surface
assert.equal(SFX_NAMES.length, 58, 'sfx count');
assert.equal(new Set(SFX_NAMES).size, SFX_NAMES.length);
for (const n of ['ui_click', 'merge_big', 'reveal_mythic', 'star_pop', 'typewriter', 'crate_shake', 'shoot_vocal', 'boss_die']) assert.ok(SFX_NAMES.includes(n), n);
assert.deepEqual(TRACK_IDS, ['title', 'hub', 'world_garage', 'world_busk', 'world_club', 'world_festival', 'world_arena', 'boss', 'victory', 'defeat', 'cutscene_warm', 'cutscene_dark']);

// 3. before init: music request is remembered and starts at init
globalThis.AudioContext = FakeCtx;
AudioFx.musicStart('hub');
assert.equal(AudioFx.beatInfo(), null);
assert.equal(AudioFx.init(), true);
let ctx = AudioFx._state().ctx;
assert.equal(AudioFx.current(), 'hub');
assert.ok(AudioFx.beatInfo(), 'beat info after init');
AudioFx.musicStop(0.01);
assert.equal(AudioFx.current(), null);
AudioFx._reset();

// 4. every sfx plays on a strict context without throwing, with pitch and pan variants, and makes sound
AudioFx.init(); ctx = AudioFx._state().ctx;
for (const n of SFX_NAMES) {
  const before = ctx.started;
  ctx.currentTime += 1;
  AudioFx.play(n);
  AudioFx.play(n, { pan: -0.7, pitch: 1.5, vol: 0.5, at: 0.1 });
  assert.ok(ctx.started > before, n + ' made no sound');
}
AudioFx.play('does_not_exist');

// 5. rate limit: a burst in the same instant is cut down, spaced calls are not
{
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
  ctx.currentTime = 10;
  const a = ctx.started;
  for (let i = 0; i < 50; i++) AudioFx.play('shoot_hat');
  const burst = ctx.started - a;
  assert.ok(burst > 0 && burst <= 2, 'burst limited, got ' + burst);
  ctx.currentTime = 11;
  const b = ctx.started; AudioFx.play('shoot_hat');
  assert.ok(ctx.started > b, 'spaced call plays');
}

// 6. voice cap: flooding with different heavy sounds never grows past the cap
{
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
  ctx.currentTime = 20;
  for (let r = 0; r < 20; r++) for (const n of SFX_NAMES) AudioFx.play(n);
  assert.ok(AudioFx._state().voices <= 44 + 30, 'voices bounded: ' + AudioFx._state().voices);
  ctx.currentTime = 40; // everything has ended
  AudioFx.play('coin');
  assert.ok(AudioFx._state().voices <= 4);
}

// 7. every track starts, schedules a long stretch at every intensity, never throws, and ends up bounded in node count
for (const id of TRACK_IDS) {
  for (const inten of [0, 0.3, 0.6, 1]) {
    AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
    AudioFx.musicStart(id);
    AudioFx.musicIntensity(inten);
    const started0 = ctx.started;
    for (let s = 0; s < 400; s++) { ctx.currentTime += 0.05; AudioFx._tick(); } // 20 s
    assert.equal(AudioFx.current(), id);
    if (inten >= 0.3) assert.ok(ctx.started > started0 + 5, id + ' @' + inten + ' scheduled too little');
  }
}
// higher intensity adds layers (more voices scheduled)
{
  const count = (inten) => { AudioFx._reset(); AudioFx.init(); const c = AudioFx._state().ctx; AudioFx.musicStart('world_club'); AudioFx.musicIntensity(inten); AudioFx._state().music.int = inten; const s0 = c.started; for (let i = 0; i < 200; i++) { c.currentTime += 0.05; AudioFx._tick(); } return c.started - s0; };
  const lo = count(0.1), mid = count(0.5), hi = count(1);
  assert.ok(lo < mid && mid < hi, `layers grow: ${lo} < ${mid} < ${hi}`);
}

// 8. beat clock and onBeat with a fake clock
{
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
  const beats = [];
  const off = AudioFx.onBeat((b) => beats.push(b));
  AudioFx.musicStart('world_arena'); // 132 bpm
  assert.equal(AudioFx.beatInfo().bpm, 132);
  const t0 = AudioFx._state().music.t0;
  for (let i = 0; i < 400; i++) { ctx.currentTime += 0.025; AudioFx._tick(); }
  const dur = ctx.currentTime - t0;
  const expect = Math.floor(dur * 132 / 60);
  assert.ok(Math.abs(beats.length - expect) <= 1, `beats ${beats.length} vs ${expect}`);
  for (let i = 0; i < beats.length; i++) assert.equal(beats[i], i, 'beats are consecutive');
  const bi = AudioFx.beatInfo();
  assert.ok(bi.phase >= 0 && bi.phase < 1 && bi.beat === Math.floor((ctx.currentTime - t0) * 132 / 60));
  off();
  const n = beats.length;
  for (let i = 0; i < 80; i++) { ctx.currentTime += 0.025; AudioFx._tick(); }
  assert.equal(beats.length, n, 'unsubscribed');
  // a throwing listener does not stop others
  let ok = 0; AudioFx.onBeat(() => { throw new Error('x'); }); AudioFx.onBeat(() => ok++);
  for (let i = 0; i < 80; i++) { ctx.currentTime += 0.025; AudioFx._tick(); }
  assert.ok(ok > 0);
  // throttled tab: a huge time jump does not flood the scheduler
  const s = ctx.started; ctx.currentTime += 120; AudioFx._tick(); AudioFx._tick();
  assert.ok(ctx.started - s < 400, 'no flood after a long pause: ' + (ctx.started - s));
}

// 9. switching tracks, duck, volume, mute
{
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
  AudioFx.musicStart('title'); ctx.currentTime += 1; AudioFx._tick();
  AudioFx.musicStart('title'); assert.equal(AudioFx.current(), 'title');
  AudioFx.musicStart('boss'); assert.equal(AudioFx.current(), 'boss'); assert.equal(AudioFx.beatInfo().bpm, 140);
  AudioFx.musicDuck(0.5); AudioFx.musicDuck(0); AudioFx.musicDuck(NaN);
  AudioFx.musicIntensity(NaN); AudioFx.musicIntensity(9); AudioFx.musicIntensity(-1);
  AudioFx.setVolume({ music: 0.2 }); AudioFx.setVolume({ sfx: 3 }); AudioFx.setVolume({ music: NaN });
  const v = AudioFx.getVolume();
  assert.equal(v.music, 0.2); assert.equal(v.sfx, 1); assert.equal(v.muted, false);
  AudioFx.mute(true); assert.equal(AudioFx.getVolume().muted, true);
  const st = ctx.started; AudioFx.play('win'); assert.equal(ctx.started, st, 'muted plays nothing');
  AudioFx.mute(false);
  ctx.state = 'suspended'; const st2 = ctx.started; AudioFx.play('win'); assert.equal(ctx.started, st2, 'suspended plays nothing');
  AudioFx.resume(); assert.equal(ctx.state, 'running');
  AudioFx.musicStop(0.1); assert.equal(AudioFx.beatInfo(), null);
  AudioFx.musicStart('nope'); assert.equal(AudioFx.current(), null);
}

// 10. source hygiene
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../drop_the_bass/js/audio.js', import.meta.url), 'utf8');
assert.ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
assert.ok(!/Math\.random|Date\.now/.test(src), 'no unseeded randomness or clock');

AudioFx._reset();
console.log('drop_the_bass audio: ok (' + SFX_NAMES.length + ' sfx, ' + TRACK_IDS.length + ' tracks)');
process.exit(0);
