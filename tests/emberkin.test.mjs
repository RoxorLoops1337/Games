// EMBERKIN — data, battle, world and save suite.
//
// Drives the real game through window.EK with a stubbed DOM. The point of each
// block is a property the game must always have, not a snapshot of today's
// numbers: type maths is symmetric, damage responds to the chart, capture gets
// easier as HP drops, levels raise stats, maps are walkable end to end, and a
// save round-trips.
//
// Run: node tests/emberkin.test.mjs
import { loadGame, ok, eq, near, done, section } from './emberkin_lib.mjs';

const EK = loadGame();
const { DEX, DEX_ORDER, MOVES, ITEMS, MAPS, TYPES, CHART } = EK;

// ---------------------------------------------------------------- data --
section('dex + moves are internally consistent');
eq(DEX_ORDER.length, 19, 'dex has 19 species');
for (const id of DEX_ORDER) {
  const sp = DEX[id];
  ok(!!sp.name, `${id} has a name`);
  ok(sp.types.length >= 1 && sp.types.length <= 2, `${id} has 1-2 types`);
  sp.types.forEach((t) => ok(!!TYPES[t] && t !== 'Wild', `${id} type ${t} is a real creature type`));
  eq(sp.base.length, 4, `${id} has 4 base stats`);
  sp.base.forEach((b) => ok(b > 0 && b < 200, `${id} base stat ${b} in range`));
  ok(sp.rate > 0 && sp.rate <= 255, `${id} catch rate in range`);
  ok(sp.dex.length > 20, `${id} has dex flavour`);
  ok(sp.learn.some((e) => e[0] === 1), `${id} knows something at level 1`);
  for (const [lv, mv] of sp.learn) {
    ok(!!MOVES[mv], `${id} learns real move ${mv}`);
    ok(lv >= 1 && lv <= 60, `${id} learn level ${lv} sane`);
  }
  if (sp.evo) {
    ok(!!DEX[sp.evo[0]], `${id} evolves into a real species`);
    ok(sp.evo[1] >= 5 && sp.evo[1] <= 60, `${id} evolves at a sane level`);
    const sum = (x) => DEX[x].base.reduce((a, b) => a + b, 0);
    ok(sum(sp.evo[0]) > sum(id), `${sp.evo[0]} is stronger than ${id}`);
  }
}
for (const [id, m] of Object.entries(MOVES)) {
  ok(!!TYPES[m.type], `${id} has a real type`);
  ok(m.pp >= 5 && m.pp <= 40, `${id} pp sane`);
  ok(m.pow >= 0 && m.pow <= 130, `${id} power sane`);
  ok(m.pow > 0 || !!m.fx, `${id} either hits or does something`);
}
// Every creature type must be reachable offensively and be beatable.
for (const t of Object.keys(TYPES)) {
  if (t === 'Wild') continue;
  const beatenBy = Object.keys(CHART).filter((a) => (CHART[a][t] || 1) > 1);
  ok(beatenBy.length > 0, `${t} is weak to something`);
  ok(Object.keys(MOVES).some((m) => MOVES[m].type === t && MOVES[m].pow > 0), `${t} has an attacking move`);
}

section('stats and levels');
const cub5 = EK.mkMon('cindercub', 5);
const cub50 = EK.mkMon('cindercub', 50);
ok(cub50.max > cub5.max * 2, 'HP grows a lot with level');
ok(cub50.atk > cub5.atk, 'attack grows with level');
eq(cub5.hp, cub5.max, 'a new creature is at full HP');
ok(cub5.moves.length >= 2 && cub5.moves.length <= 4, 'starting kit is 2-4 moves');
eq(EK.movesAt('pyrelynx', 60).length, 4, 'a maxed learnset keeps 4 moves');
ok(EK.xpFor(10) > EK.xpFor(9), 'xp curve is monotone');

// ------------------------------------------------------------- battle --
section('type chart and damage');
eq(EK.effect('Ember', ['Verdant']), 2, 'Ember beats Verdant');
eq(EK.effect('Ember', ['Tide']), 0.5, 'Ember flops on Tide');
eq(EK.effect('Tide', ['Ember', 'Stone']), 4, 'dual weakness stacks to 4×');
eq(EK.effect('Verdant', ['Ember', 'Stone']), 1, 'weak + resist cancels out');
eq(EK.effect('Wild', ['Aether']), 1, 'Wild is neutral');

