// r3 VIGNETTE gate: THE P2 MILESTONES (park3d/vig_milestones.js and the MILESTONES section of r3/vig.js) and the polish of the home shots and the busk sighting.
// The REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader, phone viewport 390x844).
//   TABLE:  the milestone ids load lazily as the shared base of every world's table: a world reaches them (V.has), its own Object.keys stay its own ids.
//   SWEEP:  every new id x 4 forms (FIRST, FULL, SHORT, MICRO) plays and ends, pays exactly once, no cue errors; MICRO under 1.5 s, FIRST under 12 s; the anywhere scenes in the flat
//           and in the park, the home scenes in the flat, the crew and the ladder in the bar; nothing is left behind (no vig_ props, no spawned extras, the hero on the mark).
//   QUEUE:  a progress fx waits for the place to be quiet and plays after the action's own vignette (a real first stream with a level up: p2.first.stream, then p2.levelup);
//           a BURST (a level, a sound, a trophy, two unlocks in one G.play) collapses into ONE scene (p2.beats), its banners land once (MICRO) or not at all (a staged form);
//           a level with only an unlock riding along stays p2.levelup and the unlock still gets its banner; the save watch (25 fans), Sunday's rent after the morning card.
//   FILMS:  a milestone never plays on top of a story film (it waits, then plays once the film is over); a beat a film covers is dropped to its old banner.
//   POLISH: p1.sleep, p1.nap, p1.wardrobe, p1.wake still play in every form; the busk sighting film plays, nobody walks next to BeeAmGee, every walker is back afterwards.
//   No black frames, no console errors.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, until, sleep } from './beatbox_heroes_r3gamelib.mjs';
import { SAMPLER } from '../tools/beatbox_heroes/blackframes.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3vig_p2 suite hung'); process.exit(1); }, 2700000);
const env = await r3env('beatbox_heroes_r3vig_p2');
const ONLY = process.env.VIG_ONLY || '', part = (k) => !ONLY || ONLY.split(',').indexOf(k) >= 0;
const ready = (page, id, wid) => until(page, ([id, w]) => { const E = BBH.Eng, sc = E.scene; return E.sceneName === 'place' && sc && sc.is3d && !E.pendingSwitch && E.sceneArgs.id === id && BBH.R3.world && BBH.R3.world.id === w && sc.w === BBH.R3.world && sc.t > 0; }, [id, wid], 150000);
const go = async (page, id, wid) => { await page.evaluate((id) => BBH.Eng.go('place', { id }), id); const r = await ready(page, id, wid); if (r) await page.evaluate(() => BBH.R3Vig.ms.load(BBH.R3.world.id)); await sleep(500); return r; };
const vigOver = (page, ms) => until(page, () => !BBH.R3Vig.playing && !BBH.R3Vig.cur && !document.body.classList.contains('vig-on'), null, ms || 150000);
const msIdle = (page, ms) => until(page, () => !BBH.R3Vig.ms.q.length && !BBH.R3Vig.ms.busy && !BBH.R3Vig.playing, null, ms || 150000);
const resetVig = (page, force) => page.evaluate((f) => { const V = BBH.R3Vig; V.force = f; V.log.length = 0; V.ms.log.length = 0; V.ms.q.length = 0; V.resetCounts(); }, force === undefined ? null : force);
const SAVE = { day: 4, minutes: 13 * 60 - 360, hunger: 80, energy: 95, maxEnergy: 100, mood: 60, cash: 140, fans: 90, flags: { bmgSighted: 1, bmgMet: 2, pigpenJam: 2, famousJam: 2, rhythmTip: 1 } };
const leftovers = (page) => page.evaluate(() => {
  const w = BBH.R3.world, props = [], extras = []; w.scene.traverse((o) => { if (o.name && /^vig_/.test(o.name)) props.push(o.name); if (o.userData && o.userData.cineSpawn) extras.push(o.name || 'spawn'); });
  const pb = w.ctx && w.ctx.passersby, hidden = pb ? pb.walkers.filter((x) => !x.c.object.visible).length : 0;
  return { props, extras, hidden, layer: !!document.querySelector('.cin'), chrome: document.body.classList.contains('vig-on'), ts: BBH.R3.host.timeScale, gl: (document.getElementById('gl') || {}).style ? document.getElementById('gl').style.transform || '' : '' };
});
// every id x 4 forms: plays, ends, pays once (seek to the end inside the reel: simulation only)
const sweep = (page, ids, extra) => page.evaluate(async ([ids, extra]) => {
  const V = BBH.R3Vig, out = [];
  for (const id of ids) {
    for (const form of ['micro', 'short', 'full', 'first']) {
      const o = { form, anyScene: true, extra: extra || {}, pay: () => { o.paid = (o.paid || 0) + 1; } }; let len = null;
      V.onReel = (c) => { c.seek(40); len = c.state().real; };
      const info = await V.play(id, o);
      out.push({ id, form, ok: info.ok, err: info.errors, len, paid: o.paid || 0, e: info.error });
    }
  }
  V.onReel = null; return out;
}, [ids, extra || null]);
const judge = (all, what) => {
  const bad = all.filter((r) => !r.ok || r.err || r.paid !== 1);
  ok(all.length >= 4 && !bad.length, what + ': every milestone plays and ends in every form, pays once, no cue errors (' + all.length + ' plays' + (bad.length ? ', bad: ' + JSON.stringify(bad.slice(0, 4)) : '') + ')');
  const slow = all.filter((r) => r.form === 'micro' && !(r.len > 0 && r.len < 1.5));
  ok(!slow.length, what + ': every MICRO is under 1.5 s' + (slow.length ? ': ' + JSON.stringify(slow.slice(0, 4)) : ''));
  const longF = all.filter((r) => r.form === 'first' && r.len > 12);
  ok(!longF.length, what + ': every FIRST stays under 12 s' + (longF.length ? ': ' + JSON.stringify(longF) : ''));
};
const clean = async (page, what) => { await sleep(500); const lo = await leftovers(page); ok(!lo.props.length && !lo.extras.length && !lo.hidden && !lo.layer && !lo.chrome && lo.ts === 1 && !lo.gl, what + ': nothing left behind (' + JSON.stringify(lo) + ')'); };

