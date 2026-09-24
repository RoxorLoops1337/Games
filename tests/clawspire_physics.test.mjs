// Clawspire physics suite: engine sanity, cabinet containment, and the claw
// rig's grab feel (strong grip lifts, weak grip slips, swords are awkward).
// Run: node tests/clawspire_physics.test.mjs
import { boot, harness } from './clawspire_lib.mjs';

const h = harness('clawspire physics');
const { U, PHYS } = boot({ only: ['util', 'physics'] });
const DT = 1 / 60;

/* Fresh world + cabinet at the bible's sizes. */
function mkWorld() {
  const W = PHYS.world({ gravity: { x: 0, y: 1400 }, w: 480, h: 390 });
  const C = PHYS.cabinet(W, { w: 480, h: 390, chuteW: 64, dividerH: 0.6, wallThick: 40 });
  return { W, C };
}

const ITEM = {
  ball: (o) => ({ shape: { kind: 'circle', r: 15 }, ...o }),
  box: (o) => ({ shape: { kind: 'poly', verts: PHYS.box(28, 28) }, ...o }),
  sword: (o) => ({ shape: { kind: 'poly', verts: PHYS.box(44, 10) }, ...o }),
  heavy: (o) => ({ shape: { kind: 'poly', verts: PHYS.box(50, 50) }, density: 2.4, ...o }),
};

function spawn(W, def, x, y, extra) {
  const b = PHYS.body(Object.assign({ type: 'dynamic', x, y, group: 'item', friction: 0.5, restitution: 0.1, data: {} }, def, extra || {}));
  W.add(b);
  return b;
}

const items = (W) => W.bodies.filter(b => b.type === 'dynamic' && b.group === 'item');
const maxSpeed = (W) => items(W).reduce((m, b) => Math.max(m, Math.hypot(b.vx, b.vy)), 0);
const anyNaN = (W) => W.bodies.some(b => !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.a) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy) || !Number.isFinite(b.av));
const inside = (W, C, tol) => { tol = tol || 1; return items(W).every(b => b.x > -tol && b.x < C.bounds.w + tol && b.y > -tol && b.y < C.bounds.h + tol); };

/* A pile of 30 mixed items dropped in a grid above the floor. */
function pile(W, rng) {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const kind = i === 0 ? 'sword' : i === 1 ? 'heavy' : ['ball', 'box', 'ball', 'box', 'sword'][i % 5];
    const x = 40 + (i % 8) * 46 + rng() * 6, y = 40 + Math.floor(i / 8) * 60 + rng() * 10;
    out.push(spawn(W, ITEM[kind]({}), x, y, { angle: rng() * 6.28 }));
  }
  return out;
}

function settle(W, seconds) { for (let i = 0; i < Math.round(seconds / DT); i++) W.step(DT); }

/* Drive one full grab at x; returns {delivered, events, phases, seconds}. */
function grab(W, C, R, x, cap) {
  const events = [], phases = [R.phase];
  R.setTarget(x);
  let t = 0;
  while (!R.calm()) {   // let the carriage arrive and the cable settle first
    events.push(...R.update(DT)); W.step(DT); t += DT;
    if (t > 4) break;
  }
  h.ok(R.drop(), 'drop accepted while idle');
  let started = false;
  while (t < (cap || 15)) {
    const ev = R.update(DT);
    events.push(...ev);
    W.step(DT); t += DT;
    if (phases[phases.length - 1] !== R.phase) phases.push(R.phase);
    if (R.phase !== 'idle' && R.phase !== 'moving') started = true;
    if (started && R.phase === 'idle') break;
  }
  const delivered = items(W).filter(b => C.inChute(b));
  for (const b of delivered) W.remove(b);
  return { delivered: delivered.length, events, phases, seconds: t };
}

/* n single-item grabs at varied x, fresh world each time; returns the delivered
   count.  aimErr (px, cycled per drop) offsets the claw from the item so long
   thin items, whose tips must land outside their ends, show their aim tolerance. */
