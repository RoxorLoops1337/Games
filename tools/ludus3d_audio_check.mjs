// Ludus Maximus 3D audio analysis: renders js/audio.js OFFLINE (OfflineAudioContext in headless Chromium) and measures the buffers.
//   node tools/ludus3d_audio_check.mjs                      full run, prints tables, writes tools/ludus3d_audio_report.md, exit 1 on a failed budget
//   node tools/ludus3d_audio_check.mjs --quick              sfx + 1 render per music mode + structure checks only (no 60 s burst)
//   node tools/ludus3d_audio_check.mjs --sfx swordHit,footstep --modes arena,ludus   (subset)   --no-sfx / --no-music / --engine FILE (check another engine file)
//   node tools/ludus3d_audio_check.mjs --save-baseline      also stores the numbers as tools/ludus3d_audio_baseline.json (before/after comparison)
//   node tools/ludus3d_audio_check.mjs --wav DIR            writes WAVs of every render to DIR (listen in any player)
// Measures per sfx: peak, loudest-400ms LUFS-ish (K-weighted, BS.1770), clip count, DC, spectral centroid and band shares, duration, silence gaps, nodes created.
// Measures per music render: integrated LUFS-ish, peak, 2 s RMS curve, bar-line click score, longest silence, crossfade dip, determinism.
// Measures a 60 s simulated fight burst: sources alive per second (must stay flat), unstopped sources (leak), nodes created per second.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ARGS = process.argv.slice(2), QUICK = ARGS.includes('--quick'), SAVE_BASE = ARGS.includes('--save-baseline');
const engineFile = ARGS.includes('--engine') ? ARGS[ARGS.indexOf('--engine') + 1] : null;
const wavDir = ARGS.includes('--wav') ? ARGS[ARGS.indexOf('--wav') + 1] : null;
if (wavDir) mkdirSync(wavDir, { recursive: true });
const BASE_FILE = join(root, 'tools/ludus3d_audio_baseline.json'), REPORT = join(root, 'tools/ludus3d_audio_report.md');
let fails = 0; const bad = (m) => { fails++; console.log('FAIL', m); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = engineFile && u === '/ludus_maximus_3d/js/__engine.js' ? engineFile : join(root, normalize(u)); if ((!f.startsWith(root) && f !== engineFile) || !existsSync(f)) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream'); s.end(readFileSync(f)); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => bad('page error ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') bad('console ' + m.text()); });

// ---- node counting + analysis library, injected before the page scripts run ----
await page.addInitScript(() => {
  const C = (window.__cnt = { total: 0, byType: {} });
  window.__src = [];
  const proto = window.BaseAudioContext && window.BaseAudioContext.prototype;
  if (proto) for (const k of Object.getOwnPropertyNames(proto)) if (/^create(?!Buffer$|PeriodicWave$)/.test(k) && typeof proto[k] === 'function') {
    const orig = proto[k]; proto[k] = function (...a) { const n = orig.apply(this, a); C.total++; C.byType[k] = (C.byType[k] || 0) + 1; if (/Oscillator|BufferSource|ConstantSource/.test(k)) { n._r = { k, s: -1, e: Infinity }; window.__src.push(n._r); } return n; };
  }
  for (const P of [window.OscillatorNode, window.AudioBufferSourceNode, window.ConstantSourceNode]) if (P) {
    const os = P.prototype.start, oe = P.prototype.stop;
    P.prototype.start = function (t, ...r) { if (this._r) this._r.s = t || 0; return os.call(this, t, ...r); };
    P.prototype.stop = function (t, ...r) { if (this._r) this._r.e = t == null ? 0 : t; return oe.call(this, t, ...r); };
  }
  window.__L = {
    db: (x) => 20 * Math.log10(Math.max(x, 1e-9)),
    fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const u = i + k, v = i + k + len / 2, tr = re[v] * cr - im[v] * ci, ti = re[v] * ci + im[v] * cr; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } },
    kw(x, sr) { // K-weighting (BS.1770): shelf + high-pass
      const out = Float32Array.from(x);
      const run = (b0, b1, b2, a1, a2) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < out.length; i++) { const v = out[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y; } };
      let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K;
      run((Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
      f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr); a0 = 1 + K / Q + K * K;
      run(1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
      return out;
    },
    lufs(buf) { // integrated + max momentary (400 ms / 100 ms hop), absolute -70 and relative -10 gates
      const sr = buf.sampleRate, chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(window.__L.kw(buf.getChannelData(c), sr));
      const blk = Math.floor(sr * 0.4), hop = Math.floor(sr * 0.1), ms = [];
      for (let i = 0; i + blk <= chs[0].length; i += hop) { let s = 0; for (const d of chs) { let a = 0; for (let k = i; k < i + blk; k++) a += d[k] * d[k]; s += a / blk; } ms.push(s); }
      const l = (v) => -0.691 + 10 * Math.log10(Math.max(v, 1e-12)), ab = ms.filter((v) => l(v) > -70);
      if (!ab.length) return { integrated: -99, momMax: -99 };
      const rel = l(ab.reduce((a, b) => a + b, 0) / ab.length) - 10, g = ab.filter((v) => l(v) > rel);
      return { integrated: g.length ? l(g.reduce((a, b) => a + b, 0) / g.length) : -99, momMax: l(Math.max(...ms)) };
    },
    analyze(buf, o = {}) {
      const L = window.__L, sr = buf.sampleRate, A = buf.getChannelData(0), B = buf.numberOfChannels > 1 ? buf.getChannelData(1) : A, n = A.length, m = new Float32Array(n);
      let peak = 0, clip = 0, nan = 0, dc = 0, sideE = 0, midE = 0;
      for (let i = 0; i < n; i++) { const a = A[i], b = B[i]; if (!(isFinite(a) && isFinite(b))) { nan++; continue; } m[i] = (a + b) / 2; const p = Math.max(Math.abs(a), Math.abs(b)); if (p > peak) peak = p; if (p >= 0.999) clip++; dc += m[i]; midE += m[i] * m[i]; sideE += ((a - b) / 2) * ((a - b) / 2); }
      dc /= n;
      const hop = Math.floor(sr * 0.01), env = []; for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += m[i + k] * m[i + k]; env.push(Math.sqrt(s / hop)); }
      const thr = Math.pow(10, -50 / 20); let first = env.findIndex((v) => v > thr), last = env.length - 1; while (last > 0 && env[last] <= thr) last--;
      const active = first < 0 ? 0 : (last - first + 1) * 0.01;
      let ss = 0, cnt = 0; for (const v of env) if (v > Math.pow(10, -40 / 20)) { ss += v * v; cnt++; } const rms = cnt ? Math.sqrt(ss / cnt) : 0;
      let bi = 0; for (let i = 0; i < env.length; i++) if (env[i] > env[bi]) bi = i;
      const N = 4096, bins = new Float64Array(N / 2);
      const offs = o.music ? [0.5, 1.5, 2.5, 3.5, 5, 7, 9, 11].map((x) => x) : [-0.1, 0, 0.1, 0.5];
      for (const off of offs) { const st = Math.max(0, Math.min(n - N, Math.floor(((o.music ? 0 : bi * 0.01) + off) * sr))); const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = m[st + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); L.fft(re, im); for (let k = 0; k < N / 2; k++) bins[k] += re[k] * re[k] + im[k] * im[k]; }
      const edges = [0, 120, 300, 800, 2500, 6000, 12000, 1e9], sh = new Array(7).fill(0); let tot = 0, cs = 0;
      for (let k = 1; k < N / 2; k++) { const f = k * sr / N, e = bins[k]; tot += e; cs += e * f; for (let b = 0; b < 7; b++) if (f >= edges[b] && f < edges[b + 1]) { sh[b] += e; break; } }
      let gap = 0, run = 0; for (let i = first; i <= last && first >= 0; i++) { if (env[i] < Math.pow(10, -60 / 20)) { run++; gap = Math.max(gap, run); } else run = 0; }
      const w1 = Math.floor(sr * 1), wr = []; for (let i = 0; i + w1 <= n; i += w1) { let s = 0; for (let k = 0; k < w1; k++) s += m[i + k] * m[i + k]; wr.push(L.db(Math.sqrt(s / w1))); }
      const mean = wr.reduce((a, b) => a + b, 0) / Math.max(1, wr.length), sd = Math.sqrt(wr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, wr.length));
      // click score at given boundaries (seconds): jump of the first difference vs its local RMS
      let click = 0;
      for (const bt of o.bounds || []) { const i = Math.floor(bt * sr); if (i < 600 || i + 600 > n) continue; let loc = 0; for (let k = i - 500; k < i + 500; k++) { const d = m[k] - m[k - 1]; loc += d * d; } loc = Math.sqrt(loc / 1000) + 1e-6; let mx = 0; for (let k = i - 6; k < i + 6; k++) mx = Math.max(mx, Math.abs(m[k] - m[k - 1])); click = Math.max(click, mx / loc); }
      const lu = L.lufs(buf);
      return { peakDb: L.db(peak), rmsDb: L.db(rms), lufs: lu.integrated, momMax: lu.momMax, crest: L.db(peak) - L.db(rms), clip, nan, dc, active, centroid: tot ? cs / tot : 0, bands: sh.map((x) => x / (tot || 1)), gap: gap * 0.01, wr, wrSd: sd, width: midE > 0 ? 10 * Math.log10(Math.max(sideE, 1e-12) / midE) : -99, click };
    },
    wav(buf) { const n = buf.length, ch = buf.numberOfChannels, out = new Int16Array(n * ch); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i * ch + c] = Math.max(-1, Math.min(1, d[i])) * 32767; } let s = ''; const u = new Uint8Array(out.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); },
    counters() { return { total: window.__cnt.total, byType: Object.assign({}, window.__cnt.byType), src: window.__src.length }; },
  };
});
await page.goto(`http://127.0.0.1:${port}/ludus_maximus_3d/lab/audio_lab.html${engineFile ? '?engine=1' : ''}`);
await page.waitForFunction(() => window.__ready);

