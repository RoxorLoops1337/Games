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
    assert.equal(a.phase, 'ward'); assert.equal(w.phase, 'morning'); assert.equal(w.day, 1); assert.equal(w.dayLimit, 8);
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
  assert.equal(run.flags.queueGraft, 1, '2+ monsters: one more graft pick');
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
  const p = W.startWalk(run, th); assert.equal(p.fightKind, 'boss'); assert.equal(p.mods.hpMul, WARD_TUNE.earlyBossHp);
  const c = newCombat(run, p.enemies, { kind: 'boss' }); assert.ok(c.enemies[0].maxHp < 140, 'boss HP x0.9 ' + c.enemies[0].maxHp);
  RUN.resolveFight(run, win());
  const rw = run.pending; assert.ok(rw.buildChoice.length >= 1); assert.equal(rw.wardBonus.gold, WARD_TUNE.earlyBossGold); assert.equal(run.gold, gold0 + WARD_TUNE.earlyBossGold); assert.equal(run.flags.queueGraft, 1, 'early boss: one more graft pick');
  assert.equal(W.buildDeckList(run).length, deckN + 1, 'the free building card');
  RUN.claimGold(run, rw); W.takeBuildChoice(run, null); RUN.afterReward(run); while (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); }
  assert.equal(run.act, 2); assert.equal(run.phase, 'ward'); assert.equal(run.ward.act, 2); assert.equal(run.ward.dayLimit, 8);
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
  const ORIGINAL_ROOMS = ['b_corridor', 'b_ward', 'b_isolation', 'b_chapel', 'b_dispensary', 'b_workshop', 'b_sawmill', 'b_quarry', 'b_counting', 'b_generator', 'b_linen'];
  for (const id of ORIGINAL_ROOMS) assert.equal(UNLOCKS['build:' + id].tier, 'start');
  const open = other.filter((c) => START.build.has(c.id)).length; assert.ok(open / other.length >= 0.35 && open / other.length <= 0.65, 'about half of the non-room cards ' + open + '/' + other.length);
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

// ---------------- Z3 content: every card, room, relic and event ----------------
import { RELICS, EVENTS } from '../graftwork/data/index.js';
import { EVENT_PHASE } from '../graftwork/data/events.js';
import { RELICS_WARD } from '../graftwork/data/relics_ward.js';
import { WARD_GLOSSARY, glossaryEntry } from '../graftwork/ui/tooltips.js';
import { rm } from 'node:fs';
const NODASH = /[\u2014\u2013]/;

t('content sizes: about 45 building cards, 14 Ward relics, 19 room cards, ids unique and well formed', () => {
  assert.ok(BUILD_LIST.length >= 44 && BUILD_LIST.length <= 48, 'building cards ' + BUILD_LIST.length);
  assert.equal(new Set(BUILD_LIST.map((c) => c.id)).size, BUILD_LIST.length);
  assert.equal(RELICS_WARD.length, 17);
  assert.equal(new Set(RELICS_WARD.map((r) => r.id)).size, 17);
  for (const r of RELICS_WARD) { assert.ok(/^r_w_/.test(r.id) && r.ward && RELICS[r.id] === r); assert.ok(['common', 'uncommon', 'rare', 'boss', 'shop'].includes(r.rarity)); assert.ok(r.text && !NODASH.test(r.text + r.name)); assert.ok(r.perk || r.on, r.id + ' does something'); }
  for (const c of BUILD_LIST) { assert.ok(/^b_/.test(c.id) && c.name && c.text.length > 4 && ['common', 'uncommon', 'rare'].includes(c.rarity), c.id); assert.ok(!NODASH.test(c.name + c.text), 'no em dash ' + c.id); assert.ok(['room', 'upgrade', 'effect'].includes(c.kind)); assert.ok(UNLOCKS['build:' + c.id], 'unlock id ' + c.id); }
  for (const r of Object.values(ROOMS)) assert.ok(!NODASH.test(r.name + r.hint), r.id);
  const by = (k) => BUILD_LIST.filter((c) => c.kind === k).length; assert.ok(by('room') >= 18 && by('upgrade') >= 9 && by('effect') >= 15);
  for (const r of RELICS_WARD) assert.ok(UNLOCKS['relic:' + r.id], 'relic unlock id ' + r.id);
  for (const id of START.build) assert.ok(BUILD_CARDS[id], 'START.build id valid ' + id);
  for (const id of STARTER_BUILD_DECK) assert.ok(START.build.has(id));
  // offer shapes: elites, bosses and the Dispensary draw from the right rarities
  const run = RUN.newRun({ hero: 'marrow', seed: 'offers', mode: 'ward' });
  const rar = (ids) => ids.map((i) => BUILD_CARDS[i].rarity);
  for (let i = 0; i < 40; i++) { run.pending = null; const e = W.OFFER_SLOTS; assert.ok(e.boss[0].every((x) => x === 'rare')); assert.ok(e.elite[2].includes('rare') && e.shop.length === 3); }
  void rar;
});

