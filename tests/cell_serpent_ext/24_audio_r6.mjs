// Audio round 6 (nobody can listen here, so it is all checked with a recording fake AudioContext): light pump on arp and
// lead, the pump depth setting, the chain break sigh, the stage 1 count-in on the tick-only scheduler, quartet and choir
// cell sounds, and a loudness check of the new sounds against the existing clear jingle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { lightPump, padDepth, pumpLevel, chainBroke, pumpDepth, PUMP_LEVELS } from '../../cell_serpent/audio_pump.js';
import { defaultSave, sanitizeSave } from '../../cell_serpent/sim.js';

const realNow0 = performance.now;
let voices = [], clock = 500;
const param = () => { const p = { value: 0, peak: 0, first: undefined, setValueAtTime(v) { if (p.first === undefined) p.first = v; p.peak = Math.max(p.peak, v); }, linearRampToValueAtTime(v) { p.peak = Math.max(p.peak, v); }, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; return p; };
const node = kind => {
  const n = { kind, to: null, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), type: '' };
  n.connect = x => { n.to = x; }; n.start = t => { n.t0 = t; if (kind === 'osc' || kind === 'src') voices.push(n); };
  Object.defineProperty(n, 'onended', { set(f) { f(); } }); n.stop = t => { n.t1 = t; }; return n;
};
class Ctx {
  constructor() { this.destination = {}; this.sampleRate = 8000; this.state = 'running'; }
  get currentTime() { return clock; }
  createGain() { return node('gain'); } createOscillator() { return node('osc'); } createBufferSource() { return node('src'); }
  createBiquadFilter() { return node('filter'); } createDynamicsCompressor() { return node('comp'); }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; } resume() {}
}
globalThis.window = { AudioContext: Ctx };
let pumpFn = null; const realSI = globalThis.setInterval, realCI = globalThis.clearInterval;
globalThis.setInterval = f => { pumpFn = f; return 7; }; globalThis.clearInterval = () => { pumpFn = null; };
const run = sec => { for (let i = 0; i < sec / 0.08; i++) { clock += 0.08; if (pumpFn) pumpFn(); } };
const fresh = () => { voices = []; const a = createAudio(); a.unlock(); return a; };
const peakOf = v => (v.to && v.to.gain.peak) || 0;
const f0 = v => v.frequency.first;
const rd = p => readFileSync(new URL('../../cell_serpent/' + p, import.meta.url), 'utf8');

// 1) pure helpers
{
  assert.equal(pumpLevel(undefined), 2); assert.equal(pumpLevel(0), 0); assert.equal(pumpLevel(1), 1); assert.equal(pumpLevel(7), 2); assert.deepEqual(PUMP_LEVELS, ['Off', 'Soft', 'Full']);
  for (const lvl of [0, 0.5, 1]) for (const b of [false, true]) {
    assert.equal(padDepth(lvl, b, 0), 1, 'off never dips');
    assert.ok(padDepth(lvl, b, 1) > padDepth(lvl, b, 2) && padDepth(lvl, b, 1) < 1, 'soft sits between off and full');
    assert.equal(padDepth(lvl, b, 2), pumpDepth(lvl, b), 'full is the round 5 depth');
    assert.equal(lightPump(1, lvl, b, 1), 1, 'soft leaves arp and lead alone'); assert.equal(lightPump(0, lvl, b, 0), 1);
    const k0 = lightPump(0, lvl, b, 2), k1 = lightPump(1, lvl, b, 2);
    assert.ok(k0 < k1 && k1 < 1 && k0 >= 0.75, 'light: kick step ' + k0 + ', next ' + k1);
    assert.equal(lightPump(2, lvl, b, 2), 1); assert.equal(lightPump(3, lvl, b, 2), 1); assert.equal(lightPump(4, lvl, b, 2), k0, 'repeats every beat');
  }
  assert.equal(chainBroke(5, 5000), false); assert.equal(chainBroke(8, 300), false); assert.equal(chainBroke(8, 1000), true);
}

// 2) the setting is saved, sanitised and wired
{
  assert.equal(defaultSave().settings.pump, 2);
  assert.equal(sanitizeSave({ settings: { pump: 0 } }).settings.pump, 0); assert.equal(sanitizeSave({ settings: { pump: 1 } }).settings.pump, 1);
  assert.equal(sanitizeSave({ settings: { pump: 9 } }).settings.pump, 2); assert.equal(sanitizeSave({ settings: { pump: 'x' } }).settings.pump, 2); assert.equal(sanitizeSave({}).settings.pump, 2);
  assert.ok(rd('index.html').includes('data-k="pump"') && rd('main.js').includes('audio.setPump(save.settings.pump)') && rd('main.js').includes("k === 'pump'"));
}

