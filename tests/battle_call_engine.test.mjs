// Battle Call: the rules engine (battle_call/engine.js + js/shared.js).
//
// What matters here is money and fairness: that a bracket is drawn the way the organiser expects
// (8th v 1st, 7th v 2nd), that every kind of prediction and bet pays exactly what it should, that a
// wrong result can be taken back without leaving a single Loop behind, and that nobody can vote twice.
//
// Run: node tests/battle_call_engine.test.mjs
import assert from 'node:assert/strict';
import * as E from '../battle_call/engine.js';
import { cropBox } from '../battle_call/js/photo.js';
import { seedOrder, buildMatches, roundsOf, multiplier, slotsFor, nameKey } from '../battle_call/js/shared.js';

let pass = 0, failN = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { failN++; console.log('FAIL  ' + name + '\n      ' + (e.stack || e).split('\n').slice(0, 4).join('\n      ')); }
};

function setup({ size = 8, beatboxers = 12, users = 4, start = 1000 } = {}) {
  const S = E.newState(E.newEvent({ code: 'TEST1', name: 'Test Battle', size, now: 1 }));
  S.ev.settings.start = start;
  S.ev.settings.thirdPlace = false; // most tests end at the final; third place has its own tests
  S.now = 1;
  E.hostAction(S, { a: 'bb.add', names: Array.from({ length: beatboxers }, (_, i) => 'BB' + (i + 1)) });
  const us = [];
  for (let i = 0; i < users; i++) {
    const r = E.canRegister(S, { name: 'user' + (i + 1), device: 'dev' + (i + 1), ipH: 'ip' });
    assert.ok(r.ok, r.err);
    us.push(E.addUser(S, E.newUser(S, { name: r.name, device: 'dev' + (i + 1), ipH: 'ip' })));
  }
  return { S, us, ids: S.ev.bbs.map((b) => b.id) };
}
const total = (S) => [...S.users.values()].reduce((a, u) => a + E.netWorth(S, u), 0);
const host = (S, a) => { const r = E.hostAction(S, a); assert.ok(r.ok, JSON.stringify(a) + ' -> ' + r.err); return r; };
const playMatch = (S, mid, w, judges) => {
  host(S, { a: 'step', mid, to: 'live' });
  host(S, { a: 'step', mid, to: 'voting' });
  host(S, { a: 'step', mid, to: 'closed' });
  host(S, { a: 'result', mid, w, judges });
};

console.log('bracket shape');
t('seed order puts 1 v 8 and 2 v 7 on opposite halves', () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(16), [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
  for (const n of [4, 8, 16, 32]) assert.equal(new Set(seedOrder(n)).size, n);
});
t('round names go Top 16 -> Top 8 -> Top 4 -> Final', () => {
  assert.deepEqual(roundsOf(16).map((r) => r.short), ['Top 16', 'Top 8', 'Top 4', 'Final']);
  assert.deepEqual(roundsOf(8).map((r) => r.long), ['Quarter-finals', 'Semi-finals', 'Final']);
  assert.equal(buildMatches(16).length, 15);
});
t('the drawn bracket pairs seed 1 with seed N, and winners meet in the standard tree', () => {
  const { S, ids } = setup({ size: 8, beatboxers: 8, users: 0 });
  host(S, { a: 'phase', to: 'elimination' });
  const order = [...ids].reverse(); // seed 1 = BB8
  host(S, { a: 'seeds', order });
  const m = (id) => S.ev.matches.find((x) => x.id === id);
  assert.deepEqual([m('r0m0').a, m('r0m0').b], [order[0], order[7]]);
  assert.deepEqual([m('r0m1').a, m('r0m1').b], [order[3], order[4]]);
  assert.deepEqual([m('r0m2').a, m('r0m2').b], [order[1], order[6]]);
  assert.deepEqual([m('r0m3').a, m('r0m3').b], [order[2], order[5]]);
  assert.equal(m('r1m0').status, 'wait');
});

console.log('phases');
t('needs enough beatboxers, moves lobby -> picks -> elimination, and only publishes with a full ranking', () => {
  const { S, ids } = setup({ size: 8, beatboxers: 6, users: 0 });
  assert.equal(E.hostAction(S, { a: 'phase', to: 'picks' }).ok, false);
  host(S, { a: 'bb.add', names: ['X1', 'X2', 'Another'] });
  host(S, { a: 'phase', to: 'picks' });
  assert.equal(E.hostAction(S, { a: 'phase', to: 'lobby' }).ok, true, 'picks can be closed again');
  host(S, { a: 'phase', to: 'picks' });
  assert.equal(E.hostAction(S, { a: 'phase', to: 'bracket' }).ok, false, 'but the phases cannot be skipped');
  host(S, { a: 'phase', to: 'elimination' });
  assert.equal(E.hostAction(S, { a: 'seeds', order: S.ev.bbs.slice(0, 7).map((b) => b.id) }).ok, false);
  assert.equal(E.hostAction(S, { a: 'seeds', order: Array(8).fill(S.ev.bbs[0].id) }).ok, false);
});
t('duplicate names are refused and the lineup locks once the bracket is drawn', () => {
  const { S } = setup({ size: 4, beatboxers: 4, users: 0 });
  assert.equal(host(S, { a: 'bb.add', names: ['bb1', 'New one'] }).added, 1);
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: S.ev.bbs.slice(0, 4).map((b) => b.id) });
  assert.equal(E.hostAction(S, { a: 'bb.add', names: ['Late'] }).ok, false);
  assert.equal(E.hostAction(S, { a: 'bb.rm', id: S.ev.bbs[0].id }).ok, false);
});

console.log('accounts');
t('nicknames are unique ignoring case and the per-device cap holds', () => {
  const { S } = setup({ users: 1 });
  assert.equal(E.canRegister(S, { name: 'USER1', device: 'x' }).ok, false);
  assert.equal(E.canRegister(S, { name: 'a' }).ok, false);
  S.ev.settings.maxPerDevice = 1;
  assert.equal(E.canRegister(S, { name: 'fresh', device: 'dev1' }).ok, false);
  assert.equal(E.canRegister(S, { name: 'fresh', device: 'other' }).ok, true);
  S.ev.settings.regOpen = false;
  assert.equal(E.canRegister(S, { name: 'fresh', device: 'other' }).ok, false);
});

