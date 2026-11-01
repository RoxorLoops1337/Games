// GRAFTWORK meta progression: persistence, migration, unlock rules, achievements.
import assert from 'node:assert/strict';
import { GRAFTS, HEROES } from '../graftwork/data/index.js';
import * as RUN from '../graftwork/engine/run.js';
import * as M from '../graftwork/engine/meta.js';
import { ACHIEVEMENTS } from '../graftwork/data/achievements.js';
import { strainInfo } from '../graftwork/engine/cards.js';

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
  const l = M.loadMeta(); assert.equal(l.stats.runs, 5); assert.ok(M.isSeen(l, 'cards', 'm_cut'));
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
  assert.equal(M.setting(m, 'tips'), true); M.setSetting(m, 'muted', true); assert.equal(M.loadMeta().settings.muted, true);
  M.markTip(m, 'strain'); assert.ok(M.tipSeen(M.loadMeta(), 'strain'));
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
t('hero unlock: wick on Act 2, odile on win', () => {
  const m = fresh(); assert.ok(!M.heroUnlocked(m, 'wick')); assert.ok(!M.heroUnlocked(m, 'odile'));
  let r = M.recordRunEnd(m, finish(mk(), 'dead', 1), 'dead'); assert.equal(r.newUnlocks.length, 0); assert.ok(!M.heroUnlocked(m, 'wick'));
  r = M.recordRunEnd(m, finish(mk(), 'dead', 2), 'dead'); assert.ok(M.heroUnlocked(m, 'wick')); assert.ok(!M.heroUnlocked(m, 'odile'));
  assert.deepEqual(r.newUnlocks.map((u) => [u.kind, u.id]), [['hero', 'wick']]);
  r = M.recordRunEnd(m, finish(mk('wick'), 'won'), 'won'); assert.ok(M.heroUnlocked(m, 'odile'));
  assert.ok(r.newUnlocks.some((u) => u.id === 'odile'));
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
  assert.ok(M.isSeen(m, 'cards', run.deck[0].id)); assert.ok(M.isSeen(m, 'relics', run.relics[0]));
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
  for (const a of ACHIEVEMENTS) { assert.equal(typeof a.check, 'function'); assert.ok(!/[—!]/.test(a.name + a.text), a.id); }
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
console.log(n, 'passed');