function scenario(rigCfg, def, n, seed, aimErr) {
  let ok = 0;
  const xs = [90, 130, 170, 210, 250, 290, 330, 110, 190, 270];
  const errs = aimErr || [0];
  for (let i = 0; i < n; i++) {
    const { W, C } = mkWorld();
    const x = xs[i % xs.length];
    const b = spawn(W, def, x, 300, {});
    settle(W, 1.0);
    const R = PHYS.clawRig(W, Object.assign({ cabinet: C, rand: U.rng(seed + i) }, rigCfg));
    const g = grab(W, C, R, b.x + errs[i % errs.length]);
    ok += g.delivered;
    h.ok(g.phases[g.phases.length - 1] === 'idle', `grab returned to idle (${JSON.stringify(rigCfg)} #${i}: ${g.phases.join('>')})`);
  }
  return ok;
}

// ---------------------------------------------------------------- engine
h.test('box verts and body mass', () => {
  const v = PHYS.box(10, 20);
  h.eq(v.length, 4, 'box has 4 verts');
  const b = PHYS.body({ shape: { kind: 'poly', verts: v }, density: 2 });
  h.near(b.m, 400, 1e-6, 'box mass = density * area');
  h.ok(b.I > 0 && b.invI > 0, 'box inertia positive');
  const c = PHYS.body({ shape: { kind: 'circle', r: 10 } });
  h.near(c.m, Math.PI * 100, 1e-6, 'circle mass');
  const s = PHYS.body({ type: 'static', shape: { kind: 'circle', r: 10 } });
  h.eq(s.invM, 0, 'static has no inverse mass');
  const cw = PHYS.body({ shape: { kind: 'poly', verts: v.slice().reverse() } });
  h.near(cw.m, 200, 1e-6, 'clockwise input is fixed up');
  const ab = b.aabb();
  h.ok(ab.x0 === -5 && ab.x1 === 5 && ab.y0 === -10 && ab.y1 === 10, 'aabb of a box');
});

h.test('ball falls and rests on the floor', () => {
  const { W, C } = mkWorld();
  const b = spawn(W, ITEM.ball({}), 200, 100, {});
  settle(W, 2);
  h.near(b.y, 390 - 15, 1.2, 'ball rests on the floor surface');
  h.ok(Math.abs(b.vy) < 2, 'ball at rest');
  const cs = W.contactsOf(b);
  h.ok(cs.length >= 1 && cs.some(c => c.other.data.wall === 'floor'), 'contactsOf finds the floor');
  h.ok(cs[0].ny > 0.99, 'contact normal points from the ball into the floor');
  h.ok(Math.abs(cs[0].py - 390) < 1.5, 'contact point near the floor surface');
  h.ok(W.queryAABB(190, 360, 210, 400).includes(b), 'queryAABB finds the ball');
  h.ok(!W.queryAABB(0, 0, 50, 50).includes(b), 'queryAABB excludes far bodies');
});

h.test('friction: a box on a slope holds, a box on ice slides', () => {
  const W = PHYS.world({ gravity: { x: 0, y: 1400 }, w: 480, h: 390 });
  const ang = 0.25;
  const slope = W.add(PHYS.body({ type: 'static', shape: { kind: 'poly', verts: PHYS.box(600, 40) }, x: 240, y: 300, angle: ang, friction: 0.8 }));
  const a = spawn(W, ITEM.box({ friction: 0.8 }), 240, 300 - 20 - 16, { angle: ang });
  settle(W, 1.5);
  const ax = a.x;
  settle(W, 1.5);
  h.ok(Math.abs(a.x - ax) < 2, 'rough box stays put on a 14 degree slope');
  slope.friction = 0.0;
  const c = spawn(W, ITEM.box({ friction: 0.0 }), 240, 300 - 20 - 16, { angle: ang });
  settle(W, 1.5);
  h.ok(c.x > 260, 'frictionless box slides down the slope');
});

h.test('restitution: bouncy ball bounces, dead ball does not', () => {
  const { W } = mkWorld();
  const live = spawn(W, ITEM.ball({ restitution: 0.8 }), 100, 200, {});
  const dead = spawn(W, ITEM.ball({ restitution: 0.0 }), 300, 200, {});
  let liveMin = 999, deadMin = 999, hitLive = false, hitDead = false;
  for (let i = 0; i < 180; i++) {
    W.step(DT);
    if (live.vy < 0) hitLive = true; if (dead.vy < 0) hitDead = true;
    if (hitLive) liveMin = Math.min(liveMin, live.y);
    if (hitDead) deadMin = Math.min(deadMin, dead.y);
  }
  h.ok(hitLive && liveMin < 330, 'bouncy ball rebounds well above the floor');
  h.ok(!hitDead || deadMin > 360, 'dead ball barely rebounds');
});