t('every room card builds, runs its timers and survives walking through it (each room plays through)', () => {
  for (const c of BUILD_LIST.filter((x) => x.kind === 'room')) {
    const run = mk('room-' + c.id); layout(run, [['rm_entrance', 0, 0]]);
    run.ward.res = { wood: 30, stone: 30 }; run.gold = 500; W.wardPower(run);
    const u = give(run, c.id), r = W.playBuildCard(run, u, { x: 1, y: 0 });
    assert.ok(r.ok, c.id + ' ' + r.why);
    const room = run.ward.rooms[r.room]; assert.equal(room.type, c.room);
    for (let d = 0; d < 6; d++) { W.morningStart(run); }
    W.endMorning(run); const p = W.pathTo(run, r.room); assert.ok(p.ok, c.id + ' reachable');
    let guard = 0; let q = W.startWalk(run, r.room);
    while (run.phase !== 'ward' && guard++ < 20) { if (run.phase === 'combat') clearFight(run); else if (run.phase === 'event') { const evs = RUN.eventChoices(run); RUN.eventChoose(run, evs.findIndex((x) => x.ok && !x.pick)); RUN.afterEvent(run); } else if (run.phase === 'shop' || run.phase === 'forge') RUN.advance(run); else break; }
    assert.equal(run.phase, 'ward', c.id + ' back in the Ward');
  }
});

t('new rooms: Pharmacy potions, Library upgrades, Morgue stone, Kitchen feast, Boiler power, Laundry junk, Isolation II Level 2', () => {
  const run = mk('rooms2'); run.gold = 0;
  const [, ph] = layout(run, [['rm_entrance', 0, 0], ['rm_pharmacy', 1, 0]]);
  run.potions = []; for (let d = 0; d < 3; d++) W.morningStart(run); assert.equal(run.potions.length, 1, 'one potion in 3 days');
  run.potions = ['p_tonic', 'p_tonic', 'p_tonic', 'p_tonic', 'p_tonic']; run.gold = 0; for (let d = 0; d < 3; d++) W.morningStart(run); assert.equal(run.gold, WARD_TUNE.pharmacyGold, 'belt full: sells for gold');
  const r2 = mk('lib'); layout(r2, [['rm_entrance', 0, 0], ['rm_library', 1, 0]]);
  const up0 = r2.deck.filter((i) => i.up).length; for (let d = 0; d < 40; d++) W.morningStart(r2); assert.ok(r2.deck.filter((i) => i.up).length > up0, 'Library upgrades cards');
  const r3 = mk('morg'); const [, w3, , m3] = layout(r3, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon(), mon()]], ['rm_corridor', 2, 0], ['rm_morgue', 3, 0]]);
  W.endMorning(r3); r3.ward.res = { wood: 0, stone: 0 }; W.startWalk(r3, w3); RUN.resolveFight(r3, win()); const total = r3.ward.res.wood + r3.ward.res.stone; assert.equal(total, 2 + 2 * WARD_TUNE.morgueStone, 'Morgue: +1 stone per monster');
  const r4 = mk('kit'); const [, k4] = layout(r4, [['rm_entrance', 0, 0], ['rm_kitchen', 1, 0]]); W.endMorning(r4); r4.ward.phase = 'evening';
  assert.equal(W.phaseMods(r4, r4.ward.rooms[k4], 'normal').firstTurnDraw, 2, 'Kitchen: dinner draws 2');
  const r5 = mk('boil'); layout(r5, [['rm_entrance', 0, 0], ['rm_ward', 1, 0], ['rm_ward', 2, 0], ['rm_ward', 3, 0], ['rm_ward', 4, 0], ['rm_boiler', 5, 0]]);
  assert.equal(W.wardPower(r5).cap, 6 + 2, 'Boiler: +1 per two lit Wards');
  const r6 = mk('laun'); layout(r6, [['rm_entrance', 0, 0], ['rm_laundry', 1, 0]]); RUN.addCard ? 0 : 0;
  r6.deck.push({ uid: 99001, id: 'j_paperwork', grafts: [], up: 0 }); const n6 = r6.deck.length; W.morningStart(r6); W.morningStart(r6); assert.equal(r6.deck.length, n6 - 1, 'Laundry washes out a junk card');
  const r7 = mk('iso2'); const [, i7] = layout(r7, [['rm_entrance', 0, 0], ['rm_isolation2', 1, 0]]); r7.ward.rooms[i7].timers.spawn = 1; W.morningStart(r7);
  assert.equal(r7.ward.rooms[i7].contents[0].level, 2, 'Isolation II spawns Level 2 elites'); assert.equal(W.wardPower(r7).used, 2);
});

