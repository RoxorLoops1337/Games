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

h.test('nothing rides the claw home: a wedged item is shed and falls', () => {
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(21) });
  for (let k = 0; k < 60; k++) { R.update(1 / 60); W.step(1 / 60); }
  // Park a ball inside the open claw at home and keep it wedged for a moment.
  const b = W.add(PHYS.body({ type: 'dynamic', shape: { kind: 'circle', r: 14 }, x: R.x, y: R.y + 22, group: 'item', data: {} }));
  let fell = false, slipped = false;
  for (let k = 0; k < 60 * 2; k++) {
    if (k < 30) { b.held = 2; b.x = R.x; b.y = R.y + 22; b.vx = 0; b.vy = 0; }   // wedged against the hub
    const ev = R.update(1 / 60); W.step(1 / 60);
    if (ev.indexOf('slip') >= 0) slipped = true;
    if (b.y > R.y + 80) { fell = true; break; }
  }
  h.ok(slipped, 'the parked claw shed its passenger (slip event)');
  h.ok(fell, `the wedged ball fell away from the claw (y ${b.y.toFixed(0)} vs claw ${R.y.toFixed(0)})`);
  h.ok(R.phase === 'idle' || R.phase === 'moving', 'claw stays idle while shedding');
  // Explicit shed hook for the game's watchdog.
  b.held = 2; b.x = R.x; b.y = R.y + 22;
  h.ok(R.shed() >= 1, 'shed() reports what it dropped');
  h.ok(b.passClaw > 0, 'a shed body ignores the claw for a moment');
});

// ---------------------------------------------------------------- cabinet materials
h.test('materials: derived from tags, art and fx', () => {
  const M = (d) => PHYS.materialOf(Object.assign({ shape: { kind: 'circle', r: 12 }, tags: [], fx: [] }, d));
  const metal = M({ id: 'm1', tags: ['metal', 'weapon'] });
  h.eq(metal.id, 'metal', 'metal leads a sword');
  h.ok(metal.traits.metal && metal.g === 1 && metal.slick === 1, 'metal: normal gravity and friction');
  const heavy = M({ id: 'm2', tags: ['metal', 'heavy'] });
  h.eq(heavy.id, 'heavy', 'heavy leads a heavy metal item');
  h.ok(heavy.traits.metal, '...which keeps its metal trait (it still sparks)');
  const pot = M({ id: 'm3', tags: ['glass', 'potion'], art: 'potion' });
  h.eq(pot.id, 'potion', 'a potion is a potion');
  h.ok(pot.traits.glass && pot.traits.liquid, '...made of glass, with liquid in it');
  const bomb = M({ id: 'm4', tags: ['weapon'], art: 'bomb', fx: [{ k: 'status', s: 'burn', v: 2 }] });
  h.eq(bomb.id, 'bomb', 'the bomb art has a fuse');
  h.ok(bomb.traits.fuse && bomb.traits.fire, 'a burn bomb is fuse + fire');
  const ice = M({ id: 'm5', tags: ['glass'], art: 'bottle', fx: [{ k: 'status', s: 'chill', v: 2 }] });
  h.eq(ice.id, 'frost', 'a chill item is frost');
  h.ok(ice.slick < 0.5, 'frost slides (low floor friction)');
  const magic = M({ id: 'm6', tags: ['magic'] });
  h.ok(magic.g < 0.8 && magic.drag > 0, 'magic floats down (gravity scale ' + magic.g + ')');
  h.ok(M({ id: 'm6b', tags: ['magic', 'heavy'] }).g > magic.g, 'heavy magic floats less');
  const ball = M({ id: 'm7', tags: ['small', 'light'], restitution: 0.9 });
  h.eq(ball.id, 'rubber', 'a light bouncy ball is rubber');
  h.ok(ball.bounce >= 0.6 && ball.bounceV < PHYS.PH.bounceV, 'rubber rebounds from gentler hits');
  h.eq(M({ id: 'm8', tags: ['food'] }).id, 'food', 'food');
  h.ok(M({ id: 'm9', tags: [], fx: [{ k: 'poisonAll' }] }).traits.poison, 'poisonAll is a poison item');
  h.eq(M({ id: 'm10', tags: [] }).id, 'stuff', 'no tags: plain stuff');
  h.ok(M({ id: 'm1', tags: ['metal', 'weapon'] }) === metal, 'cached per def id');
  const b = PHYS.body({ type: 'dynamic', shape: { kind: 'circle', r: 12 }, mat: magic });
  h.ok(b.gs === magic.g && b.drag === magic.drag && b.mat === magic, 'body({mat}) takes the material physics');
  const plain = PHYS.body({ type: 'dynamic', shape: { kind: 'circle', r: 12 } });
  h.ok(plain.gs === 1 && plain.drag === 0 && plain.slick === 1 && plain.bounceV === PHYS.PH.bounceV, 'a plain body is unchanged');
});

