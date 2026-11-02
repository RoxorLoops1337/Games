// Audio mix audit by offline analysis (nobody can listen here): a recording fake AudioContext captures every voice
// (waveform, start, length, peak gain, bus) and we estimate levels in dBFS from the envelopes. Checks the new muffle,
// the perfect clear and boss phase stingers, the per species music variation and the loudness balance.
import assert from 'node:assert/strict';
import { createAudio } from '../../cell_serpent/audio.js';
import { bossPhaseOf, perfectClear, wantsMuffle, createCues } from '../../cell_serpent/audio_cues.js';
import { SKINS } from '../../cell_serpent/sim.js';

let voices = [], calls = [], clock = 0;
// play the music for `sec` seconds of fake time: the pump timer is stepped by hand every 80 ms, so the schedule is exact
async function runMusic(m, sec) {
  const real = globalThis.setInterval; let cb = null;
  globalThis.setInterval = f => { cb = f; return 0; };
  m.music(true); globalThis.setInterval = real;
  for (let i = 0; i < sec / 0.08; i++) { clock += 0.08; cb(); }
  m.music(false);
}
const param = (log, name) => ({ value: 0, setValueAtTime(v) { this.last = v; this.peak = Math.max(this.peak || 0, v); }, linearRampToValueAtTime(v) { this.peak = Math.max(this.peak || 0, v); },
  exponentialRampToValueAtTime() {}, setTargetAtTime(v, t, k) { if (log) log.push([name, v, t, k]); }, cancelScheduledValues() {} });
const node = kind => {
  const n = { kind, to: null, gain: param(calls, 'gain'), frequency: param(calls, 'freq'), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), type: '' };
  n.connect = x => { n.to = x; };
  n.start = t => { n.t0 = t; if (kind === 'osc' || kind === 'src') voices.push(n); };
  Object.defineProperty(n, 'onended', { set(f) { f(); } });   // voices end at once so the voice cap (40) never thins the capture
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

const WF = { sine: 0.707, triangle: 0.577, square: 1, sawtooth: 0.577 };
function describe(v) {
  let g = v.to; if (v.kind === 'src') { while (g && g.kind === 'filter') g = g.to; }
  const bus = g && g.to; const busGain = bus ? bus.gain.value : 0;
  const peak = (g && g.gain.peak) || 0, wf = v.kind === 'src' ? 0.45 : WF[v.type] || 0.7;
  return { t0: v.t0, t1: v.t1, amp: peak * busGain * 0.5, rms: peak * busGain * 0.5 * wf * 0.45, music: Math.abs(busGain - 0.62) < 1e-9 };
}
const db = x => 20 * Math.log10(Math.max(1e-6, x));
// worst short-term level: the sum of the peaks of voices that overlap within 40 ms, and the worst 1 s RMS window
function analyse(list, win = 1) {
  const d = list.map(describe); if (!d.length) return { peak: 0, rms: 0 };
  const t0 = Math.min(...d.map(x => x.t0)); let peak = 0, rms = 0;
  for (const x of d) { let p = 0; for (const y of d) if (y.t0 <= x.t0 + 0.04 && y.t1 >= x.t0) p += y.amp * Math.exp(-Math.max(0, x.t0 - y.t0) / (0.35 * Math.max(0.02, y.t1 - y.t0))); peak = Math.max(peak, p); }
  const span = Math.max(win, Math.max(...d.map(x => x.t1)) - t0), bins = Math.ceil(span / win);
  for (let b = 0; b < bins; b++) { let e = 0; for (const x of d) { const a = Math.max(x.t0, t0 + b * win), z = Math.min(x.t1, t0 + (b + 1) * win); if (z > a) e += x.rms * x.rms * (z - a); } rms = Math.max(rms, Math.sqrt(e / win)); }
  return { peak, rms, n: d.length };
}

