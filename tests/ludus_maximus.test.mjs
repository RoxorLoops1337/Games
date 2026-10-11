// Ludus Maximus: logic tests (data, combat, fixtures, economy, save). Headless, no DOM.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus/data.js');
const LM = require('../ludus_maximus/sim.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const seeded = (s) => { let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
LM.setRandom(seeded(42));

// style pentagon: every style beats exactly two and loses to exactly two
for (const a of D.STYLE_IDS) {
  const beats = D.STYLE_IDS.filter((b) => LM.adv(a, b) > 0), loses = D.STYLE_IDS.filter((b) => LM.adv(a, b) < 0);
  ok(beats.length === 2 && loses.length === 2, `${a} beats 2 and loses to 2`);
  ok(LM.counters(a).length === 2, `${a} has 2 counters`);
}

// new game + first week
const S = LM.newGame({ name: 'Test', color: 0 });
ok(S.plots.filter(Boolean).length === 3 && LM.rosterCap(S) === 3, 'starts with 3 buildings, 3 beds');
const g = LM.makeGlad({ id: S.nextId++, style: 'murmillo', lvl: 1 }); g.act = 'str'; S.glads.push(g);
const before = g.st.str;
const rep = LM.weekTrain(S);
ok(g.st.str > before && rep.lines.length === 1, 'training raises the stat');
ok(g.en <= 100 && g.en >= 0, 'energy stays in range');

// combat always terminates and has a winner; stronger side wins mostly
let strongWins = 0;
for (let i = 0; i < 20; i++) {
  const a = LM.makeGlad({ style: 'hoplomachus', lvl: 10 }), b = LM.makeGlad({ style: 'hoplomachus', lvl: 1 });
  const F = LM.quick(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}));
  ok(F.done && (F.winner === 'A' || F.winner === 'B'), 'fight finishes');
  if (F.winner === 'A') strongWins++;
}
ok(strongWins >= 17, `level 10 beats level 1 (${strongWins}/20)`);

// team fight 3v2 terminates
{
  const A = [0, 1, 2].map(() => LM.makeGlad({ lvl: 5 })), B = [0, 1].map(() => LM.makeGlad({ lvl: 5 }));
  const F = LM.quick(LM.mkUnits(A, 'A', LM.teamCtx(null, A)), LM.mkUnits(B, 'B', LM.teamCtx(null, B)));
  ok(F.done, 'team fight finishes');
}
// manual technique + focus work in a live fight
{
  const a = LM.makeGlad({ style: 'murmillo', lvl: 4 }), b = LM.makeGlad({ style: 'thraex', lvl: 4 });
  const F = LM.createFight(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}));
  for (let i = 0; i < 40; i++) LM.step(F, 0.25);
  ok(LM.useTech(F, 'A0', 0) === true || F.done, 'signature technique can be fired once ready');
  LM.focus(F, 'A', 'B0'); ok(F.foc.A === 'B0', 'focus target set');
}

// odds are stable (seeded) and bounded; style advantage matters
{
  const a = LM.makeGlad({ style: 'murmillo', lvl: 5 }), b = LM.makeGlad({ style: 'thraex', lvl: 5 });
  const p1 = LM.odds(S, [a], [b]), p2 = LM.odds(S, [a], [b]);
  ok(p1 === p2 && p1 >= 0 && p1 <= 1, 'odds stable and within 0..1');
}

// fixtures are deterministic, scale with league and have bracket events on schedule
{
  const e1 = LM.events(S, 4, 0), e2 = LM.events(S, 4, 0);
  ok(e1.length === e2.length && e1[0].opps[0].name === e2[0].opps[0].name && e1[0].opps[0].st.str === e2[0].opps[0].st.str, 'fixtures deterministic');
  ok(e1.some((e) => e.kind === 'tourney' && e.opps.length === 3), 'week 4 has a 4-player tournament');
  ok(LM.events(S, 12, 1).some((e) => e.kind === 'grand' && e.opps.length === 7), 'week 12 has an 8-player grand games');
  ok(LM.events(S, 2, 2).some((e) => e.kind === 'team' && e.opps.length === 3), 'colosseum team clash is 3v3');
  ok(LM.events(S, 1, 3)[0].opps[0].lvl > LM.events(S, 1, 0)[0].opps[0].lvl, 'higher leagues field higher levels');
}

