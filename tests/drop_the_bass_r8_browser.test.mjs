// Drop the Bass round 8 in a real browser: a gamepad drives the hub (focus, A, LB/RB tabs), rumbles, and a seeded random pad fuzz in battle and hub finds no errors. Skips with exit 0 without Playwright (DTB_BROWSER_SKIP=1 too).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass r8 browser: SKIPPED (' + why + ')'); process.exit(0); };
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
  page.on('console', (m) => { if (m.type() === 'error' && !/r8 diag test/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!/r8 diag test/.test(e.message)) errs.push('PAGEERROR ' + e.message); });
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
    window.__rumbles = [];
    window.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], connected: true, mapping: 'standard', vibrationActuator: { playEffect: (t, o) => { window.__rumbles.push(o); return Promise.resolve(); } } };
    navigator.getGamepads = () => [window.__pad]; window.dispatchEvent(new Event('gamepadconnected'));
    window.__press = (i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; };
    window.__release = () => { window.__pad.buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); };
  });
  const tap = async (i) => { await page.evaluate((i) => window.__press(i), i); await page.waitForTimeout(120); await page.evaluate(() => window.__release()); await page.waitForTimeout(120); };
  await page.waitForSelector('.title-wrap .tap', { timeout: 5000 });
  await tap(0);   // A on the TAP TO START title
  await page.waitForTimeout(400);
  need(await page.evaluate(() => !document.querySelector('.title-wrap .tap')), 'A starts the title like a tap');
  await hubSetup(page, 'tour');
  await page.waitForTimeout(500);
  const tabOf = () => page.evaluate(() => (document.querySelector('.tabs [aria-selected="true"]') || {}).id || '');
  const t0 = await tabOf();
  await tap(5);   // RB: next tab
  await page.waitForTimeout(400);
  const t1 = await tabOf();
  need(!!t0 && t1 && t0 !== t1, 'RB switches the hub tab (' + t0 + ' to ' + t1 + ')');
  await tap(4);   // LB: back
  await page.waitForTimeout(400);
  need(await tabOf() === t0, 'LB switches it back');
  await tap(13);  // D-pad down: focus the first control
  const f1 = await page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? a.tagName : ''; });
  need(f1 === 'BUTTON' || f1 === 'DIV' || f1 === 'INPUT', 'the d-pad focuses a control in the hub (' + f1 + ')');
  const f2a = await page.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 60));
  await tap(13);
  const f2b = await page.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 60));
  need(f2a !== f2b, 'the d-pad moves on to the next control');
  // a modal: settings via the gear, B closes it
  await page.evaluate(() => document.querySelector('.hub-top .iconbtn').click());
  await page.waitForSelector('.modal-bg'); await tap(13); await tap(1); await page.waitForTimeout(300);
  need(await page.evaluate(() => document.querySelectorAll('.modal-bg').length === 0), 'B closes a hub modal');

  // ---- rumble: a merge event in battle drives the actuator when Vibrate is on
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); const p = __dtb.app.profile; p.settings.vibrate = true; p.settings.reduce = false; __dtb.app.profile.resume = null; __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0 }); });
  await page.waitForFunction(() => __dtb.app.battle && __dtb.app.battle.run, null, { timeout: 8000 });
  await page.evaluate(() => { const b = __dtb.app.battle; for (const id of Object.keys(b.prof.tutorial.hints || {})) b.prof.tutorial.hints[id] = true; b.hintQueue.length = 0; b.tut = null; b.prof.settings.vibrate = true; b.prof.settings.reduce = false; window.__rumbles.length = 0; b.vibrate([40, 30, 40], 2); });
  need(await page.evaluate(() => window.__rumbles.length >= 1 && window.__rumbles[0].duration >= 30), 'a haptic event rumbles the pad');
  await page.evaluate(() => { const b = __dtb.app.battle; window.__rumbles.length = 0; b.prof.settings.reduce = true; b.t += 5; b.vibrate([40], 2); });
  need(await page.evaluate(() => window.__rumbles.length === 0), 'Reduce motion keeps the pad quiet');

  // ---- seeded pad fuzz: random buttons and directions in battle, then in the hub; no page errors
  let seed = 8; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 160; i++) {
    const k = Math.floor(rnd() * 16);
    await page.evaluate((k) => window.__press(k), k); await page.waitForTimeout(40 + Math.floor(rnd() * 60)); await page.evaluate(() => window.__release()); await page.waitForTimeout(30);
    if (i % 20 === 19) await page.evaluate(() => { const r = __dtb.app.battle && __dtb.app.battle.run; if (r) { r.coins = 99999; r.stageHp = r.stageMax; } });
  }
  need(await page.evaluate(() => !window.__dtbError), 'no frame error after the battle pad fuzz');
  await ctx.close();
} catch (e) { errs.push('EXC ' + (e && e.stack || e)); }
await browser.close(); srv.close();
if (errs.length) { console.log('drop_the_bass r8 browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass r8 browser: ' + n + ' checks passed');
