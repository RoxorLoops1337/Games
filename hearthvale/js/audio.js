// Hearthvale audio engine. Everything is synthesised with the Web Audio API, no audio files.
//
// QUICK START (integration notes live in hearthvale/docs/AUDIO.md)
//   import { Audio } from './audio.js';
//   addEventListener('pointerdown', () => Audio.unlock(), { once: true });   // optional: it also self-installs on import
//   Audio.sfx('coin', { pan: Audio.panFor(worldX, camX), vol: 0.8, pitch: 1, delay: 0 });
//   Audio.ui('tap');                       // UI sounds (same catalogue, always centred)
//   Audio.setMusic('day');                 // 'day' | 'dusk' | 'night' | 'rain' | 'festival' | 'title' | null (off), crossfades
//   Audio.setAmbience({ night: 0.2, rain: 0, wind: 0.3, water: 0.2 });   // each 0..1, partial updates are fine
//   Audio.setVolume('master'|'music'|'sfx'|'ambience', 0..1);  Audio.getVolume(ch);  Audio.mute(true);  Audio.isMuted();
//   Audio.catalogue()  -> [{ name, cat }]      Audio.stats() -> live voice / node counts
//   Audio.createEngine(ctx, opts)  -> a standalone engine (used for OfflineAudioContext measurement in lab/audio.html)
//
// Legacy exports kept for the old main.js: toggleAudio(force), setAmbient(night, rain), audioOn(), wantsMusic().
//
// Graph:  voices -> groups (sfx / music / ambience, each a dry + a reverb-send bus) -> master mix -> high shelf (-2 dB @ 7k)
//         -> compressor (3:1) -> limiter (20:1, -3 dB) -> soft clipper (hard ceiling 0.97) -> master gain -> destination.
//         The reverb is a convolver with a generated stereo impulse response (2.2 s, darkening tail), no files.
// Voices: sfx run on a pooled set of 30 "strips" (gain + stereo panner + reverb send) that are reused, so there is no node
//         churn for the strips themselves; a VoiceLimiter allows 24 simultaneous sfx voices and evicts the quietest.
//         Ambience one-shots use a separate pool of 8. Every node a voice creates is disconnected when it ends.
// Platform: contexts may only start inside a user gesture (unlock). iOS also needs a silent buffer play and
//         navigator.audioSession.type = 'playback' so the ringer switch does not mute us; the context is suspended while the page is hidden.
//
// Research notes (generative music): chords come from a Markov walk over diatonic degrees (major or lydian flavour) with a
// pentatonic melody that prefers chord tones on strong beats; motifs are remembered and re-played transposed so the music has
// phrases rather than random notes; density follows a slow energy curve and rest bars appear regularly; every session is
// seeded randomly, so two plays never match. Pads are detuned saws through a slowly opening low-pass; the melody feeds a
// dotted-eighth tape-style echo (low-passed feedback) which gives the dreamy kalimba sound.

import { CATALOGUE, ALIASES, TRIM, mulberry32, midiToFreq, scaleNote, foldMidi, pickWeighted, VoiceLimiter, softClipCurve, clamp, mal, tone, nz } from './sfx.js';

export const KEYS = { master: 'hearthvale.vol.master', music: 'hearthvale.vol.music', sfx: 'hearthvale.vol.sfx', amb: 'hearthvale.vol.amb', muted: 'hearthvale.muted' };
export const DEFAULTS = { master: 0.9, music: 0.6, sfx: 0.9, amb: 0.7 };
export const MUSIC_MODES = ['day', 'dusk', 'night', 'rain', 'festival', 'title'];
const chan = (c) => (c === 'ambience' || c === 'ambient' ? 'amb' : c);
const amp = (v) => v * v;                          // perceptual-ish slider curve

