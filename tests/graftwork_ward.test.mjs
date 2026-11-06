// GRAFTWORK Ward mode (design/WARD.md): floor generation, building legality, power, spawn timers, phases and their combat
// modifiers, walks and trigger order, off-room penalty, boss days, act carryover, save round trip, classic untouched, full runs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as RUN from '../graftwork/engine/run.js';
import * as W from '../graftwork/engine/ward.js';
import { newCombat, kill } from '../graftwork/engine/combat.js';
import { STARTER_BUILD_DECK, BUILD_LIST, WARD_TUNE } from '../graftwork/data/ward.js';
import { BUILD_CARDS, ROOMS, ENEMIES } from '../graftwork/data/index.js';
const ELITE1 = Object.values(ENEMIES).find((e) => e.act === 1 && e.kind === 'elite' && !e.summonOnly).id;
import { UNLOCKS, START } from '../graftwork/data/unlocks.js';
import { POLICIES, playRun } from '../tools/graftwork_sim.mjs';
import { playWardRun } from '../tools/graftwork_ward_sim.mjs';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const mk = (seed = 'w', hero = 'marrow') => RUN.newRun({ hero, seed, mode: 'ward' });
// put a building card in the hand and return its uid
const give = (run, id) => { const c = { uid: 9000 + run.ward.cardNext++, id }; run.ward.deck.hand.push(c); return c.uid; };
// wipe the floor and lay rooms by hand: spec = [[type, x, y, contents?, extra?]], the first must be the Entrance
function layout(run, spec) {
  const w = run.ward;
  w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
  const ids = [];
  for (const [type, x, y, contents, extra] of spec) {
    const id = 'r' + w.nextRoom++;
    w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 9 }, contents: contents || [], upgrades: [], ...(extra || {}) };
    w.grid[y][x] = id; ids.push(id);
  }
  if (!spec.some((s) => s[0] === 'rm_theatre')) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type: 'rm_theatre', x: 8, y: 5, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[5][8] = id; }
  w.hero.room = ids[0]; W.wardPower(run);
  return ids;
}
const mon = (id = 'orderly') => ({ kind: 'monster', id });
const win = () => ({ win: true, shattered: [], damageTaken: 0, turns: 3 });
// finish a fight with a win and click through the reward and graft screens (skips the graft)
function clearFight(run) {
  assert.equal(run.phase, 'combat');
  RUN.resolveFight(run, win());
  const rw = run.pending; RUN.claimGold(run, rw);
  if (rw.buildChoice) W.takeBuildChoice(run, null);
  RUN.afterReward(run);
  while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); }
}

t('floor generation: deterministic, 9 x 6, Entrance and Theatre far apart, pre-built rooms connected, Theatre reachable', () => {
  for (let i = 0; i < 40; i++) {
    const a = mk('gen' + i), b = mk('gen' + i);
    assert.equal(JSON.stringify(a.ward), JSON.stringify(b.ward));
    const w = a.ward;
    assert.equal(a.phase, 'ward'); assert.equal(w.phase, 'morning'); assert.equal(w.day, 1); assert.equal(w.dayLimit, 6);
    assert.equal(w.grid.length, 6); assert.equal(w.grid[0].length, 9);
    const ent = W.entranceOf(a), th = W.theatreOf(a);
    assert.ok(Math.abs(ent.x - th.x) + Math.abs(ent.y - th.y) >= 8, 'far apart');
    for (const ty of ['rm_ward', 'rm_chapel', 'rm_sawmill']) assert.ok(Object.values(w.rooms).some((r) => r.type === ty), ty);
    const conn = W.connectedRooms(a);
    for (const r of Object.values(w.rooms)) if (r.type !== 'rm_theatre') assert.ok(conn.has(r.id), 'connected ' + r.type);
    assert.ok(W.theatreReachable(a));
    const rub = w.grid.flat().filter((c) => c === 'rubble').length; assert.ok(rub >= 3 && rub <= 5, 'rubble ' + rub);
    assert.equal(w.deck.hand.length, 5); assert.equal(w.deck.hand.length + w.deck.draw.length, STARTER_BUILD_DECK.length);
    assert.equal(w.hero.room, ent.id);
  }
  assert.notEqual(JSON.stringify(mk('x1').ward.grid), JSON.stringify(mk('x2').ward.grid));
});

