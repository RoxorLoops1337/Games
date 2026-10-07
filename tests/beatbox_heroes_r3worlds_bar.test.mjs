// Stage and Club worlds (INT-B): the bar world, the arena world and the four rhythm venues (venue_*.js) through the REAL host in headless Chromium (swiftshader WebGL).
// Checks: both worlds load via host.load, spots / anchors / NPC slots / world methods, programme + chalkboard follow setClock, crowd count 8..24, budgets (bar <= 100k tris and <= 70 calls, arena <= 120k and <= 90),
// every venue builds, updates, reports stats and disposes, the arena VS sequence and score reveal run, no page or console errors.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.BBH_BROWSER === '1';
function skip(why) { console.log('beatbox_heroes_r3worlds_bar: SKIPPED, ' + why); if (REQUIRED) { console.log('beatbox_heroes_r3worlds_bar: 0 passed, 1 failed'); process.exit(1); } console.log('beatbox_heroes_r3worlds_bar: 0 passed, 0 failed'); process.exit(0); }
let chromium; try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!exe || !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: r3worlds_bar suite hung'); process.exit(1); }, 480000);
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'r3worlds_bar_'));
execFileSync('node', [path.join(REPO, 'tools/beatbox_heroes/build_park3d.mjs'), '--out', path.join(tmp, 'park3d.bundle.js')], { stdio: 'pipe' });
const pageSrc = fs.readFileSync(path.join(REPO, 'beatbox_heroes/world3d.html'), 'utf8');
for (const m of pageSrc.matchAll(/<script src="([\w.]+\.js)"/g)) { const f = path.join(REPO, 'beatbox_heroes', m[1]); if (m[1] !== 'park3d.bundle.js' && fs.existsSync(f)) fs.copyFileSync(f, path.join(tmp, m[1])); }
fs.writeFileSync(path.join(tmp, 'world3d.html'), pageSrc.replace(/park3d\.bundle\.js(\?v=\w+)?/, 'park3d.bundle.js'));

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.setDefaultTimeout(120000);
await page.goto(pathToFileURL(path.join(tmp, 'world3d.html')).href + '?world=bar&t=night&q=high');
await page.waitForFunction(() => window.__world || window.__worldError, null, { timeout: 120000 });

