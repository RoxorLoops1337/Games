// Headless suite for Dungeon Pusher (coin pusher roguelike). The game's inline
// <script> is evaluated with a stubbed DOM and no canvas ctx, which flips its
// HEADLESS switch: the full 2.5D pusher sim plus the whole roguelike layer
// (battles, enemy AI, poison/stun/block, arsenal, the top-down room crawl
// with keys/doors/inhabitants, shops, forges, relics, save/load) runs and is
// driven through window.DP.
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
  const listeners = {};
  const mkEl = () => new Proxy({
    style: {}, addEventListener: (k, cb) => { listeners[k] = cb; },
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
  return { DP: globalThis.DP, raf: () => rafCb, listeners };
}

const t = harness('dungeon_pusher');
t.eq = (a, b, msg) => t.ok(a === b, msg + ' [' + a + ' != ' + b + ']');

const store = {};
const { DP } = loadGame(store, false);
const { S, C, ITEMS, ENEMIES, BOSSES, RELICS, WHEEL } = DP;
const DT = 1 / 60;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) DP.tick(DT); };
const platCoins = () => S.coins.filter(c => c.st === 'plat');
const ENT_KINDS = ['monster', 'chest', 'shop', 'smith', 'shrine', 'wheel'];
const mkMonster = (eid) => ({ kind: 'monster', mtype: 'battle', eid: eid || 'rat', done: false });

// -------- boot state --------
t.ok(DP.HEADLESS, 'headless mode detected');
t.eq(S.screen, 'title', 'boots to the title screen');
t.eq(S.run, null, 'no run in progress at first boot');
t.ok(ITEMS.length === 8 && ITEMS.every(i => i.id && i.icon && i.name && i.cost > 0), 'eight arsenal items defined');
t.ok(ENEMIES.length >= 8 && ENEMIES.every(e => e.hp > 0 && e.atk > 0 && e.period > 0), 'the bestiary is populated');
t.eq(BOSSES.length, 3, 'three floor bosses');
t.ok(RELICS.length >= 8 && RELICS.every(r => r.id && r.desc), 'relic shelf is stocked');
t.eq(WHEEL.length, 8, 'the lucky wheel has eight segments');

// -------- a new run --------
DP.srand(42);
DP.newRun();
t.eq(S.screen, 'dungeon', 'new run opens in the dungeon');
t.eq(S.run.floor, 1, 'run starts on floor 1');
t.eq(S.run.depth, 1, 'run starts at room 1');
t.eq(S.run.hp, C.START_HP, 'full HP at the start');
t.eq(S.run.wallet, C.START_COINS, 'starting coin purse');
t.eq(S.run.keys, C.START_KEYS, 'you start with three keys');
t.ok(S.run.arsenal.sword === 1 && S.run.arsenal.shield === 1 && S.run.arsenal.vial === 1,
     'starter arsenal: sword, shield, venom vial');
t.eq(S.run.potions, C.START_POTIONS, 'one potion in the belt');
t.ok(S.run.room && Array.isArray(S.run.room.ents), 'the first room is furnished');
t.ok(S.run.room.ents.length >= 1 && S.run.room.ents.length <= 3, 'a room holds 1-3 inhabitants');
t.ok(S.run.room.ents.every(e => ENT_KINDS.indexOf(e.kind) >= 0), 'inhabitant kinds are valid');
t.ok(S.run.room.doors.length >= 2 && S.run.room.doors.length <= 3, 'locked exit doors on the far wall');
t.ok(S.run.room.doors.every(d => Array.isArray(d.spec) && d.spec.length >= 1 && d.spec.length <= 3),
     'each door pre-rolls the room behind it');

