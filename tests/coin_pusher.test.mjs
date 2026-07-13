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
t.eq(S.money, C.START_MONEY, 'starts with pocket money');
t.eq(S.mach, 'gold', 'starts on the gold machine');
t.ok(S.unlocked.length === 1 && S.unlocked[0] === 'gold', 'only gold unlocked at first');
t.ok(platCoins().length >= 40, 'initial pile is dense (' + platCoins().length + ' pieces)');
t.ok(S.coins.some(c => c.kind === 'gem'), 'initial pile contains a gem');
t.ok(S.coins.some(c => c.kind === 'lucky'), 'initial pile contains lucky coins');
t.eq(S.coins.filter(c => c.kind === 'tag').length, 2, 'initial pile has two point tags');
t.ok(S.coins.filter(c => c.kind === 'tag').every(c => c.val > 0 && c.col), 'tags carry a value and a colour');
t.ok(S.coins.filter(c => c.kind === 'prize').length >= 1, 'real prizes ride the pile');
t.ok(S.coins.filter(c => c.kind === 'prize').every(c => PRIZES.some(p => p.id === c.pid)), 'pile prizes are shop items');
t.ok(platCoins().every(c => c.y >= 0 && c.y <= C.PLAT_FRONT + c.r), 'pile sits on the platform');

// -------- the real prize catalog --------
t.eq(PRIZES.length, 17, 'seventeen real keychain prizes in the catalog');
{
  const { readdirSync } = await import('node:fs');
  const here2 = dirname(fileURLToPath(import.meta.url));
  const art = new Set(readdirSync(join(here2, '..', 'coin_pusher', 'prizes')));
  t.ok(PRIZES.every(p => art.has(p.id + '.png')), 'every prize has its cut-out art on disk');
  t.ok(PRIZES.every(p => p.cost > 0 && p.base > 0 && p.icon), 'every prize has cost, base price, and an emoji fallback');
}
t.ok(['gold', 'penny', 'neon', 'bandit'].every(id =>
  MACHINES[id].prizeIds.length === 3 && MACHINES[id].prizeIds.every(pid => PRIZES.some(p => p.id === pid))),
  'each machine fields three catalog prizes');

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
t.ok(dropped.onPush || dropped.y >= CP.pusherFront(0) + dropped.r - 0.01,
     'landed coin sits on the shelf or in front of the pusher');
S.wallet = 0; S.cd = 0;
t.ok(!CP.drop(50), 'cannot drop with an empty wallet');
t.eq(S.wallet, 0, 'wallet never goes negative');

// -------- you only ever insert coins --------
CP.srand(7); CP.reset(); S.wallet = 99;
let allCoins = true;
for (let i = 0; i < 25; i++) {
  S.cd = 0;
  CP.drop(20 + i * 2.5);
  const k = S.coins[S.coins.length - 1].kind;
  if (k !== 'coin' && k !== 'lucky') allCoins = false;
}
t.ok(allCoins, 'the slot only ever takes coins — no tags/gems/bills from your hand');

// -------- broke bailout (the house comps you only when truly flat) --------
S.coins.length = 0; // an empty field: nothing can fall into the tray meanwhile
S.wallet = 0; S.money = 0; S.tray.coins = 0; S.regen = 0;
step(C.PITY_T + 0.1);
t.ok(S.wallet >= 1, 'flat-broke player gets a slow comp coin');
S.wallet = 0; S.money = C.PACKS[0].m; S.regen = 0;
step(C.PITY_T + 0.1);
t.eq(S.wallet, 0, 'no comp while you can afford a coin pack');
S.money = C.START_MONEY;

// -------- money buys coins --------
S.money = 500; S.wallet = 0;
t.ok(CP.buyCoins(0), 'can buy the small pack');
t.eq(S.wallet, C.PACKS[0].c, 'pack delivers its coins');
t.eq(S.money, 500 - C.PACKS[0].m, 'pack costs money');
t.ok(!CP.buyCoins(2), 'cannot afford the big pack');
t.eq(S.wallet, C.PACKS[0].c, 'failed purchase changes nothing');

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

