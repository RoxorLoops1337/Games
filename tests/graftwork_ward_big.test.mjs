// GRAFTWORK Ward: room sizes and Expand (design/WARD.md "Room sizes and Expand"): footprints, placement, Expand, Demolish, adjacency across
// big rooms, one route step per room, the 2 x 2 Theatre, dark big rooms, old saves (1 x 1 only), the Surveyor's Tape and the Surveyor event.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import * as W from '../graftwork/engine/ward.js';
import { ROOMS, BUILD_CARDS, BUILD_LIST, WARD_TUNE } from '../graftwork/data/ward.js';
import { BIG_RECIPES, hasBigRecipe } from '../graftwork/data/ward_kit_big.js';
import { UNLOCKS } from '../graftwork/data/unlocks.js';
import { playWardRun } from '../tools/graftwork_driver.mjs';
import { readFileSync } from 'node:fs';
import { resolveRecipe, lanesFor, freeConnected, wallPlan, pathOnGrid } from '../graftwork/data/ward_kit.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const mk = (seed = 'big', hero = 'marrow') => RUN.newRun({ hero, seed });
const give = (run, id) => { const c = { uid: 9000 + run.ward.cardNext++, id }; run.ward.deck.hand.push(c); return c.uid; };
// wipe the floor and lay rooms by hand: spec = [[type, x, y, w, h, contents?, extra?]]; the first is the Entrance; a 2 x 2 Theatre goes to the far corner unless given
function layout(run, spec) {
  const w = run.ward;
  w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
  const ids = [];
  const add = (type, x, y, fw = 1, fh = 1, contents = [], extra = {}) => {
    const id = 'r' + w.nextRoom++, r = { id, type, x, y, on: true, level: 1, timers: { spawn: 9 }, contents, upgrades: [], ...extra };
    if (fw > 1) r.w = fw; if (fh > 1) r.h = fh; w.rooms[id] = r; for (const [cx, cy] of W.cellsOf(r)) w.grid[cy][cx] = id; ids.push(id); return id;
  };
  for (const s of spec) add(...s);
  if (!spec.some((s) => s[0] === 'rm_theatre')) add('rm_theatre', 7, 4, 2, 2);
  w.hero.room = ids[0]; w.res = { wood: 30, stone: 30 }; run.gold = 500; W.wardPower(run);
  return ids;
}
const mon = (id = 'orderly') => ({ kind: 'monster', id });
const consistent = (run) => { // every cell of every room holds its id, no other cell holds a room id, rooms do not overlap
  const w = run.ward, seen = new Map();
  for (const r of Object.values(w.rooms)) for (const [cx, cy] of W.cellsOf(r)) { assert.equal(w.grid[cy][cx], r.id, `cell ${cx},${cy} of ${r.id}`); assert.ok(!seen.has(cx + ',' + cy)); seen.set(cx + ',' + cy, r.id); }
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { const c = w.grid[y][x]; if (c && c !== 'rubble') assert.equal(seen.get(x + ',' + y), c, `stray id at ${x},${y}`); }
};

t('data model: 1 x 1 rooms carry no w or h (byte identical to old saves), the Theatre is 2 x 2 on every floor', () => {
  for (let i = 0; i < 40; i++) {
    const run = mk('fp' + i), w = run.ward;
    for (const r of Object.values(w.rooms)) if (r.type !== 'rm_theatre') assert.ok(!('w' in r) && !('h' in r), r.type + ' has no size fields');
    const th = W.theatreOf(run); assert.deepEqual([th.w, th.h], [2, 2]); assert.equal(th.x, 7); assert.ok(th.y >= 0 && th.y <= 4);
    assert.equal(W.cellsOf(th).length, 4); consistent(run); assert.ok(W.theatreReachable(run));
    assert.deepEqual(W.sizeOf(W.entranceOf(run)), [1, 1]); assert.equal(W.sizeKey(th), '2x2');
  }
});

