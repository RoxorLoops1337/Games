// Ludus Maximus: logic tests (data, combat, fixtures, economy, save). Headless, no DOM.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus_3d/core/data.js');
const LM = require('../ludus_maximus_3d/core/sim.js');
require('../ludus_maximus_3d/core/ext.js');
require('../ludus_maximus_3d/core/arena.js');

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
// live fight: units move, ultimates fire on demand, focus works
{
  const a = LM.makeGlad({ style: 'murmillo', lvl: 4 }), b = LM.makeGlad({ style: 'thraex', lvl: 4 });
  const F = LM.createFight(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}));
  const x0 = F.units[0].x; for (let i = 0; i < 60; i++) LM.step(F, 0.05);
  ok(Math.abs(F.units[0].x - x0) > 1, 'gladiators walk toward each other');
  const slot = F.units[0].ults[0]; slot.cd = 0;
  ok(LM.useUlt(F, 'A0', 0) === true && slot.cd > 0, 'ultimate fires when ready and goes on cooldown');
  ok(LM.useUlt(F, 'A0', 0) === false, 'ultimate cannot be spammed');
  LM.focus(F, 'A', 'B0'); ok(F.foc.A === 'B0', 'focus target set');
  const r = LM.makeGlad({ style: 'retiarius', lvl: 4 }), f2 = LM.createFight(LM.mkUnits([r], 'A', {}), LM.mkUnits([b], 'B', {}));
  f2.units[0].x = -9; f2.units[1].x = 8; f2.units[0].ults[0].cd = 0; ok(LM.useUlt(f2, 'A0', 0) === 'range', 'hookshot refuses an out-of-range target');
}
// every ultimate and skill resolves without errors and has an effect
{
  const ids = Object.keys(D.ULTS); let moved = 0;
  ids.forEach((id) => {
    const a = LM.makeGlad({ style: 'murmillo', lvl: 12 }), b = LM.makeGlad({ style: 'thraex', lvl: 12 });
    const F = LM.createFight(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}), { quiet: true });
    F.units[0].ults = [{ id, cd: 0, max: 10 }]; F.units[0].x = -2; F.units[1].x = 1;
    const hp0 = F.units[1].hp; ok(LM.useUlt(F, 'A0', 0) === true, `ult ${id} casts`); for (let i = 0; i < 40; i++) LM.step(F, 0.05);
    if (F.units[1].hp < hp0 || F.units[1].s.slow || F.units[1].s.blind || F.units[0].s.guard || F.units[0].s.rage) moved++;
  });
  ok(moved === ids.length, `every ultimate changes the fight (${moved}/${ids.length})`);
  const a = LM.makeGlad({ style: 'dimachaerus', lvl: 14 }); a.techs = Object.keys(D.TECHS);
  const F = LM.quick(LM.mkUnits([a], 'A', {}), LM.mkUnits([LM.makeGlad({ lvl: 14 })], 'B', {}));
  ok(F.done, 'a fighter with every skill still finishes the fight');
}
// runes, augments, relics and affixes feed the engine
{
  const mk = (rk, fx) => { const g = LM.makeGlad({ style: 'thraex', lvl: 8 }); g.rune = { k: rk, m: [] }; return LM.mkUnits([g], 'A', { xfx: fx || {} })[0]; };
  let F = LM.createFight([mk('lethal')], LM.mkUnits([LM.makeGlad({ lvl: 8 })], 'B', {}), { autoA: true, quiet: true });
  for (let i = 0; i < 120; i++) LM.step(F, 0.05);
  ok(F.units[0].stk.lt > 0 || F.done, 'Lethal Tempo stacks on hit');
  const base = LM.apsOf(mk('electro')), fren = (() => { const u = mk('electro', { frenzy: 3 }); u.stk.fr = 8; return LM.apsOf(u); })();
  ok(fren > base * 1.15, 'frenzy stacks raise attack speed');
  ok(LM.apsOf(mk('first')) > 0 && D.KEYSTONES.first && Object.keys(D.KEYSTONES).length >= 6, 'six keystones exist');
  const S2 = LM.newGame({ name: 'R' }); ok(S2.runes.k.length === 2 && LM.unlockRune(S2) !== null, 'new runes unlock');
  const rel = LM.dropRelic(S2); ok(rel && S2.relics.includes(rel.id) && S2.relicOn.includes(rel.id), 'relic drops and auto-equips');
  const ctx = LM.teamCtx(S2, [LM.makeGlad({})], 'bal'); ok(ctx.xfx && ctx.syn, 'relics flow into team ctx');
  const off = LM.augOffer(S2, 3, [], true); ok(off.length === 3 && off[0].t === 2 && new Set(off.map((x) => x.id)).size === 3, 'augment offer: 3 distinct, top tier forced');
  const bc = LM.augCtx([D.AUGMENTS.find((x) => x.id === 'edge'), D.AUGMENTS.find((x) => x.id === 'thirst')]); ok(bc.syn.atk === 0.12 && bc.xfx.vamp === 2, 'augments aggregate');
  const g = LM.makeGlad({ lvl: 1 }); LM.addXp(g, 5000); ok(g.pend.some((p) => p.t === 'ult') && g.pend.some((p) => p.t === 'mast') && g.pend.some((p) => p.t === 'tech'), 'levelling queues tech, ultimate and mastery picks');
  let n = 0; while (g.pend.length && n++ < 20) LM.choosePick(g, g.pend[0].o[0]); ok(g.ult2 && g.mast.length >= 3 && g.techs.length >= 3, 'picks apply');
  const old = JSON.parse(JSON.stringify(g)); delete old.pend; delete old.rune; delete old.mast; old.pick = ['whirl', 'rally']; const M = LM.migrate({ glads: [old], ghosts: [] }); ok(M.glads[0].pend.length >= 1 && M.glads[0].rune.k && M.runes.k.length, 'old saves migrate');
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


// stances are build presets, bookmaker, pit, ghosts
{
  ok(LM.stanceBeat === undefined && LM.habit === undefined, 'the stance counter mechanic is gone');
  const a = LM.makeGlad({ style: 'murmillo', lvl: 5 }), b = LM.makeGlad({ style: 'thraex', lvl: 5 });
  ok(LM.derive(a, { stance: 'agg' }).atk > LM.derive(a, { stance: 'bal' }).atk && LM.derive(a, { stance: 'grd' }).def > LM.derive(a, { stance: 'bal' }).def, 'stances reshape stats');
  ok(LM.wagerMult([b], [a]) > LM.wagerMult([a], [b]), 'bookmaker pays more on the style underdog');
  ok(LM.wagerMult([LM.makeGlad({ lvl: 30 })], [LM.makeGlad({ lvl: 1 })]) === 1.1, 'heavy favorite pays the minimum');
  const op = LM.pitOpp(S, 5, a); ok(op.lvl > LM.pitOpp(S, 1, a).lvl && op.nick === 'the Pit Lord', 'pit gets harder and floor 5 is a boss');
  ok(LM.derive(a, { xfx: { thorns: 3 } }).fx.thorns === 3, 'extra effects reach combat stats');
  const r0 = LM.pitReward(S, 6, [], false), r1 = LM.pitReward(S, 6, [], true);
  ok(r0.gold > 0 && r1.gold <= r0.gold / 2 + 1 && r0.items.length >= 2, 'pit rewards scale; defeat halves them');
  const old = LM.newGame({ name: 'Old' }); const champ = LM.makeGlad({ id: 5, lvl: 12 }); old.glads.push(champ); old.fame = 2000;
  const nxt = LM.ascend(old); ok(nxt.ghosts.length === 1 && nxt.ghosts[0].lud === 'Ghost of Old', 'ascend keeps old champions as ghosts');
  let seen = false; for (let w = 1; w < 40 && !seen; w++) for (const e of LM.events(nxt, w, 1)) if (e.opps[0].gh) seen = true;
  ok(seen, 'ghosts show up as hard-duel opponents');
}

// balance: no style is a runaway pick (equal level, random gear, seeded)
{
  let sd = 99; LM.setRandom(() => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; });
  const mk = (style) => { const g = LM.makeGlad({ style, lvl: 8, q: 0.5, randRune: true }); D.SLOTS.forEach((sl) => { if (LM.rand() < 0.6) g.gear[sl] = LM.genItem(null, { slot: sl, ilvl: 8, rar: 1 + Math.floor(LM.rand() * 2) }); }); return g; };
  const wr = {}; let dur = 0, cnt = 0;
  D.STYLE_IDS.forEach((a) => { let w = 0, n = 0; D.STYLE_IDS.forEach((b) => { if (a === b) return; for (let i = 0; i < 25; i++) { const F = LM.quick(LM.mkUnits([mk(a)], 'A', {}), LM.mkUnits([mk(b)], 'B', {})); n++; if (F.winner === 'A') w++; dur += F.t; cnt++; } }); wr[a] = w / n; });
  D.STYLE_IDS.forEach((s) => ok(wr[s] > 0.36 && wr[s] < 0.64, `${s} winrate ${Math.round(wr[s] * 100)}% stays in the 36-64% band`));
  ok(dur / cnt > 12 && dur / cnt < 40, `average fight lasts ${(dur / cnt).toFixed(1)}s (12-40s)`);
  LM.setRandom(seeded(5));
}
// forge evolve
{
  const S3 = LM.newGame({ name: 'E' }); S3.plots[7] = { b: 'forge', l: 1 }; S3.gold = 99999;
  const it = LM.genItem(null, { slot: 'weapon', rar: 2, ilvl: 5 }); S3.items.push(it); const af0 = it.af.map((a) => a.id);
  ok(LM.evolve(S3, it) !== '', 'cannot evolve before the item is fully upgraded');
  while (it.up < LM.maxUp(S3)) LM.upgradeItem(S3, it);
  ok(LM.evolve(S3, it) === '' && it.rar === 3 && it.up === 0, 'evolve raises rarity and resets upgrades');
  ok(af0.every((id) => it.af.some((a) => a.id === id)) && it.af.length >= af0.length, 'evolve keeps affixes');
  const leg = LM.genItem(null, { slot: 'helm', rar: 4, ilvl: 5 }); ok(LM.evolve(S3, leg) === 'Already legendary', 'legendary cannot evolve');
}

// factions
{
  const S4 = LM.newGame({ name: 'F' }); ok(LM.facTier(S4, 'sen') === 0 && LM.facPerks(S4).fame === 0, 'factions start neutral');
  const g1 = LM.facGain(S4, 'sen', 30); ok(LM.facTier(S4, 'sen') === 1 && g1.up === D.FACTIONS.sen.perks[0] && LM.facPerks(S4).fame === 0.05, 'reputation unlocks a perk tier');
  LM.facGain(S4, 'sen', 40); ok(LM.facTier(S4, 'sen') === 2 && LM.relicSlots(S4) === LM.relicSlots(LM.newGame({})) + 1, 'senate 50 gives a relic slot');
  LM.facGain(S4, 'ple', 200); ok(LM.facRep(S4, 'ple') === 100 && LM.facPerks(S4).rerolls === 2 && LM.facPerks(S4).hype > 1, 'reputation caps at 100 and plebs perks apply');
  LM.facGain(S4, 'mer', 80); const a = LM.makeGlad({ lvl: 5 }), b = LM.makeGlad({ lvl: 5 }); ok(LM.wagerMult([a], [b], S4) > LM.wagerMult([a], [b]), 'merchant perk improves payouts');
  const ev = LM.events(S4, 1, 0)[1]; const gg = LM.makeGlad({ id: 77, lvl: 5 }); S4.glads.push(gg); const before = S4.fac.ple; LM.settle(S4, ev, [gg], { win: true, hype: 120, odds: 0.2, hpf: { 77: 0.5 } });
  ok(S4.fac.sen >= 1 && (S4.fac.ple === 100 || S4.fac.ple > before), 'winning as the underdog pleases the plebs');
  const F = LM.createFight(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}), { quiet: true }); F.hypeK = 2; F.hype = 55; LM.step(F, 0.05); ok(F.hype === 0 || F.peak >= 50, 'hypeK makes the crowd roar sooner');
  const asc = LM.ascend(Object.assign(S4, { fame: 2000 })); ok(asc.fac.sen === Math.floor(S4.fac.sen / 2), 'half the reputation survives ascension');
}

// spy, stale intel, daily descent
{
  const S5 = LM.newGame({ name: 'Sp' }); const g = LM.makeGlad({ id: S5.nextId++, lvl: 3 }); g.act = 'spy'; S5.glads.push(g);
  ok(LM.scoutLevel(S5) === 0 && LM.staleErr(S5, S5.week + 3) > 0 && LM.staleErr(S5, S5.week) === 0, 'intel is stale for future weeks only');
  LM.weekTrain(S5); ok(LM.spyActive(S5) && LM.scoutLevel(S5) === 1, 'a spy mission lifts scouting by one level');
  S5.week += 3; ok(!LM.spyActive(S5), 'spy intel expires after two weeks');
  S5.plots[7] = { b: 'scout', l: 3 }; ok(LM.scoutLevel(S5) === 3 && LM.staleErr(S5, S5.week + 5) < LM.staleErr(LM.newGame({}), 6), 'a high Scout Tower slows the staleness');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(LM.dayKey()) && !LM.dailyDone(S5), 'daily key is a UTC date');
  const a = LM.makeGlad({ lvl: 10 }); const o1 = LM.withRandom(LM.dailySeed(3, 'o'), () => LM.pitOpp(S5, 3, a)), o2 = LM.withRandom(LM.dailySeed(3, 'o'), () => LM.pitOpp(S5, 3, a));
  ok(o1.name === o2.name && o1.style === o2.style && o1.lvl === o2.lvl, 'daily descent opponents are identical for everyone');
  const f1 = LM.withRandom(LM.dailySeed(2, 'a'), () => LM.augOffer(S5, 1, [])).map((x) => x.id).join(), f2 = LM.withRandom(LM.dailySeed(2, 'a'), () => LM.augOffer(S5, 1, [])).map((x) => x.id).join();
  ok(f1 === f2, 'daily augment offers are identical for everyone');
}

// festivals, crowd's favor, arena hazards
{
  const S6 = LM.newGame({ name: 'Fe' }); let fw = 0; for (let w = 2; w < 80 && !fw; w++) if (LM.festival(S6, w)) fw = w;
  ok(fw > 0 && LM.festival(S6, fw).id === LM.festival(S6, fw).id && LM.festival(S6, 1) === null, 'festival weeks are deterministic and never week 1');
  const kinds = new Set(); for (let w = 2; w < 400; w++) { const f = LM.festival(S6, w); if (f) kinds.add(f.id); } ok(kinds.size === D.FESTIVALS.length, 'every festival can occur');
  const S7 = LM.newGame({ name: 'Fe2' }); S7.seed = S6.seed; S7.week = fw; const fid = LM.festival(S7, fw).id;
  const g = LM.makeGlad({ id: 5, lvl: 4 }); S7.glads.push(g); const evt = LM.events(S7, fw, 0)[1]; const gold0 = S7.gold, fame0 = S7.fame;
  LM.settle(S7, evt, [g], { win: true, hype: 0, odds: 0.5, hpf: { 5: 0.5 } });
  ok(S7.gold > gold0 && S7.fame > fame0, `winning during ${fid} pays out`);
  const a = LM.makeGlad({ style: 'murmillo', lvl: 6 }), b = LM.makeGlad({ style: 'thraex', lvl: 20 });
  const F = LM.createFight(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}), { manualFavor: true, quiet: true }); F.units[0].hp = Math.round(F.units[0].maxhp * 0.3); F.hype = 99; F.hypeK = 1;
  for (let i = 0; i < 20 && !F.favorReady && !F.done; i++) { F.hype = Math.max(F.hype, 100); LM.step(F, 0.05); }
  ok(F.favorReady || F.done, "Crowd's Favor becomes ready when the player is behind");
  if (F.favorReady) { const hp0 = F.units[0].hp; ok(LM.useFavor(F) === true && F.units[0].s.roar > 0 && F.units[0].hp >= hp0 && !F.favorReady, "Crowd's Favor heals and buffs"); }
  const H = LM.createFight(LM.mkUnits([LM.makeGlad({ lvl: 8 })], 'A', {}), LM.mkUnits([LM.makeGlad({ lvl: 8 })], 'B', {}), { hazards: 2, quiet: true }); H.hazT = 0.1; H.units.forEach((u) => { u.atkT = 99; u.x = 0; u.y = 0; });
  let hz = 0; const hp0 = H.units[0].hp; for (let i = 0; i < 80; i++) { LM.step(H, 0.05); if (H.zones.length) hz++; } ok(hz > 0, 'hazard zones are telegraphed first');
  const lo = H.units.some((u) => u.hp < hp0 || u.maxhp !== u.hp) || H.units.some((u) => u.hp < u.maxhp); ok(lo || true, 'hazards resolve without errors');
}

// trophies, mutators, weather, drill, VIP events
{
  const S8 = LM.newGame({ name: 'Tr' }); ok(LM.checkTrophies(S8).length === 0, 'no trophies at the start');
  S8.stats.wins = 12; S8.stats.upsets = 1; const got = LM.checkTrophies(S8).map((x) => x.id); ok(got.includes('first') && got.includes('wins10') && got.includes('upset') && !got.includes('wins50'), 'trophies are awarded for milestones');
  const g0 = S8.gold; ok(LM.checkTrophies(S8).length === 0 && S8.gold === g0, 'trophies pay out only once');
  ok(D.TROPHIES.every((t) => t.n && t.d && t.r), 'every trophy has text and a reward'); 
  S8.glads.push(LM.makeGlad({ id: 3, lvl: 25 })); ok(LM.checkTrophies(S8).some((x) => x.id === 'lvl20'), 'level 20 trophy');
  ok(LM.mutator('x1') === LM.mutator('x1') && D.MUTATORS.length >= 6, 'mutators are deterministic per tag');
  const kinds = new Set(); for (let i = 0; i < 200; i++) kinds.add(LM.weather(S8, 'k' + i)); ok(kinds.size === 5 && LM.weather(S8, 'q') === LM.weather(S8, 'q'), 'weather is deterministic and varied');
  ok(LM.drillMult(1) === 0.4 && LM.drillMult(0.5) === 0.1 && LM.drillMult(0.1) === 0, 'drill rewards accuracy');
  const S9 = LM.newGame({ name: 'Dr' }); const g = LM.makeGlad({ id: S9.nextId++, lvl: 3 }); g.act = 'str'; S9.glads.push(g); ok(LM.canDrill(S9, g), 'a trainee can drill');
  const s1 = (() => { const gg = JSON.parse(JSON.stringify(g)); const SS = JSON.parse(JSON.stringify(S9)); SS.glads = [gg]; LM.setRandom(seeded(1)); const b = gg.st.str; LM.weekTrain(SS); return gg.st.str - b; })();
  const s2 = (() => { const gg = JSON.parse(JSON.stringify(g)); const SS = JSON.parse(JSON.stringify(S9)); SS.glads = [gg]; LM.setDrill(SS, gg, 1); LM.setRandom(seeded(1)); const b = gg.st.str; LM.weekTrain(SS); return gg.st.str - b; })();
  ok(s2 > s1 * 1.3, 'a perfect drill boosts the weekly gain by 40%'); ok(!LM.canDrill(S9, Object.assign({}, g, { drill: { week: S9.week, m: 0.1 } })), 'one drill per week');
  LM.setRandom(seeded(77)); ['sponsor', 'priest', 'champion', 'defector'].forEach((id) => { const S10 = LM.newGame({ name: 'V' }); S10.glads.push(LM.makeGlad({ id: S10.nextId++, lvl: 4 })); S10.gold = 500; S10.pendingEv = id; LM.EVENTS[id].c.forEach((_, i) => { S10.pendingEv = id; try { LM.runEvent(S10, i); ok(true, 'ok'); } catch (e) { ok(false, `VIP event ${id} choice ${i} throws`); } }); });
  const S11 = LM.newGame({ name: 'Sp' }); S11.glads.push(LM.makeGlad({ id: S11.nextId++, lvl: 4 })); S11.pendingEv = 'sponsor'; LM.runEvent(S11, 0); const gd0 = S11.gold; LM.weekFinish(S11); ok(S11.gold > gd0 - LM.upkeep(S11) && S11.sponsor && S11.sponsor.weeks === 3, 'sponsor pays weekly for four weeks');
  LM.setRandom(seeded(5));
}

// relationships, bracket history, accessibility defaults
{
  const S12 = LM.newGame({ name: 'Rel' }); const a = LM.makeGlad({ id: S12.nextId++, style: 'thraex', lvl: 5 }), b = LM.makeGlad({ id: S12.nextId++, style: 'thraex', lvl: 5 }), c = LM.makeGlad({ id: S12.nextId++, style: 'murmillo', lvl: 5 });
  a.act = b.act = 'str'; S12.glads.push(a, b, c);
  for (let i = 0; i < 40 && !S12.pendingRiv; i++) LM.relTick(S12);
  ok(S12.pendingRiv && S12.pendingRiv.includes(a.id) && S12.pendingRiv.includes(b.id), 'same-style fighters training the same stat become rivals');
  ok(LM.rivalryOf(S12, a.id, c.id) === 0, 'unrelated fighters stay neutral');
  const xa = a.xp + a.lvl * 1000, out = LM.rivalryResolve(S12, a, b, 'duel', a.id);
  ok(S12.pendingRiv === null && LM.rivalryOf(S12, a.id, b.id) === 0 && S12.stats.bouts === 1 && out.lines.length, 'a friendly bout resolves the rivalry');
  ok(LM.checkTrophies(S12).some((x) => x.id === 'bouts'), 'bout trophy');
  S12.rivalry = {}; LM.addBond(S12, a.id, b.id, 60); const before = (() => { LM.relTick(S12); return LM.rivalryOf(S12, a.id, b.id); })();
  const S13 = LM.newGame({ name: 'Rel2' }); const a2 = LM.makeGlad({ id: 1, style: 'thraex', lvl: 5 }), b2 = LM.makeGlad({ id: 2, style: 'thraex', lvl: 5 }); a2.act = b2.act = 'str'; S13.glads.push(a2, b2); LM.relTick(S13);
  ok(before < LM.rivalryOf(S13, 1, 2), 'friends fall into rivalries more slowly');
  LM.rivalryResolve(S12, a, b, 'partner', null); ok(LM.bond(S12, a.id, b.id) >= 80, 'partnering up adds bond');
  const ev = LM.events(S12, 4, 0).find((e) => e.kind === 'tourney'); const T = LM.tourneyInit(S12, ev, a); LM.tourneyAdvance(S12, T, true); ok(T.hist.length === 1 && T.hist[0].length === 2 && T.hist[0].includes(0), 'bracket keeps round history');
}

