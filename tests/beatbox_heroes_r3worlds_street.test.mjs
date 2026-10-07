// Neon Row + hood world gate (W-STREET, PORT_PLAN section 3): loads `street` and `hood` through the real Park3D host in headless Chromium (swiftshader WebGL) and checks
//   the five door spots (park home shop studio bar, kind 'door') + the `map` spot, budgets (street <= 150k tris / 120 calls, hood <= 80k tris / 120 calls), walks from the start to
//   every door and the map board, the open / closed look of every door (setSpotState), hood pins (tap emits the spot, lock + goal state), time and rain without errors.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_r3worlds_street: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_r3worlds_street: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_r3worlds_street: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: r3worlds_street suite hung'); process.exit(1); }, 480000);
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'r3street_test_'));
execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--out', path.join(tmp, 'park3d.bundle.js')], { stdio: 'pipe' });
const pageSrc = fs.readFileSync(path.join(REPO, 'beatbox_heroes/world3d.html'), 'utf8');
for (const m of pageSrc.matchAll(/<script src="([\w.]+\.js)"/g)) { const f = path.join(REPO, 'beatbox_heroes', m[1]); if (m[1] !== 'park3d.bundle.js' && fs.existsSync(f)) fs.copyFileSync(f, path.join(tmp, m[1])); }
fs.writeFileSync(path.join(tmp, 'world3d.html'), pageSrc.replace(/park3d\.bundle\.js(\?v=\w+)?/, 'park3d.bundle.js'));

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(pathToFileURL(path.join(tmp, 'world3d.html')).href + '?world=street&q=med&t=dusk');
await page.waitForFunction(() => window.__world || window.__worldError, null, { timeout: 120000 });
ok(await page.evaluate(() => !!window.__world && window.__world.id === 'street'), 'street loads through the host: ' + (await page.evaluate(() => window.__worldError || 'ok')));

// ---------- spots ----------
const DOORS = ['park', 'home', 'shop', 'studio', 'bar'];
const sp = await page.evaluate(() => {
  const w = window.__world, defs = w.terrain.spotDefs || [], live = (w.spots && w.spots.spots) || [];
  return { defs: defs.map((d) => ({ id: d.id, kind: d.kind || '', x: d.x, z: d.z })), live: live.map((s) => ({ id: s.id, kind: s.kind, placed: s.placed })), anchors: Object.keys(w.terrain.anchors), bounds: w.terrain.bounds };
});
for (const id of DOORS) { const d = sp.defs.find((x) => x.id === id), l = sp.live.find((x) => x.id === id); ok(!!d && d.kind === 'door', 'spotDef ' + id + ' exists with kind door'); ok(!!l && l.kind === 'door' && l.placed !== false, 'live spot ' + id + ' is a placed door'); }
{ const m = sp.defs.find((x) => x.id === 'map'), l = sp.live.find((x) => x.id === 'map'); ok(!!m && m.kind !== 'door', 'map spot (bus stop board) exists and is not a door'); ok(!!l && l.placed !== false, 'live map spot is placed'); }
const xs = DOORS.map((id) => sp.defs.find((x) => x.id === id).x); ok(xs.every((x, i) => i === 0 || x > xs[i - 1]), 'doors are in x order park < home < shop < studio < bar: ' + xs.join(' '));
ok(sp.bounds.maxX - sp.bounds.minX >= 68 && sp.bounds.maxZ - sp.bounds.minZ >= 20, 'street footprint about 70 x 22 m: ' + JSON.stringify(sp.bounds));
ok(sp.defs.length === 6, 'exactly the 5 doors + map: ' + sp.defs.map((d) => d.id).join(','));

// ---------- budgets (street) ----------
const bud = await page.evaluate(() => { const h = window.__host; for (let i = 0; i < 2; i++) h.tick(0.05); return Object.assign(h.stats(), { terrain: window.__world.terrain.stats() }); });
ok(bud.tris > 1000 && bud.tris <= 150000, 'street tris within 150k: ' + bud.tris);
ok(bud.calls > 0 && bud.calls <= 120, 'street draw calls within 120: ' + bud.calls);
ok(bud.over.length === 0, 'host reports no budget overrun: ' + JSON.stringify(bud.over));
console.log('  street: ' + bud.tris + ' tris, ' + bud.calls + ' calls, own meshes ' + bud.terrain.tris + ' tris in ' + bud.terrain.parts + ' parts, build ' + bud.terrain.buildMs + ' ms, load ' + bud.loadMs + ' ms');

