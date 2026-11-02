// Audio round 5 (nobody can listen here, so everything is checked offline with a recording fake AudioContext; the real
// OfflineAudioContext only exists in browsers): kick sidechain pump on the pad, the metronome without music, the streak
// milestone burst, the sheet open/close and slider sounds, and loudness of all of them against the existing mix.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudio } from '../../cell_serpent/audio.js';
import { pumpDepth, pumpEnv } from '../../cell_serpent/audio_pump.js';
import { sheetSound } from '../../cell_serpent/audio_cues.js';
import { beatBpm } from '../../cell_serpent/sim.js';

let voices = [], clock = 100;
const param = () => { const p = { value: 0, pts: [], peak: 0, setValueAtTime(v, t) { p.pts.push([t, v]); p.peak = Math.max(p.peak, v); }, linearRampToValueAtTime(v, t) { p.pts.push([t, v]); p.peak = Math.max(p.peak, v); },
  exponentialRampToValueAtTime(v, t) { p.pts.push([t, v]); }, setTargetAtTime() {}, cancelScheduledValues() {} }; return p; };
const node = kind => {
  const n = { kind, to: null, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), type: '' };
  n.connect = x => { n.to = x; };
  n.start = t => { n.t0 = t; if (kind === 'osc' || kind === 'src') voices.push(n); };
  Object.defineProperty(n, 'onended', { set(f) { f(); } });
  n.stop = t => { n.t1 = t; };
  return n;
};
class Ctx {
  constructor() { this.destination = {}; this.sampleRate = 8000; this.state = 'running'; }
  get currentTime() { return clock; }
  createGain() { return node('gain'); } createOscillator() { return node('osc'); } createBufferSource() { return node('src'); }
  createBiquadFilter() { return node('filter'); } createDynamicsCompressor() { return node('comp'); }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  resume() {}
}
globalThis.window = { AudioContext: Ctx };
const realSI = globalThis.setInterval, realCI = globalThis.clearInterval;
let pumpFn = null;
globalThis.setInterval = f => { pumpFn = f; return 7; };
globalThis.clearInterval = () => { pumpFn = null; };
const run = sec => { for (let i = 0; i < sec / 0.08; i++) { clock += 0.08; if (pumpFn) pumpFn(); } };
const f0 = v => (v.frequency.pts[0] || [0, 0])[1];

// 1) the pure envelope: dip on t = 0 and on every beat, back to full between, depth follows groove and boss
{
  assert.ok(pumpDepth(0, false) > pumpDepth(1, false), 'more groove pumps deeper');
  assert.ok(pumpDepth(1, true) < pumpDepth(1, false), 'bosses pump deeper');
  for (const l of [-1, 0, 0.5, 1, 9]) for (const b of [false, true]) { const d = pumpDepth(l, b); assert.ok(d >= 0.2 && d <= 0.6, 'depth in range ' + d); }
  const beat = 0.5, vol = 0.03, pts = pumpEnv(vol, 1.9, beat, 0.3);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i][0] >= pts[i - 1][0], 'times never go backwards');
  const at = t => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + (b[1] - a[1]) * (t - a[0]) / Math.max(1e-9, b[0] - a[0]); } return pts[pts.length - 1][1]; };
  for (const k of [0, 1, 2, 3]) { assert.ok(at(k * beat + 0.012) <= vol * 0.4, 'dip on beat ' + k); assert.ok(k === 3 || at(k * beat + 0.35) >= vol * 0.99, 'full again before beat ' + (k + 1)); }
  assert.equal(Math.max(...pts.map(p => p[1])), vol, 'never louder than the unpumped note');
  assert.ok(pts[pts.length - 1][1] < 0.001, 'ends silent');
}