h.test('materials: magic falls slower, ice slides farther, rubber bounces higher', () => {
  const M = (d) => PHYS.materialOf(Object.assign({ shape: { kind: 'circle', r: 12 }, fx: [] }, d));
  // time to fall from the top to the floor
  const fall = (mat) => {
    const { W } = mkWorld();
    const b = spawn(W, ITEM.ball({}), 200, 40, mat ? { mat } : {});
    let t = 0; while (b.y < 360 && t < 5) { W.step(DT); t += DT; }
    return t;
  };
  const tPlain = fall(null), tMagic = fall(M({ id: 'fm', tags: ['magic'] }));
  h.ok(tMagic > tPlain * 1.15, `magic takes longer to fall (${tMagic.toFixed(2)} vs ${tPlain.toFixed(2)} s)`);
  // a push along the floor
  const slide = (mat) => {
    const { W } = mkWorld();
    const b = spawn(W, ITEM.sword({}), 80, 370, mat ? { mat } : {});
    settle(W, 0.6);
    const x0 = b.x; W.wakeAll(); b.vx = 320;
    settle(W, 2);
    return b.x - x0;
  };
  const sPlain = slide(null), sIce = slide(M({ id: 'fi', tags: [], art: 'iceblock' }));
  h.ok(sIce > sPlain * 1.5, `ice slides farther (${sIce.toFixed(0)} vs ${sPlain.toFixed(0)} px)`);
  // the rebound off the floor
  const bounce = (mat) => {
    const { W } = mkWorld();
    const b = spawn(W, ITEM.ball({ restitution: 0.3 }), 200, 150, mat ? { mat } : {});
    let hit = false, top = 999;
    for (let i = 0; i < 180; i++) { W.step(DT); if (b.y > 360) hit = true; if (hit) top = Math.min(top, b.y); }
    return 375 - top;
  };
  const bPlain = bounce(null), bRubber = bounce(M({ id: 'fr', tags: ['light'], restitution: 0.3 }));
  h.ok(bRubber > bPlain + 20, `rubber rebounds higher (${bRubber.toFixed(0)} vs ${bPlain.toFixed(0)} px)`);
});

h.test('blast and hop: impulses, containment, determinism', () => {
  const run = () => {
    const { W, C } = mkWorld();
    const rng = U.rng(9);
    const bodies = pile(W, rng, 20);
    settle(W, 3);
    const centre = bodies[10];
    const x0 = bodies.map(b => b.x);
    const pushed = PHYS.blast(W, centre.x, centre.y, 150, 950, centre);
    const up = pushed.filter(b => b.vy < -100).length;
    const out = pushed.every(b => Math.sign(b.x - centre.x) === Math.sign(b.vx) || Math.abs(b.x - centre.x) < 2);
    settle(W, 3);
    return { pushed: pushed.length, up, out, inside: inside(W, C, 2), moved: bodies.filter((b, i) => Math.abs(b.x - x0[i]) > 5).length, pose: bodies.map(b => b.x.toFixed(3) + ',' + b.y.toFixed(3)).join(';'), nan: anyNaN(W) };
  };
  const a = run(), b = run();
  h.ok(a.pushed >= 3, `the blast reached ${a.pushed} bodies`);
  h.ok(!a.pushed || a.up >= a.pushed * 0.6, 'the blast throws them upward');
  h.ok(a.out, 'the blast pushes away from its centre');
  h.ok(a.moved >= 3, 'the pile moved');
  h.ok(a.inside && !a.nan, 'everything stays inside the glass');
  h.eq(a.pose, b.pose, 'a blast is deterministic');
  const { W } = mkWorld();
  const heavy = spawn(W, ITEM.tower({}), 200, 350);
  const near = spawn(W, ITEM.ball({}), 250, 360), far = spawn(W, ITEM.ball({}), 420, 360);
  settle(W, 2);
  const hopped = PHYS.hop(W, heavy.x, heavy.y, 150, 170, heavy);
  h.ok(hopped.indexOf(near) >= 0 && near.vy < -50, 'a neighbour hops');
  h.ok(hopped.indexOf(heavy) < 0, 'the heavy item itself does not');
  h.ok(hopped.indexOf(far) < 0, 'a far body does not');
  h.eq(PHYS.blast(null, 0, 0, 10).length, 0, 'blast without a world is a no-op');
});

h.test('scaleShape shrinks every shape kind', () => {
  h.eq(PHYS.scaleShape({ kind: 'circle', r: 10 }, 0.5).r, 5, 'circle');
  const bx = PHYS.scaleShape({ kind: 'box', w: 40, h: 10 }, 0.5);
  h.ok(bx.w === 20 && bx.h === 5, 'box');
  const pv = PHYS.scaleShape({ kind: 'poly', verts: [{ x: 10, y: -4 }, { x: -10, y: 4 }] }, 0.5);
  h.ok(pv.verts[0].x === 5 && pv.verts[1].y === 2, 'poly');
  const src = { kind: 'circle', r: 10 };
  PHYS.scaleShape(src, 0.3);
  h.eq(src.r, 10, 'the original shape is untouched');
});

