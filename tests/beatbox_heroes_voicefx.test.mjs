// BBH.VoiceFX (voicefx.js): the per-sound studio chain for recorded takes, on synthetic takes with a room noise floor.
//   profiles   every Core.SOUNDS id has a profile (lane fallback, generic), EQ curves: bass sounds boosted and never high passed
//              above ~30 Hz, hats low-cut, snares not (they keep their low end); the targets still match the synth kit (re-measured with audio_render)
//   kick       gate removes the room before and after, onset within 2 ms, clean edges, low end up by the shelf, true peak and
//              level, DC gone, deterministic, fast
//   hat        low end (a breath thump) removed, short; snare; hum (long release, no pumping, low end kept); lip roll bass detection
//   dry        the RAW A/B version: same cut, same level, same ceiling
//   mic + samples  recordSample({ sound }) runs the chain and keeps the raw take; Samples keeps raw / fx and flips CLEAN / RAW
// Set BBH_VFX_PNG=<dir> to write before / after waveform and spectrum PNGs of the synthetic takes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ok, eq, near, between, done, load } from './beatbox_heroes_lib.mjs';
import * as R from '../tools/beatbox_heroes/audio_render.mjs';

const BBH = load('pix', 'catalog', 'core', 'audio', 'mic', 'voicefx', 'samples');
const V = BBH.VoiceFX, M = BBH.Mic, S = BBH.Samples, Core = BBH.Core;
const PNG_DIR = process.env.BBH_VFX_PNG || '';

/* ---------------------------------------------------------------- seeded synthetic takes */
function rngf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const dB = (v) => 20 * Math.log10(v + 1e-12);
const rms = (x, a = 0, b = x.length) => R.rms(x, Math.max(0, a), Math.min(x.length, b));
/** a take: room noise at nfDb dBFS RMS + a DC offset, the sound placed at `atMs` */
function take(sig, sr, atMs, nfDb, totalMs, seed, dc = 0.02) {
  const r = rngf(seed), n = Math.round(totalMs * 0.001 * sr), x = new Float32Array(n), a = Math.pow(10, nfDb / 20), at = Math.round(atMs * 0.001 * sr);
  for (let i = 0; i < n; i++) x[i] = gauss(r) * a + dc;
  for (let i = 0; i < sig.length && at + i < n; i++) x[at + i] += sig[i];
  return x;
}
/** kick: 60 Hz decaying sine with a short pitch drop + a 1 ms click */
function kick(sr, seed = 1) {
  const r = rngf(seed), n = Math.round(0.5 * sr), x = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * 60 * (1 + 1.0 * Math.exp(-t / 0.012)) / sr; x[i] = 0.5 * Math.sin(ph) * Math.exp(-t / 0.06); if (t < 0.001) x[i] += 0.25 * gauss(r) * (1 - t / 0.001); }
  return x;
}
/** hat: high passed noise burst + a 50 Hz breath thump under it */
function hat(sr, seed = 2) {
  const r = rngf(seed), n = Math.round(0.1 * sr), x = new Float32Array(n); let x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) { const t = i / sr, v = gauss(r), hp = 0.55 * (y1 + v - x1); x1 = v; y1 = hp; x[i] = 0.3 * hp * Math.exp(-t / 0.02) + 0.08 * Math.sin(2 * Math.PI * 50 * t) * Math.exp(-t / 0.04); }
  return x;
}
/** snare: band noise + a 200 Hz body */
function snare(sr, seed = 3) {
  const r = rngf(seed), n = Math.round(0.18 * sr), x = new Float32Array(n); let x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) { const t = i / sr, v = gauss(r), hp = 0.8 * (y1 + v - x1); x1 = v; y1 = hp; x[i] = 0.25 * hp * Math.exp(-t / 0.05) + 0.3 * Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t / 0.04); }
  return x;
}
/** hum: 110 Hz with two harmonics, 20 ms fades */
function hum(sr, ms = 700) {
  const n = Math.round(ms * 0.001 * sr), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr, e = Math.min(1, t / 0.02, (n - i) / sr / 0.02); x[i] = e * (0.3 * Math.sin(2 * Math.PI * 110 * t) + 0.12 * Math.sin(2 * Math.PI * 220 * t + 1) + 0.05 * Math.sin(2 * Math.PI * 330 * t + 2)); }
  return x;
}
/** lip roll: a buzz (pulse train at f0 through a soft low pass) with a 25 Hz flutter */
function lipRoll(sr, f0) {
  const n = Math.round(0.5 * sr), x = new Float32Array(n); let y = 0, ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += f0 / sr; const p = ph % 1 < 0.15 ? 1 : -0.18; y += 0.25 * (p - y); x[i] = 0.4 * y * (0.6 + 0.4 * Math.sin(2 * Math.PI * 25 * t)) * Math.min(1, t / 0.01, (n - i) / sr / 0.03); }
  return x;
}
/** energy per band from one zero-padded FFT of the whole signal: E(lo..hi Hz) */
function bands(x, sr) {
  let n = 1; while (n < x.length) n <<= 1; n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < x.length; i++) re[i] = x[i];
  R.fft(re, im);
  return (lo, hi) => { let e = 0; for (let k = 1; k < n / 2; k++) { const f = k * sr / n; if (f >= lo && f < hi) e += re[k] * re[k] + im[k] * im[k]; } return e; };
}
const ratioDb = (x, sr, a, b) => { const B = bands(x, sr); return 10 * Math.log10(B(a[0], a[1]) / B(b[0], b[1])); };
const firstAbove = (x, frac) => { let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= frac * pk) return i; return -1; };

