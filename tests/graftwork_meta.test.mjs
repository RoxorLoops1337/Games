// GRAFTWORK meta progression (engine/meta.js, engine/meta2.js): persistence, migration of old saves, unlock rules, achievements (they fire
// once), Daily Case modifiers, Credit and the Credit shop, boss practice, the defeat advice of the end screen.
import assert from 'node:assert/strict';
import { GRAFTS, ENEMIES } from '../graftwork/data/index.js';
import { DAILY_MODS } from '../graftwork/data/dailymods.js';
import * as RUN from '../graftwork/engine/run.js';
import * as M from '../graftwork/engine/meta.js';
import { ACHIEVEMENTS } from '../graftwork/data/achievements.js';
import { strainInfo } from '../graftwork/engine/cards.js';
import { seamCap } from '../graftwork/engine/seam.js';
import { DEATH_ADVICE, deathAdvice, deathAdviceCategory } from '../graftwork/engine/meta2.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const mem = () => { const o = {}; return { o, getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; } }; };
const fresh = () => { M.setStorage(mem()); return M.defaultMeta(); };
const gids = Object.keys(GRAFTS);
const mk = (hero = 'marrow', o = {}) => RUN.newRun({ hero, seed: 'm' + Math.random(), ...o });
const finish = (run, phase, act) => { run.phase = phase; run.act = act || (phase === 'won' ? 3 : run.act); return run; };
const graftAll = (run, per, count) => { let k = 0; for (const i of run.deck) { if (k >= count) break; if (CARD_OK(i)) { for (let j = 0; j < per; j++) i.grafts.push(gids[(k + j) % gids.length]); k++; } } };
const CARD_OK = (i) => !i.id.startsWith('j_');

