// Screenshot the real Beatbox Heroes page in headless Chromium.
//   node tools/beatbox_heroes/shot.mjs <outDir> <steps.json> [--w 540] [--h 960] [--dpr 1]
// steps.json: [{ "name":"title", "js":"...evaluated in page...", "wait":800, "click":[x,y] (logical 270x480) }, ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..', '..');
const { chromium } = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core'));
const [outDir, stepsFile, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const W = +opt('w', 540), H = +opt('h', 960), DPR = +opt('dpr', 1);
fs.mkdirSync(outDir, { recursive: true });
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ' ' + m.text()); });
await page.goto(pathToFileURL(path.join(REPO, 'beatbox_heroes', 'index.html')).href);
await page.waitForTimeout(600);
for (const s of steps) {
  if (s.js) { try { const r = await page.evaluate(s.js); if (r !== undefined) console.log(s.name + ' ->', JSON.stringify(r)); } catch (e) { errs.push('EVAL ' + s.name + ': ' + e.message); } }
  if (s.click) { const box = await page.locator('#cv').boundingBox(); await page.mouse.click(box.x + s.click[0] / 270 * box.width, box.y + s.click[1] / 480 * box.height); }
  if (s.key) await page.keyboard.press(s.key);
  await page.waitForTimeout(s.wait || 300);
  if (s.name) await page.screenshot({ path: path.join(outDir, s.name + '.png') });
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
await browser.close();