// -------- room generation is procedural but sane --------
{
  let sawMonster = false, sawService = false, dupService = false, badMonster = false;
  for (let i = 0; i < 40; i++) {
    DP.genRoom();
    const ents = S.run.room.ents;
    if (ents.some(e => e.kind === 'monster')) sawMonster = true;
    if (ents.some(e => e.kind !== 'monster')) sawService = true;
    for (const k of ENT_KINDS.slice(1)) {
      if (ents.filter(e => e.kind === k).length > 1) dupService = true;
    }
    for (const e of ents) {
      if (e.kind === 'monster' && !ENEMIES.some(en => en.id === e.eid)) badMonster = true;
    }
  }
  t.ok(sawMonster, 'monsters roam the rooms');
  t.ok(sawService, 'chests, keepers and shrines appear too');
  t.ok(!dupService, 'never two of the same service in one room');
  t.ok(!badMonster, 'every room monster is pre-rolled from the bestiary');
}
// the softlock guard: key-broke in a fight-free room summons a wanderer
S.run.keys = 0;
DP.genRoom([{ kind: 'chest', done: false }]);
t.ok(S.run.room.ents.some(e => e.kind === 'monster'), 'no keys + no monster -> a wanderer finds you');
S.run.keys = C.START_KEYS;

// -------- tapping a monster starts the pusher fight --------
DP.srand(7);
S.run.room.ents = [mkMonster('rat'), { kind: 'chest', done: false }];
t.ok(DP.interact(0), 'tapping the monster starts the fight');
t.eq(S.screen, 'battle', 'the fight is on');
t.ok(S.enemy && S.enemy.hp > 0 && S.enemy.hp === S.enemy.maxHp, 'the foe appears at full health');
t.eq(S.enemy.id, 'rat', 'the room told you exactly who lurks — and it delivered');
t.eq(S.run.battleEnt, 0, 'the battle remembers which inhabitant it is');
t.ok(S.enemy.atkT > 0, 'enemy attack timer is armed');
t.ok(platCoins().length >= 40, 'battle pile is dense (' + platCoins().length + ' pieces)');
t.ok(S.coins.some(c => c.kind === 'item' && c.iid === 'sword'), 'your sword rides the pile');
t.eq(S.coins.filter(c => c.kind === 'item').length, 3, 'the whole starter arsenal is racked');
t.ok(S.coins.some(c => c.kind === 'bag'), 'a gold bag hides in the pile');
t.ok(platCoins().every(c => c.y >= 0 && c.y <= C.PLAT_FRONT + c.r), 'pile sits on the platform');

// -------- pusher kinematics --------
let lo = 1e9, hi = -1e9;
for (let i = 0; i < 300; i++) { DP.step(DT, true); const f = DP.pusherFront(0); lo = Math.min(lo, f); hi = Math.max(hi, f); }
t.ok(lo >= C.PUSH_MIN - 0.01 && hi <= C.PUSH_MAX + 0.01, 'pusher stays within its travel');
t.ok(hi - lo > (C.PUSH_MAX - C.PUSH_MIN) * 0.8, 'pusher sweeps most of its travel');

// -------- dropping costs coins and feeds the frenzy meter --------
S.cd = 0; S.run.wallet = 25; S.meter = 0; S.dropped = 0;
const w0 = S.run.wallet, n0 = S.coins.length;
t.ok(DP.drop(50), 'drop accepted');
t.eq(S.run.wallet, w0 - 1, 'drop costs one coin');
t.eq(S.coins.length, n0 + 1, 'drop spawns a coin');
t.eq(S.meter, 1, 'drop feeds the frenzy meter');
t.ok(!DP.drop(50), 'cooldown blocks an immediate second drop');
const dropped = S.coins[S.coins.length - 1];
t.eq(dropped.st, 'air', 'spawned coin is falling from the slot');
let landed = false;
for (let i = 0; i < 60 * 6 && !landed; i++) { DP.tick(DT); if (dropped.st === 'plat') landed = true; }
t.ok(landed, 'dropped coin lands on the platform (or the shelf)');
S.run.wallet = 0; S.cd = 0;
t.ok(!DP.drop(50), 'cannot drop with an empty purse');
t.eq(S.run.wallet, 0, 'purse never goes negative');

// -------- broke bailout: the dungeon pities you mid-fight --------
S.coins.length = 0;
S.run.wallet = 0; S.regen = 0;
S.enemy.atkT = 999;                      // hold the foe's swing for the timer test
step(C.PITY_T + 0.2);
t.ok(S.run.wallet >= 1, 'flat-broke fighter gets a slow pity coin');

