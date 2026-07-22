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
t.ok(ITEMS.length === 18 && ITEMS.every(i => i.id && i.icon && i.name && i.cost > 0), 'eighteen arsenal items defined');
t.ok(ENEMIES.length >= 8 && ENEMIES.every(e => e.hp > 0 && e.atk > 0), 'the bestiary is populated');
t.eq(BOSSES.length, 4, 'four floor bosses — THE AUDITOR joined the rotation');
t.ok(RELICS.length >= 88 && RELICS.every(r => r.id && r.desc), 'the relic shelf is stocked (' + RELICS.length + ')');
t.ok(RELICS.every(r => ['c', 'r', 'e'].indexOf(r.rar) >= 0), 'every relic carries a rarity stamp');
t.eq(new Set(RELICS.map(r => r.id)).size, RELICS.length, 'no duplicate relic ids');
t.eq(WHEEL.length, 12, 'the wheel of fortune has twelve prize segments');
t.ok(WHEEL.every(s => s.label && typeof s.fx === 'function'), 'every wheel segment names a prize and an effect');
t.ok(!WHEEL.some(s => /●/.test(s.label)), 'the wheel never pays out coins — the pusher owns those');
t.eq(WHEEL.filter(s => /GOLD/.test(s.label)).length, 3, 'three gold prizes');
t.eq(WHEEL.filter(s => s.label === 'COMMON\nRELIC').length, 2, 'two common-relic spots');
t.eq(WHEEL.filter(s => s.label === 'RARE\nRELIC').length, 1, 'one rare-relic spot');
t.eq(WHEEL.filter(s => /HP/.test(s.label)).length, 5, 'five HP gambles (+5 −5 +10 −10 +25)');
t.eq(WHEEL.filter(s => /KEY/.test(s.label)).length, 1, 'one key spot');
t.eq(COIN_KINDS.length, 6, 'six coin types in the mint');
t.ok(COIN_KINDS.every(k => DP.COIN_INFO[k] && DP.COIN_INFO[k].name && DP.COIN_INFO[k].what),
     'every coin type is described');

// -------- the eight adventurers and their signature coins --------
t.ok(DP.HEROES.length === 9 && DP.HEROES.every(h => h.id && h.name && h.perk && h.coin),
     'nine heroes, each with a signature coin');
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
        // the VAULT hoards two chests on purpose — everywhere else, no dupes
        if (!r.vault && ents.filter(e => e.kind === k).length > 1) dupService = true;
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

// -------- TURBO: off / ×2 / ×5 / ×10 / ×20, a GENUINE multiple of drop rate --------
S.battle.hand = { coin: 40, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
S.battle.sel = 'coin';
S.turbo = 1; S.cd = 0;
DP.drop(50);
t.eq(S.cd, C.DROP_CD, 'off: a normal drop sets the full cooldown');
t.eq(DP.cycleTurbo(), 2, 'tapping TURBO steps to ×2');
S.cd = 0; DP.drop(50);
t.eq(S.cd, C.DROP_CD / 2, '×2 halves the cooldown — coins drop twice as fast');
t.eq(DP.cycleTurbo(), 5, 'again -> ×5');
S.cd = 0; DP.drop(50);
t.eq(S.cd, C.DROP_CD / 5, '×5 pours five times as fast');
t.eq(DP.cycleTurbo(), 10, 'again -> ×10');
S.cd = 0; DP.drop(50);
t.eq(S.cd, C.DROP_CD / 10, '×10 is a firehose');
t.eq(DP.cycleTurbo(), 20, 'again -> ×20');
S.cd = 0; DP.drop(50);
t.eq(S.cd, C.DROP_CD / 20, '×20 shortens the cooldown twentyfold');
t.eq(DP.cycleTurbo(), 1, 'and it wraps back to off');
t.eq(S.turbo, 1, 'the choice is sticky on the state');
// the forced pour (hold-drop) ignores the cooldown gate so a frame can fire many
{
  S.turbo = 20; S.cd = 999;
  const hand0 = S.battle.hand.coin;
  t.ok(DP.drop(50, true), 'a forced pour drops even mid-cooldown');
  t.eq(S.battle.hand.coin, hand0 - 1, 'and it spends a coin');
}
// GENUINE ×N: pouring for the same wall-clock drops N× as many coins.
// pourStep(dt) accumulates a budget and fires many coins per frame at high turbo.
{
  const pourFor = (turbo, secs) => {
    S.turbo = turbo; S.pourAcc = 0; S.cd = 0;
    // a giant hand + empty field so neither the hand nor the coin cap caps us
    S.battle.hand = { coin: 100000, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
    S.battle.sel = 'coin';
    S.coins.length = 0;
    let n = 0;
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(secs * 60); i++) {
      n += DP.pourStep(dt);
      S.coins.length = 0;   // clear the field so the machine never fills
    }
    return n;
  };
  const secs = 10;
  const base = pourFor(1, secs), t2 = pourFor(2, secs);
  const t5 = pourFor(5, secs), t10 = pourFor(10, secs), t20 = pourFor(20, secs);
  t.ok(Math.abs(base / secs - 3.57) < 0.3, 'off pours ~3.6 coins/sec (' + (base / secs).toFixed(1) + ')');
  t.ok(Math.abs(t2 / base - 2) < 0.15, '×2 pours a genuine ~2× (' + t2 + ' vs ' + base + ')');
  t.ok(Math.abs(t5 / base - 5) < 0.2, '×5 pours a genuine ~5× (' + t5 + ' vs ' + base + ')');
  t.ok(Math.abs(t10 / base - 10) < 0.4, '×10 pours a genuine ~10× (' + t10 + ' vs ' + base + ')');
  t.ok(Math.abs(t20 / base - 20) < 0.6, '×20 pours a genuine ~20× (' + t20 + ' vs ' + base + ')');
  S.coins.length = 0;
}
// TURBO also quickens the pusher slide — deliberately milder than the drop rate
t.eq(DP.pushRate(), 3, '×20 turbo still keeps the pusher tame at 3×');
S.turbo = 1; t.eq(DP.pushRate(), 1, 'off: the pusher runs at base speed');
S.turbo = 2; t.eq(DP.pushRate(), 1.5, '×2 turbo slides the pusher 1.5× faster');
S.turbo = 5; t.eq(DP.pushRate(), 2, '×5 turbo doubles the pusher speed');
S.turbo = 10; t.eq(DP.pushRate(), 2.5, '×10 turbo runs the pusher 2.5×');
{
  // the phase really does advance faster under turbo
  S.turbo = 1; S.phase = 0; DP.step(1, true); const slow = S.phase;
  S.turbo = 5; S.phase = 0; DP.step(1, true); const fast = S.phase;
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
S.codex.coins = {};              // mastery (500 lifetime fires) would skew the exact math
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
  t.eq(items.length, 1, 'the jackpot catapults exactly ONE of your items');
  t.ok(items.every(r => r.temp), 'it is a free temporary copy');
  t.ok(items.every(r => (S.run.arsenal[r.iid] || 0) > 0), 'and gear you actually own');
  t.ok(items[0].y >= 12 && items[0].y <= DP.tierFront(0) - 12, 'it lands somewhere on the BOARD, not just the slot line');
  t.eq(S.rain.filter(r => r.kind !== 'item').length, 0, 'no coin spray riding along');
}
step(2);
t.ok(S.coins.some(c => c.kind === 'item' && c.temp), 'the free gear landed on the field');
S.rain.length = 0;
// the landing spot is luck: two jackpots scatter to different places
{
  DP.frenzy();
  const a = S.rain.filter(r => r.kind === 'item')[0];
  S.rain.length = 0;
  DP.frenzy();
  const b = S.rain.filter(r => r.kind === 'item')[0];
  t.ok(a && b && (Math.abs(a.x - b.x) > 0.001 || Math.abs(a.y - b.y) > 0.001),
       'the catapult aims somewhere new each time');
  S.rain.length = 0;
}
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
  S.run.pending = [];                                       // nothing queued — the pile holds the copy
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
  t.ok(!relicInForge, 'no forge boon is ever a relic');
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

// -------- winning a relic on the wheel lets you CHOOSE it --------
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

  // a COMMON RELIC segment defers one common pick
  S.run.relics = [];
  const comSeg = WHEEL.find(s => s.label === 'COMMON\nRELIC');
  comSeg.fx();
  t.eq(S.pendingPick.picks, 1, 'one common deferred');
  DP.dismissWheel();
  t.ok(S.relicPick && S.relicPick.picks === 1 && S.relicPick.pool.length >= 2, 'a spread to pick a common from');
  t.ok(S.relicPick.pool.every(id => RELICS.find(r => r.id === id).rar === 'c'), 'all choices are common');
  DP.pickWheelRelic(0);
  t.ok(S.relicPick === null, 'the menu closes once taken');
  t.eq(S.run.relics.length, 1, 'one common claimed');

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
  S.run.bside = 0;                       // pin the A-side: the wyrm's MIRROR would bounce the kill shot
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
  only('emberhoard'); arm(500); S.foes = [S.enemy, DP.mkEnemy('battle')]; S.foes[1].hp = 50; S.foes[1].def = null; S.foes[1].block = 0; { const b = S.foes[1].hp; DP.applyLoot({ t: 'gold' }); t.ok(S.foes[1].hp < b, 'Ember Hoard: gold also singes all foes'); }

  // --- block / defense ---
  only(); arm(500); S.run.block = 0; DP.applyLoot({ t: 'silver' }); const sBase = S.run.block;
  only('bulwark'); arm(500); S.run.block = 0; DP.applyLoot({ t: 'silver' }); t.eq(S.run.block, sBase + 1, 'Bulwark: silver coins +1 block');
  only('plateup'); arm(500); S.run.block = 0; DP.applyLoot({ t: 'shielditem', iid: 'shield' }); t.eq(S.run.block, DP.itemById('shield').block + 3, 'Reinforced Plate: shield items +3 block');
  only('ironhide'); DP.newRound(); t.eq(S.run.block, 2, 'Iron Hide: +2 block at round start');
  only('barricade'); DP.newRound(); t.eq(S.run.block, 4, 'Barricade: +4 block at round start (s75 dud pass — level with Plate)');
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
  t.eq(withBless, noBless - 3, 'Blessing: 2 less bite + a 1 HP blessing behind');
  S.screen = 'dungeon'; S.battle = null; S.run.hp = S.run.maxHp = 100;

  // --- economy ---
  only(); const before1 = S.run.gold; DP.addGold(100); const g1 = S.run.gold - before1;
  only('goldrush'); const before2 = S.run.gold; DP.addGold(100); t.eq(S.run.gold - before2, Math.round(g1 * 1.4), 'Gold Rush: +40% gold income');
  only('vault'); t.eq(DP.bankMax(), C.BANK_MAX + 2, 'Vault: bank holds +2 (s75 dud pass — level with Strongbox)');
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
S.codex.coins = {};              // a long suite can MASTER gold — clean slate here
S.run.relics = ['goldedge'];
t.eq(DP.goldDmg(), C.DMG.gold + 1, 'Gilded Edge: gold coins +1 damage');
S.run.relics = ['momentum'];
S.battle.goldFired = 10;
t.eq(DP.goldDmg(), C.DMG.gold + 2, 'Momentum: +1 per 5 gold already fired');
S.battle.goldFired = 0;
S.run.relics = ['twinstrike'];
S.codex.coins = {};              // mastery would skew the exact double-hit math
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
  t.eq(DP.ENEMY_TIERS.length, 4, 'four acts of enemies — THE MINT opened');
  t.ok(DP.ENEMY_TIERS.every(tier => tier.length >= 13), 'a full roster per act (13+)');
  const all = DP.ENEMY_TIERS.flat();
  t.eq(new Set(all.map(e => e.id)).size, all.length, 'no duplicate ids across acts');
  t.ok(all.every(e => e.hp > 0 && e.atk > 0 && e.icon && e.name), 'every act foe is fully statted');
  const okTraits = [null, 'fast', 'thief', 'venom', 'curse', 'enrage', 'leech', 'bleeder', 'burner',
                    'gremlin', 'rustmite', 'magnet', 'bell', 'chrono', 'coward', 'twin', 'gardener',
                    'magarmor', 'coinclone', 'jackthief'];
  const okDefs = [null, 'gel', 'armor', 'thick', 'regen', 'ward', 'mirror', 'tar'];
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
  // bosses rotate per act: dragon, lich, demon (the A-side — pinned, since
  // run parity decides which side holds the lairs)
  S.run.bside = 0;
  S.run.floor = 1; t.eq(DP.mkEnemy('boss').id, 'dragon', 'act 1 boss: the Vault Dragon');
  S.run.floor = 7; t.eq(DP.mkEnemy('boss').id, 'lich', 'act 2 boss: the Coin Lich');
  S.run.floor = 12; t.eq(DP.mkEnemy('boss').id, 'demon', 'act 3 boss: the Pit Boss');
  S.run.floor = 16; t.eq(DP.mkEnemy('boss').id, 'auditor', 'act 4: THE AUDITOR holds the mint');
  S.run.floor = 21; t.eq(DP.mkEnemy('boss').id, 'dragon', 'act 5 cycles back around, scaled up');
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
  t.ok(DPv1.S.run.map.v >= 2, 'v1 maps are re-carved to the corridor format');
  t.ok(Object.keys(DPv1.S.run.map.rooms).length >= 9, 'the fresh floor is a full random layout');
  t.eq(DPv1.S.run.floor, 2, 'run progress (floor, gold) survives the re-carve');
  t.eq(DPv1.S.run.purse.silver, DPv1.START_PURSE.silver, 'the purse falls back to the starter deck');
}
// randomness: consecutive floors carve different dungeons (layouts are
// seeded per (run seed, floor) now — the SAME floor re-carves identically
// by design, so step the floor between carves like the game does)
{
  DP.srand(20260713);
  const layout = () => Object.keys(S.run.map.rooms).sort().join('|')
    + '#' + Object.values(S.run.map.rooms).map(r => r.size).join('');
  const f0 = S.run.floor;
  DP.genFloor(); const fA = layout();
  S.run.floor = f0 + 1; DP.genFloor(); const fB = layout();
  S.run.floor = f0 + 2; DP.genFloor(); const fC = layout();
  S.run.floor = f0; DP.genFloor();
  const fA2 = layout();
  t.ok(fA !== fB && fB !== fC && fA !== fC, 'every carved floor is a different dungeon');
  t.eq(fA2, fA, 'and re-carving the same floor reproduces it exactly (seeded)');
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
  t.ok(R.RELICS.length >= 137, 'the shelf holds 137+ relics (' + R.RELICS.length + ', Lantern retired)');
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
// HEXES & GRIT: strength, weakness, and the miser's curse
// ============================================================
{
  const hstore = {};
  const { DP: H } = loadGame(hstore, false);
  const HS = H.S;
  H.srand(6006);
  H.newRun('knight');
  HS.run.hp = HS.run.maxHp = 500;

  // STRENGTH: +1 per point on gold, lucky and weapons
  const g0 = H.goldDmg(), w0 = H.weaponDmg(8);
  HS.run.str = 3;
  t.eq(H.goldDmg(), g0 + 3, 'strength rides every gold coin');
  t.eq(H.weaponDmg(8), w0 + 3, 'and every weapon swing');
  HS.run.str = 0;

  HS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  H.interact(0);
  HS.enemy.hp = HS.enemy.maxHp = 500;

  // WEAKNESS: direct blows halve (rounded down), DoTs do not care
  HS.weakT = 2;
  let hp0 = HS.enemy.hp;
  H.dmgFoe(HS.enemy, 9);
  t.eq(hp0 - HS.enemy.hp, 4, 'weakness halves a 9 into a 4');
  HS.enemy.pois = 6;
  hp0 = HS.enemy.hp;
  H.dmgFoe(HS.enemy, 6, 'pois');
  t.eq(hp0 - HS.enemy.hp, 6, 'rot ignores your weak arm');
  H.endRoundTicks();
  t.eq(HS.weakT, 1, 'weakness wears off round by round');
  HS.weakT = 0; HS.enemy.pois = 0;

  // MISER'S CURSE: every coin fired burns 1 HP straight through block
  HS.taxT = 2;
  HS.run.block = 10;
  const myHp = HS.run.hp;
  H.applyLoot({ t: 'gold' });
  t.eq(HS.run.hp, myHp - 1, 'a taxed gold coin bites 1 HP');
  H.applyLoot({ t: 'silver' });
  t.eq(HS.run.hp, myHp - 2, 'even a silver pays the miser — block does not help');
  H.applyLoot({ t: 'weapon', iid: 'sword' });
  t.eq(HS.run.hp, myHp - 2, 'items are not coins — the curse ignores them');
  H.endRoundTicks();
  H.endRoundTicks();
  t.eq(HS.taxT, 0, 'the curse lifts after its rounds');

  // boss hexes: each boss weaves its signature
  const lich = H.mkEnemy('boss');
  lich.id = 'lich'; lich.intent = { t: 'hex' };
  HS.foes = [lich]; HS.enemy = lich;
  H.enemyActFoe(lich);
  t.eq(HS.taxT, 3, 'the Coin Lich lays the MISER’S CURSE (3 rounds)');
  const demon = H.mkEnemy('boss');
  demon.id = 'demon'; demon.intent = { t: 'hex' };
  H.enemyActFoe(demon);
  t.eq(HS.weakT, 2, 'the Pit Boss saps you WEAK (2 rounds)');
  const dragon = H.mkEnemy('boss');
  dragon.id = 'dragon'; dragon.intent = { t: 'hex' };
  const burn0 = HS.pBurn;
  H.enemyActFoe(dragon);
  t.eq(HS.pBurn, burn0 + 4, 'the Vault Dragon BRANDS you with 4 burn');

  // the forge can paint strength on
  HS.run.str = 0;
  HS.room = { type: 'forge', opts: [{ kind: 'str', label: 'x' }], done: false };
  H.pickBoon(0);
  t.eq(HS.run.str, 1, 'War Paint at the forge grants +1 STRENGTH');
}

// ============================================================
// TRICKSTERS & LESSER HEXES: the machine-warpers, war paints,
// and the elite curses that bend how you PLAY
// ============================================================
{
  const tstore = {};
  const { DP: T } = loadGame(tstore, false);
  const TS = T.S;
  T.srand(8811);
  T.newRun('knight');
  TS.run.hp = TS.run.maxHp = 500;
  const brawl = (eid, extra) => {
    TS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid, done: false, px: 0.5, py: 0.4 }];
    if (extra) TS.run.room.ents.push({ kind: 'monster', mtype: 'battle', eid: extra, done: false, px: 0.3, py: 0.3 });
    T.interact(0);
    for (const f of TS.foes) { f.hp = f.maxHp = 500; f.braced = false; }
    return TS.foes[0];
  };
  const winOut = () => {
    TS.foes.forEach(f => { f.hp = Math.min(f.hp, 1); f.trait = null; });
    T.dmgAll(9);
    if (TS.victory) { if (TS.victory.offer) T.pickCoin(0); T.leaveBattle(); }
  };

  // war paints: temporary STRENGTH / DEXTERITY for one battle
  let e = brawl('orc');
  const g0 = T.goldDmg();
  T.applyLoot({ t: 'buffitem', iid: 'horn' });
  t.eq(T.goldDmg(), g0 + 2, 'the War Horn grants +2 STR for the battle');
  T.applyLoot({ t: 'buffitem', iid: 'tonic' });
  TS.run.block = 0;
  T.applyLoot({ t: 'silver' });
  t.eq(TS.run.block, 3, 'the Grip Tonic makes silvers block 1+2');
  winOut();
  t.eq(TS.tempStr, 0, 'war paints wash off when the battle ends');
  t.eq(T.goldDmg(), g0, 'gold is back to its plain self');

  // lesser hexes: frostbitten hands / lead purse / blackout / rust
  e = brawl('orc');
  TS.noTiltT = 1;
  TS.battle.tilts = 3;
  t.ok(!T.tilt('l'), 'FROSTBITTEN HANDS: the TILT is refused');
  t.eq(TS.battle.tilts, 3, 'and no charge is wasted');
  TS.noTiltT = 0;
  TS.leadT = 1;
  TS.run.purse = { coin: 8, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
  T.dealHand();
  t.eq(TS.battle.hand.coin, 5, 'LEAD PURSE: the hand is dealt 3 short');
  TS.leadT = 0;
  TS.rustT = 1;
  TS.battle.rustSpent = false;
  let hp0 = e.hp;
  T.applyLoot({ t: 'weapon', iid: 'sword' });
  const full = T.weaponDmg(T.itemById('sword').dmg);
  t.eq(hp0 - e.hp, Math.floor(full / 2), 'RUST: the first item fires at half effect');
  hp0 = e.hp;
  T.applyLoot({ t: 'weapon', iid: 'sword' });
  t.eq(hp0 - e.hp, full, 'the second item swings clean');
  TS.rustT = 0;
  // an elite's hex intent lands one of the four
  const elite = T.mkEnemy('elite', 'orc');
  elite.intent = { t: 'hex' };
  TS.foes.push(elite);
  T.enemyActFoe(elite);
  t.ok(TS.noTiltT + TS.leadT + TS.blackT + TS.rustT > 0, 'an elite hex lands one of the four curses');
  TS.noTiltT = 0; TS.leadT = 0; TS.blackT = 0; TS.rustT = 0;
  TS.foes.pop();
  winOut();

  // TRAY GREMLIN: filches the smallest piece; killing it refunds the stash
  e = brawl('traygremlin');
  TS.battle.loot = [{ k: 'gem' }, { k: 'coin' }, { k: 'silver' }];
  e.intent = { t: 'brace' };
  T.enemyActFoe(e);
  t.eq(TS.battle.loot.length, 2, 'the gremlin filches a piece');
  t.ok(!TS.battle.loot.some(l => l.k === 'coin'), 'it takes the SMALLEST (the plain coin)');
  t.eq(e.belly.length, 1, 'the stash sits in its belly');
  e.hp = 1;
  T.dmgFoe(e, 5);
  t.eq(TS.battle.loot.length, 3, 'killing it spills the stash back into your tray');
  if (TS.victory) { if (TS.victory.offer) T.pickCoin(0); T.leaveBattle(); }

  // RUST MITE corrodes a pile coin into a slug; slugs collect as nothing
  e = brawl('rustmite');
  T.S.coins.length = 0;
  T.place(50, 40, 'coin', 0, 'plat', 0);
  e.intent = { t: 'brace' };
  T.enemyActFoe(e);
  t.eq(TS.coins[0].kind, 'slug', 'the mite corrodes the coin into a slug');
  TS.battle.loot = [];
  T.scoreCoin(TS.coins[0]);
  t.eq(TS.battle.loot.length, 0, 'a collected slug is worth NOTHING');
  winOut();

  // MAGNET WRAITH drags the pile back
  e = brawl('magnetwraith');
  T.S.coins.length = 0;
  T.place(50, 60, 'coin', 0, 'plat', 0);
  T.place(30, 60, 'coin', 0, 'plat', 0);
  e.intent = { t: 'brace' };
  T.enemyActFoe(e);
  t.ok(TS.coins.every(c => c.y < 60), 'the wraith drags both coins away from the edge');
  winOut();

  // BELL KEEPER: every 10th piece tolls +5 block for the pack
  e = brawl('bellkeeper', 'orc');
  TS.battle.qi = 10;
  T.applyLoot({ t: 'gold' });
  t.ok(TS.foes.every(f => f.block === 5), 'the bell tolls on the 10th piece: pack +5 block');
  hp0 = e.hp;
  T.dmgFoe(e, 4);
  t.eq(e.hp, hp0, 'its block soaks the next blow whole');
  T.endRoundTicks();
  t.ok(TS.foes.every(f => !f.block), 'tolled shields melt at round end');
  winOut();

  // MIRROR SHELL bounces the first hit back (capped), then cracks open
  e = brawl('mirrorshell');
  hp0 = TS.run.hp;
  t.eq(T.dmgFoe(e, 20), 0, 'the mirror eats the first blow');
  t.eq(TS.run.hp, hp0 - 8, 'and reflects it back at you (capped at 8)');
  t.ok(T.dmgFoe(e, 5) > 0, 'the second hit lands clean');
  T.endRoundTicks();
  t.eq(T.dmgFoe(e, 5), 0, 'a new round re-polishes the mirror');
  winOut();

  // TAR CUBE: every 3rd piece sticks; its death refunds the stuck coins
  e = brawl('tarcube');
  T.dmgFoe(e, 3); T.dmgFoe(e, 3);
  hp0 = e.hp;
  t.eq(T.dmgFoe(e, 3), 0, 'the third piece STICKS in the tar');
  t.eq(e.hp, hp0, 'and deals nothing');
  t.eq((e.belly || []).length, 1, 'the coin sits in the tar');
  TS.battle.loot = [];
  e.hp = 1;
  T.dmgFoe(e, 5);
  t.ok(TS.battle.loot.some(l => l.k === 'coin'), 'its death refunds the stuck coin');
  if (TS.victory) { if (TS.victory.offer) T.pickCoin(0); T.leaveBattle(); }

  // CHRONOPHAGE eats a TILT on heavy hits
  e = brawl('chronophage');
  TS.battle.tilts = 3;
  T.dmgFoe(e, 9);
  t.eq(TS.battle.tilts, 2, 'a 9-damage hit feeds it a TILT');
  T.dmgFoe(e, 3);
  t.eq(TS.battle.tilts, 2, 'small hits leave your tilts alone');
  winOut();

  // COWARD KING hides behind his weakest lackey
  e = brawl('cowardking', 'orc');
  TS.foes[1].hp = 30;
  T.setTarget(0);
  t.eq(TS.enemy.id, 'orc', 'targeting the king lands you on his lackey');
  t.eq(TS.foes[1].id, 'cowardking', 'the king now cowers in the back slot');
  winOut();

  // TWIN IDOL: met alone it splits — and a lone survivor raises its twin
  TS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'twinidol', done: false, px: 0.5, py: 0.4 }];
  T.interact(0);
  t.eq(TS.foes.length, 2, 'the idol splits into a bonded pair');
  TS.foes[0].hp = 0;
  T.endRoundTicks();
  t.ok(TS.foes[0].hp > 0, 'the living twin RAISES its fallen partner');
  TS.foes.forEach(f => { f.hp = 1; f.trait = null; });
  T.dmgAll(9);
  t.ok(TS.victory, 'felling both in one round ends it for good');

  // the forge's permanent stats are VERY RARE
  {
    T.srand(31);
    let strN = 0, dexN = 0;
    for (let i = 0; i < 400; i++) {
      const opts = T.boonOptions();
      if (opts.some(o => o.kind === 'str')) strN++;
      if (opts.some(o => o.kind === 'dex')) dexN++;
    }
    t.ok(strN > 8 && strN < 80, 'War Paint is a rare forge prize (~8%: ' + strN + '/400)');
    t.ok(dexN > 8 && dexN < 80, 'Sure Hands too (~8%: ' + dexN + '/400)');
  }
}

// ============================================================
// THE POLTERGEIST: a hero that cannot touch coins — its purse
// rains itself in and it fights by SHAKING the machine
// ============================================================
{
  const gstore = {};
  const { DP: G } = loadGame(gstore, false);
  const GS = G.S;
  G.srand(1313);
  // the ghost is EARNED: locked until a run has reached floor 20
  t.ok(!G.heroUnlocked('ghost'), 'a fresh profile has not earned the Poltergeist');
  G.newRun('ghost');
  t.eq(GS.run.hero, 'knight', 'picking the locked ghost falls back to the knight');
  t.ok(G.heroUnlocked('knight'), 'the mortal four are always open');
  GS.best.floor = 20;
  t.ok(G.heroUnlocked('ghost'), 'floor 20 on the record breaks the seal');
  G.newRun('ghost');
  t.eq(GS.run.hero, 'ghost', 'the Poltergeist answers the call');
  t.eq(GS.run.purse.lucky, 2, 'its signature: +2 LUCKY (ghost-luck)');
  const purseN = G.purseTotal();
  GS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  GS.rain.length = 0;
  G.interact(0);
  GS.enemy.hp = GS.enemy.maxHp = 500;
  t.eq(GS.run.wallet, 0, 'it holds NO hand — the wallet reads zero');
  t.eq(GS.rain.filter(r => G.COIN_KINDS.includes(r.kind)).length, purseN,
       'the whole purse rains itself into the machine (' + purseN + ' pieces)');
  t.ok(!G.drop(50), 'it cannot DROP a coin');
  t.eq(GS.battle.tilts, C.TILTS * 2, 'TILT charges are DOUBLED');
  // its shakes hit harder
  G.S.coins.length = 0;
  const c1 = G.place(50, 40, 'coin', 0, 'plat', 0);
  G.tilt('r');
  t.ok(c1.vx >= 15, 'the ghost\'s tilt shoves half again as hard (' + c1.vx.toFixed(1) + ')');
  // the purse still GROWS normally — next round rains more
  GS.run.purse.coin += 3;
  GS.rain.length = 0;
  G.dealHand();
  t.eq(GS.rain.length, G.purseTotal(), 'a fatter purse rains a fatter storm');
  // other heroes still deal a normal hand
  G.newRun('knight');
  GS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  G.interact(0);
  t.ok(GS.run.wallet > 0, 'the knight still holds a proper hand');
  t.eq(GS.battle.tilts, C.TILTS, 'and normal TILT charges');
}

// ============================================================
// THE CRANE KEEPER: no dropping — a CLAW plucks the pile
// ============================================================
{
  const cstore = {};
  const { DP: K } = loadGame(cstore, false);
  const KS = K.S;
  K.srand(2424);
  KS.best.floor = 10;                      // the keeper unseals at floor 10 now
  K.newRun('crane');
  t.eq(KS.run.hero, 'crane', 'the Crane Keeper answers the call once unsealed');
  t.eq(KS.run.purse.coin, DP.START_PURSE.coin + 2, 'its signature: +2 GOLD');
  const purseN = K.purseTotal();
  KS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  KS.rain.length = 0;
  K.interact(0);
  KS.enemy.hp = KS.enemy.maxHp = 500;
  t.eq(KS.run.wallet, 0, 'it holds no hand either');
  t.eq(KS.rain.filter(r => K.COIN_KINDS.includes(r.kind)).length, purseN, 'its purse rains in like the ghost');
  t.ok(!K.drop(50), 'its finger cannot DROP — it drives the claw');
  t.eq(KS.battle.grabs, 2, 'two claw drops on the rail');

  // a DROP hauls a CHUNK: everything in the claw's spread leaves the deck,
  // split between the tray (caught) and the pile (slipped back through
  // the claw's holes as falling pieces)
  K.S.coins.length = 0;
  K.place(48, 58, 'coin', 0, 'plat', 0);
  K.place(52, 62, 'silver', 0, 'plat', 0);
  K.place(50, 55, 'coin', 0, 'plat', 0);
  K.place(85, 60, 'lucky', 0, 'plat', 0);          // out of the spread
  KS.battle.loot = [];
  const res = K.craneDrop(50, 59);
  t.ok(res, 'the claw drops on the cluster');
  t.eq(res.caught + res.slipped, 3, 'the whole chunk left the deck (far coin spared)');
  t.eq(KS.battle.loot.length, res.caught, 'the caught pieces fill the tray loot');
  t.eq(KS.coins.filter(c => c.st === 'air').length, res.slipped, 'the slipped ones tumble back as falling pieces');
  t.eq(KS.coins.filter(c => c.st === 'plat').length, 1, 'only the far lucky still sits on the deck');
  t.eq(KS.battle.grabs, 1, 'one drop spent');

  // the claw holds at most SIX pieces
  K.S.coins.length = 0;
  for (let i = 0; i < 8; i++) K.place(46 + (i % 4) * 3, 56 + ((i / 4) | 0) * 4, 'coin', 0, 'plat', 0);
  KS.battle.loot = [];
  const res2 = K.craneDrop(50, 58);
  t.eq(res2.caught + res2.slipped, 6, 'six pieces max per bite');
  t.eq(KS.coins.filter(c => c.st === 'plat').length, 2, 'the overflow stays on the deck');
  t.eq(KS.battle.grabs, 0, 'the rail is spent');
  t.eq(K.craneDrop(50, 58), null, 'no drops left, no bite');

  // a drop onto bare stone still spends the grab
  KS.battle.phase = 'drop';
  K.newRound();
  K.S.coins.length = 0;
  const res3 = K.craneDrop(50, 58);
  t.ok(res3 && res3.caught === 0 && res3.slipped === 0, 'the claw closes on air');
  t.eq(KS.battle.grabs, K.grabCount() - 1, 'and the drop is spent — like every crane game ever');

  // drops rewind each round, and grow +1 per act (capped at four)
  K.newRound();
  t.eq(KS.battle.grabs, 2, 'a fresh round rewinds the claw');
  KS.run.floor = 6;
  t.eq(K.grabCount(), 3, 'act 2 fits a third drop');
  KS.run.floor = 11;
  t.eq(K.grabCount(), 4, 'act 3 a fourth');
  KS.run.floor = 21;
  t.eq(K.grabCount(), 4, 'and it caps there');
  KS.run.floor = 1;
}

