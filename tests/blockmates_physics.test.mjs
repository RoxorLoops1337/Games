// Blockmates: body physics on hand built maps (ladders, one way platforms, water, steps, ice-free walking).
import assert from 'node:assert/strict';
import { B, L_WATER } from '../blockmates/shared/data.js';
import { planDig, blockers } from '../blockmates/client/dig.js';
import { I, ITEMS } from '../blockmates/shared/data.js';
import { stepBody, K_LEFT, K_RIGHT, K_UP, K_DOWN, K_JUMP } from '../blockmates/shared/physics.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; } };
function map() {
  const fg = new Map(), liq = new Map();
  const w = { fg, liq, fgAt: (x, y) => fg.get(x + ',' + y) || 0, liqAt: (x, y) => liq.get(x + ',' + y) || 0, set: (x, y, id) => fg.set(x + ',' + y, id), water: (x, y) => liq.set(x + ',' + y, (L_WATER << 4) | 8) };
  for (let x = -20; x < 40; x++) w.set(x, 20, B.stone);
  return w;
}
const body = (x, y) => ({ x, y, vx: 0, vy: 0, w: 0.7, h: 1.8, onGround: false, dir: 1 });
const run = (w, b, k, n) => { for (let i = 0; i < n; i++) stepBody(w, b, k); };

test('lands on the floor and stays put', () => {
  const w = map(), b = body(5, 10);
  run(w, b, 0, 60);
  assert.ok(b.onGround && Math.abs(b.y - 20) < 0.01);
  const y = b.y; run(w, b, 0, 30); assert.equal(b.y, y);
});

test('jump height is about two and a half tiles and a one tile gap is clearable', () => {
  const w = map(), b = body(5, 20 - 0.0001); run(w, b, 0, 5);
  let top = b.y; for (let i = 0; i < 40; i++) { stepBody(w, b, i === 0 ? K_JUMP : 0); top = Math.min(top, b.y); }
  assert.ok(20 - top > 2.2 && 20 - top < 3.2, 'height ' + (20 - top));
});

test('walks up a one tile step but is stopped by a two tile wall', () => {
  const w = map(); w.set(10, 19, B.stone);
  const b = body(6, 19.99); run(w, b, 0, 10); run(w, b, K_RIGHT, 40);
  assert.ok(b.x > 11, 'stepped up, x=' + b.x);
  w.set(16, 19, B.stone); w.set(16, 18, B.stone);
  run(w, b, K_RIGHT, 60);
  assert.ok(b.x < 16, 'blocked by the wall, x=' + b.x);
});

test('ladders climb up and down', () => {
  const w = map(); for (let y = 10; y < 20; y++) w.set(8, y, B.ladder);
  const b = body(8.5, 19.99); run(w, b, 0, 5);
  run(w, b, K_UP, 30); assert.ok(b.y < 17, 'climbed to ' + b.y);
  run(w, b, 0, 15); const y = b.y; run(w, b, 0, 15); assert.ok(Math.abs(b.y - y) < 0.05, 'hangs on the ladder');
  run(w, b, K_DOWN, 40); assert.ok(b.y > 19, 'climbed down');
});

test('one way platforms: pass through from below, land on top, drop with down', () => {
  const w = map(); for (let x = 4; x < 12; x++) w.set(x, 18, B.platform);
  const b = body(8, 19.9999); run(w, b, 0, 5);
  run(w, b, K_JUMP, 1); run(w, b, 0, 50);
  assert.ok(Math.abs(b.y - 18) < 0.05, 'standing on the platform, y=' + b.y);
  run(w, b, K_DOWN, 20); run(w, b, 0, 40);
  assert.ok(Math.abs(b.y - 20) < 0.05, 'dropped to the floor, y=' + b.y);
});

test('water slows you down and lets you swim up', () => {
  const w = map(); for (let x = 0; x < 20; x++) for (let y = 10; y < 20; y++) w.water(x, y);
  const b = body(10, 11); run(w, b, 0, 90);
  assert.ok(b.y > 19.5, 'sank');
  run(w, b, K_JUMP, 60); assert.ok(b.y < 14, 'swam up to ' + b.y);
  const slow = body(2, 19.99); run(w, slow, K_RIGHT, 30);
  const fast = body(25, 19.99); run(w, fast, K_RIGHT, 30);
  assert.ok(slow.x - 2 < (fast.x - 25) * 0.8, 'slower in water');
});

test('trampolines bounce hard falls', () => {
  const w = map(); w.set(10, 20, B.trampoline);
  const b = body(10.5, 5); let min = 99; for (let i = 0; i < 120; i++) { stepBody(w, b, 0); if (i > 40) min = Math.min(min, b.y); }
  assert.ok(min < 17, 'bounced up to ' + min);
});

test('dig planner tunnels through stone, refuses what the tools cannot break', () => {
  const w = map();
  for (let x = 60; x < 140; x++) { w.set(x, 20, B.stone); for (let y = 21; y < 40; y++) w.set(x, y, B.stone); }
  w.solidAt = (x, y) => !!w.fgAt(x, y) && w.fgAt(x, y) !== B.ladder;
  const inv = new Array(40).fill(null); inv[0] = { id: I.wood_pickaxe, n: 1, d: 100 };
  const path = planDig(w, inv, 105, 19, 97, 25);
  assert.ok(path && path[0][0] === 105 && path[path.length - 1][0] === 97 && path[path.length - 1][1] === 25, 'a route exists');
  assert.ok(path.some((n, i) => i && blockers(w, path[i - 1], n).length > 0), 'it has to dig somewhere');
  for (let x = 60; x < 140; x++) w.set(x, 23, B.iron_ore);
  assert.equal(planDig(w, inv, 105, 19, 105, 30), null, 'a wall of iron ore cannot be dug with a wood pick');
  inv[1] = { id: I.iron_pickaxe, n: 1, d: 100 };
  assert.ok(planDig(w, inv, 105, 19, 105, 30), 'but can with an iron pick');
  void ITEMS;
});

console.log(`\n${passed} passed`);