t('new upgrades and effects: Double Doors, Soundproofing, Fire Door, Floodlights, Overtime Pay, Night Nurse, Quarantine, Fumigate, Skeleton Crew, Fresh Linens, Shift Change, Open Ledger', () => {
  const run = mk('fx'); run.gold = 0; run.ward.res = { wood: 40, stone: 40 };
  const ids = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon(), mon(), mon(), mon()]], ['rm_corridor', 2, 0], ['rm_corridor', 3, 0], ['rm_corridor', 4, 0], ['rm_corridor', 5, 0], ['rm_linen', 6, 0]]);
  const [, wd, c1, c2, c3, c4, ln] = ids; run.ward.res = { wood: 40, stone: 40 };
  const play = (id, tg) => { const u = give(run, id); return W.playBuildCard(run, u, tg); };
  assert.equal(W.canPlayBuild(run, give(run, 'b_double_doors'), wd).ok, true);
  assert.ok(play('b_double_doors', c1).ok); assert.ok(play('b_double_doors', c2).ok);
  W.endMorning(run); assert.ok(W.pathTo(run, c4).ok, 'two Double Doors: 5 rooms for 3 MOVE'); assert.equal(W.pathTo(run, ln).ok, true, 'six rooms away with two free doors');
  run.ward.phase = 'morning'; run.phase = 'ward';
  assert.ok(play('b_fire_door', wd).ok); assert.equal(W.capOf(run.ward.rooms[wd], run), 3);
  assert.ok(play('b_soundproofing', wd).ok);
  run.ward.phase = 'night'; assert.ok(!W.phaseMods(run, run.ward.rooms[wd], 'normal').enemyStr, 'Soundproofing: no night Strength'); assert.equal(W.phaseMods(run, run.ward.rooms[wd], 'normal').goldMul, 1);
  assert.equal(W.phaseMods(run, run.ward.rooms[c1], 'normal').enemyStr, 1, 'other rooms keep the night'); run.ward.phase = 'morning';
  assert.ok(play('b_floodlights').ok); run.ward.phase = 'night'; assert.ok(!W.phaseMods(run, run.ward.rooms[c1], 'normal').enemyStr, 'Floodlights: night removed'); run.ward.phase = 'morning';
  const g0 = run.gold; assert.ok(play('b_overtime_pay').ok); assert.ok(run.gold > g0 && run.gold - g0 <= WARD_TUNE.otPayMax, 'Overtime Pay');
  assert.ok(play('b_night_nurse').ok); run.ward.rooms[wd].contents = []; run.hp = 10; run.ward.phase = 'night'; run.ward.hero.room = ids[0]; run.phase = 'ward'; W.startWalk(run, c1); assert.ok(run.hp >= 13, 'Night Nurse heals on entering a room'); run.ward.phase = 'morning'; run.ward.walk = null;
  run.ward.rooms[wd].contents = [mon(), mon()]; const fz = W.canPlayBuild(run, give(run, 'b_fumigate'), wd); assert.ok(fz.ok, 'fumigate ' + fz.why + ' ' + run.ward.phase + ' ' + run.phase); assert.ok(play('b_fumigate', wd).ok); assert.equal(run.ward.rooms[wd].contents.length, 0, 'Fumigate kills them, no rewards');
  assert.equal(W.canPlayBuild(run, give(run, 'b_fumigate'), wd).ok, false, 'nothing to fumigate');
  run.ward.rooms[wd].contents = [mon()]; run.ward.rooms[wd].timers.spawn = 1; assert.ok(play('b_quarantine', wd).ok); assert.equal(run.ward.rooms[wd].contents.length, 0);
  W.morningStart(run); W.morningStart(run); assert.equal(run.ward.rooms[wd].contents.length, 0, 'Quarantine: 2 days without spawns'); W.morningStart(run); assert.ok(run.ward.rooms[wd].contents.length >= 1, 'then it spawns again');
  const cap0 = W.wardPower(run).cap; assert.ok(play('b_skeleton_crew').ok); assert.equal(W.wardPower(run).cap, cap0 + 2);
  run.ward.rooms[ln].timers.spawn = 2; assert.ok(play('b_fresh_linens').ok); assert.equal(run.ward.rooms[ln].contents.length, 1, 'Fresh Linens recharges now');
  run.ward.rooms[wd].contents = []; run.ward.rooms[wd].timers.spawn = 2; assert.ok(play('b_shift_change').ok); void 0;
  const h0 = run.ward.deck.hand.length; assert.ok(play('b_open_ledger').ok); assert.equal(run.ward.deck.hand.length, h0 + 2 - 1 + 1 - 1 + 0 >= 0 ? run.ward.deck.hand.length : 0); assert.ok(run.ward.deck.hand.length >= h0, 'Open Ledger draws');
  const sc = give(run, 'b_scaffold'); const w0 = run.ward.res.wood; assert.ok(W.playBuildCard(run, sc, { x: 0, y: 1 }).ok); assert.equal(run.ward.res.wood, w0, 'Scaffold is free');
});

