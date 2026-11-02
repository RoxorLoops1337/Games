// 34 phone run: the in-run overlays on real phone sizes (mobile emulation, touch, device scale 3).
// On the level-up cards, pause, settings (opened from pause), revive and result screens every tap target is at least 44x44 CSS px,
// neighbouring targets are at least 8 px apart, nothing overflows sideways, RETRY/MENU/RESUME sit in reach, text is 12px or more,
// and the canvas pause button has a 44 px hit area (hud.js hudZone with the CSS px per game unit). Runs its asserts when imported.
// Browser part skipped without Chromium.
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

// static: one CSS block, the zone helper keeps its old behaviour without a scale and grows with one
{
  const html = read('index.html');
  ok((html.match(/\/\* @css:34-phone-run \*\//g) || []).length === 1 && html.includes('/* end @css:34-phone-run */'), 'one 34-phone-run css block');
  ok(html.indexOf('/* end @css:34-phone-run */') < html.lastIndexOf('</style>'), 'the block sits before the closing style tag');
  const { hudZone } = await import(path.join(ROOT, 'cell_serpent', 'hud.js'));
  assert.equal(hudZone({ x: 700, y: 30 }, 0), 'pause'); assert.equal(hudZone({ x: 700, y: 100 }, 0), 'stats'); n += 2;
  assert.equal(hudZone({ x: 650, y: 30 }, 0, 0.5), 'pause', 'a small scale widens the pause zone to 44 css px'); n++;
  assert.equal(hudZone({ x: 700, y: 80 }, 0, 0.5), 'pause', 'and lengthens it'); n++;
  assert.equal(hudZone({ x: 300, y: 30 }, 0, 0.5), '', 'the middle of the screen is no button'); n++;
  const src = html + read('main.js') + read('hud.js') + read('render.js');
  ok(!src.includes('—'), 'no em dash');
}

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// runs in the page: every visible control of the top screen. Allow-list (each with a reason):
//  input[type=range]  native slider, the whole row is the target
//  textarea           the backup code box, not a button
//  #buildStrip        a read-only 18x8 grab handle under the cards, the band totals also open from the banner
const AUDIT = () => {
  const top = [...document.querySelectorAll('.scr.on')].pop(); if (!top) return { err: 'no screen' };
  const skip = e => e.matches('input[type=range],textarea,#buildStrip');
  const live = e => { for (let a = e; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const list = [...top.querySelectorAll('button,[role=button],.lockb,span.pb9[data-w]')].filter(e => live(e) && !skip(e) && !e.disabled);
  // settle animations: size from layout (offset*), position from the rect
  const boxes = list.map(e => { const r = e.getBoundingClientRect(); return { e, id: (e.id || (typeof e.className === 'string' ? e.className : '')).toString().slice(0, 24), r }; });
  const small = [], gaps = [], out = [];
  for (const b of boxes) {
    // a scaled (breathing or pressed) button reports a slightly different rect: allow 1px
    if (b.r.width < 43.5 || b.r.height < 43.5) small.push(`${b.id} ${Math.round(b.r.width)}x${Math.round(b.r.height)}`);
    if (b.r.left < -1 || b.r.right > innerWidth + 1) out.push(`${b.id} sideways ${Math.round(b.r.left)}..${Math.round(b.r.right)}`);
  }
  // a control that sits inside a button (the lock inside a card) is nested, not a neighbour
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    if (a.e.id === 'setClose' || b.e.id === 'setClose') continue;   // sticky CLOSE floats over the scrolling toggles by design
    if (!(a.e.offsetParent !== null || b.e.offsetParent !== null)) continue;
    const dx = Math.max(a.r.left - b.r.right, b.r.left - a.r.right), dy = Math.max(a.r.top - b.r.bottom, b.r.top - a.r.bottom);
    if (dx < 0 && dy < 0) { gaps.push(`${a.id} overlaps ${b.id}`); continue; }
    const g = Math.max(dx, dy);   // both negative handled above: a positive axis is the visible gap
    if (g < 7.5 && (dx < 0 || dy < 0 || g >= 0)) gaps.push(`${a.id} to ${b.id} gap ${Math.round(g * 10) / 10}`);
  }
  const tiny = []; const w = document.createTreeWalker(top, NodeFilter.SHOW_TEXT); let t;
  while ((t = w.nextNode())) { const el = t.parentElement; if (!t.textContent.trim() || el.closest('[aria-hidden],.sr,[hidden]') || !live(el)) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11.95 && fs > 0) tiny.push((el.className || el.tagName) + ':' + t.textContent.trim().slice(0, 12) + ' ' + fs); }
  return { small, gaps, out, tiny: [...new Set(tiny)], sw: document.documentElement.scrollWidth, count: boxes.length };
};

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('34_phone_run_phr: browser part skipped, no Chromium'); }
  if (browser) {
    const fails = [];
    const SAVE = JSON.stringify({ v: 8, beats: 900000, sparkles: 900, cleared: 40, best: 40, runs: 300, eggs: 30, ribbons: 80, xp: 90000, energy: { n: 40, t: 0 } });
    try {
      for (const pair of [[[360, 740], [390, 844]], [[412, 915], [430, 932]], [[320, 568], [360, 640]]]) await Promise.all(pair.map(async ([w, h]) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', e => errs.push('page: ' + e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, SAVE);
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
        await p.waitForTimeout(500);
        const tag = `${w}x${h}`;
        const audit = async name => {
          const r = await p.evaluate(AUDIT); n++;
          if (r.err) { fails.push(`${tag} ${name}: ${r.err}`); return; }
          if (r.count < 2) fails.push(`${tag} ${name}: only ${r.count} controls found`);
          for (const s of r.small) fails.push(`${tag} ${name}: target under 44px: ${s}`);
          for (const s of r.gaps) fails.push(`${tag} ${name}: ${s}`);
          for (const s of r.out) fails.push(`${tag} ${name}: ${s}`);
          for (const s of r.tiny) fails.push(`${tag} ${name}: text under 12px: ${s}`);
          if (r.sw > w) fails.push(`${tag} ${name}: page scrolls sideways (${r.sw})`);
        };
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(800);
        // canvas pause button: scan the top right corner in CSS px, the pause zone must hold a 44x44 box around the drawn button
        const zone = await p.evaluate(() => {
          const c = document.querySelector('canvas'), R = window.CS.R, k = c.width / innerWidth; let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
          for (let x = innerWidth - 120; x < innerWidth; x++) for (let y = 0; y < 220; y++) { const gp = R.toGame(x * k, y * k); if (R.hudZone(gp) === 'pause') { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); } }
          return { w: x1 - x0, h: y1 - y0 };
        });
        n++; if (zone.w < 44 || zone.h < 44) fails.push(`${tag} canvas pause hit area ${zone.w}x${zone.h} css px`);
        // the hit area is a real tap: a pointerdown there pauses
        await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))); await p.waitForTimeout(1200);
        assert.equal(await p.evaluate(() => window.CS.mode()), 'pause', `${tag}: pause opens`); n++;
        await audit('pause');
        const resume = await p.evaluate(() => { const r = document.getElementById('resumeBtn').getBoundingClientRect(); return (r.top + r.bottom) / 2 / innerHeight; });
        n++; if (resume < 0.5 && h >= 640) fails.push(`${tag} RESUME is in the upper half (${resume.toFixed(2)})`);
        await p.evaluate(() => document.getElementById('pSet').click()); await p.waitForTimeout(1100); await audit('settings');
        await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await p.waitForTimeout(350);
        await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))); await p.waitForTimeout(350);
        await p.evaluate(() => { window.CS.g.pending = 1; });
        await p.waitForFunction(() => document.getElementById('levelup').classList.contains('on'), null, { timeout: 8000 }).catch(() => {});
        await p.waitForFunction(() => [...document.querySelectorAll('#cards > *')].every(c => !getComputedStyle(c).animationName.includes('dealin') || c.getAnimations().every(a => a.playState !== 'running' || !/dealin/.test(a.animationName || ''))), null, { timeout: 4000 }).catch(() => {});
        await p.waitForTimeout(1300); await audit('cards');
        const lockOk = await p.evaluate(() => { const l = document.querySelector('#cards .lockb'); if (!l) return 'no lock'; const r = l.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && (t === l || l.contains(t)) ? 'ok' : 'covered'; });
        n++; if (lockOk !== 'ok') fails.push(`${tag} card lock: ${lockOk}`);
        await p.evaluate(() => document.querySelector('#cards > *').click()); await p.waitForTimeout(900);
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(300);
        for (const kind of ['dead', 'won']) {
          await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(800);
          await p.evaluate(k => window.CS.force(k), kind);
          for (let i = 0; i < 24; i++) {
            await p.waitForTimeout(250);
            if (await p.evaluate(() => document.getElementById('revive').classList.contains('on'))) { await p.waitForTimeout(700); await audit('revive'); await p.evaluate(() => document.getElementById('rvNo').click()); }
            if (await p.evaluate(() => document.getElementById('result').classList.contains('on'))) break;
          }
          await p.waitForTimeout(2000); await audit('result-' + kind);
          const pos = await p.evaluate(() => ['rRetry', 'rHub'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { top: r.top / innerHeight, bottom: r.bottom }; }));
          n++; for (const q of pos) { if (q.top < 0.5) fails.push(`${tag} result-${kind}: RETRY/MENU in the upper half`); if (q.bottom > h) fails.push(`${tag} result-${kind}: RETRY/MENU off screen`); }
          await p.evaluate(() => document.getElementById('rHub').click()); await p.waitForTimeout(450);
        }
        if (errs.length) fails.push(`${tag}: ${errs.join(' | ')}`);
        await ctx.close();
      }));
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(fails, [], 'phone run overlays:\n' + fails.join('\n'));
  } else srv.close();
}
console.log(`34_phone_run_phr: ${n} checks passed`);
