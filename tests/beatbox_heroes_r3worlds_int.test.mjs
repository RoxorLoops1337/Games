// Interior worlds INT-A (PORT_PLAN M3): the Thrift Shop (world 'shop') and the Sound Lab (world 'lab'), loaded through the real host in headless Chromium (swiftshader WebGL).
// Checks: the spots exist with the exact ids, interior contract (interior flag, windows, lights, emissive night-glow materials, anchors, colliders, camera and presets), budgets at day/dusk/night
// (<= 100k tris, <= 70 draw calls), every anchor reachable from the start on the collision grid, shop details (20 pegs, clerk, mirror reflection, mirror camera preset),
// lab details (VU meters follow setBeat, REC lamp switches), lighting profiles, and no page or console errors.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_r3worlds_int: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_r3worlds_int: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_r3worlds_int: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: r3worlds_int suite hung'); process.exit(1); }, 420000);
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'r3int_test_'));
execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--out', path.join(tmp, 'park3d.bundle.js')], { stdio: 'pipe' });
const pageSrc = fs.readFileSync(path.join(REPO, 'beatbox_heroes/world3d.html'), 'utf8');
for (const m of pageSrc.matchAll(/<script src="([\w.]+\.js)"/g)) { const f = path.join(REPO, 'beatbox_heroes', m[1]); if (m[1] !== 'park3d.bundle.js' && fs.existsSync(f)) fs.copyFileSync(f, path.join(tmp, m[1])); }
fs.writeFileSync(path.join(tmp, 'world3d.html'), pageSrc.replace(/park3d\.bundle\.js(\?v=\w+)?/, 'park3d.bundle.js'));

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(pathToFileURL(path.join(tmp, 'world3d.html')).href + '?world=shop&q=med&t=dusk');
await page.waitForFunction(() => window.__world || window.__worldError, null, { timeout: 120000 });

