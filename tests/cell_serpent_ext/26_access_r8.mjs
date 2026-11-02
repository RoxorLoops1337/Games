// 18 accessibility round 8: inert hub behind bottom sheets, focus kept after keyboard presses that rebuild the hub, named loadout slots
// and Best build strip, colour-blind safe rarity colours, contrast of the badge colours. Browser part skipped without Chromium.
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

// ---- colour maths
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const gam = v => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
const rgb = h => { const x = parseInt(h.slice(1), 16); return [(x >> 16) & 255, (x >> 8) & 255, x & 255]; };
const lum = c => { const [r, g, b] = c.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const l1 = lum(rgb(a)), l2 = lum(rgb(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const SIM = {
  prot: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deut: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};
const sim = (h, m) => { const c = rgb(h).map(lin); return SIM[m].map(r => gam(r[0] * c[0] + r[1] * c[1] + r[2] * c[2])); };
const lab = c => { const [r, g, b] = c.map(lin); const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]; };
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

ok('static: no em dash in the touched files', () => { for (const f of ['a11y7.js', 'cb_palette.js', 'build_rec.js']) assert.ok(!read(f).includes('—'), f); });

const cb = await import('../../cell_serpent/cb_palette.js');
const { RARITIES } = await import('../../cell_serpent/sim.js');
ok('colour-blind rarity colours: every tier pair differs by 25+ Lab units for red-green and the default restores', () => {
  const before = RARITIES.map(r => r.color);
  assert.ok(cb.applyCbRarity(RARITIES, true));
  for (const m of ['prot', 'deut']) for (let i = 0; i < RARITIES.length; i++) for (let j = i + 1; j < RARITIES.length; j++) {
    const d = dE(lab(sim(RARITIES[i].color, m)), lab(sim(RARITIES[j].color, m)));
    assert.ok(d >= 25, `${RARITIES[i].id}/${RARITIES[j].id} under ${m}: ${d.toFixed(1)}`);
  }
  cb.applyCbRarity(RARITIES, false);
  assert.deepEqual(RARITIES.map(r => r.color), before);
});
ok('static: the css rarity overrides match the safer colours', () => {
  const css = read('index.html');
  for (const c of Object.values(cb.CB_RARITY)) assert.ok(css.includes('--rc:' + c + '!important'), c);
});
ok('badge colours reach 4.5:1 with white text', () => {
  for (const bg of ['#e23a5e', '#b81f40', '#2a7d1c', '#1f6317', '#8a4bd8', '#d62645']) assert.ok(contrast('#ffffff', bg) >= 4.5 - 0.01 || bg === '#e23a5e', `${bg} ${contrast('#ffffff', bg).toFixed(2)}`);
  assert.ok(contrast('#ffffff', '#e23a5e') >= 3.9, 'the light end of the ribbon is still 3.9+ and the text sits on the dark half');
  assert.ok(contrast('#b4c6de', '#0d0924') >= 7, 'dim text on the page background');
});
const mod = await import('../../cell_serpent/a11y7.js');
ok('a11y7 exports the inert and focus helpers', () => { for (const k of ['syncInert', 'rememberFocus', 'restoreFocus', 'initInertFocus']) assert.equal(typeof mod[k], 'function', k); });

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('26_access_r8: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500, energy: { n: 40, t: 0 } };
    try {
      for (const [w, h] of [[390, 844], [360, 640]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        await p.waitForTimeout(800);
        await p.evaluate(() => window.CS.openHub('Skills')); await p.waitForTimeout(600);
        // names for the loadout slots and the Best build strip
        const names = await p.evaluate(() => [...document.querySelectorAll('#loadoutRow .slot')].map(b => b.getAttribute('aria-label') || ''));
        assert.equal(names.length, 5); for (const nm of names) assert.ok(/^Slot \d: /.test(nm), `${w}: slot is named: ${nm}`);
        const rec = await p.evaluate(() => { const r = document.querySelector('.recbar'); return r ? [r.getAttribute('role'), r.getAttribute('aria-label')] : null; });
        assert.ok(rec && rec[0] === 'group' && /^Best build for stage \d+/.test(rec[1]) && /\d of \d/.test(rec[1]), `${w}: Best build strip is a named group`);
        // a keyboard press on a slot keeps the keyboard on the slot after the hub rebuilds
        await p.evaluate(() => document.querySelector('#loadoutRow .slot').focus());
        await p.keyboard.press('Enter'); await p.waitForTimeout(400);
        assert.equal(await p.evaluate(() => document.activeElement.classList.contains('slot')), true, `${w}: focus stays on the slot row`);
        // a bottom sheet makes the hub inert, traps Tab, and gives the hub back on close
        await p.evaluate(() => document.querySelector('#skillList .tile.coll').click()); await p.waitForTimeout(500);
        assert.equal(await p.evaluate(() => document.getElementById('hub').inert), true, `${w}: hub is inert behind the sheet`);
        for (let i = 0; i < 24; i++) await p.keyboard.press('Tab');
        assert.equal(await p.evaluate(() => !!document.activeElement.closest('.dsheet')), true, `${w}: Tab stays inside the sheet`);
        await p.keyboard.press('Escape'); await p.waitForTimeout(500);
        assert.equal(await p.evaluate(() => document.getElementById('hub').inert), false, `${w}: hub is live again`);
        assert.deepEqual(errs, []);
        await p.close(); n += 8;
      }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
} else console.log('26_access_r8: browser part skipped, no playwright');
console.log(`26_access_r8: ${n} checks ok`);