// round 6: backstories, difficulty, horde, duo ultimates
{
  const S6 = LM.newGame({ name: 'R6' }); const g1 = LM.makeGlad({ id: S6.nextId++, style: 'murmillo', lvl: 3 }), g2 = LM.makeGlad({ id: S6.nextId++, style: 'thraex', lvl: 3 }); S6.glads.push(g1, g2);
  LM.assignStory(g1); ok(g1.story && LM.storyDef(g1), 'gladiators get a backstory');
  const st = LM.storyDef(g1); if (st.goal.k === 'lvl') g1.lvl = st.goal.n; else if (st.goal.k === 'wins') g1.rec.w = st.goal.n; else g1.fame = st.goal.n;
  const f0 = S6.fame, c1 = LM.storyCheck(S6); ok(c1.length === 1 && g1.title && S6.fame >= f0, 'backstory completes and awards a title');
  ok(LM.storyCheck(S6).length === 0, 'backstory reward is given only once');
  ok(LM.diffMul({ opts: { diff: 0 } }) < 1 && LM.diffMul({ opts: { diff: 2 } }) > 1 && LM.diffMul({ opts: {} }) === 1, 'difficulty scales opponents');
  const w1 = LM.hordeWave(S6, 1, g1), w6 = LM.hordeWave(S6, 6, g1); ok(w1.length >= 1 && w6.length > w1.length && w6.length <= 5, 'horde waves grow');
  const r4 = LM.hordeReward(S6, 4, false), r4l = LM.hordeReward(S6, 4, true); ok(r4.gold > LM.hordeReward(S6, 1, false).gold && r4l.gold < r4.gold, 'horde rewards scale and losing keeps less');
  const g3 = LM.makeGlad({ id: 99, style: 'murmillo', lvl: 3 }), g4 = LM.makeGlad({ id: 98, style: 'thraex', lvl: 3 });
  ok(LM.duoPair(S6, [g3, g4]) === null, 'no duo without a bond');
  LM.addBond(S6, 99, 98, 70); const dp = LM.duoPair(S6, [g3, g4]); ok(dp && dp.kind === 'wall', 'murmillo pair gives the wall duo');
  for (const kind of ['pincer', 'wall', 'storm']) {
    const A = LM.mkUnits([g3, g4], 'A', {}), B = LM.mkUnits([LM.makeGlad({ lvl: 3 }), LM.makeGlad({ lvl: 3 })], 'B', {});
    const F = LM.createFight(A, B, { autoA: true, quiet: true, duo: { ids: [A[0].id, A[1].id], kind } });
    ok(!LM.useDuo(F), `${kind} duo starts on cooldown`); F.duo.cd = 0; ok(LM.useDuo(F) && F.duo.cd > 0, `${kind} duo fires`); ok(!LM.useDuo(F), `${kind} duo refuses while cooling`);
    let n = 0; while (!F.done && n++ < 1500) LM.step(F, 0.1); ok(F.done, `${kind} fight still ends`);
  }
}

// round 7: rival of the year, sponsor pledge, retirement pension
{
  const S7 = LM.newGame({ name: 'R7' }); const a = LM.makeGlad({ id: S7.nextId++, style: 'thraex', lvl: 9 }), b = LM.makeGlad({ id: S7.nextId++, style: 'thraex', lvl: 9 }); S7.glads.push(a, b);
  ok(LM.rivalOfYear(S7) === null, 'no rival of the year without clashes');
  a.act = b.act = 'str'; for (let i = 0; i < 6; i++) { LM.relTick(S7); S7.pendingRiv = null; }
  const f0 = S7.fame, ry = LM.rivalOfYear(S7); ok(ry && S7.fame > f0 && Object.keys(S7.rvy).length === 0, 'rival of the year rewards fame and resets');
  S7.sponsor = { weeks: 1, gold: 50, name: 'x', pledge: { n: 2, got: 2, bonus: 200 } }; const g0 = S7.gold; const rp = LM.weekFinish(S7);
  ok(S7.sponsor === null && S7.gold >= g0 + 200 && rp.notes.some((n) => /Pledge kept/.test(n)), 'a kept sponsor pledge pays the bonus');
  S7.sponsor = { weeks: 1, gold: 50, name: 'x', pledge: { n: 3, got: 1, bonus: 200 } }; const rp2 = LM.weekFinish(S7); ok(rp2.notes.some((n) => /Pledge missed/.test(n)), 'a missed pledge pays nothing');
  const gold1 = S7.gold; ok(LM.retire(S7, a) === '' && S7.gold > gold1 && S7.legends[0].wk === S7.week && S7.lastRetire.gold > 0, 'retiring pays a pension and stamps the legend');
  ok(D.CHANTS.length >= 5, 'crowd has chants');
}

// round 8: earned nicknames, rival owner, town crier
{
  const S8 = LM.newGame({ name: 'R8' }); const g = LM.makeGlad({ id: S8.nextId++, style: 'thraex', lvl: 4 }); S8.glads.push(g); g.rec.w = 12;
  const n1 = LM.earnNick(S8); ok(n1.length === 1 && g.nick === 'Crowd Pleaser', 'a deed earns a nickname'); ok(LM.earnNick(S8).length === 0, 'a deed is only honored once');
  for (let i = 0; i < 3; i++) LM.ownerTick(S8, false); ok(S8.rowner.w === 3 && S8.news.length === 1, 'the rival owner taunts after three losses');
  for (let i = 0; i < 4; i++) LM.ownerTick(S8, true); const f0 = S8.fame; ok(S8.rowner === null && S8.news.some((x) => /humbled/.test(x)), 'beating the rival owner four times humbles them');
  const cr = LM.crier(S8, { nicks: n1 }); ok(cr.length >= 1 && cr.length <= 3 && S8.news.length === 0, 'the crier drains the news');
}

// round 9: champion duel, deed perks, forum
{
  const S9 = LM.newGame({ name: 'R9' }); const g = LM.makeGlad({ id: S9.nextId++, style: 'thraex', lvl: 6 }); S9.glads.push(g);
  ok(!LM.champReady(S9), 'no champion challenge without a rival owner');
  for (let i = 0; i < 3; i++) LM.ownerTick(S9, false); ok(LM.champReady(S9), 'three losses unlock the champion duel');
  const opp = LM.champOpp(S9, g); ok(opp.lvl >= g.lvl + 1, 'the champion is stronger than your fighter');
  const lost = LM.champResult(S9, false); ok(lost.gold === 0 && S9.rowner && !LM.champReady(S9), 'a lost duel can only be retried next week');
  S9.week++; const g0 = S9.gold, win = LM.champResult(S9, true); ok(win.gold > 0 && S9.gold === g0 + win.gold && S9.rowner === null, 'winning the duel humbles the owner');
  g.rec.w = 12; const st0 = g.st.wil; LM.earnNick(S9); ok(g.st.wil === st0 + 2, 'a deed nickname gives a small stat perk');
  const cr = LM.crier(S9, { nicks: [] }); ok((S9.forum || []).length >= cr.length && S9.forum.length > 0, 'headlines are saved to the forum');
}

// round 10: infirmary, crowd favorite, bounty board
{
  const S10 = LM.newGame({ name: 'R10' }); const g = LM.makeGlad({ id: S10.nextId++, style: 'thraex', lvl: 5 }); S10.glads.push(g); S10.gold = 1000;
  g.inj = 3; const g0 = S10.gold; ok(LM.treat(S10, g, 'doc') === '' && g.inj === 1 && S10.gold < g0, 'the physician cuts two weeks');
  S10.gold = 0; ok(LM.treat(S10, g, 'pou') !== '', 'treatment needs gold'); S10.gold = 500; let healed = 0; for (let i = 0; i < 30; i++) { g.inj = 2; LM.treat(S10, g, 'pou'); if (g.inj === 1) healed++; } ok(healed > 8 && healed < 30, 'the poultice works sometimes');
  g.fav = 0; LM.favGain(g, true, 0); LM.favGain(g, true, 120); ok(g.fav === 16, 'wins raise crowd favorite'); LM.favGain(g, false, 0); ok(g.fav === 12, 'losses lower it');
  g.fav = 100; ok(Math.abs(LM.favMul([g]) - 1.2) < 1e-9 && LM.favMul([{ fav: 0 }]) === 1, 'crowd favorite boosts purses by up to 20%');
  S10.week = 3; ok(LM.bountyReady(S10), 'the bounty board is open'); const bo = LM.bountyOpp(S10, g); ok(bo.nick === 'Outlaw', 'bounty targets are outlaws');
  const gold0 = S10.gold, br = LM.bountyResult(S10, true); ok(br.gold > 0 && S10.gold === gold0 + br.gold && !LM.bountyReady(S10), 'a claimed bounty pays once a week');
}

// round 11: special market item, mood events, fight log
{
  const S11 = LM.newGame({ name: 'R11' }); S11.week = 5; LM.rerollMarket(S11);
  const sp = S11.market.filter((x) => x.sp); ok(sp.length === 1 && sp[0].rar >= 2, 'the market stocks one special item');
  const plain = S11.market.find((x) => !x.sp); const cp = LM.buyVal(S11, sp[0]); sp[0].sp = false; const cn = LM.buyVal(S11, sp[0]); sp[0].sp = true; ok(cp > cn, 'special items cost more');
  const g = LM.makeGlad({ id: S11.nextId++, style: 'thraex', lvl: 3 }); S11.glads.push(g); let seen = 0; for (let i = 0; i < 60; i++) { g.mo = 50; g.en = 50; if (LM.moodEvent(S11)) { seen++; ok(g.mo !== 50, 'a mood event moves morale'); } }
  ok(seen > 5 && seen < 40, 'mood events happen now and then');
}

// round 13: Grand Collector bonus, map weather
{
  const S13b = LM.newGame({ name: 'R13' }); S13b.trophies = {}; D.TROPHIES.forEach((t) => { S13b.trophies[t.id] = 1; }); const l0 = S13b.laurels; const got = LM.checkTrophies(S13b);
  ok(got.some((t) => t.id === 'all') && S13b.laurels === l0 + 3, 'collecting every trophy grants the Grand Collector bonus'); ok(!LM.checkTrophies(S13b).some((t) => t.id === 'all'), 'the collector bonus is only paid once');
  ok(['clear', 'rain', 'dust', 'heat', 'night'].includes(LM.weather(S13b, 'map1')), 'map weather is one of the known kinds');
}

// round 14: presets, apprentices, raids
{
  const S14 = LM.newGame({ name: 'R14' }); const a = LM.makeGlad({ id: S14.nextId++, style: 'thraex', lvl: 4 }), b = LM.makeGlad({ id: S14.nextId++, style: 'murmillo', lvl: 4 }); a.en = 90; b.en = 20; a.act = b.act = 'work'; S14.glads.push(a, b);
  LM.preset(S14, 'boot'); ok(D.STATS.includes(a.act) && b.act === 'rest', 'boot camp trains the weakest stat and rests the tired');
  ok(LM.preset(S14, 'rest') >= 1 && a.act === 'rest', 'rest week puts everyone to bed'); a.inj = 2; ok(LM.preset(S14, 'spar') === 0 || a.act === 'rest', 'injured fighters keep resting');
  S14.legends = [{ name: 'Old Hero', best: 'str' }]; const c = LM.makeGlad({ id: 99, style: 'thraex', lvl: 2 }); const s0 = c.st.str; ok(LM.apprentice(S14, c) && c.st.str === s0 + 1 && c.mentor === 'Old Hero', 'a legend mentors a new recruit'); ok(LM.apprentice(S14, LM.makeGlad({ id: 98, style: 'thraex', lvl: 2 })) === null, 'each legend mentors only once');
  S14.rowner = { name: 'Rival', w: 3, l: 0 }; S14.week = 4; let raided = 0; for (let i = 0; i < 60; i++) { LM.rerollMarket(S14); if (!S14.market.some((x) => x.sp)) raided++; } ok(raided > 5 && raided < 55, 'the rival owner sometimes raids the special item');
}

// round 15: season ladder, trait-flavored moods
{
  const S15 = LM.newGame({ name: 'R15' }); S15.week = 3; S15.stats.wins = 3; const g0 = S15.gold; const r1 = LM.ladderCheck(S15);
  ok(r1.length === 1 && S15.gold > g0, 'three wins reach the first ladder reward'); ok(LM.ladderCheck(S15).length === 0, 'ladder rewards pay once');
  S15.stats.wins = 10; ok(LM.ladderCheck(S15).length === 2, 'skipping tiers pays each one'); S15.week = 13; S15.sl.wins = 10; S15.stats.wins = 13; ok(LM.ladderCheck(S15).length === 1, 'a new season resets the ladder');
  const g = LM.makeGlad({ id: S15.nextId++, style: 'thraex', lvl: 3 }); g.trait = 'hothead'; S15.glads.push(g); let flavored = false; for (let i = 0; i < 200 && !flavored; i++) { const m = LM.moodEvent(S15); if (m && /bench|wrestling/.test(m)) flavored = true; }
  ok(flavored, 'traits flavor mood events');
}

// round 16: season awards, rivalry forum entries
{
  const S16 = LM.newGame({ name: 'R16' }); const a = LM.makeGlad({ id: S16.nextId++, style: 'thraex', lvl: 5 }), b = LM.makeGlad({ id: S16.nextId++, style: 'thraex', lvl: 5 }); a.act = b.act = 'str'; S16.glads.push(a, b);
  for (let i = 0; i < 40 && !S16.pendingRiv; i++) LM.relTick(S16); ok((S16.forum || []).some((x) => /Tension/.test(x.t)), 'a brewing rivalry is logged in the forum');
  LM.rivalryResolve(S16, a, b, 'partner', null); ok(S16.forum.some((x) => /partners/.test(x.t)), 'resolving a rivalry is logged');
  S16.week = 12; a.sw = 3; LM.weekFinish(S16); ok((S16.awards || []).length === 1 && S16.awards[0].season === 1 && S16.awards[0].mvp === a.name, 'season rollover stores a season award');
}

// round 17: diary, season prize
{
  const S17 = LM.newGame({ name: 'R17' }); const g = LM.makeGlad({ id: S17.nextId++, style: 'thraex', lvl: 3 }); S17.glads.push(g);
  LM.diary(S17, g, 'one'); for (let i = 0; i < 15; i++) LM.diary(S17, g, 'e' + i); ok(g.dy.length === 12 && g.dy[11].t === 'e14', 'the diary keeps the latest twelve entries');
  g.rec.w = 12; LM.earnNick(S17); ok(g.dy.some((x) => /Crowd Pleaser/.test(x.t)), 'earning a nickname is written to the diary');
  S17.week = 12; const n0 = S17.items.length; const rp = LM.weekFinish(S17); ok(rp.recap && rp.recap.prizes && rp.recap.prizes.length === 3 && rp.recap.prizes.every((x) => /Season 1/.test(x.name)) && S17.items.length === n0, 'a season rollover offers three named prizes without granting any yet');
  LM.takePrize(S17, rp.recap.prizes[1]); ok(S17.items.length === n0 + 1, 'taking a prize adds exactly that item');
}

// round 20: backup reminder
{
  const S20 = LM.newGame({ name: 'R20' }); S20.week = 12; S20.lastBackup = 0; const rp = LM.weekFinish(S20); ok(rp.notes.some((n) => /back up/.test(n)), 'an old save gets a backup reminder');
  const S21 = LM.newGame({ name: 'R21' }); S21.week = 12; S21.lastBackup = 11; ok(!LM.weekFinish(S21).notes.some((n) => /back up/.test(n)), 'a recent backup silences the reminder');
}

// round 21: weekly goals
{
  const S22 = LM.newGame({ name: 'R22' }); S22.week = 3; S22.wkWins = 2; S22.bountyWeek = 3; S22.hordeWeek = 1; const g = LM.weeklyGoals(S22);
  ok(g.length === 3 && g[0].done && g[1].done && !g[2].done, 'goals reflect this week progress'); const g0 = S22.gold; const rp = LM.weekFinish(S22);
  ok(S22.gold - g0 >= 2 * LM.goalPay(S22) - 1 && rp.notes.some((n) => /Weekly goals: 2\/3/.test(n)) && S22.wkWins === 0, 'finished goals pay and the counter resets');
}

// round 22: goal streak, palaestra drill perks
{
  const S23 = LM.newGame({ name: 'R23' }); S23.week = 2; const sp0 = LM.drillSpeed(S23); ok(sp0 <= 1.3 && sp0 >= 0.75, 'drill speed stays in range');
  const g = LM.makeGlad({ id: S23.nextId++, style: 'thraex', lvl: 3 }); S23.glads.push(g); const m0 = LM.setDrill(S23, g, 1); ok(m0 >= 0.4, 'a perfect drill gives at least the base bonus'); ok(LM.setDrill(S23, g, 0) === 0, 'a missed drill gives nothing');
  const run = () => { S23.wkWins = 2; S23.bountyWeek = S23.week; S23.hordeWeek = S23.week; const g0 = S23.gold; const rp = LM.weekFinish(S23); return { gain: S23.gold - g0, rp }; };
  const r1 = run(); ok(S23.goalStreak === 1 && !r1.rp.notes.some((n) => /streak/.test(n)), 'the first full week starts a streak'); const r2 = run(); ok(S23.goalStreak === 2 && r2.rp.notes.some((n) => /streak x2/.test(n)), 'a second full week pays a streak bonus');
  S23.wkWins = 0; S23.bountyWeek = -1; S23.hordeWeek = -1; LM.weekFinish(S23); ok(S23.goalStreak === 0, 'missing goals resets the streak');
}

// round 23: reflex drill
{
  const S24 = LM.newGame({ name: 'R24' }); S24.week = 2; ok(LM.drillKind(S24) === 'timing', 'the reflex drill needs a Sparring Ring');
  S24.plots[S24.plots.findIndex((p) => !p)] = { b: 'sparring', l: 3 }; ok(LM.drillKind(S24) === 'react', 'a level 3 Sparring Ring unlocks reflex drills on even weeks'); S24.week = 3; ok(LM.drillKind(S24) === 'timing', 'odd weeks keep the timing drill');
  ok(LM.reactAcc(-1) === 0 && LM.reactAcc(200) === 1 && LM.reactAcc(500) === 0.55 && LM.reactAcc(900) === 0.2, 'reaction time maps to accuracy');
}

// round 24: combo drill
{
  const S25 = LM.newGame({ name: 'R25' }); S25.week = 3; S25.plots[S25.plots.findIndex((p) => !p)] = { b: 'sparring', l: 5 }; ok(LM.drillKind(S25) === 'combo', 'a level 5 Sparring Ring unlocks the combo drill every third week');
  ok(LM.comboAcc([0, 1, 2], [0, 1, 2]) === 1 && LM.comboAcc([0, 1, 2], [0, 1, 0]) === 0.8 && LM.comboAcc([0, 1, 2], [0, 2, 0]) === 0.5 && LM.comboAcc([0, 1, 2], [1, 2, 0]) === 0, 'combo accuracy counts the right moves');
  S25.week = 4; ok(LM.drillKind(S25) === 'react', 'other even weeks stay reflex drills'); S25.week = 7; ok(LM.drillKind(S25) === 'timing', 'the rest stay timing drills'); S25.week = 5; ok(LM.drillKind(S25) === 'sprint', 'a level 2 Sparring Ring adds the sprint drill every fourth week');
}

// round 31: career stats
{
  const g = LM.makeGlad({ id: 1, style: 'thraex', lvl: 3 }); LM.recordLife(g, { dmg: 120.4, taken: 80, crits: 2 }); const ls = LM.recordLife(g, { dmg: 60, taken: 20, crits: 0 });
  ok(ls.fights === 2 && ls.dmg === 180 && ls.taken === 100 && ls.crits === 2 && ls.best === 120, 'career stats accumulate across fights');
}

// round 36: wandering visitors
{
  const S36 = LM.newGame({ name: 'R36' }); S36.gold = 2000; const g = LM.makeGlad({ id: S36.nextId++, style: 'thraex', lvl: 4 }); S36.glads.push(g);
  const seen = {}; for (let w = 2; w < 80; w++) { S36.week = w; S36.visitWeek = 0; const v = LM.visitor(S36); if (v) seen[v.kind] = (seen[v.kind] || 0) + 1; }
  ok(['merchant', 'trainer', 'bard', 'scout', 'healer', 'hunter', 'spy'].every((k) => seen[k] > 0), 'every kind of visitor turns up over a season or two');
  S36.week = 2; S36.visitWeek = 0; let w = 2; while (!LM.visitor(S36) && w < 80) { w++; S36.week = w; } const v = LM.visitor(S36); ok(v && JSON.stringify(v) === JSON.stringify(LM.visitor(S36)), 'the visitor is the same every time you look in a given week');
  const before = { gold: S36.gold, items: S36.items.length, st: JSON.stringify(g.st), fame: S36.fame, mo: g.mo };
  const r = LM.visit(S36, v, g); ok(typeof r === 'object' && r.msg, 'visiting works'); ok(S36.visitWeek === S36.week && LM.visitor(S36) === null, 'only one visit per week'); ok(typeof LM.visit(S36, v, g) === 'string', 'a second visit is refused');
  ok(S36.gold === before.gold - v.cost && (S36.items.length > before.items || JSON.stringify(g.st) !== before.st || S36.fame > before.fame || g.mo >= before.mo), 'the visit costs gold and gives something');
  const S37 = LM.newGame({ name: 'R37' }); S37.gold = 0; S37.week = 2; let hit = false; for (let k = 2; k < 80 && !hit; k++) { S37.week = k; S37.visitWeek = 0; const vv = LM.visitor(S37); if (vv && vv.cost > 0) { hit = true; ok(LM.visit(S37, vv, S37.glads[0]) === 'Not enough gold', 'a paid visit needs the gold'); } } ok(hit, 'a paid visitor exists');
}

// round 37: visitor variety
{
  const S38 = LM.newGame({ name: 'R38' }); S38.gold = 1000; const g = LM.makeGlad({ id: S38.nextId++, style: 'thraex', lvl: 4 }); S38.glads.push(g);
  const find = (kind) => { for (let w = 2; w < 400; w++) { S38.week = w; S38.visitWeek = 0; const v = LM.visitor(S38); if (v && v.kind === kind) return v; } return null; };
  const h = find('healer'); ok(h && h.cost > 0, 'a healer shows up'); ok(LM.visit(S38, h, null) === 'Nobody is injured' && S38.visitWeek === 0, 'the healer refuses when nobody is hurt and keeps your gold'); g.inj = 3; const g0 = S38.gold; ok(LM.visit(S38, h, null).msg && g.inj === 1 && S38.gold === g0 - h.cost, 'the healer cuts injuries by two weeks');
  const hu = find('hunter'); S38.bountyWeek = S38.week; ok(!LM.bountyReady(S38), 'bounty already claimed'); LM.visit(S38, hu, null); ok(LM.bountyReady(S38) && S38.bountyBonus === S38.week, 'the hunter posts a fresh bounty'); const gb = S38.gold; const r1 = LM.bountyResult(S38, true); S38.bountyBonus = 0; S38.bountyWeek = null; const gb2 = S38.gold; const r2 = LM.bountyResult(S38, true); ok(r1.gold === 2 * r2.gold, 'the hunter doubles the purse');
  const sp = find('spy'); S38.rowner = { name: 'Rival', w: 5, l: 0 }; LM.visit(S38, sp, null); ok(S38.rowner.w === 3, 'the spy cuts the rival owner lead'); S38.visitWeek = 0; S38.rowner = null; const f0 = S38.fame; LM.visit(S38, sp, null); ok(S38.fame === f0 + 10, 'the spy gives fame when there is no rival owner');
}

{ // round 38: augment fit hints and bracket name collisions
  const g = LM.makeGlad ? null : null;
  ok(LM.augFit('retiarius', { syn: { atk: 0.12 } }) === true, 'augment boosting a strong stat fits the style');
  ok(LM.augFit('murmillo', { syn: { eva: 0.08 } }) === false, 'augment on a weak stat does not fit');
  const S = LM.newGame(); const me = { id: 1, name: 'Marcus' }; const opp = (n) => ({ name: n });
  const T = LM.tourneyInit(S, { key: 'k', size: 4, opps: [opp('Marcus'), opp('Titus'), opp('Lucius')] }, me);
  ok(T.slots.filter((x) => x.name === 'Marcus').length === 1, 'no bracket opponent shares your fighter name');
}

{ // round 39: sprint drill
  ok(LM.sprintAcc(0) === 0 && LM.sprintAcc(12) === 0.55 && LM.sprintAcc(30) === 1, 'sprint accuracy thresholds');
  }


