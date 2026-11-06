// 24 QA round 6: the hub settings button's 44px hit pad must not cover the whole hub (it did: the inline position:static
// left its ::before pad sized against #hub, so every tap in the hub hit Settings and chests could not be held),
// and long names in mastery and chest tiles stay inside their tile on narrow phones.
// Runs its asserts when imported. The browser part is skipped when no Chromium or playwright is available.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'index.html'), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('static: the settings button keeps position:relative even though its inline style says static', () => {
  assert.ok(html.includes('#setBtnH{position:relative!important}'));
  assert.ok(html.includes('.tile.mast .nm{min-width:0}'));
});

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('24_qa_r6: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 900000, sparkles: 900, cleared: 40, best: 40, runs: 300, eggs: 30, xp: 90000, energy: { n: 40, t: 0 } };
    try {
      for (const [w, h] of [[390, 844], [320, 568]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && errs.push(m.text()));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        await p.waitForTimeout(800);
        await p.evaluate(() => window.CS.openHub('Gear')); await p.waitForTimeout(600);
        const hit = await p.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.6); return !!(e && e.closest('#setBtnH')); });
        assert.equal(hit, false, `${w}: the middle of the hub is not the settings button`);
        // a held chest tile charges (hold2 after 650ms)
        const loc = p.locator('#gearBody .chestcard').first(); await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
        const bb = await loc.boundingBox();
        await p.mouse.move(bb.x + 30, bb.y + 30); await p.mouse.down(); await p.waitForTimeout(900);
        assert.equal(await p.evaluate(() => !!document.querySelector('.chest3.hold2')), true, `${w}: the held chest charges`);
        await p.mouse.up();
        // mastery names stay inside their tile
        await p.evaluate(() => { const b = [...document.querySelectorAll('#battleSide .sidebtn')]; });
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(400);
        await p.evaluate(() => [...document.querySelectorAll('#battleSide .sidebtn')].find(b => /Goals/.test(b.textContent)).click()); await p.waitForTimeout(800);
        const over = await p.evaluate(() => [...document.querySelectorAll('#pBody .tile.mast .nm')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
        assert.deepEqual(over, [], `${w}: mastery names fit`);
        assert.deepEqual(errs, []);
        await p.close(); n += 4;
      }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
}
console.log(`24_qa_r6: ${n} checks passed`);
