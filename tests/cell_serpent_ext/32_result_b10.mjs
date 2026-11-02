// 32 result round 10: pause chip stats, sticker unlock popup, star shine, merged fragment rows, lucky-win sweep at three phone sizes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(ROOT, 'cell_serpent');
const main = fs.readFileSync(path.join(dir, 'main.js'), 'utf8'), html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const B = await import(path.join(dir, 'result_b10.js'));
const S = await import(path.join(dir, 'sim.js'));
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('chip stats text', () => {
  const t = B.chipStatsText('swab', 3, 1);
  assert.equal(t.name, 'Kitty Paws');
  assert.match(t.line, /LV 3 of 5/); assert.match(t.line, /damage 0\.25/); assert.match(t.line, /every 3\.9s/);
  assert.match(B.chipStatsText('tower', 0, 1).line, /Not picked yet/);
  assert.equal(B.chipStatsText('nope', 1, 1), null);
  assert.equal(B.chipStatsHTML(null), '');
  for (const w of S.WEAPONS) { const s = B.chipStatsText(w.id, 1, 1); assert.ok(s && s.note, w.id + ' has stats'); }
});
ok('stickers unlocked by a run', () => {
  const sv = S.sanitizeSave({}); const b = B.stickerIds(sv);
  sv.runs = 1; sv.cleared = 3;
  const fresh = B.newStickers(b, B.stickerIds(sv));
  assert.deepEqual(fresh.map(t => t.id).sort(), ['gig', 'three']);
  assert.deepEqual(B.newStickers(B.stickerIds(sv), B.stickerIds(sv)), []);
  assert.equal(B.stickerPopHTML([]), '');
  assert.match(B.stickerPopHTML(fresh), /NEW STICKER.*\+1 more/s);
});
ok('shine only when stars were gained and motion is allowed', () => {
  const cls = new Set(), el = { classList: { add: c => cls.add(c), remove: c => cls.delete(c) }, offsetWidth: 1 };
  assert.equal(B.shineStars(el, 0, false), false); assert.ok(!cls.has('shine10'));
  assert.equal(B.shineStars(el, 2, true), false); assert.ok(!cls.has('shine10'));
  assert.equal(B.shineStars(el, 2, false), true); assert.ok(cls.has('shine10'));
  assert.equal(B.shineStars(null, 2, false), false);
});
ok('stats tab point falls back to the 2nd nav slot', () => {
  const p = B.statsTabPoint(400, 800, { querySelector: () => null });
  assert.deepEqual(p, { x: 100, y: 766 });
});
ok('wiring and css', () => {
  assert.ok(/bindBuildChips\(\$\('pBuild'\)/.test(main) && /showStickerPop\(newStickers\(stk0, stickerIds\(save\)\)/.test(main) && /shineStars\(\$\('rStars'\)/.test(main));
  assert.ok((main.match(/clearStickerPop\(\)/g) || []).length >= 3, 'popup cleared on RETRY, MENU and NEXT');
  assert.ok(/rfr10/.test(main) && /rfr10\{/.test(html), 'fragments share one row');
  assert.ok(html.includes('@css:11-result-pause round 10') && /\.sp10\{/.test(html) && /#rStars\.shine10::after/.test(html));
  const nd = String.fromCharCode(8212);
  for (const f of ['result_b10.js']) assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes(nd), 'no em dash ' + f);
  assert.ok(!html.slice(html.indexOf('@css:11-result-pause round 10')).split('end @css:11-result-pause round 10')[0].includes(nd));
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
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('32_result_b10: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 0, eggs: 3, xp: 1500, energy: { n: 40, t: 0 } };
    try {
      for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && errs.push(m.text()));
        await p.addInitScript(s => localStorage.setItem('cell_serpent_save_v1', s), JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(1200);
        await p.evaluate(() => { window.CS.g.weap.swab = { lv: 3, cd: 0 }; });
        // pause: tap a chip, the stats line shows and GIVE UP is still on screen
        await p.keyboard.press('p'); await p.waitForTimeout(400);
        await p.locator('#pBuild .pb9[data-w]').first().click({ force: true }); await p.waitForTimeout(250);
        const pm = await p.evaluate(() => ({ cap: document.querySelector('#pBuild .pb9n').textContent, shown: getComputedStyle(document.querySelector('#pBuild .pb9n')).display, sel: document.querySelectorAll('#pBuild .pb9.sel').length, quit: document.getElementById('quitBtn').getBoundingClientRect().bottom, vh: innerHeight }));
        assert.match(pm.cap, /Kitty Paws LV 3 of 5, damage/); assert.notEqual(pm.shown, 'none'); assert.equal(pm.sel, 1);
        assert.ok(pm.quit <= pm.vh, `${w}x${h}: GIVE UP stays on screen with the stats line: ${pm.quit}`);
        await p.locator('#pBuild .pb9[data-w]').first().click({ force: true }); await p.waitForTimeout(150);
        assert.equal(await p.evaluate(() => document.querySelectorAll('#pBuild .pb9.sel').length), 0, 'second tap closes it');
        await p.keyboard.press('p'); await p.waitForTimeout(300);
        // lucky win: first clear, three stars, level up, five weapon fragments, ribbons, egg, sparkles, voice back
        assert.equal(await p.evaluate(() => window.CS.force('won')), true);
        await p.evaluate(() => { const g = window.CS.g; g.result = { ...g.result, stage: 15, stars: 3, kills: 400, coins: 900, cp50: true, frags: { swab: 3, tower: 2, dragon: 2, maw: 1, stick: 1 } }; });
        await p.waitForSelector('#result.on', { timeout: 15000 }); await p.waitForTimeout(1800);
        const m = await p.evaluate(() => { const q = s => document.querySelector(s).getBoundingClientRect(); return { retry: q('#rRetry').bottom, hub: q('#rHub').bottom, rt: q('#rRetry').top, vh: innerHeight, rows: document.querySelectorAll('#rList .r').length, fr: document.querySelectorAll('#rList .rfr10 .f10').length, pop: !!document.querySelector('.sp10') }; });
        assert.equal(m.fr, 5, 'five fragments in one row'); assert.ok(m.rows <= 8, 'rows: ' + m.rows);
        assert.ok(m.retry <= m.vh + 1 && m.hub <= m.vh + 1 && m.rt >= 0, `${w}x${h}: RETRY and MENU on screen in the lucky win: ${m.retry}/${m.vh}`);
        assert.ok(m.pop, 'the First Gig sticker pops up');
        await p.waitForFunction(() => !document.querySelector('.sp10'), null, { timeout: 8000 }).catch(() => {});
        assert.equal(await p.evaluate(() => !!document.querySelector('.sp10')), false, 'the sticker flew away');
        assert.deepEqual(errs, []);
        await p.close();
      }
      n += 3;
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
}
console.log(`32_result_b10: ${n} checks passed`);
