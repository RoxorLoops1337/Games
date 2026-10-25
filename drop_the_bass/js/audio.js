// audio.js: procedural Web Audio for DROP THE BASS. No audio files. Safe with no AudioContext (every call is a no-op).
// API (see CLAUDE.md): AudioFx.init/resume/setVolume/getVolume/mute/play/musicStart/musicStop/musicIntensity/musicDuck/beatInfo/onBeat.
// Extras: AudioFx.isReady(), AudioFx.current() (playing track id), AudioFx.sfxNames, AudioFx.trackIds, and test hooks _attach/_tick/_state.
// Design: master -> compressor -> destination. Music: track gain -> duck -> music bus. Sfx: per play gain (+pan) -> sfx bus.
// Music is a look-ahead step sequencer (16 steps a bar, swing), layers join as intensity rises. Beat events fire when the audio clock reaches them.

export const SFX_NAMES = ['ui_click', 'ui_back', 'ui_open', 'ui_tab', 'coin', 'diamond', 'record', 'deploy', 'merge', 'merge_big', 'sell',
  'shoot_kick', 'shoot_snare', 'shoot_hat', 'shoot_sub', 'shoot_mic', 'shoot_synth', 'shoot_scratch', 'shoot_cowbell', 'shoot_horn', 'shoot_vocal',
  'hit', 'crit', 'kill', 'kill_big', 'leak', 'wave_start', 'wave_clear', 'boss_warn', 'boss_die', 'hero_roxor', 'hero_jasmin', 'duet', 'levelup',
  'remix_pick', 'relic', 'chest', 'crate_shake', 'crate_open', 'reveal_common', 'reveal_rare', 'reveal_epic', 'reveal_legendary', 'reveal_mythic',
  'win', 'lose', 'error', 'countdown', 'tick', 'achievement', 'typewriter', 'whoosh', 'jam', 'heal', 'freeze', 'combo', 'reroll', 'star_pop'];

export const TRACK_IDS = ['title', 'hub', 'world_garage', 'world_busk', 'world_club', 'world_festival', 'world_arena', 'boss', 'victory', 'defeat', 'cutscene_warm', 'cutscene_dark'];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------------------------------------ music data
const QUAL = { m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], m: [0, 3, 7, 12], maj: [0, 4, 7, 12], dim: [0, 3, 6, 9], sus: [0, 5, 7, 10] };
const SCALES = { mpent: [0, 3, 5, 7, 10, 12, 15], majpent: [0, 2, 4, 7, 9, 12, 14], dorian: [0, 2, 3, 5, 7, 9, 10, 12] };

