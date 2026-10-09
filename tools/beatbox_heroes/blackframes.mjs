// Black-frame probe for Beatbox Heroes 3D (owner PERF). Runs the REAL game (?r=3d) in headless Chromium + swiftshader and samples the visible composite on EVERY animation frame:
//   a readback of #gl (composited over the #glwrap background) while body.r3, else of the 2D #cv, plus whether an opaque DOM cover is up (#fade, #boot3 splash, an opaque full-screen panel, the 2D fade).
//   Logs every frame that is near-black or flat dark while NO opaque cover is up (scene, world, post rung, ms), every long frame (> 50 ms), and the frame time per world.
//   node tools/beatbox_heroes/blackframes.mjs [--route full|short] [--q low|med|high] [--view mobile|desktop|both] [--dist] [--json out.json] [--timing] [--extra '&perf=0']
//     --timing: no readback (frame intervals per world only, for before/after numbers);  --extra: more query string, e.g. '&perf=0' turns the host's PERF pacing off for an A/B run
//     default: full route, q=med (so the post chain and its blank-frame guard run), both viewports, served from the source tree with a fresh ESM build (--dist serves dist/beatbox_heroes).
//   The probe page uses ?preserve=1 (preserveDrawingBuffer) ONLY so the readback sees what the compositor shows; nothing else changes.
// Also exported for tests/beatbox_heroes_r3frames.test.mjs:  probeRun(env, { route, q, view }) -> report
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..', '..');
export const VIEWS = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ the in-page sampler (installed by addInitScript, started by __BF.start())
export const SAMPLER = `(() => {
  const BF = window.__BF = { on: false, n: 0, dark: [], long: [], worlds: {}, covered: 0, last: 0, step: '' };
  let c = null, g = null;
  const SW = 24, SH = 42;
  function coverAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if (el.id === 'gl' || el.id === 'glwrap' || el.id === 'cv') return false;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.97) continue;
      const m = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor || ''); const a = m ? (m[1].split(',')[3] === undefined ? 1 : +m[1].split(',')[3]) : 0;
      if (a >= 0.97 || (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage))) return el.id || el.className || el.tagName;
    }
    return false;
  }
  function covers() {
    const B = window.BBH, E = B && B.Eng, r3 = document.body.classList.contains('r3');
    const fade = document.getElementById('fade'), boot = document.getElementById('boot3');
    // a scene fade at 60 %+ is an intentional dip to the theme colour (a world switch, the intro between plates), not a glitch
    if (r3 && fade && getComputedStyle(fade).display !== 'none' && +fade.style.opacity >= 0.6) return 'fade';
    if (!r3 && E && E.fadeLevel && E.fadeLevel() >= 0.6) return 'fade2d';
    if (boot && boot.style.display !== 'none' && !boot.classList.contains('off') && !boot.classList.contains('chip')) return 'boot3';
    const box = (r3 ? document.getElementById('glwrap') : document.getElementById('cv')).getBoundingClientRect();
    const pts = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.7]]; let who = null;
    for (const p of pts) { const k = coverAt(box.left + box.width * p[0], box.top + box.height * p[1]); if (!k) return null; who = k; }
    return who;
  }
  function sample() {
    const r3 = document.body.classList.contains('r3'), src = document.getElementById(r3 ? 'gl' : 'cv'); if (!src) return null;
    if (!c) { c = document.createElement('canvas'); c.width = SW; c.height = SH; g = c.getContext('2d', { willReadFrequently: true }); }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#120d1f'; g.fillRect(0, 0, SW, SH);
    try { g.drawImage(src, 0, 0, SW, SH); } catch (e) { return null; }
    const d = g.getImageData(0, 0, SW, SH).data; let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += l; s2 += l * l; n++; }
    const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean)); return { mean, sd, r3 };
  }
  function info() {
    const B = window.BBH, E = B && B.Eng, R = B && B.R3, w = R && R.world; let rung = null;
    try { const h = R && R.host; rung = h && h.shared && h.shared.post ? h.shared.post.stats.rung : null; } catch (e) { /* ignore */ }
    return { scene: E ? E.sceneName : '', world: w ? w.id : null, rung, q: R ? R.quality : null };
  }
  function loop(now) {
    if (!BF.on) return; requestAnimationFrame(loop);
    const dt = BF.last ? now - BF.last : 0; BF.last = now; BF.n++;
    const inf = info(), key = (document.body.classList.contains('r3') ? (inf.world || 'none') : '2d:' + inf.scene);
    const W = BF.worlds[key] = BF.worlds[key] || { dts: [] }; if (dt > 0 && W.dts.length < 4000) W.dts.push(dt);
    if (dt > 50) BF.long.push({ t: Math.round(now), dt: Math.round(dt), scene: inf.scene, world: inf.world, step: BF.step });
    if (BF.timing) return;   // timing runs: no readback (it stalls the GPU), frame intervals only
    const s = sample(); if (!s) return;
    const black = s.mean < 12, flat = s.mean < 40 && s.sd < 3;
    if (black || flat) {
      const cov = covers(); if (cov) { BF.covered++; return; }
      BF.dark.push({ t: Math.round(now), mean: +s.mean.toFixed(1), sd: +s.sd.toFixed(1), kind: black ? 'black' : 'flat', r3: s.r3, scene: inf.scene, world: inf.world, rung: inf.rung, q: inf.q, step: BF.step,
        fade: (document.getElementById('fade') || {}).style ? document.getElementById('fade').style.opacity : '', ready: !!(window.BBH && BBH.Eng.scene && BBH.Eng.scene.w) });
    }
  }
  BF.start = () => { if (BF.on) return; BF.on = true; BF.last = 0; requestAnimationFrame(loop); };
  BF.stop = () => { BF.on = false; };
})();`;