// ---------------------------------------------------------------- THE BAR
const bar = await page.evaluate(async () => {
  const w = window.__world, h = window.__host, out = {}; for (let i = 0; i < 3; i++) h.tick(0.05);
  out.id = w.id; out.profile = w.profile; out.err = window.__worldError || null; out.interior = !!(w.terrain && w.terrain.interior);
  const spots = w.spots && w.spots.spots ? w.spots.spots.map((s) => ({ id: s.id, kind: s.kind })) : []; out.spots = spots;
  const A = w.terrain.anchors; out.anchors = ['start', 'doorSpot', 'stageSpot', 'counterSpot', 'rohzel', 'regular0', 'regular1', 'regular2', 'discoBall', 'stageCenter'].filter((k) => !A[k]); out.rig = (A.rig || []).length;
  out.defIds = (w.terrain.spotDefs || []).map((d) => d.id); out.stools = [0, 1, 2, 3, 4, 5].filter((i) => !A['stool' + i]);
  out.npcs = (w.npcs || []).map((n) => n.id + ':' + (n.slot || '')); out.methods = ['setCrowd', 'setProgramme', 'setLyrics', 'setTheme', 'regularOf', 'setClock', 'setBeat'].filter((k) => typeof w[k] !== 'function');
  out.reg = [w.regularOf('regular0'), w.regularOf('regular1'), w.regularOf('regular2')];
  out.prog0 = w.programme() && w.programme().id;
  // programme follows the day: Core.barProgramme (Tue..Thu open mic, Fri showcase, Sat battle, Sun karaoke)
  const days = {}; for (const d of [1, 4, 5, 6]) { w.setClock({ hour: 21, day: d }); days[d] = w.bar.state().programme; } out.days = days;
  w.setClock({ hour: 21, day: 5 }); out.dayName = w.bar.state().dayName; out.crowdBattle = w.bar.state().crowd;
  const cnt = {}; for (const n of [8, 16, 24, 40, 0]) { w.setCrowd(n); cnt[n] = w.terrain.crowd.mesh.count; } out.cnt = cnt;
  w.setCrowd(24); for (let i = 0; i < 3; i++) { w.setBeat(i / 2); h.tick(0.05); } w.setLyrics(['SING ALONG', 'line two']); h.tick(0.05); w.setLyrics(null); w.setTheme('cyan'); w.setEnergy && w.setEnergy(0.8);
  out.ledOn = !!w.terrain.led && w.terrain.led.mesh.visible; out.boards = !!(w.terrain.boards && w.terrain.boards.board && w.terrain.boards.banner);
  out.heightOk = w.terrain.heightAt(0, 0) === 0 && w.terrain.blocked(3.5, -4) && !w.terrain.blocked(-0.3, 3.0) && !w.terrain.blocked(A.counterSpot.x, A.counterSpot.z) && !w.terrain.blocked(A.stageSpot.x, A.stageSpot.z);
  const seatsFree = ['regular0', 'regular1', 'regular2'].map((k) => w.terrain.blocked(A[k].x, A[k].z)); out.seatsOk = seatsFree.length === 3;
  const pad = ['stage', 'counter', 'door'].map((id) => { const s = w.spots.spots.find((x) => x.id === id); return s ? Math.hypot(s.x - A[id === 'door' ? 'doorSpot' : id + 'Spot'].x, s.z - A[id === 'door' ? 'doorSpot' : id + 'Spot'].z) : 99; }); out.spotPlace = pad.every((d) => d < 0.5);
  for (let i = 0; i < 6; i++) h.tick(0.05); out.stats = h.stats(); out.q = {};
  for (const q of ['med', 'low']) { h.setQuality(q); for (let i = 0; i < 3; i++) h.tick(0.05); out.q[q] = h.stats(); } h.setQuality('high');
  return out;
});
ok(bar.id === 'bar' && !bar.err && bar.profile === 'club' && bar.interior, 'bar loads through the host as a club interior ' + JSON.stringify({ id: bar.id, p: bar.profile, e: bar.err }));
ok(['stage', 'counter', 'door'].every((id) => bar.spots.some((s) => s.id === id)) && bar.spots.find((s) => s.id === 'door').kind === 'door', 'bar spots: stage, counter and a door-kind exit ' + JSON.stringify(bar.spots));
ok(bar.anchors.length === 0 && bar.rig === 6 && bar.stools.length === 0, 'bar anchors: start, doorSpot, stageSpot, counterSpot, rohzel, regular0..2, discoBall, stageCenter, 6 rig mounts, 6 stools ' + JSON.stringify(bar.anchors));
ok(bar.spotPlace && bar.heightOk, 'bar spots sit on their anchors, stage is blocked, spots and start are walkable');
ok(bar.npcs.includes('rohzel:rohzel') && ['regular0:regular0', 'regular1:regular1', 'regular2:regular2'].every((s) => bar.npcs.includes(s)), 'bar NPC slots filled and seated: ' + bar.npcs.join(','));
ok(bar.methods.length === 0, 'bar world methods are on the world object ' + JSON.stringify(bar.methods));
ok(bar.reg[0] === 'luca' && bar.reg[1] === 'mira' && bar.reg[2] === 'sky', 'regulars resolve to Core ROMANCE ids ' + JSON.stringify(bar.reg));
ok(bar.days[1] === 'openmic' && bar.days[4] === 'showcase' && bar.days[5] === 'battle' && bar.days[6] === 'karaoke', 'programme follows setClock day ' + JSON.stringify(bar.days));
ok(bar.dayName === 'Saturday' && bar.crowdBattle === 24 && bar.boards, 'chalkboard + banner redrawn for battle night (Saturday), crowd 24 ' + bar.dayName);
ok(bar.cnt[8] === 8 && bar.cnt[16] === 16 && bar.cnt[24] === 24 && bar.cnt[40] === 24 && bar.cnt[0] === 0, 'setCrowd(n) clamps to 0..24 instances ' + JSON.stringify(bar.cnt));
ok(bar.ledOn, 'LED screen present');
ok(bar.stats.tris <= 100000 && bar.stats.calls <= 70, 'bar budget <= 100k tris and <= 70 calls: ' + bar.stats.tris + ' tris, ' + bar.stats.calls + ' calls');
ok(bar.q.med.calls <= 70 && bar.q.low.calls <= 70 && bar.q.med.tris <= 100000, 'bar budget holds on med and low: ' + JSON.stringify(bar.q));