t('placement: a Generator is born 2 cells (4 stone, +3 power), side picked for you or by dir, and why a spot is refused', () => {
  const run = mk('place'); layout(run, [['rm_entrance', 0, 2]]);
  const u = give(run, 'b_generator'), ok = W.canPlayBuild(run, u, { x: 1, y: 2 }); assert.ok(ok.ok); assert.equal(ok.cells.length, 2);
  assert.deepEqual(W.placement(run, [2, 1], 1, 2).f, { x: 1, y: 2, w: 2, h: 1 }, 'auto picks east first');
  assert.deepEqual(W.placement(run, [2, 1], 1, 2, 's').f, { x: 1, y: 2, w: 1, h: 2 });
  assert.deepEqual(W.placement(run, [2, 1], 1, 2, 'w').why, 'occupied', 'west is the Entrance');
  assert.deepEqual(W.placement(run, [2, 1], 1, 2, 'n').f, { x: 1, y: 1, w: 1, h: 2 }, 'north anchors on the upper cell');
  const r = W.playBuildCard(run, u, { x: 1, y: 2, dir: 's' }); assert.ok(r.ok); const g = run.ward.rooms[r.room];
  assert.deepEqual([g.x, g.y, g.w, g.h], [1, 2, undefined, 2]); assert.equal(run.ward.grid[3][1], g.id); assert.equal(run.ward.grid[2][1], g.id); consistent(run);
  assert.equal(run.ward.res.stone, 26, 'paid 4 stone'); assert.equal(W.wardPower(run).cap, 9);
  assert.equal(W.canPlayBuild(run, give(run, 'b_generator'), { x: 1, y: 3 }).why, 'occupied');
  run.ward.grid[2][5] = 'rubble'; assert.equal(W.canPlayBuild(run, give(run, 'b_generator'), { x: 5, y: 2 }).why, 'rubble');
  assert.equal(W.canPlayBuild(run, give(run, 'b_generator'), { x: 5, y: 5 }).why, 'adjacent', 'a 2 cell room still has to touch a room');
  assert.equal(W.canPlayBuild(run, give(run, 'b_generator'), { x: 9, y: 0 }).why, 'bounds');
  // the second cell may be the one that touches a room; a corner with no room for 2 cells is "space"
  layout(run, [['rm_entrance', 0, 0], ['rm_corridor', 1, 0], ['rm_corridor', 0, 1]]); run.ward.grid[0][2] = 'rubble'; run.ward.grid[1][1] = 'rubble';
  assert.equal(W.canPlayBuild(run, give(run, 'b_generator'), { x: 1, y: 1 }).why, 'rubble');
  assert.equal(W.placement(run, [2, 1], 0, 2).ok, true); // (0,2) next to the corridor at (0,1), room to the east
});

t('Expand: a Ward grows to 2 cells for its Expand cost, holds 7, uses 2 power, picks a free side or the one you name', () => {
  const run = mk('exp'); const [ent, ward] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2]]);
  const ex = W.expandOptions(run, ward); assert.ok(ex.ok); assert.deepEqual(ex.dirs.map((d) => d.dir), ['e', 's', 'n'], 'west is the Entrance'); assert.deepEqual(ex.cost, { wood: 2, stone: 1 });
  const p0 = W.wardPower(run).used, wood0 = run.ward.res.wood;
  const r = W.playBuildCard(run, give(run, 'b_expand'), ward); assert.ok(r.ok); const rm = run.ward.rooms[ward];
  assert.deepEqual([rm.x, rm.y, rm.w, rm.h], [1, 2, 2, undefined]); assert.equal(run.ward.grid[2][2], ward); consistent(run);
  assert.equal(run.ward.res.wood, wood0 - 2); assert.equal(W.wardPower(run).used, p0 + 1, 'one more power'); assert.equal(W.capOf(rm, run), 7);
  assert.equal(W.expandOptions(run, ward).why, 'already'); assert.equal(W.canPlayBuild(run, give(run, 'b_expand'), ward).why, 'already');
  const r2 = mk('exp2'); const [, w2] = layout(r2, [['rm_entrance', 0, 2], ['rm_ward', 1, 2]]);
  assert.ok(W.playBuildCard(r2, give(r2, 'b_expand'), { room: w2, dir: 'n' }).ok); const q = r2.ward.rooms[w2]; assert.deepEqual([q.x, q.y, q.h], [1, 1, 2], 'north: the anchor moves up'); consistent(r2);
  assert.equal(W.canPlayBuild(r2, give(r2, 'b_expand'), { room: w2, dir: 'w' }).why, 'already');
  const r3 = mk('exp3'); const [, w3] = layout(r3, [['rm_entrance', 0, 2], ['rm_ward', 1, 2], ['rm_corridor', 2, 2], ['rm_corridor', 1, 1], ['rm_corridor', 1, 3]]);
  assert.equal(W.expandOptions(r3, w3).why, 'space'); assert.equal(W.canPlayBuild(r3, give(r3, 'b_expand'), w3).why, 'space');
  const r4 = mk('exp4'); const [, w4, c4] = layout(r4, [['rm_entrance', 0, 2], ['rm_ward', 1, 2], ['rm_isolation', 1, 4]]);
  assert.equal(W.canPlayBuild(r4, give(r4, 'b_expand'), c4).why, 'type'); assert.equal(W.canPlayBuild(r4, give(r4, 'b_expand'), 'nope').why, 'target');
  r4.ward.res = { wood: 1, stone: 0 }; assert.equal(W.canPlayBuild(r4, give(r4, 'b_expand'), w4).why, 'cost'); assert.equal(W.playBuildCard(r4, give(r4, 'b_expand'), w4).ok, false);
});

