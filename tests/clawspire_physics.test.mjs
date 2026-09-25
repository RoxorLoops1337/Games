// Clawspire physics suite: the Claw Crawl engine port. Parts and mass,
// settling and sleeping, containment, the claw's phase machine and halt
// detection, delivery statistics from a flat floor, grip-driven loosen and
// jolt, determinism, setConfig, the magnet and grease.
// Run: node tests/clawspire_physics.test.mjs
import { boot, harness } from './clawspire_lib.mjs';

const h = harness('clawspire physics');
const { U, PHYS } = boot({ only: ['util', 'physics'] });
const DT = 1 / 60;
const G = 1150;

/* Fresh world + cabinet at the game's sizes (chute on the right, divider at 45%). */
function mkWorld() {
  const W = PHYS.world({ gravity: { x: 0, y: G }, w: 480, h: 390 });
  const C = PHYS.cabinet(W, { w: 480, h: 390, chuteW: 64, dividerH: 0.45 });
  return { W, C };
}

const SHIELD = [{ x: -14, y: -15 }, { x: 14, y: -15 }, { x: 14, y: 3 }, { x: 0, y: 16 }, { x: -14, y: 3 }];
const FLASK = [{ x: -4, y: -15 }, { x: 4, y: -15 }, { x: 14, y: 15 }, { x: -14, y: 15 }];
const AXE = [{ x: -4, y: -28 }, { x: 6, y: -28 }, { x: 18, y: -20 }, { x: 20, y: -6 }, { x: 3, y: 28 }, { x: -3, y: 28 }];
const ITEM = {
  ball: (o) => ({ shape: { kind: 'circle', r: 15 }, ...o }),
  marble: (o) => ({ shape: { kind: 'circle', r: 9 }, ...o }),
  shield: (o) => ({ shape: { kind: 'poly', verts: SHIELD }, density: 2, ...o }),
  flask: (o) => ({ shape: { kind: 'poly', verts: FLASK }, density: 0.8, friction: 0.4, ...o }),
  sword: (o) => ({ shape: { kind: 'box', w: 48, h: 10 }, density: 1.3, friction: 0.45, ...o }),
  tower: (o) => ({ shape: { kind: 'box', w: 36, h: 50 }, density: 2.4, friction: 0.6, ...o }),
  axe: (o) => ({ shape: { kind: 'poly', verts: AXE }, density: 1.8, ...o }),
};

function spawn(W, def, x, y, extra) {
  const o = Object.assign({ type: 'dynamic', x, y, group: 'item', friction: 0.5, restitution: 0.12, data: {} }, def, extra || {});
  o.data = Object.assign({}, o.data);
  const b = PHYS.body(o);
  W.add(b);
  return b;
}
const items = (W) => W.bodies.filter(b => b.type === 'dynamic' && b.group === 'item');
const maxSpeed = (W) => items(W).reduce((m, b) => Math.max(m, Math.hypot(b.vx, b.vy)), 0);
const anyNaN = (W) => W.bodies.some(b => !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.a) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy) || !Number.isFinite(b.av));
/* Inside the glass: the bin floor at h, the hidden chute tray below it, the lid a little above 0. */
const inside = (W, C, tol) => { tol = tol || 1; return items(W).every(b => b.x > -tol && b.x < C.bounds.w + tol && b.y > -60 - tol && b.y < C.bounds.trayY + tol); };
function settle(W, seconds) { for (let i = 0; i < Math.round(seconds / DT); i++) W.step(DT); }

/* A pile of 34 mixed items dropped in a grid above the floor. */
function pile(W, rng, n) {
  const out = [];
  const kinds = ['ball', 'sword', 'shield', 'marble', 'flask', 'tower', 'axe', 'ball'];
  for (let i = 0; i < (n || 34); i++) {
    const x = 30 + (i % 8) * 47 + rng() * 6, y = 20 + Math.floor(i / 8) * 55 + rng() * 10;
    out.push(spawn(W, ITEM[kinds[i % kinds.length]]({}), x, y, { angle: rng() * 6.28 }));
  }
  return out;
}

/* Drive one full grab at x. Returns {delivered, events, phases, seconds, cargoMax}. */
function grab(W, C, R, x, cap) {
  const events = [], phases = [R.phase];
  R.setTarget(x);
  let t = 0;
  while (!R.calm() && t < 4) { events.push(...R.update(DT)); W.step(DT); t += DT; }
  h.ok(R.drop(), 'drop accepted while idle');
  let started = false, cargoMax = 0;
  while (t < (cap || 15)) {
    const ev = R.update(DT);
    events.push(...ev);
    W.step(DT); t += DT;
    if (phases[phases.length - 1] !== R.phase) phases.push(R.phase);
    if (R.phase === 'lifting' || R.phase === 'carrying') cargoMax = Math.max(cargoMax, R.locked().length);
    if (R.phase !== 'idle' && R.phase !== 'moving') started = true;
    if (started && R.phase === 'idle') break;
  }
  events.push(...R.update(DT));   // the events of the last substeps (home)
  const delivered = items(W).filter(b => C.inChute(b));
  for (const b of delivered) W.remove(b);
  return { delivered: delivered.length, events, phases, seconds: t, cargoMax };
}

