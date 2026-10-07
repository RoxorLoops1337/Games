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
fs.copyFileSync(path.join(REPO, 'beatbox_heroes/flat3d.html'), path.join(tmp, 'flat3d.html'));
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
// black-frame guard: a GPU that cannot render the HDR/MSAA target must step down the ladder instead of showing black
await page.evaluate(() => { const l = window.__park.lighting; l.setQuality('high'); l.post._forceBlank(4); });
await page.waitForFunction(() => window.__park.lighting.stats().rung >= 2, null, { timeout: 90000 });
const rg = await page.evaluate(() => window.__park.lighting.stats());
ok(rg.rung === 2 && rg.composer, 'black frames step the post chain down the ladder (rung ' + rg.rung + ')');
await page.waitForTimeout(500);
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
// ---------- FLAT scene (flat3d.html: Park3D.init scene 'flat') ----------
await page.close();
const fpage = await (await browser.newContext({ viewport: { width: 540, height: 960 } })).newPage(); const ferrs = [];
fpage.on('pageerror', (e) => ferrs.push('pageerror: ' + e.message)); fpage.on('console', (m) => { if (m.type() === 'error') ferrs.push('console: ' + m.text()); });
await fpage.goto(pathToFileURL(path.join(tmp, 'flat3d.html')).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
await fpage.waitForFunction(() => window.__park && window.__park.ready, null, { timeout: 60000 });
ok(await fpage.evaluate(() => window.__park.sceneName === 'flat' && !!window.__park.terrain.interior), 'flat boots with scene flat');
const fst = await fpage.evaluate(() => window.__park.stats());
ok(fst.tris < 100000 && fst.calls < 100, 'flat within budget: ' + fst.tris + ' tris, ' + fst.calls + ' calls');
const fids = await fpage.evaluate(() => window.__park.spots.spots.map((s) => s.id).sort().join());
ok(fids === 'bed,booth,couch,desk,door,kitchen,wardrobe', 'seven flat spots exist: ' + fids);
await fpage.evaluate(() => window.__park.controls.skipIntro());
for (const id of ['booth', 'couch', 'bed', 'desk', 'kitchen', 'wardrobe', 'door']) {
  const r = await fpage.evaluate((id) => { const p = window.__park; p.controls.release(); p.teleport(id); p.controls.advance(0.3); const n = p.spots.nearest(p.player.object.position); let got = null; const off = p.ctx.events.on('spot', (e) => { got = e; }); const done = p.controls.interact(); p.controls.advance(1); const ins = p.controls.inSpot; p.done(id); p.controls.advance(0.8); return { near: n && n.id, done, got: window.__lastSpot, ins, after: p.controls.inSpot }; }, id);
  ok(r.near === id && r.done && r.got && r.got.id === id && r.got.scene === 'flat' && r.ins === id && r.after === null, 'flat spot ' + id + ': near, interact fires {id, scene}, cinematic locks then releases ' + JSON.stringify(r));
}
const wall = await fpage.evaluate(() => { const p = window.__park, c = p.controls, q = p.player.object.position, tb = p.terrain.blocked; p.terrain.blocked = (x, z) => x > 0 && x < 0.6 && z > -4 && z < 4; c.teleportTo(-2, 0); c.advance(0.2); const y = c.yaw; c.setJoystick(Math.cos(y), Math.sin(y)); c.advance(4); c.setJoystick(0, 0); const out = { x: q.x, z: q.z }; p.terrain.blocked = tb; return out; });
ok(wall.x < 0.05 && wall.x > -2.5, 'joystick walk is stopped by a blocked() collider: x=' + wall.x.toFixed(2));
const slide = await fpage.evaluate(() => { const p = window.__park, c = p.controls, q = p.player.object.position, tb = p.terrain.blocked; p.terrain.blocked = (x, z) => x > 0 && x < 0.6 && z > -9 && z < 9; c.teleportTo(-0.5, 0); c.advance(0.2); const y = c.yaw, z0 = q.z; c.setJoystick(Math.cos(y) + Math.sin(y) * 0.7, Math.sin(y) - Math.cos(y) * 0.7); c.advance(1.5); c.setJoystick(0, 0); const out = { dz: Math.abs(q.z - z0), x: q.x }; p.terrain.blocked = tb; return out; });
ok(slide.x < 0.05 && slide.dz > 0.3, 'player slides along the wall instead of sticking: dz=' + slide.dz.toFixed(2));
const zoom = await fpage.evaluate(() => { const c = window.__park.controls, tc = window.__park.terrain.camera; c.setZoom(1); const lo = c.state().zoom; c.setZoom(99); const hi = c.state().zoom; return { lo, hi, min: tc.minDist, max: tc.maxDist }; });
ok(zoom.lo === zoom.min && zoom.hi === zoom.max, 'zoom is clamped to the camera min/max: ' + JSON.stringify(zoom));
const cam = await fpage.evaluate(() => { const p = window.__park, c = p.controls, b = p.terrain.bounds; let worst = 1e9; for (const [x, z] of [[b.minX + 0.8, b.minZ + 0.8], [b.minX + 0.8, 0], [0, b.minZ + 0.8]]) { c.teleportTo(x, z); c.advance(1.5); worst = Math.min(worst, p.camera.position.x - b.minX, p.camera.position.z - b.minZ); } return worst; });
ok(cam >= 0.5, 'camera never clips behind the north and west walls: ' + cam.toFixed(2));
const fox = await fpage.evaluate(() => { const p = window.__park, f = p.npcs[0]; p.setTime('day'); const day = f.mode(); p.setTime('night'); const night = f.mode(); const o = f.object.position; p.controls.teleportTo(o.x + 1.2, o.z + 1.2); p.controls.advance(0.3); window.__lastNpc = null; const r = p.talk('foxy'); return { day, night, r, ev: window.__lastNpc }; });
ok(fox.day === 'kitchen' && fox.night === 'couch', 'Foxy sits on the couch in the evening and cooks by day: ' + fox.day + '/' + fox.night);
ok(fox.r && fox.ev && fox.ev.id === 'foxy', 'talking to Foxy emits npc {id:foxy}');
await fpage.evaluate(() => { const c = window.__park.controls; c.teleportTo(0, 0); c.advance(0.3); window.__lastNpc = null; c.talkTo('foxy'); c.advance(8); });
ok(await fpage.evaluate(() => typeof window.__park.controls.state().talk !== 'undefined'), 'walk-to-talk runs without errors');
for (const t of ['day', 'dusk', 'night']) { ok(await fpage.evaluate((t) => { window.__park.setTime(t); window.__park.controls.advance(0.2); return true; }, t), 'flat time ' + t); }
await fpage.waitForTimeout(400);
ok(ferrs.length === 0, 'flat: no page or console errors' + (ferrs.length ? ': ' + ferrs.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done('beatbox_heroes_park3d');
