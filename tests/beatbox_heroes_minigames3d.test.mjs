// Low-poly 3D mini games in REAL headless Chromium (swiftshader WebGL): each boots, starts, runs a few simulated seconds, returns a state, no errors.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..'), BH = path.join(REPO, 'beatbox_heroes');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_minigames3d: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_minigames3d: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_minigames3d: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: minigames3d suite hung'); process.exit(1); }, 240000);
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'mg3d_test_'));
execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--out', path.join(tmp, 'park3d.bundle.js')], { stdio: 'pipe' });
const html = fs.readFileSync(path.join(BH, 'minigames3d.html'), 'utf8');
for (const m of html.matchAll(/<script src="([\w.]+\.js)"/g)) if (m[1] !== 'park3d.bundle.js') fs.copyFileSync(path.join(BH, m[1]), path.join(tmp, m[1]));
fs.writeFileSync(path.join(tmp, 'minigames3d.html'), html.replace(/park3d\.bundle\.js(\?v=\w+)?/, 'park3d.bundle.js'));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

for (const game of ['rhythm', 'run', 'tuner']) {
  const page = await (await browser.newContext({ viewport: { width: 540, height: 960 } })).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(pathToFileURL(path.join(tmp, 'minigames3d.html')).href + '?game=' + game + '&q=low');
  await page.waitForFunction(() => window.__park && window.__park.ready && window.__park.game, null, { timeout: 60000 });
  ok(true, game + ': boots');
  const st = await page.evaluate((g) => { const p = window.__park; p.pause(true); if (g === 'tuner') p.game.start({ range: 'higher', mode: 'ear' }); else if (g === 'rhythm') p.game.start({ difficulty: 0.3, seed: 7, bars: 1, manual: true }); else p.game.start({}); p.game.tick(2.5); return JSON.stringify(p.game.state()).length; }, game);
  ok(st > 2, game + ': starts and simulates, state readable');
  const hud = await page.evaluate(() => document.getElementById('hud').children.length);
  ok(hud > 0, game + ': draws its HUD');
  const dc = await page.evaluate(() => window.__park.stats().calls);
  ok(dc >= 0 && dc < 140, game + ': draw calls ' + dc);
  ok(errs.length === 0, game + ': no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await page.close();
}
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done('beatbox_heroes_minigames3d');
