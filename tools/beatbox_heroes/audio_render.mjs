// Offline renderer + analysis tools for beatbox_heroes/audio.js.
//
// A small pure-JS Web Audio implementation (OfflineContext) that renders the exact graph audio.js builds
// (oscillators, noise buffers, biquads, gains with automation, delays with feedback, waveshapers, a compressor)
// into a Float32Array, so levels, spectra and loop seams can be checked numerically without a browser.
//
// CLI:
//   node tools/beatbox_heroes/audio_render.mjs music title [seconds] [out.wav]
//   node tools/beatbox_heroes/audio_render.mjs sfx coin [out.wav]
//   node tools/beatbox_heroes/audio_render.mjs drum 0 [out.wav]
//   node tools/beatbox_heroes/audio_render.mjs groove 100 1 4 [seconds] [out.wav]
//   node tools/beatbox_heroes/audio_render.mjs all [outdir]      (renders everything, prints a stats table)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const BLK = 128;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------- AudioParam */
class Param {
  constructor(ctx, def) { this.ctx = ctx; this.value = def; this.ev = []; this.inputs = new Set(); this._buf = new Float32Array(BLK); }
  _add(e) {
    const ev = this.ev;
    if (e.type === 3) e.from = this.at(e.time);
    if (e.type === 1 || e.type === 2) {
      let prev = null;
      for (let i = 0; i < ev.length; i++) if (ev[i].time <= e.time) prev = ev[i];
      if (prev) { e.t0 = prev.time; e.v0 = prev.type === 3 ? prev.from : prev.value; }
      else { e.t0 = 0; e.v0 = this.value; }
    }
    let i = ev.length;
    while (i > 0 && ev[i - 1].time > e.time) i--;
    ev.splice(i, 0, e);
    return this;
  }
  setValueAtTime(v, t) { return this._add({ type: 0, time: Math.max(0, t), value: v }); }
  linearRampToValueAtTime(v, t) { return this._add({ type: 1, time: Math.max(0, t), value: v }); }
  exponentialRampToValueAtTime(v, t) { return this._add({ type: 2, time: Math.max(0, t), value: v }); }
  setTargetAtTime(v, t, tc) { return this._add({ type: 3, time: Math.max(0, t), value: v, tc: Math.max(1e-4, tc) }); }
  cancelScheduledValues(t) { this.ev = this.ev.filter((e) => e.time < t); return this; }
  at(t) {
    const ev = this.ev;
    let idx = -1;
    for (let i = 0; i < ev.length; i++) { if (ev[i].time <= t) idx = i; else break; }
    const next = ev[idx + 1];
    if (next && (next.type === 1 || next.type === 2)) {
      const span = next.time - next.t0;
      const f = span <= 0 ? 1 : clamp((t - next.t0) / span, 0, 1);
      if (next.type === 1) return next.v0 + (next.value - next.v0) * f;
      if (next.v0 > 0 && next.value > 0) return next.v0 * Math.pow(next.value / next.v0, f);
      return next.v0 + (next.value - next.v0) * f;
    }
    if (idx >= 0) {
      const e = ev[idx];
      if (e.type === 3) return e.value + (e.from - e.value) * Math.exp(-(t - e.time) / e.tc);
      return e.value;
    }
    return this.value;
  }
  block(t0) {
    const ev = this.ev, sr = this.ctx.sampleRate;
    while (ev.length > 1 && ev[1].time <= t0) ev.shift();
    let mod = null;
    if (this.inputs.size) {
      for (const n of this.inputs) {
        const x = n.pull();
        if (!x) continue;
        if (!mod) { mod = new Float32Array(BLK); }
        for (let i = 0; i < BLK; i++) mod[i] += x[i];
      }
    }
    const tEnd = t0 + BLK / sr;
    const last = ev.length ? ev[ev.length - 1] : null;
    if (!mod && (!last || (last.type !== 3 && last.time <= t0 && ev.length === 1))) return last ? last.value : this.value;
    const o = this._buf;
    const moving = ev.length > 0 && !(ev.length === 1 && ev[0].type !== 3 && ev[0].time <= t0);
    if (!moving) {
      const v = last ? this.at(t0) : this.value;
      for (let i = 0; i < BLK; i++) o[i] = v + (mod ? mod[i] : 0);
    } else {
      for (let i = 0; i < BLK; i++) o[i] = this.at(t0 + i / sr) + (mod ? mod[i] : 0);
    }
    void tEnd;
    return o;
  }
}

