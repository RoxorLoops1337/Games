// Capture MOVING gameplay clips: freeze the game's RAF, step it at exactly
// 30fps, screenshot every step. Each clip = 66 frames (2.2s of real play).
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const { chromium } = createRequire('/home/user/Games/')('playwright-core');

const SP = '/tmp/claude-0/-home-user-Games/fbb4dcc7-2eb2-53c9-86b1-2ce4db73749f/scratchpad/intro';
const URL = 'http://127.0.0.1:8813/dungeon_pusher/index.html';
const FPS = 30, NF = 66;
mkdirSync(`${SP}/clips`, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function captureClip(name, setup, perFrame) {
  const page = await browser.newPage({ viewport: { width: 720, height: 1260 } });
  page.on('pageerror', e => console.log('PAGEERROR', name, e.message));
  await page.addInitScript(() => {
    window.__q = [];
    window.requestAnimationFrame = cb => { window.__q.push(cb); return window.__q.length; };
    window.__tick = ts => { const q = window.__q.splice(0); for (const cb of q) cb(ts); };
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DP && window.DP.S);
  // no toasts crashing the party: pre-own every achievement
  await page.evaluate(() => { for (const a of window.DP.ACH) window.DP.S.ach.u[a.id] = 1; });
  await page.evaluate(setup);
  // two warm-up ticks so the scene settles its first-frame lerps
  await page.evaluate(() => { window.__tick(0); window.__tick(1000 / 30); });
  const canvas = page.locator('canvas').first();
  for (let i = 0; i < NF; i++) {
    if (perFrame) await page.evaluate(perFrame, i);
    await page.evaluate(ts => window.__tick(ts), (i + 2) * (1000 / FPS));
    await canvas.screenshot({ path: `${SP}/clips/${name}_${String(i).padStart(2, '0')}.jpg`, quality: 90, type: 'jpeg' });
  }
  await page.close();
  console.log('clip', name, 'done');
}

// ---- DELVE: the knight walks the corridor -----------------------------------
await captureClip('room', () => {
  const D = window.DP;
  D.srand(1337);
  D.newRun('knight');
  D.S.run.floor = 2;
  D.genFloor();
}, (i) => {
  // hold "up" on the springy thumb-stick: fake an active JOY drag upward
  const D = window.DP;
  const kb = window.DP.kb;
  // arrows: the game reads KEYS via keydown handlers — dispatch real events
  if (i === 4) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  if (i === 40) { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); }
  if (i === 62) window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
});

// ---- PUSH: coins pour into a working pusher ----------------------------------
await captureClip('battle_pour', () => {
  const D = window.DP;
  D.srand(424242);
  D.newRun('knight');
  D.S.run.floor = 3;
  D.startBattle('battle');
  D.S.battle.hand = { coin: 60, gold: 10 };
  D.S.battle.sel = 'coin';
}, (i) => {
  const D = window.DP;
  if (i >= 2 && i % 4 === 0) { D.S.cd = 0; D.drop(18 + (i * 23) % 64, true); }
});

// ---- TILT!: a packed bed takes the jolt ---------------------------------------
await captureClip('tilt', () => {
  const D = window.DP;
  D.srand(777777);
  D.newRun('knight');
  D.S.run.floor = 3;
  D.startBattle('battle');
  D.S.battle.hand = { coin: 40 };
  D.S.battle.sel = 'coin';
}, (i) => {
  const D = window.DP;
  if (i < 18 && i % 3 === 0) { D.S.cd = 0; D.drop(20 + (i * 31) % 60, true); }
  if (i === 26) D.tilt();
  if (i === 48) D.tilt();
});

// ---- PRESS YOUR LUCK: feed → needle sweep → the spin --------------------------
await captureClip('wheel_meter', () => {
  const D = window.DP;
  D.srand(999);
  D.newRun('knight');
  D.S.wheelFeed = { coins: ['coin', 'gold'], t: 0, ph: 'feed', pw: 0, dir: 1 };
}, (i) => {
  const D = window.DP;
  const f = D.S.wheelFeed;
  if (f && f.ph === 'armed' && i < 30) D.wheelPress();     // SPIN — needle starts
  if (f && f.ph === 'power' && i === 52) D.wheelPress();   // STOP — she spins
});

// ---- SLAY: the lair, banner and all -------------------------------------------
await captureClip('boss', () => {
  const D = window.DP;
  D.srand(777);
  D.newRun('knight');
  D.S.run.floor = 5;
  D.startBattle('boss', undefined, D.bossFor(5).id);
  D.S.battle.hand = { coin: 40, gold: 8 };
  D.S.battle.sel = 'gold';
}, (i) => {
  const D = window.DP;
  if (i >= 20 && i % 5 === 0) { D.S.cd = 0; D.drop(24 + (i * 29) % 52, true); }
});

await browser.close();
console.log('all clips done');