// ---- claw types (DESIGN.md "Claw types")
const TYPES = Object.keys(PHYS.CLAW_TYPES);
const METAL = { tags: ['metal'] };
/* A world with the given item list [[kind, x, y, data]], settled. */
function typeWorld(list, secs) {
  const { W, C } = mkWorld();
  for (const [k, x, y, data] of list) spawn(W, ITEM[k]({}), x, y, { data: Object.assign({ tags: [] }, data || {}) });
  settle(W, secs || 1.5);
  for (const b of items(W).filter(b => C.inChute(b))) W.remove(b);
  return { W, C };
}

h.test('claw types: six types, the classic is the default and unchanged', () => {
  for (const t of ['classic', 'tri', 'scoop', 'hand', 'magnet', 'hook']) h.ok(PHYS.CLAW_TYPES[t], 'claw type ' + t);
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C });
  h.eq(R.cfg.type, 'classic', 'no type is the classic claw');
  h.near(R.geo.reach, (PHYS.RIG.hingeY + PHYS.PRONG[3][1]) * R.geo.s, 1e-9, 'classic reach as before');
  const R2 = PHYS.clawRig(mkWorld().W, { cabinet: C, type: 'nonsense' });
  h.eq(R2.cfg.type, 'classic', 'an unknown type is the classic claw');
  for (const t of TYPES) {
    const p = PHYS.clawPose(t, { x: 100, y: 50, open: 0.5 });
    h.ok(p.bodies.hub && p.bodies.hub.r > 0 && Array.isArray(p.bodies.prongs), 'clawPose ' + t);
    h.eq(p.bodies.prongs[0].length, PHYS.CLAW_TYPES[t].poly ? PHYS.CLAW_TYPES[t].poly.length : 0, 'clawPose prong points ' + t);
  }
});

h.test('claw types: every type delivers a lone item in a scripted grab', () => {
  for (const t of TYPES) {
    let ok = 0;
    for (const x of [140, 200, 260]) {
      const { W, C } = typeWorld([['ball', x, 340, METAL]]);
      const R = PHYS.clawRig(W, { cabinet: C, type: t, rand: U.rng(3) });
      const g = grab(W, C, R, x);
      if (g.delivered >= 1) ok++;
      h.ok(g.events.includes('drop') && g.events.includes('lift') && g.events.includes('release') && g.events.includes('home'), t + ' runs the full cycle');
      h.ok(!anyNaN(W) && inside(W, C), t + ' keeps everything sane and inside');
    }
    h.ok(ok >= 2, `${t} delivers a lone ball (${ok}/3)`);
  }
});

h.test('magnet crane: only lifts metal, and it lifts metal', () => {
  const soft = [];
  for (let i = 0; i < 16; i++) soft.push([i % 3 ? 'ball' : 'flask', 40 + (i % 8) * 45, 200 + Math.floor(i / 8) * 40]);
  let got = 0;
  for (const x of [100, 180, 260, 340]) {
    const { W, C } = typeWorld(soft);
    const R = PHYS.clawRig(W, { cabinet: C, type: 'magnet', grip: 1.6, rand: U.rng(5) });
    let stuckMax = 0;
    R.setTarget(x);
    for (let i = 0; i < 60; i++) { R.update(DT); W.step(DT); }
    R.drop();
    for (let i = 0; i < 900 && !(i > 30 && R.phase === 'idle'); i++) { R.update(DT); W.step(DT); stuckMax = Math.max(stuckMax, R.stuck().length); }
    got += items(W).filter(b => C.inChute(b)).length;
    h.eq(stuckMax, 0, 'nothing but metal sticks to the magnet');
  }
  h.eq(got, 0, 'the magnet delivers nothing from a pile with no metal');
  // a mixed pile: whatever sticks is metal, and metal gets delivered
  let metal = 0;
  for (const x of [120, 200, 280]) {
    const mix = [];
    for (let i = 0; i < 16; i++) mix.push([i % 2 ? 'sword' : 'ball', 40 + (i % 8) * 45, 200 + Math.floor(i / 8) * 40, i % 2 ? METAL : null]);
    const { W, C } = typeWorld(mix);
    const R = PHYS.clawRig(W, { cabinet: C, type: 'magnet', grip: 1.6, rand: U.rng(7) });
    R.setTarget(x);
    for (let i = 0; i < 60; i++) { R.update(DT); W.step(DT); }
    R.drop();
    let allMetal = true;
    for (let i = 0; i < 900 && !(i > 30 && R.phase === 'idle'); i++) {
      R.update(DT); W.step(DT);
      for (const b of R.stuck()) if (b.data.tags.indexOf('metal') < 0) allMetal = false;
    }
    h.ok(allMetal, 'every stuck body is metal');
    metal += items(W).filter(b => C.inChute(b) && b.data.tags.indexOf('metal') >= 0).length;
  }
  h.ok(metal >= 2, `the magnet delivers metal from a mixed pile (${metal})`);
});