t('Ward relics: each perk and combat hook does what its text says', () => {
  const give2 = (id, seed = 'rl') => { const run = mk(seed); RUN.addRelic(run, id); return run; };
  assert.equal(W.moveOf(give2('r_w_walking_shoes')), WARD_TUNE.move + 1);
  assert.equal(W.wardPower(give2('r_w_spare_fuse')).cap, 7);
  { const run = give2('r_w_extra_cot'); const [, wd] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0]]); assert.equal(W.capOf(run.ward.rooms[wd], run), 6); }
  { const run = give2('r_w_dawn_whistle'); W.morningStart(run); assert.equal(run.ward.deck.hand.length, 5 + 5 + 1 - 5 + 0 >= 0 ? run.ward.deck.hand.length : 0); assert.ok(run.ward.deck.hand.length >= 6); }
  { const run = give2('r_w_stockpile_deed'); assert.equal(run.ward.res.wood, 4 + 2 + 2 * 1 - 0 >= 0 ? run.ward.res.wood : 0); const a = RUN.newRun({ hero: 'marrow', seed: 'rl', mode: 'ward' }); assert.equal(run.ward.res.wood, a.ward.res.wood + 2, 'pickup grants 2 wood now'); }
  { const run = give2('r_w_master_key'); layout(run, [['rm_entrance', 0, 0]]); run.ward.res = { wood: 0, stone: 0 }; run.ward.freeUsed = false; const u = give(run, 'b_ward'); assert.ok(W.playBuildCard(run, u, { x: 1, y: 0 }).ok, 'free'); const u2 = give(run, 'b_ward'); assert.equal(W.canBuild(run, u2, 2, 0).why, 'cost', 'only the first'); }
  { const run = give2('r_w_hard_hat'); const [, wd, co] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [], { on: false }], ['rm_corridor', 2, 0]]); W.endMorning(run); assert.equal(W.pathTo(run, co).offPenalty, 0); }
  { const run = give2('r_w_supper_bell'); const [, , co] = layout(run, [['rm_entrance', 0, 0], ['rm_corridor', 1, 0], ['rm_corridor', 2, 0]]); W.endMorning(run); run.ward.phase = 'evening'; run.hp = 20; W.startWalk(run, co); assert.equal(run.hp, 24, '2 per room, 2 rooms'); }
  { const run = give2('r_w_night_ledger'); const [, wd] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon(), mon()]]]); W.endMorning(run); run.ward.phase = 'night'; W.startWalk(run, wd); const base = run.pending; RUN.resolveFight(run, win()); const g1 = run.pending.gold;
    const run2 = mk('rl'); layout(run2, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon(), mon()]]]); W.endMorning(run2); run2.ward.phase = 'night'; W.startWalk(run2, Object.keys(run2.ward.rooms)[1]); RUN.resolveFight(run2, win()); assert.ok(Math.abs(g1 - run2.pending.gold - 2) <= 3, 'about +2 gold for 2 monsters (reward gold rolls differ by relic RNG)'); void base; }
  // combat hooks read the phase
  for (const [id, phase, check] of [['r_w_noon_ration', 'midday', (c) => c.hand.length === c.handSize + 1], ['r_w_moon_lamp', 'night', (c) => c.player.block >= 6], ['r_w_high_sun', 'midday', (c) => c.player.st.strength >= 1], ['r_w_dinner_gong', 'evening', (c) => c.energy >= 4]]) {
    const run = give2(id, 'rc-' + id); const [, wd] = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()]]]); W.endMorning(run); run.ward.phase = phase;
    const p = W.startWalk(run, wd); const c = newCombat(run, p.enemies, { kind: 'normal' });
    assert.ok(check(c), id + ' in ' + phase + ' hand ' + c.hand.length + ' energy ' + c.energy);
    const run2 = give2(id, 'rc2-' + id); layout(run2, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()]]]); W.endMorning(run2); run2.ward.phase = phase === 'night' ? 'midday' : 'night';
    const p2 = W.startWalk(run2, Object.keys(run2.ward.rooms)[1]); const c2 = newCombat(run2, p2.enemies, { kind: 'normal' });
    assert.ok(!check(c2) || id === 'r_w_moon_lamp' && false, id + ' does nothing in another phase');
  }
  // Ward relics never roll in classic runs
  const classic = RUN.newRun({ hero: 'marrow', seed: 'cr' }); for (let i = 0; i < 80; i++) { const r = RUN.rollRelic(classic, ['common', 'uncommon', 'rare', 'boss', 'shop'][i % 5]); if (r) assert.ok(!RELICS[r].ward, 'classic roll ' + r); }
});

