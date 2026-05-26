// Procedural sound effects via Web Audio. No assets, no loading.
// All sounds are synthesized on demand from oscillators, noise, and envelopes.
const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let muted = false;
  let engineNode = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
  }
  function isMuted() { return muted; }
  function toggleMuted() { setMuted(!muted); return muted; }

  // Returns a noise buffer for white-noise based sounds (crashes, explosions).
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      const n = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  function envGain(attack, decay, peak = 1) {
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function tone(freq, type, attack, decay, peak = 0.3, freqEnd) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (freqEnd !== undefined) {
      o.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + attack + decay);
    }
    const g = envGain(attack, decay, peak);
    o.connect(g).connect(masterGain);
    o.start();
    o.stop(ctx.currentTime + attack + decay + 0.05);
  }

  function noiseBurst(attack, decay, lowpass = 4000, peak = 0.3) {
    if (!ctx || muted) return;
    const n = noise();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lowpass;
    const g = envGain(attack, decay, peak);
    n.connect(f).connect(g).connect(masterGain);
    n.start();
    n.stop(ctx.currentTime + attack + decay + 0.1);
  }

  // --- Specific effects -------------------------------------------------
  function splat() {
    if (!ctx || muted) return;
    noiseBurst(0.005, 0.18, 1800, 0.45);
    tone(120, "square", 0.005, 0.12, 0.18, 60);
  }

  function scream() {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = U.rand(700, 1100);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.4);
    const g = envGain(0.01, 0.4, 0.15);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1200;
    f.Q.value = 4;
    o.connect(f).connect(g).connect(masterGain);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  }

  function crash() {
    if (!ctx || muted) return;
    noiseBurst(0.005, 0.35, 2500, 0.5);
    tone(80, "square", 0.005, 0.25, 0.3, 40);
  }

  function explosion() {
    if (!ctx || muted) return;
    noiseBurst(0.01, 0.7, 800, 0.7);
    tone(60, "sawtooth", 0.01, 0.5, 0.4, 25);
    setTimeout(() => noiseBurst(0.02, 0.4, 1500, 0.3), 80);
  }

  function pickup() {
    if (!ctx || muted) return;
    tone(660, "square", 0.005, 0.08, 0.25);
    setTimeout(() => tone(990, "square", 0.005, 0.1, 0.25), 60);
  }

  function powerupGet() {
    if (!ctx || muted) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => tone(f, "square", 0.005, 0.12, 0.25), i * 60));
  }

  function nitroBoost() {
    if (!ctx || muted) return;
    noiseBurst(0.02, 0.4, 3000, 0.25);
    tone(200, "sawtooth", 0.05, 0.3, 0.2, 800);
  }

  function honk() {
    if (!ctx || muted) return;
    tone(440, "square", 0.01, 0.18, 0.3);
  }

  function comboLevelUp(level) {
    if (!ctx || muted) return;
    const base = 440 + level * 60;
    [base, base * 1.5, base * 2].forEach((f, i) =>
      setTimeout(() => tone(f, "triangle", 0.005, 0.1, 0.25), i * 40));
  }

  function siren() {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 600;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 300;
    const g = envGain(0.01, 0.5, 0.15);
    lfo.connect(lfoGain).connect(o.frequency);
    o.connect(g).connect(masterGain);
    o.start(); lfo.start();
    o.stop(ctx.currentTime + 0.6);
    lfo.stop(ctx.currentTime + 0.6);
  }

  // --- Continuous engine sound -----------------------------------------
  // Mixes a sawtooth (low-end) with filtered noise (turbulence). The
  // frequency follows the car's actual speed so it lives and breathes.
  function startEngine() {
    if (!ctx || engineNode) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 60;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.05;

    const n = ctx.createBufferSource();
    if (!noiseBuf) noise();
    n.buffer = noiseBuf;
    n.loop = true;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = "bandpass";
    nFilter.frequency.value = 400;
    nFilter.Q.value = 1;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.03;

    osc.connect(oscGain).connect(masterGain);
    n.connect(nFilter).connect(nGain).connect(masterGain);
    osc.start(); n.start();
    engineNode = { osc, oscGain, nFilter, nGain, n };
  }

  function updateEngine(speed01, idle = 0.1) {
    if (!engineNode || muted) return;
    const s = U.clamp(speed01, 0, 1);
    engineNode.osc.frequency.setTargetAtTime(60 + s * 220, ctx.currentTime, 0.05);
    engineNode.oscGain.gain.setTargetAtTime(idle + s * 0.12, ctx.currentTime, 0.05);
    engineNode.nFilter.frequency.setTargetAtTime(300 + s * 1400, ctx.currentTime, 0.05);
    engineNode.nGain.gain.setTargetAtTime(0.005 + s * 0.05, ctx.currentTime, 0.05);
  }

  function stopEngine() {
    if (!engineNode) return;
    try { engineNode.osc.stop(); } catch (e) {}
    try { engineNode.n.stop(); } catch (e) {}
    engineNode = null;
  }

  return {
    init, resume, setMuted, isMuted, toggleMuted,
    splat, scream, crash, explosion, pickup, powerupGet,
    nitroBoost, honk, comboLevelUp, siren,
    startEngine, updateEngine, stopEngine,
  };
})();
