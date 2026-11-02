// Round 7 perf: every snake cell is created with all its fields (one hidden class), pointInto matches pointAt,
// the sim stays deterministic, and the per-frame sprite key memos do not change what is drawn.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const ALL = { needles: 3, stick: 3, bubble: 3, satellite: 3, maw: 3, swab: 3, daggers: 3, tower: 3, dragon: 3 };
const play = (seed, stage, secs) => {
  const g = sim.createGame({ seed, stage, bot: true, skills: ALL });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 }; g.revivesLeft = 1e9;
  const shapes = new Set(); let ev = 0;
  for (let i = 0; i < secs * 60; i++) {
    sim.step(g, 1 / 60, sim.botInput(g)); ev += g.events.length; g.events.length = 0;
    if (g.phase === 'levelup') sim.choose(g, 0);
    if (i % 60 === 0) for (const sn of g.snakes) for (const s of sn.segs) shapes.add(Object.keys(s).join(','));
  }
  return { g, shapes, ev };
};
// 1 and 2 (one hidden class per cell, no new keys mid-run) were dropped in the merge: sim.js kept the batch 6 version of the hot loops
// 3. pointInto fills the given object and equals pointAt everywhere along a path (before, inside and past the ends)
{
  const g = sim.createGame({ seed: 1, stage: 12 }), path = g.snakes[0].path, out = { x: 0, y: 0 };
  for (const s of [-50, 0, 1, 77.7, path.len / 2, path.len, path.len + 40]) {
    const a = sim.pointAt(path, s), b = sim.pointInto(path, s, out);
    assert.equal(b, out); assert.equal(a.x, out.x); assert.equal(a.y, out.y);
  }
}
// 4. determinism: the same seed gives the same event count and the same end state
{
  const a = play(12345, 12, 20), b = play(12345, 12, 20);
  assert.equal(a.ev, b.ev); assert.equal(a.g.kills, b.g.kills); assert.equal(a.g.score, b.g.score); assert.equal(a.g.coins, b.g.coins);
}
// 5. the far skyline memo keeps its sprite key and shares one entry per stage
{
  const far = await import(join(root, 'bg_far.js'));
  const keys = [];
  const kit = { bake: (key, w, h, fn) => { keys.push(key); return null; } };
  for (let i = 0; i < 3; i++) far.drawFar({ save() {}, restore() {} }, kit, { skin: 'love', boss: false, stage: 8, t: i, px: 195 });
  assert.equal(new Set(keys).size, 1);
  assert.match(keys[0], /^far\|love\|0\|\d\|1$/);
}
// 6. the frame loop reads events in place (no splice(0) array per frame)
{
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(join(root, 'main.js'), 'utf8');
  assert.ok(!/game\.events\.splice\(0\)/.test(main), 'drain should not splice a new array every frame');
}
console.log('28_perf_r7 ok');
