// Headless smoke + logic suite for Kingshot Endless (kingshot_endless/index.html).
// Evaluates the game's inline <script> with a stubbed DOM/canvas and drives
// tick()/draw() directly through the window.KS test hooks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadKingshot() {
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

  const store = { ks_endless_muted: '1' }; // keep sfx() on its early-out path
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  // recursive stub: any chain of prop-gets/calls keeps working, currentTime is numeric
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
  global.document = { getElementById: () => mkEl(), addEventListener: noop };
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
  global.__KS_HEADLESS__ = true; // stops the game from starting its own rAF loop

  eval('(function(){' + code + '\n})()');
  return { KS: globalThis.KS, store };
}

const t = harness('kingshot_endless');
const { KS, store } = loadKingshot();

// ---- boot state ----
t.ok(KS && typeof KS.tick === 'function', 'KS test hooks exposed');
t.ok(KS.S.phase === 'menu', 'boots to menu');
t.ok(KS.S.coins === KS.constants.START_COINS, 'starting coins');
t.ok(KS.S.slots.length === 6, 'six wall slots');
t.ok(KS.S.wallHp === KS.constants.WALL_HP0, 'wall at full hp');

// ---- draw never throws, in every phase ----
const drawSafe = (label) => {
  try { KS.draw(); t.ok(true, label); } catch (e) { t.ok(false, label + ' threw: ' + e.message); }
};
drawSafe('draw() in menu');

// ---- placement & economy ----
KS.startBuild();
t.ok(KS.S.phase === 'build', 'build phase after startBuild');
const c0 = KS.S.coins;
const archerCost = KS.placeCost('archer');
t.ok(KS.placeUnit(KS.S.slots[0], 'archer') === true, 'place archer in empty slot');
t.ok(KS.S.coins === c0 - archerCost, 'archer cost deducted');
t.ok(KS.placeUnit(KS.S.slots[0], 'archer') === false, 'cannot place on occupied slot');
t.ok(KS.placeCost('archer') > archerCost, 'placement cost ramps with owned count');
t.ok(KS.placeUnit(KS.S.slots[1], 'spear') === false, 'spear locked before wave 2');
t.ok(KS.placeUnit(KS.S.slots[1], 'mage') === false, 'mage locked before wave 4');
KS.S.coins = 0;
t.ok(KS.placeUnit(KS.S.slots[1], 'archer') === false, 'cannot place without coins');
KS.S.coins = 500;

// ---- upgrade ----
const u = KS.S.slots[0].unit;
const dmg1 = KS.unitDmg(u), upc = KS.upgCost(u);
t.ok(KS.upgradeUnit(KS.S.slots[0]) === true, 'upgrade works with coins');
t.ok(u.lvl === 2, 'level went up');
t.ok(Math.abs(KS.unitDmg(u) - dmg1 * 1.35) < 1e-9, 'damage scales x1.35 per level');
t.ok(KS.upgCost(u) > upc, 'upgrade cost grows');
drawSafe('draw() in build with units');

// ---- wall economy ----
KS.S.wallHp = 100;
t.ok(KS.repairWall() === true, 'repair works');
t.ok(KS.S.wallHp === KS.S.wallMax, 'repair restores to max');
t.ok(KS.repairWall() === false, 'repair refused at full hp');
const max0 = KS.S.wallMax;
t.ok(KS.fortifyWall() === true, 'fortify works');
t.ok(KS.S.wallMax === Math.round(max0 * 1.25), 'fortify raises max hp x1.25');

// ---- wave 1 plays out and clears ----
KS.S.coins = 200;
KS.startWave(false);
t.ok(KS.S.phase === 'wave' && KS.S.wave === 1, 'wave 1 started');
t.ok(KS.S.spawnQ.length === KS.waveCount(1), 'spawn queue matches waveCount');
let steps = 0;
while (KS.S.phase === 'wave' && steps < 60 * 180) { KS.tick(1 / 60); if (steps % 30 === 0) KS.draw(); steps++; }
t.ok(KS.S.phase === 'build', 'wave 1 cleared back to build phase');
t.ok(KS.S.kills >= KS.waveCount(1), 'all wave-1 enemies killed');
t.ok(KS.S.wallHp > 0, 'wall survived wave 1');
t.ok(KS.S.coins > 200, 'kills + clear bonus paid out');
t.ok(store.ks_endless_best === '1', 'best wave persisted to localStorage');

// ---- volley ----
KS.startWave(true); // wave 2, with skip bonus
t.ok(KS.S.wave === 2, 'wave 2 started');
KS.tick(1.2); // let a couple of enemies spawn
t.ok(KS.fireVolley(240, 300) === true, 'volley fires on battlefield tap');
t.ok(KS.S.volleyCd > 0, 'volley goes on cooldown');
t.ok(KS.fireVolley(240, 300) === false, 'volley refused while on cooldown');
t.ok(KS.S.shots.some(s => s.kind === 'volley'), 'volley arrows in flight');

// ---- shield resist ----
KS.spawnEnemy('shield');
const sh = KS.S.enemies[KS.S.enemies.length - 1];
const hp0 = sh.hp;
KS.S.floats.length = 0;
// hurtEnemy is internal; emulate a ranged hit through a resolved arrow instead:
KS.S.shots.push({ kind: 'arrow', x: 0, y: 0, tgt: sh, t: 99, dur: 0.01, dmg: 10 });
KS.tick(1 / 60);
t.ok(Math.abs((hp0 - sh.hp) - 10 * (1 - KS.FOES.shield.resist)) < 0.5, 'shieldbearer halves ranged damage');

// ---- scaling sanity ----
t.ok(KS.hpMul(10) > KS.hpMul(5) && KS.hpMul(5) > KS.hpMul(1), 'hp scaling monotonic');
t.ok(KS.waveCount(100) === 42, 'wave size capped');

// ---- boss wave ----
KS.S.wave = 9; KS.S.spawnQ = []; KS.S.enemies.length = 0; KS.S.phase = 'build';
KS.startWave(false);
t.ok(KS.S.spawnQ.some(q => q.type === 'boss'), 'wave 10 spawns a boss');
drawSafe('draw() mid-wave with boss queued');

// ---- game over + restart ----
KS.S.wave = 12; // pretend we got far
KS.damageWall(1e9);
t.ok(KS.S.phase === 'over', 'wall breaking ends the game');
t.ok(store.ks_endless_best === '12', 'new best saved on game over');
drawSafe('draw() on game-over screen');
KS.reset();
t.ok(KS.S.phase === 'menu' && KS.S.coins === KS.constants.START_COINS, 'reset returns to fresh menu');
t.ok(KS.S.best === 12, 'best survives reset');

// ---- tap routing (uses hit regions built by draw) ----
KS.draw();
KS.tap(240, 500); // menu DEFEND button sits at ~(240, 504)
t.ok(KS.S.phase === 'build', 'tapping DEFEND starts the game');

t.done();
