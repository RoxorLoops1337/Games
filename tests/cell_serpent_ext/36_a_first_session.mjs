// 36 a: first session of a fresh account. Nothing about locked features leaks into the hub or the result screen:
// no empty MORE / PARADE folds, no revive card without Sparkles, no season/spin/next-reward lines after a first loss.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
const html = read('index.html'), dash = String.fromCharCode(8212);
// static wiring
assert.ok(/@css:36-a-firstsession/.test(html) && html.indexOf('@css:36-a-firstsession') < html.indexOf('/* @css:34-phone-hub */'), 'css block before the phone block');
for (const f of ['keep10.js', 'keep_ui.js', 'addict_ui.js', 'unlock_ui_b12p.js']) assert.ok(/isUnlocked/.test(read(f)), f + ' knows about unlocks');
assert.ok(!html.slice(html.indexOf('@css:36-a-firstsession'), html.indexOf('end @css:36-a-firstsession')).includes(dash));
assert.ok(/!isUnlocked\('sparkles', save\) && save\.sparkles < reviveCost/.test(read('main.js')), 'revive card skipped when it cannot be used yet');
const K = await import(path.join(ROOT, 'cell_serpent', 'keep10.js'));
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
{ const fresh = sim.defaultSave(); assert.equal(K.nextGoalTeaser(fresh, 20000), null, 'no in-run goal teaser for a fresh account');
  const old = sim.sanitizeSave({ v: 3, cleared: 2, runs: 6 }); assert.ok(K.nextGoalTeaser(old, 20000), 'old saves keep it'); }

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('36_a_first_session: browser part skipped'); }
  if (browser) {
    const errs = [];
    for (const [w, h] of [[390, 844], [360, 640]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }), p = await ctx.newPage();
      p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(() => { try { localStorage.setItem('cell_serpent_tut12', '1'); localStorage.setItem('cell_serpent_tut_done', '1'); localStorage.setItem('cell_serpent_pethint12', '1'); } catch (e) { /* ignore */ } });
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
      await p.evaluate(() => window.CS.openHub('Battle'));
      await p.waitForFunction(() => window.CS.mode() === 'hub', null, { timeout: 8000 });
      await p.waitForFunction(() => !document.querySelector('#hub.hub-skel') && document.querySelector('.tabs button[data-tab="Battle"]'), null, { timeout: 8000 });
      const hub = await p.evaluate(() => ({ folds: [...document.querySelectorAll('#tabBattle .fold')].filter(f => f.offsetParent).length, tabs: [...document.querySelectorAll('.tabs button[data-tab]')].filter(b => !b.hidden).length }));
      assert.equal(hub.folds, 0, `${w}x${h}: no empty folds on a fresh hub`); assert.equal(hub.tabs, 1);
      await p.evaluate(() => window.CS.startRun(1));
      await p.waitForFunction(() => window.CS.mode() === 'play' && window.CS.g, null, { timeout: 8000 });
      await p.waitForFunction(() => window.CS.force('dead') || false, null, { timeout: 8000 });
      await p.waitForFunction(() => document.getElementById('result').classList.contains('on') || document.getElementById('revive').classList.contains('on'), null, { timeout: 12000 });
      const res = await p.evaluate(() => ({ revive: document.getElementById('revive').classList.contains('on'), keep: (document.getElementById('rKeep') || { children: [] }).children.length, nudge: (document.getElementById('rNudge') || { textContent: '' }).textContent, sub: document.getElementById('rSub').textContent }));
      assert.equal(res.revive, false, 'no revive card for 0 Sparkles'); assert.equal(res.keep, 0, 'no season/book chips'); assert.ok(!/Lucky Spin|Goals|Quest|Season/i.test(res.nudge), res.nudge); assert.ok(!/Spend your Beats/.test(res.sub));
      await ctx.close();
    }
    assert.deepEqual(errs, []);
    await browser.close();
  }
  srv.close();
}
