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
  const o = Object.assign({ type: 'dynamic', x, y, group: 'item', friction: 0.5, restitution: 0.1, data: {} }, def, extra || {});
  o.data = Object.assign({}, o.data);   // every body gets its own data (the rig stamps slips on it)
  const b = PHYS.body(o);
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

/* Drive one full grab at x; returns {delivered, events, phases, seconds,
   lockedMax (most items the lock carried at once), closingT (s spent closing)}. */
function grab(W, C, R, x, cap) {
  const events = [], phases = [R.phase];
  R.setTarget(x);
  let t = 0;
  while (!R.calm()) {   // let the carriage arrive and the cable settle first
    events.push(...R.update(DT)); W.step(DT); t += DT;
    if (t > 4) break;
  }
  h.ok(R.drop(), 'drop accepted while idle');
  let started = false, lockedMax = 0, closingT = 0;
  while (t < (cap || 15)) {
    const ev = R.update(DT);
    events.push(...ev);
    W.step(DT); t += DT;
    if (phases[phases.length - 1] !== R.phase) phases.push(R.phase);
    if (R.phase === 'closing') closingT += DT;
    if (R.phase === 'lifting' || R.phase === 'carrying') lockedMax = Math.max(lockedMax, R.locked().length);
    if (R.phase !== 'idle' && R.phase !== 'moving') started = true;
    if (started && R.phase === 'idle') break;
  }
  const delivered = items(W).filter(b => C.inChute(b));
  for (const b of delivered) W.remove(b);
  return { delivered: delivered.length, events, phases, seconds: t, lockedMax, closingT };
}

/* n single-item grabs at varied x, fresh world each time; returns the delivered
   count.  aimErr (px, cycled per drop) offsets the claw from the item so long
   thin items, whose tips must land outside their ends, show their aim tolerance.
   stats (optional object) accumulates .slips. */
function scenario(rigCfg, def, n, seed, aimErr, stats) {
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
    if (stats) stats.slips = (stats.slips || 0) + g.events.filter(e => e === 'slip').length;
    h.ok(g.phases[g.phases.length - 1] === 'idle', `grab returned to idle (${JSON.stringify(rigCfg)} #${i}: ${g.phases.join('>')})`);
  }
  return ok;
}

/* n grabs at a row of balls (offsets from the aim point), fresh world each
   time; returns {delivered (items), twoPlus (drops with >= 2), lockedMax[], slips, shed}. */
function rowScenario(rigCfg, radii, offsets, n, seed) {
  const out = { delivered: 0, twoPlus: 0, lockedMax: [], slips: 0, shed: 0 };
  for (let i = 0; i < n; i++) {
    const { W, C } = mkWorld();
    const x = 120 + (i % 5) * 40;
    for (let k = 0; k < radii.length; k++) spawn(W, { shape: { kind: 'circle', r: radii[k] } }, x + offsets[k], 360, {});
    settle(W, 1.0);
    const R = PHYS.clawRig(W, Object.assign({ cabinet: C, rand: U.rng(seed + i) }, rigCfg));
    const g = grab(W, C, R, x);
    out.delivered += g.delivered; if (g.delivered >= 2) out.twoPlus++;
    out.lockedMax.push(g.lockedMax);
    out.slips += g.events.filter(e => e === 'slip').length;
    out.shed += g.events.filter(e => e === 'shed').length;
  }
  return out;
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
  h.ok(g.closingT >= PHYS.RIG.quietT + PHYS.RIG.settleT - 0.02, `the claw clenches for the settle before lifting (closing ${g.closingT.toFixed(2)} s)`);
  h.ok(g.closingT <= PHYS.RIG.closeMax + PHYS.RIG.settleT + 0.05, 'closing is bounded');
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

h.test('slips are rare for ordinary items: ball and sword both deliver at grip 1, junk slips', () => {
  // Same rig, same aim errors (up to 18 px). The cradle scoops a 44 px sword
  // as readily as a ball; its thin-item hazard (grippiness 0.85) is small.
  const AIM = [-18, -9, 0, 9, 18];
  const bs = {}, ss = {}, js = {};
  const ball = scenario({ grip: 1 }, ITEM.ball({}), 20, 300, AIM, bs);
  const sword = scenario({ grip: 1 }, ITEM.sword({}), 20, 300, AIM, ss);
  h.ok(ball >= 18, `ball is an easy grab even with sloppy aim (${ball}/20)`);
  h.eq(bs.slips, 0, 'a ball never slips at grip 1');
  h.ok(sword >= 17, `sword delivers at least 17/20 at grip 1 (${sword}/20, ${ss.slips} slips)`);
  // Junk is the exception: a slick junk block (ice block) has a real hazard.
  const ice = { shape: { kind: 'poly', verts: PHYS.box(36, 34) }, density: 1.2, friction: 0.05, data: { tags: ['junk', 'glass'] } };
  const iceN = scenario({ grip: 1 }, ice, 20, 300, [0], js);
  h.ok(js.slips >= 2, `slick junk slips more than a ball (${js.slips} slips over 20 grabs, ${iceN} delivered)`);
  h.ok(iceN >= 10, `but is still worth digging for (${iceN}/20)`);
});

h.test('cradle: two r=12 balls side by side are both locked and delivered', () => {
  const r = rowScenario({}, [12, 12], [-12.5, 12.5], 10, 600);
  const both = r.lockedMax.filter(n => n >= 2).length;
  h.ok(both >= 7, `both balls locked in ${both}/10 grabs`);
  h.ok(r.twoPlus >= 7, `both delivered in ${r.twoPlus}/10 grabs (${r.delivered} items)`);
  h.ok(r.lockedMax.every(n => n <= 2), 'never more than the base capacity of 2');
});

h.test('cradle capacity: three balls -> 2 carried at base, 3 with the third prong, 3 at Wider Palm x2', () => {
  const two = rowScenario({ prongs: 2 }, [12, 12, 12], [-25, 0, 25], 10, 620);
  h.ok(two.lockedMax.every(n => n <= 2), `base rig never carries more than 2 (${two.lockedMax.join(',')})`);
  h.ok(two.lockedMax.filter(n => n === 2).length >= 8, `base rig usually carries 2 of the 3 (${two.lockedMax.join(',')})`);
  h.ok(two.shed >= 8, `the extra is shed at the lift with one 'shed' event (${two.shed} sheds)`);
  h.ok(two.slips === 0, `shedding is not a slip (${two.slips} slips)`);
  const three = rowScenario({ prongs: 3 }, [12, 12, 12], [-25, 0, 25], 10, 620);
  h.ok(three.lockedMax.filter(n => n === 3).length >= 8, `third prong carries all 3 (${three.lockedMax.join(',')})`);
  h.ok(three.delivered >= 24, `and delivers them (${three.delivered}/30 items)`);
  const wide = rowScenario({ width: 1.36 }, [12, 12, 12], [-25, 0, 25], 5, 640);
  h.ok(wide.lockedMax.some(n => n === 3), `Wider Palm x2 carries 3 (${wide.lockedMax.join(',')})`);
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(1) });
  h.eq(R.cradleCap(), 2, 'base capacity 2');
  R.setConfig({ prongs: 3 }); h.eq(R.cradleCap(), 3, 'third prong +1');
  R.setConfig({ width: 1.36 }); h.eq(R.cradleCap(), 4, 'Wider Palm x2 +1');
});