// combo cap + FEVER: hitting max combo ignites 6s of double points
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99; S.fever = 0;
for (let i = 0; i < 8; i++) {
  const c = CP.place(12 + i * 10, C.PLAT_FRONT - 0.5, 'coin', 0, 'plat');
  c.vy = 70;
}
step(2.5);
t.ok(S.fever > 0 || S.score > 0, 'the chain ran');
const capPts = (() => {
  let s = 0;
  for (let i = 1; i <= 8; i++) {
    const mult = Math.min(i, C.COMBO_CAP);
    s += C.PTS.coin * mult * (mult >= C.COMBO_CAP ? 2 : 1); // fever doubles from x5 on
  }
  return s;
})();
t.eq(S.score, capPts, 'combo caps at ×' + C.COMBO_CAP + ' and max combo ignites FEVER ×2');
t.ok(S.fever > 0, 'fever is burning after a maxed combo');
step(6.5);
t.ok(S.fever <= 0, 'fever burns out after six seconds');

// -------- payouts per kind: winnings land in the TRAY, not the wallet --------
CP.srand(11); CP.reset();
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99; S.fever = 0;
S.tray.coins = 0; S.tray.items.length = 0; S.tray.prizes.length = 0;
const wFixed = S.wallet;
const lucky = CP.place(50, C.PLAT_FRONT - 0.5, 'lucky', 0, 'plat');
lucky.vy = 70;
step(2);
t.eq(S.score, MACHINES.gold.luckyVal, 'lucky coin pays its value');
t.eq(S.tray.coins, C.PAY.lucky, 'lucky coin drops 2 coins into the tray');
t.eq(S.wallet, wFixed, 'the wallet is untouched until you collect');
S.combo = 0; S.lastCollect = -99; const s1 = S.score;
const gem = CP.place(50, C.PLAT_FRONT - 0.5, 'gem', 0, 'plat');
gem.vy = 70;
step(2);
t.eq(S.score, s1 + MACHINES.gold.gemVal, 'gem pays its value flat');
t.eq(S.tray.coins, C.PAY.lucky + C.PAY.gem, 'gem drops 5 coins into the tray');
// tag pays flat, no combo involvement
S.combo = 0; S.lastCollect = -99; const s2 = S.score;
const tagC = CP.place(50, C.PLAT_FRONT - 0.5, 'tag', 0, 'plat');
tagC.val = 250; tagC.vy = 70;
step(2);
t.eq(S.score, s2 + 250, 'point tag pays its printed value');
t.eq(S.combo, 0, 'tags do not enter the combo chain');
// scooping the tray moves it all into your pockets
const wScoop = S.wallet, trayC = S.tray.coins;
t.ok(CP.collectTray(), 'tray with winnings can be collected');
t.eq(S.wallet, wScoop + trayC, 'collected coins land in the wallet');
t.eq(S.tray.coins + S.tray.items.length + S.tray.prizes.length, 0, 'tray is empty after scooping');
t.ok(!CP.collectTray(), 'empty tray has nothing to collect');

// -------- winning a prize off the pile --------
S.coins.length = 0; S.prizes = {};
const pr = CP.place(50, C.PLAT_FRONT - 0.5, 'prize', 0, 'plat');
pr.pid = 'cat'; pr.vy = 90;
const debt0 = S.prizeDebt;
step(2.5);
t.ok(pr.scored, 'prize pushed over the edge is won');
t.eq(S.tray.prizes[0], 'cat', 'won prize waits in the tray');
t.eq(S.prizeDebt, debt0 + 1, 'machine owes the pile a restock');
CP.collectTray();
t.eq(S.prizes.cat, 1, 'collected prize joins the inventory');
// the machine drops the restock itself a few drops later — your inserted
// coin still arrives as a coin
S.wallet = 30; S.dropped = 9; S.cd = 0; S.rain.length = 0;
CP.drop(50);
const inserted = S.coins[S.coins.length - 1];
t.ok(inserted.kind === 'coin' || inserted.kind === 'lucky', 'the insert is still a coin');
const restockRain = S.rain.find(r => r.kind === 'prize');
t.ok(!!restockRain, 'the machine queues a prize restock of its own');
t.ok(MACHINES.gold.prizeIds.indexOf(restockRain.pid) >= 0, 'restocked prize suits the machine');
step(1.5);
t.ok(S.coins.some(c => c.kind === 'prize' && c.pid === restockRain.pid), 'restocked prize landed on the field');

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
t.eq(S.rain.filter(r => r.kind === 'tag').length, 2, 'the jackpot restocks POINT TAGS onto the platform');
t.ok(S.rain.some(r => r.kind === 'gem'), 'the jackpot restocks a gem');
t.ok(S.rain.filter(r => r.kind === 'tag').every(r => r.tag && r.tag.val > 0), 'restocked tags carry values');
step(1.3);
t.ok(S.coins.length >= before + 8, 'jackpot rained bonus coins onto the platform');
// the points supply now comes from the machine, not from your inserts
t.ok(S.coins.some(c => c.kind === 'tag' && c.st !== 'gutter'), 'fresh tags are on the field after the jackpot');