// shared inspector, run inside the page for the world that is currently loaded
const INSPECT = () => {
  const w = window.__world, t = w.terrain, h = window.__host, out = {};
  out.id = w.id; out.profile = w.profile; out.interior = t.interior === true; out.windows = (t.windows || []).length; out.lights = (t.lights || []).length;
  out.winOk = (t.windows || []).every((q) => isFinite(q.x) && isFinite(q.y) && isFinite(q.z) && q.w > 0 && q.h > 0 && Math.abs(Math.hypot(q.nx, q.nz) - 1) < 1e-6);
  out.lightsOk = (t.lights || []).every((l) => isFinite(l.x) && isFinite(l.y) && isFinite(l.z) && typeof l.color === 'string' && l.r > 0);
  let glow = 0; w.scene.traverse((o) => { if (o.material && !Array.isArray(o.material) && o.material.userData && o.material.userData.nightGlow !== undefined) glow++; }); out.glowMats = glow;
  out.emissive = (t.emissive || []).length; out.cam = !!(t.camera && t.camera.dist && t.camera.pitch && t.camera.fov); out.presets = Object.keys(t.cameraPresets || {});
  out.spots = w.spots.spots.map((s) => s.id).sort(); out.kinds = Object.fromEntries(w.spots.spots.map((s) => [s.id, s.kind || '']));
  out.anchors = Object.fromEntries(Object.entries(t.anchors).filter(([k, v]) => v && isFinite(v.x)).map(([k, v]) => [k, { x: v.x, z: v.z }]));
  out.colliders = t.stats ? t.stats().colliders : 0; out.geoTris = t.stats ? Math.round(t.stats().tris) : 0; out.bounds = t.bounds;
  // reachability: flood fill of the collision grid (step 0.15 m) from the start anchor, then every spot anchor and the NPC anchors must be in the filled region
  const st = 0.15, b = t.bounds, nx = Math.ceil((b.maxX - b.minX) / st), nz = Math.ceil((b.maxZ - b.minZ) / st), seen = new Uint8Array(nx * nz), X = (i) => b.minX + (i + 0.5) * st, Z = (j) => b.minZ + (j + 0.5) * st;
  const cell = (x, z) => [Math.min(nx - 1, Math.max(0, Math.floor((x - b.minX) / st))), Math.min(nz - 1, Math.max(0, Math.floor((z - b.minZ) / st)))];
  const free = (i, j) => !t.keepout(X(i), Z(j), 0.2); const s0 = cell(t.anchors.start.x, t.anchors.start.z), q = [s0]; seen[s0[1] * nx + s0[0]] = 1; out.startFree = free(s0[0], s0[1]);
  while (q.length) { const [i, j] = q.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= nx || c >= nz || seen[c * nx + a] || !free(a, c)) continue; seen[c * nx + a] = 1; q.push([a, c]); } }
  out.reach = {}; for (const s of w.spots.spots) { const a = t.anchors[s.anchor] || t.anchors[s.id]; if (!a) { out.reach[s.id] = false; continue; } const [i, j] = cell(a.x, a.z); let r = false; for (let di = -2; di <= 2 && !r; di++) for (let dj = -2; dj <= 2 && !r; dj++) { const a2 = i + di, c2 = j + dj; if (a2 >= 0 && c2 >= 0 && a2 < nx && c2 < nz && seen[c2 * nx + a2]) r = true; } out.reach[s.id] = r; }
  out.reachFrac = +(seen.reduce((s, v) => s + v, 0) / (nx * nz)).toFixed(2);
  // budgets at the three times of day (renderer.info per frame)
  out.budget = {}; for (const tod of ['day', 'dusk', 'night']) { w.setTime(tod, true); for (let i = 0; i < 4; i++) h.tick(0.016); const s = h.stats(); out.budget[tod] = { tris: s.tris, calls: s.calls }; }
  out.lightState = w.lighting.getState ? w.lighting.getState().profile : null; out.over = h.stats().over;
  return out;
};
const budgetOk = (o, name) => Object.entries(o.budget).forEach(([tod, v]) => ok(v.tris <= 100000 && v.calls <= 70 && v.calls > 0, name + ' budget at ' + tod + ': ' + v.tris + ' tris, ' + v.calls + ' calls (<= 100k, <= 70)'));
const common = (o, name, spots, profile) => {
  ok(o.id === name, name + ': loaded through the host (' + o.id + ')');
  ok(o.interior && o.windows >= 1 && o.winOk, name + ': interior contract, windows (' + o.windows + ') well formed');
  ok(o.lights >= 4 && o.lightsOk, name + ': practical lights listed (' + o.lights + ')');
  ok(o.glowMats >= 1 && o.emissive >= 1, name + ': night-glow emissive materials (' + o.glowMats + ')');
  ok(o.cam && o.presets.length >= 3, name + ': camera settings and presets (' + o.presets.join(',') + ')');
  ok(JSON.stringify(o.spots) === JSON.stringify(spots.slice().sort()), name + ': spots are exactly ' + spots.join(',') + ' (got ' + o.spots.join(',') + ')');
  ok(o.kinds.door === 'door', name + ': the door spot is kind door');
  ok(o.profile === profile && o.lightState === profile, name + ': lighting profile ' + profile + ' (' + o.profile + '/' + o.lightState + ')');
  ok(o.colliders >= 15, name + ': colliders present (' + o.colliders + ')');
  ok(o.geoTris > 5000 && o.geoTris < 100000, name + ': geometry triangles in range (' + o.geoTris + ')');
  ok(o.startFree && Object.values(o.reach).every((v) => v), name + ': start is free and every spot anchor is reachable ' + JSON.stringify(o.reach));
  ok(o.reachFrac > 0.35, name + ': a large part of the floor is walkable (' + o.reachFrac + ')');
  budgetOk(o, name); ok(!o.over.length, name + ': host reports no budget overrun (' + o.over.join(',') + ')');
};

