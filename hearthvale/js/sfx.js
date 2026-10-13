// Hearthvale sound effects: pure recipes + pure helpers. No audio files, everything is synthesised.
//
// This module has NO top-level Web Audio use, so the helpers (note maths, rng, VoiceLimiter) run in Node tests.
// The engine in audio.js owns the AudioContext and calls a recipe as  recipe(k, opts)  where k is the "voice kit":
//   k.ctx   BaseAudioContext      k.t   start time (s)        k.out   GainNode the recipe connects to
//   k.pm    pitch multiplier (round robin + jitter + caller pitch)      k.v   round-robin variant 0..3
//   k.r()   seeded random 0..1    k.E   engine (noise buffers)         k.nodes  every node created (disconnected at the end)
//   k.end   latest time the voice makes sound (recipes only raise it through the helpers)
//
// Design notes (research summary, from game audio practice):
//  * Cozy life-sim sound is built from soft mallets (marimba, kalimba, glockenspiel) on a pentatonic set, so any
//    random combination of notes is consonant. Tuned bars have inharmonic overtones: marimba ~1:3.9:9.2, kalimba ~1:5.4,
//    glockenspiel ~1:2.76:5.4:8.9. Overtones decay much faster than the fundamental, which is what makes it "woody".
//  * UI pops are short sine blips with a quick upward pitch glide (a bubble rising) plus a few ms of high-passed noise
//    for the attack transient. Confirmations rise, cancellations fall, denials are soft low double thuds (never buzzers).
//  * Never fire the same sample twice identically: every call gets round-robin pitch offsets (4 variants, shuffled so a
//    variant never repeats back to back) plus a small random jitter. Frequent sounds also get a per-name cooldown.
//  * Foley is filtered noise: wood chop = low sine thud + band-passed crack, stone = inharmonic metal tink + grit,
//    water = band-passed noise + sine "bubbles" with rising pitch, footsteps = low-passed noise bursts.
//  * Animal calls use a sawtooth glottal source (or pulse train) through 2 to 3 parallel band-pass formant filters whose
//    centre frequencies glide between vowels; vibrato and tremolo give bleats and trills.
//  * Envelopes use linear attack + setTargetAtTime exponential decay (click free, cheap). Detuned partials beat softly.
//  * Loudness: sounds are calibrated per category to a K-weighted momentary loudness (see TRIM and lab/audio.html).

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------------------------
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C#4' -> 61 (middle C is C4 = 60). NaN when the name is invalid. */
export function noteToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name); if (!m) return NaN;
  return 12 * (+m[3] + 1) + NOTE_IDX[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const noteFreq = (name) => midiToFreq(noteToMidi(name));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-9));
/** Small fast seeded PRNG (mulberry32): returns a function giving floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Semitone offsets from the root. 'majPent' is the workhorse: every combination of its notes is consonant. */
export const SCALES = {
  majPent: [0, 2, 4, 7, 9], minPent: [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
};
/** MIDI note of scale degree `deg` (any integer, negative or beyond one octave) above `root`. */
export function scaleNote(root, scale, deg) {
  const s = typeof scale === 'string' ? SCALES[scale] : scale, n = s.length;
  const oct = Math.floor(deg / n), i = ((deg % n) + n) % n;
  return root + oct * 12 + s[i];
}
/** Fold a midi note into [lo, lo+12) keeping its pitch class (used to voice chords and bass). */
export function foldMidi(m, lo) { return lo + (((m - lo) % 12) + 12) % 12; }
/** Weighted pick from an array of [item, weight]; r is a 0..1 random number. */
export function pickWeighted(list, r) {
  let tot = 0; for (let i = 0; i < list.length; i++) tot += list[i][1];
  let x = r * tot; for (let i = 0; i < list.length; i++) { x -= list[i][1]; if (x < 0) return list[i][0]; }
  return list[list.length - 1][0];
}

/**
 * Voice limiter: fixed number of slots, no allocation per call. request() returns the slot index to use, or -1 when the
 * new voice is quieter than everything already playing (it is then dropped). When all slots are busy the quietest
 * voice (volume scaled by how much of it is left) is evicted and its slot is reused: `evicted` is that slot, else -1.
 */
export class VoiceLimiter {
  constructor(max = 24) {
    this.max = max; this.end = new Float64Array(max); this.t0 = new Float64Array(max); this.vol = new Float64Array(max);
    this.used = new Uint8Array(max); this.evicted = -1; this.count = 0;
  }
  purge(now) { let n = 0; for (let i = 0; i < this.max; i++) { if (this.used[i] && this.end[i] <= now) this.used[i] = 0; if (this.used[i]) n++; } this.count = n; return n; }
  request(now, end, vol) {
    this.purge(now); this.evicted = -1; let slot = -1;
    for (let i = 0; i < this.max; i++) if (!this.used[i]) { slot = i; break; }
    if (slot < 0) {
      let q = -1, qv = Infinity;
      for (let i = 0; i < this.max; i++) {
        const span = Math.max(1e-3, this.end[i] - this.t0[i]), left = clamp((this.end[i] - now) / span, 0, 1), eff = this.vol[i] * (0.25 + 0.75 * left);
        if (eff < qv) { qv = eff; q = i; }
      }
      if (vol < qv) return -1;
      slot = q; this.evicted = q;
    }
    this.used[slot] = 1; this.end[slot] = end; this.t0[slot] = now; this.vol[slot] = vol; this.count = Math.min(this.max, this.count + 1);
    return slot;
  }
  release(slot) { if (slot >= 0 && slot < this.max) this.used[slot] = 0; }
}

/** Soft clip transfer curve: linear below `knee`, smoothly saturating to `ceil` (so output can never exceed ceil). */
export function softClipCurve(n = 2048, knee = 0.8, ceil = 0.97) {
  const c = new Float32Array(n), w = ceil - knee;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); c[i] = a <= knee ? x : Math.sign(x) * (knee + w * Math.tanh((a - knee) / w)); }
  return c;
}

// ---------------------------------------------------------------------------------------------------------------
// Voice kit helpers (all take the kit k as first argument and schedule against k.t)
// ---------------------------------------------------------------------------------------------------------------
const nd = (k, n) => { k.nodes.push(n); return n; };
const bump = (k, t) => { if (t > k.end) k.end = t; };
function adsr(p, t, v, a, tau) { p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + a); p.setTargetAtTime(0, t + a, tau); }

