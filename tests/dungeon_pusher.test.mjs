// Headless suite for Dungeon Pusher (coin pusher roguelike). The game's inline
// <script> is evaluated with a stubbed DOM and no canvas ctx, which flips its
// HEADLESS switch: the full 2.5D pusher sim plus the whole roguelike layer
// (the purse-as-deck hand, TILT charges, tray banking, telegraphed enemy
// intents, multi-foe gang-ups, the per-floor persistent pile, the top-down
// room crawl with keys/doors/inhabitants, shops, forges, relics, save/load)
// runs and is driven through window.DP.
// A second pass loads the game WITH a stub canvas ctx and drives the real
// requestAnimationFrame loop across every screen to catch render-time errors.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadGame(store, withCtx) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  const code = html.match(/<script>\s*'use strict';([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k) {
    if (k === 'save' || k === 'restore') return noop;
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    return noop;
  }, set() { return true; } });
  const mkEl = () => new Proxy({
    style: {}, addEventListener: noop,
    getContext: () => (withCtx ? ctx : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 840 }),
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  let rafCb = null;
  global.requestAnimationFrame = (cb) => { rafCb = cb; };
  global.Image = class {
    constructor() { this._ok = false; }
    set src(v) { this._src = v; if (this.onload) this.onload(); }
    get src() { return this._src; }
    get width() { return 64; } get height() { return 64; }
  };
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 480; global.innerHeight = 840;
  global.setTimeout = () => 0; global.clearTimeout = noop;
  global.document = { getElementById: () => mkEl(), createElement: () => mkEl(), addEventListener: noop, hidden: false, body: mkEl() };
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });

  eval('(function(){' + code + '\n})()');
  return { DP: globalThis.DP, raf: () => rafCb };
}

const t = harness('dungeon_pusher');
t.eq = (a, b, msg) => t.ok(a === b, msg + ' [' + a + ' != ' + b + ']');

const store = {};
const { DP } = loadGame(store, false);
const { S, C, ITEMS, ENEMIES, BOSSES, RELICS, WHEEL, COIN_KINDS } = DP;
const DT = 1 / 60;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) DP.tick(DT); };
const platCoins = () => S.coins.filter(c => c.st === 'plat');
const mkMonster = (eid) => ({ kind: 'monster', mtype: 'battle', eid: eid || 'orc', done: false, px: 0.5, py: 0.4 });
const mapRooms = () => Object.values(S.run.map.rooms);
const DX = { n: 0, s: 0, e: 1, w: -1 }, DY = { n: -1, s: 1, e: 0, w: 0 };
const lk2 = (a, b) => (a.gy < b.gy || (a.gy === b.gy && a.gx < b.gx))
  ? a.gx + ',' + a.gy + '~' + b.gx + ',' + b.gy
  : b.gx + ',' + b.gy + '~' + a.gx + ',' + a.gy;
// a direction from the current room where a corridor was actually dug
const openDir = (wantOpen) => {
  const r = DP.curRoom();
  for (const d of ['n', 's', 'e', 'w']) {
    const nb = S.run.map.rooms[(r.gx + DX[d]) + ',' + (r.gy + DY[d])];
    if (!nb) continue;
    const l = S.run.map.links[lk2(r, nb)];
    if (!l) continue;
    if (wantOpen === undefined || !!l.open === wantOpen) return d;
  }
  return null;
};
// run the round machine until the given phase (or a timeout)
const untilPhase = (phase, maxSecs) => {
  for (let i = 0; i < Math.round((maxSecs || 12) * 60); i++) {
    DP.tick(DT);
    if (!S.battle || S.battle.phase === phase || S.victory || !S.run) return true;
  }
  return S.battle && S.battle.phase === phase;
};
// zero the current hand (drop() refuses an empty hand; nothing auto-fires)
const drainHand = () => { for (const k of COIN_KINDS) S.battle.hand[k] = 0; };
// win + leave the current battle without side quests
const finishFight = () => {
  for (const f of S.foes) { if (f.hp > 0) { f.hp = 1; DP.dmgFoe(f, 5); } }
  DP.leaveBattle();
};

// -------- boot state --------
t.ok(DP.HEADLESS, 'headless mode detected');
t.eq(S.screen, 'title', 'boots to the title screen');
t.eq(S.run, null, 'no run in progress at first boot');
t.ok(ITEMS.length === 13 && ITEMS.every(i => i.id && i.icon && i.name && i.cost > 0), 'thirteen arsenal items defined');
t.ok(ENEMIES.length >= 8 && ENEMIES.every(e => e.hp > 0 && e.atk > 0), 'the bestiary is populated');
t.eq(BOSSES.length, 3, 'three floor bosses');
t.ok(RELICS.length >= 88 && RELICS.every(r => r.id && r.desc), 'the relic shelf is stocked (' + RELICS.length + ')');
t.ok(RELICS.every(r => ['c', 'r', 'e'].indexOf(r.rar) >= 0), 'every relic carries a rarity stamp');
t.eq(new Set(RELICS.map(r => r.id)).size, RELICS.length, 'no duplicate relic ids');
t.eq(WHEEL.length, 9, 'the wheel of fortune has nine prize segments');
t.ok(WHEEL.every(s => s.label && typeof s.fx === 'function'), 'every wheel segment names a prize and an effect');
t.eq(COIN_KINDS.length, 6, 'six coin types in the mint');
t.ok(COIN_KINDS.every(k => DP.COIN_INFO[k] && DP.COIN_INFO[k].name && DP.COIN_INFO[k].what),
     'every coin type is described');

// -------- the four adventurers and their signature coins --------
t.ok(DP.HEROES.length === 4 && DP.HEROES.every(h => h.id && h.name && h.perk && h.coin),
     'four heroes, each with a signature coin');
DP.srand(41);
DP.newRun('knight');
t.eq(S.run.hero, 'knight', 'the knight answers the call');
t.eq(S.run.purse.silver, DP.START_PURSE.silver + 2, 'knight signature: +2 SILVER');
t.eq(S.run.hp, S.run.maxHp, 'and starts at full HP');
DP.newRun('rogue');
t.eq(S.run.purse.green, 2, 'rogue signature: +2 VENOM');
DP.newRun('wizard');
t.eq(S.run.purse.blue, 2, 'mage signature: +2 FROST (the gang-buster)');
DP.newRun('cleric');
t.eq(S.run.purse.red, 2, 'cleric signature: +2 HEART');
t.eq(S.run.purse.coin, DP.START_PURSE.coin, 'everyone starts with 5 gold coins');
t.eq(S.run.purse.silver, DP.START_PURSE.silver, 'and 5 silver');
t.eq(DP.purseTotal(), 12, 'twelve coins in the opening purse');
t.eq(S.heroPick, 'cleric', 'the pick is remembered');
DP.newRun('nonsense');
t.eq(S.run.hero, 'cleric', 'unknown heroes fall back to the remembered pick');

// -------- a new run --------
DP.srand(42);
DP.newRun('rogue');
t.eq(S.screen, 'dungeon', 'new run opens in the dungeon');
t.eq(S.run.floor, 1, 'run starts on floor 1');
t.eq(S.run.depth, 1, 'run starts at room 1');
t.eq(S.run.hp, C.START_HP, 'full HP at the start');
t.eq(S.run.keys, C.START_KEYS, 'the starter key ring');
t.ok(S.run.arsenal.sword === 1 && S.run.arsenal.shield === 1 && S.run.arsenal.vial === 1,
     'starter arsenal: sword, shield, venom vial');
t.eq(S.run.potions, C.START_POTIONS, 'one potion in the belt');
t.eq(S.run.pileSave, null, 'no machine racked yet');
// -------- the floor MAP: a real crawl --------
t.ok(S.run.map && S.run.map.rooms, 'a floor map is carved');
t.ok(mapRooms().length >= 9, 'the floor holds ' + mapRooms().length + ' rooms');
t.eq(S.run.map.cur, '0,0', 'you start at the entrance');
t.ok(S.run.room === S.run.map.rooms['0,0'], 'the current room IS the map room');
t.ok(S.run.room.visited, 'the entrance is uncovered');
t.eq(mapRooms().filter(r => r.visited).length, 1, 'the rest of the map is fog');
t.eq(mapRooms().filter(r => r.boss).length, 1, 'exactly one boss lair per floor');
{
  const boss = mapRooms().find(r => r.boss);
  t.ok(mapRooms().every(r => r.dist <= boss.dist), 'the boss lairs in the farthest room');
  t.ok(boss.ents.length === 1 && boss.ents[0].mtype === 'boss', 'the lair holds only the boss');
  t.eq(boss.size, 'b', 'the boss lair is a big chamber');
  t.ok(mapRooms().every(r => ['s', 'w', 't', 'b'].indexOf(r.size) >= 0), 'every room has a blueprint size');
  {
    let variety = new Set(mapRooms().map(r => r.size));
    t.ok(variety.size >= 2, 'rooms come in different sizes (' + [...variety].join(',') + ')');
  }
  // connectivity: BFS along the CORRIDORS reaches every room
  const rooms = S.run.map.rooms;
  const q2 = ['0,0'], seen = { '0,0': true };
  while (q2.length) {
    const r = rooms[q2.shift()];
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
      const k = (r.gx + dx) + ',' + (r.gy + dy);
      if (rooms[k] && !seen[k] && S.run.map.links[lk2(r, rooms[k])]) { seen[k] = true; q2.push(k); }
    }
  }
  t.eq(Object.keys(seen).length, mapRooms().length, 'every room is reachable through dug corridors');
  // corridors are explicit: adjacency alone is not a door
  t.ok(Object.keys(S.run.map.links).length >= mapRooms().length - 1, 'at least a spanning tree of corridors');
}
// dweller generation across many floors is sane
{
  let sawMonster = false, sawService = false, dupService = false, badMonster = false, noPos = false;
  for (let i = 0; i < 8; i++) {
    DP.genFloor();
    for (const r of mapRooms()) {
      const ents = r.ents;
      if (ents.some(e => e.kind === 'monster')) sawMonster = true;
      if (ents.some(e => e.kind !== 'monster')) sawService = true;
      for (const k of ['chest', 'shop', 'smith', 'shrine', 'wheel']) {
        if (ents.filter(e => e.kind === k).length > 1) dupService = true;
      }
      for (const e of ents) {
        if (e.kind === 'monster' && e.mtype !== 'boss' && !ENEMIES.some(en => en.id === e.eid)) badMonster = true;
        if (typeof e.px !== 'number' || typeof e.py !== 'number') noPos = true;
      }
    }
  }
  t.ok(sawMonster, 'monsters roam the rooms');
  t.ok(sawService, 'chests, keepers and shrines appear too');
  t.ok(!dupService, 'never two of the same service in one room');
  t.ok(!badMonster, 'every room monster is pre-rolled from the bestiary');
  t.ok(!noPos, 'every dweller has a floor position to walk to');
}
// the softlock guard: key-broke with nothing left to slay -> a wanderer
S.run.keys = 0;
S.run.room.ents = [];
DP.keyGuard();
t.ok(S.run.room.ents.some(e => e.kind === 'monster'), 'no keys + no monster -> a wanderer finds you');
S.run.keys = C.START_KEYS;

// -------- tapping a monster starts a ROUND-based fight --------
DP.srand(7);
S.run.room.ents = [mkMonster('orc'), { kind: 'chest', done: false }];
t.ok(DP.interact(0), 'tapping the monster starts the fight');
t.eq(S.screen, 'battle', 'the fight is on');
t.ok(S.enemy && S.enemy.hp > 0 && S.enemy.hp === S.enemy.maxHp, 'the foe appears at full health');
t.eq(S.enemy.id, 'orc', 'the room told you exactly who lurks — and it delivered');
t.eq(S.foes.length, 1, 'a lone monster fights alone');
t.ok(S.battle && S.battle.round === 1 && S.battle.phase === 'drop', 'round 1, hand dealt');
t.eq(S.run.wallet, DP.purseTotal(), 'the WHOLE purse is dealt as your hand');
t.eq(S.battle.tilts, C.TILTS, 'three TILT charges ready');
t.eq(S.battle.sel, 'coin', 'gold is queued in the slot by default');
t.ok(S.enemy.intent && ['hit', 'heavy', 'brace', 'curse'].indexOf(S.enemy.intent.t) >= 0,
     'the foe telegraphs its plan (' + S.enemy.intent.t + ')');
t.ok(platCoins().length >= 40, 'battle pile is dense (' + platCoins().length + ' pieces)');
t.ok(S.coins.some(c => c.kind === 'item' && c.iid === 'sword'), 'your sword rides the pile');
t.eq(S.coins.filter(c => c.kind === 'item').length, 3, 'the whole starter arsenal is racked');
t.ok(S.coins.some(c => c.kind === 'silver'), 'silver shield-coins mix through the pile');
t.ok(platCoins().every(c => c.y >= 0 && c.y <= C.PLAT_FRONT + c.r), 'pile sits on the platform');
{
  let sawGreen = false;
  for (let i = 0; i < 6 && !sawGreen; i++) { DP.initPile(); sawGreen = S.coins.some(c => c.kind === 'green'); }
  t.ok(sawGreen, 'green venom-coins mix through the pile');
}

// -------- pusher kinematics --------
let lo = 1e9, hi = -1e9;
for (let i = 0; i < 300; i++) { DP.step(DT, true); const f = DP.pusherFront(0); lo = Math.min(lo, f); hi = Math.max(hi, f); }
t.ok(lo >= C.PUSH_MIN - 0.01 && hi <= C.PUSH_MAX + 0.01, 'pusher stays within its travel');
t.ok(hi - lo > (C.PUSH_MAX - C.PUSH_MIN) * 0.8, 'pusher sweeps most of its travel');