// ---------------------------------------------------------------------------------------------------------------
// Static data: music modes
// ---------------------------------------------------------------------------------------------------------------
// flavor: harmony scale (major | lydian). mel: melody scale density 0..1 and instrument weights. pad: level, lowpass cutoff.
// bass: level. echo: melody echo send. rev: reverb send of the whole session. perc: rhythm patterns (8 steps per bar).
const MUSIC = {
  title: { bpm: 76, flavor: 'lydian', keys: [57, 60, 62, 65], bars: 2, dens: 0.55, inst: [['kalimba', 5], ['marimba', 3.5], ['glock', 1.5]], dark: 0, pad: [0.5, 1500], bass: 0.7, echo: 0.34, rev: 0.45, spark: 0.2, fade: 2.0, gain: 1 },
  day: { bpm: 88, flavor: 'major', keys: [55, 57, 60, 62], bars: 2, dens: 0.62, inst: [['kalimba', 4.5], ['marimba', 5], ['harp', 0.5]], dark: 0, pad: [0.36, 1700], bass: 0.6, echo: 0.22, rev: 0.3, spark: 0.1, fade: 3, gain: 1 },
  dusk: { bpm: 78, flavor: 'lydian', keys: [53, 55, 57, 60], bars: 2, dens: 0.5, inst: [['marimba', 6], ['kalimba', 3], ['glock', 1]], dark: 0.2, pad: [0.55, 1100], bass: 0.7, echo: 0.36, rev: 0.45, spark: 0.15, fade: 4, gain: 1 },
  night: { bpm: 62, flavor: 'major', keys: [53, 55, 57], bars: 2, dens: 0.34, inst: [['kalimba', 4], ['glock', 4], ['tube', 1]], dark: 0.1, pad: [0.62, 800], bass: 0.5, echo: 0.52, rev: 0.62, spark: 0.55, fade: 5, gain: 1 },
  rain: { bpm: 70, flavor: 'major', keys: [53, 55, 57], bars: 2, dens: 0.32, inst: [['marimba', 7], ['kalimba', 3]], dark: 0.75, pad: [0.6, 650], bass: 0.55, echo: 0.2, rev: 0.5, spark: 0, fade: 4, gain: 1 },
  festival: { bpm: 90, flavor: 'major', keys: [55, 57, 60], bars: 1, dens: 0.88, inst: [['marimba', 5], ['kalimba', 3], ['glock', 2]], dark: 0, pad: [0.28, 2200], bass: 0.9, echo: 0.14, rev: 0.25, spark: 0.1, fade: 2.5, gain: 1, swing: 0.1, perc: { kick: 'x...x...', wood: '..x...x.', shaker: '.x.x.x.x' } },
};
const MEL_SCALE = { major: [0, 2, 4, 7, 9], lydian: [0, 2, 4, 6, 7, 9] };
const HARM_SCALE = { major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11] };
// Markov chord walks (scale degrees 0..6): weights favour the pretty ones, skip the diminished degree
const WALK = {
  major: { 0: [[3, 3], [5, 3], [4, 2], [1, 1.5]], 3: [[0, 3], [4, 2], [5, 2], [1, 1]], 4: [[0, 4], [5, 2], [3, 1.5]], 5: [[3, 3], [1, 2], [4, 1.5], [0, 1.5]], 1: [[4, 3], [0, 2], [3, 1.5]] },
  lydian: { 0: [[1, 3], [5, 2.5], [4, 2], [2, 1.5]], 1: [[0, 3], [4, 2], [5, 2]], 2: [[5, 3], [0, 2], [1, 1.5]], 4: [[0, 3], [1, 2], [5, 2]], 5: [[1, 3], [0, 2], [4, 2]] },
};
const SHAKE_BARS = 8;

