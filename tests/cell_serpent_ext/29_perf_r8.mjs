// Round 8 perf: one key order for every snake cell, snake and game for the whole run (no new keys mid-run),
// the indexed loops give the same seeded result as before (hash pinned), scratch arrays are reused.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const ALL = { needles: 3, stick: 3, bubble: 3, satellite: 3, maw: 3, swab: 3, daggers: 3, tower: 3, dragon: 3 };
const cellKeys = new Set(), snakeKeys = new Set(), gameKeys = new Set(); let hash = 0;
for (const stage of [1, 5, 12, 20, 25, 30, 35, 40, 45, 50]) {
  const g = sim.createGame({ seed: 7 + stage, stage, bot: true, skills: ALL });
  for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 }; g.revivesLeft = 1e9;
  for (let i = 0; i < 2400; i++) {
    sim.step(g, 1 / 60, sim.botInput(g)); hash = (hash * 31 + g.events.length * 7 + Math.round(g.score) + g.kills) % 1000000007; g.events.length = 0;
    if (g.phase === 'levelup') sim.choose(g, 0);
    if (i % 10 === 0) { gameKeys.add(Object.keys(g).join(',')); for (const sn of g.snakes) { snakeKeys.add(Object.keys(sn).join(',')); for (const s of sn.segs) cellKeys.add(Object.keys(s).join(',')); } }
  }
}
assert.equal(cellKeys.size, 1, 'one key order for every snake cell');
assert.equal(snakeKeys.size, 1, 'one key order for every snake');
assert.equal(gameKeys.size, 1, 'no new game keys mid-run');
assert.deepEqual([...cellKeys][0].split(','), sim.CELL_KEYS);
assert.deepEqual([...snakeKeys][0].split(','), sim.SNAKE_KEYS);
assert.equal(hash, 989117534, '(b12d: ring stage pace RING_EARLY changes stage 12; was 579465015) seeded runs are unchanged by the shape work (pin updated in b11 merge, ring stage 360 aim + earlier b11 changes: Beat Run groove, boss phase 2 twists, Mirror cell at 36+, Bell reach fix)');
console.log('29_perf_r8 ok');