t('Expand: rooms without a kit recipe for a size cannot grow, and the engine says why', () => {
  const lib = BIG_RECIPES.rm_library; const saved = { ...lib };
  try {
    delete lib['2x1']; delete lib['1x2']; assert.equal(hasBigRecipe('rm_library', 2, 1), false);
    const run = mk('norec'); const [, l] = layout(run, [['rm_entrance', 0, 2], ['rm_library', 1, 2]]);
    assert.equal(W.expandOptions(run, l).why, 'norecipe'); assert.equal(W.canPlayBuild(run, give(run, 'b_expand'), l).why, 'norecipe');
  } finally { Object.assign(lib, saved); }
  for (const [id, d] of Object.entries(ROOMS)) if (d.expand) { assert.ok(hasBigRecipe(id, 2, 1) && hasBigRecipe(id, 1, 2), id + ' has both 2 cell recipes'); }
  for (const id of ['rm_generator', 'rm_boiler']) assert.ok(hasBigRecipe(id, 2, 1) && hasBigRecipe(id, 1, 2), id);
  assert.ok(hasBigRecipe('rm_theatre', 2, 2));
});

t('what a bigger room gives: Chapel every 3 days, Workshop every 2, Library 40 percent, Kitchen draws 3, Ward holds 7, Boiler +1 more', () => {
  const run = mk('gain'); const [, ch, ws, li, ki, bo, wd] = layout(run, [['rm_entrance', 0, 0], ['rm_chapel', 1, 0, 2, 1], ['rm_workshop', 1, 2, 1, 2], ['rm_library', 3, 2, 2, 1], ['rm_kitchen', 3, 4, 1, 2], ['rm_boiler', 5, 0, 2, 1], ['rm_ward', 5, 2, 2, 1]]);
  assert.equal(W.everyOf(run.ward.rooms[ch]), 3); assert.equal(W.everyOf(run.ward.rooms[ws]), 2); assert.equal(W.capOf(run.ward.rooms[wd], run), 7);
  assert.equal(W.phaseMods(run, run.ward.rooms[wd], 'normal').firstTurnDraw, undefined, 'no dinner outside evening');
  run.ward.phase = 'evening'; assert.equal(W.phaseMods(run, run.ward.rooms[wd], 'normal').firstTurnDraw, 3, 'big kitchen');
  const small = mk('gain2'); layout(small, [['rm_entrance', 0, 0], ['rm_chapel', 1, 0], ['rm_workshop', 2, 0], ['rm_kitchen', 3, 0], ['rm_ward', 4, 0], ['rm_boiler', 5, 0]]);
  small.ward.phase = 'evening'; assert.equal(W.phaseMods(small, null, 'normal').firstTurnDraw, WARD_TUNE.kitchenDraw);
  assert.equal(W.everyOf(small.ward.rooms.r2), 4); assert.equal(W.everyOf(small.ward.rooms.r3), 3); assert.equal(W.capOf(small.ward.rooms.r5, small), 5);
  // boiler: one 1x2 boiler and two lit Wards = +1 +1; a Generator is +3 (two cells) or +2 (an old one cell Generator)
  const pw = mk('gain3'); layout(pw, [['rm_entrance', 0, 0], ['rm_boiler', 1, 0, 2, 1], ['rm_ward', 3, 0], ['rm_ward', 4, 0], ['rm_generator', 1, 2, 2, 1], ['rm_generator', 1, 4]]);
  assert.equal(W.wardPower(pw).cap, 6 + 2 + 3 + 2 + 0 + 0 + 0 - 0 + 0, 'boiler 1 + 1 flat, generators 3 and 2'); 
  const lib = mk('gain4'); layout(lib, [['rm_entrance', 0, 0], ['rm_library', 1, 0, 2, 1]]); const up0 = () => lib.deck.filter((i) => i.up).length;
  for (let d = 0; d < 60; d++) W.morningStart(lib); const big = up0();
  const lib1 = mk('gain4'); layout(lib1, [['rm_entrance', 0, 0], ['rm_library', 1, 0]]); for (let d = 0; d < 60; d++) W.morningStart(lib1);
  assert.ok(big > lib1.deck.filter((i) => i.up).length, 'a big Library upgrades more cards: ' + big);
});