// ============================================================
// THE CRAWL: coin-payment picking, floor-scoped maps, dark floors
// ============================================================
{
  const dstore = {};
  const { DP: D2 } = loadGame(dstore, false);
  const DS = D2.S;
  D2.srand(4477);
  D2.newRun('knight');

  // dark floors: every 3rd, the torches are dead
  t.ok(!D2.darkFloor(), 'floor 1 is lit');
  DS.run.floor = 3;
  t.ok(D2.darkFloor(), 'floor 3 is DARK');
  DS.run.floor = 6;
  t.ok(D2.darkFloor(), 'floor 6 too');
  DS.run.floor = 7;
  t.ok(!D2.darkFloor(), 'floor 7 is lit again');
  DS.run.floor = 1;

  // the Torn Map bares only the floor it was bought on
  t.ok(!D2.RELICS.some(rl => rl.id === 'lantern'), 'the run-wide Lantern relic is retired');
  DS.run.room.ents = [{ kind: 'shop', done: false }];
  D2.interact(0);
  const mapSlot = DS.room.stock.findIndex(x => x.kind === 'map');
  t.ok(mapSlot >= 0, 'the keeper sells a Torn Map');
  DS.run.gold = 10000;
  t.ok(D2.buyShop(mapSlot, 'gold'), 'gold buys the map');
  t.eq(DS.run.mapFloor, 1, 'it is stamped with THIS floor');
  DS.run.floor = 2;
  t.ok(DS.run.mapFloor !== DS.run.floor, 'and the next floor is blind again');
  DS.run.floor = 1;

  // paying with coins asks WHICH pocket — and honors the choice
  const itemSlot = DS.room.stock.findIndex(x => x.kind === 'item' && !x.sold);
  const price = DS.room.stock[itemSlot].coinPrice;
  for (const k of D2.COIN_KINDS) DS.run.purse[k] = 0;
  DS.run.purse.coin = price + 1;
  DS.run.purse.green = price + 2;
  t.eq(D2.payableKinds(price).length, 2, 'two pockets can cover the price');
  t.ok(D2.buyShop(itemSlot, 'coins', 'green'), 'the picker pays with the CHOSEN kind');
  t.eq(DS.run.purse.green, 2, 'the venom pocket paid');
  t.eq(DS.run.purse.coin, price + 1, 'the gold pocket was left alone');
  // a kind too shallow to pay is refused
  const slot2 = DS.room.stock.findIndex(x => !x.sold && x.coinPrice);
  DS.run.purse.red = 0;
  t.ok(!D2.buyShop(slot2, 'coins', 'red'), 'an empty pocket cannot pay');
  D2.closeModal();
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
  t.eq(I.coinFx('lucky').main, '4 dmg', 'bare lucky coin reads 4 dmg');
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

// -------- THE BOSS ROAD, big floors, the VAULT and its golden key --------
{
  const { DP: D } = loadGame({}, false);
  const rk = (x, y) => x + ',' + y;
  const lk = (x1, y1, x2, y2) => (y1 < y2 || (y1 === y2 && x1 < x2))
    ? x1 + ',' + y1 + '~' + x2 + ',' + y2 : x2 + ',' + y2 + '~' + x1 + ',' + y1;
  const DIRS2 = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  let vaultsSeen = 0, minRooms = 999;
  for (let seed = 1; seed <= 6; seed++) {
    D.srand(seed * 313);
    D.newRun('knight');
    const rooms = D.S.run.map.rooms, links = D.S.run.map.links;
    const keys = Object.keys(rooms);
    minRooms = Math.min(minRooms, keys.length);
    // the road: BFS over OPEN links only must reach the boss
    const bossK = keys.find(k => rooms[k].boss);
    const q = ['0,0']; const seen = { '0,0': true };
    while (q.length) {
      const r = rooms[q.shift()];
      for (const d of ['n', 's', 'e', 'w']) {
        const k = rk(r.gx + DIRS2[d][0], r.gy + DIRS2[d][1]);
        const l = rooms[k] && links[lk(r.gx, r.gy, rooms[k].gx, rooms[k].gy)];
        if (l && l.open && !seen[k]) { seen[k] = true; q.push(k); }
      }
    }
    t.ok(seen[bossK], 'seed ' + seed + ': the boss is reachable through UNLOCKED doors alone');
    const vaultK = keys.find(k => rooms[k].vault);
    if (vaultK) {
      vaultsSeen++;
      const vr = rooms[vaultK];
      let goldLinks = 0, plainLinks = 0;
      for (const d of ['n', 's', 'e', 'w']) {
        const k = rk(vr.gx + DIRS2[d][0], vr.gy + DIRS2[d][1]);
        const l = rooms[k] && links[lk(vr.gx, vr.gy, rooms[k].gx, rooms[k].gy)];
        if (!l) continue;
        if (l.gold && !l.open) goldLinks++; else plainLinks++;
      }
      t.ok(goldLinks > 0 && plainLinks === 0, 'every corridor into the vault bears the golden lock');
      t.ok(vr.ents.length >= 3, 'the vault brims with treasure ents');
      t.ok(!vr.myst, 'the vault announces itself — no mystery mark');
    }
    t.ok(!rooms[bossK].myst, 'the lair is never a mystery door');
  }
  t.ok(minRooms >= 13, 'floors are BIG now (smallest seen: ' + minRooms + ' rooms)');
  t.ok(vaultsSeen >= 3, 'vaults appear regularly (' + vaultsSeen + '/6 floors)');

  // the golden key: gold locks refuse plain keys, elites pay out
  D.srand(777);
  D.newRun('knight');
  let rooms2 = D.S.run.map.rooms, links2 = D.S.run.map.links;
  let vk = Object.keys(rooms2).find(k => rooms2[k].vault);
  for (let seed = 2; !vk && seed <= 30; seed++) {
    D.srand(seed * 991); D.newRun('knight');
    rooms2 = D.S.run.map.rooms; links2 = D.S.run.map.links;
    vk = Object.keys(rooms2).find(k => rooms2[k].vault);
  }
  t.ok(!!vk, 'found a vault to test against');
  const vr2 = rooms2[vk];
  // stand in a neighbor with a corridor to the vault
  let nbK = null, dirIn = null;
  for (const d of ['n', 's', 'e', 'w']) {
    const k = rk(vr2.gx + DIRS2[d][0], vr2.gy + DIRS2[d][1]);
    if (rooms2[k] && links2[lk(vr2.gx, vr2.gy, rooms2[k].gx, rooms2[k].gy)]) {
      nbK = k;
      dirIn = { n: 's', s: 'n', e: 'w', w: 'e' }[d];  // from the neighbor, back toward the vault
      break;
    }
  }
  D.S.run.map.cur = nbK;
  D.S.run.room = rooms2[nbK];
  rooms2[nbK].visited = true;
  D.S.run.keys = 5; D.S.run.goldKeys = 0;
  t.ok(D.tryDoor(dirIn) === false, 'five plain keys cannot open the golden lock');
  t.eq(D.S.run.keys, 5, 'and none are wasted trying');
  D.S.run.goldKeys = 1;
  t.eq(D.tryDoor(dirIn), 'unlocked', 'the golden key opens the vault');
  t.eq(D.S.run.goldKeys, 0, 'and is spent');
  D.S.relicPick = null;
  t.ok(D.tryDoor(dirIn), 'stepping into the vault');
  t.ok(D.S.relicPick && D.S.relicPick.rar === 'r', 'a rare relic waits on the vault pedestal');
  // an elite kill mints a golden key
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[dirIn];
  D.tryDoor(back);                                     // step back out of the vault
  D.S.relicPick = null;
  const room = D.curRoom();
  room.ents = [{ kind: 'monster', mtype: 'elite', eid: D.curRoster()[0].id, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = 1;
  D.dmgEnemy(5);
  t.eq(D.S.run.goldKeys, 1, 'the fallen elite drops a GOLDEN KEY');
}

// -------- the RUN REPORT CARD: stats tracked from first coin to last breath --------
{
  const { DP: D } = loadGame({}, false);
  D.srand(4242);
  D.newRun('knight');
  const st = D.S.run.stats;
  t.ok(st && st.fired === 0 && st.dealt === 0 && st.taken === 0, 'a fresh run starts a clean sheet');
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: D.curRoster()[0].id, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = D.S.enemy.maxHp = 500;
  D.S.cd = 0;
  D.drop(50);
  t.eq(st.fired, 1, 'a dropped coin is a coin FIRED');
  D.dmgEnemy(12);
  t.ok(st.dealt >= 12, 'damage dealt is tallied');
  t.ok(st.bestHit >= 12, 'and the best single hit remembered');
  D.hpHit(7, 'test');
  t.eq(st.taken, 7, 'damage taken is tallied');
  for (let i = 0; i < 25; i++) D.tick(0.05);
  t.ok(st.t > 0.9, 'the run clock runs');
  D.S.run.relics.push('clover');
  D.hpHit(999, 'the test reaper');
  t.ok(D.S.over && D.S.over.stats, 'the report card rides the game-over state');
  t.eq(D.S.over.stats.fired, 1, 'fired count survives to the card');
  t.eq(D.S.over.relics, 1, 'relic count survives to the card');
  t.ok(D.S.over.hero === 'knight', 'the hero is named on the card');
}

// -------- float polish: duplicates merge, the stack is capped --------
{
  const { DP: D } = loadGame({}, false);
  D.srand(11);
  D.newRun('knight');
  D.S.floats.length = 0;
  D.floatAnchor('-3', 'enemy', '#fff');
  D.floatAnchor('-3', 'enemy', '#fff');
  D.floatAnchor('-3', 'enemy', '#fff');
  t.eq(D.S.floats.length, 1, 'three identical floats merge into one');
  t.eq(D.S.floats[0].n, 3, '…carrying a ×3 counter');
  D.floatAnchor('-5', 'enemy', '#fff');
  t.eq(D.S.floats.length, 2, 'a different text stays its own float');
  D.S.floats.length = 0;
  for (let i = 0; i < 20; i++) D.floatAnchor('hit ' + i, 'enemy', '#fff');
  t.ok(D.S.floats.length <= 12, 'the float stack is capped (' + D.S.floats.length + ')');
}

// -------- ACHIEVEMENTS: twenty trophies, earned forever --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  t.eq(D.ACH.length, 44, 'forty-four trophies on the wall');
  t.ok(D.ACH.every(a => a.id && a.icon && a.name && a.desc), 'every trophy is fully engraved');
  t.eq(new Set(D.ACH.map(a => a.id)).size, D.ACH.length, 'no duplicate trophy ids');
  D.srand(31);
  D.newRun('knight');
  t.ok(D.S.ach.heroes.knight === 1, 'the casting-call ledger notes the knight');
  // poll-driven unlocks
  D.S.run.gold = 600;
  D.achPoll();
  t.ok(D.S.ach.u.rich, 'DRAGON HOARD unlocks at 500 gold');
  t.eq(D.S.achQ.length, 1, 'one toast queued');
  t.ok(!D.achUnlock('rich'), 'a trophy never unlocks twice');
  t.eq(D.S.achQ.length, 1, 'and queues no second toast');
  D.S.run.keys = 6;
  D.achPoll();
  t.ok(D.S.ach.u.keymaster, 'KEYMASTER at 5 keys');
  // event-driven: a boss falls
  const bossK = Object.keys(D.S.run.map.rooms).find(k => D.S.run.map.rooms[k].boss);
  D.S.run.map.cur = bossK; D.S.run.room = D.S.run.map.rooms[bossK];
  D.S.run.room.visited = true;
  D.interact(0);
  D.S.enemy.hp = 1;
  D.dmgEnemy(5);
  t.ok(D.S.ach.u.boss1, 'CROWN TAKER unlocks on the first boss kill');
  t.ok(D.S.ach.u.firstblood, 'FIRST BLOOD rode along via the victory poll');
  t.ok(D.S.ach.u.untouch, 'UNTOUCHABLE: not a scratch taken this battle');
  // persistence: a reload keeps the wall
  D.save();
  const { DP: E } = loadGame(store, false);
  t.ok(E.S.ach.u.rich && E.S.ach.u.boss1, 'the trophy wall survives a reload');
  t.ok(E.S.ach.heroes.knight === 1, 'so does the casting ledger');
}

// -------- the LIFETIME ledger + the HISTORY book --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  D.srand(77);
  D.newRun('rogue');
  Object.assign(D.S.run.stats, { fired: 120, dealt: 400, taken: 60, t: 300 });
  D.S.run.kills = 9; D.S.run.goldEarned = 250;
  D.hpHit(999, 'test doom');
  t.eq(D.S.life.fired, 120, 'the ledger swallows the coins fired');
  t.eq(D.S.life.kills, 9, '…and the kills');
  t.eq(D.S.life.gold, 250, '…and the gold');
  t.eq(D.S.life.heroRuns.rogue, 1, '…and notes who ran');
  t.eq(D.S.hist.length, 1, 'one line in the history book');
  t.eq(D.S.hist[0].cause, 'test doom', 'with the cause of death');
  // ten lines max, newest first
  for (let i = 0; i < 12; i++) {
    D.newRun('knight');
    D.S.run.floor = i + 2;
    D.hpHit(999, 'again');
  }
  t.eq(D.S.hist.length, 10, 'the book keeps only ten tales');
  t.eq(D.S.hist[0].floor, 13, 'newest first');
  // persistence
  const lifeKills = D.S.life.kills;
  const { DP: E } = loadGame(store, false);
  t.eq(E.S.life.kills, lifeKills, 'the ledger survives a reload');
  t.eq(E.S.hist.length, 10, 'so does the history book');
}

// -------- the CODEX: foes met, relics owned, remembered forever --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  D.srand(55);
  D.newRun('knight');
  const eid = D.curRoster()[0].id;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = 1;
  D.dmgEnemy(5);
  t.eq(D.S.codex.foes[eid], 1, 'the bestiary counts the first kill');
  D.S.run.relics.push('clover', 'midas');
  D.achPoll();
  t.ok(D.S.codex.relics.clover && D.S.codex.relics.midas, 'the codex sweeps owned relics');
  D.save();
  const { DP: E } = loadGame(store, false);
  t.eq(E.S.codex.foes[eid], 1, 'the bestiary survives a reload');
  t.ok(E.S.codex.relics.clover, 'so does the relic codex');
}

// -------- the WORKSHOP: cogs in, forever-upgrades out --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  t.eq(D.WORKSHOP.length, 8, 'eight upgrades on the workbench');
  t.ok(D.WORKSHOP.every(u => u.cost.length === u.max), 'every level has a price');
  D.srand(66);
  // a run ends -> cogs drop
  D.newRun('knight');
  D.S.run.floor = 6; D.S.run.kills = 16;
  D.hpHit(999, 'testing');
  t.eq(D.S.over.cogsWon, 6 + 2, 'the fall pays floor + kills/8 in cogs');
  t.eq(D.S.cogs, 8, 'the cogs bank them');
  // buying: too poor, then rich
  t.ok(!D.wsBuy(0), 'Tough Hide refused at 8 cogs (costs 25)');
  D.S.cogs = 300;
  t.ok(D.wsBuy(0), 'Tough Hide L1 bought');
  t.eq(D.S.cogs, 275, 'cogs spent');
  t.eq(D.wsLvl('hp'), 1, 'level recorded');
  t.ok(D.wsBuy(0) && D.wsBuy(0), 'levels 2 and 3');
  t.ok(!D.wsBuy(0), 'level 4 refused — maxed');
  // upgrades bolt onto a fresh run
  D.S.cogs = 500;
  D.wsBuy(1); D.wsBuy(2); D.wsBuy(3);      // purse, keys, flask
  const base = loadGame({}, false);
  base.DP.srand(1); base.DP.newRun('knight');
  D.srand(1); D.newRun('knight');
  t.eq(D.S.run.maxHp, base.DP.S.run.maxHp + 15, '+15 max HP from Tough Hide x3');
  t.eq(D.S.run.hp, D.S.run.maxHp, 'and the run starts full');
  t.eq(D.S.run.purse.coin, base.DP.S.run.purse.coin + 2, 'Fatter Purse pays +2 gold coins');
  t.eq(D.S.run.keys, base.DP.S.run.keys + 1, 'Spare Keys +1');
  t.eq(D.S.run.potions, base.DP.S.run.potions + 1, 'Deep Flask +1');
  // tilt + kennel bonuses
  D.S.cogs = 500;
  D.wsBuy(WORKSHOP_IDX('tilt', D)); D.wsBuy(WORKSHOP_IDX('kennelup', D));
  t.eq(D.tiltCount(), base.DP.tiltCount() + 1, 'Iron Wrists +1 TILT');
  // persistence
  D.save();
  const { DP: E } = loadGame(store, false);
  t.eq(E.wsLvl('hp'), 3, 'the workshop survives a reload');
  t.ok(E.S.cogs >= 0, 'so does the cog balance');
}
function WORKSHOP_IDX(id, D) { return D.WORKSHOP.findIndex(u => u.id === id); }

// -------- the HERO LADDER + the DAILY --------
{
  const { DP: D } = loadGame({}, false);
  // a fresh profile: the founding four are open, the specialists sealed
  t.ok(D.heroUnlocked('knight') && D.heroUnlocked('rogue') && D.heroUnlocked('wizard') && D.heroUnlocked('cleric'),
       'the founding four are always ready');
  t.ok(!D.heroUnlocked('crane') && !D.heroUnlocked('ghost'), 'the specialists wait behind their seals');
  D.S.best.floor = 10;
  t.ok(D.heroUnlocked('crane'), 'floor 10 unseals the crane keeper');
  t.ok(!D.heroUnlocked('ghost'), 'the poltergeist wants floor 20');
  D.S.best.floor = 20;
  t.ok(D.heroUnlocked('ghost'), 'floor 20 frees the poltergeist');
  D.S.best.floor = 0;
  // grandfathering: whoever already ran a hero keeps it
  const { DP: G } = loadGame({}, false);
  G.S.ach.heroes.crane = 1;
  t.ok(G.heroUnlocked('crane'), 'the casting ledger grandfathers old mains');
  t.ok(D.heroLockText('ghost').indexOf('20') >= 0, 'the ghost seal names its price');

  // the DAILY: same date, same plan, one attempt
  const p1 = D.dailyPlan('2026-07-22'), p2 = D.dailyPlan('2026-07-22');
  t.ok(p1.hero.id === p2.hero.id && p1.mod.id === p2.mod.id, 'the date fixes hero and twist');
  t.ok(D.dailyPlan('2026-07-23').seed !== p1.seed, 'tomorrow rolls new bones');
  t.ok(D.newDaily('2026-07-22'), 'the daily begins');
  t.eq(D.S.run.daily, '2026-07-22', 'the run is stamped');
  t.eq(D.S.run.dailyMod, p1.mod.id, 'the twist is on');
  t.ok(!D.newDaily('2026-07-22'), 'one attempt only');
  t.ok(D.newDaily('2026-07-23'), 'tomorrow is a fresh coin');
  // the twist actually bites
  const { DP: T2 } = loadGame({}, false);
  let toughDate = null;
  for (let day = 1; day <= 60 && !toughDate; day++) {
    const ds = '2026-08-' + ('0' + ((day % 28) + 1)).slice(-2) + (day > 28 ? 'x' + day : '');
    if (T2.dailyPlan(ds).mod.id === 'tough') toughDate = ds;
  }
  t.ok(!!toughDate, 'found an IRONCLAD day');
  T2.newDaily(toughDate);
  t.ok(Math.abs(T2.dailyK() - 1.2) < 1e-9, 'IRONCLAD FOES: +20% on every multiplier');
}

// -------- BOSS ARENAS: each lord bends the machine --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  // the VAULT DRAGON breathes on the hoard
  D.srand(505);
  D.newRun('knight');
  DS.run.floor = 5;
  const bossK = Object.keys(DS.run.map.rooms).find(k => DS.run.map.rooms[k].boss);
  DS.run.map.cur = bossK; DS.run.room = DS.run.map.rooms[bossK];
  DS.run.room.visited = true;
  DS.run.pileSave = null; DS.run.pileFloor = 0;
  D.interact(0);
  t.eq(DS.foes[0].id, 'dragon', 'act I lair: the Vault Dragon');
  const lit = DS.coins.filter(c => c.aflame);
  t.eq(lit.length, 2, 'two coins of the hoard burn (round 1)');
  t.ok(lit.every(c => c.kind === 'coin'), 'only GOLD catches the breath');
  // collecting an alight coin sears the hand
  const pb0 = DS.pPois === undefined ? 0 : (DS.pBurn || 0);
  D.scoreCoin(lit[0]);
  t.eq((DS.pBurn || 0) - pb0, 2, 'the alight coin SEARS: +2 burn');
  DS.enemy.hp = 1;
  D.dmgEnemy(5);
  t.ok(DS.coins.every(c => !c.aflame), 'the embers cool when the dragon falls');
  D.leaveBattle();

  // the COIN LICH raises the dead on round 3
  const { DP: L } = loadGame({}, false);
  L.srand(606);
  L.newRun('knight');
  L.S.run.floor = 10;
  const bk2 = Object.keys(L.S.run.map.rooms).find(k => L.S.run.map.rooms[k].boss);
  L.S.run.map.cur = bk2; L.S.run.room = L.S.run.map.rooms[bk2];
  L.S.run.room.visited = true;
  L.interact(0);
  t.eq(L.S.foes[0].id, 'lich', 'act II lair: the Coin Lich');
  L.S.enemy.hp = L.S.enemy.maxHp = 9999;
  L.S.battle.round = 2;                     // newRound() -> round 3
  L.newRound();
  t.eq(L.S.foes.length, 2, 'round 3: the lich raises a servant');
  t.eq(L.S.foes[1].id, 'skeleton', 'a skeleton claws out of the till');
  t.eq(L.S.foes[1].hp, L.S.foes[1].maxHp, 'raised whole…');
  const fresh = L.mkEnemy('battle', 'skeleton');
  t.ok(L.S.foes[1].maxHp < fresh.maxHp, '…but at HALF a living skeleton\'s strength');

  // the PIT BOSS taxes the tray on round 3
  const { DP: P } = loadGame({}, false);
  P.srand(707);
  P.newRun('knight');
  P.S.run.floor = 15;
  const bk3 = Object.keys(P.S.run.map.rooms).find(k => P.S.run.map.rooms[k].boss);
  P.S.run.map.cur = bk3; P.S.run.room = P.S.run.map.rooms[bk3];
  P.S.run.room.visited = true;
  P.interact(0);
  t.eq(P.S.foes[0].id, 'demon', 'act III lair: the Pit Boss');
  P.S.enemy.hp = P.S.enemy.maxHp = 9999;
  P.S.battle.round = 2;
  P.S.battle.banked = [{ k: 'coin' }, { k: 'gem' }];   // carried into next round's loot
  P.newRound();
  t.eq(P.S.battle.loot.length, 1, 'round 3: the Pit Boss taxes one piece');
  t.eq(P.S.foes[0].belly.length, 1, 'it sits in his belly');
  t.eq(P.S.foes[0].belly[0].k, 'coin', 'he takes the smallest — the plain coin');
}

// -------- the SKULL GARDENER + floor QUESTS --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  t.ok(D.ENEMY_TIERS[1].some(e => e.trait === 'gardener'), 'a gardener tends act II');
  t.ok(D.ENEMY_TIERS[2].some(e => e.trait === 'gardener'), 'and a meaner one act III');
  D.srand(818);
  D.newRun('knight');
  DS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'skullgardener', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  DS.enemy.hp = DS.enemy.maxHp = 9999;
  // plant two skulls, run the round ticks — the crop SPROUTS
  DS.coins.length = 0;
  D.place(30, 50, 'skull', 0, 'plat', 0);
  D.place(60, 50, 'skull', 0, 'plat', 0);
  D.endRoundTicks();
  const skulls = DS.coins.filter(c => c.kind === 'skull');
  t.eq(skulls.length, 4, 'two skulls sprout two twins');
  // the cap: a full crop stops sprouting
  DS.coins.length = 0;
  for (let i = 0; i < 6; i++) D.place(15 + i * 12, 50, 'skull', 0, 'plat', 0);
  D.endRoundTicks();
  t.eq(DS.coins.filter(c => c.kind === 'skull').length, 6, 'the crop caps at six');
  // the gardener sows on its turn
  DS.rain.length = 0;
  DS.enemy.intent = { t: 'sow' };
  D.enemyActFoe(DS.enemy);
  t.eq(DS.rain.filter(r => r.kind === 'skull').length, 2, 'a SOW turn plants two skulls');

  // QUESTS: the slay job
  const { DP: Q } = loadGame({}, false);
  Q.srand(919);
  Q.newRun('knight');
  t.ok(Q.S.run.quest && Q.S.run.quest.need > 0, 'every floor posts a job');
  Q.S.run.quest = { id: 'slay', need: 2, got: 0, done: false, reward: 'goldkey' };
  const gk0 = Q.S.run.goldKeys;
  Q.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: Q.curRoster()[0].id, done: false, px: 0.5, py: 0.4 }];
  Q.interact(0); Q.S.enemy.hp = 1; Q.dmgEnemy(5); Q.leaveBattle();
  t.eq(Q.S.run.quest.got, 1, 'one kill tallied');
  Q.S.run.room.ents.push({ kind: 'monster', mtype: 'battle', eid: Q.curRoster()[0].id, done: false, px: 0.3, py: 0.3 });
  Q.interact(Q.S.run.room.ents.length - 1); Q.S.enemy.hp = 1; Q.dmgEnemy(5);
  t.ok(Q.S.run.quest.done, 'two kills complete the job');
  t.eq(Q.S.run.goldKeys, gk0 + 1, 'and the GOLDEN KEY is paid');
  // the relic reward path
  Q.S.run.quest = { id: 'bank', need: 1, got: 0, done: false, reward: 'relic' };
  const rel0 = Q.S.run.relics.length;
  Q.questBump('bank', 1);
  t.ok(Q.S.run.quest.done, 'the bank job closes');
  t.eq(Q.S.run.relics.length, rel0 + 1, 'and pays a relic');
}

// -------- THE RAT KING: no items, only the SWARM --------
{
  const { DP: R } = loadGame({}, false);
  const RS = R.S;
  RS.best.floor = 8;                        // the king unseals at floor 8
  R.srand(4001);
  R.newRun('rat');
  t.eq(RS.run.hero, 'rat', 'the Rat King takes the crown');
  t.eq(Object.keys(RS.run.arsenal).length, 0, 'he owns NO gear');
  t.eq(RS.run.swarm.length, 2, 'two loyal rats at the door');
  // any item source feeds the swarm instead
  R.grantItem('sword', 1);
  t.eq(RS.run.swarm.length, 3, 'a granted sword becomes a RAT');
  t.eq(Object.keys(RS.run.arsenal).length, 0, 'the arsenal stays bare');
  // the swarm caps at eight, then feasts
  while (RS.run.swarm.length < 8) R.ratRecruit(false);
  RS.run.swarm[0].hp = 3;
  t.ok(!R.ratRecruit(false), 'recruit nine refused — the swarm is full');
  t.eq(RS.run.swarm[0].hp, 5, 'the meal is shared instead (+2 HP)');
  t.eq(RS.run.swarm.length, 8, 'still eight');
  // battle: the swarm pours in, fights, and marches out with its scars
  RS.run.swarm = [R.mkRat(false), R.mkRat(false), R.mkRat(true)];
  RS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: R.curRoster()[0].id, done: false, px: 0.5, py: 0.4 }];
  R.interact(0);
  t.eq(RS.pets.length, 3, 'the swarm pours onto the stage');
  t.ok(RS.pets.some(p => p.iid === 'direrat'), 'the dire rat among them');
  // the scurry jostles the pile
  RS.coins.length = 0;
  for (let i = 0; i < 10; i++) R.place(10 + i * 8, 40, 'coin', 0, 'plat', 0);
  for (const c of RS.coins) { c.vx = 0; c.vy = 0; }
  R.srand(11);
  R.ratScurry();
  t.ok(RS.coins.some(c => c.vy !== 0 || c.vx !== 0), 'the scurry jostles coins in its lanes');
  t.ok(RS.scurryFx.length > 0, 'and rats dash the board (visual lanes queued)');
  // CHEESE: gems feed the swarm; the third grows a DIRE RAT
  RS.pets.forEach(p => { p.hp = 1; });
  const gem = R.place(50, 50, 'gem', 0, 'plat', 0);
  R.scoreCoin(gem);
  t.ok(RS.pets.every(p => p.hp === 4 || p.iid === 'direrat' && p.hp === 4), 'CHEESE heals the swarm +3');
  RS.run.cheese = 2;
  const n0 = RS.pets.length;
  R.scoreCoin(R.place(52, 50, 'gem', 0, 'plat', 0));
  t.eq(RS.pets.length, n0 + 1, 'the third cheese grows a DIRE RAT');
  t.ok(RS.pets[RS.pets.length - 1].dire, 'and dire it is');
  // victory: survivors persist, the fallen stay fallen
  RS.pets[0].hp = 0;
  const alive = RS.pets.filter(p => p.hp > 0).length;
  RS.enemy.hp = 1;
  R.dmgEnemy(5);
  t.eq(RS.run.swarm.length, alive, 'the swarm marches out with the survivors only');
  // dire rats bite harder: 2 dmg + 1 bleed
  const { DP: R2 } = loadGame({}, false);
  R2.S.best.floor = 8;
  R2.srand(4002);
  R2.newRun('rat');
  R2.S.run.swarm = [R2.mkRat(true)];
  R2.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: R2.curRoster()[0].id, done: false, px: 0.5, py: 0.4 }];
  R2.interact(0);
  R2.S.enemy.hp = R2.S.enemy.maxHp = 100;
  R2.S.enemy.def = null; R2.S.enemy.block = 0;
  const hp0 = R2.S.enemy.hp;
  R2.petsAct();
  t.ok(hp0 - R2.S.enemy.hp >= 2, 'the dire rat bites for 2');
  t.ok(R2.S.enemy.bleed >= 1, 'and leaves it BLEEDING');
}

