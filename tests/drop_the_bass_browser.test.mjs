// Drop the Bass browser smoke test: loads the real game in headless Chromium (Playwright) and fails on any console error or page error.
// Skips with exit 0 when Playwright or Chromium is missing, or DTB_BROWSER_SKIP=1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass browser: SKIPPED (' + why + ')'); process.exit(0); };
if (process.env.DTB_BROWSER_SKIP === '1') skip('DTB_BROWSER_SKIP=1');
let pw = null;
for (const base of [ROOT, '/opt/node-tools', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
  for (const dir of [base, path.join(base, 'node_modules')]) { try { pw = createRequire(path.join(dir, 'x.js'))('playwright'); if (pw && pw.chromium) break; } catch (e) { pw = null; } }
  if (pw) break;
}
if (!pw) skip('playwright not found');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => srv.listen(0, r));
let browser;
try { browser = await pw.chromium.launch(); } catch (e) { srv.close(); skip('chromium would not start'); }
const errs = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto('http://localhost:' + srv.address().port + '/drop_the_bass/');
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  await page.mouse.click(200, 400); await page.click('text=PLAY'); await page.waitForSelector('.cut-box');
  await page.click('.cut-skip');
  await page.waitForFunction(() => window.__dtb.app.screen === 'battle', null, { timeout: 10000 });
  // finish the practice run in-page, then walk every hub tab and open modals
  await page.evaluate(() => { const b = __dtb.app.battle; b.tut.done = true; const r = b.run; r.prepT = 0.1; for (let i = 0; i < 40000 && r.phase !== 'won' && r.phase !== 'lost'; i++) { r.advance(0.1); r.autoPlayStep({ early: true }); r.drain(); } });
  await page.waitForSelector('.res-title', { timeout: 20000 });
  await page.click('text=Continue');
  await page.waitForSelector('.tabs');
  for (const t of ['Studio', 'Band', 'Crates', 'Goals', 'Tour']) { await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove())); await page.click('.tab:has-text("' + t + '")'); await page.waitForTimeout(150); }
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  const text = await page.evaluate(() => document.body.innerText);
  if (/\bnull\b|undefined|NaN/.test(text)) errs.push('stray text in the UI: ' + (text.match(/.{0,20}(\bnull\b|undefined|NaN).{0,20}/) || [''])[0]);
  // a normal run for a few seconds of real frames
  await page.evaluate(() => { const a = __dtb.app; a.profile.tutorial.hints = { fuzz: 1 }; a.startRun({ mode: 'story', world: 'garage', encore: 0, seed: 3 }); });
  await page.waitForFunction(() => window.__dtb.app.screen === 'battle' || window.__dtb.app.screen === 'cut', null, { timeout: 5000 });
  await page.evaluate(() => { document.querySelectorAll('.cut-box').forEach((e) => e.click()); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const c = document.querySelector('.cut-skip'); c && c.click(); });
  await page.waitForFunction(() => window.__dtb.app.screen === 'battle', null, { timeout: 5000 });
  await page.evaluate(() => { const b = __dtb.app.battle; b.run.coins = 2000; for (let i = 0; i < 6; i++) b.doDeploy(); b.doCall(); b.speed = 3; });
  await page.waitForTimeout(4000);
  if (!(await page.evaluate(() => window.__dtb.app.battle.run.kills >= 0))) errs.push('battle not running');
} catch (e) { errs.push('TEST ERROR ' + e.message); }
await browser.close(); srv.close();
if (errs.length) { console.error('drop_the_bass browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass browser: ok');