/* n lone-item grabs at varied x, fresh world each time. Returns {delivered, slips}. */
function scenario(rigCfg, def, n, seed, aimErr) {
  let ok = 0, slips = 0;
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
    slips += g.events.filter(e => e === 'slip').length;
    h.ok(g.phases[g.phases.length - 1] === 'idle', `grab returned to idle (${JSON.stringify(rigCfg)} #${i}: ${g.phases.join('>')})`);
    h.ok(g.seconds < 12, `grab took ${g.seconds.toFixed(1)} s`);
  }
  return { delivered: ok, slips };
}

// ---------------------------------------------------------------- parts and mass
h.test('shapes become balls, capsules and blobs', () => {
  h.eq(PHYS.box(10, 20).kind, 'box', 'box() is a descriptor');
  const ball = PHYS.partSpec({ kind: 'circle', r: 15 });
  h.eq(ball.kind, 'ball', 'circle -> ball'); h.eq(ball.r, 15, 'ball radius');
  const sword = PHYS.partSpec({ kind: 'box', w: 48, h: 10 });
  h.eq(sword.kind, 'cap', 'box -> capsule'); h.eq(sword.len, 48, 'capsule length is the long side'); h.eq(sword.r, 5, 'capsule radius is half the short side');
  const tall = PHYS.partSpec({ kind: 'box', w: 10, h: 48 });
  h.near(tall.ax, Math.PI / 2, 1e-9, 'a tall box runs along local y');
  const tower = PHYS.partSpec({ kind: 'box', w: 36, h: 50 });
  h.eq(tower.r, 18, 'a fat box is a pill no wider than 36');
  const legacy = PHYS.partSpec({ kind: 'poly', verts: PHYS.box(44, 10) });
  h.eq(legacy.kind, 'cap', 'poly with box verts maps to a capsule'); h.eq(legacy.len, 44, 'legacy box length');
  const shield = PHYS.partSpec({ kind: 'poly', verts: SHIELD });
  h.eq(shield.kind, 'blob', 'a round polygon is a blob'); h.near(shield.r, 0.5 * 31 * 0.92, 1e-9, 'blob radius = 0.46 x long axis');
  const axe = PHYS.partSpec({ kind: 'poly', verts: AXE });
  h.eq(axe.kind, 'cap', 'a long polygon is a thin capsule'); h.eq(axe.len, 56, 'axe length'); h.eq(axe.r, 12, 'thin capsule radius capped at 12');
  h.eq(PHYS.partSpec(null).kind, 'ball', 'no shape -> default ball');
});

h.test('body parts, mass, inertia and aabb', () => {
  const b = PHYS.body({ shape: { kind: 'circle', r: 10 }, density: 2, x: 50, y: 60 });
  h.eq(b.parts.length, 1, 'a ball is one part');
  h.near(b.m, Math.PI * 100 * 2 * 0.01, 1e-9, 'mass = pi r^2 density 0.01');
  h.ok(b.I > 0 && b.invM > 0 && b.invI > 0, 'inertia and inverses');
  const box = b.aabb();
  h.ok(box.x0 === 40 && box.x1 === 60 && box.y0 === 50 && box.y1 === 70, 'aabb around the ball');
  const s = PHYS.body({ shape: { kind: 'box', w: 48, h: 10 }, x: 0, y: 0 });
  h.ok(s.parts.length >= 8, 'a sword is a chain of parts (' + s.parts.length + ')');
  h.near(s.aabb().x1 - s.aabb().x0, 48, 1e-6, 'sword aabb spans its length');
  h.near(s.aabb().y1 - s.aabb().y0, 10, 1e-6, 'sword aabb spans its thickness');
  s.a = Math.PI / 2; PHYS.sync(s);
  h.near(s.aabb().y1 - s.aabb().y0, 48, 1e-6, 'rotated sword stands up');
  const bl = PHYS.body({ shape: { kind: 'poly', verts: SHIELD } });
  h.eq(bl.parts.length, 4, 'a blob is four parts');
  h.near(bl.parts.reduce((a, p) => a + p.x * Math.PI * p.r * p.r, 0), 0, 1e-6, 'parts are centred on the mass centre');
  const st = PHYS.body({ type: 'static', shape: { kind: 'circle', r: 5 } });
  h.eq(st.invM, 0, 'static bodies have no inverse mass'); h.ok(st.sl, 'static bodies sleep');
  h.eq(b.shape.kind, 'circle', 'the shape descriptor is kept for the game');
});