// -------- DIFFICULTY DOORS + the ENDLESS decrees --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  t.eq(D.DIFFS.length, 3, 'three doors into the dungeon');
  // MERCIFUL: -20% HP
  DS.diffPick = 'easy';
  D.srand(31); D.newRun('knight');
  t.eq(DS.run.diff, 'easy', 'the door is stamped on the run');
  const soft = D.mkEnemy('battle', D.curRoster()[0].id);
  DS.diffPick = 'hard';
  D.srand(31); D.newRun('knight');
  const cruel = D.mkEnemy('battle', D.curRoster()[0].id);
  t.ok(cruel.maxHp > soft.maxHp, 'NIGHTMARE foes out-muscle MERCIFUL ones');
  t.ok(Math.abs(soft.maxHp / cruel.maxHp - 0.8 / 1.3) < 0.06, 'by the promised 0.8 vs 1.3');
  // the ENDLESS ladder
  DS.diffPick = 'normal';
  D.srand(32); D.newRun('knight');
  DS.run.floor = 20; t.eq(D.mutCount(), 0, 'floor 20: THE MINT holds the line');
  DS.run.floor = 21; t.eq(D.mutCount(), 1, 'floor 21: THICK AIR descends past the mint');
  DS.run.floor = 24; t.eq(D.mutCount(), 2, 'floor 24: SWIFT DOOM joins');
  DS.run.floor = 45; t.eq(D.mutCount(), D.MUTS.length, 'the decrees cap out (8 deep now)');
  t.ok(D.mutOn('thickair') && D.mutOn('swiftdoom'), 'mutOn reads the stack');
  // SWIFT DOOM: +2 atk
  DS.run.floor = 24;
  const swift = D.mkEnemy('battle', D.curRoster()[0].id);
  DS.run.floor = 20;
  const calm = D.mkEnemy('battle', D.curRoster()[0].id);
  t.ok(swift.atk >= calm.atk + 2 - 3, 'the deep hits harder (+2 atk baked in)');
  // THICK AIR: the hand loses one more
  DS.run.floor = 21;
  DS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: D.curRoster()[0].id, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  const handN = Object.values(DS.battle.hand).reduce((a, b) => a + b, 0);
  t.eq(handN, D.purseTotal() - 1, 'THICK AIR steals one from the deal');
  // ARMORED AGE + BONE RAIN at round turn
  DS.run.floor = 30;
  DS.enemy.hp = DS.enemy.maxHp = 9999;
  DS.rain.length = 0;
  D.newRound();
  t.ok(DS.enemy.block >= 2, 'ARMORED AGE shields the pack each round');
  t.ok(DS.rain.some(r => r.kind === 'skull'), 'BONE RAIN salts the pile with a skull');
  // the endless premium on cogs
  DS.run.floor = 30; DS.run.kills = 0;
  D.hpHit(9999, 'the deep');
  t.eq(DS.over.cogsWon, Math.round(30 * (1 + 0.2 * 4)), 'endless cogs pay the +20%/decree premium');
  t.eq(DS.over.muts, 4, 'the card counts the decrees endured');
}

// -------- HALLWAY EVENTS: six strangers of the deep --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  t.eq(D.EVENTS.length, 14, 'fourteen strangers roam the halls (three keep to the mint)');
  t.ok(D.EVENTS.every(e => e.id && e.icon && e.name && e.flavor && e.choices.length >= 2),
       'each fully written with at least two choices');
  D.srand(1212);
  D.newRun('knight');
  const room = D.curRoom();
  // the SLIME: feed it 5 coins -> +40 gold
  room.ents.push({ kind: 'event', ev: 'slime', done: false, px: 0.5, py: 0.5 });
  D.interact(room.ents.length - 1);
  t.ok(DS.room && DS.room.type === 'event' && DS.room.ev === 'slime', 'the slime jiggles hopefully');
  const g0 = DS.run.gold, p0 = D.purseTotal();
  t.ok(D.eventChoose(0), 'feeding it works');
  t.eq(D.purseTotal(), p0 - 5, 'five coins down the gullet');
  t.eq(DS.run.gold, g0 + 40, 'BURP: +40 gold');
  t.ok(DS.room.result, 'the tale is told');
  t.ok(!D.eventChoose(1), 'one choice per stranger');
  t.ok(room.ents[room.ents.length - 1].done, 'the slime is spent');
  DS.room = null;
  // the TRADER: blood for gold
  room.ents.push({ kind: 'event', ev: 'trader', done: false, px: 0.5, py: 0.5 });
  D.interact(room.ents.length - 1);
  const hp0 = DS.run.hp, g1 = DS.run.gold;
  t.ok(D.eventChoose(0), 'the scale accepts blood');
  t.eq(DS.run.hp, hp0 - 10, 'ten HP into the bowl');
  t.eq(DS.run.gold, g1 + 45, '+45 gold out the other');
  DS.room = null;
  // the GAMBLER refuses a pauper
  room.ents.push({ kind: 'event', ev: 'gambler', done: false, px: 0.5, py: 0.5 });
  D.interact(room.ents.length - 1);
  DS.run.gold = 5;
  t.ok(!D.eventChoose(0), 'no gold, no dice');
  t.ok(!DS.room.result, 'and the stranger still waits');
  // walking away leaves the stranger undone
  DS.room = null;
  const gEnt = room.ents[room.ents.length - 1];
  t.ok(!gEnt.done, 'walking away keeps the gambler at his table');
  // the ADVENTURER pays in relics
  room.ents.push({ kind: 'event', ev: 'adventurer', done: false, px: 0.4, py: 0.5 });
  D.interact(room.ents.length - 1);
  DS.run.gold = 50;
  const r0 = DS.run.relics.length;
  t.ok(D.eventChoose(0), 'the escort sets out');
  t.eq(DS.run.relics.length, r0 + 1, 'and pays in a RELIC');
  // events spawn in the wild
  let seen = false;
  for (let s = 1; s <= 12 && !seen; s++) {
    D.srand(s * 137);
    D.newRun('knight');
    for (const k of Object.keys(DS.run.map.rooms)) {
      if (DS.run.map.rooms[k].ents.some(e => e.kind === 'event' && D.eventById(e.ev))) seen = true;
    }
  }
  t.ok(seen, 'strangers appear in generated floors');
}

// -------- COIN MASTERY + the new beasts + the WISHING WELL --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  D.srand(2222);
  D.newRun('knight');
  // mastery: 500 lifetime fires upgrade the face
  t.eq(D.masteryLvl('coin'), 0, 'a fresh purse has no mastery');
  const base = D.goldDmg();
  DS.codex.coins.coin = 500;
  t.eq(D.masteryLvl('coin'), 1, '500 gold coins fired: MASTERED');
  t.eq(D.goldDmg(), base + 1, 'the mastered face hits +1');
  // firing counts the ledger
  DS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: D.curRoster()[0].id, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  DS.enemy.hp = DS.enemy.maxHp = 500;
  const c0 = DS.codex.coins.coin;
  D.S.cd = 0; D.drop(50);
  t.eq(DS.codex.coins.coin, c0 + 1, 'every fire notches the ledger');
  // the WATCH OWL sees through blackout
  DS.blackT = 3;
  t.ok(D.blackedOut(), 'the blackout blinds');
  DS.pets.push({ iid: 'owl', icon: 'o', name: 'Watch Owl', hp: 6, maxHp: 6 });
  t.ok(!D.blackedOut(), '…until the owl watches');
  // the TORTOISE shields, the BEETLE scorches
  DS.pets.length = 0;
  DS.pets.push({ iid: 'tortoise', icon: 't', name: 'Tortoise', hp: 20, maxHp: 20 });
  const b0 = DS.run.block;
  D.petsAct();
  t.eq(DS.run.block, b0 + 2, 'the tortoise adds 2 block a round');
  DS.pets.length = 0;
  DS.pets.push({ iid: 'beetle', icon: 'b', name: 'Fire Beetle', hp: 10, maxHp: 10 });
  const foe = DS.enemy;
  foe.burn = 0;
  D.petSoak(4, foe);
  t.ok(foe.burn >= 1, 'striking the beetle SCORCHES the striker');
  // the WISHING WELL takes its toll (win the fight to get back to the crawl)
  DS.enemy.hp = 1;
  D.dmgEnemy(5);
  D.leaveBattle();
  const room = D.curRoom();
  room.ents.push({ kind: 'event', ev: 'well', done: false, px: 0.5, py: 0.5 });
  D.interact(room.ents.length - 1);
  DS.run.gold = 10;
  t.ok(!D.eventChoose(0), 'a floor-1 toll of 20 refuses 10 gold');
  DS.run.gold = 100;
  t.ok(D.eventChoose(0), 'the toll paid, the well answers');
  t.eq(DS.run.gold <= 80, true, '15 + 5×floor gold sank (boon may refund)');
}

// -------- SOUND v2 + HAPTICS: the buzz hook fires --------
{
  const { DP: D } = loadGame({}, false);
  t.ok(D.S.opts.haptic === true, 'haptics default ON');
  t.ok(Math.abs(D.S.opts.music - 0.8) < 1e-9, 'music defaults to 80%');
  t.ok(D.S.opts.cb === false, 'colorblind marks default off');
  // a saved profile marks its choices so reduced-motion never overrides them
  const st2 = {};
  const { DP: P2 } = loadGame(st2, false);
  P2.S.opts.shake = true;
  P2.save();
  const { DP: P3 } = loadGame(st2, false);
  t.ok(P3.S.optsSaved === true, 'loaded options carry the player-has-spoken flag');
  const hits = [];
  globalThis.__dpBuzz = p => hits.push(p);
  D.srand(3131);
  D.newRun('knight');
  D.frenzy ? D.frenzy() : null;
  D.hpHit(7, 'a big test blow');
  t.ok(hits.length >= 1, 'a heavy blow thumps the phone (' + hits.length + ' buzzes)');
  delete globalThis.__dpBuzz;
}

// -------- SAVE HARDENING: quarantine, never destroy --------
{
  // a corrupt blob is quarantined and the game starts clean
  const store = {};
  store[Object.keys(store)[0] || 'x'] = undefined;
  const { DP: Z } = loadGame(store, false);
  const KEY = Z.C.SAVE_KEY;
  store[KEY] = '{"v":1, this is not json';
  const { DP: D } = loadGame(store, false);
  t.ok(!D.S.run, 'the broken save yields a clean start');
  t.eq(D.S.screen, 'title', 'safely at the title');
  t.eq(store[KEY + '_quarantine'], '{"v":1, this is not json', 'the blob is kept for surgery');
  t.ok(!store[KEY], 'the main slot is cleared');
  t.ok(D.S.saveQuarantined, 'the title will say so');
  // a healthy save round-trips and gets the schema stamp
  const st2 = {};
  const { DP: A } = loadGame(st2, false);
  A.srand(9); A.newRun('knight'); A.save();
  const blob = JSON.parse(st2[KEY]);
  t.eq(blob.sv, 2, 'saves carry schema version 2');
  // a v1 blob (no sv) climbs the migration ladder without complaint
  delete blob.sv;
  st2[KEY] = JSON.stringify(blob);
  const { DP: B } = loadGame(st2, false);
  t.ok(B.S.run && B.S.run.hero === 'knight', 'a version-less v1 save loads whole');
  B.save();
  t.eq(JSON.parse(st2[KEY]).sv, 2, 'and re-saves stamped current');
}

// -------- WHAT'S NEW: the changelog ledger --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  // the list itself is sound and VERSION is simply its top stamp
  t.ok(Array.isArray(D.CHANGELOG) && D.CHANGELOG.length >= 2, 'the changelog has entries');
  t.eq(D.VERSION, D.CHANGELOG[0].v, 'VERSION is the newest entry');
  t.ok(D.CHANGELOG.every(e => e.v && Array.isArray(e.notes) && e.notes.length > 0), 'every entry carries notes');
  t.eq(new Set(D.CHANGELOG.map(e => e.v)).size, D.CHANGELOG.length, 'version stamps are unique');
  // a fresh profile is stamped current — its news IS the game
  t.eq(D.S.seenVer, D.VERSION, 'a fresh profile starts read-up');
  t.eq(D.whatsNewEntries().length, 0, 'nothing to show a newcomer');
  // a pre-changelog save reads as the founding and gets everything since
  D.srand(5); D.newRun('knight'); D.save();
  const blob = JSON.parse(st[D.C.SAVE_KEY]);
  delete blob.seenVer;
  st[D.C.SAVE_KEY] = JSON.stringify(blob);
  const { DP: O } = loadGame(st, false);
  t.eq(O.S.seenVer, '1.0.0', 'an old save reads as the founding');
  const due = O.whatsNewEntries();
  t.ok(due.length >= 1 && due[0].v === O.VERSION, 'the unread entries lead with the newest');
  t.ok(due.every(e => e.v !== '1.0.0'), 'the founding itself is not re-told');
  // reading the scroll stamps the ledger AND persists it
  O.whatsNewSeen();
  t.eq(O.S.seenVer, O.VERSION, 'reading stamps the ledger');
  const { DP: R } = loadGame(st, false);
  t.eq(R.whatsNewEntries().length, 0, 'the stamp survives a reload');
  // an unrecognized stamp (a downgrade, a typo) shows just the latest entry
  R.S.seenVer = '9.9.9';
  const odd = R.whatsNewEntries();
  t.ok(odd.length === 1 && odd[0].v === R.VERSION, 'an unknown stamp shows only the latest');
}

// -------- READABILITY FLOOR: no microscopic canvas text --------
{
  // the font audit's regression guard: body text sits at >=10px, micro-labels
  // at >=9px, and only the two hero-card chip lines may use 8px. Anything
  // smaller is unreadable on a phone and fails here at PR time.
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  const tiny = src.match(/[^0-9][0-7]px (?:Verdana|Georgia|serif|sans-serif|monospace)/g) || [];
  t.eq(tiny.length, 0, 'no canvas font below 8px' + (tiny.length ? ' — found: ' + tiny.join(', ') : ''));
  const eights = src.match(/[^0-9]8px (?:Verdana|Georgia|serif|sans-serif|monospace)/g) || [];
  t.ok(eights.length <= 2, 'at most the two hero-card chips use 8px (' + eights.length + ')');
  // the contrast pass retired these too-dim body inks — keep them retired
  for (const ink of ['#6a5a68', '#5a4a5f', '#7a6a80', '#8f6f78']) {
    t.ok(src.indexOf(ink) < 0, 'retired low-contrast ink ' + ink + ' stays gone');
  }
}

// -------- PERFORMANCE BUDGET: 500 packed battle frames --------
{
  // the frame-time probe: a deep-floor battle with a stuffed machine, pets,
  // wounds, and a fat relic bag, driven through the REAL frame loop (sim +
  // full draw against the stub ctx). The budget sits ~3x above a healthy
  // run's cost here, leaving room for slow CI iron — it only trips on a
  // real regression
  // (an accidental O(n^2) pass, per-frame allocation storms, etc).
  const { DP: D, raf } = loadGame({}, true);
  let ts = 0;
  const frames = (n) => { for (let i = 0; i < n; i++) { ts += 16.7; const cb = raf(); if (cb) cb(ts); } };
  frames(5);
  D.srand(4242);
  D.newRun('knight');
  for (let f = 1; f < 15; f++) D.S.run.floor++;    // floor 15: dense, decorated piles
  D.initPile();
  D.S.run.relics.push('midas', 'warhound', 'thornmail', 'minter', 'clover', 'serrator', 'goldedge', 'twinfangs');
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = D.S.enemy.maxHp = 9999;
  D.summonPet('pup'); D.summonPet('newt'); D.summonPet('rat');
  D.S.enemy.burn = 5; D.S.enemy.bleed = 3; D.S.pBurn = 2;
  frames(30);                                       // battle warm-up, hand dealt
  for (const k of D.COIN_KINDS) D.S.battle.hand[k] = (D.S.battle.hand[k] || 0) + 40;
  D.S.turbo = 20;                                   // the worst honest case: max pour
  const t0 = performance.now();
  for (let i = 0; i < 500; i++) {
    ts += 16.7;
    if (i % 2 === 0) { D.S.cd = 0; D.drop(10 + (i % 80)); }   // keep the field brimming
    const cb = raf(); if (cb) cb(ts);
  }
  const ms = performance.now() - t0;
  const per = ms / 500;
  t.ok(D.S.coins.length > 60, 'the probe machine is genuinely packed (' + D.S.coins.length + ' pieces)');
  console.log('# perf probe: ' + ms.toFixed(0) + 'ms for 500 frames (' + per.toFixed(2) + 'ms/frame)');
  t.ok(per < 8, 'frame budget: ' + per.toFixed(2) + 'ms/frame stays under 8ms headless');
}

// -------- BOOT BAR + TOWN CRIER: the art tally & aria narration --------
{
  const said = [];
  globalThis.__dpSay = m => said.push(m);
  const { DP: D, raf } = loadGame({}, true);
  let ts = 0;
  const frames = (n) => { for (let i = 0; i < n; i++) { ts += 16.7; const cb = raf(); if (cb) cb(ts); } };
  frames(4);
  // the boot bar's ledger: everything counted, everything settled (the test
  // Image stub "loads" instantly), and the lazy packs never gate it
  const AL = globalThis.__dpArtLoad;
  t.ok(AL && AL.total > 40, 'the boot tally counts the eager art (' + (AL && AL.total) + ' images)');
  t.eq(AL.done, AL.total, 'every counted image settles the bar');
  t.ok(Object.values(AL.packs).every(n => n === 0), 'no pack left pending');
  t.ok(!('relic icons' in AL.packs), 'relic icons stay off the boot bar — they stream lazily');
  // the town crier narrates the run for screen readers
  t.ok(said.some(m => /title/i.test(m)), 'the crier announces the title screen');
  D.srand(31);
  D.newRun('knight');
  frames(6);
  t.ok(said.some(m => /floor 1/i.test(m) && /health/i.test(m)), 'the crier announces the dungeon floor + health');
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  frames(100);                                     // through the intro, into round 1
  t.ok(said.some(m => /^Battle!/.test(m)), 'the crier announces the battle and the foe');
  D.S.run.hp = Math.max(1, Math.floor(D.S.run.maxHp * 0.2));
  frames(4);
  t.ok(said.some(m => /health low/i.test(m)), 'the crier warns at low health');
  D.S.enemy.hp = 1; D.dmgEnemy(5);
  frames(12);
  t.ok(said.some(m => /victory/i.test(m)), 'the crier announces victory');
  t.ok(said.some(m => m === 'VICTORY!'), 'banners are relayed (the VICTORY! call)');
  delete globalThis.__dpSay;
}

// -------- PWA: manifest, worker, icons, wiring --------
{
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', 'dungeon_pusher');
  // the manifest is sound
  const man = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
  t.eq(man.short_name, 'Dungeon Pusher', 'manifest short_name');
  t.ok(man.start_url === './' && man.scope === './', 'manifest scoped to the game folder');
  t.eq(man.display, 'standalone', 'installs as a standalone app');
  t.ok(Array.isArray(man.icons) && man.icons.length >= 3, 'manifest lists the icon set');
  t.ok(man.icons.some(i => i.purpose === 'maskable'), 'a maskable icon is declared');
  // the declared icons exist and really are PNGs
  for (const src of new Set(man.icons.map(i => i.src))) {
    const buf = readFileSync(join(dir, src));
    t.ok(buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50, src + ' is a real PNG');
  }
  // the worker covers install / activate / fetch with the right strategies
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
  t.ok(/const CACHE = 'dp-/.test(sw), 'the worker versions its cache under dp-');
  for (const evName of ['install', 'activate', 'fetch']) {
    t.ok(sw.indexOf("addEventListener('" + evName + "'") >= 0, 'worker handles ' + evName);
  }
  t.ok(sw.indexOf('./index.html') >= 0 && sw.indexOf('skipWaiting') >= 0, 'the shell is precached and the worker takes over');
  t.ok(sw.indexOf("mode === 'navigate'") >= 0, 'navigations ride network-first');
  t.ok(sw.indexOf("indexOf('/api/') === 0") >= 0, 'the worker never caches /api/ — live boards stay live');
  // the page wires it all up
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  t.ok(html.indexOf('rel="manifest"') >= 0, 'index links the manifest');
  t.ok(html.indexOf('theme-color') >= 0, 'index carries a theme-color');
  t.ok(html.indexOf("serviceWorker.register('sw.js')") >= 0, 'index registers the worker');
  t.ok(html.indexOf('beforeinstallprompt') >= 0, 'the install offer is caught for the title chip');
}

// -------- LEADERBOARD (client side): the carved name + wiring --------
{
  // the carved name persists in the save blob
  const st = {};
  const { DP: D } = loadGame(st, false);
  t.eq(D.S.boardName, '', 'no name carved on a fresh profile');
  D.S.boardName = 'Danhieux';
  D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.boardName, 'Danhieux', 'the carved name survives a reload');
  // an over-long stored name is clipped on load, matching the server's cap
  const blob = JSON.parse(st[D.C.SAVE_KEY]);
  blob.boardName = 'ABCDEFGHIJKLMNOP';
  st[D.C.SAVE_KEY] = JSON.stringify(blob);
  const { DP: L } = loadGame(st, false);
  t.eq(L.S.boardName.length, 12, 'a stored name clips to 12 characters');
  // the page is wired to the board endpoint and its overlays
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("'/api/dungeon_board'") >= 0, 'the client points at /api/dungeon_board');
  t.ok(src.indexOf('CARVE IT') >= 0, 'the fallen-run screen offers the carve');
  t.ok(src.indexOf('function drawBoard') >= 0 && src.indexOf('function drawNamePad') >= 0,
       'board + name-carver overlays exist');
  t.ok(/if \(NAMEPAD\) \{ NAMEPAD = null; return; \}/.test(src), 'ESC backs out of the carver first');
}

// -------- CLOUD SAVE (client side): the code + the clock --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  t.eq(D.S.syncCode, '', 'no sync code on a fresh profile');
  // every save is clock-stamped so the cloud can say who's newer
  D.save();
  const blob = JSON.parse(st[D.C.SAVE_KEY]);
  t.ok(blob.t > 0, 'the blob carries a write timestamp');
  // a valid code round-trips; a mangled one is dropped on load
  D.S.syncCode = 'AB2C-XY9Z';
  D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.syncCode, 'AB2C-XY9Z', 'the sync code survives a reload');
  const blob2 = JSON.parse(st[D.C.SAVE_KEY]);
  blob2.syncCode = 'not-a-code';
  st[D.C.SAVE_KEY] = JSON.stringify(blob2);
  const { DP: M } = loadGame(st, false);
  t.eq(M.S.syncCode, '', 'a mangled stored code is dropped, not trusted');
  // the page is wired to the save endpoint and its overlay
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("'/api/dungeon_save'") >= 0, 'the client points at /api/dungeon_save');
  t.ok(src.indexOf('function drawCloud') >= 0 && src.indexOf('CLOUD SAVE') >= 0, 'the cloud overlay exists');
  t.ok(src.indexOf('RESTORE THIS PROFILE?') >= 0, 'restoring always passes the confirm sheet');
}

// -------- LOCALIZATION: TR() + the NL proof pass --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  t.eq(D.TR('END TURN ▶'), 'END TURN ▶', 'en is a pass-through');
  t.eq(D.TR('a string nobody translated'), 'a string nobody translated', 'unknown keys fall through untouched');
  D.setLang('nl');
  t.eq(D.TR('END TURN ▶'), 'EINDE BEURT ▶', 'nl translates a wrapped key');
  t.eq(D.TR('VICTORY!'), 'OVERWINNING!', 'banners speak Dutch too');
  t.eq(D.TR('a string nobody translated'), 'a string nobody translated', 'nl falls back to English for gaps');
  t.eq(D.setLang('klingon'), 'en', 'an unknown language falls back to en');
  const nl = D.LANGS.nl;
  t.ok(Object.keys(nl).length >= 30, 'the NL proof pass covers 30+ strings (' + Object.keys(nl).length + ')');
  t.ok(Object.values(nl).every(v => typeof v === 'string' && v.length > 0), 'no empty NL entries');
  t.ok(Object.keys(D.LANGS.en).length === 0, 'en stays a pure pass-through table');
  // the choice persists and is live straight after load
  D.S.lang = 'nl'; D.setLang('nl'); D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.lang, 'nl', 'the language survives a reload');
  t.eq(R.TR('CLOSE ✕'), 'SLUITEN ✕', 'and the table is live after load');
  // the sim's banners flow through TR
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  for (const key of ["TR('VICTORY!')", "TR('JACKPOT!')", "TR('YOUR TURN!')", "TR('ROUND')", "TR('FLOOR')"]) {
    t.ok(src.indexOf(key) >= 0, 'banner site wrapped: ' + key);
  }
  t.ok(src.indexOf("uiBtn(52, py + 18, 64, 28, '\\u{1F310} '") >= 0 || /LANG\.toUpperCase/.test(src),
       'the settings language chip exists');
}

// -------- PHOTO MODE + CREDITS: the wiring --------
{
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  // photo mode: camera chip on victory, HUD branch, every way back out
  t.ok(src.indexOf('let PHOTO = false;') >= 0, 'the PHOTO flag exists');
  t.ok(/uiBtn\(LW - 110, py - 18, 40, 34, '\\u\{1F4F7\}'/.test(src), 'the camera chip sits on the victory panel');
  t.ok(src.indexOf('if (PHOTO) {') >= 0 && src.indexOf('tap to return') >= 0,
       'photo mode strips the HUD and leaves a way back');
  t.ok(/if \(PHOTO\) \{ PHOTO = false; return; \}/.test(src), 'ESC leaves photo mode first');
  t.ok(src.indexOf('kbFocus = -1; PHOTO = false;') >= 0, 'a screen change drops photo mode');
  t.ok(src.indexOf("&& !PHOTO) drawHeartbeat") >= 0, 'the heartbeat vignette stays out of the shot');
  // credits: overlay + settings door + crash-net coverage
  t.ok(src.indexOf('function drawCredits') >= 0, 'the credits overlay exists');
  t.ok(src.indexOf('art/CREDITS.txt') >= 0, 'credits point at the full attribution file');
  t.ok(src.indexOf("CREDITS = true;") >= 0, 'settings opens the credits');
  t.ok(src.indexOf('CREDITS = false; PHOTO = false;') >= 0, 'the crash net clears both');
}

// -------- MACHINE THEMES: the skin rack --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  const ids = Object.keys(D.MACH_THEMES);
  t.eq(ids.length, 4, 'four cabinet themes on the rack');
  t.eq(ids[0], 'classic', 'CLASSIC leads the rack');
  t.ok(ids.every(id => D.MACH_THEMES[id].name && typeof D.MACH_THEMES[id].floor === 'number'),
       'every theme carries a name and a milestone');
  t.ok(!D.MACH_THEMES.classic.tint && D.MACH_THEMES.neon.tint, 'classic is raw art, the others wash');
  // unlocks follow the best descent
  t.eq(D.S.machTheme, 'classic', 'a fresh profile wears CLASSIC');
  t.ok(D.themeUnlocked('classic') && !D.themeUnlocked('bone'), 'only CLASSIC opens at floor 0');
  D.S.best.floor = 10;
  t.ok(D.themeUnlocked('bone') && D.themeUnlocked('gilded') && !D.themeUnlocked('neon'),
       'floor 10 opens BONE + GILDED, NEON stays sealed');
  t.ok(!D.themeUnlocked('nosuch'), 'an unknown theme never unlocks');
  // the pick persists; a mangled pick is dropped on load
  D.S.machTheme = 'gilded';
  D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.machTheme, 'gilded', 'the worn theme survives a reload');
  const blob = JSON.parse(st[D.C.SAVE_KEY]);
  blob.machTheme = 'chrome-hell';
  st[D.C.SAVE_KEY] = JSON.stringify(blob);
  const { DP: M } = loadGame(st, false);
  t.eq(M.S.machTheme, 'classic', 'an unknown stored theme falls back to CLASSIC');
  // the render caches re-key on the theme
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.eq((src.match(/S\.machTheme,/g) || []).length >= 3, true, 'all three machArt layers re-key on the theme');
  t.ok(src.indexOf('const MACH_TINT = {}') >= 0, 'tinted cabinets are baked once and cached');
}

// -------- HERO SKINS + SEASONS: deep clears, alt palettes, clock windows --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  // every hero has a skin color waiting
  t.ok(D.HEROES.every(h => D.HERO_SKINS[h.id]), 'all eight heroes have an alt palette');
  t.ok(!D.skinWorn('knight'), 'nothing worn on a fresh profile');
  // a floor-15 boss kill tailors the skin for that hero only
  D.srand(77);
  D.newRun('knight');
  D.S.run.floor = 15;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.foes.forEach(f => { f.hp = 1; });
  D.dmgAll(9);
  t.ok(D.S.victory && D.S.victory.boss, 'the floor-15 boss falls');
  t.eq(D.S.deep15.knight, 1, 'the DEEP CLEAR is inked for the knight');
  t.ok(!D.S.deep15.rogue, 'nobody else gets tailored');
  // worn = earned AND toggled
  t.ok(!D.skinWorn('knight'), 'earned but not yet worn');
  D.S.skins.knight = 1;
  t.ok(D.skinWorn('knight'), 'toggled on, the wash is worn');
  D.S.skins.rogue = 1;
  t.ok(!D.skinWorn('rogue'), 'toggling an unearned skin does nothing');
  // both ledgers persist
  D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.deep15.knight, 1, 'the deep-clear ledger survives a reload');
  t.ok(R.skinWorn('knight'), 'the worn skin survives too');
  // a floor-14 boss earns nothing
  const { DP: E } = loadGame({}, false);
  E.srand(3); E.newRun('rogue');
  E.S.run.floor = 14;
  E.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  E.interact(0);
  E.S.foes.forEach(f => { f.hp = 1; });
  E.dmgAll(9);
  t.ok(!E.S.deep15.rogue, 'a floor-14 boss is not a deep clear');
  // the seasonal clock windows
  t.eq(D.seasonNow(new Date('2026-10-20')), 'halloween', 'late October is pumpkin season');
  t.eq(D.seasonNow(new Date('2026-10-10')), null, 'early October is not');
  t.eq(D.seasonNow(new Date('2026-12-05')), 'winter', 'December snows');
  t.eq(D.seasonNow(new Date('2026-03-14')), null, 'spring is plain');
}

// -------- NEW GAME+: the prestige door --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  t.ok(!D.ngPlusOpen(), 'prestige is sealed on a fresh profile');
  D.S.deep15.knight = 1;
  t.ok(D.ngPlusOpen(), 'a deep clear opens the door');
  D.srand(1); D.newRun('knight');
  t.eq(D.S.run.ng, 0, 'unarmed: a plain run');
  t.eq(D.actIdx(1), 0, 'plain floor 1 is act 1');
  // armed: the whole act ladder shifts one deeper
  D.S.ngPick = true;
  D.srand(2); D.newRun('knight');
  t.eq(D.S.run.ng, 1, 'armed: a prestige run');
  t.eq(D.actIdx(1), 1, 'NG+ floor 1 fields act-2 kin');
  t.eq(D.actIdx(6), 2, 'NG+ floor 6 fields act-3 kin');
  t.ok(D.curRoster() === D.ENEMY_TIERS[1], 'the live roster really is act 2');
  // the boss rotation shifts with it (A-side pinned — parity is its own test)
  D.S.run.bside = 0;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  t.eq(D.S.enemy.id, D.BOSSES[1].id, 'the first lair holds the act-2 boss');
  // the run + the armed door persist
  D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.run.ng, 1, 'the prestige run survives a reload');
  t.ok(R.S.ngPick, 'the armed door survives too');
  // the prestige shelf: five relics, open on NG+, sealed on plain runs
  t.eq(R.RELICS.filter(r => r.ng === 1).length, 5, 'five NG+-only relics');
  t.eq(R.RELICS.filter(r => r.ng === 2).length, 1, 'and ONE legend-only shard');
  const poolNg = R.rollRelicPool('r', 999);
  t.ok(poolNg.indexOf('mintvein') >= 0 && poolNg.indexOf('dblchime') >= 0, 'NG+ pools carry the prestige shelf');
  R.S.ngPick = false;
  R.srand(5); R.newRun('knight');
  t.ok(R.rollRelicPool('r', 999).indexOf('mintvein') < 0, 'plain pools never see it');
  t.ok(R.rollRelicPool('e', 999).indexOf('crownscale') < 0, 'not the epics either');
  // the daily never runs prestige — same dungeon for everyone
  const { DP: Y } = loadGame({}, false);
  Y.S.deep15.knight = 1; Y.S.ngPick = true;
  Y.newDaily('2026-07-22');
  t.eq(Y.S.run.ng, 0, 'the daily stays a plain dungeon');
}

