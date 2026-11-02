// Drop the Bass round 9 in a real browser: spatial d-pad navigation in menus, and the mid-run quest toast. Skips with exit 0 without Playwright (DTB_BROWSER_SKIP=1 too).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass r9 browser: SKIPPED (' + why + ')'); process.exit(0); };
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
  page.on('console', (m) => { if (m.type() === 'error' && !/r9 diag test/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!/r9 diag test/.test(e.message)) errs.push('PAGEERROR ' + e.message); });
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
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await boot(ctx);
  await page.evaluate(() => {
    window.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], connected: true, mapping: 'standard' };
    navigator.getGamepads = () => [window.__pad]; window.dispatchEvent(new Event('gamepadconnected'));
    window.__press = (i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; };
    window.__release = () => { window.__pad.buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); };
  });
  const tap = async (i) => { await page.evaluate((i) => window.__press(i), i); await page.waitForTimeout(120); await page.evaluate(() => window.__release()); await page.waitForTimeout(120); };
  await hubSetup(page, 'tour');
  await page.waitForTimeout(400);
  // a 2 x 2 grid of buttons in a modal: right moves along the row, down moves along the column
  await page.evaluate(() => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:20px;top:100px;width:300px;height:200px;background:#fff;z-index:99999';
    const mk = (id, x, y) => { const b = document.createElement('button'); b.id = id; b.textContent = id; b.style.cssText = 'position:absolute;width:80px;height:40px;left:' + x + 'px;top:' + y + 'px'; box.append(b); };
    mk('ga', 10, 10); mk('gb', 150, 10); mk('gc', 10, 120); mk('gd', 150, 120);
    bg.append(box); document.body.append(bg); document.getElementById('ga').focus();
  });
  const act = () => page.evaluate(() => document.activeElement && document.activeElement.id);
  await tap(15); need(await act() === 'gb', 'right goes to the next button in the row (' + await act() + ')');
  await tap(13); need(await act() === 'gd', 'down goes to the button below (' + await act() + ')');
  await tap(14); need(await act() === 'gc', 'left goes back along the row (' + await act() + ')');
  await tap(12); need(await act() === 'ga', 'up goes to the button above (' + await act() + ')');
  await tap(12); need(['gc', 'gd'].includes(await act()), 'up at the top wraps to the far end (' + await act() + ')');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));

  // ---- mid-run quest toast
  await page.evaluate(() => { const p = __dtb.app.profile; p.daily.quests[0] = { id: 'q_sell', claimed: false }; p.daily.prog = {}; __dtb.app.profile.resume = null; __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0 }); });
  await page.waitForFunction(() => __dtb.app.battle && __dtb.app.battle.run, null, { timeout: 8000 });
  await page.evaluate(() => { const b = __dtb.app.battle; for (const id of Object.keys(b.prof.tutorial.hints || {})) b.prof.tutorial.hints[id] = true; b.hintQueue.length = 0; b.tut = null; window.__toasts = []; const o = b.app.hooks.toast; b.app.hooks.toast = (m, ...r) => { window.__toasts.push(String(m)); return o && o.call(b.app.hooks, m, ...r); }; b.run.sells = 3; b.questWatch(); });
  need(await page.evaluate(() => window.__toasts.length === 0), 'no toast below the goal');
  await page.evaluate(() => { const b = __dtb.app.battle; b.run.sells = 4; b.questWatch(); b.questWatch(); });
  need(await page.evaluate(() => window.__toasts.length === 1 && /Sell 4/.test(window.__toasts[0])), 'one toast when the quest goal is reached, only once (' + await page.evaluate(() => window.__toasts.join('|')) + ')');
  await ctx.close();
} catch (e) { errs.push('EXC ' + (e && e.stack || e)); }
await browser.close(); srv.close();
if (errs.length) { console.log('drop_the_bass r9 browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass r9 browser: ' + n + ' checks passed');
