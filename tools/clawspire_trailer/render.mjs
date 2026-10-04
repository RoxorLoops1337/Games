// Frame-step the Clawspire 2.0 trailer through headless Chromium.
//
//   node tools/clawspire_trailer/render.mjs spot 1.0 2.5 ...         -> <out>/spot_<t>.jpg
//   node tools/clawspire_trailer/render.mjs sheet 0 25 0.25 [name]    -> <out>/<name>.jpg (contact sheet)
//   node tools/clawspire_trailer/render.mjs frames [from] [to] [step] -> <out>/frames/f_NNNN.jpg
//   node tools/clawspire_trailer/render.mjs bench                      -> ms per frame
//
// Env: CLAW_OUT (default ./trailer_out/clawspire, git-ignored), CLAW_FMT=v for the
// vertical cut, CLAW_SCALE=0.25 for low-res previews, CLAW_FOOTAGE (the capture
// folder: <id>/f_00000.jpg + meta.json), CLAW_SCRATCH (placeholder stills root).
// One browser, one worker: SwiftShader already spreads a frame over every core.
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const req = createRequire(REPO + '/');
let chromium;
try { ({ chromium } = req('playwright-core')); } catch (e) { ({ chromium } = createRequire('/opt/node22/lib/node_modules/playwright/')('playwright-core')); }
const SCRATCH = process.env.CLAW_SCRATCH || '/tmp/claude-0/-home-user-Games/81b8cd0d-4b44-5ff7-8915-74ba3cb2ca84/scratchpad';
const FOOTAGE = process.env.CLAW_FOOTAGE || join(SCRATCH, 'clawtrailer', 'footage');
const FMT = process.env.CLAW_FMT || 'h';
const SCALE = +(process.env.CLAW_SCALE || 1);
const OUT = process.env.CLAW_OUT || join(REPO, 'trailer_out', 'clawspire' + (FMT === 'v' ? '_v' : ''));
const CHROME = process.env.CLAW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FPS = 60, DUR = 25, N = FPS * DUR;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp4': 'video/mp4' };

function serve() {
  return new Promise(res => {
    const srv = createServer((q, r) => {
      const url = decodeURIComponent(q.url.split('?')[0].split('#')[0]);
      let root = REPO, rel = url;
      if (url.startsWith('/__footage/')) { root = FOOTAGE; rel = url.slice('/__footage'.length); }
      else if (url.startsWith('/__scratch/')) { root = SCRATCH; rel = url.slice('/__scratch'.length); }
      const p = join(root, rel);
      if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      r.end(readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(srv) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=3072'] });
  const vw = FMT === 'v' ? 1080 : 1920, vh = FMT === 'v' ? 1920 : 1080;
  const page = await browser.newPage({ viewport: { width: Math.round(vw * SCALE), height: Math.round(vh * SCALE) } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { const x = m.text(); if ((m.type() === 'error' && !/404/.test(x)) || (m.type() === 'warning' && !/frame load failed/.test(x))) console.log('CONSOLE', x); });
  const qs = `?fmt=${FMT}&scale=${SCALE}`;
  await page.goto(`http://127.0.0.1:${srv.address().port}/tools/clawspire_trailer/trailer.html${qs}#render`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.trailerReady === true, null, { timeout: 120000 });
  const real = await page.evaluate(() => window.SCENES_REAL);
  console.log('real footage:', real.length ? real.join(' ') : '(none, placeholders only)');
  return { browser, page };
}

async function frame(page, t, path, q = 0.95) {
  const data = await page.evaluate(([t, q]) => window.frameJpeg(t, q), [t, q]);
  writeFileSync(path, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
}

const mode = process.argv[2] || 'spot';
mkdirSync(OUT, { recursive: true });
const srv = await serve();
const { browser, page } = await openPage(srv);
try {
  if (mode === 'spot') {
    for (const a of process.argv.slice(3)) {
      const t = parseFloat(a);
      await frame(page, t, join(OUT, `spot_${t.toFixed(3)}.jpg`));
      console.log('spot', t);
    }
  } else if (mode === 'sheet') {
    const [a, c, step] = process.argv.slice(3, 6).map(Number);
    const ts = []; for (let t = a; t <= c + 1e-6; t += step) ts.push(+t.toFixed(4));
    const name = process.argv[6] || 'sheet';
    const t0 = Date.now();
    const data = await page.evaluate(async (ts) => window.contactSheet(ts), ts);
    writeFileSync(join(OUT, name + '.jpg'), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
    console.log('sheet', ts.length, 'frames ->', join(OUT, name + '.jpg'), ((Date.now() - t0) / 1000).toFixed(1) + 's');
  } else if (mode === 'frames') {
    const from = +(process.argv[3] || 0), to = +(process.argv[4] || N), step = +(process.argv[5] || 1);
    const dir = join(OUT, process.env.CLAW_FRAMES || 'frames');
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    let done = 0;
    for (let i = from; i < to; i += step) {
      const p = join(dir, `f_${String(i).padStart(4, '0')}.jpg`);
      if (process.env.CLAW_RESUME && existsSync(p)) continue;
      await frame(page, i / FPS, p);
      if (++done % 30 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`frame ${i}/${to}`, el.toFixed(1) + 's', (el / done).toFixed(2) + 's/f');
      }
    }
    console.log(`[${from}-${to}/${step}] done`, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  } else if (mode === 'bench') {
    const at = +(process.argv[3] || 3);
    await page.evaluate(t => window.frameJpeg(t, .95), at);
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) await page.evaluate(t => window.frameJpeg(t, .95), at + i / 60);
    console.log('ms/frame at', at, (Date.now() - t0) / 20);
  }
} finally {
  await browser.close();
  srv.close();
}