/* ---------------------------------------------------------------- nodes */
class Node {
  constructor(ctx) { this.ctx = ctx; this.inputs = new Set(); this.outs = new Set(); this._blk = -1; this._out = null; this._o = null; this._m = null; }
  connect(d) { d.inputs.add(this); this.outs.add(d); return d; }
  disconnect() { for (const d of this.outs) d.inputs.delete(this); this.outs.clear(); }
  pull() {
    const b = this.ctx._blk;
    if (this._blk === b) return this._out;
    this._blk = b; this._out = null;
    this._out = this.process();
    return this._out;
  }
  out() { return this._o || (this._o = new Float32Array(BLK)); }
  mix() {
    let acc = null;
    for (const n of this.inputs) {
      const x = n.pull();
      if (!x) continue;
      if (!acc) { acc = this._m || (this._m = new Float32Array(BLK)); acc.set(x); }
      else for (let i = 0; i < BLK; i++) acc[i] += x[i];
    }
    return acc;
  }
}
class GainNode extends Node {
  constructor(c) { super(c); this.gain = new Param(c, 1); }
  process() {
    const t0 = this.ctx.currentTime;
    const g = this.gain.block(t0);
    const x = this.mix();
    if (!x) return null;
    const o = this.out();
    if (typeof g === 'number') for (let i = 0; i < BLK; i++) o[i] = x[i] * g;
    else for (let i = 0; i < BLK; i++) o[i] = x[i] * g[i];
    return o;
  }
}
class StereoPannerNode extends Node {
  constructor(c) { super(c); this.pan = new Param(c, 0); }
  process() { return this.mix(); }
}
class DestNode extends Node {
  process() { return this.mix(); }
}
function blep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}
class OscillatorNode extends Node {
  constructor(c) { super(c); this.type = 'sine'; this.frequency = new Param(c, 440); this.detune = new Param(c, 0); this._ph = 0; this._start = Infinity; this._stop = Infinity; this._ended = false; this.onended = null; }
  start(t) { this._start = t == null ? 0 : t; }
  stop(t) { this._stop = t == null ? 0 : t; }
  process() {
    const sr = this.ctx.sampleRate, t0 = this.ctx.currentTime;
    const o = this.out();
    if (this._ended) return null;
    const fr = this.frequency.block(t0), dt = this.detune.block(t0);
    const fa = typeof fr !== 'number', da = typeof dt !== 'number';
    const dm = da ? 1 : Math.pow(2, dt / 1200);
    let any = false;
    for (let i = 0; i < BLK; i++) {
      const t = t0 + i / sr;
      if (t < this._start) { o[i] = 0; continue; }
      if (t >= this._stop) { o[i] = 0; this._ended = true; continue; }
      any = true;
      const f = (fa ? fr[i] : fr) * (da ? Math.pow(2, dt[i] / 1200) : dm);
      const inc = Math.abs(f) / sr;
      let ph = this._ph;
      let v;
      switch (this.type) {
        case 'sawtooth': v = 2 * ph - 1 - blep(ph, inc); break;
        case 'square': v = (ph < 0.5 ? 1 : -1) + blep(ph, inc) - blep((ph + 0.5) % 1, inc); break;
        case 'triangle': v = 1 - 4 * Math.abs(ph - 0.5); break;
        default: v = Math.sin(6.283185307179586 * ph);
      }
      o[i] = v;
      ph += inc; if (ph >= 1) ph -= 1;
      this._ph = ph;
    }
    if (this._ended) this.ctx._post.push(() => { this.disconnect(); if (this.onended) this.onended(); });
    return any ? o : null;
  }
}
class BufferSourceNode extends Node {
  constructor(c) { super(c); this.buffer = null; this.loop = false; this.playbackRate = new Param(c, 1); this._pos = 0; this._start = Infinity; this._stop = Infinity; this._ended = false; this._off = 0; this.onended = null; }
  start(t, off) { this._start = t == null ? 0 : t; this._pos = (off || 0) * (this.buffer ? this.buffer.sampleRate : 0); }
  stop(t) { this._stop = t == null ? 0 : t; }
  process() {
    if (this._ended || !this.buffer) return null;
    const sr = this.ctx.sampleRate, t0 = this.ctx.currentTime;
    const data = this.buffer.data, n = data.length, o = this.out();
    const rate = this.playbackRate.block(t0);
    const r = typeof rate === 'number' ? rate : rate[0];
    let any = false;
    for (let i = 0; i < BLK; i++) {
      const t = t0 + i / sr;
      if (t < this._start) { o[i] = 0; continue; }
      if (t >= this._stop) { o[i] = 0; this._ended = true; continue; }
      let p = this._pos;
      if (p >= n) { if (this.loop) p %= n; else { o[i] = 0; this._ended = true; continue; } }
      const i0 = Math.floor(p), fr = p - i0, i1 = i0 + 1 < n ? i0 + 1 : (this.loop ? 0 : i0);
      o[i] = data[i0] * (1 - fr) + data[i1] * fr;
      this._pos = p + r * this.buffer.sampleRate / sr;
      any = true;
    }
    if (this._ended) this.ctx._post.push(() => { this.disconnect(); if (this.onended) this.onended(); });
    return any ? o : null;
  }
}
class BiquadNode extends Node {
  constructor(c) { super(c); this.type = 'lowpass'; this.frequency = new Param(c, 350); this.Q = new Param(c, 1); this.gain = new Param(c, 0); this.z1 = 0; this.z2 = 0; }
  process() {
    const x = this.mix();
    if (!x) return null;
    const sr = this.ctx.sampleRate, tm = this.ctx.currentTime + BLK / 2 / sr;
    const f = this.frequency.at(tm), q = this.Q.at(tm), gdb = this.gain.at(tm);
    const w = 2 * Math.PI * clamp(f / sr, 1e-5, 0.499), cs = Math.cos(w), sn = Math.sin(w);
    const A = Math.pow(10, gdb / 40);
    let b0, b1, b2, a0, a1, a2, al;
    switch (this.type) {
      case 'highpass': al = sn / (2 * Math.pow(10, q / 20)); b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'bandpass': al = sn / (2 * Math.max(q, 1e-3)); b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'notch': al = sn / (2 * Math.max(q, 1e-3)); b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'peaking': al = sn / (2 * Math.max(q, 1e-3)); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
      case 'lowshelf': { al = sn / 2 * Math.SQRT2; const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; break; }
      case 'highshelf': { al = sn / 2 * Math.SQRT2; const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; break; }
      default: al = sn / (2 * Math.pow(10, q / 20)); b1 = 1 - cs; b0 = b1 / 2; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    const o = this.out();
    let z1 = this.z1, z2 = this.z2;
    for (let i = 0; i < BLK; i++) {
      const xi = x[i];
      const y = b0 * xi + z1;
      z1 = b1 * xi - a1 * y + z2;
      z2 = b2 * xi - a2 * y;
      o[i] = y;
    }
    if (!(Math.abs(z1) < 1e9)) { z1 = 0; z2 = 0; }
    this.z1 = z1; this.z2 = z2;
    return o;
  }
}
class DelayNode extends Node {
  constructor(c, max) {
    super(c);
    this.delayTime = new Param(c, 0);
    this._N = Math.ceil((max || 1) * c.sampleRate) + BLK * 2 + 4;
    this._ring = new Float32Array(this._N);
    this._w = 0;
  }
  process() {
    const sr = this.ctx.sampleRate, t0 = this.ctx.currentTime;
    const dv = this.delayTime.block(t0);
    const d = Math.max(BLK, (typeof dv === 'number' ? dv : dv[0]) * sr);
    const o = this.out(), N = this._N, r = this._ring;
    for (let i = 0; i < BLK; i++) {
      let p = this._w + i - d;
      p = ((p % N) + N) % N;
      const i0 = Math.floor(p), fr = p - i0;
      o[i] = r[i0] * (1 - fr) + r[(i0 + 1) % N] * fr;
    }
    this.ctx._delays.push(this);
    return o;
  }
  finish() {
    const x = this.mix(), N = this._N;
    for (let i = 0; i < BLK; i++) this._ring[(this._w + i) % N] = x ? x[i] : 0;
    this._w = (this._w + BLK) % N;
  }
}
class WaveShaperNode extends Node {
  constructor(c) { super(c); this.curve = null; this.oversample = 'none'; }
  process() {
    const x = this.mix();
    if (!x) return null;
    const o = this.out(), cv = this.curve;
    if (!cv) { o.set(x); return o; }
    const n = cv.length - 1;
    for (let i = 0; i < BLK; i++) {
      const p = (clamp(x[i], -1, 1) + 1) * 0.5 * n, i0 = Math.min(n - 1, Math.floor(p)), f = p - i0;
      o[i] = cv[i0] * (1 - f) + cv[i0 + 1] * f;
    }
    return o;
  }
}
class CompressorNode extends Node {
  constructor(c) {
    super(c);
    this.threshold = new Param(c, -24); this.knee = new Param(c, 30); this.ratio = new Param(c, 12);
    this.attack = new Param(c, 0.003); this.release = new Param(c, 0.25); this.reduction = 0; this._gr = 0;
  }
  process() {
    const x = this.mix();
    if (!x) return null;
    const sr = this.ctx.sampleRate;
    const th = this.threshold.value, kn = this.knee.value, ra = this.ratio.value;
    const ca = Math.exp(-1 / (Math.max(1e-4, this.attack.value) * sr)), cr = Math.exp(-1 / (Math.max(1e-3, this.release.value) * sr));
    const o = this.out();
    let gr = this._gr;
    for (let i = 0; i < BLK; i++) {
      const a = Math.abs(x[i]);
      const db = 20 * Math.log10(a + 1e-9);
      const over = db - th;
      let target = 0;
      if (2 * over < -kn) target = 0;
      else if (2 * Math.abs(over) <= kn) target = (1 / ra - 1) * (over + kn / 2) * (over + kn / 2) / (2 * kn);
      else target = (1 / ra - 1) * over;
      gr = target < gr ? ca * gr + (1 - ca) * target : cr * gr + (1 - cr) * target;
      o[i] = x[i] * Math.pow(10, gr / 20);
    }
    this._gr = gr; this.reduction = gr;
    return o;
  }
}

/* ---------------------------------------------------------------- context */
export class OfflineContext {
  constructor(sampleRate = 32000) {
    this.sampleRate = sampleRate; this._blk = 0; this.state = 'running'; this.baseLatency = 0; this.outputLatency = 0;
    this.destination = new DestNode(this); this._delays = []; this._post = []; this._chunks = []; this.created = 0;
  }
  get currentTime() { return this._blk * BLK / this.sampleRate; }
  _n(N, ...a) { this.created++; return new N(this, ...a); }
  createGain() { return this._n(GainNode); }
  createOscillator() { return this._n(OscillatorNode); }
  createBufferSource() { return this._n(BufferSourceNode); }
  createBiquadFilter() { return this._n(BiquadNode); }
  createDelay(max) { return this._n(DelayNode, max); }
  createWaveShaper() { return this._n(WaveShaperNode); }
  createDynamicsCompressor() { return this._n(CompressorNode); }
  createStereoPanner() { return this._n(StereoPannerNode); }
  createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr, data: new Float32Array(len), getChannelData() { return this.data; } }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  _renderBlock() {
    this._delays.length = 0;
    const out = this.destination.pull();
    for (let i = 0; i < this._delays.length; i++) this._delays[i].finish();
    const chunk = new Float32Array(BLK);
    if (out) chunk.set(out);
    this._chunks.push(chunk);
    const post = this._post; this._post = [];
    this._blk++;
    for (const f of post) f();
  }
  advanceTo(t) { while (this.currentTime < t) this._renderBlock(); }
  getOutput() {
    const n = this._chunks.length * BLK, o = new Float32Array(n);
    this._chunks.forEach((c, i) => o.set(c, i * BLK));
    return o;
  }
}

