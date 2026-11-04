// 38: level-up cards read plainly. Unit: every upgrade gets one short sentence that uses the card's own number, no em dash.
// Browser (390x844, 360x640, 320x568): each card is a full-width row, its name and sentence are never cut off with an ellipsis,
// and the sentence is the plain one. Runs its asserts when imported. Browser part skipped without Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { plainDesc } from '../../cell_serpent/cards_plain_b15.js';
import { CAPSULE_UPS, PASSIVES } from '../../cell_serpent/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const EM = String.fromCharCode(8212);

for (const u of [...CAPSULE_UPS, ...PASSIVES]) {
  const kind = CAPSULE_UPS.includes(u) ? 'capsule' : 'passive', gain = u.vals[1];
  const t = plainDesc({ id: u.id, kind, gain, desc: u.fmt(gain) });
  ok(t.length > 4 && t.length <= 60 && !t.includes(EM), `${u.id}: a short sentence (${t})`);
  if (['aspd', 'cdmg', 'power', 'haste', 'crit', 'dbeat', 'enc'].includes(u.id)) ok(t.includes(String(gain) + '%'), `${u.id}: the sentence shows the card's own number (${t})`);
}
ok(plainDesc({ id: 'aspd', kind: 'capsule', gain: 8, desc: 'x' }) === 'Shoot 8% faster', 'attack speed');
ok(plainDesc({ id: 'notes', kind: 'capsule', gain: 2, desc: 'x' }) === 'Shoot 2 extra notes with every shot', 'notes plural');
ok(plainDesc({ id: 'burst', kind: 'capsule', gain: 1, desc: 'x' }) === 'Every shot repeats 1 more time', 'burst singular');
ok(plainDesc({ id: 'swab', kind: 'weapon', gain: 1, desc: 'Soft paws.' }) === 'Soft paws.', 'skills keep their own line');
ok(plainDesc({ id: 'brk', kind: 'passive', gain: 25, desc: 'Frost patches shield 25% less' }) === 'Frost patches shield 25% less', 'unlisted ids fall back to the card text');

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); }).listen(0);
  await new Promise(res => srv.once('listening', res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('38_cards_plain_b15: browser part skipped, no Chromium'); }
  if (browser) {
    const fails = [];
    const SAVE = JSON.stringify({ v: 8, beats: 900000, sparkles: 900, cleared: 40, best: 40, runs: 300, eggs: 30, ribbons: 80, xp: 90000, energy: { n: 40, t: 0 } });
    try {
      for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } });
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, SAVE);
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
        await p.evaluate(() => window.CS.startRun(9));
        await p.waitForFunction(() => window.CS.g && window.CS.g.phase === 'play', null, { timeout: 8000 });
        await p.evaluate(() => { window.CS.g.rerolls = 3; window.CS.g.pending = 1; });
        await p.waitForFunction(() => document.getElementById('levelup').classList.contains('on') && document.querySelectorAll('#cards > .card').length >= 3, null, { timeout: 8000 });
        await p.waitForTimeout(900);
        const r = await p.evaluate(() => [...document.querySelectorAll('#cards > .card')].map(c => {
          const box = c.getBoundingClientRect(), nt = c.querySelector('.nt'), ds = c.querySelector('.ds'), cut = e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2;
          return { w: box.width, vw: innerWidth, name: nt.textContent, ds: ds.textContent, cutName: cut(nt), cutDs: cut(ds), ellipsis: getComputedStyle(nt).textOverflow === 'ellipsis' || getComputedStyle(ds).webkitLineClamp !== 'none' };
        }));
        n++;
        for (const c of r) {
          if (c.w < c.vw - 60) fails.push(`${w}: ${c.name} is not a full width row (${Math.round(c.w)})`);
          if (c.cutName || c.cutDs) fails.push(`${w}: ${c.name} is cut off`);
          if (c.ellipsis) fails.push(`${w}: ${c.name} still clips with an ellipsis`);
          if (c.ds.includes(EM) || c.ds.length < 4) fails.push(`${w}: ${c.name} has a bad sentence "${c.ds}"`);
        }
        await p.close();
      }
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(fails, [], 'plain cards:\n' + fails.join('\n'));
  } else srv.close();
} else console.log('38_cards_plain_b15: browser part skipped, no Chromium');
console.log('38_cards_plain_b15 ok', n);
