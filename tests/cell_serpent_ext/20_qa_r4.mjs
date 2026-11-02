// 20 QA round 4: result screen on short phones, result wording, revive tap target.
// Runs its asserts when imported. The browser part is skipped when no Chromium or playwright is available.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const main = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'index.html'), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('result text: whole-number groove, singular cell, Encore has a name', () => {
  assert.ok(main.includes('Math.round(r.groove || 0)'), 'best groove is rounded (it used to print 20.500000000000007)');
  assert.ok(main.includes("r.kills === 1 ? 'cell' : 'cells'"), '1 cell, not 1 cells');
  assert.ok((main.match(/id === 'encore' \? 'Encore'/g) || []).length >= 2, 'the Encore damage source is named in the recap and in WHO DID WHAT');
});
ok('result screen scrolls instead of clipping and never squashes its buttons', () => {
  assert.match(html, /#result\{overflow-x:hidden;overflow-y:auto;justify-content:safe center\} #result > \*\{flex-shrink:0\}/);
  assert.match(html, /\.rvtimer\{min-height:36px/);
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
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('20_qa_r4: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500, energy: { n: 40, t: 0 } };
    try {
      for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && errs.push(m.text()));
        await p.addInitScript(s => localStorage.setItem('cell_serpent_save_v1', s), JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        // play stage 1 with the bot at full speed until it is won (a few seeds may lose)
        let won = false;
        for (let k = 0; k < 8 && !won; k++) {
          won = await p.evaluate(async () => { window.CS.startRun(1); const sim = await import('/cell_serpent/sim.js'); const g = window.CS.g; let i = 0; while (g.phase !== 'won' && g.phase !== 'dead' && i++ < 400000) { if (g.phase === 'levelup') sim.choose(g, 0); else sim.step(g, 1 / 60, sim.botInput(g)); } return g.phase === 'won'; });
          if (!won) { await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(200); }
        }
        assert.ok(won, 'the bot wins stage 1 within 8 tries');
        await p.waitForFunction(() => document.querySelector('#result.on') && document.querySelectorAll('#rList .r').length, null, { timeout: 15000 });
        await p.waitForTimeout(2600);   // entrance animations and the star reveal finish
        const m = await p.evaluate(() => {
          const r = document.getElementById('result'), q = s => document.querySelector(s).getBoundingClientRect();
          return { title: q('#rTitle').top, next: q('#rNext').height, nextBottom: q('#rNext').bottom, rowBottom: q('#result .row').bottom, vh: innerHeight, scroll: r.scrollHeight - r.clientHeight, ov: getComputedStyle(r).overflowY, groove: document.getElementById('rExtra').textContent };
        });
        assert.ok(m.title >= -1, `${w}x${h}: the title is not cut off at the top: ${m.title}`);
        assert.ok(m.next >= 40, `${w}x${h}: NEXT STAGE keeps its height: ${m.next}`);
        assert.ok(m.scroll <= 0 || m.ov === 'auto', `${w}x${h}: if it is taller than the phone it scrolls`);
        assert.ok(/Best groove \d+(?!\.)/.test(m.groove) && !/\d\.\d{3,}/.test(m.groove), 'groove has no float noise: ' + m.groove);
        if (h >= 568) assert.ok(m.rowBottom <= m.vh + 12, `${w}x${h}: RETRY and MENU are on screen without scrolling: ${m.rowBottom}`);
        assert.deepEqual(errs, []);
        await p.close();
      }
      n += 3;
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
}
console.log(`20_qa_r4: ${n} checks passed`);
