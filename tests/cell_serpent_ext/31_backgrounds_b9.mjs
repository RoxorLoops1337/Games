// Backgrounds batch 9: stage-intro lamps, sky creatures, the Encore beam parting the mist and sucking up petals.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const b9 = await import(join(root, 'bg_b9.js'));
const b8 = await import(join(root, 'bg_b8.js'));
const mist = await import(join(root, 'bg_mist.js'));
const world = await import(join(root, 'bg_world.js'));
const sim = await import(join(root, 'sim.js'));

const calls = {};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; return { addColorStop() {} }; }), set: (t, k, v) => { t[k] = v; return true; } });
const kit = { bake: (key, w, h, fn) => { fn(ctx); return { c: {} }; } };
const th = { lite: '#ffb3d9', base: '#ff5fa8' };

// lamps: swell in and out over the intro only, and cross over the duo
assert.equal(b9.introLevel(-1), 0); assert.equal(b9.introLevel(b9.INTRO_T + 0.1), 0); assert.equal(b9.introLevel(undefined), 0);
assert.ok(b9.introLevel(b9.INTRO_T / 2) > 0.99);
const up = -Math.PI / 2;
assert.ok(b9.lampAngle(0, 0) < up && b9.lampAngle(1, 0) > up, 'lamps start leaning outward');
assert.ok(b9.lampAngle(0, b9.INTRO_T) > up && b9.lampAngle(1, b9.INTRO_T) < up, 'and end crossed over');
const b = b9.makeB9();
b9.drawLamps(ctx, kit, b, 'love', th, 1.3, false); assert.ok(calls.drawImage >= 3, 'lamps drawn during the intro');
const n0 = calls.drawImage; b9.drawLamps(ctx, kit, b, 'love', th, 5, false); assert.equal(calls.drawImage, n0, 'nothing after the intro');
assert.ok(b.lamps && b.lampSkin === 'love');

// sky creatures: a creature per themed world, none on the others, and they launch and finish
for (const k of ['love', 'piggy', 'sneezy', 'sour', 'gloomy', 'rust', 'mighty', 'sleepy']) assert.ok(b9.flyerFor(k), k);
for (const k of ['disco', 'grumpy', 'frosty']) assert.equal(b9.flyerFor(k), '');
for (const k of ['sour', 'gloomy', 'sleepy', 'love', 'rust']) {
  const s = b9.makeB9(); let seen = 0, t = 0;
  for (let i = 0; i < 4000; i++) { t += 0.05; b9.stepFlyers(s, t, k); if (s.fl[0].t0 >= 0) seen++; if (i % 50 === 0) b9.drawFlyers(ctx, s, k, th, t); }
  assert.ok(seen > 10 && seen < 3900, k + ' appears now and then');
}
const idle = b9.makeB9(); b9.stepFlyers(idle, 50, 'disco'); assert.ok(idle.fl.every(f => f.t0 < 0));

// beam: petals are sucked up along it, squall leans away, mist banks are shoved aside and thin out
const w = b8.makeB8(); w.skin = 'love'; w.lt = 1;
b8.stepBeam(w, { x: 200, t: 0.5 }, 0.016);
assert.ok(w.petals.filter(p => p.life > 0).length >= 30 && w.petals.every(p => p.life <= 0 || p.vy < 0), 'petals rise');
assert.ok(w.pendingWind > 0, 'wind leans away from a beam on the left');
const w2 = b8.makeB8(); w2.skin = 'frosty'; w2.lt = 1; b8.stepBeam(w2, { x: 600, t: 0.5 }, 0.016);
assert.ok(b8.squallLevel(w2, 1.1) > 0 && w2.sq.dir < 0, 'a squall blows when the beam fires');
const beam = { x: 300, t: 0.4 }; b8.stepBeam(w, beam, 0.016); const first = w.petals[0].life; b8.stepBeam(w, beam, 0.016); assert.equal(w.petals[0].life, first, 'the same beam fires once');
assert.ok(w.bk > 0.1);
const banks = mist.makeBanks(); banks[0].x = 300 + 210 + 70; banks[1].x = 300 + 210 - 90;   // drawn x = x + t*sp*v + wx*z - 210 (t=0): one just right of the beam, one just left
banks[0].u = banks[1].u = 0.3;
const heads = { n: 0, x: [0, 0, 0, 0], y: [0, 0, 0, 0], bx: 300, bk: 1 };
for (let i = 0; i < 40; i++) mist.drawMist(ctx, kit, 'sleepy', banks, i * 0.016, 0, false, false, heads);
assert.ok(banks[0].pu > 20 && banks[1].pu < -20, 'banks slide away from the beam');
assert.ok(banks[0].pa > 0.2, 'and thin out');
heads.bk = 0; for (let i = 0; i < 400; i++) mist.drawMist(ctx, kit, 'sleepy', banks, 1 + i * 0.016, 0, false, false, heads);
assert.ok(Math.abs(banks[0].pu) < 1, 'they drift back once the beam is gone');
let off = w; for (let i = 0; i < 700; i++) b8.stepBeam(off, null, 0.016); assert.equal(off.heads.bk, 0);

// whole background: the draw accepts the beam and intro time, in every world, with and without reduced motion
const bgfx = world.createBgFx();
for (const skin of sim.SKINS) for (const reduce of [false, true]) {
  const snakes = [{ segs: [{ x: 300, y: 300, r: 30 }], boss: false }];
  bgfx.draw(ctx, { kit, skin, phase: 0, flash: 0, noFlash: false, stage: 3, boss: false, th, t: 5, reduce, low: false, kick: 9, snakes, beam: { x: 360, t: 0.4, w: 36 }, gt: 1 });
}