h.test('scoop: lifts a handful of small things at once; a sword tips out', () => {
  let best = 0, total = 0;
  for (const x of [170, 200, 230]) {
    const list = [];
    for (let i = 0; i < 18; i++) list.push(['marble', 150 + (i % 6) * 20, 250 + Math.floor(i / 6) * 22]);
    const { W, C } = typeWorld(list);
    const R = PHYS.clawRig(W, { cabinet: C, type: 'scoop', rand: U.rng(9) });
    const g = grab(W, C, R, x);
    best = Math.max(best, g.delivered); total += g.delivered;
  }
  h.ok(best >= 3, `a scoop of marbles delivers 3+ at once (best ${best})`);
  h.ok(total >= 6, `scoops deliver handfuls (${total} over 3 grabs)`);
  // long things: the bucket tips them out on the way up most of the time
  let swords = 0;
  for (let s = 0; s < 6; s++) {
    const { W, C } = typeWorld([['sword', 200, 350]]);
    const R = PHYS.clawRig(W, { cabinet: C, type: 'scoop', rand: U.rng(11 + s) });
    swords += grab(W, C, R, 200).delivered;
  }
  h.ok(swords <= 3, `the scoop is bad with a sword (${swords}/6)`);
});

h.test('grabber hand: takes the biggest thing it touched, and only that', () => {
  const { W, C } = typeWorld([['tower', 200, 330], ['marble', 170, 300], ['marble', 230, 300], ['ball', 200, 250]]);
  const tower = items(W).find(b => b.spec.len === 50);
  const R = PHYS.clawRig(W, { cabinet: C, type: 'hand', rand: U.rng(2) });
  R.setTarget(tower.x);
  for (let i = 0; i < 60; i++) { R.update(DT); W.step(DT); }
  R.drop();
  let sawCarry = false, maxStuck = 0, heldTower = false;
  for (let i = 0; i < 1200 && !(i > 30 && R.phase === 'idle'); i++) {
    R.update(DT); W.step(DT);
    maxStuck = Math.max(maxStuck, R.stuck().length);
    if (R.phase === 'carrying') { sawCarry = true; if (R.stuck().indexOf(tower) >= 0) heldTower = true; }
  }
  h.ok(sawCarry, 'the hand carried');
  h.ok(maxStuck <= 1, 'one thing sticks to the hand at most');
  h.ok(heldTower, 'the heaviest thing it touched is the one it holds');
  h.ok(C.inChute(tower), 'the tower shield was delivered');
});

h.test('harpoon: spears one item through the pile and pulls it up on its rope', () => {
  const { W, C } = typeWorld([['shield', 200, 330], ['ball', 150, 330], ['ball', 250, 330]]);
  const R = PHYS.clawRig(W, { cabinet: C, type: 'hook', rand: U.rng(4) });
  R.setTarget(200);
  for (let i = 0; i < 60; i++) { R.update(DT); W.step(DT); }
  R.drop();
  let speared = null, csegs = 0;
  for (let i = 0; i < 900 && !(i > 30 && R.phase === 'idle'); i++) {
    R.update(DT); W.step(DT);
    csegs = Math.max(csegs, W.csegs.length);
    if (!speared && R.stuck().length) speared = R.stuck()[0];
  }
  h.ok(speared, 'the barb speared something');
  h.eq(csegs, 0, 'the rope and hook never shove the pile');
  h.ok(speared && C.inChute(speared), 'the speared item was delivered');
  h.ok(R.bodies.tip && R.bodies.tip.y > R.y, 'the rig reports the barb below the hub');
});

h.test('tri-claw grips round things better than the classic (a greased weak claw on balls)', () => {
  const run = (type) => {
    let n = 0;
    for (let s = 0; s < 8; s++) {
      const list = [];
      for (let i = 0; i < 10; i++) list.push(['ball', 60 + i * 30, 330 - (i % 2) * 30]);
      const { W, C } = typeWorld(list);
      const R = PHYS.clawRig(W, { cabinet: C, type, grip: 0.75, grease: 1, rand: U.rng(20 + s) });
      n += grab(W, C, R, 110 + s * 25).delivered;
    }
    return n;
  };
  const tri = run('tri'), classic = run('classic');
  h.ok(tri > 0 && tri >= classic * 0.8, `tri ${tri} vs classic ${classic} balls`);
  const { W } = mkWorld();
  const R = PHYS.clawRig(W, { type: 'tri' }), Rc = PHYS.clawRig(mkWorld().W, {});
  h.ok(R.geo.span < Rc.geo.span, 'the tri-claw is narrower');
  h.ok(R.gripCC() > Rc.gripCC(), 'and grips a little harder');
});