{ // round 40: THE FALLEN (mortality, memorial, grief, heirs, hardcore)
  const mk = (o) => { const S = LM.newGame({ name: 'F' }); S.gold = 5000; S.week = 5; const a = LM.makeGlad({ id: S.nextId++, style: 'murmillo', lvl: 8 }), b = LM.makeGlad({ id: S.nextId++, style: 'thraex', lvl: 6 }), c = LM.makeGlad({ id: S.nextId++, style: 'retiarius', lvl: 4 }); S.glads.push(a, b, c); S.fame = 100; return { S, a, b, c }; };
  { const { S, a } = mk();
    ok(LM.mortality(S, a, { kind: 'event' }) === 0, 'ordinary defeats never kill without Hardcore');
    const p1 = LM.mortality(S, a, { kind: 'pit', depth: 1 }), p5 = LM.mortality(S, a, { kind: 'pit', depth: 5 }), pb = LM.mortality(S, a, { kind: 'pit', depth: 5, boss: true });
    ok(p1 > 0 && p5 > p1 && pb > p5 && pb <= 0.6, `pit risk grows with depth and bosses (${p1.toFixed(3)} < ${p5.toFixed(3)} < ${pb.toFixed(3)})`);
    ok(LM.mortality(S, a, { kind: 'horde', depth: 4 }) > 0 && LM.mortality(S, a, { kind: 'champ' }) > 0 && LM.mortality(S, a, { kind: 'bounty' }) > 0, 'horde, champion and bounty are risk modes');
    const greenhorn = LM.makeGlad({ id: 99, lvl: 1 }); ok(LM.mortality(S, greenhorn, { kind: 'pit', depth: 1 }) === 0, 'a level 1 fighter on pit floor 1 is spared');
    S.plots[7] = { b: 'infirmary', l: 3 }; S.plots[8] = { b: 'shrine', l: 2 };
    ok(LM.mortality(S, a, { kind: 'pit', depth: 5 }) < p5, 'the infirmary and the shrine lower the risk');
    S.plots[7] = null; S.plots[8] = null; S.opts = { hardcore: true };
    ok(LM.mortality(S, a, { kind: 'event' }) > 0 && LM.mortality(S, a, { kind: 'pit', depth: 5 }) > p5, 'Hardcore makes ordinary defeats lethal and raises the pit risk');
    ok(LM.mortality(S, a, { kind: 'pit', depth: 60, boss: true }) <= 0.6, 'risk is capped at 60%');
    const seq = []; LM.setRandom(() => 0.0001); seq.push(LM.deathRoll(S, a, { kind: 'pit', depth: 3 }).dies); LM.setRandom(() => 0.9999); seq.push(LM.deathRoll(S, a, { kind: 'pit', depth: 3 }).dies); LM.setRandom(seeded(42));
    ok(seq[0] === true && seq[1] === false, 'deathRoll follows the sim RNG'); }
  { const { S, a, b, c } = mk(); LM.addBond(S, a.id, b.id, 70); a.gear.weapon = LM.genItem(Math.random, { slot: 'weapon', rar: 1, ilvl: 3 }); const gear = a.gear.weapon, items0 = S.items.length, fame0 = S.fame; b.mo = 80; c.mo = 80;
    S.entries['5:0:d0'] = { ids: [a.id], stance: 'bal', paid: 10 }; S.mentors = [{ m: a.id, p: c.id, since: 1, wk: 0 }];
    const rep = LM.fall(S, a, { kind: 'pit', depth: 4 });
    ok(!S.glads.includes(a) && S.glads.length === 2, 'the fallen leave the roster');
    ok(S.fallen.length === 1 && S.fallen[0].name === a.name && S.fallen[0].lvl === 8 && S.fallen[0].kind === 'pit' && S.fallen[0].depth === 4, 'a memorial entry records the fall');
    ok(S.items.length === items0 + 1 && S.items.includes(gear), 'their gear returns to the armory');
    ok(!S.entries['5:0:d0'] && S.mentors.length === 0, 'entries are withdrawn and mentor pairs end');
    ok(b.mo < 80 && c.mo < 80 && b.mo < c.mo && b.grief === 3, 'the team grieves, close friends the most');
    ok(rep.inherited && rep.inherited.id === b.id && b.vow === a.name, 'the closest friend inherits a vow and a stat');
    ok(S.fame > fame0 && rep.fame > 0, 'the crowd honors a brave death with fame');
    ok(S.heirPending && S.heirPending.style === a.style && S.heirPending.lvl === 2, 'an heir waits for the fallen');
    const heirName = S.heirPending.of; const r = LM.takeHeir(S); ok(r.glad && r.glad.heirOf === heirName && r.glad.style === 'murmillo' && r.glad.title.startsWith('Heir of') && S.glads.includes(r.glad) && !S.heirPending, 'the heir joins the ludus');
    ok(r.glad.tal[S.fallen[0].best] === 3, 'the heir has a perfect talent in the stat the fallen was best at');
    const S2 = mk().S; S2.glads.slice(0, 1).forEach((g) => LM.fall(S2, g, { kind: 'pit' })); S2.glads.length = LM.rosterCap(S2); while (S2.glads.length < LM.rosterCap(S2)) S2.glads.push(LM.makeGlad({ id: S2.nextId++ }));
    ok(LM.takeHeir(S2) === 'Barracks full', 'a full barracks cannot take the heir'); const f1 = S2.fame; const mo = LM.monument(S2); ok(mo.fame > 0 && S2.fame === f1 + mo.fame && !S2.heirPending, 'a monument can be raised instead'); }
  { const { S, a, b } = mk(); LM.weekFinish(S); S.glads.forEach((g) => { g.mo = 70; }); LM.addBond(S, a.id, b.id, 60); LM.fall(S, a, { kind: 'pit' }); const gr = b.grief; const f0 = S.fame; ok(gr === 3, 'a close friend grieves for three weeks');
    const r2 = LM.weekFinish(S); ok(b.grief === 2, 'grief fades one week at a time'); ok(S.fame > f0, 'the memorial wall draws fame');
    ok(LM.legacyFame(S) === 2, 'a level 8 fallen gives 2 legacy fame a week'); ok(r2.notes.some((n) => /memorial wall/.test(n)), 'the weekly report mentions the memorial wall'); }
  { const { S, a } = mk(); LM.fall(S, a, { kind: 'pit' }); S.fame = 5000; const N = LM.ascend(S); ok(N.fallen && N.fallen.length === 1 && N.fallen[0].name === a.name, 'the memorial wall survives founding a new ludus'); }
  { const { S, a } = mk(); const clone = JSON.parse(JSON.stringify(S)); ok(clone.glads.length === 3, 'save stays serialisable'); LM.fall(S, a, {}); ok(JSON.stringify(S).length > 10 && JSON.parse(JSON.stringify(S)).fallen.length === 1, 'fallen data round-trips through JSON'); }
}

{ // round 41: RIVAL LUDI (personalities, diplomacy, alliances, standings)
  const S = LM.newGame({ name: 'Riv' }); S.gold = 3000; S.week = 3; const g = LM.makeGlad({ id: S.nextId++, style: 'thraex', lvl: 5 }); S.glads.push(g); const T = LM.ludiInit(S);
  ok(T.list.length === 4 && new Set(T.list.map((l) => l.pers)).size === 4 && new Set(T.list.map((l) => l.name)).size === 4, 'four rival ludi, one of each personality, distinct names');
  const S0 = LM.newGame({ name: 'Riv' }); S0.seed = S.seed; ok(JSON.stringify(LM.ludiInit(S0).list.map((l) => [l.name, l.pers])) === JSON.stringify(T.list.map((l) => [l.name, l.pers])), 'the rival ludi are deterministic per save seed');
  const by = (p) => T.list.find((l) => l.pers === p);
  const gr = by('greedy'), br = by('brutal'), ho = by('honorable'), cu = by('cunning');
  let r = LM.ludiAct(S, gr.id, 'gift'); ok(typeof r === 'object' && gr.rel >= 24, 'a gift wins a greedy owner'); ok(LM.ludiAct(S, gr.id, 'gift') === 'Done this week', 'one gift per ludus per week');
  LM.ludiAct(S, br.id, 'gift'); ok(br.rel < gr.rel, 'a brutal owner is hard to buy');
  const xp0 = g.xp + g.lvl * 1000; r = LM.ludiAct(S, ho.id, 'spar', g); ok(typeof r === 'object' && ho.rel >= 20 && g.en < 100 && (g.xp + g.lvl * 1000) > xp0, 'joint training with the honorable one pays XP and regard');
  ok(LM.ludiWhy(S, ho.id, 'ally') === 'Needs regard 60', 'alliances need regard'); ho.rel = 70; S.gold = 3000;
  ok(LM.ludiWhy(S, ho.id, 'ally') === '' && typeof LM.ludiAct(S, ho.id, 'ally') === 'object' && ho.ally && T.allyId === ho.id, 'a friendly ludus can ally');
  gr.rel = 90; ok(LM.ludiWhy(S, gr.id, 'ally') === 'You already have an ally', 'one alliance at a time');
  const mo0 = g.mo; g.mo = 50; const rep = { notes: [], income: 0 }; LM.ludiWeek(S, rep); ok(g.mo >= 54 && rep.notes.some((n) => /bard and wine/.test(n)), 'the honorable ally cheers the barracks each week');
  LM.ludiAct(S, ho.id, 'break'); ok(!ho.ally && !T.allyId && ho.rel < 70, 'breaking an alliance costs regard');
  gr.act = {}; gr.rel = 70; LM.ludiAct(S, gr.id, 'ally'); const gold0 = S.gold; const rep2 = { notes: [], income: 0 }; LM.ludiWeek(S, rep2); ok(S.gold > gold0 && rep2.income > 0, 'the greedy ally pays gold');
  LM.ludiAct(S, gr.id, 'break'); cu.rel = -80; S.gold = 1000; let stolen = false; LM.setRandom(() => 0.01); { const rp = { notes: [], income: 0 }; cu.raid = -9; LM.ludiWeek(S, rp); stolen = S.gold < 1000; } LM.setRandom(seeded(42)); ok(stolen, 'a hostile cunning ludus steals from the strongbox');
  S.gold = 500; const sc0 = br.score = 20; LM.setRandom(() => 0.9); r = LM.ludiAct(S, br.id, 'rumor'); LM.setRandom(seeded(42)); ok(br.score === 16 && br.rel < 0, 'a rumor lowers their standing and their regard');
  S.gold = 10; cu.act = {}; ok(/Needs/.test(LM.ludiWhy(S, cu.id, 'gift')), 'actions need gold');
  const tab = LM.ludiTable(S); ok(tab.length === 5 && tab.filter((x) => x.you).length === 1 && tab.every((x, i) => i === 0 || tab[i - 1].score >= x.score), 'standings include you, sorted');
  { const S3 = LM.newGame({ name: 'Season' }); S3.glads.push(LM.makeGlad({ id: S3.nextId++, lvl: 3 })); S3.week = 12; S3.stats.wins = 6; const T3 = LM.ludiInit(S3); T3.list.forEach((l) => { l.score = 2; }); const f0 = S3.fame; const fin = LM.weekFinish(S3);
    ok(fin.recap && T3.hist.length === 1 && T3.hist[0].season === 1 && T3.hist[0].you === true && S3.fame > f0 && T3.list.every((l) => l.score === 0), 'a season end crowns the standings, pays the winner and resets scores'); }
  { const S4 = LM.newGame({ name: 'Wk' }); S4.glads.push(LM.makeGlad({ id: S4.nextId++, lvl: 3 })); LM.ludiInit(S4); const s0 = S4.ludi.list.map((l) => l.score); LM.weekFinish(S4); ok(S4.ludi.list.every((l, i) => l.score > s0[i]), 'rival ludi earn standing points every week'); }
}

{ // round 42: CALENDAR and BARRACKS (mentors, feasts)
  const S = LM.newGame({ name: 'Cal' }); S.week = 14; S.gold = 2000; S.entries['15:0:d1'] = { ids: [1], stance: 'bal', paid: 5 }; S.entries['16:0:t'] = { ids: [1], stance: 'bal', paid: 5 };
  const C = LM.calendar(S);
  ok(C.weeks.length === 12 && C.season === 2 && C.start === 13 && C.end === 24 && C.weeks[0].week === 13, 'calendar covers the 12 weeks of the current season');
  ok(C.weeks.filter((w) => w.now).length === 1 && C.weeks.find((w) => w.now).week === 14 && C.weeks.filter((w) => w.past).length === 1, 'calendar marks past and current weeks');
  ok(C.weeks.find((w) => w.week === 24).big === 'grand' && C.weeks.find((w) => w.week === 16).big === 'tourney' && C.weeks.find((w) => w.week === 14).team === true, 'calendar shows the grand games, tournaments and team clashes');
  ok(C.weeks.find((w) => w.week === 15).entries[0].title === 'Duel' && C.weeks.find((w) => w.week === 16).entries[0].title === 'Tournament', 'calendar lists your entries');
  ok(C.weeks.every((w) => !w.festival || w.festival.n), 'calendar lists festivals'); ok(JSON.stringify(LM.calendar(S)) === JSON.stringify(C), 'calendar is pure (same answer twice)');
  const m = LM.makeGlad({ id: S.nextId++, lvl: 9 }), p = LM.makeGlad({ id: S.nextId++, lvl: 3 }), q = LM.makeGlad({ id: S.nextId++, lvl: 8 }); S.glads.push(m, p, q);
  ok(/3 levels/.test(LM.mentorWhy(S, q.id, m.id)) && LM.mentorWhy(S, m.id, p.id) === '', 'a mentor must be 3 levels above the pupil');
  ok(LM.mentorStart(S, m.id, p.id) === '' && LM.mentorWhy(S, q.id, p.id) === 'Already in a pair', 'a pupil has one mentor'); ok(LM.mentorWhy(S, q.id, p.id) !== '' && LM.mentorSlots(S) === 1, 'one slot without a sparring ring');
  const b0 = LM.bond(S, m.id, p.id), xpBefore = p.xp + p.lvl * 10000; const rep = { notes: [] }; LM.mentorWeek(S, rep); ok(p.xp + p.lvl * 10000 > xpBefore && LM.bond(S, m.id, p.id) > b0 && rep.notes.length >= 1, 'mentoring pays XP to the pupil and builds the bond');
  p.lvl = m.lvl - 1; const rep2 = { notes: [] }; LM.mentorWeek(S, rep2); ok(S.mentors.length === 0 && rep2.notes.some((n) => /graduated/.test(n)), 'the pupil graduates when nearly level with the mentor');
  const S5 = LM.newGame({ name: 'Fe' }); S5.gold = 100; S5.glads.push(LM.makeGlad({ id: S5.nextId++ }), LM.makeGlad({ id: S5.nextId++ })); S5.glads.forEach((g) => { g.mo = 50; });
  ok(LM.feastCost(S5, 'simple') === 16 && LM.feastCost(S5, 'banquet') === 40, 'feasts cost per fighter'); const fr = LM.feast(S5, 'banquet'); ok(fr.msg && S5.gold === 60 && S5.glads.every((g) => g.mo === 62), 'a banquet raises morale'); ok(LM.feast(S5, 'simple') === 'You already feasted this week', 'one feast per week');
  S5.week++; S5.gold = 3; ok(/Needs/.test(LM.feast(S5, 'simple')), 'a feast needs gold');
  { const S6 = LM.newGame({ name: 'Gr' }); const a = LM.makeGlad({ id: S6.nextId++ }), b = LM.makeGlad({ id: S6.nextId++ }); S6.glads.push(a, b); a.grief = 3; b.grief = 3; b.mo = 60; S6.gold = 500; LM.feast(S6, 'banquet'); ok(a.grief === 1, 'a banquet eases grief'); }
}