// 2) in the real music the pad breathes: every kick has a dip in each pad voice that is sounding
{
  voices = []; const a = createAudio(); a.unlock(); a.mix({ stage: 1, skin: 'love', groove: 1, danger: 0 }); a.music(true); run(10); a.music(false);
  const kicks = voices.filter(v => v.kind === 'osc' && f0(v) === 150).map(v => v.t0);
  const pads = voices.filter(v => v.kind === 'osc' && v.to && v.to.gain.pts.length > 8);
  assert.ok(kicks.length >= 8, 'kicks are scheduled');
  assert.ok(pads.length >= 3, 'pad notes use the pumped envelope: ' + pads.length);
  const valueAt = (pts, t) => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [p, q] = [pts[i - 1], pts[i]]; return p[1] + (q[1] - p[1]) * (t - p[0]) / Math.max(1e-9, q[0] - p[0]); } return pts[pts.length - 1][1]; };
  let checked = 0;
  for (const p of pads.filter(x => x.t0 > 101)) { const pts = p.to.gain.pts, vol = p.to.gain.peak;
    for (const k of kicks) if (k >= p.t0 && k < p.t1 - 0.3 && Math.abs(((k - p.t0) / (60 / beatBpm(1)) + 0.5) % 1 - 0.5) < 0.01) { checked++; assert.ok(valueAt(pts, k + 0.012) <= vol * 0.56, 'pad dips with the kick at ' + k.toFixed(2)); } }
  assert.ok(checked >= 6, 'enough kick and pad overlaps were checked: ' + checked);
  const bus = pads[0].to.to; assert.ok(Math.abs(bus.gain.value - 0.62) < 1e-9, 'pad still goes through the music bus');
}

// 3) the metronome works with the music off
{
  const spb = 60 / beatBpm(1);
  voices = []; const a = createAudio(); a.unlock(); a.mix({ stage: 1 }); a.setMusicAllowed(false); a.setBeatTick(true);
  assert.equal(a.tickOnly, false, 'nothing runs before a run starts');
  a.music(true); assert.equal(a.tickOnly, true); run(8);
  const ticks = voices.filter(v => v.kind === 'osc' && (f0(v) === 988 || f0(v) === 1319));
  assert.ok(voices.every(v => ticks.includes(v)), 'only metronome voices, no music at all (' + voices.length + ')');
  assert.ok(ticks.length >= Math.floor(8 / spb) - 1, 'one tick per beat: ' + ticks.length);
  const gaps = ticks.slice(2).map((v, i) => v.t0 - ticks[i + 1].t0); for (const g of gaps) assert.ok(Math.abs(g - spb) < 0.01, 'even beat spacing ' + g + ' ' + ticks.map(v => v.t0.toFixed(2)));
  assert.ok(ticks.some(v => f0(v) === 1319), 'bar line accent');
  assert.ok(a.beat() && Math.abs(a.beat().bpm - beatBpm(1)) < 1e-6, 'the screen edge pulse still gets the beat');
  const n = voices.length; a.setBeatTick(false); assert.equal(a.tickOnly, false); run(2); assert.equal(voices.length, n, 'tick off stops the metronome');
  a.setBeatTick(true); assert.equal(a.tickOnly, true, 'tick on again restarts it while the run goes on');
  a.setMusicAllowed(true); assert.equal(a.tickOnly, false); const m = voices.length; run(6); assert.ok(voices.length > m + 15, 'music back on plays the full groove');
  a.music(false); const z = voices.length; run(2); assert.equal(voices.length, z, 'nothing plays after the run');
  // tick off and music off: silence
  const b = createAudio(); b.unlock(); b.setMusicAllowed(false); voices = []; b.music(true); run(4); assert.equal(voices.length, 0, 'music off and tick off is silent');
  // muted metronome is silent
  const c = createAudio(); c.unlock(); c.setMusicAllowed(false); c.setBeatTick(true); c.setMuted(true); voices = []; c.music(true); run(4); assert.equal(voices.length, 0, 'muted is silent');
}

// 4) streak milestones: every 10th on-beat shot bursts, and the burst is louder with each tier but stays under the clear jingle
const WF = { sine: 0.707, triangle: 0.577, square: 1, sawtooth: 0.577 };
const peakOf = list => { const d = list.map(v => ({ t0: v.t0, t1: v.t1, amp: (v.to ? v.to.gain.peak : 0) * 0.72 * 0.5 })); let pk = 0;
  for (const x of d) { let p = 0; for (const y of d) if (y.t0 <= x.t0 + 0.04 && y.t1 >= x.t0) p += y.amp * Math.exp(-Math.max(0, x.t0 - y.t0) / (0.35 * Math.max(0.02, y.t1 - y.t0))); pk = Math.max(pk, p); } return pk; };
