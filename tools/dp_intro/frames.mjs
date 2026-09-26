// Frame-step the intro renderer. Usage:
//   node frames.mjs spot 0.5 2.0 3.0 ...   -> spot_<t>.jpg
//   node frames.mjs all                    -> frames/f_0000.jpg .. f_0599.jpg
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
const { chromium } = createRequire('/home/user/Games/')('playwright-core');

const SP = '/tmp/claude-0/-home-user-Games/fbb4dcc7-2eb2-53c9-86b1-2ce4db73749f/scratchpad/intro';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 740, height: 1280 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('http://127.0.0.1:8814/intro.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.introReady && window.introReady());

async function frame(t, path, q) {
  const data = await page.evaluate(([t, q]) => window.frameJpeg(t, q), [t, q || 0.95]);
  writeFileSync(path, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
}

const mode = process.argv[2] || 'spot';
if (mode === 'spot') {
  for (const a of process.argv.slice(3)) {
    const t = parseFloat(a);
    await frame(t, `${SP}/spot_${t.toFixed(2)}.jpg`);
    console.log('spot', t);
  }
} else {
  mkdirSync(`${SP}/frames`, { recursive: true });
  const FPS = 30, N = 600;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await frame(i / FPS, `${SP}/frames/f_${String(i).padStart(4, '0')}.jpg`, 0.95);
    if (i % 100 === 0) console.log('frame', i, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  console.log('all done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
await browser.close();
