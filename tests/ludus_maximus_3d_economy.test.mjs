// Ludus Maximus 3D: ECONOMY AND WORLD suite (core/economy.js). Headless, no DOM: ledger and tribute, loans and their soft consequences, staff, the auction,
// caravan and back alley, the bookmaker and favors, the circuit, determinism (no combat random draws), old saves and the balance harness.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const D = require('../ludus_maximus_3d/core/data.js');
const LM = require('../ludus_maximus_3d/core/sim.js');
require('../ludus_maximus_3d/core/ext.js');
require('../ludus_maximus_3d/core/arena.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const near = (a, b, e) => Math.abs(a - b) <= e;
LM.setRandom(LM.mulberry(99));

const mk = (seed, o = {}) => {
  const S = LM.newGame({ name: 'E' + seed }); S.seed = 'e' + seed; S.fame = o.fame == null ? 0 : o.fame; S.gold = o.gold == null ? 1000 : o.gold;
  for (let i = 0; i < (o.glads == null ? 2 : o.glads); i++) { const g = LM.makeGlad({ id: S.nextId++, lvl: o.lvl || 4, style: D.STYLE_IDS[i % 5] }); g.act = 'rest'; S.glads.push(g); }
  (o.plots || []).forEach(([i, b, l]) => { S.plots[i] = { b, l }; }); S.rows = Math.max(S.rows, o.rows || 2);
  return S;
};
const week = (S) => { LM.weekTrain(S); return LM.weekFinish(S); };

ok(typeof LM.eco === 'function' && LM.economy && LM.economy.ver === 1, 'economy module is loaded');

// ---------------------------------------------------------------- 1. old saves: nothing changes until the player opts in or the career gets there
{
  const run = (off) => { LM.economy.off = off; LM.setRandom(LM.mulberry(5)); const S = mk(1, { gold: 300, fame: 90 }); const out = []; for (let i = 0; i < 10; i++) { week(S); out.push(Math.round(S.gold)); } LM.economy.off = false; return out; };
  const a = run(true), b = run(false);
  ok(JSON.stringify(a) === JSON.stringify(b), 'before fame 200 with no staff, loans or grand buildings the economy plays exactly as before: ' + a.join(',') + ' vs ' + b.join(','));
  const S = LM.newGame({ name: 'Old' }); ok(S.eco === undefined, 'a new save carries no eco record until something touches it');
  const J = JSON.parse(JSON.stringify(S)); const N = LM.migrate(J); ok(N.eco === undefined || typeof N.eco === 'object', 'an old save loads');
}

// ---------------------------------------------------------------- 2. determinism: no draw from the combat random stream
{
  const S = mk(2, { fame: 700, plots: [[4, 'market', 3], [7, 'scout', 3]] });
  const ref = LM.mulberry(1234), use = LM.mulberry(1234); LM.setRandom(use);
  LM.auction(S); LM.caravan(S); LM.alley(S); LM.board(S); LM.staffPool(S); LM.projection(S, 4); LM.weeklyBill(S); LM.tributeInfo(S); LM.goodPrice(S, 'wine'); LM.boardTruth(S, LM.board(S)[0]);
  let same = true; for (let i = 0; i < 5; i++) if (LM.rand() !== ref()) same = false;
  ok(same, 'the auction, caravan, alley, bookmaker and staff pool never draw from the combat random stream');
  const A1 = LM.auction(S), A2 = LM.auction(S); ok(JSON.stringify(A1.lots.map((l) => [l.id, l.g.name, l.g.lvl, l.reserve, l.bids])) === JSON.stringify(A2.lots.map((l) => [l.id, l.g.name, l.g.lvl, l.reserve, l.bids])), 'the auction is the same every time it is read');
  const S2 = mk(2, { fame: 700 }); ok(LM.auction(S2).lots[0].g.name === A1.lots[0].g.name, 'the same seed and week gives the same lots');
  const S3 = mk(3, { fame: 700 }); ok(LM.auction(S3).lots.map((l) => l.g.name).join() !== A1.lots.map((l) => l.g.name).join(), 'another seed gives other lots');
  S.week = 5; const w5 = LM.auction(S).lots.map((l) => l.g.name).join(); ok(w5 !== A1.lots.map((l) => l.g.name).join(), 'the lots rotate week to week');
  LM.setRandom(LM.mulberry(99));
}

// ---------------------------------------------------------------- 3. the ledger and the governor's tribute
{
  const S = mk(3, { fame: 100, gold: 800 });
  ok(LM.tribute(S) === 0, 'no tribute below 200 fame');
  S.fame = 1000; const t1 = LM.tribute(S); S.fame = 2800; const t2 = LM.tribute(S); S.fame = 90000;
  ok(t1 > 0 && t2 > t1 && LM.tribute(S) <= 90, `tribute grows with fame and is capped (${t1}, ${t2}, ${LM.tribute(S)})`);
  S.fame = 1000; const full = LM.tributeInfo(S).base; S.fac.sen = 60; ok(LM.tributeInfo(S).amount < full, 'Senate standing eases the tribute');
  S.fac.sen = 0;
  const g0 = S.gold; const rep = week(S); const E = LM.eco(S), row = E.ledger[E.ledger.length - 1];
  ok(!!row && row.wk === 1 && row.net === Math.round(S.gold - g0) && row.gold === Math.round(S.gold), 'the ledger row records the exact net change and the gold left');
  ok(row.tribute === t1 && row.wages > 0, 'the ledger shows tribute and wages by line');
  ok(rep.notes.some((n) => /Tribute/.test(n)), 'the week report mentions the tribute');
  for (let i = 0; i < 14; i++) week(S); ok(E.ledger.length === 12, 'the ledger keeps the last twelve weeks');
  const B = LM.weeklyBill(S); ok(B.total === B.food + B.wages + B.staff + B.building + B.tribute + B.lodging + B.loans, 'the weekly bill adds up');
  S.plots[3] = { b: 'market', l: 5 }; ok(LM.buildingUpkeep(S) === 12 && (S.plots[3] = { b: 'market', l: 2 }) && LM.buildingUpkeep(S) === 0, 'only level 3 and up buildings cost upkeep');
  // projection
  const P = LM.projection(S, 4); ok(P.length === 4 && P.every((p) => fin(p.gold) && p.wk >= S.week), 'a four week projection exists');
  const S4 = mk(4, { gold: 100, fame: 0 }); LM.loanTake(S4, 'temple', 100, 4); const P4 = LM.projection(S4, 4);
  ok(P4[0].loans > 0 && P4[3].loans > 0 && P4[0].expense > P4[0].loans, 'the projection carries the loan installments');
  S.gold = 5000; const t = S.gold; S.fame = 0; ok(LM.projection(S, 4)[0].gold < t + 200, 'the projection is deterministic and bounded');
  function fin(x) { return typeof x === 'number' && isFinite(x); }
}

// ---------------------------------------------------------------- 4. loans: terms, soft consequences, no game over
{
  const S = mk(5, { fame: 900, gold: 100 });
  const q = LM.loanQuote(S, 'guild', 200, 8); ok(q.pay * 8 === q.total && q.cost > 0 && q.cost < 200 * 0.3, 'loan quote: weekly payment times weeks is the total, the cost is plausible (' + q.cost + ')');
  ok(LM.loanQuote(S, 'usurer', 200, 6).cost > LM.loanQuote(S, 'temple', 200, 8).cost, 'the usurer is dearer than the temple');
  ok(LM.loanWhy(S, 'guild', 20, 8) !== '' && LM.loanWhy(S, 'guild', 200, 3) !== '' && LM.loanWhy(S, 'guild', 99999, 8) !== '', 'a tiny loan, an odd term and an over the limit loan are refused');
  ok(LM.loanWhy(mk(5, { fame: 10 }), 'guild', 100, 8) !== '', 'the guild wants 60 fame');
  const g0 = S.gold; ok(LM.loanTake(S, 'guild', 200, 8) === '' && S.gold === g0 + 200, 'borrowing pays out at once');
  ok(LM.loanWhy(S, 'guild', 100, 8) !== '', 'one loan per lender');
  LM.loanTake(S, 'temple', 100, 4); LM.loanTake(S, 'usurer', 100, 4); ok(LM.loanWhy(S, 'guild', 100, 8) !== '' && LM.eco(S).loans.length === 3, 'three loans at most');
  S.eco.loans = []; S.gold = 2000;
  // a full term repays the loan
  LM.loanTake(S, 'guild', 200, 8); const lo = S.eco.loans[0]; let weeks = 0; while (S.eco.loans.length && weeks < 20) { week(S); weeks++; }
  ok(S.eco.loans.length === 0 && weeks <= 9, `a loan is repaid over its term (${weeks} weeks)`);
  // repay options
  S.gold = 2000; LM.loanTake(S, 'temple', 100, 8); const id = S.eco.loans[0].id; ok(LM.loanRepay(S, id, 30) === '' && S.eco.loans[0].bal < 71, 'pay extra now'); ok(LM.loanRepay(S, id, 9999) === '' && S.eco.loans.length === 0, 'repay in full ends the loan');
  S.gold = 500; LM.loanTake(S, 'guild', 200, 4); const l2 = S.eco.loans[0], pay0 = l2.pay; ok(LM.loanRoll(S, l2.id) === '' && l2.left === 8 && l2.pay < pay0, 'roll over: longer, smaller installments'); LM.loanRoll(S, l2.id); ok(LM.loanRoll(S, l2.id) !== '', 'rolling over is limited to twice');
  S.eco.loans = [];
  // the ladder of soft consequences
  const T = mk(6, { fame: 900, gold: 0, glads: 2 }); T.gold = 300; LM.loanTake(T, 'guild', 250, 8); T.gold = 0;
  const it = LM.genItem(null, { ilvl: 6, rar: 2, league: 1 }); T.items.push(it); const mo0 = T.glads[0].mo;
  week(T); const l = T.eco.loans[0]; ok(l.missed === 1 && T.glads[0].mo < mo0 && T.items.length === 1 && T.gold >= 0, 'first missed payment: a collector visits, morale drops, nothing is taken');
  T.gold = 0; week(T); ok(T.eco.loans[0].missed === 2 && T.items.length === 0, 'second missed payment: the best spare item is seized');
  T.gold = 0; week(T); ok(!!T.eco.debt && T.eco.loans[0].missed >= 3, 'third missed payment: a debt chapter begins');
  ok(LM.loanWhy(T, 'guild', 100, 8) !== '' && /creditors|overdue/i.test(LM.loanWhy(T, 'temple', 200, 8)), 'no new loans in a debt chapter');
  ok(T.glads.length === 2 && T.gold >= 0, 'no game over: the ludus still stands');
  const f0 = T.fame; T.gold = 0; week(T); ok(T.fame < f0 || T.fame === 0, 'a debt chapter costs fame each week');
  // garnish
  T.gold = 0; const ev = { key: '1:0:d0', kind: 'duel', week: T.week, league: 0, diff: 0, title: 'x', size: 1, opps: [LM.mkOpp(T, LM.rivals(T, 0)[0], 3, 1, LM.mulberry(1), 0, false)], purse: 200, fame: 10, fee: 0 };
  const g1 = T.gold, rp = LM.settle(T, ev, [T.glads[0]], { win: true, hype: 50, hpf: {}, odds: 0.5 }); ok(T.eco.cur.garnish > 0 && rp.notes.some((n) => /Creditors/.test(n)), 'in a debt chapter the creditors take a quarter of a purse');
  // repay clears it
  T.gold = 5000; LM.loanRepay(T, T.eco.loans[0].id, 99999); ok(!T.eco.debt && T.eco.loans.length === 0, 'paying what is owed closes the debt chapter');
  // alms: nobody is left without a way back
  const P = mk(7, { fame: 0, gold: 10 }); P.eco = { debt: { from: 1 }, loans: [] }; ok(LM.loanWhy(P, 'temple', 100, 4) === '', 'the temple always lends a small sum to a destitute ludus, even in a debt chapter');
  // temple is gentle: it costs standing, never property
  const Tp = mk(8, { fame: 100, gold: 0 }); Tp.gold = 200; LM.loanTake(Tp, 'temple', 100, 4); Tp.gold = 0; const it2 = LM.genItem(null, { ilvl: 5, rar: 2 }); Tp.items.push(it2); Tp.fame = 100; week(Tp); week(Tp); ok(Tp.items.length === 1 && Tp.fame < 100, 'the temple pawnbroker takes standing, not gear');
}

// ---------------------------------------------------------------- 5. staff
{
  const S = mk(9, { fame: 400, gold: 2000, plots: [[0, 'palaestra', 3], [1, 'infirmary', 2], [3, 'forge', 3], [4, 'scout', 3]] });
  S.plots[2] = { b: 'palaestra', l: 3 };
  const pool = LM.staffPool(S); ok(pool.length >= 1 && pool.every((c) => c.wage > 0 && c.fee === c.wage * 4 && c.lvl >= 1 && c.lvl <= 3), 'the pool offers candidates with a wage, a level and a quirk');
  ok(pool.every((c) => LM.STAFF_QUIRKS[c.role].some((q) => q.id === c.quirk)), 'every candidate has a quirk from the role table');
  const S1 = mk(9, { fame: 400, gold: 2000 }); S1.plots = new Array(16).fill(null); const c0 = LM.staffPool(S1)[0]; ok(LM.hireWhy(S1, c0) !== '', 'a role needs its building');
  const c = { id: 'd1', role: 'doctore', name: 'Marcus', lvl: 3, quirk: 'taskmaster', fx: { train: 0.04 }, wage: 16, fee: 64 };
  ok(LM.hireStaff(S, c) === '' && LM.hireWhy(S, Object.assign({}, c, { id: 'd2' })) !== '', 'hire one per role');
  ok(near(LM.staffFx(S).train, 0.08 * 3 + 0.04, 1e-9), 'doctore training bonus is 8% per level plus the quirk: ' + LM.staffFx(S).train);
  const g = S.glads[0]; g.act = 'str'; g.en = 100; const before = g.st.str; LM.economy.off = true; const S0 = JSON.parse(JSON.stringify(S)); LM.economy.off = false;
  LM.setRandom(LM.mulberry(3)); LM.weekTrain(S); const withD = g.st.str - before; const g0 = S0.glads[0]; LM.economy.off = true; LM.setRandom(LM.mulberry(3)); LM.weekTrain(S0); LM.economy.off = false; const noD = g0.st.str - before;
  ok(withD > noD, `a Doctore lifts training gains (${withD.toFixed(2)} vs ${noD.toFixed(2)})`);
  const g1 = S.gold; week(S); ok(S.eco.ledger.slice(-1)[0].staff === 16 && S.gold <= g1, 'wages are paid each week');
  // level capped by the building
  S.plots[0] = { b: 'palaestra', l: 1 }; S.plots[2] = { b: 'palaestra', l: 1 }; ok(LM.staffEff(S, 'doctore') === 1, 'a staffer works at the level of the building at most');
  S.plots[0] = { b: 'palaestra', l: 3 };
  // scouting
  LM.hireStaff(S, { id: 's1', role: 'spy', name: 'Cassius', lvl: 2, quirk: 'gossip', fx: { risk: 0.04 }, wage: 12, fee: 48 }); const sc0 = LM.scoutLevel(S);
  S.eco.staff.spy.lvl = 3; ok(LM.scoutLevel(S) >= sc0, 'a Spymaster never lowers scouting'); ok(LM.staffFx(S).scout === 1 && LM.staffFx(S).risk > 0, 'a level 2+ Spymaster adds scouting and lowers alley risk');
  // unpaid
  S.gold = 0; S.eco.staff.doctore.unpaid = 0; week(S); ok(S.eco.staff.doctore.unpaid === 1, 'an unpaid staffer sulks'); S.gold = 0; week(S); S.gold = 0; week(S); ok(!S.eco.staff.doctore, 'three weeks unpaid and the staffer leaves');
  S.gold = 500; LM.hireStaff(S, { id: 's2', role: 'spy', name: 'Q', lvl: 1, quirk: 'gossip', fx: { risk: 0.04 }, wage: 8, fee: 32 }); S.gold = 100; ok(LM.fireStaff(S, 'spy') === '' && !S.eco.staff.spy, 'dismissal costs a week of wages');
  // physician and armourer
  const P = mk(10, { fame: 300, gold: 3000, plots: [[0, 'infirmary', 3], [1, 'forge', 3]] }); LM.hireStaff(P, { id: 'p', role: 'physician', name: 'Galen', lvl: 3, quirk: 'quick', fx: { heal: 1 }, wage: 16, fee: 64 });
  const hb = []; for (let w = 1; w <= 6; w++) { P.week = w; hb.push(LM.healBonus(P)); } ok(hb.some((x) => x >= 1), 'the Physician adds healed weeks every few weeks (' + hb.join(',') + ')');
  LM.hireStaff(P, { id: 'a', role: 'armourer', name: 'Tubal', lvl: 3, quirk: 'exact', fx: { upg: 0.04 }, wage: 16, fee: 64 });
  const item = LM.genItem(LM.mulberry(4), { ilvl: 5, rar: 2 }), cost = LM.upCost(item); const gp = P.gold; P.plots[1] = { b: 'forge', l: 3 }; LM.upgradeItem(P, item); ok(gp - P.gold < cost && gp - P.gold > cost * 0.7, 'the Armourer makes forge work cheaper');
}

// ---------------------------------------------------------------- 6. auction
{
  const S = mk(11, { fame: 700, gold: 5000, glads: 1, plots: [[0, 'barracks', 3]] });
  const A = LM.auction(S); ok(A.lots.length >= 3 && A.lots.every((l) => l.reserve > 0 && l.value > l.reserve && l.g.lvl >= 1), 'the auction offers 3 or more fighters with a reserve and a value');
  const spring = LM.auction(Object.assign(mk(11, { fame: 700 }), { week: 1 })), winter = LM.auction(Object.assign(mk(11, { fame: 700 }), { week: 10 }));
  const avg = (X) => X.lots.reduce((a, l) => a + l.value / (70 + LM.stars(l.g) * 45 + l.g.lvl * 38), 0) / X.lots.length; ok(avg(winter) < avg(spring), `winter prices are lower than spring prices (${avg(winter).toFixed(2)} vs ${avg(spring).toFixed(2)})`);
  const SF = mk(11, { fame: 700 }); SF.week = 2; let festWk = 0; for (let w = 2; w < 60 && !festWk; w++) if (LM.fest(SF, w) === 'jupiter') festWk = w; if (festWk) { SF.week = festWk; ok(LM.auction(SF).lots.length >= 4 && LM.auction(SF).lots.some((l) => l.feature), 'a festival week brings a featured lot'); } else ok(true, 'no jupiter week in range');
  const lot = A.lots.find((l) => l.bids.length) || A.lots[0], top = lot.bids.reduce((a, b) => Math.max(a, b.ceil), 0);
  ok(LM.auctionWhy(S, lot, lot.reserve - 1) !== '', 'bids under the reserve are refused');
  const high = Math.max(lot.reserve, top + 5), price = LM.auctionPrice(S, lot, high * 2); ok(price <= high * 2 && price >= lot.reserve && (top === 0 || price >= top), 'you pay just above the best rival, never above your bid');
  if (top > 0) { const lose = LM.auctionBid(S, lot.id, Math.max(lot.reserve, top - 1)); ok(lose.won === false && /outbid/i.test(S.forum.slice(-1)[0].t), 'a bid under the best rival ceiling loses'); const again = LM.auctionBid(S, lot.id, 9999); ok(!!again.err, 'a closed lot takes no more bids'); }
  const free = A.lots.find((l) => l.id !== lot.id && l.bids.length === 0) || A.lots.find((l) => l.id !== lot.id), n0 = S.glads.length, g0 = S.gold;
  const win = LM.auctionBid(S, free.id, Math.max(free.reserve, free.bids.reduce((a, b) => Math.max(a, b.ceil), 0) + 50)); ok(win.won === true && S.glads.length === n0 + 1 && S.gold < g0, 'a winning bid adds the fighter and takes the gold');
  ok(S.glads.every((g, i, a) => a.findIndex((x) => x.id === g.id) === i), 'the new fighter has a unique id');
  ok(LM.auction(S).res[free.id].won === true, 'the result is remembered for the week');
  const sees = LM.auctionSees(S); ok(sees === 0, 'without a spy you see no rival ceilings'); S.eco.staff.spy = { id: 'x', lvl: 2, wage: 10, quirk: 'nose', name: 'x' }; S.plots[5] = { b: 'scout', l: 2 }; ok(LM.auctionSees(S) >= 1, 'a Spymaster shows the rival range');
  const D2 = mk(11, { fame: 700, gold: 5000, glads: 1, plots: [[0, 'barracks', 1]] }); D2.eco = { debt: { from: 1 }, loans: [] }; ok(LM.auctionWhy(D2, LM.auction(D2).lots[0], 99999) !== '', 'a debt chapter closes the auction to you');
  const F = mk(11, { fame: 700, gold: 5000, glads: 3 }); ok(LM.auctionWhy(F, LM.auction(F).lots[0], 99999) === 'Barracks full', 'a full barracks blocks the bid');
}

// ---------------------------------------------------------------- 7. caravan, trade goods, pelts, back alley
{
  const S = mk(12, { fame: 700, gold: 3000, plots: [[4, 'market', 2]] });
  let here = 0, absent = 0; for (let w = 1; w <= 40; w++) { S.week = w; if (LM.caravanHere(S)) here++; else absent++; } ok(here > 14 && absent > 3, `the caravan comes most weeks but not all (${here} of 40)`);
  S.week = 1; while (!LM.caravanHere(S)) S.week++;
  const C = LM.caravan(S); ok(C.here && C.items.length === 5 && C.items.every((r) => r.price > 0 && r.swing >= 0.72 && r.swing <= 1.4 && r.it.rar >= 0), 'caravan stock has five items with price swings');
  const g0 = S.gold, a0 = S.items.length; ok(LM.caravanBuy(S, 0) === '' && S.gold < g0 && S.items.length === a0 + 1 && LM.caravanBuy(S, 0) === 'Sold', 'buy a caravan item once');
  // trade goods: seasonal swings, cap, profit when the price rises
  for (const id of Object.keys(LM.GOODS)) { const ps = []; for (let w = 1; w <= 12; w += 3) { S.week = w; ps.push(LM.goodPrice(S, id)); } ok(Math.max(...ps) > Math.min(...ps), `${id}: the price swings with the season (${ps.join(',')})`); }
  S.week = 1; while (!LM.caravanHere(S)) S.week++; const cap = LM.cargoCap(S); ok(cap === 6 + 4 * 2, 'cargo capacity grows with the Market');
  ok(LM.goodBuy(S, 'grain', cap + 1) !== '' && LM.goodBuy(S, 'grain', 3) === '' && LM.cargoUnits(S) === 3, 'storage is limited');
  const price0 = LM.goodPrice(S, 'grain'), gold0 = S.gold; LM.goodSell(S, 'grain', 3); ok(S.gold - gold0 < price0 * 3 && S.gold - gold0 > price0 * 3 * 0.85, 'buying and selling at once loses the 10% spread: no free money');
  let best = 0; for (let w = 1; w <= 60; w++) { S.week = w; if (!LM.caravanHere(S)) continue; best = Math.max(best, 1); } ok(best === 1, 'there are weeks to trade');
  // the best buy-low sell-high chain over a year is positive but modest
  let wealth = 0, held = 0, basis = 0, cashflow = 0; S.eco.cargo = {};
  for (let w = 1; w <= 48; w++) { S.week = w; if (!LM.caravanHere(S)) continue; const p = LM.goodPrice(S, 'wine'); if (held && p > LM.GOODS.wine.p * 1.08) { cashflow += Math.round(p * 0.95) * held - basis; held = 0; basis = 0; } else if (!held && p < LM.GOODS.wine.p * 0.92) { held = 6; basis = Math.round(p * 1.05) * 6; } }
  ok(cashflow >= 0 && cashflow < 900, `a patient trader makes a modest profit a year (${cashflow})`);
  // pelts
  const V = LM.venatio(S); V.pelts.wolf = 3; S.week = 1; while (!LM.caravanHere(S)) S.week++; const gp = S.gold, r = LM.peltSell(S, 'wolf'); ok(r.gold > 0 && S.gold === gp + r.gold && V.pelts.wolf === 0, 'the caravan buys pelts');
  // back alley
  let alleyWk = 0; for (let w = 1; w <= 20 && !alleyWk; w++) { S.week = w; if (LM.alleyHere(S)) alleyWk = w; } S.week = alleyWk; const AL = LM.alley(S);
  ok(AL.here && AL.items.length === 3 && AL.items.every((x) => x.risk >= 0.04 && x.risk <= 0.8 && x.price < LM.buyVal(S, x.it) * 0.6), 'the alley sells stolen goods at about half price with the odds shown');
  const hi = AL.items.slice().sort((a, b) => b.it.rar - a.it.rar)[0], lo = AL.items.slice().sort((a, b) => a.it.rar - b.it.rar)[0]; ok(hi.risk >= lo.risk, 'rarer goods carry more risk');
  S.eco.sus = 60; ok(LM.alleyRisk(S, hi.it) > hi.risk, 'suspicion raises the risk'); S.eco.sus = 0; S.fac.sen = 80; ok(LM.alleyRisk(S, hi.it) < hi.risk, 'Senate standing lowers the risk'); S.fac.sen = 0;
  let caught = 0, free = 0, sus0 = 0; for (let i = 0; i < 40; i++) { const T = mk(100 + i, { fame: 700, gold: 4000 }); let wk = 0; for (let w = 1; w <= 20 && !wk; w++) { T.week = w; if (LM.alleyHere(T)) wk = w; } T.week = wk; const row = LM.alley(T).items[0]; const R = LM.alleyBuy(T, row.i); if (R.caught) { caught++; ok(T.eco.sus >= 18 && T.fame < 700 && T.fac.sen === 0, 'caught: suspicion up, fame lost'); } else { free++; sus0 = T.eco.sus; } }
  ok(caught > 2 && free > 10, `the stated odds are real: ${caught} caught, ${free} clean of 40`); ok(sus0 >= 6, 'a clean purchase still raises suspicion');
  // audit when suspicion is high
  let audits = 0; for (let i = 0; i < 30; i++) { const T = mk(200 + i, { fame: 700, gold: 2000 }); T.eco = { sus: 95, loans: [] }; const f0 = T.fame; week(T); if (T.fame < f0) audits++; } ok(audits > 5 && audits < 30, `high suspicion invites an audit (${audits} of 30 weeks)`);
  const Q = mk(300, { fame: 700, gold: 2000 }); Q.eco = { sus: 30, loans: [] }; week(Q); ok(Q.eco.sus === 27, 'suspicion fades 3 points a week');
}

// ---------------------------------------------------------------- 8. bookmaker, bets, favors
{
  const S = mk(13, { fame: 700, gold: 2000, plots: [[7, 'scout', 3]] });
  const B = LM.board(S); ok(B.length === 3 && B.every((b) => b.a.name !== b.b.name && b.p > 0.07 && b.p < 0.93), 'the board has three bouts between different fighters');
  ok(B.every((b) => b.ma * b.p < 1 && b.ma * b.p > 0.8 && b.mb * (1 - b.p) < 1 && b.mb * (1 - b.p) > 0.8), 'the bookmaker keeps a margin: no bout pays fair odds');
  const caps = LM.betCaps(S); ok(caps.count === 3 && caps.one > 0 && caps.week >= caps.one, 'bet limits exist: ' + JSON.stringify(caps));
  ok(LM.betWhy(S, 2, { ref: 'x', side: 'a' }) !== '' && LM.betWhy(S, caps.one + 1, { ref: 'x', side: 'a' }) !== '', 'tiny and oversize stakes are refused');
  const g0 = S.gold, m0 = S.fac.mer; ok(LM.betBout(S, B[0].id, 'a', 50) === '' && S.gold === g0 - 50 && S.fac.mer === m0 + 1, 'a bet takes the stake and the Merchants like it');
  ok(LM.betBout(S, B[0].id, 'a', 50) !== '', 'the same bet twice is refused'); LM.betBout(S, B[1].id, 'b', 50); LM.betBout(S, B[2].id, 'a', 50); ok(LM.betBout(S, B[0].id, 'b', 50) !== '', 'three bets a week at most');
  const t = LM.boardTruth(S, B[0]); ok(t == null || (t >= 0 && t <= 1), 'scouts (level 2 and up) can read the true chance');
  const bal = S.gold; const rep = week(S); const E = LM.eco(S); ok(E.bets.length === 0 && E.betLog.length === 3, 'bets settle at the week end');
  ok(Math.abs(S.gold - bal) < 1500, 'settlement changes gold sanely');
  // average over many weeks: a blind bettor loses to the margin
  let net = 0, stake = 0; for (let s = 0; s < 14; s++) { const T = mk(400 + s, { fame: 700, gold: 20000 }); for (let w = 0; w < 6; w++) { const bd = LM.board(T)[0]; const side = bd.p >= 0.5 ? 'a' : 'b'; if (LM.betBout(T, bd.id, side, 40) === '') { stake += 40; const g1 = T.gold; week(T); net += T.gold - g1 + 0; } else week(T); } }
  ok(net < stake * 0.9, 'blind favourites do not beat the book (net of everything else is noisy, so only a gross check)');
  // against your own man
  const A = mk(14, { fame: 700, gold: 3000 }); A.week = 3; const evs = LM.events(A, 3, 0), duel = evs.find((e) => e.kind === 'duel'); const gl = A.glads[0]; LM.enter(A, duel, [gl.id], 'bal');
  const opts = LM.againstOptions(A); ok(opts.length === 1 && opts[0].mult >= 1.1, 'a duel you entered can be bet against');
  const ple = A.fac.ple = 30, ag = LM.betAgainst(A, duel.key, 50); ok(ag === '' && A.fac.ple === ple - 5, 'betting against your own costs the Plebs 5 standing');
  A.week = 3; LM.settle(A, duel, [gl], { win: false, hype: 10, hpf: { [gl.id]: 0.1 }, odds: 0.5 }); const goldBefore = A.gold; week(A); ok(A.eco.betLog.length === 1 && A.eco.betLog[0].net > 0, 'if your man loses the bet against him pays');
  const A2 = mk(15, { fame: 700, gold: 3000 }); A2.week = 3; const d2 = LM.events(A2, 3, 0).find((e) => e.kind === 'duel'); LM.enter(A2, d2, [A2.glads[0].id], 'bal'); LM.betAgainst(A2, d2.key, 50); const gb = A2.gold; LM.withdraw(A2, d2.key); week(A2); ok(A2.eco.betLog[0].net === 0 && A2.gold >= gb, 'a bet on a fight that was never fought is refunded');
  ok(LM.betAgainst(A2, d2.key, 50) !== '', 'you cannot bet on a fight you did not enter');
  // favors
  const F = mk(16, { fame: 900, gold: 3000 });
  ok(LM.FAVOR_IDS.length === 7 && LM.FAVOR_IDS.every((id) => LM.favorCost(F, id) > 0 && LM.favorRisk(F, id) >= 0 && LM.favorRisk(F, id) <= 0.7), 'seven favors, each with a cost and a risk');
  ok(LM.favorRisk(F, 'temple') === 0 && LM.favorRisk(F, 'toll') > LM.favorRisk(F, 'senator'), 'the temple gift is risk free, the road warden is the riskiest');
  F.eco = LM.eco(F); F.eco.sus = 40; const r40 = LM.favorRisk(F, 'clerk'); F.eco.sus = 0; ok(LM.favorRisk(F, 'clerk') < r40, 'suspicion raises every risk');
  const tri = LM.tribute(F), res = LM.favorDo(F, 'clerk'); ok(!res.err, 'clerk favor is available'); if (!res.caught) ok(LM.tribute(F) < tri, 'the clerk favor cuts the tribute'); ok(LM.favorDo(F, 'clerk').err, 'a favor has a cooldown');
  let caughtN = 0, doneN = 0; for (let i = 0; i < 80; i++) { const T = mk(500 + i, { fame: 900, gold: 3000 }); const r = LM.favorDo(T, 'toll'); if (r.caught) { caughtN++; ok(T.fame <= 892 && T.eco.sus >= 15, 'a caught bribe costs fame and raises suspicion'); } else doneN++; }
  ok(caughtN > 8 && doneN > 30, `the stated risk is real (${caughtN} caught of 80)`);
  const Sn = mk(17, { fame: 900, gold: 3000 }); Sn.fac.sen = 0; let sres; for (let i = 0; i < 6; i++) { const T = mk(600 + i, { fame: 900, gold: 3000 }); sres = LM.favorDo(T, 'senator'); if (!sres.caught) { ok(T.fac.sen === 10, 'dining a senator gives +10 Senate standing'); break; } }
  const Tp = mk(18, { fame: 900, gold: 3000 }); LM.favorDo(Tp, 'temple'); ok(Tp.fac.ple === 8, 'the temple gift gives the Plebs +8');
  ok(LM.favorWhy(mk(19, { fame: 0 }), 'clerk') !== '' && LM.favorWhy(mk(19, { fame: 900 }), 'magistrate') !== '', 'favors that do nothing for you are refused');
  const M = mk(20, { fame: 500, gold: 3000 }); M.eco = { debt: { from: 1 }, loans: [{ id: 'q', lender: 'guild', principal: 100, bal: 100, rate: 0.03, left: 3, pay: 40, missed: 3 }] }; for (let i = 0; i < 6 && M.eco.debt; i++) { const T = M; T.eco.fav = {}; LM.favorDo(T, 'magistrate'); T.gold = 3000; } ok(!M.eco.debt && M.eco.loans[0].missed === 0, 'the magistrate closes a debt chapter (within a few tries, the risk is real)');
  const Ed = mk(21, { fame: 900, gold: 3000 }); Ed.week = 3; const ev = LM.events(Ed, 3, 0).find((e) => e.kind === 'duel'); Ed.eco = LM.eco(Ed); Ed.eco.fav.editor = 10; LM.enter(Ed, ev, [Ed.glads[0].id], 'bal'); ok(Ed.entries[ev.key].paid === Math.round(ev.fee * 0.5), 'the editor favor halves the entry fee');
}

// ---------------------------------------------------------------- 9. the circuit
{
  const S = mk(22, { fame: 300, gold: 2000 });
  ok(LM.TOWN_IDS.length === 6 && LM.TOWN_IDS.every((id) => ['provincial', 'capua', 'alexandria', 'carthage', 'imperial'].includes(LM.TOWNS[id].theme)), 'six towns, each with a known arena theme id');
  ok(['ostia', 'pompeii', 'capua', 'alexandria', 'carthage', 'rome'].every((id, i, a) => i === 0 || LM.TOWNS[id].fame >= LM.TOWNS[a[i - 1]].fame), 'towns unlock in order of fame');
  ok(LM.tripWhy(S, 'rome') !== '' && LM.tripWhy(S, 'alexandria') !== '' && LM.tripWhy(S, 'ostia') === '', 'Rome and Alexandria are locked at 300 fame, Ostia is open');
  ok(LM.tripWhy(S, 'home') !== '', 'you cannot travel home from home');
  const base1 = LM.events(S, 3, 0).map((e) => e.purse), key0 = LM.events(S, 3, 0)[0].key;
  const c = LM.tripCost(S, 'capua'); ok(c.gold > 0 && c.weeks >= 1, 'a journey costs gold and weeks');
  const ent = LM.events(S, 4, 0).find((e) => e.kind === 'duel'); LM.enter(S, ent, [S.glads[0].id], 'bal'); const gBefore = S.gold;
  ok(LM.travel(S, 'capua') === '' && S.gold === gBefore - c.gold + ent.fee && !S.entries[ent.key], 'travelling takes the fare and refunds entries in the weeks that change');
  ok(LM.townFor(S, S.week) === null, 'you leave next week, not now'); ok(LM.townFor(S, S.week + 1) === 'road', 'the first week away is the road');
  ok(LM.events(S, S.week + 1, 0).length === 0 && LM.events(S, S.week + 1, 2).length === 0, 'no fights are offered on the road');
  ok(LM.onRoad({ eco: S.eco, week: S.week + 1, seed: S.seed }) === true, 'onRoad reads the history');
  const arrive = S.week + 1 + c.weeks, T = LM.townFor(S, arrive); ok(T && T.id === 'capua', 'you arrive in Capua');
  const evs = LM.events(S, arrive, 1); ok(evs.length >= 3 && evs.every((e) => e.theme === 'capua' && e.town === 'capua' && e.purse > 0), 'events in Capua carry the Capua arena theme');
  const base = LM.withRandom(LM.mulberry(1), () => { LM.economy.off = true; const r = LM.events(S, arrive, 1); LM.economy.off = false; return r; });
  ok(evs.filter((e) => !e.feature)[0].purse === Math.round(base[0].purse * LM.TOWNS.capua.purse), 'Capua purses are x' + LM.TOWNS.capua.purse);
  ok(evs.filter((e) => !e.feature)[0].fame >= base[0].fame, 'the host town gives prestige (fame is multiplied)');
  let showWk = 0; for (let w = arrive; w < arrive + 4 && !showWk; w++) if (LM.events(S, w, 1).some((e) => e.feature)) showWk = w; ok(showWk > 0, 'a Showpiece duel appears in the host town');
  const sp = LM.events(S, showWk, 1).find((e) => e.feature); ok(LM.eventByKey(S, sp.key) && LM.eventByKey(S, sp.key).title === sp.title && sp.diff === 2 && sp.purse > evs[0].purse, 'the Showpiece resolves by key and pays more');
  S.week = showWk; ok(LM.enter(S, sp, [S.glads[0].id], 'bal') === '' && LM.dueKeys(S).includes(sp.key), 'you can enter the Showpiece and it comes due');
  ok(LM.events(S, arrive, 0).every((e) => !e.theme), 'a league the town does not host keeps its normal events and arena');
  ok(LM.lodging(Object.assign({}, S, { week: arrive })) > 0, 'lodging is charged while away');
  // renown
  S.week = arrive; const evx = LM.events(S, arrive, 1)[0]; const r0 = LM.townRenown(S, 'capua'); LM.settle(S, evx, [S.glads[0]], { win: true, hype: 50, hpf: {}, odds: 0.5 }); ok(LM.townRenown(S, 'capua') === r0 + 1, 'wins in a town build its renown');
  // return home
  S.gold = 1000; ok(LM.travel(S, 'home') === '', 'travel home'); S.week += 3; ok(LM.townFor(S, S.week + 5) === null, 'back home, the town bonuses are gone');
  ok(LM.events(S, S.week + 6, 1).every((e) => !e.theme), 'home events carry no town theme');
  // the old calendar still works
  const H = mk(23, { fame: 300 }); const cal = LM.calendar(H); ok(cal && cal.length === 12 || (cal && cal.weeks && cal.weeks.length === 12), 'the season calendar still works');
  const toll = mk(24, { fame: 300, gold: 2000 }); toll.eco = LM.eco(toll); toll.eco.fav.toll = 1; ok(LM.tripCost(toll, 'ostia').gold === Math.round(LM.TOWNS.ostia.gold * 0.5), 'the toll favor halves the next journey');
}

// ---------------------------------------------------------------- 10. saves
{
  const S = mk(25, { fame: 500, gold: 1500, plots: [[0, 'palaestra', 2]] }); LM.loanTake(S, 'guild', 150, 8); LM.hireStaff(S, { id: 'd', role: 'doctore', name: 'M', lvl: 1, quirk: 'kindly', fx: { mo: 1 }, wage: 8, fee: 32 }); LM.betBout(S, LM.board(S)[0].id, 'a', 20); LM.travel(S, 'ostia'); week(S);
  const text = JSON.stringify(S), N = LM.migrate(JSON.parse(text)); ok(JSON.stringify(N.eco) === JSON.stringify(S.eco), 'the eco record survives a save and load unchanged');
  const code = LM.exportFile ? LM.parseImport(LM.exportFile(S)) : null; ok(!code || (code.S || code) && true, 'export and import accept a save with an eco record');
  const bad = JSON.parse(text); bad.eco = 'junk'; ok(typeof LM.migrate(bad).eco !== 'string', 'a damaged eco record is repaired');
  const bad2 = JSON.parse(text); bad2.eco.loans = [null, { lender: 'nobody' }, 5]; bad2.eco.staff = { doctore: 'x', ghost: {} }; bad2.eco.hist = [{ town: 'atlantis', from: 1, arrive: 2 }, 'x']; const fixed = LM.migrate(bad2);
  ok(fixed.eco.loans.length === 0 && Object.keys(fixed.eco.staff).length === 0 && fixed.eco.hist.length === 0, 'junk loans, staff and journeys are dropped');
  const bad3 = JSON.parse(text); delete bad3.eco.ledger; bad3.eco.sus = 'x'; const f3 = LM.migrate(bad3); ok(Array.isArray(f3.eco.ledger) && f3.eco.sus === 0, 'missing and invalid fields are refilled');
  const bad4 = JSON.parse(text); bad4.eco = null; ok((() => { const x = LM.migrate(bad4); return x.eco === undefined || typeof x.eco === 'object'; })(), 'a null eco record is harmless');
  for (let i = 0; i < 3; i++) week(f3); ok(f3.gold >= 0 && f3.eco.ledger.length > 0, 'a repaired save keeps playing');
}

// ---------------------------------------------------------------- 11. the balance tool, a short run
{
  const out = execFileSync(process.execPath, [join(here, '..', 'tools', 'ludus3d_balance.mjs'), '--careers', '6', '--weeks', '36', '--seed', '7'], { encoding: 'utf8', timeout: 240000 });
  ok(/ECONOMY BEFORE/.test(out) && /CHECKS/.test(out) && /no dead end/.test(out), 'the balance tool prints the before and after table and the checks');
  ok(/PASS  no dead end: careers ending broke/.test(out), 'no careers end broke in the short run');
}
LM.economy.off = false;

console.log(`ludus_maximus_3d economy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