// ---------------------------------------------------------------- engine
h.test('ball falls, rests on the floor and sleeps', () => {
  const { W, C } = mkWorld();
  const b = spawn(W, ITEM.ball({}), 200, 100, {});
  settle(W, 3);
  h.near(b.y, C.bounds.floorY - 15, 1.5, 'ball rests on the floor (y ' + b.y.toFixed(1) + ')');
  h.ok(b.sl, 'ball fell asleep');
  h.eq(maxSpeed(W), 0, 'a sleeper has no velocity');
  h.ok(W.energy() === 0, 'W.energy is zero at rest');
});

h.test('friction and restitution: ice slides, a bouncy ball bounces, a dead one does not', () => {
  const { W } = mkWorld();
  W.setGravity(180, G);
  const rock = spawn(W, ITEM.sword({ friction: 0.7 }), 100, 300, {});
  const ice = spawn(W, ITEM.sword({ friction: 0.03 }), 250, 300, {});
  settle(W, 1.2);
  h.ok(ice.x - 250 > (rock.x - 100) + 20, `ice slid further (${(ice.x - 250).toFixed(0)} vs ${(rock.x - 100).toFixed(0)})`);
  const w2 = mkWorld();
  const bouncy = spawn(w2.W, ITEM.ball({ restitution: 0.8 }), 120, 150, {});
  const dead = spawn(w2.W, ITEM.ball({ restitution: 0.02 }), 300, 150, {});
  let bounceUp = 0, deadUp = 0;
  for (let i = 0; i < 120; i++) { w2.W.step(DT); bounceUp = Math.min(bounceUp, bouncy.vy); deadUp = Math.min(deadUp, dead.vy); }
  h.ok(bounceUp < -150, 'bouncy ball came back up (' + bounceUp.toFixed(0) + ')');
  h.ok(deadUp > bounceUp + 120 && deadUp > -220, 'dead ball bounced much less (' + deadUp.toFixed(0) + ' vs ' + bounceUp.toFixed(0) + ')');
});

h.test('a pile of 34 mixed items settles, sleeps and stays inside', () => {
  const { W, C } = mkWorld();
  const rng = U.rng(7);
  pile(W, rng, 34);
  let t = 0;
  while (t < 8 && !W.bodies.every(b => b.sl)) { W.step(DT); t += DT; }
  h.ok(!anyNaN(W), 'no NaN');
  h.ok(inside(W, C), 'nothing escaped');
  h.ok(W.bodies.every(b => b.sl), 'every item asleep within ' + t.toFixed(1) + ' s');
  h.ok(t < 5, 'the pile settles in under 5 s (' + t.toFixed(2) + ')');
  const top = Math.min(...items(W).map(b => b.y));
  h.ok(top > 60, 'the pile top is below the parked claw (' + top.toFixed(0) + ')');
  // a sleeper does not move at all
  const ys = items(W).map(b => b.y);
  settle(W, 1);
  h.ok(items(W).every((b, i) => b.y === ys[i]), 'sleepers are frozen in place');
});

h.test('sleepers wake on a hit, on a removal under them and on a gravity change', () => {
  const { W } = mkWorld();
  const a = spawn(W, ITEM.ball({}), 200, 360, {});
  settle(W, 2);
  h.ok(a.sl, 'ball asleep');
  const b = spawn(W, ITEM.ball({}), 205, 100, {});
  settle(W, 1.0);
  h.ok(Math.abs(a.x - 200) > 0.5 || a.vx !== 0, 'the sleeper was shoved awake by the dropped ball');
  settle(W, 8);   // a rolling ball takes a while to stop (Claw Crawl's balls roll)
  h.ok(a.sl && b.sl, 'both asleep again');
  W.remove(a);
  h.ok(!b.sl, 'removing a body wakes the rest');
  settle(W, 3);
  h.ok(b.sl, 'asleep again');
  W.setGravity(300, G);
  h.ok(!b.sl, 'a gravity change wakes everything');
});

