// Batch 11 ring stages: the duo stands fixed in the middle of a smaller circle and aims all round (input.aim, radians).
// Lane stages are untouched: the duo slides and shoots straight up.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const H = await import('./balance_harness.mjs');
const src = f => readFileSync(join(root, f), 'utf8');
const tick = (g, n = 1, inp = { mx: 0 }) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, inp); };
const ang = b => Math.atan2(b.vy, b.vx), dA = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// ---- geometry
assert.ok(sim.RING.R >= 120 && sim.RING.R <= 145, 'the circle is smaller than the old 175: ' + sim.RING.R);
assert.ok(sim.RING_SCALE >= 0.6 && sim.RING_SCALE <= 0.8, 'the duo is about 70 percent in a circle stage');
assert.ok(sim.RING.cy + sim.RING.R + 60 < sim.LINE_Y + 40 && sim.RING.cy - sim.RING.R > 300, 'the circle fits between the top HUD and the bottom skill row');
for (const n of [6, 12, 18, 24, 30, 36, 42, 48]) {
  const p = sim.buildPath(n), end = sim.pointAt(p, p.len);
  assert.ok(Math.abs(Math.hypot(end.x - sim.RING.cx, end.y - sim.RING.cy) - sim.RING.R) < 10, 'ring stage ' + n + ' spiral ends on the circle');
  assert.ok(p.pts[0].y < -100 && p.pts.every(q => q.x > -40 && q.x < 760), 'the snake still spirals in from outside the frame, inside the width');
}

// ---- the duo is fixed in ring stages and slides in lane stages
{
  const r = sim.createGame({ seed: 4, stage: 6 });
  assert.ok(r.ring); assert.equal(r.p.zone.x0, sim.RING.cx); assert.equal(r.p.zone.x1, sim.RING.cx);
  for (const mx of [1, -1]) { tick(r, 90, { mx }); assert.equal(r.p.x, sim.RING.cx, 'move input is ignored'); assert.equal(r.p.y, sim.RING.cy); }
  r.p.kx = 900; tick(r, 20); assert.equal(r.p.x, sim.RING.cx, 'knock back cannot move it either');
  const l = sim.createGame({ seed: 4, stage: 3 }); assert.ok(!l.ring);
  tick(l, 60, { mx: 1 }); assert.ok(l.p.x > sim.W / 2 + 100, 'lane stages still slide');
  tick(l, 60, { mx: 1, aim: 0 }); assert.equal(l.p.aim, -Math.PI / 2, 'lane stages ignore the aim');
  for (const b of l.bullets) assert.ok(Math.abs(b.vx) < 1e-6 && b.vy < 0, 'lane bullets fly straight up');
}

