// r3 RETURN gate (beatbox_heroes/activity.js, the return ticket): the REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader) and in 2D.
//   Every activity ends where it started: same place world, the player within 1.2 m of the ring of the spot that launched it (not the start anchor), the camera snapped.
//   The result cards offer PLAY AGAIN / TRAIN AGAIN (same activity and level, greyed with the Core reason when not allowed), BACK (the launching menu, reopened at that spot)
//   and CONTINUE. Covered in 3D: busk (CONTINUE, BACK -> BUSKING SPOT sheet, PLAY AGAIN -> the same set), a battle (AGAIN greyed by the cooldown, CONTINUE at the stage),
//   the singing tuner (count-in, Audio.note with the target midi BEFORE the sing window every round, LISTEN AGAIN replays it, BACK -> the training menu on SINGING),
//   ear training (CONTINUE at the booth), rhythm training (BACK -> the menu on TECHNICALITY), pose (TRAIN AGAIN -> the same level, then CONTINUE at the booth),
//   idle training (TRAIN AGAIN / BACK on the summary, the hero never leaves the booth), eating (the kitchen sheet stays, the hero stays), sleep (the morning card first, then you wake up at the bed).
//   2D: the singing tuner plays the note first (fake microphone), BACK reopens the training menu at the booth hotspot; a busk returns to the busking hotspot.
// RETURN_SHOTS=<dir>/ writes return_*.png. SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { boot, seed, goScene, until, drive, sheetTitle, skipDialogs, sleep } from './beatbox_heroes_r3gamelib.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3return suite hung'); process.exit(1); }, 1500000);
const env = await r3env('beatbox_heroes_r3return', ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
const SHOTS = process.env.RETURN_SHOTS || '';
const shot = async (page, name) => { if (!SHOTS) return; await sleep(500); try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } catch (e) { console.log('shot failed ' + name + ': ' + e.message); } };
const WORLD = { park: 'park', bar: 'bar', studio: 'lab', home: 'flat', shop: 'shop' };
const waitPlace = (page, id) => until(page, ([id, wid]) => { const E = BBH.Eng, sc = E.scene; return E.sceneName === 'place' && sc && !E.pendingSwitch && E.sceneArgs.id === id && sc.is3d && BBH.R3.world && BBH.R3.world.id === wid && sc.w === BBH.R3.world && sc.t > 0; }, [id, WORLD[id]], 120000);
const waitScene = (page, name, wid) => until(page, ([n, w]) => BBH.Eng.sceneName === n && BBH.Eng.scene && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === w && !BBH.Eng.pendingSwitch && BBH.Eng.scene.w === BBH.R3.world && (BBH.Eng.scene.mg || BBH.R3.world.game), [name, wid], 120000);
// where the player stands against a spot ring and the start anchor of the world
const atSpot = (page, id) => page.evaluate((id) => {
  const w = BBH.R3.world, s = w.spots.spots.find((x) => x.id === id), st = w.controls.state(), A = (w.terrain && w.terrain.anchors) || {}, a0 = A.start;
  return { world: w.id, d: s ? +Math.hypot(st.x - s.x, st.z - s.z).toFixed(2) : 99, ring: s ? (s.radius || 1.6) : 0, dStart: a0 ? +Math.hypot(st.x - a0.x, st.z - a0.z).toFixed(2) : 99, startToSpot: a0 && s ? +Math.hypot(s.x - a0.x, s.z - a0.z).toFixed(2) : 99, intro: st.intro, x: st.x, z: st.z };
}, id);
const landedOk = (p) => p.d <= p.ring + 1.2 && !p.intro && (p.startToSpot < 2 || p.dStart > 1);
const say = (p) => 'd ' + p.d + ' m (ring ' + p.ring + '), ' + p.dStart + ' m from the start anchor';
const acts = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((b) => b.textContent.trim() + (b.getAttribute('aria-disabled') === 'true' ? '(off)' : '')), sel);
const tap = (page, sel) => page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.click(); return true; }, sel);
const openSpot = async (page, id) => { await page.evaluate((id) => BBH.R3.world.walkToSpot(id, { run: true }), id); return drive(page, () => !!document.querySelector('#ui .sheet .h2'), null, 40); };
const rowClick = (page, re) => page.evaluate((re) => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => new RegExp(re).test(x.textContent)); if (!b) return false; b.click(); return true; }, re);
const finishSet = (page) => page.evaluate(() => { const mg = BBH.Eng.scene.mg; mg.bot({ jitterMs: 12 }); let st = mg.state(); for (let i = 0; i < 2400 && st.phase !== 'result' && st.phase !== 'verdict'; i++) st = mg.tick(0.15); return st.phase; });
const menuOpen = (page) => until(page, () => !!document.querySelector('#ui .sheet .trn'), null, 40000);
const fresh = (page, extra) => seed(page, Object.assign({ day: 3, minutes: 12 * 60 - 360, energy: 100, maxEnergy: 100, hunger: 95, mood: 80, cash: 400, stats: { mus: 30, tech: 30, ori: 30, show: 30 } }, extra || {}));
const allSounds = (page) => page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); if (BBH.Core.SOUNDS) ch.sounds = BBH.Core.SOUNDS.map((x) => x.id); BBH.G.setChar(ch); });

