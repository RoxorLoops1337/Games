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
// round 4: kill-streak cheer and hat idle animations
{
  const { createCheer, HAT_FX, hatPose, STREAKS } = await import(join(root, 'cheer.js'));
  const { OUTFITS } = await import(join(root, 'sim.js'));
  for (const o of OUTFITS) assert.equal(typeof HAT_FX[o.hat], 'function', 'idle animation for ' + o.id);
  const ch = createCheer(), g = { t: 10, combo: 1, lastKill: 10 };
  assert.equal(ch.step(g, 0.016), false, 'no cheer at combo 1');
  g.t = 10.5; g.combo = STREAKS[0]; g.lastKill = g.t;
  assert.equal(ch.step(g, 0.016), true, 'cheer at the first streak');
  assert.ok(ch.t > 0.9 && ch.tier === 0, 'cheer starts strong');
  g.t = 10.6; assert.equal(ch.step(g, 0.016), false, 'one cheer per milestone');
  assert.ok(ch.pet(0, -1) === null || ch.pet(0, -1).y >= 0, 'pet hop is non-negative');
  g.t = 11; g.combo = 25; g.lastKill = g.t; assert.equal(ch.step(g, 0.016), true, 'skipping to 25 cheers once at the biggest milestone');
  assert.equal(ch.tier, 2, 'tier follows the highest milestone crossed');
  for (let i = 0; i < 200; i++) { g.t += 0.016; ch.step(g, 0.016); }
  assert.equal(ch.t, 0, 'the cheer ends');
  assert.equal(hatPose('🎩', 0).dy, 0, 'no pose at rest');
  assert.ok(hatPose('🎩', 0.5).dy < -10, 'the top hat is doffed');
  console.log('02_animal_art r4 ok');
}
// round 5: pet-specific streak emotes, the duo hop and the dressed title/result duo
{
  const { createCheer, EMOTE, STREAKS } = await import(join(root, 'cheer.js'));
  for (const id of ['kitten', 'puppy', 'piglet', 'lamb', 'hamster', 'turtle']) assert.ok(EMOTE[id] >= 3, 'emote for ' + id);
  assert.equal(new Set(Object.values(EMOTE)).size, 6, 'every pet has its own emote');
  const ch = createCheer(); const g = { t: 10, combo: 0, lastKill: 10 };
  ch.step(g, 0.016); assert.equal(ch.duo(0), null, 'no hop at rest');
  g.combo = STREAKS[0]; g.lastKill = 10; assert.ok(ch.step(g, 0.016), 'milestone hit');
  for (let i = 0; i < 10; i++) ch.step(g, 0.016);
  const d = ch.duo(0); assert.ok(d && d.y >= 0 && d.sq >= 1, 'the duo hops on a streak');
  ch.burst(100, 100, 0, 'puppy');
  const calls = []; const spy = new Proxy({}, { get: (_t, k) => (k === 'save' || k === 'restore') ? noop : () => { calls.push(k); }, set: () => true });
  ch.draw(spy, 0.016, null, noop, noop); assert.ok(calls.length > 0, 'emote particles draw');
  const { hatPlacements } = await import(join(root, 'duo_pose.js'));
  const { OUTFITS } = await import(join(root, 'sim.js'));
  for (const o of OUTFITS) assert.equal(hatPlacements(o).length, 2, 'two heads or eyes for ' + o.id);
  assert.deepEqual(hatPlacements(null), [], 'no outfit, no hats');
  console.log('02_animal_art r5 ok');
}
