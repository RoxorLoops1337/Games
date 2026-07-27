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
import {
  WEAPONS, WEAPON_IDS, createWeapons, updateWeapons, setLoadout,
  activeWeapon, currentSpread,
} from '../blacksite/src/game/weapons.js';
import { damageAtRange, penetrationLoss, MAX_PENETRATIONS } from '../blacksite/src/game/ballistics.js';

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

// Drives the weapon simulation the way the real loop does, collecting every
// event rather than discarding it. `hold` is the button set held down; `tap`
// fires a press on the tick it names.
function drive(G, seconds, hold = [], tap = null) {
  const events = [];
  const ticks = Math.round(seconds / C.TICK);
  for (let i = 0; i < ticks; i++) {
    G.input.buttons = new Set(typeof hold === 'function' ? hold(i) : hold);
    G.input.pressed = new Set(tap ? tap(i) || [] : []);
    G.input.released = new Set();
    G.time.t += C.TICK;
    updateWeapons(G, C.TICK);
    for (const e of G.events) events.push(e);
    G.events.length = 0;
  }
  return events;
}

function armed(id, seed = 4242) {
  const G = createState(seed);
  G.world = Object.assign(G.world, arena());
  G.world.ready = true;
  G.player.pos.x = 0; G.player.pos.z = 8; G.player.pos.y = C.EYE_STAND;
  G.player.grounded = true;
  createWeapons(G, [id]);
  return G;
}

const count = (evts, type) => evts.filter((e) => e.type === type).length;

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

// ────────────────────────────────────────────────────── the roster is coherent
{
  t.ok(WEAPON_IDS.length >= 5, `the roster has real breadth (${WEAPON_IDS.length} weapons)`);
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id];
    t.ok(w.rpm > 0 && w.mag > 0 && w.dmg.near > 0, `${id} has usable numbers`);
    t.ok(w.dmg.far <= w.dmg.near, `${id} does not get stronger with distance`);
    t.ok(w.dmg.d1 > w.dmg.d0, `${id}'s falloff band runs the right way`);
    t.ok(w.spread.ads < w.spread.hip, `${id} is tighter down the sights than from the hip`);
  }

  // The whole point of a roster is that the tools disagree about range. If the
  // rifle beat the SMG at both 8 m and 40 m there would be no choice to make.
  const rifle = WEAPONS.rifle, smg = WEAPONS.smg;
  const shots = (w, d) => Math.ceil(100 / damageAtRange(w, d));
  const ttk = (w, d) => (shots(w, d) - 1) * (60 / w.rpm);
  t.ok(ttk(smg, 8) < ttk(rifle, 8), `the SMG wins the doorway (${(ttk(smg, 8) * 1000) | 0} ms vs ${(ttk(rifle, 8) * 1000) | 0} ms at 8 m)`);
  t.ok(ttk(rifle, 40) < ttk(smg, 40), `and the rifle wins the courtyard (${(ttk(rifle, 40) * 1000) | 0} ms vs ${(ttk(smg, 40) * 1000) | 0} ms at 40 m)`);
  t.ok(smg.adsTime < rifle.adsTime, 'and the SMG gets to the sights first');
}

// ────────────────────────────────────────────────────────── damage falloff
{
  const w = WEAPONS.rifle;
  t.ok(Math.abs(damageAtRange(w, 0) - w.dmg.near) < 1e-9, 'point blank is the near value exactly');
  t.ok(Math.abs(damageAtRange(w, w.dmg.d0) - w.dmg.near) < 1e-9, 'the plateau holds right up to the shoulder');
  t.ok(Math.abs(damageAtRange(w, w.dmg.d1) - w.dmg.far) < 1e-9, 'and the floor is reached exactly at the far edge');
  t.ok(Math.abs(damageAtRange(w, 500) - w.dmg.far) < 1e-9, 'past which it stops falling rather than going negative');

  const mid = damageAtRange(w, (w.dmg.d0 + w.dmg.d1) / 2);
  t.ok(Math.abs(mid - (w.dmg.near + w.dmg.far) / 2) < 0.02,
    `the band's midpoint is the mean, so the curve is symmetric (${mid.toFixed(2)})`);

  // An S-curve sits above a straight line in the first half of the band. That
  // shoulder is what keeps a weapon feeling like itself just past its range.
  const q = w.dmg.d0 + (w.dmg.d1 - w.dmg.d0) * 0.25;
  const linear = w.dmg.near + (w.dmg.far - w.dmg.near) * 0.25;
  t.ok(damageAtRange(w, q) > linear, 'and the near shoulder stays above a linear falloff');

  let prev = Infinity;
  for (let d = 0; d <= 120; d += 2) {
    const v = damageAtRange(w, d);
    if (v > prev + 1e-9) { prev = -1; break; }
    prev = v;
  }
  t.ok(prev !== -1, 'damage never rises as the target gets further away');
}

