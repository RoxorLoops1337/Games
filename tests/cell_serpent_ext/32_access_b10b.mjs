// 18 accessibility batch 10 (part 2): reduced motion for the flagged-cell effects, colour-blind safety of the batch 9 special cells
// (Metronome, Pillow, Bell tether), and the keyboard paths for the title tune and the sticker book. Browser part skipped without Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CS = f => path.join(ROOT, 'cell_serpent', f);
const read = f => fs.readFileSync(CS(f), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('static: no em dash in the touched files', () => { for (const f of ['a11y10.js', 'a11y7.js', 'render.js']) assert.ok(!read(f).includes(String.fromCharCode(8212)), f); });

// ---- pure keyboard logic
const a10 = await import('../../cell_serpent/a11y10.js');
ok('title snake keys: next cell skips cells that are off screen and stops at the ends', () => {
  const vis = i => i >= 1 && i <= 8;
  assert.equal(a10.nextCell(3, -1, 13, vis), 2);
  assert.equal(a10.nextCell(1, -1, 13, vis), 1, 'nothing left of cell 1 is on screen');
  assert.equal(a10.nextCell(8, 1, 13, vis), 8, 'cell 9 and up are off screen');
  assert.equal(a10.nextCell(0, 1, 13, i => i !== 1), 2, 'a hidden cell is stepped over');
  assert.equal(a10.cellSpeech(0), 'Snake head'); assert.equal(a10.cellSpeech(3), 'Snake cell 3');
});

// ---- reduced motion: with the setting on, no flagged-cell effect scrolls, swings or pulses with time
ok('static: render hands the flagged-cell drawers a frozen clock when reduce motion is on', () => {
  const r = read('render.js');
  assert.ok(/ft = OPT\.reduceMotion \? 0 : S\.t/.test(r));
  for (const call of ['drawChoirLinks(ctx, sn, ft)', 'drawBellLinks(ctx, sn, ft)', 'drawQuartetLinks(ctx, sn, ft)', 'drawCellFlags(ctx, s, r, ft, i, glow)', 'drawCellBadge(ctx, s, s.r, ft, i, kit)']) assert.ok(r.includes(call), call);
});
{
  const sim = await import('../../cell_serpent/sim.js');
  const { createRenderer } = await import('../../cell_serpent/render.js');
  const { createArtDraw } = await import('../../cell_serpent/art_draw.js');
  const noop = () => {};
  let dash = [];
  const mkCtx = main => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: (_t, k, v) => { if (main && k === 'lineDashOffset' && v !== 0) dash.push(v); return true; } });
  const mkCanvas = (w, h) => ({ width: w, height: h, getContext: () => mkCtx(false) });
  const runFrames = reduce => {
    const kit = createArtDraw(mkCanvas, 2), R = createRenderer({ width: 420, height: 860, getContext: () => mkCtx(true) }, { get: () => ({ width: 100, height: 80 }), has: () => true }, kit);
    R.setOptions({ reduceMotion: reduce });
    const g = sim.createGame({ seed: 7, stage: 3, bot: true });
    for (let i = 0; i < 90; i++) sim.step(g, 1 / 60, sim.botInput(g));
    const segs = g.snakes[0].segs; segs[2].bell = true; segs[3].choir = true; segs[4].ward = true; segs[5].warded = true; segs[6].quartet = true; segs[7].quartet = true; segs[8].metro = true; segs[9].pillow = true;
    g.phase = 'play'; const ui = { joy: { on: false, dx: 0 } };
    R.draw(g, ui, 0.016); R.draw(g, ui, 0.3); dash = [];
    for (let i = 0; i < 6; i++) R.draw(g, ui, 0.25);
    return dash.length;
  };
  ok('reduce motion: no tether, ring or ribbon dash scrolls (and with it off they do, so the check can fail)', () => {
    assert.ok(runFrames(false) > 0, 'with motion on, dashes scroll');
    assert.equal(runFrames(true), 0, 'with reduce motion on, every dash offset stays 0');
  });
}