h.test('60 s of shaking and tilting: nothing leaves the cabinet, nothing tunnels', () => {
  const { W, C } = mkWorld();
  const rng = U.rng(99);
  pile(W, rng, 34);
  settle(W, 2);
  let t = 0, bad = 0, maxV = 0;
  while (t < 60) {
    if (Math.round(t * 60) % 30 === 0) {
      W.wakeAll();
      for (const b of items(W)) { b.vx += (rng() - 0.5) * 700; b.vy -= 250 + rng() * 500; b.av += (rng() - 0.5) * 10; }
      W.setGravity((rng() - 0.5) * 1000, G - 120);
    }
    W.step(DT); t += DT;
    maxV = Math.max(maxV, maxSpeed(W));
    if (!inside(W, C, 2)) bad++;
  }
  h.eq(bad, 0, 'frames with an item outside the glass: ' + bad);
  h.ok(!anyNaN(W), 'no NaN after 60 s of abuse');
  h.ok(maxV <= PHYS.PH.maxV + 1, 'speed capped (' + maxV.toFixed(0) + ')');
  W.setGravity(0, G);
  settle(W, 5);
  h.ok(items(W).every(b => b.y <= C.bounds.floorY - 4 || C.inChute(b)), 'everything came to rest on the floor (or in the chute)');
});

h.test('hard clamps: items shoved through the floor, walls or lid are put back', () => {
  const { W, C } = mkWorld();
  const a = spawn(W, ITEM.ball({}), 200, 300, {});
  const b = spawn(W, ITEM.ball({}), 100, 300, {});
  const c = spawn(W, ITEM.ball({}), 300, 300, {});
  settle(W, 0.2);
  a.y = C.bounds.h + 30; a.vy = 900;          // through the bin floor
  b.x = -40; b.vx = -500;                      // through the left wall
  c.y = -200; c.vy = -900;                     // through the lid
  W.step(DT);
  h.ok(a.y <= C.bounds.floorY - PHYS.RIG.floorSink + 0.01 && a.vy <= 0, 'floor clamp (y ' + a.y.toFixed(1) + ')');
  h.ok(b.x >= 5 && b.vx >= 0, 'left wall clamp (x ' + b.x.toFixed(1) + ')');
  h.ok(c.y >= PHYS.RIG.clampTop && c.vy >= 0, 'lid clamp (y ' + c.y.toFixed(1) + ')');
  const d = spawn(W, ITEM.ball({}), 450, 100, {});   // in the chute column: no floor, a hidden tray
  settle(W, 2);
  h.ok(C.inChute(d), 'a ball dropped in the chute is inChute');
  h.ok(d.y > C.bounds.h && d.y <= C.bounds.trayY, 'it fell through the chute onto the tray (y ' + d.y.toFixed(0) + ')');
  h.ok(!C.inChute(a), 'the bin ball is not in the chute');
});

h.test('W.step clamps dt and runs at most 12 substeps; queryAABB and contactsOf', () => {
  const { W } = mkWorld();
  const b = spawn(W, ITEM.ball({}), 200, 100, {});
  const s0 = W.steps;
  W.step(1);
  h.eq(W.steps - s0, 12, 'one second of dt runs 12 substeps');
  W.step(DT);
  h.eq(W.steps - s0, 16, 'a 60 Hz frame runs 4 substeps');
  settle(W, 2);
  h.ok(W.queryAABB(150, 300, 250, 400).indexOf(b) >= 0, 'queryAABB finds the resting ball');
  h.eq(W.queryAABB(0, 0, 50, 50).length, 0, 'queryAABB misses an empty corner');
  W.wakeAll(); W.step(DT);
  const cs = W.contactsOf(b);
  h.ok(cs.length >= 1 && cs[0].other && cs[0].other.wall === 'floor', 'contactsOf reports the floor contact');
  h.ok(cs[0].ny > 0.9, 'floor contact normal points down from the ball to the floor');
});