h.test('pile of 30 mixed items settles without NaN or escapes', () => {
  const { W, C } = mkWorld();
  const rng = U.rng(7);
  pile(W, rng);
  settle(W, 3);
  h.ok(!anyNaN(W), 'no NaN after settling');
  h.ok(inside(W, C), 'nothing outside the cabinet');
  h.ok(maxSpeed(W) < 2, `max speed after 3 s < 2 px/s (${maxSpeed(W).toFixed(2)})`);
  h.ok(W.energy() < 5000, `energy small (${W.energy().toFixed(0)})`);
  h.ok(items(W).every(b => b.y < 390), 'every item above the floor');
  settle(W, 2);
  h.ok(maxSpeed(W) < 2, `still at rest after 5 s (${maxSpeed(W).toFixed(2)})`);
});

h.test('60 s of random shaking: nothing escapes the cabinet', () => {
  const { W, C } = mkWorld();
  const rng = U.rng(11);
  pile(W, rng);
  settle(W, 2);
  let escaped = false, nan = false;
  for (let s = 0; s < 60; s++) {
    for (const b of items(W)) {
      b.vx += (rng() - 0.5) * 2400; b.vy += (rng() - 0.9) * 1800; b.av += (rng() - 0.5) * 30;
    }
    if (s % 7 === 3) W.setGravity((rng() - 0.5) * 800, 1400); else W.setGravity(0, 1400);
    for (let i = 0; i < 60; i++) {
      W.step(DT);
      // A light item crushed against a wall by a heavy one may sink a few px
      // into the 40 px wall for a frame; it must never get through it.
      if (!inside(W, C, 12)) escaped = true;
      if (anyNaN(W)) nan = true;
    }
  }
  h.ok(!escaped, 'no item left the cabinet during shaking');
  h.ok(!nan, 'no NaN during shaking');
  W.setGravity(0, 1400);
  settle(W, 4);
  h.ok(inside(W, C, 1), 'everything back inside the interior after the shaking');
  h.ok(maxSpeed(W) < 3, `pile settles again after shaking (${maxSpeed(W).toFixed(2)})`);
});

h.test('W.step clamps dt and runs at most 12 substeps', () => {
  const { W } = mkWorld();
  const b = spawn(W, ITEM.ball({}), 200, 100, {});
  W.step(10);
  h.ok(b.y < 100 + 0.5 * 1400 * 0.06 * 0.06 + 1, 'a huge dt only advances 12 substeps');
  W.step(-1); W.step(NaN);
  h.ok(!anyNaN(W), 'bad dt ignored');
});

h.test('revolute limits and motor hold', () => {
  const W = PHYS.world({ gravity: { x: 0, y: 1400 }, w: 480, h: 390 });
  const base = W.add(PHYS.body({ type: 'static', shape: { kind: 'circle', r: 4 }, x: 200, y: 100 }));
  const arm = W.add(PHYS.body({ shape: { kind: 'poly', verts: [{ x: -4, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 60 }, { x: -4, y: 60 }] }, x: 200, y: 100, group: 'item' }));
  const J = W.add(PHYS.revolute(base, arm, { x: 200, y: 100 }, { lower: -0.5, upper: 0.5, enableLimit: true }));
  arm.av = 30;
  settle(W, 1);
  h.ok(J.angle() <= 0.5 + 0.03 && J.angle() >= -0.5 - 0.03, `limit holds the arm (${J.angle().toFixed(3)})`);
  h.near(arm.origin().x, 200, 0.5, 'anchor stays pinned x');
  h.near(arm.origin().y, 100, 0.5, 'anchor stays pinned y');
  h.ok(arm.y > 100, 'body position is the centre of mass, below the hinge');
  J.setLimits(-3, 3);
  J.setMotor(4, 1e9);
  settle(W, 0.5);
  h.ok(Math.abs(arm.av - 4) < 0.3, `motor drives the arm at its speed (${arm.av.toFixed(2)})`);
  J.setMotor(0, 1e9);
  settle(W, 0.5);
  h.ok(Math.abs(arm.av) < 0.05, 'motor at speed 0 holds the arm against gravity');
  const before = J.angle();
  settle(W, 1);
  h.ok(Math.abs(J.angle() - before) < 0.02, 'strong motor holds position');
  J.setMotor(0, 10);
  settle(W, 1);
  h.ok(Math.abs(arm.av) > 0.5 || Math.abs(J.angle() - before) > 0.2, 'weak motor cannot hold the arm up');
  h.ok(W.joints.includes(J), 'joint listed');
  W.remove(arm);
  h.ok(!W.joints.includes(J), 'removing a body removes its joints');
});