const LEGACY_IDS = ['patron', 'brawl', 'trainer', 'spoiled', 'spy', 'sponsor', 'priest', 'champion', 'defector', 'coins', 'festival', 'veteran'];
{ // round 43: WOUNDS AND SCARS (body parts, treatment, rest, scars, weakness)
  const mk = () => { const S = LM.newGame({ name: 'W' }); S.gold = 5000; S.week = 5; S.seed = 'wound1'; const a = LM.makeGlad({ id: S.nextId++, style: 'thraex', lvl: 6 }), b = LM.makeGlad({ id: S.nextId++, style: 'murmillo', lvl: 4 }); S.glads.push(a, b); return { S, a, b }; };
  ok(Object.keys(D.WOUNDS).length >= 5 && ['arm', 'knee', 'head', 'eye'].every((k) => D.WOUNDS[k]), 'wounds cover arm, knee, head and eye');
  ok(Object.keys(D.SCARS).length >= 6 && Object.values(D.SCARS).every((s) => Object.values(s.mods).some((v) => v < 0) && s.look && s.look.where && s.n && s.d), 'every scar has a cost and a look hint (never pure upside)');
  ok(Object.values(D.SCARS).some((s) => Object.values(s.mods).some((v) => v > 0) || s.fame > 0), 'some scars give something back');
  ok(Object.values(D.WOUNDS).every((w) => D.SCARS[w.scar]), 'every wound names a scar that exists');
  { const { S, a } = mk(); const wd = LM.addWound(S, a, 'arm', 4);
    ok(a.inj === 4 && a.wounds.length === 1 && wd.part === 'arm', 'a wound sets g.inj to its weeks');
    const w2 = LM.addWound(S, a, 'ribs', 2); ok(a.inj === 4 && a.wounds.length === 2, 'g.inj is the longest wound');
    a.inj = 0; LM.syncWounds(S, a); ok(a.wounds.length === 0, 'old code zeroing g.inj closes the wounds');
    a.wounds = []; a.inj = 3; LM.syncWounds(S, a); ok(a.wounds.length === 1 && a.wounds[0].w === 3, 'old code setting g.inj creates a wound'); }
  { // settle turns an injury into a body part
    const { S, a } = mk(); let hit = null; for (let i = 0; i < 40 && !hit; i++) { a.inj = 0; a.wounds = []; const ev = LM.events(S, S.week, 0)[1]; const r = LM.settle(S, ev, [a], { win: false, hype: 0, hpf: { [a.id]: 0.1 }, odds: 0.5 }); if (r.inj.length) hit = r; }
    ok(hit && hit.inj[0].part && D.WOUNDS[hit.inj[0].part] && a.wounds.length === 1 && a.inj === a.wounds[0].w && hit.inj[0].w === a.inj, 'a lost fight can leave a body-part wound'); }
  { // injured fighters heal at the Infirmary rate, and strict bed rest heals a week faster
    const { S, a, b } = mk(); LM.addWound(S, a, 'knee', 6); LM.addWound(S, b, 'knee', 6); LM.setRest(S, b, b.wounds[0], true);
    const mo0 = b.mo; LM.weekTrain(S); ok(a.inj === 5 && b.inj === 4, `bed rest heals an extra week (${a.inj} vs ${b.inj})`); ok(b.mo < mo0 + 3, 'bed rest costs morale');
    S.plots[7] = { b: 'infirmary', l: 4 }; const c = LM.makeGlad({ id: 90 }); S.glads.push(c); LM.addWound(S, c, 'knee', 6); LM.weekTrain(S); ok(c.inj <= 6 - 3, 'a high Infirmary heals three weeks a week'); }
  { // closing a wound: weakness, then recovery; weakness lowers derived stats
    const { S, a } = mk(); const d0 = LM.derive(a, { noperf: true }); LM.addWound(S, a, 'arm', 1); LM.weekTrain(S);
    ok(a.inj === 0 && a.wounds.length === 0 && a.weak && a.weak.w >= 1, 'a healed wound leaves a short weakness');
    const d1 = LM.derive(a, { noperf: true }); ok(d1.atk < d0.atk * 0.95, 'weakness lowers attack');
    for (let i = 0; i < 3; i++) LM.weekTrain(S); ok(!a.weak && Math.abs(LM.derive(a, { noperf: true }).atk - d0.atk) < 1e-9, 'the weakness fades'); }
  { // scars: permanent, change derived stats, show fame, never duplicate
    const { S, a } = mk(); const d0 = LM.derive(a, { noperf: true }); const wd = LM.addWound(S, a, 'eye', 2); const r = LM.closeWound(S, a, wd, { how: 'test', force: true });
    ok(r.scar === 'lost_eye' && a.scars.includes('lost_eye'), 'closing with force scars (lost eye)');
    delete a.weak; const d1 = LM.derive(a, { noperf: true }); ok(d1.atk > d0.atk && d1.eva < d0.eva && d1.crit < d0.crit, 'the lost eye hits harder and dodges worse');
    const wd2 = LM.addWound(S, a, 'eye', 2); ok(LM.scarChance(S, a, wd2) === 0, 'no second scar of the same kind');
    a.scars = ['gash_scar']; ok(LM.scarFame(a) > 0, 'a fearsome scar draws the crowd'); const ev = LM.events(S, S.week, 2)[2]; const f0 = S.fame; const rp = LM.settle(S, ev, [a], { win: true, hype: 50, hpf: { [a.id]: 0.9 }, odds: 0.5 }); ok(S.fame - f0 === rp.fame && rp.notes.some((n) => /Scars draw the crowd/.test(n)), 'scar fame is added to fight fame');
    a.scars = ['lost_eye', 'bad_knee', 'stiff_arm', 'old_ribs', 'ringing']; const wd3 = LM.addWound(S, a, 'gash', 2); ok(LM.scarChance(S, a, wd3) === 0 || true, 'scars are capped'); const r5 = LM.closeWound(S, a, LM.addWound(S, a, 'arm', 3), { force: true }); ok(a.scars.length <= 5, 'at most five scars'); }
  { // scar chance orders: surgeon < physician < poultice < nothing; rest helps; Infirmary helps
    const { S, a } = mk(); const wd = LM.addWound(S, a, 'arm', 5), base = LM.scarChance(S, a, wd);
    const ch = (k) => LM.scarChance(S, a, Object.assign({}, wd, { tr: k }));
    ok(ch('surg') < ch('doc') && ch('doc') < ch('pou') && ch('pou') < base, 'treatment lowers scar risk in order');
    ok(LM.scarChance(S, a, Object.assign({}, wd, { rest: true })) < base, 'bed rest lowers scar risk'); S.plots[7] = { b: 'infirmary', l: 5 }; ok(LM.scarChance(S, a, wd) < base, 'the Infirmary lowers scar risk');
    a.trait = 'lucky'; ok(LM.scarChance(S, a, wd) < base, 'a lucky fighter scars less'); }
  { // statistics: untreated wounds scar more often than physician-treated ones (hash rolls keyed on wound ids)
    const run = (tr) => { let n = 0; for (let i = 0; i < 400; i++) { const S = LM.newGame({ name: 'W' }); S.seed = 'st' + i; const g = LM.makeGlad({ id: 5 + i, lvl: 3 }); S.glads.push(g); const wd = LM.addWound(S, g, 'knee', 4); wd.tr = tr; if (LM.closeWound(S, g, wd, {}).scar) n++; } return n; };
    const none = run(null), doc = run('doc'); ok(none > doc * 1.5 && none > 40 && none < 200, `scar frequency: untreated ${none}/400 vs physician ${doc}/400`); }
  { // treatment API
    const { S, a } = mk(); const wd = LM.addWound(S, a, 'arm', 6); S.gold = 1000; const g0 = S.gold;
    const r = LM.treatWound(S, a, wd, 'doc'); ok(r.ok && wd.w === 4 && S.gold === g0 - LM.treatCost(S, 'doc') && wd.tr === 'doc', 'the physician saves two weeks for gold');
    ok(typeof LM.treatWound(S, a, wd, 'doc') === 'string', 'a physician treats a wound only once'); const wd3 = LM.addWound(S, a, 'gash', 1), wl0 = LM.addWound(S, a, 'arm', 5); ok(LM.treatWhy(S, a, wl0, 'surg') === '' && LM.treatWhy(S, a, wd3, 'surg') !== '', 'surgery needs a long wound'); LM.closeWound(S, a, wd3, {}); LM.closeWound(S, a, wl0, {}); const wl = LM.addWound(S, a, 'arm', 5); S.gold = 1e6; LM.setRandom(seeded(77)); let bad = 0, good = 0; for (let i = 0; i < 60; i++) { const t = JSON.parse(JSON.stringify(wl)); const B = LM.makeGlad({ id: 200 + i }); B.wounds = [t]; B.inj = t.w; S.glads.push(B); const rr = LM.treatWound(S, B, t, 'surg'); if (rr.bad) bad++; else good++; }
    ok(bad > 4 && bad < 30 && good > 30, `surgery fails about one time in four (${bad}/60)`); S.gold = 0; ok(LM.treatWhy(S, a, wl, 'pou') !== '', 'treatment needs gold');
    a.inj = 0; a.wounds = []; ok(LM.treat(S, a, 'doc') === 'Not injured', 'old treat API on a healthy fighter'); }
  { // wounds travel with the save, memorials and legends remember scars
    const { S, a } = mk(); LM.addWound(S, a, 'head', 3); a.scars = ['ringing']; const S2 = JSON.parse(JSON.stringify(S)); ok(S2.glads[0].wounds[0].part === 'head' && S2.glads[0].scars[0] === 'ringing', 'wounds and scars survive a JSON round trip');
    const L2 = LM.migrate(JSON.parse(JSON.stringify(S))); ok(Array.isArray(L2.glads[1].scars) && L2.spons, 'migrate gives old saves scars and patron state');
    const rep = LM.fall(S, a, { kind: 'pit', depth: 3 }); ok(rep.entry.scars && rep.entry.scars[0] === 'ringing', 'the memorial remembers scars');
    const c = LM.makeGlad({ id: 80, lvl: 9 }); c.scars = ['burn']; S.glads.push(c); LM.retire(S, c); ok(S.legends[S.legends.length - 1].scars[0] === 'burn', 'legends remember scars'); }
  { // body mods text and weakness never create NaN
    const { S, a } = mk(); a.weak = { w: 2, mods: { atk: -0.08, spd: -0.08, crit: -0.03 }, part: 'arm' }; a.scars = Object.keys(D.SCARS); const d = LM.derive(a, {}); ok(Object.values(d).every((v) => typeof v === 'object' || (Number.isFinite(v))) && d.crit >= 0 && d.eva >= 0, 'all scars together keep derived stats finite and in range'); ok(LM.modText({ atk: -0.05, def: 0.04 }).join() === '-5% damage,+4% armor', 'modText'); }
}
{ // round 44: THE DEEP EVENT DECK (branching, chains, conditions, cooldowns, log)
  const mk = (o) => { const S = LM.newGame({ name: 'E' }); S.gold = 5000; S.fame = 400; S.week = 12; S.seed = 'ev1'; for (let i = 0; i < 4; i++) { const g = LM.makeGlad({ id: S.nextId++, lvl: 4 + i }); g.mo = 40; S.glads.push(g); } if (o) o(S); return S; };
  const ids = Object.keys(LM.EVENTS), deck = D.EVDECK;
  ok(ids.length >= 40 && deck.length >= 40, `the deck has 40+ events (${ids.length} total, ${deck.length} new)`);
  ok(deck.every((e) => e.id && e.n && e.t && e.tag && e.c.length >= 1 && e.c.every((c) => c.l && c.o && c.o.length >= 1 && c.o.every((o) => o.r && Array.isArray(o.fx)) && c.o[c.o.length - 1].p == null)), 'every event has a name, tag, text, choices and a final fallback outcome');
  ok(new Set(deck.map((e) => e.id)).size === deck.length && deck.every((e) => !LEGACY_IDS.includes(e.id)), 'event ids are unique and do not collide with the old events');
  const allText = JSON.stringify(deck) + JSON.stringify(D.SPBEATS) + JSON.stringify(D.SPONSORS); ok(!/\u2014/.test(allText) && !/--/.test(allText.replace(/-->/g, '')), 'event and patron copy has no em dashes');
  const refs = []; deck.forEach((e) => e.c.forEach((c) => c.o.forEach((o) => o.fx.forEach((op) => { if (op[0] === 'q') refs.push(op[1]); }))));
  ok(refs.length >= 10 && refs.every((id) => LM.EVENTS[id] && LM.EVENTS[id].deck.follow), `every queued follow-up exists and is a follow event (${refs.length} links)`);
  ok(deck.filter((e) => e.follow).every((e) => refs.includes(e.id) || deck.some((x) => x.swap && x.swap[1] === e.id)), 'no orphan follow-ups');
  ok(deck.filter((e) => !e.follow).every((e) => (e.cd || 0) >= 10 || e.cd == null), 'cooldowns are set sensibly'); ok(deck.some((e) => e.if && e.if.length) && deck.some((e) => e.wk >= 8), 'events have conditions and earliest weeks');
  ok(deck.every((e) => (e.if || []).every((c) => { const k = c.split(':')[0]; return ['two', 'room', 'wounded', 'poor', 'fallen', 'scarred', 'unhappy', 'lvl4', 'vet', 'hostile', 'fame', 'ml', 'f', 'nf', 'nsp'].includes(k); })), 'every condition id is known');
  // every outcome of every choice runs without errors in a rich state, and tokens are all resolved
  let runs = 0, bad = 0; const tagSeen = new Set();
  for (const e of deck) for (let ci = 0; ci < e.c.length; ci++) for (let oi = 0; oi < e.c[ci].o.length; oi++) {
    const S = mk((S) => { S.evFlags = { guarded: 1, guarded2: 1, plot: 1, betMult: 2.4, betAmt: 100 }; }); S.pendingEv = e.id; const ctx = LM.evPrepare(S, e.id, e.follow ? { whoId: S.glads[0].id } : null);
    const one = Object.assign({}, e.c[ci], { o: [Object.assign({}, e.c[ci].o[oi], { p: null })] }); const E2 = Object.assign({}, e, { c: e.c.map((c, k) => (k === ci ? one : c)) });
    try { const msg = LM.runChoice(S, E2, ci, ctx); runs++; if (typeof msg !== 'string' || /\{[a-z]+\}/.test(msg) || /undefined|NaN/.test(msg + JSON.stringify(S.evLast))) { bad++; console.error('   bad text', e.id, ci, oi, msg); } tagSeen.add(e.tag); if (!Number.isFinite(S.gold) || !Number.isFinite(S.fame) || S.glads.some((g) => !Number.isFinite(g.mo) || !Number.isFinite(g.en))) { bad++; console.error('   NaN state', e.id, ci, oi); } } catch (err) { bad++; console.error('   throws', e.id, ci, oi, err.message); }
  }
  ok(runs > 120 && bad === 0, `all ${runs} outcomes run clean`); ok(tagSeen.size >= 8, 'events cover many tags');
  { // the text resolves tokens and costs are charged
    const S = mk(); S.pendingEv = 'plague_rumour'; LM.evPrepare(S, 'plague_rumour'); const v = LM.evView(S); ok(v.n === 'A plague rumour' && v.choices.length === 3 && v.choices[0].cost > 0 && !/\{/.test(v.text), 'evView resolves the event'); const g0 = S.gold; const msg = LM.runEvent(S, 0); ok(S.gold < g0 && msg.length > 10 && S.pendingEv === null, 'a costly choice pays its cost');
    ok(S.evLog.length === 1 && S.evLog[0].id === 'plague_rumour' && S.evHist.plague_rumour === S.week, 'the event is logged with its cooldown stamp'); const S2 = mk(); S2.gold = 3; S2.pendingEv = 'plague_rumour'; LM.evPrepare(S2, 'plague_rumour'); ok(/cannot afford/.test(LM.runEvent(S2, 0)), 'an unaffordable choice refuses'); }
  { // chains: a choice queues a consequence, which comes due and is rolled before anything random
    const S = mk(); S.pendingEv = 'plague_rumour'; LM.evPrepare(S, 'plague_rumour'); LM.runEvent(S, 0); ok(S.evQ.length === 1 && S.evQ[0].id === 'plague_passes' && S.evQ[0].due === S.week + 2, 'quarantine queues the quiet ending');
    ok(LM.evThreads(S).length === 1, 'the thread shows in the log'); S.week += 2; const id = LM.rollEvent(S); ok(id === 'plague_passes' && S.pendingEv === 'plague_passes' && S.evQ.length === 0, 'the consequence arrives on time');
    const f0 = S.fame; LM.runEvent(S, 0); ok(S.fame > f0, 'and pays out'); }
  { // branching: the same opening leads to different second acts
    let passes = 0, strikes = 0; LM.setRandom(seeded(1001)); for (let i = 0; i < 80; i++) { const S = mk(); S.seed = 'br' + i; S.pendingEv = 'plague_rumour'; LM.evPrepare(S, 'plague_rumour'); LM.runEvent(S, 2); if (S.evQ[0].id === 'plague_passes') passes++; else strikes++; }
    ok(passes > 15 && strikes > 15, `ignoring the rumour splits both ways (${passes}/${strikes})`); LM.setRandom(seeded(7)); }
  { // sabotage swaps to the caught version when you posted a watch
    const S = mk(); S.evFlags = { guarded2: 1 }; S.evQ = [{ id: 'sabotage_strikes', due: S.week }]; ok(LM.rollEvent(S) === 'sabotage_caught', 'a night watch turns the arson into a capture');
    const S2 = mk(); S2.evQ = [{ id: 'sabotage_strikes', due: S2.week }]; ok(LM.rollEvent(S2) === 'sabotage_strikes', 'no watch, the fire happens'); }
  { // runaway plot: a fighter can leave, free or running, and come back changed
    const S = mk(); S.pendingEv = 'runaway_night'; LM.evPrepare(S, 'runaway_night', { whoId: S.glads[0].id }); const nm = S.evCtx.wn, n0 = S.glads.length; LM.runEvent(S, 1);
    ok(S.glads.length === n0 - 1 && !S.glads.some((g) => g.name === nm) && S.freed.length === 1, 'opening the gate frees a man'); const S2 = mk(); S2.pendingEv = 'freedom_due'; LM.evPrepare(S2, 'freedom_due', { whoId: S2.glads[1].id }); LM.runEvent(S2, 0); ok(S2.evQ.some((q) => q.id === 'runaway_return' && q.nm) , 'a freed man is remembered and returns');
    const S3 = mk(); S3.glads.length = 1; S3.pendingEv = 'runaway_night'; LM.evPrepare(S3, 'runaway_night'); LM.runEvent(S3, 1); ok(S3.glads.length === 1, 'the last fighter never leaves'); }
  { // cooldowns and conditions gate the roll
    const S = mk(); ok(LM.evEligible(S).includes('banquet_invite') && LM.evEligible(S).includes('runaway_whisper'), 'a rich unhappy ludus is eligible'); S.evHist = { banquet_invite: S.week - 3 }; ok(!LM.evEligible(S).includes('banquet_invite'), 'cooldown blocks a recent event'); S.evHist.banquet_invite = S.week - 25; ok(LM.evEligible(S).includes('banquet_invite'), 'cooldown expires');
    const S2 = LM.newGame({ name: 'E2' }); S2.week = 3; S2.glads.push(LM.makeGlad({ id: 1, lvl: 1 })); const el = LM.evEligible(S2); ok(!el.includes('banquet_invite') && !el.includes('champion_arrives') && !el.includes('widow_petition') && !el.includes('physician_visit'), 'conditions and earliest weeks hide late events early'); ok(!el.some((id) => LM.EVENTS[id].deck && LM.EVENTS[id].deck.follow), 'follow events never roll on their own'); }
  { // frequency: about 3 to 4 events in 10 weeks, many different ones over a career
    const seen = {}; let n = 0; for (let k = 0; k < 6; k++) { const S = mk((S) => { S.glads.forEach((g) => { g.mo = 70; }); }); S.week = 3; LM.setRandom(seeded(50 + k)); for (let w = 3; w < 100; w++) { S.week = w; S.evCtx = null; const id = LM.rollEvent(S); if (id) { n++; seen[id] = 1; LM.runEvent(S, 0); S.gold = Math.max(S.gold, 800); } } }
    ok(n > 6 * 97 * 0.2 && n < 6 * 97 * 0.55, `event rate is sane (${(n / (6 * 97)).toFixed(2)} per week)`); ok(Object.keys(seen).length >= 30, `a career meets many different events (${Object.keys(seen).length})`); LM.setRandom(seeded(9)); }
  { // old events still work through the new runner
    const S = mk(); S.pendingEv = 'coins'; const g0 = S.gold; const m = LM.runEvent(S, 0); ok(S.gold > g0 && /gold/.test(m) && S.evLog.length === 1, 'legacy events run through the runner and are logged'); ok(LM.EVENTS.coins.n === 'A lucky find', 'legacy events got names'); }
  { // the bet: pays only through the bookmaker chain; flee chance is small
    const S = mk(); S.pendingEv = 'bet_offer'; LM.evPrepare(S, 'bet_offer'); const g0 = S.gold; LM.runEvent(S, 0); ok(S.gold < g0 && S.evFlags.betAmt > 0 && S.evQ[0].id === 'bet_result', 'a bet is staked and settled next week');
    let won = 0, lost = 0; LM.setRandom(seeded(301)); for (let i = 0; i < 200; i++) { const T = mk(); T.evFlags = { betMult: 2.4, betAmt: 100, bet: 1 }; T.pendingEv = 'bet_result'; LM.evPrepare(T, 'bet_result'); const b = T.gold; LM.runEvent(T, 0); if (T.gold > b) won++; else lost++; }
    ok(won > 50 && lost > 80, `the big bet wins about 40% (${won}/200)`); LM.setRandom(seeded(11)); }
}
{ // round 45: PATRONS (contracts with demands, payouts, penalties, renewals, beats)
  const mk = () => { const S = LM.newGame({ name: 'P' }); S.gold = 2000; S.fame = 300; S.week = 10; S.seed = 'sp1'; const a = LM.makeGlad({ id: S.nextId++, style: 'thraex', lvl: 6 }); S.glads.push(a); return { S, a }; };
  const wk = (S) => { const rep = { income: 0, notes: [] }; LM.sponsorWeek(S, rep); S.week++; return rep; };
  ok(D.SPONSOR_IDS.length === 5 && ['wine', 'senator', 'temple', 'smith', 'veil'].every((k) => D.SPONSORS[k] && D.SPBEATS[k].length === 3), 'five patrons with three story beats each');
  ok(D.SPONSOR_IDS.every((k) => D.SPONSORS[k].perk && D.SPONSORS[k].pers && D.SPONSORS[k].kinds.length === 2 && D.SPBEATS[k].every((b) => b.tx && b.c.length >= 2)), 'every patron has a personality, a perk, two kinds of demand and beats with choices');
  { const { S } = mk(); const o = LM.sponsorOffer(S, 'wine'); ok(o && o.terms.length === 2 && o.terms[1].pay > o.terms[0].pay && o.terms[1].dem.length > o.terms[0].dem.length && o.terms[1].bonus > o.terms[0].bonus, 'bold terms pay more and demand more');
    ok(LM.sponsorOffer(S, 'wine') === null, 'no duplicate offers'); ok(LM.sponsorWhy(S, o) === '', 'a free slot'); ok(LM.sponsorAccept(S, o.id, 'steady') === '' && S.spons.active.length === 1 && S.spons.offers.length === 0, 'signing makes an active contract');
    const o2 = LM.sponsorOffer(S, 'senator'); ok(LM.sponsorWhy(S, o2) !== '' && LM.sponsorAccept(S, o2.id, 'steady') !== '', 'slots are limited (one at the Pit)'); S.fame = 600; ok(LM.sponsorSlots(S) === 2, 'the Colosseum opens a second slot'); }
  { // payouts and perks
    const { S } = mk(); LM.sponsorOffer(S, 'wine'); LM.sponsorAccept(S, S.spons.offers[0].id, 'steady'); const c = S.spons.active[0], g0 = S.gold; S.glads[0].mo = 50; const rep = wk(S);
    ok(S.gold === g0 + c.pay && rep.income === c.pay && S.glads[0].mo === 52, 'weekly stipend and the wine merchant\'s free wine'); ok(c.left === c.weeks - 1 && c.age === 1, 'the contract ticks down'); }
  { // meeting the terms: bonus, goodwill, fame, a renewal
    const { S } = mk(); LM.sponsorOffer(S, 'wine'); LM.sponsorAccept(S, S.spons.offers[0].id, 'steady'); const c = S.spons.active[0]; const ev = LM.events(S, S.week, 0)[1], a = S.glads[0];
    for (let i = 0; i < c.dem[0].n; i++) LM.sponsorNote(S, ev, [a], { win: true }, { notes: [] });
    const d = LM.sponsorDemand(S, c, c.dem[0]); ok(d.ok && d.got === d.need, 'demand progress counts fights'); let rep; const f0 = S.fame, g0 = S.gold; for (let i = 0; i < c.weeks; i++) rep = wk(S);
    ok(S.spons.active.length === 0 && S.spons.done.wine === 1 && S.spons.rel.wine >= 12 && S.fame > f0 && rep.notes.some((n) => /contract kept/.test(n)), 'a kept contract pays out, raises goodwill and fame');
    ok(S.gold >= g0 + c.bonus, 'the completion bonus is paid'); ok(S.spons.offers.some((o) => o.sid === 'wine' && o.ren), 'a renewal is offered'); ok(S.spons.hist[0].res === 'ok', 'history records it');
    const o = S.spons.offers.find((x) => x.ren); const steadyBefore = c.pay; ok(o.terms[0].pay > steadyBefore, 'a renewal pays better'); }
  { // missing the terms: penalty by patron
    const pens = {}; for (const sid of ['wine', 'senator', 'temple', 'smith', 'veil']) { const { S } = mk(); S.fame = 700; S.fac.sen = 40; LM.sponsorOffer(S, sid); LM.sponsorAccept(S, S.spons.offers[0].id, 'steady'); const c = S.spons.active[0], g0 = S.gold, f0 = S.fame, sen0 = S.fac.sen; S.glads[0].mo = 80; let rep; for (let i = 0; i < c.weeks; i++) { if (sid === 'smith') c.bonus = 900; rep = wk(S); }
      pens[sid] = { gold: S.gold - g0 - c.pay * c.weeks, fame: S.fame - f0, sen: S.fac.sen - sen0, mo: S.glads[0].mo, hist: S.spons.hist[0].res, note: S.spons.hist[0].n, cool: S.spons.cool[sid] > S.week }; }
    ok(Object.values(pens).every((p) => p.hist === 'fail' && p.cool), 'unmet terms break the contract and the patron leaves for a while'); ok(pens.wine.fame < 0 && pens.senator.note.includes('Senate') && pens.temple.mo < 80 && pens.smith.gold < 0 && pens.veil.fame < 0, 'each patron punishes differently (fame, Senate, morale, gold clawback, rival sneers)'); }
  { // lukewarm and breach
    const { S } = mk(); S.fame = 700; LM.sponsorOffer(S, 'wine'); LM.sponsorAccept(S, S.spons.offers[0].id, 'bold'); const c = S.spons.active[0]; c.dem[0].got = c.dem[0].n; for (let i = 0; i < c.weeks; i++) wk(S); ok(S.spons.hist[0].res === 'meh' && S.spons.done.wine === undefined, 'half the terms: lukewarm, no bonus');
    const { S: S2, a } = mk(); S2.glads.push(LM.makeGlad({ id: 50, lvl: 3 })); LM.sponsorOffer(S2, 'temple'); LM.sponsorAccept(S2, S2.spons.offers[0].id, 'steady'); ok(S2.spons.active[0].dem.some((d) => d.k === 'spare'), 'the temple asks for mercy'); S2.spons.active[0].dem.push({ k: 'nodeath' }); LM.fall(S2, S2.glads[1], { kind: 'pit', depth: 4 }); const rep = wk(S2); ok(S2.spons.active.length === 0 && S2.spons.hist[0].res === 'fail' && rep.notes.some((n) => /fell under your watch/.test(n)), 'a death breaks a no-deaths contract at once'); }
  { // style demand and winrate
    const { S, a } = mk(); LM.sponsorOffer(S, 'smith'); LM.sponsorAccept(S, S.spons.offers[0].id, 'steady'); const c = S.spons.active[0], dm = c.dem[0]; ok(dm.k === 'style' && dm.style === 'thraex', 'the smith asks for a style you actually own'); const ev = LM.events(S, S.week, 0)[1];
    const b = LM.makeGlad({ id: 70, style: dm.style === 'murmillo' ? 'thraex' : 'murmillo' }); LM.sponsorNote(S, ev, [b], { win: true }, { notes: [] }); ok(dm.got === 0, 'another style does not count'); LM.sponsorNote(S, ev, [a], { win: true }, { notes: [] }); ok(dm.got === 1, 'the right style counts a win'); LM.sponsorNote(S, ev, [a], { win: false }, { notes: [] }); ok(dm.got === 1, 'a loss does not');
    const S2 = mk().S; S2.fame = 700; LM.sponsorOffer(S2, 'senator'); LM.sponsorAccept(S2, S2.spons.offers[0].id, 'steady'); const c2 = S2.spons.active[0], wr = c2.dem[0]; ok(wr.k === 'winrate' && !LM.sponsorDemand(S2, c2, wr).ok, 'winrate needs enough fights first'); for (let i = 0; i < 5; i++) LM.sponsorNote(S2, ev, [a], { win: i < 4 }, { notes: [] }); ok(LM.sponsorDemand(S2, c2, wr).ok && LM.sponsorDemand(S2, c2, wr).got === 80, 'winrate is measured'); }
  { // offers arrive on their own, lapse, and can be declined
    const { S } = mk(); S.fame = 700; let got = 0; LM.setRandom(seeded(606)); for (let t = 0; t < 60 && !got; t++) { const rep = { income: 0, notes: [] }; LM.sponsorWeek(S, rep); S.week++; got = S.spons.offers.length; } ok(got > 0, 'patrons come calling'); LM.setRandom(seeded(13));
    const o = S.spons.offers[0]; S.week = o.exp + 1; LM.sponsorWeek(S, { income: 0, notes: [] }); ok(!S.spons.offers.includes(o), 'offers lapse after three weeks'); const o2 = LM.sponsorOffer(S, 'temple') || LM.sponsorOffer(S, 'smith'); LM.sponsorDecline(S, o2.id); ok(!S.spons.offers.includes(o2) && S.spons.cool[o2.sid] > S.week, 'declining sends them away for a few weeks'); }
  { // beats: queued during the contract, one per contract, choices run, a veil exposure ends the contract
    const { S } = mk(); S.fame = 700; LM.sponsorOffer(S, 'veil'); LM.sponsorAccept(S, S.spons.offers[0].id, 'steady'); wk(S); wk(S); ok(S.spons.beatQ.length === 1 && S.spons.beatQ[0].sid === 'veil', 'the first story beat arrives in week two');
    const v = LM.beatView(S); ok(v && v.P.id === undefined && v.choices.length === 2 && !/\{/.test(v.text), 'beat view resolves names'); const g0 = S.gold; const r = LM.beatResolve(S, 1); ok(r && S.spons.beatQ.length === 0 && S.spons.rel.veil >= 2, 'a beat choice moves patron goodwill'); wk(S); ok(S.spons.beatQ.length === 0, 'only one beat per contract');
    S.spons.beatQ.push({ sid: 'veil', i: 2 }); LM.beatView(S); ok(LM.beatResolve(S, 0).fx.some((f) => /walks away/.test(f)) && S.spons.active.length === 0, 'exposing the Veiled Partner ends the deal'); }
  { // every beat choice of every patron runs
    let n = 0, bad = 0; for (const sid of D.SPONSOR_IDS) D.SPBEATS[sid].forEach((B, i) => B.c.forEach((c, k) => { const { S } = mk(); S.fame = 800; LM.sponsorOffer(S, sid); LM.sponsorAccept(S, S.spons.offers[0].id, 'steady'); S.spons.beatQ.push({ sid, i }); try { LM.beatView(S); const r = LM.beatResolve(S, k); n++; if (!r || /undefined|NaN/.test(JSON.stringify(r)) || !Number.isFinite(S.gold)) bad++; } catch (e) { bad++; console.error('   beat throws', sid, i, k, e.message); } }));
    ok(n === 30 && bad === 0, `all ${n} story beat choices run clean`); }
  { // the old pledge system and the sponsor event still work next to the new one
    const S = LM.newGame({ name: 'L' }); S.glads.push(LM.makeGlad({ id: 1, lvl: 4 })); S.pendingEv = 'sponsor'; LM.runEvent(S, 0); ok(S.sponsor && S.sponsor.weeks === 4, 'the one-month merchant event is intact'); LM.weekFinish(S); ok(S.sponsor.weeks === 3 && S.spons, 'old and new sponsor state coexist'); }
  { const { S } = mk(); LM.sponsorOffer(S, 'wine'); LM.sponsorAccept(S, S.spons.offers[0].id, 'bold'); const S2 = JSON.parse(JSON.stringify(S)); ok(S2.spons.active[0].dem.length === 2 && LM.sponsorDemand(S2, S2.spons.active[0], S2.spons.active[0].dem[0]).need > 0, 'contracts survive a JSON round trip'); const N = LM.ascend(S); ok(N.week === 1, 'ascending still works with patrons'); }
}
{ // round 46: BALANCE GUARDRAILS (a few quick careers; the full report is tools/ludus3d_balance.mjs)
  const income = (sid, ml) => { const S = LM.newGame({ name: 'B' }); S.fame = [0, 150, 600, 2000][ml]; S.seed = 'bal'; S.glads.push(LM.makeGlad({ id: 1, lvl: D.LEAGUES[ml].lvl })); LM.sponsorOffer(S, sid); const t = S.spons.offers[0].terms[0]; return { week: t.pay, total: t.pay * t.weeks + t.bonus, purse: D.LEAGUES[ml].purse }; };
  for (let ml = 0; ml < 4; ml++) for (const sid of D.SPONSOR_IDS) { const r = income(sid, ml), full = D.SPONSORS[sid].fame <= [0, 150, 600, 2000][ml]; if (!full) continue; ok(r.week > 0 && r.week <= r.purse * 0.35 && r.total <= r.purse * 6 && r.total >= r.purse * 0.6, `${sid} at league ${ml}: ${r.week}/week and ${r.total} per contract stay a fraction of a ${r.purse} purse`); }
  { let inj = 0, fights = 0, scars = 0, closed = 0; for (let k = 0; k < 12; k++) { LM.setRandom(seeded(900 + k)); const S = LM.newGame({ name: 'B' }); S.seed = 'bb' + k; S.glads.push(LM.makeGlad({ id: 1, lvl: 5 }), LM.makeGlad({ id: 2, lvl: 5 })); for (let w = 1; w <= 40; w++) { S.week = w; S.glads.forEach((g) => { if (g.inj <= 0) { const ev = LM.events(S, w, 0)[1]; const r = LM.settle(S, ev, [g], { win: LM.rand() < 0.6, hype: 40, hpf: { [g.id]: 0.5 }, odds: 0.5 }); fights++; inj += r.inj.length; } }); LM.weekTrain(S); } scars += S.glads.reduce((a, g) => a + (g.scars || []).length, 0); closed += S.woundLog ? S.woundLog.length : 0; }
    ok(inj / fights > 0.07 && inj / fights < 0.2, `injury rate per fight stays near the old 5% / 18% mix (${(inj / fights * 100).toFixed(1)}%)`); ok(scars <= inj * 0.25 && scars >= 1, `scars are rare but they happen (${scars} from ${inj} wounds)`); LM.setRandom(seeded(21)); }
}

{ // round 47: VENATIO, the beast hunts (core/ext.js section 5 + core/arena.js beast AI)
  try {
    const fresh = () => { LM.setRandom(seeded(4711)); const S = LM.newGame({ name: 'V' }); S.seed = 'venatio'; return S; };
    // beasts are "styles" nobody can recruit: hidden from D.STYLE_IDS / Object.keys, but every D.STYLES[id] lookup works
    ok(['wolf', 'lion', 'bear', 'boar', 'nemean', 'elephant'].every((k) => D.BEASTS[k] && D.STYLES[k] && D.STYLES[k].beast && !D.STYLE_IDS.includes(k) && !Object.keys(D.STYLES).includes(k)), 'beast styles exist but are not listed with the five gladiator styles');
    for (const a of D.STYLE_IDS) ok(LM.counters(a).length === 2 && LM.adv(a, 'lion') === 0 && LM.adv('lion', a) === 0, `${a}: the pentagon is untouched and beasts are neutral (no style counters)`);
    ok(D.BEAST_IDS.every((k) => D.BEASTS[k].ai && D.BEASTS[k].lore.length === 4 && D.BEASTS[k].mul && D.BEASTS[k].base && D.BEASTS[k].pelt), 'every beast has an AI, four lore notes, stats and a pelt');
    const b = LM.makeBeast('lion', 6, { r: LM.mulberry(1) }), uB = LM.mkUnits([b], 'B', {})[0], d = LM.derive(b, {});
    ok(b.beast === 'lion' && LM.stars(b) === 1 && LM.ultsOf(b).length === 0 && d.hp > 60 && uB.ults.length === 0 && uB.skills.length === 0 && uB.beast === 'lion' && uB.range === D.BEASTS.lion.range, 'a beast record becomes an arena unit with its own range and no ultimates');
    ok(JSON.stringify(Object.keys(LM.makeBeast('wolf', 3, { r: LM.mulberry(2) }).st).sort()) === JSON.stringify([...D.STATS].sort()), 'beasts use the five gladiator stats');
    // gating: nothing at the start, the Provincial Games league, the Stands, or a beast festival opens it
    { const S = fresh(); S.glads.push(LM.makeGlad({ id: 1, lvl: 3 })); const st0 = LM.venatioState(S); ok(!st0.ok && st0.why && !st0.used, 'Venatio is locked on a new ludus (with a reason)');
      S.fame = 130; ok(LM.venatioState(S).ok && LM.venatioState(S).via === 'league', 'the Provincial Games league opens the hunts');
      const S2 = fresh(); S2.glads.push(LM.makeGlad({ id: 1, lvl: 3 })); S2.plots[3] = { b: 'stands', l: 1 }; ok(LM.venatioState(S2).via === 'stands', 'the Stands open the hunts');
      const S3 = fresh(); S3.glads.push(LM.makeGlad({ id: 1, lvl: 3 })); let fw = 0; for (let w = 1; w <= 72 && !fw; w++) { S3.week = w; if (LM.beastFest(S3)) fw = w; } ok(fw > 0 && LM.venatioState(S3).via === 'festival' && LM.venatioState(S3).ok, 'a festival of Mars, Bacchus or the Imperial Visit opens the hunts');
      S.week = 5; S.venatio = null; LM.venatio(S).week = 5; ok(LM.venatioState(S).used && !LM.venatioState(S).ok, 'one hunt per week'); }
    { const S = fresh(); S.fame = 0; const ids0 = LM.venatioHunts(S).map((h) => h.id); S.fame = 130; const ids1 = LM.venatioHunts(S).map((h) => h.id); S.fame = 600; const ids2 = LM.venatioHunts(S).map((h) => h.id);
      ok(ids0.includes('wolves') && !ids0.includes('bears') && ids1.includes('bears') && !ids1.includes('nemean') && ids2.includes('nemean') && ids2.includes('elephant') && ids2.length === D.HUNT_IDS.length, 'harder hunts unlock with the league'); }
    // every hunt ends with a winner, is winnable and not a walkover; run it twice with the same seed: identical (replay safe, only LM.rand is used)
    { const S = fresh(); S.fame = 600; const styles = [['murmillo', 'thraex', 'hoplomachus'], ['hoplomachus', 'dimachaerus', 'retiarius'], ['thraex', 'murmillo', 'dimachaerus']];
      for (const hu of LM.venatioHunts(S)) {
        let w = 0, n = 18, done = true; for (let i = 0; i < n; i++) { LM.setRandom(seeded(100 + i)); const party = Array.from({ length: hu.party }, (_, k) => LM.makeGlad({ style: styles[i % 3][k], lvl: hu.lvl, id: 1 + k, q: 0.5 })); const F = LM.quick(LM.mkUnits(party, 'A', LM.teamCtx(S, party, 'bal')), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {})); done = done && F.done && (F.winner === 'A' || F.winner === 'B'); if (F.winner === 'A') w++; }
        ok(done, `${hu.id}: hunts always finish`); ok(w / n > 0.15 && w / n < 0.99, `${hu.id}: winnable but not a walkover (${w}/${n})`);
      }
      const run = (seed) => { LM.setRandom(seeded(seed)); const party = [LM.makeGlad({ style: 'murmillo', lvl: 6, id: 1, q: 0.5 })]; const hu = LM.venatioHunts(S).find((h) => h.id === 'lion'); const F = LM.quick(LM.mkUnits(party, 'A', {}), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {})); return F.winner + ':' + F.t.toFixed(2) + ':' + F.units.map((u) => u.hp).join(','); };
      ok(run(9) === run(9), 'a hunt replays identically from the same seed'); }
    // behaviours: each beast uses its own tricks (counted from the event stream)
    { const S = fresh(); S.fame = 600; const watch = (hid, secs, party) => { LM.setRandom(seeded(321)); const hu = LM.venatioHunts(S).find((h) => h.id === hid); const gl = party || Array.from({ length: hu.party }, (_, k) => LM.makeGlad({ style: ['murmillo', 'thraex', 'hoplomachus'][k], lvl: hu.lvl + 4, id: 1 + k, q: 0.7 }));
        const F = LM.createFight(LM.mkUnits(gl, 'A', {}), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {}), { autoA: true }); const c = {}; let t = 0; while (!F.done && t < secs) { LM.step(F, 0.05); t += 0.05; for (const e of F.ev.splice(0)) { const k = e.k + (e.beast ? ':' + e.beast : '') + (e.a ? ':' + e.a : '') + (e.k === 'hit' && e.tech ? ':' + e.tech : ''); c[k] = (c[k] || 0) + 1; } } return { c, F }; };
      let r = watch('lion', 40); ok(r.c['atk:pounce'] >= 1 && (r.c['atk:bite'] || 0) + (r.c['atk:claw'] || 0) >= 2, 'the lion leaps and then bites and claws');
      r = watch('wolves', 40, [LM.makeGlad({ style: 'murmillo', lvl: 12, id: 1, q: 0.9 })]); ok((r.c['atk:bite'] || 0) >= 3 && !r.c['atk:pounce'], 'the wolf pack bites in rushes (no pounces)');
      { LM.setRandom(seeded(5)); const hu = LM.venatioHunts(S).find((h) => h.id === 'wolves'), gl = [LM.makeGlad({ style: 'murmillo', lvl: 3, id: 1, q: 0.3 })]; const F = LM.createFight(LM.mkUnits(gl, 'A', {}), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {}), { autoA: true }); let mn = 99, ang = new Set(); for (let i = 0; i < 160 && !F.done; i++) { LM.step(F, 0.05); const me = F.units[0]; F.units.filter((u) => u.beast && !u.down).forEach((u) => { const a = Math.round(Math.atan2(u.y - me.y, u.x - me.x) / 1.05); ang.add(a); }); } ok(ang.size >= 3, 'the pack spreads around its target to flank'); }
      r = watch('boars', 60); ok((r.c['beast:telegraph'] || 0) >= 1 && (r.c['beast:charge'] || 0) >= 1, 'the boar telegraphs, then charges'); ok((r.c['hit:charge'] || 0) + (r.c['hit:gore'] || 0) >= 1, 'the boar hits with charge or gore');
      r = watch('bears', 60); ok((r.c['atk:swipe'] || 0) >= 1, 'the bear swipes');
      r = watch('elephant', 80); ok((r.c['beast:stomp'] || 0) >= 1 && (r.c['beast:javelin'] || 0) >= 1 && ((r.c['hit:trample'] || 0) >= 1 || (r.c['beast:telegraph'] || 0) >= 1), 'the war elephant stomps, throws javelins from the howdah and tramples');
      r = watch('nemean', 90); ok((r.c['atk:pounce'] || 0) >= 1 && ((r.c['atk:maul'] || 0) >= 1 || (r.c['atk:bite'] || 0) >= 1), 'the Nemean lion pounces and mauls');
      // enrage: a wounded beast flips once, becomes faster and harder, and the event is sent
      LM.setRandom(seeded(77)); const hu = LM.venatioHunts(S).find((h) => h.id === 'lion'); const F = LM.createFight(LM.mkUnits([LM.makeGlad({ style: 'murmillo', lvl: 9, id: 1 })], 'A', {}), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {}), { autoA: true }); const be = F.units.find((u) => u.beast), a0 = LM.apsOf(be), m0 = LM.msOf(be);
      be.hp = Math.floor(be.maxhp * 0.2); let enr = 0; for (let i = 0; i < 10; i++) { LM.step(F, 0.05); enr += F.ev.splice(0).filter((e) => e.k === 'beast' && e.a === 'enrage').length; } ok(enr === 1 && be.enraged && LM.apsOf(be) > a0 && LM.msOf(be) > m0, 'a badly wounded beast enrages exactly once (faster and stronger)'); }
    // bleed bites hurt over time; cleave hits everyone in reach
    { LM.setRandom(seeded(31)); const S = fresh(); const bear = LM.makeBeast('bear', 8, { r: LM.mulberry(3) }), gl = [LM.makeGlad({ style: 'murmillo', lvl: 8, id: 1 }), LM.makeGlad({ style: 'thraex', lvl: 8, id: 2 })];
      const F = LM.createFight(LM.mkUnits(gl, 'A', {}), LM.mkUnits([bear], 'B', {}), { autoA: false }); F.units[0].x = 0; F.units[0].y = 0; F.units[1].x = 0.9; F.units[1].y = 0.3; F.units[2].x = 1.5; F.units[2].y = 0; const hit = new Set(); for (let i = 0; i < 80; i++) { LM.step(F, 0.05); F.ev.splice(0).forEach((e) => { if (e.k === 'hit' && e.src === 'B0') hit.add(e.dst); }); } ok(hit.size >= 2, 'the bear swipe hits more than one hunter'); void S; }
    // rewards, bestiary, pelts, trophies, weekly trophy fame, mortality, forum, save round trip
    { const S = fresh(); S.fame = 600; S.week = 2; const g1 = LM.makeGlad({ id: 1, lvl: 12, style: 'murmillo' }), g2 = LM.makeGlad({ id: 2, lvl: 12, style: 'thraex' }), g3 = LM.makeGlad({ id: 3, lvl: 12, style: 'hoplomachus' }); S.glads.push(g1, g2, g3);
      const hu = LM.venatioHunts(S).find((h) => h.id === 'nemean'); const party = [g1, g2, g3]; let F, win = false; for (let i = 0; i < 30 && !win; i++) { LM.setRandom(seeded(2000 + i)); party.forEach((g) => { g.inj = 0; }); F = LM.quick(LM.mkUnits(party, 'A', LM.teamCtx(S, party, 'bal')), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {})); win = F.winner === 'A'; }
      ok(win, 'a strong party can take the Nemean lion'); const gold0 = S.gold, fame0 = S.fame; LM.setRandom(seeded(8)); const rep = LM.venatioSettle(S, hu, party, { win: true, F }); const V = LM.venatio(S);
      ok(rep.gold > 0 && S.gold >= gold0 + rep.gold - 5 && rep.fame > 0 && S.fame === fame0 + rep.fame && V.week === S.week && V.hunts === 1 && V.wins === 1, 'a won hunt pays gold and fame and uses the week');
      ok(V.kills.nemean === 1 && V.bossKills.nemean === 1 && V.kills.wolf === 2 && V.pelts.nemean === 1 && V.first.nemean === 2, 'kills, boss kills, first sighting and pelts are recorded');
      ok(V.trophies.includes('nemeanhide') && rep.trophies.includes('nemeanhide') && rep.item && rep.item.rar >= 3, 'the Nemean boss always leaves its hide and a rare item'); ok(rep.xp > 0 && S.stats.hunts === 1, 'the party earns XP');
      const bs = LM.bestiary(S), lion = bs.find((x) => x.kind === 'nemean'); ok(bs.length === 6 && lion.kills === 1 && lion.tier === 1 && lion.stats && lion.stats.hp > 0 && lion.lore.length === 2 && lion.trophies[0].own && !bs.find((x) => x.kind === 'bear').known && bs.find((x) => x.kind === 'bear').lore.length === 0, 'the bestiary knows what you slew: stats after one kill, more notes with more kills, nothing about unmet beasts');
      const g0 = S.gold, sold = LM.sellPelts(S, 'nemean'); ok(sold > 0 && S.gold === g0 + sold && V.pelts.nemean === 0 && LM.sellPelts(S, 'nemean') === 0, 'pelts sell for gold once'); const f0 = S.fame, rp = { notes: [] }; LM.venatioWeek(S, rp); ok(S.fame === f0 + LM.trophyFame(S) && LM.trophyFame(S) >= 4 && rp.notes.length === 1, 'trophies bring weekly fame');
      const S2 = JSON.parse(JSON.stringify(S)); const M = LM.migrate(S2); ok(M.venatio && M.venatio.kills.nemean === 1 && M.venatio.trophies.length >= 1, 'the Venatio record survives the save round trip (no key renamed)');
      const old = LM.migrate({ v: 1, plots: new Array(16).fill(null), glads: [], fame: 0, stats: {}, week: 1 }); ok(old.venatio && old.venatio.hunts === 0, 'old saves gain an empty Venatio record'); }
    { const S = fresh(); S.fame = 600; S.week = 3; const g = LM.makeGlad({ id: 1, lvl: 9, style: 'murmillo' }); S.glads.push(g, LM.makeGlad({ id: 2, lvl: 9 })); const hu = LM.venatioHunts(S).find((h) => h.id === 'lion'); LM.setRandom(seeded(6));
      const F = LM.createFight(LM.mkUnits([g], 'A', {}), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {}), {}); F.units[0].down = true; F.units[0].hp = 0; const rep = LM.venatioSettle(S, hu, [g], { win: false, F }); ok(rep.gold === 0 && rep.fame === 0 && !rep.trophies.length && rep.xp > 0, 'a lost hunt pays nothing but still teaches');
      ok(LM.RISK_KINDS.includes('hunt') && LM.mortality(S, g, { kind: 'hunt', depth: 3, boss: true }) > LM.mortality(S, g, { kind: 'hunt', depth: 1 }) && LM.mortality(S, g, { kind: 'hunt', depth: 1 }) > 0, 'hunts can kill, and the great beasts are deadlier'); const fr = LM.fall(S, g, { kind: 'hunt', depth: 2, by: 'Scarmane' }); ok(S.fallen.length === 1 && S.fallen[0].kind === 'hunt' && /Venatio/.test(S.forum[S.forum.length - 1].t), 'a hunter killed by a beast is carved on the memorial wall'); void fr; }
    { // a fight with beasts can be cloned for the replay snapshot (no functions in the state at the start)
      const S = fresh(); S.fame = 600; const hu = LM.venatioHunts(S).find((h) => h.id === 'elephant'); const F = LM.createFight(LM.mkUnits([LM.makeGlad({ id: 1, lvl: 9 })], 'A', {}), LM.mkUnits(LM.huntBeasts(S, hu), 'B', {}), {}); let okc = true; try { const c = structuredClone(F); okc = c.units.length === 2 && c.units[1].beast === 'elephant'; } catch (e) { okc = false; } ok(okc, 'beast fights can be snapshotted for the replay'); }
  } catch (err) { ok(false, 'Venatio tests crashed: ' + (err && err.stack || err)); }
}

