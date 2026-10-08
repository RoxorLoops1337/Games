/* BBH.VoiceFX: the studio chain that turns a raw mic take into a game-ready one-shot, engineered per sound.
 *
 * Offline, deterministic, pure JS on Float32Array (no Web Audio, no DOM, no randomness): the same take gives the same bytes in
 * every browser and in node, so every stage is unit tested (tests/beatbox_heroes_voicefx.test.mjs).
 *
 *   process(raw, sampleRate, soundId) -> { data, dry, start, end, info }
 *     data   the CLEAN sample (stored and played by default)
 *     dry    the RAW take for A/B: cut at the same points, the same edge fades, level-matched to data, no gate / EQ / dynamics
 *     start / end   the cut in raw samples; info: what was measured and done (see the end of process)
 *   profile(id)  the merged settings for a Core.SOUNDS id or lane (fallback by lane, then 'generic')
 *   response(eq, freq, sr)  magnitude in dB of an EQ list (the RBJ biquads exactly as process runs them)
 *   punch(x, sr) short-term level in dBFS (loudest 30 ms RMS), truePeak(x) peak in dBFS with 4x oversampled inter-sample peaks
 *
 * The chain, every number per profile (FAMILIES, then SOUND overrides):
 *   1 analysis  mean removal + 10 Hz DC blocker; noise floor = the lower of the pre-roll median and the 10th percentile of 5 ms
 *               blocks (measured after the profile's high pass, so rumble a sound does not keep is not counted); onset on a
 *               sidechain-high-passed detector, refined back to the first sample that clears the floor by 6 dB; the closing
 *               detector is zero-phase (a centered RMS window, possible offline), so the gate closes when the sound ends
 *   2 gate      lookahead gate with hysteresis. OPENS on the sidechain detector (high passed: breath, rumble and handling cannot
 *               open it and the onset is exact), CLOSES on the full-band detector (a kick or throat bass tail rides through, the
 *               low end is protected). Thresholds adapt: open = floor + open dB, close = floor + close dB, both clamped to the
 *               take's own peak. Lookahead attack: a raised-cosine ramp of `atk` ms that ENDS at the onset, so no transient is
 *               chopped; hold; release is a straight line in dB reaching -60 dB after `rel` ms; range -90 dB. The loudest gated
 *               segment is the sound.
 *   3 staging   gain to -18 dBFS short-term so every threshold below means the same for a whisper or a shout
 *   4 EQ        RBJ cookbook biquads: ['hp'|'lp', f, Q, 0, order(2|4)], ['peak', f, Q, dB], ['lowshelf'|'highshelf', f, S, dB]
 *   5 exciter   kick / bass: harmonics of the band below 120 Hz (asymmetric tanh) high passed at 150 Hz and blended in, so the
 *               low end still reads on phone and laptop speakers that cannot play 60 Hz (psychoacoustic bass)
 *   6 transient kick / snares: up to +N dB on the first milliseconds (fast vs slow envelope difference); on the kick only the
 *               click band above 1 kHz is lifted, never the boom
 *   7 comp      feed-forward, RMS detector, soft knee, attack / release smoothing in dB; the kick's detector is high passed at
 *               150 Hz so its low end cannot drive the gain reduction; optional parallel (New York) blend of a hard-squashed
 *               copy for body and consistency (snares, bass)
 *   8 de-esser  split band: only the band around 7 kHz is turned down, and only while it dominates the full band
 *   9 level     gain to the sound's target short-term level (matched to the synth kit, see SOUND). Noise-type sounds (hats,
 *               snares, zipper) first go through a soft clipper with a dB budget (noise has a ~12 dB crest factor; clipping its
 *               rare peaks is masked by the noise itself). Then a lookahead limiter on a 4x oversampled peak estimate at
 *               -1 dBTP. If either would have to work harder than its budget, the target gives way.
 *  10 edges     trim to onset - atk, 0.25 ms raised-cosine fade-in, equal-power (quarter cosine) fade-out; first and last
 *               samples are exactly 0, so no clicks at either boundary; length capped per sound
 *
 * No em dashes anywhere in this file (project rule).
 */
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dB = (v) => 20 * Math.log10(v > 1e-12 ? v : 1e-12), lin = (d) => Math.pow(10, d / 20);
  const CEIL_DB = -1, STAGE_DB = -18, RANGE_DB = -90, PUNCH_MS = 30, FADE_IN_MS = 0.25;
  const LANE_ID = ['B', 't', 'K', 'Pf'];

  /* ================================================================== profiles
   * gate: sc sidechain high pass Hz, open / close dB over the noise floor, atk (lookahead, ends at the onset) / hold / rel ms,
   *       det (opening, one-pole) / detClose (closing, centered window half width) detector ms, gap ms (gate gaps shorter than
   *       this belong to the same sound: rolls, rattles)
   * eq: see step 4. exciter: f Hz, drive, mix. trans: max dB, transHp Hz (lift only the band above it)
   * comp: thr dBFS (after staging to -18), ratio, atk / rel ms, knee dB, rms detector ms, sc detector high pass Hz.
   *       par: the squashed parallel copy + its mix
   * deess: band f Hz, q, rel (band level minus full-band level that starts it, dB), ratio, max dB
   * clip: soft clipper budget dB (noise-type sounds only). lim: max gain reduction dB, rel ms
   * maxMs length cap, fadeMs tail fade, target short-term dBFS
   */
  const FAMILIES = {
    kick: {
      gate: { sc: 60, open: 12, close: 6, atk: 2, hold: 40, rel: 140, det: 0.5, detClose: 8, gap: 60 },
      eq: [['hp', 22, 0.707], ['lowshelf', 100, 0.8, 4], ['peak', 400, 1.4, -3], ['peak', 3000, 1.0, 2.5], ['lp', 14000, 0.707]],
      exciter: { f: 120, drive: 3, mix: 0.18 }, trans: 3, transHp: 1000,
      comp: { thr: -22, ratio: 3, atk: 10, rel: 90, knee: 6, rms: 5, sc: 150 }, par: null, deess: null,
      lim: { max: 4, rel: 40 }, maxMs: 500, fadeMs: 20, target: -5,
    },
    bass: {
      gate: { sc: 40, open: 10, close: 6, atk: 3, hold: 80, rel: 220, det: 1, detClose: 15, gap: 120 },
      eq: [['hp', 25, 0.707], ['lowshelf', 100, 0.8, 3.5], ['peak', 420, 1.2, -2], ['peak', 1500, 1.0, 1]],
      exciter: { f: 120, drive: 2.5, mix: 0.2 }, trans: 0,
      comp: { thr: -24, ratio: 2.5, atk: 15, rel: 200, knee: 8, rms: 10 }, par: { thr: -36, ratio: 8, atk: 2, rel: 120, knee: 6, rms: 5, mix: 0.25 }, deess: null,
      lim: { max: 4, rel: 80 }, maxMs: 1200, fadeMs: 50, target: -8,
    },
    hat: {
      gate: { sc: 1500, open: 12, close: 6, atk: 1, hold: 8, rel: 35, det: 0.3, detClose: 3, gap: 40 },
      eq: [['hp', 200, 0.707, 0, 4], ['peak', 4500, 0.9, 2], ['highshelf', 10000, 0.8, 3]],
      exciter: null, trans: 0,
      comp: { thr: -20, ratio: 2.5, atk: 3, rel: 40, knee: 4, rms: 2 }, par: null, deess: { f: 7500, q: 1.4, rel: -3, ratio: 2, max: 3 },
      lim: { max: 3, rel: 30 }, clip: 6, maxMs: 300, fadeMs: 8, target: -12.5,
    },
    snare: {
      gate: { sc: 300, open: 12, close: 6, atk: 1.5, hold: 20, rel: 80, det: 0.4, detClose: 5, gap: 50 },
      eq: [['hp', 90, 0.707], ['peak', 200, 1.2, 1.5], ['peak', 4000, 1.0, 3], ['highshelf', 12000, 0.8, -1.5]],
      exciter: null, trans: 2,
      comp: { thr: -22, ratio: 4, atk: 5, rel: 70, knee: 6, rms: 3 }, par: { thr: -34, ratio: 10, atk: 0.5, rel: 50, knee: 6, rms: 2, mix: 0.3 }, deess: { f: 7500, q: 1.4, rel: -6, ratio: 2.5, max: 5 },
      lim: { max: 4, rel: 40 }, clip: 6, maxMs: 450, fadeMs: 15, target: -9,
    },
    tonal: {
      gate: { sc: 150, open: 12, close: 6, atk: 2, hold: 60, rel: 150, det: 0.5, detClose: 10, gap: 100 },
      eq: [['hp', 120, 0.707], ['peak', 3000, 1.0, 1], ['highshelf', 9000, 0.8, -2]],
      exciter: null, trans: 0,
      comp: { thr: -24, ratio: 2, atk: 20, rel: 250, knee: 8, rms: 10 }, par: null, deess: { f: 7000, q: 1.4, rel: -6, ratio: 2, max: 3 },
      lim: { max: 4, rel: 80 }, maxMs: 1500, fadeMs: 40, target: -9,
    },
    fx: {
      gate: { sc: 500, open: 12, close: 6, atk: 1.5, hold: 30, rel: 70, det: 0.4, detClose: 5, gap: 80 },
      eq: [['hp', 150, 0.707], ['peak', 3000, 1.0, 2], ['highshelf', 11000, 0.8, 1]],
      exciter: null, trans: 0,
      comp: { thr: -22, ratio: 3, atk: 4, rel: 60, knee: 6, rms: 3 }, par: null, deess: { f: 7500, q: 1.4, rel: -4, ratio: 2, max: 4 },
      lim: { max: 3, rel: 40 }, clip: 4, maxMs: 700, fadeMs: 20, target: -10.5,
    },
    generic: {
      gate: { sc: 100, open: 12, close: 6, atk: 2, hold: 40, rel: 100, det: 0.5, detClose: 8, gap: 80 },
      eq: [['hp', 30, 0.707]],
      exciter: null, trans: 0,
      comp: { thr: -22, ratio: 2.5, atk: 8, rel: 100, knee: 6, rms: 5 }, par: null, deess: null,
      lim: { max: 5, rel: 50 }, maxMs: 800, fadeMs: 20, target: -10,
    },
  };
  /* Per sound. target = the synth voice's loudest-30-ms RMS at the game output minus the gain of the sample path (Audio.drum plays a
   * sample at vel x 0.9 into the drum bus), measured with tools/beatbox_heroes/audio_render.mjs at vel 1, so your recording lands
   * at the level of the built-in kit. The voicefx test re-measures the synth and fails when a target drifts more than 2.5 dB. */
  const SOUND = {
    B: { fam: 'kick', target: -5 },
    TB: { fam: 'bass', target: -6.5, maxMs: 1400 },
    HUM: { fam: 'bass', target: -8.5, maxMs: 1800, gate: { rel: 250 }, fadeMs: 70 },
    LR: { fam: 'bass', target: -10, maxMs: 1400, auto: { minLow: 0.3, mid: { eq: [['hp', 45, 0.707], ['peak', 300, 1.0, -1.5], ['peak', 2000, 1.0, 2]], exciter: null } } },
    t: { fam: 'hat', target: -12.5 },
    CR: { fam: 'hat', target: -21.5, gate: { hold: 30, rel: 60, gap: 160 }, eq: [['hp', 180, 0.707, 0, 4], ['peak', 3500, 1.0, 2], ['highshelf', 10000, 0.8, 2]], maxMs: 1200, fadeMs: 25 },
    K: { fam: 'snare', target: -8 },
    IK: { fam: 'snare', target: -6.5, gate: { rel: 110 }, maxMs: 600 },
    Pf: { fam: 'snare', target: -11, eq: [['hp', 120, 0.707], ['peak', 250, 1.2, 1], ['peak', 3500, 1.0, 2], ['highshelf', 12000, 0.8, -1]], deess: { max: 6 } },
    RIM: { fam: 'snare', target: -16.5, eq: [['hp', 150, 0.707], ['peak', 500, 1.4, 2], ['peak', 4500, 1.2, 3]], trans: 3, maxMs: 350 },
    WB: { fam: 'tonal', target: -9, maxMs: 600, gate: { atk: 1, hold: 20, rel: 90 }, fadeMs: 20 },
    SI: { fam: 'tonal', target: -8, maxMs: 1800, gate: { hold: 80, rel: 220 }, fadeMs: 60 },
    ZP: { fam: 'fx', target: -10.5 },
  };
  const OBJ = { gate: 1, comp: 1, par: 1, deess: 1, lim: 1, exciter: 1 };
  function merge(base, over) {
    const out = {};
    for (const k in base) out[k] = base[k] && OBJ[k] ? Object.assign({}, base[k]) : base[k];
    for (const k in over || {}) { const v = over[k]; out[k] = v && OBJ[k] && out[k] ? Object.assign(out[k], v) : v && OBJ[k] ? Object.assign({}, v) : v; }
    return out;
  }
  /** lane 0..3 or id -> canonical id; ids without a profile fall back to their Core.SOUNDS lane */
  function resolveId(id) {
    if (typeof id === 'number') return LANE_ID[id | 0] || null;
    if (typeof id !== 'string') return null;
    if (SOUND[id]) return id;
    const lo = id.toLowerCase(), al = { b: 'B', kick: 'B', t: 't', hat: 't', k: 'K', snare: 'K', pf: 'Pf', p: 'Pf', clap: 'Pf' }[lo];
    if (al) return al;
    const up = id.toUpperCase(); if (SOUND[up]) return up;
    try { const S = BBH.Core && BBH.Core.SOUNDS, e = S && S.find((s) => s && s.id === id); if (e && typeof e.lane === 'number') return LANE_ID[e.lane] || null; } catch (e) { /* ignore */ }
    return null;
  }
  function profile(id) {
    const rid = resolveId(id), s = rid ? SOUND[rid] : null, fam = s ? s.fam : 'generic';
    const p = merge(FAMILIES[fam], s || {});
    p.id = rid || String(id); p.fam = fam;
    return p;
  }

  /* ================================================================== biquads (RBJ Audio EQ Cookbook) */
  function coefs(type, f, sr, q, g) {
    const w = 2 * Math.PI * clamp(f, 1, 0.49 * sr) / sr, cs = Math.cos(w), sn = Math.sin(w), A = Math.pow(10, (g || 0) / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowshelf' || type === 'highshelf') {
      const S = q || 1, al = sn / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2), k = 2 * Math.sqrt(A) * al, s = type === 'lowshelf' ? 1 : -1;
      b0 = A * ((A + 1) - s * (A - 1) * cs + k); b1 = 2 * s * A * ((A - 1) - s * (A + 1) * cs); b2 = A * ((A + 1) - s * (A - 1) * cs - k);
      a0 = (A + 1) + s * (A - 1) * cs + k; a1 = -2 * s * ((A - 1) + s * (A + 1) * cs); a2 = (A + 1) + s * (A - 1) * cs - k;
    } else {
      const al = sn / (2 * (q || Math.SQRT1_2));
      if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
      else {
        if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
        else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
        else { b0 = al; b1 = 0; b2 = -al; }
        a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
      }
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }
  const BW4 = [0.5412, 1.3066];
  /** one EQ band -> biquad stages (order 4 high / low pass = two Butterworth stages) */
  function stages(band, sr) {
    const type = band[0], order = band[4] || 2;
    if ((type === 'hp' || type === 'lp') && order >= 4) return BW4.map((q) => coefs(type, band[1], sr, q, 0));
    return [coefs(type, band[1], sr, band[2], band[3])];
  }
  function runBq(x, c) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const b0 = c.b0, b1 = c.b1, b2 = c.b2, a1 = c.a1, a2 = c.a2;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
  }
  function runEq(x, eq, sr) { for (const b of eq || []) for (const c of stages(b, sr)) runBq(x, c); return x; }
  /** magnitude (dB) of an EQ list at freq */
  function response(eq, freq, sr) {
    const w = 2 * Math.PI * freq / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    let d = 0;
    for (const b of eq || []) for (const c of stages(b, sr)) {
      const nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = -(c.b1 * s1 + c.b2 * s2), dr = 1 + c.a1 * c1 + c.a2 * c2, di = -(c.a1 * s1 + c.a2 * s2);
      d += 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
    }
    return d;
  }

  /* ================================================================== meters */
  const coef = (ms, sr) => (ms > 0 ? 1 - Math.exp(-1 / (ms * 0.001 * sr)) : 1);
  /** one-pole RMS envelope (smoothing ms) */
  function rmsEnv(x, sr, ms) {
    const a = coef(ms, sr), out = new Float64Array(x.length);
    let m = 0;
    for (let i = 0; i < x.length; i++) { m += a * (x[i] * x[i] - m); out[i] = Math.sqrt(m); }
    return out;
  }
  /** zero-phase RMS envelope: a centered box window of 2 x ms. Offline we can look both ways, so the envelope has no lag and no
   *  exponential tail: it falls within ms after the sound stops, and the gate closes when the sound ends. */
  function rmsEnvZ(x, sr, ms) {
    const n = x.length, h = Math.max(1, Math.round(ms * 0.001 * sr)), ps = new Float64Array(n + 1), out = new Float64Array(n);
    for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + x[i] * x[i];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n, i + h + 1); out[i] = Math.sqrt(Math.max(0, ps[b] - ps[a]) / (b - a)); }
    return out;
  }
  /** short-term level (dBFS): the loudest 30 ms RMS window (1 ms hop); the whole RMS for shorter sounds */
  function punch(x, sr, a, b) {
    a = a || 0; b = b == null ? x.length : b;
    const W = Math.max(1, Math.round(PUNCH_MS * 0.001 * sr)), n = b - a;
    if (n <= 0) return -240;
    if (n <= W) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return dB(Math.sqrt(s / n)); }
    const ps = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + x[a + i] * x[a + i];
    const hop = Math.max(1, Math.round(0.001 * sr));
    let best = 0;
    for (let s = 0; s + W <= n; s += hop) { const v = ps[s + W] - ps[s]; if (v > best) best = v; }
    return dB(Math.sqrt(best / W));
  }
  /* 4x oversampled peak estimate: 3 interpolated points between samples, 12-tap Hann-windowed sinc per phase (unity DC gain) */
  const TPT = 6, TPK = (() => {
    const P = [];
    for (let p = 1; p < 4; p++) {
      const t = p / 4, k = new Float64Array(2 * TPT); let s = 0;
      for (let j = -TPT + 1; j <= TPT; j++) { const d = t - j, w = 0.5 + 0.5 * Math.cos(Math.PI * d / TPT), v = Math.sin(Math.PI * d) / (Math.PI * d) * w; k[j + TPT - 1] = v; s += v; }
      for (let j = 0; j < k.length; j++) k[j] /= s;
      P.push(k);
    }
    return P;
  })();
  function tpEnv(x) {
    const n = x.length, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let m = Math.abs(x[i]);
      const nb = i + 1 < n ? Math.abs(x[i + 1]) : 0;
      if (m > 1e-7 || nb > 1e-7) {
        for (let p = 0; p < 3; p++) {
          const k = TPK[p]; let v = 0;
          for (let j = -TPT + 1; j <= TPT; j++) { const q = i + j; if (q >= 0 && q < n) v += x[q] * k[j + TPT - 1]; }
          if (Math.abs(v) > m) m = Math.abs(v);
        }
      }
      out[i] = m;
    }
    return out;
  }
  function truePeak(x) { const e = tpEnv(x); let m = 0; for (let i = 0; i < e.length; i++) if (e[i] > m) m = e[i]; return dB(m); }

  /* ================================================================== dynamics */
  /** feed-forward compressor, RMS detector, soft knee (Giannoulis / Massberg / Reiss gain computer), smoothing in dB. In place. */
  function compress(x, sr, C) {
    const aR = coef(C.rms || 5, sr), at = Math.exp(-1 / (Math.max(0.05, C.atk) * 0.001 * sr)), rl = Math.exp(-1 / (Math.max(1, C.rel) * 0.001 * sr));
    const T = C.thr, R = Math.max(1, C.ratio), W = C.knee || 0;
    /* C.sc: detector high pass (Hz). The low end then cannot drive the gain reduction, so a kick's boom is not turned down */
    const det = C.sc ? runBq(Float64Array.from(x), coefs('hp', C.sc, sr, Math.SQRT1_2)) : x;
    let ms = 0, gs = 0, mx = 0;
    for (let i = 0; i < x.length; i++) {
      ms += aR * (det[i] * det[i] - ms);
      const lv = 10 * Math.log10(ms + 1e-20), d = lv - T;
      let o;
      if (2 * d < -W) o = lv;
      else if (W > 0 && 2 * Math.abs(d) <= W) o = lv + (1 / R - 1) * (d + W / 2) * (d + W / 2) / (2 * W);
      else o = T + d / R;
      const gr = o - lv;
      gs = gr < gs ? at * gs + (1 - at) * gr : rl * gs + (1 - rl) * gr;
      if (-gs > mx) mx = -gs;
      x[i] *= lin(gs);
    }
    return mx;
  }
  /** transient shaper: +dB while a fast envelope runs ahead of a slow one (the first milliseconds of a hit). With hp (Hz) only the
   *  band above hp is lifted (a kick's click, not its boom). In place. */
  function transient(x, sr, maxDb, hp) {
    const fa = coef(0.2, sr), fr = coef(8, sr), sa = coef(12, sr), sl = coef(60, sr);
    const band = hp ? runBq(runBq(Float64Array.from(x), coefs('hp', hp, sr, Math.SQRT1_2)), coefs('hp', hp, sr, Math.SQRT1_2)) : null;
    let f = 0, s = 0;
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      f += (a > f ? fa : fr) * (a - f); s += (a > s ? sa : sl) * (a - s);
      if (f > 1e-6) { const g = lin(clamp((dB(f) - dB(s)) * 0.5, 0, maxDb)); if (band) x[i] += band[i] * (g - 1); else x[i] *= g; }
    }
  }
  /** psychoacoustic bass: harmonics of the band under E.f, generated by an asymmetric tanh, high passed, mixed in. In place. */
  function excite(x, sr, E) {
    const lo = Float64Array.from(x), lp = coefs('lp', E.f, sr, Math.SQRT1_2);
    runBq(lo, lp); runBq(lo, lp);
    let pk = 0; for (let i = 0; i < lo.length; i++) { const a = Math.abs(lo[i]); if (a > pk) pk = a; }
    if (pk < 1e-6) return;
    const d = E.drive, bias = 0.25, t0 = Math.tanh(d * bias), nrm = pk / (Math.tanh(d * (1 + bias)) - t0);
    for (let i = 0; i < lo.length; i++) lo[i] = (Math.tanh(d * (lo[i] / pk + bias)) - t0) * nrm;
    const hp = coefs('hp', E.f * 1.25, sr, Math.SQRT1_2);
    runBq(lo, hp); runBq(lo, hp);
    for (let i = 0; i < x.length; i++) x[i] += E.mix * lo[i];
  }
  /** split-band de-esser: subtract part of the band-passed signal while the band dominates. In place, returns max dB of reduction. */
  function deess(x, sr, D) {
    const band = runBq(Float64Array.from(x), coefs('bp', D.f, sr, D.q || 1.4, 0)), eb = rmsEnv(band, sr, 2), ef = rmsEnv(x, sr, 2), k = 1 - 1 / Math.max(1, D.ratio);
    let mx = 0;
    for (let i = 0; i < x.length; i++) {
      if (ef[i] < 1e-7) continue;
      const gr = clamp((dB(eb[i]) - dB(ef[i]) - D.rel) * k, 0, D.max);
      if (gr > mx) mx = gr;
      x[i] -= band[i] * (1 - lin(-gr));
    }
    return mx;
  }
  /**
   * Lookahead limiter gain for signal (peak envelope tp) times g so that every (inter-sample) peak stays under ceil.
   * required r = min(1, ceil / peak); a sliding minimum over the lookahead then a box average of the same length reaches the
   * required gain exactly at each peak and never exceeds it; exponential release. Returns the gain curve.
   */
  function limitGain(tp, g, ceil, L, rc) {
    const n = tp.length, P = L - 1, m = n + 2 * P, rp = new Float64Array(m).fill(1);
    for (let i = 0; i < n; i++) { const v = tp[i] * g; rp[i + P] = v > ceil ? ceil / v : 1; }
    const mm = new Float64Array(n + P), dq = new Int32Array(m);
    let h = 0, t = 0;
    for (let k = 0; k < m; k++) {
      while (t > h && rp[dq[t - 1]] >= rp[k]) t--;
      dq[t++] = k;
      const s = k - L + 1;
      if (s >= 0) { while (dq[h] < s) h++; if (s < mm.length) mm[s] = rp[dq[h]]; }
    }
    const ps = new Float64Array(mm.length + 1);
    for (let k = 0; k < mm.length; k++) ps[k + 1] = ps[k] + mm[k];
    const out = new Float64Array(n);
    let prev = 1;
    for (let i = 0; i < n; i++) {
      const a = (ps[i + L] - ps[i]) / L, rel = prev + (1 - prev) * rc;
      prev = a < rel ? a : rel; out[i] = prev;
    }
    return out;
  }

  /* ================================================================== analysis helpers */
  function blockRms(x, B) {
    const nb = Math.floor(x.length / B), out = new Float64Array(nb);
    for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * B; i < (b + 1) * B; i++) s += x[i] * x[i]; out[b] = Math.sqrt(s / B); }
    return out;
  }
  function quantile(arr, q) { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; }

  function fail(reason, info) { return { data: new Float32Array(0), dry: new Float32Array(0), start: 0, end: 0, info: Object.assign({ ok: false, reason }, info || {}) }; }

  /* ================================================================== the chain */
  function process(input, sr, id, opts) {
    opts = opts || {};
    let P = opts.profile || profile(id);
    const n = input ? input.length : 0;
    if (n < 64 || !(sr > 0)) return fail('short');
    const ms = (v) => Math.max(1, Math.round(v * 0.001 * sr)), G = P.gate;
    /* 1. DC: mean, then a 10 Hz one-pole blocker */
    let mean = 0; for (let i = 0; i < n; i++) mean += input[i]; mean /= n;
    const x = new Float64Array(n), R = Math.exp(-2 * Math.PI * 10 / sr);
    let px = 0, py = 0;
    for (let i = 0; i < n; i++) { const v = input[i] - mean, o = v - px + R * py; px = v; py = o; x[i] = o; }
    /* analysis signals: the full band after the profile's high pass (what we keep), and the gate sidechain */
    const hpBands = (P.eq || []).filter((b) => b[0] === 'hp'), xa = runEq(Float64Array.from(x), hpBands, sr);
    const sc = runBq(runBq(Float64Array.from(x), coefs('hp', G.sc, sr, Math.SQRT1_2)), coefs('hp', G.sc, sr, Math.SQRT1_2));
    const B = Math.max(16, ms(5)), ra = blockRms(xa, B), rs = blockRms(sc, B);
    let rsMax = 0; for (const v of rs) if (v > rsMax) rsMax = v;
    let first = 0; while (first < rs.length && rs[first] < rsMax * 0.1) first++;
    const preBlocks = Math.max(0, first - 2);
    const nfA = Math.max(1e-6, preBlocks >= 3 ? Math.min(quantile(ra.subarray(0, preBlocks), 0.5), quantile(ra, 0.1)) : quantile(ra, 0.1));
    const nfS = Math.max(1e-6, preBlocks >= 3 ? Math.min(quantile(rs.subarray(0, preBlocks), 0.5), quantile(rs, 0.1)) : quantile(rs, 0.1));
    const envO = rmsEnv(sc, sr, G.det), envC = rmsEnvZ(xa, sr, G.detClose);
    let oMax = 0, cMax = 0; for (let i = 0; i < n; i++) { if (envO[i] > oMax) oMax = envO[i]; if (envC[i] > cMax) cMax = envC[i]; }
    const info0 = { id: P.id, family: P.fam, noiseDb: +dB(nfA).toFixed(1) };
    if (cMax < lin(-54) || dB(cMax) - dB(nfA) < 12) return fail('quiet', info0);
    const openThr = clamp(nfS * lin(G.open), oMax * lin(-60), oMax * lin(-15)), closeThr = clamp(nfA * lin(G.close), cMax * lin(-66), cMax * lin(-24));
    /* 2. gate segments with hysteresis + hold, merged across short gaps; the loudest one is the sound */
    const holdS = ms(G.hold), gapS = ms(G.gap), segs = [];
    let open = false, s0 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      if (!open) { if (envO[i] > openThr) { open = true; s0 = i; last = i; } }
      else if (envC[i] > closeThr || envO[i] > openThr) last = i;
      else if (i - last > holdS) { segs.push([s0, last + holdS]); open = false; }
    }
    if (open) segs.push([s0, Math.min(n - 1, last + holdS)]);
    if (!segs.length) return fail('quiet', info0);
    const merged = [segs[0].slice()];
    for (let k = 1; k < segs.length; k++) { const p = merged[merged.length - 1]; if (segs[k][0] - p[1] < gapS) p[1] = segs[k][1]; else merged.push(segs[k].slice()); }
    let main = merged[0], best = -1;
    for (const sg of merged) { let e = 0; for (let i = sg[0]; i <= sg[1]; i++) e += xa[i] * xa[i]; if (e > best) { best = e; main = sg; } }
    /* sample-accurate onset: walk back from the detector crossing while the 0.25 ms sidechain RMS is still 6 dB over the floor */
    const ps = new Float64Array(n + 1); for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + sc[i] * sc[i];
    const w = Math.max(4, ms(0.25)), thr2 = nfS * nfS * lin(6) * lin(6), lo = Math.max(0, main[0] - ms(G.det * 4 + 3));
    let j = main[0];
    while (j > lo && (ps[j] - ps[Math.max(0, j - w)]) / Math.max(1, j - Math.max(0, j - w)) > thr2) j--;
    const onset = Math.max(0, Math.min(main[0], j - (w >> 1)));
    const atkS = ms(G.atk), relS = ms(G.rel), maxS = ms(P.maxMs);
    const start = Math.max(0, onset - atkS);
    let end = Math.min(n, main[1] + relS);
    const capped = end - start > maxS;
    if (capped) end = start + maxS;
    const len = end - start;
    if (len < ms(5)) return fail('short', info0);
    /* gate gain over the cut: lookahead raised-cosine attack that ENDS at the onset, hold through the segment, straight dB release to -60 then -90 */
    const y = new Float64Array(len), floor = lin(RANGE_DB), a0 = onset - atkS;
    for (let i = 0; i < len; i++) {
      const t = start + i;
      let g;
      if (t < onset) g = t < a0 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * (t - a0) / atkS);
      else if (t <= main[1]) g = 1;
      else g = Math.max(floor, lin(-60 * (t - main[1]) / relS));
      y[i] = x[t] * g;
    }
    /* 3. staging */
    const L0 = punch(y, sr), stage = STAGE_DB - L0;
    for (let i = 0; i < len; i++) y[i] *= lin(stage);
    /* 4. EQ; a lip roll only gets the bass treatment when it is a bass lip roll (energy share under 150 Hz) */
    let lowShare = null;
    if (P.auto) {
      const l = Float64Array.from(y), c = coefs('lp', 150, sr, Math.SQRT1_2); runBq(l, c); runBq(l, c);
      let el = 0, et = 0; for (let i = 0; i < len; i++) { el += l[i] * l[i]; et += y[i] * y[i]; }
      lowShare = et > 0 ? el / et : 0;
      if (lowShare < P.auto.minLow) P = merge(P, P.auto.mid);
    }
    runEq(y, P.eq, sr);
    /* 5 to 8 */
    if (P.exciter) excite(y, sr, P.exciter);
    if (P.trans > 0) transient(y, sr, P.trans, P.transHp || 0);
    let wet = null;
    if (P.par && P.par.mix > 0) wet = Float64Array.from(y);
    const compDb = compress(y, sr, P.comp);
    if (wet) {
      compress(wet, sr, P.par);
      const mk = lin(-P.par.thr * (1 - 1 / P.par.ratio) * 0.6) * P.par.mix;
      for (let i = 0; i < len; i++) y[i] += wet[i] * mk;
    }
    const deessDb = P.deess ? deess(y, sr, P.deess) : 0;
    /* 9. level to target, lookahead true-peak limiter; the target gives way when the limiter would work harder than lim.max */
    const L1 = punch(y, sr), tp = tpEnv(y), ceil = lin(CEIL_DB), La = Math.max(2, ms(1.5)), rc = coef(P.lim.rel, sr);
    /* noise-type sounds (P.clip dB): a soft clipper shaves the rare noise peaks first (its distortion hides in the noise), then the
     * limiter. Gaussian noise has a ~12 dB crest factor, so without it a hat could never reach a synth-matched level under -1 dBTP. */
    const out = new Float32Array(len), z = P.clip > 0 ? new Float64Array(len) : null, cT = ceil * 0.97, cK = cT * lin(-6);
    let clipIn = 0;
    const render = (g) => {
      const gl = lin(g);
      let ptp = tp, src = y, sc2 = gl;
      if (z) {
        let pk = 0;
        for (let i = 0; i < len; i++) { const v = y[i] * gl, a = Math.abs(v); if (a > pk) pk = a; z[i] = a <= cK ? v : (v < 0 ? -1 : 1) * (cK + (cT - cK) * Math.tanh((a - cK) / (cT - cK))); }
        clipIn = dB(pk / cT); ptp = tpEnv(z); src = z; sc2 = 1;
      }
      const gc = limitGain(ptp, sc2, ceil, La, rc);
      let mn = 1; for (let i = 0; i < len; i++) { out[i] = src[i] * sc2 * gc[i]; if (gc[i] < mn) mn = gc[i]; }
      return -dB(mn);
    };
    /* aim at the level AFTER limiting (limiting lowers the loudest 30 ms too), never more than lim.max dB of limiting / clip dB of clipping */
    const clipMax = P.clip > 0 ? P.clip : Infinity, over = () => Math.max(limDb - P.lim.max, clipIn - clipMax), room = () => Math.min(P.lim.max - limDb, clipMax - clipIn);
    let gDb = P.target - L1, limDb = render(gDb);
    for (let it = 0; it < 12; it++) {
      const err = P.target - punch(out, sr);
      let step = 0;
      if (over() > 0.05) step = -over();
      else if (err > 0.1 && room() > 0.05) step = Math.min(err, room());
      else if (err < -0.1) step = err;
      if (Math.abs(step) < 0.05) break;
      gDb += step; limDb = render(gDb);
    }
    if (over() > 0.05) { gDb -= over(); limDb = render(gDb); }
    /* 10. edges */
    const fi = Math.min(len >> 2, ms(FADE_IN_MS)), fo = Math.min(len >> 1, ms(capped ? Math.max(P.fadeMs, 60) : P.fadeMs));
    edges(out, fi, fo);
    let tpo = truePeak(out);
    if (tpo > CEIL_DB) { const k = lin(CEIL_DB - tpo - 0.01); for (let i = 0; i < len; i++) out[i] *= k; tpo = truePeak(out); }
    /* the dry A/B version: same cut, same edges, same short-term level, peaks kept under the same ceiling */
    const dry = new Float32Array(len);
    for (let i = 0; i < len; i++) dry[i] = x[start + i];
    edges(dry, fi, fo);
    const lo2 = punch(out, sr), ld = punch(dry, sr);
    let dg = lin(lo2 - ld);
    for (let i = 0; i < len; i++) dry[i] *= dg;
    const tpd = truePeak(dry);
    if (tpd > CEIL_DB) { dg = lin(CEIL_DB - tpd - 0.01); for (let i = 0; i < len; i++) dry[i] *= dg; }
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      data: out, dry, start, end,
      info: {
        ok: true, id: P.id, family: P.fam, noiseDb: r1(dB(nfA)), onsetMs: r1(onset / sr * 1000), startMs: r1(start / sr * 1000), lengthMs: r1(len / sr * 1000), capped,
        openDb: r1(dB(openThr)), closeDb: r1(dB(closeThr)), segments: merged.length, stageDb: r1(stage), lowShare: lowShare == null ? null : Math.round(lowShare * 100) / 100,
        bass: !!P.exciter, compDb: r1(compDb), deessDb: r1(deessDb), clipDb: z ? r1(Math.max(0, clipIn)) : 0, limDb: r1(limDb), gainDb: r1(stage + gDb), punchDb: r1(lo2), targetDb: P.target, peakDb: r1(tpo),
      },
    };
  }
  /** fade-in over fi samples (raised cosine), equal-power fade-out over fo samples; first and last samples become exactly 0 */
  function edges(a, fi, fo) {
    const n = a.length;
    for (let i = 0; i < fi; i++) a[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
    for (let k = 0; k < fo; k++) a[n - 1 - k] *= Math.sin(0.5 * Math.PI * k / fo);
    if (n) { a[0] = 0; a[n - 1] = 0; }
  }
  /** one line for the recorder UI: what the chain did */
  function summary(info) {
    if (!info || !info.ok) return '';
    const p = ['ROOM ' + Math.round(info.noiseDb) + 'DB', 'GATE', info.bass ? 'LOW BOOST' : 'LOW CUT'];
    if (info.compDb >= 0.5) p.push('COMP ' + Math.round(info.compDb) + 'DB');
    if (info.deessDb >= 1) p.push('DE-ESS');
    p.push('LEVEL ' + Math.round(info.punchDb) + 'DB');
    return p.map((s) => s.replace(/ /g, ' ')).join('  ');
  }

  BBH.VoiceFX = { version: 1, process, profile, resolveId, response, punch, truePeak, summary, coefs, FAMILIES, SOUND, CEIL_DB, STAGE_DB };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
