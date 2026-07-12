// Headless suite for Gold Rush (coin pusher). The game's inline <script> is
// evaluated with a stubbed DOM and no canvas ctx, which flips its HEADLESS
// switch: the full 2.5D sim (pusher, coin pile, edge falls, gutters, combos,
// jackpot, wallet regen, save/load) runs and is driven through window.CP.
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
const { S, C } = CP;
const DT = 1 / 60;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) CP.tick(DT); };
const platCoins = () => S.coins.filter(c => c.st === 'plat');

// -------- boot state --------
t.ok(CP.HEADLESS, 'headless mode detected');
t.eq(S.score, 0, 'starts at score 0');
t.eq(S.wallet, C.START_WALLET, 'starts with full wallet');
t.ok(platCoins().length >= 30, 'initial pile has a healthy coin count');
t.ok(S.coins.some(c => c.kind === 'gem'), 'initial pile contains a gem');
t.ok(S.coins.some(c => c.kind === 'lucky'), 'initial pile contains lucky coins');
t.ok(platCoins().every(c => c.y >= C.PUSH_MIN && c.y <= C.PLAT_FRONT + c.r), 'pile coins sit on the platform');

// -------- pusher kinematics --------
CP.srand(42); CP.reset();
let lo = 1e9, hi = -1e9;
for (let i = 0; i < 300; i++) { CP.step(DT, true); const f = CP.pusherFront(); lo = Math.min(lo, f); hi = Math.max(hi, f); }
t.ok(lo >= C.PUSH_MIN - 0.01 && hi <= C.PUSH_MAX + 0.01, 'pusher stays within its travel');
t.ok(hi - lo > (C.PUSH_MAX - C.PUSH_MIN) * 0.8, 'pusher sweeps most of its travel');

// -------- pusher actually pushes --------
CP.srand(42); CP.reset();
S.coins.length = 0;
S.phase = 0; // front at PUSH_MIN, about to advance
const pushed = CP.place(50, C.PUSH_MIN + C.COIN_R + 0.5, 'coin', 0, 'plat');
step(C.PUSH_PERIOD / 2); // half a cycle: full extension
t.ok(pushed.y > C.PUSH_MIN + C.COIN_R + 8, 'coin in contact gets shoved forward');
const yAtFull = pushed.y;
step(C.PUSH_PERIOD / 2); // pusher retracts
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
CP.srand(7); CP.reset();
const w0 = S.wallet, n0 = S.coins.length, m0 = S.meter;
t.ok(CP.drop(50), 'drop accepted');
t.eq(S.wallet, w0 - 1, 'drop costs one coin');
t.eq(S.coins.length, n0 + 1, 'drop spawns a coin');
t.eq(S.meter, m0 + 1, 'drop feeds the jackpot meter');
t.ok(!CP.drop(50), 'cooldown blocks an immediate second drop');
const dropped = S.coins[S.coins.length - 1];
t.eq(dropped.st, 'drop', 'spawned coin is falling from the slot');
step(2);
t.ok(dropped.st === 'plat', 'dropped coin lands on the platform');
t.ok(dropped.y >= CP.pusherFront() + dropped.r - 0.01, 'landed coin is in front of the pusher');

// wallet floor
S.wallet = 0; S.cd = 0;
t.ok(!CP.drop(50), 'cannot drop with an empty wallet');
t.eq(S.wallet, 0, 'wallet never goes negative');

// -------- wallet regen --------
S.wallet = 3; S.regen = 0;
step(C.REGEN_T + 0.1);
t.ok(S.wallet >= 4, 'wallet trickles back over time');
S.wallet = C.REGEN_CAP;
step(C.REGEN_T + 0.1);
t.eq(S.wallet, C.REGEN_CAP, 'regen respects the cap');

// -------- edge fall scores, combo chains --------
CP.srand(9); CP.reset();
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99;
const f1 = CP.place(40, C.PLAT_FRONT - 1, 'coin', 0, 'plat');
const f2 = CP.place(60, C.PLAT_FRONT - 1, 'coin', 0, 'plat');
f1.vy = 30; f2.vy = 30;
step(0.9); // both are over the edge and in the tray, combo window still open
t.ok(f1.scored && f2.scored, 'both coins over the edge were scored');
t.eq(S.score, C.PTS.coin + C.PTS.coin * 2, 'second coin in the window pays the combo multiplier');
t.eq(S.combo, 2, 'combo counter tracked the chain');
step(C.COMBO_WIN + 0.6);
t.eq(S.combo, 0, 'combo lapses after the window');

