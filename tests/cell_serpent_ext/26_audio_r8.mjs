// Audio round 8 (checked without ears, with a recording fake AudioContext): stage card sting per species, head death voice
// per species, finishing blow per weapon, kill chain octave rungs, the face panic squeal that rides the heartbeat, and the
// hub bed per world.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { CARD, DEATH, FINISH, PANIC, BED, cardOf, deathOf, finishOf, rungSparkle, panicHz, bedOf } from '../../cell_serpent/audio_b8.js';
import { createFeel6 } from '../../cell_serpent/feel6.js';
import { SKINS, skinFor } from '../../cell_serpent/sim.js';

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
const run = (name, e, mix) => { tick(); const a = fresh(); if (mix) a.mix(mix); voices = []; a.play(name, e); return voices.slice(); };
const sum = vs => vs.reduce((s, v) => s + peakOf(v), 0);
const clear = (tick(), sum(run('clear', {})));

// 1) tables cover every species and weapon, and no two species share a sting or a death voice
{
  for (const sk of SKINS) { assert.ok(CARD[sk] && DEATH[sk] && PANIC[sk] && BED[sk], sk + ' has all entries'); }
  assert.equal(new Set(SKINS.map(s => CARD[s].n.join() + CARD[s].w)).size, SKINS.length, 'every stage sting differs');
  assert.equal(new Set(SKINS.map(s => DEATH[s].x)).size, SKINS.length, 'every head dies its own way');
  assert.equal(new Set(SKINS.map(s => BED[s].chord.map(Math.round).join())).size, SKINS.length, 'every world has its own hub chord');
  assert.equal(cardOf('nope'), CARD.love); assert.equal(deathOf('nope'), DEATH.love); assert.equal(finishOf('nope'), FINISH.capsule); assert.equal(bedOf('nope'), BED.love);
  for (const id of ['swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw']) assert.ok(FINISH[id], id + ' has a finishing chime');
}

// 2) stage card sting: per species, quiet, lands after the riser, and the old generic stage notes stay for callers without a species
{
  const first = sk => run('stage', { n: 4, skin: sk }).map(v => Math.round(v.frequency.peak)).join();
  assert.equal(new Set(SKINS.map(first)).size, SKINS.length, 'each species sounds different on its card');
  for (const sk of SKINS) assert.ok(sum(run('stage', { n: 4, skin: sk })) < clear * 0.8, sk + ' sting stays under the clear jingle');
  assert.ok(run('stage', { n: 4 }).length >= 3, 'the plain stage sound still works without a species');
  assert.ok(run('stagecard', { skin: 'frosty' }).length > run('stagecard', { skin: 'love' }).length - 0, 'frosty adds an icy breath');
  assert.ok(run('stagecard', { skin: 'sleepy' }).every(v => v.t0 > clock), 'the sting is delayed to the card slam');
  assert.ok(rd('main.js').includes('e.skin = game.skin'), 'main passes the species to the stage sound');
}

// 3) head death voice per species and the finishing blow per weapon
{
  const root = sk => run('kill', { head: true, skin: sk }).map(v => Math.round(v.frequency.peak)).join();
  assert.equal(new Set(SKINS.map(root)).size, SKINS.length, 'heads die differently');
  for (const sk of SKINS) assert.ok(sum(run('kill', { head: true, skin: sk })) < clear * 1.3, sk + ' death stays near the clear jingle');
  const plain = run('kill', { head: false, skin: 'love' }).length; assert.ok(run('kill', { head: true, skin: 'love' }).length > plain, 'only heads get the voice');
  const chime = src => run('finishblow', { src }).map(v => Math.round(v.frequency.peak)).join();
  assert.equal(new Set(Object.keys(FINISH).map(chime)).size, Object.keys(FINISH).length, 'each weapon has its own finishing chime');
  for (const k of Object.keys(FINISH)) assert.ok(sum(run('finishblow', { src: k })) < clear * 0.6, k + ' chime is soft');
  assert.deepEqual(run('finishblow', { src: '' }).map(v => v.frequency.peak), run('finishblow', {}).map(v => v.frequency.peak), 'unknown weapon falls back');
  const m = rd('main.js'); assert.ok(m.includes("audio.play('finishblow'") && m.includes("e.t === 'hit'"), 'finish sound is wired to the head kill');
}

