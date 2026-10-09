// r3 VIGNETTE gate: THE P3 DELIGHTS (park3d/vig_delights.js and the DELIGHTS section of r3/vig.js).
// The REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader, phone viewport 390x844).
//   TABLE:  the delights load lazily as the last link of every world's table (world -> milestones -> delights): V.has reaches them, a world's own keys stay its own.
//   SWEEP:  every id x 4 forms (FIRST, FULL, SHORT, MICRO) plays and ends in its world, pays exactly once, no cue errors; MICRO under 1.5 s, FIRST under 12 s; nothing left behind,
//           the hero back on the mark with the controls on.
//   RULES:  SCENES: OFF means none; never on top of a vignette, a story film or a waiting milestone; never while the hero moves or right after a touch; the gap between two
//           delights; rarity (a chance rolled once per idle stretch, once a day, once a save, once per 30 game minutes); a real idle growl plays by itself and hands back;
//           a touch or a key cuts a delight at once and the controls are back.
//   No black frames, no console errors.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, until, sleep } from './beatbox_heroes_r3gamelib.mjs';
import { SAMPLER } from '../tools/beatbox_heroes/blackframes.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3vig_p3 suite hung'); process.exit(1); }, 1800000);
const env = await r3env('beatbox_heroes_r3vig_p3');
const ready = (page, id, wid) => until(page, ([id, w]) => { const E = BBH.Eng, sc = E.scene; return E.sceneName === 'place' && sc && sc.is3d && !E.pendingSwitch && E.sceneArgs.id === id && BBH.R3.world && BBH.R3.world.id === w && sc.w === BBH.R3.world && sc.t > 0; }, [id, wid], 150000);
const go = async (page, id, wid) => { await page.evaluate((id) => BBH.Eng.go('place', { id }), id); const r = await ready(page, id, wid); if (r) await page.evaluate(() => Promise.all([BBH.R3Vig.ms.load(BBH.R3.world.id), BBH.R3Vig.dl.load()])); await sleep(500); return r; };
const vigOver = (page, ms) => until(page, () => !BBH.R3Vig.playing && !BBH.R3Vig.cur && !BBH.R3Vig.dl.busy && !document.body.classList.contains('vig-on'), null, ms || 150000);
const SAVE = { day: 4, minutes: 13 * 60 - 360, hunger: 80, energy: 95, maxEnergy: 100, mood: 60, cash: 140, fans: 90, flags: { bmgSighted: 1, bmgMet: 2, pigpenJam: 2, famousJam: 2, rhythmTip: 1 } };
const patch = (page, p) => page.evaluate((p) => { const ch = BBH.Core.clone(BBH.G.ch); Object.assign(ch, p); BBH.G.setChar(ch); }, p);
// the delights engine held still (no automatic fire), the idle stretch set to `idle` seconds, the gap open
const hush = (page) => page.evaluate(() => { const D = BBH.R3Vig.dl; D.on = true; D.gap = 1e12; D.st.last = Date.now(); D.rng = Math.random; });
const idleFor = (page, s) => page.evaluate((s) => { const D = BBH.R3Vig.dl, t = Date.now() - s * 1000; D.st.input = t; D.st.move = t; D.st.quiet = t; D.st.rolled = {}; }, s);
const check = (page, o) => page.evaluate((o) => { const h = BBH.R3Vig.dl.check(Date.now(), o || { force: true }); return h ? h.r.id : null; }, o || null);
const leftovers = (page) => page.evaluate(() => {
  const w = BBH.R3.world, props = [], extras = []; w.scene.traverse((o) => { if (o.name && /^vig_/.test(o.name)) props.push(o.name); if (o.userData && o.userData.cineSpawn) extras.push(o.name || 'spawn'); });
  const pb = w.ctx && w.ctx.passersby, hidden = pb ? pb.walkers.filter((x) => !x.c.object.visible).length : 0;
  return { props, extras, hidden, layer: !!document.querySelector('.cin'), chrome: document.body.classList.contains('vig-on'), ts: BBH.R3.host.timeScale };
});
const sweep = (page, ids, extra) => page.evaluate(async ([ids, extra]) => {
  const V = BBH.R3Vig, out = [];
  for (const id of ids) for (const form of ['micro', 'short', 'full', 'first']) {
    const o = { form, extra: extra || {}, pay: () => { o.paid = (o.paid || 0) + 1; } }; let len = null;
    V.onReel = (c) => { c.seek(40); len = c.state().real; };
    const info = await V.play(id, o);
    out.push({ id, form, ok: info.ok, err: info.errors, len, paid: o.paid || 0, e: info.error });
  }
  V.onReel = null; return out;
}, [ids, extra || null]);
const judge = (all, what) => {
  const bad = all.filter((r) => !r.ok || r.err || r.paid !== 1);
  ok(all.length >= 4 && !bad.length, what + ': every delight plays and ends in every form, pays once, no cue errors (' + all.length + ' plays' + (bad.length ? ', bad: ' + JSON.stringify(bad.slice(0, 4)) : '') + ')');
  const slow = all.filter((r) => r.form === 'micro' && !(r.len > 0 && r.len < 1.5));
  ok(!slow.length, what + ': every MICRO is under 1.5 s' + (slow.length ? ': ' + JSON.stringify(slow.slice(0, 4)) : ''));
  const longF = all.filter((r) => r.form === 'first' && r.len > 12);
  ok(!longF.length, what + ': every FIRST stays under 12 s' + (longF.length ? ': ' + JSON.stringify(longF) : ''));
};
const clean = async (page, what) => {
  await sleep(500); const lo = await leftovers(page);
  ok(!lo.props.length && !lo.extras.length && !lo.hidden && !lo.layer && !lo.chrome && lo.ts === 1, what + ': nothing left behind (' + JSON.stringify(lo) + ')');
  const c = await page.evaluate(() => BBH.R3.world.controls.state().enabled); ok(c, what + ': the controls are on');
};

