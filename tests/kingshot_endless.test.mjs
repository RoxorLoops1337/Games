// Headless suite for Kingshot Endless (arcade-idle collector).
// Evaluates the game's inline <script> with a stubbed DOM/canvas and drives
// the full loop through window.KS: kill → helmet drop → pickup → sell →
// coin vacuum → build plates → towers/porters → four-direction land grid →
// forge, wizard, catapult, drums, gems, boss altar, waygate, repeatable
// stations (horde gate / train towers / +porter) → save/load.
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
KS.tick(1 / 60); // housekeeping rolls quests + dailies
t.ok(KS.S.quests.length === 3 && KS.S.dailies.length === 3, 'three side quests + three dailies active');
// neuter targets so ambient kills/sells during the suite never complete them
for (const q of KS.S.quests.concat(KS.S.dailies)) q.target = 9e9;

// ---- world grid geometry ----
t.ok(KS.cellFor(1).cx === 1 && KS.cellFor(1).cy === 0, 'zone 1 grows EAST');
t.ok(KS.cellFor(2).cx === 0 && KS.cellFor(2).cy === 1, 'zone 2 grows SOUTH');
t.ok(KS.cellFor(3).cx === -1 && KS.cellFor(4).cy === -1, 'zones 3/4 grow WEST/NORTH');
t.ok(KS.cellFor(5).cx === 2, 'zone 5 extends the east arm');
t.ok(KS.inWalkable(500, 500) === true, 'hub is walkable');
t.ok(KS.inWalkable(C.CELL_W + 500, 500) === true, 'zone 1 is walkable');
t.ok(KS.inWalkable(500, -500) === false, 'locked forest is not walkable');

// ---- movement + forest boundary ----
const p = KS.S.player;
const x0 = p.x;
KS.S.keys.d = true; step(0.5); KS.S.keys.d = false;
t.ok(p.x > x0 + 50, 'keyboard movement moves the player');
KS.S.stick = { ax: 0, ay: 0, dx: 0, dy: -1 };
const y0 = p.y; step(0.3); KS.S.stick = null;
t.ok(p.y < y0 - 20, 'joystick movement moves the player');
p.x = 500; p.y = 30;
KS.S.keys.w = true; step(1); KS.S.keys.w = false;
t.ok(p.y >= 0, 'dark forest blocks walking north out of the hub');

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

// ---- coin flow accelerates exponentially while standing ----
KS.S.pallet = 1000000;
const w0 = KS.S.wallet;
step(1);
const firstSec = KS.S.wallet - w0;
step(3);
const fourSec = KS.S.wallet - w0;
t.ok(fourSec > firstSec * 8, 'vacuum speeds up exponentially (' + firstSec + '¢ in 1s → ' + fourSec + '¢ in 4s)');
t.ok(KS.flowMul() > 10, 'flow multiplier climbs while standing');
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
KS.tick(1 / 60);
t.ok(KS.flowMul() <= 1.01, 'flow resets after walking away');
KS.S.pallet = 0; KS.S.wallet = pal;

// ---- upgrade plate ----
KS.S.wallet = 10000;
const capBefore = KS.cap();
p.x = C.UPG_X0 + C.UPG_STEP; p.y = C.UPG_Y; // CAPACITY plate
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
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
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
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
step(30);
t.ok(KS.S.pallet > palBefore, 'porter hauled helmets to the shop → pallet grew');

// ---- repeatable: +porter ----
const ppPlate = z1.plates.find(q => q.id === 'porterPlus');
KS.S.wallet = ppPlate.cost + 500;
p.x = ppPlate.x; p.y = ppPlate.y;
step(ppPlate.cost / C.BUILD_RATE + 1);
t.ok(z1.porters.length >= 2 && ppPlate.lvl >= 1, '+PORTER hires more porters');
t.ok(ppPlate.cost > ppPlate.base, 'repeatable cost grows with level');

// ---- repeatable: horde gate ----
const hordePlate = z1.plates.find(q => q.id === 'gate2');
const aliveCap0 = KS.maxAlive(z1), int0 = KS.spawnInt(z1);
KS.S.wallet = hordePlate.cost + 200;
p.x = hordePlate.x; p.y = hordePlate.y;
step(hordePlate.cost / C.BUILD_RATE + 1);
t.ok(z1.hordeLvl >= 1, 'horde gate levels up');
t.ok(KS.maxAlive(z1) > aliveCap0 && KS.spawnInt(z1) < int0, 'bigger waves: more alive, faster spawns');

// ---- repeatable: train towers ----
const trainPlate = z1.plates.find(q => q.id === 'towersUp');
const mul0 = KS.towerMul(z1);
KS.S.wallet = trainPlate.cost + 200;
p.x = trainPlate.x; p.y = trainPlate.y;
KS.S.enemies.length = 0; freezeSpawns();
step(trainPlate.cost / C.BUILD_RATE + 1);
t.ok(z1.towerLvl >= 1 && KS.towerMul(z1) > mul0, 'tower training raises zone tower damage');

// ---- zone unlock: the world grows SOUTH ----
const unlockPlate = z1.plates.find(q => q.id === 'unlock');
KS.S.wallet = unlockPlate.cost + 10;
const maxY0 = KS.worldBounds().maxY;
p.x = unlockPlate.x; p.y = unlockPlate.y;
step(unlockPlate.cost / C.BUILD_RATE + 2);
t.ok(KS.S.zones.length === 2, 'zone 2 unlocked');
const z2 = KS.S.zones[1];
t.ok(z2.cx === 0 && z2.cy === 1, 'zone 2 sits SOUTH of the hub');
t.ok(KS.worldBounds().maxY > maxY0, 'world bounds extended southward');
t.ok(KS.inWalkable(500, C.CELL_H + 500) === true, 'new land is walkable');
t.ok(KS.foeHp(2) > KS.foeHp(1) && KS.helmVal(2) > KS.helmVal(1), 'zone 2 foes tougher and worth more');
t.ok(z2.plates.some(q => q.id === 'catapult') && z2.plates.some(q => q.id === 'altar'), 'zone 2 rotates in catapult + boss altar');
drawSafe('draw() with two zones + treelines');

// ---- forge: helmets → gold bars worth x3 ----
KS.S.wallet = KS.S.forgePlate.cost + 500;
p.x = C.FORGE.x; p.y = C.FORGE.y;
step(KS.S.forgePlate.cost / C.BUILD_RATE + 1);
t.ok(KS.S.forgePlate.built && !!KS.S.forge, 'forge built by pouring coins');
KS.S.enemies.length = 0; freezeSpawns();
// clean slate: earlier tests may have left strays in the stack/queue
p.helmets = []; KS.S.forge.queue.length = 0; KS.S.forge.tray.length = 0; KS.S.forge.smeltT = 0;
p.helmets = [{ k: 1 }, { k: 1 }, { k: 1 }];
step(1.5);
t.ok(KS.S.forge.queue.length === 3 && p.helmets.length === 0, 'intake eats plain helmets');
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
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

// ---- smelter ONLY accepts shields (helmets), not other resources ----
p.helmets = []; KS.S.forge.queue.length = 0; KS.S.forge.tray.length = 0; KS.S.forge.smeltT = 0;
p.helmets = [{ k: 2, log: true }, { k: 2, stone: true }, { k: 2, res: 'wheat' }, { k: 2, plank: true }, { k: 2, bar: true }];
p.x = C.FORGE.x; p.y = C.FORGE.y;
step(2);
t.ok(KS.S.forge.queue.length === 0, 'smelter refuses logs/stones/produce/planks/bars — no free gold bars');
t.ok(p.helmets.length === 5, 'those materials stay on your back');
p.helmets = [];

// ---- metal tiers: which shield you smelt decides the metal ----
t.ok(KS.metal(1).name === 'copper' && KS.metal(4).name === 'gold' && KS.metal(8).name === 'uranium', 'tiers map to named metals (copper→…→uranium)');
t.ok(KS.metal(3).col !== KS.metal(4).col, 'different tiers smelt to different-colored bars (purple shields → their own bar)');
t.ok(KS.metal(9).name.startsWith('copper'), 'metals cycle with a tier suffix past uranium');
t.ok(KS.entryVal({ k: 6, bar: true }) > KS.entryVal({ k: 2, bar: true }), 'a higher-tier metal bar is worth more');
p.x = C.SPAWN.x; p.y = C.SPAWN.y;

// ---- porters route shields into the smelter (x3) instead of selling raw ----
KS.S.forge.queue.length = 0; KS.S.forge.tray.length = 0;
const pz = KS.S.zones[0];
if (!pz.porters.length) KS.applyPlate(pz, pz.plates.find(q => q.id === 'porter'));
const po = pz.porters[0];
po.state = 'sell'; po.carry = [{ k: 1 }, { k: 1 }, { k: 2, crown: true }]; // 2 shields + 1 crown
const palPo = KS.S.pallet;
step(20);
t.ok(KS.S.forge.queue.length + KS.S.forge.tray.length >= 2, 'porter fed its shields into the smelter');
t.ok(KS.S.pallet > palPo, 'porter still sold the non-shield loot (the crown) at the stand');
KS.S.forge.queue.length = 0; KS.S.forge.tray.length = 0;

// ---- wizard tower: chain lightning ----
KS.S.enemies.length = 0; KS.S.shots.length = 0; freezeSpawns();
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
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
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
for (let i = 0; i < 3; i++) {
  KS.spawnEnemy(z2);
  const e = KS.S.enemies[i];
  e.gold = false; e.hp = e.max = 1e6;
  e.x = z2.x0 + 500 + (i % 2) * 40; e.y = z2.y0 + 500 + i * 30; e.tx = e.x; e.ty = e.y; e.wanderT = 99;
}
step(6);
const boomed = KS.S.enemies.filter(e => e.hp < e.max).length;
t.ok(boomed >= 2, 'catapult boulder splashed the cluster (' + boomed + ')');

// ---- war drums aura ----
KS.S.enemies.length = 0;
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
const rateHub = KS.pRate();
z1.drums = true;
p.x = z1.x0 + 200; p.y = 500;
t.ok(Math.abs(KS.pRate() - rateHub * C.DRUM_MUL) < 1e-9, 'war drums speed up fire rate inside the zone');
z1.drums = false;
p.x = C.SPAWN.x; p.y = C.SPAWN.y;

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

// ---- enemy archetypes: every foe family behaves differently ----
t.ok(KS.foeArch(1) === 'melee' && KS.foeArch(2) === 'fast' && KS.foeArch(3) === 'tank' && KS.foeArch(4) === 'spitter', 'foe families map to distinct archetypes');
KS.S.enemies.length = 0; freezeSpawns();
// spawn until we get a non-gold foe (gold doubles HP — irrelevant to the archetype test)
let fastFoe = null;
for (let i = 0; i < 40 && !fastFoe; i++) { KS.S.enemies.length = 0; KS.spawnEnemy(z2); if (!KS.S.enemies[0].gold) fastFoe = KS.S.enemies[0]; }
t.ok(fastFoe && fastFoe.arch === 'fast' && fastFoe.max < KS.foeHp(2), 'fast foes trade hp for speed');
KS.S.enemies.length = 0; KS.S.eshots.length = 0;
KS.spawnEnemy(z1);
const spit = KS.S.enemies[0];
spit.arch = 'spitter'; spit.gold = false; spit.hp = spit.max = 1e6; spit.atkCd = 0;
spit.x = z1.pen.x0 + 300; spit.y = 500; spit.tx = spit.x; spit.ty = spit.y; spit.wanderT = 99;
p.x = spit.x + 250; p.y = 500;
step(2);
t.ok(KS.S.eshots.length >= 1, 'spitter lobs hostile projectiles');
t.ok(Math.hypot(spit.x - p.x, spit.y - p.y) > 150, 'spitter keeps its distance');
KS.S.enemies.length = 0; KS.S.eshots.length = 0; KS.S.shots.length = 0;
p.x = C.SPAWN.x; p.y = C.SPAWN.y; p.hp = p.maxHp;

// ---- boss variety: bosses inherit the land archetype ----
KS.S.enemies.length = 0; freezeSpawns();
KS.spawnEnemy(z2, { boss: true }); // zone 2 = fast land
const fastBoss = KS.S.enemies[0];
t.ok(fastBoss.boss && fastBoss.arch === 'fast', 'a fast-land boss is a charger, not plain melee');
t.ok(fastBoss.max > KS.foeHp(2) * 10, 'boss is still a damage sponge');
KS.S.enemies.length = 0; KS.S.eshots.length = 0;
// a spitter-land boss bombards with a 3-shot spread from range (zone 4 = spitter land)
while (KS.S.zones.length < 4) KS.S.zones.push(KS.mkZone(KS.S.zones.length + 1));
const z4 = KS.S.zones[3];
freezeSpawns();
KS.spawnEnemy(z4, { boss: true });
const spitBoss = KS.S.enemies.find(e => e.boss);
t.ok(spitBoss && spitBoss.arch === 'spitter', 'a spitter-land boss inherits the spitter archetype');
spitBoss.hp = spitBoss.max = 1e9; spitBoss.atkCd = 0;
spitBoss.x = z4.pen.x0 + 300; spitBoss.y = z4.pen.y0 + 300; spitBoss.tx = spitBoss.x; spitBoss.ty = spitBoss.y; spitBoss.wanderT = 99;
p.x = spitBoss.x + 300; p.y = spitBoss.y;
KS.S.eshots.length = 0;
KS.tick(1 / 60); // one volley
t.ok(KS.S.eshots.filter(es => es.big).length >= 3, 'spitter boss fires a 3-shot big-projectile spread');
KS.S.enemies.length = 0; KS.S.eshots.length = 0; KS.S.shots.length = 0;
while (KS.S.zones.length > 2) KS.S.zones.pop(); // restore for later tests
p.x = C.SPAWN.x; p.y = C.SPAWN.y; p.hp = p.maxHp;

