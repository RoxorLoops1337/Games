// Million To One: every sound is synthesised in code (no audio files).
// The music is a beatbox crew in a box: B kick, Pf and K snares, t and ts hats, the
// inward K, a hummed bass, "ooh" choir pads made by pushing sawtooth waves through vowel
// (formant) filters, "wah" stabs, a whistled lead and vocal chops when things get wild, and a
// fill every 8 bars. Tempo and key climb zone by zone; the arrangement grows with intensity 0..2
// (0.3 is the quiet waiting-room groove for menus) and with the player's live combo (A.combo).
//
// Mix (tuned for phone speakers): the music bus gets a +3 dB lift at 180 Hz, a gentle -2 dB
// top shelf and its own glue compressor; sound effects stay uncompressed; both meet in a
// master gain and a brickwall-ish limiter. Big fx hits micro-duck the music. Music and sfx
// have their own echoes so muting or muffling the music never cuts an sfx tail.
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
const ZONE_KEY = [0, 2, 3, 5, 7, 8, 10];  // semitone lift per zone, every zone climbs
const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]]; // Am F C G (relative to the key root A)
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const AEOL = [0, 2, 3, 5, 7, 8, 10];
const MUSIC_VOL = 0.5;
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
  close: 0.05, thread: 0.08, blast: 0.1, lockon: 1.2, land: 0.1, milestone: 0.3, event: 0.5, lowE: 0.6,
  comboBank: 0.2, comboBreak: 0.15, record: 0.5, legendary: 0.5, synergy: 0.3, eggClaim: 0.5, bossTaunt: 0.5, drillShove: 0.05,
};

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
    this._dec = () => { this.live--; };
  }

  // ------------------------------------------------------------------ public knobs
  get bpm() { return this._bpm; }
  set bpm(v) {
    v = +v || 96; if (v === this._bpm) return;
    this._bpm = v; this.key = ZONE_KEY[zoneOf(v)] + this._lift;
    if (this.ctx && this.on) this._queueFill();
    this._syncDelay();
  }
  get intensity() { return this._int; }
  set intensity(v) {
    const old = this._int; this._int = +v || 0;
    if (!this.ctx) return;
    if (this._menu(old) !== this._menu(this._int)) this._applyTlp();
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
    // master: gain then a limiter, so a pile of hits never clips a phone speaker
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.06;
    this.master.connect(lim); lim.connect(c.destination); this.limiter = lim;
    // sound effects: uncompressed, own volume
    this.fx = c.createGain(); this.fx.gain.value = this._fxLevel(); this.fx.connect(this.master);
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
    this.tlp.connect(peak); peak.connect(shelf); shelf.connect(mc); mc.connect(this.master);
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
    this.padBank = this._bank('oo', 2.4); this.padBank.out.connect(this.music);
    const ps = c.createGain(); ps.gain.value = 0.35; this.padBank.out.connect(ps); ps.connect(this.echo);
    this.stabBank = this._bank('ah', 2.8); this.stabBank.out.connect(this.music);
    // the hummed bass shares one lowpass and one soft-clip shaper (harmonics a phone can play)
    this.bassLp = c.createBiquadFilter(); this.bassLp.type = 'lowpass'; this.bassLp.frequency.value = 500; this.bassLp.Q.value = 5;
    const sh = c.createWaveShaper(), n = 1024, curve = new Float32Array(n), dr = 2.5, nrm = Math.tanh(dr);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(dr * x) / nrm; }
    sh.curve = curve; sh.oversample = '2x';
    const bo = c.createGain(); bo.gain.value = 0.7;
    this.bassLp.connect(sh); sh.connect(bo); bo.connect(this.music); this.shaper = sh;
    this._applyTlp();
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
    if (this.master) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.muted ? 0 : 0.8, t); }
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
  setMuffle(on) { if (!this.ctx) return; const t = this.ctx.currentTime; this.mlp.frequency.cancelScheduledValues(t); this.mlp.frequency.setTargetAtTime(on ? 650 : 18000, t, on ? 0.06 : 0.15); }
  // bullet time: the music goes underwater and the echo hangs on a little longer
  slowmo(on) {
    if (!this.ctx) return; on = !!on; if (on === this._slow) return; this._slow = on;
    const t = this.ctx.currentTime, f = this.slp.frequency;
    f.cancelScheduledValues(t); f.setTargetAtTime(on ? 1400 : 18000, t, on ? 0.013 : 0.08);
    this._setG(this.mfb.gain, on ? 0.45 : 0.33);
  }
  _menu(I) { return I > 0.2 && I < 0.45; }
  _applyTlp() {
    if (!this.ctx) return;
    const T = this._tension, tc = T <= 0.5 ? 18000 : 18000 * Math.pow(1200 / 18000, (T - 0.5) / 0.5);
    const f = Math.min(tc, this._menu(this._int) ? 900 : 18000), t = this.ctx.currentTime;
    this.tlp.frequency.cancelScheduledValues(t); this.tlp.frequency.setTargetAtTime(f, t, 0.15);
  }
  // drop the music for a moment so a big sound effect can shine
  duck(amount = 0.35, sec = 0.6) {
    if (!this.ctx) return; const g = this.music.gain, t = this.ctx.currentTime, L = this._mLevel();
    g.cancelScheduledValues(t); g.setTargetAtTime(L * amount, t, 0.03); g.setTargetAtTime(L, t + sec, 0.25);
  }
  // automatic micro duck: any loud fx hit pulls the music to 0.7 for 120 ms
  _mduck(t) {
    if (!this.mduck || this.sfxMuted || this.sfxVol < 0.05 || t - this._mdLast < 0.03) return;
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
    this._bpm = ZONE_BPM[0]; this.key = 0; this._lift = 0; this._ftier = 0; this._int = 0; this.heat = 0; this.combo = 0; this._dryUntil = 0;
    if (!this.ctx) return;
    this._syncDelay(); this._applyTlp();
    this.setMuffle(false); this.slowmo(false); this.duck(1, 0);
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
    this.tone('sine', 185, 46, t, 0.22, 0.95 * v, dest, 0.002, 0.09);
    this.tone('sine', 160, 95, t, 0.12, 0.55 * v, dest, 0.002, 0.09);
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
  hat(t, v = 1, dest = this.music) { this.hum(t, 0.022, 0.15 * v, 'highpass', 8500, 0.7, dest, 0, 0.001, 0); }
  ts(t, v = 1, dest = this.music) { this.hum(t, 0.13, 0.12 * v, 'highpass', 6000, 0.8, dest, 0, 0.004, 0); }
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
    while (this.next < now + 0.15 && guard++ < 32) { if (!silent) this._step(this.next); this.next += 60 / this._bpm / 4; this.stepI++; }
    // the tension bed: a heartbeat that races as the drama climbs
    if (this._tension > 0.02) {
      if (this._nextHeart < now - 0.25 || this._nextHeart > now + 2) this._nextHeart = now + 0.05;
      guard = 0;
      while (this._nextHeart < now + 0.15 && guard++ < 4) {
        if (!silent) this.heart(this._nextHeart, 0.35 + 0.45 * this._tension, this.music);
        this._nextHeart += 60 / (60 + 120 * this._tension);
      }
    }
  }
  _queueFill() { const i = this.stepI & 15, bar = this.stepI >> 4; this.fillBar = i < 6 ? bar : bar + 1; }
  _deflate() {             // frenzy over: a falling "fwoomp", and the key comes back down
    if (this._lift) { this.key -= this._lift; this._lift = 0; }
    this._ftier = 0;
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this.hum(t, 0.5, 0.22, 'bandpass', 3000, 2, this.music, 300);
    this.tone('sawtooth', 300, 80, t, 0.45, 0.06, this.music);
  }
  _step(t0) {
    const i = this.stepI & 15, bar = this.stepI >> 4, I = this._int;
    const L = I < 0.5 ? 0 : I < 1.5 ? 1 : 2, spb = 60 / this._bpm / 4, M = this.music;
    const cmb = Math.max(this.combo | 0, this.heat);
    const hot = cmb >= 12, blazing = cmb >= 25;
    const t = t0 + ((i & 1) ? spb * (L === 2 ? 0.05 : 0.15) : 0);   // swing the off sixteenths
    const pb = (((bar - this.barBase) % 8) + 8) % 8;
    const chord = PROG[pb & 3], root = 110 * st(this.key + chord[0]);
    this.chord = chord;
    // waiting room (title, shop, result): just hats and a soft bass, behind a closed filter
    if (this._menu(I)) {
      if (i % 2 === 0) this.hat(t, (i % 4 === 2 ? 0.9 : 0.55) * (0.85 + Math.random() * 0.3));
      if (i === 14 && (bar & 1)) this.ts(t, 0.8);
      for (const [s, semi, len] of BASS[0]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, 0, 0.55);
      return;
    }
    // combo broken: one beat of dry kick, everything else holds its breath
    if (t0 < this._dryUntil) { if (i % 4 === 0) this.B(t, 1.1); return; }
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
      // stem ladder 1 (combo 6): hats double up into 32nds
      if (cmb >= 6) { if (L === 0 && (i & 1)) this.hat(t, 0.5); else if (i % 2 === 0) this.hat(t + spb * 0.5, 0.45); }
    }
    // bass hum (stem ladder 2, combo 15: the busier bass line)
    if (!stop) {
      const bl = cmb >= 15 ? Math.min(2, L + 1) : L;
      for (const [s, semi, len] of BASS[bl]) if (s === i) this._bass(t, root * st(semi), spb * len * 0.95, bl);
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
    // the whistled lead in frenzy; stem ladder 3 (combo 25): a chopped vocal lead
    if (!stop && this.motif && this.motif[i] !== null) {
      const s = PENTA[this.motif[i]];
      if (L === 2) { let f = 880 * st(this.key + s); while (f > 1500) f /= 2; this._whistle(t, f, spb * 1.7, s); }
      if (blazing && i % 2 === 0) {
        let f = 220 * st(this.key + s); while (f > 440) f /= 2;
        this.say(t, [f], 'ah', i % 4 ? 'eh' : 'oh', spb * 1.3, 0.1, 0.05, 1, M, 0);
      }
    }
  }
  _newMotif() {
    const m = new Array(16).fill(null); let d = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < 16; s++) if (Math.random() < (s % 2 ? 0.14 : (s % 4 === 0 ? 0.5 : 0.32))) { d = Math.max(0, Math.min(PENTA.length - 1, d + Math.floor(Math.random() * 5) - 2)); m[s] = d; }
    this.motif = m;
  }
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
  _whistle(t, f, dur, s = null) {
    const o = this.tone('sine', f * 0.94, f, t, dur, 0.07, this.music, 0.015, 0.04, 0);
    if (o) this.tone('sine', f * 0.94, f, t, dur * 0.8, 0.025, this.echo, 0.015, 0.04, 0);
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
  _scaleF(n, base) { n = Math.max(0, Math.min(n | 0, 60)); const idx = n < 14 ? n : 9 + (n % 5); return base * st(this.key + pen(idx)); }

  // ------------------------------------------------------------------ rival voices
  // per-rival motif by RIVALS index. vol 1 = passed, 0.5 = taunt. semi transposes. hold > 0 sustains
  // every note to `hold` seconds and slides it down an octave (a rival deflating at your win).
  _rival(t, k, vol = 1, semi = 0, hold = 0, key = this.key) {
    const m = st(key + semi), fx = this.fx;
    const n = (type, f, at, dur, v, a = 0.005, f1 = 0, gl = 0) => {
      f *= m;
      if (hold) { const d = Math.max(dur, hold - at); this.tone(type, f, f * 0.5, t + at, d, v * vol, fx, a, d); }
      else this.tone(type, f, f1 ? f1 * m : 0, t + at, dur, v * vol, fx, a, gl);
    };
    const br = (f, at, dur, v) => { f *= m; if (hold) { const d = Math.max(dur, hold - at); this._brass(t + at, f, d, v * vol, false, false, f * 0.5, d); } else this._brass(t + at, f, dur, v * vol); };
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
  // record, legendary, milestone, event, lowE, lockon (k = pan -1..1), land
  sfx(name, k) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, t = now + 0.005;
    const gap = GAP[name] ?? 0.015;
    if (now - (this.last[name] ?? -9) < gap) return;
    this.last[name] = now;
    const K = this.key, fx = this.fx;
    // state that must change even when the sound is muted
    switch (name) {
      case 'pass': this.heat = Math.max(this.heat, +k || 0); this.heatT = now; break;
      case 'comboBreak': this.heat = 0; this._dryUntil = now + 4 * 60 / this._bpm / 4; break;
      case 'frenzy': { const tier = Math.max(1, numArg(k, 'tier') | 0); this._ftier = tier; if (tier >= 3 && !this._lift) { this._lift = 1; this.key += 1; } break; }
      case 'synergy': if ((k === true || (k && k.fresh)) && this.on) this._queueFill(); break;
    }
    if (this.muted) { if (name === 'win' || name === 'lose') this._resetSong(); return; }
    switch (name) {
      case 'pass': {            // a blip that climbs the pentatonic scale, snapped onto the beat
        const q = this._quant(now), f = this._scaleF(+k || 0, 220);
        this._passF = f;
        if (this._slotG && Math.abs(q - this._slotT) < 0.02) {   // same 32nd: make that blip a bit louder instead
          this._slotG.gain.value = Math.min(0.22 / 0.15, this._slotG.gain.value + 0.12);
          break;
        }
        const sg = this._gain(1, fx); this._slotG = sg; this._slotT = q; this._blipN++;
        this.tone('triangle', f * 0.97, f, q, 0.07, 0.15, sg, 0.003, 0.02);
        if (k >= 10) this.tone('sine', f * 2, 0, q + 0.01, 0.05, 0.05, sg);
        if (k >= 25) this.tone('square', f * 1.5, 0, q, 0.03, 0.025, sg);
        if (this._blipN % 4 === 0) {        // every 4th blip sings a note of the pad chord
          const ch = this.chord || PROG[0]; let cf = 440 * st(K + ch[(this._blipN >> 2) % 3]); while (cf > 880) cf /= 2; while (cf < 440) cf *= 2;
          this.tone('sine', cf, 0, q, 0.16, 0.04, fx, 0.01);
        }
        break;
      }
      case 'link': {            // a combo link: the next note of the climb, a timbre for each kind of trick
        const n = numArg(k, 'n'), kind = (k && k.kind) || 'pass', q = this._quant(now), f = this._scaleF(n, 440);
        this._passF = f;
        if (kind === 'close') { this.tone('sine', f, 0, q, 0.14, 0.11, fx, 0.002); this.tone('sine', f * 2, 0, q, 0.2, 0.04, fx, 0.002); this.tone('sine', f * 3.01, 0, q, 0.1, 0.02, this.fxEcho, 0.002); }
        else if (kind === 'gate') this._pluck(q, f / 2, 0.14);
        else if (kind === 'dodge') this.tone('sine', f * 0.9, f, q, 0.12, 0.09, fx, 0.01, 0.05);
        else if (kind === 'pop' || kind === 'bump') { const p = kind === 'pop' ? f : f / 2; this.tone('square', p, p * 0.5, q, 0.04, 0.05, fx, 0.001); this.hum(q, 0.012, 0.12, 'bandpass', 2200, 2, fx); }
        else this.tone('triangle', f * 0.97, f, q, 0.07, 0.13, fx, 0.003, 0.02);
        break;
      }
      case 'sugar': this.tone('sine', 500, 1300, t, 0.07, 0.2, fx); this.tone('triangle', 1568, 0, t + 0.05, 0.12, 0.1, fx); break;
      case 'dna': {             // coin arpeggio
        const b = 988;
        this.tone('square', b, 0, t, 0.05, 0.09, fx, 0.002);
        this.tone('square', b * st(5), 0, t + 0.055, 0.22, 0.09, fx, 0.002);
        this.tone('sine', b * st(12), 0, t + 0.11, 0.18, 0.06, fx);
        this.tone('sine', b * st(17), 0, t + 0.15, 0.25, 0.04, this.fxEcho);
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
      case 'mutation': case 'pick':
        this.tone('triangle', 660, 990, t, 0.12, 0.28, fx); this.tone('sine', 1320, 0, t + 0.08, 0.2, 0.1, fx); this.tone('sine', 1980, 0, t + 0.12, 0.2, 0.05, this.fxEcho);
        break;
      case 'cards': this.hum(t, 0.3, 0.25, 'bandpass', 300, 1.5, fx, 3000, 0.2); this.tone('sine', 300, 900, t, 0.25, 0.1, fx); break;
      case 'reroll': for (let j = 0; j < 6; j++) this.hum(t + j * 0.04 + Math.random() * 0.02, 0.025, 0.3, 'bandpass', 1800 + Math.random() * 1500, 3, fx); break;
      case 'drill': {           // the egg drill: every tap a notch higher
        const n = Math.min(+k || 0, 72), f = 70 * st(n * 0.5);
        this.tone('sawtooth', f, f * 1.06, t, 0.06, 0.12, fx, 0.003);
        this.tone('square', f * 2, 0, t, 0.03, 0.04, fx, 0.002);
        this.hum(t, 0.05, 0.16, 'bandpass', Math.min(6000, f * 5), 4, fx);
        if (k > 0 && k % 10 === 0) this.tone('sine', 1568 * st(Math.min(12, k / 10)), 0, t + 0.02, 0.15, 0.1, fx);
        break;
      }
      case 'win': {             // fanfare: "da da da DAAA, da da DAAAAA", in the key you finished in
        this.duck(0.15, 3);
        const m = st(K), r = 392 * m;
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
      case 'lose': {            // sad trombone: wah wah wah waaaah
        const m = st(K);
        this.duck(0.2, 3.2); this.setMuffle(true); this.mlp.frequency.setTargetAtTime(18000, t + 3.2, 0.4);
        [233, 220, 208].forEach((f, j) => this._brass(t + j * 0.42, f * m, 0.38, 0.13, true));
        this._brass(t + 1.26, 196 * m, 1.4, 0.13, true, true);
        this.tone('sine', 98 * m, 0, t + 1.26, 1.3, 0.12, fx, 0.05);
        this._resetSong();
        break;
      }
      case 'tap': {             // k 0..1 climbs for the rank count-up; plain buttons use 0
        const x = clamp01(k), f = 400 * Math.pow(4, x);
        this.tone('sine', f * 1.75, f, t, 0.04, 0.15 + 0.15 * x, fx, 0.002);
        this.hum(t, 0.01, 0.12, 'highpass', 4000, 0.7, fx);
        break;
      }
      case 'buy':               // ka-ching
        this.hum(t, 0.05, 0.35, 'bandpass', 2500, 1, fx);
        this.tone('square', 1047, 0, t + 0.04, 0.06, 0.09, fx); this.tone('square', 1568, 0, t + 0.1, 0.25, 0.09, fx);
        this.hum(t + 0.1, 0.3, 0.1, 'highpass', 7000, 0.7, fx);
        break;
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
      case 'comboBank': {       // combo cashed in: three coins and a crowd "ohhh" that grows with the grade
        const g = Math.max(0, Math.min(4, numArg(k, 'grade') | 0)), m = st(K), top = g >= 3 ? 12 : 0;
        [0, 4, 7].forEach((s, j) => this.tone('square', 988 * m * st(s + top) / 2, 0, t + j * 0.06, j === 2 ? 0.2 : 0.06, 0.08, fx, 0.002));
        this.tone('sine', 988 * m * st(12 + top), 0, t + 0.12, 0.25, 0.04, this.fxEcho);
        const d = 0.3 + 0.225 * g, vs = [196, 247, 294, 330, 392].slice(0, 2 + Math.ceil(g / 2)).map((f) => f * m);
        this.say(t + 0.14, vs, 'oh', 'oo', d, 0.1 + 0.03 * g, d * 0.5, 0.97);
        this.hum(t + 0.14, d, 0.06 + 0.02 * g, 'bandpass', 700, 1.2, fx, 0, d * 0.3);
        break;
      }
      case 'boss': {            // passed a named rival: their own motif, a kick and a crash
        if (typeof k === 'number' && k >= 0 && k <= 4) this._rival(t, k, 1);
        else [0, 4, 7].forEach((s) => this._brass(t, 392 * st(K + s), 0.25, 0.08));
        this.B(t, 1, fx); this.crash(t, 0.8, fx);
        break;
      }
      case 'bossTaunt': this._rival(t, +k || 0, 0.5, -5); break;
      case 'eggClaim':          // a rival is drilling YOUR egg: "dun DUN"
        this._brass(t, 196, 0.16, 0.14); this.tone('sine', 98, 0, t, 0.16, 0.2, fx, 0.005);
        this._brass(t + 0.22, 185, 0.5, 0.18); this.tone('sine', 92.5, 0, t + 0.22, 0.5, 0.25, fx, 0.005);
        this.B(t + 0.22, 0.8, fx);
        break;
      case 'drillShove': this.tone('sine', 300, 120, t, 0.08, 0.35, fx, 0.002); break;
      case 'surf': this.hum(t, 0.4, 0.3, 'lowpass', 400, 2, fx, 2500, 0.1); this.tone('sine', 400, 800, t, 0.3, 0.08, fx); break;
      case 'heart': this.heart(t, 1); break;
      case 'lowE': this.heart(t, 0.7); break;
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
      case 'close':             // a near miss: a whoosh and a tick on the combo note
        this.hum(t, 0.18, 0.28, 'bandpass', 600, 1.5, fx, 2400, 0.02);
        this.tone('triangle', this._passF, 0, t + 0.05, 0.03, 0.15, fx, 0.001);
        break;
      case 'thread':            // threaded a gate: a rim and a little whistle
        this.rim(t, 1.3, fx);
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
      case 'lockon': {          // something has you in its sights: a wet rising hum and a marimba knock
        const pan = Math.max(-1, Math.min(1, numArg(k, 'pan'))), m = st(K);
        let dest = fx;
        if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; p.connect(fx); dest = p; }
        this.tone('triangle', 220 * m, 330 * m, t, 0.35, 0.09, dest, 0.03);
        this.tone('triangle', 220 * m, 330 * m, t, 0.3, 0.05, this.fxEcho, 0.03);
        [110, 130.81].forEach((f, j) => { this.tone('sine', f * m, 0, t + j * 0.09, 0.16, 0.22, dest, 0.001); this.tone('sine', f * m * 4, 0, t + j * 0.09, 0.04, 0.05, dest, 0.001); });
        break;
      }
      case 'land':              // a heavy landing: low kick and a short cymbal
        this.B(t, 0.8, fx); this.tone('sine', 90, 40, t, 0.12, 0.3, fx, 0.002);
        this.hum(t, 0.12, 0.14, 'highpass', 6000, 0.7, fx);
        break;
    }
  }
  clang(t, v, f) {             // inharmonic metal partials: a shield taking the hit
    [1, 2.76, 5.4, 8.93].forEach((m, j) => this.tone(j % 2 ? 'square' : 'sine', f * m, 0, t, 0.6 / (1 + j * 0.6), 0.14 * v / (1 + j * 0.5), this.fx, 0.001));
    this.hum(t, 0.02, 0.4 * v, 'highpass', 3000, 0.7, this.fx);
    this.tone('sine', f * 2.76, 0, t + 0.01, 0.4, 0.04 * v, this.fxEcho);
  }
  heart(t, v, dest = this.fx) {    // "lub-dub"
    this.tone('sine', 70, 40, t, 0.14, 0.6 * v, dest, 0.005);
    this.tone('sine', 85, 45, t + 0.14, 0.12, 0.45 * v, dest, 0.005);
  }
  _resetSong() {
    this._bpm = ZONE_BPM[0]; this.key = 0; this._lift = 0; this._ftier = 0; this.heat = 0;
    this._syncDelay();
  }
}
