// r3 CINE gate (park3d/cine.js, park3d/cine_reels.js, r3/cine.js): the REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader, phone viewport 390x844).
//   ENGINE: a unit reel in the title world fires every cue in order (camera, say, sound, spawn, walk, beat, call, wait), plays to the end, restores the actors it moved and removes its layer;
//           skip() ends a long reel at once; the watchdog ends a stuck one.
//   OPENING: NEW GAME -> the 3D intro plays the four reels (office, street, flat, dream) in their worlds and lands in the tutorial street with flags.intro; SKIP (the button) ends it at once
//            and a continue intro goes back to the save's place.
//   STORY: every story film starts from its core.js beat (storyAfter, storyBattle, storyArrive, the morning effect) in the right place world, the player is back on the mark it started from
//          (an activity return ticket included), the controls are on again, the HUD back, the layer gone; the morning card still follows the morning films.
//   FRAMES: the blank-frame sampler (tools/beatbox_heroes/blackframes.mjs) sees no uncovered black or flat dark frame while films play.  2D: the intro and the story stay 2D (?r=2d).
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { seed, until, sleep } from './beatbox_heroes_r3gamelib.mjs';
import { SAMPLER } from '../tools/beatbox_heroes/blackframes.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };
const watchdog = setTimeout(() => { console.error('FAIL: r3cine suite hung'); process.exit(1); }, 1500000);
const env = await r3env('beatbox_heroes_r3cine');
const WORLD = { park: 'park', bar: 'bar', home: 'flat' };
const placeReady = (page, id) => until(page, ([id, wid]) => { const E = BBH.Eng, sc = E.scene; return E.sceneName === 'place' && sc && sc.is3d && !E.pendingSwitch && E.sceneArgs.id === id && BBH.R3.world && BBH.R3.world.id === wid && sc.w === BBH.R3.world; }, [id, WORLD[id]], 150000);
const filmOver = (page, ms) => until(page, () => !BBH.R3Cine.playing && !document.querySelector('.cin') && !document.body.classList.contains('cine-on'), null, ms || 240000);
// each reel plays for `ms` of real time (frames render, the blank-frame sampler watches), then ends as if it had played out
const pace = (page, ms, first) => page.evaluate(([ms, first]) => { window.__reels = []; let n = 0; BBH.R3Cine.onReel = (c) => { const st = BBH.R3.world && BBH.R3.world.controls && BBH.R3.world.controls.state ? BBH.R3.world.controls.state() : null; window.__reels.push({ id: c.id, world: BBH.R3.world && BBH.R3.world.id, x: st && st.x, z: st && st.z }); setTimeout(() => c.end(), n++ === 0 && first ? first : ms); }; }, [ms, first || 0]);
const dark = (page) => page.evaluate(() => (window.__BF ? window.__BF.dark.slice() : []));
// CINE_ONLY=engine|opening|story|morning|2d runs one part (while working on a film)
const ONLY = process.env.CINE_ONLY || '', part = (k) => !ONLY || ONLY.split(',').indexOf(k) >= 0;