// ------------------------------------------------------------------ route steps
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 120000 }).then(() => true, () => false);
const ready = (page, name, world, ms) => until(page, ([n, w]) => BBH.Eng.sceneName === n && BBH.Eng.scene && (w === null ? !BBH.Eng.scene.is3d : BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === w && BBH.Eng.scene.w === BBH.R3.world) && BBH.Eng.scene.t > 0 && !BBH.Eng.pendingSwitch, [name, world], ms);
const step = (page, name) => page.evaluate((n) => { window.__BF.step = n; }, name);
const adv = (page, sec) => page.evaluate((s) => { const w = BBH.R3.world; if (w && w.controls && w.controls.advance) w.controls.advance(s); }, sec).catch(() => {});
async function skipDialogs(page) { for (let i = 0; i < 25; i++) { const n = await page.evaluate(() => { const b = document.querySelector('#r3kit .k3-dlg'); if (b) { b.click(); return 1; } return 0; }); if (!n) return; await sleep(220); } }
async function clickText(page, sel, txt) { await page.locator(sel, { hasText: txt }).first().click({ timeout: 20000 }); }
async function dwell(page, ms) { const t = Date.now(); while (Date.now() - t < ms) { await adv(page, 0.4); await sleep(250); } }
const seedChar = (page) => page.evaluate(() => {
  const ch = BBH.Core.clone(BBH.G.ch); ch.day = 3; ch.minutes = 13 * 60 - 360; ch.cash = 400; ch.level = 6; ch.energy = ch.maxEnergy; ch.hunger = 90; ch.mood = 90; ch.flags.intro = 1;
  for (const p of ['home', 'park', 'shop', 'studio', 'bar']) ch.flags['visited_' + p] = 1; BBH.G.setChar(ch);
});
async function enter(page, id, world) { await page.evaluate((id) => { BBH.G.enterPlace(id); }, id); return ready(page, 'place', world); }
async function toStreet(page) { await page.evaluate(() => { if (BBH.Eng.scene && BBH.Eng.scene.leave2) BBH.Eng.scene.leave2(); else BBH.Eng.go('street'); }); return ready(page, 'street', 'street'); }

