// 02-animal-art r6: per-pet cheer poses, result joy hearts
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const { createCheer } = await import(join(root, 'cheer.js'));
const ch = createCheer();
ch.step({ t: 10, combo: 4, lastKill: 10 }, 0.016);
ch.step({ t: 10.1, combo: 20, lastKill: 10.1 }, 0.016);
assert.ok(ch.t > 0, 'a streak starts the cheer');
for (const id of ['kitten', 'puppy', 'piglet', 'lamb', 'hamster', 'turtle', undefined]) { const p = ch.pet(0, -1, id); assert.ok(p && typeof p.sx === 'number' && Number.isFinite(p.y) && Number.isFinite(p.flip), 'pose ' + id); }
ch.step({ t: 10.2, combo: 21, lastKill: 10.2 }, 0.4);
const pup = ch.pet(0, 1, 'puppy'), tur = ch.pet(0, 1, 'turtle');
assert.ok(Math.abs(pup.flip) > 0.5, 'puppy flips');
assert.equal(tur.flip, 0);
assert.ok(Math.abs(tur.sx) <= 1 && tur.sx !== 1, 'turtle spins on its shell');
{
  globalThis.document = globalThis.document || { createElement: () => ({}) };
  const { joyHearts } = await import(join(root, 'duo_pose.js'));
  assert.deepEqual([0, 20, 40, 70, 100].map(joyHearts), [0, 0, 1, 2, 3], 'joy hearts by happiness');
}
console.log('02_animal_art_r6 ok');
