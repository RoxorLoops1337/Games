// Drop the Bass round 7 in a real browser: a gamepad drives the DOM menus (d-pad moves focus, A presses, B closes). Skips with exit 0 without Playwright (DTB_BROWSER_SKIP=1 too).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass r7 browser: SKIPPED (' + why + ')'); process.exit(0); };
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
  if (p.startsWith('/api/')) { res.writeHead(204); res.end(); return; }
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => srv.listen(0, r));
let browser;
try { browser = await pw.chromium.launch(); } catch (e) { srv.close(); skip('chromium would not start'); }
const errs = []; let n = 0;
const need = (c, m) => { n++; if (!c) errs.push(m); };
const base = 'http://localhost:' + srv.address().port + '/drop_the_bass/';
const boot = async (ctx, query) => {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/r7 diag test/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!/r7 diag test/.test(e.message)) errs.push('PAGEERROR ' + e.message); });
  await page.goto(base + (query || ''));
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  return page;
};
const hubSetup = (page, tab) => page.evaluate((tab) => {
  const a = __dtb.app, p = a.profile; p.tutorial.done = true; p.story.intro = true; p.name = 'Roxor Fan';
  for (const id of ['lang_offer', 'hint_weekly', 'hint_setlist', 'hint_wardrobe', 'hint_studio_scene', 'hint_skin_buy', 'offline_ready']) p.tutorial.hints[id] = true;
  p.story.worlds.garage = true; p.prog.garage.cleared = true; p.login.lastDay = 99999; p.login.claimedDay = 99999; p.whatsNewSeen = 99; a.sessionGreeted = true;
  a.save(); a.openHub(tab || 'tour');
}, tab);
const modalCount = (page) => page.evaluate(() => document.querySelectorAll('.modal-bg').length);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await boot(ctx);
  await hubSetup(page, 'tour');
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); __dtb.app.profile.resume = null; __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0 }); });
  await page.waitForFunction(() => __dtb.app.battle && __dtb.app.battle.run, null, { timeout: 8000 });
  await page.evaluate(() => {
    const b = __dtb.app.battle; for (const id of Object.keys(b.prof.tutorial.hints || {})) b.prof.tutorial.hints[id] = true;
    b.hintQueue.length = 0; b.tut = null;
    window.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], connected: true, mapping: 'standard' };
    navigator.getGamepads = () => [window.__pad]; window.dispatchEvent(new Event('gamepadconnected'));
    window.__press = (i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; };
    window.__release = () => { window.__pad.buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); };
  });
  const tap = async (i) => { await page.evaluate((i) => window.__press(i), i); await page.waitForTimeout(160); await page.evaluate(() => window.__release()); await page.waitForTimeout(160); };
  await page.waitForTimeout(400);
  await tap(9);   // START opens the pause menu
  await page.waitForSelector('.modal-bg', { timeout: 4000 });
  need(await modalCount(page) === 1, 'START opens the pause menu');
  const f0 = await page.evaluate(() => document.activeElement && (document.activeElement.textContent || '').trim());
  await tap(13);   // D-pad down
  const f1 = await page.evaluate(() => document.activeElement && (document.activeElement.textContent || '').trim());
  need(f0 !== f1 && !!f1, 'the d-pad moves the focus inside the menu (' + f0 + ' to ' + f1 + ')');
  await tap(12);   // D-pad up
  const f2 = await page.evaluate(() => document.activeElement && (document.activeElement.textContent || '').trim());
  need(f2 === f0 || !!f2, 'the d-pad moves it back');
  need(await page.evaluate(() => __dtb.app.battle.paused === true), 'the battle stays paused while the menu is open');
  await tap(1);    // B closes it (Escape)
  await page.waitForTimeout(300);
  need(await modalCount(page) === 0, 'B closes the pause menu');
  // the A that closed nothing must not drop a turret in the battle underneath
  const d0 = await page.evaluate(() => __dtb.app.battle.run.deploys);
  await tap(9); await page.waitForSelector('.modal-bg'); await tap(0);   // A presses the focused button (resume or similar)
  await page.waitForTimeout(400);
  const d1 = await page.evaluate(() => __dtb.app.battle.run.deploys);
  need(d1 === d0, 'the A that pressed a menu button did not also deploy in the battle (' + d0 + ' to ' + d1 + ')');
  await ctx.close();
} catch (e) { errs.push('EXC ' + (e && e.stack || e)); }
await browser.close(); srv.close();
if (errs.length) { console.log('drop_the_bass r7 browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass r7 browser: ' + n + ' checks passed');
