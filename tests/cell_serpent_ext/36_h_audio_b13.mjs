// Audio batch 13 (agent h): shot figure, new event sounds, song form, section fills, wiring. Stub header from 35_i.
// (was: Audio batch 12 (agent i) under a stub AudioContext: ring shot pan, aim sweep tick, boss crown, milestone, side-chain breathing,
// burst thinning, a loudness sweep of every sfx (0.8 summed peak cap) and the master limiter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { shootHz, progShift, fillOf, SHOOT_STEPS } from '../../cell_serpent/audio_b13h.js';

let voices = [], clock = 5000, pans = [], limiter = null;
const param = () => { const p = { value: 0, peak: 0, setValueAtTime(v) { p.peak = Math.max(p.peak, v); }, linearRampToValueAtTime(v) { p.peak = Math.max(p.peak, v); }, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; return p; };
const node = kind => {
  const n = { kind, to: null, loop: false, stopped: false, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), Q: param(), pan: param(), type: '' };
  n.connect = x => { n.to = x; }; n.start = t => { n.t0 = t; if (kind === 'osc' || kind === 'src') voices.push(n); };
  Object.defineProperty(n, 'onended', { set(f) { f(); } });
  n.stop = () => { n.stopped = true; }; return n;
};
let withPanner = true;
class Ctx {
  constructor() { this.destination = {}; this.sampleRate = 8000; this.state = 'running'; }
  get currentTime() { return clock; }
  createGain() { return node('gain'); } createOscillator() { return node('osc'); }
  createBufferSource() { return node('src'); } createBiquadFilter() { return node('filter'); }
  createDynamicsCompressor() { limiter = node('comp'); return limiter; }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; } resume() {}
}
Object.defineProperty(Ctx.prototype, 'createStereoPanner', { get() { return withPanner ? () => { const n = node('pan'); pans.push(n); return n; } : undefined; } });
globalThis.window = { AudioContext: Ctx };
globalThis.setInterval = () => 7; globalThis.clearInterval = () => {};
const tick = () => { clock += 10; performance.now = () => 1e7 + clock * 1000; };
const fresh = () => { tick(); voices = []; pans = []; const a = createAudio(); a.unlock(); return a; };
const sumPeaks = () => voices.reduce((s, v) => s + ((v.to && v.to.gain && v.to.gain.peak) || 0), 0);
const peakOf = (a, n, e) => { tick(); voices = []; a.play(n, e); return sumPeaks(); };
const rd = p => readFileSync(new URL('../../cell_serpent/' + p, import.meta.url), 'utf8');


// 1) shot figure: four steps, never sour, detune stays small, consecutive shots differ
{
  const hs = [1, 2, 3, 4, 5].map(n => shootHz(n, 0.5));
  assert.ok(new Set(hs.slice(0, 4).map(h => Math.round(h))).size === 3, 'figure has 3 distinct pitches');
  assert.ok(hs.every(h => h >= 500 && h <= 720), 'in range');
  assert.ok(Math.abs(shootHz(1, 0) / shootHz(1, 1) - 1) < 0.045, 'detune small');
  assert.equal(SHOOT_STEPS.length, 4);
  const a = fresh(); const f = [];
  for (let i = 0; i < 4; i++) { tick(); voices = []; a.play('shoot'); f.push(voices[0].frequency.peak); }
  assert.ok(new Set(f.map(x => Math.round(x / 10))).size >= 2, 'engine plays a figure');
}
// 2) new event sounds exist, are audible and sit under the loudness cap
{
  const a = fresh();
  for (const n of ['nap', 'gloom', 'pillow', 'shell', 'soundcheck']) { assert.ok(a.names().includes(n), n); const p = peakOf(a, n, {}); assert.ok(p > 0 && p < 0.6, n + ' ' + p); }
  assert.ok(a.names().includes('metro'));
  assert.equal(peakOf(a, 'metro', { hit: false }), 0, 'a missed metronome beat is silent');
  assert.ok(peakOf(a, 'metro', { hit: true }) > 0 && peakOf(a, 'metro', {}) === 0);
  const main = rd('main.js');
  for (const n of ['gloom', 'nap', 'pillow', 'shell', 'metro', 'soundcheck']) assert.ok(main.includes("'" + n + "'"), n + ' routed in main.js');
}
// 3) song form: stages in one key block open on different sections, bosses unchanged
{
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(progShift), [0, 1, 2, 3, 0, 0]);
  assert.equal(progShift(0), 0); assert.equal(progShift(NaN), 0);
  assert.ok(rd('audio.js').includes('progShift(m.stage)'));
}
// 4) section fills
{
  assert.equal(fillOf(0, 2, 14, 1), null); assert.equal(fillOf(0, 3, 14, 0.1), null, 'quiet music has no fills');
  const tom = [13, 14, 15].map(s => fillOf(0, 3, s, 0.8)); assert.ok(tom.every(x => x && x.k === 'tom') && tom[0].hz > tom[2].hz, 'falling tom run');
  const sn = [12, 13, 14, 15].map(s => fillOf(1, 3, s, 0.8)); assert.deepEqual(sn.map(x => x && x.k), [null, null, 'snare', 'snare']);
  assert.ok(sn[3].v > sn[2].v && sn[3].v < 0.12);
  const a = fresh(); a.mix({ stage: 8, skin: 'rust', groove: 0.9 }); assert.doesNotThrow(() => a.music(true));
}
// 5) loudness sweep over the whole table still under the cap
{
  const a = fresh(), loud = [];
  for (const n of a.names()) for (const e of [{}, { n: 2 }, { hit: true }, { head: true }, { pan: 0.4 }]) { const p = peakOf(a, n, e); if (p > 0.8) loud.push(n + ':' + p.toFixed(2)); }
  assert.deepEqual(loud, []);
}
console.log('36_h_audio_b13 ok');