// ---- gem shrine upgrade ----
KS.S.gems = 20;
const pickBefore = KS.pickR();
p.x = C.GEM_X; p.y = C.GEM_Y0; // MAGNET shrine
step(2.5);
t.ok(KS.S.gemUp.magnet >= 1, 'gem shrine purchased with gems');
t.ok(KS.pickR() > pickBefore, 'magnet range actually grew');
p.x = C.SPAWN.x; p.y = C.SPAWN.y;

// ---- boss altar → boss → crown ----
const altarPlate = z2.plates.find(q => q.id === 'altar');
KS.S.wallet = altarPlate.cost + 500;
p.x = altarPlate.x; p.y = altarPlate.y;
step(altarPlate.cost / C.BUILD_RATE + 1);
t.ok(altarPlate.built && !!z2.altar, 'boss altar built');
KS.tick(1 / 60);
const boss = KS.S.enemies.find(e => e.boss);
t.ok(!!boss, 'standing on the altar summoned a boss');
t.ok(z2.altar.cd > 0, 'altar went on cooldown');
t.ok(boss.max > KS.foeHp(2) * 10, 'boss is a damage sponge');
p.x = C.SPAWN.x; p.y = C.SPAWN.y;
KS.S.items.length = 0;
KS.hurtEnemy(boss, 1e12);
t.ok(KS.S.items.some(i => i.crown), 'boss dropped a crown');
t.ok(KS.S.items.filter(i => i.gem).length >= 2, 'boss dropped gems');
t.ok(KS.entryVal({ k: 2, crown: true }) >= KS.helmVal(2) * C.CROWN_MUL, 'crown is a jackpot');
t.ok(KS.S.stats.bosses === 1, 'boss kill counted');
KS.S.items.length = 0; KS.S.enemies.length = 0;
drawSafe('draw() with altar + forge + shrine + coin mountain');

// ---- waygate: build + warp into the newest land ----
KS.S.wallet = KS.S.wayPlate.cost + 100;
p.x = C.HUBPAD.x; p.y = C.HUBPAD.y;
step(KS.S.wayPlate.cost / C.BUILD_RATE + 1);
t.ok(KS.S.waygate === true, 'waygate built');
t.ok(KS.warpPads().length === 1 + KS.S.zones.length, 'pads exist at hub + every zone');
p.x = C.HUBPAD.x; p.y = C.HUBPAD.y; // stand still on the pad
step(C.WARP_T + 0.5);
t.ok(KS.zoneAt(p.x, p.y) === KS.S.zones[KS.S.zones.length - 1], 'warped from hub into the newest land');
p.x = C.SPAWN.x; p.y = C.SPAWN.y;

// ---- HP: raw damage applies (neglect VITALITY and you CAN be one-shot) ----
// clear any gear/pet/perk that a stray boss/champion kill may have granted, so max-HP math is clean
KS.S.gear = { weapon: null, armor: null, trinket: null }; KS.S.pets = {}; KS.S.activePet = null; KS.S.perks = {}; KS.S.cperks = {};
KS.S.up.hp = 0; KS.S.crowns = 0; p.maxHp = KS.pMaxHp(); p.hp = p.maxHp; p.invuln = 0;
const bigHit = p.maxHp + 50; // exceeds a fresh HP pool
KS.hurtPlayer(bigHit);
t.ok(p.deaths > 0 || p.hp === p.maxHp, 'a hit bigger than your HP pool one-shots you (no damage cap)');
// vitality upgrade raises max HP; crowns add more
KS.S.up.hp = 3; p.invuln = 0;
t.ok(KS.pMaxHp() === C.HP0 + C.HP_UP * 3, 'VITALITY levels raise max HP (+' + C.HP_UP + '/lvl)');
const hpNoCrown = KS.pMaxHp();
KS.S.crowns = 2;
t.ok(Math.abs(KS.pMaxHp() - hpNoCrown * (1 + C.CROWN_HP * 2)) < 1, 'crowns add +' + Math.round(C.CROWN_HP * 100) + '% max HP each');
// with VITALITY, the same blow is survivable
p.maxHp = KS.pMaxHp(); p.hp = p.maxHp; p.invuln = 0; const dBefore = p.deaths;
KS.hurtPlayer(bigHit);
t.ok(p.deaths === dBefore && p.hp > 0, 'upgraded max HP survives what would have been a one-shot');
KS.S.crowns = 0; KS.S.up.hp = 0; p.maxHp = KS.pMaxHp(); p.hp = p.maxHp;

// ---- player death scatters the stack ----
p.helmets = [{ k: 1 }, { k: 1, bar: true }, { k: 2, crown: true }];
KS.S.items.length = 0;
p.invuln = 0;
const deathsBefore = p.deaths;
p.maxHp = KS.pMaxHp(); p.hp = 1; // one hit away
KS.hurtPlayer(1e9);
t.ok(p.hp === p.maxHp && p.helmets.length === 0, 'death resets hp and drops the stack');
t.ok(p.x === C.SPAWN.x && p.y === C.SPAWN.y, 'death respawns at the hub');
t.ok(KS.S.items.length === 3 && KS.S.items.some(i => i.crown) && KS.S.items.some(i => i.bar), 'dropped items keep their kind');
t.ok(p.deaths === deathsBefore + 1, 'death counted');
KS.S.items.length = 0;

// ---- hero dash ability ----
KS.S.enemies.length = 0; KS.S.eshots.length = 0;
p.x = C.SPAWN.x; p.y = C.SPAWN.y; p.invuln = 0; p.dashCd = 0; p.dashT = 0;
KS.S.keys = { d: true }; // dash right
const dx0 = p.x;
t.ok(KS.dashAbility() === true, 'dash fires when off cooldown');
t.ok(p.dashT > 0 && p.invuln > 0, 'dash grants i-frames while active');
t.ok(Math.abs(p.dashCd - KS.dashCdMax()) < 1e-9, 'dash goes on cooldown');
step(0.25); // let the dash resolve
KS.S.keys = {};
t.ok(p.x > dx0 + 60, 'dash bursts the hero in the input direction');
t.ok(KS.dashAbility() === false, 'dash refuses while on cooldown');
// i-frames actually dodge a hit
p.dashCd = 0; p.invuln = 0; p.hp = p.maxHp;
KS.dashAbility();
const hpDash = p.hp;
KS.hurtPlayer(9999); // would kill, but we're mid-dash
t.ok(p.hp === hpDash && p.deaths !== undefined, 'a dash dodges an incoming hit (i-frames)');
// crowns shorten the dash cooldown
KS.S.crowns = 0; const cd0 = KS.dashCdMax();
KS.S.crowns = 5;
t.ok(KS.dashCdMax() < cd0 && KS.dashCdMax() >= C.DASH_CD_MIN, 'crowns shorten the dash cooldown (min floor honored)');
KS.S.crowns = 0;
p.dashCd = 0; p.dashT = 0; p.invuln = 0; p.hp = p.maxHp;

// ---- kill combo multiplier ----
KS.S.combo = 0; KS.S.comboT = 0; KS.S.comboTierShown = 0; KS.S.stats.comboBest = 0;
KS.S.enemies.length = 0; KS.S.items.length = 0; freezeSpawns();
p.x = z1.pen.x0 + 200; p.y = 500;
// rack up kills fast by summoning + instakilling
for (let i = 0; i < 12; i++) { KS.spawnEnemy(z1); const e = KS.S.enemies[KS.S.enemies.length - 1]; e.gold = false; e.boss = false; e.x = p.x; e.y = p.y; KS.hurtEnemy(e, 1e9); }
t.ok(KS.S.combo === 12, 'chained kills build the combo counter');
t.ok(KS.comboMul() >= 1.5, 'a 12-combo reaches at least x1.5');
t.ok(KS.S.stats.comboBest >= 12, 'best combo recorded in stats');
// combo pays bonus coins beyond the raw helmet value
const palC = KS.S.pallet;
KS.spawnEnemy(z1); const ce = KS.S.enemies[KS.S.enemies.length - 1]; ce.gold = false; ce.boss = false; ce.x = p.x; ce.y = p.y;
KS.hurtEnemy(ce, 1e9);
t.ok(KS.S.pallet > palC, 'combo awards bonus coins on kill');
// combo decays when you stop killing
step(C.COMBO_WINDOW + 0.2);
t.ok(KS.S.combo === 0, 'combo resets after the window lapses');
t.ok(KS.comboMul() === 1, 'multiplier back to x1 once the combo drops');
// milestone
KS.S.stats.comboBest = 40; KS.checkAch();
t.ok(KS.S.ach.combo40 === true, 'Combo Master milestone unlocks at a 40 streak');
KS.S.enemies.length = 0; KS.S.items.length = 0;
p.x = C.SPAWN.x; p.y = C.SPAWN.y;

// ---- hero XP + roguelite level-up card draft ----
KS.S.xp = 0; KS.S.level = 1; KS.S.cards = null; KS.S.perks = {}; KS.S.pendingLevels = 0;
KS.grantXp(KS.xpNeed(1) + KS.xpNeed(2)); // enough for two levels
t.ok(KS.S.level >= 3, 'XP grants hero levels');
t.ok(Array.isArray(KS.S.cards) && KS.S.cards.length === 3, 'level-up offers a 3-card draft');
t.ok(KS.S.pendingLevels >= 1, 'extra level-ups queue behind the open draft');
// picking a damage card raises damage
KS.S.cards = [{ id: 'dmg', ic: '⚔️', name: 'Sharper Arrows', d: '+18% damage', max: 99 }];
const dmg0 = KS.pDmg();
t.ok(KS.pickCard(0) === true, 'a card can be picked');
t.ok(KS.pk('dmg') === 1 && Math.abs(KS.pDmg() - dmg0 * 1.18) < 1e-6, 'damage card applies +18% damage');
t.ok(KS.S.cards !== null || KS.S.pendingLevels === 0, 'a queued level-up re-opens the draft after picking');
// multishot fires extra arrows
KS.S.perks = { multi: 2 }; KS.S.cards = null; KS.S.pendingLevels = 0;
KS.S.enemies.length = 0; KS.S.shots.length = 0; freezeSpawns();
const zc = KS.S.zones[0];
for (let i = 0; i < 3; i++) { KS.spawnEnemy(zc); const e = KS.S.enemies[i]; e.gold = false; e.boss = false; e.hp = e.max = 1e6; e.x = zc.pen.x0 + 200 + i * 30; e.y = 500; e.tx = e.x; e.ty = e.y; e.wanderT = 99; }
p.x = zc.pen.x0 + 200; p.y = 500; p.fireCd = 0;
KS.tick(1 / 60);
t.ok(KS.S.shots.length >= 3, 'multishot (x2 perk) fires 3 arrows at once');
KS.S.perks = {}; KS.S.enemies.length = 0; KS.S.shots.length = 0;
// lifesteal heals on kill
KS.S.perks = { vamp: 3 };
p.maxHp = KS.pMaxHp(); p.hp = 10;
KS.spawnEnemy(zc); const ve = KS.S.enemies[KS.S.enemies.length - 1]; ve.gold = false; ve.boss = false; ve.x = p.x; ve.y = p.y;
KS.hurtEnemy(ve, 1e9);
t.ok(p.hp > 10, 'lifesteal perk heals the hero on kill');
KS.S.perks = {}; p.hp = p.maxHp; KS.S.enemies.length = 0;

// ---- golden boon ----
KS.S.boon = { x: 100, y: 200, vx: 0, t: 0, bob: 0 };
const before = { wallet: KS.S.wallet, gems: KS.S.gems, hp: p.hp, frenzy: KS.S.frenzyT, gold: KS.S.goldRushT };
KS.S.stats.boons = 0;
// force each boon effect at least once by triggering several
let anyEffect = false;
for (let i = 0; i < 12 && !anyEffect; i++) {
  KS.S.boon = { x: 100, y: 200, vx: 0, t: 0, bob: 0 };
  KS.triggerBoon();
  if (KS.S.wallet !== before.wallet || KS.S.pallet > 0 || KS.S.gems !== before.gems || KS.S.frenzyT > 0 || KS.S.goldRushT > 0 || KS.S.combo > 0 || KS.S.level > 1) anyEffect = true;
}
t.ok(anyEffect, 'catching a golden boon applies a random buff');
t.ok(KS.S.stats.boons >= 1 && KS.S.boon === null, 'boon consumed + counted');
KS.S.frenzyT = 0; KS.S.goldRushT = 0; KS.S.combo = 0;

