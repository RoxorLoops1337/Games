// Galaxy Pusher in REAL headless Chromium on a phone: boot, play, hold to shoot, beat an enemy,
// spin the wheel, see a tower, and never throw. SKIPPED (exit 0) when playwright or Chromium is missing, unless GP_BROWSER=1.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.GP_BROWSER === '1';
let passed = 0, failed = 0;
const ok = (c, n) => { if (c) passed++; else { failed++; console.error('FAIL: ' + n); } };
const finish = () => { console.log(`galaxy_pusher_browser: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); };
function skip(why) { console.log('galaxy_pusher_browser: SKIPPED, ' + why); if (REQUIRED) { console.log('galaxy_pusher_browser: 0 passed, 1 failed'); process.exit(1); } console.log('galaxy_pusher_browser: 0 passed, 0 failed'); process.exit(0); }

const req = createRequire(import.meta.url);
let chromium = null;
for (const spec of [path.join(REPO, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright', '/opt/node-tools/node_modules/playwright']) { try { chromium = req(spec).chromium; break; } catch (e) { /* next */ } }
if (!chromium) skip('playwright is not installed');
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const watchdog = setTimeout(() => { console.error('FAIL: browser suite hung'); process.exit(1); }, 120000);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  const p = path.join(REPO, decodeURIComponent(rq.url.split('?')[0]));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/galaxy_pusher/index.html`;

let browser;
try { browser = await chromium.launch({ ...(exe && fs.existsSync(exe) ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] }); } catch (e) { skip('Chromium would not start: ' + e.message); }

try {
  // Arrange: a fresh phone
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(URL);
  await page.waitForFunction(() => window.GP && window.GP.game, null, { timeout: 15000 });
  ok(await page.isVisible('#playBtn'), 'the title screen shows a PLAY button');

  // Act: play, the first visit shows how to play
  await page.tap('#playBtn'); await page.waitForTimeout(200);
  ok(await page.isVisible('#howGo'), 'a first visit opens the how-to-play card');
  await page.tap('#howGo'); await page.waitForTimeout(200);

  // hold on the machine to shoot
  const L = await page.evaluate(() => ({ m: GP.L.mach, bar: GP.L.bar }));
  ok(L.m.h > 844 * 0.35, 'the machine takes a good part of the screen (' + Math.round(L.m.h) + ' px)');
  const bank0 = await page.evaluate(() => GP.game.stats.shots);
  await page.mouse.move(195, L.m.y + L.m.h * 0.6); await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const shots = await page.evaluate(() => GP.game.stats.shots) - bank0;
  ok(shots >= 4, 'holding on the machine fires coins (' + shots + ')');

  // aim follows the finger
  await page.mouse.move(40, L.m.y + L.m.h * 0.6); await page.mouse.down(); await page.waitForTimeout(100);
  const aimL = await page.evaluate(() => GP.cam.aimOf(40));
  await page.mouse.up();
  ok(aimL < 0.15, 'touching the left of the machine aims left');

  // beat the enemy: the wheel opens, the ball lands, a tower builds
  await page.evaluate(() => GP.game.damage(1e6, 'chip', null));
  await page.waitForFunction(() => GP.wheel && GP.wheel.phase === 'spin', null, { timeout: 8000 });
  ok(true, 'beating an enemy opens the Galaxy Wheel');
  await page.waitForFunction(() => GP.game.f.towers.length > 0, null, { timeout: 15000 });
  ok(true, 'the wheel builds a coin tower in the machine');
  await page.waitForFunction(() => GP.game.foe && !GP.wheel, null, { timeout: 8000 });
  ok(await page.evaluate(() => GP.game.foe.idx === 1), 'the next enemy arrives');

  // tokens reach the row and three make an attack
  await page.evaluate(() => { const g = GP.game; g.pushToken('B'); g.pushToken('B'); g.pushToken('B'); });
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => GP.game.stats.attacks === 1), 'three tokens trigger an attack');

  // menu pauses, the game saves
  await page.tap('#menuBtn'); await page.waitForTimeout(150);
  ok(await page.isVisible('#resumeBtn'), 'the menu opens');
  const saved = await page.evaluate(() => !!localStorage.getItem('galaxy_pusher_v1'));
  ok(saved, 'the game saves to localStorage');
  await page.tap('#resumeBtn');

  // a reload continues the same machine
  const before = await page.evaluate(() => GP.game.foeIdx);
  await page.reload(); await page.waitForFunction(() => window.GP && window.GP.game, null, { timeout: 15000 });
  ok(await page.evaluate(() => GP.game.foeIdx) === before, 'reloading continues from the save');

  // landscape / wide screens still lay out
  await page.setViewportSize({ width: 900, height: 600 }); await page.waitForTimeout(300);
  ok(await page.evaluate(() => GP.L.mach.h > 150 && GP.L.gw <= 900), 'a wide window still lays out the game');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
} catch (e) { ok(false, 'browser run threw: ' + e.message); }
clearTimeout(watchdog);
await browser.close(); server.close();
finish();
