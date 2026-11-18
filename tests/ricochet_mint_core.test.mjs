// Ricochet Mint: rules and physics, headless (no DOM, no audio).
import assert from 'node:assert/strict';
import { Game, Room, W, H, WALL, CEIL, FLOOR, BAL, MAXT, ITEMS, ITEM_ORDER, bucketTime, bucketMax, mulberry } from '../ricochet_mint/core.js';

let passed = 0;
const ok = (c, n) => { assert.ok(c, n); passed++; };
const eq = (a, b, n) => { assert.deepEqual(a, b, n); passed++; };
const run = (g, sec, each) => { const dt = 1 / 60; for (let t = 0; t < sec; t += dt) { for (let i = 0; i < 4; i++) g.step(dt / 4); g.tick(dt); g.events.length = 0; if (g.pending) g.choose(g.pending[0]); if (each) each(t); } };

// ---------------------------------------------------------------- new game
{
  const g = new Game(mulberry(1), true);
  const R = g.rooms[0];
  ok(R.open && !g.rooms[1].open && !g.rooms[2].open, 'only the Den is open at the start');
  eq(R.slots[0].item && R.slots[0].item.type, 'bumper', 'the first slot starts with a free bumper');
  ok(R.slots.slice(1).every((s) => !s.open), 'every other slot starts locked');
  ok(R.slots[1].y > 380, 'the first slot you unlock is low enough for early coins to reach');
  ok(g.cash === 0 && R.coins.length === 1, 'start with no cash and one coin');
  eq(ITEM_ORDER.length, 8, 'eight placeable items');
  ok(ITEM_ORDER.every((T) => ITEMS[T].name && ITEMS[T].desc), 'every item has text');
}

// ---------------------------------------------------------------- physics: coins stay in the room
{
  const g = new Game(mulberry(2), true); const R = g.rooms[0];
  g.enemiesOn = true; R.enemyT = 1; g.life = 1e9;
  R.slots.forEach((s, i) => { s.open = true; if (i) s.item = R.mkItem(ITEM_ORDER[i % ITEM_ORDER.length]); });
  R.capLv = 6;
  for (let i = 0; i < 16; i++) R.addCoin(i % 5, 30 + i * 20, 40);
  let escapes = 0;
  run(g, 120, () => { for (const c of R.coins) if (c.x < WALL - 1 || c.x > W - WALL + 1 || c.y < CEIL - 1 || c.y > FLOOR + 1 || !isFinite(c.x + c.y)) escapes++; });
  eq(escapes, 0, 'no coin ever leaves the room, even with every item placed and critters around');
  ok(g.life > 1e9, 'a full room earns money');
}

// ---------------------------------------------------------------- copy bucket
{
  const g = new Game(mulberry(3), true); const R = g.rooms[0];
  R.slots[1].open = true; R.slots[1].item = R.mkItem('bucket'); R.capLv = 3;
  let releases = 0; const orel = Room.prototype.release;
  R.release = function (s) { releases++; return orel.call(this, s); };
  for (let i = 0; i < 2; i++) R.addCoin(0, 80 + i * 120, 40);
  const before = R.units();
  run(g, 90);
  ok(releases >= 6, 'a low copy bucket catches and copies coins regularly (' + releases + ' in 90s)');
  ok(R.units() > before, 'copies are real coins that add value to the board');
  ok(R.coins.every((c) => !c.ghost), 'copies are permanent, not ghosts');
  ok(bucketTime(R, 0, 1) <= 3, 'copying a starter coin takes a few seconds, not ages');
  ok(bucketTime(R, 1, 10) < bucketTime(R, 1, 1), 'upgrades make the bucket faster');
  eq(bucketMax(R, 1), 1, 'a new bucket copies coins up to Silver');
  ok(bucketMax(R, 9) > bucketMax(R, 1) && bucketMax(R, 99) === MAXT, 'upgrades let it copy bigger coins, up to Prism');
}
{
  // a coin above the bucket's limit bounces off instead of being caught
  const g = new Game(mulberry(4), true); const R = g.rooms[0];
  R.coins = []; R.slots[1].open = true; const s = R.slots[1]; s.item = R.mkItem('bucket');
  const c = R.addCoin(5, s.x, s.y - 40, 0, 300);
  for (let i = 0; i < 60; i++) R.step(1 / 240);
  ok(!s.item.hold && !c.dead, 'a coin too big for the bucket is not caught');
  const d = R.addCoin(0, s.x, s.y - 40, 0, 300);
  for (let i = 0; i < 60; i++) R.step(1 / 240);
  ok(s.item.hold && s.item.hold.t === 0, 'a small coin dropped in is caught');
}
{
  // a copy needs wallet space
  const g = new Game(mulberry(5), true); const R = g.rooms[0];
  R.coins = []; for (let i = 0; i < R.cap(); i++) R.addCoin(0, 40 + i * 40, 100);
  R.slots[1].open = true; const s = R.slots[1]; s.item = R.mkItem('bucket'); s.item.hold = { t: 0, combo: 0 }; s.item.holdT = s.item.holdMax = 1;
  const n = R.coins.length; R.release(s);
  eq(R.coins.length, n + 1, 'with a full wallet the bucket only gives your coin back');
}