// entering, withdrawing, fee refund
{
  const ev = LM.events(S, S.week, 0)[0]; const gold = S.gold;
  ok(LM.enter(S, ev, [g.id], 'bal') === '' && S.gold === gold - ev.fee, 'enter pays the fee');
  ok(LM.enter(S, LM.events(S, S.week, 0)[1], [g.id]) !== '', 'a fighter cannot be in two events a week');
  LM.withdraw(S, ev.key); ok(S.gold === gold && !S.entries[ev.key], 'withdraw refunds');
}

// settlement pays out, grants xp, tracks rivals
{
  const ev = LM.events(S, S.week, 0)[1]; const gold = S.gold, xp = g.xp, lvl = g.lvl;
  const r = LM.settle(S, ev, [g], { win: true, hype: 60, hpf: { [g.id]: 0.5 }, odds: 0.3 });
  ok(S.gold > gold && r.gold > 0 && S.fame > 0, 'win pays gold and fame');
  ok(g.xp > xp || g.lvl > lvl, 'win grants xp');
  ok(S.rivals[ev.opps[0].rv].last === 'w' && S.stats.wins === 1, 'rival record kept');
}

// tournament bracket plays to a champion or elimination
{
  const ev = LM.events(S, 4, 0).find((e) => e.kind === 'tourney'); const hero = LM.makeGlad({ id: 99, lvl: 30 });
  const T = LM.tourneyInit(S, ev, hero); let champ = false, rounds = 0;
  for (; rounds < 5; rounds++) { const o = LM.tourneyOpp(T); ok(!!o && o !== hero, 'bracket gives an opponent'); const r = LM.tourneyAdvance(S, T, true); if (r.champion) { champ = true; break; } }
  ok(champ && rounds === 1 && LM.placeOf(T, true) === 1, 'level 30 wins a 4-player bracket in 2 rounds');
  const T2 = LM.tourneyInit(S, ev, hero); LM.tourneyAdvance(S, T2, false); ok(LM.placeOf(T2, false) === 3, 'semifinal loss = place 3');
}

// gear: generation, equip changes derived stats, merge, sets
{
  const w = LM.genItem(null, { slot: 'weapon', rar: 3, ilvl: 10 });
  ok(w.af.length === 2 && w.st.atk > 0, 'epic weapon has atk and 2 affixes');
  const h = LM.makeGlad({ lvl: 5 }); const d0 = LM.derive(h, {}).atk; h.gear.weapon = w; ok(LM.derive(h, {}).atk > d0, 'equipped weapon raises atk');
  const items = [0, 1, 2].map(() => LM.genItem(null, { rar: 1, ilvl: 3 })); S.items.push(...items); S.plots[7] = { b: 'forge', l: 1 }; S.gold = 999;
  const m = LM.merge(S, items); ok(m.item && m.item.rar === 2 && !S.items.some((i) => items.includes(i)), 'merge 3 fine -> 1 rare');
  const sg = LM.makeGlad({ lvl: 5 }); D.SLOTS.slice(0, 2).forEach((s) => { const it = LM.genItem(null, { slot: s, rar: 2, ilvl: 5 }); it.set = 'mars'; sg.gear[s] = it; });
  ok(LM.derive(sg, {}).sets.some((x) => x.id === 'mars'), '2-piece set bonus activates');
}