const atk = EK.mkMon('pyrelynx', 30), defV = EK.mkMon('sproutle', 30), defT = EK.mkMon('dewdrip', 30);
const dv = EK.damageOf(atk, defV, 'cinder', { crit: false, roll: 1 }).dmg;
const dt = EK.damageOf(atk, defT, 'cinder', { crit: false, roll: 1 }).dmg;
ok(dv > dt * 2.5, 'super-effective hits far harder than resisted');
const noStab = EK.damageOf(atk, defV, 'lunge', { crit: false, roll: 1 }).dmg;
ok(EK.damageOf(atk, defV, 'cinder', { crit: false, roll: 1 }).dmg > noStab, 'STAB + effectiveness beats a neutral move of similar power');
const critDmg = EK.damageOf(atk, defV, 'cinder', { crit: true, roll: 1 }).dmg;
ok(critDmg > dv, 'crits hurt more');
eq(EK.damageOf(atk, defV, 'rally', { crit: false, roll: 1 }).dmg, 0, 'status moves deal no damage');

section('stat stages');
const s = EK.mkMon('zaplet', 20);
eq(EK.effStat(s, 'atk'), s.atk, 'no stage = base');
s.stages.atk = 2;
ok(EK.effStat(s, 'atk') > s.atk, '+2 raises attack');
s.stages.atk = -2;
ok(EK.effStat(s, 'atk') < s.atk, '-2 lowers attack');
s.stages.atk = 0;
s.status = 'burn';
ok(EK.effStat(s, 'atk') < s.atk, 'burn softens attack');
s.status = 'chill';
ok(EK.effStat(s, 'spd') < s.spd, 'chill halves speed');

section('a wild battle runs to a conclusion');
const G = EK.G;
G.party = [EK.mkMon('pyrelynx', 40)];
G.bag = { bloomorb: 30, salve: 5 };
ok(EK.startBattle({ foe: EK.mkMon('sproutle', 5), wild: true }), 'battle starts');
let guard = 0;
while (!EK.B().over && guard++ < 40) {
  const mv = EK.B().mine.moves.find((m) => m.pp > 0).id;
  const log = EK.doTurn({ kind: 'move', id: mv });
  ok(log.length > 0, 'every turn produces log lines');
  ok(log.every((e) => typeof e.t === 'string' && e.hpM != null), 'log entries carry text and an HP snapshot');
}
eq(EK.B().over, 'win', 'a level 40 beats a level 5');
ok(G.party[0].xp > EK.xpFor(40), 'the winner gained experience');
eq(G.dex.sproutle, 1, 'a defeated wild kin is marked seen, not caught');

section('faint, party wipe and switching');
G.party = [EK.mkMon('zaplet', 5), EK.mkMon('mothrix', 5)];
G.party[0].hp = 1;
EK.startBattle({ foe: EK.mkMon('magmane', 50), wild: true });
let over = null, g2 = 0;
while (!over && g2++ < 20) over = EK.doTurn({ kind: 'move', id: G.party[0].moves[0].id }).length ? EK.B().over : null;
eq(over, 'switch', 'one fainted but the bench is not empty');
G.party[1].hp = 0;
G.party[0].hp = 0;
EK.B().mine = G.party[1];
G.party[1].hp = 1;
const wipe = EK.doTurn({ kind: 'move', id: G.party[1].moves[0].id });
ok(wipe.length > 0, 'the last stand still logs');
eq(EK.B().over, 'lose', 'the whole party down ends the battle');

section('trainer battles chain their team and refuse capture');
G.party = [EK.mkMon('tsunaga', 45)];
G.bag = { bloomorb: 5 };
const team = [['cindercub', 5], ['zaplet', 5]];
EK.startBattle({ foe: EK.mkMon('cindercub', 5), team, npc: { name: 'Tester', id: 't_x', trainer: { team, prize: 100 } }, wild: false });
const noRun = EK.doTurn({ kind: 'run' });
ok(noRun.some((e) => /no running/i.test(e.t)), 'you cannot flee a trainer');
const noCatch = EK.doTurn({ kind: 'item', id: 'bloomorb' });
ok(noCatch.some((e) => /No\./.test(e.t)), 'you cannot catch a trainer kin');
eq(G.bag.bloomorb, 5, 'the refused orb is not consumed');
let g3 = 0;
while (!EK.B().over && g3++ < 30) EK.doTurn({ kind: 'move', id: G.party[0].moves[0].id });
eq(EK.B().over, 'win', 'beating the whole team wins');
ok(g3 > 1, 'the second team member was sent out');

