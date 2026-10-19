// Midnight Mog browser smoke test: plays the real game in headless Chromium (Playwright) and fails on any console error,
// page error, crash panel or stuck screen. It SKIPS with exit 0 and a message when Playwright or Chromium is missing, so CI
// without a browser never goes red for that reason.
//
//   node tests/midnight_mog_browser.test.mjs            run (about 60 s)
//   MOG_BROWSER_SKIP=1 node tests/...                   force the skip path
//   MOG_CHROMIUM=/path/to/chrome                        pick the browser binary
//   MOG_PLAYWRIGHT=/path/to/node_modules                where playwright lives (default: normal resolution, then a few known places)
//
// It serves the repo root with a tiny built in static server (no python needed) on a free port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.now();
const skip = (why) => { console.log('midnight_mog browser: SKIPPED (' + why + ')'); process.exit(0); };
if (process.env.MOG_BROWSER_SKIP === '1') skip('MOG_BROWSER_SKIP=1');

// ------------------------------------------------------------------------------------------------ find playwright and chromium
function loadPlaywright() {
  const cands = [process.env.MOG_PLAYWRIGHT, ROOT, '/opt/node-tools', '/usr/lib/node_modules', '/usr/local/lib/node_modules'].filter(Boolean);
  for (const base of cands) {
    for (const dir of [base, path.join(base, 'node_modules')]) {
      try { const r = createRequire(path.join(dir, 'x.js')); const m = r('playwright'); if (m && m.chromium) return m; } catch (e) { /* next */ }
      try { const r = createRequire(path.join(dir, 'x.js')); const m = r('playwright-core'); if (m && m.chromium) return m; } catch (e) { /* next */ }
    }
  }
  return null;
}
function findChromium(pw) {
  const list = [process.env.MOG_CHROMIUM];
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME || '/root', '.cache/ms-playwright')].filter(Boolean);
  for (const r of roots) {
    try {
      for (const d of fs.readdirSync(r).sort().reverse()) {
        if (/^chromium-\d+$/.test(d)) list.push(path.join(r, d, 'chrome-linux/chrome'), path.join(r, d, 'chrome-win/chrome.exe'), path.join(r, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'));
        if (/^chromium_headless_shell-\d+$/.test(d)) list.push(path.join(r, d, 'chrome-linux/headless_shell'));
      }
    } catch (e) { /* none here */ }
  }
  try { list.push(pw.chromium.executablePath()); } catch (e) { /* none */ }
  for (const p of list) { try { if (p && fs.existsSync(p)) return p; } catch (e) { /* next */ } }
  return null;
}
const pw = loadPlaywright();
if (!pw) skip('playwright is not installed');
const exe = findChromium(pw);
if (!exe) skip('no chromium binary found');

// ------------------------------------------------------------------------------------------------ static server
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(d);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/midnight_mog/index.html';

// ------------------------------------------------------------------------------------------------ helpers
let browser = null;
const fails = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
async function newPage(vp, o = {}) {
  const touch = vp.w < 900;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: touch, isMobile: touch, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => window.__midnightMog, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { ctx, page, errs, touch };
}
const info = (page) => page.evaluate(() => {
  const g = window.__midnightMog, ui = g.ui;
  const regs = ui.regionList().filter((r) => r.w > 0 && r.h > 0);
  const top = regs.reduce((m, r) => Math.max(m, r.layer), 0);
  return { screen: g.screenId, crash: g.crash && g.crash.message, trans: !!ui.transitioning, top, regs: regs.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, layer: r.layer })), tut: g.tut.active };
});
async function tapXY(page, touch, x, y) { if (touch) await page.touchscreen.tap(x, y); else { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); } }
async function tapId(page, touch, id, wait = 300) {
  const i = await info(page);
  const r = i.regs.filter((q) => (typeof id === 'string' ? q.id === id : id.test(q.id))).sort((a, b) => b.layer - a.layer)[0];
  if (!r) return false;
  await tapXY(page, touch, r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(wait);
  return true;
}
async function waitFor(page, pred, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(pred, arg)) return true; await page.waitForTimeout(150); } return false; }
const screenIs = (page, id, ms = 8000) => waitFor(page, (id) => window.__midnightMog.screenId === id && !window.__midnightMog.ui.transitioning, ms, id);
async function richProfile(page) {
  await page.evaluate(() => window.__midnightMog.startGame('new'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const g = window.__midnightMog; const p = JSON.parse(JSON.stringify(g.app.profile));
    p.stats.tut_step = 99; p.cur.fish = 400000; p.cur.yarn = 150000; p.cur.gems = 3000; p.cur.tokens = 20;
    g.tut.finish(); g.app.setProfile(p); g.app.save(); g.router.go('hub', { reset: true });
  });
  await page.waitForTimeout(900);
}
async function crateSummary(page, touch, vp) {
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const m = await page.evaluate(() => window.__midnightMog.screens.crates.state.mode);
    if (m === 'summary') return true;
    await tapXY(page, touch, vp.w / 2, vp.h / 2); await page.waitForTimeout(400);
  }
  return false;
}
function noErrors(label, errs, page, g) { check(errs.length === 0, label + ': no console or page errors' + (errs.length ? ' (' + errs[0].slice(0, 160) + ')' : '')); }
const tapAudit = [];
async function auditTaps(page, label, vp) {
  const i = await info(page);
  const small = i.regs.filter((r) => r.layer === i.top && !/^(field$|__|tut:b\d|cur:|chip:|.*:(scroll|grid|camp|daily|col)$)/.test(r.id) && r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h && (r.h < 24 || r.w < 24));
  if (small.length) tapAudit.push(label + ': ' + small.map((r) => r.id + '(' + Math.round(r.w) + 'x' + Math.round(r.h) + ')').join(' '));
  return small.length;
}