// -------- the tray funnel: front falls never miss --------
CP.srand(21); CP.reset();
S.coins.length = 0;
const corner = CP.place(4, C.PLAT_FRONT - 0.5, 'coin', 0, 'plat');
corner.vy = 70;
const cornerPrize = CP.place(96, C.PLAT_FRONT - 0.5, 'prize', 0, 'plat');
cornerPrize.pid = 'paw'; cornerPrize.vy = 90;
step(2.5);
t.ok(corner.scored, 'corner coin over the front edge still scores');
t.ok(corner.x >= 20, 'falling coin was funneled inward to the tray');
t.ok(cornerPrize.scored, 'corner prize over the front edge is won');
t.ok(cornerPrize.x <= 80, 'falling prize was funneled inward to the tray');
// the gutters close before the lip: a coin hugging the wall at the very
// front cannot slip out the side any more — it MUST go over and pay
CP.srand(53); CP.reset();
S.coins.length = 0;
const gutEnd = CP.tierFront(0) - MACHINES.gold.lipW - 2;
const hugger = CP.place(2, gutEnd + 1, 'coin', 0, 'plat');
hugger.vx = -25; hugger.vy = 55;
const lostBefore = S.lost;
step(2.5);
t.eq(S.lost, lostBefore, 'the front corner guard wall blocks the side exit');
t.ok(hugger.scored, 'the wall-hugging coin funnels over the front and pays');
// while the mid-zone gutters still take their cut
const mid = CP.place(2, MACHINES.gold.gutY + 8, 'coin', 0, 'plat');
mid.vx = -25;
step(2);
t.eq(S.lost, lostBefore + 1, 'mid-zone gutters still eat wall-huggers');

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

// -------- neon medal: three slots, peg board, bonus ball --------
S.score = MACHINES.neon.unlock + MACHINES.bandit.unlock + 2000;
t.ok(CP.buyMachine('neon'), 'neon medal unlocks');
CP.srand(23); CP.setMachine('neon');
t.ok(Array.isArray(MACHINES.neon.slots) && MACHINES.neon.slots.length === 3, 'neon has three coin slots');
t.ok(MACHINES.neon.pegs.length >= 12, 'the peg board is populated');
// drops snap to the nearest slot mouth
S.wallet = 30; S.cd = 0; S.dropped = 1;
CP.drop(44);
const snapped = S.coins[S.coins.length - 1];
t.ok(Math.abs(snapped.x - 50) < 1, 'a drop at x=44 enters the middle slot');
// the pin dance: a real Galton-board descent that takes visible time
S.coins.length = 0;
const pegged = CP.spawnDrop(50, 20, 'coin');
let ticks = 0, deflected = false;
for (; ticks < 60 * 5 && pegged.st === 'air'; ticks++) {
  CP.tick(DT);
  if (Math.abs(pegged.x - 50) > 2) deflected = true;
}
t.ok(pegged.st !== 'air', 'pegged coin eventually lands');
t.ok(pegged.pegHits >= 2, 'coin ricocheted off several pins (' + pegged.pegHits + ' hits)');
t.ok(ticks >= 54 && ticks <= 240, 'the descent takes a visible 0.9-4s (' + (ticks / 60).toFixed(2) + 's)');
t.ok(deflected, 'the pins knocked the coin off its slot line');
t.ok(pegged.x >= 8 && pegged.x <= 92, 'pegged coin stays inside the cabinet');
const tray0 = S.tray.coins, s3 = S.score;
CP.srand(23);
const out = CP.spinSlot();
t.ok(out && out.syms && out.label, 'slot spin returns an outcome');
t.ok(S.tray.coins > tray0 || S.score > s3 || S.jackpots > 0, 'slot outcome pays something');
t.ok(S.slotAnim !== null, 'slot animation armed');
S.slotAnim = null;
S.coins.length = 0;
const ball = CP.place(50, CP.tierFront(0) - 0.5, 'ball', 0, 'plat');
ball.vy = 70;
step(2);
t.ok(S.slotAnim !== null || S.banner !== null, 'collected bonus ball triggers the slot');

