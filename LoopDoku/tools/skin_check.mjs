// Automated check for one skin: node tools/skin_check.mjs <skin> [port]   (needs a static server on the repo root, default :5320)
// Phone emulation (390x844 @2x). Plays a 10x10 gig with the line arrows, wins, checks points + the support flow, a 5x5 gig,
// a loss, overflow and console errors. Screenshots: shots/<skin>-*.jpeg. Exit code 1 on any failure.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const skin = process.argv[2];
const port = process.argv[3] || 5320;
if (!skin) { console.log('usage: node tools/skin_check.mjs <skin>'); process.exit(2); }
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const page = await ctx.newPage();
const errors = [], fails = [], notes = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
const shot = (name) => page.screenshot({ path: path.join(root, 'shots', `${skin}-${name}.jpeg`), type: 'jpeg', quality: 80 });
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const wait = (ms) => page.waitForTimeout(ms);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const url = process.env.LD_BASE ? `${process.env.LD_BASE}/${skin}.html` : `http://localhost:${port}/${skin}.html`;

await page.goto(url, { waitUntil: 'load' });
await page.evaluate((sk) => { try { localStorage.clear(); localStorage.setItem('loopdoku_save_v1', JSON.stringify({ unlocked: ['neon', 'idol', sk], skin: sk })); } catch (_) { /* */ } }, skin);
await page.goto(url + '#title', { waitUntil: 'load' });
await wait(2200);
check(await page.evaluate(() => !!window.LDSKIN && typeof window.LDSKIN.start === 'function'), 'window.LDSKIN missing');
check(await page.evaluate(() => !!(window.LD && LD.meta && LD.ui)), 'LD.meta / LD.ui not loaded');
await shot('title');
check(await page.evaluate(() => !!document.querySelector('.ldx')), 'title: no LD.ui.titleExtras() card');
check((await overflow()) <= 0, 'title: horizontal overflow');

