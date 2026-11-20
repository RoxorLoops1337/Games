// Million To One in REAL headless Chromium: boot the title, start a swim, steer with a touch drag,
// clear a zone and pick a mutation card, reach every zone without a page error, end a run and buy a habit.
// MTO_SHOTS=<dir> also saves screenshots there. SKIPPED (exit 0) when playwright or Chromium is missing, unless MTO_BROWSER=1.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.MTO_BROWSER === '1', SHOTS = process.env.MTO_SHOTS || '';
let passed = 0, failed = 0;
const ok = (c, n) => { if (c) passed++; else { failed++; console.error('FAIL: ' + n); } };
const finish = () => { console.log(`million_to_one_browser: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); };
function skip(why) { console.log('million_to_one_browser: SKIPPED, ' + why); if (REQUIRED) { console.log('million_to_one_browser: 0 passed, 1 failed'); process.exit(1); } process.exit(0); }

const req = createRequire(import.meta.url);
let chromium = null;
for (const spec of [path.join(REPO, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright']) { try { chromium = req(spec).chromium; break; } catch (e) { /* next */ } }
if (!chromium) skip('playwright is not installed');
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const watchdog = setTimeout(() => { console.error('FAIL: browser suite hung'); process.exit(1); }, 150000);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  let p = path.join(REPO, decodeURIComponent(rq.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/million_to_one/`;

let browser;
try { browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] }); } catch (e) { skip('Chromium would not start: ' + e.message); }
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

// Arrange: the title screen with a demo race behind it
await page.goto(URL);
await page.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
await page.waitForTimeout(800);
ok(await page.isVisible('#playBtn'), 'the title screen shows a SWIM button');
await shot('1_title');

// Act: first swim shows the story, tapping through starts the race
await page.tap('#playBtn'); await page.waitForTimeout(200);
ok(await page.isVisible('#intro'), 'the first swim starts with the story');
for (let i = 0; i < 20 && await page.isVisible('#intro'); i++) { await page.tap('#intro'); await page.waitForTimeout(80); }
await page.waitForTimeout(1500);
ok(await page.evaluate(() => !game.race.demo && document.getElementById('hud').offsetParent !== null), 'the race starts with the HUD showing');
await shot('2_start');

// a touch drag steers the swimmer
const before = await page.evaluate(() => game.race.p.x);
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', 200, 600);
for (let k = 1; k <= 8; k++) { await touch('touchMove', 200 - k * 10, 600); await page.waitForTimeout(30); }
await page.waitForTimeout(250);
const after = await page.evaluate(() => game.race.p.x);
await touch('touchEnd', 120, 600);
ok(after < before - 15, `dragging left steers left (${before.toFixed(0)} -> ${after.toFixed(0)})`);
ok(await page.evaluate(() => game.race.rank < 1000000), 'you are already overtaking');

// swim 1 never teaches cashing in: a watcher records every class #tut gets from here on
await page.evaluate(() => { window.__tutCls = []; new MutationObserver(() => window.__tutCls.push(document.getElementById('tut').className)).observe(document.getElementById('tut'), { attributes: true, attributeFilter: ['class'] }); });

// Act: jump to the end of zone 1 so the mutation cards come up
await page.evaluate(() => { const r = game.race; r.p.y = 8950; r.genY = 9300; r.ents = []; r.p.e = r.p.maxE; });
await page.waitForFunction(() => !document.getElementById('cards').classList.contains('hide'), null, { timeout: 5000 }).catch(() => {});
ok(await page.isVisible('#cards'), 'clearing a zone deals mutation cards');
if (SHOTS) await page.waitForTimeout(800); // let the deal animation land so the shot shows all three cards
await shot('3_cards');
ok(await page.evaluate(() => document.querySelectorAll('#cardRow .card').length === 3), 'three cards are dealt');
await page.tap('#cardRow .card');
await page.waitForTimeout(400);
ok(await page.evaluate(() => Object.keys(game.race.muts).length === 1 && !game.race.pending), 'tapping a card takes it and the swim goes on');

// a hit-stop lets go: after a bonk the impact frame is gone by 0.25 s and the flash by 0.4 s
await page.evaluate(() => { const r = game.race, p = r.p; r.emit('bonk', { x: p.x, y: p.y + 20 }); });
await page.waitForTimeout(250);
ok(await page.evaluate(() => game.R.imp == null), 'the bonk impact frame has released by 0.25 s');
await page.waitForTimeout(150);
ok(await page.evaluate(() => !(game.R._flash > 0.1)), 'and its flash has faded by 0.4 s');
// marks (BEST line, a grave) draw on the track without an error
await page.evaluate(() => { const y = game.race.p.y; game.R.marks = [{ y: y + 260, kind: 'best', label: 'BEST' }, { y: y + 520, kind: 'grave', label: 'Kevin #3' }]; });
await page.waitForTimeout(400);
await shot('4_marks');
ok(errs.length === 0, 'BEST and grave marks draw without page errors ' + errs.join(' | '));

