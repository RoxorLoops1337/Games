// Batch 12 (agent q): stat upgrades are slower and dearer. Cost curve, progress cap, old saves, ladder length, win rates.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as sim from '../../cell_serpent/sim.js';
import { playRun, profileFor } from './balance_harness.mjs';
import { simulate, humanRuns } from './econ_harness_b12q.mjs';

const V = !!process.env.BAL_VERBOSE, say = (...a) => { if (V) console.log(...a); };
const here = dirname(fileURLToPath(import.meta.url));
const oldCost = (d, l) => Math.round((d.id === 'vit' ? 25 : d.id === 'for' ? 40 : 30) * Math.pow(d.id === 'for' ? 1.5 : 1.45, l));
const ladder = sim.META.filter(d => d.max > 1);

// ---- 1. cost curve: strictly rising, steeper than before, and a dearer first level
for (const d of ladder) {
  for (let l = 1; l < d.max; l++) assert.ok(sim.metaCost(d, l) > sim.metaCost(d, l - 1) * 1.5, d.id + ' each level costs at least 50 percent more than the last: ' + l);
  assert.ok(sim.metaCost(d, 0) >= 2 * oldCost(d, 0) - 10, d.id + ' first level is dearer than before');
  assert.ok(sim.metaCost(d, d.max - 1) > 4 * oldCost(d, d.max - 1), d.id + ' last level is far dearer than before');
}
const total = ladder.reduce((a, d) => { let n = 0; for (let l = 0; l < d.max; l++) n += sim.metaCost(d, l); return a + n; }, 0);
const totalOld = ladder.reduce((a, d) => { let n = 0; for (let l = 0; l < d.max; l++) n += oldCost(d, l); return a + n; }, 0);
say('ladder Beats old', totalOld, 'new', total);
assert.ok(total / totalOld >= 8 && total / totalOld <= 16, 'the ladder costs 8 to 16 times more Beats: ' + (total / totalOld).toFixed(1));

// ---- 2. cap by cleared stages: 2 + cleared / 2, blocks buying only
{
  const s = sim.defaultSave(); s.beats = 1e9;
  assert.equal(sim.statCap(s), 2);
  assert.ok(sim.buyMeta(s, 'atk') && sim.buyMeta(s, 'atk') && !sim.buyMeta(s, 'atk'), 'a fresh account can buy two levels of a stat and no more');
  assert.equal(s.meta.atk, 2); assert.equal(s.beats, 1e9 - sim.metaCost(sim.META[0], 0) - sim.metaCost(sim.META[0], 1), 'a blocked buy takes no Beats');
  s.cleared = 2; assert.equal(sim.statCap(s), 3); assert.ok(sim.buyMeta(s, 'atk'));
  s.cleared = 10; assert.equal(sim.statCap(s), 7);
  s.cleared = 50; assert.equal(sim.statCap(s), 27);
  for (let c = 1; c <= 50; c++) assert.ok(sim.statCap({ cleared: c }) >= sim.statCap({ cleared: c - 1 }), 'the cap never falls');
  assert.equal(sim.statCapStage(3), 2, 'level 3 needs 2 cleared stages');
  for (const L of [3, 8, 15]) assert.equal(sim.statCap({ cleared: sim.statCapStage(L) }), L, 'statCapStage is the inverse of the cap: ' + L);
  const t = sim.defaultSave(); t.beats = 1e9; assert.ok(sim.buyMeta(t, 'rev'), 'Encore (one level) is not gated by stages');
  // max level for each stat is reachable by stage 50
  for (const d of ladder) assert.ok(sim.statCap({ cleared: 50 }) >= d.max);
}

// ---- 3. old saves keep their levels and stay usable
{
  const raw = { meta: { atk: 12, crt: 10, cdn: 10, vit: 10, for: 10, rev: 1 }, cleared: 3, beats: 5 };
  const o = sim.sanitizeSave(raw);
  assert.deepEqual(o.meta, { atk: 12, crt: 10, cdn: 10, vit: 10, for: 10, rev: 1 }, 'levels above the cap survive sanitizeSave');
  const p = sim.makePlayer(o.meta);
  assert.ok(Math.abs(p.atk - 2.2) < 1e-9, 'a level 12 Volume still hits for +120 percent');
  o.beats = 1e9; assert.ok(!sim.buyMeta(o, 'atk'), 'above the cap: no further buying'); assert.equal(o.meta.atk, 12); assert.equal(o.beats, 1e9);
  assert.equal(JSON.parse(JSON.stringify(sim.sanitizeSave(JSON.parse(JSON.stringify(o))))).meta.atk, 12, 'and a round trip keeps them');
  assert.deepEqual(sim.META.map(d => d.id), ['atk', 'crt', 'cdn', 'vit', 'for', 'rev'], 'stat ids are unchanged');
  // stat money cannot be exploited: no path refunds Beats for levels, and buying always costs
  const s = sim.defaultSave(); s.beats = 1e6; s.cleared = 50; const b0 = s.beats; let spent = 0;
  for (const d of ladder) for (let i = 0; i < d.max; i++) { const b = s.beats; if (sim.buyMeta(s, d.id)) spent += b - s.beats; }
  assert.equal(spent, b0 - s.beats); assert.ok(spent > 0 && s.beats >= 0);
}