// -------- dropping spends the hand --------
S.cd = 0; S.meter = 0; S.dropped = 0;
S.battle.hand = { coin: 10, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
S.battle.sel = 'coin';
const n0 = S.coins.length;
t.ok(DP.drop(50), 'drop accepted');
t.eq(S.battle.hand.coin, 9, 'drop spends one coin from the hand');
t.eq(S.run.wallet, 9, 'the wallet mirrors the hand');
t.eq(S.coins.length, n0 + 1, 'drop spawns a coin');
t.eq(S.meter, 1, 'drop feeds the frenzy meter');
t.ok(!DP.drop(50), 'cooldown blocks an immediate second drop');
const dropped = S.coins[S.coins.length - 1];
t.eq(dropped.st, 'air', 'spawned coin is falling from the slot');
t.eq(dropped.kind, 'coin', 'the slot takes the SELECTED kind');
let landed = false;
for (let i = 0; i < 60 * 6 && !landed; i++) { DP.tick(DT); if (dropped.st === 'plat') landed = true; }
t.ok(landed, 'dropped coin lands on the platform (or the shelf)');

// -------- TURBO: cycles off / ×2 / ×4, shortening the drop cooldown --------
S.battle.hand = { coin: 20, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
S.battle.sel = 'coin';
S.turbo = 1; S.cd = 0;
DP.drop(50);
t.eq(S.cd, C.DROP_CD, 'off: a normal drop sets the full cooldown');
t.eq(DP.cycleTurbo(), 2, 'tapping TURBO steps to ×2');
S.cd = 0; DP.drop(50);
t.eq(S.cd, C.DROP_CD / 2, '×2 halves the cooldown — coins drop twice as fast');
t.eq(DP.cycleTurbo(), 4, 'again -> ×4');
S.cd = 0; DP.drop(50);
t.eq(S.cd, C.DROP_CD / 4, '×4 quarters it — four times as fast');
t.eq(DP.cycleTurbo(), 1, 'and it wraps back to off');
t.eq(S.turbo, 1, 'the choice is sticky on the state');
// TURBO also quickens the pusher slide (a milder bump than the drop rate)
t.eq(DP.pushRate(), 1, 'off: the pusher runs at base speed');
S.turbo = 2; t.eq(DP.pushRate(), 1.5, '×2 turbo slides the pusher 1.5× faster');
S.turbo = 4; t.eq(DP.pushRate(), 2, '×4 turbo doubles the pusher speed');
{
  // the phase really does advance faster under turbo
  S.turbo = 1; S.phase = 0; DP.step(1, true); const slow = S.phase;
  S.turbo = 4; S.phase = 0; DP.step(1, true); const fast = S.phase;
  t.ok(Math.abs(fast - slow * 2) < 1e-9, 'and the slide phase advances at double rate');
}
S.turbo = 1;

// -------- a PACKED machine holds your coin back instead of eating it --------
// (the bug: holding to drop at the cap silently drained the hand)
{
  while (S.coins.length < DP.MACH.maxCoins) DP.place(10 + Math.random() * 80, Math.random() * 80, 'coin', 0, 'plat');
  S.cd = 0;
  S.battle.hand = { coin: 5, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
  S.battle.sel = 'coin';
  const hand0 = S.battle.hand.coin, coins0 = S.coins.length;
  t.ok(!DP.drop(50), 'a full machine refuses the drop');
  t.eq(S.battle.hand.coin, hand0, 'and the coin stays in your hand — nothing lost');
  t.eq(S.coins.length, coins0, 'no phantom coin spawned over the cap');
  t.eq(S.cd, 0, 'the cooldown is not burned, so the pour resumes the instant the field clears');
  // clear a slot -> the very next drop goes through
  S.coins.pop();
  t.ok(DP.drop(50), 'freeing a slot lets the held coin fall');
  t.eq(S.battle.hand.coin, hand0 - 1, 'now exactly one coin leaves the hand');
}

// -------- items TOPPLE like real objects --------
{
  // some seeded pile items start lying on their side, some stand
  DP.srand(97);
  DP.initPile();
  const its = S.coins.filter(c => c.kind === 'item');
  t.ok(its.length > 0, 'the pile racks items to topple');
  t.ok(its.some(c => Math.abs(c.tip) > 0.8) || its.length < 2,
       'seeded items can start flat on a side');
  // beyond the tipping point an item falls all the way over...
  S.battle.phase = 'drop';
  const it2 = DP.place(50, 40, 'item', 0, 'plat');
  it2.iid = 'sword';
  it2.tip = 0.8; it2.tipV = 0;
  for (let i = 0; i < 180; i++) DP.step(1 / 60, true);
  t.ok(it2.tip > 1.3, 'past the tipping point it falls flat (' + it2.tip.toFixed(2) + ')');
  // ...while a small lean rights itself
  it2.tip = 0.2; it2.tipV = 0;
  for (let i = 0; i < 180; i++) DP.step(1 / 60, true);
  t.ok(Math.abs(it2.tip) < 0.15, 'a slight lean settles back upright (' + it2.tip.toFixed(2) + ')');
  // coins never tip
  const cc = DP.place(60, 40, 'coin', 0, 'plat');
  cc.pvx = 99;
  DP.step(1 / 60, true);
  t.eq(cc.tip, 0, 'coins are flat discs — no topple state');
}

// -------- the tray COLLECTS: nothing fires during the drop phase --------
DP.srand(9);
S.coins.length = 0; S.battle.loot.length = 0; S.battle.phase = 'drop';
S.enemy.hp = S.enemy.maxHp = 500;
const hp0 = S.enemy.hp, hpMe0 = S.run.hp;
const pieces = [
  ['coin', 20], ['coin', 32], ['silver', 44], ['green', 56], ['gem', 68], ['skull', 80],
];
for (const [kind, x] of pieces) {
  const c = DP.place(x, C.PLAT_FRONT - 0.5, kind, 0, 'plat');
  c.vy = 70;
}
step(1.5);
t.eq(S.enemy.hp, hp0, 'no damage during the drop phase — the tray only collects');
t.eq(S.run.hp, hpMe0, 'even skulls wait for the resolve');
t.eq(S.battle.loot.length, 6, 'all six pieces joined the round loot');
t.ok(S.battle.loot.some(l => l.k === 'silver') && S.battle.loot.some(l => l.k === 'green'),
     'silver and green coins are tracked as loot');

// -------- the resolve RAMPS UP (per same-type run, then resets) --------
t.ok(DP.resolveSpeed(0) > DP.resolveSpeed(1) && DP.resolveSpeed(1) > DP.resolveSpeed(4),
     'each next same-type piece flies a little faster');
t.eq(DP.resolveSpeed(0), 1, 'a fresh run starts at full delay (no speed-up on the first piece)');
t.ok(DP.resolveSpeed(200) >= 0.4, 'floored at 0.4 so a long run never machine-guns');
// the sticky ×1/×2/×3 fast-forward divides every resolve delay
S.resolveMul = 1;
const d1 = DP.resolveDelay(0.6, 0);
t.eq(DP.cycleSpeed(), 2, 'tapping the speed button steps to ×2');
t.eq(DP.resolveDelay(0.6, 0), d1 / 2, '×2 halves the delay between pieces');
t.eq(DP.cycleSpeed(), 3, 'again -> ×3');
t.eq(DP.resolveDelay(0.6, 0), d1 / 3, '×3 thirds it');
t.eq(DP.cycleSpeed(), 1, 'and it wraps back to ×1');
t.eq(S.resolveMul, 1, 'the choice is sticky on the state');

// -------- the resolve queue: ordered, one piece at a time --------
{
  const q = DP.buildQueue([
    { k: 'skull' }, { k: 'coin' }, { k: 'item', iid: 'shield' }, { k: 'silver' }, { k: 'red' },
    { k: 'gem' }, { k: 'item', iid: 'sword' }, { k: 'green' }, { k: 'lucky' }, { k: 'blue' },
  ]);
  const order = q.map(x => x.t);
  t.eq(order.join(','), 'gem,silver,shielditem,red,gold,lucky,blue,weapon,green,skull',
       'the queue banks gold, shields, mends, then strikes — curses last');
}
// the acceleration counter RESETS every time the resolved type changes.
// Fully isolated in its own throwaway battle so it disturbs nothing.
{
  DP.srand(555);
  DP.newRun('knight');
  DP.startBattle('battle');
  const B = S.battle;
  S.foes.forEach(f => { f.hp = f.maxHp = 9999; });
  B.phase = 'drop';
  // gold sorts before green in the resolve order -> gold run, then green run
  B.loot = [{ k: 'coin' }, { k: 'coin' }, { k: 'coin' }, { k: 'green' }, { k: 'green' }];
  DP.endRoundNow();
  DP.battleTick(1);
  t.eq(B.rampType, 'gold', 'ramp locks onto the gold run');
  t.eq(B.rampN, 0, 'and the first piece is unaccelerated');
  DP.battleTick(1);
  t.eq(B.rampN, 1, 'the second gold fires quicker');
  DP.battleTick(1);
  t.eq(B.rampN, 2, 'the third quicker still');
  DP.battleTick(1);
  t.eq(B.rampType, 'green', 'then the run switches to venom');
  t.eq(B.rampN, 0, 'and the acceleration RESTARTS from slow');
}
// restore the suite's working battle
DP.srand(42);
DP.newRun('rogue');
S.run.room.ents = [mkMonster('orc')];
DP.interact(0);
S.enemy.hp = S.enemy.maxHp = 500;
S.battle.phase = 'drop';
S.battle.loot.length = 0;
for (const [kind, x] of pieces) { const c = DP.place(x, C.PLAT_FRONT - 0.5, kind, 0, 'plat'); c.vy = 70; }
step(1.5);

// full pipeline: the tray NEVER resolves itself — END TURN is yours to press
drainHand();
S.run.block = 0;
const g0 = S.run.gold;
step(3);
t.eq(S.battle.phase, 'drop', 'hand spent + field settled — still waiting for YOU');
t.ok(DP.endRoundNow(), 'pressing END TURN starts the show');
t.eq(S.battle.phase, 'resolve', 'and only then does the tray fire');
t.ok(untilPhase('enemy', 8), 'the whole queue plays out');
t.eq(S.enemy.hp, hp0 - 2 * C.DMG.gold, 'two gold coins each smacked for ' + C.DMG.gold);
t.eq(S.run.gold, g0 + 15, 'the gem banked 15 gold');
t.eq(S.enemy.pois, 1, 'the green coin left a poison stack');
// silver gave 1 block, the skull then bit for 4 (bypassing block)
t.eq(S.run.block, 1, 'the silver coin raised 1 block — and curses ignored it');
t.eq(S.run.hp, hpMe0 - (C.SKULL_DMG + S.run.floor - 1), 'the skull cursed straight through');

// -------- the enemy takes its turn, block soaks it --------
S.run.hp = 200; S.run.maxHp = 200;
S.run.block = 3;
S.enemy.trait = null; S.enemy.pois = 0;
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };   // pin the telegraph for the math below
const hpBefore = S.run.hp, atk = S.enemy.atk;
t.ok(untilPhase('drop', 5), 'the enemy strikes and a new round begins');
t.eq(S.battle.round, 2, 'round 2');
t.eq(S.run.hp, hpBefore - Math.max(0, atk - 3), 'block soaked 3 of the blow');
t.eq(S.run.wallet, DP.purseTotal(), 'a fresh hand is dealt from the purse');
t.eq(S.battle.tilts, C.TILTS, 'the TILT charges refresh');
t.eq(S.run.block, 0, 'leftover block melts between rounds');
step(1.5);                            // let the round-start rain land
t.ok(S.coins.length > 0, 'the dungeon re-salts the pile each round');

// -------- END TURN is always available — even with coins left to spend --------
t.ok(S.run.wallet > 0, 'coins still in hand');
t.ok(DP.endRoundNow(), 'END TURN fires even with coins still in the hand');
t.eq(S.battle.phase, 'resolve', 'straight to the resolve, hand be damned');
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };
t.ok(untilPhase('drop', 8), 'and on into round 3');
t.eq(S.battle.round, 3, 'round 3');
// a fresh hand arrives regardless of what you left unspent
t.eq(S.run.wallet, DP.purseTotal(), 'the new turn re-deals the whole purse');
// but it does nothing outside the drop phase
S.battle.phase = 'resolve';
t.ok(!DP.endRoundNow(), 'END TURN is inert mid-resolve');
S.battle.phase = 'drop';

// -------- applyLoot effects (unit level) --------
S.enemy.hp = S.enemy.maxHp = 500; S.enemy.pois = 0; S.enemy.stunned = 0; S.enemy.braced = false;
S.run.block = 0; S.run.hp = 100; S.run.maxHp = 200;
const eh = S.enemy.hp;
DP.applyLoot({ t: 'weapon', iid: 'sword' });
t.eq(S.enemy.hp, eh - DP.itemById('sword').dmg, 'sword deals its listed damage');
DP.applyLoot({ t: 'lucky' });
t.eq(S.enemy.hp, eh - DP.itemById('sword').dmg - C.DMG.lucky, 'lucky star hits for ' + C.DMG.lucky);
DP.applyLoot({ t: 'shielditem' , iid: 'shield' });
t.eq(S.run.block, DP.itemById('shield').block, 'shield item raises its listed block');
DP.applyLoot({ t: 'heartitem', iid: 'heart' });
t.eq(S.run.hp, 100 + DP.itemById('heart').heal, 'heart heals its listed HP');
const hpR = S.run.hp;
DP.applyLoot({ t: 'red' });
t.eq(S.run.hp, hpR + C.RED_HEAL, 'a HEART COIN mends ' + C.RED_HEAL + ' HP');
DP.applyLoot({ t: 'vial', iid: 'vial' });
t.eq(S.enemy.pois, DP.itemById('vial').pois, 'venom vial applies its stacks');
DP.applyLoot({ t: 'frost', iid: 'frost' });
t.eq(S.enemy.stunned, 1, 'frost rune freezes the next enemy turn');
DP.applyLoot({ t: 'bag' });
t.ok(S.run.gold >= 8, 'gold bag banks gold');

// -------- the frozen foe skips its turn --------
S.enemy.stunned = 1;
S.run.block = 0;
const hpF = S.run.hp;
DP.enemyActFoe(S.enemy);
t.eq(S.run.hp, hpF, 'a frozen foe cannot strike');
t.eq(S.enemy.stunned, 0, 'the freeze thaws after the skipped turn');
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };
DP.enemyActFoe(S.enemy);
t.ok(S.run.hp < hpF, 'thawed, it strikes again');

// -------- poison ticks at round end and decays --------
S.enemy.hp = S.enemy.maxHp = 500;
S.enemy.pois = 3; S.enemy.trait = null; S.enemy.braced = false;
S.pPois = 2;
S.run.hp = 100; S.run.block = 5;
const ehP = S.enemy.hp, phP = S.run.hp;
DP.endRoundTicks();
t.eq(S.enemy.hp, ehP - 3, 'enemy poison ticks for the stack count');
t.eq(S.enemy.pois, 2, 'enemy poison decays');
t.eq(S.run.hp, phP - 2, 'your poison ticks too');
t.eq(S.pPois, 1, 'and decays');
t.eq(S.run.block, 5, 'poison seeps straight through block');
// regen knits at round end (now a DEFENSIVE mechanic)
S.enemy.def = 'regen'; S.enemy.hp = 100; S.enemy.pois = 0;
DP.endRoundTicks();
t.eq(S.enemy.hp, 100 + C.REGEN_HP, 'a regenerating foe knits back at round end');
S.enemy.def = null;

// -------- the defensive mechanics: each wants a different tactic --------
const savedFoes0 = S.foes, savedEnemy0 = S.enemy;
{
  const mk = (def) => { const e = { hp: 100, maxHp: 100, def, pois: 0, braced: false, hitT: 0 }; return e; };
  S.foes = [];  // no pack ward bleeding in
  // GEL: every hit capped, but poison bypasses
  let g = mk('gel'); S.foes = [g]; S.enemy = g;
  t.eq(DP.dmgFoe(g, 9), C.GEL_CAP, 'gel caps a big hit at ' + C.GEL_CAP);
  t.eq(DP.dmgFoe(g, 1), 1, 'a 1-damage coin still lands its 1');
  const gp = g.hp; DP.dmgFoe(g, 6, 'pois');
  t.eq(g.hp, gp - 6, 'but POISON pours straight through the gel');
  // ARMOR: flat absorb, chip coins bounce off
  let a = mk('armor'); S.foes = [a]; S.enemy = a;
  t.eq(DP.dmgFoe(a, 1), 0, 'armour swallows a lone gold coin whole');
  t.eq(DP.dmgFoe(a, 5), 5 - C.ARMOR, 'a big hit gets through minus the armour');
  const ap = a.hp; DP.dmgFoe(a, 4, 'pois');
  t.eq(a.hp, ap - 4, 'poison ignores armour too');
  // THICK: immune to poison, full physical
  let k = mk('thick'); S.foes = [k]; S.enemy = k;
  const kp = k.hp;
  t.eq(DP.dmgFoe(k, 8, 'pois'), 0, 'a thick hide shrugs off poison entirely');
  t.eq(k.hp, kp, 'no HP lost to venom');
  t.eq(DP.dmgFoe(k, 8), 8, 'but raw physical lands in full');
  // WARD: protects the WHOLE pack; killing the warder drops the guard
  let totem = mk('ward'), grunt = mk(null);
  S.foes = [totem, grunt]; S.enemy = grunt;
  t.eq(DP.dmgFoe(grunt, 5), 5 - C.WARD, 'the ward shields even the grunt beside the totem');
  totem.hp = 0;   // totem falls
  t.eq(DP.dmgFoe(grunt, 5), 5, 'with the totem down, the ward is gone');
}
// restore the suite's original battle foe (keeps its room entIdx linkage)
S.foes = savedFoes0; S.enemy = savedEnemy0;
S.enemy.hp = S.enemy.maxHp = 500;
S.enemy.def = null; S.enemy.trait = null; S.enemy.braced = false;
S.battle.target = 0;

