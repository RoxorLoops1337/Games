// Million To One: every sound is synthesised in code (no audio files).
// The music is a beatbox crew in a box: B kick, Pf and K snares, t and ts hats, the
// inward K, a hummed bass, "ooh" choir pads made by pushing sawtooth waves through vowel
// (formant) filters, "wah" stabs, a whistled lead and vocal chops when things get wild, and a
// fill every 8 bars. Tempo and key climb zone by zone, and every zone has its own flavour (pad
// vowel, chord progression, one signature sound: see ZONE_FLAVOR); the arrangement grows with
// intensity 0..2 (0.3 is the waiting-room groove for menus; 1.4 is the late-race L=2 groove; the
// whistle lead and wah stabs are saved for FRENZY) and with the player's live combo (A.combo).
//
// Mix (tuned for phone speakers): the music bus gets a +3 dB lift at 180 Hz, a gentle -2 dB
// top shelf and its own glue compressor; sound effects go through a soft bus compressor whose
// automatic makeup gain (about +6 dB) is trimmed back by a 0.55 gain, so stacked hits leave the
// limiter headroom and the big stingers (frenzy, egg, win, finisher, mixed 1.25x hotter) still
// stand out; both meet in a master gain and a brickwall-ish limiter. Big fx hits micro-duck the
// music. Music and sfx have their own echoes so muting or muffling the music never cuts an sfx tail.
//
// CPU budget: notes are scheduled ~150ms ahead from tick(), every source is counted and
// low priority voices (hats, ghosts) are dropped when too many are sounding, the vowel
// filters for the pads and stabs are shared persistent nodes, and one 1s noise buffer is
// reused by every hiss.
//
// Key changes (a new zone, a FRENZY or combo milestone lift, the lift dropping again) never land
// mid-bar: _rekey() only stores the new key in _keyNext and tick() applies it on the next downbeat,
// so the pads sung in the old key finish in tune. The lifts also get a rising "whoop" on step 12 of
// the bar before. The combo ladder climbs in scale degrees (see ladderDegree), never off the scale.

import { bankGrade } from './core.js';

const VOW = {
  oo: [300, 870, 2240], oh: [570, 840, 2410], ah: [730, 1090, 2440],
  eh: [530, 1840, 2480], ee: [270, 2290, 3010], uh: [520, 1190, 2390],
};
const FG = [1, 0.5, 0.16];          // formant gains (F1, F2, F3)
const FBW = [90, 110, 150];         // formant bandwidths in Hz
const ZONE_BPM = [96, 104, 110, 116, 120, 128, 136];
const ZONE_KEY = [0, 2, 3, 5, 7, 8, 10];  // semitone lift per zone, every zone climbs
const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]]; // Am F C G (relative to the key root A)
// one flavour per zone, indexed like zoneOf(bpm): the choir's vowel, an optional chord progression,
// and a signature sound (see _signature): launch rim ostinato, acid bubbles, goo toms, womb-sea waves,
// fork half-time intro, rapids pad tremolo, egg heartbeat kick
const ZONE_FLAVOR = [
  { vowel: 'oo', sig: 'rim' },
  { vowel: 'oh', sig: 'bubble' },
  { vowel: 'ee', sig: 'goo', prog: [[0, 3, 7], [5, 8, 12], [0, 3, 7], [7, 11, 14]] },   // Am Dm Am E
  { vowel: 'uh', sig: 'wave', prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -1, 2]] }, // Am F Dm E
  { vowel: 'ah', sig: 'fork', half: 2 },
  { vowel: 'oo', sig: 'trem' },
  { vowel: 'oh', sig: 'heart', prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]] },  // Am F G E
];
const MENU_HOOK = [[4, 3, 2, 0, null, 2, 3, 5], [4, 3, 2, 0, null, null, 0, null]];   // pentatonic degrees on 8ths
// the "Million To One" theme: a 4-bar hook in pentatonic degrees (PENTA index) on 16ths, call and answer.
// Bars 1 and 3 are the call ("one in a mil-lion"), bar 2 answers up in the air on the 5th, bar 4 walks
// home and resolves to degree 0. The menu whistles it every other 8-bar phrase, the race whistles it over
// the first 4 bars of every zone, later phrases play seeded variations of it, the win fanfare quotes bar 1
// in brass and the lose sting starts it on a kazoo and gives up on the 4th note.
const _ = null;
const THEME_CALL = [5, _, _, 4, _, _, 5, _, 7, _, 6, _, 5, _, _, _];
export const THEME = [
  THEME_CALL,
  [7, _, _, 6, _, _, 5, _, 4, _, 5, _, 3, _, _, _],
  THEME_CALL,
  [4, _, 3, _, 2, _, 1, _, 0, _, _, _, _, _, _, _],
];
// how many 16ths each theme note rings: up to the next note, at most 4
const THEME_LEN = THEME.map((b) => b.map((d, s) => { if (d === null) return 0; let n = 1; while (s + n < 16 && n < 4 && b[s + n] === null) n++; return n; }));
// the combo ladder: link n plays this pentatonic degree. It walks a 10-note run (two octaves) and every
// ten links the run starts one scale degree higher (at most 5), so it keeps climbing and never leaves the key
export const ladderDegree = (n) => { n = Math.max(0, n | 0); return n % 10 + Math.min(5, Math.floor(n / 10)); };
// a seeded variation of a theme bar: shift by +-1 or +-2 degrees and drop about 30% of the notes
// (the bar's first note always stays, so the line still starts on the beat). seed: any integer.
export function themeVariation(seed) {
  let a = (seed | 0) ^ 0x2545F491;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const src = THEME[Math.floor(rnd() * 4)], mag = rnd() < 0.5 ? 1 : 2, sh = rnd() < 0.5 ? -mag : mag;
  let first = true;
  return src.map((d) => {
    if (d === null) return null;
    if (!first && rnd() < 0.3) return null;
    first = false;
    return Math.max(0, Math.min(PENTA.length - 1, d + sh));
  });
}
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const BOOST = new Set(['frenzy', 'egg', 'win', 'finisher']);   // the biggest moments, mixed 1.25x hotter
const AEOL = [0, 2, 3, 5, 7, 8, 10];
const MUSIC_VOL = 0.5;
const MASTER = 0.9;
const CAP = 64;                     // concurrent sources before low priority voices are skipped
const st = (s) => Math.pow(2, s / 12);
const pen = (i) => PENTA[i % 5] + 12 * Math.floor(i / 5);
const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));
// a diatonic third above semitone s (A natural minor), so harmonies never clash
const third = (s) => { const o = Math.floor(s / 12), r = s - 12 * o, d = AEOL.indexOf(r); if (d < 0) return s + 3; const d2 = d + 2; return AEOL[d2 % 7] + 12 * (o + Math.floor(d2 / 7)); };
const zoneOf = (bpm) => { let b = 0; for (let i = 1; i < ZONE_BPM.length; i++) if (Math.abs(ZONE_BPM[i] - bpm) < Math.abs(ZONE_BPM[b] - bpm)) b = i; return b; };
const P = (s) => [...s].map((ch) => ch === 'x');
const numArg = (k, key) => (k && typeof k === 'object' ? +k[key] || 0 : +k || 0);