/* ---------------------------------------------------------------- PNG output (BBH_VFX_PNG) */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(file, w, h, px) {
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
/** before (top: the raw take from 50 ms before the cut) / after (bottom: CLEAN) waveforms on one time axis, and the two spectra (right) */
function plot(name, raw, res, sr) {
  if (!PNG_DIR || !res.data.length) return;
  fs.mkdirSync(PNG_DIR, { recursive: true });
  const W = 900, H = 360, WW = 560, px = Buffer.alloc(W * H * 3);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; };
  for (let i = 0; i < W * H; i++) { px[i * 3] = 20; px[i * 3 + 1] = 14; px[i * 3 + 2] = 38; }
  const pre = Math.round(0.05 * sr), a = Math.max(0, res.start - pre), len = res.end - a;
  const wave = (arr, off, y0, hh, col) => { for (let x = 0; x < WW; x++) { const s = Math.floor(x * len / WW), e = Math.max(s + 1, Math.floor((x + 1) * len / WW)); let mn = 0, mx = 0; for (let i = s; i < e; i++) { const j = i - off; const v = j >= 0 && j < arr.length ? arr[j] : 0; if (v < mn) mn = v; if (v > mx) mx = v; } for (let y = Math.round(y0 - mx * hh); y <= Math.round(y0 - mn * hh); y++) put(x + 10, y, col); put(x + 10, y0, [60, 50, 90]); } };
  let pk = 0; for (let i = a; i < res.end; i++) pk = Math.max(pk, Math.abs(raw[i]));
  const rawN = Float32Array.from(raw.subarray(a, res.end), (v) => v / (pk || 1) * 0.9);
  wave(rawN, 0, 90, 80, [150, 140, 180]); wave(res.data, res.start - a, 270, 80, [120, 255, 140]);
  for (let y = 0; y < H; y++) put(10 + Math.round(pre * WW / len), y, [255, 210, 80]);
  const spec = (arr, col) => { let n = 1; while (n < arr.length) n <<= 1; const re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < arr.length; i++) re[i] = arr[i]; R.fft(re, im); let mx = 1e-20; const pts = []; for (let x = 0; x < 300; x++) { const f = 20 * Math.pow(1000, x / 300), k = Math.round(f * n / sr); let e = 0; for (let q = Math.max(1, k - 2); q <= k + 2 && q < n / 2; q++) e += re[q] * re[q] + im[q] * im[q]; pts.push(e); if (e > mx) mx = e; } pts.forEach((e, x) => { const d = 10 * Math.log10(e / mx + 1e-12), y = Math.round(20 + (-d / 70) * 320); put(590 + x, Math.min(H - 1, y), col); put(590 + x, Math.min(H - 1, y + 1), col); }); };
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = 590 + Math.round(300 * Math.log10(f / 20) / 3); for (let y = 10; y < H - 10; y++) if (y % 4 === 0) put(x, y, [60, 50, 90]); }
  spec(raw.subarray(res.start, res.end), [150, 140, 180]); spec(res.data, [120, 255, 140]);
  png(path.join(PNG_DIR, 'voicefx_' + name + '.png'), W, H, px);
}

