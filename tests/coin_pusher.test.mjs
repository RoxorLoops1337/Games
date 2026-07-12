// Headless suite for Gold Rush Arcade (coin pushers). The game's inline
// <script> is evaluated with a stubbed DOM and no canvas ctx, which flips its
// HEADLESS switch: the full 2.5D sim (multi-tier pushers, coin pile, incline
// lip, edge falls, gutters, tags, combos, jackpot, slot bonus) plus the whole
// meta economy (points, machine unlocks, prize shop, PusherBay marketplace)
// runs and is driven through window.CP.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadGame(store) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'coin_pusher', 'index.html'), 'utf8');
  const code = html.match(/<script>\s*'use strict';([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const mkEl = () => new Proxy({
    style: {}, addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 840 }),
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 480; global.innerHeight = 840;
  global.document = { getElementById: () => mkEl(), addEventListener: noop, hidden: false, body: mkEl() };
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });

  eval('(function(){' + code + '\n})()');
  return globalThis.CP;
}

const t = harness('coin_pusher');
t.eq = (a, b, msg) => t.ok(a === b, msg + ' [' + a + ' != ' + b + ']');

const store = {};
const CP = loadGame(store);
const { S, C, MACHINES, PRIZES } = CP;
const DT = 1 / 60;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) CP.tick(DT); };
const platCoins = () => S.coins.filter(c => c.st === 'plat');

// -------- boot state --------
t.ok(CP.HEADLESS, 'headless mode detected');
t.eq(S.score, 0, 'starts at 0 points');
t.eq(S.wallet, C.START_WALLET, 'starts with full wallet');
t.eq(S.mach, 'gold', 'starts on the gold machine');
t.ok(S.unlocked.length === 1 && S.unlocked[0] === 'gold', 'only gold unlocked at first');
t.ok(platCoins().length >= 40, 'initial pile is dense (' + platCoins().length + ' pieces)');
t.ok(S.coins.some(c => c.kind === 'gem'), 'initial pile contains a gem');
t.ok(S.coins.some(c => c.kind === 'lucky'), 'initial pile contains lucky coins');
t.eq(S.coins.filter(c => c.kind === 'tag').length, 2, 'initial pile has two point tags');
t.ok(S.coins.filter(c => c.kind === 'tag').every(c => c.val > 0 && c.col), 'tags carry a value and a colour');
t.ok(platCoins().every(c => c.y >= 0 && c.y <= C.PLAT_FRONT + c.r), 'pile sits on the platform');

// -------- machine roster --------
t.eq(Object.keys(MACHINES).length, 4, 'four machine types exist');
t.ok(MACHINES.gold.unlock === 0 && MACHINES.penny.unlock > 0 && MACHINES.neon.unlock > MACHINES.penny.unlock
     && MACHINES.bandit.unlock > MACHINES.neon.unlock, 'unlock costs escalate');
t.eq(MACHINES.penny.tiers.length, 2, 'penny falls is the two-tier machine');
t.eq(MACHINES.neon.special, 'ball', 'neon medal has the bonus ball');
t.eq(MACHINES.bandit.special, 'bill', 'high roller has cash bills');
t.ok(!CP.setMachine('penny'), 'cannot play a locked machine');
t.ok(!CP.buyMachine('penny'), 'cannot afford penny falls at 0 points');
S.score = MACHINES.penny.unlock + 500;
t.ok(CP.buyMachine('penny'), 'penny falls unlocks with points');
t.eq(S.score, 500, 'unlock cost was deducted');
t.ok(!CP.buyMachine('penny'), 'cannot buy a machine twice');

// -------- pusher kinematics (gold) --------
CP.srand(42); S.mach = 'gold'; CP.reset();
let lo = 1e9, hi = -1e9;
for (let i = 0; i < 300; i++) { CP.step(DT, true); const f = CP.pusherFront(0); lo = Math.min(lo, f); hi = Math.max(hi, f); }
t.ok(lo >= C.PUSH_MIN - 0.01 && hi <= C.PUSH_MAX + 0.01, 'pusher stays within its travel');
t.ok(hi - lo > (C.PUSH_MAX - C.PUSH_MIN) * 0.8, 'pusher sweeps most of its travel');