// ---------------------------------------------------------------- THE ARENA
const arena = await page.evaluate(async () => {
  const h = window.__host, out = {}; const w = await h.load('arena', { time: 'night', opp: 3, you: 'TAY' }); for (let i = 0; i < 4; i++) h.tick(0.05);
  out.id = w.id; out.profile = w.profile; out.spots = (w.terrain.spotDefs || []).length; out.A = ['start', 'opponent', 'judges', 'player', 'rig'].filter((k) => !w.terrain.anchors[k]);
  out.methods = ['setOpponent', 'vs', 'setScores', 'reveal', 'camera', 'whip', 'cheer', 'setTheme', 'previewVenue'].filter((k) => typeof w[k] !== 'function');
  out.judges = w.arena.judges.map((j) => j.displayName || j.id); out.theme3 = w.arena.theme; out.themeLight = w.lighting.getState().theme;
  out.cams = Object.keys(w.arena.cams); w.setOpponent(1); out.theme1 = w.arena.theme; w.setOpponent(0); out.theme0 = w.arena.theme;
  out.oppName = w.arena.vsState().oppName;
  w.vs({ you: 'TAY', opp: 'Lil Tick', round: 2 }); for (let i = 0; i < 6; i++) h.tick(0.1); out.camAfterVs = w.cameraName();
  for (const n of ['wide', 'vs', 'oppClose', 'youClose', 'over', 'judges', 'crowd']) { w.camera(n, { ms: 0 }); h.tick(0.05); out.last = w.cameraName(); } w.camera('wide', { ms: 0 }); h.tick(0.05); out.cam = w.cameraName();
  w.setScores([8, 7, 9, 6, 7], false); out.scores = w.arena.scoresNow(); w.setScores(null); out.cleared = w.arena.scoresNow().every((s) => s === null); w.setScores([5, 5, 5, 5, 5], true); for (let i = 0; i < 90; i++) h.tick(0.05); out.revealed = w.arena.scoresNow().filter((s) => s === 5).length;
  w.mood('happy'); w.cheer(1); w.camera('wide', { ms: 0 }); for (let i = 0; i < 6; i++) h.tick(0.05); out.stats = h.stats(); out.over = out.stats.over; out.player = !!w.player && Math.abs(w.player.object.position.x + 2.7) < 0.3;
  return out;
});
ok(arena.id === 'arena' && arena.profile === 'stage' && arena.spots === 0, 'arena loads through the host with the stage profile and no spots');
ok(arena.A.length === 0 && arena.methods.length === 0, 'arena anchors and world methods present ' + JSON.stringify([arena.A, arena.methods]));
ok(arena.judges.length === 5 && ['Tek', 'Mel', 'Origi', 'Showtime', 'Wildcard'].every((n) => arena.judges.includes(n)), 'five judges: ' + arena.judges.join(','));
ok(arena.theme3 === 'gold' && arena.themeLight === 'gold' && arena.theme1 === 'cyan' && arena.theme0 === 'pink', 'theme follows the opponent style % 4 and reaches lighting.setStageTheme: ' + [arena.theme3, arena.themeLight, arena.theme1, arena.theme0]);
ok(['wide', 'vs', 'oppClose', 'youClose', 'over', 'judges', 'crowd'].every((n) => arena.cams.includes(n)), 'camera presets: ' + arena.cams.join(','));
ok(arena.camAfterVs !== null && arena.cam === 'wide' && arena.player, 'VS whip runs, presets switch, the player stands on the left podium');
ok(arena.scores[0] === 8 && arena.scores[4] === 7 && arena.cleared && arena.revealed === 5, 'judge scores set, cleared and revealed in sequence');
ok(arena.stats.tris <= 120000 && arena.stats.calls <= 90, 'arena budget <= 120k tris and <= 90 calls: ' + arena.stats.tris + ' tris, ' + arena.stats.calls + ' calls');

