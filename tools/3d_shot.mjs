// Deterministic WebGL screenshot of a 3D lab page or the game (software GL in CI containers).
//   node tools/3d_shot.mjs <url> <out.png> [--w 1000] [--h 700] [--secs 1.5] [--eval "js to run first"] [--wait ms]
// With a lab page it calls __labShot(secs); otherwise it just waits. Prints console errors and render stats.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const a = process.argv.slice(2), url = a[0], out = a[1], opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const W = +opt('w', 1000), H = +opt('h', 700), secs = +opt('secs', 1.5), wait = +opt('wait', 800), pre = opt('eval', '');
const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +opt('dpr', 1) });
let errs = 0; page.on('pageerror', (e) => { errs++; console.log('PAGE ERROR', e.message.slice(0, 400)); });
page.on('console', (m) => { if (m.type() === 'error') { errs++; console.log('CONSOLE', m.text().slice(0, 300)); } });
await page.goto(url); await page.waitForTimeout(wait);
await page.evaluate(async () => { if (window.__labReady) await window.__labReady; }).catch(() => {});
if (pre) await page.evaluate(pre);
const info = await page.evaluate((s) => (window.__labShot ? window.__labShot(s) : null), secs);
const stat = await page.evaluate(() => window.__stat || null); if (stat) console.log('STAT', JSON.stringify(stat));
await page.screenshot({ path: out }); console.log('shot', out, JSON.stringify(info), errs ? errs + ' errors' : 'ok');
await browser.close();