// ---- render jobs inside the page ----
await page.evaluate(() => {
  const L = window.__L, SR = 44100;
  const mkRng = (s) => () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  async function mk(secs, seed, extra) {
    const clock = { t: 0 }, off = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
    const c0 = L.counters(); const a = window.__lab.createAudio(Object.assign({ ctx: off, seed: seed == null ? 1 : seed, log: true, now: () => clock.t, enforce: true }, extra || {}));
    return { a, off, clock, c0 };
  }
  // scripted fight; density scales event rate. Everything is scheduled at its own time, with the engine clock following (clock.t) like a real frame loop.
  function fight(env, secs, density, rs, opts) {
    const { a, clock } = env, R = mkRng(rs), ev = [];
    const beast = opts && opts.beast;
    let t = 0.3;
    while (t < secs) {
      const r = R();
      const pan = (R() * 2 - 1) * 0.9, voice = Math.floor(R() * 4);
      if (r < 0.34) ev.push([t, 'swordHit', { pan }]); else if (r < 0.44) ev.push([t, 'shieldBlock', { pan }]); else if (r < 0.62) ev.push([t, 'swish', { pan, pitch: 1.1 + R() * 0.3 }]);
      else if (r < 0.76) ev.push([t, 'footstep', { pan, pitch: 0.9 + R() * 0.2 }]); else if (r < 0.84) ev.push([t, 'hurt', { pan, voice }]); else if (r < 0.9) ev.push([t, 'grunt', { pan, voice }]);
      else if (r < 0.93) ev.push([t, 'swordHitCrit', { pan }]); else if (r < 0.95) ev.push([t, 'bash', { pan }]); else if (r < 0.965) ev.push([t, 'dust', { pan }]); else if (r < 0.975) ev.push([t, 'deathThud', { pan }]);
      else if (r < 0.985) ev.push([t, 'ult', { element: ['fire', 'lightning', 'earth', 'wind', 'holy'][Math.floor(R() * 5)] }]); else ev.push([t, beast ? 'beastRoar' : 'crowdRoar', { kind: 'lion' }]);
      if (beast && R() < 0.2) ev.push([t + 0.05, ['beastBite', 'beastClaw', 'beastSlam', 'beastGrowl'][Math.floor(R() * 4)], { kind: 'lion', pan }]);
      t += (0.12 + R() * 0.5) / density;
    }
    ev.sort((x, y) => x[0] - y[0]);
    let ei = 0, last = 0;
    for (let tt = 0; tt <= secs; tt += 0.1) {
      clock.t = tt;
      const I = Math.max(0, Math.min(1, 0.45 + 0.4 * Math.sin(tt / 9) + 0.15 * Math.sin(tt / 3.1)));
      if (Math.floor(tt * 4) !== last) { last = Math.floor(tt * 4); a.music.setIntensity(I); a.crowd(0.25 + 0.75 * I); }
      while (ei < ev.length && ev[ei][0] <= tt + 0.1) { const [et, n, o] = ev[ei++]; clock.t = Math.max(clock.t, et - 0.05); a.sfx(n, Object.assign({ when: et }, o)); }
      clock.t = tt; a.music.pump(tt + 0.5);
    }
    return ev.length;
  }
  window.__job = {
    async sfx(name, opts, secs) { const e = await mk(secs || 5, 1); const n0 = window.__cnt.total; const ok = e.a.sfx(name, Object.assign({ when: 0.02 }, opts || {})); const nodes = window.__cnt.total - n0; const sr0 = window.__src.length; const buf = await e.off.startRendering(); const an = L.analyze(buf); an.nodes = nodes; an.ok = ok; return { an, wav: window.__wavOn ? L.wav(buf) : null }; },
    async sfxRR(name, count, opts, gap) { // render the same sfx several times in one buffer, 2 s apart, to see variation (peak/centroid spread)
      gap = gap || 2; const e = await mk(count * gap + 1, 3), res = []; for (let i = 0; i < count; i++) { e.clock.t = i * gap; e.a.sfx(name, Object.assign({ when: 0.05 + i * gap }, opts || {})); }
      const buf = await e.off.startRendering(); const sr = buf.sampleRate, d = buf.getChannelData(0);
      for (let i = 0; i < count; i++) { const sl = d.subarray(Math.floor(sr * (0.05 + i * gap)), Math.floor(sr * (gap - 0.1 + i * gap))); let pk = 0, sum = 0, zc = 0; for (let k = 0; k < sl.length; k++) { pk = Math.max(pk, Math.abs(sl[k])); sum += sl[k] * sl[k]; if (k && (sl[k] >= 0) !== (sl[k - 1] >= 0)) zc++; } res.push({ pk: L.db(pk), rms: L.db(Math.sqrt(sum / sl.length)), zc: zc / (sl.length / sr) / 2 }); }
      return res;
    },
    async music(mode, o) {
      o = o || {}; const secs = o.secs || 24, e = await mk(secs, o.seed == null ? 1 : o.seed), a = e.a;
      if (o.setup) a.music.setHubTime && a.music.setHubTime(o.setup.hour, o.setup.night);
      a.music.setIntensity(o.int == null ? 0.5 : o.int); a.music.setMode(mode, Object.assign({ at: 0, fade: 0.05 }, o.modeOpts || {}));
      let bpmAt = null;
      for (let t = 0; t <= secs; t += 0.5) {
        e.clock.t = t;
        if (o.rampInt && t >= secs / 2) a.music.setIntensity(o.rampInt);
        if (o.switchTo && Math.abs(t - o.switchAt) < 0.26) a.music.setMode(o.switchTo, { fade: o.fade || 2 });
        a.music.pump(t + 0.5);
      }
      const seen = new Set(), log = a.music.log ? a.music.log.filter((x) => { if (x.step % 16 !== 0) return false; const k = x.mode + x.bar; if (seen.has(k)) return false; seen.add(k); return true; }) : [];
      const buf = await e.off.startRendering();
      const bounds = log.map((x) => x.t).filter((x) => x > 0.3 && x < secs - 0.3);
      const an = L.analyze(buf, { music: true, bounds }); an.bars = log.length; if (o.sum) an.sum = Array.from(buf.getChannelData(0).filter((_, i) => i % 997 === 0)).map((v) => +v.toFixed(4));
      return { an, wav: window.__wavOn ? L.wav(buf) : null };
    },
    async crowd(level, secs) { const e = await mk(secs || 6, 1); e.a.crowd(level); const buf = await e.off.startRendering(); return { an: L.analyze(buf), wav: window.__wavOn ? L.wav(buf) : null }; },
    async mix(secs, density, beast) { // fight mix: arena music + crowd + sfx burst
      const e = await mk(secs, 4), c0 = L.counters(), t0 = performance.now(); e.a.music.setMode(beast ? 'beast' : 'arena', { at: 0, fade: 0.05 }); const n = fight(e, secs, density || 1, 11, { beast }); const buf = await e.off.startRendering();
      const an = L.analyze(buf, { music: true }); an.events = n; an.msBuild = performance.now() - t0; return { an, wav: window.__wavOn ? L.wav(buf) : null };
    },
    async burst(secs, density) { // CPU / leak test: 60 s dense fight; count sources alive per second and never-stopped sources
      const e = await mk(secs, 5), c0 = L.counters(), s0 = window.__src.length; e.a.music.setMode('arena', { at: 0, fade: 0.05 }); const n = fight(e, secs, density || 2.5, 21);
      const srcs = window.__src.slice(s0), alive = [], created = [];
      for (let t = 1; t <= secs; t += 1) { let c = 0; for (const r of srcs) if (r.s >= 0 && r.s <= t && r.e > t) c++; alive.push(c); }
      const unstopped = srcs.filter((r) => r.s >= 0 && !isFinite(r.e)).length, c1 = L.counters(); const st = e.a._stats ? e.a._stats() : null;
      const buf = await e.off.startRendering(); const an = L.analyze(buf, { music: true });
      return { alive, unstopped, nodesCreated: c1.total - c0.total, sources: srcs.length, events: n, st, an };
    },
    async vol(kind) { // setMaster / setMusic / setSfx must be honoured: 0 is silence, 0.5 is quieter than 1
      const out = {};
      for (const v of [1, 0.5, 0]) {
        const e = await mk(4, 2); const a = e.a; e.clock.t = 0.5;
        if (kind === 'master') a.setMaster(v); else if (kind === 'music') a.setMusic(v); else a.setSfx(v);
        e.clock.t = 1.0; if (kind === 'music') { a.music.setMode('arena', { at: 1.0, fade: 0.05 }); a.music.setIntensity(0.8); for (let t = 1; t <= 4; t += 0.5) { e.clock.t = t; a.music.pump(t + 0.5); } } else { for (let i = 0; i < 6; i++) a.sfx('swordHit', { when: 1.2 + i * 0.4 }); a.crowd(0.6); }
        const buf = await e.off.startRendering(), d = buf.getChannelData(0); let ss = 0, n = 0; for (let i = Math.floor(buf.sampleRate * 1.2); i < d.length; i++) { ss += d[i] * d[i]; n++; } out[v] = L.db(Math.sqrt(ss / n));
      }
      return out;
    },
    async gesture() { // iOS / autoplay contract in a fresh live AudioContext
      const a = window.__lab.createAudio({}), r = {}; r.supportedBeforeUnlock = a.supported; r.sfxBeforeUnlock = a.sfx('uiTap'); r.stateBefore = a.state;
      r.unlock = await a.unlock(); r.stateAfter = a.state; a.setMaster(0.5); a.setMusic(0.3); a.setSfx(0.2); r.masterApi = true;
      a.suspend(); await new Promise((x) => setTimeout(x, 80)); r.suspended = a.state; a.resume(); await new Promise((x) => setTimeout(x, 150)); r.resumed = a.state;
      return r;
    },
  };
});

