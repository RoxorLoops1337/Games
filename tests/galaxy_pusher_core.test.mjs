// Galaxy Pusher: rules and physics, headless (no DOM, no audio).
import assert from 'node:assert/strict';
import { Game, Field, W, FRONT, PH, PMAX, ROW, WHEEL, TOWER, KIND, ENERGY_MAX, FEVER_TIME, ITEMS, ITEM_ORDER, mulberry, foeAt, heroAtk } from '../galaxy_pusher/core.js';

let passed = 0;
const ok = (c, n) => { assert.ok(c, n); passed++; };
const eq = (a, b, n) => { assert.deepEqual(a, b, n); passed++; };
// play for `sec` seconds, firing every `every` frames and sweeping the aim; wheels resolve at once
function play(g, sec, every = 4, each) {
  let aim = 0.5, dir = 1;
  for (let s = 0; s < sec * 60; s++) {
    if (every && s % every === 0) { aim += dir * 0.037; if (aim > 1 || aim < 0) dir = -dir; g.fire(Math.max(0, Math.min(1, aim))); }
    g.tick(1 / 60);
    for (const e of g.out) if (e.t === 'kill') { const i = g.spinWheel(); g.resolveWheel(i); }
    g.out.length = 0;
    if (each) each(s);
  }
}

// ---------------------------------------------------------------- a new machine
{
  // Arrange + Act
  const g = new Game(1); g.newMachine();
  // Assert
  ok(g.f.coins.length >= 70, 'a new machine starts with a carpet of coins (' + g.f.coins.length + ')');
  ok(g.f.coins.some((c) => c.k === 'B') && g.f.coins.some((c) => c.k === 'P') && g.f.coins.some((c) => c.k === 'Y'), 'the carpet holds tokens of all three colours');
  ok(g.f.coins.every((c) => c.x >= c.r - 1e-6 && c.x <= W - c.r + 1e-6 && c.y < FRONT), 'every coin starts inside the machine');
  ok(g.bank === 120 && g.foe && g.foe.hp === foeAt(0).hp, 'start with 120 coins and the first enemy at full health');
}

// ---------------------------------------------------------------- physics stays sane under a long session
{
  const g = new Game(2); g.newMachine();
  let bad = 0, maxN = 0;
  g.bank = 1e6;
  play(g, 180, 3, () => {
    for (const c of g.f.coins) if (!c.off && (!isFinite(c.x + c.y + c.z) || c.x < c.r - 0.01 || c.x > W - c.r + 0.01 || c.y < 0 || c.z < -0.01 || c.z > 30)) bad++;
    maxN = Math.max(maxN, g.f.coins.length);
  });
  eq(bad, 0, 'no coin ever leaves the walls, sinks through the floor or goes NaN in 3 minutes of play');
  ok(maxN < 450, 'the coin count stays bounded (' + maxN + ')');
  ok(g.stats.paid > 200 && g.stats.lost > 0, 'coins pay out over the edge and some fall in the gutters');
  ok(g.stats.kills >= 2 && g.stats.towers >= 2, 'enemies die and wheels build towers during normal play (' + g.stats.kills + ' kills)');
}

// ---------------------------------------------------------------- coin stacking: a coin dropped on a coin rests on it
{
  const f = new Field(mulberry(3));
  const a = f.add('c', 10, 12, 0); const b = f.add('c', 10.1, 12, 3);
  for (let i = 0; i < 240; i++) f.step(1 / 120);
  ok(Math.abs(b.z - (a.z + a.h)) < 0.01, 'a coin dropped onto another comes to rest on top of it');
  const c = f.add('c', 13, 12, 0); const d = f.add('c', 14.85, 12, 2);
  for (let i = 0; i < 240; i++) f.step(1 / 120);
  ok(d.z < 0.05 && Math.hypot(c.x - d.x, c.y - d.y) >= 1.95, 'a coin landing on the very edge of another slides off and lies beside it');
}