/* ---------------------------------------------------------------- profiles and EQ curves */
{
  ok(V && typeof V.process === 'function' && typeof V.profile === 'function', 'BBH.VoiceFX loads in node');
  for (const s of Core.SOUNDS) { const p = V.profile(s.id); ok(p.fam !== 'generic' && p.id === s.id && V.SOUND[s.id], 'Core.SOUNDS ' + s.id + ' has its own profile (' + p.fam + ')'); }
  eq([0, 1, 2, 3].map((l) => V.profile(l).id), ['B', 't', 'K', 'Pf'], 'lanes 0..3 map to B t K Pf');
  eq(V.profile('kick').id, 'B', 'aliases (kick -> B)');
  eq(V.profile('XYZ').fam, 'generic', 'an unknown id gets the generic profile');
  Core.SOUNDS.push({ id: 'QQ', name: 'Test', lane: 1, unlock: { k: 'start' } });
  eq(V.profile('QQ').id, 't', 'a future Core sound without a profile falls back to its lane'); Core.SOUNDS.pop();
  const sr = 48000;
  for (const id of ['B', 'TB', 'HUM', 'LR']) {
    const P = V.profile(id), hp = P.eq.filter((b) => b[0] === 'hp');
    ok(hp.length === 1 && hp[0][1] <= 25, id + ': only a rumble filter at ' + (hp[0] && hp[0][1]) + ' Hz, no low cut');
    const r = (f) => V.response(P.eq, f, sr);
    ok(r(60) >= 2 && r(60) <= 4.5 && r(80) >= 2 && r(100) >= 1.5, id + ': low boost +' + r(60).toFixed(1) + ' dB at 60 Hz, +' + r(80).toFixed(1) + ' at 80, +' + r(100).toFixed(1) + ' at 100');
    ok(r(35) > 0.5 && r(30) > 0 && r(20) > -3.5, id + ': never high passed above ~30 Hz (30 Hz ' + r(30).toFixed(1) + ' dB, 20 Hz ' + r(20).toFixed(1) + ' dB)');
    ok(r(400) < -0.5, id + ': a little boxiness out around 400 Hz (' + r(400).toFixed(1) + ' dB)');
  }
  ok(V.response(V.profile('B').eq, 3000, sr) >= 2, 'B: kick click lifted at 3 kHz');
  for (const id of ['t', 'CR']) { const r = (f) => V.response(V.profile(id).eq, f, sr); ok(r(100) < -18 && r(50) < -40 && r(8000) > 0.5, id + ': hat low cut (' + r(100).toFixed(0) + ' dB at 100 Hz, ' + r(50).toFixed(0) + ' at 50) and air (+' + r(8000).toFixed(1) + ' at 8 kHz)'); }
  for (const id of ['K', 'IK', 'Pf']) { const r = (f) => V.response(V.profile(id).eq, f, sr); ok(Math.abs(r(40)) < 3 && Math.abs(r(100)) < 3 && r(4000) >= 1.5, id + ': snare keeps its low end (' + r(40).toFixed(1) + ' dB at 40 Hz, ' + r(100).toFixed(1) + ' at 100) and has snap (+' + r(4000).toFixed(1) + ' at 4 kHz)'); }
  { const r = (f) => V.response(V.profile('RIM').eq, f, sr); ok(r(40) < -8 && r(4000) >= 1.5, 'RIM: the rim shot keeps its high pass (' + r(40).toFixed(0) + ' dB at 40 Hz) and snap (+' + r(4000).toFixed(1) + ' at 4 kHz)'); }
  for (const id in V.SOUND) { const p = V.profile(id); ok(p.target <= -4 && p.target >= -24 && p.lim.max <= 6 && p.maxMs >= 300 && p.maxMs <= 4000, id + ': sane target / limiter / length'); }
}

/* ---------------------------------------------------------------- targets still match the synth kit */
{
  const sr = 32000, st = (x) => R.rms ? V.punch(x, sr) : 0;
  const ref = new Float32Array(Math.round(0.2 * sr)); for (let i = 0; i < ref.length; i++) ref[i] = 0.5 * Math.sin(2 * Math.PI * 300 * i / sr);
  const drift = [];
  for (const id in V.SOUND) {
    let s = 0; const N = 3; for (let k = 0; k < N; k++) s += st(R.renderDrum(id, { vel: 1 }, sr, 1.2)); s /= N;
    const rig = R.makeRig(sr); rig.A.setSample(id, ref, sr); rig.A.drum(id, { vel: 1 }); rig.run(0.4);
    const path = st(rig.out()) - st(ref), want = s - path;
    drift.push(id + ' ' + want.toFixed(1));
    ok(Math.abs(want - V.SOUND[id].target) <= 2.5, id + ': target ' + V.SOUND[id].target + ' dB still matches the synth voice through the sample path (' + want.toFixed(1) + ' dB)');
  }
  console.log('  synth-matched targets: ' + drift.join(', '));
}

