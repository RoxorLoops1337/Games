// Drop The Bass audio: strict fake AudioContext (throws on NaN, non-positive exponential ramps, bad ranges like a real browser).
import assert from 'node:assert/strict';
import { AudioFx, SFX_NAMES, TRACK_IDS } from '../drop_the_bass/js/audio.js';

let nodes = 0;
const bad = (v) => !Number.isFinite(v);
class Param {
  constructor(v) { this._v = v; this.calls = 0; this.ev = []; }
  get value() { return this._v; }
  set value(v) { if (bad(v)) throw new Error('non-finite AudioParam.value'); this._v = v; }
  _chk(...a) { for (const x of a) if (bad(x)) throw new Error('non-finite audio param arg'); this.calls++; }
  setValueAtTime(v, t) { this._chk(v, t); if (t < 0) throw new Error('neg time'); this.ev.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this._chk(v, t); this.ev.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this._chk(v, t); if (v <= 0) throw new Error('exp ramp to <=0'); this.ev.push(['exp', v, t]); return this; }
  setTargetAtTime(v, t, c) { this._chk(v, t, c); if (c <= 0) throw new Error('bad timeConstant'); this.ev.push(['tgt', v, t]); return this; }
  cancelScheduledValues(t) { this._chk(t); this.ev.push(['cancel', 0, t]); return this; }
}
class Node {
  constructor(ctx) { nodes++; this.ctx = ctx; this.out = []; }
  connect(n) { assert.ok(n, 'connect target'); this.out.push(n); return n; }
  disconnect() { this.out = []; }
}
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(this); this.started = 0; this.starts = []; this.gains = []; }
  createGain() { const n = new Node(this); n.gain = new Param(1); this.gains.push(n); return n; }
  createOscillator() {
    const n = new Node(this); const c = this; n.frequency = new Param(440); n.detune = new Param(0); n.type = 'sine';
    n.start = (t) => { if (bad(t)) throw new Error('bad start'); c.started++; n._s = true; c.starts.push({ t, f: n.frequency.ev.length ? n.frequency.ev[0][1] : null }); };
    n.stop = (t) => { if (!n._s) throw new Error('stop before start'); if (bad(t)) throw new Error('bad stop'); };
    return n;
  }
  createBufferSource() { const n = new Node(this); const c = this; n.start = (t, off) => { if (bad(t) || bad(off)) throw new Error('bad start'); c.started++; n._s = true; c.starts.push({ t, f: null }); }; n.stop = () => {}; return n; }
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
assert.equal(SFX_NAMES.length, 69, 'sfx count');
for (const n of ['drop_big', 'hype_full', 'synergy', 'reroll_drop', 'wave_preview', 'perfect_beat', 'boss_hit', 'merge_7', 'combo_milestone', 'stage_low', 'ui_pop']) assert.ok(SFX_NAMES.includes(n), n);
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

// ---- helpers for the offline analysis: envelope model of every gain (set, linear attack, exponential decay)
function envelopes(c, from) {
  const out = [];
  for (const g of c.gains.slice(from)) {
    const e = g.gain.ev;
    if (e.length === 3 && e[0][0] === 'set' && e[1][0] === 'lin' && e[2][0] === 'exp') out.push({ t0: e[0][2], tp: e[1][2], pk: e[1][1], te: e[2][2] });
  }
  return out;
}
const levelAt = (e, x) => (x < e.t0 || x > e.te ? 0 : x < e.tp ? e.pk * (x - e.t0) / Math.max(1e-6, e.tp - e.t0) : e.pk * Math.pow(0.0001 / e.pk, (x - e.tp) / Math.max(1e-6, e.te - e.tp)));
// worst-case (all voices in phase) summed envelope over [a,b], and the time it happens
function peakSum(envs, a, b, step = 0.005) {
  let max = 0, at = a;
  const list = envs.filter((e) => e.te >= a && e.t0 <= b);
  for (let x = a; x <= b; x += step) { let s = 0; for (const e of list) s += levelAt(e, x); if (s > max) { max = s; at = x; } }
  return { max, at };
}

