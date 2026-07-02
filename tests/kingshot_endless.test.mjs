// Headless suite for Kingshot Endless (arcade-idle collector rebuild).
// Evaluates the game's inline <script> with a stubbed DOM/canvas and drives
// the full loop through window.KS: kill → helmet drop → pickup → sell →
// coin vacuum → build plates → towers/porters → zone unlock → save/load.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadKingshot(store) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'kingshot_endless', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    return noop;
  } });
  const mkEl = () => new Proxy({
    style: {}, addEventListener: noop, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 840 }),
    width: 480, height: 840,
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  const audioNode = () => new Proxy(function () {}, {
    get: (_t, k) => (k === 'currentTime' ? 0 : audioNode()),
    apply: () => audioNode(),
  });
  global.AudioContext = function () { return audioNode(); };
  global.webkitAudioContext = global.AudioContext;
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 480; global.innerHeight = 840;
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: noop, userAgent: 'node' }, configurable: true, writable: true });
  global.document = { getElementById: () => mkEl(), addEventListener: noop, hidden: false };
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
  global.__KS_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.KS;
}

const t = harness('kingshot_endless');
const store = { ks_idle_muted: '1' };
const KS = loadKingshot(store);
const C = KS.constants;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) KS.tick(1 / 60); };
const drawSafe = (label) => {
  try { KS.draw(); t.ok(true, label); } catch (e) { t.ok(false, label + ' threw: ' + e.stack); }
};

// ---- boot ----
t.ok(KS && typeof KS.tick === 'function', 'KS hooks exposed');
t.ok(KS.S.started === false, 'boots to start overlay');
t.ok(KS.S.zones.length === 1, 'one zone at boot');
t.ok(KS.S.wallet === 0 && KS.S.pallet === 0, 'starts broke');
drawSafe('draw() on start overlay');
KS.start();
t.ok(KS.S.started === true, 'start() begins the game');

// ---- movement ----
const p = KS.S.player;
const x0 = p.x;
KS.S.keys.d = true; step(0.5); KS.S.keys.d = false;
t.ok(p.x > x0 + 50, 'keyboard movement moves the player');
KS.S.stick = { ax: 0, ay: 0, dx: 0, dy: -1 };
const y0 = p.y; step(0.3); KS.S.stick = null;
t.ok(p.y < y0 - 20, 'joystick movement moves the player');

// ---- auto-fire kills, helmets drop ----
KS.S.enemies.length = 0; KS.S.items.length = 0;
const z1 = KS.S.zones[0];
p.x = z1.pen.x0 + 120; p.y = 500;
KS.spawnEnemy(z1);
const foe = KS.S.enemies[0];
foe.x = p.x + 100; foe.y = p.y; foe.tx = foe.x; foe.ty = foe.y;
let guard = 0;
while (KS.S.enemies.includes(foe) && guard++ < 60 * 20) KS.tick(1 / 60);
t.ok(!KS.S.enemies.includes(foe), 'auto-fire kills a nearby enemy');
t.ok(KS.S.stats.kills >= 1, 'kill counted');
t.ok(KS.S.items.length >= 1, 'dead enemy dropped helmet(s)');

// ---- pickup + capacity ----
step(1.5); // items settle, magnet radius picks them up (player is right there)
t.ok(p.helmets.length >= 1, 'helmets magnet onto the back stack');
KS.S.items.length = 0;
p.helmets = []; for (let i = 0; i < KS.cap(); i++) p.helmets.push(1);
KS.dropHelmet(p.x, p.y, 1);
step(1);
t.ok(p.helmets.length === KS.cap(), 'stack respects capacity');
t.ok(KS.S.items.length === 1, 'overflow helmet stays on the ground');
KS.S.items.length = 0;

// ---- sell: helmets → pallet coins ----
p.x = C.SELL.x; p.y = C.SELL.y;
const helmets = p.helmets.length;
step(helmets / C.SELL_RATE + 1);
t.ok(p.helmets.length === 0, 'sell stand drains the whole stack');
t.ok(KS.S.pallet === helmets * KS.helmVal(1), 'pallet piles the exact coin value');

// ---- vacuum: pallet → wallet ----
p.x = C.PALLET.x; p.y = C.PALLET.y;
const pal = KS.S.pallet;
step(pal / C.VAC_RATE + 1);
t.ok(KS.S.pallet === 0 && KS.S.wallet === pal, 'vacuum moves every coin to the wallet');

// ---- upgrade plate: pour coins, level up ----
KS.S.wallet = 10000;
const capBefore = KS.cap();
p.x = 130 + 165; p.y = 190; // CAPACITY plate (2nd)
const capCost = KS.upgCost('cap', 0);
step(capCost / C.BUILD_RATE + 1);
t.ok(KS.S.up.cap >= 1, 'capacity upgrade purchased by standing on plate');
t.ok(KS.cap() === capBefore + 4 * KS.S.up.cap, 'capacity actually grew');
const capLvl = KS.S.up.cap;