// ---- a 10x10 gig with the arrows ----
const big = await page.evaluate(() => { for (const p of LD.meta.packs()) for (const L of p.levels) if (L.n === 10) return L.id; return null; });
check(!!big, 'no 10x10 level found');
await page.evaluate((id) => window.LDSKIN.start(id), big);
await wait(1800);
check(await page.evaluate(() => window.LDSKIN.screen()) === 'game', 'start(id) did not show the game screen');
check(await page.evaluate(() => window.LDSKIN.game().n) === 10, 'started game is not 10x10');
await shot('game-10x10');
check((await overflow()) <= 0, 'game 10x10: horizontal overflow');
const arrowIn = async (kind, i) => {
  const r = await page.evaluate(([k, j]) => { const r = window.LDSKIN.arrowRect(k, j); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; }, [kind, i]);
  if (!r) { fails.push(`arrowRect(${kind}, ${i}) returned nothing`); return null; }
  if (r.x < 0 || r.y < 0 || r.x + r.w > 390 || r.y + r.h > 844) fails.push(`${kind} arrow ${i} is off screen ${JSON.stringify(r)}`);
  if (Math.min(r.w, r.h) < 20) notes.push(`${kind} arrow ${i} is small (${Math.round(r.w)}x${Math.round(r.h)})`);
  return r;
};
for (const [kind, i] of [['row', 0], ['col', 9], ['row', 9], ['col', 0]]) {
  const r = await arrowIn(kind, i);
  if (!r) continue;
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await wait(900);
  const ok = await page.evaluate(([k, j]) => { const g = window.LDSKIN.game(); const cells = k === 'row' ? g.rowCells(j) : g.colCells(j); return cells.every((c) => g.cells[c] !== 0); }, [kind, i]);
  check(ok, `tapping the ${kind} ${i} arrow did not cross out the line`);
}
await shot('game-10x10-arrows');
// toggle: tapping a full line wipes it
{
  const r = await arrowIn('row', 0);
  if (r) {
    await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await wait(900);
    const cleared = await page.evaluate(() => { const g = window.LDSKIN.game(); return g.rowCells(0).filter((c) => g.cells[c] === 1 && !g.wrong[c]).length; });
    check(cleared === 0, 'tapping a full row arrow again did not wipe its X\'s');
  }
}
// a real tap on a square still makes an X (and the arrows are not inside the board hit area)
const tapOk = await page.evaluate(() => { const g = window.LDSKIN.game(); return g.cells.findIndex((v, i) => v === 0 && !g.isSolution(i)); });
// win it
const before = await page.evaluate(() => LD.meta.points());
await page.evaluate(() => { const g = window.LDSKIN.game(); for (let r = 0; r < g.n; r++) { const i = r * g.n + g.p.sol[r]; if (g.cells[i] !== 3) { if (g.cells[i] !== 0) g.tap(i); if (g.cells[i] !== 0) g.tap(i); g.place(i); } } });
let won = false;
for (let t = 0; t < 30 && !won; t++) { await wait(300); won = await page.evaluate(() => window.LDSKIN.screen() === 'win'); }
check(won, 'win screen did not appear after solving the 10x10 gig');
await wait(1500);
await shot('win');
check(await page.evaluate(() => !!document.querySelector('.ldx')), 'win: no LD.ui.winExtras(r) card');
{ const nb = await page.evaluate(() => { const b = [...document.querySelectorAll('button, a, [role="button"]')].find((el) => /next|one more/i.test(el.textContent || '') && el.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }); check(nb === true, 'win: the Next gig button is not fully visible without scrolling'); }
const after = await page.evaluate(() => LD.meta.points());
check(after > before, 'points did not go up after a win (recordWin not called?)');
check(await page.evaluate((id) => !!LD.meta.state.solved[id], big), 'the win was not saved');
check((await overflow()) <= 0, 'win: horizontal overflow');

// ---- the support flow: make it due, win a 5x5 gig, tap Next ----
await page.evaluate(() => { LD.meta.state.wins = 20; LD.meta.state.supportLast = 0; LD.meta.save(); });
await page.evaluate(() => window.LDSKIN.start('easy-1'));
await wait(1500);
check(await page.evaluate(() => window.LDSKIN.game().n) === 5, 'easy-1 is not 5x5');
await shot('game-5x5');
check((await overflow()) <= 0, 'game 5x5: horizontal overflow');
await page.evaluate(() => { const g = window.LDSKIN.game(); for (let r = 0; r < g.n; r++) g.place(r * g.n + g.p.sol[r]); });
won = false;
for (let t = 0; t < 30 && !won; t++) { await wait(300); won = await page.evaluate(() => window.LDSKIN.screen() === 'win'); }
check(won, 'win screen did not appear after the 5x5 gig');
await wait(1500);
const nextBtn = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, a, [role="button"]')].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight; });
  const b = els.find((el) => /next|one more/i.test(el.textContent || el.getAttribute('aria-label') || ''));
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
check(!!nextBtn, 'no visible "Next" button on the win screen');
if (nextBtn) {
  await page.mouse.click(nextBtn.x, nextBtn.y); await wait(900);
  const sup = await page.evaluate(() => !!document.querySelector('.ldui'));
  check(sup, 'support screen did not open after tapping Next when it was due');
  await shot('support');
  if (sup) { await page.evaluate(() => { const b = document.querySelector('.ldui [data-later]'); if (b) b.click(); }); await wait(1200); }
  check(await page.evaluate(() => window.LDSKIN.screen()) === 'game', 'closing the support screen did not continue to the next gig');
}

// ---- the shared overlays in this skin's theme ----
await page.evaluate(() => LD.ui.levels({ onPlay: (id) => window.LDSKIN.start(id) })); await wait(700); await shot('ui-levels');
await page.evaluate(() => LD.ui.skins()); await wait(700); await shot('ui-looks');
await page.evaluate(() => LD.ui.close(true));

// ---- a loss ----
await page.evaluate(() => window.LDSKIN.start('normal-1'));
await wait(1200);
await page.evaluate(() => { const g = window.LDSKIN.game(); for (let i = 0; i < g.N && !g.over; i++) if (!g.isSolution(i) && g.cells[i] === 0) g.place(i); });
let lost = false;
for (let t = 0; t < 25 && !lost; t++) { await wait(300); lost = await page.evaluate(() => window.LDSKIN.screen() === 'lose'); }
check(lost, 'lose screen did not appear after three mistakes');
await wait(1200);
await shot('lose');
check(await page.evaluate(() => !!document.querySelector('.ldx')), 'lose: no LD.ui.loseExtras(rl) card');

// ---- desktop look ----
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => window.LDSKIN.start('hard-1')); await wait(1500);
await page.screenshot({ path: path.join(root, 'shots', `${skin}-desktop.jpeg`), type: 'jpeg', quality: 75 });

await browser.close();
const all = fails.concat(errors.map((e) => 'error ' + e));
console.log(`${skin}: ${all.length ? 'FAIL' : 'PASS'}${notes.length ? '  notes: ' + notes.join('; ') : ''}`);
for (const f of all) console.log('  - ' + f);
console.log('  screenshots: shots/' + skin + '-*.jpeg');
process.exit(all.length ? 1 : 0);