// -------- tray hits damage the enemy; coins refund ammo --------
DP.srand(9);
S.coins.length = 0; S.combo = 0; S.lastCollect = -99; S.fever = 0;
S.enemy.hp = S.enemy.maxHp = 500; S.enemy.atkT = 999; S.enemy.pois = 0;
const hp0 = S.enemy.hp, wal0 = S.run.wallet;
const f1 = DP.place(40, C.PLAT_FRONT - 1, 'coin', 0, 'plat');
const f2 = DP.place(60, C.PLAT_FRONT - 1, 'coin', 0, 'plat');
f1.vy = 60; f2.vy = 60;
step(0.9);
t.ok(f1.scored && f2.scored, 'both coins over the edge fired');
t.eq(S.enemy.hp, hp0 - (C.DMG.coin + C.DMG.coin * 2), 'second coin in the window pays the combo multiplier');
t.eq(S.run.wallet, wal0 + 2 * C.REFUND.coin, 'tray coins refund ammo');
t.eq(S.combo, 2, 'combo counter tracked the chain');
step(C.COMBO_WIN + 0.6);
t.eq(S.combo, 0, 'combo lapses after the window');

// combo cap ignites FEVER
S.coins.length = 0; S.combo = 0; S.lastCollect = -99; S.fever = 0;
for (let i = 0; i < 8; i++) {
  const c = DP.place(12 + i * 10, C.PLAT_FRONT - 0.5, 'coin', 0, 'plat');
  c.vy = 70;
}
step(2.5);
t.ok(S.fever > 0, 'a maxed combo ignites FEVER ×2');

// -------- weapons, poison, shields, hearts, frost --------
DP.srand(11);
S.coins.length = 0; S.fever = 0; S.combo = 0; S.lastCollect = -99;
S.enemy.hp = S.enemy.maxHp = 500; S.enemy.atkT = 999; S.enemy.stunT = 0;
const sword = DP.place(50, C.PLAT_FRONT - 0.5, 'item', 0, 'plat');
sword.iid = 'sword'; sword.vy = 90;
const eh0 = S.enemy.hp;
step(2);
t.ok(sword.scored, 'sword pushed over the edge fires');
t.eq(S.enemy.hp, eh0 - DP.itemById('sword').dmg, 'sword deals its listed damage');
// poison vial stacks and ticks
S.coins.length = 0;
const vial = DP.place(50, C.PLAT_FRONT - 0.5, 'item', 0, 'plat');
vial.iid = 'vial'; vial.vy = 90;
step(1.5);
t.eq(S.enemy.pois, DP.itemById('vial').pois, 'venom vial applies poison stacks');
const ehPois = S.enemy.hp, stacks = S.enemy.pois;
step(C.POIS_TICK + 0.1);
t.eq(S.enemy.hp, ehPois - stacks, 'poison ticks for the stack count');
t.eq(S.enemy.pois, stacks - 1, 'poison decays as it ticks');
// shield blocks the next hit
S.coins.length = 0; S.run.block = 0;
const sh = DP.place(50, C.PLAT_FRONT - 0.5, 'item', 0, 'plat');
sh.iid = 'shield'; sh.vy = 90;
step(1.5);
t.eq(S.run.block, DP.itemById('shield').block, 'shield raises block');
const hpMe = S.run.hp;
DP.hurtPlayer(4, 'test');
t.eq(S.run.hp, hpMe, 'block soaks the whole hit');
t.eq(S.run.block, DP.itemById('shield').block - 4, 'block is consumed by damage');
// heart heals
S.run.hp = 10; S.coins.length = 0;
const ht = DP.place(50, C.PLAT_FRONT - 0.5, 'item', 0, 'plat');
ht.iid = 'heart'; ht.vy = 90;
step(1.5);
t.eq(S.run.hp, 10 + DP.itemById('heart').heal, 'heart heals its listed HP');
// frost rune stuns: the attack timer freezes
S.coins.length = 0; S.enemy.stunT = 0; S.enemy.atkT = 3;
const fr = DP.place(50, C.PLAT_FRONT - 0.5, 'item', 0, 'plat');
fr.iid = 'frost'; fr.vy = 90;
step(1.5);
t.ok(S.enemy.stunT > 0, 'frost rune freezes the foe');
const atkT0 = S.enemy.atkT;
step(1);
t.eq(S.enemy.atkT, atkT0, 'a frozen foe cannot wind up its attack');