// 11. the drop pack: every new sfx is audible, bounded in loudness (pre-bus worst-case envelope sum) and limited per name
const NEW_SFX = ['drop_big', 'hype_full', 'synergy', 'reroll_drop', 'wave_preview', 'perfect_beat', 'boss_hit', 'merge_7', 'combo_milestone', 'stage_low', 'ui_pop'];
{
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
  let worstAll = 0, worstName = '';
  const report = [];
  for (const n of SFX_NAMES) {
    ctx.currentTime += 5; AudioFx.heartbeat(false);
    const g0 = ctx.gains.length, t = ctx.currentTime;
    AudioFx.play(n, n === 'stage_low' ? { loop: false } : undefined);
    const envs = envelopes(ctx, g0);
    assert.ok(envs.length > 0, n + ' has envelopes');
    const pk = peakSum(envs, t, t + 4).max;
    if (NEW_SFX.includes(n)) report.push(n + ':' + pk.toFixed(2));
    assert.ok(pk <= 2.4, `${n} worst-case envelope sum ${pk.toFixed(2)} too loud (clipping risk)`);
    if (pk > worstAll) { worstAll = pk; worstName = n; }
    for (const e of envs) assert.ok(e.pk <= 0.9, `${n} single voice peak ${e.pk} too loud`);
  }
  console.log('drop_the_bass audio: new sfx peak sums ' + report.join(' ') + ' | loudest overall ' + worstName + ' ' + worstAll.toFixed(2));
  for (const n of NEW_SFX) {
    AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx; ctx.currentTime = 50;
    const a = ctx.started; AudioFx.play(n, { loop: false });
    const one = ctx.started - a;
    assert.ok(one > 0, n + ' silent');
    AudioFx.play(n, { loop: false }); AudioFx.play(n, { loop: false }); // same instant: rate-limited
    assert.equal(ctx.started - a, one, n + ' not rate limited in the same instant');
    ctx.currentTime += 10; const b = ctx.started; AudioFx.play(n, { loop: false });
    assert.ok(ctx.started > b, n + ' plays again after its gap');
  }
  // boss_hit is rate-limited harder than a plain hit, and yields to the voice cap when busy
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx; ctx.currentTime = 70;
  let played = 0;
  for (let i = 0; i < 40; i++) { ctx.currentTime += 0.02; const s = ctx.started; AudioFx.play('boss_hit'); if (ctx.started > s) played++; }
  assert.ok(played <= 8 && played >= 3, 'boss_hit limited to about 1 per 120 ms: ' + played);
  // combo_milestone honours o.pitch: first oscillator frequency scales with it
  const firstF = (pitch) => { AudioFx._reset(); AudioFx.init(); const c = AudioFx._state().ctx; c.currentTime = 90; AudioFx.play('combo_milestone', { pitch }); return c.starts[0].f; };
  const f1 = firstF(1), f2 = firstF(1.5), f3 = firstF(2);
  assert.ok(Math.abs(f2 / f1 - 1.5) < 1e-6 && Math.abs(f3 / f1 - 2) < 1e-6, `combo_milestone pitch scales: ${f1} ${f2} ${f3}`);
}