// -------- enemy INTENTS: the telegraphed moves play out --------
S.run.hp = 200; S.run.maxHp = 200; S.run.block = 0;
S.enemy.trait = null;
S.enemy.intent = { t: 'heavy', dmg: S.enemy.atk * 2 };
{
  const hh = S.run.hp;
  DP.enemyActFoe(S.enemy);
  t.eq(S.run.hp, hh - S.enemy.atk * 2, 'a HEAVY blow lands double');
}
S.enemy.intent = { t: 'brace' };
DP.enemyActFoe(S.enemy);
t.ok(S.enemy.braced, 'a bracing foe raises its guard');
{
  const bh = S.enemy.hp;
  DP.dmgFoe(S.enemy, 8);
  t.eq(S.enemy.hp, bh - 4, 'and shrugs off HALF of what you throw');
}
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };
DP.enemyActFoe(S.enemy);
t.ok(!S.enemy.braced, 'the guard drops the moment it moves again');
S.rain.length = 0;
S.enemy.intent = { t: 'curse' };
DP.enemyActFoe(S.enemy);
t.eq(S.rain.filter(r => r.kind === 'skull').length, 2, 'a CURSE hurls two skulls onto the field');
S.rain.length = 0;
// the intent roller: varied, legal, never two heavies in a row
{
  const e = { trait: null, atk: 3, intent: null };
  const seen = new Set();
  let doubleHeavy = false;
  for (let i = 0; i < 300; i++) {
    const prev = e.intent && e.intent.t;
    DP.rollIntent(e);
    if (prev === 'heavy' && e.intent.t === 'heavy') doubleHeavy = true;
    seen.add(e.intent.t);
  }
  t.ok(seen.has('hit') && seen.has('heavy') && seen.has('brace'), 'intents vary (' + [...seen].join(',') + ')');
  t.ok(!seen.has('curse'), 'plain foes never roll curses');
  t.ok(!doubleHeavy, 'never two HEAVY wind-ups in a row');
  const c = { trait: 'curse', atk: 3, intent: null };
  let sawCurse = false;
  for (let i = 0; i < 100; i++) { DP.rollIntent(c); if (c.intent.t === 'curse') sawCurse = true; }
  t.ok(sawCurse, 'curse-trait foes roll curse intents');
}

// -------- enemy traits on its turn --------
// fast: two strikes
S.enemy.trait = 'fast'; S.run.block = 0; S.run.hp = 150;
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };
const hpFast = S.run.hp;
DP.enemyActFoe(S.enemy);
t.eq(S.run.hp, hpFast - S.enemy.atk * 2, 'a fast foe strikes twice in its turn');
// thief: cuts the NEXT round's hand
S.enemy.trait = 'thief'; S.battle.stolen = 0; S.run.hp = 150;
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };
DP.enemyActFoe(S.enemy);
t.eq(S.battle.stolen, 2, 'a thief cuts your purse');
DP.newRound();
t.eq(S.run.wallet, DP.purseTotal() - 2, 'the stolen coins are missing from the new hand');
// venom: poisons you
S.enemy.trait = 'venom'; S.pPois = 0; S.run.hp = 150;
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };
DP.enemyActFoe(S.enemy);
t.eq(S.pPois, 2, 'a venomous bite poisons you');
S.enemy.trait = null; S.rain.length = 0; S.pPois = 0;

// -------- TILT: three shoves a round --------
S.battle.phase = 'drop';
S.coins.length = 0;
S.battle.tilts = C.TILTS;
{
  const tc = DP.place(50, 40, 'coin', 0, 'plat');
  t.ok(DP.tilt('l'), 'tilt accepted');
  t.ok(tc.vx < 0, 'a left tilt shoves the pile left');
  t.eq(S.battle.tilts, C.TILTS - 1, 'a charge is spent');
  const vy0 = tc.vy;
  t.ok(DP.tilt('f'), 'the forward bump');
  t.ok(tc.vy > vy0, 'shoves the pile toward the tray');
  DP.tilt('r');
  t.eq(S.battle.tilts, 0, 'three charges a round');
  t.ok(!DP.tilt('l'), 'no charges, no tilt');
  S.battle.phase = 'resolve';
  S.battle.tilts = 1;
  t.ok(!DP.tilt('l'), 'no tilting outside the drop phase');
  S.battle.phase = 'drop';
  DP.newRound();
  t.eq(S.battle.tilts, C.TILTS, 'a new round restores the charges');
}

// -------- BANKING: stash tray pieces for next round --------
S.battle.phase = 'drop';
S.battle.loot = [{ k: 'coin' }, { k: 'coin' }, { k: 'silver' }, { k: 'item', iid: 'sword' }, { k: 'gem' }];
S.battle.banked = [];
t.ok(DP.bankLoot('coin'), 'a tray coin goes into the bank');
t.eq(S.battle.loot.length, 4, 'off the tray');
t.eq(S.battle.banked.length, 1, 'into the stash');
DP.bankLoot('sword');
DP.bankLoot('gem');
t.eq(S.battle.banked.length, C.BANK_MAX, 'the bank holds ' + C.BANK_MAX);
t.ok(!DP.bankLoot('silver'), 'and not one more');
t.ok(DP.unbankLoot('gem'), 'tap the bank to put one back');
t.ok(DP.bankLoot('silver'), 'freeing a slot lets you stash again');
t.ok(!DP.bankLoot('nonsense'), 'cannot bank what the tray does not hold');
// banked pieces skip the resolve and seed the NEXT round's loot
{
  const stash = S.battle.banked.length;
  DP.newRound();
  t.eq(S.battle.loot.length, stash, 'the stash carries into the new round');
  t.ok(S.battle.loot.some(l => l.iid === 'sword'), 'stashed gear included');
  t.eq(S.battle.banked.length, 0, 'the bank empties back onto the tray');
}

// -------- the walls are SOLID: nothing is ever lost off the sides --------
DP.srand(13);
S.battle.phase = 'drop';
S.coins.length = 0;
S.run.arsenal.axe = 1;
const shoved = DP.place(6, 46, 'item', 0, 'plat');
shoved.iid = 'axe'; shoved.vx = -60;
const scoin = DP.place(6, 60, 'coin', 0, 'plat');
scoin.vx = -60;
step(3);
t.ok(S.coins.includes(shoved), 'an item shoved hard into the wall stays on the field');
t.eq(shoved.st, 'plat', 'still sitting on the platform');
t.ok(shoved.x >= shoved.r - 0.01, 'the side wall held it');
t.ok(S.coins.includes(scoin) && scoin.x >= scoin.r - 0.01, 'coins bounce off the walls too');
t.eq(S.run.arsenal.axe, 1, 'the arsenal never loses a piece to the sides');
// the only exit is the FRONT: over the lip and into the tray
S.coins.length = 0; S.battle.loot.length = 0;
const fronted = DP.place(50, C.PLAT_FRONT - 0.5, 'coin', 0, 'plat');
fronted.vy = 70;
step(1.5);
t.ok(fronted.scored, 'over the front edge -> collected');
t.eq(S.battle.loot.length, 1, 'and it joined the round loot');

// -------- the JACKPOT meter: your own arsenal echoes onto the field --------
S.battle.phase = 'drop';
S.meter = C.METER_MAX - 1; S.cd = 0; S.rain.length = 0;
S.battle.hand.coin = 30; S.battle.sel = 'coin';
DP.drop(50);
t.eq(S.meter, 0, 'meter resets on jackpot');
{
  const items = S.rain.filter(r => r.kind === 'item');
  t.eq(items.length, 3, 'the jackpot sprouts THREE of your own items — not a coin firehose');
  t.ok(items.every(r => r.temp), 'they are free temporary copies');
  t.ok(items.every(r => (S.run.arsenal[r.iid] || 0) > 0), 'each one is gear you actually own');
  t.eq(S.rain.filter(r => r.kind !== 'item').length, 0, 'no coin spray riding along');
}
step(2);
t.ok(S.coins.some(c => c.kind === 'item' && c.temp), 'the free gear landed on the field');
S.rain.length = 0;
// an empty arsenal falls back to a modest coin consolation
{
  const saveArs = S.run.arsenal;
  S.run.arsenal = {};
  DP.frenzy();
  t.ok(S.rain.filter(r => r.kind === 'coin').length >= 3 && !S.rain.some(r => r.kind === 'item'),
       'no gear to echo -> a few coins instead');
  S.run.arsenal = saveArs;
  S.rain.length = 0;
}

// -------- winning pays gold AND keys, and offers a coin --------
S.enemy.hp = 3; S.enemy.trait = null; S.enemy.pois = 0;
const kills0 = S.run.kills, gold1 = S.run.gold, keys0 = S.run.keys, depth0 = S.run.depth;
DP.applyLoot({ t: 'weapon', iid: 'sword' });
t.ok(S.victory, 'the foe falls — victory overlay armed');
t.eq(S.run.kills, kills0 + 1, 'kill counted');
t.ok(S.run.gold > gold1, 'victory pays the bounty');
t.eq(S.run.keys, keys0 + C.KEY_KILL, 'every monster killed gives a key');
t.eq(S.victory.keys, C.KEY_KILL, 'the overlay brags about it');
t.ok(Array.isArray(S.victory.offer) && S.victory.offer.length === 3, 'three spoil coins glint in the rubble');
t.ok(!S.victory.relic, 'common monsters guard no relics');
t.ok(DP.leaveBattle(), 'CONTINUE returns to the room');
t.eq(S.screen, 'dungeon', 'back in the top-down room');
t.eq(S.battle, null, 'the round machine rests');
t.eq(S.run.depth, depth0, 'winning a fight does NOT change rooms');
t.ok(S.run.room.ents[0].done, 'the slain monster is gone from the room');
t.ok(Array.isArray(S.run.pileSave), 'and the machine remembers its pile');

// -------- keys unlock doors; unlocked doors allow BACKTRACKING --------
{
  const dir = openDir();
  const from = S.run.map.cur;
  const kD = S.run.keys;
  t.eq(DP.tryDoor(dir), 'unlocked', 'the first bump spends a key to unlock');
  t.eq(S.run.keys, kD - 1, 'the key is spent');
  t.eq(S.run.map.cur, from, 'unlocking does not move you yet');
  t.eq(DP.tryDoor(dir), true, 'the open door lets you through');
  t.ok(S.run.map.cur !== from, 'you stand in the next room');
  t.ok(DP.curRoom().visited, 'the new room is uncovered on the map');
  t.eq(S.run.depth, DP.curRoom().dist + 1, 'depth tracks the room distance');
  const kBack = S.run.keys;
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[dir];
  t.eq(DP.tryDoor(back), true, 'walking BACK through the same door is free');
  t.eq(S.run.keys, kBack, 'no key spent on the return trip');
  t.eq(S.run.map.cur, from, 'back in the previous room — rooms persist');
  t.eq(DP.tryDoor(dir), true, 'and forth again, still free');
  DP.tryDoor(back);          // return to the entrance for the tests below
  // a still-locked corridor refuses the key-broke
  S.run.keys = 0;
  const lockedDir = openDir(false);
  if (lockedDir) {
    t.ok(!DP.tryDoor(lockedDir), 'no key, no passage');
    t.ok(S.uiFlash && S.uiFlash.msg.indexOf('KEY') >= 0, 'the lock demands a key');
  }
  // adjacency without a corridor is a solid wall, key or not
  S.run.keys = 3;
  {
    const r = DP.curRoom();
    for (const d of ['n', 's', 'e', 'w']) {
      const nb = S.run.map.rooms[(r.gx + DX[d]) + ',' + (r.gy + DY[d])];
      if (nb && !S.run.map.links[lk2(r, nb)]) {
        t.ok(!DP.tryDoor(d), 'no corridor dug -> no door, even with keys');
        break;
      }
    }
  }
}

// -------- room inhabitants --------
{
  DP.srand(19);
  let keyDrops = 0, coinDrops = 0;
  const prizeKinds = {};
  for (let i = 0; i < 30; i++) {
    S.run.room.ents = [{ kind: 'chest', done: false }];
    const snap = {
      gold: S.run.gold, keys: S.run.keys, purse: DP.purseTotal(),
      arsenal: Object.values(S.run.arsenal).reduce((a, b) => a + b, 0),
    };
    // opening a chest offers ONE prize behind an accept/deny gamble
    t.ok(DP.interact(0), 'chest ' + i + ' opens a gamble');
    t.ok(S.room && S.room.type === 'chest' && S.room.prize, 'chest ' + i + ' shows a prize to weigh');
    const prize = S.room.prize;
    prizeKinds[prize.kind] = (prizeKinds[prize.kind] || 0) + 1;
    t.ok(['gold', 'item', 'coin', 'key'].indexOf(prize.kind) >= 0, 'chest ' + i + ' prize is gold/item/coin/key');
    if (i % 5 === 0) {
      // every so often, LEAVE IT — nothing gained, but the chest still retires
      t.ok(DP.denyPrize(), 'chest ' + i + ' declined');
      const same = S.run.gold === snap.gold && S.run.keys === snap.keys
        && DP.purseTotal() === snap.purse
        && Object.values(S.run.arsenal).reduce((a, b) => a + b, 0) === snap.arsenal;
      t.ok(same, 'declining chest ' + i + ' grants nothing');
    } else {
      t.ok(DP.acceptPrize(), 'chest ' + i + ' accepted');
      if (S.run.keys > snap.keys) keyDrops++;
      if (DP.purseTotal() > snap.purse) coinDrops++;
      const gained = S.run.gold > snap.gold || S.run.keys > snap.keys
        || DP.purseTotal() > snap.purse
        || Object.values(S.run.arsenal).reduce((a, b) => a + b, 0) > snap.arsenal;
      if (!gained) t.ok(false, 'accepted chest ' + i + ' paid nothing!');
    }
    t.ok(!S.room, 'chest ' + i + ' modal closes after the choice');
    t.ok(S.run.room.ents[0].done, 'chest ' + i + ' is spent');
    t.ok(!DP.interact(0), 'chest ' + i + ' cannot be opened twice');
  }
  t.ok(keyDrops >= 1, 'some chests hold keys (' + keyDrops + '/30)');
  t.ok(coinDrops >= 1, 'some chests hold purse coins (' + coinDrops + '/30)');
  t.ok(Object.keys(prizeKinds).length >= 3, 'chests roll a spread of prize kinds (' + Object.keys(prizeKinds).join('/') + ')');
  t.ok(S.toast, 'chests tell you what you got');
}
// shrine heals and cleanses
S.run.hp = 10; S.run.maxHp = 60; S.pPois = 5;
S.run.room.ents = [{ kind: 'shrine', done: false }];
DP.interact(0);
t.eq(S.run.hp, 10 + Math.round(60 * 0.25), 'shrine heals 25% of max HP');
t.eq(S.pPois, 0, 'shrine cleanses poison');
// wheel ghost charges 5 coins of any kind for a spin
S.wheelAnim = null;
for (const k of COIN_KINDS) S.run.purse[k] = 0;
S.run.purse.coin = 4;                                  // one short of the fee
S.run.room.ents = [{ kind: 'wheel', done: false }];
t.ok(!DP.interact(0), 'the ghost refuses a purse short of the fee');
t.ok(S.wheelAnim === null, 'no spin without paying');
t.ok(!S.run.room.ents[0].done, 'the ghost lingers until paid');
S.run.purse.coin = 8;
const wheelPurse = DP.purseTotal();
t.ok(DP.interact(0), 'paying the fee spins the wheel');
t.ok(S.wheelAnim !== null, 'the wheel of fortune turns');
t.ok(DP.purseTotal() <= wheelPurse - C.WHEEL_COST, 'the ghost pockets ' + C.WHEEL_COST + ' coins');
t.ok(S.run.room.ents[0].done, 'the ghost vanishes after the spin');

// -------- the shopkeeper (pouches and single coins for the purse) --------
DP.srand(23);
S.run.room.ents = [{ kind: 'shop', done: false }];
t.ok(DP.interact(0), 'talking to the shopkeeper opens the shop');
t.ok(S.room && S.room.type === 'shop', 'shop is open');
t.ok(S.room.stock.length >= 6, 'shop stocks a full shelf (' + S.room.stock.length + ')');
t.ok(S.room.stock.filter(x => x.kind === 'item').length === 3, 'three arsenal items on sale');
t.eq(S.room.stock.filter(x => x.kind === 'relic').length, 1, 'ONE relic sits in the case');
{
  const rslot = S.room.stock.find(x => x.kind === 'relic');
  t.ok(['c', 'r', 'e'].includes(RELICS.find(r => r.id === rslot.rid).rar), 'the cased relic carries a real rarity');
  t.ok(rslot.sub && rslot.sub.length > 0, 'its effect text hangs under the label');
}
t.ok(S.room.stock.some(x => x.kind === 'pouch'), 'a coin pouch hangs on the shelf');
t.ok(S.room.stock.some(x => x.kind === 'coin' && COIN_KINDS.includes(x.cid)),
     'and a single typed coin for the purse');