console.log('top-N predictions');
t('a top-N call pays for who got through and for exact and near seats', () => {
  const { S, us, ids } = setup({ size: 8, beatboxers: 12, users: 2 });
  host(S, { a: 'phase', to: 'picks' });
  const [u1, u2] = us;
  // u1: perfect 1..8, u2: all eight right but shifted by one, plus one wrong
  assert.ok(E.setTop(S, u1, ids.slice(0, 8)).ok);
  assert.ok(E.setTop(S, u2, [ids[1], ids[0], ids[2], ids[3], ids[4], ids[5], ids[6], ids[10]]).ok);
  assert.equal(E.setTop(S, u1, [ids[0], ids[0]]).ok, false, 'duplicates are refused');
  host(S, { a: 'phase', to: 'elimination' });
  assert.equal(E.setTop(S, u1, ids.slice(0, 8)).ok, false, 'picks are locked once elimination starts');
  host(S, { a: 'seeds', order: ids.slice(0, 8) });
  const P = S.ev.settings.pts;
  assert.equal(u1.bal - 1000, 8 * (P.topIn + P.topExact));
  // u2: seats 1,2 swapped (near), 3..7 exact, one outsider
  assert.equal(u2.bal - 1000, 2 * (P.topIn + P.topNear) + 5 * (P.topIn + P.topExact));
});
t('the crowd consensus ranks by Borda count', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 6, users: 3 });
  host(S, { a: 'phase', to: 'picks' });
  E.setTop(S, us[0], [ids[0], ids[1], ids[2], ids[3]]);
  E.setTop(S, us[1], [ids[0], ids[2], ids[1], ids[3]]);
  E.setTop(S, us[2], [ids[1], ids[0], ids[4], ids[5]]);
  host(S, { a: 'phase', to: 'elimination' });
  const c = S.ev.consensus;
  assert.equal(c.voters, 3);
  assert.equal(c.rows[0].id, ids[0]);
  assert.equal(c.rows.length, 4);
});

console.log('bets (parimutuel)');
t('winners split the pot pro rata, losers pay in, and the house money is only the seed', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 4, users: 3 });
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  const mk = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0');
  const [x, y, z] = us;
  assert.ok(E.setBet(S, x, mk.id, 0, 100).ok);
  assert.ok(E.setBet(S, y, mk.id, 1, 300).ok);
  assert.ok(E.setBet(S, z, mk.id, 1, 100).ok);
  assert.equal(x.bal, 900);
  const T = mk.seed[0] + mk.seed[1] + 500;
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.equal(E.setBet(S, x, mk.id, 0, 200).ok, false, 'bets lock when the battle starts');
  host(S, { a: 'result', mid: 'r0m0', w: 'b' });
  const side = mk.seed[1] + 400;
  assert.equal(y.bal, 700 + Math.floor((300 * T) / side));
  assert.equal(z.bal, 900 + Math.floor((100 * T) / side));
  assert.equal(x.bal, 900, 'lost stake is gone');
  assert.equal(x.bets[mk.id][2], 0);
});
t('a winning bet never pays less than stake x minPayout', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 4, users: 1 });
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  const mk = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0');
  E.setBet(S, us[0], mk.id, 0, 1000);
  playMatch(S, 'r0m0', 'a');
  assert.ok(us[0].bal >= 1100, 'got ' + us[0].bal);
});
t('bets can be moved, topped up and taken back while the market is open, and guard the balance', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 4, users: 1 });
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  const mk = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0');
  const u = us[0];
  assert.equal(E.setBet(S, u, mk.id, 0, 5).ok, false, 'min bet');
  assert.equal(E.setBet(S, u, mk.id, 0, 5000).ok, false, 'more than you have');
  E.setBet(S, u, mk.id, 0, 400);
  E.setBet(S, u, mk.id, 0, 700);
  assert.equal(u.bal, 300);
  assert.deepEqual(mk.pool, [700, 0]);
  E.setBet(S, u, mk.id, 1, 700);
  assert.deepEqual(mk.pool, [0, 700]); assert.deepEqual(mk.cnt, [0, 1]);
  E.setBet(S, u, mk.id, 1, 0);
  assert.equal(u.bal, 1000); assert.deepEqual(mk.cnt, [0, 0]);
  assert.equal(Object.keys(u.bets).length, 0);
});
t('qualify bets: yes/no on making the cut, paid when the ranking is published', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 8, users: 2 });
  host(S, { a: 'phase', to: 'picks' });
  const q = (id) => Object.values(S.ev.markets).find((m) => m.kind === 'qualify' && m.bb === id);
  assert.equal(Object.values(S.ev.markets).filter((m) => m.kind === 'qualify').length, 8);
  E.setBet(S, us[0], q(ids[0]).id, 0, 200); // yes, and they make it
  E.setBet(S, us[1], q(ids[7]).id, 0, 200); // yes, and they do not
  host(S, { a: 'phase', to: 'elimination' });
  assert.equal(E.setBet(S, us[0], q(ids[1]).id, 0, 50).ok, false, 'locked with the elimination');
  host(S, { a: 'seeds', order: ids.slice(0, 4) });
  assert.ok(us[0].bal > 1000);
  assert.equal(us[1].bal, 800);
  assert.equal(q(ids[7]).win, 1);
});
t('champion and reach markets settle from the bracket', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 4, users: 2 });
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  const champ = Object.values(S.ev.markets).find((m) => m.kind === 'champion');
  assert.equal(champ.bbs.length, 4);
  host(S, { a: 'mk.preset', preset: 'reach', to: 1 });
  const reach = (id) => Object.values(S.ev.markets).find((m) => m.kind === 'reach' && m.bb === id);
  assert.equal(Object.values(S.ev.markets).filter((m) => m.kind === 'reach').length, 4);
  E.setBet(S, us[0], champ.id, 0, 100);         // seed 1 to win it all
  E.setBet(S, us[1], reach(ids[3]).id, 0, 100); // seed 4 to reach the final: they will lose the first battle
  E.setBet(S, us[1], reach(ids[0]).id, 0, 100);
  playMatch(S, 'r0m0', 'a'); // seed 1 beats seed 4
  assert.equal(reach(ids[3]).st, 'settled'); assert.equal(reach(ids[3]).win, 1, 'knocked out before the round = no');
  assert.equal(reach(ids[0]).win, 0, 'drawn into the final = yes');
  assert.equal(E.setBet(S, us[0], champ.id, 3, 50).ok, false, 'cannot back someone who is out');
  playMatch(S, 'r0m1', 'a');
  playMatch(S, 'r1m0', 'a');
  assert.equal(S.ev.phase, 'finished');
  assert.equal(S.ev.champion, ids[0]);
  assert.equal(champ.win, 0);
  assert.ok(us[0].bal > 1000);
});

