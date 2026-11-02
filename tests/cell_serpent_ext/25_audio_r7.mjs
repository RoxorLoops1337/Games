// Audio round 7 (nobody can listen here, so it is checked with a recording fake AudioContext and the pure helpers):
// choir regrow hum per species, the danger tick that follows the red heartbeat, the tapped snake squeak per cell, the
// tutorial pop, the ambient hub bed and a loudness check of every new sound against the clear jingle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { HUM, humOf, choirRegrowing, createLife, squeakHz, HUM_EVERY, HUB_CHORD, HUB_GAIN } from '../../cell_serpent/audio_b7.js';
import { createFeel6, dangerRate, heartbeat } from '../../cell_serpent/feel6.js';
import { SKINS } from '../../cell_serpent/sim.js';

const realNow0 = performance.now;
let voices = [], clock = 900;
const param = () => { const p = { value: 0, peak: 0, setValueAtTime(v) { p.peak = Math.max(p.peak, v); }, linearRampToValueAtTime(v) { p.peak = Math.max(p.peak, v); }, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; return p; };
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
const realSI = globalThis.setInterval, realCI = globalThis.clearInterval;
globalThis.setInterval = () => 7; globalThis.clearInterval = () => {};
const fresh = () => { voices = []; const a = createAudio(); a.unlock(); return a; };
const peakOf = v => (v.to && v.to.gain.peak) || 0;
const rd = p => readFileSync(new URL('../../cell_serpent/' + p, import.meta.url), 'utf8');
const tick = () => { clock += 5; performance.now = () => 1e7 + clock * 1000; };
const sumOf = (name, e) => { tick(); const a = fresh(); a.play(name, e); return voices.reduce((s, v) => s + peakOf(v), 0); };

// 1) every species has its own hum, and the hum is a quiet swelling chord
{
  const keys = new Set();
  for (const sk of SKINS) {
    const h = humOf(sk); assert.equal(h, HUM[sk], sk + ' has an entry');
    keys.add(h.m + h.w + h.iv.join()); assert.ok(h.dur >= 1 && h.dur <= 2 && h.v > 0 && h.v <= 0.02);
  }
  assert.equal(keys.size, SKINS.length, 'no two species share a hum');
  assert.equal(humOf('nope'), HUM.love, 'unknown species fall back');
  const rootOf = sk => { tick(); const a = fresh(); a.play('choirhum', { skin: sk, n: 2 }); return voices.map(v => Math.round(v.frequency.peak)); };
  assert.notDeepEqual(rootOf('love'), rootOf('grumpy')); assert.equal(rootOf('mighty').length, 3);
  const clear = sumOf('clear', {});
  for (const sk of SKINS) assert.ok(sumOf('choirhum', { skin: sk, n: 4 }) < clear * 0.2, sk + ' hum stays far under the clear jingle');
  sumOf('choirhum', { skin: 'sleepy', n: 1 }); assert.ok(voices.every(v => v.t1 - v.t0 < 2), 'swells end');
}

// 2) the hum only plays while a choir cell is really regrowing, once per HUM_EVERY
{
  const seg = (o = {}) => ({ hp: 5, max: 10, flash: 0, ...o });
  const g = { phase: 'play', snakes: [{ skin: 'frosty', segs: [seg(), seg(), seg({ choir: true, hp: 10 }), seg(), seg({ hp: 10 })] }] };
  assert.equal(choirRegrowing(g), 2, 'neighbours 1 and 3 are hurt, 4 is full');
  g.snakes[0].segs[1].flash = 0.2; assert.equal(choirRegrowing(g), 1, 'a cell that was just hit is not regrowing');
  g.snakes[0].segs[2].hp = 0; assert.equal(choirRegrowing(g), 0, 'a dead choir cell regrows nothing');
  g.snakes[0].segs[2].hp = 10; g.snakes[0].segs[1].flash = 0;
  const played = []; const life = createLife({ play: (n, e) => played.push([n, e]) });
  let t = 1000; life.tick(g, t); assert.equal(played.length, 1); assert.deepEqual(played[0][1], { skin: 'frosty', n: 2 });
  life.tick(g, t += 300); assert.equal(played.length, 1, 'not again within the period');
  life.tick(g, t += HUM_EVERY); assert.equal(played.length, 2);
  g.phase = 'levelup'; life.tick(g, t += 2 * HUM_EVERY); assert.equal(played.length, 2, 'silent over the cards');
  g.phase = 'play'; for (const s of g.snakes[0].segs) s.hp = s.max; life.tick(g, t += 2 * HUM_EVERY); assert.equal(played.length, 2, 'nothing hurt: nothing to hum');
  assert.ok(rd('audio_cues.js').includes('life.tick(g'), 'wired into the per frame cue tracker');
  assert.ok(rd('main.js').includes('cues.tick(g)'));
}

// 3) the danger tick is the lub of the red heartbeat and follows its rate
{
  const noop = () => {}, ctx = new Proxy({}, { get: () => noop, set: () => true });
  const run = (d, calm) => {
    const sounds = [], S = { t: 0, trauma: 0 };
    const f = createFeel6({ ctx, W: 400, H: 800, kit: null, S, OPT: { reduceMotion: calm }, ring: noop, burst: noop, text: noop, glow: noop, edges: noop, vignette: noop, slow: noop, confetti: noop, sounds });
    for (let i = 0; i < 360; i++) { S.t += 1 / 60; f.draw({ phase: 'play', danger: d }); }
    return sounds.filter(n => n === 'dangerbeat').length;
  };
  const sec = 6, calmN = run(0.9, true), lo = run(0.3, false), hi = run(1, false);
  assert.ok(hi > lo && lo > 3, 'faster heartbeat, faster ticks: ' + lo + ' vs ' + hi);
  assert.ok(Math.abs(hi / sec - dangerRate(1)) < 0.35 && Math.abs(lo / sec - dangerRate((0.3 - 0.12) / 0.88)) < 0.35, 'one tick per heartbeat cycle: ' + lo + '/' + hi);
  assert.ok(calmN > 3, 'reduced motion keeps the sound');
  assert.equal(run(0.05, false), 0, 'no danger, no tick');
  assert.ok(heartbeat(0.08 / dangerRate(1), dangerRate(1)) > 0.99, 'the tick sits on the lub of the pulse');
  assert.ok(rd('main.js').includes('R.takeSounds()'), 'the render sound queue reaches audio.play');
  // the sound itself
  const beat = d => { tick(); const a = fresh(); a.mix({ stage: 5, danger: d }); a.play('dangerbeat'); return voices.slice(); };
  const calmV = beat(0.2), hotV = beat(1);
  assert.equal(calmV.length, 2, 'two thumps, no clock tick while calm'); assert.equal(hotV.length, 3, 'a clock tick joins from half danger');
  assert.ok(hotV[1].t0 - hotV[0].t0 < calmV[1].t0 - calmV[0].t0, 'the dub follows sooner when the heart races');
  assert.ok(peakOf(hotV[0]) > peakOf(calmV[0]), 'louder when close');
  const rev = sumOf('heartbeat', { n: 1 }); assert.ok(hotV.reduce((s, v) => s + peakOf(v), 0) < rev * 1.2, 'under the revive heartbeat');
  assert.ok(!/m\.danger > 0\.55 && s % 4 === 0\) tone\(1760/.test(rd('audio.js')), 'the grid bound danger tick is gone');
}

// 4) tapped snake squeaks per cell, tutorial pop
{
  const hzs = Array.from({ length: 13 }, (_, i) => squeakHz(i));
  assert.equal(new Set(hzs.map(h => Math.round(h))).size, 13, 'every cell has its own pitch');
  assert.ok(hzs.every(h => h > 500 && h < 4200));
  assert.ok(hzs[1] < hzs[2] && hzs[2] < hzs[3] && hzs[5] > hzs[1], 'the ladder climbs toward the tail');
  assert.equal(squeakHz(-4), squeakHz(0));
  const a = fresh(); for (const n of ['snakesqueak', 'tutpop', 'choirhum', 'dangerbeat']) assert.ok(a.names().includes(n), n);
  const f = i => { tick(); const b = fresh(); b.play('snakesqueak', { i }); return voices[0].frequency.peak; };
  assert.ok(f(3) !== f(4) && f(0) < 400, 'head is a low oh, cells differ');
  const clear = sumOf('clear', {});
  for (const [n, e] of [['snakesqueak', { i: 4 }], ['snakesqueak', { i: 0 }], ['tutpop', {}]]) assert.ok(sumOf(n, e) < clear * 0.8, n + ' under the clear jingle');
  assert.ok(rd('main.js').includes("audio.play('snakesqueak', e.detail)") && /i: Math\.max\(0, Math\.min\(N - 1/.test(rd('onboard5.js')), 'poke carries the cell index');
  assert.ok(rd('onboard12.js').includes("audio.play('tutpop')") && rd('onboard12.js').includes('stopPop()'), 'step 3 pops, and stops with the tutorial');
}

// 5) ambient hub bed: waits for a user gesture, follows music setting and mute, hands over to the run music, never stacks
{
  voices = []; const a = createAudio(); a.hub(true); assert.equal(a.hubOn, false, 'no audio context before a tap');
  a.unlock(); assert.equal(a.hubOn, true, 'starts once unlocked'); const n = voices.length;
  assert.ok(n >= HUB_CHORD.length && n <= 6, 'a chord and a slow wobble: ' + n);
  assert.ok(voices.every(v => !v.t1), 'running until stopped');
  a.setMusicAllowed(false); assert.equal(a.hubOn, false, 'the Music setting switches the bed off'); assert.ok(voices.every(v => v.t1), 'all oscillators scheduled to stop');
  a.setMusicAllowed(true); assert.equal(a.hubOn, true); a.setMuted(true); assert.equal(a.hubOn, false); a.setMuted(false); assert.equal(a.hubOn, true);
  a.music(true); assert.equal(a.hubOn, false, 'run music takes over'); a.music(false); assert.equal(a.hubOn, false, 'and the hub must ask again');
  a.hub(true); assert.equal(a.hubOn, true); a.hub(false); assert.equal(a.hubOn, false);
  a.hub(true); const before = voices.length; a.hub(true); assert.equal(voices.length, before, 'asking twice does not stack beds'); a.hub(false);
  assert.ok(HUB_GAIN <= 0.06, 'far below a run pad');
  const m = rd('main.js'); assert.ok(m.includes('audio.music(false); audio.hub(true);'), 'openHub starts the bed'); assert.ok(m.includes('audio.hub(false);'), 'the title has none');
}
performance.now = realNow0;
globalThis.setInterval = realSI; globalThis.clearInterval = realCI;
