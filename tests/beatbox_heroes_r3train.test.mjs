// r3 TRAIN gate (park3d/TRAINING_PLAN.md): skill training in the REAL game (?r=3d, headless Chromium + swiftshader), through r3/scenes_train.js and park3d/mg_ear*.js.
//   menu      the home booth opens the training menu (sheet "VOCAL BOOTH: TRAIN"): four skills with their values, IDLE TRAINING and PLAY
//   idle      1 h of Musicality: the clock runs (4 trainTick pops, one by one), STOP-free run ends on a summary, the save equals Core.apply({t:'trainIdle'})
//   ear       level 1 from the menu: lesson card (PLAY EXAMPLE calls Audio.interval), a bot answers every round with answer(), the save equals Core trainGame,
//             about 2x the idle gain of the same time, level 2 unlocks (q >= 0.7) and shows in the menu; music off through Audio.gameMode
//   2D        ?r=2d: the same menu inside the 2D place sheet, idle training works, ear training is marked 3D only
// BBH_SHOTS=<dir> also writes train_*.png screenshots there. SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { boot, seed, goScene, sceneReady, adv, until, sleep, sheetTitle, ctl } from './beatbox_heroes_r3gamelib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3train suite hung'); process.exit(1); }, 540000);
const env = await r3env('beatbox_heroes_r3train');
const SHOTS = process.env.BBH_SHOTS || '';
const shot = async (page, name) => { if (!SHOTS) return; try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } catch (e) { console.log('shot failed ' + name + ': ' + e.message); } };
const click = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);

