// r3 GAMES gate (PORT_PLAN 6.6, MG-RHYTHM): the REAL game in 3D (?r=3d, headless Chromium + swiftshader) through the rhythm sibling (r3/scenes_rhythm.js + park3d/mg_rhythm.js).
//   perform (busk, open mic, karaoke, showcase), practice (lab booth) and full battles, driven by mg.bot() and mg.tick(sec) (the same hooks as the 3D mini game tests).
//   venues: busk -> park stage, openmic/karaoke -> bar, showcase -> showcase, practice -> booth, battle -> arena (state().venue), budgets per venue.
//   state changes equal the 2D flow: the cash / fans / xp after CONTINUE equal Core.apply on a copy of the saved hero; the verdict votes (DOM pips, mg result) equal the held battleResult of G.doHold;
//   the card shows the real rewards (data-cash / data-fans / data-xp); BACK asks LEAVE? and leaving changes nothing and returns to the same place; offsetMs shifts the judging like the 2D game;
//   load / unload of every venue returns the GPU memory to the baseline (textures, geometries); the 2D path (?r=2d) is untouched.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3games suite hung'); process.exit(1); }, 900000);
const env = await r3env('beatbox_heroes_r3games');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitScene = (page, name, ms) => page.waitForFunction((n) => BBH.Eng.sceneName === n && BBH.Eng.scene && BBH.Eng.scene.t > 0 && !BBH.Eng.pendingSwitch, name, { timeout: ms || 90000 }).then(() => true, () => false);
// back at a place: the place sibling is a 3D scene now (r3/scenes_world.js), so its world must be the resident one; a 2D place (fallback) only needs the right args
const PLACE_WORLD = { park: 'park', bar: 'bar', studio: 'lab', home: 'flat', shop: 'shop' };
const waitPlace = (page, id, ms) => page.waitForFunction(([id, wid]) => { const E = BBH.Eng, sc = E.scene; if (E.sceneName !== 'place' || !sc || E.pendingSwitch || E.sceneArgs.id !== id) return false; return sc.is3d ? !!(BBH.R3.world && BBH.R3.world.id === wid && sc.t > 0) : sc.t > 0; }, [id, PLACE_WORLD[id]], { timeout: ms || 120000 }).then(() => true, () => false);
const waitGame = (page, ms) => page.waitForFunction(() => BBH.Eng.sceneName === 'rhythm' && BBH.Eng.scene && BBH.Eng.scene.is3d && BBH.Eng.scene.mg && BBH.R3.world && BBH.R3.world.id === 'rhythm' && !BBH.Eng.pendingSwitch, null, { timeout: ms || 90000 }).then(() => true, () => false);
// seed a hero with known numbers; noon, full energy, $200 so no set collapses the day or runs out of money
const seed = (page, over) => page.evaluate((over) => {
  const B = BBH, ch = B.Core.newChar(B.CATALOG.DEFAULT_LOOK); ch.flags.intro = 1; ch.created = Date.now(); ch.name = 'TAY'; ch.look = Object.assign({}, ch.look, { name: 'TAY' });
  ch.stats = { mus: 40, tech: 40, ori: 40, show: 40 }; ch.minutes = 12 * 60; ch.energy = 100; ch.maxEnergy = 100; ch.hunger = 90; ch.cash = 200; ch.fans = 20; ch.xp = 0; Object.assign(ch, over || {});
  B.G.slot = 1; B.G.setChar(ch); B.Eng.settings.offset = 0; B.Eng.settings.mic = false; return JSON.parse(JSON.stringify(B.G.ch));
}, over);
const play = (page, js, tag) => page.evaluate(js);
// run the set with the bot until the card is up (result for perform / practice, verdict for battles)
const finish = (page, o) => page.evaluate((o) => {
  const mg = BBH.Eng.scene.mg, seen = [], hist = [], b0 = mg.state().beat; mg.bot(o || { jitterMs: 12 }); let last = '', pips = null;
  for (let i = 0; i < 900; i++) {
    const st = mg.tick(0.2); if (st.phase !== last) { last = st.phase; seen.push(st.phase); }
    if (st.phase === 'judge' && st.battle && st.battle.reveal >= 4 && !pips) { const q = (s) => document.querySelectorAll('#r3rhythm .jd ' + s).length; pips = { y: q('.pip.y'), o: q('.pip.o'), tallyY: +document.querySelector('#r3rhythm .jd .tally .y b').textContent, tallyO: +document.querySelector('#r3rhythm .jd .tally .o b').textContent }; }
    if (st.phase === 'result' || st.phase === 'verdict') break;
  }
  return { seen, b0, pips, state: mg.state(), result: JSON.parse(JSON.stringify(mg.result())) };
}, o);
// the numbers a set or a battle may change (the place field is not one of them: entering the place world sets it)
const CORE = '(c) => JSON.stringify({ cash: c.cash, fans: c.fans, xp: c.xp, level: c.level, minutes: c.minutes, energy: c.energy, mood: c.mood, hunger: c.hunger, stats: c.stats, n: c.n, day: c.day })';
const coreOf = (page) => page.evaluate('(' + CORE + ')(BBH.G.ch)');
const stateOf = (page) => page.evaluate(() => { const c = BBH.G.ch; return { cash: c.cash, fans: c.fans, xp: c.xp, level: c.level, minutes: c.minutes, energy: c.energy, stats: Object.assign({}, c.stats), n: JSON.parse(JSON.stringify(c.n)), json: JSON.stringify(c) }; });
const cardRw = (page) => page.evaluate(() => { const b = document.querySelector('#r3rhythm .rw'); return b ? { cash: +b.dataset.cash, fans: +b.dataset.fans, xp: +b.dataset.xp, txt: b.innerText } : null; });
const clickGo = async (page) => { await page.locator('#r3rhythm button[data-act="continue"]').first().click({ timeout: 8000 }); };

