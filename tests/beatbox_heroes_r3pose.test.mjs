// r3 POSE gate (TRAINING_PLAN, owner POSE): the SHOWMANSHIP pose game (park3d/mg_pose*.js, r3/scenes_pose.js) in the REAL game in 3D (?r=3d, headless Chromium + swiftshader).
//   boots       ?r=3d boots, E.scenes3d.pose is registered and picked, E.go('pose') loads the 'pose' world with the level select (level 1 open, 2..8 locked)
//   music       no music track while the game runs (Audio.gameMode on), only the shaker metronome; gameMode is off again after leaving
//   bot win     a bot run at level 1 scores every slot, the save equals Core.apply({t:'trainGame', stat:'show', game:'pose', level:1, q}) (show, xp, energy, minutes),
//               trainLv.pose goes 1 -> 2, the card shows the real Showmanship gain and LEVEL 2 UNLOCKED, CONTINUE returns to the place, the select then shows level 2 open
//   input       a real pad tap on the beat is judged COOL, a real arrow key press is a move, a press before the window is "early", the wrong move is WRONG
//   wrong order a bot that repeats the phrase in the wrong order is booed off (lost, q < 0.7), nothing unlocks
//   locks       start({level: locked}) is refused, BACK before the end leaves without spending anything
//   budget      <= 80k tris and <= 60 draw calls (low tier), no console errors
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3pose suite hung'); process.exit(1); }, 540000);
const env = await r3env('beatbox_heroes_r3pose');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 120000;

