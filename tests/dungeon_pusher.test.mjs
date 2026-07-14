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
t.ok(ITEMS.length === 8 && ITEMS.every(i => i.id && i.icon && i.name && i.cost > 0), 'eight arsenal items defined');
t.ok(ENEMIES.length >= 8 && ENEMIES.every(e => e.hp > 0 && e.atk > 0), 'the bestiary is populated');
t.eq(BOSSES.length, 3, 'three floor bosses');
t.ok(RELICS.length >= 38 && RELICS.every(r => r.id && r.desc), 'the artifact shelf is stocked (' + RELICS.length + ')');
t.ok(RELICS.every(r => ['c', 'r', 'e'].indexOf(r.rar) >= 0), 'every artifact carries a rarity stamp');
t.eq(new Set(RELICS.map(r => r.id)).size, RELICS.length, 'no duplicate artifact ids');
t.eq(WHEEL.length, 8, 'the lucky wheel has eight segments');
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

// -------- the resolve RAMPS UP: every next piece flies faster --------
t.ok(DP.resolveSpeed(1) > DP.resolveSpeed(5) && DP.resolveSpeed(5) > DP.resolveSpeed(15),
     'the barrage accelerates piece by piece');
t.ok(DP.resolveSpeed(200) >= 0.12, 'with a floor, so it never hits zero');

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
// regen knits at round end
S.enemy.trait = 'regen'; S.enemy.hp = 100; S.enemy.pois = 0;
DP.endRoundTicks();
t.eq(S.enemy.hp, 103, 'a regenerating foe knits +3 at round end');
S.enemy.trait = null;

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
t.ok(!S.victory.relic, 'common monsters guard no artifacts');
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
  for (let i = 0; i < 30; i++) {
    S.run.room.ents = [{ kind: 'chest', done: false }];
    const snap = {
      gold: S.run.gold, keys: S.run.keys, potions: S.run.potions, purse: DP.purseTotal(),
      arsenal: Object.values(S.run.arsenal).reduce((a, b) => a + b, 0),
    };
    t.ok(DP.interact(0), 'chest ' + i + ' opens');
    if (S.run.keys > snap.keys) keyDrops++;
    if (DP.purseTotal() > snap.purse) coinDrops++;
    const gained = S.run.gold > snap.gold || S.run.keys > snap.keys
      || S.run.potions > snap.potions || DP.purseTotal() > snap.purse
      || Object.values(S.run.arsenal).reduce((a, b) => a + b, 0) > snap.arsenal;
    if (!gained) t.ok(false, 'chest ' + i + ' paid nothing!');
    t.ok(S.run.room.ents[0].done, 'chest ' + i + ' is spent');
    t.ok(!DP.interact(0), 'chest ' + i + ' cannot be opened twice');
  }
  t.ok(keyDrops >= 1, 'some chests hold keys (' + keyDrops + '/30)');
  t.ok(coinDrops >= 1, 'some chests hold purse coins (' + coinDrops + '/30)');
  t.ok(S.toast, 'chests tell you what you got');
}
// shrine heals and cleanses
S.run.hp = 10; S.run.maxHp = 60; S.pPois = 5;
S.run.room.ents = [{ kind: 'shrine', done: false }];
DP.interact(0);
t.eq(S.run.hp, 10 + Math.round(60 * 0.35), 'shrine heals 35% of max HP');
t.eq(S.pPois, 0, 'shrine cleanses poison');
// wheel ghost grants a spin
S.wheelAnim = null;
S.run.room.ents = [{ kind: 'wheel', done: false }];
DP.interact(0);
t.ok(S.wheelAnim !== null, 'the wheel ghost spins the lucky wheel');

// -------- the shopkeeper (pouches and single coins for the purse) --------
DP.srand(23);
S.run.room.ents = [{ kind: 'shop', done: false }];
t.ok(DP.interact(0), 'talking to the shopkeeper opens the shop');
t.ok(S.room && S.room.type === 'shop', 'shop is open');
t.ok(S.room.stock.length >= 6, 'shop stocks a full shelf (' + S.room.stock.length + ')');
t.ok(S.room.stock.filter(x => x.kind === 'item').length === 3, 'three arsenal items on sale');
t.ok(S.room.stock.some(x => x.kind === 'relic'), 'a relic gleams in the case');
t.ok(S.room.stock.some(x => x.kind === 'pouch'), 'a coin pouch hangs on the shelf');
t.ok(S.room.stock.some(x => x.kind === 'coin' && COIN_KINDS.includes(x.cid)),
     'and a single typed coin for the purse');
