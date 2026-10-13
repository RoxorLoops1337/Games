// Ludus Maximus 3D: procedural audio engine (Web Audio only, zero files).
// createAudio(opts) -> { unlock, setMaster/Music/Sfx, sfx, crowd, duck, setScene, setListener, music{...}, ambient, attachUi, ... }
//   opts.ctx     : pass an (Offline)AudioContext to render deterministically (tests); otherwise one is created on unlock()
//   opts.seed    : seed for music variation and sfx randomness
//   opts.log     : keep a music event log in audio.music.log (tests)
//   opts.now     : () => seconds, replaces ctx.currentTime as the engine clock (offline simulations of a live fight)
//   opts.enforce : apply voice caps / retrigger guard also on an offline context (so a simulated fight behaves like a live one)
// Degrades silently (every method is a safe no-op) when no AudioContext exists (Node, old browsers).
// Mix: sources -> sfx/music/crowd buses -> master -> makeup -> glue compressor -> soft clip -> safety limiter -> destination, loudness target about -16 LUFS in a busy fight.
// No em dashes. Reference lab: lab/audio_lab.html, verifier + report: tools/ludus3d_audio_check.mjs.

export const SFX_NAMES = ['swordHit', 'swordHitCrit', 'shieldBlock', 'metalClang', 'swish', 'swishHeavy', 'miss', 'grunt', 'hurt', 'deathCry', 'deathThud',
  'footstep', 'dust', 'netThrow', 'spearThrust', 'bash', 'stunChime', 'healSparkle', 'levelUp', 'coin', 'uiTap', 'uiConfirm', 'uiError', 'gate', 'horn',
  'ultFire', 'ultLightning', 'ultEarth', 'ultWind', 'ultHoly', 'crowdGasp', 'crowdCheer', 'crowdRoar', 'crowdBoo', 'crowdChant', 'drum',
  'slashWet', 'crunch', 'boneSnap', 'spurt', 'splat', 'gibThud', 'crowdGore',
  'uiHover', 'uiSelect', 'uiOpen', 'uiClose', 'bird', 'owl', 'hammer', 'clink', 'chop', 'sizzle', 'thock', 'thunder',   // HUB-AUDIO: ui hooks and ludus ambience one-shots
  'beastRoar', 'beastHowl', 'beastGrowl', 'beastHurt', 'beastDeath', 'beastBite', 'beastClaw', 'beastGore', 'beastSlam', 'pawThud', 'beastSnort', 'beastCharge',
  'parry'];
export const MUSIC_MODES = ['ludus', 'prep', 'arena', 'victory', 'defeat', 'title', 'results', 'season', 'elegy', 'beast', 'boss'];

const MUSIC_TRIM = 0.4;       // music bus trim; music sits about 6 dB under the combat sfx at equal slider positions
const MAKEUP = 1.0;           // loudness calibration before the glue compressor (tools/ludus3d_audio_check.mjs prints the fight LUFS)
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
  aeolian: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
};
const degFreq = (tonic, scale, deg) => { const n = scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n; return tonic * Math.pow(2, (scale[i] + 12 * o) / 12); };
// triad / seventh stacked in thirds inside the scale (modal harmony stays diatonic)
const chordDeg = (tonic, scale, root, n = 3) => Array.from({ length: n }, (_, i) => degFreq(tonic, scale, root + 2 * i));
// explicit chord from semitone offsets above a root frequency
const chordSemi = (rootF, ivs) => ivs.map((s) => rootF * Math.pow(2, s / 12));
const MIN = [0, 3, 7], MAJ = [0, 4, 7], DIM = [0, 3, 6], SUS2 = [0, 2, 7], MIN7 = [0, 3, 7, 10], DOM7 = [0, 4, 7, 10];
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

// sfx categories: voice caps keep the CPU flat in a long brawl
const CAP = { combat: 12, voice: 6, crowd: 3, ui: 5, amb: 8, big: 4, beast: 5, gore: 6 };
const catOf = (n) => /^ui/.test(n) ? 'ui' : /^crowd(?!Gore)/.test(n) ? 'crowd' : /^beast|^pawThud/.test(n) ? 'beast' : /^(bird|owl|hammer|clink|chop|sizzle|thock|thunder)$/.test(n) ? 'amb'
  : /^(grunt|hurt|deathCry)$/.test(n) ? 'voice' : /^ult|^gate$|^horn$|^levelUp$/.test(n) ? 'big' : /^(slashWet|crunch|boneSnap|spurt|splat|gibThud|crowdGore)$/.test(n) ? 'gore' : 'combat';
// the crowd bed swells with these (amount 0..1 of a kick)
const CROWD_KICK = { swordHitCrit: 0.35, deathThud: 0.5, deathCry: 0.2, ultFire: 0.4, ultLightning: 0.4, ultEarth: 0.45, ultWind: 0.3, ultHoly: 0.3, bash: 0.15, boneSnap: 0.25, crowdGore: 0.4, beastRoar: 0.3, beastSlam: 0.2, beastDeath: 0.4, spurt: 0.1, levelUp: 0.2 };

