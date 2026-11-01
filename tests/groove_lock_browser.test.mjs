// Groove Lock in REAL headless Chromium: boot, title, real mouse and keyboard input, a full playthrough of every level,
// hints, undo, jam mode, saves, desktop layout, and an OFFLINE render of every voice and the full groove (is it audible,
// finite, unclipped, and does each voice sound like what it claims to be).
// SKIPPED (exit 0) when playwright or a Chromium build is missing, unless GL_BROWSER=1.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.GL_BROWSER === '1';
let passed = 0, failed = 0;
const ok = (c, n) => { if (c) passed++; else { failed++; console.error('FAIL: ' + n); } };
const finish = () => { console.log(`groove_lock_browser: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); };
function skip(why) { console.log('groove_lock_browser: SKIPPED, ' + why); if (REQUIRED) { console.log('groove_lock_browser: 0 passed, 1 failed'); process.exit(1); } console.log('groove_lock_browser: 0 passed, 0 failed'); process.exit(0); }

const req = createRequire(import.meta.url);
let chromium = null;
for (const spec of [path.join(REPO, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright']) { try { chromium = req(spec).chromium; break; } catch (e) { /* next */ } }
if (!chromium) skip('playwright is not installed');
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (exe && !fs.existsSync(exe)) skip('no Chromium build found');

const watchdog = setTimeout(() => { console.error('FAIL: browser suite hung'); process.exit(1); }, 150000);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  const p = path.join(REPO, decodeURIComponent(rq.url.split('?')[0]));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/groove_lock/index.html`;

let browser;
try { browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] }); } catch (e) { skip('Chromium would not start: ' + e.message); }
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(URL); await page.waitForTimeout(800);
const sleep = (ms) => page.waitForTimeout(ms);
const ev = (f, a) => page.evaluate(f, a);
const varied = () => ev(() => { const c = document.getElementById('cv'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 211) s.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return s.size; });

// ---------------------------------------------------------------- boot + title
ok(await ev(() => typeof window.RJ === 'object' && typeof RJ.draw === 'function'), 'the approved Roxor and Jasmin art kit loads');
ok((await ev(() => GL.mode)) === 'menu', 'boots to the title screen');
ok((await varied()) > 40, 'title canvas has plenty of colours (ring, cubes, Roxor, Jasmin)');
ok(await ev(() => document.getElementById('menu').classList.contains('on') && document.getElementById('bPlay').offsetHeight > 40), 'PLAY button is visible');
await page.mouse.click(195, 350); await sleep(250);
ok(await ev(() => GL.A.ready() && GL.A.running), 'a tap anywhere unlocks audio and starts the finished song on the title');

// ---------------------------------------------------------------- level 1 with real input
await page.click('#bPlay'); await sleep(300);
ok((await ev(() => GL.mode)) === 'play' && (await ev(() => GL.level.id)) === 'heartbeat', 'PLAY starts the first unfinished level');
ok((await ev(() => GL.par)) === 8, 'par is shown from the solver');
ok(await ev(() => !document.getElementById('hud').hidden && !document.getElementById('tools').hidden), 'HUD and toolbar appear');
ok((await ev(() => document.getElementById('tip').classList.contains('on'))), 'first visit shows the tutorial tip');
await page.click('#tip'); await sleep(100);
ok(!(await ev(() => document.getElementById('tip').classList.contains('on'))), 'tip can be dismissed');

const geo = await ev(() => { const g = GL.stackGeom()[0]; return { x: g.cx, y: GL.L.stackTop + 40 }; });
await page.mouse.click(geo.x, geo.y); await sleep(500);
ok((await ev(() => GL.game.ring.filter(Boolean).length)) === 1 && (await ev(() => GL.game.stacks[0].length)) === 2, 'tapping the lorry drops the cube into the dock slot');
ok((await ev(() => GL.game.history.length)) === 1, 'the drop is one undo step');
await page.mouse.click(geo.x, geo.y); await sleep(200);
ok((await ev(() => document.getElementById('toast').classList.contains('on'))), 'a bad drop explains itself');
ok((await ev(() => GL.game.ring.filter(Boolean).length)) === 1, 'and changes nothing');