// ---------------------------------------------------------------- the pusher shoves the carpet and coins leave over the edge
{
  const f = new Field(mulberry(4));
  const c = f.add('c', 11, PMAX + 1.2, 0);
  let maxY = c.y;
  for (let i = 0; i < 120 * 8; i++) { f.step(1 / 120); maxY = Math.max(maxY, c.y); }
  ok(maxY >= PMAX + 1.0, 'a coin in front of the pusher is shoved forward');
  // a row of coins touching each other from the pusher to the edge: the front one drops
  const g = new Field(mulberry(5));
  for (let y = 3; y < FRONT - 0.2; y += 2.0) g.add('c', 11, y, 0);
  let pays = 0;
  for (let i = 0; i < 120 * 20; i++) { g.step(1 / 120); pays += g.events.filter((e) => e.t === 'pay').length; g.events.length = 0; }
  ok(pays >= 1, 'a chain of coins is pushed until the front one pays out (' + pays + ')');
}

// ---------------------------------------------------------------- shelf: coins dropped on the pusher get scraped off by the back wall
{
  const f = new Field(mulberry(6));
  const c = f.add('c', 11, 1.2, PH + 0.5);
  for (let i = 0; i < 120 * 30; i++) f.step(1 / 120);
  ok(c.z < 0.05 && c.y > 2, 'a lone coin on the shelf creeps off its edge onto the field');
}

// ---------------------------------------------------------------- gutters lose coins, the middle pays
{
  const f = new Field(mulberry(7));
  const mid = f.add('c', 11, FRONT - 0.1, 0), side = f.add('c', 1.1, FRONT - 0.1, 0);
  mid.vy = side.vy = 4;
  const ev = [];
  for (let i = 0; i < 240; i++) { f.step(1 / 120); ev.push(...f.events); f.events.length = 0; }
  ok(ev.some((e) => e.t === 'pay' && Math.abs(e.x - 11) < 1), 'a coin over the middle of the edge pays');
  ok(ev.some((e) => e.t === 'lost' && e.x < 3), 'a coin over a corner gutter is lost');
}

// ---------------------------------------------------------------- token row: three of a kind attack
{
  const g = new Game(8);
  const hp0 = g.foe.hp;
  g.pushToken('B'); g.pushToken('P'); g.pushToken('B');
  ok(!g.out.some((e) => e.t === 'attack'), 'two of a colour do nothing yet');
  g.pushToken('B');
  const at = g.out.find((e) => e.t === 'attack');
  ok(at && at.col === 'B', 'three blue tokens make Rox attack');
  eq(g.row, ['P'], 'the three matched tokens leave the row, the rest stay');
  eq(hp0 - g.foe.hp, heroAtk(1) * 3, 'a hero attack deals three hits of the hero attack');
  ok(g.f.coins.length >= 3, 'an attack rains bonus coins into the machine');
}
{
  const g = new Game(9);
  for (const k of ['B', 'P', 'Y', 'B', 'P', 'Y']) g.pushToken(k);
  ok(g.out.some((e) => e.t === 'team'), 'a full row of 2+2+2 fires a team strike');
  eq(g.row.length, 0, 'the team strike clears the row');
  ok(g.row.length < ROW, 'the row never stays full');
}

// ---------------------------------------------------------------- level ups
{
  const g = new Game(10); g.foe.hp = 1e9; g.foe.max = 1e9;
  const need = 3; // xpNeed(1)
  for (let i = 0; i < need * 3; i++) g.pushToken('Y');
  eq(g.hero('Y').lv, 2, 'Mew levels up after enough attacks');
  ok(heroAtk(2) > heroAtk(1), 'a higher level hits harder');
}

