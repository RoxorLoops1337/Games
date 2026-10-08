// r3 SHELL gate (PORT_PLAN 3 and 6): the REAL game in 3D (?r=3d, headless Chromium + swiftshader) through title -> slots -> creator -> back, with real clicks.
//   title: the 3D alley stage (cast, sign, budget), CONTINUE / NEW GAME / SETTINGS / SOUND buttons, TAP TO START.   slots: same world, camera pushed in, cards + modal.
//   creator: every tab changes the 3D hero, camera shot and ring colour per tab, tap the hero changes pose, drag spins, wheel zooms.   Settings GRAPHICS row: AUTO / 3D / CLASSIC.
//   2D default untouched (no ?r=3d: no 3D sibling, the same Settings row says AUTO).   No console errors anywhere.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3shell suite hung'); process.exit(1); }, 480000);
const env = await r3env('beatbox_heroes_r3shell');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const glVaried = (page) => page.evaluate(() => { const gl = document.getElementById('gl'), c = document.createElement('canvas'); c.width = 90; c.height = 160; const g = c.getContext('2d'); g.drawImage(gl, 0, 0, 90, 160); const d = g.getImageData(0, 0, 90, 160).data, s = new Set(); let lit = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 40) lit++; s.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5)); } return { colours: s.size, lit }; });
const waitScene = (page, name, world, ms) => page.waitForFunction(([n, w]) => BBH.Eng.sceneName === n && BBH.Eng.scene && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === w && BBH.Eng.scene.t > 0, [name, world], { timeout: ms || 60000 }).then(() => true, () => false);
const clickBtn = async (page, txt) => { await page.locator('#ui .btn', { hasText: txt }).first().click({ timeout: 6000 }); };