// -------- landing on the pusher shelf and getting scraped off --------
CP.srand(33); CP.setMachine('gold');
S.coins.length = 0;
S.phase = Math.PI; // shelf fully extended
const rider = CP.spawnDrop(50, 15, 'coin');
rider.z = 12; rider.vz = 0; // just above the shelf top
for (let i = 0; i < 120 && !rider.onPush; i++) CP.tick(DT);
t.ok(rider.onPush, 'a coin can land ON the moving pusher shelf');
t.eq(rider.z, C.PUSH_H, 'shelf-rider sits on the shelf top');
let scraped = false, backOnField = false;
for (let i = 0; i < 60 * 6; i++) {
  CP.tick(DT);
  if (!rider.onPush) scraped = true;
  if (scraped && rider.st === 'plat' && !rider.onPush && rider.z < 0.5) { backOnField = true; break; }
}
t.ok(scraped, 'the retracting shelf scrapes the coin off its edge');
t.ok(backOnField, 'the scraped coin drops onto the field below');
t.ok(rider.y >= CP.pusherFront(0) + rider.r - 0.5, 'it now sits in front of the pusher, ready to be pushed');

// -------- neon: the machine releases bonus balls on its own --------
CP.srand(35); CP.setMachine('neon');
S.wallet = 99; S.cd = 0; S.dropped = MACHINES.neon.ballEvery - 1; S.rain.length = 0;
CP.drop(50);
t.ok(S.rain.some(r => r.kind === 'ball'), 'every Nth insert the machine releases a bonus ball');

// -------- high roller: cash bills come from the attendant --------
t.ok(CP.buyMachine('bandit'), 'high roller unlocks');
CP.srand(29); CP.setMachine('bandit');
S.wallet = 30; S.cd = 0; S.meter = C.METER_MAX - 1; S.rain.length = 0;
CP.drop(50);
t.ok(S.rain.some(r => r.kind === 'bill'), 'high roller jackpots restock wrapped cash bills');
S.coins.length = 0; S.rain.length = 0; const s4 = S.score;
const bill = CP.place(50, CP.tierFront(0) - 0.5, 'bill', 0, 'plat');
bill.vy = 70;
step(2);
t.eq(S.score, s4 + MACHINES.bandit.billVal, 'a collected bill pays big');

// -------- the Lucky Wheel --------
CP.srand(43); CP.setMachine('gold');
t.eq(CP.WHEEL.length, 8, 'the wheel has eight segments');
S.tray.coins = 0; S.tray.items.length = 0; S.tray.prizes.length = 0;
const wSnap = { pts: S.score, money: S.money, tray: 0, meter: S.meter, jp: S.jackpots };
const seg = CP.spinWheel();
t.ok(seg && seg.label, 'spin returns a segment');
t.ok(S.score > wSnap.pts || S.money > wSnap.money || S.tray.coins > 0 || S.tray.prizes.length > 0
     || S.meter !== wSnap.meter || S.jackpots > wSnap.jp || S.rain.some(r => r.kind === 'gem'),
     'every wheel segment pays something');