const db = x => 20 * Math.log10(Math.max(1e-6, x));
{
  const a = createAudio(); a.unlock(); a.mix({ stage: 1 }); a.music(true); run(0.5);
  const realNow = performance.now.bind(performance); let tr = realNow() + 1e6; performance.now = () => tr;
  const per = 60 / beatBpm(1) * 1000, counts = [];
  for (let i = 1; i <= 31; i++) { tr += per; voices = []; a.play('beatshot'); counts.push(voices.length); }
  performance.now = realNow; a.music(false);
  const base = counts[0]; assert.ok(base >= 1, 'a beat shot ticks');
  for (const i of [9, 19, 29]) assert.ok(counts[i] > base + 4, `shot ${i + 1} bursts (${counts[i]} voices)`);
  assert.ok(counts[10] <= base + 1 && counts[14] <= base + 1, 'no burst between milestones');
  const lv = {}; const b = createAudio(); b.unlock();
  for (const n of [10, 20, 30]) { voices = []; clock += 5; b.play('streakburst', { n }); lv[n] = peakOf(voices); assert.ok(voices.length >= 6); }
  voices = []; clock += 5; b.play('clear'); const clr = peakOf(voices);
  assert.ok(lv[10] < lv[20] * 1.01 && lv[20] <= lv[30] * 1.5, 'bigger tiers are not quieter');
  for (const n of [10, 20, 30]) { assert.ok(lv[n] < 0.9, 'no clipping'); assert.ok(db(lv[n]) < db(clr) + 1, `burst ${n} (${db(lv[n]).toFixed(1)} dB) stays near or under the clear jingle (${db(clr).toFixed(1)} dB)`); }
  assert.ok(db(lv[30]) > db(clr) - 22, 'the biggest burst is still clearly audible');
  assert.ok(b.names().includes('streakburst'));
}

// 5) ui sounds: sheets open and close, the slider ticks, all quiet and short
{
  assert.equal(sheetSound('', 'pause'), 'open'); assert.equal(sheetSound('pause', ''), 'close'); assert.equal(sheetSound('settings', 'title'), 'close');
  assert.equal(sheetSound('panel', 'panel'), null); assert.equal(sheetSound('', 'result'), null); assert.equal(sheetSound('hub', 'levelup'), null);
  assert.equal(sheetSound('levelup', ''), null); assert.equal(sheetSound('boxModal', 'hub'), 'close'); assert.equal(sheetSound('pause', 'settings'), 'open');
  const a = createAudio(); a.unlock(); const lv = {};
  for (const n of ['open', 'close', 'slide', 'tap']) { voices = []; clock += 3; a.play(n, { f: 0.5 }); lv[n] = peakOf(voices); assert.ok(voices.length >= 1, n + ' makes sound'); assert.ok(voices.every(v => v.t1 - v.t0 < 0.3), n + ' is short'); }
  assert.ok(lv.open < 0.2 && lv.close < 0.2 && lv.slide < 0.2, 'sheet and slider sounds are quiet');
  assert.ok(db(lv.open) < db(lv.tap) + 4 && db(lv.close) < db(lv.tap) + 4, 'sheet sweeps sit near the tap, not above it');
  await new Promise(r => setTimeout(r, 70)); voices = []; a.play('slide', { f: 0 }); const lo = f0(voices[0]); await new Promise(r => setTimeout(r, 70)); voices = []; a.play('slide', { f: 1 }); assert.ok(f0(voices[0]) > lo, 'slider pitch follows the value');
}

// 6) wiring, and no em dash in what this round wrote
{
  const main = readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8'), hud = readFileSync(new URL('../../cell_serpent/hud.js', import.meta.url), 'utf8');
  const aud = readFileSync(new URL('../../cell_serpent/audio.js', import.meta.url), 'utf8'), pump = readFileSync(new URL('../../cell_serpent/audio_pump.js', import.meta.url), 'utf8');
  assert.ok(main.includes('sheetSound(shownId, id)') && main.includes("audio.play('slide'"), 'main wires the sheet and slider sounds');
  assert.ok(hud.includes('T.bsMs') && hud.includes('T.bsB'), 'hud bursts at the same milestones');
  assert.ok(aud.includes('pumpTone(') && aud.includes("bstreak % 10 === 0"));
  assert.ok(!/—/.test(aud + pump + hud));
  assert.equal(typeof OfflineAudioContext, 'undefined', 'node has no OfflineAudioContext, so the fake recorder is the loudness check here');
}
globalThis.setInterval = realSI; globalThis.clearInterval = realCI;
