// r3 VIGNETTE gate (r3/vig.js, park3d/vignette_kit.js, park3d/vig_flat.js): the REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader, phone viewport 390x844).
//   RUNTIME: the length form from the repeat counter (FIRST, FULL x4, SHORT; MICRO for a repeat inside 20 s and for Settings SCENES: OFF; SHORT for SCENES: SHORT), the counter in its own
//            localStorage key; tap = PAY at once and hand back 300 ms later, skip = hand back at once; a missing id or a world without a module plays nothing and pays at once;
//            the handback (controls on, the player on its mark, the camera back on the controls camera, no layer, no props, no chrome left); reduce motion (no speed ramp).
//   FLAT: every vignette id in park3d/vig_flat.js plays and ends in every form, without cue errors; every MICRO is under 1.5 s.
//   GAME: eating in the kitchen holds the toast until PAY (Core applies at once), a refusal toast plays its MICRO scene first, the bed SLEEP row plays bedtime, then the wake up and the
//         morning card; the wardrobe gets its intro; the frames stay lit; no console errors.  2D (?r=2d): nothing changes.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, until, sleep } from './beatbox_heroes_r3gamelib.mjs';
import { SAMPLER } from '../tools/beatbox_heroes/blackframes.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3vig suite hung'); process.exit(1); }, 1500000);
const env = await r3env('beatbox_heroes_r3vig');
const homeReady = (page) => until(page, () => { const E = BBH.Eng, sc = E.scene; return E.sceneName === 'place' && sc && sc.is3d && !E.pendingSwitch && E.sceneArgs.id === 'home' && BBH.R3.world && BBH.R3.world.id === 'flat' && sc.w === BBH.R3.world; }, null, 150000);
const vigOver = (page, ms) => until(page, () => !BBH.R3Vig.playing && !BBH.R3Vig.cur && !document.body.classList.contains('vig-on'), null, ms || 60000);
const ONLY = process.env.VIG_ONLY || '', part = (k) => !ONLY || ONLY.split(',').indexOf(k) >= 0;

