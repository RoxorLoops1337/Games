// Agent 14 round 4: boss phase 2, Drummer cell, Tuning Fork and Golden Ear passives, ring stage variety.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const mk = (stage, seed = 3) => sim.createGame({ seed, stage });
{   // boss phase 2
  const g = mk(5); const sn = g.snakes[0]; g.phase = 'play';
  sim.step(g, 1 / 60, { mx: 0 }); assert.ok(!sn.p2, 'full hp boss is in phase 1');
  for (const s of sn.segs) if (s.i > 0) s.hp = Math.max(1, s.max * 0.3);
  sim.step(g, 1 / 60, { mx: 0 });
  assert.ok(sn.p2, 'below 40% hp starts phase 2'); assert.ok(g.events.some(e => e.t === 'phase2'));
  const n = g.events.filter(e => e.t === 'phase2').length; sim.step(g, 1 / 60, { mx: 0 }); assert.equal(g.events.filter(e => e.t === 'phase2').length, n, 'phase 2 fires once');
  const c = mk(4); c.phase = 'play'; for (const s of c.snakes[0].segs) if (s.i > 0) s.hp = 1; sim.step(c, 1 / 60, { mx: 0 }); assert.ok(!c.snakes[0].p2, 'normal snakes have no phase 2');
}
{   // Drummer cell
  for (const st of [1, 10, 17]) assert.ok(!mk(st).snakes[0].segs.some(s => s.drum), 'no drummer before 18: ' + st);
  const g = mk(18), sn = g.snakes[0]; assert.ok(sn.segs.some(s => s.drum), 'drummer from 18');
  sim.step(g, 1 / 60, { mx: 0 }); assert.ok(sn.drum);
  const d = sn.segs.find(s => s.drum); d.hp = 0; sim.step(g, 1 / 60, { mx: 0 }); assert.ok(!sn.drum, 'popping the drummer stops the rush');
}
{   // passives
  const f = sim.PASSIVES.find(u => u.id === 'fork'), e = sim.PASSIVES.find(u => u.id === 'gear');
  assert.ok(f && f.minStage === 10 && e && e.minStage === 6);
  const hit = lv => { const g = mk(12); g.ups.fork = lv; const c = g.snakes[0].segs[5]; c.hp = c.max = 1e6; c.warded = true; c.x = g.p.x; c.y = g.p.y - 200; g.encore = 1; sim.fireEncore(g); return 1e6 - c.hp; };
  assert.ok(hit(4) > hit(0) * 1.9, 'max Tuning Fork removes the ward cut');
}
{   // ring variety
  const len = n => sim.buildPath(n).len, first = n => sim.buildPath(n).pts[0].x;
  assert.ok(first(6) < 360 && first(12) > 360, 'ring winding alternates');
  assert.ok(new Set([len(6), len(12), len(18)].map(Math.round)).size === 3, 'three spiral shapes');
  assert.ok(Math.abs(len(24) - len(6)) < 1e-6, 'cycle repeats');
}
console.log('14_gameplay_r4 ok');