// 1) muffle: closes the music lowpass and the music bus, opens them again, and survives having no AudioContext
{
  const a = createAudio(); a.muffle(true); a.muffle(false);   // before the context exists: no throw
  a.unlock(); calls.length = 0; clock = 1;
  assert.equal(a.muffled, false);
  a.muffle(true); assert.equal(a.muffled, true);
  const closeF = calls.filter(c => c[0] === 'freq').pop(); assert.ok(closeF && closeF[1] <= 800 && closeF[1] >= 300, 'lowpass closes to a muffled cutoff');
  const closeG = calls.filter(c => c[0] === 'gain').pop(); assert.ok(closeG[1] < 0.62, 'music bus dips');
  const n0 = calls.length; a.muffle(true); assert.equal(calls.length, n0, 'same state is a no-op');
  a.muffle(false); const openF = calls.filter(c => c[0] === 'freq').pop(); assert.ok(openF[1] >= 15000, 'lowpass opens again');
  assert.ok(openF[3] > closeF[3], 'opens slower than it closes');
  const b = createAudio(); b.muffle(true); b.unlock(); assert.equal(b.muffled, true, 'muffle asked before the context exists is kept');
}
assert.equal(wantsMuffle('pause', null), true); assert.equal(wantsMuffle('play', { phase: 'levelup' }), true);
assert.equal(wantsMuffle('play', { phase: 'play' }), false); assert.equal(wantsMuffle('hub', null), false); assert.equal(wantsMuffle('play', null), false);

// 2) boss phase and perfect clear detection
const seg = hp => ({ hp });
const boss = (alive, total) => ({ snakes: [{ boss: true, segs: [seg(9), ...Array.from({ length: total }, (_, i) => seg(i < alive ? 5 : 0))] }] });
assert.equal(bossPhaseOf(boss(40, 40)), 0); assert.equal(bossPhaseOf(boss(20, 40)), 1); assert.equal(bossPhaseOf(boss(10, 40)), 2); assert.equal(bossPhaseOf({ snakes: [] }), 0);
assert.equal(bossPhaseOf({ snakes: [{ boss: false, segs: [seg(1), seg(0)] }] }), 0);
assert.equal(perfectClear({ revivesUsed: 0, revived: false, faceMax: 0.5 }), true);
assert.equal(perfectClear({ revivesUsed: 1, revived: true, faceMax: 0.5 }), false);
assert.equal(perfectClear({ revivesUsed: 0, revived: false, faceMax: 0.9 }), false);
assert.equal(perfectClear({ revivesUsed: 0, revived: false, faceMax: 0.1, hard: true }), false);
{
  const played = []; const cues = createCues({ play: (n, e) => played.push(n + (e ? e.n || '' : '')) });
  const g = { ...boss(40, 40), phase: 'play', faceMax: 0.2, revivesUsed: 0, stage: 5 };
  assert.equal(cues.tick(g), 0);
  g.snakes[0].segs.forEach((s, i) => { if (i > 14) s.hp = 0; }); assert.equal(cues.tick(g), 1);
  cues.tick(g); assert.deepEqual(played, ['bossphase1'], 'phase 1 stinger plays once');
  g.snakes[0].segs.forEach((s, i) => { if (i > 5) s.hp = 0; }); assert.equal(cues.tick(g), 2); assert.deepEqual(played, ['bossphase1', 'bossphase2']);
  g.snakes = []; g.phase = 'clear'; cues.tick(g); cues.tick(g); assert.deepEqual(played, ['bossphase1', 'bossphase2', 'perfect'], 'perfect plays once');
  const h = { snakes: [], phase: 'clear', faceMax: 0.95, revivesUsed: 0, stage: 2 }; cues.tick(h); assert.equal(played.length, 3, 'a scrappy clear gets no perfect stinger');
}

// 3) offline levels of every sfx, new stingers against the old clear
const a = createAudio(); a.unlock();
const level = {};
for (const n of a.names()) {
  voices = []; clock += 5; a.play(n, { head: true, rarity: 3, n: 2, src: 'capsule', f: 0.5 });
  level[n] = analyse(voices); await new Promise(r => setTimeout(r, 4));   // let the voices end so the voice cap never silences a later sfx
}
const loud = Object.entries(level).sort((x, y) => y[1].peak - x[1].peak).slice(0, 6).map(([k, v]) => `${k}:${db(v.peak).toFixed(1)}`).join(' ');
for (const [n, v] of Object.entries(level)) assert.ok(v.peak < 0.9, `${n} peak ${db(v.peak).toFixed(1)} dBFS would hit the limiter hard`);
assert.ok(level.perfect.peak > 0 && level.bossphase.peak > 0, 'new stingers make sound');
assert.ok(db(level.perfect.peak) < db(level.clear.peak) + 6 && db(level.perfect.peak) > db(level.clear.peak) - 14, 'perfect sits near the clear jingle');
assert.ok(db(level.bossphase.peak) <= db(level.bossintro.peak) + 1, 'boss phase is not louder than the boss intro');