/* ---------------------------------------------------------------- kick */
{
  const sr = 48000, k = kick(sr), raw = take(k, sr, 300, -60, 1000, 11), res = V.process(raw, sr, 'B'), y = res.data, I = res.info, P = V.profile('B');
  plot('kick', raw, res, sr);
  ok(I.ok && I.family === 'kick' && y.length > 0, 'kick: processed (' + JSON.stringify(I) + ')');
  near(I.noiseDb, -60, 2, 'kick: noise floor measured from the room');
  near(I.onsetMs, 300, 1, 'kick: onset found (ms in the take)');
  const atk = Math.round(P.gate.atk * 0.001 * sr), first = firstAbove(y, 0.1);
  between((first - atk) / sr * 1000, -2, 2, 'kick: the hit sits right after the ' + P.gate.atk + ' ms lookahead attack in the sample, onset preserved (ms)');
  ok(res.start >= Math.round(0.297 * sr), 'kick: the 300 ms of room before the hit is gone (' + (res.start / sr * 1000).toFixed(1) + ' ms cut)');
  ok(dB(rms(y, 0, atk)) < -55, 'kick: residual before the hit (inside the attack ramp) ' + dB(rms(y, 0, atk)).toFixed(1) + ' dBFS');
  ok(dB(rms(y, y.length - Math.round(0.02 * sr))) < -40, 'kick: the hit is cropped where it has died away and fades out (last 20 ms) ' + dB(rms(y, y.length - Math.round(0.02 * sr))).toFixed(1) + ' dBFS');
  ok(y[0] === 0 && y[y.length - 1] === 0, 'kick: first and last samples are exactly 0');
  ok(R.maxStep(y, 1, Math.round(0.0005 * sr)) < 0.05 && R.maxStep(y, y.length - Math.round(0.005 * sr)) < 0.01, 'kick: no discontinuity at either edge (start ' + R.maxStep(y, 1, Math.round(0.0005 * sr)).toFixed(4) + ', end ' + R.maxStep(y, y.length - Math.round(0.005 * sr)).toFixed(4) + ')');
  ok(I.lengthMs >= 250, 'kick: the gate keys on the transient but lets the 60 Hz tail ring (' + I.lengthMs + ' ms)');
  const before = ratioDb(k, sr, [20, 100], [100, 1000]), after = ratioDb(y, sr, [20, 100], [100, 1000]);
  ok(after - before >= 0.5, 'kick: low end (< 100 Hz vs 100 Hz..1 kHz) up ' + (after - before).toFixed(1) + ' dB through the whole chain, not cut');
  const noExc = V.process(raw, sr, 'B', { profile: Object.assign({}, P, { exciter: null }) }).data, afterNE = ratioDb(noExc, sr, [20, 100], [100, 1000]);
  ok(afterNE - before >= 1.5, 'kick: without the exciter (it adds upper-bass harmonics on purpose) the shelf survives the dynamics: +' + (afterNE - before).toFixed(1) + ' dB');
  const sub = ratioDb(y, sr, [25, 45], [45, 100]) - ratioDb(k, sr, [25, 45], [45, 100]);
  ok(sub > -1.5, 'kick: nothing high passed above ~30 Hz (25..45 Hz vs 45..100 Hz moved ' + sub.toFixed(1) + ' dB)');
  ok(V.truePeak(y) <= -0.95, 'kick: true peak ' + V.truePeak(y).toFixed(2) + ' dBTP <= -1');
  between(V.punch(y, sr), P.target - 2, P.target + 0.5, 'kick: short-term level near its target ' + P.target);
  ok(Math.abs(R.dc(y)) < 2e-3, 'kick: the 0.02 DC offset is gone (' + R.dc(y).toExponential(1) + ')');
  const again = V.process(raw, sr, 'B').data; let same = again.length === y.length; for (let i = 0; same && i < y.length; i++) if (again[i] !== y[i]) same = false;
  ok(same, 'kick: deterministic, bit identical on a second run');
  let best = 1e9; for (let r = 0; r < 3; r++) { const t0 = performance.now(); V.process(raw, sr, 'B'); best = Math.min(best, performance.now() - t0); }
  ok(best < 150, 'kick: a 1 s take at 48 kHz processes in ' + best.toFixed(1) + ' ms');
  /* the dry A/B version */
  const d = res.dry;
  ok(d.length === y.length && d[0] === 0 && d[d.length - 1] === 0, 'dry: same cut and clean edges as CLEAN');
  ok(Math.abs(V.punch(d, sr) - V.punch(y, sr)) <= 0.6 || V.truePeak(d) >= -1.1, 'dry: level-matched to CLEAN (' + V.punch(d, sr).toFixed(1) + ' vs ' + V.punch(y, sr).toFixed(1) + ') or at the ceiling');
  ok(V.truePeak(d) <= -0.95, 'dry: under the same ceiling');
  ok(Math.abs(dB(rms(d, d.length - Math.round(0.02 * sr))) - dB(rms(y, y.length - Math.round(0.02 * sr)))) < 6, 'dry: cut at the same point as CLEAN, so the room is outside both and the tails sit at the same level');
  /* 44.1 kHz works the same */
  const r44 = V.process(take(kick(44100), 44100, 200, -60, 800, 12), 44100, 'B');
  ok(r44.info.ok && Math.abs(r44.info.onsetMs - 200) < 1 && V.truePeak(r44.data) <= -0.95, 'kick at 44.1 kHz: same result');
}