// ------------------------------------------------------------------------------------------------ the scenarios
try {
  browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  for (const vp of [{ w: 390, h: 800, name: 'phone portrait' }, { w: 1280, h: 800, name: 'desktop' }]) {
    console.log('scenario: ' + vp.name + ' ' + vp.w + 'x' + vp.h);
    const { ctx, page, errs, touch } = await newPage(vp);
    check((await info(page)).screen === 'title', 'title screen is up');
    // new game: the tutorial starts in a battle; skip it with the real SKIP button
    await tapXY(page, touch, vp.w / 2, vp.h / 2); await page.waitForTimeout(500);
    check(await tapId(page, touch, 'title:new', 600), 'title offers New game');
    check(await screenIs(page, 'battle', 8000), 'new game opens the tutorial battle');
    await page.waitForTimeout(800);
    check(await tapId(page, touch, 'tut:skip', 500), 'tutorial has a SKIP button');
    await tapId(page, touch, /^dlg:.*:yes$/, 500);
    await page.waitForTimeout(500);
    // leave that battle through pause and quit, as a player would
    if ((await info(page)).screen === 'battle') {
      await tapId(page, touch, 'pause', 400); await tapId(page, touch, 'quit', 400); await tapId(page, touch, 'dlg:quit:yes', 1800);
    }
    await richProfile(page);
    check(await screenIs(page, 'hub'), 'hub after a rich start');
    // every tab and every More screen
    for (const tab of ['deck', 'town', 'crates', 'more']) {
      check(await tapId(page, touch, 'nav:' + tab, 1200), 'tap nav ' + tab);
      await auditTaps(page, vp.name + ' ' + tab, vp);
      check(!(await info(page)).crash, tab + ' did not crash');
    }
    for (const s of ['roster', 'relics', 'map', 'quests', 'bestiary', 'settings', 'nine_lives']) {
      await page.evaluate((s) => window.__midnightMog.router.go(s, { reset: true }), s); await page.waitForTimeout(900);
      const i = await info(page);
      check(i.screen === s && !i.crash, 'screen ' + s + ' renders');
      await auditTaps(page, vp.name + ' ' + s, vp);
    }
    // regression: a card whose cat is not owned yet (crate drops) must open in the deck detail without a crash
    await page.evaluate(() => { const g = window.__midnightMog; window.__keepProfile = JSON.stringify(g.app.profile); const p = JSON.parse(JSON.stringify(g.app.profile)); p.cards = { call_hex_hisser: { level: 1, count: 1 } }; p.deck = []; g.app.setProfile(p); g.router.go('deck', { reset: true }); });
    await page.waitForTimeout(900);
    await tapId(page, touch, /^col:/, 500); await page.waitForTimeout(500);
    check(!(await info(page)).crash, 'deck detail for a card without its cat does not crash');
    await page.evaluate(() => { const g = window.__midnightMog; g.app.setProfile(JSON.parse(window.__keepProfile)); });
    // a crate x1 and x10 with the full ceremony, then skip
    await tapId(page, touch, 'nav:crates', 1000).catch(() => {}); await page.evaluate(() => window.__midnightMog.router.go('crates', { reset: true })); await page.waitForTimeout(900);
    const fish0 = await page.evaluate(() => window.__midnightMog.app.profile.cur.fish);
    check(await tapId(page, touch, 'open1', 1200), 'crate open x1');
    check(await crateSummary(page, touch, vp), 'x1 ceremony reaches the summary');
    await tapId(page, touch, 'done', 800);
    check(await tapId(page, touch, 'open10', 1200), 'crate open x10');
    check(await tapId(page, touch, 'skip', 1200), 'x10 has SKIP');
    check(await waitFor(page, () => window.__midnightMog.screens.crates.state.mode === 'summary', 6000), 'skip jumps to the summary');
    await tapId(page, touch, 'done', 800);
    check((await page.evaluate(() => window.__midnightMog.app.profile.cur.fish)) < fish0, 'crates cost fish');
    // a real battle with auto and 3x until the result overlay
    await page.evaluate(() => window.__midnightMog.router.go('battle', { returnTo: 'hub', forceBattle: true, district: 1, stage: 3 }));
    check(await screenIs(page, 'battle'), 'battle opens');
    await page.waitForTimeout(1200);
    await tapId(page, touch, 'auto', 200); await tapId(page, touch, 'speed', 200); await tapId(page, touch, 'speed', 200);
    const done = await waitFor(page, () => { const s = window.__midnightMog.screens.battle.state; return !!(s && s.result); }, 90000);
    check(done, 'battle reaches a result overlay');
    await page.waitForTimeout(2500);
    check(await tapId(page, touch, /^res_(go|leave)$/, 1800), 'result has a way out');
    check(await screenIs(page, 'hub', 6000) || (await info(page)).screen !== 'battle', 'leaving the result returns to a menu');
    // save survives a reload
    const before = await page.evaluate(() => { const p = window.__midnightMog.app.profile; return JSON.stringify([p.cur, p.progress, p.deck]); });
    await page.evaluate(() => window.__midnightMog.save());
    await page.reload(); await page.waitForFunction(() => window.__midnightMog, null, { timeout: 15000 }); await page.waitForTimeout(800);
    await tapXY(page, touch, vp.w / 2, vp.h / 2); await page.waitForTimeout(500);
    await tapId(page, touch, 'title:continue', 1500);
    const after = await page.evaluate(() => { const p = window.__midnightMog.app.profile; return JSON.stringify([p.cur, p.progress, p.deck]); });
    check(before === after, 'reload keeps currencies, progress and deck');
    check(!(await info(page)).crash, 'no crash panel at the end');
    noErrors(vp.name, errs);
    await ctx.close();
  }

  // landscape phone and reduced motion: just boot, start, open one screen each
  for (const o of [{ vp: { w: 800, h: 390, name: 'phone landscape' }, reduced: false }, { vp: { w: 390, h: 800, name: 'reduced motion' }, reduced: true }]) {
    console.log('scenario: ' + o.vp.name);
    const { ctx, page, errs, touch } = await newPage(o.vp, { reduced: o.reduced });
    if (o.reduced) check(await page.evaluate(() => window.__midnightMog.ui.reduceMotion), 'prefers-reduced-motion turns reduceMotion on');
    await richProfile(page);
    for (const tab of ['deck', 'town', 'crates']) { await tapId(page, touch, 'nav:' + tab, 1000); check(!(await info(page)).crash, o.vp.name + ' ' + tab + ' ok'); }
    await page.evaluate(() => window.__midnightMog.router.go('battle', { returnTo: 'hub', forceBattle: true }));
    check(await screenIs(page, 'battle'), o.vp.name + ' battle opens');
    await page.waitForTimeout(4000);
    check(!(await info(page)).crash, o.vp.name + ' battle runs');
    noErrors(o.vp.name, errs);
    await ctx.close();
  }
} catch (e) {
  fails.push('exception: ' + (e && e.stack || e));
  console.log('  FAIL exception: ' + (e && e.message));
} finally {
  try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
  server.close();
}
if (tapAudit.length) console.log('info: regions under 24 px (not a failure): ' + tapAudit.join(' | '));
if (fails.length) { console.log('midnight_mog browser: ' + fails.length + ' failure(s) in ' + Math.round((Date.now() - T0) / 1000) + ' s'); process.exit(1); }
console.log('midnight_mog browser: all passed in ' + Math.round((Date.now() - T0) / 1000) + ' s');
process.exit(0);
