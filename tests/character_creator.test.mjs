// Character Studio smoke suite: the real page in headless Chromium. Every catalog option must draw without a script error, the
// config checker must reject junk, share links must round-trip, and the editor must load, switch tabs and export a PNG.
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless RB_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'character_creator';
const REQUIRED = process.env.RB_BROWSER === '1';
const skip = (why) => { console.log(NAME + ': SKIPPED, ' + why); if (REQUIRED) { console.log(NAME + ': 0 passed, 1 failed'); process.exit(1); } console.log(NAME + ': 0 passed, 0 failed'); process.exit(0); };
let chromium;
try {
  const req = createRequire(import.meta.url);
  let mod = null;
  for (const base of [HERE, '/opt/node-tools/node_modules/']) { try { mod = createRequire(base.endsWith('/') ? base : base + '/')('playwright-core'); break; } catch (e) { /* next */ } }
  if (!mod) skip('playwright-core not installed');
  chromium = mod.chromium;
} catch (e) { skip('playwright-core not installed'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (exe && !fs.existsSync(exe)) skip('CHROMIUM_PATH does not exist');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--allow-file-access-from-files'] }).catch((e) => skip('cannot launch Chromium: ' + e.message));
const url = pathToFileURL(path.join(HERE, '..', 'character_creator', 'index.html')).href;
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url); await page.waitForTimeout(600);

ok(await page.evaluate(() => !!(window.CC && CC.draw && CC.PRESETS.length >= 8)), 'the page loads CC');
// every option of every catalog draws, on its own and in the poses
const res = await page.evaluate(() => {
  const bad = [], cv = document.createElement('canvas'); cv.width = 400; cv.height = 500; const g = cv.getContext('2d');
  let n = 0;
  const base = CC.clean({});
  for (const k of CC.KEYS) {
    const cat = CC.catOf(k); if (!cat) continue;
    for (const o of cat) {
      for (const extra of [{}, { onepiece: 'none' }]) {
        try { const c = CC.clean(Object.assign({}, base, extra, { [k]: o.id })); g.clearRect(0, 0, 400, 500); CC.draw(g, c, { x: 200, y: 470, s: 1, pose: k === 'pose' ? o.id : 'idle', t: 1, expr: k === 'expr' ? o.id : undefined }); n++; } catch (e) { bad.push(k + '=' + o.id + ': ' + e.message); }
      }
    }
  }
  CC.CAT.pose.forEach((p) => { try { CC.draw(g, CC.PRESETS[0].c, { x: 200, y: 470, s: 1, pose: p.id, t: 2 }); n++; } catch (e) { bad.push('pose ' + p.id); } });
  return { bad, n };
});
ok(res.bad.length === 0, 'options draw: ' + res.bad.slice(0, 5).join(' | '));
ok(res.n > 300, 'drew many options (' + res.n + ')');
// the checker and the share link
const chk = await page.evaluate(() => {
  const j = CC.clean({ hair: 'nope', skin: 'red', headW: 99, junk: 1, name: '  ' });
  const c = CC.clean({ hair: 'braids', hairColor: '#112233', topPattern: 'stars', build: 1.2 });
  const back = CC.decode(CC.encode(c));
  return { j, same: JSON.stringify(back) === JSON.stringify(c), pat: c.topPattern, junk: 'junk' in j };
});
ok(chk.j.hair === 'pony_high' && chk.j.skin === '#fdd3b6' && chk.j.headW <= 1.14 && !chk.junk && chk.j.name === 'New Character', 'clean() rejects junk');
ok(chk.same && chk.pat === 'stars', 'share link round-trips');
// the roller is repeatable
ok(await page.evaluate(() => JSON.stringify(CC.roll(CC.rng(5), CC.DEFAULT, 'all')) === JSON.stringify(CC.roll(CC.rng(5), CC.DEFAULT, 'all'))), 'roll is seeded');
// the editor: every tab builds, undo works, a PNG sprite has pixels
for (const id of ['body', 'hair', 'face', 'details', 'outfit', 'shoes', 'extras', 'save']) { await page.click('#tab_' + id); await page.waitForTimeout(150); ok(await page.evaluate(() => document.querySelectorAll('#pane .sec').length > 0), 'tab ' + id + ' has sections'); }
await page.click('#tab_hair'); await page.waitForTimeout(150);
const before = await page.evaluate(() => CC_APP.cfg.hair);
await page.click('#pane .opt:nth-child(4)');
const after = await page.evaluate(() => CC_APP.cfg.hair);
ok(before !== after, 'a hair option changes the character');
await page.click('#undo');
ok(await page.evaluate(() => CC_APP.cfg.hair) === before, 'undo restores it');
const px = await page.evaluate(() => { const c = CC.render.sprite(CC_APP.cfg, { scale: 1 }); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return { w: c.width, h: c.height, n }; });
ok(px.n > 5000 && px.h > 200, 'the sprite export has pixels');
// the canvas is not blank
ok(await page.evaluate(() => { const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4000) seen.add(d[i] + ',' + d[i + 1]); return seen.size > 12; }), 'the preview canvas has real pixels');
// a phone: no horizontal overflow
await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(300);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), 'no sideways scroll on a phone');
ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(NAME + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