const f1 = (x) => (+x).toFixed(1), pct = (x) => Math.round(x * 100);
const results = { sfx: {}, music: {}, crowd: {}, mix: {}, burst: null, meta: {} };
// stages can be run in separate invocations and merged through a cache file: --stages sfx,music,mix,burst,misc --cache FILE
const STAGES = ARGS.includes('--stages') ? new Set(ARGS[ARGS.indexOf('--stages') + 1].split(',')) : null, ST = (n) => !STAGES || STAGES.has(n);
const CACHE = ARGS.includes('--cache') ? ARGS[ARGS.indexOf('--cache') + 1] : null;
if (CACHE && existsSync(CACHE)) Object.assign(results, JSON.parse(readFileSync(CACHE, 'utf8')));
async function maybeWav(name, r) { if (wavDir && r.wav) { const pcm = Buffer.from(r.wav, 'base64'), h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(44100, 24); h.writeUInt32LE(44100 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); writeFileSync(join(wavDir, name + '.wav'), Buffer.concat([h, pcm])); } delete r.wav; }
if (wavDir) await page.evaluate(() => { window.__wavOn = true; });

const info = await page.evaluate(() => ({ sfx: window.__lab.SFX_NAMES, modes: window.__lab.MUSIC_MODES }));
const hasApi = await page.evaluate(() => { const a = window.__lab.createAudio({}); return { setScene: typeof a.setScene, listener: typeof a.setListener, stats: typeof a._stats }; });
Object.assign(results.meta, { sfxCount: info.sfx.length, modes: info.modes, api: hasApi });