console.log('battles, votes and bracket picks');
function bracketWorld() {
  const w = setup({ size: 4, beatboxers: 4, users: 3 });
  host(w.S, { a: 'phase', to: 'elimination' });
  host(w.S, { a: 'seeds', order: w.ids });
  return w;
}
t('picking: only real fighters, downstream picks follow, rounds lock when a battle starts', () => {
  const { S, us, ids } = bracketWorld();
  const u = us[0];
  assert.equal(E.setPick(S, u, 'r0m0', ids[1]).ok, false, 'not in that battle');
  assert.ok(E.setPick(S, u, 'r0m0', ids[0]).ok);
  assert.ok(E.setPick(S, u, 'r0m1', ids[2]).ok);
  assert.ok(E.setPick(S, u, 'r1m0', ids[0]).ok, 'the final is open to your own picks');
  E.setPick(S, u, 'r0m0', ids[3]); // change your mind about battle 1
  assert.equal(u.picks['r1m0'], undefined, 'final pick for the old winner is dropped');
  assert.ok(E.setPick(S, u, 'r1m0', ids[3]).ok);
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.equal(E.setPick(S, u, 'r0m1', ids[1]).ok, false, 'whole round is locked');
});
t('bracket picks pay 25 x 2^round', () => {
  const { S, us, ids } = bracketWorld();
  const [a, b] = us;
  for (const [u, c] of [[a, [ids[0], ids[1], ids[0]]], [b, [ids[3], ids[1], ids[1]]]]) {
    E.setPick(S, u, 'r0m0', c[0]); E.setPick(S, u, 'r0m1', c[1]); E.setPick(S, u, 'r1m0', c[2]);
  }
  const base = a.bal;
  playMatch(S, 'r0m0', 'a');
  assert.equal(a.bal - base, 25); assert.equal(b.bal - base, 0);
  playMatch(S, 'r0m1', 'a'); // ids[1] vs ids[2]: seed2 (ids[1]) wins
  assert.equal(a.bal - base, 50); assert.equal(b.bal - base, 25);
  playMatch(S, 'r1m0', 'a'); // ids[0] beats ids[1]
  assert.equal(a.bal - base, 25 + 25 + 50, 'the final pick pays 25 x 2');
  assert.equal(b.bal - base, 25, 'b picked the wrong finalist');
});
t('a live pick can sit on a fighter who is already out and simply scores nothing', () => {
  const { S, us, ids } = bracketWorld();
  const u = us[0];
  E.setPick(S, u, 'r0m0', ids[3]); E.setPick(S, u, 'r1m0', ids[3]);
  playMatch(S, 'r0m0', 'a'); // ids[0] wins, the pick is busted
  const m = S.ev.matches.find((x) => x.id === 'r1m0');
  assert.equal(m.a, ids[0]);
  assert.deepEqual(slotsFor(S.ev.matches, u.picks, m)[0], ids[0]);
});
t('voting: one vote each, changeable while open, tallied, rewarded, and judges decide', () => {
  const { S, us, ids } = bracketWorld();
  const [a, b, c] = us;
  assert.equal(E.castVote(S, a, 'r0m0', 'a').ok, false, 'not open yet');
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.equal(E.castVote(S, a, 'r0m0', 'a').ok, false, 'still not open: the battle is on');
  host(S, { a: 'step', mid: 'r0m0', to: 'voting' });
  assert.ok(E.castVote(S, a, 'r0m0', 'a').ok);
  assert.ok(E.castVote(S, a, 'r0m0', 'a').ok);
  assert.ok(E.castVote(S, b, 'r0m0', 'b').ok);
  assert.ok(E.castVote(S, c, 'r0m0', 'a').ok);
  assert.ok(E.castVote(S, c, 'r0m0', 'b').ok, 'changed their mind');
  const m = S.ev.matches[0];
  assert.deepEqual(m.c, { a: 1, b: 2 });
  assert.equal(E.metaOf(S).cats[0].matches[0].c, null, 'crowd result hidden until voting closes');
  host(S, { a: 'step', mid: 'r0m0', to: 'closed' });
  assert.equal(E.castVote(S, a, 'r0m0', 'b').ok, false, 'closed');
  assert.deepEqual(E.metaOf(S).cats[0].matches[0].c, { a: 1, b: 2 });
  host(S, { a: 'result', mid: 'r0m0', w: 'b', judges: { a: 1, b: 2 } });
  const P = S.ev.settings.pts;
  assert.equal(a.bal, 1000 + P.vote);
  assert.equal(b.bal, 1000 + P.vote + P.sync);
  assert.equal(c.bal, 1000 + P.vote + P.sync);
  assert.deepEqual(S.ev.matches[0].judges, { a: 1, b: 2 });
});
t('only one battle at a time; a walk-over can skip the voting', () => {
  const { S, ids } = bracketWorld();
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.equal(E.hostAction(S, { a: 'step', mid: 'r0m1', to: 'live' }).ok, false);
  assert.equal(E.hostAction(S, { a: 'result', mid: 'r0m1', w: 'a' }).ok, false);
  host(S, { a: 'result', mid: 'r0m0', w: 'a' });
  host(S, { a: 'result', mid: 'r0m1', w: 'b' }); // straight from upcoming
  assert.equal(S.ev.matches.find((x) => x.id === 'r1m0').status, 'upcoming');
});
t('swapping sides is only allowed before the battle starts', () => {
  const { S } = bracketWorld();
  host(S, { a: 'swap', mid: 'r0m0' });
  assert.equal(S.ev.matches[0].swap, true);
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.equal(E.hostAction(S, { a: 'swap', mid: 'r0m0' }).ok, false);
});

console.log('taking a result back');
t('a battle started by mistake can be put back: bets and picks reopen, the round unlocks', () => {
  const { S, us, ids } = bracketWorld();
  const mk = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0');
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.equal(E.setBet(S, us[0], mk.id, 0, 100).ok, false);
  assert.equal(E.setPick(S, us[0], 'r0m1', ids[1]).ok, false);
  host(S, { a: 'step', mid: 'r0m0', to: 'upcoming' });
  assert.ok(E.setBet(S, us[0], mk.id, 0, 100).ok, 'bets are open again');
  assert.ok(E.setPick(S, us[0], 'r0m1', ids[1]).ok, 'so are the picks');
  host(S, { a: 'step', mid: 'r0m0', to: 'live' }); host(S, { a: 'step', mid: 'r0m0', to: 'voting' });
  assert.equal(E.hostAction(S, { a: 'step', mid: 'r0m0', to: 'upcoming' }).ok, false, 'not once voting has opened');
});
t('reopening a result restores every balance, stat, market and the bracket exactly', () => {
  const { S, us, ids } = bracketWorld();
  const [a, b, c] = us;
  const mk = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0');
  E.setPick(S, a, 'r0m0', ids[0]); E.setBet(S, a, mk.id, 0, 200); E.setBet(S, b, mk.id, 1, 300);
  host(S, { a: 'step', mid: 'r0m0', to: 'live' }); host(S, { a: 'step', mid: 'r0m0', to: 'voting' });
  E.castVote(S, c, 'r0m0', 'a');
  host(S, { a: 'step', mid: 'r0m0', to: 'closed' });
  const snap = () => JSON.stringify([...S.users.values()].map((u) => [u.key, u.bal, u.st, u.bets]));
  const before = snap(), worldBefore = total(S);
  host(S, { a: 'result', mid: 'r0m0', w: 'a' });
  assert.notEqual(snap(), before);
  const nextMk = Object.values(S.ev.markets).filter((m) => m.kind === 'match' && m.mid === 'r1m0');
  assert.equal(nextMk.length, 0, 'final not ready: only one side is known');
  host(S, { a: 'reopen', mid: 'r0m0' });
  assert.equal(JSON.stringify([...S.users.values()].map((u) => [u.key, u.bal, u.st, u.bets])), before.replace(/"won":\d+,/, (x) => x));
  assert.equal(S.ev.matches[0].status, 'closed');
  assert.equal(S.ev.matches[0].w, null);
  assert.equal(mk.st, 'locked');
  assert.equal(S.ev.out[ids[3]], undefined);
  assert.equal(total(S), worldBefore);
  // and the corrected result pays the other way
  host(S, { a: 'result', mid: 'r0m0', w: 'b' });
  assert.ok(b.bal > 700);
  assert.equal(a.bal, 800 + 0);
});
t('a result cannot be reopened once the next battle has started; the ranking cannot be re-drawn once a battle ran', () => {
  const { S } = bracketWorld();
  playMatch(S, 'r0m0', 'a');
  playMatch(S, 'r0m1', 'a');
  host(S, { a: 'step', mid: 'r1m0', to: 'live' });
  assert.equal(E.hostAction(S, { a: 'reopen', mid: 'r0m0' }).ok, false);
  assert.equal(E.hostAction(S, { a: 'seeds.revert' }).ok, false);
});
t('re-drawing the ranking before any battle refunds, un-pays and rebuilds', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 6, users: 2 });
  host(S, { a: 'phase', to: 'picks' });
  E.setTop(S, us[0], ids.slice(0, 4));
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids.slice(0, 4) });
  const mk = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0');
  E.setBet(S, us[1], mk.id, 0, 250);
  assert.ok(us[0].bal > 1000);
  host(S, { a: 'seeds.revert' });
  assert.equal(us[0].bal, 1000, 'prediction points taken back');
  assert.equal(us[1].bal, 1000, 'stake refunded');
  assert.equal(S.ev.phase, 'elimination');
  assert.equal(S.ev.matches.length, 0);
  host(S, { a: 'seeds', order: [ids[3], ids[2], ids[1], ids[0]] });
  assert.equal(us[0].bal, 1000 + 4 * 20 + 2 * 15, 'all four in the top four, two of them one seat off');
});

