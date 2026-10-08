// r3 BEAT gate (TRAINING_PLAN, BEAT): music OFF in every rhythm mode + RHYTHM TRAINING, the REAL game in 3D (?r=3d, headless Chromium + swiftshader).
//   * busk, open mic, karaoke, showcase, practice, battle (incl. the rival turn) and training: no music track and no backing groove plays, only the shaker metronome
//     at the chart bpm (aligned to the chart clock and E.settings.offset); leaving hands the music back (the place plays its own track again).
//   * training: E.go('rhythm', { mode:'train' }) opens the level select in the lab booth (1 open, 2..8 locked), level 1 = Boots and Cats: LISTEN (the hero's call lights
//     every pattern step), YOUR TURN, gems; the bot run gives exactly Core trainGame { stat:'tech', game:'beat', level:1, q }; 70% unlocks level 2 (NEXT LEVEL), a weak run
//     does not unlock level 3; best grades show in the level select.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3beat suite hung'); process.exit(1); }, 900000);
const env = await r3env('beatbox_heroes_r3beat');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PLACE_WORLD = { park: 'park', bar: 'bar', studio: 'lab', home: 'flat' };
const waitPlace = (page, id, ms) => page.waitForFunction(([id, wid]) => { const E = BBH.Eng, sc = E.scene; if (E.sceneName !== 'place' || !sc || E.pendingSwitch || E.sceneArgs.id !== id) return false; return sc.is3d ? !!(BBH.R3.world && BBH.R3.world.id === wid && sc.t > 0) : sc.t > 0; }, [id, PLACE_WORLD[id]], { timeout: ms || 120000 }).then(() => true, () => false);
const waitGame = (page, ms) => page.waitForFunction(() => BBH.Eng.sceneName === 'rhythm' && BBH.Eng.scene && BBH.Eng.scene.is3d && BBH.Eng.scene.mg && BBH.R3.world && BBH.R3.world.id === 'rhythm' && !BBH.Eng.pendingSwitch, null, { timeout: ms || 90000 }).then(() => true, () => false);
const seed = (page, over) => page.evaluate((over) => {
  const B = BBH, ch = B.Core.newChar(B.CATALOG.DEFAULT_LOOK); ch.flags.intro = 1; ch.created = Date.now(); ch.name = 'TAY'; ch.look = Object.assign({}, ch.look, { name: 'TAY' });
  ch.stats = { mus: 40, tech: 40, ori: 40, show: 40 }; ch.minutes = 11 * 60; ch.energy = 100; ch.maxEnergy = 100; ch.hunger = 90; ch.cash = 200; ch.fans = 20; ch.xp = 0; Object.assign(ch, over || {});
  B.G.slot = 1; B.G.setChar(ch); B.Eng.settings.offset = 0; B.Eng.settings.mic = false; return JSON.parse(JSON.stringify(B.G.ch));
}, over);
// what is audible right now: the music track, grooves started since the spy was armed, the game's own audio state
const audio = (page) => page.evaluate(() => { const A = BBH.Audio, mg = BBH.Eng.scene && BBH.Eng.scene.mg, st = mg && mg.state ? mg.state() : null; return { track: A.music.current ? A.music.current() : null, grooves: window.__grooves || 0, parked: !!A.music.__parked, st: st ? { phase: st.phase, bpm: st.bpm, audio: st.audio, venue: st.venue, mode: st.mode, offset: st.offset, t0: mg.S.t0, audioClock: mg.S.audioClock, battle: st.battle, train: st.train } : null }; });
const armSpy = (page) => page.evaluate(() => { const A = BBH.Audio; if (!A.groove.__spy) { const s = A.groove.start; A.groove.start = function (o) { window.__grooves = (window.__grooves || 0) + 1; return s.call(this, o); }; A.groove.__spy = 1; } window.__grooves = 0; });
// tick until the phase is one of `want` (sampling the audio state on every play / opp step)
const runTo = (page, want, o) => page.evaluate(([want, o]) => {
  const mg = BBH.Eng.scene.mg, A = BBH.Audio, bad = []; if (o && o.bot) mg.bot(o.bot); let st = mg.state(), seenPlay = 0, metroOk = 0, oppMetro = 0;
  for (let i = 0; i < 2400 && want.indexOf(st.phase) < 0; i++) {
    st = mg.tick(0.1); const tr = A.music.current ? A.music.current() : null; if (tr) bad.push(st.phase + ':' + tr);
    if (st.phase === 'play') { seenPlay++; if (st.audio && st.audio.metro && st.audio.metro.bpm === st.bpm && st.audio.music === false) metroOk++; }
    if (st.phase === 'opp' && st.audio && st.audio.metro && st.battle) { if (st.audio.metro.bpm === st.bpm) oppMetro++; }
  }
  return { phase: st.phase, bad, seenPlay, metroOk, oppMetro, result: mg.result() ? JSON.parse(JSON.stringify(mg.result())) : null };
}, [want, o || {}]);

