// Agent 14 round 2: Standing Ovation card, beat clock.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));

{
  assert.ok(sim.PASSIVES.some(u => u.id === 'enc' && u.minStage === 4), 'Encore card exists with a minStage');
  const mk = enc => { const g = sim.createGame({ seed: 4, stage: 4 }); g.ups.enc = enc; return g; };
  const a = mk(0), b = mk(3);
  for (const g of [a, b]) { g.snakes[0].segs.find(s => s.hp > 0 && !s.isHead).hp = 0; sim.step(g, 1 / 60, { mx: 0 }); }
  assert.ok(a.encore > 0 && b.encore > a.encore, 'upgrade charges the Encore faster');
  a.encore = 1; b.encore = 1; sim.fireEncore(a); sim.fireEncore(b);
  assert.ok(b.beam.w > a.beam.w, 'upgrade widens the beam');
  const offered = stage => { const ids = new Set(); for (let sd = 1; sd < 60; sd++) { const g = sim.createGame({ seed: sd, stage }); g.level = 5; g.pending = 1; sim.step(g, 1 / 60, {}); (g.choices || []).forEach(c => ids.add(c.id)); } return ids; };
  assert.ok(offered(8).has('enc'), 'offered from stage 4 on');
  assert.ok(!offered(3).has('enc'), 'not offered before stage 4');
}
{
  assert.equal(sim.beatBpm(1), 104); assert.equal(sim.beatBpm(6), 107); assert.equal(sim.beatBpm(5), 138);
  const g = sim.createGame({ seed: 1, stage: 1 }); const T = sim.beatPeriod(g);
  g.t = T * 3; assert.ok(sim.onBeat(g)); g.t = T * 3.5; assert.ok(!sim.onBeat(g));
  assert.ok(sim.beatPhase(g) >= 0 && sim.beatPhase(g) < 1);
  const run = () => { const q = sim.createGame({ seed: 9, stage: 2 }); for (let i = 0; i < 600; i++) { sim.step(q, 1 / 60, sim.botInput(q)); q.events.length = 0; } return q.beatShots || 0; };
  const n = run();
  assert.equal(n, run(), 'deterministic');
  assert.ok(n > 0, 'some shots land on the beat');
}
console.log('14_gameplay_r2 ok');