t('build legality: every reason, and a legal build lands', () => {
  const run = mk('legal');
  const [e] = layout(run, [['rm_entrance', 0, 0]]);
  run.ward.grid[1][1] = 'rubble';
  run.ward.res = { wood: 10, stone: 10 };
  const u = give(run, 'b_ward');
  assert.equal(W.canBuild(run, u, 9, 0).why, 'bounds');
  assert.equal(W.canBuild(run, u, 0, 0).why, 'occupied');
  assert.equal(W.canBuild(run, u, 1, 1).why, 'rubble');
  assert.equal(W.canBuild(run, u, 3, 3).why, 'adjacent');
  assert.equal(W.canBuild(run, 12345, 1, 0).why, 'nocard');
  assert.equal(W.canBuild(run, u, 7, 5).why, 'adjacent', 'next to the Theatre only is not enough');
  run.ward.res.wood = 1; assert.equal(W.canBuild(run, u, 1, 0).why, 'cost'); run.ward.res.wood = 10;
  assert.ok(W.canBuild(run, u, 1, 0).ok);
  const r = W.playBuildCard(run, u, { x: 1, y: 0 }); assert.ok(r.ok); assert.equal(run.ward.rooms[r.room].type, 'rm_ward');
  assert.equal(run.ward.res.wood, 8); assert.equal(run.ward.res.stone, 9);
  assert.ok(run.ward.deck.discard.some((c) => c.uid === u));
  const up = give(run, 'b_reinforced_beds');
  assert.equal(W.canPlayBuild(run, up, e).why, 'type');
  assert.ok(W.playBuildCard(run, up, r.room).ok);
  const up2 = give(run, 'b_reinforced_beds'); assert.equal(W.canPlayBuild(run, up2, r.room).why, 'already');
  const d = give(run, 'b_demolish');
  assert.equal(W.canPlayBuild(run, d, e).why, 'fixed');
  run.ward.hero.room = r.room; assert.equal(W.canPlayBuild(run, d, r.room).why, 'hero'); run.ward.hero.room = e;
  const c = give(run, 'b_corridor'); W.playBuildCard(run, c, { x: 2, y: 0 });
  assert.equal(W.canPlayBuild(run, d, r.room).why, 'cut', 'removing the middle room strands the corridor');
  assert.ok(W.canPlayBuild(run, d, { x: 1, y: 1 }).ok, 'Demolish clears rubble');
  W.endMorning(run); const late = give(run, 'b_ward'); assert.equal(W.canBuild(run, late, 0, 1).why, 'phase');
});

t('power: capacity 6 + 2 per Generator, a room built without spare power is dark, off rooms pause their timers', () => {
  const run = mk('pow');
  const ids = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0], ['rm_ward', 2, 0], ['rm_quarry', 3, 0], ['rm_sawmill', 4, 0], ['rm_chapel', 5, 0], ['rm_linen', 6, 0]]);
  assert.deepEqual([W.wardPower(run).cap, W.wardPower(run).used], [6, 6]);
  run.ward.res = { wood: 20, stone: 20 };
  const r = W.playBuildCard(run, give(run, 'b_ward'), { x: 1, y: 1 }); assert.ok(r.ok); assert.equal(run.ward.rooms[r.room].on, false, 'built dark');
  assert.equal(W.togglePower(run, r.room).why, 'power');
  assert.ok(W.playBuildCard(run, give(run, 'b_generator'), { x: 0, y: 1 }).ok); assert.equal(W.wardPower(run).cap, 8);
  assert.ok(W.togglePower(run, r.room).ok); assert.equal(run.ward.rooms[r.room].on, true);
  assert.equal(W.togglePower(run, ids[0]).why, 'nopower');
  // pause: switch one Ward off, run mornings, only the lit Ward fills
  W.togglePower(run, ids[2]); assert.equal(run.ward.rooms[ids[2]].on, false);
  run.ward.rooms[ids[1]].timers.spawn = 1; run.ward.rooms[ids[2]].timers.spawn = 1;
  for (let i = 0; i < 4; i++) W.morningStart(run);
  assert.equal(run.ward.rooms[ids[1]].contents.length, 4, 'lit Ward: one a morning');
  assert.equal(run.ward.rooms[ids[2]].contents.length, 0, 'dark Ward: timer paused');
  assert.equal(run.ward.rooms[ids[2]].timers.spawn, 1, 'timer did not move');
});

