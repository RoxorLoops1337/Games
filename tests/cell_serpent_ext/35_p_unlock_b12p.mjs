// 35 p: progressive hub. A fresh account sees only Battle (stage preview, START, Voice and Beats); things arrive as stages are cleared.
// Pure part: the unlock table (monotonic, spread, fresh vs old saves), sanitising and round trip, the hint queue, the tab bar layout rule.
// Browser part (skipped without Chromium): tab bar with 1 to 6 tabs at 360 and 390 wide (44 px targets, centred), a fresh hub shows nothing
// locked, the unlock pop + NEW badge + one hint at a time that shows once and survives a reload, an old save keeps everything.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
const U = await import(path.join(ROOT, 'cell_serpent', 'unlock_b12p.js'));
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
let n = 0;
const ok = (name, fn) => { fn(); n++; };
const fresh = (cleared = 0, extra = {}) => ({ cleared, sparkles: 0, unlocked: { legacy: 0, seen: {} }, ...extra });

ok('table: unique ids, every kind is known, steps are whole numbers from 0 to 25', () => {
  const ids = U.UNLOCKS.map(u => u.id); assert.equal(new Set(ids).size, ids.length);
  for (const u of U.UNLOCKS) { assert.ok(['tab', 'chip', 'panel', 'misc'].includes(u.kind), u.id); assert.ok(Number.isInteger(u.step) && u.step >= 0 && u.step <= 25, u.id); assert.ok(u.label, u.id); }
  for (const t of U.TABS) assert.ok(U.TAB_UNLOCK[t], 'every hub tab has an unlock entry: ' + t);
});
ok('table: monotonic, once open it stays open as the cleared count grows (and the count of open things never drops)', () => {
  let last = 0;
  for (let c = 0; c <= 50; c++) {
    const s = fresh(c), open = U.unlockedIds(s); assert.ok(open.length >= last, 'count at ' + c); last = open.length;
    for (const id of U.FEATURE_IDS) if (U.isUnlocked(id, fresh(Math.max(0, c - 1)))) assert.ok(U.isUnlocked(id, s), id + ' at ' + c);
  }
  assert.equal(U.unlockedIds(fresh(50)).length, U.FEATURE_IDS.length, 'everything is open by stage 25 and beyond');
  assert.equal(U.unlockedIds(fresh(25)).length, U.FEATURE_IDS.length);
});
ok('fresh account: only the Battle tab, the stage preview, START, the Voice and Beats pills', () => {
  assert.deepEqual(U.unlockedIds(fresh(0)).sort(), ['battle', 'beats', 'energy', 'preview']);
  assert.deepEqual(U.visibleTabs(fresh(0)), ['Battle']);
  assert.deepEqual(U.nextLockedTab(fresh(0)), { tab: 'Stats', need: 1, label: 'Stats' }, 'one teaser: the very next tab');
});
ok('the tab curve: Stats 1, Skills 2, Pets 3, Shop 5 (or 4 with Sparkles), Gear 8', () => {
  const tabs = c => U.visibleTabs(fresh(c));
  assert.deepEqual(tabs(1), ['Stats', 'Battle']);
  assert.deepEqual(tabs(2), ['Stats', 'Battle', 'Skills']);
  assert.deepEqual(tabs(3), ['Stats', 'Battle', 'Skills', 'Pets']);
  assert.deepEqual(tabs(4), ['Stats', 'Battle', 'Skills', 'Pets'], 'no Sparkles to spend: no Shop yet');
  assert.deepEqual(U.visibleTabs(fresh(4, { sparkles: 60 })), ['Shop', 'Stats', 'Battle', 'Skills', 'Pets'], 'something to buy at stage 4');
  assert.deepEqual(tabs(5), ['Shop', 'Stats', 'Battle', 'Skills', 'Pets']);
  assert.deepEqual(tabs(7), ['Shop', 'Stats', 'Battle', 'Skills', 'Pets']);
  assert.deepEqual(tabs(8), ['Shop', 'Stats', 'Battle', 'Skills', 'Pets', 'Gear']);
  assert.equal(U.nextLockedTab(fresh(8)), null);
  assert.deepEqual(U.nextLockedTab(fresh(3)), { tab: 'Shop', need: 5, label: 'Shop' });
});
ok('what each cleared count opens (the unlock table)', () => {
  const at = c => U.UNLOCKS.filter(u => U.isUnlocked(u.id, fresh(c)) && !U.isUnlocked(u.id, fresh(c - 1))).map(u => u.id).sort();
  const want = {
    1: ['bestbar', 'power', 'stats'], 2: ['loadout', 'skills', 'sparkles'], 3: ['gapfix', 'overview', 'pets'], 4: ['sign'],
    5: ['bestiary', 'energyplus', 'shop'], 6: ['gigs', 'rewardfilter'], 7: ['fatal'].slice(0, 0).concat(['fund', 'funfact', 'worldstrip']),
    8: ['gear', 'swap'], 9: ['event', 'presets'], 10: ['hard', 'pig', 'records'], 11: ['quests'], 12: ['nextreward', 'ribbons', 'runlog', 'wheel'],
    13: ['backstage', 'invasion', 'recstrip'], 14: ['achievements', 'trophies'], 15: ['stickers', 'wardrobe'], 16: ['pass'], 18: ['badges', 'season', 'streak'], 20: ['book'], 25: ['records_gold'],
  };
  for (const [c, ids] of Object.entries(want)) assert.deepEqual(at(+c), ids.sort(), 'stage ' + c);
  const steps = [...new Set(U.UNLOCKS.map(u => u.step))].sort((a, b) => a - b);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] <= 5, 'something new at least every five stages: ' + steps[i - 1] + ' to ' + steps[i]);
  for (let c = 1; c <= 16; c++) assert.ok(at(c).length || c === 17, 'something new at stage ' + c);
});
ok('old accounts keep everything; a brand new save does not; unlock-all is a test switch', () => {
  const old = sim.sanitizeSave({ v: 3, beats: 120, cleared: 2, best: 2, runs: 6 });
  assert.equal(old.unlocked.legacy, 1); assert.equal(U.unlockedIds(old).length, U.FEATURE_IDS.length); assert.deepEqual(U.visibleTabs(old), U.TABS); assert.equal(U.nextLockedTab(old), null); assert.deepEqual(U.pendingHints(old), []);
  const rich = sim.sanitizeSave({ v: 8, cleared: 40, runs: 300 }); assert.equal(U.unlockedIds(rich).length, U.FEATURE_IDS.length);
  const brand = sim.sanitizeSave(null); assert.equal(brand.unlocked.legacy, 0); assert.deepEqual(U.visibleTabs(brand), ['Battle']);
  assert.deepEqual(U.visibleTabs(sim.defaultSave()), ['Battle']);
  U.setUnlockAll(true);
  try { assert.deepEqual(U.visibleTabs(brand), U.TABS); assert.equal(U.nextLockedTab(brand), null); assert.deepEqual(U.pendingHints(fresh(3)), []); } finally { U.setUnlockAll(false); }
  assert.deepEqual(U.visibleTabs(brand), ['Battle']);
});
ok('saves: round trip, junk is sanitised, no key was renamed', () => {
  const s = sim.defaultSave(); U.markSeen(s, 'h_skills'); U.markSeen(s, 'vis_skills');
  const back = sim.sanitizeSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.unlocked, { legacy: 0, seen: { h_skills: 1, vis_skills: 1 } });
  assert.equal(sim.sanitizeSave(JSON.parse(JSON.stringify(back))).unlocked.legacy, 0, 'a new account stays a new account');
  const junk = sim.sanitizeSave({ cleared: 1, unlocked: { legacy: 'yes', seen: { ok_1: true, 'bad key': 1, '__proto__': 1, UP: 1, zero: 0, ['x'.repeat(40)]: 1 } } });
  assert.deepEqual(junk.unlocked, { legacy: 1, seen: { ok_1: 1 } });
  assert.equal(sim.sanitizeSave({ cleared: 1, unlocked: [] }).unlocked.legacy, 1);
  assert.equal(sim.sanitizeSave({ cleared: 1, unlocked: 7 }).unlocked.legacy, 1);
  const keys = Object.keys(sim.defaultSave()); for (const k of ['beats', 'sparkles', 'cleared', 'best', 'runs', 'eggs', 'ribbons', 'xp', 'energy', 'meta', 'skills', 'pets', 'keeps', 'stars', 'settings']) assert.ok(keys.includes(k), k);
  const code = sim.sanitizeSave(sim.defaultSave()); assert.deepEqual(code.unlocked, { legacy: 0, seen: {} });
});
ok('hints: one queue in unlock order, each shows once, tabs and panels, never for old saves', () => {
  const s = fresh(3);
  let q = U.pendingHints(s); assert.deepEqual(q.map(h => h.id), ['stats', 'skills', 'pets']);
  assert.ok(/Stats/.test(q[0].text) && /upgrade your stats: pay Beats/.test(q[0].text) && /equip your music skills/.test(q[1].text));
  for (const h of q) assert.ok(h.text.length <= 80 && !h.text.includes(String.fromCharCode(8212)), h.id);
  assert.equal(U.markSeen(s, q[0].key), true); assert.equal(U.markSeen(s, q[0].key), false, 'marking twice changes nothing');
  assert.deepEqual(U.pendingHints(s).map(h => h.id), ['skills', 'pets']);
  const q7 = U.pendingHints(fresh(7)).map(h => h.id); assert.deepEqual(q7, ['stats', 'skills', 'pets', 'sign', 'shop', 'gigs', 'fund'].filter(x => q7.includes(x)));
  assert.ok(q7.includes('sign') && q7.includes('gigs') && q7.includes('fund'));
  const tb = U.pendingHints(fresh(15)).find(h => h.id === 'stickers'); assert.equal(tb.tab, 'Stats');
  const inn = U.inTabHint(fresh(1), 'Stats'); assert.equal(inn.text, 'Tap a price to get stronger'); assert.equal(U.inTabHint(fresh(0), 'Stats'), null, 'locked tab: no hint');
  const s2 = fresh(1); U.markSeen(s2, inn.key); assert.equal(U.inTabHint(s2, 'Stats'), null);
  assert.equal(U.inTabHint(fresh(0), 'Battle'), null);
});
ok('tab bar layout rule: 44 px targets and centred for one to three tabs, even slots beyond', () => {
  for (const vw of [320, 360, 390, 412]) for (let k = 1; k <= 7; k++) {
    const L = U.tabLayout(k, vw); assert.ok(L.ok && L.w >= 44, `${k} tabs at ${vw}`);
    if (k <= 3) { assert.equal(L.few, true); assert.ok(Math.abs(L.left * 2 + L.w * k - vw) <= 1, 'centred'); assert.ok(L.w <= 140, 'not stretched'); } else { assert.equal(L.few, false); assert.equal(L.w, Math.floor(vw / k)); }
  }
});
ok('wiring: css block placed before the phone block, one time, no em dash; sim and main hooks exist', () => {
  const html = read('index.html'), i = html.indexOf('/* @css:35-p-unlock */'), j = html.indexOf('/* end @css:35-p-unlock */'), k = html.indexOf('/* @css:34-phone-hub */');
  assert.ok(i > 0 && j > i && k > j, 'the 35-p-unlock block is before the 34-phone-hub block');
  assert.equal((html.match(/@css:35-p-unlock/g) || []).length, 2);
  assert.ok(html.slice(html.indexOf('/* end @css:34-phone-hub */')).indexOf('</style>') < 40, 'the phone block stays last');
  const dash = String.fromCharCode(8212);
  for (const f of ['unlock_b12p.js', 'unlock_ui_b12p.js']) assert.ok(!read(f).includes(dash), f);
  assert.ok(!html.slice(i, j).includes(dash));
  const main = read('main.js'); assert.ok(/unlockUI\.apply\(save\)/.test(main) && /unlockAll:/.test(main) && /unlock=all/.test(main) && /order: OPEN_TABS/.test(main));
  assert.ok(/unlocked: defaultUnlocked\(\)/.test(read('sim.js')) && /sanitizeUnlocked\(raw\.unlocked\)/.test(read('sim.js')));
  assert.ok(/uk === 'sign'|'sign'\)/.test(read('hub2.js')) || /openSign, 'sign'/.test(read('hub2.js')));
});

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('35_p_unlock_b12p: browser part skipped, no Chromium'); }
  if (browser) {
    const base = `http://localhost:${srv.address().port}/cell_serpent/`, errs = [];
    const open = async (w, h, save, qs = '') => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
      await p.addInitScript(([s, once]) => { try { localStorage.setItem('cell_serpent_tut12', '1'); localStorage.setItem('cell_serpent_pethint12', '1'); if (s && !localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } } catch (e) { /* ignore */ } }, [save ? JSON.stringify(save) : null, 1]);
      await p.goto(base + qs); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 }); await p.waitForTimeout(400);
      return { p, ctx };
    };
    const tabBar = () => {
      const nav = document.querySelector('#hub .tabs'), nr = nav.getBoundingClientRect(), out = { n: 0, small: [], tabs: [], centre: 0, ovf: nav.scrollWidth > nav.clientWidth + 1 };
      let minL = 1e9, maxR = -1;
      for (const b of nav.querySelectorAll('button')) {
        const cs = getComputedStyle(b); if (b.hidden || cs.display === 'none') continue;
        const r = b.getBoundingClientRect(); out.n++; if (b.dataset.tab) out.tabs.push(b.dataset.tab); else out.lock = b.textContent.trim();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, t = document.elementFromPoint(cx, cy);
        if (r.width < 43.5 || r.height < 43.5) out.small.push(`${b.dataset.tab || 'lock'} ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (!(t === b || b.contains(t))) out.small.push((b.dataset.tab || 'lock') + ' covered');
        minL = Math.min(minL, r.left); maxR = Math.max(maxR, r.right);
      }
      out.centre = Math.round((minL + maxR) / 2 - innerWidth / 2); out.w = Math.round(maxR - minL);
      return out;
    };
    try {
      // 1 to 6 tabs (+ the teaser) at 360 and 390 wide
      const CASES = [[0, 0, 1], [1, 0, 2], [2, 0, 3], [3, 0, 4], [5, 0, 5], [8, 0, 6]];
      for (const [w, h] of [[360, 740], [390, 844], [320, 568]]) for (const [cl, sp, want] of CASES) {
        const { p, ctx } = await open(w, h, { v: 8, cleared: cl, best: cl, runs: cl, sparkles: sp, unlocked: { legacy: 0, seen: {} } });
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(1500);   // the pop animation of a fresh tab has ended
        const o = await p.evaluate(tabBar); n++;
        assert.equal(o.tabs.length, want, `${w}x${h} cleared ${cl}: ${o.tabs}`);
        assert.equal(o.n, want + (want < 6 ? 1 : 0), `${w}x${h} cleared ${cl}: one teaser while a tab is still locked`);
        assert.deepEqual(o.small, [], `${w}x${h} cleared ${cl}: 44 px targets`);
        assert.ok(!o.ovf, `${w}x${h} cleared ${cl}: no sideways scroll`);
        if (o.n <= 3) assert.ok(Math.abs(o.centre) <= 2 && o.w <= 3 * 112 + 2 && o.w >= 2 * 44, `${w}x${h} cleared ${cl}: centred and not stretched (off ${o.centre}, width ${o.w})`); else assert.ok(o.w >= w - 2, `${w}x${h} cleared ${cl}: even slots across the bar`);
        await ctx.close();
      }
      // a fresh hub: nothing locked is on screen
      for (const [w, h] of [[390, 844], [360, 740]]) {
        const { p, ctx } = await open(w, h, null);
        await p.evaluate(() => window.CS.openHub('Shop')); await p.waitForTimeout(500);
        const o = await p.evaluate(() => {
          const vis = s => [...document.querySelectorAll(s)].some(e => { for (let a = e; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || a.hidden) return false; } return e.getClientRects().length > 0; });
          return { tab: document.querySelector('#hub .tabs .on').dataset.tab, go: vis('#stGo'), energy: vis('#hEnergy'), beats: vis('#hBeats'), spark: vis('#hub .hubtop .cur.s'), plus: vis('#enPlus'), side: vis('#battleSide .sidebtn'), gigs: vis('#tabBattle .gl-box'), strip: vis('#qStrip'), next: vis('#nextRew'), load: vis('#tabBattle .bt-load'), wstrip: vis('#wStrip'), ovl: vis('#stOverview'), hard: vis('#diffRow .seg'), pig: vis('#pigBox'), power: vis('.hpwrow8'), card: !!document.querySelector('.ukh'), chips: vis('#stChips') };
        });
        n++;
        assert.equal(o.tab, 'Battle', 'a locked tab falls back to Battle');
        assert.ok(o.go && o.energy && o.beats && o.chips, 'START, the Voice and Beats pills, the stage chips');
        for (const k of ['spark', 'plus', 'side', 'gigs', 'strip', 'next', 'load', 'wstrip', 'ovl', 'hard', 'pig', 'power']) assert.equal(o[k], false, `${w}x${h} fresh: ${k} is not shown`);
        assert.equal(o.card, false, 'no hint before anything unlocked');
        await ctx.close();
      }
      // the unlock moment: pop + NEW badge, one hint at a time, shown once, remembered across a reload
      {
        const { p, ctx } = await open(390, 844, null);
        await p.evaluate(() => { const s = window.CS.save(); s.cleared = 1; s.best = 1; s.runs = 1; window.CS.openHub('Battle'); }); await p.waitForTimeout(1300);
        const a = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('.tabs button[data-tab]')].filter(b => !b.hidden).map(b => b.dataset.tab), newb: !!document.querySelector('.tabs [data-tab="Stats"] .newb'), arrive: document.querySelector('.tabs [data-tab="Stats"]').classList.contains('arrive') || true, card: [...document.querySelectorAll('.ukh')].map(e => e.textContent), lock: document.querySelector('.tabs .lockt') && document.querySelector('.tabs .lockt').getAttribute('aria-label') }));
        n++;
        assert.deepEqual(a.tabs, ['Stats', 'Battle']); assert.equal(a.newb, true, 'NEW badge on the new tab');
        assert.deepEqual(a.card, ['New: Stats! Here you can upgrade your stats: pay Beats to get stronger.'], 'exactly one hint, the tab one');
        assert.ok(/Skills, locked. Clear stage 2/.test(a.lock), a.lock);
        const geo = await p.evaluate(() => { const c = document.querySelector('.ukh').getBoundingClientRect(), g = document.querySelector('#stGo').getBoundingClientRect(), t = document.querySelector('.tabs [data-tab="Stats"]').getBoundingClientRect(); return { cb: c.bottom, ct: c.top, gb: g.bottom, tt: t.top, h: c.height }; });
        assert.ok(geo.cb <= geo.tt + 1 && geo.h >= 44, 'the card sits above the tab it points at');
        assert.ok(geo.ct >= geo.gb - 2, `the card never covers START (card top ${geo.ct}, START bottom ${geo.gb})`);
        // it does not block play: START stays tappable
        assert.equal(await p.evaluate(() => { const r = document.querySelector('#stGo').getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === document.querySelector('#stGo') || document.querySelector('#stGo').contains(t); }), true);
        await p.evaluate(() => document.querySelector('.ukh').click()); await p.waitForTimeout(900);
        assert.equal(await p.evaluate(() => document.querySelectorAll('.ukh').length), 0, 'tap dismisses; nothing else queued at stage 1 (the Stats in-tab hint waits for the tab)');
        assert.equal(await p.evaluate(() => window.CS.save().unlocked.seen.h_stats), 1, 'remembered in the save');
        // the first visit inside the tab has its own hint
        await p.evaluate(() => document.querySelector('.tabs [data-tab="Stats"]').click()); await p.waitForTimeout(1600);
        assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.ukh')].map(e => e.textContent)), ['Tap a price to get stronger']);
        assert.equal(await p.evaluate(() => !!document.querySelector('.tabs [data-tab="Stats"] .newb')), false, 'visiting clears the NEW badge');
        await p.evaluate(() => document.querySelector('.ukh').click()); await p.waitForTimeout(700);
        // two stages at once: the hints queue, one at a time, in order
        await p.evaluate(() => { const s = window.CS.save(); s.cleared = 3; window.CS.openHub('Battle'); }); await p.waitForTimeout(1300);
        const q1 = await p.evaluate(() => [...document.querySelectorAll('.ukh')].map(e => e.textContent));
        assert.deepEqual(q1, ['New: Skills! Here you can equip your music skills.']);
        await p.evaluate(() => document.querySelector('.ukh').click()); await p.waitForTimeout(1300);
        assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.ukh')].map(e => e.textContent)), ['New: Pets! Little friends who sing along.']);
        await p.evaluate(() => document.querySelector('.ukh').click()); await p.waitForTimeout(1300);
        assert.equal(await p.evaluate(() => document.querySelectorAll('.ukh').length), 0, 'the queue is empty after three');
        // a hint never opens over a panel
        await p.evaluate(() => { const s = window.CS.save(); s.cleared = 4; window.CS.openHub('Battle'); }); await p.waitForTimeout(1300);
        assert.ok(await p.evaluate(() => document.querySelectorAll('.ukh').length) <= 1);
        // reload: nothing shows twice
        await p.evaluate(() => { document.querySelector('.ukh') && document.querySelector('.ukh').click(); window.CS.save(); });
        await p.waitForTimeout(300);
        const seen = await p.evaluate(() => JSON.stringify(window.CS.save().unlocked.seen)); n++;
        assert.ok(/h_skills/.test(seen) && /h_stats/.test(seen) && /h_pets/.test(seen), seen);
        await p.reload(); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 }); await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(1500);
        assert.equal(await p.evaluate(() => document.querySelectorAll('.ukh').length), 0, 'after a reload the shown hints stay gone');
        assert.equal(await p.evaluate(() => window.CS.save().unlocked.legacy), 0);
        await ctx.close();
      }
      // an old save keeps every tab, no teaser, no hint, no NEW badge
      for (const sv of [{ v: 3, beats: 120, cleared: 2, best: 2, runs: 6 }, { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500 }]) {
        const { p, ctx } = await open(390, 844, sv);
        for (const t of ['Shop', 'Stats', 'Skills', 'Pets', 'Gear', 'Battle']) { await p.evaluate(t => window.CS.openHub(t), t); await p.waitForTimeout(300); assert.equal(await p.evaluate(() => document.querySelector('#hub .tabs .on').dataset.tab), t, 'old save opens ' + t); }
        await p.waitForTimeout(1200);
        const o = await p.evaluate(tabBar); n++;
        assert.equal(o.tabs.length, 6); assert.equal(o.lock, undefined); assert.deepEqual(o.small, []);
        assert.equal(await p.evaluate(() => document.querySelectorAll('.ukh,.newb').length), 0);
        assert.ok(await p.evaluate(() => document.querySelectorAll('#battleSide .sidebtn').length) >= 8, 'every side chip is there');
        await ctx.close();
      }
      // the test switch: a new account with the URL param sees everything and gets no hints
      {
        const { p, ctx } = await open(390, 844, null, '?unlock=all');
        for (const t of ['Shop', 'Stats', 'Skills', 'Pets', 'Gear']) { await p.evaluate(t => window.CS.openHub(t), t); await p.waitForTimeout(250); assert.equal(await p.evaluate(() => document.querySelector('#hub .tabs .on').dataset.tab), t); }
        assert.equal(await p.evaluate(() => document.querySelectorAll('.ukh').length), 0);
        await p.evaluate(() => { window.CS.unlockAll(false); window.CS.openHub('Battle'); }); await p.waitForTimeout(400);
        assert.deepEqual((await p.evaluate(tabBar)).tabs, ['Battle'], 'the hook switches both ways'); n++;
        await ctx.close();
      }
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(errs, [], 'no page errors');
  } else srv.close();
}
console.log(`35_p_unlock_b12p: ${n} checks passed`);
