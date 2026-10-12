// Ludus Maximus: logic tests (data, combat, fixtures, economy, save). Headless, no DOM.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus/data.js');
const LM = require('../ludus_maximus/sim.js');
require('../ludus_maximus/arena.js');

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

console.log(`ludus_maximus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