t('Expand without spare power: the bigger room goes dark; a Fire Door still caps a big Ward at 3', () => {
  const run = mk('dark'); const [, w1] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0], ['rm_ward', 2, 0], ['rm_quarry', 3, 0], ['rm_sawmill', 4, 0], ['rm_chapel', 5, 0], ['rm_linen', 6, 0]]);
  assert.equal(W.wardPower(run).free, 0);
  assert.ok(W.playBuildCard(run, give(run, 'b_expand'), { room: w1, dir: 's' }).ok); assert.equal(run.ward.rooms[w1].on, false, 'dark');
  assert.equal(W.togglePower(run, w1).why, 'power'); assert.equal(W.cellCount(run.ward.rooms[w1]), 2);
  assert.ok(W.playBuildCard(run, give(run, 'b_generator'), { x: 0, y: 1 }).ok);
  assert.ok(W.togglePower(run, w1).ok, 'a Generator lights it'); assert.equal(W.wardPower(run).used, 7);
  assert.ok(W.playBuildCard(run, give(run, 'b_fire_door'), w1).ok); assert.equal(W.capOf(run.ward.rooms[w1], run), 3);
});

t('Demolish: a big room clears every cell and refunds half of build plus Expand cost; never the Theatre, the hero room or a room that cuts another off', () => {
  const run = mk('demo'); const [ent, w1, c1] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, 2, 1], ['rm_corridor', 3, 2]]);
  const wood0 = run.ward.res.wood, stone0 = run.ward.res.stone;
  assert.equal(W.canPlayBuild(run, give(run, 'b_demolish'), w1).why, 'cut', 'the corridor behind would be cut off');
  assert.ok(W.playBuildCard(run, give(run, 'b_demolish'), c1).ok);
  assert.ok(W.playBuildCard(run, give(run, 'b_demolish'), w1).ok);
  assert.equal(run.ward.grid[2][1], null); assert.equal(run.ward.grid[2][2], null); assert.equal(run.ward.rooms[w1], undefined); consistent(run);
  assert.equal(run.ward.res.wood - wood0, 0 + 2, 'half of (2 + 2) wood; the corridor refunded 0'); assert.equal(run.ward.res.stone - stone0, 1, 'half of (1 + 1) stone');
  const th = W.theatreOf(run); assert.equal(W.canPlayBuild(run, give(run, 'b_demolish'), th.id).why, 'fixed');
  const h = mk('demo2'); const [, g] = layout(h, [['rm_entrance', 0, 2], ['rm_generator', 1, 2, 2, 1]]); h.ward.hero.room = g; assert.equal(W.canPlayBuild(h, give(h, 'b_demolish'), g).why, 'hero');
});