// ──────────────────────────────────────────────────────────── penetration
{
  const thin = penetrationLoss(C.SURFACE.WOOD, 4, 1);
  const thick = penetrationLoss(C.SURFACE.WOOD, 30, 1);
  t.ok(thin > thick, 'thicker material takes more out of a bullet');
  t.ok(thin > 0 && thin <= 1, 'and the survivor fraction stays a fraction');
  t.ok(penetrationLoss(C.SURFACE.METAL, 4, 1) < penetrationLoss(C.SURFACE.WOOD, 4, 1),
    'metal eats more of a round than wood at the same thickness');
  t.ok(penetrationLoss(C.SURFACE.CONCRETE, 4, 2) > penetrationLoss(C.SURFACE.CONCRETE, 4, 1),
    'and a more powerful round keeps more of itself through the same wall');
  t.ok(penetrationLoss(C.SURFACE.CONCRETE, 400, 1) === 0, 'past the limit a round is simply stopped');
  t.ok(MAX_PENETRATIONS >= 1 && MAX_PENETRATIONS <= 3,
    'a bullet crosses a bounded number of surfaces rather than the whole level');
}

// ──────────────────────────────────────────────────────────── rate of fire
{
  // The load-bearing case is a weapon whose cycle is not a whole number of
  // ticks: 1000 rpm is 0.06 s against a 1/120 s step. If the accumulator
  // quantises to the tick, the SMG silently fires at 857 rpm instead. Load the
  // gun far past its magazine so the window measures the rate and nothing else.
  for (const id of ['rifle', 'smg']) {
    const G = armed(id);
    const w = activeWeapon(G);
    w.mag = 9999; w.ammo = 9999;
    const fired = count(drive(G, 2, ['fire']), 'shot');
    const expect = WEAPONS[id].rpm / 30;          // rounds in two seconds
    t.ok(Math.abs(fired - expect) <= 1,
      `${id} holds its stated ${WEAPONS[id].rpm} rpm across a non-integer tick cycle (${fired} vs ${expect})`);
  }

  // Running dry on a held trigger dry-fires once and reloads itself. Every
  // shooter does this; the alternative is standing in the open pulling a dead
  // trigger. The count that matters is that it is *one* dryfire, not one per
  // tick for the length of the reload.
  const G = armed('smg');
  const evts = drive(G, 5, ['fire']);
  const w = activeWeapon(G);
  const mag = WEAPONS.smg.mag;
  t.ok(count(evts, 'shot') > mag, `a held trigger keeps firing past the first magazine (${count(evts, 'shot')})`);
  t.ok(count(evts, 'dryfire') === 1, `announcing exactly one dry trigger, not one a tick (${count(evts, 'dryfire')})`);
  t.ok(evts.some((e) => e.type === 'reload' && e.phase === 'start'), 'because it reloaded itself');
  t.ok(w.res < WEAPONS.smg.reserve, 'and the rounds came out of the reserve');
}

// ─────────────────────────────────────────────────── trigger discipline
{
  // A semi-auto must fire once per press however long the button is held.
  const G = armed('dmr');
  const evts = drive(G, 1.5, ['fire']);
  t.ok(count(evts, 'shot') === 1, `holding fire on a semi-auto fires once (${count(evts, 'shot')})`);

  // And clicking it must not silently eat inputs — that is what the buffer is for.
  const H = armed('dmr');
  const clicks = drive(H, 2.0, (i) => (i % 40 < 4 ? ['fire'] : []));
  t.ok(count(clicks, 'shot') >= 4, `clicking a semi-auto fires every click (${count(clicks, 'shot')})`);
}

// ──────────────────────────────────────────────────────────── the shotgun
{
  const G = armed('shotgun');
  const evts = drive(G, 0.3, ['fire']);
  const shot = evts.find((e) => e.type === 'shot');
  t.ok(shot, 'the shotgun fires');
  t.ok(shot.pellets > 1, `and throws a pattern rather than a bullet (${shot.pellets} pellets)`);
  t.ok(count(evts, 'trace') === shot.pellets, 'with one traced ray per pellet');
  t.ok(count(evts, 'shot') === 1, 'and a pump gun fires once per trigger pull');
}

