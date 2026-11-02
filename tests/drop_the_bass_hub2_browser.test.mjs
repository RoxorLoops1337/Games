// Drop the Bass hub round 2 in a real browser: first-time hints show once, Larger text and Colour-blind cues reach the DOM, the codex lists
// branches and synergies, the countdown cards exist, and none of it logs an error. Skips with exit 0 without Playwright (DTB_BROWSER_SKIP=1 too).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass hub2 browser: SKIPPED (' + why + ')'); process.exit(0); };
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
const errs = [];
const need = (c, m) => { if (!c) errs.push(m); };
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'en-US' })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto('http://localhost:' + srv.address().port + '/drop_the_bass/');
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  await page.evaluate(() => {
    const a = __dtb.app, p = a.profile; p.tutorial.done = true; p.story.intro = true; p.diamonds = 900; a.sessionGreeted = true; p.login.lastDay = 99999; p.login.claimedDay = 99999;
    p.tutorial.hints.lang_offer = true; p.tutorial.hints.hint_weekly = true;
    for (const w of ['garage', 'busk']) { p.story.worlds[w] = true; p.prog[w].cleared = true; }
    a.openHub('tour');
  });
  await page.waitForTimeout(300);
  // countdown text on both cards, with a unit
  const cds = await page.evaluate(() => [...document.querySelectorAll('[data-cd]')].map((n) => n.dataset.cd + ':' + n.textContent));
  need(cds.length === 2 && cds.every((c) => /Resets in \d+(d|h|m)/.test(c)), 'countdowns: ' + cds.join('|'));
  // first Studio visit: the Backstage hint shows, closes, and does not come back
  await page.click('.tab:has-text("Studio")');
  await page.waitForSelector('.hint-card', { timeout: 3000 });
  need(await page.evaluate(() => document.querySelector('.hint-card h2').textContent === 'Backstage'), 'studio hint title');
  await page.click('.hint-card .btn');
  await page.click('.tab:has-text("Tour")'); await page.click('.tab:has-text("Studio")'); await page.waitForTimeout(1200);
  need(!(await page.$('.hint-card')), 'studio hint shows once');
  // Band: wardrobe hint then the skin offer (900 diamonds)
  await page.click('.tab:has-text("Band")');
  await page.waitForSelector('.hint-card', { timeout: 3000 });
  need(await page.evaluate(() => document.querySelector('.hint-card h2').textContent === 'The Wardrobe'), 'wardrobe hint');
  await page.click('.hint-card .btn');
  await page.waitForSelector('.hint-card', { timeout: 3000 });
  need(await page.evaluate(() => document.querySelector('.hint-card h2').textContent === 'Something to buy'), 'skin offer hint');
  await page.click('.hint-card .btn');
  // settings: three new toggles; Larger text and Colour-blind cues set body classes
  await page.click('.tab:has-text("Tour")');
  await page.click('.iconbtn');
  const labels = await page.evaluate(() => [...document.querySelectorAll('.modal .toggle')].map((n) => n.firstChild.textContent));
  for (const l of ['Larger text', 'Colour-blind cues', 'Auto low graphics when slow']) need(labels.includes(l), 'setting ' + l);
  await page.evaluate(() => { for (const n of document.querySelectorAll('.modal .toggle')) if (['Larger text', 'Colour-blind cues'].includes(n.firstChild.textContent)) n.querySelector('button').click(); });
  need(await page.evaluate(() => document.body.classList.contains('bigtext') && document.body.classList.contains('colorblind') && __dtb.app.profile.settings.bigtext && __dtb.app.profile.settings.colorblind), 'body classes and profile follow the toggles');
  // codex: Paths shows all 24 branches, Pairs all 13 synergies, Bosses has both new bosses drawn
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); __dtb.app.profile.seen.bosses = { lowpass: true, silence: true }; });
  await page.evaluate(async () => { const m = await import('./js/ui_hub.js'); m.codexModal(__dtb.app); });
  const counts = await page.evaluate(() => { const seg = document.querySelector('.codex-seg'), out = {}; for (const [i, k] of [[2, 'bosses'], [3, 'branches'], [4, 'syn']]) { seg.children[i].click(); out[k] = [document.querySelectorAll('[data-branch]').length, document.querySelectorAll('[data-syn]').length, document.querySelectorAll('.codexgrid .cdx canvas').length, /undefined|null|NaN/.test(document.querySelector('.modal').innerText)]; } return out; });
  need(counts.branches[0] === 24, 'branches in codex: ' + counts.branches[0]);
  need(counts.syn[1] === 13, 'synergies in codex: ' + counts.syn[1]);
  need(counts.bosses[2] >= 7, 'boss canvases: ' + counts.bosses[2]);
  need(!counts.bosses[3] && !counts.branches[3] && !counts.syn[3], 'no undefined text in the codex');
} catch (e) { errs.push('TEST ERROR ' + e.message); }
await browser.close(); srv.close();
if (errs.length) { console.error('drop_the_bass hub2 browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass hub2 browser: ok');