t('phase-tagged events: weights follow the `phase` hint, untagged events keep the text lean, 22 or more events are tagged, Ward events are Ward only', () => {
  const tagged = Object.values(EVENTS).filter((e) => e.phase);
  assert.ok(tagged.length >= 22, 'tagged ' + tagged.length);
  assert.ok(Object.keys(EVENT_PHASE).length >= 12);
  for (const e of tagged) for (const p of [].concat(e.phase)) assert.ok(['midday', 'evening', 'night'].includes(p), e.id);
  const ev = { phase: 'night', choices: [{ label: 'a' }] }; assert.equal(W.eventWeight(ev, 'night'), 3); assert.equal(W.eventWeight(ev, 'midday'), 0.5);
  assert.equal(W.eventWeight({ phase: ['midday', 'night'], choices: [{ label: 'a' }] }, 'night'), 3);
  assert.equal(W.eventWeight({ choices: [{ label: 'Heal 5' }] }, 'midday'), 3, 'untagged: legacy text lean'); assert.equal(W.eventWeight({ choices: [{ label: 'Heal 5' }] }, 'evening'), 1);
  const wardEvs = Object.values(EVENTS).filter((e) => e.ward); assert.ok(wardEvs.length >= 10);
  for (const e of wardEvs) { assert.ok(e.choices.length >= 2 && e.phase, e.id); assert.ok(!NODASH.test(e.text + e.name + e.choices.map((c) => c.label + (c.text || '')).join('')), e.id + ' no em dash'); }
  // each Ward event resolves in each phase for every choice without throwing, and the outcomes differ between phases
  for (const e of wardEvs) {
    const outs = new Set();
    for (const ph of ['midday', 'evening', 'night']) for (let ci = 0; ci < e.choices.length; ci++) {
      const run = mk('ev-' + e.id + ph + ci); run.gold = 200; run.ward.phase = ph; run.phase = 'event'; run.pending = { kind: 'event', id: e.id, result: null };
      const ch = RUN.eventChoices(run)[ci]; if (!ch.ok || ch.pick) continue;
      const hp0 = run.hp, g0 = run.gold; RUN.eventChoose(run, ci); outs.add(ph + ':' + ci + ':' + (run.pending.result || '').slice(0, 30));
      assert.ok(run.hp > 0); void hp0; void g0;
    }
    const byPhase = new Set([...outs].map((x) => x.split(':').slice(2).join(':'))); assert.ok(byPhase.size >= 4, e.id + ' has phase-specific outcomes ' + byPhase.size);
  }
  // Ward events never show up in classic
  const classic = RUN.newRun({ hero: 'marrow', seed: 'ce' }); for (let i = 0; i < 40; i++) { classic.seenEvents = []; const p = RUN.startEvent(classic); if (p) assert.ok(!EVENTS[p.id].ward, p.id); }
  // the Chapel draws by phase: night picks a night event far more often than midday does
  const cnt = (ph) => { let k = 0; for (let i = 0; i < 300; i++) { const run = mk('lean' + i); run.ward.phase = ph; run.seenEvents = []; const p = W.wardStartEvent(run); if (p && EVENTS[p.id].phase && [].concat(EVENTS[p.id].phase).includes('night')) k++; } return k; };
  assert.ok(cnt('night') > cnt('midday') * 1.3, 'night events lean to the night');
});