// ---- 1) sfx ----
console.log('== SFX ==');
const SFX_OPTS = { ult: { element: 'fire' } };
const only = ARGS.includes('--sfx') ? ARGS[ARGS.indexOf('--sfx') + 1].split(',') : null;
for (const n of info.sfx) {
  if (!ST('sfx') || ARGS.includes('--no-sfx') || (only && !only.includes(n))) continue;
  const r = await page.evaluate(([n]) => window.__job.sfx(n, {}), [n]); await maybeWav('sfx_' + n, r);
  const gap = Math.max(1, Math.min(5, r.an.active + 0.4)), rr = await page.evaluate(([n, gap]) => window.__job.sfxRR(n, 6, n === 'beastRoar' ? { kind: 'lion' } : {}, gap), [n, gap]);
  const pk = rr.map((x) => x.pk), zc = rr.map((x) => x.zc), spread = Math.max(...pk) - Math.min(...pk), zcv = (Math.max(...zc) - Math.min(...zc)) / Math.max(1, Math.max(...zc));
  r.an.rrSpread = spread; r.an.rrTimbre = zcv; results.sfx[n] = r.an;
}
// ---- 2) crowd bed ----
if (ST('sfx')) for (const lv of [0.2, 0.6, 1]) { const r = await page.evaluate(([lv]) => window.__job.crowd(lv, 8), [lv]); await maybeWav('crowd_' + lv, r); results.crowd[lv] = r.an; }