t.ok(S.wheelAnim !== null && typeof S.wheelAnim.seg === 'number', 'wheel animation armed');
S.wheelAnim = null; S.rain.length = 0;
// wheel chips on the field trigger a spin when collected
S.coins.length = 0;
const chip = CP.place(50, C.PLAT_FRONT - 0.5, 'chip', 0, 'plat');
chip.vy = 70;
step(1.5);
t.ok(chip.scored, 'wheel chip over the edge is collected');
t.ok(S.wheelAnim !== null, 'collected chip spins the Lucky Wheel');
S.wheelAnim = null;
// the machine restocks a chip every 30th insert
S.wallet = 99; S.cd = 0; S.dropped = 29; S.rain.length = 0;
CP.drop(50);
t.ok(S.rain.some(r => r.kind === 'chip'), 'every 30th insert the machine drops a wheel chip');

// -------- mystery gift chests --------
CP.srand(47); CP.setMachine('gold');
t.ok(S.coins.some(c => c.kind === 'chest'), 'a gift chest hides in every pile');
S.coins.length = 0; S.wheelAnim = null;
S.tray.coins = 0; S.tray.items.length = 0; S.tray.prizes.length = 0;
const cSnap = { pts: S.score, tray: 0 };
const chest = CP.place(50, C.PLAT_FRONT - 0.5, 'chest', 0, 'plat');
chest.vy = 90;
step(2);
t.ok(chest.scored, 'chest pushed over the edge opens');
t.ok(S.score > cSnap.pts || S.tray.coins > 0 || S.tray.prizes.length > 0 || S.wheelAnim !== null,
     'the chest paid out a gift');

// -------- daily gift --------
S.wallet = 10; S.money = 200; S.wheelAnim = null;
t.ok(CP.claimDaily('Mon Jul 13 2026'), 'daily gift claims on a fresh day');
t.eq(S.wallet, 35, 'daily gift pays 25 coins');
t.eq(S.money, 400, 'daily gift pays $2.00');
t.ok(S.wheelAnim !== null, 'daily gift includes a wheel spin');
t.ok(!CP.claimDaily('Mon Jul 13 2026'), 'cannot claim twice on the same day');
t.ok(CP.claimDaily('Tue Jul 14 2026'), 'a new day resets the gift');
CP.save();
t.eq(JSON.parse(store[C.SAVE_KEY]).lastDaily, 'Tue Jul 14 2026', 'daily claim is persisted');
S.wheelAnim = null;

// -------- walking around the machine: four sides, four piles --------
CP.srand(37); CP.setMachine('gold');
t.eq(S.side, 0, 'you start at the front side');
S.tray.coins = 0; S.tray.items.length = 0; S.sideSeen = {};
const side0Snapshot = JSON.stringify(S.coins.map(c => [c.x.toFixed(2), c.y.toFixed(2)]));
const marker = CP.place(50, 50, 'gem', 0, 'plat'); // remember this side by its extra gem
const side0Count = S.coins.length;
CP.switchSide(1, 1000000);
t.eq(S.side, 1, 'walking right goes to side 2');
const side1Snapshot = JSON.stringify(S.coins.map(c => [c.x.toFixed(2), c.y.toFixed(2)]));
t.ok(side1Snapshot !== side0Snapshot, 'each side carries its own pile');
CP.switchSide(1, 1000000); CP.switchSide(1, 1000000); CP.switchSide(1, 1000000);
t.eq(S.side, 0, 'four walks bring you back around');
t.eq(S.coins.length, side0Count, 'your side is exactly as you left it');
t.ok(S.coins.includes(marker), 'even the gem you memorised is still there');
// forgotten coins: some sides have a little gift waiting in the tray
S.sideSeen = {}; S.tray.coins = 0; S.tray.items.length = 0;
CP.srand(41);
let found = 0;
for (let i = 0; i < 8 && !found; i++) {
  CP.switchSide(1, 5000000 + i);
  found = S.tray.coins;
}
t.ok(found >= 1, 'sometimes someone left coins in another side\'s tray');
// but a side you just checked stays empty on the way back
CP.switchSide(1, 5000010);          // step away (this side may gift once)
const trayAfterAway = S.tray.coins;
CP.switchSide(-1, 5000020);         // return to the side checked seconds ago
t.eq(S.tray.coins, trayAfterAway, 'a freshly checked side has nothing new');
S.tray.coins = 0; S.tray.items.length = 0; S.tray.prizes.length = 0;

