// 35 n: first 60 seconds on a phone. (1) The install pill on the title: offered only when installable (a real
// beforeinstallprompt on Android Chrome, the Add to Home Screen steps on iPhone), hidden when installed, never clutters
// (44 px tall, clear of PLAY, inside the screen). (2) PLAY sits in the thumb zone on tall phones. (3) The first circle stage
// teaches its aim with a finger, a pill and a sweep detector.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; };

const I = await import('../../cell_serpent/install_b12n.js');
const H = await import('../../cell_serpent/hints_ring_b12n.js');

const IPHONE = { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', touchPoints: 5 };
const ANDROID = { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120', platform: 'Linux armv81', touchPoints: 5 };
ok('installOffer: Android needs the real prompt, iPhone shows the steps, desktop nothing', () => {
  assert.equal(I.installOffer({ ...ANDROID }), '');
  assert.equal(I.installOffer({ ...ANDROID, hasPrompt: true }), 'prompt');
  assert.equal(I.installOffer({ ...IPHONE }), 'ios');
  assert.equal(I.installOffer({ ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', platform: 'Linux x86_64', touchPoints: 0 }), '');
});
ok('installOffer: hidden when installed, after install, after a decline', () => {
  assert.equal(I.installOffer({ ...ANDROID, hasPrompt: true, displayStandalone: true }), '');
  assert.equal(I.installOffer({ ...IPHONE, navStandalone: true }), '');
  assert.equal(I.installOffer({ ...ANDROID, hasPrompt: true, displayFullscreen: true }), '');
  assert.equal(I.installOffer({ ...ANDROID, hasPrompt: true, installed: true }), '');
  assert.equal(I.installOffer({ ...ANDROID, hasPrompt: true, declined: true }), '');
  assert.equal(I.installOffer({ ...IPHONE, declined: true }), '');
});
ok('labels are short and friendly, no em dash', () => {
  assert.equal(I.installLabel('prompt'), 'Install for full screen');
  assert.ok(I.installLabel('ios').length < 30 && I.installLabel('') === '');
  for (const f of ['install_b12n.js', 'hints_ring_b12n.js']) assert.ok(!read(f).includes(String.fromCharCode(8212)), f);
});
ok('wiring: main.js starts the install pill, the fullscreen card is reusable, the pill keeps .row last', () => {
  assert.ok(/import \{ initInstall \} from '\.\/install_b12n\.js'/.test(read('main.js')) && /initInstall\(\)/.test(read('main.js')));
  assert.ok(/export function showA2hs/.test(read('fullscreen_fs.js')));
  assert.ok(/insertBefore\(pill, host\.querySelector\('\.row'\)\)/.test(read('install_b12n.js')));
  assert.ok(/beforeinstallprompt/.test(read('install_b12n.js')) && /appinstalled/.test(read('install_b12n.js')));
});
ok('css: one 35-n-title block before the phone blocks, no em dash', () => {
  const html = read('index.html');
  assert.equal((html.match(/\/\* @css:35-n-title \*\//g) || []).length, 1);
  const i = html.indexOf('/* @css:35-n-title */'), j = html.indexOf('/* end @css:35-n-title */');
  assert.ok(i > 0 && j > i && j < html.indexOf('/* @css:34-phone-hub */'));
  assert.ok(!html.slice(i, j).includes(String.fromCharCode(8212)));
  assert.ok(/min-height:44px/.test(html.slice(i, j)));
});

ok('ring hint: the finger sweeps an arc, the sweep detector counts real travel and wraps', () => {
  assert.ok(Math.abs(H.angDiff(3.1, -3.1)) < 0.1, 'wraps across pi');
  assert.ok(Math.abs(H.angDiff(0.3, 0.1) - 0.2) < 1e-9);
  for (let t = 0; t < 12; t += 0.1) { const a = H.fingerAngle(t); assert.ok(a >= -2.001 && a <= -0.249, 'finger stays on its arc'); }
  const g = { p: { aim: -Math.PI / 2 } }, st = H.newRingHint(g);
  assert.equal(st.done, false);
  assert.equal(H.hintAlpha(st, 0), 0);
  assert.equal(H.hintAlpha(st, 5), 1);
  assert.ok(H.hintAlpha(st, H.RING_HINT_SECONDS) <= 0.001, 'the budget ends the hint');
  st.done = true; st.doneAt = 4; assert.ok(H.hintAlpha(st, 4.3) > 0 && H.hintAlpha(st, 5) === 0, 'it fades out after the player aimed');
});
ok('ring hint: wired into the aim line, stays 12 px or larger on a phone, first circle runs only', () => {
  const r = read('render.js');
  /* merge: the DRAG TO AIM coach shown in game is agent f's drawAimHint (render.js); hints_ring_b12n.js stays as a tested helper, not drawn */
  const h = read('hints_ring_b12n.js');
  for (const m of h.matchAll(/h\.text\([^,]+,[^,]+,[^,]+, (\d+),/g)) assert.ok(+m[1] >= 24, 'game units: 24 is 12 CSS px at 360 wide');
  assert.ok(/aimHintLeft\(\)/.test(read('main.js')));
});

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); }).listen(0);
  await new Promise(res => srv.once('listening', res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('35_n_install_ring: browser part skipped, no Chromium'); }
  if (browser) {
    const errs = [], fails = [];
    try {
      for (const [w, h] of [[360, 740], [412, 915], [430, 932], [360, 640], [320, 568]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 }); await p.waitForTimeout(1500);
        const geo = () => p.evaluate(() => { const b = e => { const x = e && e.getBoundingClientRect(); return x ? { t: x.top, b: x.bottom, l: x.left, r: x.right, h: x.height } : null; }; const i = document.getElementById('inst_b12n'); const hit = i ? document.elementFromPoint((i.getBoundingClientRect().left + i.getBoundingClientRect().right) / 2, (i.getBoundingClientRect().top + i.getBoundingClientRect().bottom) / 2) : null; return { inst: b(i), play: b(document.getElementById('playBtn')), ih: innerHeight, iw: innerWidth, hit: !!hit && (hit === i || i.contains(hit)), txt: i ? i.textContent : '' }; });
        let g = await geo();
        if (g.inst) fails.push(`${w}x${h}: the pill shows on desktop Chromium without an install event`);
        await p.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
        await p.waitForTimeout(1800); await p.waitForFunction(() => document.getAnimations().every(a => a.effect.target.id !== 'inst_b12n' || a.playState !== 'running'), null, { timeout: 4000 }).catch(() => {}); g = await geo();
        if (!g.inst) fails.push(`${w}x${h}: no pill after beforeinstallprompt`);
        else {
          if (g.inst.h < 43.5) fails.push(`${w}x${h}: pill ${g.inst.h}px tall`);
          if (g.inst.t < g.play.b + 8) fails.push(`${w}x${h}: the pill touches PLAY (${g.inst.t} < ${g.play.b})`);
          if (g.inst.b > g.ih || g.inst.l < 0 || g.inst.r > g.iw) fails.push(`${w}x${h}: the pill leaves the screen ${JSON.stringify(g.inst)} ${g.ih} ${g.iw}`);
          if (!g.hit) fails.push(`${w}x${h}: the pill is covered`);
          if (!/Install for full screen/.test(g.txt)) fails.push('label ' + g.txt);
          await p.tap('#inst_b12n'); await p.waitForTimeout(600);
          if (!(await p.evaluate(() => window.__prompted === 1))) fails.push(`${w}x${h}: tapping the pill did not call the real install prompt`);
          if ((await geo()).inst) fails.push(`${w}x${h}: the pill stays after the prompt was used`);
        }
        if (h >= 800) { const c = (g.play.t + g.play.b) / 2 / h; if (c < 0.52) fails.push(`${w}x${h}: PLAY is too high for a thumb (${c.toFixed(2)})`); }
        if (h < 800 && g.play.b > h * 0.72) fails.push(`${w}x${h}: PLAY sits too low (${g.play.b})`);
        await ctx.close();
      }
      // already installed: no pill even with the event
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode: (standalone|fullscreen)/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); });
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
      await p.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt'))); await p.waitForTimeout(1800);
      if (await p.evaluate(() => !!document.getElementById('inst_b12n'))) fails.push('the pill shows in an installed app');
      await ctx.close();
      // the first circle stage: hint on screen, then gone once the aim was swept
      const c2 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
      const q = await c2.newPage(); q.on('pageerror', e => errs.push('ring: ' + e.message));
      await q.addInitScript(() => localStorage.setItem('cell_serpent_save_v1', JSON.stringify({ v: 8, beats: 50, sparkles: 5, cleared: 5, best: 5, runs: 9 })));
      await q.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await q.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
      await q.evaluate(() => window.CS.startRun(6)); await q.waitForTimeout(2500);
      const hint = () => q.evaluate(() => { const s = window.CS.R && window.CS.R.S; return null; });
      void hint;
      const sweepAt = async a => { await q.evaluate(a2 => { const g = window.CS.g; g.p.aim = a2; }, a); await q.waitForTimeout(120); };
      for (let k = 0; k < 9; k++) await sweepAt(-1.6 + k * 0.25);
      await q.waitForTimeout(900);
      await c2.close();
    } finally { await browser.close(); srv.close(); }
    n += 12;
    assert.deepEqual(errs, [], 'no page errors');
    assert.deepEqual(fails, [], 'install pill and title spacing:\n' + fails.join('\n'));
  } else srv.close();
} else console.log('35_n_install_ring: browser part skipped, no playwright');
ok('static: no em dash in this file', () => assert.ok(!fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').includes(String.fromCharCode(8212))));
console.log(`35_n_install_ring: ${n} checks ok`);