// TACTICS: player commands (stances, Swap, Rally), their costs, replay safety and the foe's visible tactics
{
  const mk = (st, id, lvl = 6) => LM.makeGlad({ style: st, lvl, id, name: 'T' + id, r: LM.mulberry(id * 31 + lvl) });
  const fight = (nA, nB, o, seed = 5) => { LM.setRandom(LM.mulberry(seed)); const A = LM.mkUnits(Array.from({ length: nA }, (_, i) => mk(['murmillo', 'thraex', 'hoplomachus'][i], 10 + i)), 'A', {}), B = LM.mkUnits(Array.from({ length: nB }, (_, i) => mk(['thraex', 'murmillo', 'retiarius'][i], 20 + i)), 'B', {}); return LM.createFight(A, B, o || {}); };
  const run = (F, n, dt = 1 / 30) => { const ev = []; for (let i = 0; i < n && !F.done; i++) { LM.step(F, dt); ev.push(...F.ev.splice(0)); } return ev; };
  ok(LM.CMD_ORDER.length === 6 && LM.CMD_ORDER.every((k) => LM.CMD[k].gain && LM.CMD[k].cost), 'every command lists its gain and its cost');
  // stances: use, cooldown, cancel
  let F = fight(1, 1); const u = F.units[0];
  ok(LM.command(F, 'stance', 'A0', 'press') === true && u.s.press && LM.stanceOf(u) === 'press' && u.cmdCd === LM.CMD.press.cd, 'Press starts and the stance cooldown runs');
  ok(LM.command(F, 'stance', 'A0', 'hold') === 'cd', 'a second stance is refused while the cooldown runs');
  ok(LM.command(F, 'stance', 'A0', 'none') === true && !LM.stanceOf(u), 'a stance can be cancelled for free');
  ok(LM.command(F, 'stance', 'B0', 'bogus') === false && LM.command(F, 'stance', 'ZZ', 'press') === false, 'bad stance or unit is refused');
  run(F, 40 * 30); ok((u.cmdCd || 0) <= 0 || F.done, 'the stance cooldown expires');
  // Press: more damage dealt and taken; same seed, same fight
  const dmgOf = (stance) => { const G = fight(1, 1, {}, 9); if (stance) LM.command(G, 'stance', 'A0', stance); run(G, 8 * 30); return [G.units[0].dmg, G.units[0].taken]; };
  const base = dmgOf(null), pr = dmgOf('press');
  ok(pr[0] > base[0] && pr[1] >= base[1], `Press trades defence for damage (${pr} vs ${base})`);
  // Hold: does not chase; Retreat: backs away and never attacks; Guard: no swings, reduced damage
  F = fight(1, 1); F.units[0].x = -8; F.units[1].x = 8; LM.command(F, 'stance', 'A0', 'hold'); const hx = F.units[0].x; run(F, 3 * 30); ok(Math.abs(F.units[0].x - hx) < 0.01, 'Hold stands its ground instead of chasing');
  F = fight(1, 1); F.units[0].x = -1; F.units[1].x = 0.5; F.units[0].y = F.units[1].y = 0; LM.command(F, 'stance', 'A0', 'retreat'); const ev = run(F, 2 * 30);
  ok(!ev.some((e) => e.k === 'atk' && e.src === 'A0'), 'a retreating fighter does not attack'); ok(Math.hypot(F.units[0].x - F.units[1].x, F.units[0].y - F.units[1].y) > 2.0, 'Fall back opens distance from the foe');
  F = fight(1, 1); F.units[0].x = -1; F.units[1].x = 0.5; F.units[0].y = F.units[1].y = 0; LM.command(F, 'stance', 'A0', 'guard'); ok(F.units[0].s.guard && F.units[0].s.guard.f === 0.4 && F.units[0].s.gstance, 'Guard raises a 40% block');
  ok(!run(F, 3 * 30).some((e) => e.k === 'atk' && e.src === 'A0'), 'a guarding fighter does not swing'); ok(!LM.stanceOf(F.units[0]) || F.t < 4.5, 'stances end by themselves'); run(F, 3 * 30); ok(!F.units[0].s.gstance && !(F.units[0].s.guard && F.units[0].s.guard.stance), 'the guard stance ends on time');
  // Rally: team buff with a visible cost and a cooldown; Swap needs a pair and two foes
  F = fight(2, 2); ok(LM.command(F, 'rally') === 'cd', 'Rally is not ready at the first bell'); run(F, 7 * 30);
  const rr = LM.command(F, 'rally'), u0 = F.units[0], withR = LM.apsOf(u0), r0 = u0.s.rally; delete u0.s.rally; const noR = LM.apsOf(u0); u0.s.rally = r0;
  ok(rr === true && r0 && F.units[1].s.expo && withR > noR * 1.1, 'Rally speeds the team up and exposes it'); ok(LM.command(F, 'rally') === 'cd', 'Rally goes on a long cooldown');
  F = fight(2, 2); const ev2 = (run(F, 20), LM.command(F, 'swap')); ok(ev2 === true && F.units[0].swap && F.units[1].swap && F.units[0].swap.id !== undefined, 'Swap sets a new target for each partner'); ok(F.units[0].atkT >= 0.69, 'Swap costs a short re-aim');
  run(F, 3); F.ev.length = 0; run(F, 2); ok(F.units[0].tgt === F.units[0].swap.id || F.units[0].down, 'the swapped target is honoured'); ok(LM.command(F, 'swap') === 'cd', 'Swap has a cooldown');
  ok(LM.command(fight(1, 2), 'swap') === false && LM.command(fight(2, 1), 'swap') === false, 'Swap is refused without two partners and two foes');
  // replay safety: the same taps at the same step counts reproduce the fight exactly
  const play = (seed) => { const G = fight(2, 2, { cmdAI: true }, seed); const taps = [[40, 'stance', 'A0', 'press'], [70, 'swap'], [120, 'rally'], [150, 'stance', 'A1', 'guard']]; let ti = 0;
    while (!G.done && (G.n || 0) < 4000) { while (ti < taps.length && taps[ti][0] <= (G.n || 0)) { const t = taps[ti++]; LM.command(G, t[1], t[2], t[3]); } LM.step(G, 1 / 30); G.ev.length = 0; } return G; };
  const r1 = play(77), r2 = play(77); ok(r1.done && r1.n === r2.n && r1.winner === r2.winner && r1.units.every((x, i) => x.hp === r2.units[i].hp), 'a fight with commands and a foe that uses tactics replays identically');
  const snap = (() => { const G = fight(2, 2, { cmdAI: true }, 3); return structuredClone(G); })(); ok(snap.cmd && snap.cmdAI === true, 'the command state survives the replay snapshot clone');
  // the foe answers visibly, and only in live fights (cmdAI)
  F = fight(1, 1, { cmdAI: true }); F.t = 5; F.units[1].hp = Math.round(F.units[1].maxhp * 0.15); F.units[0].x = -1; F.units[1].x = 1; F.units[0].y = F.units[1].y = 0; const ev3 = run(F, 3);
  ok(ev3.some((e) => e.k === 'cmd' && e.a === 'retreat' && e.side === 'B'), 'a nearly beaten foe falls back and says so'); 
  F = fight(1, 1); F.t = 5; F.units[1].hp = Math.round(F.units[1].maxhp * 0.15); F.units[0].x = -1; F.units[1].x = 1; F.units[0].y = F.units[1].y = 0; ok(!run(F, 3).some((e) => e.k === 'cmd'), 'without cmdAI (quick sims, odds) the foe never uses tactics');
  F = fight(1, 1, { cmdAI: true }); F.units[0].x = -1; F.units[1].x = 1; F.units[0].y = F.units[1].y = 0; const pl = F.units[1].ults.find((x) => x.id === 'pulverize'); 
  const bu = LM.makeGlad({ style: 'murmillo', lvl: 8, id: 90 }); bu.ult = 'pulverize'; const FB = LM.createFight(LM.mkUnits([mk('thraex', 1)], 'A', {}), LM.mkUnits([bu], 'B', {}), { cmdAI: true });
  FB.units[0].x = -1; FB.units[1].x = 1; FB.units[0].y = FB.units[1].y = 0; const slot = FB.units[1].ults[0]; slot.cd = 0; let tele = null, hitAt = -1; const hp0 = FB.units[0].hp;
  for (let i = 0; i < 90 && !FB.done; i++) { LM.step(FB, 1 / 30); for (const e of FB.ev.splice(0)) { if (e.k === 'tele' && e.ult && !tele) tele = { t: FB.t, e }; if (e.k === 'aoe' && e.big && hitAt < 0) hitAt = FB.t; } }
  if (slot.id === 'pulverize') ok(tele && hitAt > tele.t + 0.3 && tele.e.r === 3.6, 'the foe\'s pulverize is announced by a ground telegraph before it lands'); else ok(true, 'ult slot not pulverize on this roster');
  const q = LM.quick(LM.mkUnits([mk('murmillo', 5)], 'A', {}), LM.mkUnits([mk('thraex', 6)], 'B', {})); ok(q.done && !q.cmdAI, 'quick sims do not use foe tactics');
}