try {
  const { page, errs } = await env.newPage({ viewport: { width: 390, height: 844 }, init: SAMPLER });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  ok(await until(page, () => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.w, null, 150000), '3D boots to the title');
  await seed(page, SAVE);
  ok(await go(page, 'home', 'flat'), 'the flat is up');
  await page.evaluate(() => { window.__BF.start(); window.__ban = []; const b0 = BBH.Eng.banner; BBH.Eng.banner = function (k, t) { window.__ban.push(k + ':' + t); return b0.apply(this, arguments); }; });

  /* ------------------------------------------------------------------ TABLE */
  const tab = await page.evaluate(() => BBH.R3Vig.ms.load('flat').then((m) => ({ ids: m ? Object.keys(m.VIGNETTES) : [], sounds: m ? m.SOUND_IDS : [], crew: m ? m.CREW_IDS : [], home: m ? m.HOME : {}, flatKeys: Object.keys(BBH.R3Vig.mods.flat.m.VIGNETTES), has: BBH.R3Vig.has('p2.levelup', 'flat') && BBH.R3Vig.has('p2.rent.paid', 'flat') })));
  ok(tab.ids.length >= 30, 'vig_milestones.js loads lazily with its milestones (' + tab.ids.length + ' ids)');
  for (const need of ['p2.levelup', 'p2.ach', 'p2.unlock.cosmetic', 'p2.beats', 'p2.fans.25', 'p2.fans.100', 'p2.fans.500', 'p2.fans.2000', 'p2.money.100', 'p2.money.500', 'p2.broke', 'p2.rent.paid', 'p2.rent.short', 'p2.first.stream', 'p2.release', 'p2.ladder', 'p2.sound.RIM', 'p2.sound.LR', 'p2.crew.jaxx', 'p2.crew.miro'])
    ok(tab.ids.indexOf(need) >= 0, 'the milestones have ' + need);
  ok(tab.has && !tab.flatKeys.some((k) => /^p2\./.test(k)), 'the flat reaches the milestones through its table, its own keys stay its own (' + tab.flatKeys.length + ' keys)');
  const ANY = tab.ids.filter((k) => !tab.home[k]), FLAT = tab.ids.filter((k) => tab.home[k] === 'flat'), BAR = tab.ids.filter((k) => tab.home[k] === 'bar');
  ok(ANY.length >= 20 && FLAT.length === 4 && BAR.length === 6, 'anywhere ' + ANY.length + ', home ' + FLAT.length + ', bar ' + BAR.length);

  /* ------------------------------------------------------------------ SWEEP */
  if (part('sweep')) {
    const st0 = await page.evaluate(() => { const s = BBH.R3.world.controls.state(); return { x: s.x, z: s.z }; });
    const items = [{ k: 'levelup', level: 6 }, { k: 'sound', id: 'RIM', name: 'Rimshot' }, { k: 'ach', id: 'firstbusk', name: 'Street Debut', desc: 'Busk in the park.' }, { k: 'unlock', name: 'Fedora', group: 'hat' }];
    judge(await sweep(page, ANY.concat(FLAT), { items, level: 10 }), 'FLAT');
    ok(await vigOver(page), 'nothing playing after the flat sweep');
    await clean(page, 'the flat after the sweep');
    const st1 = await page.evaluate(() => { const s = BBH.R3.world.controls.state(); return { x: s.x, z: s.z, en: s.enabled }; });
    ok(Math.hypot(st1.x - st0.x, st1.z - st0.z) < 0.05 && st1.en, 'the hero is back on the mark with the controls on');
    ok(await go(page, 'park', 'park'), 'the park is up');
    judge(await sweep(page, ['p2.levelup', 'p2.beats', 'p2.fans.25', 'p2.fans.100', 'p2.fans.500', 'p2.fans.2000', 'p2.sound.LR', 'p2.broke'], { items }), 'PARK');
    ok(await vigOver(page), 'nothing playing after the park sweep');
    await clean(page, 'the park after the sweep');
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.day = 6; ch.minutes = 20 * 60 - 360; ch.beat = { tick: 4, moe: 5 }; BBH.G.setChar(ch); });
    ok(await go(page, 'bar', 'bar'), 'the bar is up');
    judge(await sweep(page, BAR, { opp: 'moe' }), 'BAR');
    ok(await vigOver(page), 'nothing playing after the bar sweep');
    await clean(page, 'the bar after the sweep');
    ok(await go(page, 'home', 'flat'), 'back home');
  }

  /* ------------------------------------------------------------------ QUEUE */
  if (part('queue')) {
    // a real action: the first stream with a level up in it (the stream's own vignette is p2.first.stream, the level waits for it)
    await resetVig(page, 'micro');
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.n.streams = 0; delete ch.flags.streamDay; ch.fans = Math.max(ch.fans, BBH.Core.STREAM_MIN_FANS + 5); ch.energy = 90; ch.level = 3; ch.xp = 105; ch.minutes = 13 * 60 - 360; BBH.G.setChar(ch); window.__ban.length = 0; });
    const st = await page.evaluate(() => { const lv0 = BBH.G.ch.level; BBH.G.goLive(); return { lv0, lv1: BBH.G.ch.level, playing: BBH.R3Vig.playing, q: BBH.R3Vig.ms.q.length, ban: window.__ban.length }; });
    ok(st.playing === 'p2.first.stream' && st.lv1 > st.lv0, 'the first stream: Core levels the hero at once, p2.first.stream plays (' + JSON.stringify(st) + ')');
    ok(await msIdle(page) && await vigOver(page), 'the stream and the milestone after it are over');
    const lg = await page.evaluate(() => ({ log: BBH.R3Vig.log.slice(), ms: BBH.R3Vig.ms.log.slice(), ban: window.__ban.slice() }));
    const iS = lg.log.findIndex((l) => /^p2\.first\.stream:/.test(l)), iL = lg.log.findIndex((l) => /^p2\.(levelup|beats):/.test(l));
    ok(iS >= 0 && iL > iS && lg.ms.length === 1, 'the level up plays AFTER the stream, once (' + JSON.stringify(lg) + ')');
    ok(lg.ban.filter((b) => /^levelup:/.test(b)).length === 1, 'the level banner landed once, on the milestone PAY (' + lg.ban.join(',') + ')');

    // a BURST: one G.play with a level, a sound, a trophy and two unlocks -> ONE scene
    await resetVig(page, 'micro');
    const burst = [{ t: 'levelup', level: 7 }, { t: 'sfx', name: 'levelup' }, { t: 'achievement', id: 'firstbusk', name: 'Street Debut', desc: 'Busk.' }, { t: 'sfx', name: 'achievement' }, { t: 'unlock', group: 'hat', id: 'fedora', name: 'Fedora' }, { t: 'unlock', group: 'glasses', id: 'shades', name: 'Shades' }, { t: 'sfx', name: 'unlock' }, { t: 'soundUnlocked', id: 'RIM', name: 'Rimshot' }, { t: 'toast', text: 'New sound: Rimshot', kind: 'good' }];
    const b0 = await page.evaluate((fx) => { window.__ban.length = 0; BBH.G.play(fx); return { q: BBH.R3Vig.ms.q.length, ban: window.__ban.length, playing: BBH.R3Vig.playing }; }, burst);
    ok(b0.q === 1 && b0.ban === 0, 'BURST: the five beats are held, no banner yet (' + JSON.stringify(b0) + ')');
    ok(await until(page, () => BBH.R3Vig.ms.log.length > 0, null, 60000) && await msIdle(page), 'BURST: the queue plays');
    const b1 = await page.evaluate(() => ({ ms: BBH.R3Vig.ms.log.slice(), ban: window.__ban.slice() }));
    ok(b1.ms.length === 1 && /^p2\.beats:/.test(b1.ms[0]), 'BURST: one scene, p2.beats (' + b1.ms.join(',') + ')');
    ok(b1.ban.length === 4, 'BURST (MICRO): every banner once (' + b1.ban.join(',') + ')');
    // the same burst in a staged form: the card covers them, no banner
    await resetVig(page, 'full');
    await page.evaluate((fx) => { window.__ban.length = 0; BBH.G.play(fx); }, burst);
    ok(await until(page, () => BBH.R3Vig.ms.log.length > 0, null, 60000) && await msIdle(page) && await vigOver(page), 'BURST (FULL): plays and ends');
    const b2 = await page.evaluate(() => ({ ms: BBH.R3Vig.ms.log.slice(), ban: window.__ban.slice() }));
    ok(b2.ms.length === 1 && /^p2\.beats:full$/.test(b2.ms[0]) && b2.ban.length === 0, 'BURST (FULL): one staged scene, its card instead of the banners (' + JSON.stringify(b2) + ')');
    // a level with an unlock riding along: the level scene, the unlock keeps its banner
    await resetVig(page, 'full');
    await page.evaluate(() => { window.__ban.length = 0; BBH.G.play([{ t: 'levelup', level: 8 }, { t: 'sfx', name: 'levelup' }, { t: 'unlock', group: 'hat', id: 'beanie', name: 'Beanie' }]); });
    ok(await until(page, () => BBH.R3Vig.ms.log.length > 0, null, 60000) && await msIdle(page) && await vigOver(page), 'LEVEL + UNLOCK: plays');
    const b3 = await page.evaluate(() => ({ ms: BBH.R3Vig.ms.log.slice(), ban: window.__ban.slice() }));
    ok(b3.ms.length === 1 && /^p2\.levelup:full$/.test(b3.ms[0]) && b3.ban.length === 1 && /^unlock:/.test(b3.ban[0]), 'LEVEL + UNLOCK: p2.levelup, the unlock banner still lands (' + JSON.stringify(b3) + ')');
    // two G.play calls in a row (a set and its bonus): still one scene
    await resetVig(page, 'micro');
    await page.evaluate(() => { BBH.G.play([{ t: 'levelup', level: 9 }]); BBH.G.play([{ t: 'achievement', id: 'rhythmking', name: 'Rhythm King', desc: 'S rank.' }]); });
    ok(await until(page, () => BBH.R3Vig.ms.log.length > 0, null, 60000) && await msIdle(page), 'TWO BATCHES: play');
    const b4 = await page.evaluate(() => BBH.R3Vig.ms.log.slice());
    ok(b4.length === 1 && /^p2\.beats:/.test(b4[0]), 'TWO BATCHES: collapse into one scene (' + b4.join(',') + ')');
    // the save watch: 25 fans for the first time (a save that came out of Core.apply)
    await resetVig(page, 'micro');
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.fans = 20; BBH.G.setChar(ch); const r = BBH.Core.apply(BBH.G.ch, { t: 'flag', k: 'probe' }); void r; const r2 = BBH.Core.apply(BBH.G.ch, { t: 'at', to: 'home' }); r2.char.fans = 30; BBH.G.setChar(r2.char); });
    ok(await until(page, () => BBH.R3Vig.ms.log.some((l) => /^p2\.fans\.25:/.test(l)), null, 60000), '25 FANS: the save watch queues and plays p2.fans.25 (' + await page.evaluate(() => BBH.R3Vig.ms.log.join(',')) + ')');
    ok(await msIdle(page), '25 FANS: over');
    const seedNo = await page.evaluate(() => { BBH.R3Vig.ms.log.length = 0; BBH.R3Vig.resetCounts(); const ch = BBH.Core.clone(BBH.G.ch); ch.fans = 10; BBH.G.setChar(ch); const c2 = BBH.Core.clone(ch); c2.fans = 40; BBH.G.setChar(c2); return BBH.R3Vig.ms.q.length; });
    ok(seedNo === 0, 'a save that did not come out of Core.apply (a load, a seed) never queues a milestone');
    // Sunday morning: the rent, after the wake up and the morning card
    await resetVig(page, 'micro');
    await page.evaluate(() => { BBH.G.pendingMorning = { t: 'morning', day: 7, name: 'Sunday', lines: ['You slept well.', 'Rent paid: $60.'], cause: 'sleep', ev: -1, event: null }; BBH.G.showMorning(() => {}); });
    ok(await until(page, () => !!document.querySelector('#ui .full'), null, 60000), 'RENT: the morning card is up');
    ok(await page.evaluate(() => !BBH.R3Vig.ms.log.length && BBH.R3Vig.ms.q.length === 1), 'RENT: the rent waits behind the card');
    await page.evaluate(() => { const c = document.querySelector('#ui .full'); if (c) c.click(); });
    ok(await until(page, () => BBH.R3Vig.ms.log.some((l) => /^p2\.rent\.paid:/.test(l)), null, 60000), 'RENT: p2.rent.paid plays after the card (' + await page.evaluate(() => BBH.R3Vig.ms.log.join(',')) + ')');
    ok(await msIdle(page) && await vigOver(page), 'RENT: over');
    await clean(page, 'the flat after the queue');
  }

  /* ------------------------------------------------------------------ FILMS: never on top of a story film */
  if (part('films')) {
    ok(await go(page, 'park', 'park'), 'the park for the film');
    await resetVig(page, 'micro');
    const f0 = await page.evaluate(() => { window.__film = BBH.R3Cine.film('sightBusk', { lines: (BBH.Core.STORY.sightBusk || []).map((l) => Object.assign({}, l)), place: 'park' }).then((i) => { window.__fi = i; }); return !!BBH.R3Cine.playing; });
    ok(f0, 'the busk sighting film starts');
    await page.evaluate(() => { BBH.G.play([{ t: 'levelup', level: 11 }]); BBH.R3Vig.ms.add({ kind: 'solo', id: 'p2.ladder', home: 'park', cover: ['sightBusk'], held: [{ t: 'toast', text: 'covered beat', kind: 'good' }], items: [] }); });
    let onTop = false;
    for (let i = 0; i < 12; i++) { const s = await page.evaluate(() => ({ film: !!BBH.R3Cine.playing, vig: BBH.R3Vig.playing })); if (s.film && s.vig) onTop = true; if (!s.film) break; await sleep(500); }
    ok(!onTop, 'no milestone starts while the film plays');
    const hid = await page.evaluate(() => { const w = BBH.R3.world, pb = w.ctx.passersby; return pb ? pb.walkers.map((x) => ({ v: x.c.object.visible, d: Math.hypot(x.c.object.position.x - 3, x.c.object.position.z + 4.6) })) : []; });
    ok(!hid.some((x) => x.v && x.d < 6.5), 'during the sighting nobody walks next to BeeAmGee (' + JSON.stringify(hid) + ')');
    await page.evaluate(() => BBH.R3Cine.skip());
    ok(await until(page, () => window.__fi && !BBH.R3Cine.playing, null, 60000), 'the film ends (skipped)');
    ok(await until(page, () => BBH.R3Vig.ms.log.length > 0, null, 60000) && await msIdle(page), 'the waiting level up plays after the film');
    const fl = await page.evaluate(() => ({ ms: BBH.R3Vig.ms.log.slice(), q: BBH.R3Vig.ms.q.length }));
    ok(fl.ms.length === 1 && /^p2\.levelup:/.test(fl.ms[0]) && !fl.q, 'the film covered the ladder beat: dropped, only the level up played (' + JSON.stringify(fl) + ')');
    await clean(page, 'the park after the film');
  }

  /* ------------------------------------------------------------------ POLISH: the home shots and the sighting still play */
  if (part('polish')) {
    ok(await go(page, 'home', 'flat'), 'home for the polish');
    await resetVig(page, null);
    const pol = await page.evaluate(async () => {
      const V = BBH.R3Vig, out = [];
      for (const id of ['p1.sleep', 'p1.nap', 'p1.wardrobe', 'p1.wake']) for (const form of ['micro', 'short', 'full', 'first']) {
        const o = { form, anyScene: true, extra: { slot: 'hat' }, pay: () => { o.paid = (o.paid || 0) + 1; } };
        if (id === 'p1.wake') o.morning = { t: 'morning', day: 4, name: 'Thursday', lines: ['You slept well.'], cause: 'sleep', event: null };
        V.onReel = (c) => { c.seek(40); };
        const info = await V.play(id, o); V.unkeep(); out.push({ id, form, ok: info.ok, err: info.errors, paid: o.paid || 0 });
      }
      V.onReel = null; return out;
    });
    const bad = pol.filter((r) => !r.ok || r.err || r.paid !== 1);
    ok(!bad.length, 'POLISH: the sleep, nap, mirror and wake scenes play in every form, pay once (' + pol.length + ' plays' + (bad.length ? ', bad: ' + JSON.stringify(bad) : '') + ')');
    await clean(page, 'the flat after the polish');
  }

  /* ------------------------------------------------------------------ FRAMES and ERRORS */
  const dk = await page.evaluate(() => (window.__BF ? window.__BF.dark.slice() : []));
  ok(dk.length === 0, 'no uncovered black or flat dark frame' + (dk.length ? ': ' + JSON.stringify(dk.slice(0, 3)) : ''));
  const real = errs.filter((e) => !/favicon/.test(e));
  ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real.slice(0, 4).join(' | ') : ''));
  await page.context().close();
} catch (e) { ok(false, 'r3vig_p2 threw: ' + (e && e.stack || e)); }
await env.stop(); clearTimeout(watchdog);
done('beatbox_heroes_r3vig_p2');