// -------- pusher actually pushes --------
CP.srand(42); CP.reset();
S.coins.length = 0;
S.phase = 0;
const pushed = CP.place(50, C.PUSH_MIN + 4.6 + 0.5, 'coin', 0, 'plat');
step(MACHINES.gold.pushPeriod / 2);
t.ok(pushed.y > C.PUSH_MIN + 4.6 + 8, 'coin in contact gets shoved forward');
const yAtFull = pushed.y;
step(MACHINES.gold.pushPeriod / 2);
t.ok(pushed.y >= yAtFull - 0.5, 'coin does not get dragged back on retraction');

// -------- determinism --------
function runScript() {
  CP.srand(1337); CP.reset();
  CP.drop(30); step(1); CP.drop(70); step(3);
  return JSON.stringify(S.coins.map(c => [c.x.toFixed(4), c.y.toFixed(4), c.st, c.kind]));
}
const runA = runScript(), runB = runScript();
t.eq(runA, runB, 'same seed + same inputs = identical sim');

// -------- dropping --------
CP.srand(7); CP.reset(); S.wallet = 25; S.dropped = 0;
const w0 = S.wallet, n0 = S.coins.length, m0 = S.meter;
t.ok(CP.drop(50), 'drop accepted');
t.eq(S.wallet, w0 - 1, 'drop costs one coin');
t.eq(S.coins.length, n0 + 1, 'drop spawns a coin');
t.eq(S.meter, m0 + 1, 'drop feeds the jackpot meter');
t.ok(!CP.drop(50), 'cooldown blocks an immediate second drop');
const dropped = S.coins[S.coins.length - 1];
t.eq(dropped.st, 'air', 'spawned coin is falling from the slot');
step(2);
t.eq(dropped.st, 'plat', 'dropped coin lands on the platform');
t.ok(dropped.y >= CP.pusherFront(0) + dropped.r - 0.01, 'landed coin is in front of the pusher');
S.wallet = 0; S.cd = 0;
t.ok(!CP.drop(50), 'cannot drop with an empty wallet');
t.eq(S.wallet, 0, 'wallet never goes negative');

// -------- tag drops on schedule --------
CP.srand(7); CP.reset(); S.wallet = 25;
S.dropped = MACHINES.gold.tagEvery - 1; S.cd = 0;
CP.drop(50);
const tagDrop = S.coins[S.coins.length - 1];
t.eq(tagDrop.kind, 'tag', 'every Nth drop is a point tag');
t.ok(tagDrop.val > 0, 'dropped tag has a value');

// -------- wallet regen --------
S.wallet = 3; S.regen = 0;
step(C.REGEN_T + 0.1);
t.ok(S.wallet >= 4, 'wallet trickles back over time');
S.wallet = C.REGEN_CAP;
step(C.REGEN_T + 0.1);
t.eq(S.wallet, C.REGEN_CAP, 'regen respects the cap');

// -------- incline lip: slow coins stall at the brink --------
CP.srand(9); CP.reset();
S.coins.length = 0;
const front = CP.tierFront(0);
const slow = CP.place(50, front - 5, 'coin', 0, 'plat');
slow.vy = 25;
step(1.5);
t.eq(slow.st, 'plat', 'a slow coin stalls on the incline lip');
t.ok(slow.y < front, 'stalled coin is still teetering before the edge');
const fast = CP.place(30, front - 5, 'coin', 0, 'plat');
fast.vy = 60;
step(1.5);
t.ok(fast.st !== 'plat', 'a hard shove still carries a coin over the lip');

// -------- edge fall scores, combo chains --------
CP.srand(9); CP.reset();
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99;
const f1 = CP.place(40, C.PLAT_FRONT - 1, 'coin', 0, 'plat');
const f2 = CP.place(60, C.PLAT_FRONT - 1, 'coin', 0, 'plat');
f1.vy = 60; f2.vy = 60;
step(0.9);
t.ok(f1.scored && f2.scored, 'both coins over the edge were scored');
t.eq(S.score, C.PTS.coin + C.PTS.coin * 2, 'second coin in the window pays the combo multiplier');
t.eq(S.combo, 2, 'combo counter tracked the chain');
step(C.COMBO_WIN + 0.6);
t.eq(S.combo, 0, 'combo lapses after the window');