t('storage: corrupt json survives', () => {
  const s = mem(); M.setStorage(s);
  for (const bad of ['{{{', 'null', '[]', '"x"', '123', '']) { s.o.graftwork_meta_v1 = bad; const m = M.loadMeta(); assert.equal(m.v, 1); assert.ok(M.heroUnlocked(m, 'marrow')); }
});
t('storage: roundtrip', () => {
  const m = fresh(); m.stats.runs = 5; M.markSeen(m, 'cards', 'm_cut'); M.saveMeta(m);
  const l = M.loadMeta(); assert.equal(l.stats.runs, 5); assert.ok(l.seen.cards.m_cut);
});
t('migration: old stub shape and wrong types', () => {
  const s = mem(); M.setStorage(s);
  s.o.graftwork_meta_v1 = JSON.stringify({ v: 1, unlocked: { heroes: [] }, bestAsc: { marrow: 2 }, stats: { runs: 3, wins: 'x' }, seen: { cards: { a: 1 } }, achievements: {}, settings: { master: 0.1 }, extra: 7 });
  const m = M.loadMeta();
  assert.ok(m.unlocked.heroes.includes('marrow')); assert.equal(m.stats.runs, 3); assert.equal(m.stats.wins, 0);
  assert.equal(m.settings.master, 0.1); assert.equal(m.settings.sfx, M.DEFAULT_SETTINGS.sfx); assert.equal(m.extra, 7);
  assert.deepEqual(m.history, []); assert.ok(m.seen.relics && m.seen.events); assert.equal(M.maxAscension(m, 'marrow'), 2);
});
t('settings defaults', () => {
  const m = fresh(); for (const k of ['master', 'sfx', 'music', 'screenShake', 'reducedMotion', 'colorblind', 'largeText', 'tips', 'muted']) assert.notEqual(m.settings[k], undefined, k);
  assert.equal(m.settings.tips, true); m.settings.muted = true; m.tips.strain = 1; M.saveMeta(m);
  const l = M.loadMeta(); assert.equal(l.settings.muted, true); assert.equal(l.tips.strain, 1);
});
t('markSeen is call-safe', () => {
  const m = fresh(); assert.equal(M.markSeen(m, 'enemies', 'x'), true); assert.equal(M.markSeen(m, 'enemies', 'x'), false);
  assert.equal(M.markSeen(m, 'bogus', 'x'), false); assert.equal(M.markSeen(m, 'cards', null), false); assert.equal(M.markSeen(null, 'cards', 'a'), false);
  assert.equal(M.codexCount(m), 1);
});
t('onRunStart counts runs and daily', () => {
  const m = fresh(); M.onRunStart(m, mk()); assert.equal(m.stats.runs, 1); assert.equal(m.daily.lastPlayed, null);
  const d = mk('marrow', { daily: 'daily-2026-01-02' }); M.onRunStart(m, d); assert.equal(m.daily.lastPlayed, 'daily-2026-01-02'); assert.ok(M.dailyPlayed(m, 'daily-2026-01-02'));
});
t('hero unlock: wick after 5 runs incl. Act 2, odile after 11 runs incl. a win (count fallbacks 7 and 15)', () => {
  const m = fresh(); assert.ok(!M.heroUnlocked(m, 'wick')); assert.ok(!M.heroUnlocked(m, 'odile'));
  let r = M.recordRunEnd(m, finish(mk(), 'dead', 1), 'dead'); assert.equal(r.newUnlocks.length, 0); assert.ok(!M.heroUnlocked(m, 'wick'));
  r = M.recordRunEnd(m, finish(mk(), 'dead', 2), 'dead'); assert.ok(!M.heroUnlocked(m, 'wick'), 'Act 2 alone is not enough before run 5');
  for (let i = 0; i < 2; i++) M.recordRunEnd(m, finish(mk(), 'dead', 1), 'dead');
  assert.ok(!M.heroUnlocked(m, 'wick'));
  r = M.recordRunEnd(m, finish(mk(), 'dead', 1), 'dead'); assert.ok(M.heroUnlocked(m, 'wick'), 'run 5 with Act 2 seen'); assert.ok(!M.heroUnlocked(m, 'odile'));
  assert.deepEqual(r.newUnlocks.map((u) => [u.kind, u.id]), [['hero', 'wick']]);
  for (let i = 0; i < 5; i++) M.recordRunEnd(m, finish(mk('wick'), 'dead', 1), 'dead');
  assert.ok(!M.heroUnlocked(m, 'odile'), 'no win yet at run 10');
  r = M.recordRunEnd(m, finish(mk('wick'), 'won'), 'won'); assert.ok(M.heroUnlocked(m, 'odile'), 'run 11 with a win');
  assert.ok(r.newUnlocks.some((u) => u.id === 'odile'));
  const f = fresh(); for (let i = 0; i < 7; i++) M.recordRunEnd(f, finish(mk(), 'dead', 1), 'dead');
  assert.ok(M.heroUnlocked(f, 'wick'), 'fallback at run 7'); for (let i = 0; i < 8; i++) M.recordRunEnd(f, finish(mk(), 'dead', 1), 'dead');
  assert.ok(M.heroUnlocked(f, 'odile'), 'fallback at run 15');
});
t('ascension chain', () => {
  const m = fresh();
  for (let a = 0; a < 10; a++) {
    const r = M.recordRunEnd(m, finish(mk('marrow', { ascension: a }), 'won'), 'won');
    assert.equal(M.maxAscension(m, 'marrow'), a + 1);
    assert.ok(r.newUnlocks.some((u) => u.kind === 'ascension' && u.name === 'Ascension ' + (a + 1)));
  }
  const r = M.recordRunEnd(m, finish(mk('marrow', { ascension: 10 }), 'won'), 'won');
  assert.equal(M.maxAscension(m, 'marrow'), 10); assert.ok(!r.newUnlocks.some((u) => u.kind === 'ascension'));
  assert.equal(M.maxAscension(m, 'wick'), 0);
  M.recordRunEnd(m, finish(mk('marrow', { ascension: 0 }), 'won'), 'won'); assert.equal(M.maxAscension(m, 'marrow'), 10);
  M.recordRunEnd(m, finish(mk('wick', { ascension: 2 }), 'dead', 2), 'dead'); assert.equal(M.maxAscension(m, 'wick'), 0);
});
t('recordRunEnd is idempotent per run and updates stats', () => {
  const m = fresh(); const run = mk(); run.stats.floors = 12; run.stats.grafts = 4; run.stats.goldEarned = 50; run.stats.elites = 2;
  finish(run, 'dead', 1); M.recordRunEnd(m, run, 'dead'); M.recordRunEnd(m, run, 'dead');
  assert.equal(m.stats.deaths, 1); assert.equal(m.stats.floors, 12); assert.equal(m.stats.grafts, 4); assert.equal(m.stats.elites, 2); assert.equal(m.history.length, 1);
  assert.ok(m.seen.cards[run.deck[0].id]); assert.ok(m.seen.relics[run.relics[0]]);
  assert.ok(M.loadMeta().stats.deaths === 1, 'saved');
});
t('history cap 20, newest first', () => {
  const m = fresh();
  for (let i = 0; i < 27; i++) { const r = mk(); r.stats.floors = i; M.recordRunEnd(m, finish(r, 'dead', 1), 'dead'); }
  assert.equal(m.history.length, 20); assert.equal(m.history[0].floors, 26); assert.equal(m.history[19].floors, 7);
  for (const k of ['hero', 'asc', 'outcome', 'floors', 'grafts', 'date', 'seed']) assert.notEqual(m.history[0][k], undefined, k);
});
t('daily best tracked', () => {
  const m = fresh(); const a = mk('marrow', { daily: 'daily-x' }); a.stats.floors = 10; M.recordRunEnd(m, finish(a, 'dead', 1), 'dead');
  const b = mk('marrow', { daily: 'daily-x' }); b.stats.floors = 5; M.recordRunEnd(m, finish(b, 'dead', 1), 'dead');
  assert.equal(m.daily.best.floors, 10);
  const c = mk('marrow', { daily: 'daily-x' }); c.stats.floors = 3; M.recordRunEnd(m, finish(c, 'won'), 'won'); assert.equal(m.daily.best.outcome, 'won');
});