console.log('regressions from review');
t('nicknames that are object property names are refused (they used to break settlement)', () => {
  const { S } = setup({ users: 0 });
  for (const n of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(E.canRegister(S, { name: n }).ok, false, n);
});
t('a market the organiser voided is never refunded twice', () => {
  const { S, us, ids } = bracketWorld();
  playMatch(S, 'r0m0', 'a'); playMatch(S, 'r0m1', 'a');
  const fin = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r1m0');
  E.setBet(S, us[0], fin.id, 0, 500);
  host(S, { a: 'mk.void', id: fin.id });
  assert.equal(us[0].bal, 1000 + 25 * 0, 'refunded once');
  const before = us[0].bal;
  host(S, { a: 'reopen', mid: 'r0m1' });
  assert.equal(us[0].bal, before, 'no second refund');
});
t('re-drawing the ranking drops a hand-opened champion market built on the old bracket', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 5, users: 1 });
  S.ev.settings.autoChampion = false;
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids.slice(0, 4) });
  host(S, { a: 'mk.preset', preset: 'champion' });
  const c = Object.values(S.ev.markets).find((m) => m.kind === 'champion');
  E.setBet(S, us[0], c.id, 0, 100);
  host(S, { a: 'seeds.revert' });
  assert.equal(us[0].bal, 1000, 'stake refunded');
  assert.equal(Object.values(S.ev.markets).filter((m) => m.kind === 'champion').length, 0);
  S.ev.settings.autoChampion = true;
  host(S, { a: 'seeds', order: [ids[4], ...ids.slice(0, 3)] });
  assert.ok(Object.values(S.ev.markets).find((m) => m.kind === 'champion').bbs.includes(ids[4]));
});
t('reach bets are not offered on fighters already drawn into that round; reopening needs no battle in progress and undoes tips', () => {
  const { S, ids } = setup({ size: 8, beatboxers: 8, users: 1 });
  host(S, { a: 'phase', to: 'elimination' }); host(S, { a: 'seeds', order: ids });
  for (const id of ['r0m0', 'r0m1', 'r0m2', 'r0m3']) playMatch(S, id, 'a');
  assert.equal(E.hostAction(S, { a: 'mk.preset', preset: 'reach', to: 1 }).ok, false, 'round 0 is over, nothing to bet on');
  host(S, { a: 'step', mid: 'r1m0', to: 'live' });
  assert.equal(E.hostAction(S, { a: 'reopen', mid: 'r0m3' }).ok, false, 'a battle is in progress');
});

console.log('undo');
t('Undo walks the whole night back, one step at a time, and every Loop ends up where it started', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 6, users: 4 });
  host(S, { a: 'phase', to: 'picks' });
  const q = Object.values(S.ev.markets).filter((m) => m.kind === 'qualify');
  us.forEach((u, i) => { E.setTop(S, u, ids.slice(0, 4)); E.setBet(S, u, q[i].id, i % 2, 100 + i * 50); });
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids.slice(0, 4) });
  us.forEach((u, i) => { E.setPick(S, u, 'r0m0', S.ev.matches[0].a); E.setPick(S, u, 'r0m1', S.ev.matches[1].b); E.setPick(S, u, 'r1m0', S.ev.matches[0].a); const mk = Object.values(S.ev.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0'); E.setBet(S, u, mk.id, i % 2, 80); });
  for (const [mid, w] of [['r0m0', 'a'], ['r0m1', 'b'], ['r1m0', 'a']]) {
    host(S, { a: 'step', mid, to: 'live' }); host(S, { a: 'step', mid, to: 'voting' });
    us.forEach((u, i) => E.castVote(S, u, mid, i % 2 ? 'a' : 'b'));
    host(S, { a: 'step', mid, to: 'closed' }); host(S, { a: 'result', mid, w, judges: { a: 2, b: 1 } });
  }
  assert.equal(S.ev.phase, 'finished');
  assert.ok(us.some((u) => u.bal !== 1000));
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const plan = E.undoPlan(S);
    if (!plan) break;
    const r = host(S, { a: 'undo' });
    assert.equal(r.undid, plan.label);
    seen.push(r.undid);
  }
  assert.equal(S.ev.phase, 'lobby');
  assert.equal(E.undoPlan(S), null, 'nothing left to undo at the door');
  for (const u of us) { assert.equal(u.bal, 1000, u.name + ' is back to the starting Loops'); assert.equal(E.staked(S, u), 0); }
  assert.ok(seen.some((x) => /^Take back the result of/.test(x)) && seen.some((x) => /ranking/.test(x)) && seen.some((x) => /picks/.test(x)), seen.join(' | '));
  assert.equal(Object.values(S.ev.markets).length, 0, 'every market is gone with its refunds');
  // and the night can be played again from there
  host(S, { a: 'phase', to: 'elimination' }); host(S, { a: 'seeds', order: ids.slice(0, 4) });
  assert.equal(S.ev.phase, 'bracket');
});
t('Undo says what it will do, and stops at a battle somewhere else being on stage', () => {
  const { S } = bracketWorld();
  assert.match(E.undoPlan(S).label, /ranking/);
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.match(E.undoPlan(S).label, /Put .* back/);
  host(S, { a: 'undo' });
  assert.equal(S.ev.matches[0].status, 'upcoming');
  host(S, { a: 'step', mid: 'r0m0', to: 'live' }); host(S, { a: 'step', mid: 'r0m0', to: 'voting' });
  host(S, { a: 'undo' });
  assert.equal(S.ev.matches[0].status, 'live', 'closing the vote goes back to the battle');
});

