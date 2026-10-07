// Screenshot the 3D park in headless Chromium (software WebGL).
//   node tools/beatbox_heroes/shot3d.mjs <outDir> <steps.json> [--w 540] [--h 960] [--build]
// steps: [{ "name":"x", "js":"...evaluated in page (window.__park is the api)...", "wait":600 }, ...]; prints js return values, console errors and renderer stats.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..', '..');
const { chromium } = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core'));
const [outDir, stepsFile, ...rest] = process.argv.slice(2); const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
// every run builds its OWN private bundle + html copy, so several artists can work in parallel without clobbering each other
const TMP = fs.mkdtempSync('/tmp/p3d_run_'); execFileSync('node', [path.join(HERE, 'build_park3d.mjs'), '--dev', '--out', path.join(TMP, 'park3d.bundle.js')], { stdio: ['ignore', 'ignore', 'inherit'] });
fs.writeFileSync(path.join(TMP, 'park3d.html'), fs.readFileSync(path.join(REPO, 'beatbox_heroes', 'park3d.html'), 'utf8').replace(/park3d\.bundle\.js(\?v=\w+)?/, 'park3d.bundle.js'));
const W = +opt('w', 540), H = +opt('h', 960); fs.mkdirSync(outDir, { recursive: true });
const steps = stepsFile && stepsFile !== '-' && fs.existsSync(stepsFile) && fs.statSync(stepsFile).isFile() ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [{ name: 'shot', wait: 1500 }];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ' ' + m.text()); });
await page.goto(pathToFileURL(path.join(TMP, 'park3d.html')).href); await page.waitForFunction(() => window.__park && window.__park.ready, null, { timeout: 30000 }).catch(() => errs.push('park never became ready'));
for (const s of steps) { if (s.js) { try { const r = await page.evaluate(s.js); if (r !== undefined) console.log((s.name || 'js') + ' ->', JSON.stringify(r)); } catch (e) { errs.push('EVAL ' + (s.name || '') + ': ' + e.message); } } await page.waitForTimeout(s.wait || 800); if (s.name) await page.screenshot({ path: path.join(outDir, s.name + '.png') }); }
try { console.log('stats', JSON.stringify(await page.evaluate(() => window.__park.stats()))); } catch (e) { /* ignore */ }
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 12).join('\n') : 'no console errors'); await browser.close(); fs.rmSync(TMP, { recursive: true, force: true });