/** One oscillator with envelope. o: f, f2 (glide target), sw (glide time), type, a (attack), d (decay tau), v, t (offset), det (cents), len, dest, fx (ignore pitch multiplier). */
export function tone(k, o) {
  const c = k.ctx, t = k.t + (o.t || 0), a = o.a === undefined ? 0.004 : o.a, d = o.d || 0.1, len = o.len || a + d * 6.5, pm = o.fx ? 1 : k.pm;
  const s = nd(k, c.createOscillator()), g = nd(k, c.createGain());
  s.type = o.type || 'sine'; s.frequency.setValueAtTime(o.f * pm, t);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2 * pm, t + (o.sw || 0.06));
  if (o.det) s.detune.value = o.det;
  adsr(g.gain, t, o.v === undefined ? 0.3 : o.v, a, d);
  s.connect(g); g.connect(o.dest || k.out); s.start(t); s.stop(t + len); bump(k, t + len);
  return g;
}
/** Filtered noise burst. o: type (bandpass|lowpass|highpass), f, f2, sw, q, color (white|pink|brown), a, d, v, t, len, dest. */
export function nz(k, o) {
  const c = k.ctx, t = k.t + (o.t || 0), a = o.a === undefined ? 0.003 : o.a, d = o.d || 0.05, len = Math.min(2.6, o.len || a + d * 6.5);
  const B = k.E.noise[o.color || 'white'], s = nd(k, c.createBufferSource()); s.buffer = B;
  const f = nd(k, c.createBiquadFilter()); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime((o.f || 1000) * k.pm, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2 * k.pm, t + (o.sw || len * 0.7));
  f.Q.value = o.q === undefined ? 0.9 : o.q;
  const g = nd(k, c.createGain()); adsr(g.gain, t, o.v === undefined ? 0.3 : o.v, a, d);
  s.connect(f); f.connect(g); g.connect(o.dest || k.out);
  s.start(t, k.r() * (B.duration - len - 0.1), len); bump(k, t + len);
  return g;
}
/** Shared low-pass filter node feeding `dest` (default k.out): use as `dest` of tone/nz to tame bright oscillators. */
export function lp(k, f, q, dest) { const n = nd(k, k.ctx.createBiquadFilter()); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q === undefined ? 0.5 : q; n.connect(dest || k.out); return n; }
/** Bubble pop: a sine whose pitch rises while it decays. */
export function bub(k, t, f, v, len = 0.08) { tone(k, { t, f, f2: f * 1.8, sw: len * 0.8, a: 0.003, d: len * 0.42, v }); }

// Mallet instruments: partial table [ratio, amplitude, decay scale], base decay tau, noise tick amount
const MAL = {
  marimba: { p: [[1, 1, 1], [3.95, 0.34, 0.2], [9.2, 0.07, 0.08]], d: 0.26, tk: 0.3 },
  kalimba: { p: [[1, 1, 1], [1.004, 0.4, 0.9], [5.4, 0.2, 0.16], [10.6, 0.05, 0.06]], d: 0.5, tk: 0.22 },
  glock: { p: [[1, 1, 1], [2.76, 0.45, 0.5], [5.4, 0.28, 0.3], [8.93, 0.12, 0.15]], d: 0.6, tk: 0.14 },
  bell: { p: [[0.5, 0.5, 1], [1, 1, 1], [1.19, 0.35, 0.8], [1.5, 0.3, 0.7], [2, 0.45, 0.6], [2.5, 0.2, 0.4], [4.1, 0.1, 0.25]], d: 0.5, tk: 0.1 },
  tube: { p: [[1, 1, 1], [2.76, 0.5, 0.45], [5.4, 0.2, 0.2]], d: 0.7, tk: 0.04 },
  harp: { p: [[1, 1, 1], [2, 0.35, 0.5], [3, 0.16, 0.3]], d: 0.55, tk: 0.1, type: 'triangle' },
};
/** One mallet note. kind: marimba|kalimba|glock|bell|tube|harp. f in Hz, v amplitude, t offset, dm decay multiplier, dark 0..1 mutes overtones. */
export function mal(k, kind, f, v, t = 0, dm = 1, dark = 0) {
  const K = MAL[kind], pm = k.pm;
  for (let i = 0; i < K.p.length; i++) {
    const p = K.p[i], hz = f * p[0] * pm; if (hz > 11000) continue;
    const amp = i === 0 ? 1 : 1 - dark * 0.85;
    tone(k, { t, f: f * p[0], v: v * p[1] * amp, a: 0.002, d: K.d * dm * p[2], type: K.type || 'sine' });
  }
  if (K.tk > 0 && dark < 0.8) nz(k, { t, type: 'highpass', f: 3500, q: 0.5, a: 0.001, d: 0.007, v: v * K.tk });
}
/** Play midi notes one after another: arp(k, 'kalimba', [72,76,79], gap, v, t0). */
export function arp(k, kind, notes, gap, v, t0 = 0, dm = 1) { for (let i = 0; i < notes.length; i++) mal(k, kind, midiToFreq(notes[i]), v, t0 + i * gap, dm); }
/** Soft sparkle: random high glockenspiel flecks. */
export function sparkle(k, n, t0, span, v, base = 84) {
  for (let i = 0; i < n; i++) mal(k, 'glock', midiToFreq(scaleNote(base, 'majPent', Math.floor(k.r() * 7))), v * (0.6 + k.r() * 0.4), t0 + (i / n) * span + k.r() * span / n * 0.6, 0.35);
}
/** Formant voice: sawtooth source through parallel band-pass formants. o: f0, f1 (glide), f2, dur, a, rel, v, t, vib [hz, cents], am [hz, depth], fm [[freq, q, gain, freqEnd], ...], type. */
export function vox(k, o) {
  const c = k.ctx, t = k.t + (o.t || 0), dur = o.dur, a = o.a === undefined ? 0.012 : o.a, rel = o.rel === undefined ? 0.05 : o.rel, pm = k.pm;
  const s = nd(k, c.createOscillator()); s.type = o.type || 'sawtooth'; s.frequency.setValueAtTime(o.f0 * pm, t);
  if (o.f1) s.frequency.linearRampToValueAtTime(o.f1 * pm, t + dur * (o.f2 ? 0.5 : 1));
  if (o.f2) s.frequency.linearRampToValueAtTime(o.f2 * pm, t + dur);
  const env = nd(k, c.createGain()), v = o.v === undefined ? 0.3 : o.v;
  env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(v, t + a); env.gain.setValueAtTime(v, t + Math.max(a, dur - rel)); env.gain.linearRampToValueAtTime(0, t + dur);
  let tail = env;
  if (o.am) { const amg = nd(k, c.createGain()), l = nd(k, c.createOscillator()), lg = nd(k, c.createGain()); amg.gain.value = 1 - o.am[1] * 0.5; l.frequency.value = o.am[0]; lg.gain.value = o.am[1] * 0.5; l.connect(lg); lg.connect(amg.gain); l.start(t); l.stop(t + dur + 0.05); env.connect(amg); tail = amg; }
  if (o.vib) { const l = nd(k, c.createOscillator()), lg = nd(k, c.createGain()); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + dur + 0.05); }
  const fm = o.fm;
  for (let i = 0; i < fm.length; i++) {
    const F = fm[i], bp = nd(k, c.createBiquadFilter()), fg = nd(k, c.createGain());
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(F[0] * pm, t); if (F[3]) bp.frequency.linearRampToValueAtTime(F[3] * pm, t + dur); bp.Q.value = F[1]; fg.gain.value = F[2];
    s.connect(bp); bp.connect(fg); fg.connect(env);
  }
  tail.connect(o.dest || k.out); s.start(t); s.stop(t + dur + 0.05); bump(k, t + dur + 0.05);
}
/** Bird style chirp: a sine glide with a faint second harmonic. */
export function chirp(k, t, f, f2, dur, v) {
  tone(k, { t, f, f2, sw: dur * 0.9, a: 0.008, d: dur * 0.3, len: dur * 1.4, v });
  tone(k, { t, f: f * 2, f2: f2 * 2, sw: dur * 0.9, a: 0.008, d: dur * 0.25, len: dur * 1.2, v: v * 0.16 });
}

// ---------------------------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------------------------
/** name -> { name, cat, fn, pv (pitch variance), rev (reverb send), cd (cooldown s), max (same-name voices), vol } */
export const CATALOGUE = {};
function def(name, cat, spec, fn) { CATALOGUE[name] = { name, cat, fn, pv: 0.05, rev: 0.08, cd: 0.03, max: 4, vol: 1, ...spec }; }
const mf = midiToFreq, P = (deg, base = 72) => scaleNote(base, 'majPent', deg);
const sparkleHi = (k, t, v) => { for (let i = 0; i < 4; i++) tone(k, { t: t + i * 0.035, f: 2093 * (1 + i * 0.5), d: 0.14, v: v * (1 - i * 0.18), a: 0.002 }); };