// frenzy boosts fire rate, gold rush boosts coin value
KS.S.perks = {}; const rateBase = KS.pRate(), coinBase = KS.coinMul();
KS.S.frenzyT = 5; t.ok(KS.pRate() < rateBase, 'frenzy speeds up fire rate');
KS.S.goldRushT = 5; t.ok(KS.coinMul() > coinBase, 'gold rush multiplies coin value');
KS.S.frenzyT = 0; KS.S.goldRushT = 0;

// perks + level persist through save/load, reset on prestige
KS.S.perks = { dmg: 3, multi: 1 }; KS.S.level = 7; KS.S.xp = 5;
KS.save(); KS.reset(); KS.load();
t.ok(KS.pk('dmg') === 3 && KS.S.level === 7, 'perks + hero level persist through save/load');
KS.S.perks = {}; KS.S.level = 1; KS.S.xp = 0; KS.S.cards = null; KS.S.boon = null; KS.S.frenzyT = 0; KS.S.goldRushT = 0;

// ---- pet companions: hatch / collect / bonuses / persist ----
KS.S.pets = {}; KS.S.activePet = null; KS.S.stats.hatches = 0;
KS.S.gems = 5000;
const ec0 = KS.eggCost(), gemsA = KS.S.gems;
t.ok(KS.hatchEgg() === true, 'hatching an egg grants a pet');
t.ok(KS.S.gems === gemsA - ec0, 'egg cost deducted from gems');
t.ok(KS.petsOwned() >= 1 && KS.S.activePet !== null, 'first hatch auto-equips the pet');
t.ok(KS.eggCost() > ec0, 'egg cost escalates with each hatch');
KS.S.gems = 0;
t.ok(KS.hatchEgg() === false, 'cannot hatch without enough gems');
// many hatches collect distinct species and stack dupes as levels
for (let i = 0; i < 260; i++) { KS.S.gems = 1e9; KS.hatchEgg(); }
t.ok(KS.petsOwned() >= 6, 'repeated hatches collect several distinct species');
t.ok(KS.S.stats.hatches > KS.petsOwned(), 'duplicate hatches level pets up (more hatches than species)');
// active pet contributes its themed bonus, scaled by level
KS.S.pets = { fox: 2 }; KS.S.activePet = 'fox'; // fox = +10% dmg / lvl
t.ok(Math.abs(KS.petBonus('dmg') - 0.20) < 1e-9, 'active pet bonus scales with its level');
KS.S.perks = {}; KS.S.frenzyT = 0;
const dmgPet = KS.pDmg(); KS.S.activePet = null; const dmgNoPet = KS.pDmg();
t.ok(dmgPet > dmgNoPet, 'equipping a damage pet raises damage');
// a unicorn (all) buffs every stat kind at once
KS.S.pets = { unicorn: 1 }; KS.S.activePet = 'unicorn';
t.ok(KS.petBonus('dmg') > 0 && KS.petBonus('coin') > 0 && KS.petBonus('rate') > 0, 'a unicorn buffs every stat kind');
// unique-species collection bonus raises coin value
KS.S.pets = {}; KS.S.activePet = null;
const coinNoPets = KS.coinMul();
KS.S.pets = { pup: 1, cat: 1, fox: 1 };
t.ok(Math.abs(KS.petCollectionMul() - 1.06) < 1e-9, 'collection grants +2% coins per unique species');
t.ok(KS.coinMul() > coinNoPets, 'owning pets raises coin income via the collection bonus');
// milestones
KS.checkAch();
t.ok(KS.S.ach.pet1 === true, 'hatching a pet unlocks First Friend');
for (const pd of KS.PETS) KS.S.pets[pd.id] = 1;
KS.checkAch();
t.ok(KS.S.ach.petAll === true && KS.S.ach.petLeg === true, 'full collection + legendary milestones unlock');
// pets persist through save/load; survive prestige (permanent collection)
KS.S.pets = { wolf: 3, owl: 1 }; KS.S.activePet = 'wolf';
KS.save(); KS.reset(); KS.load();
t.ok(KS.petLvl('wolf') === 3 && KS.S.activePet === 'wolf', 'pets + active choice persist through save/load');
KS.S.pets = {}; KS.S.activePet = null; KS.S.stats.hatches = 0; KS.S.gems = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- crown hall: permanent prestige perk tree ----
KS.S.cperks = {}; KS.S.crowns = 20;
t.ok(KS.cperkCost('wealth') === 1, 'first crown-perk level costs 1 crown');
const coinBefore = KS.coinMul();
t.ok(KS.buyCperk('wealth') === true, 'a crown perk can be bought with crowns');
t.ok(KS.cpk('wealth') === 1 && KS.S.crowns === 19, 'perk leveled up and a crown was spent');
t.ok(Math.abs(KS.cperkBonus('coin') - 0.08) < 1e-9, 'Royal Treasury adds +8% coin value');
t.ok(KS.coinMul() > coinBefore, 'crown perk raises coin value');
t.ok(KS.cperkCost('wealth') === 2, 'each crown-perk level costs more than the last');
const dmgBefore = KS.pDmg();
KS.buyCperk('might');
t.ok(KS.pDmg() > dmgBefore, 'Warlord Blood raises damage');
const gainBefore = KS.crownsToGain();
KS.buyCperk('legacy');
t.ok(KS.crownsToGain() === gainBefore + 1, 'Enduring Legacy grants +1 crown per New Kingdom');
KS.S.crowns = 0;
t.ok(KS.buyCperk('haste') === false, 'cannot buy a crown perk without enough crowns');
KS.S.crowns = 999; KS.S.cperks.swift = 8; // swift caps at 8
t.ok(KS.buyCperk('swift') === false, 'cannot exceed a crown perk max level');
// persist through save/load; survive prestige (they are permanent)
KS.S.cperks = { wealth: 3, might: 2 }; KS.S.crowns = 5;
KS.save(); const worldSnap = store[C.SAVE_KEY];
KS.reset(); KS.load();
t.ok(KS.cpk('wealth') === 3 && KS.cpk('might') === 2, 'crown perks persist through save/load');
KS.prestige();
t.ok(KS.cpk('wealth') === 3 && KS.cpk('might') === 2, 'crown perks survive founding a New Kingdom');
// restore the pre-prestige world for the remaining tests, then clear perks
store[C.SAVE_KEY] = worldSnap; KS.reset(); KS.load();
KS.S.cperks = {}; KS.S.crowns = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- daily login reward calendar ----
KS.S.loginDay = 0; KS.S.lastLoginDay = ''; KS.S.loginAvail = false;
KS.S.stats.logins = 0; KS.S.stats.jackpots = 0;
KS.checkLogin();
t.ok(KS.S.loginAvail === true, 'a reward becomes available on a new day');
t.ok(KS.claimLogin() === true, 'claiming the daily reward succeeds');
t.ok(KS.S.loginDay === 1 && KS.S.stats.logins === 1, 'calendar advances to the next day after a claim');
t.ok(KS.S.lastLoginDay === KS.dayStr(0), 'claim stamps today so it locks for the day');
t.ok(KS.S.loginAvail === false && KS.claimLogin() === false, 'cannot claim twice in one day');
KS.checkLogin();
t.ok(KS.S.loginAvail === false, 'same-day re-check keeps the reward locked');
KS.S.lastLoginDay = KS.dayStr(-1); KS.checkLogin();
t.ok(KS.S.loginAvail === true, 'a new day re-opens the calendar');
// day-7 jackpot pays gems + a big coin chest and wraps the calendar
KS.S.loginDay = 6; KS.S.gems = 0; KS.S.pallet = 0; KS.S.frenzyT = 0;
KS.S.lastLoginDay = KS.dayStr(-1); KS.checkLogin();
KS.claimLogin();
t.ok(KS.S.gems >= 12 && KS.S.pallet > 0, 'day-7 jackpot pays gems + a big coin chest');
t.ok(KS.S.loginDay === 0 && KS.S.stats.jackpots === 1, 'calendar wraps to day 1 after the jackpot and counts it');
KS.checkAch();
t.ok(KS.S.ach.jackpot === true, 'jackpot milestone unlocks');
// progress persists through save/load
KS.S.loginDay = 3; KS.S.lastLoginDay = KS.dayStr(0);
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.loginDay === 3 && KS.S.lastLoginDay === KS.dayStr(0), 'calendar progress persists through save/load');
KS.S.stats.logins = 0; KS.S.stats.jackpots = 0; KS.S.gems = 0; KS.S.pallet = 0; KS.S.frenzyT = 0; KS.S.goldRushT = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- gear / equipment (boss loot) ----
KS.S.gear = { weapon: null, armor: null, trinket: null }; KS.S.stats.gearFound = 0; KS.S.gems = 0;
// a rolled piece has a valid slot, rarity, kind and positive stat
const rg = KS.rollGear();
t.ok(['weapon', 'armor', 'trinket'].includes(rg.slot) && rg.rar >= 0 && rg.rar <= 3 && rg.amt > 0, 'rollGear produces a valid piece');
// equipping the first piece in a slot always takes
const wpn = { slot: 'weapon', kind: 'dmg', rar: 1, amt: 0.216, kname: '' };
KS.S.perks = {}; KS.S.crowns = 0; KS.S.cperks = {}; KS.S.pets = {}; KS.S.activePet = null;
const dmgBare = KS.pDmg();
t.ok(KS.grantGear(wpn) === true, 'first gear in a slot auto-equips');
t.ok(KS.gearBonus('dmg') === 0.216 && KS.pDmg() > dmgBare, 'weapon gear raises damage');
t.ok(KS.gearCount() === 1 && KS.S.stats.gearFound === 1, 'slot filled + drop counted');
// a stronger piece replaces it; a weaker one salvages into a gem
const gemsPre = KS.S.gems;
t.ok(KS.grantGear({ slot: 'weapon', kind: 'dmg', rar: 3, amt: 0.60, kname: '' }) === true, 'a stronger weapon replaces the old one');
t.ok(KS.gearBonus('dmg') === 0.60, 'the better weapon is now equipped');
t.ok(KS.grantGear({ slot: 'weapon', kind: 'dmg', rar: 0, amt: 0.12, kname: '' }) === false, 'a weaker weapon does not equip');
t.ok(KS.S.gems === gemsPre + 1, 'the weaker piece is salvaged into a gem');
// armor raises max HP; trinket kinds feed their own stats
KS.grantGear({ slot: 'armor', kind: 'hp', rar: 2, amt: 0.30, kname: '' });
KS.grantGear({ slot: 'trinket', kind: 'coin', rar: 1, amt: 0.18, kname: 'of Greed' });
t.ok(KS.gearBonus('hp') === 0.30 && KS.gearBonus('coin') === 0.18, 'armor + trinket bonuses register');
t.ok(KS.gearCount() === 3, 'all three slots can be filled');
// milestones
KS.checkAch();
t.ok(KS.S.ach.gear1 === true && KS.S.ach.gearSet === true && KS.S.ach.gearLeg === true, 'gear milestones unlock (armed, full set, legendary)');
// a boss kill drops gear
KS.start(); freezeSpawns();
const zg = KS.S.zones[0]; KS.S.enemies.length = 0;
KS.spawnEnemy(zg, { boss: true });
const gboss = KS.S.enemies.find(e => e.boss);
const foundBefore = KS.S.stats.gearFound;
KS.hurtEnemy(gboss, 1e12);
t.ok(KS.S.stats.gearFound === foundBefore + 1, 'defeating a boss drops a piece of gear');
// gear persists through save/load
KS.S.gear = { weapon: { slot: 'weapon', kind: 'dmg', rar: 2, amt: 0.36, kname: '' }, armor: null, trinket: null };
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.gear.weapon && KS.S.gear.weapon.amt === 0.36 && KS.gearBonus('dmg') === 0.36, 'equipped gear persists through save/load');
KS.S.gear = { weapon: null, armor: null, trinket: null }; KS.S.stats.gearFound = 0; KS.S.gems = 0;
KS.S.enemies.length = 0; KS.S.items.length = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- blacksmith: gear enhancement (gem sink) ----
KS.S.gear = { weapon: { slot: 'weapon', kind: 'dmg', rar: 1, amt: 0.216, kname: '' }, armor: null, trinket: null };
KS.S.stats.enhanced = 0; KS.S.gems = 100;
t.ok(Math.abs(KS.gearBonus('dmg') - 0.216) < 1e-9, 'un-enhanced gear uses its rolled stat');
const enhCost0 = KS.enhCost(KS.S.gear.weapon), gemsPre2 = KS.S.gems;
t.ok(KS.enhanceGear('weapon') === true, 'a piece of gear can be enhanced with gems');
t.ok(KS.S.gear.weapon.enh === 1 && KS.S.gems === gemsPre2 - enhCost0, 'enhance level up + gems spent');
t.ok(Math.abs(KS.gearBonus('dmg') - (0.216 + KS.ENH_STEP)) < 1e-9, 'enhancement adds a flat stat bump');
t.ok(KS.enhCost(KS.S.gear.weapon) > enhCost0, 'each enhance costs more than the last');
KS.checkAch();
t.ok(KS.S.ach.smith === true, 'first enhance unlocks the Blacksmith milestone');
// cannot enhance without gems, and cannot exceed the cap
KS.S.gems = 0;
t.ok(KS.enhanceGear('weapon') === false, 'cannot enhance without enough gems');
KS.S.gems = 1e6; KS.S.gear.weapon.enh = KS.ENH_MAX;
t.ok(KS.enhanceGear('weapon') === false, 'cannot enhance past the max level');
// enhancing an empty slot is a no-op
t.ok(KS.enhanceGear('armor') === false, 'cannot enhance an empty slot');
// enhance level persists through save/load; replacing the piece resets it
KS.S.gear.weapon.enh = 4;
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.gear.weapon.enh === 4 && Math.abs(KS.gearBonus('dmg') - (0.216 + 4 * KS.ENH_STEP)) < 1e-9, 'enhance level persists through save/load');
KS.grantGear({ slot: 'weapon', kind: 'dmg', rar: 3, amt: 0.60, kname: '' });
t.ok((KS.S.gear.weapon.enh || 0) === 0, 'equipping a new piece starts fresh at +0 enhance');
KS.S.gear = { weapon: null, armor: null, trinket: null }; KS.S.stats.enhanced = 0; KS.S.gems = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- wandering merchant ----
KS.S.merchant = null; KS.S.stats.trades = 0;
KS.spawnMerchant();
t.ok(KS.S.merchant && KS.S.merchant.deals.length === 3, 'a merchant arrives with three deals');
t.ok(KS.S.merchant.deals.every(d => d.cost > 0 && (d.cur === 'gem' || d.cur === 'coin')), 'each deal has a positive cost in coins or gems');
// buy a known gem-cache deal for coins
KS.S.merchant.deals = [{ id: 'gems', ic: '💎', name: 'Gem Cache', cur: 'coin', cost: 100, desc: '', sold: false }];
KS.S.wallet = 250; KS.S.gems = 0;
t.ok(KS.buyDeal(0) === true, 'a deal can be bought when you can afford it');
t.ok(KS.S.wallet === 150 && KS.S.gems === 8, 'coins spent and the gem-cache reward applied');
t.ok(KS.S.merchant === null, 'clearing the last deal sends the merchant on his way');
t.ok(KS.S.stats.trades === 1, 'a merchant purchase is counted');
KS.checkAch();
t.ok(KS.S.ach.trade1 === true, 'first purchase unlocks the Customer milestone');
// cannot buy a sold deal or without funds
KS.spawnMerchant();
KS.S.merchant.deals = [{ id: 'coins', ic: '🪙', name: 'Coin Sack', cur: 'gem', cost: 5, desc: '', sold: false }];
KS.S.gems = 2;
t.ok(KS.buyDeal(0) === false, 'cannot buy a deal you cannot afford');
KS.S.gems = 20;
t.ok(KS.buyDeal(0) === true && KS.buyDeal(0) === false, 'a deal cannot be bought twice');
// the merchant leaves after his welcome wears out
KS.start(); freezeSpawns();
KS.spawnMerchant();
KS.S.merchant.stay = 0.5;
KS.tick(1); // stay ticks below zero → he moves on
t.ok(KS.S.merchant === null, 'the merchant leaves after his stay expires');
// merchant reappears on the cooldown
KS.S.merchant = null; KS.S.merchantCd = 0.2;
KS.tick(0.5);
t.ok(KS.S.merchant !== null, 'a new merchant appears when the cooldown elapses');
KS.S.merchant = null; KS.S.merchantCd = 999; KS.S.stats.trades = 0; KS.S.wallet = 0; KS.S.gems = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- day / night cycle (cosmetic) ----
const tSaved = KS.S.t;
KS.S.t = 0;
t.ok(KS.daylight() >= 0 && KS.daylight() <= 1, 'daylight is a 0..1 value');
t.ok(KS.dayPhase() >= 0 && KS.dayPhase() < 1, 'dayPhase is a 0..1 fraction');
t.ok(Math.abs(KS.daylight() - 0) < 1e-6, 'phase 0 is the middle of the night (darkest)');
KS.S.t = KS.DAY_LEN / 2;
t.ok(Math.abs(KS.daylight() - 1) < 1e-6, 'half a cycle later it is high noon (brightest)');
t.ok(KS.skyName() === 'Day', 'noon reads as Day');
KS.S.t = KS.DAY_LEN; // wraps back around
t.ok(Math.abs(KS.dayPhase() - 0) < 1e-6, 'the cycle wraps after a full day length');
t.ok(['Night', 'Dawn', 'Day', 'Dusk'].includes(KS.skyName()), 'skyName is always one of the four phases');
// the sky overlay renders without throwing at every phase
KS.start();
for (let ph = 0; ph < 1; ph += 0.1) { KS.S.t = ph * KS.DAY_LEN; drawSafe('draw() sky phase ' + ph.toFixed(1)); }
KS.S.t = tSaved;