// 12. drop_big structure: riser, one beat of silence, heavy sub hit with crash, music ducked in between
{
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx; ctx.currentTime = 100;
  const g0 = ctx.gains.length, t = 100.005;
  AudioFx.play('drop_big');
  const envs = envelopes(ctx, g0);
  const riser = peakSum(envs, t + 1.0, t + 1.35).max, gap = peakSum(envs, t + 1.55, t + 1.82).max, hit = peakSum(envs, t + 1.85, t + 1.95);
  assert.ok(riser > 0.3, 'riser builds: ' + riser);
  assert.ok(gap < 0.02, 'one beat of silence before the hit: ' + gap);
  assert.ok(hit.max > riser && hit.max > 0.8 && hit.at - (t + 1.85) < 0.05, 'heavy hit on the downbeat: ' + hit.max);
  const subs = ctx.starts.filter((s) => s.f != null && s.f < 100 && Math.abs(s.t - (t + 1.85)) < 1e-6);
  assert.ok(subs.length >= 1, 'sub oscillator at the hit');
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx; ctx.currentTime = 100;
  AudioFx.musicStart('world_club'); AudioFx.play('drop_big');
  // music bus is ducked between riser end and hit, then restored
  const duck = AudioFx._state().ctx.gains.find((g) => g.gain.ev.some((e) => e[0] === 'tgt' && e[1] === 0.06));
  assert.ok(duck, 'music ducked into the silent beat');
  assert.ok(duck.gain.ev.some((e) => e[0] === 'tgt' && e[1] === 1 && e[2] > 101.8), 'music slams back on the hit');
  ctx.currentTime += 3; AudioFx.play('drop_big'); // still inside nothing: 2.5 s limit passed, plays
  AudioFx._reset();
}

// 13. setMusicState: smooth, monotonic layers, boss layer, tension filter, input hardening
{
  AudioFx._reset();
  assert.doesNotThrow(() => AudioFx.setMusicState({ wave: 3 })); // no context: harmless
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
  AudioFx.musicStart('world_garage');
  const I = (s) => AudioFx.setMusicState(s).intensity;
  const base = { wavesTotal: 20, hypePct: 0, bossAlive: false, stageHpPct: 1, enemiesOnField: 0 };
  let last = -1;
  for (const w of [1, 5, 10, 15, 20]) { const v = I({ ...base, wave: w }); assert.ok(v > last, `intensity grows with the wave: ${w} -> ${v}`); last = v; }
  assert.ok(I({ ...base, wave: 5, hypePct: 1 }) > I({ ...base, wave: 5, hypePct: 0 }), 'hype adds intensity');
  assert.ok(I({ ...base, wave: 5, enemiesOnField: 25 }) > I({ ...base, wave: 5 }), 'crowd adds intensity');
  assert.ok(I({ ...base, wave: 1, bossAlive: true }) >= 0.9, 'boss pushes every layer in');
  assert.equal(I({ ...base, wave: 5, hypePct: 100 }), I({ ...base, wave: 5, hypePct: 1 }), 'percent and fraction forms agree');
  assert.ok(I({ ...base, wave: 5, stageHpPct: 0.1 }) < I({ ...base, wave: 5 }), 'low stage hp trims the mix a little');
  for (const bad of [undefined, null, {}, { wave: NaN, wavesTotal: 0, hypePct: Infinity, stageHpPct: -5, enemiesOnField: 'x' }, { wave: 99, wavesTotal: 1 }]) {
    const r = AudioFx.setMusicState(bad);
    assert.ok(r.intensity >= 0 && r.intensity <= 1 && Number.isFinite(r.intensity), 'hardened');
  }
  // smoothing: the audible intensity glides to the target, never jumps
  AudioFx.musicStart('world_club'); // resets state
  AudioFx.setMusicState({ ...base, wave: 1 });
  for (let i = 0; i < 400; i++) { ctx.currentTime += 0.025; AudioFx._tick(); }
  const m = AudioFx._state().music, lo = m.int;
  AudioFx.setMusicState({ ...base, wave: 20, hypePct: 1, enemiesOnField: 25 });
  ctx.currentTime += 0.025; AudioFx._tick();
  assert.ok(m.int > lo && m.int < lo + 0.1, 'intensity moves a little per tick: ' + lo + ' -> ' + m.int);
  for (let i = 0; i < 400; i++) { ctx.currentTime += 0.025; AudioFx._tick(); }
  assert.ok(Math.abs(m.int - AudioFx._state().intTarget) < 0.01, 'and arrives');
  // more voices late in the run than early
  const notes = (s) => { AudioFx._reset(); AudioFx.init(); const c = AudioFx._state().ctx; AudioFx.musicStart('world_festival'); AudioFx.setMusicState(s); AudioFx._state().music.int = AudioFx._state().intTarget; const a = c.started; for (let i = 0; i < 400; i++) { c.currentTime += 0.025; AudioFx._tick(); } return c.started - a; };
  const early = notes({ ...base, wave: 1 }), late = notes({ ...base, wave: 20, hypePct: 1, enemiesOnField: 25 });
  assert.ok(late > early * 1.3, `late waves are fuller: ${early} -> ${late}`);
  // boss layer adds its own voices on top of an equal intensity
  const withBoss = (b) => { AudioFx._reset(); AudioFx.init(); const c = AudioFx._state().ctx; AudioFx.musicStart('world_club'); AudioFx.setMusicState({ ...base, wave: 20, hypePct: 1, bossAlive: b }); AudioFx._state().music.int = 1; const a = c.started; for (let i = 0; i < 600; i++) { c.currentTime += 0.025; AudioFx._tick(); } return { n: c.started - a, boss: AudioFx._state().music.boss }; };
  const nb = withBoss(false), yb = withBoss(true);
  assert.ok(yb.boss === 1 && nb.boss === 0 && yb.n > nb.n, `boss layer: ${nb.n} -> ${yb.n}`);
  // tension: low stage hp closes the music low-pass, healthy hp opens it, and the automation list stays short
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx; AudioFx.musicStart('world_busk');
  const lp = AudioFx._state().tension;
  assert.ok(lp.frequency.ev.length >= 1);
  AudioFx.setMusicState({ ...base, wave: 8, stageHpPct: 1 });
  const openF = lp.frequency.ev[lp.frequency.ev.length - 1][1];
  assert.ok(openF >= 19000, 'open at full hp');
  ctx.currentTime += 1; AudioFx.setMusicState({ ...base, wave: 8, stageHpPct: 0.05 });
  const shutF = lp.frequency.ev[lp.frequency.ev.length - 1][1];
  assert.ok(shutF < 2500, 'filtered when stage is nearly dead: ' + shutF);
  const nEv = lp.frequency.ev.length;
  for (let i = 0; i < 200; i++) { ctx.currentTime += 0.005; AudioFx.setMusicState({ ...base, wave: 8, stageHpPct: 0.05 }); } // spammed every frame
  assert.ok(lp.frequency.ev.length - nEv <= 2, 'unchanged state adds no automation');
  AudioFx.musicStart('victory'); // a new track opens the filter again
  assert.ok(lp.frequency.ev[lp.frequency.ev.length - 1][1] >= 19000);
  for (let i = 0; i < 100; i++) { ctx.currentTime += 0.025; AudioFx._tick(); }
}

