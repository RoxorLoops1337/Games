// Ricochet Mint: rules and physics, headless (no DOM, no audio).
import assert from 'node:assert/strict';
import { fmt, LANE, LANE_TOP, HOLE_X, setRoomHeight, BASE_H, Game, Room, W, H, WALL, CEIL, FLOOR, BAL, MAXT, ITEMS, ITEM_ORDER, bucketTime, bucketMax, mulberry } from '../ricochet_mint/core.js';

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
  g.cash = 1e6; // a player keeps dropping small coins in
  run(g, 90, (t) => { if (Math.round(t * 60) % 600 === 0) R.mint(); });
  ok(releases >= 6, 'a low copy bucket catches and copies coins regularly (' + releases + ' in 90s)');
  ok(R.units() > before, 'copies are real coins that add value to the board');
  ok(R.coins.every((c) => !c.ghost), 'copies are permanent, not ghosts');
  ok(bucketTime(R, 0, 1) <= 3, 'copying a starter coin takes a few seconds, not ages');
  ok(bucketTime(R, 1, 10) < bucketTime(R, 1, 1), 'upgrades make the bucket faster');
  eq(bucketMax(R, 1), 2, 'a new bucket copies coins up to Gold');
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
  g.cash = BAL.room2; g.life = 2e9; g.perks = { lucky: 1 }; g.unlockRoom(1);
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

// ---------------------------------------------------------------- the Merge button and coin prices
{
  const g = new Game(mulberry(40), true); const R = g.rooms[0]; R.coins = []; g.cash = 1e9; R.capLv = 5;
  const a1 = R.addCoin(2, 100, 200), a2 = R.addCoin(2, 300, 200), b1 = R.addCoin(4, 150, 300), b2 = R.addCoin(4, 250, 300); R.addCoin(0, 200, 100);
  [a1, a2, b1, b2].forEach((c) => { c.age = 1; });
  const b = R.addCoin(1, 200, 400, 0, 0); const c = R.addCoin(1, 200, 400 - 2 * b.r + 4, 0, 0); b.age = c.age = 1;
  for (let i = 0; i < 20; i++) R.step(1 / 240);
  ok(R.coins.filter((x) => x.t === 1).length === 2, 'matching coins that bump into each other no longer merge on their own');
  const priceBefore = R.cost('mint');
  const m = R.mergeBest();
  ok(m && m.t === 4, 'Merge combines the highest matching pair first');
  ok(R.coins.some((x) => x.t === 5) && R.coins.filter((x) => x.t === 4).length === 0, 'the pair becomes one coin a tier up');
  ok(R.cost('mint') < priceBefore, 'merging frees a wallet spot and makes the next coin cheaper');
  R.mergeBest(); R.mergeBest(); R.mergeBest(); const none = R.mergeBest();
  eq(none, null, 'with no pair left, Merge does nothing');
  // two coins of tier 10 on the board no longer push the coin price to absurd numbers
  R.coins = []; R.addCoin(10, 100, 100); R.addCoin(10, 300, 100);
  ok(R.cost('mint') < 1e4, 'big coins do not make small coins unaffordable (' + Math.round(R.cost('mint')) + ')');
  ok(!/e\+/.test(fmt(1e120)) && !/e\+/.test(fmt(1e300)), 'huge amounts get short suffixes, never e+ notation');
}
{
  // the Lucky Coin: tapping it pays a burst or starts a Frenzy
  const g = new Game(mulberry(41), true); g.luckyT = 0; g.stepGlobal(1 / 60);
  ok(g.lucky, 'a Lucky Coin shows up now and then');
  const res = g.tapLucky(g.lucky.x, g.lucky.y);
  ok(res === 'cash' || (res === 'frenzy' && g.frenzy > 0), 'tapping it gives a cash burst or a Frenzy');
  ok(!g.lucky, 'it is gone once caught');
}

// ---------------------------------------------------------------- pads along the walls
{
  const g = new Game(mulberry(20), true); const R = g.rooms[0];
  eq(R.padN, 1, 'the Den starts with one small floor pad');
  g.cash = 1e9; R.buy('pad');
  eq(R.padN, 2, 'buying a pad places the next one along the walls');
  while (!R.padFull()) R.buy('pad');
  const lv = R.padLv; R.buy('pad'); eq(R.padLv, lv + 1, 'once every spot has a pad, the button levels pads up');
  R.coins = []; const c = R.addCoin(0, 40, R.pads()[1].y, -400, 0); c.age = 1;
  const before = g.life; for (let i = 0; i < 40; i++) R.step(1 / 240);
  ok(g.life > before && c.vx > 0, 'a coin hitting a wall pad pays and bounces off');
  const d = R.addCoin(0, 40, 60, -400, 0); d.age = 1; const b2 = g.life; for (let i = 0; i < 30; i++) R.step(1 / 240);
  ok(g.life === b2, 'bare wall does not pay');
}

