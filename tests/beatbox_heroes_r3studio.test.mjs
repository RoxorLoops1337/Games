// r3 STUDIO gate (TRAINING_PLAN 1 Sounds, STUDIO): the Sound Recorder with unlockable sounds, the NEW SOUND moment, the Beat Maker for Originality.
// Real game in headless Chromium (?r=3d, swiftshader) through r3/scenes_mini.js, minigames.js, samples.js and r3/sounds_ui.js:
//   recorder   every Core.SOUNDS entry is a row, locked ones greyed with how to unlock them; music OFF (Audio.gameMode) while recording
//   unlock     Core unlocks LR (coaching with BeeAmGee) -> fx soundUnlocked -> the card (NEW SOUND, LIP ROLL, who taught you, PLAY, RECORD YOURS -> recorder on LR)
//   record     a fake mic sample for LR is stored under that id in IndexedDB (slot1:sndLR) and BBH.Audio / Samples.play plays it; RESET removes it
//   beat maker LR is an extra row; tapping it paints the pattern; RELEASE still works; {train:true} FINISH reports Core trainGame({stat:'ori', game:'make', level, q})
//   2D         ?r=2d: the card is a plain DOM card in #ui, the recorder lists every sound
// Set BBH_SHOTS=<dir> to save studio_*.png screenshots. SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3studio suite hung'); process.exit(1); }, 420000);
const env = await r3env('beatbox_heroes_r3studio');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 120000, SHOTS = process.env.BBH_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'studio_' + name + '.png') }); };

