// 18 accessibility round 7: real 44px Season and Achievements pills, focus trap in settings, reduce-flashing preview,
// Collection filter group, build rename announce. The browser part is skipped when no Chromium or playwright is available.
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

ok('static: the pills have a 44px minimum and the build rename button is 44px', () => {
  assert.ok(read('index.html').includes('#tabBattle .qpill{min-height:44px}'));
  assert.ok(read('index.html').includes('.prren{width:44px;height:44px}'));
});
ok('static: no em dash in the new module', () => { assert.ok(!read('a11y7.js').includes('—')); });
const mod = await import('../../cell_serpent/a11y7.js');
ok('lootLine reads count, name, rarity', () => {
  const it = { className: 'it rar3', querySelector: q => q === '.cnt' ? { dataset: { n: '12' } } : q === 'small' ? { textContent: 'Kazoo' } : q === '.lnew' ? {} : null };
  assert.equal(mod.lootLine(it), '12 Kazoo, epic, new');
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
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('18_access_r7: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500, energy: { n: 40, t: 0 } };
    try {
      for (const [w, h] of [[390, 844], [360, 640]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        await p.waitForTimeout(800);
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(500);
        const hs = await p.evaluate(() => ['qSeason', 'qAch'].map(i => document.getElementById(i).offsetHeight));
        for (const x of hs) assert.ok(x >= 44, `${w}: pill is 44px tall, got ${x}`);
        await p.evaluate(() => window.CS.openHub('Gear')); await p.waitForTimeout(500);
        const gf = await p.evaluate(() => { const f = document.getElementById('gearFilters'); return [f.getAttribute('role'), [...f.querySelectorAll('button')].every(b => b.hasAttribute('aria-pressed')), f.querySelectorAll('button[aria-pressed="true"]').length]; });
        assert.deepEqual(gf, ['group', true, 1], `${w}: filter chips are toggle buttons`);
        await p.evaluate(() => (document.getElementById('setBtnH') || document.getElementById('setBtnT')).click()); await p.waitForTimeout(500);
        assert.equal(await p.evaluate(() => document.getElementById('settings').getAttribute('aria-modal')), 'true', `${w}: settings is modal`);
        assert.ok(await p.evaluate(() => !!document.getElementById('rfPrev')), `${w}: flash preview exists`);
        // the trap: Shift+Tab from the first control wraps to CLOSE, Tab from CLOSE wraps to the first control
        await p.evaluate(() => document.querySelector('#settings .tgl').focus());
        await p.keyboard.press('Shift+Tab');
        assert.equal(await p.evaluate(() => document.activeElement.id), 'setClose', `${w}: shift+tab wraps to CLOSE`);
        await p.keyboard.press('Tab');
        assert.equal(await p.evaluate(() => document.activeElement.classList.contains('tgl')), true, `${w}: tab wraps to the first control`);
        // focus that escaped the dialog is pulled back in
        await p.evaluate(() => document.activeElement.blur());
        await p.keyboard.press('Tab');
        assert.equal(await p.evaluate(() => !!document.activeElement.closest('#settings')), true, `${w}: tab from nowhere lands in settings`);
        // the preview text follows the setting
        const t0 = await p.evaluate(() => document.getElementById('rfPrev').getAttribute('aria-label'));
        await p.evaluate(() => document.querySelector('#settings .tgl[data-k="reduceFlash"]').click()); await p.waitForTimeout(150);
        const t1 = await p.evaluate(() => document.getElementById('rfPrev').getAttribute('aria-label'));
        assert.notEqual(t0, t1, `${w}: preview label changes with Reduce flashing`);
        assert.deepEqual(errs, []);
        await p.close(); n += 10;
      }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
} else console.log('18_access_r7: browser part skipped, no playwright');
console.log(`18_access_r7: ${n} checks ok`);