h.test('claw types: upgrades apply (width, grip, third prong, magnet) and setConfig switches type', () => {
  for (const t of TYPES) {
    const { W, C } = mkWorld();
    const R = PHYS.clawRig(W, { cabinet: C, type: t });
    const s0 = R.geo.s, g0 = R.gripCC();
    R.setConfig({ width: 1.36 }); h.ok(R.geo.s > s0, t + ': wider palm is bigger');
    R.setConfig({ grip: 2 }); h.ok(R.gripCC() >= g0, t + ': stronger motor grips harder');
    R.setConfig({ prongs: 3 }); h.ok(R.gripCC() >= g0, t + ': third prong helps');
    R.setConfig({ magnet: 1 }); h.eq(R.cfg.magnet, 1, t + ': the magnet upgrade sticks');
  }
  const { W, C } = mkWorld();
  const R = PHYS.clawRig(W, { cabinet: C });
  R.setConfig({ type: 'magnet' });
  h.eq(R.type, 'magnet', 'setConfig switches the claw type');
  h.eq(R.bodies.prongs[0].length, 0, 'the magnet has no prongs');
  R.setConfig({ type: 'classic' });
  h.eq(R.bodies.prongs[0].length, 4, 'back to two classic prongs');
});

h.test('auto-steer API: an AI takes the claw, drops on arrival, hands it back at home', () => {
  const { W, C } = typeWorld([['ball', 300, 340], ['shield', 120, 340]]);
  const R = PHYS.clawRig(W, { cabinet: C, rand: U.rng(1) });
  const ax = R.aimAt((b) => b.spec.kind === 'ball');
  h.ok(Math.abs(ax - 300) < 20, 'aimAt finds the ball');
  h.eq(R.aimAt(() => false), null, 'aimAt with no match is null');
  h.ok(R.autoSteer(ax, { drop: true, speed: 2 }), 'autoSteer accepted while idle');
  h.ok(R.auto && R.auto.drop && R.auto.speed === 2, 'R.auto describes the AI steer');
  h.eq(R.setTarget(50), false, 'the player cannot steer while the AI has the claw');
  const ev = [];
  let t = 0, dropAt = -1;
  while (t < 15) { const e = R.update(DT); ev.push(...e); if (e.includes('drop') && dropAt < 0) dropAt = t; W.step(DT); t += DT; if (ev.includes('home')) break; }
  ev.push(...R.update(DT));
  h.ok(dropAt > 0 && dropAt < 1.2, `the drop fired on arrival at double speed (${dropAt.toFixed(2)} s)`);
  h.ok(ev.includes('home'), 'the grab ran home');
  h.eq(R.auto, null, 'the claw is handed back at home');
  h.ok(R.setTarget(200), 'the player steers again');
  h.ok(R.autoSteer(100), 'autoSteer without a drop');
  R.cancelAuto();
  h.eq(R.auto, null, 'cancelAuto hands it back');
  R.setTarget(R.x); R.drop();
  for (let i = 0; i < 20; i++) { R.update(DT); W.step(DT); }
  h.eq(R.phase, 'dropping', 'dropping');
  h.eq(R.autoSteer(100), false, 'autoSteer is refused while busy');
});

h.test('claw types are deterministic with a seeded rand', () => {
  for (const t of ['magnet', 'hook', 'hand', 'scoop']) {
    const run = () => {
      const list = [];
      for (let i = 0; i < 12; i++) list.push([i % 2 ? 'sword' : 'ball', 50 + i * 28, 300, i % 3 ? METAL : null]);
      const { W, C } = typeWorld(list);
      const R = PHYS.clawRig(W, { cabinet: C, type: t, rand: U.rng(77) });
      grab(W, C, R, 190);
      return items(W).map(b => b.x.toFixed(6) + ',' + b.y.toFixed(6)).join('|');
    };
    h.eq(run(), run(), t + ' is deterministic');
  }
});

// ---- CR8 (round 8): the vacuum nozzle and the twin claws (DESIGN.md "Mama Mech and two new claws")
const LIGHT = { tags: ['light'] }, HEAVY = { tags: ['heavy', 'metal'] };
/* Run one grab and watch it: {delivered, events, tubeMax, clogs, sawTube (a body flying up the hose), tubeCollided, cargoSides}. */
function watchGrab(W, C, R, x) {
  const out = { events: [], tubeMax: 0, clog: null, sawUp: false, tubeHits: 0, carry: null, heads: null };
  R.setTarget(x);
  for (let i = 0; i < 90 && !R.calm(); i++) { out.events.push(...R.update(DT)); W.step(DT); }
  R.drop();
  let started = false;
  for (let i = 0; i < 1200; i++) {
    out.events.push(...R.update(DT)); W.step(DT);
    const tube = R.tube ? R.tube() : [];
    out.tubeMax = Math.max(out.tubeMax, tube.length);
    for (const b of tube) { if (b.y < R.y) out.sawUp = true; if (W.contacts.some(c => c.a === b || c.b === b)) out.tubeHits++; }
    if (R.ctl.clog && !out.clog) out.clog = R.ctl.clog;
    if (R.phase === 'carrying' && !out.carry) { out.carry = R.locked().map(b => ({ x: b.x, y: b.y })); out.heads = R.bodies.twin ? R.bodies.twin.map(p => ({ x: p.x, y: p.y })) : null; }
    if (R.phase !== 'idle' && R.phase !== 'moving') started = true;
    if (started && R.phase === 'idle') break;
  }
  out.events.push(...R.update(DT));
  out.delivered = items(W).filter(b => C.inChute(b));
  return out;
}

