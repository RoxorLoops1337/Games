// Round 11 hub touches (agent 10): recent runs log and chart, bundle and pack presentation, sticker prize flight wiring.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const h = await import(join(root, 'hub_b11.js'));
const ND = String.fromCharCode(0x2014);

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

// ---- run log
const st = mem();
assert.deepEqual(h.readRuns(st), [], 'empty log');
assert.equal(h.logRun(null, st), null); assert.equal(h.logRun({ stage: 0 }, st), null);
for (let i = 1; i <= 15; i++) h.logRun({ stage: i, won: i % 3 === 0, kills: i * 10 }, st, i * 1000);
const runs = h.readRuns(st);
assert.equal(runs.length, h.RUNLOG_MAX, 'only the last runs are kept');
assert.equal(runs[0].s, 4); assert.equal(runs[runs.length - 1].s, 15); assert.equal(runs[runs.length - 1].w, 1);
const bad = mem(); bad.setItem(h.RUNLOG_KEY, '{nope'); assert.deepEqual(h.readRuns(bad), [], 'a damaged log reads as empty');
bad.setItem(h.RUNLOG_KEY, JSON.stringify([{ s: 'x' }, null, { s: 5, w: 1, k: -3 }])); assert.deepEqual(h.readRuns(bad), [{ s: 5, w: 1, k: 0, t: 0 }]);
assert.equal(h.RUNLOG_KEY, 'cell_serpent_runlog_b11');

// ---- stats and chart
const rs = h.runStats([{ s: 3, w: 0 }, { s: 4, w: 1 }, { s: 5, w: 1 }]);
assert.deepEqual(rs, { n: 3, wins: 2, top: 5, streak: 2, pct: 67 });
assert.equal(h.runStats([]).pct, 0);
assert.equal(h.barPct(10, 10), 100); assert.equal(h.barPct(1, 50), 14, 'a shallow run is still a visible stub');
assert.equal(h.runLogHTML([]), '');
const html = h.runLogHTML(runs);
assert.equal((html.match(/class="rb/g) || []).length, h.RUNLOG_MAX); assert.ok(html.includes('rb win'), 'wins are tinted'); assert.ok(html.includes('rb win last'), 'the latest bar is marked');
assert.ok(!html.includes(ND));

// ---- bundles and packs
assert.equal(h.bundleSaving(sim.BOXES), 30, 'Grand Spark Box saves 30 against ten Spark Boxes');
assert.equal(h.bundleSaving([]), 0);
const pv = h.packValue(sim.GOLD_PACKS);
assert.equal(pv.best, 'box', 'the biggest pack is the best value'); assert.equal(pv.rows.length, 2, 'the free pack has no price per Sparkle');
assert.equal(h.packValue([{ id: 'a', beats: 100, price: 10 }, { id: 'b', beats: 200, price: 20 }]).best, '', 'a tie names no winner');
for (const id of sim.GOLD_PACKS.map(p => p.id)) assert.ok(h.PACK_SNACK[id] && !h.PACK_SNACK[id].includes(ND), 'snack line for pack ' + id);

// ---- wiring (source level)
const hub = readFileSync(join(root, 'hub2.js'), 'utf8'), stk = readFileSync(join(root, 'sticker_b9.js'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8'), idx = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(/onPrize\(STICKER_PRIZE, pz\)/.test(stk), 'the prize callback gets the button to fly from');
assert.ok(/sparkleFlight\(from/.test(hub) && /decorateBundles\(list, BOXES, GOLD_PACKS\)/.test(hub) && /runLogHTML\(readRuns\(\)\)/.test(hub) && /treatPips/.test(hub));
assert.ok(/logRun\(r\)/.test(main), 'every finished run is logged');
assert.ok(idx.includes('@css:10-hub round 11') && idx.includes('end @css:10-hub round 11'));
assert.ok(/\.kbig\[data-k=milk\]/.test(idx), 'the carton glyph is thinned at detail size');
for (const f of [hub, stk, readFileSync(join(root, 'hub_b11.js'), 'utf8')]) assert.ok(!f.includes(ND), 'no em dash');
