// Offline audio analysis for GRAFTWORK. Renders every sfx and music mode of graftwork/ui/audio.js through an
// OfflineAudioContext in headless chromium (Playwright) and measures what a human would hear:
// peak, loudness, clipping, DC, spectral centroid, silence, tail, clicks, masking, stacking.
// CLI: node tools/graftwork_audio_check.mjs [--json]      Library: import { runAudioCheck } from this file.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (u === '/__blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>audio</title>'); }
    const f = path.join(ROOT, path.normalize(u));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---- everything below runs inside the page ----
function pageSetup() {
  const SR = 44100;
  let seq = 0;
  const db = x => 20 * Math.log10(Math.max(1e-9, x));
  const pdb = x => 10 * Math.log10(Math.max(1e-18, x));
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  // spectral frames over m[i0..i1): returns {centroid, low:[powers], mid:[powers], tot:[powers]}
  function spectra(m, i0, i1) {
    const N = 4096, H = 2048, win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const bin = f => Math.round(f * N / SR);
    const frames = []; let maxP = 0;
    for (let s = i0; s + N <= Math.max(i1, i0 + N); s += H) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = (m[s + i] || 0) * win[i];
      fft(re, im);
      const P = new Float64Array(N / 2); let tot = 0;
      for (let k = 1; k < N / 2; k++) { P[k] = (re[k] * re[k] + im[k] * im[k]) / (N * N); tot += P[k]; }
      const band = (lo, hi) => { let a = 0; for (let k = bin(lo); k <= bin(hi); k++) a += P[k]; return a; };
      frames.push({ P, tot, low: band(30, 120), mid: band(800, 8000) }); maxP = Math.max(maxP, tot);
    }
    const acc = new Float64Array(N / 2); let used = 0;
    for (const f of frames) if (f.tot > maxP * 1e-4) { for (let k = 0; k < N / 2; k++) acc[k] += f.P[k]; used++; }
    let sw = 0, sp = 0; for (let k = 1; k < N / 2; k++) { sw += acc[k] * k * SR / N; sp += acc[k]; }
    return { centroid: sp > 0 ? sw / sp : 0, low: frames.map(f => f.low), mid: frames.map(f => f.mid), tot: frames.map(f => f.tot) };
  }
  const maxOf = a => a.reduce((x, y) => Math.max(x, y), 0);
  const meanOf = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const pctOf = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };

  function metrics(buf, t0, t1) {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const i0 = Math.floor(t0 * SR), i1 = Math.min(n, Math.floor(t1 * SR));
    const m = new Float64Array(n); for (let i = 0; i < n; i++) m[i] = (L[i] + R[i]) / 2;
    let peak = 0, clip = 0, sum = 0, sq = 0;
    for (let i = i0; i < i1; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a >= 0.999) clip++; sum += m[i]; sq += m[i] * m[i]; }
    // 5 ms window rms, last active window, loudest 100 ms
    const W = Math.floor(SR * 0.005); let last = i0, pkW = 0, pkAt = i0;
    for (let s = i0; s + W <= i1; s += W) { let q = 0; for (let i = s; i < s + W; i++) q += m[i] * m[i]; const r = Math.sqrt(q / W); if (r > 0.001) last = s + W; if (r > pkW) { pkW = r; pkAt = s; } }
    let endQ = 0; for (let i = Math.max(i0, last - W); i < last; i++) endQ += m[i] * m[i];
    const endLevel = db(Math.sqrt(endQ / W));
    let st = 0; const W2 = Math.floor(SR * 0.1);
    for (let s = i0; s + W2 <= i1; s += W2 / 2) { let q = 0; for (let i = s; i < s + W2; i++) q += m[i] * m[i]; st = Math.max(st, Math.sqrt(q / W2)); }
    let startAbs = 0; for (let i = i0; i < Math.min(i1, i0 + 22); i++) startAbs = Math.max(startAbs, Math.abs(m[i]));
    let actQ = 0, actN = Math.max(1, last - i0); for (let i = i0; i < last; i++) actQ += m[i] * m[i];
    const sp = spectra(m, i0, Math.max(last, i0 + 4096));
    return {
      peakDb: db(peak), clip, dc: sum / Math.max(1, i1 - i0), rmsDb: db(Math.sqrt(sq / Math.max(1, i1 - i0))), actRmsDb: db(Math.sqrt(actQ / actN)), stDb: db(st),
      centroid: Math.round(sp.centroid), silent: peak < 0.001, lenMs: Math.round((last - i0) / SR * 1000), tailMs: Math.max(0, Math.round((last - pkAt) / SR * 1000)),
      startAbs, endLevel, cutEnd: endLevel > -45,
      lowMaxDb: pdb(maxOf(sp.low)), lowBedDb: pdb(meanOf(sp.low)), low90Db: pdb(pctOf(sp.low, 0.9)), midMaxDb: pdb(maxOf(sp.mid)), midBedDb: pdb(meanOf(sp.mid)), mid90Db: pdb(pctOf(sp.mid, 0.9)),
    };
  }

  // fresh module instance + fresh offline context per render
  async function session(dur, setup) {
    const cbs = []; let nodes = 0;
    window.setInterval = f => { cbs.push(f); return 1; };
    window.clearInterval = () => {};
    window.__len = Math.ceil(dur * SR);
    let st = 12345 + seq; Math.random = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    window.AudioContext = class extends OfflineAudioContext {
      constructor() { super(2, window.__len, SR); window.__ctx = this; }
      get state() { return 'running'; }
      createOscillator() { nodes++; return super.createOscillator(); }
      createBufferSource() { nodes++; return super.createBufferSource(); }
    };
    const A = await import('/graftwork/ui/audio.js?r=' + (++seq));
    const ok = A.initAudio(); if (!ok) throw new Error('initAudio failed');
    const ctx = window.__ctx, pump = () => cbs.forEach(f => f());
    // suspends must be unique and land on render quanta (128 frames): collect callbacks per frame, one suspend each
    const sched = new Map();
    const at = (t, f) => { const fr = Math.round(t * SR / 128) * 128; if (!sched.has(fr)) sched.set(fr, []); sched.get(fr).push(f); };
    const api = { A, at, pump, nodes: () => nodes, cbs };
    setup(api);
    for (const fr of [...sched.keys()].sort((a, b) => a - b)) {
      if (fr <= 0 || fr >= window.__len) { sched.get(fr).forEach(f => f()); continue; }
      ctx.suspend(fr / SR).then(() => { sched.get(fr).forEach(f => f()); ctx.resume(); });
    }
    const buf = await ctx.startRendering();
    return { buf, api };
  }
  function musicPump(api, dur) { api.pump(); for (let t = 0.1; t < dur - 0.2; t += 0.1) api.at(t, api.pump); }

  window.__ac = {
    async names() { const A = await import('/graftwork/ui/audio.js?names'); return { sfx: A.SFX_NAMES.slice(), modes: A.MUSIC_MODES.slice() }; },
    async sfx(name, opts) {
      const { buf } = await session(5.5, ({ A, at }) => at(0.3, () => A.sfx(name, opts || { n: 3, len: 4 })));
      return metrics(buf, 0.3, 5.5);
    },
    async music(mode, intensity) {
      const dur = 15; const { buf } = await session(dur, api => { api.A.music(mode); if (intensity) api.A.setIntensity(intensity); musicPump(api, dur); });
      return metrics(buf, 3, dur);
    },
    async muted(mode) {
      const dur = 6; const { buf } = await session(dur, api => { api.A.mute(true); api.A.music(mode); musicPump(api, dur); api.at(0.3, () => api.A.sfx('hitCrush')); });
      return metrics(buf, 3, dur);
    },
    // names fired together at t=3 while the boss music plays; returns metrics over 3..end and the number of voices created
    async stack(names, opts) {
      const dur = 9; let n0 = 0, n1 = 0;
      const { buf, api } = await session(dur, api => {
        api.A.music('boss'); musicPump(api, dur);
        api.at(3.0, () => { n0 = api.nodes(); for (const nm of names) api.A.sfx(nm, opts || { n: 3, len: 4 }); n1 = api.nodes(); });
      });
      const m = metrics(buf, 3, dur); m.voices = n1 - n0; return m;
    },
    // heartbeat and a seam sound over each music mode, at the real bus volumes
    async mixed(mode, name) {
      const dur = 9; const { buf } = await session(dur, api => { api.A.music(mode); musicPump(api, dur); api.at(5.0, () => api.A.sfx(name, { n: 3, len: 4 })); });
      return metrics(buf, 5.0, 9);
    },
  };
}

