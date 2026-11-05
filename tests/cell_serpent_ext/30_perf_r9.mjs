// Round 9 perf: the dagger / stick / tower updates are plain indexed loops (no closure per call, no for...of),
// and a seeded run with only those three weapons stays byte-identical to the pre-change simulation.
// (pin updated in b10 for the Snack cell and late traits at stage 44; earlier: after merging the b9 gameplay cells: the indexed loops themselves are hash neutral, checked on both branches)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const src = readFileSync(join(root, 'sim.js'), 'utf8');
const a = src.indexOf('function updateWeapons'), b = src.indexOf('export function daggerPos');
const body = src.slice(a, b);
assert.ok(a > 0 && b > a, 'found updateWeapons');
assert.ok(!/for \(const \w+ of /.test(body), 'no for...of in updateWeapons');
const orbit = body.slice(body.indexOf('// spinning daggers'), body.indexOf('// swab zones tick'));
assert.ok(!/eachTarget\(/.test(orbit), 'daggers, stick and tower do not allocate a closure per call');
const ORB = { stick: 4, daggers: 4, tower: 5 };
let hash = 0, kills = 0;
for (const stage of [3, 12, 30, 44]) {
  const g = sim.createGame({ seed: 100 + stage, stage, bot: true, skills: ORB });
  for (const id of Object.keys(ORB)) g.weap[id] = { lv: ORB[id], cd: 0 };
  g.revivesLeft = 1e9;
  for (let i = 0; i < 3000; i++) {
    sim.step(g, 1 / 60, sim.botInput(g));
    hash = (hash * 31 + g.events.length * 7 + Math.round(g.score) + g.kills) % 1000000007; g.events.length = 0;
    if (g.phase === 'levelup') sim.choose(g, 0);
  }
  kills += g.kills;
}
assert.ok(kills > 5, 'the orbit weapons actually killed things: ' + kills);
assert.equal(hash, 64560660, /* b16a rhythm core; was 495039812 */ '(b15: gate under the HUD changes the snake start and speed; was 771212880) (b12d: ring stage pace changes stage 12; was 36158670) orbit-weapon runs unchanged (pin updated in b11 merge, ring stage 360 aim + earlier b11 changes: Beat Run groove, Mirror cell at stage 44, Bell reach fix)');
console.log('30_perf_r9 ok');