// combo cap
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99;
for (let i = 0; i < 8; i++) {
  const c = CP.place(12 + i * 10, C.PLAT_FRONT - 0.5, 'coin', 0, 'plat');
  c.vy = 70;
}
step(2.5);
const capPts = (() => { let s = 0; for (let i = 1; i <= 8; i++) s += C.PTS.coin * Math.min(i, C.COMBO_CAP); return s; })();
t.eq(S.score, capPts, 'combo multiplier caps at ×' + C.COMBO_CAP);

// -------- payouts per kind --------
CP.srand(11); CP.reset();
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99;
let w1 = S.wallet;
const lucky = CP.place(50, C.PLAT_FRONT - 0.5, 'lucky', 0, 'plat');
lucky.vy = 70;
step(2);
t.eq(S.score, MACHINES.gold.luckyVal, 'lucky coin pays its value');
t.eq(S.wallet, w1 + C.PAY.lucky, 'lucky coin refunds 2 to the wallet');
S.combo = 0; S.lastCollect = -99; w1 = S.wallet; const s1 = S.score;
const gem = CP.place(50, C.PLAT_FRONT - 0.5, 'gem', 0, 'plat');
gem.vy = 70;
step(2);
t.eq(S.score, s1 + MACHINES.gold.gemVal, 'gem pays its value flat');
t.eq(S.wallet, w1 + C.PAY.gem, 'gem refunds 5 to the wallet');
// tag pays flat, no combo involvement
S.combo = 0; S.lastCollect = -99; const s2 = S.score;
const tagC = CP.place(50, C.PLAT_FRONT - 0.5, 'tag', 0, 'plat');
tagC.val = 250; tagC.vy = 70;
step(2);
t.eq(S.score, s2 + 250, 'point tag pays its printed value');
t.eq(S.combo, 0, 'tags do not enter the combo chain');

// -------- gutters eat coins silently --------
CP.srand(13); CP.reset();
S.coins.length = 0; S.score = 0;
const g1 = CP.place(3, MACHINES.gold.gutY + 10, 'coin', 0, 'plat');
g1.vx = -20;
const lost0 = S.lost;
step(3);
t.eq(S.lost, lost0 + 1, 'coin drifting off the side is lost');
t.eq(S.score, 0, 'gutter coins never score');
t.ok(!S.coins.includes(g1), 'gutter coin was removed from the world');
S.coins.length = 0;
const g2 = CP.place(6, MACHINES.gold.gutY - 15, 'coin', 0, 'plat');
g2.vx = -40;
step(1);
t.ok(g2.st === 'plat' && g2.x >= g2.r - 0.01, 'side walls hold near the back');

// -------- jackpot --------
CP.srand(17); CP.reset();
S.wallet = 30; S.cd = 0;
S.meter = C.METER_MAX - 1;
const before = S.coins.length, jp0 = S.jackpots;
CP.drop(50);
t.eq(S.meter, 0, 'meter resets on jackpot');
t.eq(S.jackpots, jp0 + 1, 'jackpot counted');
t.ok(S.rain.length > 0 || S.coins.length > before + 1, 'jackpot queues a coin rain');
step(1.3);
t.ok(S.coins.length >= before + 8, 'jackpot rained bonus coins onto the platform');