try {
  const { page, errs } = await env.newPage({ viewport: { width: 360, height: 640 } });
  page.setDefaultTimeout(120000);
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed'), null, { timeout: 90000 });
  ok(await page.evaluate(() => BBH.R3.status) === 'ready', '?r=3d boots (status ready)');
  ok(await waitScene(page, 'title'), 'title is up');
  ok(await page.evaluate(() => BBH.Eng.scenes3d.rhythm && BBH.Eng.scenes3d.rhythm.is3d && BBH.Eng.pickScene('rhythm') === BBH.Eng.scenes3d.rhythm && BBH.Eng.scenes3d.rhythm.enter !== BBH.Eng.scenes.rhythm.enter), 'E.scenes3d.rhythm is the sibling E.pickScene returns in 3D mode (the 2D scene is untouched)');

  // ------------------------------------------------------------------ PERFORM: busk, every state change equals Core.apply
  let ch0 = await seed(page);
  await page.evaluate(() => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'BUSKING', sub: 'park', bpm: 92, bars: 4, difficulty: 0.2, style: 0, stage: 'cyan', seed: 7 }));
  ok(await waitGame(page), 'startPerform (the 2D closure) opens the rhythm sibling on the rhythm world');
  const e1 = await page.evaluate(() => { const mg = BBH.Eng.scene.mg, s = mg.state(), r = BBH.R3.host.stats(); return { venue: s.venue, mode: s.mode, off: s.offset, hud: !!document.querySelector('#r3rhythm .rh'), body: document.body.classList.contains('r3'), tris: r.tris, calls: r.calls, is3d: BBH.Eng.scene.is3d, shell: BBH.Eng.scene.leave !== BBH.Eng.scenes.rhythm.leave }; });
  ok(e1.venue === 'busk' && e1.mode === 'perform' && e1.hud && e1.body && e1.is3d, 'busk plays on the park stage with the DOM HUD and body.r3: ' + JSON.stringify({ v: e1.venue, m: e1.mode }));
  ok(e1.tris <= 120000 && e1.calls <= 90, 'busk budget (stage profile <= 120k tris, <= 90 calls): ' + e1.tris + ' tris, ' + e1.calls + ' calls');
  const r1 = await finish(page, { jitterMs: 12 });
  ok((r1.seen.includes('count') || r1.b0 >= 3.5) && r1.seen.includes('play') && r1.state.phase === 'result' && r1.result.game === 'rhythm' && r1.result.mode === 'perform', 'the set counts in, plays and ends on the result card: ' + r1.seen.join('>'));
  ok(Array.isArray(r1.result.perfectLane) && r1.result.perfectLane.length === 4 && r1.result.perfectLane.reduce((a, b) => a + b, 0) === r1.result.perfect, 'result.perfectLane counts the perfect hits per lane ' + JSON.stringify(r1.result.perfectLane));
  const exp1 = await page.evaluate(([ch0, res]) => { const r = BBH.Core.apply(JSON.parse(JSON.stringify(ch0)), { t: 'perform', kind: 'busk', res }, () => 0.5), f = r.fx.find((x) => x.t === 'result'); return { rw: f.rw, cash: r.char.cash, fans: r.char.fans, xp: r.char.xp, level: r.char.level, mood: r.char.mood, tech: r.char.stats.tech, show: r.char.stats.show, busks: r.char.n.busks }; }, [ch0, r1.result]);
  const got1 = await stateOf(page), rw1 = await cardRw(page);
  ok(got1.cash === exp1.cash && got1.fans === exp1.fans && got1.xp === exp1.xp && got1.level === exp1.level, 'perform state equals Core.apply: cash ' + got1.cash + '/' + exp1.cash + ' fans ' + got1.fans + '/' + exp1.fans + ' xp ' + got1.xp + '/' + exp1.xp);
  ok(rw1 && rw1.cash === exp1.rw.cash && rw1.fans === exp1.rw.fans && rw1.xp === exp1.rw.xp, 'the result card shows the real rewards (+$' + (rw1 && rw1.cash) + ' +' + (rw1 && rw1.fans) + ' fans +' + (rw1 && rw1.xp) + ' xp)');
  ok(await page.evaluate(() => { const t = document.querySelector('#r3rhythm .card').innerText; return /ACCURACY/.test(t) && /CONTINUE/.test(t) && !document.querySelector('#ui .panel.pop'); }), 'the 3D card replaces the 2D DOM result card (no #ui result panel) and offers CONTINUE');
  const fx1 = await page.evaluate(() => BBH.G.ch.n.busks);
  ok(fx1 === ch0.n.busks + 1, 'busk counter advanced once (the held action ran exactly once)');
  await clickGo(page);
  ok(await waitPlace(page, 'park'), 'CONTINUE ends the activity: back to the park (its own world)');
  ok(await page.evaluate(() => !document.getElementById('r3rhythm') && !(BBH.R3.world && BBH.R3.world.id === 'rhythm')), 'the rhythm world and its HUD are gone after CONTINUE');
  const after1 = await stateOf(page); ok(after1.cash === got1.cash && after1.fans === got1.fans && after1.minutes >= ch0.minutes + 60, 'finishActivity played the held effects without changing the numbers (time spent: ' + (after1.minutes - ch0.minutes) + ' min)');

  // ------------------------------------------------------------------ OFFSET: E.settings.offset shifts the judging like the 2D game
  ch0 = await seed(page); await page.evaluate(() => { BBH.Eng.settings.offset = 140; });
  await page.evaluate(() => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'BUSKING', bpm: 92, bars: 2, difficulty: 0.2, style: 0, stage: 'cyan', seed: 11 }));
  ok(await waitGame(page), 'second set opens');
  const off = await finish(page, { jitterMs: 0 });
  ok(off.state.offset === 0.14 && off.result.perfect === 0 && off.result.good > 0, 'offset 140 ms: every on-beat press is "good", none perfect (windows ' + JSON.stringify(off.state.windows) + '): perfect ' + off.result.perfect + ' good ' + off.result.good);
  await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true })); ok(await waitPlace(page, 'park'), 'quit({force}) returns to the park');
  await page.evaluate(() => { BBH.Eng.settings.offset = 0; });
  ch0 = await seed(page);
  await page.evaluate(() => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'BUSKING', bpm: 92, bars: 2, difficulty: 0.2, style: 0, stage: 'cyan', seed: 11 })); await waitGame(page);
  const off0 = await finish(page, { jitterMs: 0 });
  ok(off0.state.offset === 0 && off0.result.perfect === off0.result.total && off0.result.miss === 0, 'offset 0 with a perfect bot: every note is perfect (' + off0.result.perfect + '/' + off0.result.total + ')');
  await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true })); await waitPlace(page, 'park');

  // ------------------------------------------------------------------ CONTINUOUS BUSKING: the set keeps going (charts chain), the day clock runs, STOP pays for the time played
  ch0 = await seed(page);
  await page.evaluate(() => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'BUSKING', sub: 'park', bpm: 92, bars: 2, difficulty: 0.2, style: 0, stage: 'cyan', seed: 21, endless: true }));
  ok(await waitGame(page), 'continuous busk opens');
  const lv = await page.evaluate(() => { const mg = BBH.Eng.scene.mg; mg.bot({ jitterMs: 12 }); const ph = []; for (let i = 0; i < 200; i++) { const st = mg.tick(0.2); if (!ph.includes(st.phase)) ph.push(st.phase); } const st = mg.state(); return { ph, st: { phase: st.phase, bpm: st.bpm, live: st.live, hits: st.perfect + st.good + st.miss }, back: document.querySelector('#r3rhythm .rbtn').textContent, clock: (document.querySelector('#r3rhythm .clock.on') || {}).textContent || '' }; });
  ok(lv.st.phase === 'play' && !lv.ph.includes('result') && lv.st.live && lv.st.live.endless && lv.st.live.chunk >= 3, 'the busk keeps going past its 2-bar chart: still playing after 40 s, ' + (lv.st.live && lv.st.live.chunk) + ' charts chained ' + JSON.stringify(lv.ph));
  ok(lv.st.bpm === Math.round(92 * 1.12), 'easy B t K t busking runs a bit faster (' + lv.st.bpm + ' bpm from 92)');
  ok(lv.back === 'STOP' && /^\d\d:\d\d$/.test(lv.clock.trim()) && lv.st.live.minutes > 50 && lv.st.live.minutes < 70, 'BACK turns into STOP and a live clock shows the day time (' + lv.clock + ', ' + lv.st.live.minutes + ' game minutes)');
  const lr = await page.evaluate(() => { const mg = BBH.Eng.scene.mg; mg.quit(); mg.tick(0.2); return { phase: mg.state().phase, result: JSON.parse(JSON.stringify(mg.result())) }; });
  ok(lr.phase === 'result' && lr.result.endless && lr.result.minutes >= 50 && lr.result.total === lr.result.perfect + lr.result.good + lr.result.miss && lr.result.total > 20, 'STOP ends the set with a result for the time played (' + lr.result.minutes + ' min, ' + lr.result.total + ' notes)');
  const lexp = await page.evaluate(([c0, res]) => { const r = BBH.Core.apply(JSON.parse(JSON.stringify(c0)), { t: 'perform', kind: 'busk', res }, () => 0.5), f = r.fx.find((x) => x.t === 'result'); return { rw: f.rw, cash: r.char.cash, minutes: r.char.minutes }; }, [ch0, lr.result]);
  const lgot = await stateOf(page);
  ok(lgot.cash === lexp.cash && lexp.rw.minutes === lr.result.minutes && lgot.minutes === lexp.minutes, 'rewards and time follow the minutes busked (Core.apply): +$' + lexp.rw.cash + ', ' + lexp.rw.minutes + ' min');
  await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true })); await waitPlace(page, 'park');
  // AUTO BUSK: the hero plays by himself, the clock runs twice as fast, smaller pay
  ch0 = await seed(page);
  await page.evaluate(() => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'AUTO BUSK', sub: 'park', bpm: 92, bars: 2, difficulty: 0.2, style: 0, stage: 'cyan', seed: 22, endless: true, auto: true }));
  ok(await waitGame(page), 'auto busk opens');
  const au = await page.evaluate(() => { const mg = BBH.Eng.scene.mg; mg.press(0); for (let i = 0; i < 100; i++) mg.tick(0.2); const st = mg.state(); mg.quit(); mg.tick(0.2); return { live: st.live, hits: st.perfect + st.good, phase: mg.state().phase, result: JSON.parse(JSON.stringify(mg.result())) }; });
  ok(au.live && au.live.auto && au.hits > 10 && au.live.minutes > 50, 'auto busk: the hero hits the notes himself and 20 s pass ' + (au.live && au.live.minutes) + ' game minutes (' + au.hits + ' hits)');
  const aexp = await page.evaluate(([c0, res]) => { const A = BBH.Core.apply, a = A(JSON.parse(JSON.stringify(c0)), { t: 'perform', kind: 'busk', res }, () => 0.5).fx.find((x) => x.t === 'result').rw, m = A(JSON.parse(JSON.stringify(c0)), { t: 'perform', kind: 'busk', res: Object.assign({}, res, { auto: false }) }, () => 0.5).fx.find((x) => x.t === 'result').rw; return { a, m }; }, [ch0, au.result]);
  ok(au.phase === 'result' && au.result.auto && aexp.a.cash < aexp.m.cash && aexp.a.cash > 0, 'auto busking pays less than playing it yourself ($' + aexp.a.cash + ' vs $' + aexp.m.cash + ')');
  await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true })); await waitPlace(page, 'park');
  // HARD: eighth-note grooves stay, the tempo drops, and the shaker ticks eighth notes so every gem lands on a tick
  ch0 = await seed(page);
  await page.evaluate(() => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'BUSKING+', bpm: 100, bars: 2, difficulty: 0.85, style: 1, stage: 'pink', seed: 23 }));
  ok(await waitGame(page), 'hard busk opens');
  const hd = await page.evaluate(() => { const mg = BBH.Eng.scene.mg, st = mg.tick(0.1), ck = mg.click && mg.click.state(); const half = st.spb / 2, ns = mg.S.notes; return { bpm: st.bpm, sub: ck && ck.metro && ck.metro.sub, n: ns.length, onTicks: ns.length > 8 && ns.every((n) => Math.abs(n.time / half - Math.round(n.time / half)) < 0.01) }; });
  ok(hd.bpm === 78 && hd.sub === 2 && hd.onTicks, 'hard busking: 100 bpm -> ' + hd.bpm + ' bpm, the shaker ticks eighth notes (sub ' + hd.sub + ') and every gem sits on a tick');
  await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true })); await waitPlace(page, 'park');

  // ------------------------------------------------------------------ the other perform kinds and their venues
  const KINDS = [['openmic', 'bar', { title: 'OPEN MIC', sub: 'the bar', bpm: 98, bars: 2, difficulty: 0.4, style: 2, stage: 'lime' }], ['karaoke', 'bar', { title: 'KARAOKE', sub: 'no pressure', bpm: 88, bars: 2, difficulty: 0.2, style: 0, stage: 'pink' }], ['showcase', 'showcase', { title: 'SHOWCASE', sub: 'friday', bpm: 104, bars: 2, difficulty: 0.5, style: 1, stage: 'gold' }]];
  for (const [kind, venue, extra] of KINDS) {
    ch0 = await seed(page);
    await page.evaluate(([k, x]) => BBH.G.places.startPerform({ id: 'bar' }, k, x), [kind, extra]);
    ok(await waitGame(page), kind + ': opens');
    const v = await page.evaluate(() => { const mg = BBH.Eng.scene.mg, r = BBH.R3.host.stats(); return { venue: mg.state().venue, theme: mg.venue && mg.venue.theme, tris: r.tris, calls: r.calls, led: !!(mg.venue && mg.venue.led) }; });
    const fin = await finish(page, { jitterMs: 15 });
    ok(v.venue === venue && v.led && fin.state.phase === 'result', kind + ' plays in the ' + venue + ' venue (theme ' + v.theme + ') with the LED wall');
    ok(v.tris <= 120000 && v.calls <= 90, kind + ' budget: ' + v.tris + ' tris, ' + v.calls + ' calls');
    const ex = await page.evaluate(([ch0, kind, res]) => { const r = BBH.Core.apply(JSON.parse(JSON.stringify(ch0)), { t: 'perform', kind, res }, () => 0.5), f = r.fx.find((x) => x.t === 'result'); return { rw: f.rw, cash: r.char.cash, fans: r.char.fans, xp: r.char.xp }; }, [ch0, kind, fin.result]);
    const g = await stateOf(page), rw = await cardRw(page);
    ok(g.cash === ex.cash && g.fans === ex.fans && g.xp === ex.xp && rw && rw.cash === ex.rw.cash && rw.fans === ex.rw.fans && rw.xp === ex.rw.xp, kind + ': state and card equal Core.apply (+$' + ex.rw.cash + ' +' + ex.rw.fans + ' fans +' + ex.rw.xp + ' xp)');
    await clickGo(page); ok(await waitPlace(page, 'bar'), kind + ': CONTINUE returns to the bar world');
  }

  // ------------------------------------------------------------------ PRACTICE at the lab booth
  ch0 = await seed(page);
  await page.evaluate(() => BBH.G.places.startTraining({ id: 'studio' }, 'tech', 'studio'));
  ok(await waitGame(page), 'practice opens');
  const pv = await page.evaluate(() => { const mg = BBH.Eng.scene.mg, r = BBH.R3.host.stats(); return { venue: mg.state().venue, mode: mg.state().mode, tris: r.tris, calls: r.calls }; });
  const pr = await finish(page, { jitterMs: 25 });
  ok(pv.venue === 'booth' && pv.mode === 'practice' && pr.state.phase === 'result' && pv.tris <= 120000 && pv.calls <= 90, 'practice runs in the booth: ' + JSON.stringify(pv));
  const ex2 = await page.evaluate(([ch0, res]) => { const r = BBH.Core.apply(JSON.parse(JSON.stringify(ch0)), { t: 'train', stat: 'tech', q: res.accuracy, where: 'studio' }, () => 0.5); return { cash: r.char.cash, xp: r.char.xp, tech: r.char.stats.tech, level: r.char.level, rw: BBH.Core.reward('practice', res, ch0) }; }, [ch0, pr.result]);
  const g2 = await stateOf(page), rw2 = await cardRw(page);
  ok(g2.cash === ex2.cash && g2.cash === ch0.cash - 15 && g2.xp === ex2.xp && Math.abs(g2.stats.tech - ex2.tech) < 1e-9 && g2.stats.tech > ch0.stats.tech, 'practice state equals Core.apply (studio fee $15, tech ' + ch0.stats.tech + ' -> ' + g2.stats.tech.toFixed(2) + ', xp ' + g2.xp + ')');
  ok(rw2 && rw2.xp === ex2.rw.xp && rw2.cash === 0 && !isNaN(rw2.xp), 'the practice card shows +' + (rw2 && rw2.xp) + ' xp');
  await clickGo(page); ok(await waitPlace(page, 'studio'), 'practice: CONTINUE returns to the lab world');

  // ------------------------------------------------------------------ BATTLE: VS, picker, 3 rounds, rival turns, 5 judges, verdict from the REAL action
  ch0 = await seed(page, { stats: { mus: 55, tech: 60, ori: 50, show: 45 } });
  await page.evaluate(() => BBH.G.places.startBattle({ id: 'bar' }, BBH.Core.OPPONENTS[1]));
  ok(await waitGame(page), 'startBattle opens the arena');
  const b0 = await page.evaluate(() => { const mg = BBH.Eng.scene.mg, s = mg.state(), r = BBH.R3.host.stats(), v = mg.venue; return { venue: s.venue, phase: s.phase, theme: v && v.theme, judges: v && v.judges ? v.judges.length : 0, opp: !!(v && v.opponent), vsDom: !!document.querySelector('#r3rhythm .vs .big'), names: document.querySelector('#r3rhythm .vs') ? document.querySelector('#r3rhythm .vs').innerText : '', tris: r.tris, calls: r.calls, led: !!(v && v.led), mode: s.mode }; });
  ok(b0.venue === 'arena' && b0.mode === 'battle' && b0.phase === 'vs' && b0.vsDom && b0.judges === 5 && b0.opp && b0.led, 'the battle opens on the VS splash in the arena: 5 judges, the rival, LED wall, DOM VS stamp (' + b0.phase + ', theme ' + b0.theme + ')');
  ok(/TAY/.test(b0.names) && /MOUTHPIECE MOE/i.test(b0.names) && /5 JUDGES/.test(b0.names), 'the VS splash names both fighters and the format: ' + b0.names.replace(/\s+/g, ' ').slice(0, 90));
  ok(b0.theme === 'cyan', 'the arena theme follows the rival style (Moe style 1 -> cyan)');
  ok(b0.tris <= 120000 && b0.calls <= 90, 'arena budget (<= 120k tris, <= 90 calls): ' + b0.tris + ' tris, ' + b0.calls + ' calls');
  // the whole battle with the bot (it skips the VS and picks styles by itself); collect every phase it goes through
  const bt = await page.evaluate(() => {
    const mg = BBH.Eng.scene.mg, seq = [], counts = { pick: 0, opp: 0, play: 0, judge: 0 }; mg.bot({ jitterMs: 14, skipVs: false }); let last = '', pips = null, picker = null, oppHits = 0, say = null;
    for (let i = 0; i < 2400; i++) {
      const st = mg.tick(0.1); if (st.phase !== last) { last = st.phase; seq.push(st.phase); if (counts[st.phase] !== undefined) counts[st.phase]++; }
      if (st.phase === 'pick' && !picker) { picker = [...document.querySelectorAll('#r3rhythm .pk .st')].map((b) => b.dataset.style); }
      if (st.phase === 'opp' && st.battle) oppHits = Math.max(oppHits, st.battle.oppHit);
      if (st.phase === 'judge' && st.battle && st.battle.reveal >= 0 && !say) { const s = document.querySelector('#r3rhythm .jd .say'); say = s ? s.innerText : null; }
      if (st.phase === 'judge' && st.battle && st.battle.reveal >= 4 && !pips) { const q = (s) => document.querySelectorAll('#r3rhythm .jd ' + s).length; pips = { y: q('.pip.y'), o: q('.pip.o'), tallyY: +document.querySelector('#r3rhythm .jd .tally .y b').textContent, tallyO: +document.querySelector('#r3rhythm .jd .tally .o b').textContent }; }
      if (st.phase === 'verdict') break;
    }
    const sc = BBH.Eng.scene, f = sc.verdict;
    return { seq, counts, picker, pips, oppHits, say, state: mg.state(), result: JSON.parse(JSON.stringify(mg.result())), held: f ? JSON.parse(JSON.stringify(f)) : null, verdictVotes: JSON.parse(JSON.stringify(mg.S.verdict.votes)), card: document.querySelector('#r3rhythm .vd') ? document.querySelector('#r3rhythm .vd').innerText : '', rwBox: (() => { const b = document.querySelector('#r3rhythm .rw'); return b ? { cash: +b.dataset.cash, fans: +b.dataset.fans, xp: +b.dataset.xp } : null; })() };
  });
  ok(bt.state.phase === 'verdict' && bt.seq[0] === 'vs' && bt.counts.pick === 3 && bt.counts.opp === 3 && bt.counts.judge === 1, 'battle phases: vs, then 3x (pick, count, play, rival turn), then judges, then the verdict: ' + bt.seq.join('>'));
  ok(bt.picker && bt.picker.sort().join() === 'boom,hats,rim,snare', 'the style picker offers BOOM / HATS / RIM / SNARE ' + JSON.stringify(bt.picker));
  ok(bt.oppHits > 0 && bt.state.battle.roundQ.length === 3 && bt.state.battle.roundQ.every((r) => r.style && r.q >= 0 && r.q <= 1), 'the rival played ghost notes (' + bt.oppHits + ' hits) and 3 rounds were scored with their styles ' + JSON.stringify(bt.state.battle.roundQ.map((r) => r.style)));
  ok(Array.isArray(bt.result.rounds) && bt.result.rounds.length === 3 && Array.isArray(bt.result.oppStyles) && bt.result.oppStyles.length === 3 && bt.result.mode === 'battle', 'result carries rounds [{q,style}] and oppStyles');
  const votesHeld = bt.held && bt.held.out ? bt.held.out.votes : null;
  ok(votesHeld && votesHeld.length === 5 && JSON.stringify(votesHeld) === JSON.stringify(bt.result.battle.votes), 'the verdict votes ARE the held battleResult of G.doHold (5 votes, identical)');
  ok(bt.verdictVotes.length === 5 && bt.verdictVotes.every((v, i) => v.forPlayer === votesHeld[i].forPlayer && v.name === votesHeld[i].name), 'the judges reveal those votes in order: ' + bt.verdictVotes.map((v) => v.name + (v.forPlayer ? '+' : '-')).join(' '));
  const forP = votesHeld.filter((v) => v.forPlayer).length;
  ok(bt.pips && bt.pips.y === forP && bt.pips.o === 5 - forP && bt.pips.tallyY === forP && bt.pips.tallyO === 5 - forP, 'the DOM judge pips and the tally equal the held votes: ' + JSON.stringify(bt.pips) + ' vs ' + forP + ' for you');
  ok(bt.say && /SAYS/.test(bt.say), 'each judge gets a quote card: ' + String(bt.say).replace(/\s+/g, ' ').slice(0, 70));
  const win = !!bt.held.out.win;
  ok(win === (forP >= 3) && (win ? /VICTORY/.test(bt.card) : /DEFEAT/.test(bt.card)) && new RegExp(forP + ' of 5 judges').test(bt.card), 'the verdict card says ' + (win ? 'VICTORY' : 'DEFEAT') + ' and "' + forP + ' of 5 judges voted for you"');
  const tier = 2, rwExp = win ? { cash: 30 + tier * 22, fans: 12 + tier * 10, xp: 30 + tier * 16 } : { cash: 0, fans: Math.round(2 + tier), xp: 10 + tier * 2 };
  const gb = await stateOf(page);
  ok(bt.rwBox && bt.rwBox.cash === rwExp.cash && bt.rwBox.fans === rwExp.fans && bt.rwBox.xp === rwExp.xp && bt.held.rw.cash === rwExp.cash, 'the verdict card shows the real rewards for a ' + (win ? 'win' : 'loss') + ': ' + JSON.stringify(bt.rwBox));
  ok(gb.cash === ch0.cash + rwExp.cash && gb.fans === ch0.fans + rwExp.fans && (win ? gb.n.battlesWon === ch0.n.battlesWon + 1 : gb.n.battlesLost === ch0.n.battlesLost + 1) && gb.n.perfects === ch0.n.perfects + bt.result.perfect, 'state after the battle equals the action: cash ' + ch0.cash + ' -> ' + gb.cash + ', fans ' + ch0.fans + ' -> ' + gb.fans + ', perfects +' + bt.result.perfect + ', ' + (win ? 'won' : 'lost') + ' count +1');
  const doubled = await page.evaluate(() => BBH.G.ch.n.battlesWon + BBH.G.ch.n.battlesLost); ok(doubled === ch0.n.battlesWon + ch0.n.battlesLost + 1, 'the battle was applied exactly once (no double random draw)');
  await clickGo(page); ok(await waitPlace(page, 'bar'), 'CONTINUE on the verdict returns to the bar world');
  const gb2 = await stateOf(page); ok(gb2.cash === gb.cash && gb2.fans === gb.fans && gb2.minutes === gb.minutes, 'CONTINUE only plays the held effects (no second change)');

  // ------------------------------------------------------------------ ABORT: BACK asks LEAVE?, STAY keeps playing, LEAVE changes nothing and returns to the place
  ch0 = await seed(page); const json0 = await coreOf(page);
  await page.evaluate(() => BBH.G.places.startPerform({ id: 'park' }, 'busk', { title: 'BUSKING', bpm: 92, bars: 4, difficulty: 0.2, style: 0, stage: 'cyan', seed: 3 }));
  ok(await waitGame(page), 'abort test: set opens'); await page.evaluate(() => BBH.Eng.scene.mg.tick(3));
  await page.locator('#r3rhythm .rbtn', { hasText: 'BACK' }).first().click({ timeout: 8000 }); await sleep(250);
  ok(await page.evaluate(() => !!document.querySelector('#r3rhythm .cf') && /LEAVE\?/.test(document.querySelector('#r3rhythm .cf').innerText)), 'BACK asks LEAVE? (STAY / LEAVE)');
  await page.locator('#r3rhythm button[data-act="stay"]').click(); await sleep(250);
  ok(await page.evaluate(() => !document.querySelector('#r3rhythm .cf') && BBH.Eng.sceneName === 'rhythm' && BBH.Eng.scene.mg.state().phase !== 'idle'), 'STAY keeps the set going');
  await page.locator('#r3rhythm .rbtn', { hasText: 'BACK' }).first().click(); await sleep(250); await page.locator('#r3rhythm button[data-act="leave"]').click();
  ok(await waitPlace(page, 'park'), 'LEAVE returns to the park world (same place the set started from)');
  ok(await coreOf(page) === json0, 'aborting costs nothing: cash, fans, xp, time, energy, stats and counters are unchanged (no rewards, no time spent)');
  ok(await page.evaluate(() => !document.getElementById('r3rhythm') && !(BBH.R3.world && BBH.R3.world.id === 'rhythm')), 'the rhythm world and the HUD are released after an abort');
  // abort in the middle of a battle (during the rival turn) works too
  await page.evaluate(() => BBH.G.places.startBattle({ id: 'bar' }, BBH.Core.OPPONENTS[0])); await waitGame(page);
  await page.evaluate(() => { const mg = BBH.Eng.scene.mg; mg.bot({ jitterMs: 14 }); for (let i = 0; i < 900 && mg.state().phase !== 'opp'; i++) mg.tick(0.1); });
  ok(await page.evaluate(() => BBH.Eng.scene.mg.state().phase) === 'opp', 'battle: reached the rival turn'); await page.evaluate(() => BBH.Eng.scene.mg.quit({ force: true }));
  ok(await waitPlace(page, 'bar') && await coreOf(page) === json0, 'battle abort returns to the bar world with the hero unchanged');

  // ------------------------------------------------------------------ memory: load / unload every venue, GPU memory returns to the baseline
  const leak = await page.evaluate(async () => {
    BBH.Eng.paused = true;                                                      // the E loop (and the place sibling) stand still: only this test ticks the host
    const h = BBH.R3.host, out = {}, hud = document.createElement('div'); hud.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:640px;pointer-events:none'; document.body.appendChild(hud);
    for (const venue of ['busk', 'bar', 'showcase', 'booth', 'arena']) {
      const args = () => ({ game: true, mode: venue === 'arena' ? 'battle' : 'perform', venue, hud, manual: true, look: BBH.G.ch.look, stats: BBH.G.ch.stats, opp: venue === 'arena' ? BBH.Core.OPPONENTS[3] : undefined, bars: 1, kind: venue === 'bar' ? 'openmic' : 'busk' });
      const cyc = async () => { const w = await h.load('rhythm', args()); for (let i = 0; i < 2; i++) h.tick(0.016); const m = h.leakReport(); h.unload(); return m; };
      h.unload(); const first = await cyc(); const base = h.leakReport(); let worst = 0; for (let i = 0; i < 3; i++) { const m = await cyc(); worst = Math.max(worst, m.textures - first.textures); } const end = h.leakReport();
      out[venue] = { loaded: { geo: first.geometries, tex: first.textures }, base: { geo: base.geometries, tex: base.textures, prog: base.programs }, end: { geo: end.geometries, tex: end.textures, prog: end.programs }, worstTex: worst };
    }
    hud.remove(); BBH.Eng.paused = false; return out;
  });
  for (const [venue, r] of Object.entries(leak)) {
    const tg = (b) => Math.max(1, Math.ceil(b * 0.05));
    ok(r.loaded.geo > 0, venue + ': the loaded world holds GPU resources (' + r.loaded.geo + ' geo, ' + r.loaded.tex + ' tex), so the baseline check is not vacuous');
    ok(Math.abs(r.end.geo - r.base.geo) <= tg(r.base.geo) && Math.abs(r.end.tex - r.base.tex) <= tg(r.base.tex) && Math.abs(r.end.prog - r.base.prog) <= tg(r.base.prog), venue + ': 3 more load/unload cycles leave geometries / textures / programs at the baseline ' + JSON.stringify({ base: r.base, end: r.end }));
  }
  ok(await page.evaluate(() => BBH.R3.host.leakReport().textures) <= 12, 'no rhythm world leaves textures behind (host holds <= 12 shared textures after unload)');

  // ------------------------------------------------------------------ the browser stayed clean
  ok(errs.length === 0, 'no page or console errors in 3D' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  await page.close();

  // ------------------------------------------------------------------ 2D untouched: ?r=2d keeps the pixel rhythm scene
  const p2 = await env.newPage({ viewport: { width: 360, height: 640 } });
  await p2.page.goto(env.url('index.html?r=2d'));
  await p2.page.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.scenes && BBH.Eng.scenes.rhythm && BBH.G && BBH.G.places, null, { timeout: 60000 });
  ok(await p2.page.evaluate(() => !BBH.R3.on && BBH.Eng.pickScene('rhythm') === BBH.Eng.scenes.rhythm && !BBH.Eng.scenes.rhythm.is3d && typeof BBH.Eng.scenes.rhythm.draw === 'function' && BBH.Eng.scenes3d.rhythm.is3d), '?r=2d: E.pickScene returns the untouched 2D rhythm scene');
  ok(p2.errs.length === 0, '2D load has no errors' + (p2.errs.length ? ': ' + p2.errs.slice(0, 3).join(' | ') : ''));
} finally {
  await env.stop(); clearTimeout(watchdog);
}
done('beatbox_heroes_r3games');
