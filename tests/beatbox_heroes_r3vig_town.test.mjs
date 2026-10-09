// r3 VIGNETTE gate for the TOWN interiors (park3d/vig_shop.js, vig_lab.js, vig_bar.js, the town hooks in r3/vig.js): the REAL game in 3D (?r=3d&q=low, headless Chromium +
// swiftshader, phone viewport 390x844).
//   SWEEP: every id of the shop, the Sound Lab and the bar plays in every form (FIRST, FULL, SHORT, MICRO), pays exactly once, ends without cue errors and hands back (controls on,
//          no props, no chrome, no mirror flip); every MICRO is under 1.5 s; every FIRST under 12 s.
//   SHOP:  a try on tile tap plays the MICRO swap under the open panel, the look lands, the try on camera (orbit) stays; BUY holds the toast until PAY and the panel is still there;
//          WEAR IT plays the mirror scene; the shelves job from the counter menu.
//   LAB:   the mic's training menu: an IDLE session gets its studio bookend, then the session ticks; the mixer's BEAT MAKER gets its lead in, then the beat maker opens; the jukebox.
//   BAR:   the juice bar (Rohzel serves), mingle (the vignette is the outcome Core picked), the open mic walk up, then the venue; the bow back in the room after the set, and none
//          when a story film took the moment; the battle walk out.
//   2D (?r=2d): buying is instant, no vignette layer.  No black frames, no console errors.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, until, sleep } from './beatbox_heroes_r3gamelib.mjs';
import { SAMPLER } from '../tools/beatbox_heroes/blackframes.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3vig_town suite hung'); process.exit(1); }, 2700000);
const env = await r3env('beatbox_heroes_r3vig_town');
const ONLY = process.env.VIG_ONLY || '', part = (k) => !ONLY || ONLY.split(',').indexOf(k) >= 0;
const placeUp = (page, id, wid) => until(page, ([id, wid]) => { const E = BBH.Eng, sc = E.scene; return E.sceneName === 'place' && sc && sc.is3d && !E.pendingSwitch && E.sceneArgs.id === id && BBH.R3.world && BBH.R3.world.id === wid && sc.w === BBH.R3.world; }, [id, wid], 150000);
const vigOver = (page, ms) => until(page, () => !BBH.R3Vig.playing && !BBH.R3Vig.cur && !document.body.classList.contains('vig-on'), null, ms || 150000);
const go = async (page, id, wid) => { await page.evaluate((id) => BBH.Eng.go('place', { id }), id); const up = await placeUp(page, id, wid); if (up) { await page.evaluate((w) => Promise.all([BBH.R3Vig.load(w), BBH.R3Cine.load()]), wid); await sleep(500); } return up; };
// a day with that bar programme (core.js barProgramme)
const dayFor = (page, prog) => page.evaluate((p) => { for (let d = 1; d < 15; d++) if (BBH.Core.barProgramme(d).id === p) return d; return 3; }, prog);