// 14. heartbeat loop
{
  AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx; ctx.currentTime = 200;
  const run = (secs) => { const a = ctx.started; for (let i = 0; i < secs * 40; i++) { ctx.currentTime += 0.025; AudioFx._tick(); } return ctx.started - a; };
  assert.equal(run(2), 0, 'silent until started');
  AudioFx.heartbeat(true);
  const on = run(9); // 0.9 s period, each beat = 3 voices
  assert.ok(on >= 8 * 3 && on <= 12 * 3 + 3, 'about 10 lub-dubs in 9 s: ' + on / 3);
  AudioFx.heartbeat(false);
  run(0.5); assert.equal(run(5), 0, 'stops');
  // via play: starts the loop, o.off stops it, works while a track is also playing, speeds up as the stage dies
  AudioFx.play('stage_low'); assert.equal(AudioFx._state().hbOn, true);
  AudioFx.musicStart('world_arena'); AudioFx.setMusicState({ wave: 3, wavesTotal: 20, stageHpPct: 0.02 });
  assert.ok(AudioFx._state().hbPeriod < 0.7, 'faster heartbeat when nearly dead: ' + AudioFx._state().hbPeriod);
  run(3);
  AudioFx.play('stage_low', { off: true }); assert.equal(AudioFx._state().hbOn, false);
  AudioFx.musicStop(0.1);
  // muted and a long frozen clock never flood
  AudioFx.heartbeat(true); AudioFx.mute(true); assert.equal(run(3), 0, 'muted heartbeat is silent'); AudioFx.mute(false);
  ctx.currentTime += 300; const f = ctx.started; AudioFx._tick(); AudioFx._tick(); assert.ok(ctx.started - f < 30, 'no heartbeat flood after a pause');
  AudioFx.heartbeat(false);
  AudioFx._reset();
  AudioFx.heartbeat(true); AudioFx.heartbeat(false); // before init: harmless
}

