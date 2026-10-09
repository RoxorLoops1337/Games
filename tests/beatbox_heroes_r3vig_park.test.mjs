// r3 VIGNETTE gate: THE PARK, DOORS AND TRAVEL (park3d/vig_park.js, vig_park_props.js, vig_park_clips.js, vig_doors.js, vig_hood.js and the park section of r3/vig.js).
// The REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader, phone viewport 390x844).
//   SWEEP: every park id, every travel / door id (park, hood map, a generic door in the flat) plays and ends in all four forms (FIRST, FULL, SHORT, MICRO), pays exactly once,
//          without cue errors; every MICRO is under 1.5 s, every FIRST under 12 s; nothing is left behind (no vig_ props, the walkers back, BeeAmGee seated, the hero on the mark).
//   GAME:  bench REST (the toast waits for PAY), the flyers job, the free lesson, JUST LISTEN, BUSK (the intro, the set, CONTINUE: the outro in the park and the effects on PAY),
//          JOIN THE CYPHER (intro + outro), the first jam (a story film owns it: no outro, nothing duplicated), GO FOR A RUN (intro, the run, CONTINUE: the outro),
//          leaving through the gate (p1.door.out, then the street), travelling back in (p1.door.in.park) and GO THERE on the hood map (p1.travel.map, then the door SHORT);
//          the frames stay lit, no console errors.  2D (?r=2d): unchanged, the bench rest is instant.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, until, sleep, drive } from './beatbox_heroes_r3gamelib.mjs';
import { SAMPLER } from '../tools/beatbox_heroes/blackframes.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3vig_park suite hung'); process.exit(1); }, 2700000);
const env = await r3env('beatbox_heroes_r3vig_park');
const ONLY = process.env.VIG_ONLY || '', part = (k) => !ONLY || ONLY.split(',').indexOf(k) >= 0;
const WORLD = { park: 'park', home: 'flat', street: 'street', map: 'hood' };
const ready = (page, scene, id, wid) => until(page, ([n, id, w]) => { const E = BBH.Eng, sc = E.scene; return E.sceneName === n && sc && sc.is3d && !E.pendingSwitch && (!id || E.sceneArgs.id === id) && BBH.R3.world && BBH.R3.world.id === w && sc.w === BBH.R3.world && sc.t > 0; }, [scene, id, wid], 150000);
const parkUp = (page) => ready(page, 'place', 'park', 'park');
const vigOver = (page, ms) => until(page, () => !BBH.R3Vig.playing && !BBH.R3Vig.cur && !document.body.classList.contains('vig-on'), null, ms || 150000);
// a scene counts once it is playing (swiftshader draws a few frames a second, a staged SHORT can take a minute of wall time) or once it is in the log
const logHas = (page, re, ms) => until(page, (re) => { const V = BBH.R3Vig, c = V.cur ? V.cur.id + ':' + V.cur.form : ''; return (c && new RegExp(re).test(c)) || V.log.some((l) => new RegExp(re).test(l)); }, re, ms || 150000);
const sheetTitle = (page) => page.evaluate(() => { const e = document.querySelector('#ui .sheet .h2'); return e ? e.textContent.trim() : ''; });
const rowClick = (page, re) => page.evaluate((re) => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn, #ui .sheet .btn')].find((x) => new RegExp(re).test(x.textContent)); if (!b) return false; b.click(); return true; }, re);
// close dialogs and sheets: a dialog needs a tap to finish the line and one to close it
const closeAll = async (page) => { for (let i = 0; i < 14; i++) { const n = await page.evaluate(() => { const g = document.querySelector('#r3kit .k3-dlg'); if (g) { g.click(); return 1; } const d = document.querySelector('#ui .sheet'); if (!d) return 0; const x = [...d.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'X'); (x || d).click(); return 1; }); if (!n) return; await sleep(350); } };
const openSpot = async (page, id) => { await closeAll(page); await page.evaluate((id) => BBH.R3.world.walkToSpot(id, { run: true }), id); if (await drive(page, () => !!document.querySelector('#ui .sheet .h2'), null, 20)) return true; await page.evaluate((id) => BBH.R3.world.activate(id), id); return until(page, () => !!document.querySelector('#ui .sheet .h2'), null, 30000); };
const finishSet = (page) => page.evaluate(() => { const mg = BBH.Eng.scene.mg; mg.bot({ jitterMs: 12 }); let st = mg.state(); for (let i = 0; i < 2400 && st.phase !== 'result' && st.phase !== 'verdict'; i++) { st = mg.tick(0.15); if (i === 160 && st.live && st.live.endless) { mg.quit(); st = mg.tick(0.15); } } return st.phase; });
const cardContinue = (page) => until(page, () => { const b = [...document.querySelectorAll('button, .btn')].find((x) => /^CONTINUE$/.test(x.textContent.trim()) && x.offsetParent !== null); if (b) { b.click(); return true; } return false; }, null, 60000);
// a save where the story of the park is behind us (BeeAmGee met, Pig Pen and the famous jam seen), so the outros are not owned by a film
const SAVE = { day: 4, minutes: 13 * 60 - 360, hunger: 80, energy: 95, maxEnergy: 100, mood: 60, cash: 300, fans: 80, flags: { bmgSighted: 1, bmgMet: 2, pigpenJam: 2, famousJam: 2, rhythmTip: 1 } };
// (also back to the early afternoon with energy: the jam meets until 18:00 and every set costs time)
const storyDone = (page, jams) => page.evaluate((j) => { const ch = BBH.Core.clone(BBH.G.ch); ch.n.jams = j; ch.n.busks = 12; ch.minutes = 13 * 60 - 360; ch.energy = ch.maxEnergy; ch.hunger = 80; BBH.G.setChar(ch); }, jams);
const resetVig = (page, force) => page.evaluate((f) => { const V = BBH.R3Vig; V.force = f; V.log.length = 0; V.resetCounts(); }, force === undefined ? null : force);
// the leftovers check: no vignette props in the scene, every walker of the park visible, BeeAmGee back in his seat, no layer, no hidden chrome, time scale 1
const leftovers = (page) => page.evaluate(() => {
  const w = BBH.R3.world, props = []; w.scene.traverse((o) => { if (o.name && /^vig_/.test(o.name)) props.push(o.name); });
  const pb = w.ctx && w.ctx.passersby, hidden = pb ? pb.walkers.filter((x) => !x.c.object.visible).length : 0, bee = (w.npcs || []).find((n) => n.id === 'beeamgee');
  return { props, hidden, bee: bee ? { vis: bee.object.visible, clip: bee.anim ? bee.anim.clip : bee.clip } : null, layer: !!document.querySelector('.cin'), chrome: document.body.classList.contains('vig-on'), ts: BBH.R3.host.timeScale, spots: w.spots && w.spots.group ? w.spots.group.visible : true };
});

try {
  const { page, errs } = await env.newPage({ viewport: { width: 390, height: 844 }, init: SAMPLER });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  ok(await until(page, () => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.w, null, 150000), '3D boots to the title');
  await seed(page, SAVE); await storyDone(page, 6);
  ok(await page.evaluate(() => BBH.Core.bmgHere(BBH.G.ch) && BBH.Core.jamOn(BBH.G.ch) && !BBH.Core.storyArrive(BBH.G.ch, 'park')), 'the save: BeeAmGee on his bench, the jam on, no arrival story');
  await page.evaluate(() => BBH.Eng.go('place', { id: 'park' }));
  ok(await parkUp(page), 'the park world is up');
  const mods = await page.evaluate(() => Promise.all([BBH.R3Vig.load('park'), BBH.R3Vig.load('doors'), BBH.R3Cine.load()]).then(([p, d]) => ({ park: p ? Object.keys(p.VIGNETTES) : null, doors: d ? Object.keys(d.VIGNETTES) : null })));
  ok(Array.isArray(mods.park) && mods.park.length >= 20, 'vig_park.js loads lazily with its vignettes (' + (mods.park && mods.park.length) + ' ids)');
  for (const need of ['p1.busk.in', 'p1.busk.out', 'p1.jam.in', 'p1.jam.out', 'p1.jam.listen', 'p1.bench.rest', 'p1.run.in', 'p1.run.out', 'p1.job.flyers', 'p1.coach.free.mus', 'p1.coach.free.tech', 'p1.coach.free.ori', 'p1.coach.free.show', 'p1.coach.pro', 'p1.door.out', 'p1.door.in.park', 'p1.refuse.tired', 'p1.refuse.coach', 'p1.refuse.nojam'])
    ok(mods.park.indexOf(need) >= 0, 'the park has ' + need);
  ok(Array.isArray(mods.doors) && ['p1.door.out', 'p1.door.in.home', 'p1.door.in.shop', 'p1.door.in.studio', 'p1.door.in.bar'].every((k) => mods.doors.indexOf(k) >= 0), 'vig_doors.js has the generic doors (' + (mods.doors || []).join(',') + ')');
  await page.evaluate(() => { window.__BF.start(); window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('k3-toast')) window.__toasts.push(n.textContent.trim()); }).observe(document.getElementById('r3kit'), { childList: true, subtree: true }); });

  /* ------------------------------------------------------------------ SWEEP: every id x 4 forms */
  const sweep = (ids) => page.evaluate(async (ids) => {
    const V = BBH.R3Vig, out = [], RK = ['S', 'A', 'B', 'D'], STATS = ['mus', 'tech', 'ori', 'show'], pre = BBH.Core.clone(BBH.G.ch);
    pre.maxEnergy = Math.max(10, BBH.G.ch.maxEnergy - 2); pre.minutes = BBH.G.ch.minutes - 60; pre.energy = 20;
    for (const id of ids) {
      let k = 0;
      for (const form of ['micro', 'short', 'full', 'first']) {
        const o = { form, pre, anyScene: true, pay: () => { o.paid = (o.paid || 0) + 1; } }; let len = null;
        const rk = RK[k % 4], kind = /jam/.test(id) ? 'jam' : 'busk';
        if (/\.out$/.test(id) && /busk|jam/.test(id)) o.fx = [{ t: 'result', kind, rw: {}, res: { rank: rk, accuracy: 0.8, auto: k === 2 && kind === 'busk' } }, { t: 'toast', text: 'The cypher taught you something: Musicality +0.9', kind: 'good' }];
        if (id === 'p1.busk.in') o.action = { t: 'go', scene: 'rhythm', args: { mode: 'perform', kind: 'busk', style: k % 2, auto: k === 3 } };
        if (id === 'p1.run.out') o.action = { t: 'run', q: k === 1 ? 0.2 : 0.8, goodBars: 9 };
        if (id === 'p1.coach.pro') o.action = { t: 'coach', stat: STATS[k] };
        if (id === 'p1.travel.map') o.extra = { to: ['park', 'shop', 'bar', 'home'][k] };
        V.onReel = (c) => { c.seek(40); len = c.state().real; };
        const info = await V.play(id, o);
        out.push({ id, form, ok: info.ok, err: info.errors, len, paid: o.paid || 0, e: info.error });
        k++;
      }
    }
    V.onReel = null; return out;
  }, ids);
  const judge = (all, what) => {
    const bad = all.filter((r) => !r.ok || r.err || r.paid !== 1);
    ok(all.length >= 4 && !bad.length, what + ': every vignette plays and ends in every form, pays once, no cue errors (' + all.length + ' plays' + (bad.length ? ', bad: ' + JSON.stringify(bad.slice(0, 4)) : '') + ')');
    const slow = all.filter((r) => r.form === 'micro' && !(r.len > 0 && r.len < 1.5));
    ok(!slow.length, what + ': every MICRO is under 1.5 s' + (slow.length ? ': ' + JSON.stringify(slow.slice(0, 4)) : ''));
    const longF = all.filter((r) => r.form === 'first' && r.len > 12);
    ok(!longF.length, what + ': every FIRST stays under 12 s' + (longF.length ? ': ' + JSON.stringify(longF) : ''));
  };
  if (part('sweep')) {
  const st0 = await page.evaluate(() => { const s = BBH.R3.world.controls.state(); return { x: s.x, z: s.z, h: s.heading }; });
  judge(await sweep(mods.park), 'PARK');
  ok(await vigOver(page), 'nothing is left playing after the park sweep');
  await sleep(600);
  const lo = await leftovers(page), st1 = await page.evaluate(() => { const s = BBH.R3.world.controls.state(); return { x: s.x, z: s.z, h: s.heading, en: s.enabled }; });
  ok(!lo.props.length && !lo.hidden && !lo.layer && !lo.chrome && lo.ts === 1 && lo.spots, 'the park after the sweep: no props, every walker back, no layer, no hidden chrome, time scale 1, spots back (' + JSON.stringify(lo) + ')');
  ok(lo.bee && lo.bee.vis, 'BeeAmGee is back on his bench, visible (' + JSON.stringify(lo.bee) + ')');
  ok(Math.hypot(st1.x - st0.x, st1.z - st0.z) < 0.05 && st1.en, 'the hero is back on the mark with the controls on (' + Math.hypot(st1.x - st0.x, st1.z - st0.z).toFixed(3) + ' m)');
  }

  /* ------------------------------------------------------------------ GAME: the real paths in the park */
  // bench REST: Core at once, the toast on PAY (the G.do scenes run MICRO here: swiftshader draws a few frames a second, the forms are swept above)
  await resetVig(page, 'micro');
  ok(await openSpot(page, 'bench') && /BENCH/.test(await sheetTitle(page)), 'the bench sheet opens');
  const rest = await page.evaluate(() => { window.__toasts.length = 0; const m0 = BBH.G.ch.minutes, b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => /^REST/.test(x.textContent.trim())); if (!b) return null; b.click(); return { m0, m1: BBH.G.ch.minutes, playing: BBH.R3Vig.playing, toastNow: window.__toasts.length }; });
  ok(rest && rest.m1 > rest.m0 && rest.playing === 'p1.bench.rest' && rest.toastNow === 0, 'bench REST: Core applies at once, the bench rest plays, the toast waits (' + JSON.stringify(rest) + ')');
  ok(await vigOver(page) && await until(page, () => window.__toasts.some((t) => /mood/i.test(t)), null, 20000), 'bench REST: the vignette ends and the mood toast lands');
  // the flyers job from the flyers spot
  ok(await openSpot(page, 'flyers'), 'the flyers sheet opens');
  const fl = await page.evaluate(() => { const c0 = BBH.G.ch.cash; const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => /FLYER|ODD JOB/i.test(x.textContent)); if (!b) return null; b.click(); return { c0, c1: BBH.G.ch.cash, playing: BBH.R3Vig.playing }; });
  ok(fl && fl.c1 > fl.c0 && fl.playing === 'p1.job.flyers', 'flyers: paid at once by Core, the flyers montage plays (' + JSON.stringify(fl) + ')');
  ok(await vigOver(page), 'flyers: the vignette ends');
  // the free lesson with BeeAmGee
  await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); delete ch.flags.coachDay; BBH.G.setChar(ch); });
  ok(await openSpot(page, 'bench'), 'the bench sheet opens again');
  await rowClick(page, '^FREE LESSON'); await sleep(300);
  const les = await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => /^TECHNIQUE|^TECHNICALITY|TECH/i.test(x.textContent.trim())); if (!b) return null; b.click(); return { playing: BBH.R3Vig.playing }; });
  ok(les && les.playing === 'p1.coach.free.tech', 'FREE LESSON: the technique lesson on the bench plays (' + JSON.stringify(les) + ')');
  ok(await vigOver(page) && await until(page, () => /again/i.test((document.getElementById('r3kit') || {}).textContent || ''), null, 30000), 'FREE LESSON: then his line, as before');
  await closeAll(page);
  // JUST LISTEN at the jam
  ok(await openSpot(page, 'jam') && /JAM/.test(await sheetTitle(page)), 'the jam sheet opens');
  const li = await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')].find((x) => /^JUST LISTEN/.test(x.textContent.trim())); if (!b) return null; b.click(); return BBH.R3Vig.playing; });
  ok(li === 'p1.jam.listen', 'JUST LISTEN: the listen scene plays (' + li + ')');
  ok(await vigOver(page), 'JUST LISTEN: it ends');

  // BUSK: the intro in the park, the set, CONTINUE: back in the park, the outro, the effects on PAY
  await storyDone(page, 6);
  await resetVig(page, 'short');
  ok(await openSpot(page, 'busk') && await sheetTitle(page) === 'BUSKING SPOT', 'the busking spot sheet opens');
  const cash0 = await page.evaluate(() => BBH.G.ch.cash);
  await rowClick(page, '^BUSKPlay');
  ok(await logHas(page, '^p1\\.busk\\.in:short'), 'BUSK: the intro plays in the park first');
  ok(await ready(page, 'rhythm', null, 'rhythm'), 'BUSK: then the set starts');
  ok(await finishSet(page) === 'result', 'BUSK: the bot plays the set to the result card');
  await page.evaluate(() => { window.__toasts.length = 0; window.__gp = []; if (!BBH.G.__gpw) { const gp = BBH.G.play; BBH.G.play = function (fx) { window.__gp.push({ n: (fx || []).length, during: BBH.R3Vig.playing, scene: BBH.Eng.sceneName }); return gp.apply(this, arguments); }; BBH.G.__gpw = 1; } });
  ok(await cardContinue(page), 'BUSK: CONTINUE on the result card');
  ok(await parkUp(page), 'BUSK: back in the park');
  ok(await logHas(page, '^p1\\.busk\\.out:short'), 'BUSK: the outro plays in the park (' + await page.evaluate(() => BBH.R3Vig.log.join(',')) + ')');
  ok(await vigOver(page) && await page.evaluate((c) => BBH.G.ch.cash > c, cash0), 'BUSK: the vignette ends, the tips are in the save');
  ok(await until(page, () => window.__gp.some((g) => g.during === 'p1.busk.out' && g.scene === 'place'), null, 15000), 'BUSK: the held effects landed on PAY, inside the outro in the park (' + await page.evaluate(() => JSON.stringify(window.__gp)) + ')');
  ok(await page.evaluate(() => BBH.R3.world.controls.state().enabled && !document.body.classList.contains('vig-on')), 'BUSK: controls on, the HUD back');

  // JOIN THE CYPHER: intro and outro
  await resetVig(page, 'short');
  ok(await openSpot(page, 'jam'), 'the jam sheet opens');
  await rowClick(page, '^JOIN THE CYPHER');
  ok(await logHas(page, '^p1\\.jam\\.in:short'), 'JAM: the intro plays (the ring, the point)');
  ok(await ready(page, 'rhythm', null, 'rhythm') && await finishSet(page) === 'result', 'JAM: the set plays to the result card');
  ok(await cardContinue(page) && await parkUp(page), 'JAM: CONTINUE, back in the park');
  ok(await logHas(page, '^p1\\.jam\\.out:short') && await vigOver(page), 'JAM: the outro plays and ends');

  // the FIRST jam: firstJam is a story film; the outro steps aside (no duplicate)
  await vigOver(page); await storyDone(page, 0); await resetVig(page, 'short');
  ok(await openSpot(page, 'jam'), 'the jam sheet opens (first jam of this save)');
  await rowClick(page, '^JOIN THE CYPHER');
  ok(await ready(page, 'rhythm', null, 'rhythm') && await finishSet(page) === 'result', 'FIRST JAM: the set plays to the result card');
  ok(await cardContinue(page) && await parkUp(page), 'FIRST JAM: back in the park');
  ok(await until(page, () => BBH.R3Cine.log.indexOf('firstJam') >= 0 || BBH.R3Cine.playing === 'firstJam', null, 60000), 'FIRST JAM: the story film firstJam plays');
  await page.evaluate(() => { if (BBH.R3Cine.film_) BBH.R3Cine.film_.skip(); });
  await until(page, () => !BBH.R3Cine.playing, null, 60000); await sleep(800);
  ok(await page.evaluate(() => !BBH.R3Vig.log.some((l) => /^p1\.jam\.out/.test(l))), 'FIRST JAM: no jam outro on top of the film (' + await page.evaluate(() => BBH.R3Vig.log.join(',')) + ')');
  await closeAll(page);
  await storyDone(page, 6); await sleep(500);

  // GO FOR A RUN: the intro, the run, CONTINUE: the outro
  await storyDone(page, 6);
  await resetVig(page, 'short');
  ok(await openSpot(page, 'bench'), 'the bench sheet opens for the run');
  await rowClick(page, '^GO FOR A RUN');
  ok(await logHas(page, '^p1\\.run\\.in:short'), 'RUN: the intro plays (the stretch, the earbud)');
  ok(await ready(page, 'run', null, 'run') && await until(page, () => !!BBH.R3.world.game, null, 60000), 'RUN: the run mini game is up');
  await page.evaluate(() => { const g = BBH.R3.world.game; g.start(); for (let i = 0; i < 4000; i++) { g.press(i % 2 ? 'R' : 'L'); g.tick(0.05); if (g.state().cardOpen) break; } for (let i = 0; i < 40; i++) g.tick(0.05); });
  await sleep(600);
  ok(await cardContinue(page) && await parkUp(page), 'RUN: CONTINUE, back in the park');
  ok(await logHas(page, '^p1\\.run\\.out:short') && await vigOver(page), 'RUN: the outro plays and ends (' + await page.evaluate(() => BBH.R3Vig.log.join(',')) + ')');

  // TRAVEL: out through the gate, the street, back in; the hood map
  await resetVig(page, 'short');
  await page.evaluate(() => BBH.Eng.scene.leave2());
  ok(await page.evaluate(() => BBH.R3Vig.playing) === 'p1.door.out' || await logHas(page, '^p1\\.door\\.out', 5000), 'LEAVE: the gate scene plays before the park is left');
  ok(await ready(page, 'street', null, 'street'), 'LEAVE: then the street');
  ok(await page.evaluate(() => BBH.R3Vig.log.some((l) => /^p1\.door\.out:short/.test(l))), 'LEAVE: p1.door.out played SHORT');
  await sleep(800);
  const tr = await page.evaluate(() => { const m0 = BBH.G.ch.minutes; const r = BBH.G.enterPlace('park'); return { r, m0, m1: BBH.G.ch.minutes }; });
  ok(tr.r && tr.m1 > tr.m0, 'TRAVEL: Core spends the travel time at once (' + JSON.stringify(tr) + ')');
  ok(await parkUp(page) && await logHas(page, '^p1\\.door\\.in\\.park:short', 30000), 'TRAVEL: the park comes up and the gate IN scene plays');
  ok(await vigOver(page), 'TRAVEL: it ends');
  await page.evaluate(() => BBH.Eng.go('map'));
  ok(await ready(page, 'map', null, 'hood'), 'the hood map is up');
  await page.evaluate(() => BBH.R3Vig.load('hood')); await sleep(400);
  const mp = await page.evaluate(() => { const r = BBH.G.enterPlace('park'); return { r, playing: BBH.R3Vig.playing }; });
  ok(mp.r && mp.playing === 'p1.travel.map', 'GO THERE: the token hops across the map first (' + JSON.stringify(mp) + ')');
  ok(await parkUp(page) && await logHas(page, '^p1\\.travel\\.map') && await logHas(page, '^p1\\.door\\.in\\.park:short', 30000), 'GO THERE: then the park, the door SHORT (' + await page.evaluate(() => BBH.R3Vig.log.join(',')) + ')');
  ok(await vigOver(page), 'GO THERE: it ends');
  // the hood map sweep (world 'hood')
  await page.evaluate(() => BBH.Eng.go('map'));
  ok(await ready(page, 'map', null, 'hood'), 'the hood map is up again');
  judge(await sweep(['p1.travel.map']), 'HOOD');
  // a generic door in another world (the flat has no door scene of its own: vig_doors.js fills the gap)
  await resetVig(page, null);
  await page.evaluate(() => BBH.Eng.go('place', { id: 'home' }));
  ok(await ready(page, 'place', 'home', 'flat'), 'home is up');
  ok(await until(page, () => BBH.R3Vig.has('p1.door.out', 'flat') && BBH.R3Vig.has('p1.door.in.home', 'flat'), null, 30000), 'the flat gets the generic doors from vig_doors.js');
  judge(await sweep(['p1.door.out', 'p1.door.in.home']), 'FLAT DOORS');
  ok(await vigOver(page), 'nothing left playing at home');
  await page.evaluate(() => { BBH.R3Vig.force = null; });

  /* ------------------------------------------------------------------ FRAMES and ERRORS */
  const dk = await page.evaluate(() => (window.__BF ? window.__BF.dark.slice() : []));
  ok(dk.length === 0, 'no uncovered black or flat dark frame while the vignettes played' + (dk.length ? ': ' + JSON.stringify(dk.slice(0, 3)) : ''));
  const real = errs.filter((e) => !/favicon/.test(e));
  ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real.slice(0, 4).join(' | ') : ''));
  await page.context().close();

  /* ------------------------------------------------------------------ 2D: unchanged */
  const { page: p2, errs: e2 } = await env.newPage({ viewport: { width: 360, height: 640 } });
  await p2.goto(env.url('index.html?r=2d'));
  await until(p2, () => window.BBH && BBH.Eng && BBH.Eng.sceneName === 'title', null, 60000);
  await seed(p2, SAVE);
  await p2.evaluate(() => BBH.Eng.go('place', { id: 'park' })); await sleep(800);
  const r2 = await p2.evaluate(() => { BBH.Eng.scene.activate('bench'); const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /^REST/.test(x.textContent.trim())); const m0 = BBH.G.ch.minutes; if (b) b.click(); return { b: !!b, on: BBH.R3Vig ? BBH.R3Vig.enabled() : false, playing: BBH.R3Vig && BBH.R3Vig.playing, spent: BBH.G.ch.minutes > m0, layer: !!document.querySelector('.cin') }; });
  ok(r2.b && !r2.on && !r2.playing && r2.spent && !r2.layer, '2D: the bench rest is instant, no vignette layer (' + JSON.stringify(r2) + ')');
  ok(e2.filter((e) => !/favicon/.test(e)).length === 0, '2D: no console errors');
  await p2.context().close();
} catch (e) { ok(false, 'r3vig_park threw: ' + (e && e.stack || e)); }
await env.stop(); clearTimeout(watchdog);
done('beatbox_heroes_r3vig_park');
