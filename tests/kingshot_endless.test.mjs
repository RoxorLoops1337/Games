// Headless suite for Kingshot Endless (arcade-idle collector).
// Evaluates the game's inline <script> with a stubbed DOM/canvas and drives
// the full loop through window.KS: kill → helmet drop → pickup → sell →
// coin vacuum → build plates → towers/porters → zone unlock → save/load,
// plus the v2 stations: forge, wizard, catapult, drums, gems, boss altar,
// waygate.
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
const freezeSpawns = () => { for (const z of KS.S.zones) z.spawnCd = 9999; };
const drawSafe = (label) => {
  try { KS.draw(); t.ok(true, label); } catch (e) { t.ok(false, label + ' threw: ' + e.stack); }
};

// ---- boot ----
t.ok(KS && typeof KS.tick === 'function', 'KS hooks exposed');
t.ok(KS.S.started === false, 'boots to start overlay');
t.ok(KS.S.zones.length === 1, 'one zone at boot');
t.ok(KS.S.wallet === 0 && KS.S.pallet === 0 && KS.S.gems === 0, 'starts broke');
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
foe.gold = false; foe.hp = foe.max = KS.foeHp(1);
foe.x = p.x + 100; foe.y = p.y; foe.tx = foe.x; foe.ty = foe.y;
let guard = 0;
while (KS.S.enemies.includes(foe) && guard++ < 60 * 20) KS.tick(1 / 60);
t.ok(!KS.S.enemies.includes(foe), 'auto-fire kills a nearby enemy');
t.ok(KS.S.stats.kills >= 1, 'kill counted');
t.ok(KS.S.items.length >= 1, 'dead enemy dropped helmet(s)');

// ---- pickup + capacity ----
step(1.5);
t.ok(p.helmets.length >= 1, 'helmets magnet onto the back stack');
KS.S.items.length = 0;
p.helmets = []; for (let i = 0; i < KS.cap(); i++) p.helmets.push({ k: 1 });
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

// ---- upgrade plate ----
KS.S.wallet = 10000;
const capBefore = KS.cap();
p.x = 130 + 165; p.y = 190;
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
t.ok(z1.towers.length === 1 && z1.towers[0].type === 'archer', 'archer tower exists');
p.x = 620; p.y = 700;
KS.S.enemies.length = 0; KS.S.items.length = 0;
KS.spawnEnemy(z1);
const foe2 = KS.S.enemies[0];
foe2.gold = false; foe2.hp = foe2.max = KS.foeHp(1);
foe2.x = z1.towers[0].x + 150; foe2.y = z1.towers[0].y; foe2.tx = foe2.x; foe2.ty = foe2.y;
guard = 0;
while (KS.S.enemies.includes(foe2) && guard++ < 60 * 30) KS.tick(1 / 60);
t.ok(!KS.S.enemies.includes(foe2), 'archer tower auto-kills without the player');
drawSafe('draw() with tower + enemies');

// ---- porter ----
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

// ---- zone unlock ----
const unlockPlate = z1.plates.find(q => q.id === 'unlock');
KS.S.wallet = unlockPlate.cost + 10;
const bx0 = KS.boundX();
p.x = unlockPlate.x; p.y = unlockPlate.y;
step(unlockPlate.cost / C.BUILD_RATE + 2);
t.ok(KS.S.zones.length === 2, 'zone 2 unlocked');
t.ok(KS.boundX() > bx0 + 900, 'world boundary extended');
t.ok(KS.foeHp(2) > KS.foeHp(1) && KS.helmVal(2) > KS.helmVal(1), 'zone 2 foes tougher and worth more');
const z2 = KS.S.zones[1];
t.ok(z2.plates.some(q => q.id === 'catapult') && z2.plates.some(q => q.id === 'altar'), 'zone 2 rotates in catapult + boss altar');
drawSafe('draw() with two zones');

// ---- forge: helmets → gold bars worth x3 ----
KS.S.wallet = KS.S.forgePlate.cost + 500;
p.x = C.FORGE.x; p.y = C.FORGE.y;
step(KS.S.forgePlate.cost / C.BUILD_RATE + 1);
t.ok(KS.S.forgePlate.built && !!KS.S.forge, 'forge built by pouring coins');
KS.S.enemies.length = 0; freezeSpawns();
p.helmets = [{ k: 1 }, { k: 1 }, { k: 1 }];
step(1.5); // standing at intake feeds the queue
t.ok(KS.S.forge.queue.length === 3 && p.helmets.length === 0, 'intake eats plain helmets');
p.x = 620; p.y = 700;
step(C.FORGE_T * 3 + 1);
t.ok(KS.S.forge.tray.length === 3, 'smelter turned queue into bars on the tray');
p.x = C.TRAY.x; p.y = C.TRAY.y;
step(1.5);
t.ok(p.helmets.length === 3 && p.helmets.every(e => e.bar), 'bars picked up from the tray');
t.ok(KS.entryVal(p.helmets[0]) === KS.helmVal(1) * C.BAR_MUL, 'a bar is worth x' + C.BAR_MUL);
const palB = KS.S.pallet;
p.x = C.SELL.x; p.y = C.SELL.y;
step(1.5);
t.ok(KS.S.pallet === palB + 3 * KS.helmVal(1) * C.BAR_MUL, 'selling bars pays triple');