t.eq(S.room.stock.find(x => x.kind === 'potion').price, 90, 'potion gold price is DOUBLED');
t.eq(S.room.stock.find(x => x.kind === 'pouch').price, 120, 'pouch too');
t.eq(S.room.stock.find(x => x.kind === 'potion').coinPrice, 2, 'the COIN price stays honest (from the true worth)');
S.run.gold = 0;
t.ok(!DP.buyShop(0), 'cannot buy broke');
S.run.gold = 10000;
const itemSlot = S.room.stock.findIndex(x => x.kind === 'item');
const iid = S.room.stock[itemSlot].iid;
const had = S.run.arsenal[iid] || 0;
t.ok(DP.buyShop(itemSlot), 'gold buys the item');
t.eq(S.run.arsenal[iid], had + 1, 'bought item joins the arsenal');
t.ok(!DP.buyShop(itemSlot), 'cannot buy the same slot twice');
{
  const pouchSlot = S.room.stock.findIndex(x => x.kind === 'pouch');
  const pc0 = S.run.purse.coin;
  DP.buyShop(pouchSlot);
  t.eq(S.run.purse.coin, pc0 + C.POUCH_COINS, 'a pouch drops ' + C.POUCH_COINS + ' gold coins into the purse');
  const coinSlot = S.room.stock.findIndex(x => x.kind === 'coin');
  const cid = S.room.stock[coinSlot].cid;
  const cc0 = S.run.purse[cid] || 0;
  DP.buyShop(coinSlot);
  t.eq(S.run.purse[cid], cc0 + 1, 'the bought ' + cid.toUpperCase() + ' coin joins the purse for good');
}
const hpSlot = S.room.stock.findIndex(x => x.kind === 'maxhp');
const mhp0 = S.run.maxHp;
DP.buyShop(hpSlot);
t.eq(S.run.maxHp, mhp0 + 10, 'max HP upgrade sticks');
// -------- paying with COINS + removing a ware for 10 coins --------
{
  // every ware carries a coin price of 1, 2, or 5 of a single kind
  t.ok(S.room.stock.every(x => [1, 2, 5].indexOf(x.coinPrice) >= 0), 'every ware has a 1/2/5 coin price');
  t.eq(DP.coinPriceFor(30), 1, 'cheap wares cost 1 coin');
  t.eq(DP.coinPriceFor(60), 2, 'mid wares cost 2 coins');
  t.eq(DP.coinPriceFor(200), 5, 'dear wares cost 5 coins');
  // buy an unsold item with coins of a single kind
  const cSlot = S.room.stock.findIndex(x => !x.sold && x.kind === 'item');
  const ware = S.room.stock[cSlot];
  for (const k of COIN_KINDS) S.run.purse[k] = 0;
  S.run.purse.silver = ware.coinPrice;                     // exactly enough of ONE kind
  const goldBefore = S.run.gold;
  const armBefore = S.run.arsenal[ware.iid] || 0;
  t.ok(DP.buyShop(cSlot, 'coins'), 'coins buy the ware');
  t.eq(S.run.purse.silver, 0, 'the coin price is drawn from a single kind');
  t.eq(S.run.gold, goldBefore, 'and no gold is spent when paying with coins');
  t.eq(S.run.arsenal[ware.iid], armBefore + 1, 'the coin-bought ware is delivered');
  t.ok(S.room.stock[cSlot].sold, 'a coin-bought slot is marked sold');
  // too few coins in any single kind → refused
  const cSlot2 = S.room.stock.findIndex(x => !x.sold && x.kind === 'item');
  if (cSlot2 >= 0) {
    for (const k of COIN_KINDS) S.run.purse[k] = 0;
    S.run.purse.coin = S.room.stock[cSlot2].coinPrice - 1;
    t.ok(!DP.buyShop(cSlot2, 'coins'), 'a purse short of the coin price is refused');
    t.ok(!S.room.stock[cSlot2].sold, 'and the ware stays on the shelf');
  }
  // REMOVE an item from YOUR PACK for 10 coins — the shelf is untouched
  const shelfBefore = S.room.stock.map(x => x.label).join('|');
  S.run.arsenal.sword = (S.run.arsenal.sword || 0) + 1;
  const swords = S.run.arsenal.sword;
  for (const k of COIN_KINDS) S.run.purse[k] = 0;
  S.run.purse.coin = 4;                                     // short of the removal fee
  t.ok(!DP.removeArsenal('sword'), 'removing costs coins the purse cannot cover');
  t.eq(S.run.arsenal.sword, swords, 'the refused sword stays in the pack');
  S.run.purse.coin = 12;
  t.ok(DP.removeArsenal('sword'), 'ten coins and the keeper takes the sword');
  t.eq(DP.purseTotal(), 2, 'the removal skims exactly ' + C.SHOP_REMOVE + ' coins');
  t.eq(S.run.arsenal.sword || 0, swords - 1, 'one copy left the pack');
  t.eq(S.room.stock.map(x => x.label).join('|'), shelfBefore, 'the SHELF is untouched — removal thins YOUR pack');
  t.ok(!DP.removeArsenal('hammer'), 'the keeper cannot take what you do not own');
  // the racked pile forgets the removed copy too
  S.run.purse.coin = 12;
  S.run.arsenal.vial = 1;
  S.run.pileSave = [{ k: 'item', x: 50, y: 40, lay: 0, iid: 'vial' }];
  S.run.pileFloor = S.run.floor;
  t.ok(DP.removeArsenal('vial'), 'the keeper takes the vial');
  t.ok(!S.run.pileSave.some(p => p.iid === 'vial'), 'and scrubs it off this floor\'s racked pile');
}
t.ok(DP.closeModal(), 'LEAVE closes the shop');
t.ok(S.run.room.ents[0].done, 'the merchant serves one visit, then leaves the room');
t.ok(!DP.interact(0), 'the departed keeper cannot be hailed again');
t.ok(!DP.interact(0), 'the shop cannot be reopened once the merchant has gone');

// -------- the blacksmith --------
DP.srand(29);
S.run.room.ents = [{ kind: 'smith', done: false }];
t.ok(DP.interact(0), 'the blacksmith offers his boons');
t.ok(S.room && S.room.type === 'forge' && !S.room.done, 'forge menu is open');
t.eq(S.room.opts.length, 3, 'three boons to choose from');
t.ok(DP.pickBoon(0), 'boon accepted');
t.ok(S.room.done, 'forge is spent after one boon');
t.ok(!DP.pickBoon(1), 'no double-dipping at the forge');
t.ok(S.run.room.ents[0].done, 'the blacksmith packs up after one boon');
DP.closeModal();

// -------- potions --------
S.run.hp = 10; S.run.maxHp = 60; S.run.potions = 1;
t.ok(DP.usePotion(), 'potion glugged');
t.eq(S.run.hp, 10 + C.POTION_HEAL, 'potion heals its dose');
t.eq(S.run.potions, 0, 'potion is spent');
t.ok(!DP.usePotion(), 'no potions left to drink');
S.run.hp = S.run.maxHp; S.run.potions = 5;
t.ok(!DP.usePotion(), 'cannot drink at full health');

// -------- elites pay double keys and grant a FREE wheel spin --------
DP.srand(31);
S.wheelAnim = null;
S.run.relics = [];
S.run.room.ents = [{ kind: 'monster', mtype: 'elite', eid: 'ogre', done: false }];
DP.interact(0);
t.ok(S.enemy.elite && S.enemy.name.indexOf('ELITE') === 0, 'elites are branded');
const keysE = S.run.keys;
S.enemy.hp = 1;
DP.dmgEnemy(5);
t.eq(S.run.keys, keysE + C.KEY_ELITE, 'an elite kill pays ' + C.KEY_ELITE + ' keys');
// a free wheel of fortune spins on the spot
t.ok(S.victory && S.victory.freeSpin, 'the elite grants a free spin');
t.ok(S.wheelAnim !== null, 'and the wheel of fortune turns for free');
t.ok(!S.victory.relicOffer, 'an elite offers no relic CHOICE — only the spin');
DP.leaveBattle();
S.run.relics = [];

// -------- relic faucets: the wheel, the boss — and ONE common in the shop --------
{
  // shops sell exactly ONE relic — 80% common / 15% rare / 5% epic;
  // forges hone gear, never relics
  DP.srand(44);
  S.run.relics = [];
  let badShopRelic = false, relicInForge = false;
  const rarCount = { c: 0, r: 0, e: 0 };
  for (let i = 0; i < 300; i++) {
    const shelf = DP.shopStock().filter(x => x.kind === 'relic');
    if (shelf.length !== 1) badShopRelic = true;
    else rarCount[RELICS.find(r => r.id === shelf[0].rid).rar]++;
    if (i < 40 && DP.boonOptions().some(o => o.kind === 'relic')) relicInForge = true;
  }
  t.ok(!badShopRelic, 'every shop case holds exactly one relic');
  t.ok(rarCount.c > 180, 'commons dominate the case (~80%: ' + rarCount.c + '/300)');
  t.ok(rarCount.r > 15 && rarCount.r < 90, 'rares show up now and then (~15%: ' + rarCount.r + '/300)');
  t.ok(rarCount.e >= 3 && rarCount.e < 40, 'epics are the 5% jackpot (' + rarCount.e + '/300)');
  t.ok(rarCount.c > rarCount.r && rarCount.r > rarCount.e, 'the odds ladder holds: c > r > e');
  t.ok(!relicInForge, 'no forge boon is ever an relic');
  // buying the cased relic puts it on your shelf
  {
    S.run.room.ents = [{ kind: 'shop', done: false }];
    DP.interact(0);
    const ri = S.room.stock.findIndex(x => x.kind === 'relic');
    S.run.gold = 10000;
    t.ok(DP.buyShop(ri, 'gold'), 'gold buys the cased relic');
    t.ok(DP.hasRelic(S.room.stock[ri].rid), 'and it lands on your shelf');
    S.run.relics = [];
    DP.closeModal();
  }
  // the wheel table can win relics of both rarities
  S.run.relics = [];
  t.ok(WHEEL.some(s => /RELIC/.test(s.label)), 'the wheel lists relic prizes');
  const rareGot = DP.grantRelic('r');
  t.ok(rareGot && RELICS.find(r => r.id === rareGot).rar === 'r', 'grantRelic pulls a rare relic');
  const comGot = DP.grantRelic('c');
  t.ok(comGot && RELICS.find(r => r.id === comGot).rar === 'c', 'and a common one');
  t.ok(S.run.relics.indexOf(rareGot) >= 0 && S.run.relics.indexOf(comGot) >= 0, 'both land on the shelf');
  S.run.relics = [];
}

// -------- winning an relic on the wheel lets you CHOOSE it --------
{
  DP.srand(52);
  S.run.relics = [];
  // the RARE RELIC segment defers a choice rather than granting at random
  const rareSeg = WHEEL.find(s => s.label === 'RARE\nRELIC');
  S.pendingPick = null; S.relicPick = null;
  rareSeg.fx();
  t.ok(S.pendingPick && S.pendingPick.rar === 'r' && S.pendingPick.picks === 1, 'a rare-relic spin defers ONE pick');
  t.eq(S.run.relics.length, 0, 'nothing is granted until you choose');
  // dismissing the wheel opens the choice overlay
  S.wheelAnim = { t: 5, seg: 0, label: 'x' };
  DP.dismissWheel();
  t.ok(S.wheelAnim === null, 'the wheel clears');
  t.ok(S.relicPick && S.relicPick.pool.length >= 2, 'a spread of rare relics to choose from (' + (S.relicPick && S.relicPick.pool.length) + ')');
  t.ok(S.relicPick.pool.every(id => RELICS.find(r => r.id === id).rar === 'r'), 'all choices are rare');
  const chosen = S.relicPick.pool[1];
  t.ok(DP.pickWheelRelic(1), 'claiming a rare relic works');
  t.ok(DP.hasRelic(chosen), 'the chosen relic is owned');
  t.ok(S.relicPick === null, 'one pick closes a single-pick menu');
  t.eq(S.run.relics.length, 1, 'exactly one relic was taken');

  // the 2-COMMON segment lets you take TWO
  S.run.relics = [];
  const comSeg = WHEEL.find(s => s.label === '2 COMMON\nRELICS');
  comSeg.fx();
  t.eq(S.pendingPick.picks, 2, 'two commons deferred');
  DP.dismissWheel();
  t.ok(S.relicPick && S.relicPick.picks === 2 && S.relicPick.pool.length >= 3, 'a spread to pick two commons from');
  DP.pickWheelRelic(0);
  t.ok(S.relicPick && S.relicPick.chosen.length === 1, 'first common taken, menu stays open');
  DP.pickWheelRelic(1);
  t.ok(S.relicPick === null, 'the menu closes once both are taken');
  t.eq(S.run.relics.length, 2, 'two commons claimed');

  // a nearly-full shelf can't fill a menu — it just grants what's left (no overlay)
  S.run.relics = RELICS.filter(r => r.rar === 'r').slice(1).map(r => r.id);   // own all rares but one
  S.pendingPick = null; S.relicPick = null;
  const before = S.run.relics.length;
  DP.openRelicPick('r', 1);
  t.ok(S.relicPick === null, 'no menu when the shelf is too full to offer a choice');
  t.eq(S.run.relics.length, before + 1, 'the last rare is granted outright');
  S.run.relics = [];
}

// -------- a boss lets you CHOOSE one of two commons + a rare --------
{
  DP.srand(46);
  S.run.relics = [];
  S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: 'ogre', done: false }];
  DP.interact(0);
  t.ok(S.enemy && S.enemy.boss, 'the boss stands');
  S.enemy.hp = 1;
  DP.dmgEnemy(5);
  t.ok(S.victory && S.victory.boss, 'boss felled');
  const off = S.victory.relicOffer;
  t.ok(Array.isArray(off) && off.length === 3, 'the boss lays out three relics');
  t.eq(off.filter(id => RELICS.find(r => r.id === id).rar === 'c').length, 2, 'two of them common');
  t.eq(off.filter(id => RELICS.find(r => r.id === id).rar === 'r').length, 1, 'one of them rare');
  t.ok(!S.victory.offer, 'a boss offers relics, not a coin spoil');
  t.ok(DP.pickRelicOffer(2), 'claiming the rare works');
  t.ok(DP.hasRelic(off[2]), 'the claimed relic is owned');
  t.ok(!DP.pickRelicOffer(0), 'only one relic may be claimed');
  t.ok(!DP.hasRelic(off[0]), 'the unclaimed ones stay behind');
  S.run.purse.coin = (S.run.purse.coin || 0) + C.STAIR_TOLL;   // afford the descent
  DP.leaveBattle();
  S.run.relics = [];
}

// -------- relic effects --------
S.run.relics = ['whet']; S.run.whet = 0;
t.eq(DP.weaponDmg(10), 13, 'whetstone sharpens weapon damage +30%');
S.run.relics = [];
t.eq(DP.weaponDmg(10), 10, 'without it, damage is flat');
// venom gland boosts vials, not green coins
S.run.relics = ['venom'];
S.enemy = DP.mkEnemy('battle'); S.enemy.hp = 500;
S.foes = [S.enemy];
S.screen = 'battle';
S.battle = { round: 1, phase: 'resolve', loot: [], banked: [], queue: [], qi: 0, qt: 0,
             stolen: 0, target: 0, tilts: C.TILTS, hand: null, sel: 'coin', goldWon: 0, keysWon: 0 };
DP.applyLoot({ t: 'vial', iid: 'vial' });
t.eq(S.enemy.pois, DP.itemById('vial').pois + 2, 'venom gland adds two stacks to vials');
S.enemy.pois = 0;
DP.applyLoot({ t: 'green' });
t.eq(S.enemy.pois, 1, 'green coins stay 1 stack each');
// plate: every round starts armoured
S.run.relics = ['plate'];
DP.newRound();
t.eq(S.run.block, 4, 'battle plate raises 4 block every round');
S.run.relics = [];
S.screen = 'dungeon'; S.battle = null; S.foes = [];
// second wind: survive a killing blow once
S.run.relics = ['wind']; S.run.windUsed = false; S.run.hp = 3; S.run.block = 0;
DP.hurtPlayer(99, 'test doom');
t.eq(S.run.hp, 1, 'second wind holds you at 1 HP');
DP.hurtPlayer(99, 'test doom');
t.eq(S.run, null, 'the second killing blow lands — run over');
t.eq(S.screen, 'over', 'game over screen');
t.ok(S.over && S.over.cause === 'test doom', 'the cause of death is recorded');

