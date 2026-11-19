// Million To One: all sound is synthesised (no audio files). A beatbox-style loop
// whose tempo climbs zone by zone, plus short sound effects.
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.bpm = 96; this.next = 0; this.stepI = 0; this.intensity = 0; this.on = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
    const len = this.ctx.sampleRate * 0.5; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  osc(type, f0, f1, t, dur, vol, dest) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, 0.004, vol, dur); o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(t, dur, vol, freq, type = 'highpass', dest, q = 1) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, 0.002, vol, dur); s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  // ---- the beat: boots and cats, with a bass hum that gets busier as you go
  tick() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, spb = 60 / this.bpm / 4;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.12) {
      const t = this.next, i = this.stepI % 16, I = this.intensity, M = this.music;
      if (i === 0 || i === 10 || (I > 1 && i === 7)) this.osc('sine', 150, 42, t, 0.22, 0.9, M);                    // B (kick)
      if (i === 4 || i === 12) { this.hiss(t, 0.13, 0.5, 1800, 'bandpass', M, 0.8); this.osc('triangle', 260, 140, t, 0.06, 0.25, M); } // K (snare)
      if (i % 2 === 0 || I > 0) this.hiss(t, 0.03, i % 4 === 2 ? 0.22 : 0.1, 7000, 'highpass', M);                 // t (hat)
      if (I > 0 && (i === 3 || i === 11)) this.hiss(t, 0.05, 0.12, 4000, 'bandpass', M, 3);                         // "ts"
      const bass = [55, 55, 0, 55, 0, 0, 65, 0, 49, 49, 0, 49, 0, 73, 65, 0][i];
      if (bass) this.osc('sawtooth', bass * (I > 1 ? 2 : 1), bass * 0.98, t, spb * 1.6, 0.13, M);
      if (I > 1 && i % 4 === 2) this.osc('square', 440 * [1, 1.25, 1.5, 1.2][(this.stepI >> 2) % 4], 0, t, 0.06, 0.05, M);
      this.next += spb; this.stepI++;
    }
  }
  sfx(name, k = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'pass': this.osc('triangle', 500 + Math.min(k, 40) * 30, 0, t, 0.07, 0.18); break;
      case 'sugar': this.osc('sine', 900, 1400, t, 0.08, 0.2); break;
      case 'dna': this.osc('sine', 700, 0, t, 0.1, 0.25); this.osc('sine', 1050, 0, t + 0.07, 0.12, 0.25); this.osc('sine', 1400, 0, t + 0.14, 0.16, 0.25); break;
      case 'dash': this.hiss(t, 0.3, 0.4, 900, 'bandpass', null, 0.7); this.osc('sine', 200, 600, t, 0.2, 0.2); break;
      case 'bonk': this.osc('sine', 180, 60, t, 0.18, 0.6); this.hiss(t, 0.1, 0.3, 500, 'lowpass'); break;
      case 'hit': this.osc('square', 220, 50, t, 0.3, 0.35); this.hiss(t, 0.25, 0.4, 800, 'lowpass'); break;
      case 'pop': this.osc('sine', 300, 1200, t, 0.08, 0.35); this.hiss(t, 0.06, 0.3, 3000); break;
      case 'frenzy': [0, 4, 7, 12, 16].forEach((n, i) => this.osc('square', 330 * Math.pow(2, n / 12), 0, t + i * 0.05, 0.12, 0.12)); break;
      case 'zone': [0, 7, 12].forEach((n, i) => this.osc('triangle', 262 * Math.pow(2, n / 12), 0, t + i * 0.1, 0.3, 0.25)); break;
      case 'pick': this.osc('triangle', 660, 990, t, 0.15, 0.3); break;
      case 'drill': this.osc('sawtooth', 120 + k * 4, 0, t, 0.05, 0.12); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => this.osc('triangle', 392 * Math.pow(2, n / 12), 0, t + i * 0.11, 0.3, 0.3)); break;
      case 'lose': [7, 3, 0, -5].forEach((n, i) => this.osc('triangle', 330 * Math.pow(2, n / 12), 0, t + i * 0.18, 0.35, 0.3)); break;
      case 'tap': this.osc('sine', 600, 300, t, 0.05, 0.15); break;
      case 'buy': this.osc('square', 520, 0, t, 0.06, 0.15); this.osc('square', 780, 0, t + 0.06, 0.1, 0.15); break;
    }
  }
}
