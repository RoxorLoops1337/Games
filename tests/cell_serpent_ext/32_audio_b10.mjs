// Audio round 10 (stub AudioContext, no ears): boss phase tom fill and key lift, BRING THEM, sticker book sounds, pet
// calls, an ambient bed per world and a loudness sweep of every sfx with several event shapes (0.8 summed peak cap).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { keyLift, KEY_LIFT, fillOf, PET_VOICE, petVoice, stickerPitch, AMBIENT, ambientOf } from '../../cell_serpent/audio_b10.js';
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

// 1) boss phase: a tom fill after the old hit, longer in phase 2, and the music root climbs a step per phase
{
  assert.deepEqual(KEY_LIFT, [0, 2, 3]); assert.equal(keyLift(-3), 0); assert.equal(keyLift(9), 3);
  assert.ok(fillOf(2).length > fillOf(1).length && fillOf(1).every(([f, d]) => f > 80 && d > 0.2));
  const a = fresh();
  const p1 = (peakOf(a, 'bossphase', { n: 1 }), voices.length), p2 = (peakOf(a, 'bossphase', { n: 2 }), voices.length);
  assert.ok(p1 >= 8 && p2 > p1, 'fill adds voices: ' + p1 + ' ' + p2);
  assert.ok(peakOf(a, 'bossphase', { n: 2 }) < 0.8, 'phase 2 stays under the cap');
  // music: the boss bass note climbs with the phase (same bar, same step, higher pitch)
  const bassHz = bp => {
    const m = fresh(); m.mix({ stage: 10, boss: true, groove: 0.5, danger: 0, skin: 'mighty', bphase: bp }); m.music(true);
    voices = []; for (let i = 0; i < 6; i++) { clock += 0.3; performance.now = () => 1e7 + clock * 1000; pumpFn(); }
    m.music(false); return Math.min(...voices.filter(v => v.type === 'sawtooth').map(v => v.frequency.peak).filter(f => f > 30));
  };
  const b0 = bassHz(0), b1 = bassHz(1), b2 = bassHz(2);
  assert.ok(b1 > b0 && b2 > b1, 'key lifts per phase: ' + [b0, b1, b2]);
}

// 2) BRING THEM, sticker book, pet calls: exist, are audible and quiet, and are wired
{
  const a = fresh(), lvl = peakOf(a, 'levelup');
  for (const n of ['bringpack', 'bringundo', 'stickertap', 'stickernew', 'petcall']) { assert.ok(a.names().includes(n), n); const p = peakOf(a, n, { got: true, i: 2, n: 3, id: 'puppy' }); assert.ok(p > 0 && p < lvl, n + ' audible, below the level up jingle: ' + p); }
  assert.ok(peakOf(a, 'stickertap', { got: true, i: 0 }) !== peakOf(a, 'stickertap', { got: false }), 'locked sticker sounds different');
  assert.ok(stickerPitch(1) > stickerPitch(0) && stickerPitch(4) > stickerPitch(3), 'sticker bells climb');
  assert.deepEqual(Object.keys(PET_VOICE).sort(), ['hamster', 'kitten', 'lamb', 'piglet', 'puppy', 'turtle']);
  assert.equal(petVoice('dragon'), PET_VOICE.kitten);
  assert.equal(new Set(Object.values(PET_VOICE).map(v => v.x)).size, 6, 'each pet has its own colour');
  const counts = Object.keys(PET_VOICE).map(id => { tick(); voices = []; a.play('petcall', { id }); return voices.length; });
  assert.ok(counts.every(c => c >= 1), 'every pet makes a sound: ' + counts);
  const main = rd('main.js'), rb = rd('build_rec.js'), hub = rd('hub2.js'), rend = rd('render.js');
  assert.ok(main.includes("audio.play('bringpack')") && rb.includes("'bringundo' : 'bringpack'"), 'BRING THEM wired');
  assert.ok(hub.includes("'stickertap'") && hub.includes("'stickernew'"), 'sticker book wired');
  assert.ok(main.includes("onPetCall: id => audio.play('petcall', { id })") && rend.includes('OPT.onPetCall(id)'), 'pet calls wired');
}

// 3) ambient bed per world: starts with the run music, follows the world, stops with the music and with mute
{
  for (const sk of SKINS) { const m = AMBIENT[sk]; assert.ok(m && m.v > 0 && m.v <= 0.02 && m.f > 50, sk + ' ambient'); }
  assert.equal(ambientOf('nope'), AMBIENT.love);
  assert.equal(new Set(SKINS.map(s => AMBIENT[s].t + AMBIENT[s].f)).size, SKINS.length, 'each world has its own bed');
  const a = fresh(); a.mix({ stage: 7, skin: 'rust', groove: 0.5 }); srcs = [];
  a.music(true);
  const bed = () => srcs.filter(s => s.loop && !s.stopped);
  assert.equal(bed().length, 1, 'one looping bed while the music plays');
  a.mix({ stage: 12, skin: 'frosty', groove: 0.5 });
  assert.equal(srcs.filter(s => s.loop).length, 2, 'a new world swaps the bed'); assert.equal(bed().length, 1);
  a.music(false); assert.equal(bed().length, 0, 'bed stops with the music');
  a.music(true); assert.equal(bed().length, 1); a.setMuted(true); assert.equal(bed().length, 0, 'mute stops the bed');
  const g = fresh(); g.music(true); assert.ok(srcs.some(s => s.loop), 'default world still gets a bed');
}

// 4) loudness: every sfx, under several event shapes, stays under the 0.8 summed peak cap
{
  const a = fresh(), shapes = [{ n: 1 }, { n: 2, skin: 'love', head: false, i: 1, cell: 3 }, { n: 3, head: true, rarity: 3, src: 'capsule', f: 0.5 }, { i: 4, id: 'turtle', got: true }, { n: 10, skin: 'mighty', boss: true, src: 'maw' }];
  const loud = [];
  for (const n of a.names()) for (const e of shapes) { const p = peakOf(a, n, e); if (p > 0.8) loud.push(n + ':' + p.toFixed(2)); }
  assert.deepEqual(loud, [], 'above the cap: ' + loud.join(';'));
}
console.log('32_audio_b10 ok');
