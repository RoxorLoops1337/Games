// r3 TAPE gate (beatbox_heroes/tape.js + park3d/tape.js): WATCH A BEATBOX TAPE on the couch, in the REAL game (3D ?r=3d&q=low, headless Chromium + swiftshader) and in 2D.
//   3D: walking to the couch opens COUCH, WATCH A BEATBOX TAPE plays the sequence: the camera pushes over the shoulder into the TV (the TV picture is a live canvas texture, the hero sits),
//   the overlay grows out of the screen, a title, then the facts of this tape (TAPE_FACTS.pick(flags.tapeNext)) as kinetic cards over the darkened VHS video, END OF TAPE, rewind, back to the couch.
//   Then: flags.tapeNext + 1, the core rewards and toast are exactly what Core.apply gives, the hero is still at the couch with free controls, the camera is handed back, no console errors,
//   no black frames (the 3D canvas while the camera moves and the VHS picture while the cards play). SKIP (button) and tap and hold both end a tape early (rewards still paid, pointer + 1).
//   2D: the same overlay from a CRT on the wall; a second tape the same day only toasts. TAPE_SHOTS=<dir> writes frames at 390x844 and 1280x720.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, goScene, until, drive, sleep } from './beatbox_heroes_r3gamelib.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3tape suite hung'); process.exit(1); }, 1200000);
const env = await r3env('beatbox_heroes_r3tape');
const SHOTS = process.env.TAPE_SHOTS || '';
const shot = async (page, name) => { if (!SHOTS) return; try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } catch (e) { console.log('shot failed ' + name + ': ' + e.message); } };
const rowClick = (page, re) => page.evaluate((re) => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => new RegExp(re).test(x.textContent)); if (!b) return false; b.click(); return true; }, re);
// lit and varied pixels of a canvas (black frame guard)
const pix = (page, sel) => page.evaluate((sel) => { const cv = document.querySelector(sel); if (!cv) return { colours: 0, lit: 0 }; const c = document.createElement('canvas'); c.width = 72; c.height = 128; const g = c.getContext('2d'); g.drawImage(cv, 0, 0, 72, 128); const d = g.getImageData(0, 0, 72, 128).data, s = new Set(); let lit = 0; for (let i = 0; i < d.length; i += 4) { s.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5)); if (d[i] + d[i + 1] + d[i + 2] > 90) lit++; } return { colours: s.size, lit }; }, sel);
const seedHome = (page, extra) => seed(page, Object.assign({ day: 3, minutes: 14 * 60 - 360, energy: 90, maxEnergy: 100, hunger: 90, mood: 50, cash: 200 }, extra || {}));
const openCouch = async (page) => { await page.evaluate(() => BBH.R3.world.walkToSpot('couch', { run: true })); return drive(page, () => { const e = document.querySelector('#ui .sheet .h2'); return !!e && e.textContent.trim() === 'COUCH'; }, null, 40); };
const atCouch = (page) => page.evaluate(() => { const w = BBH.R3.world, s = w.spots.spots.find((x) => x.id === 'couch'), st = w.controls.state(); return { d: +Math.hypot(st.x - s.x, st.z - s.z).toFixed(2), ring: s.radius || 1.6 }; });
const pickSave = 'const p = (r) => ({ mood: r.mood, ori: r.stats.ori, xp: r.xp, level: r.level, minutes: r.minutes, day: r.day, tapeNext: r.flags.tapeNext, tapeDay: r.flags.tapeDay, cash: r.cash, fans: r.fans });';
const ref = (page) => page.evaluate(pickSave + ' p(BBH.Core.apply(BBH.Core.clone(BBH.G.ch), { t: "tape" }, () => 0.5).char)');
const now = (page) => page.evaluate(pickSave + ' p(BBH.G.ch)');
const rowDis = (page) => page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => /^WATCH A BEATBOX TAPE/.test(x.textContent)); return !!b && b.classList.contains('dis') && /Already watched one today/.test(b.textContent); });
// every toast since the spy went in (E.toast is swapped by the 3D kit at boot, so the spy wraps whatever is there)
const spyToasts = (page) => page.evaluate(() => { const E = BBH.Eng, f = E.toast; window.__toasts = []; E.toast = function (t) { window.__toasts.push(String(t)); return f.apply(this, arguments); }; });
const toastTexts = (page) => page.evaluate(() => (window.__toasts || []).join(' | '));

async function boot3d(vp) {
  const { page, errs } = await env.newPage({ viewport: vp });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed') && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.t > 0, null, { timeout: 120000 });
  return { page, errs };
}