// -------- prize shop: buy with points, trade back for points --------
S.score = 1000; S.prizes = {};
t.ok(CP.buyPrize('paw'), 'can buy an affordable prize');
t.eq(S.score, 1000 - PRIZES.find(p => p.id === 'paw').cost, 'prize cost deducted from points');
t.eq(S.prizes.paw, 1, 'prize lands in the inventory');
t.ok(!CP.buyPrize('panda'), 'cannot buy above your points');
CP.buyPrize('paw');
t.eq(S.prizes.paw, 2, 'prizes stack in the inventory');
const sX = S.score;
t.ok(CP.exchangePrize('paw'), 'prizes exchange back into points');
t.eq(S.score, sX + Math.round(PRIZES.find(p => p.id === 'paw').cost * C.EXCHANGE),
     'exchange pays ' + Math.round(C.EXCHANGE * 100) + '% of the shop cost');
t.eq(S.prizes.paw, 1, 'exchanged prize leaves the inventory');
t.ok(!CP.exchangePrize('panda'), 'cannot exchange what you do not own');

// -------- PusherBay marketplace: bulk listings sell for MONEY --------
S.prizes = { paw: 1, boba: 6 };
S.listings.length = 0;
const keyBase = PRIZES.find(p => p.id === 'paw').base;
const duckBase = PRIZES.find(p => p.id === 'boba').base;
t.ok(CP.listPrize('paw', 0, 1000), 'can list an owned prize');
t.ok(!S.prizes.paw, 'listing removes it from the inventory');
t.eq(S.listings.length, 1, 'listing is live');
t.eq(S.listings[0].price, Math.round(keyBase * C.SELL_TIERS[0].mul), 'quick-sale price is discounted');
const mBefore = S.money;
t.ok(!CP.resolveSales(1000 + C.SELL_TIERS[0].dur - 1), 'listing has not sold yet');
t.ok(CP.resolveSales(1000 + C.SELL_TIERS[0].dur + 1), 'listing sells when its timer lapses');
t.eq(S.listings.length, 0, 'sold-out listing is cleared');
t.eq(S.money, mBefore + Math.round(keyBase * 0.7), 'sales pay MONEY, not coins');
t.ok(S.slog.length >= 1 && typeof S.slog[0].buyer === 'string' && S.slog[0].buyer.length > 0,
     'sale log records the buyer');
// bulk listing: several of the same prize sell one by one
t.ok(CP.listPrize('boba', 0, 10000, 3), 'can list three bobas at once');
t.eq(S.prizes.boba, 3, 'bulk listing takes all three from the inventory');
t.eq(S.listings[0].qty, 3, 'listing carries its quantity');
const iv = C.SELL_TIERS[0].dur, m1 = S.money;
CP.resolveSales(10000 + iv + 1);
t.eq(S.listings[0].qty, 2, 'first unit sold on schedule');
t.eq(S.money, m1 + Math.round(duckBase * 0.7), 'each unit pays its price');
CP.resolveSales(10000 + iv * 3 + 10);
t.eq(S.listings.length, 0, 'remaining units sell out over time');
t.eq(S.money, m1 + Math.round(duckBase * 0.7) * 3, 'all three units paid');
// listing cap
S.prizes.boba = 20;
for (let i = 0; i < C.LIST_MAX; i++) CP.listPrize('boba', 1, 50000, 1);
t.eq(S.listings.length, C.LIST_MAX, 'store holds ' + C.LIST_MAX + ' listings');
t.ok(!CP.listPrize('boba', 1, 50000, 1), 'over-cap listing is rejected');
S.listings.length = 0;
t.ok(!CP.listPrize('panda', 1, 50000), 'cannot list a prize you do not own');

