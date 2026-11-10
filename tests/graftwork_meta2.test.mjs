// GRAFTWORK meta 2: migration of old saves, achievements fire once, Daily Case modifiers, Credit math, boss practice.
import assert from 'node:assert/strict';
import { GRAFTS } from '../graftwork/data/index.js';
import { DAILY_MODS } from '../graftwork/data/dailymods.js';
import * as RUN from '../graftwork/engine/run.js';
import * as M from '../graftwork/engine/meta.js';
import { seamCap } from '../graftwork/engine/seam.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const mem = () => { const o = {}; return { o, getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; } }; };
const fresh = () => { M.setStorage(mem()); return M.defaultMeta(); };
const mk = (hero = 'marrow', o = {}) => RUN.newRun({ hero, seed: 'm2' + Math.random(), ...o });
const done = (run, phase) => { run.phase = phase; if (phase === 'won') run.act = 3; return run; };
const gids = Object.keys(GRAFTS);

t('migration: an old v1 save gains rev 2 fields and a one-time welcome Credit', () => {
  const s = mem(); M.setStorage(s);
  s.o.graftwork_meta_v1 = JSON.stringify({ v: 1, unlocked: { heroes: ['marrow'], relics: [] }, bestAsc: {}, wins: { marrow: 3 }, winAsc: {}, stats: { runs: 8, wins: 3, deaths: 5 }, seen: {}, achievements: { intake: { t: 1 } }, settings: {}, history: [] });
  const m = M.loadMeta();
  assert.equal(m.v, 1); assert.equal(m.rev, 2);
  assert.equal(m.credit.bal, 3 * 8 + 5 * 2); assert.equal(m.credit.total, m.credit.bal);
  assert.deepEqual(m.cosmetics.backs, ['plain']); assert.equal(m.loadout.back, 'plain'); assert.equal(m.loadout.relic, null);
  assert.ok(m.achievements.intake, 'old achievements kept');
  M.saveMeta(m); const again = M.loadMeta();
  assert.equal(again.credit.bal, m.credit.bal, 'welcome Credit is paid once');
});
t('migration: junk in the new fields is repaired', () => {
  const s = mem(); M.setStorage(s);
  s.o.graftwork_meta_v1 = JSON.stringify({ v: 1, rev: 2, credit: { bal: 'x', total: -4 }, cosmetics: { backs: [3, 'bone'], relics: ['r_nope'], titles: 'no' }, loadout: { back: 'ghost', relic: 'r_nope', title: 'zzz' }, practice: { the_matron: 5, nope: { deck: [], enemies: [] } } });
  const m = M.loadMeta();
  assert.equal(m.credit.bal, 0); assert.equal(m.credit.total, 0);
  assert.ok(m.cosmetics.backs.includes('plain') && m.cosmetics.backs.includes('bone')); assert.deepEqual(m.cosmetics.relics, []); assert.deepEqual(m.cosmetics.titles, []);
  assert.equal(m.loadout.back, 'plain'); assert.equal(m.loadout.relic, null); assert.equal(m.loadout.title, null);
  assert.deepEqual(m.practice, {});
});