t('spawn timers and caps: Ward one a day up to 5, elite every 2 days and Level 2 after 3 uncleared days, event every 4', () => {
  const run = mk('spawn');
  const [, wd, iso, ch, iso2] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0], ['rm_isolation', 2, 0], ['rm_chapel', 3, 0], ['rm_isolation', 4, 0, [], { upgrades: ['b_scrub_in'] }]]);
  const w = run.ward; for (const r of Object.values(w.rooms)) r.timers.spawn = 1;
  const counts = [], events = [];
  for (let d = 1; d <= 9; d++) {
    W.morningStart(run);
    counts.push(w.rooms[wd].contents.length);
    events.push(w.rooms[ch].contents.length); w.rooms[ch].contents = []; // the event is taken the day it appears
    if (d === 1) { assert.equal(w.rooms[iso].contents.length, 1); assert.equal(w.rooms[iso].contents[0].level, 1); }
    if (d === 3) assert.equal(w.rooms[iso].contents[0].level, 1, 'two days old: still Level 1');
    if (d === 4) assert.equal(w.rooms[iso].contents[0].level, 2, 'three uncleared days: Level 2');
  }
  assert.deepEqual(counts, [1, 2, 3, 4, 5, 5, 5, 5, 5], 'cap 5');
  assert.deepEqual(events, [1, 0, 0, 0, 1, 0, 0, 0, 1], 'every 4 days');
  assert.equal(w.rooms[iso].contents.length, 1, 'cap 1');
  assert.equal(w.rooms[iso2].contents[0].level, 1, 'Scrub In: never Level 2');
  w.rooms[wd].upgrades.push('b_reinforced_beds'); w.rooms[wd].contents = []; W.morningStart(run); assert.equal(w.rooms[wd].contents.length, 2, 'Reinforced Beds: two a day');
});

t('phase cycle: morning, midday, evening, night, next morning; dinner draw and night Strength reach combat', () => {
  const run = mk('phase');
  const [, wd, iso] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon(), mon('bedpan_slime')]], ['rm_isolation', 0, 1, [{ kind: 'elite', id: ELITE1, age: 0, level: 1 }]]]);
  const w = run.ward;
  assert.equal(W.pathTo(run, wd).why, 'morning');
  assert.ok(W.endMorning(run)); assert.equal(w.phase, 'midday'); assert.equal(w.deck.hand.length, 0);
  assert.equal(W.startWalk(run, w.hero.room), null, 'waiting in an empty room just passes the phase'); assert.equal(w.phase, 'evening');
  const p = W.startWalk(run, wd);
  assert.equal(p.kind, 'combat'); assert.equal(p.mods.firstTurnDraw, 1); assert.ok(!p.mods.enemyStr);
  const c = newCombat(run, p.enemies, { kind: 'normal' });
  assert.equal(c.hand.length, 6, 'dinner: one more card on turn 1');
  clearFight(run); assert.equal(run.phase, 'ward'); assert.equal(w.phase, 'night');
  const q = W.startWalk(run, iso);
  // the walk passes the Entrance (empty) and stops at Isolation
  assert.equal(q.fightKind, 'elite'); assert.equal(q.mods.enemyStr, 2); assert.equal(q.mods.goldMul, 1.25);
  const c2 = newCombat(run, q.enemies, { kind: 'elite' });
  assert.equal(c2.enemies[0].st.strength >= 2, true, 'night elite +2 Strength');
  RUN.resolveFight(run, win());
  assert.equal(run.pending.buildChoice.length, 3, 'elites offer a building card, 1 of 3');
  assert.ok(run.pending.relicChoices && run.pending.relicChoices.length >= 1 && !run.pending.relic, 'night elite: a relic choice');
  const deckN = W.buildDeckList(run).length; W.takeBuildChoice(run, run.pending.buildChoice[1]); assert.equal(W.buildDeckList(run).length, deckN + 1);
  RUN.afterReward(run); while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); }
  assert.equal(run.phase, 'ward'); assert.equal(w.phase, 'morning'); assert.equal(w.day, 2); assert.equal(w.deck.hand.length, 5);
  // night monsters: +1 Strength
  w.phase = 'night'; w.rooms[wd].contents = [mon()]; w.hero.room = iso;
  const r = W.startWalk(run, wd); assert.equal(r.mods.enemyStr, 1);
  const c3 = newCombat(run, r.enemies, { kind: 'normal' }); assert.ok(c3.enemies.every((e) => (e.st.strength || 0) >= 1));
});

