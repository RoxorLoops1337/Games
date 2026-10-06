// Beatbox Heroes mini games in REAL headless Chromium with a FAKE microphone (Chromium's built-in fake audio device):
// run tracker, pitch tuner (ear mode and mic mode), beat maker (edit, play, train, release a song), sound recorder, mic mode in the
// rhythm game, crew, streaming, coaching. SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_minigames: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_minigames: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_minigames: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: minigames suite hung'); process.exit(1); }, 150000);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, permissions: ['microphone'] });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(pathToFileURL(path.join(REPO, 'beatbox_heroes', 'index.html')).href);
const sleep = (ms) => page.waitForTimeout(ms);
const scene = () => page.evaluate(() => BBH.E.sceneName);
const click = async (x, y) => { const b = await page.locator('#cv').boundingBox(); await page.mouse.click(b.x + x / 360 * b.width, b.y + y / 640 * b.height); };
await page.waitForFunction(() => window.BBH && BBH.E && BBH.E.sceneName === 'title', null, { timeout: 20000 });
await page.evaluate(() => { const C = BBH.Core; const ch = C.newChar(BBH.CATALOG.DEFAULT_LOOK, 'Mini'); ch.flags.intro = 1; ['home', 'park', 'bar', 'shop', 'studio'].forEach((p) => { ch.flags['visited_' + p] = 1; }); ch.day = 3; ch.minutes = 300; ch.cash = 800; ch.fans = 300; ch.level = 6; ch.stats = { mus: 10, tech: 10, ori: 10, show: 10 }; BBH.G.slot = 1; BBH.G.setChar(ch); BBH.E.go('place', { id: 'home' }, { nofade: true }); });
await sleep(800);

// ---- run tracker
await page.evaluate(() => BBH.E.go('run', { back: { scene: 'street' } }, { nofade: true })); await sleep(500);
ok(await scene() === 'run', 'run scene opens');
for (let i = 0; i < 24; i++) { await page.keyboard.press(i % 2 ? 'KeyD' : 'KeyA'); await sleep(110); }
const bar = await page.evaluate(() => BBH.E.scene.bar); ok(bar > 20, 'alternating taps fill the bar (' + Math.round(bar) + ')');
const before = await page.evaluate(() => BBH.E.scene.bar); await page.keyboard.press('KeyA'); await page.keyboard.press('KeyA'); ok((await page.evaluate(() => BBH.E.scene.bar)) <= before + 12.5, 'the same side twice does not count');
await page.evaluate(() => { BBH.E.scene.blocksDone = 11; BBH.E.scene.good = 7; BBH.E.scene.blockT = 2490; }); await sleep(250);
ok((await page.locator('#ui .panel', { hasText: 'RUN COMPLETE' }).count()) === 1, 'finishing a run shows the result card');
ok((await page.evaluate(() => BBH.G.ch.n.runs)) === 1 && (await page.evaluate(() => BBH.G.ch.maxEnergy)) >= 102, 'a run is counted and adds stamina');

// ---- pitch tuner (ear training, then mic)
await page.evaluate(() => { BBH.G.ch.energy = 90; BBH.E.go('tuner', { back: { scene: 'street' } }, { nofade: true }); }); await sleep(500);
await page.locator('#ui .btn', { hasText: 'EAR TRAINING' }).first().click(); await sleep(2200);
ok(await page.locator('#ui .btn', { hasText: 'HIGHER' }).count() > 0, 'ear training asks higher or lower');
await page.locator('#ui .btn', { hasText: 'HIGHER' }).first().click(); await sleep(1200);
await page.evaluate(() => BBH.E.go('tuner', { back: { scene: 'street' } }, { nofade: true })); await sleep(500);
await page.locator('#ui .btn', { hasText: 'HIGHER VOICE' }).first().click(); await sleep(1500);
ok(await page.evaluate(() => BBH.Mic.isOpen()), 'the tuner opens the (fake) microphone');
await page.evaluate(() => BBH.E.go('street', {}, { nofade: true })); await sleep(300);
ok(!(await page.evaluate(() => BBH.Mic.isOpen())), 'leaving the tuner releases the microphone');