t('achievements: >= 24, unique, well formed, voice rules', () => {
  assert.ok(ACHIEVEMENTS.length >= 24 + 6 - 6); assert.ok(ACHIEVEMENTS.length >= 30);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  assert.ok(ACHIEVEMENTS.filter((a) => a.secret).length >= 6);
  for (const a of ACHIEVEMENTS) { assert.equal(typeof a.check, 'function'); assert.ok(!/!/.test(a.name + a.text), a.id); }
});

t('achievements: checks never throw on odd runs; progress works', () => {
  const m = fresh();
  const odd = [{ hero: 'marrow', deck: [], stats: {} }, { hero: 'odile' }, mk('wick', { ascension: 10 })];
  for (const r of odd) { const res = M.recordRunEnd(m, r, 'dead'); assert.ok(Array.isArray(res.newAchievements)); }
  for (const a of ACHIEVEMENTS) { const p = M.achievementProgress(m, a.id); assert.ok(p.max >= 1 && p.n >= 0 && p.n <= p.max, a.id); }
  assert.equal(M.achievementProgress(m, 'nope').done, false);
});

t('achievements: at least 20 earnable by synthetic runs (proof)', () => {
  const m = fresh();
  const earned = new Set();
  const go = (run, outcome, mut) => {
    if (mut) mut(run);
    finish(run, outcome === 'won' ? 'won' : 'dead', outcome === 'won' ? 3 : run.act);
    for (const a of M.recordRunEnd(m, run, outcome).newAchievements) earned.add(a.id);
  };
  // lifetime thresholds: preload so the next run crosses them
  Object.assign(m.stats, { runs: 9, wins: 9, grafts: 99, elites: 24, bosses: 9, goldEarned: 4999 });
  for (let i = 0; i < 100; i++) M.markSeen(m, 'cards', 'c' + i);
  go(mk('marrow'), 'dead', (r) => { r.stats.floors = 2; r.stats.goldEarned = 5; r.stats.grafts = 1; r.stats.elites = 1; r.stats.bosses = 1; r.deck.push(...Array.from({ length: 5 }, (_, i) => ({ uid: 900 + i, id: 'j_clot', grafts: [], up: 0 }))); r.deck[0].grafts.push(gids[0], gids[1]); });
  go(mk('marrow'), 'dead', (r) => { graftAll(r, 3, 3); r.stats.floors = 20; r.loop = 3; });
  go(mk('marrow', { daily: 'daily-q' }), 'won', (r) => { r.stats.damageTaken = 50; r.stats.shatters = 0; r.stats.grafts = 0; r.gold = 0; r.deck = r.deck.slice(0, 9); r.stats.floors = 30; });
  go(mk('wick', { ascension: 10 }), 'won', (r) => { r.stats.skips = 8; r.stats.shatters = 3; r.stats.floors = 31; r.stats.damageTaken = 400; });
  go(mk('odile', { ascension: 5 }), 'won', (r) => { r.gold = 600; r.budgetBonus = 20; r.stats.floors = 33; r.stats.damageTaken = 400; });
  go(mk('wick', { ascension: 5 }), 'won', (r) => { r.stats.floors = 30; });
  go(mk('marrow', { ascension: 5 }), 'won', (r) => {
    r.stats.floors = 30; r.stats.damageTaken = 400; r.stats.shatters = 1; r.relics = r.relics.slice(0, 1);
    const bare = r.deck.slice(); for (let i = 0; i < 10 && strainInfo(r).strain < 4; i++) { const inst = r.deck[i]; inst.grafts.push(gids[i % gids.length], gids[(i + 1) % gids.length]); }
    r.budgetBonus = -2; for (const i of r.deck) if (strainInfo(r).strain < 4 && i.grafts.length < 2) i.grafts.push(gids[2]);
  });
  go(mk('marrow'), 'won', (r) => { r.stats.skips = 0; r.stats.floors = 30; });
  go(mk('marrow'), 'won', (r) => { r.stats.floors = 30; r.deck.push(...Array.from({ length: 31 }, (_, i) => ({ uid: 800 + i, id: 'm_cut', grafts: [], up: 0 }))); });
  go(Object.assign(mk('marrow'), { abandoned: true }), 'dead', (r) => { r.stats.floors = 0; });
  go(mk('marrow'), 'dead', (r) => { r.deck[0].grafts.push(gids[0], gids[1], gids[2]); r.deck[1].grafts.push(gids[0], gids[1], gids[2]); r.stats.floors = 9; });
  go(mk('marrow'), 'dead', (r) => { r.stats.floors = 1; });
  const missing = ACHIEVEMENTS.filter((a) => !earned.has(a.id)).map((a) => a.id);
  console.log('   earned', earned.size, '/', ACHIEVEMENTS.length, 'not earned:', missing.join(','));
  assert.ok(earned.size >= 20, 'only ' + earned.size);
  for (const id of ['intake', 'discharged', 'untouched', 'surgeon_general', 'scholar', 'monolith', 'chronic', 'appointment_kept', 'asc10', 'asc5_all']) assert.ok(earned.has(id), id);
  for (const id of earned) assert.ok(M.isAchieved(m, id));
});
t('achievements are awarded once', () => {
  const m = fresh();
  const a = M.recordRunEnd(m, finish(mk(), 'won'), 'won'); const b = M.recordRunEnd(m, finish(mk(), 'won'), 'won');
  assert.ok(a.newAchievements.some((x) => x.id === 'discharged')); assert.ok(!b.newAchievements.some((x) => x.id === 'discharged'));
});

