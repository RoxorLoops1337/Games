// Audio sync: the music kick grid follows the sim beat clock (tempo and phase), per-weapon hit sounds,
// the on-beat tick streak and the new event sounds. Uses a recording fake AudioContext (we cannot listen).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { beatBpm, beatPhase } from '../../cell_serpent/sim.js';

let clock = 10, started = [];
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const mk = kind => {
  const n = { kind, connect() {}, start(t) { started.push({ kind, t, f: n.f0, sl: n.sl }); queueMicrotask(() => n.onended && n.onended()); }, stop() {}, gain: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
  n.frequency = { value: 0, setValueAtTime(f) { n.f0 = f; }, exponentialRampToValueAtTime(f) { n.sl = f; } };
  return n;
};
class Ctx {
  constructor() { this.destination = {}; this.sampleRate = 8000; this.state = 'running'; }
  get currentTime() { return clock; }
  createGain() { return mk('g'); } createOscillator() { return mk('osc'); } createBufferSource() { return mk('noise'); }
  createBiquadFilter() { return mk('f'); } createDynamicsCompressor() { return mk('c'); }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  resume() {}
}
globalThis.window = { AudioContext: Ctx };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// drive the music pump by hand so the fake clock and the scheduler stay in lockstep
let pumpFn = null;
globalThis.setInterval = fn => { pumpFn = fn; return 1; };
globalThis.clearInterval = () => { pumpFn = null; };
const tick = async dt => { clock += dt; if (pumpFn) pumpFn(); await 0; };
const isKick = s => s.kind === 'osc' && s.f === 150;

// kicks are the 150 Hz sine thumps; their spacing must equal the sim beat period, for normal and boss stages
for (const stage of [1, 7, 12, 5, 10]) {
  const a = createAudio(); a.unlock(); started = []; a.mix({ stage, groove: 0.2, danger: 0.9 });   // danger no longer speeds the tempo
  a.music(true);
  for (let i = 0; i < 160; i++) await tick(0.05);
  a.music(false);
  const kicks = started.filter(isKick).map(s => s.t).sort((x, y) => x - y);
  assert.ok(kicks.length >= 6, 'enough kicks for stage ' + stage + ': ' + kicks.length);
  const per = 60 / beatBpm(stage);
  // extra kicks (boss, high groove) sit on the sixteenth grid; the downbeat kicks are exactly one period apart
  const k0 = kicks[0];
  for (const k of kicks) { const q = (k - k0) / (per / 4); assert.ok(Math.abs(q - Math.round(q)) < 1e-6, `stage ${stage} kick off the sixteenth grid`); }
  assert.ok(kicks.some(k => Math.abs(k - k0 - per) < 1e-6 || Math.abs(k - k0 - per / 2) < 1e-6 || Math.abs(k - k0 - 3 * per / 2) < 1e-6) && kicks.some(k => Math.abs(k - k0 - 4 * per) < 1e-6), 'stage ' + stage + ' beat period');
}

// sync(): after settling, the kicks sit on the sim beat phase (within 20 ms), even when the sim starts mid beat
{
  const a = createAudio(); a.unlock(); started = []; const stage = 3, per = 60 / beatBpm(stage);
  a.mix({ stage }); a.music(true);
  const g = { stage, t: 0.173 };   // the sim is already 0.173 s into its clock
  const t0 = clock;
  for (let i = 0; i < 1200; i++) { g.t += 1 / 60; await tick(1 / 60); a.sync(beatPhase(g)); }
  a.music(false);
  const kicks = started.filter(isKick).map(s => s.t).filter(t => t > t0 + 8);
  assert.ok(kicks.length >= 4, 'kicks after settling ' + kicks.length);
  for (const k of kicks) { const st = 0.173 + (k - t0), d = st % per, off = Math.min(d, per - d); assert.ok(off < 0.02, 'kick off the sim beat by ' + off.toFixed(4) + ' s'); }
}

// per-weapon hit sounds are distinct recipes and never throw; crit adds a ping
{
  const a = createAudio(); a.unlock();
  const realNow0 = performance.now.bind(performance); let fake = realNow0() + 5e5; performance.now = () => (fake += 100);   // step past the per-sound gates
  const sig = {};
  for (const src of ['capsule', 'swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw', 'encore', 'nope']) {
    started = []; clock += 1; a.play('hit', { src }); sig[src] = started.map(s => s.kind + ':' + Math.round((s.f || 0) / 40)).join(',');
    assert.ok(started.length > 0, 'hit makes sound for ' + src);
  }
  assert.ok(new Set(Object.values(sig)).size >= 8, 'weapon hits sound different, got ' + new Set(Object.values(sig)).size);
  clock += 1; started = []; a.play('hit', { src: 'capsule', crit: true }); const crit = started.length; clock += 1; started = []; a.play('hit', { src: 'capsule' });
  assert.ok(crit > started.length, 'crit adds a ping');
  performance.now = realNow0;
}

// on-beat tick: the streak climbs while shots land every beat and resets after a miss
{
  const a = createAudio(); a.unlock(); a.mix({ stage: 1 }); a.music(true); await tick(0.1);
  const realNow = performance.now.bind(performance); let tReal = realNow() + 100000;
  performance.now = () => tReal;
  const per = 60 / beatBpm(1) * 1000;
  for (let i = 0; i < 5; i++) { tReal += per; a.play('beatshot'); }
  assert.equal(a.beatStreak, 5);
  tReal += per * 3; assert.equal(a.beatStreak, 0, 'streak lapses after missed beats');
  a.play('beatshot'); assert.equal(a.beatStreak, 1);
  performance.now = realNow; a.music(false);
}

// new event sounds exist and are wired in main.js; revive heartbeat gets louder, count-up ticks wired
{
  const a = createAudio(); const names = a.names();
  for (const n of ['beatshot', 'encore', 'encoreready', 'goldpop', 'goldfade', 'clutch', 'checkpoint', 'count', 'countend']) assert.ok(names.includes(n), 'sfx ' + n);
  const main = readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
  for (const n of ["'beatshot'", "'encore'", "'goldpop'", "'clutch'", "'checkpoint'", 'audio.sync(beatPhase(g))', "audio.play('countend')", "audio.play('heartbeat', { n })"]) assert.ok(main.includes(n), 'main.js missing ' + n);
  a.unlock(); started = []; clock += 1; a.play('heartbeat', { n: 3 }); const c3 = started.length; started = []; clock += 1; a.play('heartbeat', { n: 1 });
  assert.ok(started.length > c3, 'last heartbeat has the extra tick');
}
console.log('13_audio_sync ok');