section('capture maths');
const weak = EK.mkMon('zaplet', 5); weak.hp = 1;
const fresh = EK.mkMon('zaplet', 5);
ok(EK.captureChance(weak, 1) > EK.captureChance(fresh, 1), 'hurt kin are easier to catch');
ok(EK.captureChance(weak, 2.6) > EK.captureChance(weak, 1), 'a better orb helps');
const statused = EK.mkMon('zaplet', 5); statused.hp = 1; statused.status = 'shock';
ok(EK.captureChance(statused, 1) > EK.captureChance(weak, 1), 'status helps');
ok(EK.captureChance(EK.mkMon('vespyr', 40), 2.6) < EK.captureChance(fresh, 1), 'the legendary resists the best orb');
ok(EK.captureChance(weak, 1) <= 1 && EK.captureChance(weak, 1) >= 0, 'chance stays a probability');

section('catching a wild kin actually catches it');
G.party = [EK.mkMon('tsunaga', 50)];
G.bag = { prismorb: 400 };
G.dex = {}; G.caught = 0;
EK.startBattle({ foe: EK.mkMon('zaplet', 3), wild: true });
EK.B().foe.hp = 1;
let caught = false;
for (let i = 0; i < 400 && !caught; i++) {
  EK.doTurn({ kind: 'item', id: 'prismorb' });
  if (EK.B().over === 'caught') caught = true;
  else if (EK.B().over) { EK.startBattle({ foe: EK.mkMon('zaplet', 3), wild: true }); EK.B().foe.hp = 1; }
  else EK.B().foe.hp = 1;
}
ok(caught, 'a weakened kin is eventually caught');
ok(G.bag.prismorb < 400, 'orbs are consumed');
const before = G.party.length;
EK.addCaught(EK.B().foe);
eq(G.party.length, before + 1, 'the catch joins the party');
eq(G.dex.zaplet, 2, 'the dex marks it caught');

section('a full party sends the catch to the box');
G.party = ['cindercub', 'dewdrip', 'sproutle', 'zaplet', 'pebblet', 'mothrix'].map((id) => EK.mkMon(id, 5));
G.box = [];
EK.addCaught(EK.mkMon('kindlark', 5));
eq(G.party.length, 6, 'party stays at six');
eq(G.box.length, 1, 'the overflow goes to the box');

section('the box withdraws, stores and swaps');
const boxG = EK.G;
boxG.party = ['cindercub', 'dewdrip'].map((id) => EK.mkMon(id, 5));
boxG.box = ['zaplet', 'mothrix'].map((id) => EK.mkMon(id, 5));
EK.openScreen('box');
const scr = EK.G.screen;
scr.i = 2;                                  // first boxed kin
EK.boxSelect(scr);
eq(boxG.party.length, 3, 'a boxed kin joins a party with room');
eq(boxG.box.length, 1, 'and leaves the box');
scr.i = 0;
EK.boxSelect(scr);
eq(boxG.party.length, 2, 'a party kin can be stored');
eq(boxG.box.length, 2, 'and lands in the box');
boxG.party = ['cindercub', 'dewdrip', 'sproutle', 'zaplet', 'pebblet', 'mothrix'].map((id) => EK.mkMon(id, 5));
boxG.box = [EK.mkMon('kindlark', 9)];
scr.i = 6; scr.pick = null;
EK.boxSelect(scr);
eq(scr.pick, 6, 'a full party turns a withdrawal into a swap');
eq(boxG.party.length, 6, 'nothing moved yet');
scr.i = 1;
EK.boxSelect(scr);
eq(boxG.party.length, 6, 'the party stays at six');
eq(boxG.party[1].species, 'kindlark', 'the newcomer took the slot');
eq(boxG.box[0].species, 'dewdrip', 'the replaced kin went to the box');
eq(scr.pick, null, 'the swap cleared the pick');
boxG.party = [EK.mkMon('cindercub', 5)];
boxG.box = [];
scr.i = 0; scr.pick = null;
EK.boxSelect(scr);
eq(boxG.party.length, 1, 'your last kin cannot be stored');
EK.closeScreen();