// ---------------------------------------------------------------- killing an enemy -> wheel -> tower -> next enemy
{
  const g = new Game(11);
  g.damage(1e6, 'chip', null);
  ok(g.foe === null && g.wheelQ === 1, 'a defeated enemy queues one Galaxy Wheel spin');
  g.damage(50, 'chip', null);
  eq(g.pendingDmg, 50, 'damage dealt while the wheel spins is kept for the next enemy');
  const i = g.spinWheel();
  ok(i >= 0 && i < WHEEL.length, 'the wheel picks one of its 12 pockets');
  g.resolveWheel(i);
  const T = g.f.towers[0];
  ok(T && T.want === TOWER[WHEEL[i].c], 'the pocket builds a tower of its colour height');
  ok(g.foe && g.foe.idx === 1 && g.foe.hp === g.foe.max - 50, 'the next enemy arrives and takes the kept damage');
  const counts = {}; WHEEL.forEach((P) => { counts[P.c] = (counts[P.c] || 0) + 1; });
  ok(counts.JP === 1 && counts.B >= 3 && counts.P >= 3 && counts.Y >= 3, 'the wheel has one jackpot pocket and several of each colour');
  ok(TOWER.B < TOWER.Y && TOWER.Y < TOWER.P && TOWER.P < TOWER.JP, 'tower heights rise blue < yellow < pink < jackpot');
}
{
  // the level-up pocket raises every hero
  const g = new Game(12); g.damage(1e6, 'chip', null); g.spinWheel();
  const lv = WHEEL.findIndex((P) => P.lv);
  g.resolveWheel(lv);
  ok(g.heroes.every((h) => h.lv === 2), 'a LV pocket levels up all three heroes');
}

// ---------------------------------------------------------------- towers build, topple and spill coins
{
  const g = new Game(13); g.newMachine(); g.foe.hp = 1e9;
  g.f.addTower(11, PMAX + 4, 40, { gold: true, col: 'P', crown: ['P', 'P'] });
  let built = false, toppled = false, burst = 0;
  const paid0 = g.stats.paid;
  g.bank = 1e6;
  play(g, 90, 6, () => {
    const T = g.f.towers[0];
    if (T && T.state === 'stand') built = true;
    if (T && T.state === 'fall') toppled = true;
  });
  ok(built, 'the tower finishes building');
  ok(toppled || g.f.towers.length === 0, 'the pusher eventually topples the tower');
  ok(g.f.towers.length === 0, 'a toppled tower turns into loose coins');
  ok(g.stats.paid - paid0 > 60, 'a gold tower pays a pile of coins (' + (g.stats.paid - paid0) + ')');
}

// ---------------------------------------------------------------- energy -> double time
{
  const g = new Game(14);
  g.addEnergy(ENERGY_MAX);
  ok(g.fever === FEVER_TIME && g.energy === 0, 'full energy starts Double Time');
  const hp = g.foe.hp; g.pushToken('P'); g.pushToken('P'); g.pushToken('P');
  eq(hp - g.foe.hp, heroAtk(1) * 3 * 2, 'attacks deal double damage in Double Time');
  for (let i = 0; i < FEVER_TIME * 60 + 5; i++) g.tick(1 / 60);
  ok(g.fever === 0, 'Double Time ends');
}

// ---------------------------------------------------------------- economy: free coins, firing costs
{
  const g = new Game(15);
  g.bank = 0;
  ok(!g.fire(0.5), 'you cannot fire with an empty bank');
  for (let i = 0; i < 60 * 11; i++) g.tick(1 / 60);
  ok(g.bank >= 2, 'an empty bank refills slowly');
  g.bank = 10; g.fireCd = 0; g.fire(0.5);
  eq(g.bank, 9, 'a shot costs one coin');
  ok(!g.fire(0.5), 'shots are rate limited');
  ok(foeAt(4).boss && foeAt(4).hp > foeAt(3).hp * 2, 'every fifth enemy is a much tougher boss');
}

