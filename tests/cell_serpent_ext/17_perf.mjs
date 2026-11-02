// Perf and stability: determinism hash of a fixed-seed run, plus a stage-50 stress run that must stay far below real time.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const ALL = { needles: 3, stick: 3, bubble: 3, satellite: 3, maw: 3, swab: 3, daggers: 3, tower: 3, dragon: 3 };
const runSim = (opts, secs) => {
  const g = sim.createGame(opts);
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
  g.p.atk *= 1; if (opts.revive) g.revivesLeft = 1e9;
  for (let i = 0; i < secs * 60; i++) { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); }
  return g;
};
const hash = g => createHash('sha1').update(JSON.stringify([g.kills, g.coins, g.score, g.shots, g.level, g.phase, g.t.toFixed(4),
  g.snakes.map(s => s.segs.map(q => [q.x.toFixed(3), q.y === undefined ? 0 : q.y.toFixed(3), q.hp.toFixed(3)])), g.bullets.length, g.pickups.length])).digest('hex');
const g1 = runSim({ seed: 12345, stage: 12, bot: true, skills: ALL }, 20);
const h1 = hash(g1), h2 = hash(runSim({ seed: 12345, stage: 12, bot: true, skills: ALL }, 20));
assert.equal(h1, h2, 'deterministic');
if (process.env.PERF_PRINT) console.log('HASH', h1, 'kills', g1.kills);
// stress: stage 50, all skills, 60 s of sim time
const t0 = performance.now();
const gs = runSim({ seed: 99, stage: 50, bot: true, skills: ALL }, 60);
const ms = performance.now() - t0;
if (process.env.PERF_PRINT) console.log('STRESS ms', ms.toFixed(0), 'bullets', gs.bullets.length, 'phase', gs.phase, 'cells', gs.snakes.reduce((a, s) => a + s.segs.length, 0));
assert.ok(ms < 20000, 'stage 50 stress 60s sim took ' + ms.toFixed(0) + 'ms');