// ---------------------------------------------------------------------------------------------------------------
// Buffers
// ---------------------------------------------------------------------------------------------------------------
function makeNoise(ctx, rng) {
  const sr = ctx.sampleRate, N = Math.floor(sr * 6), X = Math.floor(sr * 0.2), out = {};
  const build = (gen) => {
    const raw = new Float32Array(N + X); gen(raw);
    let s = 0; for (let i = 0; i < raw.length; i++) s += raw[i] * raw[i]; const g = 0.3 / Math.sqrt(s / raw.length);
    const buf = ctx.createBuffer(1, N, sr), d = buf.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = raw[i] * g;
    for (let i = 0; i < X; i++) { const w = (i / X) * Math.PI / 2; d[i] = (raw[i] * Math.sin(w) + raw[N + i] * Math.cos(w)) * g; }   // seamless loop seam
    return buf;
  };
  out.white = build((r) => { for (let i = 0; i < r.length; i++) r[i] = rng() * 2 - 1; });
  out.pink = build((r) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < r.length; i++) { const w = rng() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; r[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; } });
  out.brown = build((r) => { let l = 0; for (let i = 0; i < r.length; i++) { l = (l + 0.02 * (rng() * 2 - 1)) / 1.02; r[i] = l; } });
  return out;
}
function makeIR(ctx, rng, secs = 2.2) {
  const sr = ctx.sampleRate, n = Math.floor(sr * secs), buf = ctx.createBuffer(2, n, sr), pre = Math.floor(0.012 * sr), ramp = Math.floor(0.03 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let l = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, alpha = 0.5 * Math.exp(-t * 1.3) + 0.1; l += alpha * ((rng() * 2 - 1) - l);
      d[i] = i < pre ? 0 : l * Math.exp(-6.9 * t / (secs * 0.85)) * Math.min(1, (i - pre) / ramp);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------------------------
// Engine factory (also used with an OfflineAudioContext for measurement)
// ---------------------------------------------------------------------------------------------------------------
export function createEngine(ctx, opts = {}) {
  const st = opts.settings || { ...DEFAULTS, muted: false };
  const rng = mulberry32(opts.seed === undefined ? (Math.random() * 4294967296) >>> 0 : opts.seed);
  const offline = !!opts.offline || (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext);
  const E = { noise: makeNoise(ctx, rng) };
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };

  // ---- master chain
  const masterIn = G(0.2), revIn = G(1);   // -14 dB of headroom so the dynamics stage only catches peaks
  const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 7000; shelf.gain.value = -2;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.22;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve(2048, 0.8, 0.97);
  const masterOut = G(1);
  masterIn.connect(shelf); shelf.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(masterOut); masterOut.connect(opts.dest || ctx.destination);
  const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx, rng); const revRet = G(0.8); revIn.connect(conv); conv.connect(revRet); revRet.connect(masterIn);

  const grp = () => { const dry = G(1), wet = G(1); dry.connect(masterIn); wet.connect(revIn); return { dry, wet }; };
  const gSfx = grp(), gMus = grp(), gAmb = grp(), gUi = gSfx;
  const GR = { sfx: gSfx, music: gMus, amb: gAmb };
  let analyser = null;

  function applyVolumes(imm) {
    const t = ctx.currentTime, tc = imm ? 0.001 : 0.04;
    masterOut.gain.setTargetAtTime(st.muted ? 0 : amp(st.master), t, st.muted ? 0.02 : tc);
    for (const c of ['sfx', 'music', 'amb']) { const v = amp(st[c]); GR[c].dry.gain.setTargetAtTime(v, t, tc); GR[c].wet.gain.setTargetAtTime(v, t, tc); }
  }
  applyVolumes(true);

  // ---- strip pools (sfx 30 strips, ambience 8)
  function makePool(n, g, max) {
    const strips = [];
    for (let i = 0; i < n; i++) {
      const vg = G(0), sg = G(0), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { vg.connect(pan); pan.connect(g.dry); pan.connect(sg); } else { vg.connect(g.dry); vg.connect(sg); }
      sg.connect(g.wet); strips.push({ vg, sg, pan, nodes: [], end: 0, busy: false, slot: -1, name: '' });
    }
    return { strips, lim: new VoiceLimiter(max), slotStrip: new Array(max).fill(null) };
  }
  const poolSfx = makePool(30, gSfx, 24), poolAmb = makePool(8, gAmb, 6);
  const per = {};          // per-sound state: cooldown, round robin order, last duration
  const stats = { started: 0, dropped: 0, evicted: 0, errors: 0 };
  const K = { ctx, t: 0, out: null, pm: 1, v: 0, r: rng, E, nodes: null, end: 0, o: null };

  function releaseStrip(s) {
    const n = s.nodes; for (let i = 0; i < n.length; i++) { try { n[i].disconnect(); } catch (e) { /* already gone */ } } n.length = 0;
    s.busy = false; s.slot = -1; s.vg.gain.cancelScheduledValues(0); s.vg.gain.value = 0;
  }
  function tick(now) {
    now = now === undefined ? ctx.currentTime : now;
    for (const p of [poolSfx, poolAmb]) { for (let i = 0; i < p.strips.length; i++) { const s = p.strips[i]; if (s.busy && s.end < now) releaseStrip(s); } p.lim.purge(now); }
  }
  function nextVariant(ps) {
    if (ps.i >= 3) { // reshuffle, never start the new cycle with the variant that just played
      const a = ps.ord; for (let i = 3; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
      if (a[0] === ps.lastV) { const x = a[0]; a[0] = a[1]; a[1] = x; } ps.i = 0;
    } else ps.i++;
    return (ps.lastV = ps.ord[ps.i]);
  }
  function play(pool, name, o, isAmb) {
    const spec = CATALOGUE[ALIASES[name] || name];
    if (!spec || st.muted) return false;
    o = o || {}; const now = ctx.currentTime, t = now + (o.delay || 0) + 0.004;
    let ps = per[spec.name]; if (!ps) ps = per[spec.name] = { last: -9, ord: [0, 1, 2, 3], i: 3, lastV: -1, dur: 1, live: 0 };
    if (!isAmb) { if (now - ps.last < spec.cd) { stats.dropped++; return false; } }
    // per-name concurrency
    let same = 0; const ss = pool.strips; for (let i = 0; i < ss.length; i++) if (ss[i].busy && ss[i].name === spec.name && ss[i].end > now) same++;
    if (same >= spec.max) { stats.dropped++; return false; }
    const vol = (o.vol === undefined ? 1 : o.vol) * spec.vol * (TRIM[spec.name] === undefined ? 1 : TRIM[spec.name]);
    if (vol <= 0.0005) return false;
    tick(now);
    const slot = pool.lim.request(now, t + ps.dur + 0.1, vol);
    if (slot < 0) { stats.dropped++; return false; }
    if (pool.lim.evicted >= 0) { const old = pool.slotStrip[slot]; if (old) { old.vg.gain.cancelScheduledValues(now); old.vg.gain.setTargetAtTime(0, now, 0.012); old.end = now + 0.12; old.slot = -1; } stats.evicted++; }
    let strip = null; for (let i = 0; i < ss.length; i++) if (!ss[i].busy) { strip = ss[i]; break; }
    if (!strip) { pool.lim.release(slot); stats.dropped++; return false; }
    pool.slotStrip[slot] = strip; strip.busy = true; strip.slot = slot; strip.name = spec.name; strip.end = t + 0.2; strip.nodes.length = 0;
    strip.vg.gain.cancelScheduledValues(0); strip.vg.gain.setValueAtTime(vol, now);
    if (strip.pan) strip.pan.pan.setValueAtTime(clamp(o.pan || 0, -1, 1), now);
    strip.sg.gain.setValueAtTime(spec.rev * (o.wet === undefined ? 1 : o.wet), now);
    const v = nextVariant(ps), pv = spec.pv;
    K.t = t; K.out = strip.vg; K.v = v; K.pm = (1 + ((v - 1.5) / 1.5) * pv * 0.6 + (rng() - 0.5) * pv * 0.8) * (o.pitch === undefined ? 1 : o.pitch);
    K.nodes = strip.nodes; K.end = t; K.o = o;
    try { spec.fn(K, o); } catch (e) { stats.errors++; releaseStrip(strip); pool.lim.release(slot); return false; }
    strip.end = K.end + 0.1; pool.lim.end[slot] = strip.end; ps.dur = Math.max(0.1, K.end - t); ps.last = now; stats.started++; engine.lastDuration = K.end - t;
    return true;
  }

  // ---- music ---------------------------------------------------------------------------------------------------
  const sessions = []; let curMode = null;
  function newSession(mode, seed) {
    const c = MUSIC[mode], r = mulberry32(seed === undefined ? (rng() * 4294967296) >>> 0 : seed), now = ctx.currentTime;
    const bus = G(0), send = G(c.rev), mel = G(1), pad = G(1), bass = G(c.bass), perc = G(0.8), echoIn = G(c.echo), dly = ctx.createDelay(2), fb = G(0.38), elp = ctx.createBiquadFilter();
    const beat = 60 / c.bpm; dly.delayTime.value = beat * 0.75; elp.type = 'lowpass'; elp.frequency.value = 2400;
    bus.connect(gMus.dry); bus.connect(send); send.connect(gMus.wet);
    mel.connect(bus); pad.connect(bus); bass.connect(bus); perc.connect(bus); mel.connect(echoIn); echoIn.connect(dly); dly.connect(elp); elp.connect(fb); fb.connect(dly); elp.connect(bus);
    const root = c.keys[Math.floor(r() * c.keys.length)];
    const s = {
      mode, cfg: c, rng: r, bus, nodes: [bus, send, mel, pad, bass, perc, echoIn, dly, fb, elp], mel, pad, bass, perc, root, beat, eighth: beat / 2, barLen: beat * 4,
      barT: now + 0.12, barIdx: 0, deg: 0, chordDeg: 0, safe: [], pcs: [], motif: null, last: 5, ph: r() * 6.28, dieAt: Infinity, dead: false,
      k: { ctx, t: 0, out: mel, pm: 1, v: 0, r, E, nodes: [], end: 0, o: null },
    };
    const first = sessions.length === 0, fade = first ? 1.5 : c.fade;
    bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(c.gain * (MUSIC_TRIM[mode] || 1), now + fade);
    for (const o of sessions) if (!o.dead) { o.dead = true; o.bus.gain.cancelScheduledValues(now); o.bus.gain.setValueAtTime(o.bus.gain.value, now); o.bus.gain.linearRampToValueAtTime(0, now + c.fade); o.dieAt = now + c.fade + 6; }
    sessions.push(s); return s;
  }
  function chordPcs(s) {
    const sc = HARM_SCALE[s.cfg.flavor], tones = [0, 2, 4, 6].map((d) => scaleNote(s.root, sc, s.chordDeg + d));
    s.pcs = tones.map((m) => m % 12);
    const ms = MEL_SCALE[s.cfg.flavor], base = s.root + 12; s.safe.length = 0;
    for (let d = -2; d <= 9; d++) if (s.pcs.slice(0, 3).includes(scaleNote(base, ms, d) % 12)) s.safe.push(d);
    return tones;
  }
  function newChord(s, T) {
    const c = s.cfg, r = s.rng;
    s.chordDeg = s.barIdx === 0 ? 0 : pickWeighted(WALK[c.flavor][s.chordDeg] || WALK[c.flavor][0], r());
    const sc = HARM_SCALE[c.flavor], tones = chordPcs(s), len = c.bars * s.barLen, att = Math.min(len * 0.45, 1.4);
    // pad: detuned saws through a slowly opening low-pass
    const env = G(0), lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.Q.value = 0.3; lpf.frequency.setValueAtTime(c.pad[1] * 0.7, T); lpf.frequency.linearRampToValueAtTime(c.pad[1] * 1.15, T + len);
    env.connect(lpf); lpf.connect(s.pad);
    env.gain.setValueAtTime(0, T); env.gain.linearRampToValueAtTime(c.pad[0] * 0.2, T + att); env.gain.setValueAtTime(c.pad[0] * 0.2, T + len); env.gain.linearRampToValueAtTime(0, T + len + 1.6);
    const pcs = [tones[0], tones[1], tones[2], r() < 0.55 ? tones[3] : scaleNote(s.root, sc, s.chordDeg + 8)], stop = T + len + 1.7; s.nodes.push(env, lpf);
    for (let i = 0; i < pcs.length; i++) {
      const m = foldMidi(pcs[i], 52), f = midiToFreq(m);
      for (const det of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det + (r() - 0.5) * 3; o.connect(env); o.start(T); o.stop(stop); }
    }
    const lowO = ctx.createOscillator(), lowG = G(0.5); lowO.type = 'sine'; lowO.frequency.value = midiToFreq(foldMidi(tones[0], 43)); lowO.connect(lowG); lowG.connect(env); lowO.start(T); lowO.stop(stop);
  }
  function melodyBar(s, T, en) {
    const c = s.cfg, r = s.rng, k = s.k, ms = MEL_SCALE[c.flavor], base = s.root + 12, lo = -2, hi = 9;
    const snap = (d) => { let b = d, bd = 99; for (const x of s.safe) { const dd = Math.abs(x - d); if (dd < bd) { bd = dd; b = x; } } return b; };
    const restP = 0.16 + (1 - en) * 0.22; let plan = null; const x = r();
    if (x < restP) plan = null;
    else if (s.motif && x < restP + 0.42) { const sh = [-2, -1, 0, 0, 1, 2][Math.floor(r() * 6)]; plan = { steps: s.motif.steps, degs: s.motif.degs.map((d) => clamp(d + sh, lo, hi)) }; if (r() < 0.35 && plan.steps.length > 2) { plan = { steps: plan.steps.slice(0, -1), degs: plan.degs.slice(0, -1) }; } }
    else {
      const n = clamp(Math.round(2 + r() * (1 + c.dens * 4) * (0.6 + en * 0.6)), 2, 7), W = [3, 1, 2, 1, 3, 1, 2, 1], steps = [];
      while (steps.length < n) { const st2 = pickWeighted(W.map((w, i) => [i, steps.includes(i) ? 0 : w]), r()); if (!steps.includes(st2)) steps.push(st2); else break; }
      steps.sort((a, b) => a - b); let d = snap(s.last + Math.round((r() - 0.5) * 4)); const degs = [];
      for (let i = 0; i < steps.length; i++) { degs.push(d); d = clamp(d + [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)], lo, hi); }
      degs[degs.length - 1] = snap(degs[degs.length - 1]); plan = { steps, degs }; if (r() < 0.6) s.motif = plan;
    }
    if (!plan) return;
    for (let i = 0; i < plan.steps.length; i++) {
      const stp = plan.steps[i]; let d = plan.degs[i]; if (stp === 0 || stp === 4) d = snap(d);
      const strong = stp % 4 === 0, t = T + stp * s.eighth + (stp & 1 ? (c.swing || 0) * s.eighth : 0) + (r() - 0.5) * 0.014, kind = pickWeighted(c.inst, r());
      const m = scaleNote(base, ms, d), vel = (strong ? 0.8 : 0.6) * (0.85 + r() * 0.3);
      k.out = s.mel; k.pm = 1; k.nodes.length = 0; mal(k, kind, midiToFreq(m), 0.32 * vel, t, kind === 'glock' ? 0.8 : 1, c.dark); s.last = d;
    }
  }
  function bassPercBar(s, T, en) {
    const c = s.cfg, r = s.rng, k = s.k, sc = HARM_SCALE[c.flavor], root = foldMidi(scaleNote(s.root, sc, s.chordDeg), 43);
    k.out = s.bass; k.pm = 1; k.nodes.length = 0;
    if (s.barIdx % c.bars === 0 || c.bars === 1) { mal(k, 'marimba', midiToFreq(root), 0.5, T + (r() - 0.5) * 0.01, 1.5); if (r() < 0.5) mal(k, 'marimba', midiToFreq(root + (r() < 0.7 ? 7 : 12)), 0.3, T + 4 * s.eighth, 1.2); }
    if (c.perc) {
      const P = c.perc;
      for (let i = 0; i < 8; i++) {
        const t = T + i * s.eighth + (i & 1 ? c.swing * s.eighth : 0), vel = (0.8 + r() * 0.3);
        k.out = s.perc;
        if (P.kick[i] === 'x') tone(k, { t, f: 115, f2: 52, sw: 0.07, a: 0.003, d: 0.07, v: 0.55 * vel * (i === 0 ? 1 : 0.8) });
        if (P.wood[i] === 'x' && r() < 0.85) { tone(k, { t, f: 780, f2: 640, sw: 0.02, d: 0.02, v: 0.2 * vel }); tone(k, { t, f: 1560, d: 0.01, v: 0.06 * vel }); }
        if (P.shaker[i] === 'x') nz(k, { t, type: 'highpass', f: 6500, q: 0.7, a: 0.003, d: 0.022, v: (i & 2 ? 0.12 : 0.08) * vel });
      }
    }
    if (c.spark > 0 && r() < c.spark * 0.7) {
      k.out = s.mel; const d = clamp(s.safe[Math.floor(r() * s.safe.length)] + 5, 3, 12); mal(k, 'glock', midiToFreq(scaleNote(s.root + 12, MEL_SCALE[c.flavor], d)), 0.14, T + Math.floor(r() * 8) * s.eighth, 0.9);
    }
  }
  function schedBar(s) {
    const T = s.barT, en = 0.55 + 0.45 * Math.sin(s.barIdx * 0.37 + s.ph);
    if (s.barIdx % s.cfg.bars === 0) newChord(s, T);
    if (!(s.barIdx % SHAKE_BARS === SHAKE_BARS - 1 && s.rng() < 0.5)) melodyBar(s, T, en);   // an occasional pad-only breathing bar
    bassPercBar(s, T, en); s.barIdx++; s.barT = T + s.barLen;
  }
  const MUSIC_TRIM = { title: 1, day: 1, dusk: 1, night: 1, rain: 1, festival: 1 };
  // @@MUSIC-TRIM-BEGIN
  Object.assign(MUSIC_TRIM, {});
  // @@MUSIC-TRIM-END
  function pumpMusic(until, now) {
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      if (now > s.dieAt) { for (const n of s.nodes) { try { n.disconnect(); } catch (e) { /* ok */ } } sessions.splice(i, 1); continue; }
      if (s.dead) continue;
      if (s.barT < now) s.barT = now + 0.05;                    // we were suspended or muted: skip the missed bars
      let guard = 0; while (s.barT < until && guard++ < 8) schedBar(s);
    }
  }

  // ---- ambience --------------------------------------------------------------------------------------------------
  const A = { night: 0, rain: 0, wind: 0, water: 0 };
  const AMB_TRIM = { wind: 1, water: 1, rain: 1, insects: 1, crickets: 1 };
  // @@AMB-TRIM-BEGIN
  Object.assign(AMB_TRIM, {});
  // @@AMB-TRIM-END
  const loopSrc = (color) => { const b = E.noise[color], s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(0, rng() * b.duration * 0.9); return s; };
  const BEDS = {
    wind: { level: (a) => a.wind, build(B) {
      const g1 = B.g(0.5), f1 = B.f('bandpass', 380, 0.7); B.src('pink', f1); f1.connect(g1); g1.connect(B.out); B.lfo(0.11, 0.3, g1.gain); B.lfo(0.047, 0.18, g1.gain); B.lfo(0.08, 140, f1.frequency);
      const g2 = B.g(0.1), f2 = B.f('bandpass', 1500, 1.4); B.src('white', f2); f2.connect(g2); g2.connect(B.out); B.lfo(0.17, 0.08, g2.gain); B.lfo(0.06, 500, f2.frequency);
    } },
    water: { level: (a) => a.water, build(B) {
      const g1 = B.g(0.45), f1 = B.f('lowpass', 600, 0.6); B.src('brown', f1); f1.connect(g1); g1.connect(B.out); B.lfo(0.09, 0.35, g1.gain); B.lfo(0.063, 0.15, g1.gain); B.lfo(0.09, 350, f1.frequency);
      const g2 = B.g(0.08), f2 = B.f('bandpass', 2600, 0.6); B.src('pink', f2); f2.connect(g2); g2.connect(B.out); B.lfo(0.09, 0.08, g2.gain); B.lfo(0.063, 0.04, g2.gain);
    } },
    rain: { level: (a) => a.rain, build(B) {
      const g1 = B.g(0.5), h = B.f('highpass', 1200, 0.5), l = B.f('lowpass', 8000, 0.5); B.src('white', h); h.connect(l); l.connect(g1); g1.connect(B.out);
      const g2 = B.g(0.35), f2 = B.f('lowpass', 500, 0.5); B.src('brown', f2); f2.connect(g2); g2.connect(B.out);
      const g3 = B.g(0.22), f3 = B.f('bandpass', 3200, 0.5); B.src('pink', f3); f3.connect(g3); g3.connect(B.out); B.lfo(0.31, 0.05, g3.gain);
    } },
    insects: { level: (a) => (1 - a.night) * (1 - a.rain) * 0.8, build(B) {
      const g1 = B.g(0.22), f1 = B.f('bandpass', 5300, 5); B.src('white', f1); f1.connect(g1); g1.connect(B.out); B.lfo(0.23, 0.18, g1.gain); B.lfo(46, 0.1, g1.gain);
      const g2 = B.g(0.07), f2 = B.f('bandpass', 2300, 0.5); B.src('pink', f2); f2.connect(g2); g2.connect(B.out); B.lfo(0.13, 0.05, g2.gain);
    } },
    crickets: { level: (a) => a.night * (1 - a.rain * 0.85), build(B) {
      [[4400, 29, 2.3], [4750, 33, 1.9], [5100, 26, 2.7]].forEach(([f, am, grp2]) => {
        const o = B.osc(f), g1 = B.g(0.5), g2 = B.g(0.5), g3 = B.g(0.05); o.connect(g1); g1.connect(g2); g2.connect(g3); g3.connect(B.out); B.lfo(am, 0.5, g1.gain); B.lfo(grp2, 0.5, g2.gain);
      });
    } },
  };
  const beds = {}, lastAbove = {};
  const ambOut = G(1), ambSend = G(0.12); ambOut.connect(gAmb.dry); ambOut.connect(ambSend); ambSend.connect(gAmb.wet);
  function startBed(name) {
    const lvl = G(0), nodes = [lvl], srcs = []; lvl.connect(ambOut);
    const B = {
      out: lvl, g: (v) => { const g = G(v); nodes.push(g); return g; }, f: (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; nodes.push(n); return n; },
      src: (color, dest) => { const s = loopSrc(color); srcs.push(s); nodes.push(s); s.connect(dest); return s; },
      osc: (f) => { const o = ctx.createOscillator(); o.frequency.value = f; o.start(0); srcs.push(o); nodes.push(o); return o; },
      lfo: (hz, depth, param) => { const o = ctx.createOscillator(), g = G(depth); o.frequency.value = hz; o.connect(g); g.connect(param); o.start(0); srcs.push(o); nodes.push(o, g); },
    };
    BEDS[name].build(B); beds[name] = { lvl, nodes, srcs, stopAt: 0 };
  }
  function stopBed(name, now) {
    const b = beds[name]; if (!b) return;
    for (const s of b.srcs) { try { s.stop(now); } catch (e) { /* ok */ } } for (const n of b.nodes) { try { n.disconnect(); } catch (e) { /* ok */ } } delete beds[name];
  }
  function pumpAmb(now, imm) {
    for (const name in BEDS) {
      const target = clamp(BEDS[name].level(A), 0, 1) * (AMB_TRIM[name] || 1);
      if (target > 0.012) { lastAbove[name] = now; if (!beds[name]) startBed(name); }
      const b = beds[name]; if (!b) continue;
      if (imm) b.lvl.gain.setValueAtTime(target, now); else b.lvl.gain.setTargetAtTime(target, now, 1.2);
      if (target <= 0.012 && now - (lastAbove[name] || 0) > 6) stopBed(name, now);
    }
  }
  const ONESHOTS = [
    { name: 'birdChirp', rate: (a) => (1 - a.night) * (1 - a.rain) * 0.2, vol: 0.9, pan: 0.9, next: 0 },
    { name: 'windChime', rate: (a) => a.wind * 0.03, vol: 0.8, pan: 0.6, next: 0 },
    { name: 'ribbit', rate: (a) => a.night * (0.1 + a.rain * 0.1), vol: 0.5, pan: 0.9, next: 0 },
    { name: 'owl', rate: (a) => a.night * (1 - a.rain) * 0.02, vol: 0.6, pan: 0.8, next: 0 },
    { name: 'drip', rate: (a) => a.rain * 3.2, vol: 0.45, pan: 1, next: 0 },
    { name: 'bellRing', rate: (a) => (1 - a.night) * (1 - a.rain) * 0.003, vol: 0.5, pan: 0.5, next: 0 },
  ];
  function pumpOneShots(until, now) {
    for (const os of ONESHOTS) {
      const rate = os.rate(A); if (rate < 1e-4) { os.next = 0; continue; }
      if (!os.next || os.next < now) os.next = now + Math.max(0.3, -Math.log(1 - rng()) / rate);
      let g = 0; while (os.next < until && g++ < 4) {
        play(poolAmb, os.name, { delay: Math.max(0, os.next - now), vol: os.vol * (0.45 + rng() * 0.55), pan: (rng() * 2 - 1) * os.pan, pitch: 0.92 + rng() * 0.2 }, true);
        os.next += Math.max(0.3, -Math.log(1 - rng()) / rate);
      }
    }
  }

  // ---- pump + timers -----------------------------------------------------------------------------------------------
  function pump(until) {
    const now = ctx.currentTime; if (until === undefined) until = now + 1.6;
    tick(now); if (st.muted && !offline) return;
    pumpMusic(until, now); pumpAmb(now, false); pumpOneShots(until, now);
  }
  let timer = null; if (!offline && opts.timer !== false && typeof setInterval === 'function') timer = setInterval(() => pump(), 180);

  const engine = {
    ctx, settings: st, lastDuration: 0, output: masterOut,
    sfx(name, o) { return play(poolSfx, name, o, false); },
    ui(name) { return play(poolSfx, name, { pan: 0 }, false); },
    setMusic(mode, o) {
      if (mode === curMode) return true;
      if (!mode || mode === 'off' || !MUSIC[mode]) {
        curMode = null; const now = ctx.currentTime; for (const s of sessions) if (!s.dead) { s.dead = true; s.bus.gain.cancelScheduledValues(now); s.bus.gain.setValueAtTime(s.bus.gain.value, now); s.bus.gain.linearRampToValueAtTime(0, now + 2); s.dieAt = now + 8; }
        return !mode || mode === 'off';
      }
      curMode = mode; newSession(mode, o && o.seed); return true;
    },
    getMusic() { return curMode; },
    musicInfo() { const s = sessions.find((x) => !x.dead); return s ? { mode: s.mode, bpm: s.cfg.bpm, bar: s.barIdx, root: s.root, chordDeg: s.chordDeg } : null; },
    setAmbience(p, o) { if (p) for (const k of ['night', 'rain', 'wind', 'water']) if (typeof p[k] === 'number') A[k] = clamp(p[k], 0, 1); pumpAmb(ctx.currentTime, !!(o && o.immediate)); return { ...A }; },
    getAmbience() { return { ...A }; },
    setVolume(c, v) { c = chan(c); if (!(c in DEFAULTS)) return false; st[c] = clamp(+v || 0, 0, 1); applyVolumes(false); if (opts.persist) saveKey(KEYS[c], st[c]); return true; },
    getVolume(c) { c = chan(c); return c in DEFAULTS ? st[c] : undefined; },
    mute(b) { st.muted = !!b; applyVolumes(false); if (opts.persist) saveKey(KEYS.muted, st.muted ? '1' : '0'); return st.muted; },
    isMuted() { return !!st.muted; },
    pump, tick,
    catalogue() { return Object.values(CATALOGUE).map((s) => ({ name: s.name, cat: s.cat })); },
    stats() {
      let nodes = 0, busy = 0; for (const p of [poolSfx, poolAmb]) for (const s of p.strips) if (s.busy) { busy++; nodes += s.nodes.length; }
      return { voices: poolSfx.lim.count, ambVoices: poolAmb.lim.count, busyStrips: busy, liveNodes: nodes, sessions: sessions.length, beds: Object.keys(beds).length, ...stats };
    },
    getAnalyser() { if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; masterOut.connect(analyser); } return analyser; },
    dispose() { if (timer) clearInterval(timer); timer = null; for (const n in beds) stopBed(n, ctx.currentTime); for (const s of sessions) for (const x of s.nodes) { try { x.disconnect(); } catch (e) { /* ok */ } } sessions.length = 0; },
  };
  return engine;
}