export const ROUTES = {
  // title -> new game -> creator -> intro skip -> street -> home -> street -> park -> busk (rhythm) -> back -> shop -> bar -> map
  async full(page, log) {
    await step(page, 'title'); await dwell(page, 2500);
    await page.mouse.click(Math.round(page.viewportSize().width / 2), Math.round(page.viewportSize().height / 2)); await sleep(500);
    await step(page, 'slots'); await clickText(page, '#ui .btn', 'NEW GAME'); log('slots', await ready(page, 'slots', 'title')); await sleep(700);
    await step(page, 'creator'); await page.locator('#ui .panel').first().click(); log('creator', await ready(page, 'creator', 'creator')); await dwell(page, 2000);
    await page.locator('#ui input[type=text]').fill('Nova'); await sleep(300); await clickText(page, '#ui .btn', 'GO!');
    // the intro is the 3D opening film (r3/cine.js) when films are on, else the 2D plates: either way its SKIP ends it
    await step(page, 'intro'); log('intro', await until(page, () => BBH.Eng.sceneName === 'intro' && BBH.Eng.scene && BBH.Eng.scene.t > 0, null, 120000)); await sleep(2500);
    await page.evaluate(() => { const b = document.querySelector('.cin .cin-skip') || [...document.querySelectorAll('#ui .btn')].find((x) => x.textContent.trim() === 'SKIP'); if (b) b.click(); });
    await step(page, 'street'); log('street', await ready(page, 'street', 'street', 240000)); await sleep(800); await skipDialogs(page);
    await page.locator('#ui .btn', { hasText: 'GOT IT' }).first().click({ timeout: 8000 }).catch(() => {}); await seedChar(page); await dwell(page, 1500);
    await ROUTES.loop(page, log);
  },
  // the hub loop alone (title -> street via a seeded save, then the places)
  async loop(page, log) {
    if (await page.evaluate(() => BBH.Eng.sceneName) === 'title') {
      await page.evaluate(() => { const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.name = 'Zed'; BBH.G.slot = 1; BBH.G.setChar(ch); });
      await seedChar(page); await step(page, 'street'); await page.evaluate(() => BBH.Eng.go('street')); log('street', await ready(page, 'street', 'street')); await dwell(page, 1500);
    }
    await step(page, 'home'); log('home', await enter(page, 'home', 'flat')); await dwell(page, 1500);
    await step(page, 'street2'); log('street2', await toStreet(page)); await dwell(page, 1200);
    await step(page, 'park'); log('park', await enter(page, 'park', 'park')); await dwell(page, 1500);
    await step(page, 'rhythm'); await page.evaluate(() => BBH.G.places.startPerform(BBH.Eng.scene, 'busk', { title: 'BUSKING', sub: 'park', bpm: 96, bars: 4, difficulty: 0.2, style: 0, stage: 'cyan', tip: false }));
    log('rhythm', await ready(page, 'rhythm', 'rhythm')); await sleep(2500);
    await step(page, 'park2'); await page.evaluate(() => { const s = BBH.Eng.scene; if (s && s.a && s.a.onAbort) s.a.onAbort(); }); log('park2', await ready(page, 'place', 'park')); await dwell(page, 1000);
    await step(page, 'street3'); log('street3', await toStreet(page)); await dwell(page, 800);
    await step(page, 'shop'); log('shop', await enter(page, 'shop', 'shop')); await dwell(page, 1200);
    await step(page, 'street4'); log('street4', await toStreet(page));
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.minutes = 20 * 60 + 30 - 360; BBH.G.setChar(ch); }); await dwell(page, 800);   // night: the bar is open, the street and the map go dark
    await step(page, 'bar'); log('bar', await enter(page, 'bar', 'bar')); await dwell(page, 1500);
    await step(page, 'map'); await page.evaluate(() => BBH.Eng.go('map')); log('map', await ready(page, 'map', 'hood')); await dwell(page, 1500);
  },
  // short gate route for the test: title -> street -> home -> street -> park
  async short(page, log) {
    await step(page, 'title'); await dwell(page, 1500);
    await page.evaluate(() => { const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.name = 'Zed'; BBH.G.slot = 1; BBH.G.setChar(ch); });
    await seedChar(page); await step(page, 'street'); await page.evaluate(() => BBH.Eng.go('street')); log('street', await ready(page, 'street', 'street')); await dwell(page, 1200);
    await step(page, 'home'); log('home', await enter(page, 'home', 'flat')); await dwell(page, 1200);
    await step(page, 'street2'); log('street2', await toStreet(page)); await dwell(page, 800);
    await step(page, 'park'); log('park', await enter(page, 'park', 'park')); await dwell(page, 1200);
    await step(page, 'resize'); await page.setViewportSize({ width: page.viewportSize().width - 20, height: page.viewportSize().height - 40 }); await dwell(page, 800);
  },
};

