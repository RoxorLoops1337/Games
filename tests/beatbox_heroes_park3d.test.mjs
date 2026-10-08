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
ok(a === 'bench,busk,flyers,gate,jam,run', 'five spots plus the story jam spot exist: ' + a);
{ // the jam (world_park.js story args): hidden until terrain.story.setJam(true), BeeAmGee seated by default (the game passes args.beeamgee from the story)
  const j = await page.evaluate(() => { const p = window.__park, st = p.terrain.story, js = p.spots.byId.jam, r = { bee: p.npcs.some((n) => n.id === 'beeamgee'), off: !js.placed && !st.jam.group.visible && !st.on() };
    st.setJam(true); p.spots.update(0.02, 1, p.player.object.position); r.on = js.placed && js.root.visible && st.jam.group.visible && Math.hypot(js.x - st.at.x, js.z - st.at.z) < 0.01;
    st.setJam(false); p.spots.update(0.02, 1, p.player.object.position); r.off2 = !js.placed && !js.root.visible && !st.jam.group.visible; return r; });
  ok(j.bee && j.off && j.on && j.off2, 'the jam spot and its cypher show and hide with terrain.story.setJam ' + JSON.stringify(j));
}
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
// tree canopies cast dappled leaf shadows (a shadow-only depth material with holes), never one solid hard-edged slab
const lf = await page.evaluate(() => { const t = window.__park.ctx.scene.getObjectByName('trees'); return { cast: !!(t && t.castShadow), leaf: !!(t && t.customDepthMaterial && t.userData.leafShadow) }; });
ok(lf.cast && lf.leaf, 'park tree canopies cast leafy (dappled) shadows ' + JSON.stringify(lf));
// passers-by: people walk the park paths, keep moving, and give way to the player standing in their way
const pb = await page.evaluate(() => {
  const p = window.__park, pb = p.ctx.passersby; if (!pb) return null; const W = pb.walkers, s0 = W.map((w) => w.s), out = { n: W.length, ids: W.map((w) => w.path.id) };
  for (let i = 0; i < 30; i++) pb.update(0.1, 100 + i * 0.1, null);
  out.moved = W.map((w, i) => Math.abs(w.s - s0[i]) > 0.3 || w.pause > 0 || w.dir !== 1).filter(Boolean).length;
  out.onPath = W.every((w) => { const q = w.c.object.position; return Number.isFinite(q.x) && Number.isFinite(q.z) && p.terrain.pathDist(q.x, q.z) < 3; });
  const w = W.find((q) => q.path.closed) || W[0], o = w.c.object.position; w.pause = 0; w.nextPause = 99; const fx = Math.sin(w.yaw), fz = Math.cos(w.yaw), pp = { x: o.x + fx * 1.1 + fz * 0.15, z: o.z + fz * 1.1 - fx * 0.15 };
  for (let i = 0; i < 10; i++) pb.update(0.1, 200 + i * 0.1, pp);
  out.slow = +w.slow.toFixed(2); out.side = +Math.abs(w.side).toFixed(2); return out;
});
ok(pb && pb.n >= 3, 'people stroll through the park ' + JSON.stringify(pb));
ok(pb && pb.moved === pb.n && pb.onPath, 'every passer-by keeps moving along a path ' + JSON.stringify(pb));
ok(pb && pb.slow < 0.8 && pb.side > 0.1, 'a passer-by slows down and steps aside for the player ' + JSON.stringify(pb));
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
// ---------- CTRL (WP P4): walkToSpot, focus/release, view inset, orbit, corridor, pick, spot states, door kind, no-npc safety ----------
await fpage.evaluate(() => { const p = window.__park; window.__evs = []; for (const k of ['spot', 'door', 'npc', 'focus', 'spotDone']) p.ctx.events.on(k, (e) => window.__evs.push([k, e])); p.setTime('day'); p.controls.release(); p.controls.teleportTo(3, 2); p.controls.advance(0.5); });
const ws = await fpage.evaluate(() => { const p = window.__park, c = p.controls; window.__evs.length = 0; const r = c.walkToSpot('kitchen', { run: true }); const g0 = c.state().goal; c.advance(10); const st = c.state(); const ev = window.__evs.filter((e) => e[0] === 'spot'); c.release(); c.advance(1); return { r, g0, spot: st.spot, ev: ev.length && ev[0][1], after: c.state().spot }; });
ok(ws.r && ws.g0 === 'kitchen' && ws.spot === 'kitchen' && ws.ev && ws.ev.id === 'kitchen' && ws.ev.scene === 'flat' && ws.after === null, 'walkToSpot walks the A* path to the ring, activates, release() frees the player ' + JSON.stringify(ws));
const wsn = await fpage.evaluate(() => { const c = window.__park.controls; return [c.walkToSpot('nope'), c.walkToSpot('kitchen') ? (c.stop(), true) : false]; });
ok(wsn[0] === false && wsn[1] === true, 'walkToSpot returns false for an unknown spot');
const lk = await fpage.evaluate(() => { const p = window.__park, c = p.controls; c.teleportTo(0, 2); c.advance(0.3); window.__evs.length = 0; const okS = p.spots.setSpotState('wardrobe', { locked: true, reason: 'Closed' }); c.walkToSpot('wardrobe'); c.advance(10); const ev = window.__evs.filter((e) => e[0] === 'spot').map((e) => e[1]); const res = { okS, ev: ev[0], ins: c.state().spot, st: p.spots.getSpotState('wardrobe'), bad: p.spots.setSpotState('zzz', { locked: true }) }; p.spots.setSpotState('wardrobe', { locked: false }); return res; });
ok(lk.okS && lk.ev && lk.ev.locked === true && lk.ev.reason === 'Closed' && lk.ins === null && lk.st.locked && lk.bad === false, 'locked spot still emits spot {locked,reason} but skips the cinematic ' + JSON.stringify(lk));
const sty = await fpage.evaluate(() => { const p = window.__park, s = p.spots; s.setSpotState('couch', { goal: true, badge: '3' }); s.setSpotState('bed', { locked: true, goal: true, badge: true }); s.setSpotState('desk', { badge: '#33aaff' }); p.controls.advance(1); const a = s.spots.find((x) => x.id === 'couch'), b = s.spots.find((x) => x.id === 'bed'); const out = { goal: a.ex && a.ex.beam.visible && a.ex.arrow.visible, dot: a.ex.dot.visible, lock: b.ex.lock.visible, dim: b.iconMesh.material.color.r < 0.9 }; s.setSpotState('couch', { goal: false, badge: false }); s.setSpotState('bed', { locked: false, goal: false, badge: false }); s.setSpotState('desk', { badge: false }); out.off = !a.ex.beam.visible && !a.ex.dot.visible && !b.ex.lock.visible && b.iconMesh.material.color.r === 1; return out; });
ok(sty.goal && sty.dot && sty.lock && sty.dim && sty.off, 'setSpotState draws and clears lock, goal beacon and badge ' + JSON.stringify(sty));
const dr = await fpage.evaluate(() => { const p = window.__park, c = p.controls, s = p.spots.spots.find((x) => x.id === 'door'); s.kind = 'door'; s.radius = 1.0; s.armed = false; c.teleportTo(s.x - 4, s.z - 3.5); c.advance(0.5); p.spots.refresh(p.player.object.position); window.__evs.length = 0; const early = window.__evs.length; c.walkToSpot('door'); c.advance(12); const evs = window.__evs.map((e) => e[0]); const n1 = evs.filter((e) => e === 'door').length; c.release(); c.advance(0.5); s.kind = ''; return { early, evs, n1, nearestSkips: true }; });
ok(dr.early === 0 && dr.n1 === 1 && dr.evs.indexOf('door') < dr.evs.indexOf('spot'), 'door kind fires door then spot once when the ring is entered ' + JSON.stringify(dr));
const fc = await fpage.evaluate(() => { const p = window.__park, c = p.controls, f = p.npcs[0], cam0 = { ...c.state().cam }; window.__evs.length = 0; const r1 = c.focus(f, { dist: 4, ms: 300 }); c.advance(1.5); const mid = c.state(); const cam1 = mid.cam; const r2 = c.focus('player', { ms: 0 }); const r3 = c.focus({ x: 2, y: 1, z: 2 }, { ms: 0 }); const bad = c.focus({}); c.release(); c.advance(2); const end = c.state(); return { r1, r2, r3, bad, k: mid.focus, id: mid.focusId, moved: Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z), k2: end.focus, id2: end.focusId, ev: window.__evs.filter((e) => e[0] === 'focus').map((e) => String(e[1].id)).join() }; });
ok(fc.r1 && fc.r2 && fc.r3 && !fc.bad && fc.k === 1 && fc.id === 'foxy' && fc.moved > 0.3 && fc.k2 === 0 && fc.id2 === null && /foxy.*player.*point.*null/.test(fc.ev), 'focus(npc|player|point) eases in, release() eases out and emits focus ' + JSON.stringify(fc));
const vi = await fpage.evaluate(() => { const p = window.__park, c = p.controls; c.teleportTo(0, 0); c.advance(1.5); const h = p.renderer.domElement.clientHeight, y0 = c.worldToScreen(p.player.object.position.x, 1, p.player.object.position.z).y; c.setViewInset({ bottom: Math.round(h * 0.45) }); c.advance(2); const y1 = c.worldToScreen(p.player.object.position.x, 1, p.player.object.position.z).y; const ins = c.state().inset; c.setViewInset({ bottom: 0 }); c.advance(2); const y2 = c.worldToScreen(p.player.object.position.x, 1, p.player.object.position.z).y; return { h, y0, y1, y2, ins }; });
ok(vi.y1 < vi.h * 0.55 && vi.y1 < vi.y0 - 40 && Math.abs(vi.y2 - vi.y0) < 6 && vi.ins.bottom > 0, 'setViewInset lifts the player above a bottom sheet and restores ' + JSON.stringify(vi));
const en = await fpage.evaluate(() => { const c = window.__park.controls; c.setEnabled(false); c.teleportTo(0, 0); const a = c.tapWorld(3, 3), b = c.interact(), cc = c.walkToSpot('kitchen'); c.setEnabled(true); const d = c.tapWorld(1, 1); c.stop(); return { a, b, cc, d, en: c.enabled }; });
ok(en.a === false && en.b === false && en.cc === false && en.d === true && en.en === true, 'setEnabled(false) blocks taps, interact and walkToSpot ' + JSON.stringify(en));
const pk = await fpage.evaluate(() => { const p = window.__park, c = p.controls, f = p.npcs[0], fp = f.object.position, q = c.worldToScreen(fp.x, 1.0, fp.z); c.teleportTo(0, 0); c.advance(0.5); const a = c.pick(q.x, q.y), g = c.pick(q.x + 150 > 520 ? 30 : q.x + 150, 880), n = c.pick(NaN, 3); const s = p.spots.spots.find((x) => x.id === 'kitchen'), sq = c.worldToScreen(s.x, s.iconY, s.z), sp = c.pick(sq.x, sq.y); window.__evs.length = 0; c.teleportTo(fp.x + 1, fp.z + 1); c.advance(0.4); const q2 = c.worldToScreen(fp.x, 1.0, fp.z), tapped = c.pick(q2.x, q2.y); c.talkTo('foxy'); return { a: a.type + ':' + a.id, g: g.type, n: n.type, sp: sp.type + ':' + sp.id, tapped: tapped.type, npcEv: window.__evs.filter((e) => e[0] === 'npc').map((e) => e[1].id + '/' + e[1].scene).join() }; });
ok(pk.a === 'npc:foxy' && (pk.g === 'ground' || pk.g === 'spot') && pk.n === 'none' && pk.sp === 'spot:kitchen' && pk.tapped === 'npc' && pk.npcEv === 'foxy/flat', 'pick() hit-tests npc, spot icon, ground and talking emits npc {id,scene} ' + JSON.stringify(pk));
const ob = await fpage.evaluate(() => { const p = window.__park, c = p.controls; c.teleportTo(0, 0); c.advance(0.5); const r = c.setMode('orbit', { shot: 'full', ms: 0 }); c.advance(0.5); const s0 = c.state(); const full = s0.orbit; c.setShot('head', 300); c.advance(1); const head = c.state().orbit; c.orbitTo({ yaw: 90, ms: 300 }); c.advance(1); const spun = c.state(); c.setAutoRotate(40); c.advance(6); const auto = c.state().orbit.yaw; c.setAutoRotate(0); const walk = c.tapWorld(2, 2); const bad = c.setShot('nope'); const zi = c.zoomBy(0.5), z2 = c.state().orbit.dist; const mode = c.state().mode; c.setMode('follow'); c.advance(1); return { r, full, head, yaw: spun.orbit.yaw, camx: spun.cam.x, auto, walk, bad, z2, mode, after: c.state().mode, cd: c.state().camDist, shots: c.shots.join() }; });
ok(ob.r && ob.mode === 'orbit' && ob.head.ty > ob.full.ty + 0.4 && ob.head.dist < ob.full.dist && ob.head.shot === 'head' && Math.abs(ob.yaw - 90) < 1 && ob.camx > 1 && ob.auto > 90 + 100 && ob.walk === false && ob.bad === false && ob.after === 'follow' && ob.shots === 'full,head,torso,legs,feet', 'orbit mode: shots, orbitTo, auto-rotate, no walking, back to follow ' + JSON.stringify(ob));
const cr = await fpage.evaluate(() => { const p = window.__park, c = p.controls, b = p.terrain.bounds; c.teleportTo(0, b.minZ + 2); c.advance(1.5); const ok1 = c.setCorridor({ mode: 'corridor', hWidth: 9, lockZ: 0, lateralK: 0.1 }); c.advance(1.5); const cz0 = c.state().cam.z; c.teleportTo(0, b.minZ + 8); c.advance(2); const cz1 = c.state().cam.z; const m = c.state().mode; c.setCorridor(null); return { ok1, m, dz: Math.abs(cz1 - cz0) }; });
ok(cr.ok1 && cr.m === 'corridor' && cr.dz < 3, 'corridor mode follows laterally only: camera z moved ' + cr.dz.toFixed(2) + ' for a 6 m player move');
const nn = await fpage.evaluate(() => { const p = window.__park, c = p.controls; p.npcs.splice(0); const out = {}; try { out.pick = c.pick(100, 100).type; out.tap = c.tapWorld(3, 3) !== undefined; out.talk = c.talkTo('foxy'); out.inter = typeof c.interact(); c.advance(1); const sp = p.spots; out.ss = sp.setSpotState('nothing', {}); out.none = true; } catch (e) { out.err = String(e); } return out; });
ok(!nn.err && nn.none && nn.talk === false, 'no npcs in the world never throws ' + JSON.stringify(nn));
const dsp = await fpage.evaluate(() => { const p = window.__park, c = p.controls, sv = p.spots.spots.splice(0); const out = {}; try { c.advance(1); out.w = c.walkToSpot('kitchen'); out.t = c.tapWorld(1, 1); out.pk = c.pick(200, 400).type; out.i = c.interact(); } catch (e) { out.err = String(e); } p.spots.spots.push(...sv); return out; });
ok(!dsp.err && dsp.w === false && dsp.i === false, 'a world with no spots never throws ' + JSON.stringify(dsp));
await fpage.waitForTimeout(400);
ok(ferrs.length === 0, 'flat: no page or console errors' + (ferrs.length ? ': ' + ferrs.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done('beatbox_heroes_park3d');