t.eq(S.room.stock.find(x => x.kind === 'potion').price, 45, 'potions cost more now');
t.eq(S.room.stock.find(x => x.kind === 'pouch').price, 60, 'pouches too');
{
  const relicStock = S.room.stock.find(x => x.kind === 'relic');
  t.ok(relicStock && relicStock.price >= 90, 'artifacts are priced by rarity, from 90 up (' + relicStock.price + ')');
  t.ok(relicStock.label.indexOf('[') > 0, 'and advertise their rarity on the label');
}
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
const relicSlot = S.room.stock.findIndex(x => x.kind === 'relic');
const rid = S.room.stock[relicSlot].rid;
t.ok(DP.buyShop(relicSlot), 'gold buys the relic');
t.ok(DP.hasRelic(rid), 'relic is now owned');
const hpSlot = S.room.stock.findIndex(x => x.kind === 'maxhp');
const mhp0 = S.run.maxHp;
DP.buyShop(hpSlot);
t.eq(S.run.maxHp, mhp0 + 10, 'max HP upgrade sticks');
t.ok(DP.closeModal(), 'LEAVE closes the shop');
t.ok(!S.run.room.ents[0].done, 'the shopkeeper stays in the room');
DP.interact(0);
t.ok(S.room && S.room.stock[itemSlot].sold, 'reopening shows the same shelf — sold stays sold');
DP.closeModal();

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

// -------- elites pay double keys --------
DP.srand(31);
S.run.room.ents = [{ kind: 'monster', mtype: 'elite', eid: 'ogre', done: false }];
DP.interact(0);
t.ok(S.enemy.elite && S.enemy.name.indexOf('ELITE') === 0, 'elites are branded');
const keysE = S.run.keys;
S.enemy.hp = 1;
DP.dmgEnemy(5);
t.eq(S.run.keys, keysE + C.KEY_ELITE, 'an elite kill pays ' + C.KEY_ELITE + ' keys');
// and shakes an ARTIFACT loose
t.ok(S.victory && S.victory.relic, 'the elite was guarding an artifact');
t.ok(S.run.relics.indexOf(S.victory.relic) >= 0, 'it joins your shelf on the spot');
{
  const rl = RELICS.find(r => r.id === S.victory.relic);
  t.ok(rl && ['c', 'r', 'e'].indexOf(rl.rar) >= 0, 'and it is a real catalogued drop');
}
DP.leaveBattle();
S.run.relics = [];

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

// -------- the ARTIFACT catalog: rarity-weighted drops --------
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

// -------- artifact effects on the coins --------
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
  const plain = DP.resolveSpeed(10);
  S.run.relics = ['quicksilver'];
  t.ok(DP.resolveSpeed(10) < plain, 'Quicksilver: the barrage ramps twice as fast');
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
DP.interact(0);
t.eq(S.run.floor, 2, 'stepping onto the stairs descends');
t.ok(S.run.map && S.run.map.cur === '0,0', 'a fresh floor map is carved');
t.eq(S.run.depth, 1, 'next floor starts at the entrance');
t.eq(S.screen, 'dungeon', 'back in a fresh room');
t.eq(mapRooms().filter(r => r.visited).length, 1, 'the new floor is all fog again');

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
  frames(10);                                     // chest toast
  D.interact(1);
  frames(10);                                     // shop modal
  D.closeModal();
  D.S.run.room.ents[1] = { kind: 'smith', done: false, px: 0.7, py: 0.3 };
  D.interact(1);
  frames(8);                                      // forge modal
  D.pickBoon(0);
  frames(6);
  D.closeModal();
  D.interact(0);                                  // fight the orc
  D.S.enemy.hp = D.S.enemy.maxHp = 500;
  frames(10);                                     // hand selector row + tilt cluster
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
  D.S.enemy.hp = 1; D.dmgEnemy(5);
  frames(40);                                     // victory overlay + the coin offer
  D.pickCoin(0);
  frames(10);                                     // the picked coin glows
  D.leaveBattle();
  frames(10);
  // a 2-foe GANG-UP (one elite): multi-foe panel, retargeting, frost AoE,
  // and the artifact-drop banner on the victory overlay
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
  D.hurtPlayer(99999, 'render doom');
  frames(12);                                     // game over screen
  t.eq(D.S.screen, 'over', 'render pass ends on the over screen');
  t.ok(true, 'all screens rendered without throwing');
}

t.done();
