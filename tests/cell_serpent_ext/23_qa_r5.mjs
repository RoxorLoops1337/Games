// 23 QA round 5: milestone ribbon text fits the frame, the debug force hook, forced death -> revive -> win -> result, swap sheet.
// Runs its asserts when imported. The browser part is skipped when no Chromium or playwright is available.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const main = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'main.js'), 'utf8');
const fx = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'screenfx.js'), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('milestone ribbon words shrink to fit the right edge (QUARTER DOWN! used to be cut off)', () => {
  assert.ok(fx.includes('(W - 250 - 16) / (m.txt.length * 0.7)'), 'the ribbon text size is capped by the room right of the pie');
  const room = 720 - 250 - 16;
  for (const t of ['QUARTER DOWN!', 'HALFWAY!', 'ALMOST THERE!']) assert.ok(Math.min(t.length > 12 ? 62 : 74, room / (t.length * 0.7)) * t.length * 0.7 <= room + 0.001);
});
ok('QA hook: CS.force jumps a live run to dead or won', () => {
  assert.match(main, /force: kind => \{ if \(mode !== 'play'/);
  assert.ok(main.includes("kind === 'dead'") && main.includes("kind === 'won'"));
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
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('23_qa_r5: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500, energy: { n: 40, t: 0 }, skills: { swab: { lv: 2 }, daggers: { lv: 2 }, tower: { lv: 2 }, dragon: { lv: 2 }, needles: { lv: 2 }, stick: { lv: 2 } } };
    try {
      for (const [w, h] of [[390, 844], [320, 568]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && errs.push(m.text()));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        // swap sheet: a full loadout offers SWAP IN, the sheet swaps one skill and closes
        await p.evaluate(() => window.CS.openHub('Skills')); await p.waitForTimeout(400);
        const sw = await p.evaluate(() => { const b = [...document.querySelectorAll('#skillList button')].find(x => /SWAP IN/.test(x.textContent)); if (!b) return null; b.click(); return JSON.stringify(window.CS.save().loadout); });
        assert.ok(sw, `${w}: a SWAP IN button exists`);
        await p.waitForSelector('.swapbg.on', { timeout: 2000 });
        const inside = await p.evaluate(() => [...document.querySelectorAll('.swopt')].every(o => { const r = o.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 40; }));
        assert.ok(inside, `${w}: swap options stay on screen and tappable`);
        await p.evaluate(() => document.querySelector('.swopt').click()); await p.waitForTimeout(500);
        assert.notEqual(await p.evaluate(() => JSON.stringify(window.CS.save().loadout)), sw, 'the loadout changed');
        assert.equal(await p.evaluate(() => !!document.querySelector('.swapbg')), false, 'the sheet closed');
        // forced death -> revive prompt on screen -> revive -> forced win -> result
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(1000);
        assert.equal(await p.evaluate(() => window.CS.force('dead')), true);
        await p.waitForFunction(() => document.querySelector('#revive.on'), null, { timeout: 6000 });
        const rb = await p.evaluate(() => { const r = document.getElementById('rvGo').getBoundingClientRect(), q = document.getElementById('rvNo').getBoundingClientRect(); return [r.bottom, q.bottom, innerHeight]; });
        assert.ok(rb[0] <= rb[2] && rb[1] <= rb[2], `${w}: REVIVE and Give up are on screen ${rb}`);
        await p.evaluate(() => document.getElementById('rvGo').click()); await p.waitForTimeout(600);
        assert.equal(await p.evaluate(() => window.CS.g.phase), 'play', 'revived');
        assert.equal(await p.evaluate(() => window.CS.force('won')), true);
        await p.waitForFunction(() => document.querySelector('#result.on'), null, { timeout: 8000 });
        assert.equal(await p.evaluate(() => window.CS.force('dead')), false, 'force is a no-op outside a run');
        assert.deepEqual(errs, []);
        await p.close(); n += 5;
      }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
}
console.log(`23_qa_r5: ${n} checks passed`);