try {
  const { page, errs } = await env.newPage({ viewport: { width: 390, height: 844 }, init: SAMPLER });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  ok(await until(page, () => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.w, null, 150000), '3D boots to the title');
  await seed(page, SAVE);
  ok(await go(page, 'home', 'flat'), 'the flat is up');
  await page.evaluate(() => window.__BF.start());

  /* ------------------------------------------------------------------ TABLE */
  const tab = await page.evaluate(() => BBH.R3Vig.dl.load().then((m) => ({ ids: m ? Object.keys(m.VIGNETTES) : [], home: m ? m.HOME : {}, flatKeys: Object.keys(BBH.R3Vig.mods.flat.m.VIGNETTES), has: BBH.R3Vig.has('p3.growl', 'flat') && BBH.R3Vig.has('p2.levelup', 'flat'), rules: BBH.R3Vig.dl.RULES.map((r) => r.id) })));
  ok(tab.ids.length >= 12, 'vig_delights.js loads lazily (' + tab.ids.length + ' ids)');
  ok(tab.has && !tab.flatKeys.some((k) => /^p3\.(?!jukebox)/.test(k)), 'the flat reaches the delights (and still the milestones) through its table, its own keys stay its own');
  ok(tab.ids.every((k) => tab.rules.indexOf(k) >= 0), 'every delight has a trigger rule');
  const ANY = tab.ids.filter((k) => !tab.home[k]), IN = (w) => tab.ids.filter((k) => tab.home[k] === w);

  /* ------------------------------------------------------------------ SWEEP */
  const st0 = await page.evaluate(() => { const s = BBH.R3.world.controls.state(); return { x: s.x, z: s.z }; });
  judge(await sweep(page, ANY.concat(IN('flat'))), 'FLAT');
  judge(await sweep(page, ['p3.idle.flat', 'p3.idle.beat'], { v: 1, part: 3 }), 'FLAT variants');
  ok(await vigOver(page), 'nothing playing after the flat sweep');
  await clean(page, 'the flat after the sweep');
  const st1 = await page.evaluate(() => { const s = BBH.R3.world.controls.state(); return { x: s.x, z: s.z }; });
  ok(Math.hypot(st1.x - st0.x, st1.z - st0.z) < 0.05, 'the hero is back on the mark');
  const wrong = await page.evaluate(() => BBH.R3Vig.play('p3.closing.bar', { form: 'full' }));
  ok(!wrong.ok && wrong.error === 'empty', 'a delight of another world plays nothing here (' + JSON.stringify(wrong) + ')');
  ok(await go(page, 'park', 'park'), 'the park is up');
  judge(await sweep(page, IN('park').concat(['p3.growl', 'p3.idle.beat'])), 'PARK');
  ok(await vigOver(page), 'nothing playing after the park sweep');
  await clean(page, 'the park after the sweep');
  await patch(page, { minutes: 21 * 60 - 360 });
  ok(await go(page, 'bar', 'bar'), 'the bar is up');
  judge(await sweep(page, IN('bar').concat(['p3.late.warning', 'p3.yawn'])), 'BAR');
  ok(await vigOver(page), 'nothing playing after the bar sweep');
  await clean(page, 'the bar after the sweep');

  /* ------------------------------------------------------------------ RULES */
  await patch(page, { minutes: 13 * 60 - 360, day: 4, hunger: 80, energy: 95 });
  ok(await go(page, 'home', 'flat'), 'back home for the rules');
  await page.evaluate(() => { BBH.R3Vig.force = null; BBH.R3Vig.resetCounts(); BBH.R3Vig.dl.log.length = 0; });
  await hush(page);
  // rarity: nothing due, the chances lost -> nothing; the chances won -> the time of day idle at home, once per part of the day
  await idleFor(page, 60); await page.evaluate(() => { BBH.R3Vig.dl.rng = () => 0.99; });
  ok(await check(page) === null, 'RARITY: a long idle with every chance lost plays nothing');
  await idleFor(page, 60); await page.evaluate(() => { BBH.R3Vig.dl.rng = () => 0; });
  ok(await check(page) === 'p3.idle.flat', 'RARITY: the chance won, a long idle at home is p3.idle.flat');
  await page.evaluate(() => { const D = BBH.R3Vig.dl; D.st.rolled = {}; const r = D.RULES.find((x) => x.id === 'p3.idle.flat'); r.fire({ ch: BBH.G.ch, h: 13 }); });
  ok(await check(page) === 'p3.idle.beat', 'RARITY: the same part of the day never gets p3.idle.flat twice, the idle beat is next');
  await page.evaluate(() => { BBH.R3Vig.dl.st.rolled = {}; BBH.R3Vig.dl.rng = () => 0.99; });
  ok(await check(page) === null, 'RARITY: the chance is rolled once per idle stretch (a lost roll stays lost)');
  await idleFor(page, 3); await page.evaluate(() => { BBH.R3Vig.dl.rng = () => 0; });
  ok(await check(page) === null, 'IDLE: 3 s of stillness is too short for the idle moments');
  await page.evaluate(() => { BBH.R3Vig.dl.st.move = Date.now(); });
  ok(await check(page) === null, 'MOVING: the hero walking never gets a delight');
  // the gap
  await idleFor(page, 60);
  ok(await check(page, {}) === null && await check(page) !== null, 'GAP: a delight a moment ago blocks the next one (the gap), forced it is there');
  // once a save (week one), once a day (Saturday), once per 30 game minutes (hunger)
  await page.evaluate(() => { BBH.R3Vig.dl.rng = () => 0.99; });
  await patch(page, { day: 8, minutes: 9 * 60 - 360 }); await idleFor(page, 5);
  ok(await check(page) === 'p3.week.one', 'CALLBACK: day 8 at home is p3.week.one');
  await page.evaluate(() => BBH.R3Vig.bump('p3.week.one'));
  ok(await check(page) !== 'p3.week.one', 'CALLBACK: once a save');
  await patch(page, { day: 12, minutes: 9 * 60 - 360 }); await idleFor(page, 5);
  ok(await check(page) === 'p3.weekend', 'WEEKEND: Saturday morning at home is p3.weekend (' + await page.evaluate(() => BBH.Core.dayName(BBH.G.ch.day)) + ')');
  await page.evaluate(() => { const D = BBH.R3Vig.dl, cs = BBH.R3Vig.counts(); cs['p3.weekend'] = { n: 1, last: 0, day: BBH.G.ch.day }; void D; });
  ok(await check(page) !== 'p3.weekend', 'WEEKEND: once a day');
  await patch(page, { day: 5, minutes: 13 * 60 - 360, hunger: 10 }); await idleFor(page, 5);
  ok(await check(page) === 'p3.growl', 'HUNGER: hunger under 22 and a still hero is p3.growl');
  await page.evaluate(() => { const cs = BBH.R3Vig.counts(); cs['p3.growl'] = { n: 1, last: 0, gm: BBH.G.ch.day * 1440 + BBH.G.ch.minutes - 10 }; });
  ok(await check(page) !== 'p3.growl', 'HUNGER: not again within 30 game minutes');
  await page.evaluate(() => { BBH.R3Vig.counts()['p3.growl'].gm -= 40; });
  ok(await check(page) === 'p3.growl', 'HUNGER: again after 30 game minutes');

  // SCENES: OFF -> none at all; a vignette playing, a milestone waiting -> none
  await page.evaluate(() => { BBH.Eng.settings.scenes = 'off'; });
  ok(await check(page) === null && await page.evaluate(() => BBH.R3Vig.dl.blocked()) === 'scenes off', 'SCENES OFF: no delight');
  await page.evaluate(() => { BBH.Eng.settings.scenes = 'full'; BBH.R3Vig.force = 'first'; window.__lv = BBH.R3Vig.play('p2.levelup', { extra: { level: 5 } }); });
  ok(await until(page, () => !!BBH.R3Vig.cur, null, 30000), 'a milestone scene plays');
  ok(await check(page) === null && await page.evaluate(() => BBH.R3Vig.dl.blocked()) === 'not quiet', 'VIGNETTE: never on top of a playing scene');
  await page.evaluate(() => { BBH.R3Vig.skip(); BBH.R3Vig.force = null; });
  ok(await vigOver(page), 'the milestone scene is over');
  await page.evaluate(() => BBH.R3Vig.ms.add({ kind: 'solo', id: 'p2.ladder', home: 'bar', held: [], items: [] }));
  ok(await check(page) === null && await page.evaluate(() => BBH.R3Vig.dl.blocked()) === 'milestone waiting', 'MILESTONE: a milestone waiting wins');
  await page.evaluate(() => { BBH.R3Vig.ms.q.length = 0; });
  const film = await page.evaluate(() => { const G = BBH.G, q0 = G.storyQ; G.storyQ = [{ id: 'probe' }]; const h = BBH.R3Vig.dl.check(Date.now(), { force: true }), b = BBH.R3Vig.dl.blocked(); G.storyQ = q0; return { h: !!h, b }; });
  ok(!film.h && film.b === 'not quiet', 'FILM: a story film waiting (or playing) wins (' + JSON.stringify(film) + ')');

  // the real thing: a hungry hero stands still, the growl plays by itself and hands back; then nothing for the gap
  await page.evaluate(() => { const D = BBH.R3Vig.dl; BBH.R3Vig.resetCounts(); D.gap = 150000; D.st.last = 0; D.log.length = 0; D.rng = () => 0.99; const t = Date.now() - 2000; D.st.input = t; D.st.move = t; });
  ok(await until(page, () => BBH.R3Vig.dl.log.length > 0, null, 30000), 'AUTO: the delight plays by itself after the idle (' + await page.evaluate(() => BBH.R3Vig.dl.log.join(',')) + ')');
  ok(await vigOver(page), 'AUTO: over');
  const lg = await page.evaluate(() => BBH.R3Vig.dl.log.slice());
  ok(lg.length === 1 && /^p3\.growl:/.test(lg[0]), 'AUTO: it was p3.growl (' + lg.join(',') + ')');
  await sleep(3000);
  ok(await page.evaluate(() => BBH.R3Vig.dl.log.length) === 1, 'AUTO: nothing more inside the gap');
  await clean(page, 'the flat after the automatic growl');

  // a touch cuts a staged delight at once, the controls are back in the same moment
  await page.evaluate(() => { BBH.R3Vig.force = 'full'; BBH.R3Vig.dl.st.last = 0; BBH.R3Vig.dl.gap = 1e12; });
  await idleFor(page, 60); await page.evaluate(() => { BBH.R3Vig.dl.rng = () => 0; });
  await page.evaluate(() => { const h = BBH.R3Vig.dl.check(Date.now(), { force: true }); window.__dp = BBH.R3Vig.dl.fire(h).then((i) => { window.__di = i; }); });
  ok(await until(page, () => BBH.R3Vig.cur && BBH.R3Vig.cur.dl && BBH.R3Vig.cur.cine.state().real > 0.5, null, 30000), 'TOUCH: a staged delight is playing');
  const pe = await page.evaluate(() => BBH.R3Vig.cur.scr.root.style.pointerEvents);
  ok(pe === 'none', 'TOUCH: its screen lets the touches through to the game');
  const cut = await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); return { cur: !!(BBH.R3Vig.cur && BBH.R3Vig.cur.cine && !BBH.R3Vig.cur.cine.done), ctl: BBH.R3.world.controls.state().enabled }; });
  ok(!cut.cur && cut.ctl, 'TOUCH: a key cuts it at once and the controls are on in the same event (' + JSON.stringify(cut) + ')');
  ok(await until(page, () => window.__di, null, 20000) && await page.evaluate(() => window.__di.ok && window.__di.skipped), 'TOUCH: the delight ended skipped');
  await page.evaluate(() => { BBH.R3Vig.force = null; BBH.R3Vig.dl.on = false; });
  ok(await vigOver(page), 'TOUCH: over');
  await clean(page, 'the flat after the cut');

  const dk = await page.evaluate(() => (window.__BF ? window.__BF.dark.slice() : []));
  ok(dk.length === 0, 'no uncovered black or flat dark frame' + (dk.length ? ': ' + JSON.stringify(dk.slice(0, 3)) : ''));
  const real = errs.filter((e) => !/favicon/.test(e));
  ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real.slice(0, 4).join(' | ') : ''));
  await page.context().close();
} catch (e) { ok(false, 'r3vig_p3 threw: ' + (e && e.stack || e)); }
await env.stop(); clearTimeout(watchdog);
done('beatbox_heroes_r3vig_p3');