// buildings, adjacency, week finish, contracts, save roundtrip
{
  ok(LM.synAt(S, 5) >= 1, 'barracks next to kitchen has synergy');
  S.gold = 5000; ok(LM.build(S, 0, 'bath') === 'Needs 15 fame' || S.fame >= 15, 'fame gates buildings');
  const w0 = S.week; const fin = LM.weekFinish(S); ok(S.week === w0 + 1 && fin.upkeep >= 0, 'week advances');
  ok(S.contracts.length === 3, 'three sponsors always on offer');
  const S2 = JSON.parse(JSON.stringify(S)); ok(LM.eventByKey(S2, '5:0:d0').opps.length === 1, 'state survives JSON roundtrip');
  const code = LM.exportCode(S); ok(LM.importCode(code).week === S.week, 'export/import code roundtrip');
  const N = LM.ascend(S); ok(N.week === 1 && N.laurels >= 0 && N.ascensions === 1 && N.glads.length === 0, 'ascend resets the ludus');
}


// stance triangle, tells, bookmaker, pit, ghosts
{
  ok(LM.stanceBeat('agg', 'cun') === 1 && LM.stanceBeat('cun', 'grd') === 1 && LM.stanceBeat('grd', 'agg') === 1, 'stance triangle: agg>cun>grd>agg');
  ok(LM.stanceBeat('agg', 'grd') === -1 && LM.stanceBeat('bal', 'agg') === 0, 'balanced is neutral');
  ok(LM.teamCtx(null, [LM.makeGlad({})], 'agg', 'cun').beat === 1, 'teamCtx reports stance advantage');
  const o = LM.events(S, 3, 0)[0].opps[0];
  ok(LM.habit(o).fav === LM.habit(o).fav && LM.habit(o).p >= 0.5 && LM.habit(o).p <= 0.75, 'rival habits deterministic');
  let fav = 0; for (let i = 0; i < 200; i++) if (LM.oppStance(S, o) === LM.habit(o).fav) fav++;
  ok(fav > 90, `rivals usually pick their favorite stance (${fav}/200)`);
  const a = LM.makeGlad({ style: 'murmillo', lvl: 5 }), b = LM.makeGlad({ style: 'thraex', lvl: 5 });
  ok(LM.wagerMult([b], [a]) > LM.wagerMult([a], [b]), 'bookmaker pays more on the style underdog');
  ok(LM.wagerMult([LM.makeGlad({ lvl: 30 })], [LM.makeGlad({ lvl: 1 })]) === 1.1, 'heavy favorite pays the minimum');
  const op = LM.pitOpp(S, 5, a); ok(op.lvl > LM.pitOpp(S, 1, a).lvl && op.nick === 'the Pit Lord', 'pit gets harder and floor 5 is a boss');
  const bc = LM.boonCtx([D.BOONS.find((x) => x.id === 'edge'), D.BOONS.find((x) => x.id === 'thirst')]);
  ok(bc.syn.atk === 0.12 && bc.xfx.vamp === 2, 'boons aggregate');
  ok(LM.derive(a, { xfx: { thorns: 3 } }).fx.thorns === 3, 'extra effects reach combat stats');
  const r0 = LM.pitReward(S, 6, [], false), r1 = LM.pitReward(S, 6, [], true);
  ok(r0.gold > 0 && r1.gold <= r0.gold / 2 + 1 && r0.items.length >= 2, 'pit rewards scale; defeat halves them');
  const old = LM.newGame({ name: 'Old' }); const champ = LM.makeGlad({ id: 5, lvl: 12 }); old.glads.push(champ); old.fame = 2000;
  const nxt = LM.ascend(old); ok(nxt.ghosts.length === 1 && nxt.ghosts[0].lud === 'Ghost of Old', 'ascend keeps old champions as ghosts');
  let seen = false; for (let w = 1; w < 40 && !seen; w++) for (const e of LM.events(nxt, w, 1)) if (e.opps[0].gh) seen = true;
  ok(seen, 'ghosts show up as hard-duel opponents');
}

console.log(`ludus_maximus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