// ---- UI -------------------------------------------------------------------------------------------------------
def('tap', 'ui', { pv: 0.07, rev: 0.04, cd: 0.02 }, (k) => { bub(k, 0, 520, 0.5, 0.07); nz(k, { type: 'highpass', f: 3500, q: 0.5, d: 0.008, v: 0.08 }); });
def('tap2', 'ui', { pv: 0.07, rev: 0.04, cd: 0.02 }, (k) => { bub(k, 0, 760, 0.42, 0.06); mal(k, 'kalimba', 1568, 0.1, 0, 0.25); });
def('back', 'ui', { pv: 0.05, rev: 0.05 }, (k) => { tone(k, { f: 640, f2: 400, sw: 0.1, d: 0.05, v: 0.45 }); nz(k, { type: 'highpass', f: 3000, d: 0.01, v: 0.06 }); });
def('open', 'ui', { pv: 0.04, rev: 0.12 }, (k) => { nz(k, { f: 500, f2: 2200, sw: 0.14, q: 1.2, a: 0.03, d: 0.05, v: 0.1 }); bub(k, 0, 440, 0.32, 0.1); mal(k, 'marimba', 659, 0.3, 0.07); });
def('close', 'ui', { pv: 0.04, rev: 0.12 }, (k) => { nz(k, { f: 2200, f2: 500, sw: 0.14, q: 1.2, a: 0.02, d: 0.05, v: 0.09 }); tone(k, { f: 700, f2: 430, sw: 0.1, d: 0.05, v: 0.3 }); mal(k, 'marimba', 523, 0.26, 0.05); });
def('tab', 'ui', { pv: 0.06, rev: 0.05, cd: 0.02 }, (k) => { tone(k, { f: 900, f2: 700, sw: 0.025, d: 0.03, v: 0.4 }); tone(k, { f: 1800, d: 0.015, v: 0.1 }); nz(k, { type: 'highpass', f: 4000, d: 0.006, v: 0.06 }); });
def('toggle', 'ui', { pv: 0.05, rev: 0.05 }, (k) => { bub(k, 0, 480, 0.4, 0.06); bub(k, 0.055, 720, 0.4, 0.06); nz(k, { type: 'highpass', f: 3500, d: 0.006, v: 0.05 }); });
def('confirm', 'ui', { pv: 0.03, rev: 0.14 }, (k) => { bub(k, 0, 400, 0.22, 0.07); mal(k, 'kalimba', 659, 0.5); mal(k, 'kalimba', 988, 0.5, 0.075); mal(k, 'glock', 1976, 0.1, 0.075, 0.4); });
def('deny', 'ui', { pv: 0.04, rev: 0.05 }, (k) => { const L = lp(k, 700); tone(k, { f: 210, f2: 150, sw: 0.1, d: 0.07, a: 0.006, v: 0.6, type: 'triangle', dest: L }); tone(k, { t: 0.11, f: 190, f2: 130, sw: 0.1, d: 0.08, a: 0.006, v: 0.55, type: 'triangle', dest: L }); });
def('hover', 'ui', { pv: 0.08, rev: 0.02, cd: 0.05, max: 2 }, (k) => { tone(k, { f: 1500, d: 0.014, a: 0.002, v: 0.2 }); nz(k, { type: 'highpass', f: 5000, d: 0.004, v: 0.03 }); });

// ---- economy --------------------------------------------------------------------------------------------------
const ting = (k, t, f, v) => { mal(k, 'glock', f, v, t, 0.42); tone(k, { t, f: f * 1.5, d: 0.05, v: v * 0.12 }); };
def('coin', 'economy', { pv: 0.04, rev: 0.12, cd: 0.04 }, (k) => { ting(k, 0, 1976, 0.4); ting(k, 0.075, 2637, 0.42); });
def('coins', 'economy', { pv: 0.03, rev: 0.16 }, (k) => { const n = 6 + (k.v & 1); for (let i = 0; i < n; i++) ting(k, i * (0.075 - i * 0.004) + k.r() * 0.012, 1760 + k.r() * 1500, 0.2 + k.r() * 0.15); nz(k, { type: 'bandpass', f: 6000, q: 1, a: 0.01, d: 0.12, v: 0.03, len: 0.4 }); });
def('cashRegister', 'economy', { pv: 0.02, rev: 0.12, max: 2 }, (k) => {
  tone(k, { f: 190, f2: 90, sw: 0.05, d: 0.05, v: 0.6 }); nz(k, { f: 1400, q: 0.8, d: 0.03, v: 0.25 });
  nz(k, { t: 0.1, type: 'bandpass', f: 900, f2: 2400, sw: 0.14, q: 2, a: 0.02, d: 0.05, v: 0.1 });
  mal(k, 'tube', 2093, 0.4, 0.17, 0.55); mal(k, 'tube', 2637, 0.3, 0.17, 0.45); nz(k, { t: 0.17, type: 'highpass', f: 5000, d: 0.01, v: 0.1 });
});
def('sell', 'economy', { pv: 0.03, rev: 0.14 }, (k) => { bub(k, 0, 600, 0.25, 0.07); ting(k, 0.05, 1568, 0.32); ting(k, 0.12, 1976, 0.34); ting(k, 0.19, 2349, 0.36); });
def('buy', 'economy', { pv: 0.04, rev: 0.12 }, (k) => { tone(k, { f: 820, f2: 380, sw: 0.09, d: 0.05, v: 0.4 }); ting(k, 0.07, 1760, 0.34); ting(k, 0.14, 2217, 0.3); });
def('unlock', 'economy', { pv: 0.02, rev: 0.3, max: 2 }, (k) => {
  tone(k, { f: 150, f2: 70, sw: 0.05, d: 0.04, v: 0.5 }); nz(k, { f: 2200, q: 2, d: 0.012, v: 0.15, t: 0.02 });
  for (let i = 0; i < 5; i++) mal(k, 'glock', mf(P(i + 1, 76)), 0.3, 0.14 + i * 0.07, 0.9);
  nz(k, { t: 0.12, type: 'highpass', f: 6000, a: 0.25, d: 0.3, v: 0.05 }); mal(k, 'bell', mf(84), 0.25, 0.5, 1.2);
});
def('reward', 'economy', { pv: 0.02, rev: 0.28, max: 2 }, (k) => {
  arp(k, 'kalimba', [72, 76, 79, 84], 0.075, 0.4, 0); arp(k, 'glock', [84, 88, 91, 96], 0.075, 0.2, 0.02, 0.8);
  mal(k, 'bell', mf(84), 0.25, 0.32, 1.1); mal(k, 'bell', mf(91), 0.18, 0.34, 1.1); sparkle(k, 5, 0.3, 0.4, 0.18);
});
def('giftReceived', 'economy', { pv: 0.03, rev: 0.28 }, (k) => {
  nz(k, { f: 1800, f2: 4200, sw: 0.1, q: 1.4, a: 0.02, d: 0.04, v: 0.1 }); bub(k, 0.0, 500, 0.3, 0.08);
  arp(k, 'marimba', [67, 71, 74], 0.09, 0.45, 0.1); mal(k, 'glock', mf(86), 0.25, 0.32, 0.8); sparkle(k, 5, 0.34, 0.4, 0.2);
});
def('giftSent', 'economy', { pv: 0.03, rev: 0.25 }, (k) => {
  nz(k, { f: 700, f2: 3000, sw: 0.18, q: 1, a: 0.04, d: 0.06, v: 0.1 }); bub(k, 0.05, 700, 0.3, 0.07);
  mal(k, 'kalimba', mf(79), 0.4, 0.12); mal(k, 'kalimba', mf(74), 0.36, 0.22); sparkle(k, 4, 0.26, 0.3, 0.16, 86);
});