// 4) music: loudness per species, sfx sits above the music, species differ
const musicLevel = {}, sig = {};
for (const [stage, skin, groove] of [[1, 'love', 1], [2, 'rust', 1], [3, 'sneezy', 1], [4, 'grumpy', 1], [5, 'sleepy', 1], [6, 'disco', 1], [7, 'sour', 1], [8, 'mighty', 1], [9, 'frosty', 1], [10, 'gloomy', 1], [10, 'gloomy', 0.1]]) {
  voices = [];
  const m = createAudio(); m.unlock(); m.mix({ stage, skin, groove, danger: 0 }); await runMusic(m, 16);
  const mv = voices.filter(v => describe(v).music);
  const key = skin + groove; musicLevel[key] = analyse(mv);
  sig[key] = mv.map(v => v.type).join('').length + ':' + [...new Set(mv.map(v => v.type))].sort().join('/') + ':' + mv.filter(v => v.kind === 'src').length;
  assert.ok(mv.length > 20, 'music scheduled for ' + skin);
}
const rows = Object.entries(musicLevel).map(([k, v]) => `${k}:rms${db(v.rms).toFixed(1)}/pk${db(v.peak).toFixed(1)}`).join(' ');
if (process.env.AUDIO_REPORT) console.log(rows, "\nsfx", loud);
for (const [k, v] of Object.entries(musicLevel)) {
  assert.ok(db(v.rms) < -17 && db(v.rms) > -50, `${k} music rms ${db(v.rms).toFixed(1)} dBFS in range`);
  assert.ok(v.peak < 0.35, `${k} music peaks stay below the sfx`);
}
const musicRmsMax = Math.max(...Object.values(musicLevel).map(v => v.rms));
for (const n of ['kill', 'coin', 'clear', 'perfect', 'levelup', 'bossphase']) assert.ok(level[n].peak > musicRmsMax * 1.6, `${n} peak stays 4 dB above the loudest music rms`);
const full = Object.entries(musicLevel).filter(([k]) => k.endsWith('1')).map(([, v]) => db(v.rms));
assert.ok(Math.max(...full) - Math.min(...full) < 6, 'species grooves stay within 6 dB of each other');
const flavours = new Set(Object.entries(sig).filter(([k]) => k.endsWith('1')).map(([, v]) => v));
assert.ok(flavours.size >= 7, 'at least 7 distinct species grooves, got ' + flavours.size);
assert.equal(SKINS.length, 10);

// 5) boss phases change the boss groove
const bossSig = {};
for (const bphase of [0, 1, 2]) {
  voices = []; const m = createAudio(); m.unlock(); m.mix({ stage: 10, boss: true, groove: 0.5, danger: 0, bphase }); await runMusic(m, 16);
  const mv = voices.filter(v => describe(v).music); bossSig[bphase] = { n: mv.length, lvl: analyse(mv) };
}
assert.ok(bossSig[1].n > bossSig[0].n && bossSig[2].n > bossSig[1].n, 'later boss phases are busier');
assert.ok(bossSig[2].lvl.rms >= bossSig[0].lvl.rms * 0.97, 'phase 2 groove is not quieter than phase 0');
assert.ok(db(bossSig[2].lvl.rms) < -14, 'boss groove stays under the sfx: ' + db(bossSig[2].lvl.rms).toFixed(1));
if (process.env.AUDIO_REPORT) console.log('loudest sfx (peak dBFS):', loud, '\nmusic:', rows, '\nboss:', JSON.stringify({ 0: [bossSig[0].n, db(bossSig[0].lvl.rms)], 1: [bossSig[1].n, db(bossSig[1].lvl.rms)], 2: [bossSig[2].n, db(bossSig[2].lvl.rms)] }));
