// Tiny synth: every sound is generated, no audio files.
export function createAudio() {
  let ac = null, master = null, muted = false, noiseBuf = null, musicOn = false, step = 0, nextT = 0, timer = null, intensity = 0;
  const last = {};
  function ensure() {
    if (ac) return ac;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5;
    const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  function tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2, f0 = 2000, f1 = 300) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }
  const gate = (k, ms) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; };
  const sfx = {
    shoot: () => gate('shoot', 70) && tone(520 + Math.random() * 60, 0.07, 'square', 0.05, -200),
    hit: () => gate('hit', 35) && tone(240 + Math.random() * 80, 0.05, 'triangle', 0.08, -90),
    kill: e => { if (!gate('kill', 40)) return; tone(300, 0.14, 'sawtooth', 0.1, -180); noise(0.12, 0.12, 1800, 200); if (e && e.head) tone(120, 0.4, 'sawtooth', 0.16, -70); },
    boom: () => { noise(0.5, 0.35, 1500, 80); tone(90, 0.4, 'sawtooth', 0.2, -60); },
    split: () => tone(660, 0.12, 'square', 0.07, 300),
    gem: () => gate('gem', 45) && tone(880 + (performance.now() % 7) * 40, 0.08, 'sine', 0.08, 400),
    coin: () => gate('coin', 45) && (tone(1200, 0.05, 'square', 0.05), tone(1600, 0.09, 'square', 0.05, 0, 0.05)),
    hurt: () => { noise(0.3, 0.3, 900, 100); tone(140, 0.3, 'sawtooth', 0.2, -80); },
    block: () => tone(900, 0.1, 'triangle', 0.1, -300),
    power: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 0, i * 0.06)),
    levelup: () => [440, 554, 659, 880].forEach((f, i) => tone(f, 0.16, 'square', 0.09, 0, i * 0.07)),
    upgrade: () => tone(700, 0.12, 'triangle', 0.1, 300),
    spit: () => gate('spit', 60) && tone(200, 0.15, 'sawtooth', 0.06, 160),
    roar: () => { tone(70, 0.7, 'sawtooth', 0.22, -25); noise(0.6, 0.18, 600, 80); },
    clear: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.09)),
    stage: e => { if (e && e.boss) { tone(60, 0.9, 'sawtooth', 0.25, -20); } else tone(330, 0.12, 'square', 0.08, 80); },
    swarm: () => tone(180, 0.25, 'square', 0.07, 120),
    revive: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.2, 'sine', 0.12, 0, i * 0.08)),
    dead: () => { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.14, -30, i * 0.18)); noise(0.8, 0.2, 800, 60); },
    click: () => tone(600, 0.05, 'square', 0.06),
  };
  // Looping bass + arp, scheduled slightly ahead of the clock.
  const BASS = [55, 55, 82.4, 55, 65.4, 65.4, 98, 65.4], ARP = [220, 277, 330, 277, 262, 330, 392, 330];
  function pump() {
    if (!musicOn || !ac) return;
    while (nextT < ac.currentTime + 0.25) {
      const sp = 0.17 - intensity * 0.03, i = step % 8;
      if (!muted) {
        const t = Math.max(0, nextT - ac.currentTime);
        tone(BASS[i], sp * 1.8, 'triangle', 0.13, 0, t);
        if (step % 2 === 0 || intensity > 0.5) tone(ARP[(step >> 1) % 8] * (step % 16 < 8 ? 1 : 1.125), sp, 'square', 0.025, 0, t);
        if (i % 4 === 0) noise(0.05, 0.05, 6000, 2000);
      }
      nextT += sp; step++;
    }
  }
  return {
    unlock() { const a = ensure(); if (a && a.state === 'suspended') a.resume(); },
    play(name, e) { if (ac && sfx[name]) sfx[name](e); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    get muted() { return muted; },
    music(on) {
      musicOn = on;
      if (on && ensure()) { nextT = ac.currentTime + 0.05; clearInterval(timer); timer = setInterval(pump, 80); }
      else clearInterval(timer);
    },
    intensity(v) { intensity = v; },
  };
}