/* ---------------------------------------------------------------- hat */
{
  const sr = 48000, s = hat(sr), raw = take(s, sr, 250, -60, 700, 21), res = V.process(raw, sr, 't'), y = res.data, I = res.info;
  plot('hat', raw, res, sr);
  ok(I.ok && I.family === 'hat', 'hat: processed (' + JSON.stringify(I) + ')');
  near(I.onsetMs, 250, 1, 'hat: onset (ms)');
  const lowIn = ratioDb(s, sr, [20, 100], [20, 20000]), lowOut = ratioDb(y, sr, [20, 100], [20, 20000]);
  ok(lowOut - lowIn < -20, 'hat: the breath thump under 100 Hz is gone (' + (lowOut - lowIn).toFixed(1) + ' dB relative)');
  ok(I.lengthMs < 200, 'hat: stays short (' + I.lengthMs + ' ms)');
  ok(dB(rms(y, y.length - Math.round(0.01 * sr))) < -40 && y[0] === 0 && y[y.length - 1] === 0, 'hat: clean tail and edges');
  ok(V.truePeak(y) <= -0.95 && V.punch(y, sr) >= V.profile('t').target - 3, 'hat: peak <= -1 dBTP, level ' + V.punch(y, sr).toFixed(1) + ' (target ' + V.profile('t').target + ')');
}

/* ---------------------------------------------------------------- snare */
{
  const sr = 44100, s = snare(sr), raw = take(s, sr, 200, -58, 700, 31), res = V.process(raw, sr, 'K'), y = res.data, I = res.info;
  plot('snare', raw, res, sr);
  ok(I.ok && I.family === 'snare' && Math.abs(I.onsetMs - 200) < 1, 'snare: processed, onset (' + JSON.stringify(I) + ')');
  ok(ratioDb(y, sr, [20, 150], [150, 20000]) - ratioDb(s, sr, [20, 150], [150, 20000]) > -4, 'snare: no low cut, the body under 150 Hz is kept (' + (ratioDb(y, sr, [20, 150], [150, 20000]) - ratioDb(s, sr, [20, 150], [150, 20000])).toFixed(1) + ' dB against the dry snare)');
  for (const id of ['K', 'Pf', 'IK']) ok(!V.profile(id).eq.some((b) => b[0] === 'hp'), id + ': no high pass in the EQ');
  ok(V.profile('RIM').eq.some((b) => b[0] === 'hp'), 'the rim shot keeps its own low cut (a stick knock has no low end)');
  ok(ratioDb(y, sr, [3000, 6000], [100, 1000]) > ratioDb(s, sr, [3000, 6000], [100, 1000]), 'snare: more snap (3..6 kHz) against the body');
  ok(V.truePeak(y) <= -0.95 && V.punch(y, sr) >= V.profile('K').target - 4, 'snare: peak <= -1 dBTP, level ' + V.punch(y, sr).toFixed(1));
}

/* ---------------------------------------------------------------- hum: long release, no pumping, low end kept */
{
  const sr = 48000, s = hum(sr, 700), raw = take(s, sr, 300, -60, 1500, 41), res = V.process(raw, sr, 'HUM'), y = res.data, I = res.info;
  plot('hum', raw, res, sr);
  ok(I.ok && I.family === 'bass', 'hum: processed (' + JSON.stringify(I) + ')');
  ok(I.lengthMs >= 700 && I.lengthMs <= 700 + 250 + 120, 'hum: whole note kept plus its release (' + I.lengthMs + ' ms)');
  const W = Math.round(0.05 * sr), lv = []; for (let a = Math.round(0.1 * sr); a + W < Math.round(0.6 * sr); a += W) lv.push(dB(rms(y, a, a + W)));
  ok(Math.max(...lv) - Math.min(...lv) < 1.5, 'hum: steady through the comp, no pumping (' + (Math.max(...lv) - Math.min(...lv)).toFixed(2) + ' dB spread)');
  ok(ratioDb(y, sr, [60, 160], [160, 20000]) >= ratioDb(s, sr, [60, 160], [160, 20000]) - 1.5, 'hum: the 110 Hz fundamental keeps its weight');
  between(V.punch(y, sr), V.profile('HUM').target - 1, V.profile('HUM').target + 0.5, 'hum: level on target');
  ok(dB(rms(y, y.length - Math.round(0.02 * sr))) < -60, 'hum: release fades to silence');
}

/* ---------------------------------------------------------------- lip roll: bass treatment only when it is a bass lip roll */
{
  const sr = 48000;
  const lo = V.process(take(lipRoll(sr, 70), sr, 200, -60, 1000, 51), sr, 'LR'), hi = V.process(take(lipRoll(sr, 420), sr, 200, -60, 1000, 52), sr, 'LR');
  ok(lo.info.ok && lo.info.bass === true, 'LR: a 70 Hz lip roll gets the low boost (low share ' + lo.info.lowShare + ')');
  ok(hi.info.ok && hi.info.bass === false, 'LR: a 420 Hz lip roll gets the mid profile (low share ' + hi.info.lowShare + ')');
  ok(lo.info.segments >= 1 && lo.info.lengthMs >= 480, 'LR: the flutter does not chop the roll (' + lo.info.lengthMs + ' ms, ' + lo.info.segments + ' segment)');
}

