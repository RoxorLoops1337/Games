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
for (const id of ['tower', 'dagger', 'dragon', 'bubble', 'maw', 'hog', 'perch']) for (const m of [0, 1, 2, 3, 4]) assert.ok(kit.SPR.weapon(id, m), `weapon ${id} mood ${m}`);
assert.notEqual(kit.SPR.weapon('maw', 0), kit.SPR.weapon('maw', 4), 'chomp is a separate sprite');
console.log('02_animal_art ok');
// round 3: baked hats replace the emoji, every outfit hat has a sprite; the dove has wing frames; the needle bakes
{
  const { bakeHat, HATS } = await import(join(root, 'hats.js'));
  const { OUTFITS } = await import(join(root, 'sim.js'));
  for (const o of (OUTFITS || [])) assert.ok(bakeHat(kit, o.hat), 'baked hat for ' + o.id);
  for (const h of Object.keys(HATS)) assert.equal(bakeHat(kit, h), bakeHat(kit, h), 'hat is cached ' + h);
  assert.equal(bakeHat(kit, 'nope'), null, 'unknown hat falls back to the glyph');
  assert.notEqual(kit.SPR.weapon('dragon', 5), kit.SPR.weapon('dragon', 6), 'wing up and wing down are separate sprites');
  assert.ok(kit.SPR.weapon('needle'), 'needle');
  console.log('02_animal_art r3 ok');
}
