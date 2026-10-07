/* Encore Island audio: procedural candy-pop WebAudio (sfx + looping groove + beat clock).
 * Plain browser script, defines global `AUDIO`. No assets, seeded local LCG only,
 * every public method is a silent no-op without WebAudio / before init and never throws.
 * Levels: sfx peaks ~ -10 dBFS, music bus ~ -16 dBFS, soft limiter on the master. */
const AUDIO = (() => {
  'use strict';
  const G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : {});
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- deterministic rng (seeded LCG) ---------- */
  let seed = 0x2545F491;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const jit = amt => 1 + (rnd() * 2 - 1) * amt;

  /* ---------- state ---------- */
  const A = {};                       // the public object (also used as state holder for muted/bpm)
  let ctx = null, master = null, comp = null, musicBus = null, duckGain = null, musicFilter = null,
    sfxBus = null, revIn = null, noiseBuf = null, listening = false;
  let musicVol = 0.8, sfxVol = 0.85, mutedApplied = false;
  const MASTER = 0.85, MUSIC_BASE = 0.36, SFX_BASE = 1.0;
  let playing = false, wantMusic = false, fadeEnd = 0;
  let step = 0, nextT = 0, lastTickT = 0, timer = null;
  let intT = 0.6, intV = 0.6, encOn = false, encV = 0;
  let reqBiome = 0, curBiome = 0, curShift = 0, curTimbre = 0, pendingBiome = null;
  const MAXV = 24, MAX_MUSIC_OSC = 44, AHEAD = 0.12;
  let voices = [];
  const mAct = [];                    // end times of live music oscillators
  const lastPlay = {};
  const listeners = [];
  let lastBeatIdx = null;

  A.muted = false;
  A.bpm = 112;

  /* ---------- beat clock ---------- */
  let fakeT = null, srcKind = null, srcBase = 0, lastT = 0, beatBase = 0, bpmUsed = 112, lastBeat = 0;
  const clampBpm = b => clamp(+b || 112, 40, 220);
  function srcNow() {
    if (fakeT !== null) return ['f', fakeT];
    if (ctx && ctx.state === 'running') return ['c', ctx.currentTime];
    const p = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return ['p', p / 1000];
  }
  function beat() {
    const s = srcNow(), k = s[0], t = s[1];
    if (k !== srcKind) {
      if (srcKind !== null) beatBase += (lastT - srcBase) * bpmUsed / 60;
      srcKind = k; srcBase = t;
    }
    const nb = clampBpm(A.bpm);
    if (nb !== bpmUsed) { beatBase += (t - srcBase) * bpmUsed / 60; srcBase = t; bpmUsed = nb; }
    lastT = t;
    let b = beatBase + (t - srcBase) * bpmUsed / 60;
    if (b < lastBeat) b = lastBeat;
    lastBeat = b;
    return b;
  }
  // make beat() hit an integer exactly at ctx time T (music downbeat) without ever going backwards
  function alignBeat(T) {
    const cur = beat();
    if (srcKind !== 'c') return;
    const B = Math.ceil(cur + (T - ctx.currentTime) * bpmUsed / 60);
    beatBase = B; srcBase = T;
  }
  function pollBeats() {
    if (!listeners.length) { lastBeatIdx = null; return; }
    const idx = Math.floor(beat());
    if (lastBeatIdx === null) { lastBeatIdx = idx; return; }
    if (idx > lastBeatIdx) {
      const from = Math.max(lastBeatIdx + 1, idx - 3);
      lastBeatIdx = idx;
      for (let i = from; i <= idx; i++) {
        for (const fn of listeners.slice()) { try { fn(i); } catch (e) { /* ignore game callback errors */ } }
      }
    }
  }

  /* ---------- nodes / helpers ---------- */
  const later = (fn, ms) => { try { if (typeof setTimeout === 'function') { const h = setTimeout(fn, ms); if (h && h.unref) h.unref(); } } catch (e) { /* ignore */ } };
  const disc = n => { try { n.disconnect(); } catch (e) { /* ignore */ } };
  function bq(type, f, q) {
    const n = ctx.createBiquadFilter();
    n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q;
    return n;
  }
  function makeNoise() {
    const sr = ctx.sampleRate || 44100, n = Math.floor(sr * 1.2);
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData ? b.getChannelData(0) : null;
    if (d) for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return b;
  }
  function makeReverb() {
    if (!ctx.createConvolver) return null;
    const sr = ctx.sampleRate || 44100, n = Math.floor(sr * 1.3);
    const b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData ? b.getChannelData(ch) : null;
      if (!d) continue;
      for (let i = 0; i < n; i++) { const x = i / n; d[i] = (rnd() * 2 - 1) * Math.pow(1 - x, 2.6) * (x < 0.004 ? x / 0.004 : 1); }
    }
    const cv = ctx.createConvolver(); cv.buffer = b;
    const inG = ctx.createGain(); inG.gain.value = 1;
    const ret = ctx.createGain(); ret.gain.value = 0.3;
    const lp = bq('lowpass', 4500, 0.5);
    inG.connect(cv); cv.connect(lp); lp.connect(ret); ret.connect(master);
    return inG;
  }

  /* ---------- tone / noise primitives (V = voice or music target) ---------- */
  function track(V, src, nodes, endT) {
    if (endT > V.end) V.end = endT;
    if (V.voice) { V.pending++; V.srcs.push(src); }
    else mAct.push(endT);
    src.onended = () => {
      nodes.forEach(disc);
      if (V.voice && --V.pending <= 0) finishVoice(V);
    };
  }
  function tone(V, type, f, t, d, g, o) {
    o = o || {};
    g = Math.max(g, 0.0002); d = Math.max(d, 0.02);
    const c = ctx, osc = c.createOscillator(), gn = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(clamp(f, 20, 4800), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(clamp(o.f2, 20, 4800), t + (o.fd || d));
    if (o.det) osc.detune.value = o.det;
    const a = Math.max(0.003, o.a || 0.004), e = gn.gain;
    e.setValueAtTime(0.0001, t);
    e.linearRampToValueAtTime(g, t + a);
    if (o.rel) e.setValueAtTime(g, Math.max(t + a + 0.001, t + d - o.rel));
    else if (o.sus) e.linearRampToValueAtTime(g * o.sus, t + a + (d - a) * 0.55);
    e.exponentialRampToValueAtTime(0.0001, t + d);
    const nodes = [osc, gn];
    if (o.lp) {
      const fl = bq('lowpass', o.lp, o.q || 0.7);
      if (o.lp2) { fl.frequency.setValueAtTime(o.lp, t); fl.frequency.exponentialRampToValueAtTime(o.lp2, t + d); }
      osc.connect(fl); fl.connect(gn); nodes.push(fl);
    } else osc.connect(gn);
    gn.connect(o.dest || V.out);
    osc.start(t); osc.stop(t + d + 0.03);
    track(V, osc, nodes, t + d + 0.03);
    return gn;
  }
  function noise(V, t, d, g, o) {
    o = o || {};
    g = Math.max(g, 0.0002); d = Math.max(d, 0.01);
    const c = ctx, src = c.createBufferSource(), gn = c.createGain();
    src.buffer = noiseBuf;
    const fl = bq(o.type || 'bandpass', o.f || 2000, o.q || 0.8);
    if (o.f2) { fl.frequency.setValueAtTime(o.f || 2000, t); fl.frequency.exponentialRampToValueAtTime(o.f2, t + d); }
    const a = Math.max(0.003, o.a || 0.003), e = gn.gain;
    e.setValueAtTime(0.0001, t);
    e.linearRampToValueAtTime(g, t + a);
    e.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(fl); fl.connect(gn); gn.connect(o.dest || V.out);
    src.start(t, rnd() * 0.6, d + 0.05); src.stop(t + d + 0.03);
    track(V, src, [src, fl, gn], t + d + 0.03);
  }

  /* ---------- sfx voices ---------- */
  function finishVoice(v) {
    disc(v.out); if (v.pan) disc(v.pan);
    const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
  }
  function pruneVoices(now) {
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      if (v.end < now - 0.05) { disc(v.out); if (v.pan) disc(v.pan); voices.splice(i, 1); }
    }
  }
  function dropVoice(now) {
    let bi = 0, bs = Infinity;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i], s = v.vol - (now - v.t0) * 0.25;   // quietest + oldest goes first
      if (s < bs) { bs = s; bi = i; }
    }
    const v = voices[bi]; if (!v) return;
    try { v.out.gain.cancelScheduledValues(now); v.out.gain.setTargetAtTime(0, now, 0.008); } catch (e) { /* ignore */ }
    v.srcs.forEach(s => { try { s.stop(now + 0.05); } catch (e) { /* ignore */ } });
    voices.splice(bi, 1);
    later(() => { disc(v.out); if (v.pan) disc(v.pan); }, 120);
  }
  function newVoice(vol) {
    const now = ctx.currentTime;
    pruneVoices(now);
    while (voices.length >= MAXV) dropVoice(now);
    const out = ctx.createGain(); out.gain.value = 1;
    const v = { voice: true, out, pending: 0, srcs: [], end: now, vol, t0: now, pan: null };
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp((rnd() * 2 - 1) * 0.18, -1, 1);
      out.connect(p); p.connect(sfxBus); v.pan = p;
    } else out.connect(sfxBus);
    voices.push(v);
    return v;
  }

  /* ---------- sfx table ---------- */
  // each entry: (T, N, p) with T(type, f, dt, dur, gain, opts) and N(dt, dur, gain, opts); times relative to now
  const S = {
    shoot: T => { T('square', 880, 0, 0.09, 0.1, { f2: 520, lp: 3000 }); T('sine', 1320, 0, 0.07, 0.07, { f2: 880 }); },
    hit: (T, N) => { N(0, 0.06, 0.2, { f: 1400, q: 0.9 }); T('sine', 220, 0, 0.09, 0.22, { f2: 110 }); },
    kill: (T, N) => { T('sine', 520, 0, 0.08, 0.17, { f2: 1040 }); T('sine', 110, 0.02, 0.2, 0.3, { f2: 50 }); N(0, 0.05, 0.08, { type: 'lowpass', f: 2200 }); },
    crit: (T, N) => { N(0, 0.06, 0.18, { f: 1600, q: 0.9 }); T('sine', 240, 0, 0.09, 0.2, { f2: 120 });
      T('triangle', 1568, 0.012, 0.4, 0.11); T('sine', 2349, 0.012, 0.3, 0.06); },
    pick: T => { T('triangle', 784, 0, 0.1, 0.14, { f2: 1180 }); T('sine', 1568, 0.01, 0.08, 0.05, { f2: 2360 }); },
    sell: (T, N) => { N(0, 0.015, 0.14, { type: 'highpass', f: 4500, q: 0.5 }); N(0.06, 0.015, 0.12, { type: 'highpass', f: 4000, q: 0.5 });
      T('triangle', 1760, 0.1, 0.3, 0.1); T('sine', 2349, 0.13, 0.35, 0.07); },
    coin: T => { T('triangle', 988, 0, 0.09, 0.12); T('triangle', 1319, 0.07, 0.32, 0.12); T('sine', 2637, 0.07, 0.2, 0.04); },
    pour: (T, N) => { N(0, 0.03, 0.07, { f: 3400, q: 1.2 }); N(0.027, 0.03, 0.06, { f: 3900, q: 1.2 }); N(0.052, 0.03, 0.05, { f: 3000, q: 1.2 }); },
    built: T => { [72, 76, 79].forEach((m, i) => {
      T('triangle', mf(m), i * 0.09, i === 2 ? 0.5 : 0.18, 0.14, { sus: 0.7 }); T('sine', mf(m + 12), i * 0.09, 0.2, 0.04); }); },
    unlock: (T, N) => {
      [72, 76, 79, 84, 88].forEach((m, i) => { T('triangle', mf(m), i * 0.1, 0.35, 0.12); T('square', mf(m), i * 0.1, 0.18, 0.04, { lp: 2400 }); });
      [72, 79, 84, 88].forEach(m => T('triangle', mf(m), 0.5, 0.9, 0.07, { a: 0.02, sus: 0.8 }));
      T('sine', mf(48), 0, 0.9, 0.16, { a: 0.03, sus: 0.8 });
      for (let i = 0; i < 6; i++) T('sine', 2000 + rnd() * 1300, 0.45 + i * 0.07, 0.25, 0.035);
    },
    levelup: T => {
      [72, 76, 79, 84, 79, 84].forEach((m, i) => { T('triangle', mf(m), i * 0.07, 0.2, 0.13); T('square', mf(m), i * 0.07, 0.1, 0.03, { lp: 2600 }); });
      [84, 88, 91].forEach(m => T('triangle', mf(m), 0.42, 0.55, 0.08, { sus: 0.7 }));
    },
    hurt: (T, N) => { T('triangle', 440, 0, 0.2, 0.2, { f2: 220, lp: 1400 }); N(0, 0.06, 0.1, { type: 'lowpass', f: 700 }); },
    die: T => { T('triangle', 523, 0, 0.75, 0.2, { f2: 196, lp: 1200, sus: 0.8 }); T('sine', 130, 0, 0.55, 0.2, { f2: 65 }); },
    zap: (T, N) => { T('sawtooth', 1800, 0, 0.18, 0.08, { f2: 300, lp: 3800 });
      [1200, 1800, 900].forEach((f, i) => T('square', f, i * 0.035, 0.035, 0.05, { lp: 3500 }));
      N(0, 0.15, 0.05, { type: 'highpass', f: 3000, q: 0.5 }); },
    boom: (T, N) => { T('sine', 90, 0, 0.38, 0.5, { f2: 35, fd: 0.3 }); N(0, 0.32, 0.26, { type: 'lowpass', f: 900, f2: 200, q: 0.5 }); },
    gem: T => { [1568, 2093, 2637].forEach((f, i) => { T('sine', f, i * 0.05, 0.45, 0.08); T('sine', f * 2.01, i * 0.05, 0.25, 0.015); }); },
    smelt: (T, N) => { T('sine', 1800, 0, 0.09, 0.07); T('sine', 2655, 0, 0.06, 0.04); N(0, 0.02, 0.05, { f: 5000, q: 1 }); },
    warp: (T, N) => { N(0, 0.55, 0.16, { f: 400, f2: 3000, q: 1.3, a: 0.12 }); T('sine', 220, 0, 0.55, 0.1, { f2: 880, a: 0.1 }); },
    boss: (T, N) => {
      [110, 131, 165].forEach((f, i) => T('sawtooth', f, 0, 1.15, 0.085, { a: 0.1, lp: 500, lp2: 1500, det: i * 4, sus: 0.8 }));
      T('sine', 55, 0, 0.95, 0.3, { a: 0.02, sus: 0.7 }); N(0, 0.12, 0.12, { type: 'lowpass', f: 600 }); },
    chest: (T, N) => { N(0, 0.09, 0.07, { type: 'lowpass', f: 300, f2: 1800 });
      [79, 83, 86, 91].forEach((m, i) => { T('sine', mf(m), 0.1 + i * 0.05, 0.4, 0.1); T('triangle', mf(m + 12), 0.1 + i * 0.05, 0.2, 0.025); }); },
    ui_tap: (T, N) => { T('triangle', 1000, 0, 0.035, 0.09); N(0, 0.012, 0.04, { type: 'highpass', f: 5000 }); },
    ui_open: (T, N) => { N(0, 0.15, 0.07, { f: 600, f2: 2400, q: 1 }); T('triangle', 500, 0, 0.13, 0.06, { f2: 900 }); },
    ui_close: (T, N) => { N(0, 0.15, 0.07, { f: 2400, f2: 600, q: 1 }); T('triangle', 900, 0, 0.13, 0.06, { f2: 500 }); },
    combo: T => { T('triangle', 880, 0, 0.14, 0.13); T('triangle', 1320, 0.075, 0.3, 0.13); T('sine', 2640, 0.075, 0.2, 0.035); },
    encore: (T, N) => {
      N(0, 0.03, 0.2, { f: 1500, q: 0.9 }); N(0.012, 0.03, 0.18, { f: 1700, q: 0.9 }); N(0.024, 0.03, 0.18, { f: 1400, q: 0.9 });
      N(0.04, 0.22, 0.12, { f: 1300, q: 0.8 });
      T('sine', 130, 0, 0.25, 0.3, { f2: 55 });
      [60, 64, 67, 72, 76].forEach((m, i) => { T('triangle', mf(m), 0.02, 1.2, 0.09, { a: 0.01, sus: 0.7 }); T('sawtooth', mf(m), 0.02, 0.9, 0.025, { a: 0.01, lp: 2200, det: i * 3 }); });
      for (let i = 0; i < 5; i++) T('sine', 2200 + rnd() * 1000, 0.15 + i * 0.06, 0.25, 0.03);
    },
    dash: (T, N) => { N(0, 0.24, 0.1, { f: 1500, f2: 4000, q: 0.9, a: 0.04 }); },
    ult: (T, N) => {
      T('sawtooth', 110, 0, 1.0, 0.09, { f2: 880, a: 0.05, lp: 400, lp2: 5000 });
      T('sine', 55, 0, 1.0, 0.25, { f2: 220, a: 0.05 });
      N(0, 1.0, 0.11, { f: 300, f2: 6000, q: 1.1, a: 0.1 });
      [72, 79, 84].forEach(m => T('triangle', mf(m), 0.95, 0.6, 0.1, { sus: 0.7 }));
      T('sine', 90, 0.95, 0.3, 0.3, { f2: 40 });
    },
    pet: T => { T('sine', 900, 0, 0.07, 0.13, { f2: 1500 }); T('triangle', 1200, 0.085, 0.1, 0.12, { f2: 1800 }); },
    spin: (T, N) => { N(0, 0.014, 0.1, { f: 2500, q: 1.5 }); T('triangle', 1500, 0, 0.022, 0.08, { f2: 1000 }); },
    win: (T, N) => {
      [72, 74, 76, 79, 81, 84, 88, 91].forEach((m, i) => { T('triangle', mf(m), i * 0.055, 0.22, 0.12); T('square', mf(m), i * 0.055, 0.1, 0.025, { lp: 2800 }); });
      [60, 64, 67, 72, 76].forEach(m => T('triangle', mf(m), 0.45, 1.1, 0.085, { a: 0.012, sus: 0.7 }));
      T('sine', 130, 0.45, 0.3, 0.28, { f2: 55 });
      for (let i = 0; i < 7; i++) { T('triangle', 988, 0.5 + i * 0.1, 0.1, 0.06, { f2: 988 }); T('triangle', 1319, 0.56 + i * 0.1, 0.25, 0.06); }
    },
  };
  const GAP = { coin: 0.04, pick: 0.035, hit: 0.035, shoot: 0.05, pour: 0.04, spin: 0.03, smelt: 0.05, gem: 0.06, zap: 0.05,
    ui_tap: 0.03, kill: 0.04, crit: 0.04, hurt: 0.08, combo: 0.05, pet: 0.08, dash: 0.08 };
  // per-kind loudness trim so quiet tick-like kinds sit near the big ones (measured with an offline render)
  const TRIM = { coin: 2.2, hit: 1.7, kill: 1.5, pick: 1.7, shoot: 1.6, pour: 1.7, ui_tap: 1.6, ui_open: 1.5, ui_close: 1.5, smelt: 1.7, spin: 1.6,
    pet: 1.5, combo: 1.7, gem: 1.6, chest: 1.5, sell: 1.6, dash: 1.5, hurt: 1.4, unlock: 1.2, levelup: 1.2, built: 1.4, crit: 1.4, zap: 1.4, die: 1.2, warp: 1.2 };
  const KINDS = Object.keys(S);

  function play(kind, pitch, vol, force) {
    const fn = S[kind];
    if (!fn || !ctx || A.muted || ctx.state !== 'running' || !sfxBus || !noiseBuf) return false;
    const now = ctx.currentTime;
    if (!force) {
      const gap = GAP[kind] || 0.02;
      if (lastPlay[kind] !== undefined && now - lastPlay[kind] < gap) return false;
    }
    lastPlay[kind] = now;
    const p = clamp(+pitch || 1, 0.25, 3) * jit(0.015), vg = clamp(vol == null ? 1 : +vol, 0, 2) * jit(0.06) * (TRIM[kind] || 1);
    if (vg <= 0.001) return false;
    const v = newVoice(vg), t0 = now + 0.004;
    const T = (type, f, dt, d, g, o) => {
      o = o ? Object.assign({}, o) : {};
      if (o.f2) o.f2 *= p;
      tone(v, type, f * p, t0 + dt, d, g * vg, o);
    };
    const N = (dt, d, g, o) => noise(v, t0 + dt, d, g * vg, o);
    fn(T, N, p);
    return true;
  }

  /* ---------- victory stinger (own arrangement) ---------- */
  function victory() {
    if (!ctx || A.muted || ctx.state !== 'running') return false;
    const v = newVoice(1), t0 = ctx.currentTime + 0.01;
    [72, 76, 79, 84].forEach((m, i) => { tone(v, 'triangle', mf(m), t0 + i * 0.12, 0.3, 0.13); tone(v, 'square', mf(m), t0 + i * 0.12, 0.12, 0.03, { lp: 2600 }); });
    [60, 64, 67, 72, 79].forEach((m, i) => { tone(v, 'triangle', mf(m), t0 + 0.5, 1.6, 0.09, { a: 0.015, sus: 0.7 });
      tone(v, 'sawtooth', mf(m), t0 + 0.5, 1.2, 0.02, { a: 0.02, lp: 2000, det: i * 3 }); });
    tone(v, 'sine', 130, t0 + 0.5, 0.35, 0.28, { f2: 55 });
    for (let i = 0; i < 5; i++) tone(v, 'sine', 2000 + rnd() * 1200, t0 + 0.6 + i * 0.09, 0.3, 0.03);
    return true;
  }

  /* ---------- music ---------- */
  // chords (midi, C major): bass root, pad voicing, arp triad
  const CH = {
    C: { bass: 48, pad: [60, 64, 67, 71], arp: [60, 64, 67, 72] },
    G: { bass: 43, pad: [59, 62, 67, 69], arp: [62, 67, 71, 74] },
    Am: { bass: 45, pad: [60, 64, 67, 69], arp: [60, 64, 69, 72] },
    F: { bass: 41, pad: [60, 65, 69, 72], arp: [60, 65, 69, 72] },
  };
  const PROG = [CH.C, CH.G, CH.Am, CH.F, CH.C, CH.G, CH.F, CH.G];       // 8 bars: I V vi IV | I V IV V
  // pentatonic hook, [step, semitones above C5, length in 16ths]
  const HOOK = [
    [[0, 7, 3], [3, 4, 1], [4, 7, 2], [6, 9, 2], [8, 12, 6]],
    [[0, 14, 3], [3, 12, 1], [4, 9, 2], [6, 7, 2], [8, 9, 4], [12, 7, 4]],
    [[0, 9, 3], [3, 12, 1], [4, 16, 4], [8, 14, 2], [10, 12, 2], [12, 9, 4]],
    [[0, 9, 3], [3, 7, 1], [4, 9, 2], [6, 12, 2], [8, 9, 3], [11, 7, 1], [12, 7, 4]],
    [[0, 12, 3], [3, 9, 1], [4, 7, 2], [6, 4, 2], [8, 7, 6]],
    [[0, 14, 3], [3, 16, 1], [4, 14, 2], [6, 12, 2], [8, 9, 2], [10, 7, 2], [12, 9, 4]],
    [[0, 12, 3], [3, 9, 1], [4, 12, 2], [6, 14, 2], [8, 12, 4], [12, 9, 4]],
    [[0, 7, 2], [2, 9, 2], [4, 12, 2], [6, 14, 2], [8, 16, 4], [12, 14, 2], [14, 12, 2]],
  ].map(bar => { const m = {}; bar.forEach(n => { m[n[0]] = n; }); return m; });
  const KEYS = [0, 5, -2, 2, -5, 3];                                    // C F Bb D G Eb
  const ARPS = [
    { t: 'square', c0: 3600, c1: 900, d: 0.16, g: 0.05, bell: false },
    { t: 'sawtooth', c0: 3000, c1: 700, d: 0.2, g: 0.04, bell: false },
    { t: 'triangle', c0: 5000, c1: 1500, d: 0.26, g: 0.09, bell: false },
    { t: 'sine', c0: 6000, c1: 2000, d: 0.3, g: 0.1, bell: true },
  ];
  const LEADT = ['triangle', 'sine', 'triangle', 'sine'];
  const BASSP = [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]];     // [step, length]; semis added below
  const BASSN = { 0: 0, 3: 0, 6: 12, 8: 0, 11: 7, 14: 12 };
  const MUS = { voice: false, out: null, end: 0 };
  const lay = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
  const foldBass = m => { while (m > 52) m -= 12; while (m < 38) m += 12; return m; };

  function musicOscFree() { const n = ctx.currentTime; let c = 0; for (let i = mAct.length - 1; i >= 0; i--) { if (mAct[i] < n) mAct.splice(i, 1); else c++; } return MAX_MUSIC_OSC - c; }

  function kick(t, g) {
    tone(MUS, 'sine', 140, t, 0.32, 0.42 * g, { f2: 48, fd: 0.12, a: 0.003 });
    noise(MUS, t, 0.018, 0.07 * g, { type: 'lowpass', f: 1800 });
  }
  function snap(t, g) {
    noise(MUS, t, 0.065, 0.2 * g, { f: 2300, q: 1.4 });
    tone(MUS, 'triangle', 1700, t, 0.04, 0.08 * g, { f2: 1000 });
  }
  function clap(t, g) {
    for (let i = 0; i < 3; i++) noise(MUS, t + i * 0.011, 0.022, 0.11 * g, { f: 1400, q: 0.9 });
    noise(MUS, t + 0.033, 0.14, 0.08 * g, { f: 1200, q: 0.8 });
  }
  function hat(t, g, open) { noise(MUS, t, open ? 0.2 : 0.03, (open ? 0.05 : 0.06) * g, { f: 9500, q: 0.5 }); }

  function applyPending() {
    if (pendingBiome !== null) {
      curBiome = pendingBiome; pendingBiome = null;
      curShift = KEYS[Math.floor(curBiome / 2) % KEYS.length];
      curTimbre = ((curBiome % 4) + 4) % 4;
    }
  }

  function scheduleStep(si, t) {
    const bpm = clampBpm(A.bpm), sd = 60 / bpm / 4;
    const s = si & 15, bar = (si >> 4) & 7;
    if (s === 0) applyPending();
    if (A.muted) return;
    const ch = PROG[bar], sh = curShift, E = encV;
    const ie = intV + (1 - intV) * E * 0.8;
    const sw = (s & 1) ? sd * 0.12 : 0;
    const free = musicOscFree();

    // percussion
    if (s === 0 || s === 8) kick(t, 0.7 + 0.3 * ie);
    else if (s === 10) { const m = lay(ie, 0.5, 0.7); if (m > 0.05) kick(t, 0.7 * m); }
    else if ((s === 4 || s === 12) && E > 0.5) kick(t, 0.55 * E);
    if (s === 4 || s === 12) { const m = lay(ie, 0.08, 0.25); if (m > 0.05) snap(t, m); }
    if (s === 12) { const m = lay(ie, 0.5, 0.7); if (m > 0.05) clap(t, m); }
    if (bar === 7 && (s === 14 || s === 15)) { const m = lay(ie, 0.3, 0.5); if (m > 0.05) snap(t, 0.7 * m); }
    if (s === 0 && bar === 0) { const m = lay(ie, 0.6, 0.8); if (m > 0.05) noise(MUS, t, 0.9, 0.04 * m, { f: 6000, q: 0.4 }); }
    if (free > 6) {
      let hg = 0;
      if (s & 1) hg = Math.max(lay(ie, 0.8, 0.95), E * 0.8) * 0.6;
      else if (s % 4 === 2) hg = lay(ie, 0.2, 0.4);
      else hg = lay(ie, 0.5, 0.7) * 0.7;
      if (hg > 0.05) hat(t + sw, hg, false);
      if (s === 14) { const m = lay(ie, 0.6, 0.8); if (m > 0.05) hat(t, m, true); }
    }

    // bass: roots on 1 & 3 at intensity 0, full groove from ~0.15
    const full = lay(ie, 0.12, 0.3);
    const root = foldBass(ch.bass + sh);
    if (full < 0.5) {
      if (s === 0 || s === 8) bassNote(root, t, sd * 7, 0.9);
    } else {
      for (let i = 0; i < BASSP.length; i++) {
        if (BASSP[i][0] === s) bassNote(foldBass(root + BASSN[s]), t, sd * BASSP[i][1], 1);
      }
    }

    // pad once per bar
    if (s === 0) {
      const barD = sd * 16;
      const fl = bq('lowpass', 1100 + 700 * ie, 0.6);
      fl.connect(MUS.out);
      const pg = ctx.createGain(); pg.gain.value = 1; pg.connect(fl);
      const pv = { voice: false, out: pg, end: 0 };
      ch.pad.forEach((m, i) => {
        const f = mf(m + sh);
        tone(pv, 'triangle', f, t, barD + 0.25, 0.04, { a: 0.22, rel: 0.5 });
        tone(pv, 'sawtooth', f, t, barD + 0.25, 0.018, { a: 0.3, rel: 0.5, det: 6 + i * 2 });
      });
      mAct.push(t + barD + 0.5);
      later(() => { disc(pg); disc(fl); }, Math.ceil((t - ctx.currentTime + barD + 0.6) * 1000));
    }

    // arp
    const ag = Math.max(lay(ie, 0.25, 0.45), 0);
    if (ag > 0.05 && free > 4) {
      const fast = ie > 0.75 || E > 0.5;
      if (!(s & 1) || fast) {
        const idx = (s & 1) ? ((s + 1) >> 1) % 4 : [0, 1, 2, 3, 2, 1, 2, 1][(s >> 1) & 7];
        const A0 = ARPS[curTimbre], m = ch.arp[idx] + 12 + sh;
        const g = A0.g * ag * ((s & 1) ? 0.55 : (s % 4 === 0 ? 1.2 : 0.9));
        tone(MUS, A0.t, mf(m), t + sw, A0.d, g, { lp: A0.c0, lp2: A0.c1, a: 0.003 });
        if (A0.bell) tone(MUS, 'sine', mf(m) * 2, t + sw, A0.d * 0.6, g * 0.3);
      }
    }

    // lead hook (pentatonic)
    const lg = E > 0.5 ? Math.max(lay(ie, 0.5, 0.7), 0.9) : lay(ie, 0.5, 0.7);
    if (lg > 0.05 && free > 3) {
      const n = HOOK[bar][s];
      if (n) {
        let m = 72 + n[1] + sh + (E > 0.5 ? 12 : 0);
        while (m > 96) m -= 12;
        const d = Math.max(0.1, n[2] * sd * 0.92), g = 0.075 * lg * (E > 0.5 ? 1.3 : 1);
        tone(MUS, LEADT[curTimbre], mf(m), t, d, g, { a: 0.008, sus: 0.8, lp: 3600 });
        tone(MUS, 'square', mf(m), t, d, g * 0.28, { a: 0.008, det: 5, lp: 2400, sus: 0.7 });
      }
    }
  }
  function bassNote(m, t, d, g) {
    const f = mf(m);
    tone(MUS, 'sine', f, t, d, 0.3 * g, { a: 0.006, sus: 0.6 });
    tone(MUS, 'triangle', f, t, d, 0.1 * g, { a: 0.006, lp: 700, sus: 0.5 });
  }

  function tick() {
    try {
      pollBeats();
      if (mutedApplied !== A.muted) A.setMuted(A.muted);
      if (!ctx || !playing) { ensureTimer(); return; }
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const dt = clamp(now - lastTickT, 0, 0.25); lastTickT = now;
      intV += (intT - intV) * (1 - Math.exp(-dt / 0.7));
      encV += ((encOn ? 1 : 0) - encV) * (1 - Math.exp(-dt / 0.25));
      if (fadeEnd && now >= fadeEnd) { A.musicStop(); return; }
      if (nextT < now - 0.1) nextT = now + 0.05;                 // tab was asleep: resync, don't burst
      while (nextT < now + AHEAD) {
        scheduleStep(step, nextT);
        nextT += 60 / clampBpm(A.bpm) / 4; step++;
      }
    } catch (e) { /* never throw out of the scheduler */ }
  }
  function ensureTimer() {
    const need = playing || listeners.length > 0;
    if (need && !timer && typeof setInterval === 'function') {
      timer = setInterval(tick, 25);
      if (timer && timer.unref) timer.unref();
    } else if (!need && timer) { clearInterval(timer); timer = null; }
  }

  /* ---------- volumes ---------- */
  function applyVolumes() {
    if (!ctx || !master) return;
    try {
      const t = ctx.currentTime;
      const mt = A.muted ? 0 : MASTER;
      master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(mt, t, 0.05);
      const mg = musicVol * MUSIC_BASE * (1 + (encOn ? 0.15 : 0)) * (fadeEnd ? 0 : 1);
      musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(mg, t, fadeEnd ? Math.max(0.05, (fadeEnd - t) / 4) : 0.06);
      sfxBus.gain.cancelScheduledValues(t); sfxBus.gain.setTargetAtTime(sfxVol * SFX_BASE, t, 0.04);
    } catch (e) { /* ignore */ }
  }
  function wake() {
    try {
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
        const r = ctx.resume(); if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------- public API ---------- */
  A.init = function () {
    try {
      if (ctx) { wake(); return true; }
      const AC = G.AudioContext || G.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      master = ctx.createGain(); master.gain.value = A.muted ? 0 : MASTER;
      comp = ctx.createDynamicsCompressor();
      try {
        comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 3.5;
        comp.attack.value = 0.006; comp.release.value = 0.22;
      } catch (e) { /* ignore */ }
      master.connect(comp); comp.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = musicVol * MUSIC_BASE;
      duckGain = ctx.createGain(); duckGain.gain.value = 1;
      musicFilter = bq('lowpass', 18000, 0.5);
      musicBus.connect(duckGain); duckGain.connect(musicFilter); musicFilter.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol * SFX_BASE; sfxBus.connect(master);
      MUS.out = musicBus;
      noiseBuf = makeNoise();
      try {
        revIn = makeReverb();
        if (revIn) {
          const ms = ctx.createGain(); ms.gain.value = 0.16; musicFilter.connect(ms); ms.connect(revIn);
          const ss = ctx.createGain(); ss.gain.value = 0.1; sfxBus.connect(ss); ss.connect(revIn);
        }
      } catch (e) { revIn = null; }
      mutedApplied = A.muted;
      // iOS unlock: tiny silent buffer inside the gesture
      try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
      wake();
      if (!listening) {
        listening = true;
        try {
          const tgt = (typeof document !== 'undefined' && document.addEventListener) ? document : (typeof window !== 'undefined' ? window : null);
          if (tgt) ['pointerup', 'click', 'keydown', 'touchend'].forEach(ev => tgt.addEventListener(ev, wake, { passive: true }));
          if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
        } catch (e) { /* ignore */ }
      }
      if (wantMusic) { wantMusic = false; A.musicStart(); }
      ensureTimer();
      return true;
    } catch (e) { return false; }
  };

  A.setMuted = function (b) {
    try {
      A.muted = !!b; mutedApplied = A.muted;
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(A.muted ? 0 : MASTER, t, 0.05);
      }
    } catch (e) { /* ignore */ }
  };
  A.setVolume = function (m, s) {
    try {
      if (m != null) musicVol = clamp(+m || 0, 0, 1);
      if (s != null) sfxVol = clamp(+s || 0, 0, 1);
      applyVolumes();
    } catch (e) { /* ignore */ }
  };
  A.sfx = function (kind, pitch, vol) {
    try { return play(kind, pitch, vol, false); } catch (e) { return false; }
  };
  A.sfxKinds = KINDS.slice();

  A.musicStart = function () {
    try {
      if (!ctx || !musicBus) { wantMusic = true; return false; }
      if (playing && !fadeEnd) return true;
      fadeEnd = 0; playing = true;
      if (pendingBiome === null && !step) pendingBiome = reqBiome;
      step = 0; intV = intT;
      const now = ctx.currentTime;
      lastTickT = now; nextT = now + 0.08;
      alignBeat(nextT);
      applyVolumes();
      ensureTimer();
      return true;
    } catch (e) { return false; }
  };
  A.musicStop = function () {
    try {
      wantMusic = false;
      if (!playing) return;
      playing = false; fadeEnd = 0;
      if (ctx && musicBus) {
        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(0, t, 0.03);
        later(() => { if (!playing) applyVolumes(); }, 200);
      }
      ensureTimer();
    } catch (e) { /* ignore */ }
  };
  A.musicFade = function (sec) {
    try {
      if (!ctx || !playing) return;
      sec = clamp(+sec || 1, 0.05, 20);
      fadeEnd = ctx.currentTime + sec;
      applyVolumes();
    } catch (e) { /* ignore */ }
  };
  A.intensity = function (n) {
    if (n === undefined) return intT;
    intT = clamp(+n || 0, 0, 1);
    if (!playing) intV = intT;
    return intT;
  };
  A.setBiome = function (i) {
    try {
      reqBiome = Math.max(0, Math.floor(+i || 0));
      if (playing) pendingBiome = reqBiome;
      else { pendingBiome = reqBiome; applyPending(); }
    } catch (e) { /* ignore */ }
  };
  A.setEncore = function (b) {
    try { encOn = !!b; if (!playing) encV = encOn ? 1 : 0; applyVolumes(); } catch (e) { /* ignore */ }
  };
  A.duck = function (sec) {
    try {
      if (!ctx || !duckGain) return;
      sec = clamp(+sec || 0.5, 0.1, 6);
      const t = ctx.currentTime;
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setTargetAtTime(0.5, t, 0.03);
      duckGain.gain.setTargetAtTime(1, t + sec, 0.15);
      musicFilter.frequency.cancelScheduledValues(t);
      musicFilter.frequency.setTargetAtTime(900, t, 0.03);
      musicFilter.frequency.setTargetAtTime(18000, t + sec, 0.2);
    } catch (e) { /* ignore */ }
  };
  A.stinger = function (name) {
    try {
      switch (name) {
        case 'levelup': A.duck(0.7); return play('levelup', 1, 1, true);
        case 'boss': A.duck(1.3); return play('boss', 1, 1, true);
        case 'encore': A.duck(1.0); return play('encore', 1, 1, true);
        case 'victory': A.duck(1.7); return victory();
        default: return false;
      }
    } catch (e) { return false; }
  };

  /* beat clock */
  A.setBpm = function (n) { try { beat(); A.bpm = clampBpm(n); beat(); } catch (e) { /* ignore */ } };
  A.beat = function () { try { return beat(); } catch (e) { return 0; } };
  A.beatPhase = function () { try { const b = beat(); return b - Math.floor(b); } catch (e) { return 0; } };
  A.nearBeat = function (tol) {
    try {
      tol = tol == null ? 0.07 : +tol;
      const h = beat() * 2, r = Math.round(h);
      const err = (h - r) / 2 * 60 / bpmUsed;
      return { on: Math.abs(err) <= tol, err };
    } catch (e) { return { on: false, err: 0 }; }
  };
  A.onBeat = function (fn) {
    if (typeof fn !== 'function') return;
    if (listeners.indexOf(fn) < 0) listeners.push(fn);
    try { pollBeats(); ensureTimer(); } catch (e) { /* ignore */ }
  };
  A.offBeat = function (fn) {
    const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
    try { ensureTimer(); } catch (e) { /* ignore */ }
  };
  A.poll = function () { try { pollBeats(); } catch (e) { /* ignore */ } };

  A.state = function () {
    return { ready: !!ctx, muted: !!A.muted, playing: !!playing, bpm: A.bpm, intensity: intT, biome: reqBiome,
      intensityNow: intV, encore: encOn, ctxState: ctx ? ctx.state : 'none' };
  };

  /* test hooks */
  A._fakeTime = function (sec) { fakeT = (sec === null || sec === undefined) ? null : +sec; };
  A._tick = tick;
  A._voices = () => voices.length;
  A._step = () => step;
  return A;
})();
if (typeof window !== 'undefined') window.AUDIO = AUDIO;
