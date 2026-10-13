// Synthesised sound and generative music (Web Audio). Nothing is downloaded.
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.6; this.musicVol = 0.35; this.on = true; this.musicOn = true; this.mode = 'day'; this.nextNote = 0; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 1; this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.vol; this.sfx.connect(this.master);
    this.mus = this.ctx.createGain(); this.mus.gain.value = this.musicVol; this.mus.connect(this.master);
    // simple feedback delay as a poor man's reverb for the music
    const d = this.ctx.createDelay(1); d.delayTime.value = 0.34; const fb = this.ctx.createGain(); fb.gain.value = 0.38;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.mus.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.master);
    const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    setInterval(() => this.musicTick(), 500);
  }
  setVol(v, m) { this.vol = v; this.musicVol = m; if (this.sfx) { this.sfx.gain.value = v; this.mus.gain.value = m; } }
  tone(f, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, dest) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol = 0.3, freq = 1200, q = 0.7, type = 'bandpass', delay = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.05);
  }
  play(name, a = 0) {
    if (!this.ctx) return;
    const r = () => 0.85 + Math.random() * 0.3;
    switch (name) {
      case 'hit': { const hard = a === 3 || a === 10; this.noise(0.09, 0.28, hard ? 900 : 500 * r(), 1.2); this.tone(hard ? 190 : 120 * r(), 0.07, 'square', 0.08, 0.6); break; }
      case 'break': this.noise(0.22, 0.4, 700 * r(), 0.8); this.tone(140 * r(), 0.16, 'triangle', 0.18, 0.5); break;
      case 'place': this.noise(0.06, 0.25, 300, 1); this.tone(180 * r(), 0.09, 'triangle', 0.22, 0.7); break;
      case 'pickup': this.tone(660 * r(), 0.09, 'sine', 0.2, 1.6); this.tone(990 * r(), 0.1, 'sine', 0.14, 1.3, 0.05); break;
      case 'jump': this.tone(300, 0.14, 'square', 0.07, 1.8); break;
      case 'land': this.noise(0.08, 0.2, 260, 1); break;
      case 'hurt': this.tone(220, 0.2, 'sawtooth', 0.22, 0.5); this.noise(0.1, 0.2, 400, 1); break;
      case 'mobhit': this.tone(160 * r(), 0.12, 'square', 0.14, 0.6); this.noise(0.08, 0.2, 800, 1); break;
      case 'mobdie': this.tone(300, 0.3, 'sawtooth', 0.14, 0.3); this.noise(0.2, 0.25, 600, 0.8); break;
      case 'splash': this.noise(0.3, 0.3, 1400, 0.5, 'highpass'); break;
      case 'craft': this.tone(523, 0.1, 'triangle', 0.18); this.tone(659, 0.1, 'triangle', 0.18, 0, 0.08); this.tone(784, 0.16, 'triangle', 0.18, 0, 0.16); break;
      case 'door': this.noise(0.12, 0.25, 220, 2); this.tone(110, 0.12, 'square', 0.1, 0.7); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.05, 0.25, 900, 2, 'bandpass', i * 0.11); break;
      case 'tp': this.tone(300, 0.6, 'sine', 0.22, 4); this.tone(450, 0.6, 'sine', 0.15, 4, 0.05); break;
      case 'chat': this.tone(880, 0.08, 'sine', 0.12); this.tone(1175, 0.1, 'sine', 0.1, 0, 0.07); break;
      case 'click': this.tone(500, 0.04, 'square', 0.06); break;
      case 'die': this.tone(300, 0.9, 'sawtooth', 0.2, 0.2); break;
      case 'swing': this.noise(0.1, 0.12, 2200, 0.5, 'highpass'); break;
      case 'shoot': this.tone(220, 0.15, 'triangle', 0.2, 2); this.noise(0.1, 0.1, 3000, 0.5, 'highpass'); break;
      case 'hiss': this.noise(0.5, 0.25, 4000, 0.4, 'highpass'); break;
      case 'toolbreak': this.tone(400, 0.25, 'square', 0.15, 0.3); this.noise(0.2, 0.3, 1200, 1); break;
      case 'thunk': this.noise(0.05, 0.25, 400, 2); break;
      case 'slam': this.tone(70, 0.6, 'sine', 0.5, 0.4); this.noise(0.5, 0.5, 200, 0.7); break;
      case 'step': this.noise(0.04, 0.07 * (a || 1), 350 * r(), 1.5); break;
      default:
    }
  }
  setMode(m) { this.mode = m; }
  // little background details: crickets at night, birds by day, drips in caves (called a few times a second)
  ambience(mode, surface) {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const r = Math.random();
    if (mode === 'night' && surface && r < 0.35) for (let i = 0; i < 3; i++) this.tone(4300 + Math.random() * 300, 0.05, 'sine', 0.025, 1, i * 0.07);
    else if (mode === 'day' && surface && r < 0.12) { const f = 2300 + Math.random() * 1200; this.tone(f, 0.12, 'sine', 0.035, 1.5); this.tone(f * 1.2, 0.1, 'sine', 0.03, 0.8, 0.14); }
    else if (mode === 'cave' && r < 0.06) this.tone(900 + Math.random() * 500, 0.18, 'sine', 0.05, 0.4);
  }
  setRain(k) {
    if (!this.ctx) return;
    if (!this.rainSrc) {
      const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      s.buffer = this.noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.5; g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.sfx); s.start(); this.rainSrc = s; this.rainGain = g;
    }
    this.rainGain.gain.value = k * 0.22;
  }
  musicTick() {
    if (!this.ctx || !this.musicOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now < this.nextNote) return;
    const scales = {
      day: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3],
      night: [220, 246.9, 261.6, 329.6, 349.2, 440, 523.3],
      cave: [110, 130.8, 146.8, 164.8, 196, 220],
      water: [196, 220, 261.6, 293.7, 392],
    };
    const sc = scales[this.mode] || scales.day;
    const n = this.mode === 'cave' ? 1 : 1 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const f = sc[Math.random() * sc.length | 0] * (this.mode === 'cave' && Math.random() < 0.5 ? 0.5 : 1);
      this.tone(f, 2.4, this.mode === 'cave' ? 'sine' : 'triangle', 0.10, 0.99, i * 0.35, this.mus);
      if (this.mode === 'day' && Math.random() < 0.3) this.tone(f * 1.5, 2, 'sine', 0.05, 1, i * 0.35 + 0.1, this.mus);
    }
    this.nextNote = now + (this.mode === 'cave' ? 5 : 2.2) + Math.random() * 3.5;
  }
}