t('achievements: 24 new, unique, rewarded, voice rules', () => {
  const ids = M.ACHIEVEMENTS.map((a) => a.id); assert.equal(new Set(ids).size, ids.length);
  const extra = M.ACHIEVEMENTS.filter((a) => a.reward); assert.equal(extra.length, 24);
  for (const a of extra) { assert.ok(['title', 'back', 'tint'].includes(a.reward.kind), a.id); assert.ok(!/[—!]/.test(a.name + a.text + a.reward.name), a.id); }
  for (const a of extra.filter((x) => x.reward.kind === 'back')) assert.ok(M.CARD_BACKS.some((b) => b.id === a.reward.id), a.id);
  for (const a of extra.filter((x) => x.reward.kind === 'tint')) assert.ok(M.TINTS.some((b) => b.id === a.reward.id), a.id);
});
t('achievements: Thread and Temper records fire exactly once and grant their reward once', () => {
  const m = fresh();
  const r1 = mk(); r1.stats.maxLine = 5; r1.stats.maxHit = 35; r1.deck[0].fused = ['x'];
  const a = M.recordRunEnd(m, done(r1, 'dead'), 'dead').newAchievements.map((x) => x.id);
  for (const id of ['long_stitch', 'full_spool', 'heavy_hand', 'hammered']) assert.ok(a.includes(id), id);
  assert.ok(m.cosmetics.backs.includes('tapestry')); assert.ok(m.cosmetics.titles.includes('long_stitch')); assert.equal(m.titleNames.long_stitch, 'Long Stitch');
  const r2 = mk(); r2.stats.maxLine = 5; r2.stats.maxHit = 35; r2.deck[0].fused = ['x'];
  const b = M.recordRunEnd(m, done(r2, 'dead'), 'dead').newAchievements.map((x) => x.id);
  for (const id of ['long_stitch', 'full_spool', 'heavy_hand', 'hammered']) assert.ok(!b.includes(id), 'again ' + id);
  assert.equal(m.cosmetics.backs.filter((x) => x === 'tapestry').length, 1);
});
t('achievements: afflictions, ascension and the clean-bill win', () => {
  const m = fresh();
  const r = mk('marrow', { ascension: 3 }); r.stats.afflicted = { poison: 2, brittle: 1 };
  let ids = M.recordRunEnd(m, done(r, 'dead'), 'dead').newAchievements.map((x) => x.id);
  assert.ok(ids.includes('poisoned') && ids.includes('brittle_bones')); assert.ok(!ids.includes('rejected'));
  const w = mk('marrow', { ascension: 3 });
  ids = M.recordRunEnd(m, done(w, 'won'), 'won').newAchievements.map((x) => x.id);
  assert.ok(ids.includes('clean_bill') && ids.includes('clot_carrier')); assert.ok(!ids.includes('lean_budget'));
});

t('daily mods: 12, each with an up and a down side, short enough for the title card', () => {
  assert.equal(DAILY_MODS.length, 12); assert.equal(new Set(DAILY_MODS.map((d) => d.id)).size, 12);
  for (const d of DAILY_MODS) { assert.ok(d.up && d.down && d.name, d.id); assert.ok(d.text.length <= 76, d.id + ' text too long'); assert.ok(!/[—!]/.test(d.name + d.text), d.id); }
  assert.ok(DAILY_MODS.some((d) => d.lineCap === 3));
});
t('daily mods apply deterministically from the seed', () => {
  for (const seed of ['daily-2026-01-01', 'daily-2026-06-15', 'daily-2027-03-09']) {
    const a = mk('marrow', { daily: seed }), b = mk('wick', { daily: seed });
    assert.equal(a.dailyMod.id, b.dailyMod.id); assert.equal(a.dailyMod, DAILY_MODS[RUN.DAILY_MODS.indexOf(a.dailyMod)]);
    const base = mk('marrow'); assert.equal(a.budgetBonus - base.budgetBonus, a.dailyMod.budget || 0);
  }
});
t('daily mods: lineCap caps the Thread and never raises it', () => {
  const c = { run: { relics: [], dailyMod: { lineCap: 3 } } }; assert.equal(seamCap(c), 3);
  assert.equal(seamCap({ run: { relics: [] } }), 5); assert.equal(seamCap({ run: { relics: [], dailyMod: { lineCap: 9 } } }), 5);
});

