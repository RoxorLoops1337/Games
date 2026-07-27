// Blacksite — logic suite.
//
// The simulation is deliberately free of Three.js and the DOM, so this suite
// imports the real modules straight into Node and drives them. No stubbed
// canvas, no eval'd <script> tag — the code under test here is the code that
// ships. The render side is covered separately by blacksite_render.test.mjs,
// which boots the actual page in headless Chromium.
//
// Run: node tests/blacksite.test.mjs
import { harness } from './no_room_for_heroes_lib.mjs';
import { createState, V, lookDir, mulberry32 } from '../blacksite/src/core/state.js';
import * as C from '../blacksite/src/core/constants.js';
import {
  makeBox, boxFromCenter, buildGrid, queryAABB, raycast, rayBox,
  lineOfSight, moveCharacter, groundBelow,
} from '../blacksite/src/world/collision.js';
import { updatePlayer, damagePlayer, hasHeadroom } from '../blacksite/src/game/player.js';

const t = harness('blacksite');
const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

// A small arena: floor, four walls, a waist-high crate, a kerb one step tall,
// and a low ceiling over one corner. Everything below is measured against it.
function arena() {
  const s = [];
  s.push(boxFromCenter(0, -0.5, 0, 40, 1, 40, C.SURFACE.CONCRETE));       // floor, top at y=0
  s.push(boxFromCenter(0, 2, -20, 40, 4, 1, C.SURFACE.CONCRETE));         // north wall
  s.push(boxFromCenter(0, 2, 20, 40, 4, 1, C.SURFACE.CONCRETE));          // south wall
  s.push(boxFromCenter(-20, 2, 0, 1, 4, 40, C.SURFACE.METAL));            // west wall
  s.push(boxFromCenter(20, 2, 0, 1, 4, 40, C.SURFACE.METAL));             // east wall
  s.push(boxFromCenter(4, 0.55, 0, 2, 1.1, 2, C.SURFACE.WOOD));           // crate, top at 1.1
  s.push(boxFromCenter(-4, 0.15, 0, 2, 0.3, 2, C.SURFACE.SAND));          // kerb, top at 0.3
  s.push(boxFromCenter(-8, 1.35, -8, 4, 0.2, 4, C.SURFACE.METAL));        // low soffit, underside 1.25
  return { statics: s, grid: buildGrid(s), bounds: { min: { x: -25, y: -5, z: -25 }, max: { x: 25, y: 20, z: 25 } } };
}

function game() {
  const G = createState(1234);
  G.world = Object.assign(G.world, arena());
  G.world.ready = true;
  G.player.pos.x = 0; G.player.pos.z = 8; G.player.pos.y = C.EYE_STAND;
  G.player.grounded = true;
  return G;
}