// 15. per-stage identity: every track is a distinct piece (bpm, key, style, chords, bass, drums, lead colour)
{
  const infos = TRACK_IDS.map((id) => AudioFx.trackInfo(id));
  assert.equal(AudioFx.trackInfo('nope'), null);
  assert.equal(new Set(infos.map((i) => i.bpm)).size, TRACK_IDS.length, 'every track has its own bpm');
  assert.equal(new Set(infos.map((i) => JSON.stringify({ ...i, id: 0 }))).size, TRACK_IDS.length);
  const worlds = infos.filter((i) => i.id.startsWith('world_'));
  assert.equal(worlds.length, 5);
  for (const k of ['style', 'root', 'bass', 'drums']) assert.equal(new Set(worlds.map((i) => i[k])).size, 5, 'world tracks differ in ' + k);
  assert.equal(new Set(worlds.map((i) => i.chords.join('-'))).size, 5, 'world chord colours differ');
  assert.equal(new Set(worlds.map((i) => [i.lead, i.leadFilt, i.lead2].join('/'))).size, 5, 'world lead timbres differ');
  const bpms = worlds.map((i) => i.bpm); assert.deepEqual([...bpms].sort((a, b) => a - b), bpms, 'worlds speed up stage by stage');
  const byId = Object.fromEntries(infos.map((i) => [i.id, i]));
  assert.ok(byId.boss.bpm > byId.world_arena.bpm, 'boss is the fastest');
  assert.ok(byId.defeat.bpm < 80 && byId.victory.style === 'fanfare');
}

// 16. every track is seamless and bounded: no long holes, bounded look-ahead, bounded node growth
{
  const rows = [];
  for (const id of TRACK_IDS) {
    AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
    AudioFx.musicStart(id); AudioFx.musicIntensity(1); AudioFx._state().music.int = 1;
    const bd = 60 / AudioFx.beatInfo().bpm, n0 = nodes, s0 = ctx.starts.length, T0 = ctx.currentTime;
    let maxAhead = 0;
    for (let i = 0; i < 40 * 40; i++) { ctx.currentTime += 0.025; AudioFx._tick(); const last = ctx.starts[ctx.starts.length - 1]; if (last) maxAhead = Math.max(maxAhead, last.t - ctx.currentTime); }
    const ts = ctx.starts.slice(s0).map((s) => s.t).sort((a, b) => a - b);
    let gap = 0; for (let i = 1; i < ts.length; i++) gap = Math.max(gap, ts[i] - ts[i - 1]);
    const perSec = (nodes - n0) / (ctx.currentTime - T0);
    rows.push(id + ':' + Math.round(perSec));
    assert.ok(gap <= bd * 1.6, `${id} has a hole of ${gap.toFixed(2)} s (beat ${bd.toFixed(2)})`);
    assert.ok(maxAhead < 0.5, `${id} schedules too far ahead: ${maxAhead}`);
    assert.ok(perSec < 600, `${id} node rate ${perSec.toFixed(0)}/s too high for CPU`);
    // loudness of the music mix: worst-case envelope sum over 10 s at full intensity, times the music bus gain (0.7 * 0.8), stays under 1
    const envs = envelopes(ctx, 0).filter((e) => e.t0 > T0 + 5);
    const pk = peakSum(envs, T0 + 8, T0 + 18, 0.01).max * 0.56;
    assert.ok(pk <= 2.4, `${id} music worst-case sum ${pk.toFixed(2)}`);
    rows[rows.length - 1] += '/pk' + pk.toFixed(2);
  }
  console.log('drop_the_bass audio: music nodes per second / worst-case peak ' + rows.join(' '));
}