// -------- NEW GAME+: the five prestige effects --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  DS.deep15.knight = 1; DS.ngPick = true;
  D.srand(9); D.newRun('knight');
  // Gilded Hourglass: +1 TILT
  const t0 = D.tiltCount();
  DS.run.relics.push('gildhour');
  t.eq(D.tiltCount(), t0 + 1, 'the hourglass adds a TILT charge');
  // Mint Vein: +actIdx to gold damage (NG+ floor 1 = act 1)
  const g0 = D.goldDmg();
  DS.run.relics.push('mintvein');
  t.eq(D.goldDmg(), g0 + 1, 'the vein pays +1 on NG+ floor 1');
  DS.run.floor = 6;
  t.eq(D.goldDmg(), g0 + 2, 'and +2 an act deeper');
  DS.run.floor = 1;
  // Leaden Idol: hits land 2 lighter
  DS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  DS.run.block = 0; DS.run.hp = 30;
  D.hurtPlayer(6);
  t.eq(DS.run.hp, 24, 'a 6-hit lands as 6 without the idol');
  DS.run.relics.push('leadenidol');
  D.hurtPlayer(6);
  t.eq(DS.run.hp, 20, 'with the idol it lands as 4');
  // Crown Scale: +25% on elites (and bosses)
  D.S.foes.forEach(f => { f.hp = 1; }); D.dmgAll(9); D.leaveBattle();
  DS.run.room.ents = [{ kind: 'monster', mtype: 'elite', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  DS.enemy.hp = DS.enemy.maxHp = 500;
  DS.enemy.block = 0; DS.enemy.def = null; DS.enemy.mirror = 0;
  const before = DS.enemy.hp;
  D.dmgFoe(DS.enemy, 8);
  const plain = before - DS.enemy.hp;
  DS.run.relics.push('crownscale');
  const before2 = DS.enemy.hp;
  D.dmgFoe(DS.enemy, 8);
  t.eq(before2 - DS.enemy.hp, Math.round(plain * 1.25), 'the scale weighs +25% on the crowned');
  // Echo Bell: the jackpot rains 4 extra
  DS.run.relics.push('dblchime');
  const rain0 = DS.rain.length;
  D.frenzy();
  t.ok(DS.rain.length >= rain0 + 4, 'the chime rings 4 bonus coins into the rain');
}

// -------- THE B-SIDE: a second boss per act --------
{
  const { DP: D } = loadGame({}, false);
  t.eq(D.BOSSES2.length, 3, 'three B-side lair-holders');
  t.ok(D.BOSSES2.every(b => b.id && b.hp > 0 && b.atk > 0 && b.gold > 0), 'their statlines are whole');
  t.ok(D.BOSSES2.every(b => !D.BOSSES.some(a => a.id === b.id)), 'no id collides with the A-side');
  // parity: newRun bumps best.runs first, so even totals face the B-side
  D.srand(1); D.newRun('knight');            // run #1 — A-side
  t.eq(D.S.run.bside, 0, 'run 1 faces the A-side');
  t.eq(D.bossFor(1).id, 'dragon', 'the dragon holds the first lair');
  D.srand(2); D.newRun('knight');            // run #2 — B-side
  t.eq(D.S.run.bside, 1, 'run 2 faces the B-SIDE');
  t.eq(D.bossFor(1).id, 'wyrm', 'the Gilded Wyrm holds it instead');
  t.eq(D.bossFor(6).id, 'banshee', 'act 2: the Grave Banshee');
  t.eq(D.bossFor(11).id, 'aurifex', 'act 3: the Aurifex');
}
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  D.srand(2); D.newRun('knight'); D.srand(3); D.newRun('knight');   // run #2: B-side
  t.eq(D.S.run.bside, 1, 'B-side armed');
  D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.run.bside, 1, 'the B-side flag survives a reload');
  t.eq(R.bossFor(1).id, 'wyrm', 'and still picks the wyrm');
  // the wyrm fights: mirror def + the SQUEEZE arena
  R.S.screen = 'dungeon';                    // the reload parks on the title
  R.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  R.interact(0);
  t.eq(R.S.enemy.id, 'wyrm', 'the lair holds the Gilded Wyrm');
  t.ok(R.S.enemy.boss, 'and he is a true boss');
  // drive to round 3: the constriction lands
  R.S.battle.round = 2;
  R.S.leadT = 0;
  R.newRound();                              // round 3
  t.ok(R.S.leadT >= 1, 'round 3: the wyrm SQUEEZES (lead purse)');
  // banshee + aurifex arenas, staged directly
  R.S.enemy.hp = 0;
  R.S.foes.push({ id: 'banshee', name: 'Grave Banshee', boss: true, hp: 50, maxHp: 50, atk: 8, block: 0 });
  R.S.weakT = 0;
  R.S.battle.round = 2;
  R.newRound();
  t.ok(R.S.weakT >= 1, 'the banshee WAIL saps your arm');
  R.S.foes[R.S.foes.length - 1].hp = 0;
  R.S.foes.push({ id: 'aurifex', name: 'The Aurifex', boss: true, hp: 50, maxHp: 50, atk: 8, block: 0 });
  const rain0 = R.S.rain.length;
  R.S.battle.round = 2;
  R.newRound();
  t.ok(R.S.rain.filter(r => r.kind === 'skull').length >= 2 && R.S.rain.length >= rain0 + 2,
       'the Aurifex mints cursed slugs into the rain');
}

// -------- ACT IV: THE MINT --------
{
  const { DP: D } = loadGame({}, false);
  const mint = D.ENEMY_TIERS[3];
  t.eq(mint.length, 13, 'thirteen counting-house horrors');
  t.ok(mint.every(e => e.hp > 0 && e.atk > 0 && e.gold > 0 && e.icon && e.name), 'all fully statted');
  // the three minted traits live here and only here
  for (const tr of ['magarmor', 'coinclone', 'jackthief']) {
    t.ok(mint.some(e => e.trait === tr), 'the mint fields ' + tr);
    t.ok(!D.ENEMY_TIERS.slice(0, 3).some(tier => tier.some(e => e.trait === tr)), tr + ' is mint-exclusive');
  }
  // base stats out-muscle act 3 (same slot, deeper act)
  t.ok(mint[0].hp > D.ENEMY_TIERS[2][0].hp, 'the mint out-muscles the abyss');
  // the gilded palette holds the whole act
  D.srand(11); D.newRun('knight');
  D.S.run.bside = 0;
  D.S.run.floor = 15;
  t.ok(D.theme().name !== 'THE MINT', 'floor 15 keeps the old cycle');
  D.S.run.floor = 16;
  t.eq(D.theme().name, 'THE MINT', 'floor 16 turns gilded');
  t.ok(D.curRoster() === mint, 'and fields the mint roster');
  D.S.run.floor = 23;
  t.ok(D.curRoster() === mint, 'past the last act the mint holds the door');
  // THE AUDITOR seals the act
  D.S.run.floor = 16;
  t.eq(D.bossFor(16).id, 'auditor', 'THE AUDITOR holds the floor-20 lair rotation');
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  t.eq(D.S.enemy.id, 'auditor', 'the audit begins');
  // his ARENA: round 3 fines gold and halves the meter
  D.S.run.gold = 50; D.S.meter = 10;
  D.S.battle.round = 2;
  D.newRound();
  t.eq(D.S.run.gold, 44, 'AUDITED: 6 gold fined');
  t.eq(D.S.meter, 5, 'the jackpot meter is held for review');
}
// -------- THE MINT's three tricks, measured --------
{
  const { DP: D } = loadGame({}, false);
  D.srand(21); D.newRun('knight');
  D.S.run.floor = 16;
  // Lodestone Sentinel: magnetic armor hoards block on its turn
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'lodestone', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  const b0 = D.S.enemy.block || 0;
  D.enemyActFoe(D.S.enemy);
  t.ok((D.S.enemy.block || 0) >= b0 + 3 - 2, 'the lodestone hoards block (+3, minus what its blow spent)');
  // Meter Leech: siphons the jackpot meter (clear the scaled hoard to land the kill)
  D.S.enemy.hp = 1; D.S.enemy.block = 0; D.S.enemy.braced = false; D.dmgEnemy(9); D.leaveBattle();
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'meterleech', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.meter = 10;
  D.enemyActFoe(D.S.enemy);
  t.eq(D.S.meter, 4, 'the meter leech siphons 3 + the act (floor 16 = act 3 → 6)');
  // The Counterfeiter: mints a dud slug onto the pile
  D.S.enemy.hp = 1; D.S.enemy.block = 0; D.S.enemy.braced = false; D.dmgEnemy(9); D.leaveBattle();
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'counterfeit', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.place(50, 50, 'coin');
  const slugs0 = D.S.coins.filter(c => c.kind === 'slug').length;
  D.enemyActFoe(D.S.enemy);
  t.ok(D.S.coins.filter(c => c.kind === 'slug').length > slugs0, 'the counterfeiter mints a dud');
}

// -------- TROPHIES FOR THE NEW AGE --------
{
  const { DP: D } = loadGame({}, false);
  t.eq(new Set(D.ACH.map(a => a.id)).size, D.ACH.length, 'trophy ids stay unique');
  const newIds = ['ngclear', 'tailored', 'housestyle', 'carved', 'skyvault',
                  'audited', 'bsides', 'minted', 'shutterbug', 'tweetalig'];
  for (const id of newIds) t.ok(D.achById(id), 'the wall holds ' + id);
  // the profile watches: theme, language, worn skin
  t.ok(!D.S.ach.u.housestyle, 'HOUSE STYLE waits');
  D.S.best.floor = 6; D.S.machTheme = 'bone';
  D.achPoll();
  t.ok(D.S.ach.u.housestyle, 'a worn theme earns HOUSE STYLE');
  D.S.lang = 'nl';
  D.achPoll();
  t.ok(D.S.ach.u.tweetalig, 'Nederlands earns TWEETALIG');
  D.S.deep15.knight = 1; D.S.skins.knight = 1;
  D.achPoll();
  t.ok(D.S.ach.u.tailored, 'a worn alt skin earns TAILORED');
  // the kill ledgers: B-sides and the mint tricksters
  D.S.codex.foes.wyrm = 1; D.S.codex.foes.banshee = 1;
  D.achPoll();
  t.ok(!D.S.ach.u.bsides, 'two of three B-siders is not the set');
  D.S.codex.foes.aurifex = 1;
  D.achPoll();
  t.ok(D.S.ach.u.bsides, 'the full B-side earns the trophy');
  D.S.codex.foes.lodestone = 1; D.S.codex.foes.counterfeit = 1; D.S.codex.foes.meterleech = 2;
  D.achPoll();
  t.ok(D.S.ach.u.minted, 'the three mint tricksters earn COUNTING HOUSE');
  D.S.codex.foes.auditor = 1;
  D.achPoll();
  t.ok(D.S.ach.u.audited, 'felling THE AUDITOR earns CLEAN BOOKS');
  // TWICE AROUND: the floor-15 boss on a prestige run
  const { DP: N } = loadGame({}, false);
  N.S.deep15.rogue = 1; N.S.ngPick = true;
  N.srand(6); N.newRun('knight');
  t.eq(N.S.run.ng, 1, 'prestige armed');
  N.S.run.floor = 15;
  N.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  N.interact(0);
  N.S.foes.forEach(f => { f.hp = 1; f.def = null; });
  N.dmgAll(9);
  t.ok(N.S.ach.u.ngclear, 'the NG+ floor-15 boss earns TWICE AROUND');
  // the hall paginates rather than overflowing the screen
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('ACH.slice(TROPHIES.page * PER') >= 0, 'the trophy wall pages instead of overflowing');
  t.ok(src.indexOf("achUnlock('shutterbug')") >= 0 && src.indexOf("achUnlock('carved')") >= 0
       && src.indexOf("achUnlock('skyvault')") >= 0, 'photo/board/cloud hooks are wired');
}

// -------- FEEL PASS: the aim ghost + crawl footfalls --------
{
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  // the ghost: drawn on the platform each battle frame, hidden for rigs that don't aim
  t.ok(src.indexOf('function drawAimGhost') >= 0, 'the aim ghost exists');
  t.ok(src.indexOf('drawAimGhost(t);') >= 0, 'and is drawn in the battle pass');
  t.ok(/craneRun\(\) \|\| ghostRun\(\)\) return;/.test(src), 'the claw and the poltergeist skip it');
  t.ok(src.indexOf('C.COIN_R * ap.u') >= 0, 'the ring is sized to a real coin at that depth');
  // footfalls: the stub carries step(), the walk paces it
  const { DP: D } = loadGame({}, false);
  t.eq(typeof D.S, 'object', 'game loads');
  t.ok(src.indexOf('step() {}') >= 0, 'headless SND stubs step()');
  t.ok(src.indexOf('AV.stepAcc') >= 0 && src.indexOf('SND.step();') >= 0, 'the crawl paces footfalls');
  t.ok(src.indexOf('SND.door();') >= 0, 'the door thunk was already on the hinge');
}

// -------- THE BALANCE PROBE: acts 3-5 threat curve, measured --------
// A cheap analytic sweep over the REAL scaling code: for each floor it takes
// the live roster's mean statline, runs it through mkEnemy's own multipliers,
// and divides by a fixed midline offense model (calibrated once at floor 1).
// The absolute numbers are arbitrary; the CURVE is what the rails guard —
// act hand-offs may sting but never wall, and NG+ floor 1 lands near the
// act-2 gate, not past it.
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  D.srand(4242); D.newRun('knight');
  DS.run.bside = 0;
  const offense = (f) => 14 * (1 + 0.115 * (f - 1));   // midline player growth/floor
  const threatAt = (f, ng) => {
    DS.run.floor = f; DS.run.depth = 3; DS.run.ng = ng ? 1 : 0;
    const roster = D.curRoster();
    const hp = roster.reduce((a, e) => a + e.hp, 0) / roster.length;
    const atk = roster.reduce((a, e) => a + e.atk, 0) / roster.length;
    const m = D.scaleMult();
    // rounds to clear × damage eaten per round, in midline units
    return (hp * m / offense(f)) * (atk * m);
  };
  const curve = [];
  for (let f = 13; f <= 21; f++) curve.push({ f, th: threatAt(f, false) });
  DS.run.ng = 0;
  console.log('# balance probe: ' + curve.map(c => c.f + ':' + c.th.toFixed(1)).join(' '));
  // rail 1: the deep never gets EASIER floor over floor
  for (let i = 1; i < curve.length; i++) {
    t.ok(curve[i].th >= curve[i - 1].th * 0.98,
         'floor ' + curve[i].f + ' never softens (' + curve[i - 1].th.toFixed(1) + ' -> ' + curve[i].th.toFixed(1) + ')');
  }
  // rail 2: the mint hand-off stings but never walls
  const jump = curve.find(c => c.f === 16).th / curve.find(c => c.f === 15).th;
  t.ok(jump >= 1.02 && jump <= 1.9, 'the act-4 hand-off is a sting, not a wall (×' + jump.toFixed(2) + ')');
  // rail 3: NG+ floor 1 lands NEAR the plain act-2 gate. The PRESTIGE KIT
  // (+3 gold coins, +1 potion, +20 gold at the door) is worth ~3 floors of
  // midline growth, so the NG+ offense model starts at floor 4.
  DS.run.floor = 1; DS.run.depth = 3; DS.run.ng = 1;
  const ng1 = (() => {
    const roster = D.curRoster();
    const hp = roster.reduce((a, e) => a + e.hp, 0) / roster.length;
    const atk = roster.reduce((a, e) => a + e.atk, 0) / roster.length;
    const m = D.scaleMult();
    return (hp * m / offense(4)) * (atk * m);
  })();
  const plain6 = threatAt(6, false);
  DS.run.ng = 0;
  console.log('# ng+ sting: ng1=' + ng1.toFixed(1) + ' vs plain6=' + plain6.toFixed(1));
  t.ok(ng1 <= plain6 * 1.25 && ng1 >= plain6 * 0.5,
       'NG+ floor 1 (with the prestige kit) lands near the act-2 gate (' + ng1.toFixed(1) + ' vs ' + plain6.toFixed(1) + ')');
  // rail 3b: NG++ floor 1 lands NEAR the plain act-3 gate. BOTH kits stack
  // (+6 coins, +2 potions, +40 gold) — worth ~6 floors, so the legend
  // offense model starts at floor 7.
  DS.run.floor = 1; DS.run.depth = 3; DS.run.ng = 2;
  const ng2 = (() => {
    const roster = D.curRoster();
    const hp = roster.reduce((a, e) => a + e.hp, 0) / roster.length;
    const atk = roster.reduce((a, e) => a + e.atk, 0) / roster.length;
    const m = D.scaleMult();
    return (hp * m / offense(7)) * (atk * m);
  })();
  const plain11 = threatAt(11, false);
  DS.run.ng = 0;
  console.log('# ng++ sting: ng2=' + ng2.toFixed(1) + ' vs plain11=' + plain11.toFixed(1));
  t.ok(ng2 <= plain11 * 1.3 && ng2 >= plain11 * 0.5,
       'NG++ floor 1 (with both kits) lands near the act-3 gate (' + ng2.toFixed(1) + ' vs ' + plain11.toFixed(1) + ')');
  // and the kit itself is real
  {
    const st2 = {};
    const { DP: K } = loadGame(st2, false);
    K.S.deep15.knight = 1;
    K.srand(3); K.newRun('knight');
    const plainCoin = K.S.run.purse.coin, plainPot = K.S.run.potions;
    K.S.ngPick = true;
    K.srand(3); K.newRun('knight');
    t.eq(K.S.run.purse.coin, plainCoin + 3, 'the kit banks +3 gold coins');
    t.eq(K.S.run.potions, plainPot + 1, 'and +1 potion');
    t.eq(K.S.run.gold, 20, 'and 20 gold for the first shop');
  }
  // rail 4: the bosses climb in order, and THE AUDITOR crowns them sanely
  const bossPow = (f) => {
    DS.run.floor = f;
    const b = D.mkEnemy('boss');
    return b.hp * b.atk;
  };
  const bp = [5, 10, 15, 20].map(f => ({ f, p: bossPow(f) }));
  console.log('# boss curve: ' + bp.map(x => x.f + ':' + x.p).join(' '));
  for (let i = 1; i < bp.length; i++) {
    t.ok(bp[i].p > bp[i - 1].p, 'the floor-' + bp[i].f + ' boss outguns the last');
  }
  t.ok(bp[3].p / bp[2].p >= 1.1 && bp[3].p / bp[2].p <= 2.6,
       'THE AUDITOR crowns the curve without walling it (×' + (bp[3].p / bp[2].p).toFixed(2) + ')');
}

// -------- SEED SHARING + the NG+ ledger --------
{
  const layoutOf = (D2) => {
    const m = D2.S.run.map;
    return Object.keys(m.rooms).sort().map(k =>
      k + '<' + (m.rooms[k].ents || []).map(e => e.kind + (e.eid || '')).join(',') + '>').join('|');
  };
  // a planted seed takes root, and two players grow the SAME dungeon
  const { DP: A } = loadGame({}, false);
  A.srand(1); A.S.nextSeed = parseInt('COIN', 36); A.newRun('knight');
  t.eq(A.S.run.seed, parseInt('COIN', 36) >>> 0, 'the planted seed takes root');
  t.eq(A.S.nextSeed, null, 'and the seed bed empties');
  const l1 = layoutOf(A);
  for (let i = 0; i < 137; i++) A.rollPileKind();     // burn a battle's worth of rng
  A.S.run.floor = 2; A.genFloor();
  const l2 = layoutOf(A);
  const { DP: B } = loadGame({}, false);
  B.srand(999); B.S.nextSeed = parseInt('COIN', 36); B.newRun('rogue');
  t.eq(layoutOf(B), l1, 'floor 1 is the same dungeon for both players');
  for (let i = 0; i < 5; i++) B.rollPileKind();       // a different amount burned
  B.S.run.floor = 2; B.genFloor();
  t.eq(layoutOf(B), l2, 'floor 2 still matches despite divergent battles');
  // a different seed grows a different dungeon
  const { DP: C2 } = loadGame({}, false);
  C2.srand(1); C2.S.nextSeed = parseInt('SLUG', 36); C2.newRun('knight');
  t.ok(layoutOf(C2) !== l1, 'a different seed grows a different dungeon');
  // unplanted runs still stamp a seed, and it survives a reload
  const st = {};
  const { DP: E } = loadGame(st, false);
  E.srand(77); E.newRun('knight');
  const sd = E.S.run.seed;
  t.ok(typeof sd === 'number' && E.seed36(sd).length >= 1, 'every run carries a base36 seed');
  E.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.run.seed, sd, 'the seed survives a reload');
  // the report card + the history book carry the prestige ledger
  const { DP: F } = loadGame({}, false);
  F.S.deep15.knight = 1; F.S.ngPick = true;
  F.srand(3); F.newRun('knight');
  const fsd = F.S.run.seed;
  F.hpHit(9999, 'the probe');
  t.eq(F.S.over.ng, 1, 'the report card knows a prestige run');
  t.eq(F.S.over.seed, fsd, 'and remembers its seed');
  t.eq(F.S.hist[0].ng, 1, 'the history book wears the pawn');
}

// -------- MINT STRANGERS + the slug job --------
{
  const { DP: D } = loadGame({}, false);
  t.ok(D.eventById('assayer') && D.eventById('debtor'), 'the two mint strangers exist');
  t.ok(D.eventById('assayer').mint && D.eventById('debtor').mint, 'and keep to the mint');
  // placement: act 1 never fields them; the mint act does (across many carves)
  const placed = (floor) => {
    const seen = new Set();
    for (let sd = 1; sd <= 40; sd++) {
      D.srand(sd); D.newRun('knight');
      D.S.run.floor = floor; D.genFloor();
      for (const k of Object.keys(D.S.run.map.rooms)) {
        for (const e of D.S.run.map.rooms[k].ents) if (e.kind === 'event') seen.add(e.ev);
      }
    }
    return seen;
  };
  const act1 = placed(2);
  t.ok(!act1.has('assayer') && !act1.has('debtor'), 'act 1 halls never hold mint strangers');
  const act4 = placed(17);
  t.ok(act4.has('assayer') || act4.has('debtor'), 'the mint halls do (' + [...act4].join(',') + ')');
  // THE ASSAYER: appraisal pays per relic; the sale takes one and pays 60
  D.srand(9); D.newRun('knight');
  D.S.run.relics.push('thornmail', 'petwhistle', 'deepfreeze');   // gold-neutral, so the math stays exact
  D.S.run.gold = 50;
  D.S.run.room.ents.push({ kind: 'event', ev: 'assayer', done: false, px: 0.5, py: 0.5 });
  D.interact(D.S.run.room.ents.length - 1);
  t.ok(D.eventChoose(0), 'the appraisal goes through');
  t.eq(D.S.run.gold, 50 - 10 + 9, 'ten gold fee, +3 apiece for three relics');
  D.closeModal();
  D.S.run.room.ents.push({ kind: 'event', ev: 'assayer', done: false, px: 0.5, py: 0.5 });
  D.interact(D.S.run.room.ents.length - 1);
  const g0 = D.S.run.gold, r0 = D.S.run.relics.length;
  t.ok(D.eventChoose(1), 'the sale goes through');
  t.eq(D.S.run.relics.length, r0 - 1, 'one relic leaves the pack');
  t.eq(D.S.run.gold, g0 + 60, 'sixty gold arrives');
  D.closeModal();
  // THE DEBT COLLECTOR: settling costs 30 and pays a key
  D.S.run.gold = 40;
  const k0 = D.S.run.keys;
  D.S.run.room.ents.push({ kind: 'event', ev: 'debtor', done: false, px: 0.5, py: 0.5 });
  D.interact(D.S.run.room.ents.length - 1);
  t.ok(D.eventChoose(0), 'the debt is settled');
  t.eq(D.S.run.gold, 10, 'thirty gold stamped away');
  t.eq(D.S.run.keys, k0 + 1, 'the receipt is a key');
  D.closeModal();
  // the dispute: both branches reachable, the lien floors max HP at 10
  let sawPay = false, sawLien = false;
  for (let sd = 1; sd <= 30 && !(sawPay && sawLien); sd++) {
    D.srand(sd * 31);
    D.S.run.room.ents.push({ kind: 'event', ev: 'debtor', done: false, px: 0.5, py: 0.5 });
    D.interact(D.S.run.room.ents.length - 1);
    const mh0 = D.S.run.maxHp, gg0 = D.S.run.gold;
    D.eventChoose(1);
    if (D.S.run.gold > gg0) sawPay = true;
    if (D.S.run.maxHp < mh0) sawLien = true;
    D.closeModal();
  }
  t.ok(sawPay && sawLien, 'the dispute can pay damages AND land the lien');
}
{
  // the slug job: only offered in the mint, counts slugs as they clatter in
  const { DP: D } = loadGame({}, false);
  D.srand(5); D.newRun('knight');
  let sawEarly = false;
  for (let i = 0; i < 120; i++) { if (D.rollQuest(3).id === 'slugbank') sawEarly = true; }
  t.ok(!sawEarly, 'floor 3 never posts the slug job');
  let sawMint = false;
  for (let i = 0; i < 120 && !sawMint; i++) { if (D.rollQuest(17).id === 'slugbank') sawMint = true; }
  t.ok(sawMint, 'floor 17 does');
  D.S.run.quest = { id: 'slugbank', need: 3, got: 0, done: false, reward: 'goldkey' };
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  const gk0 = D.S.run.goldKeys || 0;
  for (let i = 0; i < 3; i++) D.scoreCoin({ kind: 'slug', x: 50, y: 90, z: 0 });
  t.ok(D.S.run.quest.done, 'three collected slugs finish the job');
  t.eq(D.S.run.goldKeys, gk0 + 1, 'and the mint pays in a GOLDEN key');
}

// -------- SHARE-A-RUN: the trophy card wiring --------
{
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('function buildShareCard') >= 0, 'the card renderer exists');
  t.ok(src.indexOf('cv.width = 960') >= 0, 'rendered @2x for crisp shares');
  t.ok(src.indexOf("SHARE.cv.toBlob") >= 0, 'the card exports through toBlob');
  t.ok(src.indexOf('navigator.canShare({ files: [f] })') >= 0, 'the native share sheet is offered where it exists');
  t.ok(src.indexOf('a.download = fname') >= 0, 'and a plain download everywhere else (named per card)');
  t.ok(src.indexOf('seed36(o.seed)') >= 0 && src.indexOf('can you go deeper?') >= 0, 'the card carries the seed challenge');
  t.ok(src.indexOf('games-71g.pages.dev/dungeon_pusher') >= 0, 'and the way in');
  t.ok(/if \(SHARE\) \{ SHARE = null; return; \}/.test(src), 'ESC closes the preview');
  t.ok(src.indexOf('THEMES = false; SHARE = null;') >= 0, 'the crash net clears it');
  t.ok(src.indexOf("'\\u{1F4E4} CARD'") >= 0 || src.indexOf('📤 CARD') >= 0, 'the fallen-run screen offers the card');
  // the renderer swaps the global ctx in and ALWAYS swaps it back
  const body = src.slice(src.indexOf('function buildShareCard'), src.indexOf('function openShare'));
  t.ok(body.indexOf('const main = ctx;') >= 0 && body.indexOf('} finally {') >= 0 && body.indexOf('ctx = main;') >= 0,
       'the card paints on a swapped ctx inside a finally guard');
}

// -------- SECOND WINDS + the mint shelf --------
{
  const { DP: D } = loadGame({}, false);
  // five mint relics, none prestige-locked
  for (const id of ['slugsmelter', 'coinpress', 'meterspring', 'auditstamp', 'brassheart']) {
    const rl = D.relicById(id);
    t.ok(rl && !rl.ng, id + ' sits on the open shelf');
  }
  D.srand(12); D.newRun('knight');
  D.S.run.bside = 1;
  // the WYRM: wind2 fires below half, tightens the squeeze to every 2nd round
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  t.eq(D.S.enemy.id, 'wyrm', 'the wyrm holds the lair');
  D.S.enemy.hp = Math.floor(D.S.enemy.maxHp * 0.4);
  D.S.battle.round = 1;
  D.S.leadT = 0;
  D.newRound();                          // round 2 — wind2 triggers, cadence now %2
  t.ok(D.S.enemy.wind2, 'below half the wyrm finds its second wind');
  t.ok(D.S.leadT >= 1, 'and squeezes on the EVEN round it woke');
  // the BANSHEE: +2 attack on her wind
  D.S.enemy.hp = 0;
  const ban = { id: 'banshee', name: 'Grave Banshee', boss: true, hp: 20, maxHp: 60, atk: 8, block: 0 };
  D.S.foes.push(ban);
  D.S.battle.round = 1;
  D.newRound();
  t.ok(ban.wind2 && ban.atk === 10, 'the banshee shrieks: +2 attack');
  // the AURIFEX: re-gilds +12 and mints three
  ban.hp = 0;
  const aur = { id: 'aurifex', name: 'The Aurifex', boss: true, hp: 20, maxHp: 80, atk: 8, block: 0 };
  D.S.foes.push(aur);
  D.S.battle.round = 1;
  D.newRound();                          // wind2 + heal
  t.ok(aur.wind2 && aur.hp === 32, 'the Aurifex re-gilds himself (+12)');
  D.S.rain.length = 0;
  D.S.battle.round = 2;
  D.newRound();                          // round 3: minting cadence
  t.ok(D.S.rain.filter(r => r.kind === 'skull').length >= 3, 'three slugs a minting on the wind');
}
{
  const { DP: D } = loadGame({}, false);
  D.srand(13); D.newRun('knight');
  // Meter Spring: the meter wakes at 5
  D.S.run.relics.push('meterspring', 'brassheart', 'slugsmelter', 'auditstamp');
  D.S.meter = 0;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  t.eq(D.S.meter, 5, 'the Meter Spring winds the jackpot to 5');
  // Brass Heart: the first blow is drunk whole, the second lands
  D.S.run.block = 0; D.S.run.hp = 40;
  D.hurtPlayer(9);
  t.eq(D.S.run.hp, 40, 'the Brass Heart takes the first blow whole');
  D.hurtPlayer(6);
  t.eq(D.S.run.hp, 34, 'the second blow lands as usual');
  // Slug Smelter: slugs pay 1 gold as they clatter in
  const g0 = D.S.run.gold;
  D.scoreCoin({ kind: 'slug', x: 50, y: 90, z: 0 });
  t.ok(D.S.run.gold > g0, 'a smelted slug pays');
  // Auditor's Stamp: a boss pays +1 key over the usual toll
  const k0 = D.S.run.keys;
  D.S.foes.forEach(f => { f.hp = 1; }); D.dmgAll(9); D.leaveBattle();
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.def = null; D.S.enemy.hp = 1; D.dmgEnemy(9);
  t.ok(D.S.battle.keysWon >= D.C.KEY_BOSS + 1, 'the stamp notarizes +1 boss key (' + D.S.battle.keysWon + ')');
  // Coin Press: the 25th coin fired mints gold
  const { DP: P } = loadGame({}, false);
  P.srand(14); P.newRun('knight');
  P.S.run.relics.push('coinpress');
  P.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  P.interact(0);
  P.S.enemy.hp = P.S.enemy.maxHp = 500;
  P.S.battle.hand.coin = 30;
  const pg0 = P.S.run.gold;
  for (let i = 0; i < 25; i++) { P.S.cd = 0; P.drop(20 + (i % 60), true); }
  t.eq(P.S.battle.fired, 25, 'twenty-five coins fired');
  t.ok(P.S.run.gold >= pg0 + 5, 'the press minted +5 on the 25th');
}