/* ---------------------------------------------------------------- smart cut: the silence goes, the whole sound stays */
{
  const sr = 48000, n = Math.round(2.2 * sr), roll = new Float32Array(n), base = lipRoll(sr, 70);
  /* a 2.2 s lip roll that falters for 150 ms in the middle (drops 40 dB), then carries on */
  for (let i = 0; i < n; i++) { const t = i / sr, dip = t > 1.0 && t < 1.15 ? 0.01 : 1; roll[i] = base[i % base.length] * dip * Math.min(1, t / 0.01, (n - i) / sr / 0.03); }
  const r = V.process(take(roll, sr, 400, -62, 3400, 91), sr, 'LR'), I = r.info;
  ok(I.ok && !I.capped, 'long LR: processed, not capped (' + JSON.stringify(I) + ')');
  near(I.onsetMs, 400, 2, 'long LR: the 400 ms of silence before it is cut, right at the onset');
  ok(I.lengthMs >= 2200 && I.lengthMs <= 2200 + 300 + 120, 'long LR: the whole 2.2 s roll is kept across the dip, plus its release (' + I.lengthMs + ' ms, ' + I.kept + ' parts)');
  ok(r.end <= Math.round((0.4 + 2.2 + 0.45) * sr), 'long LR: the silence after it is cut (' + ((3400 - r.end / sr * 1000) | 0) + ' ms of room removed)');
  const sn = V.process(take(snare(sr), sr, 300, -62, 1500, 92), sr, 'K');
  ok(sn.info.ok && sn.info.lengthMs >= 150 && sn.info.lengthMs <= 180 + 80 + 60, 'snare: stays short, only its own ring is kept (' + sn.info.lengthMs + ' ms of a 1.5 s take)');
  /* a snare with a soft breath 900 ms later: the breath is not part of the sound */
  const two = take(snare(sr), sr, 300, -62, 1800, 93); const br = rngf(94); for (let i = 0; i < Math.round(0.2 * sr); i++) two[Math.round(1.2 * sr) + i] += 0.004 * gauss(br);
  const t2 = V.process(two, sr, 'K'); ok(t2.info.ok && t2.info.lengthMs < 400, 'snare + a breath 900 ms later: the breath is left out (' + t2.info.lengthMs + ' ms)');
}

/* ---------------------------------------------------------------- every sound runs; nothing to keep stays empty */
{
  const sr = 44100, src = take(snare(sr), sr, 150, -60, 600, 61);
  for (const s of Core.SOUNDS) { const r = V.process(src, sr, s.id); ok(r.info.ok && r.data.length > 100 && V.truePeak(r.data) <= -0.95 && r.data[0] === 0 && r.data[r.data.length - 1] === 0 && r.data.length <= Math.round(V.profile(s.id).maxMs * 0.001 * sr) + 1, s.id + ': runs, capped at ' + V.profile(s.id).maxMs + ' ms, clean edges'); }
  eq(V.process(take(new Float32Array(0), sr, 0, -60, 800, 62), sr, 'B').info.reason, 'quiet', 'room noise alone gives an empty sample');
  eq(V.process(new Float32Array(sr), sr, 'B').data.length, 0, 'digital silence gives an empty sample');
  eq(V.process(null, sr, 'B').data.length, 0, 'null is safe'); eq(V.process(new Float32Array(10), sr, 'B').data.length, 0, 'too short is safe');
  const long = V.process(take(hum(sr, 3000), sr, 100, -60, 3500, 63), sr, 'B');
  ok(long.info.capped && long.data.length === Math.round(V.profile('B').maxMs * 0.001 * sr) && long.data[long.data.length - 1] === 0, 'a 3 s tone recorded as a kick is capped at ' + V.profile('B').maxMs + ' ms with a fade');
  ok(/^ROOM -\d+DB  GATE  LOW BOOST/.test(V.summary(V.process(take(kick(sr), sr, 300, -60, 1000, 64), sr, 'B').info)), 'summary line for the recorder UI');
}