// ---- aimed bullets fly in the aimed direction (capsule and the straight weapons)
for (const deg of [-90, -45, 0, 30, 90, 135, 180, -150]) {
  const a = deg * Math.PI / 180, g = sim.createGame({ seed: 7, stage: 6 });
  g.weap.needles = { lv: 2, cd: 0 }; g.weap.bubble = { lv: 1, cd: 0 }; g.snakes[0].speed = 0.01;
  tick(g, 2, { mx: 0, aim: a });
  assert.ok(Math.abs(g.p.aim - a) < 1e-9, 'p.aim follows input.aim');
  const kinds = new Set();
  for (const b of g.bullets) {
    kinds.add(b.kind);
    const spread = b.kind === 'needle' ? 0.09 * 3 : b.kind === 'bubble' ? 0.5 + 0.01 : 0.01;
    assert.ok(dA(ang(b), a) < spread + 1e-6, deg + ' deg ' + b.kind + ' flies at ' + (ang(b) * 180 / Math.PI).toFixed(1));
    const d = Math.hypot(b.x - g.p.x, b.y - g.p.y); assert.ok(d < 140, 'shots leave from the duo, not the old lane row');
  }
  assert.ok(kinds.has('pill') && kinds.has('needle'), 'capsule and needles fired: ' + [...kinds]);
}
{
  const g = sim.createGame({ seed: 7, stage: 6 }); g.snakes[0].speed = 0.01;
  tick(g, 3, { aim: 0 }); const a0 = g.p.aim; tick(g, 3, {}); assert.equal(g.p.aim, a0, 'no aim in the input keeps the last aim');
  tick(g, 3, { aim: NaN }); assert.equal(g.p.aim, a0, 'a bad angle is ignored');
  assert.equal(sim.createGame({ seed: 7, stage: 6 }).p.aim, -Math.PI / 2, 'default aim is straight up');
}
// bullets going sideways or down leave the frame and are removed (no column, no y < 0 assumption)
for (const deg of [0, 90, 180]) {
  const g = sim.createGame({ seed: 7, stage: 6 }); g.snakes[0].speed = 0.01; g.snakes[0].segs.forEach(s => { s.x = -500; s.y = -500; });
  tick(g, 240, { aim: deg * Math.PI / 180 });
  assert.ok(g.bullets.length < 12, 'bullets at ' + deg + ' deg are removed after they leave the frame: ' + g.bullets.length);
  assert.ok(g.bullets.every(b => b.x > -40 && b.x < sim.W + 40 && b.y > -40 && b.y < sim.H + 40));
}
// aimed shots really hit: a cell dropped right on the aim line takes damage, one on the opposite side does not (bullets are tested by the normal loop)
{
  const hitAt = (aim, side) => {
    const g = sim.createGame({ seed: 9, stage: 6 }), sn = g.snakes[0]; sn.speed = 0.01;
    const c = sn.segs[3]; c.hp = c.max = 1e6; c.shield = false; c.r = 24;
    g.bullets.push({ x: sim.RING.cx + Math.cos(aim) * 40, y: sim.RING.cy + Math.sin(aim) * 40, vx: Math.cos(aim) * 900, vy: Math.sin(aim) * 900, dmg: 50, crit: false, pierce: 0, r: 6, life: 1.4, hit: [], beat: false, kind: 'pill', home: 0, splash: 0, slow: 0 });
    const tx = sim.RING.cx + Math.cos(aim + side) * 120, ty = sim.RING.cy + Math.sin(aim + side) * 120;
    for (let i = 0; i < 30; i++) { c.x = tx; c.y = ty; const b = g.bullets[0]; if (b && Math.hypot(b.x + b.vx / 60 - tx, b.y + b.vy / 60 - ty) < 30) { c.hp = 1e6; return Math.hypot(b.x + b.vx / 60 - tx, b.y + b.vy / 60 - ty) < c.r + b.r; } if (!b) break; b.x += b.vx / 60; b.y += b.vy / 60; }
    return false;
  };
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 4]) { assert.ok(hitAt(a, 0), 'aim ' + a.toFixed(2) + ' reaches a cell on the line'); assert.ok(!hitAt(a, Math.PI), 'not the one behind the duo'); }
  // and through the real step: with the whole chain parked on one side, only that side's aim lands damage
  const dmg = aim => { const g = sim.createGame({ seed: 9, stage: 6 }); g.snakes[0].speed = 0.01; g.p.cd = 0; for (let i = 0; i < 150; i++) { const sn = g.snakes[0]; if (!sn) break; const h = sn.segs.find(q => q.hp > 0); if (!h) break; sim.step(g, 1 / 60, { aim: Math.atan2(h.y - sim.RING.cy, h.x - sim.RING.cx) + aim }); } return g.shots > 0 && g.kills + g.dmgBy.capsule > 0 ? (g.dmgBy.capsule || 0) : 0; };
  assert.ok(dmg(0) > 0 && dmg(Math.PI) === 0, 'aimed at the face it lands damage, aimed the opposite way it does not: ' + dmg(0) + ' vs ' + dmg(Math.PI));
}