console.log('categories');
function twoCats() {
  const w = setup({ size: 4, beatboxers: 5, users: 3 });
  const { S } = w;
  const r = host(S, { a: 'cat.add', name: 'Crew', size: 2 });
  host(S, { a: 'bb.add', cat: r.cat, names: ['Crew A', 'Crew B', 'Crew C'] });
  return { ...w, crew: S.event.cats[r.cat], main: S.event.cats.c1 };
}
t('an event holds several categories with their own lineup, size and phase, and ids never collide', () => {
  const { S, crew, main } = twoCats();
  assert.deepEqual(S.event.order, ['c1', crew.id]);
  assert.equal(crew.settings.size, 2); assert.equal(main.settings.size, 4);
  assert.equal(crew.bbs.length, 3); assert.equal(main.bbs.length, 5);
  assert.equal(new Set([...main.bbs, ...crew.bbs].map((b) => b.id)).size, 8, 'beatboxer ids are event-wide');
  host(S, { a: 'phase', cat: crew.id, to: 'elimination' });
  assert.equal(crew.phase, 'elimination'); assert.equal(main.phase, 'lobby');
  host(S, { a: 'seeds', cat: crew.id, order: crew.bbs.slice(0, 2).map((b) => b.id) });
  host(S, { a: 'phase', cat: 'c1', to: 'elimination' }); host(S, { a: 'seeds', cat: 'c1', order: main.bbs.slice(0, 4).map((b) => b.id) });
  const ids = [...main.matches, ...crew.matches].map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'match ids are event-wide');
  assert.equal(crew.matches.length, 1, 'a 2-bracket is just the final');
  const mks = [...Object.keys(main.markets), ...Object.keys(crew.markets)];
  assert.equal(new Set(mks).size, mks.length, 'market ids are event-wide');
});
t('one wallet: bets, picks, votes and results in two categories add up in the same balance, tops stay per category', () => {
  const { S, us, crew, main } = twoCats();
  const [a, b] = us;
  host(S, { a: 'phase', cat: 'c1', to: 'picks' });
  assert.ok(E.setTop(S, a, main.bbs.slice(0, 4).map((x) => x.id), 'c1').ok);
  assert.equal(E.setTop(S, a, crew.bbs.slice(0, 2).map((x) => x.id), crew.id).ok, false, 'the crew category is not open for picks');
  host(S, { a: 'phase', cat: crew.id, to: 'picks' });
  assert.ok(E.setTop(S, a, crew.bbs.slice(0, 2).map((x) => x.id), crew.id).ok);
  assert.equal(a.tops.c1.length, 4); assert.equal(a.tops[crew.id].length, 2);
  host(S, { a: 'phase', cat: 'c1', to: 'elimination' }); host(S, { a: 'phase', cat: crew.id, to: 'elimination' });
  host(S, { a: 'seeds', cat: 'c1', order: main.bbs.slice(0, 4).map((x) => x.id) });
  host(S, { a: 'seeds', cat: crew.id, order: crew.bbs.slice(0, 2).map((x) => x.id) });
  const P = S.ev.settings.pts;
  assert.equal(a.bal, 1000 + 4 * (P.topIn + P.topExact) + 2 * (P.topIn + P.topExact), 'both rankings paid into one wallet');
  const mm = Object.values(main.markets).find((m) => m.kind === 'match' && m.mid === 'r0m0');
  const cm = Object.values(crew.markets).find((m) => m.kind === 'match');
  E.setBet(S, b, mm.id, 0, 100); E.setBet(S, b, cm.id, 1, 200);
  assert.equal(b.bal, 700); assert.equal(E.staked(S, b), 300, 'stakes in both categories count');
  assert.equal(E.setPick(S, b, crew.matches[0].id, crew.matches[0].a).ok, true);
  assert.equal(E.setPick(S, b, 'r0m0', crew.matches[0].a).ok, false, 'a crew member is not in a main-category battle');
  playMatch(S, crew.matches[0].id, 'a');
  assert.equal(S.event.active, crew.id, 'the category with a battle on stage is the active one');
  assert.equal(crew.phase, 'finished'); assert.equal(main.phase, 'bracket');
  assert.ok(b.bal !== 700); assert.equal(E.staked(S, b), 100, 'the crew bet is settled, the main one is still riding');
});
t('only one battle on stage across the whole event, and the stage cannot move mid-battle', () => {
  const { S, crew } = twoCats();
  for (const [c, n] of [['c1', 4], [crew.id, 2]]) { host(S, { a: 'phase', cat: c, to: 'elimination' }); host(S, { a: 'seeds', cat: c, order: S.event.cats[c].bbs.slice(0, n).map((b) => b.id) }); }
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  assert.equal(E.hostAction(S, { a: 'step', mid: crew.matches[0].id, to: 'live' }).ok, false, 'finish the main battle first');
  assert.equal(E.hostAction(S, { a: 'cat.stage', id: crew.id }).ok, false);
  host(S, { a: 'result', mid: 'r0m0', w: 'a' });
  host(S, { a: 'cat.stage', id: crew.id });
  assert.equal(S.event.active, crew.id);
});
t('taking back a ranking or a result in one category leaves the other untouched', () => {
  const { S, us, crew, main } = twoCats();
  for (const [c, n] of [['c1', 4], [crew.id, 2]]) { host(S, { a: 'phase', cat: c, to: 'picks' }); }
  E.setTop(S, us[0], main.bbs.slice(0, 4).map((x) => x.id), 'c1'); E.setTop(S, us[0], crew.bbs.slice(0, 2).map((x) => x.id), crew.id);
  for (const [c, n] of [['c1', 4], [crew.id, 2]]) { host(S, { a: 'phase', cat: c, to: 'elimination' }); host(S, { a: 'seeds', cat: c, order: S.event.cats[c].bbs.slice(0, n).map((b) => b.id) }); }
  const P = S.ev.settings.pts, perfect = (n) => n * (P.topIn + P.topExact);
  assert.equal(us[0].bal, 1000 + perfect(4) + perfect(2));
  host(S, { a: 'seeds.revert', cat: crew.id });
  assert.equal(us[0].bal, 1000 + perfect(4), 'only the crew prediction points were taken back');
  assert.equal(main.phase, 'bracket'); assert.equal(crew.phase, 'elimination');
  assert.equal(main.matches.length, 3);
});
t('categories can be renamed and removed only before they start, and the last one stays', () => {
  const { S, crew } = twoCats();
  assert.equal(E.hostAction(S, { a: 'cat.add', name: 'crew', size: 8 }).ok, false, 'names are unique');
  assert.equal(E.hostAction(S, { a: 'cat.add', name: 'Bad', size: 12 }).ok, false, 'only the real bracket sizes');
  host(S, { a: 'cat.rename', id: crew.id, name: 'Tag Team' });
  assert.equal(crew.name, 'Tag Team');
  host(S, { a: 'cat.rm', id: crew.id });
  assert.deepEqual(S.event.order, ['c1']);
  assert.equal(E.hostAction(S, { a: 'cat.rm', id: 'c1' }).ok, false, 'an event keeps at least one category');
  host(S, { a: 'phase', cat: 'c1', to: 'picks' });
  const r = host(S, { a: 'cat.add', name: 'Loop Station', size: 64 });
  r.id = r.cat;
  assert.equal(S.event.cats[r.id].settings.size, 64);
  host(S, { a: 'bb.add', cat: r.id, names: Array.from({ length: 64 }, (_, i) => 'LS' + i) });
  host(S, { a: 'phase', cat: r.id, to: 'elimination' });
  host(S, { a: 'seeds', cat: r.id, order: S.event.cats[r.id].bbs.map((b) => b.id) });
  assert.equal(S.event.cats[r.id].matches.length, 63);
  assert.equal(E.hostAction(S, { a: 'cat.rm', id: r.id }).ok, false, 'started categories stay');
});
t('settings: bracket size is per category, the house rules are shared by all of them', () => {
  const { S, crew, main } = twoCats();
  host(S, { a: 'settings', cat: crew.id, set: { size: 4 } });
  assert.equal(crew.settings.size, 4); assert.equal(main.settings.size, 4);
  host(S, { a: 'settings', set: { minPayout: 1.5, maxPerDevice: 3 } });
  assert.equal(crew.settings.minPayout, 1.5); assert.equal(main.settings.maxPerDevice, 3);
  assert.equal(E.metaOf(S).set.minPayout, 1.5);
  assert.equal(E.metaOf(S).cats.length, 2);
});