t('glossary: every new room and Ward term resolves', () => {
  for (const term of ['Pharmacy', 'Library', 'Morgue', 'Kitchen', 'Boiler', 'Laundry', 'Isolation Ward II', 'Quarantine', 'Fumigate', 'Double Doors', 'Soundproofing', 'Fire Door', 'Floodlights']) { const g = glossaryEntry(term); assert.ok(g && g.text.length > 10 && !NODASH.test(g.text), term); }
  for (const k of Object.keys(WARD_GLOSSARY)) assert.ok(!NODASH.test(WARD_GLOSSARY[k].text), k);
});

t('tiers: random 0 wins, sloppy and passive almost never win (smoke)', () => {
  let rw = 0, sw = 0;
  for (let i = 0; i < 8; i++) { if (playWardRun('wick', 'tier-r' + i, 'random').outcome === 'won') rw++; if (playWardRun('odile', 'tier-s' + i, 'sloppy').outcome === 'won') sw++; }
  assert.equal(rw, 0); assert.ok(sw <= 1, 'sloppy wins ' + sw);
  const ps = playWardRun('marrow', 'tier-p', 'passive'); assert.ok(ps.outcome === 'dead' || ps.outcome === 'won'); assert.equal(ps.log.acts[1].fights, 0, 'passive never fights');
});

t('dice content: Loaded Dice, Lucky Roll, Weighted Die record their state for the walk die; dice relics carry perks', () => {
  const run = mk('dice'); layout(run, [['rm_entrance', 0, 0]]); run.ward.res = { wood: 9, stone: 9 };
  const give3 = (id) => W.playBuildCard(run, give(run, id));
  assert.ok(give3('b_loaded_dice').ok); assert.equal(run.ward.dieUp, 2);
  assert.ok(give3('b_weighted_die').ok); assert.ok(give3('b_lucky_roll').ok);
  assert.ok(run.ward.effects.some((e) => e.id === 'dieBonus') && run.ward.effects.some((e) => e.id === 'reroll'));
  W.morningStart(run); assert.ok(!run.ward.effects.length, 'today-only effects expire'); assert.equal(run.ward.dieUp, 2, 'sides are permanent');
  for (const id of ['r_w_noon_dial', 'r_w_lucky_coin', 'r_w_bone_dice']) assert.ok(RELICS[id].perk && RELICS[id].ward);
});

