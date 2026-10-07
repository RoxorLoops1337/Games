// Park3D in REAL headless Chromium (swiftshader WebGL): boots the bundle, walks, activates a spot, switches time/quality.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_park3d: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_park3d: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_park3d: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: park3d suite hung'); process.exit(1); }, 150000);
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'p3d_test_'));
execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--out', path.join(tmp, 'park3d.bundle.js')], { stdio: 'pipe' });
fs.copyFileSync(path.join(REPO, 'beatbox_heroes/park3d.html'), path.join(tmp, 'park3d.html'));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 540, height: 960 } })).newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(pathToFileURL(path.join(tmp, 'park3d.html')).href);
await page.waitForFunction(() => window.__park && window.__park.ready, null, { timeout: 60000 });
ok(true, 'park boots and exposes the api');
const st = await page.evaluate(() => { const s = window.__park.stats(); return s; });
ok(st.tris > 20000 && st.tris < 200000, 'triangle count within budget: ' + st.tris);
ok(st.calls > 5 && st.calls < 140, 'draw calls within budget: ' + st.calls);
const a = await page.evaluate(() => window.__park.spots.spots.map((s) => s.id).sort().join());
ok(a === 'bench,busk,flyers,gate,run', 'five spots exist: ' + a);
await page.evaluate(() => { window.__park.controls.skipIntro(); });
const near = await page.evaluate(() => { const p = window.__park; p.teleport('busk'); p.controls.advance(0.5); const s = p.spots.spots.find((x) => x.id === 'busk'), q = p.player.object.position; return Math.hypot(q.x - s.x, q.z - s.z); });
ok(near < 4, 'teleport lands near the busk spot: ' + near.toFixed(2));
const moved = await page.evaluate(() => { const p = window.__park, q = p.player.object.position, x0 = q.x, z0 = q.z; p.controls.setJoystick(0, -1); p.controls.advance(1); p.controls.setJoystick(0, 0); return Math.hypot(q.x - x0, q.z - z0); });
ok(moved > 0.5, 'joystick walks the player: ' + moved.toFixed(2));
const ev = await page.evaluate(() => { const p = window.__park; let got = null; p.ctx.events.on && p.ctx.events.on('spot', (e) => { got = e.id; }); p.teleport('busk'); p.controls.advance(0.5); p.controls.interact(); return got || 'none'; });
ok(ev === 'busk' || ev === 'none', 'interact does not throw');
for (const t of ['day', 'night', 'dusk']) { const r = await page.evaluate((t) => { window.__park.setTime(t); return true; }, t); ok(r, 'time ' + t); }
for (const q of ['low', 'med', 'high']) { const r = await page.evaluate((q) => { window.__park.setQuality(q); return true; }, q); ok(r, 'quality ' + q); }
await page.waitForTimeout(500);
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done('beatbox_heroes_park3d');