// ---- world actions --------------------------------------------------------------------------------------------
def('place', 'world', { pv: 0.06, rev: 0.12, cd: 0.05 }, (k) => {
  tone(k, { f: 170, f2: 80, sw: 0.07, d: 0.06, v: 0.65 }); const L = lp(k, 650); nz(k, { type: 'lowpass', f: 650, d: 0.04, v: 0.35, dest: L });
  bub(k, 0.04, 620, 0.3, 0.08); mal(k, 'marimba', mf(P(k.v, 67)), 0.18, 0.06, 0.5);
});
def('build', 'world', { pv: 0.06, rev: 0.12, cd: 0.06 }, (k) => {
  for (let i = 0; i < 2; i++) { const t = i * 0.15; tone(k, { t, f: 320 + i * 60, f2: 210, sw: 0.03, d: 0.035, v: 0.55 }); nz(k, { t, f: 1700, q: 1.2, d: 0.02, v: 0.3 }); tone(k, { t, f: 140, f2: 90, sw: 0.04, d: 0.05, v: 0.3 }); }
  mal(k, 'marimba', mf(P(k.v + 1, 67)), 0.28, 0.3, 0.6);
});
def('buildDone', 'world', { pv: 0.02, rev: 0.26, max: 2 }, (k) => {
  tone(k, { f: 150, f2: 85, sw: 0.07, d: 0.07, v: 0.55 }); nz(k, { f: 1400, q: 1, d: 0.025, v: 0.25 });
  arp(k, 'marimba', [67, 71, 74, 79], 0.1, 0.45, 0.12); mal(k, 'marimba', mf(55), 0.3, 0.12, 1.2);
  mal(k, 'bell', mf(79), 0.22, 0.45, 1.1); mal(k, 'bell', mf(83), 0.16, 0.46, 1.1); sparkle(k, 5, 0.46, 0.5, 0.15);
});
def('upgrade', 'world', { pv: 0.02, rev: 0.28, max: 2 }, (k) => {
  for (let i = 0; i < 4; i++) { mal(k, 'marimba', mf(P(i, 65)), 0.36, i * 0.1, 0.7); tone(k, { t: i * 0.1, f: 300 + i * 40, f2: 200, sw: 0.025, d: 0.025, v: 0.3 }); }
  nz(k, { type: 'highpass', f: 4000, a: 0.3, d: 0.25, v: 0.05, len: 0.7 });
  tone(k, { t: 0.45, f: 120, f2: 70, sw: 0.06, d: 0.08, v: 0.5 }); mal(k, 'bell', mf(77), 0.28, 0.45, 1.1); mal(k, 'bell', mf(84), 0.2, 0.46, 1.1); sparkle(k, 4, 0.5, 0.35, 0.14);
});
def('demolish', 'world', { pv: 0.08, rev: 0.16, max: 2 }, (k) => {
  tone(k, { f: 95, f2: 48, sw: 0.18, d: 0.14, v: 0.7 }); const L = lp(k, 900);
  nz(k, { type: 'lowpass', f: 900, f2: 300, sw: 0.4, color: 'brown', a: 0.01, d: 0.18, v: 0.7, dest: L });
  for (let i = 0; i < 7; i++) { const t = 0.03 + k.r() * 0.35; tone(k, { t, f: 260 + k.r() * 380, f2: 150, sw: 0.03, d: 0.02, v: 0.22 * (1 - t) }); nz(k, { t, f: 2200 + k.r() * 1500, q: 1.5, d: 0.012, v: 0.2 * (1 - t) }); }
});
def('hammer', 'world', { pv: 0.1, rev: 0.1, cd: 0.08 }, (k) => {
  nz(k, { type: 'highpass', f: 3000, d: 0.006, v: 0.3 }); tone(k, { f: 1250, f2: 1180, sw: 0.05, d: 0.05, v: 0.3 }); tone(k, { f: 3000, d: 0.025, v: 0.12 });
  tone(k, { f: 180, f2: 110, sw: 0.04, d: 0.04, v: 0.55 });
});
def('sawing', 'world', { pv: 0.06, rev: 0.08, max: 2, cd: 0.2 }, (k) => {
  const L = lp(k, 1100); for (let i = 0; i < 3; i++) {
    const t = i * 0.17; nz(k, { t, f: 2000 + i * 100, f2: 3000, sw: 0.16, q: 2.2, a: 0.025, d: 0.07, v: 0.22 });
    tone(k, { t, f: 185 + i * 4, f2: 200, sw: 0.15, type: 'sawtooth', a: 0.02, d: 0.07, v: 0.1, dest: L });
  }
});
def('chop', 'world', { pv: 0.09, rev: 0.12, cd: 0.08 }, (k) => {
  const a = k.v & 1; tone(k, { f: 220 - a * 25, f2: 85, sw: 0.06, d: 0.07, v: 0.75 });
  nz(k, { f: 1200 + a * 200, q: 0.9, d: 0.03, v: 0.45 }); nz(k, { t: 0.005, type: 'highpass', f: 4000, d: 0.008, v: 0.15 }); tone(k, { f: 880, f2: 700, sw: 0.03, d: 0.025, v: 0.15 });
});
def('mine', 'world', { pv: 0.08, rev: 0.14, cd: 0.08 }, (k) => {
  tone(k, { f: 140, f2: 90, sw: 0.04, d: 0.05, v: 0.5 }); nz(k, { f: 3000, q: 1, d: 0.025, v: 0.35 });
  tone(k, { f: 2350, d: 0.07, v: 0.3 }); tone(k, { f: 3660, d: 0.05, v: 0.15 }); tone(k, { f: 5400, d: 0.03, v: 0.06 });
  for (let i = 0; i < 3; i++) nz(k, { t: 0.04 + i * 0.03 + k.r() * 0.02, f: 3500 + k.r() * 2000, q: 2, d: 0.01, v: 0.1 });
});
def('dig', 'world', { pv: 0.1, rev: 0.07, cd: 0.1 }, (k) => {
  nz(k, { type: 'bandpass', f: 500, f2: 1100, sw: 0.1, q: 0.8, color: 'pink', a: 0.02, d: 0.06, v: 0.5 }); tone(k, { t: 0.05, f: 130, f2: 70, sw: 0.05, d: 0.05, v: 0.5 });
  for (let i = 0; i < 4; i++) nz(k, { t: 0.1 + k.r() * 0.18, f: 2800 + k.r() * 2500, q: 2, d: 0.01, v: 0.1 });
});
def('harvest', 'world', { pv: 0.05, rev: 0.14, cd: 0.05 }, (k) => {
  nz(k, { f: 2400, f2: 3800, sw: 0.1, q: 1.2, a: 0.015, d: 0.04, v: 0.2 }); bub(k, 0.02, 700, 0.35, 0.08); mal(k, 'marimba', mf(P(k.v, 72)), 0.35, 0.07); mal(k, 'marimba', mf(P(k.v + 2, 72)), 0.3, 0.14);
});
def('sow', 'world', { pv: 0.08, rev: 0.06, cd: 0.1 }, (k) => {
  for (let i = 0; i < 6; i++) nz(k, { t: i * 0.028 + k.r() * 0.02, f: 2500 + k.r() * 2500, q: 2, a: 0.001, d: 0.009, v: 0.14 + k.r() * 0.1 });
  tone(k, { t: 0.15, f: 110, f2: 70, sw: 0.05, d: 0.05, v: 0.35 }); nz(k, { t: 0.15, type: 'lowpass', f: 700, color: 'brown', d: 0.04, v: 0.3 });
});
def('water', 'world', { pv: 0.06, rev: 0.1, cd: 0.1 }, (k) => {
  nz(k, { type: 'bandpass', f: 4200, q: 0.6, a: 0.04, d: 0.12, v: 0.22, len: 0.6 });
  for (let i = 0; i < 6; i++) bub(k, 0.05 + i * 0.07 + k.r() * 0.04, 500 + k.r() * 700, 0.15 + k.r() * 0.1, 0.05);
});
def('fishCast', 'world', { pv: 0.05, rev: 0.18, max: 2 }, (k) => {
  nz(k, { f: 600, f2: 2800, sw: 0.12, q: 1.2, a: 0.03, d: 0.06, v: 0.22 }); nz(k, { t: 0.14, f: 2800, f2: 900, sw: 0.25, q: 1.2, a: 0.03, d: 0.1, v: 0.12 });
  tone(k, { t: 0.1, f: 3300, f2: 2400, sw: 0.2, d: 0.08, v: 0.05 });
  const t = 0.42; nz(k, { t, type: 'lowpass', f: 1500, a: 0.004, d: 0.07, v: 0.4 }); bub(k, t, 380, 0.35, 0.1); bub(k, t + 0.07, 520, 0.22, 0.07);
});
def('fishCatch', 'world', { pv: 0.03, rev: 0.26, max: 2 }, (k) => {
  nz(k, { type: 'lowpass', f: 2000, a: 0.004, d: 0.09, v: 0.5 }); for (let i = 0; i < 4; i++) bub(k, i * 0.05 + k.r() * 0.02, 450 + k.r() * 500, 0.25, 0.06);
  for (let i = 0; i < 3; i++) tone(k, { t: 0.18 + i * 0.03, f: 1500, d: 0.01, v: 0.12 });
  arp(k, 'kalimba', [72, 76, 79, 84], 0.085, 0.42, 0.28); mal(k, 'glock', mf(91), 0.2, 0.5, 0.9); sparkle(k, 4, 0.5, 0.3, 0.15);
});
def('gather', 'world', { pv: 0.1, rev: 0.08, cd: 0.08 }, (k) => {
  nz(k, { f: 1800, f2: 3400, sw: 0.1, q: 1, color: 'pink', a: 0.02, d: 0.05, v: 0.3 }); bub(k, 0.07, 800 + k.v * 60, 0.3, 0.06); mal(k, 'kalimba', mf(P(k.v + 3, 72)), 0.18, 0.1, 0.4);
});
def('craft', 'world', { pv: 0.05, rev: 0.14, max: 2 }, (k) => {
  for (let i = 0; i < 4; i++) { const t = i * 0.085 + k.r() * 0.015; tone(k, { t, f: 1100 + k.r() * 500, d: 0.02, v: 0.28 }); nz(k, { t, f: 3500, q: 1.5, d: 0.008, v: 0.14 }); }
  mal(k, 'marimba', mf(72), 0.38, 0.38); mal(k, 'marimba', mf(79), 0.34, 0.46); sparkle(k, 3, 0.46, 0.2, 0.14);
});
def('cook', 'world', { pv: 0.05, rev: 0.1, max: 2 }, (k) => {
  nz(k, { type: 'highpass', f: 4500, a: 0.08, d: 0.2, v: 0.14, len: 0.7 });
  for (let i = 0; i < 9; i++) nz(k, { t: 0.05 + k.r() * 0.5, f: 3000 + k.r() * 4000, q: 2.5, a: 0.001, d: 0.006, v: 0.14 * k.r() + 0.04 });
  for (let i = 0; i < 3; i++) bub(k, 0.1 + i * 0.17 + k.r() * 0.05, 300 + k.r() * 300, 0.18, 0.07);
  tone(k, { t: 0.02, f: 1700, d: 0.03, v: 0.2 });
});
def('bake', 'world', { pv: 0.04, rev: 0.2, max: 2 }, (k) => {
  nz(k, { type: 'lowpass', f: 700, color: 'brown', a: 0.005, d: 0.05, v: 0.5 }); tone(k, { f: 130, f2: 85, sw: 0.05, d: 0.05, v: 0.45 });
  nz(k, { t: 0.06, f: 1500, q: 1, d: 0.03, v: 0.1 }); mal(k, 'tube', 1568, 0.38, 0.28, 0.5); mal(k, 'tube', 1976, 0.32, 0.4, 0.5);
});
def('stir', 'world', { pv: 0.06, rev: 0.12, cd: 0.2 }, (k) => {
  const L = lp(k, 900, 1); nz(k, { type: 'lowpass', f: 380, f2: 800, sw: 0.22, color: 'pink', a: 0.06, d: 0.1, v: 0.45, len: 0.5, dest: L }); nz(k, { t: 0.28, type: 'lowpass', f: 800, f2: 380, sw: 0.22, color: 'pink', a: 0.06, d: 0.1, v: 0.4, len: 0.5, dest: L });
  tone(k, { t: 0.2, f: 1300, d: 0.02, v: 0.18 }); tone(k, { t: 0.5, f: 1250, d: 0.02, v: 0.16 }); for (let i = 0; i < 3; i++) bub(k, 0.1 + i * 0.18 + k.r() * 0.05, 280 + k.r() * 300, 0.14, 0.07);
});
def('pour', 'world', { pv: 0.05, rev: 0.1, cd: 0.2 }, (k) => {
  const L = lp(k, 2500); nz(k, { type: 'bandpass', f: 1800, q: 0.7, a: 0.03, d: 0.1, v: 0.14, len: 0.55, dest: L });
  for (let i = 0; i < 9; i++) bub(k, 0.02 + i * 0.045 + k.r() * 0.01, 330 + i * 28 + k.r() * 40, 0.2 + i * 0.01, 0.05);
});
def('research', 'world', { pv: 0.03, rev: 0.3, max: 2 }, (k) => {
  nz(k, { f: 1000, f2: 3000, sw: 0.18, q: 1, a: 0.04, d: 0.06, v: 0.1 }); arp(k, 'kalimba', [67, 71, 74, 79, 83], 0.09, 0.36, 0.14);
  mal(k, 'bell', mf(91), 0.2, 0.6, 1.2); sparkle(k, 5, 0.6, 0.6, 0.12, 88);
});