h.test('kinematic body pushes dynamic items', () => {
  const { W } = mkWorld();
  const ball = spawn(W, ITEM.ball({}), 200, 375, {});
  const pusher = W.add(PHYS.body({ type: 'kinematic', shape: { kind: 'poly', verts: PHYS.box(20, 60) }, x: 150, y: 360, group: 'claw', mask: ['item'] }));
  pusher.vx = 120;
  settle(W, 1);
  h.ok(ball.x > 290, `ball was shoved along (${ball.x.toFixed(0)})`);
  h.near(pusher.x, 270, 1, 'kinematic body kept its velocity');
});

h.test('groups and masks filter collisions', () => {
  const { W } = mkWorld();
  const ghost = spawn(W, ITEM.ball({}), 200, 300, { group: 'ghost', mask: ['nothing'] });
  settle(W, 1.5);
  h.ok(ghost.y > 500, 'a body whose mask excludes walls falls through the floor');
  const s = spawn(W, ITEM.ball({}), 300, 300, { sensor: true, data: { s: 1 } });
  const t = spawn(W, ITEM.ball({}), 300, 340, {});
  settle(W, 0.5);
  h.ok(W.contactsOf(t).some(c => c.other === s) || s.y > 380, 'sensors report contacts without pushing');
});

// ---------------------------------------------------------------- rig
h.test('rig phase machine: full cycle with events in order, never stalls', () => {
  const { W, C } = mkWorld();
  const b = spawn(W, ITEM.ball({}), 200, 300, {});
  settle(W, 1);
  const R = PHYS.clawRig(W, { cabinet: C, grip: 2, rand: U.rng(3) });
  h.eq(R.phase, 'idle', 'starts idle');
  h.ok(R.bodies.carriage && R.bodies.palm && R.bodies.prongs.length === 2, 'bodies exposed');
  h.ok(typeof R.cableTop.x === 'number' && typeof R.sway === 'number', 'cableTop and sway exposed');
  const g = grab(W, C, R, 200, 15);
  const want = ['idle', 'moving', 'dropping', 'closing', 'lifting', 'carrying', 'releasing', 'returning', 'idle'];
  const ph = g.phases.filter((p, i) => i === 0 || p !== g.phases[i - 1]);
  h.eq(ph.slice(ph.indexOf('dropping') - 0).join('>'), want.slice(2).join('>'), 'phases in order');
  const ev = g.events.filter(e => e !== 'move');
  h.eq(ev.join(','), 'drop,touch,close,lift,carry,release,home', 'events in order');
  h.ok(g.seconds < 12, `cycle finished in ${g.seconds.toFixed(1)} s`);
  h.eq(g.delivered, 1, 'the ball landed in the chute');
});

h.test('setTarget and drop are ignored while busy', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(4) });
  h.ok(R.setTarget(150), 'setTarget honoured while idle');
  h.near(R.targetX, 150, 1e-9, 'targetX set');
  h.ok(R.setTarget(-500) && R.targetX > 30, 'target clamped inside the cabinet');
  R.setTarget(150);
  h.ok(R.drop(), 'drop honoured while moving');
  h.eq(R.phase, 'dropping', 'now dropping');
  h.ok(!R.drop(), 'second drop refused');
  h.ok(!R.setTarget(300), 'setTarget refused while dropping');
  h.near(R.targetX, 150, 1e-9, 'targetX unchanged');
  let t = 0;
  while (R.phase !== 'idle' && t < 15) { R.update(DT); W.step(DT); t += DT; }
  h.ok(R.phase === 'idle', 'empty grab still completes');
  h.ok(!R.drop() === false, 'drop honoured again when idle');
});