// -------- gutter destroys arsenal items --------
DP.srand(13);
S.coins.length = 0;
S.run.arsenal.axe = 1;
const doomed = DP.place(3, DP.MACH.gutY + 10, 'item', 0, 'plat');
doomed.iid = 'axe'; doomed.vx = -30;
const lost0 = S.lost;
step(3);
t.eq(S.lost, lost0 + 1, 'item drifting off the side is lost');
t.ok(!S.run.arsenal.axe, 'the gutter DESTROYED the axe for good');
t.ok(!S.coins.includes(doomed), 'gutter item was removed from the world');
// plain coins are lost silently without touching the arsenal
S.coins.length = 0;
const gcoin = DP.place(3, DP.MACH.gutY + 10, 'coin', 0, 'plat');
gcoin.vx = -30;
const swords = S.run.arsenal.sword;
step(3);
t.eq(S.run.arsenal.sword, swords, 'coin gutter losses never touch the arsenal');

// -------- cursed skulls hurt YOU --------
S.coins.length = 0;
const hpSk = S.run.hp = 40;
const sk = DP.place(50, C.PLAT_FRONT - 0.5, 'skull', 0, 'plat');
sk.vy = 90;
step(1.5);
t.eq(S.run.hp, hpSk - (C.SKULL_DMG + S.run.floor - 1), 'a skull in the tray bites for cursed damage');

// -------- gold: gems and bags pay the run currency --------
S.coins.length = 0;
const g0 = S.run.gold;
const gem = DP.place(45, C.PLAT_FRONT - 0.5, 'gem', 0, 'plat');
gem.vy = 90;
const bag = DP.place(60, C.PLAT_FRONT - 0.5, 'bag', 0, 'plat');
bag.vy = 90;
step(1.5);
t.eq(S.run.gold, g0 + 15 + 8, 'gem pays 15 gold, bag pays 8');

// -------- the enemy fights back --------
DP.srand(17);
S.enemy.hp = 500; S.enemy.stunT = 0; S.enemy.pois = 0; S.pPois = 0;
S.enemy.trait = null;
S.run.block = 0; S.run.hp = 50;
S.enemy.atkT = 0.05;
step(0.3);
t.eq(S.run.hp, 50 - S.enemy.atk, 'the foe lands its blow on the timer');
t.ok(S.enemy.atkT > S.enemy.period - 0.5, 'attack timer rewinds after a swing');
// thief steals coins
S.enemy.trait = 'thief'; S.run.wallet = 10; S.run.hp = 200; S.run.maxHp = 200;
S.enemy.atkT = 0.05;
step(0.3);
t.eq(S.run.wallet, 8, 'a thief pockets two coins per hit');
// venomous poisons the player, and it ticks
S.enemy.trait = 'venom'; S.pPois = 0; S.pPoisT = 0;
S.enemy.atkT = 0.05;
step(0.3);
t.eq(S.pPois, 2, 'a venomous bite poisons you');
const hpPv = S.run.hp;
step(C.POIS_TICK + 0.1);
t.ok(S.run.hp < hpPv, 'player poison ticks damage');
// cursed enemies rain skulls onto YOUR field
S.enemy.trait = 'curse'; S.rain.length = 0;
S.enemy.atkT = 0.05;
step(0.2);
t.ok(S.rain.some(r => r.kind === 'skull'), 'a cursed foe hurls a skull onto the field');
// regen heals between swings
S.enemy.trait = 'regen'; S.enemy.hp = 100; S.enemy.maxHp = 500; S.enemy.regenT = 0; S.enemy.atkT = 999;
step(3.2);
t.ok(S.enemy.hp > 100, 'a regenerating foe knits itself back together');