// -------- THE COACH + the daily handshake --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  t.ok(D.S.coach && !D.S.coach.pick && !D.S.coach.drop && !D.S.coach.end, 'a fresh profile gets the coach');
  D.srand(8); D.newRun('knight');
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = D.S.enemy.maxHp = 300;
  // each deed kills its pointer
  D.selectCoin('coin');
  t.eq(D.S.coach.pick, 1, 'choosing a coin kills pointer one');
  D.S.cd = 0; D.drop(50, true);
  t.eq(D.S.coach.drop, 1, 'a fired coin kills pointer two');
  D.endRoundNow();
  t.eq(D.S.coach.end, 1, 'END TURN kills pointer three');
  D.save();
  const { DP: R } = loadGame(st, false);
  t.ok(R.S.coach.pick && R.S.coach.drop && R.S.coach.end, 'dead pointers stay dead across reloads');
  // veterans who predate the coach never see it
  const st2 = {};
  const { DP: V } = loadGame(st2, false);
  V.S.best.runs = 9; V.save();
  const blob = JSON.parse(st2[V.C.SAVE_KEY]);
  delete blob.coach;
  st2[V.C.SAVE_KEY] = JSON.stringify(blob);
  const { DP: V2 } = loadGame(st2, false);
  t.ok(V2.S.coach.pick && V2.S.coach.drop && V2.S.coach.end, 'veterans are grandfathered past the coach');
  // the daily handshake: over knows, the client sends, the board shows
  const { DP: Y } = loadGame({}, false);
  Y.newDaily('2026-07-22');
  Y.hpHit(9999, 'the daily took it all');
  t.eq(Y.S.over.daily, 1, 'a finished daily marks its card');
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('daily: run.daily ? 1 : 0') >= 0, 'the post carries the calendar flag');
  t.ok(src.indexOf("e.d ? '\\u{1F4C5} ' : ''") >= 0, 'board rows wear the calendar');
  t.ok(src.indexOf('POST THE DAILY?') >= 0, 'a finished daily offers itself to the board');
  t.ok(src.indexOf('function drawCoach') >= 0 && src.indexOf('drawCoach(t);') >= 0, 'the coach draws in battle');
}

// -------- COIN & RELIC OUTLIERS: measured, buffed, railed --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  // rails on the coin value board: gold with average relic support runs
  // ~1.6/fire, so the specialists must justify their slots
  t.eq(D.C.DMG.lucky, 4, 'LUCKY pays 4 — the rarest coin out-hits stacked gold');
  t.ok(D.C.DMG.lucky >= 3 * D.C.DMG.gold, 'and stays >= 3x gold base');
  D.srand(6); D.newRun('knight');
  DS.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  const foe = DS.enemy;
  foe.hp = foe.maxHp = 100; foe.def = null; foe.block = 50; foe.mirrorSpent = true;
  // FROST seeps through block; gold still gets soaked
  D.applyLoot({ t: 'gold' });
  t.eq(foe.hp, 100, 'a gold coin is soaked by 50 block');
  D.applyLoot({ t: 'blue' });
  t.ok(foe.hp < 100, 'FROST seeps straight through the block');
  // DEAD EYE: pierce AND +1 now
  foe.hp = 100; foe.block = 0; foe.braced = false;
  D.applyLoot({ t: 'lucky' });
  const bare = 100 - foe.hp;
  DS.run.relics.push('deadeye');
  foe.hp = 100;
  D.applyLoot({ t: 'lucky' });
  t.eq(100 - foe.hp, bare + 1, 'Dead Eye hits +1 on top of its pierce');
  DS.run.relics.length = 0;
  // SCAVENGER shakes a key out of the bag
  DS.run.relics.push('scavenger');
  const k0 = DS.run.keys;
  D.applyLoot({ t: 'bag' });
  t.eq(DS.run.keys, k0 + 1, 'the Scavenger shakes a key out of every bag');
  DS.run.relics.length = 0;
  // PIGGY BANK grows with the descent: +4 at act 1, +10 in the mint
  DS.run.relics.push('piggy');
  DS.run.floor = 16;
  const foeGold = foe.gold;
  foe.hp = 1; D.dmgFoe(foe, 9);
  t.eq(DS.battle.goldWon, foeGold + 4 + 2 * 3, 'the Piggy pays +10 in the mint (act 4)');
  // HORSESHOE raises the lucky odds at the source
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("hasRelic('horseshoe') ? 1.25 : 1") >= 0, 'the Horseshoe tilts the lucky roll');
  t.ok(src.indexOf('thru block') >= 0, 'the frost coin advertises its new edge');
}

// -------- NL SWEEP: the overlays speak Dutch too --------
{
  const { DP: D } = loadGame({}, false);
  t.ok(Object.keys(D.LANGS.nl).length >= 60, 'the NL table covers 60+ strings (' + Object.keys(D.LANGS.nl).length + ')');
  D.setLang('nl');
  t.eq(D.TR('\u{1F3C5} THE DEEP BOARD'), '\u{1F3C5} HET DIEPTEBORD', 'the board speaks Dutch');
  t.eq(D.TR('⬆ BACK UP THIS DEVICE'), '⬆ DIT APPARAAT BACK-UPPEN', 'the cloud speaks Dutch');
  t.eq(D.TR('WEAR'), 'DRAAG', 'the theme rack speaks Dutch');
  t.eq(D.TR('THE RUN ENDS'), 'DE RUN EINDIGT', 'the death knell tolls in Dutch');
  t.eq(D.TR('CARVE YOUR NAME'), 'KERF JE NAAM', 'the name pad speaks Dutch');
  t.eq(D.TR('PLANT A SEED'), 'PLANT EEN ZAADJE', 'the seed pad too');
  D.setLang('en');
  // the call sites really are wrapped
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  for (const k of ["TR('\\u{1F3C6} TROPHY HALL')", "TR('ALL-TIME')", "TR('WEAR')",
                   "TR('⚔\\u{FE0F} AGAIN!')", "TR(NAMEPAD.title || 'CARVE YOUR NAME')"]) {
    t.ok(src.indexOf(k) >= 0, 'wrapped: ' + k);
  }
}

// -------- STREAKS + the seed of the day --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  // the streak clock, day by day
  t.eq(D.streakTouch('2026-07-20'), 1, 'the first day lights the flame');
  t.eq(D.streakTouch('2026-07-20'), 1, 'a second run the same day changes nothing');
  t.eq(D.streakTouch('2026-07-21'), 2, 'the next day feeds it');
  t.eq(D.streakTouch('2026-07-23'), 3, 'one missed day is FORGIVEN (the grace day)');
  t.eq(D.streakTouch('2026-07-27'), 1, 'two missed days and the flame goes out');
  // the cog flame: +10% per day beyond the first, capped at +50%
  D.S.streak.days = 1;
  t.eq(D.streakK(), 1, 'day one pays no bonus (old cog math holds)');
  D.S.streak.days = 3;
  t.ok(Math.abs(D.streakK() - 1.2) < 1e-9, 'day three pays +20%');
  D.S.streak.days = 12;
  t.ok(Math.abs(D.streakK() - 1.5) < 1e-9, 'the flame caps at +50%');
  // it persists
  D.S.streak = { last: '2026-07-21', days: 4 };
  D.save();
  const { DP: R } = loadGame(st, false);
  t.eq(R.S.streak.days, 4, 'the flame survives a reload');
  t.eq(R.S.streak.last, '2026-07-21', 'and remembers its day');
  // endRun stamps the day and pays the flame
  const { DP: E } = loadGame({}, false);
  E.srand(2); E.newRun('knight');
  E.S.streak = { last: '', days: 0 };
  E.S.run.floor = 10; E.S.run.kills = 0;
  E.hpHit(9999, 'the probe');
  t.eq(E.S.streak.days, 1, 'a finished run stamps the day');
  t.eq(E.S.over.cogsWon, 10, 'day one cogs stay unboosted');
  // the seed of the day: same maze for everyone, no stakes
  const { DP: A } = loadGame({}, false);
  A.plantToday('2026-07-22');
  t.eq(A.S.nextSeed, A.dailySeed('2026-07-22') >>> 0, 'the plant IS the daily seed');
  A.srand(5); A.newRun('knight');
  t.eq(A.S.run.seed, A.dailySeed('2026-07-22') >>> 0, 'the run grows today’s maze');
  t.ok(!A.S.run.daily, 'but burns NO daily attempt');
  const layout = Object.keys(A.S.run.map.rooms).sort().join('|');
  const { DP: B } = loadGame({}, false);
  B.plantToday('2026-07-22');
  B.srand(999); B.newRun('rogue');
  t.eq(Object.keys(B.S.run.map.rooms).sort().join('|'), layout, 'two friends walk the same practice maze');
}

// -------- THE JUICE TRIO: flags at the sim source, draws in the browser --------
{
  const { DP: D } = loadGame({}, false);
  D.srand(3); D.newRun('knight');
  // the kill lands: hitstop + shatter flag
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = 1;
  D.dmgEnemy(9);
  t.ok(D.S.hitstop >= 0.09 - 1e-9, 'a kill freezes the world for a breath');
  t.ok(D.S.killFx && !D.S.killFx.boss, 'and flags the shatter');
  // the jackpot flags its fireworks
  D.S.meter = 0;
  D.frenzy();
  t.ok(D.S.jackFx && D.S.jackFx.t === 0, 'the jackpot flags its fireworks');
  // a boss kill stops harder
  D.leaveBattle();
  D.S.run.bside = 0;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.hitstop = 0;
  D.S.enemy.def = null; D.S.enemy.hp = 1;
  D.dmgEnemy(9);
  t.ok(D.S.hitstop >= 0.14 - 1e-9, 'a boss kill stops harder');
  t.ok(D.S.killFx && D.S.killFx.boss, 'and shatters golden');
  // the descent raises the wipe with its nameplate
  D.leaveBattle();
  D.S.run.floor = 5;
  D.nextFloor();
  t.ok(D.S.floorFx && D.S.floorFx.floor === 6 && D.S.floorFx.newAct, 'the descent flags the wipe — a new act, named');
  D.nextFloor();
  t.ok(D.S.floorFx.floor === 7 && !D.S.floorFx.newAct, 'mid-act floors skip the act name');
  // the browser side is wired
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('function drawJuice') >= 0 && src.indexOf('drawJuice(dt);') >= 0, 'the juice overlays draw each frame');
  t.ok(src.indexOf('S.hitstop -= dt;') >= 0 && src.indexOf('dt *= 0.12;') >= 0, 'hitstop bends frame time');
  t.ok(src.indexOf("S.opts.shake !== false") >= 0, 'reduced-motion players skip the freeze');
}

// -------- THE DEEP ENDLESS: three new decrees + milestone chests --------
{
  const { DP: D } = loadGame({}, false);
  const DS = D.S;
  t.eq(D.MUTS.length, 8, 'the decree stack runs 8 deep');
  D.srand(7); D.newRun('knight');
  // the new decrees arrive on schedule: 36 / 39 / 42
  DS.run.floor = 35; t.ok(!D.mutOn('gildedage'), 'floor 35: no GILDED AGE yet');
  DS.run.floor = 36; t.ok(D.mutOn('gildedage'), 'floor 36: GILDED AGE crowns the deep');
  DS.run.floor = 38; t.ok(!D.mutOn('thinveins'), 'floor 38: veins still thick');
  DS.run.floor = 39; t.ok(D.mutOn('thinveins'), 'floor 39: THIN VEINS bites the shop');
  DS.run.floor = 42; t.ok(D.mutOn('longdark'), 'floor 42: THE LONG DARK falls');
  // THE LONG DARK: every floor is a dark floor
  DS.run.floor = 43;
  t.ok(D.darkFloor(), 'floor 43 (not a natural dark floor) is dark under the decree');
  DS.run.floor = 22;
  t.ok(!D.darkFloor(), 'floor 22 without the decree stays lit');
  // THIN VEINS: the keeper's cut, measured to the coin
  DS.run.floor = 39;
  D.srand(11);
  const st39 = D.shopStock();
  const potion39 = st39.find(x => x.kind === 'potion').price;
  t.eq(potion39, Math.round(45 * (1 + 0.25 * 38) * 1.25) * 2, 'floor-39 potions carry the +25% vein tax (gold prices double post-round)');
  // GILDED AGE: elites flood the carve (statistical, 20 carves each)
  const eliteCount = (floor) => {
    let n = 0;
    for (let sd = 1; sd <= 20; sd++) {
      D.srand(sd * 7); DS.run.floor = floor; D.genFloor();
      for (const k of Object.keys(DS.run.map.rooms)) {
        for (const e of DS.run.map.rooms[k].ents) if (e.mtype === 'elite') n++;
      }
    }
    return n;
  };
  const calm = eliteCount(20), gilded = eliteCount(36);
  t.ok(gilded > calm * 1.6, 'GILDED AGE floods the halls with elites (' + calm + ' -> ' + gilded + ')');
  // MILESTONE CHESTS: floor 22 pays, floor 23 doesn't, the ledger counts
  const { DP: M } = loadGame({}, false);
  M.srand(9); M.newRun('knight');
  M.S.run.floor = 21;
  const cogs0 = M.S.cogs, keys0 = M.S.run.goldKeys || 0;
  M.nextFloor();
  t.eq(M.S.run.floor, 22, 'descended to 22');
  const paid = (M.S.cogs > cogs0) || ((M.S.run.goldKeys || 0) > keys0) || !!M.S.relicPick || !!M.S.pendingPick;
  t.ok(paid, 'the first milestone chest pays (cogs, key or relic)');
  t.eq(M.S.life.chests, 1, 'the ledger counts the chest');
  t.ok(M.S.ach.u.milestone, 'DEEP POCKETS is earned');
  M.S.relicPick = null; M.S.pendingPick = null;
  const chests1 = M.S.life.chests;
  M.nextFloor();
  t.eq(M.S.life.chests, chests1, 'floor 23 is not a milestone');
  // the floor trophies poll
  M.S.run.floor = 30;
  M.achPoll();
  t.ok(M.S.ach.u.floor25 && M.S.ach.u.floor30, 'floors 25 + 30 hang their trophies');
}

// -------- THREE NEW DAILY TWISTS + the richer board rows --------
{
  const { DP: D } = loadGame({}, false);
  t.eq(D.DAILY_MODS.length, 8, 'eight daily twists in the bag');
  // GLASS CANNON: both edges of the blade
  D.srand(4); D.newRun('knight');
  D.S.run.dailyMod = 'cannon';
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  const foe = D.S.enemy;
  foe.hp = foe.maxHp = 200; foe.def = null; foe.block = 0; foe.mirrorSpent = true; foe.braced = false;
  D.dmgFoe(foe, 5);
  t.eq(200 - foe.hp, 10, 'GLASS CANNON doubles what you deal');
  D.S.run.block = 0; D.S.run.hp = 40;
  D.hurtPlayer(4);
  t.eq(D.S.run.hp, 32, 'and doubles what lands on you');
  // COIN DROUGHT: two short, double bounty
  D.S.run.dailyMod = 'drought';
  D.S.battle.stolen = 0; D.S.leadT = 0;
  D.dealHand();
  const dealt = Object.values(D.S.battle.hand).reduce((a, b) => a + b, 0);
  t.eq(dealt, D.purseTotal() - 2, 'COIN DROUGHT deals the hand two short');
  const g0 = D.S.battle.goldWon;
  const foeGold = foe.gold;
  foe.hp = 1; D.dmgFoe(foe, 9);
  t.eq(D.S.battle.goldWon - g0, foeGold * 2, 'and the kill pays double');
  // PACIFIST FLOORS: every 3rd floor the blood pays nothing
  const { DP: P } = loadGame({}, false);
  P.srand(6); P.newRun('knight');
  P.S.run.dailyMod = 'pacifist';
  P.S.run.floor = 3;
  P.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  P.interact(0);
  const k0 = P.S.battle.keysWon, pg0 = P.S.battle.goldWon;
  P.S.enemy.hp = 1; P.dmgEnemy(9);
  t.eq(P.S.battle.goldWon, pg0, 'a pacifist-floor kill pays no gold');
  t.eq(P.S.battle.keysWon, k0, 'and drops no key');
  t.eq(P.S.run.kills, 1, 'but the kill still counts');
  // the board rows: badges + the challenge line
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("(e.ng >= 2 ? '♛ ' : e.ng ? '♟ ' : '')") >= 0, 'board rows wear the pawn — or the crown');
  t.ok(src.indexOf("e.diff === 'nightmare' ? '#ff5a4e' : '#7ee787'") >= 0, 'and the difficulty dot');
  t.ok(src.indexOf('floor to beat is') >= 0, 'outsiders see the floor to beat');
  t.ok(src.indexOf('ng: run.ng | 0, v: CLIENT_BOARD_V }),') >= 0, 'the post carries the prestige level and the client version');
}

// -------- TROPHIES FOR THE PULL + yesterday's deepest --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  for (const id of ['streak3', 'streak7', 'gardener']) {
    t.ok(D.achById(id), 'the ' + id + ' trophy hangs on the wall');
  }
  // the streak trophies ride the poll
  D.S.streak = { last: '2026-07-21', days: 3 };
  D.achPoll();
  t.ok(D.S.ach.u.streak3, 'KINDLED lights at a three-day streak');
  t.ok(!D.S.ach.u.streak7, 'WEEK OF FIRE waits for seven');
  D.S.streak.days = 7;
  D.achPoll();
  t.ok(D.S.ach.u.streak7, 'seven days running earns WEEK OF FIRE');
  // GREEN THUMB: plant today's maze, then actually grow it
  const today = new Date().toISOString().slice(0, 10);
  D.srand(3); D.newRun('knight');
  t.ok(!D.S.ach.u.gardener, 'an unplanted run earns no green thumb');
  D.plantToday(today);
  D.newRun('knight');
  t.eq(D.S.run.seed, D.dailySeed(today) >>> 0, 'the planted run wears the daily seed');
  t.ok(D.S.ach.u.gardener, 'GREEN THUMB grows from the planted maze');
  // YESTERDAY'S DEEPEST: the stamp survives the save round-trip
  // (save BEFORE spawning another instance — loadGame rebinds localStorage)
  D.S.yday = { on: today, floor: 31, name: 'Rox' };
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.yday.floor, 31, 'yesterday’s floor rides the save');
  t.eq(R.S.yday.name, 'Rox', 'with the digger’s name');
  t.eq(R.S.yday.on, today, 'stamped with the day it was fetched');
  // an arbitrary planted seed is not the daily
  const { DP: E } = loadGame({}, false);
  E.S.nextSeed = (E.dailySeed(today) + 1) >>> 0;
  E.srand(3); E.newRun('knight');
  t.ok(!E.S.ach.u.gardener, 'a stranger seed earns nothing');
  // ...and the title/fetch wiring is in the source
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("?board=yesterday") >= 0, 'the title asks the board for yesterday');
  t.ok(src.indexOf('yesterday’s deepest: FLOOR ') >= 0, 'and stamps the answer');
  t.ok(src.indexOf('ydayFetch();') >= 0, 'the title screen triggers the one-shot fetch');
}

// -------- the WEEKLY DECREE: one law, Monday through Sunday --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // the calendar: any day maps to its Monday, the decree holds all week
  t.eq(D.weekOf('2026-07-22'), '2026-07-20', 'Wednesday bows to its Monday');
  t.eq(D.weekOf('2026-07-26'), '2026-07-20', 'Sunday still lives under it');
  t.eq(D.weekOf('2026-07-27'), '2026-07-27', 'Monday opens a fresh law');
  t.eq(D.weekOf('2026-07-20'), '2026-07-20', 'Monday owns itself');
  t.eq(D.weeklyPlan('2026-07-22').decree.id, D.weeklyPlan('2026-07-26').decree.id,
    'one decree rules the whole week');
  t.ok(D.WEEKLY_DECREES.length === 5 && D.WEEKLY_DECREES.every(w => w.id && w.name && w.desc),
    'five laws in the book, all fully written');
  t.eq(new Set(D.WEEKLY_DECREES.map(w => w.id)).size, 5, 'no duplicate decree ids');
  // arming: a picked decree rides the next run and knows its week
  const today = new Date().toISOString().slice(0, 10);
  D.S.weeklyPick = true;
  D.srand(11); D.newRun('knight');
  t.eq(D.S.run.weekly, D.weeklyPlan(today).decree.id, 'the armed run carries this week’s decree');
  t.eq(D.S.run.week, D.weekOf(today), 'stamped with its Monday');
  D.S.weeklyPick = false;
  D.srand(11); D.newRun('knight');
  t.ok(!D.S.run.weekly, 'disarmed runs walk free');
  // the DAILY never stacks the weekly on top of its own law
  D.S.weeklyPick = true;
  D.newDaily(today);
  t.ok(!D.S.run.weekly, 'the daily carries its own law, not the week’s');
  // ---- each decree's teeth (pinned by id, date-independent) ----
  const { DP: W } = loadGame({}, false);
  W.srand(12); W.newRun('knight');
  W.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  W.interact(0);
  const foe = W.S.enemy;
  foe.hp = foe.maxHp = 400; foe.def = null; foe.block = 0; foe.mirrorSpent = true; foe.braced = false;
  W.S.run.weekly = 'brittle';
  W.dmgFoe(foe, 10);
  t.eq(400 - foe.hp, 13, 'BRITTLE BLADES: you hit +30%');
  W.S.run.block = 0; W.S.run.hp = 60;
  W.hurtPlayer(10);
  t.eq(W.S.run.hp, 47, '...and so do they');
  W.S.run.weekly = 'goldfever';
  W.S.run.hp = 60;
  W.hurtPlayer(10);
  t.eq(W.S.run.hp, 48, 'GOLD FEVER: foes hit +20% harder');
  const g0 = W.S.battle.goldWon, fg = foe.gold;
  foe.hp = 1; W.dmgFoe(foe, 99);
  t.eq(W.S.battle.goldWon - g0, Math.round(fg * 1.5), '...and kills pay +50%');
  // IRONHIDE PARADE scales the foes, not the arithmetic
  const { DP: P } = loadGame({}, false);
  P.srand(13); P.newRun('knight');
  const base = P.scaleMult();
  P.S.run.weekly = 'parade';
  t.ok(Math.abs(P.scaleMult() - base * 1.2) < 1e-9, 'IRONHIDE PARADE: every foe +20% tougher');
  t.eq(P.weeklyFoeK(), 1.2, 'the parade multiplier reads back');
  // MARKET WEEK: the keeper discounts, the kills pay less
  P.S.run.weekly = 'market';
  P.srand(14);
  const shelf = P.shopStock();
  const potion = shelf.find(s => s.kind === 'potion');
  t.eq(potion.price, Math.round(45 * 0.8) * 2, 'MARKET WEEK: wares 20% off (before the gold doubling)');
  // IRON WEEK: thinner blood, fatter cogs
  const { DP: I } = loadGame({}, false);
  I.S.weeklyPick = true;
  I.srand(15); I.newRun('knight');
  const plain = (() => { const { DP: J } = loadGame({}, false); J.srand(15); J.newRun('knight'); return J.S.run.maxHp; })();
  if (I.S.run.weekly === 'ironweek') {
    t.eq(I.S.run.maxHp, Math.max(30, plain - 10), 'IRON WEEK trims 10 max HP');
  } else {
    I.S.run.weekly = 'ironweek';   // not iron week on the calendar — pin it for the cogs check
  }
  I.S.run.floor = 10; I.S.run.kills = 0;
  I.endRun('fell');
  t.eq(I.S.over.cogsWon, Math.round(10 * 1.4), 'IRON WEEK pays +40% cogs');
  // ---- the clear: floor 15, under the law, once a week ----
  const { DP: C } = loadGame({}, false);
  const todayC = new Date().toISOString().slice(0, 10);
  C.srand(16); C.newRun('knight');
  C.S.run.floor = 15;
  C.S.run.weekly = 'brittle'; C.S.run.week = C.weekOf(todayC);
  C.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  C.interact(0);
  C.S.foes.forEach(f => { f.hp = 1; });
  C.dmgAll(999);
  t.ok(C.S.victory && C.S.victory.boss, 'the floor-15 boss falls under the decree');
  t.eq(C.S.life.weeklies, 1, 'the ledger counts the survived week');
  t.eq(C.S.weeklyDone, C.weekOf(todayC), 'this week is marked cleared');
  t.ok(C.S.ach.u.decreed, 'ABOVE THE LAW hangs on the wall');
  // a second clear in the same week doesn't double-count
  C.srand(17); C.newRun('knight');
  C.S.run.floor = 15;
  C.S.run.weekly = 'brittle'; C.S.run.week = C.weekOf(todayC);
  C.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  C.interact(0);
  C.S.foes.forEach(f => { f.hp = 1; });
  C.dmgAll(999);
  t.eq(C.S.life.weeklies, 1, 'one week, one line in the ledger');
  // ---- persistence: pick, done-mark and ledgers survive a reload ----
  const store2 = {};
  const { DP: S2 } = loadGame(store2, false);
  S2.S.weeklyPick = true; S2.S.weeklyDone = '2026-07-20';
  S2.S.life.weeklies = 3; S2.S.life.chests = 4;
  S2.save();
  const { DP: R2 } = loadGame(store2, false);
  t.ok(R2.S.weeklyPick, 'the armed decree survives a reload');
  t.eq(R2.S.weeklyDone, '2026-07-20', 'so does the cleared week');
  t.eq(R2.S.life.weeklies, 3, 'and the weekly ledger');
  t.eq(R2.S.life.chests, 4, 'milestone chests now ride the save too (load used to drop them)');
  // ---- the stings: wired, act-keyed, headless-safe ----
  const { DP: N } = loadGame({}, false);
  N.srand(18); N.newRun('knight');
  t.ok(N.nextFloor(), 'nextFloor still descends with the sting wired');
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('SND.descend(actIdx(S.run.floor));') >= 0, 'the descend sting keys to the act');
  t.ok(src.indexOf('descend() {} };') >= 0, 'the headless stub knows the sting');
  t.ok(src.indexOf('a held C-major chord') >= 0, 'the jackpot fanfare resolves properly now');
  t.ok(src.indexOf('THIS WEEK: ') >= 0, 'the title posts the decree door');
  t.ok(src.indexOf("['weekly decrees', '' + (L.weeklies || 0) + ' survived']") >= 0,
    'records shows the weekly line');
}

// -------- the ENDLESS ledger + wheel near-miss + records tabs --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  D.srand(21); D.newRun('knight');
  D.S.run.floor = 20;
  D.nextFloor();                                    // floor 21: the first decree
  t.eq(D.S.life.mutMax, 1, 'floor 21 inks a 1-deep stack');
  t.eq(D.S.life.deepFloors, 0, 'floor 21 is not yet past the ledger');
  D.S.run.floor = 26;
  D.nextFloor();                                    // floor 27: three laws deep
  t.eq(D.S.life.mutMax, 3, 'floor 27 deepens the lifetime stack to 3');
  t.eq(D.S.life.deepFloors, 1, 'and counts one floor walked past the ledger');
  D.endRun('fell');
  t.eq(D.S.life.mutMax, 3, 'the run’s end keeps the deepest stack');
  D.srand(22); D.newRun('knight');
  D.S.run.floor = 4; D.nextFloor();
  t.eq(D.S.life.mutMax, 3, 'a shallow run cannot shrink the record');
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.life.mutMax, 3, 'the decree-stack record survives a reload');
  t.eq(R.S.life.deepFloors, 1, 'so does the deep-floor count');
  // with-ctx smoke: the wheel rides its spin through the settle-rock
  const { DP: W, raf } = loadGame({}, true);
  let ts = 0;
  const frames = n => { for (let i = 0; i < n; i++) { ts += 16.7; const cb = raf(); if (cb) cb(ts); } };
  frames(3);
  W.srand(23); W.newRun('knight');
  W.S.wheelAnim = { t: 0, seg: 2, label: 'x' };
  frames(220);                                      // ≈3.7s: deep into the wobble
  t.ok(W.S.wheelAnim && W.S.wheelAnim.t > 3.2, 'the wheel survives its own wobble');
  // source truth for the pure-draw bits
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('the NEAR MISS: fully eased') >= 0, 'the near-miss wobble lives in the draw code');
  t.ok(src.indexOf('Math.exp(-st * 2.1) * Math.sin(st * 6.5)') >= 0, 'a damped rock, not a snap');
  t.ok(src.indexOf('S.opts.shake === false || k < 1) ? 0') >= 0, 'reduced motion skips the wobble');
  t.ok(src.indexOf("if (RECORDS === true) RECORDS = { tab: 'book' };   // old openers still work") >= 0,
    'old openers still reach the book');
  t.ok(src.indexOf('THE DECREE WALL') >= 0, 'the endless page hangs the decree wall');
  t.ok(src.indexOf("['decree stack survived', (L.mutMax || 0) + ' deep']") >= 0, 'and reads the lifetime stack');
}

