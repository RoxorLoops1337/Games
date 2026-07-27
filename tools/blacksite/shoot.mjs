#!/usr/bin/env node
// Screenshot rig for BLACKSITE.
//
// Serves the repo over HTTP (ES modules and importmaps do not work from
// file://), boots the game in headless Chromium, poses the camera, renders a
// fixed number of frames so every temporal effect has settled, and writes a PNG.
// Also returns everything the console said, which is how a render regression
// gets caught as a failed shader compile rather than as a dark screenshot.
//
//   node tools/blacksite/shoot.mjs --out shots/a.png --pose overlook --w 1600 --h 900
//   node tools/blacksite/shoot.mjs --list-poses
//
// Rendering is SwiftShader here, so this is slow (seconds per frame at 1600×900)
// and it is not a performance measurement — it is a look check.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.hdr': 'application/octet-stream',
};

export function serve(root = REPO) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(root, url);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end('not found: ' + url); return; }
        res.writeHead(200, {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// Named camera poses, so a critique and a fix can be compared from the exact
// same viewpoint instead of from wherever the player happened to spawn.
export const POSES = {
  spawn:    { pos: [0, 1.72, 8],     yaw: 0,     pitch: -0.03 },
  overlook: { pos: [16, 5.4, 20],    yaw: -0.62, pitch: -0.20 },
  corridor: { pos: [0, 1.72, -14],   yaw: Math.PI, pitch: 0.0 },
  sunward:  { pos: [-10, 1.72, 4],   yaw: 0.75,  pitch: 0.06 },
  backlit:  { pos: [10, 1.72, -4],   yaw: -2.4,  pitch: -0.02 },
  ground:   { pos: [4, 1.72, 4],     yaw: -0.4,  pitch: -0.55 },
  weapon:   { pos: [0, 1.72, 6],     yaw: 0.2,   pitch: -0.05, ads: 0 },
  ads:      { pos: [0, 1.72, 6],     yaw: 0.2,   pitch: -0.05, ads: 1 },
};

export async function launch(opts = {}) {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { return null; }
  const exe = findChrome();
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
      '--disable-lcd-text', '--force-device-scale-factor=1',
      '--mute-audio', '--disable-background-timer-throttling',
    ],
    ...opts,
  });
  return browser;
}

// The Playwright package pins a browser revision that may not be the one baked
// into this image, so resolve whatever is actually on disk.
export function findChrome() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base)
    .filter((d) => d.startsWith('chromium-'))
    .sort((a, b) => parseInt(b.split('-')[1], 10) - parseInt(a.split('-')[1], 10));
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function openGame(browser, port, { w = 1600, h = 900, quality = 3 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: String(e && e.stack || e) }));
  page.on('requestfailed', (r) => logs.push({ type: 'requestfailed', text: r.url() + ' ' + (r.failure() || {}).errorText }));

  await page.addInitScript((q) => {
    window.__BS_TEST__ = true;
    window.__BS_QUALITY__ = q;
    // Freeze time so every screenshot of a given pose is byte-identical between
    // runs; anything animated would otherwise make every diff a false positive.
    window.__BS_FIXED_DT__ = 1 / 60;
  }, quality);

  await page.goto(`http://127.0.0.1:${port}/blacksite/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.BLACKSITE, null, { timeout: 120000 });
  return { page, logs };
}

// Poses the camera, then renders `frames` frames. Temporal effects (TAA
// accumulation, exposure adaptation, particle warm-up) need several frames
// before a screenshot represents what a player actually sees.
export async function pose(page, name, frames = 12) {
  const p = typeof name === 'string' ? POSES[name] : name;
  if (!p) throw new Error('unknown pose: ' + name);
  await page.evaluate(async ({ p, frames }) => {
    const B = window.BLACKSITE, G = B.G;
    G.mode = 'playing';
    G.player.pos.x = p.pos[0]; G.player.pos.y = p.pos[1]; G.player.pos.z = p.pos[2];
    G.player.vel.x = G.player.vel.y = G.player.vel.z = 0;
    G.player.yaw = p.yaw; G.player.pitch = p.pitch;
    if (p.ads != null) G.player.ads = p.ads;
    G.shake.amp = 0; G.shake.t = 0;
    document.getElementById('menu').classList.remove('on');
    document.getElementById('app').classList.add('ready');
    for (let i = 0; i < frames; i++) {
      await new Promise((r) => requestAnimationFrame(() => r()));
      // Hold the pose: the sim would otherwise fall, drift or turn between frames.
      G.player.pos.x = p.pos[0]; G.player.pos.y = p.pos[1]; G.player.pos.z = p.pos[2];
      G.player.yaw = p.yaw; G.player.pitch = p.pitch;
      G.player.vel.x = G.player.vel.y = G.player.vel.z = 0;
    }
  }, { p, frames });
}

export async function shoot(page, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'png' });
  return out;
}

// A frame that is one flat colour means the pipeline produced nothing — the
// most common failure after a bad shader, and invisible to a console check.
export async function frameStats(page) {
  return page.evaluate(() => {
    const c = document.getElementById('gl');
    const t = document.createElement('canvas');
    t.width = 160; t.height = 90;
    const ctx = t.getContext('2d');
    ctx.drawImage(c, 0, 0, t.width, t.height);
    const d = ctx.getImageData(0, 0, t.width, t.height).data;
    let min = 255, max = 0, sum = 0, n = 0;
    const hist = new Array(16).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (l < min) min = l; if (l > max) max = l;
      sum += l; n++;
      hist[Math.min(15, l / 16 | 0)]++;
    }
    const mean = sum / n;
    let varr = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      varr += (l - mean) * (l - mean);
    }
    // Occupancy is how many of the 16 luminance buckets have real content in
    // them: a good frame uses most of the range, a broken one piles into one.
    const occupancy = hist.filter((v) => v > n * 0.002).length;
    return { min, max, mean, std: Math.sqrt(varr / n), occupancy, hist };
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => {
    const i = process.argv.indexOf('--' + k);
    return i > 0 ? process.argv[i + 1] : d;
  };
  if (process.argv.includes('--list-poses')) {
    console.log(Object.keys(POSES).join('\n'));
    process.exit(0);
  }
  const { server, port } = await serve();
  const browser = await launch();
  if (!browser) {
    console.error('playwright is not installed — run: npm i -D playwright-core');
    server.close(); process.exit(2);
  }
  const w = +arg('w', 1600), h = +arg('h', 900);
  const { page, logs } = await openGame(browser, port, { w, h, quality: +arg('quality', 3) });
  const poseNames = (arg('pose', 'overlook')).split(',');
  for (const name of poseNames) {
    await pose(page, name, +arg('frames', 12));
    const out = poseNames.length > 1
      ? (arg('out', 'shots/bs.png')).replace(/\.png$/, `_${name}.png`)
      : arg('out', 'shots/bs.png');
    await shoot(page, path.resolve(REPO, out));
    const st = await frameStats(page);
    console.log(`${out}  mean=${st.mean.toFixed(1)} std=${st.std.toFixed(1)} occupancy=${st.occupancy}/16`);
  }
  const bad = logs.filter((l) => l.type === 'error' || l.type === 'pageerror' || l.type === 'requestfailed');
  if (bad.length) {
    console.log('\n--- console problems ---');
    for (const b of bad.slice(0, 25)) console.log(`[${b.type}] ${b.text}`);
  }
  await browser.close();
  server.close();
  process.exit(bad.length ? 1 : 0);
}
