// 35 t: the in-run upgrade cards sit in the upper part of the screen (the lower part is where the thumb steers).
// Static: one css block placed before the phone hub block, the guard constants and pure helpers.
// Browser (six phone sizes): every card and control lies under the HUD and above 62 percent of the screen height, targets are 44 px or more with
// 8 px gaps, nothing tappable is in the lower 38 percent, four offers fit too; the pointer guard ignores taps in the first 450 ms and needs press and
// release on the same card, while keys (and click events without a pointer, i.e. screen readers) pick at once; the revive buttons are not in the lower 35 percent.
// Runs its asserts when imported. Browser part skipped without Chromium.
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

{
  const html = read('index.html'), main = read('main.js');
  ok((html.match(/\/\* @css:35-t-cards \*\//g) || []).length === 1 && html.includes('/* end @css:35-t-cards */'), 'one 35-t-cards css block');
  ok(html.indexOf('/* end @css:35-t-cards */') < html.indexOf('/* @css:34-phone-hub */'), 'the block sits before the phone hub block');
  ok(html.indexOf('/* end @css:34-phone-hub */') < html.lastIndexOf('</style>') && !html.slice(html.indexOf('/* end @css:34-phone-hub */') + 30, html.lastIndexOf('</style>')).includes('@css:'), 'the phone hub block stays last');
  ok(/#levelup\{[^}]*pointer-events:none/.test(html), 'the level-up section lets taps through to the game');
  ok(!(html + main + read('cards_ui.js')).includes('—'), 'no em dash');
  ok(/guardAllows\(lvGuard, i, e\.detail > 0, performance\.now\(\)\)/.test(main) && /armCards\(wrap, lvGuard/.test(main) && /trackPress\(\$\('cards'\), lvGuard\)/.test(main), 'main.js wires the pick guard');
  const ui = await import(path.join(ROOT, 'cell_serpent', 'cards_ui.js'));
  assert.equal(ui.PICK_GUARD_MS, 450); n++;
  const st = { at: 1000, down: 1, moved: false };
  ok(!ui.guardAllows(st, 1, true, 1100), 'a pointer tap at 100 ms does nothing');
  ok(!ui.guardAllows(st, 1, true, 1449), 'a pointer tap just before 450 ms does nothing');
  ok(ui.guardAllows(st, 1, true, 1600), 'a pointer tap at 600 ms picks');
  ok(!ui.guardAllows(st, 0, true, 1600), 'press on one card and release on another does not pick');
  ok(!ui.guardAllows({ at: 1000, down: 1, moved: true }, 1, true, 1600), 'a slide off the card does not pick');
  ok(ui.guardAllows(st, 2, false, 1010), 'keyboard and screen reader activations are never delayed');
  ok(ui.hudBottomPx({ cw: 468, s: 0.65, oy: 90.5 }, 390) > 150 && ui.hudBottomPx(null, 390) === 170, 'hud bottom helper');
}

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('35_t_cards_layout_b12t: browser part skipped, no Chromium'); }
  if (browser) {
    const fails = [];
    const SAVE = JSON.stringify({ v: 8, beats: 900000, sparkles: 900, cleared: 40, best: 40, runs: 300, eggs: 30, ribbons: 80, xp: 90000, energy: { n: 40, t: 0 } });
    const SIZES = [[390, 844], [360, 740], [360, 640], [320, 568], [412, 915], [430, 932]];
    const open = async (p, rerolls = 3) => {
      await p.evaluate(r => { window.CS.g.rerolls = r; window.CS.g.pending = 1; }, rerolls);
      await p.waitForFunction(() => document.getElementById('levelup').classList.contains('on') && document.querySelectorAll('#cards > .card').length >= 3, null, { timeout: 8000 });
    };
    const phase = p => p.evaluate(() => window.CS.g.phase);
    const rectOf = (p, sel, i = 0) => p.evaluate(([s, k]) => { const r = document.querySelectorAll(s)[k].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [sel, i]);
    try {
      for (const [w, h] of SIZES) {
        const tag = `${w}x${h}`;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', e => errs.push('page: ' + e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, SAVE);
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
        await p.waitForTimeout(500);
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(800);
        const measure = async label => {
          const r = await p.evaluate(() => {
            const L = window.CS.R.layout(), k = L.cw / innerWidth, hudBottom = (L.oy + 150 * L.s) / k;
            const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
            const cards = [...document.querySelectorAll('#cards > .card')].map(box), locks = [...document.querySelectorAll('#cards .lockb')].map(box);
            const ctl = ['refreshBtn', 'skipBtn'].map(id => box(document.getElementById(id)));
            const all = [box(document.querySelector('#levelup .banner')), box(document.getElementById('luckBox')), ...cards, ...ctl, box(document.getElementById('buildStrip'))].filter(a => a.h > 0);
            // lower part: nothing tappable
            const lowY0 = Math.round(innerHeight * 0.62) + 2, bad = [];
            for (let y = lowY0; y < innerHeight; y += 24) for (let x = 6; x < innerWidth; x += 30) {
              const el = document.elementFromPoint(x, y); if (!el) continue;
              if (el.closest('.scr.on, button, [role=button], a, input')) bad.push(`${Math.round(x)},${y}:${el.id || el.className || el.tagName}`);
            }
            return { hudBottom, cards, locks, ctl, bottom: Math.max(...all.map(a => a.b)), top: Math.min(...all.map(a => a.t)), bad: bad.slice(0, 5), sw: document.documentElement.scrollWidth, n: cards.length, sizes: [...cards, ...locks, ...ctl].map(a => [a.w, a.h]) };
          });
          n++;
          if (r.bottom > h * 0.62 + 0.5) fails.push(`${tag} ${label}: cards UI bottom ${Math.round(r.bottom)} is under 62 percent (${Math.round(h * 0.62)})`);
          if (r.top < r.hudBottom - 0.5) fails.push(`${tag} ${label}: cards UI top ${Math.round(r.top)} overlaps the HUD (${Math.round(r.hudBottom)})`);
          for (const [sw, sh] of r.sizes) if (sw < 43.5 || sh < 43.5) fails.push(`${tag} ${label}: target ${Math.round(sw)}x${Math.round(sh)} under 44`);
          const gap = (a, b) => Math.max(a.l - b.r, b.l - a.r, a.t - b.b, b.t - a.b);
          const items = [...r.cards, ...r.ctl];
          for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const g = gap(items[i], items[j]); if (g < 7.5) fails.push(`${tag} ${label}: items ${i} and ${j} gap ${Math.round(g * 10) / 10}`); }
          if (r.bad.length) fails.push(`${tag} ${label}: tappable stuff in the lower 38 percent: ${r.bad.join(' ')}`);
          if (r.sw > w) fails.push(`${tag} ${label}: sideways scroll ${r.sw}`);
          return r;
        };
        // ---- layout, three and four offers, with motion
        await open(p); await p.waitForTimeout(1600);
        const r3 = await measure('3 cards'); if (r3.n !== 3) fails.push(`${tag}: expected 3 cards, got ${r3.n}`);
        if (!(r3.locks.length === 3)) fails.push(`${tag}: lock buttons missing (${r3.locks.length})`);
        await p.evaluate(() => { const g = window.CS.g; g.choices = [...g.choices, g.choices[1]]; });
        await p.waitForFunction(() => document.querySelectorAll('#cards > .card').length === 4, null, { timeout: 4000 });
        await p.waitForTimeout(1600);
        const r4 = await measure('4 cards'); n++;
        if (r4.n !== 4) fails.push(`${tag}: expected 4 cards, got ${r4.n}`);
        // the pick still moves the run on (programmatic click carries no pointer)
        await p.evaluate(() => document.querySelector('#cards > .card').click()); await p.waitForTimeout(1000);
        n++; if ((await phase(p)) === 'levelup') fails.push(`${tag}: picking a card does not move the run on`);
        // ---- guard, with reduced motion so the cards do not fly while we tap
        await p.emulateMedia({ reducedMotion: 'reduce' });
        const fresh = async () => { await p.evaluate(() => { window.CS.g.rerolls = 3; }); await open(p); await p.waitForTimeout(700); };
        const reroll = async () => { await p.evaluate(() => { window.__t0 = performance.now(); document.getElementById('refreshBtn').click(); }); };
        await fresh();
        // re-deal, then tap card 2 in the same task (a few ms after the deal: deterministic even on a loaded machine)
        const dt = await p.evaluate(() => {
          const t0 = performance.now(); document.getElementById('refreshBtn').click();
          const c = document.querySelectorAll('#cards > .card')[1], r = c.getBoundingClientRect(), pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, pointerType: 'touch', pointerId: 5 };
          c.dispatchEvent(new PointerEvent('pointerdown', pt)); c.dispatchEvent(new PointerEvent('pointerup', pt)); c.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          return performance.now() - t0;
        });
        n++; if (dt > 100) fails.push(`${tag}: the early tap came ${Math.round(dt)} ms after the deal`);
        n++; if ((await phase(p)) !== 'levelup') fails.push(`${tag}: a tap ${Math.round(dt)} ms after the cards appear picked a card`);
        await p.waitForTimeout(650);
        await p.touchscreen.tap(...Object.values(await rectOf(p, '#cards > .card', 1))); await p.waitForTimeout(300);
        n++; if ((await phase(p)) === 'levelup') fails.push(`${tag}: a tap 600 ms after the cards appear does not pick`);
        // press on one card, release on another: the click lands on the first card (as touch does) and must not pick
        await fresh();
        await p.evaluate(() => {
          const cs = [...document.querySelectorAll('#cards > .card')], pt = el => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, pointerType: 'touch', pointerId: 7 }; };
          cs[0].dispatchEvent(new PointerEvent('pointerdown', pt(cs[0]))); cs[0].dispatchEvent(new PointerEvent('pointerup', pt(cs[1]))); cs[0].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        });
        await p.waitForTimeout(300);
        n++; if ((await phase(p)) !== 'levelup') fails.push(`${tag}: press on card 1 and release on card 2 picked a card`);
        // control: the same on one card picks
        await p.evaluate(() => {
          const c = document.querySelectorAll('#cards > .card')[0], r = c.getBoundingClientRect(), pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, pointerType: 'touch', pointerId: 8 };
          c.dispatchEvent(new PointerEvent('pointerdown', pt)); c.dispatchEvent(new PointerEvent('pointerup', pt)); c.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        });
        await p.waitForTimeout(300);
        n++; if ((await phase(p)) === 'levelup') fails.push(`${tag}: press and release on the same card did not pick`);
        // keyboard: immediately after the deal
        await fresh(); await reroll(); await p.keyboard.press('2'); await p.waitForTimeout(300);
        n++; if ((await phase(p)) === 'levelup') fails.push(`${tag}: the 2 key does not pick at once`);
        // a screen reader activation (click without a pointer) at once
        await fresh(); await reroll(); await p.evaluate(() => document.querySelectorAll('#cards > .card')[2].click()); await p.waitForTimeout(300);
        n++; if ((await phase(p)) === 'levelup') fails.push(`${tag}: a click without a pointer does not pick at once`);
        await p.emulateMedia({ reducedMotion: 'no-preference' });
        // ---- revive: the buttons are not in the lower 35 percent
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(800);
        await p.evaluate(() => window.CS.force('dead'));
        await p.waitForFunction(() => document.getElementById('revive').classList.contains('on'), null, { timeout: 9000 });
        await p.waitForTimeout(900);
        const rv = await p.evaluate(() => ['rvGo', 'rvNo'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, b: r.bottom, w: r.width, h: r.height }; }));
        for (const q of rv) { n++; if (q.b > h * 0.65 + 0.5) fails.push(`${tag}: ${q.id} bottom ${Math.round(q.b)} is in the lower 35 percent`); if (q.h < 43.5 || q.w < 43.5) fails.push(`${tag}: ${q.id} is ${Math.round(q.w)}x${Math.round(q.h)}`); }
        if (errs.length) fails.push(`${tag}: ${errs.join(' | ')}`);
        await ctx.close();
      }
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(fails, [], 'cards layout:\n' + fails.join('\n'));
  } else srv.close();
}
console.log(`35_t_cards_layout_b12t: ${n} checks passed`);
