// Frame-step the trailer page through headless Chromium.
//
//   node tools/nrfh_trailer/render.mjs spot 1.0 2.5 ...     -> <out>/spot_<t>.jpg
//   node tools/nrfh_trailer/render.mjs sheet 0 15 0.5        -> <out>/sheet.jpg (contact sheet)
//   node tools/nrfh_trailer/render.mjs frames [from] [to] [step] -> <out>/frames/f_NNNN.jpg
//   node tools/nrfh_trailer/render.mjs all                   -> frames in parallel workers
//
// OUT defaults to ./trailer_out (git-ignored); override with NRFH_OUT=/path.
// Serves the repo root on a private port so the page can read the game's art
// same-origin (canvas stays untainted).
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const { chromium } = createRequire(REPO + '/')('playwright-core');
const OUT = process.env.NRFH_OUT || join(REPO, 'trailer_out');
const FPS = 60, DUR = 15, N = FPS * DUR;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.wav': 'audio/wav' };

function serve() {
  return new Promise(res => {
    const srv = createServer((q, r) => {
      const p = join(REPO, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
      if (!p.startsWith(REPO) || !existsSync(p) || statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
      r.end(readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(srv) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/tools/nrfh_trailer/trailer.html#render`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.trailerReady === true, null, { timeout: 60000 });
  return { browser, page };
}

async function frame(page, t, path, q = 0.96) {
  const data = await page.evaluate(([t, q]) => window.frameJpeg(t, q), [t, q]);
  writeFileSync(path, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
}

const mode = process.argv[2] || 'spot';
mkdirSync(OUT, { recursive: true });

if (mode === 'all') {
  // split the reel across worker processes (each its own browser)
  // one worker by default: SwiftShader already spreads a frame over every core, so
  // extra browsers just thrash each other (3 workers measured 3x SLOWER in total)
  const WORKERS = +(process.env.NRFH_WORKERS || 1);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => new Promise((res, rej) => {
    // interleave (frame i goes to worker i % WORKERS) so the heavy shots are shared
    const c = fork(fileURLToPath(import.meta.url), ['frames', String(w), String(N), String(WORKERS)], { stdio: 'inherit' });
    c.on('exit', code => code === 0 ? res() : rej(new Error('worker ' + w + ' exit ' + code)));
  })));
  console.log('all frames', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  process.exit(0);
}

const srv = await serve();
const { browser, page } = await openPage(srv);
try {
  if (mode === 'spot') {
    for (const a of process.argv.slice(3)) {
      const t = parseFloat(a);
      await frame(page, t, join(OUT, `spot_${t.toFixed(2)}.jpg`));
      console.log('spot', t);
    }
  } else if (mode === 'sheet') {
    const [a, b, step] = process.argv.slice(3).map(Number);
    const ts = []; for (let t = a; t <= b + 1e-6; t += step) ts.push(+t.toFixed(4));
    const data = await page.evaluate(async (ts) => window.contactSheet(ts), ts);
    const name = process.argv[6] || 'sheet';
    writeFileSync(join(OUT, name + '.jpg'), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
    console.log('sheet', ts.length, 'frames ->', join(OUT, name + '.jpg'));
  } else if (mode === 'frames') {
    const from = +(process.argv[3] || 0), to = +(process.argv[4] || N), step = +(process.argv[5] || 1);
    mkdirSync(join(OUT, 'frames'), { recursive: true });
    const t0 = Date.now();
    let done = 0;
    for (let i = from; i < to; i += step) {
      await frame(page, i / FPS, join(OUT, 'frames', `f_${String(i).padStart(4, '0')}.jpg`));
      if (++done % 30 === 0) console.log(`[${from}-${to}/${step}] frame ${i}`, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
    console.log(`[${from}-${to}] done`, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  } else if (mode === 'bench') {
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) await page.evaluate(t => window.frameJpeg(t, .96), 3 + i / 60);
    console.log('ms/frame', (Date.now() - t0) / 20);
  }
} finally {
  await browser.close();
  srv.close();
}