// ---------------------------------------------------------------------------------------------------------------
// Persistence (all storage access is wrapped)
// ---------------------------------------------------------------------------------------------------------------
function saveKey(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } }
function loadSettings() {
  const s = { ...DEFAULTS, muted: false };
  try {
    for (const c of ['master', 'music', 'sfx', 'amb']) { const raw = localStorage.getItem(KEYS[c]); if (raw !== null && raw !== '') { const n = parseFloat(raw); if (isFinite(n)) s[c] = clamp(n, 0, 1); } }
    s.muted = localStorage.getItem(KEYS.muted) === '1';
  } catch (e) { /* storage unavailable */ }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Singleton used by the game
// ---------------------------------------------------------------------------------------------------------------
const settings = loadSettings();
let ctx = null, eng = null, unlocked = false, hooks = false;
const want = { music: null, amb: { night: 0, rain: 0, wind: 0.25, water: 0.2 } };
const listener = { x: 0, range: 22, set(x) { this.x = x; return this; } };

function resumeNow() {
  if (!ctx) return;
  try { if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* ignore */ }
}
function silentKick() { // iOS: playing one silent buffer inside the gesture fully unlocks output
  try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
}
function onVis() {
  if (!ctx) return;
  try { if (document.hidden) { ctx.suspend(); } else { resumeNow(); } } catch (e) { /* ignore */ }
}
function unlock() {
  if (typeof window === 'undefined') return false;
  if (!eng) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); } } catch (e) { ctx = null; return false; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS 16.4+ only */ }
    eng = createEngine(ctx, { settings, persist: true });
    silentKick();
    try { ctx.addEventListener('statechange', () => { unlocked = ctx.state === 'running'; }); } catch (e) { /* ignore */ }
    if (!hooks) { hooks = true; document.addEventListener('visibilitychange', onVis); addEventListener('pagehide', () => { try { ctx.suspend(); } catch (e) { /* ignore */ } }); addEventListener('pageshow', resumeNow); }
    if (want.music) eng.setMusic(want.music); eng.setAmbience(want.amb, { immediate: true });
  }
  resumeNow(); unlocked = ctx.state === 'running';
  return true;
}
function installAutoUnlock() {
  if (typeof window === 'undefined' || typeof addEventListener !== 'function') return;
  const evs = ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'];
  const h = () => { if (unlock() && ctx && ctx.state === 'running') for (const e of evs) removeEventListener(e, h, true); };
  for (const e of evs) addEventListener(e, h, { capture: true, passive: true });
}

