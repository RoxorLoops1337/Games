// r3 MINI gate (PORT_PLAN 2.11, 6 and M4): the training mini games in the REAL game in 3D (?r=3d, headless Chromium + swiftshader), through the adapters in r3/scenes_mini.js.
//   run     start button + real pad taps, bot() run to the end, the save equals Core.apply({t:'run', q, goodBars}) exactly like the 2D scene, the card shows the real rewards, CONTINUE / QUIT go to the right place
//   tuner   picker (higher / lower voice saved in E.settings.voice, ear training), feedPitch bot in mic mode, result equals Core.apply({t:'tune', q}), shared audio only (no own AudioContext), BACK aborts
//   seq     Beat Maker over the 3D Sound Lab: DOM grid paints the pattern, PLAY drives the lab's beat, TRAIN / RELEASE are the 2D rules (state identical), BACK returns
//   studio  Sound Recorder over the lab: REC stores the sample in IndexedDB + Audio, RESET removes it, state identical to 2D
//   disposal: load / unload cycles of run and tuner return GPU geometries and textures to the baseline; budgets (run high tier < 60 calls and <= 80k tris)
//   2D default untouched: ?r=2d keeps E.pickScene on the 2D scenes
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3mini suite hung'); process.exit(1); }, 540000);
const env = await r3env('beatbox_heroes_r3mini');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 120000;