try {
  const { page, errs } = await boot(env);
  await page.evaluate(() => {   // spy on the ear-training voices (AUDIO may not have landed them yet: a no-op stand-in then)
    const A = BBH.Audio = BBH.Audio || {}; window.__calls = { interval: 0, chord: 0, note: 0, gameMode: [] };
    for (const k of ['interval', 'chord', 'note']) { const f = A[k]; A[k] = function () { window.__calls[k]++; return f ? f.apply(A, arguments) : undefined; }; }
    const gm = A.gameMode; A.gameMode = function (on) { window.__calls.gameMode.push(!!on); return gm ? gm.apply(A, arguments) : undefined; };
  });
  await seed(page, { day: 3, minutes: 13 * 60 - 360, energy: 90, stats: { mus: 10, tech: 8, ori: 6, show: 4 } });

  /* ------------------------------------------------------------------ menu from the home booth */
  ok(await goScene(page, 'place', { id: 'home' }, 'flat'), 'home: the 3D flat loads');
  await page.evaluate(() => BBH.R3.world.activate('booth'));
  ok(await until(page, () => !!document.querySelector('#ui .sheet .trn .sk'), null, 30000), 'the booth opens the training menu');
  ok(await sheetTitle(page) === 'VOCAL BOOTH: TRAIN', 'the menu is the booth sheet "VOCAL BOOTH: TRAIN" (' + await sheetTitle(page) + ')');
  const m0 = await page.evaluate(() => ({ tiles: [...document.querySelectorAll('.trn .sk')].map((b) => b.textContent.replace(/\s+/g, '')), idle: !!document.querySelector('.trn [data-act=idle]'), play: !!document.querySelector('.trn [data-act=play]') }));
  ok(m0.tiles.length === 4 && /MUS10/.test(m0.tiles[0]) && /TECH8/.test(m0.tiles[1]) && /SHOW4/.test(m0.tiles[3]), 'four skills with their current values (' + m0.tiles.join(' ') + ')');
  ok(m0.idle && m0.play, 'two big choices: IDLE TRAINING and PLAY');
  { const c = await ctl(page); ok(c.inSpot === 'booth' && c.locked, 'the hero stays at the booth while the menu is open'); }
  await click(page, '.trn .sk[data-stat=mus]'); await sleep(200); await adv(page, 1); await sleep(400);
  await shot(page, 'train_menu.png');

  /* ------------------------------------------------------------------ IDLE 1 h */
  await click(page, '.trn [data-act=idle]'); await sleep(200);
  ok(await page.evaluate(() => document.querySelectorAll('.trn .chip[data-min]').length === 6 && /\+\d/.test(document.querySelector('.trn .chip[data-min="60"]').textContent)), 'idle: six durations (15 min to 4 h), each with its gain');
  await click(page, '.trn .chip[data-min="60"]'); await sleep(150);
  const pre = await page.evaluate(() => { const ch = BBH.G.ch, r = BBH.Core.apply(ch, { t: 'trainIdle', stat: 'mus', minutes: 60, where: 'home' }, () => 0.5).char; return { min: ch.minutes, mus: ch.stats.mus, en: ch.energy, xmus: r.stats.mus, xmin: r.minutes, xen: r.energy }; });
  await page.evaluate(() => { BBH.Train.speed = 2.5; });
  await click(page, '.trn [data-act=start-idle]');
  ok(await until(page, () => BBH.Train.last && BBH.Train.last.pops >= 2, null, 30000), 'idle: the pops tick up one by one');
  const mid = await page.evaluate(() => ({ pops: document.querySelectorAll('.trn-pop').length, txt: (document.querySelector('.trn-pop') || {}).textContent || '', clk: (document.querySelector('.trn .clk') || {}).textContent, hudMin: BBH.G.ch.minutes }));
  await shot(page, 'train_idle.png');
  ok(/^\+\d\.\d+ MUSICALITY$/.test(mid.txt), 'idle: a pop reads like "+0.2 MUSICALITY" (' + mid.txt + ')');
  ok(mid.clk !== '13:00' && mid.hudMin === pre.min, 'idle: the shown clock runs fast (' + mid.clk + ') while the save waits for the commit');
  ok(await until(page, () => BBH.Train.last && !!BBH.Train.last.summary && !!document.querySelector('.trn .done'), null, 40000), 'idle: the session ends on a summary card');
  const post = await page.evaluate(() => ({ min: BBH.G.ch.minutes, mus: BBH.G.ch.stats.mus, en: BBH.G.ch.energy, ticks: BBH.Train.last.ticks.length, pops: BBH.Train.last.pops, sum: document.querySelector('.trn .done').textContent, title: (document.querySelector('#ui .sheet .h2') || {}).textContent }));
  ok(post.ticks === 4 && post.pops === 4, 'idle: 1 h = 4 trainTick pops (' + post.ticks + ' ticks, ' + post.pops + ' pops)');
  ok(post.min === pre.min + 60 && post.min === pre.xmin, 'idle: the day clock advanced by 1 h (' + pre.min + ' -> ' + post.min + ')');
  ok(post.mus > pre.mus && Math.abs(post.mus - pre.xmus) < 1e-9 && post.en === pre.xen, 'idle: Musicality rose exactly like Core.apply({t:"trainIdle"}) (' + pre.mus + ' -> ' + post.mus.toFixed(3) + ')');
  ok(/1 H OF PRACTICE/.test(post.sum) && post.title === 'PRACTICE DONE', 'idle: the summary says what you practised (' + post.sum.replace(/\s+/g, ' ') + ')');
  await shot(page, 'train_idle_done.png');
  await click(page, '.trn [data-act=done]'); await sleep(300);
  ok(await until(page, () => !document.querySelector('#ui .sheet') && BBH.R3.world.controls.inSpot === null, null, 30000), 'idle: DONE closes the menu and gives the hero back');

  // STOP early keeps only what was practised (whole 15 min steps)
  await page.evaluate(() => BBH.R3.world.activate('booth')); await until(page, () => !!document.querySelector('.trn [data-act=idle]'), null, 30000);
  await click(page, '.trn [data-act=idle]'); await sleep(150); await click(page, '.trn .chip[data-min="120"]'); await sleep(150);
  const s0 = await page.evaluate(() => BBH.G.ch.minutes); await page.evaluate(() => { BBH.Train.speed = 1; }); await click(page, '.trn [data-act=start-idle]');
  await until(page, () => BBH.Train.last && BBH.Train.last.done >= 2, null, 30000); await click(page, '.trn [data-act=stop]');
  ok(await until(page, () => BBH.Train.last.summary, null, 20000) && await page.evaluate((s0) => { const L = BBH.Train.last; return L.done < 8 && BBH.G.ch.minutes === s0 + L.done * 15; }, s0), 'idle: STOP spends only the minutes practised');
  await click(page, '.trn [data-act=done]'); await sleep(300);

  /* ------------------------------------------------------------------ PLAY: ear training level 1 */
  await seed(page, { day: 3, minutes: 13 * 60 - 360, energy: 90, stats: { mus: 10, tech: 8, ori: 6, show: 4 } });
  ok(await goScene(page, 'place', { id: 'home' }, 'flat'), 'home again with a fresh save');
  await page.evaluate(() => BBH.R3.world.activate('booth')); await until(page, () => !!document.querySelector('.trn [data-act=play]'), null, 30000);
  await click(page, '.trn .sk[data-stat=mus]'); await sleep(100); await click(page, '.trn [data-act=play]'); await sleep(200);
  const pv = await page.evaluate(() => ({ games: [...document.querySelectorAll('.trn [data-game]')].map((b) => b.dataset.game), lv: [...document.querySelectorAll('.trn .chip[data-level]')].map((b) => b.classList.contains('lock') ? 'L' : 'o').join(''), x2: /x2 gains, less time/.test(document.querySelector('.trn .head').textContent) }));
  ok(pv.games.join() === 'ear,tune' && pv.lv === 'oLLLLLLL' && pv.x2, 'play: Musicality offers EAR TRAINING and SINGING, level 1 open, 2..8 locked, "x2 gains, less time" (' + pv.lv + ')');
  await shot(page, 'train_play.png');
  const b0 = await page.evaluate(() => { const ch = BBH.G.ch; return { mus: ch.stats.mus, min: ch.minutes, idle20: BBH.Core.idleGain(ch, 'mus', 20, 'home'), idle60: BBH.Core.idleGain(ch, 'mus', 60, 'home'), exp: BBH.Core.apply(ch, { t: 'trainGame', stat: 'mus', game: 'ear', level: 1, q: 1, where: 'home' }, () => 0.5).char }; });
  await click(page, '.trn [data-act=start-play]');
  ok(await sceneReady(page, 'ear', 'ear'), 'play: the ear training scene loads its own 3D world');
  await until(page, () => BBH.R3.world.game && BBH.R3.world.game.state().lessonOpen, null, 30000);
  const ls = await page.evaluate(() => ({ want: BBH.Core.EAR_LEVELS[0].lesson.title, title: (document.querySelector('.er-card h1') || {}).textContent, exs: document.querySelectorAll('.er-ex').length, gm: window.__calls.gameMode.slice() }));
  ok(ls.title === ls.want, 'ear: level 1 opens with its lesson card ("' + ls.title + '")');
  ok(ls.exs >= 2, 'ear: the lesson has PLAY EXAMPLE buttons (' + ls.exs + ')');
  ok(ls.gm[ls.gm.length - 1] === true, 'ear: the music is off (Audio.gameMode(true))');
  const ic0 = await page.evaluate(() => window.__calls.interval); await click(page, '.er-ex'); await sleep(900);
  ok(await page.evaluate((n) => window.__calls.interval > n, ic0), 'ear: PLAY EXAMPLE plays the notes through Audio.interval');
  await shot(page, 'train_lesson.png');
  await click(page, '.er-go'); await sleep(200);
  await page.evaluate(() => { const g = BBH.R3.world.game; g.manual(true); g.tick(1.0); });
  await sleep(500); await shot(page, 'train_ear.png');
  const st1 = await page.evaluate(() => ({ s: BBH.R3.world.game.state(), btns: [...document.querySelectorAll('.er-grid button')].map((b) => b.textContent) }));
  ok(st1.s.state === 'play' && st1.s.rounds === 6 && st1.btns.join() === 'HIGHER,LOWER', 'ear: round 1 of 6 with big HIGHER / LOWER buttons');
  await page.evaluate(() => { const g = BBH.R3.world.game, s = g.state(); g.answer(s.answer); g.tick(0.1); });
  await sleep(400); await shot(page, 'train_ear_fb.png');
  ok(await page.evaluate(() => /CORRECT|NICE|YES|FIRE/.test(document.querySelector('.er-fb .big').textContent) && document.querySelector('.er-fb .why').textContent.length > 10), 'ear: instant feedback with a short explanation');
  const res = await page.evaluate(() => {
    const g = BBH.R3.world.game; for (let n = 0; n < 3000 && g.state().state !== 'done'; n++) { const s = g.state(); if (s.phase === 'ask' || s.phase === 'listen') g.answer(s.answer); g.tick(0.1); }
    for (let i = 0; i < 6; i++) g.tick(0.1); return { r: g.result(), s: g.state() };
  });
  await sleep(500);
  ok(res.r && res.r.score === 6 && res.r.q === 1 && res.r.pass && res.s.bestStreak === 6, 'ear: the bot answers all 6 rounds (score ' + (res.r && res.r.score) + ', streak ' + res.s.bestStreak + ')');
  const a1 = await page.evaluate(() => ({ mus: BBH.G.ch.stats.mus, min: BBH.G.ch.minutes, lv: BBH.G.ch.trainLv.ear, card: (document.querySelector('.er-card') || {}).textContent || '', musTxt: (document.querySelector('.er-mus') || {}).textContent }));
  const gain = a1.mus - b0.mus, mins = a1.min - b0.min;
  ok(Math.abs(a1.mus - b0.exp.stats.mus) < 1e-9 && a1.min === b0.exp.minutes, 'ear: the save equals Core.apply({t:"trainGame", game:"ear", level:1, q:1})');
  ok(gain / b0.idle20 > 1.7 && gain / b0.idle20 < 2.3, 'ear: about 2x the idle gain for the same time (' + gain.toFixed(3) + ' vs idle ' + b0.idle20.toFixed(3) + ')');
  ok(mins === 20 && mins < 60 && gain > b0.idle60 * 0.6, 'ear: 20 min of play gives most of what 1 h of idle does (' + gain.toFixed(2) + ' vs ' + b0.idle60.toFixed(2) + ')');
  ok(a1.lv === 2 && /LEVEL 2 UNLOCKED/.test(a1.card), 'ear: 70%+ unlocks level 2 and the card says so');
  ok(a1.musTxt === '+' + (Math.round(gain * 10) / 10).toFixed(1), 'ear: the card shows the real Musicality gain (' + a1.musTxt + ')');
  await shot(page, 'train_ear_result.png');
  await click(page, '.er-card .er-go:last-child');
  ok(await sceneReady(page, 'place', 'flat'), 'ear: CONTINUE returns to the flat');
  ok(await page.evaluate(() => window.__calls.gameMode[window.__calls.gameMode.length - 1] === false), 'ear: leaving turns the music back on (Audio.gameMode(false))');
  await page.evaluate(() => BBH.R3.world.activate('booth')); await until(page, () => !!document.querySelector('.trn [data-act=play]'), null, 30000);
  await click(page, '.trn .sk[data-stat=mus]'); await sleep(100); await click(page, '.trn [data-act=play]'); await sleep(200);
  ok(await page.evaluate(() => [...document.querySelectorAll('.trn .chip[data-level]')].map((b) => b.classList.contains('lock') ? 'L' : 'o').join('')) === 'ooLLLLLL', 'menu: level 2 is now open, 3..8 still locked');
  await click(page, '[data-act=start-play]');   // level 2 ear
  ok(await sceneReady(page, 'ear', 'ear'), 'ear: level 2 starts from the menu');
  ok(await page.evaluate(() => BBH.R3.world.game.state().level === 2 && /LEVEL 2/.test(document.querySelector('.er-card .kick').textContent)), 'ear: level 2 shows its own lesson');
  await click(page, '.er-back'); ok(await sceneReady(page, 'place', 'flat'), 'ear: BACK before the end returns without spending anything');
  ok(await page.evaluate((m) => BBH.G.ch.minutes === m, a1.min), 'ear: quitting spent no time');

  ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));

  /* ------------------------------------------------------------------ 2D */
  const p2 = await env.newPage({ viewport: { width: 360, height: 640 } });
  await p2.page.goto(env.url('index.html?r=2d'));
  await p2.page.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.scenes.place && BBH.G && BBH.G.trainMenu && BBH.Eng.sceneName === 'title', null, { timeout: 90000 });
  await seed(p2.page, { day: 3, minutes: 13 * 60 - 360, energy: 90 });
  await p2.page.evaluate(() => BBH.Eng.go('place', { id: 'home' })); await p2.page.waitForFunction(() => BBH.Eng.sceneName === 'place' && !BBH.Eng.pendingSwitch, null, { timeout: 30000 }); await sleep(400);
  await p2.page.evaluate(() => BBH.G.places.ACTIONS.home.booth(BBH.Eng.scene));
  ok(await p2.page.evaluate(() => !!document.querySelector('#ui .sheet .trn .sk') && !BBH.Eng.scene.is3d), '2D: the booth opens the same training menu');
  await click(p2.page, '.trn [data-act=play]'); await sleep(150);
  ok(await p2.page.evaluate(() => document.querySelector('.trn [data-game=ear]').classList.contains('lock') && document.querySelector('.trn [data-game=tune]').classList.contains('on')), '2D: ear training is marked 3D only, singing (the 2D tuner) is the PLAY game');
  await shot(p2.page, 'train_2d_play.png');
  await click(p2.page, '.trn .head .bk'); await sleep(100); await click(p2.page, '.trn [data-act=idle]'); await sleep(100); await click(p2.page, '.trn .chip[data-min="30"]');
  const m2 = await p2.page.evaluate(() => ({ min: BBH.G.ch.minutes, st: BBH.Train.lastStat || null }));
  await p2.page.evaluate(() => { BBH.Train.speed = 4; }); await click(p2.page, '.trn [data-act=start-idle]');
  ok(await until(p2.page, () => BBH.Train.last && BBH.Train.last.summary, null, 30000) && await p2.page.evaluate((m) => BBH.G.ch.minutes === m + 30 && BBH.Train.last.pops === 2, m2.min), '2D: idle training works (30 min, 2 pops)');
  await shot(p2.page, 'train_2d_done.png');
  ok(p2.errs.length === 0, '2D: no console errors' + (p2.errs.length ? ': ' + p2.errs.slice(0, 3).join(' | ') : ''));
} catch (e) {
  ok(false, 'r3train suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done('beatbox_heroes_r3train');