export const Audio = {
  createEngine, MUSIC_MODES, KEYS, DEFAULTS,
  /** Create/resume the AudioContext. Call from any user gesture; safe to call repeatedly. Returns false when Web Audio is missing. */
  unlock,
  get ready() { return !!eng; },
  get running() { return !!ctx && ctx.state === 'running'; },
  get ctx() { return ctx; },
  get engine() { return eng; },
  /** Play a catalogue sound. o: { pan -1..1, vol 0..1+, pitch (multiplier, 1 = normal), delay (s) }. Returns true when it actually started. */
  sfx(name, o) { return eng ? eng.sfx(name, o) : false; },
  ui(name) { return eng ? eng.ui(name) : false; },
  setMusic(mode, o) { want.music = mode || null; return eng ? eng.setMusic(mode, o) : true; },
  getMusic() { return eng ? eng.getMusic() : want.music; },
  setAmbience(p) { if (p) for (const k of ['night', 'rain', 'wind', 'water']) if (typeof p[k] === 'number') want.amb[k] = clamp(p[k], 0, 1); return eng ? eng.setAmbience(p) : { ...want.amb }; },
  setVolume(c, v) { c = chan(c); if (!(c in DEFAULTS)) return false; settings[c] = clamp(+v || 0, 0, 1); saveKey(KEYS[c], settings[c]); return eng ? eng.setVolume(c, settings[c]) : true; },
  getVolume(c) { c = chan(c); return c in DEFAULTS ? settings[c] : undefined; },
  mute(b) { settings.muted = !!b; saveKey(KEYS.muted, settings.muted ? '1' : '0'); if (eng) eng.mute(b); return settings.muted; },
  isMuted() { return !!settings.muted; },
  toggleMute() { return Audio.mute(!settings.muted); },
  listener,
  /** Stereo pan for something at world x seen from camera x: -0.85 (far left) .. 0.85 (far right). Pass range to change the falloff width. */
  panFor(x, camX, range) { const c = camX === undefined ? listener.x : camX; return clamp((x - c) / (range || listener.range), -1, 1) * 0.85; },
  /** Simple distance attenuation 0..1 for a world distance (1 within 6 units, fading to 0.15 at 40). */
  volFor(dist) { return clamp(1 - (dist - 6) / 40, 0.15, 1); },
  catalogue() { return Object.values(CATALOGUE).map((s) => ({ name: s.name, cat: s.cat })); },
  stats() { return eng ? eng.stats() : null; },
};
installAutoUnlock();