// ---- colour-blind safety of the special cells: each badge is its own SHAPE (colour is never the only cue), and the tether is a pattern
{
  const { drawCellBadge } = await import('../../cell_serpent/cellfx.js');
  const sig = flag => { const ops = []; const ctx = new Proxy({}, { get: (_, m) => (...a) => { ops.push(m + a.map(v => typeof v === 'number' ? Math.round(v * 10) : '').join(',')); }, set: () => true }); drawCellBadge(ctx, { x: 100, y: 100, [flag]: true }, 40, 0, 0, null); return ops.join('|'); };
  const FLAGS = ['ward', 'lull', 'drum', 'choir', 'quartet', 'bell', 'metro', 'pillow'];
  ok('special cell badges: all eight have a different outline', () => {
    const seen = new Map();
    for (const f of FLAGS) { const s = sig(f); assert.ok(s.length > 30, f + ' draws something'); assert.ok(!seen.has(s), f + ' looks like ' + seen.get(s)); seen.set(s, f); }
  });
  // the pairs whose glow colours are close for everyone (and merge under red-green colour blindness) must differ in more than colour
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const glows = {}; const src = read('cellfx.js'); for (const m of src.matchAll(/if \(s\.(\w+)\) (?:\{ )?glow\(s\.x, s\.y, r \* [\d.]+, '(#\w+)'/g)) glows[m[1]] = m[2];
  ok('special cell glows: the near-identical colour pairs are told apart by their badge shape', () => {
    const close = [];
    const keys = Object.keys(glows); assert.ok(keys.length >= 7, 'found the glow colours');
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const a = glows[keys[i]], b = glows[keys[j]]; if (Math.abs(lum(a) - lum(b)) < 0.06 && [1, 3, 5].every(k => Math.abs(parseInt(a.slice(k, k + 2), 16) - parseInt(b.slice(k, k + 2), 16)) < 40)) close.push([keys[i], keys[j]]); }
    close.push(['quartet', 'metro']);   // the Metronome glow is built in a block the scan above cannot see: mint beside mint
    assert.ok(close.some(([a, b]) => a === 'choir' && b === 'pillow'), 'the audit does see the known look-alikes (choir and pillow)');
    for (const [a, b] of close) assert.notEqual(sig(a), sig(b), `${a} and ${b} glow alike, their badges must differ`);
  });
  ok('bell tether: dashed and beaded, so it is not just a gold colour', () => {
    const b = read('bell_fx.js'); assert.ok(/setLineDash\(\[9, 8\]\)/.test(b) && /arc\(c\.x \+ \(q\.x - c\.x\) \* f/.test(b));
  });
}

// ---- browser: keyboard path for the title tune and the sticker book
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('32_access_b10b: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 12000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, ribbons: 80, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 3: 3 } };
    const open = async () => {
      const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVE));
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R && document.querySelector('#title .snkey'), null, { timeout: 12000 });
      await p.waitForTimeout(700); return { p, errs };
    };
    try {
      {   // the title tune from the keyboard only
        const { p, errs } = await open();
        const pokes = await p.evaluate(() => { window.__pk = []; document.getElementById('title').addEventListener('snakepoke', e => window.__pk.push(e.detail.i)); return document.querySelector('#title .snkey').getAttribute('aria-label'); });
        assert.match(pokes, /Left and right arrows/, 'the lane explains itself to a screen reader');
        await p.evaluate(() => document.querySelector('#title .snkey').focus());
        assert.equal(await p.evaluate(() => document.activeElement.className), 'snkey', 'the lane takes focus');
        await p.waitForTimeout(150);
        assert.equal(await p.evaluate(() => document.querySelector('#title .snkmark').classList.contains('on')), true, 'a marker shows which cell is chosen');
        const cell = () => p.evaluate(() => { const m = document.querySelector('#title .snkmark'); return m.style.left; });
        const x0 = await cell(); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(80);
        assert.notEqual(await cell(), x0, 'the marker moves with the arrow keys');
        await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
        assert.deepEqual(await p.evaluate(() => window.__pk), [1], 'Enter pokes the chosen cell like a tap');
        assert.match(await p.evaluate(() => document.getElementById('a11yLive').textContent), /Poked snake cell 1/);
        // play the tune 3 2 1 3 2 1: from cell 1 step toward the tail with Left
        const goTo = async want => { for (let k = 0; k < 14; k++) { const cur = await p.evaluate(() => { const l = document.querySelector('#title .snkmark'); return +l.dataset.c || 0; }); void cur; break; } };
        void goTo;
        const seq = [3, 2, 1, 3, 2, 1]; let at = 1;
        await p.evaluate(() => { window.__pk = []; });
        for (const c of seq) { while (at < c) { await p.keyboard.press('ArrowLeft'); at++; } while (at > c) { await p.keyboard.press('ArrowRight'); at--; } await p.keyboard.press(' '); await p.waitForTimeout(60); }
        assert.deepEqual(await p.evaluate(() => window.__pk), seq, 'the six pokes arrive in order');
        assert.equal(await p.evaluate(() => localStorage.getItem('cell_serpent_tune13')), '1', 'the tune sticker is won without a pointer');
        assert.equal(await p.evaluate(() => document.querySelector('#title .stk13').hidden), false, 'and the sticker button appears');
        assert.deepEqual(errs, []); await p.close(); n += 9;
      }
      {   // the sticker book from the keyboard only
        const { p, errs } = await open();
        await p.evaluate(() => window.CS.openHub('Stats')); await p.waitForSelector('.stkgrid button', { timeout: 8000 }); await p.waitForTimeout(500);
        const info = await p.evaluate(() => { const bs = [...document.querySelectorAll('.stkgrid button')]; return { n: bs.length, stops: bs.filter(b => b.tabIndex === 0).length, grp: document.querySelector('.stkgrid').getAttribute('role'), described: bs.filter(b => b.classList.contains('got')).every(b => b.getAttribute('aria-description')), got: bs.filter(b => b.classList.contains('got')).length }; });
        assert.ok(info.n >= 12, 'the book has its stickers'); assert.equal(info.stops, 1, 'one Tab stop for the whole grid'); assert.equal(info.grp, 'group'); assert.ok(info.got > 0 && info.described, 'each sticker you own says what it was for');
        await p.evaluate(() => { const b = document.querySelector('.stkgrid button[tabindex="0"]'); b.scrollIntoView({ block: 'center' }); b.focus(); });
        const id0 = await p.evaluate(() => document.activeElement.dataset.id);
        await p.keyboard.press('ArrowRight');
        const id1 = await p.evaluate(() => document.activeElement.dataset.id);
        assert.notEqual(id1, id0, 'ArrowRight moves to the next sticker');
        assert.equal(await p.evaluate(() => document.querySelectorAll('.stkgrid button[tabindex="0"]').length), 1, 'the single Tab stop follows the focus');
        await p.keyboard.press('End'); const last = await p.evaluate(() => [...document.querySelectorAll('.stkgrid button')].pop().dataset.id);
        assert.equal(await p.evaluate(() => document.activeElement.dataset.id), last, 'End jumps to the last sticker');
        await p.keyboard.press('Home'); assert.equal(await p.evaluate(() => document.activeElement.dataset.id), await p.evaluate(() => document.querySelector('.stkgrid button').dataset.id), 'Home jumps to the first');
        await p.keyboard.press('Enter'); await p.waitForTimeout(150);
        assert.ok((await p.evaluate(() => document.querySelector('.stkcap').textContent)).length > 3, 'Enter shows the caption in the live region');
        assert.equal(await p.evaluate(() => document.activeElement.classList.contains('stk')), true, 'focus stays on the sticker after Enter');
        assert.deepEqual(errs, []); await p.close(); n += 9;
      }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
} else console.log('32_access_b10b: browser part skipped, no playwright');
console.log(`32_access_b10b: ${n} checks ok`);