// -------- the deep vault: the 50 new relics are real mechanics --------
DP.srand(83);
DP.newRun('knight');
{
  // a fresh battle harness we can re-arm between checks
  const arm = (hp) => {
    S.screen = 'battle';
    S.enemy = DP.mkEnemy('battle'); S.enemy.hp = S.enemy.maxHp = hp || 500; S.enemy.def = null; S.enemy.braced = false;
    S.foes = [S.enemy];
    S.battle = { round: 1, phase: 'resolve', loot: [], banked: [], queue: [], qi: 0, qt: 0,
                 stolen: 0, target: 0, tilts: C.TILTS, hand: null, sel: 'coin', goldWon: 0, keysWon: 0, goldFired: 0 };
  };
  const hpOf = (fx) => { arm(500); const b = S.enemy.hp; fx(); return b - S.enemy.hp; };
  const only = (id) => { S.run.relics = id ? [id] : []; };

  // --- coin/weapon damage & effect boosters ---
  only(); const gBase = hpOf(() => DP.applyLoot({ t: 'gold' }));
  only('keenedge'); t.eq(hpOf(() => DP.applyLoot({ t: 'gold' })), gBase + 1, 'Keen Edge: gold coins +1 damage');
  only('warlord'); arm(500); S.battle.goldFired = 6; { const b = S.enemy.hp; DP.applyLoot({ t: 'gold' }); t.eq(b - S.enemy.hp, gBase + 2, 'Warlord: +1 per 3 gold already fired'); }
  only('berserker'); arm(500); S.run.hp = 5; S.run.maxHp = 100; t.eq(hpOf(() => DP.applyLoot({ t: 'gold' })), gBase + 2, 'Berserker: +2 gold damage while under half HP'); S.run.hp = S.run.maxHp = 100;
  only(); const lBase = hpOf(() => DP.applyLoot({ t: 'lucky' }));
  only('horseshoe'); t.eq(hpOf(() => DP.applyLoot({ t: 'lucky' })), lBase + 1, 'Horseshoe: lucky coins +1 damage');
  only('armory'); arm(500); { const b = S.enemy.hp; DP.applyLoot({ t: 'weapon', iid: 'sword' }); t.eq(b - S.enemy.hp, DP.weaponDmg(DP.itemById('sword').dmg) + 2, 'Armory: weapons +2 damage'); }
  only('emberhoard'); arm(500); S.foes = [S.enemy, DP.mkEnemy('battle')]; S.foes[1].hp = 50; { const b = S.foes[1].hp; DP.applyLoot({ t: 'gold' }); t.ok(S.foes[1].hp < b, 'Ember Hoard: gold also singes all foes'); }

  // --- block / defense ---
  only(); arm(500); S.run.block = 0; DP.applyLoot({ t: 'silver' }); const sBase = S.run.block;
  only('bulwark'); arm(500); S.run.block = 0; DP.applyLoot({ t: 'silver' }); t.eq(S.run.block, sBase + 1, 'Bulwark: silver coins +1 block');
  only('plateup'); arm(500); S.run.block = 0; DP.applyLoot({ t: 'shielditem', iid: 'shield' }); t.eq(S.run.block, DP.itemById('shield').block + 3, 'Reinforced Plate: shield items +3 block');
  only('ironhide'); DP.newRound(); t.eq(S.run.block, 2, 'Iron Hide: +2 block at round start');
  only('barricade'); DP.newRound(); t.eq(S.run.block, 3, 'Barricade: +3 block at round start');
  S.screen = 'dungeon'; S.battle = null;
  only('thickskin'); S.run.hp = 50; S.run.maxHp = 60; S.run.block = 0; DP.hurtPlayer(6, 'x'); t.eq(S.run.hp, 50 - 5, 'Thick Skin: 1 less from every hit');
  only('guardian'); S.run.hp = 50; S.run.block = 10; DP.hurtPlayer(6, 'x'); t.eq(S.run.hp, 52, 'Guardian: a full block soak heals 2'); S.run.block = 0;

  // --- healing ---
  only(); arm(500); const rBase = (() => { S.run.hp = 10; S.run.maxHp = 60; DP.applyLoot({ t: 'red' }); return S.run.hp - 10; })();
  only('greensprig'); arm(500); S.run.hp = 10; DP.applyLoot({ t: 'red' }); t.eq(S.run.hp - 10, rBase + 1, 'Green Sprig: heart coins heal +1');
  only('fieldmedic'); arm(500); S.run.hp = 10; DP.applyLoot({ t: 'heartitem', iid: 'heart' }); t.eq(S.run.hp - 10, DP.itemById('heart').heal + 4, 'Field Medic: heart items heal +4');
  S.run.hp = S.run.maxHp = 100;

  // --- poison / frost / curse ---
  only('toxicology'); arm(500); S.enemy.pois = 0; DP.applyLoot({ t: 'green' }); t.eq(S.enemy.pois, 2, 'Toxicology: venom coins +1 stack');
  only('deepfreeze'); arm(500); S.enemy.stunned = 0; DP.applyLoot({ t: 'frost', iid: 'frost' }); t.eq(S.enemy.stunned, DP.itemById('frost').stun + 1, 'Deep Freeze: frost stuns +1 round');
  S.screen = 'dungeon'; S.battle = null;
  only(); S.run.hp = 60; S.run.maxHp = 60; S.run.floor = 1;
  only('blessing'); arm(500); S.screen = 'battle'; S.run.hp = 60; DP.applyLoot({ t: 'skull' }); const withBless = 60 - S.run.hp;
  only(); arm(500); S.run.hp = 60; DP.applyLoot({ t: 'skull' }); const noBless = 60 - S.run.hp;
  t.eq(withBless, noBless - 2, 'Blessing: cursed skulls bite 2 less');
  S.screen = 'dungeon'; S.battle = null; S.run.hp = S.run.maxHp = 100;

  // --- economy ---
  only(); const before1 = S.run.gold; DP.addGold(100); const g1 = S.run.gold - before1;
  only('goldrush'); const before2 = S.run.gold; DP.addGold(100); t.eq(S.run.gold - before2, Math.round(g1 * 1.4), 'Gold Rush: +40% gold income');
  only('vault'); t.eq(DP.bankMax(), C.BANK_MAX + 1, 'Vault: bank holds +1');
  only('richhand'); arm(500); DP.dealHand(); t.ok((S.battle.hand.coin || 0) >= (S.run.purse.coin || 0) + 1, 'Rich Hand: a bonus gold coin in hand');
  only('tollkeeper'); arm(500); DP.dealHand(); t.ok((S.battle.hand.coin || 0) >= (S.run.purse.coin || 0) + 2, 'Tollkeeper: two bonus gold coins in hand');

  // --- resolve shaping ---
  only('finale'); { const q = DP.buildQueue([{ k: 'coin' }, { k: 'silver' }]); t.ok(q.length === 3, 'Finale: the last piece is encored'); }
  only('reverb'); { const q = DP.buildQueue([{ k: 'coin' }, { k: 'silver' }]); t.ok(q.length === 3, 'Reverb: the first piece rings twice'); }

  // --- survival / on-kill / on-win ---
  only('revenant'); S.screen = 'dungeon'; S.battle = null; S.run.windUsed = false; S.run.hp = 3; S.run.block = 0;
  DP.hurtPlayer(99, 'x'); t.eq(S.run.hp, 1, 'Revenant: first killing blow survived');
  DP.hurtPlayer(99, 'x'); t.eq(S.run.hp, 1, 'Revenant: a SECOND killing blow survived too');
  DP.hurtPlayer(99, 'x'); t.eq(S.run, null, 'the third blow lands');
  DP.newRun('knight');
  only('prospector'); arm(500); S.run.gold = 0; S.enemy.hp = 1; S.enemy.gold = 10; DP.dmgEnemy(5);
  t.ok(S.run.gold >= 12, 'Prospector: +2 gold on a kill (' + S.run.gold + ')');
  only('graverobber'); arm(500); S.enemy = DP.mkEnemy('elite'); S.enemy.elite = true; S.enemy.hp = 1; S.foes = [S.enemy]; const k0 = S.run.keys; DP.dmgEnemy(5);
  t.ok(S.run.keys >= k0 + C.KEY_ELITE + 1, 'Grave Robber: +1 key on an elite kill');
  only('secondbreath'); arm(500); S.enemy.hp = 1; S.run.hp = 10; S.run.maxHp = 100; DP.dmgEnemy(5); t.ok(S.run.hp >= 18, 'Second Breath: +8 HP on victory');
  S.run.relics = [];
  S.screen = 'dungeon'; S.battle = null; S.foes = []; S.victory = null;
}

// -------- the RELIC catalog: rarity-weighted drops --------
DP.srand(77);
DP.newRun('knight');
{
  const counts = { c: 0, r: 0, e: 0 };
  for (let i = 0; i < 300; i++) {
    S.run.relics = [];
    const id = DP.rollRelicDrop();
    counts[RELICS.find(r => r.id === id).rar]++;
  }
  t.ok(counts.c > counts.r && counts.r > counts.e,
       'commons drop most, epics least (' + counts.c + '/' + counts.r + '/' + counts.e + ')');
  t.ok(counts.e > 0, 'but epics DO drop');
}
S.run.relics = RELICS.map(r => r.id);
t.eq(DP.rollRelicDrop(), null, 'a full shelf drops nothing more');
S.run.relics = [];

// -------- relic effects on the coins --------
DP.srand(79);
S.run.room.ents = [mkMonster('orc')];
DP.interact(0);
S.enemy.hp = S.enemy.maxHp = 500; S.enemy.braced = false; S.enemy.trait = null;
S.run.hp = 100; S.run.maxHp = 200;
S.run.relics = ['goldedge'];
t.eq(DP.goldDmg(), C.DMG.gold + 1, 'Gilded Edge: gold coins +1 damage');
S.run.relics = ['momentum'];
S.battle.goldFired = 10;
t.eq(DP.goldDmg(), C.DMG.gold + 2, 'Momentum: +1 per 5 gold already fired');
S.battle.goldFired = 0;
S.run.relics = ['twinstrike'];
{
  const h0 = S.enemy.hp;
  DP.applyLoot({ t: 'gold' });
  t.eq(S.enemy.hp, h0 - 2 * C.DMG.gold, 'Twin Strike: gold coins hit twice');
}
S.run.relics = ['twinfangs', 'venomtip'];
S.enemy.pois = 0;
DP.applyLoot({ t: 'green' });
t.eq(S.enemy.pois, 4, 'Venom Tip + Twin Fangs: 2 stacks, doubled to 4');
S.run.relics = ['plaguelord'];
S.enemy.pois = 3; S.pPois = 0;
DP.endRoundTicks();
t.eq(S.enemy.pois, 3, 'Plague Lord: the rot never fades');
S.enemy.pois = 0;
S.run.relics = ['wardcandle'];
{
  const h0 = S.run.hp;
  DP.applyLoot({ t: 'skull' });
  t.eq(S.run.hp, h0 - Math.max(1, C.SKULL_DMG + S.run.floor - 1 - 3), 'Warding Candle blunts the curse');
}
S.run.relics = ['sniperlens'];
S.enemy.braced = true;
{
  const h0 = S.enemy.hp;
  DP.applyLoot({ t: 'lucky' });
  t.eq(S.enemy.hp, h0 - C.DMG.lucky, 'Sniper Lens: lucky pierces a braced guard');
  S.enemy.braced = false;
}
S.run.relics = ['spikeshield', 'silvercore'];
S.run.block = 0;
{
  const h0 = S.enemy.hp;
  DP.applyLoot({ t: 'silver' });
  t.eq(S.run.block, 2, 'Silver Core: silver gives +1 block');
  t.eq(S.enemy.hp, h0 - 1, 'Spiked Shield: and the silver cuts for 1');
}
S.run.relics = ['warmheart'];
S.run.hp = 50;
DP.applyLoot({ t: 'red' });
t.eq(S.run.hp, 50 + C.RED_HEAL + 1, 'Warm Heart: heart coins heal +1');
S.run.relics = ['gemcutter', 'fatpouch'];
{
  const g0 = S.run.gold;
  DP.applyLoot({ t: 'gem' });
  DP.applyLoot({ t: 'bag' });
  t.eq(S.run.gold, g0 + 25 + 15, 'Gem Cutter + Fat Pouch fatten the payouts');
}
S.run.relics = ['vampblade'];
S.run.hp = 50;
{
  const wd = DP.weaponDmg(DP.itemById('sword').dmg);
  DP.applyLoot({ t: 'weapon', iid: 'sword' });
  t.eq(S.run.hp, 50 + Math.ceil(wd / 2), 'Vampire Blade: weapons feed you half their bite');
}
S.run.relics = ['stormcall'];
S.battle.qi = 8;
{
  const h0 = S.enemy.hp;
  DP.applyLoot({ t: 'silver' });
  t.eq(S.enemy.hp, h0 - 3, 'Stormcaller: every 8th piece zaps all foes for 3');
}
S.battle.qi = 0;
// the Bulwark Ram finishes the resolve with a block-sized slam
S.run.relics = ['bulwarkram'];
S.run.block = 7;
S.battle.phase = 'resolve'; S.battle.queue = []; S.battle.qi = 0; S.battle.qt = 0;
{
  const h0 = S.enemy.hp;
  DP.battleTick(0.05);
  t.eq(S.enemy.hp, h0 - 7, 'Bulwark Ram: a finisher equal to your block');
  t.eq(S.battle.phase, 'enemy', 'then the foes take their turn');
}
S.battle.phase = 'drop'; S.run.block = 0;
// Thornmail bites the attacker back
S.run.relics = ['thornmail'];
S.run.block = 6; S.run.hp = 150;
S.enemy.intent = { t: 'hit', dmg: S.enemy.atk };
{
  const h0 = S.enemy.hp;
  DP.enemyActFoe(S.enemy);
  t.eq(S.enemy.hp, h0 - 3, 'Thornmail: the attacker takes back half your block');
}
// Echo Bell rings the opening piece twice
S.run.relics = ['echobell'];
{
  const q = DP.buildQueue([{ k: 'coin' }, { k: 'silver' }]);
  t.eq(q.length, 3, 'Echo Bell adds an echo');
  t.eq(q[0].t, q[1].t, 'the first piece fires twice');
}
// Quicksilver steepens the ramp
S.run.relics = [];
{
  const plain = DP.resolveSpeed(3);
  S.run.relics = ['quicksilver'];
  t.ok(DP.resolveSpeed(3) < plain, 'Quicksilver: the barrage ramps faster');
  S.run.relics = [];
}
// Crowbar / Strongbox / Minter quality-of-life
S.run.relics = ['crowbar', 'strongbox', 'minter'];
t.eq(DP.bankMax(), C.BANK_MAX + 2, 'Strongbox: the bank holds two more');
S.battle.banked = []; S.battle.stolen = 0;
DP.newRound();
t.eq(S.battle.tilts, C.TILTS + 1, 'Crowbar: an extra TILT every round');
t.eq(S.run.wallet, DP.purseTotal() + 1, 'Minter: a bonus gold coin in every hand');
// Midas gilds all income
S.run.relics = ['midas'];
{
  const g0 = S.run.gold;
  DP.addGold(10);
  t.eq(S.run.gold, g0 + 13, 'Midas Touch: +30% gold from everything');
}
// Grand Bank pays the stash back double
S.run.relics = ['grandbank'];
S.battle.banked = [{ k: 'coin' }, { k: 'silver' }];
S.battle.phase = 'drop';
DP.newRound();
t.eq(S.battle.loot.length, 4, 'Grand Bank: the stash comes back duplicated');
// Gambler's Purse widens the victory offer
S.run.relics = ['fourth'];
t.eq(DP.rollOffer().length, 4, 'Gambler’s Purse: FOUR coins to pick from');
S.run.relics = [];
finishFight();

// -------- your purse is a DECK: the hand and the selector --------
DP.srand(71);
DP.newRun('cleric');                     // purse: 5 gold, 5 silver, 2 heart
S.run.room.ents = [mkMonster('orc')];
DP.interact(0);
{
  const B = S.battle;
  t.ok(B.hand && B.hand.coin === 5 && B.hand.silver === 5 && B.hand.red === 2,
       'the whole purse is dealt as your hand');
  t.eq(S.run.wallet, 12, 'the wallet counts the hand');
  t.ok(DP.selectCoin('red'), 'tap the heart chip');
  t.eq(B.sel, 'red', 'hearts queued for the slot');
  t.ok(!DP.selectCoin('blue'), 'cannot select a coin you do not hold');
  t.ok(!DP.selectCoin('nonsense'), 'nor one that does not exist');
  // dropping spends the SELECTED kind
  S.cd = 0;
  t.ok(DP.drop(50), 'drop accepted');
  t.eq(B.hand.red, 1, 'one heart left the hand');
  t.eq(S.coins[S.coins.length - 1].kind, 'red', 'and a HEART coin falls into the slot');
  t.eq(S.run.wallet, 11, 'the wallet follows');
  S.cd = 0; DP.drop(50);
  t.eq(B.hand.red, 0, 'hearts spent');
  S.cd = 0; DP.drop(50);
  t.eq(S.coins[S.coins.length - 1].kind, B.sel, 'the selector slides to a stack you still hold');
  t.ok(B.sel !== 'red', 'no phantom hearts');
  drainHand();
  S.cd = 0;
  t.ok(!DP.drop(50), 'an empty hand cannot drop');
  finishFight();
}