/* ---------------------------------------------------------------- hit isolation: a drum is cut down to the hit */
{
  const sr = 44100, first = (a, f) => { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); let i = 0; while (i < a.length && Math.abs(a[i]) < m * f) i++; return i; }, last = (a, f) => { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); let i = a.length - 1; while (i > 0 && Math.abs(a[i]) < m * f) i--; return i; };
  for (const [name, sig, id] of [['kick', kick(sr), 'B'], ['hat', hat(sr), 't'], ['snare', snare(sr), 'K']]) {
    for (const room of [-62, -45]) {
      const t = take(sig, sr, 300, room, 1000, 90 + room), r = V.process(t, sr, id), y = r.data;
      ok(r.info.ok && r.info.cropped, name + ' ' + room + ' dB: the hit was isolated');
      const lead = first(y, 0.01) / sr * 1000, tail = (y.length - 1 - last(y, 0.01)) / sr * 1000;   // time under 1% (-40 dB) of the peak at each end
      ok(lead <= 8, name + ' ' + room + ' dB: nothing but the hit before it (' + lead.toFixed(1) + ' ms under -40 dB at the start)');
      ok(tail <= 30, name + ' ' + room + ' dB: nothing but the hit after it (' + tail.toFixed(1) + ' ms under -40 dB at the end)');
    }
  }
  /* something rustling right before the hit (a tap on the REC button, clothes) is not part of the sample */
  const bump = new Float32Array(Math.round(0.03 * sr)), t2 = take(kick(sr), sr, 300, -55, 1000, 95), r0 = rngf(5);
  for (let i = 0; i < bump.length; i++) bump[i] = gauss(r0) * 0.05 * Math.sin(Math.PI * i / bump.length); for (let i = 0; i < bump.length; i++) t2[Math.round(0.2 * sr) + i] += bump[i];
  const r2 = V.process(t2, sr, 'B');
  ok(r2.info.ok && r2.start >= Math.round(0.285 * sr), 'a rustle 70 ms before the kick is cut away (sample starts at ' + (r2.start / sr * 1000).toFixed(0) + ' ms, the kick is at 300)');
  /* a tonal sound is not cropped: a hum keeps its whole length */
  const hm = V.process(take(hum(sr, 900), sr, 100, -60, 1500, 96), sr, 'HUM');
  ok(hm.info.ok && !hm.info.cropped && hm.info.lengthMs > 800, 'a hum is not cropped (' + hm.info.lengthMs + ' ms)');
}

/* ---------------------------------------------------------------- phone-quality rooms: breath before the hit is cut, hiss is reduced */
{
  const sr = 44100, rms = (a, lo, hi) => { let e = 0; for (let i = lo; i < hi; i++) e += a[i] * a[i]; return Math.sqrt(e / Math.max(1, hi - lo)); }, dbv = (v) => 20 * Math.log10(Math.max(v, 1e-9));
  for (const [name, sig, id] of [['kick', kick(sr), 'B'], ['hat', hat(sr), 't'], ['snare', snare(sr), 'K']]) {
    const bs = hat(sr, 9), breath = new Float32Array(Math.round(0.07 * sr)); for (let i = 0; i < breath.length; i++) breath[i] = bs[i % bs.length] * 0.18 * Math.sin(Math.PI * i / breath.length);
    for (const room of [-48, -40]) {
      const t = take(sig, sr, 300, room, 900, 71 + room); for (let i = 0; i < breath.length; i++) t[Math.round(0.04 * sr) + i] += breath[i];   // a breath 190 ms before the hit
      const r = V.process(t, sr, id);
      ok(r.info.ok && r.data.length > 100, name + ' in a ' + room + ' dB room still records');
      ok(r.start >= Math.round(0.26 * sr), name + ' ' + room + ' dB: the breath before the hit is not part of the sample (starts at ' + (r.start / sr * 1000).toFixed(0) + ' ms, hit at 300)');
      if (room === -40) ok(r.info.denoised, name + ' ' + room + ' dB: noise reduction ran');
    }
    /* hiss: with the reduction the kept room sits lower than without it */
    const t = take(sig, sr, 300, -42, 900, 77), on = V.process(t, sr, id), off = V.process(t, sr, id, { profile: Object.assign({}, V.profile(id), { denoise: false }) });
    const tailOf = (r) => { const a = r.data, k = Math.floor(a.length * 0.8); return dbv(rms(a, k, a.length)) - dbv(Math.max(...a.map(Math.abs))); };
    ok(on.data.length && off.data.length && tailOf(on) <= tailOf(off) + 0.01, name + ': the end of the sample is not noisier with the reduction (' + tailOf(on).toFixed(1) + ' vs ' + tailOf(off).toFixed(1) + ' dB)');
  }
  const clean = V.process(take(kick(sr), sr, 300, -75, 900, 80), sr, 'B');
  ok(clean.info.ok && !clean.info.denoised, 'a clean take (75 dB room) skips the reduction');
}

