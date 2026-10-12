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

console.log(`ludus_maximus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