section('levelling and evolution');
G.party = [EK.mkMon('cindercub', 15)];
const cub = G.party[0];
const atkBefore = cub.atk;
EK.startBattle({ foe: EK.mkMon('magmane', 60), wild: true });
EK.B().mine = cub;
EK.grantXP([], cub, EK.mkMon('magmane', 60));
ok(cub.lvl > 15, 'a big win levels you up');
ok(cub.atk > atkBefore, 'levels raise stats');
ok(cub.hp > 0, 'the level-up did not kill anyone');
const pending = EK.checkEvolve();
ok(!!pending, 'level 16+ Cindercub is due to evolve');
const res = EK.evolveMon(pending);
eq(pending.species, 'pyrelynx', 'it became Pyrelynx');
eq(res.newName, 'Pyrelynx', 'the evolution is reported');
eq(EK.G.dex.pyrelynx, 2, 'evolving registers the new form in the dex');
ok(pending.moves.length <= 4, 'move list never exceeds four');

section('status effects tick and expire sensibly');
G.party = [EK.mkMon('gargolem', 30)];
EK.startBattle({ foe: EK.mkMon('gargolem', 30), wild: true });
const b = EK.B();
b.mine.status = 'burn';
const hp0 = b.mine.hp;
EK.endOfTurn([]);
ok(b.mine.hp < hp0, 'burn chips HP at end of turn');
b.mine.status = ''; b.mine.hp = b.mine.max;
EK.endOfTurn([]);
eq(b.mine.hp, b.mine.max, 'no status, no chip');
// Elemental immunity: an Ember kin cannot be burned by Flame Fang.
const emberMon = EK.mkMon('magmane', 30);
G.party = [emberMon];
EK.startBattle({ foe: EK.mkMon('pyrelynx', 60), wild: true });
EK.B().mine = emberMon;
for (let i = 0; i < 60; i++) { emberMon.hp = emberMon.max; EK.useMove([], 'foe', 'flamefang'); }
eq(emberMon.status, '', 'Ember kin never catch fire');

// -------------------------------------------------------------- world --
section('maps are well formed and connected');
for (const [id, map] of Object.entries(MAPS)) {
  const w = map.rows[0].length;
  map.rows.forEach((r, y) => eq(r.length, w, `${id} row ${y} is ${w} wide`));
  ok(map.rows.length >= 8, `${id} is tall enough`);
  for (const wp of (map.warps || [])) {
    ok(!!MAPS[wp.to], `${id} warp targets a real map (${wp.to})`);
    const dst = MAPS[wp.to];
    ok(wp.tx >= 0 && wp.tx < dst.rows[0].length && wp.ty >= 0 && wp.ty < dst.rows.length, `${id}→${wp.to} lands inside the map`);
    ok(!EK.SOLID.has(dst.rows[wp.ty][wp.tx]), `${id}→${wp.to} lands on a walkable tile`);
    ok(wp.x >= 0 && wp.x < w && wp.y >= 0 && wp.y < map.rows.length, `${id} warp tile is inside the map`);
  }
  for (const n of (map.npcs || [])) {
    ok(!EK.SOLID.has(map.rows[n.y][n.x]), `${id} NPC ${n.name} stands on a walkable tile`);
    if (n.trainer) {
      ok(!!n.id, `${id} trainer ${n.name} has a flag id`);
      n.trainer.team.forEach(([sp, lv]) => {
        ok(!!DEX[sp], `${n.name} uses real species ${sp}`);
        ok(lv > 0 && lv < 60, `${n.name} team level ${lv} sane`);
      });
    }
  }
  for (const key of Object.keys(map.signs || {})) {
    const [sx, sy] = key.split(',').map(Number);
    eq(map.rows[sy][sx], 'S', `${id} sign at ${key} is on a sign tile`);
  }
  if (map.enc) {
    ok(map.enc.rate > 0 && map.enc.rate < .5, `${id} encounter rate sane`);
    map.enc.table.forEach(([sp, lo, hi, wt]) => {
      ok(!!DEX[sp], `${id} spawns real species ${sp}`);
      ok(lo <= hi && lo > 0, `${id} ${sp} level band sane`);
      ok(wt > 0, `${id} ${sp} weight positive`);
    });
    ok(map.rows.join('').includes(','), `${id} has tall grass to meet them in`);
  }
}
// Every map with an encounter table must be reachable from the town.
const seen = new Set(['hollowbrook']);
const stack = ['hollowbrook'];
while (stack.length) {
  const cur = stack.pop();
  for (const wp of (MAPS[cur].warps || [])) if (!seen.has(wp.to)) { seen.add(wp.to); stack.push(wp.to); }
}
for (const id of Object.keys(MAPS)) ok(seen.has(id), `${id} is reachable from Hollowbrook`);

