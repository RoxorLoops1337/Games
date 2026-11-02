// Phone full screen: manifest + icons, meta tags, settings default, A2HS hint logic, requestFullscreen on a tap, no sideways scroll.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CS = path.join(ROOT, 'cell_serpent');
const sim = await import(path.join(CS, 'sim.js'));
const F = await import(path.join(CS, 'fullscreen_fs.js'));
const html = fs.readFileSync(path.join(CS, 'index.html'), 'utf8');

// ---- manifest and icons
const man = JSON.parse(fs.readFileSync(path.join(CS, 'manifest.webmanifest'), 'utf8'));
assert.equal(man.name, 'RoxorLoops & Jasmin: Cell Serpent');
assert.equal(man.short_name, 'Cell Serpent');
assert.equal(man.start_url, './'); assert.equal(man.scope, './');
assert.equal(man.display, 'fullscreen'); assert.deepEqual(man.display_override, ['fullscreen', 'standalone']);
assert.equal(man.orientation, 'portrait');
assert.ok(/^#[0-9a-f]{6}$/i.test(man.background_color) && man.theme_color === '#0d0924');
const pngSize = f => { const b = fs.readFileSync(f); assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', f + ' is a PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const purposes = new Set();
for (const ic of man.icons) {
  const [w, h] = pngSize(path.join(CS, ic.src)); assert.equal(ic.sizes, w + 'x' + h, ic.src + ' size matches'); assert.equal(ic.type, 'image/png');
  assert.ok(fs.statSync(path.join(CS, ic.src)).size < 60000, ic.src + ' stays small'); purposes.add(ic.sizes + ic.purpose);
}
for (const k of ['192x192any', '512x512any', '512x512maskable']) assert.ok(purposes.has(k), 'icon ' + k);
assert.deepEqual(pngSize(path.join(CS, 'icons/apple-touch-icon-180_fs.png')), [180, 180]);

// ---- meta tags
assert.ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html));
assert.ok(/<link rel="apple-touch-icon" href="icons\/apple-touch-icon-180_fs\.png">/.test(html));
assert.ok(/name="apple-mobile-web-app-capable" content="yes"/.test(html));
assert.ok(/name="apple-mobile-web-app-status-bar-style" content="black-translucent"/.test(html));
assert.ok(/name="apple-mobile-web-app-title"/.test(html) && /name="theme-color" content="#0d0924"/.test(html));
assert.ok(/name="viewport"[^>]*viewport-fit=cover/.test(html));
assert.ok(/100dvh/.test(html) && /overscroll-behavior:none/.test(html));
assert.ok(!/—/.test(html.slice(html.indexOf('@css:34-fullscreen'))) && !/—/.test(fs.readFileSync(path.join(CS, 'fullscreen_fs.js'), 'utf8')));

// ---- settings default and old saves
assert.equal(sim.defaultSave().settings.fullscreen, true);
{ const old = sim.sanitizeSave({ v: 8, settings: { music: false } }); assert.equal(old.settings.fullscreen, true, 'old saves get the default'); assert.equal(old.settings.music, false); }
assert.equal(sim.sanitizeSave({ settings: { fullscreen: false } }).settings.fullscreen, false);
assert.equal(sim.sanitizeSave({ settings: { fullscreen: 'yes' } }).settings.fullscreen, true, 'junk falls back');
assert.ok(/data-k="fullscreen"/.test(html), 'settings row exists');

// ---- A2HS hint logic (pure)
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
assert.equal(F.shouldShowA2hs({ ua: IPHONE, platform: 'iPhone' }), true, 'iPhone Safari, first time');
assert.equal(F.shouldShowA2hs({ ua: IPHONE, platform: 'iPhone', seen: true }), false, 'only once');
assert.equal(F.shouldShowA2hs({ ua: IPHONE, navStandalone: true }), false, 'installed (navigator.standalone)');
assert.equal(F.shouldShowA2hs({ ua: IPHONE, displayStandalone: true }), false, 'installed (display-mode)');
assert.equal(F.shouldShowA2hs({ ua: ANDROID, platform: 'Linux armv81', touchPoints: 5 }), false, 'never on Android');
assert.equal(F.shouldShowA2hs({ ua: DESKTOP, platform: 'Win32' }), false, 'never on desktop');
assert.equal(F.shouldShowA2hs({ ua: DESKTOP.replace('Windows NT 10.0; Win64; x64', 'Macintosh'), platform: 'MacIntel', touchPoints: 0 }), false, 'a real Mac is not an iPad');
assert.equal(F.shouldShowA2hs({ ua: DESKTOP.replace('Windows NT 10.0; Win64; x64', 'Macintosh'), platform: 'MacIntel', touchPoints: 5 }), true, 'iPadOS poses as a Mac with touch');
assert.equal(F.shouldShowA2hs({}), false);
assert.equal(F.A2HS_KEY, 'cell_serpent_a2hs_fs');
assert.equal(F.wantsFullscreenRequest({ enabled: true, supported: true, isFull: false }), true);
for (const o of [{ enabled: false, supported: true }, { enabled: true, supported: false }, { enabled: true, supported: true, isFull: true }, { enabled: true, supported: true, pending: true }]) assert.equal(F.wantsFullscreenRequest(o), false);