t('categories get a picture: guessed from the name, chosen by the host, changeable later', () => {
  const { S, main } = twoCats();
  assert.equal(main.art, 'male');
  const r = host(S, { a: 'cat.add', name: 'Solo Female', size: 8 });
  assert.equal(S.event.cats[r.cat].art, 'female');
  assert.equal(host(S, { a: 'cat.add', name: 'Tag Team', size: 4 }).cat && S.event.cats.c4.art, 'duo');
  assert.equal(host(S, { a: 'cat.add', name: 'Loop Station', size: 4 }).cat && S.event.cats.c5.art, 'loop');
  assert.equal(host(S, { a: 'cat.add', name: 'Anything', size: 4, art: 'crew' }).cat && S.event.cats.c6.art, 'crew', 'a chosen picture wins over the guess');
  host(S, { a: 'cat.art', id: 'c1', art: 'duo' });
  assert.equal(main.art, 'duo');
  assert.equal(E.hostAction(S, { a: 'cat.art', id: 'c1', art: 'robot' }).ok, false);
  assert.equal(E.metaOf(S).cats[0].art, 'duo');
});

console.log('big fields');
t('with more entrants than the auto limit the organiser picks which "makes the cut" bets to open', () => {
  const { S, ids } = setup({ size: 8, beatboxers: 60, users: 2 });
  host(S, { a: 'phase', to: 'picks' });
  assert.equal(Object.values(S.ev.markets).length, 0, 'no flood of 60 markets');
  assert.equal(host(S, { a: 'mk.qualify', ids: [ids[0], ids[1], 'nope'] }).added, 2);
  assert.equal(E.hostAction(S, { a: 'mk.qualify', ids: [ids[0]] }).ok, false, 'already open');
  assert.equal(Object.values(S.ev.markets).length, 2);
  assert.equal(host(S, { a: 'mk.qualify', all: true }).added, 58);
  host(S, { a: 'bb.add', names: ['Late entry'] });
  assert.equal(Object.values(S.ev.markets).length, 60, 'a late entry past the limit does not auto-open');
});
t('a huge lineup is accepted in one paste, de-duplicated, and capped', () => {
  const { S } = setup({ size: 16, beatboxers: 0, users: 0 });
  const names = Array.from({ length: 700 }, (_, i) => 'Entrant ' + (i % 650));
  assert.equal(host(S, { a: 'bb.add', names }).added, 500, 'at most 500 names per paste');
  host(S, { a: 'bb.add', names: names.slice(0, 700) });
  assert.ok(S.ev.bbs.length <= 650);
  assert.equal(new Set(S.ev.bbs.map((b) => b.name.toLowerCase())).size, S.ev.bbs.length);
});

console.log('a whole battle, many players');
t('32 beatboxers, 120 random players: the world stays solvent and the numbers stay sane', () => {
  const { S, us, ids } = setup({ size: 16, beatboxers: 32, users: 120 });
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pickN = (arr, n) => [...arr].sort(() => rnd() - 0.5).slice(0, n);
  host(S, { a: 'phase', to: 'picks' });
  for (const u of us) { E.setTop(S, u, pickN(ids, 16)); const q = Object.values(S.ev.markets).filter((m) => m.kind === 'qualify'); for (const m of pickN(q, 3)) E.setBet(S, u, m.id, rnd() < 0.5 ? 0 : 1, 10 + Math.floor(rnd() * 200)); }
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: pickN(ids, 16) });
  for (let r = 0; r < 4; r++) {
    for (const u of us) {
      for (const m of S.ev.matches.filter((x) => x.r === r)) { const s = slotsFor(S.ev.matches, u.picks, m); const p = s.filter(Boolean); if (p.length) E.setPick(S, u, m.id, p[Math.floor(rnd() * p.length)]); }
      for (const k of Object.values(S.ev.markets).filter((x) => x.st === 'open')) if (rnd() < 0.15) E.setBet(S, u, k.id, Math.floor(rnd() * k.pool.length), 10 + Math.floor(rnd() * 100));
    }
    for (const m of S.ev.matches.filter((x) => x.r === r)) {
      host(S, { a: 'step', mid: m.id, to: 'live' }); host(S, { a: 'step', mid: m.id, to: 'voting' });
      for (const u of us) if (rnd() < 0.8) E.castVote(S, u, m.id, rnd() < 0.5 ? 'a' : 'b');
      host(S, { a: 'step', mid: m.id, to: 'closed' });
      host(S, { a: 'result', mid: m.id, w: rnd() < 0.5 ? 'a' : 'b', judges: { a: 2, b: 1 } });
      for (const k of Object.values(S.ev.markets)) assert.ok(k.pool.every((x) => x >= 0) && k.cnt.every((x) => x >= 0), 'pool went negative');
    }
  }
  assert.equal(S.ev.phase, 'finished'); assert.ok(S.ev.champion);
  for (const u of S.users.values()) { assert.ok(Number.isFinite(u.bal) && u.bal >= 0, u.key + ' bal ' + u.bal); assert.equal(E.staked(S, u), 0, 'nothing still riding'); }
  for (const k of Object.values(S.ev.markets)) assert.ok(k.st === 'settled' || k.st === 'void', k.kind + ' ' + k.st);
  const board = E.boardOf(S);
  assert.equal(board.length, 50); assert.ok(board[0].net >= board[49].net);
  assert.ok(JSON.stringify(E.metaOf(S)).length < 60000, 'meta stays small: ' + JSON.stringify(E.metaOf(S)).length);
});

console.log('vote countdown and third place');
t('the vote length is 4 minutes: events still on an earlier default (10 or 30 s) follow, a custom length stays, and a later choice sticks', () => {
  const mk = (v) => { const ev = E.newEvent({ code: 'M', name: 'M', size: 4, now: 1 }); const c = ev.cats[ev.order[0]]; c.settings.voteSecs = v; delete c.settings.voteSecsV; return ev; };
  const on = (ev) => ev.cats[ev.order[0]].settings;
  assert.equal(on(E.migrateEvent(mk(10))).voteSecs, 240);
  assert.equal(on(E.migrateEvent(mk(30))).voteSecs, 240);
  assert.equal(on(E.migrateEvent(mk(15))).voteSecs, 15);
  const ev = E.migrateEvent(mk(30)); on(ev).voteSecs = 30; E.migrateEvent(ev);
  assert.equal(on(ev).voteSecs, 30, 'migrated once only');
  assert.equal(on(E.newEvent({ code: 'N', name: 'N', size: 4, now: 1 })).voteSecs, 240, 'new events start at 4 minutes');
});