// ---- wizard tower: chain lightning ----
KS.S.enemies.length = 0; KS.S.shots.length = 0; freezeSpawns();
p.x = 620; p.y = 700;
const savedTowers = z1.towers;
z1.towers = [{ type: 'wizard', x: z1.x0 + 300, y: 400, k: 1, cd: 0 }];
for (let i = 0; i < 3; i++) {
  KS.spawnEnemy(z1);
  const e = KS.S.enemies[i];
  e.gold = false; e.hp = e.max = 1000;
  e.x = z1.x0 + 340 + i * 60; e.y = 420; e.tx = e.x; e.ty = e.y; e.wanderT = 99;
}
KS.tick(1 / 60);
const zapped = KS.S.enemies.filter(e => e.hp < e.max).length;
t.ok(zapped >= 2, 'wizard chain lightning hits multiple enemies (' + zapped + ')');
t.ok(KS.S.fx.some(q => q.kind === 'zap'), 'lightning fx spawned');
z1.towers = savedTowers;

// ---- catapult: AoE boulder ----
const catPlate = z2.plates.find(q => q.id === 'catapult');
KS.S.wallet = catPlate.cost + 500;
p.x = catPlate.x; p.y = catPlate.y;
step(catPlate.cost / C.BUILD_RATE + 1.5);
t.ok(catPlate.built && z2.towers.some(tw => tw.type === 'catapult'), 'catapult built in zone 2');
KS.S.enemies.length = 0; freezeSpawns();
p.x = 620; p.y = 700;
for (let i = 0; i < 3; i++) {
  KS.spawnEnemy(z2);
  const e = KS.S.enemies[i];
  e.gold = false; e.hp = e.max = 1e6;
  e.x = z2.x0 + 500 + (i % 2) * 40; e.y = 500 + i * 30; e.tx = e.x; e.ty = e.y; e.wanderT = 99;
}
step(6);
const boomed = KS.S.enemies.filter(e => e.hp < e.max).length;
t.ok(boomed >= 2, 'catapult boulder splashed the cluster (' + boomed + ')');

// ---- war drums aura ----
KS.S.enemies.length = 0;
p.x = 620; p.y = 700;
const rateHub = KS.pRate();
z1.drums = true;
p.x = z1.x0 + 200;
t.ok(Math.abs(KS.pRate() - rateHub * C.DRUM_MUL) < 1e-9, 'war drums speed up fire rate inside the zone');
z1.drums = false;
p.x = 620; p.y = 700;

// ---- golden enemy drops a gem, gem is picked up ----
KS.S.items.length = 0; freezeSpawns();
KS.spawnEnemy(z1);
const goldFoe = KS.S.enemies[KS.S.enemies.length - 1];
goldFoe.gold = true; goldFoe.x = z1.x0 + 200; goldFoe.y = 500;
const gems0 = KS.S.gems;
KS.hurtEnemy(goldFoe, 1e9);
t.ok(KS.S.items.some(i => i.gem), 'golden enemy dropped a gem');
p.x = goldFoe.x; p.y = goldFoe.y;
step(1);
t.ok(KS.S.gems === gems0 + 1, 'gem auto-collected into the gem counter');
KS.S.items.length = 0; KS.S.enemies.length = 0;

// ---- gem shrine upgrade ----
KS.S.gems = 20;
const pickBefore = KS.pickR();
p.x = 110; p.y = 480; // MAGNET shrine
step(2.5);
t.ok(KS.S.gemUp.magnet >= 1, 'gem shrine purchased with gems');
t.ok(KS.pickR() > pickBefore, 'magnet range actually grew');
p.x = 620; p.y = 700;