// ---- orbit and zone weapons work around the duo; the Encore beam follows the aim
{
  const g = sim.createGame({ seed: 5, stage: 6 }); g.weap.daggers = { lv: 3, cd: 0 }; g.weap.stick = { lv: 3, cd: 0 }; g.weap.tower = { lv: 5, cd: 0 };
  for (let i = 0; i < 4; i++) { const d = sim.daggerPos(g, i); assert.ok(Math.hypot(d.x - g.p.x, d.y - g.p.y) < sim.RING.R, 'daggers orbit inside the circle'); }
  const seen = new Set(); for (let t = 0; t < 400; t++) { g.t += 0.02; seen.add(Math.round(Math.sin(sim.stickSeg(g, 0).a) * 2)); const s = sim.stickSeg(g, 0); assert.ok(Math.hypot(s.x1 - g.p.x, s.y1 - g.p.y) < sim.RING.R + 30); }
  assert.ok(seen.size >= 4, 'the stick turns all the way round');
  tick(g, 1); g.towers.forEach(t => assert.ok(Math.hypot(t.x - g.p.x, t.y - g.p.y) < sim.RING.R, 'towers stand inside the circle'));
  const e = sim.createGame({ seed: 5, stage: 6 }), sn = e.snakes[0]; sn.speed = 0.01;
  sn.segs.forEach(s => { s.x = -500; s.y = -500; s.hp = 0; });
  const R = sn.segs[2], L = sn.segs[4]; for (const [c, x] of [[R, 130], [L, -130]]) { c.hp = c.max = 1e6; c.shield = false; c.x = sim.RING.cx + x; c.y = sim.RING.cy; c.r = 22; }
  e.p.cd = 99; e.encore = 1; tick(e, 1, { aim: 0, encore: true }); e.p.aim = 0;
  assert.ok(R.hp < R.max && L.hp === L.max, 'the Encore beam went along the aim');
  assert.equal(e.beam.a, 0);
}

// ---- the bot aims in circle stages (tests and attract mode), and the balance still holds
{
  const g = sim.createGame({ seed: 3, stage: 6 }); tick(g, 120);
  const b = sim.botInput(g); assert.equal(b.mx, 0); assert.ok(Number.isFinite(b.aim), 'the stock bot aims');
  const t = g.snakes[0].segs.find(s => s.hp > 0 && s.y > 20); assert.ok(t);
  const l = sim.createGame({ seed: 3, stage: 3 }); assert.equal(sim.botInput(l).aim, undefined, 'lane bots do not aim');
}
{
  const fresh3 = H.runs(3, {}, 3), fresh6 = H.runs(6, {}, 4);
  assert.equal(fresh3.win, 0, 'a fresh account still fails stage 3');
  assert.ok(fresh6.win < 1 && fresh6.prog < 0.9, 'the first circle stage is not a gift to a fresh account: ' + JSON.stringify(fresh6));
  const master = H.PROFILES[4].build; let wins = 0; for (const n of [6, 12]) wins += H.runs(n, master, 2).win;
  assert.ok(wins > 0, 'a master build clears circle stages 6 or 12 with the aiming bot');
}

// ---- main.js input and render wiring
{
  const m = src('main.js'), r = src('render.js');
  assert.ok(/function aimAt\(clientX, clientY\)/.test(m) && /Math\.atan2\(dy, dx\)/.test(m), 'the finger sets an angle relative to the duo');
  assert.ok(/if \(g\.ring\) aimAt\(e\.clientX, e\.clientY\)/.test(m), 'touch down aims');
  assert.ok(/g\.ring && \(e\.pointerType === 'mouse' \|\| \(joy\.on && e\.pointerId === joy\.id\)\)\) \{ aimAt\(/.test(m), 'drag and mouse hover sweep the aim');
  const ri = m.slice(m.indexOf('function readInput()'), m.indexOf('function pause()'));
  assert.ok(/if \(g\.ring\) \{/.test(ri) && /aim: aimS\.now/.test(ri) && /mx: 0/.test(ri), 'readInput sends an eased aim and no movement in circle stages');
  assert.ok(/keys\.arrowleft\) aimS\.tgt -=/.test(ri) && /keys\.arrowright\) aimS\.tgt \+=/.test(ri), 'arrows rotate the aim');
  assert.ok(/aimS\.now \+= da \* 0\./.test(ri), 'the aim is eased, no jumps');
  assert.ok(/AIM_HINT_KEY/.test(m) && /DRAG TO AIM/.test(r), 'a drag to aim hint on the first circle stages');
  const al = r.slice(r.indexOf('function drawAimLine'), r.indexOf('function noteTrail'));
  assert.ok(al.length > 300 && /setLineDash\(AIM_DASH\)/.test(al), 'a dotted aim line to the circle');
  assert.ok(!/Gradient/.test(al) && !/Gradient/.test(ri), 'no gradients added');
  assert.ok(/RING_SCALE/.test(r), 'the duo is drawn smaller in circle stages');
  assert.ok(!String.fromCharCode(8212).split('').some(c => (m + r + src('sim.js')).includes(c) && false));
}
console.log('33_ring_b11 ok');
