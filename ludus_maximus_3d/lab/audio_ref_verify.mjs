// Verifies lab/ref/audio_ref.js in real Chromium: renders every sfx + music mode through OfflineAudioContext, checks
// non-silent / no clipping / plausible duration + spectrum, prints a table, writes WAVs.
//   node ludus_maximus_3d/lab/audio_ref_verify.mjs [outDir]      (exit code 1 on any failure)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = process.argv[2] || '/tmp/claude-0/-home-user-Games/f72faaf0-df84-51f6-bada-4ecbc0262889/scratchpad/audio';
mkdirSync(outDir, { recursive: true });
let fails = 0; const bad = (m) => { fails++; console.log('FAIL', m); };

// 1) degrade-silently check in plain Node (no AudioContext)
{
  const m = await import('./ref/audio_ref.js'); const a = m.createAudio();
  const r = [a.sfx('swordHit'), a.crowd(0.5), a.music.setMode('arena'), a.music.setIntensity(1), a.setMaster(0.5), a.duck(), a.music.stop()];
  if (a.supported || r[0] !== false) bad('node degrade'); else console.log('node degrade: ok (no AudioContext, all calls are no-ops)');
  await a.unlock();
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((q, s) => { const f = join(root, normalize(decodeURIComponent(q.url.split('?')[0]))); if (!f.startsWith(root) || !existsSync(f)) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream'); s.end(readFileSync(f)); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => bad('page error ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') bad('console ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/ludus_maximus_3d/lab/audio_ref.html`);
await page.waitForFunction(() => window.__ready);

// harness inside the page
await page.evaluate(() => {
  window.__h = {
    fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const u = i + k, v = i + k + len / 2, tr = re[v] * cr - im[v] * ci, ti = re[v] * ci + im[v] * cr; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } },
    analyze(buf) {
      const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, n = L.length, m = new Float32Array(n);
      let peak = 0, clip = 0, nan = 0, dc = 0;
      for (let i = 0; i < n; i++) { const a = L[i], b = R[i]; if (!(isFinite(a) && isFinite(b))) { nan++; m[i] = 0; continue; } m[i] = (a + b) / 2; const p = Math.max(Math.abs(a), Math.abs(b)); if (p > peak) peak = p; if (p >= 0.999) clip++; dc += m[i]; }
      dc /= n;
      const hop = Math.floor(sr * 0.01), env = []; for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += m[i + k] * m[i + k]; env.push(Math.sqrt(s / hop)); }
      const thr = Math.pow(10, -50 / 20); let first = env.findIndex((v) => v > thr), last = env.length - 1; while (last > 0 && env[last] <= thr) last--;
      const active = first < 0 ? 0 : (last - first + 1) * 0.01;
      let ss = 0, cnt = 0; for (let i = 0; i < env.length; i++) if (env[i] > Math.pow(10, -40 / 20)) { ss += env[i] * env[i]; cnt++; }
      const rms = cnt ? Math.sqrt(ss / cnt) : 0;
      // spectrum around loudest 4096 window, averaged over 3 windows
      let bi = 0; for (let i = 0; i < env.length; i++) if (env[i] > env[bi]) bi = i;
      const N = 4096, bins = new Float64Array(N / 2); let wins = 0;
      for (const off of [-0.1, 0, 0.1, 0.5]) { const st = Math.max(0, Math.min(n - N, Math.floor((bi * 0.01 + off) * sr))); const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = m[st + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); window.__h.fft(re, im); for (let k = 0; k < N / 2; k++) bins[k] += re[k] * re[k] + im[k] * im[k]; wins++; }
      let tot = 0, cs = 0, lo = 0, mid = 0, hi = 0; for (let k = 1; k < N / 2; k++) { const f = k * sr / N, e = bins[k]; tot += e; cs += e * f; if (f < 250) lo += e; else if (f < 2500) mid += e; else hi += e; }
      const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
      // gaps: longest run of silence (<-55 dB) between first and last active
      let gap = 0, run = 0; for (let i = first; i <= last && first >= 0; i++) { if (env[i] < Math.pow(10, -55 / 20)) { run++; gap = Math.max(gap, run); } else run = 0; }
      // 2-second window RMS list
      const wrms = []; const w2 = Math.floor(sr * 2); for (let i = 0; i + w2 <= n; i += w2) { let s = 0; for (let k = 0; k < w2; k++) s += m[i + k] * m[i + k]; wrms.push(+db(Math.sqrt(s / w2)).toFixed(1)); }
      return { peakDb: db(peak), rmsDb: db(rms), clip, nan, dc, active, centroid: tot ? cs / tot : 0, lo: lo / tot, mid: mid / tot, hi: hi / tot, gap: gap * 0.01, wrms };
    },
    wav(buf) { const n = buf.length, ch = buf.numberOfChannels, out = new Int16Array(n * ch); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i * ch + c] = Math.max(-1, Math.min(1, d[i])) * 32767; } let s = ''; const u = new Uint8Array(out.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); },
    async render(kind, name, o) {
      const { createAudio } = await import('./ref/audio_ref.js');
      const sr = 44100; o = o || {}; const secs = o.secs || (kind === 'sfx' ? 5 : 14);
      const off = new OfflineAudioContext(2, sr * secs, sr), a = createAudio({ ctx: off, seed: o.seed == null ? 1 : o.seed, log: true });
      if (kind === 'sfx') a.sfx(name, Object.assign({ when: 0.02 }, o.opts || {}));
      else if (kind === 'crowd') a.crowd(o.level);
      else if (kind === 'music') { a.music.setIntensity(o.int == null ? 0.5 : o.int); a.music.setMode(name, { at: 0, fade: 0.05 }); if (o.switchTo) { a.music.pump(o.switchAt); a.music.setMode(o.switchTo, { at: o.switchAt, fade: o.fade || 2 }); } if (o.rampInt) { a.music.pump(secs / 2); a.music.setIntensity(o.rampInt); } a.music.pump(secs); }
      const buf = await off.startRendering(); const an = window.__h.analyze(buf);
      an.log = a.music.log ? a.music.log.filter((e) => e.what !== 'x').slice(0, 4000) : null;
      return { an, wav: o.wav === false ? null : window.__h.wav(buf), sum: Array.from(buf.getChannelData(0).filter((_, i) => i % 997 === 0)).map((v) => +v.toFixed(4)).join(',') };
    },
  };
});

const rows = []; const f1 = (x) => (+x).toFixed(1);
function save(name, b64) { if (!b64) return; const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(44100, 24); h.writeUInt32LE(44100 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); writeFileSync(join(outDir, name + '.wav'), Buffer.concat([h, pcm])); }
function check(name, an, lim) {
  const e = [];
  if (an.nan) e.push('NaN'); if (an.clip) e.push('clip x' + an.clip); if (an.peakDb < lim.minPeak) e.push('too quiet ' + f1(an.peakDb)); if (an.peakDb > lim.maxPeak) e.push('too loud ' + f1(an.peakDb));
  if (an.active < lim.minDur) e.push('too short ' + an.active); if (an.active > lim.maxDur) e.push('too long ' + an.active);
  if (an.centroid < lim.minC || an.centroid > lim.maxC) e.push('centroid ' + Math.round(an.centroid)); if (Math.abs(an.dc) > 0.02) e.push('DC ' + an.dc.toFixed(3));
  if (lim.maxGap != null && an.gap > lim.maxGap) e.push('gap ' + an.gap + 's');
  if (e.length) bad(name + ': ' + e.join(', '));
  rows.push([name, f1(an.peakDb), f1(an.rmsDb), an.active.toFixed(2), Math.round(an.centroid), (an.lo * 100).toFixed(0) + '/' + (an.mid * 100).toFixed(0) + '/' + (an.hi * 100).toFixed(0), e.length ? 'FAIL' : 'ok']);
}
const SFX = await page.evaluate(async () => (await import('./ref/audio_ref.js')).SFX_NAMES);
// expected spectral character (centroid Hz range) for a few sounds, to catch wrong-sounding regressions
const CEN = { deathThud: [100, 1500], gate: [60, 1200], swish: [800, 6000], swishHeavy: [250, 4500], uiTap: [400, 3000], coin: [900, 5000], horn: [150, 2500], stunChime: [800, 5000], healSparkle: [1000, 7000], metalClang: [500, 5000], crowdRoar: [200, 2500] };
for (const n of SFX) {
  const r = await page.evaluate(([n]) => window.__h.render('sfx', n, {}), [n]); save('sfx_' + n, r.wav);
  const c = CEN[n] || [80, 8000];
  check('sfx ' + n, r.an, { minPeak: -22, maxPeak: -3.0, minDur: 0.04, maxDur: 5, minC: c[0], maxC: c[1] });
}
// variants
for (const [label, opts] of [['grunt v0', { voice: 0 }], ['grunt v1', { voice: 1 }], ['grunt v2', { voice: 2 }], ['grunt v3', { voice: 3 }]]) {
  const r = await page.evaluate(([o]) => window.__h.render('sfx', 'grunt', { opts: o }), [opts]); save('sfx_' + label.replace(' ', '_'), r.wav);
  check('sfx ' + label, r.an, { minPeak: -24, maxPeak: -1, minDur: 0.06, maxDur: 2, minC: 200, maxC: 4000 }); (check.c = check.c || {})[label] = r.an.centroid;
}
{ const r = await page.evaluate(() => window.__h.render('sfx', 'swish', { opts: { heavy: true } })); check('sfx swish{heavy}', r.an, { minPeak: -24, maxPeak: -1, minDur: 0.1, maxDur: 2, minC: 300, maxC: 5000 }); }
for (const e of ['fire', 'lightning', 'earth', 'wind', 'holy']) { const r = await page.evaluate(([e]) => window.__h.render('sfx', 'ult', { opts: { element: e } }), [e]); check('sfx ult{' + e + '}', r.an, { minPeak: -24, maxPeak: -1, minDur: 0.5, maxDur: 5, minC: 60, maxC: 9000 }); }
if (!(check.c['grunt v0'] < check.c['grunt v3'])) bad('voice types should rise in brightness: ' + JSON.stringify(check.c));
// crowd bed at three levels
const bed = {};
for (const lv of [0.2, 0.6, 1.0]) { const r = await page.evaluate(([lv]) => window.__h.render('crowd', null, { level: lv, secs: 6 }), [lv]); save('crowd_bed_' + lv, r.wav); bed[lv] = r.an.rmsDb; check('crowd bed ' + lv, r.an, { minPeak: -40, maxPeak: -2, minDur: 5, maxDur: 7, minC: 150, maxC: 3000, maxGap: 0.1 }); }
if (!(bed[0.2] < bed[0.6] && bed[0.6] < bed[1])) bad('crowd bed not monotonic ' + JSON.stringify(bed));
// music
const mus = {};
for (const m of ['ludus', 'prep', 'victory', 'defeat']) { const r = await page.evaluate(([m]) => window.__h.render('music', m, { int: 0.5 }), [m]); save('music_' + m, r.wav); mus[m] = r; check('music ' + m, r.an, { minPeak: -24, maxPeak: -1, minDur: 12, maxDur: 15, minC: 100, maxC: 4000, maxGap: 0.6 }); }
const ar = {};
for (const i of [0, 0.5, 1]) { const r = await page.evaluate(([i]) => window.__h.render('music', 'arena', { int: i }), [i]); save('music_arena_i' + i, r.wav); ar[i] = r; check('music arena i=' + i, r.an, { minPeak: -24, maxPeak: -1, minDur: 12, maxDur: 15, minC: 100, maxC: 5000, maxGap: 0.6 }); }
if (!(ar[0].an.rmsDb < ar[0.5].an.rmsDb && ar[0.5].an.rmsDb < ar[1].an.rmsDb)) bad('arena RMS must rise with intensity: ' + [0, 0.5, 1].map((i) => f1(ar[i].an.rmsDb)));
{ const r = await page.evaluate(() => window.__h.render('music', 'arena', { int: 0, rampInt: 1, secs: 16 })); save('music_arena_ramp', r.wav); check('music arena ramp 0->1', r.an, { minPeak: -26, maxPeak: -4, minDur: 15, maxDur: 17, minC: 100, maxC: 5000, maxGap: 0.6 }); const w = r.an.wrms; if (!(w[w.length - 1] > w[0] + 2)) bad('ramp did not get louder ' + w); }
{ const r = await page.evaluate(() => window.__h.render('music', 'ludus', { int: 0.3, switchTo: 'arena', switchAt: 6, fade: 2, secs: 14 })); save('music_crossfade', r.wav); check('music crossfade ludus>arena', r.an, { minPeak: -26, maxPeak: -4, minDur: 12, maxDur: 15, minC: 100, maxC: 5000, maxGap: 0.3 }); }
// determinism + variation
const a1 = await page.evaluate(() => window.__h.render('music', 'ludus', { seed: 5, int: 0.3, secs: 20, wav: false })), a2 = await page.evaluate(() => window.__h.render('music', 'ludus', { seed: 5, int: 0.3, secs: 20, wav: false })), a3 = await page.evaluate(() => window.__h.render('music', 'ludus', { seed: 6, int: 0.3, secs: 20, wav: false }));
if (a1.sum !== a2.sum) bad('same seed must render identically'); if (a1.sum === a3.sum) bad('different seed must differ');
const sig = (log, b0, b1) => log.filter((e) => e.bar >= b0 && e.bar < b1 && (e.what === 'flute' || e.what === 'lyre')).map((e) => e.what[0] + e.step).join('');
const s1 = sig(a1.an.log, 0, 4), s2 = sig(a1.an.log, 4, 8), s3 = sig(a1.an.log, 8, 12);
if (s1 === s2 && s2 === s3) bad('music phrases repeat identically (no variation)'); else console.log('variation: phrases 0-3 / 4-7 / 8-11 differ ok');

console.log('\nname'.padEnd(26) + 'peak dB'.padStart(9) + 'rms dB'.padStart(9) + 'active s'.padStart(10) + 'centroid'.padStart(10) + '  lo/mid/hi %   result');
for (const r of rows) console.log(r[0].padEnd(25) + r[1].padStart(9) + r[2].padStart(9) + r[3].padStart(10) + String(r[4]).padStart(10) + '  ' + r[5].padEnd(12) + r[6]);
console.log(`\n${rows.length} renders, WAVs in ${outDir}, ${fails ? fails + ' FAILURES' : 'ALL OK'}`);
await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
