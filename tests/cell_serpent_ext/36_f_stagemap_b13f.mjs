// 36 f: the ALL STAGES sheet preview card (stagemap_b13f.js). Pure helpers, wiring, css placement, and a browser check
// (tap selects and previews, a second tap or GO jumps, locked stages do nothing, targets >= 44 px). Browser part skipped without Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

const mod = await import(path.join(ROOT, 'cell_serpent', 'stagemap_b13f.js'));
ok(mod.powerTag(900, 900).id === 'ok' && mod.powerTag(700, 900).id === 'close' && mod.powerTag(100, 900).id === 'risky', 'power tags');
ok(mod.powerTag(700, 900).gap === 200 && mod.powerTag(900, 900).gap === 0, 'power gap');
const html = mod.previewHTML({ n: 7, info: { name: 'Mochi <b>', length: 40, hp: 1500, boss: true, kind: 'ring' }, stars: 2, best: 30, mine: 100, rec: 900, done: true, next: false });
ok(html.includes('STAGE 7') && html.includes('BOSS') && html.includes('CIRCLE') && html.includes('1.5k') && html.includes('Best 30%') && html.includes('RISKY') && html.includes('pvgo'), 'preview html');
ok(!html.includes('<b>Mochi <b>'), 'names are escaped');
ok(!mod.previewHTML({ n: 20, info: { name: 'X', length: 1, hp: 2, kind: 'lane' }, stars: 0, best: 0, mine: 1, rec: 900, done: false, next: false }).includes('class="pvt '), 'no power tag on a stage that is not next');

{
  const css = read('index.html'), b11 = read('battle_b11.js'), main = read('main.js');
  ok((css.match(/\/\* @css:36-f-stagemap \*\//g) || []).length === 1 && css.includes('/* end @css:36-f-stagemap */'), 'one css block');
  ok(css.indexOf('/* end @css:36-f-stagemap */') < css.indexOf('/* @css:34-phone-hub */'), 'before the phone hub block');
  ok(/wirePreview\(sh, c, close\)/.test(b11) && /from '\.\/stagemap_b13f\.js'/.test(b11), 'battle_b11 wires the preview');
  ok(/info: stageInfo, mine: \(\) => power\(save\), rec: n => recPower\(n, false\)/.test(main), 'main passes the preview data');
  ok(![css, b11, main, read('stagemap_b13f.js')].some(t => t.includes(String.fromCharCode(0x2014))), 'no em dash');
}

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch (e) { try { chromium = createRequire('/opt/node22/lib/node_modules/')('playwright').chromium; } catch (e2) { /* none */ } }
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch();
  try {
    for (const [w, h] of [[390, 844], [360, 640]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(() => localStorage.setItem('cell_serpent_save_v1', JSON.stringify({ v: 8, beats: 500, sparkles: 30, cleared: 14, best: 14, runs: 30, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2 } })));
      await p.goto(`http://localhost:${port}/cell_serpent/`);
      await p.waitForFunction(() => window.CS && window.CS.openHub);
      await p.evaluate(() => window.CS.openHub('Battle'));
      await p.waitForSelector('#stOverview', { state: 'attached' });
      await p.evaluate(() => document.getElementById('stOverview').click());
      await p.waitForSelector('.ovpv .pvgo');
      ok(await p.evaluate(() => !!document.querySelector('.ovpv .pvface') && document.querySelector('.ovpv').textContent.includes('STAGE 1')), `${w}: the sheet opens with the current stage previewed`);
      await p.evaluate(() => document.querySelector('.ovc[data-n="6"]').click());
      ok(await p.evaluate(() => document.querySelector('.ovpv').textContent.includes('STAGE 6') && document.querySelector('.ovc.sel').dataset.n === '6' && !!document.querySelector('.ovbg')), `${w}: a tap previews without jumping`);
      const box = await p.evaluate(() => { const r = document.querySelector('.ovpv .pvgo').getBoundingClientRect(); return { w: r.width, h: r.height, bottom: r.bottom }; });
      ok(box.w >= 44 && box.h >= 44 && box.bottom <= h, `${w}: GO is a big tap target and on screen`);
      await p.evaluate(() => document.querySelector('.ovc.lock') && document.querySelector('.ovc.lock').click());
      ok(await p.evaluate(() => document.querySelector('.ovc.sel').dataset.n === '6'), `${w}: a locked stage does not select`);
      await p.evaluate(() => document.querySelector('.ovpv .pvgo').click());
      await p.waitForFunction(() => !document.querySelector('.ovbg'));
      ok(await p.evaluate(() => document.getElementById('stSub').textContent.includes('Stage 6')), `${w}: GO jumps to the stage and closes the sheet`);
      await p.evaluate(() => document.getElementById('stOverview').click());
      await p.waitForSelector('.ovpv .pvgo');
      await p.evaluate(() => { document.querySelector('.ovc[data-n="9"]').click(); document.querySelector('.ovc[data-n="9"]').click(); });
      await p.waitForFunction(() => !document.querySelector('.ovbg'));
      ok(await p.evaluate(() => document.getElementById('stSub').textContent.includes('Stage 9')), `${w}: a second tap on the same stage jumps`);
      ok(errs.length === 0, `${w}: no page errors ${errs.join('|')}`);
      await p.close();
    }
  } finally { await b.close(); srv.close(); }
}
console.log('36_f_stagemap_b13f ok', n);