t('adjacency: a big room meets every neighbour along its whole edge, symmetric, each neighbour once', () => {
  const run = mk('adj'); const [e, w1, a, b, c, d] = layout(run, [['rm_entrance', 0, 1], ['rm_ward', 1, 1, 2, 2], ['rm_corridor', 1, 0], ['rm_corridor', 2, 0], ['rm_corridor', 3, 2], ['rm_corridor', 1, 3]]);
  assert.deepEqual(W.neighbors(run, w1).slice().sort(), [a, b, c, d, e].sort());
  for (const id of Object.keys(run.ward.rooms)) for (const o of W.neighbors(run, id)) assert.ok(W.neighbors(run, o).includes(id), id + ' <-> ' + o);
  assert.deepEqual(W.neighbors(run, a), [w1, b].filter((x) => W.neighbors(run, a).includes(x)).sort((p, q) => W.neighbors(run, a).indexOf(p) - W.neighbors(run, a).indexOf(q)));
  assert.equal(W.neighbors(run, w1).filter((x) => x === a).length, 1, 'the corridor above touches two cells but is one neighbour');
  assert.ok(W.connectedRooms(run).has(d));
});

t('a route steps into a big room ONCE (it fires once) and may leave from any boundary cell; the room is not enterable twice', () => {
  const run = mk('route');
  const [ent, bw, far] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, 2, 1, [mon(), mon(), mon(), mon(), mon(), mon(), mon()]], ['rm_chapel', 2, 3, 1, 1, [{ kind: 'event' }]]]);
  W.endMorning(run); const w = run.ward; w.roll = { key: `${w.day}:${w.phase}`, base: 2, sides: 4, bonus: 0, n: 2, lucky: 0 }; w.route = [];
  assert.equal(W.routeWhy(run, far), 'unreachable', 'the chapel only touches the big ward: it is not a neighbour of the entrance');
  assert.equal(W.extendRoute(run, bw).ok, true); assert.equal(W.routeWhy(run, bw), 'visited');
  assert.equal(W.routeWhy(run, far), null, 'legal from the big ward even though it touches the ward at its SECOND cell');
  assert.ok(W.extendRoute(run, far).ok);
  const info = W.routeInfo(run); assert.equal(info.triggers.length, 2); assert.equal(info.triggers[0].kind, 'fight'); assert.equal(info.triggers[0].detail.count, 7); assert.equal(info.left, 0);
  const p = W.startRoute(run); assert.equal(p.kind, 'combat'); assert.equal(p.enemies.length, 3); assert.equal(p.reinforce.length, 4, 'board of 3, the rest arrive as reinforcements'); assert.equal(p.ward.count, 7);
  // pathTo (the forced walk / wait) agrees on the one step
  const r2 = mk('route2'); const [e2, b2, f2] = layout(r2, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2, 2, 1], ['rm_chapel', 2, 3]]); W.endMorning(r2);
  assert.deepEqual(W.pathTo(r2, f2).path, [b2, f2]);
});