h.test('CR8 vacuum: small light things fly up the wand into the canister and blow out into the chute', () => {
  let best = 0, total = 0;
  for (const x of [170, 200, 230]) {
    const list = [];
    for (let i = 0; i < 12; i++) list.push(['marble', 150 + (i % 6) * 20, 280 + Math.floor(i / 6) * 22, LIGHT]);
    const { W, C } = typeWorld(list);
    const R = PHYS.clawRig(W, { cabinet: C, type: 'vacuum', rand: U.rng(5) });
    const g = watchGrab(W, C, R, x);
    best = Math.max(best, g.delivered.length); total += g.delivered.length;
    h.ok(g.events.includes('suck') && g.events.includes('blow') && g.events.includes('release') && g.events.includes('home'), 'the vacuum sucks, carries, blows and comes home');
    h.ok(g.tubeMax >= 2 && g.tubeMax <= 3, `the canister holds up to three (${g.tubeMax})`);
    h.ok(g.sawUp, 'the catch rides up above the nozzle');
    h.eq(g.tubeHits, 0, 'nothing in the hose collides with anything');
    h.ok(!anyNaN(W) && inside(W, C), 'sane and inside the glass');
    h.ok(W.bodies.every(b => !b.tube), 'the hose is empty once the claw is home');
  }
  h.ok(best >= 3, `a canister of three is delivered (best ${best})`);
  h.ok(total >= 7, `the vacuum delivers handfuls of small things (${total} over 3 grabs)`);
});

h.test('CR8 vacuum: heavy things resist, and a big light thing clogs the nozzle until it is let go', () => {
  // heavy lead balls under the nozzle: tugged at, never sucked up
  let up = 0;
  for (const x of [160, 220]) {
    const { W, C } = typeWorld([['marble', x, 350, HEAVY], ['marble', x + 20, 350, HEAVY], ['marble', x - 20, 350, HEAVY]]);
    for (const b of items(W)) { b.m *= 3; b.invM = 1 / b.m; }
    const R = PHYS.clawRig(W, { cabinet: C, type: 'vacuum', rand: U.rng(6) });
    up += watchGrab(W, C, R, x).tubeMax;
  }
  h.eq(up, 0, 'heavy things never fly up the hose');
  // a big light thing (a card, a paper sword): sucked into the mouth, it plugs it
  let clogs = 0, released = 0, noSuckWhileClogged = true;
  for (const x of [150, 200, 250]) {
    const { W, C } = typeWorld([['sword', x, 340, LIGHT], ['marble', x + 60, 350, LIGHT]]);
    const sw = items(W).find(b => b.spec.kind === 'cap');
    sw.m = 3; sw.invM = 1 / 3;
    const R = PHYS.clawRig(W, { cabinet: C, type: 'vacuum', rand: U.rng(7) });
    let clog = null, n0 = 0;
    R.setTarget(x); for (let i = 0; i < 90 && !R.calm(); i++) { R.update(DT); W.step(DT); }
    R.drop();
    const ev = [];
    for (let i = 0; i < 1200; i++) {
      ev.push(...R.update(DT)); W.step(DT);
      if (R.ctl.clog && !clog) { clog = R.ctl.clog; n0 = R.tube().length; }
      if (clog && R.ctl.clog && R.tube().length > n0) noSuckWhileClogged = false;
      if (R.phase === 'idle' && i > 30) break;
    }
    ev.push(...R.update(DT));
    if (clog) { clogs++; h.ok(clog === sw, 'the big thing is the plug'); h.ok(ev.includes('clog') && ev.includes('unclog'), 'clog and unclog events'); }
    if (clog && !R.ctl.clog) released++;
    h.ok(R.stuck().length === 0 && !R.ctl.clog, 'nothing stays plugged once the claw is home');
  }
  h.ok(clogs >= 2, `a big light thing clogs the nozzle (${clogs}/3)`);
  h.eq(released, clogs, 'every clog is let go');
  h.ok(noSuckWhileClogged, 'a clogged nozzle sucks nothing else up');
});

