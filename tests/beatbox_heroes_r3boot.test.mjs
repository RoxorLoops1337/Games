// r3 boot gate (PORT_PLAN 6.1): the REAL game (index.html) with ?r=3d&q=low boots through R3.boot() in headless Chromium (swiftshader WebGL):
// capability probe -> ESM core chunk -> host -> title world, BBH.R3.status 'ready', GL canvas not blank (?preserve=1), no console errors, a tap on #gl unlocks audio,
// mixed mode (a 3D sibling scene shows #gl, DOM fade/flash/fx, then a 2D scene hides it again), 2D default untouched, and the file:// IIFE path.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3boot suite hung'); process.exit(1); }, 240000);
const env = await r3env('beatbox_heroes_r3boot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const glVaried = (page) => page.evaluate(() => { const gl = document.getElementById('gl'), c = document.createElement('canvas'); c.width = 90; c.height = 160; const g = c.getContext('2d'); g.drawImage(gl, 0, 0, 90, 160); const d = g.getImageData(0, 0, 90, 160).data, s = new Set(); let lit = 0; for (let i = 0; i < d.length; i += 4) { s.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3)); if (d[i] + d[i + 1] + d[i + 2] > 30) lit++; } return { colours: s.size, lit, w: gl.width, h: gl.height }; });

// ---------------------------------------------------------------- 3D over http (ESM chunks)
{
  const { page, errs } = await env.newPage();
  await page.goto(env.url('index.html?r=3d&q=low&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed'), null, { timeout: 90000 });
  const st = await page.evaluate(() => ({ status: BBH.R3.status, reason: BBH.R3.reason, mode: BBH.R3.mode, on: BBH.R3.on, q: BBH.R3.quality, world: BBH.R3.world && BBH.R3.world.id, bootMs: BBH.R3.bootMs }));
  ok(st.status === 'ready', 'BBH.R3.status is ready (got ' + JSON.stringify(st) + ')');
  ok(st.mode === '3d' && st.on === true && st.q === 'low', 'mode 3d, on, quality low from ?q=low');
  ok(st.world === 'title', 'the title world is loaded by boot (got ' + st.world + ')');
  ok(st.bootMs > 0, 'boot time is recorded (' + st.bootMs + ' ms)');
  // the held E.go('title') replays after the verdict: the 2D boot scene hands over to the title, which is the 3D sibling from scenes_shell.js (SHELL)
  await page.waitForFunction(() => BBH.Eng.sceneName === 'title', null, { timeout: 30000 });
  await page.waitForFunction(() => BBH.Eng.scene && BBH.Eng.scene.is3d && BBH.R3.world && BBH.R3.world.id === 'title', null, { timeout: 30000 });
  const mixed = await page.evaluate(() => ({ r3: document.body.classList.contains('r3'), active: BBH.R3.active, sib: BBH.Eng.scene === BBH.Eng.scenes3d.title, boot2d: !!BBH.Eng.scenes.boot && !BBH.Eng.scenes3d.boot }));
  ok(mixed.sib && mixed.r3 && mixed.active && mixed.boot2d, 'the title is the 3D sibling (body.r3 on), the boot scene has no sibling and stays 2D: ' + JSON.stringify(mixed));
  const v = await glVaried(page);
  ok(v.lit > 500 && v.colours >= 3, 'GL canvas is not blank after the title warm-up (' + v.colours + ' colours, ' + v.lit + ' lit samples, ' + v.w + 'x' + v.h + ')');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbh:r3') || '{}'));
  ok(stored.bootMs > 0 && stored.fail === null && !('q' in stored && stored.q === 'low'), 'bbh:r3 stores bootMs, no fail, and the forced ?q= is not persisted (' + JSON.stringify(stored) + ')');
  ok(await page.evaluate(() => !!document.getElementById('hud3') && !!document.getElementById('r3kit') && typeof BBH.R3UI.install === 'function' && !!document.querySelector('link#r3-theme')), 'UI kit installed (#hud3, #r3kit, theme link)');

  // a tap (pointerdown) on #gl unlocks audio
  const un = await page.evaluate(() => { window.__u = 0; const o = BBH.Audio.unlock; BBH.Audio.unlock = function () { window.__u++; return o.apply(this, arguments); }; document.getElementById('gl').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); return window.__u; });
  ok(un >= 1, 'pointerdown on #gl calls E.unlockAudio -> Audio.unlock');

  // mixed mode: register a 3D sibling for the title scene and enter it
  const sib = await page.evaluate(async () => {
    const E = BBH.Eng; let left = 0;
    E.scenes3d.title = { is3d: true, world: 'title', enter() { return BBH.R3.load('title', { reuse: false }); }, leave() { left++; }, update() {} };
    E.go('title', {}, { nofade: true });
    const t0 = performance.now(); while (performance.now() - t0 < 20000 && !(BBH.R3.world && BBH.R3.active && BBH.R3.host.stats().calls > 0)) await new Promise((r) => setTimeout(r, 100));
    const wrap = document.getElementById('glwrap'), cs = getComputedStyle(wrap);
    return { picked: E.scene === E.scenes3d.title, r3: document.body.classList.contains('r3'), active: BBH.R3.active, shown: cs.display !== 'none', w: wrap.clientWidth, h: wrap.clientHeight, world: BBH.R3.world && BBH.R3.world.id, calls: BBH.R3.host.stats().calls, cvHidden: getComputedStyle(document.getElementById('cv')).visibility === 'hidden', stageZ: getComputedStyle(document.getElementById('stage')).zIndex };
  });
  ok(sib.picked && sib.r3 && sib.active && sib.shown, 'E.pickScene returns the 3D sibling, body.r3 on, #glwrap visible: ' + JSON.stringify(sib));
  ok(sib.w > 100 && sib.h >= 600 && sib.w <= sib.h * 9 / 16 + 1, '#glwrap is a 9:16 column (' + sib.w + 'x' + sib.h + ')');
  ok(sib.world === 'title' && sib.calls > 0 && sib.cvHidden && sib.stageZ === '4', 'the host renders (' + sib.calls + ' calls), the 2D canvas is hidden, #stage sits above #hud3');
  await sleep(600);
  const v2 = await glVaried(page); ok(v2.lit > 500 && v2.colours >= 3, 'GL canvas still has content while the 3D scene runs');
  // DOM fade / flash / shake / particles while 3D is active
  const fx = await page.evaluate(async () => {
    const E = BBH.Eng, glw = document.getElementById('glwrap'), fadeEl = document.getElementById('fade'), flashEl = document.getElementById('flash'), fxc = document.getElementById('fx'); const o = { fade: 0, flash: 0, px: 0, tr: '' };
    E.fadeTo(1, 80); E.flash('#ff00ff', 1500); E.shake(6, 1500); E.burst(180, 320, 40, { color: '#ffd23f', speed: 20, life: 3000, gravity: 0 });
    const t0 = performance.now(); while (performance.now() - t0 < 6000 && !(o.fade > 0.95 && o.flash > 0 && o.px > 5 && o.tr)) {
      await new Promise((r) => setTimeout(r, 40)); o.fade = Math.max(o.fade, parseFloat(fadeEl.style.opacity) || 0); o.flash = Math.max(o.flash, parseFloat(flashEl.style.opacity) || 0);
      if (!o.tr && /translate/.test(glw.style.transform)) o.tr = glw.style.transform; if (o.px <= 5) { const d = fxc.getContext('2d').getImageData(0, 0, fxc.width, fxc.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; o.px = n; }
    }
    E.fadeTo(0, 60); const t1 = performance.now(); while (performance.now() - t1 < 5000 && parseFloat(fadeEl.style.opacity) > 0) await new Promise((r) => setTimeout(r, 50));
    o.fadeAfter = parseFloat(fadeEl.style.opacity); return o;
  });
  ok(fx.fade > 0.9, '#fade follows E.fadeTo while 3D is active (' + fx.fade + ')');
  ok(fx.flash > 0, '#flash follows E.flash (' + fx.flash + ')');
  ok(fx.px > 5, 'E.burst particles draw on the #fx overlay (' + fx.px + ' px)');
  ok(/translate/.test(fx.tr), 'E.shake moves the GL layer (' + fx.tr + ')');
  ok(fx.fadeAfter === 0, '#fade returns to 0');
  // leaving to a 2D scene hides the 3D layer and unloads the world
  const back = await page.evaluate(async () => {
    const E = BBH.Eng; delete E.scenes3d.title; E.go('title', {}, { nofade: true }); await new Promise((r) => setTimeout(r, 400));
    return { r3: document.body.classList.contains('r3'), active: BBH.R3.active, scene2d: E.scene === E.scenes.title, world: BBH.R3.world && BBH.R3.world.id, wrap: getComputedStyle(document.getElementById('glwrap')).display, on: BBH.R3.on };
  });
  ok(!back.r3 && !back.active && back.scene2d && back.wrap === 'none' && back.on === true, 'a 2D scene hides #glwrap again, 3D stays available: ' + JSON.stringify(back));
  ok(back.world === null, 'leaving 3D unloads the resident world (' + back.world + ')');
  // syncChar maps Core time / weather / look
  const sync = await page.evaluate(async () => {
    const C = BBH.Core, E = BBH.Eng; const ch = C.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.day = 5; ch.minutes = 800; BBH.G.setChar(ch);
    E.scenes3d.street = { is3d: true, world: 'street', enter() { return BBH.R3.load('street'); }, leave() {}, update() {} };
    E.go('street', {}, { nofade: true }); const t0 = performance.now(); while (performance.now() - t0 < 20000 && !(BBH.R3.world && BBH.R3.world.id === 'street')) await new Promise((r) => setTimeout(r, 100));
    BBH.R3.sync(); const w = BBH.R3.world, L = w.lighting && w.lighting.getState ? w.lighting.getState() : null;
    return { id: w && w.id, weather: w && w.weather, clock: w && w.clock, night: L && L.tod, want: C.nightness(ch.minutes), hour: C.hourOf(ch.minutes) };
  });
  ok(sync.id === 'street' && sync.weather === 'rain', 'day % 5 === 0 gives rain (' + sync.weather + ')');
  ok(sync.clock && sync.clock.day === 5 && Math.abs(sync.clock.hour - sync.hour) < 1e-6, 'setClock gets Core.hourOf and the day');
  ok(sync.night === null || sync.night === undefined || Math.abs(sync.night - sync.want) < 0.05, 'lighting tod follows Core.nightness (' + sync.night + ' vs ' + sync.want + ')');
  ok(errs.length === 0, 'no page or console errors (3D over http)' + (errs.length ? ':\n  ' + errs.slice(0, 6).join('\n  ') : ''));
  await page.close();
}

// ---------------------------------------------------------------- the 2D default is untouched
{
  const { page, errs } = await env.newPage();
  await page.goto(env.url('index.html'));
  await page.waitForFunction(() => window.BBH && BBH.Eng && BBH.Eng.sceneName === 'title', null, { timeout: 30000 });
  const d = await page.evaluate(() => ({ status: BBH.R3.status, reason: BBH.R3.reason, on: BBH.R3.on, active: BBH.R3.active, r3: document.body.classList.contains('r3'), host: !!BBH.R3.host, kit: !!document.getElementById('r3kit'), link: !!document.querySelector('link#r3-theme'), stored: localStorage.getItem('bbh:r3'), pick: BBH.Eng.pickScene('title') === BBH.Eng.scenes.title }));
  ok(d.status === 'off' && d.reason === 'auto-classic' && !d.on && !d.active && !d.r3 && !d.host, 'default (auto) stays classic 2D: ' + JSON.stringify(d));
  ok(!d.kit && !d.link && d.stored === null && d.pick, 'no UI kit install, no storage write, pickScene is the 2D scene in 2D mode');
  const page2 = await env.newPage(); await page2.page.goto(env.url('index.html?r=2d')); await page2.page.waitForFunction(() => BBH.Eng && BBH.Eng.sceneName === 'title', null, { timeout: 30000 });
  ok(await page2.page.evaluate(() => BBH.R3.status === 'off' && BBH.R3.reason === 'mode' && BBH.R3.mode === '2d'), '?r=2d forces classic');
  ok(errs.length === 0 && page2.errs.length === 0, 'no console errors in 2D mode');
  await page2.page.close(); await page.close();
}

// ---------------------------------------------------------------- file:// uses the IIFE bundle
{
  const { page, errs } = await env.newPage();
  await page.goto(env.fileUrl('index.html?r=3d&q=low&preserve=1'));
  await page.waitForFunction(() => window.BBH && BBH.R3 && (BBH.R3.status === 'ready' || BBH.R3.status === 'failed'), null, { timeout: 90000 });
  const st = await page.evaluate(() => ({ status: BBH.R3.status, reason: BBH.R3.reason, world: BBH.R3.world && BBH.R3.world.id }));
  ok(st.status === 'ready' && st.world === 'title', 'file:// boots 3D through the IIFE bundle (' + JSON.stringify(st) + ')');
  ok(errs.length === 0, 'no console errors over file://' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  await page.close();
}
clearTimeout(watchdog); await env.stop(); done();