t('voting has a countdown: closes itself, late votes bounce, 0 means manual', () => {
  const { S, us } = bracketWorld();
  S.now = 1000;
  host(S, { a: 'step', mid: 'r0m0', to: 'live' });
  host(S, { a: 'step', mid: 'r0m0', to: 'voting' });
  const m = S.ev.matches.find((x) => x.id === 'r0m0');
  assert.equal(m.vsecs, 240, 'default is 4 minutes');
  assert.equal(m.vend, 241000);
  assert.deepEqual(E.closeDueVotes(S), [], 'not due yet');
  S.now = 240999;
  assert.ok(E.castVote(S, us[0], 'r0m0', 'a').ok);
  S.now = 241000;
  assert.deepEqual(E.closeDueVotes(S), ['r0m0']);
  assert.equal(m.status, 'closed');
  assert.equal(m.vend, 0);
  host(S, { a: 'step', mid: 'r0m0', to: 'voting', secs: 0 });
  assert.equal(m.vend, 0, 'no timer');
  S.now = 999999;
  assert.deepEqual(E.closeDueVotes(S), []);
  assert.ok(E.castVote(S, us[1], 'r0m0', 'b').ok);
  host(S, { a: 'step', mid: 'r0m0', to: 'closed' });
  host(S, { a: 'step', mid: 'r0m0', to: 'voting', secs: 20 });
  assert.equal(m.vend, S.now + 20000);
  S.now += 20000 + 2501;
  assert.equal(E.castVote(S, us[2], 'r0m0', 'a').ok, false, 'too late');
});
t('third place: made when both semis are done, played before the final, paid like a battle, undone in order', () => {
  const w = setup({ size: 4, beatboxers: 4, users: 2 });
  const { S, ids } = w;
  S.ev.settings.thirdPlace = true;
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  const start = total(S);
  assert.ok(!S.ev.matches.some((x) => x.third));
  playMatch(S, 'r0m0', 'a');
  assert.ok(!S.ev.matches.some((x) => x.third), 'only after both semis');
  playMatch(S, 'r0m1', 'b');
  const th = S.ev.matches.find((x) => x.third);
  assert.ok(th, 'third place exists');
  assert.equal(th.status, 'upcoming');
  assert.deepEqual([th.a, th.b].sort(), [ids[3], ids[1]].sort(), 'the two semi losers');
  assert.ok(S.ev.matches.indexOf(th) < S.ev.matches.findIndex((x) => x.r === 1 && !x.third), 'before the final');
  assert.equal(E.setPick(S, w.us[0], th.id, th.a).ok, false, 'no bracket picks on third place');
  playMatch(S, th.id, 'a');
  assert.equal(S.ev.phase, 'bracket', 'not finished until the final');
  assert.ok(!S.ev.champion, 'a third-place result is not a champion');
  playMatch(S, 'r1m0', 'a');
  assert.equal(S.ev.phase, 'finished');
  assert.ok(S.ev.champion);
  assert.ok(Math.abs(total(S) - start) < 1e6);
});
t('third place can be switched off in settings', () => {
  const w = setup({ size: 4, beatboxers: 4, users: 1 });
  const { S, ids } = w;
  assert.equal(S.ev.settings.thirdPlace, false);
  host(S, { a: 'settings', set: { thirdPlace: true } });
  assert.equal(S.ev.settings.thirdPlace, true);
  host(S, { a: 'settings', set: { thirdPlace: false, voteSecs: 15 } });
  assert.equal(S.ev.settings.thirdPlace, false);
  assert.equal(S.ev.settings.voteSecs, 15);
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  playMatch(S, 'r0m0', 'a'); playMatch(S, 'r0m1', 'a');
  assert.ok(!S.ev.matches.some((x) => x.third));
  playMatch(S, 'r1m0', 'a');
  assert.equal(S.ev.phase, 'finished');
});
t('taking back a semi is refused while third place is in play, and removes the match once it is not', () => {
  const w = setup({ size: 4, beatboxers: 4, users: 1 });
  const { S, ids } = w;
  S.ev.settings.thirdPlace = true;
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  playMatch(S, 'r0m0', 'a'); playMatch(S, 'r0m1', 'a');
  const th = S.ev.matches.find((x) => x.third);
  host(S, { a: 'step', mid: th.id, to: 'live' });
  assert.equal(E.hostAction(S, { a: 'reopen', mid: 'r0m1' }).ok, false);
  host(S, { a: 'step', mid: th.id, to: 'upcoming' });
  host(S, { a: 'reopen', mid: 'r0m1' });
  assert.ok(!S.ev.matches.some((x) => x.third), 'third place withdrawn');
  host(S, { a: 'result', mid: 'r0m1', w: 'b' });
  assert.ok(S.ev.matches.some((x) => x.third), 'and made again');
});
t('the category summary carries its art (crew tabs used to show the male portrait)', () => {
  const { S } = setup();
  host(S, { a: 'cat.add', name: 'Crew', size: 4, art: 'crew' });
  const m = E.metaOf(S);
  assert.ok(m.cats.some((c) => c.art === 'crew'));
});

console.log('streaks');
t('voting with the judges several times in a row pays a growing bonus, and taking a result back takes it back', () => {
  const { S, us, ids } = setup({ size: 8, beatboxers: 8, users: 2 });
  host(S, { a: 'phase', to: 'elimination' });
  host(S, { a: 'seeds', order: ids });
  const [a, b] = us;
  const vote = (mid, ua, ub) => {
    host(S, { a: 'step', mid, to: 'live' }); host(S, { a: 'step', mid, to: 'voting' });
    E.castVote(S, a, mid, ua); E.castVote(S, b, mid, ub);
    host(S, { a: 'step', mid, to: 'closed' });
  };
  const gain = (u, f) => { const before = u.bal; f(); return u.bal - before; };
  const P = S.ev.settings.pts;
  vote('r0m0', 'a', 'b'); const g1 = gain(a, () => host(S, { a: 'result', mid: 'r0m0', w: 'a' }));
  assert.equal(g1, P.vote + P.sync, 'first one: no bonus yet');
  vote('r0m1', 'a', 'b'); const g2 = gain(a, () => host(S, { a: 'result', mid: 'r0m1', w: 'a' }));
  assert.equal(g2, P.vote + P.sync + 5, 'two in a row: +5');
  assert.equal(E.voteStreak(S, a), 2); assert.equal(E.voteStreak(S, b), 0);
  assert.equal(E.meOf(S, a).streak, 2);
  vote('r0m2', 'b', 'b'); const g3 = gain(a, () => host(S, { a: 'result', mid: 'r0m2', w: 'a' }));
  assert.equal(g3, P.vote, 'wrong side breaks the run');
  assert.equal(E.voteStreak(S, a), 0);
  host(S, { a: 'reopen', mid: 'r0m2' });
  assert.equal(E.voteStreak(S, a), 2, 'back to the run');
  assert.equal(a.st.streakBonus, 5, 'one bonus paid so far');
  host(S, { a: 'step', mid: 'r0m2', to: 'voting' }); host(S, { a: 'step', mid: 'r0m2', to: 'closed' });
  host(S, { a: 'result', mid: 'r0m2', w: 'b' });
  assert.equal(E.voteStreak(S, a), 3, 'three in a row now');
  assert.equal(a.st.streakBonus, 15, 'run of three pays +10 on top');
  host(S, { a: 'reopen', mid: 'r0m2' });
  assert.equal(a.st.streakBonus, 5, 'taking the result back takes the bonus back');
});

