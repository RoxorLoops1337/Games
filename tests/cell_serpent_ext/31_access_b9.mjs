// 18 accessibility batch 9: contrast audit of every hub tab at 100 and 140 percent text size (pixel based, worst 15 percent of the
// background under each text run), keyboard flow of the goal claim rows, reduced motion switches. Browser part skipped without Chromium.
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
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// runs inside the page: every visible text run of the hub with its colour, size and box
const AUDIT_FN = () => {
  const res = [], root = document.querySelector('#hub'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), seen = new Set();
  let nd;
  while ((nd = walker.nextNode())) {
    const txt = nd.textContent.trim(); if (!txt) continue;
    const el = nd.parentElement; if (!el || seen.has(el) || el.closest('canvas,[aria-hidden="true"],.sr')) continue;
    if (/\p{Extended_Pictographic}/u.test(txt) && !/[A-Za-z0-9]/.test(txt)) continue;   // colour emoji ignore the text colour
    if (el.closest('button[disabled],[aria-disabled="true"]')) continue;   // disabled controls are exempt
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let op = 1, a = el; while (a && a !== document.body) { op *= +getComputedStyle(a).opacity; a = a.parentElement; }
    const r = document.createRange(); r.selectNodeContents(nd); const bb = r.getBoundingClientRect();
    const dock = document.querySelector('#hub .tabs'), lim = dock && dock.getClientRects().length ? dock.getBoundingClientRect().top : innerHeight;   // batch 10: text under the tab bar is read after scrolling (32_access_b10 walks every tab)
    if (bb.bottom > lim + 0.5) continue;
    if (bb.width < 2 || bb.height < 2 || bb.bottom < 0 || bb.top > innerHeight || bb.right < 0 || bb.left > innerWidth) continue;
    const cx = Math.min(innerWidth - 1, Math.max(0, bb.left + bb.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, bb.top + bb.height / 2));
    const top = document.elementFromPoint(cx, cy); if (!top || !(el.contains(top) || top.contains(el))) continue;
    seen.add(el);
    res.push({ txt: txt.slice(0, 30), cls: (typeof el.className === 'string' ? el.className : '') + '', color: cs.color, fs: parseFloat(cs.fontSize), fw: +cs.fontWeight, op, x: bb.left, y: bb.top, w: bb.width, h: bb.height });
  }
  return res;
};

ok('static: no em dash in the touched files', () => { for (const f of ['a11y9.js', 'a11y7.js', 'trait_ui.js']) assert.ok(!read(f).includes('—'), f); });
const a9 = await import('../../cell_serpent/a11y9.js');
ok('goal button names say which gig they claim', () => {
  assert.equal(a9.goalLabel('ready', 'Pop 3 bombs', '3/3'), 'Claim reward: Pop 3 bombs');
  assert.match(a9.goalLabel('wait', 'Beat a boss', '0/1'), /^Beat a boss, 0\/1 done, not finished/);
  assert.equal(a9.goalLabel('claimed', 'Beat a boss'), 'Beat a boss, reward claimed');
  assert.equal(a9.claimLine([]), ''); assert.equal(a9.claimLine(['A']), 'Claimed: A'); assert.equal(a9.claimLine(['A', 'B']), 'Claimed 2 gigs: A; B');
});
ok('static: a11y7 starts the claim helpers', () => assert.ok(/initClaimA11y\(\)/.test(read('a11y7.js'))));

// colour-blind: the eight species trait chips differ in SHAPE (the drawing commands), not only in colour, and each has a words label
const { drawTraitIcon, TRAIT_LABEL } = await import('../../cell_serpent/trait_ui.js');
ok('trait chips: every species icon has a unique outline and a text label', () => {
  const sig = k => { const ops = []; const ctx = new Proxy({}, { get: (_, m) => (...a) => { ops.push(m + a.map(v => typeof v === 'number' ? v.toFixed(1) : '').join(',')); }, set: () => true }); drawTraitIcon(ctx, k, 0, 0, 30, '#808080', 0); return ops.slice(5).join('|'); };
  const keys = Object.keys(TRAIT_LABEL); assert.equal(keys.length, 8);
  const seen = new Set(); for (const k of keys) { assert.ok(/^[A-Z ]{6,}$/.test(TRAIT_LABEL[k]), k + ' has a words label'); const s = sig(k); assert.ok(!seen.has(s), k + ' shape is unique'); seen.add(s); }
});

