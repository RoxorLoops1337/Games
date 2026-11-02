// Accessibility round 6: true 44px loadout slots, reduce flashing (separate from reduce motion), high-contrast HUD,
// dialog behaviour and labels for the swap sheet and the builds row. Browser part is skipped when no Chromium is found.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
const acc = await import(path.join(ROOT, 'cell_serpent', 'access.js'));
const html = read('index.html');

// ---- reduce flashing is its own switch, saved, sanitized and wired to the renderer and the page
{
  assert.equal(sim.defaultSave().settings.reduceFlash, false, 'off by default');
  const t = sim.sanitizeSave({ settings: { reduceFlash: true, reduceMotion: false } });
  assert.equal(t.settings.reduceFlash, true); assert.equal(t.settings.reduceMotion, false, 'the two switches are independent');
  assert.equal(sim.sanitizeSave({ settings: { reduceFlash: 'yes' } }).settings.reduceFlash, false, 'junk is ignored');
  assert.equal(sim.sanitizeSave({ v: 8 }).settings.reduceFlash, false, 'an old save loads with it off');
  assert.match(html, /data-k="reduceFlash"/); assert.match(html, /@css:18-access round 6/);
  assert.match(html, /html\.rf \.lvflash,html\.rf \.legflash\{display:none!important\}/, 'DOM flashes go dark under html.rf');
  assert.match(read('main.js'), /reduceFlash: !!save\.settings\.reduceFlash/);
  const r = read('render.js');
  assert.match(r, /else if \(OPT\.reduceFlash\) S\.flash = 0/, 'the screen flash overlay is zeroed, the shake stays');
  assert.match(r, /noFlash: OPT\.reduceFlash/, 'boss lightning and the phase flash are switched off');
  assert.match(read('bg_world.js'), /!o\.noFlash\) lightning\(/);
}