// ---- beat maker
await page.evaluate(() => BBH.E.go('seq', { back: { scene: 'street' }, place: 'home' }, { nofade: true })); await sleep(600);
const cell = async (i, l) => click(20 + i * 20 + 10, 270 + l * 34 + 17);
for (const [i, l] of [[0, 0], [8, 0], [4, 2], [12, 2], [2, 1], [6, 1], [10, 1], [14, 1]]) { await cell(i, l); await sleep(60); }
ok((await page.evaluate(() => BBH.Core.patternHits(BBH.E.scene.pat))) === 8, 'tapping the grid places 8 hits');
await page.locator('#ui .btn', { hasText: 'PLAY' }).first().click(); await sleep(1500);
ok(await page.evaluate(() => BBH.E.scene.playing && BBH.E.scene.step >= 0), 'the beat plays and the playhead moves');
await page.evaluate(() => { BBH.E.scene.played = 9; });
await page.locator('#ui .btn', { hasText: 'RELEASE' }).first().click(); await sleep(200);
await page.locator('#ui input[type=text]').last().fill('Test Song'); await page.locator('#ui .btn', { hasText: 'RELEASE' }).last().click(); await sleep(300);
ok((await page.evaluate(() => BBH.G.ch.songs.length)) === 1 && (await page.evaluate(() => BBH.G.ch.songs[0].name)) === 'Test Song', 'a song is released with its name');
const ori0 = await page.evaluate(() => BBH.G.ch.stats.ori);
await page.locator('#ui .btn', { hasText: 'TRAIN' }).first().click(); await sleep(500);
ok((await page.evaluate(() => BBH.G.ch.stats.ori)) > ori0, 'finishing a beat session trains Originality');

// ---- sound recorder with the fake mic (it beeps, so the onset is found)
await page.evaluate(() => BBH.E.go('studio', { back: { scene: 'street' } }, { nofade: true })); await sleep(500);
await page.locator('#ui .btn', { hasText: 'REC' }).first().click(); await sleep(6000);
const rec = await page.evaluate(() => BBH.Audio.hasSample(0)); ok(rec === true, 'the recorder stores a sample from the fake mic');
ok((await page.evaluate(() => BBH.G.ch.n.recorded)) >= 1, 'recording is counted');
await page.evaluate(() => BBH.E.go('street', {}, { nofade: true })); await sleep(300);

// ---- crew, stream, coaching
await page.evaluate(() => BBH.G.do({ t: 'recruit', id: 'jaxx' })); ok((await page.evaluate(() => BBH.G.ch.crew.length)) === 1, 'recruit a crew member');
await page.evaluate(() => { BBH.G.ch.energy = 90; BBH.G.ch.minutes = 300; BBH.G.setChar(BBH.G.ch); BBH.G.goLive(); }); await sleep(300); ok((await page.evaluate(() => BBH.G.ch.n.streams)) === 1, 'go live');
await page.evaluate(() => BBH.G.do({ t: 'coach', stat: 'mus' })); ok((await page.evaluate(() => BBH.G.ch.n.coaches)) === 1, 'private coaching');

// ---- mic mode in a rhythm set
await page.evaluate(() => { BBH.E.settings.mic = true; BBH.G.ch.energy = 90; BBH.E.go('rhythm', { mode: 'practice', title: 'MIC', bpm: 100, bars: 3, difficulty: 0.2, onDone: (r) => { window.__r = r; }, onAbort() {} }, { nofade: true }); }); await sleep(1500);
ok(await page.evaluate(() => BBH.Mic.isOpen()), 'mic mode opens the microphone in the rhythm game');
await page.evaluate(() => BBH.E.go('street', {}, { nofade: true })); await sleep(300);
ok(!(await page.evaluate(() => BBH.Mic.isOpen())), 'leaving the rhythm game releases the microphone');
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ':\n  ' + errs.slice(0, 8).join('\n  ') : ''));
clearTimeout(watchdog); await browser.close(); done();