// ---- progress & events ----------------------------------------------------------------------------------------
def('levelUp', 'progress', { pv: 0.01, rev: 0.34, max: 1, cd: 0.4 }, (k) => {
  tone(k, { f: 98, f2: 98, a: 0.15, d: 0.45, v: 0.3, len: 2 }); arp(k, 'marimba', [67, 71, 74, 79, 83, 86], 0.1, 0.5, 0.0, 0.9);
  arp(k, 'glock', [79, 83, 86, 91], 0.1, 0.2, 0.03, 0.9);
  const t = 0.65; for (const m of [67, 71, 74, 79, 86]) mal(k, 'bell', mf(m), 0.16, t, 1.4); mal(k, 'marimba', mf(55), 0.4, t, 1.6);
  nz(k, { type: 'highpass', f: 5000, a: 0.4, d: 0.4, v: 0.05, len: 1.1 }); sparkle(k, 8, 0.7, 0.9, 0.15);
});
def('questComplete', 'progress', { pv: 0.02, rev: 0.28, max: 1, cd: 0.3 }, (k) => {
  nz(k, { f: 2200, f2: 800, sw: 0.18, q: 1, a: 0.02, d: 0.05, v: 0.12 }); nz(k, { t: 0.05, type: 'highpass', f: 5000, d: 0.015, v: 0.1 });
  arp(k, 'marimba', [67, 71, 74], 0.11, 0.5, 0.14, 0.8); mal(k, 'kalimba', mf(79), 0.5, 0.48, 1.2); mal(k, 'bell', mf(79), 0.2, 0.48, 1.2); mal(k, 'bell', mf(86), 0.16, 0.48, 1.2); sparkle(k, 5, 0.5, 0.45, 0.14);
});
def('achievement', 'progress', { pv: 0.02, rev: 0.34, max: 1, cd: 0.4 }, (k) => {
  mal(k, 'bell', mf(72), 0.55, 0, 1.3); mal(k, 'bell', mf(79), 0.35, 0, 1.3); tone(k, { f: 130, f2: 75, sw: 0.08, d: 0.1, v: 0.4 });
  arp(k, 'glock', [84, 88, 91, 96], 0.07, 0.3, 0.2, 1); arp(k, 'marimba', [72, 76, 79], 0.12, 0.35, 0.3, 0.8); mal(k, 'bell', mf(84), 0.25, 0.62, 1.4); mal(k, 'bell', mf(88), 0.2, 0.62, 1.4); mal(k, 'bell', mf(91), 0.2, 0.62, 1.4); sparkle(k, 7, 0.64, 0.7, 0.16, 88);
});
def('orderComplete', 'progress', { pv: 0.03, rev: 0.22, max: 2 }, (k) => {
  tone(k, { f: 110, f2: 70, sw: 0.05, d: 0.05, v: 0.55 }); nz(k, { f: 900, q: 1, d: 0.03, v: 0.35 });
  ting(k, 0.1, 1976, 0.3); ting(k, 0.17, 2637, 0.3); ting(k, 0.24, 3136, 0.28); mal(k, 'marimba', mf(72), 0.4, 0.2); mal(k, 'marimba', mf(79), 0.4, 0.3);
});
def('projectStage', 'progress', { pv: 0.02, rev: 0.26, max: 2 }, (k) => {
  for (let i = 0; i < 3; i++) { const t = i * 0.13; tone(k, { t, f: 280 + i * 30, f2: 190, sw: 0.025, d: 0.03, v: 0.45 }); nz(k, { t, f: 1600, q: 1.2, d: 0.02, v: 0.25 }); mal(k, 'marimba', mf(P(i + 1, 64)), 0.38, t + 0.02, 0.6); }
  mal(k, 'bell', mf(76), 0.26, 0.42, 1.2); mal(k, 'bell', mf(83), 0.2, 0.42, 1.2); sparkle(k, 4, 0.44, 0.3, 0.13);
});
def('streak', 'progress', { pv: 0.02, rev: 0.22, cd: 0.1 }, (k) => {
  const n = clamp((k.o && k.o.n) || 4, 2, 8); for (let i = 0; i < n; i++) mal(k, 'glock', mf(P(i, 79)), 0.3, i * 0.055, 0.45);
  nz(k, { f: 1500, f2: 5000, sw: 0.25, q: 1, a: 0.04, d: 0.08, v: 0.08, len: 0.5 }); mal(k, 'kalimba', mf(P(n, 79)), 0.35, n * 0.055);
});
def('daily', 'progress', { pv: 0.02, rev: 0.34, max: 1 }, (k) => {
  tone(k, { f: 131, a: 0.2, d: 0.3, v: 0.22, len: 1.8 }); tone(k, { f: 196, a: 0.25, d: 0.3, v: 0.16, len: 1.8 });
  arp(k, 'tube', [88, 84, 79, 76, 72], 0.14, 0.2, 0.1, 0.9); arp(k, 'kalimba', [72, 76, 79], 0.16, 0.34, 0.15, 1);
  chirp(k, 0.75, 2800, 3600, 0.1, 0.08); chirp(k, 0.9, 3000, 3900, 0.09, 0.07);
});
def('festivalStart', 'progress', { pv: 0.01, rev: 0.28, max: 1, cd: 0.5 }, (k) => {
  const mel = [72, 74, 76, 79, 76, 79, 84], gap = 0.115;
  for (let i = 0; i < mel.length; i++) { mal(k, 'marimba', mf(mel[i]), 0.42, i * gap, 0.7); if (i % 2 === 0) mal(k, 'glock', mf(mel[i] + 12), 0.14, i * gap, 0.6); }
  for (let i = 0; i < 12; i++) nz(k, { t: i * 0.0575 + 0.01, type: 'highpass', f: 6500, q: 0.7, a: 0.002, d: 0.025, v: i % 2 ? 0.1 : 0.16 });
  for (const t of [0, 0.23, 0.46]) tone(k, { t, f: 120, f2: 62, sw: 0.06, d: 0.07, v: 0.5 });
  const t = 0.84; for (const m of [72, 76, 79, 84]) mal(k, 'bell', mf(m), 0.16, t, 1.2); sparkle(k, 8, t, 0.7, 0.15);
});
def('merchantArrive', 'progress', { pv: 0.04, rev: 0.22, max: 1 }, (k) => {
  for (let i = 0; i < 14; i++) { const t = i * 0.04 + k.r() * 0.03, f = 2800 + k.r() * 2600; tone(k, { t, f, d: 0.07, v: 0.1 * (1 - i / 18), a: 0.002 }); tone(k, { t, f: f * 2.4, d: 0.03, v: 0.04 }); }
  for (const t of [0.0, 0.32]) { tone(k, { t, f: 400, f2: 300, sw: 0.02, d: 0.025, v: 0.3 }); tone(k, { t: t + 0.12, f: 340, f2: 260, sw: 0.02, d: 0.025, v: 0.28 }); }
  const L = lp(k, 2800); tone(k, { t: 0.5, f: 784, f2: 880, sw: 0.1, a: 0.04, d: 0.12, v: 0.22, len: 0.45, dest: L }); tone(k, { t: 0.62, f: 988, a: 0.03, d: 0.2, v: 0.2, len: 0.55, dest: L });
});
def('visitorArrive', 'progress', { pv: 0.03, rev: 0.3, max: 1 }, (k) => {
  mal(k, 'tube', mf(76), 0.4, 0, 0.9); mal(k, 'tube', mf(72), 0.45, 0.32, 1.1); mal(k, 'bell', mf(60), 0.12, 0.32, 1.2);
});

