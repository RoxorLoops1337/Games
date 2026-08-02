// Screenshot rig for The Birds & The Beasts.
//
// Drives the real game in Chromium and captures every screen, so a reviewer can
// LOOK at the thing instead of reading CSS and imagining it.
//
//   node .polish/shots.mjs <outDir> [desktop|mobile]
//
// Writes: 1title 2nest 3fight-early 4fight-mid 5hatch 6cull 7book 8over (.png)
// Prints any console/page errors it saw. Exits non-zero if the run got stuck.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = (process.argv[2] || '/tmp/bb-shots').replace(/\/$/, '');
const MOBILE = process.argv[3] === 'mobile';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage(MOBILE
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });

const errs = [];
page.on('pageerror', (e) => errs.push('' + e));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const on = (id) => page.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const click = (sel) => page.click(sel, { timeout: 2500 }).catch(() => {});
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await page.goto('file:///home/user/Games/birds_and_beasts/index.html');
await page.waitForTimeout(400);
await shot('1title');
await click('#bStart');

const seen = {};
let steps = 0;
for (; steps < 2200; steps++) {
  await page.waitForTimeout(25);
  if (await on('nest')) {
    if (!seen.nest) {
      await (await page.$$('#nGrid .card'))[0]?.click().catch(() => {});
      await page.waitForTimeout(120);
      await (await page.$$('#nGrid .card'))[1]?.click().catch(() => {});
      await page.waitForTimeout(160);
      await shot('2nest'); seen.nest = 1;
      await click('#bBook'); await page.waitForTimeout(350);
      await shot('7book');
      await click('#bBookBack'); await page.waitForTimeout(250);
    }
    await (await page.$$('#nGrid .card'))[0]?.click().catch(() => {});
    await page.waitForTimeout(50);
    await (await page.$$('#nGrid .card'))[1]?.click().catch(() => {});
    await page.waitForTimeout(50);
    await click('#bFight');
  } else if (await on('fight')) {
    const bench = await page.$$('#hand .card:not(.dead)');
    const btn = await page.$eval('#bEnd', (e) => e.textContent + '|' + e.disabled).catch(() => '');
    if (bench.length && btn.indexOf('true') >= 0) {
      await bench[0].click().catch(() => {});
    } else {
      if (!seen.f1) { await shot('3fight-prep'); seen.f1 = 1; }
      await click('#bEnd');
      await page.waitForTimeout(900);
      if (!seen.f2) { await shot('4fight-wave'); seen.f2 = 1; }
      const v = await page.$eval('#fVerdict', (e) => !e.hidden).catch(() => false);
      if (v && !seen.f3) { await shot('4fight-verdict'); seen.f3 = 1; }
      await click('#bEnd');
    }
  } else if (await on('hatch')) {
    await page.waitForTimeout(950);
    if (!seen.hatch) { await shot('5hatch'); seen.hatch = 1; }
    const picks = await page.$$('#hChild .pickwrap');
    if (picks.length) await picks[0].click().catch(() => {});
    await page.waitForTimeout(150);
    if (!seen.hatch2) { await shot('5hatch-picked'); seen.hatch2 = 1; }
    await click('#bHatchNext');
  } else if (await on('wild')) {
    if (!seen.wild) { await shot('9wild'); seen.wild = 1; }
    await (await page.$$('#wGrid .card'))[0]?.click().catch(() => {});
    await page.waitForTimeout(60);
    await click('#bWildTake');
  } else if (await on('cull')) {
    if (!seen.cull) { await shot('6cull'); seen.cull = 1; }
    await (await page.$$('#cGrid .card'))[0]?.click().catch(() => {});
    await page.waitForTimeout(60);
    await click('#bCull');
  } else if (await on('book')) {
    await click('#bBookBack');
  } else if (await on('over')) {
    await shot('8over');
    break;
  }
}

console.log(`${MOBILE ? 'mobile' : 'desktop'}: wrote screens to ${OUT} (${steps} steps)`);
console.log('screens captured:', Object.keys(seen).join(', ') || 'none');
console.log('console/page errors:', errs.length ? errs.slice(0, 8) : 'none');
await browser.close();
if (steps >= 2200) { console.error('WARNING: run never reached game over'); process.exit(1); }