// ---- hero ultimate: Arrow Storm ----
KS.start(); freezeSpawns();
KS.S.enemies.length = 0; KS.S.ultCharge = 0; KS.S.stats.ults = 0; KS.S.perks = {};
t.ok(KS.ultReady() === false && KS.ultFrac() === 0, 'ultimate starts empty');
const zu = KS.S.zones[0];
for (let i = 0; i < 5; i++) { KS.spawnEnemy(zu); const e = KS.S.enemies[KS.S.enemies.length - 1]; e.gold = false; e.boss = false; KS.hurtEnemy(e, 1e9); }
t.ok(KS.ultCharge() === 5, 'each kill adds a charge to the ultimate');
t.ok(KS.castUlt() === false, 'the ultimate cannot fire until the meter is full');
KS.S.ultCharge = KS.ULT_NEED;
KS.S.enemies.length = 0;
for (let i = 0; i < 6; i++) { KS.spawnEnemy(zu); const e = KS.S.enemies[KS.S.enemies.length - 1]; e.gold = false; e.boss = false; e.hp = e.max = 5; e.x = zu.pen.x0 + 200 + i * 20; e.y = 500; }
const killsBeforeUlt = KS.S.stats.kills;
t.ok(KS.ultReady() === true, 'a full meter is ready');
t.ok(KS.castUlt() === true, 'the Arrow Storm fires when full');
t.ok(KS.S.enemies.every(e => e.hp <= 0), 'the Arrow Storm damages every enemy on screen');
t.ok(KS.S.stats.kills >= killsBeforeUlt + 6, 'storm kills score normally (loot + combo payoff)');
t.ok(KS.ultCharge() === 0, 'casting drains the meter');
t.ok(KS.S.frenzyT > 0, 'the storm grants a brief frenzy');
t.ok(KS.S.stats.ults === 1, 'an Arrow Storm is counted');
KS.checkAch();
t.ok(KS.S.ach.ult1 === true, 'first storm unlocks the Storm Caller milestone');
KS.S.ultCharge = 20; KS.S.frenzyT = 0;
KS.save(); KS.reset(); KS.load();
t.ok(KS.ultCharge() === 20, 'ultimate charge persists through save/load');
KS.S.ultCharge = 0; KS.S.stats.ults = 0; KS.S.enemies.length = 0; KS.S.frenzyT = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- weather (cosmetic, deterministic) ----
const tW = KS.S.t;
const WSET = ['clear', 'rain', 'snow', 'fog'];
t.ok(WSET.includes(KS.weatherType()), 'weatherType is always a known kind');
// the window index advances with time
KS.S.t = 0; const wb0 = KS.weatherBucket();
KS.S.t = KS.WEATHER_LEN + 1; const wb1 = KS.weatherBucket();
t.ok(wb1 === wb0 + 1, 'the weather window advances after one window length');
// across a full cycle every kind in the sequence shows up (incl. clear breaks)
const seen = new Set();
for (let i = 0; i < KS.WEATHER_SEQ.length; i++) { KS.S.t = i * KS.WEATHER_LEN + 5; seen.add(KS.weatherType()); }
t.ok(seen.has('clear') && seen.has('rain') && seen.has('snow') && seen.has('fog'), 'the cycle rotates through clear, rain, snow and fog');
// it's deterministic — same time, same weather
KS.S.t = 3 * KS.WEATHER_LEN + 10; const wa = KS.weatherType();
KS.S.t = 3 * KS.WEATHER_LEN + 10; t.ok(KS.weatherType() === wa, 'weather is a pure function of time (no rng drift)');
// each weather kind renders without throwing
KS.start();
for (let i = 0; i < KS.WEATHER_SEQ.length; i++) { KS.S.t = i * KS.WEATHER_LEN + 8; drawSafe('draw() weather ' + KS.weatherType()); }
KS.S.t = tW;

