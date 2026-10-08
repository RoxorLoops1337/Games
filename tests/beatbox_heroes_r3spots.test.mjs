// r3 SPOT MAP gate (PORT_PLAN 2.5, GAME): the REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader). For EVERY world of the free-roam loop (street, flat, park, shop, lab, bar, hood) and EVERY spotDef id of that
//   world: activate it (world.activate = the same 'spot' event a tap or a walk-in emits) and expect the REAL handler of the 2D game: the sheet title of G.places.ACTIONS, G.enterPlace, E.go('map'), the shop try-on panel,
//   the leave scene, the creator wardrobe, the run scene, the odd job row. Also: the cinematic lock is released (world.done) once the sheet closes, the camera inset follows the sheet, NPC taps map to their handlers
//   (Foxy tip dialog, BeeAmGee bench, clerk counter, Rohzel juice bar, the three regulars' mingle sheets), the park story (no BeeAmGee NPC before the trigger, his bench and the meeting after it, the jam spot and cypher crowd only while the jam is on), closed doors toast the Core.canEnter reason, and the table in r3/spotmap.js has no stale or missing id.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { boot, seed, setClock, goScene, sceneReady, adv, until, drive, sheetTitle, ctl, toasts, closeSheet, skipDialogs, sleep } from './beatbox_heroes_r3gamelib.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };   // BBH_TRACE=1 prints every assertion while developing
const watchdog = setTimeout(() => { console.error('FAIL: r3spots suite hung'); process.exit(1); }, 1500000);
const env = await r3env('beatbox_heroes_r3spots');

const SHEET = {   // place -> spot -> expected outcome
  home: { booth: 'VOCAL BOOTH: TRAIN', couch: 'COUCH', bed: 'BED', desk: 'DESK', kitchen: /^KITCHEN/, wardrobe: { scene: 'creator' }, door: { scene: 'street' } },
  park: { busk: 'BUSKING SPOT', bench: 'BENCH', jam: 'THE JAM', flyers: 'ODD JOB', run: { scene: 'run' }, gate: { scene: 'street' } },
  shop: { hats: { shop: 'hat' }, racks: { shop: 'top' }, mirror: { shop: 'glasses' }, counter: 'COUNTER', door: { scene: 'street' } },
  studio: { mic: 'SOUND LAB: TRAIN', mixer: 'SOUND LAB', door: { scene: 'street' } },
  bar: { stage: 'THE STAGE', counter: 'JUICE BAR', door: { scene: 'street' } },
};
const WORLD = { home: 'flat', park: 'park', shop: 'shop', studio: 'lab', bar: 'bar' };
const match = (want, got) => (want instanceof RegExp ? want.test(got) : want === got);