export async function runAudioCheck() {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { return { skipped: 'playwright not installed' }; }
  const srv = await serve(); const port = srv.address().port;
  let browser;
  // Playwright's own limits are 30 s, tuned to an idle machine; a busy one needs longer. A browser that never starts or a page that never loads still fails, later.
  try { browser = await chromium.launch({ timeout: 120000 }); } catch (e) { srv.close(); return { skipped: 'chromium cannot launch: ' + String(e.message).split('\n')[0] }; }
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', e.message); });
    await page.goto(`http://127.0.0.1:${port}/__blank.html`, { timeout: 120000 });
    await page.evaluate(pageSetup);
    const { sfx, modes } = await page.evaluate(() => window.__ac.names());
    const out = { sfx: {}, music: {}, musicHot: {}, mixed: {}, stack: {}, muted: null };
    for (const n of sfx) out.sfx[n] = await page.evaluate(n => window.__ac.sfx(n), n);
    for (const m of modes) { out.music[m] = await page.evaluate(m => window.__ac.music(m, 0), m); out.musicHot[m] = await page.evaluate(m => window.__ac.music(m, 1), m); }
    const loud = Object.entries(out.sfx).sort((a, b) => b[1].stDb - a[1].stDb).map(e => e[0]);
    out.stack.top30 = await page.evaluate(n => window.__ac.stack(n), loud.slice(0, 30));
    out.stack.spam = await page.evaluate(n => window.__ac.stack(n), Array.from({ length: 30 }, () => 'hitCrush'));
    out.stack.crush5 = await page.evaluate(n => window.__ac.stack(n), ['hitCrush', 'hitHeavy', 'bossIntro', 'overload', 'bossKillThud']);
    out.muted = await page.evaluate(() => window.__ac.muted('boss'));
    out.modes = modes; out.names = sfx; out.errors = errors;
    if (errors.length) throw new Error('audio page threw ' + errors.length + ' error(s): ' + errors[0]);
    return out;
  } finally { await browser.close(); srv.close(); }
}

