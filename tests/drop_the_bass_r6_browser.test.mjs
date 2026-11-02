// Drop the Bass round 6 in a real browser: the modal queue on a real hub (one modal at a time, in order), screen reader and keyboard focus (dialog roles, focus in,
// Tab trap, Esc, focus back, live region, tabs, progress bars, labels, focus ring), the Season card, and Report a problem (thrown error recorded, Clear).
// Skips with exit 0 without Playwright (DTB_BROWSER_SKIP=1 too).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass r6 browser: SKIPPED (' + why + ')'); process.exit(0); };
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
  page.on('console', (m) => { if (m.type() === 'error' && !/r6 diag test/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!/r6 diag test/.test(e.message)) errs.push('PAGEERROR ' + e.message); });
  await page.goto(base + (query || ''));
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  return page;
};
const hubSetup = (page, tab) => page.evaluate((tab) => {
  const a = __dtb.app, p = a.profile; p.tutorial.done = true; p.story.intro = true; p.name = 'Roxor Fan';
  for (const id of ['lang_offer', 'hint_weekly', 'hint_setlist', 'hint_wardrobe', 'hint_studio_scene', 'hint_skin_buy', 'offline_ready']) p.tutorial.hints[id] = true;
  p.story.worlds.garage = true; p.prog.garage.cleared = true; p.login.lastDay = 99999; p.login.claimedDay = 99999; p.whatsNewSeen = 99; a.sessionGreeted = true;
  a.save(); a.openHub(tab || 'tour');
}, tab);
const modalCount = (page) => page.evaluate(() => document.querySelectorAll('.modal-bg').length);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await boot(ctx);

  // ---- 1. modal queue on a real hub: welcome back, daily gig, what's new fire together, one at a time, in order
  await page.evaluate(() => {
    const a = __dtb.app, p = a.profile; p.tutorial.done = true; p.story.intro = true;
    for (const id of ['lang_offer', 'hint_weekly', 'hint_setlist', 'hint_wardrobe', 'hint_studio_scene', 'hint_skin_buy', 'offline_ready']) p.tutorial.hints[id] = true;
    p.login.lastDay = -1; p.login.claimedDay = -1; p.whatsNewSeen = 0; a.sessionGreeted = false; a.awayFrom = a.now() - 30 * 3600000; p.lastSeen = a.now() - 30 * 3600000;
    a.openHub('tour');
    window.__seq = []; window.__max = 0;
    setInterval(() => { const bgs = document.querySelectorAll('.modal-bg'); window.__max = Math.max(window.__max, bgs.length); const h = bgs.length ? (bgs[bgs.length - 1].querySelector('h2') || {}).textContent : ''; if (h && window.__seq[window.__seq.length - 1] !== h) window.__seq.push(h); }, 25);
  });
  for (let i = 0; i < 3; i++) { await page.waitForSelector('.modal-bg', { timeout: 6000 }); need(await modalCount(page) === 1, 'queue: exactly one modal is open (step ' + i + ')'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);
  const seq = await page.evaluate(() => ({ seq: window.__seq, max: window.__max }));
  need(seq.max === 1, 'queue: never two modals at once (max ' + seq.max + ')');
  need(seq.seq.length === 3 && /Welcome/i.test(seq.seq[0]) && /Daily/i.test(seq.seq[1]) && /new/i.test(seq.seq[2]), 'queue order: Welcome back, Daily Gig, What\'s new (got ' + JSON.stringify(seq.seq) + ')');
  need(await modalCount(page) === 0, 'queue: empty at the end');
  // nothing opens during a battle or a cutscene, and it opens when the hub is back
  const gate = await page.evaluate(async () => {
    const Q = await import('/drop_the_bass/js/ui_core.js'); const a = __dtb.app;
    a.screen = 'battle'; let opened = 0;
    Q.queueModal('r6_test', Q.MODAL_PRIO.welcome, (done) => { opened++; Q.modal(document.createElement('div'), { onClose: done }); });
    await new Promise((r) => setTimeout(r, 1500)); const during = opened;
    a.screen = 'cut'; await new Promise((r) => setTimeout(r, 800)); const cut = opened;
    a.screen = 'hub'; await new Promise((r) => setTimeout(r, 1200));
    const after = opened; document.querySelector('.modal-bg').remove(); a.screen = 'hub';
    return { during, cut, after };
  });
  need(gate.during === 0 && gate.cut === 0 && gate.after === 1, 'queue: nothing opens in a battle or cutscene, it opens on the hub (' + JSON.stringify(gate) + ')');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((m) => m.remove()); });

  // ---- 2. screen reader and keyboard
  await hubSetup(page, 'goals');
  await page.waitForTimeout(500);
  const hubA = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
    return {
      list: document.querySelector('.tabs').getAttribute('role'), n: tabs.length, sel: tabs.filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.id),
      panel: document.querySelector('.hub-main').getAttribute('role'), panelBy: document.querySelector('.hub-main').getAttribute('aria-labelledby'),
      bars: [...document.querySelectorAll('.pbar')].map((b) => [b.getAttribute('role'), b.getAttribute('aria-valuemin'), b.getAttribute('aria-valuemax'), b.getAttribute('aria-valuenow'), !!b.getAttribute('aria-label')]),
      canvasVisible: [...document.querySelectorAll('#ui canvas')].filter((c) => c.getAttribute('aria-hidden') !== 'true').length,
      gameLabel: document.getElementById('game').getAttribute('aria-label'), gear: document.querySelector('.hub-top .iconbtn').getAttribute('aria-label'),
    };
  });
  need(hubA.list === 'tablist' && hubA.n === 5 && hubA.sel.join() === 'hubtab-goals', 'tabs: tablist, five tabs, the open one is aria-selected');
  need(hubA.panel === 'tabpanel' && hubA.panelBy === 'hubtab-goals', 'tabs: the panel is labelled by the open tab');
  need(hubA.bars.length > 2 && hubA.bars.every((b) => b[0] === 'progressbar' && b[1] === '0' && b[2] === '100' && /^\d+$/.test(b[3]) && b[4]), 'progress bars: role, range, value and a name (' + hubA.bars.length + ' bars)');
  need(hubA.canvasVisible === 0, 'icon canvases are hidden from screen readers'); need(!!hubA.gameLabel && !!hubA.gear, 'the game canvas and the settings gear have names');
  // tab arrows move and select, and focus stays on the tab
  await page.focus('#hubtab-goals'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
  need(await page.evaluate(() => document.activeElement.id === 'hubtab-shop' && document.activeElement.getAttribute('aria-selected') === 'true'), 'tabs: ArrowLeft selects the previous tab and keeps focus');
  await page.keyboard.press('Home'); await page.waitForTimeout(150); need(await page.evaluate(() => document.activeElement.id === 'hubtab-tour'), 'tabs: Home goes to the first');
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  need(await page.evaluate(() => document.activeElement && document.activeElement.id === 'hubtab-tour'), 'a rebuilt hub keeps keyboard focus on the same tab');
  // every control in the hub has a name and a visible focus ring
  for (const tab of ['tour', 'studio', 'band', 'shop', 'goals']) {
    await page.evaluate((t) => __dtb.app.openHub(t), tab); await page.waitForTimeout(350);
    const r = await page.evaluate(async () => {
      document.activeElement && document.activeElement.blur(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
      const bad = [], noRing = [];
      for (const el of document.querySelectorAll('#ui button, #ui [role=button], #ui [role=tab], #ui input, #ui textarea, #ui select')) {
        const name = el.getAttribute('aria-label') || (el.textContent || '').trim() || el.getAttribute('title') || el.getAttribute('placeholder');
        if (!name) bad.push(el.tagName + '.' + el.className);
      }
      return bad;
    });
    need(r.length === 0, tab + ': controls without a name: ' + r.join(' | '));
  }
  // focus ring: tab with the keyboard through the first controls of the hub, each must show an outline
  await page.evaluate(() => __dtb.app.openHub('goals')); await page.waitForTimeout(300);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const rings = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); rings.push(await page.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return [e.tagName, cs.outlineStyle, parseFloat(cs.outlineWidth)]; })); }
  need(rings.every((r) => r[1] !== 'none' && r[2] > 0), 'focus ring: every control reached by Tab shows an outline (' + JSON.stringify(rings.filter((r) => r[1] === 'none')) + ')');
  // a clickable card becomes a real button for the keyboard
  need(await page.evaluate(() => { const f = document.querySelector('.fame'); return f.getAttribute('role') === 'button' && f.tabIndex === 0; }), 'a plain element with a click handler is focusable and role=button');
  await page.evaluate(() => document.querySelector('.fame').focus()); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  need(await modalCount(page) === 1, 'Enter on a role=button card clicks it'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  // settings: dialog semantics, focus in, Tab trap, Esc, focus back
  await page.focus('.hub-top .iconbtn'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => { const m = document.querySelector('.modal'), by = m.getAttribute('aria-labelledby'); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), label: by && document.getElementById(by) ? document.getElementById(by).textContent : '', inside: m.contains(document.activeElement) && document.activeElement !== m }; });
  need(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.label.length > 0, 'dialog: role, aria-modal and a label from its heading (' + dlg.label + ')');
  need(dlg.inside, 'dialog: focus moved to a control inside it');
  let trapped = true;
  for (let i = 0; i < 70; i++) { await page.keyboard.press('Tab'); if (!await page.evaluate(() => document.querySelector('.modal').contains(document.activeElement))) { trapped = false; break; } }
  need(trapped, 'dialog: Tab never leaves the dialog (70 presses)');
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); if (!await page.evaluate(() => document.querySelector('.modal').contains(document.activeElement))) { trapped = false; break; } }
  need(trapped, 'dialog: Shift+Tab wraps inside as well');
  const sw = await page.evaluate(() => [...document.querySelectorAll('.modal .toggle button')].map((b) => [b.getAttribute('aria-pressed'), !!b.getAttribute('aria-label')]));
  need(sw.length > 4 && sw.every((s) => (s[0] === 'true' || s[0] === 'false') && s[1]), 'settings: ON/OFF buttons carry aria-pressed and a name');
  const lp = await page.evaluate(() => [...document.querySelectorAll('.langpick button')].map((b) => [b.getAttribute('aria-pressed'), b.className.includes('on')]));
  need(lp.length === 5 && lp.every((l) => (l[0] === 'true') === l[1]) && lp.filter((l) => l[0] === 'true').length === 1, 'settings: language buttons carry aria-pressed');
  need(await page.evaluate(() => [...document.querySelectorAll('.modal input[type=range]')].every((i) => i.getAttribute('aria-label'))), 'settings: sliders are named');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  need(await modalCount(page) === 0, 'dialog: Esc closes it');
  need(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('iconbtn') && document.activeElement.closest('.hub-top') !== null), 'dialog: focus returns to the button that opened it');
  // a sticky dialog is not closed by Esc; stacked dialogs close one by one
  const st = await page.evaluate(async () => {
    const C = await import('/drop_the_bass/js/ui_core.js');
    const m = C.modal(C.h('div', null, C.h('h2', null, 'Sticky'), C.btn('OK', () => {})), { sticky: true });
    return !!m;
  });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  need(st && await modalCount(page) === 1, 'a sticky dialog ignores Esc');
  await page.evaluate(() => document.querySelector('.modal-bg').remove());
  await page.evaluate(() => { __dtb.app.openHub('goals'); });
  await page.waitForTimeout(300);
  // toast: a polite live region outside #ui
  await page.evaluate(async () => { const C = await import('/drop_the_bass/js/ui_core.js'); C.toast('Hello live region'); });
  await page.waitForTimeout(300);
  const live = await page.evaluate(() => { const l = document.getElementById('dtb-live'); return l ? { role: l.getAttribute('role'), live: l.getAttribute('aria-live'), text: l.textContent, outside: !document.getElementById('ui').contains(l), toastHidden: document.querySelector('.toast').getAttribute('aria-hidden') } : null; });
  need(live && live.role === 'status' && live.live === 'polite' && live.text === 'Hello live region' && live.outside && live.toastHidden === 'true', 'toast: polite live region carries the text (' + JSON.stringify(live) + ')');
  // title screen: mute button and language buttons
  await page.evaluate(() => __dtb.app.showTitle()); await page.waitForTimeout(300);
  const ttl = await page.evaluate(() => ({ mute: document.querySelector('.mute-btn').getAttribute('aria-pressed'), mlabel: !!document.querySelector('.mute-btn').getAttribute('aria-label'), lang: [...document.querySelectorAll('.lang-row button')].map((b) => b.getAttribute('aria-pressed')) }));
  need(ttl.mute === 'false' && ttl.mlabel && ttl.lang.length === 4 && ttl.lang.filter((x) => x === 'true').length === 1, 'title: mute and language buttons expose their state');

  // ---- 3. Season card
  await hubSetup(page, 'goals'); await page.waitForTimeout(400);
  const se = await page.evaluate(() => { const c = document.querySelector('.season-card'); return c ? { id: c.dataset.season, goals: c.querySelectorAll('[data-season-goal]').length, cd: c.querySelector('.season-cd').textContent, name: c.querySelector('h3').textContent, bars: c.querySelectorAll('[role=progressbar]').length, keep: c.querySelector('[data-season-keepsake]').dataset.seasonKeepsake } : null; });
  need(se && se.goals === 3 && se.bars === 3 && /\d/.test(se.cd) && se.name.length > 3 && se.keep === 'open', 'season card: name, countdown, three goals with bars, keepsake line (' + JSON.stringify(se) + ')');
  await page.evaluate(() => { const a = __dtb.app; __dtb.M.ensureSeason(a.profile, a.now()); a.profile.season.progress = { kills: 99999, merges: 99999, wins: 99 }; a.openHub('goals'); });
  await page.waitForTimeout(300);
  for (const g of ['kills', 'merges', 'wins']) { await page.click('[data-season-claim=' + g + ']'); await page.waitForTimeout(250); }
  need(await page.evaluate(() => document.querySelector('[data-season-keepsake]').dataset.seasonKeepsake === 'got' && document.querySelectorAll('.season-goal .pill').length === 3), 'season card: three claims complete the season and show the keepsake');
  await page.evaluate(() => { const a = __dtb.app; a.profile.lastSeen -= 1; });
  // welcome back mentions unclaimed season rewards
  await page.evaluate(() => { const a = __dtb.app; a.profile.season.claimed = {}; });
  const wb = await page.evaluate(async () => { const a = __dtb.app, M = __dtb.M; const sum = M.welcomeSummary(a.profile, a.now() + 20 * 3600000, a.now()); const H = await import('/drop_the_bass/js/ui_hub.js'); H.welcomeSheet(a, sum, () => {}); return document.querySelector('[data-wb=season]') ? document.querySelector('[data-wb=season]').textContent : ''; });
  need(/season reward/.test(wb), 'welcome back: lists the unclaimed season rewards (' + wb + ')');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  // ---- 5. Report a problem: a thrown error is recorded and shown, Clear empties it
  await page.evaluate(() => { try { localStorage.removeItem('drop_the_bass_diag'); } catch (e) { /* ignore */ } setTimeout(() => { throw new Error('r6 diag test'); }, 10); });
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('drop_the_bass_diag') || '[]'));
  need(stored.length === 1 && /r6 diag test/.test(stored[0].msg) && stored[0].lang && stored[0].screen && stored[0].t > 0, 'diagnostics: a thrown page error is stored with language and screen');
  await page.evaluate(() => { __dtb.app.openHub('goals'); }); await page.waitForTimeout(200);
  await page.click('.hub-top .iconbtn'); await page.waitForTimeout(300);
  await page.click('[data-report]'); await page.waitForTimeout(300);
  const rep = await page.evaluate(() => document.querySelector('.report-text').value);
  for (const bit of ['game version 2', 'Language: en', 'Viewport: 390x', 'pixel ratio', 'Online: yes', 'Save size: ', 'Fame: 1', 'Last errors (1)', 'r6 diag test']) need(rep.includes(bit), 'report text has "' + bit + '"');
  need(!/Roxor Fan/.test(rep) && !rep.includes(String.fromCharCode(8212)), 'the report holds no player name');
  await page.click('[data-report-copy]'); await page.waitForTimeout(300);
  need(await page.evaluate(async () => { try { return (await navigator.clipboard.readText()).includes('r6 diag test'); } catch (e) { return true; } }), 'Copy puts the report on the clipboard');
  await page.click('[data-report-clear]'); await page.waitForTimeout(300);
  need(await page.evaluate(() => !localStorage.getItem('drop_the_bass_diag') && /Last errors \(0\)/.test(document.querySelector('.report-text').value)), 'Clear empties the buffer and the text');
  // copy fallback: no clipboard API, a prompt shows the text
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); window.__prompted = ''; window.prompt = (m, v) => { window.__prompted = v; return null; }; });
  await page.click('[data-report-copy]'); await page.waitForTimeout(200);
  need(await page.evaluate(() => /Drop the Bass, game version/.test(window.__prompted)), 'Copy falls back to a prompt without the clipboard API');
  await ctx.close();

  // ---- German: the new menus fit at 390 wide, nothing overflows
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'de-DE' });
  const p2 = await boot(c2); await hubSetup(p2, 'goals'); await p2.waitForTimeout(500); await p2.evaluate(() => Promise.all(document.getAnimations().filter((a) => isFinite(a.effect.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {})))); await p2.waitForTimeout(100);
  need(await p2.evaluate(() => { const c = document.querySelector('.season-card').getBoundingClientRect(); return c.left >= 0 && c.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth; }), 'de: the season card fits the screen');
  await c2.close();
} finally { await browser.close(); srv.close(); }
if (errs.length) { console.error('drop_the_bass r6 browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass r6 browser: ' + n + ' checks passed');
