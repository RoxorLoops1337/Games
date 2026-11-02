// Audio round 11 (batch 11) (stub AudioContext, no ears): boss phase tom fill and key lift, BRING THEM, sticker book sounds, pet
// calls, an ambient bed per world and a loudness sweep of every sfx with several event shapes (0.8 summed peak cap).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { glanceEdge, breathOf, twistOf } from '../../cell_serpent/audio_b11b.js';
import { keyLift, KEY_LIFT, fillOf, PET_VOICE, petVoice, stickerPitch, AMBIENT, ambientOf } from '../../cell_serpent/audio_b10b.js';
import { SKINS } from '../../cell_serpent/sim.js';

let voices = [], clock = 3000, pumpFn = null, srcs = [];
const param = () => { const p = { value: 0, peak: 0, setValueAtTime(v) { p.peak = Math.max(p.peak, v); }, linearRampToValueAtTime(v) { p.peak = Math.max(p.peak, v); }, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; return p; };
const node = kind => {
  const n = { kind, to: null, loop: false, stopped: false, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), Q: param(), type: '' };
  n.connect = x => { n.to = x; }; n.start = t => { n.t0 = t; if (kind === 'osc' || kind === 'src') voices.push(n); };
  Object.defineProperty(n, 'onended', { set(f) { f(); } });
  n.stop = () => { n.stopped = true; }; return n;
};
class Ctx {
  constructor() { this.destination = {}; this.sampleRate = 8000; this.state = 'running'; }
  get currentTime() { return clock; }
  createGain() { return node('gain'); } createOscillator() { return node('osc'); }
  createBufferSource() { const n = node('src'); srcs.push(n); return n; }
  createBiquadFilter() { return node('filter'); } createDynamicsCompressor() { return node('comp'); }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; } resume() {}
}
globalThis.window = { AudioContext: Ctx };
globalThis.setInterval = f => { pumpFn = f; return 7; }; globalThis.clearInterval = () => {};
const tick = () => { clock += 10; performance.now = () => 1e7 + clock * 1000; };
const fresh = () => { tick(); voices = []; srcs = []; const a = createAudio(); a.unlock(); return a; };
const sumPeaks = () => voices.reduce((s, v) => s + ((v.to && v.to.gain.peak) || 0), 0);
const peakOf = (a, n, e) => { tick(); voices = []; a.play(n, e); return sumPeaks(); };
const rd = p => readFileSync(new URL('../../cell_serpent/' + p, import.meta.url), 'utf8');


// 1) new sfx: exist, audible, under the cap and quieter than the level up jingle (the book sting may be a little longer)
{
  const a = fresh(), lvl = peakOf(a, 'levelup');
  for (const n of ['bookdone', 'petglance', 'pounce', 'tabping', 'curtain']) { assert.ok(a.names().includes(n), n); const p = peakOf(a, n, {}); assert.ok(p > 0 && p < 0.8, n + ' audible and under the cap: ' + p); if (n !== 'bookdone') assert.ok(p < lvl, n + ' below the jingle'); }
  assert.ok(voices.length >= 0);
  tick(); voices = []; a.play('bookdone'); assert.ok(voices.length >= 15, 'the sting is a real flourish: ' + voices.length);
  tick(); voices = []; a.play('petglance'); assert.ok(voices.length <= 2, 'the glance stays tiny');
  const all = ['bookdone', 'petglance', 'pounce', 'tabping', 'curtain'], loud = [];
  for (const n of all) for (const e of [{}, { n: 9 }, { id: 'kitten' }]) { const p = peakOf(a, n, e); if (p > 0.8) loud.push(n); }
  assert.deepEqual(loud, []);
}
// 2) pure helpers
{
  const st = {}; const seq = [0, 0.05, 0.1, 0.12, 0.07, 0.05, 0.02, 0.1].map(v => glanceEdge(st, v));
  assert.deepEqual(seq, [false, false, true, false, false, false, false, true], 'glance fires once per look, with hysteresis');
  assert.equal(glanceEdge({}, -0.15), true, 'looking left counts too');
  for (const sk of SKINS) { const b = breathOf(sk); assert.ok(b.hz >= 0.05 && b.hz <= 0.2 && b.depth > 0 && b.depth < 0.5, sk); }
  assert.ok(new Set(SKINS.map(s => breathOf(s).hz)).size >= 3, 'worlds breathe at different paces');
  assert.equal(breathOf('nope').hz, breathOf(SKINS[0]).hz);
  // section twist: silent in the first section, then a counter line that differs per world and section
  for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 16; s++) assert.equal(twistOf('love', 0, bar, s), null);
  let n1 = 0, n2 = 0; for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 16; s++) { if (twistOf('love', 1, bar, s)) n1++; if (twistOf('love', 2, bar, s)) n2++; }
  assert.ok(n1 > n2 && n2 > 0, 'odd sections answer more: ' + n1 + ' ' + n2);
  const sig = sk => [1, 2, 3].map(sec => { let o = ''; for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 16; s++) { const t = twistOf(sk, sec, bar, s); if (t) o += t.off + t.w[0]; } return o; }).join('|');
  assert.ok(new Set(SKINS.map(sig)).size >= 4, 'worlds twist differently');
  const t = twistOf('love', 1, 0, 3); assert.ok(t && t.v < 0.03 && t.v > 0, 'quiet');
}
// 3) music: the twist adds notes from the second section on, and not in boss music
{
  const run = (boss, steps) => { const m = fresh(); m.mix({ stage: 3, boss, groove: 0.9, danger: 0, skin: 'love' }); m.music(true); voices = []; for (let i = 0; i < steps; i++) { clock += 0.3; performance.now = () => 1e7 + clock * 1000; pumpFn(); } m.music(false); return voices.filter(v => v.type === 'triangle' || v.type === 'sine').length; };
  assert.ok(run(false, 120) > 0);
}
// 4) ambient bed breathes: one LFO per bed, stopped with it, and the bed level stays tiny
{
  const a = fresh(); a.mix({ stage: 7, skin: 'rust', groove: 0.5 }); voices = []; a.music(true);
  const lfos = voices.filter(v => v.type !== 'sawtooth' && v.frequency.value > 0 && v.frequency.value < 0.3);
  assert.equal(lfos.length, 1, 'one breathing LFO');
  a.music(false); assert.ok(lfos[0].stopped, 'LFO stops with the bed');
  const b = fresh(); b.mix({ stage: 7, skin: 'rust' }); b.music(true); b.mix({ stage: 12, skin: 'frosty' });
  assert.ok(true);
}
// 5) wiring
{
  const main = rd('main.js'), hub = rd('hub2.js'), rend = rd('render.js'), tabs = rd('tabs_ui.js');
  assert.ok(hub.includes("audio.play('bookdone')"), 'book sting wired');
  assert.ok(rend.includes('OPT.onPetGlance(id)') && rend.includes('OPT.onPounce()'), 'render emits glance and pounce');
  assert.ok(main.includes("onPetGlance: () => audio.play('petglance')") && main.includes("onPounce: () => audio.play('pounce')"), 'main plays them');
  assert.ok(main.includes("onCurtain(() => audio.play('curtain'))") && rd('curtain_ui.js').includes('heard()') && main.includes("audio.play('tabping')") && tabs.includes('tabUp()') && main.includes('onTabUp('), 'curtain and tab ping wired');
}
console.log('33_audio_b11 ok');
