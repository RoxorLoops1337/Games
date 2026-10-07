// Shared harness for the Beatbox Heroes r3 browser suites (r3boot, r3fallback). Not a test itself.
//   const env = await r3env('beatbox_heroes_r3boot');      // exits 0 (SKIPPED) when playwright-core or Chromium is missing, unless BBH_BROWSER=1
//   env.url('index.html?r=3d&q=low')     http URL on a private static server that serves beatbox_heroes/ with a FRESH esbuild ESM build of park3d overlaid on /r3/entry.js and /r3/p3-*.js
//   env.fileUrl('index.html?r=3d')       file:// URL of a private copy of the game with a fresh IIFE bundle (ES modules cannot load over file://, so the game uses the IIFE there)
//   env.newPage(opts) -> { page, errs }  errs collects pageerror + console.error (favicon is answered with 204)
//   env.stop()                           closes browser and server
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..'), SRC = path.join(REPO, 'beatbox_heroes');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/plain' };

export async function r3env(suite, extraArgs) {
  const REQUIRED = process.env.BBH_BROWSER === '1';
  const skip = (why) => { console.log(suite + ': SKIPPED, ' + why); if (REQUIRED) { console.log(suite + ': 0 passed, 1 failed'); process.exit(1); } console.log(suite + ': 0 passed, 0 failed'); process.exit(0); };
  let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'r3env_'));
  const esm = path.join(tmp, 'esm'), site = path.join(tmp, 'site');
  execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--esm', '--out', esm], { stdio: 'pipe' });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const f = /^\/r3\/(entry\.js|p3-[\w.-]+\.js)$/.test(p) ? path.join(esm, p.slice(4)) : path.join(SRC, p);
    if (!f.startsWith(SRC) && !f.startsWith(esm) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  let siteReady = false;
  const buildSite = () => {   // file:// copy (no park3d sources) with a fresh IIFE bundle
    if (siteReady) return; siteReady = true;
    fs.cpSync(SRC, site, { recursive: true, filter: (s) => !s.startsWith(path.join(SRC, 'park3d') + path.sep) && path.basename(s) !== 'park3d' });
    execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--out', path.join(site, 'park3d.bundle.js')], { stdio: 'pipe' });
  };
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'].concat(extraArgs || []) });
  const env = {
    REPO, tmp, browser, port,
    url: (q) => 'http://127.0.0.1:' + port + '/' + q,
    fileUrl: (q) => { buildSite(); const [f, qs] = q.split('?'); return pathToFileURL(path.join(site, f)).href + (qs ? '?' + qs : ''); },
    async newPage(o) {
      o = o || {}; const ctx = await browser.newContext({ viewport: o.viewport || { width: 360, height: 640 } }), page = await ctx.newPage(), errs = [];
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
      if (o.init) await page.addInitScript(o.init);
      return { page, errs, ctx };
    },
    async stop() { try { await browser.close(); } catch (e) { /* ignore */ } server.close(); },
  };
  return env;
}