// ---------------------------------------------------------------- items
{
  const g = new Game(20); g.newMachine();
  g.bank = 10;
  ok(!g.buy('wheel') && g.bank === 10, 'an item you cannot afford is not bought');
  g.bank = 1000;
  ok(g.buy('wheel') && g.bank === 1000 - ITEMS.wheel.cost && g.wheelQ === 1, 'Tower Call costs coins and queues a wheel spin');
  ok(g.foe, 'a bonus spin does not need the enemy to die');
  const n0 = g.f.coins.length; g.row = ['P', 'P'];
  g.buy('rain');
  const fresh = g.f.coins.slice(n0).map((c) => c.k);
  eq(fresh.length, 3, 'Token Rain drops three tokens');
  ok(fresh.filter((k) => k === 'P').length >= 2, 'Token Rain favours the colour you are collecting');
  // Wall Guard: a coin over a gutter pays instead of being lost
  g.buy('guard'); g.tick(1 / 60);
  const side = g.f.add('c', 1.1, FRONT - 0.1, 0); side.vy = 4;
  let lost = 0, paid = 0;
  for (let i = 0; i < 60; i++) { g.tick(1 / 60); for (const e of g.out) { if (e.t === 'lost') lost++; if (e.t === 'pay' && e.x < 3) paid++; } g.out.length = 0; }
  ok(lost === 0 && paid >= 1, 'Wall Guard closes the gutters');
  for (let i = 0; i < 60 * 31; i++) g.tick(1 / 60);
  ok(g.guardT === 0 && !g.f.guard, 'Wall Guard runs out');
  // Turbo: the pusher strokes twice as often
  const t0 = g.f.t; g.buy('turbo'); g.tick(1);
  ok(Math.abs(g.f.t - t0 - 2) < 0.05, 'Turbo Push doubles the pusher speed');
  // Quake shoves coins toward the edge
  const ys = g.f.coins.filter((c) => !c.off).map((c) => c.y), avg0 = ys.reduce((a, b) => a + b, 0) / ys.length;
  g.buy('quake'); for (let i = 0; i < 20; i++) g.tick(1 / 60);
  const ys2 = g.f.coins.filter((c) => !c.off).map((c) => c.y), avg1 = ys2.reduce((a, b) => a + b, 0) / ys2.length;
  ok(avg1 > avg0, 'Quake jolts the coins forward');
  ok(ITEM_ORDER.every((id) => ITEMS[id].name && ITEMS[id].cost > 0 && ITEMS[id].desc), 'every item has a name, price and description');
  const h = Game.load(JSON.parse(JSON.stringify(g.save())));
  ok(h.turboT > 0, 'running items survive a save');
}

// ---------------------------------------------------------------- saves
{
  const g = new Game(16); g.newMachine();
  g.bank = 77; g.row = ['B', 'Y']; g.heroes[1].lv = 4; g.foe.hp = 33; g.energy = 40;
  g.f.addTower(11, 12, 36, { col: 'Y', crown: ['Y', 'Y'] });
  const s = JSON.parse(JSON.stringify(g.save()));
  const h = Game.load(s);
  ok(h && h.bank === 77 && h.heroes[1].lv === 4 && h.foe.hp === 33 && h.energy === 40, 'a save round-trips bank, heroes, enemy and energy');
  eq(h.row, ['B', 'Y'], 'the token row is saved');
  ok(Math.abs(h.f.coins.length - g.f.coins.length) <= 1 && h.f.towers.length === 1 && h.f.towers[0].n === 36, 'the coins on the field and the standing tower are saved');
  eq(Game.load({ v: 99 }), null, 'an unknown save version is refused');
  const junk = Game.load({ v: 1, coins: [['c', NaN, 1, 0], ['zz', 1, 1, 0], ['c', 5, 10, 0]], bank: -5, heroes: [{ lv: 'x' }], row: ['B', 'Q'] });
  ok(junk && junk.bank === 0 && junk.f.coins.length === 1 && junk.heroes[0].lv === 1 && junk.row.join('') === 'B', 'a damaged save loads with the bad parts dropped');
}

// ---------------------------------------------------------------- performance budget for phones
{
  const g = new Game(17); g.newMachine(); g.bank = 1e6;
  play(g, 60, 4);
  const t0 = performance.now();
  play(g, 20, 4);
  const ms = performance.now() - t0;
  ok(ms < 2500, `20 s of physics with ~${g.f.coins.length} coins runs in ${ms.toFixed(0)} ms (budget 2500)`);
}

console.log(`galaxy_pusher_core: ${passed} passed, 0 failed`);