// ---- bestiary: foe collection log ----
KS.start(); freezeSpawns();
KS.S.bestiary = {}; KS.S.enemies.length = 0;
t.ok(KS.bestiarySeen() === 0, 'bestiary starts empty');
t.ok(KS.famOf(1) === 0 && KS.famOf(9) === 0 && KS.famOf(2) === 1, 'foe family index wraps every 8 lands');
// killing a foe records it in the bestiary
const zb = KS.S.zones[0];
KS.spawnEnemy(zb); const be = KS.S.enemies[KS.S.enemies.length - 1]; be.gold = false; be.boss = false;
KS.hurtEnemy(be, 1e9);
t.ok(KS.S.bestiary[0] && KS.S.bestiary[0].k >= 1, 'a slain foe is recorded under its family');
t.ok(KS.bestiarySeen() === 1, 'that family now counts as discovered');
// a boss kill bumps the boss tally
KS.spawnEnemy(zb, { boss: true }); const bb = KS.S.enemies.find(e => e.boss);
KS.hurtEnemy(bb, 1e12);
t.ok(KS.S.bestiary[0].b >= 1, 'boss kills track separately per family');
// discover several families → milestone
for (let f = 1; f < 4; f++) KS.S.bestiary[f] = { k: 3, b: 0 };
KS.checkAch();
t.ok(KS.bestiarySeen() === 4 && KS.S.ach.dex4 === true, 'discovering 4 families unlocks the Naturalist milestone');
// full completion milestone
for (let f = 0; f < KS.FOE_NAMES.length; f++) KS.S.bestiary[f] = { k: 1, b: 0 };
KS.checkAch();
t.ok(KS.S.ach.dexAll === true, 'discovering every family completes the bestiary');
// persists through save/load; panel renders
KS.S.bestiary = { 0: { k: 12, b: 2 }, 3: { k: 5, b: 0 } };
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.bestiary[0] && KS.S.bestiary[0].k === 12 && KS.S.bestiary[0].b === 2, 'bestiary persists through save/load');
KS.start(); KS.S.showBestiary = true; drawSafe('draw() with bestiary panel open');
KS.S.showBestiary = false; KS.S.bestiary = {}; KS.S.enemies.length = 0;
// the boss kill above dropped gear — clear it so later exact-stat tests are clean
KS.S.gear = { weapon: null, armor: null, trinket: null };
KS.S.perks = {}; KS.S.pets = {}; KS.S.activePet = null; KS.S.cperks = {};
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- elite / champion foes ----
KS.start(); freezeSpawns();
KS.S.enemies.length = 0; KS.S.items.length = 0; KS.S.stats.elites = 0;
const ze = KS.S.zones[0];
t.ok(KS.promoteElite() === false, 'no champion rises when there are no eligible foes');
KS.spawnEnemy(ze); const nf = KS.S.enemies[KS.S.enemies.length - 1]; nf.gold = false; nf.boss = false;
const hp0 = nf.max;
t.ok(KS.promoteElite() === true, 'a living foe can be promoted to champion');
t.ok(nf.elite === true && nf.max > hp0, 'the champion is much tougher than before');
// champions never come from bosses or gold foes
KS.S.enemies.length = 0;
KS.spawnEnemy(ze, { boss: true }); KS.spawnEnemy(ze); KS.S.enemies[1].gold = true; KS.S.enemies[1].boss = false;
t.ok(KS.promoteElite() === false, 'bosses and gold foes are never promoted');
// killing a champion drops bonus loot and counts
KS.S.enemies.length = 0; KS.S.items.length = 0; KS.S.pallet = 0;
KS.spawnEnemy(ze); const elc = KS.S.enemies[KS.S.enemies.length - 1]; elc.gold = false; elc.boss = false;
KS.promoteElite();
const gemItems0 = KS.S.items.filter(it => it.gem).length;
KS.hurtEnemy(elc, 1e12);
t.ok(KS.S.stats.elites === 1, 'slaying a champion is counted');
t.ok(KS.S.items.filter(it => it.gem).length >= gemItems0 + 2 && KS.S.pallet > 0, 'a champion drops bonus gems + coins');
KS.checkAch();
t.ok(KS.S.ach.elite1 === true, 'first champion kill unlocks Giant Slayer');
KS.S.stats.elites = 0; KS.S.enemies.length = 0; KS.S.items.length = 0; KS.S.pallet = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- fortune wheel ----
KS.start();
KS.S.stats.spins = 0; KS.S.gems = 0;
t.ok(KS.WHEEL.length >= 6 && KS.WHEEL.every(w => typeof w.apply === 'function' && w.w > 0), 'the wheel has weighted, applicable segments');
t.ok(KS.spinWheel() === null && KS.S.stats.spins === 0, 'cannot spin without enough gems');
// a wheel segment's reward applies deterministically (gems segment)
const gemSeg = KS.WHEEL.find(w => w.id === 'gems');
const gemsPreSeg = KS.S.gems; gemSeg.apply();
t.ok(KS.S.gems === gemsPreSeg + 3, 'the gems segment awards 3 gems');
// spinning deducts the cost, returns a segment and counts the spin
KS.S.gems = KS.SPIN_COST + 50; const gemsPreSpin = KS.S.gems;
const res = KS.spinWheel();
t.ok(res && typeof res.id === 'string', 'a spin returns the landed segment');
t.ok(KS.S.stats.spins === 1, 'the spin is counted');
t.ok(KS.S.gems <= gemsPreSpin - KS.SPIN_COST + 15, 'the spin cost was deducted (net of any gem prize)');
t.ok(KS.S.wheel && typeof KS.S.wheel.idx === 'number', 'the landed segment is recorded for the animation');
KS.checkAch();
t.ok(KS.S.ach.spin1 === true, 'a first spin unlocks the Lucky Spin milestone');
// many spins never throw and always land on a valid segment
KS.S.gems = 1e6; let allValid = true;
for (let i = 0; i < 60; i++) { const s = KS.spinWheel(); if (!s || !KS.WHEEL.includes(s)) allValid = false; }
t.ok(allValid && KS.S.stats.spins === 61, '60 more spins all land on real segments without error');
KS.S.showWheel = true; drawSafe('draw() with fortune wheel open');
// spin rewards may equip gear / hatch pets — clear so later exact-stat tests stay clean
KS.S.showWheel = false; KS.S.wheel = null; KS.S.stats.spins = 0; KS.S.gems = 0;
KS.S.gear = { weapon: null, armor: null, trinket: null };
KS.S.pets = {}; KS.S.activePet = null; KS.S.perks = {}; KS.S.cperks = {};
KS.S.frenzyT = 0; KS.S.goldRushT = 0; KS.S.xp = 0; KS.S.level = 1; KS.S.cards = null;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- hero rank / renown ----
const rankAchBefore = new Set(Object.keys(KS.S.ach));
const rk0 = KS.S.stats.kills, rc0 = KS.S.crowns, rb0 = KS.S.stats.bosses || 0, re0 = KS.S.stats.elites || 0, rsp0 = KS.S.stats.spins || 0;
KS.S.stats.kills = 0; KS.S.crowns = 0; KS.S.stats.bosses = 0; KS.S.stats.elites = 0; KS.S.stats.spins = 0;
const rlow = KS.renown(), ilow = KS.heroRankIdx();
KS.S.stats.kills = 500;
t.ok(KS.renown() > rlow, 'renown rises with accomplishments');
t.ok(KS.heroRankIdx() >= ilow, 'rank never drops as renown rises');
KS.S.crowns = 5; // crowns weigh heavily
const ihigh = KS.heroRankIdx();
t.ok(ihigh > ilow, 'big renown reaches a higher rank tier');
t.ok(KS.RANKS[ihigh] === KS.heroRank(), 'heroRank matches the current tier');
t.ok(KS.nextRank() === KS.RANKS[ihigh + 1] || KS.nextRank() === null, 'nextRank is the following tier (or null at max)');
KS.S.stats.kills = 1e7; KS.S.crowns = 1000;
t.ok(KS.heroRankIdx() === KS.RANKS.length - 1 && KS.nextRank() === null, 'enough renown reaches the final rank');
// crossing a tier fires a one-time rank-up toast
KS.start(); KS.S.rankShown = 0; KS.S.toasts.length = 0;
KS.checkRankUp();
t.ok(KS.S.rankShown === KS.heroRankIdx() && KS.S.toasts.some(t2 => /RANK UP/.test(t2.txt)), 'crossing a rank triggers a rank-up toast');
KS.S.toasts.length = 0; KS.checkRankUp();
t.ok(KS.S.toasts.length === 0, 'no repeat rank-up toast at the same rank');
KS.checkAch();
t.ok(KS.S.ach.rankLg === true, 'reaching Legend+ unlocks the Living Legend milestone');
drawSafe('draw() with rank badge');
// restore stats so later tests are unaffected
KS.S.stats.kills = rk0; KS.S.crowns = rc0; KS.S.stats.bosses = rb0; KS.S.stats.elites = re0; KS.S.stats.spins = rsp0;
// forget any milestones the inflated renown unlocked, so later tests see them fresh
for (const k of Object.keys(KS.S.ach)) if (!rankAchBefore.has(k)) delete KS.S.ach[k];
KS.S.rankShown = KS.heroRankIdx(); KS.S.toasts.length = 0; KS.S.parts.length = 0;

// ---- floating crit combat text ----
KS.start(); freezeSpawns();
KS.S.enemies.length = 0; KS.S.floats.length = 0; KS.S.parts.length = 0;
const zc2 = KS.S.zones[0];
KS.spawnEnemy(zc2); const che = KS.S.enemies[KS.S.enemies.length - 1]; che.boss = false; che.gold = false; che.hp = che.max = 1e9;
KS.hurtEnemy(che, 100, false);
const normalFloat = KS.S.floats[KS.S.floats.length - 1];
t.ok(normalFloat && !normalFloat.crit, 'a normal hit shows a plain damage number');
const partsBefore = KS.S.parts.length;
KS.hurtEnemy(che, 300, true);
const critFloat = KS.S.floats[KS.S.floats.length - 1];
t.ok(critFloat && critFloat.crit === true, 'a critical hit is flagged on its damage float');
t.ok(critFloat.big === true && critFloat.color === '#ff8a3c', 'crit combat text is bigger and orange');
t.ok(KS.S.parts.length === partsBefore, 'hurtEnemy itself adds no crit sparks (those come from the arrow hit, deterministically)');
KS.draw(); // crit float + pop renders without throwing
KS.S.enemies.length = 0; KS.S.floats.length = 0; KS.S.parts.length = 0;

// ---- settings / accessibility toggles ----
KS.start(); freezeSpawns();
KS.S.settings = { shake: true, particles: true, dmgNums: true, weather: true };
t.ok(KS.SETTINGS.length >= 4 && KS.setg('shake') === true, 'settings default to on');
KS.toggleSetting('shake');
t.ok(KS.setg('shake') === false && KS.S.settings.shake === false, 'toggling a setting flips it off');
KS.toggleSetting('shake');
t.ok(KS.setg('shake') === true, 'toggling again flips it back on');
// damage-numbers off suppresses the enemy damage float
KS.S.enemies.length = 0; KS.S.floats.length = 0;
const zs2 = KS.S.zones[0]; KS.spawnEnemy(zs2); const se2 = KS.S.enemies[KS.S.enemies.length - 1]; se2.boss = false; se2.gold = false; se2.hp = se2.max = 1e9;
KS.S.settings.dmgNums = false;
KS.hurtEnemy(se2, 50, false);
t.ok(KS.S.floats.length === 0, 'damage numbers off suppresses the damage float');
KS.S.settings.dmgNums = true;
KS.hurtEnemy(se2, 50, false);
t.ok(KS.S.floats.length === 1, 'damage numbers on shows it again');
// the game still renders with every effect toggled off (reduced-motion)
KS.S.settings = { shake: false, particles: false, dmgNums: false, weather: false };
drawSafe('draw() with all effects disabled');
// settings persist through save/load; missing settings default on (old saves)
KS.S.settings = { shake: false, particles: true, dmgNums: true, weather: false };
KS.save(); KS.reset(); KS.load();
t.ok(KS.setg('shake') === false && KS.setg('weather') === false && KS.setg('particles') === true, 'settings persist through save/load');
KS.S.settings = { shake: true, particles: true, dmgNums: true, weather: true };
KS.S.enemies.length = 0; KS.S.floats.length = 0; KS.S.parts.length = 0;

// ---- hero skins / wardrobe ----
KS.start();
KS.S.skins = { owned: { royal: true }, active: 'royal' };
t.ok(KS.skinsOwnedCount() === 1 && KS.activeSkin().id === 'royal', 'the default outfit starts owned + equipped');
t.ok(KS.activeSkin().body === '#3f6fb5', 'the active skin drives the knight body colour');
// buy a crown skin
KS.S.crowns = 10; const crownsPreSkin = KS.S.crowns;
t.ok(KS.buySkin('crimson') === true, 'a crown outfit can be bought');
t.ok(KS.skinOwned('crimson') && KS.S.skins.active === 'crimson' && KS.S.crowns === crownsPreSkin - 3, 'buying unlocks, equips, and spends crowns');
t.ok(KS.activeSkin().body === '#b5403f', 'equipping recolours the hero');
// cannot buy without funds
KS.S.crowns = 0; KS.S.gems = 0;
t.ok(KS.buySkin('gold') === false && !KS.skinOwned('gold'), 'cannot buy an outfit you cannot afford');
// re-buying an owned skin just equips it (no charge)
KS.S.crowns = 5; const cr2 = KS.S.crowns;
KS.buySkin('royal');
t.ok(KS.S.skins.active === 'royal' && KS.S.crowns === cr2, 'tapping an owned outfit equips it for free');
// the rank-locked skin unlocks only at Legend
const kk = KS.S.stats.kills, kcr = KS.S.crowns;
KS.S.stats.kills = 0; KS.S.crowns = 0;
t.ok(KS.buySkin('legend') === false && !KS.skinOwned('legend'), 'the Legend outfit is locked below Legend rank');
KS.S.crowns = 1000; // renown → past Legend
t.ok(KS.buySkin('legend') === true && KS.skinOwned('legend'), 'reaching Legend rank unlocks its regalia for free');
KS.S.stats.kills = kk; KS.S.crowns = kcr;
// milestone + persistence
KS.checkAch();
t.ok(KS.S.ach.skin3 === true, 'owning three outfits unlocks Dressed Up');
KS.S.skins = { owned: { royal: true, frost: true }, active: 'frost' };
KS.save(); KS.reset(); KS.load();
t.ok(KS.skinOwned('frost') && KS.S.skins.active === 'frost', 'wardrobe persists through save/load');
KS.S.showSkins = true; drawSafe('draw() with wardrobe open');
KS.S.showSkins = false; KS.S.skins = { owned: { royal: true }, active: 'royal' };
KS.S.crowns = 0; KS.S.gems = 0;
for (const k of Object.keys(KS.S.ach)) if (k === 'skin3' || k === 'crown1' || k === 'crown5') delete KS.S.ach[k];

// ---- combo streak reward escalation ----
KS.start(); freezeSpawns();
KS.S.enemies.length = 0; KS.S.combo = 0; KS.S.comboRewardMax = 0; KS.S.comboTierShown = 0;
KS.S.frenzyT = 0; KS.S.goldRushT = 0; KS.S.pallet = 0; KS.S.stats.combos = 0;
const zkc = KS.S.zones[0]; KS.spawnEnemy(zkc); const kce = KS.S.enemies[KS.S.enemies.length - 1];
for (let i = 0; i < 24; i++) KS.registerCombo(kce);
t.ok(KS.S.combo === 24 && KS.S.frenzyT === 0 && (KS.S.stats.combos || 0) === 0, 'no streak reward before the first milestone');
KS.registerCombo(kce); // 25th kill
t.ok(KS.S.combo === 25 && KS.S.frenzyT > 0 && KS.S.pallet > 0 && KS.S.stats.combos === 1, 'crossing 25 fires the SPREE reward (frenzy + coins)');
KS.S.pallet = 0;
for (let i = 0; i < 25; i++) KS.registerCombo(kce); // → 50
t.ok(KS.S.combo >= 50 && KS.S.goldRushT > 0 && KS.S.stats.combos === 2, 'crossing 50 fires RAMPAGE (gold rush), each milestone once');
// a fresh streak re-earns the milestone rewards
KS.S.combo = 0; KS.S.comboRewardMax = 0; KS.S.frenzyT = 0; KS.S.stats.combos = 0;
for (let i = 0; i < 25; i++) KS.registerCombo(kce);
t.ok(KS.S.stats.combos === 1 && KS.S.frenzyT > 0, 'a fresh streak re-arms and re-earns the milestone reward');
KS.S.stats.comboBest = 50; KS.checkAch();
t.ok(KS.S.ach.streak === true, 'a 50 kill streak unlocks On a Rampage');
KS.S.combo = 0; KS.S.comboRewardMax = 0; KS.S.comboTierShown = 0; KS.S.frenzyT = 0; KS.S.goldRushT = 0;
KS.S.pallet = 0; KS.S.stats.combos = 0; KS.S.enemies.length = 0; KS.S.floats.length = 0; KS.S.parts.length = 0;

