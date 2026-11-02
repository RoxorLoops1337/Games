// Drop the Bass round 5 in a real browser: title language row clear of the logo, heroes and buttons (four languages, four screen shapes), quick mute
// (title, pause, profile, AudioFx.mute, 44 px), import from the title (fresh profiles only), friend invite link and one-time confirm, copy invite link,
// Offline chip, codex boss phases, reduce motion default from the system preference.
// Skips with exit 0 without Playwright (DTB_BROWSER_SKIP=1 too).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass r5 browser: SKIPPED (' + why + ')'); process.exit(0); };
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
const base = 'http://localhost:' + srv.address().port + '/drop_the_bass/';
const boot = async (ctx, query) => {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(base + (query || ''));
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  return page;
};
const hubSetup = (page) => page.evaluate(() => {
  const a = __dtb.app, p = a.profile; p.tutorial.done = true; p.story.intro = true; p.name = 'Roxor Fan';
  for (const id of ['lang_offer', 'hint_weekly', 'hint_setlist', 'hint_wardrobe', 'hint_studio_scene', 'hint_skin_buy', 'offline_ready']) p.tutorial.hints[id] = true;
  p.story.worlds.garage = true; p.prog.garage.cleared = true; p.login.lastDay = 99999; p.login.claimedDay = 99999; p.whatsNewSeen = 99; a.sessionGreeted = true;
  for (const b of ['compressor', 'noisegate', 'reverb', 'djglitch', 'playback', 'lowpass', 'silence']) p.seen.bosses[b] = true;
  a.save(); a.openHub('tour');
});
try {
  // ---- 1. title language row: clear of the logo band above and the heroes below, in every language and screen shape
  for (const [name, vp] of [['390x844', { width: 390, height: 844 }], ['360x740', { width: 360, height: 740 }], ['1280x720', { width: 1280, height: 720 }], ['844x390', { width: 844, height: 390 }]]) {
    for (const lang of ['en-US', 'da-DK', 'nl-NL', 'de-DE']) {
      const ctx = await browser.newContext({ viewport: vp, hasTouch: true, locale: lang });
      const page = await boot(ctx);
      const r = await page.evaluate(() => {
        const v = __dtb.app.view, row = document.querySelector('.lang-row').getBoundingClientRect(), tap = document.querySelector('.tap').getBoundingClientRect();
        return { top: row.top, bottom: row.bottom, left: row.left, right: row.right, oy: v.oy, s: v.s, tapTop: tap.top, cw: v.cw, labels: [...document.querySelectorAll('.lang-row button')].map((b) => b.textContent).join() };
      });
      // art coordinates (540x960, centred): the logo ends near y 370, the heroes' hair starts near y 475
      need(r.top >= r.oy + 366 * r.s && r.bottom <= r.oy + 480 * r.s, name + ' ' + lang + ': language row sits between logo and heroes (' + Math.round(r.top) + '-' + Math.round(r.bottom) + ' vs ' + Math.round(r.oy + 366 * r.s) + '-' + Math.round(r.oy + 480 * r.s) + ')');
      need(r.left >= 0 && r.right <= r.cw && r.labels === 'English,Dansk,Nederlands,Deutsch', name + ' ' + lang + ': the four names are on screen');
      await page.mouse.click(vp.width / 2, vp.height / 2); await page.waitForTimeout(300);
      const m = await page.evaluate(() => { const row = document.querySelector('.lang-row').getBoundingClientRect(), mb = [...document.querySelectorAll('.menu button, .link-btn')].map((b) => b.getBoundingClientRect()); return mb.every((b) => b.top >= row.bottom - 1) && mb.length >= 3; });
      need(m, name + ' ' + lang + ': the menu buttons are below the language row');
      await ctx.close();
    }
  }

  // ---- 6. quick mute (title and pause), 44 px, profile and AudioFx
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
    const page = await boot(ctx);
    const st = () => page.evaluate(() => { const b = document.querySelector('[data-mute]'); const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), muted: __dtb.app.profile.settings.muted, fx: __dtb.app.audio.getVolume().muted, onTitle: __dtb.app.screen, right: r.right, top: r.top }; });
    let s = await st();
    need(s.w >= 43.5 && s.h >= 43.5, 'title mute button is at least 44 px (' + s.w + 'x' + s.h + ')');
    need(s.label === 'Mute sound' && s.pressed === 'false' && s.muted === false && s.fx === false, 'starts unmuted');
    need(s.right <= 390 && s.top >= 0, 'title mute button is on screen');
    await page.click('[data-mute]'); s = await st();
    need(s.muted === true && s.fx === true && s.label === 'Unmute sound' && s.pressed === 'true' && s.onTitle === 'title', 'tap mutes: profile, AudioFx, label (and it did not start the menu)');
    await page.evaluate(() => __dtb.app.saveNow());
    need(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /drop_the_bass/.test(k) && !/lang|bak|corrupt/.test(k)))).settings.muted === true), 'muted is saved in the profile');
    await page.reload(); await page.waitForFunction(() => window.__dtbReady);
    s = await st(); need(s.muted === true && s.fx === true && s.pressed === 'true', 'muted survives a reload');
    // pause menu
    await hubSetup(page);
    await page.evaluate(() => { __dtb.app.profile.settings.skipSetlist = true; __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0 }); }); await page.waitForTimeout(900);
    await page.evaluate(() => { const b = __dtb.app.battle; __dtb.app.hooks.onPause(b); }); await page.waitForTimeout(300);
    s = await st(); need(s.w >= 43.5 && s.h >= 43.5 && s.pressed === 'true', 'pause mute button: 44 px and shows the saved state');
    await page.click('.modal [data-mute]'); s = await st(); need(s.muted === false && s.fx === false && s.label === 'Mute sound', 'pause mute toggles back on');
    await ctx.close();
  }

  // ---- 4. import from the title: fresh profiles only, then the hub
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
    const page = await boot(ctx);
    await page.mouse.click(195, 540); await page.waitForTimeout(300);
    need(await page.locator('[data-title-import]').count() === 1 && /Import your save/.test(await page.locator('[data-title-import]').innerText()), 'fresh profile: the import link is on the title menu');
    const rb = await page.evaluate(() => document.querySelector('[data-title-import]').getBoundingClientRect().height); need(rb >= 43.5, 'import link tap height ' + rb);
    const code = await page.evaluate(() => { const a = __dtb.app, M2 = __dtb.M; const p = M2.newProfile(Date.now()); p.fame = 7; p.records = 1234; p.tutorial.done = true; p.story.intro = true; return M2.exportCode(p); });
    await page.click('[data-title-import]'); await page.waitForTimeout(200);
    need(await page.locator('.modal textarea').count() === 1, 'it opens the import modal');
    await page.fill('.modal textarea', code); await page.click('text=Check code'); await page.waitForTimeout(200);
    await page.click('text=Replace my save'); await page.waitForTimeout(600);
    need(await page.evaluate(() => __dtb.app.screen === 'hub' && __dtb.app.profile.records === 1234 && __dtb.app.profile.fame === 7), 'after a successful import the hub opens with the imported save');
    await page.evaluate(() => { __dtb.app.profile.stats.runs = 3; __dtb.app.showTitle(); }); await page.mouse.click(195, 540); await page.waitForTimeout(300);
    need(await page.locator('[data-title-import]').count() === 0, 'a profile that has played runs does not show the import link');
    await ctx.close();
  }

  // ---- 3. friend invite
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
    const page = await boot(ctx, '?friend=Jasmin%20Fan&keep=1');
    await page.waitForSelector('[data-friend-invite]', { timeout: 4000 });
    need(await page.locator('[data-friend-invite]').getAttribute('data-friend-invite') === 'Jasmin Fan' && /Add Jasmin Fan as a friend\?/.test(await page.locator('.modal').innerText()), 'confirm asks "Add Jasmin Fan as a friend?"');
    need(await page.evaluate(() => !location.search.includes('friend') && location.search === '?keep=1'), 'the friend parameter is removed from the address, other parameters stay');
    need(await page.evaluate(() => __dtb.app.profile.friends.length === 0), 'nothing is added before the tap');
    await page.click('[data-friend-yes]'); await page.waitForTimeout(300);
    need(await page.evaluate(() => __dtb.app.profile.friends.join() === 'Jasmin Fan'), 'Add friend puts the name in profile.friends');
    await page.reload(); await page.waitForFunction(() => window.__dtbReady); await page.waitForTimeout(900);
    need(await page.locator('[data-friend-invite]').count() === 0, 'no second question after a reload (the parameter is gone)');
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
    const p2 = await boot(c2, '?friend=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
    await p2.waitForSelector('[data-friend-invite]', { timeout: 4000 });
    need(await p2.evaluate(() => { const v = document.querySelector('[data-friend-invite]').dataset.friendInvite; return !/[<>=()]/.test(v) && v.length <= 16 && !document.querySelector('.modal img'); }), 'a hostile name is sanitised and never becomes markup');
    await p2.click('[data-friend-no]'); await p2.waitForTimeout(200);
    need(await p2.evaluate(() => __dtb.app.profile.friends.length === 0 && !document.querySelector('.modal-bg')), 'No thanks adds nobody and closes');
    await c2.close();
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
    const p3 = await boot(c3, '?friend=%20%25%24'); await p3.waitForTimeout(900);
    need(await p3.locator('[data-friend-invite]').count() === 0 && await p3.evaluate(() => !location.search.includes('friend')), 'an empty name asks nothing and is still removed from the address');
    // copy invite link (clipboard) and the prompt fallback
    await c3.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
    await hubSetup(p3);
    await p3.evaluate(async () => { (await import('./js/ui_hub.js')).boardModal(__dtb.app, 'daily', 'Daily'); }); await p3.waitForTimeout(500);
    await p3.click('[data-copy-invite]'); await p3.waitForTimeout(400);
    const clip = await p3.evaluate(() => navigator.clipboard.readText());
    need(clip === new URL(base).origin + '/drop_the_bass/?friend=Roxor%20Fan', 'Copy invite link puts <origin>/drop_the_bass/?friend=<name> on the clipboard: ' + clip);
    need(/Invite link copied/.test(await p3.evaluate(() => document.querySelector('.toast') ? document.querySelector('.toast').textContent : '')), 'a toast confirms');
    let prompted = null; p3.on('dialog', async (d) => { prompted = d.defaultValue(); await d.dismiss(); });
    await p3.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
    await p3.click('[data-copy-invite]'); await p3.waitForTimeout(300);
    need(prompted === clip, 'without a clipboard a prompt shows the link');
    await p3.evaluate(() => { __dtb.app.profile.name = ''; document.querySelector('.modal-bg').remove(); });
    await p3.evaluate(async () => { (await import('./js/ui_hub.js')).boardModal(__dtb.app, 'daily', 'Daily'); }); await p3.waitForTimeout(400);
    need(await p3.locator('[data-copy-invite]').count() === 0, 'no name: no Copy invite link button');
    await c3.close();
  }

  // ---- 5 + 2. offline chip, codex boss phases
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'de-DE' });
    const page = await boot(ctx);
    await hubSetup(page); await page.waitForTimeout(400);
    need(await page.evaluate(() => { const c = document.querySelector('.offline-chip'); return !!c && getComputedStyle(c).display === 'none'; }), 'online: the Offline chip exists but is hidden');
    await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(200);
    need(await page.evaluate(() => { const c = document.querySelector('.offline-chip'); const r = c.getBoundingClientRect(); return getComputedStyle(c).display !== 'none' && r.width > 20 && r.right <= 390 && /Offline/.test(c.textContent); }), 'offline: the chip shows on the hub header');
    await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(200);
    need(await page.evaluate(() => getComputedStyle(document.querySelector('.offline-chip')).display === 'none'), 'back online: the chip hides');
    await page.evaluate(async () => { (await import('./js/ui_hub.js')).codexModal(__dtb.app); });
    await page.evaluate(() => document.querySelector('.codex-seg').children[2].click()); await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const w = document.querySelector('.modal').getBoundingClientRect().right;
      const boxes = [...document.querySelectorAll('.bossphases')];
      return {
        n: boxes.length, over: boxes.some((b) => [...b.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > w + 1)), page: document.documentElement.scrollWidth,
        sil: (() => { const b = document.querySelector('[data-phases="silence"]'); return b ? { notches: b.querySelectorAll('.bp-notch').length, rows: b.querySelectorAll('.bp-row').length, pcts: [...b.querySelectorAll('.bp-pct')].map((x) => x.textContent).join() } : null; })(),
        comp: (() => { const b = document.querySelector('[data-phases="compressor"]'); return b ? [...b.querySelectorAll('.bp-row b')].map((x) => x.textContent).join('|') : ''; })(),
        practice: document.querySelectorAll('[data-practice]').length,
      };
    });
    need(info.n === 7 && info.sil && info.sil.notches === 4 && info.sil.rows === 7 && info.sil.pcts === '100%,66%,33%,9%', 'codex: Dr. Dead Air shows 4 notches and 7 effects: ' + JSON.stringify(info.sil));
    need(info.comp === 'Bollwerk|Raserei', 'codex in German: effect names are translated (' + info.comp + ')');
    need(!info.over && info.page <= 390, 'codex phases do not overflow at 390 px in German');
    need(info.practice === 7, 'Practice buttons are still there');
    await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); p = __dtb.app.profile; p.seen.bosses.silence = false; p.bossesSeen = {}; p.seen.bosses = {}; });
    await page.evaluate(async () => { (await import('./js/ui_hub.js')).codexModal(__dtb.app); });
    await page.evaluate(() => document.querySelector('.codex-seg').children[2].click()); await page.waitForTimeout(200);
    need(await page.evaluate(() => document.querySelectorAll('.bossphases').length === 0 && document.querySelectorAll('[data-boss].unk').length === 7), 'a boss that was not met shows no phases');
    await ctx.close();
  }

  // ---- 7. reduce motion default
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const page = await boot(ctx);
    need(await page.evaluate(() => __dtb.app.profile.settings.reduce === true && document.body.classList.contains('reduce')), 'fresh profile + system reduced motion: Reduce motion is on');
    await page.evaluate(() => { __dtb.app.profile.settings.reduce = false; __dtb.app.saveNow(); });
    await page.reload(); await page.waitForFunction(() => window.__dtbReady);
    need(await page.evaluate(() => __dtb.app.profile.settings.reduce === false), 'a stored choice (off) is never overridden on the next load');
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
    const p2 = await boot(c2); need(await p2.evaluate(() => __dtb.app.profile.settings.reduce === false), 'no system preference: off'); await c2.close();
  }
} finally { await browser.close(); srv.close(); }
if (errs.length) { console.error('drop_the_bass r5 browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass r5 browser: ' + n + ' checks passed');