// -------- the actual game loop: drops pay out, the house still wins --------
CP.srand(31); CP.setMachine('gold');
S.wallet = 999;
S.coinsSpent = 0; S.coinsBack = 0; S.tray.coins = 0; S.tray.items.length = 0; S.tray.prizes.length = 0;
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
CP.collectTray();
t.ok(S.coinsBack > 0, 'some coins did come back');
t.ok(S.coinsSpent > S.coinsBack, 'house edge: you always lose more coins than you win (' +
     S.coinsBack + ' back of ' + S.coinsSpent + ' spent)');

// -------- economy viability: a fresh player can actually keep playing --------
// Regression guard for "we don't earn enough points to keep playing": a
// brand-new save must earn real progress before its starting wallet runs
// dry, and a couple of cheap prizes must be able to fund the next coin pack.
CP.srand(61); CP.setMachine('gold');
S.wallet = C.START_WALLET; S.money = C.START_MONEY; S.score = 0;
CP.reset();
let freshDrops = 0;
for (let sec = 0; sec < 120 && (S.wallet > 0 || S.tray.coins > 0); sec++) {
  S.cd = 0;
  if (S.wallet > 0 && CP.drop(20 + (sec * 13) % 60)) freshDrops++;
  step(1);
  if (S.tray.coins > 0 && sec % 5 === 0) CP.collectTray(); // a player periodically scoops the tray
}
CP.collectTray();
t.ok(freshDrops >= 60, 'a fresh wallet, topped up by collecting the tray, lasts for real drops (' + freshDrops + ')');
t.ok(S.score >= MACHINES.penny.unlock, 'a single starting session earns enough to unlock the second machine');
const cheapest = PRIZES[0];
const fairEach = Math.round(cheapest.base * C.SELL_TIERS[1].mul);
const neededToFundPack = Math.ceil(C.PACKS[0].m / fairEach);
t.ok(neededToFundPack <= 3, 'selling a few of the cheapest prize funds the smallest coin pack (' +
     neededToFundPack + ' needed)');
t.ok(S.score >= cheapest.cost * neededToFundPack,
     'a fresh session earns enough points to afford those prizes');

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
t.eq(saved.v, 3, 'save is v3');
t.eq(saved.best, S.best, 'best is persisted');
t.eq(saved.wallet, S.wallet, 'wallet is persisted');
t.eq(saved.money, S.money, 'money is persisted');
t.eq(saved.score, S.score, 'points balance is persisted');
t.ok(Array.isArray(saved.unlocked) && saved.unlocked.length === 4, 'machine unlocks are persisted');
t.ok(saved.prizes && typeof saved.prizes === 'object', 'prize inventory is persisted');
t.ok(saved.tray && typeof saved.tray.coins === 'number', 'uncollected tray is persisted');
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
t.eq(CP2.S.money, CP2.C.START_MONEY, 'v1 save gets starter money');
t.ok(CP2.S.unlocked.length === 1 && CP2.S.unlocked[0] === 'gold', 'migrated save starts with gold only');
t.ok(CP2.S.listings.length === 0 && Object.keys(CP2.S.prizes).length === 0, 'migrated save has a clean store');

// -------- v2 save migration: coin-priced listings are handed back --------
const store3 = { coin_pusher_save: JSON.stringify({
  v: 2, score: 2000, best: 3000, wallet: 12, meter: 5, mute: false,
  mach: 'penny', unlocked: ['gold', 'penny'], prizes: { bear: 1 },
  listings: [{ pid: 'duck', price: 46, endT: 99 }, { pid: 'duck', price: 46, endT: 99 }],
  slog: [],
}) };
const CP3 = loadGame(store3);
t.eq(CP3.S.score, 2000, 'v2 points migrate');
t.eq(CP3.S.money, CP3.C.START_MONEY, 'v2 save gets starter money');
t.eq(CP3.S.prizes.boba, 2, 'v2 listings map to the new catalog (duck -> boba)');
t.eq(CP3.S.prizes.cat, 1, 'v2 inventory migrates (bear -> cat)');
t.eq(CP3.S.listings.length, 0, 'no stale coin-priced listings survive');
t.eq(CP3.S.mach, 'penny', 'v2 machine choice survives');

t.done();