// ---------------------------------------------------------------- the claw
h.test('rig geometry and the Clawspire -> Claw Crawl mapping', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, width: 1, grip: 1, rand: U.rng(1) });
  h.near(R.geo.s, PHYS.RIG.base, 1e-9, 'size = base x width');
  h.near(R.geo.grip, 0.35 + 0.3 * 0.25, 1e-9, 'grip 1 -> grip_cc 0.425');
  const R2 = PHYS.clawRig(W, { cabinet: C, width: 1.1, grip: 1.3, rand: U.rng(1) });
  h.near(R2.geo.s, PHYS.RIG.base * 1.1, 1e-9, 'knight width 1.1');
  h.near(R2.geo.grip, 0.35 + 0.3 * 0.55, 1e-9, 'knight grip 1.3 -> 0.515');
  const R3 = PHYS.clawRig(W, { cabinet: C, width: 0.75, grip: 0.75, rand: U.rng(1) });
  h.near(R3.geo.grip, 0.35, 1e-9, 'alchemist grip 0.75 -> 0.35');
  const R4 = PHYS.clawRig(W, { cabinet: C, width: 1, grip: 5, rand: U.rng(1) });
  h.eq(R4.geo.grip, 1, 'grip_cc caps at 1');
  h.ok(R.bodies.hub && R.bodies.prongs.length === 2 && R.bodies.prongs[0].length === 4 && !R.bodies.ghost, 'hub + two 4-point prongs, no ghost');
  h.near(R.bodies.hub.r, 13 * R.geo.s, 1e-9, 'hub radius 13 x size');
  h.ok(R.geo.span > 40 && R.geo.span < 80, 'open span ' + R.geo.span.toFixed(1));
  h.eq(R.phase, 'idle', 'starts idle');
  h.eq(R.y, 26 + PHYS.RIG.hubDrop, 'hub parked just under the rail');
  h.ok(W.csegs.length === 7, 'hub + 2 x 3 capsule segments in the world');
  h.eq(R.cableTop.y, 26, 'cable leaves the rail');
  for (const k of ['setTarget', 'drop', 'update', 'held', 'locked', 'cradle', 'open', 'setConfig', 'destroy', 'calm']) h.eq(typeof R[k], 'function', 'rig has ' + k);
});

h.test('phase machine: full cycle with events in order, delivers a ball', () => {
  const { W, C } = mkWorld();
  const b = spawn(W, ITEM.ball({}), 200, 300, {});
  settle(W, 1);
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(3) });
  h.ok(R.setTarget(200), 'setTarget accepted while idle');
  const g = grab(W, C, R, 200);
  const want = ['idle', 'dropping', 'closing', 'lifting', 'carrying', 'releasing', 'returning', 'idle'];
  h.eq(g.phases.join('>'), want.join('>'), 'phases in order');
  const ev = g.events.filter(e => e !== 'touch');
  h.eq(ev.join(','), 'drop,close,lift,carry,release,home', 'events in order (' + g.events.join(',') + ')');
  // a lone ball sits between the open tips, so the drop ends at the floor
  // limit without a touch; a tall box under the hub is touched first
  const { W: W2, C: C2 } = mkWorld();
  spawn(W2, ITEM.tower({}), 200, 300, {}); settle(W2, 2);   // standing 50 tall: the hub lands on it
  const R2 = PHYS.clawRig(W2, { cabinet: C2, rand: U.rng(3) });
  const g2 = grab(W2, C2, R2, 200);
  h.ok(g2.events.indexOf('touch') >= 0 && g2.events.indexOf('touch') < g2.events.indexOf('close'), 'touch fires before close on a tall item (' + g2.events.join(',') + ')');
  h.eq(g.delivered, 1, 'the ball reached the chute');
  h.eq(g.cargoMax, 1, 'the ball was the cargo');
  h.ok(g.seconds > 4 && g.seconds < 9, 'a grab takes a few seconds (' + g.seconds.toFixed(1) + ')');
  h.eq(R.locked().length, 0, 'nothing locked once home');
  h.eq(R.held().length, 0, 'nothing held once home');
});

h.test('setTarget and drop are ignored while busy; open() forces a release; destroy() clears the claw', () => {
  const { W, C } = mkWorld();
  spawn(W, ITEM.ball({}), 200, 300, {});
  settle(W, 1);
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(4) });
  R.setTarget(200);
  let t = 0; while (!R.calm() && t < 4) { R.update(DT); W.step(DT); t += DT; }
  h.ok(R.drop(), 'drop accepted');
  while (R.phase !== 'closing' && t < 6) { R.update(DT); W.step(DT); t += DT; }
  h.eq(R.phase, 'closing', 'reached closing');
  for (let i = 0; i < 14; i++) { R.update(DT); W.step(DT); t += DT; }
  h.ok(!R.setTarget(100), 'setTarget refused while closing');
  h.ok(!R.drop(), 'drop refused while closing');
  h.ok(R.held().length >= 1, 'the claw is touching the ball');
  R.open();
  h.eq(R.phase, 'releasing', 'open() forces releasing');
  let evs = [];
  while (R.phase !== 'idle' && t < 12) { evs.push(...R.update(DT)); W.step(DT); t += DT; }
  evs.push(...R.update(DT));
  h.eq(R.phase, 'idle', 'back to idle after a forced open');
  h.ok(evs.indexOf('home') >= 0, 'home event after the forced open');
  R.destroy();
  h.eq(W.csegs.length, 0, 'destroy removes the claw segments');
  const steps0 = W.steps; W.step(DT);
  h.eq(W.steps - steps0, 4, 'the world still steps without the rig');
});