t('the Theatre is 2 x 2: any cell of it connects, one step enters it, the boss opens two days early, the last night pulls you in', () => {
  const run = mk('th'); const [e, c1, c2] = layout(run, [['rm_entrance', 0, 4], ['rm_corridor', 1, 4], ['rm_corridor', 2, 4]]);
  const w = run.ward; w.rooms.r4.x = 5; w.rooms.r4.y = 3; for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.grid[y][x] === 'r4') w.grid[y][x] = null;
  for (const [cx, cy] of W.cellsOf(w.rooms.r4)) w.grid[cy][cx] = 'r4'; // theatre now covers (5,3) (6,3) (5,4) (6,4)
  const th = W.theatreOf(run); assert.equal(th.id, 'r4'); consistent(run);
  assert.deepEqual(W.neighbors(run, c2).filter((x) => x === th.id), [], 'corridor at (2,4) is not touching (5,4)');
  const c3 = 'r' + w.nextRoom++; w.rooms[c3] = { id: c3, type: 'rm_corridor', x: 4, y: 4, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[4][4] = c3;
  assert.ok(W.neighbors(run, c3).includes(th.id), '(4,4) touches the Theatre cell (5,4)');
  const c4 = 'r' + w.nextRoom++; w.rooms[c4] = { id: c4, type: 'rm_corridor', x: 5, y: 2, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[2][5] = c4;
  assert.ok(W.neighbors(run, c4).includes(th.id), '(5,2) touches the Theatre cell (5,3) from above');
  assert.equal(W.wouldTrigger(run, th, true), null, 'closed early');
  w.day = w.dayLimit - 2; assert.equal(W.wouldTrigger(run, th, true).kind, 'boss'); assert.equal(W.bossOpen(run), true);
  assert.equal(W.wardPower(run).used, 0, 'the Theatre uses no power'); assert.equal(th.on, true);
  w.day = w.dayLimit; w.phase = 'night'; assert.equal(W.bossForced(run), true); const p = W.pathTo(run, th.id); assert.ok(p.ok && p.forced);
  const pend = W.startWalk(run, th.id); assert.equal(pend.fightKind, 'boss'); assert.equal(pend.ward.early, false);
  // building next to ANY theatre cell is not allowed to count as "adjacent to a room" (the old rule: the Theatre does not enable building)
  assert.equal(W.placement(run, [1, 1], 7, 3).ok, false); assert.equal(W.placement(run, [1, 1], 7, 3).why, 'adjacent');
});

t('old saves: 1 x 1 rooms with no w or h and a 1 x 1 Theatre keep working through a save round trip', () => {
  const run = mk('old'); const [e, w1, c1, th] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, 1, 1, [mon(), mon()]], ['rm_chapel', 2, 0], ['rm_theatre', 8, 5]]);
  const copy = RUN.deserializeRun(RUN.serializeRun(run)); const W2 = copy.ward;
  assert.deepEqual(W.cellsOf(W2.rooms[th]), [[8, 5]]); assert.ok(W.theatreReachable(copy) === true);
  for (const id of Object.keys(W2.rooms)) assert.ok(!('w' in W2.rooms[id]));
  assert.deepEqual(W.neighbors(copy, w1).sort(), [e, c1].sort()); assert.ok(W.expandOptions(copy, w1).ok);
  assert.ok(W.playBuildCard(copy, give(copy, 'b_expand'), w1).ok);
  const copy2 = RUN.deserializeRun(RUN.serializeRun(copy)); assert.equal(W.cellCount(copy2.ward.rooms[w1]), 2); assert.equal(W.capOf(copy2.ward.rooms[w1], copy2), 7); consistent(copy2);
  W.endMorning(copy2); assert.ok(W.pathTo(copy2, w1).ok);
});

t('cards and unlocks: Expand, Ward Wing and Grand Chapel exist, are unlockable build ids, Expand is in the start set; the room cards that start big list their size', () => {
  for (const id of ['b_expand', 'b_ward_wing', 'b_grand_chapel']) { assert.ok(BUILD_CARDS[id], id); assert.ok(UNLOCKS['build:' + id], 'unlock id ' + id); }
  assert.equal(UNLOCKS['build:b_expand'].tier, 'start'); assert.equal(UNLOCKS['build:b_ward_wing'].tier, 'locked');
  assert.deepEqual(BUILD_CARDS.b_generator.size, [2, 1]); assert.deepEqual(BUILD_CARDS.b_boiler.size, [2, 1]); assert.deepEqual(BUILD_CARDS.b_ward_wing.size, [2, 1]); assert.equal(BUILD_CARDS.b_ward.size, undefined);
  assert.deepEqual(BUILD_CARDS.b_ward_wing.cost, { wood: 4, stone: 2 }, 'Ward + Expand');
  const run = mk('wing'); layout(run, [['rm_entrance', 0, 2]]);
  const r = W.playBuildCard(run, give(run, 'b_ward_wing'), { x: 1, y: 2 }); assert.ok(r.ok); const rm = run.ward.rooms[r.room];
  assert.equal(rm.type, 'rm_ward'); assert.equal(W.cellCount(rm), 2); assert.equal(W.capOf(rm, run), 7); assert.equal(W.powerUse(rm), 2); consistent(run);
  assert.equal(W.expandOptions(run, r.room).why, 'already');
  assert.ok(BUILD_LIST.every((c) => ['room', 'upgrade', 'effect', 'expand'].includes(c.kind)));
});

