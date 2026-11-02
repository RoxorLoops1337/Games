// 34 phone hub: the owner plays almost only on phones. A Playwright sweep with mobile emulation (isMobile, hasTouch, deviceScaleFactor 3)
// at 360x740, 390x844, 412x915, 430x932 and the small 320x568 and 360x640. On the title, every hub tab, the settings, the Battle side
// panels, the season and trophy sheets, a skill sheet, a pet sheet and a shop box, each visible interactive element must have a hit area
// of at least 44x44 CSS px (measured with document.elementFromPoint, so an invisible ::before expansion counts, covered buttons fail),
// the page must not scroll sideways, and readable text must be 12 px or more (pure badges and counters: 11 px).
// Static part: the CSS block, hover rules, touch-action and the DPR aware icon baking. Browser part skipped without Chromium.
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

ok('css: one 34-phone-hub block, last in the style element, no em dash', () => {
  const html = read('index.html');
  assert.equal((html.match(/\/\* @css:34-phone-hub \*\//g) || []).length, 1);
  assert.equal((html.match(/\/\* end @css:34-phone-hub \*\//g) || []).length, 1);
  const i = html.indexOf('/* @css:34-phone-hub */'), j = html.indexOf('/* end @css:34-phone-hub */');
  assert.ok(i < j && html.slice(j).indexOf('</style>') < 40, 'the block is the last thing before </style>');
  const blk = html.slice(i, j);
  assert.ok(!blk.includes(String.fromCharCode(8212)));
  assert.ok(/touch-action:manipulation/.test(blk), 'no 300 ms tap delay');
  assert.ok(/@media \(hover:none\)\{[^}]*\.card:hover/.test(blk), 'sticky card hover is reset on touch screens');
});
ok('icons: baked at the screen density, capped at 3', () => {
  for (const f of ['icons.js', 'side_icons.js']) { const s = read(f); assert.ok(/devicePixelRatio/.test(s) && /Math\.min\(3/.test(s), f + ' uses devicePixelRatio capped at 3'); }
});

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// Allow-list for the tap rule: each entry needs a reason. Matched against the element's selector name (see name() below).
const HIT_ALLOW = [
  [/^title /, /#peeks|\.peek|data-pet/, 'title pets peek out from behind the duo on purpose; 25_qa_r7 checks that part of each stays tappable'],
];
// Text under 12 px is only allowed on pure badges and counters (never under 11 px).
const BADGE = /(^|[ .>#])(dot|gt|rchip|hotbadge|bestrib|hk)(\b|$)|>EM$/;

const PROBE = () => {
  const sel = 'button,a[href],input,select,textarea,[role=button],[role=tab],[role=switch],[role=checkbox],[tabindex]:not([tabindex="-1"]),[onclick],#skillList>.tile,#petList>.tile';
  const vis = e => { for (let a = e; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return e.getClientRects().length > 0 && getComputedStyle(e).pointerEvents !== 'none'; };
  const name0 = e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') || e.tagName;
  const name = e => (!e.id && !(typeof e.className === 'string' && e.className.trim()) && e.parentElement ? name0(e.parentElement) + '>' : '') + name0(e);
  const out = { small: [], text: [], ovf: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1 };
  const on = [...document.querySelectorAll('.scr.on')]; const root = on[on.length - 1]; if (!root) return out;
  for (const hb of root.querySelectorAll('.hubbody,.panelbody')) if (hb.scrollWidth > hb.clientWidth + 1) { out.ovf = true; out.ovfWhy = name0(hb) + ' ' + hb.scrollWidth + '>' + hb.clientWidth + ' ' + [...hb.querySelectorAll('*')].filter(x => x.getBoundingClientRect().right > hb.getBoundingClientRect().right + 1 && !x.closest('.side,.chips,.wstrip,[style*="overflow"]')).slice(0, 3).map(name).join(' | '); }
  const seen = new Set();
  for (const e of root.querySelectorAll(sel)) {
    if (seen.has(e) || !vis(e)) continue; seen.add(e);
    e.scrollIntoView({ block: 'center', inline: 'center' });
    const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
    const hit = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
    if (!hit(cx, cy)) { const t = document.elementFromPoint(cx, cy); out.small.push({ n: name(e), w: 0, h: 0, why: 'covered by ' + (t ? name(t) : 'nothing') + ' at ' + Math.round(cx) + ',' + Math.round(cy) }); continue; }
    if (e.offsetWidth >= 44 && e.offsetHeight >= 44 && e.offsetParent !== null && r.width > 20) continue;   // a big control (layout size, so a pulse animation does not count): only small ones depend on an invisible hit area
    let L = 0, R = 0, U = 0, D = 0;
    while (L < 120 && hit(cx - L - 1, cy)) L++; while (R < 120 && hit(cx + R + 1, cy)) R++; while (U < 120 && hit(cx, cy - U - 1)) U++; while (D < 120 && hit(cx, cy + D + 1)) D++;
    if (cx - L - 1 < 0) L = 120; if (cx + R + 1 > innerWidth) R = 120; if (cy - U - 1 < 0) U = 120; if (cy + D + 1 > innerHeight) D = 120;   // the screen edge ends the hit area, nothing beyond it can be tapped
    const w = L + R + 1, h = U + D + 1;
    if (w < 43.5 || h < 43.5) out.small.push({ n: name(e), w, h, rw: Math.round(r.width), rh: Math.round(r.height) });
  }
  const wk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), s2 = new Set(); let nd;
  while ((nd = wk.nextNode())) {
    const t = nd.textContent.trim(); if (!t || !/[A-Za-z0-9]/.test(t)) continue;
    const el = nd.parentElement; if (!el || s2.has(el) || el.closest('canvas,[aria-hidden="true"],.sr,[hidden],script,style') || !vis(el)) continue; s2.add(el);
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs > 0 && fs < 12) out.text.push({ n: name(el), fs, t: t.slice(0, 16) });
  }
  out.sico = [...root.querySelectorAll('.sico')].filter(vis).map(i => ({ nw: i.naturalWidth, cw: i.getBoundingClientRect().width }));
  return out;
};

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('34_phone_hub_ph: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, ribbons: 80, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 3: 3 } };
    const VPS = [[360, 740], [390, 844], [412, 915], [430, 932], [320, 568], [360, 640]];
    const STATES = ['title', 'Battle', 'Skills', 'Pets', 'Gear', 'Shop', 'Stats', 'settings', 'side0', 'side1', 'side2', 'side3', 'side4', 'qSeason', 'qAch', 'skillSheet', 'petSheet', 'box'];
    const hitFails = new Set(), textFails = new Set(), ovfFails = [], errs = [];
    let measured = 0, sicoMin = 99;
    try {
      await Promise.all(VPS.map(async ([w, h]) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVE));
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 }); await p.waitForTimeout(700);
        for (const st of STATES) {
          if (['Battle', 'Skills', 'Pets', 'Gear', 'Shop', 'Stats'].includes(st)) { await p.evaluate(t => window.CS.openHub(t), st); await p.waitForTimeout(600); }
          else if (st !== 'title') {
            await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(300);
            const opened = await p.evaluate(async st => {
              const c = s => { const e = document.querySelector(s); if (e) { e.click(); return true; } return false; }, wait = ms => new Promise(r => setTimeout(r, ms));
              if (st === 'settings') return c('#setBtnH');
              if (/^side/.test(st)) { const e = document.querySelectorAll('#battleSide .sidebtn')[+st.slice(4)]; if (e) { e.click(); return true; } return false; }
              if (st === 'qSeason' || st === 'qAch') return c('#' + st);
              if (st === 'skillSheet') { window.CS.openHub('Skills'); await wait(400); return c('#skillList > *'); }
              if (st === 'petSheet') { window.CS.openHub('Pets'); await wait(400); return c('#petList > *'); }
              if (st === 'box') { window.CS.openHub('Shop'); await wait(400); return c('#boxList button') || c('#boxList > *'); }
              return false;
            }, st);
            if (!opened) { if (st.startsWith('side') && +st.slice(4) >= 3) continue; hitFails.add(`${w}x${h} ${st}: could not open this state`); continue; }
            await p.waitForTimeout(700);
          }
          await p.waitForFunction(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect.getComputedTiming().iterations !== Infinity).length === 0, null, { timeout: 4000 }).catch(() => {});   // entry slides are finished: a mid-slide frame is not a layout
          const res = await p.evaluate(PROBE); measured++;
          for (const o of res.small) { const nm = `${st} ${o.n}`; if (HIT_ALLOW.some(([sr, nr]) => sr.test(nm) && nr.test(nm))) continue; hitFails.add(`${w}x${h} ${nm} hit ${o.w}x${o.h}${o.rw ? ` (visible ${o.rw}x${o.rh})` : ''}${o.why ? ' ' + o.why : ''}`); }
          for (const o of res.text) if (!(BADGE.test(o.n) && o.fs >= 11)) textFails.add(`${w}x${h} ${st} ${o.n} ${o.fs}px "${o.t}"`);
          if (res.ovf) ovfFails.push(`${w}x${h} ${st} ${res.ovfWhy || 'document'}`);
          if (st === 'Battle') for (const i of res.sico) sicoMin = Math.min(sicoMin, i.nw / (i.cw || 1));
        }
        await ctx.close();
      }));
    } finally { await browser.close(); srv.close(); }
    n += measured;
    assert.deepEqual(errs, [], 'no page errors');
    assert.deepEqual([...hitFails], [], 'tap targets of 44x44 or more:\n' + [...hitFails].join('\n'));
    assert.deepEqual(ovfFails, [], 'no horizontal overflow');
    assert.deepEqual([...textFails], [], 'readable text is 12 px or more:\n' + [...textFails].join('\n'));
    assert.ok(sicoMin >= 2.9, 'side icons are baked at 3x on a 3x phone (ratio ' + sicoMin.toFixed(2) + ')');
  } else srv.close();
} else console.log('34_phone_hub_ph: browser part skipped, no playwright');
ok('static: no em dash in this file', () => assert.ok(!fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').includes(String.fromCharCode(8212))));
console.log(`34_phone_hub_ph: ${n} checks ok`);