h.test('every phase is bounded: the rig never stalls even on a wedged pile', () => {
  const { W, C } = mkWorld();
  const rng = U.rng(11);
  pile(W, rng, 34);
  settle(W, 2);
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(5) });
  for (let k = 0; k < 4; k++) {
    const g = grab(W, C, R, 90 + k * 90, 14);
    h.ok(g.phases[g.phases.length - 1] === 'idle', 'grab ' + k + ' returned to idle in ' + g.seconds.toFixed(1) + ' s (' + g.phases.join('>') + ')');
    h.ok(g.seconds < 12, 'grab ' + k + ' under 12 s');
  }
  h.ok(inside(W, C), 'pile still inside after four grabs');
  h.ok(!anyNaN(W), 'no NaN');
});

h.test('halt detection: a fat item stops the prongs early, an empty claw closes fully', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(6) });
  const g = grab(W, C, R, 200);
  h.eq(g.delivered, 0, 'nothing to deliver from an empty floor');
  // capture the prong angles at the lift on a second, loaded run
  const w2 = mkWorld();
  spawn(w2.W, ITEM.tower({}), 200, 300, {});
  settle(w2.W, 1);
  const R2 = PHYS.clawRig(w2.W, { cabinet: w2.C, rand: U.rng(6) });
  R2.setTarget(200); let t = 0; while (!R2.calm() && t < 4) { R2.update(DT); w2.W.step(DT); t += DT; }
  R2.drop();
  let angEmpty = null, angFull = null, closingT = 0;
  const R1 = PHYS.clawRig(W, { cabinet: C, rand: U.rng(6) });
  R1.setTarget(200); let t1 = 0; while (!R1.calm() && t1 < 4) { R1.update(DT); W.step(DT); t1 += DT; }
  R1.drop();
  for (let i = 0; i < 60 * 8; i++) {
    const e2 = R2.update(DT); w2.W.step(DT);
    const e1 = R1.update(DT); W.step(DT);
    if (R2.phase === 'closing') closingT += DT;
    if (e2.indexOf('lift') >= 0) angFull = [R2.ctl.pL, R2.ctl.pR];
    if (e1.indexOf('lift') >= 0) angEmpty = [R1.ctl.pL, R1.ctl.pR];
    if (angFull && angEmpty) break;
  }
  h.ok(angEmpty && angEmpty[0] <= PHYS.PHI_CLOSED + 0.02 && angEmpty[1] <= PHYS.PHI_CLOSED + 0.02, 'empty claw closes to PHI_CLOSED (' + (angEmpty || []).map(a => a.toFixed(2)) + ')');
  h.ok(angFull && Math.max(angFull[0], angFull[1]) > PHYS.PHI_CLOSED + 0.15, 'a tower shield halts at least one prong early (' + (angFull || []).map(a => a.toFixed(2)) + ')');
  h.ok(closingT >= PHYS.RIG.closeMin - 0.02 && closingT <= PHYS.RIG.closeMax + 0.05, 'closing lasted ' + closingT.toFixed(2) + ' s');
  h.ok(R2.ctl.haltL || R2.ctl.haltR, 'a halt was registered');
});

h.test('delivery from the floor: ball, shield, sword, flask, two marbles', () => {
  const ball = scenario({}, ITEM.ball({}), 10, 100, [0, 6, -6, 12]);
  h.ok(ball.delivered >= 9, 'ball delivered ' + ball.delivered + '/10');
  const shield = scenario({}, ITEM.shield({}), 10, 200, [0, 8, -8]);
  h.ok(shield.delivered >= 8, 'shield delivered ' + shield.delivered + '/10');
  // a sword lying flat on the bare floor is the knife-edge case (Claw Crawl's
  // frog claw never gets it): the rogue's claw, a hair smaller than the sword
  // is long, scissors it up
  const sword = scenario({ width: 0.95 }, ITEM.sword({}), 10, 300, [0, 4, -4]);
  h.ok(sword.delivered >= 6, 'rogue claw delivers a flat sword ' + sword.delivered + '/10 (slips ' + sword.slips + ')');
  const flask = scenario({ width: 0.75, grip: 0.75 }, ITEM.flask({}), 10, 400, [0, 6, -6]);
  h.ok(flask.delivered >= 7, 'alchemist claw delivers the flask ' + flask.delivered + '/10');
  const tower = scenario({ width: 1.1, grip: 1.3 }, ITEM.tower({}), 8, 500);
  h.ok(tower.delivered >= 6, 'knight claw delivers the tower shield ' + tower.delivered + '/8');
  // two marbles side by side: often both
  let both = 0, one = 0;
  for (let i = 0; i < 10; i++) {
    const { W, C } = mkWorld();
    const x = 120 + (i % 5) * 40;
    spawn(W, ITEM.marble({}), x - 9.5, 360, {}); spawn(W, ITEM.marble({}), x + 9.5, 360, {});
    settle(W, 1);
    const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(600 + i) });
    const g = grab(W, C, R, x);
    if (g.delivered >= 2) both++; else if (g.delivered === 1) one++;
  }
  h.ok(both + one >= 8, 'marbles delivered in ' + (both + one) + '/10 grabs');
  h.ok(both >= 5, 'both marbles in ' + both + '/10 grabs');
});