try {
  /* ------------------------------------------------------------------ 3D, portrait phone: the full tape */
  const { page, errs } = await boot3d({ width: 390, height: 844 });
  ok(await page.evaluate(() => BBH.R3.on && !!BBH.R3.lib && typeof BBH.R3.lib.playTape === 'function' && !!BBH.Tape && !!BBH.TAPE_FACTS), '3D is up and the core exports playTape');
  await seedHome(page); await spyToasts(page);
  ok(await goScene(page, 'place', { id: 'home' }, 'flat'), 'home (the flat) loads');
  ok(await openCouch(page), 'walking to the couch opens COUCH');
  const k0 = await page.evaluate(() => BBH.G.ch.flags.tapeNext), want = await page.evaluate((k) => BBH.TAPE_FACTS.pick(k).map((f) => f.id), k0), R0 = await ref(page);
  ok(k0 === 0 && want.includes('final2005'), 'a new save starts on tape 1, which carries the 2005 final (' + want.join(',') + ')');
  await page.evaluate((s) => { BBH.Tape.speed = s; }, SHOTS ? 1 : 3);
  ok(await rowClick(page, '^WATCH A BEATBOX TAPE'), 'WATCH A BEATBOX TAPE row');
  ok(await until(page, () => !!document.getElementById('tape') && BBH.Tape.playing, null, 20000), 'the tape overlay mounts');
  ok(await page.evaluate(() => !document.querySelector('#ui .sheet') && document.body.classList.contains('tape-on') && getComputedStyle(document.getElementById('hud3')).visibility === 'hidden'), 'the sheet is closed and the HUD hides');
  // the push in: the rig drives the camera, the TV picture is live, the 3D canvas keeps drawing
  ok(await until(page, () => !!BBH.R3.world.scene.getObjectByName('tape_rig'), null, 20000), 'the TV rig (screen texture, cassette) is in the flat');
  await until(page, () => BBH.Tape.ctrl && BBH.Tape.ctrl.audio && BBH.R3.world.scene.getObjectByName('tape_rig').children.some((o) => o.material && o.material.opacity === 1), null, 20000);   // the shoulder shot is reached when the TV switches on
  const cam0 = await page.evaluate(() => BBH.R3.world.camera.position.toArray());
  await sleep(SHOTS ? 300 : 100); await shot(page, 'tape_390_1_shoulder.png');
  { const g = await pix(page, '#gl'); ok(g.colours > 12 && g.lit > 400, '3D canvas is not black during the push in (' + JSON.stringify(g) + ')'); }
  if (SHOTS) { await sleep(1800); await shot(page, 'tape_390_1b_push.png'); }
  ok(await until(page, () => BBH.Tape.ctrl && ['title', 'cut', 'card'].includes(BBH.Tape.ctrl.phase), null, 60000), 'the picture fills the screen and the title plays');
  const cam1 = await page.evaluate(() => BBH.R3.world.camera.position.toArray()), tvz = await page.evaluate(() => BBH.R3.world.terrain.anchors.tv.z);
  ok(Math.abs(cam1[2] - tvz) < Math.abs(cam0[2] - tvz) - 0.3 && Math.abs(cam1[0] - (-4.0)) < 0.2, 'the camera pushed in to the TV (z ' + cam0[2].toFixed(2) + ' -> ' + cam1[2].toFixed(2) + ', TV at ' + tvz.toFixed(2) + ')');
  if (SHOTS) { await sleep(1000); await shot(page, 'tape_390_2_title.png'); }
  const cards = [], shotIds = new Set(); let videoOk = 0, videoN = 0, rew = false;
  for (let i = 0; i < 600; i++) {
    const p = await page.evaluate(() => { const c = BBH.Tape.ctrl, el = document.querySelector('#tape .tp-card.in[data-fact]'); return { ph: c ? c.phase : 'none', id: el ? el.getAttribute('data-fact') : null }; });
    if (p.id && cards[cards.length - 1] !== p.id) cards.push(p.id);
    if (p.ph === 'card') { const v = await pix(page, '#tape .tp-scr canvas'); videoN++; if (v.colours > 10 && v.lit > 300) videoOk++; if (SHOTS && p.id && !shotIds.has(p.id) && shotIds.size < 3) { shotIds.add(p.id); await sleep(2600); await shot(page, 'tape_390_3_card' + shotIds.size + '.png'); } }
    if (SHOTS && p.ph === 'rewind' && !rew) { rew = true; await shot(page, 'tape_390_5_rewind.png'); }
    if (p.ph === 'none' || p.ph === 'done') break;
    await sleep(250);
  }
  ok(cards.join() === want.join(), 'the cards show this tape\'s facts in order (' + cards.join(',') + ')');
  ok(videoN > 0 && videoOk === videoN, 'the VHS picture behind the cards is never black (' + videoOk + '/' + videoN + ')');
  ok(await until(page, () => !BBH.Tape.playing && !document.getElementById('tape'), null, 60000), 'the tape ends and the overlay is gone');
  const r1 = await page.evaluate(() => BBH.Tape.last);
  ok(r1 && r1.shown === want.length && !r1.skipped && r1.ids.join() === want.join(), 'result: every fact shown, not skipped (' + JSON.stringify(r1) + ')');
  const N1 = await now(page);
  ok(JSON.stringify(N1) === JSON.stringify(R0), 'the save got exactly the Core rewards: mood, Originality, XP, 60 minutes, tapeDay, tapeNext + 1 (' + JSON.stringify(N1) + ' vs ' + JSON.stringify(R0) + ')');
  ok(/old battle tape/.test(await toastTexts(page)), 'the reward toast shows');
  ok(await page.evaluate(() => !BBH.R3.world.scene.getObjectByName('tape_rig') && !document.body.classList.contains('tape-on')), 'the rig is removed and the HUD is back');
  ok(await drive(page, () => !BBH.R3.world.controls.locked && BBH.R3.world.controls.enabled && !BBH.R3.world.controls.inSpot, null, 30), 'the hero gets up: controls free again');
  { const p = await atCouch(page); ok(p.d <= p.ring + 1.2, 'the hero is still at the couch (' + p.d + ' m)'); }
  { const st = await page.evaluate(() => BBH.R3.world.controls.state().cam); ok(st.z > -3, 'the camera is handed back to the room view (cam z ' + st.z + ')'); }
  { const g = await pix(page, '#gl'); ok(g.colours > 12 && g.lit > 400, 'the room renders after the tape (' + JSON.stringify(g) + ')'); }
  if (SHOTS) await shot(page, 'tape_390_6_back.png');
  // the same day: the row is greyed (Already watched one today.) and a tap does nothing
  ok(await openCouch(page), 'COUCH again');
  await rowClick(page, '^WATCH A BEATBOX TAPE'); await sleep(500);
  ok(await page.evaluate(() => !document.getElementById('tape') && !BBH.Tape.playing) && await rowDis(page), 'a second tape the same day: the row is greyed and does not play');
  ok(errs.length === 0, '3D: no console errors (' + errs.slice(0, 3).join(' | ') + ')');

  /* ------------------------------------------------------------------ SKIP button and tap and hold (next days) */
  for (const how of ['button', 'hold']) {
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.day += 1; ch.minutes = 14 * 60 - 360; ch.energy = 90; BBH.G.setChar(ch); const s = BBH.Eng.scene; if (s.closeSheet) s.closeSheet(); });
    await drive(page, () => !BBH.R3.world.controls.inSpot, null, 20);
    const k = await page.evaluate(() => BBH.G.ch.flags.tapeNext), Rk = await ref(page);
    ok(await openCouch(page), how + ': COUCH');
    await page.evaluate(() => { BBH.Tape.speed = 2; }); await rowClick(page, '^WATCH A BEATBOX TAPE');
    ok(await until(page, () => BBH.Tape.ctrl && BBH.Tape.ctrl.phase === 'card', null, 90000), how + ': the first card is up');
    if (how === 'button') await page.evaluate(() => document.querySelector('#tape .tp-skip').click());
    else { const b = await page.evaluate(() => { const r = document.getElementById('tape').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.3 }; }); await page.mouse.move(b.x, b.y); await page.mouse.down(); await sleep(1200); await page.mouse.up(); }
    ok(await until(page, () => !BBH.Tape.playing && !document.getElementById('tape'), null, 60000), how + ': the tape stops early and the overlay goes');
    const rs = await page.evaluate(() => BBH.Tape.last);
    const nk = await page.evaluate((k) => BBH.TAPE_FACTS.pick(k).length, k);
    ok(rs && rs.skipped && rs.shown >= 1 && rs.shown < nk, how + ': result says skipped after ' + (rs && rs.shown) + ' card(s)');
    ok(rs && rs.tape === k, how + ': it was tape ' + (k + 1));
    ok(JSON.stringify(await now(page)) === JSON.stringify(Rk), how + ': rewards and tapeNext + 1 are still paid');
    ok(await drive(page, () => !BBH.R3.world.controls.locked && !BBH.R3.world.controls.inSpot, null, 30), how + ': free to walk again');
  }
  ok(errs.length === 0, 'skips: no console errors (' + errs.slice(0, 3).join(' | ') + ')');
  await page.context().close();

  /* ------------------------------------------------------------------ desktop 1280x720 (shots only) */
  if (SHOTS) {
    const d = await boot3d({ width: 1280, height: 720 }); await seedHome(d.page, { flags: { tapeNext: 1 } });
    await goScene(d.page, 'place', { id: 'home' }, 'flat'); await openCouch(d.page); await d.page.evaluate(() => { BBH.Tape.speed = 1; }); await rowClick(d.page, '^WATCH A BEATBOX TAPE');
    await sleep(2600); await shot(d.page, 'tape_1280_1_push.png'); await sleep(1500); await shot(d.page, 'tape_1280_1b_push.png');
    await until(d.page, () => BBH.Tape.ctrl && BBH.Tape.ctrl.phase === 'card', null, 90000); await sleep(3200); await shot(d.page, 'tape_1280_2_card.png');
    await d.page.context().close();
  }
  /* ------------------------------------------------------------------ 2D */
  {
    const { page: p2, errs: e2 } = await env.newPage({ viewport: { width: 390, height: 844 } });
    await p2.goto(env.url('index.html?r=2d')); await p2.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.t > 0, null, { timeout: 60000 });
    await seedHome(p2, { flags: { tapeNext: 2 } }); await spyToasts(p2); await p2.evaluate(() => { BBH.Eng.settings.reduce = true; });   // reduce motion on: calm picture, no kinetic type, same flow
    await p2.evaluate(() => BBH.Eng.go('place', { id: 'home' })); ok(await until(p2, () => BBH.Eng.sceneName === 'place' && !BBH.Eng.pendingSwitch && !BBH.Eng.scene.is3d && BBH.Eng.scene.t > 0, null, 30000), '2D: home');
    const want2 = await p2.evaluate(() => BBH.TAPE_FACTS.pick(2).map((f) => f.id)), R2 = await ref(p2);
    await p2.evaluate((s) => { BBH.Tape.speed = s; BBH.G.places.ACTIONS.home.couch(BBH.Eng.scene); }, SHOTS ? 1 : 4); ok(await rowClick(p2, '^WATCH A BEATBOX TAPE'), '2D: the COUCH sheet has the tape row');
    ok(await until(p2, () => !!document.getElementById('tape'), null, 10000), '2D: the overlay mounts');
    ok(await p2.evaluate(() => document.getElementById('tape').classList.contains('reduce') && BBH.Tape.ctrl.video.state.calm), '2D: reduce motion is respected (calm picture, plain fades)');
    if (SHOTS) { await sleep(900); await shot(p2, 'tape_2d_1_crt.png'); }
    const seen2 = []; for (let i = 0; i < 400; i++) { const id = await p2.evaluate(() => { const el = document.querySelector('#tape .tp-card.in[data-fact]'); return el ? el.getAttribute('data-fact') : (BBH.Tape.playing ? '' : null); }); if (id === null) break; if (id && seen2[seen2.length - 1] !== id) { if (SHOTS && !seen2.length) { await sleep(2500); await shot(p2, 'tape_2d_2_card.png'); } seen2.push(id); } await sleep(200); }
    ok(seen2.join() === want2.join(), '2D: tape 3 shows its facts (' + seen2.join(',') + ')');
    ok(await until(p2, () => !BBH.Tape.playing && !document.getElementById('tape'), null, 30000), '2D: the overlay is gone after the tape');
    ok(JSON.stringify(await now(p2)) === JSON.stringify(R2) && /old battle tape/.test(await toastTexts(p2)), '2D: the same Core rewards and toast');
    await p2.evaluate(() => BBH.G.places.ACTIONS.home.couch(BBH.Eng.scene)); await rowClick(p2, '^WATCH A BEATBOX TAPE'); await sleep(400);
    ok(await p2.evaluate(() => !document.getElementById('tape')) && await rowDis(p2), '2D: a second tape the same day: greyed, nothing plays');
    ok(e2.length === 0, '2D: no console errors (' + e2.slice(0, 3).join(' | ') + ')');
  }
} catch (e) { ok(false, 'suite threw: ' + (e && e.stack || e)); }
clearTimeout(watchdog); await env.stop(); done();
