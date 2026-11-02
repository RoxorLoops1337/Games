// Agent 14: gameplay extras: Encore blast, gold cell, close call.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { LINE_Y } = sim;
const evs = (g, t) => g.events.filter(e => e.t === t);

// gold cell: from stage 4, one plain cell per snake
assert.equal(sim.createGame({ seed: 3, stage: 1 }).snakes[0].segs.some(s => s.gold), false);
assert.equal(sim.createGame({ seed: 3, stage: 3 }).snakes[0].segs.some(s => s.gold), false);
for (const st of [4, 9, 20, 35]) {
  const g = sim.createGame({ seed: 5, stage: st });
  for (const sn of g.snakes) {
    const gold = sn.segs.filter(s => s.gold);
    assert.equal(gold.length, 1, 'one gold cell per snake, stage ' + st);
    assert.equal(gold[0].kind, 'normal'); assert.ok(!gold[0].carry && !gold[0].isHead);
  }
}
assert.equal(sim.createGame({ seed: 5, stage: 9, mode: 'pig' }).snakes[0].segs.some(s => s.gold), false, 'no gold in event modes');
{
  const f = g => JSON.stringify(g.snakes[0].segs.map(s => [s.hp, s.kind, !!s.gold]));
  assert.equal(f(sim.createGame({ seed: 11, stage: 8 })), f(sim.createGame({ seed: 11, stage: 8 })));
}

// a gold cell popped in time pays a burst of Beats, a faded one does not
const popGold = late => {
  const g = sim.createGame({ seed: 5, stage: 6 });
  const s = g.snakes[0].segs.find(q => q.gold);
  if (late) s.goldT = 0;
  s.hp = 0;
  sim.step(g, 1 / 60, { mx: 0 });
  return g;
};
const early = popGold(false), late = popGold(true);
assert.equal(early.goldPopped, 1); assert.equal(evs(early, 'goldpop').length, 1);
assert.equal(late.goldPopped, 0);
assert.ok(early.coins > late.coins + 5, 'gold pays a burst of Beats');

// the gold timer runs while the cell is on screen and then fades
{
  const g = sim.createGame({ seed: 5, stage: 6 });
  const s = g.snakes[0].segs.find(q => q.gold);
  g.phase = 'play';
  let faded = false;
  for (let i = 0; i < 60 * 60 && g.phase === 'play' && s.hp > 0; i++) { sim.step(g, 1 / 60, { mx: 0 }); if (evs(g, 'goldfade').length) faded = true; g.events.length = 0; }
  assert.ok(faded || g.phase !== 'play', 'timer runs out');
}

// encore meter
{
  const g = sim.createGame({ seed: 2, stage: 1 });
  assert.equal(g.encore, 0);
  assert.equal(sim.fireEncore(g), false);
  sim.step(g, 1 / 60, { mx: 0, encore: true });
  assert.equal(g.encoreUsed, 0, 'ignored when not charged');
  for (let i = 0; i < 60 * 10; i++) sim.step(g, 1 / 60, sim.botInput(g));
  assert.ok(g.encore > 0, 'hits charge it');
  assert.ok(g.encoreUsed === 0 && g.encore < 1, 'not charged within ten seconds: it takes real work');
}
// firing damages the column only
{
  const g = sim.createGame({ seed: 2, stage: 4 });
  const sn = g.snakes[0], mid = sn.segs[5], far = sn.segs[8];
  g.p.x = 360; mid.x = 360; mid.y = 600; far.x = 600; far.y = 600;
  mid.hp = mid.max = 5e5; far.hp = far.max = 5e5;
  g.encore = 1;
  assert.equal(sim.fireEncore(g), true);
  assert.ok(g.events.some(e => e.t === 'encore'));
  assert.equal(g.encore, 0); assert.equal(g.encoreUsed, 1); assert.ok(g.beam && g.beam.t > 0);
  assert.ok(mid.hp < 5e5, 'column cell hit'); assert.equal(far.hp, 5e5, 'side cell untouched');
  assert.equal(sim.fireEncore(g), false);
  assert.ok(g.dmgBy.encore > 0);
  for (let i = 0; i < 40; i++) sim.step(g, 1 / 60, { mx: 0 });
  assert.equal(g.beam, null, 'beam fades');
  g.encore = 1; g.phase = 'play'; sim.step(g, 1 / 60, { mx: 0, encore: true });
  assert.equal(g.encoreUsed, 2, 'tap input fires it');
}
// the shielded face and boss wave cells are spared
{
  const g = sim.createGame({ seed: 2, stage: 5 });
  const h = g.snakes[0].segs[0]; h.x = g.p.x; h.y = 500;
  const w = g.snakes[0].segs[3]; w.wave = true; w.x = g.p.x; w.y = 400; const wh = w.hp;
  g.encore = 1; sim.fireEncore(g);
  assert.equal(h.hp, 1); assert.equal(w.hp, wh);
}
// the ready event fires once
{
  const g = sim.createGame({ seed: 4, stage: 1 });
  g.encore = 0.995;
  for (let i = 0; i < 60 * 30 && !g.encoreReady; i++) sim.step(g, 1 / 60, { mx: 0 });
  if (g.encoreReady) assert.equal(evs(g, 'encoreready').length, 1);
}
// close call
{
  const g = sim.createGame({ seed: 6, stage: 3 });
  const sn = g.snakes[0], s = sn.segs[6];
  let target = 0; for (let t = 0; t < g.path.len; t += 2) if (sim.pointAt(g.path, t).y >= LINE_Y - 80) { target = t; break; }
  const shift = target - s.ps; sn.tail += shift; for (const q of sn.segs) q.ps += shift;
  s.hp = 0;
  const before = g.encore;
  sim.step(g, 1 / 60, { mx: 0 });
  assert.equal(g.clutches, 1); assert.ok(g.encore - before >= sim.ENCORE_CLUTCH);
  const g2 = sim.createGame({ seed: 6, stage: 3 });
  const s2 = g2.snakes[0].segs[6]; s2.hp = 0;
  sim.step(g2, 1 / 60, { mx: 0 });
  assert.equal(g2.clutches, 0);
}
// the bot never crashes, is deterministic, and keeps the meter in range on all stage kinds
for (const st of [1, 4, 6, 8, 10, 14]) {
  const mk = () => { const g = sim.createGame({ seed: 9, stage: st, bot: true }); for (let i = 0; i < 60 * 40 && g.phase !== 'dead' && g.phase !== 'won'; i++) { sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); } return g; };
  const x = mk(), y = mk();
  assert.equal(x.kills, y.kills); assert.equal(x.encore, y.encore); assert.equal(x.coins, y.coins);
  assert.ok(Number.isFinite(x.encore) && x.encore >= 0 && x.encore <= 1);
}
console.log('14_gameplay ok');
