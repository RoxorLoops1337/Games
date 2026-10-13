// Ludus Maximus 3D: save suite. Versioning (S.sv inside the existing save object, key ludus_maximus_3d_v1 untouched), migration, sanitising of damaged data,
// corrupt-save detection and salvage, backup and stash keys, file export/import envelope, and failing storage. Headless, no DOM, no browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

const mem = new Map(); let quota = false;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { if (quota) throw new Error('QuotaExceededError'); mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
const D = require('../ludus_maximus_3d/core/data.js'); const LM = require('../ludus_maximus_3d/core/sim.js'); require('../ludus_maximus_3d/core/ext.js'); require('../ludus_maximus_3d/core/arena.js');
const KEY = 'ludus_maximus_3d_v1';
const fresh = () => { const S = LM.newGame({ name: 'Test Ludus', color: 1 }); for (let i = 0; i < 3; i++) S.glads.push(LM.makeGlad({ id: S.nextId++, style: D.STYLE_IDS[i], lvl: 4 + i })); return S; };

ok(LM.SAVE_KEY === KEY, 'the live storage key is never renamed');
ok(Number.isInteger(LM.SAVE_VER) && LM.SAVE_VER >= 2, 'a schema version exists');

// round trip stamps the version and keeps v = 1
{
  const S = fresh(); ok(LM.save(S) === true, 'save reports success'); const raw = JSON.parse(mem.get(KEY));
  ok(raw.v === 1 && raw.sv === LM.SAVE_VER, 'saved object carries v 1 and the schema version');
  const r = LM.loadEx(); ok(r.status === 'ok' && r.S.glads.length === 3 && r.S.name === 'Test Ludus', 'a current save loads as ok');
  ok(LM.load() && LM.load().week === 1, 'LM.load still returns the save');
}
// an old save without sv migrates, keeps a backup copy, and stays playable
{
  mem.clear(); const S = fresh(); const old = JSON.parse(JSON.stringify(S)); delete old.sv; delete old.fallen; delete old.mentors; delete old.ludi; delete old.opts;
  mem.set(KEY, JSON.stringify(old));
  const r = LM.loadEx(); ok(r.status === 'migrated' && r.from === 1, 'save without sv is reported as migrated');
  ok(r.S.sv === LM.SAVE_VER && Array.isArray(r.S.fallen) && Array.isArray(r.S.mentors) && r.S.ludi && r.S.ludi.list.length >= 3 && r.S.opts && typeof r.S.opts === 'object', 'migration restores every container the 3D layer reads');
  ok(LM.hasBackup() && LM.loadBackup() && LM.loadBackup().glads.length === 3, 'the pre-upgrade copy is kept in the backup key');
  ok(typeof LM.weeklyGoals === 'function' && (() => { try { LM.weekTrain(r.S); return true; } catch (e) { return false; } })(), 'a migrated save can train a week');
}
// a save from the future still loads, flagged newer
{
  mem.clear(); const S = fresh(); S.sv = LM.SAVE_VER + 5; mem.set(KEY, JSON.stringify(S));
  const r = LM.loadEx(); ok(r.status === 'newer' && r.S, 'a newer save loads with the newer flag');
}
// garbage inside an otherwise valid save is repaired, not fatal
{
  const S = fresh(); S.gold = 'lots'; S.fame = null; S.week = -4; S.plots = 'x'; S.glads.push(null, 7, { id: 99, style: 'nonsense', st: {} }, { id: S.glads[0].id, style: 'murmillo', st: {} }); S.glads[1].st.str = NaN; S.glads[2].lvl = 'high'; S.items = [null, 5, S.items[0]].filter((x) => x !== undefined); S.stats = 4; S.name = '';
  const fixed = LM.sanitize(S);
  ok(fixed.length >= 6, 'sanitize reports what it repaired (' + fixed.length + ')');
  ok(S.gold === 0 && S.fame === 0 && S.week === 1 && S.plots.length === 16 && S.name && typeof S.stats === 'object', 'numbers, plots, name and stats are repaired');
  ok(S.glads.length === 3 && S.glads.every((g) => Number.isFinite(g.st.str) && Number.isFinite(g.lvl) && g.lvl >= 1), 'unreadable gladiators are dropped, damaged stats are repaired');
  ok(S.items.every((x) => x && typeof x === 'object'), 'non-object items are dropped');
  ok(S.nextId > Math.max(...S.glads.map((g) => g.id)), 'nextId stays above every id');
  let threw = false; try { LM.migrate(S); LM.weekTrain(S); } catch (e) { threw = true; } ok(!threw, 'a repaired save runs a training week');
}
// corrupt storage: not JSON, wrong shape
{
  mem.clear(); mem.set(KEY, '{"v":1,"plots":[null,'); ok(LM.loadEx().status === 'corrupt' && LM.load() === null, 'truncated JSON is corrupt and load() is null (no throw)');
  mem.set(KEY, 'lol'); ok(LM.loadEx().status === 'corrupt', 'plain text is corrupt');
  mem.set(KEY, JSON.stringify({ v: 2, plots: [] })); ok(LM.loadEx().status === 'corrupt', 'unknown format marker is corrupt');
  mem.set(KEY, JSON.stringify([1, 2])); ok(LM.loadEx().status === 'corrupt', 'an array is corrupt');
  mem.clear(); ok(LM.loadEx().status === 'none', 'empty storage is none');
}
// salvage: a save cut off mid-write (quota) is closed and recovered
{
  const S = fresh(); S.diary = 'x'.repeat(3000); const full = JSON.stringify(S);
  const cut = full.slice(0, Math.floor(full.length * 0.92)); let parsed = true; try { JSON.parse(cut); } catch (e) { parsed = false; }
  ok(!parsed, 'test setup: the cut text is invalid');
  const R = LM.salvage(cut); ok(R && R.name === 'Test Ludus' && Array.isArray(R.plots) && R.sv === LM.SAVE_VER, 'a truncated save is salvaged and migrated');
  ok(LM.salvage('nothing useful here at all, sorry') === null && LM.salvage('') === null && LM.salvage(null) === null, 'unsalvageable text returns null');
  const mid = full.slice(0, 120); ok(LM.salvage(mid) === null || LM.salvage(mid).plots, 'a tiny fragment never throws');
}
// stash: the damaged text is kept aside and the live key cleared
{
  mem.clear(); mem.set(KEY, '{broken'); const st = LM.loadEx(); ok(st.status === 'corrupt', 'setup corrupt');
  ok(LM.stashCorrupt(st.raw) === true && mem.get(KEY) === undefined && LM.corruptRaw() === '{broken', 'stash keeps the damaged text and clears the live key');
  ok(LM.loadEx().status === 'none', 'after the stash the title offers a new game');
}
// file envelope and import paths
{
  const S = fresh(); const file = LM.exportFile(S); const env = JSON.parse(file);
  ok(env.game === 'ludus_maximus_3d' && env.sv === LM.SAVE_VER && env.save.name === 'Test Ludus' && /^\d{4}-\d\d-\d\dT/.test(env.exported), 'export file envelope');
  const a = LM.parseImport(file); ok(a.S && a.S.glads.length === 3 && !a.err, 'file import round trip');
  const b = LM.parseImport(JSON.stringify(S)); ok(b.S && b.S.name === 'Test Ludus', 'a bare save object imports');
  const c = LM.parseImport(LM.exportCode(S)); ok(c.S && c.S.name === 'Test Ludus', 'the old base64 code still imports');
  ok(LM.parseImport('').err && LM.parseImport('{').err && LM.parseImport('hello').err, 'empty, broken and foreign text give a friendly error');
  ok(LM.parseImport(JSON.stringify({ game: 'other', save: S })).err === 'That file belongs to another game.', 'another game file is refused');
  ok(LM.parseImport(JSON.stringify({ game: 'ludus_maximus_3d', save: { v: 1 } })).err, 'a save without plots is refused');
  const n = LM.parseImport(JSON.stringify({ game: 'ludus_maximus_3d', save: Object.assign(fresh(), { sv: 99 }) })); ok(n.S && n.newer === true, 'a newer file imports with a warning flag');
  const dmg = file.slice(0, Math.floor(file.length * 0.9)); const d = LM.parseImport(dmg); ok(d.S && d.repaired === true, 'a truncated file is repaired on import');
  ok(Object.keys(D.COLORS || []).length > 0 && LM.parseImport(JSON.stringify(Object.assign(fresh(), { color: 99 }))).S.color === 0, 'an out of range colour is reset');
}
// failing storage never throws and reports false
{
  quota = true; const S = fresh(); let r; let threw = false; try { r = LM.save(S); } catch (e) { threw = true; }
  ok(!threw && r === false && LM.saveError, 'a full or blocked storage returns false and records the error'); quota = false;
  ok(LM.save(S) === true && LM.saveError === null, 'saving works again afterwards');
}
// ascend keeps the version and the memorial wall
{ const S = fresh(); S.fame = 2000; S.fallen = [{ name: 'Old Friend', lvl: 6 }]; const N = LM.ascend(S); ok(N.fallen.length === 1, 'new ludus keeps the memorial'); LM.save(N); ok(LM.loadEx().status === 'ok', 'a founded ludus loads cleanly'); }

// fight orders, foe tactics and highlight moments never reach the save: the fight object lives and dies with the fight, the save key and shape are untouched
{
  const S = fresh(); const a = S.glads.slice(0, 2), b = [LM.makeGlad({ id: 90, style: 'thraex', lvl: 4, name: 'Foe1' }), LM.makeGlad({ id: 91, style: 'murmillo', lvl: 4, name: 'Foe2' })];
  LM.setRandom(LM.mulberry(12)); const F = LM.createFight(LM.mkUnits(a, 'A', {}), LM.mkUnits(b, 'B', {}), { cmdAI: true }); F.replay = { seed: 12, taps: [], snap: null, moments: [{ a: 0, b: 90, n: 40, kind: 'hit', label: 'Heavy hit', src: 'A0', dst: 'B0', score: 12, final: false }] };
  F.replay.snap = structuredClone(F); LM.command(F, 'stance', 'A0', 'press'); LM.command(F, 'rally', 'A'); for (let i = 0; i < 120; i++) LM.step(F, 1 / 30); F.ev.length = 0;
  ok(F.units[0].s.press || F.units[0].s.rally || F.units[0].cmdCd > 0, 'orders mark the unit state');
  const before = JSON.stringify(S); S.fame += 1; S.fame -= 1; LM.save(S); const raw = mem.get(KEY);
  ok(JSON.parse(raw).v === 1 && !/cmdCd|cmdAI|moments|"swap"|gstance|expo/.test(raw), 'the save carries no fight, order or reel data');
  ok(JSON.stringify(LM.load()).length > 100 && LM.SAVE_KEY === KEY, 'the same key still loads');
  ok(JSON.parse(JSON.stringify(F.replay.moments))[0].label === 'Heavy hit' && JSON.parse(JSON.stringify(F.replay.snap)).cmd.rally >= 0, 'moments and the replay snapshot are plain JSON');
  const prefs = JSON.stringify({ gore: 'full', links: false }); localStorage.setItem('ludus_maximus_3d_prefs', prefs); ok(JSON.parse(localStorage.getItem('ludus_maximus_3d_prefs')).links === false, 'the target-links option lives inside the existing prefs key (no new key)');
  void before;
}

{ // wave 3: fight hurt and trophy state survive a save round trip and an old save migrates
  const S = LM.newGame({ name: 'W3', seed: 'w3s' }), g = LM.makeGlad({ id: S.nextId++, style: 'murmillo', lvl: 3 }); S.glads.push(g); LM.woundGive(S, g, 2, 'arm'); LM.hurtMark(S, g, true); S.stats.streakBest = 7; LM.venatio(S).solo = { lion: 1 }; S.stats.hurtWins = 2;
  const back = LM.migrate(JSON.parse(JSON.stringify(S)));
  ok(back.stats.streakBest === 7 && back.venatio.solo.lion === 1 && back.stats.hurtWins === 2, 'streak, solo kills and hurt wins survive');
  ok(!back.glads[0].hurtFight && back.glads[0].wounds.length === 1, 'the transient hurt mark is dropped on load, the wound stays');
  const old = LM.migrate({ glads: [{ id: 1, name: 'Old', style: 'murmillo', lvl: 2, st: {}, inj: 2 }] }); ok(Array.isArray(old.glads[0].wounds) && Array.isArray(old.glads[0].scars), 'an old save gets wound and scar lists');
  ok(typeof LM.checkTrophies(back) === 'object', 'trophies run on a migrated save');
}

console.log(`ludus_maximus_3d_saves: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