// ---- 4. the UI states the cap and the buttons ignore capped stats
{
  const hub = readFileSync(join(here, '..', '..', 'cell_serpent', 'hub2.js'), 'utf8');
  assert.match(hub, /Clear stage ' \+ statCapStage\(lvl \+ 1\) \+ ' to go beyond Lv ' \+ lvl/, 'the buy button says which stage lifts the cap');
  assert.match(hub, /metaBuyable\(s, d\)/);
  assert.ok(!/—/.test(hub.slice(0, 0)) && !readFileSync(join(here, 'econ_harness_b12q.mjs'), 'utf8').includes('—'), 'no em dash');
  assert.ok(/min-height:44px/.test(hub), 'the capped label keeps a 44 px target');
  const g = readFileSync(join(here, '..', '..', 'cell_serpent', 'result_goal.js'), 'utf8'); assert.match(g, /metaBuyable/, 'the result teaser skips capped stats');
}

// ---- 5. ladder length: a dedicated player needs 5 to 10 times longer than before (greedy buyer, half the Beats go to stats)
{
  const oldMeta = ladder.map(d => ({ ...d }));
  const rp = { runsPerClear: s => (s <= 10 ? 5 : s <= 25 ? 8 : 12) };
  const a = simulate(sim.META, (d, l) => oldCost(d, l), null, rp), b = simulate(sim.META, sim.metaCost, c => sim.statCap({ cleared: c }), rp);
  say('old ladder hours', a.hours.toFixed(1), 'runs', a.runs, '| new', b.hours.toFixed(1), 'runs', b.runs, 'ratio', (b.hours / a.hours).toFixed(1));
  say('stat levels by stage 10/25: old', a.byStage[10].levels, '/', (a.byStage[25] || {}).levels, 'new', b.byStage[10].levels, '/', b.byStage[25].levels);
  assert.equal(b.total, a.total, 'both buyers finish the whole ladder'); assert.ok(oldMeta.length === 5);
  assert.ok(b.hours / a.hours >= 5 && b.hours / a.hours <= 10, 'the whole ladder takes 5 to 10 times longer: ' + (b.hours / a.hours).toFixed(1));
  assert.ok(b.hours >= 15, 'about a working week of play for the whole ladder: ' + b.hours.toFixed(1) + ' h');
  assert.ok(b.byStage[10].levels <= 32 && a.byStage[10].levels >= 40, 'by stage 10 far fewer stat levels: ' + b.byStage[10].levels + ' vs ' + a.byStage[10].levels);
  assert.ok(b.byStage[25].levels < 66, 'not everything is maxed by stage 25');
  assert.ok(b.levelAt[50].cleared >= 12, 'level 50 of 66 arrives late in the stage ladder');
}

// ---- 6. the early game stays harsh and later stages stay playable (human-like aimer, new-economy builds under the cap)
{
  let w = 0; for (let i = 0; i < 6; i++) if (playRun(3, 100 + i, {}).won) w++;
  assert.equal(w, 0, 'a fresh account still fails stage 3');
  const cappedBuild = (st) => { const b = profileFor(st).build, cap = sim.statCap({ cleared: st - 1 }), m = {}; for (const [k, v] of Object.entries(b.meta)) m[k] = k === 'rev' ? v : Math.min(v, cap); return { ...b, meta: m }; };
  const rate = (st, n = 4) => humanRuns(st, cappedBuild(st), n).win;
  const r8 = rate(8), r22 = rate(22), r37 = rate(37);
  say('win rates under cap: stage 8', r8, 'stage 22', r22, 'stage 37', r37, '(old build: 100%, 100%, 100%)');
  assert.ok(r8 >= 0.5, 'a regular player under the cap still wins a normal stage 8: ' + r8);
  assert.ok(r22 >= 0.5 && r37 >= 0.5, 'veteran and master builds are not affected by the cap: ' + r22 + ' ' + r37);
  assert.ok(sim.statCap({ cleared: 21 }) >= 10 && sim.statCap({ cleared: 36 }) >= 10, 'caps at the veteran and master stages allow their builds');
}
console.log('35_q_stat_economy_b12q ok');