try {
  // ------------------------------------------------------------------ 3D title
  const { page, errs } = await env.newPage({ viewport: { width: 360, height: 640 } });
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed'), null, { timeout: 90000 });
  ok(await page.evaluate(() => BBH.R3.status) === 'ready', '?r=3d boots (status ready)');
  ok(await waitScene(page, 'title', 'title'), 'the title is the 3D sibling (E.scenes3d.title) on the title world');
  await sleep(1500);
  const st = await page.evaluate(() => {
    const w = BBH.R3.world, T = w.ctx.title, s = BBH.R3.host.stats();
    return { body: document.body.classList.contains('r3'), ids: w.npcs.map((n) => n.id).sort().join(','), look: !!(w.player && w.player.getLook && w.player.getLook()), stats: T && T.stats(), tris: s.tris, calls: s.calls, delegated: Object.getPrototypeOf(BBH.Eng.scene) === BBH.Eng.scenes.title && !!document.querySelector('#ui .full .k3-tap') && !!document.querySelector('#ui .full .k3-credit'), veil: document.querySelectorAll('#ui .full').length };
  });
  ok(st.body && st.delegated, 'body.r3 is on, the sibling delegates its DOM to the 2D title (Object.create) and restyles TAP TO START as the neon pill with the duo credit');
  ok(st.ids === 'beeamgee,pigpen' && st.look, 'the battle stage has the hero, Pig Pen (the rival) and BeeAmGee hosting (' + st.ids + ')');
  ok(st.stats && st.stats.ready && st.stats.shot === 'title', 'title shot active: ' + JSON.stringify(st.stats));
  ok(st.tris > 2000 && st.tris <= 66000, 'title world within the 66k triangle budget (' + st.tris + ' tris, ' + st.calls + ' calls)');
  const v = await glVaried(page); ok(v.lit > 800 && v.colours >= 8, 'title GL canvas is lit and colourful (' + v.colours + ' colours, ' + v.lit + ' lit)');
  ok(st.veil >= 1 && /TAP TO START/i.test(await page.locator('#ui').innerText()), 'TAP TO START is shown first');
  // beat and pulse: the world takes absolute beat positions and keeps lighting in 0..1
  const beat = await page.evaluate(() => { const w = BBH.R3.world; w.setBeat(12.0); const a = w.ctx.title.stats().pulse; w.setBeat(12.9); const b = w.ctx.title.stats().pulse; w.setBeat(0); return [a, b]; });
  ok(beat.every((x) => typeof x === 'number' && x >= 0 && x <= 1), 'setBeat accepts absolute beats without breaking the pulse ' + JSON.stringify(beat));

  // the sign: every gold letter pixel stays inside its safe zone (BEATBOX inside the neon frame, HEROES between the equalizer bars), after the web font arrived
  const sg = await page.evaluate(async () => {
    const sign = BBH.R3.world.ctx.scene.getObjectByName('title_sign'), face = sign && sign.children[0].children.find((m) => m.material && m.material.map && m.material.map.image && m.material.map.image.width === 1024);
    if (!face) return null; const tex = face.material.map; if (tex.fontReady) await tex.fontReady; const c = tex.image, W = c.width, d = c.getContext('2d').getImageData(0, 0, W, c.height).data;
    const gold = (x, y) => { const i = (y * W + x) * 4; return d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 120 && d[i + 3] > 200; };
    let topMin = W, topMax = 0, botMin = W, botMax = 0;
    for (let y = 110; y < 290; y += 2) for (let x = 0; x < W; x++) if (gold(x, y)) { topMin = Math.min(topMin, x); topMax = Math.max(topMax, x); }
    for (let y = 305; y < 400; y += 2) for (let x = 0; x < W; x++) if (gold(x, y)) { botMin = Math.min(botMin, x); botMax = Math.max(botMax, x); }
    return { W, topMin, topMax, botMin, botMax };
  });
  ok(sg && sg.topMin > 60 && sg.topMax < sg.W - 60 && sg.topMax - sg.topMin > 500, 'BEATBOX fills the board but stays inside the neon frame ' + JSON.stringify(sg));
  ok(sg && sg.botMin > 185 && sg.botMax < sg.W - 185 && sg.botMax - sg.botMin > 300, 'HEROES sits between the equalizer bars ' + JSON.stringify(sg));
  // BeeAmGee sits ON his crate: hips above the lid, both ankles dangle in front of the front board (not hidden inside the box)
  const bee = await page.evaluate(() => {
    const w = BBH.R3.world, b = w.npcs.find((n) => n.id === 'beeamgee'), V = b.object.position.constructor;
    const at = (n) => { const o = b.object.getObjectByName(n), v = new V(); o.getWorldPosition(v); return v; }, rot = b.object.rotation.y, fx = Math.sin(rot), fz = Math.cos(rot);
    const crate = w.ctx.title.layout.crate, f = (v) => (v.x - crate.x) * fx + (v.z - crate.z) * fz;
    return { hipsF: +f(at('hips')).toFixed(3), anL: +f(at('anL')).toFixed(3), anR: +f(at('anR')).toFixed(3), hipsY: +at('hips').y.toFixed(3) };
  });
  ok(bee.hipsF > -0.2 && bee.hipsF < 0.25 && bee.hipsY > 0.75, 'BeeAmGee hips rest on the crate lid ' + JSON.stringify(bee));
  ok(bee.anL > 0.28 && bee.anR > 0.28, 'BeeAmGee shins dangle in front of the crate front board ' + JSON.stringify(bee));

  // the battle: both battlers in battle stance facing each other, rounds alternate, the attacker steps in, the crowd is there and cheers on the swap
  const bt = await page.evaluate(async () => {
    const w = BBH.R3.world, T = w.ctx.title, hero = w.player, rival = w.npcs.find((n) => n.id === 'pigpen'), clip = (c) => c.anim ? c.anim.clip : c.clip;
    const dx = rival.object.position.x - hero.object.position.x, faceIn = Math.sin(hero.object.rotation.y) > 0.3 && Math.sin(rival.object.rotation.y) < -0.3;
    const out = { clips: [clip(hero), clip(rival)], dx: +dx.toFixed(2), faceIn, rot: [+hero.object.rotation.y.toFixed(2), +rival.object.rotation.y.toFixed(2)], crowd: T.stats().crowd, rounds: [] };
    const r0 = T.stats().round, base = (r0 + (r0 % 2 ? 1 : 0)) * 4.8 + 1.2; T.restart(); T.skip(base);   // the game feeds its own beat (none before music), so drive the scene clock: 8 beats at 100 bpm = 4.8 s
    for (let i = 0; i < 3; i++) { if (i) T.skip(4.8); await new Promise((r) => setTimeout(r, 1500)); const s = T.stats(); out.rounds.push([s.round, s.attacker, +hero.object.position.x.toFixed(2), +rival.object.position.x.toFixed(2)]); }
    return out;
  });
  ok(bt.clips[0] === 'battle' && bt.clips[1] === 'battle' && bt.dx > 1.0 && bt.faceIn, 'hero and Pig Pen face off in battle stance ' + JSON.stringify(bt));
  ok(bt.rounds[0][1] === 'hero' && bt.rounds[1][1] === 'rival' && bt.rounds[2][1] === 'hero', 'rounds alternate every 8 beats ' + JSON.stringify(bt.rounds));
  ok(bt.rounds[1][2] < bt.rounds[0][2] && bt.rounds[1][3] < bt.rounds[0][3], 'the attacker steps in, the other one steps back ' + JSON.stringify(bt.rounds));
  ok(bt.crowd >= 10, 'a crowd watches the battle (' + bt.crowd + ' spectators)');

  // seed a save so CONTINUE exists, then tap to start
  await page.evaluate(() => { const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.look = Object.assign({}, ch.look, { name: 'Zed' }); ch.name = 'Zed'; ch.created = Date.now(); ch.flags.intro = 1; BBH.Core.Save.save(BBH.Eng.store, 1, ch); });
  await page.mouse.click(180, 320); await sleep(600);
  const labels = await page.locator('#ui .btn').allInnerTexts();
  ok(['CONTINUE', 'NEW GAME', 'SETTINGS'].every((t) => labels.some((l) => l.indexOf(t) >= 0)) && labels.some((l) => /SOUND/.test(l)), 'menu buttons: CONTINUE, NEW GAME, SETTINGS, SOUND (' + labels.join(' | ') + ')');
  ok(await page.evaluate(() => BBH.Eng.sceneName) === 'title' && (await page.locator('#ui').innerText()).indexOf('TAP TO START') < 0, 'tap starts the menu (still the 3D title)');
  // the newest save's look is the hero
  ok(await page.evaluate(() => { const l = BBH.R3.world.player.getLook(); return !!l; }), 'hero built from the save or a random look');

  // ------------------------------------------------------------------ settings GRAPHICS row
  await clickBtn(page, 'SETTINGS'); await sleep(300);
  const sTxt = await page.locator('#ui').innerText();
  ok(/GRAPHICS/.test(sTxt) && /AUTO/.test(sTxt) && /3D/.test(sTxt) && /CLASSIC/.test(sTxt), 'Settings has the GRAPHICS row (AUTO / 3D / CLASSIC)');
  ok(await page.evaluate(() => [...document.querySelectorAll('#ui .btn.gold')].some((b) => b.textContent === '3D')), 'the current mode (3D) is highlighted');
  await clickBtn(page, 'DONE'); await sleep(300);

  // ------------------------------------------------------------------ slots (CONTINUE)
  await clickBtn(page, 'CONTINUE');
  ok(await waitScene(page, 'slots', 'title'), 'CONTINUE opens the 3D slot picker on the same world');
  await sleep(2500);
  const sl = await page.evaluate(() => ({ shot: BBH.R3.world.ctx.title.stats().shot, panels: document.querySelectorAll('#ui .panel').length, txt: document.getElementById('ui').innerText, mode: BBH.Eng.scene.mode }));
  ok(sl.shot === 'slots' && sl.panels >= 3 && /Zed|SELECT HERO/i.test(sl.txt), 'camera pushed in (slots shot), 3 cards + the saved hero: ' + sl.shot + ' ' + sl.panels);
  await page.locator('#ui .panel').first().click(); await sleep(500);
  const mb = await page.locator('#r3kit .k3-modal .btn, #ui .btn').allInnerTexts();                       // the 3D UI kit draws E.modal in #r3kit
  ok(mb.some((t) => /PLAY/.test(t)) && mb.some((t) => /DELETE/.test(t)), 'a filled slot opens the PLAY / DELETE modal (' + mb.join(' | ') + ')');
  await page.locator('#r3kit .k3-modal .btn', { hasText: 'BACK' }).first().click({ timeout: 6000 }); await sleep(500);
  await clickBtn(page, 'BACK'); ok(await waitScene(page, 'title', 'title'), 'BACK returns to the 3D title');
  await sleep(800); await page.mouse.click(180, 320); await sleep(500);

  // ------------------------------------------------------------------ NEW GAME -> slots -> creator
  await clickBtn(page, 'NEW GAME'); ok(await waitScene(page, 'slots', 'title'), 'NEW GAME opens the slot picker');
  await sleep(600); await page.locator('#ui .panel').nth(1).click();
  ok(await waitScene(page, 'creator', 'creator'), 'an empty slot opens the 3D creator on the creator world');
  await sleep(2500);
  const cr = await page.evaluate(() => { const w = BBH.R3.world, C = w.ctx.creator, s = BBH.R3.host.stats(); return { stats: C.stats(), tabs: C.tabs.length, mode: w.controls.mode, tris: s.tris, calls: s.calls, inset: w.controls.state().inset, tiles: document.querySelectorAll('#ui .tile').length }; });
  ok(cr.stats.ready && cr.mode === 'orbit', 'creator world is ready and the camera is in orbit mode (' + JSON.stringify(cr.stats) + ')');
  ok(cr.tris <= 60000 && cr.calls < 120, 'creator within budget (' + cr.tris + ' tris, ' + cr.calls + ' calls)');
  ok(cr.inset.bottom > 60, 'the camera leaves room for the DOM panel (inset ' + cr.inset.bottom + ' px)');
  const v2 = await glVaried(page); ok(v2.lit > 800 && v2.colours >= 8, 'creator GL canvas is lit and colourful (' + v2.colours + ')');

  // every tab: the tab drives shot + ring colour, and one pick changes the 3D hero
  const names = ['body', 'skin', 'hair', 'face', 'top', 'bottom', 'shoes', 'hat', 'glasses', 'extra'], shots = { body: 'full', skin: 'full', hair: 'head', face: 'head', top: 'torso', bottom: 'legs', shoes: 'feet', hat: 'head', glasses: 'head', extra: 'torso' };
  const rings = new Set(); let changedTabs = 0;
  for (let i = 0; i < names.length; i++) {
    await page.locator('#ui .tab').nth(i).click(); await sleep(450);
    const before = await page.evaluate(() => JSON.stringify(BBH.R3.world.player.getLook()));
    const picked = await page.evaluate(() => {
      const root = document.querySelector('#ui .scroll'); if (!root) return 'noscroll';
      const cands = [...root.querySelectorAll('.tile:not(.on):not(.lock), .sw:not(.on):not(.lock)')].filter((e) => !e.querySelector('input'));
      const pick = cands[Math.min(cands.length - 1, 1)]; if (!pick) return 'none'; pick.click(); return pick.className;
    });
    await sleep(500);
    const after = await page.evaluate((nm) => ({ look: JSON.stringify(BBH.R3.world.player.getLook()), tab: BBH.R3.world.ctx.creator.stats().tab, ring: BBH.R3.world.ctx.creator.stats().ring, shot: BBH.R3.world.controls.state().orbit.shot }), names[i]);
    rings.add(after.tab); const moved = before !== after.look; if (moved) changedTabs++;
    ok(after.tab === names[i] && after.shot === shots[names[i]], names[i] + ' tab: ring + camera preset (' + after.shot + ') follow the tab');
    ok(moved, names[i] + ' tab: picking an item changes the live 3D hero (' + picked + ')');
  }
  ok(changedTabs === names.length, 'all ' + names.length + ' tabs changed the 3D look');
  // live name tag, dice, pose by tap, spin by drag, zoom by wheel
  await page.locator('#ui input[type=text]').fill('Nova'); await sleep(450);
  ok(await page.evaluate(() => BBH.Eng.scene.look.name) === 'Nova', 'name field drives the scene look (neon tag follows)');
  await page.locator('#ui .tab').nth(0).click(); await sleep(300);
  const p0 = await page.evaluate(() => ({ pose: BBH.Eng.scene.pose, clip: BBH.R3.world.player.anim.clip }));
  await page.mouse.click(180, 150); await sleep(400);
  const p1 = await page.evaluate(() => ({ pose: BBH.Eng.scene.pose, clip: BBH.R3.world.player.anim.clip }));
  ok(p1.pose !== p0.pose && p1.clip === p1.pose, 'tapping the hero cycles the pose in 3D (' + p0.pose + ' -> ' + p1.pose + ', clip ' + p1.clip + ')');
  const yaw0 = await page.evaluate(() => BBH.R3.world.controls.state().orbit.yaw);
  await page.mouse.move(120, 160); await page.mouse.down(); await page.mouse.move(260, 160, { steps: 8 }); await page.mouse.up(); await sleep(300);
  const yaw1 = await page.evaluate(() => BBH.R3.world.controls.state().orbit.yaw);
  ok(Math.abs(yaw1 - yaw0) > 20, 'dragging the stage spins the camera (' + yaw0 + ' -> ' + yaw1 + ' degrees)');
  const d0 = await page.evaluate(() => BBH.R3.world.controls.state().orbit.dist);
  await page.mouse.move(180, 200); await page.mouse.wheel(0, 300); await sleep(300);
  const d1 = await page.evaluate(() => BBH.R3.world.controls.state().orbit.dist);
  ok(d1 > d0 + 0.05, 'wheel zooms the orbit camera (' + d0 + ' -> ' + d1 + ')');
  await page.locator('#ui .btn', { hasText: 'GO!' }).count();
  // dice: a random look arrives in 3D
  const bf = await page.evaluate(() => JSON.stringify(BBH.R3.world.player.getLook())); await page.locator('#ui .row .btn').nth(1).click(); await sleep(700);
  ok(await page.evaluate(() => JSON.stringify(BBH.R3.world.player.getLook())) !== bf, 'the dice button rolls a new look and the 3D hero follows');
  // back to the slots: a 2D-free round trip
  await page.locator('#ui .row .btn').first().click(); ok(await waitScene(page, 'slots', 'title'), 'the < button returns to the 3D slot picker');
  ok(await page.evaluate(() => !!BBH.G.draft), 'the draft look is kept for the next visit (2D behaviour untouched)');

  // ------------------------------------------------------------------ CLASSIC from Settings: live fallback, stored
  await clickBtn(page, 'BACK'); await waitScene(page, 'title', 'title'); await sleep(600); await page.mouse.click(180, 320); await sleep(400);
  await clickBtn(page, 'SETTINGS'); await sleep(300); await clickBtn(page, 'CLASSIC'); await sleep(900);
  const cl = await page.evaluate(() => ({ status: BBH.R3.status, stored: JSON.parse(localStorage.getItem('bbh:r3') || '{}'), body: document.body.classList.contains('r3'), scene: BBH.Eng.sceneName, is3d: !!BBH.Eng.scene.is3d }));
  ok(cl.stored.mode === '2d' && cl.status === 'demoted' && !cl.body && cl.scene === 'title' && !cl.is3d, 'CLASSIC demotes live to the 2D title and stores mode 2d (' + JSON.stringify(cl) + ')');
  await page.mouse.click(180, 320); await sleep(500); await clickBtn(page, 'SETTINGS'); await sleep(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .btn')].find((x) => x.textContent === 'AUTO'); if (b) b.click(); }); await sleep(300);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('bbh:r3') || '{}').mode) === 'auto', 'AUTO is stored again');
  ok(errs.length === 0, '3D shell flow: no console or page errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' || ') : ''));
  await page.context().close();

  // ------------------------------------------------------------------ 2D default untouched
  {
    const { page: p2, errs: e2 } = await env.newPage({ viewport: { width: 360, height: 640 } });
    await p2.goto(env.url('index.html'));
    await p2.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.sceneName === 'title', null, { timeout: 30000 });
    const d = await p2.evaluate(() => ({ r3: BBH.R3.status, on: BBH.R3.on, is3d: !!BBH.Eng.scene.is3d, sib: !!BBH.Eng.scenes3d.title && !!BBH.Eng.scenes3d.creator && !!BBH.Eng.scenes3d.slots, body: document.body.classList.contains('r3'), row: typeof BBH.G.graphicsRow }));
    ok(d.r3 === 'off' && !d.on && !d.is3d && !d.body, '2D default: the classic title runs, no body.r3 (' + JSON.stringify(d) + ')');
    ok(d.sib && d.row === 'function', 'the siblings are registered but never picked while 3D is off');
    await p2.mouse.click(180, 320); await sleep(300); await clickBtn(p2, 'SETTINGS'); await sleep(300);
    ok(/GRAPHICS/.test(await p2.locator('#ui').innerText()) && await p2.evaluate(() => [...document.querySelectorAll('#ui .btn.gold')].some((b) => b.textContent === 'AUTO')), '2D Settings shows GRAPHICS with AUTO highlighted');
    ok(e2.length === 0, '2D default: no errors' + (e2.length ? ': ' + e2.slice(0, 3).join(' || ') : ''));
    await p2.context().close();
  }
} catch (e) {
  ok(false, 'r3shell suite crashed: ' + (e && e.stack || e));
} finally { await env.stop(); }
clearTimeout(watchdog);
done();