t('walk: shortest path, triggers in order, an event behind two fight rooms forces both fights; ties go to empty rooms', () => {
  const run = mk('walk');
  const [e, w1, w2, ch] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()]], ['rm_ward', 2, 0, [mon(), mon()]], ['rm_chapel', 3, 0, [{ kind: 'event' }]]]);
  W.endMorning(run);
  const pv = W.pathTo(run, ch);
  assert.deepEqual(pv.path, [w1, w2, ch]); assert.equal(pv.cost, 3);
  assert.deepEqual(pv.triggers.map((x) => x.kind), ['fight', 'fight', 'event']); assert.equal(pv.triggers[1].detail.count, 2);
  const p1 = W.startWalk(run, ch); assert.equal(p1.ward.room, w1); assert.equal(p1.enemies.length, 1);
  clearFight(run);
  assert.equal(run.phase, 'combat'); assert.equal(run.pending.ward.room, w2); assert.equal(run.pending.enemies.length, 2);
  clearFight(run);
  assert.equal(run.phase, 'event'); assert.equal(run.ward.hero.room, ch);
  const evs = RUN.eventChoices(run); RUN.eventChoose(run, evs.findIndex((x) => x.ok && !x.pick)); RUN.afterEvent(run);
  while (run.phase !== 'ward') { if (run.phase === 'combat') clearFight(run); else if (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); } else break; }
  assert.equal(run.phase, 'ward'); assert.equal(run.ward.phase, 'evening'); assert.equal(run.ward.walk, null);
  // tie-break: two 3-step paths, one through a full Ward, one through corridors
  const run2 = mk('tie');
  const [, wx, c1, c2, dest] = layout(run2, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()]], ['rm_corridor', 0, 1], ['rm_corridor', 1, 1], ['rm_linen', 2, 1]]);
  W.endMorning(run2);
  const tv = W.pathTo(run2, dest);
  assert.deepEqual(tv.path, [c1, c2, dest]); assert.equal(tv.triggers.length, 0); assert.equal(tv.alts.length, 1);
  assert.deepEqual(tv.alts[0].path, [wx, c2, dest]); assert.equal(W.pathTo(run2, dest, 1).triggers[0].kind, 'fight');
  // MOVE 4
  const run3 = mk('far');
  const ids = layout(run3, [['rm_entrance', 0, 0], ...[1, 2, 3, 4, 5].map((x) => ['rm_corridor', x, 0])]);
  W.endMorning(run3); assert.ok(W.pathTo(run3, ids[4]).ok); assert.equal(W.pathTo(run3, ids[5]).why, 'far');
  run3.ward.effects.push({ id: 'move', n: 1, until: 'day' }); assert.ok(W.pathTo(run3, ids[5]).ok, 'Morning Rounds: +1 MOVE');
});

t('reinforcements: 5 monsters = 3 on the board, the rest step up as each dies; big fights pay more', () => {
  const run = mk('rein');
  const [, wd] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon(), mon(), mon(), mon(), mon()]]]);
  W.endMorning(run);
  const p = W.startWalk(run, wd); assert.equal(p.enemies.length, 3); assert.equal(p.reinforce.length, 2);
  const c = newCombat(run, p.enemies, { kind: 'normal' });
  assert.equal(c.enemies.length, 3);
  kill(c, c.enemies[0]); assert.equal(c.enemies.filter((x) => !x.dead).length, 3); assert.equal(c.reinforce.length, 1);
  kill(c, c.enemies[1]); kill(c, c.enemies[2]); assert.equal(c.reinforce.length, 0); assert.ok(!c.over);
  for (const x of c.enemies) if (!x.dead) kill(c, x);
  assert.equal(c.over, 'win');
  const wood0 = run.ward.res.wood + run.ward.res.stone;
  RUN.resolveFight(run, win());
  assert.equal(run.ward.res.wood + run.ward.res.stone, wood0 + 5, '+1 wood or stone per monster');
  assert.ok(Math.abs(run.pending.ward.goldMul - 1.1 * (1 + 3 * WARD_TUNE.goldPerExtra)) < 1e-9);
  assert.equal(run.flags.queueGraft, 1, '4+ monsters: one more graft pick');
});

