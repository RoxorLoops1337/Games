// Procedural sound: effects, cat voices and a small step-sequenced soundtrack. No audio files.
import { MEOW_BANK } from './meow_bank.js';
import { meowPlan, clipForNote, MEW_KIT } from './meow_voice.js';
const NOTE = (semi, root) => root * Math.pow(2, semi / 12);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---- music data. Every theme has a calm, a fight and a boss song: its own key, scale, tempo, 8 bar chord
// progression (the form is 16 bars: phrases A, A', B, A''), bass line, arpeggio, lead melody and instruments.
export const THEME_COUNT = 6;
export const MUSIC_MODES = ['calm', 'fight', 'boss'];
export const MUSIC_VOICE_CAP = 28;
const MEW_LEAD_GAIN = 3.5;   // a recorded meow note is this many times the lead volume of the song (about as loud as the oscillator leads)
const CH = { M: [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], sus: [0, 5, 7], s2: [0, 2, 7] };
// instruments as layered partials: [wave, frequency ratio, volume, decay as a share of the note, attack, detune cents]
const INST = {
  pluck:   { p: [['triangle', 1, 1, 1, 0.004, 0], ['sine', 2, 0.25, 0.4, 0.004, 0]] },
  koto:    { bend: 1.02, p: [['triangle', 1, 1, 0.9, 0.002, 0], ['sine', 3, 0.2, 0.25, 0.002, 0]] },
  marimba: { p: [['sine', 1, 1, 0.7, 0.003, 0], ['sine', 4, 0.28, 0.18, 0.003, 0]] },
  bell:    { p: [['sine', 1, 1, 1, 0.004, 0], ['sine', 2.76, 0.3, 0.6, 0.004, 0], ['sine', 5.4, 0.1, 0.25, 0.004, 0]] },
  celesta: { p: [['sine', 1, 1, 1, 0.004, 0], ['sine', 4, 0.18, 0.3, 0.004, 0]] },
  bassoon: { lp: 1100, p: [['square', 1, 0.8, 0.85, 0.02, 0]] },
  warm:    { p: [['triangle', 1, 1, 1, 0.03, 0], ['sine', 2, 0.2, 1, 0.03, 3]] },
  sinelead: { p: [['sine', 1, 1, 1, 0.07, 0], ['sine', 2, 0.12, 1, 0.07, 0]] },
  sawlead: { lp: 3000, p: [['sawtooth', 1, 0.7, 1, 0.01, 0]] },
  squarelead: { lp: 2600, p: [['square', 1, 0.6, 1, 0.01, 0]] },
  softpad: { p: [['triangle', 1, 1, 1, 0.2, 0]] },
  pad:     { p: [['sawtooth', 1, 0.45, 1, 0.25, -7], ['sawtooth', 1, 0.45, 1, 0.25, 7]] },
  stab:    { lp: 2200, p: [['sawtooth', 1, 0.8, 0.7, 0.005, 0], ['square', 1, 0.4, 0.7, 0.005, -5]] },
  subbass: { p: [['sine', 1, 1, 1, 0.01, 0]] },
  tribass: { p: [['triangle', 1, 1, 1, 0.01, 0]] },
  sawbass: { lp: 700, p: [['sawtooth', 1, 0.7, 1, 0.005, 0]] },
};
const RHY = {
  slow: [[[0, 6], [8, 2], [10, 6]], [[0, 4], [4, 4], [8, 4], [12, 4]], [[2, 6], [8, 8]], [[0, 8], [8, 4], [12, 4]]],
  med: [[[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]], [[0, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]]],
  busy: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], [[0, 2], [2, 1], [3, 1], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]]],
  stac: [[[0, 1], [2, 1], [3, 1], [6, 1], [8, 1], [10, 1], [11, 1], [14, 1]], [[0, 1], [3, 1], [4, 1], [7, 1], [8, 2], [12, 1], [14, 1]], [[0, 2], [4, 1], [6, 1], [8, 1], [9, 1], [10, 1], [13, 2]], [[0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 2], [12, 1], [15, 1]]],
};
const DEF = { swing: 0, lpf: 16000, drums: 0, kv: 1, hatV: 0.05, ring: 1, shaker: true, pad: 'sus', padInst: 'softpad', padV: 0.026, bass: 'long', bassInst: 'subbass', bassV: 0.12, arp: null, arpInst: 'pluck', arpV: 0.035, lead: 'pluck', leadV: 0.05, mid: 2, melOct: 4, rhy: 'slow' };
const MIN = [0, 2, 3, 5, 7, 8, 10], PENT = [0, 2, 4, 7, 9], LYD = [0, 2, 4, 6, 7, 9, 11], PHRYG = [0, 1, 4, 5, 7, 8, 10];
const BOSS_PROG = [[0, 'm'], [8, 'M'], [5, 'm'], [7, '7'], [0, 'm'], [1, 'M'], [10, 'M'], [7, '7']];
const EIGHTS = [0, 2, 4, 6, 8, 10, 12, 14];
const SONGS = {
  calm: [
    { name: 'Garden Morning', mew: 2, bpm: 92, root: 130.81, scale: PENT, seed: 11, lpf: 12000, ring: 1.6, lead: 'pluck', arp: { steps: [2, 6, 10, 14], oct: 4 }, arpInst: 'pluck',
      prog: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M'], [0, 'M'], [4, 'm'], [5, 'M7'], [7, 'sus']], rhy: 'slow', bassInst: 'subbass' },
    { name: 'Autumn Walk', bpm: 76, root: 146.83, scale: MIN, seed: 22, lpf: 3200, lead: 'warm', padInst: 'pad', padV: 0.03, bassInst: 'tribass', arp: { steps: [0, 3, 6, 8, 11, 14], oct: 4 }, arpInst: 'pluck', rhy: 'slow',
      prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [5, 'm'], [7, '7'], [0, 'm']] },
    { name: 'Moon Rain', mew: 4, bpm: 72, root: 164.81, scale: MIN, seed: 33, lpf: 1300, lead: 'sinelead', leadV: 0.055, padInst: 'pad', padV: 0.035, shaker: false, rhy: 'slow', bassInst: 'subbass',
      prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [5, 'm'], [7, '7'], [0, 'm']] },
    { name: 'Cheese Waltz', mew: 3, bpm: 100, root: 174.61, scale: LYD, seed: 44, swing: 0.18, lead: 'bassoon', leadV: 0.045, legato: 0.5, bass: 'bounce', bassInst: 'bassoon', bassV: 0.07, padInst: 'softpad', pad: 'pulse', padV: 0.016, arp: { steps: [3, 7, 11, 15], oct: 4 }, arpInst: 'marimba', arpV: 0.045, rhy: 'stac',
      prog: [[0, 'M'], [2, 'M'], [9, 'm'], [7, 'M'], [0, 'M'], [5, 'M'], [2, 'm'], [7, '7']] },
    { name: 'Ice Bells', bpm: 72, root: 146.83, scale: LYD, seed: 55, lpf: 9000, lead: 'celesta', ring: 1.8, padV: 0.02, shaker: false, bass: 'sparse', arp: { steps: [0, 6, 12], oct: 6 }, arpInst: 'bell', arpV: 0.025, rhy: 'slow',
      prog: [[0, 'M7'], [9, 'm7'], [5, 'M7'], [7, 'M'], [0, 'M7'], [4, 'm7'], [5, 'M7'], [7, 'sus']] },
    { name: 'Petal Drift', mew: 3, bpm: 80, root: 146.83, scale: [0, 2, 3, 7, 8], seed: 66, lead: 'koto', ring: 2, bassInst: 'tribass', arp: { steps: [4, 10, 14], oct: 4 }, arpInst: 'koto', padV: 0.02, rhy: 'slow',
      prog: [[0, 'm'], [8, 'M'], [3, 'M'], [7, 'sus'], [0, 'm'], [5, 'm'], [8, 'M'], [7, '7']] },
  ],
  fight: [
    { name: 'Garden Rush', mew: 3, mewKit: true, bpm: 124, root: 98, scale: PENT, seed: 111, drums: 1, lead: 'pluck', leadV: 0.05, ring: 1.3, bass: 'walk', bassInst: 'tribass', bassV: 0.1, pad: 'stab', arp: { steps: EIGHTS, oct: 4 }, arpInst: 'pluck', rhy: 'med',
      prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M'], [0, 'M'], [4, 'm'], [5, 'M'], [7, '7']] },
    { name: 'Alley Chase', mew: 4, bpm: 112, root: 146.83, scale: MIN, seed: 122, drums: 1, lead: 'warm', leadV: 0.055, padInst: 'pad', pad: 'stab', padV: 0.03, lpf: 6000, bass: 'walk', bassInst: 'tribass', bassV: 0.1, arp: { steps: EIGHTS, oct: 4 }, arpInst: 'pluck', rhy: 'med',
      prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [5, 'm'], [8, 'M'], [7, '7']] },
    { name: 'Rooftop Storm', mew: 4, bpm: 118, root: 164.81, scale: [0, 2, 3, 5, 7, 8, 10], seed: 133, drums: 1, lead: 'warm', leadV: 0.055, padInst: 'pad', pad: 'stab', padV: 0.03, lpf: 4500, bass: 'walk', bassInst: 'sawbass', bassV: 0.07, arp: { steps: EIGHTS, oct: 4 }, arpInst: 'pluck', rhy: 'med',
      prog: [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M'], [0, 'm'], [3, 'M'], [5, 'm'], [7, '7']] },
    { name: 'Mouse Hole Mambo', mew: 2, mewKit: true, bpm: 138, root: 174.61, scale: LYD, seed: 144, drums: 1, swing: 0.15, lead: 'marimba', leadV: 0.06, legato: 0.6, bass: 'bounce', bassInst: 'bassoon', bassV: 0.08, pad: 'stab', padV: 0.02, arp: { steps: [2, 6, 10, 14], oct: 4 }, arpInst: 'bassoon', arpV: 0.03, rhy: 'stac',
      prog: [[0, 'M'], [5, 'M'], [2, 'M'], [7, '7'], [0, 'M'], [9, 'm'], [2, 'm'], [7, '7']] },
    { name: 'Blizzard Dance', bpm: 108, root: 146.83, scale: LYD, seed: 155, drums: 1, kv: 0.6, hatV: 0.04, lead: 'bell', leadV: 0.045, ring: 1.4, bass: 'walk', bassInst: 'subbass', bassV: 0.1, padV: 0.018, pad: 'sus', arp: { steps: EIGHTS, oct: 6 }, arpInst: 'celesta', arpV: 0.03, rhy: 'med',
      prog: [[0, 'M7'], [9, 'm7'], [5, 'M7'], [7, 'M'], [0, 'M7'], [4, 'm7'], [5, 'M7'], [7, 'sus']] },
    { name: 'Hanami Charge', mew: 2, bpm: 118, root: 146.83, scale: [0, 2, 3, 7, 8], seed: 166, drums: 1, lead: 'koto', leadV: 0.06, ring: 1.8, bass: 'walk', bassInst: 'tribass', bassV: 0.1, pad: 'stab', padV: 0.02, arp: { steps: EIGHTS, oct: 4 }, arpInst: 'koto', rhy: 'med',
      prog: [[0, 'm'], [8, 'M'], [3, 'M'], [7, 'sus'], [0, 'm'], [5, 'm'], [8, 'M'], [7, '7']] },
  ],
  boss: [
    [140, 98, 'sawlead', 16000], [134, 110, 'squarelead', 16000], [142, 123.47, 'sawlead', 6500], [146, 116.54, 'bassoon', 16000], [138, 130.81, 'bell', 16000], [136, 103.83, 'koto', 16000],
  ].map(([bpm, root, lead, lpf], i) => ({ name: 'Nest Battle ' + (i + 1), mew: 4, bpm, root, scale: PHRYG, seed: 211 + i * 10, drums: 2, lead, lpf, leadV: lead === 'bell' || lead === 'koto' ? 0.06 : 0.032, ring: 1, bass: 'pump', bassInst: 'sawbass', bassV: 0.07, pad: 'stab', padInst: 'stab', padV: 0.018, arp: { steps: EIGHTS, oct: 4 }, arpInst: 'squarelead', arpV: 0.022, rhy: 'busy', prog: BOSS_PROG })),
};

const pcOf = (x) => ((x % 12) + 12) % 12;
function genPhrase(def, chords, key, startBar, hiShift, opt) {
  const sc = def.scale, n = sc.length, at = (i) => sc[i % n] + 12 * Math.floor(i / n), hiMax = n + 2 + hiShift;
  const tpls = RHY[def.rhy];
  const mkRnd = (k) => rng(def.seed * 7919 + k);
  let rnd = mkRnd(key), idx = Math.min(def.mid + hiShift, hiMax);
  const fit = (i, pcs) => { for (let d = 0; d <= n; d++) for (const j of [i - d, i + d]) if (j >= 0 && j <= hiMax && pcs.includes(pcOf(at(j)))) return j; return i; };
  const out = [];
  for (let b = 0; b < 4; b++) {
    if (b === 3 && opt && opt.variant) rnd = mkRnd(key + 101);
    const pcs = chords[(startBar + b) % 8].map(pcOf), bar = [];
    if (b === 3 && opt && opt.cadence) { idx = fit(idx, [0]); out.push([[0, at(idx), 10]]); continue; }
    const tpl = tpls[Math.floor(rnd() * tpls.length)];
    for (const [s, len] of tpl) {
      idx = Math.max(0, Math.min(hiMax, idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(rnd() * 7)]));
      if (s % 8 === 0) idx = fit(idx, pcs);
      bar.push([s, at(idx), len]);
    }
    out.push(bar);
  }
  return out;
}

