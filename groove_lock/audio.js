// Groove Lock audio: everything is synthesised live with Web Audio (no sample files).
//   Roxor:  kick, snare, hat, wub bass.   Jasmin: three sung vowels through a formant filter bank.
// The sequencer is a look-ahead scheduler. It asks `A.source(step)` what to play, so the sound always follows the
// ring as it is RIGHT NOW: turn the ring and you hear the groove shift in time.
//
// Pure helpers (SCALE, NOTE, VOWEL, stepDuration) are exported so the tests can check them without an AudioContext.

export const NOTE = { ah: 329.63, oh: 392.0, ee: 440.0 };               // E4, G4, A4: all inside A minor 7
export const VOWEL = { ah: [850, 1220, 2810], oh: [500, 900, 2830], ee: [310, 2790, 3310] }; // soprano formants
export const SCALE = [220, 261.63, 293.66, 329.63, 392.0, 440, 523.25, 587.33, 659.25, 783.99]; // A minor pentatonic + D
export const PAD = [110, 164.81, 196.0, 261.63, 329.63];                // Am7 voicing for the lock-in bed
export const BASS_HZ = 55;                                              // A1
export const stepDuration = (barDur, steps) => barDur / steps;
export const barSeconds = (bpm) => (60 / bpm) * 4;

