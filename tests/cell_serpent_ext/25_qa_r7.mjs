// 25 QA round 7: the standing hit-test sweep. On every hub tab, every Battle side panel, the revive prompt and the result
// screen (after CS.force('dead') and CS.force('won')), each visible button is scrolled into view and document.elementFromPoint
// at its centre must return that button or a child of it. Run at 390x844, 360x640 and 320x568 on a rich, a fresh and an old save.
// Also: no console errors, no page errors, and no stuck state (the dead path reaches the result, RETRY and MENU stay hit-testable).
// Runs its asserts when imported. The browser part is skipped when no Chromium or playwright is available.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let n = 0;
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// Runs inside the page. Checks the topmost open screen only (the hub stays "on" under a panel).
const SWEEP = () => {
  const out = [];
  const on = [...document.querySelectorAll('.scr.on')]; const top = on[on.length - 1]; if (!top) return out;
  const live = e => { for (let a = e; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } const r = e.getBoundingClientRect(); return r.width >= 4 && r.height >= 4; };
  const inClip = (e, x, y) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { const q = a.getBoundingClientRect(); if (x < q.left || x > q.right || y < q.top || y > q.bottom) return false; } } return true; };
  for (const e of top.querySelectorAll('button,[role=button],a[href]')) {
    if (!live(e)) continue;
    e.scrollIntoView({ block: 'center', inline: 'center' });
    const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    if (!inClip(e, x, y)) continue;
    if (e.dataset.pet) {   // title pets peek out from behind the duo: some part of each must be tappable
      let any = false; for (let i = 1; i < 6 && !any; i++) for (let j = 1; j < 6 && !any; j++) { const q = document.elementFromPoint(r.left + r.width * i / 6, r.top + r.height * j / 6); any = !!(q && (q === e || e.contains(q))); }
      if (!any) out.push('pet ' + e.dataset.pet + ' is fully covered');
      continue;
    }
    const t = document.elementFromPoint(x, y);
    if (!t || !(t === e || e.contains(t))) out.push((e.id || e.className || e.tagName) + ' [' + (e.textContent || '').trim().slice(0, 18) + '] is covered by ' + (t ? (t.id || t.className || t.tagName) : 'nothing'));
  }
  return out;
};

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('25_qa_r7: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVES = {
      rich: { v: 8, beats: 900000, sparkles: 900, cleared: 40, best: 40, runs: 300, eggs: 30, ribbons: 80, xp: 90000, energy: { n: 40, t: 0 } },
      fresh: null,
      old: { v: 3, beats: 120, cleared: 2, best: 2, runs: 6 },
    };
    const fails = [];
    try {
      // the nine viewport x save combinations run in parallel, each in its own context
      await Promise.all([[390, 844], [360, 640], [320, 568]].map(async ([w, h]) => { for (const sv of Object.keys(SAVES)) {
        const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage(); const errs = [];
        p.on('pageerror', e => errs.push('page: ' + e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && errs.push('console: ' + m.text()));
        await p.addInitScript(s => { if (s && !localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, SAVES[sv] ? JSON.stringify(SAVES[sv]) : null);
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
        await p.waitForTimeout(500);
        const sweep = async name => { const o = await p.evaluate(SWEEP); n++; for (const s of o) fails.push(`${w}x${h} ${sv} ${name}: ${s}`); };
        await sweep('title');
        for (const tab of ['Battle', 'Skills', 'Pets', 'Gear', 'Shop', 'Stats']) {
          await p.evaluate(t => window.CS.openHub(t), tab); await p.waitForTimeout(450); await sweep(tab);
        }
        const sides = await p.evaluate(() => document.querySelectorAll('#battleSide .sidebtn').length);
        assert.ok(sides >= 3, `${w}x${h} ${sv}: the Battle side buttons exist`);
        for (let i = 0; i < sides; i++) {
          await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(250);
          await p.evaluate(i => { const l = document.querySelectorAll('#battleSide .sidebtn'); if (l[i]) l[i].click(); }, i); await p.waitForTimeout(450);
          await sweep('side' + i);
        }
        // in-run overlays (batch 9): pause, settings and stats opened from pause, and the level-up cards
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(700);
        await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))); await p.waitForTimeout(350);
        assert.equal(await p.evaluate(() => window.CS.mode()), 'pause', `${w}x${h} ${sv}: P pauses the run`);
        await sweep('pause');
        await p.evaluate(() => document.getElementById('pSet').click()); await p.waitForTimeout(350); await sweep('pause-settings');
        await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await p.waitForTimeout(350);
        await p.evaluate(() => document.getElementById('pStats').click()); await p.waitForTimeout(350); await sweep('pause-stats');
        await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await p.waitForTimeout(350);
        await sweep('pause-back');
        await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))); await p.waitForTimeout(350);
        assert.equal(await p.evaluate(() => window.CS.mode()), 'play', `${w}x${h} ${sv}: P resumes the run`);
        await p.evaluate(() => { window.CS.g.pending = 1; });
        await p.waitForFunction(() => document.getElementById('levelup').classList.contains('on'), null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(600);
        assert.equal(await p.evaluate(() => document.getElementById('levelup').classList.contains('on')), true, `${w}x${h} ${sv}: level-up cards open`);
        const inFrame = () => [...document.querySelectorAll('#cards > *')].every(c => { const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
        await p.waitForFunction(inFrame, null, { timeout: 5000 }).catch(() => {});   // the cards slide in: let them settle
        await sweep('levelup');
        const cardsOk = await p.evaluate(inFrame);
        assert.equal(cardsOk, true, `${w}x${h} ${sv}: level-up cards fit on screen`);
        await p.evaluate(() => document.querySelector('#cards > *').click());
        await p.waitForFunction(() => !document.getElementById('levelup').classList.contains('on'), null, { timeout: 6000 }).catch(() => {});
        assert.equal(await p.evaluate(() => document.getElementById('levelup').classList.contains('on')), false, `${w}x${h} ${sv}: picking a card closes the cards`);
        for (const kind of ['dead', 'won']) {
          await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(250);
          await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(900);
          assert.equal(await p.evaluate(k => window.CS.force(k), kind), true, `${w}x${h} ${sv}: force(${kind}) accepted`);
          // the dead path may ask for a revive first: sweep it, then give up
          let seen = false;
          for (let i = 0; i < 20 && !seen; i++) {
            await p.waitForTimeout(250);
            if (await p.evaluate(() => document.getElementById('revive').classList.contains('on'))) { await sweep('revive'); await p.evaluate(() => document.getElementById('rvNo').click()); }
            seen = await p.evaluate(() => document.getElementById('result').classList.contains('on'));
          }
          assert.equal(seen, true, `${w}x${h} ${sv}: ${kind} reaches the result (no stuck state)`);
          await p.waitForTimeout(1800); await sweep('result-' + kind);
          if (kind === 'won' && h >= 700) {   // a lucky win drops 5 to 7 reward chips (fragments): RETRY and MENU must still fit (was 848 > 844)
            await p.evaluate(() => { const l = document.getElementById('rList'); while (l.querySelectorAll('.r').length < 7) { const c = l.querySelector('.r').cloneNode(true); c.append(' Hedgehog Quills fragment'); l.appendChild(c); } });
            await p.waitForTimeout(300);
            const fs13 = await p.evaluate(() => getComputedStyle(document.querySelector('#rList .r')).fontSize);
            assert.equal(fs13, '13px', `${w}x${h} ${sv}: reward chips are compact on mid-height phones`);
            const bottom = await p.evaluate(() => document.getElementById('rHub').getBoundingClientRect().bottom);
            assert.ok(bottom <= h, `${w}x${h} ${sv}: with 7 reward chips MENU still fits: ${bottom}`);
          }
          const hit = await p.evaluate(() => ['rRetry', 'rHub'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(r.bottom <= innerHeight && r.top >= 0 && t && e.contains(t)); }));
          assert.deepEqual(hit, [true, true], `${w}x${h} ${sv}: RETRY and MENU are on screen and tappable after ${kind}`);
          await p.evaluate(() => document.getElementById('rHub').click()); await p.waitForFunction(() => window.CS.mode() === 'hub', null, { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(150);   // the close curtain swaps to the hub after its 230 ms close
          assert.equal(await p.evaluate(() => window.CS.mode()), 'hub', `${w}x${h} ${sv}: MENU after ${kind} returns to the hub`);
        }
        assert.deepEqual(errs, [], `${w}x${h} ${sv}: no console or page errors`);
        await p.context().close();
      } }));
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(fails, [], 'every visible button is hit-testable:\n' + fails.join('\n'));
  } else srv.close();
}
console.log(`25_qa_r7: ${n} sweeps passed`);