// drum patterns: x = hit, o = soft hit, . = rest
const PAT = {
  funk:    { k: 'x..x..x...x..x..', s: '....x..o....x..o', h: 'x.xxx.xxx.xxx.xx', o: '................' },
  groove:  { k: 'x..x...x..x.....', s: '....x.o.....x...', h: 'x.xxx.x.x.xxx.x.', o: '..............x.' },
  house:   { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
  bright:  { k: 'x...x...x...x...', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
  epic:    { k: 'x..x..x...x.x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '................' },
  boss:    { k: 'x.x.x.x.x.x.x.xx', s: '....x.......x.x.', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
  chill:   { k: 'x.....x...x.....', s: '........x.......', h: '..x...x...x...x.', o: '................' },
  sad:     { k: 'x.......x.......', s: '................', h: '.......o.......o', o: '................' },
  fanfare: { k: 'x...x...x...x...', s: '....x.......x.x.', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
  soft:    { k: '................', s: '................', h: '................', o: '................' },
};
// bass: semitones above the chord root (two octaves down), null = rest
const BASS = {
  funk:    [0, null, null, 0, null, null, 12, null, 0, null, 7, null, null, 10, null, null],
  groove:  [0, null, 0, null, null, 7, null, 12, null, 0, null, null, 10, null, 7, null],
  house:   [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 12, null],
  bright:  [0, null, 0, 12, null, 0, null, 12, 0, null, 0, 12, null, 7, null, 12],
  epic:    [0, null, 0, null, 0, null, 7, null, 0, null, 0, null, 10, null, 7, null],
  boss:    [0, 0, null, 0, 0, null, 1, 0, 0, 0, null, 0, 0, null, 6, 5],
  chill:   [0, null, null, null, null, null, 7, null, null, null, 0, null, null, null, null, null],
  sad:     [0, null, null, null, null, null, null, null, 7, null, null, null, null, null, null, null],
  fanfare: [0, null, 0, null, 7, null, 7, null, 0, null, 0, null, 12, null, 7, null],
  soft:    [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
};
// chord stabs: steps and length (steps) and oscillator
const CH = {
  funk: { steps: [3, 6, 10, 13], len: 1.5, wave: 'sawtooth' }, groove: { steps: [2, 7, 10, 14], len: 1.5, wave: 'sawtooth' },
  house: { steps: [2, 6, 10, 14], len: 1.2, wave: 'sawtooth' }, bright: { steps: [0, 3, 6, 8, 11, 14], len: 1.4, wave: 'square' },
  epic: { steps: [0, 8], len: 7, wave: 'sawtooth' }, boss: { steps: [0, 6, 8, 14], len: 3, wave: 'sawtooth' },
  chill: { steps: [0, 10], len: 8, wave: 'triangle' }, sad: { steps: [0], len: 15, wave: 'triangle' },
  fanfare: { steps: [0, 4, 8, 12], len: 3.5, wave: 'square' }, soft: { steps: [0], len: 15, wave: 'triangle' },
};
// arp: chord tone index per sixteenth (0..3, 4..7 = octave up), null = rest
const ARP = {
  funk: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0, 1], groove: [0, null, 2, 1, 3, null, 2, 1, 0, null, 2, 3, 5, null, 3, 2],
  house: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 4, 2, 1, 3], bright: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 3],
  epic: [0, 2, 3, 2, 1, 2, 3, 4, 0, 2, 3, 2, 1, 2, 3, 5], boss: [0, 0, 2, 0, 3, 0, 2, 0, 1, 1, 3, 1, 4, 1, 3, 1],
  chill: [0, null, 2, null, 1, null, 3, null, 0, null, 2, null, 4, null, 3, null], sad: [0, null, null, 1, null, null, 2, null, null, 3, null, null, 2, null, 1, null],
  fanfare: [0, 1, 2, 4, 2, 1, 0, 1, 2, 3, 4, 5, 4, 3, 2, 1], soft: [0, null, null, null, 1, null, null, null, 2, null, null, null, 3, null, null, null],
};

const TRACKS = {
  title:         { bpm: 96,  root: 57, style: 'groove',  prog: [[0, 'm7'], [8, 'maj7'], [3, 'maj7'], [10, 'dom7']], scale: 'mpent',   lead: 'triangle', swing: 0.14, defInt: 0.7, leadMin: 0.5, seed: 3, dens: 55 },
  hub:           { bpm: 92,  root: 53, style: 'chill',   prog: [[0, 'maj7'], [2, 'm7'], [7, 'm7'], [5, 'maj7']],     scale: 'majpent', lead: 'sine',     swing: 0.16, defInt: 0.55, leadMin: 0.4, seed: 5, dens: 40 },
  world_garage:  { bpm: 100, root: 52, style: 'funk',    prog: [[0, 'm7'], [0, 'm7'], [5, 'm7'], [7, 'dom7']],       scale: 'dorian',  lead: 'square',   swing: 0.12, defInt: 0.5, leadMin: 0.8, seed: 7, dens: 50 },
  world_busk:    { bpm: 108, root: 55, style: 'groove',  prog: [[0, 'm7'], [5, 'dom7'], [0, 'm7'], [3, 'maj7']],     scale: 'dorian',  lead: 'triangle', swing: 0.1,  defInt: 0.5, leadMin: 0.75, seed: 11, dens: 55 },
  world_club:    { bpm: 120, root: 57, style: 'house',   prog: [[0, 'm7'], [8, 'maj7'], [3, 'maj7'], [10, 'dom7']],  scale: 'mpent',   lead: 'sawtooth', swing: 0.0,  defInt: 0.5, leadMin: 0.8, seed: 13, dens: 60 },
  world_festival:{ bpm: 126, root: 50, style: 'bright',  prog: [[0, 'maj7'], [7, 'dom7'], [9, 'm7'], [5, 'maj7']],   scale: 'majpent', lead: 'square',   swing: 0.0,  defInt: 0.5, leadMin: 0.7, seed: 17, dens: 65 },
  world_arena:   { bpm: 132, root: 48, style: 'epic',    prog: [[0, 'm'], [8, 'maj'], [3, 'maj'], [10, 'maj']],      scale: 'mpent',   lead: 'sawtooth', swing: 0.0,  defInt: 0.55, leadMin: 0.7, seed: 19, dens: 60 },
  boss:          { bpm: 140, root: 45, style: 'boss',    prog: [[0, 'm'], [1, 'maj'], [0, 'm'], [6, 'dim']],         scale: 'mpent',   lead: 'sawtooth', swing: 0.0,  defInt: 1.0, leadMin: 0.5, seed: 23, dens: 70 },
  victory:       { bpm: 120, root: 55, style: 'fanfare', prog: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [0, 'maj']],     scale: 'majpent', lead: 'square',   swing: 0.0,  defInt: 1.0, leadMin: 0.3, seed: 29, dens: 75 },
  defeat:        { bpm: 70,  root: 50, style: 'sad',     prog: [[0, 'm'], [8, 'maj'], [5, 'm'], [7, 'dom7']],        scale: 'mpent',   lead: 'sine',     swing: 0.0,  defInt: 0.5, leadMin: 0.3, seed: 31, dens: 35 },
  cutscene_warm: { bpm: 80,  root: 55, style: 'soft',    prog: [[0, 'maj7'], [5, 'maj7'], [2, 'm7'], [7, 'dom7']],   scale: 'majpent', lead: 'sine',     swing: 0.0,  defInt: 0.6, leadMin: 0.4, seed: 37, dens: 35 },
  cutscene_dark: { bpm: 66,  root: 46, style: 'soft',    prog: [[0, 'm'], [1, 'maj'], [0, 'm'], [6, 'dim']],         scale: 'mpent',   lead: 'triangle', swing: 0.0,  defInt: 0.55, leadMin: 0.45, seed: 41, dens: 30 },
};

// ------------------------------------------------------------------------------------------------ engine state
let ctx = null, master = null, comp = null, sfxBus = null, musicBus = null, duckG = null, delayIn = null, noiseBuf = null;
let vol = { music: 0.7, sfx: 0.85 }, muted = false;
let music = null, wantTrack = null, timer = null, intTarget = 0.5;
let voiceEnds = [];
let counter = 0;
const lastPlay = {};
const listeners = new Set();
let pendingBeats = [];
let cur = { pitch: 1 };

const hasAC = () => typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext);
const now = () => (ctx ? ctx.currentTime : 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fin = (v, d) => (Number.isFinite(v) ? v : d);

function attach(c) {
  ctx = c;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.18;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx * 1.35; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = vol.music * 0.8; musicBus.connect(master);
  duckG = ctx.createGain(); duckG.gain.value = 1; duckG.connect(musicBus);
  // shared echo for lead and arp
  delayIn = ctx.createGain(); delayIn.gain.value = 1;
  const dl = ctx.createDelay(2); dl.delayTime.value = 0.375;
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  delayIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(duckG);
  // noise buffer, 2 seconds, deterministic LCG
  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
  if (wantTrack) { const w = wantTrack; wantTrack = null; musicStart(w); }
}

// ------------------------------------------------------------------------------------------------ voice helpers
function activeVoices(t) {
  let j = 0;
  for (let i = 0; i < voiceEnds.length; i++) if (voiceEnds[i] > t) voiceEnds[j++] = voiceEnds[i];
  voiceEnds.length = j;
  return j;
}

// oscillator with envelope. f1 optional glide target. o: attack, detune, filter {type,f,q}, vib {rate,depth}
function tone(out, type, f0, f1, t, dur, v, o) {
  o = o || {};
  const osc = ctx.createOscillator();
  osc.type = type;
  const fa = clamp(fin(f0, 440) * cur.pitch, 20, 18000), fb = clamp(fin(f1 == null ? f0 : f1, 440) * cur.pitch, 20, 18000);
  osc.frequency.setValueAtTime(fa, t);
  if (Math.abs(fb - fa) > 0.01) osc.frequency.exponentialRampToValueAtTime(fb, t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const env = ctx.createGain();
  const a = Math.min(o.attack == null ? 0.004 : o.attack, dur * 0.5);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(Math.max(0.0002, v), t + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type || 'lowpass'; f.frequency.value = o.filter.f; f.Q.value = o.filter.q || 0.7;
    osc.connect(f); f.connect(env);
  } else osc.connect(env);
  if (o.vib) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = o.vib.rate; const lg = ctx.createGain(); lg.gain.value = o.vib.depth;
    lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.04);
  }
  env.connect(out);
  if (o.send) { const sg = ctx.createGain(); sg.gain.value = o.send; env.connect(sg); sg.connect(delayIn); }
  osc.start(t); osc.stop(t + dur + 0.04);
  if (o.sfx) voiceEnds.push(t + dur + 0.04);
}

// filtered noise burst. ftype bandpass/highpass/lowpass, f0->f1 sweep
function noise(out, ftype, f0, f1, t, dur, v, o) {
  o = o || {};
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = ftype;
  f.frequency.setValueAtTime(clamp(fin(f0, 1000), 20, 18000), t);
  if (f1 != null && Math.abs(f1 - f0) > 1) f.frequency.exponentialRampToValueAtTime(clamp(fin(f1, 1000), 20, 18000), t + dur);
  f.Q.value = o.q || 0.8;
  const env = ctx.createGain();
  const a = Math.min(o.attack == null ? 0.002 : o.attack, dur * 0.5);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(Math.max(0.0002, v), t + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(env); env.connect(out);
  counter++;
  src.start(t, (counter * 0.37) % 1.5);
  src.stop(t + dur + 0.04);
  if (o.sfx) voiceEnds.push(t + dur + 0.04);
}

// ------------------------------------------------------------------------------------------------ drum kit (used by music and by hero beatbox sfx)
function kick(out, t, v, st, sf) {
  const o = { sfx: sf };
  const deep = st === 'boss' || st === 'epic';
  tone(out, 'sine', deep ? 170 : 150, 44, t, deep ? 0.22 : 0.18, v * 0.95, o);
  noise(out, 'lowpass', 900, 200, t, 0.03, v * 0.35, o);
}
function snare(out, t, v, st, sf) {
  const o = { sfx: sf };
  if (st === 'groove' || st === 'funk') { // beatbox "pf": short breathy burst plus a tiny body
    noise(out, 'bandpass', 2400, 1400, t, 0.09, v * 0.7, { q: 1.2, sfx: sf });
    tone(out, 'triangle', 230, 140, t, 0.08, v * 0.4, o);
  } else {
    noise(out, 'bandpass', 3200, 1800, t, 0.16, v * 0.65, { q: 0.9, sfx: sf });
    tone(out, 'triangle', 240, 150, t, 0.1, v * 0.45, o);
  }
}
function hat(out, t, v, open, sf) { noise(out, 'highpass', 7000, 9000, t, open ? 0.16 : 0.04, v * (open ? 0.3 : 0.32), { sfx: sf }); }
function clap(out, t, v, sf) { for (let i = 0; i < 3; i++) noise(out, 'bandpass', 1500, 1500, t + i * 0.012, 0.05, v * 0.4, { q: 1.4, sfx: sf }); noise(out, 'bandpass', 1500, 900, t + 0.036, 0.14, v * 0.4, { q: 1, sfx: sf }); }

// ------------------------------------------------------------------------------------------------ music sequencer
function hash(a, b, c) { let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; return (h ^ (h >>> 16)) >>> 0; }

function scheduleStep(m, i, time) {
  cur.pitch = 1;
  const T = m.def, s = i % 16, bar = Math.floor(i / 16), ci = bar % T.prog.length;
  const [cr, q] = T.prog[ci];
  const chord = QUAL[q].map((x) => m.root + cr + x);
  const I = m.int, dest = m.gain, st = T.style, P = PAT[st];
  const fill = bar % 4 === 3 && s >= 12;
  const accent = s % 4 === 0 ? 1 : 0.8;
  if (I >= 0.05) {
    if (P.k[s] !== '.') kick(dest, time, P.k[s] === 'x' ? 0.8 : 0.45, st);
    if (st === 'boss' && fill) kick(dest, time, 0.7, st);
  }
  if (I >= 0.25 && P.s[s] !== '.') {
    snare(dest, time, P.s[s] === 'x' ? 0.7 : 0.35, st);
    if (st === 'house' || st === 'bright' || st === 'fanfare') clap(dest, time, 0.5);
  }
  if (I >= 0.15) {
    if (P.h[s] !== '.') hat(dest, time, (P.h[s] === 'x' ? 0.6 : 0.3) * accent, false);
    else if (fill && s % 2 === 0) hat(dest, time, 0.4, false);
    if (P.o[s] === 'x') hat(dest, time, 0.5, true);
  }
  const sd = 60 / m.def.bpm / 4;
  const bn = BASS[st][s];
  if (I >= 0.2 && bn != null) {
    const f = mtof(m.root + cr - 12 + bn);
    tone(dest, st === 'house' || st === 'epic' || st === 'boss' ? 'sawtooth' : 'square', f, f, time, sd * (st === 'sad' ? 7 : st === 'house' ? 2.2 : 1.6), 0.26, { filter: { type: 'lowpass', f: st === 'boss' ? 900 : 650, q: 3 }, attack: 0.005 });
    tone(dest, 'sine', f, f, time, sd * 1.8, 0.22, {});
  }
  const C = CH[st];
  if (I >= 0.35 && C.steps.indexOf(s) >= 0) {
    for (let n = 0; n < chord.length; n++) {
      const f = mtof(chord[n] + 12);
      tone(dest, C.wave, f, f, time, sd * C.len, 0.07, { detune: n % 2 ? 6 : -6, filter: { type: 'lowpass', f: 1800, q: 0.6 }, attack: C.len > 5 ? 0.06 : 0.008, send: 0.12 });
    }
  }
  const A = ARP[st][s];
  if (I >= 0.55 && A != null) {
    const note = chord[A % 4] + (A >= 4 ? 12 : 0) + 12;
    const f = mtof(note);
    tone(dest, st === 'boss' || st === 'epic' ? 'sawtooth' : 'square', f, f, time, sd * 0.9, 0.05, { filter: { type: 'lowpass', f: 2600, q: 1 }, send: 0.4 });
  }
  if (I >= T.leadMin) {
    const sc = SCALES[T.scale];
    const h = hash(bar % 4, s, T.seed);
    const slot = [0, 2, 3, 6, 8, 10, 11, 14].indexOf(s) >= 0;
    if (slot && (h >>> 3) % 100 < T.dens) {
      // lean toward chord tones: pick scale degree, snap to chord root now and then
      const deg = h % sc.length;
      const note = (h >>> 9) % 3 === 0 ? chord[(h >>> 5) % 3] + 12 : m.root + cr + sc[deg] + 12;
      const f = mtof(note + 12);
      tone(dest, T.lead, f, f, time, sd * (((h >>> 11) % 2) + 1.6), 0.08, { attack: 0.01, send: 0.45, vib: { rate: 5.5, depth: f * 0.004 }, filter: T.lead === 'sawtooth' ? { type: 'lowpass', f: 2400, q: 0.8 } : null });
    }
  }
  if (s % 4 === 0) pendingBeats.push({ beat: Math.floor(i / 4), time });
}

function stepTime(m, i) { const sd = 60 / m.def.bpm / 4; return m.t0 + i * sd + (i % 2 === 1 ? m.def.swing * sd : 0); }

function pump() {
  if (!ctx || !music) return;
  const t = ctx.currentTime, m = music;
  m.int += (intTarget - m.int) * 0.2;
  if (Math.abs(intTarget - m.int) < 0.002) m.int = intTarget;
  if (t > m.t0 && stepTime(m, m.next) < t - 0.3) { // woke from a throttled tab: skip ahead
    const sd = 60 / m.def.bpm / 4;
    m.next = Math.ceil((t - m.t0) / sd) + 1;
  }
  let guard = 0;
  while (stepTime(m, m.next) < t + 0.18 && guard++ < 64) { scheduleStep(m, m.next, stepTime(m, m.next)); m.next++; }
  if (pendingBeats.length) {
    const rest = [];
    for (const b of pendingBeats) {
      if (b.time <= t + 0.01) { for (const fn of Array.from(listeners)) { try { fn(b.beat); } catch (e) { /* listener errors never stop the music */ } } } else rest.push(b);
    }
    pendingBeats = rest;
  }
}

function musicStart(id) {
  const def = TRACKS[id];
  if (!def) return;
  if (!ctx) { wantTrack = id; return; }
  if (music && music.id === id) return;
  const t = ctx.currentTime;
  if (music) fadeOut(music, 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(1, t + 0.35);
  g.connect(duckG);
  intTarget = def.defInt;
  music = { id, def, gain: g, root: def.root, t0: t + 0.08, next: 0, int: def.defInt };
  pendingBeats = [];
  if (timer == null && typeof setInterval === 'function') { timer = setInterval(pump, 25); if (timer && timer.unref) timer.unref(); }
  pump();
}

function fadeOut(m, sec) {
  if (!ctx) return;
  const t = ctx.currentTime;
  try { m.gain.gain.setTargetAtTime(0.0001, t, Math.max(0.02, sec / 3)); } catch (e) { /* ignore */ }
  const g = m.gain;
  if (typeof setTimeout === 'function') { const h = setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, (sec + 0.6) * 1000); if (h && h.unref) h.unref(); }
}

function musicStop(fadeSec) {
  wantTrack = null;
  if (music) { fadeOut(music, fadeSec == null ? 0.5 : fadeSec); music = null; }
  pendingBeats = [];
  if (timer != null) { clearInterval(timer); timer = null; }
}

// ------------------------------------------------------------------------------------------------ sfx
const S = { sfx: 1 };

function arpUp(out, t, freqs, gap, dur, v, type) { for (let i = 0; i < freqs.length; i++) tone(out, type || 'triangle', freqs[i], null, t + i * gap, dur, v, S); }

function reveal(out, t, n) { // n 1..5 escalating
  const root = 523.25;
  const sets = [[1], [1, 1.25], [1, 1.25, 1.5], [1, 1.25, 1.5, 2], [1, 1.25, 1.5, 2, 2.5]];
  const set = sets[n - 1];
  arpUp(out, t, set.map((x) => root * x), 0.09, 0.45, 0.22, 'triangle');
  if (n >= 2) for (let i = 0; i < n * 2; i++) tone(out, 'sine', 2400 + i * 260, null, t + 0.1 + i * 0.05, 0.2, 0.06, S);
  if (n >= 3) { for (const x of [1, 1.25, 1.5]) tone(out, 'sawtooth', root * x / 2, null, t + set.length * 0.09, 0.9, 0.08, { sfx: 1, filter: { type: 'lowpass', f: 1500, q: 0.7 }, attack: 0.03 }); tone(out, 'sine', 110, 55, t, 0.5, 0.35, S); }
  if (n >= 4) { noise(out, 'bandpass', 400, 6000, t, 0.7, 0.15, { q: 0.8, sfx: 1 }); for (const x of [1, 1.25, 1.5, 2]) tone(out, 'square', root * x, null, t + 0.5, 1.2, 0.07, { sfx: 1, attack: 0.02 }); }
  if (n >= 5) { tone(out, 'sine', 160, 28, t + 0.5, 1.4, 0.55, S); for (let i = 0; i < 8; i++) tone(out, 'sine', 1800 + i * 390, null, t + 0.7 + i * 0.07, 0.4, 0.07, S); for (const d of [-14, 0, 14]) tone(out, 'sawtooth', 261.6, null, t + 0.5, 1.6, 0.06, { sfx: 1, detune: d, attack: 0.3, filter: { type: 'lowpass', f: 1200, q: 0.6 } }); }
}

const SFX = {
  ui_click: (o, t) => tone(o, 'square', 900, 600, t, 0.05, 0.16, S),
  ui_back: (o, t) => tone(o, 'square', 600, 380, t, 0.07, 0.16, S),
  ui_open: (o, t) => { tone(o, 'triangle', 520, null, t, 0.08, 0.2, S); tone(o, 'triangle', 780, null, t + 0.06, 0.12, 0.2, S); },
  ui_tab: (o, t) => tone(o, 'triangle', 700, 900, t, 0.06, 0.18, S),
  coin: (o, t) => { tone(o, 'square', 1320, null, t, 0.07, 0.12, S); tone(o, 'square', 1760, null, t + 0.06, 0.16, 0.12, S); },
  diamond: (o, t) => { arpUp(o, t, [2093, 2637, 3136, 4186], 0.05, 0.3, 0.12, 'sine'); tone(o, 'triangle', 1046, null, t, 0.25, 0.1, S); },
  record: (o, t) => { tone(o, 'triangle', 880, 1100, t, 0.14, 0.18, S); noise(o, 'highpass', 5000, 5000, t, 0.12, 0.12, S); tone(o, 'sine', 1320, null, t + 0.08, 0.15, 0.1, S); },
  deploy: (o, t) => { tone(o, 'sine', 300, 760, t, 0.12, 0.35, S); noise(o, 'bandpass', 2000, 1000, t, 0.04, 0.2, S); },
  merge: (o, t) => { arpUp(o, t, [523.25, 659.25, 783.99, 1046.5], 0.06, 0.28, 0.2, 'triangle'); for (let i = 0; i < 4; i++) tone(o, 'sine', 2600 + i * 300, null, t + 0.12 + i * 0.04, 0.18, 0.05, S); },
  merge_big: (o, t) => { tone(o, 'sine', 240, 34, t, 0.75, 0.6, S); noise(o, 'bandpass', 3000, 200, t, 0.5, 0.3, { q: 0.6, sfx: 1 }); arpUp(o, t + 0.12, [392, 523.25, 659.25, 783.99, 1046.5], 0.05, 0.4, 0.16, 'triangle'); },
  sell: (o, t) => { tone(o, 'square', 1200, 900, t, 0.08, 0.13, S); tone(o, 'square', 900, 600, t + 0.07, 0.12, 0.13, S); },
  shoot_kick: (o, t) => { tone(o, 'sine', 170, 55, t, 0.14, 0.5, S); noise(o, 'lowpass', 800, 200, t, 0.03, 0.2, S); },
  shoot_snare: (o, t) => { noise(o, 'bandpass', 2600, 1600, t, 0.08, 0.28, { q: 1, sfx: 1 }); tone(o, 'triangle', 220, 140, t, 0.06, 0.2, S); },
  shoot_hat: (o, t) => noise(o, 'highpass', 8000, 8000, t, 0.025, 0.14, S),
  shoot_sub: (o, t) => { tone(o, 'sine', 80, 45, t, 0.28, 0.5, S); tone(o, 'sine', 120, 60, t, 0.2, 0.2, S); },
  shoot_mic: (o, t) => tone(o, 'sine', 880, 1320, t, 0.22, 0.2, { sfx: 1, vib: { rate: 7, depth: 12 }, attack: 0.03 }),
  shoot_synth: (o, t) => { tone(o, 'sawtooth', 1500, 180, t, 0.14, 0.18, { sfx: 1, filter: { type: 'bandpass', f: 1800, q: 4 } }); noise(o, 'highpass', 6000, 3000, t, 0.06, 0.1, S); },
  shoot_scratch: (o, t) => { noise(o, 'bandpass', 600, 3200, t, 0.06, 0.25, { q: 3, sfx: 1 }); noise(o, 'bandpass', 3200, 700, t + 0.06, 0.07, 0.25, { q: 3, sfx: 1 }); },
  shoot_cowbell: (o, t) => { tone(o, 'square', 560, null, t, 0.2, 0.16, { sfx: 1, filter: { type: 'bandpass', f: 700, q: 3 } }); tone(o, 'square', 845, null, t, 0.2, 0.16, { sfx: 1, filter: { type: 'bandpass', f: 800, q: 3 } }); },
  shoot_horn: (o, t) => { tone(o, 'sawtooth', 440, null, t, 0.3, 0.14, { sfx: 1, filter: { type: 'lowpass', f: 1600, q: 1 } }); tone(o, 'sawtooth', 466, null, t, 0.3, 0.14, { sfx: 1, filter: { type: 'lowpass', f: 1600, q: 1 } }); },
  shoot_vocal: (o, t) => tone(o, 'sine', 660, 700, t, 0.25, 0.16, { sfx: 1, attack: 0.05, filter: { type: 'bandpass', f: 900, q: 1.5 }, vib: { rate: 5, depth: 8 } }),
  hit: (o, t) => { noise(o, 'bandpass', 1800, 900, t, 0.05, 0.2, { q: 1, sfx: 1 }); tone(o, 'triangle', 170, 100, t, 0.05, 0.15, S); },
  crit: (o, t) => { tone(o, 'square', 1500, 700, t, 0.09, 0.2, S); noise(o, 'highpass', 4000, 6000, t, 0.06, 0.2, S); tone(o, 'sine', 2200, null, t + 0.05, 0.12, 0.08, S); },
  kill: (o, t) => tone(o, 'sine', 500, 950, t, 0.09, 0.2, S),
  kill_big: (o, t) => { tone(o, 'sine', 500, 950, t, 0.1, 0.2, S); tone(o, 'sine', 120, 45, t, 0.3, 0.5, S); noise(o, 'lowpass', 1500, 200, t, 0.25, 0.3, S); },
  leak: (o, t) => { tone(o, 'sawtooth', 320, 70, t, 0.4, 0.28, { sfx: 1, filter: { type: 'lowpass', f: 900, q: 2 } }); tone(o, 'square', 160, 50, t, 0.4, 0.2, S); },
  wave_start: (o, t) => { tone(o, 'sawtooth', 220, 330, t, 0.35, 0.16, { sfx: 1, filter: { type: 'lowpass', f: 1500, q: 1 } }); tone(o, 'sawtooth', 330, 440, t + 0.15, 0.4, 0.16, { sfx: 1, filter: { type: 'lowpass', f: 1500, q: 1 } }); },
  wave_clear: (o, t) => arpUp(o, t, [392, 494, 587, 784, 988], 0.07, 0.35, 0.18, 'triangle'),
  boss_warn: (o, t) => { for (let i = 0; i < 3; i++) { tone(o, 'sawtooth', 110, null, t + i * 0.5, 0.25, 0.3, { sfx: 1, filter: { type: 'lowpass', f: 700, q: 2 } }); tone(o, 'sawtooth', 147, null, t + i * 0.5 + 0.25, 0.25, 0.3, { sfx: 1, filter: { type: 'lowpass', f: 700, q: 2 } }); tone(o, 'square', 880, 700, t + i * 0.5, 0.45, 0.06, S); } },
  boss_die: (o, t) => { noise(o, 'lowpass', 4000, 100, t, 1.2, 0.5, { q: 0.7, sfx: 1 }); tone(o, 'sine', 200, 30, t, 1.0, 0.6, S); arpUp(o, t + 0.5, [1046, 784, 659, 523], 0.12, 0.5, 0.12, 'triangle'); },
  hero_roxor: (o, t) => { kick(o, t, 0.9, 'groove', 1); hat(o, t + 0.16, 0.9, false, 1); snare(o, t + 0.24, 0.9, 'groove', 1); kick(o, t + 0.34, 0.9, 'groove', 1); tone(o, 'sawtooth', 800, 100, t + 0.4, 0.2, 0.15, { sfx: 1, filter: { type: 'bandpass', f: 1200, q: 4 } }); },
  hero_jasmin: (o, t) => { for (const [f, d] of [[1, 0], [1.25, 0.04], [1.5, 0.08]]) tone(o, 'sine', 440 * f, 880 * f, t + d, 0.6, 0.18, { sfx: 1, attack: 0.1, vib: { rate: 6, depth: 6 } }); arpUp(o, t + 0.3, [1760, 2093, 2637, 3136], 0.06, 0.3, 0.07, 'sine'); },
  duet: (o, t) => { SFX.hero_roxor(o, t); SFX.hero_jasmin(o, t + 0.05); tone(o, 'sine', 100, 30, t + 0.5, 1, 0.6, S); arpUp(o, t + 0.55, [523, 659, 784, 1046, 1318], 0.05, 0.6, 0.12, 'square'); },
  levelup: (o, t) => arpUp(o, t, [392, 494, 587, 740, 988], 0.07, 0.3, 0.2, 'triangle'),
  remix_pick: (o, t) => { tone(o, 'sine', 1200, null, t, 0.2, 0.2, S); noise(o, 'bandpass', 500, 4000, t, 0.25, 0.12, { q: 1, sfx: 1 }); tone(o, 'triangle', 600, 1200, t, 0.2, 0.15, S); },
  relic: (o, t) => { tone(o, 'sine', 988, null, t, 0.9, 0.2, S); tone(o, 'sine', 1480, null, t + 0.05, 0.9, 0.14, S); tone(o, 'triangle', 1976, null, t + 0.1, 0.7, 0.08, S); arpUp(o, t + 0.2, [2637, 3136, 3951], 0.08, 0.3, 0.05, 'sine'); },
  chest: (o, t) => { tone(o, 'sawtooth', 120, 200, t, 0.25, 0.1, { sfx: 1, filter: { type: 'bandpass', f: 400, q: 6 } }); arpUp(o, t + 0.25, [1046, 1318, 1568, 2093], 0.06, 0.3, 0.12, 'triangle'); },
  crate_shake: (o, t) => { for (let i = 0; i < 4; i++) { noise(o, 'lowpass', 500, 200, t + i * 0.07, 0.06, 0.25, S); tone(o, 'sine', 70, 55, t + i * 0.07, 0.07, 0.3, S); } },
  crate_open: (o, t) => { tone(o, 'sine', 200, 60, t, 0.2, 0.4, S); noise(o, 'bandpass', 500, 6000, t, 0.4, 0.25, { q: 0.7, sfx: 1 }); arpUp(o, t + 0.15, [1568, 2093, 2637, 3136], 0.05, 0.3, 0.08, 'sine'); },
  reveal_common: (o, t) => reveal(o, t, 1), reveal_rare: (o, t) => reveal(o, t, 2), reveal_epic: (o, t) => reveal(o, t, 3),
  reveal_legendary: (o, t) => reveal(o, t, 4), reveal_mythic: (o, t) => reveal(o, t, 5),
  win: (o, t) => { arpUp(o, t, [523, 659, 784, 1046], 0.1, 0.5, 0.2, 'square'); for (const x of [523, 659, 784, 1046]) tone(o, 'triangle', x, null, t + 0.5, 1.2, 0.12, { sfx: 1, attack: 0.03 }); tone(o, 'sine', 130, 65, t + 0.5, 0.6, 0.4, S); },
  lose: (o, t) => arpUp(o, t, [440, 392, 349, 262], 0.22, 0.6, 0.2, 'sawtooth'),
  error: (o, t) => { tone(o, 'square', 150, null, t, 0.1, 0.2, S); tone(o, 'square', 120, null, t + 0.13, 0.14, 0.2, S); },
  countdown: (o, t) => tone(o, 'sine', 880, null, t, 0.12, 0.3, S),
  tick: (o, t) => noise(o, 'highpass', 5000, 5000, t, 0.02, 0.15, S),
  achievement: (o, t) => { arpUp(o, t, [784, 988, 1175, 1568], 0.08, 0.35, 0.18, 'triangle'); tone(o, 'sine', 2349, null, t + 0.3, 0.7, 0.1, S); },
  typewriter: (o, t) => { counter++; tone(o, 'square', 700 + (counter % 5) * 70, null, t, 0.02, 0.06, S); },
  whoosh: (o, t) => noise(o, 'bandpass', 300, 5000, t, 0.35, 0.22, { q: 0.9, attack: 0.12, sfx: 1 }),
  jam: (o, t) => { noise(o, 'highpass', 2000, 6000, t, 0.35, 0.3, S); tone(o, 'square', 233, 311, t, 0.3, 0.12, S); tone(o, 'square', 247, 330, t, 0.3, 0.12, S); },
  heal: (o, t) => arpUp(o, t, [587, 740, 880, 1175], 0.07, 0.4, 0.12, 'sine'),
  freeze: (o, t) => { arpUp(o, t, [3136, 2637, 2093, 1568], 0.045, 0.3, 0.1, 'sine'); noise(o, 'highpass', 6000, 3000, t, 0.4, 0.12, S); },
  combo: (o, t) => { tone(o, 'square', 660, null, t, 0.06, 0.14, S); tone(o, 'square', 990, null, t + 0.05, 0.1, 0.14, S); },
  reroll: (o, t) => { for (let i = 0; i < 5; i++) noise(o, 'bandpass', 2500 + i * 300, 2500, t + i * 0.04, 0.03, 0.18, { q: 2, sfx: 1 }); tone(o, 'triangle', 800, 1200, t + 0.2, 0.1, 0.12, S); },
  star_pop: (o, t) => { tone(o, 'sine', 600, 1400, t, 0.12, 0.25, S); arpUp(o, t + 0.08, [2093, 2637, 3136], 0.05, 0.25, 0.08, 'sine'); },
};

const GAP = { shoot_hat: 0.05, shoot_snare: 0.035, shoot_kick: 0.04, hit: 0.035, kill: 0.04, coin: 0.05, typewriter: 0.03, tick: 0.03, shoot_scratch: 0.05, shoot_synth: 0.05, combo: 0.05, ui_click: 0.04 };
const LOW = { hit: 1, shoot_hat: 1, shoot_snare: 1, tick: 1, typewriter: 1, coin: 1, kill: 1, shoot_kick: 1, shoot_synth: 1, shoot_scratch: 1 };

function play(name, o) {
  if (!ctx || muted) return;
  const fn = SFX[name];
  if (!fn) return;
  if (ctx.state === 'suspended') return;
  o = o || {};
  const t0 = ctx.currentTime;
  const gap = GAP[name] == null ? 0.02 : GAP[name];
  if (lastPlay[name] != null && t0 - lastPlay[name] < gap && t0 >= lastPlay[name]) return;
  const act = activeVoices(t0);
  if (act >= 44 || (LOW[name] && act >= 22)) return;
  lastPlay[name] = t0;
  const out = ctx.createGain();
  out.gain.value = clamp(fin(o.vol, 1), 0, 1.5);
  let tail = out;
  if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); out.connect(p); tail = p; }
  tail.connect(sfxBus);
  cur.pitch = clamp(fin(o.pitch, 1), 0.25, 4);
  try { fn(out, t0 + 0.005 + (o.at || 0)); } catch (e) { /* a broken voice never breaks the game */ }
  cur.pitch = 1;
}

