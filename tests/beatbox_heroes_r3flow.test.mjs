// r3 FLOW gate (PORT_PLAN 6, GAME): the REAL game in 3D (?r=3d&q=low, headless Chromium + swiftshader) as a player plays it, with real clicks and walks (world.walkToSpot + injected simulation time):
//   new game through the 3D creator -> intro SKIP -> the 3D street with Foxy's first-run dialog -> HUD (stats, goal chip, nav dock, MAP, MENU) -> locked doors toast and show the lock -> every open door walks you in
//   (park, home, shop, lab, bar) -> the home spots open the expected sheets, the wardrobe opens the creator and comes back -> LEAVE / the door returns to the street at the right door -> closed doors (day gate, Monday bar,
//   park after 20:00) -> the hood map -> sleep shows the morning card before the home world -> time of day and rain follow the clock in every world -> live fallback to the 2D scenes, and the 2D default untouched.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok as ok0, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { boot, seed, setClock, goScene, sceneReady, adv, until, drive, sheetTitle, ctl, toasts, closeSheet, skipDialogs, glVaried, sleep } from './beatbox_heroes_r3gamelib.mjs';

const ok = (c, m) => { if (process.env.BBH_TRACE) console.log((c ? '  ok   ' : '  FAIL ') + m); ok0(c, m); };   // BBH_TRACE=1 prints every assertion while developing
const watchdog = setTimeout(() => { console.error('FAIL: r3flow suite hung'); process.exit(1); }, 1700000);
const env = await r3env('beatbox_heroes_r3flow');
const click = async (page, sel, txt, ms) => { await page.locator(sel, txt ? { hasText: txt } : undefined).first().click({ timeout: ms || 15000 }); };
const dock = (page, label) => page.locator('#hud3 .h3-nb', { hasText: label }).first().click({ timeout: 15000, force: true });   // the goal button pulses, so it is never 'stable'
const place = (page) => page.evaluate(() => BBH.G.ch.place);
const hudText = (page) => page.evaluate(() => { const h = document.querySelector('#hud3 .h3'); return h ? h.innerText.replace(/\s+/g, ' ') : ''; });
// walk to a street door with the dock button and wait for the place scene
async function enterByDock(page, label, id, world) {
  await dock(page, label);
  const hit = await drive(page, (id) => BBH.Eng.sceneName === 'place' && BBH.Eng.sceneArgs.id === id, id, 40);
  const ready = hit && await sceneReady(page, 'place', world, 120000); if (ready) { await sleep(300); await adv(page, 1); }
  return ready;
}