h.test('CR8 twin claws: two heads grab two prizes separately, each on its own cable', () => {
  let pairs = 0;
  for (const [a, b] of [[170, 212], [180, 230], [150, 196], [240, 290]]) {
    const { W, C } = typeWorld([['marble', a, 350], ['marble', b, 350]]);
    const R = PHYS.clawRig(W, { cabinet: C, type: 'twin', rand: U.rng(8) });
    h.ok(R.bodies.twin && R.bodies.twin.length === 2 && R.bodies.prongs.length === 4, 'two heads, four prongs');
    const g = watchGrab(W, C, R, (a + b) / 2);
    if (g.carry && g.carry.length === 2 && g.heads) {
      // one prize under each head
      const [p, q] = g.carry.slice().sort((u, v) => u.x - v.x);
      if (Math.abs(p.x - g.heads[0].x) < 14 && Math.abs(q.x - g.heads[1].x) < 14) pairs++;
    }
    h.ok(g.events.includes('close') && g.events.includes('home'), 'the twin cycle runs');
    h.ok(!anyNaN(W) && inside(W, C), 'sane and inside the glass');
    if (g.delivered.length === 2) pairs += 0;
  }
  h.ok(pairs >= 3, `each head carries its own prize (${pairs}/4)`);
  // the heads seek: with prizes wider apart than home, they slide out to them
  const { W, C } = typeWorld([['marble', 160, 350], ['marble', 240, 350]]);
  const R = PHYS.clawRig(W, { cabinet: C, type: 'twin', rand: U.rng(9) });
  const home = R.bodies.twin[1].x - R.bodies.twin[0].x;
  const g = watchGrab(W, C, R, 200);
  h.ok(g.delivered.length === 2, `both prizes delivered (${g.delivered.length})`);
  h.ok(g.events.includes('touch'), 'a head landing is a touch');
  // independent cables: a block up on a tower shield lying flat for one head, a marble on the floor for the other
  const w2 = mkWorld();
  spawn(w2.W, ITEM.tower({}), 165, 360, { angle: Math.PI / 2, data: { tags: [] } });
  spawn(w2.W, { shape: { kind: 'box', w: 22, h: 14 } }, 165, 330, { data: { tags: [] } });
  spawn(w2.W, ITEM.marble({}), 226, 370, { data: { tags: [] } });
  settle(w2.W, 1.5);
  const R2 = PHYS.clawRig(w2.W, { cabinet: w2.C, type: 'twin', rand: U.rng(10) });
  R2.setTarget(195); for (let i = 0; i < 90 && !R2.calm(); i++) { R2.update(DT); w2.W.step(DT); }
  R2.drop();
  let reel = 0;
  for (let i = 0; i < 400 && R2.phase !== 'lifting'; i++) { R2.update(DT); w2.W.step(DT); reel = Math.max(reel, Math.abs(R2.ctl.tw.d[0] - R2.ctl.tw.d[1])); }
  h.ok(reel > 12, `one head reels out further than the other (${reel.toFixed(0)} px)`);
  h.ok(home > 0, 'the heads hang apart at home');
});

h.test('CR8 new claws: upgrades apply sensibly, the auto-steer drives them, a rebuild empties the hose, determinism', () => {
  for (const t of ['vacuum', 'twin']) {
    const { W, C } = typeWorld([['marble', 200, 350], ['marble', 240, 350], ['ball', 120, 340]]);
    const R = PHYS.clawRig(W, { cabinet: C, type: t, rand: U.rng(11) });
    const ax = R.aimAt((b) => b.spec.r === 9 || (b.spec.kind === 'ball' && b.spec.r < 12));
    h.ok(ax != null, t + ': aimAt finds a prize');
    h.ok(R.autoSteer(ax, { drop: true, speed: 1.8 }), t + ': autoSteer accepted');
    h.eq(R.setTarget(50), false, t + ': the player cannot steer while the AI has it');
    const ev = [];
    for (let i = 0; i < 1200 && !ev.includes('home'); i++) { ev.push(...R.update(DT)); W.step(DT); }
    h.ok(ev.includes('drop') && ev.includes('home'), t + ': the AI grab runs home');
    h.eq(R.auto, null, t + ': handed back at home');
  }
  // the vacuum: a Wider Palm and the Third Prong each add a slot and widen the bore
  {
    const { W, C } = mkWorld();
    const R = PHYS.clawRig(W, { cabinet: C, type: 'vacuum' });
    const s0 = R.geo.s;
    R.setConfig({ width: 1.36 });
    h.ok(R.geo.s > s0, 'a wider nozzle');
    R.setConfig({ prongs: 3 });
    R.update(DT);
    h.eq(R.vac.cap, 5, 'the canister holds five with both upgrades');
  }
  // a rebuild mid-suck lets everything in the hose drop where it is
  {
    const list = [];
    for (let i = 0; i < 8; i++) list.push(['marble', 170 + (i % 4) * 20, 330 + Math.floor(i / 4) * 20, LIGHT]);
    const { W, C } = typeWorld(list);
    const R = PHYS.clawRig(W, { cabinet: C, type: 'vacuum', rand: U.rng(12) });
    R.setTarget(200); for (let i = 0; i < 90 && !R.calm(); i++) { R.update(DT); W.step(DT); }
    R.drop();
    for (let i = 0; i < 400 && R.tube().length < 1; i++) { R.update(DT); W.step(DT); }
    h.ok(R.tube().length >= 1, 'something is in the hose');
    R.destroy();
    h.ok(W.bodies.every(b => !b.tube), 'destroy empties the hose');
    for (let i = 0; i < 120; i++) W.step(DT);
    h.ok(!anyNaN(W) && inside(W, C), 'the dropped prizes land sanely');
  }
  // a type switch while idle parks the claw at its own height
  {
    const { W, C } = mkWorld();
    const R = PHYS.clawRig(W, { cabinet: C, type: 'classic' });
    const y0 = R.y;
    R.setConfig({ type: 'vacuum' });
    h.ok(R.y > y0 + 40, 'the vacuum parks lower (its canister rides above)');
    R.setConfig({ type: 'twin' });
    h.ok(R.y === y0 && R.bodies.twin && R.bodies.prongs.length === 4, 'the twin parks on the rail with its two heads');
    R.setConfig({ type: 'classic' });
    h.ok(R.bodies.prongs.length === 2 && !R.bodies.twin, 'back to one classic claw');
  }
  for (const t of ['vacuum', 'twin']) {
    const run = () => {
      const list = [];
      for (let i = 0; i < 12; i++) list.push([i % 3 ? 'marble' : 'sword', 60 + i * 28, 300, i % 2 ? LIGHT : null]);
      const { W, C } = typeWorld(list);
      const R = PHYS.clawRig(W, { cabinet: C, type: t, rand: U.rng(77) });
      grab(W, C, R, 190);
      return items(W).map(b => b.x.toFixed(6) + ',' + b.y.toFixed(6)).join('|');
    };
    h.eq(run(), run(), t + ' is deterministic');
  }
});