export function createAudio() {
  let ctx = null, out = null, bus = null, comp = null, vsend = null, noiseBuf = null, timer = null;
  const A = {
    muted: false, N: 16, barDur: 2.4, t0: 0, next: 0, idx: 0, hits: [],
    source: () => null, celebrate: false, metro: true, running: false,
  };

  function makeImpulse(sec) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return b;
  }

  function init(ext) {
    if (ctx) return true;
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!ext && !AC) return false;
    ctx = ext || new AC();
    out = ctx.createGain(); out.gain.value = A.muted ? 0 : 0.9;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    bus = ctx.createGain(); bus.gain.value = 0.8;
    // a soft clipper after the compressor: the mix can approach, but never reach, full scale
    const lim = ctx.createWaveShaper(), curve = new Float32Array(2049);
    // unity gain up to 0.7, then a smooth knee that tops out under full scale (WaveShaper input range is -1..1)
    for (let i = 0; i < curve.length; i++) { const x = i / 1024 - 1, m = Math.abs(x); curve[i] = Math.sign(x) * (m < 0.7 ? m : 0.7 + 0.27 * Math.tanh((m - 0.7) / 0.27)); }
    lim.curve = curve; lim.oversample = '2x';
    bus.connect(comp); comp.connect(lim); lim.connect(out); out.connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.buffer = makeImpulse(1.7);
    vsend = ctx.createGain(); vsend.gain.value = 1;
    const vg = ctx.createGain(); vg.gain.value = 0.42;
    vsend.connect(verb); verb.connect(vg); vg.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  const now = () => (ctx ? ctx.currentTime : 0);
  const gainEnv = (t, peak, atk, dec, to = bus) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
    g.connect(to); return g;
  };
  function noise(t, dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.02); return s; }
  function osc(type, f, t, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.02); return o; }
  const send = (node, amt) => { const g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(vsend); };

  // ---------------------------------------------------------------- Roxor
  function kick(t, v) {
    const o = osc('sine', 168, t, 0.5); o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.0 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
    o.connect(g); g.connect(bus);
    const n = noise(t, 0.012), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    n.connect(hp); hp.connect(gainEnv(t, 0.25 * v, 0.001, 0.012));
  }
  function snare(t, v) {
    const n = noise(t, 0.22), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    n.connect(bp); const g = gainEnv(t, 1.05 * v, 0.002, 0.17); bp.connect(g); send(g, 0.25);
    const o = osc('triangle', 196, t, 0.12); o.frequency.exponentialRampToValueAtTime(128, t + 0.1);
    o.connect(gainEnv(t, 0.5 * v, 0.001, 0.1));
  }
  function hat(t, v) {
    const n = noise(t, 0.07), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    n.connect(hp); hp.connect(gainEnv(t, 0.6 * v, 0.001, 0.05));
  }
  function bass(t, v, step) {
    const dur = Math.max(0.14, Math.min(0.36, step * 1.9));
    const o = osc('sawtooth', BASS_HZ, t, dur), sub = osc('sine', BASS_HZ, t, dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(150, t); lp.frequency.exponentialRampToValueAtTime(1150, t + 0.07); lp.frequency.exponentialRampToValueAtTime(190, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.27 * v, t + 0.01); g.gain.setValueAtTime(0.27 * v, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); sub.connect(g); g.connect(bus);
  }

  // ---------------------------------------------------------------- Jasmin
  function vox(type, t, v, step) {
    const f = NOTE[type], dur = Math.max(0.24, Math.min(0.55, step * 2.6));
    const sum = ctx.createGain(); sum.gain.value = 1.5;
    for (const det of [-7, 7]) {
      const o = osc('sawtooth', f * 0.965, t, dur + 0.2); o.frequency.linearRampToValueAtTime(f, t + 0.07); o.detune.value = det;
      const lfo = osc('sine', 5.6, t, dur + 0.2), lg = ctx.createGain(); lg.gain.value = f * 0.007; lfo.connect(lg); lg.connect(o.frequency);
      o.connect(sum);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.62 * v, t + 0.035);
    env.gain.setValueAtTime(0.54 * v, t + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.14);
    VOWEL[type].forEach((fc, i) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = i ? 11 : 7;
      const g = ctx.createGain(); g.gain.value = [1, 0.55, 0.3][i];
      sum.connect(bp); bp.connect(g); g.connect(env);
    });
    env.connect(bus); send(env, 0.55);
    const br = noise(t, 0.06), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    br.connect(hp); hp.connect(gainEnv(t, 0.07 * v, 0.004, 0.05));
  }

  function voice(type, t, v, step) {
    if (!ctx) return;
    switch (type) {
      case 'kick': kick(t, v); break;
      case 'snare': snare(t, v); break;
      case 'hat': hat(t, v); break;
      case 'bass': bass(t, v, step); break;
      case 'ah': case 'oh': case 'ee': vox(type, t, v, step); break;
    }
  }

  // ---------------------------------------------------------------- UI sounds
  function chime(f, t, v = 0.12, dec = 0.35, type = 'triangle') {
    const o = osc(type, f, t, dec + 0.05), g = gainEnv(t, v, 0.004, dec); o.connect(g); send(g, 0.5);
  }
  A.tick = (rot) => { if (!ctx) return; chime(SCALE[((rot % 10) + 10) % 10] * 2, now(), 0.11, 0.16); };
  A.drop = () => {
    if (!ctx) return; const t = now(), o = osc('sine', 250, t, 0.14); o.frequency.exponentialRampToValueAtTime(95, t + 0.1);
    o.connect(gainEnv(t, 0.4, 0.002, 0.11));
  };
  A.bonk = () => {
    if (!ctx) return; const t = now(), o = osc('square', 130, t, 0.22); o.frequency.exponentialRampToValueAtTime(66, t + 0.18);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; o.connect(lp); lp.connect(gainEnv(t, 0.3, 0.002, 0.19));
  };
  A.sting = (type) => { if (ctx) voice(type, now() + 0.005, 0.95, A.barDur / A.N); };
  A.click = () => { if (ctx) chime(1200, now(), 0.06, 0.05, 'sine'); };
  A.undo = () => { if (!ctx) return; const t = now(); chime(520, t, 0.1, 0.1); chime(390, t + 0.06, 0.1, 0.14); };
  A.win = () => {
    if (!ctx) return; const t = now();
    [220, 261.63, 329.63, 440, 523.25, 659.25, 880, 1046.5].forEach((f, i) => { chime(f, t + i * 0.06, 0.16, 0.7); chime(f * 2, t + i * 0.06 + 0.01, 0.05, 0.5, 'sine'); });
    const n = noise(t, 0.5), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(6000, t + 0.5);
    n.connect(bp); const g = gainEnv(t, 0.2, 0.45, 0.08); bp.connect(g); send(g, 0.4);
    kick(t + 0.52, 1.1);
  };

  function pad(t) {
    const len = A.barDur * 1.04;
    for (const f of PAD) {
      for (const det of [-9, 9]) {
        const o = osc('sawtooth', f, t, len + 0.8); o.detune.value = det;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028, t + 0.35);
        g.gain.setValueAtTime(0.028, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.7);
        o.connect(lp); lp.connect(g); g.connect(bus); send(g, 0.6);
      }
    }
  }

  // ---------------------------------------------------------------- sequencer
  function scheduleStep(idx, t) {
    const N = A.N, s = idx % N, step = A.barDur / N, q = N / 4;
    let ty = null;
    try { ty = A.source(s, idx); } catch (e) { ty = null; }
    if (ty) voice(ty, t, 1, step);
    if (s % q === 0) {
      if (A.celebrate) { const k = (s / q) + 4 * (Math.floor(idx / N) % 2); chime(SCALE[(k * 3) % 10] * 2, t, 0.07, 0.5); }
      else if (A.metro) chime(s === 0 ? 2200 : 1500, t, s === 0 ? 0.05 : 0.025, 0.03, 'sine');
    }
    if (s === 0 && A.celebrate) pad(t);
    A.hits.push({ time: t, step: s, type: ty });
    if (A.hits.length > 160) A.hits.splice(0, A.hits.length - 160);
  }
  function pump() {
    if (!ctx || !A.running) return;
    const step = A.barDur / A.N, t = ctx.currentTime;
    if (A.next < t - 0.4) { const miss = Math.floor((t - A.next) / step); A.next += miss * step; A.idx += miss; }
    while (A.next < t + 0.14) { scheduleStep(A.idx, A.next); A.next += step; A.idx++; }
  }

  // test hooks: render the voices into an OfflineAudioContext and measure them
  A.init = (c) => init(c);
  A.voiceAt = (type, t, v = 1, step = 0.15) => voice(type, t, v, step);
  A.padAt = (t) => pad(t);
  A.unlock = () => { if (!init()) return false; if (ctx.state !== 'running') ctx.resume(); return true; };
  A.ready = () => !!ctx;
  A.start = (N, barDur) => {
    A.N = N; A.barDur = barDur; A.hits = [];
    if (!init()) return;
    A.running = true; A.t0 = ctx.currentTime + 0.08; A.next = A.t0; A.idx = 0;
    if (timer) clearInterval(timer);
    timer = setInterval(pump, 25); pump();
  };
  A.stop = () => { A.running = false; if (timer) { clearInterval(timer); timer = null; } };
  A.setSource = (fn) => { A.source = fn; };
  A.setMuted = (m) => { A.muted = !!m; if (out) out.gain.setTargetAtTime(A.muted ? 0 : 0.9, ctx.currentTime, 0.03); };
  // fractional step of the playhead, 0..N
  A.pos = () => {
    const step = A.barDur / A.N;
    const el = ctx && A.running ? ctx.currentTime - A.t0 : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const p = (el / step) % A.N; return p < 0 ? p + A.N : p;
  };
  A.drain = () => {
    if (!ctx) return []; const t = ctx.currentTime, due = [];
    while (A.hits.length && A.hits[0].time <= t) due.push(A.hits.shift());
    return due;
  };
  return A;
}
