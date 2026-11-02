// Batch 12 (agent f): ring stage aim polish. Pure aim controller, the optional Aim assist setting, hint and preview wiring.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const src = f => readFileSync(join(root, f), 'utf8');
const A = await import(join(root, 'aim_b12f.js'));
const sim = await import(join(root, 'sim.js'));
const near = (a, b, e = 1e-6) => Math.abs(A.angDiff(a, b)) < e;

// arena touch aims straight at the finger; a touch on the duo is ignored (dead zone) and keeps the old aim
{
  const a = A.newAim(), R = sim.RING, cx = R.cx, cy = R.cy;
  assert.equal(A.aimDown(a, cx + 80, cy, cx, cy, R.R), 1, 'a touch near the circle is an arena touch');
  assert.ok(near(a.tgt, 0), 'aims right');
  A.aimMove(a, cx + 5, cy + 5, cx, cy); assert.ok(near(a.tgt, 0), 'inside the dead zone the aim stays');
  A.aimMove(a, cx, cy + 60, cx, cy); assert.ok(near(a.tgt, Math.PI / 2), 'then follows at once, nothing sticky');
}
// thumb zone: a touch far below is a floating stick, aim is the drag direction, dead zone first, anchor trails
{
  const a = A.newAim(), R = sim.RING, cx = R.cx, cy = R.cy, fy = cy + R.R + A.ARENA_PAD + 150;
  assert.equal(A.aimDown(a, 300, fy, cx, cy, R.R), 2, 'a touch far from the duo is a stick');
  assert.ok(near(a.tgt, -Math.PI / 2), 'landing alone does not change the aim');
  A.aimMove(a, 305, fy - 5, 360, cy); assert.ok(near(a.tgt, -Math.PI / 2), 'a tiny wobble is inside the dead zone');
  A.aimMove(a, 400, fy - 100, cx, cy); assert.ok(a.tgt > -Math.PI / 2 && a.tgt < 0, 'drag up and right aims up and right');
  for (let i = 0; i < 40; i++) A.aimMove(a, 300 + i * 20, fy, cx, cy);
  A.aimMove(a, 300 + 780 - 150, fy, cx, cy); assert.ok(Math.abs(A.angDiff(a.tgt, Math.PI)) < 0.2, 'reversing a long drag turns at once (anchor trails)');
  A.aimUp(a); assert.equal(a.mode, 0);
}
// easing converges, takes the short way round the back, frame rate independent enough
{
  const a = A.newAim(); a.now = 3.0; a.tgt = -3.0;
  A.aimTick(a, 1 / 60); assert.ok(a.now > 3.0 || a.now < -3.0, 'goes through pi, not back through zero');
  for (let i = 0; i < 90; i++) A.aimTick(a, 1 / 60); assert.ok(near(a.now, a.tgt, 0.01), 'settles on the target');
}
// aim assist: only a near miss is pulled onto the cell, off means no change, a clear hit or a far miss is untouched
{
  const g = sim.createGame({ seed: 4, stage: 6 }), p = g.p, a = A.newAim();
  for (const sn of g.snakes) for (const c of sn.segs) { c.hp = 0; }
  const c = g.snakes[0].segs[2]; c.hp = 10; c.r = 22; c.x = p.x + 200; c.y = p.y;
  const half = Math.asin(22 / 200);
  assert.equal(A.assistOffset(g, 0), 0, 'dead centre needs no help');
  const miss = half * 0.7 + 0.08; assert.ok(A.assistOffset(g, miss) < 0 && Math.abs(A.assistOffset(g, miss)) <= 0.09, 'a near miss is pulled back towards the cell');
  assert.equal(A.assistOffset(g, 1.0), 0, 'a far miss is left alone');
  a.now = miss; for (let i = 0; i < 60; i++) A.aimAssisted(a, g, 1 / 60, true);
  assert.ok(Math.abs(A.aimAssisted(a, g, 1 / 60, true)) < half * 0.8, 'the assisted aim ends on the cell');
  const b = A.newAim(); b.now = miss; assert.equal(A.aimAssisted(b, g, 1 / 60, false), miss, 'assist off: aim untouched');
}
// setting: default off, saved, shown, iconed
{
  const d = sim.defaultSave(); assert.equal(d.settings.aimAssist, false, 'off by default');
  const s = sim.sanitizeSave({ settings: { aimAssist: true } }); assert.equal(s.settings.aimAssist, true, 'the choice survives a save');
  assert.equal(sim.sanitizeSave({}).settings.aimAssist, false);
  assert.ok(src('index.html').includes('data-k="aimAssist"'));
  const I = await import(join(root, 'icons_b8.js')), S = await import(join(root, 'set_icons8.js'));
  assert.ok(I.SET_ICONS.aimAssist && S.SET_ICON.aimAssist, 'icons in both sets');
  assert.ok(src('main.js').includes('save.settings.aimAssist'));
}
// wiring: hint, preview, muzzle flash along the aim, joystick ring hidden for arena touches
{
  const m = src('main.js'), r = src('render.js'), h = src('hitjuice.js');
  assert.ok(/aimHint = false; if \(aimS\.mode/.test(m), 'the first touch dismisses the hint');
  assert.ok(m.includes('ringPreviewAim') && m.includes('CIRCLE</i><i class="ring aim">DRAG TO AIM'), 'the stage preview and badges explain the circle stage');
  assert.ok(r.includes('function drawAimHint') && r.includes('notes fly where you point'));
  assert.ok(/g\.ring && g\.phase !== 'dead'\) drawAimLine/.test(r) && r.indexOf('drawAimLine(g);   // b12f') < r.indexOf('drawSnake(g, sn);'), 'the aim line is under the snake');
  assert.ok(/a: p\.aim \+ Math\.PI \/ 2/.test(h) && /case 'swab': case 'dragon': case 'needles': case 'bubble': \{ const rg = g\.ring && g\.p/.test(h), 'muzzle flashes point along the aim (b12g version kept in the merge)');
  assert.ok(r.includes('ui.joy.on && !ui.joy.hide'));
  assert.ok(src('sim.js').includes('RING_SPEED = 1.7'), 'RING_SPEED untouched');
  for (const f of ['aim_b12f.js', 'main.js', 'render.js', 'hitjuice.js']) assert.ok(!src(f).includes(String.fromCharCode(8212)), 'no em dash in ' + f);
}
console.log('35_f_ring_aim ok');
