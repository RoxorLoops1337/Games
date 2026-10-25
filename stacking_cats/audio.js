// Tiny procedural sound: blips for fights and a soft pentatonic loop. No files.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.musicOn = true; this.last = {}; this.mode = 'calm'; this.step = 0; this.timer = 0; }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.32; this.master.connect(this.ctx.destination);
        this.mus = this.ctx.createGain(); this.mus.gain.value = 0.5; this.mus.connect(this.master);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio is optional */ }
  }
  tone(f, t = 0.1, o = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, now = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, now);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), now + t);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(o.v || 0.2, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    osc.connect(g); g.connect(o.bus || this.master);
    osc.start(now); osc.stop(now + t + 0.05);
  }
  noise(t = 0.15, v = 0.2, lp = 2000) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, n = Math.floor(c.sampleRate * t), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = v;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }
  play(name, pitch = 1) {
    const now = performance.now();
    const gap = { hit: 45, swipe: 60, shoot: 70, pop: 40, flame: 120, zap: 80, boom: 80 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    switch (name) {
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
  // soft pentatonic loop, faster and darker when fighting a nest
  music(mode) {
    this.mode = mode;
    if (this.timer || !this.ctx) return;
    const calm = [0, 2, 4, 7, 9, 12, 9, 7], battle = [0, 3, 7, 10, 12, 10, 7, 3];
    this.timer = setInterval(() => {
      if (!this.on || !this.musicOn || !this.ctx || document.hidden) return;
      const m = this.mode, seq = m === 'calm' ? calm : battle;
      const root = m === 'boss' ? 110 : m === 'fight' ? 130.8 : 146.8;
      const n = seq[this.step % 8];
      this.step++;
      this.tone(root * Math.pow(2, n / 12), 0.28, { type: 'triangle', v: 0.07, bus: this.mus });
      if (this.step % 8 === 0) this.tone(root / 2, 0.9, { type: 'sine', v: 0.1, bus: this.mus });
      if (m !== 'calm' && this.step % 2 === 0) this.tone(root * 0.5 * Math.pow(2, seq[(this.step + 3) % 8] / 12), 0.12, { type: 'square', v: 0.025, bus: this.mus });
    }, 240);
  }
}