// combo cap
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99;
for (let i = 0; i < 8; i++) {
  const c = CP.place(12 + i * 10, C.PLAT_FRONT - 0.5, 'coin', 0, 'plat');
  c.vy = 40;
}
step(2.5);
const capPts = (() => { let s = 0; for (let i = 1; i <= 8; i++) s += C.PTS.coin * Math.min(i, C.COMBO_CAP); return s; })();
t.eq(S.score, capPts, 'combo multiplier caps at ×' + C.COMBO_CAP);

// -------- payouts per kind --------
CP.srand(11); CP.reset();
S.coins.length = 0; S.score = 0; S.combo = 0; S.lastCollect = -99;
let w1 = S.wallet;
const lucky = CP.place(50, C.PLAT_FRONT - 0.5, 'lucky', 0, 'plat');
lucky.vy = 40;
step(2);
t.eq(S.score, C.PTS.lucky, 'lucky coin pays 50');
t.eq(S.wallet, w1 + C.PAY.lucky, 'lucky coin refunds 2 to the wallet');
S.combo = 0; S.lastCollect = -99; w1 = S.wallet; const s1 = S.score;
const gem = CP.place(50, C.PLAT_FRONT - 0.5, 'gem', 0, 'plat');
gem.vy = 40;
step(2);
t.eq(S.score, s1 + C.PTS.gem, 'gem pays 500 flat');
t.eq(S.wallet, w1 + C.PAY.gem, 'gem refunds 5 to the wallet');

// -------- gutters eat coins silently --------
CP.srand(13); CP.reset();
S.coins.length = 0; S.score = 0;
const g1 = CP.place(3, C.GUT_Y + 10, 'coin', 0, 'plat');
g1.vx = -20;
const lost0 = S.lost;
step(3);
t.eq(S.lost, lost0 + 1, 'coin drifting off the side is lost');
t.eq(S.score, 0, 'gutter coins never score');
t.ok(!S.coins.includes(g1), 'gutter coin was removed from the world');
// back walls still solid before the gutters open
S.coins.length = 0;
const g2 = CP.place(6, C.GUT_Y - 15, 'coin', 0, 'plat');
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
step(1.3); // the whole rain has spawned but nothing has been collected yet
t.ok(S.coins.length >= before + 8, 'jackpot rained bonus coins onto the platform');
t.ok(S.banner === null || S.banner.ttl > 0, 'banner state is sane');

// -------- the actual game loop: drops eventually pay out --------
CP.srand(23); CP.reset();
S.wallet = 999;
const startScore = S.score;
let drops = 0;
for (let sec = 0; sec < 90; sec++) {
  S.cd = 0;
  if (CP.drop(20 + (sec * 13) % 60)) drops++;
  step(1);
}
t.ok(drops > 60, 'kept dropping coins throughout');
t.ok(S.score > startScore, 'sustained play pushes coins off the edge and scores');
t.ok(S.collected > 0, 'collected counter tracks payouts');

// -------- stability: no NaN, no explosion, pile stays coherent --------
let sane = true, contained = true;
for (const c of S.coins) {
  if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.z)) sane = false;
  if (c.st === 'plat' && (c.x < -2 || c.x > C.W + 2 || c.y < C.PUSH_MIN - 2 || c.y > C.PLAT_FRONT + c.r + 1)) contained = false;
}
t.ok(sane, 'no NaN/Infinity positions after long play');
t.ok(contained, 'platform coins stay within the machine');
step(6); // let everything settle with no input
let worstOverlap = 0;
const pc = platCoins().filter(c => c.lay === 0);
for (let i = 0; i < pc.length; i++) for (let j = i + 1; j < pc.length; j++) {
  const dx = pc[i].x - pc[j].x, dy = pc[i].y - pc[j].y;
  const pen = (pc[i].r + pc[j].r) - Math.hypot(dx, dy);
  if (pen > worstOverlap) worstOverlap = pen;
}
t.ok(worstOverlap < C.COIN_R * 0.7, 'settled pile has no severe interpenetration');
t.ok(S.coins.length <= C.MAX_COINS, 'coin count respects the hard cap');

// -------- best score + persistence --------
t.ok(S.best >= S.score, 'best tracks the high water mark');
const saved = JSON.parse(store[C.SAVE_KEY]);
t.eq(saved.best, S.best, 'best is persisted');
t.eq(saved.wallet, S.wallet, 'wallet is persisted');
t.eq(saved.score, S.score, 'running score is persisted');
S.mute = true; CP.save();
t.ok(JSON.parse(store[C.SAVE_KEY]).mute === true, 'mute is persisted');

// reset keeps best, restarts the run
const bestBefore = S.best;
CP.reset();
t.eq(S.score, 0, 'reset clears the score');
t.eq(S.best, bestBefore, 'reset keeps the best score');
t.eq(S.wallet, C.START_WALLET, 'reset refills the wallet');
t.ok(platCoins().length >= 30, 'reset rebuilds the pile');

t.done();