section('every species can actually be obtained');
const spawnable = new Set();
for (const map of Object.values(MAPS)) for (const e of ((map.enc && map.enc.table) || [])) spawnable.add(e[0]);
spawnable.add('vespyr');                                   // scripted shrine encounter
for (const id of ['cindercub', 'dewdrip', 'sproutle']) spawnable.add(id);   // starters
for (const id of DEX_ORDER) {
  const viaEvo = DEX_ORDER.some((p) => DEX[p].evo && DEX[p].evo[0] === id && spawnable.has(p));
  ok(spawnable.has(id) || viaEvo, `${id} is catchable or evolvable`);
}

section('movement, collision and warps');
EK.enterMap('route_one', 9, 10, 'down');
eq(EK.G.mapId, 'route_one', 'entered the route');
ok(!EK.passable(MAPS.route_one, 0, 5, 5), 'trees block');
ok(EK.passable(MAPS.route_one, 9, 5, 5), 'the path is walkable');
ok(!EK.passable(MAPS.hollowbrook, 4, 9, 9), 'water blocks');
// A ledge is one-way: you may drop down it, never climb it.
const ledgeRow = MAPS.route_one.rows.findIndex((r) => r.includes('L'));
const ledgeCol = MAPS.route_one.rows[ledgeRow].indexOf('L');
ok(EK.passable(MAPS.route_one, ledgeCol, ledgeRow, ledgeRow - 1), 'ledges let you drop down');
ok(!EK.passable(MAPS.route_one, ledgeCol, ledgeRow, ledgeRow + 1), 'ledges refuse to be climbed');

EK.enterMap('hollowbrook', 9, 1, 'up');
const wp = EK.warpAt(MAPS.hollowbrook, 9, 0);
ok(!!wp, 'the town has a north exit');
eq(wp.to, 'route_one', 'it leads to Route One');