/* A recording-only fake context: every node is a no-op, nothing renders; counts node creation. */
export class FakeContext {
  constructor(opts = {}) {
    this.sampleRate = 44100; this.currentTime = 0; this.state = opts.state || 'running'; this.created = 0; this.sources = 0;
    this.destination = this._node('dest'); this.baseLatency = 0;
    this.resumed = 0; this.stuck = !!opts.stuck;
  }
  _param(v = 0) {
    const p = { value: v, calls: [] };
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) p[m] = (...a) => { p.calls.push([m, ...a]); return p; };
    return p;
  }
  _node(kind) {
    this.created++;
    const ctx = this;
    const n = { kind, connect(d) { return d; }, disconnect() {}, type: 'sine' };
    for (const k of ['gain', 'frequency', 'detune', 'Q', 'delayTime', 'playbackRate', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = this._param(k === 'gain' ? 1 : 0);
    n.start = (t) => { ctx.sources++; n.startedAt = t; };
    n.stop = () => {};
    return n;
  }
  createGain() { return this._node('gain'); }
  createOscillator() { return this._node('osc'); }
  createBufferSource() { return this._node('buf'); }
  createBiquadFilter() { return this._node('biquad'); }
  createDelay() { return this._node('delay'); }
  createWaveShaper() { return this._node('shaper'); }
  createDynamicsCompressor() { return this._node('comp'); }
  createStereoPanner() { return this._node('pan'); }
  createBuffer(ch, len, sr) { return { length: len, sampleRate: sr, data: new Float32Array(len), getChannelData() { return this.data; } }; }
  resume() { this.resumed++; if (!this.stuck) this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

/* ---------------------------------------------------------------- analysis */
export function peak(x) { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; }
export function rms(x, a = 0, b = x.length) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
export function dc(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return s / Math.max(1, x.length); }
export function hasNaN(x) { for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return true; return false; }
export function maxStep(x, a = 1, b = x.length) { let m = 0; for (let i = Math.max(1, a); i < Math.min(b, x.length); i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > m) m = d; } return m; }
/** Max step of the signal after a short moving average (w samples): ignores white-noise roughness, catches real clicks/DC jumps. */
export function smoothStep(x, w = 16, a = 0, b = x.length) {
  let m = 0, acc = 0, prev = 0;
  for (let i = Math.max(0, a - w); i < Math.min(b, x.length); i++) {
    acc += x[i]; if (i >= w) acc -= x[i - w];
    const v = acc / w;
    if (i >= a + w) { const d = Math.abs(v - prev); if (d > m) m = d; }
    prev = v;
  }
  return m;
}
export function lastActive(x, thr = 0.003) { for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) > thr) return i; return -1; }
export function firstActive(x, thr = 0.003) { for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > thr) return i; return -1; }
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** Spectral centroid (Hz) and band energy fractions of the first `n` samples (zero padded). */
export function spectrum(x, sr, n = 8192) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (Math.min(n, x.length) - 1 || 1)));
  fft(re, im);
  let num = 0, den = 0;
  const bands = { low: 0, mid: 0, high: 0 };
  for (let k = 1; k < n / 2; k++) {
    const f = k * sr / n, m = re[k] * re[k] + im[k] * im[k];
    num += f * m; den += m;
    if (f < 250) bands.low += m; else if (f < 2500) bands.mid += m; else bands.high += m;
  }
  const tot = den || 1;
  return { centroid: num / tot, low: bands.low / tot, mid: bands.mid / tot, high: bands.high / tot };
}
export function writeWav(file, x, sr) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(clamp(x[i], -1, 1) * 32767), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