// reduced motion: each batch 8 effect is switched off (or held still) when the setting is on
ok('static: batch 8 effects are gated by reduced motion', () => {
  const render = read('render.js'), bg = read('bg_world.js'), fx = read('screenfx.js'), main = read('main.js'), rb = read('result_b8.js');
  assert.ok(/e\.head && S\.bgfx && !OPT\.reduceMotion/.test(render), 'squall and petals start only with motion on');
  assert.ok(/if \(!o\.reduce\) \{ drawSquall/.test(bg) && /if \(!o\.reduce\) drawNight/.test(bg) && /if \(!o\.reduce\) \{ const sdt = stepB8/.test(bg), 'sky, squall, petals');
  assert.ok(/S\.petWake !== undefined && !OPT\.reduceMotion/.test(render), 'pet hops on the count-in');
  assert.ok(/if \(!calm\(\)\) \{ ring\(W \/ 2, H \* 0\.4/.test(fx) && /if \(!calm\(\)\) \{ const bk/.test(fx), 'count-in rings and room flash');
  assert.ok(/reduce \|\| !a\.width/.test(rb), 'ribbon flight lands instantly');
  assert.ok(/reduce = !!\(save\.settings\.reduceMotion \|\| systemReduceMotion\(\)\)/.test(main), 'gig flights');
});

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('31_access_b9: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, ribbons: 80, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 3: 3 } };
    const lumf = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    try {
      for (const ts of [1, 1.4]) {
        const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify({ ...SAVE, textScale: ts }));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        await p.waitForTimeout(800);
        const fails = [];
        for (const tab of ['Battle', 'Skills', 'Pets', 'Gear', 'Shop', 'Stats']) {
          await p.evaluate(t => window.CS.openHub(t), tab);
          await p.waitForFunction(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect.getComputedTiming().iterations !== Infinity && a.effect.target.closest && a.effect.target.closest('#hub')).length === 0, null, { timeout: 8000 }).catch(() => {});
          await p.waitForTimeout(500);
          await p.addStyleTag({ content: '#hub *{animation:none!important;transition:none!important}' });
          const items = await p.evaluate(AUDIT_FN);
          await p.addStyleTag({ content: '#hub *{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important}' });
          await p.waitForTimeout(150);
          const png = await p.screenshot();
          await p.evaluate(() => { for (let k = 0; k < 2; k++) [...document.querySelectorAll('style')].pop().remove(); });
          const px = await p.evaluate(async ({ b64, items }) => {
            const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
            return items.map(it => { const sx = Math.max(0, Math.floor(it.x)), sy = Math.max(0, Math.floor(it.y)); const d = x.getImageData(sx, sy, Math.max(1, Math.min(Math.ceil(it.w), img.width - sx)), Math.max(1, Math.min(Math.ceil(it.h), img.height - sy))).data; const cols = []; for (let i = 0; i < d.length; i += 12) cols.push([d[i], d[i + 1], d[i + 2]]); return cols.slice(0, 400); });
          }, { b64: png.toString('base64'), items });
          assert.ok(items.length > 5, `${tab}: text was found`);
          items.forEach((it, i) => {
            const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(it.color); if (!m || !px[i].length) return;
            const fg = [+m[1], +m[2], +m[3]], al = (m[4] === undefined ? 1 : +m[4]) * it.op;
            const crs = px[i].map(bg => { const f2 = fg.map((v, k) => v * al + bg[k] * (1 - al)); const L1 = lumf(f2), L2 = lumf(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); }).sort((a, b) => a - b);
            const worst = crs[Math.floor(crs.length * 0.15)], large = it.fs >= 24 || (it.fs >= 18.66 && it.fw >= 700), need = large || !/[A-Za-z0-9]/.test(it.txt) ? 3 : 4.5;   // symbol-only glyphs are graphics: 3:1
            if (worst < need) fails.push(`${tab} "${it.txt}" .${it.cls} ${worst.toFixed(2)} < ${need}`);
          });
        }
        if (fails.length) console.log('contrast fails at text ' + ts + ':\n' + fails.join('\n'));
        assert.deepEqual(fails, [], `hub contrast at text size ${ts}`);
        assert.deepEqual(errs, []);
        await p.close(); n += 3;
      }
      {   // keyboard flow of the gig claim rows
        const { dailyGoals } = await import('../../cell_serpent/sim.js');
        const day = Math.floor(Date.now() / 86400000), prog = {}; for (const g of dailyGoals(day)) prog[g.stat] = 99999;
        const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify({ ...SAVE, daily: { day, progress: prog, claimed: {} } }));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(900);
        const names = await p.evaluate(() => [...document.querySelectorAll('#goalList .gl-btn')].map(b => b.getAttribute('aria-label')));
        assert.equal(names.length, 3); for (const nm of names) assert.ok(/^Claim reward: .{4,}/.test(nm), 'named: ' + nm);
        assert.equal(new Set(names).size, 3, 'the three claim buttons have different names');
        await p.evaluate(() => document.querySelector('#goalList .gl-btn').focus());
        await p.keyboard.press('Enter'); await p.waitForTimeout(700);
        assert.match(await p.evaluate(() => document.getElementById('a11yLive').textContent), /^Claimed: /, 'one claim is spoken');
        assert.equal(await p.evaluate(() => document.querySelectorAll('#goalList .gl-row.claimed').length), 1);
        assert.equal(await p.evaluate(() => { const a = document.activeElement; return a !== document.body && !a.disabled; }), true, 'focus did not fall to the page after a row claim');
        await p.evaluate(() => document.getElementById('btClaim').focus());
        await p.keyboard.press('Enter'); await p.waitForTimeout(900);
        assert.match(await p.evaluate(() => document.getElementById('a11yLive').textContent), /^Claimed 2 gigs: /, 'the claim all is spoken');
        const act = await p.evaluate(() => { const a = document.activeElement; return { body: a === document.body, dis: !!a.disabled }; });
        assert.equal(act.body, false, 'focus is not lost'); assert.equal(act.dis, false);
        assert.equal(await p.evaluate(() => document.querySelectorAll('#goalList .gl-row.claimed').length), 3);
        assert.deepEqual(errs, []); await p.close(); n += 7;
      }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
} else console.log('31_access_b9: browser part skipped, no playwright');
console.log(`31_access_b9: ${n} checks ok`);