try {
  const { page, errs } = await env.newPage({ viewport: { width: 360, height: 640 } });
  page.setDefaultTimeout(T);
  await page.goto(env.url('index.html?r=3d&q=low'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed'), null, { timeout: 90000 });
  ok(await page.evaluate(() => BBH.R3.status) === 'ready', '?r=3d boots');
  ok(await page.evaluate(() => ['run', 'tuner', 'seq', 'studio'].every((n) => BBH.Eng.scenes3d[n] && BBH.Eng.scenes3d[n].is3d && BBH.Eng.pickScene(n) === BBH.Eng.scenes3d[n])), 'E.scenes3d.run / tuner / seq / studio are registered and picked while 3D is on');
  const fresh = (extra) => page.evaluate((extra) => {   // a clean hero in the Sound Lab district at 12:00, plenty of energy
    const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.look = Object.assign({}, ch.look, { name: 'Zed' }); ch.name = 'Zed'; ch.created = Date.now(); ch.flags.intro = 1; ch.place = 'studio'; ch.energy = 80; ch.minutes = 12 * 60;
    Object.assign(ch, extra || {}); BBH.G.slot = 1; BBH.G.setChar(ch); BBH.Eng.settings.offset = 0; BBH.Eng.settings.muted = false; return true;
  }, extra);
  await fresh(); await sleep(2500);
  const go = async (n, a, world, ready) => {
    await page.evaluate(([n, a]) => BBH.Eng.go(n, a), [n, a]);
    await page.waitForFunction(([n, w, r]) => BBH.Eng.sceneName === n && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === w && (!r || eval(r)), [n, world || n, ready || ''], { timeout: T });
    await sleep(1200);
  };
  const waitPlace = (id) => page.waitForFunction((id) => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs && BBH.Eng.sceneArgs.id === id, id, { timeout: T });
  const snapCh = () => page.evaluate(() => { const c = BBH.G.ch; return { maxEnergy: c.maxEnergy, energy: c.energy, xp: c.xp, level: c.level, mood: c.mood, tech: c.stats.tech, mus: c.stats.mus, ori: c.stats.ori, runs: c.n.runs, tunes: c.n.tunes, seqs: c.n.seqs, rec: c.n.recorded || 0, songs: c.songs.length, min: c.minutes }; });
  const expect = (action, before) => page.evaluate(([a, b]) => { const c = JSON.parse(JSON.stringify(BBH.G.ch)); Object.assign(c, { maxEnergy: b.maxEnergy, energy: b.energy, xp: b.xp, level: b.level, mood: b.mood, minutes: b.min }); c.stats.tech = b.tech; c.stats.mus = b.mus; c.stats.ori = b.ori; c.n.runs = b.runs; c.n.tunes = b.tunes; c.n.seqs = b.seqs;
    const r = BBH.Core.apply(c, a, () => 0.5).char; return { maxEnergy: r.maxEnergy, energy: r.energy, xp: r.xp, level: r.level, tech: r.stats.tech, mus: r.stats.mus, ori: r.stats.ori }; }, [action, before]);
  const near = (a, b) => Math.abs(a - b) < 0.011;

  /* ======================================================================== RUN */
  const b0 = await snapCh();
  await go('run', { back: { scene: 'place', args: { id: 'park' } } }, 'run', 'BBH.R3.world.game');
  const r0 = await page.evaluate(() => { const g = BBH.R3.world.game, s = g.state(); return { phase: s.phase, start: s.startShown, ov: !!document.querySelector('.mg3-ov .mgr'), btn: !!document.querySelector('.mgr .start'), world: BBH.R3.world.mini, body: document.body.classList.contains('r3') }; });
  ok(r0.world && r0.body && r0.ov, 'run: the 3D mini game is the world and its HUD sits over the canvas');
  ok(r0.phase === 'ready' && r0.start && r0.btn, 'run: waits in "ready" with a proper START button (TAP TO START)');
  await page.mouse.click(180, 170); await sleep(300);                                  // the real START button
  ok(await page.evaluate(() => BBH.R3.world.game.state().phase) === 'run', 'run: tapping START starts the run');
  for (let i = 0; i < 4; i++) { await page.mouse.click(i % 2 ? 270 : 90, 570); await sleep(80); }   // real pad taps alternate LEFT / RIGHT
  const tp = await page.evaluate(() => BBH.R3.world.game.state());
  ok(tp.taps >= 3 && tp.misses === 0, 'run: real pad taps count (' + tp.taps + ' taps, ' + tp.misses + ' misses)');
  await page.mouse.click(90, 570); await page.mouse.click(90, 570); await sleep(100);
  ok(await page.evaluate(() => BBH.R3.world.game.state().misses) >= 1, 'run: the same side twice is a miss (2D rule)');
  const rs = await page.evaluate(() => { const g = BBH.R3.world.game; g.start(); for (let i = 0; i < 4000; i++) { g.press(i % 2 ? 'R' : 'L'); g.tick(0.05); if (g.state().cardOpen) break; } for (let i = 0; i < 40; i++) g.tick(0.05); return { r: g.result(), s: g.state() }; });
  await sleep(600);
  ok(rs.r && rs.r.goodBars >= 1 && rs.s.cardOpen, 'run: bot reaches the result card (' + rs.r.goodBars + ' good bars)');
  const a0 = await snapCh(), e0 = await expect({ t: 'run', q: rs.r.good / 12, goodBars: rs.r.good }, b0);
  ok(a0.maxEnergy === e0.maxEnergy && a0.energy === e0.energy && a0.xp === e0.xp && a0.level === e0.level && near(a0.tech, e0.tech) && a0.runs === b0.runs + 1,
    'run: the save equals Core.apply({t:"run", q, goodBars}) exactly like 2D ' + JSON.stringify([a0.maxEnergy, e0.maxEnergy, a0.energy, e0.energy, a0.xp, e0.xp]));
  const card = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.mgr .card .r')].map((r) => r.textContent), rwd: (document.querySelector('.mgr .card .rwd') || {}).textContent || '', btns: [...document.querySelectorAll('.mgr .card button')].map((b) => b.textContent) }));
  ok(card.rows.some((r) => /MAX ENERGY/.test(r) && r.indexOf('+' + (a0.maxEnergy - b0.maxEnergy)) >= 0) && /\+\d+ XP/.test(card.rwd) && /ENERGY/.test(card.rwd), 'run: the card shows the REAL rewards (' + card.rows.join(' / ') + ' | ' + card.rwd + ')');
  ok(card.btns.length === 1 && card.btns[0] === 'CONTINUE', 'run: in the game the card only has CONTINUE (no free second run)');
  await page.locator('.mgr .card button', { hasText: 'CONTINUE' }).click(); await waitPlace('park');
  ok(await page.evaluate(() => BBH.G.ch.n.runs) === b0.runs + 1, 'run: CONTINUE goes back to the park place (G.finishActivity), the run counted once');

  // QUIT before the end: nothing is spent, back to the same place
  await fresh(); const q0 = await snapCh();
  await go('run', { back: { scene: 'place', args: { id: 'park' } } }, 'run', 'BBH.R3.world.game');
  await page.locator('.mgr .quit').click(); await waitPlace('park');
  const q1 = await snapCh(); ok(q1.energy === q0.energy && q1.maxEnergy === q0.maxEnergy && q1.runs === q0.runs, 'run: QUIT aborts back to the place without spending anything');

  // muted and reduce motion from E.settings reach the mini game; offsetMs is carried
  await page.evaluate(() => { BBH.Eng.settings.offset = 40; BBH.Eng.settings.reduce = true; });
  await go('run', { back: { scene: 'place', args: { id: 'park' } } }, 'run', 'BBH.R3.world.game');
  ok(await page.evaluate(() => BBH.R3.world.game.state().offsetMs) === 40, 'run: E.settings.offset arrives as opts.offsetMs');
  await page.evaluate(() => { BBH.Eng.settings.offset = 0; BBH.Eng.settings.reduce = false; });
  await page.locator('.mgr .quit').click(); await waitPlace('park');

  /* ====================================================================== TUNER */
  await fresh(); const t0 = await snapCh();
  await go('tuner', { back: { scene: 'place', args: { id: 'studio' } }, place: 'studio' }, 'tuner', 'BBH.R3.world.game');
  const tu0 = await page.evaluate(() => { const s = BBH.R3.world.game.state(); return { picker: s.pickerOpen, opts: [...document.querySelectorAll('.tn-opt')].map((b) => b.textContent.slice(0, 12)), own: s.audioOwn }; });
  ok(tu0.picker && tu0.opts.length === 3 && /HIGHER/.test(tu0.opts[0]) && /LOWER/.test(tu0.opts[1]) && /EAR/.test(tu0.opts[2]), 'tuner: picker offers HIGHER VOICE, LOWER VOICE, EAR TRAINING (' + tu0.opts.join(' | ') + ')');
  await page.locator('.tn-opt.lo').click(); await sleep(800);                          // real click: lower voice (no mic in headless, so the game falls back to ear training)
  ok(await page.evaluate(() => BBH.Eng.settings.voice) === 'lower', 'tuner: the voice range is saved in E.settings.voice');
  const ear = await page.evaluate(() => { const g = BBH.R3.world.game; g.manual(true); const s = g.state(); return { mode: s.mode, state: s.state }; });
  ok(ear.state === 'play' && ear.mode === 'ear', 'tuner: no mic -> ear training (' + ear.mode + ')');
  const res1 = await page.evaluate(() => {   // bot: answer every ear round correctly
    const g = BBH.R3.world.game; for (let n = 0; n < 4000 && g.state().state !== 'done'; n++) { g.tick(0.1); const s = g.state(); if (s.phase === 'ask') g.answer(Math.sign(s.earB - s.earA)); }
    for (let i = 0; i < 8; i++) g.tick(0.1); return { r: g.result(), own: g.state().audioOwn, actx: !!(BBH.Audio && BBH.Audio.ctx) };
  });
  ok(res1.r && res1.r.score === 8 && res1.r.modeId === 'ear', 'tuner: ear bot scores 8/8');
  ok(res1.own === false, 'tuner: no AudioContext of its own in the game (shared BBH.Audio / E.tone only)');
  const ta = await snapCh(), te = await expect({ t: 'tune', q: res1.r.q }, t0);
  ok(near(ta.mus, te.mus) && ta.energy === te.energy && ta.xp === te.xp && ta.tunes === t0.tunes + 1, 'tuner: the save equals Core.apply({t:"tune", q}) like 2D (mus ' + ta.mus.toFixed(2) + ' vs ' + te.mus.toFixed(2) + ')');
  const tc = await page.evaluate(() => ({ mus: (document.querySelector('.tn-mus') || {}).textContent, rw: (document.querySelector('.tn-rw') || {}).textContent || '', btns: [...document.querySelectorAll('.tn-btn')].map((b) => b.textContent) }));
  ok(tc.mus === '+' + (Math.round((ta.mus - t0.mus) * 10) / 10).toFixed(1) && /XP/.test(tc.rw), 'tuner: the result card shows the real Musicality gain and XP (' + tc.mus + ' ' + tc.rw + ')');
  ok(tc.btns.length === 1 && tc.btns[0] === 'CONTINUE', 'tuner: only CONTINUE in the game');
  await page.locator('.tn-btn', { hasText: 'CONTINUE' }).click(); await waitPlace('studio');
  ok(true, 'tuner: CONTINUE returns to the studio place (G.finishActivity)');

  // singing mode through feedPitch, higher voice, then abort with BACK
  await fresh(); const t1 = await snapCh();
  await go('tuner', { back: { scene: 'place', args: { id: 'studio' } }, place: 'studio' }, 'tuner', 'BBH.R3.world.game');
  const res2 = await page.evaluate(() => {
    const g = BBH.R3.world.game; g.start({ range: 'higher', mode: 'mic', fake: true, manual: true });
    for (let n = 0; n < 4000 && g.state().state !== 'done'; n++) { const s = g.state(); if (s.phase === 'sing') g.feedPitch(440 * Math.pow(2, (s.target - 69) / 12)); else g.feedPitch(0); g.tick(0.1); }
    g.feedPitch(null); for (let i = 0; i < 6; i++) g.tick(0.1); return { r: g.result() };
  });
  ok(res2.r && res2.r.modeId === 'mic' && res2.r.score === 8 && res2.r.grade === 'S', 'tuner: feedPitch bot sings every note in tune (mic mode, S)');
  const t1a = await snapCh(), t1e = await expect({ t: 'tune', q: res2.r.q }, t1);
  ok(near(t1a.mus, t1e.mus) && t1a.energy === t1e.energy, 'tuner: mic result equals Core.apply({t:"tune", q}) (' + res2.r.q + ')');
  await page.locator('.tn-btn', { hasText: 'CONTINUE' }).click(); await waitPlace('studio');
  await fresh(); const t2 = await snapCh();
  await go('tuner', { back: { scene: 'place', args: { id: 'studio' } }, place: 'studio' }, 'tuner', 'BBH.R3.world.game');
  await page.locator('.tn-back').click(); await waitPlace('studio');
  const t2a = await snapCh(); ok(t2a.energy === t2.energy && t2a.mus === t2.mus && t2a.tunes === t2.tunes, 'tuner: BACK aborts to the studio without any change');

  /* ===================================================================== BEAT MAKER */
  await fresh(); const s0 = await snapCh();
  await go('seq', { back: { scene: 'place', args: { id: 'studio' } }, place: 'studio' }, 'lab', 'BBH.Eng.scene.w && BBH.Eng.scene.cells');
  const sq = await page.evaluate(() => { const st = BBH.R3.host.stats(), s = BBH.Eng.scene; return { cells: s.cells.length, tris: st.tris, calls: st.calls, delegated: s.save === BBH.Eng.scenes.seq.save, hud: !!document.querySelector('.h3') && document.querySelector('.h3').style.display === 'none' }; });
  ok(sq.cells === 64 && sq.delegated, 'seq: the 3D sibling delegates to the 2D Beat Maker and shows a 16 x 4 DOM grid');
  ok(sq.tris <= 100000 && sq.calls <= 70, 'seq: the lab stays within its budget (' + sq.tris + ' tris, ' + sq.calls + ' calls)');
  const cellBox = async (l, i) => page.evaluate(([l, i]) => { const r = BBH.Eng.scene.cells[l * 16 + i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, [l, i]);
  const c00 = await cellBox(0, 0); await page.mouse.click(c00.x, c00.y); await sleep(200);
  ok(await page.evaluate(() => BBH.Eng.scene.pat.steps[0][0]) === 1, 'seq: tapping a grid cell turns the step on in the pattern');
  const c10 = await cellBox(1, 0), c13 = await cellBox(1, 3);
  await page.mouse.move(c10.x, c10.y); await page.mouse.down(); await page.mouse.move((c10.x + c13.x) / 2, c10.y, { steps: 3 }); await page.mouse.move(c13.x, c13.y, { steps: 3 }); await page.mouse.up(); await sleep(300);
  ok(await page.evaluate(() => BBH.Eng.scene.pat.steps[1].slice(0, 4).join('')) === '1111', 'seq: dragging across the grid paints steps (same rule as 2D)');
  await page.evaluate(() => { const s = BBH.Eng.scene; for (let i = 0; i < 16; i += 2) s.pat.steps[2][i] = 1; s.build(); });
  await page.locator('#ui .btn', { hasText: 'PLAY' }).first().click(); await sleep(1600);
  const pl = await page.evaluate(() => ({ playing: BBH.Eng.scene.playing, step: BBH.Eng.scene.step, beat: BBH.Eng.beat() }));
  ok(pl.playing && pl.step >= 0 && pl.beat > 0, 'seq: PLAY runs the scheduler and drives the lab beat (step ' + pl.step + ', beat ' + pl.beat.toFixed(2) + ')');
  await page.locator('#ui .btn', { hasText: 'STOP' }).first().click(); await sleep(200);
  await page.evaluate(() => { BBH.Eng.scene.played = 9; });
  await page.locator('#ui .btn', { hasText: 'RELEASE' }).first().click(); await sleep(500);
  await page.locator('#r3kit .k3-modal .btn, #ui .btn', { hasText: 'RELEASE' }).last().click(); await sleep(500);
  ok(await page.evaluate(() => BBH.G.ch.songs.length) === s0.songs + 1, 'seq: RELEASE makes a song through G.do({t:"release"}) exactly like 2D');
  await page.locator('#ui .btn', { hasText: 'TRAIN' }).first().click(); await waitPlace('studio');
  const s1 = await snapCh(), se = await expect({ t: 'seqtrain', score: await page.evaluate(() => BBH.Core.patternScore(BBH.G.ch.patterns[0])), studio: true }, s0);
  ok(s1.seqs === s0.seqs + 1 && near(s1.ori, se.ori) && s1.energy === se.energy, 'seq: TRAIN equals Core.apply({t:"seqtrain"}) (ori ' + s1.ori.toFixed(2) + ' vs ' + se.ori.toFixed(2) + ') and returns to the studio place');
  ok(await page.evaluate(() => BBH.G.ch.patterns[0].steps[0][0]) === 1, 'seq: the pattern was saved (seqsave) on the way out');

  /* ================================================================ SOUND RECORDER */
  await fresh(); await page.evaluate(() => { BBH.Mic.open = async () => ({ ok: true }); BBH.Mic.close = () => {}; BBH.Mic.recordSample = async () => ({ ok: true, data: new Float32Array(3000).fill(0.25), sampleRate: 44100 }); BBH.Mic.isOpen = () => false; });
  const r1 = await snapCh();
  await go('studio', { back: { scene: 'place', args: { id: 'studio' } } }, 'lab', 'BBH.Eng.scene.w && BBH.Eng.scene.ui');
  const st = await page.evaluate(() => ({ cards: document.querySelectorAll('#ui .panel.flat').length, meter: !!BBH.Eng.scene.meter, delegated: BBH.Eng.scene.record === BBH.Eng.scenes.studio.record, rec: BBH.R3.world.terrain.isRec && BBH.R3.world.terrain.isRec() }));
  ok(st.cards === 4 && st.meter && st.delegated && st.rec === false, 'studio: four sound cards and a level meter over the 3D lab, 2D record / reset code');
  await page.locator('#ui .panel.flat').first().locator('.btn', { hasText: 'REC' }).click(); await sleep(1500);
  const rc = await page.evaluate(async () => { const s = await BBH.Samples.get(BBH.G.slot || 1, 0); return { stored: !!s, has: BBH.Audio.hasSample(0), n: BBH.G.ch.n.recorded || 0 }; });
  ok(rc.stored && rc.has && rc.n === r1.rec + 1, 'studio: REC stores the sample in IndexedDB and in BBH.Audio, counts as recorded (state identical to 2D)');
  await page.locator('#ui .panel.flat').first().locator('.btn', { hasText: 'RESET' }).click(); await sleep(800);
  ok(await page.evaluate(async () => { const s = await BBH.Samples.get(BBH.G.slot || 1, 0); return !s && !BBH.Audio.hasSample(0); }), 'studio: RESET removes the sample again');
  const sp = await page.evaluate(() => { const st2 = BBH.R3.host.stats(); return { tris: st2.tris, calls: st2.calls }; });
  ok(sp.tris <= 100000 && sp.calls <= 70, 'studio: lab within budget (' + sp.tris + ' tris, ' + sp.calls + ' calls)');
  await page.locator('#ui .btn', { hasText: 'BACK' }).last().click(); await waitPlace('studio');
  ok(await page.evaluate(() => !document.querySelector('#r3-mini-css') && !document.querySelector('.mg3-ov')), 'studio: leaving removes the overlay and the lab-only CSS');

  /* ================================================================ BUDGETS + DISPOSAL */
  const bud = await page.evaluate(async () => {
    const h = BBH.R3.host, out = {}; const hud = document.createElement('div'); document.body.appendChild(hud);
    h.setQuality('high'); await h.load('run', { hud, time: 0.5, embedded: true, again: false, settings: BBH.Eng.settings }); for (let i = 0; i < 3; i++) h.tick(0.05);
    out.run = h.stats(); h.setQuality('low');
    return out;
  });
  ok(bud.run.calls < 60 && bud.run.tris <= 80000, 'run: high tier stays under 60 calls and 80k tris (' + bud.run.calls + ' calls, ' + bud.run.tris + ' tris)');
  const leak = await page.evaluate(async () => {
    const h = BBH.R3.host, R = h.renderer, mem = () => ({ g: R.info.memory.geometries, t: R.info.memory.textures }), hud = document.createElement('div'), res = []; document.body.appendChild(hud);
    const cycle = async () => { await h.load('run', { hud, embedded: true, again: false }); for (let i = 0; i < 3; i++) h.tick(0.05); await h.load('tuner', { hud, embedded: true, again: false }); for (let i = 0; i < 3; i++) h.tick(0.05); h.unload(); await new Promise((r) => setTimeout(r, 50)); return mem(); };
    await cycle(); const base = mem(); for (let i = 0; i < 4; i++) res.push(await cycle());
    return { base, res, ac: R.info.autoReset, exp: R.toneMappingExposure, ctx: BBH.Audio && BBH.Audio.ctx ? BBH.Audio.ctx.state : null };
  });
  const last = leak.res[leak.res.length - 1], within = (a, b) => Math.abs(a - b) <= Math.max(2, b * 0.05);
  ok(within(last.g, leak.base.g) && within(last.t, leak.base.t), 'run + tuner: 4 more load / unload cycles keep GPU geometries and textures at the baseline (' + JSON.stringify(leak.base) + ' -> ' + JSON.stringify(last) + ')');
  ok(leak.ac === true && leak.exp === 1, 'tuner: the shared renderer gets autoReset and exposure back on dispose (' + leak.ac + ', ' + leak.exp + ')');

  ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));

  /* ================================================================ 2D default untouched */
  const p2 = await env.newPage({ viewport: { width: 360, height: 640 } });
  await p2.page.goto(env.url('index.html?r=2d'));
  await p2.page.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.scenes.run && BBH.Eng.scenes3d.run, null, { timeout: 60000 });
  ok(await p2.page.evaluate(() => ['run', 'tuner', 'seq', 'studio'].every((n) => BBH.Eng.pickScene(n) === BBH.Eng.scenes[n] && !BBH.Eng.scenes[n].is3d)), '2D: ?r=2d keeps the 2D run / tuner / seq / studio scenes');
  ok(p2.errs.length === 0, '2D: no console errors' + (p2.errs.length ? ': ' + p2.errs.slice(0, 3).join(' | ') : ''));
} catch (e) {
  ok(false, 'r3mini suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done('beatbox_heroes_r3mini');
