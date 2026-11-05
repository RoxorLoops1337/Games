// b16i: weekly mutator, session goals, forgiving streak (pure logic, no browser).
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const G = await import(join(root, 'goals_b16i.js'));
const sim = await import(join(root, 'sim.js'));
const U = await import(join(root, 'unlock_b12p.js'));

// weekly mutator: same all week (Mon to Sun), changes on Monday, never a net power gain
const mon = 20000 - ((20000 + 3) % 7);   // a Monday
assert.equal(G.weekOf(mon), G.weekOf(mon + 6)); assert.notEqual(G.weekOf(mon), G.weekOf(mon + 7));
assert.equal(G.weeklyMutator(mon).id, G.weeklyMutator(mon + 6).id);
assert.notEqual(G.weeklyMutator(mon).id, G.weeklyMutator(mon + 7).id);
for (const m of G.MUTATORS) {
  const p = { atk: 1, rate: 2, crit: 0.05, coinMul: 1, speed: 300 }; m.fx(p);
  const feet = p.speed !== 300;
  assert.ok(feet ? p.atk <= 1.15 + 1e-9 : p.atk * p.rate <= 2.0001, m.id + ' is a sidegrade at most');
  assert.ok(!/—/.test(m.name + m.text));
}
const gm = sim.createGame({ seed: 5, stage: 3 }); const atk0 = gm.p.atk;
assert.ok(G.applyMutator(gm, mon) && gm.mut16 === G.weeklyMutator(mon).id && gm.p.atk !== atk0);
const gp = sim.createGame({ seed: 5, stage: 3, mode: 'pig' }); assert.equal(G.applyMutator(gp, mon), null);

// save field: default, sanitize, junk
const d = sim.defaultSave(); assert.deepEqual(d.goals16, G.g16Default());
assert.deepEqual(sim.sanitizeSave({}).goals16, G.g16Default());
const junk = sim.sanitizeSave({ goals16: { goals: [{ k: 'nope', t: 1 }, { k: 'kills', t: -5, d: 1 }, 7], streak: { n: 'x', last: 5.9, rest: 'y' }, best: -1 } }).goals16;
assert.equal(junk.goals.length, 1); assert.equal(junk.goals[0].k, 'kills'); assert.equal(junk.goals[0].t, 1); assert.equal(junk.streak.last, 5); assert.equal(junk.streak.rest, -1);
assert.deepEqual(sim.sanitizeSave(JSON.parse(JSON.stringify(sim.defaultSave()))).goals16, G.g16Default());

// session goals: three distinct, stable for the day, a fresh set when all done, small rewards
const s = sim.defaultSave();
const a = G.dealGoals(s, mon, 4).map(x => x.k); assert.equal(new Set(a).size, 3);
assert.deepEqual(G.dealGoals(s, mon, 4).map(x => x.k), a, 'same set until finished');
assert.ok(G.dealGoals(s, mon + 1, 4).every(x => !x.d));
const big = { kills: 999, progress: 1, quartets: 9, groove: 99, chests: 9, picks: 9, bombs: 9, won: true, stage: 4 };
const b0 = s.beats, res = G.checkGoals(s, big, 4);
assert.equal(res.ticked.length, 3); assert.ok(res.set); assert.equal(s.beats - b0, res.beats);
assert.ok(res.beats < 500, 'rewards stay small');
assert.equal(G.checkGoals(s, big, 4).ticked.length, 0, 'a goal pays once');
const set0 = s.goals16.set; G.dealGoals(s, mon + 1, 4); assert.equal(s.goals16.set, set0 + 1, 'finished set is replaced');
assert.equal(G.checkGoals(sim.defaultSave(), { ...big, mode: 'pig' }, 1).ticked.length, 0);
assert.ok(G.goalText(G.makeSet(mon, 0, 3)[0]).length > 3 && !/—/.test(G.makeSet(mon, 0, 3).map(G.goalText).join('')));

// streak: consecutive days count; one rest day per week is forgiven; a second miss in the same week is not
const t = sim.defaultSave();
assert.equal(G.bumpStreak(t, mon).n, 1); assert.equal(G.bumpStreak(t, mon).new, false);
assert.equal(G.bumpStreak(t, mon + 1).n, 2);
const r1 = G.bumpStreak(t, mon + 3); assert.ok(r1.rested && r1.n === 3, 'one missed day is forgiven');
assert.equal(G.streakInfo(t, mon + 3).restReady, false);
const r2 = G.bumpStreak(t, mon + 5); assert.equal(r2.n, 1, 'a second missed day in the same week breaks it');
const u = sim.defaultSave(); G.bumpStreak(u, mon); G.bumpStreak(u, mon + 2);
assert.equal(u.goals16.streak.n, 2); G.bumpStreak(u, mon + 4); assert.equal(u.goals16.streak.n, 1);
const w = sim.defaultSave(); G.bumpStreak(w, mon + 5); const r3 = G.bumpStreak(w, mon + 7); assert.ok(r3.rested && r3.n === 2, 'rest day belongs to the week of the missed day');
const v = sim.defaultSave(); G.bumpStreak(v, mon); assert.equal(G.streakInfo(v, mon + 4).n, 0, 'a long gap shows no streak');
assert.equal(G.streakInfo(v, mon + 2).n, 1); assert.equal(G.streakInfo(v, mon + 1).n, 1);

// html helpers
assert.ok(G.hubStripHTML(t, mon + 3).includes('rest day used'));
assert.ok(G.resultChipHTML(res, { new: true, n: 3, rested: false }).includes('Streak 3'));
assert.equal(G.resultChipHTML({ ticked: [], set: false, beats: 0 }, { new: false, n: 1 }), '');

// progressive unlock: a fresh account is not flooded, legacy saves keep everything
const fresh = sim.defaultSave();
assert.ok(!U.isUnlocked('sessgoals', fresh) && !U.isUnlocked('weekmut', fresh));
fresh.cleared = 14; assert.ok(U.isUnlocked('sessgoals', fresh) && U.isUnlocked('weekmut', fresh));
assert.ok(U.isUnlocked('weekmut', sim.sanitizeSave({ cleared: 1, v: 3 })), 'legacy save keeps everything');