// ---- mini-map event pings ----
KS.start(); freezeSpawns();
KS.S.enemies.length = 0; KS.S.chest = null; KS.S.merchant = null;
t.ok(KS.mapPings().length === 0, 'no pings when nothing is happening');
KS.S.chest = { x: 500, y: 500, val: 10, gem: false };
t.ok(KS.mapPings().some(p => p.kind === 'chest'), 'an active treasure chest shows a ping');
KS.spawnMerchant();
t.ok(KS.mapPings().some(p => p.kind === 'merchant'), 'a wandering merchant shows a ping');
const zpm = KS.S.zones[0];
KS.spawnEnemy(zpm, { boss: true });
t.ok(KS.mapPings().some(p => p.kind === 'boss'), 'a boss king shows a ping');
KS.S.enemies.length = 0; KS.spawnEnemy(zpm); const pel = KS.S.enemies[KS.S.enemies.length - 1]; pel.boss = false; pel.gold = false;
KS.promoteElite();
t.ok(KS.mapPings().some(p => p.kind === 'elite'), 'a champion shows a ping');
KS.draw(); // minimap with pings renders without throwing
KS.S.chest = null; KS.S.merchant = null; KS.S.enemies.length = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- pet active ability ----
KS.start();
KS.S.pets = {}; KS.S.activePet = null; KS.S.petCd = 0; KS.S.stats.petAbil = 0;
t.ok(KS.petAbilityReady() === false && KS.petAbility() === false, 'no pet ability without an active pet');
// a coin pet showers coins and goes on cooldown
KS.S.pets = { piggy: 1 }; KS.S.activePet = 'piggy'; // piggy = coin kind
KS.S.pallet = 0;
t.ok(KS.petAbilityReady() === true, 'with an active pet the ability is ready');
t.ok(KS.petAbility() === true, 'the pet ability fires');
t.ok(KS.S.pallet > 0 && KS.S.stats.petAbil === 1, 'the coin pet ability showers coins and is counted');
t.ok(KS.S.petCd > 0 && KS.petAbilityReady() === false, 'the ability goes on cooldown');
t.ok(KS.petAbility() === false, 'it cannot fire again while on cooldown');
// cooldown ticks down over time
KS.S.petCd = 0.5; freezeSpawns();
for (let i = 0; i < 60; i++) KS.tick(1 / 60);
t.ok(KS.petAbilityReady() === true, 'the cooldown recovers over time');
// an hp pet heals instead
KS.S.pets = { boar: 1 }; KS.S.activePet = 'boar'; KS.S.petCd = 0; // boar = hp
KS.S.player.maxHp = KS.pMaxHp(); KS.S.player.hp = 1;
KS.petAbility();
t.ok(KS.S.player.hp === KS.S.player.maxHp, 'an HP pet ability full-heals the hero');
KS.checkAch();
t.ok(KS.S.ach.petpow === true, 'using a pet ability unlocks Best Friend');
KS.S.pets = {}; KS.S.activePet = null; KS.S.petCd = 0; KS.S.stats.petAbil = 0;
KS.S.pallet = 0; KS.S.frenzyT = 0; KS.S.level = 1; KS.S.xp = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- townsfolk / inhabitants ----
KS.start(); freezeSpawns();
KS.S.pop = []; KS.S.popFilter = 'all'; KS.S.wallet = 0;
t.ok(KS.recruit() === false && KS.S.pop.length === 0, 'cannot recruit without coins');
KS.S.wallet = 1e9;
const rc = KS.recruitCost();
t.ok(KS.recruit() === true && KS.S.pop.length === 1 && KS.S.wallet === 1e9 - rc, 'recruiting adds a villager and spends coins');
t.ok(KS.recruitCost() > rc, 'each villager costs more than the last');
t.ok(KS.S.pop[0].role === 'collect', 'new villagers start as collectors');
// assign roles
KS.recruit(); KS.recruit(); // 3 total
t.ok(KS.assignPop('fight') === true && KS.popCount('fight') === 1 && KS.popCount('collect') === 2, 'a collector can be reassigned to fight');
t.ok(KS.assignPop('collect') === true && KS.popCount('fight') === 0, 'and back to collecting');
// fighters shoot nearby foes
KS.assignPop('fight');
const zf = KS.S.zones[0]; KS.S.enemies.length = 0; KS.S.shots.length = 0;
KS.spawnEnemy(zf); const fe = KS.S.enemies[KS.S.enemies.length - 1]; fe.hp = fe.max = 1e9;
const fighter = KS.S.pop.find(q => q.role === 'fight');
fighter.x = fe.x + 40; fighter.y = fe.y; fighter.fireCd = 0;
KS.simInhabitants(1 / 60);
t.ok(KS.S.shots.some(s => s.ally) && fighter.fireCd > 0, 'a fighter fires an arrow at a nearby foe and goes on cooldown');
t.ok(KS.fighterDmg() > 0, 'fighter damage scales with the king');
// collectors pick up matching items and haul them to be sold
KS.S.pop.forEach(q => { q.role = 'collect'; q.state = 'seek'; q.carry = []; });
KS.S.enemies.length = 0; KS.S.items.length = 0; KS.S.shots.length = 0; KS.S.pallet = 0;
const col = KS.S.pop[0];
KS.dropHelmet(zf.pen.x0 + 200, 500, zf.k); const drop = KS.S.items[KS.S.items.length - 1];
drop.t = 1; col.x = drop.x; col.y = drop.y; col.state = 'seek';
KS.simInhabitants(1 / 60);
t.ok(col.carry.length === 1 && drop.dead, 'a collector picks up a matching dropped item');
// filter: a stone-only collector ignores shields
KS.S.popFilter = 'stone'; col.carry = []; col.state = 'seek';
KS.S.items.length = 0; KS.dropHelmet(zf.pen.x0 + 220, 500, zf.k); const shield = KS.S.items[KS.S.items.length - 1]; shield.t = 1;
col.x = shield.x; col.y = shield.y;
KS.simInhabitants(1 / 60);
t.ok(col.carry.length === 0, 'a filtered collector ignores resources it was not told to gather');
// population + filter persist through save/load
KS.S.pop.forEach((q, i) => q.role = i === 0 ? 'fight' : 'collect'); KS.S.popFilter = 'log';
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.pop.length === 3 && KS.popCount('fight') === 1 && KS.S.popFilter === 'log', 'townsfolk roster + gather filter persist through save/load');
KS.start(); KS.S.showPop = true; drawSafe('draw() with townsfolk panel open');
KS.S.showPop = false; KS.S.pop = []; KS.S.popFilter = 'all'; KS.S.items.length = 0; KS.S.shots.length = 0; KS.S.pallet = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- housing: beds gate the population ----
KS.S.pop = []; KS.S.houses = 0; KS.S.wallet = 1e12;
const cap0 = KS.popCap();
t.ok(cap0 === KS.BEDS_BASE + KS.BEDS_PER_LAND * (KS.S.zones.length - 1), 'beds come from the base plus each settled land');
for (let i = 0; i < cap0; i++) KS.recruit();
t.ok(KS.S.pop.length === cap0 && KS.recruit() === false, 'recruiting stops when every bed is taken');
const hc = KS.houseCost(), wPre = KS.S.wallet;
t.ok(KS.buyHouse() === true && KS.S.houses === 1 && KS.S.wallet === wPre - hc, 'a cottage can be built for coins');
t.ok(KS.popCap() === cap0 + KS.BEDS_PER_HOUSE, 'each cottage adds beds');
t.ok(KS.houseCost() > hc, 'each cottage costs more than the last');
t.ok(KS.recruit() === true, 'a fresh bed lets you recruit again');

// ---- workplaces: jobs appear as you build, workers speed production ----
const defIds = () => KS.jobDefs().map(j => j.id);
t.ok(defIds().includes('collect') && defIds().includes('fight'), 'gatherer and fighter jobs always exist');
const hadCamp = KS.S.campPlate.built;
KS.S.campPlate.built = true; if (!KS.S.camp) KS.S.camp = { logs: [], chopT: 0 };
t.ok(defIds().includes('camp'), 'building the lumber camp unlocks its job row');
t.ok(KS.jobBoost('camp') === 1, 'an unstaffed workplace runs at normal speed');
t.ok(KS.movePop('collect', 'camp') && KS.movePop('collect', 'camp'), 'two gatherers can be stationed at the camp');
t.ok(KS.jobBoost('camp') === 1 + 2 * KS.WORK_BOOST, 'each worker adds +' + KS.WORK_BOOST * 100 + '% speed');
// functional: with x2 boost the chop finishes in half the time
KS.S.camp.logs.length = 0; KS.S.camp.chopT = 0;
const halfChop = C.CHOP_T / (1 + 2 * KS.WORK_BOOST) + 0.15;
step(halfChop);
t.ok(KS.S.camp.logs.length >= 1, 'a staffed camp chops logs faster than its base time');
// stationed workers patrol their workplace instead of gathering
const wq = KS.S.pop.find(q => q.role === 'camp');
const wx0 = wq.x, wy0 = wq.y;
wq.waitT = 0; wq.x = C.CAMP.x + 300; wq.y = C.CAMP.y + 300;
KS.simInhabitants(1 / 60);
t.ok(Math.hypot(wq.x - (C.CAMP.x + 300), wq.y - (C.CAMP.y + 300)) > 0, 'a stationed worker walks toward his workplace');
// un-station them again
KS.movePop('camp', 'collect'); KS.movePop('camp', 'collect');
t.ok(KS.jobBoost('camp') === 1, 'unassigned workers stop boosting');
KS.S.campPlate.built = hadCamp; if (!hadCamp) KS.S.camp = null;
// sanitize: a worker whose workplace vanished rejoins the pool
KS.S.pop[0].role = 'farm';
KS.sanitizePop();
t.ok(KS.S.pop[0].role === (KS.S.d2Plate.farm.built ? 'farm' : 'collect'), 'workers at unbuilt workplaces rejoin the gatherer pool');
// houses + jobs persist through save/load
KS.S.houses = 2; KS.S.campPlate.built = true; if (!KS.S.camp) KS.S.camp = { logs: [], chopT: 0 };
KS.S.pop.forEach(q => q.role = 'collect'); KS.S.pop[0].role = 'camp';
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.houses === 2 && KS.popCount('camp') === 1, 'cottages + stationed jobs persist through save/load');
KS.start();
KS.S.pop = []; KS.S.houses = 0; KS.S.wallet = 0;
KS.S.parts.length = 0; KS.S.toasts.length = 0; KS.S.floats.length = 0;

// ---- endless land: cost climbs super-exponentially ----
t.ok(KS.unlockCost(2) > KS.unlockCost(1) && KS.unlockCost(10) / KS.unlockCost(9) > KS.unlockCost(3) / KS.unlockCost(2), 'each land block costs disproportionately more than the last (super-exponential)');

// ---- guidance arrow ----
const g = KS.guideTarget();
t.ok(g && typeof g.x === 'number' && g.label, 'guide target exists');

// ---- save / load roundtrip (v3) ----
KS.S.wallet = 777; KS.S.pallet = 55; KS.S.gems = 9;
const hordeLvlSaved = z1.hordeLvl, towerLvlSaved = z1.towerLvl, portersSaved = z1.porters.length;
KS.save();
t.ok(!!store[C.SAVE_KEY], 'save written');
KS.reset();
t.ok(KS.S.wallet === 0 && KS.S.zones.length === 1 && !KS.S.forge, 'reset wipes live state');
t.ok(KS.load() === true, 'load succeeds');
t.ok(KS.S.wallet === 777 && KS.S.pallet >= 55 && KS.S.gems === 9, 'wallet + pallet + gems restored');
t.ok(KS.S.zones.length === 2, 'zone count restored');
t.ok(KS.S.zones[0].towers.length === 1 && KS.S.zones[0].porters.length === portersSaved, 'zone 1 towers + all porters rebuilt');
t.ok(KS.S.zones[0].hordeLvl === hordeLvlSaved && KS.S.zones[0].towerLvl === towerLvlSaved, 'repeatable levels restored');
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

// ---- achievements ----
KS.start();
t.ok(KS.S.ach.blood === true, 'First Blood milestone persisted through save/load');
KS.S.stats.kills = 5000;
KS.checkAch();
t.ok(KS.S.ach.k1000 === true, 'kill milestones unlock when thresholds pass');
t.ok(KS.S.toasts.length >= 1, 'milestone toast queued');
drawSafe('draw() with milestone toast');

// ---- war dog: fetches drops beyond the magnet ----
const p2 = KS.S.player;
KS.S.wallet = KS.S.dogPlate.cost + 100;
p2.x = C.KENNEL.x; p2.y = C.KENNEL.y;
step(KS.S.dogPlate.cost / C.BUILD_RATE + 1);
t.ok(KS.S.dogPlate.built && !!KS.S.dog, 'kennel built, dog spawned');
KS.S.enemies.length = 0; KS.S.items.length = 0; freezeSpawns();
p2.helmets = [];
p2.x = C.SPAWN.x; p2.y = C.SPAWN.y;
KS.S.dog.x = p2.x - 30; KS.S.dog.y = p2.y + 12;
KS.dropHelmet(p2.x + 200, p2.y, 1); // outside the pickup magnet
step(4);
t.ok(p2.helmets.length === 1, 'dog fetched the far helmet into the stack');

