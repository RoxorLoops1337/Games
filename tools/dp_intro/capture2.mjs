// Second pass: real battle scenes, tilt, wheel power meter.
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
  await page.evaluate(setup);
}
async function shot(name, waitMs = 600) {
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

// ---- battle: drop-phase, then rain, then tilt ----------------------------
await boot(() => {
  const D = window.DP;
  D.srand(424242);
  D.newRun('knight');
  D.S.run.floor = 3;
  D.startBattle('battle');
  // a fat hand so the pour lasts
  D.S.battle.hand = { coin: 30, gold: 6 };
  D.S.battle.sel = 'coin';
});
await shot('battle_bed', 900);
// pour a stream of coins through the real drop path
for (let i = 0; i < 14; i++) {
  await page.evaluate((x) => { const D = window.DP; D.S.cd = 0; D.drop(x, true); }, 25 + (i * 37) % 55);
  await page.waitForTimeout(90);
}
await shot('battle_pour', 250);
await shot('battle_full', 1300);
// tilt jolt
await page.evaluate(() => { const D = window.DP; D.tilt && D.tilt(); });
await shot('tilt', 160);

// ---- wheel: power-meter phase --------------------------------------------
await boot(() => {
  const D = window.DP;
  D.srand(999);
  D.newRun('knight');
  D.S.wheelFeed = { coins: ['coin', 'gold'], t: 0.2, ph: 'power', pw: 0.55, dir: 1 };
});
await shot('wheel_meter', 350);

// ---- wheel: mid-spin blur --------------------------------------------------
await boot(() => {
  const D = window.DP;
  D.srand(998);
  D.newRun('knight');
  D.spinWheel(null, 0.85);
});
await shot('wheel_spin', 900);

await browser.close();
console.log('done');