// ---------------------------------------------------------------- economy
{
  const g = new Game(mulberry(6), true); const R = g.rooms[0];
  ok(R.cost('mint') < R.cost('pad') && R.cost('pad') < R.cost('cap'), 'coin is the cheapest buy, then pad, then wallet');
  g.cash = 1e6; const c1 = R.cost('pad'); R.buy('pad'); ok(R.cost('pad') > c1 * 2, 'each pad level costs more than double the last');
  const s1 = R.slotCost(); R.unlockSlot(R.slots[1]); ok(R.slotCost() > s1 * 3, 'each slot costs a lot more than the last');
  ok(!g.unlockRoom(1) || g.cash >= 0, 'a room cannot be bought without the cash');
  g.cash = BAL.room2 - 1; ok(!g.unlockRoom(1), 'the Attic needs its full price');
  g.cash = BAL.room2; ok(g.unlockRoom(1) && g.rooms[1].open && g.cash === 0, 'the Attic opens at its price');
}
{
  // slow progression: an idle bot that only buys coins and pads is nowhere near the Attic after 10 minutes
  const g = new Game(mulberry(7), true); const R = g.rooms[0];
  run(g, 600, (t) => { if (Math.round(t * 60) % 60 === 0) { if (R.mint() !== 'ok') R.buy('pad'); } });
  ok(g.life > 200, 'ten idle minutes earn something (' + Math.round(g.life) + ')');
  ok(g.life < BAL.room2 / 20, 'ten idle minutes are far from the Attic price (' + Math.round(g.life) + ')');
}

// ---------------------------------------------------------------- critters
{
  const g = new Game(mulberry(8), true); const R = g.rooms[0];
  g.enemiesOn = true; R.spawnEnemy(); const e = R.enemies[0];
  ok(e && e.hp > 0, 'a critter spawns with health');
  const before = g.cash; R.damage(e, 1e9); ok(e.dead && g.cash > before, 'popping a critter pays a bounty');
  const b2 = 120 * R.unit() * Math.pow(1.15, 1); ok(Math.abs(g.cash - before - b2) < 1e-6 * b2 || g.cash - before >= b2, 'the bounty does not depend on your income');
  R.slots[1].open = true; R.slots[1].item = R.mkItem('bumper');
  R.enemies = []; g.kills = 10; R.spawnEnemy();
  const j = R.enemies[0]; j.type = 'jammer'; j.target = R.slots[1]; j.life = 0;
  run(g, 200);
  ok(!R.slots[1].item.jam, 'a Jammer never jams a build forever (it leaves or gets popped)');
}

// ---------------------------------------------------------------- save / load
{
  const g = new Game(mulberry(9), true);
  g.cash = 1e9; g.life = 2e9; g.perks = { lucky: 1 }; g.unlockRoom(1);
  const R = g.rooms[0]; R.slots[1].open = true; R.slots[1].item = R.mkItem('bucket'); R.slots[1].item.lv = 4; R.padLv = 3;
  const s = JSON.parse(JSON.stringify(g.save()));
  const h = new Game(mulberry(10), true); h.load(s);
  ok(h.rooms[1].open, 'open rooms survive a reload');
  eq(h.rooms[0].slots[1].item.type, 'bucket', 'builds survive a reload');
  eq(h.rooms[0].slots[1].item.lv, 4, 'build levels survive a reload');
  eq(h.rooms[0].padLv, 3, 'upgrades survive a reload');
  eq(h.perks, { lucky: 1 }, 'perks survive a reload');
  eq(h.rooms[0].coins.length, R.coins.length, 'coins survive a reload');
  const old = new Game(mulberry(11), true); old.load({ v: 1, stage: 4 }); ok(old.rooms[0].open && old.cash === 0, 'an old-format save starts a fresh game instead of breaking');
}

console.log('ricochet_mint core: ' + passed + ' checks passed');