// ---- wandering treasure chest ----
KS.S.chest = null; KS.S.chestCd = 0.01;
step(0.2);
t.ok(!!KS.S.chest && KS.S.chest.val > 0, 'treasure chest spawns when the timer fires');
const wChest = KS.S.wallet;
KS.S.chest.x = p2.x; KS.S.chest.y = p2.y; // drag it under the player
step(0.6);
t.ok(KS.S.wallet > wChest, 'walking over the chest pays out');
t.ok(!KS.S.chest, 'chest is consumed and the timer re-arms');
KS.checkAch();
t.ok(KS.S.ach.chest1 === true, 'Treasure Hunter milestone unlocked');

// ---- lumber camp: passive second resource with a visible pile ----
KS.S.wallet = KS.S.campPlate.cost + 100;
p2.x = C.CAMP.x; p2.y = C.CAMP.y;
step(KS.S.campPlate.cost / C.BUILD_RATE + 1);
t.ok(KS.S.campPlate.built && !!KS.S.camp, 'lumber camp built');
KS.S.enemies.length = 0; KS.S.items.length = 0; freezeSpawns();
p2.helmets = [];
p2.x = C.SPAWN.x; p2.y = C.SPAWN.y;
KS.S.camp.logs.length = 0; KS.S.camp.chopT = 0;
step(C.CHOP_T * 3 + 0.5);
t.ok(KS.S.camp.logs.length === 3, 'woodcutter chopped logs onto the pile');
t.ok(KS.S.camp.logs[0] === KS.S.zones.length, 'log tier tracks unlocked lands');
p2.x = C.CAMP.x; p2.y = C.CAMP.y;
step(1.5);
t.ok(p2.helmets.length === 3 && p2.helmets.every(e => e.log), 'logs hauled onto the back stack');
const palL = KS.S.pallet;
p2.x = C.SELL.x; p2.y = C.SELL.y;
step(1.5);
t.ok(KS.S.pallet > palL, 'logs sell for coins');
// camp state persists
KS.S.camp.logs = [1, 1];
KS.save(); KS.reset(); KS.load();
t.ok(!!KS.S.camp && KS.S.camp.logs.length === 2, 'camp + log pile survive save/load');
KS.start();
const p3 = KS.S.player; // reset() above replaced the player object

// ---- minimap + music are draw/schedule-safe headless ----
try { KS.drawMinimap(); t.ok(true, 'minimap draws'); } catch (e) { t.ok(false, 'minimap threw: ' + e.message); }
try { KS.musicTick(); KS.musicTick(); t.ok(true, 'music scheduler runs'); } catch (e) { t.ok(false, 'musicTick threw: ' + e.message); }

// ---- records panel (achievements + stats) ----
t.ok(KS.S.showStats === false, 'records panel hidden by default');
try { KS.S.showStats = true; KS.draw(); t.ok(true, 'records panel draws (unlocked + locked milestones)'); }
catch (e) { t.ok(false, 'stats panel threw: ' + e.stack); }
KS.S.showStats = false;
// crafted stat feeds the Master Crafter milestone
t.ok(typeof KS.S.stats.crafted === 'number' || KS.S.stats.crafted === undefined, 'crafted stat tracked');
KS.S.stats.crafted = 50; KS.checkAch();
t.ok(KS.S.ach.craft50 === true, 'Master Crafter milestone unlocks at 50 crafted goods');
// playtime accumulates
const ptBefore = KS.S.stats.playT || 0;
step(1);
t.ok(KS.S.stats.playT > ptBefore, 'playtime accumulates in stats');

// ---- quest tracker is opt-in ----
t.ok(KS.S.showQuests === false, 'quest panel hidden by default (📜 button toggles it)');

// ---- industry district: factorio-lite production chain ----
KS.S.wallet = KS.S.distPlate.cost + 100;
p3.x = C.DIST.plate.x; p3.y = C.DIST.plate.y;
step(KS.S.distPlate.cost / C.BUILD_RATE + 1);
t.ok(KS.S.distPlate.built && !!KS.S.district, 'industry district purchased');
t.ok(KS.inWalkable(C.DIST.grove.x, C.DIST.grove.y) === true, 'district cell is walkable');
freezeSpawns(); KS.S.enemies.length = 0; KS.S.items.length = 0;
p3.helmets = [];
// forest grove: real trees, real woodcutter, real pile
const gp = KS.S.district.plates.grove;
KS.S.wallet = gp.cost + 200;
p3.x = C.DIST.grove.x; p3.y = C.DIST.grove.y;
step(gp.cost / C.BUILD_RATE + 1);
t.ok(gp.built, 'forest grove built');
p3.helmets = []; // drop anything hoovered while standing on the pile
p3.x = C.SPAWN.x; p3.y = C.SPAWN.y;
KS.S.district.grove.logs.length = 0; KS.S.district.grove.t = 0;
step(C.GROVE_T * 3 + 0.5);
t.ok(KS.S.district.grove.logs.length === 3, 'woodcutter fills the grove log pile');
// sawmill: 2 logs → 1 plank
const sp = KS.S.district.plates.saw;
KS.S.wallet = sp.cost + 100;
p3.x = C.DIST.saw.x; p3.y = C.DIST.saw.y;
step(sp.cost / C.BUILD_RATE + 1);
t.ok(sp.built, 'sawmill built');
p3.helmets = [{ k: 2, log: true }, { k: 2, log: true }];
step(1);
t.ok(KS.S.district.saw.ks.length >= 2 && p3.helmets.length === 0, 'sawmill intake eats logs from the stack');
p3.x = C.SPAWN.x; p3.y = C.SPAWN.y;
step(C.SAW_T + 1);
t.ok(KS.S.district.saw.tray.length >= 1, 'two logs became a plank');
p3.x = C.DIST.sawTray.x; p3.y = C.DIST.sawTray.y;
step(1);
t.ok(p3.helmets.some(e => e.plank), 'plank picked up from the tray');
t.ok(KS.entryVal({ k: 2, plank: true }) === Math.ceil(KS.helmVal(2) * C.PLANK_MUL * KS.coinMul()), 'planks are worth x' + C.PLANK_MUL);
// quarry
const qp = KS.S.district.plates.quarry;
KS.S.wallet = qp.cost + 100;
p3.x = C.DIST.quarry.x; p3.y = C.DIST.quarry.y;
step(qp.cost / C.BUILD_RATE + 1);
t.ok(qp.built, 'stone quarry built');
p3.helmets = [];
p3.x = C.SPAWN.x; p3.y = C.SPAWN.y;
KS.S.district.quarry.stones.length = 0; KS.S.district.quarry.t = 0;
step(C.QUARRY_T * 3 + 0.5);
t.ok(KS.S.district.quarry.stones.length === 3, 'miner fills the stone pile');
// toolmaker: 1 plank + 2 stones → 1 tool
const tp2 = KS.S.district.plates.tool;
KS.S.wallet = tp2.cost + 100;
p3.x = C.DIST.tool.x; p3.y = C.DIST.tool.y;
step(tp2.cost / C.BUILD_RATE + 1);
t.ok(tp2.built, 'toolmaker built');
p3.helmets = [{ k: 2, plank: true }, { k: 2, stone: true }, { k: 2, stone: true }];
step(1);
t.ok(KS.S.district.tool.wood.length === 1 && KS.S.district.tool.stone.length === 2 && p3.helmets.length === 0, 'toolmaker intake sorts planks and stones');
p3.x = C.SPAWN.x; p3.y = C.SPAWN.y;
step(C.TOOL_T + 1);
t.ok(KS.S.district.tool.tray.length === 1, 'crafted a tool from plank + stones');
p3.x = C.DIST.toolTray.x; p3.y = C.DIST.toolTray.y;
step(1);
t.ok(p3.helmets.some(e => e.tool), 'tool picked up');
t.ok(KS.entryVal({ k: 2, tool: true }) === Math.ceil(KS.helmVal(2) * C.TOOL_MUL * KS.coinMul()), 'tools are worth x' + C.TOOL_MUL);
p3.helmets = [];
// hauler automates grove → sawmill
const hp2 = KS.S.district.plates.hauler;
KS.S.wallet = hp2.cost + 100;
p3.x = C.DIST.hauler.x; p3.y = C.DIST.hauler.y;
step(hp2.cost / C.BUILD_RATE + 1);
t.ok(hp2.built && !!KS.S.district.haulerNpc, 'hauler hired');
KS.S.district.saw.ks.length = 0; KS.S.district.saw.tray.length = 0;
KS.S.district.grove.logs = [2, 2, 2, 2];
p3.x = C.SPAWN.x; p3.y = C.SPAWN.y;
step(15);
t.ok(KS.S.district.saw.ks.length + KS.S.district.saw.tray.length * 2 > 0, 'hauler feeds the sawmill hands-free');
// trader sells finished goods
const tr2 = KS.S.district.plates.trader;
KS.S.wallet = tr2.cost + 100;
p3.x = C.DIST.trader.x; p3.y = C.DIST.trader.y;
step(tr2.cost / C.BUILD_RATE + 1);
t.ok(tr2.built && !!KS.S.district.traderNpc, 'trader hired');
KS.S.district.tool.tray = [2, 2];
const palT = KS.S.pallet;
p3.x = C.SPAWN.x; p3.y = C.SPAWN.y;
step(35);
t.ok(KS.S.pallet > palT, 'trader hauled tools to the sell stand → pallet grew');
// persistence
KS.S.district.grove.logs = [1, 1, 1];
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.distPlate.built && KS.S.district.plates.saw.built && KS.S.district.grove.logs.length === 3, 'district survives save/load');
t.ok(!!KS.S.district.haulerNpc && !!KS.S.district.traderNpc, 'district NPCs respawn on load');
KS.start();
const p4 = KS.S.player;
drawSafe('draw() with industry district');

// ---- farmlands (SW diagonal, unlocks with land 3) ----
KS.S.zones.push(KS.mkZone(3));
freezeSpawns(); KS.S.enemies.length = 0;
const F = KS.D2CFG.farm;
KS.S.wallet = KS.S.d2Plate.farm.cost + 100;
p4.x = F.plate.x; p4.y = F.plate.y;
step(KS.S.d2Plate.farm.cost / C.BUILD_RATE + 1);
t.ok(KS.S.d2Plate.farm.built && !!KS.S.d2.farm, 'farmlands purchased from land 2\'s west edge');
t.ok(KS.inWalkable(F.producers[0].pos.x, F.producers[0].pos.y) === true, 'farm cell is walkable');
const fw = KS.S.d2.farm;
// wheat field grows wheat
KS.S.wallet = fw.plates.wheat.cost + 100;
p4.x = F.producers[0].pos.x; p4.y = F.producers[0].pos.y;
step(fw.plates.wheat.cost / C.BUILD_RATE + 1);
t.ok(fw.plates.wheat.built, 'wheat field built');
p4.helmets = [];
p4.x = C.SPAWN.x; p4.y = C.SPAWN.y;
fw.piles.wheat.arr.length = 0; fw.piles.wheat.t = 0;
step(F.producers[0].t * 3 + 0.5);
t.ok(fw.piles.wheat.arr.length === 3, 'wheat grows into a pile');
// windmill: 2 wheat → flour
KS.S.wallet = fw.plates.mill.cost + 100;
p4.x = F.crafters[0].pos.x; p4.y = F.crafters[0].pos.y;
step(fw.plates.mill.cost / C.BUILD_RATE + 1);
t.ok(fw.plates.mill.built, 'windmill built');
p4.helmets = [{ k: 3, res: 'wheat' }, { k: 3, res: 'wheat' }];
step(1);
t.ok(fw.crafts.mill.in.wheat.length >= 2 && p4.helmets.length === 0, 'windmill intake takes wheat');
p4.x = C.SPAWN.x; p4.y = C.SPAWN.y;
step(F.crafters[0].t + 1);
t.ok(fw.crafts.mill.tray.length >= 1, '2 wheat became flour');
t.ok(KS.entryVal({ k: 3, res: 'flour' }) === Math.ceil(KS.helmVal(3) * KS.RES_MUL.flour * KS.coinMul()), 'flour is worth x3');
// bakery: flour + apple → pie
KS.S.wallet = fw.plates.bakery.cost + 100;
p4.x = F.crafters[1].pos.x; p4.y = F.crafters[1].pos.y;
step(fw.plates.bakery.cost / C.BUILD_RATE + 1);
t.ok(fw.plates.bakery.built, 'bakery built');
p4.helmets = [{ k: 3, res: 'flour' }, { k: 3, res: 'apple' }];
step(1);
t.ok(fw.crafts.bakery.in.flour.length === 1 && fw.crafts.bakery.in.apple.length === 1, 'bakery takes flour + apple');
p4.x = C.SPAWN.x; p4.y = C.SPAWN.y;
step(F.crafters[1].t + 1);
t.ok(fw.crafts.bakery.tray.length === 1, 'baked a pie');
t.ok(KS.entryVal({ k: 3, res: 'pie' }) === Math.ceil(KS.helmVal(3) * KS.RES_MUL.pie * KS.coinMul()), 'pies are worth x11');
// farm trader sells pies at the hub
KS.S.wallet = fw.plates.trader.cost + 100;
p4.x = F.trader.x; p4.y = F.trader.y;
step(fw.plates.trader.cost / C.BUILD_RATE + 1);
t.ok(fw.plates.trader.built && !!fw.traderNpc, 'farm trader hired');
fw.crafts.bakery.tray.push(3);
const palF = KS.S.pallet;
p4.x = C.SPAWN.x; p4.y = C.SPAWN.y;
step(40);
t.ok(KS.S.pallet > palF, 'farm trader sold pies at the hub');