// Steps the simulation with a held input set, the way the real loop would.
function run(G, ticks, setup) {
  for (let i = 0; i < ticks; i++) {
    G.input.pressed = new Set();
    G.input.released = new Set();
    G.input.look.x = 0; G.input.look.y = 0;
    if (setup) setup(G, i);
    G.time.t += C.TICK;
    updatePlayer(G, C.TICK);
    G.events.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────── state
{
  const a = createState(7), b = createState(7);
  t.ok(a !== b && a.player !== b.player, 'createState hands out independent worlds');
  const ra = [a.rng(), a.rng(), a.rng()], rb = [b.rng(), b.rng(), b.rng()];
  t.ok(ra.every((v, i) => v === rb[i]), 'the same seed gives the same random stream');
  t.ok(ra.every((v) => v >= 0 && v < 1), 'the stream stays inside [0,1)');

  const c = mulberry32(999);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(Math.floor(c() * 100));
  t.ok(seen.size > 90, 'and it actually covers the range rather than clustering');

  const d = lookDir(0, 0, {});
  t.ok(Math.abs(d.z + 1) < 1e-9 && Math.abs(d.x) < 1e-9, 'yaw 0 looks down −Z, the level\'s north');
  const e = lookDir(Math.PI / 2, 0, {});
  t.ok(Math.abs(e.x + 1) < 1e-9, 'and a quarter turn left points down −X');
  const f = lookDir(0.7, 0.4, {});
  t.ok(Math.abs(V.len(f) - 1) < 1e-9, 'look directions come back normalised');
}

// ─────────────────────────────────────────────────────────── raycasting
{
  const w = arena();

  const down = raycast(w, { x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 20);
  t.ok(down && Math.abs(down.t - 5) < 1e-6, 'a ray finds the floor at the right distance');
  t.ok(down.normal.y === 1, 'and comes back with an upward normal');
  t.ok(down.surface === C.SURFACE.CONCRETE, 'carrying the surface it hit');

  const east = raycast(w, { x: 0, y: 2, z: 8 }, { x: 1, y: 0, z: 0 }, 100);
  t.ok(east && Math.abs(east.t - 19.5) < 1e-6, 'and the far wall across the whole arena');
  t.ok(east.surface === C.SURFACE.METAL, 'the east wall reports metal, not concrete');

  // The grid walk must not let a ray skip a cell diagonally.
  const diag = raycast(w, { x: -18, y: 2, z: -18 }, V.norm({ x: 1, y: 0, z: 1 }), 100);
  t.ok(diag !== null, 'a diagonal ray still hits something');

  const miss = raycast(w, { x: 0, y: 30, z: 0 }, { x: 0, y: 1, z: 0 }, 50);
  t.ok(miss === null, 'a ray into open sky hits nothing');

  const short = raycast(w, { x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 2);
  t.ok(short === null, 'and maxDist is respected rather than ignored');

  // Nearest-hit ordering: the crate must win over the wall behind it.
  const crate = raycast(w, { x: 12, y: 0.6, z: 0 }, { x: -1, y: 0, z: 0 }, 100);
  t.ok(crate && crate.box.surface === C.SURFACE.WOOD, 'the nearest surface wins, not the first one tested');

  const slab = rayBox(0, 5, 0, 0, -1, 0, w.statics[0]);
  t.ok(slab && slab.tmax > slab.tmin, 'the slab test reports an entry before its exit');
  t.ok(Math.abs(slab.tmax - slab.tmin - 1) < 1e-9, 'and the span across a 1 m slab is 1 m — what penetration reads');

  t.ok(lineOfSight(w, { x: 0, y: 1.6, z: 8 }, { x: 0, y: 1.6, z: -8 }), 'sight down an open lane is clear');
  // The crate tops out at 1.1 m, so it blocks a crouched eye and not a standing
  // one — which is the entire point of waist-high cover, and worth asserting
  // both ways round rather than only the half that happens to pass.
  t.ok(!lineOfSight(w, { x: 10, y: 0.8, z: 0 }, { x: -10, y: 0.8, z: 0 }), 'and blocked by the crate at crouch height');
  t.ok(lineOfSight(w, { x: 10, y: 1.6, z: 0 }, { x: -10, y: 1.6, z: 0 }), 'but open over the top of it standing');

  const g = groundBelow(w, 4, 3, 0);
  t.ok(g && Math.abs(g.y - 1.1) < 1e-6, 'groundBelow lands on the crate lid, not the floor under it');
  t.ok(g.surface === C.SURFACE.WOOD, 'and reports what it landed on');
}

// ─────────────────────────────────────────────────────── broadphase grid
{
  const w = arena();
  const hits = queryAABB(w.grid, { x: 3, y: 0, z: -1 }, { x: 5, y: 2, z: 1 }, []);
  t.ok(hits.includes(w.statics[5]), 'the grid returns the crate for a box overlapping it');
  t.ok(!hits.includes(w.statics[6]), 'and does not return the kerb eight metres away');

  const empty = queryAABB(w.grid, { x: 100, y: 0, z: 100 }, { x: 101, y: 1, z: 101 }, []);
  t.ok(empty.length === 0, 'a query outside the level comes back empty rather than throwing');

  // A box spanning many cells must be reported once, not once per cell.
  const wide = queryAABB(w.grid, { x: -19, y: -1, z: -19 }, { x: 19, y: 5, z: 19 }, []);
  t.ok(new Set(wide).size === wide.length, 'nothing is reported twice however many cells it spans');
}

// ────────────────────────────────────────────────── character collision
{
  const w = arena();

  // Walking into a wall stops, and does not tunnel through it.
  const pos = { x: 0, y: 0, z: 8 };
  const out = {};
  for (let i = 0; i < 400; i++) moveCharacter(w, pos, { x: 0.06, y: 0, z: 0 }, C.CAPSULE_R, C.CAPSULE_H, out);
  t.ok(pos.x < 19.5 - C.CAPSULE_R + 1e-3, 'a body walking into a wall is stopped by it');
  t.ok(pos.x > 19.5 - C.CAPSULE_R - 0.05, 'and stops flush against it rather than short');
  t.ok(finite(pos), 'and its position stays finite');

  // A kerb inside step height is climbed without a jump. Stop while still on
  // top of it — the kerb is only 2 m across, and walking the full 200 ticks
  // steps back down the far side.
  const k = { x: -8, y: 0, z: 0 };
  for (let i = 0; i < 120; i++) moveCharacter(w, k, { x: 0.03, y: -0.02, z: 0 }, C.CAPSULE_R, C.CAPSULE_H, out);
  t.ok(k.y > 0.29 && k.x > -4.5, `a 30 cm kerb is walked up, not bumped into (y=${k.y.toFixed(2)}, x=${k.x.toFixed(2)})`);
  for (let i = 0; i < 80; i++) moveCharacter(w, k, { x: 0.03, y: -0.02, z: 0 }, C.CAPSULE_R, C.CAPSULE_H, out);
  t.ok(k.y < 0.01, 'and stepped back down off the far side');

  // A 1.1 m crate is not.
  const c = { x: 8, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) moveCharacter(w, c, { x: -0.03, y: -0.02, z: 0 }, C.CAPSULE_R, C.CAPSULE_H, out);
  t.ok(c.y < 0.05, 'and waist-high cover is not — it stays cover');
  t.ok(c.x > 5 + C.CAPSULE_R - 0.06, 'stopping against the crate face');

  // Sliding along a wall rather than sticking to it: the Z component survives.
  const s = { x: 19, y: 0, z: 0 };
  const before = s.z;
  for (let i = 0; i < 60; i++) moveCharacter(w, s, { x: 0.05, y: 0, z: 0.05 }, C.CAPSULE_R, C.CAPSULE_H, out);
  t.ok(s.z - before > 2.5, 'a body pressed into a wall still slides along it');

  // Falling lands on the floor, exactly.
  const f = { x: 0, y: 6, z: 0 };
  for (let i = 0; i < 300; i++) moveCharacter(w, f, { x: 0, y: -0.05, z: 0 }, C.CAPSULE_R, C.CAPSULE_H, out);
  t.ok(Math.abs(f.y) < 1e-6 && out.ground, 'a falling body lands on the floor and knows it');

  // A corner is the classic depenetration failure — two pushes that fight.
  const corner = { x: 19, y: 0, z: 19 };
  for (let i = 0; i < 200; i++) moveCharacter(w, corner, { x: 0.05, y: 0, z: 0.05 }, C.CAPSULE_R, C.CAPSULE_H, out);
  t.ok(finite(corner) && corner.x < 19.5 && corner.z < 19.5, 'a body jammed into a corner does not squeeze through it');
}

// ──────────────────────────────────────────────────────── player movement
{
  const G = game();
  run(G, 240, (g) => { g.input.move.x = 0; g.input.move.y = 1; });
  const speed = Math.hypot(G.player.vel.x, G.player.vel.z);
  t.ok(speed > C.SPEED_RUN * 0.9 && speed <= C.SPEED_RUN * 1.02,
    `holding forward reaches run speed and stops there (${speed.toFixed(2)} vs ${C.SPEED_RUN})`);
  t.ok(G.player.pos.z < 8 - 5, 'and it moved the player down −Z, the direction yaw 0 faces');

  // Releasing the stick stops in well under a second — the friction floor is
  // what stops the exponential tail leaving you creeping.
  run(G, 90, (g) => { g.input.move.x = 0; g.input.move.y = 0; });
  t.ok(Math.hypot(G.player.vel.x, G.player.vel.z) < 0.05, 'releasing the stick stops the player crisply');
}

{
  const G = game();
  run(G, 240, (g) => { g.input.move.y = 1; g.input.buttons = new Set(['sprint']); });
  const speed = Math.hypot(G.player.vel.x, G.player.vel.z);
  t.ok(G.player.sprinting, 'holding sprint while pushing forward sprints');
  t.ok(speed > C.SPEED_RUN + 0.4, `and sprint is meaningfully faster than a run (${speed.toFixed(2)})`);

  // Sprinting sideways is not sprinting — the animation and the fiction both
  // depend on that being forward-only.
  const H = game();
  run(H, 120, (g) => { g.input.move.x = 1; g.input.move.y = 0; g.input.buttons = new Set(['sprint']); });
  t.ok(!H.player.sprinting, 'strafing does not sprint');
}

{
  const G = game();
  let peak = 0;
  run(G, 20, (g) => { g.input.buttons = new Set(); });
  const floor = G.player.pos.y;
  run(G, 150, (g, i) => {
    if (i === 0) g.input.pressed = new Set(['jump']);
    peak = Math.max(peak, g.player.pos.y - floor);
  });
  t.ok(peak > 0.7 && peak < 1.3, `a jump clears roughly a metre (${peak.toFixed(2)} m)`);
  t.ok(Math.abs(G.player.pos.y - floor) < 1e-3, 'and comes back down to where it started');
  t.ok(G.player.grounded, 'landing restores grounded');
}

{
  // Jump buffering: a press made while still airborne must survive until the
  // landing and fire there, rather than being swallowed. Press once, land, then
  // press again a few ticks before touchdown and check the second jump happens
  // without any further input.
  const G = game();
  run(G, 5);
  G.input.pressed = new Set(['jump']);
  G.time.t += C.TICK; updatePlayer(G, C.TICK); G.events.length = 0;
  run(G, 20);
  t.ok(!G.player.grounded && G.player.pos.y > C.EYE_STAND + 0.2, 'the jump left the ground');

  // Flight is ~0.58 s; press at 0.5 s, which is airborne but inside the buffer.
  run(G, 40);
  G.input.pressed = new Set(['jump']);
  G.time.t += C.TICK; updatePlayer(G, C.TICK); G.events.length = 0;
  t.ok(G.player.jumpBuffer > 0, 'a jump pressed in the air is remembered');
  let jumpedAgain = false;
  run(G, 30, (g) => { if (g.player.vel.y > 1) jumpedAgain = true; });
  t.ok(jumpedAgain, 'and fires on landing without a second press');

  // Coyote time: walking off a ledge still allows a jump for a moment.
  const H = game();
  H.player.pos.x = 4; H.player.pos.z = 0; H.player.pos.y = 1.1 + C.EYE_STAND;
  run(H, 4, (g) => { g.input.move.y = 1; });
  t.ok(H.player.coyote > 0 || H.player.grounded, 'standing on the crate keeps coyote time charged');
}

{
  const G = game();
  run(G, 60, (g) => { g.input.buttons = new Set(['crouch']); });
  t.ok(G.player.stance === 'crouch', 'holding crouch crouches');
  t.ok(G.player.eye < C.EYE_STAND - 0.3, `and the eye actually drops (${G.player.eye.toFixed(2)} m)`);
  const speedBefore = C.SPEED_CROUCH;
  run(G, 120, (g) => { g.input.buttons = new Set(['crouch']); g.input.move.y = 1; });
  t.ok(Math.hypot(G.player.vel.x, G.player.vel.z) <= speedBefore * 1.05, 'crouch-walking is slow');
  run(G, 90, (g) => { g.input.buttons = new Set(); });
  t.ok(G.player.stance === 'stand' && G.player.eye > C.EYE_STAND - 0.02, 'and releasing stands back up');
}

{
  // Under a 1.25 m soffit there is no headroom, so crouch must stick.
  const G = game();
  G.player.pos.x = -8; G.player.pos.z = -8;
  G.player.pos.y = 0 + C.EYE_CROUCH; G.player.eye = C.EYE_CROUCH; G.player.stance = 'crouch';
  t.ok(!hasHeadroom(G.world, G.player.pos, G.player.eye), 'a low soffit reads as no headroom');
  run(G, 120, (g) => { g.input.buttons = new Set(); });
  t.ok(G.player.stance === 'crouch', 'and the player stays crouched rather than clipping through it');
}

{
  // Sprint into crouch is a slide, and the slide ends on its own.
  const G = game();
  run(G, 240, (g) => { g.input.move.y = 1; g.input.buttons = new Set(['sprint']); });
  t.ok(G.player.sprinting, 'up to sprint speed first');
  run(G, 3, (g) => { g.input.move.y = 1; g.input.buttons = new Set(['sprint', 'crouch']); });
  t.ok(G.player.stance === 'slide', 'crouching at sprint speed slides');
  run(G, Math.ceil(C.SLIDE_TIME / C.TICK) + 60, (g) => { g.input.move.y = 1; g.input.buttons = new Set(['sprint']); });
  t.ok(G.player.stance !== 'slide', 'and the slide ends by itself rather than lasting forever');
}

{
  // Adversarial input for a long run: nothing may go non-finite or escape.
  const G = game();
  let broke = null;
  for (let i = 0; i < 4000 && !broke; i++) {
    G.input.move.x = Math.sin(i * 0.13) * 1.4;      // deliberately over-range
    G.input.move.y = Math.cos(i * 0.07) * 1.4;
    G.input.look.x = Math.sin(i * 0.31) * 40;
    G.input.look.y = Math.cos(i * 0.19) * 40;
    G.input.buttons = new Set(i % 7 === 0 ? ['sprint', 'crouch'] : i % 3 === 0 ? ['crouch'] : ['sprint']);
    G.input.pressed = new Set(i % 23 === 0 ? ['jump'] : []);
    G.time.t += C.TICK;
    updatePlayer(G, C.TICK);
    G.events.length = 0;
    if (!finite(G.player.pos) || !finite(G.player.vel) || !Number.isFinite(G.player.yaw)) broke = i;
  }
  t.ok(broke === null, 'four thousand ticks of adversarial input keeps everything finite');
  t.ok(Math.abs(G.player.pos.x) < 20 && Math.abs(G.player.pos.z) < 20, 'and inside the arena walls');
  t.ok(G.player.pos.y > -1, 'and above the floor rather than through it');
  t.ok(Math.abs(G.player.pitch) <= 1.54 + 1e-9, 'pitch stayed clamped short of straight up');
}

// ──────────────────────────────────────────────────────────────── damage
{
  const G = game();
  const dealt = damagePlayer(G, 30, 'test');
  t.ok(dealt === 30 && Math.abs(G.player.hp - 70) < 1e-9, 'damage comes off health');
  t.ok(G.events.some((e) => e.type === 'playerHurt'), 'and announces itself as an event');
  G.events.length = 0;

  // Regeneration waits out the delay, then returns health at the stated rate.
  G.time.t += C.REGEN_DELAY + 0.01;
  run(G, 120);
  t.ok(G.player.hp > 70 && G.player.hp < 100, 'health regenerates after the out-of-combat delay');
  const mid = G.player.hp;
  damagePlayer(G, 5, 'test');
  run(G, 60);
  t.ok(G.player.hp < mid + 1, 'and taking a hit restarts the delay rather than continuing');

  G.events.length = 0;
  damagePlayer(G, 999, 'test');
  t.ok(!G.player.alive && G.player.hp === 0, 'enough damage kills, and health floors at zero');
  t.ok(G.mode === 'dead' && G.events.some((e) => e.type === 'playerDied'), 'and the run ends');
  t.ok(damagePlayer(G, 10, 'test') === 0, 'a corpse takes no further damage');
}

// ───────────────────────────────────────────────────────── constants sanity
{
  t.ok(C.SPEED_SPRINT > C.SPEED_RUN && C.SPEED_RUN > C.SPEED_WALK && C.SPEED_WALK > C.SPEED_CROUCH,
    'the speed ladder is ordered the way the stances imply');
  t.ok(C.EYE_CROUCH < C.EYE_STAND && C.EYE_CROUCH > 0.6, 'crouched eye height is lower but still human');
  t.ok(C.STEP_HEIGHT < C.EYE_CROUCH && C.STEP_HEIGHT > 0.2, 'step height climbs a kerb but not a table');
  t.ok(C.GRAVITY < -9.81, 'gravity is heavier than reality, which is what makes the jump feel crisp');

  const jumpApex = (C.JUMP_SPEED * C.JUMP_SPEED) / (2 * -C.GRAVITY);
  t.ok(jumpApex > 0.7 && jumpApex < 1.2, `and the jump apex lands near a metre (${jumpApex.toFixed(2)} m)`);

  t.ok(C.HITBOX.HEAD > C.HITBOX.CHEST && C.HITBOX.CHEST > C.HITBOX.LEG, 'hit regions are ordered head > chest > leg');
  t.ok(C.HITBOX.HEAD < 3, 'and a headshot is a reward, not an instant win');

  for (const k of Object.keys(C.SURFACE)) {
    const id = C.SURFACE[k];
    t.ok(C.PENETRATION[id] !== undefined, `every surface has penetration data (${k})`);
  }
  t.ok(C.PENETRATION[C.SURFACE.METAL].loss > C.PENETRATION[C.SURFACE.WOOD].loss,
    'and metal eats more of a bullet than wood does');
}

t.done();