try {
  const { page, errs } = await boot(env);
  const tab = await page.evaluate(() => ({ table: BBH.R3Spots.TABLE, world: BBH.R3Spots.WORLD, gp: Object.keys(BBH.G.places).sort().join(','), sib: ['street', 'place', 'map'].map((n) => !!BBH.Eng.scenes3d[n] && BBH.Eng.scenes3d[n].is3d).join(',') }));
  ok(['ACTIONS', 'SPOT_FOR', 'TIPS', 'CLERK', 'variantFor', 'jobRow'].every((k) => tab.gp.split(',').includes(k)), 'G.places exports ACTIONS, SPOT_FOR, TIPS, CLERK, variantFor, jobRow (' + tab.gp + ')');
  ok(tab.sib === 'true,true,true', 'E.scenes3d.street, .place and .map are registered 3D siblings');
  await seed(page, { day: 3, minutes: 19 * 60 - 360 });      // Thursday 19:00: every door is open, the bar has its open mic

  /* ------------------------------------------------------------------ street */
  ok(await goScene(page, 'street', {}, 'street'), 'street: the 3D street scene loads on the street world');
  {
    const ids = await page.evaluate(() => BBH.R3.world.spots.spots.map((d) => d.id).sort());
    ok(JSON.stringify(ids) === JSON.stringify(Object.keys(tab.table.street).sort()), 'street: spotDefs ' + ids.join(',') + ' == the mapped ids');
  }
  for (const id of ['park', 'home', 'shop', 'studio', 'bar']) {
    await page.evaluate((id) => BBH.R3.world.activate(id), id);
    const entered = await page.waitForFunction((id) => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs.id === id && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === ({ home: 'flat', studio: 'lab' }[id] || id) && BBH.Eng.scene.w === BBH.R3.world, id, { timeout: 120000 }).then(() => true, () => false);
    ok(entered && await page.evaluate(() => BBH.G.ch.place) === id, 'street door ' + id + ' -> G.enterPlace: the ' + WORLD[id] + ' world, G.ch.place = ' + id);
    await page.evaluate(() => BBH.Eng.go('street', {})); await sceneReady(page, 'street', 'street'); await adv(page, 1);
  }
  ok(await page.evaluate(() => { BBH.R3.world.activate('map'); return true; }) && await until(page, () => BBH.Eng.sceneName === 'map', null, 60000), 'street spot map -> E.go(map)');
  // closed doors: park after 20:00, shop before day 3, lab and bar before day 2. Toast = the Core.canEnter reason, scene unchanged, the lock is released again
  await setClock(page, 1, 22);
  ok(await goScene(page, 'street', {}, 'street'), 'street reloaded on day 1 at 22:00');
  for (const id of ['park', 'shop', 'studio', 'bar']) {
    const reason = await page.evaluate((id) => BBH.Core.canEnter(BBH.G.ch, id).reason, id);
    await page.evaluate((id) => BBH.R3.world.activate(id), id); await sleep(500);
    ok((await toasts(page)).some((t) => t === reason) && await page.evaluate(() => BBH.Eng.sceneName) === 'street', 'closed door ' + id + ' toasts "' + reason + '" and stays on the street');
    ok(await page.evaluate((id) => !!BBH.R3.world.spots.getSpotState(id).locked && BBH.R3.world.terrain.state(id) === 'closed', id), 'closed door ' + id + ' has the locked state and the closed look');
    ok(await until(page, () => BBH.R3.world.controls.inSpot === null && !BBH.R3.world.controls.locked, null, 30000), 'closed door ' + id + ': the world is released again (done)');
  }

  /* ------------------------------------------------------------------ the story in the park (STORY_PLAN.md): BeeAmGee is not there at the start, the jam */
  {
    const park = () => page.evaluate(() => { const w = BBH.R3.world, j = w.spots.byId.jam, st = w.terrain.story; return { bee: w.npcs.some((n) => n.id === 'beeamgee'), jamPlaced: !!(j && j.placed && j.root.visible), crowd: !!(st && st.jam && st.jam.group.visible), on: !!(st && st.on()), bench: w.spots.byId.bench.label, ids: w.spots.spots.map((s) => s.id).sort().join(',') }; });
    const dlgName = () => page.evaluate(() => { const e = document.querySelector('#r3kit .k3-name'); return document.querySelector('#r3kit .k3-dlg') && e ? e.textContent : ''; });
    await seed(page, { day: 2, minutes: 10 * 60 - 360 });                 // a fresh hero on day 2 at 10:00 who busked once: nobody has noticed them, the jam has not started
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.n.busks = 1; BBH.G.setChar(ch); window.__toasts = []; for (const E of new Set([BBH.Eng, BBH.E].filter(Boolean))) { const t0 = E.toast; E.toast = function (text) { window.__toasts.push(String(text)); return t0.apply(this, arguments); }; } });
    ok(await goScene(page, 'place', { id: 'park' }, 'park'), 'story: the park loads for a new hero');
    let s = await park();
    ok(!s.bee && s.bench === 'REST', 'story: before the trigger the park has NO BeeAmGee NPC (' + JSON.stringify(s) + ')');
    ok(!s.jamPlaced && !s.crowd && !s.on && s.ids.split(',').includes('jam'), 'story: at 10:00 the jam spot and the cypher crowd are hidden');
    ok(await page.evaluate(() => BBH.Eng.scene.sc && BBH.R3Spots.goalSpot('park') === 'jam' && /JAM/.test(BBH.G.goal(BBH.G.ch))), 'story: the goal points at the JAM in the park (' + await page.evaluate(() => BBH.G.goal(BBH.G.ch)) + ')');
    await page.evaluate(() => BBH.G.do({ t: 'wait', minutes: 150 }));      // the clock crosses 12:00 while the player is in the park
    ok(await until(page, () => window.__toasts.some((t) => /JAM has started/.test(t)), null, 20000), 'story: crossing 12:00 toasts that the jam has started');
    ok(await until(page, () => { const w = BBH.R3.world, j = w.spots.byId.jam; return j.placed && j.root.visible && w.terrain.story.jam.group.visible; }, null, 30000), 'story: the jam spot and the cypher crowd appear in the park');
    ok(await until(page, () => !!BBH.R3.world.spots.getSpotState('jam').goal, null, 20000), 'story: the jam spot carries the goal beacon');
    ok(await page.evaluate(() => { const st = BBH.R3.world.terrain.story; return st.jam.crowd.count >= 10 && st.jam.crew.length === 2; }), 'story: the cypher is an instanced crowd ring plus two named beatboxers');
    await page.evaluate(() => BBH.R3.world.activate('jam'));
    ok(await until(page, () => { const e = document.querySelector('#ui .sheet .h2'); return !!e && e.textContent.trim() === 'THE JAM' && [...document.querySelectorAll('#ui .sheet .btn')].some((b) => /JOIN THE CYPHER/.test(b.textContent)); }, null, 30000), 'story: the jam spot opens THE JAM sheet with JOIN THE CYPHER');
    await closeSheet(page); await until(page, () => BBH.R3.world.controls.inSpot === null && !BBH.R3.world.controls.locked, null, 40000);
    // the trigger: BeeAmGee watched from the back of the cypher yesterday -> today he waits on his bench and the visit opens with the meeting
    await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.n.jams = 2; ch.flags.bmgSighted = 2; ch.flags.bmgVia = 'jam'; ch.day = 3; ch.minutes = 14 * 60 - 360; BBH.G.setChar(ch); });
    ok(await goScene(page, 'place', { id: 'park' }, 'park'), 'story: the park reloads the next day');
    s = await park();
    ok(s.bee && s.bench === 'TALK' && s.jamPlaced && s.crowd, 'story: after the trigger BeeAmGee sits on his bench, and the 14:00 jam is lit (' + JSON.stringify(s) + ')');
    ok(await until(page, () => !!document.querySelector('#r3kit .k3-dlg'), null, 30000) && await dlgName() === 'BeeAmGee', 'story: the visit opens with the meeting, BeeAmGee speaks');
    ok(await page.evaluate(() => BBH.G.ch.flags.bmgMet === 3 && BBH.G.ch.seen.beeamgee === 3), 'story: the first-meeting flag is saved');
    await skipDialogs(page, 20);
    ok(await until(page, () => !document.querySelector('#r3kit .k3-dlg') && BBH.G.ch.sounds.includes('LR') && BBH.G.storyFx.length === 0, null, 30000), 'story: after the meeting dialog the held effects play (the lip roll is unlocked)');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button, .btn')].find((x) => /^\s*LATER\s*$/.test(x.textContent)); if (b) b.click(); });
    await until(page, () => BBH.R3.world.controls.enabled === true, null, 20000);
    ok(await goScene(page, 'place', { id: 'park' }, 'park') && (await park()).bee, 'story: on the next visit he is still on his bench');
    await sleep(1500); ok(!(await dlgName()), 'story: and the meeting does not play twice');
    await page.evaluate(() => BBH.G.do({ t: 'wait', minutes: 240 }));      // 18:00: the jam is over
    ok(await until(page, () => { const w = BBH.R3.world; return !w.spots.byId.jam.placed && !w.terrain.story.jam.group.visible; }, null, 30000), 'story: after 18:00 the jam spot and the crowd are gone again');
    await seed(page, { day: 3, minutes: 19 * 60 - 360, flags: { bmgMet: 1 } });
  }

  /* ------------------------------------------------------------------ places */
  for (const place of ['home', 'park', 'shop', 'studio', 'bar']) {
    await setClock(page, 3, place === 'park' ? 15 : 19);                   // the park at 15:00: the jam is on, so its spot is live too
    const wid = WORLD[place], S = SHEET[place];
    ok(await goScene(page, 'place', { id: place }, wid), place + ': the 3D place scene loads on the ' + wid + ' world');
    const ids = await page.evaluate(() => BBH.R3.world.spots.spots.map((d) => d.id).sort());
    ok(JSON.stringify(ids) === JSON.stringify(Object.keys(tab.table[place]).sort()) && JSON.stringify(ids) === JSON.stringify(Object.keys(S).sort()), place + ': spotDefs ' + ids.join(',') + ' == the mapped ids');
    for (const id of Object.keys(S)) {
      const exp = S[id];
      if (exp.scene) continue;                                        // scene changers run last
      await page.evaluate((id) => BBH.R3.world.activate(id), id);
      if (exp.shop) {
        const o = await until(page, (t) => BBH.Eng.scene.shop && BBH.Eng.scene.shop.tab === t, exp.shop, 30000);
        ok(o, place + ' spot ' + id + ' opens the shop try-on on the ' + exp.shop + ' tab');
        ok((await ctl(page)).inSpot === id || (await ctl(page)).inSpot === null, place + ' spot ' + id + ': the player is in the spot cinematic or already at the mirror');
        ok(await until(page, () => !!BBH.Eng.scene._try && BBH.R3.world.controls.state().inset.bottom > 100, null, 30000), place + ' spot ' + id + ': try-on is live and the camera leaves room for the panel');
        await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .btn')].find((x) => x.textContent.trim() === 'LEAVE SHOP'); if (b) b.click(); });
      } else {
        const o = await until(page, ([t, re]) => { const e = document.querySelector('#ui .sheet .h2'); const s = e ? e.textContent.trim() : ''; return re ? new RegExp(t).test(s) : s === t; }, [exp instanceof RegExp ? exp.source : exp, exp instanceof RegExp], 30000);
        const got = await sheetTitle(page);
        ok(o && match(exp, got), place + ' spot ' + id + ' opens the sheet "' + got + '"');
        const c = await ctl(page);
        ok(c.inSpot === id && c.locked, place + ' spot ' + id + ': the spot cinematic holds the player while the sheet is open (' + c.inSpot + ')');
        await adv(page, 1); await sleep(200);
        ok((await ctl(page)).inset.bottom > 100, place + ' spot ' + id + ': the camera inset follows the sheet (' + (await ctl(page)).inset.bottom + ' px)');
        await closeSheet(page);
      }
      ok(await until(page, () => BBH.R3.world.controls.inSpot === null && !BBH.R3.world.controls.locked && BBH.R3.world.controls.state().inset.bottom === 0, null, 40000), place + ' spot ' + id + ': closing it releases the world (done) and the inset');
    }
    // NPC taps
    const npcs = await page.evaluate(() => (BBH.R3.world.npcs || []).map((n) => n.id).filter((x) => x !== 'bouncer'));
    const NPC = { home: { foxy: 'dialog' }, park: { beeamgee: 'BENCH' }, shop: { clerk: 'COUNTER' }, studio: {}, bar: { rohzel: 'JUICE BAR', regular0: 'mingle', regular1: 'mingle', regular2: 'mingle' } }[place];
    for (const nid of Object.keys(NPC)) {
      ok(npcs.includes(nid), place + ': the world has the NPC ' + nid);
      await page.evaluate((nid) => BBH.R3.world.events.emit('npc', { id: nid, scene: BBH.R3.world.id }), nid);
      if (NPC[nid] === 'dialog') {
        ok(await until(page, () => !!document.querySelector('#r3kit .k3-dlg'), null, 20000), place + ' NPC ' + nid + ' opens her tip dialog');
        ok(await until(page, () => BBH.R3.world.controls.enabled === false && BBH.R3.world.controls.state().focusId === 'foxy', null, 20000), place + ' NPC ' + nid + ': the dialog blocks world input and the camera focuses the speaker');
        await skipDialogs(page);
        ok(await until(page, () => BBH.R3.world.controls.enabled === true, null, 20000), place + ' NPC ' + nid + ': the world input is back after the dialog');
      } else if (NPC[nid] === 'mingle') {
        const who = await page.evaluate((nid) => { const w = BBH.R3.world; return (w.regularOf || w.terrain.api.regularOf).call(w.bar || w, nid); }, nid);
        const want = await page.evaluate(([who, i]) => ({ name: BBH.Core.NPCS[who].name.toUpperCase(), same: BBH.Eng.scene.regulars()[i].id === who }), [who, +nid.slice(7)]);
        ok(await until(page, (t) => { const e = document.querySelector('#ui .sheet .h2'); return !!e && e.textContent.trim() === t; }, want.name, 20000) && want.same, place + ' NPC ' + nid + ' (' + who + ') opens the mingle sheet ' + want.name + ', same regular as the 2D scene');
        await closeSheet(page);
      } else {
        ok(await until(page, (t) => { const e = document.querySelector('#ui .sheet .h2'); return !!e && e.textContent.trim() === t; }, NPC[nid], 20000), place + ' NPC ' + nid + ' opens the sheet ' + NPC[nid]);
        await closeSheet(page);
      }
      await sleep(250);
    }
    // scene changers (door, wardrobe, run) last, each from a fresh place scene
    for (const id of Object.keys(S)) {
      const exp = S[id]; if (!exp.scene) continue;
      if (await page.evaluate(() => BBH.Eng.sceneName) !== 'place') ok(await goScene(page, 'place', { id: place }, wid), place + ': back in the place');
      await page.evaluate((id) => BBH.R3.world.activate(id), id);
      const o = await until(page, (n) => BBH.Eng.sceneName === n, exp.scene, 90000);
      ok(o, place + ' spot ' + id + ' -> scene ' + exp.scene + (exp.scene === 'creator' ? ' (wardrobe mode: ' + await page.evaluate(() => BBH.Eng.sceneArgs.mode) + ')' : ''));
      if (exp.scene === 'street') ok(await page.evaluate((p) => BBH.Eng.sceneArgs.from === p && BBH.G.ch.place === 'street', place), place + ' spot ' + id + ': G.ch.place is the street and the street knows you came out of ' + place);
      if (exp.scene === 'run') ok(await page.evaluate((p) => BBH.Eng.sceneArgs.back.args.id === p, place), 'park spot run: E.go(run) with back to the park');
      await sleep(400);
    }
  }

  /* ------------------------------------------------------------------ hood */
  ok(await goScene(page, 'map', {}, 'hood'), 'hood: the 3D map scene loads on the hood world');
  {
    const ids = await page.evaluate(() => BBH.R3.world.spots.spots.map((d) => d.id).sort());
    ok(JSON.stringify(ids) === JSON.stringify(Object.keys(tab.table.hood).sort()), 'hood: spotDefs ' + ids.join(',') + ' == the mapped ids');
    const NAMES = { home: 'HOME', park: 'PARK', shop: 'THRIFT SHOP', studio: 'SOUND LAB', bar: 'THE BAR' };
    for (const id of ids) {
      await page.evaluate((id) => BBH.R3.world.activate(id), id);
      ok(await until(page, ([id, nm]) => !!BBH.Eng.scene.card && BBH.Eng.scene.sel === id && BBH.Eng.scene.card.textContent.indexOf(nm) >= 0, [id, NAMES[id]], 20000), 'hood pin ' + id + ' opens the travel card for ' + NAMES[id]);
    }
    // GO THERE on an open pin travels like the street door
    await page.evaluate(() => BBH.R3.world.activate('shop'));
    await until(page, () => BBH.Eng.scene.sel === 'shop', null, 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /GO THERE|ENTER/.test(x.textContent)); if (b) b.click(); });
    ok(await until(page, () => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs.id === 'shop', null, 90000), 'hood card GO THERE -> the shop (G.enterPlace)');
  }
  ok(errs.length === 0, 'no console or page errors in the spot map flow' + (errs.length ? ': ' + errs.slice(0, 5).join(' || ') : ''));
  await page.context().close();
} catch (e) {
  ok(false, 'r3spots suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done();