try {
  /* ------------------------------------------------------------------ new game: title -> slots -> creator -> intro -> street */
  const { page, errs } = await boot(env);
  await page.mouse.click(180, 320); await sleep(500);
  await click(page, '#ui .btn', 'NEW GAME'); ok(await sceneReady(page, 'slots', 'title'), 'NEW GAME opens the 3D slot picker');
  await sleep(600); await page.locator('#ui .panel').first().click();
  ok(await sceneReady(page, 'creator', 'creator'), 'an empty slot opens the 3D creator');
  await sleep(1500);
  await click(page, '#ui .btn', 'GO!'); await sleep(500);
  ok((await toasts(page)).some((t) => /name/i.test(t)) && await page.evaluate(() => BBH.Eng.sceneName) === 'creator', 'GO! without a name asks for one (the 2D rule, toast in the 3D kit)');
  await page.locator('#ui input[type=text]').fill('Nova'); await sleep(400);
  await click(page, '#ui .btn', 'GO!');
  ok(await until(page, () => BBH.Eng.sceneName === 'intro', null, 90000), 'GO! with a name starts the game: Core.newChar, the intro (a 2D scene in mixed mode)');
  ok(await page.evaluate(() => BBH.G.ch.name === 'Nova' && !BBH.R3.active && !document.body.classList.contains('r3')), 'the intro runs on the 2D canvas (the 3D layer is hidden)');
  await sleep(1500); await click(page, '#ui .btn', 'SKIP');
  ok(await sceneReady(page, 'street', 'street', 240000), 'intro SKIP -> the 3D street scene on the street world');
  ok(await page.evaluate(() => BBH.Eng.sceneArgs.tutorial === true && BBH.G.ch.flags.intro === 1), 'the street was entered with the tutorial flag');

  // Foxy waits at the home stoop and runs the first-run dialog
  ok(await until(page, () => !!document.querySelector('#r3kit .k3-dlg'), null, 60000), 'the first-run dialog opens in the 3D UI kit');
  const dl = await page.evaluate(() => ({ ids: BBH.R3.world.npcs.map((n) => n.id).sort().join(','), enabled: BBH.R3.world.controls.enabled, txt: document.querySelector('#r3kit .k3-name') && document.querySelector('#r3kit .k3-name').textContent }));
  ok(dl.ids === 'bouncer,foxy' && dl.txt === 'Foxy', 'Foxy is in the street world and speaks (' + dl.ids + ')');
  ok(dl.enabled === false, 'the dialog blocks world input (E.hooks.uiBlock -> controls.setEnabled)');
  ok(await until(page, () => BBH.R3.world.controls.state().focusId === 'foxy', null, 30000), 'the camera focuses the speaker (E.hooks.dialogLine -> world.focus)');
  await skipDialogs(page, 20);
  ok(await until(page, () => [...document.querySelectorAll('#ui .h1')].some((e) => /HOW TO PLAY/.test(e.textContent)), null, 20000), 'after the dialog the HOW TO PLAY card opens (G.openHelp, as in 2D)');
  await click(page, '#ui .btn', 'GOT IT'); await sleep(300);
  ok(await until(page, () => BBH.R3.world.controls.enabled === true && BBH.R3.world.controls.state().focusId === null, null, 30000), 'world input and camera are released after the dialog');

  // HUD in 3D mode: the UI kit, not the 2D bars
  {
    const h = await page.evaluate(() => { const g = BBH.G, ch = g.ch, el = document.querySelector('#hud3 .h3'); const dk = el && el.querySelector('.h3-dock'); return { has: !!el, clock: el && el.querySelector('.h3-clk').innerText.replace(/\s+/g, ' '), cash: el && el.querySelector('.cash').innerText, goal: el && el.querySelector('.h3-goal').innerText.trim(), want: g.goal(ch), dockShown: !!dk && !dk.hidden, nb: el ? el.querySelectorAll('.h3-nb').length : 0, map: !!(el && el.querySelector('.h3-btn.cy')), menu: [...(el ? el.querySelectorAll('.h3-btn') : [])].map((b) => b.textContent.trim()).join(','), old2d: !!document.querySelector('#ui .chip.gold'), hudEl: BBH.Eng.hudEl === el }; });
    ok(h.has && h.hudEl && /\d\d:\d\d/.test(h.clock) && h.cash.indexOf('$') >= 0, 'R3UI.hud is mounted and is E.hudEl: ' + h.clock + ' ' + h.cash);
    ok(h.goal === h.want, 'the goal chip shows G.goal: ' + h.goal);
    ok(h.dockShown && h.nb === 5, 'the nav dock with the 5 place buttons is shown on the street');
    ok(/MAP/.test(h.menu) && /MENU/.test(h.menu) && !/LEAVE/.test(h.menu), 'MAP and MENU buttons are in the HUD (no LEAVE on the street): ' + h.menu);
    const gd = await page.evaluate(() => ({ door: BBH.G.goalDoor(), st: BBH.R3.world.spots.getSpotState(BBH.G.goalDoor()), btn: [...document.querySelectorAll('#hud3 .h3-nb.goal')].map((b) => b.textContent.trim()) }));
    ok(gd.door === 'park' && gd.st && gd.st.goal === true && gd.btn.join() === 'PARK', 'the goal door (park) has the beacon in the world and the dock highlight (G.goalDoor)');
  }

  // closed doors on day 1: shop (day 3), lab and bar (day 2) are locked, with the lock in the world, the dock and a toast
  {
    const lk = await page.evaluate(() => ({ locked: ['shop', 'studio', 'bar'].map((id) => !!BBH.R3.world.spots.getSpotState(id).locked && BBH.R3.world.terrain.state(id) === 'closed'), open: ['park', 'home'].map((id) => !BBH.R3.world.spots.getSpotState(id).locked), dock: [...document.querySelectorAll('#hud3 .h3-nb.locked')].map((b) => b.textContent.trim()).join(',') }));
    ok(lk.locked.every(Boolean) && lk.open.every(Boolean), 'shop, lab and bar are locked and closed-looking on day 1, park and home are open (' + lk.dock + ')');
    const reason = await page.evaluate(() => BBH.Core.canEnter(BBH.G.ch, 'shop').reason);
    await dock(page, 'SHOP'); await sleep(500);
    ok((await toasts(page)).some((t) => t === reason) && await page.evaluate(() => BBH.Eng.sceneName) === 'street', 'tapping a locked dock button toasts the Core.canEnter reason and stays on the street: ' + reason);
    ok(await page.evaluate(() => BBH.R3.world.controls.state().moving === false), 'and the player does not walk');
  }
  const gl = await glVaried(page); ok(gl.lit > 800 && gl.colours >= 8, 'the street GL canvas is lit and colourful (' + gl.colours + ' colours)');
  await page.screenshot({ path: process.env.BBH_SHOTS ? process.env.BBH_SHOTS + 'game_flow_street.png' : '/dev/null' }).catch(() => {});

  /* ------------------------------------------------------------------ the park: walk in from the dock, first-visit dialog, LEAVE */
  ok(await enterByDock(page, 'PARK', 'park', 'park'), 'dock PARK: the player walks to the gate and the park world loads');
  ok(await place(page) === 'park', 'G.ch.place is the park (G.enterPlace -> travel)');
  ok(await until(page, () => !!document.querySelector('#r3kit .k3-dlg'), null, 60000) && await page.evaluate(() => document.querySelector('#r3kit .k3-name').textContent) === 'The Park', 'first visit: the park explains itself (2D firstVisit through the 3D dialog), BeeAmGee has not noticed you yet');
  await skipDialogs(page, 20); await until(page, () => BBH.R3.world.controls.enabled === true, null, 20000);
  {
    const h = await page.evaluate(() => ({ leave: !!document.querySelector('#hud3 .h3-btn.lv'), dockShown: !document.querySelector('#hud3 .h3-dock').hidden }));
    ok(h.leave && !h.dockShown, 'in a place the HUD has LEAVE and no nav dock');
    ok(await page.evaluate(() => !BBH.R3.world.npcs.some((n) => n.id === 'beeamgee') && BBH.R3.world.spots.byId.bench.label === 'REST'), 'day 1 of a new game: BeeAmGee is not on the bench yet (the story brings him later)');
  }
  // leave with the LEAVE chip: the street, standing at the park gate
  await click(page, '#hud3 .h3-btn.lv');
  ok(await sceneReady(page, 'street', 'street'), 'LEAVE returns to the street');
  { const c = await ctl(page); ok(c.x < -26, 'the street start is at the park gate (x ' + c.x + ', arrival by args.from)'); ok(await place(page) === 'street', 'G.ch.place is the street'); }

  /* ------------------------------------------------------------------ home: walk in, spots open the right sheets */
  ok(await enterByDock(page, 'HOME', 'home', 'flat'), 'dock HOME: the player walks to the stoop and the flat loads');
  ok(await until(page, () => !!document.querySelector('#r3kit .k3-dlg'), null, 60000), 'first visit: Foxy explains the flat');
  await skipDialogs(page, 20); await until(page, () => BBH.R3.world.controls.enabled === true, null, 20000);
  const WALK = { bed: 'BED', couch: 'COUCH', desk: 'DESK', kitchen: /^KITCHEN/, booth: 'VOCAL BOOTH: TRAIN' };
  for (const id of Object.keys(WALK)) {
    await page.evaluate(() => BBH.R3.world.teleport('door'));        // every walk starts at the entrance (the flat's desk -> kitchen route is checked by the world suites)
    await adv(page, 0.5);
    await page.evaluate((id) => BBH.R3.world.walkToSpot(id, { run: true }), id);
    const hit = await drive(page, () => !!document.querySelector('#ui .sheet .h2'), null, 40);
    const t = await sheetTitle(page);
    ok(hit && (WALK[id] instanceof RegExp ? WALK[id].test(t) : t === WALK[id]), 'walking to the ' + id + ' opens the sheet "' + t + '"');
    await closeSheet(page);
    ok(await until(page, () => BBH.R3.world.controls.inSpot === null && !BBH.R3.world.controls.locked, null, 40000), 'closing the ' + id + ' sheet gives the player back (done)');
  }
  // tapping the world while a sheet is open closes it first (2D: walkTo -> closeSheet), and the same tap walks away
  await page.evaluate(() => BBH.R3.world.walkToSpot('couch', { run: true })); await drive(page, () => !!document.querySelector('#ui .sheet .h2'), null, 40);
  await page.mouse.click(180, 110); await sleep(600);
  ok(await page.evaluate(() => !BBH.Eng.scene.sheetEl && !document.querySelector('#ui .sheet')), 'a tap on the world closes the open sheet');
  ok(await until(page, () => BBH.R3.world.controls.inSpot === null && !BBH.R3.world.controls.locked, null, 40000), 'and releases the player');
  // the kitchen: buying food updates the HUD
  await page.evaluate(() => { const ch = BBH.Core.clone(BBH.G.ch); ch.hunger = 30; BBH.G.setChar(ch); });
  await page.evaluate(() => BBH.R3.world.activate('kitchen')); await until(page, () => !!document.querySelector('#ui .sheet .btn'), null, 20000);
  const cash0 = await page.evaluate(() => BBH.G.ch.cash); await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .scroll .btn')][0]; if (b) b.click(); }); await sleep(600);
  ok(await page.evaluate((c) => BBH.G.ch.cash < c && document.querySelector('#hud3 .cash').innerText.indexOf('$' + BBH.G.ch.cash) >= 0 && !!document.querySelector('#ui .sheet'), cash0), 'eating spends cash, the HUD cash chip follows and the kitchen sheet stays open');
  await closeSheet(page); await until(page, () => BBH.R3.world.controls.inSpot === null, null, 30000);
  // wardrobe -> creator (wardrobe mode) -> back to the flat
  await page.evaluate(() => BBH.R3.world.walkToSpot('wardrobe', { run: true }));
  ok(await drive(page, () => BBH.Eng.sceneName === 'creator', null, 40) && await page.evaluate(() => BBH.Eng.sceneArgs.mode === 'wardrobe'), 'walking to the wardrobe opens the 3D creator in wardrobe mode');
  ok(await sceneReady(page, 'creator', 'creator'), 'the creator world loads');
  await sleep(1200); await page.locator('#ui .row .btn').first().click();
  ok(await sceneReady(page, 'place', 'flat'), 'the creator back button returns to the flat (same 3D place scene)');
  // the door -> the street, at the home stoop
  await page.evaluate(() => BBH.R3.world.walkToSpot('door', { run: true }));
  ok(await drive(page, () => BBH.Eng.sceneName === 'street', null, 40) && await sceneReady(page, 'street', 'street'), 'walking to the flat door returns to the street');
  { const c = await ctl(page); ok(c.x > -17 && c.x < -12, 'the street start is at the home stoop (x ' + c.x + ')'); }

  /* ------------------------------------------------------------------ shop, lab, bar once they are open */
  await setClock(page, 3, 19);
  await page.evaluate(() => BBH.G.setChar(Object.assign({}, BBH.G.ch, { cash: 400 })));
  ok(await sceneReady(page, 'street', 'street'), 'still on the street at Thursday 19:00');
  ok(await until(page, () => ['park', 'home', 'shop', 'studio', 'bar'].every((id) => !BBH.R3.world.spots.getSpotState(id).locked && BBH.R3.world.terrain.state(id) === 'open'), null, 30000), 'at Thursday 19:00 every door is open: the locks follow the clock (G.setChar -> sync), no reload needed');
  for (const [label, id, wid, sheets] of [['SHOP', 'shop', 'shop', ['counter', 'COUNTER']], ['LAB', 'studio', 'lab', ['mixer', 'SOUND LAB']], ['BAR', 'bar', 'bar', ['stage', 'THE STAGE']]]) {
    ok(await enterByDock(page, label, id, wid), 'dock ' + label + ': walks to the door and the ' + wid + ' world loads');
    await until(page, () => !!document.querySelector('#r3kit .k3-dlg'), null, 20000); await skipDialogs(page, 20); await until(page, () => BBH.R3.world.controls.enabled === true, null, 20000);
    await page.evaluate((s) => BBH.R3.world.walkToSpot(s, { run: true }), sheets[0]);
    const hit = await drive(page, () => !!document.querySelector('#ui .sheet .h2'), null, 40);
    ok(hit && await sheetTitle(page) === sheets[1], id + ': walking to the ' + sheets[0] + ' opens "' + sheets[1] + '"');
    await closeSheet(page); await until(page, () => BBH.R3.world.controls.inSpot === null, null, 30000);
    if (id === 'shop') {          // try-on is mirrored live to the 3D player
      await page.evaluate(() => BBH.R3.world.activate('hats')); await until(page, () => !!BBH.Eng.scene.shop, null, 30000); await sleep(600);
      const before = await page.evaluate(() => JSON.stringify(BBH.R3.world.player.getLook()));
      await page.evaluate(() => { const t = [...document.querySelectorAll('#ui .tile')].filter((x) => !x.classList.contains('on'))[1]; if (t) t.click(); });
      await until(page, () => BBH.Eng.scene.shop.look.hat.id !== BBH.G.ch.look.hat.id && BBH.R3.world.player.getLook().hat.id === BBH.Eng.scene.shop.look.hat.id, null, 30000);
      const after = await page.evaluate(() => ({ look: JSON.stringify(BBH.R3.world.player.getLook()), tried: BBH.Eng.scene.shop.look.hat.id, worn: BBH.G.ch.look.hat.id }));
      ok(before !== after.look && JSON.parse(after.look).hat.id === after.tried && after.tried !== after.worn, 'shop try-on: the 3D player wears the item you tapped (' + after.tried + ') while the save still has ' + after.worn);
      await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .btn')].find((x) => x.textContent.trim() === 'LEAVE SHOP'); if (b) b.click(); });
      ok(await until(page, () => !BBH.Eng.scene.shop && BBH.R3.world.player.getLook().hat.id === BBH.G.ch.look.hat.id, null, 30000), 'leaving the shop restores the real look on the 3D player');
      await until(page, () => BBH.R3.world.controls.inSpot === null, null, 30000);
    }
    await click(page, '#hud3 .h3-btn.lv');
    ok(await sceneReady(page, 'street', 'street'), id + ': LEAVE returns to the street');
    ok((await ctl(page)).x > ({ shop: -3, studio: 9, bar: 23 })[id] - 0, id + ': the street start is at the ' + id + ' door (x ' + (await ctl(page)).x + ')');
  }

  /* ------------------------------------------------------------------ closed doors: Monday bar, park after 20:00 */
  {
    const monday = await page.evaluate(() => { for (let d = 3; d < 20; d++) if (BBH.Core.barProgramme(d).id === 'closed') return d; return 0; });
    await setClock(page, monday, 21);
    const shut = await until(page, () => ['bar', 'park'].every((id) => !!BBH.R3.world.spots.getSpotState(id).locked && BBH.R3.world.terrain.state(id) === 'closed'), null, 30000);
    const lk = await page.evaluate(() => ({ reason: BBH.Core.canEnter(BBH.G.ch, 'bar').reason, parkOpen: BBH.Core.canEnter(BBH.G.ch, 'park').ok }));
    ok(shut && /closed on Mondays/.test(lk.reason) && !lk.parkOpen, 'Monday 21:00: the bar shows closed (' + lk.reason + ') and so does the park (lock state + closed look follow the clock)');
    await dock(page, 'BAR'); await sleep(500);
    ok((await toasts(page)).some((t) => /closed on Mondays/.test(t)) && await page.evaluate(() => BBH.Eng.sceneName) === 'street', 'the Monday bar toasts and you stay on the street');
    await page.evaluate(() => BBH.R3.world.activate('park')); await sleep(500);
    ok((await toasts(page)).some((t) => /Park is closed/.test(t)), 'walking into the closed park door toasts "Park is closed..."');
    ok(await until(page, () => BBH.R3.world.controls.inSpot === null && !BBH.R3.world.controls.locked, null, 30000), 'and the player is released');
    await setClock(page, 3, 19);
    ok(await until(page, () => ['park', 'bar'].every((id) => !BBH.R3.world.spots.getSpotState(id).locked && BBH.R3.world.terrain.state(id) === 'open'), null, 30000), 'back at Thursday 19:00 the doors re-open (no reload)');
  }

  /* ------------------------------------------------------------------ hood map */
  await click(page, '#hud3 .h3-btn.cy');
  ok(await sceneReady(page, 'map', 'hood'), 'MAP opens the 3D hood map');
  await sleep(800);
  {
    const m = await page.evaluate(() => ({ ui: document.getElementById('ui').innerText, hud: !!document.querySelector('#hud3 .h3') }));
    ok(/BACK/.test(m.ui) && /TAP A PLACE/.test(m.ui) && m.hud, 'the map has BACK, the hint and the HUD');
    await page.evaluate(() => BBH.R3.world.activate('bar')); await sleep(600);
    ok(await page.evaluate(() => !!BBH.Eng.scene.card && /THE BAR/.test(BBH.Eng.scene.card.textContent) && /GO THERE|ENTER/.test(BBH.Eng.scene.card.textContent)), 'a pin opens the travel card');
    await click(page, '#ui .btn', 'BACK');
    ok(await sceneReady(page, 'street', 'street'), 'BACK returns to the street (G.resume)');
  }

  /* ------------------------------------------------------------------ sleep: the morning card shows before the home world */
  await setClock(page, 3, 21);
  ok(await goScene(page, 'place', { id: 'home' }, 'flat'), 'home at 21:00');
  await page.evaluate(() => BBH.R3.world.walkToSpot('bed', { run: true }));
  await drive(page, () => !!document.querySelector('#ui .sheet .h2'), null, 40);
  const day0 = await page.evaluate(() => BBH.G.ch.day);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => /^SLEEP/.test(x.textContent.trim())); if (b) b.click(); });
  ok(await until(page, () => !!document.querySelector('#ui .full') && /NEW DAY|PASSED OUT/.test(document.getElementById('ui').innerText), null, 90000), 'SLEEP: the morning card shows (over the 3D home, before the world is playable)');
  ok(await page.evaluate(() => BBH.R3.world.id === 'flat' && BBH.R3.world.controls.enabled === false && !document.querySelector('#hud3 .h3')), 'while the card is up the world input is off and the HUD is not mounted yet');
  await page.evaluate(() => { const c = document.querySelector('#ui .full'); if (c) c.click(); }); await sleep(800);
  ok(await page.evaluate((d) => BBH.G.ch.day > d && !document.querySelector('#ui .full') && !!document.querySelector('#hud3 .h3') && BBH.R3.world.controls.enabled === true, day0), 'tap to start the day: the HUD appears, the day advanced, the world is playable');
  ok(await page.evaluate(() => BBH.R3.world.lighting.getState().night < 0.35), 'the home world shows the morning light (night ' + await page.evaluate(() => BBH.R3.world.lighting.getState().night.toFixed(2)) + ')');

  /* ------------------------------------------------------------------ time of day and rain follow the clock in every world */
  const WORLDS = [['street', {}, 'street'], ['place', { id: 'home' }, 'flat'], ['place', { id: 'park' }, 'park'], ['place', { id: 'shop' }, 'shop'], ['place', { id: 'studio' }, 'lab'], ['map', {}, 'hood'], ['place', { id: 'bar' }, 'bar']];
  for (const [scene, args, wid] of WORLDS) {
    const r = {};
    for (const [tag, day, hour] of [['noon', 4, 12], ['midnight', 4, 23], ['rain', 5, 12]]) {
      await setClock(page, day, hour);
      if (!await goScene(page, scene, args, wid)) { ok(false, wid + ' loads for the ' + tag + ' check'); continue; }
      await sleep(900);
      r[tag] = await page.evaluate(() => { const s = BBH.R3.world.lighting.getState(); return { night: +s.night.toFixed(2), weather: s.weather, tod: s.tod }; });
    }
    const exp = await page.evaluate(() => ({ noon: BBH.Core.nightness(6 * 60), mid: BBH.Core.nightness(17 * 60) }));
    if (wid === 'bar') ok(r.noon.night > 0.7 && r.midnight.night > 0.7, 'bar: always night, noon ' + r.noon.night + ' midnight ' + r.midnight.night);
    else ok(r.noon && r.midnight && r.noon.night < 0.3 && r.midnight.night > 0.7 && r.midnight.night > r.noon.night, wid + ': lighting follows Core.nightness (noon ' + (r.noon && r.noon.night) + ' midnight ' + (r.midnight && r.midnight.night) + ')');
    ok(r.noon && r.noon.weather === 'clear' && r.rain && r.rain.weather === 'rain', wid + ': rain on day % 5 === 0 only (' + (r.noon && r.noon.weather) + ' / ' + (r.rain && r.rain.weather) + ')');
  }

  /* ------------------------------------------------------------------ fallback: live demotion keeps the scene and the save */
  await setClock(page, 3, 19);
  ok(await goScene(page, 'place', { id: 'home' }, 'flat'), 'home again before the fallback');
  const snap = await page.evaluate(() => JSON.stringify(BBH.G.ch));
  await page.evaluate(() => BBH.R3.demote('user'));
  ok(await until(page, () => BBH.Eng.sceneName === 'place' && !BBH.Eng.scene.is3d && !document.body.classList.contains('r3') && BBH.Eng.scene.id === 'home', null, 60000), 'R3.demote -> the 2D place scene of the same place, body.r3 off');
  ok(await page.evaluate((s) => JSON.stringify(BBH.G.ch) === s, snap), 'the save is untouched by the fallback');
  await page.evaluate(() => BBH.Eng.scene.activate('bed')); await sleep(600);
  ok(await page.evaluate(() => !!BBH.Eng.scene.sheetEl), 'the 2D place works after the fallback (bed sheet)');
  ok(errs.length === 0, 'no console or page errors in the whole flow' + (errs.length ? ': ' + errs.slice(0, 6).join(' || ') : ''));
  await page.context().close();

  /* ------------------------------------------------------------------ 2D default untouched */
  {
    const { page: p2, errs: e2 } = await env.newPage();
    await p2.goto(env.url('index.html'));
    await p2.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.sceneName === 'title', null, { timeout: 60000 });
    await seed(p2, { day: 3, minutes: 19 * 60 - 360 });
    await p2.evaluate(() => BBH.Eng.go('street', {})); await until(p2, () => BBH.Eng.sceneName === 'street' && BBH.Eng.scene.t > 0, null, 30000);
    const d = await p2.evaluate(() => ({ r3: BBH.R3.status, is3d: !!BBH.Eng.scene.is3d, body: document.body.classList.contains('r3'), goal: BBH.G.goalDoor(), sib: typeof BBH.Eng.scenes3d.place.worldArgs }));
    ok(d.r3 === 'off' && !d.is3d && !d.body && d.sib === 'function', '2D default: the classic street runs, the 3D siblings are never picked (' + JSON.stringify(d) + ')');
    ok(await p2.evaluate(() => BBH.Eng.scene.goalDoor() === BBH.G.goalDoor()), '2D street goalDoor() is G.goalDoor()');
    await p2.evaluate(() => BBH.Eng.go('place', { id: 'home' })); await until(p2, () => BBH.Eng.sceneName === 'place' && BBH.Eng.scene.t > 0, null, 30000);
    await p2.evaluate(() => BBH.Eng.scene.activate('kitchen')); await sleep(400);
    ok(await p2.evaluate(() => !!BBH.Eng.scene.sheetEl && !BBH.Eng.scene.is3d && document.querySelector('#ui .sheet .h2').textContent.indexOf('KITCHEN') === 0), '2D default: the home kitchen sheet opens as before');
    ok(e2.length === 0, '2D default: no errors' + (e2.length ? ': ' + e2.slice(0, 3).join(' || ') : ''));
    await p2.context().close();
  }
} catch (e) {
  ok(false, 'r3flow suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done();
