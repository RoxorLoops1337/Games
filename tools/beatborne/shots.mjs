#!/usr/bin/env node
// BEATBORNE shot walk. Boots the real game in Chromium, walks it through every
// screen, and writes a PNG of each. It asserts nothing -- the render suite does
// that. This exists so somebody can look at the thing and say it is ugly, which
// is the only test that catches ugly.
//
//   node tools/beatborne/shots.mjs [outdir] [width] [height]
//
// It also reports any console error or page error it saw, which is the one
// thing the headless suites genuinely cannot see: real canvas, real audio graph.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(here, 'shots');
const W = parseInt(process.argv[3] || '900', 10);
const H = parseInt(process.argv[4] || '420', 10);
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));

const shot = async (name, wait) => {
  if (wait) await p.waitForTimeout(wait);
  await p.screenshot({ path: join(OUT, name + '.png') });
  console.log('  ' + name + '.png');
};
const click = async sel => { await p.click(sel); await p.waitForTimeout(220); };

// drag a hand card onto a board slot the way a thumb would
async function place(handIndex, col, row) {
  const box = await p.locator('#cv').boundingBox();
  const geo = await p.evaluate(([i, c, r]) => {
    const L = window.BB.layout(), S = window.BB.G.run.fight;
    if (i >= S.hand.length) return null;
    return { r: L.handRect(i, S.hand.length), s: L.slot('us', c, r), W: L.W, H: L.H };
  }, [handIndex, col, row]);
  if (!geo) return false;
  const sx = box.x + (geo.r.x + geo.r.w / 2) / geo.W * box.width;
  const sy = box.y + (geo.r.y + geo.r.h / 2) / geo.H * box.height;
  const dx = box.x + geo.s.x / geo.W * box.width;
  const dy = box.y + (geo.s.y - 40) / geo.H * box.height;
  await p.mouse.move(sx, sy); await p.mouse.down();
  await p.mouse.move(dx, dy, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(120);
  return true;
}

await p.goto('file://' + join(here, '..', '..', 'beatborne', 'index.html'));
console.log('\nBEATBORNE shot walk -> ' + OUT + '  (' + W + 'x' + H + ')\n');
await shot('01_title', 700);
await click('button[data-a="how"]');   await shot('02_how');
await click('button[data-a="title"]');
await click('button[data-a="collection"]'); await shot('03_collection', 300);
await click('button[data-a="title"]');
await click('button[data-a="new"]');   await shot('04_map');
await click('button[data-a="shop"]');  await shot('05_shop', 300);
await click('button[data-a="map"]');
await click('button[data-a="fight"]');
await shot('06_countin', 500);
for (const [i, c, r] of [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]]) await place(i, c, r);
await shot('07_fight', 900);
// force the payoff so the shot walk always has one to look at
await p.evaluate(() => { const S = window.BB.G.run.fight; S.crowd = 96; window.BB.addCrowd(S, 10); });
await shot('08_drop', 380);
await p.evaluate(() => {
  const S = window.BB.G.run.fight;
  for (const u of S.units) if (u.side === 'them') u.hp = 0;
  S.waveI = S.waves.length; S.pending = [];
});
await shot('09_reward', 2200);
// and the ending, which is where the score lands
await p.evaluate(() => {
  const R = window.BB.G.run;
  R.stagesCleared = 7; R.perfects = 41; R.drops = 11; R.act = 1; R.stage = 2; R.hp = 0;
  window.BB.G.meta.bestScore = 0;
  window.BB.bankScore();
  window.BB.G.scr = 'over';
});
await shot('10_over', 500);
console.log('');
console.log(errs.length ? 'ERRORS SEEN:\n  ' + errs.join('\n  ') : 'no console or page errors');
await b.close();