// ---- 3) music ----
console.log('== MUSIC ==');
const modes = info.modes;
const onlyM = ARGS.includes('--modes') ? ARGS[ARGS.indexOf('--modes') + 1].split(',') : null;
for (const m of modes) {
  if (!ST('music') || ARGS.includes('--no-music') || (onlyM && !onlyM.includes(m))) continue;
  const ints = m === 'arena' || m === 'beast' || m === 'boss' ? [0, 0.5, 1] : [0.5];
  for (const I of ints) {
    const key = m + (ints.length > 1 ? '@' + I : '');
    const r = await page.evaluate(([m, I]) => window.__job.music(m, { int: I, secs: 24 }), [m, I]).catch((e) => { console.log('ERR', String(e).slice(0, 400)); return null; });
    if (!r) { bad('music render failed ' + key); continue; }
    await maybeWav('music_' + key.replace('@', '_'), r); results.music[key] = r.an;
  }
}
if (!QUICK && ST('music')) {
  for (const [key, o] of [['ludus@night', { setup: { hour: 22, night: 1 }, int: 0.4 }], ['ludus@dawn', { setup: { hour: 6.8, night: 0 }, int: 0.4 }], ['arena@ramp', { int: 0, rampInt: 1, secs: 32 }], ['xfade ludus>arena', { switchTo: 'arena', switchAt: 10, fade: 2, secs: 24, int: 0.5 }], ['xfade arena>victory', { switchTo: 'victory', switchAt: 10, fade: 0.3, secs: 24, int: 0.7 }]]) {
    const m = key.startsWith('arena') ? 'arena' : key.startsWith('xfade arena') ? 'arena' : 'ludus';
    const r = await page.evaluate(([m, o]) => window.__job.music(m, o), [m, o]); await maybeWav('music_' + key.replace(/[ >@]/g, '_'), r); results.music[key] = r.an;
  }
  // determinism and variation
  const a1 = await page.evaluate(() => window.__job.music('ludus', { sum: true, seed: 5, int: 0.3, secs: 20 })), a2 = await page.evaluate(() => window.__job.music('ludus', { sum: true, seed: 5, int: 0.3, secs: 20 })), a3 = await page.evaluate(() => window.__job.music('ludus', { sum: true, seed: 6, int: 0.3, secs: 20 }));
  const dmax = (x, y) => Math.max(...x.map((v, i) => Math.abs(v - y[i]))); results.meta.deterministic = dmax(a1.an.sum, a2.an.sum) < 0.002; results.meta.seedVaries = dmax(a1.an.sum, a3.an.sum) > 0.01;   // convolver/compressor float noise is about 1e-5
  if (!results.meta.deterministic) bad('same seed must render identically'); if (!results.meta.seedVaries) bad('different seed must differ');
}