// -------- multi-foe GANG-UPS --------
DP.srand(53);
S.run.room.ents = [mkMonster('orc'), mkMonster('goblin'), { kind: 'chest', done: false }];
DP.interact(0);
t.eq(S.foes.length, 2, 'the other room monster GANGS UP');
t.eq(S.foes[1].id, 'goblin', 'and it is exactly who was prowling there');
t.ok(S.foes.every(f => f.intent), 'every foe telegraphs an intent');
t.ok(S.enemy === S.foes[0], 'the foe you tapped is targeted first');
t.ok(DP.setTarget(1), 'tap the other panel to retarget');
t.ok(S.enemy === S.foes[1], 'your gold now aims at the goblin');
t.ok(!DP.setTarget(7), 'cannot target a foe that is not there');
// blue FROST coins bite EVERY foe at once
S.foes[0].hp = S.foes[0].maxHp = 10;
S.foes[1].hp = S.foes[1].maxHp = 10;
S.foes[0].braced = false; S.foes[1].braced = false;
DP.applyLoot({ t: 'blue' });
t.ok(S.foes[0].hp === 10 - C.DMG.blue && S.foes[1].hp === 10 - C.DMG.blue,
     'the FROST coin bites every foe for ' + C.DMG.blue);
// per-kill payout mid-fight
{
  const kk = S.run.keys, kg = S.run.gold;
  S.foes[1].hp = 1;
  DP.dmgFoe(S.foes[1], 5);
  t.ok(!S.victory, 'one foe down — the fight rages on');
  t.eq(S.run.keys, kk + C.KEY_KILL, 'the kill pays its key on the spot');
  t.ok(S.run.gold > kg, 'and its gold');
  t.ok(S.enemy === S.foes[0], 'your aim snaps back to a living foe');
  t.ok(S.run.room.ents[1].done, 'the slain gang member is cleared from the room');
  S.foes[0].hp = 1;
  DP.dmgFoe(S.foes[0], 5);
  t.ok(S.victory, 'last foe down -> victory');
  t.ok(S.victory.gold > 0 && S.victory.keys >= 2 * C.KEY_KILL, 'the overlay tallies the whole gang');
}
DP.leaveBattle();

// -------- the spoils: pick ONE of three coins --------
DP.srand(67);
S.run.room.ents = [mkMonster('orc')];
DP.interact(0);
S.enemy.hp = 1; DP.dmgEnemy(3);
t.ok(S.victory && Array.isArray(S.victory.offer), 'victory arms a coin offer');
t.eq(S.victory.offer.length, 3, 'three coins glint');
t.eq(new Set(S.victory.offer).size, 3, 'all different');
t.ok(S.victory.offer.every(k => COIN_KINDS.includes(k)), 'each a real coin type');
{
  const pick = S.victory.offer[1];
  const before = S.run.purse[pick] || 0;
  t.ok(DP.pickCoin(1), 'you take the middle one');
  t.eq(S.run.purse[pick], before + 1, 'it joins the purse for the rest of the run');
  t.eq(S.victory.picked, pick, 'the overlay remembers');
  t.ok(!DP.pickCoin(0), 'one pick only — no second grab');
}
DP.leaveBattle();

// -------- ONE machine per floor: the pile persists between fights --------
DP.srand(61);
DP.newRun('knight');
S.run.room.ents = [mkMonster('orc')];
DP.interact(0);
t.ok(platCoins().length > 20, 'a fresh floor racks a fresh dense pile');
t.eq(S.run.pileFloor, S.run.floor, 'the rack is stamped to this floor');
// sculpt the pile into something recognizable, then win and leave
S.coins.length = 0;
DP.place(33, 44, 'silver', 0, 'plat');
DP.place(66, 44, 'coin', 1, 'plat');
{
  const it = DP.place(50, 30, 'item', 0, 'plat');
  it.iid = 'sword';
}
finishFight();
t.ok(Array.isArray(S.run.pileSave) && S.run.pileSave.length === 3, 'leaving saves the machine exactly');
// gear bought between fights queues up as pending rain
S.run.pending.length = 0;
DP.grantItem('axe', 1);
t.eq(S.run.pending.length, 1, 'mid-floor gear waits as pending rain');
// next fight on the SAME floor: the very same pile
S.rain.length = 0;
S.run.room.ents = [mkMonster('orc')];
DP.interact(0);
t.eq(platCoins().length, 3, 'same floor -> the very same pile');
t.ok(S.coins.some(c => c.kind === 'silver' && Math.abs(c.x - 33) < 0.2), 'the stashed silver is where you left it');
t.ok(S.coins.some(c => c.kind === 'item' && c.iid === 'sword'), 'racked gear rides through too');
t.ok(S.rain.some(r => r.kind === 'item' && r.iid === 'axe'), 'and the pending axe rains in');
t.eq(S.run.pending.length, 0, 'the pending queue empties');
finishFight();
// a new floor scraps the old machine
DP.nextFloor();
t.eq(S.run.pileSave, null, 'a new floor scraps the saved pile');
S.run.room.ents = [mkMonster('orc')];
DP.interact(0);
t.ok(platCoins().length > 20, 'and racks a fresh dense pile');
finishFight();

// -------- ACTS: a new bestiary every 5 floors (Roguebook-style) --------
{
  t.eq(DP.ENEMY_TIERS.length, 3, 'three acts of enemies');
  t.ok(DP.ENEMY_TIERS.every(tier => tier.length === 10), 'ten foes per act');
  const all = DP.ENEMY_TIERS.flat();
  t.eq(new Set(all.map(e => e.id)).size, all.length, 'no duplicate ids across acts');
  t.ok(all.every(e => e.hp > 0 && e.atk > 0 && e.icon && e.name), 'every act foe is fully statted');
  const okTraits = [null, 'fast', 'thief', 'venom', 'curse', 'enrage', 'leech', 'bleeder', 'burner'];
  const okDefs = [null, 'gel', 'armor', 'thick', 'regen', 'ward'];
  t.ok(all.every(e => okTraits.includes(e.trait) && okDefs.includes(e.def)), 'all traits/defs are real mechanics');
  // act boundaries
  t.eq(DP.actIdx(1), 0, 'floor 1 is act 1');
  t.eq(DP.actIdx(5), 0, 'floor 5 still act 1');
  t.eq(DP.actIdx(6), 1, 'floor 6 opens act 2');
  t.eq(DP.actIdx(10), 1, 'floor 10 closes act 2');
  t.eq(DP.actIdx(11), 2, 'floor 11 opens act 3');
  // act 2+ foes are strictly meaner than their act-1 kin
  for (let i = 0; i < 8; i++) {
    t.ok(DP.ENEMY_TIERS[1][i].hp > DP.ENEMY_TIERS[0][i].hp && DP.ENEMY_TIERS[2][i].hp > DP.ENEMY_TIERS[1][i].hp,
         'slot ' + i + ' grows tougher act by act');
  }
}
{
  DP.srand(83);
  DP.newRun('knight');
  // floor 6 spawns exclusively from the act-2 roster
  S.run.floor = 6;
  const tier2 = new Set(DP.ENEMY_TIERS[1].map(e => e.id));
  for (let i = 0; i < 20; i++) {
    const e = DP.mkEnemy('battle');
    t.ok(tier2.has(e.id), 'floor 6 spawn #' + i + ' comes from act 2 (' + e.id + ')');
    if (!tier2.has(e.id)) break;
  }
  t.eq(DP.curRoster()[0].id, 'frostorc', 'the roster helper agrees');
  // bosses rotate per act: dragon, lich, demon
  S.run.floor = 1; t.eq(DP.mkEnemy('boss').id, 'dragon', 'act 1 boss: the Vault Dragon');
  S.run.floor = 7; t.eq(DP.mkEnemy('boss').id, 'lich', 'act 2 boss: the Coin Lich');
  S.run.floor = 12; t.eq(DP.mkEnemy('boss').id, 'demon', 'act 3 boss: the Pit Boss');
  S.run.floor = 16; t.eq(DP.mkEnemy('boss').id, 'dragon', 'act 4 cycles back around, scaled up');
  // an act-3 spawn at floor 11 out-muscles its act-2 kin at floor 10
  S.run.floor = 10; S.run.depth = 1;
  const late2 = DP.mkEnemy('battle', 'frostorc');
  S.run.floor = 11;
  const early3 = DP.mkEnemy('battle', 'emberorc');
  t.ok(early3.hp > late2.hp, 'the act hand-off never softens (' + late2.hp + ' -> ' + early3.hp + ')');
  S.run.floor = 1;
}
// -------- the act-2/3 mechanics: ENRAGE and LEECH --------
{
  DP.srand(89);
  S.run.room.ents = [mkMonster('orc')];
  DP.interact(0);
  S.enemy.hp = S.enemy.maxHp = 400;
  // enrage: fury builds at round end
  S.enemy.trait = 'enrage'; S.enemy.pois = 0;
  const atk0 = S.enemy.atk;
  DP.endRoundTicks();
  t.eq(S.enemy.atk, atk0 + 1, 'an enraged foe gains +1 attack every round');
  // leech: it drinks what got through the block
  S.enemy.trait = 'leech'; S.enemy.atk = 6;
  S.enemy.intent = { t: 'hit', dmg: 6 };
  S.run.hp = 150; S.run.maxHp = 200; S.run.block = 0;
  S.enemy.hp = 100;
  DP.enemyActFoe(S.enemy);
  t.eq(S.enemy.hp, 106, 'a leech heals for the damage it dealt');
  // fully blocked -> nothing to drink
  S.enemy.intent = { t: 'hit', dmg: 6 };
  S.run.block = 20; S.enemy.hp = 100;
  DP.enemyActFoe(S.enemy);
  t.eq(S.enemy.hp, 100, 'a blocked leech drinks nothing');
  S.enemy.trait = null;
  finishFight();
}

// -------- scaling: deeper and lower is meaner --------
DP.srand(33);
DP.newRun();
{
  const base = ENEMIES[0];
  const mk = (floor, depth) => { S.run.floor = floor; S.run.depth = depth; return Math.round(base.hp * DP.scaleMult()); };
  const shallow = mk(1, 1), deep = mk(1, 7), lower = mk(2, 7);
  t.ok(deep > shallow, 'deeper rooms grow tougher foes');
  t.ok(lower > deep, 'the next floor is meaner at equal depth');
  S.run.floor = 1; S.run.depth = 1;
}
const boss = DP.mkEnemy('boss');
t.ok(boss.boss, 'boss flag set');
t.eq(boss.id, BOSSES[0].id, 'floor 1 summons the first boss');

// -------- the boss lair -> the stairs down --------
DP.srand(37);
{
  // walk to the lair the test way: teleport the map cursor there
  const bossK = Object.keys(S.run.map.rooms).find(k => S.run.map.rooms[k].boss);
  S.run.map.cur = bossK;
  S.run.room = S.run.map.rooms[bossK];
  S.run.room.visited = true;
  S.run.depth = S.run.room.dist + 1;
}
DP.interact(0);
t.ok(S.enemy && S.enemy.boss, 'boss fight underway');
S.run.hp = 30; S.run.maxHp = 100;
const keysB = S.run.keys;
S.enemy.hp = 1;
DP.dmgEnemy(5);
t.ok(S.victory && S.victory.boss, 'boss down');
t.eq(S.run.keys, keysB + C.KEY_BOSS, 'the boss hoard holds ' + C.KEY_BOSS + ' keys');
t.ok(S.run.hp > 30, 'the stairwell rest heals');
DP.leaveBattle();
t.eq(S.run.floor, 1, 'still floor 1 — the stairs are an invitation, not a shove');
t.ok(S.run.room.ents.length === 1 && S.run.room.ents[0].kind === 'stairs',
     'the stairs down appear where the boss fell');
// the stairwell toll: too broke to descend holds you on the floor
{
  const stash = { ...S.run.purse };
  for (const k of COIN_KINDS) S.run.purse[k] = 0;
  S.run.purse.coin = 1;                    // one short of the toll
  t.ok(!DP.interact(0), 'a purse under the toll cannot descend');
  t.eq(S.run.floor, 1, 'still floor 1 without the toll');
  t.eq(DP.purseTotal(), 1, 'the toll is not skimmed on a failed descent');
  S.run.purse = stash;                     // restore the hoard and pay properly
}
const purseBefore = DP.purseTotal();
DP.interact(0);
t.eq(DP.purseTotal(), purseBefore - C.STAIR_TOLL, 'descending pays the ' + C.STAIR_TOLL + '-coin toll');
t.eq(S.run.floor, 2, 'stepping onto the stairs descends');
t.ok(S.run.map && S.run.map.cur === '0,0', 'a fresh floor map is carved');
t.eq(S.run.depth, 1, 'next floor starts at the entrance');
t.eq(S.screen, 'dungeon', 'back in a fresh room');
t.eq(mapRooms().filter(r => r.visited).length, 1, 'the new floor is all fog again');
// the key-carry cap: a bulging ring is trimmed on the way down
{
  S.run.keys = 9;
  S.run.purse.coin = (S.run.purse.coin || 0) + C.STAIR_TOLL;   // afford the toll
  DP.nextFloor();
  t.eq(S.run.keys, C.KEY_CARRY, 'only ' + C.KEY_CARRY + ' keys survive the descent');
  S.run.keys = 2;
  DP.nextFloor();
  t.eq(S.run.keys, 2, 'a ring under the cap descends untouched');
  S.run.floor = 2;   // rewind the counter for the persistence checks below
}

// -------- persistence --------
S.mute = true;
DP.save();
const saved = JSON.parse(store[C.SAVE_KEY]);
t.eq(saved.v, 1, 'save is v1');
t.ok(saved.mute === true, 'mute is persisted');
t.ok(saved.run && saved.run.floor === 2, 'the run survives in the save');
t.eq(saved.run.keys, S.run.keys, 'keys are persisted');
t.ok(saved.run.purse && typeof saved.run.purse.coin === 'number', 'the coin purse is persisted');
t.ok('pileSave' in saved.run && Array.isArray(saved.run.pending), 'the floor machine state is persisted');
t.eq(saved.run.hero, S.run.hero, 'the chosen hero is persisted');
t.ok(saved.run.map && saved.run.map.rooms && saved.run.map.cur, 'the whole floor MAP is persisted');
t.ok(saved.best && saved.best.floor >= 1, 'best progress is persisted');
// unlock a door + move, then check the exploration state survives a reload
{
  const dir = openDir(false) || openDir();
  S.run.keys = 2;
  DP.tryDoor(dir); DP.tryDoor(dir);
  DP.save();
}
const { DP: DP2 } = loadGame(store, false);
t.ok(DP2.S.run && DP2.S.run.floor === 2, 'reload resumes the saved run');
t.eq(DP2.S.screen, 'title', 'resume lands on the title (CONTINUE offered)');
t.eq(DP2.S.run.map.cur, S.run.map.cur, 'you reload in the same room you left');
t.ok(DP2.S.run.room === DP2.S.run.map.rooms[DP2.S.run.map.cur], 'the room ref is rewired on load');
t.eq(DP2.purseTotal.call ? DP2.purseTotal() : 0, DP.purseTotal(), 'the purse survives the reload intact');
t.ok(Object.values(DP2.S.run.map.links).some(l => l.open), 'unlocked doors stay unlocked');
t.eq(Object.values(DP2.S.run.map.rooms).filter(r => r.visited).length,
     mapRooms().filter(r => r.visited).length, 'the uncovered map survives the reload');