// -------- penny falls: the two-tier cascade --------
CP.srand(19); CP.setMachine('penny');
t.eq(S.mach, 'penny', 'switched to penny falls');
t.ok(S.coins.some(c => c.tier === 0) && S.coins.some(c => c.tier === 1), 'both tiers carry coins');
const tf0a = CP.tierFront(0);
step(MACHINES.penny.pushPeriod / 3);
t.ok(Math.abs(CP.tierFront(0) - tf0a) > 1, 'the shelf edge moves — it is the tier-1 pusher');
// a coin pushed off the shelf hops down to the lower field
S.coins.length = 0;
const hopper = CP.place(50, 26, 'coin', 0, 'plat', 0);
hopper.vy = 60;
let hopped = false;
for (let i = 0; i < 600 && !hopped; i++) { CP.tick(DT); if (hopper.tier === 1) hopped = true; }
t.ok(hopped, 'shelf coins cascade down to the lower field');
for (let i = 0; i < 240 && hopper.st !== 'plat'; i++) CP.tick(DT);
t.eq(hopper.st, 'plat', 'cascaded coin settles on the lower field');
// lower-field coin over the front edge pays penny values
S.coins.length = 0; S.score = 1000; S.combo = 0; S.lastCollect = -99;
const pFront = CP.tierFront(1);
const payer = CP.place(50, pFront - 0.5, 'coin', 0, 'plat', 1);
payer.vy = 70;
step(2);
t.eq(S.score, 1000 + MACHINES.penny.coin.val, 'penny falls pays 2p values');

// -------- neon medal: bonus ball spins the slot --------
S.score = MACHINES.neon.unlock + MACHINES.bandit.unlock + 2000;
t.ok(CP.buyMachine('neon'), 'neon medal unlocks');
CP.srand(23); CP.setMachine('neon');
const w2 = S.wallet, s3 = S.score;
CP.srand(23);
const out = CP.spinSlot();
t.ok(out && out.syms && out.label, 'slot spin returns an outcome');
t.ok(S.wallet > w2 || S.score > s3 || S.jackpots > 0, 'slot outcome pays something');
t.ok(S.slotAnim !== null, 'slot animation armed');
S.slotAnim = null;
S.coins.length = 0;
const ball = CP.place(50, CP.tierFront(0) - 0.5, 'ball', 0, 'plat');
ball.vy = 70;
step(2);
t.ok(S.slotAnim !== null || S.banner !== null, 'collected bonus ball triggers the slot');

// -------- high roller: cash bills --------
t.ok(CP.buyMachine('bandit'), 'high roller unlocks');
CP.srand(29); CP.setMachine('bandit');
S.wallet = 25; S.cd = 0;
S.dropped = MACHINES.bandit.billEvery - 1;
CP.drop(50);
const billDrop = S.coins[S.coins.length - 1];
t.eq(billDrop.kind, 'bill', 'high roller drops wrapped cash bills');
S.coins.length = 0; const s4 = S.score;
const bill = CP.place(50, CP.tierFront(0) - 0.5, 'bill', 0, 'plat');
bill.vy = 70;
step(2);
t.eq(S.score, s4 + MACHINES.bandit.billVal, 'a collected bill pays big');

// -------- prize shop --------
S.score = 1000;
t.ok(CP.buyPrize('key'), 'can buy an affordable prize');
t.eq(S.score, 1000 - PRIZES.find(p => p.id === 'key').cost, 'prize cost deducted from points');
t.eq(S.prizes.key, 1, 'prize lands in the inventory');
t.ok(!CP.buyPrize('arcade'), 'cannot buy above your points');
CP.buyPrize('key');
t.eq(S.prizes.key, 2, 'prizes stack in the inventory');

// -------- PusherBay marketplace --------
const keyBase = PRIZES.find(p => p.id === 'key').base;
t.ok(CP.listPrize('key', 0, 1000), 'can list an owned prize');
t.eq(S.prizes.key, 1, 'listing removes one from the inventory');
t.eq(S.listings.length, 1, 'listing is live');
t.eq(S.listings[0].price, Math.round(keyBase * C.SELL_TIERS[0].mul), 'quick-sale price is discounted');
const wBefore = S.wallet;
t.ok(!CP.resolveSales(1000 + C.SELL_TIERS[0].dur - 1), 'listing has not sold yet');
t.ok(CP.resolveSales(1000 + C.SELL_TIERS[0].dur + 1), 'listing sells when its timer lapses');
t.eq(S.listings.length, 0, 'sold listing is cleared');
t.eq(S.wallet, wBefore + Math.round(keyBase * 0.7), 'sale pays coins into the wallet');
t.ok(S.slog.length === 1 && typeof S.slog[0].buyer === 'string' && S.slog[0].buyer.length > 0,
     'sale log records the buyer');
