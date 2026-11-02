// 02-animal-art: every pet bakes in every mood (normal, blink, alert, happy), plus the paw and feather sprites.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: stubCtx }), 2);
for (const id of ['kitten', 'puppy', 'piglet', 'lamb', 'hamster', 'turtle']) for (const m of [0, 1, 2, 3]) assert.ok(kit.SPR.pet(id, m), `pet ${id} mood ${m}`);
assert.notEqual(kit.SPR.pet('kitten', 0), kit.SPR.pet('kitten', 3), 'moods are separate sprites');
assert.ok(kit.SPR.paw() && kit.SPR.feather(), 'paw and feather sprites');
for (const id of ['bubble', 'dragon', 'swab']) assert.ok(kit.SPR.weapon(id), 'weapon ' + id);
console.log('02_animal_art ok');
