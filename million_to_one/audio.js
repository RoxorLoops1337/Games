// Million To One: every sound is synthesised in code (no audio files).
// The music is a beatbox crew in a box: B kick, Pf and K snares, t and ts hats, the
// inward K, a hummed bass, "ooh" choir pads made by pushing sawtooth waves through vowel
// (formant) filters, "wah" stabs and a whistled lead when things get wild, and a fill
// every 8 bars. Tempo and key climb zone by zone; the arrangement grows with intensity 0..2
// and with the player's live combo.
//
// CPU budget: notes are scheduled ~150ms ahead from tick(), every source is counted and
// low priority voices (hats, ghosts) are dropped when too many are sounding, the vowel
// filters for the pads and stabs are shared persistent nodes, and one 1s noise buffer is
// reused by every hiss.

const VOW = {
  oo: [300, 870, 2240], oh: [570, 840, 2410], ah: [730, 1090, 2440],
  eh: [530, 1840, 2480], ee: [270, 2290, 3010], uh: [520, 1190, 2390],
};
const FG = [1, 0.5, 0.16];          // formant gains (F1, F2, F3)
const FBW = [90, 110, 150];         // formant bandwidths in Hz
const ZONE_BPM = [96, 104, 110, 116, 120, 128, 136];
const ZONE_KEY = [0, 2, 3, 5, 7, 5, 8];   // semitone lift per zone, the song climbs with you
const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]]; // Am F C G (relative to the key root A)
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const MUSIC_VOL = 0.5;
const CAP = 64;                     // concurrent sources before low priority voices are skipped
const st = (s) => Math.pow(2, s / 12);
const zoneOf = (bpm) => { let b = 0; for (let i = 1; i < ZONE_BPM.length; i++) if (Math.abs(ZONE_BPM[i] - bpm) < Math.abs(ZONE_BPM[b] - bpm)) b = i; return b; };
const P = (s) => [...s].map((ch) => ch === 'x');

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

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.on = false;
    this._bpm = 96; this._int = 0; this.key = 0;
    this.next = 0; this.stepI = 0; this.barBase = 0; this.fillBar = -1; this.fillN = 0;
    this.crashBar = -1; this.crashNext = false; this.curFill = -1;
    this.heat = 0; this.heatT = 0; this.live = 0; this.last = {}; this.motif = null; this.lastPass = 0;
    this._dec = () => { this.live--; };
  }

  // ------------------------------------------------------------------ public knobs
  get bpm() { return this._bpm; }
  set bpm(v) {
    v = +v || 96; if (v === this._bpm) return;
    this._bpm = v; this.key = ZONE_KEY[zoneOf(v)];
    if (this.ctx && this.on) this._queueFill();
    if (this.delay) this.delay.delayTime.setTargetAtTime(Math.min(1.4, 3 * 60 / v / 4), this.ctx.currentTime, 0.05);
  }
  get intensity() { return this._int; }
  set intensity(v) {
    const old = this._int; this._int = +v || 0;
    if (!this.ctx || !this.on) return;
    if (this._int >= 1.5 && old < 1.5) this.crashNext = true;
    if (this._int < 1.5 && old >= 1.5) this._deflate();
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) { /* ignore */ } } return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return;
    let c; try { c = new AC(); } catch (e) { return; }
    this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.fx = c.createGain(); this.fx.gain.value = 1; this.fx.connect(this.master);
    // music bus: gain (ducking) -> lowpass (muffle) -> master
    this.mlp = c.createBiquadFilter(); this.mlp.type = 'lowpass'; this.mlp.frequency.value = 18000; this.mlp.Q.value = 0.6; this.mlp.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = MUSIC_VOL; this.music.connect(this.mlp);
    // a dotted-eighth echo, the beatboxer's favourite pedal
    this.echo = c.createGain(); this.echo.gain.value = 1;
    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 3 * 60 / this._bpm / 4;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    const fb = c.createGain(); fb.gain.value = 0.33;
    const wet = c.createGain(); wet.gain.value = 0.25;
    this.echo.connect(this.delay); this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay); dlp.connect(wet); wet.connect(this.mlp);
    // shared noise
    const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = this.noiseBuf; // legacy name
    // the choir: two persistent vowel filter banks (pads sing "ooh", stabs go "wah")
    this.padBank = this._bank('oo', 2.4); this.padBank.out.connect(this.music);
    const ps = c.createGain(); ps.gain.value = 0.35; this.padBank.out.connect(ps); ps.connect(this.echo);
    this.stabBank = this._bank('ah', 2.8); this.stabBank.out.connect(this.music);
    // the hummed bass shares one lowpass, its envelope moves per note
    this.bassLp = c.createBiquadFilter(); this.bassLp.type = 'lowpass'; this.bassLp.frequency.value = 400; this.bassLp.Q.value = 5;
    this.bassLp.connect(this.music);
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.muted ? 0 : 0.85, t); }
  }
  // dull the music (pause menu, mutation cards). Optional: the game works without calling it.
  setMuffle(on) { if (!this.ctx) return; const t = this.ctx.currentTime; this.mlp.frequency.cancelScheduledValues(t); this.mlp.frequency.setTargetAtTime(on ? 650 : 18000, t, on ? 0.06 : 0.15); }
  // drop the music for a moment so a big sound effect can shine
  duck(amount = 0.35, sec = 0.6) {
    if (!this.ctx) return; const g = this.music.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(MUSIC_VOL * amount, t, 0.03); g.setTargetAtTime(MUSIC_VOL, t + sec, 0.25);
  }
  // a fresh race: back to zone 1 tempo and key, and land the first beat on a crash
  newRun() {
    this._bpm = ZONE_BPM[0]; this.key = 0; this._int = 0; this.heat = 0;
    if (!this.ctx) return;
    this.delay.delayTime.setTargetAtTime(3 * 60 / this._bpm / 4, this.ctx.currentTime, 0.05);
    this.setMuffle(false); this.duck(1, 0);
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
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
    this.env(g, t, a, vol, dur); o.connect(g); g.connect(dest || this.fx); this._go(o, t, t + a + dur + 0.03);
    return o;
  }
  // filtered noise; f1 sweeps the filter over the whole sound
  hum(t, dur, vol, type, f0, q, dest, f1 = 0, a = 0.002, pri = 1) {
    if (this._busy(pri)) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; if (dur > 0.9) s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q; if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, a, vol, dur); s.connect(f); f.connect(g); g.connect(dest || this.fx);
    this.live++; s.onended = this._dec; s.start(t, Math.random() * Math.max(0, 0.95 - dur)); s.stop(t + a + dur + 0.03);
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
  say(t, freqs, v0, v1, dur, vol, glide = 0.15, bend = 1, dest) {
    if (this._busy(1)) return;
    const c = this.ctx, out = c.createGain(); out.connect(dest || this.fx);
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
      o.detune.value = (Math.random() - 0.5) * 12; o.connect(mix); this._go(o, t, t + dur + 0.03);
    }
  }
  // brass-ish note for fanfares: two detuned saws through a lowpass that opens and closes ("wah")
  _brass(t, f, dur, vol, wah = false, vib = false) {
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
      if (lfo) lfo._d.connect(o.detune);
      o.connect(lp); this._go(o, t, t + dur + 0.03);
    }
    if (lfo) this._go(lfo, t + dur * 0.25, t + dur + 0.03);
  }

  // ------------------------------------------------------------------ the kit (all mouth noises)
  B(t, v = 1, dest = this.music) {         // kick: lip burst plus a falling chest thump
    this.tone('sine', 185, 46, t, 0.22, 0.95 * v, dest, 0.002, 0.09);
    this.tone('triangle', 130, 70, t, 0.05, 0.28 * v, dest, 0.002);
    this.hum(t, 0.016, 0.32 * v, 'lowpass', 2800, 0.7, dest);
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
  hat(t, v = 1, dest = this.music) { this.hum(t, 0.022, 0.15 * v, 'highpass', 8500, 0.7, dest, 0, 0.001, 0); }
  ts(t, v = 1, dest = this.music) { this.hum(t, 0.13, 0.12 * v, 'highpass', 6000, 0.8, dest, 0, 0.004, 0); }
  tom(t, f, v = 1, dest = this.music) {    // mouth toms: "doon"
    this.tone('sine', f, f * 0.55, t, 0.2, 0.55 * v, dest, 0.003);
    this.tone('triangle', f * 2, f, t, 0.03, 0.14 * v, dest, 0.002);
  }
  crash(t, v = 1, dest = this.music) {     // "kssshh"
    this.hum(t, 0.8, 0.2 * v, 'highpass', 4500, 0.7, dest, 0, 0.003);
    this.hum(t, 0.35, 0.1 * v, 'bandpass', 9000, 0.6, dest, 0, 0.003);
    this.hum(t, 0.3, 0.08 * v, 'highpass', 5000, 0.7, this.echo, 0, 0.003, 0);
  }
  hey(t, v = 1) { this.say(t, [196 * st(this.key)], 'eh', 'ee', 0.22, 0.3 * v, 0.12, 0.85, this.music); }

  // ------------------------------------------------------------------ the beat
  tick() {
    const c = this.ctx; if (!c || !this.on) return;
    const now = c.currentTime;
    if (this.heat && now - this.heatT > 2.4) this.heat = 0;
    if (this.next < now - 0.25 || this.next > now + 1.5) this.next = now + 0.06;   // woke from a sleep or clock jump
    const silent = this.muted || c.state !== 'running';
    let guard = 0;
    while (this.next < now + 0.15 && guard++ < 32) { if (!silent) this._step(this.next); this.next += 60 / this._bpm / 4; this.stepI++; }
  }
  _queueFill() { const i = this.stepI & 15, bar = this.stepI >> 4; this.fillBar = i < 6 ? bar : bar + 1; }
  _deflate() {             // frenzy over: a falling "fwoomp"
    const t = this.ctx.currentTime + 0.01;
    this.hum(t, 0.5, 0.22, 'bandpass', 3000, 2, this.music, 300);
    this.tone('sawtooth', 300, 80, t, 0.45, 0.06, this.music);
  }
  _step(t0) {
    const i = this.stepI & 15, bar = this.stepI >> 4, I = this._int;
    const L = I < 0.5 ? 0 : I < 1.5 ? 1 : 2, spb = 60 / this._bpm / 4, M = this.music;
    const hot = this.heat >= 12, blazing = this.heat >= 25;
    const t = t0 + ((i & 1) ? spb * (L === 2 ? 0.05 : 0.15) : 0);   // swing the off sixteenths
    const pb = (((bar - this.barBase) % 8) + 8) % 8;
    if (i === 0) {
      if (this.crashBar === bar || this.crashNext) { this.crash(t, 1); this.crashNext = false; }
      this.curFill = -1;
      if (this.fillBar === bar || (this.fillBar < bar && (pb === 7 || (L === 2 && pb === 3)))) {
        this.curFill = this.fillN++ % FILLS.length;
        if (this.fillBar === bar) this.barBase = bar + 1;
        this.crashBar = bar + 1; this.fillBar = -1;
      }
      if (pb === 0 || !this.motif) this._newMotif();
    }
    const chord = PROG[pb & 3], root = 55 * st(this.key + chord[0]);
    const fill = this.curFill >= 0 && i >= 8 ? FILLS[this.curFill][i - 8] : null;
    const stop = this.curFill === 2 && i >= 9;
    if (fill !== null) {
      const v = 0.6 + (i - 8) * 0.06;
      for (const ch of fill) {
        if (ch === 'B') this.B(t, 1); else if (ch === 'P') this.Pf(t, v); else if (ch === 'K') this.Kin(t, v);
        else if (ch === 'k') this.rim(t, v * 1.2); else if (ch === 'h') this.tom(t, 260, v); else if (ch === 'm') this.tom(t, 185, v);
        else if (ch === 'l') this.tom(t, 130, v); else if (ch === 'Y') this.hey(t, 1);
      }
      if (!stop && i % 2 === 0) this.hat(t, 0.7);
    } else {
      // drums
      if (KICK[L][bar & 1][i]) this.B(t, i === 0 ? 1 : 0.85);
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
    }
    // bass hum
    if (!stop) {
      for (const [s, semi, len] of BASS[L]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, L);
    }
    // choir pads on the downbeat, wah stabs on the offbeats when it heats up
    if (i === 0 && this.curFill !== 2) {
      const vol = L === 0 ? 0.028 : L === 1 ? 0.04 : 0.032;
      this._vowel(this.padBank, (pb & 3) === 3 ? 'ah' : (L === 2 ? 'oh' : 'oo'), t, 0.25);
      for (const s of chord) { let f = 220 * st(this.key + s); while (f > 420) f /= 2; while (f < 190) f *= 2; this._sing(this.padBank, f, t, spb * 16 * 0.98, vol, 0.12); }
    }
    if (!stop && ((L === 2 && (i === 6 || i === 14)) || (L === 1 && hot && i === 14))) {
      this._vowel(this.stabBank, 'oo', t, 0.004); this._vowel(this.stabBank, 'ah', t + 0.03, 0.08);
      for (let k = 1; k < 3; k++) { let f = 220 * st(this.key + chord[k]); while (f > 520) f /= 2; while (f < 260) f *= 2; this._sing(this.stabBank, f, t, 0.16, 0.06, 0.01); }
    }
    // the whistled lead: only in frenzy or a big live combo
    if ((L === 2 || blazing) && !stop && this.motif[i] !== null) {
      let f = 880 * st(this.key + PENTA[this.motif[i]]); while (f > 1500) f /= 2;
      this._whistle(t, f, spb * 1.7);
    }
  }
  _newMotif() {
    const m = new Array(16).fill(null); let d = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < 16; s++) if (Math.random() < (s % 2 ? 0.14 : (s % 4 === 0 ? 0.5 : 0.32))) { d = Math.max(0, Math.min(PENTA.length - 1, d + Math.floor(Math.random() * 5) - 2)); m[s] = d; }
    this.motif = m;
  }
  _bass(t, f, dur, L) {
    if (this._busy(0)) return;
    const c = this.ctx, lp = this.bassLp, g = c.createGain(), o = c.createOscillator(), o2 = c.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2;
    lp.frequency.setValueAtTime(L === 2 ? 1400 : 950, t); lp.frequency.setTargetAtTime(L === 0 ? 240 : 320, t + 0.01, 0.05);
    const v = L === 2 ? 0.2 : 0.17;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    const g2 = this._gain(0.35); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp);
    this._go(o, t, t + dur + 0.06); this._go(o2, t, t + dur + 0.06);
  }
  _whistle(t, f, dur) {
    const o = this.tone('sine', f * 0.94, f, t, dur, 0.07, this.music, 0.015, 0.04, 0);
    if (o) this.tone('sine', f * 0.94, f, t, dur * 0.8, 0.025, this.echo, 0.015, 0.04, 0);
  }

  // ------------------------------------------------------------------ sound effects
  // names: pass (k = combo), sugar, dna, shield, alkali/fizz, dash, bonk, bump, hit, clang, pop,
  // chomp, frenzy, frenzyEnd, second, zone, egg, pick, cards, reroll, drill (k = taps), win,
  // lose, tap, buy, combo (k = combo), comboEnd (k = combo), boss, surf, heart, mutation
  sfx(name, k = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, now = c.currentTime, t = now + 0.005;
    const gap = { pass: 0.035, drill: 0.025, sugar: 0.03, bonk: 0.08, bump: 0.06, pop: 0.04, dna: 0.05, tap: 0.03, heart: 0.3 }[name] || 0.015;
    if (now - (this.last[name] || -9) < gap) return;
    this.last[name] = now;
    const K = this.key, fx = this.fx;
    switch (name) {
      case 'pass': {            // a blip that climbs the pentatonic scale as the combo grows
        this.heat = Math.max(this.heat, k); this.heatT = now;
        const n = Math.min(k, 40), deg = PENTA[n % 5] + 12 * Math.min(2, Math.floor(n / 5) % 3 + (n >= 15 ? 1 : 0));
        const f = 330 * st(K + Math.min(deg, 31));
        this.tone('triangle', f * 0.97, f, t, 0.07, 0.15, fx, 0.003, 0.02);
        if (k >= 10) this.tone('sine', f * 2, 0, t + 0.01, 0.05, 0.05, fx);
        if (k >= 25) this.tone('square', f * 1.5, 0, t, 0.03, 0.025, fx);
        break;
      }
      case 'sugar': this.tone('sine', 500, 1300, t, 0.07, 0.2, fx); this.tone('triangle', 1568, 0, t + 0.05, 0.12, 0.1, fx); break;
      case 'dna': {             // coin arpeggio
        const b = 988 * st(K % 12 === 0 ? 0 : 0);
        this.tone('square', b, 0, t, 0.05, 0.09, fx, 0.002);
        this.tone('square', b * st(5), 0, t + 0.055, 0.22, 0.09, fx, 0.002);
        this.tone('sine', b * st(12), 0, t + 0.11, 0.18, 0.06, fx);
        this.tone('sine', b * st(17), 0, t + 0.15, 0.25, 0.04, this.echo);
        break;
      }
      case 'shield': {          // shiny up arpeggio with a metallic ping
        [0, 4, 7, 12].forEach((s, j) => this.tone('triangle', 1047 * st(s), 0, t + j * 0.045, 0.14, 0.12, fx));
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
      case 'frenzy': {          // riser, impact, crowd shout
        this.hum(t, 0.42, 0.35, 'bandpass', 500, 2, fx, 7000, 0.3);
        for (let j = 0; j < 10; j++) this.tone('sawtooth', 220 * st(K + PENTA[j]), 0, t + j * 0.04, 0.06, 0.05, fx);
        const h = t + 0.42;
        this.B(h, 1.2, fx); this.crash(h, 1.2, fx);
        this.say(h, [220 * st(K), 330 * st(K)], 'ee', 'ah', 0.45, 0.32, 0.12, 0.8);
        this.duck(0.4, 0.5);
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
      case 'mutation': case 'pick':
        this.tone('triangle', 660, 990, t, 0.12, 0.28, fx); this.tone('sine', 1320, 0, t + 0.08, 0.2, 0.1, fx); this.tone('sine', 1980, 0, t + 0.12, 0.2, 0.05, this.echo);
        break;
      case 'cards': this.hum(t, 0.3, 0.25, 'bandpass', 300, 1.5, fx, 3000, 0.2); this.tone('sine', 300, 900, t, 0.25, 0.1, fx); break;
      case 'reroll': for (let j = 0; j < 6; j++) this.hum(t + j * 0.04 + Math.random() * 0.02, 0.025, 0.3, 'bandpass', 1800 + Math.random() * 1500, 3, fx); break;
      case 'drill': {           // the egg drill: every tap a notch higher
        const n = Math.min(k, 72), f = 70 * st(n * 0.5);
        this.tone('sawtooth', f, f * 1.06, t, 0.06, 0.12, fx, 0.003);
        this.tone('square', f * 2, 0, t, 0.03, 0.04, fx, 0.002);
        this.hum(t, 0.05, 0.16, 'bandpass', Math.min(6000, f * 5), 4, fx);
        if (k > 0 && k % 10 === 0) this.tone('sine', 1568 * st(Math.min(12, k / 10)), 0, t + 0.02, 0.15, 0.1, fx);
        break;
      }
      case 'win': {             // fanfare: "da da da DAAA, da da DAAAAA"
        this.duck(0.15, 3);
        const r = 392;
        for (let j = 0; j < 9; j++) this.Pf(t + j * 0.04, 0.25 + j * 0.06, fx);
        [0, 0.12, 0.24].forEach((d) => this._brass(t + d, r, 0.1, 0.12));
        const t1 = t + 0.36, t2 = t + 1.14;
        [523, 659, 784].forEach((f) => this._brass(t1, f, 0.48, 0.09));
        this.B(t1, 1.1, fx); this.crash(t1, 0.8, fx);
        this._brass(t + 0.86, 587, 0.12, 0.11); this._brass(t + 1.0, 659, 0.12, 0.11);
        [523, 659, 784, 1047].forEach((f) => this._brass(t2, f, 1.2, 0.08));
        this.B(t2, 1.2, fx); this.crash(t2, 1.2, fx);
        this.say(t2, [262, 330, 392], 'oh', 'ah', 1.4, 0.2, 0.4, 1);
        [0, 4, 7, 12, 16, 19, 24].forEach((s, j) => this.tone('triangle', 1047 * st(s), 0, t2 + 0.3 + j * 0.06, 0.2, 0.06, this.echo));
        this._resetSong();
        break;
      }
      case 'lose': {            // sad trombone: wah wah wah waaaah
        this.duck(0.2, 3.2); this.setMuffle(true); this.mlp.frequency.setTargetAtTime(18000, t + 3.2, 0.4);
        [233, 220, 208].forEach((f, j) => this._brass(t + j * 0.42, f, 0.38, 0.13, true));
        this._brass(t + 1.26, 196, 1.4, 0.13, true, true);
        this.tone('sine', 98, 0, t + 1.26, 1.3, 0.12, fx, 0.05);
        this._resetSong();
        break;
      }
      case 'tap': this.tone('sine', 700, 350, t, 0.04, 0.15, fx, 0.002); this.hum(t, 0.01, 0.12, 'highpass', 4000, 0.7, fx); break;
      case 'buy':               // ka-ching
        this.hum(t, 0.05, 0.35, 'bandpass', 2500, 1, fx);
        this.tone('square', 1047, 0, t + 0.04, 0.06, 0.09, fx); this.tone('square', 1568, 0, t + 0.1, 0.25, 0.09, fx);
        this.hum(t + 0.1, 0.3, 0.1, 'highpass', 7000, 0.7, fx);
        break;
      case 'combo': {           // a crew member shouts "yeah!", higher for bigger combos
        const p = 200 * st(Math.min(12, Math.floor(k / 10) * 2) + K);
        this.say(t, [p, p * 1.5], 'ee', 'ah', 0.28, 0.24, 0.12, 0.85);
        this.B(t, 0.6, fx);
        break;
      }
      case 'comboEnd':          // combo dropped: a deflating slide whistle
        this.tone('sine', 900, 180, t, 0.35, k >= 10 ? 0.12 : 0.06, fx, 0.01);
        break;
      case 'boss': {            // passed a named rival: brass stab and a crash
        [0, 4, 7].forEach((s) => this._brass(t, 392 * st(K + s), 0.25, 0.08));
        this.B(t, 1, fx); this.crash(t, 0.8, fx);
        break;
      }
      case 'surf': this.hum(t, 0.4, 0.3, 'lowpass', 400, 2, fx, 2500, 0.1); this.tone('sine', 400, 800, t, 0.3, 0.08, fx); break;
      case 'heart': this.heart(t, 1); break;
    }
  }
  clang(t, v, f) {             // inharmonic metal partials: a shield taking the hit
    [1, 2.76, 5.4, 8.93].forEach((m, j) => this.tone(j % 2 ? 'square' : 'sine', f * m, 0, t, 0.6 / (1 + j * 0.6), 0.14 * v / (1 + j * 0.5), this.fx, 0.001));
    this.hum(t, 0.02, 0.4 * v, 'highpass', 3000, 0.7, this.fx);
    this.tone('sine', f * 2.76, 0, t + 0.01, 0.4, 0.04 * v, this.echo);
  }
  heart(t, v) {                // "lub-dub"
    this.tone('sine', 70, 40, t, 0.14, 0.6 * v, this.fx, 0.005);
    this.tone('sine', 85, 45, t + 0.14, 0.12, 0.45 * v, this.fx, 0.005);
  }
  _resetSong() { this._bpm = ZONE_BPM[0]; this.key = 0; this.heat = 0; if (this.delay) this.delay.delayTime.setTargetAtTime(3 * 60 / this._bpm / 4, this.ctx.currentTime, 0.05); }
}