h.test('slips: a weak greased claw loses a heavy item more often than a strong one', () => {
  const strong = scenario({ grip: 3, rubber: 1 }, ITEM.tower({}), 8, 700, [0, 8, -8]);
  const weak = scenario({ grip: 0.75, grease: 1 }, ITEM.tower({}), 8, 700, [0, 8, -8]);
  h.ok(strong.delivered >= weak.delivered, 'strong ' + strong.delivered + '/8 >= weak ' + weak.delivered + '/8');
  h.ok(strong.slips <= weak.slips + 1, 'strong slips ' + strong.slips + ' <= weak slips ' + weak.slips);
  h.ok(strong.delivered >= 7, 'a strong rubber claw carries the tower shield (' + strong.delivered + '/8)');
});

h.test('loosen and jolt are driven by the grip (seeded rand, never Math.random)', () => {
  const run = (grip, seed) => {
    const { W, C } = mkWorld();
    spawn(W, ITEM.ball({}), 200, 300, {});
    settle(W, 1);
    const R = PHYS.clawRig(W, { cabinet: C, grip, rand: U.rng(seed) });
    let loosen = 0, jolt = 0, cycles = 0;
    for (let k = 0; k < 6; k++) {
      R.setTarget(200);
      let t = 0; while (!R.calm() && t < 4) { R.update(DT); W.step(DT); t += DT; }
      if (!R.drop()) break;
      let started = false;
      while (t < 15) {
        const ev = R.update(DT); W.step(DT); t += DT;
        if (ev.indexOf('lift') >= 0) loosen += R.ctl.loosen;
        if (ev.indexOf('carry') >= 0) { if (R.ctl.jolt > 0) jolt++; cycles++; }
        if (R.phase !== 'idle' && R.phase !== 'moving') started = true;
        if (started && R.phase === 'idle') break;
      }
      for (const b of items(W)) if (C.inChute(b)) { b.x = 200; b.y = 300; b.vx = b.vy = 0; W.wakeAll(); }
      settle(W, 1);
    }
    return { loosen: loosen / Math.max(1, cycles), jolt, cycles };
  };
  const weak = run(0.75, 21), strong = run(5, 21);
  h.eq(strong.loosen, 0, 'grip_cc 1 never loosens');
  h.eq(strong.jolt, 0, 'grip_cc 1 never jolts');
  h.ok(weak.loosen > 0.04 && weak.loosen < 0.12, 'weak claw loosens ' + weak.loosen.toFixed(3) + ' rad per lift');
  h.ok(weak.cycles >= 5, 'weak run cycled ' + weak.cycles + ' times');
  const orig = Math.random; let called = 0; Math.random = () => { called++; return 0.5; };
  try { run(0.75, 22); } finally { Math.random = orig; }
  h.eq(called, 0, 'the rig never calls Math.random');
});

h.test('determinism: two worlds with the same inputs match after a grab', () => {
  const build = () => {
    const { W, C } = mkWorld();
    const rng = U.rng(31);
    pile(W, rng, 20);
    settle(W, 1.5);
    const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(32) });
    return { W, C, R };
  };
  const A = build(), B = build();
  grab(A.W, A.C, A.R, 200); grab(B.W, B.C, B.R, 200);
  settle(A.W, 1); settle(B.W, 1);
  let same = true;
  for (let i = 0; i < A.W.bodies.length; i++) {
    const a = A.W.bodies[i], b = B.W.bodies[i];
    if (a.x !== b.x || a.y !== b.y || a.a !== b.a) same = false;
  }
  h.ok(same, 'identical body poses');
  h.eq(A.R.x, B.R.x, 'identical claw position');
});

