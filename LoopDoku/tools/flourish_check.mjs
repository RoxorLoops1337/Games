// Visual check of the "keep playing" moments in every skin: a long pack name in the HUD, a hot streak, the daily set
// completing and the next look nearly in reach. Usage: node tools/flourish_check.mjs [skin ...]  -> shots/flourish-<skin>-{hud,win}.jpeg
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.LD_BASE || 'http://localhost:5320';
let skins = process.argv.slice(2);
if (!skins.length) skins = ['neon', 'idol', 'comic', 'sticker', 'paper', 'studio', 'riso', 'jelly', 'watercolour', 'pixel'];
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const d = new Date(), pad = (x) => String(x).padStart(2, '0');
const today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const y = new Date(Date.now() - 864e5), yesterday = y.getFullYear() + '-' + pad(y.getMonth() + 1) + '-' + pad(y.getDate());
for (const skin of skins) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}/${skin}.html`, { waitUntil: 'load' });
  // a seasoned player: lots of packs open, a 4-win streak, 2 wins today, 3-day streak, close to the next look
  await page.evaluate(([sk, t, yd]) => {
    const solved = {};
    for (const p of ['easy', 'normal', 'hard']) for (let k = 1; k <= 10; k++) solved[p + '-' + k] = { stars: 3, bestMs: 60000 };
    localStorage.setItem('loopdoku_save_v1', JSON.stringify({ unlocked: ['neon', 'idol', sk], skin: sk, points: 270, wins: 30, streak: 4, bestStreak: 6,
      dayStreak: 3, lastDay: t, dayWins: { [t]: 2 }, supportLast: 30, solved }));
  }, [skin, today, yesterday]);
  await page.goto(`${base}/${skin}.html#title`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(root, 'shots', `flourish-${skin}-title.jpeg`), type: 'jpeg', quality: 78 });
  await page.evaluate(() => window.LDSKIN.start('melt-16'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(root, 'shots', `flourish-${skin}-hud.jpeg`), type: 'jpeg', quality: 78 });
  await page.evaluate(() => { const g = window.LDSKIN.game(); for (let r = 0; r < g.n; r++) g.place(r * g.n + g.p.sol[r]); });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.join(root, 'shots', `flourish-${skin}-win.jpeg`), type: 'jpeg', quality: 78 });
  console.log(skin, errs.length ? 'ERRORS ' + errs.join(' | ') : 'ok');
  await ctx.close();
}
// contact sheet
const p = await browser.newPage({ viewport: { width: 5 * 250 + 10, height: 3 * 552 + 10 } });
for (const [k, list] of [['a', skins.slice(0, 5)], ['b', skins.slice(5)]]) {
  if (!list.length) continue;
  const cell = (s, v) => `<div><img src="${base}/shots/flourish-${s}-${v}.jpeg"><b>${s} ${v}</b></div>`;
  await p.setContent('<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(5,240px);gap:10px;padding:10px}div{position:relative}img{width:240px;height:519px;display:block}b{position:absolute;top:2px;left:2px;background:#000;color:#ff0;font:700 12px monospace;padding:2px 4px}</style>'
    + ['title', 'hud', 'win'].map((v) => list.map((s) => cell(s, v)).join('')).join(''));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(root, 'shots', `flourish-sheet-${k}.jpeg`), type: 'jpeg', quality: 80 });
}
await browser.close();