// real drag around the ring: 3 o'clock -> 6 o'clock is a quarter turn clockwise = N/4 notches = 2 on an 8 slot ring
const { cx, cy, dr } = await ev(() => ({ cx: GL.L.cx, cy: GL.L.cy, dr: GL.L.discR }));
const r0 = await ev(() => GL.game.rot), h0 = await ev(() => GL.game.history.length);
await page.mouse.move(cx + dr * 0.7, cy); await page.mouse.down();
for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; await page.mouse.move(cx + Math.cos(a) * dr * 0.7, cy + Math.sin(a) * dr * 0.7); await sleep(8); }
await page.mouse.up(); await sleep(200);
ok((await ev(() => GL.game.rot)) === (r0 + 2) % 8, 'dragging a quarter turn clockwise turns the ring two notches');
ok((await ev(() => GL.game.history.length)) === h0 + 1, 'the whole drag is a single undo step');
ok((await ev(() => GL.game.moves)) === 2, 'each notch costs a move');
await page.keyboard.press('z'); await sleep(100);
ok((await ev(() => GL.game.rot)) === r0 && (await ev(() => GL.game.moves)) === 0, 'Z undoes the drag');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await sleep(50);
ok((await ev(() => GL.game.rot)) === r0 && (await ev(() => GL.game.moves)) === 2, 'arrow keys turn the ring both ways');
await page.click('#bR'); await sleep(50);
ok((await ev(() => GL.game.rot)) === (r0 + 1) % 8, 'the clockwise button turns the ring');
await page.click('#bHint'); await sleep(120);
ok((await ev(() => document.getElementById('toast').textContent.length)) > 5, 'Hint tells you what to do');
await page.click('#bRestart'); await sleep(150);
ok((await ev(() => GL.game.moves === 0 && GL.game.ring.every((x) => !x))), 'restart resets the level');

// ---------------------------------------------------------------- play every level to par with the hint engine
for (let i = 0; i < 6; i++) {
  await ev((i) => GL.startLevel(i), i); await sleep(150);
  const id = await ev(() => GL.level.id), par = await ev(() => GL.par);
  ok(await ev(() => document.getElementById('bL').disabled === GL.level.oneWay), id + ': counter clockwise button is disabled exactly on one way belts');
  for (let k = 0; k < 200 && (await ev(() => GL.mode)) === 'play'; k++) {
    const h = await ev(async () => { const m = await import('./core.js'); return m.hintFor(GL.game); });
    for (let n = 0; n < (h.n || 0); n++) await ev((d) => GL.spin(d), h.dir);
    if (h.drop != null) { await ev((d) => GL.tryDrop(d), h.drop); await sleep(420); } else await sleep(20);
  }
  await sleep(300);
  ok((await ev(() => GL.mode)) === 'won', id + ': locks in');
  ok((await ev(() => GL.game.moves)) === par, id + ': solved in exactly par moves');
  ok((await ev((id) => GL.save.stars[id], id)) === 3, id + ': saves three stars');
  ok((await ev(() => GL.A.celebrate)), id + ': the lock-in bed starts');
  ok((await varied()) > 30, id + ': win screen is not blank');
  if (i === 0) { await sleep(1700); ok(await ev(() => document.getElementById('win').classList.contains('on')), 'the win panel slides in'); ok((await ev(() => document.getElementById('stars').textContent.includes('★★★'))), 'three stars shown'); }
}
ok(await ev(() => { try { return JSON.parse(localStorage.getItem('groove_lock_save_v1')).stars.fullmix === 3; } catch (e) { return false; } }), 'progress is stored under the live save key');

// ---------------------------------------------------------------- wrong turns on a one way belt do not cost anything
await ev(() => GL.startLevel(3)); await sleep(100);
await ev(() => GL.spin(-1)); await sleep(50);
ok((await ev(() => GL.game.moves)) === 0, 'one way belt refuses to turn back');
ok(await ev(() => document.getElementById('toast').classList.contains('on')), 'and says so');