t('off rooms: crossing a dark room costs 3 HP (never kills), Lamp Oil saves it, dark contents sleep', () => {
  const run = mk('dark');
  const [, wd, co] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()], { on: false }], ['rm_corridor', 2, 0]]);
  W.endMorning(run);
  const pv = W.pathTo(run, co); assert.equal(pv.offPenalty, 3); assert.equal(pv.triggers.length, 0);
  run.hp = 2; assert.equal(W.startWalk(run, co), null); assert.equal(run.hp, 1, 'never kills');
  assert.equal(run.ward.rooms[wd].contents.length, 1, 'the sleeping monster is still there');
  run.ward.hero.room = Object.keys(run.ward.rooms)[0]; run.ward.effects.push({ id: 'lamp', until: 'day' });
  assert.equal(W.pathTo(run, co).offPenalty, 0); const hp = run.hp; W.startWalk(run, co); assert.equal(run.hp, hp);
});

t('boss: forced on the last night, early from day (last - 2) at x0.9 HP with a card and 30 gold; act end carries over', () => {
  const run = mk('boss');
  const [, , th] = layout(run, [['rm_entrance', 0, 0], ['rm_corridor', 1, 0], ['rm_theatre', 2, 0]]);
  const w = run.ward;
  W.endMorning(run);
  assert.equal(W.pathTo(run, th).triggers.length, 0, 'not scrubbed in yet: passing is safe');
  w.day = w.dayLimit - 2;
  const pv = W.pathTo(run, th); assert.equal(pv.triggers[0].kind, 'boss'); assert.equal(pv.triggers[0].detail.early, true);
  w.res = { wood: 11, stone: 7 };
  const deckN = W.buildDeckList(run).length, gold0 = run.gold;
  const p = W.startWalk(run, th); assert.equal(p.fightKind, 'boss'); assert.equal(p.mods.hpMul, 0.9);
  const c = newCombat(run, p.enemies, { kind: 'boss' }); assert.ok(c.enemies[0].maxHp < 140, 'boss HP x0.9 ' + c.enemies[0].maxHp);
  RUN.resolveFight(run, win());
  const rw = run.pending; assert.ok(rw.buildChoice.length >= 1); assert.equal(rw.wardBonus.gold, 30); assert.equal(run.gold, gold0 + 30);
  assert.equal(W.buildDeckList(run).length, deckN + 1, 'the free building card');
  RUN.claimGold(run, rw); W.takeBuildChoice(run, null); RUN.afterReward(run); while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); }
  assert.equal(run.act, 2); assert.equal(run.phase, 'ward'); assert.equal(run.ward.act, 2); assert.equal(run.ward.dayLimit, 7);
  const saw = Object.values(run.ward.rooms).filter((r) => r.type === 'rm_sawmill').length; // the new floor's first morning already produced
  assert.deepEqual(run.ward.res, { wood: 4 + 5 + 2 * saw, stone: 3 + 3 }, '50 percent carries');
  assert.equal(W.buildDeckList(run).length, deckN + 1, 'building deck carries in full');
  // forced: the last night
  const w2 = run.ward; w2.day = w2.dayLimit; W.endMorning(run); w2.phase = 'night';
  const other = Object.values(w2.rooms).find((r) => r.type === 'rm_ward').id;
  assert.equal(W.pathTo(run, other).why, 'boss'); assert.equal(W.startWalk(run, other), false); assert.equal(w2.why, 'boss');
  const fp = W.startWalk(run, W.theatreOf(run).id); assert.equal(fp.fightKind, 'boss'); assert.ok(!fp.mods.hpMul, 'full HP on the night');
  // act 3 boss, then the Grafter
  run.act = 3; RUN.resolveFight(run, win()); RUN.claimGold(run, run.pending); W.takeBuildChoice(run, null); RUN.afterReward(run); while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); }
  assert.equal(run.phase, 'combat'); assert.equal(run.pending.fightKind, 'final'); assert.deepEqual(run.pending.enemies, ['the_grafter']);
  RUN.resolveFight(run, win()); assert.equal(run.phase, 'won');
});