// ---- villagers ------------------------------------------------------------------------------------------------
def('hire', 'villagers', { pv: 0.04, rev: 0.22 }, (k) => {
  for (const t of [0.0, 0.1]) nz(k, { t, f: 1500, q: 1.2, a: 0.001, d: 0.025, v: 0.3 });
  arp(k, 'marimba', [67, 72, 76], 0.1, 0.42, 0.18); mal(k, 'bell', mf(84), 0.15, 0.4, 1); sparkle(k, 3, 0.4, 0.2, 0.12);
});
def('hungry', 'villagers', { pv: 0.05, rev: 0.1, max: 2 }, (k) => {
  const L = lp(k, 400, 1); tone(k, { f: 95, f2: 55, sw: 0.5, d: 0.3, a: 0.06, v: 0.5, len: 0.7, dest: L });
  nz(k, { type: 'lowpass', f: 350, color: 'brown', a: 0.06, d: 0.2, v: 0.8, len: 0.7, dest: L });
  mal(k, 'kalimba', mf(72), 0.22, 0.55, 0.7); mal(k, 'kalimba', mf(67), 0.22, 0.68, 0.8);
});
def('eat', 'villagers', { pv: 0.07, rev: 0.07, cd: 0.1 }, (k) => {
  for (let i = 0; i < 3; i++) { const t = i * 0.095 + k.r() * 0.015; nz(k, { t, f: 1800 + k.r() * 1200, q: 1.2, a: 0.002, d: 0.02, v: 0.4 }); nz(k, { t, type: 'lowpass', f: 600, a: 0.002, d: 0.02, v: 0.35 }); tone(k, { t, f: 160, f2: 110, sw: 0.03, d: 0.025, v: 0.3 }); }
  tone(k, { t: 0.36, f: 300, f2: 120, sw: 0.1, d: 0.05, v: 0.3 }); mal(k, 'kalimba', mf(79), 0.26, 0.5, 0.6);
});
const FA = [[800, 9, 1, 1000], [1200, 10, 0.7, 1700], [2700, 12, 0.35, 3000]], FEE = [[350, 9, 1], [2300, 10, 0.8], [3000, 12, 0.4]];
def('cheer', 'villagers', { pv: 0.06, rev: 0.22, max: 2 }, (k) => {
  for (let c = 0; c < 3; c++) {
    const o = c * 0.02, f = 360 + c * 70 + k.r() * 30;
    vox(k, { t: o, f0: f, f1: f * 1.15, dur: 0.3, a: 0.03, rel: 0.1, v: 0.33, vib: [6, 20], fm: [[500, 9, 1, 800], [1500, 10, 0.7, 1300], [2700, 12, 0.3]] });
    vox(k, { t: 0.3 + o, f0: f * 1.3, f1: f * 1.5, f2: f * 1.35, dur: 0.38, a: 0.02, rel: 0.14, v: 0.3, vib: [6, 25], fm: [[500, 9, 1, 700], [1100, 10, 0.7, 2000], [2700, 12, 0.3]] });
  }
  for (let i = 0; i < 6; i++) nz(k, { t: 0.1 + k.r() * 0.6, f: 1700 + k.r() * 900, q: 1, a: 0.001, d: 0.012, v: 0.18 });
});
def('giggle', 'villagers', { pv: 0.1, rev: 0.12 }, (k) => {
  const n = 4 + (k.v & 1), f = 560 + k.r() * 80;
  for (let i = 0; i < n; i++) { const t = i * 0.095, ff = f * (1 - i * 0.045); vox(k, { t, f0: ff, f1: ff * 0.9, dur: 0.075, a: 0.008, rel: 0.03, v: 0.4, fm: [[450, 9, 1, 700], [2100, 10, 0.8, 1700], [3000, 12, 0.3]] }); }
});