// ─────────────────────────────────────────────────────────────── recoil
{
  const G = armed('rifle');
  drive(G, 1.2, ['fire']);
  t.ok(Math.abs(G.recoil.pitch) > 0.005, `firing actually moves the aim (${G.recoil.pitch.toFixed(4)} rad)`);
  const climbed = G.recoil.pitch;
  drive(G, 1.2, []);
  t.ok(Math.abs(G.recoil.pitch) < Math.abs(climbed) * 0.05,
    `and it recovers to the pre-fire point when the trigger is released (${G.recoil.pitch.toFixed(5)} rad)`);
  t.ok(Number.isFinite(G.recoil.yaw) && Number.isFinite(G.recoil.kick), 'with nothing left non-finite');

  // Recoil has to be a shape you can learn. Different seeds must produce
  // near-identical climbs, or the only counter is luck.
  const paths = [1, 2, 3, 4, 5].map((s) => {
    const g = armed('rifle', s * 7919);
    drive(g, 20 * (60 / WEAPONS.rifle.rpm) + 0.02, ['fire']);
    return g.recoil.pitch;
  });
  const lo = Math.min(...paths), hi = Math.max(...paths);
  const spreadDeg = (hi - lo) * 180 / Math.PI;
  t.ok(spreadDeg < 0.5, `a twenty-shot climb varies by under half a degree across seeds (${spreadDeg.toFixed(3)}°)`);
  t.ok(Math.abs(paths[0]) > 0.02, 'while still being a climb worth countering');

  // Same seed, same everything — the property the whole suite rests on.
  const a = armed('rifle', 999), b = armed('rifle', 999);
  drive(a, 0.8, ['fire']); drive(b, 0.8, ['fire']);
  t.ok(a.recoil.pitch === b.recoil.pitch && a.recoil.yaw === b.recoil.yaw,
    'two runs from the same seed produce bit-identical recoil');
}

// ─────────────────────────────────────────────────────────────── spread
{
  const G = armed('rifle');
  const w = activeWeapon(G);

  G.player.stance = 'stand'; G.player.ads = 0; G.player.grounded = true;
  V.set(G.player.vel, 0, 0, 0);
  const still = currentSpread(G, w);

  G.player.ads = 1;
  const ads = currentSpread(G, w);

  G.player.ads = 0; G.player.stance = 'crouch';
  const crouch = currentSpread(G, w);

  G.player.stance = 'stand'; V.set(G.player.vel, 4, 0, 0);
  const moving = currentSpread(G, w);

  V.set(G.player.vel, 0, 0, 0); G.player.grounded = false;
  const air = currentSpread(G, w);

  t.ok(ads < crouch, 'aiming is tighter than crouching');
  t.ok(crouch < still, 'crouching is tighter than standing');
  t.ok(still < moving, 'standing still is tighter than moving');
  t.ok(moving < air, 'and everything is tighter than being airborne');

  // Firing blooms the cone, and letting go closes it again.
  const H = armed('rifle');
  const hw = activeWeapon(H);
  H.player.grounded = true;
  const base = currentSpread(H, hw);
  drive(H, 0.6, ['fire']);
  t.ok(currentSpread(H, hw) > base, 'firing opens the cone');
  drive(H, 2.5, []);
  t.ok(Math.abs(currentSpread(H, hw) - base) < 1e-6, 'and it closes back to exactly the base, not near it');
}

// ─────────────────────────────────────────────────────────────── reloading
{
  // A round left in the chamber is a round you keep.
  const G = armed('rifle');
  const w = activeWeapon(G);
  drive(G, 0.3, ['fire']);
  const spent = w.ammo;
  t.ok(spent > 0 && spent < w.mag, 'fired a few rounds without emptying the magazine');
  const evts = drive(G, 3.2, [], (i) => (i === 0 ? ['reload'] : []));
  t.ok(w.ammo === w.mag + 1, `a tactical reload keeps the chambered round (${w.ammo} = mag+1)`);

  const phases = evts.filter((e) => e.type === 'reload').map((e) => e.phase);
  t.ok(phases[0] === 'start' && phases[phases.length - 1] === 'end',
    `the reload runs start → … → end (${phases.join(',')})`);
  t.ok(phases.includes('magout') && phases.includes('magin'), 'passing through both magazine phases');

  // Emptying the gun costs the chambered round and the longer reload.
  const H = armed('rifle');
  const hw = activeWeapon(H);
  drive(H, 5, ['fire']);
  t.ok(hw.ammo === 0, 'held the trigger until it was empty');
  drive(H, 4, [], (i) => (i === 0 ? ['reload'] : []));
  t.ok(hw.ammo === hw.mag, `an empty reload gives exactly a magazine, not mag+1 (${hw.ammo})`);
}