// ---- boss altar → boss → crown ----
const altarPlate = z2.plates.find(q => q.id === 'altar');
KS.S.wallet = altarPlate.cost + 500;
p.x = altarPlate.x; p.y = altarPlate.y;
step(altarPlate.cost / C.BUILD_RATE + 1);
t.ok(altarPlate.built && !!z2.altar, 'boss altar built');
KS.tick(1 / 60); // standing on the ready altar summons
const boss = KS.S.enemies.find(e => e.boss);
t.ok(!!boss, 'standing on the altar summoned a boss');
t.ok(z2.altar.cd > 0, 'altar went on cooldown');
t.ok(boss.max > KS.foeHp(2) * 10, 'boss is a damage sponge');
p.x = 620; p.y = 700;
KS.S.items.length = 0;
KS.hurtEnemy(boss, 1e12);
t.ok(KS.S.items.some(i => i.crown), 'boss dropped a crown');
t.ok(KS.S.items.filter(i => i.gem).length >= 2, 'boss dropped gems');
t.ok(KS.entryVal({ k: 2, crown: true }) >= KS.helmVal(2) * C.CROWN_MUL, 'crown is a jackpot');
t.ok(KS.S.stats.bosses === 1, 'boss kill counted');
KS.S.items.length = 0; KS.S.enemies.length = 0;
drawSafe('draw() with altar + forge + shrine');

// ---- waygate: build + warp ----
KS.S.wallet = KS.S.wayPlate.cost + 100;
p.x = C.HUBPAD.x; p.y = C.HUBPAD.y;
step(KS.S.wayPlate.cost / C.BUILD_RATE + 1);
t.ok(KS.S.waygate === true, 'waygate built');
t.ok(KS.warpPads().length === 1 + KS.S.zones.length, 'pads exist at hub + every zone');
p.x = C.HUBPAD.x; p.y = C.HUBPAD.y; // stand still on the pad
step(C.WARP_T + 0.5);
t.ok(p.x > C.HUB_W, 'warped from hub to the newest zone');
p.x = 620; p.y = 700;

// ---- player death scatters the stack ----
p.helmets = [{ k: 1 }, { k: 1, bar: true }, { k: 2, crown: true }];
KS.S.items.length = 0;
p.invuln = 0;
KS.hurtPlayer(1e9);
t.ok(p.hp === p.maxHp && p.helmets.length === 0, 'death resets hp and drops the stack');
t.ok(KS.S.items.length === 3 && KS.S.items.some(i => i.crown) && KS.S.items.some(i => i.bar), 'dropped items keep their kind');
t.ok(p.deaths === 1, 'death counted');
KS.S.items.length = 0;

// ---- guidance arrow ----
const g = KS.guideTarget();
t.ok(g && typeof g.x === 'number' && g.label, 'guide target exists');

// ---- save / load roundtrip (v2) ----
KS.S.wallet = 777; KS.S.pallet = 55; KS.S.gems = 9;
KS.save();
t.ok(!!store[C.SAVE_KEY], 'save written');
KS.reset();
t.ok(KS.S.wallet === 0 && KS.S.zones.length === 1 && !KS.S.forge, 'reset wipes live state');
t.ok(KS.load() === true, 'load succeeds');
t.ok(KS.S.wallet === 777 && KS.S.pallet >= 55 && KS.S.gems === 9, 'wallet + pallet + gems restored');
t.ok(KS.S.zones.length === 2, 'zone count restored');
t.ok(KS.S.zones[0].towers.length === 1 && KS.S.zones[0].porters.length === 1, 'zone 1 structures rebuilt');
t.ok(KS.S.zones[1].towers.some(tw => tw.type === 'catapult'), 'catapult restored');
t.ok(!!KS.S.zones[1].altar, 'altar restored');
t.ok(!!KS.S.forge && KS.S.forgePlate.built, 'forge restored');
t.ok(KS.S.waygate === true, 'waygate restored');
t.ok(KS.S.up.cap === capLvl && KS.S.gemUp.magnet >= 1, 'coin + gem upgrades restored');

// ---- offline earnings ----
const d = JSON.parse(store[C.SAVE_KEY]);
d.last = Date.now() - 3600 * 1000;
store[C.SAVE_KEY] = JSON.stringify(d);
KS.reset(); KS.load();
t.ok(KS.idleRate() > 0, 'tower+porter zone generates idle income');
t.ok(KS.S.offlineAmt > 0 && KS.S.pallet >= 55 + KS.S.offlineAmt, 'offline earnings piled onto the pallet');

// ---- misc helpers ----
t.ok(KS.fmt(1234) === '1.2k' && KS.fmt(999) === '999', 'number formatting');
t.ok(KS.unlockCost(3) > KS.unlockCost(2), 'unlock costs grow');
t.ok(KS.foeName(9) !== KS.foeName(1), 'foe names cycle with suffixes');
t.ok(KS.gemUpCost('crit', 2) > KS.gemUpCost('crit', 0), 'gem costs grow');

// ---- long smoke: 30s of chaos with draws ----
KS.start();
for (let i = 0; i < 60 * 30; i++) { KS.tick(1 / 60); if (i % 20 === 0) KS.draw(); }
t.ok(true, '30s mixed simulation with draws did not throw');

t.done();
