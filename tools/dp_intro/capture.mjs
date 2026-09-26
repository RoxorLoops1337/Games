// Capture real-gameplay stills for the intro montage.
import { createRequire } from 'module';
const { chromium } = createRequire('/home/user/Games/')('playwright-core');

const OUT = '/tmp/claude-0/-home-user-Games/fbb4dcc7-2eb2-53c9-86b1-2ce4db73749f/scratchpad/intro';
const URL = 'http://127.0.0.1:8813/dungeon_pusher/index.html';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 720, height: 1260 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));

async function boot(setup) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DP && window.DP.S);
  // silence audio + dismiss any first-run modals
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(setup);
}

async function shot(name, waitMs = 600) {
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

// ---- 1. battle: packed bed, coins raining -------------------------------
await boot(() => {
  const D = window.DP;
  D.srand(424242);
  D.newRun('knight');
  D.S.run.floor = 3;
  D.startBattle('skirmish');
});
await page.waitForTimeout(800);
// rain a burst of coins so the bed looks alive
await page.evaluate(() => {
  const D = window.DP;
  for (let i = 0; i < 10; i++) D.spawnDrop && D.spawnDrop('coin', 120 + i * 26, -20 - i * 30);
});
await shot('battle_rain', 900);
await shot('battle_settled', 1400);

// ---- 2. tilt jolt --------------------------------------------------------
await page.evaluate(() => { const D = window.DP; D.tilt && D.tilt(); });
await shot('tilt', 180);

// ---- 3. boss battle (act boss with art) ----------------------------------
await boot(() => {
  const D = window.DP;
  D.srand(777);
  D.newRun('knight');
  D.S.run.floor = 5;
  D.startBattle('boss', undefined, D.bossFor(5).id);
});
await shot('boss', 1200);

// ---- 4. dungeon crawl (room view) ----------------------------------------
await boot(() => {
  const D = window.DP;
  D.srand(1337);
  D.newRun('knight');
  D.S.run.floor = 2;
  D.genFloor && D.genFloor();
});
await shot('room', 1200);

// ---- 5. wheel mid-spin ---------------------------------------------------
await boot(() => {
  const D = window.DP;
  D.srand(999);
  D.newRun('knight');
  D.startBattle('skirmish');
  // force a wheel spin directly
  if (D.S.run && D.S.run.purse) D.S.run.purse.coin = 99;
  D.spinWheel('coin', 0.8);
});
await shot('wheel', 700);

await browser.close();
console.log('done');