// ---- animals (formant synthesis) ------------------------------------------------------------------------------
def('cluck', 'animals', { pv: 0.09, rev: 0.1, max: 3 }, (k) => {
  for (let i = 0; i < 3; i++) { const t = i * 0.115, last = i === 2; vox(k, { t, f0: 520 - i * 25, f1: 350, dur: last ? 0.17 : 0.07, a: 0.005, rel: 0.03, v: 0.42, fm: [[900, 7, 1, 700], [1900, 9, 0.7], [3200, 12, 0.2]] }); }
  nz(k, { f: 1500, q: 1, d: 0.01, v: 0.1 });
});
def('moo', 'animals', { pv: 0.08, rev: 0.18, max: 2 }, (k) => {
  const L = lp(k, 2200); vox(k, { f0: 115, f1: 135, f2: 90, dur: 1.15, a: 0.12, rel: 0.4, v: 0.5, vib: [4.5, 14], dest: L, fm: [[300, 8, 1, 550], [700, 8, 0.8, 900], [1500, 8, 0.2, 1000]] });
});
def('baa', 'animals', { pv: 0.1, rev: 0.12, max: 2 }, (k) => {
  vox(k, { f0: 300, f1: 330, f2: 270, dur: 0.75, a: 0.04, rel: 0.2, v: 0.38, vib: [5, 22], am: [28, 0.55], fm: [[700, 9, 1, 800], [1250, 10, 0.7], [2600, 12, 0.3]] });
});
def('woof', 'animals', { pv: 0.1, rev: 0.12, max: 2 }, (k) => {
  for (let i = 0; i < 2; i++) { const t = i * 0.22, v = 1 - i * 0.2; nz(k, { t, f: 900, q: 1.5, a: 0.003, d: 0.025, v: 0.3 * v }); vox(k, { t, f0: 230, f1: 130, dur: 0.14, a: 0.008, rel: 0.05, v: 0.5 * v, fm: [[550, 7, 1, 750], [1050, 8, 0.7, 1200], [2400, 12, 0.2]] }); }
});
def('meow', 'animals', { pv: 0.09, rev: 0.14, max: 2 }, (k) => {
  vox(k, { f0: 480, f1: 760, f2: 460, dur: 0.6, a: 0.07, rel: 0.2, v: 0.36, vib: [6, 14], fm: [[400, 8, 1, 800], [1400, 9, 0.7, 1900], [3000, 12, 0.3]] });
});
def('quack', 'animals', { pv: 0.1, rev: 0.12, max: 3 }, (k) => {
  for (let i = 0; i < 2; i++) vox(k, { t: i * 0.2, f0: 330 - i * 30, f1: 250, dur: 0.15, a: 0.01, rel: 0.05, v: 0.42 - i * 0.08, am: [95, 0.6], fm: [[900, 7, 1, 700], [2200, 9, 0.7], [3200, 12, 0.25]] });
});
def('ribbit', 'animals', { pv: 0.08, rev: 0.14, max: 2 }, (k) => {
  vox(k, { f0: 135, f1: 165, dur: 0.12, a: 0.01, rel: 0.04, v: 0.45, am: [52, 0.8], fm: [[450, 9, 1, 620], [1400, 10, 0.6, 1700]] });
  vox(k, { t: 0.15, f0: 175, f1: 150, dur: 0.17, a: 0.01, rel: 0.06, v: 0.5, am: [48, 0.8], fm: [[550, 9, 1, 420], [1700, 10, 0.6, 1300]] });
});
def('buzz', 'animals', { pv: 0.08, rev: 0.05, max: 2 }, (k) => {
  const L = lp(k, 1800); vox(k, { f0: 205, f1: 235, f2: 195, dur: 0.75, a: 0.15, rel: 0.25, v: 0.3, vib: [9, 80], am: [140, 0.5], dest: L, fm: [[800, 4, 1], [1600, 4, 0.5]] });
});
def('oink', 'animals', { pv: 0.1, rev: 0.1, max: 2 }, (k) => {
  for (let i = 0; i < 2; i++) { const t = i * 0.27; vox(k, { t, f0: 190 - i * 20, f1: 130, dur: 0.22, a: 0.02, rel: 0.07, v: 0.46, am: [32, 0.35], fm: [[500, 8, 1, 650], [1500, 9, 0.7, 1200], [2800, 12, 0.3]] }); nz(k, { t, f: 600, q: 1, a: 0.02, d: 0.07, v: 0.15 }); }
});

