// r3 fallback gate (PORT_PLAN 6.5): the 2D game is always the safety net.
//  (a) WebGL unavailable + ?r=3d  -> boots the 2D title, status 'failed', bbh:r3.fail persisted; the next plain boot goes straight to 2D; an explicit ?r=3d with working WebGL retries and clears it
//  (b) the core chunk request is aborted (entry, or a lazy world chunk) -> 2D title within 15 s
//  (c) two WEBGL_lose_context events -> the first rebuilds the world, the second demotes LIVE to the 2D sibling of the current scene with G.ch unchanged and fail 'lost' persisted
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3fallback suite hung'); process.exit(1); }, 240000);
const env = await r3env('beatbox_heroes_r3fallback');
const verdict = (page, ms) => page.waitForFunction(() => window.BBH && BBH.R3 && BBH.R3.status !== 'idle' && BBH.R3.status !== 'booting' && BBH.Eng && BBH.Eng.sceneName === 'title', null, { timeout: ms || 20000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('bbh:r3') || 'null'));

// ---------------------------------------------------------------- (a) WebGL disabled
{
  const noGl = () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t) { return /webgl/i.test(String(t)) ? null : g.apply(this, arguments); }; };
  const { page, errs } = await env.newPage({ init: noGl });
  const t0 = Date.now(); await page.goto(env.url('index.html?r=3d')); await verdict(page);
  const a = await page.evaluate(() => ({ status: BBH.R3.status, reason: BBH.R3.reason, on: BBH.R3.on, scene2d: BBH.Eng.scene === BBH.Eng.scenes.title, r3: document.body.classList.contains('r3'), kit: !!document.getElementById('r3kit'), splash: getComputedStyle(document.getElementById('boot3')).display }));
  ok(a.status === 'failed' && a.reason === 'no-webgl2' && !a.on, 'WebGL off: status failed, reason no-webgl2 (' + JSON.stringify(a) + ')');
  ok(a.scene2d && !a.r3 && !a.kit, 'WebGL off: the 2D title runs, the UI kit is uninstalled');
  await page.waitForTimeout(600); ok(await page.evaluate(() => getComputedStyle(document.getElementById('boot3')).display) === 'none', 'the 3D splash is gone');
  const st = await stored(page); ok(st && st.fail && st.fail.reason === 'no-webgl2' && st.fail.t > 0, 'bbh:r3.fail is persisted (' + JSON.stringify(st) + ')');
  ok(Date.now() - t0 < 15000, 'fallback is fast (' + (Date.now() - t0) + ' ms)');
  // the 2D game is playable: tap to start shows the menu buttons
  await page.mouse.click(180, 300); await page.waitForTimeout(300);
  ok((await page.locator('#ui .btn', { hasText: 'NEW GAME' }).count()) >= 1, 'the classic title menu works after the fallback');
  ok(errs.filter((e) => !/webgl/i.test(e)).length === 0, 'no unexpected console errors (WebGL off)' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  // next boot, auto mode: straight to 2D because of the stored failure (never even probes)
  await page.close();
  const auto = await env.newPage({ init: () => { window.BBH_R3_AUTO3D = true; } }); await auto.page.goto(env.url('index.html')); await auto.page.evaluate(() => localStorage.setItem('bbh:r3', JSON.stringify({ mode: 'auto', fail: { reason: 'chunk', t: 1 } })));
  await auto.page.goto(env.url('index.html')); await verdict(auto.page);
  ok(await auto.page.evaluate(() => BBH.R3.status === 'off' && BBH.R3.reason === 'previous-failure' && !BBH.R3.host), 'once AUTO is on, a stored fail sends the next boot straight to 2D (no probe, no download)');
  const sm = await auto.page.evaluate(() => ({ classic: BBH.R3.setMode('classic'), auto: BBH.R3.setMode('auto'), bad: BBH.R3.setMode('nope'), s: JSON.parse(localStorage.getItem('bbh:r3')) }));
  ok(sm.classic.mode === '2d' && sm.auto.mode === 'auto' && sm.bad === null && sm.s.fail === null && sm.s.mode === 'auto', 'R3.setMode persists the mode and resets the fail (' + JSON.stringify(sm) + ')');
  await auto.page.goto(env.url('index.html?q=low')); await auto.page.waitForFunction(() => BBH.R3.status === 'ready' || BBH.R3.status === 'failed', null, { timeout: 90000 });
  ok(await auto.page.evaluate(() => BBH.R3.status === 'failed' && BBH.R3.reason === 'software' && BBH.R3.mode === 'auto') && (await stored(auto.page)).fail.reason === 'software', 'auto mode rejects a software renderer (swiftshader) unless ?r=3d, and remembers it');
  await auto.page.close();
}
// retry with working WebGL: an explicit ?r=3d ignores an old failure, boots and clears it
{
  const { page, errs } = await env.newPage();
  await page.goto(env.url('index.html')); await page.evaluate(() => localStorage.setItem('bbh:r3', JSON.stringify({ mode: 'auto', fail: { reason: 'chunk', t: 1 } })));
  await page.goto(env.url('index.html?r=3d&q=low')); await page.waitForFunction(() => BBH.R3.status === 'ready' || BBH.R3.status === 'failed', null, { timeout: 90000 });
  ok(await page.evaluate(() => BBH.R3.status === 'ready' && JSON.parse(localStorage.getItem('bbh:r3')).fail === null), 'an explicit 3D boot retries after a failure and clears it');
  ok(errs.length === 0, 'no console errors on the retry' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await page.close();
}

// ---------------------------------------------------------------- (b) aborted chunk requests
for (const [label, pattern] of [['the entry module', /\/r3\/entry\.js/], ['a lazy world chunk', /\/r3\/p3-(world_stub|w_title)-[\w]+\.js/]]) {
  const { page } = await env.newPage(); let hits = 0;
  await page.route(pattern, (route) => { hits++; route.abort(); });
  const t0 = Date.now(); await page.goto(env.url('index.html?r=3d&q=low')); await verdict(page, 15000);
  const dt = Date.now() - t0, b = await page.evaluate(() => ({ status: BBH.R3.status, reason: BBH.R3.reason, scene2d: BBH.Eng.scene === BBH.Eng.scenes.title, host: !!BBH.R3.host, kit: !!document.getElementById('r3kit') }));
  ok(b.status === 'failed' && b.reason === 'chunk' && b.scene2d && !b.host && !b.kit && hits >= 1, 'aborted ' + label + ': 2D title, status failed/chunk (' + JSON.stringify(b) + ', ' + hits + ' aborted)');
  ok(dt < 15000, 'aborted ' + label + ': 2D within 15 s (' + dt + ' ms)');
  const st = await stored(page); ok(st && st.fail && st.fail.reason === 'chunk', 'aborted ' + label + ': fail persisted');
  await page.close();
}
// a request that never answers: the 12 s import timeout hands over to 2D
{
  const { page } = await env.newPage(); await page.route(/\/r3\/entry\.js/, () => { /* never fulfilled */ });
  const t0 = Date.now(); await page.goto(env.url('index.html?r=3d&q=low'), { waitUntil: 'domcontentloaded' }); await verdict(page, 20000);
  const dt = Date.now() - t0; ok(await page.evaluate(() => BBH.R3.status === 'failed' && BBH.R3.reason === 'timeout') && dt < 15000, 'a hanging chunk times out into 2D in under 15 s (' + dt + ' ms)');
  await page.close();
}

// ---------------------------------------------------------------- (c) context loss
{
  const { page, errs } = await env.newPage();
  await page.goto(env.url('index.html?r=3d&q=low')); await page.waitForFunction(() => BBH.R3.status === 'ready' || BBH.R3.status === 'failed', null, { timeout: 90000 });
  await page.waitForFunction(() => BBH.Eng.sceneName === 'title', null, { timeout: 30000 });
  const setup = await page.evaluate(async () => {
    const E = BBH.Eng, ch = BBH.Core.newChar(BBH.CATALOG.DEFAULT_LOOK); ch.name = 'Tester'; ch.cash = 777; BBH.G.setChar(ch); window.__ch0 = JSON.stringify(BBH.G.ch);
    let left = 0, entered = 0; window.__sib = { left: 0 };
    E.scenes3d.title = { is3d: true, world: 'title', enter() { entered++; return BBH.R3.load('title'); }, leave() { window.__sib.left++; }, update() {} };
    E.go('title', { from: 'test' }, { nofade: true });
    const t0 = performance.now(); while (performance.now() - t0 < 20000 && !(BBH.R3.active && BBH.R3.world && BBH.R3.world.id === 'title')) await new Promise((r) => setTimeout(r, 100));
    return { active: BBH.R3.active, scene3d: E.scene === E.scenes3d.title };
  });
  ok(setup.active && setup.scene3d, 'a 3D sibling is on screen before the context loss');
  const lose = () => page.evaluate(() => { const ext = BBH.R3.host.renderer.getContext().getExtension('WEBGL_lose_context'); window.__ext = ext; ext.loseContext(); return true; });
  await lose();
  await page.waitForFunction(() => { const h = document.getElementById('r3hiccup'); return h && getComputedStyle(h).display !== 'none'; }, null, { timeout: 5000 });
  ok(true, 'first loss shows the "Graphics hiccup" overlay');
  await page.evaluate(() => window.__ext.restoreContext());
  await page.waitForFunction(() => { const h = document.getElementById('r3hiccup'); return h && getComputedStyle(h).display === 'none' && BBH.R3.world && BBH.R3.world.id === 'title'; }, null, { timeout: 30000 });
  const mid = await page.evaluate(() => ({ status: BBH.R3.status, active: BBH.R3.active }));
  ok(mid.status === 'ready' && mid.active, 'first loss: the world is rebuilt and 3D keeps running (' + JSON.stringify(mid) + ')');
  await lose();
  await page.waitForFunction(() => BBH.R3.status === 'demoted', null, { timeout: 15000 });
  const fin = await page.evaluate(() => ({ status: BBH.R3.status, reason: BBH.R3.reason, on: BBH.R3.on, active: BBH.R3.active, r3: document.body.classList.contains('r3'), scene2d: BBH.Eng.scene === BBH.Eng.scenes.title, name: BBH.Eng.sceneName, args: BBH.Eng.sceneArgs, left: window.__sib.left, ch: JSON.stringify(BBH.G.ch) === window.__ch0, kit: !!document.getElementById('r3kit'), host: !!BBH.R3.host, wrap: getComputedStyle(document.getElementById('glwrap')).display, hic: (document.getElementById('r3hiccup') || { style: { display: 'none' } }).style.display, fade: BBH.Eng.scene && true }));
  ok(fin.status === 'demoted' && fin.reason === 'lost' && !fin.on && !fin.active && !fin.r3, 'second loss demotes live (' + JSON.stringify(fin) + ')');
  ok(fin.scene2d && fin.name === 'title' && fin.args && fin.args.from === 'test', 'the 2D sibling of the current scene is re-entered with the same args');
  ok(fin.left >= 1, 'the 3D sibling was left cleanly');
  ok(fin.ch, 'G.ch is unchanged by the demotion');
  ok(!fin.kit && !fin.host && fin.wrap === 'none' && fin.hic === 'none', 'UI kit uninstalled, host disposed, GL layer and hiccup overlay hidden');
  const st = await stored(page); ok(st && st.fail && st.fail.reason === 'lost', 'bbh:r3.fail persisted with reason lost (' + JSON.stringify(st && st.fail) + ')');
  // the classic game still works after the demotion
  await page.mouse.click(180, 300); await page.waitForTimeout(300);
  ok((await page.locator('#ui .btn', { hasText: 'NEW GAME' }).count()) >= 1, 'the classic title menu works after a live demotion');
  ok(errs.filter((e) => !/context|webgl/i.test(e)).length === 0, 'no unexpected console errors (context loss)' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await page.close();
}
clearTimeout(watchdog); await env.stop(); done();
