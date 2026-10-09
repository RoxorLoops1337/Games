// Shared helpers for the Beatbox Heroes r3 GAME suites (r3flow, r3spots): the REAL game in 3D (?r=3d&q=low) in headless Chromium + swiftshader. Not a test itself.
//   const env = await r3env('suite');  const { page, errs } = await boot(env);   // title is up
//   await seed(page, { day: 3, minutes: 780 });                                     // a save in memory (G.setChar), intro done, every first-visit dialog already seen
//   await goScene(page, 'place', { id: 'home' }, 'flat');                           // E.go + wait for the 3D sibling and its world
//   await adv(page, 3); await until(page, () => ..., arg, ms);                      // controls.advance(sec) (the headless loop is slow, simulation time is injected) and polling
// Swiftshader runs the E loop at a few fps, so every wait here is generous and every walk is driven with world.controls.advance().
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const VIEW = { width: 360, height: 640 };

export async function boot(env, q) {
  const { page, errs } = await env.newPage({ viewport: VIEW });
  await page.goto(env.url('index.html?r=3d&q=' + (q || 'low') + '&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed') && BBH.Eng.sceneName === 'title' && BBH.Eng.scene.t > 0, null, { timeout: 120000 });
  return { page, errs };
}

// a fresh save in memory. patch: fields of the char (day, minutes, cash, level, energy ...) and flags
export async function seed(page, patch) {
  await page.evaluate((patch) => {
    const ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.name = 'Zed'; ch.flags.intro = 1; ch.cash = 400; ch.level = 6;
    for (const p of ['home', 'park', 'shop', 'studio', 'bar']) ch.flags['visited_' + p] = 1;
    const f = (patch && patch.flags) || {}; const rest = Object.assign({}, patch); delete rest.flags; Object.assign(ch, rest); Object.assign(ch.flags, f);
    BBH.G.slot = 1; BBH.G.setChar(ch);
    BBH.E.settings.micAsked = true;           // the one-time "play with your voice?" card would sit in front of every set these suites start
  }, patch || {});
}
export const setClock = (page, day, hour) => page.evaluate(([d, h]) => { const ch = BBH.Core.clone(BBH.G.ch); ch.day = d; ch.minutes = h * 60 - 360; BBH.G.setChar(ch); }, [day, hour]);

export const sceneReady = (page, name, world, ms) => page.waitForFunction(([n, w]) => BBH.Eng.sceneName === n && BBH.Eng.scene && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === w && BBH.Eng.scene.w === BBH.R3.world && BBH.Eng.scene.t > 0 && !BBH.Eng.pendingSwitch, [name, world], { timeout: ms || 120000 }).then(() => true, () => false);
export async function goScene(page, name, args, world, ms) {
  await page.evaluate(([n, a]) => BBH.Eng.go(n, a), [name, args || {}]);
  const ok = await sceneReady(page, name, world, ms); if (ok) { await sleep(300); await adv(page, 1); }
  return ok;
}
export const adv = (page, sec) => page.evaluate((s) => { const w = BBH.R3.world; if (w && w.controls && w.controls.advance) w.controls.advance(s); }, sec);
export async function until(page, fn, arg, ms) { return page.waitForFunction(fn, arg, { timeout: ms || 60000 }).then(() => true, () => false); }
// drive the world simulation until a page predicate is true (walks and cinematics need simulated time)
export async function drive(page, fn, arg, maxSteps) {
  for (let i = 0; i < (maxSteps || 30); i++) { if (await page.evaluate(fn, arg)) return true; await adv(page, 1.5); await sleep(150); }
  return !!(await page.evaluate(fn, arg));
}
export const sheetTitle = (page) => page.evaluate(() => { const e = document.querySelector('#ui .sheet .h2'); return e ? e.textContent.trim() : ''; });
export const ctl = (page) => page.evaluate(() => { const c = BBH.R3.world.controls; return { inSpot: c.inSpot, locked: c.locked, enabled: c.enabled, inset: c.state().inset, focusId: c.state().focusId, x: c.state().x, z: c.state().z }; });
export const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('#r3kit .k3-toast')].map((e) => e.textContent.trim()));
export const closeSheet = (page) => page.evaluate(() => { const b = [...document.querySelectorAll('#ui .sheet .btn')].find((x) => x.textContent.trim() === 'X'); if (b) { b.click(); return true; } return false; });
// dismiss any dialog (tap the box until it is gone)
export async function skipDialogs(page, max) {
  for (let i = 0; i < (max || 12); i++) { const n = await page.evaluate(() => { const b = document.querySelector('#r3kit .k3-dlg'); if (b) { b.click(); return 1; } return 0; }); if (!n) return i; await sleep(260); }
  return -1;
}
export const glVaried = (page) => page.evaluate(() => { const gl = document.getElementById('gl'), c = document.createElement('canvas'); c.width = 90; c.height = 160; const g = c.getContext('2d'); g.drawImage(gl, 0, 0, 90, 160); const d = g.getImageData(0, 0, 90, 160).data, s = new Set(); let lit = 0; for (let i = 0; i < d.length; i += 4) { s.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5)); if (d[i] + d[i + 1] + d[i + 2] > 120) lit++; } return { colours: s.size, lit }; });