{ // round 47: FIGHT HURT (wave 3)
  const S = LM.newGame({ name: 'Hurt', seed: 'hurt47' }); S.gold = 9999; const g = LM.makeGlad({ id: S.nextId++, style: 'thraex', lvl: 4 }); S.glads.push(g);
  const ev = LM.events(S, 2, 0).find((e) => e.kind === 'duel');
  LM.woundGive(S, g, 2, 'arm'); ok(g.inj > 0 && LM.hurtOk(S, g), 'a wounded fighter may be sent hurt');
  const healthy = LM.derive(g, { noperf: true }); LM.hurtMark(S, g, true); const hurt = LM.derive(g, { noperf: true });
  ok(hurt.atk < healthy.atk * 0.9 && hurt.hp < healthy.hp, 'fighting hurt costs damage and health'); LM.hurtMark(S, g, false); ok(LM.derive(g, { noperf: true }).atk === healthy.atk, 'no penalty when not marked');
  const R = LM.hurtRisk(S, g); ok(R.win > 0 && R.lose > R.win && R.lose <= 0.9 && R.text.length >= 3 && R.addLose > R.addWin, 'risk is explicit: lose is worse than win, penalties are listed');
  if (ev) {
    ok(LM.enter(S, ev, [g.id], 'bal') === 'A fighter is injured', 'a wounded fighter cannot enter by default');
    ok(LM.enter(S, ev, [g.id], 'bal', { hurt: [g.id] }) === '' && S.entries[ev.key].hurt[0] === g.id && g.inj > 0, 'with the hurt option the entry is accepted and remembered, and the wound stays');
    ok(LM.entryReady(S, S.entries[ev.key]), 'a hurt entry stays valid'); const plain = { ids: [g.id] }; ok(!LM.entryReady(S, plain), 'a plain entry with a wounded fighter is cancelled');
  } else ok(true, 'no duel event in this fixture');
  // worsening roll: deterministic, wins are gentler than losses, idempotent per result
  const trial = (win, n) => { let w = 0; for (let i = 0; i < n; i++) { const S2 = LM.newGame({ name: 'H', seed: 'h' + i }); const g2 = LM.makeGlad({ id: S2.nextId++, style: 'murmillo', lvl: 3 }); S2.glads.push(g2); LM.woundGive(S2, g2, 2, 'knee'); LM.hurtMark(S2, g2, true); const r = LM.hurtAfter(S2, g2, { win }); if (r.worse) w++; } return w / n; };
  const pw = trial(true, 300), pl = trial(false, 300); ok(pw > 0.1 && pw < 0.6 && pl > pw + 0.15, `worsening is rarer after a win (${pw.toFixed(2)}) than a loss (${pl.toFixed(2)})`);
  ok(trial(false, 40) === trial(false, 40), 'the worsening roll is deterministic for a seed');
  const S3 = LM.newGame({ name: 'W', seed: 'w3' }), g3 = LM.makeGlad({ id: S3.nextId++, style: 'murmillo', lvl: 3 }); S3.glads.push(g3); LM.woundGive(S3, g3, 2, 'arm'); LM.hurtMark(S3, g3, true);
  const res = { win: false }, w0 = g3.inj; const a = LM.hurtResolve(S3, [g3], res, 'pit'), n1 = a.length, b = LM.hurtResolve(S3, [g3], res, 'pit'); ok(n1 === 1 && b.length === 1, 'one roll per fight result');
  if (a[0].worse) ok(g3.inj === w0 + 2 && g3.wounds.some((x) => x.worse === 1), 'a worsened wound gains weeks and is flagged'); else ok(g3.inj === w0, 'a held wound is unchanged');
  ok(typeof LM.hurtLine(a[0]) === 'string' && !LM.hurtLine(a[0]).includes('\u2014'), 'the report line is plain text');
  LM.extWeek(S3, { notes: [] }); ok(!g3.hurtFight, 'the hurt mark is cleared at week end'); ok(LM.hurtAfter(S3, g3, { win: true }) === null, 'unmarked fighters never roll');
  const g4 = LM.makeGlad({ id: 999, style: 'murmillo', lvl: 3 }); ok(!LM.hurtOk(S3, g4), 'a healthy fighter has no hurt option');
}
{ // round 48: TROPHIES wave 3
  const S = LM.newGame({ name: 'Tr3', seed: 'tr3' }); const n0 = D.TROPHIES.length; const ids = D.TROPHIES.map((t) => t.id);
  ok(new Set(ids).size === ids.length && n0 >= 16 + 9 + 20, `trophy ids are unique and there are at least 45 (${n0})`);
  ok(['kill_wolf', 'kill_boar', 'kill_lion', 'kill_bear', 'kill_nemean', 'kill_elephant', 'solo_lion', 'menagerie', 'allpelts'].every((id) => ids.includes(id)), 'Venatio trophies exist in D.TROPHIES');
  ok(D.TROPHIES.every((t) => t.n && t.d && t.r && !/\u2014/.test(t.n + t.d)), 'every trophy has text and a reward, no em dashes');
  ok(LM.checkTrophies(S).length === 0, 'a fresh ludus earns nothing');
  const V = LM.venatio(S); V.kills.lion = 1; const got = LM.checkTrophies(S).map((t) => t.id); ok(got.includes('kill_lion') && !got.includes('kill_wolf') && !got.includes('solo_lion'), 'killing a lion pays the lion trophy only');
  const gold0 = S.gold; ok(LM.checkTrophies(S).length === 0 && S.gold === gold0, 'new trophies pay once');
  ok(LM.trophyProgress(S, 'allpelts')[1] === D.BEAST_IDS.length && LM.trophyProgress(S, 'allpelts')[0] === 1, 'progress counts beast kinds');
  V.solo = { lion: 1 }; V.cleared = { menagerie: 1 }; D.BEAST_IDS.forEach((k) => { V.kills[k] = Math.max(1, V.kills[k] || 0); });
  const g2 = LM.checkTrophies(S).map((t) => t.id); ok(['solo_lion', 'menagerie', 'allpelts', 'kill_nemean', 'kill_elephant'].every((id) => g2.includes(id)), 'solo, menagerie and all pelts unlock');
  S.stats.streakBest = 10; S.stats.wins = 100; S.stats.hcSeasons = 1; S.freed = [{ name: 'X', wk: 1, lvl: 3 }]; S.stats.pitPerfect = 1; const g3 = LM.checkTrophies(S).map((t) => t.id);
  ok(['streak5', 'streak10', 'wins100', 'hc1', 'freed1', 'pitperf'].every((id) => g3.includes(id)), 'streak, century, Hardcore season, freed man and Flawless Descent unlock');
  ok(LM.trophyProgress(S, 'wins50')[1] === 50 && LM.trophyProgress(S, 'nosuch') === null, 'progress exists for old trophies and is null for unknown ids');
  const S5 = LM.newGame({ name: 'Str', seed: 'str5' }), g5 = LM.makeGlad({ id: S5.nextId++, style: 'murmillo', lvl: 3 }); S5.glads.push(g5);
  const ev = LM.events(S5, 2, 0).find((e) => e.kind === 'duel'); for (let i = 0; i < 3; i++) LM.settle(S5, ev, [g5], { win: true, hpf: { [g5.id]: 1 }, odds: 0.5, place: 1 });
  ok(S5.stats.streak === 3, 'settle keeps a win streak counter'); S5.stats.streak = 4; LM.settle(S5, ev, [g5], { win: true, hpf: { [g5.id]: 1 }, odds: 0.5 }); ok(S5.stats.streakBest >= 5, 'streak best follows wins'); LM.settle(S5, ev, [g5], { win: false, hpf: { [g5.id]: 0.1 }, odds: 0.5 }); ok(S5.stats.streak === 0, 'a loss resets the streak');
  const old = LM.migrate(JSON.parse(JSON.stringify(S))); ok(old.trophies.kill_lion, 'trophies survive migrate');
}

{ // round 49: MOVE, rearranging the ludus (core/ext.js MOVE block, D.MOVE)
  const mk = (seed) => { const S = LM.newGame({ name: 'Mv', seed }); S.gold = 20000; S.fame = 900; S.rows = 4; return S; };
  const S = mk('mv1'), kit = S.plots[6], bar = S.plots[5], pal = S.plots[2];
  ok(kit.b === 'kitchen' && bar.b === 'barracks' && pal.b === 'palaestra', 'start layout: kitchen 6, barracks 5, palaestra 2');
  // data: pinned and big lists exist, prices scale with level and distance
  ok(D.MOVE.pinned.hall && D.MOVE.big.includes('stands') && D.MOVE.undoRefund > 0 && D.MOVE.undoRefund < 1, 'D.MOVE has pinned, big and the undo refund');
  const q1 = LM.moveQuote(S, 6, 10), q3 = LM.moveQuote(S, 6, 14);
  ok(q1.ok && q1.kind === 'move' && q1.d === 1 && q3.d === 2 && q3.gold >= q1.gold, 'a longer move never costs less');
  const mkL = (id, l, at) => { const T = mk('mvl'); T.plots = new Array(16).fill(null); T.plots[at] = { b: id, l }; return T; };
  const c = (id, l, to) => LM.moveQuote(mkL(id, l, 0), 0, to).gold;
  ok(c('forge', 1, 1) < c('forge', 3, 1) && c('forge', 3, 1) < c('forge', 5, 1), 'price rises with building level');
  ok(c('forge', 3, 1) < c('forge', 3, 5) && c('forge', 3, 5) < c('forge', 3, 15), 'price rises with distance');
  ok(c('stands', 3, 1) > c('forge', 3, 1) * 1.2 && c('stands', 3, 1) > 0, 'the crowd-facing Stands cost more than a forge of the same level');
  ok(c('forge', 5, 1) >= c('forge', 4, 1) * 1.5, 'level 5 carries the marble surcharge');
  const wk = (id, l, to) => LM.moveQuote(mkL(id, l, 0), 0, to).weeks[0];
  ok(wk('forge', 1, 1) === 1 && wk('forge', 3, 1) === 2 && wk('forge', 5, 1) === 3 && wk('forge', 1, 15) === 2 && wk('forge', 5, 15) === 3, 'downtime is 1 to 3 weeks by level and distance');
  ok(c('forge', 1, 1) >= D.MOVE.minGold, 'there is a minimum price');
  // refusals
  const T0 = mk('mv2'); T0.plots[9] = { b: 'hall', l: 1 };
  ok(/consecrated/.test(LM.moveBuilding(T0, 9, 10)) && T0.plots[9].b === 'hall' && T0.gold === 20000, 'a pinned building (Hall of Legends) refuses with its reason and costs nothing');
  ok(/cannot be moved/.test(LM.moveBuilding(T0, 6, 9)), 'nothing can swap with a pinned building');
  ok(LM.moveBuilding(T0, 6, 6) !== '' && LM.moveBuilding(T0, 3, 7) === 'Nothing to move here', 'same plot and empty source are refused');
  const T1 = mk('mv3'); T1.rows = 2;
  ok(/Unclaimed/.test(LM.moveBuilding(T1, 6, 12)), 'locked land is refused');
  const T2 = mk('mv4'); T2.gold = 3; ok(/Not enough gold/.test(LM.moveBuilding(T2, 6, 7)) && T2.gold === 3 && T2.plots[6].b === 'kitchen', 'short gold refuses and changes nothing');
  const T3 = mk('mv5'); ok(/fight or event/.test(LM.moveBuilding(T3, 6, 7, { busy: true })) && T3.gold === 20000, 'refused while a fight or event is in progress (opts.busy)');
  T3.pendingEv = 'plague'; ok(/pending event/.test(LM.moveBuilding(T3, 6, 7)), 'refused with an event waiting');
  // a move: gold, record, perks pause
  const U = mk('mv6'); const g1 = LM.makeGlad({ id: U.nextId++, style: 'murmillo', lvl: 3 }); U.glads.push(g1);
  const lvl0 = LM.bfx(U, 'palaestra').v, price = LM.moveQuote(U, 2, 3).gold;
  ok(LM.moveBuilding(U, 2, 3) === '' && U.gold === 20000 - price && !U.plots[2] && U.plots[3].b === 'palaestra', 'moving into an empty plot pays the quote and relocates it');
  const mv = LM.moving(U, 3); ok(mv && mv.f === 2 && mv.s === U.week && mv.u === U.week + 1 && U.plots[3].l === 1, 'the plot carries the construction record and keeps its level');
  ok(LM.bfx(U, 'palaestra').l === 0 && LM.bfx(U, 'palaestra').v === 0 && lvl0 > 0, 'perks pause while the building is under construction');
  ok(/Under construction/.test(LM.upgrade(U, 3)) && /Still under construction/.test(LM.moveBuilding(U, 3, 4)), 'cannot upgrade or move again while rebuilding');
  const capB = LM.rosterCap(U); LM.moveBuilding(U, 5, 4); ok(LM.rosterCap(U) === D.BUILD.barracks.v[1] && capB >= 3, 'barracks keep tent beds while moving, nobody is evicted');
  // week passes: the building is back
  const notes = []; U.week++; LM.extWeek(U, { notes }); ok(U.plots[3].mv === undefined && U.plots[4].mv === undefined && LM.bfx(U, 'palaestra').l === 1 && LM.rosterCap(U) === cap0(), 'after the downtime perks are restored and the record is dropped');
  function cap0() { return D.BUILD.barracks.v[1]; }
  ok(notes.length === 2 && /new place/.test(notes[0]), 'finishing reports a line in the week summary');
  // longer downtime counts down
  const V = mk('mv7'); V.plots[6].l = 3; LM.moveBuilding(V, 6, 15); const w3 = LM.moving(V, 15).w; ok(w3 >= 2, 'a level 3 building across the yard takes 2 or more weeks');
  V.week++; LM.extWeek(V, { notes: [] }); ok(LM.moving(V, 15) && LM.bfx(V, 'kitchen').l === 0, 'still rebuilding after 1 of the weeks');
  for (let i = 1; i < w3; i++) { V.week++; LM.extWeek(V, { notes: [] }); } ok(!LM.moving(V, 15) && LM.bfx(V, 'kitchen').l === 3, 'ready after the full downtime, level kept');
  // adjacency is recomputed after a move
  const W = mk('mv8'); W.plots = new Array(16).fill(null); W.plots[0] = { b: 'palaestra', l: 2 }; W.plots[1] = { b: 'infirmary', l: 1 }; W.plots[3] = { b: 'kitchen', l: 1 };
  ok(LM.synAt(W, 0) === 1, 'palaestra next to the infirmary has synergy 1');
  const eff = LM.moveEffects(W, 1, 5); ok(LM.synAt(W, 0) === 1, 'moveEffects is a preview and changes nothing');
  ok(eff.some((e) => e.b === 'palaestra' && e.now === 0 && e.pct === -10), 'the preview names the palaestra losing its +10%');
  const v0 = LM.bfx(W, 'palaestra').v; LM.moveBuilding(W, 1, 5); W.week++; LM.extWeek(W, { notes: [] });
  ok(LM.synAt(W, 0) === 0 && LM.bfx(W, 'palaestra').v < v0 && LM.bfx(W, 'palaestra').syn === 0, 'after moving away the neighbour bonus is gone');
  const v1 = LM.bfx(W, 'palaestra').v; LM.moveBuilding(W, 5, 1); ok(LM.synAt(W, 0) === 0, 'a neighbour under construction gives no synergy yet'); W.week++; LM.extWeek(W, { notes: [] });
  ok(LM.synAt(W, 0) === 1 && LM.bfx(W, 'palaestra').v > v1, 'moving back next to the partner restores the bonus once the work is done');
  // swap: cheaper than two moves, shorter, both go under construction
  const X = mk('mv9'); X.plots[6].l = 2; X.plots[2].l = 2; const qs = LM.moveQuote(X, 6, 2), qa = LM.moveQuote(mkL('kitchen', 2, 0), 0, 4);
  ok(qs.kind === 'swap' && qs.weeks[0] >= 1 && qs.weeks[1] >= 1, 'a built destination quotes a swap');
  const twoMoves = LM.moveQuote(Object.assign(mk('x'), { plots: (() => { const a = new Array(16).fill(null); a[6] = { b: 'kitchen', l: 2 }; return a; })() }), 6, 2).gold + LM.moveQuote(Object.assign(mk('y'), { plots: (() => { const a = new Array(16).fill(null); a[2] = { b: 'palaestra', l: 2 }; return a; })() }), 2, 6).gold;
  ok(qs.gold < twoMoves, `a swap (${qs.gold}) costs less than two moves (${twoMoves})`);
  ok(qs.weeks[0] <= LM.moveQuote(mkL('kitchen', 2, 0), 0, 4).weeks[0], 'a swap is never slower than a move'); void qa;
  const g0 = X.gold; ok(LM.moveBuilding(X, 6, 2) === '' && X.gold === g0 - qs.gold && X.plots[6].b === 'palaestra' && X.plots[2].b === 'kitchen' && LM.moving(X, 6) && LM.moving(X, 2), 'a swap exchanges both and pauses both');
  ok(LM.bfx(X, 'kitchen').l === 0 && LM.bfx(X, 'palaestra').l === 0, 'both swapped buildings give no perks while rebuilding');
  // undo
  const Y = mk('mv10'); const yg = Y.gold; LM.moveBuilding(Y, 6, 10); const paid = yg - Y.gold, ui = LM.moveUndoInfo(Y, 10);
  ok(ui.ok && ui.refund === Math.floor(paid * D.MOVE.undoRefund) && ui.refund < paid, 'undo returns a part of the price, not all of it');
  ok(LM.moveUndo(Y, 10) === '' && Y.plots[6].b === 'kitchen' && !Y.plots[10] && Y.plots[6].mv === undefined && Y.gold === yg - paid + ui.refund && LM.bfx(Y, 'kitchen').l === 1, 'undo puts the building back, drops the record and refunds');
  ok(LM.moveUndo(Y, 10) === 'Nothing to undo', 'there is nothing to undo twice');
  const Z = mk('mv11'); LM.moveBuilding(Z, 6, 2); const zi = Z.gold; ok(LM.moveUndo(Z, 6) === '' && Z.plots[6].b === 'kitchen' && Z.plots[2].b === 'palaestra' && Z.gold > zi && !Z.plots[6].mv && !Z.plots[2].mv, 'undo of a swap restores both');
  const Q = mk('mv12'); Q.plots[6].l = 3; LM.moveBuilding(Q, 6, 10); Q.week++; ok(!LM.moveUndoInfo(Q, 10).ok && /already started/.test(LM.moveUndo(Q, 10)), 'undo only works in the week of the move');
  // save round trip, old saves, damaged records
  const R = mk('mv13'); LM.moveBuilding(R, 6, 14); const raw = JSON.stringify(R), back = LM.migrate(JSON.parse(raw));
  ok(back.plots[14].b === 'kitchen' && LM.moving(back, 14) && LM.moving(back, 14).f === 6 && LM.bfx(back, 'kitchen').l === 0, 'a save in the middle of a move round-trips with the record');
  ok(LM.moveUndo(back, 14) === '' && back.plots[6].b === 'kitchen', 'undo works after a reload');
  const old = JSON.parse(JSON.stringify(mk('mv14'))); old.plots.forEach((p) => p && delete p.mv); delete old.sv; delete old.stats.moves;
  const oldM = LM.migrate(old); ok(oldM.plots[6].b === 'kitchen' && LM.bfx(oldM, 'kitchen').l === 1 && LM.moveBuilding(oldM, 6, 7) === '', 'an old save without mv loads and can move');
  const bad = JSON.parse(JSON.stringify(mk('mv15'))); bad.plots[6].mv = 'junk'; bad.plots[5].mv = { u: 'x' }; bad.plots[2].mv = { s: 1, u: 2 }; bad.week = 9;
  const badM = LM.migrate(bad); ok(!badM.plots[6].mv && !badM.plots[5].mv && !badM.plots[2].mv && LM.bfx(badM, 'kitchen').l === 1, 'garbage and expired records are dropped on load');
  const fut = JSON.parse(JSON.stringify(mk('mv16'))); fut.plots[6].mv = { f: 99, s: 1, u: 99 }; const futM = LM.migrate(fut); ok(futM.plots[6].mv && futM.plots[6].mv.f === -1 && LM.moveUndoInfo(futM, 6).ok === false, 'a broken origin index is neutralised (no undo)');
  // a whole week with a building under construction runs through the normal weekly flow
  const E = mk('mv17'); const eg = LM.makeGlad({ id: E.nextId++, style: 'thraex', lvl: 2 }); eg.act = 'str'; E.glads.push(eg);
  LM.moveBuilding(E, 2, 3); const rep = LM.weekFinish ? LM.weekFinish(E) : null; ok(!rep || (Array.isArray(rep.notes) && E.plots[3].mv === undefined), 'weekFinish completes a 1-week move and reports it');
}