// ---------- door looks: open and closed ----------
const looks = await page.evaluate(() => {
  const w = window.__world, T = w.terrain, out = {};
  for (const id of ['park', 'home', 'shop', 'studio', 'bar']) { const a = T.state(id); w.setSpotState(id, { locked: true, reason: 'closed' }); const b = T.state(id), ls = w.spots.getSpotState ? w.spots.getSpotState(id) : null; w.setSpotState(id, { locked: false }); out[id] = [a, b, T.state(id), ls && ls.locked]; }
  return out;
});
for (const id of DOORS) ok(looks[id][0] === 'open' && looks[id][1] === 'closed' && looks[id][2] === 'open', id + ' door swaps open -> closed -> open look: ' + JSON.stringify(looks[id]));
ok(DOORS.every((id) => looks[id][3] === true), 'locked state also reaches the spot (padlock + grey icon)');

// ---------- walk from the start to every door and the map board ----------
const walks = await page.evaluate(async () => {
  // logic-only stepping (controls + spots, no render): the swiftshader frame is far slower than the walk itself
  const w = window.__world, got = [], T = w.terrain, res = {}; let t = 100; w.events.on('spot', (e) => got.push(e.id + ':' + e.scene));
  const step = (dt) => { t += dt; w.controls.update(dt, t); w.spots.update(dt, t, w.player.object.position); };
  const start = T.anchors.start;
  for (const id of ['park', 'home', 'shop', 'map', 'studio', 'bar']) {
    got.length = 0; w.controls.teleportTo(start.x, start.z); for (let i = 0; i < 5; i++) step(0.05);
    const okw = w.walkToSpot(id, { run: true }); let n = 0; while (!got.some((g) => g.indexOf(id + ':') === 0) && n < 1500) { step(0.05); n++; }
    res[id] = { started: okw, fired: got.some((g) => g === id + ':street'), ticks: n, pos: w.controls.state() }; w.done(id); for (let i = 0; i < 4; i++) step(0.05);
  }
  return res;
});
for (const id of ['park', 'home', 'shop', 'map', 'studio', 'bar']) ok(walks[id].started && walks[id].fired, 'walk from the start to ' + id + ' fires its spot (' + walks[id].ticks + ' ticks, at x ' + walks[id].pos.x + ' z ' + walks[id].pos.z + ')');
// walking never leaves the strip
const strip = await page.evaluate(() => { const w = window.__world, T = w.terrain; return [T.blocked(0, -3.5), T.blocked(0, 0), T.blocked(0, 8.6), T.blocked(-36, 0), T.blocked(35.5, 0), T.heightAt(0, 0) > T.heightAt(0, 6), T.blocked(-5, -1), T.blocked(-15, -1.2)]; });
ok(strip[0] && !strip[1] && strip[2] && strip[3] && strip[4] && strip[5] && strip[6] && !strip[7], 'walk strip z -3..8 inside x +-34, frontage only open at door bays, kerb is higher than the road: ' + strip.join(','));

// ---------- time of day, rain, the bouncer, no errors ----------
const env = await page.evaluate(async () => {
  const h = window.__host, w = window.__world, o = {}; for (const t of ['day', 'dusk', 'night']) { w.setTime(t, true); h.tick(0.05); }
  w.setWeather('rain'); w.lighting.setWeather('rain', true); for (let i = 0; i < 2; i++) h.tick(0.05); o.rain = w.lighting.getState().rain; w.setWeather('clear'); w.lighting.setWeather('clear', true); h.tick(0.05);
  o.npc = (w.npcs || []).map((n) => n.id); o.nightStats = h.stats(); return o;
});
ok(env.rain > 0.5, 'rain state reaches the lighting (wet puddles): ' + env.rain);
ok(env.npc.indexOf('bouncer') >= 0, 'the bar has its bouncer: ' + JSON.stringify(env.npc));
ok(env.nightStats.tris <= 150000 && env.nightStats.calls <= 120, 'night + rain frame still within budgets: ' + env.nightStats.tris + ' tris ' + env.nightStats.calls + ' calls');
ok(await page.evaluate(() => { const w = window.__world; return !!w.scene.getObjectByName('street_b') && !!w.scene.getObjectByName('steam') && !!w.scene.getObjectByName('cat'); }), 'street meshes, steam and the cat are in the scene');