// the egg duel panel's rival line never names its speaker twice ('Gunther: Gunther: ...')
await page.evaluate(() => { window.__epBad = []; const ep = document.querySelector('#drillUI .ep'); if (ep) new MutationObserver(() => { const t = ep.textContent || ''; if (/^([^:]{1,20}): \1:/.test(t)) window.__epBad.push(t); }).observe(ep, { childList: true, characterData: true, subtree: true }); });
// every zone draws without errors (keep the swimmer alive while we skip around)
const ZY = [4000, 16000, 30000, 46000, 61500, 70000, 82500];
for (const y of ZY) {
  await page.evaluate((y) => { const r = game.race; if (r.pending) r.choose(r.pending[0]); document.getElementById('cards').classList.add('hide'); r.p.y = y; r.genY = y + 300; r.ents = r.ents.filter((e) => e.y > y); r.p.e = r.p.maxE; r.p.shield = 9; if (y > 60000 && !r.p.side) r.p.side = r.eggSide; r.p.x = (y > 59400 ? (r.eggSide < 0 ? 150 : 250) : 200); }, y);
  await page.waitForTimeout(1600);
  await page.evaluate(() => { const r = game.race; if (r.pending) { r.choose(r.pending[0]); document.getElementById('cards').classList.add('hide'); } r.p.e = r.p.maxE; });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('banner').classList.remove('on')); // the shot shows the zone, not a banner
  await shot('4_zone_' + y);
}
ok(errs.length === 0, 'no page errors across all zones ' + errs.join(' | '));
// Act: at the egg, a rival winds up a move (its tell line already names the speaker)
const drillOn = await page.evaluate(() => !document.getElementById('drillUI').classList.contains('hide'));
if (drillOn) {
  await page.evaluate(() => game.race.emit('rivalMove', { phase: 'tell', k: 3, move: 'test' }));
  await page.waitForTimeout(150);
  const epT = await page.evaluate(() => document.querySelector('#drillUI .ep').textContent);
  ok(/^Gunther: "/.test(epT) && !/^Gunther: Gunther:/.test(epT), 'a tell at the egg shows the speaker once ("' + epT + '")');
}
ok(drillOn, 'the last zone hop lands at the egg duel');
ok(await page.evaluate(() => window.__epBad.length === 0), 'the egg panel never doubles a speaker name ' + (await page.evaluate(() => window.__epBad.join(' | '))));
ok(await page.evaluate(() => !window.__tutCls.some((c) => /\bstep-cash\b/.test(c))), 'swim 1 never shows the cash lesson');


// Act: give up, see the result, buy a habit
await page.evaluate(() => { const r = game.race; r.over = null; r.end('energy'); });
await page.waitForFunction(() => !document.getElementById('result').classList.contains('hide'), null, { timeout: 5000 }).catch(() => {});
ok(await page.isVisible('#result'), 'the end of a swim shows the result');
if (SHOTS) await page.waitForTimeout(3200); // let the rank fall and the DNA receipt count up
await shot('5_result');
// Assert: an energy death right at the egg never reads "0.0 cm from the egg" (it says Kevin was at the egg)
const resTipT = await page.evaluate(() => (document.getElementById('resTip') || {}).textContent || '');
ok(!/(^|[^\d.])0\.0 cm/.test(resTipT), 'a GAS death at the egg never says 0.0 cm ("' + resTipT + '")');
// Assert: the egg-bar caption fits one phone line, and the retry button is in the first viewport
const cap = await page.evaluate(() => { const sp = document.querySelector('#resEgg span'); const c = sp.cloneNode(true); c.querySelectorAll('i').forEach((i) => i.remove()); return c.textContent.trim(); });
const capMax = /^[\d.]+ cm short/.test(cap) ? 34 : 48; // the plain gap line 34, a SHORT_BY joke 48 (its writer limit)
ok(cap.length <= capMax, `the egg caption is ${capMax} characters or fewer ("${cap}")`);
ok(await page.evaluate(() => { const b = document.getElementById('againBtn').getBoundingClientRect(); return b.height > 0 && b.top >= 0 && b.bottom <= innerHeight; }), 'SWIM AGAIN sits inside the first viewport');
const dna = await page.evaluate(() => game.meta.dna);
ok(dna > 0, 'the swim paid DNA (' + dna + ')');
await page.evaluate(() => { game.meta.dna += 500; });
await page.tap('#resShopBtn'); await page.waitForTimeout(200);
await shot('6_shop');
await page.tap('#shopList button[data-id="broccoli"]'); await page.waitForTimeout(150);
ok(await page.evaluate(() => game.meta.habits.broccoli === 1), 'buying Dad eats broccoli works');
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('million_to_one_v1')).habits.broccoli === 1), 'and it is saved');
ok(errs.length === 0, 'no page errors at all ' + errs.join(' | '));

await browser.close(); server.close(); clearTimeout(watchdog);
finish();