// ---- helpers and labels (static)
{
  const l = ['a', 'b', 'c'];
  assert.equal(acc.wrapTab(l, 'c', false), 0, 'Tab wraps from the last to the first'); assert.equal(acc.wrapTab(l, 'a', true), 2, 'Shift+Tab wraps backwards');
  assert.equal(acc.wrapTab(l, 'x', false), 0); assert.equal(acc.wrapTab([], 'a', false), -1);
  const swap = read('loadout_ux.js'), pre = read('presets_ux.js');
  assert.match(swap, /aria-label', `Swap out \$\{wname\(id\)\}, level \$\{lv\}/, 'each swap option says who steps out');
  assert.match(swap, /announce\(`\$\{wname\(newId\)\} swapped in for/);
  assert.match(pre, /aria-pressed/); assert.match(pre, /Build \$\{(NAMES\[i\]|nm)\} loaded/);
  assert.ok(!/—/.test(read('access.js') + swap + pre + html.slice(html.indexOf('@css:18-access round 6'))), 'no em dash');
}

// ---- real browser
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), path.join(ROOT, '..', '..', '..', 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('18_access_r6: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 9999, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3 } };
    const open = async (w, h, extra = {}) => {
      const p = await browser.newPage({ viewport: { width: w, height: h } }); p.errs = [];
      p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && p.errs.push(m.text()));
      await p.addInitScript(s => localStorage.setItem('cell_serpent_save_v1', s), JSON.stringify({ ...SAVE, ...extra }));
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
      return p;
    };
    try {
      // 1. the Battle loadout slots, EDIT, stage arrows and chips are real 44px on small phones
      for (const [w, h] of [[360, 640], [320, 568], [390, 844]]) {
        const p = await open(w, h); await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(600);
        const sizes = await p.evaluate(() => [...document.querySelectorAll('#tabBattle .bt-load .slot, #tabBattle #loadEdit')].map(b => { const r = b.getBoundingClientRect(); return [b.offsetWidth, b.offsetHeight, Math.round(r.left), Math.round(r.right), b.id || 'slot', Math.round(r.top)]; }));
        assert.ok(sizes.length >= 6, 'slots and edit exist at ' + w);
        for (const s of sizes) assert.ok(s[0] >= 43.9 && s[1] >= 43.9, `loadout target ${s[0]}x${s[1]} at ${w}`);
        const boxes = sizes.filter(s => s[4] === 'slot'); for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i][2] >= boxes[i - 1][3] - 0.5 || boxes[i][5] > boxes[i - 1][5], 'slots do not overlap at ' + w);
        const edit = sizes.find(s => s[4] === 'loadEdit'); assert.ok(edit[3] <= w, 'EDIT stays on screen at ' + w);
        const lastSlot = boxes[boxes.length - 1]; assert.ok(edit[2] >= lastSlot[3] || edit[5] > lastSlot[5], 'EDIT does not sit on a slot at ' + w);
        const cs = await p.evaluate(() => { const a = document.getElementById('stPrev'), b = document.getElementById('stNext'); const ch = [...document.querySelectorAll('#stChips .chip')]; return [a.offsetWidth, a.offsetHeight, b.offsetWidth, b.offsetHeight, Math.min(...ch.map(c => Math.min(c.offsetWidth, c.offsetHeight)))]; });
        for (const v of cs) assert.ok(v >= 43.9, 'stage arrows and chips are 44px or more: ' + cs + ' at ' + w);
        assert.deepEqual(p.errs, [], 'no page errors'); await p.close();
      }

      // 2. high-contrast HUD: the stage plate becomes a near-solid panel, so its darkness no longer depends on the art
      const lum = async hc => {
        const p = await open(390, 844, { settings: { highContrast: hc } });
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(1500);
        const v = await p.evaluate(() => { const c = document.getElementById('c'), k = c.width / c.clientWidth, cx = c.getContext('2d'); const x = Math.round(c.clientWidth * 0.36 * k), y = Math.round(92 * k); const d = cx.getImageData(x, y, 10, 10).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4); });
        assert.deepEqual(p.errs, [], 'no page errors'); await p.close(); return v;
      };
      const normal = await lum(false), hc = await lum(true);
      assert.ok(hc < 40, 'high-contrast stage plate is dark: ' + hc); assert.ok(hc <= normal + 1, 'and not lighter than the normal HUD: ' + hc + ' vs ' + normal);

      // 3. reduce flashing: html.rf follows the switch and it is independent of reduce motion
      { const p = await open(390, 844); await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(300);
        await p.evaluate(() => document.getElementById('setBtnH').click()); await p.waitForTimeout(400); await p.evaluate(() => window.CS.fold.openAll()); await p.waitForTimeout(100);   // b12r: settings groups open
        await p.click('#settings .tgl[data-k="reduceFlash"]', { force: true }); await p.waitForTimeout(250);
        let st = await p.evaluate(() => [document.documentElement.classList.contains('rf'), document.documentElement.classList.contains('rm'), window.CS.save().settings.reduceFlash, window.CS.save().settings.reduceMotion]);
        assert.deepEqual(st, [true, false, true, false], 'flashing is calmed while motion stays on');
        await p.click('#settings .tgl[data-k="reduceFlash"]', { force: true }); await p.waitForTimeout(250);
        assert.equal(await p.evaluate(() => document.documentElement.classList.contains('rf')), false, 'toggles back off');
        assert.deepEqual(p.errs, [], 'no page errors'); await p.close(); }

      // 4. swap sheet: a named modal dialog, focus moves in, Tab stays inside, Escape closes, options have real names
      { const p = await open(390, 844, { skills: { swab: { lv: 3 }, daggers: { lv: 2 }, tower: { lv: 2 }, dragon: { lv: 2 }, needles: { lv: 2 }, stick: { lv: 4 } }, loadout: ['swab', 'daggers', 'tower', 'dragon', 'needles'] });
        await p.evaluate(() => window.CS.openHub('Skills')); await p.waitForTimeout(600);
        const opened = await p.evaluate(async () => { const m = await import('./loadout_ux.js'); const s = window.CS.save(); const ids = Object.keys(s.skills).filter(i => s.skills[i].lv > 0 && !s.loadout.includes(i)); if (s.loadout.length < 5 || !ids.length) return ''; m.swapSheet({ save: () => window.CS.save(), persist() {}, audio: { play() {} }, icon: () => '', rerender() {} }, ids[0]); return ids[0]; });
        assert.ok(opened, 'the fixture has a full loadout and a spare skill');
        await p.waitForTimeout(300);
        const d = await p.evaluate(() => { const sh = document.querySelector('.dsheet.lswap'); return [sh.getAttribute('role'), sh.getAttribute('aria-modal'), sh.getAttribute('aria-label'), document.activeElement.className, [...sh.querySelectorAll('.swopt')].map(b => b.getAttribute('aria-label'))]; });
        assert.equal(d[0], 'dialog'); assert.equal(d[1], 'true'); assert.match(d[2], /^Swap in /); assert.ok(/swopt/.test(d[3]), 'focus moved to the first option: ' + d[3]);
        assert.equal(d[4].length, 5); for (const l of d[4]) assert.match(l, /^Swap out .+, level \d+, the new skill is (stronger|weaker|about the same)$/);
        for (let i = 0; i < 12; i++) await p.keyboard.press('Tab');
        assert.ok(await p.evaluate(() => !!document.activeElement.closest('.dsheet.lswap')), 'Tab never leaves the sheet');
        for (let i = 0; i < 3; i++) await p.keyboard.press('Shift+Tab');
        assert.ok(await p.evaluate(() => !!document.activeElement.closest('.dsheet.lswap')), 'Shift+Tab never leaves the sheet');
        await p.keyboard.press('Escape'); await p.waitForTimeout(500);
        assert.equal(await p.evaluate(() => document.querySelectorAll('.swapbg').length), 0, 'Escape closes the sheet');
        assert.deepEqual(p.errs, [], 'no page errors'); await p.close(); }

      // 5. builds row: grouped, named by its skills, pressed state, empty slots say so, SAVE is 44px tall
      { const p = await open(390, 844, { presets: [['swab', 'daggers'], [], []], loadout: ['swab', 'daggers'] });
        await p.evaluate(() => window.CS.openHub('Skills')); await p.waitForTimeout(700); await p.evaluate(() => window.CS.fold.openAll()); await p.waitForTimeout(200);   // b12r: the Builds fold
        const b = await p.evaluate(() => [...document.querySelectorAll('.prcell')].map(c => [c.getAttribute('role'), c.getAttribute('aria-label'), c.querySelector('.prmain').getAttribute('aria-label'), c.querySelector('.prmain').getAttribute('aria-pressed'), c.querySelector('.prsave').offsetHeight]));
        assert.equal(b.length, 3); assert.deepEqual(b[0].slice(0, 2), ['group', 'Build A']);
        assert.match(b[0][2], /^Build A is equipped: .+, .+$/); assert.equal(b[0][3], 'true'); assert.match(b[1][2], /^Build B is empty$/);
        for (const r of b) assert.ok(r[4] >= 44, 'SAVE buttons are 44px tall: ' + r[4]);
        assert.deepEqual(p.errs, [], 'no page errors'); await p.close(); }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
} else console.log('18_access_r6: browser part skipped, no playwright');
console.log('18_access_r6 ok');