// ---- deep mines (NW diagonal, unlocks with land 4) + cross-district sword ----
KS.S.zones.push(KS.mkZone(4));
freezeSpawns();
const M = KS.D2CFG.mine;
KS.S.wallet = KS.S.d2Plate.mine.cost + 200;
p4.x = M.plate.x; p4.y = M.plate.y;
step(KS.S.d2Plate.mine.cost / C.BUILD_RATE + 1.5);
t.ok(KS.S.d2Plate.mine.built && !!KS.S.d2.mine, 'deep mines purchased from land 3\'s north edge');
const mn = KS.S.d2.mine;
// smeltery: 2 ore + 1 coal → ingot
KS.S.wallet = mn.plates.smelter.cost + 100;
p4.x = M.crafters[0].pos.x; p4.y = M.crafters[0].pos.y;
step(mn.plates.smelter.cost / C.BUILD_RATE + 1);
t.ok(mn.plates.smelter.built, 'smeltery built');
p4.helmets = [{ k: 4, res: 'ore' }, { k: 4, res: 'ore' }, { k: 4, res: 'coal' }];
step(1);
t.ok(mn.crafts.smelter.in.ore.length === 2 && mn.crafts.smelter.in.coal.length === 1, 'smeltery takes ore + coal');
p4.x = C.SPAWN.x; p4.y = C.SPAWN.y;
step(M.crafters[0].t + 1);
t.ok(mn.crafts.smelter.tray.length === 1, 'smelted an ingot');
// weaponsmith: ingot + plank (from the industry sawmill!) → sword
KS.S.wallet = mn.plates.smith.cost + 100;
p4.x = M.crafters[1].pos.x; p4.y = M.crafters[1].pos.y;
step(mn.plates.smith.cost / C.BUILD_RATE + 1);
t.ok(mn.plates.smith.built, 'weaponsmith built');
p4.helmets = [{ k: 4, res: 'ingot' }, { k: 4, plank: true }];
step(1);
t.ok(mn.crafts.smith.in.ingot.length === 1 && mn.crafts.smith.in.plank.length === 1, 'smith takes ingot + plank (legacy plank flag works)');
p4.x = C.SPAWN.x; p4.y = C.SPAWN.y;
step(M.crafters[1].t + 1);
t.ok(mn.crafts.smith.tray.length === 1, 'forged a sword');
t.ok(KS.entryVal({ k: 4, res: 'sword' }) === Math.ceil(KS.helmVal(4) * KS.RES_MUL.sword * KS.coinMul()), 'swords are worth x20');
// mine hauler pulls planks from the industry district sawmill
KS.S.wallet = mn.plates.hauler.cost + 100;
p4.x = M.hauler.x; p4.y = M.hauler.y;
step(mn.plates.hauler.cost / C.BUILD_RATE + 1);
t.ok(mn.plates.hauler.built && !!mn.haulerNpc, 'mine hauler hired');
KS.S.district.saw.tray.length = 0; KS.S.district.saw.tray.push(2, 2, 2);
mn.crafts.smith.in.plank.length = 0; mn.crafts.smith.in.ingot.length = 0;
mn.crafts.smelter.tray.length = 0; // no closer job: force the cross-district plank run
p4.x = C.SPAWN.x; p4.y = C.SPAWN.y;
step(60); // the sawmill is ~2600px away — a real haul
t.ok(mn.crafts.smith.in.plank.length > 0, 'hauler ferries planks across districts to the smith');
// persistence for both new districts
fw.piles.wheat.arr = [1, 1];
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.d2Plate.farm.built && KS.S.d2.farm.plates.mill.built && KS.S.d2.farm.piles.wheat.arr.length === 2, 'farmlands survive save/load');
t.ok(KS.S.d2Plate.mine.built && KS.S.d2.mine.plates.smith.built && !!KS.S.d2.mine.haulerNpc, 'deep mines + NPCs survive save/load');

// ---- artisan quarter (NE diagonal, unlocks with land 6) + cross-district ingot ----
// the mine save/load test above did reset()+load(), so re-grab the live player and
// rebuild the industry+farm+mine districts we rely on for cross-district hauling
KS.start();
const p4b = KS.S.player;
while (KS.S.zones.length < 6) KS.S.zones.push(KS.mkZone(KS.S.zones.length + 1));
freezeSpawns();
const A = KS.D2CFG.artisan;
t.ok(A.cell[0] === 1 && A.cell[1] === -1 && A.need === 6, 'artisan quarter sits NE, needs 6 lands');
KS.S.wallet = KS.S.d2Plate.artisan.cost + 200;
p4b.x = A.plate.x; p4b.y = A.plate.y;
step(KS.S.d2Plate.artisan.cost / C.BUILD_RATE + 1.5);
t.ok(KS.S.d2Plate.artisan.built && !!KS.S.d2.artisan, 'artisan quarter purchased from land 1\'s north edge');
const ar = KS.S.d2.artisan;
// sheep pen grows wool
KS.S.wallet = ar.plates.sheep.cost + 100;
p4b.x = A.producers[0].pos.x; p4b.y = A.producers[0].pos.y;
step(ar.plates.sheep.cost / C.BUILD_RATE + 1);
t.ok(ar.plates.sheep.built, 'sheep pen built');
p4b.helmets = [];
p4b.x = C.SPAWN.x; p4b.y = C.SPAWN.y;
ar.piles.sheep.arr.length = 0; ar.piles.sheep.t = 0;
step(A.producers[0].t * 3 + 0.5);
t.ok(ar.piles.sheep.arr.length === 3, 'sheep produce wool');
// weaver: 2 wool → cloth
KS.S.wallet = ar.plates.weaver.cost + 100;
p4b.x = A.crafters[0].pos.x; p4b.y = A.crafters[0].pos.y;
step(ar.plates.weaver.cost / C.BUILD_RATE + 1);
t.ok(ar.plates.weaver.built, 'weaver built');
p4b.helmets = [{ k: 6, res: 'wool' }, { k: 6, res: 'wool' }];
step(1);
t.ok(ar.crafts.weaver.in.wool.length >= 2 && p4b.helmets.length === 0, 'weaver takes wool');
p4b.x = C.SPAWN.x; p4b.y = C.SPAWN.y;
step(A.crafters[0].t + 1);
t.ok(ar.crafts.weaver.tray.length >= 1, '2 wool became cloth');
t.ok(KS.entryVal({ k: 6, res: 'cloth' }) === Math.ceil(KS.helmVal(6) * KS.RES_MUL.cloth * KS.coinMul()), 'cloth is worth x5');
// grand atelier: cloth + dye + ingot → regalia (three-input, cross-district ingot)
KS.S.wallet = ar.plates.atelier.cost + 100;
p4b.x = A.crafters[1].pos.x; p4b.y = A.crafters[1].pos.y;
step(ar.plates.atelier.cost / C.BUILD_RATE + 1);
t.ok(ar.plates.atelier.built, 'grand atelier built');
p4b.helmets = [{ k: 6, res: 'cloth' }, { k: 6, res: 'dye' }, { k: 6, res: 'ingot' }];
step(1);
t.ok(ar.crafts.atelier.in.cloth.length === 1 && ar.crafts.atelier.in.dye.length === 1 && ar.crafts.atelier.in.ingot.length === 1, 'atelier sorts a 3-ingredient recipe');
p4b.x = C.SPAWN.x; p4b.y = C.SPAWN.y;
step(A.crafters[1].t + 1);
t.ok(ar.crafts.atelier.tray.length === 1, 'crafted royal regalia');
t.ok(KS.entryVal({ k: 6, res: 'regalia' }) === Math.ceil(KS.helmVal(6) * KS.RES_MUL.regalia * KS.coinMul()), 'regalia is worth x34');
// artisan hauler fetches ingots cross-district from the deep mines
KS.S.wallet = ar.plates.hauler.cost + 100;
p4b.x = A.hauler.x; p4b.y = A.hauler.y;
step(ar.plates.hauler.cost / C.BUILD_RATE + 1);
t.ok(ar.plates.hauler.built && !!ar.haulerNpc, 'artisan hauler hired');
KS.S.d2.mine.haulerNpc = null; // stop the mine's own hauler from stealing the ingots first
KS.S.d2.mine.crafts.smelter.tray.length = 0; KS.S.d2.mine.crafts.smelter.tray.push(6, 6, 6); // ingots waiting at the mine
ar.crafts.atelier.in.ingot.length = 0; ar.crafts.atelier.in.cloth.length = 0; ar.crafts.atelier.in.dye.length = 0;
// starve every LOCAL job so the ingot run across the map is the only work available
ar.piles.sheep.arr.length = 0; ar.piles.dye.arr.length = 0; ar.crafts.weaver.tray.length = 0;
p4b.x = C.SPAWN.x; p4b.y = C.SPAWN.y;
step(90); // the mine is across the entire map
t.ok(ar.crafts.atelier.in.ingot.length > 0, 'artisan hauler ferries ingots from the deep mines to the atelier');

KS.start();
const p5 = KS.S.player;
drawSafe('draw() with all four districts');

// ---- prestige: New Kingdom ----
while (KS.S.zones.length < C.PRESTIGE_MIN) KS.S.zones.push(KS.mkZone(KS.S.zones.length + 1));
KS.S.gems = 7; KS.S.wallet = 999;
const gain = KS.crownsToGain();
p5.x = C.MONU.x; p5.y = C.MONU.y; // stand still on the monument
step(C.PREST_T + 1);
t.ok(KS.S.crowns === gain && KS.S.prestiges === 1, 'holding the monument founds a New Kingdom');
t.ok(KS.S.zones.length === 1 && KS.S.wallet === 0, 'prestige resets lands and coins');
t.ok(KS.S.gems === 7, 'gems survive prestige');
t.ok(Math.abs(KS.coinMul() - (1 + 0.25 * KS.S.gemUp.coin) * (1 + C.CROWN_BONUS * gain)) < 1e-9, 'crowns boost all coin income forever');
t.ok(Math.abs(KS.pDmg() - 6 * (1 + C.CROWN_DMG * gain)) < 1e-9, 'crowns sharpen the royal weapon (+30% dmg each)');
t.ok(KS.S.ach.crown1 === true, 'prestige milestone unlocked');
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.crowns === gain && KS.S.prestiges === 1, 'crowns persist through save/load');

// ---- quests: progress, payout, replacement ----
KS.start();
const wQ = KS.S.wallet;
KS.S.quests[0] = { tpl: 'kill', icon: '⚔️', ev: 'kill', txt: 'Slay 3 foes', target: 3, prog: 0, reward: 111, gem: false, daily: false, done: false, doneT: 0 };
KS.questEvent('kill', 2);
t.ok(KS.S.quests[0].prog === 2 && !KS.S.quests[0].done, 'quest progress tracks events');
KS.questEvent('kill', 1);
t.ok(KS.S.quests[0].done === true, 'quest completes at target');
t.ok(KS.S.wallet === wQ + 111, 'quest pays out instantly');
step(3);
t.ok(!KS.S.quests[0].done, 'completed side quest is replaced by a fresh one');
KS.S.quests[0].target = 9e9;

// ---- dailies + streak ----
const todayStr = new Date().toISOString().slice(0, 10);
const yestStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
KS.S.streak = 0; KS.S.lastStreakDay = '';
KS.S.dailies[0] = { tpl: 'log', icon: '🪵', ev: 'log', txt: 'Haul 2 logs', target: 2, prog: 0, reward: 50, gem: false, daily: true, done: false, doneT: 0 };
KS.questEvent('log', 2);
t.ok(KS.S.dailies[0].done && KS.S.streak === 1 && KS.S.lastStreakDay === todayStr, 'first daily completion starts the streak');
KS.S.streak = 3; KS.S.lastStreakDay = yestStr;
KS.S.dailies[1] = { tpl: 'bar', icon: '🥇', ev: 'bar', txt: 'Smelt 1 bar', target: 1, prog: 0, reward: 50, gem: false, daily: true, done: false, doneT: 0 };
KS.questEvent('bar', 1);
t.ok(KS.S.streak === 4, 'consecutive-day completion extends the streak');
t.ok(Math.abs(KS.streakMul() - 1.3) < 1e-9, 'streak multiplies daily rewards (+10%/day)');
// midnight rollover
KS.S.dailyDay = '2000-01-01'; KS.S.dayCd = 0;
KS.tick(1 / 60);
t.ok(KS.S.dailyDay === todayStr && KS.S.dailies.every(q => q.prog === 0 && !q.done), 'dailies re-roll on a new day');
for (const q of KS.S.dailies) q.target = 9e9;
// persistence
KS.S.streak = 5;
KS.save(); KS.reset(); KS.load();
t.ok(KS.S.streak === 5 && KS.S.dailies.length === 3 && KS.S.quests.length === 3, 'streak + quests + dailies persist');
KS.start();
drawSafe('draw() with quest tracker + biomes');

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