export function createAudio(opts = {}) {
  const Ctor = typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null;
  const OFFLINE = !!opts.ctx;
  const ENFORCE = !OFFLINE || !!opts.enforce;
  let ctx = opts.ctx || null, ready = false, dead = !OFFLINE && !Ctor;
  const NOW = () => (opts.now ? opts.now() : ctx.currentTime);
  let seed = opts.seed == null ? 1337 : opts.seed >>> 0;
  let rng = mulberry(seed);
  const vol = { master: 0.9, music: 0.7, sfx: 0.9 };
  let analyser, master, makeup, comp, limiter, clip, musicBus, musicDuck, sfxBus, crowdBus, revIn, hallConv, openConv, hallG, openG, revMusic, revCrowd, revSendG;
  const noiseBuf = {};     // white/pink/brown 3s buffers
  const ksCache = new Map();
  const lastHit = {};
  const errs = { n: 0, last: '' };   // swallowed exceptions, surfaced through _stats() so tests can see them
  // per-trigger variation context read by the synthesis helpers: j pitch/filter jitter, b brightness (velocity), rr round-robin index, plus weapon/armor/surface choices
  const cur = { j: 1, b: 1, rr: 0, vel: 1, weapon: 'sword', armor: 'leather', surface: 'sand' };
  let userSuspended = false, scene = 'arena', sceneLock = false;
  const SCENES = { arena: { hall: 1, open: 0, send: 1 }, hub: { hall: 0.1, open: 1, send: 0.85 }, indoor: { hall: 0.6, open: 0.3, send: 1 } };

  // ---------- graph ----------
  function ensure() {
    if (ready) return true;
    if (dead) return false;
    try {
      if (!ctx) ctx = new Ctor({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = vol.master;
      makeup = ctx.createGain(); makeup.gain.value = MAKEUP;
      comp = ctx.createDynamicsCompressor();       // glue
      comp.threshold.value = -18; comp.knee.value = 16; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.24;
      limiter = ctx.createDynamicsCompressor();    // fast safety limiter
      limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.09;
      clip = ctx.createWaveShaper(); const cv = new Float32Array(2049); for (let i = 0; i < cv.length; i++) cv[i] = Math.tanh((i / 1024 - 1) * 1.0); clip.curve = cv; try { clip.oversample = '2x'; } catch (e) { /* ignore */ }
      const trim = ctx.createGain(); trim.gain.value = 0.94;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 22; hp.Q.value = 0.6;   // DC and subsonic rumble waste headroom
      master.connect(hp); hp.connect(makeup); makeup.connect(comp); comp.connect(limiter); limiter.connect(clip); clip.connect(trim); trim.connect(ctx.destination);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; trim.connect(analyser); // meter tap
      musicDuck = ctx.createGain(); musicBus = ctx.createGain(); musicBus.gain.value = vol.music * MUSIC_TRIM;
      musicBus.connect(musicDuck); musicDuck.connect(master);
      // gentle stereo width for music: two quiet, panned, slightly delayed copies (Haas) keep mono compatibility
      for (const [dly, pn] of [[0.019, -0.75], [0.027, 0.75]]) { const d = ctx.createDelay(0.1); d.delayTime.value = dly; const g = G(0.17); musicDuck.connect(d); d.connect(g); if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pn; g.connect(p); p.connect(master); } else g.connect(master); }
      sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
      crowdBus = ctx.createGain(); crowdBus.gain.value = vol.sfx; crowdBus.connect(master);
      // two spaces: stone hall (arena) and open air with building slap (hub). Scenes crossfade between them.
      revIn = G(1); revSendG = revIn;
      hallConv = ctx.createConvolver(); hallConv.buffer = makeIR(2.3, 'hall'); hallG = G(0.8); revIn.connect(hallConv); hallConv.connect(hallG); hallG.connect(master);
      openConv = ctx.createConvolver(); openConv.buffer = makeIR(1.1, 'open'); openG = G(0); revIn.connect(openConv); openConv.connect(openG); openG.connect(master);
      revMusic = G(vol.music * MUSIC_TRIM); revMusic.connect(revIn);   // music reverb: stems send into it, so it follows the music slider
      revCrowd = G(0.18); crowdBus.connect(revCrowd); revCrowd.connect(revIn);
      for (const k of ['white', 'pink', 'brown']) noiseBuf[k] = makeNoise(k, 3);
      ready = true; applyScene(scene, 0);
      try { ctx.onstatechange = () => { if (ctx.state === 'interrupted' || (ctx.state === 'suspended' && !userSuspended && !(typeof document !== 'undefined' && document.hidden))) tryResume(); }; } catch (e) { /* ignore */ }
      if (typeof document !== 'undefined' && !OFFLINE) {
        document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) { try { ctx.suspend().catch(() => {}); } catch (e) { /* ignore */ } } else if (!userSuspended) tryResume(); });
        // iOS/Safari can drop to suspended/interrupted after a call or a tab switch: any later gesture revives the context (unless the game paused it on purpose)
        for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, () => { if (!userSuspended && ctx && ctx.state !== 'running' && ctx.state !== 'closed') tryResume(); }, { capture: true, passive: true });
      }
      return true;
    } catch (e) { dead = true; return false; }
  }
  function tryResume() { try { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') return ctx.resume(); } catch (e) { /* ignore */ } }
  function applyScene(name, fade = 0.8) {
    const c = SCENES[name] || SCENES.arena; scene = SCENES[name] ? name : 'arena'; if (!ready) return;
    const t = NOW(), k = Math.max(0.001, fade / 3);
    hallG.gain.setTargetAtTime(0.8 * c.hall, t, k); openG.gain.setTargetAtTime(0.9 * c.open, t, k); revIn.gain.setTargetAtTime(c.send, t, k);
  }
  function makeIR(sec, kind) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), r = mulberry(kind === 'hall' ? 99 : 1234), hall = kind === 'hall';
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, e = hall ? Math.pow(1 - i / n, 3.2) * Math.exp(-t * 1.1) : Math.pow(1 - i / n, 2) * Math.exp(-t * 3.2);
        const k = hall ? 0.55 - 0.5 * Math.min(1, t / sec) : 0.42 - 0.3 * Math.min(1, t / sec); // progressively darker
        lp += ((r() * 2 - 1) - lp) * k;
        d[i] = lp * e * (t < (hall ? 0.028 : 0.012) ? 0 : 1);          // predelay
      }
      if (hall) for (let k = 0; k < 7; k++) { const at = Math.floor(sr * (0.03 + r() * 0.09)); d[at] += (r() < 0.5 ? -1 : 1) * (0.5 - k * 0.05); } // early reflections
      else for (let k = 0; k < 5; k++) { const at = Math.floor(sr * (0.05 + r() * 0.16)); d[at] += (r() < 0.5 ? -1 : 1) * (0.42 - k * 0.06); } // building slap
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
    const s = ctx.createOscillator(); s.type = type; s.frequency.setValueAtTime(f * cur.j, t);
    if (o.f1) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1 * cur.j), t + (o.fd || dur));
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
    const fj = cur.j * (o.type === 'highpass' ? 1 : cur.b); f.frequency.setValueAtTime((o.f0 || 1000) * fj, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1 * fj, t + dur);
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
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9;
    const br = o.bright || 1;
    lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.exponentialRampToValueAtTime(Math.min(7500, f * 6 * br), t + (o.a || 0.05) + 0.06); lp.frequency.exponentialRampToValueAtTime(Math.min(6500, f * 3.5 * br), t + dur);
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
  // percussion
  function drumHit(dest, t, f, g, o = {}) {
    const dec = o.dec || 0.38;
    thump(t, f * 1.9, f, dec * 0.7, g, dest);
    if (o.tymp) partials(t, f, [1.504, 1.99, 2.44], [0.35 * g, 0.25 * g, 0.15 * g], dec * 1.6, dest);
    burst(t, 0.05, dest, { type: 'lowpass', f0: 700, f1: 200, g: g * (o.soft ? 0.25 : 0.6) });
    if (o.skin) burst(t, 0.03, dest, { type: 'bandpass', f0: 1800, q: 1.5, g: g * 0.25 });
  }
  function shaker(dest, t, g) { burst(t, 0.045, dest, { type: 'highpass', f0: 5500, q: 0.5, g, a: 0.008 }); }
  function crash(dest, t, g, dur = 1.6) { burst(t, dur, dest, { type: 'highpass', f0: 3500, q: 0.4, g, a: 0.004 }); burst(t, dur * 0.7, dest, { type: 'bandpass', f0: 7200, q: 2, g: g * 0.5, a: 0.004 }); }

  // n random noise spikes through ONE filter and ONE gain (3 nodes instead of 3 per spike): crackle, debris, grit
  function spikes(t, dur, dest, n, o = {}) {
    const f = ctx.createBiquadFilter(); f.type = o.type || 'highpass'; f.Q.value = o.q || 1; const g = ctx.createGain(); g.gain.value = 0;
    noise(o.kind || 'white', t, dur, f); f.connect(g); g.connect(dest);
    for (let i = 0; i < n; i++) { const tt = t + (o.t0 || 0) + rng() * dur, pk = (o.g || 0.25) * (0.3 + 0.7 * rng()), w = o.w || 0.012; f.frequency.setValueAtTime((o.f0 || 3000) + rng() * (o.fr || 3000), tt); g.gain.setValueAtTime(0.00001, tt); g.gain.linearRampToValueAtTime(pk, tt + 0.002); g.gain.exponentialRampToValueAtTime(0.00001, tt + w); }
    return g;
  }

  // ---------- sfx ----------
  // per-sound level (lvl), nominal duration, priority (higher survives voice stealing), duck amount for music, reverb send (wet), max concurrent
  const T = {};
  const def = (name, lvl, dur, pri, wet, duck, max, fn) => { T[name] = { lvl, dur, pri, wet, duck, max, fn, cat: catOf(name) }; };
  const hz = (o, f) => f * (o.pitch || 1);

  // weapon x armour matrix: the weapon sets the transient and ring pitch, the armour sets how much ring, dullness or rattle follows. With no hint the armour round-robins so repeats differ.
  const WEAP = { sword: { f: 1750, dec: 0.28, nf: 3200, th: 170, ring: 1, tg: 0.6 }, spear: { f: 2300, dec: 0.18, nf: 3800, th: 150, ring: 0.7, tg: 0.5 }, axe: { f: 1100, dec: 0.22, nf: 2600, th: 120, ring: 0.8, tg: 0.9 }, mace: { f: 620, dec: 0.16, nf: 1800, th: 105, ring: 0.55, tg: 1.1 }, dagger: { f: 2900, dec: 0.14, nf: 4600, th: 190, ring: 0.6, tg: 0.4 } };
  const ARM = { none: { ring: 0, f: 1, dec: 1, flesh: 1 }, leather: { ring: 0.3, f: 0.9, dec: 0.7, thud: 1 }, bronze: { ring: 1, f: 0.88, dec: 1 }, mail: { ring: 0.65, f: 1.2, dec: 0.8, rattle: 1 }, plate: { ring: 1.2, f: 0.78, dec: 1.5 } };
  def('swordHit', 1.0, 0.7, 2, 0.12, 0, 5, (t, d, o) => {
    const W = WEAP[cur.weapon] || WEAP.sword, A = ARM[cur.armor] || ARM.leather;
    burst(t, 0.09, d, { f0: W.nf * (A.flesh ? 0.55 : 1), f1: 1100, q: 0.9, g: 0.8 });
    if (A.ring > 0) partials(t, hz(o, W.f * A.f), [1, 1.51, 2.37, 3.9], [0.22, 0.16, 0.1, 0.06].map((x) => x * W.ring * A.ring), W.dec * A.dec, d, 'triangle');
    if (A.thud || A.flesh) burst(t, 0.16, d, { type: 'lowpass', f0: 1500, f1: 260, g: A.flesh ? 0.85 : 0.5, kind: 'pink', a: 0.003 });
    if (A.rattle) spikes(t, 0.09, d, 5, { type: 'bandpass', f0: 2600, fr: 2600, q: 3, g: 0.14, w: 0.03, t0: 0.008 });
    thump(t, hz(o, W.th), 62, 0.14 + (W.tg > 1 ? 0.06 : 0), W.tg, d);
    burst(t + 0.002, 0.2, d, { type: 'lowpass', f0: 800, f1: 180, g: 0.3, kind: 'brown', a: 0.002 });   // body
  });
  def('swordHitCrit', 1.0, 1.4, 4, 0.3, 0.45, 3, (t, d, o) => {
    burst(t, 0.12, d, { f0: 4500, f1: 900, q: 0.8, g: 1 });
    partials(t, hz(o, 1420), [1, 1.51, 2.37, 3.9, 5.6], [0.3, 0.22, 0.15, 0.1, 0.06], 0.75, d, 'triangle');
    thump(t, hz(o, 130), 55, 0.4, 1, d);
    burst(t + 0.01, 0.6, d, { type: 'highpass', f0: 6000, g: 0.25, a: 0.01 });
    osc('sawtooth', hz(o, 90), t, 0.25, (() => { const g = G(0); env(g.gain, t, 0.002, 0.25, 0.22); g.connect(d); return g; })(), { f1: 38 });
  });
  def('shieldBlock', 0.95, 0.7, 2, 0.15, 0, 4, (t, d, o) => {
    const bronze = (cur.rr & 1) === 1 || o.material === 'bronze';
    thump(t, hz(o, 230), 95, 0.16, 0.85, d);
    burst(t, 0.1, d, { type: 'lowpass', f0: 1400, f1: 400, g: 0.7 });
    burst(t, 0.05, d, { type: 'bandpass', f0: 1100, q: 1.2, g: 0.35 });                        // leather/wood crack
    partials(t, hz(o, bronze ? 780 : 640), [1, 2.1, 3.4], bronze ? [0.28, 0.18, 0.1] : [0.2, 0.12, 0.06], bronze ? 0.5 : 0.35, d, bronze ? 'triangle' : 'square');
    burst(t + 0.004, 0.25, d, { type: 'lowpass', f0: 600, f1: 140, g: 0.35, kind: 'brown', a: 0.002 });
  });
  def('parry', 0.8, 0.9, 2, 0.25, 0, 4, (t, d, o) => {   // steel on steel: bright strike, a slide of scrape, a ringing tail
    burst(t, 0.03, d, { type: 'highpass', f0: 4200, g: 0.7, a: 0.0008 });
    partials(t, hz(o, 1900), [1, 2.76, 5.4, 8.9], [0.26, 0.2, 0.12, 0.06], 0.55, d, 'sine');
    burst(t + 0.015, 0.13, d, { f0: 2600, f1: 6200, q: 2.4, g: 0.22, a: 0.02 });
    thump(t, 210, 100, 0.09, 0.45, d);
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
  def('footstep', 0.75, 0.3, 0, 0.04, 0, 3, (t, d, o) => {   // heel then toe on sand; four round-robin grain patterns, o.heavy for armoured steps, o.surface 'stone' for a harder click
    const k = cur.rr & 3, stone = o.surface === 'stone', w = o.heavy ? 1.35 : 1, sh = 0.05 + 0.014 * k;
    burst(t, 0.11, d, { type: 'lowpass', f0: (stone ? 3000 : 1400 + 140 * k) * (o.pitch || 1), f1: 330, g: 0.75 * w, kind: 'pink', a: 0.004 });
    burst(t + sh, 0.08, d, { type: 'lowpass', f0: (stone ? 2400 : 1000) * (o.pitch || 1), f1: 280, g: 0.42 * w, kind: 'pink', a: 0.004 });
    const n = stone ? 2 : 3 + (k & 1);
    spikes(t, 0.1, d, n, { type: 'bandpass', f0: 2200, fr: 3200, q: 1.1, g: 0.14, w: 0.028, t0: 0.006 });   // sand grains
    thump(t, 100 * w, 55, 0.07, 0.4 * w, d);
    if (o.heavy || cur.armor === 'plate' || cur.armor === 'mail') partials(t + 0.01, 2400 + rng() * 1800, [1, 2.4], [0.04, 0.025], 0.06, d, 'sine');
  });
  def('dust', 0.45, 0.6, 0, 0.1, 0, 3, (t, d, o) => {
    burst(t, 0.5, d, { type: 'bandpass', f0: 1400, f1: 500, q: 0.5, g: 0.6, a: 0.08, kind: 'pink' });
  });
  def('netThrow', 0.45, 0.8, 2, 0.12, 0, 2, (t, d, o) => {
    burst(t, 0.45, d, { f0: 400, f1: 1800, q: 1.5, g: 0.9, a: 0.2 });
    const g = G(0); env(g.gain, t + 0.05, 0.15, 0.5, 0.45); g.connect(d);
    const am = ctx.createGain(); am.gain.value = 0.5; const lf = ctx.createOscillator(); lf.frequency.value = 34; const lg = G(0.5); lf.connect(lg); lg.connect(am.gain); lf.start(t); lf.stop(t + 0.7);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.8; noise('white', t + 0.05, 0.6, am); am.connect(f); f.connect(g); // rope flutter
    burst(t, 0.5, d, { type: 'lowpass', f0: 220, f1: 600, g: 0.55, a: 0.22, kind: 'brown' }); thump(t + 0.3, 120, 62, 0.22, 0.35, d);   // body of the swing
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
  def('gate', 0.6, 3.8, 3, 0.35, 0.4, 1, (t, d, o) => {
    const dur = 2.6, g = G(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.4); g.gain.setValueAtTime(1, t + dur - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3); g.connect(d);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(140, t); lp.frequency.linearRampToValueAtTime(330, t + dur); lp.Q.value = 2; lp.connect(g);
    const am = ctx.createGain(); am.gain.value = 0.6; const lf = ctx.createOscillator(); lf.frequency.value = 13; const lg = G(0.4); lf.connect(lg); lg.connect(am.gain); lf.start(t); lf.stop(t + dur + 0.4);
    noise('brown', t, dur + 0.3, am); am.connect(lp);
    thump(t, 74, 52, dur, 0.4, d);
    for (let i = 0; i < 8; i++) { const tt = t + 0.2 + rng() * (dur - 0.4); partials(tt, 1800 + rng() * 2500, [1, 2.76], [0.08, 0.05], 0.12, d, 'square'); } // chain links
    thump(t + dur + 0.2, 95, 50, 0.5, 0.9, d); // final slam
    burst(t + dur + 0.2, 0.3, d, { type: 'lowpass', f0: 900, f1: 150, g: 0.6, kind: 'pink' });
  });
  def('horn', 0.75, 3.1, 3, 0.45, 0.5, 1, (t, d, o) => {
    const f = hz(o, 98); // G2 cornu
    brass(d, t, f, 1.5, 0.7, { a: 0.18, rel: 0.5, bright: 0.7 });
    brass(d, t + 1.7, f * 1.5, 0.8, 0.6, { a: 0.12, rel: 0.6, bright: 0.7 }); // call and rising fifth
    brass(d, t, f * 2.003, 1.5, 0.25, { a: 0.2, rel: 0.5, bright: 0.6 });
  });
  const ult = {
    ultFire: (t, d, o) => {
      burst(t, 1.3, d, { type: 'lowpass', f0: 250, f1: 3200, q: 1.5, g: 1, a: 0.5, kind: 'pink' });
      spikes(t + 0.2, 1.0, d, 26, { f0: 2500, fr: 3000, g: 0.25, w: 0.03 }); // crackle
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
      spikes(t + 0.1, 1.2, d, 26, { type: 'bandpass', f0: 300, fr: 1400, q: 3, g: 0.6, w: 0.08 }); // rock debris
    },
    ultWind: (t, d, o) => {
      [0, 0.25, 0.5].forEach((dt, i) => burst(t + dt, 1.1, d, { f0: 500 + i * 250, f1: 2600 - i * 300, q: 6, g: 0.55, a: 0.45 }));
      const g = G(0); env(g.gain, t + 0.1, 0.5, 0.12, 1.0); g.connect(d); osc('sine', 880, t + 0.1, 1.5, g, { f1: 1320 }); // ghost whistle
      burst(t, 1.5, d, { type: 'lowpass', f0: 160, f1: 520, q: 0.8, g: 0.6, a: 0.5, kind: 'brown' }); thump(t + 0.4, 90, 48, 0.7, 0.35, d);   // low body of the gale
    },
    ultHoly: (t, d, o) => {
      [0, 4, 7, 12].forEach((s, i) => voice(t + i * 0.03, 1.8, d, { voice: 3, pitch: Math.pow(2, s / 12) * 0.9, vowel: 'a', g: 0.28, p0: 1, p1: 1.002, a: 0.5, vib: 5, rasp: 0.2, breath: 0.15 }));
      [0, 0.15, 0.3].forEach((dt, i) => partials(t + 0.2 + dt, 1760 * Math.pow(2, [0, 4, 7][i] / 12), [1, 2.01, 3.99], [0.14, 0.06, 0.03], 1.4, d));
      burst(t + 0.4, 1.0, d, { type: 'highpass', f0: 8000, g: 0.05, a: 0.4 });
      partials(t, 110, [1, 2, 3], [0.2, 0.12, 0.06], 1.9, d, 'sine'); partials(t, 165, [1, 2], [0.1, 0.05], 1.9, d, 'sine');   // sub choir drone for body
    },
  };
  for (const k of Object.keys(ult)) def(k, { ultFire: 0.42, ultLightning: 0.55, ultEarth: 0.7, ultWind: 1.0, ultHoly: 0.75 }[k], 2.2, 4, 0.35, 0.55, 2, ult[k]);
  // crowd one-shots: formant-filtered noise + a handful of pitched voices
  function crowdVoices(t, dur, d, n, o) {   // n sawtooth throats share one formant bank and one vibrato: about 2 nodes per voice instead of 12
    const F = VOWEL[o.vowel || 'o'], sum = G(1), q = [5, 7, 9], am = [1.4, 0.7, 0.4];
    F.forEach((fr, i) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fr * (o.fEnd ? 1 : 1); if (o.fEnd) b.frequency.linearRampToValueAtTime(fr * o.fEnd, t + dur); b.Q.value = q[i]; const x = G(am[i]); sum.connect(b); b.connect(x); x.connect(d); });
    const lfo = ctx.createOscillator(), lg = G(0); lfo.frequency.value = 5.5; lg.gain.value = 14 * (o.pitch || 1); lfo.connect(lg); lfo.start(t); lfo.stop(t + dur * 1.3 + 0.1);
    const br = G(0.2 * (o.vg || 0.12) * n); noise('white', t, dur, br); br.connect(sum);
    for (let i = 0; i < n; i++) {
      const st = t + rng() * dur * 0.25, du = dur * (0.55 + rng() * 0.4), f0 = VOICES[i & 1 ? 1 : 0].f0 * (o.pitch || 1) * (0.85 + rng() * 0.8);
      const g = G(0); envASR(g.gain, st, du * 0.3, o.vg || 0.12, du * 0.35, du * 0.35); g.connect(sum);
      const s2 = ctx.createOscillator(); s2.type = 'sawtooth'; s2.frequency.setValueAtTime(f0 * (o.p0 || 1), st); s2.frequency.exponentialRampToValueAtTime(f0 * (o.p1 || 1), st + du); lg.connect(s2.frequency); s2.connect(g); s2.start(st); s2.stop(st + du + 0.05);
    }
  }
  def('crowdShout', 0.5, 1.2, 0, 0.5, 0, 3, (t, d, o) => { crowdVoices(t, 0.8, d, 2, { vowel: o.vowel || 'o', pitch: 0.9, p0: 1.05, p1: 0.92, vg: 0.2 }); });
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
    for (let i = 0; i < 3; i++) { burst(t + i * 0.26, 0.24, d, { f0: 2300, f1: 1100, q: 1.0, g: 0.34 - i * 0.07, a: 0.05 }); burst(t + i * 0.26, 0.2, d, { type: 'lowpass', f0: 700, f1: 300, g: 0.5 - i * 0.1, kind: 'pink', a: 0.04 }); }
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
  def('uiHover', 1.7, 0.08, 0, 0.0, 0, 2, (t, d, o) => { const g = G(0); env(g.gain, t, 0.001, 0.3, 0.05); g.connect(d); osc('sine', hz(o, 1180), t, 0.07, g, { f1: 1500 }); });
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
  def('owl', 0.4, 1.6, 0, 0.45, 0, 1, (t, d, o) => { const b = 400 * (0.88 + rng() * 0.28), gap = 0.5 + rng() * 0.2; [[0, 0.4 + rng() * 0.2], [gap, 0.5 + rng() * 0.25]].forEach(([dt, du], i) => { const e = G(0); env(e.gain, t + dt, 0.08, 0.5 - 0.06 * i, du); e.connect(d); osc('sine', hz(o, b * (1 - 0.05 * i)), t + dt, du + 0.1, e, { f1: b * 0.85 }); osc('sine', hz(o, b * 2), t + dt, du, (() => { const x = G(0.12); x.connect(e); return x; })()); }); });
  def('hammer', 0.85, 0.7, 0, 0.18, 0, 3, (t, d, o) => {   // hammer on an anvil: bright ring over a dull thud
    partials(t, hz(o, 1180), [1, 2.76, 5.4, 8.9], [0.3, 0.22, 0.12, 0.06], 0.5, d, 'triangle'); thump(t, 260, 90, 0.12, 0.4, d); burst(t, 0.03, d, { f0: 3800, q: 0.9, g: 0.5 });
  });
  def('clink', 0.55, 0.4, 0, 0.2, 0, 3, (t, d, o) => { partials(t, hz(o, 2400 + rng() * 900), [1, 2.32, 4.1], [0.22, 0.14, 0.07], 0.22, d, 'sine'); burst(t, 0.02, d, { f0: 5200, q: 1, g: 0.25 }); });   // cups, plates, a chain
  def('chop', 0.7, 0.14, 0, 0.05, 0, 4, (t, d, o) => { burst(t, 0.04, d, { f0: 1500, f1: 700, q: 1.2, g: 0.6 }); thump(t, 320, 150, 0.06, 0.4, d); });
  def('sizzle', 0.28, 1.4, 0, 0.1, 0, 2, (t, d, o) => { burst(t, 1.2, d, { type: 'highpass', f0: 4800, q: 0.4, g: 0.5, a: 0.12, kind: 'white' }); burst(t, 0.9, d, { f0: 2400, q: 0.7, g: 0.25, a: 0.2, kind: 'pink' }); });
  def('thock', 0.75, 0.25, 0, 0.1, 0, 3, (t, d, o) => { thump(t, 380, 160, 0.1, 0.5, d); burst(t, 0.05, d, { f0: 1700, f1: 900, q: 1.1, g: 0.5 }); });   // wooden practice blade on a post
  def('thunder', 0.9, 4.5, 2, 0.5, 0, 1, (t, d, o) => { burst(t, 0.15, d, { f0: 1200, f1: 200, q: 0.6, g: 0.4, kind: 'white' }); burst(t, 3.6, d, { type: 'lowpass', f0: 220, f1: 50, q: 0.7, g: 1.3, a: 0.35, kind: 'brown' }); burst(t + 0.9, 2.4, d, { type: 'lowpass', f0: 140, f1: 45, q: 0.7, g: 0.9, a: 0.5, kind: 'brown' }); });

  // ---- BEAST (Venatio, js/beast_fx.js): procedural animal voices and body sounds. o.kind = lion | wolf | bear | boar | nemean | elephant. All synthesized, no files.
  const bk = (o) => ({ lion: 1, wolf: 2, bear: 3, boar: 4, nemean: 5, elephant: 6 }[o.kind] || 1);
  // a throat: sawtooth with a slow tremolo, shaped by a sweeping band-pass and layered breath noise (lion / bear / nemean growls and roars)
  function growl(t, dur, d, f0, f1, g, o = {}) {
    const out = G(0); envASR(out.gain, t, o.a || 0.04, g, dur * (o.hold || 0.5), dur * (1 - (o.hold || 0.5))); out.connect(d);
    const s1 = ctx.createOscillator(); s1.type = 'sawtooth'; s1.frequency.setValueAtTime(f0, t); s1.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const tr = ctx.createOscillator(), tg = ctx.createGain(); tr.frequency.value = o.trem || 24; tg.gain.value = f0 * (o.depth || 0.06); tr.connect(tg); tg.connect(s1.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q || 2.2; bp.frequency.setValueAtTime(o.cut0 || 600, t); bp.frequency.exponentialRampToValueAtTime(o.cut1 || 300, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 1800; s1.connect(bp); bp.connect(lp); lp.connect(out);
    s1.start(t); s1.stop(t + dur + 0.05); tr.start(t); tr.stop(t + dur + 0.05);
    burst(t, dur, d, { f0: o.cut0 || 700, f1: o.cut1 || 350, q: 1.1, g: g * (o.breath || 0.5), a: 0.05, kind: 'pink' });
  }
  def('beastRoar', 1.0, 1.7, 4, 0.35, 0.2, 2, (t, d, o) => {
    const k = bk(o), big = k === 5 || k === 6;
    if (k === 6) { // trumpet: bright pulsing saw/square through a formant, vibrato, a noisy blast
      const e = G(0); envASR(e.gain, t, 0.06, 0.8, 0.7, 0.5); e.connect(d); const s1 = ctx.createOscillator(); s1.type = 'sawtooth'; s1.frequency.setValueAtTime(380 * (o.pitch || 1), t); s1.frequency.exponentialRampToValueAtTime(640 * (o.pitch || 1), t + 0.35); s1.frequency.exponentialRampToValueAtTime(520 * (o.pitch || 1), t + 1.2);
      const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 9; vg.gain.value = 22; v.connect(vg); vg.connect(s1.frequency); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.6; s1.connect(f); f.connect(e); [s1, v].forEach((x) => { x.start(t); x.stop(t + 1.4); });
      burst(t, 0.9, d, { f0: 900, f1: 1500, q: 1.2, g: 0.5, a: 0.05, kind: 'pink' }); thump(t, 70, 40, 0.4, 0.5, d);
    } else if (k === 4) { growl(t, 0.7, d, 520, 380, 0.7, { trem: 40, depth: 0.12, cut0: 1500, cut1: 900, q: 3 }); }
    else growl(t, big ? 1.6 : 1.2, d, (k === 3 ? 70 : big ? 62 : 85) * (o.pitch || 1), k === 3 ? 48 : 52, 0.95, { trem: k === 3 ? 18 : 24, depth: 0.07, cut0: big ? 520 : 700, cut1: 240, q: 2, hold: 0.55 });
    if (big) thump(t + 0.1, 60, 35, 0.6, 0.45, d);
  });
  def('beastHowl', 0.8, 1.9, 3, 0.55, 0, 2, (t, d, o) => { // wolf: a sung glide with vibrato
    const e = G(0); envASR(e.gain, t, 0.25, 0.55, 1.0, 0.65); e.connect(d); const s1 = ctx.createOscillator(); s1.type = 'triangle'; const b = 420 * (o.pitch || 1) * (0.92 + rng() * 0.2);
    s1.frequency.setValueAtTime(b * 0.8, t); s1.frequency.exponentialRampToValueAtTime(b * 1.45, t + 0.7); s1.frequency.exponentialRampToValueAtTime(b * 1.2, t + 1.9);
    const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 5.5; vg.gain.value = 9; v.connect(vg); vg.connect(s1.frequency); s1.connect(e); [s1, v].forEach((x) => { x.start(t); x.stop(t + 2.0); });
    const h = G(0.25); const s2 = ctx.createOscillator(); s2.type = 'sine'; s2.frequency.setValueAtTime(b * 1.6, t); s2.frequency.exponentialRampToValueAtTime(b * 2.9, t + 0.7); s2.frequency.exponentialRampToValueAtTime(b * 2.4, t + 1.9); s2.connect(h); h.connect(e); s2.start(t); s2.stop(t + 2.0);
    burst(t, 1.8, d, { f0: 1800, q: 1.4, g: 0.05, a: 0.4, kind: 'pink' });
    burst(t, 2.0, d, { type: 'lowpass', f0: 260, f1: 180, q: 0.8, g: 0.22, a: 0.5, kind: 'brown' });   // chest of the howl
  });
  def('beastGrowl', 0.8, 0.8, 2, 0.2, 0, 3, (t, d, o) => { const k = bk(o); growl(t, 0.55, d, (k === 2 ? 130 : k === 3 ? 75 : k === 6 ? 90 : 95) * (o.pitch || 1), 70, 0.8, { trem: 31, depth: 0.1, cut0: k === 2 ? 900 : 650, cut1: 300, q: 2.6, hold: 0.4 }); });
  def('beastHurt', 0.9, 0.7, 3, 0.18, 0, 3, (t, d, o) => {
    const k = bk(o);
    if (k === 2) { const e = G(0); env(e.gain, t, 0.01, 0.6, 0.35); e.connect(d); osc('sawtooth', 900 * (o.pitch || 1), t, 0.4, e, { f1: 520 }); burst(t, 0.3, d, { f0: 1800, q: 2, g: 0.25, a: 0.01 }); } // yelp
    else if (k === 4) { const e = G(0); env(e.gain, t, 0.01, 0.65, 0.4); e.connect(d); osc('sawtooth', 640 * (o.pitch || 1), t, 0.45, e, { f1: 340 }); burst(t, 0.35, d, { f0: 1300, q: 2, g: 0.3, a: 0.01 }); } // squeal
    else if (k === 6) { const e = G(0); env(e.gain, t, 0.02, 0.6, 0.6); e.connect(d); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.3; f.connect(e); osc('sawtooth', 460 * (o.pitch || 1), t, 0.7, f, { f1: 300 }); }
    else growl(t, 0.5, d, (k === 3 ? 100 : 130) * (o.pitch || 1), 78, 0.8, { trem: 20, depth: 0.1, cut0: 800, cut1: 400, q: 2, hold: 0.3 });
  });
  def('beastDeath', 0.95, 2.0, 4, 0.35, 0, 2, (t, d, o) => {
    const k = bk(o);
    if (k === 6) { const e = G(0); envASR(e.gain, t, 0.05, 0.7, 0.6, 1.1); e.connect(d); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1000, t); f.frequency.exponentialRampToValueAtTime(350, t + 1.7); f.Q.value = 1.2; f.connect(e); osc('sawtooth', 560 * (o.pitch || 1), t, 1.8, f, { f1: 140 }); }
    else if (k === 2) { const e = G(0); envASR(e.gain, t, 0.03, 0.6, 0.3, 0.8); e.connect(d); osc('triangle', 800 * (o.pitch || 1), t, 1.1, e, { f1: 260 }); }
    else growl(t, 1.5, d, (k === 4 ? 360 : k === 3 ? 90 : 105) * (o.pitch || 1), k === 4 ? 140 : 38, 0.9, { trem: 16, depth: 0.09, cut0: 800, cut1: 180, q: 1.8, hold: 0.25 });
  });
  def('beastBite', 0.95, 0.35, 3, 0.1, 0, 4, (t, d, o) => { burst(t, 0.05, d, { type: 'highpass', f0: 2800, g: 0.7, a: 0.001 }); thump(t, hz(o, 150), 70, 0.12, 0.8, d); for (let i = 0; i < 3; i++) burst(t + 0.02 + i * 0.03, 0.04, d, { f0: 600 + rng() * 700, q: 4, g: 0.25, a: 0.002, kind: 'pink' }); burst(t + 0.01, 0.2, d, { type: 'lowpass', f0: 900, f1: 200, g: 0.5, kind: 'pink' }); });
  def('beastClaw', 0.9, 0.4, 3, 0.1, 0, 4, (t, d, o) => { for (let i = 0; i < 3; i++) burst(t + i * 0.025, 0.14, d, { f0: hz(o, 2400) - i * 300, f1: 700, q: 1.4, g: 0.45, a: 0.005 }); burst(t + 0.03, 0.2, d, { type: 'lowpass', f0: 1200, f1: 250, g: 0.5, kind: 'pink' }); thump(t + 0.04, hz(o, 110), 60, 0.1, 0.5, d); });
  def('beastGore', 1.0, 0.4, 3, 0.1, 0, 3, (t, d, o) => { thump(t, hz(o, 90), 45, 0.2, 0.9, d); burst(t, 0.15, d, { f0: 500, f1: 150, q: 1, g: 0.7, kind: 'pink' }); burst(t + 0.02, 0.12, d, { f0: 1600, f1: 700, q: 1.2, g: 0.35 }); });
  def('beastSlam', 1.0, 0.8, 3, 0.25, 0.1, 3, (t, d, o) => { thump(t, hz(o, 80), 34, 0.45, 1.0, d); burst(t, 0.4, d, { type: 'lowpass', f0: 500, f1: 90, g: 0.9, kind: 'brown', a: 0.003 }); burst(t, 0.12, d, { f0: 1800, q: 0.8, g: 0.25, kind: 'pink' }); });
  def('pawThud', 0.6, 0.25, 1, 0.05, 0, 4, (t, d, o) => { thump(t, hz(o, 90), 45, 0.12, 0.7, d); burst(t, 0.08, d, { type: 'lowpass', f0: 700, f1: 150, g: 0.4, kind: 'brown', a: 0.002 }); });
  def('beastSnort', 0.7, 0.5, 2, 0.1, 0, 2, (t, d, o) => { burst(t, 0.3, d, { f0: 500, f1: 220, q: 1.6, g: 0.9, a: 0.02, kind: 'pink' }); burst(t + 0.18, 0.2, d, { f0: 420, f1: 200, q: 1.4, g: 0.6, a: 0.01, kind: 'pink' }); });
  def('beastCharge', 0.9, 1.2, 3, 0.25, 0.1, 2, (t, d, o) => { for (let i = 0; i < 6; i++) thump(t + i * 0.1, hz(o, 85) - i * 3, 40, 0.14, 0.7, d); burst(t, 1.0, d, { type: 'lowpass', f0: 400, f1: 700, g: 0.5, kind: 'brown', a: 0.3 }); });


  // ---------- sfx dispatch: pooled spatial strips, category voice caps, round-robin + velocity + pitch jitter, HRTF-like panning, camera distance ----------
  const JIT = { combat: 0.05, gore: 0.06, voice: 0.03, ui: 0.012, crowd: 0.05, amb: 0.08, big: 0.02, beast: 0.04 };
  const WEAPONS = ['sword', 'spear', 'axe', 'mace', 'dagger'], ARMORS = ['none', 'leather', 'bronze', 'mail', 'plate'];
  let voices = [];          // {name, cat, end, hold, pri, strip}
  const strips = { free: [], made: 0, reused: 0 };
  const rrN = {};
  const listener = { on: false, x: 0, y: 0, z: 0, rx: 1, rz: 0 };
  function makeStrip() {
    const inp = G(1), wet = G(0), mg = ctx.createChannelMerger(2), outG = G(1), st = { inp, wet, mg, outG, bus: null };
    for (const [side, ch] of [['L', 0], ['R', 1]]) {
      const d = ctx.createDelay(0.01), lp = ctx.createBiquadFilter(), g = G(1); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 20000;
      inp.connect(d); d.connect(lp); lp.connect(g); g.connect(mg, 0, ch); st['d' + side] = d; st['lp' + side] = lp; st['g' + side] = g;
    }
    mg.connect(outG); inp.connect(wet); wet.connect(revIn); strips.made++; return st;
  }
  function acquire(bus) {
    const s = strips.free.pop() || makeStrip(); if (strips.free.length || s.bus) strips.reused++;
    if (s.bus !== bus) { try { s.outG.disconnect(); } catch (e) { /* fresh */ } s.outG.connect(bus); s.bus = bus; }
    return s;
  }
  function release(s) { if (strips.free.length < 32) strips.free.push(s); else { try { s.inp.disconnect(); s.outG.disconnect(); s.wet.disconnect(); s.dL.disconnect(); s.dR.disconnect(); s.lpL.disconnect(); s.lpR.disconnect(); s.gL.disconnect(); s.gR.disconnect(); } catch (e) { /* ignore */ } } }
  function sweep(now) { if (!voices.length) return; const keep = []; for (const v of voices) { if (v.hold > now) keep.push(v); else release(v.strip); } voices = keep; }
  // position -> pan + distance from the listener (camera). pos = [x, y, z] in world units, listener set with setListener({pos, right|yaw})
  function spatial(o) {
    let pan = o.pan || 0, dist = o.dist || 0;
    if (o.pos && listener.on) {
      const dx = o.pos[0] - listener.x, dy = (o.pos[1] || 0) - listener.y, dz = o.pos[2] - listener.z, hz2 = Math.hypot(dx, dz);
      dist = Math.hypot(dx, dy, dz); pan = clamp((dx * listener.rx + dz * listener.rz) / Math.max(hz2, 2.5), -1, 1);
    }
    return { pan: clamp(pan, -1, 1), dist: Math.max(0, dist) };
  }
  function sfx(name, o = {}) {
    if (name === 'ult' && o.element) name = 'ult' + o.element[0].toUpperCase() + o.element.slice(1);
    const e = T[name]; if (!e || !ensure()) return false;
    const now = NOW();
    if (!OFFLINE && ctx.state !== 'running') { tryResume(); return false; }
    const t = o.when != null ? o.when : now + 0.005, cat = e.cat;
    if (ENFORCE) {
      const key = name + (o.voice || '');
      if (lastHit[key] != null && t - lastHit[key] < 0.03 && t >= lastHit[key]) return false;
      sweep(now);
      let same = 0, inCat = 0, victim = null; for (const v of voices) { if (v.end > t) { if (v.name === name) same++; if (v.cat === cat) { inCat++; if (!victim || v.pri < victim.pri || (v.pri === victim.pri && v.end < victim.end)) victim = v; } } }
      if (same >= e.max) return false;
      if (voices.length >= 28 && e.pri < 3) return false;
      if (voices.length >= 40) return false;
      if (inCat >= (CAP[cat] || 10)) { if (!victim || victim.pri > e.pri) return false; try { victim.strip.outG.gain.setTargetAtTime(0, t, 0.012); } catch (er) { /* ignore */ } victim.end = t; }
      lastHit[key] = t;
    }
    // per-trigger variation
    const jit = JIT[cat] == null ? 0.04 : JIT[cat], vel = o.vel == null ? 1 : clamp(o.vel, 0, 1.2), n = (rrN[name] = (rrN[name] || (rng() * 4 | 0)) + 1);
    cur.j = 1 + (rng() * 2 - 1) * jit; cur.b = 0.82 + 0.22 * Math.min(1, vel); cur.vel = vel; cur.rr = n;
    cur.weapon = o.weapon && WEAPONS.includes(o.weapon) ? o.weapon : 'sword';
    cur.armor = o.armor && ARMORS.includes(o.armor) ? o.armor : ['leather', 'bronze', 'leather', 'mail'][n & 3];
    cur.surface = o.surface || 'sand';
    const oo = Object.assign({}, o); if (cat === 'voice' || cat === 'beast') oo.pitch = (o.pitch || 1) * (1 + (rng() * 2 - 1) * jit);
    const gj = Math.pow(10, ((rng() * 2 - 1) * (cat === 'ui' ? 0.4 : 1.4)) / 20);
    const sp = spatial(o), d = sp.dist;
    // distance: inverse-ish attenuation past 6 m, air absorption low-pass, more reverb when far
    const att = d > 6 ? 6 / (6 + 0.6 * (d - 6)) : 1, fc = clamp(19000 / (1 + d / 7), 1500, 19000);
    const level = e.lvl * (o.gain == null ? 1 : o.gain) * gj * att * (0.55 + 0.45 * Math.pow(Math.min(1.2, vel), 0.8));
    const s = acquire(cat === 'crowd' ? crowdBus : sfxBus), pa = (sp.pan + 1) * Math.PI / 4, ap = Math.abs(sp.pan), itd = 0.00065 * ap;
    s.inp.gain.setValueAtTime(level, t); s.outG.gain.setValueAtTime(1, t); s.wet.gain.setValueAtTime(e.wet * (o.wet == null ? 1 : o.wet) * (1 + d / 18), t);
    s.gL.gain.setValueAtTime(Math.cos(pa) * 1.4142, t); s.gR.gain.setValueAtTime(Math.sin(pa) * 1.4142, t);   // constant power, centre = unity per ear
    s.dL.delayTime.setValueAtTime(sp.pan > 0 ? itd : 0, t); s.dR.delayTime.setValueAtTime(sp.pan < 0 ? itd : 0, t);
    const shadow = 19000 * Math.pow(0.18, ap * ap);   // head shadow darkens the far ear
    s.lpL.frequency.setValueAtTime(Math.min(fc, sp.pan > 0 ? shadow : 19000), t); s.lpR.frequency.setValueAtTime(Math.min(fc, sp.pan < 0 ? shadow : 19000), t);
    voices.push({ name, cat, end: t + e.dur, hold: t + e.dur + 0.25, pri: e.pri, strip: s });
    try { e.fn(t, s.inp, oo); } catch (err) { errs.n++; errs.last = name + ': ' + (err && err.stack || err); }   // never let audio break the game
    if (e.duck) duck(e.duck, e.dur * 0.6, t);
    if (CROWD_KICK[name] && bed) crowdKick(CROWD_KICK[name] * Math.min(1, level), t);
    return true;
  }

  // sidechain-style ducking of the music bus. A shallow duck never cancels a deeper one that is still active.
  let duckAmt = 0, duckEnd = 0;
  function duck(amount = 0.5, hold = 0.5, at) {
    if (!ready) return; const t = at != null ? at : NOW(), p = musicDuck.gain;
    if (t < duckEnd && amount < duckAmt * 0.9) return;
    duckAmt = amount; duckEnd = t + hold + 0.5;
    p.cancelScheduledValues(t); p.setTargetAtTime(1 - amount, t, 0.012); p.setTargetAtTime(1, t + hold, 0.22);
  }

  // ---------- crowd bed: murmur + vowel swells + stomp pulse + claps, reacts to the fight (kicks), lone shouts when it gets excited ----------
  let bed = null;
  function crowdKick(a, t) { if (!bed) return; const g = bed.kick.gain, tt = t == null ? NOW() : Math.max(t, NOW()); g.setTargetAtTime(1 + 0.9 * a, tt, 0.05); g.setTargetAtTime(1, tt + 0.25, 0.7); }
  function crowd(level) {
    level = clamp(+level || 0, 0, 1);
    if (!ensure()) return;
    if (!bed) {
      if (level <= 0) return;
      const t = NOW(), out = ctx.createGain(), kick = G(1); out.gain.value = 0; out.connect(kick); kick.connect(crowdBus);
      const mk = (kind, type, f, q, g) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf[kind]; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gg = G(g); s.connect(fl); fl.connect(gg); gg.connect(out); s.start(t, rng() * 2); return { s, fl, gg }; };
      const body = mk('pink', 'bandpass', 500, 0.5, 1);                   // murmur body
      const f1 = mk('white', 'bandpass', 800, 3.5, 0.5), f2 = mk('white', 'bandpass', 1250, 4, 0.35); // vowel-ish band layer
      const air = mk('white', 'highpass', 3500, 0.5, 0.08);               // claps and rustle
      const low = mk('brown', 'lowpass', 220, 0.7, 0.5);                  // rumble of stamping
      const exc = mk('pink', 'bandpass', 1900, 1.6, 0);                   // excited screaming layer, only above 0.6
      const lfos = [];
      const swell = (fr, dep, node) => { const l = ctx.createOscillator(), lg = G(dep); l.frequency.value = fr; l.connect(lg); lg.connect(node.gg.gain); l.start(t); lfos.push(l); };
      swell(0.23, 0.22, f1); swell(0.37, 0.18, f2); swell(0.11, 0.3, body); swell(0.6, 0.04, air); swell(1.9, 0.22, low); swell(0.43, 0.3, exc);   // 1.9 Hz = a slow stomp pulse
      bed = { out, kick, body, f1, f2, air, low, exc, lfos, level: -1, lastSet: -9, nextShout: t + 2 };
      out.gain.value = 0.0001;
    }
    const t = NOW(), first = bed.level < 0, tc = first ? 0.001 : 0.4, L = level;
    if (first || Math.abs(L - bed.level) > 0.004 || t - bed.lastSet > 0.3 || L <= 0.001) {   // the fight view calls this every frame: do not pile automation events on the timeline
      const target = L <= 0.001 ? 0 : 0.03 + 0.32 * Math.pow(L, 1.3);
      bed.out.gain.setTargetAtTime(Math.max(0.0001, target), t, tc);
      bed.body.fl.frequency.setTargetAtTime(380 + 420 * L, t, tc); bed.f1.fl.frequency.setTargetAtTime(700 + 260 * L, t, tc); bed.f2.fl.frequency.setTargetAtTime(1100 + 400 * L, t, tc);
      bed.air.gg.gain.setTargetAtTime(0.03 + 0.07 * L * L, t, tc); bed.low.gg.gain.setTargetAtTime(0.2 + 0.7 * L, t, tc); bed.exc.gg.gain.setTargetAtTime(0.28 * sstep(0.55, 1, L), t, tc);
      bed.level = L; bed.lastSet = t;
    }
    if (L > 0.3 && t >= bed.nextShout && (OFFLINE ? true : ctx.state === 'running')) { // a lone voice from the stands now and then
      bed.nextShout = t + 0.9 + rng() * 2.2 / (0.3 + L);
      sfx('crowdShout', { when: t + 0.02, pan: (rng() * 2 - 1) * 0.9, gain: 0.4 + 0.6 * L, dist: 10 + rng() * 14, pitch: 0.8 + rng() * 0.6, vowel: rng() < 0.5 ? 'o' : 'a' });
    }
    if (L <= 0.001) { const b = bed; bed = null; const stopAt = t + 2.5; for (const k of ['body', 'f1', 'f2', 'air', 'low', 'exc']) { try { b[k].s.stop(stopAt); } catch (e) { /* ignore */ } } for (const l of b.lfos) { try { l.stop(stopAt); } catch (e) { /* ignore */ } } }
  }

  // ---------- music ----------
  const players = [];       // {mode, bus, ...}; the last is current, earlier ones fade out
  let intensityTarget = 0.3, curInt = 0.3, pumpTimer = null, curMode = null;
  const music = { log: opts.log ? [] : null };
  const L = (p, t, what, extra) => { if (music.log) music.log.push({ mode: p.mode, bar: p.bar, step: p.step, t, what, ...extra }); };
  const gate = (a, b) => sstep(a, b, curInt);

  // ---- instruments (all write into a player stem) ----
  // ensemble strings: three detuned saws, bow-like cutoff swell, delayed vibrato on long notes
  function ens(dest, t, f, dur, g, o = {}) {
    const a = o.a == null ? 0.05 : o.a, rel = o.rel || 0.12, cut = o.cut || 2200;
    const out = G(0); envASR(out.gain, t, a, g, Math.max(0.01, dur - a), rel); out.connect(dest);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; lp.frequency.setValueAtTime(cut * 0.55, t); lp.frequency.linearRampToValueAtTime(cut, t + Math.min(dur, a + 0.25)); lp.connect(out);
    const lfo = dur > 0.7 ? ctx.createOscillator() : null, lg = lfo ? G(0) : null;
    if (lfo) { lfo.frequency.value = 5 + (f % 7) * 0.05; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + Math.min(1.2, dur * 0.6)); lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + rel + 0.05); }
    [-10, 0, 9].forEach((dt, i) => { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.detune.value = dt; s.frequency.value = f; if (lg) lg.connect(s.detune); const sg = G(i === 1 ? 0.42 : 0.3); s.connect(sg); sg.connect(lp); s.start(t); s.stop(t + dur + rel + 0.05); });
  }
  // choir pad: detuned saws summed, shaped by 'ah' formants, slow vibrato
  function choir(dest, t, freqs, dur, g, o = {}) {
    const a = o.a || 0.9, rel = o.rel || 1.0, out = G(0); envASR(out.gain, t, a, g, Math.max(0.01, dur - a), rel); out.connect(dest);
    const mix = G(0.5), F = VOWEL[o.vowel || 'a'], q = [5, 7, 9], am = [1, 0.7, 0.35];
    F.forEach((fr, i) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fr; b.Q.value = q[i]; const x = G(am[i] * (i ? 1 : 1.5)); mix.connect(b); b.connect(x); x.connect(out); });
    const lfo = ctx.createOscillator(), lg = G(f0cents(freqs[0])); lfo.frequency.value = 4.8; lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + rel + 0.05);
    freqs.forEach((f) => [-7, 6].forEach((dt) => { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.detune.value = dt; s.frequency.value = f; lg.connect(s.detune); const sg = G(0.5 / Math.sqrt(freqs.length)); s.connect(sg); sg.connect(mix); s.start(t); s.stop(t + dur + rel + 0.05); }));
    const br = G(0.04); noise('pink', t, dur + rel, br); br.connect(out);
  }
  const f0cents = () => 9;
  // aulos / double reed lead: two close saws (beating), nasal band-pass, delayed vibrato, breath
  function aulos(dest, t, f, dur, g, o = {}) {
    const a = o.a || 0.035, rel = o.rel || 0.14, out = G(0); envASR(out.gain, t, a, g, Math.max(0.02, dur - a), rel); out.connect(dest);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(4200, f * 5); lp.Q.value = 0.8;
    const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = Math.min(3000, f * 3); bp.Q.value = 1.6; bp.gain.value = 6; lp.connect(bp); bp.connect(out);
    const vib = ctx.createOscillator(), vg = G(0); vib.frequency.value = 5.4; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.009, t + Math.min(0.6, dur)); vib.connect(vg);
    [-5, 5].forEach((dt) => { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.detune.value = dt; s.frequency.setValueAtTime(f * (o.scoop ? 0.94 : 1), t); if (o.scoop) s.frequency.exponentialRampToValueAtTime(f, t + 0.07); vg.connect(s.frequency); const sg = G(0.3); s.connect(sg); sg.connect(lp); s.start(t); s.stop(t + dur + rel + 0.1); });
    vib.start(t); vib.stop(t + dur + rel + 0.1);
    const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = f * 2; nb.Q.value = 4; const ng = G(o.breath == null ? 0.1 : o.breath); noise('white', t, dur + 0.1, nb); nb.connect(ng); ng.connect(out);
  }
  function frameDrum(dest, t, g, o = {}) {   // bodhran: low skin thump, ring, slap
    const f = o.f || 118; thump(t, f * 1.5, f, 0.16, g * 0.8, dest);
    const rg = G(0); env(rg.gain, t, 0.002, g * 0.22, 0.22); rg.connect(dest); osc('sine', f * 2.1, t, 0.25, rg, { f1: f * 1.9 });
    burst(t, o.rim ? 0.03 : 0.05, dest, { type: 'bandpass', f0: o.rim ? 2600 : 1300, q: 1.2, g: g * (o.rim ? 0.35 : 0.22), a: 0.001 });
  }
  function taiko(dest, t, g, o = {}) { const f = o.f || 58; thump(t, f * 2.2, f, 0.7, g, dest); burst(t, 0.06, dest, { type: 'bandpass', f0: 1800, q: 1, g: g * 0.3, a: 0.001 }); burst(t, 0.5, dest, { type: 'lowpass', f0: 380, f1: 70, g: g * 0.5, kind: 'brown', a: 0.002 }); }
  function snare(dest, t, g) { burst(t, 0.12, dest, { type: 'bandpass', f0: 2200, q: 0.8, g, a: 0.001 }); thump(t, 240, 170, 0.06, g * 0.5, dest); }
  // tension riser: rising filtered noise + a gliding saw + sub swell; the last 70 ms are left empty so the impact lands clean
  function riser(dest, t, dur, g, o = {}) {
    const e = dur - 0.07, out = G(0); out.gain.setValueAtTime(0.00001, t); out.gain.exponentialRampToValueAtTime(g, t + e * 0.97); out.gain.linearRampToValueAtTime(0.00001, t + dur); out.connect(dest);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(o.top || 6800, t + e); noise('pink', t, dur, f); const ng = G(1.1); f.connect(ng); ng.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3500, t + e); lp.connect(out);
    const bf = o.f || 110; [-8, 8].forEach((dt) => { const s = ctx.createOscillator(); s.type = 'sawtooth'; s.detune.value = dt; s.frequency.setValueAtTime(bf, t); s.frequency.exponentialRampToValueAtTime(bf * 2.01, t + e); const sg = G(0.18); s.connect(sg); sg.connect(lp); s.start(t); s.stop(t + dur + 0.05); });
  }
  function impact(dest, t, g) { thump(t, 82, 34, 1.0, g, dest); burst(t, 0.9, dest, { type: 'lowpass', f0: 260, f1: 55, g: g * 0.7, kind: 'brown', a: 0.002 }); crash(dest, t, g * 0.28, 1.8); }
  // brass chorale / stab voicing
  function brassChord(dest, t, freqs, dur, g, o = {}) { freqs.forEach((f, i) => brass(dest, t + i * (o.strum || 0), f, dur, g / (0.6 + 0.4 * freqs.length) * (i ? 0.85 : 1), o)); }
  // developing a motif: [{s, d, len}] in chord-relative scale degrees. k: 0 statement, 1 sequence up, 2 inversion, 3 cadence (falls to the root and rests long)
  const RHYTHMS = [[0, 4, 6, 8], [0, 3, 6, 10], [0, 2, 4, 8], [0, 6, 8, 12], [2, 6, 8, 12], [0, 4, 8, 11]];
  const CONTOURS = [[0, 2, 1, 4], [0, 1, 2, 0], [4, 2, 3, 1], [0, 3, 2, 1], [2, 4, 3, 0], [0, 4, 3, 2]];
  function makeMotif(r) { const rh = pick(r, RHYTHMS), co = pick(r, CONTOURS); return rh.map((s, i) => ({ s, d: co[i], len: (i + 1 < rh.length ? rh[i + 1] : 16) - s })); }
  function develop(m, k, r) {
    if (k === 0) return m;
    if (k === 1) return m.map((n, i) => ({ s: n.s, d: n.d + (i < 3 ? 1 : 2), len: n.len }));
    if (k === 2) return m.map((n) => ({ s: n.s, d: 2 * m[0].d - n.d + 2, len: n.len }));
    return m.map((n, i) => ({ s: n.s, d: i === m.length - 1 ? 0 : i === m.length - 2 ? 1 : n.d, len: i === m.length - 1 ? 14 - n.s : n.len }));
  }
  // chord of a bar: tones near the mode's bass register, a chord-relative melody scale, and its quality
  function setChord(p, rootF, ivs, sc, o = {}) { p.ch = { rootF, ivs, tones: chordSemi(rootF * 2, ivs), sc, dom: !!o.dom }; }   // rootF = bass note, tones = voicing an octave above (keeps strings and brass out of the sub range)
  const melF = (p, d, oct = 2) => degFreq(p.ch.rootF * oct, p.ch.sc, d);
  const hum = (p, kind) => { const r = p.hr(), v = kind === 'perc' ? (r - 0.5) * 0.006 : kind === 'str' ? 0.004 + r * 0.014 : kind === 'brass' ? (r - 0.4) * 0.012 : kind === 'lead' ? (r - 0.35) * 0.03 : (r - 0.5) * 0.014; return Math.max(v, p.startT - p.next); };   // timing feel per section; never earlier than the player's own start
  const vv = (p, base, acc = 1) => base * (0.9 + p.hr() * 0.2) * acc;
  const phraseSeed = (p, k) => mulberry(hash(seed, p.mode, k));

  function makeDrone(p, f, g) {
    const t0 = p.startT, out = G(g); out.connect(p.st.low);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.8; lp.connect(out);
    const os = [['sawtooth', 1, -6, 0.5], ['sawtooth', 1, 7, 0.5], ['sine', 1.5, 0, 0.3], ['sine', 1, 0, 0.5], ['sine', 2, 0, 0.12]].map(([ty, m, dt, gg]) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f * m; o.detune.value = dt; const x = G(gg); o.connect(x); x.connect(lp); o.start(t0); return { o, m }; });
    return { g: out, lp, os, f };
  }
  function setDrone(p, f, t) { if (!p.drone) return; p.drone.os.forEach(({ o, m }) => { o.frequency.setTargetAtTime(f * m, t, 0.3); }); }

  // ---- shared pieces used by several modes ----
  // pad: sustained strings (and optionally choir) on the chord for `bars` bars
  function padChord(p, t, sp, bars, g, o = {}) {
    const dur = sp * 16 * bars; const tones = p.ch.tones.map((f) => f * (o.oct || 1));
    tones.forEach((f, i) => ens(p.st.pad, t, f, dur, g * (i ? 0.8 : 1), { a: o.a || 1.2, rel: 1.2, cut: o.cut || 1400 }));
    if (o.choir) choir(p.st.pad, t, tones.slice(0, 3), dur, o.choir, { a: 1.4, rel: 1.4 });
  }
  function lyreArp(p, t, s, g, idxs, o = {}) {
    const tn = p.ch.tones, n = tn.length, k = idxs[(s >> (o.div || 1)) % idxs.length]; const f = tn[k % n] * (o.oct || 1) * (k >= n ? 2 : 1);
    pluck(p.st.lyre, t, f, g, { bright: o.bright == null ? 0.45 : o.bright, dur: o.dur || 1.6 });
  }
  function leadMotif(p, t, s, sp, bar, gain, voiceFn) {   // plays the motif note that starts on step s (if any); k from the position in the 8-bar phrase
    const k = (p.pb >> 1) & 3, notes = develop(p.motif, k, p.r), n = notes.find((x) => x.s === s);
    if (!n) return false; if ((p.pb & 1) && n.s > 6 && k !== 3) return false;   // answer bar plays only the first half of the figure
    const f = melF(p, n.d, o2(p)), dur = Math.max(sp * 1.4, sp * n.len * 0.92);
    voiceFn(f, dur, vv(p, gain, s === 0 ? 1.12 : 1)); L(p, t, 'motif', { n: n.d }); return true;
  }
  const o2 = (p) => p.leadOct || 2;

  function makeMode(base) { return base; }
  // ---------------------------- MODES ----------------------------
  const MODES = {};
  // 8-bar chord plans use semitone roots above the mode tonic; quality sets the melody scale
  const MSC = (q, cfg) => q === MIN ? cfg.minSc : q === DIM ? [0, 1, 3, 5, 6, 8, 10] : q === MAJ ? (cfg.majSc || SCALES.mixo) : cfg.minSc;

  // ---- LUDUS: D Dorian hub. lyre arpeggios, aulos motif, frame drum, string pad, time of day layers ----
  const hubTod = { n: 0, d: 0, dawn: 0, tn: 0, td: 0, tdawn: 0 };
  const tickHubTod = () => { for (const k of ['n', 'd', 'dawn']) hubTod[k] += (hubTod['t' + k] - hubTod[k]) * 0.06; };
  const LUDUS_PROGS = [[[0, MIN], [5, MAJ], [0, MIN], [10, MAJ], [0, MIN], [5, MAJ], [10, MAJ], [0, MIN]], [[0, MIN], [10, MAJ], [5, MAJ], [0, MIN], [0, MIN], [3, MAJ], [10, MAJ], [7, MAJ]], [[0, MIN], [0, MIN], [5, MAJ], [10, MAJ], [0, MIN], [5, MAJ], [7, MIN], [0, MIN]]];
  MODES.ludus = {
    bpm: () => 92 - 14 * hubTod.n, tonic: NOTE(50), scene: 'hub', cfg: { minSc: SCALES.dorian, majSc: SCALES.mixo },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.11); },
    bar(p, bar) {
      const M = MODES.ludus; p.pb = bar % 8; if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.prog = pick(p.r, LUDUS_PROGS); p.motif = makeMotif(phraseSeed(p, 'm' + Math.floor(bar / 32))); p.rhythm = pick(p.r, [[0, 4, 8, 12], [0, 3, 6, 10], [0, 6, 8, 12, 14], [2, 6, 10]]); p.lead = p.r() < 0.8; p.leadOct = 2; }
      const [rs, q] = p.prog[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, MSC(q, M.cfg), { dom: q === MAJ && rs === 7 });
      setDrone(p, p.ch.rootF / 2, p.next); L(p, p.next, 'bar');
    },
    step(p, s, t, sp) {
      const pb = p.pb, hr = hum(p, 'lyre'); tickHubTod(); const pk = 1 - 0.65 * hubTod.n, n = hubTod.n;
      const bar = p.bar;
      if (s % 2 === 0) { const i = (s / 2) % 8, idx = [0, 1, 2, 3, 2, 1, 2, 3][i]; if (p.r() > 0.12) { lyreArp(p, t + (s % 4 === 2 ? sp * 0.18 : 0) + hr, s, vv(p, 0.2 + (s === 0 ? 0.07 : 0)), [idx], { div: 0, bright: 0.45 }); L(p, t, 'lyre'); } }
      if (s === 0) pluck(p.st.low, t, p.ch.rootF, 0.24, { dur: 2.2, bright: 0.3 });
      if (p.lead && n < 0.6) leadMotif(p, t + hum(p, 'lead'), s, sp, bar, 0.13, (f, d, g) => { if (pb < 4 && curInt > 0.1 || pb >= 4) aulos(p.st.lead, t + hum(p, 'lead'), f, d, g * 0.9, { scoop: true }); });
      if (s === 0 || s === 8) frameDrum(p.st.perc, t + hum(p, 'perc'), vv(p, 0.2 * pk, s ? 0.8 : 1), { f: 100 });
      if (s % 4 === 2) shaker(p.st.perc, t, (0.05 + 0.04 * curInt) * pk);
      if (s === 10 && p.r() < 0.4) frameDrum(p.st.perc, t, 0.1 * pk, { f: 130, rim: 1 });
      // pad: always faint, fuller at dusk and night
      if (s === 0 && bar % 2 === 0) { const gp = 0.016 + 0.06 * clamp(n + 0.7 * hubTod.d, 0, 1); padChord(p, t, sp, 2, gp, { cut: 650 + 750 * (1 - n), a: 1.4 }); }
      if (s === 0) p.drone.g.gain.setTargetAtTime(0.1 + 0.1 * n + 0.04 * hubTod.d, t, 0.6);
      if (hubTod.dawn > 0.25 && s === 8 && bar % 2 === 1) aulos(p.st.lead, t, melF(p, [4, 2, 5, 3][(bar >> 1) % 4], 4), sp * 3, 0.06 * hubTod.dawn, { breath: 0.12 });
      if (n > 0.55 && s === 6 && bar % 4 === 1) pluck(p.st.lyre, t, melF(p, [0, 4, 2, 6][(bar >> 2) % 4], 4), 0.06 * n, { bright: 0.15, dur: 2.4 });
    },
  };

  // ---- PREP: D Phrygian dread. tympani heartbeat, rising low strings, brass swells, choir whisper, riser into the next phrase ----
  const PREP_PROGS = [[[0, MIN], [1, MAJ], [0, MIN], [5, MIN], [0, MIN], [1, MAJ], [2, DIM], [0, MIN]], [[0, MIN], [0, MIN], [1, MAJ], [0, MIN], [5, MIN], [1, MAJ], [7, MAJ], [0, MIN]]];
  MODES.prep = {
    bpm: () => 76 + 8 * curInt, tonic: NOTE(38), scene: 'arena', cfg: { minSc: SCALES.phryg, majSc: SCALES.phrygDom },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.2); },
    bar(p, bar) {
      const M = MODES.prep; p.pb = bar % 8; if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.prog = pick(p.r, PREP_PROGS); p.motif = makeMotif(phraseSeed(p, 'm' + Math.floor(bar / 16))); p.leadOct = 2; }
      p.tens = clamp(bar / 24 + 0.3 * curInt, 0, 1);
      const [rs, q] = p.prog[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, MSC(q, M.cfg), { dom: rs === 7 });
      setDrone(p, p.ch.rootF, p.next); L(p, p.next, 'bar');
    },
    step(p, s, t, sp) {
      const tens = p.tens || 0, bar = p.bar, pb = p.pb;
      if (s === 0) { drumHit(p.st.perc, t, 72, vv(p, pb === 0 ? 0.95 : 0.8), { tymp: 1, dec: 0.8 }); L(p, t, 'drum'); }
      if (s === 3 && bar % 2) drumHit(p.st.perc, t, 72, 0.4, { tymp: 1, dec: 0.5 });
      if (s === 8) drumHit(p.st.perc, t, 88, vv(p, 0.55 + 0.2 * tens), { tymp: 1, dec: 0.6 });
      if (s === 10 && tens > 0.4) drumHit(p.st.perc, t, 82, 0.35, { tymp: 1, dec: 0.4 });
      if (s % 4 === 0) { const g = G(0); env(g.gain, t, 0.001, 0.07 + 0.09 * tens, 0.04); g.connect(p.st.perc); osc('sine', 1250, t, 0.05, g); }
      if (s % 2 === 0 && tens > 0.1) { const tn = p.ch.tones; ens(p.st.str, t + hum(p, 'str'), [tn[0], tn[0], tn[0] * Math.pow(2, 1 / 12), tn[0], tn[2], tn[0], tn[0] * Math.pow(2, 1 / 12), tn[0]][(s / 2) % 8], sp * 1.6, vv(p, 0.05 + 0.1 * tens), { cut: 900 + 1500 * tens, a: 0.02 }); }
      if (s === 0 && (pb === 2 || pb === 6)) brass(p.st.brass, t, p.ch.rootF * 2, sp * 14, 0.2, { a: 1.0, rel: 0.6, bright: 0.45 });
      if (s === 0 && pb % 4 === 0) padChord(p, t, sp, 4, 0.03 + 0.04 * tens, { cut: 700 + 800 * tens, choir: tens > 0.45 ? 0.05 * tens : 0 });
      if (s === 0 && pb === 0 && bar > 0) taiko(p.st.perc, t, 0.5, { f: 55 });
      if (s === 0 && pb % 2 === 0) pluck(p.st.lyre, t, melF(p, [4, 3, 1, 0][(pb >> 1)], 2), 0.1, { dur: 2.4, bright: 0.3 });
      if (pb === 7 && s === 0 && tens > 0.3) riser(p.st.fx, t, sp * 16, 0.22 * tens, { f: 100, top: 5200 });
      if (pb === 0 && s === 0 && tens > 0.3 && bar > 0) impact(p.st.fx, t, 0.4 * tens);
    },
  };

  // ---- ARENA family: one engine, three flavours. Intensity layers fade in smoothly; the chord plan is 8 bars; risers precede intensity jumps. ----
  const ARENA_PROGS = {
    arena: [[[0, MIN], [1, MAJ], [0, MIN], [8, MAJ], [0, MIN], [1, MAJ], [7, MAJ], [0, MIN]], [[0, MIN], [0, MIN], [8, MAJ], [10, MAJ], [0, MIN], [1, MAJ], [10, MAJ], [7, MAJ]], [[0, MIN], [5, MIN], [1, MAJ], [0, MIN], [0, MIN], [8, MAJ], [1, MAJ], [7, MAJ]]],
    beast: [[[0, MIN], [1, MAJ], [0, MIN], [6, MAJ], [0, MIN], [1, MAJ], [0, MIN], [7, MAJ]], [[0, MIN], [0, MIN], [6, MAJ], [1, MAJ], [0, MIN], [3, MAJ], [6, MAJ], [7, MAJ]]],
    boss: [[[0, MIN], [1, MAJ], [0, MIN], [8, MAJ], [0, MIN], [1, MAJ], [7, MAJ], [0, MIN]], [[0, MIN], [8, MAJ], [1, MAJ], [0, MIN], [0, MIN], [10, MAJ], [1, MAJ], [7, MAJ]]],
  };
  function arenaMode(id, cfg) {
    return {
      bpm: () => cfg.bpm0 + cfg.bpmR * curInt, tonic: NOTE(cfg.midi), scene: 'arena', cfg,
      init(p) { p.drone = makeDrone(p, NOTE(cfg.midi - 12), 0.1); p.lastI = curInt; p.rising = 0; },
      bar(p, bar) {
        const M = MODES[id]; p.pb = bar % 8;
        if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.prog = pick(p.r, ARENA_PROGS[id]); p.motif = makeMotif(phraseSeed(p, 'm' + Math.floor(bar / 24))); p.stab = pick(p.r, cfg.tribal ? [[0, 3, 6, 8, 11, 14]] : [[0, 6, 10], [0, 3, 6, 10], [0, 4, 8, 12], [0, 7, 10, 14]]); p.ost = Array.from({ length: 8 }, () => pick(p.r, [0, 0, 0, 1, 2, 4])); p.leadOct = 2; }
        const [rs, q] = p.prog[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, MSC(q, cfg), { dom: rs === 7 });
        setDrone(p, p.ch.rootF / 2, p.next); L(p, p.next, 'bar');
        // intensity jump since the last bar: rise into the next bar with a riser, land with an impact
        const dI = curInt - p.lastI; p.lastI = curInt;
        if (p.landing) { impact(p.st.fx, p.next, 0.5); taiko(p.st.perc, p.next, 0.8); p.landing = false; }
        if (dI > 0.2 && curInt > 0.4) { riser(p.st.fx, p.next + sp16(p) * 8, sp16(p) * 8, 0.2, { f: p.ch.rootF }); p.landing = true; L(p, p.next, 'riser'); }
      },
      step(p, s, t, sp) {
        const I = curInt, bar = p.bar, pb = p.pb, tn = p.ch.tones, gDr = 0.5 + 0.5 * I, root = p.ch.rootF;
        const P = p.st.perc;
        // percussion bed
        if (cfg.tribal) {
          if ([0, 3, 6, 8, 11, 14].includes(s)) frameDrum(P, t + hum(p, 'perc'), vv(p, (s === 0 ? 0.55 : 0.34) * gDr, s % 8 === 0 ? 1.1 : 0.9), { f: s === 6 || s === 14 ? 140 : 96, rim: s === 11 });
          if (s === 0 || s === 8) { taiko(P, t, vv(p, 0.78 * gDr), { f: 52 }); L(p, t, 'drum'); }
          if (I > 0.3 && s % 4 === 2) shaker(P, t, 0.05 + 0.06 * I);
          if (I > 0.55 && (s === 4 || s === 12)) taiko(P, t, 0.45 * gate(0.55, 0.8), { f: 66 });
        } else {
          if (s === 0 || s === 8) { drumHit(P, t + hum(p, 'perc'), cfg.id === 'boss' ? 62 : 70, vv(p, 0.95 * gDr), { tymp: 1, dec: 0.8 }); L(p, t, 'drum'); }
          if ((s === 4 || s === 12) && I > 0.22) { drumHit(P, t + hum(p, 'perc'), 78, vv(p, 0.7 * gDr * gate(0.22, 0.45)), { dec: 0.4, skin: 1 }); L(p, t, 'drum2'); }
          if (s % 4 === 2 && I > 0.5) frameDrum(P, t + hum(p, 'perc'), vv(p, 0.34 * gate(0.5, 0.75)), { f: 110, rim: s % 8 === 2 });
          if (I > 0.78 && (s >= 12 || (pb === 7 && s >= 8))) drumHit(P, t, 70 + (s - 8) * 4, 0.3 * gate(0.78, 0.95), { dec: 0.15 });
        }
        if (s % 2 === 0 && I > 0.62) shaker(P, t, 0.04 + 0.05 * gate(0.62, 1));
        // strings ostinato (spiccato 8ths on chord tones) and sustained high pad
        if (s % 2 === 0) { const k = p.ost[(s / 2) % 8], f = k === 4 ? tn[2] : k === 2 ? tn[1] : k === 1 ? tn[0] * 1.0595 : tn[0]; ens(p.st.str, t + hum(p, 'str'), f * 2, sp * 1.7, vv(p, (0.07 + 0.08 * (s % 4 === 0)) * (0.3 + 0.7 * gate(0.1, 0.55))), { cut: 900 + 2600 * I, a: 0.012, rel: 0.05 }); L(p, t, 'ost'); }
        if (s === 0 && I > 0.5 && pb % 2 === 0) padChord(p, t, sp, 2, 0.06 * gate(0.5, 0.85), { oct: 2, cut: 2400, a: 0.9, choir: I > 0.78 || cfg.chorale ? 0.07 * gate(0.65, 1) : 0 });
        // low brass ostinato (cimbasso) under the drive
        if (I > 0.38 && s % 4 === 0 && (cfg.tribal || cfg.chorale)) brass(p.st.low, t, root, sp * 3.2, 0.2 * gate(0.38, 0.65), { a: 0.02, rel: 0.1, bright: 0.45 });
        // brass stabs
        if (I > 0.3 && p.stab.includes(s)) { const g = 0.36 * gate(0.3, 0.6); brassChord(p.st.brass, t + hum(p, 'brass'), I > 0.7 ? [tn[0], tn[2], tn[0] * 2] : [tn[0], tn[2]], sp * 1.8, vv(p, g), { a: 0.012, rel: 0.1, bright: 1.0 }); L(p, t, 'brass'); }
        // chorale: long brass chord at phrase heart (boss, and beast at high intensity)
        if ((cfg.chorale || I > 0.85) && s === 0 && pb % 4 === 0 && I > 0.45) brassChord(p.st.brass, t, [tn[0], tn[2], tn[0] * 2, tn[1] * 2], sp * 28, 0.34 * gate(0.45, 0.8), { a: 0.35, rel: 0.8, bright: 0.7 });
        // melody: aulos while it is quiet, a brass voice when it gets heavy
        leadMotif(p, t + hum(p, 'lead'), s, sp, bar, I < 0.55 ? 0.12 : 0.26, (f, d, g) => { if (I < 0.55) aulos(p.st.lead, t, f, d, g, { scoop: true }); else brass(p.st.brass, t, f, d, g * 0.7, { a: 0.03, rel: 0.12, bright: 0.9 }); });
        // beast: bone-flute howl and string cluster tremolo (minor second pairs)
        if (cfg.tribal && I > 0.5 && s === 0 && pb % 2 === 1) { aulos(p.st.lead, t, root * 4 * (pb > 4 ? 1.5 : 1), sp * 6, 0.1 * gate(0.5, 0.8), { scoop: true, breath: 0.2 }); }
        if (cfg.tribal && I > 0.55 && s % 2 === 0) { ens(p.st.str, t, root * 4, sp * 1.5, 0.03 * gate(0.55, 0.9), { cut: 3200, a: 0.01 }); ens(p.st.str, t, root * 4 * 1.0595, sp * 1.5, 0.03 * gate(0.55, 0.9), { cut: 3200, a: 0.01 }); }
        // accents: cymbal swell on phrase start, taiko on the big downbeats, riser into the next phrase
        if (s === 0 && pb === 0 && I > 0.6) crash(p.st.fx, t, 0.14);
        if (pb === 7 && s === 0 && I > 0.55) riser(p.st.fx, t, sp * 16, 0.12 * gate(0.55, 0.9), { f: root, top: 6000 });
        if (s === 0) { if (pb % 2 === 0) pluck(p.st.lyre, t, melF(p, 4, 2), 0.1 * (1 - gate(0.3, 0.7)), { dur: 2.4, bright: 0.3 }); }
        if (p.drone) p.drone.g.gain.setTargetAtTime(0.07 + 0.1 * I, t, 0.3);
      },
    };
  }
  const sp16 = (p) => 60 / p.M.bpm(p) / 4;
  MODES.arena = arenaMode('arena', { id: 'arena', midi: 40, bpm0: 100, bpmR: 24, minSc: SCALES.phryg, majSc: SCALES.phrygDom });
  MODES.beast = arenaMode('beast', { id: 'beast', midi: 45, bpm0: 92, bpmR: 30, minSc: SCALES.phryg, majSc: SCALES.phrygDom, tribal: true });
  MODES.boss = arenaMode('boss', { id: 'boss', midi: 38, bpm0: 80, bpmR: 26, minSc: SCALES.phryg, majSc: SCALES.phrygDom, chorale: true });

  // ---- VICTORY: brass stinger then a D major march (I IV V I | I vi IV V). The loop ends on V so it wraps without a seam. ----
  const VICT_PROGS = [[[0, MAJ], [5, MAJ], [7, MAJ], [0, MAJ], [0, MAJ], [9, MIN], [5, MAJ], [7, MAJ]], [[0, MAJ], [7, MAJ], [9, MIN], [5, MAJ], [0, MAJ], [5, MAJ], [7, MAJ], [7, MAJ]]];
  MODES.victory = {
    bpm: () => 112, tonic: NOTE(50), scene: 'arena', cfg: { minSc: SCALES.aeolian, majSc: SCALES.major },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.1); p.drone.g.gain.value = 0; },
    bar(p, bar) {
      const M = MODES.victory; p.pb = bar % 8; const sp = 60 / 112 / 4, t = p.next;
      if (bar === 0) { const f = NOTE(62); [[0, 2, 0, MAJ], [2.5, 1.5, 0, MAJ], [4, 2, 4, MIN], [6, 2, 7, MAJ], [8, 8, 12, MAJ]].forEach(([st, du, sm, q], i) => { brassChord(p.st.brass, t + st * sp, chordSemi(f * Math.pow(2, sm / 12), [0, 7, 12]), du * sp, 0.52, { a: 0.02 }); }); drumHit(p.st.perc, t, 70, 0.9, { tymp: 1, dec: 0.9 }); for (let i = 0; i < 16; i++) drumHit(p.st.perc, t + i * sp, 84, 0.25 + i * 0.03, { tymp: 1, dec: 0.2 }); crash(p.st.fx, t + 8 * sp, 0.3, 2.2); crash(p.st.fx, t + 16 * sp, 0.12, 1.5); L(p, t, 'stinger'); }
      if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.prog = pick(p.r, VICT_PROGS); p.motif = makeMotif(phraseSeed(p, 'm' + Math.floor(bar / 16))); p.leadOct = 2; }
      const [rs, q] = p.prog[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, q === MIN ? SCALES.aeolian : SCALES.major);
      L(p, t, 'bar');
    },
    step(p, s, t, sp) {
      const bar = p.bar, pb = p.pb; if (bar < 1) return;
      if (s === 0) { p.drone.g.gain.setTargetAtTime(0.1, t, 0.3); setDrone(p, p.ch.rootF / 2, t); }
      lyreArp(p, t + hum(p, 'lyre'), s, vv(p, s % 2 ? 0.1 : 0.17), [0, 1, 2, 3, 2, 1, 3, 2], { div: 0, bright: 0.6 });
      if (s === 0 || s === 8) drumHit(p.st.perc, t, 78, vv(p, 0.8), { tymp: 1, dec: 0.5 });
      if (s === 4 || s === 12) snare(p.st.perc, t + hum(p, 'perc'), vv(p, 0.16));
      if (s % 2 === 0) shaker(p.st.perc, t, 0.07);
      if (s === 0 && pb % 2 === 0) padChord(p, t, sp, 2, 0.05, { cut: 2000, a: 0.3, choir: pb % 4 === 0 ? 0.04 : 0 });
      leadMotif(p, t, s, sp, bar, 0.3, (f, d, g) => brass(p.st.brass, t + hum(p, 'brass'), f, d, g, { a: 0.025, rel: 0.12 }));
      if (s === 0 && pb === 4) aulos(p.st.lead, t, melF(p, 4, 4), sp * 8, 0.1);
      if (s === 0 && pb === 0 && bar >= 8) crash(p.st.fx, t, 0.1);
    },
  };

  // ---- DEFEAT: D Aeolian funeral march, 58 bpm. low brass dirge, lone drum, sparse lyre, lament on the aulos. ----
  const DEF_PROGS = [[[0, MIN], [8, MAJ], [5, MIN], [0, MIN], [0, MIN], [10, MAJ], [8, MAJ], [7, MAJ]], [[0, MIN], [5, MIN], [8, MAJ], [0, MIN], [0, MIN], [3, MAJ], [10, MAJ], [7, MAJ]]];
  MODES.defeat = {
    bpm: () => 58, tonic: NOTE(50), scene: 'arena', cfg: { minSc: SCALES.aeolian, majSc: SCALES.phrygDom },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.17); },
    bar(p, bar) {
      const M = MODES.defeat; p.pb = bar % 8; if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.prog = pick(p.r, DEF_PROGS); p.motif = makeMotif(phraseSeed(p, 'm' + Math.floor(bar / 16))); p.leadOct = 2; }
      const [rs, q] = p.prog[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, MSC(q, M.cfg), { dom: rs === 7 }); L(p, p.next, 'bar');
    },
    step(p, s, t, sp) {
      const bar = p.bar, pb = p.pb;
      if (s === 0) { setDrone(p, p.ch.rootF / 2, t); drumHit(p.st.perc, t, 62, vv(p, 0.55), { tymp: 1, dec: 1.0 }); pluck(p.st.lyre, t, p.ch.rootF, 0.2, { dur: 2.6, bright: 0.25 }); L(p, t, 'drum'); }
      if (s === 8 && bar % 2) drumHit(p.st.perc, t, 62, 0.25, { tymp: 1, dec: 0.6 });
      if (s % 4 === 0 && s) lyreArp(p, t, s, 0.09, [1, 2, 0, 2], { div: 2, bright: 0.3, dur: 2 });
      if (s === 0 && pb % 4 === 0) brassChord(p.st.brass, t, [p.ch.tones[0] / 2, p.ch.tones[2] / 2], sp * 28, 0.22, { a: 0.9, rel: 1.2, bright: 0.35 });
      if (s === 0 && pb % 4 === 0) padChord(p, t, sp, 4, 0.045, { cut: 700, a: 1.5 });
      leadMotif(p, t + sp * 0.5, s, sp, bar, 0.13, (f, d, g) => aulos(p.st.lead, t + sp * 0.5, f, d * 1.5, g, { a: 0.09, rel: 0.4, breath: 0.16 }));
    },
  };

  // ---- TITLE: cinematic D Dorian. low drone, slow timpani, a cornu call, the theme on lyre then brass, choir swell, riser into the loop point ----
  const TITLE_PROG = [[0, MIN], [10, MAJ], [5, MAJ], [0, MIN], [0, MIN], [10, MAJ], [7, MAJ], [0, MIN]];
  MODES.title = {
    bpm: () => 68, tonic: NOTE(50), scene: 'indoor', cfg: { minSc: SCALES.dorian, majSc: SCALES.mixo },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.2); },
    bar(p, bar) {
      const M = MODES.title; p.pb = bar % 8; if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.motif = makeMotif(phraseSeed(p, 'title')); p.leadOct = 2; }
      const [rs, q] = TITLE_PROG[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, MSC(q, M.cfg), { dom: rs === 7 }); setDrone(p, p.ch.rootF / 2, p.next); L(p, p.next, 'bar');
    },
    step(p, s, t, sp) {
      const bar = p.bar, pb = p.pb, tn = p.ch.tones;
      if (s === 0) { drumHit(p.st.perc, t, 64, vv(p, pb % 2 ? 0.45 : 0.75), { tymp: 1, dec: 1.2, soft: 1 }); L(p, t, 'drum'); }
      if (s === 8 && pb >= 4) drumHit(p.st.perc, t, 72, vv(p, 0.45), { tymp: 1, dec: 0.8 });
      if (s === 0 && pb === 0) { brass(p.st.brass, t, p.ch.rootF, sp * 12, 0.4, { a: 0.3, rel: 0.9, bright: 0.55 }); brass(p.st.brass, t + sp * 14, p.ch.rootF * 1.5, sp * 14, 0.36, { a: 0.2, rel: 1.0, bright: 0.55 }); }
      if (s === 0 && pb % 2 === 0) padChord(p, t, sp, 2, 0.05 + 0.02 * (pb >= 4), { cut: 1100 + 700 * (pb >= 4), a: 1.4, choir: pb >= 2 ? 0.045 : 0 });
      if (pb < 4 && s % 4 === 0) lyreArp(p, t + hum(p, 'lyre'), s, vv(p, 0.12), [0, 1, 2, 1], { div: 2, bright: 0.4, dur: 2.2 });
      leadMotif(p, t + hum(p, 'lead'), s, sp, bar, 0.3, (f, d, g) => { if (pb < 4) pluck(p.st.lyre, t, f * 2, g * 0.9, { dur: 2.4, bright: 0.5 }); else brass(p.st.brass, t + hum(p, 'brass'), f, d * 1.4, g * 0.9, { a: 0.05, rel: 0.25, bright: 0.8 }); });
      if (pb >= 4 && s % 2 === 0) ens(p.st.str, t + hum(p, 'str'), tn[(s / 2) % 3], sp * 1.7, vv(p, 0.04 + 0.01 * (pb - 4)), { cut: 1700, a: 0.01 });
      if (pb === 7 && s === 0) { riser(p.st.fx, t, sp * 16, 0.2, { f: p.ch.rootF, top: 5800 }); }
      if (pb === 0 && s === 0 && bar > 0) { impact(p.st.fx, t, 0.45); }
      if (p.drone) p.drone.g.gain.setTargetAtTime(0.16 + 0.04 * (pb >= 4), t, 0.5);
    },
  };

  // ---- RESULTS: calm D Lydian. soft strings, lyre, aulos, a frame drum heartbeat. ----
  const RES_PROG = [[0, MAJ], [2, MAJ], [9, MIN], [0, MAJ], [5, MAJ], [0, MAJ], [7, MAJ], [0, MAJ]];
  MODES.results = {
    bpm: () => 80, tonic: NOTE(50), scene: 'hub', cfg: { minSc: SCALES.dorian, majSc: SCALES.lydian },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.09); },
    bar(p, bar) {
      const M = MODES.results; p.pb = bar % 8; if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.motif = makeMotif(phraseSeed(p, 'res' + Math.floor(bar / 16))); p.leadOct = 2; }
      const [rs, q] = RES_PROG[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, MSC(q, M.cfg), { dom: false }); setDrone(p, p.ch.rootF / 2, p.next); L(p, p.next, 'bar');
    },
    step(p, s, t, sp) {
      const pb = p.pb;
      if (s === 0 && pb % 2 === 0) padChord(p, t, sp, 2, 0.05, { cut: 1500, a: 0.9 });
      if (s % 2 === 0) lyreArp(p, t + hum(p, 'lyre'), s, vv(p, 0.11 + (s === 0 ? 0.04 : 0)), [0, 1, 2, 1, 3, 2, 1, 2], { div: 1, bright: 0.5 });
      if (s === 0) frameDrum(p.st.perc, t, vv(p, 0.14), { f: 95 }); if (s === 8 && pb % 2) frameDrum(p.st.perc, t, 0.08, { f: 110 });
      leadMotif(p, t + hum(p, 'lead'), s, sp, p.bar, 0.12, (f, d, g) => aulos(p.st.lead, t + hum(p, 'lead'), f, d, g, { scoop: true, breath: 0.08 }));
    },
  };

  // ---- SEASON finale: grand D major procession. stinger, tymp march, brass chorale, choir, strings, cymbals. ----
  const SEASON_PROG = [[0, MAJ], [7, MAJ], [9, MIN], [5, MAJ], [0, MAJ], [5, MAJ], [7, MAJ], [0, MAJ]];
  MODES.season = {
    bpm: () => 100, tonic: NOTE(50), scene: 'arena', cfg: { minSc: SCALES.aeolian, majSc: SCALES.major },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.1); },
    bar(p, bar) {
      const M = MODES.season; p.pb = bar % 8; const sp = 60 / 100 / 4, t = p.next;
      if (bar === 0) { const f = NOTE(62); [[0, 3, 0], [4, 3, 4], [8, 3, 7], [12, 10, 12]].forEach(([st, du, sm]) => brassChord(p.st.brass, t + st * sp, chordSemi(f * Math.pow(2, sm / 12), [0, 7, 12]), du * sp, 0.5, { a: 0.02 })); drumHit(p.st.perc, t, 66, 0.9, { tymp: 1, dec: 1.0 }); for (let i = 0; i < 12; i++) drumHit(p.st.perc, t + (i + 4) * sp, 80, 0.22 + i * 0.03, { tymp: 1, dec: 0.2 }); crash(p.st.fx, t + 12 * sp, 0.3, 2.6); L(p, t, 'stinger'); }
      if (p.pb === 0) { p.r = phraseSeed(p, Math.floor(bar / 8)); p.motif = makeMotif(phraseSeed(p, 'season')); p.leadOct = 2; }
      const [rs, q] = SEASON_PROG[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, q === MIN ? SCALES.aeolian : SCALES.major); setDrone(p, p.ch.rootF / 2, t); L(p, t, 'bar');
    },
    step(p, s, t, sp) {
      const bar = p.bar, pb = p.pb, tn = p.ch.tones; if (bar < 1) return;
      if (s === 0 || s === 8) drumHit(p.st.perc, t, 70, vv(p, 0.85), { tymp: 1, dec: 0.6 });
      if (s === 4 || s === 12) snare(p.st.perc, t + hum(p, 'perc'), vv(p, 0.17));
      if (s % 4 === 2) shaker(p.st.perc, t, 0.07);
      if (s === 0 && pb % 2 === 0) { brassChord(p.st.brass, t, [tn[0] / 2, tn[2] / 2, tn[0]], sp * 30, 0.3, { a: 0.25, rel: 0.7, bright: 0.8 }); padChord(p, t, sp, 2, 0.05, { oct: 1, cut: 2200, a: 0.5, choir: 0.07 }); }
      if (s % 2 === 0) ens(p.st.str, t + hum(p, 'str'), tn[(s / 2) % 3] * 2, sp * 1.7, vv(p, 0.06), { cut: 2600, a: 0.01 });
      leadMotif(p, t, s, sp, bar, 0.32, (f, d, g) => brass(p.st.brass, t + hum(p, 'brass'), f, d, g, { a: 0.025, rel: 0.12, bright: 1.0 }));
      if (s === 0 && pb === 0) crash(p.st.fx, t, 0.16, 2.4);
      if (pb === 7 && s === 0) riser(p.st.fx, t, sp * 16, 0.14, { f: p.ch.rootF, top: 6500 });
    },
  };

  // ---- ELEGY (hardcore death): 48 bpm D Aeolian. a drone, a failing heartbeat, one aulos lament, string swells, long silences between. ----
  const ELEGY_PROG = [[0, MIN], [0, MIN], [8, MAJ], [5, MIN], [0, MIN], [10, MAJ], [8, MAJ], [7, MAJ]];
  MODES.elegy = {
    bpm: () => 48, tonic: NOTE(50), scene: 'indoor', cfg: { minSc: SCALES.aeolian, majSc: SCALES.phrygDom },
    init(p) { p.drone = makeDrone(p, NOTE(38), 0.15); p.motif = makeMotif(phraseSeed(p, 'elegy')); p.leadOct = 2; },
    bar(p, bar) {
      const M = MODES.elegy; p.pb = bar % 8; const [rs, q] = ELEGY_PROG[p.pb]; setChord(p, M.tonic * Math.pow(2, rs / 12), q, MSC(q, M.cfg), { dom: rs === 7 }); setDrone(p, p.ch.rootF / 2, p.next); L(p, p.next, 'bar');
    },
    step(p, s, t, sp) {
      const pb = p.pb;
      if (s === 0 && pb % 2 === 0) { frameDrum(p.st.perc, t, 0.34, { f: 78 }); frameDrum(p.st.perc, t + sp * 3.2, 0.2 - 0.02 * pb, { f: 78 }); L(p, t, 'drum'); }
      if (s === 0 && pb % 4 === 0) padChord(p, t, sp, 4, 0.05, { cut: 800, a: 2.0 });
      if (s === 0 && pb === 4) choir(p.st.pad, t, p.ch.tones.slice(0, 2), sp * 32, 0.05, { a: 2.0, rel: 2.0 });
      if (pb % 2 === 1 || pb === 6) leadMotif(p, t + sp * 0.4, s, sp, p.bar, 0.16, (f, d, g) => aulos(p.st.lead, t + sp * 0.4, f, d * 2.2, g, { a: 0.12, rel: 0.6, breath: 0.18, scoop: true }));
      if (s === 0 && pb === 7) pluck(p.st.lyre, t, melF(p, 0, 2), 0.14, { dur: 3, bright: 0.2 });
    },
  };
  for (const k of Object.keys(MODES)) MODES[k].id = k;

  // ---- player lifecycle ----
  const STEMS = { perc: { pan: 0, send: 0.1, g: 0.62 }, low: { pan: 0, send: 0.06, g: 0.5 }, str: { pan: -0.22, send: 0.26, g: 1.3 }, brass: { pan: 0.18, send: 0.3, g: 1.25 }, pad: { pan: 0, send: 0.4, g: 1.2 }, lead: { pan: 0.3, send: 0.32, g: 1.15 }, lyre: { pan: -0.35, send: 0.28, g: 1.25 }, fx: { pan: 0, send: 0.45, g: 0.9 } };   // g = stem trim: the low stems are held down so the mix is not all sub
  function newPlayer(mode, t) {
    const M = MODES[mode], bus = G(0), rev = G(0); bus.connect(musicBus); rev.connect(revMusic);
    const p = { mode, M, bus, rev, st: {}, next: t, step: 0, bar: 0, startT: t, stopped: false, hr: mulberry(hash(seed, 'hum', mode)), r: mulberry(1), pb: 0 };
    for (const [k, c] of Object.entries(STEMS)) { const g = G(c.g); let tail = g; if (ctx.createStereoPanner && c.pan) { const pn = ctx.createStereoPanner(); pn.pan.value = c.pan; g.connect(pn); tail = pn; } tail.connect(bus); const sd = G(c.send); g.connect(sd); sd.connect(rev); p.st[k] = g; }
    M.init(p); return p;
  }
  function pump(until) {
    if (!ready) return;
    for (const p of players.slice()) {
      let guard = 0;
      while (p.next < until && !p.stopped && guard++ < 400) {
        const s = p.step % 16, sp = 60 / p.M.bpm(p) / 4;
        curInt += (intensityTarget - curInt) * 0.12;
        if (s === 0) { p.bar = Math.floor(p.step / 16); try { p.M.bar(p, p.bar, p.next); } catch (e) { errs.n++; errs.last = p.mode + ' bar: ' + (e && e.stack || e); } }
        const swing = (p.mode === 'ludus' && s % 2 === 1) ? sp * 0.12 : 0;
        if (p.acc && p.acc.length && s % 2 === 0) accentNow(p, p.acc.shift(), p.next);
        try { p.M.step(p, s, p.next + swing, sp); } catch (e) { errs.n++; errs.last = p.mode + ': ' + (e && e.stack || e); }   // keep scheduling; tools read audio._stats().errors
        p.next += sp; p.step++;
      }
      if (p.endT != null && p.endT < NOW() - 0.1) disposePlayer(p);
    }
    sweepNodes();
  }
  function accentNow(p, kind, t) {
    if (kind === 'down') { impact(p.st.fx, t, 0.5); } else if (kind === 'crit') { crash(p.st.fx, t, 0.16); taiko(p.st.perc, t, 0.6); } else { drumHit(p.st.perc, t, 72, 0.6, { tymp: 1, dec: 0.6 }); }
  }
  function sweepNodes() { if (ready) sweep(NOW()); }
  function disposePlayer(p) {
    p.stopped = true; const i = players.indexOf(p); if (i >= 0) players.splice(i, 1);
    try { if (p.drone) p.drone.os.forEach(({ o }) => o.stop(NOW() + 0.01)); p.bus.disconnect(); p.rev.disconnect(); for (const g of Object.values(p.st)) g.disconnect(); } catch (e) { /* ignore */ }
  }
  function startPump() { if (pumpTimer || OFFLINE) return; pumpTimer = setInterval(() => { if (ctx && ctx.state === 'running') pump(ctx.currentTime + 0.3); }, 45); }
  const xfade = (n, up) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1); a[i] = up ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2); } return a; };
  const XUP = xfade(32, true), XDN = xfade(32, false);
  function fadeBus(p, t, dur, up) { for (const g of [p.bus.gain, p.rev.gain]) { try { g.cancelScheduledValues(t); g.setValueAtTime(up ? 0 : Math.max(0.0001, g.value), t); g.setValueCurveAtTime(up ? XUP : XDN, t, Math.max(0.02, dur)); } catch (e) { /* ignore */ } } }

  music.setMode = (mode, o = {}) => {
    if (mode === 'off' || mode == null) return music.stop(o.fade);
    if (!MODES[mode] || !ensure()) return false;
    if (mode === curMode && players.length && !o.restart) return true;
    const now = NOW(), stinger = mode === 'victory' || mode === 'defeat' || mode === 'season', fade = o.fade == null ? (stinger ? 0.3 : 1.5) : o.fade;
    let t = o.at != null ? o.at : now + 0.06;
    // seamless: start the new mode on the next bar line of the old one when that is close (a bar is a musical downbeat, so the crossfade lands on a downbeat)
    const old = players.filter((p) => !p.stopped && p.endT == null).pop();
    if (o.at == null && old && o.sync !== false && !stinger && fade >= 0.5) {
      const sp = 60 / old.M.bpm(old) / 4, toBar = (16 - (old.step % 16)) % 16, tb = old.next + toBar * sp;
      if (tb - now < 2.6 && tb > now + 0.05) t = tb;
    }
    for (const p of players) { // fade out the old ones with an equal-power curve
      fadeBus(p, t, fade, false); p.endT = t + fade + 0.5; p.stopAt = t + fade;
      if (p.drone) p.drone.os.forEach(({ o: os }) => { try { os.stop(t + fade + 0.1); } catch (e) { /* ignore */ } });
      p.next = Math.min(p.next, t + fade);
    }
    const np = newPlayer(mode, t); fadeBus(np, t, Math.min(fade, stinger ? 0.3 : fade), true);
    players.push(np); curMode = mode; if (!o.keepScene && !sceneLock) applyScene(MODES[mode].scene, 1.2);
    startPump(); pump(t + 0.3);
    return true;
  };
  music.stop = (fade = 1.2) => {
    if (!ready) return; const t = NOW();
    for (const p of players) { fadeBus(p, t, fade, false); p.endT = t + fade + 0.3; if (p.drone) p.drone.os.forEach(({ o }) => { try { o.stop(t + fade + 0.1); } catch (e) { /* ignore */ } }); p.next = Infinity; }
    curMode = null;
  };
  music.setHubTime = (hour, night) => { const h = +hour || 12; hubTod.tn = clamp(+night || 0, 0, 1); hubTod.td = clamp(Math.min(1, (h - 16.5) / 2) * (1 - hubTod.tn), 0, 1); hubTod.tdawn = clamp(1 - Math.abs(h - 6.8) / 1.6, 0, 1) * (1 - hubTod.tn * 0.5); };
  music.hubTod = hubTod;
  music.setIntensity = (x) => { intensityTarget = clamp(+x || 0, 0, 1); };
  music.getIntensity = () => intensityTarget;
  music.accent = (kind = 'hit') => { const p = players[players.length - 1]; if (p && !p.stopped) { p.acc = p.acc || []; if (p.acc.length < 3) p.acc.push(kind); } };   // 'hit' | 'crit' | 'down': lands on the next 8th note
  music.mode = () => curMode;
  music.pump = pump;
  music.seed = (s) => { seed = s >>> 0; rng = mulberry(seed ^ 0x9e3779b9); };
  // ---------- ludus ambience (HUB-AUDIO): beds (wind, distant crowd, crickets, rain), birds, owls, and spatial workshops near the camera focus ----------
  // audio.ambient.update({hour, night, weather, rain, wind, zoom, focus:[{kind,w,pan}], glads, spar, drill, fest}) every ~0.25 s from the hub. Silent no-op until the context runs.
  const ambient = (() => {
    let bedN = null, on = false, last = 0, sched = {}, st = null;
    const mkBed = () => {
      const t = NOW(), out = ctx.createGain(); out.gain.value = 0.0001; out.connect(crowdBus);
      const mk = (kind, type, f, q) => { const sr = ctx.createBufferSource(); sr.buffer = noiseBuf[kind]; sr.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gg = G(0); sr.connect(fl); fl.connect(gg); gg.connect(out); sr.start(t, rng() * 2); return { sr, fl, gg }; };
      const wind = mk('pink', 'bandpass', 380, 0.6), crowdB = mk('pink', 'bandpass', 620, 0.8), rainB = mk('white', 'bandpass', 6200, 0.5), hiss = mk('white', 'highpass', 7000, 0.4);
      const sw = ctx.createOscillator(), swg = G(0.35); sw.frequency.value = 0.09; sw.connect(swg); swg.connect(wind.gg.gain); sw.start(t);
      const sw2 = ctx.createOscillator(), swg2 = G(0.3); sw2.frequency.value = 0.17; sw2.connect(swg2); swg2.connect(crowdB.gg.gain); sw2.start(t);
      // crickets: a 4.7 kHz tone chopped at 15 Hz with a slow 2 s pulse
      const cr = ctx.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4700; const am = ctx.createGain(); am.gain.value = 0; const lfo = ctx.createOscillator(); lfo.frequency.value = 15; const lg = G(0.5); lfo.connect(lg); lg.connect(am.gain);
      const pulse = ctx.createOscillator(), pg = G(0.35); pulse.frequency.value = 0.5; pulse.connect(pg); pg.connect(am.gain); const cg = G(0); cr.connect(am); am.connect(cg); cg.connect(out); [cr, lfo, pulse].forEach((o) => o.start(t));
      return { out, wind, crowdB, rainB, hiss, cg, srcs: [wind.sr, crowdB.sr, rainB.sr, hiss.sr, sw, sw2, cr, lfo, pulse] };
    };
    const tc = (p, v, t, k = 0.8) => p.setTargetAtTime(v, t, k);
    const rate = (key, perSec, dt) => { const k = (sched[key] = (sched[key] || 0) + perSec * dt); if (k >= 1) { sched[key] = k - 1 - rng() * 0.5; return true; } return false; };
    return {
      get on() { return on; },
      start() { if (on || !ensure()) return false; if (!OFFLINE && ctx.state !== 'running') return false; bedN = mkBed(); on = true; last = NOW(); return true; },
      stop() { if (!on) return; const b = bedN, t = NOW(); on = false; bedN = null; try { tc(b.out.gain, 0.0001, t, 0.3); for (const x of b.srcs) { try { x.stop(t + 2.2); } catch (e) { /* ignore */ } } setTimeout(() => { try { b.out.disconnect(); } catch (e) { /* ignore */ } }, 2500); } catch (e) { /* ignore */ } },
      thunder(delay = 1) { if (on) sfx('thunder', { when: NOW() + delay, gain: 0.8 }); },
      update(state) {
        st = state || st || {}; if (!on && !this.start()) return; const t = NOW(), dt = Math.min(1, Math.max(0.05, t - last)); last = t;
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
    // iOS/Safari: call inside a user gesture. A silent one-sample buffer is started inside the gesture, which also lifts the mute-switch gate on old iOS.
    unlock() {
      if (!ensure()) return Promise.resolve(false);
      try { userSuspended = false; try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ } const p = ctx.resume(); return Promise.resolve(p).then(() => ctx.state === 'running').catch(() => false); } catch (e) { return Promise.resolve(false); }
    },
    setMaster(v) { vol.master = clamp(v, 0, 1); if (ready) master.gain.setTargetAtTime(vol.master, NOW(), 0.02); },
    setMusic(v) { vol.music = clamp(v, 0, 1); if (ready) { musicBus.gain.setTargetAtTime(vol.music * MUSIC_TRIM, NOW(), 0.02); revMusic.gain.setTargetAtTime(vol.music * MUSIC_TRIM, NOW(), 0.02); } },
    setSfx(v) { vol.sfx = clamp(v, 0, 1); if (ready) { sfxBus.gain.setTargetAtTime(vol.sfx, NOW(), 0.02); crowdBus.gain.setTargetAtTime(vol.sfx, NOW(), 0.02); } },
    // reverb scene: 'arena' stone hall, 'hub' open air with building slap, 'indoor'. music.setMode picks one automatically; call this to override (lock it with {lock:true}, release with setScene(null)).
    setScene(name, o = {}) { if (!name) { sceneLock = false; return scene; } sceneLock = !!o.lock; applyScene(name, o.fade == null ? 0.8 : o.fade); return scene; },
    get scene() { return scene; },
    // camera: setListener({ pos: [x, y, z], yaw }) (yaw radians, 0 = looking down -z, right vector = (cos yaw, -sin yaw)) or { pos, right: [rx, rz] }. After that sfx(name, { pos: [x, y, z] }) pans and attenuates by distance. sfx(name, { dist }) gives distance only.
    setListener(o) { if (!o || !o.pos) { listener.on = false; return; } listener.on = true; listener.x = o.pos[0]; listener.y = o.pos[1] || 0; listener.z = o.pos[2]; if (o.right) { listener.rx = o.right[0]; listener.rz = o.right[1]; } else if (o.yaw != null) { listener.rx = Math.cos(o.yaw); listener.rz = -Math.sin(o.yaw); } },
    get ctx() { return ctx; }, get analyser() { return analyser; }, get supported() { return !dead; }, get state() { return ctx ? ctx.state : 'none'; },
    suspend() { userSuspended = true; try { return ctx && ctx.suspend(); } catch (e) { return null; } },
    resume() { userSuspended = false; return tryResume(); },
    _stats() { return { strips: strips.made, free: strips.free.length, reused: strips.reused, voices: voices.length, players: players.length, scene, bed: !!bed, errors: errs.n, lastError: errs.last }; },
    _ready: ensure,
  };
  if (OFFLINE) ensure();
  return api;
}
