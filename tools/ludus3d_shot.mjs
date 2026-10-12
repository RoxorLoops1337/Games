// Ludus Maximus 3D: deterministic multi-shot capture. Software GL is slow, so time is stepped with window.__LM3D.advance().
//   node tools/ludus3d_shot.mjs "<url>" <outPrefix> [--w 1100] [--h 650] [--at 1,3,6] [--eval "js before"] [--dpr 1]
// Writes <outPrefix>_<t>.png for every time in --at (seconds of game time, cumulative). Prints console errors and renderer stats.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const a = process.argv.slice(2), url = a[0], out = a[1], opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const W = +opt('w', 1100), H = +opt('h', 650), at = opt('at', '1').split(',').map(Number), pre = opt('eval', '');
const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +opt('dpr', 1) });
let errs = 0; page.on('pageerror', (e) => { errs++; console.log('PAGE ERROR', e.message.slice(0, 500)); });
page.on('console', (m) => { if (m.type() === 'error') { errs++; console.log('CONSOLE', m.text().slice(0, 400)); } });
await page.goto(url); await page.waitForFunction(() => window.__LM3D, null, { timeout: 60000 });
await page.evaluate(() => { document.querySelectorAll('canvas').length; });
if (pre) await page.evaluate(pre);
let t = 0;
for (const target of at) {
  const dt = target - t; t = target;
  const st = await page.evaluate((s) => (s > 0 ? window.__LM3D.advance(s) : window.__LM3D.stats()), dt);
  const f = `${out}_${String(target).replace('.', 'p')}.png`; await page.screenshot({ path: f, timeout: 240000 });
  console.log('shot', f, JSON.stringify(st));
}
console.log(errs ? errs + ' errors' : 'ok'); await browser.close();