// masking margins in dB: the sfx's loudest band frame above the 90th percentile of the music bed in that band (both at default volumes)
export const SEAMS = ['seamExtend', 'seamCut', 'seamFray', 'seamPop', 'seamLight'];
export function masking(r, mode) {
  const o = { heartbeat: r.sfx.heartbeat.lowMaxDb - r.music[mode].low90Db };
  for (const n of SEAMS) o[n] = r.sfx[n].midMaxDb - r.music[mode].mid90Db;
  return o;
}

// ---- CLI ----
const f1 = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : String(x)).padStart(7);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let r; try { r = await runAudioCheck(); } catch (e) { console.error(String(e.message)); process.exit(1); }
  if (r.skipped) { console.log('skipped: ' + r.skipped); process.exit(0); }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  const head = 'name'.padEnd(15) + ' peakdB  stRMS actRMS centHz    lenMs tailMs clip   dc*1e4 startAbs endLvl flags';
  const flags = m => [m.silent && 'SILENT', m.clip && 'CLIP', m.peakDb > -1 && 'HOT', m.stDb < -40 && 'QUIET', m.cutEnd && 'CUT', m.startAbs > 0.03 && 'CLICK0', Math.abs(m.dc) > 0.002 && 'DC', m.centroid > 4500 && 'HARSH'].filter(Boolean).join(' ');
  const row = (n, m) => n.padEnd(15) + f1(m.peakDb) + f1(m.stDb) + f1(m.actRmsDb) + f1(m.centroid, 0) + f1(m.lenMs, 0) + f1(m.tailMs, 0) + f1(m.clip, 0) + f1(m.dc * 1e4) + f1(m.startAbs, 3) + f1(m.endLevel) + ' ' + flags(m);
  console.log('SFX\n' + head); for (const n of r.names) console.log(row(n, r.sfx[n]));
  console.log('\nMUSIC (steady state 3s on, intensity 0)\n' + head); for (const n of r.modes) console.log(row(n, r.music[n]));
  console.log('\nMUSIC intensity 1\n' + head); for (const n of r.modes) console.log(row(n, r.musicHot[n]));
  console.log('\nSTACKS (boss music + sfx fired at once)\n' + head); for (const k of Object.keys(r.stack)) console.log(row(k, r.stack[k]) + '  voices=' + r.stack[k].voices);
  console.log('\nMASKING (sfx band max minus music bed 90th percentile, dB; need >= 6)');
  for (const m of r.modes) console.log(m.padEnd(10) + ' heartbeat low ' + f1(masking(r, m).heartbeat) + ' | seam mid ' + SEAMS.map(n => n + ' ' + f1(masking(r, m)[n])).join(' | '));
  console.log('\nmuted boss peak dB ' + r.muted.peakDb.toFixed(1));
}
