// Agent 14 round 3: ward cell, lullaby cell, echo boss wave, Downbeat card.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const mk = (stage, seed = 3) => sim.createGame({ seed, stage });
{
  for (const st of [1, 5, 9]) { const g = mk(st); assert.ok(!g.snakes[0].segs.some(s => s.ward || s.lull), 'no ward or lullaby before stage 10 / 12: ' + st); }
  const g10 = mk(10), g12 = mk(12);
  assert.ok(g10.snakes[0].segs.some(s => s.ward), 'ward from 10');
  assert.ok(!g10.snakes[0].segs.some(s => s.lull), 'no lullaby at 10');
  assert.ok(g12.snakes[0].segs.some(s => s.lull), 'lullaby from 12');
  assert.equal(mk(12, 3).snakes[0].segs.map(s => (s.ward ? 'w' : s.lull ? 'l' : '.') + s.hp).join(), g12.snakes[0].segs.map(s => (s.ward ? 'w' : s.lull ? 'l' : '.') + s.hp).join(), 'deterministic');
}
{
  const g = mk(12); const segs = g.snakes[0].segs, wi = segs.findIndex(s => s.ward);
  sim.step(g, 1 / 60, { mx: 0 });
  assert.ok(segs[wi + 1].warded && segs[wi - 1].warded && !segs[wi].warded, 'neighbours are warded');
  const a = segs[wi + 1], b = segs[wi + 6];
  assert.ok(!b.warded, 'far cell not warded');
  for (const [c, y] of [[a, g.p.y - 300], [b, g.p.y - 500]]) { c.x = g.p.x; c.y = y; c.hp = c.max = 100000; }
  g.encore = 1; assert.ok(sim.fireEncore(g));
  const la = 100000 - a.hp, lb = 100000 - b.hp;
  assert.ok(lb > 0 && Math.abs(la / lb - sim.WARD_CUT) < 0.01, 'warded cell takes half damage: ' + la + ' vs ' + lb);
}
{
  const g = mk(12); const sn = g.snakes[0], c = sn.segs.find(s => s.lull);
  assert.equal(sn.slow, 0); c.hp = 0; sim.step(g, 1 / 60, { mx: 0 });
  assert.ok(g.snakes[0].slow > 1.5, 'popping the lullaby cell slows the snake');
  assert.ok(g.events.some(e => e.t === 'lull'), 'lull event');
}
{
  const g = mk(20), g2 = mk(15);
  let two = 0, one = 0;
  for (let k = 0; k < 400; k++) { g.t = k * 0.05; g2.t = k * 0.05; sim.step(g, 0, { mx: 0 }); sim.step(g2, 0, { mx: 0 }); two += g.snakes[0].segs.filter(s => s.wave).length; one += g2.snakes[0].segs.filter(s => s.wave).length; }
  assert.ok(two > one * 1.4, 'stage 20 boss has the second wave: ' + two + ' vs ' + one);
}
{
  assert.ok(sim.PASSIVES.some(u => u.id === 'dbeat' && u.minStage === 5));
  const shot = lv => { const g = mk(6, 2); g.ups.dbeat = lv; g.t = sim.beatPeriod(g) * 4; g.vq.push({ t: 0 }); g.p.cd = 5; sim.step(g, 0.0001, { mx: 0 }); return g.bullets.find(b => b.beat); };
  const a = shot(0), b = shot(2);
  assert.ok(a && b && b.dmg > a.dmg * 1.2, 'on-beat note hits harder with Downbeat');
}
console.log('14_gameplay_r3 ok');
