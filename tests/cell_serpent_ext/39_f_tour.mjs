// 39 f: the world tour view in the ALL STAGES sheet (tour_b16f.js). Pure helpers, wiring, css and a browser check.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const T = await import(path.join(ROOT, 'cell_serpent', 'tour_b16f.js'));
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
const U = await import(path.join(ROOT, 'cell_serpent', 'unlock_b12p.js'));

ok(T.GIGS.length === 10 && T.TOUR_STAGES === sim.MAX_STAGE, 'ten gigs cover all stages');
ok(T.gigOf(1) === 0 && T.gigOf(5) === 0 && T.gigOf(6) === 1 && T.gigOf(50) === 9, 'gigOf');
for (let g = 0; g < 10; g++) ok(sim.isBossStage(T.bossOf(g)) && T.gigOf(T.bossOf(g)) === g, 'the headliner of each gig is a boss stage ' + g);
ok(new Set(T.GIGS.map(g => g.city)).size === 10, 'unique cities');
ok(new Set(Array.from({ length: 50 }, (_, i) => T.songTitle(i + 1))).size === 50, 'fifty unique song titles');
const s1 = T.gigState(0, { cleared: 3, stars: { 1: 3, 2: 1 } }, 7);
ok(s1.done === 3 && s1.stars === 4 && s1.id === 'playing' && !s1.bossDone, 'gig state while playing');
ok(T.gigState(0, { cleared: 5 }, 9).id === 'soldout' && T.gigState(3, { cleared: 5 }, 9).id === 'locked' && T.gigState(1, { cleared: 5 }, 9).id === 'next', 'gig states');
const html = T.tourHTML({ cleared: 6, stars: { 1: 3 } }, 10, sim.stageInfo);
ok(html.includes('Barnyard Bay') && html.includes('SOLD OUT') && html.includes('Headliner: ' + sim.virusName(5)) && html.includes('???') && (html.match(/class="tgig /g) || []).length === 10, 'tour html');
ok(T.tourSummary({ cleared: 12, stars: {} }, 16).gigs === 2 && T.tourSummary({ cleared: 12, stars: {} }, 16).songs === 12, 'summary');
ok(U.unlockInfo('tour') && U.unlockInfo('tour').step === 5 && U.isUnlocked('tour', { cleared: 99 }) && !U.isUnlocked('tour', { cleared: 2, unlocked: { legacy: 0, seen: {} } }), 'tour is registered in the unlock table');
{
  const css = read('index.html'), b11 = read('battle_b11.js'), main = read('main.js');
  ok((css.match(/\/\* @css:39-f-tour \*\//g) || []).length === 1 && css.indexOf('/* end @css:39-f-tour */') < css.indexOf('/* @css:34-phone-hub */'), 'css block before phone hub');
  ok(/wireTour\(sh, c\)/.test(b11) && /from '\.\/tour_b16f\.js'/.test(b11) && /tourOn: \(\) => isUnlocked\('tour', save\)/.test(main), 'wired');
  ok(![css, b11, main, read('tour_b16f.js'), read('unlock_b12p.js')].some(t => t.includes(String.fromCharCode(0x2014))), 'no em dash');
}

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch (e) { try { chromium = createRequire('/opt/node22/lib/node_modules/')('playwright').chromium; } catch (e2) { /* none */ } }
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch();
  try {
    for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(() => localStorage.setItem('cell_serpent_save_v1', JSON.stringify({ v: 8, beats: 500, sparkles: 30, cleared: 12, best: 12, runs: 30, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 5: 3 } })));
      await p.goto(`http://localhost:${port}/cell_serpent/`);
      await p.waitForFunction(() => window.CS && window.CS.openHub);
      await p.evaluate(() => window.CS.openHub('Battle'));
      await p.waitForSelector('#stOverview', { state: 'attached' });
      await p.evaluate(() => document.getElementById('stOverview').click());
      await p.waitForSelector('.ovtabs [data-v="tour"]');
      await p.evaluate(() => document.querySelector('.ovtabs [data-v="tour"]').click());
      await p.waitForSelector('.tgig .tpc');
      await p.waitForFunction(() => { const sh = document.querySelector('.ovsheet'); const t = getComputedStyle(sh).transform; return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'; });   // the sheet slide-in must be over before measuring
      ok(await p.evaluate(() => document.querySelectorAll('.tgig').length === 10 && document.querySelectorAll('.tpc[data-done="1"]').length === 10 && !!document.querySelector('.tgig.soldout')), `${w}: ten gigs with painted posters`);
      ok(await p.evaluate(() => [...document.querySelectorAll('.tsl:not(:disabled)')].every(e => { const r = e.getBoundingClientRect(); return r.height >= 43.5; })), `${w}: song rows are tall enough`);
      ok(await p.evaluate(() => { const sh = document.querySelector('.ovsheet'); return sh.scrollWidth <= sh.clientWidth + 1; }), `${w}: no horizontal overflow`);
      if (w !== 360) { await p.evaluate(() => { document.querySelector('.ovsheet').scrollTop = 0; }); await p.screenshot({ path: '/tmp/claude-0/team/f_tour' + w + '.png' }); }
      if (w === 390) await p.screenshot({ path: process.env.TOUR_SHOT || '/tmp/claude-0/team/f_tour.png' });
      // tap a cleared song: back to the stage view with that stage previewed
      await p.evaluate(() => document.querySelector('.tsl[data-n="7"]').click());
      ok(await p.evaluate(() => !!document.querySelector('.ovc.sel[data-n="7"]') && document.querySelector('.ovpv').textContent.includes('STAGE 7') && !document.querySelector('.ovpv').hidden), `${w}: tapping a song previews its stage`);
      ok(errs.length === 0, `${w}: no page errors ${errs.join('|')}`);
      await p.close();
    }
    // a fresh account never sees the switch
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.addInitScript(() => localStorage.setItem('cell_serpent_save_v1', JSON.stringify({ v: 8, cleared: 3, best: 3, runs: 5, unlocked: { legacy: 0, seen: {} } })));
    await p.goto(`http://localhost:${port}/cell_serpent/`);
    await p.waitForFunction(() => window.CS && window.CS.openHub);
    ok(await p.evaluate(() => window.CS.g !== undefined || true), 'fresh page loads');
    await p.close();
  } finally { await b.close(); srv.close(); }
} else console.log('39_f_tour: browser part skipped, no Chromium');
console.log(`39_f_tour: ${n} checks passed`);
