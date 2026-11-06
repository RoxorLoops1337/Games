// Batch 11 duo and pets: boss kill cheer, upgrade pick hop with star ring, new weapon held high; slow sweeps of the r10 revive hop and bark arcs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createB11, b11Event, pickPose, ringStar, weaponPose, lookUp, WEAPON_SPR, PICK_LEN, WEAPON_LEN, BOSS_TIER } from '../../cell_serpent/duo_b11.js';
import { revivePose, REVIVE_LEN, barkDraw, BARK_LEN } from '../../cell_serpent/duo_react10.js';
import { createCheer, STREAKS } from '../../cell_serpent/cheer.js';
import { WEAPONS } from '../../cell_serpent/sim.js';
const r = fs.readFileSync(new URL('../../cell_serpent/render.js', import.meta.url), 'utf8');

// event routing
{
  const B = createB11(), g = { weap: { tower: { lv: 1 }, swab: { lv: 3 } } };
  assert.equal(b11Event(B, { t: 'kill', head: true, boss: false }, g, 1), '');
  assert.equal(b11Event(B, { t: 'kill', head: false, boss: true }, g, 1), '', 'only the boss head counts');
  assert.equal(b11Event(B, { t: 'kill', head: true, boss: true }, g, 2), 'boss'); assert.equal(B.bossT, 2);
  assert.equal(b11Event(B, { t: 'upgrade', kind: 'weapon', id: 'tower' }, g, 3), 'weapon'); assert.equal(B.wId, 'tower'); assert.equal(B.wT, 3);
  assert.equal(b11Event(B, { t: 'upgrade', kind: 'weapon', id: 'swab' }, g, 4), 'pick', 'a level on an owned weapon is a plain pick'); assert.equal(B.pickT, 4); assert.equal(B.wT, 3);
  assert.equal(b11Event(B, { t: 'upgrade', kind: 'passive', id: 'x' }, g, 5), 'pick');
  assert.equal(b11Event(B, { t: 'shoot' }, g, 6), '');
}
{
  for (const id of WEAPONS.map(w => w.id)) if (!WEAPON_SPR[id]) assert.fail('no sprite id for ' + id);
}
// pick hop: crouch, lift, soft landing, then rest
{
  assert.equal(pickPose(-1).u, -1); assert.equal(pickPose(PICK_LEN + 0.1).dy, 0);
  let max = 0, minSy = 9; for (let u = 0; u < PICK_LEN; u += 0.01) { const p = pickPose(u); max = Math.max(max, p.dy); minSy = Math.min(minSy, p.sy); assert.ok(Number.isFinite(p.dy + p.sy + p.sx)); }
  assert.ok(max > 20 && max < 34, 'hop ' + max); assert.ok(minSy < 1);
  const o = { x: 0, y: 0, s: 0, a: 0 };
  for (let k = 0; k <= 1; k += 0.1) { ringStar(o, 2, 6, 100, 100, k); assert.ok(Math.hypot(o.x - 100, (o.y - 100) * 1.8) < 130 && o.s >= 1 && o.a >= 0 && o.a <= 1); }
  assert.ok(ringStar(o, 0, 6, 0, 0, 0.5).s > 6, 'stars are big at the middle of the ring');
}
// weapon held: appears above the heads, grows in with overshoot, fades out, reduce motion stops the spin
{
  assert.equal(weaponPose(-1, false).u, -1); assert.equal(weaponPose(WEAPON_LEN + 0.1, false).s, 0);
  let max = 0; for (let u = 0; u < WEAPON_LEN; u += 0.02) { const w = weaponPose(u, false); max = Math.max(max, w.s); assert.ok(w.y < -110, 'above the duo ' + w.y); assert.ok(w.a >= 0 && w.a <= 1); }
  assert.ok(max > 1.1, 'overshoot ' + max);
  assert.equal(weaponPose(0.5, false).hold, true); assert.equal(weaponPose(WEAPON_LEN * 0.9, false).hold, false);
  assert.equal(weaponPose(0.05, true).rot, 0, 'reduce motion: no spin');
  assert.equal(lookUp(-1), 0); assert.equal(lookUp(WEAPON_LEN * 0.5), 1); assert.equal(lookUp(WEAPON_LEN + 1), 0);
}
// cheer.force starts the cheer at a tier and the pets and duo get a pose
{
  const c = createCheer(); assert.equal(c.duo(0), null);
  c.force(BOSS_TIER); assert.equal(c.tier, BOSS_TIER); assert.equal(c.t, 1); assert.ok(BOSS_TIER < STREAKS.length);
  c.step({ t: 1, combo: 0, lastKill: 0 }, 0.5);
  assert.ok(c.duo(0) !== null || c.t > 0.5); for (const id of ['kitten', 'puppy']) { const p = c.pet(0, 1, id); assert.ok(p === null || Number.isFinite(p.y)); }
}
// slow sweeps of the r10 revive hop and bark arcs: smooth, bounded, no negative radius
{
  let prev = revivePose(0).dy;
  for (let u = 0; u < REVIVE_LEN; u += 0.005) { const p = revivePose(u); assert.ok(Math.abs(p.dy - prev) < 3.2, 'revive hop is smooth at ' + u); assert.ok(p.sy > 0.85 && p.sy < 1.1 && p.sx > 0.9 && p.sx < 1.1); prev = p.dy; }
  const calls = []; const ctx = { save() {}, restore() {}, beginPath() {}, stroke() {}, arc(x, y, rad) { calls.push(rad); assert.ok(rad > 0 && y < 1e3); } };
  for (let u = 0; u < 1; u += 0.02) barkDraw(ctx, 100, 100, u > 0.5 ? 1 : -1, u);
  assert.ok(calls.length > 20 && BARK_LEN > 0.3);
}
// shadows under pets never get a negative radius when a big cheer lifts them
assert.ok(/Math\.max\(4, 24 - \(idle \+ hopY\) \* 0\.3\)/.test(r));
// render wiring
assert.ok(/from '\.\/duo_b11\.js'/.test(r) && /CH\.force\(BOSS_TIER\)/.test(r) && /celebrate11\(p\)/.test(r) && /duo11\(\)/.test(r) && /lookUp\(S\.t - B11\.wT\)/.test(r));
assert.ok(!/—/.test(fs.readFileSync(new URL('../../cell_serpent/duo_b11.js', import.meta.url), 'utf8')));
console.log('33_duo_celebrate_b11 ok');
