// Ludus Maximus 3D: reference procedural audio engine (Web Audio only, zero files).
// createAudio(opts) -> { unlock, setMaster/Music/Sfx, sfx, crowd, duck, music{...}, ... }
//   opts.ctx   : pass an (Offline)AudioContext to render deterministically (tests); otherwise one is created on unlock()
//   opts.seed  : seed for music variation and sfx randomness
//   opts.log   : keep music event log in audio.music.log (tests)
// Degrades silently (every method is a safe no-op) when no AudioContext exists (Node, old browsers).
// No em dashes. Levels are tuned so that every sfx peaks between about -14 and -3 dBFS after the master limiter.

export const SFX_NAMES = ['swordHit', 'swordHitCrit', 'shieldBlock', 'metalClang', 'swish', 'swishHeavy', 'miss', 'grunt', 'hurt', 'deathCry', 'deathThud',
  'footstep', 'dust', 'netThrow', 'spearThrust', 'bash', 'stunChime', 'healSparkle', 'levelUp', 'coin', 'uiTap', 'uiConfirm', 'uiError', 'gate', 'horn',
  'ultFire', 'ultLightning', 'ultEarth', 'ultWind', 'ultHoly', 'crowdGasp', 'crowdCheer', 'crowdRoar', 'crowdBoo', 'crowdChant', 'drum',
  'slashWet', 'crunch', 'boneSnap', 'spurt', 'splat', 'gibThud', 'crowdGore',
  'uiHover', 'uiSelect', 'uiOpen', 'uiClose', 'bird', 'owl', 'hammer', 'clink', 'chop', 'sizzle', 'thock', 'thunder'];   // HUB-AUDIO: ui hooks and ludus ambience one-shots
export const MUSIC_MODES = ['ludus', 'prep', 'arena', 'victory', 'defeat'];

const MUSIC_TRIM = 0.32;      // music sits about 6 dB under the sfx at equal slider positions
const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (...xs) => { let h = 2166136261; for (const x of xs) { const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 124; } return h >>> 0; };

// vowel formants (F1, F2, F3 Hz) for adult male-ish voice
const VOWEL = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2700], e: [400, 1600, 2700], i: [270, 2300, 3000] };
// 4 gladiator voice types: base pitch, formant scale, vowel, rasp (pitch jitter depth)
const VOICES = [
  { f0: 92, fs: 0.88, v: 'o', rasp: 9 },   // 0 brute
  { f0: 122, fs: 1.0, v: 'a', rasp: 6 },   // 1 veteran
  { f0: 175, fs: 1.1, v: 'e', rasp: 4 },   // 2 youth
  { f0: 235, fs: 1.2, v: 'a', rasp: 3 },   // 3 lithe (high)
];
const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygDom: [0, 1, 4, 5, 7, 8, 10], phryg: [0, 1, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10],
};
const degFreq = (tonic, scale, deg) => { const n = scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n; return tonic * Math.pow(2, (scale[i] + 12 * o) / 12); };