// death wipes the run but keeps the best
DP2.S.screen = 'battle';
DP2.S.enemy = DP2.mkEnemy('battle');
DP2.hurtPlayer(9999, 'the reaper');
t.eq(DP2.S.run, null, 'death ends the run');
DP2.save();
const saved2 = JSON.parse(store[C.SAVE_KEY]);
t.ok(saved2.run === null, 'dead runs are not saved');
t.ok(saved2.best.floor >= 1, 'best stats outlive the run');
// a pre-purse save (wallet/pouch era) migrates cleanly
{
  const storeOld = { dungeon_pusher_save: JSON.stringify({
    v: 1, mute: false, best: { floor: 1, depth: 2, kills: 3, gold: 10 },
    run: { floor: 1, depth: 2, hp: 50, maxHp: 60, gold: 5, wallet: 10, pouch: 1,
           arsenal: { sword: 1 }, relics: [], potions: 1, whet: 0,
           kills: 1, goldEarned: 5, block: 0 },
  }) };
  const { DP: DPold } = loadGame(storeOld, false);
  t.ok(DPold.S.run && DPold.S.run.hp === 50, 'an old save still resumes');
  t.eq(DPold.S.run.keys, DPold.C.START_KEYS, 'old saves get the starter keys');
  t.eq(DPold.S.run.purse.coin, DPold.START_PURSE.coin, 'old saves get the starter purse');
  t.eq(DPold.S.run.pileSave, null, 'and no phantom pile');
  t.ok(DPold.S.run.map && Object.keys(DPold.S.run.map.rooms).length >= 9,
       'old saves get a fresh floor map carved');
  t.ok(DPold.S.run.room === DPold.S.run.map.rooms[DPold.S.run.map.cur], 'and stand in its entrance');
}
// a pre-corridor map (v1: links only tracked unlocks) is re-carved fresh
{
  const storeV1 = { dungeon_pusher_save: JSON.stringify({
    v: 1, mute: false, best: { floor: 2, depth: 1, kills: 5, gold: 20 },
    run: { floor: 2, depth: 1, hp: 40, maxHp: 60, gold: 12,
           arsenal: { sword: 1 }, relics: [], potions: 1, whet: 0, keys: 2,
           kills: 5, goldEarned: 20,
           map: { rooms: {
             '0,0': { gx: 0, gy: 0, ents: [], visited: true, dist: 0, boss: false },
             '1,0': { gx: 1, gy: 0, ents: [{ kind: 'chest', done: false }], visited: false, dist: 1, boss: true },
           }, links: {}, cur: '0,0' } },
  }) };
  const { DP: DPv1 } = loadGame(storeV1, false);
  t.eq(DPv1.S.run.map.v, 2, 'v1 maps are re-carved to the corridor format');
  t.ok(Object.keys(DPv1.S.run.map.rooms).length >= 9, 'the fresh floor is a full random layout');
  t.eq(DPv1.S.run.floor, 2, 'run progress (floor, gold) survives the re-carve');
  t.eq(DPv1.S.run.purse.silver, DPv1.START_PURSE.silver, 'the purse falls back to the starter deck');
}
// randomness: consecutive floors carve different dungeons
{
  DP.srand(20260713);
  const layout = () => Object.keys(S.run.map.rooms).sort().join('|')
    + '#' + Object.values(S.run.map.rooms).map(r => r.size).join('');
  DP.genFloor(); const fA = layout();
  DP.genFloor(); const fB = layout();
  DP.genFloor(); const fC = layout();
  t.ok(fA !== fB && fB !== fC && fA !== fC, 'every carved floor is a different dungeon');
}

// -------- determinism --------
function runScript(D) {
  D.srand(1337);
  D.S.victory = null;
  D.S.foes.forEach(f => { f.hp = f.maxHp = 99999; });
  D.S.battle.phase = 'drop';
  D.S.battle.loot.length = 0;
  D.S.battle.hand = { coin: 99, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
  D.S.battle.sel = 'coin';
  D.reset();                     // zeroes time + pusher phase, re-racks the pile
  D.S.cd = 0; D.drop(30);
  for (let i = 0; i < 60; i++) D.tick(1 / 60);
  D.S.cd = 0; D.drop(70);
  for (let i = 0; i < 180; i++) D.tick(1 / 60);
  return JSON.stringify(D.S.coins.map(c => [c.x.toFixed(4), c.y.toFixed(4), c.st, c.kind]));
}
DP.newRun(); DP.startBattle('battle');
const runA = runScript(DP);
const runB = runScript(DP);
t.eq(runA, runB, 'same seed + same inputs = identical sim');

// -------- stability: whole rounds cycle without breaking the sim --------
DP.srand(41);
DP.newRun(); DP.startBattle('battle');
S.foes.forEach(f => { f.hp = f.maxHp = 99999; });
S.run.hp = S.run.maxHp = 99999;      // god mode: this is a physics soak test
for (let sec = 0; sec < 60; sec++) {
  S.cd = 0;
  DP.drop(20 + (sec * 13) % 60);     // rejected outside the drop phase — fine
  if (S.battle && S.battle.phase === 'drop' && S.run.wallet < 1) DP.endRoundNow();
  step(1);
}
t.ok(S.battle && S.battle.round >= 2, 'rounds cycled during the soak (round ' + S.battle.round + ')');
let sane = true, contained = true;
for (const c of S.coins) {
  if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.z)) sane = false;
  if (c.st === 'plat' && (c.x < -2 || c.x > C.W + 2 || c.y < -2 || c.y > C.PLAT_FRONT + c.r + 1)) contained = false;
}
t.ok(sane, 'no NaN/Infinity positions after long play');
t.ok(contained, 'platform coins stay within the machine');
t.ok(S.coins.length <= DP.MACH.maxCoins, 'coin count respects the machine cap');

// ============================================================
// WOUNDS: BLEED (front-loaded, halves; bones immune) and
// BURN (hot, fades by 2; gel quenches half on apply)
// ============================================================
{
  const wstore = {};
  const { DP: W } = loadGame(wstore, false);
  const WS = W.S;
  const fight = (eid) => {
    WS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid, done: false, px: 0.5, py: 0.4 }];
    W.interact(0);
    WS.enemy.hp = WS.enemy.maxHp = 500;
    return WS.enemy;
  };
  const winOut = () => { WS.enemy.hp = 1; W.dmgEnemy(9); if (WS.victory) { if (WS.victory.offer) W.pickCoin(0); W.leaveBattle(); } };
  W.srand(4101);
  W.newRun('knight');
  WS.run.hp = WS.run.maxHp = 500;

  let e = fight('orc');
  W.bleedEnemy(8);
  t.eq(e.bleed, 8, 'bleed stacks land on a fleshy foe');
  let hp0 = e.hp;
  W.endRoundTicks();
  t.eq(hp0 - e.hp, 8, 'bleed ticks its full stacks');
  t.eq(e.bleed, 4, 'the wound half-closes each round');
  e.bleed = 0;
  W.burnEnemy(6);
  t.eq(e.burn, 6, 'burn stacks land');
  hp0 = e.hp;
  W.endRoundTicks();
  t.eq(hp0 - e.hp, 6, 'burn ticks its full stacks');
  t.eq(e.burn, 4, 'the fire dies down by 2 each round');
  winOut();

  e = fight('skeleton');
  W.bleedEnemy(5);
  t.eq(e.bleed || 0, 0, 'bones cannot bleed — armor foes are immune');
  W.burnEnemy(5);
  t.eq(e.burn, 5, 'bones still burn — armor does not stop fire');
  winOut();

  e = fight('ogre');
  W.bleedEnemy(5);
  t.eq(e.bleed, 5, 'thick hide (poison-immune) bleeds just fine');
  winOut();

  e = fight('slime');
  W.burnEnemy(6);
  t.eq(e.burn, 3, 'wet gel quenches half of any burn on apply');
  winOut();

  // the wound-dealers mark YOU
  e = fight('gutterrat');
  e.intent = { t: 'hit', dmg: e.atk };
  W.enemyActFoe(e);
  t.eq(WS.pBleed, 2, 'a bleeder leaves you bleeding');
  hp0 = WS.run.hp;
  W.endRoundTicks();
  t.ok(WS.run.hp < hp0, 'your bleed ticks at round end');
  t.eq(WS.pBleed, 1, 'your wound half-closes too');
  winOut();

  e = fight('emberimp');
  e.intent = { t: 'hit', dmg: e.atk };
  W.enemyActFoe(e);
  t.eq(WS.pBurn, 2, 'a burner sets you ablaze');
  W.endRoundTicks();
  t.eq(WS.pBurn, 0, 'your fire dies down by 2');
  winOut();

  // the new foes exist in every act, indexed so the hand-off stays monotone
  for (const id of ['gutterrat', 'emberimp', 'fleshripper', 'pyretotem', 'bloodfiend', 'ashogre']) {
    t.ok(W.enemyById(id), 'new foe ' + id + ' is in the bestiary');
  }
}

// ============================================================
// PETS: living gear — summoned from the pile, they soak blows
// meant for you and act every round
// ============================================================
{
  const pstore = {};
  const { DP: P } = loadGame(pstore, false);
  const PS = P.S;
  P.srand(7202);
  P.newRun('knight');
  PS.run.hp = PS.run.maxHp = 500;
  PS.run.arsenal = { pup: 1, newt: 1, rat: 1 };
  PS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  P.interact(0);
  PS.enemy.hp = PS.enemy.maxHp = 500;

  P.applyLoot({ t: 'petitem', iid: 'pup' });
  P.applyLoot({ t: 'petitem', iid: 'newt' });
  P.applyLoot({ t: 'petitem', iid: 'rat' });
  t.eq(PS.pets.length, 3, 'three pets summoned from the tray');
  t.eq(PS.pets[0].hp, 12, 'the Rock Pup arrives at its listed HP');

  // pets act: pup blocks, newt burns, rat gnaws + bleeds
  const blk0 = PS.run.block, ehp0 = PS.enemy.hp;
  P.petsAct();
  t.eq(PS.run.block - blk0, 1, 'the pup growls up +1 block');
  t.eq(PS.enemy.burn, 1, 'the newt spits 1 burn');
  t.eq(PS.enemy.bleed, 1, 'the rat opens 1 bleed');
  t.eq(ehp0 - PS.enemy.hp, 1, 'the rat gnaws for 1');

  // the pack soaks the blow: orc atk vs pup first
  PS.run.block = 0;
  const e = PS.foes[0];
  e.intent = { t: 'hit', dmg: e.atk };
  const myHp = PS.run.hp, pupHp = PS.pets[0].hp;
  P.enemyActFoe(e);
  t.eq(PS.run.hp, myHp, 'the pack soaks the whole blow — you take nothing');
  t.ok(PS.pets[0].hp < pupHp, 'the pup carried the wound');

  // a monster blow chews THROUGH the pack into you
  PS.pets.forEach(p => { p.hp = 1; });
  e.atk = 10;
  e.intent = { t: 'hit', dmg: 10 };
  P.enemyActFoe(e);
  t.ok(PS.pets.every(p => p.hp <= 0), 'a heavy blow fells the whole weakened pack');
  t.ok(PS.run.hp < myHp, 'what the pack could not soak reaches you');

  // pet cap: the pack is full — extra summons feed the pack instead
  PS.pets.length = 0;
  for (let i = 0; i < 7; i++) P.applyLoot({ t: 'petitem', iid: 'pup' });
  t.eq(PS.pets.filter(p => p.hp > 0).length, P.petCap(), 'the stage holds at most petCap() pets');
}

// ============================================================
// THE EMBER SHELF: 50 new relics, wired for real
// ============================================================
{
  const rstore = {};
  const { DP: R } = loadGame(rstore, false);
  const RS = R.S;
  t.ok(R.RELICS.length >= 138, 'the shelf holds 138+ relics (' + R.RELICS.length + ')');
  const newIds = ['matchstick', 'embershot', 'arsonist', 'cauterize', 'ashfall', 'papercut', 'scalpel',
    'leechkit', 'kennel', 'treats', 'guarddog', 'mender', 'bloodscent', 'balancedblade', 'frostsmith',
    'apothecary', 'hoarder', 'firstblood', 'firebrand', 'slowburn', 'wildfire', 'heatwave', 'dragonbreath',
    'serrator', 'rustfang', 'arterial', 'butcher', 'bloodprice', 'petwhistle', 'packleader', 'vengeful',
    'gritcollar', 'sterling', 'frostbite', 'luckystreak', 'hailstorm', 'quartermaster', 'bombardier',
    'shieldwall', 'alloy', 'hemorrhage', 'infernolord', 'exsanguinate', 'pyroclasm', 'eternalflame',
    'alphabond', 'warhound', 'beastmaster', 'crimsonrain', 'soulchain'];
  t.eq(newIds.length, 50, 'exactly 50 relics on the new shelf');
  t.ok(newIds.every(id => R.relicById(id)), 'every new relic is on the catalog');

  R.srand(9303);
  R.newRun('knight');
  RS.run.hp = RS.run.maxHp = 500;
  const brawl = (eid, extra) => {
    RS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid, done: false, px: 0.5, py: 0.4 }];
    if (extra) RS.run.room.ents.push({ kind: 'monster', mtype: 'battle', eid: extra, done: false, px: 0.3, py: 0.3 });
    R.interact(0);
    for (const f of RS.foes) { f.hp = f.maxHp = 500; f.braced = false; }
    return RS.foes[0];
  };
  const winOut = () => {
    RS.foes.forEach(f => { f.hp = Math.min(f.hp, 1); });
    R.dmgAll(9);
    if (RS.victory) { if (RS.victory.offer) R.pickCoin(0); R.leaveBattle(); }
  };

  // coin-benders: matchstick / embershot / rustfang / crimsonrain / dragonbreath
  RS.run.relics.push('matchstick', 'embershot', 'rustfang', 'crimsonrain', 'dragonbreath', 'hailstorm');
  let e = brawl('orc', 'orc');
  R.applyLoot({ t: 'gold' });
  t.eq(e.burn, 1, 'Matchstick: a gold coin leaves 1 burn');
  R.applyLoot({ t: 'lucky' });
  t.eq(e.burn, 3, 'Ember Shot: a lucky coin stacks 2 more burn');
  R.applyLoot({ t: 'green' });
  t.eq(e.bleed, 1, 'Rust Fang: a venom coin opens 1 bleed');
  R.applyLoot({ t: 'red' });
  t.ok(RS.foes.every(f => f.bleed >= 1), 'Crimson Rain: a heart coin bleeds the whole pack');
  const burn0 = RS.foes[1].burn || 0;
  R.applyLoot({ t: 'blue' });
  t.eq(RS.foes[1].burn, burn0 + 1, 'Dragon Breath: frost ignites every foe');

  // Heat Wave rides any burning foe
  RS.run.relics.push('heatwave');
  const base = R.goldDmg();
  RS.foes.forEach(f => { f.burn = 0; });
  t.eq(R.goldDmg(), base - 1, 'Heat Wave sleeps when nothing burns');

  // weapons: Serrator opens wounds, Butcher carves them wider
  RS.run.relics.push('serrator');
  e.bleed = 0;
  R.applyLoot({ t: 'weapon', iid: 'sword' });
  t.eq(e.bleed, 2, 'Serrator: the sword leaves 2 bleed');
  RS.run.relics.push('butcher');
  let hp0 = e.hp;
  R.applyLoot({ t: 'weapon', iid: 'sword' });
  const plain = R.weaponDmg(R.itemById('sword').dmg);
  t.eq(hp0 - e.hp, plain + 3, 'Butcher: +3 damage into a bleeding foe');

  // Arterial Cut: any 8+ hit opens a wound
  RS.run.relics.push('arterial');
  e.bleed = 0;
  R.dmgFoe(e, 9);
  t.ok(e.bleed >= 2, 'Arterial Cut: a heavy hit opens 2 bleed');

  // Frostbite: frozen foes crack
  RS.run.relics.push('frostbite');
  e.stunned = 1;
  hp0 = e.hp;
  R.dmgFoe(e, 5);
  t.eq(hp0 - e.hp, 7, 'Frostbite: +2 into a frozen foe');
  e.stunned = 0;

  // Lucky Streak heats up; Alloy fuses every third silver
  RS.run.relics.push('luckystreak', 'alloy');
  RS.battle.luckyFired = 0;
  hp0 = e.hp;
  R.applyLoot({ t: 'lucky' });
  const first = hp0 - e.hp;
  hp0 = e.hp;
  R.applyLoot({ t: 'lucky' });
  t.eq(hp0 - e.hp, first + 1, 'Lucky Streak: the second lucky hits +1');
  RS.run.block = 0; RS.battle.silverFired = 0;
  R.applyLoot({ t: 'silver' }); R.applyLoot({ t: 'silver' }); R.applyLoot({ t: 'silver' });
  t.eq(RS.run.block, 3 + 3, 'Alloy: three silvers pay a bonus +3 block');

  // ticks: Slow Burn / Inferno Lord / Hemorrhage / Wildfire / Cauterize / Leech Kit
  RS.run.relics.push('slowburn', 'cauterize', 'leechkit', 'wildfire');
  e.burn = 5; e.bleed = 4;
  RS.foes[1].burn = 0; RS.foes[1].bleed = 0;
  RS.run.hp = 400;
  R.endRoundTicks();
  t.eq(e.burn, 4, 'Slow Burn: the fire fades by only 1');
  t.eq(e.bleed, 2, 'bleed still halves');
  t.eq(RS.foes[1].burn, 1, 'Wildfire: the flames leap to the other foe');
  t.ok(RS.run.hp > 400, 'Cauterize + Leech Kit: the ticks feed you');
  RS.run.relics.push('hemorrhage', 'infernolord');
  e.burn = 5; e.bleed = 4;
  RS.foes[1].hp = 0;              // clear the stage so Wildfire has no partner
  R.endRoundTicks();
  t.eq(e.burn, 5, 'Inferno Lord: burn never fades');
  t.eq(e.bleed, 4, 'Hemorrhage: bleed never fades');

  // death bounties: Ashfall / Blood Price / First Blood / Exsanguinate
  RS.run.relics.push('ashfall', 'bloodprice', 'firstblood', 'exsanguinate');
  winOut();
  e = brawl('orc', 'orc');
  const other = RS.foes[1];
  e.burn = 3; e.bleed = 4; e.hp = 1;
  const gold0 = RS.run.gold;
  R.dmgFoe(e, 2);
  t.ok(RS.run.gold - gold0 >= e.gold + 6 + 2 + 5, 'Ashfall + Blood Price + First Blood pay their bounties');
  t.ok(other.bleed >= 4, 'Exsanguinate: the wound splashes onto the pack');

  // Sterling Heart: overheal hardens
  RS.run.relics.push('sterling');
  RS.run.hp = RS.run.maxHp;
  RS.run.block = 0;
  R.healPlayer(5);
  t.eq(RS.run.block, 3, 'Sterling Heart: overheal becomes up to 3 block');

  // Quartermaster: the first item fires twice
  RS.run.relics.push('quartermaster');
  winOut();
  e = brawl('orc');
  hp0 = e.hp;
  R.applyLoot({ t: 'weapon', iid: 'sword' });
  t.ok(hp0 - e.hp >= plain * 2, 'Quartermaster: the first sword swings twice');

  // Eternal Flame greets the pack; Pet Whistle pre-summons; Soul Chain shields
  RS.run.relics.push('eternalflame', 'petwhistle', 'soulchain', 'kennel');
  RS.run.arsenal = { pup: 2 };
  winOut();
  e = brawl('orc');
  t.eq(e.burn, 2, 'Eternal Flame: the battle opens with the foe alight');
  t.eq(RS.pets.length, 2, 'Pet Whistle: both pups pre-summon at battle start');
  t.eq(RS.pets[0].hp, 12 + 4, 'Kennel: pets arrive with +4 HP');
  const rallied = R.summonPet('pup');
  t.eq(RS.pets.length, 2, 'a whistled pet rallies instead of duplicating');
  t.ok(rallied === RS.pets[0] || rallied === RS.pets[1], 'the pile copy boosts the beast already out');
  RS.pets.forEach(p => { p.hp = 30; p.maxHp = 30; });
  RS.run.block = 0;
  RS.pets[0].hp = 0; RS.pets[1].hp = 0;
  RS.run.hp = 400;
  R.hurtPlayer(5);
  t.eq(RS.run.hp, 395, 'Soul Chain sleeps once the pack is down');
  RS.pets[0].hp = 10;
  R.hurtPlayer(5);
  t.eq(RS.run.hp, 391, 'Soul Chain: -1 damage while a pet lives');

  // the ledger reads the new bends
  t.ok(R.coinFx('coin').mods.some(m => m.indexOf('Matchstick') === 0), 'the BAG lists Matchstick on gold');
  t.ok(R.itemFx('pup').main.indexOf('HP pet') > 0, 'the BAG reads a pet item as a pet');
  t.ok(R.itemFx('torch').main.indexOf('BURN') > 0, 'the BAG reads the torch in burn stacks');
}