// ---------- hood ----------
await page.evaluate(async () => { await window.__host.load('hood', { time: 'dusk', here: 'street', px: 6 }); window.__world = window.__host.world; });
ok(await page.evaluate(() => window.__host.world && window.__host.world.id === 'hood'), 'hood loads through the host');
const hood = await page.evaluate(async () => {
  const h = window.__host, w = h.world, T = w.terrain; for (let i = 0; i < 3; i++) h.tick(0.05);
  const o = { ids: T.spotDefs.map((d) => d.id), live: w.spots.spots.map((s) => s.id), stats: h.stats(), own: T.stats(), pins: Object.keys(T.pinMeshes || {}), here: T.here };
  // tap every pin through real pointer events at its projected screen position
  const cv = h.canvas, r = cv.getBoundingClientRect(), got = []; w.events.on('spot', (e) => got.push(e.id + ':' + e.scene)); o.tapped = {};
  for (const id of o.ids) {
    const p = T.pins[id], v = new w.camera.position.constructor(p.x, 1.0, p.z).project(w.camera), cx = r.left + (v.x * 0.5 + 0.5) * r.width, cy = r.top + (-v.y * 0.5 + 0.5) * r.height, n = got.length;
    const ev = (type) => new PointerEvent(type, { pointerId: 7, clientX: cx, clientY: cy, bubbles: true, isPrimary: true }); cv.dispatchEvent(ev('pointerdown')); cv.dispatchEvent(ev('pointerup')); h.tick(0.05); o.tapped[id] = got.slice(n).some((g) => g === id + ':hood');
  }
  // locked + goal state, then a drag must not tap
  w.setSpotState('bar', { locked: true, reason: 'closed' }); w.setSpotState('shop', { goal: true }); h.tick(0.05); o.locked = w.spots.getSpotState('bar').locked; const n2 = got.length;
  cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, clientX: 100, clientY: 300, bubbles: true, isPrimary: true })); cv.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, clientX: 160, clientY: 320, bubbles: true, isPrimary: true })); cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, clientX: 160, clientY: 320, bubbles: true, isPrimary: true })); o.dragTap = got.length - n2;
  for (const t of ['day', 'night']) { w.setTime(t, true); h.tick(0.05); } w.setWeather('rain'); w.lighting.setWeather('rain', true); h.tick(0.05); o.stats2 = h.stats(); return o;
});
const five = ['park', 'home', 'shop', 'studio', 'bar'];
ok(JSON.stringify(hood.ids) === JSON.stringify(five) && JSON.stringify(hood.live) === JSON.stringify(five), 'hood spots are the five place ids: ' + hood.ids.join(','));
ok(five.every((id) => hood.tapped[id]), 'tapping each pin emits its spot: ' + JSON.stringify(hood.tapped));
ok(hood.dragTap === 0, 'dragging the table does not tap a pin');
ok(hood.locked === true, 'hood pin locked state reaches the spot');
ok(hood.stats.tris <= 80000 && hood.stats.calls <= 120 && hood.stats2.tris <= 80000, 'hood within 80k tris and 120 calls: ' + hood.stats.tris + ' tris ' + hood.stats.calls + ' calls (rain night ' + hood.stats2.tris + ')');
ok(hood.pins.length === 5 && hood.here.id === 'street', 'five pins and a YOU ARE HERE marker: ' + hood.pins.join(','));
console.log('  hood: ' + hood.stats.tris + ' tris, ' + hood.stats.calls + ' calls, ' + hood.own.lod + ' instanced blocks, build ' + hood.own.buildMs + ' ms');

// ---------- both worlds reload cleanly (no leak) ----------
const leak = await page.evaluate(async () => {
  const h = window.__host, res = {}; for (const id of ['street', 'hood']) { await h.load(id, { warm: true }); h.tick(0.05); h.unload(); const b = h.leakReport(); for (let i = 0; i < 2; i++) { await h.load(id, { warm: true }); h.unload(); } const e = h.leakReport(); res[id] = [b.geometries, e.geometries, b.textures, e.textures]; } return res;
});
for (const id of ['street', 'hood']) ok(leak[id][1] <= leak[id][0] + 2 && leak[id][3] <= leak[id][2] + 2, id + ' leaves nothing behind after reloads: geo ' + leak[id][0] + '->' + leak[id][1] + ' tex ' + leak[id][2] + '->' + leak[id][3]);

await page.waitForTimeout(200);
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done();
