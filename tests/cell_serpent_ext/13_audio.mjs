// Audio director: every sfx plays against a stubbed AudioContext without throwing; no AudioContext is safe.
import assert from 'node:assert/strict';
import { createAudio } from '../../cell_serpent/audio.js';

let nodes = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => { nodes++; return { connect() {}, start() { setTimeout(() => this.onended && this.onended(), 5); }, stop() {}, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; };
let clock = 0;
class Ctx {
  constructor() { this.destination = {}; this.sampleRate = 8000; this.state = 'running'; }
  get currentTime() { return (clock += 0.05); }
  createGain() { return node(); } createOscillator() { return node(); } createBufferSource() { return node(); }
  createBiquadFilter() { return node(); } createDynamicsCompressor() { return node(); }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  resume() {}
}

// 1) missing AudioContext
delete globalThis.window;
{
  const a = createAudio();
  a.unlock(); a.play('click'); a.music(true); a.music(false); a.mix({ stage: 3 }); a.intensity(1); a.duck(); a.setMuted(true);
  for (const n of a.names()) a.play(n, {});
}
globalThis.window = {};
{ const a = createAudio(); a.unlock(); a.play('kill'); a.music(true); a.music(false); }

// 2) stubbed AudioContext: every sfx name, with and without event payloads
globalThis.window = { AudioContext: Ctx };
const a = createAudio();
a.unlock();
const names = a.names();
for (const n of ['shoot', 'kill', 'coin', 'cell', 'card', 'card0', 'card5', 'star', 'star3', 'stinger', 'bossintro', 'groovehit', 'tap', 'buy', 'deny', 'leak', 'pop', 'win']) assert.ok(names.includes(n), 'missing sfx ' + n);
for (const n of names) { a.play(n); a.play(n, {}); a.play(n, { head: true, boss: true, rarity: 5, n: 3 }); }
for (let r = -1; r <= 7; r++) a.play('card', { rarity: r });
for (let i = 0; i < 40; i++) a.play('kill', { head: i % 9 === 0 });
a.play('nonexistent');

// 3) music: both tracks, many stages, mix extremes
const t0 = nodes;
for (const m of [{ stage: 1 }, { stage: 7, groove: 1, danger: 1 }, { stage: 50, boss: true, groove: 0.5, danger: 0.9 }, { stage: 27, groove: 5, danger: -3 }, null]) {
  a.mix(m); a.music(true);
  await new Promise(r => setTimeout(r, 260));
  a.music(false);
}
assert.ok(nodes > t0, 'music scheduled notes');
a.setMuted(true); a.play('kill'); a.music(true); a.music(false); a.setMuted(false);
a.setMusicAllowed(false); a.music(true);
assert.equal(a.musicAllowed, false);

// 4) round 2: every new sfx is wired in main.js / hub2.js, volume setting, motifs
{
  const { readFileSync } = await import('node:fs');
  const { defaultSave, sanitizeSave } = await import('../../cell_serpent/sim.js');
  const rd = f => readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
  const mainSrc = rd('main.js'), hubSrc = rd('hub2.js'), audSrc = rd('audio.js');
  for (const n of ["'tab'", "'toggle'", "'back'", "'tap'", "'deny'", "'stinger'", "'win'", "'star' +"]) assert.ok(mainSrc.includes(n), 'main.js does not play ' + n);
  assert.ok(hubSrc.includes("audio.play('buy')") && hubSrc.includes("audio.play('stinger')"), 'shop does not play buy/stinger');
  assert.ok(audSrc.includes('sfx.riser()') && audSrc.includes('sfx.bossintro()'), 'stage start sounds');
  assert.ok(mainSrc.includes('audio.setVolume') && rd('index.html').includes('volRange'), 'volume wired');
  assert.equal(sanitizeSave({ settings: { volume: 0.4 } }).settings.volume, 0.4);
  assert.equal(sanitizeSave({ settings: { volume: 9 } }).settings.volume, 1);
  assert.equal(sanitizeSave({ settings: { volume: 'x' } }).settings.volume, 1);
  assert.equal(sanitizeSave({}).settings.volume, 1);
  assert.equal(defaultSave().settings.volume, 1);
  const b = createAudio(); b.setVolume(0.3); assert.equal(b.volume, 0.3); b.setVolume(NaN); assert.equal(b.volume, 1);
  assert.equal(new Set(Array.from({ length: 10 }, (_, i) => b.motif(i + 1).join())).size, 10, 'ten distinct motifs');
  for (let i = 1; i <= 10; i++) assert.equal(b.motif(i).length, 4);
  b.unlock(); b.play('tap'); b.play('click'); b.play('riser'); b.setVolume(0.5);
}
console.log('13_audio ok, sfx count', names.length);