t('relic and event: the Surveyor\'s Tape takes 1 wood and 1 stone off an Expand; the Surveyor event hands out an Expand card', () => {
  const run = mk('tape'); RUN.addRelic(run, 'r_w_surveyors_tape'); const [, w1] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2]]);
  assert.deepEqual(W.expandOptions(run, w1).cost, { wood: 1, stone: 0 }); const wood0 = run.ward.res.wood, stone0 = run.ward.res.stone;
  assert.ok(W.playBuildCard(run, give(run, 'b_expand'), w1).ok); assert.equal(run.ward.res.wood, wood0 - 1); assert.equal(run.ward.res.stone, stone0);
  const ev = mk('sv'); ev.ward.phase = 'midday'; ev.phase = 'event'; ev.pending = { kind: 'event', id: 'e_w_surveyor', result: null };
  const have = () => [...ev.ward.deck.draw, ...ev.ward.deck.hand, ...ev.ward.deck.discard].filter((c) => c.id === 'b_expand').length; const b0 = have();
  RUN.eventChoose(ev, 1); assert.equal(have(), b0 + 1); assert.ok(ev.hp > 0);
});

t('kit recipes for big rooms: every size resolves against the kit on disk; lanes of every cell edge and cell boundary stay free; props inside, never overlapping; one open floor; tall props hug a back wall; 1 x 2 mirrors 2 x 1', () => {
  const kit = JSON.parse(readFileSync(new URL('../graftwork/assets/ward_kit/manifest.json', import.meta.url), 'utf8'));
  const TALL = ['shelf', 'toolrack', 'lamp', 'iv_stand', 'coat_stand', 'candle_stand', 'bookcase', 'locker_wall', 'linen_shelf', 'pickaxe_rack', 'hanging_pots', 'library_ladder', 'throne'];
  let n = 0;
  for (const [type, sizes] of Object.entries(BIG_RECIPES)) for (const key of Object.keys(sizes)) {
    const [fw, fh] = key.split('x').map(Number), rc = resolveRecipe(type, kit, fw, fh); assert.ok(rc, type + ' ' + key + ' resolves'); n++;
    assert.equal(rc.cu, 4 * fw); assert.equal(rc.cv, 4 * fh); assert.equal(rc.fw, fw); assert.ok(rc.key.endsWith('@' + key));
    for (const [u, v] of lanesFor(fw, fh)) assert.ok(!rc.occ[u][v], `${type} ${key}: lane ${u},${v} is free`);
    assert.ok(freeConnected(rc), `${type} ${key}: one open floor`);
    for (const p of rc.props) { assert.ok(p.u >= 0 && p.v >= 0 && p.u + p.c <= rc.cu && p.v + p.r <= rc.cv, `${type} ${key} ${p.id} inside`); if (TALL.includes(p.id)) assert.ok(p.u === 0 || p.v === 0, `${type} ${key}: tall ${p.id} at ${p.u},${p.v} hugs a back wall`); }
    assert.ok(rc.props.length >= (fw * fh >= 4 ? 7 : 6), `${type} ${key}: more props than a single cell room (${rc.props.length})`);
    assert.ok(rc.free.length > 0 && rc.stand);
  }
  assert.ok(n >= 15, 'sizes checked: ' + n);
  // the 1 x 2 plan is the 2 x 1 plan mirrored across the diagonal
  const a = resolveRecipe('rm_ward', kit, 2, 1), b = resolveRecipe('rm_ward', kit, 1, 2);
  assert.equal(a.props.length, b.props.length); for (let i = 0; i < a.props.length; i++) { assert.equal(a.props[i].u, b.props[i].v); assert.equal(a.props[i].v, b.props[i].u); assert.notEqual(a.props[i].flip, b.props[i].flip); }
  assert.equal(resolveRecipe('rm_ward', kit, 2, 2), null, 'no 2 x 2 plan for a Ward');
  assert.equal(resolveRecipe('rm_corridor', kit, 2, 1), null, 'a Corridor has no big plan: it never expands');
  assert.equal(hasBigRecipe('rm_ward', 3, 1), false);
  const one = resolveRecipe('rm_ward', kit); assert.ok(one && one.cu === 4 && one.key === 'rm_ward#0', 'the 1 x 1 plan and its key are untouched');
});