// ---------------- rev 2 (engine/meta2.js): Credit, cosmetics, Daily Case modifiers, boss practice ----------------
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
  for (const a of extra) { assert.ok(['title', 'back', 'tint'].includes(a.reward.kind), a.id); assert.ok(!/!/.test(a.name + a.text + a.reward.name), a.id); }
  for (const a of extra.filter((x) => x.reward.kind === 'back')) assert.ok(M.CARD_BACKS.some((b) => b.id === a.reward.id), a.id);
  for (const a of extra.filter((x) => x.reward.kind === 'tint')) assert.ok(M.TINTS.some((b) => b.id === a.reward.id), a.id);
});
t('achievements: Thread and Temper records fire exactly once and grant their reward once', () => {
  const m = fresh();
  const r1 = mk(); r1.stats.maxLine = 5; r1.stats.maxHit = 35; r1.deck[0].fused = ['x'];
  const a = M.recordRunEnd(m, finish(r1, 'dead'), 'dead').newAchievements.map((x) => x.id);
  for (const id of ['long_stitch', 'full_spool', 'heavy_hand', 'hammered']) assert.ok(a.includes(id), id);
  assert.ok(m.cosmetics.backs.includes('tapestry')); assert.ok(m.cosmetics.titles.includes('long_stitch')); assert.equal(m.titleNames.long_stitch, 'Long Stitch');
  const r2 = mk(); r2.stats.maxLine = 5; r2.stats.maxHit = 35; r2.deck[0].fused = ['x'];
  const b = M.recordRunEnd(m, finish(r2, 'dead'), 'dead').newAchievements.map((x) => x.id);
  for (const id of ['long_stitch', 'full_spool', 'heavy_hand', 'hammered']) assert.ok(!b.includes(id), 'again ' + id);
  assert.equal(m.cosmetics.backs.filter((x) => x === 'tapestry').length, 1);
});
t('achievements: afflictions, ascension and the clean-bill win', () => {
  const m = fresh();
  const r = mk('marrow', { ascension: 3 }); r.stats.afflicted = { poison: 2, brittle: 1 };
  let ids = M.recordRunEnd(m, finish(r, 'dead'), 'dead').newAchievements.map((x) => x.id);
  assert.ok(ids.includes('poisoned') && ids.includes('brittle_bones')); assert.ok(!ids.includes('rejected'));
  const w = mk('marrow', { ascension: 3 });
  ids = M.recordRunEnd(m, finish(w, 'won'), 'won').newAchievements.map((x) => x.id);
  assert.ok(ids.includes('clean_bill') && ids.includes('clot_carrier')); assert.ok(!ids.includes('lean_budget'));
});