h.test('setConfig: width, grip, rubber, prongs, magnet, grease', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(1) });
  const s0 = R.geo.s, g0 = R.geo.grip, mu0 = R.geo.mu;
  R.setConfig({ width: 1.36 });
  h.near(R.geo.s, s0 * 1.36, 1e-9, 'width rescales the claw');
  h.near(R.bodies.hub.r, 13 * R.geo.s, 1e-9, 'hub grows with it');
  R.setConfig({ width: 1, rubber: 1 });
  h.near(R.geo.grip, g0 + 0.15, 1e-9, 'rubber adds 0.15 grip_cc');
  h.ok(R.geo.mu > mu0, 'rubber raises the claw friction');
  R.setConfig({ rubber: 0, prongs: 3 });
  h.near(R.geo.s, s0 * 1.08, 1e-9, 'third prong scales the claw 1.08');
  h.near(R.geo.grip, g0 + 0.1, 1e-9, 'third prong adds 0.1 grip_cc');
  h.ok(Array.isArray(R.bodies.ghost) && R.bodies.ghost.length === 4, 'third prong is drawn as a ghost');
  h.eq(R.bodies.prongs.length, 2, 'still two physical prongs');
  R.setConfig({ prongs: 2, grease: 1 });
  h.near(R.geo.grip, g0 - 0.3, 1e-9, 'grease takes 0.3 grip_cc');
  h.eq(R.bodies.ghost, null, 'ghost gone');
  R.setConfig({ grease: 0, grip: 2.05 });
  h.near(R.geo.grip, 0.35 + 0.3 * 1.3, 1e-9, 'grip upgrades map linearly');
  R.setConfig({ magnet: 1, speed: 1.4 });
  h.eq(R.cfg.magnet, 1, 'magnet on'); h.eq(R.cfg.speed, 1.4, 'speed set');
});

h.test('magnet pulls metal toward the hub while dropping', () => {
  const run = (magnet) => {
    const { W, C } = mkWorld();
    const m = spawn(W, ITEM.ball({}), 260, 300, { data: { tags: ['metal'] } });
    settle(W, 1);
    const R = PHYS.clawRig(W, { cabinet: C, magnet, rand: U.rng(8) });
    R.setTarget(200);
    let t = 0; while (!R.calm() && t < 4) { R.update(DT); W.step(DT); t += DT; }
    R.drop();
    while (R.phase !== 'lifting' && t < 8) { R.update(DT); W.step(DT); t += DT; }
    return m.x;
  };
  const off = run(0), on = run(1);
  h.ok(off > 250, 'without a magnet the ball stays put (' + off.toFixed(1) + ')');
  h.ok(on < off - 15, 'with a magnet the ball drifted toward the claw (' + on.toFixed(1) + ' vs ' + off.toFixed(1) + ')');
  const { W, C } = mkWorld();
  const wood = spawn(W, ITEM.ball({}), 260, 300, { data: { tags: ['food'] } });
  settle(W, 1);
  const R = PHYS.clawRig(W, { cabinet: C, magnet: 1, rand: U.rng(8) });
  R.setTarget(200); let t = 0; while (!R.calm() && t < 4) { R.update(DT); W.step(DT); t += DT; }
  R.drop(); while (R.phase !== 'lifting' && t < 8) { R.update(DT); W.step(DT); t += DT; }
  h.ok(wood.x > 250, 'non-metal is not pulled (' + wood.x.toFixed(1) + ')');
});

h.test('the claw never flings: an item pinned under the hub stays slow', () => {
  const { W, C } = mkWorld();
  const rng = U.rng(77);
  pile(W, rng, 34);
  settle(W, 2);
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(9) });
  let peak = 0;
  for (let k = 0; k < 3; k++) {
    R.setTarget(120 + k * 100);
    let t = 0; while (!R.calm() && t < 4) { R.update(DT); W.step(DT); t += DT; }
    R.drop(); let started = false;
    while (t < 14) { R.update(DT); W.step(DT); t += DT; peak = Math.max(peak, maxSpeed(W)); if (R.phase !== 'idle' && R.phase !== 'moving') started = true; if (started && R.phase === 'idle') break; }
  }
  h.ok(peak < 900, 'peak item speed while the claw digs through a pile: ' + peak.toFixed(0) + ' px/s');
  h.ok(inside(W, C), 'nothing escaped');
});

h.test('cable sway is visual only: the hub does not swing, the cable top does', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(1) });
  R.setTarget(400);
  let maxSway = 0, t = 0;
  while (t < 3) { R.update(DT); W.step(DT); t += DT; maxSway = Math.max(maxSway, Math.abs(R.sway)); }
  h.ok(maxSway > 0.01, 'the cable swung during travel (' + maxSway.toFixed(3) + ')');
  h.ok(Math.abs(R.cableTop.x - R.x) <= 12 * maxSway + 1e-9, 'the cable top offset follows the sway');
  h.ok(R.calm(), 'calm once parked');
  h.near(R.y, 26 + PHYS.RIG.hubDrop, 1e-9, 'the hub stayed on the rail');
});

h.done();