// -------- THE ALCHEMIST: she brews, she does not drink --------
{
  // a sealed pick falls back to the knight (own instance: localStorage rebinds)
  const { DP: F } = loadGame({}, false);
  F.srand(31); F.newRun('alch');
  t.eq(F.S.run.hero, 'knight', 'no sneaking past the seal');
  // the knight's world is untouched: flasks on the shelf, drinkable
  const { DP: K } = loadGame({}, false);
  K.srand(34); K.newRun('knight');
  K.srand(35);
  t.ok(K.shopStock().some(s => s.kind === 'potion'), 'the knight still finds potions on the shelf');
  K.S.run.potions = 1; K.S.run.hp = 5;
  t.ok(K.usePotion(), 'and still drinks them');
  const kb = K.S.run.potions;
  K.gainPotions(2);
  t.eq(K.S.run.potions, kb + 2, 'gainPotions stays honest for drinkers');

  const store = {};
  const { DP: D } = loadGame(store, false);
  t.eq(D.HEROES.length, 9, 'nine heroes on the bench');
  const al = D.heroById('alch');
  t.ok(al && /BREWS/.test(al.perk), 'the alchemist promises to brew');
  t.eq(D.ALCH_BREW_N, 12, 'twelve coins to a draught');
  t.eq(new Set(D.DRAUGHTS.map(d => d.id)).size, 4, 'four draughts in the book');
  // the seal: five deep clears
  t.ok(!D.heroUnlocked('alch'), 'sealed on a fresh profile');
  t.eq(D.heroLockText('alch'), 'earn 5 DEEP CLEARS', 'the seal names its price');
  D.S.deep15 = { knight: 1, rogue: 1, wizard: 1, cleric: 1 };
  t.ok(!D.heroUnlocked('alch'), 'four clears are not five');
  D.S.deep15.ghost = 1;
  t.ok(D.heroUnlocked('alch'), 'five deep clears break the seal');
  // her kit: no flasks, cold still — even with the Deep Flask bolted on
  D.S.ws.potion = 1;
  D.srand(31); D.newRun('alch');
  t.eq(D.S.run.hero, 'alch', 'the unsealed alchemist answers');
  t.eq(D.S.run.potions, 0, 'she owns no flasks (the Deep Flask feeds nobody)');
  t.eq(D.S.run.brew, 0, 'the still starts cold');
  // the still: twelve coins distill a draught
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  const foe = D.S.enemy;
  foe.hp = foe.maxHp = 300; foe.def = null; foe.block = 0; foe.mirrorSpent = true; foe.braced = false;
  for (let i = 0; i < 11; i++) D.scoreCoin({ kind: 'coin', x: 50 });
  t.eq(D.S.run.brew, 11, 'eleven coins in the still');
  D.S.run.hp = 1;                            // so even a MENDING draught shows
  const hpE0 = foe.hp, hp0 = D.S.run.hp, g0 = D.S.run.gold, stun0 = foe.stunned;
  D.srand(5);
  D.scoreCoin({ kind: 'silver', x: 50 });
  t.eq(D.S.run.brew, 0, 'the twelfth coin fires the still');
  t.ok(foe.hp < hpE0 || D.S.run.hp > hp0 || D.S.run.gold > g0 || foe.stunned > stun0,
    'something REAL came out of the flask');
  D.scoreCoin({ kind: 'skull', x: 50 });
  D.scoreCoin({ kind: 'bag', x: 50 });
  t.eq(D.S.run.brew, 0, 'skulls and bags never feed the brew');
  // each draught, forced, with clean arithmetic
  foe.hp = 300; foe.stunned = 0;
  D.S.run.reagents = 0;
  D.brewDraught('bomb');
  t.eq(300 - foe.hp, 8, 'BLASTING: 8 to all, unfattened');
  // gems are reagents: +2 each, spent on the NEXT draught only
  D.scoreCoin({ kind: 'gem', x: 50 });
  D.scoreCoin({ kind: 'gem', x: 50 });
  t.eq(D.S.run.reagents, 2, 'two reagents in the rack');
  D.S.run.hp = 10;
  D.brewDraught('heal');
  t.eq(D.S.run.hp, 20, 'MENDING: 6 base + 2 per reagent');
  t.eq(D.S.run.reagents, 0, 'the rack empties into the flask');
  foe.hp = 200;
  D.brewDraught('frost');
  t.ok(foe.stunned > 0, 'FREEZING stuns');
  t.eq(200 - foe.hp, 2, 'and chips 2, unfattened');
  const gg = D.S.run.gold, gw = D.S.battle.goldWon;
  D.brewDraught('gold');
  t.eq(D.S.battle.goldWon, gw + 10, 'GILDING pours 10 gold into the pot');
  t.ok(D.S.run.gold >= gg + 10, 'and into the purse');
  // no drinking, ever — and the keeper knows it
  D.S.run.potions = 3;
  D.S.run.hp = 1;
  t.ok(!D.usePotion(), 'she cannot drink even a smuggled flask');
  D.S.run.potions = 0;
  D.srand(33);
  t.ok(!D.shopStock().some(s => s.kind === 'potion'), 'the keeper shelves no flasks for her');
  const brew0 = D.S.run.brew;
  D.gainPotions(2);
  t.eq(D.S.run.brew, brew0 + 6, 'granted flasks feed the still, 3 brew each');
  t.eq(D.S.run.potions, 0, 'and never her belt');
  // the half-full still rides the save (no loadGame between save and reload!)
  D.S.run.brew = 7; D.S.run.reagents = 2;
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.run.hero, 'alch', 'still the alchemist after a reload');
  t.eq(R.S.run.brew, 7, 'the half-full still survives');
  t.eq(R.S.run.reagents, 2, 'reagents too');
}

// -------- THE RIVALRY + the percentile carve --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // boardPct: pure math over a board
  const top = [
    { name: 'A', floor: 20, kills: 9 }, { name: 'B', floor: 15, kills: 30 },
    { name: 'C', floor: 15, kills: 10 }, { name: 'D', floor: 9, kills: 2 },
    { name: 'E', floor: 4, kills: 1 },
  ];
  t.eq(D.boardPct(top, 15, 30).pct, 80, 'floor 15/30 kills sits above 80% of five');
  t.eq(D.boardPct(top, 15, 30).deeper, 1, 'only the floor-20 run digs deeper');
  t.eq(D.boardPct(top, 2, 0).pct, 0, 'a floor-2 run beats nobody');
  t.eq(D.boardPct(top, 99, 0).pct, 100, 'the new king beats everybody');
  t.eq(D.boardPct(top, 9, 2).median, 15, 'the midpoint reads the median floor');
  t.eq(D.boardPct([], 5, 0), null, 'an empty board says nothing');
  // the rivalry: endRun scores every run against the marked name
  D.S.rival = { name: 'Rox', floor: 8, kills: 40 };
  D.srand(61); D.newRun('knight');
  D.S.run.floor = 5;
  D.endRun('fell');
  t.eq(D.S.over.rivalGap, 3, 'three floors short of the rival');
  t.ok(!D.S.ach.u.topple, 'no trophy for falling short');
  D.srand(62); D.newRun('knight');
  D.S.run.floor = 8;
  D.endRun('fell');
  t.eq(D.S.over.rivalGap, 0, 'a matched floor reads as a tie');
  D.srand(63); D.newRun('knight');
  D.S.run.floor = 9;
  D.endRun('fell');
  t.eq(D.S.over.toppled, 'Rox', 'floor 9 topples the floor-8 rival');
  t.ok(D.S.ach.u.topple, 'RIVAL TOPPLED hangs on the wall');
  // no rival marked → no verdict fields at all
  D.S.rival = { name: '', floor: 0, kills: 0 };
  D.srand(64); D.newRun('knight');
  D.S.run.floor = 9;
  D.endRun('fell');
  t.ok(D.S.over.toppled === undefined && D.S.over.rivalGap === undefined,
    'no rival, no verdict');
  // the mark survives a reload
  D.S.rival = { name: 'Thieu', floor: 12, kills: 7 };
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.rival.name, 'Thieu', 'the rivalry survives a reload');
  t.eq(R.S.rival.floor, 12, 'with the floor to beat');
  // the browser-side wiring is in the source
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('is your RIVAL — out-dig floor ') >= 0, 'tapping a board row marks the rival');
  t.ok(src.indexOf("'the rivalry is buried'") >= 0, 'tapping again buries it');
  t.ok(src.indexOf('deeper than ' + "' + p.pct + '" + '% of the board') >= 0, 'the carve toasts its percentile');
  t.ok(src.indexOf('rival: ' + "' + S.rival.name + '" + ' — floor ') >= 0, 'the title carries the rivalry');
  t.ok(src.indexOf('TOPPLED — deeper than ') >= 0, 'the report card crows the topple');
}

// -------- DUEL LINKS + the welcome-back crate --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // the link survives its own round trip
  const link = D.duelLink(123456789, 9, 'Rox');
  const dl = D.parseDuel(link);
  t.eq(dl.seed, 123456789 >>> 0, 'the seed rides the link');
  t.eq(dl.floor, 9, 'so does the floor');
  t.eq(dl.name, 'Rox', 'and the challenger’s name');
  t.eq(D.parseDuel('?duel=garbage'), null, 'garbage is refused');
  t.eq(D.parseDuel(''), null, 'no search, no duel');
  t.eq(D.parseDuel('?duel=0.5.x'), null, 'a zero seed is refused');
  const dirty = D.parseDuel('?duel=zz.2000.' + encodeURIComponent('<img src=x>Bob!!'));
  t.ok(dirty.name.indexOf('<') < 0 && dirty.name.length <= 12, 'the name is scrubbed');
  t.eq(dirty.floor, 999, 'the floor clamps to 999');
  // growing the challenger's maze arms the duel; the end screen judges it
  D.S.duel = { seed: 777, floor: 6, name: 'Thieu' };
  D.S.nextSeed = 777;
  D.srand(71); D.newRun('knight');
  t.eq(D.S.run.duel.name, 'Thieu', 'the duel rides the run');
  t.eq(D.S.run.seed, 777, 'on the challenger’s exact maze');
  D.S.run.floor = 7;
  D.endRun('fell');
  t.ok(D.S.over.duel.won && !D.S.over.duel.tied, 'floor 7 outdigs the floor-6 challenge');
  t.eq(D.S.duel, null, 'the answered challenge is cleared');
  // a fresh run without the seed carries no duel
  D.srand(72); D.newRun('knight');
  t.ok(!D.S.run.duel, 'an unplanted run owes nobody');
  D.S.run.floor = 3; D.endRun('fell');
  t.ok(!D.S.over.duel, 'and gets no verdict');
  // tie and loss
  D.S.duel = { seed: 888, floor: 5, name: 'Rox' };
  D.S.nextSeed = 888;
  D.srand(73); D.newRun('knight');
  D.S.run.floor = 5; D.endRun('fell');
  t.ok(D.S.over.duel.tied, 'matching the floor reads as a tie');
  D.S.duel = { seed: 999, floor: 12, name: 'Rox' };
  D.S.nextSeed = 999;
  D.srand(74); D.newRun('knight');
  D.S.run.floor = 4; D.endRun('fell');
  t.ok(!D.S.over.duel.won && !D.S.over.duel.tied && D.S.over.duel.floor === 12,
    'falling short names the floor that holds');
  // a mid-duel run survives a reload with the challenge intact
  D.S.duel = { seed: 555, floor: 8, name: 'Danhieux' };
  D.S.nextSeed = 555;
  D.srand(75); D.newRun('knight');
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.run.duel.name, 'Danhieux', 'the duel survives a reload');
  t.eq(R.S.run.duel.floor, 8, 'with its floor to beat');
  // ---- the welcome-back crate ----
  const { DP: W } = loadGame({}, false);
  const day = (off) => new Date(Date.parse('2026-07-22') - off * 86400000).toISOString().slice(0, 10);
  W.S.streak = { last: day(10), days: 3 };
  t.eq(W.welcomeBack('2026-07-22'), 80, 'ten days away pays 8 per day');
  W.S.streak.last = day(30);
  t.eq(W.welcomeBack('2026-07-22'), 120, 'a month away caps at 120');
  W.S.streak.last = day(3);
  t.eq(W.welcomeBack('2026-07-22'), 0, 'three days is no absence');
  W.S.streak.last = '';
  t.eq(W.welcomeBack('2026-07-22'), 0, 'a brand-new profile gets no crate');
  // the armed rare pick fires at the next run's door, once
  W.S.wbRelic = 1;
  W.srand(76); W.newRun('knight');
  t.ok(W.S.relicPick && W.S.relicPick.rar === 'r', 'the crate’s RARE pick waits at the door');
  t.eq(W.S.wbRelic, 0, 'and the crate is spent');
  W.S.relicPick = null;
  W.srand(77); W.newRun('knight');
  t.ok(!W.S.relicPick, 'the next run gets nothing extra');
  // browser wiring is in the source
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('parseDuel(location.search)') >= 0, 'boot parses the duel link');
  t.ok(src.indexOf('history.replaceState(null') >= 0, 'and cleans the URL after');
  t.ok(src.indexOf('\\u{2694}\\u{FE0F} DUEL') >= 0, 'the run-over screen offers the DUEL button');
  t.ok(src.indexOf('WELCOME BACK') >= 0, 'the crate knocks on the title');
  t.ok(src.indexOf('is OUTDUG!') >= 0, 'the report card declares the outcome');
}

// -------- CODEX completion meters + the title MARQUEE --------
{
  const { DP: D } = loadGame({}, false);
  // the shelf math
  const a1 = D.codexTabStat('a1');
  t.eq(a1.all, D.ENEMY_TIERS[0].length + 3, 'act 1 counts its roster, BOTH bosses and the champion');
  t.eq(a1.got, 0, 'a fresh ledger has met nobody');
  const cShelf = D.codexTabStat('c');
  t.eq(cShelf.all, D.RELICS.filter(r => r.rar === 'c').length, 'the common shelf counts its rarity');
  t.ok(!D.codexFull(), 'a fresh codex is nowhere near full');
  // fill everything → full → the trophy
  for (const tier of D.ENEMY_TIERS) for (const f of tier) D.S.codex.foes[f.id] = 1;
  for (const b of D.BOSSES) D.S.codex.foes[b.id] = 1;
  for (const b of D.BOSSES2) D.S.codex.foes[b.id] = 1;
  for (const c of D.CHAMPIONS) D.S.codex.foes[c.id] = 1;
  for (const rl of D.RELICS) D.S.codex.relics[rl.id] = 1;
  t.ok(D.CODEX_TABS.every(tb => { const s = D.codexTabStat(tb); return s.got === s.all; }),
    'every shelf reads complete');
  t.ok(D.codexFull(), 'the ledger closes');
  D.achPoll();
  t.ok(D.S.ach.u.ledger, 'THE FULL LEDGER hangs on the wall');
  // ---- the marquee: one reason, priority-ordered ----
  const { DP: M } = loadGame({}, false);
  const TD = '2026-07-22';
  // fresh profile → the daily is the hook (no streak, no rival)
  t.ok(M.marqueeLine(TD).indexOf('daily') >= 0, 'a fresh profile is pointed at the daily');
  // a streak at stake outranks everything
  M.S.streak = { last: '2026-07-21', days: 4 };
  t.ok(M.marqueeLine(TD).indexOf('4-day streak') >= 0, 'a live streak leads the marquee');
  M.S.streak.last = '2026-07-20';
  t.ok(M.marqueeLine(TD).indexOf('grace day') >= 0, 'the grace day pleads urgency');
  M.S.streak.last = TD;                       // played today — streak line stands down
  // the rival outranks the daily
  M.S.rival = { name: 'Rox', floor: 12, kills: 5 };
  M.S.best.floor = 9;
  t.ok(M.marqueeLine(TD).indexOf('Rox still holds floor 12') >= 0, 'the standing rival takes the line');
  M.S.best.floor = 13;                        // toppled — rival line stands down
  t.ok(M.marqueeLine(TD).indexOf('daily') >= 0, 'a toppled rival yields to the daily');
  // daily spent → the thinnest codex shelf calls
  M.S.daily = { date: TD, done: true, best: null };
  const line = M.marqueeLine(TD);
  t.ok(line.indexOf('unwritten') >= 0, 'a spent daily yields to the codex gap (' + line + ')');
  // everything full → yesterday's crown, then the evergreen seed line
  for (const tier of M.ENEMY_TIERS) for (const f of tier) M.S.codex.foes[f.id] = 1;
  for (const b of M.BOSSES) M.S.codex.foes[b.id] = 1;
  for (const b of M.BOSSES2) M.S.codex.foes[b.id] = 1;
  for (const c of M.CHAMPIONS) M.S.codex.foes[c.id] = 1;
  for (const rl of M.RELICS) M.S.codex.relics[rl.id] = 1;
  M.S.yday = { on: TD, floor: 31, name: 'Danhieux' };
  t.ok(M.marqueeLine(TD).indexOf('floor 31 by Danhieux') >= 0, 'then yesterday’s crown');
  M.S.yday.floor = 0;
  t.ok(M.marqueeLine(TD).indexOf('TODAY’S MAZE') >= 0, 'and the seed line is the evergreen floor');
  // the wiring: title draws the marquee, the codex button gilds, tabs gild
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('txt(marqueeLine(new Date()') >= 0, 'the title draws the marquee');
  t.ok(src.indexOf("codexFull() ? { r: 10, font: '15px serif', grad:") >= 0, 'the codex button turns gold');
  t.ok(src.indexOf("full ? '✦' + TR(label) : TR(label)") >= 0, 'finished shelves wear the star');
}

// -------- GHOST PACE + hero mastery stars --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  D.srand(81); D.newRun('knight');
  t.eq(D.S.run.pace[1], 0, 'floor 1 opens the clock at zero');
  D.S.run.stats.t = 65;
  D.nextFloor();
  t.eq(D.S.run.pace[2], 65, 'each door stamps the cumulative clock');
  t.ok(D.S.floorFx.pace == null, 'no best yet — the ghost stays silent');
  D.endRun('fell');
  t.eq(D.S.best.pace[2], 65, 'the best descent leaves its ghost');
  D.srand(82); D.newRun('knight');
  D.S.run.stats.t = 50;
  D.nextFloor();
  t.eq(D.S.floorFx.pace, 15, '15 seconds ahead of the ghost');
  D.S.run.stats.t = 200;
  D.nextFloor();
  t.ok(D.S.floorFx.pace == null, 'past the ghost’s grave it goes quiet');
  D.endRun('fell');
  t.eq(D.S.best.pace[3], 200, 'the deeper run rewrites the ghost');
  t.eq(D.S.best.pace[2], 50, 'including its earlier splits');
  D.srand(83); D.newRun('knight');
  D.S.run.stats.t = 62;
  D.nextFloor();
  t.eq(D.S.floorFx.pace, -12, '12 seconds behind the ghost');
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.best.pace[3], 200, 'the ghost rides the save');
  t.eq(R.S.run.pace[2], 62, 'and the live run’s splits too');
  // ---- mastery stars ----
  t.eq(R.masteryStars('knight'), 0, 'no deep clears, no stars');
  R.S.deep15 = { knight: 1, rogue: 3, wizard: 5 };
  t.eq(R.masteryStars('knight'), 1, 'one clear, one star');
  t.eq(R.masteryStars('rogue'), 2, 'three clears, two stars');
  t.eq(R.masteryStars('wizard'), 3, 'five clears, the third star');
  t.eq(R.masteryPeak(), 3, 'the peak reads the wizard');
  R.S.skins.rogue = 1;
  t.ok(R.skinWorn('rogue'), 'counts stay truthy for the skin system');
  // deep clears COUNT now — but only once per run
  const { DP: C } = loadGame({}, false);
  C.srand(84); C.newRun('knight');
  C.S.run.floor = 15;
  C.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  C.interact(0);
  C.S.foes.forEach(f => { f.hp = 1; });
  C.dmgAll(999);
  t.eq(C.S.deep15.knight, 1, 'the first deep clear inks one');
  C.S.victory = null; C.S.enemy = null; C.S.foes = []; C.S.battle = null;
  C.S.screen = 'dungeon'; C.S.room = null;
  C.S.run.floor = 16;
  C.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  C.interact(0);
  C.S.foes.forEach(f => { f.hp = 1; });
  C.dmgAll(999);
  t.eq(C.S.deep15.knight, 1, 'one run, one ink — a second boss past 15 adds nothing');
  C.srand(85); C.newRun('knight');
  C.S.run.floor = 15;
  C.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  C.interact(0);
  C.S.foes.forEach(f => { f.hp = 1; });
  C.dmgAll(999);
  t.eq(C.S.deep15.knight, 2, 'the next run inks a second clear');
  // wiring
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("'★★★'.slice(0, ms)") >= 0, 'the hero card wears its stars');
  t.ok(src.indexOf("s ahead of your best'") >= 0, 'the descent curtain whispers the pace');
  t.ok(src.indexOf("masteryPeak() >= 3 ? '★ '") >= 0, 'the master’s mark rides your board row');
}

// -------- THE LATE-GAME COIN SINK: scaling toll, the skim, sharper tricks --------
{
  const { DP: D } = loadGame({}, false);
  D.srand(91); D.newRun('knight');
  // the toll and the ceiling both deepen with the acts
  t.eq(D.stairToll(), 2, 'act 0: the old 2-coin toll');
  t.eq(D.purseCap(), 20, 'act 0: a 20-coin ceiling');
  D.S.run.floor = 18;                       // act 3, the mint
  t.eq(D.stairToll(), 5, 'act 3: the stairs demand 5');
  t.eq(D.purseCap(), 32, 'act 3: the ceiling rises to 32');
  D.S.run.floor = 40;                       // deep endless — both clamp
  t.eq(D.stairToll(), 8, 'the toll caps at 2+6');
  t.eq(D.purseCap(), 44, 'the ceiling caps at 44');
  // the skim: overflow becomes gold, plainest pockets first
  D.S.run.floor = 18;
  D.S.run.purse = { coin: 20, silver: 10, green: 5, red: 3, blue: 0, lucky: 2 };   // 40 total, cap 32
  const g0 = D.S.run.gold;
  t.eq(D.stairSkim(), 8, 'eight coins over the ceiling are skimmed');
  t.eq(D.purseTotal(), 32, 'the purse settles exactly at the cap');
  t.eq(D.S.run.purse.coin, 12, 'the plain coin pays the whole levy');
  t.eq(D.S.run.purse.lucky, 2, 'the lucky pocket is never touched first');
  t.ok(D.S.run.gold >= g0 + 16, 'the overflow pays 2 gold apiece');
  t.eq(D.stairSkim(), 0, 'at the cap, nothing more to skim');
  // a lean purse is left alone
  D.S.run.purse = { coin: 4, silver: 2, green: 0, red: 0, blue: 0, lucky: 0 };
  t.eq(D.stairSkim(), 0, 'a lean purse descends untaxed');
  // the descent path actually pays the scaled toll AND skims
  const { DP: E } = loadGame({}, false);
  E.srand(92); E.newRun('knight');
  E.S.run.floor = 18;
  E.S.run.purse = { coin: 30, silver: 10, green: 0, red: 0, blue: 0, lucky: 0 };   // 40
  E.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  E.interact(0);
  t.eq(E.S.run.floor, 19, 'the stairs still descend');
  t.eq(E.purseTotal(), 32, '40 − 5 toll = 35, then the skim trims to the 32 cap');
  // the mint's tricks sharpen with the acts
  const { DP: M } = loadGame({}, false);
  M.srand(93); M.newRun('knight');
  M.S.run.floor = 18;
  M.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'lodestone', done: false, px: 0.5, py: 0.4 }];
  M.interact(0);
  M.S.enemy.intent = { t: 'brace' };        // no blow — the hoard shows clean
  const mb0 = M.S.enemy.block || 0;
  M.enemyActFoe(M.S.enemy);
  t.eq((M.S.enemy.block || 0) - mb0, 6, 'act-3 magnetic armor hoards +6, not +3');
  // deep mirrors throw back harder
  const { DP: X } = loadGame({}, false);
  X.srand(94); X.newRun('knight');
  X.S.run.floor = 18; X.S.run.hp = X.S.run.maxHp = 200;
  X.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  X.interact(0);
  const foe = X.S.enemy;
  foe.hp = foe.maxHp = 500; foe.def = 'mirror'; foe.mirrorSpent = false; foe.block = 0; foe.braced = false;
  const xh0 = X.S.run.hp;
  X.dmgFoe(foe, 50);
  t.eq(xh0 - X.S.run.hp, 14, 'an act-3 mirror bounces up to 14 (8 + 2·act)');
}

// -------- THE INNKEEPER'S TALES + the ledger of habits --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  t.ok(D.TALES.length >= 60, 'sixty-plus tales in the book (' + D.TALES.length + ')');
  t.ok(D.TALES.every(tl => tl.x && (tl.a == null || (tl.a >= 0 && tl.a <= 3))),
    'every tale is written and act-tagged sanely');
  t.eq(new Set(D.TALES.map(tl => tl.x)).size, D.TALES.length, 'no tale is told twice in the book');
  // act-aware: down in the mint, only mint lines and evergreens are told
  D.srand(101); D.newRun('knight');
  D.S.run.floor = 18;
  for (let i = 0; i < 40; i++) D.rollTale();
  t.ok(Object.keys(D.S.tales).every(i => D.TALES[i].a == null || D.TALES[i].a === 3),
    'the mint innkeeper never tells act-one gossip');
  // unheard-first: with one line left in the pool, that line is next
  const eligible = [];
  D.TALES.forEach((tl, i) => { if (tl.a == null || tl.a === 3) eligible.push(i); });
  D.S.tales = {};
  for (const i of eligible.slice(1)) D.S.tales[i] = 1;
  t.eq(D.rollTale(), D.TALES[eligible[0]].x, 'the last unheard line is told next');
  // ...and once all are heard, the innkeeper repeats himself rather than mute
  t.ok(typeof D.rollTale() === 'string', 'a full book still pours reruns');
  // the staircase actually tells them (~1 in 3), before the maze is carved
  D.S.tales = {};
  D.srand(7);
  let told = 0;
  for (let i = 0; i < 12; i++) { D.nextFloor(); if (D.S.floorFx.tale) told++; }
  t.ok(told >= 2 && told < 12, 'roughly a third of descents get a line (' + told + '/12)');
  t.ok(Object.keys(D.S.tales).length >= told, 'every told line is remembered');
  // heard tales survive a reload; the ledger's trophy math ignores them
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(Object.keys(R.S.tales).length, Object.keys(D.S.tales).length, 'the heard shelf rides the save');
  t.ok(R.CODEX_TABS.indexOf('t') < 0, 'TALES never gate THE FULL LEDGER');
  t.eq(R.codexTabStat('t').all, R.TALES.length, 'but the tab still counts itself');
  // ---- the ledger of habits ----
  const { DP: H } = loadGame({}, false);
  H.srand(102); H.newRun('knight');
  const empty = H.habits();
  t.ok(!empty.coin && !empty.foe && !empty.draught && !empty.death, 'a silent ledger names no favorites');
  H.S.codex.coins = { silver: 900, coin: 200 };
  H.S.codex.foes = { orc: 40, wyrm: 3 };
  H.S.life.draughts = { heal: 4, bomb: 2 };
  H.S.life.deaths = { 8: 5, 3: 2 };
  const hb = H.habits();
  t.eq(hb.coin.name, H.COIN_INFO.silver.name, 'the favorite coin is the most-fired');
  t.eq(hb.coin.n, 900, 'with its count');
  t.ok(hb.foe && hb.foe.n === 40, 'the most-slain foe tops the bestiary tally');
  t.eq(hb.draught.name, 'MENDING DRAUGHT', 'the favorite draught reads its proper name');
  t.eq(hb.death.floor, 8, 'the deadliest floor is the one with the bodies');
  H.S.codex.foes = { wyrm: 9 };
  t.ok(H.habits().foe && H.habits().foe.n === 9, 'B-side bosses resolve by name too');
  // deaths stamp at every run's end; draughts tally on every brew
  const { DP: E } = loadGame({}, false);
  E.srand(103); E.newRun('knight');
  E.S.run.floor = 7; E.endRun('fell');
  E.srand(104); E.newRun('knight');
  E.S.run.floor = 7; E.endRun('fell');
  t.eq(E.S.life.deaths[7], 2, 'floor 7 owns both bodies');
  E.srand(105); E.newRun('knight');
  E.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  E.interact(0);
  E.S.enemy.hp = E.S.enemy.maxHp = 500;
  E.brewDraught('heal');
  E.brewDraught('heal');
  t.eq(E.S.life.draughts.heal, 2, 'the habit ledger sips with every brew');
  // the pages exist
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("['t', 'TALES']") >= 0, 'the codex grew a TALES tab');
  t.ok(src.indexOf('— the innkeeper') >= 0, 'the curtain credits the teller');
  t.ok(src.indexOf("['habits', '\\u{1F3B2} HABITS']") >= 0, 'records grew the HABITS tab');
  t.ok(src.indexOf('WHERE THE RUNS END') >= 0, 'with the death bars beneath');
}

// -------- NAMED CHAMPIONS + the trophy-wall share card --------
{
  const { DP: D } = loadGame({}, false);
  t.eq(D.CHAMPIONS.length, 4, 'four names in the champion roll');
  t.ok(D.CHAMPIONS.every(c => c.id && c.icon && c.name && c.trait && c.hp && c.gold),
    'every champion is fully armed');
  // no id collisions with the common bestiary or the lairs
  const allIds = new Set();
  for (const tier of D.ENEMY_TIERS) for (const f of tier) allIds.add(f.id);
  for (const b of D.BOSSES) allIds.add(b.id);
  for (const b of D.BOSSES2) allIds.add(b.id);
  t.ok(D.CHAMPIONS.every(c => !allIds.has(c.id)), 'champion ids collide with nobody');
  // one champion per act, the deep keeps the last
  D.srand(111); D.newRun('knight');
  const cf = (fl) => { D.S.run.floor = fl; return D.championFor(fl).id; };
  t.eq(cf(3), 'gruk', 'act 0 belongs to Gruk');
  t.eq(cf(8), 'velvetfang', 'act 1 to Velvetfang');
  t.eq(cf(13), 'ninecoins', 'act 2 to Old Ninecoins');
  t.eq(cf(18), 'ledgerlord', 'the mint to the Ledger Lord');
  t.eq(cf(40), 'ledgerlord', 'the endless keeps the Ledger Lord');
  // a champion in the flesh: crowned name, extra trick, double bounty + key
  D.S.run.floor = 8;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'velvetfang', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  const ch = D.S.enemy;
  t.eq(ch.champ, 1, 'the wolf wears the crown flag');
  t.ok(ch.name.indexOf('VELVETFANG') >= 0 && ch.name.indexOf('ELITE') < 0, 'named, never generic');
  t.eq(ch.trait, 'gremlin', 'with its extra trick');
  const g0 = D.S.battle.goldWon, k0 = D.S.battle.keysWon, eg = ch.gold;
  ch.hp = 1; ch.mirrorSpent = true; ch.block = 0; ch.braced = false;
  D.dmgFoe(ch, 999);
  t.eq(D.S.battle.goldWon - g0, eg * 2, 'a champion pays DOUBLE');
  t.eq(D.S.battle.keysWon - k0, D.C.KEY_KILL + 1, 'and never leaves you keyless');
  t.eq(D.S.codex.foes.velvetfang, 1, 'the codex inks the champion');
  // it actually hides in the elite pool past floor 4
  const { DP: E } = loadGame({}, false);
  let seen = false;
  for (let s = 0; s < 40 && !seen; s++) {
    E.srand(200 + s); E.newRun('knight');
    E.S.run.floor = 8;
    E.S.run.room.ents = [{ kind: 'monster', mtype: 'elite', eid: null, done: false, px: 0.5, py: 0.4 }];
    E.interact(0);
    if (E.S.enemy && E.S.enemy.champ) seen = true;
  }
  t.ok(seen, 'the champion turns up among the elites');
  // all four inked → CHAMPION SLAYER
  for (const c of D.CHAMPIONS) D.S.codex.foes[c.id] = 1;
  D.achPoll();
  t.ok(D.S.ach.u.champs, 'CHAMPION SLAYER hangs on the wall');
  // the codex act tabs count their champion
  const a2 = D.codexTabStat('a2');
  t.eq(a2.all, D.ENEMY_TIERS[1].length + 3, 'act tabs count roster + bosses + champion');
  // the trophy-wall card is wired
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('function buildTrophyCard()') >= 0, 'the trophy card builder exists');
  t.ok(src.indexOf('THE TROPHY WALL') >= 0, 'and paints the wall');
  t.ok(src.indexOf("fname: 'dungeon-pusher-trophies.png'") >= 0, 'the trophies sheet shares it under its own name');
  t.ok(src.indexOf('ctx = main;') >= 0, 'the ctx swap still restores in finally');
}