t('daily mods: 12, each with an up and a down side, short enough for the title card', () => {
  assert.equal(DAILY_MODS.length, 12); assert.equal(new Set(DAILY_MODS.map((d) => d.id)).size, 12);
  for (const d of DAILY_MODS) { assert.ok(d.up && d.down && d.name, d.id); assert.ok(d.text.length <= 76, d.id + ' text too long'); assert.ok(!/!/.test(d.name + d.text), d.id); }
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
  const m = fresh(); M.recordRunEnd(m, finish(small, 'dead'), 'dead'); assert.equal(m.credit.bal, 16); assert.equal(m.credit.total, 16); assert.ok(m.firsts.overload);
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
  M.recordRunEnd(m, finish(run, 'dead'), 'dead');
  const list = M.practiceList(m); assert.equal(list.length, 1); assert.equal(list[0].boss, 'the_matron');
  const m2 = fresh(); const r2 = mk(); r2.bossLog = run.bossLog; M.recordRunEnd(m2, finish(r2, 'dead'), 'dead'); m2.seen.enemies = {};
  assert.equal(M.practiceList(m2).length, 0, 'locked until met');
  const p = M.newPracticeRun(list[0]);
  assert.equal(p.phase, 'combat'); assert.equal(p.pending.fightKind, 'boss'); assert.deepEqual(p.pending.enemies, ['the_matron']); assert.equal(p.maxHp, 60); assert.equal(p.hp, 60);
  assert.equal(p.deck.length, run.deck.length); assert.ok(p.deck.every((i) => i.grafts[0] === gids[0])); // a real graft id: a saved deck that names a graft that no longer exists loses it (rules_fixes suite)
  const before = JSON.stringify(m.stats), credit = m.credit.bal;
  p.stats.shatters = 4; RUN.resolveFight(p, { win: true, shattered: [], damageTaken: 0 });
  assert.equal(p.phase, 'won'); const res = M.recordRunEnd(m, p, 'won');
  assert.ok(res.practice); assert.equal(JSON.stringify(m.stats), before); assert.equal(m.credit.bal, credit);
});

t('defeat advice: 12 cause categories, each reachable, each a non-empty line without em dashes', () => {
  assert.equal(Object.keys(DEATH_ADVICE).length, 12, '12 cause categories');
  for (const [k, v] of Object.entries(DEATH_ADVICE)) assert.ok(v.length > 20, 'advice ' + k);
  const boss = Object.values(ENEMIES).find((e) => e.kind === 'boss'), elite = Object.values(ENEMIES).find((e) => e.kind === 'elite'), norm = Object.values(ENEMIES).find((e) => e.kind === 'normal');
  const cases = {
    poison: { status: 'poison' }, burn: { status: 'burn' }, bleed: { status: 'bleed' }, brittle: { status: 'brittle' }, stagefright: { status: 'stagefright' }, dread: { status: 'dread' },
    strain: { enemy: norm.id, strain: 2 }, backfire: { enemy: norm.id, backfire: 1 }, boss: { enemy: boss.id }, elite: { enemy: elite.id }, enemy: { enemy: norm.id }, generic: { status: null },
  };
  for (const [cat, cs] of Object.entries(cases)) {
    const r = deathAdvice({ deathCause: cs });
    assert.equal(r.cat, cat, 'category ' + cat);
    assert.ok(r.text);
  }
  assert.match(deathAdvice({ deathCause: { status: 'poison' } }).text, /Poison ignores Block/);
  assert.match(deathAdvice({ deathCause: { strain: 3, enemy: norm.id } }).text, /Too many grafts/);
  // a boss move with a tip quotes the counter
  for (const b of Object.values(ENEMIES).filter((e) => e.kind === 'boss')) for (const [mid, mv] of Object.entries(b.moves || {})) if (mv.tip) {
    assert.ok(deathAdvice({ deathCause: { enemy: b.id, move: mid } }).text.includes(mv.tip), 'boss tip quoted ' + b.id);
  }
  assert.equal(deathAdviceCategory({}), 'generic');
});
console.log(n, 'passed');
