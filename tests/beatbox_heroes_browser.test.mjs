// Beatbox Heroes in REAL headless Chromium: boot -> title -> new game -> creator (every tab) -> intro -> street -> home ->
// kitchen -> park -> rhythm game -> result, with real clicks and keys. Fails on any page error / console error and on blank canvases.
// SKIPPED (exit 0) when playwright-core or a Chromium build is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_browser: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_browser: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_browser: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: browser suite hung'); process.exit(1); }, 120000);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 } });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(pathToFileURL(path.join(REPO, 'beatbox_heroes', 'index.html')).href);
const sleep = (ms) => page.waitForTimeout(ms);
const scene = () => page.evaluate(() => BBH.E.sceneName);
const click = async (x, y) => { const b = await page.locator('#cv').boundingBox(); await page.mouse.click(b.x + x / 270 * b.width, b.y + y / 480 * b.height); };
const clickText = async (txt) => { const loc = page.locator('#ui .btn', { hasText: txt }).first(); await loc.click({ timeout: 4000 }); };
const canvasVaried = () => page.evaluate(() => { const c = document.getElementById('cv').getContext('2d').getImageData(0, 0, 360, 640).data, s = new Set(); for (let i = 0; i < c.length; i += 4 * 97) s.add(c[i] + ',' + c[i + 1] + ',' + c[i + 2]); return s.size; });
const dismiss = async () => { for (let i = 0; i < 20 && (await page.locator('#ui .full').count()) > 0; i++) { await click(135, 200); await sleep(150); } };
const waitScene = async (name, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await scene()) === name) return true; await sleep(100); } return false; };

// boot -> title
ok(await waitScene('title', 15000), 'boots to the title screen');
ok((await canvasVaried()) > 40, 'title canvas has plenty of colours');
await click(135, 300); await sleep(300);
await clickText('NEW GAME'); ok(await waitScene('slots'), 'new game opens the slot picker');
await sleep(300); await page.locator('#ui .panel').first().click(); ok(await waitScene('creator'), 'an empty slot opens the creator');
await sleep(400);
ok((await canvasVaried()) > 40, 'creator canvas has plenty of colours');
// every creator tab renders tiles without errors
const nTabs = await page.locator('#ui .tab').count(); ok(nTabs === 10, 'creator has 10 tabs (got ' + nTabs + ')');
for (let i = 0; i < nTabs; i++) { await page.locator('#ui .tab').nth(i).click(); await sleep(150); }
await page.locator('#ui .tab').nth(2).click(); await sleep(100);
const tiles = await page.locator('#ui .tile').count(); ok(tiles >= 20, 'hair tab shows the hair styles (' + tiles + ' tiles)');
await page.locator('#ui .tile').nth(8).click(); await sleep(150);
await page.locator('#ui input[type=text]').first().fill('Tester'); await sleep(100);
// pick a locked item: still previewable
await page.locator('#ui .tab').nth(7).click(); await sleep(100); await page.locator('#ui .tile').last().click(); await sleep(200);
ok(await scene() === 'creator', 'previewing a locked hat does not leave the creator');
await clickText('GO!'); ok(await waitScene('intro'), 'GO! starts the intro');
await sleep(500); await clickText('SKIP'); ok(await waitScene('street', 12000), 'skipping the intro lands on the street');
ok((await canvasVaried()) > 40, 'street canvas has plenty of colours');
const st = await page.evaluate(() => ({ name: BBH.G.ch.name, day: BBH.G.ch.day, hat: BBH.G.ch.look.hat.id }));
ok(st.name === 'Tester' && st.day === 1, 'the new hero is in the save');
ok(st.hat === 'none' || st.hat === 'cap' || st.hat === 'capback' || st.hat === 'beanie' || st.hat === 'bandana' || st.hat === 'headband', 'a locked hat preview was stripped on confirm (hat=' + st.hat + ')');
// dismiss the tutorial dialogue
await sleep(400); await dismiss();
// walk into home, eat
await page.locator('#ui .row .btn', { hasText: 'HOME' }).first().click(); ok(await waitScene('place', 12000), 'the HOME button walks in');
await sleep(600); await dismiss();
await page.evaluate(() => { BBH.E.scene.walkTo('kitchen'); }); await sleep(2500); await dismiss();
const hunger0 = await page.evaluate(() => BBH.G.ch.hunger);
await page.locator('#ui .btn', { hasText: 'BANANA' }).first().click({ timeout: 4000 }); await sleep(200);
ok((await page.evaluate(() => BBH.G.ch.hunger)) > hunger0, 'eating a banana fills you up');
// rhythm game: start a practice drill and tap lanes
await page.evaluate(() => { BBH.E.go('rhythm', { mode: 'practice', title: 'TEST', bpm: 100, bars: 3, difficulty: 0.4, style: 1, stage: 'cyan', onDone: (r) => { window.__res = r; }, onAbort: () => {} }); });
await sleep(800); ok(await scene() === 'rhythm', 'rhythm scene starts');
for (let i = 0; i < 40; i++) { await page.keyboard.press(['KeyD', 'KeyF', 'KeyJ', 'KeyK'][i % 4]); await sleep(120); }
ok((await canvasVaried()) > 40, 'rhythm canvas has plenty of colours');
const done_ = await page.waitForFunction(() => window.__res, null, { timeout: 40000 }).then(() => true).catch(() => false);
ok(done_, 'the set finishes and reports a result');
if (done_) { const r = await page.evaluate(() => window.__res); ok(r.total >= 1 && r.accuracy >= 0 && r.accuracy <= 1, 'result has sane numbers'); }
// dev menu opens
await page.evaluate(() => { BBH.E.store.setItem('bbh:dev', '1'); BBH.E.go('street', {}, { nofade: true }); }); await sleep(500);
await page.evaluate(() => BBH.G.openDev()); await sleep(200); ok((await page.locator('#ui .panel.sheet').count()) >= 1, 'dev menu opens');
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ':\n  ' + errs.slice(0, 8).join('\n  ') : ''));
clearTimeout(watchdog); await browser.close(); done();