t('doors and walking: a big room has a door wherever a neighbour meets one of its cells; the hero crosses its inner cell boundary freely', () => {
  const run = mk('doors'); const [ent, wd, up, dn, ch] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, 2, 1], ['rm_corridor', 2, 1], ['rm_corridor', 1, 3], ['rm_chapel', 3, 2]]);
  const list = Object.values(run.ward.rooms), at = (x, y) => (run.ward.grid[y] && run.ward.grid[y][x] && run.ward.grid[y][x] !== 'rubble' ? run.ward.grid[y][x] : null);
  const plan = wallPlan(list, (id) => W.neighbors(run, id), at), p = plan.get(wd);
  assert.deepEqual(p.Ls, [true], 'west: the Entrance meets its one L segment'); assert.deepEqual(p.Rs, [false, true], 'north: the corridor above the SECOND cell gives the second R segment a door');
  assert.deepEqual(p.slabLs, [false, true], 'south: the corridor under the first cell closes that front edge, the second stays open'); assert.deepEqual(p.slabRs, [false], 'east: the Chapel');
  assert.equal(p.L, true); assert.equal(p.R, true); assert.equal(p.w, 2);
  const q = plan.get(ent); assert.deepEqual(q.Ls, [false]); assert.deepEqual(q.Rs, [false]);
  // one door per touching neighbour cell, never a door in a wall nothing touches
  const kit = JSON.parse(readFileSync(new URL('../graftwork/assets/ward_kit/manifest.json', import.meta.url), 'utf8')), rc = resolveRecipe('rm_ward', kit, 2, 1);
  const info = (gx, gy) => { const id = at(Math.floor(gx / 4), Math.floor(gy / 4)); if (!id) return null; const r = run.ward.rooms[id]; if (r.type !== 'rm_ward') return { room: true, solid: false, rid: id }; return { room: true, solid: !!rc.occ[gx - r.x * 4][gy - r.y * 4], rid: id }; };
  const from = [1 * 4 + rc.stand[0], 2 * 4 + rc.stand[1]], to = [1 * 4 + 7, 2 * 4 + 1];
  const path = pathOnGrid(from, to, info); assert.ok(path && path.length > 2, 'a path across the two cells'); assert.ok(path.every(([gx, gy]) => info(gx, gy) && !info(gx, gy).solid));
  assert.ok(path.some(([gx]) => gx === 4 + 3) && path.some(([gx]) => gx === 4 + 4), 'it crosses the inner boundary (columns 3 and 4 of the room)');
  void dn; void ch; void up;
});

t('property: 80 random Ward runs with Expand on and off keep the grid consistent every morning, every route legal, every save round-trips', () => {
  let big = 0, runs = 0;
  for (let i = 0; i < 80; i++) {
    const hero = ['marrow', 'wick', 'odile'][i % 3];
    const res = playWardRun(hero, 'bigprop' + i, i % 4 === 0 ? 'random' : 'strong', 0, { onMorning: (run) => { consistent(run); big += Object.values(run.ward.rooms).filter((r) => W.isBig(r) && r.type !== 'rm_theatre').length; const rt = JSON.parse(JSON.stringify(run.ward)); assert.equal(JSON.stringify(rt), JSON.stringify(run.ward)); } });
    runs++; assert.ok(res);
  }
  assert.ok(big > 0, 'big rooms appeared: ' + big);
});

console.log(n + ' ward size checks passed');
