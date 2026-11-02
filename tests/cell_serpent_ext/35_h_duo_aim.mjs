// Batch 12 duo and pets in circle stages: the duo turns toward its aim, kicks back on a volley, holds a mic out, pets slide off the aim line, pet pupils follow the nearest head.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAim, aimPose, petSlot, eyeCode, lookMood, angDiff, KICK_LEN, micArcs } from '../../cell_serpent/duo_aim_b12h.js';
const r = fs.readFileSync(new URL('../../cell_serpent/render.js', import.meta.url), 'utf8');
const art = fs.readFileSync(new URL('../../cell_serpent/art_draw.js', import.meta.url), 'utf8');

// angles wrap the short way
assert.ok(Math.abs(angDiff(3.1, -3.1) - (6.2832 - 6.2)) < 0.01);
// the pose follows the aim, leans toward it and is finite for every angle and clock value
{
  const st = createAim();
  for (let d = -180; d <= 180; d += 15) for (const since of [-1, 0, 0.05, KICK_LEN, 1]) {
    const a = d * Math.PI / 180; aimPose(st, a, since, 0.016, false);
    for (const k of ['turn', 'tilt', 'dx', 'dy', 'hx', 'mx', 'my', 'rot', 'tx', 'ty', 'kick']) assert.ok(Number.isFinite(st[k]), k);
    assert.ok(Math.abs(st.tilt) < 0.07 && Math.abs(st.turn) <= 5 && Math.abs(st.dx) <= 4.1);
  }
  const s2 = createAim(); aimPose(s2, 0, 9, 0.016, false); assert.ok(s2.tilt > 0 && s2.turn > 0, 'aiming right leans right');
  aimPose(s2, Math.PI, 9, 0.016, true); assert.ok(s2.tilt < 0 && s2.turn < 0, 'aiming left leans left (reduced motion snaps)');
  assert.equal(s2.kick, 0, 'no kick with reduced motion');
  const s3 = createAim(); aimPose(s3, -Math.PI / 2, 0, 0.016, false);
  assert.ok(s3.kick > 0.9 && s3.dy > 0, 'a volley kicks the duo back (aiming up pushes down)');
  const m0 = s3.my; aimPose(s3, -Math.PI / 2, 1, 0.016, false); assert.ok(s3.my < m0, 'the mic comes back out after the kick');
  // the visual aim swings toward the target instead of jumping
  const s4 = createAim(); aimPose(s4, 0, 9, 0.016, false); aimPose(s4, 1.5, 9, 0.016, false); assert.ok(s4.a > 0 && s4.a < 1.5);
}
// pets: never on the aim line (within the clearance) and never behind the singers
{
  const o = { x: 0, y: 0 };
  for (let d = -180; d < 180; d += 5) for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
    const a = d * Math.PI / 180; petSlot(o, side, a, 1.3, i);
    assert.ok(Number.isFinite(o.x + o.y));
    const fwd = o.x * Math.cos(a) + o.y * Math.sin(a), cr = -o.x * Math.sin(a) + o.y * Math.cos(a);
    assert.ok(fwd <= -20 || Math.abs(cr) >= 57, `pet on the line at ${d} side ${side}: fwd ${fwd} cr ${cr}`);
    assert.ok(o.y >= -9 && Math.abs(o.x) <= 140 && o.y <= 100, `slot ${o.x},${o.y} at ${d}`);
  }
  petSlot(o, 1, -Math.PI / 2, 0, 0); assert.ok(Math.abs(o.x - 86) < 6 && Math.abs(o.y - 10) < 4, 'aiming straight up leaves the pets at their sides');
}
// pupils look toward the nearest head with a little hysteresis
{
  assert.equal(eyeCode(0, 100, 300), 2); assert.equal(eyeCode(0, -100, 300), 1); assert.equal(eyeCode(0, 10, 300), 0);
  assert.equal(eyeCode(0, 30, 300), 0); assert.equal(eyeCode(2, 30, 300), 2, 'it keeps looking until the head is really ahead');
  assert.equal(eyeCode(0, 400, 900), 0); assert.equal(eyeCode(0, NaN, 100), 0);
  assert.equal(lookMood(0, 2), 40); assert.equal(lookMood(2, 1), 22); assert.equal(lookMood(3, 2), 3); assert.equal(lookMood(7, 1), 7); assert.equal(lookMood(1, 2), 1);
  assert.ok(art.includes('LOOKX') && art.includes('mood % 20'), 'the pet bake decodes the look');
}
// the arcs draw nothing at rest and a fixed number of strokes after a shot
{
  let n = 0; const ctx = new Proxy({}, { get: (t, k) => (k === 'stroke' ? () => { n++; } : () => {}), set: () => true });
  micArcs(ctx, 0, 0, 0, 0); assert.equal(n, 0); micArcs(ctx, 0, 0, 0, 1); assert.equal(n, 6);
}
// render wiring (grep the key lines so a merge cannot silently lose them)
assert.ok(r.includes("from './duo_aim_b12h.js'") && r.includes('aimPose(AIM12') && r.includes('petSlot(SLOT12') && r.includes('bakeMic(kit)') && r.includes('micArcs(ctx') && r.includes('eyeCode(st.lk'));
assert.ok(r.includes('A ? A.turn : 0') && r.includes('(A ? A.tilt : 0)') && r.includes('if (!S.ko && !g.ring)'));