// turns a song definition into 16 bars x 16 steps of ready events (frequencies and durations in seconds)
function compile(raw, theme, mode) {
  const def = Object.assign({}, DEF, raw), R = def.root, spb = 60 / def.bpm / 4, cap = 16 * spb;
  const chords = def.prog.map(([r, q]) => CH[q].map((x) => r + x));
  const bars = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => []));
  const f = (semi, oct) => R * oct * Math.pow(2, semi / 12);
  const add = (b, s, k, inst, freq, len, v, pri, mul) => { bars[b][s].push({ k, inst, f: freq, dur: Math.min(cap, len * spb * (mul || 1)), v, pri }); };
  const drums = def.drums;
  for (let b = 0; b < 16; b++) {
    const ch = chords[b % 8], root = ch[0], fill = b % 4 === 3;
    // pad
    const pv = def.padV;
    if (def.pad === 'sus') ch.forEach((x) => add(b, 0, 'pad', def.padInst, f(x, 2), 15, pv, 1));
    else if (def.pad === 'pulse') for (const s of [0, 8]) ch.forEach((x) => add(b, s, 'pad', def.padInst, f(x, 2), 7, pv, 1));
    else if (def.pad === 'stab') for (const s of [0, 6, 10]) ch.forEach((x) => add(b, s, 'pad', def.padInst, f(x, 2), 2, pv * 1.4, 0));
    // bass
    const B = (s, semi, len, v) => add(b, s, 'bass', def.bassInst, f(semi, 0.5), len, v || def.bassV, 2);
    if (def.bass === 'long') { B(0, root, 8); B(8, root + 7, 6, def.bassV * 0.6); }
    else if (def.bass === 'sparse') { B(0, root, 10); B(10, root + 7, 4, def.bassV * 0.6); }
    else if (def.bass === 'walk') { const pat = [0, 0, 12, 0, 0, 0, 12, 7]; pat.forEach((x, j) => B(j * 2, root + x, 1.8, j % 2 ? def.bassV * 0.8 : def.bassV)); }
    else if (def.bass === 'bounce') { [[0, 0], [4, 7], [8, 0], [10, 12], [12, 7]].forEach(([s, x]) => B(s, root + x, 1.5)); }
    else if (def.bass === 'pump') { for (let s = 0; s < 16; s += 2) B(s, root + ((s === 6 || s === 14) && fill ? 1 : s % 8 === 6 ? 12 : 0), 1.5, s % 4 === 0 ? def.bassV : def.bassV * 0.7); }
    // arpeggio
    if (def.arp) def.arp.steps.forEach((s, k) => add(b, s, 'arp', def.arpInst, f((ch[k % ch.length] % 12) + (k % 4 === 3 ? 12 : 0), def.arp.oct), 1.6, def.arpV, 0, drums ? 1 : 1.5));
    // drums
    if (drums === 0) { if (def.shaker) for (const s of [4, 12]) add(b, s, 'hat', null, 0, 1, 0.025, 0); }
    else {
      const kv = (drums === 2 ? 0.3 : 0.24) * def.kv, sv = (drums === 2 ? 0.16 : 0.12) * def.kv;
      const kicks = drums === 2 ? [0, 4, 8, 10, 12, 14] : fill ? [0, 4, 8, 10, 12] : [0, 4, 8, 12];
      for (const s of kicks) add(b, s, 'kick', null, 0, 1, kv, 2);
      for (const s of fill ? [4, 12, 14, 15] : [4, 12]) add(b, s, 'snare', null, 0, 1, sv, 1);
      for (const s of EIGHTS) add(b, s, 'hat', null, 0, 1, def.hatV, 0);
      if (drums === 2) for (const s of [7, 15]) add(b, s, 'hat', null, 0, 1, 0.07, 0);
    }
  }
  // lead: phrases A, A' (same rhythm, new pitches over the new chords, new ending), B (higher), A'' (cadence)
  const ph = [genPhrase(def, chords, 1, 0, 0), genPhrase(def, chords, 1, 4, 0, { variant: true }), genPhrase(def, chords, 2, 8, 2), genPhrase(def, chords, 1, 12, 0, { cadence: true })];
  let noteNo = 0;   // def.mew = N: every Nth lead note (and every long ending note) is sung by a recorded meow
  ph.forEach((phrase, p) => phrase.forEach((bar, b) => bar.forEach(([s, semi, len]) => {
    const meow = def.mew && (len >= 8 || noteNo++ % def.mew === def.mew - 1);
    add(p * 4 + b, s, 'mel', meow ? 'mewlead' : def.lead, f(semi, def.melOct), len, def.leadV, 1, (def.legato || def.ring));
  })));
  return { theme, mode, def, spb, chords, bars, name: def.name };
}
const songCache = new Map();
export function songInfo(theme, mode) {
  const th = ((theme | 0) % THEME_COUNT + THEME_COUNT) % THEME_COUNT, m = SONGS[mode] ? mode : 'calm', key = th + m;
  let s = songCache.get(key);
  if (!s) { s = compile(SONGS[m][th], th, m); songCache.set(key, s); }
  return s;
}