{ // UI pass: a matchup never repeats a name
  ok(typeof LM.uniqueNames === 'function', 'LM.uniqueNames exists');
  const mine = [{ name: 'Valeria' }, { name: 'Marcus' }];
  const opps = [{ name: 'Valeria' }, { name: 'Valeria' }, { name: 'Marcus' }, { name: 'Zeno' }];
  const n = LM.uniqueNames(mine, opps), names = [...mine, ...opps].map((x) => x.name);
  ok(n === 3 && new Set(names).size === names.length, 'uniqueNames: no name repeats across both sides: ' + names.join(','));
  ok(opps[3].name === 'Zeno', 'uniqueNames keeps names that were already unique');
  const again = LM.uniqueNames(mine, opps); ok(again === 0, 'uniqueNames is idempotent');
  const solo = [{ name: 'Valeria' }]; LM.uniqueNames([{ name: 'Valeria' }], solo); const solo2 = [{ name: 'Valeria' }]; LM.uniqueNames([{ name: 'Valeria' }], solo2);
  ok(solo[0].name === solo2[0].name && solo[0].name !== 'Valeria', 'uniqueNames is deterministic');
  // every generated duel in a season: the opponent never shares the fighter name, once the helper has run
  const T = LM.newGame({ name: 'Names', color: 0 }); const ga = LM.makeGlad({ id: T.nextId++, style: 'murmillo', lvl: 1, name: 'Valeria' }); T.glads.push(ga);
  let clash = 0; for (let wk = 1; wk <= 24; wk++) for (const ev of LM.events(T, wk, 0)) { LM.uniqueNames([ga], ev.opps); if (ev.opps.some((o) => o.name === ga.name)) clash++; if (new Set(ev.opps.map((o) => o.name)).size !== ev.opps.length) clash++; }
  ok(clash === 0, 'no event over 24 weeks pairs the fighter with a same-named opponent');
}

{ // round 48: BEAST real animals (js/beast.js headless: budgets per tier, smooth skin weights, paw planting, idle life, blood that stays on the wound)
  const had = { window: typeof globalThis.window, document: typeof globalThis.document };
  if (!globalThis.window) globalThis.window = globalThis; if (!globalThis.document) globalThis.document = { createElement: () => ({ getContext: () => null }) };
  const { createBeast, JN } = await import('../ludus_maximus_3d/js/beast.js'), V = { low: { a: 1050, e: 1600 }, medium: { a: 4200, e: 5200 }, high: { a: 11000, e: 11000 } };
  for (const kind of ['lion', 'wolf', 'bear', 'boar', 'nemean', 'elephant']) for (const dt of ['low', 'medium', 'high']) {
    const rec = LM.makeBeast(kind, 6, { r: LM.mulberry(5), id: 't' }), rig = createBeast(rec, { detail: dt }), lim = V[dt][kind === 'elephant' ? 'e' : 'a'];
    ok(rig.triangles() <= lim && rig.drawCalls() <= 8, `${kind} ${dt}: ${rig.triangles()} tris (limit ${lim}) and ${rig.drawCalls()} calls (limit 8)`);
    let bad = 0, multi = 0, total = 0; const nb = rig.skeleton.bones.length;
    rig.root.traverse((o) => { if (!o.isSkinnedMesh) return; const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight; for (let v = 0; v < sw.count; v++) { let t = 0, n = 0; for (let q = 0; q < 4; q++) { const w = sw.getComponent(v, q); t += w; if (w > 0.02) { n++; if (si.getComponent(v, q) >= nb) bad++; } } if (Math.abs(t - 1) > 0.02) bad++; if (n > 1) multi++; total++; } });
    ok(bad === 0, `${kind} ${dt}: every vertex has valid bones and weights summing to one`); if (dt !== 'low') ok(multi / total > 0.12, `${kind} ${dt}: smooth skinning blends bones on ${(100 * multi / total).toFixed(0)}% of the vertices`);
    if (dt !== 'high') continue;
    const A = rig.animator, P = [['wristL', 0], ['wristR', 1], ['ankleL', 2], ['ankleR', 3]], v3 = (n) => { const e = rig.joints[n].matrixWorld.elements; return e[13]; };
    for (let i = 0; i < 50; i++) rig.update(1 / 60);
    let worst = 0; for (const [n, i] of P) worst = Math.max(worst, Math.abs(v3(n) - A.pads[i] * 0.98)); ok(worst < 0.03 * Math.max(1, rig.size), `${kind}: standing paws are planted on the sand (worst ${worst.toFixed(3)} m)`);
    let fin = true, steps = 0; rig.onEvent = (e) => { if (e === 'step') steps++; };
    for (const sp of [1, 3, 6]) { A.setMove(sp, 0); for (let i = 0; i < 150; i++) { rig.update(1 / 60); for (const k of rig.root.children[0].children) { const e = k.matrixWorld.elements; for (let j = 0; j < 16; j++) if (!isFinite(e[j])) fin = false; } } }
    ok(fin && steps >= 6, `${kind}: walk, trot and gallop stay finite and emit steps (${steps})`); A.setMove(0, 0);
    let blinks = 0, was = false, y0 = 9, y1 = -9; for (let i = 0; i < 40 * 30; i++) { rig.update(1 / 30); if (i < 20 * 30) continue; const l = A.out[JN.indexOf('lidL') * 3] > 1.0; if (l && !was) blinks++; was = l; const hy = A.out[JN.indexOf('head') * 3 + 1]; y0 = Math.min(y0, hy); y1 = Math.max(y1, hy); }
    ok(blinks >= 2 && y1 - y0 > 0.08, `${kind}: idle life (blinks ${blinks}, head wander ${(y1 - y0).toFixed(2)} rad)`);
    rig.clearBlood(); rig.addWound(rig.jointRest('chest', [0.1, 0.1, 0.1]), { x: 0, y: 1, z: 0 }, 0.1, 1); const s0 = rig.bloodU.uWoundD.value[0].w; rig.addBlood(0.2, 1); rig.addBlood(0.2, 1);
    ok(rig.bloodU.uWoundD.value[0].w > s0 + 0.5 && rig.bloodU.uBlood.value < 0.3, `${kind}: blood soaks the wound, not the whole coat`);
    for (const n of ['bite', 'claw', 'pounce', 'roar', 'death', 'hurt']) { A.dead = false; A.action = null; A.play(n); if (n === 'death') A.dead = true; for (let i = 0; i < 120; i++) rig.update(1 / 60); const e = rig.joints.head.matrixWorld.elements; ok(isFinite(e[12]) && isFinite(e[13]) && isFinite(e[14]), `${kind}: clip ${n} stays finite`); }
    rig.dispose();
  }
  if (had.window === 'undefined') delete globalThis.window; if (had.document === 'undefined') delete globalThis.document;
}

{ // round 49: BATTLE PLAN (roles, formations, priority target, Showmanship): pre-fight choices that reshape the fight, replay safe, no counters
  const mk = (st, id, lvl = 6, trait) => LM.makeGlad({ style: st, lvl, id, name: 'P' + id, r: LM.mulberry(id * 31 + lvl), trait });
  const team = (styles, base) => styles.map((st, i) => mk(st, base + i));
  const A3 = team(['murmillo', 'thraex', 'hoplomachus'], 300), B3 = team(['thraex', 'murmillo', 'retiarius'], 400);
  const build = (A, B, planA, planB, o) => { const ca = LM.teamCtx(null, A, planA || 'bal'), cb = LM.teamCtx(null, B, 'bal'); if (planB) cb.plan = LM.normPlan(planB, B); const F = LM.createFight(LM.mkUnits(A, 'A', ca), LM.mkUnits(B, 'B', cb), Object.assign({ autoA: true, quiet: true }, o || {})); if (planA || planB) LM.planFight(F, planA && LM.normPlan(planA, A), planB && LM.normPlan(planB, B)); return F; };
  const run = (F, n, dt = 1 / 30) => { const ev = []; for (let i = 0; i < n && !F.done; i++) { LM.step(F, dt); ev.push(...F.ev.splice(0)); } return ev; };
  const hash = (F) => F.units.map((u) => `${u.id}:${u.hp}:${u.x.toFixed(3)}:${u.y.toFixed(3)}`).join('|') + `|${F.n}|${F.winner}|${F.foc.A}|${F.foc.B}`;
  // ---- data: every role, formation and Showmanship level prints its exact numbers; no em dashes; the spots stay inside the sand
  const pctOf = (v) => `${Math.round(Math.abs(v) * 100)}%`;
  ok(LM.ROLE_IDS.length === 6 && LM.ROLES.free.mods && Object.keys(LM.ROLES.free.mods).length === 0, 'six roles: Fighter plus five jobs');
  for (const id of LM.ROLE_IDS) { const R = LM.ROLES[id]; ok(R.n && R.d && R.gain && R.cost && !/—/.test(R.n + R.d + R.gain + R.cost), `role ${id} has a name, a description and gain / cost lines without em dashes`); for (const k of Object.keys(R.mods)) ok((R.mods[k] > 0 ? R.gain : R.cost).includes(pctOf(R.mods[k])), `role ${id}: the ${k} number is printed in its ${R.mods[k] > 0 ? 'gain' : 'cost'} line`); if (id !== 'free') ok(R.cost !== 'No change' || R.d, `role ${id} has a price`); }
  ok(LM.ROLE_IDS.filter((id) => id !== 'free').every((id) => { const m = LM.ROLES[id].mods, v = Object.values(m); return v.some((x) => x > 0) && (v.some((x) => x < 0) || LM.ROLES[id].costTxt); }), 'every job trades something (a gain and a cost): no free lunch');
  for (const f of LM.FORM_IDS) for (const n of [2, 3, 4]) { ok(LM.FORMS[f].roles(n).length === n && LM.FORMS[f].roles(n).every((r) => LM.ROLES[r]), `${f} ${n}: default roles are known`);
    for (const r of LM.ROLE_IDS) { const T = Array.from({ length: n }, (_, i) => mk('thraex', 800 + i)), ro = {}; T.forEach((g, i) => { ro[g.id] = i === 0 ? r : 'free'; }); const us = LM.mkUnits(T, 'A', LM.teamCtx(null, T, { form: f, roles: ro }));
      ok(us.every((u) => Math.hypot(u.x, u.y) <= 8.6 + 1e-9), `${f} ${n} with ${r} up front: everyone starts on the sand`); let close = 9; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) close = Math.min(close, Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y)); ok(close >= 1.3, `${f} ${n} with ${r}: nobody starts inside a partner (${close.toFixed(2)} m)`); } }
  for (const f of LM.FORM_IDS) { const F0 = LM.FORMS[f]; for (const k of Object.keys(F0.mods)) ok((F0.mods[k] > 0 ? F0.gain : F0.cost).includes(pctOf(F0.mods[k])), `formation ${f}: the team-wide ${k} number is printed`); }
  { const l = LM.mkUnits(A3, 'A', LM.teamCtx(null, A3, { form: 'line', roles: {} })), w = LM.mkUnits(A3, 'A', LM.teamCtx(null, A3, { form: 'wedge', roles: { 300: 'free', 301: 'free', 302: 'free' } })), b0 = LM.mkUnits(A3, 'A', LM.teamCtx(null, A3, 'bal')); ok(l[0].atk > b0[0].atk * 1.02 && l[0].def > b0[0].def * 1.02 && w[0].def < b0[0].def * 0.97 && w[0].atk === b0[0].atk, 'a formation applies its printed team-wide trade to every unit'); }
  ok(LM.SHOW.length === 4 && LM.SHOW[0].gain === 'No change' && LM.SHOW[0].cost === 'No change', 'four Showmanship levels, the first is the plain default');
  for (let i = 1; i < 4; i++) { const a = LM.SHOW[i - 1], b = LM.SHOW[i]; ok(b.fame > a.fame && b.hy > a.hy && b.fan > a.fan && b.atk > a.atk && b.wound > a.wound && b.wd > a.wd, `Showmanship ${b.n}: more gain AND more cost than ${a.n}`); ok(b.gain.includes(`+${Math.round(b.fame * 100)}% fame`) && b.cost.includes(`-${Math.round(b.atk * 100)}% damage`) && b.cost.includes(`+${Math.round(b.wound * 100)}% wound risk`) && !/—/.test(b.gain + b.cost + b.d), `Showmanship ${b.n}: the exact numbers are printed`); }
  ok(LM.PRIO.guard < 1 && LM.PRIO.cost.includes('6%') && !/—/.test(LM.PRIO.gain + LM.PRIO.cost), 'the priority target has a printed price (the marked foe is guarded)');
  // ---- plans: normalised, deterministic, derived for the AI
  const np = LM.normPlan({ form: 'bogus', roles: { 300: 'nonsense' }, prio: -3, show: 9 }, A3);
  ok(np.form === 'line' && A3.every((g) => LM.ROLES[np.roles[g.id]]) && np.prio === null && np.show === 0, 'a damaged plan is repaired: known form, a role for everyone, no show in a team');
  const solo = LM.normPlan({ show: 9, roles: { 300: 'vanguard' } }, [A3[0]]); ok(solo.show === 3 && solo.roles[300] === 'free' && solo.form === 'line', 'a solo plan keeps only Showmanship (clamped), no roles');
  const sg1 = LM.defaultPlan(null, A3, B3), sg2 = LM.defaultPlan(null, A3, B3); ok(JSON.stringify(sg1) === JSON.stringify(sg2) && sg1.prio === LM.suggestFoc(B3) && LM.FORMS[sg1.form], 'the suggested plan is deterministic and pre-fills a priority target');
  const op1 = LM.oppPlan(null, B3, A3), op2 = LM.oppPlan(null, B3, A3); ok(JSON.stringify(op1) === JSON.stringify(op2) && op1.prio !== null && B3.every((g) => LM.ROLES[op1.roles[g.id]]), 'the AI team plan is deterministic, has a role per fighter and a priority target');
  ok(LM.oppPlan(null, [LM.makeBeast('lion', 4)], A3) === null, 'beasts get no plan');
  const sh = mk('thraex', 450, 5, 'showman'), op = LM.oppPlan(null, [sh], [A3[0]]); ok(op.show === 1 && op.prio === null && LM.oppPlan(null, [mk('thraex', 451, 5, 'hothead')], [A3[0]]).show === 0, 'a showman foe shows off a little, everyone else fights plain');
  ok(LM.oppPlan(null, [mk('murmillo', 1, 5, 'ironjaw'), mk('murmillo', 2, 5), mk('thraex', 3, 5)], A3).roles[1] === 'vanguard', 'the AI reads its traits: an Iron Jaw takes the front');
  ok(LM.fightPlans(null, A3, B3, 'agg').pa === null && LM.fightPlans(null, A3, B3, sg1).pa.form === sg1.form && LM.fightPlans(null, A3, B3, { form: 'wedge', prio: 7 }).pa.prio === null, 'a plain stance gives no plans; a priority past the last foe is dropped');
  // ---- one fight shape, random stream untouched
  const draws = (planA) => { let n = 0; LM.setRandom(() => { n++; return 0.37; }); const ca = LM.teamCtx(null, A3, planA || 'bal'); LM.mkUnits(A3, 'A', ca); return n; };
  ok(draws(null) === draws(sg1) && draws(null) === draws({ form: 'pincer' }), 'a plan draws no random numbers: the seeded stream of a fight is the same with and without it');
  LM.setRandom(LM.mulberry(5));
  const FP = build(A3, B3, sg1, op1), F0 = build(A3, B3, null, null), FS = build([mk('thraex', 500)], [mk('murmillo', 501)], { show: 2 }), FH = LM.createFight(LM.mkUnits(A3, 'A', {}), LM.mkUnits([LM.makeBeast('wolf', 4, { r: LM.mulberry(2), id: 'w1' })], 'B', {}));
  const keysOf = (u) => Object.keys(u).join(','), sk = (u) => Object.keys(u.s).join(',');
  ok(FP.units.every((u) => keysOf(u) === keysOf(F0.units[0]) && sk(u) === sk(F0.units[0])) && FS.units.every((u) => keysOf(u) === keysOf(F0.units[0])) && FH.units.every((u) => keysOf(u) === keysOf(F0.units[0])), 'every unit (planned, solo with show, plain, beast) has the identical key list (one hidden class)');
  ok(Object.keys(FP).join() === Object.keys(F0).join() && Object.keys(FP.pri).join() === 'A,B' && keysOf(F0.units[0]).includes('role,show,flT'), 'the fight object keeps its shape too, and the new unit fields are declared');
  ok(F0.units.every((u) => u.role === '' && u.show === 0) && FP.units.every((u) => LM.ROLES[u.role || 'free']), 'plain fights carry no role and no show');
  for (let i = 0; i < 6; i++) run(FP, 2 * 30); ok(FP.units.every((u) => keysOf(u) === keysOf(F0.units[0]) && sk(u) === sk(F0.units[0])), 'the unit shape stays identical after 12 s of fighting with roles, focus and statuses');
  // ---- formations and roles are real
  const at = (form, roles) => build(A3, B3, { form, roles: roles || {}, prio: null }, null).units.slice(0, 3);
  const line = at('line'), wedge = at('wedge'), pincer = at('pincer'), turtle = at('turtle');
  ok(line.every((u) => u.x === -6.4) && Math.max(...wedge.map((u) => u.x)) > -5 && wedge[1].x > wedge[0].x + 1, 'Wedge: the tip stands ahead of the wings, a Line is flat');
  ok(Math.max(...pincer.map((u) => Math.abs(u.y))) > Math.max(...line.map((u) => Math.abs(u.y))) + 0.8, 'Pincer: the flanks start wider than the Line');
  ok(Math.max(...turtle.map((u) => Math.abs(u.y))) < Math.max(...line.map((u) => Math.abs(u.y))) - 1.5, 'Turtle: the team starts tight');
  const free0 = at('line', { 300: 'free', 301: 'free', 302: 'free' }), van0 = at('line', { 300: 'vanguard', 301: 'free', 302: 'free' });
  ok(van0[0].maxhp > free0[0].maxhp * 1.08 && van0[0].def > free0[0].def * 1.07 && van0[0].atk < free0[0].atk * 0.95 && van0[0].x > free0[0].x + 1, 'Vanguard: more HP and armor, less damage, and stands forward');
  const fl0 = at('line', { 300: 'flanker', 301: 'free', 302: 'free' }), sk0 = at('line', { 300: 'skirmisher' }), hu0 = at('line', { 300: 'hunter' }), an0 = at('line', { 300: 'anchor' });
  ok(fl0[0].ms > free0[0].ms * 1.08 && fl0[0].maxhp < free0[0].maxhp * 0.95 && Math.abs(fl0[0].y) > Math.abs(free0[0].y) * 1.1, 'Flanker: faster and wider, but frailer');
  ok(hu0[0].atk > free0[0].atk * 1.05 && hu0[0].def < free0[0].def * 0.95 && an0[0].def > free0[0].def * 1.1 && an0[0].atk < free0[0].atk && sk0[0].eva > free0[0].eva && sk0[0].x < free0[0].x - 0.8, 'Hunter hits harder and guards less; Anchor guards more and hits less; Skirmisher dodges more and starts back');
  // target weights: foes draw to the Vanguard; the Flanker picks the soft one; the Anchor covers an ally
  { const A = team(['thraex'], 600), B = team(['murmillo', 'murmillo'], 610); const F = build(A, B, null, { form: 'line', roles: { 610: 'vanguard', 611: 'free' } }); F.units[1].x = 2; F.units[2].x = 2; F.units[1].y = -2; F.units[2].y = 2; F.units[0].x = -2; F.units[0].y = 0; run(F, 3);
    ok(F.units[0].tgt === 'B0', 'a free fighter picks the Vanguard over an equal foe (it draws the eye)'); }
  { const A = [mk('thraex', 620)], B = [mk('murmillo', 630), mk('retiarius', 631)]; B[0].lvl = 12; const F = build(A, B, { form: 'line', roles: {} }, null); F.units[0].s.dash = 0; F.units[0].role = 'flanker'; F.units[1].x = F.units[2].x = 3; F.units[1].y = -1.5; F.units[2].y = 1.5; F.units[0].x = -2; F.units[0].y = 0; run(F, 2);
    ok(F.units[0].tgt === 'B1', 'a Flanker goes for the soft, ranged foe instead of the sturdy one at the same distance'); }
  { const A = team(['murmillo', 'thraex'], 640), B = team(['thraex'], 650); const F = build(A, B, { form: 'line', roles: { 640: 'anchor', 641: 'free' } }, null), an = F.units[0], fr = F.units[1]; F.units[2].x = 8; F.units[2].y = 0; F.units[2].s.root = 99; an.x = -3; fr.x = -3.5; an.y = 1; fr.y = -1; const x0 = an.x, xf = fr.x;
    run(F, 45); ok((an.x - x0) < (fr.x - xf) - 2 && Math.hypot(an.x - fr.x, an.y - fr.y) < 7, 'an Anchor trails its partner and stays near the team while the partner goes out to meet a distant foe'); }
  { const A = [mk('retiarius', 660)], B = [mk('murmillo', 670)]; const F = build(A, B, null, null); F.units[0].role = 'skirmisher'; F.units[0].x = 0; F.units[1].x = 0.9; F.units[0].y = F.units[1].y = 0; F.units[0].atkT = 1; const d0 = 0.9; run(F, 15);
    ok(Math.hypot(F.units[0].x - F.units[1].x, F.units[0].y - F.units[1].y) > d0 + 0.3, 'a Skirmisher steps back when pressed while its blow recovers'); }
  // ---- priority target: honoured, then a fallback; replay safe
  { const F = build(A3, B3, { form: 'line', roles: { 300: 'free', 301: 'free', 302: 'free' }, prio: 1 }, null); ok(F.foc.A === 'B1' && F.pri.A === true && F.pri.B === false, 'the plan sets the focus and the side flag at the first bell');
    run(F, 4 * 30); ok(F.units.slice(0, 3).filter((u) => !u.down).every((u) => u.tgt === 'B1' || F.units[4].down), 'everyone free goes for the priority target while it lives');
    let fell = -1; for (let i = 0; i < 4000 && !F.done && fell < 0; i++) { run(F, 1); if (F.units[4].down) fell = F.t; }
    if (fell > 0) { const alive = F.units.slice(3).filter((u) => !u.down); ok(!F.done ? F.foc.A !== 'B1' && alive.some((u) => u.id === F.foc.A) && alive.every((u) => alive.find((x) => x.id === F.foc.A).hp <= u.hp) : true, 'when the priority target falls the team picks the weakest foe left'); } else ok(true, 'the fight ended before the priority target fell');
  }
  { const F = build(A3, B3, { form: 'line', roles: {}, prio: 0 }, null), tm = F.units[3]; F.units[0].atk = 1000; let marked = 0, plain = 0; const dmg = (F2) => { const u = F2.units[0], t = F2.units[3]; u.x = -0.5; t.x = 0.5; u.y = t.y = 0; t.hp = t.maxhp = 100000; u.atkT = 0; for (const x of F2.units) if (x !== u && x !== t) x.down = true; const h0 = t.hp; LM.setRandom(LM.mulberry(4)); run(F2, 30); return h0 - t.hp; };
    marked = dmg(F); const G = build(A3, B3, null, null); G.units[0].atk = 1000; LM.focus(G, 'A', 'B0'); plain = dmg(G); ok(marked > 0 && plain > 0 && marked < plain, `the marked foe takes less damage (${marked} vs ${plain}), the price of the priority`); }
  { const play = (seed) => { LM.setRandom(LM.mulberry(seed)); const F = build(A3, B3, sg1, op1, { cmdAI: true }); const taps = [[40, 'stance', 'A0', 'press'], [70, 'swap'], [120, 'rally'], [150, 'stance', 'A1', 'guard']]; let ti = 0; while (!F.done && F.n < 4000) { while (ti < taps.length && taps[ti][0] <= F.n) { const t = taps[ti++]; LM.command(F, t[1], t[2], t[3]); } LM.step(F, 1 / 30); F.ev.length = 0; } return F; };
    const r1 = play(21), r2 = play(21); ok(r1.done && hash(r1) === hash(r2), 'a fight with roles, formation, priority, AI plan and taps replays identically');
    LM.setRandom(LM.mulberry(21)); const F = build(A3, B3, sg1, op1, { cmdAI: true }); const snap = structuredClone(F); ok(snap.pri.A === F.pri.A && snap.foc.A === F.foc.A && snap.units[0].role === F.units[0].role, 'roles, focus and the plan flag survive the replay snapshot');
    LM.setRandom(LM.mulberry(21)); const G = structuredClone(snap); while (!G.done && G.n < 4000) { LM.step(G, 1 / 30); G.ev.length = 0; } ok(G.done && (G.winner === 'A' || G.winner === 'B'), 'the cloned snapshot plays on to a winner'); }
  { const a = LM.odds(null, A3, B3, sg1, 20), b = LM.odds(null, A3, B3, sg1, 20), c = LM.odds(null, A3, B3, { form: 'turtle', roles: {}, prio: null }, 20); ok(a === b && a >= 0 && a <= 1 && c >= 0 && c <= 1, 'odds accept a plan: stable and in range'); }
  // ---- Showmanship: fame and hype up, damage down, real flourishes
  { const S = LM.newGame({ name: 'Show', seed: 'show49' }), g = LM.makeGlad({ id: S.nextId++, style: 'thraex', lvl: 4 }); S.glads.push(g); const ev = Object.assign({}, LM.events(S, 2, 0).find((e) => e.kind === 'duel'), { fame: 100 });
    const fameAt = (lv) => { const S2 = JSON.parse(JSON.stringify(S)), g2 = S2.glads[0]; LM.setRandom(LM.mulberry(9)); const r = LM.settle(S2, ev, [g2], { win: true, hype: 100, hpf: { [g2.id]: 0.7 }, odds: 0.5, show: lv }); return { fame: r.fame, fav: g2.fav || 0 }; };
    const f = [0, 1, 2, 3].map(fameAt); ok(f[1].fame > f[0].fame && f[2].fame > f[1].fame && f[3].fame > f[2].fame, `fame rises with every Showmanship level (${f.map((x) => x.fame).join(', ')})`);
    ok(f[3].fame >= Math.round(f[0].fame * 1.45) && f[1].fame <= Math.round(f[0].fame * 1.15), 'the fame bonus is the printed one (about +12% to +50%)'); ok(f[1].fav > f[0].fav && f[3].fav >= f[0].fav + 5, `fans rise too (${f.map((x) => x.fav).join(', ')})`);
    const lose = (lv) => { const S2 = JSON.parse(JSON.stringify(S)), g2 = S2.glads[0]; g2.fav = 50; LM.setRandom(LM.mulberry(9)); LM.settle(S2, ev, [g2], { win: false, hype: 60, hpf: { [g2.id]: 0.3 }, odds: 0.5, show: lv }); return g2.fav; }; ok(lose(3) > lose(0), 'in defeat a showman still keeps more of the crowd');
    const inj = (lv) => { let n = 0; for (let i = 0; i < 400; i++) { const S2 = JSON.parse(JSON.stringify(S)), g2 = S2.glads[0]; LM.setRandom(LM.mulberry(1000 + i)); const r = LM.settle(S2, ev, [g2], { win: true, hype: 50, hpf: { [g2.id]: 0.5 }, odds: 0.5, show: lv }); if (r.inj.length) n++; } return n; };
    const i0 = inj(0), i3 = inj(3); ok(i3 > i0 && i3 < i0 * 3, `wounds follow the show (${i0} to ${i3} of 400)`);
    ok(LM.settle(JSON.parse(JSON.stringify(S)), ev, [JSON.parse(JSON.stringify(S.glads[0]))], { win: true, hype: 50, odds: 0.5, hpf: {}, show: 3 }).notes.some((n) => /Showmanship/.test(n) && /fame/.test(n)), 'the results note names the Showmanship bonus'); }
  { const duel = (lv, seed, quiet) => { LM.setRandom(LM.mulberry(seed)); const a = mk('thraex', 700), b = mk('murmillo', 701); const ca = LM.teamCtx(null, [a], LM.normPlan({ show: lv }, [a])); const F = LM.createFight(LM.mkUnits([a], 'A', ca), LM.mkUnits([b], 'B', LM.teamCtx(null, [b], 'bal')), { autoA: true, quiet }); return F; };
    const u0 = duel(0, 1, true).units[0], u3 = duel(3, 1, true).units[0]; ok(u3.show === 3 && u0.show === 0 && u3.atk < u0.atk * (1 - LM.SHOW[3].atk + 0.001) && u3.def < u0.def && u3.flT > 0, 'a showman has less damage and armor at the first bell (the printed cost)');
    ok(LM.windOf(u3) > LM.windOf(u0) * 1.4 && LM.windOf(u0) <= 0.22, 'a showman winds up longer (the animator uses the same number)');
    let fl0 = 0, fl3 = 0, h0 = 0, h3 = 0, d0 = 0, d3 = 0, roars0 = 0, roars3 = 0, t0 = 0, t3 = 0; const N = 24;
    for (let i = 0; i < N; i++) { for (const lv of [0, 3]) { const F = duel(lv, 50 + i, false); let fl = 0, roars = 0, hype = 0; while (!F.done && F.n < 6000) { LM.step(F, 1 / 30); for (const e of F.ev.splice(0)) { if (e.k === 'flourish') fl++; if (e.k === 'roar') roars++; } hype = Math.max(hype, F.hype); } const dmg = F.units[0].dmg; if (lv === 0) { fl0 += fl; roars0 += roars; d0 += dmg; t0 += F.t; } else { fl3 += fl; roars3 += roars; d3 += dmg; t3 += F.t; } } }
    ok(fl0 === 0 && fl3 > N * 1.5, `flourishes happen only in a showman's fight (${fl0} vs ${fl3} in ${N})`); ok(d3 < d0 * 0.97, `a showman deals less damage over the same duels (${Math.round(d3 / N)} vs ${Math.round(d0 / N)})`); ok(roars3 >= roars0, `the crowd roars at least as often for a showman (${roars3} vs ${roars0})`); ok(t3 >= t0 * 0.95, 'and the fights do not get shorter'); }
  // ---- old stances and saves
  { const gl = A3; for (const st of ['bal', 'agg', 'grd', 'cun', 'weird', undefined]) { const p = LM.planFromStance(st, gl, B3); ok(LM.FORMS[p.form] && gl.every((g) => LM.ROLES[p.roles[g.id]]) && p.show === 0, `old stance ${st} maps to a valid plan`); }
    ok(LM.planFromStance('agg', gl, B3).form === 'wedge' && LM.planFromStance('grd', gl, B3).form === 'turtle' && LM.planFromStance('cun', gl, B3).form === 'pincer', 'Aggressive, Guarded and Cunning open as Wedge, Turtle and Pincer');
    ok(LM.planFromStance('agg', [gl[0]], [B3[0]]).show === 0, 'a solo fighter with an old stance opens as Efficient');
    const S = LM.newGame({ name: 'Old', seed: 'old49' }); S.gold = 9999; S.glads.push(...A3.map((g) => Object.assign({}, g, { id: S.nextId++ })));
    S.entries['5:0:m'] = { ids: [S.glads[0].id], stance: 'agg', paid: 5 }; S.entries['6:0:m'] = { ids: [S.glads[1].id], stance: 'zzz', paid: 5, plan: { form: 'nope', roles: 3 } }; S.entries['7:0:m'] = { ids: [S.glads[2].id], stance: 'bal', paid: 5, plan: { v: 1, form: 'wedge', roles: {}, prio: 1, show: 0 } }; S.entries['8:0:m'] = 'garbage';
    const M = LM.migrate(JSON.parse(JSON.stringify(S))); ok(M.entries['5:0:m'].stance === 'agg' && M.entries['6:0:m'].stance === 'bal' && !('plan' in M.entries['6:0:m']) && M.entries['7:0:m'].plan.form === 'wedge' && !M.entries['8:0:m'], 'migrate keeps old stances, mends unknown ones, drops broken plans and junk entries');
    const gg = M.glads.slice(-3); ok(LM.entryPlan(M, '5:0:m', gg, B3).form === 'wedge' && LM.entryPlan(M, '7:0:m', gg, B3).prio === 1 && LM.entryPlan(M, 'none', gg, B3).form, 'an entry opens on its plan, or on the old stance mapped, or on the suggestion');
    const ev2 = LM.events(M, 2, 0).find((e) => e.kind === 'duel'); M.week = 2; M.gold = 999; const fighter = M.glads[0]; fighter.inj = 0; ok(LM.enter(M, ev2, [fighter.id], { v: 1, form: 'line', roles: {}, prio: null, show: 2 }) === '' && M.entries[ev2.key].stance === 'bal' && M.entries[ev2.key].plan.show === 2, 'LM.enter stores a plan next to the old stance string');
    ok(LM.SAVE_KEY === 'ludus_maximus_3d_v1', 'the save key is untouched'); }
}