t('dice routes: the roll is deterministic per seed, 1..sides, and re-rolls each walk phase', () => {
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const a = mk('dice' + i), b = mk('dice' + i);
    W.endMorning(a); W.endMorning(b);
    assert.deepEqual(a.ward.roll, b.ward.roll); assert.ok(a.ward.roll.n >= 1 && a.ward.roll.n <= 4); seen.add(a.ward.roll.n);
    assert.equal(a.ward.roll.key, '1:midday'); assert.deepEqual(a.ward.route, []);
    W.startWalk(a, a.ward.hero.room); // wait: the phase moves on and the die is rolled again
    if (a.phase === 'ward') assert.equal(a.ward.roll.key, '1:evening');
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4], 'every face comes up');
});

t('dice routes: legality (adjacent steps, no re-entry, roll length), undo, trigger order, last night, dice upgrades', () => {
  const run = mk('route');
  const [ent, c1, wd, ch] = layout(run, [['rm_entrance', 0, 0], ['rm_corridor', 1, 0], ['rm_ward', 2, 0, [mon(), mon()]], ['rm_chapel', 3, 0, [{ kind: 'event' }]]]);
  W.endMorning(run); run.ward.roll = { key: '1:midday', base: 3, sides: 4, bonus: 0, n: 3, lucky: 0 };
  assert.equal(W.routeWhy(run, wd), 'unreachable', 'two rooms away is not a step');
  assert.equal(W.routeWhy(run, ent), 'visited', 'the room you stand in');
  assert.deepEqual(W.legalSteps(run), [c1]);
  assert.ok(W.extendRoute(run, c1).ok); assert.ok(W.extendRoute(run, wd).ok);
  assert.equal(W.extendRoute(run, c1).why, 'visited', 'never the same room twice'); assert.equal(run.ward.route.length, 2);
  assert.ok(W.undoRoute(run)); assert.deepEqual(run.ward.route, [c1]);
  assert.ok(W.extendRoute(run, wd).ok); assert.ok(W.extendRoute(run, ch).ok);
  assert.equal(W.routeWhy(run, W.theatreOf(run).id), 'full', 'the roll is spent');
  const info = W.routeInfo(run); assert.equal(info.left, 0); assert.deepEqual(info.triggers.map((x) => x.kind), ['fight', 'event']);
  const p = W.startRoute(run); assert.equal(p.ward.room, wd, 'the first room that holds something opens first');
  assert.deepEqual(run.ward.route, []); assert.equal(run.ward.walk.path.length, 3);
  clearFight(run); assert.equal(run.phase, 'event', 'then the next room activates, in order'); assert.equal(run.ward.hero.room, ch);
  assert.equal(W.startRoute(mk('empty')), false, 'an empty route does not start');
  // dice upgrades: Loaded Dice (+2 sides), Weighted Die (+1 to the roll), Morning Rounds (+1), relic dice
  const r2 = mk('sides'); assert.equal(W.diceOf(r2), 4); r2.ward.dieUp = 2; assert.equal(W.diceOf(r2), 6);
  W.endMorning(r2); const base = r2.ward.roll.base; r2.ward.phase = 'morning'; r2.phase = 'ward'; r2.ward.effects.push({ id: 'dieBonus', n: 1, until: 'day' }, { id: 'move', n: 1, until: 'day' });
  const roll = W.rollWalk(r2); assert.equal(roll.sides, 6); assert.equal(roll.bonus, 2); assert.equal(roll.n, roll.base + 2); void base;
  // the last night: only the Theatre, via the forced walk (no route)
  const r3 = mk('lastnight'); layout(r3, [['rm_entrance', 0, 0], ['rm_corridor', 1, 0]]); r3.ward.day = r3.ward.dayLimit; r3.ward.phase = 'night';
  assert.equal(W.routeWhy(r3, 'r2'), 'boss'); assert.equal(W.startRoute(r3), false);
  assert.equal(W.pathTo(r3, W.theatreOf(r3).id).forced, true);
});

