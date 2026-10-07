// Park3D host memory gate (PORT_PLAN 2.2 and 6.4): load/unload every world 10 times through the real host in headless Chromium (swiftshader WebGL) and assert
// renderer.info geometries / textures / programs return to the post-warm-up baseline within 5 percent; also checks the host API (superseded loads, unknown ids, DOM cleanup, context loss rebuild).
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_r3mem: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_r3mem: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_r3mem: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: r3mem suite hung'); process.exit(1); }, 540000);
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'r3mem_test_'));
execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--out', path.join(tmp, 'park3d.bundle.js')], { stdio: 'pipe' });
const pageSrc = fs.readFileSync(path.join(REPO, 'beatbox_heroes/world3d.html'), 'utf8');
for (const m of pageSrc.matchAll(/<script src="([\w.]+\.js)"/g)) { const f = path.join(REPO, 'beatbox_heroes', m[1]); if (m[1] !== 'park3d.bundle.js' && fs.existsSync(f)) fs.copyFileSync(f, path.join(tmp, m[1])); }
fs.writeFileSync(path.join(tmp, 'world3d.html'), pageSrc.replace(/park3d\.bundle\.js(\?v=\w+)?/, 'park3d.bundle.js'));

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(pathToFileURL(path.join(tmp, 'world3d.html')).href + '?world=park&q=med');
await page.waitForFunction(() => window.__world || window.__worldError, null, { timeout: 120000 });
ok(await page.evaluate(() => !!window.__world && window.__world.id === 'park' && window.__park === window.__world && window.__host.world === window.__world), 'host loads the park and exposes the world as window.__park');
ok(await page.evaluate(() => ['setTime', 'setWeather', 'setClock', 'setLook', 'setBeat', 'focus', 'release', 'walkToSpot', 'done', 'setSpotState'].every((k) => typeof window.__world[k] === 'function')), 'world has the section 2.2 methods');
ok(await page.evaluate(() => { const w = window.__world; try { w.setWeather('rain'); w.setClock({ hour: 9, day: 5 }); w.setBeat(0.5); w.setSpotState('busk', { locked: true }); w.focus('beeamgee'); w.setWeather('clear'); return true; } catch (e) { return false; } }), 'pass-throughs never throw when the modules lack the method');

// ---------- API behaviour ----------
const api = await page.evaluate(async () => {
  const h = window.__host, out = {};
  try { await h.load('nope'); out.unknown = 'resolved'; } catch (e) { out.unknown = 'rejected'; }
  const p1 = h.load('flat', { warm: false }), p2 = h.load('title', { warm: false }); const [a, b] = await Promise.all([p1, p2]); out.superseded = a === null && !!b && b.id === 'title';
  const s = b.terrain; out.stubOk = !!(s.anchors && s.anchors.start && Array.isArray(s.spotDefs) && s.spotDefs.length === 0);
  for (let i = 0; i < 5; i++) h.tick(0.016);
  out.stats = h.stats(); await h.load('park'); out.back = h.world.id; return out;
});
ok(api.unknown === 'rejected', 'unknown world id rejects');
ok(api.superseded, 'a newer load() supersedes an older one (older resolves null)');
ok(api.stubOk, 'stub worlds ship anchors.start and empty spotDefs');
ok(api.stats && api.stats.world === 'title' && api.stats.calls > 0, 'host.stats() reports the loaded world: ' + JSON.stringify(api.stats));
ok(api.back === 'park', 'park reloads after stubs');

// ---------- leak gate ----------
const IDS = ['park', 'flat', 'title', 'creator', 'street', 'shop', 'lab', 'bar', 'hood', 'office', 'arena'];
const rows = {};
for (const id of IDS) {
  rows[id] = await page.evaluate(async (id) => {
    const h = window.__host, app = document.getElementById('app'); let loaded = null; const cyc = async () => { const w = await h.load(id); for (let i = 0; i < 3; i++) h.tick(0.016); const m = h.leakReport(); h.unload(); loaded = m; return m.loadMs; };
    h.unload(); await cyc(); const kids = app.children.length, base = h.leakReport(); let worst = 0;
    for (let i = 0; i < 10; i++) worst = Math.max(worst, await cyc());
    const end = h.leakReport(); return { base, end, worst, kids, kidsEnd: app.children.length, loaded };
  }, id);
  const r = rows[id], tol = (b) => Math.max(1, Math.ceil(b * 0.05));
  ok(r.loaded.geometries > 0 && r.loaded.textures >= 0 && r.loaded.world === id, id + ': the loaded world holds GPU resources, so the baseline check is not vacuous (' + r.loaded.geometries + ' geo, ' + r.loaded.textures + ' tex)');
  ok(r.end.geometries <= r.base.geometries + tol(r.base.geometries), id + ': geometries back to baseline after 10 cycles (' + r.base.geometries + ' -> ' + r.end.geometries + ')');
  ok(r.end.textures <= r.base.textures + tol(r.base.textures), id + ': textures back to baseline after 10 cycles (' + r.base.textures + ' -> ' + r.end.textures + ')');
  ok(r.end.programs <= r.base.programs + tol(r.base.programs), id + ': programs back to baseline after 10 cycles (' + r.base.programs + ' -> ' + r.end.programs + ')');
  ok(r.kidsEnd === r.kids, id + ': DOM overlays added by the world are removed (' + r.kids + ' -> ' + r.kidsEnd + ')');
  ok(r.worst < 8000, id + ': load time under 8 s on swiftshader (worst ' + r.worst + ' ms)');
  console.log('  ' + id.padEnd(8) + ' geo ' + r.loaded.geometries + ' loaded, ' + r.base.geometries + '->' + r.end.geometries + '  tex ' + r.loaded.textures + ' loaded, '+ ' ' + r.base.textures + '->' + r.end.textures + '  prog ' + r.base.programs + '->' + r.end.programs + '  worst load ' + r.worst + ' ms');
}
// empty host after everything is unloaded: nothing of the worlds may remain
const empty = await page.evaluate(() => { window.__host.unload(); return window.__host.leakReport(); });
ok(empty.geometries <= 40 && empty.textures <= 40, 'unloaded host holds almost nothing: ' + JSON.stringify(empty));

// ---------- context loss: rebuild after restore, demote on second loss ----------
await page.evaluate(() => { window.__lostLog = []; });
const lost = await page.evaluate(async () => {
  const h = window.__host; await h.load('flat', { warm: false }); const ext = h.renderer.getContext().getExtension('WEBGL_lose_context'); if (!ext) return { skip: true };
  const log = []; h.events.on('contextlost', (e) => log.push('lost' + (e.second ? '2' : '1')));
  ext.loseContext(); await new Promise((r) => setTimeout(r, 200)); const during = h.lost; ext.restoreContext();
  for (let i = 0; i < 100 && (h.lost || !h.world); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300)); return { skip: false, during, after: h.lost, id: h.world && h.world.id, demoted: h.demoted, log };
});
if (!lost.skip) { ok(lost.during === true && lost.after === false && lost.id === 'flat' && !lost.demoted, 'context loss pauses, restore rebuilds the same world: ' + JSON.stringify(lost)); } else console.log('  (WEBGL_lose_context unavailable, loss test skipped)');
await page.waitForTimeout(300);
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done();