// ---------------------------------------------------------------- ROS (round 10): bubbles, Moon Bounce, Rising Water
h.test('ROS: a bubble floats a prize up to its spot in zero g, deterministic', () => {
  const run = () => {
    const { W } = mkWorld();
    const b = PHYS.body({ type: 'dynamic', shape: { kind: 'box', w: 30, h: 16 }, x: 200, y: 360, density: 0.9 });
    W.add(b);
    W.addHook((hh) => PHYS.rosFloat(b, 180, 150, hh, G));
    let top = 999;
    for (let i = 0; i < 240; i++) { W.step(DT); top = Math.min(top, b.y); }
    return { x: b.x, y: b.y, top };
  };
  const a = run();
  h.ok(Math.abs(a.x - 180) < 3 && Math.abs(a.y - 150) < 3, `it hangs on its spot (${a.x.toFixed(1)}, ${a.y.toFixed(1)})`);
  h.ok(a.top > 120, 'a gentle rise that barely overshoots');
  h.eq(JSON.stringify(run()), JSON.stringify(a), 'the same float twice');
  const b = PHYS.body({ type: 'static', shape: { kind: 'circle', r: 10 }, x: 0, y: 0 });
  PHYS.rosFloat(b, 50, 50, 1 / 240, G);
  h.ok(b.x === 0 && b.vx === 0, 'a static body is never floated');
});
h.test('ROS: Moon Bounce makes a prize spring off the floor', () => {
  const drop = (bounce) => {
    const { W } = mkWorld();
    const b = PHYS.body({ type: 'dynamic', shape: { kind: 'box', w: 30, h: 16 }, x: 200, y: 120, restitution: 0.1 });
    if (bounce) PHYS.rosBounce(b, 0.72);
    W.add(b);
    let hit = false, peak = 999;
    for (let i = 0; i < 180; i++) { W.step(DT); if (b.vy < -40) hit = true; if (hit) peak = Math.min(peak, b.y); }
    return { peak, e: b.restitution };
  };
  const plain = drop(false), moon = drop(true);
  h.ok(moon.e >= 0.72 && plain.e < 0.2, 'the restitution floor');
  h.ok(moon.peak < 300 && moon.peak < plain.peak, `it bounces high (${moon.peak.toFixed(0)} vs ${plain.peak.toFixed(0)})`);
  h.eq(PHYS.rosBounce(null, 1), null, 'nothing to bounce: harmless');
});
h.test('ROS: Rising Water floats light prizes and sinks heavy ones, all inside the glass', () => {
  const { W } = mkWorld();
  const light = PHYS.body({ type: 'dynamic', shape: { kind: 'circle', r: 13 }, x: 120, y: 360, density: 0.5 });
  const heavy = PHYS.body({ type: 'dynamic', shape: { kind: 'box', w: 36, h: 20 }, x: 260, y: 200, density: 2.4 });
  W.add(light); W.add(heavy);
  const S = PHYS.rosFlood(W, { y: 230, xMax: 410, g: G, rho: 0.95 });
  for (let i = 0; i < 360; i++) W.step(DT);
  h.ok(light.y < 260 && light.y > 200, `the duck floats at the surface (${light.y.toFixed(0)})`);
  h.ok(heavy.y > 340, `the heavy thing sinks to the floor (${heavy.y.toFixed(0)})`);
  S.set(300);
  for (let i = 0; i < 240; i++) W.step(DT);
  h.ok(light.y > 260 && light.y < 330, `the water drops and the float goes with it (${light.y.toFixed(0)})`);
  S.remove();
  for (let i = 0; i < 240; i++) W.step(DT);
  h.ok(light.y > 350, 'drained: it falls to the floor');
  h.ok([light, heavy].every(b => b.x > 0 && b.x < 480 && b.y < 390 && Number.isFinite(b.y)), 'nothing leaves the glass');
});

h.done();