try {
  const { page, errs } = await env.newPage({ viewport: { width: 360, height: 640 } });
  page.setDefaultTimeout(T);
  await page.goto(env.url('index.html?r=3d&q=low'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed'), null, { timeout: 90000 });
  ok(await page.evaluate(() => BBH.R3.status) === 'ready', '?r=3d boots');
  ok(await page.evaluate(() => !!(BBH.Eng.scenes3d.pose && BBH.Eng.scenes3d.pose.is3d && BBH.Eng.pickScene('pose') === BBH.Eng.scenes3d.pose)), 'E.scenes3d.pose is registered and picked while 3D is on');
  ok(await page.evaluate(() => Array.isArray(BBH.Core.POSE_LEVELS) && BBH.Core.POSE_LEVELS.length === 8), 'Core.POSE_LEVELS has 8 levels');
  const fresh = (extra) => page.evaluate((extra) => {   // a clean hero at home at 12:00, plenty of energy, pose level 1
    const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.look = Object.assign({}, ch.look, { name: 'Zed' }); ch.name = 'Zed'; ch.created = Date.now(); ch.flags.intro = 1; ch.place = 'home'; ch.energy = 80; ch.minutes = 12 * 60;
    ch.trainLv = Object.assign({}, ch.trainLv || {}, { pose: 1 }); Object.assign(ch, extra || {}); BBH.G.slot = 1; BBH.G.setChar(ch); BBH.Eng.settings.offset = 0; BBH.Eng.settings.muted = false; return true;
  }, extra);
  const BACK = { scene: 'place', args: { id: 'home' } };
  const go = async (a) => {
    await page.evaluate((a) => BBH.Eng.go('pose', a), a);
    await page.waitForFunction(() => BBH.Eng.sceneName === 'pose' && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === 'pose' && BBH.R3.world.game, null, { timeout: T });
    await sleep(900);
  };
  const waitPlace = (id) => page.waitForFunction((id) => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs && BBH.Eng.sceneArgs.id === id, id, { timeout: T });
  const snapCh = () => page.evaluate(() => JSON.parse(JSON.stringify(BBH.G.ch)));
  const st = () => page.evaluate(() => BBH.R3.world.game.state());
  // tick the manual game to a beat position (sim time only moves through tick)
  const tickTo = (b) => page.evaluate((b) => { const g = BBH.R3.world.game, s = g.state(), dt = b * s.spb - s.t; if (dt > 0) g.tick(dt); return g.state(); }, b);

  /* ===================================================================== select, locks, music */
  await fresh(); const c0 = await snapCh();
  await go({ back: BACK });
  const s0 = await page.evaluate(() => { const g = BBH.R3.world.game, s = g.state(); return { s, cards: document.querySelectorAll('.pz-lv').length, locked: document.querySelectorAll('.pz-lv.lk').length, music: BBH.Audio.music.current(), gm: BBH.Audio.isGameMode ? BBH.Audio.isGameMode() : null }; });
  ok(s0.s.phase === 'select' && s0.s.selectOpen && s0.cards === 8, 'pose: the level select shows 8 levels (' + s0.cards + ')');
  ok(s0.locked === 7 && s0.s.unlocked === 1, 'pose: only level 1 is open on a new save (' + s0.locked + ' locked)');
  ok(await page.evaluate(() => BBH.R3.world.game.start({ level: 3 })) === false && (await st()).phase === 'select', 'pose: a locked level cannot be started');
  await page.locator('.pz-lv.lk').first().click(); await sleep(200);
  ok((await st()).phase === 'select', 'pose: tapping a locked card keeps the select open');
  ok(s0.music === null && s0.gm === true, 'pose: no music track while the pose game is on screen (music ' + s0.music + ', gameMode ' + s0.gm + ')');
  await page.locator('.pz-lv[data-level="1"]').click(); await sleep(300);
  const sStart = await st();
  ok(sStart.phase === 'run' && sStart.level === 1 && sStart.rounds === 4 && sStart.moves.join() === 'left,right,duck,jump', 'pose: tapping level 1 starts it (4 rounds, moves ' + sStart.moves.join(' ') + ')');
  ok(sStart.seqs.every((q, i) => q.length >= 2 && (i === 0 || q.length >= sStart.seqs[i - 1].length)) && sStart.seqs[3].length === 3, 'pose: the rounds grow (' + sStart.seqs.map((q) => q.length).join(',') + ')');
  await sleep(1200);
  const mid = await page.evaluate(() => ({ music: BBH.Audio.music.current(), t: BBH.R3.world.game.state().t }));
  ok(mid.music === null && mid.t > 0.5, 'pose: the run plays with no music track (t ' + mid.t.toFixed(2) + ')');

  /* ===================================================================== real input: pad tap and keyboard on the beat */
  const s1 = await page.evaluate(() => { const g = BBH.R3.world.game; g.start({ level: 1, manual: true, seed: 11 }); return g.state(); });
  const R0 = s1.seqs[0], play0 = 2 + 4 + R0.length;
  await tickTo(2 + 2 + 0.2);
  const teach = await st(); ok(teach.sub === 'teach' && teach.coachClip === 'pz_' + R0[0], 'pose: the coach performs the first move on its beat (' + teach.coachClip + ')');
  const early = await page.evaluate((m) => BBH.R3.world.game.press(m), R0[0]);
  ok(early && early.grade === 'watch', 'pose: pressing while the coach shows the phrase is not scored (' + (early && early.grade) + ')');
  await tickTo(play0);                                                            // exactly on slot 0
  const pad = await page.locator('.pz-pad[data-move="' + R0[0] + '"]').boundingBox();
  await page.mouse.click(pad.x + pad.width / 2, pad.y + pad.height / 2); await sleep(150);
  const a1 = await st();
  ok(a1.results[0] === 'cool' && a1.heroClip === 'pz_' + R0[0], 'pose: a real pad tap on the beat is COOL and the hero performs it (' + a1.results[0] + ', ' + a1.heroClip + ')');
  const KEY = { left: 'ArrowLeft', right: 'ArrowRight', duck: 'ArrowDown', jump: 'ArrowUp' };
  await tickTo(play0 + 1 + 0.05);
  await page.keyboard.press(KEY[R0[1]]); await sleep(100);
  ok((await st()).results[1] === 'cool', 'pose: a real arrow key on the beat is judged too (' + (await st()).results[1] + ')');
  const wrongMove = ['left', 'right', 'duck', 'jump'].find((m) => m !== s1.seqs[1][0]);
  await tickTo(2 + (6 + 2 * R0.length) + 4 + s1.seqs[1].length - 0.02);
  const w1 = await page.evaluate((m) => BBH.R3.world.game.press(m), wrongMove);
  ok(w1 && w1.grade === 'wrong', 'pose: the wrong move in a slot is WRONG (' + (w1 && w1.grade) + ')');
  const tooEarly = await page.evaluate((m) => BBH.R3.world.game.press(m), s1.seqs[1][1]);
  ok(tooEarly && tooEarly.grade === 'early', 'pose: a press a beat before its slot is early, not scored (' + (tooEarly && tooEarly.grade) + ')');

  /* ===================================================================== bot win at level 1: the save, the unlock, the card */
  const pre = await snapCh();
  const run = await page.evaluate(() => { const g = BBH.R3.world.game; g.start({ level: 1, manual: true, seed: 3 }); g.bot(); for (let i = 0; i < 4000 && g.state().phase === 'run'; i++) g.tick(0.05); const r = g.result(); for (let i = 0; i < 50; i++) g.tick(0.05); return { r, s: g.state() }; });
  await sleep(500);
  ok(run.r && run.r.q === 1 && run.r.cool === run.r.slots && run.r.grade === 'S' && run.r.passed && !run.r.lost, 'pose: a bot run at level 1 hits every slot COOL (q ' + (run.r && run.r.q) + ', ' + (run.r && run.r.slots) + ' slots)');
  ok(run.r.perfectRounds === 4 && run.s.cardOpen, 'pose: 4 perfect rounds, the result card is up');
  const post = await snapCh();
  const want = await page.evaluate(([c, q]) => { const r = BBH.Core.apply(c, { t: 'trainGame', stat: 'show', game: 'pose', level: 1, q, where: 'home' }, () => 0.5).char; return { show: r.stats.show, xp: r.xp, level: r.level, energy: r.energy, minutes: r.minutes, lv: r.trainLv.pose, games: r.n.trainGames }; }, [pre, run.r.q]);
  ok(Math.abs(post.stats.show - want.show) < 0.011 && post.stats.show > pre.stats.show, 'pose: Showmanship equals Core trainGame (' + pre.stats.show.toFixed(2) + ' -> ' + post.stats.show.toFixed(2) + ', want ' + want.show.toFixed(2) + ')');
  ok(post.xp === want.xp && post.level === want.level && post.energy === want.energy && post.minutes === want.minutes && post.n.trainGames === want.games, 'pose: xp, energy, minutes and the counter equal Core trainGame (' + [post.minutes - pre.minutes, post.energy - pre.energy].join(' / ') + ')');
  ok(pre.trainLv.pose === 1 && post.trainLv.pose === 2 && want.lv === 2, 'pose: q >= 0.7 at the top level unlocks level 2 (trainLv.pose ' + post.trainLv.pose + ')');
  const card = await page.evaluate(() => ({ sh: (document.querySelector('.pz-card .pz-rw') || {}).textContent || '', un: (document.querySelector('.pz-card .pz-un') || {}).textContent || '', btns: [...document.querySelectorAll('.pz-card button')].map((b) => b.textContent), g: (document.querySelector('.pz-card .pz-g') || {}).textContent }));
  ok(card.sh === '+' + (Math.round((post.stats.show - pre.stats.show) * 10) / 10).toFixed(1) + ' SHOWMANSHIP' && /LEVEL 2 UNLOCKED/.test(card.un) && card.g === 'S', 'pose: the card shows the real gain and the unlock (' + card.sh + ' | ' + card.un + ')');
  ok(card.btns.length === 1 && card.btns[0] === 'CONTINUE', 'pose: in the game the card only has CONTINUE');
  await page.locator('.pz-card button', { hasText: 'CONTINUE' }).click(); await waitPlace('home');
  ok((await snapCh()).n.trainGames === pre.n.trainGames + 1, 'pose: CONTINUE returns to the place, the session counted once');
  ok(await page.evaluate(() => !BBH.Audio.isGameMode || !BBH.Audio.isGameMode()), 'pose: gameMode is off again after leaving');

  // the select now opens level 2; E.go('pose', {level}) starts that level at once
  await go({ back: BACK });
  ok(await page.evaluate(() => document.querySelectorAll('.pz-lv.lk').length) === 6 && (await st()).unlocked === 2, 'pose: after the unlock the select shows level 2 open');
  await page.locator('.pz-bk').click(); await waitPlace('home');
  const q0 = await snapCh(); ok(q0.minutes === post.minutes && q0.energy === post.energy, 'pose: BACK on the select leaves without spending anything');
  await go({ level: 2, back: BACK });
  const auto = await st(); ok(auto.phase === 'run' && auto.level === 2 && auto.moves.indexOf('point') >= 0, 'pose: E.go("pose", {level: 2}) starts level 2 at once (moves ' + auto.moves.join(' ') + ')');
  await page.locator('.pz-bk').click(); await waitPlace('home');
  const q1 = await snapCh(); ok(q1.minutes === post.minutes && q1.stats.show === post.stats.show && q1.trainLv.pose === 2, 'pose: BACK during a run aborts without spending anything');

  /* ===================================================================== wrong order loses */
  await fresh(); const w0 = await snapCh();
  await go({ level: 1, back: BACK });
  const lose = await page.evaluate(() => { const g = BBH.R3.world.game; g.start({ level: 1, manual: true, seed: 5 }); g.bot('wrong'); for (let i = 0; i < 4000 && g.state().phase === 'run'; i++) g.tick(0.05); const r = g.result(); for (let i = 0; i < 50; i++) g.tick(0.05); return { r, s: g.state(), lost: (document.querySelector('.pz-card .pz-lost') || {}).textContent || '' }; });
  ok(lose.r && lose.r.lost && !lose.r.passed && lose.r.q < 0.7 && lose.r.wrong > 0 && lose.r.cool === 0, 'pose: repeating the phrase in the wrong order gets you booed off (q ' + (lose.r && lose.r.q) + ', wrong ' + (lose.r && lose.r.wrong) + ')');
  ok(lose.r.roundsPlayed < 4 && /booed/.test(lose.lost), 'pose: the show stops early and the card says why (' + lose.r.roundsPlayed + ' rounds)');
  const w1s = await snapCh(); ok(w1s.trainLv.pose === 1 && w0.trainLv.pose === 1, 'pose: a lost run unlocks nothing');
  await page.locator('.pz-card button', { hasText: 'CONTINUE' }).click(); await waitPlace('home');

  /* ===================================================================== budget, errors */
  await fresh(); await go({ level: 1, back: BACK }); await sleep(1500);
  const b = await page.evaluate(() => BBH.R3.host.stats());
  ok(b.tris <= 80000 && b.calls <= 60, 'pose: within budget on the low tier (' + b.tris + ' tris, ' + b.calls + ' calls)');
  await page.locator('.pz-bk').click(); await waitPlace('home');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
} catch (e) {
  ok(false, 'r3pose suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done('beatbox_heroes_r3pose');
