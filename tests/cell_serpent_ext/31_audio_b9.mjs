// Audio round 9 (stub AudioContext, no ears): music grows with combo and boss phase, a bell colour per world,
// voice pile-up control, hub UI sounds (claim row, ribbon flight, tune sticker) and mix balance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { comboTier, comboLayer, shimmerVol, bossExtra, COLOUR, colourOf, admit, LOW, flyPitch } from '../../cell_serpent/audio_b9.js';
import { SKINS } from '../../cell_serpent/sim.js';

let voices = [], clock = 2000, pumpFn = null, hold = false;
const param = () => { const p = { value: 0, peak: 0, setValueAtTime(v) { p.peak = Math.max(p.peak, v); }, linearRampToValueAtTime(v) { p.peak = Math.max(p.peak, v); }, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; return p; };
const node = kind => {
  const n = { kind, to: null, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), type: '' };
  n.connect = x => { n.to = x; }; n.start = t => { n.t0 = t; if (kind === 'osc' || kind === 'src') voices.push(n); };
  Object.defineProperty(n, 'onended', { set(f) { if (!hold) f(); } });   // hold: voices stay live like a crowded engine
  n.stop = () => {}; return n;
};
class Ctx {
  constructor() { this.destination = {}; this.sampleRate = 8000; this.state = 'running'; }
  get currentTime() { return clock; }
  createGain() { return node('gain'); } createOscillator() { return node('osc'); } createBufferSource() { return node('src'); }
  createBiquadFilter() { return node('filter'); } createDynamicsCompressor() { return node('comp'); }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; } resume() {}
}
globalThis.window = { AudioContext: Ctx };
globalThis.setInterval = f => { pumpFn = f; return 7; }; globalThis.clearInterval = () => {};
const tick = () => { clock += 10; performance.now = () => 1e7 + clock * 1000; };
const fresh = () => { tick(); voices = []; const a = createAudio(); a.unlock(); return a; };
const sumPeaks = () => voices.reduce((s, v) => s + ((v.to && v.to.gain.peak) || 0), 0);

// 1) tiers and layers
{
  assert.deepEqual([0, 7, 8, 19, 20, 39, 40, 99].map(comboTier), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(comboLayer(0).oh, 0); assert.equal(comboLayer(8).oh, 1); assert.ok(comboLayer(40).sh > comboLayer(20).sh);
  assert.equal(shimmerVol(1, 1), 0); assert.equal(shimmerVol(2, 0), 0); assert.ok(shimmerVol(3, 1) > shimmerVol(2, 1) && shimmerVol(3, 1) < 0.02, 'a whisper');
  assert.equal(bossExtra(0, 0, 1), null); assert.equal(bossExtra(1, 3, 13)[0], 'tom'); assert.equal(bossExtra(2, 0, 3)[0], 'hat'); assert.equal(bossExtra(2, 3, 13)[0], 'tom');
}

// 2) the music really gets denser: count the voices a stretch of music schedules for each mix
{
  const bars = mix => {
    const a = fresh(); a.mix(mix); a.music(true); voices = [];
    let total = 0;
    for (let i = 0; i < 40; i++) { clock += 0.4; performance.now = () => 1e7 + clock * 1000; total += voices.length; voices = []; pumpFn(); }
    total += voices.length; a.music(false); return total;
  };
  const base = { stage: 7, groove: 0.5, danger: 0.2, skin: 'love' };
  const c0 = bars({ ...base, combo: 0 }), c1 = bars({ ...base, combo: 10 }), c2 = bars({ ...base, combo: 25 }), c3 = bars({ ...base, combo: 60 });
  assert.ok(c1 > c0 && c2 > c1 && c3 > c2, 'combo adds layers: ' + [c0, c1, c2, c3]);
  const bb = { stage: 10, boss: true, groove: 0.5, danger: 0.2, skin: 'mighty' };
  const b0 = bars({ ...bb, bphase: 0 }), b2 = bars({ ...bb, bphase: 2 });
  assert.ok(b2 > b0, 'boss phase 2 is denser: ' + b0 + ' vs ' + b2);
  const worlds = new Set(SKINS.map(sk => bars({ stage: 7, groove: 0.5, danger: 0.2, skin: sk })));
  assert.ok(worlds.size >= 4, 'worlds differ in density');
}

// 3) world colour table
{
  for (const sk of SKINS) { const c = COLOUR[sk]; assert.ok(c && c.at.length && c.v > 0 && c.v < 0.03 && c.at.every(s => s >= 0 && s < 16), sk + ' colour'); }
  assert.equal(new Set(SKINS.map(s => COLOUR[s].w + COLOUR[s].at.join() + COLOUR[s].oct + COLOUR[s].off)).size, SKINS.length, 'each world has its own bell');
  assert.equal(colourOf('nope'), COLOUR.love);
}

// 4) voice pile-up: low priority sounds yield first, big moments still play, and a crowded engine stays bounded
{
  assert.ok(admit('shoot', 5) && admit('levelup', 39));
  assert.ok(!admit('shoot', 20) && admit('coin', 20) && !admit('coin', 24) && admit('click', 24) && !admit('click', 27));
  assert.ok(!admit('levelup', 41), 'nothing past the hard cap');
  for (const k of Object.keys(LOW)) assert.ok(LOW[k] >= 1 && LOW[k] <= 3);
  hold = true; const a = fresh(); a.music(true); voices = [];
  for (let i = 0; i < 60; i++) { clock += 0.001; performance.now = () => 1e7 + clock * 1000 + i * 100; a.play('shoot'); a.play('kill', { n: 1 }); a.play('coin'); }
  assert.ok(voices.length <= 45, 'voices stay bounded: ' + voices.length); hold = false;
}

// 5) hub UI sounds exist, are quiet, and are wired
{
  const a = fresh(), peakOf = n => { tick(); voices = []; a.play(n, { i: 2 }); return sumPeaks(); };
  const lvl = peakOf('levelup');
  for (const n of ['claimrow', 'ribbonfly', 'ribbonland', 'tunestick', 'stickerget']) { assert.ok(a.names().includes(n), n); const p = peakOf(n); assert.ok(p > 0 && p < lvl * 1.2, n + ' audible but below the level up jingle: ' + p + ' vs ' + lvl); }
  assert.ok(flyPitch(1) > flyPitch(0) && flyPitch(4) > flyPitch(3), 'the flight climbs');
  const rd = p => readFileSync(new URL('../../cell_serpent/' + p, import.meta.url), 'utf8'), main = rd('main.js');
  assert.ok(main.includes("audio.play('claimrow')") && main.includes("audio.play('ribbonfly', { i })") && main.includes("audio.play('ribbonland', { i })"), 'main wired');
  assert.ok(main.includes('combo: g.t - g.lastKill < 2.2 ? g.combo : 0'), 'combo reaches the mix');
  assert.ok(rd('title_b8.js').includes("'tunestick'") && rd('title_b8.js').includes("'stickerget'"), 'sticker wired');
}

// 6) mix balance: no single sfx is wildly louder than the rest (sum of voice peaks)
{
  const a = fresh(), res = [];
  for (const n of a.names()) { tick(); voices = []; a.play(n, { n: 2, skin: 'love', head: false, i: 1, cell: 3 }); res.push([n, sumPeaks()]); }
  const loud = res.filter(([, p]) => p > 0.8);
  assert.deepEqual(loud, [], 'sounds above 0.8 summed peak: ' + loud.join(';'));
}
console.log('31_audio_b9 ok');