try {
  const { page, errs } = await env.newPage({ viewport: { width: 360, height: 640 } });
  page.setDefaultTimeout(T);
  await page.goto(env.url('index.html?r=3d&q=low'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed'), null, { timeout: 90000 });
  ok(await page.evaluate(() => BBH.R3.status) === 'ready', '?r=3d boots');
  ok(await page.evaluate(() => !!(BBH.SoundsUI && BBH.G.snd && BBH.Core.SOUNDS && BBH.Core.SOUNDS.length >= 8)), 'sounds UI, G.snd and Core.SOUNDS are loaded');
  // spies: Audio.gameMode (music OFF) and every Core action the game applies
  await page.evaluate(() => {
    const A = BBH.Audio, gm = A.gameMode; window.__gm = [];
    A.gameMode = function (on, o) { window.__gm.push(!!on); return gm ? gm.apply(this, arguments) : undefined; };
    const ap = BBH.Core.apply; window.__acts = []; BBH.Core.apply = function (ch, a) { window.__acts.push(JSON.parse(JSON.stringify(a))); return ap.apply(this, arguments); };
    BBH.Mic.open = async () => ({ ok: true }); BBH.Mic.close = () => {}; BBH.Mic.isOpen = () => false;
    BBH.Mic.recordSample = async () => { const d = new Float32Array(4000); for (let i = 0; i < d.length; i++) d[i] = 0.4 * Math.sin(i * 0.05) * Math.exp(-i / 1500); return { ok: true, data: d, sampleRate: 44100 }; };
  });
  const fresh = (extra) => page.evaluate((extra) => {
    const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.look = Object.assign({}, ch.look, { name: 'Zed' }); ch.name = 'Zed'; ch.created = Date.now(); ch.flags.intro = 1; ch.place = 'studio'; ch.energy = 80; ch.minutes = 12 * 60;
    Object.assign(ch, extra || {}); BBH.G.slot = 1; BBH.G.setChar(ch); BBH.Eng.settings.offset = 0; BBH.Eng.settings.muted = false; BBH.Eng.unlockAudio(); return true;
  }, extra);
  await fresh(); await sleep(2000);
  const go = async (n, a, ready) => {
    await page.evaluate(([n, a]) => BBH.Eng.go(n, a), [n, a]);
    await page.waitForFunction(([n, r]) => BBH.Eng.sceneName === n && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === 'lab' && (!r || eval(r)), [n, ready || ''], { timeout: T });
    await sleep(1200);
  };
  const waitPlace = (id) => page.waitForFunction((id) => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs && BBH.Eng.sceneArgs.id === id, id, { timeout: T });
  const back = { scene: 'place', args: { id: 'studio' } };

  /* ============================================================ RECORDER: locked sounds are greyed */
  await page.evaluate(() => { window.__gm.length = 0; });
  await go('studio', { back }, 'BBH.Eng.scene.w && BBH.Eng.scene.ui');
  const r0 = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#ui .panel.flat.snd')], by = (id) => rows.find((r) => r.dataset.id === id);
    const lr = by('LR'), b = by('B');
    return { n: rows.length, total: BBH.Core.SOUNDS.length, first: rows[0] && rows[0].dataset.id, lrLocked: !!lr && lr.classList.contains('locked'), lrOp: lr && +getComputedStyle(lr).opacity, lrText: lr ? lr.textContent : '', lrRec: lr ? !!lr.querySelector('.btn') : true,
      bOpen: !!b && !b.classList.contains('locked') && [...b.querySelectorAll('.btn')].map((x) => x.textContent).join(','), locked: rows.filter((r) => r.classList.contains('locked')).length, gm: window.__gm.slice() };
  });
  ok(r0.n === r0.total && r0.first === 'B', 'recorder: one row per Core.SOUNDS entry (' + r0.n + '/' + r0.total + '), B first');
  ok(r0.bOpen === 'REC,SYNTH,MINE,RESET', 'recorder: unlocked sounds have REC / SYNTH / MINE / RESET (' + r0.bOpen + ')');
  ok(r0.lrLocked && r0.lrOp < 0.7 && !r0.lrRec && /LIP ROLL/.test(r0.lrText) && /BeeAmGee/.test(r0.lrText), 'recorder: LIP ROLL is greyed with how to unlock it (' + r0.lrText.replace(/\s+/g, ' ').slice(0, 70) + ')');
  ok(r0.locked === r0.total - 4, 'recorder: a new hero has only the four starter sounds open (' + r0.locked + ' locked)');
  ok(r0.gm.length && r0.gm[r0.gm.length - 1] === true, 'recorder: music is OFF in the recorder (Audio.gameMode(true))');
  await shot(page, 'recorder_locked');

  /* ============================================================ UNLOCK through Core: the card */
  await page.evaluate(() => { const ch = JSON.parse(JSON.stringify(BBH.G.ch)); ch.n.coaches = 1; BBH.G.setChar(ch); BBH.G.do({ t: 'recorded', n: 0 }); });
  await page.waitForFunction(() => !!document.querySelector('#snd-ui .snd-card[data-id="LR"]'), null, { timeout: 8000 });
  await sleep(600);
  const c0 = await page.evaluate(() => { const c = document.querySelector('#snd-ui .snd-card'); return { text: c.textContent, btns: [...c.querySelectorAll('.btn')].map((b) => b.textContent), r: c.getBoundingClientRect().toJSON(), unl: BBH.Core.soundUnlocked(BBH.G.ch, 'LR'), saved: BBH.G.ch.sounds.indexOf('LR') >= 0 }; });
  ok(c0.unl && c0.saved, 'unlock: Core unlocks LR after a coaching session with BeeAmGee (ch.sounds)');
  ok(/NEW SOUND/.test(c0.text) && /LIP ROLL/.test(c0.text) && /BeeAmGee/.test(c0.text), 'unlock: the card says NEW SOUND, LIP ROLL and who taught you (' + c0.text.replace(/\s+/g, ' ').slice(0, 80) + ')');
  ok(c0.btns.indexOf('PLAY') >= 0 && c0.btns.indexOf('RECORD YOURS') >= 0, 'unlock: PLAY and RECORD YOURS buttons (' + c0.btns.join(', ') + ')');
  ok(c0.r.left >= 0 && c0.r.right <= 360 && c0.r.top >= 0 && c0.r.bottom <= 640, 'unlock: the card fits a phone screen');
  await shot(page, 'unlock_card_3d');
  // audio spy: every drum / beatbox call and whether a voice actually played (true = synth voice or your sample was scheduled)
  await page.evaluate(() => { const A = BBH.Audio; window.__snd = []; for (const k of ['drum', 'beatbox']) { const f = A[k]; A[k] = function (id, o) { const r = f.apply(this, arguments); window.__snd.push({ k, id, r, sample: A.hasSample(id), synth: !!(o && o.synth) }); return r; }; } });
  const played = await page.evaluate(() => { window.__snd.length = 0; [...document.querySelectorAll('#snd-ui .snd-card .btn')].find((b) => b.textContent === 'PLAY').click(); return { n: window.__snd.filter((x) => x.id === 'LR' && x.r).length, calls: JSON.stringify(window.__snd) }; });
  ok(played.n > 0, 'unlock: PLAY plays the LR synth voice (' + played.calls + ')');
  await page.evaluate(() => [...document.querySelectorAll('#snd-ui .snd-card .btn')].find((b) => b.textContent === 'RECORD YOURS').click());
  await page.waitForFunction(() => BBH.Eng.sceneName === 'studio' && BBH.Eng.scene.ui && BBH.Eng.scene.focus === 'LR' && !document.querySelector('#snd-ui'), null, { timeout: T });
  await sleep(1500);
  const r1 = await page.evaluate(() => { const lr = document.querySelector('#ui .panel.flat.snd[data-id="LR"]'); return { open: lr && !lr.classList.contains('locked'), btns: lr ? [...lr.querySelectorAll('.btn')].map((b) => b.textContent).join(',') : '' }; });
  ok(r1.open && r1.btns === 'REC,SYNTH,MINE,RESET', 'unlock: RECORD YOURS opens the recorder on LIP ROLL, now recordable');

  /* ============================================================ RECORD a fake mic sample for LR */
  const rec0 = await page.evaluate(() => BBH.G.ch.n.recorded || 0);
  await page.locator('#ui .panel.flat.snd[data-id="LR"] .btn', { hasText: 'REC' }).first().click();
  await page.waitForFunction(() => BBH.Samples.has(BBH.G.slot || 1, 'LR'), null, { timeout: 10000 }); await sleep(600);
  const rc = await page.evaluate(async () => {
    await BBH.Samples.flush();
    const idb = await new Promise((res) => { const rq = indexedDB.open('beatbox-heroes-samples', 1); rq.onsuccess = () => { const db = rq.result, g = db.transaction('samples', 'readonly').objectStore('samples').get('slot1:sndLR'); g.onsuccess = () => { const v = g.result; res(v ? { n: v.f32.length, rate: v.rate } : null); db.close(); }; g.onerror = () => res(null); }; rq.onerror = () => res(null); });
    window.__snd.length = 0; const mine = BBH.Samples.play('LR', { mine: true }), n = window.__snd.filter((x) => x.id === 'LR' && x.r && x.sample).length, inAudio = BBH.Audio.hasSample('LR');
    const row = document.querySelector('#ui .panel.flat.snd[data-id="LR"]');
    return { idb, mine, n, inAudio, b0: BBH.Samples.has(1, 0), tag: row ? row.textContent : '', recd: BBH.G.ch.n.recorded || 0, gm: window.__gm[window.__gm.length - 1] };
  });
  ok(rc.idb && rc.idb.n === 4000 && rc.idb.rate === 44100, 'record: the LR sample is stored under its sound id in IndexedDB (slot1:sndLR, ' + JSON.stringify(rc.idb) + ')');
  ok(rc.inAudio && rc.mine === true && rc.n >= 1, 'record: BBH.Audio holds the LR sample and plays it instead of the synth voice');
  ok(!rc.b0 && /YOUR SOUND/.test(rc.tag) && rc.recd === rec0 + 1, 'record: only LR changed, the row says YOUR SOUND, counted as recorded');
  ok(rc.gm === true, 'record: music stays OFF while recording');
  await shot(page, 'recorder_mine');
  await page.locator('#ui .panel.flat.snd[data-id="LR"] .btn', { hasText: 'RESET' }).first().click(); await sleep(700);
  ok(await page.evaluate(() => !BBH.Samples.has(1, 'LR')), 'record: RESET puts LR back to the synth voice');
  await page.locator('#ui .btn', { hasText: 'BACK' }).last().click(); await waitPlace('studio');
  ok(await page.evaluate(() => window.__gm[window.__gm.length - 1] === false), 'recorder: leaving gives the music back (Audio.gameMode(false))');

  /* ============================================================ BEAT MAKER: extra rows, RELEASE */
  await go('seq', { back, place: 'studio' }, 'BBH.Eng.scene.w && BBH.Eng.scene.cells');
  const sq = await page.evaluate(() => { const s = BBH.Eng.scene; return { cells: s.cells.length, rows: s.pat.steps.length, ids: s.pat.ids, labels: [...document.querySelectorAll('#ui .tp')].map((e) => e.textContent).filter((t) => t === 'LR').length, gm: window.__gm[window.__gm.length - 1] }; });
  ok(sq.rows === 5 && sq.cells === 80 && sq.ids.join() === 'LR' && sq.labels === 1, 'seq: LIP ROLL is an extra row in the Beat Maker (' + sq.rows + ' rows, ' + sq.cells + ' cells)');
  ok(sq.gm === true, 'seq: music is OFF while composing');
  const cb = async (l, i) => page.evaluate(([l, i]) => { const r = BBH.Eng.scene.cells[l * 16 + i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, [l, i]);
  for (const i of [2, 6, 10]) { const p = await cb(4, i); await page.mouse.click(p.x, p.y); await sleep(120); }
  ok(await page.evaluate(() => BBH.Eng.scene.pat.steps[4].join('')) === '0010001000100000', 'seq: tapping the LR row paints LR steps');
  await page.evaluate(() => { const s = BBH.Eng.scene; for (let i = 0; i < 16; i += 4) s.pat.steps[0][i] = 1; for (let i = 4; i < 16; i += 8) s.pat.steps[2][i] = 1; s.build(); });
  await page.locator('#ui .btn', { hasText: 'PLAY' }).first().click(); await sleep(1400);
  ok(await page.evaluate(() => BBH.Eng.scene.playing && BBH.Eng.scene.step >= 0), 'seq: the pattern with the extra row plays');
  await shot(page, 'beatmaker_rows');
  await page.locator('#ui .btn', { hasText: 'STOP' }).first().click(); await sleep(200);
  const songs0 = await page.evaluate(() => BBH.G.ch.songs.length);
  await page.evaluate(() => { BBH.Eng.scene.played = 9; });
  await page.locator('#ui .btn', { hasText: 'RELEASE' }).first().click(); await sleep(500);
  await page.locator('#r3kit .k3-modal .btn, #ui .btn', { hasText: 'RELEASE' }).last().click(); await sleep(500);
  const rel = await page.evaluate(() => ({ n: BBH.G.ch.songs.length, cells: BBH.G.ch.songs[BBH.G.ch.songs.length - 1].activeCells, ids: BBH.G.ch.patterns[BBH.G.ch.patIdx].ids }));
  ok(rel.n === songs0 + 1 && rel.cells === 9 && rel.ids && rel.ids[0] === 'LR', 'seq: RELEASE still makes a song, counting the LR hits (' + rel.cells + ' hits) and the row is saved');
  await page.locator('#ui .btn', { hasText: 'BACK' }).last().click(); await waitPlace('studio');

  /* ============================================================ BEAT MAKER train mode: trainGame */
  await page.evaluate(() => { const ch = JSON.parse(JSON.stringify(BBH.G.ch)); ch.energy = 80; ch.minutes = 12 * 60; BBH.G.setChar(ch); });
  await go('seq', { back, place: 'studio', train: true }, 'BBH.Eng.scene.w && BBH.Eng.scene.cells');
  const fin = await page.evaluate(() => [...document.querySelectorAll('#ui .btn')].some((b) => b.textContent === 'FINISH'));
  ok(fin, 'train: opened with {train:true} the Beat Maker offers FINISH');
  const pre = await page.evaluate(() => { BBH.Eng.scene.played = 9; window.__acts.length = 0; return { ori: BBH.G.ch.stats.ori, q: BBH.Core.patternScore(BBH.Eng.scene.pat), lv: (BBH.G.ch.trainLv && BBH.G.ch.trainLv.make) || 1 }; });
  await page.locator('#ui .btn', { hasText: 'FINISH' }).first().click(); await sleep(600);
  const tg = await page.evaluate(() => ({ a: window.__acts.find((a) => a.t === 'trainGame'), card: [...document.querySelectorAll('#ui .panel.pop')].map((e) => e.textContent).join(' | '), ori: BBH.G.ch.stats.ori }));
  ok(tg.a && tg.a.stat === 'ori' && tg.a.game === 'make' && tg.a.level === pre.lv && Math.abs(tg.a.q - pre.q) < 1e-9, 'train: FINISH reports Core trainGame({stat:"ori", game:"make", level, q = patternScore}) ' + JSON.stringify(tg.a));
  ok(/BEAT FINISHED/.test(tg.card) && /CREATIVITY/i.test(tg.card), 'train: a result card shows the creativity score');
  ok(tg.ori >= pre.ori, 'train: Originality did not go down (' + pre.ori.toFixed(2) + ' -> ' + tg.ori.toFixed(2) + ')');
  await shot(page, 'beatmaker_train');
  await page.locator('#ui .btn', { hasText: 'CONTINUE' }).last().click(); await waitPlace('studio');
  ok(true, 'train: CONTINUE returns to the place');

  ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));

  /* ============================================================ 2D: the DOM card and the list */
  const p2 = await env.newPage({ viewport: { width: 360, height: 640 } });
  await p2.page.goto(env.url('index.html?r=2d'));
  await p2.page.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.scenes.studio && BBH.SoundsUI && BBH.Eng.sceneName === 'title', null, { timeout: 60000 });
  await p2.page.evaluate(() => { const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.name = 'Zed'; ch.flags.intro = 1; ch.place = 'studio'; ch.energy = 80; ch.minutes = 12 * 60; ch.level = 2; BBH.G.slot = 2; BBH.G.setChar(ch); BBH.Eng.go('studio', { back: { scene: 'street' } }, { nofade: true }); });
  await sleep(800);
  const d0 = await p2.page.evaluate(() => ({ rows: document.querySelectorAll('#ui .panel.flat.snd').length, locked: document.querySelectorAll('#ui .panel.flat.snd.locked').length, total: BBH.Core.SOUNDS.length }));
  ok(d0.rows === d0.total && d0.locked === d0.total - 4, '2D: the recorder lists every sound, locked ones greyed (' + d0.rows + ' rows, ' + d0.locked + ' locked)');
  await p2.page.evaluate(() => { const ch = JSON.parse(JSON.stringify(BBH.G.ch)); ch.level = 3; BBH.G.setChar(ch); BBH.G.do({ t: 'recorded', n: 0 }); });
  await p2.page.waitForFunction(() => !!document.querySelector('#ui .snd-card[data-id="RIM"]'), null, { timeout: 8000 });
  const d1 = await p2.page.evaluate(() => { const c = document.querySelector('#ui .snd-card'); return { text: c.textContent, btns: [...c.querySelectorAll('.btn')].map((b) => b.textContent) }; });
  ok(/NEW SOUND/.test(d1.text) && /RIMSHOT/.test(d1.text) && d1.btns.indexOf('RECORD YOURS') >= 0, '2D: reaching level 3 shows the DOM card for RIMSHOT (' + d1.text.replace(/\s+/g, ' ').slice(0, 60) + ')');
  await sleep(500); await shot(p2.page, 'unlock_card_2d');
  await p2.page.evaluate(() => BBH.Eng.go('street', {}, { nofade: true })); await sleep(900);
  ok(await p2.page.evaluate(() => !!document.querySelector('#ui .snd-card[data-id="RIM"]')), '2D: the card survives the scene change until you close it');
  await p2.page.evaluate(() => [...document.querySelectorAll('#ui .snd-card .btn')].find((b) => b.textContent === 'LATER').click()); await sleep(400);
  ok(await p2.page.evaluate(() => !document.querySelector('#ui .snd-card') && !BBH.SoundsUI.open), '2D: LATER closes the card');
  await p2.page.evaluate(() => BBH.Eng.go('seq', { back: { scene: 'street' }, place: 'home' }, { nofade: true })); await sleep(700);
  ok(await p2.page.evaluate(() => BBH.Eng.scene.pat.steps.length === 5 && BBH.Eng.scene.pat.ids[0] === 'RIM' && BBH.Eng.scene.cellAt(30, BBH.Eng.scene.gridY() + 4 * BBH.Eng.scene.rowH() + 3).l === 4 && BBH.Eng.scene.gridY() + 5 * BBH.Eng.scene.rowH() <= 408), '2D: the Beat Maker grows a RIM row on its canvas grid');
  await shot(p2.page, 'beatmaker_2d');
  await p2.page.evaluate(() => BBH.Eng.go('street', {}, { nofade: true })); await sleep(300);
  ok(p2.errs.length === 0, '2D: no console errors' + (p2.errs.length ? ': ' + p2.errs.slice(0, 3).join(' | ') : ''));
} catch (e) {
  ok(false, 'r3studio suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done('beatbox_heroes_r3studio');