// ---------------------------------------------------------------- the Attic: hatch, plunger, flippers, drain
{
  const g = new Game(mulberry(21), true); const D = g.rooms[0], A = g.rooms[1];
  D.coins = []; D.addCoin(0, HOLE_X, 60, 0, -800);
  for (let i = 0; i < 60; i++) g.step(1 / 240);
  eq(D.coins.length, 1, 'with the Attic locked the hatch stays shut');
  g.cash = BAL.room2; g.unlockRoom(1); g.cur = 0;
  D.coins = []; D.addCoin(0, HOLE_X, 60, 0, -800);
  for (let i = 0; i < 60; i++) g.step(1 / 240);
  ok(D.coins.length === 0 && A.queue.length + A.coins.length === 1, 'a coin flying up through the open hatch arrives in the Attic');
  let atticPays = 0; const op = A.pay.bind(A); A.pay = (...a) => { atticPays++; op(...a); };
  g.enemiesOn = false; run(g, 20);
  ok(atticPays > 5, 'the plunger fires it into the pinball room, where hits pay (' + atticPays + ')');
}
{
  // coins shoved into the top-right corner above the deflector used to stay there forever
  const g = new Game(mulberry(41), true); g.cash = BAL.room2; g.unlockRoom(1); g.enemiesOn = false;
  const D = g.rooms[0], A = g.rooms[1]; D.coins = [];
  const ax = W - WALL + 20, ay = LANE_TOP - 45, bx = W - 170, by = CEIL - 6, L = Math.hypot(bx - ax, by - ay);
  const inPocket = (c) => ((c.x - ax) * (by - ay) / L - (c.y - ay) * (bx - ax) / L) < 0;
  for (const [t, dx] of [[7, 30], [8, 30], [0, 70], [1, 100]]) { const x = W - WALL - dx, ly = ay + (by - ay) * (x - ax) / (bx - ax); const c = A.addCoin(t, x, CEIL + (ly - CEIL) * 0.4, 0, 0); ok(inPocket(c), 'test coin starts in the pocket'); }
  for (let i = 0; i < 240 * 2; i++) g.step(1 / 240);
  ok(!A.coins.some(inPocket), 'coins in the top-right pocket get pushed back into the room');
  // and a busy Attic never traps coins there again
  [0, 1, 3, 2, 6, 1, 4, 2, 5, 1, 3, 5, 7, 8, 6, 4].forEach((t) => A.receive({ t, combo: 0 }));
  let stuck = 0; run(g, 180, () => { if (A.coins.some(inPocket)) stuck++; });
  ok(stuck === 0, 'no coin ends up in the pocket in 3 busy minutes (' + stuck + ' frames)');
}
for (const tier of [0, 5, 9, 11]) {
  // every coin size gets out of the shooter lane (big ones used to bounce back down forever)
  const g = new Game(mulberry(22 + tier), true); g.cash = BAL.room2; g.unlockRoom(1); g.enemiesOn = false;
  const D = g.rooms[0], A = g.rooms[1]; D.coins = []; A.receive({ t: tier, combo: 0 });
  let left = false; for (let i = 0; i < 240 * 8 && !left; i++) { g.step(1 / 240); if (A.coins.some((c) => c.x < LANE - c.r)) left = true; }
  ok(left, 'a tier ' + (tier + 1) + ' coin leaves the shooter lane into the room');
}
{
  // a crowd arriving at once is fed to the plunger one by one and keeps paying
  const g = new Game(mulberry(30), true); g.cash = BAL.room2; g.unlockRoom(1); g.enemiesOn = false;
  const D = g.rooms[0], A = g.rooms[1]; D.coins = [];
  [0, 1, 3, 2, 6, 1, 4, 2, 5, 1, 3, 5].forEach((t) => A.receive({ t, combo: 0 }));
  let pays = 0; const op = A.pay.bind(A); A.pay = (...a) => { pays++; op(...a); };
  run(g, 60); const mid = pays; run(g, 60);
  ok(A.queue.length === 0, 'the plunger queue empties');
  ok(pays - mid > 20, 'coins keep paying in the Attic minute after minute (' + (pays - mid) + ')');
  let drains = 0; const od = D.dropIn.bind(D); D.dropIn = (c) => { drains++; od(c); }; run(g, 240);
  ok(drains > 0, 'coins that slip past the flippers fall back to the Den');
  ok(D.real() === A.real(), 'Den and Attic share one wallet');
}

// ---------------------------------------------------------------- tall screens: the room grows, layouts follow the floor
{
  const base = new Game(mulberry(12), true).rooms[0].slots.map((s) => s.y);
  setRoomHeight(BASE_H + 160);
  const g = new Game(mulberry(12), true); const R = g.rooms[0];
  eq(R.slots.map((s) => s.y), base.map((y) => y + 160), 'on a tall screen every slot moves down with the floor');
  let out = 0; const floor = BASE_H + 160 - 18;
  for (let i = 0; i < 8; i++) R.addCoin(i % 3, 40 + i * 40, 60);
  run(g, 60, () => { for (const c of R.coins) if (c.y > floor + 1 || c.y < CEIL - 1) out++; });
  eq(out, 0, 'coins stay inside a taller room');
  setRoomHeight(BASE_H);
}

// ---------------------------------------------------------------- Chinese version
{
  const { EN, ZH, setLang, tr } = await import('../ricochet_mint/i18n.js');
  const missing = Object.keys(EN).filter((k) => !ZH[k]);
  eq(missing, [], 'every English string has a Chinese translation');
  eq(Object.keys(ZH).filter((k) => !(k in EN)), [], 'no stray Chinese keys');
  for (const k in EN) { const v = (t) => (t.match(/\{\w+\}/g) || []).sort().join(); eq(v(ZH[k]), v(EN[k]), 'same placeholders in ' + k); }
  ok(!Object.values(EN).concat(Object.values(ZH)).some((t) => t.includes('\u2014')), 'no em dashes in any text');
  setLang('zh');
  eq(fmt(12345), '1.23万', 'Chinese numbers use 万'); eq(fmt(4e9), '40.0亿', 'and 亿'); eq(ITEMS.bucket.name, '复制桶', 'item names switch language');
  ok(tr('f.combo', { n: 20 }) === '连击 20！', 'placeholders fill in Chinese');
  setLang('en'); eq(fmt(4e9), '4.00B', 'English numbers are back'); eq(ITEMS.bucket.name, 'Copy Bucket', 'and English names');
}
console.log('ricochet_mint core: ' + passed + ' checks passed');
