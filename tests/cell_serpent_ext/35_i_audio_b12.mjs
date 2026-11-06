// Audio batch 12 (agent i) under a stub AudioContext: ring shot pan, aim sweep tick, boss crown, milestone, side-chain breathing,
// burst thinning, a loudness sweep of every sfx (0.8 summed peak cap) and the master limiter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { panOf, sweepTick, dipPts, burstKeep, isMilestone, PAN_MAX, TICK_GAP } from '../../cell_serpent/audio_b12i.js';

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

// 1) pan follows the aim angle
{
  assert.equal(panOf(-Math.PI / 2).toFixed(3), '0.000'); assert.ok(Math.abs(panOf(0) - PAN_MAX) < 1e-9); assert.ok(Math.abs(panOf(Math.PI) + PAN_MAX) < 1e-9);
  assert.ok(panOf(-0.3) > 0 && panOf(-2.8) < 0 && panOf(NaN) === 0 && panOf(1e9) <= PAN_MAX);
  const a = fresh(); tick(); pans = []; a.play('shoot', { pan: panOf(0) });
  assert.ok(pans.length === 1 && Math.abs(pans[0].pan.value - PAN_MAX) < 1e-9, 'one panned voice');
  tick(); pans = []; a.play('shoot', {}); assert.equal(pans.length, 0, 'unpanned shots stay centre');
  withPanner = false; const b = fresh(); assert.doesNotThrow(() => { tick(); b.play('shoot', { pan: 0.5 }); }, 'works without StereoPanner'); withPanner = true;
}
// 2) aim sweep tick: once per 15 degrees, rate limited, quiet
{
  const st = {}; let n = 0, ms = 0;
  for (let a = -Math.PI / 2; a < -Math.PI / 2 + Math.PI; a += 0.01) { ms += 40; if (sweepTick(st, a, ms)) n++; }
  assert.ok(n >= 10 && n <= 13, 'about one tick per 15 degrees over a half turn: ' + n);
  const s2 = {}; let fast = 0; sweepTick(s2, 0, 0); for (let i = 1; i < 40; i++) if (sweepTick(s2, i * 0.3, i * 5)) fast++;
  assert.ok(fast <= 4 && fast >= 1, 'rate limited: ' + fast + ' (gap ' + TICK_GAP + ')');
  const a = fresh(), p = peakOf(a, 'aimtick'); assert.ok(p > 0 && p < 0.03, 'quiet tick: ' + p);
  tick(); voices = []; a.play('aimtick'); assert.ok(voices.length <= 1);
}
// 3) crown clink and milestone sting
{
  const a = fresh();
  for (const n of ['bosscrown', 'milestone']) { const p = peakOf(a, n); assert.ok(p > 0 && p < 0.8, n + ': ' + p); }
  tick(); voices = []; a.play('milestone'); assert.ok(voices.length >= 8, 'sting is a real fanfare');
  assert.deepEqual([10, 20, 50, 7, 0, 45].map(isMilestone), [true, true, true, false, false, false]);
}
// 4) ambient bed side-chain: the beat scheduler dips a gain stage in front of the bed bus
{
  const pts = dipPts(0.5); assert.ok(pts[0][1] < 1 && pts[1][1] === pts[0][1] && pts[2][1] === 1 && pts[2][0] < 0.5, 'dips on the beat and recovers inside it');
  const a = fresh(); a.mix({ stage: 7, skin: 'rust', groove: 0.5 }); assert.doesNotThrow(() => a.music(true));
  assert.ok(rd('audio.js').includes('amb.dip(nextT, 60 / bpm)') && rd('audio_b10b.js').includes('dipBed(cur.sc.gain'), 'side-chain wired');
}
// 5) burst thinning: a big chain drops plain kills, never heads or boss cells
{
  const st = { n: 0, t: -1e9 }; let kept = 0; for (let i = 0; i < 30; i++) if (burstKeep(st, 1000 + i * 5, false)) kept++;
  assert.ok(kept < 20 && kept >= 6 + 12, 'thinned: ' + kept);
  const s2 = { n: 0, t: -1e9 }; for (let i = 0; i < 30; i++) assert.ok(burstKeep(s2, 1000 + i * 5, true), 'special always sounds');
  const s3 = { n: 0, t: -1e9 }; for (let i = 0; i < 20; i++) assert.ok(burstKeep(s3, i * 400, false), 'slow kills all sound');
}
// 6) loudness sweep: every sfx with several event shapes stays under the 0.8 summed peak cap
{
  const a = fresh(), loud = [], shapes = [{}, { n: 2 }, { i: 3, k: 'drop' }, { brk: true }, { k: 'hold' }, { head: true, boss: true }, { skin: 'love', boss: true }, { pan: 0.5 }];
  for (const n of a.names()) for (const e of shapes) { const p = peakOf(a, n, e); if (p > 0.8) loud.push(n + ':' + p.toFixed(2)); }
  assert.deepEqual(loud, []);
  for (const n of ['mirror', 'beatrun', 'btwist']) { assert.ok(a.names().includes(n)); for (const e of [{}, { brk: true }, { k: 'drop', warn: true }, { k: 'regrow' }]) { const p = peakOf(a, n, e); assert.ok(p > 0 && p < 0.3, n + ' audible but gentle: ' + p); } }
}
// 7) master limiter sanity
{
  fresh(); assert.ok(limiter, 'limiter exists');
  assert.ok(limiter.threshold.value <= -6, 'threshold ' + limiter.threshold.value);
  assert.ok(limiter.ratio.value >= 10 && limiter.attack.value <= 0.01 && limiter.release.value >= 0.05 && limiter.release.value <= 0.4, 'fast attack, musical release');
}
// 8) wiring
{
  const main = rd('main.js');
  assert.ok(main.includes('e.pan = panOf(game.p.aim)') && main.includes("audio.play('bosscrown')") && main.includes("audio.play('milestone')") && main.includes("audio.play('aimtick')"), 'main wired');
}
console.log('35_i_audio_b12 ok');
