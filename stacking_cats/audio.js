// Procedural sound: effects, cat voices and a small step-sequenced soundtrack. No audio files.
const NOTE = (semi, root) => root * Math.pow(2, semi / 12);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// each track: bpm, root note (Hz), a chord per bar (semitones above the root), scale for the lead, character
const TRACKS = {
  calm:  { bpm: 82,  root: 130.81, bars: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], scale: [0, 2, 4, 7, 9, 12, 14], drums: 0, lead: 'sine', arp: false },
  fight: { bpm: 116, root: 130.81, bars: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], scale: [0, 2, 4, 7, 9, 12], drums: 1, lead: 'triangle', arp: true },
  boss:  { bpm: 134, root: 110.0,  bars: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], scale: [0, 3, 5, 7, 10, 12], drums: 2, lead: 'square', arp: true },
};

export class Sfx {
  constructor() {
    this.ctx = null; this.on = true; this.musicOn = true; this.last = {}; this.mode = 'calm';
    this.sfxVol = 1; this.musicVol = 0.7; this.step = 0; this.nextT = 0; this.timer = 0; this.intensity = 0;
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
        const n = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, n, n);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio is optional */ }
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
    g.gain.exponentialRampToValueAtTime(o.v || 0.2, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.bus || this.sfxBus);
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

  // a little cat voice: a gliding saw through a formant filter. Each cat has its own pitch.
  meow(id, kind = 'pick') {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.meow || 0) < 0.12) return;
    this.last.meow = now;
    const c = this.ctx, h = hashStr(id);
    const base = 330 + (h % 240) * (kind === 'sad' ? 0.8 : 1.15);
    const dur = kind === 'sad' ? 0.55 : kind === 'happy' ? 0.2 : 0.32;
    const osc = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    osc.type = 'sawtooth';
    const f = osc.frequency;
    f.setValueAtTime(base * 0.8, now);
    if (kind === 'sad') { f.linearRampToValueAtTime(base * 1.1, now + dur * 0.25); f.exponentialRampToValueAtTime(base * 0.55, now + dur); }
    else { f.linearRampToValueAtTime(base * 1.35, now + dur * 0.35); f.exponentialRampToValueAtTime(base * 0.85, now + dur); }
    bp.type = 'bandpass'; bp.Q.value = 3.5;
    bp.frequency.setValueAtTime(900, now); bp.frequency.linearRampToValueAtTime(1800, now + dur * 0.4); bp.frequency.linearRampToValueAtTime(1100, now + dur);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.16, now + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    lfo.frequency.value = 22; lg.gain.value = base * 0.02; lfo.connect(lg); lg.connect(f);
    osc.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    osc.start(now); lfo.start(now); osc.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
  }

  play(name, pitch = 1) {
    const now = performance.now();
    const gap = { hit: 45, swipe: 60, shoot: 70, pop: 40, flame: 120, zap: 80, boom: 80, coin: 40, hover: 60 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'coin': this.tone(1320 + Math.random() * 200, 0.09, { type: 'triangle', v: 0.07 }); this.tone(1760, 0.14, { type: 'sine', v: 0.05, delay: 0.05 }); break;
      case 'chest': [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', v: 0.12, delay: i * 0.05 })); this.noise(0.12, 0.08, 5000); break;
      case 'equip': this.tone(300, 0.07, { type: 'square', v: 0.08 }); this.tone(900, 0.12, { type: 'triangle', v: 0.1, delay: 0.06 }); break;
      case 'upgrade': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', v: 0.13, delay: i * 0.06 })); this.tone(130, 0.3, { to: 70, type: 'sine', v: 0.2 }); break;
      case 'reroll': this.tone(500, 0.05, { type: 'square', v: 0.06 }); this.tone(700, 0.05, { type: 'square', v: 0.06, delay: 0.06 }); this.tone(950, 0.08, { type: 'square', v: 0.06, delay: 0.12 }); break;
      case 'hover': this.tone(880, 0.03, { type: 'sine', v: 0.03 }); break;
      case 'achieve': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', v: 0.13, delay: i * 0.07 })); this.tone(2093, 0.4, { type: 'sine', v: 0.06, delay: 0.38 }); break;
      case 'synergy': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.14, { type: 'sawtooth', v: 0.05, delay: i * 0.05 })); this.tone(1320, 0.3, { type: 'sine', v: 0.07, delay: 0.2 }); break;
      case 'route': this.tone(392, 0.12, { type: 'triangle', v: 0.1 }); this.tone(588, 0.2, { type: 'triangle', v: 0.1, delay: 0.1 }); break;
      case 'swipe': this.noise(0.08, 0.12, 4000); this.tone(520, 0.07, { to: 260, type: 'triangle', v: 0.08 }); break;
      case 'hit': this.tone(190, 0.06, { to: 90, type: 'square', v: 0.07 }); break;
      case 'shoot': this.tone(700, 0.09, { to: 380, type: 'triangle', v: 0.09 }); break;
      case 'bang': this.noise(0.16, 0.3, 1800); this.tone(120, 0.14, { to: 50, type: 'sawtooth', v: 0.14 }); break;
      case 'flame': this.noise(0.12, 0.1, 900); break;
      case 'zap': this.tone(900, 0.14, { to: 200, type: 'sawtooth', v: 0.08 }); this.noise(0.1, 0.08, 6000); break;
      case 'boom': this.noise(0.35, 0.34, 700); this.tone(90, 0.3, { to: 40, type: 'sine', v: 0.3 }); break;
      case 'pop': this.tone((420 + Math.random() * 120) * pitch, 0.1, { to: 900 * pitch, type: 'sine', v: 0.1 }); break;
      case 'ko': this.tone(400, 0.4, { to: 90, type: 'triangle', v: 0.18 }); break;
      case 'heal': this.tone(660, 0.12, { type: 'sine', v: 0.1 }); this.tone(880, 0.16, { type: 'sine', v: 0.1, delay: 0.08 }); break;
      case 'ui': this.tone(520, 0.06, { type: 'triangle', v: 0.1 }); break;
      case 'pick': [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', v: 0.14, delay: i * 0.07 })); break;
      case 'merge': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', v: 0.14, delay: i * 0.06 })); break;
      case 'wave': this.tone(330, 0.2, { type: 'triangle', v: 0.14 }); this.tone(440, 0.25, { type: 'triangle', v: 0.14, delay: 0.14 }); break;
      case 'boss': this.tone(110, 0.7, { to: 70, type: 'sawtooth', v: 0.22 }); this.tone(165, 0.7, { to: 90, type: 'square', v: 0.1 }); this.noise(0.5, 0.2, 500); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', v: 0.14, delay: i * 0.09 })); break;
      case 'win': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', v: 0.14, delay: i * 0.1 })); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', v: 0.16, delay: i * 0.22 })); break;
      case 'zoom': this.tone(300, 0.5, { to: 1200, type: 'sawtooth', v: 0.12 }); break;
      case 'roar': this.tone(140, 0.5, { to: 60, type: 'sawtooth', v: 0.2 }); this.noise(0.4, 0.16, 600); break;
      default: break;
    }
  }

  // ---- soundtrack: a 16th-note sequencer scheduled slightly ahead of the audio clock
  music(mode) {
    if (mode !== this.mode) { this.mode = mode; this.step = 0; if (this.ctx) this.nextT = this.ctx.currentTime + 0.1; }
    if (this.timer || !this.ctx) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.pump(), 50);
  }
  pump() {
    const c = this.ctx;
    if (!c || !this.on || !this.musicOn || document.hidden) { if (c) this.nextT = c.currentTime + 0.1; return; }
    const tr = TRACKS[this.mode] || TRACKS.calm, spb = 60 / tr.bpm / 4;
    if (this.nextT < c.currentTime - 0.1) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.2) { this.stepAt(tr, this.step, this.nextT, spb); this.nextT += spb; this.step++; }
  }
  stepAt(tr, i, t, spb) {
    const bar = Math.floor(i / 16), s = i % 16, chord = tr.bars[bar % 4], bus = this.mus;
    const R = tr.root, loud = tr.drums;
    const r = rng(bar * 131 + loud * 17 + 3);
    // pad and bass
    if (s === 0) {
      for (const semi of chord) this.toneAt(NOTE(semi, R * 2), t, spb * 15, { type: 'triangle', v: loud ? 0.022 : 0.03, attack: 0.15, bus });
      this.toneAt(NOTE(chord[0], R / 2), t, spb * (loud ? 3.6 : 7), { type: 'sine', v: 0.13, bus });
    }
    if (loud && s % 4 === 0 && s) this.toneAt(NOTE(chord[0] + (s === 12 && loud === 2 ? 7 : 0), R / 2), t, spb * 3, { type: loud === 2 ? 'sawtooth' : 'sine', v: loud === 2 ? 0.05 : 0.1, bus });
    if (!loud && s === 8) this.toneAt(NOTE(chord[2], R / 2), t, spb * 6, { type: 'sine', v: 0.07, bus });
    // lead: arpeggio on the chord (fight and boss) or a slow random walk on the scale (calm)
    if (tr.arp) {
      if (s % 2 === 0) this.toneAt(NOTE(chord[(s / 2) % chord.length] + (s % 8 === 6 ? 12 : 0), R * 4), t, spb * 1.6, { type: tr.lead, v: loud === 2 ? 0.035 : 0.045, bus });
    } else if (s % 4 === 0 && r() < 0.7) {
      const semi = tr.scale[Math.floor(rng(bar * 31 + s)() * tr.scale.length)];
      this.toneAt(NOTE(semi, R * 4), t, spb * 4, { type: tr.lead, v: 0.05, attack: 0.03, bus });
    }
    // melody hook on beats 1 and 3 for the faster tracks
    if (loud && (s === 0 || s === 8) && r() < 0.85) {
      const semi = tr.scale[Math.floor(rng(bar * 53 + s)() * tr.scale.length)];
      this.toneAt(NOTE(semi, R * 8), t, spb * 5, { type: 'triangle', v: 0.05, bus });
    }
    // drums
    if (loud) {
      if (s % 4 === 0) this.toneAt(150, t, 0.13, { type: 'sine', to: 42, v: loud === 2 ? 0.3 : 0.24, bus });
      if (s === 4 || s === 12) this.noiseAt(t, 0.11, loud === 2 ? 0.16 : 0.12, { type: 'highpass', freq: 1800, bus });
      if (s % 2 === 0) this.noiseAt(t, 0.04, 0.05 + (this.intensity > 0.5 ? 0.03 : 0), { type: 'highpass', freq: 7000, bus });
      if (loud === 2 && (s === 7 || s === 15)) this.noiseAt(t, 0.05, 0.07, { type: 'highpass', freq: 5000, bus });
    } else if (s % 8 === 4) this.noiseAt(t, 0.05, 0.025, { type: 'highpass', freq: 6000, bus });
  }
  setIntensity(v) { this.intensity = v; }
}