// ------------------------------------------------------------------------------------------------ public API
export const AudioFx = {
  sfxNames: SFX_NAMES, trackIds: TRACK_IDS,
  init() {
    if (ctx) return true;
    const AC = hasAC();
    if (!AC) return false;
    try { attach(new AC()); } catch (e) { ctx = null; return false; }
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) { try { ctx.suspend && ctx.suspend(); } catch (e) { /* ignore */ } } else AudioFx.resume(); });
    }
    return true;
  },
  isReady() { return !!ctx; },
  resume() { if (!ctx) AudioFx.init(); if (ctx && ctx.state === 'suspended' && ctx.resume) { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } },
  setVolume(v) {
    if (v && v.music != null) vol.music = clamp(fin(v.music, vol.music), 0, 1);
    if (v && v.sfx != null) vol.sfx = clamp(fin(v.sfx, vol.sfx), 0, 1);
    if (ctx) { musicBus.gain.setTargetAtTime(vol.music * 0.8, ctx.currentTime, 0.03); sfxBus.gain.setTargetAtTime(vol.sfx * 1.35, ctx.currentTime, 0.03); }
  },
  getVolume() { return { music: vol.music, sfx: vol.sfx, muted }; },
  mute(b) { muted = !!b; if (ctx) master.gain.setTargetAtTime(muted ? 0.0001 : 0.9, ctx.currentTime, 0.02); },
  play,
  musicStart, musicStop,
  musicIntensity(v) { intTarget = clamp(fin(v, 0.5), 0, 1); },
  musicDuck(sec) {
    if (!ctx) return;
    const t = ctx.currentTime, d = clamp(fin(sec, 0.5), 0.05, 10);
    duckG.gain.cancelScheduledValues(t);
    duckG.gain.setTargetAtTime(0.35, t, 0.03);
    duckG.gain.setTargetAtTime(1, t + d, 0.2);
  },
  beatInfo() {
    if (!ctx || !music) return null;
    const t = ctx.currentTime, x = Math.max(0, (t - music.t0) * music.def.bpm / 60);
    const beat = Math.floor(x);
    return { bpm: music.def.bpm, beat, phase: x - beat, t };
  },
  onBeat(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  current() { return music ? music.id : null; },
  // test and lab hooks
  _attach: attach, _tick: pump, _state() { return { ctx, music, voices: voiceEnds.length, intTarget, muted, vol }; },
  _reset() { musicStop(0.01); ctx = null; voiceEnds = []; for (const k in lastPlay) delete lastPlay[k]; listeners.clear(); wantTrack = null; },
};
export default AudioFx;