// kick patterns by level, two bars each (A then B)
const KICK = [
  [P('x.........x.....'), P('x......x..x.....')],
  [P('x.....x...x..x..'), P('x..x......x...x.')],
  [P('x...x...x...x.x.'), P('x...x...x..xx...')],
];
// bass hum: [step, semitones over the chord root, length in steps]
const BASS = [
  [[0, 0, 3], [3, 0, 1], [6, 0, 2], [10, 0, 2], [14, 7, 2]],
  [[0, 0, 2], [3, 0, 1], [4, 12, 1], [6, 0, 2], [8, 0, 1], [10, 0, 2], [11, 12, 1], [13, 7, 1], [14, 10, 2]],
  [[0, 0, 1], [2, 12, 1], [3, 0, 1], [4, 0, 1], [6, 12, 1], [7, 0, 1], [8, 0, 1], [10, 12, 1], [11, 0, 1], [12, 7, 1], [13, 10, 1], [14, 12, 1], [15, 7, 1]],
];
// fills replace steps 8..15 of the last bar of a phrase. B kick, P Pf snare, K inward K,
// k rim, h/m/l mouth toms, Y a shouted "hey!"
const FILLS = [
  ['BP', 'P', 'P', 'P', 'BP', 'P', 'P', 'PK'],     // snare roll
  ['Bh', '', 'h', 'm', 'B', 'm', 'lK', 'K'],      // toms into inward Ks
  ['BP', '', '', '', 'Y', '', '', 'B'],           // the stop: silence, a "hey!", pickup
  ['h', 'h', 'm', 'm', 'Bl', 'l', 'kK', 'BP'],     // tom run
  ['B', 'k', 'K', 'B', 'k', 'K', 'BP', 'BP'],      // rim and suck
];
// minimum seconds between two plays of the same sfx
const GAP = {
  pass: 0, link: 0.03, drill: 0.025, sugar: 0.03, bonk: 0.08, bump: 0.06, pop: 0.04, dna: 0.05, tap: 0.025, heart: 0.3,
  close: 0.05, thread: 0.08, blast: 0.1, lockon: 1.2, land: 0.1, milestone: 0.3, event: 0.5, lowE: 0.25,
  comboBank: 0.2, comboBreak: 0.15, record: 0.5, legendary: 0.5, synergy: 0.3, eggClaim: 0.5, bossTaunt: 0.5, drillShove: 0.05,
  clutch: 0.12, finisher: 0.3, style: 0.2, loseClose: 0.5, drillLead: 0.15, rivalShove: 0.08, again: 0.2, ready: 0.15,
  synTease: 0.3, swat: 0.06, tell: 0.25, comboLow: 0.02, comboMilestone: 0.4,
  fork: 0.5, backflow: 0.5, finale: 0.5, spot: 1.2,
};
// sfx that get a little random detune (+-15 cents) and volume (+-12%) so repeats never sound like a machine gun
const HUMAN = new Set(['sugar', 'dna', 'pop', 'bump', 'bonk', 'dash']);
const PENTA12 = [0, 3, 5, 7, 10, 12];
// the nearest A minor pentatonic note (any octave) to a frequency, transposed into key `key`
const inKey = (f, key) => {
  const s = 12 * Math.log2(f / 440) - key, o = Math.floor(s / 12), r = s - 12 * o;
  let b = 0; for (const d of PENTA12) if (Math.abs(r - d) < Math.abs(r - b)) b = d;
  return 440 * st(key + 12 * o + b);
};
const rivalIdx = (k) => { const v = k && typeof k === 'object' ? k.k : k; return typeof v === 'number' && v >= 0 && v <= 4 ? v | 0 : -1; };
const fold = (f, top = 1760) => { while (f > top) f /= 2; return f; };

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.on = false;
    this._bpm = 96; this._int = 0; this.key = 0; this._lift = 0; this._ftier = 0;
    this.next = 0; this.stepI = 0; this.barBase = 0; this.fillBar = -1; this.fillN = 0;
    this.crashBar = -1; this.crashNext = false; this.curFill = -1;
    this.heat = 0; this.heatT = 0; this.live = 0; this.last = {}; this.motif = null; this.lastPass = 0;
    this.combo = 0; this.chord = PROG[0]; this._dryUntil = 0;
    this.musicVol = 1; this.sfxVol = 1; this.musicMuted = false; this.sfxMuted = false;
    this._tension = 0; this._nextHeart = 0; this._slow = false;
    this._kicks = new Float64Array(8).fill(-99); this._kickI = 0;
    this._slotT = -1; this._slotG = null; this._blipN = 0; this._passF = 440;
    this._mdUntil = -1; this._mdLast = -1;
    this._linkN = 0;                           // last combo link count
    this._keyNext = null; this._keyBar = -1; this._keyCrash = false; this._whoopBar = -1;   // pending key change (lands on a downbeat)
    this._fin = 0; this._rollLen = 4;          // finale tempo push (+bpm), length of the pending _rollAt roll in 16ths
    this._themePend = true; this._themeAt = -99; this._varN = 0; this._themeOn = false;   // the theme's first bar, variation counter
    this.calm = false;                         // calm mode (reduced motion): no gasps, shallow ducks, slow filter moves
    this._thr = null; this._thrK = 0; this._thrPan = 0; this._slurpT = 0;   // proximity threat loop
    this._acid = null; this._acidL = 0; this._crackT = 0;                  // acid sizzle loop
    this._dnaN = 0; this._dnaT = -9;           // DNA streak: arpeggio root in pentatonic degrees
    this._loseV = -1; this._leadN = 0;         // last lose sting variant, drill lead retakes
    this._contest = false; this._hatDuck = -1; // contested drill, hats ducked under a lowE heartbeat until
    this._hd = 0; this._hv = 1;                // humanise: cents and volume factor for the sfx being built
    this._slowBig = false; this._slowOn = false; this._impUntil = -1; // big slow (bent beat), any slow, impact hold until
    this._mlift = 0; this._cTier = 0; this._rollAt = -1;  // combo milestone key lift, combo crash tier, 1-beat fill start step
    this._lowQ = -1; this._clT = -9; this._clQ = -1; this._clN = 0;   // lowE quarter, comboLow last call, slot and tick count
    this._zone = 0; this._zoneBar = 0; this._trem = 0; // current zone flavour, the bar it started, tremolo depth applied
    this._dec = () => { this.live--; };
  }

  // ------------------------------------------------------------------ public knobs
  get bpm() { return this._bpm; }
  set bpm(v) {
    v = +v || 96; if (v + this._fin === this._bpm) return;
    this._bpm = v + this._fin; const z = zoneOf(v);
    if (z !== this._zone) { this._zone = z; this._zoneBar = (this.stepI >> 4) + 1; this._themePend = true; }
    this._rekey();
    if (this.ctx && this.on) this._queueFill();
    this._applyTrem();
    this._syncDelay();
  }
  // the key the song is heading to (now, or on the next downbeat)
  get keyTarget() { return ZONE_KEY[this._zone] + this._lift + this._mlift; }
  // a key change waits for a downbeat (tick() lands it), so pads sung in the old key never clash with the
  // new one. whoop: a lift (FRENZY tier 3, combo milestone) also gets a rising "whoop" on step 12 of the
  // bar before and a crash on the landing.
  _rekey(whoop = false) {
    const k = this.keyTarget;
    if (!this.ctx || !this.on) { this.key = k; this._keyNext = null; this._whoopBar = -1; return; }
    const i = this.stepI & 15, bar = this.stepI >> 4;
    let nb = i === 0 ? bar : bar + 1;
    if (whoop) { const wb = i <= 12 ? bar : bar + 1; this._whoopBar = wb; nb = wb + 1; this._keyCrash = true; }
    this._keyBar = this._keyNext !== null ? Math.max(this._keyBar, nb) : nb;
    this._keyNext = k;
    if (k === this.key && !whoop) { this._keyNext = null; this._keyCrash = false; }
  }
  // called by tick() before each step: a pending key lands on its downbeat
  _landKey() {
    if (this._keyNext === null || (this.stepI & 15) !== 0 || (this.stepI >> 4) < this._keyBar) return;
    this.key = this._keyNext; this._keyNext = null;
    if (this._keyCrash) { this.crashNext = true; this._keyCrash = false; }
  }
  _applyTrem() {           // the rapids' 6 Hz pad tremolo (a persistent LFO, its depth set per zone)
    if (!this.ctx || !this.tremD) return;
    const d = ZONE_FLAVOR[this._zone].sig === 'trem' && !this._menu(this._int) ? 0.45 : 0;
    if (d === this._trem) return; this._trem = d; this._setG(this.tremD.gain, d);
  }
  get intensity() { return this._int; }
  set intensity(v) {
    const old = this._int; this._int = +v || 0;
    if (!this.ctx) return;
    if (this._menu(old) !== this._menu(this._int)) { this._applyTlp(); this._applyTrem(); }
    if (!this.on) return;
    if (this._int >= 1.5 && old < 1.5) this.crashNext = true;
    if (this._int < 1.5 && old >= 1.5) this._deflate();
  }
  // 0..1 drama: a heartbeat bed from 60 to 180 bpm, and above 0.5 the music closes down to 1200 Hz
  get tension() { return this._tension; }
  set tension(v) {
    const old = this._tension; this._tension = clamp01(v);
    if (old <= 0.02 && this._tension > 0.02 && this.ctx) this._nextHeart = this.ctx.currentTime + 0.05;
    this._applyTlp();
  }
  // the egg drill: pass every drilling agent's progress 0..1 (yours included), or [] / null when no drill.
  // Two or more rings within 15% of each other is a contested drill: the heartbeat never drops below 0.6.
  drillRings(list) {
    let on = false;
    if (list && list.length > 1) {
      const a = [...list].map((x) => +x || 0).sort((x, y) => x - y);
      for (let i = 1; i < a.length && !on; i++) if (a[i] - a[i - 1] <= 0.15) on = true;
    }
    if (on && !this._contest && this.ctx && this._tension <= 0.02) this._nextHeart = this.ctx.currentTime + 0.05;
    this._contest = on;
    return on;
  }
  // ------------------------------------------------------------------ proximity loops (main.js sets both every frame)
  // threat(k, pan): something nasty is close. k 0..1 (0 = nothing near), pan -1..1. A looped growl (a low saw
  // through a lowpass that wobbles 180..320 Hz at 3 Hz) at 0.18 * k, plus a wet slurp every 0.6 s from tick().
  // Persistent nodes built on first use; only the gain and pan move (60 ms ramps), so a call per frame costs
  // two compares. Silent when muted, sfx are off or in calm mode.
  threat(k, pan = 0) {
    k = this.muted || this.sfxMuted || this.calm ? 0 : clamp01(k); pan = Math.max(-1, Math.min(1, +pan || 0));
    if (!this.ctx) { this._thrK = k; return; }
    if (!this._thr) { if (k <= 0) return; this._thr = this._loopThreat(); }
    const n = this._thr, now = this.ctx.currentTime;
    if (Math.abs(k - this._thrK) > 0.004 || (k === 0 && this._thrK !== 0)) { n.g.gain.setTargetAtTime(0.18 * k, now, 0.02); this._thrK = k; }
    if (n.p && Math.abs(pan - this._thrPan) > 0.02) { n.p.pan.setTargetAtTime(pan, now, 0.02); this._thrPan = pan; }
  }
  _loopThreat() {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0;
    let out = g; const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { g.connect(p); p.connect(this.fx); out = p; } else g.connect(this.fx);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 250; lp.Q.value = 4;
    const lfo = c.createOscillator(), ld = c.createGain(); lfo.frequency.value = 3; ld.gain.value = 70;   // 250 +- 70: 180..320 Hz
    lfo.connect(ld); ld.connect(lp.frequency); lfo.start();
    for (const [f, det] of [[55, -7], [55, 7]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(); }
    lp.connect(g);
    return { g, p, out };
  }
  // 0..1: the player is in acid. A 3000 Hz bandpassed noise sizzle at 0.08 * level, and a crackle tick every
  // 0.12 s from tick(). Same rules as threat(): persistent nodes, cheap every frame, never clicks.
  get acid() { return this._acidL; }
  set acid(v) {
    v = this.muted || this.sfxMuted ? 0 : clamp01(v);
    if (!this.ctx) { this._acidL = v; return; }
    if (!this._acid) {
      if (v <= 0) return;
      const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 1.4; g.gain.value = 0;
      s.connect(bp); bp.connect(g); g.connect(this.fx); s.start();
      this._acid = { g };
    }
    if (Math.abs(v - this._acidL) > 0.004 || (v === 0 && this._acidL !== 0)) { this._acid.g.gain.setTargetAtTime(0.08 * v, this.ctx.currentTime, 0.02); this._acidL = v; }
  }
  // the one-shot parts of the loops, scheduled from tick()
  _loops(now) {
    if (this._thr && this._thrK > 0.03 && now >= this._slurpT) {   // a wet slurp: a resonant filter gulping up and back
      this._slurpT = now + 0.6; const k = this._thrK, t = now + 0.01;
      this.hum(t, 0.14, 0.12 * k, 'bandpass', 280, 7, this._thr.out, 900, 0.01, 0);
      this.tone('sine', 160, 90, t + 0.04, 0.08, 0.1 * k, this._thr.out, 0.004, 0, 0);
    }
    if (this._acid && this._acidL > 0.03 && now >= this._crackT) {   // a crackle tick
      this._crackT = now + 0.12; const t = now + 0.005 + Math.random() * 0.03;
      this.hum(t, 0.004, 0.06 * this._acidL + 0.02, 'bandpass', 2500 + Math.random() * 3500, 3, this.fx, 0, 0.0008, 0);
    }
  }

  // 0..1, how hard the last kick still pushes (render.js can pulse the screen on the beat)
  get pulse() {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime; let best = -99;
    for (let i = 0; i < 8; i++) { const k = this._kicks[i]; if (k <= now && k > best) best = k; }
    return best < 0 ? 0 : Math.exp(-(now - best) * 9);
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running' && !this._suspended) { try { this.ctx.resume(); } catch (e) { /* ignore */ } } return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return;
    let c; try { c = new AC(); } catch (e) { return; }
    this.ctx = c;
    // master: gain, a 70 Hz highpass (a phone speaker cannot play below it, so that energy only eats
    // headroom and makes the limiter pump), then a soft-kneed limiter so a pile of hits never clips
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : MASTER;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; hp.Q.value = 0.7;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.15;
    // the compressor node adds its own makeup gain, so a soft clipper after it holds true peaks under -1 dBFS
    const clip = c.createWaveShaper(), cn = 2048, cc = new Float32Array(cn), knee = 0.7, ceil = 0.88;
    for (let i = 0; i < cn; i++) {
      const x = i / (cn - 1) * 2 - 1, a = Math.abs(x);
      cc[i] = Math.sign(x) * (a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
    }
    clip.curve = cc; clip.oversample = '2x';
    this.master.connect(hp); hp.connect(lim); lim.connect(clip); clip.connect(c.destination); this.limiter = lim; this.hp = hp;
    // sound effects: own volume, then a soft bus compressor so stacked hits stay even. The compressor
    // adds about +6 dB of automatic makeup gain, so a 0.55 trim after it keeps stacked hits off the limiter
    this.fx = c.createGain(); this.fx.gain.value = this._fxLevel();
    const fc = c.createDynamicsCompressor();
    fc.threshold.value = -14; fc.knee.value = 6; fc.ratio.value = 4; fc.attack.value = 0.003; fc.release.value = 0.12;
    const ft = c.createGain(); ft.gain.value = 0.55;
    this.fx.connect(fc); fc.connect(ft); ft.connect(this.master); this.fxComp = fc; this.fxTrim = ft;
    // music bus: gain (volume and ducking) -> micro duck -> muffle lp -> slowmo lp -> tension/menu lp
    //            -> 180 Hz lift -> top shelf -> glue compressor -> master
    this.music = c.createGain(); this.music.gain.value = this._mLevel();
    this.mduck = c.createGain(); this.mduck.gain.value = 1;
    const lp = (f) => { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = 0.6; return b; };
    this.mlp = lp(18000); this.slp = lp(18000); this.tlp = lp(18000);
    const peak = c.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 180; peak.Q.value = 0.9; peak.gain.value = 3;
    const shelf = c.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 9000; shelf.gain.value = -2;
    const mc = c.createDynamicsCompressor();
    mc.threshold.value = -20; mc.knee.value = 6; mc.ratio.value = 3; mc.attack.value = 0.01; mc.release.value = 0.25;
    this.music.connect(this.mduck); this.mduck.connect(this.mlp); this.mlp.connect(this.slp); this.slp.connect(this.tlp);
    this.tlp.connect(peak); peak.connect(shelf); shelf.connect(mc); this.mcomp = mc;
    // the glue compressor's automatic makeup gain is about +8 dB: trim it back so the music alone stays clear of the limiter
    const mt = c.createGain(); mt.gain.value = 0.8; mc.connect(mt); mt.connect(this.master);
    // a dotted-eighth echo, the beatboxer's favourite pedal: one for the music, one for the fx
    const mkEcho = (dest, fbv, wetv) => {
      const inp = c.createGain(), d = c.createDelay(1.5), dl = c.createBiquadFilter(), fb = c.createGain(), wet = c.createGain();
      d.delayTime.value = 3 * 60 / this._bpm / 4; dl.type = 'lowpass'; dl.frequency.value = 2400; fb.gain.value = fbv; wet.gain.value = wetv;
      inp.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(wet); wet.connect(dest);
      return { inp, d, fb };
    };
    const me = mkEcho(this.music, 0.33, 0.25), fe = mkEcho(this.fx, 0.3, 0.25);
    this.echo = me.inp; this.delay = me.d; this.mfb = me.fb;
    this.fxEcho = fe.inp; this.fxDelay = fe.d;
    // shared noise
    const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = this.noiseBuf; // legacy name
    // the choir: two persistent vowel filter banks (pads sing "ooh", stabs go "wah")
    // the pads pass a tremolo gain: a persistent 6 Hz LFO whose depth is 0 except in the rapids
    this.padBank = this._bank('oo', 2.4); this.padTrem = c.createGain(); this.padTrem.gain.value = 1;
    this.padBank.out.connect(this.padTrem); this.padTrem.connect(this.music);
    this.tremD = c.createGain(); this.tremD.gain.value = 0; this._trem = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 6; lfo.connect(this.tremD); this.tremD.connect(this.padTrem.gain); lfo.start();
    const ps = c.createGain(); ps.gain.value = 0.35; this.padBank.out.connect(ps); ps.connect(this.echo);
    this.stabBank = this._bank('ah', 2.8); this.stabBank.out.connect(this.music);
    // the hummed bass shares one lowpass and one soft-clip shaper (harmonics a phone can play)
    this.bassLp = c.createBiquadFilter(); this.bassLp.type = 'lowpass'; this.bassLp.frequency.value = 500; this.bassLp.Q.value = 5;
    const sh = c.createWaveShaper(), n = 1024, curve = new Float32Array(n), dr = 2.5, nrm = Math.tanh(dr);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(dr * x) / nrm; }
    sh.curve = curve; sh.oversample = '2x';
    const bo = c.createGain(); bo.gain.value = 0.7;
    this.bassLp.connect(sh); sh.connect(bo); bo.connect(this.music); this.shaper = sh;
    this._applyTlp(); this._applyTrem();
  }

  // ------------------------------------------------------------------ volume, mute, lifecycle
  _mLevel() { return this.musicMuted ? 0 : MUSIC_VOL * this.musicVol; }
  _fxLevel() { return this.sfxMuted ? 0 : this.sfxVol; }
  _setG(param, v) { if (!this.ctx) return; const t = this.ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(v, t, 0.05); }
  setMusicVol(v) { this.musicVol = clamp01(v); if (this.music) this._setG(this.music.gain, this._mLevel()); }
  setSfxVol(v) { this.sfxVol = clamp01(v); if (this.fx) this._setG(this.fx.gain, this._fxLevel()); }
  setMusicMuted(m) { this.musicMuted = !!m; this.setMusicVol(this.musicVol); }
  setSfxMuted(m) { this.sfxMuted = !!m; this.setSfxVol(this.sfxVol); }
  setMuted(m) {             // master mute: everything, internal stingers included
    this.muted = !!m;
    if (this.master) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.muted ? 0 : MASTER, t); }
  }
  // app hidden / shown: stop the clock, and on return restart the grid so queued notes do not burst
  suspend() {
    this._suspended = true;
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) { /* ignore */ } }
  }
  resume() {
    this._suspended = false; const c = this.ctx; if (!c) return;
    const reset = () => { this.next = c.currentTime + 0.05; this._nextHeart = c.currentTime + 0.1; this._slotT = -1; };
    reset();
    try { const p = c.resume(); if (p && p.then) p.then(reset, () => {}); } catch (e) { /* ignore */ }
  }
  // dull the music (pause menu, mutation cards). Optional: the game works without calling it.
  setMuffle(on) { if (!this.ctx) return; const t = this.ctx.currentTime; this.mlp.frequency.cancelScheduledValues(t); this.mlp.frequency.setTargetAtTime(on ? 650 : 18000, t, this._ftc(on ? 0.06 : 0.15)); }
  // calm mode (main.js passes S.reduced): no hit-stop gasps or micro ducks, ducks never below 0.8, filter
  // moves take about 0.4 s, and the proximity growl stays silent
  setCalm(b) { this.calm = !!b; if (this.calm) this.threat(0); }
  _ftc(tc) { return this.calm ? Math.max(tc, 0.4 / 3) : tc; }   // filter time constant (3 tc is about the full move)
  // bullet time. slowmo(on, big): every slow pulls the music behind a lowpass (time constant 0.03 s, so it
  // never clicks). Only big ones (first FRENZY, egg drill start, zone-end crawl) also play a tape stop on
  // the way in, bend the beat to a half-time kick, let the echo hang on, and come out with a reversed
  // swell that lands on the grid with a soft crash. Idempotent: repeat calls with the same value do
  // nothing, and a big call during a small slow upgrades it. slowmo(true) alone is a small slow.
  slowmo(on, big = false) {
    if (!this.ctx) return; on = !!on; big = !!big;
    if (on && this._slowOn && (!big || this._slowBig)) return;
    if (!on && !this._slowOn) return;
    const c = this.ctx, now = c.currentTime, t = now + 0.005, fx = this.fx;
    const wasBig = this._slowBig, play = !this.muted && c.state === 'running';
    if (on) {
      this._slowOn = true; this._slowBig = this._slowBig || big; this._slow = this._slowBig;
      this._slpTo(this._slowBig ? 1400 : 2200, 0.03);
      if (big && !wasBig) {
        this._setG(this.mfb.gain, 0.45);
        if (play) {           // tape stop: a saw and a hiss both sag from 900 to 120 Hz
          const g = this._gain(0.25, fx);
          this.tone('sawtooth', 900, 120, t, 0.18, 0.5, g, 0.004);
          this.hum(t, 0.18, 0.6, 'bandpass', 900, 1.4, g, 120, 0.004);
        }
      }
      return;
    }
    this._slowOn = false; this._slowBig = false; this._slow = false;
    this._slpTo(18000, 0.08);
    if (!wasBig && !big) return;
    this._setG(this.mfb.gain, 0.33);
    if (!play) return;
    // reverse swell peaking on a 16th, then a soft crash
    const spb = 60 / this._bpm / 4; let pk = this._quant(now);
    while (pk - now < 0.15) pk += spb;
    const st0 = Math.max(t, pk - 0.22), d = pk - st0;
    if (!this._busy(1)) {
      const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, st0); bp.frequency.exponentialRampToValueAtTime(5000, pk);
      g.gain.setValueAtTime(0.0001, st0); g.gain.exponentialRampToValueAtTime(0.22, pk); g.gain.linearRampToValueAtTime(0.0001, pk + 0.02);
      s.connect(bp); bp.connect(g); g.connect(fx); this.live++; s.onended = this._dec; s.start(st0, Math.random() * 0.5); s.stop(pk + 0.05);
    }
    if (d > 0) this.crash(pk, 0.5, fx, 0.6);
  }
  _slowF() { return this._slowOn ? (this._slowBig ? 1400 : 2200) : 18000; }
  // move the slowmo lowpass, unless an impact() is holding it; the impact's release then lands on _slowF()
  _slpTo(f, tc) {
    const now = this.ctx.currentTime, p = this.slp.frequency;
    if (now < this._impUntil) { p.cancelScheduledValues(this._impUntil); p.setTargetAtTime(f, this._impUntil, 0.04); return; }
    p.cancelScheduledValues(now); p.setTargetAtTime(f, now, this._ftc(tc));
  }
  // pause: drop every slow-mo state at once, no swell, no crash, no tape stop
  slowmoReset() {
    this._slowOn = false; this._slowBig = false; this._slow = false; this._impUntil = -1;
    if (!this.ctx) return; const now = this.ctx.currentTime;
    for (const [p, v] of [[this.slp.frequency, 18000], [this.mfb.gain, 0.33], [this.mduck.gain, 1]]) { p.cancelScheduledValues(now); p.setValueAtTime(v, now); }
    this._mdUntil = -1;
  }
  // hit stop: the music gasps (micro duck to `depth`, lowpass to 2500 Hz) for `ms`, then breathes out
  // (time constant 0.04), under a 40 ms sub thump
  impact(ms, depth = 0.5) {
    if (!this.ctx || !this.mduck || this.calm) return;
    const c = this.ctx, now = c.currentTime, sec = Math.max(0.02, Math.min(0.5, (+ms || 0) / 1000)), end = now + sec;
    const dv = Math.max(0.05, Math.min(1, +depth || 0.5));
    const g = this.mduck.gain, f = this.slp.frequency;
    g.cancelScheduledValues(now); g.setTargetAtTime(dv, now, 0.006); g.setTargetAtTime(1, end, 0.04);
    this._mdUntil = Math.max(this._mdUntil, end); this._mdLast = now;
    f.cancelScheduledValues(now); f.setTargetAtTime(Math.min(2500, this._slowF()), now, 0.008); f.setTargetAtTime(this._slowF(), end, 0.04);
    this._impUntil = end;
    if (this.muted || c.state !== 'running') return;
    this.tone('sine', 90, 45, now + 0.003, 0.04, 0.35, this.fx, 0.002);
  }
  _menu(I) { return I > 0.2 && I < 0.45; }
  _applyTlp() {
    if (!this.ctx) return;
    const T = this._tension, tc = T <= 0.5 ? 18000 : 18000 * Math.pow(1200 / 18000, (T - 0.5) / 0.5);
    const f = Math.min(tc, this._menu(this._int) ? 3200 : 18000), t = this.ctx.currentTime;
    this.tlp.frequency.cancelScheduledValues(t); this.tlp.frequency.setTargetAtTime(f, t, this._ftc(0.15));
  }
  // drop the music for a moment so a big sound effect can shine
  // (no duck when sfx are off: there is nothing to make room for. Calm mode never ducks below 0.8.)
  duck(amount = 0.35, sec = 0.6) {
    if (!this.ctx) return;
    if (amount < 1 && (this.sfxMuted || this.sfxVol < 0.05)) return;
    if (this.calm) amount = Math.max(0.8, amount);
    const g = this.music.gain, t = this.ctx.currentTime, L = this._mLevel();
    g.cancelScheduledValues(t); g.setTargetAtTime(L * amount, t, 0.03); g.setTargetAtTime(L, t + sec, 0.25);
  }
  // automatic micro duck: any loud fx hit pulls the music to 0.7 for 120 ms
  _mduck(t) {
    if (!this.mduck || this.calm || this.sfxMuted || this.sfxVol < 0.05 || t - this._mdLast < 0.03 || t < this._impUntil) return;
    this._mdLast = t; const g = this.mduck.gain;
    if (t < this._mdUntil) g.cancelScheduledValues(t);
    g.setTargetAtTime(0.7, t, 0.006); g.setTargetAtTime(1, t + 0.12, 0.04); this._mdUntil = t + 0.12;
  }
  _syncDelay() {
    if (!this.ctx) return; const dt = Math.min(1.4, 3 * 60 / this._bpm / 4), t = this.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(dt, t, 0.05); this.fxDelay.delayTime.setTargetAtTime(dt, t, 0.05);
  }
  // a fresh race: back to zone 1 tempo and key, and land the first beat on a crash
  newRun() {
    this._bpm = ZONE_BPM[0]; this.key = 0; this._lift = 0; this._mlift = 0; this._ftier = 0; this._int = 0; this.heat = 0; this.combo = 0; this._dryUntil = 0;
    this._linkN = 0; this._dnaN = 0; this._leadN = 0; this._contest = false; this._cTier = 0; this._rollAt = -1; this._rollLen = 4; this._clN = 0;
    this._zone = 0; this._zoneBar = (this.stepI >> 4) + 1; this._fin = 0;
    this._keyNext = null; this._keyCrash = false; this._whoopBar = -1; this._themePend = true; this._themeAt = -99; this._varN = 0;
    if (!this.ctx) return;
    this._syncDelay(); this._applyTlp(); this._applyTrem();
    this.setMuffle(false); this.duck(1, 0); this.threat(0); this.acid = 0;
    if (this._slowOn) this.slowmoReset();
    const bar = (this.stepI >> 4) + 1; this.barBase = bar; this.crashBar = bar; this.fillBar = -1;
  }

  // ------------------------------------------------------------------ voice helpers
  _go(node, t, end) { this.live++; node.onended = this._dec; node.start(t); node.stop(end); }
  _busy(pri) { return this.live > (pri ? CAP + 24 : CAP); }
  _gain(v, dest) { const g = this.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  // exponential attack then decay
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  // a pitched blip; f1 is the target pitch reached after `glide` seconds (defaults to dur)
  tone(type, f0, f1, t, dur, vol, dest, a = 0.004, glide = 0, pri = 1) {
    if (this._busy(pri)) return null;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; dest = dest || this.fx;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
    if (this._hd) { o.detune.value = this._hd; vol *= this._hv; }
    this.env(g, t, a, vol, dur); o.connect(g); g.connect(dest); this._go(o, t, t + a + dur + 0.03);
    if (vol > 0.3 && dest === this.fx) this._mduck(t);
    return o;
  }
  // filtered noise; f1 sweeps the filter over the whole sound
  hum(t, dur, vol, type, f0, q, dest, f1 = 0, a = 0.002, pri = 1) {
    if (this._busy(pri)) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); dest = dest || this.fx;
    s.buffer = this.noiseBuf; if (dur > 0.9) s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q; if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (this._hd) { f.detune.value = this._hd; vol *= this._hv; }
    this.env(g, t, a, vol, dur); s.connect(f); f.connect(g); g.connect(dest);
    this.live++; s.onended = this._dec; s.start(t, Math.random() * Math.max(0, 0.95 - dur)); s.stop(t + a + dur + 0.03);
    if (vol > 0.3 && dest === this.fx) this._mduck(t);
  }
  // legacy helpers kept for compatibility
  osc(type, f0, f1, t, dur, vol, dest) { return this.tone(type, f0, f1, t, dur, vol, dest); }
  hiss(t, dur, vol, freq, type = 'highpass', dest, q = 1) { this.hum(t, dur, vol, type, freq, q, dest); }

  _bank(vowel, makeup) {
    const c = this.ctx, inp = c.createGain(), out = c.createGain(); out.gain.value = makeup; const fs = [];
    VOW[vowel].forEach((fr, k) => {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr; f.Q.value = fr / FBW[k];
      const g = c.createGain(); g.gain.value = FG[k]; inp.connect(f); f.connect(g); g.connect(out); fs.push(f);
    });
    return { in: inp, out, fs };
  }
  _vowel(bank, v, t, glide) { VOW[v].forEach((fr, k) => { const f = bank.fs[k].frequency; f.setTargetAtTime(fr, t, Math.max(0.002, glide / 3)); }); }
  // one sung note into a vowel bank (sawtooth, gentle attack, held, released)
  _sing(bank, f, t, dur, vol, att = 0.1, pri = 0, scoop = 1) {
    if (this._busy(pri)) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * scoop, t); if (scoop !== 1) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, dur * 0.4));
    o.detune.value = (Math.random() - 0.5) * 14;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + Math.max(att, dur * 0.75)); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(bank.in); this._go(o, t, t + dur + 0.02);
  }
  // a one-off sung or shouted vowel (own little formant filters): "ooh-AH", "hey!", "yeah"
  say(t, freqs, v0, v1, dur, vol, glide = 0.15, bend = 1, dest, pri = 1) {
    if (this._busy(pri)) return;
    const c = this.ctx, out = c.createGain(); out.connect(dest || this.fx);
    if (this._hd) vol *= this._hv;
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    out.gain.setValueAtTime(vol, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = c.createGain(); mix.gain.value = 1 / Math.sqrt(freqs.length);
    for (let k = 0; k < 2; k++) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = VOW[v0][k] / FBW[k] * 0.8;
      f.frequency.setValueAtTime(VOW[v0][k], t); f.frequency.setTargetAtTime(VOW[v1][k], t + 0.03, glide / 3);
      const g = c.createGain(); g.gain.value = FG[k] * 3.2; mix.connect(f); f.connect(g); g.connect(out);
    }
    for (const fr of freqs) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(fr, t);
      if (bend !== 1) o.frequency.exponentialRampToValueAtTime(fr * bend, t + dur);
      o.detune.value = (Math.random() - 0.5) * 12 + this._hd; o.connect(mix); this._go(o, t, t + dur + 0.03);
    }
  }
  // brass-ish note for fanfares: two detuned saws through a lowpass that opens and closes ("wah").
  // f1/glide bend the pitch (a sad slide for a beaten rival)
  _brass(t, f, dur, vol, wah = false, vib = false, f1 = 0, glide = 0) {
    if (this._busy(1)) return;
    const c = this.ctx, lp = c.createBiquadFilter(), g = c.createGain(); lp.type = 'lowpass'; lp.Q.value = wah ? 6 : 2;
    const top = wah ? 1300 : Math.min(5000, f * 7);
    lp.frequency.setValueAtTime(wah ? 350 : f * 1.5, t); lp.frequency.exponentialRampToValueAtTime(top, t + Math.min(0.12, dur * 0.4));
    lp.frequency.exponentialRampToValueAtTime(wah ? 420 : f * 2.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(this.fx);
    let lfo = null;
    if (vib) { lfo = c.createOscillator(); lfo.frequency.value = 5.5; const d = this._gain(32); lfo.connect(d); lfo._d = d; }
    for (const det of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.detune.value = det;
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
      if (lfo) lfo._d.connect(o.detune);
      o.connect(lp); this._go(o, t, t + dur + 0.03);
    }
    if (lfo) this._go(lfo, t + dur * 0.25, t + dur + 0.03);
  }
  // a plucked string: saw through a lowpass that snaps shut
  _pluck(t, f, vol, dest = this.fx) {
    if (this._busy(1)) return;
    const c = this.ctx, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.12);
    this.env(g, t, 0.002, vol, 0.2); o.connect(lp); lp.connect(g); g.connect(dest); this._go(o, t, t + 0.25);
  }

  // ------------------------------------------------------------------ the kit (all mouth noises)
  B(t, v = 1, dest = this.music) {         // kick: sub thump, a body a phone can play, and a lip click
    this.tone('sine', 185, 46, t, 0.22, 0.6 * v, dest, 0.002, 0.09);
    this.tone('sine', 160, 95, t, 0.12, 0.75 * v, dest, 0.002, 0.09);
    this.hum(t, 0.008, 0.35 * v, 'bandpass', 1200, 1.2, dest, 0, 0.001);
    this._kicks[this._kickI] = t; this._kickI = (this._kickI + 1) & 7;
  }
  Pf(t, v = 1, dest = this.music) {        // the classic "Pf" snare
    this.hum(t, 0.13, 0.5 * v, 'bandpass', 2100, 0.7, dest);
    this.hum(t, 0.05, 0.12 * v, 'highpass', 6500, 0.7, dest);
    this.tone('sine', 420, 140, t, 0.035, 0.3 * v, dest, 0.002);
    if (this._int >= 0.5 && dest === this.music) this.hum(t, 0.08, 0.12 * v, 'bandpass', 2400, 0.8, this.echo, 0, 0.002, 0);
  }
  Kin(t, v = 1, dest = this.music) {       // inward K: a sucked-in snare that swells then snaps shut
    if (this._busy(0)) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(5200, t + 0.08);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.07); g.gain.linearRampToValueAtTime(0.0001, t + 0.085);
    s.connect(f); f.connect(g); g.connect(dest); this.live++; s.onended = this._dec; s.start(t, Math.random() * 0.8); s.stop(t + 0.1);
  }
  rim(t, v = 1, dest = this.music) { this.hum(t, 0.02, 0.24 * v, 'bandpass', 3800, 5, dest, 0, 0.001, 0); }
  hat(t, v = 1, dest = this.music) { if (t < this._hatDuck && dest === this.music) v *= 0.85; this.hum(t, 0.022, 0.15 * v, 'highpass', 8500, 0.7, dest, 0, 0.001, 0); }
  ts(t, v = 1, dest = this.music) { if (t < this._hatDuck && dest === this.music) v *= 0.85; this.hum(t, 0.13, 0.12 * v, 'highpass', 6000, 0.8, dest, 0, 0.004, 0); }
  tom(t, f, v = 1, dest = this.music) {    // mouth toms: "doon"
    this.tone('sine', f, f * 0.55, t, 0.2, 0.55 * v, dest, 0.003);
    this.tone('triangle', f * 2, f, t, 0.03, 0.14 * v, dest, 0.002);
  }
  crash(t, v = 1, dest = this.music, len = 0.8) {     // "kssshh"
    this.hum(t, len, 0.2 * v, 'highpass', 4500, 0.7, dest, 0, 0.003);
    this.hum(t, len * 0.44, 0.1 * v, 'bandpass', 9000, 0.6, dest, 0, 0.003);
    this.hum(t, len * 0.38, 0.08 * v, 'highpass', 5000, 0.7, dest === this.music ? this.echo : this.fxEcho, 0, 0.003, 0);
  }
  hey(t, v = 1, dest = this.music) { this.say(t, [196 * st(this.key)], 'eh', 'ee', 0.22, 0.3 * v, 0.12, 0.85, dest); }

  // ------------------------------------------------------------------ the beat
  tick() {
    const c = this.ctx; if (!c || !this.on) return;
    const now = c.currentTime;
    if (this.heat && now - this.heatT > 2.4) this.heat = 0;
    if (this.next < now - 0.25 || this.next > now + 1.5) this.next = now + 0.06;   // woke from a sleep or clock jump
    const silent = this.muted || c.state !== 'running';
    let guard = 0;
    while (this.next < now + 0.15 && guard++ < 32) { this._landKey(); if (!silent) this._step(this.next); this.next += 60 / this._bpm / 4; this.stepI++; }
    if (!silent) this._loops(now);
    // the tension bed: a heartbeat that races as the drama climbs (never below 0.6 in a contested drill)
    const T = this._contest ? Math.max(0.6, this._tension) : this._tension;
    if (T > 0.02) {
      if (this._nextHeart < now - 0.25 || this._nextHeart > now + 2) this._nextHeart = now + 0.05;
      guard = 0;
      while (this._nextHeart < now + 0.15 && guard++ < 4) {
        if (!silent) this.heart(this._nextHeart, 0.35 + 0.45 * T, this.music);
        this._nextHeart += 60 / (60 + 120 * T);
      }
    }
  }
  _queueFill() { const i = this.stepI & 15, bar = this.stepI >> 4; this.fillBar = i < 6 ? bar : bar + 1; }
  _deflate() {             // frenzy over: a falling "fwoomp", and the key comes back down
    if (this._lift) { this._lift = 0; this._rekey(); }
    this._ftier = 0;
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this.hum(t, 0.5, 0.22, 'bandpass', 3000, 2, this.music, 300);
    this.tone('sawtooth', 300, 80, t, 0.45, 0.06, this.music);
  }
  _step(t0) {
    const i = this.stepI & 15, bar = this.stepI >> 4, I = this._int;
    const L = I < 0.5 ? 0 : I < 1.3 ? 1 : 2, spb = 60 / this._bpm / 4, M = this.music;
    const fz = this._ftier > 0;                     // FRENZY: the whistle lead and the wah stabs join in
    const Z = ZONE_FLAVOR[this._zone] || ZONE_FLAVOR[0];
    const cmb = Math.max(this.combo | 0, this.heat);
    const hot = cmb >= 12, blazing = cmb >= 25;
    const t = t0 + ((i & 1) ? spb * (L === 2 ? 0.05 : 0.15) : 0);   // swing the off sixteenths
    const pb = (((bar - this.barBase) % 8) + 8) % 8;
    const menu = this._menu(I), prog = (!menu && Z.prog) || PROG;
    const chord = prog[pb & 3], root = 110 * st(this.key + chord[0]);
    this.chord = chord;
    // a lift is coming on the next downbeat: a 1-beat rising "whoop" from the crew
    if (i === 12 && bar === this._whoopBar && !menu) {
      this._whoopBar = -1;
      this.say(t, [fold(330 * st(this.key), 500)], 'oo', 'ee', spb * 4, 0.14, spb * 3, 1.12, this.music, 1);
    }
    // waiting room (title, shop, result): hats, a soft bass, an "oo" pad on each bar, and every other
    // 4-bar phrase a whistled 2-bar hook
    if (menu) {
      if (i % 2 === 0) this.hat(t, (i % 4 === 2 ? 0.9 : 0.55) * (0.85 + Math.random() * 0.3) * 0.8);
      if (i === 14 && (bar & 1)) this.ts(t, 0.64);
      for (const [s, semi, len] of BASS[0]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, 0, 0.55);
      if (i === 0) {
        this._vowel(this.padBank, 'oo', t, 0.25);
        for (const s of chord) { let f = 220 * st(this.key + s); while (f > 420) f /= 2; while (f < 190) f *= 2; this._sing(this.padBank, f, t, spb * 16 * 0.98, 0.02, 0.2); }
      }
      // even 8-bar phrases: the theme (bars 0..3); odd ones: the old 2-bar waiting-room hook
      const hb = bar & 7;
      if (((bar >> 3) & 1) === 0) {
        if (hb < 4 && THEME[hb][i] !== null) { let f = 880 * st(this.key + PENTA[THEME[hb][i]]); while (f > 1500) f /= 2; this._whistle(t, f, spb * (THEME_LEN[hb][i] - 0.3), null, 0.05); }
      } else if (hb < 2 && i % 2 === 0) {
        const d = MENU_HOOK[hb][i >> 1];
        if (d !== null) { let f = 880 * st(this.key + PENTA[d]); while (f > 1500) f /= 2; this._whistle(t, f, spb * 1.7, null, 0.05); }
      }
      this._cTier = 0;
      return;
    }
    // combo broken: one beat of dry kick, everything else holds its breath
    if (t0 < this._dryUntil) { if (i % 4 === 0) this.B(t, 1.1); this._cTier = 0; this._rollAt = -1; return; }
    // stem ladder: crossing combo 10, 20 or 30 rolls a 1-beat snare fill into a crash on the next beat
    const ct = Math.min(3, Math.floor(cmb / 10));
    if (ct > this._cTier && this._rollAt < 0) { this._rollAt = this.stepI + ((4 - (i & 3)) & 3); this._rollLen = 4; }
    this._cTier = ct;
    if (i === 0) {
      if (this.crashBar === bar || this.crashNext) { this.crash(t, 1); this.crashNext = false; }
      this.curFill = -1;
      if (this.fillBar === bar || (this.fillBar < bar && (pb === 7 || (L === 2 && pb === 3)))) {
        this.curFill = this.fillN++ % FILLS.length;
        if (this.fillBar === bar) this.barBase = bar + 1;
        this.crashBar = bar + 1; this.fillBar = -1;
      }
      // the theme over the first 4 bars of every zone (from the first phrase start after the zone began),
      // then seeded variations of it, a new one every phrase
      if (pb === 0 && this._themePend) { this._themePend = false; this._themeAt = bar; }
      const tb = bar - this._themeAt;
      this._themeOn = tb >= 0 && tb < 4;
      if (this._themeOn) this.motif = THEME[tb];
      else if (pb === 0 || !this.motif || tb === 4) this._newMotif();
    }
    if (this._rollAt >= 0) {
      const r = this.stepI - this._rollAt;
      const n = this._rollLen;
      if (r >= 0 && r < n) {
        this.Pf(t, 0.45 + 0.6 * r / n);
        if (n > 4 && r >= n - 4) this.Pf(t + spb * 0.5, 0.4 + 0.5 * r / n);   // a long roll doubles up into 32nds for its last beat
        if (r === n - 1) this.Kin(t + spb * 0.5, 0.7);
      } else if (r === n) { if (!(i === 0 && (this.crashBar === bar || this.crashNext))) this.crash(t, n > 4 ? 1.1 : 0.9); this._rollAt = -1; this._rollLen = 4; }
    }
    const fill = this.curFill >= 0 && i >= 8 && !this._slow ? FILLS[this.curFill][i - 8] : null;
    const stop = this.curFill === 2 && i >= 9;
    // the fork walks in at half time for its first 2 bars
    const half = Z.half && bar >= this._zoneBar && bar < this._zoneBar + Z.half;
    if (fill !== null) {
      const v = 0.6 + (i - 8) * 0.06;
      for (const ch of fill) {
        if (ch === 'B') this.B(t, 1); else if (ch === 'P') this.Pf(t, v); else if (ch === 'K') this.Kin(t, v);
        else if (ch === 'k') this.rim(t, v * 1.2); else if (ch === 'h') this.tom(t, 260, v); else if (ch === 'm') this.tom(t, 185, v);
        else if (ch === 'l') this.tom(t, 130, v); else if (ch === 'Y') this.hey(t, 1);
      }
      if (!stop && i % 2 === 0) this.hat(t, 0.7);
    } else if (this._slow) {
      // bent time: no hats or rims, just a half-time kick under the snares
      if (i === 0 || i === 8) this.B(t, i === 0 ? 1 : 0.85);
      if (i === 4 || i === 12) this.Pf(t, 0.9);
    } else if (half) {
      // half time: kick on 1, snare on 3, hats on the quarters, a "ts" pickup into bar 2
      if (i === 0 || (i === 10 && (bar & 1))) this.B(t, i === 0 ? 1.05 : 0.7);
      if (i === 8) this.Pf(t, 1.1);
      if (i % 4 === 0) this.hat(t, 0.9);
      if (i === 14) this.ts(t, 0.8);
    } else {
      // drums
      if (KICK[L][bar & 1][i]) this.B(t, i === 0 ? 1 : 0.85);
      else if (Z.sig === 'heart' && i % 4 === 0) this.B(t, 0.75);   // the egg: a heartbeat kick on every quarter
      if (i === 4 || i === 12) this.Pf(t, 1);
      if (L >= 1 && (bar & 1) && i === 14) this.Kin(t, 0.8);
      if (L === 2 && i === 6 && (bar & 1) === 0) this.Kin(t, 0.6);
      if (L === 2 && i === 15 && (bar & 3) === 3) this.Pf(t, 0.5);
      if (L === 1 && (i === 7 || i === 9) && ((bar + i) & 1)) this.rim(t, 0.6);
      if (L === 2 && (i === 3 || i === 7 || i === 11)) this.rim(t, 0.5);
      // hats
      const acc = (i % 4 === 2) ? 1.3 : (i % 2 === 0 ? 1 : 0.6);
      const hv = acc * (0.85 + Math.random() * 0.3);
      if (L === 0) { if (i % 2 === 0) this.hat(t, hv); if (i === 14 && (bar & 1)) this.ts(t, 1); }
      else if (L === 1) { if (i === 2 || i === 10) this.ts(t, 1); else this.hat(t, hv); }
      else { if (i % 4 === 2) this.ts(t, 1.1); else this.hat(t, hv * 1.1); }
      if (hot && L < 2 && i === 6) this.ts(t, 0.8);
      // stem ladder 1 (combo 6): hats double up into 32nds
      if (cmb >= 6) { if (L === 0 && (i & 1)) this.hat(t, 0.6); else if (i % 2 === 0) this.hat(t + spb * 0.5, 0.6); }
      this._signature(Z.sig, t, i, bar, spb, L);
    }
    // bass hum (stem ladder 2, combo 15: the busier bass line)
    if (!stop && !half) {
      const bl = cmb >= 15 ? Math.min(2, L + 1) : L;
      for (const [s, semi, len] of BASS[bl]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, bl);
    } else if (half && i === 0) this._bass(t, root, spb * 7, 0);
    // choir pads on the downbeat in the zone's vowel (the 4th bar opens up), wah stabs on the offbeats in FRENZY
    if (i === 0 && this.curFill !== 2) {
      const vol = L === 0 ? 0.028 : L === 1 ? 0.04 : 0.032;
      this._vowel(this.padBank, (pb & 3) === 3 ? (Z.vowel === 'ah' ? 'oh' : 'ah') : Z.vowel, t, 0.25);
      for (const s of chord) { let f = 220 * st(this.key + s); while (f > 420) f /= 2; while (f < 190) f *= 2; this._sing(this.padBank, f, t, spb * 16 * 0.98, vol, 0.12); }
    }
    if (!stop && fz && ((L === 2 && (i === 6 || i === 14)) || (L === 1 && hot && i === 14))) {
      this._vowel(this.stabBank, 'oo', t, 0.004); this._vowel(this.stabBank, 'ah', t + 0.03, 0.08);
      for (let k = 1; k < 3; k++) { let f = 220 * st(this.key + chord[k]); while (f > 520) f /= 2; while (f < 260) f *= 2; this._sing(this.stabBank, f, t, 0.16, 0.06, 0.01); }
    }
    // the whistled lead in frenzy; stem ladder 3 (combo 25): a chopped vocal lead
    if (!stop && this.motif && this.motif[i] !== null) {
      const s = PENTA[this.motif[i]];
      if (this._themeOn) { let f = 880 * st(this.key + s); while (f > 1500) f /= 2; const tb = bar - this._themeAt; this._whistle(t, f, spb * (THEME_LEN[tb][i] - 0.3), s, 0.05); }
      else if (fz && L === 2) { let f = 880 * st(this.key + s); while (f > 1500) f /= 2; this._whistle(t, f, spb * 1.7, s); }
      if (blazing && i % 2 === 0) {
        let f = 220 * st(this.key + s); while (f > 440) f /= 2;
        this.say(t, [f], 'ah', i % 4 ? 'eh' : 'oh', spb * 1.3, 0.16, 0.05, 1, M, 0);
      }
    }
  }
  // one signature sound per zone, on top of the groove (all low priority, all on the music bus)
  _signature(sig, t, i, bar, spb, L) {
    const M = this.music;
    switch (sig) {
      case 'rim': if (i === 3 || i === 11) this.rim(t, 0.55); break;   // launch tube: a rim ostinato
      case 'bubble':                                                   // acid lagoon: a bloop rising out of the puddle
        if (i === 10 || (L >= 1 && i === 13 && (bar & 1))) { const f = fold(440 * st(this.key + pen(3 + ((bar * 3 + i) % 5))), 1200); this.tone('sine', f * 0.6, f, t, 0.06, 0.05, M, 0.004, 0.04, 0); }
        break;
      case 'goo': if (i === 15 && (bar & 1) === 0) this.tom(t, 98 * st(this.key % 12), 0.5); break;   // gate of goo: a sticky low tom pickup
      case 'wave': if (i === 0 && (bar & 1) === 0) this.hum(t, spb * 14, 0.05, 'lowpass', 260, 1.5, M, 1300, spb * 7, 0); break;   // womb sea: a wave washes in
      case 'heart': if (i % 4 === 0 && this._tension <= 0.02) this.tone('sine', 150, 90, t + spb * 0.75, 0.05, 0.22, M, 0.003, 0, 0); break;   // egg: the "dub"
    }
  }
  // a new lead line for the phrase: a seeded variation of a theme bar (so the race keeps humming the theme)
  _newMotif() { this.motif = themeVariation(this._varN++ * 7919 + this._zone * 131); }
  _bass(t, f, dur, L, scale = 1) {
    if (this._busy(0)) return;
    const c = this.ctx, lp = this.bassLp, g = c.createGain(), o = c.createOscillator(), o2 = c.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2;
    lp.frequency.setValueAtTime(L === 2 ? 1600 : 1100, t); lp.frequency.setTargetAtTime(L === 0 ? 500 : 700, t + 0.01, 0.05);
    const v = (L === 2 ? 0.16 : 0.14) * scale;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    const g2 = this._gain(0.35); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp);
    this._go(o, t, t + dur + 0.06); this._go(o2, t, t + dur + 0.06);
    // the clean sub an octave down, under the shaper so it stays round
    this.tone('sine', f / 2, 0, t, dur, 0.06 * scale, this.music, 0.01, 0, 0);
  }
  _whistle(t, f, dur, s = null, vol = 0.07) {
    const o = this.tone('sine', f * 0.94, f, t, dur, vol, this.music, 0.015, 0.04, 0);
    if (o) this.tone('sine', f * 0.94, f, t, dur * 0.8, vol * 0.36, this.echo, 0.015, 0.04, 0);
    if (o && this._ftier >= 2 && s !== null) { const f2 = f * st(third(s) - s); this.tone('sine', f2 * 0.94, f2, t, dur, 0.045, this.music, 0.015, 0.04, 0); }
  }

  // ------------------------------------------------------------------ quantised combo notes
  // the time of the next grid slot: the next 16th if it is within 0.07 s, else the next 32nd
  _quant(now) {
    const fb = now + 0.005;
    if (!this.on || !this.ctx || this.ctx.state !== 'running' || !this.next) return fb;
    const spb = 60 / this._bpm / 4;
    if (this.next < now || this.next > now + spb + 0.2) return fb;
    const g = this.next - Math.floor((this.next - now) / spb) * spb;   // next 16th, in [now, now + spb)
    if (g - now <= 0.07) return Math.max(fb, g);
    return Math.max(fb, g - spb / 2 >= now ? g - spb / 2 : g);
  }
  // like _quant, but a combo note never waits more than 45 ms for the grid (it plays right away instead)
  _quantCap(now) { const g = this._quant(now); return g - now > 0.045 ? now + 0.005 : g; }
  // the next 16th on the grid (not a 32nd), or right now when the beat is not running
  _next16(now) {
    const fb = now + 0.005;
    if (!this.on || !this.ctx || this.ctx.state !== 'running' || !this.next) return fb;
    const spb = 60 / this._bpm / 4;
    if (this.next < now || this.next > now + spb + 0.2) return fb;
    return Math.max(fb, this.next - Math.floor((this.next - now) / spb) * spb);
  }
  // the combo ladder: link n plays pentatonic degree ladderDegree(n) (a two-octave run, and every ten links
  // the run starts a degree higher, at most 5), with a new layer on top every ten (see _layers), so it
  // always feels like it is still climbing and every note stays in the key. Folded under 1760 Hz.
  // Used by pass, link, clutch and drill.
  _scaleF(n, base) {
    while (base * st(this.key + 22) > 1760 && base > 60) base /= 2;   // by key only, so the ladder never jumps mid-combo
    return fold(base * st(this.key + pen(ladderDegree(n))));
  }
  // the unquantised front of a combo note: a click and a 1 ms square tick, right now, so the hit never feels late
  _transient(t, f, dest) {
    this.hum(t, 0.012, 0.14, 'highpass', 3500, 0.7, dest, 0, 0.001);
    this.tone('square', fold(f * 2, 3600), 0, t, 0.001, 0.06, dest, 0.001);
  }
  // the layers a long combo earns on every blip: 10+ an octave, 20+ a fifth, 30+ a sparkle, 40+ a detuned unison
  _layers(q, f, n, dest) {
    if (n >= 10) this.tone('sine', fold(f * 2), 0, q + 0.005, 0.06, 0.04, dest, 0.003, 0, 0);
    if (n >= 20) this.tone('sine', fold(f * st(7)), 0, q + 0.005, 0.06, 0.03, dest, 0.003, 0, 0);
    if (n >= 30) this.hum(q, 0.015, 0.05, 'highpass', 7000, 0.7, dest, 0, 0.001, 0);
    if (n >= 40) for (const c of [-8, 8]) { const o = this.tone('triangle', f, 0, q, 0.07, 0.05, dest, 0.003, 0, 0); if (o) o.detune.value = c; }
  }

  // ------------------------------------------------------------------ rival voices
  // per-rival motif by RIVALS index. vol 1 = passed, 0.5 = taunt. semi transposes. hold > 0 sustains
  // every note to `hold` seconds and slides it by `drop` (0.5: down an octave, a rival deflating at your
  // win; 1: no slide, a rival gloating as it takes your egg).
  _rival(t, k, vol = 1, semi = 0, hold = 0, key = this.key, drop = 0.5) {
    const m = st(key + semi), fx = this.fx, dr = drop === 1 ? 0 : drop;
    const n = (type, f, at, dur, v, a = 0.005, f1 = 0, gl = 0) => {
      f *= m;
      if (hold) { const d = Math.max(dur, hold - at); this.tone(type, f, f * dr, t + at, d, v * vol, fx, a, d); }
      else this.tone(type, f, f1 ? f1 * m : 0, t + at, dur, v * vol, fx, a, gl);
    };
    const br = (f, at, dur, v) => { f *= m; if (hold) { const d = Math.max(dur, hold - at); this._brass(t + at, f, d, v * vol, false, false, f * dr, d); } else this._brass(t + at, f, dur, v * vol); };
    switch (k | 0) {
      case 0:   // Steve: a goofy kazoo that climbs, very pleased with itself
        [523, 587, 659, 784].forEach((f, j) => { n('triangle', f, j * 0.07, j === 3 ? 0.2 : 0.07, 0.16, 0.01, f * 1.03, 0.05); n('square', f, j * 0.07, j === 3 ? 0.18 : 0.06, 0.035); });
        break;
      case 1:   // Brock: a heavy square power chord
        [98, 147, 196].forEach((f) => n('square', f, 0, 0.35, 0.07, 0.004));
        n('sine', 49, 0, 0.3, 0.25);
        break;
      case 2:   // Tiffany: a prim little harp run
        [1047, 1319, 1568].forEach((f, j) => { n('sine', f, j * 0.06, 0.35, 0.12, 0.002); if (!hold) this.tone('sine', f * m, 0, t + j * 0.06, 0.25, 0.04 * vol, this.fxEcho); });
        break;
      case 3:   // Gunther: a saw that bends up like a stunt jump
        n('sawtooth', 330, 0, 0.32, 0.1, 0.01, 440, 0.22);
        n('sawtooth', 165, 0, 0.32, 0.05, 0.01, 220, 0.22);
        break;
      case 4:   // Chad Thundertail: a pompous four-note fanfare
        br(392, 0, 0.07, 0.1); br(392, 0.09, 0.07, 0.1); br(523, 0.18, 0.1, 0.11); br(659, 0.3, 0.35, 0.12);
        break;
    }
  }

  // ------------------------------------------------------------------ sound effects
  // names: pass (k = combo), link ({ n, kind }), sugar, dna, shield, alkali/fizz, dash, bonk, bump, hit,
  // clang, pop, chomp, frenzy (k = tier), frenzyEnd, second, zone, egg, pick, cards, reroll, drill (k = taps),
  // win (k = rival index when you beat a drilling rival), lose, tap (k = 0..1), buy, combo (k = combo),
  // comboEnd (k = combo), comboBreak, comboBank (k = grade 0..4), boss (k = rival index), bossTaunt (k),
  // eggClaim, drillShove, surf, heart, mutation, synergy (k = fresh), close, thread, blast (k = count),
  // record, legendary, milestone, event, lowE, lockon (k = pan -1..1), land, clutch, finisher (k = grade 0..4),
  // style (k = level 3..6), loseClose, drillLead (k = +1 you lead, -1 a rival does), rivalShove, again, ready,
  // synTease, swat, tell (k = wall side -1..1), comboLow (k = comboT / comboMax, or { f, grade }),
  // comboMilestone (k = combo 100, 150, ...). lose (k) and eggClaim (k) take the rival index to play the
  // thief's motif; lowE (k = 1 when critical).
  sfx(name, k) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, t = now + 0.005;
    const gap = GAP[name] ?? 0.015;
    if (now - (this.last[name] ?? -9) < gap) return;
    this.last[name] = now;
    // state that must change even when the sound is muted
    const endCombo = () => { this._clN = 0; if (this._mlift) { this._mlift = 0; this._rekey(); } };
    switch (name) {
      case 'pass': this.heat = Math.max(this.heat, +k || 0); this.heatT = now; break;
      case 'comboBreak': this.heat = 0; this._dryUntil = now + 4 * 60 / this._bpm / 4; endCombo(); break;
      case 'comboBank': case 'finisher': endCombo(); break;
      case 'comboEnd': endCombo(); break;
      case 'comboMilestone': if (!this._mlift) { this._mlift = 2; this._rekey(true); } break;
      case 'dna': this._dnaN = now - this._dnaT <= 1.2 ? Math.min(8, this._dnaN + 1) : 0; this._dnaT = now; break;
      case 'drillLead': this._leadN = numArg(k, 'k') > 0 ? Math.min(6, this._leadN + 1) : this._leadN; break;
      case 'frenzy': { const tier = Math.max(1, numArg(k, 'tier') | 0); this._ftier = tier; if (tier >= 3 && !this._lift) { this._lift = 1; this._rekey(true); } break; }
      case 'backflow': this._dryUntil = now + 60 / this._bpm; break;   // the band rewinds: one dry beat
      case 'finale':            // the last sprint: a 1-bar snare roll from the next downbeat into a crash, and +6 bpm to the end
        if (this.on) { const i = this.stepI & 15; this._rollAt = this.stepI + ((16 - i) & 15); this._rollLen = 16; }
        if (!this._fin) { this._fin = 6; this._bpm += 6; this._syncDelay(); }
        break;
      case 'synergy': if ((k === true || (k && k.fresh)) && this.on) this._queueFill(); break;
    }
    if (this.muted) { if (name === 'win' || name === 'lose') this._resetSong(); return; }
    if (HUMAN.has(name)) { this._hd = (Math.random() * 2 - 1) * 15 || 0.01; this._hv = 1 + (Math.random() * 2 - 1) * 0.12; }
    // the biggest moments get their own 1.25x send, swapped in as this.fx while they are built
    const base = this.fx, fx = BOOST.has(name) ? this._gain(1.25, base) : base;
    this.fx = fx;
    try { this._sfx(name, k, now, t, this.key, fx); } finally { this._hd = 0; this._hv = 1; this.fx = base; }
  }
  _sfx(name, k, now, t, K, fx) {
    const c = this.ctx, kf = (f) => inKey(f * st(K), K);   // a pickup pitch, moved into the song's key
    switch (name) {
      case 'pass': {            // a blip that climbs the pentatonic scale: a tick right now, the pitched tail on the beat
        const q = this._quantCap(now);
        // the same overtake already rang as a combo link: just a dry tick, so it never sounds doubled
        if (now - (this.last.link ?? -9) < 0.06) { this.hum(t, 0.006, 0.05, 'highpass', 5000, 0.7, fx, 0, 0.001); break; }
        const n = +k || 0, f = this._scaleF(n, 220);
        this._passF = f;
        if (this._slotG && Math.abs(q - this._slotT) < 0.02) {   // same 32nd: make that blip a bit louder instead
          this._slotG.gain.value = Math.min(0.22 / 0.15, this._slotG.gain.value + 0.12);
          break;
        }
        this._transient(t, f, fx);
        const sg = this._gain(1, fx); this._slotG = sg; this._slotT = q; this._blipN++;
        this.tone('triangle', f * 0.97, f, q, 0.07, 0.15, sg, 0.003, 0.02);
        this._layers(q, f, n, sg);
        break;
      }
      case 'link': {            // a combo link: the next note of the climb, a timbre for each kind of trick
        const n = numArg(k, 'n'), kind = (k && k.kind) || 'pass', q = this._quantCap(now), f = this._scaleF(n, 440);
        this._passF = f; this._linkN = n; this._blipN++;
        this._transient(t, f, fx);   // the hit lands now; only the pitched tail waits for the grid
        this._layers(q, f, n, fx);
        if (this._blipN % 4 === 0) {        // every 4th link sings a note of the pad chord
          const ch = this.chord || PROG[0]; let cf = 440 * st(K + ch[(this._blipN >> 2) % 3]); while (cf > 880) cf /= 2; while (cf < 440) cf *= 2;
          this.tone('sine', cf, 0, q, 0.16, 0.04, fx, 0.01);
        }
        if (kind === 'close') { this.tone('sine', f, 0, q, 0.14, 0.11, fx, 0.002); this.tone('sine', f * 2, 0, q, 0.2, 0.04, fx, 0.002); this.tone('sine', f * 3.01, 0, q, 0.1, 0.02, this.fxEcho, 0.002); }
        else if (kind === 'gate') this._pluck(q, f / 2, 0.14);
        else if (kind === 'dodge') this.tone('sine', f * 0.9, f, q, 0.12, 0.09, fx, 0.01, 0.05);
        else if (kind === 'pop' || kind === 'bump') { const p = kind === 'pop' ? f : f / 2; this.tone('square', p, p * 0.5, q, 0.04, 0.05, fx, 0.001); this.hum(q, 0.012, 0.12, 'bandpass', 2200, 2, fx); }
        if (kind === 'dodge' || kind === 'pop') {   // a little "aww" from the thing you just beat, sliding down
          let af = f / 2; while (af > 420) af /= 2; while (af < 200) af *= 2;
          this.say(q + 0.07, [af], 'ah', 'oo', 0.16, 0.06, 0.08, 0.84, fx, 0);
        }
        else this.tone('triangle', f * 0.97, f, q, 0.07, 0.13, fx, 0.003, 0.02);
        break;
      }
      case 'sugar': { const f = kf(1320); this.tone('sine', f * 0.38, f, t, 0.07, 0.2, fx); this.tone('triangle', fold(kf(1568), 2000), 0, t + 0.05, 0.12, 0.1, fx); break; }
      case 'dna': {             // coin arpeggio in key; a streak walks its root up the pentatonic
        let b0 = 440 * st(K); while (b0 > 880) b0 /= 2;
        const n = this._dnaN, b = b0 * st(pen(n)), b2 = b0 * st(pen(n + 2));
        this.tone('square', b, 0, t, 0.05, 0.09, fx, 0.002);
        this.tone('square', b2, 0, t + 0.055, 0.22, 0.09, fx, 0.002);
        this.tone('sine', b * 2, 0, t + 0.11, 0.18, 0.06, fx);
        this.tone('sine', b2 * 2, 0, t + 0.15, 0.25, 0.04, this.fxEcho);
        break;
      }
      case 'shield': {          // shiny up arpeggio with a metallic ping
        [0, 4, 7, 12].forEach((s, j) => this.tone('triangle', kf(1047 * st(s)), 0, t + j * 0.045, 0.14, 0.12, fx));
        this.clang(t + 0.18, 0.5, 1600);
        break;
      }
      case 'alkali': case 'fizz':
        this.hum(t, 0.25, 0.15, 'highpass', 5000, 0.7, fx);
        for (let j = 0; j < 6; j++) this.tone('sine', 1500 + Math.random() * 1600, 0, t + j * 0.03, 0.03, 0.08, fx);
        break;
      case 'dash':              // whoosh with a doppler sweep and a lip "pff"
        this.hum(t, 0.32, 0.45, 'bandpass', 380, 1.4, fx, 2800, 0.04);
        this.hum(t + 0.12, 0.2, 0.2, 'bandpass', 2600, 1.2, fx, 700);
        this.tone('sine', 180, 520, t, 0.18, 0.16, fx);
        this.hum(t, 0.03, 0.3, 'bandpass', 1200, 1, fx);
        break;
      case 'bonk': {            // squelchy goo: a resonant filter sliding down and a wobbling plop
        this.hum(t, 0.28, 0.55, 'bandpass', 1500, 7, fx, 170, 0.004);
        const o = this.tone('sine', 280, 0, t, 0.26, 0.5, fx, 0.003);
        if (o) { const F = o.frequency; F.setValueAtTime(280, t); F.exponentialRampToValueAtTime(150, t + 0.05); F.exponentialRampToValueAtTime(210, t + 0.09); F.exponentialRampToValueAtTime(110, t + 0.15); F.exponentialRampToValueAtTime(130, t + 0.19); F.exponentialRampToValueAtTime(55, t + 0.26); }
        this.say(t + 0.02, [150], 'oo', 'uh', 0.18, 0.1, 0.1, 0.7);
        break;
      }
      case 'bump': {            // springy boing off a rival
        const o = this.tone('sine', 220, 0, t, 0.22, 0.3, fx, 0.003);
        if (o) { const F = o.frequency; F.setValueAtTime(220, t); F.exponentialRampToValueAtTime(480, t + 0.04); F.exponentialRampToValueAtTime(300, t + 0.1); F.exponentialRampToValueAtTime(380, t + 0.14); F.exponentialRampToValueAtTime(260, t + 0.22); }
        this.hum(t, 0.03, 0.2, 'lowpass', 1200, 1, fx);
        break;
      }
      case 'hit':               // something big hit your shield: clang plus a thud
        this.clang(t, 1, 420); this.tone('sine', 130, 45, t, 0.25, 0.5, fx); this.hum(t, 0.2, 0.3, 'lowpass', 900, 1, fx);
        this.duck(0.5, 0.3);
        break;
      case 'clang': this.clang(t, 1, 420); break;
      case 'pop':               // bubble pop
        this.tone('sine', 380, 1700, t, 0.06, 0.38, fx, 0.002);
        this.hum(t, 0.04, 0.3, 'highpass', 3000, 0.7, fx);
        this.tone('sine', 2200, 0, t + 0.04, 0.03, 0.08, fx);
        break;
      case 'chomp':             // a Big Mac takes two bites: "nom nom"
        for (const d of [0, 0.14]) {
          this.hum(t + d, 0.07, 0.5, 'lowpass', 900, 3, fx);
          this.tone('square', 95, 50, t + d, 0.08, 0.16, fx, 0.002);
          this.say(t + d, [130], 'oh', 'oo', 0.12, 0.16, 0.08, 0.8);
        }
        this.say(t + 0.3, [120, 180], 'oo', 'oo', 0.3, 0.1, 0.1, 0.9);   // "mmm"
        break;
      case 'frenzy': {          // impact on the frame the screen flashes, then an upward whoosh tail
        const tier = this._ftier || 1, KK = this.key, h = now + 0.01, x = tier - 1;
        this.B(h, 1.2, fx); this.crash(h, 1.2, fx);
        const voices = [220, 330], extra = [440, 277, 523, 660];
        for (let j = 0; j < Math.min(tier, 4); j++) voices.push(extra[j]);
        this.say(h, voices.map((f) => f * st(KK)), 'ee', 'ah', 0.45, 0.32, 0.12, 0.8);
        if (tier >= 3) this.hey(h + 0.14, 1.1, fx);
        this.duck(0.4, 0.5);
        const wd = 0.25 + 0.05 * x;
        this.hum(now + 0.02, wd, 0.3, 'bandpass', 300, 2, fx, 7000, 0.02);
        const rb = 500 * st(KK + x * 2);
        for (let j = 0; j < 6; j++) this.tone('sawtooth', Math.min(4000, rb * st(PENTA[j])), 0, now + 0.02 + j * wd / 6, 0.05, 0.045, fx);
        break;
      }
      case 'frenzyEnd': this.hum(t, 0.4, 0.2, 'bandpass', 3000, 2, fx, 300); break;
      case 'second': {          // heartbeat, then a choir rises you from the dead
        this.heart(t, 1.2); this.heart(t + 0.32, 1.3);
        this.say(t + 0.55, [220 * st(K), 277 * st(K), 330 * st(K)], 'oo', 'ah', 0.8, 0.26, 0.4, 1.5);
        this.hum(t + 0.55, 0.6, 0.2, 'bandpass', 600, 2, fx, 6000, 0.4);
        this.duck(0.3, 1.2);
        break;
      }
      case 'zone': {            // choir "ooh-AH" plus a crash
        const ch = [0, 3, 7, 12].map((s) => 220 * st(K + s));
        this.say(t, ch, 'oo', 'ah', 0.7, 0.24, 0.3, 1);
        this.B(t, 0.9, fx); this.crash(t, 0.7, fx);
        break;
      }
      case 'egg':               // arrived at the egg: big drum, heavenly chord
        this.B(t, 1.3, fx); this.crash(t, 1, fx); this.tom(t + 0.2, 130, 1, fx);
        this.say(t + 0.1, [262, 330, 392, 523].map((f) => f * st(K)), 'oh', 'ah', 1.4, 0.24, 0.5, 1);
        this.duck(0.4, 1.2);
        break;
      case 'mutation': case 'pick': {
        const f = fold(kf(660), 900);
        this.tone('triangle', f, f * 1.5, t, 0.12, 0.28, fx); this.tone('sine', f * 2, 0, t + 0.08, 0.2, 0.1, fx); this.tone('sine', f * 3, 0, t + 0.12, 0.2, 0.05, this.fxEcho);
        break;
      }
      case 'cards': this.hum(t, 0.3, 0.25, 'bandpass', 300, 1.5, fx, 3000, 0.2); this.tone('sine', 300, 900, t, 0.25, 0.1, fx); break;
      case 'reroll': for (let j = 0; j < 6; j++) this.hum(t + j * 0.04 + Math.random() * 0.02, 0.025, 0.3, 'bandpass', 1800 + Math.random() * 1500, 3, fx); break;
      case 'drill': {           // the egg drill: every tap the next note of the pentatonic climb, in key
        const n = Math.max(0, numArg(k, 'n') | 0), f = this._scaleF(n, 220);
        this.tone('triangle', f, 0, t, 0.07, 0.11, fx, 0.003);
        this.hum(t, 0.05, 0.16, 'bandpass', Math.min(6000, f * 3), 4, fx);
        if (n > 0 && n % 10 === 0) {   // every 10 taps the choir's chord answers
          const ch = this.chord || PROG[0]; let cf = 440 * st(K + ch[(n / 10) % 3]); while (cf > 880) cf /= 2; while (cf < 440) cf *= 2;
          this.tone('sine', cf, 0, t + 0.01, 0.22, 0.06, fx, 0.01); this.tone('sine', cf * 2, 0, t + 0.03, 0.2, 0.025, this.fxEcho, 0.01);
        }
        if (n >= 50) this._layers(t, f, n, fx);
        break;
      }
      case 'win': {             // the theme's call in brass, then the fanfare "da da da DAAA, da da DAAAAA", in the key you finished in
        this.duck(0.15, 3.9);
        const m = st(K), r = 392 * m, sq = 0.075;
        THEME[0].forEach((d, s) => {
          if (d === null) return;
          const f = fold(440 * m * st(PENTA[d]), 900), len = THEME_LEN[0][s];
          this._brass(t + s * sq, f, sq * len * 0.85, 0.1);
        });
        t += 16 * sq;
        for (let j = 0; j < 9; j++) this.Pf(t + j * 0.04, 0.25 + j * 0.06, fx);
        [0, 0.12, 0.24].forEach((d) => this._brass(t + d, r, 0.1, 0.12));
        const t1 = t + 0.36, t2 = t + 1.14;
        [523, 659, 784].forEach((f) => this._brass(t1, f * m, 0.48, 0.09));
        this.B(t1, 1.1, fx); this.crash(t1, 0.8, fx);
        this._brass(t + 0.86, 587 * m, 0.12, 0.11); this._brass(t + 1.0, 659 * m, 0.12, 0.11);
        [523, 659, 784, 1047].forEach((f) => this._brass(t2, f * m, 1.2, 0.08));
        this.B(t2, 1.2, fx); this.crash(t2, 1.2, fx);
        this.say(t2, [262, 330, 392].map((f) => f * m), 'oh', 'ah', 1.4, 0.2, 0.4, 1);
        [0, 4, 7, 12, 16, 19, 24].forEach((s, j) => this.tone('triangle', 1047 * m * st(s), 0, t2 + 0.3 + j * 0.06, 0.2, 0.06, this.fxEcho));
        if (typeof k === 'number' && k >= 0 && k <= 4) this._rival(t + 2.2, k, 0.8, 0, 0.8, K);   // the beaten rival deflates
        this._resetSong();
        break;
      }
      case 'lose': {            // the thief gloats with its own motif, a kazoo tries the theme and gives up, then one of three sad stings
        const m = st(K), rv = rivalIdx(k), tk = rv >= 0 ? t + 0.9 : t, t0 = tk + 0.95;
        if (rv >= 0) this._rival(t, rv, 1, 7, 0.6, K, 1);
        let j = 0;
        for (let s = 0; s < 16 && j < 4; s++) {   // the first 4 notes of the theme; the 4th hangs on and sags, unresolved
          const d = THEME[0][s]; if (d === null) continue;
          const last = j === 3, f = fold(440 * m * st(PENTA[d]), 700);
          this.say(tk + j * 0.17, [f, f * 1.006], 'ee', last ? 'oo' : 'eh', last ? 0.6 : 0.15, 0.11, 0.05, last ? 0.94 : 1);
          j++;
        }
        let v = Math.floor(Math.random() * 3); if (v === this._loseV) v = (v + 1 + Math.floor(Math.random() * 2)) % 3;
        this._loseV = v;
        this.duck(0.2, 3.2 + t0 - t); this.setMuffle(true); this.mlp.frequency.setTargetAtTime(18000, t0 + 3.2, this._ftc(0.4));
        if (v === 0) {          // sad trombone: wah wah wah waaaah
          [233, 220, 208].forEach((f, j) => this._brass(t0 + j * 0.42, f * m, 0.38, 0.13, true));
          this._brass(t0 + 1.26, 196 * m, 1.4, 0.13, true, true);
          this.tone('sine', 98 * m, 0, t0 + 1.26, 1.3, 0.12, fx, 0.05);
        } else if (v === 1) {   // a kazoo deflating like a party balloon, and a last little "pfft"
          this.say(t0, [466 * m, 470 * m], 'ee', 'oo', 1.5, 0.2, 0.6, 0.33);
          this.tone('triangle', 233 * m, 78 * m, t0, 1.45, 0.05, fx, 0.04);
          this.hum(t0 + 1.5, 0.12, 0.2, 'bandpass', 900, 1.2, fx, 300, 0.01);
        } else {                // the beatboxer loses heart: "boots-n-cats-n-boots-n..." and stops
          const sp = 60 / this._bpm / 4;
          this.B(t0, 1, fx); this.ts(t0 + 2 * sp, 0.9, fx); this.Pf(t0 + 4 * sp, 1, fx); this.ts(t0 + 6 * sp, 0.9, fx);
          this.B(t0 + 8 * sp, 0.9, fx); this.ts(t0 + 10 * sp, 0.6, fx);
          this.say(t0 + 16 * sp, [196 * m], 'uh', 'oh', 0.25, 0.16, 0.1, 0.92);
          this.say(t0 + 16 * sp + 0.3, [165 * m], 'oh', 'oo', 0.6, 0.16, 0.2, 0.75);
        }
        this._resetSong();
        break;
      }
      case 'loseClose': {       // so close: an arpeggio that climbs and hangs on the leading note, unresolved
        const r = fold(220 * st(K), 330);
        [0, 3, 7, 11].forEach((s, j) => {
          const last = j === 3, f = r * 2 * st(s);
          this.tone('triangle', f, 0, t + j * 0.11, last ? 0.5 : 0.1, 0.11, fx, 0.004);
          if (last) this.tone('sine', f, 0, t + j * 0.11, 0.45, 0.04, this.fxEcho, 0.01);
        });
        break;
      }
      case 'drillLead': {       // +1: you took the lead (a brass stab, 2 st higher each retake); -1: a rival did
        const up = numArg(k, 'k') > 0;
        if (up) { const f = fold(392 * st(K + 2 * Math.max(0, this._leadN - 1)), 900); [0, 4, 7].forEach((s, j) => this._brass(t + j * 0.06, f * st(s), j === 2 ? 0.2 : 0.06, 0.1)); }
        else { const f = fold(330 * st(K), 500); this._brass(t, f, 0.32, 0.1, false, false, f * st(-3), 0.26); }
        break;
      }
      case 'rivalShove':        // a rival barges you: "hmpf"
        this.tone('sine', 160, 55, t, 0.1, 0.4, fx, 0.002);
        this.say(t, [110], 'uh', 'uh', 0.1, 0.12, 0.05, 0.8);
        break;
      case 'again': {           // retry: a 0.5 s rev-up, whoosh 300 to 3000 Hz, "ba-DUM", zip
        const g = this._gain(0.45, fx);
        this.hum(t, 0.36, 0.6, 'bandpass', 300, 1.6, g, 3000, 0.25);
        this.B(t + 0.3, 0.7, g); this.B(t + 0.42, 1, g); this.Pf(t + 0.42, 1, g);
        this.tone('sine', 500, 2600, t + 0.44, 0.06, 0.3, g, 0.002);
        break;
      }
      case 'tell': {            // the cilia are about to swat: a rising fizz from their wall, on the next 16th
        const side = Math.max(-1, Math.min(1, numArg(k, 'side'))), q = this._next16(now);
        let dest = fx;
        if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = side * 0.8; p.connect(fx); dest = p; }
        if (this._busy(1)) break;
        const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.Q.value = 4;
        bp.frequency.setValueAtTime(600, q); bp.frequency.exponentialRampToValueAtTime(1800, q + 0.4);
        g.gain.setValueAtTime(0.0001, q); g.gain.exponentialRampToValueAtTime(0.05, q + 0.34); g.gain.linearRampToValueAtTime(0.0001, q + 0.4);
        s.connect(bp); bp.connect(g); g.connect(dest); this.live++; s.onended = this._dec; s.start(q, Math.random() * 0.5); s.stop(q + 0.42);
        break;
      }
      case 'comboLow': {        // the combo timer is running out: a kick-tick on every 8th, a semitone higher each tick
        const q = this._grid(now, 2);
        if (Math.abs(q - this._clQ) < 0.02) break;
        if (now - this._clT > 0.6) this._clN = 0;
        this._clT = now; this._clQ = q;
        const gr = k && typeof k === 'object' && k.grade != null ? Math.max(0, Math.min(4, k.grade | 0)) : bankGrade(this.combo);
        const v = 0.55 + 0.15 * gr, n = Math.min(12, this._clN++), f = fold(880 * st(K + n), 1760);
        this.tone('sine', 150, 55, q, 0.05, 0.28 * v, fx, 0.002);
        this.tone('triangle', f, 0, q, 0.03, 0.07 * v, fx, 0.001);
        this.hum(q, 0.008, 0.12 * v, 'bandpass', 3000, 2, fx, 0, 0.001);
        break;
      }
      case 'comboMilestone': {  // 100, 150, 200...: the crowd goes wild and the key lifts until the combo ends
        const m = st(this.key);
        for (const [f, v, d] of [[700, 0.16, 0.9], [1500, 0.12, 0.8], [3200, 0.07, 0.6]]) this.hum(t, d, v, 'bandpass', f, 0.9, fx, f * 1.3, 0.08);
        this.say(t + 0.03, [220, 277, 330, 440].map((f) => f * m), 'eh', 'ah', 0.6, 0.18, 0.15, 1.04);
        this.hey(t + 0.12, 1, fx);
        for (let j = 0; j < 8; j++) this.hum(t + 0.05 + j * 0.06 + Math.random() * 0.03, 0.02, 0.18, 'bandpass', 1200 + Math.random() * 900, 2, fx);   // claps
        this.duck(0.5, 0.6);
        break;
      }
      case 'ready': { const f = fold(kf(440), 600); this._pluck(t, f, 0.08); this._pluck(t + 0.07, f * 1.5, 0.08); break; }
      case 'synTease': {        // two mutations are one card away from a synergy: a shimmer, fifth to octave
        const r = fold(440 * st(K), 700);
        this.tone('triangle', r * 1.5, 0, t, 0.12, 0.25, fx, 0.006);
        this.tone('triangle', r * 2, 0, t + 0.1, 0.15, 0.25, fx, 0.006);
        this.tone('sine', r * 4, 0, t + 0.1, 0.12, 0.03, this.fxEcho, 0.006);
        break;
      }
      case 'swat': this.tone('sine', 1200, 300, t, 0.09, 0.22, fx, 0.002); this.hum(t, 0.02, 0.12, 'highpass', 3000, 0.7, fx); break;
      case 'clutch': {          // a tight 4-hit snare roll that lands on the next combo note
        const sp = 60 / this._bpm / 4, d = Math.min(0.035, sp / 3);
        let q = this._quant(now); while (q < t + 3 * d + 0.01) q += sp / 2;
        for (let j = 0; j < 4; j++) this.Pf(q - (3 - j) * d, 0.35 + 0.15 * j, fx);
        const f = this._scaleF(this._linkN + 1, 440);
        this.tone('triangle', f * 0.97, f, q, 0.08, 0.1, fx, 0.003, 0.02);
        break;
      }
      case 'finisher': {        // mic drop: a reversed cymbal sucked into a heavy thud, then the coins
        const g = Math.max(0, Math.min(4, numArg(k, 'grade') | 0)), sw = 0.2 + 0.05 * g, h = t + sw;
        if (!this._busy(1)) {   // the reversed cymbal: highpassed noise swelling up to the drop, cut dead on it
          const s = c.createBufferSource(), hp = c.createBiquadFilter(), gg = c.createGain();
          s.buffer = this.noiseBuf; hp.type = 'highpass'; hp.Q.value = 0.7;
          hp.frequency.setValueAtTime(9000, t); hp.frequency.exponentialRampToValueAtTime(3000, h);
          gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.16 + 0.04 * g, h - 0.005); gg.gain.linearRampToValueAtTime(0.0001, h + 0.01);
          s.connect(hp); hp.connect(gg); gg.connect(fx); this.live++; s.onended = this._dec; s.start(t, Math.random() * 0.4); s.stop(h + 0.03);
        }
        this.tone('sine', 140, 38, h, 0.32, 0.55 + 0.05 * g, fx, 0.002, 0.2);     // the thud
        this.tone('triangle', 260, 90, h, 0.06, 0.25, fx, 0.001);                // the mic body knocking the floor
        this.hum(h, 0.09, 0.4, 'lowpass', 700, 1.5, fx, 200, 0.001);
        this.tone('sine', fold(1760 * st(K), 2400), 0, h + 0.07, 0.35, 0.025, this.fxEcho, 0.02);   // a whisper of feedback
        this._coins(h + 0.08, g, K, fx);
        this.duck(0.4, 0.5);
        break;
      }
      case 'style': {           // style level up: a rising major third on the next 16th, a semitone higher per level
        const lv = Math.max(3, Math.min(6, numArg(k, 'lv') | 0)), sp = 60 / this._bpm / 4, g = this._next16(now);
        const f = fold(659 * st(K + lv - 3), 1100);
        this.tone('triangle', f, 0, g, 0.09, 0.12, fx, 0.003);
        this.tone('triangle', f * st(4), 0, g + sp, 0.16, 0.12, fx, 0.003);
        this.tone('sine', f * st(4) * 2, 0, g + sp, 0.12, 0.03, this.fxEcho, 0.003);
        break;
      }
      case 'tap': {             // k 0..1 climbs for the rank count-up (in key, a soft triangle, never above 1100 Hz); plain buttons use 0
        const x = clamp01(k);
        if (x > 0) {
          let f = inKey(Math.min(1100, 400 * Math.pow(4, x)), K);
          if (f > 1100) f = inKey(f * st(-2.6), K);   // snapped up past the cap: take the scale note below
          this.tone('triangle', f * 1.06, f, t, 0.04, 0.1 + 0.08 * x, fx, 0.002, 0.015);
        } else this.tone('sine', 700, 400, t, 0.04, 0.15, fx, 0.002);
        this.hum(t, 0.01, 0.12, 'highpass', 4000, 0.7, fx);
        break;
      }
      case 'buy': {             // ka-ching
        const f = fold(kf(1047), 1400);
        this.hum(t, 0.05, 0.35, 'bandpass', 2500, 1, fx);
        this.tone('square', f, 0, t + 0.04, 0.06, 0.09, fx); this.tone('square', f * 1.5, 0, t + 0.1, 0.25, 0.09, fx);
        this.hum(t + 0.1, 0.3, 0.1, 'highpass', 7000, 0.7, fx);
        break;
      }
      case 'combo': {           // a crew member shouts "yeah!", higher for bigger combos
        const p = 200 * st(Math.min(12, Math.floor((+k || 0) / 10) * 2) + K);
        this.say(t, [p, p * 1.5], 'ee', 'ah', 0.28, 0.24, 0.12, 0.85);
        this.B(t, 0.6, fx);
        break;
      }
      case 'comboEnd':          // combo dropped: a deflating slide whistle
        this.tone('sine', 900, 180, t, 0.35, k >= 10 ? 0.12 : 0.06, fx, 0.01);
        break;
      case 'comboBreak':        // record scratch, and the band stops for a beat
        this.hum(t, 0.1, 0.4, 'bandpass', 3200, 4, fx, 500);
        this.hum(t + 0.1, 0.08, 0.3, 'bandpass', 500, 4, fx, 2200);
        this.tone('sawtooth', 700, 140, t, 0.16, 0.06, fx, 0.003);
        this.duck(0.35, 4 * 60 / this._bpm / 4);
        break;
      case 'comboBank': {       // combo cashed in: a coin for grade 0 up to a 12-coin cascade and a bell for grade 4
        const g = Math.max(0, Math.min(4, numArg(k, 'grade') | 0));
        this._coins(t, g, K, fx);
        if (g >= 1) {           // and a crowd "ohhh" that grows with the grade
          const m = st(K), d = 0.3 + 0.225 * g, vs = [196, 247, 294, 330, 392].slice(0, 2 + Math.ceil(g / 2)).map((f) => f * m);
          this.say(t + 0.14, vs, 'oh', 'oo', d, 0.1 + 0.03 * g, d * 0.5, 0.97);
          this.hum(t + 0.14, d, 0.06 + 0.02 * g, 'bandpass', 700, 1.2, fx, 0, d * 0.3);
        }
        break;
      }
      case 'boss': {            // passed a named rival: their own motif, a kick and a crash
        if (typeof k === 'number' && k >= 0 && k <= 4) this._rival(t, k, 1);
        else [0, 4, 7].forEach((s) => this._brass(t, 392 * st(K + s), 0.25, 0.08));
        this.B(t, 1, fx); this.crash(t, 0.8, fx);
        break;
      }
      case 'bossTaunt': this._rival(t, +k || 0, 0.5, -5); break;
      case 'eggClaim': {        // a rival is drilling YOUR egg: "dun DUN", then its motif, smug
        this._brass(t, 196, 0.16, 0.14); this.tone('sine', 98, 0, t, 0.16, 0.2, fx, 0.005);
        this._brass(t + 0.22, 185, 0.5, 0.18); this.tone('sine', 92.5, 0, t + 0.22, 0.5, 0.25, fx, 0.005);
        this.B(t + 0.22, 0.8, fx);
        const rv = rivalIdx(k); if (rv >= 0) this._rival(t + 0.5, rv, 0.9, 0, 0.3, K, 1);
        break;
      }
      case 'drillShove': this.tone('sine', 300, 120, t, 0.08, 0.35, fx, 0.002); break;
      case 'surf': this.hum(t, 0.4, 0.3, 'lowpass', 400, 2, fx, 2500, 0.1); this.tone('sine', 400, 800, t, 0.3, 0.08, fx); break;
      case 'heart': this.heart(t, 1); break;
      case 'lowE': {            // low energy: a heartbeat on the next quarter note, never on top of the egg bed
        if (this._tension > 0.02 || this._contest) break;
        let tq = t;
        if (this.on && c.state === 'running' && this.next >= now && this.next < now + 1) {
          const sp = 60 / this._bpm / 4; tq = this.next + ((4 - (this.stepI & 3)) & 3) * sp;
        }
        if (Math.abs(tq - this._lowQ) < 0.05) break;   // that quarter already has its heartbeat
        this._lowQ = tq; this._hatDuck = tq + 0.32;
        if (numArg(k, 'k') >= 1) {   // critical: louder, and a bright tick on the "dub" a phone can play
          this.heart(tq, 0.85); this.tone('sine', 2000, 0, tq + 0.14, 0.04, 0.06, fx, 0.001);
        } else this.heart(tq, 0.7);
        break;
      }
      // ---------------- stingers for the rare moments (each under 0.6 s, in the song's key)
      case 'synergy': {         // a fifth slides into a maj7, the crowd goes WOAH, a cymbal swells
        const r = 330 * st(K), fresh = k === true || (k && k.fresh);
        this.tone('triangle', r * st(-2), r, t, 0.45, 0.1, fx, 0.01, 0.12);
        this.tone('triangle', r * st(5), r * st(7), t, 0.45, 0.08, fx, 0.01, 0.12);
        this.tone('sine', r * st(4), 0, t + 0.12, 0.34, 0.06, fx, 0.02);
        this.tone('sine', r * st(11), 0, t + 0.12, 0.34, 0.05, this.fxEcho, 0.02);
        this.say(t + 0.05, [220, 277, 330].map((f) => f * st(K)), 'oo', 'ah', 0.5, 0.16, 0.2, 1.06);
        this.hum(t, 0.5, 0.12, 'highpass', 5000, 0.7, fx, 0, 0.38);
        if (fresh) this.duck(0.5, 0.6);
        break;
      }
      case 'close':             // a near miss: just a whoosh (the combo link already played the note)
        this.hum(t, 0.18, 0.28, 'bandpass', 600, 1.5, fx, 2400, 0.02);
        break;
      case 'thread':            // threaded a gate: a little whistle (the link's pluck is the hit)
        this.tone('sine', 1175 * st(K) * 0.94, 1175 * st(K), t + 0.02, 0.16, 0.08, fx, 0.01, 0.04);
        this.tone('sine', 1175 * st(K), 0, t + 0.06, 0.12, 0.03, this.fxEcho, 0.01);
        break;
      case 'blast': {           // chain pop: one kick and a rising ladder of pops
        const n = Math.max(0, numArg(k, 'n') | 0);
        this.B(t, Math.min(1.8, 1 + 0.1 * n), fx);
        for (let j = 0; j < Math.min(n, 8); j++) { const f = 380 * st(K + j * 2); this.tone('sine', f, f * 4, t + 0.03 + j * 0.04, 0.05, 0.22, fx, 0.002); }
        break;
      }
      case 'record': {          // new personal best: da-da-DAA plus a crash
        const m = st(K);
        this._brass(t, 523 * m, 0.08, 0.11); this._brass(t + 0.1, 523 * m, 0.08, 0.11);
        [523, 659, 784].forEach((f) => this._brass(t + 0.2, f * m, 0.36, 0.08));
        this.B(t + 0.2, 0.9, fx); this.crash(t + 0.2, 0.8, fx, 0.4);
        break;
      }
      case 'legendary': {       // a rising hiss, then a bell
        const f = 1568 * st(K);
        this.hum(t, 0.28, 0.16, 'highpass', 800, 1, fx, 8000, 0.26);
        this.tone('sine', f, 0, t + 0.28, 0.3, 0.14, fx, 0.001);
        this.tone('sine', f * 2.76, 0, t + 0.28, 0.15, 0.04, fx, 0.001);
        this.tone('sine', f, 0, t + 0.3, 0.25, 0.05, this.fxEcho, 0.001);
        break;
      }
      case 'milestone':         // "hey!" and a hat roll
        this.hey(t, 1.1, fx);
        for (let j = 0; j < 6; j++) this.hat(t + j * 0.045, 0.6 + j * 0.15, fx);
        break;
      case 'event': {           // a wobbly cartoon siren
        const o = this.tone('sine', 600 * st(K), 0, t, 0.5, 0.12, fx, 0.01);
        if (o) { const F = o.frequency, b = 600 * st(K); F.cancelScheduledValues(t); F.setValueAtTime(b, t); for (let j = 1; j <= 4; j++) F.linearRampToValueAtTime(j & 1 ? b * 1.5 : b, t + j * 0.12); }
        this.tone('triangle', 300 * st(K), 450 * st(K), t, 0.5, 0.05, fx, 0.01, 0.25);
        break;
      }
      case 'spot': case 'lockon': {   // something has you in its sights (a lock-on, or a WBC spotting you): a wet rising hum and a marimba knock
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan'))), m = st(K);
        if (name === 'spot' || (k && typeof k === 'object' && k.spot)) {   // the WBC alert adds a two-note "eep eep" so it reads as "you are seen"
          const e = fold(kf(1320), 1500);
          this.tone('square', e, 0, t, 0.035, 0.035, fx, 0.001); this.tone('square', e, 0, t + 0.09, 0.05, 0.035, fx, 0.001);
        }
        let dest = fx;
        if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; p.connect(fx); dest = p; }
        this.tone('triangle', 220 * m, 330 * m, t, 0.35, 0.09, dest, 0.03);
        this.tone('triangle', 220 * m, 330 * m, t, 0.3, 0.05, this.fxEcho, 0.03);
        [110, 130.81].forEach((f, j) => { this.tone('sine', f * m, 0, t + j * 0.09, 0.16, 0.22, dest, 0.001); this.tone('sine', f * m * 4, 0, t + j * 0.09, 0.04, 0.05, dest, 0.001); });
        break;
      }
      case 'fork': {            // the fork: k.right true = a happy pluck run and a crowd "ooh"; false = sad brass and a "huh?"
        const right = k === true || !!(k && k.right);
        if (right) {
          const r = fold(kf(523), 700);
          [0, 4, 7, 12].forEach((s, j) => this._pluck(t + j * 0.05, r * st(s), 0.11));
          this.say(t + 0.1, [220, 277, 330].map((f) => f * st(K)), 'oo', 'oh', 0.42, 0.12, 0.15, 1.03);
        } else {
          const r = fold(330 * st(K), 420);
          this._brass(t, r, 0.18, 0.11, true); this._brass(t + 0.2, r * st(-2), 0.3, 0.11, true, false, r * st(-3), 0.3);
          this.say(t + 0.3, [fold(196 * st(K), 260)], 'uh', 'eh', 0.22, 0.14, 0.06, 1.25);   // "huh?", rising like a question
        }
        break;
      }
      case 'backflow': {        // swimming the wrong way: a tape rewind (the band also drops out for a dry beat)
        if (!this._busy(1)) {
          const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
          lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 1;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.04); g.gain.setValueAtTime(0.09, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
          o.connect(lp); lp.connect(g); g.connect(fx); this._go(o, t, t + 0.4);
        }
        this.hum(t, 0.35, 0.2, 'bandpass', 500, 2.5, fx, 4500, 0.03);
        for (let j = 0; j < 5; j++) this.hum(t + j * 0.07, 0.012, 0.1, 'bandpass', 2500 + j * 400, 3, fx);   // the tape flutter
        break;
      }
      case 'finale': {          // the final sprint: a riser and a "hey!" (the music rolls into a crash and speeds up)
        if (!this._busy(1)) {   // a noise riser that swells to the "hey!"
          const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
          s.buffer = this.noiseBuf; bp.type = 'bandpass'; bp.Q.value = 1.5;
          bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + 0.36);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.34); g.gain.linearRampToValueAtTime(0.0001, t + 0.38);
          s.connect(bp); bp.connect(g); g.connect(fx); this.live++; s.onended = this._dec; s.start(t, Math.random() * 0.5); s.stop(t + 0.4);
        }
        this.tone('sawtooth', 220 * st(K), 440 * st(K), t, 0.06, 0.04, fx, 0.3, 0.34);
        this.hey(t + 0.36, 1, fx);
        break;
      }
      case 'land':              // a heavy landing: low kick and a short cymbal
        this.B(t, 0.8, fx); this.tone('sine', 90, 40, t, 0.12, 0.3, fx, 0.002);
        this.hum(t, 0.12, 0.14, 'highpass', 6000, 0.7, fx);
        break;
    }
  }
  // coins climbing the pentatonic: grade 0 one coin, grade 4 twelve over 0.8 s, grades 3 and 4 end in a bell
  _coins(t, g, K, fx) {
    const n = [1, 3, 5, 8, 12][g], span = [0, 0.14, 0.3, 0.5, 0.8][g], m = st(K);
    let b = 988 * m / 2; while (b > 700) b /= 2;
    for (let j = 0; j < n; j++) {
      const at = t + (n > 1 ? span * Math.pow(j / (n - 1), 0.85) : 0), f = fold(b * st(pen(j)), 2400), last = j === n - 1;
      this.tone('square', f, 0, at, last ? 0.2 : 0.05, 0.08, fx, 0.002);
    }
    this.tone('sine', fold(b * st(pen(n + 1)) * 2, 2600), 0, t + span + 0.06, 0.25, 0.04, this.fxEcho);
    if (g >= 3) {               // the bell: inharmonic partials, long tail
      const bt = t + span + 0.05, f = fold(1568 * m, 2000);
      [1, 2.76, 5.4].forEach((r, j) => this.tone('sine', f * r, 0, bt, 0.9 / (1 + j), (g === 4 ? 0.12 : 0.08) / (1 + j * 1.5), fx, 0.001));
      this.tone('sine', f, 0, bt + 0.02, 0.6, 0.04, this.fxEcho, 0.001);
    }
  }
  // the next step on the beat grid that is a multiple of `div` sixteenths (2: 8ths, 4: quarters)
  _grid(now, div) {
    const fb = now + 0.005;
    if (!this.on || !this.ctx || this.ctx.state !== 'running' || !this.next) return fb;
    const spb = 60 / this._bpm / 4;
    if (this.next < now || this.next > now + spb + 0.2) return fb;
    const j = Math.floor((this.next - now) / spb), idx = this.stepI - j;
    return Math.max(fb, this.next - j * spb + (((div - (idx % div)) % div + div) % div) * spb);
  }
  clang(t, v, f) {             // inharmonic metal partials: a shield taking the hit
    [1, 2.76, 5.4, 8.93].forEach((m, j) => this.tone(j % 2 ? 'square' : 'sine', f * m, 0, t, 0.6 / (1 + j * 0.6), 0.14 * v / (1 + j * 0.5), this.fx, 0.001));
    this.hum(t, 0.02, 0.4 * v, 'highpass', 3000, 0.7, this.fx);
    this.tone('sine', f * 2.76, 0, t + 0.01, 0.4, 0.04 * v, this.fxEcho);
  }
  heart(t, v, dest = this.fx) {    // "lub-dub": a low thump, plus a click in the band a phone speaker can play
    this.tone('sine', 70, 40, t, 0.14, 0.6 * v, dest, 0.005);
    this.tone('sine', 140, 90, t, 0.06, 0.35 * v, dest, 0.003);
    this.tone('sine', 85, 45, t + 0.14, 0.12, 0.45 * v, dest, 0.005);
    this.tone('sine', 170, 110, t + 0.14, 0.05, 0.28 * v, dest, 0.003);
  }
  _resetSong() {
    this._bpm = ZONE_BPM[0]; this.key = 0; this._lift = 0; this._mlift = 0; this._ftier = 0; this.heat = 0;
    this._zone = 0; this._cTier = 0; this._rollAt = -1; this._rollLen = 4; this._fin = 0;
    this._keyNext = null; this._keyCrash = false; this._whoopBar = -1;
    this._syncDelay(); this._applyTrem(); this.threat(0); this.acid = 0;
  }
}