// ---------------------------------------------------------------- jam mode
await ev(() => GL.startLevel('jam')); await sleep(150);
ok((await ev(() => GL.game.jam)) && (await ev(() => document.getElementById('bHint').disabled)), 'jam mode loads without hint or goal');
const pal = await ev(() => { const g = GL.stackGeom(); return g.map((x) => ({ x: x.cx, y: x.jamY + x.cs * 0.5 })); });
await page.mouse.click(pal[0].x, pal[0].y); await sleep(350);
await page.mouse.click(pal[4].x, pal[4].y); await sleep(100);
ok((await ev(() => GL.game.ring.filter(Boolean).length)) === 1, 'jam: a second drop on the same slot is refused');
await page.click('#bR'); await sleep(100); await page.mouse.click(pal[4].x, pal[4].y); await sleep(350);
ok((await ev(() => GL.game.ring.filter(Boolean).length)) === 2, 'jam: turn then drop fills a second slot');
const cube = await ev(() => { const g = GL.game, L = GL.L; const j = g.ring.findIndex(Boolean); const a = -Math.PI / 2 + (j + g.rot) * Math.PI * 2 / g.N; return { x: L.cx + Math.cos(a) * L.R, y: L.cy + Math.sin(a) * L.R }; });
await page.mouse.click(cube.x, cube.y); await sleep(120);
ok((await ev(() => GL.game.ring.filter(Boolean).length)) === 1, 'jam: tap a cube on the ring to pick it up');

// ---------------------------------------------------------------- menus, levels grid, mute
await page.click('#bMenu'); await sleep(200);
ok(await ev(() => document.getElementById('levels').classList.contains('on') && document.querySelectorAll('#grid .card').length === 7), 'menu button opens the level grid (six layers + jam)');
ok(await ev(() => document.querySelectorAll('#grid .card.lock').length === 0), 'all layers are unlocked after finishing them');
await page.click('#grid .card:nth-child(3)'); await sleep(200);
ok((await ev(() => GL.level.id)) === 'drums', 'a level card starts that level');
await page.keyboard.press('Escape'); await sleep(150);
await page.click('#bSound'); await sleep(50);
ok(await ev(() => GL.save.muted === true && JSON.parse(localStorage.getItem('groove_lock_save_v1')).muted === true), 'mute is remembered');

// ---------------------------------------------------------------- fresh player: levels are gated
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } }); const fp = await fresh.newPage();
fp.on('pageerror', (e) => errs.push('fresh pageerror: ' + e.message));
await fp.goto(URL); await fp.waitForTimeout(500); await fp.click('#bLevels'); await fp.waitForTimeout(150);
ok((await fp.evaluate(() => document.querySelectorAll('#grid .card.lock').length)) === 6, 'a new player has only the first layer open (the other five and jam are locked: 6 cards)');
await fresh.close();

// ---------------------------------------------------------------- desktop + landscape layouts
for (const [w, h] of [[1280, 720], [844, 390], [768, 1024]]) {
  await page.setViewportSize({ width: w, height: h }); await sleep(250);
  await ev(() => GL.startLevel(5)); await sleep(300);
  const geoOk = await ev(() => { const L = GL.L; return L.R > 30 && L.cx - L.discR >= -1 && L.cx + L.discR <= innerWidth + 1 && L.cy - L.discR >= -1 && L.cy + L.discR <= innerHeight - 20; });
  ok(geoOk, `${w}x${h}: the ring fits on screen`);
  ok((await varied()) > 30, `${w}x${h}: renders`);
}