try {
  const { page, errs } = await boot(env);
  await fresh(page); await allSounds(page);
  await page.evaluate(() => { const A = BBH.Audio; window.__notes = []; const f = A.note; A.note = function (m, d, o) { const sc = BBH.Eng.scene, g = BBH.R3 && BBH.R3.world && BBH.R3.world.game, s = g && g.state ? g.state() : sc; window.__notes.push({ midi: m, dur: d, timbre: o && o.timbre, scene: BBH.Eng.sceneName, phase: s && s.phase, round: s && s.round, target: s && s.target }); return f.apply(A, arguments); }; });

  /* ------------------------------------------------------------------ BUSK: CONTINUE, BACK, PLAY AGAIN */
  ok(await goScene(page, 'place', { id: 'park' }, 'park'), 'park world loads');
  ok(await openSpot(page, 'busk') && await sheetTitle(page) === 'BUSKING SPOT', 'walking to the busk ring opens BUSKING SPOT');
  await rowClick(page, '^BUSK  '); ok(await waitScene(page, 'rhythm', 'rhythm'), 'BUSK starts the set');
  ok(await page.evaluate(() => { const t = BBH.G.activityReturn; return !!t && t.place === 'park' && t.spot === 'busk' && t.hot === 'spot' && !!t.pos; }), 'the return ticket remembers the park, the busk spot (2D hotspot "spot") and where the player stood');
  ok(await finishSet(page) === 'result', 'busk: the bot plays the set to the result card');
  await sleep(400);
  const bk = await acts(page, '#r3rhythm .card [data-acts] button');
  ok(bk.join() === 'PLAY AGAIN,BACK,CONTINUE', 'busk card: PLAY AGAIN, BACK, CONTINUE (' + bk.join() + ')');
  await shot(page, 'return_busk.png');
  await tap(page, '#r3rhythm button[data-act="continue"]');
  ok(await waitPlace(page, 'park'), 'busk CONTINUE: back in the park world');
  { const p = await atSpot(page, 'busk'); ok(landedOk(p), 'busk CONTINUE: standing at the busk ring, not at the gate (' + say(p) + ')'); }
  ok(await page.evaluate(() => !document.querySelector('#ui .sheet') && BBH.R3.world.controls.enabled && !BBH.G.activityReturn), 'busk CONTINUE: no sheet, free to walk, the ticket is used up');
  // BACK reopens the BUSKING SPOT sheet at the ring
  await openSpot(page, 'busk'); await rowClick(page, '^BUSK  '); await waitScene(page, 'rhythm', 'rhythm'); await finishSet(page); await sleep(300);
  await tap(page, '#r3rhythm button[data-act="back"]');
  ok(await waitPlace(page, 'park') && await until(page, () => { const e = document.querySelector('#ui .sheet .h2'); return !!e && e.textContent === 'BUSKING SPOT'; }, null, 30000), 'busk BACK: the park with the BUSKING SPOT sheet open again');
  { const p = await atSpot(page, 'busk'), c = await page.evaluate(() => BBH.R3.world.controls.inSpot); ok(landedOk(p) && c === 'busk', 'busk BACK: at the ring, in the spot pose (' + say(p) + ', inSpot ' + c + ')'); }
  // PLAY AGAIN: the same set again, straight from the card
  const n0 = await page.evaluate(() => BBH.G.ch.n.busks);
  await rowClick(page, '^BUSK  '); await waitScene(page, 'rhythm', 'rhythm'); await finishSet(page); await sleep(300);
  await tap(page, '#r3rhythm button[data-act="again"]');
  ok(await until(page, (n) => BBH.Eng.sceneName === 'rhythm' && BBH.Eng.scene.mg && BBH.Eng.scene.mg.state().phase !== 'result' && BBH.G.ch.n.busks === n + 1 && !BBH.Eng.pendingSwitch, n0, 120000), 'busk PLAY AGAIN: a new set starts at once (no stop in the park)');
  ok(await page.evaluate(() => BBH.Eng.sceneArgs.kind === 'busk' && BBH.Eng.sceneArgs.title === 'BUSKING' && BBH.G.activityReturn && BBH.G.activityReturn.spot === 'busk'), 'busk PLAY AGAIN: same kind and settings (BUSKING), same ticket');
  await finishSet(page); await sleep(300); await tap(page, '#r3rhythm button[data-act="continue"]');
  ok(await waitPlace(page, 'park'), 'the second set ends in the park'); { const p = await atSpot(page, 'busk'); ok(landedOk(p), 'after PLAY AGAIN the player still lands at the busk ring (' + say(p) + ')'); }

  /* ------------------------------------------------------------------ BATTLE: AGAIN greyed (cooldown), CONTINUE at the stage */
  const bday = await page.evaluate(() => { for (let d = 3; d < 30; d++) if (BBH.Core.barProgramme(d).id === 'battle') return d; return 0; });
  await fresh(page, { day: bday, minutes: 19 * 60 - 360, level: 6, stats: { mus: 55, tech: 60, ori: 50, show: 45 } }); await allSounds(page);
  ok(await goScene(page, 'place', { id: 'bar' }, 'bar'), 'bar on battle night');
  ok(await openSpot(page, 'stage') && await sheetTitle(page) === 'THE STAGE', 'the stage opens THE STAGE');
  await page.evaluate(() => { const o = BBH.Core.OPPONENTS[0], b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => x.textContent.indexOf(o.name.toUpperCase()) === 0); if (b) b.click(); });
  await sleep(600); await skipDialogs(page, 8);
  ok(await waitScene(page, 'rhythm', 'rhythm'), 'picking the first opponent starts the battle');
  ok(await finishSet(page) === 'verdict', 'battle: the bot fights to the verdict'); await sleep(400);
  const vb = await acts(page, '#r3rhythm .card [data-acts] button'), why = await page.evaluate(() => (document.querySelector('#r3rhythm [data-why]') || {}).textContent || '');
  ok(vb.join() === 'PLAY AGAIN(off),BACK,CONTINUE' && /battled recently/.test(why), 'battle verdict: PLAY AGAIN greyed with the Core reason "' + why + '", BACK, CONTINUE (' + vb.join() + ')');
  await shot(page, 'return_battle.png');
  await tap(page, '#r3rhythm button[data-act="again"]'); await sleep(400);
  ok(await page.evaluate(() => BBH.Eng.sceneName === 'rhythm' && !!document.querySelector('#r3rhythm .card')), 'a greyed AGAIN does nothing');
  await tap(page, '#r3rhythm button[data-act="continue"]');
  ok(await waitPlace(page, 'bar'), 'battle CONTINUE: back in the bar'); { const p = await atSpot(page, 'stage'); ok(landedOk(p), 'battle CONTINUE: standing at the stage, not at the door (' + say(p) + ')'); }

  /* ------------------------------------------------------------------ SINGING (tuner): note first, LISTEN, BACK to the training menu */
  await fresh(page, { day: 3, minutes: 13 * 60 - 360 }); await allSounds(page);
  ok(await goScene(page, 'place', { id: 'home' }, 'flat'), 'home');
  await page.evaluate(() => BBH.R3.world.walkToSpot('booth', { run: true })); ok(await drive(page, () => !!document.querySelector('#ui .sheet .trn'), null, 40), 'the booth opens the training menu');
  await tap(page, '.trn .sk[data-stat=mus]'); await sleep(150); await tap(page, '.trn [data-act=play]'); await sleep(150); await tap(page, '.trn [data-game=tune]'); await sleep(150);
  await tap(page, '.trn [data-act=start-play]'); ok(await waitScene(page, 'tuner', 'tuner'), 'SINGING starts the 3D tuner');
  const sing = await page.evaluate(() => {
    const g = BBH.R3.world.game; window.__notes.length = 0; g.start({ range: 'higher', mode: 'mic', fake: true, manual: true });
    const rounds = {}, first = []; let last = '', listened = null;
    for (let n = 0; n < 5000 && g.state().state !== 'done'; n++) {
      const s = g.state();
      if (s.phase !== last) { if (s.phase === 'sing') { const before = window.__notes.filter((x) => x.round === s.round && x.midi === s.target && x.scene === 'tuner'); rounds[s.round] = { target: s.target, notes: before.length, phases: before.map((x) => x.phase).join() }; } if (s.round === 1 && first.length < 6) first.push(s.phase); last = s.phase; }
      if (s.round === 2 && s.phase === 'sing' && !listened) { const c0 = window.__notes.length; const b = document.querySelector('.tn-listen'); const vis = b && b.style.display !== 'none'; if (b) b.click(); const s2 = g.state(); listened = { vis, played: window.__notes.length > c0 && window.__notes[window.__notes.length - 1].midi === s.target, phase: s2.phase }; }
      if (s.phase === 'sing') g.feedPitch(440 * Math.pow(2, (s.target - 69) / 12)); else g.feedPitch(0); g.tick(0.1);
    }
    g.feedPitch(null); for (let i = 0; i < 6; i++) g.tick(0.1);
    return { rounds, first, listened, r: g.result(), timbre: window.__notes.every((x) => x.timbre === 'keys') };
  });
  const rk = Object.keys(sing.rounds);
  ok(rk.length === 8 && rk.every((k) => sing.rounds[k].notes >= 1 && /ref/.test(sing.rounds[k].phases)), '3D singing: every one of the 8 rounds played Audio.note with its target midi before the sing window (' + rk.map((k) => sing.rounds[k].target + 'x' + sing.rounds[k].notes).join(' ') + ')');
  ok(sing.first.slice(0, 3).join() === 'count,ref,sing', '3D singing: count-in, then the note (LISTEN...), then SING IT (' + sing.first.join('>') + ')');
  ok(sing.timbre, '3D singing: the notes use the keys timbre');
  ok(sing.listened && sing.listened.vis && sing.listened.played && sing.listened.phase === 'ref', '3D singing: LISTEN AGAIN is shown while singing and replays the target note (' + JSON.stringify(sing.listened) + ')');
  ok(await page.evaluate(() => BBH.Audio.isGameMode && BBH.Audio.isGameMode() === true), '3D singing: the music stays off (Audio.gameMode) while the notes play');
  ok(sing.r && sing.r.score === 8, '3D singing: the bot sings all 8 notes');
  await sleep(500);
  ok((await acts(page, '.tn-card .tn-btn')).join() === 'TRAIN AGAIN,BACK,CONTINUE', 'tuner card: TRAIN AGAIN, BACK, CONTINUE');
  await shot(page, 'return_tuner.png');
  await tap(page, '.tn-btn[data-act="back"]');
  ok(await waitPlace(page, 'home') && await menuOpen(page), 'tuner BACK: home with the training menu open again');
  ok(await page.evaluate(() => !!document.querySelector('.trn [data-game=tune].on') && /^PLAY: MUSICALITY/.test(document.querySelector('#ui .sheet .h2').textContent)), 'tuner BACK: the menu is on PLAY, Musicality, SINGING (where you launched it)');
  { const p = await atSpot(page, 'booth'), c = await page.evaluate(() => BBH.R3.world.controls.inSpot); ok(landedOk(p) && c === 'booth', 'tuner BACK: at the booth ring in the spot pose (' + say(p) + ')'); }

  /* ------------------------------------------------------------------ EAR training: CONTINUE at the booth */
  await tap(page, '.trn [data-game=ear]'); await sleep(150); await tap(page, '.trn [data-act=start-play]');
  ok(await waitScene(page, 'ear', 'ear'), 'ear training starts');
  await page.evaluate(() => { const b = document.querySelector('.er-card .er-go'); if (b) b.click(); });
  await page.evaluate(() => { const g = BBH.R3.world.game; g.manual(true); for (let n = 0; n < 3000 && g.state().state !== 'done'; n++) { const s = g.state(); if (s.phase === 'ask' || s.phase === 'listen') g.answer(s.answer); g.tick(0.1); } for (let i = 0; i < 6; i++) g.tick(0.1); });
  await sleep(500);
  ok((await acts(page, '.er-card .er-go')).join() === 'TRAIN AGAIN,BACK,CONTINUE', 'ear card: TRAIN AGAIN, BACK, CONTINUE');
  await shot(page, 'return_ear.png');
  await tap(page, '.er-go[data-act="continue"]');
  ok(await waitPlace(page, 'home'), 'ear CONTINUE: home'); { const p = await atSpot(page, 'booth'); ok(landedOk(p) && await page.evaluate(() => !document.querySelector('#ui .sheet')), 'ear CONTINUE: standing at the booth, no menu (' + say(p) + ')'); }

  /* ------------------------------------------------------------------ RHYTHM training: BACK to the menu on Technicality */
  await page.evaluate(() => BBH.R3.world.activate('booth')); await menuOpen(page);
  await tap(page, '.trn .sk[data-stat=tech]'); await sleep(150); await tap(page, '.trn [data-act=play]'); await sleep(150); await tap(page, '.trn [data-act=start-play]');
  ok(await waitScene(page, 'rhythm', 'rhythm'), 'rhythm training starts');
  await page.evaluate(() => { const mg = BBH.Eng.scene.mg; mg.bot({ jitterMs: 10 }); let st = mg.state(); for (let i = 0; i < 2400 && st.phase !== 'result'; i++) st = mg.tick(0.1); }); await sleep(500);
  ok((await page.evaluate(() => [...document.querySelectorAll('#r3rhythm .tr button')].map((b) => b.dataset.act))).indexOf('menu') >= 0, 'rhythm training card has BACK');
  await shot(page, 'return_rhythm_train.png');
  await tap(page, '#r3rhythm .tr button[data-act="menu"]');
  ok(await waitPlace(page, 'home') && await menuOpen(page) && await page.evaluate(() => /^PLAY: TECHNICALITY/.test(document.querySelector('#ui .sheet .h2').textContent)), 'rhythm training BACK: the training menu on PLAY: TECHNICALITY');
  { const p = await atSpot(page, 'booth'); ok(landedOk(p), 'rhythm training BACK: at the booth (' + say(p) + ')'); }

  /* ------------------------------------------------------------------ POSE: TRAIN AGAIN replays the same level, CONTINUE at the booth */
  await tap(page, '.trn .head .bk'); await sleep(150); await tap(page, '.trn .sk[data-stat=show]'); await sleep(150); await tap(page, '.trn [data-act=play]'); await sleep(150);
  const plv = await page.evaluate(() => +((document.querySelector('.trn .chip[data-level].on') || {}).dataset || {}).level || 1);
  await tap(page, '.trn [data-act=start-play]');
  ok(await waitScene(page, 'pose', 'pose'), 'pose starts');
  const posePlay = () => page.evaluate(() => { const g = BBH.R3.world.game, lv = g.state().level; g.start({ level: lv, manual: true, seed: 3 }); g.bot(); for (let i = 0; i < 4000 && g.state().phase !== 'done'; i++) g.tick(0.05); for (let i = 0; i < 60 && !document.querySelector('.pz-card'); i++) g.tick(0.05); return g.state().level; });
  ok(await posePlay() === plv, 'pose: level ' + plv + ' played to the card'); await sleep(400);
  ok((await acts(page, '.pz-card .pz-btn')).join() === 'TRAIN AGAIN,BACK,CONTINUE', 'pose card: TRAIN AGAIN, BACK, CONTINUE');
  await shot(page, 'return_pose.png');
  const tg = await page.evaluate(() => BBH.G.ch.n.trainGames || 0);
  await tap(page, '.pz-btn[data-act="again"]');
  ok(await until(page, (n) => BBH.Eng.sceneName === 'pose' && BBH.R3.world && BBH.R3.world.id === 'pose' && BBH.R3.world.game && BBH.Eng.scene.w === BBH.R3.world && BBH.Eng.scene.mg && !document.querySelector('.pz-card') && (BBH.G.ch.n.trainGames || 0) === n && !BBH.Eng.pendingSwitch, tg, 120000), 'pose TRAIN AGAIN: the pose game starts again');
  ok(await page.evaluate((lv) => BBH.R3.world.game.state().level === lv && BBH.Eng.sceneArgs.level === lv, plv), 'pose TRAIN AGAIN: the same level (' + plv + ')');
  await posePlay(); await sleep(400); await tap(page, '.pz-btn[data-act="continue"]');
  ok(await waitPlace(page, 'home'), 'pose CONTINUE: home'); { const p = await atSpot(page, 'booth'); ok(landedOk(p), 'pose CONTINUE: at the booth (' + say(p) + ')'); }

  /* ------------------------------------------------------------------ IDLE training: the summary offers TRAIN AGAIN / BACK, the hero stays */
  await page.evaluate(() => BBH.R3.world.activate('booth')); await menuOpen(page);
  await tap(page, '.trn .sk[data-stat=ori]'); await sleep(100); await tap(page, '.trn [data-act=idle]'); await sleep(100); await tap(page, '.trn .chip[data-min="15"]'); await sleep(100);
  await page.evaluate(() => { BBH.Train.speed = 6; }); await tap(page, '.trn [data-act=start-idle]');
  ok(await until(page, () => BBH.Train.last && !!BBH.Train.last.summary && !!document.querySelector('.trn .done'), null, 40000), 'idle: 15 min of practice ends on the summary');
  ok(await page.evaluate(() => ['again', 'back', 'done'].every((a) => !!document.querySelector('.trn [data-act=' + a + ']'))), 'idle summary: TRAIN AGAIN, BACK and DONE');
  await shot(page, 'return_idle.png');
  const m1 = await page.evaluate(() => BBH.G.ch.minutes); await tap(page, '.trn [data-act=again]');
  ok(await until(page, (m) => BBH.Train.last && !!BBH.Train.last.summary && BBH.G.ch.minutes === m + 15 && !!document.querySelector('.trn .done'), m1, 40000), 'idle TRAIN AGAIN: the same 15 min of the same skill again');
  await tap(page, '.trn [data-act=back]'); await sleep(200);
  ok(await page.evaluate(() => document.querySelector('#ui .sheet .h2').textContent === 'IDLE TRAINING' && !!document.querySelector('.trn .chip[data-min="15"].on') && /ORIGINALITY/.test(document.querySelector('.trn .head .ttl').textContent)), 'idle BACK: the idle picker on Originality, 15 min selected');
  { const p = await atSpot(page, 'booth'), c = await page.evaluate(() => BBH.R3.world.controls.inSpot); ok(landedOk(p) && c === 'booth', 'idle: the hero never left the booth (' + say(p) + ')'); }
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => x.textContent.trim() === 'X'); if (b) b.click(); });
  await until(page, () => BBH.R3.world.controls.inSpot === null, null, 30000);

  /* ------------------------------------------------------------------ EATING: the kitchen sheet stays, so does the hero */
  await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.hunger = 30; BBH.G.setChar(ch); });
  ok(await openSpot(page, 'kitchen') && /^KITCHEN/.test(await sheetTitle(page)), 'the kitchen opens');
  const h0 = await page.evaluate(() => BBH.G.ch.hunger); await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')][0]; if (b) b.click(); }); await sleep(500);
  ok(await page.evaluate((h) => BBH.G.ch.hunger > h && /^KITCHEN/.test(document.querySelector('#ui .sheet .h2').textContent) && BBH.Eng.sceneName === 'place', h0), 'eating: hunger up, the kitchen menu stays open');
  { const p = await atSpot(page, 'kitchen'); ok(landedOk(p) && p.world === 'flat', 'eating: the hero stays at the kitchen (' + say(p) + ')'); }
  /* ------------------------------------------------------------------ SLEEP: the morning card first, then you wake up at the bed */
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => x.textContent.trim() === 'X'); if (b) b.click(); const ch = BBH.Core.clone(BBH.G.ch); ch.minutes = 21 * 60 - 360; ch.energy = 60; BBH.G.setChar(ch); });
  await until(page, () => BBH.R3.world.controls.inSpot === null, null, 30000);
  ok(await openSpot(page, 'bed') && await sheetTitle(page) === 'BED', 'the bed opens BED at 21:00');
  const d0 = await page.evaluate(() => BBH.G.ch.day);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /^SLEEP/.test(x.textContent.trim())); if (b) b.click(); });
  ok(await until(page, () => !!document.querySelector('#ui .full') && /NEW DAY/.test(document.getElementById('ui').innerText) && BBH.R3.world && BBH.R3.world.id === 'flat' && BBH.Eng.scene.w === BBH.R3.world, null, 90000), 'sleep: the morning card shows first');
  await page.evaluate(() => { const c = document.querySelector('#ui .full'); if (c) c.click(); }); await sleep(600);
  ok(await page.evaluate((d) => BBH.G.ch.day === d + 1 && BBH.R3.world.controls.enabled, d0), 'sleep: tap to start the day, the world is playable');
  { const p = await atSpot(page, 'bed'); ok(landedOk(p), 'sleep: you wake up at the bed, not at the door (' + say(p) + ')'); }
  ok(errs.length === 0, 'no console or page errors in 3D' + (errs.length ? ': ' + errs.slice(0, 5).join(' || ') : ''));
  await page.context().close();

  /* ------------------------------------------------------------------ 2D: singing plays the note first, BACK at the booth, busk returns to its hotspot */
  {
    const { page: p2, errs: e2 } = await env.newPage();
    await p2.goto(env.url('index.html?r=2d'));
    await p2.waitForFunction(() => window.BBH && BBH.Eng && BBH.G && BBH.G.trainMenu && BBH.Eng.sceneName === 'title', null, { timeout: 90000 });
    await fresh(p2, { day: 3, minutes: 13 * 60 - 360 });
    await p2.evaluate(() => { const A = BBH.Audio; window.__notes = []; const f = A.note; A.note = function (m) { const s = BBH.Eng.scene; window.__notes.push({ midi: m, scene: BBH.Eng.sceneName, phase: s.phase, round: s.round, target: s.target, at: performance.now() }); return f.apply(A, arguments); }; });
    await p2.evaluate(() => BBH.Eng.go('place', { id: 'home' })); await until(p2, () => BBH.Eng.sceneName === 'place' && !BBH.Eng.pendingSwitch && BBH.Eng.scene.t > 0, null, 30000);
    await p2.evaluate(() => BBH.Eng.scene.walkTo('booth')); ok(await until(p2, () => !!document.querySelector('#ui .sheet .trn'), null, 20000), '2D: walking to the booth opens the training menu');
    const booth = await p2.evaluate(() => ({ x: BBH.Eng.scene.hx, y: BBH.Eng.scene.hy }));
    await tap(p2, '.trn .sk[data-stat=mus]'); await sleep(100); await tap(p2, '.trn [data-act=play]'); await sleep(100); await tap(p2, '.trn [data-act=start-play]');
    ok(await until(p2, () => BBH.Eng.sceneName === 'tuner' && !BBH.Eng.pendingSwitch && !!document.querySelector('#ui .btn'), null, 20000), '2D: SINGING opens the 2D tuner');
    await p2.evaluate(() => { const b = [...document.querySelectorAll('#ui .btn')].find((x) => /HIGHER VOICE/.test(x.textContent)); if (b) b.click(); });
    ok(await until(p2, () => BBH.Eng.scene.mode === 'mic' && BBH.Eng.scene.phase === 'sing', null, 20000), '2D: the (fake) mic opens and the first round reaches SING IT');
    const t2 = await p2.evaluate(() => { const s = BBH.Eng.scene, n = window.__notes.filter((x) => x.scene === 'tuner' && x.round === 1); return { target: s.target, n: n.length, midi: n.map((x) => x.midi), phase: n.map((x) => x.phase), listen: !!document.querySelector('#ui [data-act=listen]'), gm: BBH.Audio.isGameMode() }; });
    ok(t2.n >= 1 && t2.midi.every((m) => m === t2.target) && t2.phase[0] === 'ref', '2D singing: Audio.note(' + t2.target + ') played the target after the count-in, before SING IT (' + JSON.stringify(t2) + ')');
    ok(t2.gm === true, '2D singing: the music is off (Audio.gameMode)');
    const c0 = await p2.evaluate(() => window.__notes.length); await tap(p2, '#ui [data-act=listen]'); await sleep(150);
    ok(t2.listen && await p2.evaluate((c) => window.__notes.length > c && window.__notes[window.__notes.length - 1].midi === BBH.Eng.scene.target && BBH.Eng.scene.phase === 'ref', c0), '2D singing: LISTEN plays the note again and restarts the listen window');
    await p2.evaluate(() => { const s = BBH.Eng.scene; s.score = 5; s.round = s.rounds; s.finish(); }); await sleep(300);
    ok((await acts(p2, '#ui .panel.pop [data-act]')).join() === 'TRAIN AGAIN,BACK,CONTINUE', '2D tuner card: TRAIN AGAIN, BACK, CONTINUE');
    await shot(p2, 'return_2d_tuner.png');
    await tap(p2, '#ui .panel.pop [data-act=back]');
    ok(await until(p2, () => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs.id === 'home' && !BBH.Eng.pendingSwitch && !!document.querySelector('#ui .sheet .trn [data-game=tune].on'), null, 20000), '2D tuner BACK: home with the training menu on SINGING');
    ok(await p2.evaluate((b) => Math.abs(BBH.Eng.scene.hx - b.x) < 2 && Math.abs(BBH.Eng.scene.hy - b.y) < 2, booth), '2D tuner BACK: standing at the booth hotspot');
    // busk in 2D: CONTINUE lands at the busking hotspot
    await p2.evaluate(() => BBH.Eng.go('place', { id: 'park' })); await until(p2, () => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs.id === 'park' && !BBH.Eng.pendingSwitch && BBH.Eng.scene.t > 0, null, 30000);
    await p2.evaluate(() => BBH.Eng.scene.walkTo('spot')); await until(p2, () => !!document.querySelector('#ui .sheet .h2') && document.querySelector('#ui .sheet .h2').textContent === 'BUSKING SPOT', null, 20000);
    const spot2 = await p2.evaluate(() => ({ x: BBH.Eng.scene.hx, y: BBH.Eng.scene.hy, st: BBH.Eng.scene.sc.spots.stand }));
    await p2.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => /^BUSK  /.test(x.textContent)); if (b) b.click(); });
    ok(await until(p2, () => BBH.Eng.sceneName === 'rhythm' && !BBH.Eng.pendingSwitch, null, 20000), '2D busk starts');
    await p2.evaluate(() => { const s = BBH.Eng.scene, C = BBH.Core; s.reallyDone = true; s.state = 'result'; s.a.onDone(C.summarize([0, 1, 2, 3, 0, 1, 2, 3].map((l) => ({ grade: 'perfect', lane: l })), 8, 8)); }); await sleep(300);
    ok((await acts(p2, '#ui .panel.pop [data-act]')).join() === 'PLAY AGAIN,BACK,CONTINUE', '2D busk card: PLAY AGAIN, BACK, CONTINUE');
    await shot(p2, 'return_2d_busk.png');
    await tap(p2, '#ui .panel.pop [data-act=continue]');
    ok(await until(p2, () => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs.id === 'park' && !BBH.Eng.pendingSwitch && BBH.Eng.scene.t > 0, null, 20000), '2D busk CONTINUE: the park');
    ok(await p2.evaluate((b) => Math.abs(BBH.Eng.scene.hx - b.x) < 2 && Math.abs(BBH.Eng.scene.hy - b.y) < 2 && (Math.abs(b.x - b.st.x) > 4 || Math.abs(b.y - b.st.y) > 4), spot2), '2D busk CONTINUE: standing at the busking hotspot, not at the gate');
    ok(e2.length === 0, '2D: no errors' + (e2.length ? ': ' + e2.slice(0, 3).join(' || ') : ''));
    await p2.context().close();
  }
} catch (e) {
  ok(false, 'r3return suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done();