// every id of a world's module in every form: the options a reel reads (action, fx, extra) come from opts(id)
async function sweep(page, wid, label) {
  const all = await page.evaluate(async (wid) => {
    const V = BBH.R3Vig, ids = Object.keys((await V.load(wid)).VIGNETTES), out = [], C = BBH.Core, opp = C.OPPONENTS[2];
    const votes = (win) => [1, 0, 1, win ? 1 : 0, 0].map((x) => ({ forPlayer: !!x }));
    const opts = (id, i) => {
      const o = {};
      if (id === 'p1.shop.buy') o.action = { t: 'buy', group: ['top', 'hat', 'glasses'][i % 3], id: ['hawaiian', 'cowboy', 'shades'][i % 3] };
      if (id === 'p1.shop.wear') o.action = { t: 'equip', group: 'hat', id: 'fedora' };
      if (id === 'p1.shop.tryon') o.extra = { from: BBH.G.ch.look, to: Object.assign({}, BBH.G.ch.look, { hat: { id: 'cowboy', color: '#7a4a22' } }), tab: ['top', 'hat', 'glasses'][i % 3], restore: () => BBH.R3.world.setLook(BBH.G.ch.look) };
      if (id === 'p3.jukebox.lab') o.extra = { track: ['park', 'shop', 'bar', 'battle'][i % 4] };
      if (id === 'p1.train.quick') o.action = { t: 'train', stat: ['mus', 'tech', 'ori', 'show'][i % 4], q: 0.4 };
      if (/^p1\.mingle\./.test(id)) { o.action = { t: 'mingle', who: ['luca', 'mira', 'sky'][i % 3] }; o.fx = [{ t: 'mingle', id: id.slice(10), who: o.action.who }]; }
      if (id === 'p1.date') o.action = { t: 'date', who: 'mira' };
      if (id === 'p1.stage.out') o.fx = [{ t: 'result', kind: ['openmic', 'showcase', 'karaoke', 'openmic'][i % 4], res: { rank: 'SADB'[i % 4] }, rw: { cash: 30 } }];
      if (id === 'p1.battle.walkout') o.action = { t: 'go', scene: 'rhythm', args: { mode: 'battle', opp } };
      if (id === 'p1.battle.verdict') { const win = i % 2 === 0; o.fx = [{ t: 'battleResult', opp: i % 3 ? opp.id : 'pigpen', out: { win, votes: votes(win) } }]; }
      return o;
    };
    let i = 0;
    for (const id of ids) {
      for (const form of ['micro', 'short', 'full', 'first']) {
        const o = Object.assign(opts(id, i++), { form }); o.pay = () => { o.paid = (o.paid || 0) + 1; }; let len = null;
        V.onReel = (c) => { c.seek(40); len = c.state().real; };
        const info = await V.play(id, o);
        const w = BBH.R3.world, props = []; w.scene.traverse((x) => { if (x.name && /^vig_/.test(x.name)) props.push(x.name); });
        out.push({ id, form, ok: info.ok, err: info.errors, len, paid: o.paid || 0, e: info.error, props: props.length, ctl: w.controls.state().enabled, flip: !!document.getElementById('gl').style.transform || !!document.getElementById('vig-mirror') });
      }
    }
    V.onReel = null; return out;
  }, wid);
  const bad = all.filter((r) => !r.ok || r.err || r.paid !== 1);
  ok(all.length >= 16 && !bad.length, label + ': every id plays in every form, pays once, no cue errors (' + all.length + ' plays' + (bad.length ? ', bad: ' + JSON.stringify(bad.slice(0, 4)) : '') + ')');
  const slow = all.filter((r) => r.form === 'micro' && !(r.len > 0 && r.len < 1.5));
  ok(!slow.length, label + ': every MICRO is under 1.5 s' + (slow.length ? ': ' + JSON.stringify(slow.slice(0, 4)) : ''));
  const longF = all.filter((r) => r.form === 'first' && r.len > 12);
  ok(!longF.length, label + ': every FIRST stays under 12 s' + (longF.length ? ': ' + JSON.stringify(longF) : ''));
  const left = all.filter((r) => r.props || !r.ctl || r.flip);
  ok(!left.length, label + ': every scene hands back (no props, controls on, no mirror flip)' + (left.length ? ': ' + JSON.stringify(left.slice(0, 4)) : ''));
  return [...new Set(all.map((r) => r.id))];
}

