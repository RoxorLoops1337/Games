// 18 accessibility batch 10: the contrast audit now walks the WHOLE scroll height of every hub tab (batch 9 only saw the first screen),
// no longer skips the Normal/Hard switch and the Power label (they were excluded without a reason), treats every colour emoji as a
// picture (not only U+1F000 and up), and also covers the title, settings, pause, encore, upgrade pick and result screens.
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
const ok = (name, fn) => { fn(); n++; };

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const ONLY = process.env.A18_ONLY || '';
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// runs inside the page: every visible text run under `rootSel` with colour, size and box. `lim` is the lowest y that is not under the
// bottom dock or tab bar (a run partly under them is read at the next scroll step instead). Only these are skipped, each for a reason:
// gradient filled and tilted text (see below), aria-hidden (decoration), .sr (invisible by design), canvas, disabled controls (exempt in WCAG), colour emoji (they ignore the text colour).
const AUDIT_FN = rootSel => {
  const res = [], root = document.querySelector(rootSel), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), seen = new Set();
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
  let lim = innerHeight; for (const s of ['#hub .tabs', '#hub .bt-dock #stGo']) { const e = document.querySelector(s); if (vis(e) && getComputedStyle(e).visibility !== 'hidden') lim = Math.min(lim, e.getBoundingClientRect().top); }
  const hb = document.querySelector('#hub .hubbody'), tl = hb && root.contains(hb) ? hb.getBoundingClientRect().top : 0;   // text scrolled under the hub header is clipped
  let nd;
  while ((nd = walker.nextNode())) {
    const txt = nd.textContent.trim(); if (!txt) continue;
    const el = nd.parentElement; if (!el || seen.has(el) || el.closest('canvas,[aria-hidden="true"],.sr,[hidden]')) continue;
    if (/\p{Extended_Pictographic}/u.test(txt) && !/[A-Za-z0-9]/.test(txt)) continue;
    if (el.closest('button[disabled],[aria-disabled="true"]')) continue;
    const cs = getComputedStyle(el); if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.webkitTextFillColor === 'transparent') continue;   // gradient filled logo and title letters (outlined, 30px and up)
    if (/matrix\(/.test(cs.transform) && !/matrix\(1, 0, 0, 1/.test(cs.transform)) continue;   // a tilted tag: its bounding box samples the pixels around it
     if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let op = 1, a = el; while (a && a !== document.body) { op *= +getComputedStyle(a).opacity; a = a.parentElement; }
    if (op < 0.05) continue;
    const r = document.createRange(); r.selectNodeContents(nd); const bb = r.getBoundingClientRect();
    if (bb.width < 2 || bb.height < 2 || bb.top < tl - 0.5 || bb.bottom > lim + 0.5 || bb.right < 0 || bb.left > innerWidth || bb.right > innerWidth + 1) continue;
    let hit = true;   // the run must be the top thing at its left, middle and right
    for (const fx of [0.12, 0.5, 0.88]) { const top = document.elementFromPoint(bb.left + bb.width * fx, bb.top + bb.height / 2); if (!top || !(el.contains(top) || top.contains(el))) hit = false; }
    if (!hit) continue;
    seen.add(el);
    res.push({ txt: txt.slice(0, 30), cls: (typeof el.className === 'string' ? el.className : '') + '', color: cs.color, fs: parseFloat(cs.fontSize), fw: +cs.fontWeight, op, x: bb.left, y: bb.top, w: bb.width, h: bb.height });
  }
  return res;
};
const lumf = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('32_access_b10: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, ribbons: 80, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 3: 3 } };
    const fails = new Set();
    // audits one state of the page: text runs first, then the same frame with all text hidden, then the worst 15 percent of the pixels under each run
    const audit = async (p, name, sel) => {
      await p.addStyleTag({ content: sel + ',' + sel + ' *{animation:none!important;transition:none!important}' });
      const items = await p.evaluate(AUDIT_FN, sel);
      await p.addStyleTag({ content: sel + ' *{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important}' });
      await p.waitForTimeout(120);
      const png = await p.screenshot();
      await p.evaluate(() => { for (let k = 0; k < 2; k++) [...document.querySelectorAll('style')].pop().remove(); });
      const px = await p.evaluate(async ({ b64, items }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        return items.map(it => { const sx = Math.max(0, Math.floor(it.x)), sy = Math.max(0, Math.floor(it.y)); const d = x.getImageData(sx, sy, Math.max(1, Math.min(Math.ceil(it.w), img.width - sx)), Math.max(1, Math.min(Math.ceil(it.h), img.height - sy))).data; const cols = []; for (let i = 0; i < d.length; i += 12) cols.push([d[i], d[i + 1], d[i + 2]]); return cols.slice(0, 400); });
      }, { b64: png.toString('base64'), items });
      items.forEach((it, i) => {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(it.color); if (!m || !px[i].length) return;
        const fg = [+m[1], +m[2], +m[3]], al = (m[4] === undefined ? 1 : +m[4]) * it.op;
        const crs = px[i].map(bg => { const f2 = fg.map((v, k) => v * al + bg[k] * (1 - al)); const L1 = lumf(f2), L2 = lumf(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); }).sort((a, b) => a - b);
        const worst = crs[Math.floor(crs.length * 0.15)], large = it.fs >= 24 || (it.fs >= 18.66 && it.fw >= 700), need = large || !/[A-Za-z0-9]/.test(it.txt) ? 3 : 4.5;
        if (worst < need) fails.add(`${name} "${it.txt}" .${it.cls.trim()} ${worst.toFixed(2)} < ${need} (${it.fs}px)`);
      });
      return items.length;
    };
    const open = async (vp, extra) => {
      const p = await browser.newPage({ viewport: vp || { width: 390, height: 844 } }); const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify({ ...SAVE, ...(extra || {}) }));
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
      await p.waitForTimeout(900); return { p, errs };
    };
    const quiet = (p, sel) => p.waitForFunction(s => document.getAnimations().filter(a => a.playState === 'running' && a.effect.getComputedTiming().iterations !== Infinity && a.effect.target.closest && a.effect.target.closest(s)).length === 0, sel, { timeout: 8000 }).catch(() => {});
    try {
      if (!ONLY || ONLY === 'hub') {   // every hub tab, from the top to the very bottom
        const { p, errs } = await open();
        const seen = {};
        for (const tab of ['Battle', 'Skills', 'Pets', 'Gear', 'Shop', 'Stats']) {
          await p.evaluate(t => window.CS.openHub(t), tab); await quiet(p, '#hub'); await p.waitForTimeout(400);
          const clear = await p.evaluate(() => { const h = document.querySelector('#hub .hubbody'); let lim = innerHeight; for (const s of ['#hub .tabs', '#hub .bt-dock #stGo']) { const e = document.querySelector(s); if (e && e.getClientRects().length) lim = Math.min(lim, e.getBoundingClientRect().top); } return { sh: h.scrollHeight, top: h.getBoundingClientRect().top, ch: Math.max(120, lim - h.getBoundingClientRect().top - 70) }; });
          let steps = 0, total = 0;
          for (let t = 0; steps < 30; t += Math.floor(clear.ch * 0.7), steps++) {
            await p.evaluate(t2 => { document.querySelector('#hub .hubbody').scrollTop = t2; }, t); await p.waitForTimeout(100);
            total += await audit(p, `${tab}@${steps}`, '#hub');
            if (t + clear.ch >= clear.sh) break;
          }
          seen[tab] = total; assert.ok(total > 15, `${tab}: text was found (${total})`); assert.ok(steps >= 1 || clear.sh < clear.ch * 1.2, `${tab}: scrolled`);
        }
        assert.ok(seen.Shop > seen.Battle * 0.6, 'the long tabs were walked to the end');
        assert.deepEqual(errs, []); await p.close(); n += 8;
      }
      if (!ONLY || ONLY === 'first') {   // the first screens: title, settings
        const { p, errs } = await open();
        assert.ok(await audit(p, 'title', '#title') > 5, 'title text found');
        await p.evaluate(() => document.getElementById('setBtnT').click()); await p.waitForTimeout(700); await quiet(p, '#settings');
        assert.ok(await audit(p, 'settings', '#settings') > 8, 'settings text found');
        assert.deepEqual(errs, []); await p.close(); n += 3;
      }
      if (!ONLY || ONLY === 'run') {   // in a run: pause, the upgrade pick, the encore prompt and the result
        const { p, errs } = await open();
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(4200);
        await p.evaluate(() => { window.CS.g.pending = 1; }); await p.waitForFunction(() => document.querySelector('#levelup.on'), null, { timeout: 6000 });
        await p.waitForTimeout(900); await quiet(p, '#levelup');
        assert.ok(await audit(p, 'pick', '#levelup') > 4, 'pick text found');
        await p.evaluate(() => document.getElementById('skipBtn').click()); await p.waitForTimeout(800);
        await p.keyboard.press('p'); await p.waitForFunction(() => window.CS.mode() === 'pause'); await p.waitForTimeout(700); await quiet(p, '#pause');
        assert.ok(await audit(p, 'pause', '#pause') > 8, 'pause text found');
        await p.evaluate(() => document.getElementById('resumeBtn').click()); await p.waitForTimeout(3500);
        await p.evaluate(() => window.CS.force('dead')); await p.waitForFunction(() => document.querySelector('#revive.on'), null, { timeout: 8000 }); await p.waitForTimeout(500); await quiet(p, '#revive');
        assert.ok(await audit(p, 'encore', '#revive') > 4, 'encore text found');
        await p.evaluate(() => document.getElementById('rvNo').click()); await p.waitForFunction(() => { if (!document.querySelector('#result.on') && document.querySelector('#revive.on')) document.getElementById('rvNo').click(); return document.querySelector('#result.on'); }, null, { timeout: 20000 }).catch(async e => { console.log('STATE', await p.evaluate(() => [window.CS.mode(), [...document.querySelectorAll('.scr.on')].map(s => s.id), window.CS.g && window.CS.g.phase].join())); throw e; }); await p.waitForTimeout(2500); await quiet(p, '#result');
        assert.ok(await audit(p, 'result', '#result') > 6, 'result text found');
        assert.deepEqual(errs, []); await p.close(); n += 6;
      }
    } finally { await browser.close(); srv.close(); }
    if (fails.size) console.log('contrast fails:\n' + [...fails].join('\n'));
    assert.deepEqual([...fails], [], 'contrast audit of every screen');
  } else srv.close();
} else console.log('32_access_b10: browser part skipped, no playwright');
ok('static: no em dash in this file', () => assert.ok(!fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').includes(String.fromCharCode(8212))));
console.log(`32_access_b10: ${n} checks ok`);
