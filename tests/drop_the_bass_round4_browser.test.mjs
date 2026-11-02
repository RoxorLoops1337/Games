// Drop the Bass round 4 in a real browser: Next steps card and its ticks from battle events, Welcome back (fake clock), What's new once per version,
// streak chip, desktop shortcuts only with a fine pointer, language-aware page text, and Practice a boss (no rewards, profile restored).
// Skips with exit 0 without Playwright (DTB_BROWSER_SKIP=1 too).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass round4 browser: SKIPPED (' + why + ')'); process.exit(0); };
if (process.env.DTB_BROWSER_SKIP === '1') skip('DTB_BROWSER_SKIP=1');
let pw = null;
for (const base of [ROOT, '/opt/node-tools', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
  for (const dir of [base, path.join(base, 'node_modules')]) { try { pw = createRequire(path.join(dir, 'x.js'))('playwright'); if (pw && pw.chromium) break; } catch (e) { pw = null; } }
  if (pw) break;
}
if (!pw) skip('playwright not found');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p.startsWith('/api/')) { res.writeHead(204); res.end(); return; }
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => srv.listen(0, r));
let browser;
try { browser = await pw.chromium.launch(); } catch (e) { srv.close(); skip('chromium would not start'); }
const errs = []; let n = 0;
const need = (c, m) => { n++; if (!c) errs.push(m); };
const url = 'http://localhost:' + srv.address().port + '/drop_the_bass/';
const boot = async (ctx) => {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  return page;
};
const setup = (page, extra) => page.evaluate((extraSrc) => {
  const a = __dtb.app, p = a.profile; p.tutorial.done = true; p.story.intro = true; p.diamonds = 300;
  for (const id of ['lang_offer', 'hint_weekly', 'hint_setlist', 'hint_wardrobe', 'hint_studio_scene', 'hint_skin_buy']) p.tutorial.hints[id] = true;
  p.story.worlds.garage = true; p.prog.garage.cleared = true; p.seen.bosses.compressor = true; p.seen.bosses.noisegate = true;
  p.login.lastDay = 99999; p.login.claimedDay = 99999; p.whatsNewSeen = 99;
  a.sessionGreeted = true; if (extraSrc) (new Function('return ' + extraSrc))()(p, a);
}, extra ? String(extra) : null);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
  const page = await boot(ctx);
  need(await page.title() === 'Drop the Bass' && await page.evaluate(() => document.getElementById('game').getAttribute('aria-label')) === 'Drop the Bass game canvas', 'English title and canvas label');

  // ---- Next steps card
  await setup(page); await page.evaluate(() => { const p = __dtb.app.profile; p.stats.heroUses = 3; __dtb.M.syncNextSteps(p); __dtb.app.openHub('tour'); });
  await page.waitForSelector('[data-nextsteps]');
  need(await page.evaluate(() => document.querySelectorAll('[data-nextsteps] .step').length === 7 && document.querySelectorAll('[data-nextsteps] .step.done').length === 1), 'seven steps, hero move ticked from stats');
  need(await page.evaluate(() => document.querySelector('[data-nextsteps] .sub').textContent === '1 of 7 tried'), 'progress text');
  await page.click('[data-steps-toggle]');
  need(await page.evaluate(() => !document.querySelector('[data-nextsteps] .step') && __dtb.app.profile.nextSteps.open === false), 'collapse hides the list and is remembered');
  await page.click('[data-steps-toggle]');
  // battle events tick the steps
  await page.evaluate(() => { __dtb.app.profile.settings.skipSetlist = true; __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0 }); });
  await page.waitForFunction(() => __dtb.app.screen === 'battle' && __dtb.app.battle);
  await page.evaluate(() => { const r = __dtb.app.battle.run; r.emit({ k: 'reroll' }); r.emit({ k: 'synergy', id: 'x' }); r.emit({ k: 'branch', id: 'kick', branch: 'b' }); __dtb.app.battle.pv.open = true; });
  await page.waitForTimeout(400);
  need(await page.evaluate(() => { const d = __dtb.app.profile.nextSteps.done; return d.reroll && d.synergy && d.branch && d.preview && d.hero; }), 'battle events and the preview tick the steps');
  await page.evaluate(() => { __dtb.app.battle.pv.open = false; const b = __dtb.app.battle; b.ended = true; __dtb.app.profile.resume = null; __dtb.app.battle = null; __dtb.app.openHub('tour'); });
  await page.waitForSelector('[data-nextsteps]');
  need(await page.evaluate(() => document.querySelectorAll('[data-nextsteps] .step.done').length === 5), 'five ticks on the card');
  await page.click('[data-steps-dismiss]');
  need(await page.evaluate(() => !document.querySelector('[data-nextsteps]') && __dtb.app.profile.nextSteps.dismissed), 'dismiss hides the card for good');
  await page.evaluate(() => { __dtb.app.profile.nextSteps.dismissed = false; for (const id of __dtb.M.NEXT_STEP_IDS) __dtb.M.markStep(__dtb.app.profile, id); __dtb.app.hub.render(); });
  need(await page.evaluate(() => !document.querySelector('[data-nextsteps]')), 'everything ticked: the card is gone');

  // ---- Welcome back, fake clock
  await setup(page, (p, a) => { p.lastSeen = Date.now() - 30 * 3600e3; p.login.lastDay = 0; p.login.streak = 5; p.login.claimedDay = 0; p.records = 100; p.whatsNewSeen = 99; a.sessionGreeted = false; a.awayFrom = Date.now() - 30 * 3600e3; });
  await page.evaluate(() => __dtb.app.openHub('tour'));
  await page.waitForSelector('.welcome-sheet');
  need(await page.evaluate(() => ['royalties', 'login', 'streak', 'daily', 'weekly', 'goal'].every((k) => document.querySelector('[data-wb="' + k + '"]'))), 'welcome sheet rows');
  need(await page.evaluate(() => /30 hours/.test(document.querySelector('.welcome-sheet .sub').textContent)), 'away time text');
  await page.click('.welcome-sheet .btn.green');
  await page.waitForTimeout(500);
  need(await page.evaluate(() => __dtb.app.profile.records > 100 && __dtb.app.profile.login.claimedDay !== 0 && !document.querySelector('.welcome-sheet')), 'collect pays royalties and claims the daily gig');
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); __dtb.app.openHub('tour'); });
  need(await page.evaluate(() => !document.querySelector('.welcome-sheet')), 'only once per session');
  // under 12 hours: the plain daily gig modal with the streak bonus line
  await setup(page, (p, a) => { p.login.lastDay = 0; p.login.streak = 3; p.login.claimedDay = 0; a.sessionGreeted = false; a.awayFrom = Date.now() - 2 * 3600e3; });
  await page.evaluate(() => __dtb.app.openHub('tour'));
  await page.waitForSelector('[data-streak-next]');
  need(await page.evaluate(() => !document.querySelector('.welcome-sheet') && /day 7/.test(document.querySelector('[data-streak-next]').textContent)), 'short absence: Daily Gig with the next streak bonus');
  // first launch (tutorial not done): nothing
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); const a = __dtb.app; a.profile.tutorial.done = false; a.sessionGreeted = false; a.awayFrom = Date.now() - 99 * 3600e3; a.openHub('tour'); });
  need(await page.evaluate(() => !document.querySelector('.modal-bg')), 'first launch: no welcome back');

  // ---- What's new once per version, also from Settings
  await setup(page, (p, a) => { p.whatsNewSeen = 0; p.lastSeen = Date.now(); p.login.lastDay = p.login.claimedDay = __dtb.M.dayOf(Date.now()); a.sessionGreeted = false; a.awayFrom = Date.now(); });
  await page.evaluate(() => __dtb.app.openHub('tour'));
  await page.waitForSelector('.whatsnew', { timeout: 3000 });
  need(await page.evaluate(() => document.querySelectorAll('.whatsnew li').length >= 4 && document.querySelectorAll('.whatsnew li').length <= 6), 'four to six bullet lines');
  await page.click('.whatsnew .btn');
  need(await page.evaluate(async () => { const g = (await import('./js/data_core.js')).GAME; return __dtb.app.profile.whatsNewSeen === g.version; }), 'seen version stored');
  await page.evaluate(() => { __dtb.app.sessionGreeted = false; __dtb.app.openHub('tour'); }); await page.waitForTimeout(800);
  need(!(await page.$('.whatsnew')), 'not shown again for the same version');
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); document.querySelector('.hub-top .iconbtn').click(); });
  await page.click('[data-whatsnew]');
  need(!!(await page.waitForSelector('.whatsnew', { timeout: 2000 })), 'reachable from Settings');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));

  // the Daily Gig comes first, What's new right after it closes
  await setup(page, (p, a) => { p.whatsNewSeen = 0; p.lastSeen = Date.now(); p.login.lastDay = 0; p.login.claimedDay = 0; p.login.streak = 0; a.sessionGreeted = false; a.awayFrom = Date.now(); });
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); __dtb.app.openHub('tour'); });
  await page.waitForSelector('[data-streak-next]');
  need(!(await page.$('.whatsnew')), 'What\'s new waits behind the Daily Gig');
  await page.click('.modal .btn.gold');
  await page.waitForSelector('.whatsnew', { timeout: 3000 });
  need(true, 'What\'s new after the Daily Gig');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));

  // ---- streak chip on the Goals tab
  await setup(page); await page.evaluate(() => { const p = __dtb.app.profile; p.login.lastDay = 99999; p.login.claimedDay = 99999; p.login.streak = 3; __dtb.app.openHub('goals'); });
  need(await page.evaluate(() => document.querySelector('[data-streak-chip="next"]') && /day 7/.test(document.querySelector('[data-streak-chip]').textContent)), 'Goals shows the next streak bonus');
  await page.evaluate(() => { const p = __dtb.app.profile; p.login.streak = 9; __dtb.app.hub.render(); });
  need(await page.evaluate(() => !!document.querySelector('[data-streak-chip="ready"]')), 'an old streak that already earned a bonus shows Claim');
  const d0 = await page.evaluate(() => __dtb.app.profile.diamonds);
  await page.evaluate(() => document.querySelector('[data-streak-chip="ready"] .btn').click()); await page.waitForTimeout(300);
  need(await page.evaluate((d0) => __dtb.app.profile.diamonds === d0 + 20 && __dtb.app.profile.login.bonus[7], d0), 'claimed once: +20 diamonds');

  // ---- language-aware page text
  await page.evaluate(() => __dtb.app.setLangPref('de')); await page.waitForTimeout(800);
  const deDict = await page.evaluate(async () => (await import('./js/lang/de.js')).default);
  need(await page.title() === deDict['page.title'] && await page.evaluate(() => document.getElementById('game').getAttribute('aria-label')) === deDict['page.canvas_label'] && deDict['page.canvas_label'] !== 'Drop the Bass game canvas', 'title and canvas label follow the language');
  await page.evaluate(() => __dtb.app.setLangPref('en')); await page.waitForTimeout(400);
  need(await page.title() === 'Drop the Bass', 'and back to English');

  // ---- Practice a boss
  await setup(page, (p) => { p.records = 777; p.diamonds = 300; });
  const before = await page.evaluate(() => { const a = __dtb.app; a.openHub('tour'); return JSON.stringify(Object.assign({}, a.profile, { lastActive: 0 })); });
  await page.evaluate(async () => { (await import('./js/ui_hub.js')).codexModal(__dtb.app); });
  await page.evaluate(() => [...document.querySelectorAll('.codex-seg button')].find((b) => /Bosses/.test(b.textContent)).click());
  need(await page.evaluate(() => [...document.querySelectorAll('[data-practice]')].map((b) => b.dataset.practice).join() === 'compressor,noisegate'), 'Practice only for bosses the player has met');
  await page.evaluate(() => document.querySelector('[data-practice="noisegate"]').click());
  await page.waitForFunction(() => __dtb.app.screen === 'battle' && __dtb.app.battle);
  need(await page.evaluate(() => { const r = __dtb.app.battle.run; return r.practice === 'noisegate' && r.world.id === 'busk' && r.wavesTotal === 1 && !!document.querySelector('[data-practice-badge]') && !__dtb.app.profile.resume; }), 'practice run on the stage of that boss, with the badge');
  need(await page.evaluate(() => { const r = __dtb.app.battle.run; const s = r.upcoming(1); return s.boss === 'noisegate' && s.bossScale === 1; }), 'the wave is the real boss wave');
  await page.evaluate(() => { const r = __dtb.app.battle.run; r.startWave(); for (let i = 0; i < 60; i++) r.advance(0.1); for (let k = 0; k < 600 && r.phase === 'wave'; k++) { while (r.choice) r.skipChoice(); for (const e of r.enemies.slice()) r.kill(e); r.advance(0.1); } });
  await page.waitForSelector('.practice-results', { timeout: 20000 });
  need(await page.evaluate(() => { const t = document.querySelector('[data-practice-time]'); return t && +t.dataset.practiceTime > 0 && +t.dataset.practiceTime < 30; }), 'results show the time to defeat');
  need(await page.evaluate(() => document.querySelector('.practice-results .res-title.win') && !document.querySelector('.rew')), 'win title, no rewards');
  await page.evaluate(() => [...document.querySelectorAll('.practice-results .btn')].pop().click()); await page.waitForTimeout(500);
  const after = await page.evaluate(() => JSON.stringify(Object.assign({}, __dtb.app.profile, { lastActive: 0 })));
  need(before === after, 'the profile is exactly as before practice');
  need(await page.evaluate(() => __dtb.app.screen === 'hub' && __dtb.app.profile.records === 777 && __dtb.app.profile.stats.runs === 0), 'back in the hub with no run counted');
  // a lost practice still ends cleanly
  await page.evaluate(() => __dtb.app.startRun({ mode: 'practice', boss: 'compressor' }));
  await page.waitForFunction(() => __dtb.app.battle && __dtb.app.battle.run.practice);
  await page.evaluate(() => { const r = __dtb.app.battle.run; r.stageHp = 1; r.startWave(); for (let i = 0; i < 3000 && r.phase === 'wave'; i++) r.advance(0.1); });
  await page.waitForSelector('.practice-results', { timeout: 20000 });
  need(await page.evaluate(() => !!document.querySelector('.practice-results .res-title.lose') && !document.querySelector('.practice-results .btn.red')), 'a lost practice shows Not yet and no revive');
  await page.evaluate(() => [...document.querySelectorAll('.practice-results .btn')][0].click()); await page.waitForTimeout(500);
  need(await page.evaluate(() => __dtb.app.battle && __dtb.app.battle.run.practice === 'compressor'), 'Try again starts a fresh practice');
  await ctx.close();

  // ---- desktop shortcuts: only with a fine pointer
  const desk = await browser.newContext({ viewport: { width: 1000, height: 800 }, locale: 'en-US' });
  const dp = await boot(desk); await setup(dp);
  await dp.evaluate(() => __dtb.app.showHowTo()); await dp.waitForSelector('.modal');
  need(await dp.evaluate(() => { const s = document.querySelector('[data-shortcuts]'); return s && s.querySelectorAll('kbd').length === 10 && /Space \/ Enter/.test(s.textContent) && /Pause/.test(s.textContent); }), 'desktop: shortcuts section with ten keys');
  await desk.close();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
  const pp = await boot(phone); await setup(pp);
  await pp.evaluate(() => __dtb.app.showHowTo()); await pp.waitForSelector('.modal');
  need(await pp.evaluate(() => !document.querySelector('[data-shortcuts]')), 'touch device: no shortcuts section');
  await phone.close();
} catch (e) { errs.push('EXCEPTION ' + (e && e.stack || e)); }
await browser.close(); srv.close();
if (errs.length) { console.log('drop_the_bass round4 browser FAILED:\n - ' + errs.join('\n - ')); process.exit(1); }
console.log('drop_the_bass round4 browser: ' + n + ' checks passed');