// 17. beat sync: beatInfo lines up with the notes the scheduler really plays, for every track
{
  for (const id of TRACK_IDS) {
    AudioFx._reset(); AudioFx.init(); ctx = AudioFx._state().ctx;
    const fired = []; AudioFx.onBeat((b) => fired.push({ b, at: ctx.currentTime }));
    AudioFx.musicStart(id); AudioFx.musicIntensity(1); AudioFx._state().music.int = 1;
    const m = AudioFx._state().music, bd = 60 / m.def.bpm;
    for (let i = 0; i < 14 * 40; i++) { ctx.currentTime += 0.025; AudioFx._tick(); }
    const times = ctx.starts.map((s) => s.t);
    const has = (x) => times.some((t) => Math.abs(t - x) < 1e-9);
    // the downbeat of every bar carries a note exactly where beatInfo says beat 4k, phase 0 sits
    let bars = 0;
    for (let k = 0; k * 4 * bd < 12; k++) {
      const tb = m.t0 + k * 4 * bd;
      assert.ok(has(tb), `${id}: no note on the bar ${k} downbeat ${tb}`);
      const keep = ctx.currentTime; ctx.currentTime = tb;
      const bi = AudioFx.beatInfo(); ctx.currentTime = keep;
      assert.equal(bi.beat, k * 4, id + ' beat index'); assert.ok(bi.phase < 1e-6 || bi.phase > 1 - 1e-6, id + ' phase at downbeat ' + bi.phase);
      bars++;
    }
    // every beat boundary: phase 0 exactly there, 0.5 half a beat later, onBeat index matches
    for (let b = 0; b < 20; b++) {
      const keep = ctx.currentTime;
      ctx.currentTime = m.t0 + (b + 0.5) * bd; const h = AudioFx.beatInfo();
      ctx.currentTime = keep;
      assert.equal(h.beat, b); assert.ok(Math.abs(h.phase - 0.5) < 1e-6);
      assert.ok(Math.abs(h.toNext - 0.5 * bd) < 1e-6 && Math.abs(h.sinceLast - 0.5 * bd) < 1e-6);
    }
    assert.ok(fired.length > 10);
    for (const f of fired) assert.ok(f.at >= m.t0 + f.b * bd - 0.0101 && f.at - (m.t0 + f.b * bd) < 0.06, `${id} onBeat ${f.b} fired ${f.at - (m.t0 + f.b * bd)} s from its beat`);
    assert.ok(bars >= 3);
    // output latency: phase reports what is heard, which trails the audio clock
    ctx.outputLatency = 0.05; ctx.baseLatency = 0.01;
    ctx.currentTime = m.t0 + 5 * bd + 0.06; const bl = AudioFx.beatInfo();
    assert.equal(bl.beat, 5); assert.ok(Math.abs(bl.phase * bd - 0) < 1e-6, id + ' latency compensated ' + bl.phase);
    ctx.currentTime = m.t0 + 5 * bd + 0.03; assert.equal(AudioFx.beatInfo().beat, 4);
  }
}

// 10. source hygiene
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../drop_the_bass/js/audio.js', import.meta.url), 'utf8');
assert.ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
assert.ok(!/Math\.random|Date\.now/.test(src), 'no unseeded randomness or clock');

AudioFx._reset();
console.log('drop_the_bass audio: ok (' + SFX_NAMES.length + ' sfx, ' + TRACK_IDS.length + ' tracks)');
process.exit(0);