console.log('photo crop');
t('a portrait photo is cropped from near the top, and a found face is centred', () => {
  const portrait = cropBox(1200, 1600);
  assert.equal(portrait.side, 1200); assert.ok(portrait.y > 0 && portrait.y < 200, 'near the top, not the centre (200)');
  assert.deepEqual(cropBox(1600, 1200), { x: 200, y: 0, side: 1200 });
  const f = cropBox(1200, 1600, { x: 500, y: 100, width: 200, height: 250 });
  assert.ok(f.y < 100 && f.y + f.side > 350, 'the face is inside the square: ' + JSON.stringify(f));
});

console.log('walkover');
t('a category with one entrant is crowned at the elimination, with no money moving, and can be taken back', () => {
  const { S, us } = setup({ size: 8, beatboxers: 8, users: 1 });
  const r = E.hostAction(S, { a: 'cat.add', name: 'Solo Female', size: 2 }); assert.ok(r.ok);
  host(S, { a: 'bb.add', cat: r.cat, names: ['Sena Mascs'] });
  const start = total(S), cat = S.event.cats[r.cat];
  assert.equal(E.hostAction(S, { a: 'walkover', cat: r.cat }).ok, false, 'not before the elimination');
  host(S, { a: 'phase', cat: r.cat, to: 'picks' });
  host(S, { a: 'phase', cat: r.cat, to: 'elimination' });
  host(S, { a: 'walkover', cat: r.cat });
  assert.equal(cat.phase, 'finished'); assert.equal(cat.champion, cat.bbs[0].id); assert.ok(E.metaOf(S).cats.find((c) => c.id === r.cat).walkover);
  assert.equal(total(S), start);
  host(S, { a: 'undo', cat: r.cat });
  assert.equal(cat.phase, 'elimination'); assert.equal(cat.champion, null);
  assert.equal(E.hostAction(S, { a: 'walkover', cat: S.event.order[0] }).ok, false, 'a real category cannot walk over');
});

console.log('performer');
const perfOf = (S, cat = 'c1') => (E.liveOf(S, 0, false).perf || {})[cat] || null;
t('the elimination round runs while predictions stay open, with a stage and the hall\'s predictions for who is on it', () => {
  const { S, us, ids } = setup({ size: 4, beatboxers: 6, users: 3 });
  host(S, { a: 'phase', to: 'picks' });
  E.setTop(S, us[0], [ids[0], ids[1], ids[2], ids[3]]);
  E.setTop(S, us[1], [ids[1], ids[0], ids[4], ids[5]]);
  const q = Object.values(S.ev.markets).find((m) => m.kind === 'qualify' && m.bb === ids[0]);
  if (q) E.setBet(S, us[0], q.id, 0, 100);
  assert.equal(E.hostAction(S, { a: 'performer', id: ids[0] }).ok, false, 'not before the round starts');
  host(S, { a: 'elim.start' });
  assert.equal(E.hostAction(S, { a: 'elim.start' }).ok, false, 'only once');
  assert.equal(S.ev.phase, 'picks', 'predictions are still open');
  assert.equal(E.hostAction(S, { a: 'performer', id: 'nope' }).ok, false);
  host(S, { a: 'performer', id: ids[0] });
  assert.equal(E.metaOf(S).cats[0].performer, ids[0]); assert.equal(E.metaOf(S).cats[0].elimOn, true);
  let p = perfOf(S);
  assert.equal(p.id, ids[0]); assert.equal(p.voters, 2); assert.equal(p.n, 2); assert.equal(p.firsts, 1); assert.equal(p.rank, 1);
  S.dirty.live = false;
  assert.ok(E.setTop(S, us[2], [ids[0], ids[2], ids[1], ids[5]]).ok, 'people can still lock in');
  assert.ok(S.dirty.live, 'the stats are pushed again');
  p = perfOf(S);
  assert.equal(p.voters, 3); assert.equal(p.firsts, 2); assert.equal(p.avg, 1.3);
  assert.ok(E.setBet(S, us[1], q.id, 1, 50).ok, 'bets are open too');
  host(S, { a: 'performer', id: ids[4] });
  assert.deepEqual(E.metaOf(S).cats[0].performed, [ids[0]], 'the one who went before is marked');
  host(S, { a: 'performer', id: null });
  assert.equal(perfOf(S), null); assert.deepEqual(E.metaOf(S).cats[0].performed, [ids[0], ids[4]]);
  const cons = E.liveOf(S, 0, false).cons.c1;
  assert.equal(cons.voters, 3); assert.equal(cons.rows[0].id, ids[0]); assert.ok(cons.staked >= 150, 'bets on the cut are counted');
  host(S, { a: 'performer', id: ids[2] });
  host(S, { a: 'phase', to: 'elimination' }); // the lock-in at the end
  const judging = E.liveOf(S, 0, false).cons.c1;
  assert.equal(judging.voters, 3, 'while the judges score, the whole picture of the hall is there for the big screen');
  assert.equal(judging.rows.length, 6, 'every beatboxer somebody picked, not only the Top N');
  assert.equal(judging.rows.find((r) => r.id === ids[0]).f, 2, 'and how many put them first');
  assert.equal(E.setTop(S, us[0], [ids[0]]).ok, false, 'now they are locked');
  assert.equal(E.metaOf(S).cats[0].performer, ids[2], 'the stage stays for the judging');
  host(S, { a: 'seeds', order: ids.slice(0, 4) });
  assert.equal(E.metaOf(S).cats[0].performer, null, 'publishing the ranking clears the stage');
});
t('"five minutes to lock in": the predictions close by themselves, and the clock can be cancelled; undo stops the round', () => {
  const { S, ids } = setup({ size: 4, beatboxers: 6, users: 1 });
  assert.equal(E.hostAction(S, { a: 'picks.timer', mins: 5 }).ok, false, 'only while predictions are open');
  host(S, { a: 'phase', to: 'picks' });
  S.now = 1000;
  host(S, { a: 'picks.timer', mins: 5 });
  assert.equal(E.metaOf(S).cats[0].picksEnd, 1000 + 300000);
  S.now = 1000 + 299999; assert.deepEqual(E.closeDueVotes(S), []); assert.equal(S.ev.phase, 'picks');
  host(S, { a: 'picks.timer', mins: 0 }); S.now += 10 * 60000; assert.deepEqual(E.closeDueVotes(S), [], 'cancelled');
  host(S, { a: 'picks.timer', mins: 2 }); S.now += 2 * 60000;
  assert.deepEqual(E.closeDueVotes(S), ['picks:c1']); assert.equal(S.ev.phase, 'elimination'); assert.equal(E.metaOf(S).cats[0].picksEnd, 0);
  host(S, { a: 'phase', to: 'picks' }); assert.equal(S.ev.elimOn, true, 'reopening keeps the round going');
  host(S, { a: 'undo' });
  assert.ok(ids.length);
});

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