// ---- real browser
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('34_fullscreen_fs: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 99, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500, energy: { n: 40, t: 0 } };
    const open = async (w, h, save = SAVE, extra = '') => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const p = await ctx.newPage(); p.errs = [];
      p.on('pageerror', e => p.errs.push(e.message));
      await p.addInitScript(s => { localStorage.setItem('cell_serpent_save_v1', s); window.__fs = []; Element.prototype.requestFullscreen = function (o) { window.__fs.push(o || {}); return Promise.resolve(); }; }, JSON.stringify(save));
      if (extra) await p.addInitScript(extra);
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
      p.ctx = ctx; return p;
    };
    try {
      for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
        const p = await open(w, h); await p.waitForTimeout(500);
        const sw = () => p.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.body.scrollWidth]);
        let [a, b, c] = await sw(); assert.ok(a <= b && c <= b, `no sideways scroll on the title at ${w}x${h}: ${a} ${b} ${c}`);
        assert.equal(await p.evaluate(() => document.getElementById('rotateFs') && getComputedStyle(document.getElementById('rotateFs')).display), 'none', 'rotate overlay hidden in portrait');
        if (w === 390) {
          // the first tap on PLAY asks for fullscreen with the navigation hidden
          assert.equal(await p.evaluate(() => window.__fs.length), 0, 'nothing is requested without a gesture');
          await p.tap('#playBtn', { force: true }); await p.waitForTimeout(400);
          const calls = await p.evaluate(() => window.__fs);
          assert.ok(calls.length >= 1 && calls[0].navigationUI === 'hide', 'PLAY tap requested fullscreen (navigationUI hide)');
          // a run start asks again on its own gesture
          const n0 = calls.length; await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(300);
          assert.ok(await p.evaluate(() => window.__fs.length) > n0, 'starting a run requests fullscreen');
          [a, b, c] = await sw(); assert.ok(a <= b && c <= b, 'no sideways scroll in a run');
        }
        assert.deepEqual(p.errs, [], 'no page errors'); await p.ctx.close();
      }
      // setting off: no request on PLAY or run start
      { const p = await open(390, 844, { ...SAVE, settings: { fullscreen: false } }); await p.waitForTimeout(400);
        await p.tap('#playBtn', { force: true }); await p.waitForTimeout(300); await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(200);
        assert.equal(await p.evaluate(() => window.__fs.length), 0, 'the Full screen setting off means no request'); await p.ctx.close(); }
      // landscape phone: the rotate overlay shows
      { const p = await open(844, 390); await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('rotateFs')).display), 'flex', 'rotate overlay in landscape on a phone'); await p.ctx.close(); }
      // iPhone Safari: the hint appears once, then never again
      { const IP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        const p = await open(390, 844, SAVE, `Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(IP)}});Object.defineProperty(navigator,'platform',{get:()=>'iPhone'});delete Element.prototype.requestFullscreen;delete Element.prototype.webkitRequestFullscreen;`);
        await p.waitForTimeout(3200);
        assert.equal(await p.evaluate(() => !!document.getElementById('a2hsFs')), true, 'hint shown on iPhone');
        assert.equal(await p.evaluate(() => localStorage.getItem('cell_serpent_a2hs_fs')), '1');
        await p.click('#a2hsFs .a2x'); assert.equal(await p.evaluate(() => !!document.getElementById('a2hsFs')), false, 'dismissable');
        await p.reload(); await p.waitForTimeout(3200);
        assert.equal(await p.evaluate(() => !!document.getElementById('a2hsFs')), false, 'not shown a second time'); await p.ctx.close(); }
      // desktop-like phone emulation without iOS never shows it
      { const p = await open(390, 844); await p.waitForTimeout(3000); assert.equal(await p.evaluate(() => !!document.getElementById('a2hsFs')), false, 'no hint off iOS'); await p.ctx.close(); }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
}
console.log('34_fullscreen_fs ok');