t('credit math: milestones, first-time double, per-run cap, win bonus, practice pays nothing', () => {
  const small = mk(); small.stats.shatters = 1;
  let f = M.caseFile(small, false, {}); assert.deepEqual(f.items.map((i) => i.id), ['overload', 'shatter']); assert.equal(f.total, (4 + 4) * M.FIRST_BONUS);
  f = M.caseFile(small, false, { overload: 1, shatter: 1 }); assert.equal(f.total, 8);
  const won = mk('marrow', { ascension: 3 }); f = M.caseFile(won, true, {}); assert.equal(f.total, M.WIN_CREDIT + 3 * M.ASC_CREDIT);
  const big = mk(); Object.assign(big.stats, { shatters: 2, maxLine: 5, maxHit: 70, bosses: 3 }); big.deck[0].fused = ['x']; big.deck[1].fused = ['x']; big.deck[2].fused = ['x'];
  big.deck[3].grafts = gids.slice(0, 3);
  f = M.caseFile(big, false, {}); assert.equal(f.total, M.CREDIT_RUN_CAP); assert.ok(f.capped);
  const pr = mk(); pr.practice = 'the_matron'; pr.stats.shatters = 9; assert.equal(M.caseFile(pr, true, {}).total, 0);
  const m = fresh(); M.recordRunEnd(m, done(small, 'dead'), 'dead'); assert.equal(m.credit.bal, 16); assert.equal(m.credit.total, 16); assert.ok(m.firsts.overload);
});
t('credit shop: buy, owned, short, not for sale, equip', () => {
  const m = fresh(); m.credit.bal = 50;
  assert.deepEqual(M.buy(m, 'back', 'ledger'), { ok: true, cost: 25 }); assert.equal(m.credit.bal, 25);
  assert.equal(M.buy(m, 'back', 'ledger').why, 'owned'); assert.equal(M.buy(m, 'back', 'gilt').why, 'short'); assert.equal(M.buy(m, 'back', 'tapestry').why, 'not for sale');
  assert.ok(M.equip(m, 'back', 'ledger')); assert.equal(m.loadout.back, 'ledger'); assert.ok(!M.equip(m, 'back', 'gilt'));
  m.credit.bal = 100; M.buy(m, 'relic', 'r_bandage_roll'); assert.equal(M.startRelicOf(m), null); M.equip(m, 'relic', 'r_bandage_roll'); assert.equal(M.startRelicOf(m), 'r_bandage_roll');
  assert.ok(RUN.newRun({ hero: 'marrow', seed: 's', startRelic: 'r_bandage_roll' }).relics.includes('r_bandage_roll'));
  assert.ok(!RUN.newRun({ hero: 'marrow', seed: 's', daily: 'daily-x', startRelic: 'r_bandage_roll' }).relics.includes('r_bandage_roll'), 'no purchased relic in the daily');
  for (const r of M.START_RELICS) assert.ok(RUN.newRun({ hero: 'marrow', seed: 's', startRelic: r.id }).relics.includes(r.id), r.id);
});

t('practice: needs the boss met, replays the saved deck, and never touches stats', () => {
  const m = fresh(); const run = mk();
  run.bossLog = [{ kind: 'boss', enemies: ['the_matron'], act: 1, win: false, deck: run.deck.map((i) => ({ id: i.id, grafts: [gids[0]], fused: [], up: 0 })), relics: run.relics.slice(), maxHp: 60 }];
  run.seenEnemies = ['the_matron'];
  M.recordRunEnd(m, done(run, 'dead'), 'dead');
  const list = M.practiceList(m); assert.equal(list.length, 1); assert.equal(list[0].boss, 'the_matron');
  const m2 = fresh(); const r2 = mk(); r2.bossLog = run.bossLog; M.recordRunEnd(m2, done(r2, 'dead'), 'dead'); m2.seen.enemies = {};
  assert.equal(M.practiceList(m2).length, 0, 'locked until met');
  const p = M.newPracticeRun(list[0]);
  assert.equal(p.phase, 'combat'); assert.equal(p.pending.fightKind, 'boss'); assert.deepEqual(p.pending.enemies, ['the_matron']); assert.equal(p.maxHp, 60); assert.equal(p.hp, 60);
  assert.equal(p.deck.length, run.deck.length); assert.ok(p.deck.every((i) => i.grafts[0] === gids[0])); // a real graft id: a saved deck that names a graft that no longer exists loses it (rules_fixes suite)
  const before = JSON.stringify(m.stats), credit = m.credit.bal;
  p.stats.shatters = 4; RUN.resolveFight(p, { win: true, shattered: [], damageTaken: 0 });
  assert.equal(p.phase, 'won'); const res = M.recordRunEnd(m, p, 'won');
  assert.ok(res.practice); assert.equal(JSON.stringify(m.stats), before); assert.equal(m.credit.bal, credit);
});

console.log(n, 'passed');
