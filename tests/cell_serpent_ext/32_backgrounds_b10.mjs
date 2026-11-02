// Backgrounds batch 10: creatures for disco, grumpy and frosty, the flock that bursts from a dead head, and a stage clear
// flourish per world (butterflies and moths land on the duo, bees and bats circle it, a rainbow, glitter, a penguin).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const b9 = await import(join(root, 'bg_b9.js'));
const b10 = await import(join(root, 'bg_b10.js'));
const world = await import(join(root, 'bg_world.js'));
const sim = await import(join(root, 'sim.js'));

const calls = {};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; return { addColorStop() {} }; }), set: (t, k, v) => { t[k] = v; return true; } });
const kit = { bake: () => ({ c: {} }) };
const th = { lite: '#ffb3d9', base: '#ff5fa8' };
const reset = () => { for (const k of Object.keys(calls)) delete calls[k]; };

// new creatures: every world has one, and each kind draws something without throwing
assert.equal(b9.flyerFor('disco'), 'moth'); assert.equal(b9.flyerFor('grumpy'), 'duck'); assert.equal(b9.flyerFor('frosty'), 'penguin');
for (const kind of ['butterfly', 'bee', 'bat', 'bird', 'moth', 'duck', 'penguin']) { reset(); b9.drawKind(ctx, kind, 0.5, 1, 'love', th); assert.ok(calls.fill > 0 || calls.stroke > 0, kind + ' paints'); }
for (const k of ['disco', 'grumpy', 'frosty']) {
  const s = b9.makeB9(); let seen = 0, t = 0;
  for (let i = 0; i < 4000; i++) { t += 0.05; b9.stepFlyers(s, t, k); if (s.fl[0].t0 >= 0) seen++; if (i % 50 === 0) b9.drawFlyers(ctx, s, k, th, t); }
  assert.ok(seen > 10 && seen < 3900, k + ' appears now and then');
}
{ const s = b9.makeB9(); b9.stepFlyers(s, 0.1, 'frosty'); for (let t = 0; t < 60; t += 0.1) b9.stepFlyers(s, t, 'frosty'); assert.ok(s.fl.every(f => f.y > sim.LINE_Y || f.t0 < 0), 'the penguin slides on the ground, not in the sky'); }

// a dead head: the flock bursts out of it, flies up and away, and is gone after a few seconds
const b = b10.makeB10();
assert.equal(b10.scare(b, 'disco', 1, 300, 600) > 0, true);
assert.equal(b10.scare(b, 'sleepy', 1, 300, 600), 0, 'dreamers do not scatter');
assert.equal(b10.scare(b, 'frosty', 1, 300, 600), 0, 'a penguin cannot fly off');
assert.equal(b10.scare(b, 'gloomy', 2, 300, 600), b10.NSC, 'a whole flock of bats');
assert.ok(b.sc.every(f => f.t0 === 2 && f.kind === 'bat' && f.vy < 0.1 * 400), 'they leave upward-ish');
assert.ok(b.sc.some(f => f.vx < 0) && b.sc.some(f => f.vx > 0), 'and spread both ways');
reset(); b10.drawScatter(ctx, b, 2.4, th, false); assert.ok(calls.translate >= b10.NSC, 'drawn');
reset(); b10.drawScatter(ctx, b, 2.4, th, true); assert.ok(calls.translate <= b10.NSC / 2 + 1, 'half the flock on low quality');
b10.drawScatter(ctx, b, 9, th, false); assert.equal(b10.countOn(b.sc), 0, 'the flock is spent and freed');