/* ---------------------------------------------------------------- rig */
export function loadAudioModule() {
  if (!globalThis.BBH || !globalThis.BBH.AudioFactory) require(path.join(here, '..', '..', 'beatbox_heroes', 'audio.js'));
  return globalThis.BBH.AudioFactory;
}
/** { ctx, A, run(seconds) }: audio.js on an OfflineContext, scheduler pumped manually every 25 ms. */
export function makeRig(sr = 32000, copts = {}) {
  const Factory = loadAudioModule();
  const ctx = new OfflineContext(sr);
  const A = Factory.create(() => ctx, Object.assign({ manual: true }, copts));
  A.unlock();
  const rig = {
    ctx, A,
    run(seconds) { const end = ctx.currentTime + seconds; while (ctx.currentTime < end - 1e-9) { A._tick(); ctx.advanceTo(Math.min(end, ctx.currentTime + 0.025)); } },
    out() { return ctx.getOutput(); },
  };
  return rig;
}
export function renderSfx(name, opts, sr = 32000, secs = 3) { const r = makeRig(sr); r.A.sfx(name, opts); r.run(secs); return r.out(); }
export function renderDrum(lane, opts, sr = 32000, secs = 0.8) { const r = makeRig(sr); r.A.drum(lane, opts); r.run(secs); return r.out(); }
export function renderMusic(id, secs, sr = 16000) { const r = makeRig(sr); r.A.music.play(id); r.run(secs); return { out: r.out(), rig: r }; }