try {
  const { page, errs } = await env.newPage({ viewport: { width: 390, height: 844 }, init: SAMPLER });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  ok(await until(page, () => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.w, null, 150000), '3D boots to the title');
  await seed(page, { day: 3, minutes: 14 * 60 - 360, hunger: 40, energy: 90, cash: 600, fans: 80, level: 8 });
  await page.evaluate(() => { window.__BF.start(); window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('k3-toast')) window.__toasts.push(n.textContent.trim()); }).observe(document.getElementById('r3kit'), { childList: true, subtree: true }); });

  /* ------------------------------------------------------------------ THE SHOP */
  if (part('shop')) {
    ok(await go(page, 'shop', 'shop'), 'the thrift shop is up');
    const ids = await sweep(page, 'shop', 'shop');
    for (const need of ['p1.shop.tryon', 'p1.shop.buy', 'p1.shop.wear', 'p1.job.shelves', 'p1.refuse.cash']) ok(ids.indexOf(need) >= 0, 'the shop has ' + need);
    // the try on: open the panel at the racks, tap a tile; the MICRO swap plays under the panel, the look lands, the camera is still the try on orbit
    await page.evaluate(() => { BBH.R3Vig.force = null; BBH.R3Vig.test = true; BBH.R3Vig.log.length = 0; BBH.R3Vig.resetCounts(); BBH.R3.world.activate('racks'); });
    ok(await until(page, () => BBH.Eng.scene.shop && BBH.Eng.scene._try && document.querySelectorAll('#ui .grid .tile').length > 2, null, 30000), 'the racks open the shop panel and the try on camera');
    await sleep(600);
    const tr = await page.evaluate(async () => {
      const S = BBH.Eng.scene, w = BBH.R3.world, wait = (ms) => new Promise((r) => setTimeout(r, ms)); let playing = null;
      for (let k = 1; k < 6 && !playing; k++) { const tiles = [...document.querySelectorAll('#ui .grid .tile')], before = JSON.stringify(S.shop.look); if (!tiles[k]) break; tiles[k].click(); if (JSON.stringify(S.shop.look) === before) continue; for (let i = 0; i < 20 && !BBH.R3Vig.playing; i++) await wait(50); playing = BBH.R3Vig.playing; }
      for (let i = 0; i < 100 && BBH.R3Vig.playing; i++) await wait(50);
      await wait(400);
      const gl = w.player.getLook ? w.player.getLook() : null;
      return { playing, log: BBH.R3Vig.log.slice(), mode: w.controls.mode, look: gl && gl.top && gl.top.id, want: S.shop.look.top.id, panel: !!(S.shop.el && S.shop.el.isConnected), hidden: document.body.classList.contains('vig-on') };
    });
    ok(tr.playing === 'p1.shop.tryon' && tr.log.some((l) => l === 'p1.shop.tryon:micro'), 'try on: a tile tap plays the MICRO swap (' + tr.log.join(',') + ')');
    ok(tr.mode === 'orbit' && tr.panel && !tr.hidden, 'try on: the panel stays open and the try on camera (orbit, drag to spin) is untouched (' + tr.mode + ')');
    ok(tr.look === tr.want, 'try on: the tried on look is on the hero after the swap');
    // BUY: Core at once, the toast on PAY, the panel still there with WEAR IT ready
    await page.evaluate(() => { BBH.R3Vig.force = 'short'; BBH.R3Vig.log.length = 0; window.__toasts.length = 0; });
    const by = await page.evaluate(() => {
      const S = BBH.Eng.scene, cash0 = BBH.G.ch.cash, tiles = [...document.querySelectorAll('#ui .grid .tile')], tile = tiles.find((x) => x.querySelector('.pr') && !x.classList.contains('lock'));
      if (!tile) return { none: true }; tile.click(); BBH.R3Vig.cut(); const b = [...document.querySelectorAll('#ui .btn')].find((x) => /^BUY \$/.test(x.textContent.trim())); if (!b) return { nobuy: true }; b.click();
      return { cash0, cash1: BBH.G.ch.cash, playing: BBH.R3Vig.playing, toastNow: window.__toasts.length };
    });
    ok(by.cash1 < by.cash0 && by.playing === 'p1.shop.buy' && by.toastNow === 0, 'buy: Core applies at once, the buy vignette plays, the toast waits for PAY (' + JSON.stringify(by) + ')');
    ok(await vigOver(page), 'buy: the vignette ends');
    const by2 = await page.evaluate(() => ({ toast: window.__toasts.some((t) => /Bought/.test(t)), panel: !!(BBH.Eng.scene.shop && BBH.Eng.scene.shop.el.isConnected), wear: [...document.querySelectorAll('#ui .btn')].some((x) => /WEAR IT/.test(x.textContent)), mode: BBH.R3.world.controls.mode }));
    ok(by2.toast && by2.panel && by2.wear && by2.mode === 'orbit', 'buy: the toast landed, the panel is back with WEAR IT, the try on camera is back (' + JSON.stringify(by2) + ')');
    // WEAR IT: the mirror scene
    const wr = await page.evaluate(() => { BBH.R3Vig.log.length = 0; const bs = [...document.querySelectorAll('#ui .btn')].filter((x) => /WEAR IT/.test(x.textContent)); const l0 = JSON.stringify(BBH.G.ch.look.top); if (bs[0]) bs[0].click(); return { n: bs.length, playing: BBH.R3Vig.playing, last: BBH.R3Vig.last, changed: l0 !== JSON.stringify(BBH.G.ch.look.top), place: BBH.Eng.scene.id }; });
    ok(await until(page, () => BBH.R3Vig.log.some((l) => /^p1\.shop\.wear/.test(l)), null, 150000) && await vigOver(page), 'wear it: the mirror vignette plays and ends (' + JSON.stringify(wr) + ')');
    ok(await page.evaluate(() => !document.getElementById('gl').style.transform && !document.getElementById('vig-mirror') && !!(BBH.Eng.scene.shop && BBH.Eng.scene.shop.el.isConnected)), 'wear it: the mirror view is gone, the panel is back');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .btn')].find((x) => /LEAVE SHOP/.test(x.textContent)); if (b) b.click(); });
    await sleep(500);
    // the shelves job from the counter menu
    await page.evaluate(() => { BBH.R3Vig.log.length = 0; BBH.R3.world.activate('counter'); });
    await until(page, () => [...document.querySelectorAll('#ui .sheet .btn')].some((x) => /ODD JOB|STOCK SHELVES/i.test(x.textContent)), null, 30000);
    const sj = await page.evaluate(() => { const c0 = BBH.G.ch.cash, b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /ODD JOB|STOCK SHELVES/i.test(x.textContent)); if (b) b.click(); return { c0, playing: BBH.R3Vig.playing }; });
    ok(sj.playing === 'p1.job.shelves' && await vigOver(page) && await page.evaluate((c0) => BBH.G.ch.cash > c0, sj.c0), 'the shelves job: the TRM vignette plays and the pay lands (' + JSON.stringify(sj) + ')');
  }

  /* ------------------------------------------------------------------ THE SOUND LAB */
  if (part('lab')) {
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.minutes = 14 * 60 - 360; ch.energy = 90; BBH.G.setChar(ch); BBH.R3Vig.force = null; });
    ok(await go(page, 'studio', 'lab'), 'the Sound Lab is up');
    const ids = await sweep(page, 'lab', 'lab');
    for (const need of ['p1.train.idle.mus', 'p1.train.idle.tech', 'p1.train.play.ear', 'p1.beatmaker.in', 'p1.record.in', 'p1.train.quick', 'p3.jukebox.lab']) ok(ids.indexOf(need) >= 0, 'the lab has ' + need);
    // the mic: the training menu, a skill, IDLE: the studio bookend plays, then the session ticks
    await page.evaluate(() => { BBH.R3Vig.force = 'short'; BBH.R3Vig.log.length = 0; BBH.R3.world.activate('mic'); });
    ok(await until(page, () => !!document.querySelector('#ui .sheet [data-stat]'), null, 60000), 'the mic opens the training menu');
    const idle = await page.evaluate(async () => {
      const q = (sel) => document.querySelector('#ui .sheet ' + sel), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const st = q('[data-stat="tech"]'); if (st) st.click(); await wait(300);
      const id = q('[data-act="idle"]'); if (id) id.click(); await wait(300);
      const mn = q('[data-min="15"]'); if (mn) mn.click(); await wait(300);
      const go = q('[data-act="start-idle"]'); if (go) go.click();
      for (let i = 0; i < 40 && !BBH.R3Vig.playing && !BBH.R3Vig.log.length; i++) await wait(100);
      return { playing: BBH.R3Vig.playing, log: BBH.R3Vig.log.slice(), steps: [!!st, !!id, !!mn, !!go] };
    });
    ok(/^p1\.train\.idle\./.test(idle.playing || idle.log[0] || ''), 'IDLE training at the mic plays the studio bookend (' + JSON.stringify(idle) + ')');
    ok(await vigOver(page) && await until(page, () => BBH.Train && BBH.Train.last && BBH.Train.last.stat, null, 120000), 'then the idle session runs');
    await page.evaluate(() => { try { BBH.Train.stop(); } catch (e) { /* ignore */ } });
    await sleep(600);
    await page.evaluate(() => BBH.Eng.go('place', { id: 'studio' })); await placeUp(page, 'studio', 'lab'); await sleep(500);
    // the jukebox: a track from the mixer's jukebox sheet plays the MICRO nod
    await page.evaluate(() => { BBH.R3Vig.force = null; BBH.R3Vig.log.length = 0; BBH.R3.world.activate('mixer'); });
    await until(page, () => [...document.querySelectorAll('#ui .sheet .btn')].some((x) => /JUKEBOX/.test(x.textContent)), null, 30000);
    await page.evaluate(() => { [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /JUKEBOX/.test(x.textContent)).click(); });
    await until(page, () => [...document.querySelectorAll('#ui .sheet .btn')].some((x) => /PIGEON PLUCK/.test(x.textContent)), null, 30000);
    await page.evaluate(() => { [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /PIGEON PLUCK/.test(x.textContent)).click(); });
    ok(await until(page, () => BBH.R3Vig.log.some((l) => l === 'p3.jukebox.lab:micro'), null, 30000), 'the jukebox: a track plays its MICRO beat');
    await page.evaluate(() => { const x = [...document.querySelectorAll('#ui .sheet .btn')].find((b) => b.textContent.trim() === 'X'); if (x) x.click(); });
    await sleep(400);
    // the mixer's BEAT MAKER: the lead in at the MPC, then the beat maker scene
    await page.evaluate(() => { BBH.R3Vig.force = 'short'; BBH.R3Vig.log.length = 0; BBH.R3.world.activate('mixer'); });
    await until(page, () => [...document.querySelectorAll('#ui .sheet .btn')].some((x) => /BEAT MAKER/.test(x.textContent)), null, 30000);
    await page.evaluate(() => { [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /BEAT MAKER/.test(x.textContent)).click(); });
    ok(await until(page, () => BBH.Eng.sceneName === 'seq', null, 240000) && await page.evaluate(() => BBH.R3Vig.log.some((l) => /^p1\.beatmaker\.in/.test(l))), 'the mixer BEAT MAKER: its lead in at the MPC, then the beat maker opens');
    await page.evaluate(() => { BBH.R3Vig.force = null; });
  }

  /* ------------------------------------------------------------------ THE BAR */
  if (part('bar')) {
    const om = await dayFor(page, 'openmic');
    await page.evaluate((d) => { const ch = BBH.Core.clone(BBH.G.ch); ch.day = d; ch.minutes = 21 * 60 - 360; ch.energy = 95; ch.hunger = 40; BBH.G.setChar(ch); BBH.R3Vig.force = null; }, om);
    ok(await go(page, 'bar', 'bar'), 'the bar is up (open mic night)');
    const ids = await sweep(page, 'bar', 'bar');
    for (const need of ['p1.stage.in.openmic', 'p1.stage.in.showcase', 'p1.stage.in.karaoke', 'p1.stage.out', 'p1.battle.walkout', 'p1.battle.verdict', 'p1.eat.smoothie', 'p1.job.dishes', 'p1.mingle.juice', 'p1.mingle.napkin', 'p1.mingle.liproll', 'p1.mingle.bars', 'p1.mingle.awkward', 'p1.date'])
      ok(ids.indexOf(need) >= 0, 'the bar has ' + need);
    // the juice bar: Rohzel serves (the bar variant of the food scene), the menu comes back
    await page.evaluate(() => { BBH.R3Vig.force = 'short'; BBH.R3Vig.log.length = 0; window.__toasts.length = 0; BBH.R3.world.activate('counter'); });
    await until(page, () => [...document.querySelectorAll('#ui .sheet .btn')].some((x) => /SMOOTHIE/i.test(x.textContent)), null, 30000);
    const eat = await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /SMOOTHIE/i.test(x.textContent)); const c0 = BBH.G.ch.cash; b.click(); return { c0, c1: BBH.G.ch.cash, playing: BBH.R3Vig.playing, mod: BBH.R3.world.id }; });
    ok(eat.c1 < eat.c0 && eat.playing === 'p1.eat.smoothie' && eat.mod === 'bar', 'the juice bar: Core at once, the bar smoothie scene plays (' + JSON.stringify(eat) + ')');
    ok(await vigOver(page) && await page.evaluate(() => window.__toasts.some((t) => /hunger/i.test(t)) && !!document.querySelector('#ui .sheet')), 'the juice bar: the toast landed and the menu is back');
    await page.evaluate(() => { const x = [...document.querySelectorAll('#ui .sheet .btn')].find((b) => b.textContent.trim() === 'X'); if (x) x.click(); });
    await sleep(400);
    // mingle: tap a regular, CHAT: the vignette is the outcome Core picked (fx mingle)
    const mg = await page.evaluate(async () => {
      const S = BBH.Eng.scene, w = BBH.R3.world, who = (w.regularOf && w.regularOf('regular1')) || (S.regulars && S.regulars()[1] && S.regulars()[1].id) || 'luca';
      BBH.R3Vig.log.length = 0; S.mingleMenu(who); await new Promise((r) => setTimeout(r, 300));
      const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /^CHAT/.test(x.textContent.trim())); const keep = BBH.G.play; let fx = null; BBH.G.play = function (f) { fx = fx || f; return keep.apply(this, arguments); };
      b.click(); const playing = BBH.R3Vig.playing; for (let i = 0; i < 2400 && BBH.R3Vig.playing; i++) await new Promise((r) => setTimeout(r, 100)); BBH.G.play = keep;
      const m = (fx || []).find((x) => x.t === 'mingle'); return { who, playing, id: m && m.id, sheet: !!document.querySelector('#ui .sheet'), log: BBH.R3Vig.log.slice() };
    });
    ok(mg.id && mg.playing === 'p1.mingle.' + mg.id, 'mingle: the vignette is the outcome Core picked (' + JSON.stringify(mg) + ')');
    ok(mg.sheet, 'mingle: the regular\'s sheet is back afterwards');
    await vigOver(page); await page.evaluate(() => { const x = [...document.querySelectorAll('#ui .sheet .btn')].find((b) => b.textContent.trim() === 'X'); if (x) x.click(); });
    await sleep(400);
    // the stage: PLAY OPEN MIC plays the walk up, then the venue
    await page.evaluate(() => { BBH.R3Vig.force = 'short'; BBH.R3Vig.log.length = 0; BBH.R3.world.activate('stage'); });
    await until(page, () => [...document.querySelectorAll('#ui .sheet .btn')].some((x) => /PLAY OPEN MIC/.test(x.textContent)), null, 30000);
    await page.evaluate(() => { [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /PLAY OPEN MIC/.test(x.textContent)).click(); });
    ok(await until(page, () => BBH.R3Vig.playing === 'p1.stage.in.openmic' || BBH.R3Vig.log.some((l) => /^p1\.stage\.in\.openmic/.test(l)), null, 30000), 'PLAY OPEN MIC: the stage walk up plays first');
    ok(await until(page, () => BBH.Eng.sceneName === 'rhythm', null, 240000), 'then the venue (rhythm) opens');
    // back in the room after the set: the bow plays (the result was decided in the venue)
    const back = async (films) => {
      await page.evaluate((films) => {
        BBH.R3Vig.log.length = 0; BBH.R3Vig.force = 'short';
        const res = { accuracy: 0.9, perfect: 20, good: 5, miss: 1, bestCombo: 18, rank: 'A', perfectLane: [5, 5, 5, 5] };
        BBH.G.doHold({ t: 'perform', kind: 'openmic', res });
        BBH.G.activityReturn = { scene: 'rhythm', args: { mode: 'perform', kind: 'openmic' }, place: 'bar', spot: 'stage', hot: 'stage', pos: null, mode: 'stay', day: BBH.G.ch.day };
        if (films) { const C = BBH.R3Cine, P = BBH.Eng.scenes3d.place, f0 = P.firstVisit; P.firstVisit = function () { C.log.push('firstShowcase'); P.firstVisit = f0; return f0.apply(this, arguments); }; }
        BBH.Eng.go('place', { id: 'bar' });
      }, films);
      await placeUp(page, 'bar', 'bar'); await sleep(2500); await vigOver(page);
      return page.evaluate(() => BBH.R3Vig.log.slice());
    };
    const l1 = await back(false);
    ok(l1.some((l) => /^p1\.stage\.out/.test(l)), 'back in the bar after the open mic: the bow plays (' + l1.join(',') + ')');
    const l2 = await back(true);
    ok(!l2.some((l) => /^p1\.stage\.out/.test(l)), 'a story film took the moment: no bow (' + l2.join(',') + ')');
    // the battle walk out: the stage menu's battle path (startBattle) on a battle night
    const bd = await dayFor(page, 'battle');
    await page.evaluate((d) => { const ch = BBH.Core.clone(BBH.G.ch); ch.day = d; ch.lastBattleDay = -10; BBH.G.setChar(ch); }, bd);
    await page.evaluate(() => BBH.Eng.go('place', { id: 'bar' })); await placeUp(page, 'bar', 'bar'); await sleep(600);
    await page.evaluate(() => { BBH.R3Vig.log.length = 0; BBH.R3Vig.force = 'short'; BBH.G.places.startBattle(BBH.Eng.scene, BBH.Core.OPPONENTS[0]); });
    ok(await until(page, () => BBH.R3Vig.playing === 'p1.battle.walkout' || BBH.R3Vig.log.some((l) => /^p1\.battle\.walkout/.test(l)), null, 30000), 'a battle: the walk out plays first');
    ok(await until(page, () => BBH.Eng.sceneName === 'rhythm', null, 240000), 'then the battle venue opens');
    await page.evaluate(() => { BBH.R3Vig.force = null; BBH.Eng.go('place', { id: 'bar' }); }); await placeUp(page, 'bar', 'bar'); await vigOver(page);
  }

  /* ------------------------------------------------------------------ FRAMES and ERRORS */
  const dk = await page.evaluate(() => (window.__BF ? window.__BF.dark.slice() : []));
  ok(dk.length === 0, 'no uncovered black or flat dark frame while the vignettes played' + (dk.length ? ': ' + JSON.stringify(dk.slice(0, 3)) : ''));
  const real = errs.filter((e) => !/favicon/.test(e));
  ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real.slice(0, 4).join(' | ') : ''));
  await page.context().close();

  /* ------------------------------------------------------------------ 2D: unchanged */
  if (part('2d')) {
    const { page: p2, errs: e2 } = await env.newPage({ viewport: { width: 360, height: 640 } });
    await p2.goto(env.url('index.html?r=2d'));
    await until(p2, () => window.BBH && BBH.Eng && BBH.Eng.sceneName === 'title', null, 60000);
    await seed(p2, { day: 3, minutes: 14 * 60 - 360, cash: 300, level: 8 });
    await p2.evaluate(() => BBH.Eng.go('place', { id: 'shop' })); await sleep(800);
    const r2 = await p2.evaluate(() => {
      BBH.G.openShop(BBH.Eng.scene, 'hat'); const tile = [...document.querySelectorAll('#ui .tile')].find((x) => x.querySelector('.pr') && !x.classList.contains('lock')); const c0 = BBH.G.ch.cash;
      if (tile) tile.click(); const b = [...document.querySelectorAll('#ui .btn')].find((x) => /^BUY \$/.test(x.textContent.trim())); if (b) b.click();
      return { on: BBH.R3Vig ? BBH.R3Vig.enabled() : false, playing: BBH.R3Vig && BBH.R3Vig.playing, paid: BBH.G.ch.cash < c0, layer: !!document.querySelector('.cin') };
    });
    ok(!r2.on && !r2.playing && r2.paid && !r2.layer, '2D: buying is instant, no vignette layer (' + JSON.stringify(r2) + ')');
    ok(e2.filter((e) => !/favicon/.test(e)).length === 0, '2D: no console errors');
    await p2.context().close();
  }
} catch (e) { ok(false, 'r3vig_town threw: ' + (e && e.stack || e)); }
await env.stop(); clearTimeout(watchdog);
done('beatbox_heroes_r3vig_town');
