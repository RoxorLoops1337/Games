/* BBH.Mic: microphone input and voice analysis for Beatbox Heroes.
 *
 * Part 1 (pure DSP, deterministic, no DOM, runs in node):
 *   yin / noteName / midi / cents      pitch detection (YIN with parabolic refinement at the full sample rate)
 *   rms / bandFeatures / featureVec    8 band log-energies + spectral centroid + zero-crossing rate
 *   makeOnsetDetector                  spectral-flux onsets, adaptive threshold, 40 ms lookahead features
 *   defaultProfiles / makeClassifier / trainFromSamples   B / T / K / Pf voice classifier (naive Bayes on diag Gaussians)
 *   trimSample                         clean a raw recording into a game-ready drum sample
 *
 * Part 2 (browser wrapper, guarded so the file still loads in node):
 *   open / close / isOpen / level / sampleRate / onFrame / pitchNow / recordSample / listen / latencyMs
 *
 * No em dashes anywhere in this file (project rule).
 */
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  /* ================================================================== helpers */
  function midi(freq) { return freq > 0 ? 69 + 12 * Math.log2(freq / 440) : NaN; }
  function noteName(freq) {
    if (!(freq > 0)) return '';
    const m = Math.round(midi(freq));
    return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }
  /** signed cents of freq relative to a target MIDI note number (may be fractional) */
  function cents(freq, targetMidi) {
    if (!(freq > 0)) return NaN;
    return 1200 * Math.log2(freq / (440 * Math.pow(2, (targetMidi - 69) / 12)));
  }
  function rms(frame) {
    const n = frame.length;
    if (!n) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) s += frame[i] * frame[i];
    return Math.sqrt(s / n);
  }

  /* ================================================================== YIN */
  let yD = new Float32Array(1024), yC = new Float32Array(1024), yX = new Float32Array(1024), yR = new Float64Array(8);
  /**
   * YIN pitch detector. frame: Float32Array (2048 samples ideal, the LAST 2048 are used when longer).
   * Returns { freq, clarity }: freq 0 when silent or unvoiced (clarity < minClarity). clarity = 1 - cmnd at the picked lag.
   * opts: fmin 70, fmax 1100, threshold 0.15, minClarity 0.7, minRms 0.003
   */
  function yin(frame, sr, opts) {
    opts = opts || {};
    const fmin = opts.fmin || 70, fmax = opts.fmax || 1100, thr = opts.threshold || 0.15;
    const minClarity = opts.minClarity != null ? opts.minClarity : 0.7, minRms = opts.minRms != null ? opts.minRms : 0.003;
    const total = frame.length, n = Math.min(total, 2048), off = total - n;
    if (n < 256 || !(sr > 0)) return { freq: 0, clarity: 0 };
    let e = 0;
    for (let i = 0; i < n; i++) { const v = frame[off + i]; e += v * v; }
    if (Math.sqrt(e / n) < minRms) return { freq: 0, clarity: 0 };
    /* stage 1: decimate by 2 (pair average) at >= 32 kHz to quarter the work, then CMND search */
    const dec = sr >= 32000 ? 2 : 1, m = Math.floor(n / dec), srd = sr / dec, W = m >> 1;
    if (yX.length < m) { yX = new Float32Array(m); }
    if (yD.length < W + 1) { yD = new Float32Array(W + 1); yC = new Float32Array(W + 1); }
    if (dec === 2) for (let i = 0; i < m; i++) yX[i] = 0.5 * (frame[off + 2 * i] + frame[off + 2 * i + 1]);
    else for (let i = 0; i < m; i++) yX[i] = frame[off + i];
    const tauMin = Math.max(2, Math.floor(srd / fmax)), tauMax = Math.min(W - 1, Math.ceil(srd / fmin));
    if (tauMax <= tauMin + 2) return { freq: 0, clarity: 0 };
    const x = yX, cm = yC;
    cm[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const d = x[j] - x[j + tau]; s += d * d; }
      run += s;
      cm[tau] = run > 1e-12 ? (s * tau) / run : 1;
    }
    let found = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cm[tau] < thr) {
        while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++;
        found = tau; break;
      }
    }
    if (found < 0) {
      let best = tauMin;
      for (let tau = tauMin + 1; tau <= tauMax; tau++) if (cm[tau] < cm[best]) best = tau;
      found = best;
    }
    const clarity = clamp(1 - cm[found], 0, 1);
    if (clarity < minClarity) return { freq: 0, clarity };
    /* stage 2: refine on the full-rate signal, +-3 samples around the lag, parabolic interpolation */
    const t0 = found * dec, lo = Math.max(1, t0 - 3), hi = t0 + 3;
    const Wf = Math.min(1024, n - hi - 1);
    if (Wf < 128) return { freq: sr / t0, clarity };
    let bi = -1, bv = Infinity;
    for (let t = lo; t <= hi; t++) {
      let s = 0;
      for (let j = 0; j < Wf; j++) { const d = frame[off + j] - frame[off + j + t]; s += d * d; }
      yR[t - lo] = s;
      if (s < bv) { bv = s; bi = t - lo; }
    }
    let tau = lo + bi;
    if (bi > 0 && bi < hi - lo) {
      const s0 = yR[bi - 1], s1 = yR[bi], s2 = yR[bi + 1], den = s0 - 2 * s1 + s2;
      if (den > 1e-15) tau += clamp(0.5 * (s0 - s2) / den, -1, 1);
    }
    return { freq: sr / tau, clarity };
  }

  /* ================================================================== FFT + spectra */
  function makeFFT(n) {
    const rev = new Uint16Array(n), cs = new Float64Array(n >> 1), sn = new Float64Array(n >> 1);
    const bits = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
    for (let k = 0; k < n >> 1; k++) { cs[k] = Math.cos(2 * Math.PI * k / n); sn[k] = Math.sin(2 * Math.PI * k / n); }
    return function fft(re, im) {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const l = j + half, tre = re[l] * cs[k] + im[l] * sn[k], tim = -re[l] * sn[k] + im[l] * cs[k];
            re[l] = re[j] - tre; im[l] = im[j] - tim; re[j] += tre; im[j] += tim;
          }
        }
      }
    };
  }
  function hann(n) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w; }

  const F1024 = makeFFT(1024), W1024 = hann(1024), RE = new Float64Array(1024), IM = new Float64Array(1024), PW = new Float64Array(513);
  let W1024sum = 0; for (let i = 0; i < 1024; i++) W1024sum += W1024[i];
  const NORM1024 = 1 / ((W1024sum / 2) * (W1024sum / 2));
  /** power spectrum (amplitude-normalised: a sine of amplitude A peaks near A^2) of 1024 samples starting at off; zero padded */
  function spectrum1024(frame, off) {
    const len = frame.length;
    for (let i = 0; i < 1024; i++) { const k = off + i; RE[i] = (k >= 0 && k < len ? frame[k] : 0) * W1024[i]; IM[i] = 0; }
    F1024(RE, IM);
    for (let k = 0; k <= 512; k++) PW[k] = (RE[k] * RE[k] + IM[k] * IM[k]) * NORM1024;
    return PW;
  }
  const BAND_EDGES = [0, 150, 300, 600, 1200, 2500, 5000, 8000, 1e9];
  function bandSums(sr, out) {
    const bw = sr / 1024;
    for (let b = 0; b < 8; b++) out[b] = 0;
    let tot = 0, cen = 0;
    for (let k = 1; k <= 512; k++) {
      const f = k * bw, p = PW[k];
      let b = 0; while (b < 7 && f >= BAND_EDGES[b + 1]) b++;
      out[b] += p; tot += p; cen += f * p;
    }
    return { tot, centroid: tot > 1e-14 ? cen / tot : 0 };
  }
  const BS = new Float64Array(8);
  /** 8 band energies in dB (10*log10 of summed normalised power). frame: last 1024 samples are used (zero padded if shorter) */
  function bandFeatures(frame, sr, out) {
    out = out || new Float32Array(8);
    const off = frame.length > 1024 ? frame.length - 1024 : 0;
    spectrum1024(frame, off);
    bandSums(sr, BS);
    for (let b = 0; b < 8; b++) out[b] = 10 * Math.log10(BS[b] + 1e-12);
    return out;
  }
  /**
   * Feature vector for classification. vec[0..7]: log10 fraction of total energy per band (shape only, so loudness
   * independent, clamped -6..0); vec[8]: log2(centroid / 1 kHz) clamped -4..4; vec[9]: zero-crossing rate 0..1.
   * Also returns rms, centroid (Hz), zcr. Uses the first 1024 samples of the frame (zero padded).
   */
  function featureVec(frame, sr, out) {
    const len = Math.min(frame.length, 1024);
    spectrum1024(frame, 0);
    const info = bandSums(sr, BS);
    const vec = out || new Float32Array(10);
    const tot = info.tot + 1e-12;
    for (let b = 0; b < 8; b++) vec[b] = clamp(Math.log10((BS[b] + 1e-12) / tot), -6, 0);
    let mean = 0; for (let i = 0; i < len; i++) mean += frame[i]; mean = len ? mean / len : 0;
    let z = 0, prev = len ? frame[0] - mean : 0;
    for (let i = 1; i < len; i++) { const v = frame[i] - mean; if ((v >= 0) !== (prev >= 0)) z++; prev = v; }
    const zcr = len > 1 ? z / (len - 1) : 0;
    vec[8] = info.centroid > 0 ? clamp(Math.log2(info.centroid / 1000), -4, 4) : -4;
    vec[9] = zcr;
    let e = 0; for (let i = 0; i < len; i++) e += frame[i] * frame[i];
    return { vec, rms: len ? Math.sqrt(e / len) : 0, centroid: info.centroid, zcr };
  }

  /* ================================================================== onset location (shared) */
  /** Index (in arr) of the first sample of the sharp energy rise inside arr[from..to), found on 16-sample blocks; -1 if none. */
  function locateOnset(arr, from, to) {
    const BL = 16, nb = Math.floor((to - from) / BL);
    if (nb < 3) return -1;
    const env = new Float64Array(nb);
    for (let k = 0; k < nb; k++) { let s = 0; for (let i = 0; i < BL; i++) { const v = arr[from + k * BL + i]; s += v * v; } env[k] = Math.sqrt(s / BL); }
    const EPS = 0.002, d = new Float64Array(nb);
    let dmax = 0;
    for (let k = 1; k < nb; k++) {
      let m = 0, c = 0;
      for (let j = Math.max(0, k - 4); j < k; j++) { m += env[j]; c++; }
      m /= c;
      d[k] = Math.log(env[k] + EPS) - Math.log(m + EPS);
      if (d[k] > dmax) dmax = d[k];
    }
    if (dmax < 0.7) return -1;
    for (let k = 1; k < nb; k++) if (d[k] >= 0.6 * dmax) return from + k * BL;
    return -1;
  }

  /* ================================================================== onset detector */
  const F512 = makeFFT(512), W512 = hann(512);
  let W512sum = 0; for (let i = 0; i < 512; i++) W512sum += W512[i];
  const NORM512 = 1 / ((W512sum / 2) * (W512sum / 2));
  const FLUX_EDGES_HZ = [60, 120, 200, 300, 450, 650, 900, 1300, 1800, 2500, 3500, 5000, 7000, 10000, 1e9];

  /**
   * Spectral-flux onset detector. feed(frame, sampleRate) -> null | { time, strength, vec, rms, ageSec, sample }.
   * time: onset position in seconds on the fed-sample clock (first sample fed = 0). strength 0..1 (peak level of the
   * 40 ms after the onset, -40 dB..0 dB). vec: featureVec of the 1024 samples starting 3 ms before the onset. The event is
   * emitted once lookaheadMs (default 40) of audio after the onset has been fed. ageSec: how long ago the onset was, at the
   * end of the frame that produced the event.
   * opts: refractoryMs 90, lookaheadMs 40, factor 2.5, floor 40, minLevel 0.012, medianHops 24
   */
  function makeOnsetDetector(o) {
    o = o || {};
    const refMs = o.refractoryMs != null ? o.refractoryMs : 90, laMs = o.lookaheadMs != null ? o.lookaheadMs : 40;
    const factor = o.factor || 2.5, floor = o.floor != null ? o.floor : 40, minLevel = o.minLevel != null ? o.minLevel : 0.012;
    const medN = o.medianHops || 24, H = 256, WN = 512, RING = 16384, MASK = RING - 1;
    const ring = new Float32Array(RING), re = new Float64Array(WN), im = new Float64Array(WN);
    const scratch = new Float32Array(1280), win = new Float32Array(1024);
    const hist = new Float32Array(medN), sorted = new Float32Array(medN);
    let histN = 0, histI = 0;
    let fed = 0, hopEnd = WN, sr = 0, edges = null, nb = 0, prevDb = null, curDb = null, nf = 0.004, lastS = -1e12, lastHopRms = 0;
    const queue = [];

    function setup(rate) {
      sr = rate;
      const bw = rate / WN, e = [];
      let prev = 0;
      for (let i = 0; i < FLUX_EDGES_HZ.length; i++) {
        let b = Math.ceil(FLUX_EDGES_HZ[i] / bw);
        if (b > 257) b = 257;
        if (b <= prev) b = prev + 1;
        if (b > 257) break;
        e.push(b); prev = b;
        if (b === 257) break;
      }
      if (e[e.length - 1] < 257) e.push(257);
      edges = e; nb = e.length - 1;
      prevDb = new Float64Array(nb); curDb = new Float64Array(nb);
      prevDb.fill(-90);
    }
    function processHop(end) {
      const start = end - WN;
      let sumsq = 0;
      for (let i = 0; i < WN; i++) { const v = ring[(start + i) & MASK]; re[i] = v * W512[i]; im[i] = 0; sumsq += v * v; }
      F512(re, im);
      let flux = 0;
      for (let b = 0; b < nb; b++) {
        let p = 0;
        for (let k = edges[b]; k < edges[b + 1]; k++) p += (re[k] * re[k] + im[k] * im[k]) * NORM512;
        const db = 10 * Math.log10(p + 1e-9);
        curDb[b] = db;
        const d = db - prevDb[b];
        if (d > 0) flux += d;
      }
      const t = prevDb; prevDb = curDb; curDb = t;
      const winRms = Math.sqrt(sumsq / WN);
      let hs = 0; for (let i = WN - H; i < WN; i++) { const v = ring[(start + i) & MASK]; hs += v * v; }
      lastHopRms = Math.sqrt(hs / H);
      /* adaptive threshold from previous flux values */
      let thr = Infinity;
      if (histN >= 8) {
        for (let i = 0; i < histN; i++) sorted[i] = hist[i];
        const sub = sorted.subarray(0, histN).sort();
        thr = sub[histN >> 1] * factor + floor;
      }
      /* noise floor: follows quiet fast, loud very slowly */
      if (lastHopRms < nf) nf += (lastHopRms - nf) * 0.3;
      else if (end - lastS > 0.2 * sr) nf += (lastHopRms - nf) * 0.002;
      hist[histI] = flux; histI = (histI + 1) % medN; if (histN < medN) histN++;
      if (flux > thr && winRms > Math.max(minLevel, nf * 3)) {
        const from = Math.max(0, end - 1024, fed - RING + 1);
        const n = end - from;
        for (let i = 0; i < n; i++) scratch[i] = ring[(from + i) & MASK];
        const loc = locateOnset(scratch, 0, n);
        const S = loc >= 0 ? from + loc : end - 128;
        if (S - lastS >= refMs * 0.001 * sr) {
          lastS = S;
          queue.push({ S, emitAt: S + Math.round(laMs * 0.001 * sr) });
        }
      }
    }
    function emit(p) {
      const pre = Math.round(0.003 * sr), a = Math.max(0, p.S - pre);
      let peak = 0;
      const end = Math.min(fed, a + 1024), lo = Math.max(a, fed - RING + 1);
      win.fill(0);
      for (let i = lo; i < end; i++) { const v = ring[i & MASK]; win[i - a] = v; }
      const pe = Math.min(fed, p.S + Math.round(laMs * 0.001 * sr));
      for (let i = Math.max(p.S, fed - RING + 1); i < pe; i++) { const v = Math.abs(ring[i & MASK]); if (v > peak) peak = v; }
      const fv = featureVec(win, sr);
      const strength = peak > 0 ? clamp((20 * Math.log10(peak) + 40) / 40, 0, 1) : 0;
      return { time: p.S / sr, strength, vec: fv.vec, rms: fv.rms, ageSec: (fed - p.S) / sr, sample: p.S };
    }
    function feed(frame, rate) {
      if (!(rate > 0) || !frame || !frame.length) return queue.length && queue[0].emitAt <= fed ? emit(queue.shift()) : null;
      if (rate !== sr) setup(rate);
      let from = 0;
      if (frame.length > RING) from = frame.length - RING;
      for (let i = from; i < frame.length; i++) ring[(fed + i - from) & MASK] = frame[i];
      fed += frame.length - from;
      while (hopEnd <= fed) { processHop(hopEnd); hopEnd += H; }
      if (queue.length && queue[0].emitAt <= fed) return emit(queue.shift());
      return null;
    }
    function reset() { fed = 0; hopEnd = WN; histN = 0; histI = 0; nf = 0.004; lastS = -1e12; queue.length = 0; if (prevDb) prevDb.fill(-90); }
    return { feed, reset, noiseFloor: () => nf };
  }

  /* ================================================================== classifier */
  const NDIM = 10;
  const MIN_STD = [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.25, 0.04];
  function mkProfile(name, mean, std, rmsHint) {
    return { name, mean: Float32Array.from(mean), std: Float32Array.from(std), n: 3, rms: rmsHint };
  }
  /**
   * Default voice profiles for the 4 lanes (array of 4): { name, mean:Float32Array(10), std:Float32Array(10), n, rms }.
   * B: low thump, nearly all energy under 200 Hz, centroid ~150 Hz. T: short bright noise, centroid 6 kHz+, high zcr.
   * K: mid crack with a transient, centroid 1.5 to 3.5 kHz. Pf: breathy mid-high noise, centroid 2.5 to 5 kHz, quieter (rms is a hint only).
   */
  function defaultProfiles() {
    return PROFILE_DATA.map((p) => mkProfile(p[0], p[1], p[2], p[3]));
  }
  /* mean / std per dim: 8 band fractions (log10), log2 centroid/1k, zcr.  Measured on synthetic prototypes, std widened for real voices. */
  const PROFILE_DATA = [
    ['B', [-0.4, -1.0, -2.6, -4.0, -4.8, -5.0, -5.2, -5.0, -3.0, 0.02], [0.6, 0.8, 1.2, 1.4, 1.4, 1.4, 1.4, 1.4, 0.7, 0.05], 0.3],
    ['T', [-5.8, -5.8, -5.4, -4.5, -3.0, -1.5, -0.9, -0.15, 3.5, 0.55], [1.0, 1.0, 1.0, 1.0, 0.9, 0.8, 0.6, 0.5, 0.8, 0.15], 0.15],
    ['K', [-3.0, -0.6, -1.6, -1.7, -1.0, -0.8, -1.1, -1.7, 0.85, 0.1], [0.9, 0.6, 1.2, 0.7, 0.5, 0.4, 0.5, 0.6, 0.5, 0.06], 0.3],
    ['Pf', [-4.4, -3.9, -2.8, -1.9, -0.8, -0.3, -0.75, -1.0, 2.15, 0.27], [0.8, 0.8, 0.8, 0.7, 0.6, 0.35, 0.4, 0.4, 0.35, 0.07], 0.1],
  ];

  function toProfileArray(p) {
    const out = [];
    const def = defaultProfiles();
    for (let l = 0; l < 4; l++) {
      const src = p && (p[l] || (p.profiles && p.profiles[l]));
      if (src && src.mean && src.std) out.push({ name: src.name || def[l].name, mean: Float32Array.from(src.mean), std: Float32Array.from(src.std), n: src.n > 0 ? src.n : 3, rms: src.rms });
      else out.push(def[l]);
    }
    return out;
  }
  const TEMP = 4;
  /**
   * makeClassifier(profiles?) -> { classify(vec), learn(lane, vec), fromSamples(samplesByLane, sampleRate), reset(), count(lane), profiles() }
   * Naive Bayes on diagonal Gaussians. The base profile acts as n pseudo-examples; learned examples shift mean and widen/narrow std.
   * classify returns { lane, confidence, scores:[4] } (scores are tempered softmax probabilities summing to 1).
   */
  function makeClassifier(profiles) {
    let base = toProfileArray(profiles);
    const ex = [[], [], [], []];
    let models = null;
    function build() {
      models = base.map((b, l) => {
        const e = ex[l], m = e.length, pw = b.n, mean = new Float64Array(NDIM), std = new Float64Array(NDIM);
        for (let d = 0; d < NDIM; d++) {
          let s = pw * b.mean[d];
          for (let i = 0; i < m; i++) s += e[i][d];
          mean[d] = s / (pw + m);
          let v = pw * (b.std[d] * b.std[d] + (b.mean[d] - mean[d]) * (b.mean[d] - mean[d]));
          for (let i = 0; i < m; i++) v += (e[i][d] - mean[d]) * (e[i][d] - mean[d]);
          std[d] = Math.max(Math.sqrt(v / (pw + m)), MIN_STD[d]);
        }
        let lg = 0; for (let d = 0; d < NDIM; d++) lg += 2 * Math.log(std[d]);
        return { mean, std, lg };
      });
    }
    function classify(vec) {
      if (!models) build();
      const cost = [0, 0, 0, 0];
      for (let l = 0; l < 4; l++) {
        const M = models[l];
        let c = M.lg;
        for (let d = 0; d < NDIM; d++) { const z = (vec[d] - M.mean[d]) / M.std[d]; c += z * z; }
        cost[l] = isFinite(c) ? c : 1e9;
      }
      let mn = Infinity, best = 0;
      for (let l = 0; l < 4; l++) if (cost[l] < mn) { mn = cost[l]; best = l; }
      const sc = [0, 0, 0, 0];
      let sum = 0;
      for (let l = 0; l < 4; l++) { sc[l] = Math.exp(-0.5 * (cost[l] - mn) / TEMP); sum += sc[l]; }
      for (let l = 0; l < 4; l++) sc[l] /= sum;
      return { lane: best, confidence: sc[best], scores: sc };
    }
    function learn(lane, vec) {
      lane = lane | 0;
      if (lane < 0 || lane > 3 || !vec || vec.length < NDIM) return false;
      const e = ex[lane];
      e.push(Float32Array.from(vec));
      if (e.length > 64) e.shift();
      models = null;
      return true;
    }
    function fromSamples(samplesByLane, sampleRate) {
      const tr = trainFromSamples(samplesByLane, sampleRate || 44100);
      for (let l = 0; l < 4; l++) if (samplesByLane && samplesByLane[l] && samplesByLane[l].length) { base[l] = tr[l]; ex[l].length = 0; }
      models = null;
      return api;
    }
    function reset() { base = toProfileArray(profiles); for (let l = 0; l < 4; l++) ex[l].length = 0; models = null; }
    const api = { classify, learn, fromSamples, reset, count: (l) => ex[l | 0] ? ex[l | 0].length : 0, profiles: () => base.map((b) => ({ name: b.name, mean: b.mean.slice(), std: b.std.slice(), n: b.n, rms: b.rms })) };
    return api;
  }

  /**
   * Build profiles from the player's own recordings. samplesByLane: { 0: Float32Array, 1:..., 2:..., 3:... } (any subset; each is
   * one labelled example, features are taken around its onset at 3 jittered offsets). Lanes without a sample keep the default.
   * Returns an array of 4 profiles usable with makeClassifier(profiles).
   */
  function trainFromSamples(samplesByLane, sr) {
    const def = defaultProfiles(), out = [];
    for (let l = 0; l < 4; l++) {
      const s = samplesByLane && samplesByLane[l];
      if (!s || s.length < 64) { out.push(def[l]); continue; }
      const lim = Math.min(s.length, Math.round(0.15 * sr));
      let on = locateOnset(s, 0, lim);
      if (on < 0) on = 0;
      const vs = [];
      let peakRms = 0;
      for (const ms of [-2, 0, 3]) {
        const start = Math.max(0, on - Math.round(0.003 * sr) + Math.round(ms * 0.001 * sr));
        const fv = featureVec(s.subarray(start, Math.min(s.length, start + 1024)), sr);
        vs.push(fv.vec.slice());
        if (fv.rms > peakRms) peakRms = fv.rms;
      }
      const mean = new Float32Array(NDIM), std = new Float32Array(NDIM);
      for (let d = 0; d < NDIM; d++) {
        let m = 0; for (const v of vs) m += v[d]; m /= vs.length;
        let q = 0; for (const v of vs) q += (v[d] - m) * (v[d] - m);
        mean[d] = m;
        std[d] = Math.max(Math.sqrt(q / vs.length), 0.6 * def[l].std[d], MIN_STD[d]);
      }
      out.push({ name: def[l].name, mean, std, n: vs.length, rms: peakRms });
    }
    return out;
  }

  /* ================================================================== trimSample */
  /**
   * Clean a raw recording: remove DC, cut leading silence to the onset (5 ms pre-roll), end once RMS stays below 0.015 for 120 ms,
   * cap at 600 ms, fade the last 8 ms, peak-normalise to 0.85. Returns an empty Float32Array when RMS never exceeds 0.04.
   * opts: onsetRms 0.04, endRms 0.015, quietMs 120, maxMs 600, preMs 5, fadeMs 8, peak 0.85
   */
  function trimSample(buffer, sr, opts) {
    opts = opts || {};
    const onsetRms = opts.onsetRms != null ? opts.onsetRms : 0.04, endRms = opts.endRms != null ? opts.endRms : 0.015;
    const quiet = Math.round((opts.quietMs != null ? opts.quietMs : 120) * 0.001 * sr), maxLen = Math.round((opts.maxMs != null ? opts.maxMs : 600) * 0.001 * sr);
    const pre = Math.round((opts.preMs != null ? opts.preMs : 5) * 0.001 * sr), fade = Math.round((opts.fadeMs != null ? opts.fadeMs : 8) * 0.001 * sr);
    const peakT = opts.peak != null ? opts.peak : 0.85;
    const n = buffer ? buffer.length : 0;
    if (n < 32 || !(sr > 0)) return new Float32Array(0);
    let mean = 0; for (let i = 0; i < n; i++) mean += buffer[i]; mean /= n;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = buffer[i] - mean;
    const bl = Math.max(16, Math.round(0.003 * sr));
    const blockRms = (a) => { const b = Math.min(n, a + bl); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return b > a ? Math.sqrt(s / (b - a)) : 0; };
    let i0 = -1;
    for (let a = 0; a + bl <= n; a += bl >> 1) if (blockRms(a) > onsetRms) { i0 = a; break; }
    if (i0 < 0) return new Float32Array(0);
    let j = i0;
    const back = Math.round(0.004 * sr);
    while (j > 0 && i0 - j < back && Math.abs(x[j - 1]) > 0.015) j--;
    const start = Math.max(0, j - pre);
    /* tail: first point after which RMS stays under endRms for `quiet` samples */
    const eb = Math.max(16, Math.round(0.005 * sr));
    let end = Math.min(n, start + maxLen), run = 0;
    for (let a = i0; a < n; a += eb) {
      let s = 0; const b = Math.min(n, a + eb);
      for (let i = a; i < b; i++) s += x[i] * x[i];
      const r = Math.sqrt(s / Math.max(1, b - a));
      if (r < endRms) { run += b - a; if (run >= quiet) { end = Math.min(end, b - run + Math.round(0.01 * sr)); break; } } else run = 0;
    }
    end = Math.min(end, start + maxLen, n);
    if (end - start < 16) return new Float32Array(0);
    const out = x.slice(start, end);
    const f = Math.min(fade, out.length >> 1);
    for (let i = 0; i < f; i++) out[out.length - 1 - i] *= i / f;
    let pk = 0; for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > pk) pk = a; }
    if (pk < 1e-6) return new Float32Array(0);
    const g = peakT / pk;
    for (let i = 0; i < out.length; i++) out[i] *= g;
    return out;
  }

  /* ================================================================== browser wrapper */
  const WORKLET_SRC = "class BBHMic extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(1024);this.i=0;}" +
    "process(inputs){const c=inputs[0]&&inputs[0][0];if(c){for(let k=0;k<c.length;k++){this.b[this.i++]=c[k];if(this.i===1024){this.port.postMessage(this.b,[this.b.buffer]);this.b=new Float32Array(1024);this.i=0;}}}return true;}}" +
    "registerProcessor('bbh-mic',BBHMic);";
  const R = { ctx: null, stream: null, src: null, node: null, mute: null, sr: 0, open: false, opening: null, token: 0, track: null, latencyUser: null, lat: 0 };
  const frame = new Float32Array(1024), ring = new Float32Array(8192), pitchBuf = new Float32Array(2048);
  let ringW = 0, lvl = 0, pitchT = 0, pitchLast = { freq: 0, clarity: 0 };
  const subs = [], closeSubs = [];
  let dispatching = false, dirty = false, rec = null, sharedClassifier = null;

  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());

  function handleFrame() {
    /* frame (1024) holds the newest samples */
    for (let i = 0; i < 1024; i++) ring[(ringW + i) & 8191] = frame[i];
    ringW += 1024;
    const r = rms(frame);
    lvl += (r - lvl) * (r > lvl ? 0.6 : 0.15);
    if (rec) stepRecording();
    dispatching = true;
    for (let i = 0; i < subs.length; i++) { const f = subs[i]; if (f) { try { f(frame); } catch (e) { /* keep the audio path alive */ } } }
    dispatching = false;
    if (dirty) { for (let i = subs.length - 1; i >= 0; i--) if (!subs[i]) subs.splice(i, 1); dirty = false; }
  }
  function onFrame(cb) {
    if (typeof cb !== 'function') return () => {};
    subs.push(cb);
    return function unsub() {
      const i = subs.indexOf(cb);
      if (i < 0) return;
      if (dispatching) { subs[i] = null; dirty = true; } else subs.splice(i, 1);
    };
  }

  /* ---- recording state machine ---- */
  function finishRec(res) {
    const r = rec; rec = null;
    if (r) r.resolve(res);
  }
  function stepRecording() {
    const r = rec, sr = R.sr;
    if (r.pos + 1024 > r.buf.length) { finishRec({ ok: false, data: new Float32Array(0), sampleRate: sr, reason: 'timeout' }); return; }
    r.buf.set(frame, r.pos);
    for (let s = 0; s < 1024; s += 256) {
      const p = r.pos + s;
      let e = 0; for (let i = 0; i < 256; i++) { const v = frame[s + i]; e += v * v; }
      const lv = Math.sqrt(e / 256);
      if (r.onset < 0) {
        if (lv > 0.04) { r.onset = p; r.quiet = 0; }
      } else {
        if (lv < 0.015) r.quiet += 256; else r.quiet = 0;
        if (r.quiet >= 0.12 * sr || p + 256 - r.onset >= 0.75 * sr) {
          const from = Math.max(0, r.onset - 4096), to = p + 256;
          const data = trimSample(r.buf.subarray(from, to), sr);
          finishRec(data.length ? { ok: true, data, sampleRate: sr, reason: 'ok' } : { ok: false, data, sampleRate: sr, reason: 'quiet' });
          return;
        }
      }
    }
    r.pos += 1024;
    if (r.onLevel) { try { r.onLevel(lvl, r.onset < 0 ? 'wait' : 'rec'); } catch (e) { /* ignore */ } }
    if (r.onset < 0 && r.pos / sr * 1000 > r.maxWait) finishRec({ ok: false, data: new Float32Array(0), sampleRate: sr, reason: 'timeout' });
  }
  /**
   * Auto-detect recording: waits for a sound (RMS > 0.04), records until 120 ms of quiet (or 750 ms), returns the trimmed and
   * normalised sample. Resolves { ok, data, sampleRate, reason } with reason 'ok' | 'timeout' | 'quiet' | 'closed' | 'cancelled'.
   */
  function recordSample(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!R.open || !R.sr) { resolve({ ok: false, data: new Float32Array(0), sampleRate: R.sr || 0, reason: 'closed' }); return; }
      if (rec) finishRec({ ok: false, data: new Float32Array(0), sampleRate: R.sr, reason: 'cancelled' });
      const maxWait = opts.maxWaitMs > 0 ? opts.maxWaitMs : 4000;
      const cap = Math.ceil((maxWait + 1200) * 0.001 * R.sr / 1024 + 2) * 1024;
      rec = { resolve, buf: new Float32Array(cap), pos: 0, onset: -1, quiet: 0, maxWait, onLevel: opts.onLevel };
    });
  }
  function cancelRecording() { if (rec) finishRec({ ok: false, data: new Float32Array(0), sampleRate: R.sr, reason: 'cancelled' }); }

  /* ---- open / close ---- */
  function fail(error, detail) { return { ok: false, error, detail: detail ? String(detail) : undefined }; }
  function teardown() {
    const ctx = R.ctx, stream = R.stream, node = R.node, src = R.src, mute = R.mute;
    R.ctx = R.stream = R.node = R.src = R.mute = R.track = null;
    const was = R.open;
    R.open = false; R.sr = 0; lvl = 0; R.lat = 0;
    if (rec) finishRec({ ok: false, data: new Float32Array(0), sampleRate: 0, reason: 'closed' });
    try { if (stream) stream.getTracks().forEach((t) => { try { t.onended = null; t.stop(); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ }
    try { if (node && node.port) { node.port.onmessage = null; try { node.port.close(); } catch (e) { /* ignore */ } } } catch (e) { /* ignore */ }
    try { if (node) node.onaudioprocess = null; } catch (e) { /* ignore */ }
    try { if (src) src.disconnect(); } catch (e) { /* ignore */ }
    try { if (node) node.disconnect(); } catch (e) { /* ignore */ }
    try { if (mute) mute.disconnect(); } catch (e) { /* ignore */ }
    try { if (ctx && ctx.state !== 'closed') { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* ignore */ }
    return was;
  }
  function close() {
    R.token++;
    R.opening = null;
    const was = teardown();
    if (was) for (let i = 0; i < closeSubs.length; i++) { try { closeSubs[i](); } catch (e) { /* ignore */ } }
  }
  function open() {
    if (R.open) return Promise.resolve({ ok: true });
    if (R.opening) return R.opening;
    const tok = ++R.token;
    const p = doOpen(tok).then(function (r) { if (R.opening === p) R.opening = null; return r; }, function (e) { if (R.opening === p) R.opening = null; return fail('unsupported', e && e.message); });
    R.opening = p;
    return p;
  }
  function doOpen(tok) {
    const nav = root.navigator;
    if (!nav) return Promise.resolve(fail('unsupported'));
    if (root.isSecureContext === false) return Promise.resolve(fail('insecure'));
    const md = nav.mediaDevices;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!md || typeof md.getUserMedia !== 'function') {
      const loc = root.location;
      return Promise.resolve(loc && loc.protocol === 'http:' && !/^(localhost|127\.|\[::1\])/.test(loc.hostname) ? fail('insecure') : fail('unsupported'));
    }
    if (!AC) return Promise.resolve(fail('unsupported'));
    /* create + resume the context NOW, synchronously inside the user gesture (iOS drops the gesture across the permission prompt) */
    let ctx = null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return Promise.resolve(fail('unsupported', e2 && e2.message)); } }
    R.ctx = ctx;
    try { const rp = ctx.resume(); if (rp && rp.catch) rp.catch(() => {}); } catch (e) { /* ignore */ }
    const abort = (r) => { if (R.token === tok) teardown(); else { try { ctx.close(); } catch (e) { /* ignore */ } } return r; };
    const stale = () => R.token !== tok;
    let stream = null;
    return md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }).then(function (s) {
      stream = s;
      if (stale()) { s.getTracks().forEach((t) => t.stop()); try { ctx.close(); } catch (e) { /* ignore */ } return fail('closed'); }
      R.stream = s;
      return buildGraph(ctx, s, tok);
    }, function (err) {
      const nm = err && err.name;
      let code = 'unsupported';
      if (nm === 'NotAllowedError' || nm === 'SecurityError' || nm === 'PermissionDeniedError') code = 'denied';
      else if (nm === 'NotFoundError' || nm === 'DevicesNotFoundError' || nm === 'OverconstrainedError' || nm === 'NotReadableError' || nm === 'TrackStartError') code = 'notfound';
      return abort(fail(code, err && (err.message || nm)));
    }).then(function (res) {
      if (res && !res.ok && stream && R.token === tok && !R.open) teardown();
      return res;
    });
  }
  function buildGraph(ctx, stream, tok) {
    const stale = () => R.token !== tok;
    let src;
    try { src = ctx.createMediaStreamSource(stream); } catch (e) { return Promise.resolve(fail('unsupported', e && e.message)); }
    R.src = src;
    const mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination); R.mute = mute;
    const finish = function (node) {
      if (stale()) { return fail('closed'); }
      R.node = node;
      src.connect(node);
      node.connect(mute);
      R.sr = ctx.sampleRate;
      const tr = stream.getAudioTracks && stream.getAudioTracks()[0];
      R.track = tr || null;
      try { const st = tr && tr.getSettings && tr.getSettings(); R.lat = st && st.latency > 0 ? st.latency * 1000 : 0; } catch (e) { R.lat = 0; }
      if (tr) tr.onended = function () { close(); };
      ctx.onstatechange = function () { if (R.ctx === ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted')) { try { ctx.resume(); } catch (e) { /* ignore */ } } };
      R.open = true; ringW = 0; ring.fill(0); lvl = 0;
      return { ok: true };
    };
    const viaScript = function () {
      if (typeof ctx.createScriptProcessor !== 'function') return fail('unsupported', 'no audio worklet or script processor');
      const sp = ctx.createScriptProcessor(1024, 1, 1);
      sp.onaudioprocess = function (ev) { frame.set(ev.inputBuffer.getChannelData(0).subarray(0, 1024)); handleFrame(); };
      return finish(sp);
    };
    let wl = null;
    try {
      if (ctx.audioWorklet && typeof root.AudioWorkletNode === 'function' && root.Blob && root.URL && root.URL.createObjectURL) {
        const url = root.URL.createObjectURL(new root.Blob([WORKLET_SRC], { type: 'application/javascript' }));
        wl = ctx.audioWorklet.addModule(url).then(function () { try { root.URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, function (e) { try { root.URL.revokeObjectURL(url); } catch (e2) { /* ignore */ } throw e; });
      }
    } catch (e) { wl = null; }
    if (!wl) return Promise.resolve(viaScript());
    return wl.then(function () {
      if (stale()) return fail('closed');
      const node = new root.AudioWorkletNode(ctx, 'bbh-mic', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
      node.port.onmessage = function (ev) { const d = ev.data; if (d && d.length >= 1024) { frame.set(d.length === 1024 ? d : d.subarray(0, 1024)); handleFrame(); } };
      return finish(node);
    }).catch(function () { return stale() ? fail('closed') : viaScript(); });
  }
  /** try to resume the private context (call from a user gesture after the tab was backgrounded / iOS interrupted it) */
  function resume() { try { if (R.ctx && R.ctx.state !== 'running' && R.ctx.state !== 'closed') { const p = R.ctx.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* ignore */ } }

  function pitchNow() {
    if (!R.open || ringW < 2048) return { freq: 0, clarity: 0 };
    const t = now();
    if (t - pitchT < 33) return pitchLast;
    pitchT = t;
    const s = ringW - 2048;
    for (let i = 0; i < 2048; i++) pitchBuf[i] = ring[(s + i) & 8191];
    const r = yin(pitchBuf, R.sr);
    pitchLast = { freq: r.freq, clarity: r.clarity };
    return pitchLast;
  }
  function latencyMs() { return R.latencyUser != null ? R.latencyUser : (R.lat > 0 ? R.lat : 30); }
  function getClassifier() { return sharedClassifier || (sharedClassifier = makeClassifier()); }
  function setClassifier(c) { sharedClassifier = c || null; }
  /**
   * Live hit listener: onset detector + classifier on the open stream. cb({ lane, confidence, scores, strength, time, vec }) per hit,
   * time = performance.now() ms of the hit, already corrected for frame batching and latencyMs(). Returns stop().
   * opts: { classifier, detector (onset detector options) }
   */
  function listen(cb, opts) {
    opts = opts || {};
    const det = makeOnsetDetector(opts.detector), cls = opts.classifier || getClassifier();
    const unsub = onFrame(function (f) {
      if (!R.sr) return;
      const ev = det.feed(f, R.sr);
      if (!ev) return;
      const c = cls.classify(ev.vec);
      try { cb({ lane: c.lane, confidence: c.confidence, scores: c.scores, strength: ev.strength, time: now() - ev.ageSec * 1000 - latencyMs(), vec: ev.vec, rms: ev.rms }); } catch (e) { /* ignore */ }
    });
    return unsub;
  }

  const Mic = {
    version: 1,
    yin, noteName, midi, cents, rms, bandFeatures, featureVec,
    makeOnsetDetector, defaultProfiles, makeClassifier, trainFromSamples, trimSample, locateOnset,
    open, close, resume, isOpen: () => R.open, level: () => lvl, sampleRate: () => R.sr,
    onFrame, onClose: (cb) => { closeSubs.push(cb); return () => { const i = closeSubs.indexOf(cb); if (i >= 0) closeSubs.splice(i, 1); }; },
    pitchNow, recordSample, cancelRecording, listen, getClassifier, setClassifier,
    latencyMs, setLatencyMs: (ms) => { R.latencyUser = typeof ms === 'number' && isFinite(ms) ? Math.max(0, ms) : null; },
  };
  BBH.Mic = Mic;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