try {
  const { page, errs } = await env.newPage({ viewport: { width: 360, height: 640 } });
  page.setDefaultTimeout(120000);
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed') && BBH.Eng.sceneName === 'title', null, { timeout: 120000 });
  ok(await page.evaluate(() => BBH.R3.status) === 'ready', '?r=3d boots');
  ok(await page.evaluate(() => Array.isArray(BBH.Core.BEAT_LEVELS) && BBH.Core.BEAT_LEVELS.length === 8), 'Core.BEAT_LEVELS has 8 levels');
  await armSpy(page);

  // ------------------------------------------------------------------ MUSIC OFF in every perform kind, practice and battle; the music comes back at the place
  const SETS = [
    ['busk', 'park', 'busk', () => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'BUSKING', bpm: 92, bars: 2, difficulty: 0.2, style: 0, seed: 7 }), 103],     // easy busking runs 12% faster (Core.tempoFor)
    ['openmic', 'bar', 'bar', () => BBH.G.places.startPerform({ id: 'bar' }, 'openmic', { title: 'OPEN MIC', bpm: 98, bars: 2, difficulty: 0.3, style: 2 }), 98],
    ['karaoke', 'bar', 'bar', () => BBH.G.places.startPerform({ id: 'bar' }, 'karaoke', { title: 'KARAOKE', bpm: 88, bars: 2, difficulty: 0.2, style: 0 }), 88],
    ['showcase', 'bar', 'showcase', () => BBH.G.places.startPerform({ id: 'bar' }, 'showcase', { title: 'SHOWCASE', bpm: 104, bars: 2, difficulty: 0.4, style: 1 }), 104],
    ['practice', 'studio', 'booth', () => BBH.G.places.startTraining({ id: 'studio' }, 'tech', 'studio'), 104],
  ];
  for (const [name, place, venue, fn, bpm] of SETS) {
    await seed(page); await page.evaluate(() => { BBH.Eng.settings.offset = 60; }); await armSpy(page);
    await page.evaluate(fn); ok(await waitGame(page), name + ': opens');
    await sleep(600); const a0 = await audio(page);
    ok(a0.st.venue === venue && !a0.track && a0.grooves === 0 && a0.st.audio.music === false, name + ': no music track, no backing groove (' + JSON.stringify({ track: a0.track, grooves: a0.grooves, venue: a0.st.venue }) + ')');
    ok(a0.st.audio.metro && a0.st.audio.metro.bpm === bpm && a0.st.bpm === bpm, name + ': the shaker metronome runs at the chart bpm ' + JSON.stringify(a0.st.audio.metro));
    ok(a0.st.audio.metro && Math.abs(a0.st.audio.metro.offset - 0.06) < 1e-9 && (!a0.st.audioClock || Math.abs(a0.st.audio.metro.t0 - a0.st.t0) < 1e-6), name + ': metronome on the chart clock (t0 ' + (a0.st.audio.metro && a0.st.audio.metro.t0) + ' / ' + a0.st.t0 + ') and shifted by the 60 ms offset');
    const r = await runTo(page, ['result'], { bot: { jitterMs: 15 } });
    ok(r.phase === 'result' && r.bad.length === 0 && r.seenPlay > 0 && r.metroOk === r.seenPlay, name + ': whole set silent but the metronome (' + r.metroOk + '/' + r.seenPlay + ' play steps)' + (r.bad.length ? ' music: ' + r.bad.slice(0, 3).join(',') : ''));
    const a1 = await audio(page); ok(!a1.st.audio.metro && !a1.track, name + ': the metronome stops on the result card and no music starts');
    await page.locator('#r3rhythm button[data-act="continue"]').first().click({ timeout: 8000 });
    ok(await waitPlace(page, place), name + ': CONTINUE returns to the ' + place);
    await sleep(500); const a2 = await audio(page); ok(!a2.parked && !!a2.track, name + ': the place plays its music again (' + a2.track + ')');
  }
  await page.evaluate(() => { BBH.Eng.settings.offset = 0; });

  // battle: VS, picks, my rounds and the rival's turns on the shaker, judges and verdict without music
  await seed(page, { stats: { mus: 55, tech: 60, ori: 50, show: 45 } }); await armSpy(page);
  await page.evaluate(() => BBH.G.places.startBattle({ id: 'bar' }, BBH.Core.OPPONENTS[1])); ok(await waitGame(page), 'battle opens');
  const bt = await runTo(page, ['verdict'], { bot: { jitterMs: 14 } }); const ab = await audio(page);
  ok(bt.phase === 'verdict' && bt.bad.length === 0 && ab.grooves === 0 && !ab.track, 'battle: VS, 3 rounds, rival turns, judges and verdict with no music and no groove' + (bt.bad.length ? ': ' + bt.bad.slice(0, 3).join(',') : ''));
  ok(bt.metroOk === bt.seenPlay && bt.seenPlay > 0 && bt.oppMetro > 0, 'battle: the metronome follows my rounds (' + bt.metroOk + '/' + bt.seenPlay + ') and the rival turn at their bpm (' + bt.oppMetro + ' steps)');
  ok(await page.evaluate(() => { const S = BBH.Eng.scene.mg.S; return S.battle.oppStyles.length === 3; }), 'battle rules unchanged: 3 rounds scored');
  await page.locator('#r3rhythm button[data-act="continue"]').first().click({ timeout: 8000 }); ok(await waitPlace(page, 'bar'), 'battle: CONTINUE returns to the bar');
  await sleep(500); ok(!!(await audio(page)).track, 'battle: the bar music is back');

  // ------------------------------------------------------------------ RHYTHM TRAINING
  let ch0 = await seed(page, { place: 'studio' }); await armSpy(page);
  await page.evaluate(() => BBH.Eng.go('rhythm', { mode: 'train', where: 'home', back: 'studio' })); ok(await waitGame(page), 'training opens');
  const lv = await page.evaluate(() => { const rows = [...document.querySelectorAll('#r3rhythm .lv .l')]; const st = BBH.Eng.scene.mg.state(); return { n: rows.length, open: rows.filter((r) => !r.dataset.locked).map((r) => +r.dataset.level), txt: rows.map((r) => r.innerText.replace(/\s+/g, ' ')), phase: st.phase, venue: st.venue, mode: st.mode, track: BBH.Audio.music.current() }; });
  ok(lv.n === 8 && JSON.stringify(lv.open) === '[1]' && lv.phase === 'levels' && lv.venue === 'booth' && lv.mode === 'train' && !lv.track, 'level select in the lab booth: 8 levels, only level 1 open, no music: ' + lv.txt[0]);
  ok(/BOOTS AND CATS/i.test(lv.txt[0]) && /LOCK/.test(lv.txt[1]) && /DRUM AND BASS/i.test(lv.txt[6]), 'level rows name the real patterns (boots and cats ... drum and bass) and show locks');
  await page.locator('#r3rhythm .lv .l[data-level="2"]').click(); ok(await page.evaluate(() => BBH.Eng.scene.mg.state().phase) === 'levels', 'a locked level does not start');
  await page.locator('#r3rhythm .lv .l[data-level="1"]').click(); await sleep(300);
  const t1 = await page.evaluate(() => { const mg = BBH.Eng.scene.mg, st = mg.state(), ps = document.querySelector('#r3rhythm .ps'); return { st: { phase: st.phase, bpm: st.bpm, train: st.train, metro: st.audio.metro, notes: st.notesTotal }, ps: ps ? ps.innerText.replace(/\s+/g, ' ') : '' }; });
  ok(t1.st.phase === 'count' && t1.st.train.level === 1 && t1.st.bpm === 80 && t1.st.metro && t1.st.metro.bpm === 80 && t1.st.notes === 16, 'level 1 starts: 80 bpm, metronome 80, 4 bars x 4 gems ' + JSON.stringify(t1.st.metro));
  ok(/LISTEN/.test(t1.ps) && /BOOTS AND CATS/i.test(t1.ps) && /B t K t/.test(t1.ps), 'the pattern strip shows LISTEN, the name and the pattern text: ' + t1.ps);
  const call = await page.evaluate(() => { const mg = BBH.Eng.scene.mg; let st = mg.state(), lit = 0, lab = ''; for (let i = 0; i < 200 && st.phase === 'count'; i++) { st = mg.tick(0.05); lit = Math.max(lit, document.querySelectorAll('#r3rhythm .ps .s.on').length); if (st.train.callDone === st.train.callTotal && !lab) { const l = document.querySelector('#r3rhythm .ps .lbl'); lab = l ? l.textContent : ''; } } const l = document.querySelector('#r3rhythm .ps .lbl'); return { phase: st.phase, done: st.train.callDone, total: st.train.callTotal, lit, lab: l ? l.textContent : '', perfect: st.perfect }; });
  ok(call.total === 4 && call.done === 4 && call.lit === 1 && call.phase === 'play' && /YOUR TURN/.test(call.lab), 'the hero plays the call (4 of 4 pattern notes, one step lit at a time), then YOUR TURN and the gems: ' + JSON.stringify(call));
  const tr = await runTo(page, ['result'], { bot: { jitterMs: 10 } });
  ok(tr.phase === 'result' && tr.result.mode === 'train' && tr.result.level === 1 && tr.result.q === tr.result.accuracy && tr.result.q >= 0.9 && tr.bad.length === 0, 'level 1 bot run: result mode train, level 1, q ' + (tr.result && tr.result.q));
  const exp = await page.evaluate(([ch0, q]) => { const r = BBH.Core.apply(JSON.parse(JSON.stringify(ch0)), { t: 'trainGame', stat: 'tech', game: 'beat', level: 1, q, where: 'home' }, () => 0.5); const f = r.fx.find((x) => x.t === 'trainResult'); return { tech: r.char.stats.tech, xp: r.char.xp, level: r.char.level, lv: r.char.trainLv.beat, minutes: r.char.minutes, gain: f.gain }; }, [ch0, tr.result.q]);
  const got = await page.evaluate(() => { const c = BBH.G.ch; return { tech: c.stats.tech, xp: c.xp, level: c.level, lv: c.trainLv.beat, minutes: c.minutes, best: c.flags.beatBest }; });
  ok(Math.abs(got.tech - exp.tech) < 1e-9 && got.xp === exp.xp && got.level === exp.level && got.minutes === exp.minutes && got.tech > ch0.stats.tech, 'the state equals Core trainGame { tech, beat, level 1, q }: tech ' + ch0.stats.tech + ' -> ' + got.tech.toFixed(2) + ', xp ' + got.xp + ', ' + (got.minutes - ch0.minutes) + ' min');
  ok(got.lv === 2 && exp.lv === 2, 'q >= 70%: level 2 unlocked (ch.trainLv.beat ' + got.lv + ')');
  ok(got.best && got.best[1] === tr.result.grade, 'best grade of level 1 saved: ' + JSON.stringify(got.best));
  const card = await page.evaluate(() => { const c = document.querySelector('#r3rhythm .tr'), rw = document.querySelector('#r3rhythm .tr .rw'); return { txt: c ? c.innerText.replace(/\s+/g, ' ') : '', xp: rw ? +rw.dataset.xp : -1, acts: [...document.querySelectorAll('#r3rhythm .tr button')].map((b) => b.dataset.act) }; });
  ok(/LEVEL 2 UNLOCKED/.test(card.txt) && new RegExp('\\+' + exp.gain.toFixed(1) + ' TECH').test(card.txt) && card.xp === exp.xp - ch0.xp && /NEXT UP/.test(card.txt), 'the card: LEVEL 2 UNLOCKED, +' + exp.gain.toFixed(1) + ' TECH, +' + card.xp + ' XP and the next tip');
  ok(card.acts.join() === 'next,levels,again,menu,continue', 'card offers NEXT LEVEL, LEVELS, PLAY AGAIN, BACK (training menu), CONTINUE: ' + card.acts.join());
  await page.locator('#r3rhythm .tr button[data-act="next"]').click(); await sleep(300);
  const t2 = await audio(page);
  ok(t2.st.phase === 'count' && t2.st.train.level === 2 && t2.st.bpm === 84 && t2.st.audio.metro.bpm === 84 && t2.st.train.unlocked === 2, 'NEXT LEVEL starts level 2 (84 bpm, metronome 84)');
  // a weak run on level 2 does not unlock level 3
  const tr2 = await runTo(page, ['result'], { bot: { jitterMs: 10, missRate: 0.6 } });
  const lv2 = await page.evaluate(() => BBH.G.ch.trainLv.beat);
  ok(tr2.result.level === 2 && tr2.result.q < 0.7 && lv2 === 2 && await page.evaluate(() => /SCORE 70%/.test(document.querySelector('#r3rhythm .tr').innerText) && !!document.querySelector('#r3rhythm .tr button[data-act="again"]')), 'level 2 at q ' + tr2.result.q.toFixed(2) + ': no unlock (trainLv.beat stays 2), the card says score 70% and offers TRY AGAIN');
  await page.locator('#r3rhythm .tr button[data-act="levels"]').click(); await sleep(300);
  const lvB = await page.evaluate(() => [...document.querySelectorAll('#r3rhythm .lv .l')].map((r) => ({ l: +r.dataset.level, lock: !!r.dataset.locked, g: r.querySelector('.g').textContent })));
  ok(lvB[0].g === tr.result.grade && !lvB[1].lock && lvB[2].lock && lvB[1].g !== '-', 'LEVELS: level 1 shows grade ' + lvB[0].g + ', level 2 open (best ' + lvB[1].g + '), level 3 locked');
  await page.locator('#r3rhythm .rbtn', { hasText: 'BACK' }).first().click(); ok(await waitPlace(page, 'studio'), 'BACK from the level select returns to the studio');
  await sleep(500); const aT = await audio(page); ok(!aT.parked && !!aT.track && aT.grooves === 0, 'after training the studio music plays again (' + aT.track + ')');
  // direct level start: E.go('rhythm', { mode:'train', level:2 }) skips the select; a locked level opens the select instead
  await page.evaluate(() => BBH.Eng.go('rhythm', { mode: 'train', level: 2, where: 'home', back: 'studio' })); await waitGame(page); await sleep(300);
  ok(await page.evaluate(() => { const s = BBH.Eng.scene.mg.state(); return s.phase === 'count' && s.train.level === 2; }), 'E.go with level 2 starts level 2 right away');
  await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true })); await waitPlace(page, 'studio');
  await page.evaluate(() => BBH.Eng.go('rhythm', { mode: 'train', level: 5, where: 'home', back: 'studio' })); await waitGame(page); await sleep(300);
  ok(await page.evaluate(() => BBH.Eng.scene.mg.state().phase === 'levels'), 'a locked level (5) opens the level select instead');
  await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true })); await waitPlace(page, 'studio');

  ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  await page.close();
} finally {
  await env.stop(); clearTimeout(watchdog);
}
done('beatbox_heroes_r3beat');