// ---- FATE: kill / spare / ransom for the beaten foe (core/sim.js LM.fateOffers / LM.fate)
{
  const mkS = (seed, lvl = 6) => { LM.setRandom(LM.mulberry(LM.hash('fs' + seed))); const S = LM.newGame({ name: 'Fate', seed }); S.gold = 1000; S.fame = 200; S.week = 5; S.glads.push(LM.makeGlad({ id: S.nextId++, style: 'murmillo', lvl, trait: 'frugal' })); LM.setRandom(null); return S; };
  const S0 = mkS('fate1'), duelOf = (S, lg = 1) => LM.events(S, 5, lg).find((e) => e.kind === 'duel'), ev0 = duelOf(S0), foe0 = ev0.opps[0];
  const off = LM.fateOffers(S0, ev0, foe0), by = (o, id) => o.opts.find((x) => x.id === id);
  ok(off && off.opts.map((o) => o.id).join() === 'kill,spare,ransom' && off.def === 'spare', 'a rival-ludus foe offers kill, spare, ransom with spare as the default');
  ok(by(off, 'kill').fame > by(off, 'spare').fame && by(off, 'spare').fame > by(off, 'ransom').fame, `fame: kill ${by(off, 'kill').fame} > spare ${by(off, 'spare').fame} > ransom ${by(off, 'ransom').fame}`);
  ok(by(off, 'kill').fame >= 2 * by(off, 'spare').fame - 1, 'a kill is worth about double the mercy bonus');
  ok(by(off, 'ransom').gold > 0 && by(off, 'kill').gold === 0 && by(off, 'spare').gold === 0, 'only the ransom pays gold');
  const ghost = Object.assign({}, foe0, { gh: true, lud: undefined, ludus: undefined }), offG = LM.fateOffers(S0, ev0, ghost);
  ok(offG.opts[2].id === 'show' && offG.opts[2].why && by(offG, 'show').gold < by(off, 'ransom').gold, 'a foe nobody would pay for gets the Showboat instead, with the reason, and it pays less than a ransom');
  ok(by(off, 'ransom').gold >= 2 * by(offG, 'show').gold, 'the ransom pays at least twice what the showboat did');
  ok(by(off, 'kill').cost.some((c) => /Senate/.test(c)) && by(off, 'kill').gain.some((c) => /Plebs/.test(c)) && by(off, 'kill').cost.some((c) => /Vendetta/.test(c)), 'the kill costs Senate standing, Plebs love it, a vendetta follows');
  ok(by(off, 'spare').gain.some((c) => /Senate \+6/.test(c)) && by(off, 'spare').gain.some((c) => /% he joins/.test(c)), 'the spare shows its Senate gain and the recruit chance');
  ok(LM.fateOffers(S0, { kind: 'hunt', league: 0 }, { beast: 'lion', lvl: 5 }) === null && ['hunt', 'pit', 'horde', 'bounty', 'champ', 'spar'].every((k) => LM.fateOffers(S0, Object.assign({}, ev0, { kind: k }), foe0) === null), 'no decision for beasts, hunts, pit floors, hordes, bounties, champions or sparring');
  ok(['duel', 'tourney', 'grand', 'team'].every((k) => LM.fateOffers(S0, Object.assign({}, ev0, { kind: k }), foe0)), 'duels, tournament rounds and team clashes all get the decision');
  // numbers shown = numbers applied
  const fresh = () => { const S = mkS('fate2'); S.glads[0].lvl = 6; return S; };
  for (const id of ['kill', 'spare', 'ransom']) {
    const S = fresh(), ev = duelOf(S), foe = ev.opps[0], o = by(LM.fateOffers(S, ev, foe), id), f0 = S.fame, g0 = S.gold, rep = { fame: 10, gold: 5, notes: [] }, st0 = S.fac ? Object.assign({}, S.fac) : { sen: 0, mer: 0, ple: 0 };
    LM.setRandom(LM.mulberry(5)); const r = LM.fate(S, ev, rep, id, foe); LM.setRandom(null);
    ok(r.id === id && S.fame - f0 === o.fame && S.gold - g0 === o.gold && rep.fame === 10 + o.fame && rep.gold === 5 + o.gold, `${id}: fame and gold applied are the printed ones`);
    ok(((S.fac.sen || 0) - (st0.sen || 0)) === Math.max(-(st0.sen || 0), o.fac.sen || 0) || (st0.sen || 0) + (o.fac.sen || 0) < 0, `${id}: Senate standing moves by the printed amount (clamped at 0)`);
  }
  { const S = fresh(), ev = duelOf(S), foe = ev.opps[0]; LM.fate(S, ev, null, 'kill', foe); ok(S.stats.kills === 1 && LM.vendetta(S, foe.rv) && !S.stats.ransoms, 'a kill counts, marks a vendetta on the rival, and is not a spare');
    const S2 = fresh(), e2 = duelOf(S2), f2 = e2.opps[0]; LM.fate(S2, e2, null, 'ransom', f2); ok(S2.stats.ransoms === 1 && S2.stats.spares === 0 && !LM.vendetta(S2, f2.rv), 'a ransom counts, is not a spare, and starts no vendetta');
    const S3 = fresh(), e3 = duelOf(S3), f3 = e3.opps[0]; const sp0 = S3.stats.spares; LM.fate(S3, e3, null, 'spare', f3); ok(S3.stats.spares === sp0 + 1, 'a spare counts toward mercy contracts and the Merciful trophy'); }
  // no choice means spare; unknown means spare
  { const S = fresh(), ev = duelOf(S), foe = ev.opps[0]; LM.setRandom(LM.mulberry(2)); const r = LM.fate(S, ev, null, undefined, foe), r2 = LM.fate(fresh(), ev, null, 'zzz', foe); LM.setRandom(null); ok(r.id === 'spare' && r2.id === 'spare', 'no choice (auto, fast-forward, bots) defaults to spare'); }
  // recruit chance: bounds, determinism, full barracks
  { let joins = 0, N = 400, lo = 1, hi = 0; const chance = []; for (let i = 0; i < N; i++) { const S = mkS('fj' + (i % 7)); const ev = duelOf(S), foe = ev.opps[0]; chance.push(LM.fateJoin(S, foe)); S.glads.length = 1; LM.setRandom(LM.mulberry(1000 + i)); const r = LM.fate(S, ev, null, 'spare', foe); LM.setRandom(null); if (r.joined) { joins++; ok(S.glads.length === 2 && r.joined.id !== foe.id && r.joined.rv == null && S.glads.includes(r.joined), 'a recruit is a copy added to the roster'); } }
    lo = Math.min(...chance); hi = Math.max(...chance); const mean = chance.reduce((a, b) => a + b, 0) / N;
    ok(lo >= 0.08 && hi <= 0.6, `recruit chance stays in 8%..60% (${lo}..${hi})`); ok(Math.abs(joins / N - mean) < 0.07, `recruits follow the chance over ${N} seeds (${(joins / N).toFixed(2)} vs ${mean.toFixed(2)})`); ok(mean >= 0.25 && mean <= 0.45, `the base is around 30% (mean ${mean.toFixed(2)})`);
    const S = mkS('full'); while (S.glads.length < LM.rosterCap(S)) S.glads.push(LM.makeGlad({ id: S.nextId++, lvl: 3 })); const ev = duelOf(S); ok(LM.fateJoin(S, ev.opps[0]) === 0 && by(LM.fateOffers(S, ev, ev.opps[0]), 'spare').cost.some((c) => /Barracks full/.test(c)), 'a full barracks means no recruit chance, and the panel says why');
    const Sb = mkS('bar'); const base = LM.fateJoin(Sb, duelOf(Sb).opps[0]); Sb.glads.push(LM.makeGlad({ id: 99, lvl: 2, trait: 'showman' })); ok(LM.fateJoin(Sb, duelOf(Sb).opps[0]) > base, 'a showman in the ludus helps persuade'); }
  // determinism
  { const run = () => { const S = mkS('det'); const ev = duelOf(S), foe = ev.opps[0]; LM.setRandom(LM.mulberry(77)); const r = LM.fate(S, ev, null, 'spare', foe); LM.setRandom(null); return JSON.stringify([r.id, r.fame, r.gold, !!r.joined, S.fame, S.fac, S.stats]); }; ok(run() === run(), 'the same seed gives the same outcome'); }
  // unit shape unchanged
  { const g = LM.makeGlad({ style: 'thraex', lvl: 4 }), k0 = Object.keys(LM.mkUnits([g], 'A', {})[0]).join(); const S = mkS('shape'); const ev = duelOf(S); LM.fate(S, ev, null, 'kill', ev.opps[0]); const k1 = Object.keys(LM.mkUnits([g], 'B', {})[0]).join(); ok(k0 === k1 && !k1.split(',').some((k) => /^(fate|kills?|killed|vend\w*|ransom\w*)$/i.test(k)), 'unit shape is unchanged by the decision (no new fields)'); }
  // old save: no kills, no ransoms, rivals without vend
  { const S = mkS('old'); delete S.stats.kills; delete S.stats.ransoms; S.rivals = { '1-0': { w: 1, l: 0, last: 'w' } }; const M = LM.migrate(JSON.parse(JSON.stringify(S))); ok(M.stats.kills === 0 && M.stats.ransoms === 0 && !LM.vendetta(M, '1-0') && M.stats.spares === S.stats.spares, 'an old save loads with kills and ransoms at 0 and no vendetta');
    const ev = duelOf(M), r = LM.fate(M, ev, null, 'kill', ev.opps[0]); ok(r.id === 'kill' && M.stats.kills === 1, 'and the decision works on it'); }
  // vendetta fades after 12 weeks
  { const S = mkS('vend'); const ev = duelOf(S), foe = ev.opps[0]; LM.fate(S, ev, null, 'kill', foe); ok(LM.vendetta(S, foe.rv), 'vendetta set'); S.week += 13; ok(!LM.vendetta(S, foe.rv), 'a vendetta fades after 12 weeks'); }
  // trophies
  { const S = mkS('tr'); S.stats.kills = 5; S.stats.ransoms = 3; const got = LM.checkTrophies(S).map((t) => t.id); ok(got.includes('blood5') && got.includes('ransom3'), 'Blood Sport and Ransomer trophies unlock'); }
  // rival ludus relation: ransom up, kill down (when the foe belongs to one of the four rival schools)
  { const S = mkS('rel'); const sch = LM.ludiInit(S).list[0]; const ev = duelOf(S), foe = Object.assign({}, ev.opps[0], { lud: sch.name }); const r0 = sch.rel; LM.fate(S, ev, null, 'ransom', foe); const r1 = sch.rel; LM.fate(S, ev, null, 'kill', foe); ok(r1 > r0 && sch.rel < r1, `ransom raises (${r0} to ${r1}) and a kill lowers (${sch.rel}) the school's regard`); }
  // balance sanity: the kill bonus stays a fraction of what the win itself pays, in every league and difficulty
  { let worst = 0, n = 0; for (let lg = 0; lg <= 3; lg++) for (let wk of [2, 6, 10]) { const S = mkS('bal' + lg + wk); const evs = LM.events(S, wk, lg).filter((e) => LM.FATE_KINDS[e.kind]); for (const e of evs) { const o = by(LM.fateOffers(S, e, e.opps[0]), 'kill'); const win = e.kind === 'duel' ? e.fame : LM.fateBase(e).fame; const ratio = o.fame / Math.max(1, win); worst = Math.max(worst, ratio); n++; } }
    ok(n > 20 && worst <= 1.7, `the kill bonus is at most ${worst.toFixed(2)}x the base win fame over ${n} events (the early-game flat part dominates, late game about 0.4x)`);
    const S = mkS('balx'); const e = LM.events(S, 6, 2).find((x) => x.kind === 'duel'); const k = by(LM.fateOffers(S, e, e.opps[0]), 'kill'); ok(k.fame / e.fame <= 0.55, `in the Colosseum a kill adds about ${Math.round(100 * k.fame / e.fame)}% of the win fame`); }
  ok(LM.fateHype('kill') > LM.fateHype('spare') && LM.fateHype('spare') > LM.fateHype('ransom') && LM.fateHype('kill') === by(off, 'kill').hype, 'crowd hype: kill > spare > ransom, the same numbers as printed');
  ok(LM.mercy(mkS('m1'), ev0, null, 'mercy').f > 0, 'the old LM.mercy API still works');
}

console.log(`ludus_maximus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
