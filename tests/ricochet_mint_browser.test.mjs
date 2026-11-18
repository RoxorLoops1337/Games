// Ricochet Mint in REAL headless Chromium: boot, then tap every build slot with a touchscreen
// on a normal phone and on a wide/zoomed-out viewport, and check the tap lands on the slot that is drawn there.
// SKIPPED (exit 0) when playwright or a Chromium build is missing, unless RM_BROWSER=1.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.RM_BROWSER === '1';
let passed = 0, failed = 0;
const ok = (c, n) => { if (c) passed++; else { failed++; console.error('FAIL: ' + n); } };
const finish = () => { console.log(`ricochet_mint_browser: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); };
function skip(why) { console.log('ricochet_mint_browser: SKIPPED, ' + why); if (REQUIRED) { console.log('ricochet_mint_browser: 0 passed, 1 failed'); process.exit(1); } console.log('ricochet_mint_browser: 0 passed, 0 failed'); process.exit(0); }

const req = createRequire(import.meta.url);
let chromium = null;
for (const spec of [path.join(REPO, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright']) { try { chromium = req(spec).chromium; break; } catch (e) { /* next */ } }
if (!chromium) skip('playwright is not installed');
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (exe && !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: browser suite hung'); process.exit(1); }, 120000);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  const p = path.join(REPO, decodeURIComponent(rq.url.split('?')[0]));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/ricochet_mint/index.html`;

let browser;
try { browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] }); } catch (e) { skip('Chromium would not start: ' + e.message); }

for (const [name, w, h, dpr] of [['phone', 390, 844, 3], ['wide viewport', 990, 2050, 1.2]]) {
  // Arrange: a fresh game with every slot open and no coins in the way
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(URL); await page.waitForFunction(() => window.game && document.getElementById('playBtn'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.tap('#playBtn'); await page.waitForTimeout(250);
  if (await page.isVisible('#infoGo')) await page.tap('#infoGo');
  await page.evaluate(() => { const R = game.room(); R.coins = []; R.slots.forEach((s) => { s.open = true; }); game.cash = 1e6; game.life = 2e3; game.mile = 2; });

  const geo = await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { r: { left: r.left, top: r.top, width: r.width, height: r.height }, view: { ...view }, dpr: devicePixelRatio, slots: game.room().slots.map((s) => [s.x, s.y]) }; });
  ok(geo.r.height > h * 0.5, name + ': the room takes up most of the screen');
  let opened = 0, mapped = 0;
  for (let k = 0; k < geo.slots.length; k++) {
    const [sx, sy] = geo.slots[k];
    const X = geo.r.left + (geo.view.ox + sx * geo.view.s) / geo.dpr, Y = geo.r.top + (geo.view.oy + sy * geo.view.s) / geo.dpr;
    // the tap maps back to the same spot in the room
    const back = await page.evaluate(([X, Y]) => toWorld({ clientX: X, clientY: Y }), [X, Y]);
    if (Math.abs(back[0] - sx) < 2 && Math.abs(back[1] - sy) < 2) mapped++;
    // Act: a real touch on the drawn slot
    await page.touchscreen.tap(X, Y); await page.waitForTimeout(150);
    // Assert: that slot's panel opens
    if (await page.evaluate(() => document.getElementById('sheet').classList.contains('show'))) opened++;
    await page.evaluate(() => document.getElementById('shClose').click()); await page.waitForTimeout(120);
  }
  ok(mapped === geo.slots.length, `${name}: every slot's screen position maps back onto it (${mapped}/${geo.slots.length})`);
  ok(opened === geo.slots.length, `${name}: tapping each drawn slot opens it (${opened}/${geo.slots.length})`);
  ok(errs.length === 0, name + ': no page errors ' + errs.join(' | '));
  await ctx.close();
}
await browser.close(); server.close(); clearTimeout(watchdog);
finish();