/* ---------------------------------------------------------------- CLI */
function stats(x, sr) {
  return `peak ${peak(x).toFixed(3)} rms ${rms(x).toFixed(3)} dc ${dc(x).toExponential(1)} len ${(x.length / sr).toFixed(2)}s`;
}
async function main() {
  const [, , cmd, a1, a2, a3, a4, a5] = process.argv;
  const SR = 32000;
  if (cmd === 'music') {
    const Factory = loadAudioModule();
    const C = Factory.compose(a1);
    const secs = Number(a2) || (C.beats * 60 / C.bpm + 2);
    const { out } = renderMusic(a1, secs, SR);
    console.log(a1, stats(out, SR));
    if (a3) writeWav(a3, out, SR);
  } else if (cmd === 'sfx') {
    const out = renderSfx(a1, {}, SR, 3);
    console.log(a1, stats(out, SR));
    if (a2) writeWav(a2, out, SR);
  } else if (cmd === 'drum') {
    const out = renderDrum(Number(a1), {}, SR);
    console.log('drum', a1, stats(out, SR));
    if (a2) writeWav(a2, out, SR);
  } else if (cmd === 'groove') {
    const r = makeRig(SR);
    const g = r.A.groove.start({ bpm: Number(a1) || 100, style: Number(a2) || 0, bars: Number(a3) || 4 });
    r.A.groove.setIntensity(1);
    r.run(Number(a4) || 12);
    const out = r.out();
    console.log('groove', JSON.stringify(g), stats(out, SR));
    if (a5) writeWav(a5, out, SR);
  } else if (cmd === 'all') {
    const dir = a1 || 'audio_out';
    fs.mkdirSync(dir, { recursive: true });
    const Factory = loadAudioModule();
    for (const id of Factory.MUSIC_IDS) {
      const C = Factory.compose(id);
      const { out } = renderMusic(id, C.beats * 60 / C.bpm + 2, SR);
      console.log('music', id.padEnd(8), String(C.bpm).padStart(3), (C.beats * 60 / C.bpm).toFixed(1).padStart(6) + 's', stats(out, SR));
      writeWav(path.join(dir, 'music_' + id + '.wav'), out, SR);
    }
    for (const n of Factory.SFX_NAMES) { const out = renderSfx(n, {}, SR, 3); console.log('sfx  ', n.padEnd(15), stats(out, SR)); writeWav(path.join(dir, 'sfx_' + n + '.wav'), out, SR); }
    for (let l = 0; l < 4; l++) { const out = renderDrum(l, {}, SR); console.log('drum ', l, stats(out, SR)); writeWav(path.join(dir, 'drum_' + l + '.wav'), out, SR); }
  } else {
    console.log('usage: audio_render.mjs music <id> [secs] [out.wav] | sfx <name> [out.wav] | drum <lane> [out.wav] | groove <bpm> <style> <bars> [secs] [out.wav] | all [dir]');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