// stage clear: creatures settle near the duo and leave, per kind
const px = 360, py = 1150;
for (const skin of ['love', 'disco']) {
  const f = b10.makeB10(); assert.equal(b10.clearFlourish(f, skin, 10, px, py), 4);
  for (const c of f.cl.slice(0, 4)) {
    b10.clearPos(f, c, 2.9); assert.ok(Math.abs(b10.OUT.x - px) < 120 && b10.OUT.y < py - 90 && b10.OUT.y > py - 190, skin + ' perch above the duo');
    const fadeEnd = b10.clearPos(f, c, b10.CLEAR_T - 0.01); assert.ok(fadeEnd < 0.1, 'gone by the end');
  }
}
for (const [skin, n] of [['sour', 4], ['gloomy', 5], ['rust', 3], ['mighty', 3], ['grumpy', 3], ['frosty', 2], ['sleepy', 0]]) {
  const f = b10.makeB10(); assert.equal(b10.clearFlourish(f, skin, 10, px, py), n, skin + ' count');
  for (let i = 0; i < n; i++) {
    const c = f.cl[i]; let near = 1e9;
    for (let u = 0; u < b10.CLEAR_T; u += 0.1) { const fd = b10.clearPos(f, c, u); if (fd > 0.8) near = Math.min(near, Math.hypot(b10.OUT.x - px, b10.OUT.y - py)); }
    assert.ok(near < 220, skin + ' comes close to the duo (' + near.toFixed(0) + ')');
  }
}
{ const f = b10.makeB10(); b10.clearFlourish(f, 'frosty', 10, px, py); const c = f.cl[0]; b10.clearPos(f, c, 3); assert.ok(b10.OUT.y > py, 'the penguin stays on the floor'); }
{ const f = b10.makeB10(); b10.clearFlourish(f, 'sour', 10, px, py); const c = f.cl[0]; let minx = 1e9, maxx = -1e9; for (let u = 1.8; u < 3; u += 0.05) { b10.clearPos(f, c, u); minx = Math.min(minx, b10.OUT.x); maxx = Math.max(maxx, b10.OUT.x); } assert.ok(maxx - minx > 80, 'bees circle'); }

// rainbow after the rain, glitter on the ice, lamps for the disco, a wish star for the dreamers
for (const [skin, what] of [['grumpy', 'arc'], ['frosty', 'fillRect']]) {
  const f = b10.makeB10(); b10.clearFlourish(f, skin, 10, px, py); reset(); b10.drawClear(ctx, f, 12, th, false);
  assert.ok(calls[what] >= 4, skin + ' draws ' + what);
}
{ const f = b10.makeB10(); b10.clearFlourish(f, 'love', 10, px, py); reset(); b10.drawClear(ctx, f, 10.5, th, false); assert.equal(calls.arc || 0, 0, 'no rainbow on a pink world'); reset(); b10.drawClear(ctx, f, 20, th, false); assert.equal(calls.translate || 0, 0, 'nothing once the flourish is over'); }
{ const f = b10.makeB10(); b10.clearFlourish(f, 'disco', 10, px, py); assert.equal(f.lampT, 10, 'the disco lamps sweep again'); }
const bgfx = world.createBgFx();
bgfx.clear(5, 'sleepy', px, py); assert.equal(bgfx.b8.shoot.next, 5, 'a shooting star on a sleepy clear');

// a new stage or run forgets a flourish still in the air
{ const f = b10.makeB10(); b10.stepB10(f, 1, 'love', 10); b10.clearFlourish(f, 'love', 1, px, py); b10.scare(f, 'love', 1, 300, 600);
  b10.stepB10(f, 1.1, 'love', 10.1); assert.ok(f.cl[0].on && f.sc[0].t0 > -50, 'same stage keeps it');
  b10.stepB10(f, 2, 'rust', 0); assert.ok(!f.cl[0].on && f.sc[0].t0 < -50 && f.clT < -50, 'new stage clears it');
  b10.clearFlourish(f, 'rust', 3, px, py); b10.stepB10(f, 3, 'rust', 20); b10.stepB10(f, 3.1, 'rust', 0.1); assert.ok(!f.cl[0].on, 'a restarted run clears it'); }

// whole background in every world, through a kill, a clear, reduced motion and low quality
const fx = world.createBgFx();
for (const skin of sim.SKINS) for (const reduce of [false, true]) for (const low of [false, true]) {
  const snakes = [{ segs: [{ x: 300, y: 300, r: 30 }], boss: false }];
  const o = { kit, skin, phase: 0, flash: 0, noFlash: false, stage: 3, boss: false, th, t: 5, reduce, low, kick: 9, snakes, gt: 1 };
  fx.draw(ctx, o); fx.headKill(5.1, 300, 500); fx.clear(5.2, skin, px, py);
  for (const t of [5.3, 6, 7.5, 9, 11]) { o.t = t; o.gt = t - 4; fx.draw(ctx, o); }
}
for (const skin of ['disco', 'grumpy', 'frosty']) assert.ok(b9.FLYER[skin]);