function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

// one probe run on one viewport: returns { view, q, steps, dark[], long[], covered, frames, worlds: {id: {frames, median, p95}}, errs[] }
export async function probeRun(env, o) {
  o = o || {}; const view = o.view || 'mobile', q = o.q || 'med', route = o.route || 'full', extra = o.extra || '';
  const ctx = await env.browser.newContext(VIEWS[view]); const page = await ctx.newPage(), errs = [], steps = {};
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); if (m.type() === 'warning' && /blank frame/.test(m.text())) errs.push('warn: ' + m.text()); });
  await page.addInitScript(SAMPLER);
  await page.goto(env.url('index.html?r=3d&q=' + q + (o.timing ? '' : '&preserve=1') + extra));
  await page.waitForFunction(() => window.__BF && window.BBH && BBH.Eng && document.body, null, { timeout: 60000 });
  await page.evaluate((t) => { window.__BF.timing = !!t; window.__BF.start(); }, !!o.timing);   // from the very first frames: the boot splash and the title reveal are sampled too
  const booted = await until(page, () => BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.t > 0, null, 180000);
  steps.boot = booted;
  try { if (booted) await ROUTES[route](page, (k, v) => { steps[k] = v; }); } catch (e) { errs.push('route: ' + (e && e.message)); }
  // deterministic resize checks on the last 3D scene (a real phone fires resize / orientationchange between frames, and the low tier's 30 fps cap skips every other frame,
  // so whatever the canvas holds right after the event can be what the compositor shows): sample synchronously right after R3.resize at the same size and at a new size
  const rz = o.timing ? null : await page.evaluate(() => {
    const R = BBH.R3, h = R.host; if (!R.active || !h || !h.world) return null; const g = document.getElementById('gl'), c = document.createElement('canvas'); c.width = 12; c.height = 20; const x = c.getContext('2d');
    const lum = () => { x.fillStyle = '#120d1f'; x.fillRect(0, 0, 12, 20); x.drawImage(g, 0, 0, 12, 20); const d = x.getImageData(0, 0, 12, 20).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return s / (d.length / 4); };
    const base = lum(); R.resize(); const same = lum(); const b = R._.S.box; h.resize(b.w - 8, b.h - 8); const changed = lum(); R.resize(); const back = lum();
    return { base: Math.round(base), same: Math.round(same), changed: Math.round(changed), back: Math.round(back), cleared: [same, changed, back].filter((v) => v < 30 && base >= 40).length };
  }).catch(() => null);
  await sleep(300);
  const bf = await page.evaluate(() => { window.__BF.stop(); const B = window.__BF; return { n: B.n, dark: B.dark, long: B.long, covered: B.covered, worlds: B.worlds, rung: BBH.R3.host && BBH.R3.host.shared.post ? BBH.R3.host.shared.post.stats : null, status: BBH.R3.status }; });
  await ctx.close();
  const worlds = {}; for (const k in bf.worlds) { const d = bf.worlds[k].dts; if (d.length < 3) continue; const s = d.slice().sort((x, y) => x - y); worlds[k] = { frames: d.length, median: Math.round(median(d)), p95: Math.round(s[Math.floor(s.length * 0.95)]) }; }
  return { view, q, route, timing: !!o.timing, extra, resize: rz, steps, frames: bf.n, dark: bf.dark, long: bf.long, covered: bf.covered, worlds, post: bf.rung, status: bf.status, errs };
}

