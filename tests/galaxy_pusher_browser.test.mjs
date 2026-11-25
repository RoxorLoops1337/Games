// Galaxy Pusher in REAL headless Chromium on a phone (WebGL in software): the physics loads, PLAY unlocks, hold to
// shoot from either shooter, beat an enemy, spin the wheel, a tower rises, the 3D machine draws, and nothing throws. SKIPPED (exit 0) when playwright or Chromium is missing, unless GP_BROWSER=1.
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

const watchdog = setTimeout(() => { console.error('FAIL: browser suite hung'); process.exit(1); }, 240000);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.txt': 'text/plain' };
const server = http.createServer((rq, rs) => {
  const p = path.join(REPO, decodeURIComponent(rq.url.split('?')[0]));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/galaxy_pusher/index.html`;

let browser;
try { browser = await chromium.launch({ ...(exe && fs.existsSync(exe) ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); } catch (e) { skip('Chromium would not start: ' + e.message); }

try {
  // Arrange: a fresh phone
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(URL);
  await page.waitForFunction(() => window.GP && GP.ready(), null, { timeout: 45000 });
  ok(await page.isVisible('#playBtn') && await page.evaluate(() => !document.getElementById('playBtn').disabled), 'the physics loads and the PLAY button unlocks');
  ok(await page.evaluate(() => { const c = document.getElementById('cv3'); const gl = GP.view.renderer.getContext(); return !!gl && c.width > 100; }), 'the 3D machine has a WebGL canvas');

  // Act: play, the first visit shows how to play
  await page.tap('#playBtn'); await page.waitForTimeout(200);
  ok(await page.isVisible('#howGo'), 'a first visit opens the how-to-play card');
  await page.tap('#howGo'); await page.waitForTimeout(200);

  // hold on the machine to shoot
  const L = await page.evaluate(() => ({ m: GP.L.mach, bar: GP.L.bar }));
  ok(L.m.h > 844 * 0.35, 'the machine takes a good part of the screen (' + Math.round(L.m.h) + ' px)');
  const bank0 = await page.evaluate(() => GP.game.stats.shots);
  await page.mouse.move(195, L.m.y + L.m.h * 0.6); await page.mouse.down();
  await page.evaluate(() => GP.ff(1.5));   // game time, independent of the (slow, software) frame rate
  await page.mouse.up();
  const shots = await page.evaluate(() => GP.game.stats.shots) - bank0;
  ok(shots >= 4, 'holding on the machine fires coins (' + shots + ')');

  // the left half fires the left shooter, the right half the right one
  const fromSide = async (x) => {
    const n0 = await page.evaluate(() => GP.game.stats.shots);
    await page.evaluate(() => { GP.game.bank = 100; GP.game.fireCd = 0; });
    await page.mouse.move(x, L.m.y + L.m.h * 0.6); await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
    return page.evaluate((n0) => { const g = GP.game; if (g.stats.shots <= n0) return 0; const c = g.f.coins.filter((q) => q.k === 'c' && q.body && q.shot).slice(-1)[0]; return c ? c.body.linvel().x : 0; }, n0);
  };
  ok(await fromSide(50) > 0, 'holding the left of the machine fires from the left shooter (coin flies right)');
  ok(await fromSide(340) < 0, 'holding the right of the machine fires from the right shooter (coin flies left)');
  ok(await page.isVisible('#fireL') && await page.isVisible('#fireR'), 'there is a FIRE button for each shooter');
  const gap = await page.evaluate(() => GP.L.mach.y - (GP.L.battle.y + GP.L.battle.h));
  ok(gap < 12, 'no empty band between the battle screen and the machine (' + Math.round(gap) + ' px)');
  ok(L.m.h > 844 * 0.5, 'the machine takes most of the screen (' + Math.round(L.m.h) + ' px)');
  // the machine draws: sample the 3D canvas for coin-coloured pixels
  const lit = await page.evaluate(() => { const r = GP.view.renderer, gl = r.getContext(); r.render(GP.view.scene, GP.view.camera); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4 * 64); let bright = 0; for (let i = 0; i < 64; i++) { gl.readPixels(Math.floor(w * (0.2 + 0.6 * (i % 8) / 7)), Math.floor(h * (0.15 + 0.5 * Math.floor(i / 8) / 7)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4)); if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 240) bright++; } return bright; });
  ok(lit >= 6, 'the 3D view shows lit coins on the field (' + lit + ' of 64 samples bright)');

  // beat the enemy: the wheel opens, the ball lands, a tower builds
  await page.evaluate(() => { GP.game.damage(1e6, 'chip', null); GP.ff(2.5); });
  ok(await page.evaluate(() => !!GP.wheel), 'beating an enemy opens the Galaxy Wheel');
  await page.evaluate(() => GP.ff(9));
  ok(await page.evaluate(() => GP.game.f.towers.length > 0 && !GP.wheel), 'the wheel builds a coin tower in the machine');
  await page.evaluate(() => GP.ff(8));
  ok(await page.evaluate(() => GP.game.f.towers.some((T) => T.state === 'stand' && T.body && T.body.translation().y > 1)), 'the tower rises out of the floor in the pusher notch and stands');
  await page.evaluate(() => GP.ff(2));
  ok(await page.evaluate(() => GP.game.foe.idx === 1), 'the next enemy arrives');

  // tokens reach the row and three make an attack
  await page.evaluate(() => { const g = GP.game; g.pushToken('B'); g.pushToken('B'); g.pushToken('B'); GP.ff(2); });
  ok(await page.evaluate(() => GP.game.stats.attacks === 1), 'three tokens trigger an attack');

  // menu pauses, the game saves
  await page.tap('#menuBtn'); await page.waitForTimeout(150);
  ok(await page.isVisible('#resumeBtn'), 'the menu opens');
  const saved = await page.evaluate(() => !!localStorage.getItem('galaxy_pusher_v1'));
  ok(saved, 'the game saves to localStorage');
  await page.tap('#resumeBtn');

  // a reload continues the same machine
  const before = await page.evaluate(() => GP.game.foeIdx);
  await page.reload(); await page.waitForFunction(() => window.GP && GP.ready(), null, { timeout: 45000 });
  ok(await page.evaluate(() => GP.game.foeIdx) === before, 'reloading continues from the save');

  // landscape / wide screens still lay out
  await page.setViewportSize({ width: 900, height: 600 }); await page.waitForTimeout(300);
  ok(await page.evaluate(() => GP.L.mach.h > 150 && GP.L.gw <= 900), 'a wide window still lays out the game');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
} catch (e) { ok(false, 'browser run threw: ' + e.message); }
clearTimeout(watchdog);
await browser.close(); server.close();
finish();