// ---- ambient one-shots ----------------------------------------------------------------------------------------
def('birdChirp', 'ambient', { pv: 0.12, rev: 0.22, max: 3 }, (k) => {
  const f = 2600 + k.r() * 1000, type = k.v % 3;
  if (type === 0) { chirp(k, 0, f, f * 1.35, 0.09, 0.3); chirp(k, 0.13, f * 1.2, f * 1.6, 0.11, 0.28); }
  else if (type === 1) for (let i = 0; i < 5; i++) chirp(k, i * 0.07, f * 0.95, f * 1.25, 0.05, 0.22 - i * 0.02);
  else { chirp(k, 0, f * 1.5, f * 0.9, 0.22, 0.28); chirp(k, 0.3, f * 1.3, f * 0.8, 0.18, 0.2); }
});
def('windChime', 'ambient', { pv: 0.08, rev: 0.4, max: 2 }, (k) => {
  const n = 4 + (k.v & 1) + Math.floor(k.r() * 2); let t = 0; for (let i = 0; i < n; i++) { mal(k, 'tube', mf(P(Math.floor(k.r() * 7), 84)), 0.26 * (0.7 + k.r() * 0.3), t, 0.9); t += 0.12 + k.r() * 0.3; }
});
def('bellRing', 'ambient', { pv: 0.03, rev: 0.45, max: 1, cd: 0.5 }, (k) => {
  for (let i = 0; i < 2; i++) { mal(k, 'bell', mf(60 - i * 5), 0.5, i * 0.9, 2.2); tone(k, { t: i * 0.9, f: 90, f2: 70, sw: 0.1, d: 0.1, v: 0.2 }); }
});
def('splash', 'ambient', { pv: 0.1, rev: 0.22, max: 3 }, (k) => {
  nz(k, { type: 'lowpass', f: 2400, f2: 800, sw: 0.25, a: 0.004, d: 0.1, v: 0.5 }); nz(k, { type: 'highpass', f: 3500, a: 0.005, d: 0.06, v: 0.12 });
  for (let i = 0; i < 6; i++) bub(k, 0.03 + k.r() * 0.3, 500 + k.r() * 900, 0.16, 0.05);
});
def('owl', 'ambient', { pv: 0.06, rev: 0.4, max: 1, cd: 1 }, (k) => {
  const L = lp(k, 900); for (const [t, d] of [[0, 0.25], [0.4, 0.5]]) tone(k, { t, f: 410, f2: 360, sw: d, a: 0.06, d: d * 0.4, v: 0.35, len: d + 0.2, dest: L });
});
def('drip', 'ambient', { pv: 0.2, rev: 0.3, max: 4, cd: 0.02 }, (k) => { bub(k, 0, 900 + k.r() * 900, 0.3, 0.045); });

// ---- notifications --------------------------------------------------------------------------------------------
def('toast', 'notify', { pv: 0.04, rev: 0.2, cd: 0.1 }, (k) => { mal(k, 'glock', mf(88), 0.4, 0, 0.55); bub(k, 0, 600, 0.12, 0.05); });
def('warn', 'notify', { pv: 0.03, rev: 0.12, cd: 0.2 }, (k) => { mal(k, 'marimba', mf(76), 0.5, 0, 0.9); mal(k, 'marimba', mf(72), 0.5, 0.13, 1); });
def('error', 'notify', { pv: 0.03, rev: 0.08, cd: 0.2 }, (k) => {
  const L = lp(k, 650); tone(k, { f: 190, f2: 120, sw: 0.14, a: 0.008, d: 0.09, v: 0.65, type: 'triangle', dest: L }); tone(k, { t: 0.14, f: 160, f2: 100, sw: 0.18, a: 0.008, d: 0.12, v: 0.6, type: 'triangle', dest: L });
});

// ---- extras ---------------------------------------------------------------------------------------------------
def('step', 'world', { pv: 0.12, rev: 0.05, cd: 0.08, max: 3 }, (k) => { nz(k, { type: 'lowpass', f: 650, f2: 300, sw: 0.06, color: 'brown', a: 0.004, d: 0.03, v: 0.5 }); nz(k, { f: 2500, q: 1, color: 'pink', a: 0.002, d: 0.012, v: 0.1 }); });
def('door', 'world', { pv: 0.06, rev: 0.12 }, (k) => { tone(k, { f: 150, f2: 85, sw: 0.05, d: 0.05, v: 0.5 }); nz(k, { type: 'lowpass', f: 900, color: 'brown', d: 0.06, v: 0.45 }); tone(k, { t: 0.04, f: 520, f2: 430, sw: 0.1, d: 0.1, v: 0.1, type: 'triangle' }); });

/** Old main.js sfx names -> catalogue names. */
export const ALIASES = { click: 'tap', pop: 'tap2', done: 'buildDone', level: 'levelUp', bad: 'error', coin: 'coin' };
export const CATEGORIES = ['ui', 'economy', 'world', 'progress', 'villagers', 'animals', 'ambient', 'notify'];
/** Loudness targets in LUFS-M (K-weighted, 400 ms momentary max) measured at all volumes = 1 by lab/audio.html. */
export const TARGETS = { ui: -22, economy: -19, world: -20, progress: -17, villagers: -20, animals: -20, ambient: -26, notify: -20 };

// @@TRIM-BEGIN (rewritten by the calibration script: per-sound gain trim so each category hits its TARGET)
export const TRIM = {
  tap: 7.665,
  tap2: 6.476,
  back: 5.139,
  open: 1.984,
  close: 2.296,
  tab: 9.153,
  toggle: 4.641,
  confirm: 0.657,
  deny: 1.975,
  hover: 28.932,
  coin: 1.053,
  coins: 0.745,
  cashRegister: 0.943,
  sell: 0.991,
  buy: 1.279,
  unlock: 0.76,
  reward: 0.567,
  giftReceived: 0.852,
  giftSent: 1.034,
  place: 3.27,
  build: 2.175,
  buildDone: 0.714,
  upgrade: 1.044,
  demolish: 1.94,
  hammer: 6.024,
  sawing: 10.824,
  chop: 3.508,
  mine: 4.164,
  dig: 4.393,
  harvest: 1.505,
  sow: 5.17,
  water: 4.356,
  fishCast: 4.333,
  fishCatch: 0.633,
  gather: 3.305,
  craft: 1.345,
  cook: 6.065,
  bake: 0.907,
  stir: 5.052,
  pour: 3.443,
  research: 0.732,
  levelUp: 0.79,
  questComplete: 0.903,
  achievement: 0.742,
  orderComplete: 1.086,
  projectStage: 1.483,
  streak: 1.234,
  daily: 1.077,
  festivalStart: 1.216,
  merchantArrive: 3.485,
  visitorArrive: 1.17,
  hire: 0.917,
  hungry: 1.549,
  eat: 2.277,
  cheer: 3.108,
  giggle: 4.131,
  cluck: 4.988,
  moo: 4.078,
  baa: 8.541,
  woof: 9.142,
  meow: 4.696,
  quack: 12.186,
  ribbit: 11.658,
  buzz: 8.314,
  oink: 8.846,
  birdChirp: 1.962,
  windChime: 0.471,
  bellRing: 0.348,
  splash: 2.624,
  owl: 0.969,
  drip: 7.491,
  toast: 1.421,
  warn: 1.173,
  error: 1.869,
  step: 34.099,
  door: 5.858,
};
// @@TRIM-END
