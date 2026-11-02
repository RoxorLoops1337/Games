// Agent 14 round 5: Quartet cell, Choir cell, Four-Part Harmony passive, boss phase 2 dash lane.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const mk = (stage, seed = 3) => sim.createGame({ seed, stage });
const kill = (g, s) => { s.hp = 0; };
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, { mx: 0 }); };
{   // placement: never early, never on bosses
  for (const st of [1, 4, 10, 18, 21]) assert.ok(!mk(st).snakes[0].segs.some(s => s.quartet || s.choir), 'no quartet or choir before stage 22: ' + st);
  const g = mk(22), q = g.snakes[0].segs.filter(s => s.quartet); assert.equal(q.length, 4, 'four linked cells from 22');
  assert.ok(q.every(s => s.kind === 'normal' && !s.carry && !s.gold && !s.ward), 'plain cells only');
  assert.ok(!mk(30).snakes[0].segs.some(s => s.quartet), 'no quartet on boss stages');
  assert.ok(mk(28).snakes[0].segs.some(s => s.choir) && !mk(27).snakes[0].segs.some(s => s.choir), 'choir from 28');
}
{   // quartet success
  const g = mk(22), sn = g.snakes[0], q = sn.segs.filter(s => s.quartet); const c0 = g.coins;
  for (const s of q) kill(g, s); tick(g);
  assert.ok(g.events.some(e => e.t === 'quartet'), 'popping all four in one frame pays'); assert.ok(g.coins > c0 && sn.slow > 0 && g.quartets === 1);
}
{   // quartet fail: survivors regrow
  const g = mk(22), sn = g.snakes[0], q = sn.segs.filter(s => s.quartet);
  kill(g, q[0]); tick(g); assert.ok(sn.qT > 1.9 && g.events.some(e => e.t === 'quartetstart'));
  q[1].hp = Math.max(1, q[1].max * 0.2);
  tick(g, 150);
  assert.ok(g.events.some(e => e.t === 'quartetfail'), 'the window closes'); assert.equal(q[1].hp, q[1].max, 'survivors regrow to full'); assert.ok(!g.events.some(e => e.t === 'quartet'));
}
{   // finishing inside the window pays
  const g = mk(22), sn = g.snakes[0], q = sn.segs.filter(s => s.quartet);
  kill(g, q[0]); tick(g, 60);
  for (const s of q.slice(1)) kill(g, s); tick(g); assert.ok(g.events.some(e => e.t === 'quartet'), 'finishing inside the window pays');
}
{   // passive
  const p = sim.PASSIVES.find(u => u.id === 'harm'); assert.ok(p && p.minStage === 22);
  const win = lv => { const g = mk(22); g.ups.harm = lv; const sn = g.snakes[0]; kill(g, sn.segs.find(s => s.quartet)); tick(g); return sn.qWin; };
  assert.ok(win(4) > win(0) * 1.4, 'Four-Part Harmony widens the window');
}
{   // choir regrows neighbours that are not being hit
  const g = mk(28), sn = g.snakes[0], i = sn.segs.findIndex(s => s.choir), c = sn.segs[i + 1]; c.max = 1000; c.hp = 500; c.flash = 0;
  tick(g, 60); assert.ok(c.hp > 540, 'choir heals');
  sn.segs[i].hp = 0; tick(g); const h = c.hp; tick(g, 60); assert.ok(c.hp <= h + 1, 'no heal once the choir is popped');
}
{   // boss phase 2 dash lane
  const g = mk(5); const sn = g.snakes[0]; tick(g);
  for (const s of sn.segs) if (s.i > 0) s.hp = Math.max(1, s.max * 0.3);
  tick(g); assert.ok(sn.p2);
  sn.surge = 'idle'; sn.surgeT = 0; tick(g);
  assert.equal(sn.surge, 'warn'); assert.ok(sn.lane && sn.lane.b > sn.lane.a + 30, 'the lane is known before the dash'); assert.ok(sn.surgeT > 0.8, 'longer warning in phase 2');
  tick(g, 60); assert.equal(sn.surge, 'go');
  const c = mk(4); c.snakes[0].surge = 'idle'; c.snakes[0].surgeT = 0; tick(c); assert.ok(!c.snakes[0].lane, 'normal snakes have no lane');
}
console.log('14_gameplay_r5 ok');