// 4) kill chain octave rungs
{
  assert.equal(rungSparkle(0), 0); assert.equal(rungSparkle(3), 0); assert.equal(rungSparkle(5), 1); assert.equal(rungSparkle(10), 2); assert.equal(rungSparkle(14), 0); assert.equal(rungSparkle(15), 3);
  const chain = n => { tick(); const a = fresh(); let last = []; for (let i = 0; i <= n; i++) { clock += 0.05; performance.now = () => 1e7 + clock * 1000; voices = []; a.play('kill', {}); last = voices.slice(); } return last.length; };
  assert.ok(chain(5) > chain(3), 'the fifth step of a chain sparkles on top of the pop');
}

// 5) panic squeal: species pitch, rises with danger, silent on bosses, and rides the red heartbeat in feel6
{
  assert.ok(panicHz('love', 1) > panicHz('love', 0) && panicHz('mighty', 0.5) < panicHz('frosty', 0.5), 'pitch rises with danger and differs per species');
  const sq = (sk, d, boss) => run('panic', {}, { stage: 2, skin: sk, danger: d, boss });
  assert.equal(sq('love', 0.9, true).length, 0, 'bosses do not squeal');
  assert.ok(sq('love', 0.9).length >= 2);
  assert.ok(sq('love', 1)[0].frequency.peak > sq('love', 0.6)[0].frequency.peak, 'higher when closer');
  assert.ok(peakOf(sq('love', 1)[0]) > peakOf(sq('love', 0.6)[0]), 'louder when closer');
  for (const sk of SKINS) assert.ok(sum(sq(sk, 1)) < clear * 0.15, sk + ' squeal is small');
  const noop = () => {}, ctx = new Proxy({}, { get: () => noop, set: () => true });
  const go = (d, ringStage) => {
    const sounds = [], S = { t: 0, trauma: 0 };
    const f = createFeel6({ ctx, W: 400, H: 800, kit: null, S, OPT: { reduceMotion: false }, ring: noop, burst: noop, text: noop, glow: noop, edges: noop, vignette: noop, slow: noop, confetti: noop, sounds });
    for (let i = 0; i < 360; i++) { S.t += 1 / 60; f.draw({ phase: 'play', danger: d, ring: ringStage }); }
    return [sounds.filter(n => n === 'dangerbeat').length, sounds.filter(n => n === 'panic').length];
  };
  const [b1, p1] = go(0.95, false), [b2, p2] = go(0.3, false), [, p3] = go(0.95, true);
  assert.ok(p1 > 4 && p1 === b1, 'one squeal per heartbeat when the face is panicking: ' + p1 + '/' + b1);
  assert.equal(p2, 0, 'no squeal while the face is not panicking'); assert.ok(b2 > 0);
  assert.equal(p3, 0, 'no panic face in ring stages');
}

// 6) hub bed per world: follows the selected stage, restarts on a world change, never stacks
{
  tick(); voices = []; const a = createAudio(); a.hubWorld('frosty'); a.unlock(); a.hub(true);
  assert.equal(a.hubOn, true); const n1 = voices.length;
  const freqs = () => voices.filter(v => v.kind === 'osc').map(v => Math.round(v.frequency.peak)).slice(0, 4).join();
  const f1 = freqs(); assert.equal(f1, bedOf('frosty').chord.map(Math.round).map((f, i) => Math.round(f * (1 + 0.0015 * i))).join(), 'the bed plays the frosty chord');
  a.hubWorld('frosty'); assert.equal(voices.length, n1, 'same world: no restart');
  a.hubWorld('gloomy'); assert.equal(a.hubOn, true, 'still on after the world changed');
  assert.ok(voices.slice(0, n1).every(v => v.t1), 'the old bed is scheduled to stop');
  assert.ok(voices.length > n1 && voices.slice(n1).every(v => !v.t1), 'a new bed is running');
  assert.notEqual(voices.slice(n1, n1 + 4).map(v => Math.round(v.frequency.peak)).join(), f1);
  a.hub(false); assert.equal(a.hubOn, false); a.hubWorld('love'); assert.equal(a.hubOn, false, 'a world change does not start a stopped bed');
  const m = rd('main.js'); assert.ok(m.includes('audio.hubWorld(skinFor(sel))'), 'the hub follows the selected stage'); assert.equal(skinFor(1), 'love');
}
performance.now = realNow0;
globalThis.setInterval = realSI; globalThis.clearInterval = realCI;