// music ducks under the big effects: [gain it dips to, seconds to recover]
const DUCK = { boom: [0.55, 0.4], nestdown: [0.5, 0.9], waveclear: [0.75, 0.6], roar: [0.6, 0.55], thunder: [0.6, 0.9], boss: [0.5, 0.9], bang: [0.75, 0.25], special: [0.7, 0.5], win: [0.6, 1.2], over: [0.6, 1.2] };

export class Sfx {
  constructor() {
    this.ctx = null; this.on = true; this.musicOn = true; this.last = {}; this.mode = 'calm';
    this.sfxVol = 1; this.musicVol = 0.7; this.step = 0; this.nextT = 0; this.timer = 0; this.intensity = 0;
    this.theme = 0; this.running = false; this.song = null; this.songKey = ''; this.bus = null; this.busNode = null;
    this.vend = []; this.peakVoices = 0; this.timers = []; this.noteLog = null; this.vh = null;
    this.meowBuf = null; this.meowLoading = false; this.lastMew = ''; this.lastMewF = 0;   // the recorded meows (the bank file named in meow_bank.js), decoded once after unlock
  }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.32; this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
        this.mus = this.ctx.createGain(); this.mus.gain.value = 0.5 * this.musicVol; this.mus.connect(this.master);
        this.duck = this.ctx.createGain(); this.duck.connect(this.mus);
        const n = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, n, n);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.loadMeows();
    } catch (e) { /* audio is optional */ }
  }
  // fetch and decode the bank of recorded meows; until it is there (or if it never comes, offline or blocked) everything uses the synth voices
  loadMeows() {
    if (this.meowBuf || this.meowLoading || typeof fetch !== 'function') return;
    let url;
    try { url = new URL(MEOW_BANK.url, import.meta.url); } catch (e) { return; }
    if (!/^https?:$/.test(url.protocol)) return;
    this.meowLoading = true;
    fetch(url.href).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('meows ' + r.status)))).then((ab) => this.setMeowBank(ab)).then(() => { this.meowLoading = false; }, () => { this.meowLoading = false; });
  }
  // decodes the bank into one buffer. Resolves true when the recordings are ready, false (never rejects) when not.
  setMeowBank(ab) {
    const c = this.ctx;
    if (!c || !c.decodeAudioData) return Promise.resolve(false);
    return new Promise((ok) => {
      try {
        const p = c.decodeAudioData(ab, (buf) => { this.meowBuf = buf; ok(true); }, () => ok(false));
        if (p && p.then) p.then((buf) => { this.meowBuf = buf; ok(true); }, () => ok(false));
      } catch (e) { ok(false); }
    });
  }
  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (this.ctx) { this.sfxBus.gain.value = sfx; this.mus.gain.value = 0.5 * music; }
  }
  // a note at an absolute audio time
  toneAt(f, t, dur, o = {}) {
    const c = this.ctx;
    if (!c) return;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.v || 0.2, t + Math.min(o.attack || 0.01, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (o.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; osc.connect(lp); lp.connect(g); } else osc.connect(g);
    g.connect(o.bus || this.sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  tone(f, t = 0.1, o = {}) {
    if (!this.ctx || !this.on) return;
    this.toneAt(f, this.ctx.currentTime + (o.delay || 0), t, o);
  }
  noiseAt(t, dur, v, o = {}) {
    const c = this.ctx;
    if (!c) return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = o.type || 'lowpass'; f.frequency.value = o.freq || 2000;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  noise(t = 0.15, v = 0.2, lp = 2000) {
    if (!this.ctx || !this.on) return;
    this.noiseAt(this.ctx.currentTime, t, v, { freq: lp });
  }

  // plays part of one recording from the meow bank at an absolute audio time. o: from (share of the clip to start at), dur (longest play time in seconds),
  // rate (and rateTo for a pitch glide), v (volume), wobble (pitch wobble in cents), lp / hp (filters), fin / fout (fade times), bus.
  sampleAt(clip, t, o = {}) {
    const c = this.ctx, buf = this.meowBuf;
    if (!c || !buf) return false;
    const rate = o.rate || 1, mean = o.rateTo ? (rate + o.rateTo) / 2 : rate;
    const startS = (clip.at + (o.from || 0) * clip.len) / MEOW_BANK.rate;
    const left = (clip.at + clip.len) / MEOW_BANK.rate - startS;
    const play = Math.max(0.03, Math.min(left / mean, o.dur || 1e9));
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, t);
    if (o.rateTo) src.playbackRate.exponentialRampToValueAtTime(o.rateTo, t + play);
    let tail = src;
    if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; tail.connect(f); tail = f; }
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; tail.connect(f); tail = f; }
    const fin = Math.min(o.fin || 0.006, play * 0.4), fout = Math.min(o.fout || 0.03, play * 0.5), v = o.v || 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + fin);
    g.gain.setValueAtTime(v, Math.max(t + fin, t + play - fout));
    g.gain.linearRampToValueAtTime(0.0001, t + play);
    tail.connect(g); g.connect(o.bus || this.sfxBus);
    let lfo = null;
    if (o.wobble) {   // a worried meow: the pitch wavers about 6 times a second
      lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = 6.5; lg.gain.value = rate * (Math.pow(2, o.wobble / 1200) - 1);
      lfo.connect(lg); lg.connect(src.playbackRate); lfo.start(t); lfo.stop(t + play + 0.05);
    }
    src.start(t, startS); src.stop(t + play + 0.02);
    return true;
  }

  // a little cat voice: a gliding saw (with vibrato) through two vowel formants that sweep from "ee" to "ow", plus a breath of noise.
  // Each cat has its own pitch. kinds: pick (mee-ow), happy (short mew), cheer (quick high mew), sad (long falling mrrow), worried (wobbly mew).
  meow(id, kind = 'pick', delay = 0) {
    if (!this.ctx || !this.on || this.meowsOn === false) return;   // meowsOn: the Settings toggle for cat voices
    const c = this.ctx, clock = c.currentTime;
    if (!delay) { if (clock - (this.last.meow || 0) < 0.12) return; this.last.meow = clock; }
    const now = clock + delay, h = hashStr(id);
    if (this.meowBuf) {   // the real recordings, each cat with its own clip and pitch; the synth below is the fallback
      const plan = meowPlan(id, kind, Math.random());
      this.sampleAt(plan.clip, now, { rate: plan.rate, v: plan.gain, wobble: plan.wobble, bus: this.sfxBus });
      return;
    }
    const low = kind === 'sad' || kind === 'worried';
    const base = (low ? 270 : 340) + (h % 240) * (kind === 'sad' ? 0.8 : 1.1) + (kind === 'cheer' ? 90 : 0);
    const dur = { pick: 0.38, happy: 0.24, cheer: 0.18, sad: 0.65, worried: 0.5 }[kind] || 0.3;
    const osc = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), master = c.createGain();
    osc.type = 'sawtooth';
    const f = osc.frequency;
    f.setValueAtTime(base * 0.8, now);
    if (low) { f.linearRampToValueAtTime(base * 1.1, now + dur * 0.25); f.exponentialRampToValueAtTime(base * 0.55, now + dur); }
    else { f.linearRampToValueAtTime(base * 1.3, now + dur * 0.3); f.exponentialRampToValueAtTime(base * 0.8, now + dur); }
    lfo.frequency.value = kind === 'worried' ? 9 : 22; lg.gain.value = base * (kind === 'worried' ? 0.06 : 0.02); lfo.connect(lg); lg.connect(f);
    // F1 opens as the mouth does, F2 slides down from "ee" to "ow" (and the other way round for the sad, falling one)
    const formants = [[480, 780, 5, 0.9], low ? [1300, 2200, 6, 0.6] : [2400, 1000, 6, 0.7]];
    for (const [f0, f1, q, vol] of formants) {
      const bp = c.createBiquadFilter(), fg = c.createGain();
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, now); bp.frequency.linearRampToValueAtTime(f1, now + dur * 0.8);
      fg.gain.value = vol;
      osc.connect(bp); bp.connect(fg); fg.connect(master);
    }
    master.gain.setValueAtTime(0.0001, now); master.gain.exponentialRampToValueAtTime(0.6, now + 0.04); master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    master.connect(this.sfxBus);
    osc.start(now); lfo.start(now); osc.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
    this.noiseAt(now, Math.min(0.12, dur * 0.5), 0.03, { type: 'highpass', freq: 3500 });   // the breath at the start of the mew
  }

  // a soft purr: a low saw through a low-pass, its volume chopped by a 24 Hz wobble, fading in and out over about a second
  purr() {
    const c = this.ctx; if (!c) return;
    const now = c.currentTime, dur = 1.1;
    const osc = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), am = c.createOscillator(), amg = c.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 58;
    lp.type = 'lowpass'; lp.frequency.value = 260;
    am.frequency.value = 24; amg.gain.value = 0.5; am.connect(amg); amg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.5, now + 0.25); g.gain.setValueAtTime(0.5, now + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(lp); lp.connect(g); g.connect(this.sfxBus);
    osc.start(now); am.start(now); osc.stop(now + dur + 0.05); am.stop(now + dur + 0.05);
  }

  play(name, pitch = 1) {
    const now = performance.now();
    const gap = { hit: 45, swipe: 60, shoot: 70, pop: 40, flame: 120, zap: 80, boom: 80, coin: 40, hover: 60, ui: 50, back: 80, pip: 140, merge: 120, waveclear: 500, nestdown: 500 }[name] || 0;
    if (gap && now - (this.last[name] ?? -Infinity) < gap) return;
    this.last[name] = now;
    if (DUCK[name]) this.duckMusic(DUCK[name][0], DUCK[name][1]);
    switch (name) {
      case 'coin': this.tone(1320 + Math.random() * 200, 0.09, { type: 'triangle', v: 0.07 }); this.tone(1760, 0.14, { type: 'sine', v: 0.05, delay: 0.05 }); break;
      case 'boxopen': [0, 0.09, 0.18, 0.27].forEach((d, i) => { this.tone(150 + i * 25, 0.07, { type: 'square', v: 0.05, delay: d }); this.noiseAt(this.ctx.currentTime + d, 0.05, 0.05, { freq: 1800 + i * 300 }); }); this.tone(200, 0.16, { to: 640, type: 'sine', v: 0.16, delay: 0.4 }); this.noiseAt(this.ctx.currentTime + 0.4, 0.14, 0.1, { freq: 3200 }); [1568, 1976, 2349].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', v: 0.05, delay: 0.5 + i * 0.05 })); break;
      case 'boxbuild': this.tone(140, 1.0, { to: 560, type: 'sawtooth', v: 0.05, lp: 1100 }); this.tone(66, 1.0, { to: 190, type: 'sine', v: 0.13 }); this.noise(1.0, 0.05, 1500); break;   // a second of rising tension while the box shakes
      case 'boxtick': this.tone(240 * pitch, 0.05, { type: 'square', v: 0.045, lp: 1800 }); this.noiseAt(this.ctx.currentTime, 0.03, 0.04, { freq: 2600 }); break;
      case 'boxburst': this.noise(0.4, 0.3, 2600); this.tone(120, 0.42, { to: 38, type: 'sine', v: 0.32 }); [880, 1175, 1568, 2093].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', v: 0.09, delay: 0.02 + i * 0.035 })); break;
      case 'stamp': this.tone(96, 0.16, { to: 46, type: 'sine', v: 0.3 }); this.noise(0.09, 0.2, 1300); break;   // the rarity label slamming down
      case 'newrelic': this.tone(1568, 0.1, { type: 'triangle', v: 0.09 }); this.tone(2093, 0.18, { type: 'sine', v: 0.08, delay: 0.08 }); break;
      case 'revealrare': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', v: 0.1, delay: i * 0.06 })); break;
      case 'revealepic': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.24, { type: 'triangle', v: 0.11, delay: i * 0.065 })); this.tone(2093, 0.5, { type: 'sine', v: 0.06, delay: 0.34 }); this.noise(0.3, 0.05, 6000); break;
      case 'revealleg': [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', v: 0.12, delay: i * 0.07 })); this.tone(196, 0.8, { type: 'sawtooth', v: 0.06, lp: 700 }); this.tone(2637, 0.7, { type: 'sine', v: 0.06, delay: 0.5 }); this.noise(0.5, 0.06, 7000); break;
      case 'revealmyth': [330, 440, 523, 659, 880, 1047, 1319, 1760].forEach((f, i) => this.tone(f, 0.36, { type: i % 2 ? 'triangle' : 'sine', v: 0.12, delay: i * 0.075 })); this.tone(165, 1.1, { type: 'sawtooth', v: 0.07, lp: 600 }); [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.6, { type: 'sine', v: 0.05, delay: 0.6 + i * 0.12 })); this.noise(0.7, 0.07, 8000); break;
      case 'chest': [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', v: 0.12, delay: i * 0.05 })); this.noise(0.12, 0.08, 5000); break;
      case 'equip': this.tone(300, 0.07, { type: 'square', v: 0.08 }); this.tone(900, 0.12, { type: 'triangle', v: 0.1, delay: 0.06 }); break;
      case 'upgrade': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', v: 0.13, delay: i * 0.06 })); this.tone(130, 0.3, { to: 70, type: 'sine', v: 0.2 }); break;
      case 'reroll': this.tone(500, 0.05, { type: 'square', v: 0.06 }); this.tone(700, 0.05, { type: 'square', v: 0.06, delay: 0.06 }); this.tone(950, 0.08, { type: 'square', v: 0.06, delay: 0.12 }); break;
      case 'hover': this.tone(880, 0.03, { type: 'sine', v: 0.07 }); break;
      case 'achieve': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', v: 0.13, delay: i * 0.07 })); this.tone(2093, 0.4, { type: 'sine', v: 0.06, delay: 0.38 }); break;
      case 'synergy': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.14, { type: 'sawtooth', v: 0.05, delay: i * 0.05 })); this.tone(1320, 0.3, { type: 'sine', v: 0.07, delay: 0.2 }); break;
      case 'route': this.tone(392, 0.12, { type: 'triangle', v: 0.1 }); this.tone(588, 0.2, { type: 'triangle', v: 0.1, delay: 0.1 }); break;
      case 'thunder': this.noise(1.1, 0.22, 380); this.tone(58, 0.9, { to: 32, type: 'sine', v: 0.22 }); break;
      case 'swipe': this.noise(0.08, 0.12, 4000); this.tone(520, 0.07, { to: 260, type: 'triangle', v: 0.08 }); break;
      case 'hit': this.tone(190, 0.06, { to: 90, type: 'square', v: 0.07 }); break;
      case 'shoot': this.tone(700, 0.09, { to: 380, type: 'triangle', v: 0.09 }); break;
      case 'bang': this.noise(0.16, 0.3, 1800); this.tone(120, 0.14, { to: 50, type: 'sawtooth', v: 0.14 }); break;
      case 'flame': this.noise(0.12, 0.2, 900); break;
      case 'zap': this.tone(900, 0.14, { to: 200, type: 'sawtooth', v: 0.08 }); this.noise(0.1, 0.08, 6000); break;
      case 'boom': this.noise(0.35, 0.34, 700); this.tone(90, 0.3, { to: 40, type: 'sine', v: 0.3 }); break;
      case 'pop': this.tone((420 + Math.random() * 120) * pitch, 0.1, { to: 900 * pitch, type: 'sine', v: 0.1 }); break;
      case 'ko': this.tone(400, 0.4, { to: 90, type: 'triangle', v: 0.18 }); break;
      case 'heal': this.tone(660, 0.12, { type: 'sine', v: 0.1 }); this.tone(880, 0.16, { type: 'sine', v: 0.1, delay: 0.08 }); break;
      case 'heart': this.tone(72, 0.14, { to: 52, type: 'sine', v: 0.2 }); this.tone(60, 0.16, { to: 44, type: 'sine', v: 0.15, delay: 0.17 }); break;
      case 'nope': this.tone(220, 0.09, { to: 170, type: 'square', v: 0.09, lp: 900 }); this.tone(170, 0.14, { to: 120, type: 'square', v: 0.09, lp: 700, delay: 0.1 }); break;   // a soft two-step "uh-uh" for a refused tap
      case 'purr': this.purr(); break;
      case 'ui': this.tone(520, 0.06, { type: 'triangle', v: 0.1 }); break;
      case 'pick': [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', v: 0.14, delay: i * 0.07 })); break;
      case 'merge': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'sine', v: 0.08, delay: i * 0.05 })); this.tone(2349, 0.3, { type: 'sine', v: 0.04, delay: 0.2 }); break;   // a soft rising sparkle
      case 'back': this.tone(470, 0.05, { to: 340, type: 'triangle', v: 0.08 }); break;
      case 'pip': this.tone(1480, 0.07, { type: 'sine', v: 0.05 }); break;
      case 'waveclear': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', v: 0.1, delay: i * 0.07 })); this.tone(2093, 0.45, { type: 'sine', v: 0.05, delay: 0.42 }); break;   // short bright arpeggio
      case 'nestdown': this.noise(0.5, 0.3, 900); this.tone(100, 0.45, { to: 38, type: 'sine', v: 0.3 }); this.tone(180, 0.2, { to: 60, type: 'sawtooth', v: 0.1 }); [1046, 1318, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', v: 0.06, delay: 0.3 + i * 0.07 })); break;   // crash, then a rising sparkle
      case 'wave': this.tone(330, 0.2, { type: 'triangle', v: 0.14 }); this.tone(440, 0.25, { type: 'triangle', v: 0.14, delay: 0.14 }); break;
      case 'boss': this.tone(110, 0.7, { to: 70, type: 'sawtooth', v: 0.22 }); this.tone(165, 0.7, { to: 90, type: 'square', v: 0.1 }); this.noise(0.5, 0.2, 500); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', v: 0.14, delay: i * 0.09 })); break;
      case 'win': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', v: 0.14, delay: i * 0.1 })); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', v: 0.16, delay: i * 0.22 })); break;
      case 'zoom': this.tone(300, 0.5, { to: 1200, type: 'sawtooth', v: 0.12 }); break;
      case 'special': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, { type: i % 2 ? 'triangle' : 'square', v: 0.09, delay: i * 0.045 })); this.tone(130, 0.5, { to: 260, type: 'sawtooth', v: 0.1 }); break;
      case 'shield': this.tone(1500, 0.12, { to: 500, type: 'triangle', v: 0.1 }); this.noise(0.1, 0.07, 4500); break;
      case 'roar': this.tone(140, 0.5, { to: 60, type: 'sawtooth', v: 0.2 }); this.noise(0.4, 0.16, 600); break;
      default: break;
    }
  }

  // ---- soundtrack: a look-ahead scheduler (25 ms timer, notes placed on the audio clock a little ahead).
  // Songs switch on bar lines with a crossfade between two song buses, so there are no clicks.
  music(mode) {
    if (mode !== this.mode) this.mode = mode;
    if (!this.ctx) return;
    if (!this.vh && typeof document !== 'undefined' && document.addEventListener) {
      this.vh = () => this.onVisibility();
      document.addEventListener('visibilitychange', this.vh);
    }
    this.running = true;
    this.startTimer();
  }
  setMusic(mode, theme) { if (theme !== undefined) this.setTheme(theme); this.music(mode); }
  setTheme(idx) {
    const n = Math.floor(Number(idx));
    this.theme = Number.isFinite(n) ? ((n % THEME_COUNT) + THEME_COUNT) % THEME_COUNT : 0;
  }
  startTimer() {
    if (this.timer || !this.ctx) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.pump(), 25);
  }
  pauseTimer() { if (this.timer) { clearInterval(this.timer); this.timer = 0; } }
  onVisibility() {
    const c = this.ctx;
    if (!c) return;
    if (document.hidden) { this.pauseTimer(); try { if (c.suspend) c.suspend(); } catch (e) { /* optional */ } }
    else { try { if (c.resume) c.resume(); } catch (e) { /* optional */ } if (this.running) this.startTimer(); }
  }
  // stop the soundtrack: no timer, no new notes, the current song fades out
  stopMusic() {
    this.running = false; this.pauseTimer();
    const c = this.ctx;
    if (c && this.busNode) { this.fadeOut(this.busNode, c.currentTime, 0.3); this.busNode = null; }
    this.song = null; this.songKey = ''; this.bus = null;
  }
  fadeOut(node, t, d) {
    try { node.g.gain.setValueAtTime(1, t); node.g.gain.linearRampToValueAtTime(0.0001, t + d); } catch (e) { /* optional */ }
    const id = setTimeout(() => { this.timers = this.timers.filter((x) => x !== id); try { node.g.disconnect(); node.f.disconnect(); } catch (e) { /* optional */ } }, (d + 1.5) * 1000);
    if (id && id.unref) id.unref();
    this.timers.push(id);
  }
  makeBus(song, t, fade) {
    const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = song.def.lpf; f.Q.value = 0.5;
    g.connect(f); f.connect(this.duck || this.mus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + fade);
    return { g, f };
  }
  // called on a bar line: switch song when the wanted mode or theme differs from the playing one
  applyWanted(t) {
    const want = songInfo(this.theme, this.mode), key = want.theme + want.mode;
    if (key === this.songKey && this.song) return;
    const old = this.busNode;
    this.busNode = this.makeBus(want, t, old ? 0.5 : 0.05);
    if (old) this.fadeOut(old, t, 0.9);
    this.bus = this.busNode.g; this.song = want; this.songKey = key; this.step = 0;
  }
  pump() {
    const c = this.ctx;
    if (!c || !this.running) return;
    if (!this.on || !this.musicOn || (typeof document !== 'undefined' && document.hidden)) { this.nextT = c.currentTime + 0.1; return; }
    const now = c.currentTime;
    if (this.nextT < now - 0.1) this.nextT = now + 0.05;
    for (let guard = 0; guard < 8 && this.nextT < now + 0.15; guard++) {
      if (!this.song || this.step % 16 === 0) this.applyWanted(this.nextT);
      const sg = this.song, bar = Math.floor(this.step / 16) % 16, s = this.step % 16;
      this.stepAt(sg, bar, s, this.nextT);
      this.nextT += sg.spb; this.step++;
    }
  }
  // voice budget: every oscillator or noise source scheduled counts until it has ended; low priority notes go first
  reserve(t, dur, n, pri) {
    const a = this.vend, now = this.ctx.currentTime;
    let k = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > now) a[k++] = a[i];
    a.length = k;
    const lim = pri === 0 ? MUSIC_VOICE_CAP * 0.65 : pri === 1 ? MUSIC_VOICE_CAP : MUSIC_VOICE_CAP * 1.25;
    if (k + n > lim) return false;
    for (let i = 0; i < n; i++) a.push(t + dur + 0.05);
    if (a.length > this.peakVoices) this.peakVoices = a.length;
    return true;
  }
  // a melody note sung by a recorded meow, pitched to the note. False when no recording is near enough (the caller plays the song's own lead instead).
  meowNote(f, t, dur, v, pri) {
    const pick = clipForNote(f, f === this.lastMewF ? this.lastMew : undefined);
    if (!pick) return false;
    if (!this.reserve(t, dur, 1, pri)) return true;
    this.lastMew = pick.clip.id; this.lastMewF = f;
    if (this.noteLog) this.noteLog.push({ inst: 'mewlead', f, t, dur, v, pri, song: this.songKey });
    this.sampleAt(pick.clip, t, { rate: pick.rate, from: 0.1, dur: Math.max(0.16, dur * 1.15), v: v * MEW_LEAD_GAIN, bus: this.bus, fin: 0.012, fout: 0.07 });
    return true;
  }
  voice(inst, f, t, dur, v, pri = 1) {
    if (!this.ctx || !this.bus) return;
    if (inst === 'mewlead') {
      if (this.meowBuf && this.meowMusicOn !== false && this.meowNote(f, t, dur, v, pri)) return;   // meowMusicOn: the Settings toggle for meows in the soundtrack
      inst = (this.song && this.song.def.lead) || 'pluck';
    }
    const I = INST[inst] || INST.pluck, P = I.p;
    if (!this.reserve(t, dur, P.length, pri)) return;
    if (this.noteLog) this.noteLog.push({ inst, f, t, dur, v, pri, song: this.songKey });
    for (let i = 0; i < P.length; i++) {
      const p = P[i], ff = f * p[1] * (p[5] ? Math.pow(2, p[5] / 1200) : 1);
      this.toneAt(I.bend ? ff * I.bend : ff, t, Math.max(0.03, dur * p[3]), { type: p[0], v: v * p[2], attack: p[4], bus: this.bus, lp: I.lp, to: I.bend ? ff : 0 });
    }
  }
  // the meow drum kit: a low meow dropping in pitch for the kick, the hissy aggressive one for snare and hat
  mewDrum(kind, t, v, hi) {
    const k = MEW_KIT[kind] || MEW_KIT.hat;
    if (!this.reserve(t, k.dur, k.thump ? 2 : 1, kind === 'kick' ? 2 : hi ? 0 : 1)) return;
    if (this.noteLog) this.noteLog.push({ inst: kind, f: 0, t, dur: k.dur, v, pri: 1, song: this.songKey });
    if (k.thump) this.toneAt(150, t, 0.13, { type: 'sine', to: 42, v: v * k.thump, bus: this.bus });
    this.sampleAt(k.clip, t, { from: k.from, dur: k.dur, rate: k.rate, rateTo: k.rateTo, v: v * k.gain, bus: this.bus, lp: k.lp, hp: k.hp, fin: 0.002, fout: Math.min(0.05, k.dur * 0.5) });
  }
  drum(kind, t, v, hi) {
    if (!this.ctx || !this.bus) return;
    if (this.meowBuf && this.meowMusicOn !== false && this.song && this.song.def.mewKit) return this.mewDrum(kind, t, v, hi);
    if (!this.reserve(t, 0.13, 1, kind === 'kick' ? 2 : hi ? 0 : 1)) return;
    if (this.noteLog) this.noteLog.push({ inst: kind, f: 0, t, dur: 0.13, v, pri: 1, song: this.songKey });
    if (kind === 'kick') this.toneAt(150, t, 0.13, { type: 'sine', to: 42, v, bus: this.bus });
    else if (kind === 'snare') this.noiseAt(t, 0.11, v, { type: 'highpass', freq: 1800, bus: this.bus });
    else this.noiseAt(t, 0.04, v, { type: 'highpass', freq: 7000, bus: this.bus });
  }
  stepAt(sg, bar, s, t) {
    const evs = sg.bars[bar][s], d = sg.def, tt = (s & 1) && d.swing ? t + d.swing * sg.spb : t, lv = this.intensity;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.k === 'kick' || e.k === 'snare' || e.k === 'hat') this.drum(e.k, e.k === 'kick' ? t : tt, e.v, e.k === 'hat');
      else {
        this.voice(e.inst, e.f, tt, e.dur, e.v, e.pri);
        if (lv > 0.85 && e.k === 'mel' && d.drums) this.voice(e.inst, e.f * 2, tt, e.dur, e.v * 0.4, 0);
      }
    }
    // intensity layers (combo): off-beat hats, then an extra running arpeggio
    if (d.drums && (s & 1)) {
      if (lv > 0.35) this.drum('hat', tt, 0.035, true);
      if (lv > 0.6) {
        const ch = sg.chords[bar % 8];
        this.voice(d.arpInst, sg.def.root * 4 * Math.pow(2, (ch[(s >> 1) % ch.length] % 12) / 12), tt, sg.spb * 1.5, 0.02, 0);
      }
    }
  }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, Number(v) || 0)); }
  duckMusic(depth, rec) {
    if (!this.ctx || !this.duck || !this.musicOn) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.duck || -9) < 0.15) return;
    this.last.duck = now;
    try {
      const p = this.duck.gain;
      p.setValueAtTime(1, now); p.linearRampToValueAtTime(depth, now + 0.03); p.linearRampToValueAtTime(1, now + 0.03 + rec);
    } catch (e) { /* optional */ }
  }
}