// ---------------------------------------------------------------- SHOP
const shop = await page.evaluate(INSPECT);
common(shop, 'shop', ['hats', 'racks', 'mirror', 'counter', 'door'], 'in');
ok(['mirror', 'hats', 'racks', 'counter'].every((k) => shop.presets.includes(k)), 'shop: camera presets mirror, hats, racks, counter');
const sd = await page.evaluate(async () => {
  const w = window.__world, h = window.__host, t = w.terrain, o = {}; for (let i = 0; i < 6; i++) h.tick(0.033);
  o.pegs = t.pegs; o.hats = t.hats; o.npcs = w.npcs.map((n) => n.id); o.mirror = !!t.mirror;
  const clerk = w.npcs.find((n) => n.id === 'clerk'), A = t.anchors.clerk; o.clerkAt = clerk ? [+clerk.object.position.x.toFixed(2), +clerk.object.position.z.toFixed(2)] : null; o.clerkWant = [A.x, A.z]; o.clerkBlocked = t.blocked(A.x, A.z);
  // mirror: stand the player on the platform, the reflection clones appear and follow the skeleton
  w.teleport('mirror'); for (let i = 0; i < 4; i++) h.tick(0.033); const refl = []; w.scene.traverse((m) => { if (m.name && m.name.indexOf('reflect_') === 0) refl.push(m); }); o.reflect = refl.length; o.reflectVisible = refl.filter((m) => m.visible).length;
  o.platformY = +t.heightAt(t.mirror.cx, t.mirror.cz).toFixed(3); o.floorY = t.heightAt(0, 0); o.playerY = +w.player.object.position.y.toFixed(3);
  o.focus = t.focusPreset('mirror', { ms: 0 }); w.release(); w.focus('mirror', { ms: 0 }); for (let i = 0; i < 20; i++) h.tick(0.033); o.focusing = w.controls.focusing; w.release();
  o.look = (() => { try { w.setLook({ top: { id: 'hoodie', color: '#e63946' } }); for (let i = 0; i < 3; i++) h.tick(0.033); return true; } catch (e) { return false; } })();
  w.setSpotState('door', { locked: true, reason: 'closed' }); o.lockState = w.spots.getSpotState('door').locked; w.setSpotState('door', { locked: false });
  return o;
});
ok(shop.id === 'shop' && sd.pegs === 20, 'shop: the hat wall has exactly 20 pegs (' + sd.pegs + ') and ' + sd.hats + ' hats hang on them');
ok(sd.hats >= 15 && sd.hats <= 20, 'shop: the wall is nearly full of hats (' + sd.hats + ')');
ok(sd.npcs.includes('clerk') && Math.abs(sd.clerkAt[0] - sd.clerkWant[0]) < 0.05 && Math.abs(sd.clerkAt[1] - sd.clerkWant[1]) < 0.05, 'shop: the clerk stands behind the counter ' + JSON.stringify(sd.clerkAt));
ok(sd.reflect === 3 && sd.reflectVisible === 3, 'shop: the player is mirrored in the wall mirror (3 reflection meshes visible: ' + sd.reflectVisible + ')');
ok(Math.abs(sd.platformY - 0.14) < 0.01 && sd.floorY === 0 && Math.abs(sd.playerY - sd.platformY) < 0.01, 'shop: the 2 m try-on platform lifts the player (' + sd.playerY + ')');
ok(sd.focus === true && sd.focusing === 'point', 'shop: world.focus("mirror") and terrain.focusPreset run the mirror camera preset (' + sd.focus + '/' + sd.focusing + ')');
ok(sd.look && sd.lockState, 'shop: setLook and door lock state work');