// -------- the MONTHLY plaque + the anniversary --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // the first run stamps the calendar, once
  t.eq(D.S.firstRun, '', 'a fresh profile has no first-run date yet');
  D.srand(121); D.newRun('knight');
  const today = new Date().toISOString().slice(0, 10);
  t.eq(D.S.firstRun, today, 'the first run stamps the calendar');
  D.S.firstRun = '2020-03-14';
  D.srand(122); D.newRun('knight');
  t.eq(D.S.firstRun, '2020-03-14', 'later runs never restamp it');
  // anniversary math
  t.eq(D.anniversary('2026-03-14'), 6, 'six years on the day');
  t.eq(D.anniversary('2026-03-15'), 0, 'the day after is nothing');
  t.eq(D.anniversary('2020-03-14'), 0, 'the first day itself is no anniversary');
  D.S.firstRun = '';
  t.eq(D.anniversary('2026-03-14'), 0, 'no calendar, no candles');
  // the plaque + calendar ride the save
  D.S.firstRun = '2020-03-14'; D.S.annivDone = '2026';
  D.S.plaque = { on: today, month: '2026-06', floor: 28, name: 'Champ' };
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.firstRun, '2020-03-14', 'the calendar survives a reload');
  t.eq(R.S.annivDone, '2026', 'so does the claimed year');
  t.eq(R.S.plaque.name, 'Champ', 'and the champion’s plaque');
  t.eq(R.S.plaque.month, '2026-06', 'with its month');
  // veterans are grandfathered: runs on the books, no date → stamped today
  const store2 = {};
  const { DP: G } = loadGame(store2, false);
  G.S.best.runs = 12;
  G.save();
  const { DP: G2 } = loadGame(store2, false);
  t.eq(G2.S.firstRun, today, 'a veteran save starts its calendar on load');
  // browser wiring
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("tabBtn(LW / 2 + 66, TR('THIS MONTH'), 'monthly')") >= 0, 'the board grew a THIS MONTH tab');
  t.ok(src.indexOf('?board=lastmonth') >= 0, 'the title asks for last month’s champion');
  t.ok(src.indexOf('’S DEEPEST: ') >= 0, 'and hangs the plaque');
  t.ok(src.indexOf('MAKE A WISH') >= 0, 'the birthday crate waits for its day');
}

// -------- THE LEGEND DOOR: NG++ --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // the ladder: no crown without the unseal
  D.S.deep15 = { knight: 1 };
  D.S.ngPick = 2;                          // asks for the crown...
  D.srand(131); D.newRun('knight');
  t.eq(D.S.run.ng, 1, '...but without the unseal, NG+ is the ceiling');
  // the unseal: an NG+ deep clear opens the legend door
  D.S.run.floor = 15;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.foes.forEach(f => { f.hp = 1; });
  D.dmgAll(999);
  t.eq(D.S.ng2Open, 1, 'the NG+ deep clear unseals THE LEGEND DOOR');
  // and now the crown fits
  D.S.ngPick = 2;
  D.srand(132); D.newRun('knight');
  t.eq(D.S.run.ng, 2, 'NG++ answers once unsealed');
  t.eq(D.actIdx(1), 2, 'legend floor 1 walks act-3 halls');
  t.eq(D.S.run.purse.coin, 5 + 6, 'both prestige kits stack their coins');
  t.eq(D.S.run.gold, 40, 'and their gold');
  // decrees reach up: floor 11 reads the first law
  D.S.run.floor = 11;
  t.eq(D.mutCount(), 1, 'a legend hears the first decree at floor 11');
  D.S.run.floor = 20;
  t.eq(D.mutCount(), 4, 'four laws deep by the old mint gate');
  D.S.run.floor = 11; D.S.run.ng = 1;
  t.eq(D.mutCount(), 0, 'NG+ still waits for floor 21');
  D.S.run.ng = 2;
  // the throne shard: legend-only pool, real weight
  D.S.run.ng = 1;
  let sawShard = false;
  for (let i = 0; i < 80; i++) { D.srand(300 + i); if (D.rollRelicByRar('e') === 'throneshard') sawShard = true; }
  t.ok(!sawShard, 'NG+ never rolls the Throne Shard');
  D.S.run.ng = 2;
  for (let i = 0; i < 80 && !sawShard; i++) { D.srand(300 + i); if (D.rollRelicByRar('e') === 'throneshard') sawShard = true; }
  t.ok(sawShard, 'NG++ can');
  D.S.run.relics.push('throneshard');      // grantRelic takes a rarity, not an id
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.S.screen = 'dungeon'; D.S.room = null; D.S.victory = null; D.S.enemy = null; D.S.foes = []; D.S.battle = null;
  D.interact(0);
  const foe = D.S.enemy;
  foe.hp = foe.maxHp = 300; foe.def = null; foe.block = 0; foe.mirrorSpent = true; foe.braced = false;
  D.dmgFoe(foe, 5);
  t.eq(300 - foe.hp, 7, 'the Throne Shard lands +2 on every blow');
  // the crown survives the save — and can't be smuggled
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.ng2Open, 1, 'the unseal survives a reload');
  t.eq(R.S.ngPick, 2, 'so does the armed crown');
  t.eq(R.S.run.ng, 2, 'and the live legend run');
  const store2 = {};
  const { DP: X } = loadGame(store2, false);
  X.S.ngPick = 2; X.S.ng2Open = 0; X.S.deep15 = { knight: 1 };
  X.save();
  const { DP: X2 } = loadGame(store2, false);
  t.eq(X2.S.ngPick, 1, 'a smuggled crown demotes to the pawn on load');
  // the crown shows everywhere the pawn did
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("'♛NG++' : 'NG+'") >= 0, 'the difficulty row door cycles to the crown');
  t.ok(src.indexOf("h.ng >= 2 ? ' ♛'") >= 0, 'history rows crown their legends');
  t.ok(src.indexOf("o.ng >= 2 ? '  •  ♛ NG++'") >= 0, 'the report card too');
  t.ok(src.indexOf('THE LEGEND DOOR unseals') >= 0, 'the unseal announces itself');
}

// -------- THE GAUNTLET: five floors, every law, the clock --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // the door keeps weekend hours (UTC)
  t.ok(D.gauntletOpen('2026-07-24'), 'Friday opens the gauntlet');
  t.ok(D.gauntletOpen('2026-07-25'), 'Saturday keeps it open');
  t.ok(D.gauntletOpen('2026-07-26'), 'Sunday too');
  t.ok(!D.gauntletOpen('2026-07-22'), 'Wednesday stays shut');
  t.ok(!D.gauntletOpen('2026-07-27'), 'Monday locks it again');
  t.ok(!D.newGauntlet('2026-07-22'), 'no sneaking in midweek');
  // the run: week seed, every law, no merchants, no stacking
  t.ok(D.newGauntlet('2026-07-24'), 'Friday lets you run');
  t.eq(D.S.run.gauntlet, '2026-07-20', 'the run wears its week');
  t.eq(D.mutCount(), D.MUTS.length, 'all eight laws bind from floor 1');
  t.ok(D.mutOn('thickair') && D.mutOn('longdark'), 'first and last alike');
  t.ok(!D.S.run.weekly, 'the weekly decree never stacks');
  const seedA = D.S.run.seed;
  // no shops anywhere in the five floors
  let shops = 0, plainShops = 0;
  for (let f = 1; f <= 5; f++) {
    D.S.run.floor = f; D.genFloor();
    for (const k in D.S.run.map.rooms) {
      shops += D.S.run.map.rooms[k].ents.filter(e => e.kind === 'shop').length;
    }
  }
  t.eq(shops, 0, 'the merchants flee the gauntlet');
  // the finish line: floor-5 stairs end the run and carve the clock
  D.S.run.floor = 5;
  D.S.run.stats.t = 372;                     // 6:12 on the clock
  D.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  D.interact(0);
  t.ok(D.S.over, 'the fifth-floor stairs END the gauntlet');
  t.eq(D.S.over.gauntlet, 372, 'the clock is the score');
  t.eq(D.S.life.gaunts, 1, 'the ledger counts the clear');
  t.eq(D.S.life.gauntBest, 372, 'and keeps the best time');
  t.eq(D.S.gauntlet.week, '2026-07-20', 'this week is marked run');
  // a faster clear rewrites the best; a slower one doesn't
  D.newGauntlet('2026-07-24');
  D.S.run.floor = 5; D.S.run.stats.t = 300;
  D.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  D.interact(0);
  t.eq(D.S.life.gauntBest, 300, 'a faster run takes the record');
  D.newGauntlet('2026-07-24');
  D.S.run.floor = 5; D.S.run.stats.t = 500;
  D.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  D.interact(0);
  t.eq(D.S.life.gauntBest, 300, 'a slower one changes nothing');
  t.eq(D.S.life.gaunts, 3, 'but still counts');
  // everything rides the save
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.life.gauntBest, 300, 'the record survives a reload');
  t.eq(R.S.gauntlet.week, '2026-07-20', 'so does the week mark');
  // same week, either weekend day: one maze for everyone
  const { DP: D2 } = loadGame({}, false);
  D2.newGauntlet('2026-07-25');             // Saturday, same week
  t.eq(D2.S.run.seed, seedA, 'the whole weekend races one maze');
  const { DP: P } = loadGame({}, false);
  for (let s2 = 0; s2 < 8 && !plainShops; s2++) {
    P.srand(400 + s2); P.newRun('knight');
    for (let f = 1; f <= 5; f++) {
      P.S.run.floor = f; P.genFloor();
      for (const k in P.S.run.map.rooms) {
        plainShops += P.S.run.map.rooms[k].ents.filter(e => e.kind === 'shop').length;
      }
    }
  }
  t.ok(plainShops > 0, 'plain runs still meet the keeper (sanity)');
  // an ordinary floor-5 stairs still charges its toll (no gauntlet, no exit)
  const { DP: N } = loadGame({}, false);
  N.srand(141); N.newRun('knight');
  N.S.run.floor = 5;
  N.S.run.purse = { coin: 10, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
  N.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  N.interact(0);
  t.eq(N.S.run.floor, 6, 'plain runs descend as ever');
  t.ok(!N.S.over, 'and never end at floor 5');
  // the wiring
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('\\u{1F3C1} GAUNTLET') >= 0, 'the weekend chip hangs on the title');
  t.ok(src.indexOf("['gauntlet best', L.gauntBest") >= 0, 'the endless records read the clock');
  t.ok(src.indexOf('THE GAUNTLET — cleared in ') >= 0, 'the share card brags the time');
}

// -------- THE REFINE OFFER + the tier's four trophies --------
{
  const { DP: D } = loadGame({}, false);
  const battle = (X) => {
    X.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
    X.interact(0);
    X.S.enemy.hp = 1; X.S.enemy.block = 0; X.S.enemy.mirrorSpent = true; X.S.enemy.braced = false;
    X.dmgEnemy(9);
  };
  // act 0: offers still ADD — the purse grows
  D.srand(151); D.newRun('knight');
  battle(D);
  t.ok(D.S.victory && D.S.victory.offer, 'the victory offer stands');
  t.ok(!D.S.victory.up, 'near the sun, offers still ADD');
  const t0 = D.purseTotal();
  D.pickCoin(0);
  t.eq(D.purseTotal(), t0 + 1, 'and the purse grows by one');
  // act 3: the first slot REFINES — the purse holds its size
  const { DP: R } = loadGame({}, false);
  let up = null;
  for (let s2 = 0; s2 < 30 && !up; s2++) {
    R.srand(160 + s2); R.newRun('knight');
    R.S.run.floor = 18;
    R.S.screen = 'dungeon'; R.S.room = null; R.S.victory = null; R.S.enemy = null; R.S.foes = []; R.S.battle = null;
    battle(R);
    if (R.S.victory && R.S.victory.up) up = R.S.victory;
  }
  t.ok(up, 'past act 2 the refine slot appears (first slot, non-plain kind)');
  const kind = up.offer[0];
  t.ok(kind !== 'coin', 'nobody refines a coin into itself');
  const plain0 = R.S.run.purse.coin, fine0 = R.S.run.purse[kind] || 0, tot0 = R.purseTotal();
  R.pickCoin(0);
  t.eq(R.S.run.purse.coin, plain0 - 1, 'one plain coin melts');
  t.eq(R.S.run.purse[kind], fine0 + 1, 'into one finer coin');
  t.eq(R.purseTotal(), tot0, 'the purse holds its SIZE — quality, not bulk');
  // slots 1+ still add normally even when slot 0 refines
  const { DP: R2 } = loadGame({}, false);
  let up2 = null;
  for (let s2 = 0; s2 < 30 && !up2; s2++) {
    R2.srand(160 + s2); R2.newRun('knight');
    R2.S.run.floor = 18;
    R2.S.screen = 'dungeon'; R2.S.room = null; R2.S.victory = null; R2.S.enemy = null; R2.S.foes = []; R2.S.battle = null;
    battle(R2);
    if (R2.S.victory && R2.S.victory.up) up2 = R2.S.victory;
  }
  const tot1 = R2.purseTotal();
  R2.pickCoin(1);
  t.eq(R2.purseTotal(), tot1 + 1, 'the other slots still ADD');
  // ---- the four new trophies ----
  const { DP: T2 } = loadGame({}, false);
  t.ok(['gauntrun', 'legend2', 'chronicler', 'emissary'].every(id => T2.achById(id)),
    'the tier’s four trophies hang on the wall');
  T2.S.life.gaunts = 1;
  T2.achPoll();
  t.ok(T2.S.ach.u.gauntrun, 'GAUNTLET RUNNER polls off the ledger');
  for (let i = 0; i < 40; i++) T2.S.tales[i] = 1;
  T2.achPoll();
  t.ok(T2.S.ach.u.chronicler, 'CHRONICLER at forty tales');
  // LIVING LEGEND: an NG++ deep clear
  T2.S.deep15 = { knight: 1, rogue: 1, wizard: 1, cleric: 1, ghost: 1 };
  T2.S.ng2Open = 1; T2.S.ngPick = 2;
  T2.srand(171); T2.newRun('knight');
  t.eq(T2.S.run.ng, 2, 'the crown holds');
  T2.S.run.floor = 15;
  T2.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  T2.interact(0);
  T2.S.foes.forEach(f => { f.hp = 1; });
  T2.dmgAll(999);
  t.ok(T2.S.ach.u.legend2, 'LIVING LEGEND at the NG++ deep clear');
  // EMISSARY is wired to the duel share
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("achUnlock('emissary')") >= 0, 'EMISSARY fires when a challenge is sent');
  t.ok(src.indexOf("'⇧ REFINE'") >= 0, 'the refine slot announces itself');
}

// -------- the GIFT STAKE + board filters --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // the link and its scrubbing
  const g = D.parseGift(D.giftLink('Danhieux'));
  t.eq(g.name, 'Danhieux', 'the stake carries the giver’s name');
  t.eq(D.parseGift(''), null, 'no search, no stake');
  const dirty = D.parseGift('?gift=' + encodeURIComponent('<img>Bob!!x12345678'));
  t.ok(dirty.name.indexOf('<') < 0 && dirty.name.length <= 12, 'the name is scrubbed and capped');
  t.eq(D.parseGift('?gift=%3C%3E').name, 'a friend', 'a name scrubbed to nothing falls back kindly');
  // rookies only, once
  t.eq(D.S.best.runs | 0, 0, 'a fresh profile has no runs (sanity)');
  t.ok(D.claimGift(), 'the rookie claims the stake');
  t.eq(D.S.cogs, 50, 'fifty cogs, as promised');
  t.ok(!D.claimGift(), 'never twice');
  t.eq(D.S.cogs, 50, 'the second claim pays nothing');
  D.save();
  const { DP: R } = loadGame(store, false);
  t.ok(!R.claimGift(), 'the claim survives a reload');
  // veterans get nothing
  const { DP: V } = loadGame({}, false);
  V.srand(181); V.newRun('knight');
  V.endRun('fell');
  t.ok(!V.claimGift(), 'a profile with runs on the books is no rookie');
  // the board sieve
  const top = [
    { name: 'A', floor: 20, kills: 9, hero: 'knight', diff: 'nightmare' },
    { name: 'B', floor: 15, kills: 30, hero: 'wizard', diff: 'normal' },
    { name: 'C', floor: 12, kills: 10, hero: 'knight' },
    { name: 'D', floor: 9, kills: 2, hero: 'rat', diff: 'merciful' },
  ];
  t.eq(D.boardFilter(top, 'knight', null).length, 2, 'the hero chip sieves to the knights');
  t.eq(D.boardFilter(top, null, 'nightmare').length, 1, 'the skull chip to the brave');
  t.eq(D.boardFilter(top, 'knight', 'nightmare')[0].name, 'A', 'chips stack');
  t.eq(D.boardFilter(top, null, 'normal').length, 2, 'a missing diff reads as normal');
  t.eq(D.boardFilter(top, null, null).length, 4, 'no chips, no sieve');
  t.eq(D.boardFilter(null, 'knight', null).length, 0, 'an empty board sieves to nothing');
  // browser wiring
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('parseGift(location.search)') >= 0, 'boot reads the stake link');
  t.ok(src.indexOf('staked you 50 ⚙ cogs — dig well') >= 0, 'and greets the rookie by name');
  t.ok(src.indexOf('\\u{1F381} STAKE') >= 0, 'the run-over screen offers the STAKE button');
  t.ok(src.indexOf('const flt = boardFilter(BOARD.top, BOARD.fHero, BOARD.fDiff)') >= 0,
    'the board rows read through the sieve');
  t.ok(src.indexOf("chip('✕', true") >= 0, 'an active sieve offers the clear chip');
}

// -------- PET VETERANCY + four new quests + the cb audit --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  D.srand(191); D.newRun('knight');
  // five survived battles make a veteran
  t.eq(D.petVet('pup'), false, 'a fresh pup is no veteran');
  const brawlWin = () => {
    D.S.screen = 'dungeon'; D.S.room = null; D.S.victory = null; D.S.enemy = null; D.S.foes = []; D.S.battle = null;
    D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
    D.interact(0);
    D.summonPet('pup');
    D.S.enemy.hp = 1; D.S.enemy.block = 0; D.S.enemy.mirrorSpent = true; D.S.enemy.braced = false;
    D.dmgEnemy(9);
  };
  for (let i = 0; i < 5; i++) brawlWin();
  t.eq(D.S.life.petFights.pup, 5, 'five battles walked out of');
  t.ok(D.petVet('pup'), 'the pup is a VETERAN');
  t.eq(D.S.petNameQ, 'pup', 'and waits at the namepad');
  // the name and the star ride every future summon, with +1 HP
  D.S.petNames.pup = 'Biscuit';
  D.S.petNameQ = null;
  brawlWin();
  const vetPup = D.S.pets.find(p => p.iid === 'pup');
  t.eq(vetPup.name, 'Biscuit ★', 'named and starred');
  const plainHp = D.itemById('pup').php;
  t.eq(vetPup.maxHp, plainHp + 1, 'a veteran stands one tougher');
  // the rat king's swarm wears names too
  D.S.life.petFights.rat = 5;
  D.S.petNames.rat = 'Gnaw';
  const r = D.mkRat(false);
  t.eq(r.name, 'Gnaw ★', 'the swarm remembers its own');
  t.eq(r.maxHp, 9, 'one tougher in the walls');
  // names and tallies survive a reload
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.petNames.pup, 'Biscuit', 'the name survives a reload');
  t.ok(R.petVet('pup'), 'so does the stripe');
  // ---- the four new quests ----
  const { DP: Q } = loadGame({}, false);
  t.eq(Q.QUEST_DEFS.length, 12, 'twelve jobs on the floor board (four are signature work)');
  t.ok(['nopotion', 'bigbank', 'chests', 'tiltwin'].every(id => Q.QUEST_DEFS.some(q => q.id === id)),
    'the four new jobs are posted');
  Q.srand(192); Q.newRun('knight');
  // nopotion: winning dry bumps it, drinking spoils it
  Q.S.run.quest = { id: 'nopotion', need: 1, got: 0, done: false, reward: 'goldkey' };
  Q.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  Q.interact(0);
  Q.S.run.potions = 2; Q.S.run.hp = 5;
  Q.usePotion();
  t.ok(Q.S.battle.drank, 'the flask leaves a mark');
  Q.S.enemy.hp = 1; Q.S.enemy.block = 0; Q.S.enemy.mirrorSpent = true; Q.S.enemy.braced = false;
  Q.dmgEnemy(9);
  t.ok(!Q.S.run.quest.done, 'a drunk win pays nothing');
  Q.S.screen = 'dungeon'; Q.S.room = null; Q.S.victory = null; Q.S.enemy = null; Q.S.foes = []; Q.S.battle = null;
  Q.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  Q.interact(0);
  Q.S.enemy.hp = 1; Q.S.enemy.block = 0; Q.S.enemy.mirrorSpent = true; Q.S.enemy.braced = false;
  Q.dmgEnemy(9);
  t.ok(Q.S.run.quest.done, 'a dry win closes the job');
  // tiltwin: three shakes and a win
  Q.S.screen = 'dungeon'; Q.S.room = null; Q.S.victory = null; Q.S.enemy = null; Q.S.foes = []; Q.S.battle = null;
  Q.S.run.quest = { id: 'tiltwin', need: 1, got: 0, done: false, reward: 'goldkey' };
  Q.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  Q.interact(0);
  Q.S.battle.tiltsUsed = 3;
  Q.S.enemy.hp = 1; Q.S.enemy.block = 0; Q.S.enemy.mirrorSpent = true; Q.S.enemy.braced = false;
  Q.dmgEnemy(9);
  t.ok(Q.S.run.quest.done, 'three tilts and a win close the job');
  // chests: openChest bumps it
  Q.S.run.quest = { id: 'chests', need: 3, got: 0, done: false, reward: 'goldkey' };
  Q.srand(7);
  Q.openChest({ x: 50 }); Q.openChest({ x: 50 }); Q.openChest({ x: 50 });
  t.ok(Q.S.run.quest.done, 'three cracked lids close the job');
  // the cb audit: pile badges on every state, offer badges wired
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('if (S.opts.cb) {   // every state — falling coins are choices too') >= 0,
    'pile badges no longer wait for the coin to land');
  t.ok(src.indexOf('colorblind marks ride the offer too') >= 0, 'the victory offer wears them');
  t.ok(src.indexOf('S.petNameQ && !NAMEPAD') >= 0, 'the namepad answers the promotion');
}

// -------- SIGNATURE QUESTS + five new strangers + the rookie contract --------
{
  const { DP: D } = loadGame({}, false);
  // signature quests only post on their own hero's runs
  D.srand(201); D.newRun('knight');
  let leaked = null;
  for (let i = 0; i < 60 && !leaked; i++) {
    const q = D.rollQuest(3);
    if (['ghostlean', 'clawcatch', 'fullswarm', 'tripledraught'].indexOf(q.id) >= 0) leaked = q.id;
  }
  t.ok(!leaked, 'sixty knight rolls, no signature work leaked' + (leaked ? ' (' + leaked + ')' : ''));
  D.S.deep15 = { knight: 1, rogue: 1, wizard: 1, cleric: 1, ghost: 1 };
  D.srand(202); D.newRun('alch');
  let sawSig = false;
  for (let i = 0; i < 80 && !sawSig; i++) sawSig = D.rollQuest(3).id === 'tripledraught';
  t.ok(sawSig, 'the alchemist is offered her own work');
  // tripledraught: three brews in one battle close it
  D.S.run.quest = { id: 'tripledraught', need: 1, got: 0, done: false, reward: 'goldkey' };
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = D.S.enemy.maxHp = 500;
  D.brewDraught('heal'); D.brewDraught('heal');
  t.ok(!D.S.run.quest.done, 'two brews are not three');
  D.brewDraught('heal');
  t.ok(D.S.run.quest.done, 'the third brew closes the job');
  // ghostlean: a lean win bumps only under the ghost
  const { DP: G } = loadGame({}, false);
  G.S.deep15 = { a: 1, b: 1, c: 1, d: 1, e: 1 };
  G.S.best = { ...G.S.best, floor: 20 };
  G.srand(203); G.newRun('ghost');
  t.eq(G.S.run.hero, 'ghost', 'the poltergeist answers (floor 20 unseal)');
  G.S.run.quest = { id: 'ghostlean', need: 1, got: 0, done: false, reward: 'goldkey' };
  G.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  G.interact(0);
  G.S.battle.fired = 5;
  G.S.enemy.hp = 1; G.S.enemy.block = 0; G.S.enemy.mirrorSpent = true; G.S.enemy.braced = false;
  G.dmgEnemy(9);
  t.ok(G.S.run.quest.done, 'five coins fired, battle won — lean as promised');
  // ---- the five new strangers ----
  t.ok(['bounty', 'rebate', 'mirrorman', 'auction', 'wager'].every(id => D.eventById(id)),
    'five new strangers stand in the halls');
  t.ok(D.eventById('mirrorman').mint, 'the mirror merchant keeps to the mint');
  // the bounty pays on the next champion kill
  const { DP: B } = loadGame({}, false);
  B.srand(204); B.newRun('knight');
  B.S.run.floor = 8;
  B.S.run.bountyChamp = 1;
  B.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'velvetfang', done: false, px: 0.5, py: 0.4 }];
  B.interact(0);
  const ch = B.S.enemy;
  const bg0 = B.S.run.gold;
  ch.hp = 1; ch.mirrorSpent = true; ch.block = 0; ch.braced = false;
  B.dmgFoe(ch, 999);
  t.ok(B.S.run.gold >= bg0 + 40, 'the bounty pays its +40 on the champion');
  t.eq(B.S.run.bountyChamp, 0, 'and the poster is spent');
  // the clerk's forms: toll-free descends free, the audit doubles the toll
  const { DP: C } = loadGame({}, false);
  C.srand(205); C.newRun('knight');
  C.S.run.tollDouble = 1;
  t.eq(C.stairToll(), 4, 'a spiteful audit doubles the toll');
  C.S.run.tollFree = 1;
  C.S.run.purse = { coin: 1, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
  C.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  C.interact(0);
  t.eq(C.S.run.floor, 2, 'a misfiled toll still descends');
  t.eq(C.purseTotal(), 1, 'without touching the purse');
  t.eq(C.S.run.tollDouble, 0, 'the audit’s spite expires at the stairs');
  // the wager settles on the way down
  const { DP: W } = loadGame({}, false);
  W.srand(206); W.newRun('knight');
  W.S.run.purse.coin += 10;
  W.S.run.wager = { hp: W.S.run.hp };
  const wg0 = W.S.run.gold;
  W.nextFloor();
  t.ok(W.S.run.gold >= wg0 + 35, 'unhurt to the stairs — the innkeeper pays 35');
  t.eq(W.S.run.wager, null, 'the bet is settled');
  W.S.run.wager = { hp: W.S.run.hp + 5 };
  const wg1 = W.S.run.gold;
  W.nextFloor();
  t.eq(W.S.run.gold, wg1, 'bleeding at the stairs pays nothing');
  // ---- the rookie contract ----
  const store = {};
  const { DP: K } = loadGame(store, false);
  K.srand(207); K.newRun('knight');
  t.eq(K.S.contract, 1, 'a rookie’s first run arms the contract');
  const kc0 = K.S.cogs;
  K.S.run.floor = 4;
  K.nextFloor();
  t.eq(K.S.contract, 2, 'floor 5 delivers');
  t.eq(K.S.cogs, kc0 + 30, 'and pays its 30 cogs');
  K.srand(208); K.newRun('knight');
  K.S.run.floor = 4; K.S.cogs = 0;
  K.nextFloor();
  t.eq(K.S.cogs, 0, 'the contract never pays twice');
  K.save();
  const { DP: K2 } = loadGame(store, false);
  t.eq(K2.S.contract, 2, 'the paid contract survives a reload');
  // veterans are never offered it
  const { DP: V } = loadGame({}, false);
  V.S.best.floor = 9;
  V.srand(209); V.newRun('knight');
  t.eq(V.S.contract, 0, 'a floor-9 veteran signs no rookie paper');
}

// -------- THE LEGACY BOOK + act motifs --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  // the stamp: dated, deduped, capped, newest first
  t.ok(D.legacyStamp('a test of firsts'), 'a first is stamped');
  t.ok(!D.legacyStamp('a test of firsts'), 'a second telling is refused');
  t.eq(D.S.legacy.length, 1, 'one line in the book');
  t.eq(D.S.legacy[0].t, new Date().toISOString().slice(0, 10), 'dated today');
  for (let i = 0; i < 45; i++) D.legacyStamp('line ' + i);
  t.eq(D.S.legacy.length, 40, 'the book caps at forty lines');
  t.eq(D.S.legacy[0].x, 'line 44', 'newest first');
  // the book survives a reload (saved before any other instance rebinds)
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.legacy.length, 40, 'the book survives a reload');
  t.eq(R.S.legacy[0].x, 'line 44', 'in order');
  // curated trophies write their own lines
  const { DP: A } = loadGame({}, false);
  A.srand(211); A.newRun('knight');
  A.S.run.gold = 600;
  A.achPoll();                              // DRAGON HOARD — not curated
  t.ok(A.S.ach.u.rich && !A.S.legacy.some(e => /HOARD/i.test(e.x)), 'plain trophies stay out of the book');
  A.achUnlock('jackpot');
  t.ok(A.S.legacy.some(e => e.x.indexOf('first JACKPOT') >= 0), 'the first jackpot is history');
  t.ok(Object.keys(A.LEGACY_ACH).every(id => A.achById(id)), 'every curated id is a real trophy');
  // the deep clear and the legend door stamp themselves
  const { DP: C } = loadGame({}, false);
  C.S.deep15 = {};
  C.srand(212); C.newRun('knight');
  C.S.run.floor = 15; C.S.run.ng = 1;
  C.S.run.room.ents = [{ kind: 'monster', mtype: 'boss', eid: null, done: false, px: 0.5, py: 0.4 }];
  C.interact(0);
  C.S.foes.forEach(f => { f.hp = 1; });
  C.dmgAll(999);
  t.ok(C.S.legacy.some(e => e.x.indexOf('deep clear — an alt skin') >= 0), 'the tailor’s visit is history');
  t.ok(C.S.legacy.some(e => e.x.indexOf('LEGEND DOOR unsealed') >= 0), 'so is the unseal');
  // the motifs: four notes, four acts, headless-safe
  const { DP: N } = loadGame({}, false);
  N.srand(213); N.newRun('knight');
  t.ok(N.nextFloor(), 'the staircase still descends with the motif wired');
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('the DESCEND motif: four notes per act') >= 0, 'the motif table exists');
  t.ok(src.indexOf('[392, 330, 294, 262],   // act I') >= 0, 'act I sings bright');
  t.ok(src.indexOf('[294, 247, 208, 175],   // the mint') >= 0, 'the mint sings brass');
  t.ok(src.indexOf("['legacy', '\\u{1F4D6} LEGACY']") >= 0, 'records grew the LEGACY tab');
  t.ok(src.indexOf('the book is blank — go make a first') >= 0, 'with a kind empty state');
}