// 3) in the real music the arp dips on the kick step at full and not when off; the pad plays at every setting
{
  const arpPeaks = set => { const a = fresh(); a.setPump(set); a.mix({ stage: 1, skin: 'love', groove: 1, danger: 0 }); a.music(true); run(12); a.music(false);
    return voices.filter(v => v.kind === 'osc' && v.type === 'square' && v.t1 - v.t0 < 0.3 && Math.abs(peakOf(v) - 0.022) < 0.0045).map(peakOf); };
  const full = arpPeaks(2), off = arpPeaks(0);
  assert.ok(full.length > 20 && off.length > 20, 'arp notes found: ' + full.length);
  assert.ok(Math.min(...full) < Math.min(...off) * 0.95, 'full pump lowers some arp notes: ' + Math.min(...full) + ' vs ' + Math.min(...off));
  assert.ok(Math.max(...full) <= Math.max(...off) + 1e-9, 'never louder than unpumped');
  const pads = set => { const a = fresh(); a.setPump(set); a.mix({ stage: 1, skin: 'love', groove: 1, danger: 0 }); a.music(true); run(6); a.music(false); return voices.filter(v => v.kind === 'osc' && v.t1 - v.t0 > 2).length; };
  assert.ok(pads(0) > 0 && pads(1) > 0 && pads(2) > 0, 'pad plays at every setting');
}

// 4) count-in: one bar of ticks only, then the song from its first bar; the old music call is unchanged
{
  const a = fresh(); a.mix({ stage: 1, skin: 'love', groove: 1, danger: 0 }); a.music(true, true); run(0.4);
  assert.ok(voices.length >= 1 && voices.every(v => v.type === 'triangle' && v.t1 - v.t0 < 0.1), 'only short ticks at first');
  run(8); a.music(false);
  const ticks = voices.filter(v => v.kind === 'osc' && v.type === 'triangle' && v.t1 - v.t0 < 0.08 && (f0(v) === 1319 || f0(v) === 988)).sort((x, y) => x.t0 - y.t0);
  const kicks = voices.filter(v => v.kind === 'osc' && f0(v) === 150).sort((x, y) => x.t0 - y.t0);
  assert.ok(kicks.length >= 4, 'the song starts after the count-in');
  const first4 = ticks.filter(v => v.t0 < kicks[0].t0);
  assert.equal(first4.length, 4, 'four count-in ticks before the first kick, got ' + first4.length);
  assert.equal(f0(first4[0]), 1319, 'accent on the first');
  assert.ok(Math.abs((kicks[0].t0 - first4[3].t0) - (first4[3].t0 - first4[2].t0)) < 1e-6, 'the kick lands one beat after the last tick');
  const b = fresh(); b.mix({ stage: 3, skin: 'love', groove: 1, danger: 0 }); b.music(true); run(1.5); b.music(false);
  assert.ok(voices.some(v => f0(v) === 150), 'without count-in the kick comes at once');
  const c = fresh(); c.setMusicAllowed(false); c.setBeatTick(true); c.music(true, true); run(3); assert.equal(c.tickOnly, true, 'tick-only mode still works'); c.music(false);
  assert.ok(rd('main.js').includes('audio.music(true, stage === 1 && !mode2)'), 'stage 1 asks for the count-in');
}

// 5) chain break sigh: only after a long chain that went quiet, once
{
  const a = fresh(), real = performance.now; let t = 1e6; performance.now = () => t;
  try {
    for (let i = 0; i < 9; i++) { a.play('kill', {}); t += 120; }
    const n1 = (a.chainWatch(), voices.length);
    t += 400; a.chainWatch(); assert.equal(voices.length, n1, 'not yet: the chain is still warm');
    t += 700; a.chainWatch(); assert.ok(voices.length > n1, 'the sigh plays after the quiet');
    const n2 = voices.length; t += 5000; a.chainWatch(); assert.equal(voices.length, n2, 'only once per chain');
    for (let i = 0; i < 3; i++) { a.play('kill', {}); t += 120; }
    const n3 = voices.length; t += 3000; a.chainWatch(); assert.equal(voices.length, n3, 'short chains end without a sigh');
  } finally { performance.now = real; }
  assert.ok(rd('main.js').includes('audio.chainWatch()'));
}

// 6) quartet and choir sounds exist, are wired to their events, and stay in the mix
{
  const main = rd('main.js');
  assert.ok(!/quartet: 'levelup'/.test(main) && !/quartetfail: 'mend'/.test(main), 'they have sounds of their own now');
  assert.ok(main.includes("'quartetstart'") && main.includes('e.choir') && main.includes("audio.play('choirpop')"));
  assert.ok(rd('sim.js').includes('choir: !!s.choir'));
  const realNow = performance.now; performance.now = () => 1e7;
  const a = fresh(); for (const n of ['quartetstart', 'quartet', 'quartetfail', 'choirpop', 'chainsigh']) assert.ok(a.names().includes(n), n);
  const sumOf = (name, e) => { voices = []; clock += 5; const a = fresh(); a.play(name, e); return voices.reduce((s, v) => s + peakOf(v), 0); };
  const clear = sumOf('clear', {});
  for (const [n, e] of [['quartetstart', 3], ['quartet', 4], ['quartetfail', 1], ['choirpop', 1], ['chainsigh', 1]]) {
    const l = sumOf(n, { n: e });
    assert.ok(voices.length >= 3 && voices.length <= 12, n + ' voices ' + voices.length);
    assert.ok(l < clear * 0.8, n + ' sits under the clear jingle: ' + l.toFixed(3) + ' vs ' + clear.toFixed(3));
    assert.ok(voices.every(v => v.t1 - v.t0 < 1), n + ' short enough');
  }
  sumOf('quartet', { n: 2 }); const q2 = voices.length; sumOf('quartet', { n: 4 }); const q4 = voices.length;
  assert.ok(q4 > q2, 'a full quartet has more voices than a duet');
}
performance.now = realNow0;
globalThis.setInterval = realSI; globalThis.clearInterval = realCI;