// ---- 4) mix + burst ----
if (!QUICK && (ST('mix') || ST('burst'))) {
  console.log('== MIX / BURST ==');
  if (ST('mix')) for (const [k, d, beast] of [['fight calm', 0.6, false], ['fight busy', 1.5, false], ['beast hunt', 1.0, true]]) { const r = await page.evaluate(([d, b]) => window.__job.mix(30, d, b), [d, beast]); await maybeWav('mix_' + k.replace(' ', '_'), r); results.mix[k] = r.an; }
  if (ST('burst')) results.burst = await page.evaluate(() => window.__job.burst(60, 2.5));
}
if (ST('misc')) {
  const b2 = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: [] });
  const p2 = await b2.newPage(); await p2.addInitScript(() => { window.__src = []; window.__cnt = { total: 0, byType: {} }; });
  await p2.goto(`http://127.0.0.1:${port}/ludus_maximus_3d/lab/audio_lab.html${engineFile ? '?engine=1' : ''}`); await p2.waitForFunction(() => window.__ready);
  await p2.evaluate(() => { window.__job = { async gesture() { const a = window.__lab.createAudio({}), r = {}; r.sfxBeforeUnlock = a.sfx('uiTap'); r.stateBefore = a.state; r.unlock = await a.unlock(); r.stateAfter = a.state; a.setMaster(0.5); a.setMusic(0.3); a.setSfx(0.2); a.suspend(); await new Promise((x) => setTimeout(x, 100)); r.suspended = a.state; a.resume(); await new Promise((x) => setTimeout(x, 200)); r.resumed = a.state; return r; } }; });
  results.meta.gesture = await p2.evaluate(() => window.__job.gesture());
  results.meta.ensureMs = await p2.evaluate(() => { const a = window.__lab.createAudio({}); const t0 = performance.now(); a._ready(); return +(performance.now() - t0).toFixed(1); });
  await b2.close();
}

if (ST('misc')) { results.meta.vol = {}; for (const k of ['master', 'music', 'sfx']) results.meta.vol[k] = await page.evaluate((k) => window.__job.vol(k), k); }
if (CACHE) writeFileSync(CACHE, JSON.stringify(results));
for (const [k, r] of Object.entries(results.meta.vol || {})) { if (!(r[0] < -70)) bad(`volume ${k}=0 is not silent (${f1(r[0])} dB)`); if (!(r[0.5] < r[1] - 3)) bad(`volume ${k}=0.5 is not quieter than 1 (${f1(r[0.5])} vs ${f1(r[1])})`); }

// ---- evaluation ----
const flags = {}; const flag = (n, w) => { (flags[n] = flags[n] || []).push(w); };
const CAT = (n) => /^ui/.test(n) ? 'ui' : /^crowd/.test(n) ? 'crowd' : /^beast|pawThud/.test(n) ? 'beast' : /^(bird|owl|hammer|clink|chop|sizzle|thock|thunder)$/.test(n) ? 'amb' : /^(grunt|hurt|deathCry)$/.test(n) ? 'voice' : /^ult|^gate$|^horn$|^levelUp$/.test(n) ? 'big' : 'combat';
for (const [n, a] of Object.entries(results.sfx)) {
  const c = CAT(n), bs = a.bands;
  if (a.nan) flag(n, 'NaN'); if (a.clip) flag(n, 'clips x' + a.clip); if (a.peakDb > -2.5) flag(n, 'peak ' + f1(a.peakDb) + ' dB over limiter threshold');
  if (a.peakDb < -26) flag(n, 'very quiet ' + f1(a.peakDb)); if (Math.abs(a.dc) > 0.004) flag(n, 'DC ' + a.dc.toFixed(4));
  const harsh = bs[4] + bs[5]; if (harsh > 0.5 && a.peakDb > -14 && c !== 'amb') flag(n, 'harsh: ' + pct(harsh) + '% of energy at 2.5k-12k');
  if (['combat', 'voice', 'beast', 'big'].includes(c) && bs[0] + bs[1] < 0.05 && !/swish|miss|dust|spearThrust|metalClang|parry|stunChime|healSparkle|coin|ultHoly|beastHowl/.test(n)) flag(n, 'thin: only ' + pct(bs[0] + bs[1]) + '% below 300 Hz');
  if (a.gap > 0.5 && !/gate|footstep|owl|bird/.test(n)) flag(n, 'silence gap ' + a.gap + ' s inside');
  if (a.rrSpread < 0.4 && a.rrTimbre < 0.03 && !/^ui|^coin$/.test(n)) flag(n, 'repetitive: 6 triggers vary ' + f1(a.rrSpread) + ' dB, timbre ' + pct(a.rrTimbre) + '%');
  if (a.nodes > (c === 'big' ? 140 : c === 'crowd' ? 150 : 70)) flag(n, 'heavy: ' + a.nodes + ' nodes per trigger');
}
for (const [k, a] of Object.entries(results.music)) {
  if (a.nan) flag('music ' + k, 'NaN'); if (a.clip) flag('music ' + k, 'clips x' + a.clip); if (a.peakDb > -2) flag('music ' + k, 'peak ' + f1(a.peakDb)); if (Math.abs(a.dc) > 0.003) flag('music ' + k, 'DC ' + a.dc.toFixed(4));
  if (a.gap > 1.2 && !/elegy/.test(k)) flag('music ' + k, 'silence gap ' + a.gap + ' s'); if (a.click > 25) flag('music ' + k, 'bar-line click score ' + f1(a.click));
  if (a.bands[5] + a.bands[6] > 0.35) flag('music ' + k, 'bright/harsh: ' + pct(a.bands[5] + a.bands[6]) + '% above 6 kHz'); if (a.bands[0] + a.bands[1] < 0.05) flag('music ' + k, 'thin: ' + pct(a.bands[0] + a.bands[1]) + '% below 300 Hz');
  if (a.wrSd < 0.7 && !/ramp|xfade/.test(k)) flag('music ' + k, 'static dynamics (1 s RMS sd ' + f1(a.wrSd) + ' dB)');
}
results.meta.flags = flags;

