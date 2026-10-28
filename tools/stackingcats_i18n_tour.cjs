// Stacking Cats i18n coverage tour: visits the screens in Danish and writes every text the dictionary did not translate to a JSON file.
// Usage: serve the repo (python3 -m http.server 8765), then: node tools/stackingcats_i18n_tour.cjs [out.json]   (needs `playwright`)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 926, height: 428 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/stacking_cats/?cov=' + Date.now()); await p.waitForFunction(() => window.stackingCats && window.stackingCats.mode === 'title');
  await p.evaluate(async () => { const c = window.stackingCats; c.save().seenIntro = true; c.save().name = 'Perf'; c.save().nameAsked = true; await c.setLangNow('da'); });
  const sh = async (label) => { await p.waitForTimeout(250); };
  const call = async (fn, ...a) => { try { await p.evaluate(([f, a]) => { const c = window.stackingCats; c.clearChoices(); return c.ui[f](...a.map((x) => (x === '$back' ? c.ui.showTitle : x))); }, [fn, a]); } catch (e) { errs.push(fn + ': ' + e.message); } await sh(fn); };
  for (const f of ['showTitle', 'showSettings', 'showHow', 'showDex', 'showRelics', 'showTrophies', 'showCollection', 'showKingdom', 'showDaily', 'showRanking', 'showDiffPicker', 'showWardrobe', 'showNamePrompt']) await call(f, '$back');
  // a run with tips on
  await p.evaluate(() => { const c = window.stackingCats; c.save().tips = {}; c.save().opt.tutorial = true; c.ui.showTitle(); c.startRun(); });
  for (let i = 0; i < 60; i++) { const m = await p.evaluate(() => window.stackingCats.mode + ':' + (window.stackingCats.g && window.stackingCats.g.state)); if (/play:fight/.test(m)) break; const btn = await p.$('.screen .card, .screen .btn'); if (btn) await btn.click({ timeout: 1500, force: true }).catch(() => {}); await p.waitForTimeout(300); }
  await p.waitForTimeout(1500);
  for (let i = 0; i < 12; i++) { const got = await p.$('.coach button, #coach button'); if (got) { await got.click({ force: true }).catch(() => {}); } await p.waitForTimeout(200); }
  await p.evaluate(() => { const c = window.stackingCats, g = c.g; for (const id of ['ember', 'sparky', 'mochi', 'tabby', 'volcano', 'pearl']) c.S.addCat(g, id); for (const r of ['bulwark', 'heart', 'rod', 'peak', 'bell']) c.S.takeRelic(g, r); g.perm.push('sushi', 'tuna'); g.run.coins = 300; g.wave = 6; g.report = null; });
  await p.waitForTimeout(3000);
  for (const f of ['showPause', 'showStats', 'showTower', 'showCatReward', 'showSnackReward', 'showRelicReward', 'showRouteReward']) await call(f, '$back');
  for (const t of ['cardboard', 'basket', 'silver', 'golden']) { await call('showBox', t); }
  // box flow
  await p.evaluate(() => { const c = window.stackingCats; c.ui.showBox('silver'); });
  for (let i = 0; i < 4; i++) { await p.evaluate(() => { const b = document.querySelector('button[data-act=crack]'); if (b) b.click(); }); await p.waitForTimeout(400); }
  await p.waitForTimeout(3000); await p.evaluate(() => { const b = document.querySelector('button[data-act=take]'); if (b) b.click(); }); await p.waitForTimeout(800);
  await p.evaluate(() => { const c = window.stackingCats; c.g.queue = []; c.S.addCat; });
  // events: every kind
  for (const ev of ['shop', 'shrine', 'rest', 'deal', 'train', 'fountain']) {
    await p.evaluate((ev) => { const c = window.stackingCats, g = c.g; g.run.coins = 400; for (let i = 0; i < 600; i++) { g.event = null; g.wave = 3 + (i % 40); g.rnd = Math.random; const e = c.S.rollEvent(g); if (e && e.id === ev) { g.event = e; break; } } c.ui.showEvent(); }, ev);
    await p.waitForTimeout(300);
    await p.evaluate(() => { const el = document.querySelector('.card.ev'); if (el) el.click(); }); await p.waitForTimeout(400);
  }
  await p.evaluate(() => { const c = window.stackingCats; c.g.run.kills = 123; c.g.run.dmg = 99999; c.g.run.biggest = 456; c.g.run.earned = 321; c.ui.showFinale(); }); await p.waitForTimeout(500);
  await p.evaluate(() => { const c = window.stackingCats; c.ui.showOver(['mochi', 'yuki']); }); await p.waitForTimeout(3500);
  const miss = await p.evaluate(() => [...window.stackingCats.i18nMissing]);
  fs.writeFileSync(process.argv[2] || 'i18n_missing.json', JSON.stringify(miss, null, 1));
  console.log('missing', miss.length, 'errors', errs.slice(0, 8).join(' | '));
  await b.close();
})();