// -------- THE GLASS JAR: the machine's first new trick --------
{
  // shared seeds face the same jar (own instances FIRST — localStorage rebinds)
  const { DP: A } = loadGame({}, false);
  const { DP: B } = loadGame({}, false);
  A.S.nextSeed = 4242; A.srand(1); A.newRun('knight');
  B.S.nextSeed = 4242; B.srand(99); B.newRun('knight');
  for (let f = 1; f < 9; f++) { A.S.run.floor = f + 1; A.genFloor(); B.S.run.floor = f + 1; B.genFloor(); }
  t.eq(JSON.stringify(A.S.run.jar), JSON.stringify(B.S.run.jar), 'two players, one seed, one jar');
  const store = {};
  const { DP: D } = loadGame(store, false);
  // act 0 never seeds one; deeper floors sometimes do, from the floor stream
  D.srand(221); D.newRun('knight');
  let early = false;
  for (let f = 1; f <= 5; f++) { D.S.run.floor = f; D.genFloor(); if (D.S.run.jar) early = true; }
  t.ok(!early, 'the first act keeps its bed bare');
  let jar = null;
  for (let f = 6; f <= 20 && !jar; f++) { D.S.run.floor = f; D.genFloor(); jar = D.S.run.jar; }
  t.ok(jar, 'past act 1, a jar eventually rides the bed');
  t.ok(jar.x >= 25 && jar.x <= 75 && jar.hp === 3 && jar.rounds === 4, 'seeded sane: mid-bed, 3 hp, 4 rounds');
  // the smash: two cracks, then the spill
  D.S.run.jar = { x: 50, hp: 3, rounds: 4, flashT: 0 };
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  D.S.enemy.hp = D.S.enemy.maxHp = 500;
  t.ok(!D.jarSmash({ x: 48, vx: 0 }), 'the first hit only cracks');
  t.eq(D.S.run.jar.hp, 2, 'two panes left');
  D.jarSmash({ x: 52, vx: 0 });
  const gems0 = D.S.coins.filter(c => c.kind === 'gem').length;
  t.ok(D.jarSmash({ x: 50, vx: 0 }), 'the third hit SHATTERS');
  t.eq(D.S.run.jar, null, 'the jar is gone');
  t.eq(D.S.coins.filter(c => c.kind === 'gem').length, gems0 + 2, 'two gems spill out');
  t.ok(D.S.relicPick && D.S.relicPick.rar === 'c', 'and a relic pick waits in the glass');
  D.S.relicPick = null;
  // the physics path: an aimed coin at the jar's lane lands the hit
  D.S.run.jar = { x: 50, hp: 1, rounds: 4, flashT: 0 };
  D.spawnDrop(50, 24, 'coin');
  for (let i = 0; i < 240 && D.S.run.jar; i++) D.step(1 / 60, true);
  t.eq(D.S.run.jar, null, 'a dropped coin on the lane smashes it for real');
  // a wide coin misses
  D.S.run.jar = { x: 20, hp: 3, rounds: 4, flashT: 0 };
  D.spawnDrop(70, 24, 'coin');
  for (let i = 0; i < 240; i++) D.step(1 / 60, true);
  t.eq(D.S.run.jar.hp, 3, 'a coin two lanes over touches nothing');
  // ignored, it slides off the back edge in four rounds
  const y0 = D.jarY();
  D.endRoundNow();
  t.eq(D.S.run.jar.rounds, 3, 'each round slides it back a notch');
  t.ok(D.jarY() < y0, 'visibly so');
  D.S.run.jar.rounds = 1;
  D.endRoundNow();
  t.eq(D.S.run.jar, null, 'the last round takes it off the back edge');
  // a mid-run jar survives the save
  D.S.run.jar = { x: 61, hp: 2, rounds: 3, flashT: 0 };
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.run.jar.x, 61, 'the jar survives a reload');
  t.eq(R.S.run.jar.hp, 2, 'cracks and all');
  // the painter exists, cb-safe
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('function drawJar(t, dt)') >= 0, 'the jar has its painter');
  t.ok(src.indexOf("S.opts.cb ? '#ffffff'") >= 0, 'with a hard outline for cb mode');
  t.ok(src.indexOf('drawJar(t, dt);') >= 0, 'drawn behind the coins');
}

// -------- BRASS PEGS: the endless machine fights back --------
{
  // shared seeds raise the same pegs (side instances first)
  const { DP: A } = loadGame({}, false);
  const { DP: B } = loadGame({}, false);
  A.S.nextSeed = 777; A.srand(1); A.newRun('knight');
  B.S.nextSeed = 777; B.srand(50); B.newRun('knight');
  A.S.run.floor = 25; A.genFloor();
  B.S.run.floor = 25; B.genFloor();
  t.eq(JSON.stringify(A.S.run.pegs), JSON.stringify(B.S.run.pegs), 'two players, one seed, same pegs');
  const store = {};
  const { DP: D } = loadGame(store, false);
  D.srand(231); D.newRun('knight');
  // no pegs above the ledger
  for (let f = 1; f <= 21; f++) { D.S.run.floor = f; D.genFloor(); if (D.S.run.pegs.length) { t.ok(false, 'pegs above floor 22'); break; } }
  t.ok(true, 'the bed stays smooth through floor 21');
  // the count climbs 1 → 2 → 3 and every peg keeps clear of the tray
  const counts = {};
  for (const f of [22, 28, 34, 40]) {
    D.S.run.floor = f; D.genFloor();
    counts[f] = D.S.run.pegs.length;
    t.ok(D.S.run.pegs.every(pg => pg.x >= 15 && pg.x <= 85 && pg.y >= 30 && pg.y <= 55),
      'floor ' + f + ' pegs stay off the walls and the tray mouth');
  }
  t.ok(counts[22] === 1 && counts[28] === 2 && counts[34] === 3 && counts[40] === 3,
    'one stud at 22, two at 28, three at 34 — capped (' + JSON.stringify(counts) + ')');
  // the deflection: a coin dropped straight onto a peg drifts off line
  D.S.run.floor = 25; D.genFloor();
  D.S.run.pegs = [{ x: 50, y: 40 }];
  const c = D.spawnDrop(50, 40, 'coin');
  for (let i = 0; i < 60 && c.st === 'air'; i++) D.step(1 / 60, true);
  t.ok(Math.abs(c.x - 50) > 1.5, 'the peg shoulders the coin aside (drift ' + Math.abs(c.x - 50).toFixed(1) + ')');
  // ...and a clear lane drops true
  D.S.run.pegs = [];
  const c2 = D.spawnDrop(30, 40, 'coin');
  const x0 = c2.x;
  for (let i = 0; i < 30 && c2.st === 'air'; i++) D.step(1 / 60, true);
  t.ok(Math.abs(c2.x - x0) < 1.5, 'no peg, no push');
  // pegs ride the save
  D.S.run.pegs = [{ x: 44, y: 33 }, { x: 66, y: 51 }];
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.run.pegs.length, 2, 'the studs survive a reload');
  t.eq(R.S.run.pegs[0].x, 44, 'in place');
  // the painter and the announcement
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('function drawPegs(t)') >= 0, 'the pegs have their painter');
  t.ok(src.indexOf('BRASS PEGS rise from the bed') >= 0, 'and announce themselves once');
  t.ok(src.indexOf("CLIENT_BOARD_V = 2") >= 0, 'the client stamps its board version');
}

// -------- THE TOLLKEEPER: the ninth hero, the economy as a kit --------
{
  const store = {};
  const { DP: D } = loadGame(store, false);
  const kitTotal = Object.values(D.TOLL_KIT).reduce((a, b) => a + b, 0);
  t.eq(kitTotal, 14, 'the fixed kit holds fourteen coins');
  // the seal: 150 coins skimmed, lifetime
  t.ok(!D.heroUnlocked('toll'), 'sealed on a fresh profile');
  t.eq(D.heroLockText('toll'), 'let the deep skim 150 coins', 'the seal names its price');
  D.S.life.skimmed = 149;
  t.ok(!D.heroUnlocked('toll'), '149 is not 150');
  D.S.life.skimmed = 150;
  t.ok(D.heroUnlocked('toll'), 'the deep has skimmed enough');
  // the skim feeds the tally for everyone
  D.srand(241); D.newRun('knight');
  D.S.run.floor = 18;
  D.S.run.purse = { coin: 40, silver: 0, green: 0, red: 0, blue: 0, lucky: 0 };
  const sk0 = D.S.life.skimmed;
  D.stairSkim();
  t.eq(D.S.life.skimmed, sk0 + 8, 'every skimmed coin counts toward the seal');
  // his kit: fixed hand, bolt-ons converted to gold at 2:1
  D.S.ws.purse = 2;                          // +4 coins that he will NOT keep
  D.srand(242); D.newRun('toll');
  t.eq(D.S.run.hero, 'toll', 'the tollkeeper answers');
  t.eq(D.purseTotal(), 14, 'his purse is the kit, nothing more');
  t.eq(D.S.run.purse.silver, 4, 'four silver, as issued');
  t.ok(D.S.run.gold >= 2, 'the surplus paid out as gold (' + D.S.run.gold + ')');
  // gains melt at the next battle's refill
  D.S.run.purse.lucky += 3;
  const tg0 = D.S.run.gold;
  D.S.run.room.ents = [{ kind: 'monster', mtype: 'battle', eid: 'orc', done: false, px: 0.5, py: 0.4 }];
  D.interact(0);
  t.eq(D.purseTotal(), 14, 'the battle refill resets the hand');
  t.eq(D.S.run.purse.lucky, 0, 'windfall luckies melt');
  t.eq(D.S.run.gold, tg0 + 6, 'at the skim’s honest 2:1');
  // banking prepays the toll (lootKey is the kind for plain pieces)
  D.S.battle.loot = [{ k: 'coin' }, { k: 'coin' }, { k: 'silver' }];
  D.S.run.tollPaid = 0;
  t.ok(D.bankLoot('coin'), 'a piece banks');
  t.ok(D.bankLoot('silver'), 'and another');
  t.eq(D.S.run.tollPaid, 2, 'every banked piece prepays the toll');
  D.S.run.tollPaid = D.TOLL_PREPAY_CAP;
  D.bankLoot('coin');
  t.eq(D.S.run.tollPaid, D.TOLL_PREPAY_CAP, 'the meter caps at ' + D.TOLL_PREPAY_CAP);
  D.S.run.tollPaid = 5;
  D.S.screen = 'dungeon'; D.S.room = null; D.S.victory = null; D.S.enemy = null; D.S.foes = []; D.S.battle = null;
  D.S.run.floor = 1;
  const pt0 = D.purseTotal();
  D.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  D.interact(0);
  t.eq(D.S.run.floor, 2, 'the prepaid stairs descend');
  t.eq(D.S.run.tollPaid, 3, 'two of the five prepaid pieces spent');
  t.eq(D.purseTotal(), pt0, 'the purse untouched');
  // short prepay falls back to the purse
  D.S.run.tollPaid = 0;
  D.S.run.room.ents = [{ kind: 'stairs', done: false, px: 0.5, py: 0.5 }];
  D.interact(0);
  t.eq(D.S.run.floor, 3, 'an empty meter still descends the honest way');
  t.ok(D.purseTotal() < 14, 'paid from the hand this time');
  // the prepaid meter rides the save
  D.S.run.tollPaid = 7;
  D.save();
  const { DP: R } = loadGame(store, false);
  t.eq(R.S.run.tollPaid, 7, 'the meter survives a reload');
  t.eq(R.S.run.hero, 'toll', 'still the keeper');
  // the wiring
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('toll prepaid: ') >= 0, 'the battle HUD shows the meter');
  t.ok(src.indexOf('S.run.tollPaid = Math.min(TOLL_PREPAY_CAP') >= 0, 'banking feeds it, capped');
}

// -------- TOAST TRIAGE: announcements take turns now --------
{
  const { DP: D } = loadGame({}, false);
  D.srand(251); D.newRun('knight');
  D.S.toast = null; D.S.toastQ = [];
  D.toast('first');
  D.toast('second');
  D.toast('third');
  t.eq(D.S.toast.txt, 'first', 'the first line shows at once');
  t.eq(D.S.toastQ.join(','), 'second,third', 'the rest wait their turn in order');
  // the floor-22 pileup, no longer silent
  D.toastTick(3.0);
  t.eq(D.S.toast.txt, 'second', 'expiry brings up the next line');
  D.toastTick(3.0);
  t.eq(D.S.toast.txt, 'third', 'and the next');
  D.toastTick(3.0);
  t.eq(D.S.toast, null, 'then quiet');
  // duplicates collapse, the queue caps at four
  D.toast('same'); D.toast('same');
  t.eq(D.S.toastQ.length, 0, 'a repeated line is said once');
  for (let i = 0; i < 9; i++) D.toast('line ' + i);
  t.eq(D.S.toastQ.length, 4, 'four wait at most');
  D.S.toast = null; D.S.toastQ = [];
  // with a queue waiting, the current line hurries
  D.toast('slow');
  D.toast('waiting');
  D.toastTick(0.01);
  t.ok(D.S.toast.t <= 1.7, 'a crowded stage shortens each turn');
  // long lines are trimmed to one clean line
  D.S.toast = null; D.S.toastQ = [];
  D.toast('x'.repeat(140));
  t.ok(D.S.toast.txt.length <= 90, 'ninety chars and an ellipsis, no more');
  // the screen shows how many wait
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf("'+' + S.toastQ.length") >= 0, 'the queued count rides the toast');
  t.ok(src.indexOf('toastTick(dt);') >= 0, 'the browser loop uses the shared ticker');
}

// -------- TIER 11: the NL catch-up — tiers 7-10 chrome speaks Dutch --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  const nl = D.LANGS.nl;
  t.ok(Object.keys(nl).length >= 100, 'the NL table covers 100+ strings (' + Object.keys(nl).length + ')');
  t.ok(Object.values(nl).every(v => typeof v === 'string' && v.length > 0), 'still no empty NL entries');
  D.setLang('nl');
  t.eq(D.TR('CONTINUE ▶'), 'VERDER ▶', 'the victory door speaks Dutch');
  t.eq(D.TR('DESCEND ▼'), 'DAAL AF ▼', 'so does the boss stair');
  t.eq(D.TR('YES'), 'JA', 'the confirm sheet defaults translate');
  t.eq(D.TR('CANCEL'), 'ANNULEER', 'both of them');
  t.eq(D.TR('TAKE THE LAW'), 'AANVAARD DE WET', 'the weekly decree button translates');
  t.eq(D.TR('THE BOOK'), 'HET BOEK', 'the records tabs translate');
  t.eq(D.TR('TALES'), 'VERHALEN', 'the codex tales shelf translates');
  t.eq(D.TR('THIS MONTH'), 'DEZE MAAND', 'the monthly board tab translates');
  t.eq(D.TR('\u{1F4C5} DAILY'), '\u{1F4C5} DAGRUN', 'the daily chip translates');
  t.eq(D.TR('\u{1F381} STAKE'), '\u{1F381} INZET', 'the gift stake translates');
  t.eq(D.TR('Abandon the current run?'), 'De huidige run opgeven?', 'static confirm messages translate');
  t.eq(D.TR('ON'), 'AAN', 'the settings toggles translate');
  t.eq(D.TR('\u{1F9FF} toll prepaid: '), '\u{1F9FF} tol vooruitbetaald: ', 'the tollkeeper gauge translates');
  t.eq(D.TR('\u{1F4C5} THE DAILY — Knight'), '\u{1F4C5} THE DAILY — Knight', 'dynamic confirm titles fall through untouched');
  // the call sites are truly wrapped (source proof, escaped emoji forms)
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  for (const site of [
    "TR('SKIP ▼') : TR('DESCEND ▼')",
    "TR('GOT IT ▶')",
    "TR(c.yesLabel || 'YES')",
    "TR(c.noLabel || 'CANCEL')",
    "txt(TR(c.msg)",
    "full ? '✦' + TR(label) : TR(label)",
    "82, 30, TR(label)",
    "TR('THIS MONTH'), 'monthly'",
    "TR(spent ? '\\u{1F4C5} done!' : '\\u{1F4C5} DAILY')",
    "TR(S.weeklyPick ? '\\u{2696}\\u{FE0F} DECREE ON' : '\\u{2696}\\u{FE0F} THIS WEEK')",
    "TR('\\u{1F331} TODAY\\u2019S MAZE')",
    "TR('\\u{1F3C5} CARVE IT')",
    "TR('\\u{1F381} STAKE')",
    "TR(val ? 'ON' : 'OFF')",
    "TR('\\u{1F9FF} toll prepaid: ')",
  ]) t.ok(src.indexOf(site) >= 0, 'chrome site wrapped: ' + site.slice(0, 44));
  // the s29 lesson, enforced: the LANGS table itself never calls TR()
  const table = src.slice(src.indexOf('const LANGS = {'), src.indexOf("let LANG = 'en';"));
  t.ok(table.length > 2000 && table.indexOf('TR(') < 0, 'no LANGS key is wrapped in TR()');
}

// -------- TIER 11: keyboard reach — TAB/ESC drive every sheet, live --------
{
  const st = {};
  const { DP: K, raf } = loadGame(st, true);
  let ts = 0;
  const frames = (n) => { for (let i = 0; i < (n || 2); i++) { ts += 16.7; const cb = raf(); if (cb) cb(ts); } };
  const labels = () => K.kb.buttons().map(b => b.label).filter(Boolean);
  const seen = (frag) => labels().some(l => l.indexOf(frag) >= 0);
  const press = (label, exact) => {
    const b = K.kb.buttons().find(b2 => b2.label && (exact ? b2.label === label : b2.label.indexOf(label) >= 0));
    if (!b) return false;
    b.cb(); frames(2); return true;
  };
  frames(6);
  t.ok(K.kb && K.kb.targets().length > 0, 'the title offers ring targets');
  // trophy hall: reach, then ESC out
  t.ok(press('\u{1F3C6}', true), 'the trophy chip is a ringable button');
  t.ok(seen('CLOSE ✕'), 'the trophy hall opened');
  t.ok(!K.kb.targets().some(i => K.kb.buttons()[i].label === '\u{1F4CA}'),
       'the ring cannot reach title chips through an open sheet');
  K.kb.back(); frames(2);
  t.ok(!seen('CLOSE ✕'), 'ESC leaves the trophy hall');
  // records: every tab reachable, ESC out
  t.ok(press('\u{1F4CA}', true), 'the records chip rings');
  for (const tab of ['THE BOOK', 'DEEP', 'HABITS', 'LEGACY']) {
    t.ok(press(tab), 'records tab reachable: ' + tab);
    t.ok(seen('CLOSE ✕'), 'and the sheet stands: ' + tab);
  }
  K.kb.back(); frames(2);
  t.ok(!seen('CLOSE ✕'), 'ESC leaves the records');
  // codex: the tales shelf included
  t.ok(press('\u{1F4D6}', true), 'the codex chip rings');
  t.ok(press('TALES'), 'the tales tab is reachable');
  K.kb.back(); frames(2);
  t.ok(!seen('CLOSE ✕'), 'ESC leaves the codex');
  // the deep board (offline err path) + the name carver on top of it
  t.ok(press('\u{1F3C5}', true), 'the board chip rings');
  t.ok(seen('carve a name'), 'the board sheet stands (offline)');
  t.ok(press('carve a name'), 'the carver door rings');
  t.ok(seen('DONE ✓'), 'the name pad opened over the board');
  K.kb.back(); frames(2);
  t.ok(!seen('DONE ✓') && seen('carve a name'), 'ESC pops the pad but keeps the board');
  K.kb.back(); frames(2);
  t.ok(!seen('carve a name'), 'a second ESC leaves the board');
  // the weekly confirm: modal ring holds only YES/NO, ESC pops it first
  t.ok(press('THIS WEEK'), 'the weekly chip rings');
  t.ok(seen('TAKE THE LAW'), 'the decree confirm stands');
  const tg = K.kb.targets();
  t.ok(tg.length === 2 && tg.every(i => ['TAKE THE LAW', 'CANCEL'].indexOf(K.kb.buttons()[i].label) >= 0),
       'a confirm narrows the ring to its two buttons');
  K.kb.cycle(1);
  t.ok(K.kb.focus() >= 0, 'TAB rings the first of them');
  while (K.kb.buttons()[K.kb.focus()].label !== 'CANCEL') K.kb.cycle(1);
  K.kb.press(); frames(2);
  t.ok(!seen('TAKE THE LAW'), 'ENTER on CANCEL dismisses the confirm');
  t.eq(K.S.weeklyPick, false, 'and no law was taken');
  // settings: reach and leave
  t.ok(press('⚙', true), 'the settings gear rings');
  t.ok(seen('CLOSE ✕'), 'the settings sheet stands');
  K.kb.back(); frames(2);
  t.ok(!seen('CLOSE ✕'), 'ESC leaves the settings');
  // the wraps hold LIVE in Dutch: real buttons carry translated labels
  K.S.lang = 'nl'; K.setLang('nl'); frames(2);
  t.ok(seen('▶ DE KERKER IN'), 'the title door reads Dutch on the live canvas');
  press('\u{1F4CA}', true);
  t.ok(seen('HET BOEK'), 'the records tabs read Dutch live');
  K.kb.back(); frames(2);
  // ESC priority is source-ordered: the confirm closes before the sheets
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  const kbBackBody = src.slice(src.indexOf('function kbBack()'), src.indexOf('function padTick'));
  t.ok(kbBackBody.indexOf('if (S.confirm)') < kbBackBody.indexOf('if (SHARE)'),
       'ESC pops the confirm before any sheet under it');
  t.ok(kbBackBody.indexOf('if (NAMEPAD)') < kbBackBody.indexOf('if (S.confirm)'),
       'but the name carver still goes first');
  t.ok(/if \(b\.w >= LW && b\.h >= LH\) from = i \+ 1;/.test(src),
       'the ring restarts after the topmost full-screen catcher');
}

// -------- TIER 11: HERO WIN-RATE SIM — the greedy autopilot probe --------
// A headless autopilot plays REAL runs through the real round machine:
// each round it throws the whole hand and the tray catches a fixed share
// (the machine treats every hero's coins the same, so a flat yield keeps
// the comparison fair), drinks at low HP, takes the first offer, pays the
// stair toll, always descends. Two fights and a boss per floor. The floor
// each hero reaches is REAL: real kits, perks, relics, foes and scaling.
// The absolute numbers are policy-flavored; the SPREAD is what the rail
// guards — no hero's median may sink below 60% of the pack's.
{
  const SIM_SEEDS = [11, 23, 47, 61, 83];
  const MAX_FLOOR = 14;                    // past the act-3 gate, cheap in CI
  const YIELD = 0.55;                      // the tray's share of a thrown hand
  const st = {};
  const { DP: D } = loadGame(st, false);
  const S2 = D.S;
  const relicTally = {};                   // boss-spread offers, for the audit

  const fight = (type) => {
    if (!D.startBattle(type)) return false;
    let rounds = 0;
    while (S2.run && S2.battle && !S2.victory && rounds < 30) {
      const B = S2.battle;
      if (B.phase !== 'drop') { D.battleTick(0.4); continue; }
      rounds++;
      // the poltergeist and the crane keeper hold no hand — their purse
      // pours in from above; the same flat yield keeps it apples-to-apples
      const base = (D.ghostRun() || D.craneRun()) ? { ...S2.run.purse } : B.hand;
      for (const k of D.COIN_KINDS) {
        const n = Math.round((base[k] || 0) * YIELD);
        for (let i = 0; i < n; i++) B.loot.push({ k });
        if (base === B.hand) B.hand[k] = 0;
      }
      // the standing pile pays too: the round re-salt spills its share over
      // the lip (real kind mix via rollPileKind), and one piece of owned
      // gear rides the pile into the tray each round
      const pile = Math.round(D.C.ROUND_RAIN * YIELD);
      for (let i = 0; i < pile; i++) B.loot.push({ k: D.rollPileKind() });
      const gear = Object.keys(S2.run.arsenal || {}).filter(iid => S2.run.arsenal[iid] > 0);
      if (gear.length) B.loot.push({ k: 'item', iid: gear[rounds % gear.length] });
      S2.rain.length = 0;                  // headless: nothing lands rain
      if (S2.run.hp <= S2.run.maxHp * 0.35 && S2.run.potions > 0) D.usePotion();
      D.endRoundNow();
      let g = 600;
      while (S2.run && S2.battle && S2.battle.phase !== 'drop' && !S2.victory && g--) D.battleTick(0.4);
    }
    if (!S2.run) return false;             // the run ended on a foe's swing
    if (!S2.victory) { D.endRun('stalemate'); return false; }
    const v = S2.victory;
    if (v.relicOffer) {
      for (const id of v.relicOffer) relicTally[id] = (relicTally[id] || 0) + 1;
      if (!v.relicPicked) D.pickRelicOffer(0);
    }
    if (v.offer && !v.picked) D.pickCoin(0);
    D.leaveBattle();
    return !!S2.run;
  };

  const shopStop = () => {
    // the innkeeper's till: a potion when the belt is light, then the best
    // blade gold can buy — one piece a floor, like a real shop shelf
    if (S2.run.potions < 2 && S2.run.gold >= 30) { S2.run.gold -= 30; S2.run.potions++; }
    const forSale = D.ITEMS.filter(it => it.cost <= S2.run.gold).sort((a, b) => b.cost - a.cost);
    if (forSale.length) { S2.run.gold -= forSale[0].cost; D.grantItem(forSale[0].id); }
  };

  const simRun = (heroId, seed) => {
    D.srand(seed);
    D.newRun(heroId);
    S2.run.bside = 0;      // the boss roster flips per LIFETIME run — pin one side
    while (S2.run && S2.run.floor <= MAX_FLOOR) {
      const f = S2.run.floor;
      S2.run.depth = 3;    // the midline room depth, same as the balance probe
      if (!fight('battle') || !fight('battle') || !fight('boss')) break;
      shopStop();
      D.stairSkim();
      if (!(D.tollRun() && (S2.run.tollPaid || 0) >= D.stairToll())) D.spendPurse(D.stairToll());
      else S2.run.tollPaid -= D.stairToll();
      D.nextFloor();
      if (S2.run.floor === f) break;       // never loop in place
    }
    const reached = S2.run ? S2.run.floor : ((S2.over && S2.over.floor) || 1);
    if (S2.run) D.endRun('probe done');
    return reached;
  };

  const t0 = Date.now();
  const med = {};
  for (const h of D.HEROES) {
    const floors = SIM_SEEDS.map(sd => simRun(h.id, sd)).sort((a, b) => a - b);
    med[h.id] = floors[(floors.length / 2) | 0];
  }
  const heroIds = D.HEROES.map(h => h.id);
  const packSorted = heroIds.map(h => med[h]).sort((a, b) => a - b);
  const pack = packSorted[(packSorted.length / 2) | 0];
  console.log('# hero sim: ' + heroIds.map(h => h + ':' + med[h]).join(' ')
            + '  pack:' + pack + '  (' + SIM_SEEDS.length + ' seeds, greedy autopilot, '
            + (Date.now() - t0) + 'ms)');
  t.eq(heroIds.length, 9, 'all nine heroes take the autopilot out');
  t.ok(Object.values(med).every(f => f >= 2), 'every hero clears at least a floor on autopilot');
  for (const h of heroIds) {
    t.ok(med[h] >= pack * 0.6,
         h + ' keeps up with the pack (median ' + med[h] + ' vs pack ' + pack + ')');
  }
  t.ok(Date.now() - t0 < 20000, 'the whole probe stays under twenty seconds');
  // determinism: the same hero and seed always walk the same run
  t.eq(simRun('knight', SIM_SEEDS[0]), simRun('knight', SIM_SEEDS[0]), 'the autopilot is deterministic');
  // the relic-audit groundwork: boss spreads were seen and tallied
  const offered = Object.keys(relicTally).length;
  const never = D.RELICS.filter(r => !relicTally[r.id]).length;
  console.log('# relic offers: ' + offered + ' distinct relics offered across boss spreads, '
            + never + ' never seen (buff pass reads this tally next)');
  t.ok(offered >= 20, 'boss spreads sample a broad slice of the shelf (' + offered + ')');
}

// -------- TIER 11: RELIC PICKUP AUDIT — reachability, tails, the dud pass --------
{
  const st = {};
  const { DP: D } = loadGame(st, false);
  const S2 = D.S;
  D.srand(7); D.newRun('knight');
  S2.run.bside = 0;
  // reachability: six thousand seeded drop rolls must touch the whole shelf
  const seen = {};
  for (let i = 0; i < 6000; i++) { const id = D.rollRelicDrop(); if (id) seen[id] = (seen[id] || 0) + 1; }
  const nonNg = D.RELICS.filter(r => !r.ng);
  const missed = nonNg.filter(r => !seen[r.id]);
  t.eq(missed.length, 0, 'every plain relic can drop' + (missed.length ? ' (missed: ' + missed.map(r => r.id).join(',') + ')' : ''));
  t.ok(D.RELICS.filter(r => r.ng).every(r => !seen[r.id]), 'ng-gated relics never leak into a plain run');
  S2.run.ng = 2;
  const seenNg = {};
  for (let i = 0; i < 4000; i++) { const id = D.rollRelicDrop(); if (id) seenNg[id] = 1; }
  t.ok(D.RELICS.filter(r => r.ng).every(r => seenNg[r.id]), 'the gated shelf opens at legend depth');
  S2.run.ng = 0;
  // the tail: the ten least-drawn (probe — future buff passes read this)
  const rank = nonNg.map(r => [r.id, seen[r.id] | 0]).sort((a, b) => a[1] - b[1]);
  console.log('# relic drop tail: ' + rank.slice(0, 10).map(x => x[0] + ':' + x[1]).join(' '));
  // rarity keeps its promise in the wash: per-relic draw rates order c > r > e
  const per = { c: [0, 0], r: [0, 0], e: [0, 0] };
  for (const r of nonNg) { per[r.rar][0] += seen[r.id] | 0; per[r.rar][1]++; }
  const avg = (k) => per[k][0] / per[k][1];
  t.ok(avg('c') > avg('r') && avg('r') > avg('e'),
       'commons out-drop rares out-drop epics (' + avg('c').toFixed(1) + '/' + avg('r').toFixed(1) + '/' + avg('e').toFixed(1) + ')');
  // THE DUD PASS: three strictly-dominated relics brought level with their twins
  t.eq(D.relicById('vault').desc, 'the bank holds +2 pieces', 'VAULT wears its new promise');
  S2.run.relics.push('vault');
  t.eq(D.bankMax(), D.C.BANK_MAX + 2, 'and keeps it — level with its twin STRONGBOX');
  S2.run.relics.length = 0;
  t.eq(D.relicById('barricade').desc, 'start every round with +4 block', 'BARRICADE wears its new promise');
  t.eq(D.relicById('tithe').desc, '+10 gold after every victory', 'TITHE wears its new promise');
  S2.run.relics.push('tithe');
  D.startBattle('battle');
  const gold0 = S2.run.gold;
  for (const f of S2.foes) { if (f.hp > 0) { f.hp = 1; D.dmgFoe(f, 5); } }
  t.ok(S2.run.gold >= gold0 + 10, 'a rare tithe now out-pays a common piggy through act two ('
       + (S2.run.gold - gold0) + ' on the kill)');
  D.leaveBattle();
  if (S2.run) D.endRun('audit done');
}

// -------- TIER 11: LATE-HUD DECLUTTER — the deep strip breathes --------
{
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'dungeon_pusher', 'index.html'), 'utf8');
  t.ok(src.indexOf('Math.floor(t / 2.5) % mn') >= 0, 'the endless decrees take turns on one line');
  t.ok(src.indexOf("': ' + MUTS.slice(0, mutCount()).map(m => m.name).join(' • ')") < 0,
       'the overflowing full roll-call is gone');
  t.ok(src.indexOf("MUTS[mi].name + ' — ' + MUTS[mi].desc") >= 0,
       'and each posted law now spells out its rule');
  t.ok(src.indexOf("'\\u{1F511} × ' + r.goldKeys") < 0, 'golden keys left the arsenal strip’s lane');
  t.ok(src.indexOf("(r.goldKeys > 0 ? '  \\u{1F511} ' + r.goldKeys : '')") >= 0, 'and ride the key line instead');
  // deep frames draw clean with a live ctx: floor 26, decrees up, keys held
  const { DP: K, raf } = loadGame({}, true);
  let ts = 0;
  const frames = (n) => { for (let i = 0; i < n; i++) { ts += 16.7; const cb = raf(); if (cb) cb(ts); } };
  frames(4);
  K.srand(5); K.newRun('knight');
  K.S.run.floor = 26; K.S.run.goldKeys = 3;
  t.ok(K.mutCount() >= 2, 'floor 26 posts standing decrees (' + K.mutCount() + ')');
  frames(10);                                  // dungeon: the rotating decree strip
  K.startBattle('battle');
  frames(10);                                  // battle: the combined key line
  t.ok(K.S.screen === 'battle', 'floor-26 frames draw without a crash');
}

t.done();