export function createAudio(opts = {}) {
  const Ctor = typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null;
  const OFFLINE = !!opts.ctx;
  let ctx = opts.ctx || null, ready = false, dead = !OFFLINE && !Ctor;
  let seed = opts.seed == null ? 1337 : opts.seed >>> 0;
  let rng = mulberry(seed);
  const vol = { master: 0.9, music: 0.7, sfx: 0.9 };
  let analyser, master, comp, limiter, musicBus, musicDuck, sfxBus, crowdBus, reverb, revSend, revMusic, revCrowd;
  const noiseBuf = {};     // white/pink/brown 3s buffers
  const ksCache = new Map();
  let voicesOut = [];      // {end, pri}
  const lastHit = {};

  // ---------- graph ----------
  function ensure() {
    if (ready) return true;
    if (dead) return false;
    try {
      if (!ctx) ctx = new Ctor({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = vol.master;
      comp = ctx.createDynamicsCompressor();       // glue
      comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
      limiter = ctx.createDynamicsCompressor();    // fast safety limiter
      limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
      const trim = ctx.createGain(); trim.gain.value = 0.92;
      master.connect(comp); comp.connect(limiter); limiter.connect(trim); trim.connect(ctx.destination);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; trim.connect(analyser); // meter tap
      musicDuck = ctx.createGain(); musicBus = ctx.createGain(); musicBus.gain.value = vol.music * MUSIC_TRIM;
      musicBus.connect(musicDuck); musicDuck.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
      crowdBus = ctx.createGain(); crowdBus.gain.value = vol.sfx; crowdBus.connect(master);
      // colosseum space: procedural IR convolver, three sends
      reverb = ctx.createConvolver(); reverb.buffer = makeIR(2.3);
      const wet = ctx.createGain(); wet.gain.value = 0.8; reverb.connect(wet); wet.connect(master);
      revSend = ctx.createGain(); revSend.gain.value = 1; revSend.connect(reverb);
      revMusic = ctx.createGain(); revMusic.gain.value = 0.22; musicBus.connect(revMusic); revMusic.connect(reverb);
      revCrowd = ctx.createGain(); revCrowd.gain.value = 0.18; crowdBus.connect(revCrowd); revCrowd.connect(reverb);
      for (const k of ['white', 'pink', 'brown']) noiseBuf[k] = makeNoise(k, 3);
      ready = true;
      try { ctx.onstatechange = () => { if (ctx.state === 'interrupted') tryResume(); }; } catch (e) { /* ignore */ }
      if (typeof document !== 'undefined' && !OFFLINE) document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else tryResume(); });
      return true;
    } catch (e) { dead = true; return false; }
  }
  function tryResume() { try { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') return ctx.resume(); } catch (e) { /* ignore */ } }
  function makeIR(sec) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), r = mulberry(99);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, e = Math.pow(1 - i / n, 3.2) * Math.exp(-t * 1.1);
        const k = 0.55 - 0.5 * Math.min(1, t / sec); // progressively darker
        lp += ((r() * 2 - 1) - lp) * k;
        d[i] = lp * e * (t < 0.028 ? 0 : 1);          // 28 ms predelay
      }
      for (let k = 0; k < 7; k++) { const at = Math.floor(sr * (0.03 + r() * 0.09)); d[at] += (r() < 0.5 ? -1 : 1) * (0.5 - k * 0.05); } // early reflections
    }
    return b;
  }
  function makeNoise(kind, sec) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), x = Math.floor(sr * 0.05), src = new Float32Array(n + x), r = mulberry(7 + kind.length);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n + x; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') src[i] = w;
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; src[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; }
      else { last = (last + 0.02 * w) / 1.02; src[i] = last * 3.2; }
    }
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = i < x ? src[i] * (i / x) + src[n + i] * (1 - i / x) : src[i]; // seamless loop
    return b;
  }

  // ---------- synthesis helpers ----------
  const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  function env(p, t, a, peak, d) { p.setValueAtTime(0.00001, t); p.linearRampToValueAtTime(peak, t + Math.max(0.001, a)); p.exponentialRampToValueAtTime(0.00001, t + a + Math.max(0.01, d)); }
  function envASR(p, t, a, peak, hold, rel) { p.setValueAtTime(0.00001, t); p.linearRampToValueAtTime(peak, t + a); p.setValueAtTime(peak, t + a + hold); p.exponentialRampToValueAtTime(0.00001, t + a + hold + rel); }
  function osc(type, f, t, dur, dest, o = {}) {
    const s = ctx.createOscillator(); s.type = type; s.frequency.setValueAtTime(f, t);
    if (o.f1) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.fd || dur));
    if (o.detune) s.detune.value = o.detune;
    s.connect(dest); s.start(t); s.stop(t + dur + 0.05); return s;
  }
  function noise(kind, t, dur, dest, off) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf[kind || 'white']; s.loop = true; s.connect(dest);
    s.start(t, off == null ? rng() * 2.5 : off); s.stop(t + dur + 0.05); return s;
  }
  // filtered noise burst with exponential filter sweep and AR envelope
  function burst(t, dur, dest, o = {}) {
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q == null ? 1 : o.q;
    f.frequency.setValueAtTime(o.f0 || 1000, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ctx.createGain(); env(g.gain, t, o.a || 0.002, o.g == null ? 1 : o.g, dur);
    noise(o.kind || 'white', t, dur + (o.a || 0), f); f.connect(g); g.connect(dest); return g;
  }
  function partials(t, f, ratios, amps, decay, dest, type = 'sine') {
    ratios.forEach((r, i) => { const g = ctx.createGain(); env(g.gain, t, 0.002, amps[i] == null ? 0.3 : amps[i], decay / (1 + i * 0.55)); g.connect(dest); osc(type, f * r, t, decay, g); });
  }
  // thump: pitch-dropping sine
  function thump(t, f0, f1, dur, g, dest) { const e = ctx.createGain(); env(e.gain, t, 0.002, g, dur); e.connect(dest); osc('sine', f0, t, dur, e, { f1, fd: dur * 0.6 });
    const h = ctx.createGain(); env(h.gain, t, 0.002, g * 0.4, dur * 0.5); h.connect(dest); osc('triangle', f0 * 2, t, dur * 0.5, h, { f1: f1 * 2, fd: dur * 0.3 }); } // 2nd partial keeps it audible on phone speakers
  // formant voice: sawtooth through 3 parallel band-pass filters (+breath noise)
  function voice(t, dur, dest, o) {
    const V = VOICES[clamp(o.voice | 0, 0, 3)], F = VOWEL[o.vowel || V.v], f0 = V.f0 * (o.pitch || 1);
    const sum = ctx.createGain(); envASR(sum.gain, t, o.a || 0.012, o.g || 0.6, dur * 0.5, dur * 0.5);
    sum.connect(dest);
    const src = ctx.createGain();
    const s = ctx.createOscillator(); s.type = 'sawtooth';
    s.frequency.setValueAtTime(f0 * (o.p0 || 1.1), t); s.frequency.exponentialRampToValueAtTime(f0 * (o.p1 || 0.8), t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = o.vib || 27; lg.gain.value = V.rasp * (o.rasp || 1); lfo.connect(lg); lg.connect(s.frequency);
    s.connect(src); s.start(t); s.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    const br = ctx.createGain(); br.gain.value = o.breath == null ? 0.5 : o.breath; noise('white', t, dur, br); 
    const amp = [1, 0.7, 0.4], q = [7, 9, 11];
    F.forEach((fr, i) => {
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = q[i];
      b.frequency.setValueAtTime(fr * V.fs * (o.f1s || 1), t); if (o.fEnd) b.frequency.linearRampToValueAtTime(fr * V.fs * o.fEnd, t + dur);
      const og = ctx.createGain(); og.gain.value = amp[i] * (i ? 1 : 1.4);
      src.connect(b); br.connect(b); b.connect(og); og.connect(sum);
    });
    return sum;
  }
  // brass (cornu / fanfare): detuned saws, opening low-pass, formant bumps, pitch scoop
  function brass(dest, t, f, dur, g, o = {}) {
    const out = ctx.createGain(); envASR(out.gain, t, o.a || 0.05, g, Math.max(0.01, dur - (o.a || 0.05)), o.rel || 0.14); out.connect(dest);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    const br = o.bright || 1;
    lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 6 * br), t + (o.a || 0.05) + 0.06); lp.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 3.5 * br), t + dur);
    const p1 = ctx.createBiquadFilter(); p1.type = 'peaking'; p1.frequency.value = 900; p1.Q.value = 1.4; p1.gain.value = 6;
    const p2 = ctx.createBiquadFilter(); p2.type = 'peaking'; p2.frequency.value = 2300; p2.Q.value = 1.2; p2.gain.value = 3;
    lp.connect(p1); p1.connect(p2); p2.connect(out);
    [-11, 0, 9].forEach((dt, i) => { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.detune.value = dt; s.frequency.setValueAtTime(f * 0.972, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const sg = G(i === 1 ? 0.5 : 0.3); s.connect(sg); sg.connect(lp); s.start(t); s.stop(t + dur + (o.rel || 0.14) + 0.05); });
    return out;
  }
  // Karplus-Strong pluck rendered once per pitch into an AudioBuffer (delay-line feedback in a node graph cannot go above ~340 Hz)
  function pluckBuf(f, bright = 0.5, dur = 1.8, decay = 0.996) {
    const key = Math.round(f * 10) + ':' + bright + ':' + dur;
    if (ksCache.has(key)) return ksCache.get(key);
    const sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / f)), n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), r = mulberry(Math.round(f));
    const ring = new Float32Array(N); let lp = 0;
    for (let i = 0; i < N; i++) { lp += ((r() * 2 - 1) - lp) * (0.25 + bright * 0.75); ring[i] = lp; }
    let idx = 0;
    for (let i = 0; i < n; i++) { const nx = (idx + 1) % N; d[i] = ring[idx]; ring[idx] = (ring[idx] + ring[nx]) * 0.5 * decay; idx = nx; }
    const fade = Math.floor(sr * 0.05); for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
    ksCache.set(key, b); return b;
  }
  function pluck(dest, t, f, g, o = {}) {
    const s = ctx.createBufferSource(); s.buffer = pluckBuf(f, o.bright == null ? 0.5 : o.bright, o.dur || 1.8, o.decay || 0.996);
    const gg = G(g); s.connect(gg); gg.connect(dest); s.start(t); return s;
  }
  // flute-ish lead: sine + soft triangle, breath noise at pitch, delayed vibrato
  function flute(dest, t, f, dur, g, o = {}) {
    const out = ctx.createGain(); envASR(out.gain, t, 0.07, g, Math.max(0.02, dur - 0.07), 0.12); out.connect(dest);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.5, dur)); vib.connect(vg);
    const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = f; vg.connect(a.frequency);
    const b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = f * 2; const bg = G(0.12); vg.connect(b.frequency);
    a.connect(out); b.connect(bg); bg.connect(out);
    const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = f * 2; nb.Q.value = 6; const ng = G(o.breath == null ? 0.22 : o.breath); noise('white', t, dur + 0.1, nb); nb.connect(ng); ng.connect(out);
    [a, b, vib].forEach((x) => { x.start(t); x.stop(t + dur + 0.2); });
  }
  // string ensemble note (detuned saws, low-pass)
  function strings(dest, t, f, dur, g, o = {}) {
    const out = ctx.createGain(); const a = o.a == null ? 0.01 : o.a;
    envASR(out.gain, t, a, g, Math.max(0.01, dur - a), o.rel || 0.08); out.connect(dest);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut || 2200; lp.Q.value = 0.7; lp.connect(out);
    [-9, 8].forEach((dt) => { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.detune.value = dt; s.frequency.value = f; const sg = G(0.5); s.connect(sg); sg.connect(lp); s.start(t); s.stop(t + dur + (o.rel || 0.08) + 0.05); });
  }
  // percussion
  function drumHit(dest, t, f, g, o = {}) {
    const dec = o.dec || 0.38;
    thump(t, f * 1.9, f, dec * 0.7, g, dest);
    if (o.tymp) partials(t, f, [1.504, 1.99, 2.44], [0.35 * g, 0.25 * g, 0.15 * g], dec * 1.6, dest);
    burst(t, 0.05, dest, { type: 'lowpass', f0: 700, f1: 200, g: g * 0.6 });
    if (o.skin) burst(t, 0.03, dest, { type: 'bandpass', f0: 1800, q: 1.5, g: g * 0.25 });
  }
  function shaker(dest, t, g) { burst(t, 0.045, dest, { type: 'highpass', f0: 5500, q: 0.5, g, a: 0.008 }); }
  function crash(dest, t, g, dur = 1.6) { burst(t, dur, dest, { type: 'highpass', f0: 3500, q: 0.4, g, a: 0.004 }); burst(t, dur * 0.7, dest, { type: 'bandpass', f0: 7200, q: 2, g: g * 0.5, a: 0.004 }); }

  // ---------- sfx ----------
  // per-sound level (lvl), nominal duration, priority (higher survives voice stealing), duck amount for music, reverb send (wet), max concurrent
  const T = {};
  const def = (name, lvl, dur, pri, wet, duck, max, fn) => { T[name] = { lvl, dur, pri, wet, duck, max, fn }; };
  const hz = (o, f) => f * (o.pitch || 1);

  def('swordHit', 1.0, 0.5, 2, 0.12, 0, 5, (t, d, o) => {
    burst(t, 0.09, d, { f0: 3200, f1: 1100, q: 0.9, g: 0.9 });
    partials(t, hz(o, 1750), [1, 1.51, 2.37, 3.9], [0.22, 0.16, 0.1, 0.06], 0.28, d, 'triangle');
    thump(t, hz(o, 170), 62, 0.14, 0.6, d);
  });
  def('swordHitCrit', 1.0, 1.4, 4, 0.3, 0.45, 3, (t, d, o) => {
    burst(t, 0.12, d, { f0: 4500, f1: 900, q: 0.8, g: 1 });
    partials(t, hz(o, 1420), [1, 1.51, 2.37, 3.9, 5.6], [0.3, 0.22, 0.15, 0.1, 0.06], 0.75, d, 'triangle');
    thump(t, hz(o, 130), 55, 0.4, 1, d);
    burst(t + 0.01, 0.6, d, { type: 'highpass', f0: 6000, g: 0.25, a: 0.01 });
    osc('sawtooth', hz(o, 90), t, 0.25, (() => { const g = G(0); env(g.gain, t, 0.002, 0.25, 0.22); g.connect(d); return g; })(), { f1: 38 });
  });
  def('shieldBlock', 0.95, 0.6, 2, 0.15, 0, 4, (t, d, o) => {
    thump(t, hz(o, 230), 95, 0.16, 0.85, d);
    burst(t, 0.1, d, { type: 'lowpass', f0: 1400, f1: 400, g: 0.7 });
    partials(t, hz(o, 640), [1, 2.1, 3.4], [0.22, 0.14, 0.08], 0.35, d, 'square');
  });
  def('metalClang', 0.8, 1.6, 2, 0.28, 0, 4, (t, d, o) => {
    burst(t, 0.04, d, { f0: 5000, g: 0.7 });
    partials(t, hz(o, 610), [1, 2.76, 5.4, 8.93, 12.1], [0.28, 0.22, 0.14, 0.08, 0.04], 1.2, d);
  });
  const swishFn = (heavy) => (t, d, o) => {
    const dur = heavy ? 0.34 : 0.16, up = heavy ? 1 : 1.4;
    burst(t, dur, d, { f0: (heavy ? 260 : 700) * (o.pitch || 1), f1: (heavy ? 1500 : 3600) * (o.pitch || 1) * up / 1.4, q: heavy ? 1.6 : 2.2, g: heavy ? 0.9 : 0.7, a: dur * 0.45 });
    if (heavy) burst(t, dur, d, { type: 'lowpass', f0: 500, f1: 150, g: 0.4, a: dur * 0.4, kind: 'pink' });
  };
  def('swish', 0.85, 0.3, 1, 0.08, 0, 4, (t, d, o) => swishFn(!!o.heavy)(t, d, o));
  def('swishHeavy', 0.9, 0.5, 1, 0.1, 0, 3, swishFn(true));
  def('miss', 0.5, 0.35, 1, 0.1, 0, 3, (t, d, o) => {
    burst(t, 0.22, d, { f0: 2400 * (o.pitch || 1), f1: 500, q: 1.4, g: 0.7, a: 0.05 });
    burst(t + 0.05, 0.12, d, { type: 'highpass', f0: 4000, g: 0.15, a: 0.03 });
  });
  def('grunt', 0.75, 0.5, 2, 0.1, 0, 4, (t, d, o) => { voice(t, 0.22, d, { voice: o.voice, pitch: o.pitch, g: 0.9, p0: 1.15, p1: 0.82, breath: 0.45 }); });
  def('hurt', 0.8, 0.7, 3, 0.14, 0, 3, (t, d, o) => {
    voice(t, 0.38, d, { voice: o.voice, pitch: (o.pitch || 1) * 1.35, g: 0.95, p0: 1.0, p1: 1.35, vowel: 'a', breath: 0.35, a: 0.01, vib: 31 });
    voice(t + 0.05, 0.3, d, { voice: o.voice, pitch: (o.pitch || 1) * 1.1, g: 0.5, p0: 1.1, p1: 0.7, vowel: 'o', breath: 0.2 });
  });
  def('deathCry', 0.85, 1.4, 4, 0.3, 0, 2, (t, d, o) => {
    voice(t, 1.1, d, { voice: o.voice, pitch: (o.pitch || 1) * 1.4, g: 0.95, p0: 1.2, p1: 0.45, vowel: 'a', fEnd: 0.7, breath: 0.4, a: 0.04, vib: 24, rasp: 2 });
  });
  def('deathThud', 1.0, 1.0, 4, 0.2, 0.3, 2, (t, d, o) => {
    thump(t, hz(o, 110), 50, 0.5, 1, d);
    burst(t, 0.3, d, { type: 'lowpass', f0: 900, f1: 120, g: 0.8, kind: 'pink' });
    burst(t + 0.05, 0.5, d, { type: 'bandpass', f0: 2500, f1: 1200, q: 0.6, g: 0.18, a: 0.05, kind: 'white' }); // sand scatter
    partials(t + 0.02, hz(o, 420), [1, 1.6], [0.12, 0.08], 0.2, d, 'triangle'); // armor rattle
  });
  def('footstep', 0.75, 0.25, 0, 0.04, 0, 3, (t, d, o) => {
    burst(t, 0.12, d, { type: 'lowpass', f0: 1500 * (o.pitch || 1), f1: 350, g: 0.8, kind: 'pink', a: 0.004 });
    for (let i = 0; i < 4; i++) burst(t + 0.01 + i * 0.012 * rng(), 0.03, d, { type: 'highpass', f0: 3500 + rng() * 2500, g: 0.12 + rng() * 0.08, a: 0.002 }); // grit
    thump(t, 100, 55, 0.07, 0.35, d);
  });
  def('dust', 0.45, 0.6, 0, 0.1, 0, 3, (t, d, o) => {
    burst(t, 0.5, d, { type: 'bandpass', f0: 1400, f1: 500, q: 0.5, g: 0.6, a: 0.08, kind: 'pink' });
  });
  def('netThrow', 0.45, 0.8, 2, 0.12, 0, 2, (t, d, o) => {
    burst(t, 0.45, d, { f0: 400, f1: 1800, q: 1.5, g: 0.9, a: 0.2 });
    const g = G(0); env(g.gain, t + 0.05, 0.15, 0.5, 0.45); g.connect(d);
    const am = ctx.createGain(); am.gain.value = 0.5; const lf = ctx.createOscillator(); lf.frequency.value = 34; const lg = G(0.5); lf.connect(lg); lg.connect(am.gain); lf.start(t); lf.stop(t + 0.7);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.8; noise('white', t + 0.05, 0.6, am); am.connect(f); f.connect(g); // rope flutter
  });
  def('spearThrust', 0.75, 0.4, 2, 0.1, 0, 4, (t, d, o) => {
    burst(t, 0.14, d, { f0: 1000, f1: 5200, q: 2.6, g: 0.8, a: 0.05 });
    burst(t + 0.1, 0.07, d, { f0: 1800, q: 1.2, g: 0.5 });
    thump(t + 0.1, 140, 70, 0.08, 0.35, d);
  });
  def('bash', 1.0, 0.7, 3, 0.2, 0.2, 3, (t, d, o) => {
    thump(t, hz(o, 120), 45, 0.28, 1, d);
    burst(t, 0.2, d, { type: 'lowpass', f0: 1800, f1: 300, g: 0.8, kind: 'pink' });
    burst(t + 0.005, 0.06, d, { f0: 2200, q: 2, g: 0.6 }); // wood crack
    partials(t, hz(o, 330), [1, 2.3], [0.2, 0.1], 0.3, d, 'square');
  });
  def('stunChime', 0.55, 1.4, 2, 0.35, 0, 2, (t, d, o) => {
    [0, 0.13, 0.26].forEach((dt, i) => { partials(t + dt, hz(o, 1568) * (i === 1 ? 0.89 : 1), [1, 2.01, 3.0], [0.25, 0.1, 0.05], 0.9, d); });
  });
  def('healSparkle', 0.5, 1.3, 1, 0.4, 0, 2, (t, d, o) => {
    [0, 2, 4, 7, 9, 12].forEach((s, i) => { const tt = t + i * 0.06; const g = G(0); env(g.gain, tt, 0.004, 0.22, 0.5); g.connect(d); osc('sine', hz(o, 1318) * Math.pow(2, s / 12), tt, 0.55, g); osc('sine', hz(o, 1318) * Math.pow(2, s / 12) * 3, tt, 0.2, (() => { const x = G(0.05); x.connect(g); return x; })()); });
    burst(t, 0.8, d, { type: 'highpass', f0: 7000, g: 0.06, a: 0.2 });
  });
  const fanfare = (t, d, o, k) => {
    const f = hz(o, NOTE(62)); // D4
    const seq = [[0, 0.16, 0], [0.18, 0.16, 0], [0.36, 0.16, 0], [0.56, 0.5, 4], [1.1, 0.2, 2], [1.32, 0.9, 7]];
    seq.forEach(([dt, du, s], i) => { brass(d, t + dt, f * Math.pow(2, s / 12), du, 0.5 * k, { a: 0.02 }); if (i > 2) brass(d, t + dt, f * Math.pow(2, (s + 7) / 12) * 0.5, du, 0.3 * k, { a: 0.03, bright: 0.8 }); });
    drumHit(d, t, 80, 0.7, { tymp: 1, dec: 0.6 }); drumHit(d, t + 1.32, 80, 0.8, { tymp: 1, dec: 0.9 }); crash(d, t + 1.32, 0.25, 1.4);
  };
  def('levelUp', 0.38, 2.6, 3, 0.3, 0.5, 1, (t, d, o) => fanfare(t, d, o, 1));
  def('coin', 0.5, 0.5, 0, 0.12, 0, 4, (t, d, o) => {
    [[0, 1318.5], [0.07, 1975.5]].forEach(([dt, f]) => { const g = G(0); env(g.gain, t + dt, 0.002, 0.4, dt ? 0.35 : 0.1); g.connect(d); osc('square', hz(o, f), t + dt, 0.4, g); osc('sine', hz(o, f) * 2.01, t + dt, 0.3, (() => { const x = G(0.3); x.connect(g); return x; })()); });
  });
  def('uiTap', 0.9, 0.12, 0, 0.0, 0, 4, (t, d, o) => { const g = G(0); env(g.gain, t, 0.001, 0.5, 0.09); g.connect(d); osc('triangle', hz(o, 820), t, 0.1, g, { f1: 520 }); });
  def('uiConfirm', 0.45, 0.45, 1, 0.1, 0, 2, (t, d, o) => {
    [[0, 523.25], [0.08, 783.99]].forEach(([dt, f]) => { const g = G(0); env(g.gain, t + dt, 0.003, 0.5, 0.25); g.connect(d); osc('triangle', hz(o, f), t + dt, 0.3, g); osc('sine', hz(o, f) * 2, t + dt, 0.2, (() => { const x = G(0.2); x.connect(g); return x; })()); });
  });
  def('uiError', 0.3, 0.4, 1, 0.05, 0, 2, (t, d, o) => {
    [0, 0.12].forEach((dt) => { const g = G(0); env(g.gain, t + dt, 0.003, 0.4, 0.1); g.connect(d); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g); osc('square', hz(o, 165), t + dt, 0.14, lp); osc('square', hz(o, 165) * 1.06, t + dt, 0.14, lp); });
  });
  def('gate', 0.6, 3.2, 3, 0.35, 0.4, 1, (t, d, o) => {
    const dur = 2.6, g = G(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.4); g.gain.setValueAtTime(1, t + dur - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3); g.connect(d);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(140, t); lp.frequency.linearRampToValueAtTime(330, t + dur); lp.Q.value = 2; lp.connect(g);
    const am = ctx.createGain(); am.gain.value = 0.6; const lf = ctx.createOscillator(); lf.frequency.value = 13; const lg = G(0.4); lf.connect(lg); lg.connect(am.gain); lf.start(t); lf.stop(t + dur + 0.4);
    noise('brown', t, dur + 0.3, am); am.connect(lp);
    thump(t, 74, 52, dur, 0.4, d);
    for (let i = 0; i < 14; i++) { const tt = t + 0.2 + rng() * (dur - 0.4); partials(tt, 1800 + rng() * 2500, [1, 2.76], [0.08, 0.05], 0.12, d, 'square'); } // chain links
    thump(t + dur + 0.2, 95, 50, 0.5, 0.9, d); // final slam
    burst(t + dur + 0.2, 0.3, d, { type: 'lowpass', f0: 900, f1: 150, g: 0.6, kind: 'pink' });
  });
  def('horn', 0.75, 2.6, 3, 0.45, 0.5, 1, (t, d, o) => {
    const f = hz(o, 98); // G2 cornu
    brass(d, t, f, 1.5, 0.7, { a: 0.18, rel: 0.5, bright: 0.7 });
    brass(d, t + 1.7, f * 1.5, 0.8, 0.6, { a: 0.12, rel: 0.6, bright: 0.7 }); // call and rising fifth
    brass(d, t, f * 2.003, 1.5, 0.25, { a: 0.2, rel: 0.5, bright: 0.6 });
  });
  const ult = {
    ultFire: (t, d, o) => {
      burst(t, 1.3, d, { type: 'lowpass', f0: 250, f1: 3200, q: 1.5, g: 1, a: 0.5, kind: 'pink' });
      for (let i = 0; i < 26; i++) burst(t + 0.2 + rng() * 1.0, 0.03, d, { type: 'highpass', f0: 2500 + rng() * 3000, g: 0.25 * rng(), a: 0.002 }); // crackle
      thump(t + 0.5, 100, 50, 0.8, 0.9, d);
      brass(d, t, 73.4, 1.0, 0.45, { a: 0.4, rel: 0.4, bright: 0.9 });
    },
    ultLightning: (t, d, o) => {
      burst(t, 0.05, d, { type: 'highpass', f0: 3000, g: 1, a: 0.0015 });
      for (let i = 0; i < 5; i++) { const tt = t + i * 0.045; const g = G(0); env(g.gain, tt, 0.001, 0.4, 0.05); g.connect(d); osc('sawtooth', 5000 - i * 700, tt, 0.06, g, { f1: 400 }); }
      burst(t + 0.05, 1.4, d, { type: 'lowpass', f0: 400, f1: 70, g: 0.9, a: 0.1, kind: 'brown' }); // thunder
      thump(t + 0.08, 90, 45, 0.9, 0.9, d);
    },
    ultEarth: (t, d, o) => {
      thump(t, 95, 48, 1.0, 1, d); thump(t + 0.25, 75, 42, 0.9, 0.8, d);
      burst(t, 1.5, d, { type: 'lowpass', f0: 900, f1: 160, g: 0.9, a: 0.05, kind: 'brown' });
      for (let i = 0; i < 26; i++) burst(t + 0.1 + rng() * 1.2, 0.08, d, { f0: 300 + rng() * 1400, q: 3, g: 0.45 + rng() * 0.3, a: 0.003, kind: 'white' }); // rock debris
    },
    ultWind: (t, d, o) => {
      [0, 0.25, 0.5].forEach((dt, i) => burst(t + dt, 1.1, d, { f0: 500 + i * 250, f1: 2600 - i * 300, q: 6, g: 0.55, a: 0.45 }));
      const g = G(0); env(g.gain, t + 0.1, 0.5, 0.12, 1.0); g.connect(d); osc('sine', 880, t + 0.1, 1.5, g, { f1: 1320 }); // ghost whistle
    },
    ultHoly: (t, d, o) => {
      [0, 4, 7, 12].forEach((s, i) => voice(t + i * 0.03, 1.8, d, { voice: 3, pitch: Math.pow(2, s / 12) * 0.9, vowel: 'a', g: 0.28, p0: 1, p1: 1.002, a: 0.5, vib: 5, rasp: 0.2, breath: 0.15 }));
      [0, 0.15, 0.3].forEach((dt, i) => partials(t + 0.2 + dt, 1760 * Math.pow(2, [0, 4, 7][i] / 12), [1, 2.01, 3.99], [0.14, 0.06, 0.03], 1.4, d));
      burst(t + 0.4, 1.0, d, { type: 'highpass', f0: 8000, g: 0.05, a: 0.4 });
    },
  };
  for (const k of Object.keys(ult)) def(k, { ultFire: 0.42, ultLightning: 0.55, ultEarth: 0.7, ultWind: 1.0, ultHoly: 0.75 }[k], 2.2, 4, 0.35, 0.55, 2, ult[k]);
  // crowd one-shots: formant-filtered noise + a handful of pitched voices
  function crowdVoices(t, dur, d, n, o) {
    for (let i = 0; i < n; i++) voice(t + rng() * dur * 0.25, dur * (0.55 + rng() * 0.4), d, { voice: i & 1 ? 1 : 0, pitch: (o.pitch || 1) * (0.85 + rng() * 0.8), vowel: o.vowel || 'o', g: (o.vg || 0.12), p0: o.p0 || 1, p1: o.p1 || 1, a: dur * 0.3, breath: 0.2, vib: 5 + rng() * 3, rasp: 3, fEnd: o.fEnd });
  }
  def('crowdGasp', 0.6, 0.9, 1, 0.5, 0, 1, (t, d, o) => { burst(t, 0.7, d, { f0: 700, f1: 2200, q: 1.2, g: 0.9, a: 0.3, kind: 'pink' }); burst(t, 0.6, d, { type: 'highpass', f0: 4000, g: 0.15, a: 0.3 }); });
  def('crowdCheer', 0.75, 2.2, 1, 0.5, 0, 1, (t, d, o) => {
    burst(t, 2.0, d, { f0: 900, f1: 1400, q: 0.9, g: 0.8, a: 0.4, kind: 'pink' }); crowdVoices(t, 1.8, d, 10, { vowel: 'a', p0: 1.0, p1: 1.15 });
    for (let i = 0; i < 12; i++) burst(t + 0.3 + rng() * 1.5, 0.03, d, { f0: 1500 + rng() * 1500, q: 1, g: 0.15, a: 0.001 }); // claps
  });
  def('crowdRoar', 0.8, 3.2, 2, 0.55, 0.35, 1, (t, d, o) => {
    burst(t, 3.0, d, { f0: 450, f1: 1100, q: 0.7, g: 1, a: 0.8, kind: 'pink' }); burst(t, 3.0, d, { type: 'lowpass', f0: 300, g: 0.7, a: 0.6, kind: 'brown' });
    crowdVoices(t, 2.8, d, 16, { vowel: 'o', pitch: 0.9, p0: 0.95, p1: 1.2, vg: 0.1 });
  });
  def('crowdBoo', 0.7, 2.2, 1, 0.5, 0, 1, (t, d, o) => {
    burst(t, 2.0, d, { f0: 380, f1: 300, q: 1.2, g: 0.7, a: 0.4, kind: 'pink' });
    crowdVoices(t, 1.9, d, 12, { vowel: 'u', pitch: 0.7, p0: 1.1, p1: 0.8, vg: 0.14 });
  });
  def('crowdChant', 0.65, 3.2, 1, 0.55, 0, 1, (t, d, o) => {
    for (let i = 0; i < 4; i++) { const tt = t + i * 0.7; burst(tt, 0.45, d, { f0: 600, f1: 500, q: 1.3, g: 0.6, a: 0.06, kind: 'pink' }); crowdVoices(tt, 0.5, d, 6, { vowel: i % 2 ? 'a' : 'o', pitch: 0.85, vg: 0.14, p0: 1.0, p1: 0.97 }); drumHit(d, tt, 85, 0.5, {}); } // stomp-clap pulse
  });
  def('drum', 0.9, 1.0, 1, 0.3, 0, 4, (t, d, o) => { const k = o.kind || 'low'; drumHit(d, t, hz(o, k === 'low' ? 78 : k === 'mid' ? 105 : 145), 1, { tymp: k !== 'tom', dec: k === 'low' ? 0.7 : 0.45, skin: 1 }); });

  // ---- gore (js/gore.js): wet slashes, bone, hiss of arterial spray, splats, limbs landing, the crowd gasping then roaring
  def('slashWet', 0.9, 0.45, 2, 0.1, 0, 4, (t, d, o) => {
    burst(t, 0.16, d, { f0: hz(o, 1800), f1: 450, q: 0.8, g: 0.8, a: 0.004 });
    burst(t + 0.01, 0.24, d, { type: 'lowpass', f0: 950, f1: 170, g: 0.75, kind: 'pink', a: 0.01 });
    for (let i = 0; i < 5; i++) burst(t + 0.02 + i * 0.026 * (0.6 + rng()), 0.032, d, { f0: 500 + rng() * 900, q: 4, g: 0.26, a: 0.002, kind: 'pink' }); // squelch
    thump(t, hz(o, 120), 55, 0.12, 0.5, d);
  });
  def('crunch', 0.9, 0.5, 3, 0.12, 0, 3, (t, d, o) => {
    for (let i = 0; i < 4; i++) burst(t + i * 0.018 * (0.5 + rng()), 0.05, d, { type: 'lowpass', f0: hz(o, 2600) * (0.6 + rng() * 0.6), f1: 300, g: 0.9, a: 0.001 });
    partials(t, hz(o, 260), [1, 1.6, 2.4], [0.3, 0.2, 0.12], 0.12, d, 'triangle');
    thump(t, hz(o, 90), 45, 0.18, 0.8, d);
  });
  def('boneSnap', 1.0, 0.45, 4, 0.2, 0.2, 2, (t, d, o) => {
    burst(t, 0.012, d, { type: 'highpass', f0: 5000, g: 1, a: 0.0005 });
    osc('sine', hz(o, 1500), t, 0.07, (() => { const g = G(0); env(g.gain, t, 0.001, 0.5, 0.06); g.connect(d); return g; })(), { f1: 300 });
    partials(t + 0.035, hz(o, 700), [1, 2.3], [0.3, 0.15], 0.12, d, 'square');
    burst(t + 0.02, 0.12, d, { type: 'lowpass', f0: 2000, f1: 250, g: 0.6, a: 0.002 });
    thump(t, hz(o, 150), 60, 0.25, 0.9, d);
  });
  def('spurt', 0.7, 0.9, 1, 0.1, 0, 2, (t, d, o) => {
    for (let i = 0; i < 3; i++) { burst(t + i * 0.26, 0.24, d, { f0: 3400, f1: 1700, q: 1.2, g: 0.5 - i * 0.1, a: 0.05 }); burst(t + i * 0.26, 0.2, d, { type: 'lowpass', f0: 700, f1: 300, g: 0.35 - i * 0.07, kind: 'pink', a: 0.04 }); }
  });
  def('splat', 1.0, 0.5, 3, 0.12, 0.1, 3, (t, d, o) => {
    burst(t, 0.2, d, { type: 'lowpass', f0: 1300, f1: 160, g: 1, kind: 'pink', a: 0.003 });
    thump(t, hz(o, 150), 60, 0.2, 0.9, d);
    for (let i = 0; i < 6; i++) burst(t + 0.04 + rng() * 0.2, 0.026, d, { f0: 1500 + rng() * 2000, q: 3, g: 0.15, a: 0.002 });
  });
  def('gibThud', 1.0, 0.45, 2, 0.15, 0, 3, (t, d, o) => {
    thump(t, hz(o, 100), 46, 0.28, 0.9, d);
    burst(t, 0.22, d, { type: 'lowpass', f0: 600, f1: 120, g: 0.8, kind: 'brown', a: 0.002 });
    burst(t, 0.08, d, { f0: 1100, q: 1.2, g: 0.25, kind: 'pink', a: 0.002 });
  });
  def('crowdGore', 0.85, 2.8, 3, 0.55, 0.3, 1, (t, d, o) => {
    burst(t, 0.6, d, { f0: 700, f1: 2300, q: 1.2, g: 0.9, a: 0.2, kind: 'pink' }); crowdVoices(t, 0.7, d, 8, { vowel: 'a', pitch: 1.1, p0: 1.3, p1: 1.0, vg: 0.09 });
    burst(t + 0.45, 2.2, d, { f0: 450, f1: 1000, q: 0.7, g: 1, a: 0.7, kind: 'pink' }); crowdVoices(t + 0.45, 2.0, d, 14, { vowel: 'o', pitch: 0.9, p0: 0.95, p1: 1.25, vg: 0.11 });
  });

  // ---- hub ui hooks and ludus ambience one-shots (HUB-AUDIO). All quiet: they live under the music and the crowd.
  def('uiHover', 0.5, 0.08, 0, 0.0, 0, 2, (t, d, o) => { const g = G(0); env(g.gain, t, 0.001, 0.22, 0.05); g.connect(d); osc('sine', hz(o, 1180), t, 0.07, g, { f1: 1500 }); });
  def('uiSelect', 0.7, 0.3, 1, 0.12, 0, 2, (t, d, o) => {   // marble tick + a rising wooden chime: a building was picked
    thump(t, 330, 190, 0.1, 0.3, d); [[0, 660], [0.06, 990]].forEach(([dt, f]) => { const g = G(0); env(g.gain, t + dt, 0.002, 0.3, 0.2); g.connect(d); osc('triangle', hz(o, f), t + dt, 0.22, g); });
  });
  def('uiOpen', 0.6, 0.45, 1, 0.15, 0, 2, (t, d, o) => { burst(t, 0.3, d, { f0: 700, f1: 2600, q: 0.8, g: 0.35, a: 0.12, kind: 'pink' }); const g = G(0); env(g.gain, t + 0.1, 0.01, 0.25, 0.25); g.connect(d); osc('sine', hz(o, 880), t + 0.1, 0.3, g, { f1: 1320 }); });   // parchment unrolling
  def('uiClose', 0.55, 0.35, 1, 0.1, 0, 2, (t, d, o) => { burst(t, 0.22, d, { f0: 2400, f1: 600, q: 0.8, g: 0.3, a: 0.05, kind: 'pink' }); thump(t + 0.12, 220, 120, 0.1, 0.25, d); });
  def('bird', 0.34, 1.3, 0, 0.3, 0, 3, (t, d, o) => {   // o.kind 0 tweet-tweet, 1 rising trill, 2 warble, 3 falling whistle
    const k = (o.kind == null ? Math.floor(rng() * 4) : o.kind) | 0, base = hz(o, 2800 + rng() * 1500);
    const note = (dt, f0, f1, du, g) => { const e = G(0); env(e.gain, t + dt, 0.006, g, du); e.connect(d); osc('sine', f0, t + dt, du, e, { f1 }); osc('sine', f0 * 2.01, t + dt, du * 0.6, (() => { const x = G(0.1); x.connect(e); return x; })(), { f1: f1 * 2 }); };
    if (k === 0) { note(0, base, base * 1.18, 0.09, 0.5); note(0.14, base * 1.05, base * 1.25, 0.1, 0.45); if (rng() < 0.6) note(0.3, base * 0.95, base * 1.1, 0.12, 0.4); }
    else if (k === 1) for (let i = 0; i < 6; i++) note(i * 0.07, base * (1 + i * 0.05), base * (1.08 + i * 0.05), 0.06, 0.42);
    else if (k === 2) for (let i = 0; i < 5; i++) note(i * 0.11, base * (i % 2 ? 1.2 : 0.9), base * (i % 2 ? 0.95 : 1.15), 0.1, 0.4);
    else note(0, base * 1.3, base * 0.8, 0.45, 0.45);
  });
  def('owl', 0.4, 1.6, 0, 0.45, 0, 1, (t, d, o) => { [[0, 0.5], [0.55, 0.62]].forEach(([dt, du]) => { const e = G(0); env(e.gain, t + dt, 0.08, 0.5, du); e.connect(d); osc('sine', hz(o, 400), t + dt, du + 0.1, e, { f1: 340 }); osc('sine', hz(o, 800), t + dt, du, (() => { const x = G(0.12); x.connect(e); return x; })()); }); });
  def('hammer', 0.85, 0.7, 0, 0.18, 0, 3, (t, d, o) => {   // hammer on an anvil: bright ring over a dull thud
    partials(t, hz(o, 1180), [1, 2.76, 5.4, 8.9], [0.3, 0.22, 0.12, 0.06], 0.5, d, 'triangle'); thump(t, 260, 90, 0.12, 0.4, d); burst(t, 0.03, d, { f0: 3800, q: 0.9, g: 0.5 });
  });
  def('clink', 0.55, 0.4, 0, 0.2, 0, 3, (t, d, o) => { partials(t, hz(o, 2400 + rng() * 900), [1, 2.32, 4.1], [0.22, 0.14, 0.07], 0.22, d, 'sine'); burst(t, 0.02, d, { f0: 5200, q: 1, g: 0.25 }); });   // cups, plates, a chain
  def('chop', 0.7, 0.14, 0, 0.05, 0, 4, (t, d, o) => { burst(t, 0.04, d, { f0: 1500, f1: 700, q: 1.2, g: 0.6 }); thump(t, 320, 150, 0.06, 0.4, d); });
  def('sizzle', 0.28, 1.4, 0, 0.1, 0, 2, (t, d, o) => { burst(t, 1.2, d, { type: 'highpass', f0: 4800, q: 0.4, g: 0.5, a: 0.12, kind: 'white' }); burst(t, 0.9, d, { f0: 2400, q: 0.7, g: 0.25, a: 0.2, kind: 'pink' }); });
  def('thock', 0.75, 0.25, 0, 0.1, 0, 3, (t, d, o) => { thump(t, 380, 160, 0.1, 0.5, d); burst(t, 0.05, d, { f0: 1700, f1: 900, q: 1.1, g: 0.5 }); });   // wooden practice blade on a post
  def('thunder', 0.9, 4.5, 2, 0.5, 0, 1, (t, d, o) => { burst(t, 0.15, d, { f0: 1200, f1: 200, q: 0.6, g: 0.4, kind: 'white' }); burst(t, 3.6, d, { type: 'lowpass', f0: 220, f1: 50, q: 0.7, g: 1.3, a: 0.35, kind: 'brown' }); burst(t + 0.9, 2.4, d, { type: 'lowpass', f0: 140, f1: 45, q: 0.7, g: 0.9, a: 0.5, kind: 'brown' }); });

  // ---------- sfx dispatch ----------
  function sfx(name, o = {}) {
    if (name === 'ult' && o.element) name = 'ult' + o.element[0].toUpperCase() + o.element.slice(1);
    const e = T[name]; if (!e || !ensure()) return false;
    if (!OFFLINE && ctx.state !== 'running') { tryResume(); return false; }
    const t = o.when != null ? o.when : ctx.currentTime + 0.005;
    // retrigger guard + voice limiting
    if (!OFFLINE) {
      const key = name + (o.voice || '');
      if (lastHit[key] != null && t - lastHit[key] < 0.03) return false;
      lastHit[key] = t;
      voicesOut = voicesOut.filter((v) => v.end > ctx.currentTime);
      if (voicesOut.filter((v) => v.name === name).length >= e.max) return false;
      if (voicesOut.length >= 28 && e.pri < 3) return false;
      if (voicesOut.length >= 40) return false;
      voicesOut.push({ name, end: t + e.dur, pri: e.pri });
    }
    const out = ctx.createGain(); out.gain.value = e.lvl * (o.gain == null ? 1 : o.gain);
    let tail = out;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); out.connect(p); tail = p; }
    const bus = name.startsWith('crowd') ? crowdBus : sfxBus;
    tail.connect(bus);
    if (e.wet > 0) { const w = G(e.wet * (o.wet == null ? 1 : o.wet)); tail.connect(w); w.connect(reverb); }
    try { e.fn(t, out, o); } catch (err) { /* never let audio break the game */ }
    if (e.duck) duck(e.duck, e.dur * 0.6, t);
    return true;
  }

  // sidechain-style ducking of the music bus
  function duck(amount = 0.5, hold = 0.5, at) {
    if (!ready) return; const t = at != null ? at : ctx.currentTime, p = musicDuck.gain;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value > 0 ? Math.min(1, p.value) : 1, t); p.linearRampToValueAtTime(1 - amount, t + 0.03); p.setValueAtTime(1 - amount, t + hold); p.linearRampToValueAtTime(1, t + hold + 0.6);
  }

  // ---------- crowd bed ----------
  let bed = null;
  function crowd(level) {
    level = clamp(+level || 0, 0, 1);
    if (!ensure()) return;
    if (!bed) {
      if (level <= 0) return;
      const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0; out.connect(crowdBus);
      const mk = (kind, type, f, q, g) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf[kind]; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gg = G(g); s.connect(fl); fl.connect(gg); gg.connect(out); s.start(t, rng() * 2); return { s, fl, gg }; };
      const body = mk('pink', 'bandpass', 500, 0.5, 1);                   // murmur body
      const f1 = mk('white', 'bandpass', 800, 3.5, 0.5), f2 = mk('white', 'bandpass', 1250, 4, 0.35); // vowel-ish band layer
      const air = mk('white', 'highpass', 3500, 0.5, 0.08);               // claps and rustle
      const low = mk('brown', 'lowpass', 220, 0.7, 0.5);                  // rumble of stamping
      const swell = (fr, dep, node) => { const l = ctx.createOscillator(), lg = G(dep); l.frequency.value = fr; l.connect(lg); lg.connect(node.gg.gain); l.start(t); };
      swell(0.23, 0.22, f1); swell(0.37, 0.18, f2); swell(0.11, 0.3, body); swell(0.6, 0.04, air);
      bed = { out, body, f1, f2, air, low, level: -1 };
      out.gain.value = 0.0001;
    }
    const t = ctx.currentTime, first = bed.level < 0, tc = first ? 0.001 : 0.4, L = level;
    const target = L <= 0.001 ? 0 : 0.03 + 0.32 * Math.pow(L, 1.3);
    bed.out.gain.setTargetAtTime(Math.max(0.0001, target), t, tc);
    bed.body.fl.frequency.setTargetAtTime(380 + 420 * L, t, tc); bed.f1.fl.frequency.setTargetAtTime(700 + 260 * L, t, tc); bed.f2.fl.frequency.setTargetAtTime(1100 + 400 * L, t, tc);
    bed.air.gg.gain.setTargetAtTime(0.03 + 0.07 * L * L, t, tc); bed.low.gg.gain.setTargetAtTime(0.2 + 0.7 * L, t, tc);
    bed.level = L;
    if (L <= 0.001) { const b = bed; bed = null; const stopAt = t + 2.5; for (const k of ['body', 'f1', 'f2', 'air', 'low']) { try { b[k].s.stop(stopAt); } catch (e) { /* ignore */ } } }
  }

  // ---------- music ----------
  const players = [];       // {mode, bus, ...}; the last is current, earlier ones fade out
  let intensityTarget = 0.3, curInt = 0.3, pumpTimer = null, curMode = null;
  const music = { log: opts.log ? [] : null };
  const L = (p, t, what, extra) => { if (music.log) music.log.push({ mode: p.mode, bar: p.bar, step: p.step, t, what, ...extra }); };

  // HUB-AUDIO: time-of-day mix for the 'ludus' hub music (n night, d dusk, dawn); smoothed per step, set by music.setHubTime(hour, night)
  const hubTod = { n: 0, d: 0, dawn: 0, tn: 0, td: 0, tdawn: 0 };
  const tickHubTod = () => { for (const k of ['n', 'd', 'dawn']) hubTod[k] += (hubTod['t' + k] - hubTod[k]) * 0.06; };
  // each mode: bpm(p), init(p), step(p, s, t) with s = step within bar (0..15)
  const MODES = {
    ludus: {
      bpm: () => 92 - 14 * hubTod.n, tonic: NOTE(50), // D3 (slower at night)
      init(p) { p.drone = makeDrone(p, NOTE(38), 0.14); },
      bar(p, bar, t) { const ph = Math.floor(bar / 4); p.r = mulberry(hash(seed, 'ludus', ph)); const progs = [[0, -1, 2, -1], [0, 3, -1, 0], [0, 2, 3, -1], [0, 4, 3, -1]]; p.prog = progs[Math.floor(p.r() * progs.length)]; p.rhythm = [[0, 4, 8, 12], [0, 3, 6, 10], [0, 6, 8, 12, 14], [2, 6, 10]][Math.floor(p.r() * 4)]; p.motif = Array.from({ length: 6 }, () => Math.floor(p.r() * 3) - 1); p.lead = p.r() < 0.78 && hubTod.n < 0.6; },
      step(p, s, t, sp) {
        const bar = p.bar, deg = p.prog[bar % 4], pd = bar % 8 === 7 || bar % 8 === 3 && p.r() < 0.3, sc = pd ? SCALES.phrygDom : SCALES.dorian, tonic = MODES.ludus.tonic;
        tickHubTod(); const pk = 1 - 0.65 * hubTod.n;   // HUB-AUDIO: soft percussion at night
        const ch = [deg, deg + 2, deg + 4, deg + 7];
        if (s % 2 === 0) { const i = (s / 2) % 8, idx = [0, 1, 2, 3, 2, 1, 2, 3][i]; if (p.r() > 0.12) pluck(p.bus, t + (s % 4 === 2 ? sp * 0.18 : 0), degFreq(tonic * 2, sc, ch[idx]), 0.22 + (s === 0 ? 0.08 : 0), { bright: 0.45 }), L(p, t, 'lyre'); }
        if (s === 0) { setDrone(p, degFreq(tonic / 2, SCALES.dorian, deg), t); pluck(p.bus, t, degFreq(tonic, sc, deg), 0.25, { dur: 2.2 }); }
        if (p.lead && p.rhythm.includes(s) && bar % 2 === 1) { const k = p.rhythm.indexOf(s); const dg = ch[0] + 7 + p.motif[k % 6] * 2 + (k === p.rhythm.length - 1 ? 2 : 0); flute(p.bus, t, degFreq(tonic * 2, sc, dg), sp * (k === p.rhythm.length - 1 ? 5 : 2.4), 0.14); L(p, t, 'flute'); }
        if (s === 0 || s === 8) drumHit(p.bus, t, 100, 0.22 * pk, { skin: 1, dec: 0.25 });
        if (s % 4 === 2) shaker(p.bus, t, (0.05 + 0.04 * curInt) * pk);
        if (s === 10 && p.r() < 0.4) drumHit(p.bus, t, 130, 0.1 * pk, { dec: 0.15, skin: 1 });
        // HUB-AUDIO time of day: a string pad swells in at dusk and night, dawn adds a high bird-like flute, deep night adds sparse bell plucks
        if (s === 0 && bar % 2 === 0) { const gp = 0.02 + 0.07 * clamp(hubTod.n + 0.7 * hubTod.d, 0, 1); if (gp > 0.03) [0, 2, 4].forEach((k) => strings(p.bus, t, degFreq(tonic, SCALES.dorian, deg + k), sp * 30, gp * (k ? 0.7 : 1), { a: 1.4, rel: 1.5, cut: 650 + 700 * (1 - hubTod.n) })); }
        if (s === 0 && p.drone) p.drone.g.gain.setTargetAtTime(0.14 + 0.1 * hubTod.n + 0.05 * hubTod.d, t, 0.6);
        if (hubTod.dawn > 0.25 && s === 8 && bar % 2 === 1) flute(p.bus, t, degFreq(tonic * 4, SCALES.dorian, [4, 2, 5, 3][(bar >> 1) % 4]), sp * 3, 0.07 * hubTod.dawn, { breath: 0.12 });
        if (hubTod.n > 0.55 && s === 6 && bar % 4 === 1) pluck(p.bus, t, degFreq(tonic * 4, SCALES.dorian, [0, 4, 2, 6][(bar >> 2) % 4]), 0.06 * hubTod.n, { bright: 0.15, dur: 2.4 });
      },
    },
    prep: {
      bpm: (p) => 76 + 8 * curInt, tonic: NOTE(38), // D2
      init(p) { p.drone = makeDrone(p, NOTE(38), 0.2); },
      bar(p, bar, t) { p.r = mulberry(hash(seed, 'prep', Math.floor(bar / 4))); p.tens = clamp(bar / 24 + 0.3 * curInt, 0, 1); },
      step(p, s, t, sp) {
        const tn = MODES.prep.tonic, tens = p.tens || 0, bar = p.bar;
        if (s === 0) { drumHit(p.bus, t, 72, 0.85, { tymp: 1, dec: 0.8 }); L(p, t, 'drum'); }
        if (s === 3 && bar % 2) drumHit(p.bus, t, 72, 0.4, { tymp: 1, dec: 0.5 });
        if (s === 8) drumHit(p.bus, t, 88, 0.55 + 0.2 * tens, { tymp: 1, dec: 0.6 });
        if (s === 10 && tens > 0.4) drumHit(p.bus, t, 82, 0.35, { tymp: 1, dec: 0.4 });
        if (s % 4 === 0) { const g = G(0); env(g.gain, t, 0.001, 0.08 + 0.1 * tens, 0.04); g.connect(p.bus); osc('sine', 1250, t, 0.05, g); } // wooden tick
        if (s % 2 === 0 && tens > 0.1) strings(p.bus, t, degFreq(tn * 2, SCALES.phryg, [0, 0, 1, 0, 4, 0, 1, 0][(s / 2) % 8]), sp * 1.6, 0.05 + 0.1 * tens, { cut: 900 + 1500 * tens });
        if (s === 0 && bar % 4 === 2) brass(p.bus, t, degFreq(tn * 2, SCALES.phryg, bar % 8 === 2 ? 0 : 1), sp * 12, 0.22, { a: 1.0, rel: 0.6, bright: 0.45 });
        if (s === 0) setDrone(p, degFreq(tn, SCALES.phryg, bar % 8 < 4 ? 0 : 1), t);
        if (s === 0 && bar % 2 === 0) pluck(p.bus, t, degFreq(tn * 4, SCALES.phryg, [4, 3, 1, 0][(bar / 2) % 4 | 0] + 0), 0.1, { dur: 2.4, bright: 0.3 });
      },
    },
    arena: {
      bpm: () => 100 + 24 * curInt, tonic: NOTE(40), // E2
      init(p) { p.drone = makeDrone(p, NOTE(40), 0.18); },
      bar(p, bar, t) { const ph = Math.floor(bar / 4); p.r = mulberry(hash(seed, 'arena', ph)); p.stab = [[0, 6, 10], [0, 3, 6, 10], [0, 4, 8, 12], [0, 7, 10, 14]][Math.floor(p.r() * 4)]; p.ost = Array.from({ length: 8 }, () => [0, 0, 0, 1, 4, 2][Math.floor(p.r() * 6)]); p.chordDeg = [0, 0, 5, 1][bar % 4]; },
      step(p, s, t, sp) {
        const I = curInt, bar = p.bar, tn = MODES.arena.tonic, sc = SCALES.phrygDom;
        const gDr = 0.5 + 0.5 * I;
        if (s === 0 || s === 8) { drumHit(p.bus, t, 70, 0.95 * gDr, { tymp: 1, dec: 0.8 }); L(p, t, 'drum'); }
        if ((s === 4 || s === 12) && I > 0.22) { drumHit(p.bus, t, 78, 0.7 * gDr * sstep(0.22, 0.45, I), { dec: 0.4, skin: 1 }); L(p, t, 'drum2'); }
        if (s % 4 === 2 && I > 0.5) drumHit(p.bus, t, 100, 0.4 * sstep(0.5, 0.75, I), { dec: 0.2, skin: 1 });
        if (I > 0.78 && (s >= 12 || (bar % 4 === 3 && s >= 8)) && s % 1 === 0) drumHit(p.bus, t, 70 + (s - 8) * 4, 0.3 * sstep(0.78, 0.95, I), { dec: 0.15 }); // 16th roll pickup
        if (s % 2 === 0) strings(p.bus, t, degFreq(tn * 4, sc, p.ost[(s / 2) % 8]), sp * 1.7, (0.07 + 0.08 * (s % 4 === 0)) * (0.3 + 0.7 * sstep(0.1, 0.55, I)), { cut: 900 + 2600 * I }), L(p, t, 'ost');
        if (I > 0.3 && p.stab.includes(s)) { const g = 0.38 * sstep(0.3, 0.6, I), r = degFreq(tn * 2, sc, p.chordDeg); brass(p.bus, t, r, sp * 1.8, g, { a: 0.012, rel: 0.1, bright: 1.1 }); brass(p.bus, t, r * 1.4983, sp * 1.8, g * 0.7, { a: 0.012, rel: 0.1 }); if (I > 0.7) brass(p.bus, t, r * 2, sp * 1.8, g * 0.6, { a: 0.012, rel: 0.1 }); L(p, t, 'brass'); }
        if (s === 0 && I > 0.55 && bar % 2 === 0) { const g = 0.07 * sstep(0.55, 0.85, I); [0, 2, 4].forEach((d) => strings(p.bus, t, degFreq(tn * 4, sc, p.chordDeg + d), sp * 30, g, { a: 0.9, rel: 0.9, cut: 2400 })); }
        if (s === 0 && bar % 8 === 0 && I > 0.6) crash(p.bus, t, 0.14);
        if (s === 0) { setDrone(p, degFreq(tn, sc, p.chordDeg), t); if (bar % 2 === 0) pluck(p.bus, t, degFreq(tn * 2, sc, p.chordDeg + 4), 0.12, { dur: 2.4, bright: 0.3 }); }
        if (p.drone) p.drone.g.gain.setTargetAtTime(0.1 + 0.18 * I, t, 0.3);
      },
    },
    victory: {
      bpm: () => 112, tonic: NOTE(50), // D3 major
      init(p) { p.drone = makeDrone(p, NOTE(38), 0.1); p.drone.g.gain.value = 0; },
      bar(p, bar, t) {
        p.r = mulberry(hash(seed, 'victory', Math.floor(bar / 4)));
        if (bar === 0) { const sp = 60 / 112 / 4; const f = NOTE(62); [[0, 2, 0], [2.5, 1.5, 0], [4, 2, 4], [6, 2, 7], [8, 8, 12]].forEach(([st, du, sm], i) => { brass(p.bus, t + st * sp, f * Math.pow(2, sm / 12), du * sp, 0.55, { a: 0.02 }); brass(p.bus, t + st * sp, f * Math.pow(2, (sm + 7) / 12) * 0.5, du * sp, 0.3, { a: 0.03 }); }); drumHit(p.bus, t, 70, 0.9, { tymp: 1, dec: 0.9 }); for (let i = 0; i < 16; i++) drumHit(p.bus, t + i * sp, 84, 0.25 + i * 0.03, { tymp: 1, dec: 0.2 }); crash(p.bus, t + 8 * sp, 0.3, 2.2); crash(p.bus, t + 16 * sp, 0.12, 1.5); L(p, t, 'stinger'); }
        p.prog = [[0, 3, 4, 0], [0, 4, 5, 3], [0, 5, 3, 4]][Math.floor(p.r() * 3)];
      },
      step(p, s, t, sp) {
        const bar = p.bar, tn = MODES.victory.tonic, sc = SCALES.major;
        if (bar < 1) return;
        const deg = p.prog[bar % 4], ch = [deg, deg + 2, deg + 4, deg + 7];
        if (s === 0) { p.drone.g.gain.setTargetAtTime(0.12, t, 0.3); setDrone(p, degFreq(tn / 2, sc, deg), t); }
        pluck(p.bus, t, degFreq(tn * 2, sc, ch[[0, 1, 2, 3, 2, 1, 3, 2][s % 8]]), s % 2 ? 0.11 : 0.19, { bright: 0.6 });
        if (s === 0 || s === 8) drumHit(p.bus, t, 78, 0.8, { tymp: 1, dec: 0.5 });
        if (s === 4 || s === 12) drumHit(p.bus, t, 95, 0.5, { skin: 1, dec: 0.3 });
        if (s % 2 === 0) shaker(p.bus, t, 0.07);
        if ((s === 0 || s === 6 || s === 10) && bar % 2 === 0) { brass(p.bus, t, degFreq(tn * 2, sc, deg + [0, 4, 2][[0, 6, 10].indexOf(s)]), sp * 3, 0.3, { a: 0.02 }); L(p, t, 'brass'); }
        if (s === 0 && bar % 4 === 2) flute(p.bus, t, degFreq(tn * 4, sc, deg + 4), sp * 6, 0.12);
        if (s === 0 && bar % 8 === 2) crash(p.bus, t, 0.1);
      },
    },
    defeat: {
      bpm: () => 58, tonic: NOTE(50), // D3 minor
      init(p) { p.drone = makeDrone(p, NOTE(38), 0.18); },
      bar(p, bar, t) { p.r = mulberry(hash(seed, 'defeat', Math.floor(bar / 4))); p.prog = [[0, -2, -1, 0], [0, 3, -2, 0], [0, -3, -2, -1]][Math.floor(p.r() * 3)]; p.mel = Array.from({ length: 4 }, () => [4, 3, 2, 1, 0][Math.floor(p.r() * 5)]); },
      step(p, s, t, sp) {
        const bar = p.bar, tn = MODES.defeat.tonic, sc = SCALES.aeolian, deg = p.prog[bar % 4];
        if (s === 0) { setDrone(p, degFreq(tn / 2, sc, deg), t); drumHit(p.bus, t, 62, 0.55, { tymp: 1, dec: 1.0 }); pluck(p.bus, t, degFreq(tn, sc, deg), 0.2, { dur: 2.6, bright: 0.25 }); L(p, t, 'drum'); }
        if (s === 8 && bar % 2) drumHit(p.bus, t, 62, 0.25, { tymp: 1, dec: 0.6 });
        if (s % 4 === 0 && s) pluck(p.bus, t, degFreq(tn * 2, sc, deg + [2, 4, 1, 0][s / 4 % 4 | 0]), 0.1, { bright: 0.3, dur: 2 });
        if (s === 0 && bar % 2 === 0) flute(p.bus, t + sp * 2, degFreq(tn * 2, sc, deg + 7 + p.mel[(bar / 2) % 4 | 0]), sp * 11, 0.13);
        if (s === 0 && bar % 4 === 0) strings(p.bus, t, degFreq(tn, sc, deg + 4), sp * 60, 0.05, { a: 1.5, rel: 1.5, cut: 700 });
      },
    },
  };
  function makeDrone(p, f, g) {
    const out = ctx.createGain(); out.gain.value = g; out.connect(p.bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.8; lp.connect(out);
    const os = [['sawtooth', 1, -6, 0.5], ['sawtooth', 1, 7, 0.5], ['sine', 1.5, 0, 0.3], ['sine', 1, 0, 0.5]].map(([ty, m, dt, gg]) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f * m; o.detune.value = dt; const x = G(gg); o.connect(x); x.connect(lp); o.start(ctx.currentTime); return { o, m }; });
    return { g: out, os, f };
  }
  function setDrone(p, f, t) { if (!p.drone) return; p.drone.os.forEach(({ o, m }) => { o.frequency.setTargetAtTime(f * m, t, 0.25); }); }

  function newPlayer(mode, t) {
    const M = MODES[mode], bus = ctx.createGain(); bus.gain.value = 0; bus.connect(musicBus);
    const p = { mode, M, bus, next: t, step: 0, bar: 0, startT: t, stopped: false, oscs: [] };
    M.init(p); return p;
  }
  function pump(until) {
    if (!ready) return;
    for (const p of players.slice()) {
      let guard = 0;
      while (p.next < until && !p.stopped && guard++ < 400) {
        const s = p.step % 16, sp = 60 / p.M.bpm(p) / 4;
        curInt += (intensityTarget - curInt) * 0.12;
        if (s === 0) { p.bar = Math.floor(p.step / 16); p.M.bar(p, p.bar, p.next); }
        const swing = (p.mode === 'ludus' && s % 2 === 1) ? sp * 0.12 : 0;
        try { p.M.step(p, s, p.next + swing, sp); } catch (e) { /* keep scheduling */ }
        p.next += sp; p.step++;
      }
      if (p.endT != null && p.endT < ctx.currentTime - 0.1) disposePlayer(p);
    }
  }
  function disposePlayer(p) {
    p.stopped = true; const i = players.indexOf(p); if (i >= 0) players.splice(i, 1);
    try { if (p.drone) p.drone.os.forEach(({ o }) => o.stop(ctx.currentTime + 0.01)); p.bus.disconnect(); } catch (e) { /* ignore */ }
  }
  function startPump() { if (pumpTimer || OFFLINE) return; pumpTimer = setInterval(() => { if (ctx && ctx.state === 'running') pump(ctx.currentTime + 0.3); }, 45); }

  music.setMode = (mode, o = {}) => {
    if (mode === 'off' || mode == null) return music.stop(o.fade);
    if (!MODES[mode] || !ensure()) return false;
    if (mode === curMode && players.length && !o.restart) return true;
    const t = o.at != null ? o.at : ctx.currentTime + 0.06, fade = o.fade == null ? 1.5 : o.fade;
    for (const p of players) { // fade out the old ones
      const g = p.bus.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); p.endT = t + fade + 0.5; p.stopAt = t + fade;
      if (p.drone) p.drone.os.forEach(({ o: os }) => { try { os.stop(t + fade + 0.1); } catch (e) { /* ignore */ } });
    }
    // old players keep scheduling only until fade ends
    players.forEach((p) => { p.next = Math.min(p.next, t + fade); });
    const np = newPlayer(mode, t); np.bus.gain.setValueAtTime(0, t);
    np.bus.gain.linearRampToValueAtTime(1, t + (mode === 'victory' || mode === 'defeat' ? Math.min(fade, 0.3) : fade));
    players.push(np); curMode = mode; startPump(); pump(t + 0.3);
    return true;
  };
  music.stop = (fade = 1.2) => {
    if (!ready) return; const t = ctx.currentTime;
    for (const p of players) { const g = p.bus.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); p.endT = t + fade + 0.3; if (p.drone) p.drone.os.forEach(({ o }) => { try { o.stop(t + fade + 0.1); } catch (e) { /* ignore */ } }); p.next = Infinity; }
    curMode = null;
  };
  music.setHubTime = (hour, night) => { const h = +hour || 12; hubTod.tn = clamp(+night || 0, 0, 1); hubTod.td = clamp(Math.min(1, (h - 16.5) / 2) * (1 - hubTod.tn), 0, 1); hubTod.tdawn = clamp(1 - Math.abs(h - 6.8) / 1.6, 0, 1) * (1 - hubTod.tn * 0.5); };
  music.hubTod = hubTod;
  music.setIntensity = (x) => { intensityTarget = clamp(+x || 0, 0, 1); };
  music.getIntensity = () => intensityTarget;
  music.mode = () => curMode;
  music.pump = pump;
  music.seed = (s) => { seed = s >>> 0; rng = mulberry(seed ^ 0x9e3779b9); };

  // ---------- ludus ambience (HUB-AUDIO): beds (wind, distant crowd, crickets, rain), birds, owls, and spatial workshops near the camera focus ----------
  // audio.ambient.update({hour, night, weather, rain, wind, zoom, focus:[{kind,w,pan}], glads, spar, drill, fest}) every ~0.25 s from the hub. Silent no-op until the context runs.
  const ambient = (() => {
    let bedN = null, on = false, last = 0, sched = {}, st = null;
    const mkBed = () => {
      const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0.0001; out.connect(crowdBus);
      const mk = (kind, type, f, q) => { const sr = ctx.createBufferSource(); sr.buffer = noiseBuf[kind]; sr.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gg = G(0); sr.connect(fl); fl.connect(gg); gg.connect(out); sr.start(t, rng() * 2); return { sr, fl, gg }; };
      const wind = mk('pink', 'bandpass', 380, 0.6), crowdB = mk('pink', 'bandpass', 620, 0.8), rainB = mk('white', 'bandpass', 6200, 0.5), hiss = mk('white', 'highpass', 7000, 0.4);
      const sw = ctx.createOscillator(), swg = G(0.35); sw.frequency.value = 0.09; sw.connect(swg); swg.connect(wind.gg.gain); sw.start(t);
      const sw2 = ctx.createOscillator(), swg2 = G(0.3); sw2.frequency.value = 0.17; sw2.connect(swg2); swg2.connect(crowdB.gg.gain); sw2.start(t);
      // crickets: a 4.7 kHz tone chopped at 15 Hz with a slow 2 s pulse
      const cr = ctx.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4700; const am = ctx.createGain(); am.gain.value = 0; const lfo = ctx.createOscillator(); lfo.frequency.value = 15; const lg = G(0.5); lfo.connect(lg); lg.connect(am.gain);
      const pulse = ctx.createOscillator(), pg = G(0.35); pulse.frequency.value = 0.5; pulse.connect(pg); pg.connect(am.gain); const cg = G(0); cr.connect(am); am.connect(cg); cg.connect(out); [cr, lfo, pulse].forEach((o) => o.start(t));
      return { out, wind, crowdB, rainB, hiss, cg };
    };
    const tc = (p, v, t, k = 0.8) => p.setTargetAtTime(v, t, k);
    const rate = (key, perSec, dt) => { const k = (sched[key] = (sched[key] || 0) + perSec * dt); if (k >= 1) { sched[key] = k - 1 - rng() * 0.5; return true; } return false; };
    return {
      get on() { return on; },
      start() { if (on || !ensure()) return false; if (!OFFLINE && ctx.state !== 'running') return false; bedN = mkBed(); on = true; last = ctx.currentTime; return true; },
      stop() { if (!on) return; const b = bedN, t = ctx.currentTime; on = false; bedN = null; try { tc(b.out.gain, 0.0001, t, 0.3); setTimeout(() => { try { b.out.disconnect(); } catch (e) { /* ignore */ } }, 2500); } catch (e) { /* ignore */ } },
      thunder(delay = 1) { if (on) sfx('thunder', { when: ctx.currentTime + delay, gain: 0.8 }); },
      update(state) {
        st = state || st || {}; if (!on && !this.start()) return; const t = ctx.currentTime, dt = Math.min(1, Math.max(0.05, t - last)); last = t;
        const n = clamp(st.night || 0, 0, 1), day = 1 - n, rain = clamp(st.rain || 0, 0, 1), wx = st.weather, zoom = clamp(st.zoom || 0, 0, 1), fest = st.fest ? 1 : 0;
        music.setHubTime(st.hour, n);
        const windK = clamp(((st.wind || 1) - 0.8) / 1.8, 0, 1) * 0.6 + (wx === 'dust' ? 0.5 : 0);
        tc(bedN.out.gain, 0.5 + 0.5 * (1 - zoom * 0.3), t);
        tc(bedN.wind.gg.gain, 0.05 + 0.18 * windK + 0.04 * rain, t); tc(bedN.wind.fl.frequency, 300 + 500 * windK, t);
        tc(bedN.crowdB.gg.gain, (0.016 + 0.012 * Math.min(8, st.glads || 0) / 8 + 0.04 * fest) * (0.4 + 0.6 * day), t);
        tc(bedN.rainB.gg.gain, 0.2 * rain, t); tc(bedN.hiss.gg.gain, 0.05 * rain, t);
        tc(bedN.cg.gain, n > 0.5 && rain < 0.4 ? 0.014 * n : 0, t, 1.5);
        // birds by day (more at dawn and dusk), an owl at night
        const birdy = day * (wx === 'rain' ? 0.1 : 1) * (0.5 + 0.5 * Math.max(clamp(1 - Math.abs((st.hour || 12) - 7) / 2), clamp(1 - Math.abs((st.hour || 12) - 18) / 2)));
        if (rate('bird', 0.55 * birdy, dt)) sfx('bird', { kind: Math.floor(rng() * 4), pan: (rng() - 0.5) * 1.4, gain: 0.5 + rng() * 0.6, pitch: 0.9 + rng() * 0.3 });
        if (rate('owl', 0.05 * n, dt) && wx !== 'rain') sfx('owl', { pan: (rng() - 0.5) * 1.2, gain: 0.6 });
        if (rate('clinkfar', 0.16 * day, dt)) sfx('clink', { pan: (rng() - 0.5) * 1.5, gain: 0.18 + 0.1 * rng(), pitch: 0.8 + rng() * 0.5 });
        // workshops: only the ones near the camera focus, panned to where they are
        for (const f of st.focus || []) {
          const w = clamp(f.w, 0, 1); if (w < 0.08) continue; const o = { pan: f.pan || 0 };
          if (f.kind === 'forge') {   // 4 strikes, a breath, again; events are queued up to 0.35 s ahead
            if (!(sched.forgeAt > t - 0.5)) sched.forgeAt = t + 0.05;
            while (sched.forgeAt < t + 0.35) { const wh = Math.max(sched.forgeAt, t + 0.02); sfx('hammer', Object.assign({ gain: 0.45 + 0.7 * w, pitch: 0.92 + rng() * 0.2, when: wh }, o)); sched.forgeN = ((sched.forgeN || 0) + 1) % 4; if (sched.forgeN === 2 && rng() < 0.4) sfx('sizzle', Object.assign({ gain: 0.35 * w, when: wh + 0.3 }, o)); sched.forgeAt = wh + (sched.forgeN === 0 ? 1.4 + rng() * 0.9 : 0.58); }
          } else if (f.kind === 'kitchen') {
            if (rate('chop', 0.5 * w, dt)) for (let i = 0; i < 4; i++) sfx('chop', Object.assign({ gain: 0.4 + 0.6 * w, pitch: 0.95 + rng() * 0.15, when: t + 0.3 + i * 0.17 }, o));
            if (rate('sizz', 0.12 * w, dt)) sfx('sizzle', Object.assign({ gain: 0.6 * w }, o));
            if (rate('pot', 0.2 * w, dt)) sfx('clink', Object.assign({ gain: 0.5 * w, pitch: 0.6 + rng() * 0.3 }, o));
          } else if (f.kind === 'yard') {
            const act = (st.drill || 0) + 2 * (st.spar || 0);
            if (rate('thock', (0.25 + 0.2 * Math.min(4, act)) * w, dt)) sfx('thock', Object.assign({ gain: 0.5 + 0.7 * w, pitch: 0.85 + rng() * 0.3 }, o));
            if (rate('grunt', 0.12 * w * Math.min(3, act), dt)) sfx('grunt', Object.assign({ gain: 0.3 * w, voice: Math.floor(rng() * 4) }, o));
            if (rate('foot', 0.5 * w, dt)) sfx('footstep', Object.assign({ gain: 0.3 * w }, o));
          } else if (f.kind === 'market') {
            if (rate('coin', 0.15 * w * day, dt)) sfx('coin', Object.assign({ gain: 0.25 * w }, o));
            if (rate('mclink', 0.3 * w * day, dt)) sfx('clink', Object.assign({ gain: 0.4 * w }, o));
          } else if (f.kind === 'bath') { if (rate('drip', 0.9 * w, dt)) sfx('clink', Object.assign({ gain: 0.18 * w, pitch: 1.6 + rng() * 0.8 }, o)); }
        }
      },
    };
  })();
  // ui hooks: hover tick and tap for buttons under `root` (idempotent). Taps are off by default because game.open/ask already play uiTap.
  function attachUi(root, o = {}) {
    if (!root || root.__lxAudioUi || typeof root.addEventListener !== 'function') return false; root.__lxAudioUi = true; let lastH = 0;
    const SEL = 'button, .lx-btn, [role="button"], .lx-nav-item';
    if (o.hover !== false) root.addEventListener('pointerover', (e) => { if (e.pointerType && e.pointerType !== 'mouse') return; const el = e.target && e.target.closest && e.target.closest(SEL); if (!el || el.disabled || (e.relatedTarget && el.contains(e.relatedTarget))) return; const now = performance.now(); if (now - lastH < 90) return; lastH = now; sfx('uiHover'); }, true);
    if (o.tap) root.addEventListener('pointerdown', (e) => { const el = e.target && e.target.closest && e.target.closest(SEL); if (el && !el.disabled) sfx('uiTap'); }, true);
    return true;
  }

  // ---------- public ----------
  const api = {
    sfxNames: SFX_NAMES.slice(), musicModes: MUSIC_MODES.slice(), music, sfx, crowd, duck, ambient, attachUi,
    ui: { hover: () => sfx('uiHover'), tap: () => sfx('uiTap'), select: () => sfx('uiSelect'), open: () => sfx('uiOpen'), close: () => sfx('uiClose') },
    unlock() { if (!ensure()) return Promise.resolve(false); try { const p = ctx.resume(); return Promise.resolve(p).then(() => ctx.state === 'running').catch(() => false); } catch (e) { return Promise.resolve(false); } },
    setMaster(v) { vol.master = clamp(v, 0, 1); if (ready) master.gain.setTargetAtTime(vol.master, ctx.currentTime, 0.02); },
    setMusic(v) { vol.music = clamp(v, 0, 1); if (ready) musicBus.gain.setTargetAtTime(vol.music * MUSIC_TRIM, ctx.currentTime, 0.02); },
    setSfx(v) { vol.sfx = clamp(v, 0, 1); if (ready) { sfxBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.02); crowdBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.02); } },
    get ctx() { return ctx; }, get analyser() { return analyser; }, get supported() { return !dead; }, get state() { return ctx ? ctx.state : 'none'; },
    suspend() { try { return ctx && ctx.suspend(); } catch (e) { return null; } },
    resume: tryResume,
    _ready: ensure,
  };
  if (OFFLINE) ensure();
  return api;
}