try {
  const { page, errs } = await env.newPage({ viewport: { width: 390, height: 844 }, init: SAMPLER });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  ok(await until(page, () => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.w, null, 150000), '3D boots to the title');
  ok(await page.evaluate(() => !!BBH.R3Vig && typeof BBH.R3Vig.play === 'function' && typeof BBH.G.vigBefore === 'function'), 'r3/vig.js installed: R3Vig.play, the bedtime hook');
  await seed(page, { day: 3, minutes: 13 * 60 - 360, hunger: 40, energy: 70, cash: 200, fans: 60 });
  await page.evaluate(() => BBH.Eng.go('place', { id: 'home' }));
  ok(await homeReady(page), 'the home world (flat) is up');
  const mod = await page.evaluate(() => Promise.all([BBH.R3Vig.load('flat'), BBH.R3Cine.load()]).then(([m]) => (m ? Object.keys(m.VIGNETTES) : null)));
  ok(Array.isArray(mod) && mod.length >= 25, 'the flat module loads lazily with its vignettes (' + (mod && mod.length) + ' ids)');
  await page.evaluate(() => { window.__BF.start(); window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('k3-toast')) window.__toasts.push(n.textContent.trim()); }).observe(document.getElementById('r3kit'), { childList: true, subtree: true }); });

  /* ------------------------------------------------------------------ RUNTIME: forms from the counter */
  if (part('runtime')) {
  const forms = await page.evaluate(() => {
    const V = BBH.R3Vig, E = BBH.Eng, out = {}, t0 = V.test; V.test = false; V.force = null; V.resetCounts(); E.settings.scenes = 'full';
    const set = (n, ago) => { const c = V.counts(); c['p1.eat.banana'] = { n, last: Date.now() - ago }; };
    out.first = V.form('p1.eat.banana'); set(1, 60000); out.full1 = V.form('p1.eat.banana'); set(4, 60000); out.full4 = V.form('p1.eat.banana'); set(5, 60000); out.short = V.form('p1.eat.banana');
    set(2, 5000); out.recent = V.form('p1.eat.banana'); set(2, 60000); E.settings.scenes = 'off'; out.off = V.form('p1.eat.banana'); E.settings.scenes = 'short'; out.setShort = V.form('p1.eat.banana');
    E.settings.scenes = 'full'; V.bump('p1.nap'); out.key = JSON.parse(localStorage.getItem('bbh:vig' + BBH.G.slot) || '{}')['p1.nap']; out.slot = BBH.G.slot;
    V.resetCounts(); out.cleared = V.count('p1.nap').n; V.test = t0; return out;
  });
  ok(forms.first === 'first' && forms.full1 === 'full' && forms.full4 === 'full' && forms.short === 'short', 'form by counter: FIRST, FULL (plays 2 to 5), then SHORT (' + JSON.stringify(forms) + ')');
  ok(forms.recent === 'micro' && forms.off === 'micro' && forms.setShort === 'short', 'a repeat inside 20 s and SCENES: OFF give MICRO, SCENES: SHORT gives SHORT');
  ok(forms.key && forms.key.n === 1 && forms.key.last > 0 && forms.cleared === 0, 'the counter lives in its own key bbh:vig' + forms.slot + ' ({ n, last })');

  // tap once: PAY now, the hand back 300 ms later; skip: at once
  const tap = await page.evaluate(async () => {
    const V = BBH.R3Vig, w = BBH.R3.world; V.force = 'first'; let paid = 0, paidAt = 0; const t0 = performance.now();
    const p = V.play('p1.eat.banana', { pay: () => { paid++; paidAt = performance.now() - t0; } });
    await new Promise((r) => { const iv = setInterval(() => { if (V.cur) { clearInterval(iv); r(); } }, 20); });
    await new Promise((r) => setTimeout(r, 300)); const before = paid; V.tap(); const after = paid; const info = await p;
    const s2 = performance.now(); const p2 = V.play('p1.couch.rest', { pay: () => { paid++; } }); await new Promise((r) => { const iv = setInterval(() => { if (V.cur) { clearInterval(iv); r(); } }, 20); }); V.skip(); const i2 = await p2;
    V.force = null; return { before, after, paid, info, i2, skipMs: performance.now() - s2, total: performance.now() - t0, ctl: w.controls.state().enabled };
  });
  ok(tap.before === 0 && tap.after === 1 && tap.info.ok && tap.info.form === 'first', 'tap: the reward lands on the tap (PAY), then the vignette hands back (' + JSON.stringify(tap.info) + ')');
  ok(tap.info.t < 3.5, 'tap: a FIRST eat scene ends within moments of the tap (' + tap.info.t + ' s)');
  ok(tap.i2.ok && tap.i2.skipped && tap.paid === 2, 'skip: hands back at once and still pays (' + JSON.stringify(tap.i2) + ')');
  ok(tap.ctl === true, 'controls are enabled again after tap and skip');

  // missing ids and modules fall back silently: no vignette, the payoff at once
  const miss = await page.evaluate(async () => {
    const V = BBH.R3Vig; let n = 0; const a = await V.play('p1.no.such.scene', { pay: () => n++ }); const m = await V.load('nosuchworld');
    const pre = BBH.G.ch.cash, r = BBH.G.do({ t: 'flag', k: 'vigtest' }); return { a, n, m, flag: BBH.G.ch.flags.vigtest, playing: V.playing, cash: BBH.G.ch.cash === pre, layer: !!document.querySelector('.cin') };
  });
  ok(!miss.a.ok && miss.a.error === 'missing' && miss.n === 1, 'a missing id: no vignette, PAY at once (' + JSON.stringify(miss.a) + ')');
  ok(miss.m === null && !miss.playing && !miss.layer, 'a world without a module (vig_nosuchworld.js) resolves to nothing, silently');
  ok(miss.flag === 1, 'actions with no vignette go straight through G.do');

  // the handback: the player back on its mark facing the spot, the camera back on the controls camera, nothing left behind
  const hb = await page.evaluate(async () => {
    const V = BBH.R3Vig, w = BBH.R3.world, c = w.controls, s0 = c.state(), cam = w.camera || w.ctx.camera; V.force = 'short';
    const info = await V.play('p1.stream', {}); V.force = null;
    await new Promise((r) => setTimeout(r, 600)); const s1 = c.state();
    const props = []; w.scene.traverse((o) => { if (o.name && /^vig_/.test(o.name)) props.push(o.name); });
    return { info, d: Math.hypot(s1.x - s0.x, s1.z - s0.z), dh: Math.abs(s1.heading - s0.heading), en: s1.enabled, camd: Math.hypot(cam.position.x - s1.cam.x, cam.position.y - s1.cam.y, cam.position.z - s1.cam.z), props, layer: !!document.querySelector('.cin'), chrome: document.body.classList.contains('vig-on'), gl: document.getElementById('gl').style.transform, ts: BBH.R3.host.timeScale };
  });
  ok(hb.info.ok && hb.info.form === 'short' && hb.info.errors === 0 && !hb.info.skipped, 'the stream plays out (' + JSON.stringify(hb.info) + ')');
  ok(hb.d < 0.05 && hb.dh < 0.05 && hb.en, 'handback: the player is back on its mark, same facing, controls on (' + hb.d.toFixed(3) + ' m)');
  ok(hb.camd < 0.25, 'handback: the camera is the controls camera again (' + hb.camd.toFixed(3) + ' m off)');
  ok(!hb.props.length && !hb.layer && !hb.chrome && !hb.gl && hb.ts === 1, 'handback: no props, no layer, no hidden chrome, no flip, time scale 1 (' + hb.props.join(',') + ')');

  // reduce motion: the speed ramp of quick practice is ignored, the reel still plays
  const rd = await page.evaluate(async () => {
    const V = BBH.R3Vig, E = BBH.Eng, was = E.settings.reduce; E.settings.reduce = true; V.force = 'full'; let maxTs = 1, red = null;
    V.onReel = (c) => { red = V.cur && V.cur.ctx.reduce; }; const iv = setInterval(() => { maxTs = Math.max(maxTs, BBH.R3.host.timeScale); }, 30);
    const info = await V.play('p1.train.quick', { action: { t: 'train', stat: 'tech', q: 0.4 } }); clearInterval(iv); E.settings.reduce = was; V.force = null; V.onReel = null;
    return { info, maxTs, red };
  });
  ok(rd.info.ok && rd.red === true && rd.maxTs === 1, 'reduce motion: the vignette plays without the speed ramp (' + JSON.stringify(rd) + ')');
  }

  /* ------------------------------------------------------------------ FLAT: every id, every form, plays and ends */
  if (part('flat')) {
  const all = await page.evaluate(async () => {
    const V = BBH.R3Vig, ids = Object.keys((await V.load('flat')).VIGNETTES), out = [], EV = ['oats', 'five', 'drums', 'rain', 'streamed', 'mum', 'dream', 'pipes', null];
    for (const id of ids) {
      for (const form of ['micro', 'short', 'full', 'first']) {
        const o = { form, pay: () => { o.paid = (o.paid || 0) + 1; } }; let len = null;
        if (id === 'p1.wake') { o.morning = { t: 'morning', day: 4, name: 'Thursday', lines: ['You slept well.'], cause: 'sleep', event: EV[out.length % EV.length] }; o.anyScene = true; }
        if (id === 'p1.wardrobe') o.extra = { slot: 'hat' };
        if (id === 'p1.train.quick') o.action = { t: 'train', stat: 'mus', q: 0.4 };
        V.onReel = (c) => { c.seek(40); len = c.state().real; };
        const info = await V.play(id, o);
        out.push({ id, form, ok: info.ok, err: info.errors, len, paid: o.paid || 0, e: info.error });
      }
    }
    V.onReel = null; if (V.kept) { V.kept.scr.dispose(); V.kept = null; } return out;
  });
  const bad = all.filter((r) => !r.ok || r.err || r.paid !== 1);
  ok(all.length >= 100 && !bad.length, 'every flat vignette plays and ends in every form, pays once, no cue errors (' + all.length + ' plays' + (bad.length ? ', bad: ' + JSON.stringify(bad.slice(0, 4)) : '') + ')');
  const slowMicro = all.filter((r) => r.form === 'micro' && !(r.len > 0 && r.len < 1.5));
  ok(!slowMicro.length, 'every MICRO form is under 1.5 s' + (slowMicro.length ? ': ' + JSON.stringify(slowMicro.slice(0, 4)) : ''));
  const firsts = all.filter((r) => r.form === 'first'), longF = firsts.filter((r) => r.len > 12);
  ok(!longF.length, 'every FIRST form stays under 12 s' + (longF.length ? ': ' + JSON.stringify(longF) : ''));
  const ids = [...new Set(all.map((r) => r.id))];
  for (const need of ['p1.eat.banana', 'p1.eat.oats', 'p1.eat.dates', 'p1.eat.bowl', 'p1.eat.smoothie', 'p1.eat.tea', 'p1.nap', 'p1.sleep', 'p1.wake', 'p1.couch.rest', 'p1.stream', 'p1.train.quick', 'p1.train.idle.mus', 'p1.beatmaker.in', 'p1.record.in', 'p1.wardrobe', 'p1.wait', 'p1.refuse.cash'])
    ok(ids.indexOf(need) >= 0, 'the flat has ' + need);
  ok(await vigOver(page), 'nothing is left playing after the sweep');
  }

  /* ------------------------------------------------------------------ GAME: the real paths */
  if (part('game')) {
  // eating from the kitchen menu: Core at once, the toast on PAY, the sheet still there afterwards
  await page.evaluate(() => { BBH.R3Vig.force = 'short'; BBH.R3Vig.resetCounts(); const ch = BBH.Core.clone(BBH.G.ch); ch.hunger = 30; BBH.G.setChar(ch); BBH.R3.world.activate('kitchen'); });
  await until(page, () => !!document.querySelector('#ui .sheet .scroll .btn'), null, 30000);
  const eat = await page.evaluate(() => {
    window.__toasts.length = 0; const cash0 = BBH.G.ch.cash; const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')][0]; b.click();
    return { cash0, cash1: BBH.G.ch.cash, playing: BBH.R3Vig.playing, toastNow: window.__toasts.length };
  });
  ok(eat.cash1 < eat.cash0 && eat.playing === 'p1.eat.banana', 'eating: Core applies at once and the banana vignette plays (' + JSON.stringify(eat) + ')');
  ok(eat.toastNow === 0 && await until(page, () => document.body.classList.contains('vig-on') && BBH.R3Vig.cur, null, 30000) && await page.evaluate(() => !window.__toasts.some((t) => /hunger/i.test(t)) || BBH.R3Vig.cur === null), 'eating: the toast waits for PAY, the menu and HUD step aside');
  ok(await vigOver(page), 'eating: the vignette ends');
  ok(await page.evaluate(() => window.__toasts.some((t) => /hunger/i.test(t)) && !!document.querySelector('#ui .sheet') && getComputedStyle(document.getElementById('stage')).visibility !== 'hidden'), 'eating: the toast landed and the kitchen menu is back');
  await page.evaluate(() => { const x = [...document.querySelectorAll('#ui .sheet .btn')].find((b) => b.textContent.trim() === 'X'); if (x) x.click(); });
  await sleep(500);
  // a refusal: the MICRO scene, then the toast
  const ref = await page.evaluate(async () => { BBH.R3Vig.force = null; BBH.R3Vig.test = true; window.__toasts.length = 0; BBH.Eng.toast('Too early to sleep. Try a nap (or wait until 20:00).', 'warn'); const p = BBH.R3Vig.playing, early = window.__toasts.length; for (let i = 0; i < 300 && BBH.R3Vig.playing; i++) await new Promise((r) => setTimeout(r, 100)); return { p, early, last: BBH.R3Vig.last, toast: window.__toasts.some((t) => /Too early/.test(t)) }; });
  ok(ref.p === 'p1.refuse.sleep' && ref.early === 0 && ref.last && ref.last.id === 'p1.refuse.sleep' && ref.last.ok && ref.last.form === 'micro' && ref.toast, 'a refusal toast plays its MICRO scene first, then the toast (' + JSON.stringify(ref) + ')');
  // bedtime: the SLEEP row plays the bedtime scene, the morning plays the wake up, then the morning card
  await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.minutes = 21 * 60 - 360; BBH.G.setChar(ch); BBH.R3Vig.force = 'micro'; BBH.R3Vig.log.length = 0; BBH.R3.world.activate('bed'); });
  await until(page, () => [...document.querySelectorAll('#ui .sheet .btn')].some((x) => /^SLEEP/.test(x.textContent.trim())), null, 30000);
  const day0 = await page.evaluate(() => { const d = BBH.G.ch.day; [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /^SLEEP/.test(x.textContent.trim())).click(); return d; });
  ok(await until(page, () => BBH.R3Vig.playing === 'p1.sleep' || BBH.R3Vig.log.some((l) => /^p1\.sleep/.test(l)), null, 30000), 'SLEEP: the bedtime vignette plays first');
  ok(await until(page, () => !!document.querySelector('#ui .full') && /NEW DAY|PASSED OUT/.test(document.getElementById('ui').innerText), null, 150000), 'SLEEP: then the morning card');
  const mo = await page.evaluate((d) => ({ day: BBH.G.ch.day, log: BBH.R3Vig.log.slice() }), day0);
  ok(mo.day === day0 + 1 && mo.log.some((l) => /^p1\.sleep/.test(l)) && mo.log.some((l) => /^p1\.wake/.test(l)), 'SLEEP: the day rolled over, bedtime and the wake up both played (' + mo.log.join(',') + ')');
  await page.evaluate(() => { const c = document.querySelector('#ui .full'); if (c) c.click(); });
  ok(await until(page, () => !!document.querySelector('#hud3 .h3') && BBH.R3.world.controls.state().enabled && !document.querySelector('.cin'), null, 30000), 'tap to start the day: the HUD and the controls are back, no layer left');
  // the wardrobe: the intro, then the creator scene
  await page.evaluate(() => { BBH.R3Vig.force = 'short'; BBH.R3Vig.log.length = 0; BBH.R3.world.activate('wardrobe'); });
  ok(await until(page, () => BBH.Eng.sceneName === 'creator', null, 60000) && await page.evaluate(() => BBH.R3Vig.log.some((l) => /^p1\.wardrobe\.in/.test(l))), 'the wardrobe: its intro plays, then the creator opens');
  await page.evaluate(() => { BBH.R3Vig.force = null; BBH.R3Vig.wardrobeFrom = null; BBH.Eng.go('place', { id: 'home' }); });
  ok(await homeReady(page), 'back home');
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
    await seed(p2, { day: 3, minutes: 13 * 60 - 360, hunger: 30 });
    await p2.evaluate(() => BBH.Eng.go('place', { id: 'home' })); await sleep(800);
    const r2 = await p2.evaluate(() => { BBH.Eng.scene.activate('kitchen'); const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /BANANA/.test(x.textContent)); const c0 = BBH.G.ch.cash; if (b) b.click(); return { on: BBH.R3Vig ? BBH.R3Vig.enabled() : false, playing: BBH.R3Vig && BBH.R3Vig.playing, paid: BBH.G.ch.cash < c0, layer: !!document.querySelector('.cin') }; });
    ok(!r2.on && !r2.playing && r2.paid && !r2.layer, '2D: eating is instant, no vignette layer (' + JSON.stringify(r2) + ')');
    ok(e2.filter((e) => !/favicon/.test(e)).length === 0, '2D: no console errors');
    await p2.context().close();
  }
} catch (e) { ok(false, 'r3vig threw: ' + (e && e.stack || e)); }
await env.stop(); clearTimeout(watchdog);
done('beatbox_heroes_r3vig');
