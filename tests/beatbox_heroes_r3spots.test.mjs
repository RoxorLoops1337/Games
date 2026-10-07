// r3 SPOT MAP gate (PORT_PLAN 2.5, GAME): the REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader). For EVERY world of the free-roam loop (street, flat, park, shop, lab, bar, hood) and EVERY spotDef id of that
//   world: activate it (world.activate = the same 'spot' event a tap or a walk-in emits) and expect the REAL handler of the 2D game: the sheet title of G.places.ACTIONS, G.enterPlace, E.go('map'), the shop try-on panel,
//   the leave scene, the creator wardrobe, the run scene, the odd job row. Also: the cinematic lock is released (world.done) once the sheet closes, the camera inset follows the sheet, NPC taps map to their handlers
//   (Foxy tip dialog, BeeAmGee bench, clerk counter, Rohzel juice bar, the three regulars' mingle sheets), closed doors toast the Core.canEnter reason, and the table in r3/spotmap.js has no stale or missing id.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { boot, seed, setClock, goScene, sceneReady, adv, until, drive, sheetTitle, ctl, toasts, closeSheet, skipDialogs, sleep } from './beatbox_heroes_r3gamelib.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };   // BBH_TRACE=1 prints every assertion while developing
const watchdog = setTimeout(() => { console.error('FAIL: r3spots suite hung'); process.exit(1); }, 1500000);
const env = await r3env('beatbox_heroes_r3spots');

const SHEET = {   // place -> spot -> expected outcome
  home: { booth: 'VOCAL BOOTH: TRAIN', couch: 'COUCH', bed: 'BED', desk: 'DESK', kitchen: /^KITCHEN/, wardrobe: { scene: 'creator' }, door: { scene: 'street' } },
  park: { busk: 'BUSKING SPOT', bench: 'BENCH', flyers: 'ODD JOB', run: { scene: 'run' }, gate: { scene: 'street' } },
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

  /* ------------------------------------------------------------------ places */
  for (const place of ['home', 'park', 'shop', 'studio', 'bar']) {
    await setClock(page, 3, 19);
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