// ---------------------------------------------------------------- LAB
await page.evaluate(async () => { await window.__host.load('lab', { time: 'dusk' }); window.__world = window.__host.world; });
await page.waitForFunction(() => window.__host.world && window.__host.world.id === 'lab', null, { timeout: 60000 });
const lab = await page.evaluate(INSPECT);
common(lab, 'lab', ['mic', 'mixer', 'door'], 'studio');
ok(['desk', 'pads', 'booth'].every((k) => lab.presets.includes(k)), 'lab: camera presets desk, pads, booth');
const ld = await page.evaluate(async () => {
  const w = window.__host.world, h = window.__host, t = w.terrain, o = {}; const avg = () => t.vu.ladders.reduce((s, L) => s + L.lv, 0) / t.vu.ladders.length;
  // drive the terrain animation directly (no rendering) so the check is fast: 33 ms steps
  let T = 0; const run = (n, f) => { for (let i = 0; i < n; i++) { T += 0.033; t.update(0.033, T); if (f) f(); } };
  w.setBeat(0); run(90); o.idle = avg();
  let peak = 0; for (let k = 0; k < 6; k++) { w.setBeat(0); run(1); w.setBeat(1); run(12, () => { peak = Math.max(peak, avg()); }); } o.beat = peak;
  w.setBeat(0); run(120); o.after = avg();
  o.needles = t.vu.needles.length; o.ladders = t.vu.ladders.length; o.pads = t.vu.pads.length; o.rackLeds = t.vu.rackLeds.length; o.dyn = t.dynQuads;
  o.rec0 = t.isRec(); w.setSpotState('mic', { badge: 'REC' }); o.rec1 = t.isRec(); const on = w.scene.getObjectByName('lab_onair'), off = w.scene.getObjectByName('lab_onair_off'); o.signOn = on.visible && !off.visible; w.setSpotState('mic', { badge: false }); o.rec2 = t.isRec(); o.signOff = !on.visible && off.visible;
  o.focus = t.focusPreset('desk', { ms: 0 }); w.release(); w.focus('desk', { ms: 0 }); for (let i = 0; i < 6; i++) h.tick(0.033); o.focusing = w.controls.focusing; w.release(); o.npcs = w.npcs.length;
  const mic = t.anchors.micSpot, mix = t.anchors.mixerSpot; o.micInBooth = mic.x > 1.7 && mic.z < -0.55; o.mixerInRoom = mix.x < 1.7;
  return o;
});
ok(ld.ladders === 16 && ld.needles === 2 && ld.pads === 16 && ld.rackLeds >= 40, 'lab: 16 VU ladders, 2 needle meters, 16 MPC pads, rack LEDs (' + ld.rackLeds + ')');
ok(ld.beat > ld.idle + 0.12 && ld.beat > 0.45, 'lab: VU meters bounce on the lighting beat (idle ' + ld.idle.toFixed(2) + ', beat peak ' + ld.beat.toFixed(2) + ')');
ok(ld.after < ld.beat - 0.1, 'lab: meters fall back when the beat stops (' + ld.after.toFixed(2) + ')');
ok(!ld.rec0 && ld.rec1 && ld.signOn && !ld.rec2 && ld.signOff, 'lab: REC lamp and ON AIR sign follow setSpotState("mic", { badge })');
ok(ld.focus === true && ld.focusing === 'point' && ld.micInBooth && ld.mixerInRoom, 'lab: desk camera preset works, the mic spot is inside the glass booth, the mixer in the control room');
ok(ld.dyn > 300, 'lab: the live LED mesh holds ' + ld.dyn + ' quads in one draw call');

// ---------------------------------------------------------------- back and forth: both worlds rebuild and release cleanly
const cyc = await page.evaluate(async () => { const h = window.__host, r = []; for (const id of ['shop', 'lab', 'shop']) { const w = await h.load(id, { warm: false }); for (let i = 0; i < 3; i++) h.tick(0.016); r.push(w.id + ':' + h.stats().calls); } h.unload(); return r; });
ok(cyc.length === 3 && cyc[0].startsWith('shop') && cyc[1].startsWith('lab'), 'shop and lab reload through the host: ' + cyc.join(' '));
await page.waitForTimeout(300);
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done();