h.test('every phase has a max duration (rig never stalls even when wedged)', () => {
  const { W, C } = mkWorld();
  // A huge immovable block right under the home position wedges the prongs.
  W.add(PHYS.body({ type: 'static', shape: { kind: 'poly', verts: PHYS.box(200, 200) }, x: 240, y: 290, group: 'item' }));
  const R = PHYS.clawRig(W, { cabinet: C, grip: 2, rand: U.rng(5) });
  R.drop();
  let t = 0;
  const seen = new Set();
  while (R.phase !== 'idle' && t < 20) { R.update(DT); W.step(DT); t += DT; seen.add(R.phase); }
  h.ok(R.phase === 'idle', `returns to idle even when blocked (${[...seen].join('>')}, ${t.toFixed(1)} s)`);
});

h.test('prongs are torque limited: a fat item stops them early, they close past a thin one', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, grip: 1, rand: U.rng(6) });
  const fat = spawn(W, ITEM.box({}), 240, 320, {});
  settle(W, 1);
  R.drop();
  let t = 0;
  while (R.phase !== 'carrying' && t < 10) { R.update(DT); W.step(DT); t += DT; }
  const angFat = R.joints.filter(j => !j.isWeld).map(j => j.dir * j.angle());
  h.ok(angFat.every(a => a > R.geo.closed + 0.1), `fat box stops the prongs early (${angFat.map(a => a.toFixed(2)).join(',')})`);
  h.ok(R.held().includes(fat), 'held() reports the pinched box');
  while (R.phase !== 'idle' && t < 20) { R.update(DT); W.step(DT); t += DT; }
  const { W: W2, C: C2 } = mkWorld();
  const R2 = PHYS.clawRig(W2, { cabinet: C2, grip: 1, rand: U.rng(6) });
  R2.drop();
  t = 0;
  while (R2.phase !== 'carrying' && t < 10) { R2.update(DT); W2.step(DT); t += DT; }
  const angEmpty = R2.joints.filter(j => !j.isWeld).map(j => j.dir * j.angle());
  h.ok(angEmpty.every(a => a < R2.geo.closed + 0.08), `prongs close fully on nothing (${angEmpty.map(a => a.toFixed(2)).join(',')})`);
  h.eq(R2.held().length, 0, 'held() empty when nothing is pinched');
});

h.test('strong grip delivers a 30px ball from the floor at least 9/10', () => {
  const n = scenario({ grip: 2 }, ITEM.ball({}), 10, 100);
  h.ok(n >= 9, `strong rig delivered ${n}/10 balls`);
});

h.test('weak grip drops a heavy 50px box more often than not', () => {
  const n = scenario({ grip: 0.6 }, ITEM.heavy({}), 10, 200);
  h.ok(n < 5, `weak rig delivered only ${n}/10 heavy boxes`);
});

h.test('sword is delivered less often than the ball with the same rig', () => {
  // Same rigs, same aim errors (up to 18 px): the prong tips straddle a 30 px
  // ball with room to spare but must land outside the ends of a 44 px sword.
  const AIM = [-18, -9, 0, 9, 18];
  const ball = scenario({ grip: 1 }, ITEM.ball({}), 10, 300, AIM) + scenario({ grip: 0.8 }, ITEM.ball({}), 10, 300, AIM);
  const sword = scenario({ grip: 1 }, ITEM.sword({}), 10, 300, AIM) + scenario({ grip: 0.8 }, ITEM.sword({}), 10, 300, AIM);
  h.ok(sword < ball, `sword ${sword}/20 < ball ${ball}/20`);
  h.ok(ball >= 17, `ball is an easy grab even with sloppy aim (${ball}/20)`);
  h.ok(sword >= 6, `sword is still grabbable with good aim (${sword}/20)`);
});