// -------- frenzy meter --------
S.enemy.trait = null; S.enemy.atkT = 999;
S.meter = C.METER_MAX - 1; S.run.wallet = 30; S.cd = 0; S.rain.length = 0;
DP.drop(50);
t.eq(S.meter, 0, 'meter resets on frenzy');
t.ok(S.rain.filter(r => r.kind === 'coin' || r.kind === 'lucky' || r.kind === 'bag').length >= 6,
     'frenzy rains bonus coins');
t.eq(S.rain.filter(r => r.kind === 'item').length, 2, 'frenzy rains two free weapons');
t.ok(S.rain.filter(r => r.kind === 'item').every(r => r.temp), 'frenzy weapons are marked temporary');
step(2);
t.ok(S.coins.some(c => c.kind === 'item' && c.temp), 'free weapons landed on the field');
// temp items lost to the gutter never touch the arsenal
S.coins.length = 0;
const tempIt = DP.place(3, DP.MACH.gutY + 10, 'item', 0, 'plat');
tempIt.iid = 'sword'; tempIt.temp = true; tempIt.vx = -30;
const sw0 = S.run.arsenal.sword || 0;
step(3);
t.eq(S.run.arsenal.sword || 0, sw0, 'temporary items are not arsenal losses');

// -------- winning a battle pays gold AND a key --------
S.enemy.hp = 3; S.enemy.trait = null; S.enemy.pois = 0;
const kills0 = S.run.kills, gold0 = S.run.gold, keys0 = S.run.keys, depth0 = S.run.depth;
S.coins.length = 0;
const killer = DP.place(50, C.PLAT_FRONT - 0.5, 'item', 0, 'plat');
killer.iid = 'sword'; killer.vy = 90;
step(1.5);
t.ok(S.victory, 'the foe falls — victory overlay armed');
t.eq(S.run.kills, kills0 + 1, 'kill counted');
t.ok(S.run.gold > gold0, 'victory pays the bounty');
t.eq(S.run.keys, keys0 + C.KEY_KILL, 'every monster killed gives a key');
t.eq(S.victory.keys, C.KEY_KILL, 'the overlay brags about it');
t.ok(DP.leaveBattle(), 'CONTINUE returns to the room');
t.eq(S.screen, 'dungeon', 'back in the top-down room');
t.eq(S.run.depth, depth0, 'winning a fight does NOT change rooms');
t.ok(S.run.room.ents[0].done, 'the slain monster is gone from the room');
t.eq(S.victory, null, 'victory overlay cleared');
t.eq(S.run.battleEnt, null, 'battle entity slot cleared');

// -------- keys unlock doors --------
const kD = S.run.keys, dD = S.run.depth;
t.ok(DP.useDoor(0), 'a key opens the door');
t.eq(S.run.keys, kD - 1, 'the key is spent');
t.eq(S.run.depth, dD + 1, 'one room deeper');
t.ok(S.run.room.ents.length >= 1, 'the next room is furnished');
S.run.keys = 0;
t.ok(!DP.useDoor(0), 'no key, no passage');
t.ok(S.uiFlash && S.uiFlash.msg.indexOf('KEY') >= 0, 'the lock demands a key');
S.run.keys = 3;

