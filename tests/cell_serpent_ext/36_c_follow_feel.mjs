// b13c: follow-finger feel: edge magnet (hand aware), finger marker drawing, lost capture handling.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const f = await import(path.join(ROOT, 'cell_serpent', 'follow_b13c.js'));
const x0 = 40, x1 = 680;
assert.equal(f.edgeMap(300, x0, x1, false), 300, '1:1 in the middle');
assert.equal(f.edgeMap(x0 + 10, x0, x1, false), x0, 'strip at the left wall snaps');
assert.equal(f.edgeMap(x1 - 10, x0, x1, false), x1, 'strip at the right wall snaps');
assert.equal(f.edgeMap(x0 + 40, x0, x1, false), x0, 'right hand: the left strip is wide');
assert.equal(f.edgeMap(x0 + 40, x0, x1, true), x0 + 40, 'left hand: the left strip is narrow');
assert.equal(f.edgeMap(x1 - 40, x0, x1, true), x1, 'left hand: the right strip is wide');
assert.equal(f.edgeMap(x1 - 40, x0, x1, false), x1 - 40, 'right hand: the right strip is narrow');
assert.equal(f.edgeMap(NaN, x0, x1, false), x0, 'NaN is safe');
for (let x = -100; x < 900; x += 7) { const m = f.edgeMap(x, x0, x1, x % 2 === 0); assert.ok(m >= x0 - 1e-9 || x < x0, 'in range'); assert.ok(m <= x1 || x > x1); }
assert.equal(f.edgeMap(60, 100, 110, false), 100, 'tiny zones never invert');

// the marker draws strokes only, tether only when the duo lags
const calls = []; const ctx = new Proxy({}, { get: (t, k) => k === 'save' || k === 'restore' ? () => {} : (...a) => { calls.push(k); }, set: () => true });
f.drawFinger(ctx, { p: { x: 200, y: 700 } }, 200, 0, false); const near = calls.length; calls.length = 0;
f.drawFinger(ctx, { p: { x: 200, y: 700 } }, 500, 0, false); assert.ok(calls.length > near, 'tether adds strokes while the duo lags');
assert.ok(!calls.includes('fill') && !calls.includes('createRadialGradient'), 'strokes only');

const main = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'main.js'), 'utf8');
assert.ok(main.includes('folX(') && main.includes("'lostpointercapture', endJoy"), 'main.js uses the edge magnet and handles a lost capture');
assert.ok(fs.readFileSync(path.join(ROOT, 'cell_serpent', 'render.js'), 'utf8').includes('drawFinger('), 'render uses drawFinger');
for (const n of ['follow_b13c.js']) assert.ok(!fs.readFileSync(path.join(ROOT, 'cell_serpent', n), 'utf8').includes('—'), 'no em dash');
console.log('36_c_follow_feel ok');
