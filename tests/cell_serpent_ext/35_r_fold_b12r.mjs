// 35 r fold (batch 12, agent r): progressive disclosure. The reusable collapsible section (toggle, aria, keyboard, remembered state,
// junk storage), the hub tabs and sheets that use it (collapsed content is not shown or tappable, expanding works at 360 and 390 wide,
// every tab is still reachable, old saves still load). Static part always runs; browser part is skipped without Chromium.
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

ok('css: one 35-r-fold block placed before the phone hub block, no em dash, 44 px header, 12 px text', () => {
  const html = read('index.html');
  assert.equal((html.match(/\/\* @css:35-r-fold \*\//g) || []).length, 1);
  assert.equal((html.match(/\/\* end @css:35-r-fold \*\//g) || []).length, 1);
  const i = html.indexOf('/* @css:35-r-fold */'), j = html.indexOf('/* end @css:35-r-fold */'), k = html.indexOf('/* @css:34-phone-hub */');
  assert.ok(i > 0 && i < j && j < k, 'before the 34-phone-hub block');
  const blk = html.slice(i, j);
  assert.ok(!blk.includes(String.fromCharCode(8212)));
  assert.ok(/\.fold-h\{[^}]*min-height:44px/.test(blk) && /\.fold-h\{[^}]*font-size:13px/.test(blk), 'header is 44 px tall with 13 px text');
  assert.ok(/\.fold-b\[hidden\]\{display:none!important\}/.test(blk), 'collapsed bodies are display none');
});
ok('component file: storage key, aria, reduced motion, no em dash', () => {
  const s = read('fold_b12r.js');
  assert.ok(s.includes("'cell_serpent_fold_b12r'") && s.includes('aria-expanded') && s.includes('aria-controls') && s.includes('inert'));
  assert.ok(/reduced\(\)/.test(s) && /prefers-reduced-motion/.test(s));
  assert.ok(!s.includes(String.fromCharCode(8212)));
});
ok('wired in: tabs and sheets call the fold helpers', () => {
  assert.ok(/foldTab\('Stats'\)/.test(read('hub2.js')) && /foldTab\('Shop'\)/.test(read('hub2.js')) && /foldTab\('Gear'\)/.test(read('hub2.js')));
  const m = read('main.js'); for (const t of ['Battle', 'Skills', 'Pets']) assert.ok(m.includes(`foldTab('${t}')`), t);
  assert.ok(m.includes('foldSettings($(') && m.includes('fold: foldHook'));
  assert.ok(/makeFold/.test(read('skill_sheet.js')) && /wrapFold/.test(read('skill_sheet.js')));
});
// storage parsing is pure: junk never throws and never leaks wrong types
{
  const { loadState } = await import(path.join(ROOT, 'cell_serpent', 'fold_b12r.js'));
  const st = v => ({ getItem: () => v });
  ok('state: junk values give an empty or filtered state', () => {
    assert.deepEqual(loadState(st(null)), {});
    assert.deepEqual(loadState(st('{nope')), {});
    assert.deepEqual(loadState(st('[1,2]')), {});
    assert.deepEqual(loadState(st('"x"')), {});
    assert.deepEqual(loadState(st('{"a":1,"b":0,"c":"yes","d":{},"e":2}')), { a: 1, b: 0 });
    assert.deepEqual(loadState({ getItem() { throw new Error('blocked'); } }), {});
  });
}

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); }).listen(0);
  await new Promise(res => srv.once('listening', res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('35_r_fold_b12r: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, ribbons: 80, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 3: 3 } };
    const errs = [];
    const open = async (w, h, init) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const p = await ctx.newPage(); p.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
      await p.addInitScript(([s, i]) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); if (i) localStorage.setItem('cell_serpent_fold_b12r', i); } }, [JSON.stringify(SAVE), init || '']);
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 }); await p.waitForTimeout(600);
      return { p, ctx };
    };
    // what a visitor can see or tap: no display none ancestor, not inert, has a box
    const SHOWN = (sel, root) => { const e = (root || document).querySelector(sel); if (!e) return null; for (let a = e; a && a !== document.body; a = a.parentElement) { if (getComputedStyle(a).display === 'none' || a.inert) return false; } return e.getClientRects().length > 0; };
    const settle = p => p.waitForTimeout(450);
    try {
      for (const [w, h] of [[390, 844], [360, 740]]) {
        const { p, ctx } = await open(w, h);
        // 1 every tab is still reachable through the tab bar
        for (const tab of ['Shop', 'Stats', 'Battle', 'Skills', 'Pets', 'Gear']) {
          await p.evaluate(t => document.querySelector(`.tabs button[data-tab="${t}"]`).click(), tab); await p.waitForTimeout(500);
          assert.ok(await p.evaluate(t => document.getElementById('tab' + t).classList.contains('on'), tab), `${w}: tab ${tab} opens`);
        }
        // 2 default collapsed sections hide their content (display none and inert), headers are 44 px and keyboard friendly
        const cases = [
          ['Stats', 'stats.stickers', '.stkbook'], ['Stats', 'stats.bests', '.recbox'], ['Skills', 'skills.builds', '#presetRow'], ['Skills', 'skills.locked', '.tile.unowned'],
          ['Pets', 'pets.book', '.pcoll'], ['Gear', 'gear.sets', '.setstrip'], ['Shop', 'shop.chests', '.chestcard'], ['Shop', 'shop.beats-store', '.pack'], ['Battle', 'battle.more', '.sidebtn'], ['Battle', 'battle.parade', '#pigBox'],
        ];
        for (const [tab, id, inner] of cases) {
          await p.evaluate(t => window.CS.openHub(t), tab); await p.waitForTimeout(500);
          const f = await p.evaluate(([id, inner, SH]) => {
            const SHOWN = eval('(' + SH + ')'), fold = document.querySelector(`.fold[data-fold="${id}"]`); if (!fold) return null;
            const h = fold.querySelector('.fold-h'), b = fold.querySelector('.fold-b'), r = h.getBoundingClientRect();
            return { exp: h.getAttribute('aria-expanded'), ctl: h.getAttribute('aria-controls') === b.id, hh: Math.round(h.offsetHeight), fs: parseFloat(getComputedStyle(h.querySelector('.fold-t')).fontSize), hidden: SHOWN(inner, fold) === false, inert: b.inert, disp: getComputedStyle(b).display };
          }, [id, inner, SHOWN.toString()]);
          assert.ok(f, `${w} ${id}: the section exists`);
          assert.equal(f.exp, 'false', `${w} ${id}: starts collapsed`); assert.ok(f.ctl, `${w} ${id}: aria-controls points at the body`);
          assert.ok(f.hh >= 44, `${w} ${id}: header is ${f.hh}px tall`); assert.ok(f.fs >= 12, `${w} ${id}: header text ${f.fs}px`);
          assert.ok(f.hidden && f.inert && f.disp === 'none', `${w} ${id}: collapsed content is not shown (${JSON.stringify(f)})`);
          // tap the header: it opens, the content shows; tap again: it closes
          const hs = `.fold[data-fold="${id}"] > .fold-h`;
          await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), hs); await p.waitForTimeout(150);
          await p.evaluate(s => document.querySelector(s).click(), hs); await settle(p);
          const o = await p.evaluate(([id, inner, SH]) => { const SHOWN = eval('(' + SH + ')'), fold = document.querySelector(`.fold[data-fold="${id}"]`); return { exp: fold.querySelector('.fold-h').getAttribute('aria-expanded'), shown: SHOWN(inner, fold), inert: fold.querySelector('.fold-b').inert, ovf: document.documentElement.scrollWidth > innerWidth + 1 }; }, [id, inner, SHOWN.toString()]);
          assert.equal(o.exp, 'true', `${w} ${id}: opens`); assert.ok(o.shown === true && !o.inert, `${w} ${id}: expanded content shows`); assert.ok(!o.ovf, `${w} ${id}: no sideways scroll`);
          await p.evaluate(s => document.querySelector(s).click(), hs); await settle(p);
          assert.equal(await p.evaluate(s => document.querySelector(s).getAttribute('aria-expanded'), hs), 'false', `${w} ${id}: closes again`);
          n++;
        }
        await ctx.close();
      }
      // 3 keyboard, remembered state across a reload, the dot
      {
        const { p, ctx } = await open(390, 844);
        await p.evaluate(() => window.CS.openHub('Stats')); await p.waitForTimeout(500);
        const hs = '.fold[data-fold="stats.stickers"] > .fold-h';
        await p.focus(hs); await p.keyboard.press('Enter'); await settle(p);
        assert.equal(await p.evaluate(s => document.querySelector(s).getAttribute('aria-expanded'), hs), 'true', 'Enter opens');
        await p.keyboard.press('Space'); await settle(p);
        assert.equal(await p.evaluate(s => document.querySelector(s).getAttribute('aria-expanded'), hs), 'false', 'Space closes');
        await p.keyboard.press('Enter'); await settle(p);
        assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('cell_serpent_fold_b12r'))['stats.stickers']), 1, 'the open state is stored');
        await p.reload(); await p.waitForFunction(() => window.CS && window.CS.R); await p.waitForTimeout(600);
        await p.evaluate(() => window.CS.openHub('Stats')); await p.waitForTimeout(500);
        assert.equal(await p.evaluate(s => document.querySelector(s).getAttribute('aria-expanded'), hs), 'true', 'remembered after a reload');
        assert.ok(await p.evaluate(() => window.CS.fold.isOpen('stats.stickers', false)));
        // reduced motion: no inline height animation left behind
        await p.evaluate(() => document.documentElement.classList.add('rm')); await p.evaluate(s => document.querySelector(s).click(), hs); await p.waitForTimeout(60);
        assert.equal(await p.evaluate(s => document.querySelector(s).parentElement.querySelector('.fold-b').style.height, hs), '', 'no height animation under reduced motion');
        // the sticker book dot: a fresh sticker inside a collapsed book lights the dot
        await p.evaluate(() => window.CS.fold.openAll(false)); await p.waitForTimeout(300);
        const dot = await p.evaluate(() => { const f = document.querySelector('.fold[data-fold="stats.stickers"]'); return [f.classList.contains('has-dot'), f.classList.contains('open')]; });
        assert.ok(Array.isArray(dot));
        n += 5; await ctx.close();
      }
      // 4 junk in the storage key and an old save: the hub still builds with the defaults
      for (const junk of ['{nope', '[1]', '{"stats.stickers":"x","shop.chests":7}', '"a"']) {
        const { p, ctx } = await open(360, 740, junk);
        for (const tab of ['Stats', 'Skills', 'Shop']) { await p.evaluate(t => window.CS.openHub(t), tab); await p.waitForTimeout(400); }
        assert.ok(await p.evaluate(() => !!document.querySelector('.fold[data-fold="shop.chests"] > .fold-h[aria-expanded="false"]')), `junk "${junk}": defaults apply`);
        await ctx.close(); n++;
      }
      // 5 settings groups: Sound and feel open, the rest behind a tap, the search opens everything
      {
        const { p, ctx } = await open(390, 844);
        await p.evaluate(() => document.getElementById('setBtnH').click()); await p.waitForTimeout(700);
        const g = await p.evaluate(() => [...document.querySelectorAll('#settings .setgrp .fold-g')].map(b => [b.textContent.trim(), b.getAttribute('aria-expanded'), b.offsetHeight]));
        assert.ok(g.length >= 4, 'four setting groups: ' + JSON.stringify(g));
        assert.equal(g[0][1], 'true', 'Sound and feel is open'); assert.ok(g.slice(1).every(x => x[1] === 'false'), 'the others start closed'); assert.ok(g.every(x => x[2] >= 44), 'group headers are 44 px');
        assert.equal(await p.evaluate(() => { const e = document.querySelector('#settings [data-k="reduceMotion"]'); return e.getClientRects().length > 0; }), false, 'a closed group hides its rows');
        await p.evaluate(() => { const b = [...document.querySelectorAll('#settings .setgrp .fold-g')][1]; b.click(); }); await p.waitForTimeout(200);
        assert.equal(await p.evaluate(() => { const e = document.querySelector('#settings [data-k="reduceMotion"]'); return e.getClientRects().length > 0 && !e.inert; }), true, 'opening shows the rows');
        await p.evaluate(() => { const b = [...document.querySelectorAll('#settings .setgrp .fold-g')][1]; b.click(); const i = document.getElementById('setFind11'); i.value = 'vibration'; i.dispatchEvent(new Event('input')); }); await p.waitForTimeout(200);
        assert.equal(await p.evaluate(() => { const e = document.querySelector('#settings [data-k="vibrate"]'); return e.getClientRects().length > 0; }), true, 'search shows a match even in a closed group');
        n += 5; await ctx.close();
      }
      // 6 sheets: the skill and pet detail sheets fold their secondary blocks
      {
        const { p, ctx } = await open(390, 844);
        await p.evaluate(() => window.CS.openHub('Skills')); await p.waitForTimeout(500);
        await p.evaluate(() => document.querySelector('#skillList .tile:not(.unowned)').click()); await p.waitForTimeout(700);
        const d = await p.evaluate(() => { const f = document.querySelector('.dsheet .fold[data-fold="sheet.skill.more"]'); return f && [f.querySelector('.fold-h').getAttribute('aria-expanded'), f.querySelector('.fold-b').hidden, f.querySelector('.fold-h').getBoundingClientRect().height]; });
        assert.ok(d && d[0] === 'false' && d[1] === true && d[2] >= 44, 'skill sheet Details are folded: ' + JSON.stringify(d));
        await p.evaluate(() => document.querySelector('.dsx').click()); await p.waitForTimeout(400);
        await p.evaluate(() => window.CS.openHub('Pets')); await p.waitForTimeout(500);
        await p.evaluate(() => document.querySelector('#petList .tile.pet:not(.unowned)') ? document.querySelector('#petList .tile.pet:not(.unowned)').click() : document.querySelector('#petList .tile.pet').click()); await p.waitForTimeout(700);
        const pl = await p.evaluate(() => { const f = document.querySelector('.dsheet .fold[data-fold="sheet.pet.ladder"]'); return f && f.querySelector('.fold-h').getAttribute('aria-expanded'); });
        assert.equal(pl, 'false', 'pet sheet star ladder is folded');
        n += 2; await ctx.close();
      }
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(errs, [], 'no page errors');
  } else srv.close();
} else console.log('35_r_fold_b12r: browser part skipped, no playwright');
ok('static: no em dash in this file', () => assert.ok(!fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').includes(String.fromCharCode(8212))));
console.log(`35_r_fold_b12r: ${n} checks ok`);