// ---------------------------------------------------------------------------------------------------------------
// Legacy API used by the current js/main.js (thin wrappers over the engine)
// ---------------------------------------------------------------------------------------------------------------
let legacyOn = false, legacyMode = 'day', lastN = -1, lastR = -1;
function modeFor(n, r) {
  const m = legacyMode;
  if (r > (m === 'rain' ? 0.35 : 0.5)) return 'rain';
  if (n > (m === 'night' ? 0.5 : 0.6)) return 'night';
  if (n > (m === 'dusk' || m === 'night' ? 0.17 : 0.25)) return 'dusk';
  return 'day';
}
export const audioOn = () => legacyOn && !settings.muted;
export function setAmbient(nightAmt, rainAmt) {
  const n = +nightAmt || 0, r = +rainAmt || 0;
  if (Math.abs(n - lastN) < 0.01 && Math.abs(r - lastR) < 0.01) return; lastN = n; lastR = r;
  legacyMode = modeFor(n, r);
  if (!legacyOn) return;
  Audio.setAmbience({ night: n, rain: r }); Audio.setMusic(legacyMode);
}
export function toggleAudio(force) {
  const on = force === undefined ? !audioOn() : !!force;
  if (on) {
    if (!unlock()) return false;
    Audio.mute(false); legacyOn = true; Audio.setMusic(legacyMode); Audio.setAmbience({ wind: 0.25, water: 0.2, night: Math.max(0, lastN), rain: Math.max(0, lastR) });
  } else { legacyOn = false; Audio.setMusic(null); Audio.setAmbience({ night: 0, rain: 0, wind: 0, water: 0 }); }
  try { localStorage.setItem('hearthvale.music', legacyOn ? '1' : '0'); } catch (e) { /* ignore */ }
  return legacyOn;
}
export function wantsMusic() { try { return localStorage.getItem('hearthvale.music') !== '0' && localStorage.getItem(KEYS.muted) !== '1'; } catch (e) { return true; } }