// ---- build a tower, it kills on its own ----
const towerPlate = z1.plates.find(q => q.id === 'tower1');
KS.S.wallet = towerPlate.cost + 500;
p.x = towerPlate.x; p.y = towerPlate.y;
step(towerPlate.cost / C.BUILD_RATE + 1.5);
t.ok(towerPlate.built === true, 'tower plate fills and builds');
t.ok(z1.towers.length === 1, 'tower exists');
p.x = 620; p.y = 700; // walk player away so only the tower can do the killing
KS.S.enemies.length = 0; KS.S.items.length = 0;
KS.spawnEnemy(z1);
const foe2 = KS.S.enemies[0];
foe2.x = z1.towers[0].x + 150; foe2.y = z1.towers[0].y; foe2.tx = foe2.x; foe2.ty = foe2.y;
guard = 0;
while (KS.S.enemies.includes(foe2) && guard++ < 60 * 30) KS.tick(1 / 60);
t.ok(!KS.S.enemies.includes(foe2), 'archer tower auto-kills without the player');
drawSafe('draw() with tower + enemies');

// ---- porter: collects drops and deposits at the pallet ----
const porterPlate = z1.plates.find(q => q.id === 'porter');
KS.S.wallet = porterPlate.cost + 500;
p.x = porterPlate.x; p.y = porterPlate.y;
step(porterPlate.cost / C.BUILD_RATE + 1.5);
t.ok(porterPlate.built && z1.porters.length === 1, 'porter hired');
KS.S.items.length = 0; KS.S.enemies.length = 0;
const palBefore = KS.S.pallet;
KS.dropHelmet(z1.x0 + 400, 500, 1); KS.dropHelmet(z1.x0 + 420, 520, 1);
p.x = 620; p.y = 700;
step(30);
t.ok(KS.S.pallet > palBefore, 'porter hauled helmets to the shop → pallet grew');

// ---- zone unlock extends the world ----
const unlockPlate = z1.plates.find(q => q.id === 'unlock');
KS.S.wallet = unlockPlate.cost + 10;
const bx0 = KS.boundX();
p.x = unlockPlate.x; p.y = unlockPlate.y;
step(unlockPlate.cost / C.BUILD_RATE + 2);
t.ok(KS.S.zones.length === 2, 'zone 2 unlocked');
t.ok(KS.boundX() > bx0 + 900, 'world boundary extended');
t.ok(KS.foeHp(2) > KS.foeHp(1) && KS.helmVal(2) > KS.helmVal(1), 'zone 2 foes tougher and worth more');
drawSafe('draw() with two zones');

// ---- player death scatters the stack ----
p.helmets = [1, 1, 1];
KS.S.items.length = 0;
p.invuln = 0;
KS.hurtPlayer(1e9);
t.ok(p.hp === p.maxHp && p.helmets.length === 0, 'death resets hp and drops the stack');
t.ok(KS.S.items.length === 3, 'dropped helmets land on the ground');
t.ok(p.deaths === 1, 'death counted');

// ---- guidance arrow always has a target ----
const g = KS.guideTarget();
t.ok(g && typeof g.x === 'number' && g.label, 'guide target exists');

// ---- save / load roundtrip ----
KS.S.wallet = 777; KS.S.pallet = 55;
KS.save();
t.ok(!!store[C.SAVE_KEY], 'save written');
KS.reset();
t.ok(KS.S.wallet === 0 && KS.S.zones.length === 1, 'reset wipes live state');
t.ok(KS.load() === true, 'load succeeds');
t.ok(KS.S.wallet === 777 && KS.S.pallet >= 55, 'wallet + pallet restored');
t.ok(KS.S.zones.length === 2, 'zone count restored');
t.ok(KS.S.zones[0].towers.length === 1 && KS.S.zones[0].porters.length === 1, 'structures rebuilt from save');
t.ok(KS.S.up.cap === capLvl, 'upgrades restored');

// ---- offline earnings ----
const d = JSON.parse(store[C.SAVE_KEY]);
d.last = Date.now() - 3600 * 1000; // away 1h
store[C.SAVE_KEY] = JSON.stringify(d);
KS.reset(); KS.load();
t.ok(KS.idleRate() > 0, 'tower+porter zone generates idle income');
t.ok(KS.S.offlineAmt > 0 && KS.S.pallet >= 55 + KS.S.offlineAmt, 'offline earnings piled onto the pallet');

// ---- misc helpers ----
t.ok(KS.fmt(1234) === '1.2k' && KS.fmt(999) === '999', 'number formatting');
t.ok(KS.unlockCost(3) > KS.unlockCost(2), 'unlock costs grow');
t.ok(KS.foeName(9) !== KS.foeName(1), 'foe names cycle with suffixes');

// long smoke: run 30s of chaos with everything alive, draw every few frames
KS.start();
for (let i = 0; i < 60 * 30; i++) { KS.tick(1 / 60); if (i % 20 === 0) KS.draw(); }
t.ok(true, '30s mixed simulation with draws did not throw');

t.done();
