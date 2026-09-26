import { createRequire } from 'module';
const { chromium } = createRequire('/home/user/Games/')('playwright-core');
const SP = '/tmp/claude-0/-home-user-Games/fbb4dcc7-2eb2-53c9-86b1-2ce4db73749f/scratchpad/intro';
const FPS = 30, NF = 66;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 720, height: 1260 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.addInitScript(() => {
  window.__q = [];
  window.requestAnimationFrame = cb => { window.__q.push(cb); return window.__q.length; };
  window.__tick = ts => { const q = window.__q.splice(0); for (const cb of q) cb(ts); };
});
await page.goto('http://127.0.0.1:8813/dungeon_pusher/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.DP && window.DP.S);
await page.evaluate(() => {
  const D = window.DP;
  for (const a of D.ACH) D.S.ach.u[a.id] = 1;
  D.srand(20260926);
  D.newRun('knight');
  D.S.run.floor = 2;
  D.genFloor();
});
await page.evaluate(() => { window.__tick(0); window.__tick(1000 / 30); });
const canvas = page.locator('canvas').first();
for (let i = 0; i < NF; i++) {
  await page.evaluate((i) => {
    const D = window.DP;
    if (D.S.room) D.closeModal();                    // no window-shopping mid-clip
    const kd = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k }));
    if (i === 2) kd('ArrowRight');
    if (i === 22) { ku('ArrowRight'); kd('ArrowUp'); }
    if (i === 44) { ku('ArrowUp'); kd('ArrowLeft'); }
    if (i === 63) ku('ArrowLeft');
  }, i);
  await page.evaluate(ts => window.__tick(ts), (i + 2) * (1000 / FPS));
  await canvas.screenshot({ path: `${SP}/clips/room_${String(i).padStart(2, '0')}.jpg`, quality: 90, type: 'jpeg' });
}
await browser.close();
console.log('room reclip done');