// -------- room inhabitants --------
// chest: always gives SOMETHING
{
  DP.srand(19);
  let keyDrops = 0;
  for (let i = 0; i < 30; i++) {
    S.run.room.ents = [{ kind: 'chest', done: false }];
    const snap = {
      gold: S.run.gold, wallet: S.run.wallet, keys: S.run.keys, potions: S.run.potions,
      arsenal: Object.values(S.run.arsenal).reduce((a, b) => a + b, 0),
    };
    t.ok(DP.interact(0), 'chest ' + i + ' opens');
    if (S.run.keys > snap.keys) keyDrops++;
    const gained = S.run.gold > snap.gold || S.run.wallet > snap.wallet || S.run.keys > snap.keys
      || S.run.potions > snap.potions
      || Object.values(S.run.arsenal).reduce((a, b) => a + b, 0) > snap.arsenal;
    if (!gained) t.ok(false, 'chest ' + i + ' paid nothing!');
    t.ok(S.run.room.ents[0].done, 'chest ' + i + ' is spent');
    t.ok(!DP.interact(0), 'chest ' + i + ' cannot be opened twice');
  }
  t.ok(keyDrops >= 1, 'some chests hold keys (' + keyDrops + '/30)');
  t.ok(S.toast, 'chests tell you what you got');
}
// shrine heals and cleanses
S.run.hp = 10; S.run.maxHp = 60; S.pPois = 5;
S.run.room.ents = [{ kind: 'shrine', done: false }];
DP.interact(0);
t.eq(S.run.hp, 10 + Math.round(60 * 0.35), 'shrine heals 35% of max HP');
t.eq(S.pPois, 0, 'shrine cleanses poison');
t.ok(S.run.room.ents[0].done, 'shrine is spent');
// wheel ghost grants a spin
S.wheelAnim = null;
S.run.room.ents = [{ kind: 'wheel', done: false }];
DP.interact(0);
t.ok(S.wheelAnim !== null, 'the wheel ghost spins the lucky wheel');

// -------- the shopkeeper --------
DP.srand(23);
S.run.room.ents = [{ kind: 'shop', done: false }];
t.ok(DP.interact(0), 'talking to the shopkeeper opens the shop');
t.ok(S.room && S.room.type === 'shop', 'shop is open');
t.ok(S.room.stock.length >= 6, 'shop stocks a full shelf (' + S.room.stock.length + ')');
t.ok(S.room.stock.filter(x => x.kind === 'item').length === 3, 'three arsenal items on sale');
t.ok(S.room.stock.some(x => x.kind === 'relic'), 'a relic gleams in the case');
S.run.gold = 0;
t.ok(!DP.buyShop(0), 'cannot buy broke');
S.run.gold = 10000;
const itemSlot = S.room.stock.findIndex(x => x.kind === 'item');
const iid = S.room.stock[itemSlot].iid;
const had = S.run.arsenal[iid] || 0;
t.ok(DP.buyShop(itemSlot), 'gold buys the item');
t.eq(S.run.arsenal[iid], had + 1, 'bought item joins the arsenal');
t.ok(S.room.stock[itemSlot].sold, 'shelf slot is now SOLD');
t.ok(!DP.buyShop(itemSlot), 'cannot buy the same slot twice');
const relicSlot = S.room.stock.findIndex(x => x.kind === 'relic');
const rid = S.room.stock[relicSlot].rid;
t.ok(DP.buyShop(relicSlot), 'gold buys the relic');
t.ok(DP.hasRelic(rid), 'relic is now owned');
const hpSlot = S.room.stock.findIndex(x => x.kind === 'maxhp');
const mhp0 = S.run.maxHp;
DP.buyShop(hpSlot);
t.eq(S.run.maxHp, mhp0 + 10, 'max HP upgrade sticks');
const potSlot = S.room.stock.findIndex(x => x.kind === 'potion');
const pot0 = S.run.potions;
DP.buyShop(potSlot);
t.eq(S.run.potions, pot0 + 1, 'potion joins the belt');
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
DP.dmgEnemy(5, 50);
t.eq(S.run.keys, keysE + C.KEY_ELITE, 'an elite kill pays ' + C.KEY_ELITE + ' keys');
DP.leaveBattle();

// -------- relic effects --------
// whetstone: +30% weapon damage
S.run.relics = ['whet']; S.run.whet = 0; S.fever = 0;
t.eq(DP.weaponDmg(10), 13, 'whetstone sharpens weapon damage +30%');
S.run.relics = [];
t.eq(DP.weaponDmg(10), 10, 'without it, damage is flat');
// venom gland: +2 stacks
S.run.relics = ['venom'];
S.enemy = DP.mkEnemy('battle'); S.enemy.hp = 500;
S.screen = 'battle';
DP.poisonEnemy(4, 50);
t.eq(S.enemy.pois, 6, 'venom gland adds two stacks');
// lantern: every door scouted
S.run.relics = ['lantern'];
S.screen = 'dungeon';
DP.genRoom();
t.ok(S.run.room.doors.every(d => d.known), 'the lantern reveals every door');
S.run.relics = [];
// second wind: survive a killing blow once
S.run.relics = ['wind']; S.run.windUsed = false; S.run.hp = 3; S.run.block = 0;
DP.hurtPlayer(99, 'test doom');
t.eq(S.run.hp, 1, 'second wind holds you at 1 HP');
t.ok(S.run.windUsed, 'second wind is spent');
DP.hurtPlayer(99, 'test doom');
t.eq(S.run, null, 'the second killing blow lands — run over');
t.eq(S.screen, 'over', 'game over screen');
t.ok(S.over && S.over.cause === 'test doom', 'the cause of death is recorded');

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

