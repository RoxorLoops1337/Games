#!/usr/bin/env node
// Screenshot / QA driver for Inkwoven (headless Chromium via playwright-core).
//
//   node tools/rogue_book/shot.mjs --url "rogue_book/gallery.html?sheet=heroes" --out /tmp/x.png
//   node tools/rogue_book/shot.mjs --url rogue_book/index.html --js "GAME.debug.open('combat',{enemies:['kappa']})" --wait 1500 --out /tmp/c.png
//   node tools/rogue_book/shot.mjs --url rogue_book/index.html --steps steps.json
//
// Flags: --url (repo-relative path or http(s) URL), --out png path, --w/--h viewport (default 1280x720),
//   --scale device scale factor, --wait ms after load, --js code evaluated in the page after load,
//   --mobile (touch, 390x844 portrait), --logs (print console + page errors), --steps json file:
//   --strict also reports missing resources (404s).
//   [{"js":"...","wait":300,"shot":"/tmp/a.png","click":"css selector","key":"Escape"}, ...]
// Exit code 1 if the page threw an uncaught error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(root, 'node_modules', 'playwright-core'));

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const mobile = flag('mobile');
const w = +arg('w', mobile ? 390 : 1280), h = +arg('h', mobile ? 844 : 720);
let url = arg('url', 'rogue_book/index.html');
if (!/^https?:|^file:/.test(url)) { const [p, q] = url.split('?'); url = pathToFileURL(path.join(root, p)).href + (q ? '?' + q : ''); }
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: +arg('scale', 1), hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message); });
// Scripts still being written 404 during construction; hide that noise unless --strict.
page.on('console', (m) => { const t = m.text(); if (!flag('strict') && /Failed to load resource/.test(t)) return; if (flag('logs') || m.type() === 'error') console.log('console.' + m.type(), t); });
await page.goto(url);
await page.waitForTimeout(+arg('wait', 600));

const doShot = async (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); await page.screenshot({ path: p }); console.log('shot', p); };
const steps = arg('steps') ? JSON.parse(fs.readFileSync(arg('steps'), 'utf8')) : null;
if (arg('js')) { try { const r = await page.evaluate(arg('js')); if (r !== undefined) console.log('js ->', JSON.stringify(r)); } catch (e) { errors++; console.log('JSERROR', e.message); } await page.waitForTimeout(+arg('wait', 600)); }
if (steps) {
  for (const s of steps) {
    try {
      if (s.js) { const r = await page.evaluate(s.js); if (r !== undefined) console.log('js ->', JSON.stringify(r)); }
      if (s.click) await page.click(s.click);
      if (s.key) await page.keyboard.press(s.key);
    } catch (e) { errors++; console.log('STEPERROR', e.message); }
    await page.waitForTimeout(s.wait == null ? 300 : s.wait);
    if (s.shot) await doShot(s.shot);
  }
}
if (arg('out')) await doShot(arg('out'));
await browser.close();
process.exit(errors ? 1 : 0);