section('every exit on a map can actually be walked to');
// Tile-only flood fill: NPCs are deliberately excluded so a story blocker does
// not read as a broken map. Ledges are entered from above, as a player would.
function reachable(map, sx, sy) {
  const seen = new Set([`${sx},${sy}`]);
  const q = [[sx, sy]];
  const walk = (x, y, fromY) => {
    const row = map.rows[y];
    const t = (!row || x < 0 || x >= row.length) ? '#' : row[x];
    return t === 'L' ? y > fromY : !EK.SOLID.has(t);
  };
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      let nx = x + dx, ny = y + dy;
      const row = map.rows[ny];
      if (!row || nx < 0 || nx >= row.length) continue;
      if (row[nx] === 'L' && dy === 1) ny += 1;           // a ledge drop clears two tiles
      if (!walk(nx, ny, y) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return seen;
}
for (const [id, map] of Object.entries(MAPS)) {
  const warps = map.warps || [];
  if (warps.length < 2) continue;
  const from = reachable(map, warps[0].x, warps[0].y);
  for (const wp of warps.slice(1)) ok(from.has(`${wp.x},${wp.y}`), `${id}: ${wp.to} exit is reachable from the first exit`);
  for (const n of (map.npcs || [])) ok(from.has(`${n.x},${n.y}`) || map.rows[n.y][n.x] === '=', `${id}: ${n.name} can be walked up to`);
}

section('the Warden really gates Crown Hollow');
const wood = MAPS.emberwood;
const hale = wood.npcs.find((n) => n.id === 't_hale');
ok(!!hale && hale.block, 'the Warden is flagged as a blocker');
const south = wood.warps.find((w) => w.to === 'route_one');
const north = wood.warps.find((w) => w.to === 'crown_hollow');
const blocked = (() => {                       // same fill, but his tile is a wall
  const rows = wood.rows.slice();
  rows[hale.y] = rows[hale.y].slice(0, hale.x) + '#' + rows[hale.y].slice(hale.x + 1);
  return reachable({ rows }, south.x, south.y);
})();
ok(!blocked.has(`${north.x},${north.y}`), 'you cannot slip past the Warden to Crown Hollow');
ok(reachable(wood, south.x, south.y).has(`${north.x},${north.y}`), 'once he steps aside the path opens');

section('the difficulty curve never asks for a grind');
// Each trainer should be beatable by a party levelled on the grass around them:
// no trainer may outlevel the local encounter band by more than a few levels.
const ROUTE_ORDER = ['route_one', 'emberwood', 'stillmere', 'crown_hollow'];
for (const id of ROUTE_ORDER) {
  const map = MAPS[id];
  const wildMax = Math.max(...map.enc.table.map((e) => e[2]));
  for (const n of (map.npcs || [])) {
    if (!n.trainer) continue;
    const lead = Math.max(...n.trainer.team.map((t) => t[1]));
    ok(lead <= wildMax + 8, `${n.name} (Lv${lead}) is within reach of ${id} wilds (Lv${wildMax})`);
  }
}
// And the legendary must not outclass the region it guards.
ok(26 <= Math.max(...MAPS.crown_hollow.enc.table.map((e) => e[2])) + 8, 'Vespyr sits close to Crown Hollow levels');

section('encounters only fire in tall grass');
EK.G.party = [EK.mkMon('cindercub', 5)];
EK.enterMap('route_one', 9, 10, 'down');
EK.G.battle = null; EK.G.mode = 'world';
for (let i = 0; i < 200; i++) { EK.G.player.x = 9; EK.G.player.y = 10; EK.onArrive(); }
ok(!EK.G.battle, 'standing on the path never starts a fight');
let started = 0;
for (let i = 0; i < 400; i++) {
  EK.G.battle = null; EK.G.mode = 'world';
  EK.G.player.x = 4; EK.G.player.y = 1;              // tall grass
  EK.onArrive();
  if (EK.G.battle) started++;
}
ok(started > 10, `tall grass produces encounters (${started}/400)`);
EK.G.battle = null; EK.G.mode = 'world';

section('encounter tables roll inside their level bands');
for (let i = 0; i < 300; i++) {
  const mon = EK.rollEncounter(MAPS.stillmere);
  const row = MAPS.stillmere.enc.table.find((e) => e[0] === mon.species);
  ok(!!row, 'rolled a species from the table');
  ok(mon.lvl >= row[1] && mon.lvl <= row[2], `${mon.species} level ${mon.lvl} inside ${row[1]}-${row[2]}`);
}

// --------------------------------------------------------------- save --
section('save round-trips');
const store = {};
const EK2 = loadGame(store);
EK2.G.party = [EK2.mkMon('pyrelynx', 22), EK2.mkMon('lanterneel', 18)];
EK2.G.party[0].hp = 13;
EK2.G.party[0].nick = 'Ash';
EK2.G.party[0].status = 'burn';
EK2.G.party[0].moves[0].pp = 2;
EK2.G.bag = { bloomorb: 4, salve: 1 };
EK2.G.money = 1234;
EK2.G.dex = { pyrelynx: 2, zaplet: 1 };
EK2.G.flags = { gotStarter: 1, t_pell: 1 };
EK2.enterMap('emberwood', 8, 12, 'left');
ok(EK2.saveGame(), 'save writes');
ok(EK2.hasSave(), 'a save is detected');

const EK3 = loadGame(store);
ok(EK3.loadGame(), 'load restores a party');
eq(EK3.G.party.length, 2, 'both kin came back');
eq(EK3.G.party[0].species, 'pyrelynx', 'species preserved');
eq(EK3.G.party[0].lvl, 22, 'level preserved');
eq(EK3.G.party[0].hp, 13, 'damage preserved');
eq(EK3.G.party[0].nick, 'Ash', 'nickname preserved');
eq(EK3.G.party[0].status, 'burn', 'status preserved');
eq(EK3.G.party[0].moves[0].pp, 2, 'spent PP preserved');
eq(EK3.G.money, 1234, 'shards preserved');
eq(EK3.G.bag.bloomorb, 4, 'bag preserved');
eq(EK3.G.dex.pyrelynx, 2, 'dex preserved');
eq(EK3.G.flags.t_pell, 1, 'beaten trainers stay beaten');
eq(EK3.G.mapId, 'emberwood', 'position preserved');
eq(EK3.G.player.x, 8, 'x preserved');

section('a corrupt save never crashes the game');
const EK4 = loadGame({ emberkin_save_v1: '{not json' });
eq(EK4.loadGame(), false, 'garbage is rejected');
const EK5 = loadGame({ emberkin_save_v1: JSON.stringify({ v: 1, party: [{ s: 'nonexistent', l: 5, mv: [] }] }) });
eq(EK5.loadGame(), false, 'an unknown species is dropped rather than loaded');

section('healing restores the whole party');
EK.G.party = [EK.mkMon('bramblor', 30), EK.mkMon('voltyx', 25)];
EK.G.party[0].hp = 1; EK.G.party[0].status = 'burn'; EK.G.party[0].moves[0].pp = 0;
EK.G.party[1].hp = 0;
EK.healParty();
ok(EK.G.party.every((m) => m.hp === m.max && !m.status && m.moves.every((mv) => mv.pp === mv.max)), 'everyone is whole again');

done('emberkin');