h.test('geometry: 96 px open span, hooked basket, closed claw does not self-intersect', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(2) });
  const g = R.geo;
  h.near(g.beta, 0.55, 1e-9, 'tip segment bends inward 0.55 rad');
  h.near(g.len, 53, 1e-9, 'prong length 53 at width 1');
  h.eq(g.palmW, 64, 'palm 64 wide');
  const tips = R.bodies.tips;
  const span = Math.max(...tips.map(t => t.box.x1)) - Math.min(...tips.map(t => t.box.x0));
  h.ok(span >= 92 && span <= 106, `open tips span about 96 px (${span.toFixed(1)})`);
  // Close on nothing: no part of the left finger may overlap the right one.
  R.drop();
  let t = 0;
  while (R.phase !== 'lifting' && t < 5) { R.update(DT); W.step(DT); t += DT; }
  const parts = R.bodies.prongs.filter(p => !p.ghost).concat(tips);
  const L = parts.filter(p => p.data.dir === 1), Rt = parts.filter(p => p.data.dir === -1);
  let minSep = Infinity;
  for (const a of L) for (const b of Rt) for (const v of a.wv) {
    let best = -Infinity;
    for (let i = 0; i < b.wv.length; i++) { const s = (v.x - b.wv[i].x) * b.wn[i].x + (v.y - b.wv[i].y) * b.wn[i].y; if (s > best) best = s; }
    minSep = Math.min(minSep, best);
  }
  h.ok(minSep >= 0, `closed fingers do not overlap (min separation ${minSep.toFixed(2)} px)`);
  const tipY = Math.max(...tips.map(t => t.box.y1));
  h.ok(tipY > R.bodies.palm.y + 40, 'closed hooks hang well below the palm (a basket, not a pinch)');
  // The cradle polygon is exposed for tests and debug drawing.
  const poly = R.cradle();
  h.eq(poly.length, 4, 'cradle polygon has 4 corners');
  h.ok(poly[0].x < poly[3].x && poly[1].y > poly[0].y, 'hinges on top, tips below');
});

h.test('3 prongs deliver at least as often as 2 on the same scenario', () => {
  // The third finger raises the grip lock's break force, so it shows on a
  // box whose weight sits right at the two-prong rig's limit.
  const HEAVYISH = { shape: { kind: 'poly', verts: PHYS.box(40, 40) }, density: 1.85 };   // mass 2960: right at the two-prong rig's limit
  let two = 0, three = 0;
  for (const g of [0.9, 1.1]) {
    two += scenario({ grip: g, prongs: 2 }, HEAVYISH, 10, 400);
    three += scenario({ grip: g, prongs: 3 }, HEAVYISH, 10, 400);
  }
  h.ok(three >= two, `3-prong rig (${three}/20) >= 2-prong rig (${two}/20) on a heavy-ish box`);
  h.ok(two <= 18, `2-prong rig is marginal on it (${two}/20), so the comparison means something`);
  const twoBall = scenario({ grip: 2, prongs: 2 }, ITEM.ball({}), 10, 500);
  const threeBall = scenario({ grip: 2, prongs: 3 }, ITEM.ball({}), 10, 500);
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
  h.eq(W.bodies.filter(b => b.group === 'claw').length, 6, 'old claw bodies were removed (carriage, palm, 2 side prongs, 2 tips; the third prong is a drawn ghost)');
  h.ok(R.bodies.prongs[2].ghost && W.bodies.indexOf(R.bodies.prongs[2]) < 0, 'the third prong is a ghost outside the world');
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