// ============================================================
// INVENTORY: the effect sheet folds every relic into the numbers
// ============================================================
{
  const istore = {};
  const { DP: I } = loadGame(istore, false);
  I.srand(777);
  I.newRun('knight');
  // baseline: no relics
  t.eq(I.coinFx('coin').main, '1 dmg', 'bare gold coin reads 1 dmg');
  t.eq(I.coinFx('coin').mods.length, 0, 'no relic mods on a bare coin');
  t.eq(I.coinFx('red').main, 'heal 1 HP', 'bare heart coin heals 1');
  t.eq(I.coinFx('lucky').main, '3 dmg', 'bare lucky coin reads 3 dmg');
  // relics bend the sheet
  I.S.run.relics.push('goldedge', 'twinstrike', 'twinfangs', 'venomtip', 'warmheart', 'silvercore', 'spikeshield');
  t.eq(I.coinFx('coin').main, '2 dmg ×2', 'Gilded Edge + Twin Strike fold into gold');
  t.ok(I.coinFx('coin').mods.length === 2, 'gold lists both relic mods');
  t.eq(I.coinFx('green').main, '4 poison', 'Venom Tip + Twin Fangs: (1+1)*2 poison');
  t.eq(I.coinFx('red').main, 'heal 2 HP', 'Warm Heart heals +1');
  t.eq(I.coinFx('silver').main, '2 block + 1 dmg', 'Silver Core + Spiked Shield fold into silver');
  // items: forge hone + whetstone + venom gland
  t.eq(I.itemFx('sword').main, '8 dmg', 'bare sword reads its base damage');
  I.S.run.whet = 2;
  I.S.run.relics.push('whet', 'venom');
  t.eq(I.itemFx('sword').main, I.weaponDmg(8) + ' dmg', 'sword sheet matches weaponDmg with hone + Whetstone');
  t.ok(I.itemFx('sword').mods.length === 2, 'sword lists hone and Whetstone');
  t.eq(I.itemFx('vial').main, ((4 + 2) * 2) + ' poison', 'vial folds Venom Gland then Twin Fangs');
  t.eq(I.itemFx('shield').main, '6 block', 'shield reads its block');
  // run-wide mods
  let rows = I.runMods();
  t.eq(rows.find(r => r[0] === 'bank slots')[1], '' + I.bankMax(), 'stats row matches bankMax()');
  I.S.run.relics.push('strongbox', 'crowbar', 'fourth');
  rows = I.runMods();
  t.ok(rows.find(r => r[0] === 'bank slots')[1].indexOf('Strongbox') > 0, 'Strongbox shows on the bank row');
  t.ok(rows.find(r => r[0] === 'tilts / round')[1].indexOf('4') === 0, 'Crowbar bumps tilts to 4');
  t.ok(rows.find(r => r[0] === 'victory offer')[1].indexOf('4 coins') === 0, 'Gambler’s Purse shows 4 coins');
  // every coin kind produces a sheet
  for (const k of I.COIN_KINDS) t.ok(I.coinFx(k).main.length > 0, 'coinFx(' + k + ') has a headline');
}

// ============================================================
// render smoke: load WITH a stub ctx and drive the real
// rAF loop through every screen — catches draw-time crashes
// ============================================================
{
  const store2 = {};
  const { DP: D, raf } = loadGame(store2, true);
  t.ok(!D.HEADLESS, 'render pass boots with a canvas ctx');
  let ts = 0;
  const frames = (n) => { for (let i = 0; i < n; i++) { ts += 16.7; const cb = raf(); if (cb) cb(ts); } };
  frames(12);                                     // title
  D.srand(99); D.newRun();
  frames(20);                                     // the crawl: room, minimap, hero
  D.S.run.room.ents = [
    { kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.3, py: 0.3 },
    { kind: 'shop', done: false, px: 0.7, py: 0.3 },
    { kind: 'chest', done: false, px: 0.5, py: 0.6 },
  ];
  frames(10);
  D.interact(2);
  frames(10);                                     // chest gamble modal (accept/deny)
  D.acceptPrize();                                // take the prize, chest retires
  frames(6);
  D.interact(1);
  frames(10);                                     // shop modal (full 8-item shelf)
  t.ok(D.S.room && D.S.room.stock.length >= 7, 'the render-pass shop shows a tall shelf');
  D.closeModal();
  D.S.inv = { tab: 'coins' };                     // the BAG over the crawl too
  frames(5);
  D.S.inv = null;
  D.S.run.room.ents[1] = { kind: 'smith', done: false, px: 0.7, py: 0.3 };
  D.interact(1);
  frames(8);                                      // forge modal
  D.pickBoon(0);
  frames(6);
  D.closeModal();
  D.interact(0);                                  // fight the orc
  D.S.enemy.hp = D.S.enemy.maxHp = 500;
  frames(10);                                     // hand selector row + tilt cluster
  D.S.foeInfo = 0;                                // pop the bestiary info card
  frames(8);
  t.eq(D.S.foeInfo, 0, 'tapping a foe opens its info card');
  D.S.foeInfo = null;
  frames(4);
  // the menagerie + the wound pips render mid-battle
  D.summonPet('pup'); D.summonPet('newt'); D.summonPet('rat');
  D.S.enemy.burn = 3; D.S.enemy.bleed = 2; D.S.enemy.pois = 1;
  D.S.pBleed = 2; D.S.pBurn = 1;
  frames(8);
  D.S.pets[1].hp = 0;                             // one fallen pet puffs away
  frames(4);
  t.eq(D.S.pets.length, 3, 'the pet pack rode along through the render');
  D.S.pets.length = 0; D.S.pBleed = 0; D.S.pBurn = 0;
  // the BAG overlay, every tab, mid-battle
  D.S.run.relics.push('goldedge', 'twinfangs');
  D.S.inv = { tab: 'coins' };
  frames(6);
  for (const tab of ['items', 'relics', 'stats']) { D.S.inv.tab = tab; frames(4); }
  t.ok(D.S.inv && D.S.inv.tab === 'stats', 'the BAG rendered all four tabs in battle');
  // a fat relic shelf scrolls instead of truncating
  D.S.run.relics.push(...D.RELICS.slice(0, 20).map(rl => rl.id));
  D.S.inv = { tab: 'relics', scroll: 99999 };
  frames(6);
  t.ok(D.S.inv.maxScroll > 0, 'a 20+ relic shelf overflows into a scroll (' + D.S.inv.maxScroll + ')');
  t.ok(D.S.inv.scroll <= D.S.inv.maxScroll, 'the BAG scroll clamps to the shelf bottom');
  D.S.inv.scroll = -50;
  frames(3);
  t.ok(D.S.inv.scroll >= 0, 'the BAG scroll clamps to the shelf top');
  D.S.run.relics.length = 2;
  D.S.inv = null;
  frames(2);
  for (let i = 0; i < 4; i++) { D.S.cd = 0; D.drop(20 + i * 16); frames(24); }   // spend part of the hand
  D.tilt('l');
  frames(20);                                     // the pile lurches
  D.S.battle.loot.push({ k: 'coin' }, { k: 'silver' });
  frames(6);                                      // tray strip + bank box
  D.bankLoot('coin');
  frames(6);                                      // a banked chip
  frames(40);                                     // pieces settle; END TURN button pulses
  D.endRoundNow();                                // the player presses it
  let guard = 0;
  while (D.S.battle && D.S.battle.round < 2 && guard++ < 80) frames(10);         // resolve + enemy turn -> round 2
  t.ok(D.S.battle && D.S.battle.round >= 2, 'render pass played a full round (round ' + (D.S.battle && D.S.battle.round) + ')');
  D.spinWheel();
  frames(30);                                     // wheel overlay over battle
  D.S.wheelAnim = null;
  // the relic-choice overlay renders and takes a pick
  D.S.run.relics = [];
  D.openRelicPick('r', 1);
  frames(12);                                     // the CHOOSE-an-relic menu
  if (D.S.relicPick) D.pickWheelRelic(0);
  frames(8);
  D.S.enemy.hp = 1; D.dmgEnemy(5);
  frames(40);                                     // victory overlay + the coin offer
  D.pickCoin(0);
  frames(10);                                     // the picked coin glows
  D.leaveBattle();
  frames(10);
  // a 2-foe GANG-UP (one elite): multi-foe panel, retargeting, frost AoE,
  // and the relic-drop banner on the victory overlay
  D.S.run.room.ents = [
    { kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.3, py: 0.3 },
    { kind: 'monster', mtype: 'elite', eid: 'goblin', done: false, px: 0.7, py: 0.3 },
  ];
  D.interact(0);
  frames(12);                                     // two panels, two intents
  D.setTarget(1);
  frames(6);                                      // the target marker moves
  D.S.foes.forEach(f => { f.hp = 1; });
  D.dmgAll(5);
  frames(30);                                     // gang wiped -> victory
  D.leaveBattle();
  frames(6);
  // walk through a real unlocked corridor (exercises doorway + fog rendering)
  D.S.run.keys = 5;
  {
    for (const d of ['n', 's', 'e', 'w']) {
      if (D.doorTo(d)) { D.tryDoor(d); D.tryDoor(d); break; }
    }
  }
  frames(10);                                     // next (differently sized) room, minimap grew
  // teleport to the boss lair and fight
  {
    const bossK = Object.keys(D.S.run.map.rooms).find(k => D.S.run.map.rooms[k].boss);
    D.S.run.map.cur = bossK;
    D.S.run.room = D.S.run.map.rooms[bossK];
    D.S.run.room.visited = true;
    D.S.roomStamp++;
  }
  frames(8);                                      // the boss lair
  D.interact(0);
  frames(12);                                     // boss battle
  D.S.enemy.hp = 1; D.dmgEnemy(5);                // fell the boss
  frames(40);                                     // boss victory: the 2-common + 1-rare relic choice
  t.ok(D.S.victory && D.S.victory.relicOffer, 'boss victory renders the relic choice');
  D.pickRelicOffer(0);
  frames(10);                                     // the claimed relic glows
  D.S.run.purse.coin = (D.S.run.purse.coin || 0) + 5;
  D.leaveBattle();                                // descend past the boss
  frames(8);
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  frames(8);
  D.hurtPlayer(99999, 'render doom');
  frames(12);                                     // game over screen
  t.eq(D.S.screen, 'over', 'render pass ends on the over screen');
  t.ok(true, 'all screens rendered without throwing');
}

// -------- refresh on the victory screen still yields the stairs (regression) --------
// Winning a boss saves the run with the boss marked done, but the stairs are only
// spawned when CONTINUE is tapped (leaveBattle). A browser refresh at the victory
// overlay must not soft-lock the floor: reconcileStairs() rebuilds them on load.
// (Runs last: loadGame() rebinds global.localStorage, so keep it clear of the
// ordering-sensitive persistence tests above.)
{
  const rstore = {};
  const { DP: A } = loadGame(rstore, false);
  A.srand(41);
  A.newRun('knight');
  const bossK = Object.keys(A.S.run.map.rooms).find(k => A.S.run.map.rooms[k].boss);
  A.S.run.map.cur = bossK;
  A.S.run.room = A.S.run.map.rooms[bossK];
  A.S.run.room.visited = true;
  A.interact(0);                       // pick a fight with the boss
  A.S.enemy.hp = 1;
  A.dmgEnemy(5);                       // fell it — winBattle() marks it done + saves
  t.ok(A.S.victory && A.S.victory.boss, 'boss felled, victory overlay up');
  const bossRoom = A.S.run.map.rooms[bossK];
  t.ok(bossRoom.ents.some(e => e.mtype === 'boss' && e.done), 'the boss ent is marked done');
  t.ok(!bossRoom.ents.some(e => e.kind === 'stairs'), 'no stairs before CONTINUE is tapped');
  A.save();                            // persist the state as it stands at the victory screen
  // ---- the refresh ----
  const { DP: B } = loadGame(rstore, false);
  const bk2 = Object.keys(B.S.run.map.rooms).find(k => B.S.run.map.rooms[k].boss);
  const reloaded = B.S.run.map.rooms[bk2];
  t.ok(reloaded.ents.length === 1 && reloaded.ents[0].kind === 'stairs',
       'after a refresh the fallen boss lair holds the stairs down');
}

t.done();
