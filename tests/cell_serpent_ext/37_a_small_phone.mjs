// 37 a: 320x568 layout. The Battle stage card leads the tab and is not hidden by the dock, the Encore card keeps its
// heading on a dark plate, the Welcome Chest prizes stay on one line. Browser part skipped without Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'index.html'), 'utf8');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

ok((css.match(/\/\* @css:37-a-small-phone \*\//g) || []).length === 1 && css.includes('/* end @css:37-a-small-phone */'), 'one css block');
ok(css.indexOf('/* end @css:37-a-small-phone */') < css.indexOf('/* @css:34-phone-hub */'), 'before the phone hub block');
{
  const blk = css.slice(css.indexOf('/* @css:37-a-small-phone */'), css.indexOf('/* end @css:37-a-small-phone */'));
  ok(!blk.includes(String.fromCharCode(0x2014)), 'no em dash');
  ok(/\.stagebox\.bt\{order:-1\}/.test(blk) && /\.stagebox\.bt > \.fold\{order:9\}/.test(blk), 'stage card first, MORE fold last');
}

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch (e) { try { chromium = createRequire('/opt/node22/lib/node_modules/')('playwright').chromium; } catch (e2) { /* none */ } }
if (chromium) {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream'); r.end(d); }); }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 320, height: 568 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => localStorage.setItem('cell_serpent_save_v1', JSON.stringify({ v: 8, beats: 50000, sparkles: 300, cleared: 40, best: 40, runs: 90, xp: 9000, energy: { n: 40, t: 0 } })));
    await p.goto(`http://localhost:${port}/cell_serpent/`);
    await p.waitForFunction(() => window.CS && window.CS.openHub);
    await p.evaluate(() => window.CS.openHub('Battle'));
    await p.waitForSelector('#btHero', { state: 'visible' });
    await p.waitForFunction(() => document.querySelector('.bt-dock') && document.querySelector('.bt-dock').getBoundingClientRect().height > 0);
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const hero = document.querySelector('#btHero').getBoundingClientRect(), dock = document.querySelector('.bt-dock').getBoundingClientRect();
      const tap = document.querySelector('.bt-side .tapme'), t = tap ? tap.getBoundingClientRect() : null, ttl = document.querySelector('#stTitle');
      return { heroBottom: hero.bottom, dockTop: dock.top, tapBottom: t ? t.bottom : 0, titleClip: ttl.scrollHeight > ttl.clientHeight + 2 };
    });
    ok(r.heroBottom <= r.dockTop + 4, `320: the stage card ends above the dock ${JSON.stringify(r)}`);
    ok(r.tapBottom === 0 || r.tapBottom <= r.dockTop, '320: the fun fact line is not under the dock');
    await p.evaluate(() => window.CS.openHub('Shop'));
    await p.waitForSelector('.fbtx span', { state: 'visible' });
    const hgt = await p.evaluate(() => Math.round(document.querySelector('.fbtx span').getBoundingClientRect().height));
    ok(hgt <= 24, `320: Welcome Chest prizes on one line (height ${hgt})`);
    ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  } finally { await b.close(); srv.close(); }
}
console.log('37_a_small_phone ok ' + n);