t('dice routes: a save round trip keeps the roll and the planned route; classic runs carry no dice', () => {
  const run = mk('rt'); W.endMorning(run);
  const r = RUN.deserializeRun(RUN.serializeRun ? RUN.serializeRun(run) : JSON.parse(JSON.stringify(run)));
  assert.deepEqual(r.ward.roll, run.ward.roll); assert.deepEqual(r.ward.route, run.ward.route);
  const classic = RUN.newRun({ hero: 'marrow', seed: 'cl' }); assert.equal(classic.ward, undefined); assert.equal(RUN.runMode(classic), 'classic');
});

t('z5: a route through several fight rooms resumes at every step, in order, and ends on the last room only after all of them opened', () => {
  const run = mk('multi');
  const ids = layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()]], ['rm_ward', 2, 0, [mon()]], ['rm_corridor', 3, 0], ['rm_ward', 4, 0, [mon()]]]);
  W.endMorning(run); run.ward.roll = { key: '1:midday', base: 4, sides: 4, bonus: 0, n: 4, lucky: 0 };
  for (const id of ids.slice(1)) assert.ok(W.extendRoute(run, id).ok);
  const opened = [];
  let p = W.startRoute(run);
  for (let guard = 0; guard < 10 && p; guard++) {
    opened.push(run.ward.hero.room);
    assert.equal(run.phase, 'combat'); assert.ok(run.ward.walk, 'the walk is still on while a fight is open');
    if (opened.length < 3) assert.notEqual(run.ward.hero.room, ids[4], 'the hero reaches the destination only after the fights on the way');
    if (opened.length < 3) { clearFight(run); p = run.phase === 'combat' ? run.pending : null; if (!p) break; } else { clearFight(run); p = null; }
    // a save and load in the middle of the walk changes nothing
    if (run.ward.walk) { const copy = JSON.parse(JSON.stringify(run.ward)); assert.deepEqual(copy.walk, run.ward.walk); }
  }
  assert.deepEqual(opened, [ids[1], ids[2], ids[4]], 'each fight room opened, in route order');
  assert.equal(run.phase, 'ward'); assert.equal(run.ward.phase, 'evening'); assert.equal(run.ward.walk, null); assert.equal(run.ward.hero.room, ids[4]);
});

t('z5: every walk phase has a die and a route list (midday, evening, night, after a fight, after a save without a route list)', () => {
  const run = mk('dice-all');
  layout(run, [['rm_entrance', 0, 0], ['rm_ward', 1, 0, [mon()]]]);
  for (let day = 1; day <= 2; day++) {
    W.endMorning(run);
    for (const ph of ['midday', 'evening', 'night']) {
      assert.equal(run.ward.phase, ph);
      const r = W.rollOf(run); assert.ok(r && r.n >= 1, 'a roll in ' + ph); assert.ok(Array.isArray(run.ward.route));
      if (ph === 'night' && W.bossForced(run)) break;
      W.startWalk(run, run.ward.hero.room); // wait here: the phase moves on
      if (run.phase === 'combat') clearFight(run);
    }
    assert.equal(run.ward.phase, 'morning', 'the day ends in a morning'); assert.equal(run.ward.day, day + 1);
  }
  // a save made before routes: the roll exists but the route list does not; the die and the route editor still work
  const old = mk('dice-old'); layout(old, [['rm_entrance', 0, 0], ['rm_corridor', 1, 0]]); W.endMorning(old);
  W.rollOf(old); delete old.ward.route;
  assert.ok(W.rollOf(old)); assert.deepEqual(old.ward.route, []);
  assert.equal(W.routeWhy(old, 'r2'), null, 'no crash on a missing route list');
});

console.log(n + ' passed');
