// 33 result round 11: settings search + solid CLOSE bar, hub sticker popup, revive progress, share line, at three phone sizes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(ROOT, 'cell_serpent');
const main = fs.readFileSync(path.join(dir, 'main.js'), 'utf8'), html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const B = await import(path.join(dir, 'result_b11.js'));
const S = await import(path.join(dir, 'sim.js'));
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('settings search matching', () => {
  assert.ok(B.matchSetting('Colour-blind mode (shapes, safer colours)', 'color'));
  assert.ok(B.matchSetting('Colour-blind mode', 'blind colour'));
  assert.ok(!B.matchSetting('Music', 'vibration'));
  assert.ok(B.matchSetting('anything', '   '));
});
ok('settings filter hides rows and empty headings', () => {
  const mk = (cls, text) => ({ classList: { contains: c => cls.split(' ').includes(c) }, textContent: text, hidden: false, id: '', tagName: 'DIV' });
  const kids = [{ tagName: 'H2', id: '', classList: { contains: () => false }, hidden: false }, mk('setgrp', 'A'), mk('tgl', 'Sound effects'), mk('setgrp', 'B'), mk('tgl', 'Vibration'), mk('cbstrip', 'x')];
  const none = { hidden: true }; const root = { children: kids, querySelector: () => none };
  assert.equal(B.filterSettings(root, 'vibr'), 1);
  assert.equal(kids[1].hidden, true); assert.equal(kids[2].hidden, true); assert.equal(kids[3].hidden, false); assert.equal(kids[4].hidden, false); assert.equal(kids[5].hidden, true);
  assert.equal(B.filterSettings(root, 'zzz'), 0); assert.equal(none.hidden, false);
  B.filterSettings(root, ''); assert.ok(kids.every(k => !k.hidden)); assert.equal(none.hidden, true);
});
ok('hub sticker news are remembered', () => {
  const store = { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = v; } };
  const sv = S.sanitizeSave({}); sv.runs = 1;
  assert.deepEqual(B.hubStickerNews(sv, store), [], 'first call only records');
  assert.deepEqual(B.hubStickerNews(sv, store), []);
  sv.cleared = 3; sv.beats = 10000;
  assert.deepEqual(B.hubStickerNews(sv, store).map(t => t.id).sort(), ['pig', 'three']);
  assert.deepEqual(B.hubStickerNews(sv, store), [], 'announced once');
  assert.deepEqual(B.readSeen({ getItem: () => 'oops' }), null);
});
ok('revive info and share line', () => {
  assert.equal(B.reviveShort(4, 10), 6); assert.equal(B.reviveShort(40, 10), 0);
  assert.match(B.reviveInfoHTML(3, 0.456, 4, 10), /45% cleared.*width:45%.*Need 6 more sparkles/s);
  assert.ok(!/Need/.test(B.reviveInfoHTML(3, 0.5, 10, 10)));
  assert.match(B.reviveInfoHTML(3, 0.5, 9, 10), /Need 1 more sparkle</);
  assert.equal(B.shareText({ won: true, stage: 7, stars: 3, kills: 120, time: 83 }, 'Mighty Moxies', 'u'), 'I cleared stage 7 (Mighty Moxies) in Cell Serpent with 3 stars: 120 cells popped in 1:23. Can you beat that? u');
  assert.match(B.shareText({ won: false, stage: 3, progress: 0.62, kills: 9, time: 5 }, '', ''), /62% through stage 3 in Cell Serpent: 9 cells popped in 0:05/);
  assert.equal(B.shareText(null), '');
});
ok('wiring and css', () => {
  assert.ok(/bindSettingsFind\(\$\('settings'\)\)/.test(main) && /hubStickerPop\(save/.test(main) && /reviveInfoHTML\(g\.stage/.test(main) && /\$\('rShare'\)\.onclick/.test(main) && /markStickersSeen\(save\)/.test(main));
  assert.ok(html.includes('id="setFind11"') && html.includes('id="rShare"') && html.includes('@css:33-result-settings') && /#settings #setClose\{box-shadow:0 0 0 8px #08051e/.test(html));
  const nd = String.fromCharCode(8212);
  assert.ok(!fs.readFileSync(path.join(dir, 'result_b11.js'), 'utf8').includes(nd));
  assert.ok(!html.slice(html.indexOf('@css:33-result-settings')).split('end @css:33-result-settings')[0].includes(nd));
});

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); }).listen(0);
  await new Promise(res => srv.once('listening', res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('33_result_b11: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 4, cleared: 14, best: 14, runs: 5, eggs: 3, xp: 1500, energy: { n: 40, t: 0 } };
    try {
      for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && errs.push(m.text()));
        await p.addInitScript(s => { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('cs_stk_seen_b11', '[]'); }, JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        // hub: stickers earned outside a run pop up once
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForSelector('.sp10', { timeout: 6000 });
        assert.match(await p.evaluate(() => document.querySelector('.sp10').textContent), /NEW STICKER/);
        await p.evaluate(() => { const e = document.querySelector('.sp10'); if (e) e.remove(); });
        // settings: search, then CLOSE stays on screen with a solid bar under it
        await p.evaluate(() => document.getElementById('setBtnH').click()); await p.waitForTimeout(700);
        await p.fill('#setFind11', 'vibrat'); await p.waitForTimeout(150);
        const s1 = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#settings .tgl')].filter(e => !e.hidden && e.offsetParent).length, grp: [...document.querySelectorAll('#settings .setgrp')].filter(e => !e.hidden).length, find: document.getElementById('setFind11').getBoundingClientRect().top }));
        assert.equal(s1.rows, 1); assert.equal(s1.grp, 1); assert.ok(s1.find >= 0 && s1.find < h / 2, 'search box stays near the top ' + s1.find);
        await p.fill('#setFind11', 'qqqq'); await p.waitForTimeout(100);
        assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('setNone11')).display !== 'none'), true, 'empty hint');
        await p.fill('#setFind11', ''); await p.waitForTimeout(100);
        await p.evaluate(() => { document.getElementById('settings').scrollTop = 400; }); await p.waitForTimeout(200);
        const s2 = await p.evaluate(() => { const c = document.getElementById('setClose').getBoundingClientRect(); const pts = [[c.left + c.width / 2, c.top + c.height / 2]].filter(q => q[1] < innerHeight); return { hit: pts.map(q => { const e = document.elementFromPoint(q[0], q[1]); return !e || !!e.closest('#setClose') || !e.closest('.tgl,.volrow,.tsrow,.cbstrip'); }), bottom: c.bottom, vh: innerHeight }; });
        assert.ok(s2.hit.every(Boolean), `${w}x${h}: CLOSE is hittable`); assert.ok(s2.bottom <= s2.vh + 1);
        await p.evaluate(() => document.getElementById('setClose').click()); await p.waitForTimeout(400);
        // revive: progress line and the sparkle shortfall
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(1200);
        await p.evaluate(() => window.CS.force('dead')); await p.waitForSelector('#revive.on', { timeout: 15000 }); await p.waitForTimeout(500);
        const rv = await p.evaluate(() => ({ t: document.getElementById('rvInfo').textContent, bar: !!document.querySelector('#rvInfo .rvbar11'), no: document.getElementById('rvNo').getBoundingClientRect().bottom, vh: innerHeight }));
        assert.match(rv.t, /Need 6 more sparkles/); assert.ok(rv.bar); assert.ok(rv.no <= rv.vh, `${w}x${h}: Give up on screen`);
        await p.evaluate(() => document.getElementById('rvNo').click());
        await p.waitForFunction(() => { if (!document.querySelector('#result.on') && document.querySelector('#revive.on')) document.getElementById('rvNo').click(); return document.querySelector('#result.on'); }, null, { timeout: 20000 }); await p.waitForTimeout(1800);
        const rs = await p.evaluate(() => { const q = s => document.querySelector(s).getBoundingClientRect(); return { retry: q('#rRetry').bottom, hub: q('#rHub').bottom, share: getComputedStyle(document.getElementById('rShare')).display, vh: innerHeight }; });
        assert.ok(rs.retry <= rs.vh + 1 && rs.hub <= rs.vh + 1, `${w}x${h}: RETRY and MENU on screen ${rs.retry}/${rs.vh}`);
        if (h < 760) assert.equal(rs.share, 'none', 'share chip hidden on short phones');
        assert.deepEqual(errs, []);
        await p.close();
      }
      n += 3;
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
}
console.log(`33_result_b11: ${n} checks passed`);