try {
  const { page, errs } = await env.newPage({ viewport: { width: 390, height: 844 }, init: SAMPLER });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  ok(await until(page, () => window.BBH && BBH.R3 && BBH.R3.status === 'ready' && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.w, null, 150000), '3D boots to the title');
  ok(await page.evaluate(() => !!BBH.R3Cine && typeof BBH.R3Cine.film === 'function' && !!BBH.Eng.scenes3d.intro), 'r3/cine.js installed: R3Cine.film and the 3D intro sibling');
  await page.evaluate(() => window.__BF.start());

  /* ------------------------------------------------------------------ ENGINE */
  if (part('engine')) {
  const unit = await page.evaluate(async () => {
    const M = await BBH.R3Cine.load(), w = BBH.R3.world, fired = [], log = [], p = w.player.object.position, p0 = [p.x, p.z];
    const audio = { sfx: (n) => log.push('sfx:' + n), drum: (id) => log.push('drum:' + id), now: () => 0, music: (id) => log.push('music:' + id), stop: () => log.push('stop') };
    const reel = { id: 'unit', events: [
      { do: 'shot', on: 'hero', yaw: 20, w: 1.6, fov: 32 }, { do: 'letterbox', v: 'scope', ms: 100 }, { do: 'sfx', name: 'click' }, { do: 'say', who: null, text: 'One.', dur: 0.4 }, { do: 'drum', id: 'B', who: 'hero', rings: 1 },
      { do: 'place', who: 'hero', at: [p0[0] + 1, p0[1]], face: 90 }, { do: 'shot', pos: [0, 2, 8], look: 'hero:head', fov: 40, to: { pos: [0, 2.2, 6] }, dur: 0.3, cut: 'blend', ms: 200 },
      { do: 'spawn', id: 'x', look: 'foxy', at: [p0[0] - 1, p0[1]], clip: 'idle' }, { do: 'walk', who: 'x', to: [p0[0] - 2, p0[1]], speed: 5, wait: true }, { do: 'say', who: 'x', name: 'FOXY', text: 'Two.', dur: 0.3 },
      { do: 'beat', who: 'hero', pattern: 'B t K', bpm: 300, wait: true }, { do: 'fx', kind: 'sparks', at: 'hero:top' }, { do: 'cone', id: 'k', at: [0, 4, 0], to: 'hero' }, { do: 'stamp', text: 'TUE 17:12|REC' },
      { do: 'call', fn: () => log.push('call') }, { do: 'wait', s: 0.2 }, { do: 'cone', id: 'k', v: 0 } ] };
    const c = M.createCine(w, reel, { audio, onCue: (e) => fired.push(e.do) }), res = await c.play();
    const after = [p.x, p.z], layer = !!document.querySelector('.cin'), spawned = w.scene.children.filter((o) => o.isObject3D && o.userData && o.userData.cineSpawn).length;
    // skip: a long reel ends at once
    const c2 = M.createCine(w, { id: 'long', events: [{ do: 'shot', on: 'hero', w: 2 }, { do: 'wait', s: 99 }] }, { audio }); const t0 = performance.now(); const sk = () => (c2.state().fired >= 2 ? c2.skip() : setTimeout(sk, 50)); setTimeout(sk, 300); const r2 = await c2.play();   // skip once the reel is running (its first frame can take seconds on a loaded machine)
    // watchdog: a reel blocked on a tap that never comes
    const c3 = M.createCine(w, { id: 'stuck', max: 0.6, events: [{ do: 'wait', tap: true }] }, { audio }); const r3 = await c3.play();
    return { fired, want: reel.events.map((e) => e.do), log, res, moved: Math.hypot(after[0] - p0[0], after[1] - p0[1]), layer, spawned, skip: r2, skipMs: performance.now() - t0, stuck: r3 };
  });
  ok(JSON.stringify(unit.fired) === JSON.stringify(unit.want), 'engine: every cue fires, in order (' + unit.fired.join(',') + ')');
  ok(unit.res && !unit.res.skipped && unit.res.errors === 0 && unit.res.fired === unit.want.length, 'engine: the reel plays to its end with no cue errors (' + JSON.stringify(unit.res) + ')');
  ok(['sfx:click', 'drum:B', 'call'].every((k) => unit.log.indexOf(k) >= 0) && unit.log.filter((k) => /^drum:/.test(k)).length >= 4, 'engine: sound, drum, beat and call cues reach the audio adapter (' + unit.log.join(',') + ')');
  ok(unit.moved < 0.01, 'engine: the hero moved by the reel is back on its mark (' + unit.moved.toFixed(3) + ' m)');
  ok(!unit.layer && unit.spawned === 0, 'engine: the screen layer and the spawned actor are gone afterwards');
  ok(unit.skip.skipped && unit.skip.t < 30 && unit.skip.fired === 2, 'engine: skip() ends a 99 s reel at once (' + Math.round(unit.skipMs) + ' ms, reel clock ' + unit.skip.t + ' s)');
  ok(unit.stuck.skipped, 'engine: the watchdog ends a reel that waits forever');
  }

  /* ------------------------------------------------------------------ OPENING: plays, lands in the tutorial street */
  if (part('opening')) {
  await seed(page, { day: 1, minutes: 17 * 60 + 12 - 360, flags: { intro: 0, visited_home: 0, visited_park: 0, visited_shop: 0, visited_studio: 0, visited_bar: 0 } });
  await pace(page, 2600, 6000);
  await page.evaluate(() => BBH.Eng.go('intro', { next: 'new' }));
  ok(await until(page, () => BBH.Eng.sceneName === 'intro' && BBH.Eng.scene.is3d && BBH.R3Cine.playing === 'opening', null, 60000), 'NEW GAME intro is the 3D opening film');
  ok(await until(page, () => document.querySelector('.cin .cin-lb') && document.querySelector('.cin .cin-skip'), null, 30000), 'the film has its letterbox and a SKIP button');
  ok(await until(page, () => BBH.Eng.sceneName === 'street' && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === 'street' && !BBH.R3Cine.playing, null, 300000), 'the opening ends in the 3D street');
  const op = await page.evaluate(() => ({ reels: (window.__reels || []).map((r) => r.id + '@' + r.world), last: BBH.R3Cine.last, tut: BBH.Eng.sceneArgs.tutorial === true, intro: BBH.G.ch.flags.intro, wide: BBH.R3._.S.wide, sync: BBH.R3._.S.syncHeld }));
  ok(op.reels.join() === 'opening.office@cine,opening.street@street,opening.flat@flat,opening.dream@arena', 'the four reels play in their worlds (' + op.reels.join() + ')');
  ok(op.last && op.last.ok && !op.last.skipped && op.last.errors === 0, 'the opening finished cleanly (' + JSON.stringify(op.last && { ok: op.last.ok, errors: op.last.errors, t: op.last.t }) + ')');
  ok(op.tut && op.intro === 1, 'it lands like the 2D intro: tutorial street, flags.intro set');
  ok(!op.wide && !op.sync, 'wide mode and the sync hold are released');
  ok(await until(page, () => !!document.querySelector('#r3kit .k3-dlg') && !document.querySelector('.cin'), null, 60000), "Foxy's first-run dialog follows, the film layer is gone");
  for (let i = 0; i < 12; i++) { const n = await page.evaluate(() => { const b = document.querySelector('#r3kit .k3-dlg'); if (b) { b.click(); return 1; } return 0; }); if (!n) break; await sleep(250); }
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .btn, #r3kit button')].find((x) => /GOT IT/.test(x.textContent)); if (b) b.click(); });

  /* ------------------------------------------------------------------ OPENING: SKIP */
  await page.evaluate(() => { BBH.R3Cine.onReel = null; const ch = BBH.Core.clone(BBH.G.ch); ch.place = 'home'; BBH.G.setChar(ch); BBH.Eng.go('intro', { next: 'continue' }); });
  ok(await until(page, () => BBH.R3Cine.playing === 'opening' && document.querySelector('.cin .cin-skip.on'), null, 60000), 'a continue intro plays the film too');
  await page.evaluate(() => document.querySelector('.cin .cin-skip').click());
  ok(await placeReady(page, 'home'), 'SKIP ends the film and goes back to the save (home, the flat world)');
  ok(await page.evaluate(() => BBH.R3Cine.last && BBH.R3Cine.last.skipped === true), 'the film reports skipped');
  ok(await filmOver(page, 30000), 'after SKIP nothing of the film is left (layer, cine-on, playing)');
  }

  /* ------------------------------------------------------------------ STORY FILMS from their beats */
  const STORY = [
    { id: 'firstJam', place: 'park', make: (C, ch, fx) => { ch.n.jams = 1; C.storyAfter(ch, 'jam', fx); } },
    { id: 'sightJam', place: 'park', make: (C, ch, fx) => { ch.n.jams = 2; C.storyAfter(ch, 'jam', fx); } },
    { id: 'pigpen', place: 'park', make: (C, ch, fx) => { ch.n.jams = 3; ch.flags.bmgSighted = 1; ch.flags.bmgMet = 1; C.storyAfter(ch, 'jam', fx); } },
    { id: 'famous', place: 'park', make: (C, ch, fx) => { ch.n.jams = 5; ch.fans = 40; ch.flags.bmgSighted = 1; ch.flags.bmgMet = 1; ch.flags.pigpenJam = 1; C.storyAfter(ch, 'jam', fx); } },
    { id: 'sightBusk', place: 'park', make: (C, ch, fx) => { ch.n.busks = 4; C.storyAfter(ch, 'busk', fx); } },
    { id: 'meet', place: 'park', make: (C, ch) => { ch.flags.bmgSighted = ch.day - 1; ch.flags.bmgVia = 'jam'; } },
    { id: 'firstWin', place: 'bar', make: (C, ch, fx) => { ch.n.battlesWon = 1; C.storyBattle(ch, true, null, fx); } },
    { id: 'firstLoss', place: 'bar', make: (C, ch, fx) => { ch.n.battlesLost = 1; C.storyBattle(ch, false, null, fx); } },
    { id: 'firstShowcase', place: 'bar', make: (C, ch, fx) => { ch.n.showcases = 1; C.storyAfter(ch, 'showcase', fx); } },
    { id: 'champion', place: 'bar', make: (C, ch, fx) => { ch.n.battlesWon = 9; ch.flags.worldcup = ch.day; C.storyBattle(ch, true, 'wc3', fx); } },
  ];
  for (const s of part('story') ? STORY : []) {
    const bar = s.place === 'bar';
    await seed(page, { day: bar ? 6 : 3, minutes: (bar ? 21 : 13) * 60 - 360 });
    await pace(page, 2200);
    const fired = await page.evaluate(([src, place]) => {
      const C = BBH.Core, ch = C.clone(BBH.G.ch), list = []; (0, eval)('(' + src + ')')(C, ch, list); BBH.G.setChar(ch);
      const st = list.filter((f) => f.t === 'story'), story = st.map((f) => f.id); BBH.G.storyQ.push(...st); BBH.Eng.go('place', { id: place }); return story;
    }, [s.make.toString(), s.place]);
    ok(s.id === 'meet' ? fired.length === 0 : fired.join() === s.id, s.id + ': core.js emits the beat (' + fired.join() + ')');
    ok(await placeReady(page, s.place), s.id + ': the ' + s.place + ' world is up');
    ok(await until(page, (id) => BBH.R3Cine.playing === id || (BBH.R3Cine.last && BBH.R3Cine.last.id === id), s.id, 60000), s.id + ': the film starts in the place');
    const over = await filmOver(page);
    if (!over) console.log('  state ' + s.id + ': ' + JSON.stringify(await page.evaluate(() => ({ playing: BBH.R3Cine.playing, cur: BBH.R3Cine.cur && BBH.R3Cine.cur.state(), reels: window.__reels, scene: BBH.Eng.sceneName, active: BBH.R3.active, paused: BBH.R3.host && BBH.R3.host.paused, cin: !!document.querySelector('.cin') }))));
    ok(over, s.id + ': the film ends and leaves nothing behind');
    const r = await page.evaluate(([id, place]) => {
      const w = BBH.R3.world, st = w.controls.state(), first = (window.__reels || [])[0] || {}, last = BBH.R3Cine.last || {};
      return { last: { id: last.id, ok: last.ok, errors: last.errors }, world: w.id, place: BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs.id === place, enabled: st.enabled, d: first.x !== undefined ? Math.hypot(st.x - first.x, st.z - first.z) : 99, hud: !!document.getElementById('hud3') && getComputedStyle(document.getElementById('hud3')).visibility !== 'hidden', q: BBH.G.storyQ.length, met: BBH.G.ch.flags.bmgMet };
    }, [s.id, s.place]);
    ok(r.last.id === s.id && r.last.ok && r.last.errors === 0, s.id + ': played cleanly (' + JSON.stringify(r.last) + ')');
    ok(r.place && r.world === WORLD[s.place], s.id + ': back in the ' + s.place + ' scene and world');
    ok(r.enabled && r.d < 0.35, s.id + ': the player is back on its mark (' + r.d.toFixed(2) + ' m) and free to move');
    ok(r.hud && r.q === 0, s.id + ': HUD back, the story queue empty');
    if (s.id === 'meet') ok(!!r.met, 'meet: the meeting is stored (flags.bmgMet), the lip roll card follows');
    await page.evaluate(() => { for (const b of document.querySelectorAll('#r3kit .k3-dlg')) b.click(); });
  }

  /* ------------------------------------------------------------------ the return ticket: back from the jam = back at the jam spot, after the film */
  if (part('story')) {
  await seed(page, { day: 3, minutes: 13 * 60 - 360 }); await pace(page, 2000);
  await page.evaluate(() => {
    const C = BBH.Core, ch = C.clone(BBH.G.ch), list = []; ch.n.jams = 1; C.storyAfter(ch, 'jam', list); BBH.G.setChar(ch); BBH.G.storyQ.push(...list.filter((f) => f.t === 'story'));
    BBH.G.activityReturn = { scene: 'rhythm', args: { mode: 'perform', kind: 'jam' }, place: 'park', spot: 'jam', hot: 'jam', pos: { x: 5.5, z: -18.4, h: Math.PI }, mode: 'stay', day: ch.day };
    BBH.Eng.go('place', { id: 'park' });
  });
  ok(await placeReady(page, 'park') && await until(page, () => BBH.R3Cine.playing === 'firstJam', null, 60000), 'return ticket: the park comes back with the jam film');
  ok(await filmOver(page), 'return ticket: the film ends');
  { const p = await page.evaluate(() => BBH.R3.world.controls.state()); ok(Math.hypot(p.x - 5.5, p.z + 18.4) < 1.4, 'return ticket: after the film the player stands where the jam started (' + p.x + ', ' + p.z + ')'); }
  }

  /* ------------------------------------------------------------------ MORNINGS: the film, then the morning card */
  for (const m of !part('morning') ? [] : [{ id: 'morning1', day: 2, cause: 'sleep' }, { id: 'collapse', day: 4, cause: 'collapse' }]) {
    await seed(page, { day: m.day, minutes: 60 }); await pace(page, 2400);
    await page.evaluate((m) => { BBH.G.pendingMorning = { t: 'morning', day: m.day, name: BBH.Core.dayName(m.day), lines: ['You slept well.'], cause: m.cause }; BBH.Eng.go('place', { id: 'home' }); }, m);
    ok(await until(page, (id) => BBH.R3Cine.playing === id, m.id, 90000), m.id + ': the film plays in the flat');
    ok(await until(page, () => [...document.querySelectorAll('#ui .tp')].some((e) => /TAP TO START THE DAY/.test(e.textContent)) && !BBH.R3Cine.playing, null, 120000), m.id + ': the morning card follows the film');
    await page.evaluate(() => { const c = [...document.querySelectorAll('#ui .full')].find((e) => /TAP TO START/.test(e.textContent)); if (c) c.click(); });
    ok(await until(page, () => !document.querySelector('.cin') && BBH.R3.world.controls.state().enabled, null, 30000), m.id + ': tapping the card starts the day, controls on');
  }

  /* ------------------------------------------------------------------ FRAMES and ERRORS */
  const dk = await dark(page);
  ok(dk.length === 0, 'no uncovered black or flat dark frame while the films played' + (dk.length ? ': ' + JSON.stringify(dk.slice(0, 3)) : ''));
  const real = errs.filter((e) => !/favicon/.test(e));
  ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real.slice(0, 4).join(' | ') : ''));
  await page.context().close();

  /* ------------------------------------------------------------------ 2D: unchanged */
  if (part('2d')) {
    const { page: p2, errs: e2 } = await env.newPage({ viewport: { width: 360, height: 640 } });
    await p2.goto(env.url('index.html?r=2d'));
    await until(p2, () => window.BBH && BBH.Eng && BBH.Eng.sceneName === 'title', null, 60000);
    await seed(p2, { day: 1, flags: { intro: 0 } });
    await p2.evaluate(() => BBH.Eng.go('intro', { next: 'new' }));
    ok(await until(p2, () => BBH.Eng.sceneName === 'intro' && BBH.Eng.scene === BBH.Eng.scenes.intro && !BBH.Eng.scene.is3d, null, 30000), '2D: the intro is the painted 2D scene');
    ok(await p2.evaluate(() => !BBH.R3Cine.enabled() && !document.querySelector('.cin')), '2D: no film layer, films are off');
    await p2.evaluate(() => { const C = BBH.Core, ch = C.clone(BBH.G.ch), list = []; ch.day = 3; ch.minutes = 13 * 60 - 360; ch.flags.intro = 1; ch.flags.visited_park = 1; ch.n.jams = 1; C.storyAfter(ch, 'jam', list); BBH.G.setChar(ch); BBH.G.play(list); BBH.Eng.go('place', { id: 'park' }); });
    ok(await until(p2, () => BBH.Eng.sceneName === 'place' && [...document.querySelectorAll('#ui .t')].some((e) => /circle by the graffiti wall/.test(e.textContent)), null, 30000), '2D: the first jam plays as the dialog, with the same lines');
    ok(e2.filter((e) => !/favicon/.test(e)).length === 0, '2D: no console errors');
    await p2.context().close();
  }
} catch (e) { ok(false, 'r3cine threw: ' + (e && e.stack || e)); }
await env.stop(); clearTimeout(watchdog);
done('beatbox_heroes_r3cine');