export function summarize(r) {
  const lines = [];
  lines.push(`[${r.view} q=${r.q} ${r.route}${r.timing ? ' timing' : ''}${r.extra ? ' ' + r.extra : ''}] frames ${r.frames}, uncovered dark ${r.dark.length}, covered dark ${r.covered}, long (>50 ms) ${r.long.length}, status ${r.status}, post rung ${r.post ? r.post.rung : '-'} builds ${r.post ? r.post.builds : '-'}`);
  if (r.resize) lines.push('  resize readback (mean lum: base/same/changed/back): ' + [r.resize.base, r.resize.same, r.resize.changed, r.resize.back].join('/') + ' -> cleared frames ' + r.resize.cleared);
  lines.push('  steps: ' + Object.entries(r.steps).map(([k, v]) => k + (v ? '' : '(FAIL)')).join(' '));
  lines.push('  frame ms (median/p95): ' + Object.entries(r.worlds).map(([k, v]) => `${k} ${v.median}/${v.p95} (${v.frames})`).join(', '));
  const byStep = {}; r.dark.forEach((d) => { const k = d.step + ':' + d.scene + '/' + (d.world || '-') + ':' + d.kind; byStep[k] = (byStep[k] || 0) + 1; });
  if (r.dark.length) lines.push('  dark by step: ' + Object.entries(byStep).map(([k, v]) => k + ' x' + v).join(', '));
  r.dark.slice(0, 12).forEach((d) => lines.push('    ' + JSON.stringify(d)));
  const longBy = {}; r.long.forEach((d) => { const k = d.step; longBy[k] = longBy[k] || { n: 0, max: 0 }; longBy[k].n++; longBy[k].max = Math.max(longBy[k].max, d.dt); });
  lines.push('  long by step: ' + Object.entries(longBy).map(([k, v]) => `${k} ${v.n} (max ${v.max})`).join(', '));
  if (r.errs.length) lines.push('  errors: ' + r.errs.slice(0, 6).join(' | '));
  return lines.join('\n');
}

// ------------------------------------------------------------------ CLI
async function main() {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const views = opt('view', 'both') === 'both' ? ['mobile', 'desktop'] : [opt('view')];
  let env;
  if (argv.includes('--dist')) {   // serve the built site as deployed
    const root = path.join(REPO, 'dist', 'beatbox_heroes'); if (!fs.existsSync(root)) { console.error('no dist/beatbox_heroes: run npm run build'); process.exit(1); }
    const { createRequire } = await import('node:module'); const { chromium } = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core'));
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
    const server = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    env = { browser, url: (q) => 'http://127.0.0.1:' + server.address().port + '/' + q, stop: async () => { await browser.close(); server.close(); } };
  } else {
    const { r3env } = await import(pathToFileURL(path.join(REPO, 'tests', 'beatbox_heroes_r3lib.mjs')).href); env = await r3env('blackframes');
  }
  const out = [];
  try { for (const v of views) { const r = await probeRun(env, { view: v, q: opt('q', 'med'), route: opt('route', 'full'), timing: argv.includes('--timing'), extra: opt('extra', '') }); out.push(r); console.log(summarize(r)); } }
  finally { await env.stop(); }
  if (opt('json', '')) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
  process.exit(out.some((r) => r.dark.length) ? 2 : 0);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