t('save round trip mid-walk: same outcome as the run that never stopped', () => {
  const play = (stop) => {
    let run = mk('save');
    const [, , , ch] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()]], ['rm_ward', 2, 0, [mon()]], ['rm_chapel', 3, 0, [{ kind: 'event' }]]]);
    W.endMorning(run); W.startWalk(run, ch);
    clearFight(run);
    if (stop) { const s = RUN.serializeRun(run); run = RUN.deserializeRun(s); assert.equal(run.ward.walk.i, 2); assert.equal(run.phase, 'combat'); }
    clearFight(run);
    assert.equal(run.phase, 'event');
    return RUN.serializeRun(run);
  };
  assert.equal(play(true), play(false));
});

t('Dispensary: sells building cards and removes one for 50 gold (ward mode only)', () => {
  const run = mk('shop'); run.gold = 500;
  const shop = RUN.makeShop(run); run.phase = 'shop'; run.pending = shop;
  assert.equal(shop.builds.length, 3); assert.equal(shop.buildRemovePrice, 50);
  const n0 = W.buildDeckList(run).length;
  assert.ok(RUN.shopBuy(run, 'build', 0).ok); assert.equal(W.buildDeckList(run).length, n0 + 1);
  const g = run.gold; assert.ok(RUN.shopBuy(run, 'buildRemove', 0, run.ward.deck.draw[0].uid).ok); assert.equal(run.gold, g - 50);
  assert.equal(RUN.shopBuy(run, 'buildRemove', 0, run.ward.deck.draw[0].uid).ok, false, 'once per visit');
  const classic = RUN.newRun({ hero: 'marrow', seed: 'shop' }); const cs = RUN.makeShop(classic);
  assert.equal(cs.builds, undefined); classic.pending = cs; assert.equal(RUN.shopBuy(classic, 'build', 0).ok, false);
});

t('unlocks: building cards are kind build; start set = every room card plus half of the rest; the starter deck is open', () => {
  const rooms = BUILD_LIST.filter((c) => c.kind === 'room'), other = BUILD_LIST.filter((c) => c.kind !== 'room');
  for (const c of rooms) assert.equal(UNLOCKS['build:' + c.id].tier, 'start');
  const open = other.filter((c) => START.build.has(c.id)).length; assert.ok(Math.abs(open - other.length / 2) <= 1, 'half ' + open + '/' + other.length);
  for (const id of STARTER_BUILD_DECK) assert.equal(UNLOCKS['build:' + id].tier, 'start');
  const run = RUN.newRun({ hero: 'wick', seed: 'u', mode: 'ward', unlocked: 'start' });
  for (let i = 0; i < 60; i++) assert.ok(START.build.has(W.rollBuildCard(run, ['common', 'uncommon', 'rare'])));
  for (const id of Object.keys(BUILD_CARDS)) assert.ok(/^b_/.test(id)); for (const id of Object.keys(ROOMS)) assert.ok(/^rm_/.test(id));
  assert.ok(!/\u2014/.test(JSON.stringify(BUILD_LIST.map((c) => c.text + c.name)) + JSON.stringify(Object.values(ROOMS).map((r) => r.hint))), 'no em dashes');
});

t('classic mode is untouched: no mode field, no ward state, no phase mods; seeded runs replay identically', () => {
  const h = () => { const x = createHash('sha1'); for (const hero of ['marrow', 'wick', 'odile']) for (let i = 0; i < 2; i++) { const r = playRun(hero, `cls-${hero}-${i}`, POLICIES.strong, 0); const s = RUN.serializeRun(r.run); assert.ok(!/"mode"|"ward"|"mods"|"reinforce"/.test(s), 'classic save carries no ward fields'); x.update(s); } return x.digest('hex'); };
  assert.equal(h(), h());
  const run = RUN.newRun({ hero: 'marrow', seed: 'c' }); assert.equal(run.mode, undefined); assert.equal(RUN.runMode(run), 'classic'); assert.equal(run.phase, 'map');
});

t('full ward runs: 3 heroes x 3 seeds with the strong policy end won or dead, never throw', () => {
  for (const hero of ['marrow', 'wick', 'odile']) for (let i = 0; i < 3; i++) {
    const r = playWardRun(hero, `wt-${hero}-${i}`, 'strong');
    assert.ok(r.outcome === 'won' || r.outcome === 'dead', hero + ' ' + r.outcome);
    assert.ok(r.log.acts[1].fights >= 4, 'fought in act 1');
  }
  const rr = playWardRun('marrow', 'wt-rand', 'random'); assert.ok(rr.outcome === 'dead' || rr.outcome === 'won');
});

console.log(n + ' passed');