/* ---------------------------------------------------------------- Samples: raw take, CLEAN / RAW, old entries */
{
  const sr = 44100, raw = take(kick(sr), sr, 250, -60, 900, 71), res = V.process(raw, sr, 'B');
  eq(S.put(1, 0, res.data, sr, { raw, fx: 'clean' }), true, 'put with the raw take');
  const g = S.get(1, 0);
  ok(g.raw && g.raw.length === raw.length && g.fx === 'clean' && g.f32.length === res.data.length, 'get returns f32, rate, raw and fx');
  const r1 = S.setMode(1, 0, 'raw'); ok(r1 && r1.fx === 'raw' && r1.f32.every((v, i) => v === res.dry[i]), 'setMode raw: f32 is the dry A/B version');
  const r2 = S.setMode(1, 'B', 'clean'); ok(r2 && r2.fx === 'clean' && r2.f32.every((v, i) => v === res.data[i]), 'setMode clean: back to the identical CLEAN sample');
  S.put(1, 'LR', res.data, sr); const old = S.get(1, 'LR');
  ok(old && !old.raw && !old.fx && S.setMode(1, 'LR', 'raw') === null, 'a sample without a raw take (old saves, imports) still works and has no RAW version');
  const ex = S.exportSlot(1); ok(ex.lanes[0] && !('raw' in ex.lanes[0]), 'export stays f32 only (no raw takes in cloud saves)');
  S.removeAll(1);
}

/* ---------------------------------------------------------------- recordSample({ sound }) on a fake mic */
{
  class FakeAC { constructor() { this.sampleRate = 44100; this.state = 'running'; this.destination = {}; } resume() { return Promise.resolve(); } close() { this.state = 'closed'; return Promise.resolve(); } createMediaStreamSource() { return { connect() {}, disconnect() {} }; } createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; } createScriptProcessor() { const sp = { connect() {}, disconnect() {}, onaudioprocess: null }; FakeAC.sp = sp; return sp; } }
  const tr = { stop() {}, getSettings() { return {}; }, onended: null };
  const defs = (o) => { for (const k in o) Object.defineProperty(globalThis, k, { value: o[k], configurable: true, writable: true }); };
  defs({ navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [tr], getAudioTracks: () => [tr] }) } }, AudioContext: FakeAC, isSecureContext: true });
  const pump = (x) => { for (let p = 0; p + 1024 <= x.length; p += 1024) FakeAC.sp.onaudioprocess({ inputBuffer: { getChannelData: () => x.subarray(p, p + 1024) } }); };
  ok((await M.open()).ok, 'fake mic opens');
  const sr = 44100, x = take(kick(sr), sr, 1000, -62, 3000, 81, 0);
  const p = M.recordSample({ maxWaitMs: 2500, sound: 'B' }); pump(x); const r = await p;
  ok(r.ok && r.fx && r.fx.family === 'kick' && r.raw && r.dry && r.raw.length > r.data.length, 'recordSample({sound:"B"}) cleans the take and keeps the raw take (' + JSON.stringify(r.fx) + ')');
  ok(r.raw.length >= Math.round(0.25 * sr), 'the raw take keeps 250 ms of room before the hit (noise floor material)');
  ok(V.truePeak(r.data) <= -0.95 && r.data[0] === 0, 'the recorded CLEAN sample is level-set and click-free');
  const soft = take(hat(sr), sr, 800, -66, 2500, 82, 0); for (let i = 0; i < soft.length; i++) soft[i] *= 0.35;
  const p2 = M.recordSample({ maxWaitMs: 2000, sound: 't' }); pump(soft); const r2 = await p2;
  ok(r2.ok && r2.fx && r2.fx.family === 'hat', 'a soft hat in a quiet room still triggers (adaptive trigger, ' + (r2.reason) + ')');
  const p3 = M.recordSample({ maxWaitMs: 4000, sound: 'HUM' }); pump(take(hum(sr, 1500), sr, 500, -62, 3500, 83, 0)); const r3 = await p3;
  ok(r3.ok && r3.fx.lengthMs >= 1400, 'a 1.5 s hum is recorded whole (the HUM profile allows ' + V.profile('HUM').maxMs + ' ms; got ' + (r3.fx && r3.fx.lengthMs) + ' ms)');
  /* a 2 s lip roll that dips for 200 ms: the take does not end in the dip */
  const lr = new Float32Array(Math.round(2 * sr)), lb = lipRoll(sr, 70); for (let i = 0; i < lr.length; i++) { const t = i / sr; lr[i] = lb[i % lb.length] * (t > 0.8 && t < 1.0 ? 0.01 : 1) * Math.min(1, t / 0.01, (lr.length - i) / sr / 0.03); }
  const p5 = M.recordSample({ maxWaitMs: 3000, sound: 'LR' }); pump(take(lr, sr, 500, -62, 4500, 84, 0)); const r5 = await p5;
  ok(r5.ok && r5.fx.lengthMs >= 1950, 'a 2 s lip roll with a 200 ms dip is recorded whole (' + (r5.fx && r5.fx.lengthMs) + ' ms)');
  const p4 = M.recordSample({ maxWaitMs: 2500 }); pump(x); const r4 = await p4;
  ok(r4.ok && !r4.raw && Math.abs(R.peak(r4.data) - 0.85) < 1e-4, 'without a sound id recordSample is the old trimSample path');
  M.close(); delete globalThis.navigator; delete globalThis.AudioContext; delete globalThis.isSecureContext;
}

if (PNG_DIR) console.log('  PNGs in ' + PNG_DIR);
done();