// ---------------------------------------------------------------- RHYTHM VENUES
const ven = await page.evaluate(async () => {
  const h = window.__host, w = h.world, out = {}; w.previewVenue('arena'); // back to the arena dressing
  for (const name of ['bar', 'showcase', 'booth', 'arena']) {
    const v = w.previewVenue(name, name === 'arena' ? { scale: 1.6, opp: 2 } : {}); const r = { methods: ['update', 'setEnergy', 'dispose', 'setBeat', 'setTheme', 'stats'].filter((k) => typeof v[k] !== 'function'), group: !!v.group && !!v.group.parent, anchors: !!v.anchors && !!v.cams.play };
    v.setEnergy(0.9); v.setBeat(1); for (let i = 0; i < 4; i++) { v.update(0.05, 1 + i * 0.05, { energy: 0.9, beat: i * 0.7, spb: 0.6, approach: 1.43 }); h.tick(0.05); }
    r.stats = v.stats(); r.over = h.stats(); out[name] = r;
    if (name === 'bar') { v.setLyrics(['line one', 'line two']); v.setTitle('KARAOKE', 'x'); } if (name === 'showcase') { v.pyro(0.5); v.cheer(0.5); h.tick(0.05); h.tick(0.05); } if (name === 'booth') { v.setGhost(false); v.setGhost(true); }
  }
  let thrown = false; try { const c = w.previewVenue('nope'); } catch (e) { thrown = true; } out.unknown = thrown;
  return out;
});
for (const name of ['bar', 'showcase', 'booth', 'arena']) {
  const r = ven[name];
  ok(r && r.methods.length === 0 && r.group && r.anchors, 'venue ' + name + ' honours the contract { group, update, setEnergy, setBeat, setTheme, dispose, stats, anchors, cams } ' + JSON.stringify(r && r.methods));
  const lim = { bar: 60000, showcase: 70000, booth: 40000, arena: 100000 }[name];
  ok(r.stats.tris <= lim && r.stats.draws <= 70, 'venue ' + name + ' budget <= ' + lim + ' tris (own ' + r.stats.tris + ') and <= 70 draws (own ' + r.stats.draws + '), frame total ' + r.over.tris + ' tris / ' + r.over.calls + ' calls');
}
ok(ven.unknown === true, 'buildVenue rejects an unknown venue name');

// ---------------------------------------------------------------- unload leaves nothing behind
const leak = await page.evaluate(async () => {
  const h = window.__host, cyc = async () => { await h.load('bar'); h.tick(0.05); await h.load('arena'); h.tick(0.05); h.world.previewVenue('showcase'); h.tick(0.05); h.world.previewVenue('booth'); h.tick(0.05); h.unload(); return h.leakReport(); };
  const a = await cyc(), b = await cyc(); let c = b; for (let i = 0; i < 3; i++) c = await cyc(); return { a, b, c };
});
const tol = (v) => Math.max(2, Math.ceil(v * 0.05));
ok(leak.c.geometries <= leak.b.geometries + tol(leak.b.geometries) && leak.c.textures <= leak.b.textures + tol(leak.b.textures) && leak.c.programs <= leak.b.programs + tol(leak.b.programs), 'bar, arena and the venues unload cleanly: no growth over 3 more cycles ' + JSON.stringify({ geo: [leak.b.geometries, leak.c.geometries], tex: [leak.b.textures, leak.c.textures], prog: [leak.b.programs, leak.c.programs] }));
await page.waitForTimeout(300);
ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); clearTimeout(watchdog);
done();