{
  // Sprinting cancels a reload without eating the ammunition.
  const G = armed('rifle');
  const w = activeWeapon(G);
  drive(G, 0.3, ['fire']);
  const before = w.ammo, res = w.res;
  drive(G, 0.5, [], (i) => (i === 0 ? ['reload'] : []));
  G.player.sprinting = true;
  const evts = drive(G, 0.3, []);
  t.ok(w.state !== 'reload', 'sprinting interrupts a reload');
  t.ok(w.ammo === before && w.res === res, 'and the interrupted magazine is not lost');
  t.ok(evts.some((e) => e.type === 'reload' && e.phase === 'cancel'), 'the cancel is announced');
}

// ────────────────────────────────────────────────────── aim down sights
{
  const G = armed('rifle');
  t.ok(G.player.ads === 0, 'the gun starts at the hip');
  drive(G, WEAPONS.rifle.adsTime + 0.02, ['ads']);
  t.ok(G.player.ads > 0.99, 'holding aim reaches the sights in the stated time');
  drive(G, WEAPONS.rifle.adsTime, []);
  t.ok(G.player.ads === 0, 'and releasing comes down at least as fast — you never die waiting for it');

  // Sprinting has to win over aiming, or the sprint pose means nothing.
  const H = armed('rifle');
  drive(H, 0.4, ['ads']);
  H.player.sprinting = true;
  drive(H, 0.5, ['ads']);
  t.ok(H.player.ads === 0, 'sprinting drops you out of the sights');
}

// ─────────────────────────────────────────────────────── swapping weapons
{
  const G = createState(77);
  G.world = Object.assign(G.world, arena());
  G.player.grounded = true;
  createWeapons(G, ['rifle', 'shotgun', 'pistol']);
  t.ok(G.weapons.slots.length === 3, 'a three-slot loadout arms three weapons');

  const evts = drive(G, 1.4, [], (i) => (i === 0 ? ['slot2'] : []));
  t.ok(G.weapons.active === 1, 'pressing a slot key swaps to it');
  const ph = evts.filter((e) => e.type === 'swap').map((e) => e.phase);
  t.ok(ph.join(',') === 'holster,draw,ready', `the swap runs holster → draw → ready (${ph.join(',')})`);

  // You must not be able to fire mid-swap.
  const H = createState(78);
  H.world = Object.assign(H.world, arena());
  H.player.grounded = true;
  createWeapons(H, ['rifle', 'shotgun']);
  const mid = drive(H, 0.1, ['fire'], (i) => (i === 0 ? ['slot2'] : []));
  t.ok(count(mid, 'shot') === 0, 'and the gun cannot fire while it is being raised');
}

// ────────────────────────────────────────────── nothing breaks under abuse
{
  const G = createState(31337);
  G.world = Object.assign(G.world, arena());
  G.player.grounded = true;
  setLoadout(G, ['rifle', 'shotgun', 'pistol']);
  createWeapons(G, ['rifle', 'shotgun', 'pistol']);

  let broke = null;
  for (let i = 0; i < 4000 && !broke; i++) {
    G.input.buttons = new Set(i % 3 === 0 ? ['fire'] : i % 5 === 0 ? ['fire', 'ads'] : ['ads']);
    G.input.pressed = new Set(
      i % 41 === 0 ? ['reload'] : i % 67 === 0 ? ['slot2'] : i % 89 === 0 ? ['slot1'] : []);
    G.player.sprinting = i % 131 === 0;
    G.time.t += C.TICK;
    updateWeapons(G, C.TICK);
    G.events.length = 0;
    const w = activeWeapon(G);
    if (!Number.isFinite(G.recoil.pitch) || !Number.isFinite(G.recoil.yaw) ||
        !Number.isFinite(G.player.ads) || !w || !Number.isFinite(w.ammo) ||
        w.ammo < 0 || w.ammo > w.mag + 1 || w.res < 0) broke = i;
  }
  t.ok(broke === null, 'four thousand ticks of mashed fire, reload and swap keeps every weapon valid');
  t.ok(G.player.ads >= 0 && G.player.ads <= 1, 'and the aim blend stays inside its range');
}

t.done();