// listing cap
S.prizes.duck = 6;
for (let i = 0; i < C.LIST_MAX; i++) CP.listPrize('duck', 1, 5000);
t.eq(S.listings.length, C.LIST_MAX, 'store holds four listings');
t.ok(!CP.listPrize('duck', 1, 5000), 'fifth listing is rejected');
S.listings.length = 0;
t.ok(!CP.listPrize('trophy', 1, 5000), 'cannot list a prize you do not own');

// -------- the actual game loop: drops eventually pay out --------
CP.srand(31); CP.setMachine('gold');
S.wallet = 999;
const startScore = S.score;
let drops = 0;
for (let sec = 0; sec < 90; sec++) {
  S.cd = 0;
  if (CP.drop(20 + (sec * 13) % 60)) drops++;
  step(1);
}
t.ok(drops > 60, 'kept dropping coins throughout');
t.ok(S.score > startScore, 'sustained play pushes coins off the edge and earns points');
t.ok(S.collected > 0, 'collected counter tracks payouts');

// -------- stability --------
let sane = true, contained = true;
for (const c of S.coins) {
  if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.z)) sane = false;
  if (c.st === 'plat' && (c.x < -2 || c.x > C.W + 2 || c.y < -2 || c.y > C.PLAT_FRONT + c.r + 1)) contained = false;
}
t.ok(sane, 'no NaN/Infinity positions after long play');
t.ok(contained, 'platform coins stay within the machine');
step(6);
let worstOverlap = 0;
const pc = platCoins().filter(c => c.lay === 0);
for (let i = 0; i < pc.length; i++) for (let j = i + 1; j < pc.length; j++) {
  if (pc[i].tier !== pc[j].tier) continue;
  const dx = pc[i].x - pc[j].x, dy = pc[i].y - pc[j].y;
  const pen = (pc[i].r + pc[j].r) - Math.hypot(dx, dy);
  if (pen > worstOverlap) worstOverlap = pen;
}
t.ok(worstOverlap < C.COIN_R * 0.7, 'settled pile has no severe interpenetration');
t.ok(S.coins.length <= MACHINES.gold.maxCoins, 'coin count respects the machine cap');

// -------- persistence --------
t.ok(S.best >= S.score, 'best tracks the high water mark');
CP.save();
const saved = JSON.parse(store[C.SAVE_KEY]);
t.eq(saved.v, 2, 'save is v2');
t.eq(saved.best, S.best, 'best is persisted');
t.eq(saved.wallet, S.wallet, 'wallet is persisted');
t.eq(saved.score, S.score, 'points balance is persisted');
t.ok(Array.isArray(saved.unlocked) && saved.unlocked.length === 4, 'machine unlocks are persisted');
t.ok(saved.prizes && typeof saved.prizes === 'object', 'prize inventory is persisted');
S.mute = true; CP.save();
t.ok(JSON.parse(store[C.SAVE_KEY]).mute === true, 'mute is persisted');

// reset re-racks the pile but keeps the economy
const ptsBefore = S.score, walBefore = S.wallet, bestBefore = S.best;
CP.reset();
t.eq(S.score, ptsBefore, 'reset keeps the points balance');
t.eq(S.wallet, walBefore, 'reset keeps the wallet');
t.eq(S.best, bestBefore, 'reset keeps the best');
t.ok(platCoins().length >= 40, 'reset rebuilds the pile');

// -------- v1 save migration --------
const store2 = { coin_pusher_save: JSON.stringify({ score: 500, best: 900, wallet: 7, meter: 3, mute: true }) };
const CP2 = loadGame(store2);
t.eq(CP2.S.score, 500, 'v1 score migrates to points');
t.eq(CP2.S.best, 900, 'v1 best migrates');
t.eq(CP2.S.wallet, 7, 'v1 wallet migrates');
t.ok(CP2.S.unlocked.length === 1 && CP2.S.unlocked[0] === 'gold', 'migrated save starts with gold only');
t.ok(CP2.S.listings.length === 0 && Object.keys(CP2.S.prizes).length === 0, 'migrated save has a clean store');

t.done();