// ---- report ----
let base = null; try { base = JSON.parse(readFileSync(BASE_FILE, 'utf8')); } catch (e) { /* no baseline */ }
const L = [];
const row = (...c) => '| ' + c.join(' | ') + ' |';
L.push('# Ludus Maximus 3D audio analysis', '', 'Generated by `node tools/ludus3d_audio_check.mjs` (OfflineAudioContext in headless Chromium, 44.1 kHz stereo, K-weighted LUFS-ish per ITU BS.1770 with gating). Numbers are post master chain.', '');
L.push(`Engine surface: ${info.sfx.length} sfx, music modes: ${modes.join(', ')}. API probe: ${JSON.stringify(hasApi)}.`, '');
L.push('## Flags (what the numbers say is harsh, thin, clipping, repetitive or heavy)', '');
const fk = Object.keys(flags); if (!fk.length) L.push('None.'); else for (const k of fk) L.push(`- **${k}**: ${flags[k].join('; ')}`);
L.push('', '## SFX table', '', row('sfx', 'peak dB', 'mom. LUFS', 'crest dB', 'active s', 'centroid Hz', '<300 / 300-2.5k / >2.5k %', 'RR spread dB', 'nodes', 'before peak / nodes'), row(...Array(10).fill('---')));
for (const [n, a] of Object.entries(results.sfx)) { const b = base && base.sfx && base.sfx[n]; L.push(row(n, f1(a.peakDb), f1(a.momMax), f1(a.crest), a.active.toFixed(2), Math.round(a.centroid), pct(a.bands[0] + a.bands[1]) + ' / ' + pct(a.bands[2] + a.bands[3]) + ' / ' + pct(a.bands[4] + a.bands[5] + a.bands[6]), f1(a.rrSpread), a.nodes, b ? f1(b.peakDb) + ' / ' + b.nodes : '')); }
L.push('', '## Crowd bed', '', row('level', 'peak dB', 'LUFS', 'centroid', 'gap s'), row('---', '---', '---', '---', '---'));
for (const [k, a] of Object.entries(results.crowd)) L.push(row(k, f1(a.peakDb), f1(a.lufs), Math.round(a.centroid), a.gap));
L.push('', '## Music', '', row('render', 'peak dB', 'LUFS int.', '1s-RMS sd dB', 'centroid', '<300 / 300-2.5k / >2.5k %', 'stereo side dB', 'gap s', 'bar click', 'before LUFS'), row(...Array(10).fill('---')));
for (const [k, a] of Object.entries(results.music)) { const b = base && base.music && base.music[k]; L.push(row(k, f1(a.peakDb), f1(a.lufs), f1(a.wrSd), Math.round(a.centroid), pct(a.bands[0] + a.bands[1]) + ' / ' + pct(a.bands[2] + a.bands[3]) + ' / ' + pct(a.bands[4] + a.bands[5] + a.bands[6]), f1(a.width), a.gap, f1(a.click), b ? f1(b.lufs) : '')); }
if (Object.keys(results.mix).length) {
  L.push('', '## Fight mix (30 s, arena music + crowd bed + scripted sfx), loudness target about -16 LUFS', '', row('scenario', 'LUFS int.', 'momentary max', 'peak dB', 'clip', 'before LUFS / peak'), row(...Array(6).fill('---')));
  for (const [k, a] of Object.entries(results.mix)) { const b = base && base.mix && base.mix[k]; L.push(row(k, f1(a.lufs), f1(a.momMax), f1(a.peakDb), a.clip, b ? f1(b.lufs) + ' / ' + f1(b.peakDb) : '')); }
}
if (results.burst) {
  const bu = results.burst, al = bu.alive, h = Math.floor(al.length / 3), m1 = al.slice(5, 5 + h).reduce((a, b) => a + b, 0) / h, m2 = al.slice(-h).reduce((a, b) => a + b, 0) / h, bb = base && base.burst;
  results.burst.summary = { aliveMax: Math.max(...al), aliveMeanFirst: m1, aliveMeanLast: m2, unstopped: bu.unstopped };
  L.push('', '## 60 s simulated fight burst (CPU / leak)', '', row('metric', 'now', 'before'), row('---', '---', '---'));
  L.push(row('events scheduled', bu.events, bb ? bb.events : ''), row('sources created', bu.sources, bb ? bb.sources : ''), row('nodes created (all types)', bu.nodesCreated, bb ? bb.nodesCreated : ''), row('sources alive, max', Math.max(...al), bb ? bb.summary.aliveMax : ''), row('sources alive, mean of first / last third', f1(m1) + ' / ' + f1(m2), bb ? f1(bb.summary.aliveMeanFirst) + ' / ' + f1(bb.summary.aliveMeanLast) : ''), row('sources never stopped (leak)', bu.unstopped, bb ? bb.summary.unstopped : ''), row('peak dB / LUFS', f1(bu.an.peakDb) + ' / ' + f1(bu.an.lufs), bb ? f1(bb.an.peakDb) + ' / ' + f1(bb.an.lufs) : ''));
  if (bu.st) L.push('', 'Engine stats at end: `' + JSON.stringify(bu.st) + '`');
  L.push('', 'Alive sources per second: ' + al.join(' '));
  if (m2 > m1 * 1.25 + 4) bad('alive source count grows during burst ' + f1(m1) + ' -> ' + f1(m2));
  if (bu.unstopped > 8) bad('sources started without stop: ' + bu.unstopped);
  if (Math.max(...al) > 260) bad('alive source peak too high ' + Math.max(...al));
}
L.push('', '## Volume controls (RMS dB after the master chain at slider 1 / 0.5 / 0; 0 must be silence)', '', ...Object.entries(results.meta.vol || {}).map(([k, r]) => `- set${k[0].toUpperCase() + k.slice(1)}: ${f1(r[1])} / ${f1(r[0.5])} / ${f1(r[0])}`));
L.push('', '## Autoplay / unlock contract (live AudioContext in headless Chromium)', '', '`' + JSON.stringify(results.meta.gesture) + '`', '', 'Graph build (first unlock) main-thread cost: ' + results.meta.ensureMs + ' ms.');
if ((results.meta.gesture || (results.meta.gesture = { stateBefore: 'running', sfxBeforeUnlock: false, stateAfter: 'running', suspended: 'suspended', resumed: 'running', skipped: true })).stateBefore !== 'running' && (results.meta.gesture || (results.meta.gesture = { stateBefore: 'running', sfxBeforeUnlock: false, stateAfter: 'running', suspended: 'suspended', resumed: 'running', skipped: true })).sfxBeforeUnlock !== false) bad('sfx before unlock must drop silently (headless Chromium starts contexts running, so this only bites on real browsers)');
if ((results.meta.gesture || (results.meta.gesture = { stateBefore: 'running', sfxBeforeUnlock: false, stateAfter: 'running', suspended: 'suspended', resumed: 'running', skipped: true })).stateAfter !== 'running') bad('unlock did not reach running: ' + (results.meta.gesture || (results.meta.gesture = { stateBefore: 'running', sfxBeforeUnlock: false, stateAfter: 'running', suspended: 'suspended', resumed: 'running', skipped: true })).stateAfter);
if ((results.meta.gesture || (results.meta.gesture = { stateBefore: 'running', sfxBeforeUnlock: false, stateAfter: 'running', suspended: 'suspended', resumed: 'running', skipped: true })).suspended !== 'suspended' || (results.meta.gesture || (results.meta.gesture = { stateBefore: 'running', sfxBeforeUnlock: false, stateAfter: 'running', suspended: 'suspended', resumed: 'running', skipped: true })).resumed !== 'running') bad('suspend/resume cycle failed ' + JSON.stringify(results.meta.gesture));
// hard budgets
for (const [n, a] of Object.entries(results.sfx)) { if (a.nan || a.clip) bad(`sfx ${n}: NaN/clip`); }
for (const [n, a] of Object.entries(results.music)) { if (a.nan || a.clip) bad(`music ${n}: NaN/clip`); }
for (const [k, a] of Object.entries(results.mix)) { if (a.clip) bad(`mix ${k} clips`); if (a.lufs < -22 || a.lufs > -12) bad(`mix ${k} loudness ${f1(a.lufs)} LUFS outside -22..-12`); }
writeFileSync(REPORT, L.join('\n') + '\n');
if (SAVE_BASE) { writeFileSync(BASE_FILE, JSON.stringify({ sfx: results.sfx, music: results.music, mix: results.mix, burst: results.burst && { alive: results.burst.alive, unstopped: results.burst.unstopped, nodesCreated: results.burst.nodesCreated, sources: results.burst.sources, events: results.burst.events, summary: results.burst.summary, an: { peakDb: results.burst.an.peakDb, lufs: results.burst.an.lufs } } }) + '\n'); console.log('baseline saved'); }
// console summary
console.log(`\nsfx ${Object.keys(results.sfx).length}, music renders ${Object.keys(results.music).length}, flags on ${fk.length} items`);
for (const k of fk) console.log(' -', k + ':', flags[k].join('; '));
for (const [k, a] of Object.entries(results.mix)) console.log(`mix ${k}: ${f1(a.lufs)} LUFS peak ${f1(a.peakDb)}`);
if (results.burst) console.log('burst', JSON.stringify(results.burst.summary), 'nodes', results.burst.nodesCreated);
console.log(`report: ${REPORT}\n${fails ? fails + ' FAILURES' : 'ALL OK'}`);
await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