// -------- the boss room --------
DP.srand(37);
S.run.depth = C.BOSS_DEPTH - 1;
DP.genRoom();
t.eq(S.run.room.doors.length, 1, 'the room before the lair has a single door');
t.ok(S.run.room.doors[0].boss && S.run.room.doors[0].known, 'and it is marked with the crown');
S.run.keys = 1;
t.ok(DP.useDoor(0), 'one key opens the boss door');
t.eq(S.run.depth, C.BOSS_DEPTH, 'you stand in the lair');
t.eq(S.run.room.ents.length, 1, 'the lair holds only the boss');
t.ok(S.run.room.ents[0].kind === 'monster' && S.run.room.ents[0].mtype === 'boss', 'and it IS the boss');
t.eq(S.run.room.doors.length, 0, 'no doors out — the only way is through');
DP.interact(0);
t.ok(S.enemy && S.enemy.boss, 'boss fight underway');
S.run.hp = 30; S.run.maxHp = 100;
const keysB = S.run.keys;
S.enemy.hp = 1;
DP.dmgEnemy(5, 50);
t.ok(S.victory && S.victory.boss, 'boss down');
t.eq(S.run.keys, keysB + C.KEY_BOSS, 'the boss hoard holds ' + C.KEY_BOSS + ' keys');
t.ok(S.run.hp > 30, 'the stairwell rest heals');
t.eq(S.run.floor, 1, 'still floor 1 until you take the stairs');
DP.leaveBattle();
t.eq(S.run.floor, 2, 'DESCEND drops to the next floor');
t.eq(S.run.depth, 1, 'next floor starts at room 1');
t.eq(S.screen, 'dungeon', 'back in a fresh room');
t.ok(S.run.room.ents.length >= 1, 'the new floor room is furnished');

// -------- persistence --------
S.mute = true;
DP.save();
const saved = JSON.parse(store[C.SAVE_KEY]);
t.eq(saved.v, 1, 'save is v1');
t.ok(saved.mute === true, 'mute is persisted');
t.ok(saved.run && saved.run.floor === 2, 'the run survives in the save');
t.eq(saved.run.keys, S.run.keys, 'keys are persisted');
t.ok(saved.run.room && Array.isArray(saved.run.room.ents), 'the current room is persisted');
t.ok(saved.run.arsenal && typeof saved.run.arsenal === 'object', 'arsenal is persisted');
t.ok(saved.best && saved.best.floor >= 1, 'best progress is persisted');
// a fresh boot resumes the run
const { DP: DP2 } = loadGame(store, false);
t.ok(DP2.S.run && DP2.S.run.floor === 2, 'reload resumes the saved run');
t.eq(DP2.S.screen, 'title', 'resume lands on the title (CONTINUE offered)');
t.eq(DP2.S.run.keys, S.run.keys, 'keys reload');
t.ok(DP2.S.run.room && DP2.S.run.room.ents.length >= 1, 'the room reloads intact');
t.ok(DP2.S.best.floor >= 1, 'best stats reload');
// death wipes the run but keeps the best
DP2.S.screen = 'battle';
DP2.S.enemy = DP2.mkEnemy('battle');
DP2.hurtPlayer(9999, 'the reaper');
t.eq(DP2.S.run, null, 'death ends the run');
DP2.save();
const saved2 = JSON.parse(store[C.SAVE_KEY]);
t.ok(saved2.run === null, 'dead runs are not saved');
t.ok(saved2.best.floor >= 1, 'best stats outlive the run');
// a pre-crawl save (no room/keys) migrates cleanly
{
  const storeOld = { dungeon_pusher_save: JSON.stringify({
    v: 1, mute: false, best: { floor: 1, depth: 2, kills: 3, gold: 10 },
    run: { floor: 1, depth: 2, hp: 50, maxHp: 60, gold: 5, wallet: 10,
           arsenal: { sword: 1 }, relics: [], potions: 1, whet: 0,
           kills: 1, goldEarned: 5, doors: [{ type: 'battle' }], block: 0 },
  }) };
  const { DP: DPold } = loadGame(storeOld, false);
  t.ok(DPold.S.run && DPold.S.run.hp === 50, 'an old save still resumes');
  t.eq(DPold.S.run.keys, DPold.C.START_KEYS, 'old saves get the starter keys');
  t.ok(DPold.S.run.room && DPold.S.run.room.ents.length >= 1, 'old saves get a furnished room');
}