h.test('3 prongs deliver at least as often as 2 on the same scenario', () => {
  // A marginal grip on a box: the third finger's share of the pinch shows.
  const two = scenario({ grip: 0.3, prongs: 2 }, ITEM.box({}), 10, 400);
  const three = scenario({ grip: 0.3, prongs: 3 }, ITEM.box({}), 10, 400);
  h.ok(three >= two, `3 prongs ${three}/10 >= 2 prongs ${two}/10`);
  h.ok(three >= 5, `3-prong rig grabs most boxes at grip 0.3 (${three}/10)`);
  h.ok(two <= 9, `2-prong rig is marginal at grip 0.3 (${two}/10), so the comparison means something`);
  const twoBall = scenario({ grip: 2, prongs: 2 }, ITEM.ball({}), 10, 410);
  const threeBall = scenario({ grip: 2, prongs: 3 }, ITEM.ball({}), 10, 410);
  h.ok(threeBall >= twoBall - 1, `3 prongs do not hurt a strong ball grab (${threeBall} vs ${twoBall})`);
});

h.test('setConfig rebuilds prongs and rubber raises tip friction', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(8) });
  const f0 = R.bodies.prongs[0].friction;
  R.setConfig({ prongs: 3, rubber: 1, width: 1.36, grip: 1.7, speed: 1.3, magnet: 1 });
  h.eq(R.bodies.prongs.length, 3, 'three prongs after setConfig');
  h.eq(R.bodies.tips.length, 2, 'two hooked tips after setConfig');
  h.ok(R.bodies.prongs[0].friction > f0, 'rubber tips are grippier');
  h.ok(R.cfg.grip === 1.7 && R.cfg.speed === 1.3 && R.cfg.magnet === 1, 'scalar config applied');
  h.eq(W.bodies.filter(b => b.group === 'claw').length, 7, 'old claw bodies were removed (carriage, palm, 3 prongs, 2 tips)');
  R.drop();
  let t = 0;
  while (R.phase !== 'idle' && t < 15) { R.update(DT); W.step(DT); t += DT; }
  h.eq(R.phase, 'idle', 'rebuilt rig completes a cycle');
  R.destroy();
  h.eq(W.bodies.filter(b => b.group === 'claw').length, 0, 'destroy removes the rig');
});

h.test('magnet pulls metal toward the palm while dropping', () => {
  const run = (magnet) => {
    const { W, C } = mkWorld();
    const b = spawn(W, ITEM.ball({}), 266, 370, { data: { tags: ['metal'] } });
    settle(W, 0.5);
    const R = PHYS.clawRig(W, { cabinet: C, magnet, rand: U.rng(9) });
    R.setTarget(200);
    let t = 0;
    while (!R.calm() && t < 4) { R.update(DT); W.step(DT); t += DT; }
    R.drop();
    while (R.phase !== 'lifting' && t < 10) { R.update(DT); W.step(DT); t += DT; }
    return b.x;
  };
  const off = run(0), on = run(1);
  h.ok(on < off - 3, `magnet moved the ball toward the palm (${on.toFixed(1)} vs ${off.toFixed(1)})`);
});

h.test('determinism: two worlds with the same inputs match after 5 s', () => {
  const run = () => {
    const { W, C } = mkWorld();
    pile(W, U.rng(21));
    const R = PHYS.clawRig(W, { cabinet: C, grip: 1.3, rand: U.rng(22) });
    settle(W, 1);
    R.setTarget(180);
    for (let i = 0; i < 300; i++) {
      if (i === 40) R.drop();
      R.update(DT); W.step(DT);
    }
    return items(W).map(b => [b.x, b.y, b.a]).flat().concat([R.x, R.y, R.sway]);
  };
  const a = run(), b = run();
  h.eq(a.length, b.length, 'same body count');
  h.ok(a.every((v, i) => v === b[i]), 'identical positions and angles');
});

h.test('carriage sways the palm and settles', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(10) });
  R.setTarget(400);
  let maxSway = 0, t = 0;
  while (t < 3) { R.update(DT); W.step(DT); t += DT; maxSway = Math.max(maxSway, Math.abs(R.sway)); }
  h.ok(maxSway > 0.02, `carriage acceleration swings the cable (${maxSway.toFixed(3)})`);
  h.ok(Math.abs(R.sway) < 0.02, `sway damps out (${R.sway.toFixed(3)})`);
  h.near(R.bodies.carriage.x, R.targetX, 3, 'carriage reached its target');
  h.eq(R.phase, 'idle', 'idle after arriving');
});

h.done();