// ---------------------------------------------------------------- audio: render every voice offline and measure it
const audio = await ev(async () => {
  const { createAudio } = await import('./audio.js'); const { CHAR } = await import('./core.js'); const { GROOVE16 } = await import('./levels.js');
  const SR = 44100, out = {};
  const stats = (d, from, len) => { let peak = 0, sum = 0, zc = 0, bad = 0, prev = 0; for (let i = from; i < from + len && i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) bad++; const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; if ((v >= 0) !== (prev >= 0)) zc++; prev = v; } return { peak, rms: Math.sqrt(sum / len), zcr: zc / len, bad }; };
  for (const t of ['kick', 'snare', 'hat', 'bass', 'ah', 'oh', 'ee']) {
    const off = new OfflineAudioContext(2, SR, SR), A2 = createAudio(); A2.init(off); A2.voiceAt(t, 0.02, 1, 0.15);
    const buf = await off.startRendering(); out[t] = stats(buf.getChannelData(0), 0, SR); const W = { kick: [0.06, 0.15], snare: [0.025, 0.1], hat: [0.022, 0.06], bass: [0.06, 0.2], ah: [0.08, 0.3], oh: [0.08, 0.3], ee: [0.08, 0.3] }[t]; out[t].zcr = stats(buf.getChannelData(0), Math.floor(SR * W[0]), Math.floor(SR * (W[1] - W[0]))).zcr;
    const tail = stats(buf.getChannelData(0), Math.floor(SR * 0.85), SR * 0.1); out[t].tail = tail.rms;
  }
  const off = new OfflineAudioContext(2, SR * 6, SR), A2 = createAudio(); A2.init(off);
  for (let bar = 0; bar < 2; bar++) for (let s = 0; s < 16; s++) { const c = GROOVE16[s]; if (c !== '.') A2.voiceAt(CHAR[c], 0.05 + bar * 2.4 + s * 0.15, 1, 0.15); }
  A2.padAt(0.05);
  const buf = await off.startRendering(); out.mix = stats(buf.getChannelData(0), 0, SR * 5);
  out.mixR = stats(buf.getChannelData(1), 0, SR * 5);
  return out;
});
if (process.env.GL_DEBUG) console.log(JSON.stringify(audio, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
for (const t of ['kick', 'snare', 'hat', 'bass', 'ah', 'oh', 'ee']) {
  ok(audio[t].bad === 0, t + ': renders finite samples'); ok(audio[t].peak > 0.03, t + ': is audible (peak ' + audio[t].peak.toFixed(2) + ')'); ok(audio[t].peak < 1.0, t + ': does not clip alone');
  ok(audio[t].tail < 0.02, t + ': dies away (no stuck notes), tail rms ' + audio[t].tail.toFixed(4));
}
ok(audio.kick.zcr < 0.02 && audio.bass.zcr < 0.04, 'kick and bass are low (zero crossing rate ' + audio.kick.zcr.toFixed(3) + ', ' + audio.bass.zcr.toFixed(3) + ')');
ok(audio.hat.zcr > 0.2, 'the hat is bright noise (zero crossing rate ' + audio.hat.zcr.toFixed(3) + ')');
ok(audio.snare.zcr > 0.04 && audio.snare.zcr < audio.hat.zcr, 'the snare sits between the kick and the hat');
ok(['ah', 'oh', 'ee'].every((v) => audio[v].zcr > 0.01 && audio[v].zcr < 0.2), 'the vowels are pitched, not noise');
ok(audio.kick.peak > audio.hat.peak && audio.snare.peak > audio.hat.peak * 0.8, 'kick and snare are the loud hits, the hat is the quiet one');
ok(audio.bass.peak < audio.kick.peak * 1.6, 'the bass does not bury the kick');
ok(['kick', 'snare', 'hat', 'bass', 'ah', 'oh', 'ee'].every((v) => audio[v].peak > 0.1), 'every voice is clearly audible (peak above 0.1)');
ok(audio.mix.bad === 0 && audio.mixR.bad === 0, 'the full groove renders finite samples on both channels');
ok(audio.mix.peak < 1.0, 'the full groove with the pad does not clip (peak ' + audio.mix.peak.toFixed(2) + ')');
ok(audio.mix.rms > 0.04, 'the full groove has body (rms ' + audio.mix.rms.toFixed(3) + ')');
ok(Math.abs(audio.mix.rms - audio.mixR.rms) < audio.mix.rms * 0.5, 'left and right are balanced');

ok(errs.length === 0, 'no page errors or console errors: ' + errs.slice(0, 3).join(' | '));
await browser.close(); server.close(); clearTimeout(watchdog);
finish();