// -------- determinism --------
function runScript(D) {
  D.srand(1337);
  D.S.run.wallet = 99;
  D.S.victory = null;
  D.S.enemy.hp = D.S.enemy.maxHp = 99999;
  D.reset();                     // zeroes time + pusher phase, re-racks the pile
  D.S.cd = 0; D.drop(30);
  for (let i = 0; i < 60; i++) D.tick(1 / 60);
  D.S.cd = 0; D.drop(70);
  for (let i = 0; i < 180; i++) D.tick(1 / 60);
  return JSON.stringify(D.S.coins.map(c => [c.x.toFixed(4), c.y.toFixed(4), c.st, c.kind]));
}
DP.newRun(); DP.startBattle('battle');
S.enemy.atkT = 9999; S.enemy.trait = null;
const runA = runScript(DP);
S.enemy.atkT = 9999;
const runB = runScript(DP);
t.eq(runA, runB, 'same seed + same inputs = identical sim');

// -------- stability --------
DP.srand(41);
DP.newRun(); DP.startBattle('battle');
S.run.wallet = 999; S.enemy.hp = S.enemy.maxHp = 99999;
for (let sec = 0; sec < 60; sec++) {
  S.cd = 0;
  DP.drop(20 + (sec * 13) % 60);
  step(1);
}
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
  frames(20);                                     // top-down room, hero walking home
  D.S.run.room.ents = [
    { kind: 'monster', mtype: 'battle', eid: 'rat', done: false },
    { kind: 'shop', done: false },
    { kind: 'chest', done: false },
  ];
  frames(10);                                     // three inhabitants drawn
  D.interact(2);
  frames(10);                                     // chest toast
  D.interact(1);
  frames(10);                                     // shop modal
  D.closeModal();
  D.S.run.room.ents[1] = { kind: 'smith', done: false };
  D.interact(1);
  frames(8);                                      // forge modal
  D.pickBoon(0);
  frames(6);
  D.closeModal();
  frames(6);                                      // done entities render faded
  D.interact(0);                                  // fight the rat
  D.S.run.wallet = 50;
  for (let i = 0; i < 8; i++) { D.S.cd = 0; D.drop(20 + i * 8); frames(20); }   // live combat
  D.spinWheel();
  frames(30);                                     // wheel overlay over battle
  D.S.wheelAnim = null;
  D.hurtPlayer(5, 'render test');
  frames(10);                                     // hurt vignette
  D.S.enemy.hp = 1; D.dmgEnemy(5, 50);
  frames(40);                                     // victory overlay
  D.leaveBattle();
  frames(10);                                     // back in the room, monster slain
  D.S.run.keys = 5;
  D.S.run.depth = D.C.BOSS_DEPTH - 1; D.genRoom();
  frames(8);                                      // single crowned boss door
  D.useDoor(0);
  frames(8);                                      // the boss lair
  D.interact(0);
  frames(12);                                     // boss battle
  D.hurtPlayer(99999, 'render doom');
  frames(12);                                     // game over screen
  t.eq(D.S.screen, 'over', 'render pass ends on the over screen');
  t.ok(true, 'all screens rendered without throwing');
}

t.done();
