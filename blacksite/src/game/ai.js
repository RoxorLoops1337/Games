// Enemy simulation — perception, behaviour, cover, gunnery.
//
// The design brief for this file is one sentence: the player must always be able
// to reconstruct, after the fact, why he died. Everything below follows from it.
// Enemies do not know where the player is; they accumulate evidence that he is
// somewhere, and they act on the last place they had any. They do not shoot the
// instant they see him; they take a beat, and their first rounds go wide and walk
// in. They do not all attack at once, because four men solving the same problem
// simultaneously is not four times harder, it is one unreadable event.
//
// None of that is about difficulty. A perfect-aim enemy is trivially easy to make
// and impossible to enjoy losing to, because the information that would let you
// counter it was never on screen. Every "unfair" moment in a shooter is an
// invisible one.
//
// Pure simulation: no Three.js, no DOM, importable straight into Node. The rig
// reads the schema below and never writes to it.
//
// ── THE ENEMY SCHEMA ─────────────────────────────────────────────────────────
// Every entry in `G.enemies` is a plain object with these fields. Other systems
// (ballistics, the rig, FX, the HUD, the director) read them; only this module
// and the weapons module write them.
//
//   id            string, unique and stable for the life of the entity ('e7')
//   kind          archetype key into ENEMY_ARCHETYPES
//   team          C.TEAM.HOSTILE
//   squad         blackboard id this enemy coordinates through
//   skill         0..1, the fairness dial the director turns
//
//   pos    {x,y,z}   FEET position, world space. NOTE: the player's `pos` is his
//                    eye; an enemy's is the ground contact point, because that is
//                    what a rig wants. `eyePos` below is the eye.
//   vel    {x,y,z}   metres/second
//   eyePos {x,y,z}   cached eye/muzzle origin, updated every tick
//   yaw              body facing, radians, same convention as the player
//                    (forward = (-sin yaw, ·, -cos yaw))
//   pitch            body pitch (0 except while aiming)
//   aim    {yaw,pitch}  where the weapon actually points; lags the body and
//                    carries the aim error, so the rig can point the gun at it
//   eye              eye height above `pos`, metres
//   height, radius, crouchHeight   collision cylinder
//   stance           'stand' | 'crouch'
//   grounded         bool
//
//   hp, maxHp, alive, wounded
//   state            one of AI_STATES
//   stateT           seconds spent in the current state
//   prevState, stateSince, stateWhy
//
//   hitboxes  [{ part, min:{x,y,z}, max:{x,y,z} }]
//                    WORLD SPACE, rebuilt every tick from pos/yaw/stance.
//                    `part` is one of 'HEAD' | 'CHEST' | 'STOMACH' | 'ARM' |
//                    'LEG' — the keys of C.HITBOX, so the damage multiplier is
//                    C.HITBOX[part]. Seven boxes: head, chest, stomach, 2 arms,
//                    2 legs. Test `bounds` first as a broadphase.
//   bounds    { min, max }   whole-body AABB, union of the hitboxes
//
//   awareness   0..1 notice meter; 1 = has seen the player
//   canSee      bool, this tick
//   sawT, lostT seconds (G.time.t) of last sight / of losing it
//   lastKnown   {x,y,z} | null, plus lastKnownT and lastKnownConf 0..1
//   suppression 0..1, incoming-fire pressure
//   flinch      0..1, decays; stagger, seconds of interrupted action
//
//   path [{x,y,z}] | null, pathIdx, goal {x,y,z} | null
//   cover  { x,y,z, px,py,pz, side, height, srcIdx } | null   (p* = peek spot)
//   peek   0..1 exposure blend, lean -1..1  (rig/FX hints)
//
//   ammo, reloadT, fireT, burst, reactT, aimErr (radians), shotsFired
//   firing      true on the tick a round leaves the barrel
//   muzzle {x,y,z}, anim (string hint), gait 0..1, stride (metres)
//
//   spawnT, deathT, removeAt, killEmitted
//
// Events emitted here: 'shot', 'impact', 'step', 'reload', 'damage', 'kill',
// 'despawn', 'aiState', 'aiCallout', 'nearMiss'. All carry `source: enemy.id`
// and `team` where it disambiguates.

import * as C from '../core/constants.js';
import { V, clamp, lerp, emit, vec3 } from '../core/state.js';
import { raycast, lineOfSight, moveCharacter, groundBelow } from '../world/collision.js';
import { damagePlayer } from './player.js';
import * as NAV from './nav.js';
import * as SQ from './squad.js';

export const AI_STATES = [
  'idle', 'patrol', 'alert', 'search', 'combat',
  'suppressed', 'flank', 'reposition', 'retreat', 'dead',
];

// ── tuning ───────────────────────────────────────────────────────────────────

const NAV_BUDGET = 260;      // A* node expansions per tick, shared by everyone
const COVER_BUDGET = 1;      // cover evaluations per tick, shared — they cost rays
const SENSE_HZ = 20;         // perception rate; LOS rays are the AI's frame cost
const CORPSE_TIME = 20;      // seconds a body stays in G.enemies for the rig
const LOST_TO_SEARCH = 3.2;  // seconds without contact before combat becomes a hunt
const SEARCH_GIVE_UP = 22;
const AMBIENT_LIGHT = 0.75;  // until the lighting module offers world.lightAt()

// Sound. Loudness is a radius in metres; walls cut it to under half.
const SOUND = {
  shot: 62, step: 15, sprintStep: 26, crouchStep: 6,
  land: 22, reload: 9, impact: 14, slide: 20, jump: 12,
};

/**
 * Archetypes. `skill` is the default fairness dial (0 = conscript, 1 = operator);
 * spawnEnemy can override it and the director should. Weapon errors are in
 * radians of half-angle: 0.10 rad at 20 m is two metres wide, which is what a
 * first burst is supposed to look like.
 */
export const ENEMY_ARCHETYPES = {
  rifleman: {
    hp: 110, speed: 3.3, sprint: 5.0, crouchSpeed: 1.6,
    sight: 58, fov: 1.12, hearing: 1, skill: 0.5,
    aggression: 0.45, coverLove: 0.85, band: [8, 34],
    weapon: {
      rpm: 620, burst: [3, 5], damage: 8, range: 55,
      errMin: 0.0095, errMax: 0.105, converge: 1.55,
      pause: [0.45, 1.05], suppressPause: [0.9, 1.9],
      mag: 30, reload: 2.4, bulletSpeed: 480, lead: 0.75, missFirst: 2,
    },
  },
  smg: {
    hp: 88, speed: 4.0, sprint: 6.0, crouchSpeed: 1.9,
    sight: 46, fov: 1.22, hearing: 1, skill: 0.42,
    aggression: 0.85, coverLove: 0.4, band: [3, 18],
    weapon: {
      rpm: 880, burst: [4, 7], damage: 6, range: 28,
      errMin: 0.018, errMax: 0.14, converge: 1.9,
      pause: [0.35, 0.8], suppressPause: [0.7, 1.4],
      mag: 32, reload: 2.0, bulletSpeed: 380, lead: 0.5, missFirst: 2,
    },
  },
  shotgun: {
    hp: 140, speed: 3.5, sprint: 5.6, crouchSpeed: 1.7,
    sight: 40, fov: 1.25, hearing: 1, skill: 0.4,
    aggression: 0.95, coverLove: 0.3, band: [2, 12],
    weapon: {
      rpm: 90, burst: [1, 1], damage: 34, range: 14,
      errMin: 0.03, errMax: 0.12, converge: 2.4,
      pause: [0.55, 0.95], suppressPause: [1.0, 1.6],
      mag: 6, reload: 3.1, bulletSpeed: 320, lead: 0.4, missFirst: 1,
    },
  },
  marksman: {
    hp: 90, speed: 2.9, sprint: 4.4, crouchSpeed: 1.4,
    sight: 90, fov: 0.95, hearing: 0.9, skill: 0.72,
    aggression: 0.15, coverLove: 1, band: [22, 80],
    weapon: {
      rpm: 55, burst: [1, 1], damage: 32, range: 90,
      errMin: 0.0035, errMax: 0.055, converge: 0.55,
      pause: [1.5, 2.6], suppressPause: [2.4, 3.6],
      mag: 8, reload: 3.0, bulletSpeed: 780, lead: 0.95, missFirst: 1,
    },
  },
  heavy: {
    hp: 260, speed: 2.5, sprint: 3.4, crouchSpeed: 1.2,
    sight: 52, fov: 1.05, hearing: 1, skill: 0.34,
    aggression: 0.55, coverLove: 0.5, band: [6, 40],
    weapon: {
      rpm: 700, burst: [8, 16], damage: 7, range: 60,
      errMin: 0.024, errMax: 0.13, converge: 0.9,
      pause: [0.9, 1.7], suppressPause: [1.1, 2.0],
      mag: 100, reload: 5.2, bulletSpeed: 460, lead: 0.55, missFirst: 3,
    },
  },
};

// Body plan, in metres above the feet, before the yaw rotation. The arms sit
// proud of the chest so a shoulder hit reads as a limb and not a torso — the
// difference between "I clipped him" and "I hit him" is worth the two extra
// boxes.
const PARTS = [
  { part: 'HEAD',    ox: 0,     oz: 0.02, y0: 1.50, y1: 1.78, hx: 0.115, hz: 0.125 },
  { part: 'CHEST',   ox: 0,     oz: 0,    y0: 1.14, y1: 1.50, hx: 0.230, hz: 0.155 },
  { part: 'STOMACH', ox: 0,     oz: 0,    y0: 0.86, y1: 1.14, hx: 0.195, hz: 0.145 },
  { part: 'ARM',     ox: -0.30, oz: 0,    y0: 1.04, y1: 1.50, hx: 0.085, hz: 0.100 },
  { part: 'ARM',     ox: 0.30,  oz: 0,    y0: 1.04, y1: 1.50, hx: 0.085, hz: 0.100 },
  { part: 'LEG',     ox: -0.13, oz: 0,    y0: 0.00, y1: 0.86, hx: 0.115, hz: 0.115 },
  { part: 'LEG',     ox: 0.13,  oz: 0,    y0: 0.00, y1: 0.86, hx: 0.115, hz: 0.115 },
];

// ── module state ─────────────────────────────────────────────────────────────

const _v = vec3(), _v2 = vec3(), _hit = {}, _delta = vec3();

function ensureAI(G) {
  let ai = G.ai;
  if (!ai) {
    ai = G.ai = {
      nav: null,
      squads: new Map(),
      seq: 0,
      eventCursor: 0,
      difficulty: 1,
      coverBudget: COVER_BUDGET,
      // Events this module emitted. `G.events` is a shared queue and we read it
      // back to pick up what the weapons module did; without a marker we would
      // read our own damage events and apply every hit twice.
      own: new WeakSet(),
      playerVel: vec3(), playerSpeed: 0, playerLateral: 0,
      playerPrev: vec3(), playerTurn: 0, lastShotT: -999,
      sounds: [],
      stats: { spawned: 0, killed: 0, shots: 0, hits: 0, paths: 0 },
    };
  }
  if (G.world.statics && G.world.statics.length && NAV.navStale(ai.nav, G.world)) {
    ai.nav = NAV.buildNav(G.world);
    G.world.nav = ai.nav;
  }
  return ai;
}

/** Build (or rebuild) the navigation grid. Called at level load; cached on
 *  `G.world.nav` and reused until `G.world.statics` is replaced. */
export function buildNav(G, opts) {
  const ai = ensureAI(G);
  ai.nav = NAV.buildNav(G.world, opts || {});
  G.world.nav = ai.nav;
  return ai.nav;
}

/** Drop every enemy, squad and pending path. The nav grid survives — it belongs
 *  to the level, not to the run. */
export function resetAI(G) {
  const ai = ensureAI(G);
  ai.squads.clear();
  ai.sounds.length = 0;
  ai.eventCursor = 0;
  ai.seq = 0;
  if (ai.nav) { ai.nav.queue.length = 0; }
  G.enemies.length = 0;
  return ai;
}

/** Global fairness multiplier on top of each enemy's `skill`. The director owns
 *  this; 0.6 is "these are guards", 1.4 is "these are the people the guards call". */
export function setDifficulty(G, v) { ensureAI(G).difficulty = clamp(v, 0.2, 2); }

// ── spawning ─────────────────────────────────────────────────────────────────

/**
 * spawnEnemy(G, opts) → enemy
 *
 *   pos      {x,y,z}  feet position. Snapped down to the floor and sideways onto
 *                     the nearest walkable nav cell, so a spawn point inside a
 *                     crate still produces a body that can walk.
 *   kind     archetype key, default 'rifleman'
 *   yaw      facing, radians (default: random)
 *   squad    blackboard id, default 'alpha'
 *   skill    0..1, overrides the archetype default
 *   hp       overrides maxHp
 *   team     default C.TEAM.HOSTILE
 *   state    initial state, default 'idle' ('patrol' if a route is given)
 *   patrol   [{x,z}, …] optional route, walked in a loop
 *   alerted  true → spawns already knowing where the player is (reinforcements
 *            who were radioed in should; a garrison should not)
 *   id       explicit id, otherwise 'e<n>'
 *
 * Pushes onto G.enemies and returns the entity.
 */
export function spawnEnemy(G, opts = {}) {
  const ai = ensureAI(G);
  const kind = ENEMY_ARCHETYPES[opts.kind] ? opts.kind : 'rifleman';
  const A = ENEMY_ARCHETYPES[kind];
  const W = A.weapon;
  const id = opts.id || ('e' + (++ai.seq));

  const pos = vec3(opts.pos ? opts.pos.x : 0, opts.pos ? opts.pos.y : 0, opts.pos ? opts.pos.z : 0);
  if (ai.nav) {
    const ci = NAV.nearestWalkable(ai.nav, pos.x, pos.z, 8, opts.pos ? opts.pos.y : null);
    if (ci >= 0) {
      const c = NAV.cellCenter(ai.nav, ci);
      // Only slide it sideways if the requested spot was not itself walkable —
      // a director placing a man at a doorway should get him at that doorway.
      if (!NAV.walkableAt(ai.nav, pos.x, pos.z)) { pos.x = c.x; pos.z = c.z; }
      pos.y = c.y;
    }
  }
  const g = groundBelow(G.world, pos.x, pos.y + 1.2, pos.z, 8);
  if (g) pos.y = g.y;

  const e = {
    id, kind, team: opts.team != null ? opts.team : C.TEAM.HOSTILE,
    squad: opts.squad || 'alpha',
    arch: A, weapon: W,
    skill: clamp(opts.skill != null ? opts.skill : A.skill, 0, 1),

    pos, vel: vec3(), eyePos: vec3(),
    yaw: opts.yaw != null ? opts.yaw : (G.rng() * Math.PI * 2 - Math.PI),
    pitch: 0,
    aim: { yaw: 0, pitch: 0 },
    eye: 1.58, height: C.CAPSULE_H, crouchHeight: C.CAPSULE_H * 0.62, radius: 0.34,
    stance: 'stand', grounded: false,

    hp: opts.hp != null ? opts.hp : A.hp,
    maxHp: opts.hp != null ? opts.hp : A.hp,
    alive: true, wounded: false,

    state: 'idle', prevState: 'idle', stateT: 0, stateSince: G.time.t, stateWhy: 'spawn',

    hitboxes: PARTS.map((p) => ({ part: p.part, min: vec3(), max: vec3() })),
    bounds: { min: vec3(), max: vec3() },

    awareness: 0, canSee: false, sawT: -999, lostT: -999,
    lastKnown: null, lastKnownT: -999, lastKnownConf: 0,
    heardCall: null, lastHeardT: -999,
    senseT: G.rng() * (1 / SENSE_HZ),
    suppression: 0, flinch: 0, stagger: 0,

    path: null, pathIdx: 0, pathReq: null, pathGoal: null, pathT: -999, pathFail: 0,
    goal: null, goalKind: 'none', speed: 0,
    stuckT: 0, stuckRef: vec3(pos.x, pos.y, pos.z), safePos: vec3(pos.x, pos.y, pos.z),

    cover: null, peek: 0, peekSide: G.rng() < 0.5 ? -1 : 1, lean: 0,
    hesitate: 0, strafeSign: 0,

    // Read by the enemy rig; written here every tick in updateBody.
    feetY: pos.y, aimDir: vec3(0, 0, -1), aiming: false, attend: null, target: null,
    armor: opts.armor || 0,

    ammo: W.mag, reloadT: 0, fireT: 0, burst: 0, burstPause: 0,
    reactT: 0, aimErr: W.errMax, biasX: 0, biasY: 0,
    shotsFired: 0, forceMiss: 0, firing: false, muzzle: vec3(),
    engageT: -999,

    patrol: opts.patrol ? opts.patrol.map((p) => ({ x: p.x, y: p.y || 0, z: p.z })) : null,
    patrolIdx: 0, patrolWait: 0,
    scanPhase: G.rng() * Math.PI * 2,

    anim: 'idle', gait: 0, stride: 0,
    spawnT: G.time.t, deathT: -1, removeAt: Infinity, killEmitted: false,
    _hp: 0,
  };
  e._hp = e.hp;
  e.aim.yaw = e.yaw;
  updateBody(e, G.player.pos);

  if (opts.alerted) {
    e.awareness = 1;
    noteContact(G, ai, e, G.player.pos, 0.9, 'radio');
    setState(G, ai, e, 'combat', 'spawn-alerted');
  } else if (opts.state && AI_STATES.indexOf(opts.state) >= 0) {
    setState(G, ai, e, opts.state, 'spawn');
  } else if (e.patrol && e.patrol.length > 1) {
    setState(G, ai, e, 'patrol', 'spawn');
  }

  G.enemies.push(e);
  ai.stats.spawned++;
  SQ.getSquad(ai, e.squad);
  emit(G, 'spawn', { target: id, kind, pos: V.clone(pos), team: e.team });
  return e;
}

// ── the tick ─────────────────────────────────────────────────────────────────

export function updateAI(G, dt) {
  if (!G || !dt) return;
  const ai = ensureAI(G);
  ai.coverBudget = COVER_BUDGET;

  consumeEvents(G, ai);
  trackPlayer(G, ai, dt);
  if (ai.nav) NAV.stepPaths(ai.nav, G.world, NAV_BUDGET);
  SQ.squadTick(G, ai, dt);

  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.team === C.TEAM.PLAYER || !e.hitboxes) continue;
    // The ballistics module kills by writing `hp` and `alive` straight onto the
    // record. Either flag is enough to start the death bookkeeping here, so a
    // body killed by a system that never heard of this file still releases its
    // squad tokens, plays a death, and eventually gets reaped.
    if (e.state !== 'dead' && (!e.alive || e.hp <= 0)) killEnemy(G, e, e.lastHurtBy || 'player', false);
    if (e.alive) updateEnemy(G, ai, e, dt);
    else updateCorpse(G, ai, e, dt);
  }

  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].alive && G.time.t >= list[i].removeAt) {
      emit(G, 'despawn', { target: list[i].id });
      list.splice(i, 1);
    }
  }
  ai.sounds.length = 0;
}

// Everything the AI learns from the rest of the simulation arrives as events.
// `G.events` is drained once per rendered frame but the sim may take several
// steps inside that frame, so the cursor walks the queue and resets when it
// shrinks — reading a shot twice would make one trigger pull sound like two.
function consumeEvents(G, ai) {
  const q = G.events;
  if (ai.eventCursor > q.length) ai.eventCursor = 0;
  for (let i = ai.eventCursor; i < q.length; i++) {
    const ev = q[i];
    switch (ev.type) {
      case 'shot': {
        if (isPlayerSourced(ev)) {
          ai.lastShotT = G.time.t;
          pushSound(ai, ev.origin || G.player.pos, SOUND.shot, 'shot');
        }
        break;
      }
      case 'step':
        if (isPlayerSourced(ev)) {
          const loud = ev.sprint ? SOUND.sprintStep
            : G.player.stance === 'crouch' ? SOUND.crouchStep : SOUND.step;
          pushSound(ai, ev.pos || G.player.pos, loud, 'step');
        }
        break;
      case 'land': if (isPlayerSourced(ev)) pushSound(ai, ev.pos || G.player.pos, SOUND.land * (0.5 + (ev.hard || 0)), 'land'); break;
      case 'jump': if (isPlayerSourced(ev)) pushSound(ai, ev.pos || G.player.pos, SOUND.jump, 'jump'); break;
      case 'slide': if (isPlayerSourced(ev)) pushSound(ai, ev.pos || G.player.pos, SOUND.slide, 'slide'); break;
      case 'reload': if (isPlayerSourced(ev)) pushSound(ai, G.player.pos, SOUND.reload, 'reload'); break;
      case 'impact':
        if (isPlayerSourced(ev) && ev.point) pushSound(ai, ev.point, SOUND.impact, 'impact');
        break;
      case 'damage': if (!ai.own.has(ev)) applyForeignDamage(G, ai, ev); break;
      case 'kill': {
        if (ai.own.has(ev)) break;
        const e = ev.enemy && ev.enemy.hitboxes ? ev.enemy : findEnemy(G, ev.target);
        // Somebody else has already told the world this man is dead, so we must
        // not announce it twice — but the bookkeeping still has to happen.
        if (e) { e.killEmitted = true; killEnemy(G, e, ev.weapon || 'player', !!ev.headshot); }
        break;
      }
      default: break;
    }
  }
  ai.eventCursor = q.length;
}

// A sound with no `source` came from the weapons/player modules, which do not
// tag their events; anything this file emits carries one. Treating an untagged
// event as the player's is the safe default — the failure mode is enemies
// noticing him, not enemies ignoring him.
function isPlayerSourced(ev) {
  if (ev.team === C.TEAM.HOSTILE) return false;
  return !ev.source || ev.source === 'player';
}

function pushSound(ai, pos, loud, kind) {
  ai.sounds.push({ x: pos.x, y: pos.y, z: pos.z, loud, kind });
}

function findEnemy(G, id) {
  for (let i = 0; i < G.enemies.length; i++) if (G.enemies[i].id === id) return G.enemies[i];
  return null;
}

function trackPlayer(G, ai, dt) {
  const p = G.player;
  const inv = dt > 0 ? 1 / dt : 0;
  ai.playerVel.x = (p.pos.x - ai.playerPrev.x) * inv;
  ai.playerVel.y = (p.pos.y - ai.playerPrev.y) * inv;
  ai.playerVel.z = (p.pos.z - ai.playerPrev.z) * inv;
  if (!V.finite(ai.playerVel)) V.set(ai.playerVel, 0, 0, 0);
  V.copy(ai.playerPrev, p.pos);
  ai.playerSpeed = Math.hypot(ai.playerVel.x, ai.playerVel.z);
}

// ── per-enemy update ─────────────────────────────────────────────────────────

function updateEnemy(G, ai, e, dt) {
  e.stateT += dt;
  e.firing = false;
  // Movement is opt-in every tick. A behaviour that forgets to ask for it stops,
  // rather than coasting on whatever the previous state wanted — the failure
  // mode of the alternative is a man walking calmly to a destination nobody
  // remembers choosing, which is the most unnerving bug this file could ship.
  e.speed = 0;
  e.flinch = Math.max(0, e.flinch - dt * 2.1);
  e.stagger = Math.max(0, e.stagger - dt);
  e.suppression = Math.max(0, e.suppression - dt * 0.45);
  e.fireT -= dt;
  e.burstPause -= dt;
  e.reactT -= dt;
  e.wounded = e.hp <= e.maxHp * 0.32;

  // The weapons module is allowed to write `hp` directly. Anything that moved it
  // since the last tick is a hit we did not process, and it must still cause a
  // flinch and turn the man around, or shooting an unaware enemy in the back
  // does nothing until he happens to look.
  if (e.hp < e._hp) reactToHit(G, ai, e, e._hp - e.hp, null);

  senseTick(G, ai, e, dt);
  reloadTick(G, ai, e, dt);

  switch (e.state) {
    case 'idle': stIdle(G, ai, e, dt); break;
    case 'patrol': stPatrol(G, ai, e, dt); break;
    case 'alert': stAlert(G, ai, e, dt); break;
    case 'search': stSearch(G, ai, e, dt); break;
    case 'combat': stCombat(G, ai, e, dt); break;
    case 'suppressed': stSuppressed(G, ai, e, dt); break;
    case 'flank': stFlank(G, ai, e, dt); break;
    case 'reposition': stReposition(G, ai, e, dt); break;
    case 'retreat': stRetreat(G, ai, e, dt); break;
    default: break;
  }

  consumePath(G, ai, e);
  ensurePath(G, ai, e);
  locomote(G, ai, e, dt);
  updateBody(e, G.player.pos);

  if (e.hp <= 0 && e.alive) killEnemy(G, e, 'unknown', false);
  e._hp = e.hp;
}

function updateCorpse(G, ai, e, dt) {
  e.stateT += dt;
  e.firing = false;
  // A body still falls. Nothing else about it moves.
  if (!e.grounded) {
    e.vel.y = Math.max(-60, e.vel.y + C.GRAVITY * dt);
    _delta.x = 0; _delta.y = e.vel.y * dt; _delta.z = 0;
    moveCharacter(G.world, e.pos, _delta, e.radius, e.crouchHeight, _hit);
    if (_hit.ground) { e.grounded = true; e.vel.y = 0; }
  }
  updateBody(e, G.player.pos);
}

// ── perception ───────────────────────────────────────────────────────────────
//
// Perception runs at 20 Hz, not 120: line-of-sight rays are the only part of the
// AI with a real cost, and a fifth of a frame's reaction latency is under the
// noise floor of the reaction time we deliberately add anyway.

function senseTick(G, ai, e, dt) {
  e.senseT -= dt;
  // Callouts land whenever they land, not on the sense beat.
  if (e.heardCall) {
    const c = e.heardCall; e.heardCall = null;
    if (c.conf > e.lastKnownConf || G.time.t - e.lastKnownT > 2) {
      noteContact(G, ai, e, c, c.conf, 'callout', true);
      if (e.state === 'idle' || e.state === 'patrol') setState(G, ai, e, 'alert', 'callout');
      else if (e.state === 'search') { e.goal = null; }
    }
  }
  for (let i = 0; i < ai.sounds.length; i++) hearSound(G, ai, e, ai.sounds[i]);
  if (e.senseT > 0) return;
  const elapsed = (1 / SENSE_HZ) - e.senseT;
  e.senseT = (1 / SENSE_HZ) + G.rng() * 0.012;
  look(G, ai, e, elapsed);
}

function look(G, ai, e, dt) {
  const p = G.player;
  const wasSeen = e.canSee;
  e.canSee = false;
  if (!p.alive) { e.awareness = Math.max(0, e.awareness - dt * 0.6); return; }

  const A = e.arch;
  const eye = e.eyePos;
  let dx = p.pos.x - eye.x, dy = p.pos.y - eye.y, dz = p.pos.z - eye.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > A.sight || d < 1e-4) { fade(G, ai, e, dt, wasSeen); return; }
  const inv = 1 / d;
  dx *= inv; dy *= inv; dz *= inv;

  // The cone is measured off the aim, not the body, because a man who has turned
  // to look at a noise really is looking at it.
  const fx = -Math.sin(e.aim.yaw), fz = -Math.cos(e.aim.yaw);
  const cosA = dx * fx + dz * fz;
  const coneCos = Math.cos(A.fov);
  const periphCos = Math.cos(Math.min(2.7, A.fov * 1.55));
  if (cosA < periphCos) { fade(G, ai, e, dt, wasSeen); return; }
  const peripheral = cosA < coneCos;

  // Two rays: the head, then the chest. One ray at the eye means a player behind
  // a waist-high crate is invisible, which reads as a bug, not as cover.
  _v.x = p.pos.x; _v.y = p.pos.y; _v.z = p.pos.z;
  let vis = lineOfSight(G.world, eye, _v, 0.02);
  if (!vis) {
    _v.y = p.pos.y - Math.min(0.55, p.eye * 0.4);
    vis = lineOfSight(G.world, eye, _v, 0.02);
  }
  if (!vis) { fade(G, ai, e, dt, wasSeen); return; }

  e.awareness = Math.min(1.6, e.awareness + dt / noticeTime(G, ai, e, d, peripheral));
  if (e.awareness < 1) {
    // Not yet a contact, but he knows something is off over there — this is what
    // makes an enemy turn towards you a moment before he reacts, which is the
    // player's only warning and the whole reason the notice delay exists.
    if (e.state === 'idle' || e.state === 'patrol') {
      if (e.awareness > 0.45) {
        e.lastHeardT = G.time.t;
        e.lastKnown = e.lastKnown || vec3();
        V.copy(e.lastKnown, p.pos);
        e.lastKnownT = G.time.t;
        e.lastKnownConf = Math.max(e.lastKnownConf, 0.5);
        setState(G, ai, e, 'alert', 'glimpse');
      }
    }
    return;
  }

  e.canSee = true;
  e.sawT = G.time.t;
  noteContact(G, ai, e, p.pos, 1, 'sight');
  if (!wasSeen) reacquire(G, ai, e);
  if (e.state !== 'combat' && e.state !== 'flank' && e.state !== 'suppressed' &&
      e.state !== 'reposition' && e.state !== 'retreat') {
    setState(G, ai, e, 'combat', 'sighted');
  }
}

function fade(G, ai, e, dt, wasSeen) {
  // Awareness decays slowly. A man who half-saw you does not un-see you in a
  // quarter of a second, and the slow bleed is what makes repeated peeking out
  // of the same corner get you killed eventually.
  e.awareness = Math.max(0, e.awareness - dt * 0.3);
  if (wasSeen) e.lostT = G.time.t;
}

/**
 * How long this enemy needs to turn "something moved" into "contact". Scaling it
 * with distance is the single most important fairness lever in the file: a
 * player spotted at 40 m and killed 300 ms later cannot tell what happened, and
 * unfair-feeling deaths come from invisible information, not from difficulty.
 */
function noticeTime(G, ai, e, d, peripheral) {
  const p = G.player;
  let t = 0.20 + d * 0.021;                       // 10 m ≈ 0.41 s · 40 m ≈ 1.04 s
  if (p.stance === 'crouch') t *= 1.7;
  else if (p.stance === 'slide') t *= 0.8;
  const sp = ai.playerSpeed;
  t *= sp > 5.5 ? 0.55 : sp > 1.6 ? 0.82 : 1.4;   // holding still is genuine concealment
  if (peripheral) t *= 2.3;
  t *= lerp(2.2, 0.7, lightAt(G, p.pos));
  if (G.time.t - ai.lastShotT < 2.5) t *= 0.5;    // a muzzle flash is not subtle
  t *= 1.35 - 0.62 * skillOf(ai, e);
  const bb = SQ.getSquad(ai, e.squad);
  if (bb.alert >= 1) t *= 0.62;
  if (bb.conf > 0.5) t *= 0.72;
  if (e.suppression > 0.3) t *= 1 + e.suppression * 0.6;
  return clamp(t, 0.09, 6);
}

// The lighting module may install `world.lightAt(pos) → 0..1`. Until it does,
// everywhere is averagely lit and the term is a constant — the AI must not
// depend on a system that might never arrive.
function lightAt(G, pos) {
  const f = G.world.lightAt;
  if (typeof f !== 'function') return AMBIENT_LIGHT;
  const v = f(pos);
  return Number.isFinite(v) ? clamp(v, 0, 1) : AMBIENT_LIGHT;
}

function skillOf(ai, e) { return clamp(e.skill * ai.difficulty, 0.05, 1.3); }

function hearSound(G, ai, e, s) {
  const A = e.arch;
  let range = s.loud * (A.hearing || 1);
  const d = Math.hypot(s.x - e.eyePos.x, s.y - e.eyePos.y, s.z - e.eyePos.z);
  if (d > range) return;

  // Rounds cracking into the wall beside you are the only input suppression
  // has. It is deliberately not "the player is aiming at me" — an enemy who
  // ducks because of where your crosshair is has read your mind, and the player
  // can feel it even if he cannot name it.
  if (s.kind === 'impact' && d < 4) {
    e.suppression = Math.min(1, e.suppression + 0.30 * (1 - d / 4));
    if (e.state === 'idle' || e.state === 'patrol') {
      e.awareness = Math.max(e.awareness, 0.6);
      noteContact(G, ai, e, { x: s.x, y: s.y, z: s.z }, 0.5, 'incoming');
      setState(G, ai, e, 'alert', 'incoming');
      return;
    }
  }
  _v.x = s.x; _v.y = s.y + 0.4; _v.z = s.z;
  if (!lineOfSight(G.world, e.eyePos, _v, 0.05)) range *= 0.45;
  if (d > range) return;

  // You do not hear a position, you hear a direction and a rough distance. The
  // error is what sends enemies to the doorway you were at rather than to you.
  const err = 0.6 + (d / Math.max(range, 1)) * 3.2;
  const px = s.x + (G.rng() * 2 - 1) * err;
  const pz = s.z + (G.rng() * 2 - 1) * err;
  e.lastHeardT = G.time.t;
  const conf = clamp(0.55 - (d / Math.max(range, 1)) * 0.3, 0.15, 0.6);

  if (e.state === 'combat' || e.state === 'suppressed' || e.state === 'flank') return;
  noteContact(G, ai, e, { x: px, y: s.y, z: pz }, conf, s.kind);
  e.awareness = Math.max(e.awareness, s.kind === 'shot' ? 0.45 : 0.25);
  if (e.state === 'idle' || e.state === 'patrol') setState(G, ai, e, 'alert', 'heard-' + s.kind);
  else if (e.state === 'alert' || e.state === 'search') e.goal = null;   // re-plan onto the fresher noise
}

function noteContact(G, ai, e, pos, conf, why, quiet) {
  e.lastKnown = e.lastKnown || vec3();
  V.copy(e.lastKnown, pos);
  e.lastKnownT = G.time.t;
  e.lastKnownConf = conf;
  if (!quiet) SQ.shareContact(G, ai, e, pos, conf, why);
}

// ── state machine ────────────────────────────────────────────────────────────
//
//   idle ⇄ patrol            nothing is happening
//     ↓ heard / glimpsed
//   alert                    walking to a noise, weapon up
//     ↓ arrived, nothing there            ↓ saw him
//   search                   sweeping likely hiding spots  →  combat
//     ↓ gave up                                              ↑
//   idle / patrol                                            │
//                                                            │
//   combat  ──too much incoming──→  suppressed ──────────────┤
//     ├──has flank token, stalemate──→  flank  ──────────────┤
//     ├──cover no longer covers──────→  reposition  ─────────┤
//     ├──wounded and not alone───────→  retreat  ────────────┘
//     └──no contact for 3.2 s────────→  search
//
//   any ──hp ≤ 0──→ dead
//
// Every transition emits an 'aiState' event so the audio and rig layers can put
// a legible tell on it — a shout, a stance change, a lean. A state machine the
// player cannot read is just a random number generator with extra steps.

function setState(G, ai, e, s, why) {
  if (e.state === s) return;
  const bb = SQ.getSquad(ai, e.squad);
  // Tokens belong to a behaviour, not to a man. Leaving the behaviour hands them
  // back, which is what stops one dead-ended enemy holding the flank slot for
  // the whole fight.
  if (e.state === 'flank') SQ.releaseToken(G, bb, e, SQ.TOKEN.FLANK);
  if (e.state === 'combat' && s !== 'suppressed' && s !== 'reposition') SQ.releaseToken(G, bb, e, SQ.TOKEN.ATTACK);
  if (e.state === 'suppressed') SQ.releaseToken(G, bb, e, SQ.TOKEN.SUPPRESS);

  e.prevState = e.state;
  e.state = s;
  e.stateT = 0;
  e.stateSince = G.time.t;
  e.stateWhy = why || '';
  e.goal = null;
  e.path = null;
  e.pathIdx = 0;

  // A beat before reacting to a noise. Men do not sprint at a sound the instant
  // they hear it, and that pause is the player's window to move or hide.
  if (s === 'alert') e.hesitate = 0.35 + G.rng() * 0.55;

  if (s === 'combat' && e.prevState !== 'suppressed' && e.prevState !== 'reposition' && e.prevState !== 'flank') {
    // Reaction time. 200–500 ms, less for the good ones. The whole point is that
    // the player who rounds a corner first gets to shoot first.
    e.reactT = (0.20 + G.rng() * 0.30) * (1.4 - 0.55 * skillOf(ai, e));
    e.engageT = G.time.t;
    e.shotsFired = 0;
    e.forceMiss = e.weapon.missFirst;
    e.aimErr = e.weapon.errMax;
    randomiseBias(G, e);
  }
  if (s === 'dead') return;
  emit(G, 'aiState', { target: e.id, from: e.prevState, to: s, why: e.stateWhy, pos: V.clone(e.pos) });
}

// ── behaviours ───────────────────────────────────────────────────────────────

function stIdle(G, ai, e, dt) {
  e.stance = 'stand';
  if (e.patrol && e.patrol.length > 1) { setState(G, ai, e, 'patrol', 'route'); return; }
  // A slow head sweep. It is also functional: the vision cone is attached to the
  // aim, so a scanning guard genuinely covers more ground than a static one.
  e.aim.yaw = e.yaw + Math.sin(G.time.t * 0.35 + e.scanPhase) * 0.7;
  e.aim.pitch = lerp(e.aim.pitch, 0, 1 - Math.exp(-3 * dt));
}

function stPatrol(G, ai, e, dt) {
  e.stance = 'stand';
  if (!e.patrol || e.patrol.length < 2) { setState(G, ai, e, 'idle', 'no-route'); return; }
  if (e.patrolWait > 0) {
    e.patrolWait -= dt;
    e.aim.yaw = e.yaw + Math.sin(G.time.t * 0.4 + e.scanPhase) * 0.8;
    return;
  }
  const wp = e.patrol[e.patrolIdx % e.patrol.length];
  if (!e.goal) setGoal(e, wp.x, wp.y, wp.z, 'patrol');
  if (planarDist(e.pos, e.goal) < 1.1) {
    e.patrolIdx = (e.patrolIdx + 1) % e.patrol.length;
    e.patrolWait = 1.2 + G.rng() * 2.5;
    e.goal = null;
    return;
  }
  e.speed = e.arch.speed * 0.62;
  faceMotion(e, dt, 2.6);
}

function stAlert(G, ai, e, dt) {
  e.stance = 'stand';
  const bb = SQ.getSquad(ai, e.squad);
  const target = e.lastKnown || bb.lastKnown;
  if (!target) { setState(G, ai, e, 'idle', 'nothing'); return; }

  if (e.stateT < e.hesitate) {
    e.speed = 0;
    faceAt(e, target, dt, 3.4);
    e.aim.yaw = e.yaw;
    return;
  }
  if (!e.goal) setGoal(e, target.x, target.y, target.z, 'investigate');
  e.speed = e.arch.speed * (e.lastKnownConf > 0.5 ? 1.0 : 0.75);
  faceMotion(e, dt, 3.0);
  aimAlong(e, dt);

  if (planarDist(e.pos, e.goal) < 1.6 || e.stateT > 16) {
    SQ.markSearched(G, bb, e.goal.x, e.goal.z);
    setState(G, ai, e, 'search', 'arrived');
  }
}

function stSearch(G, ai, e, dt) {
  e.stance = 'stand';
  const bb = SQ.getSquad(ai, e.squad);
  e.speed = e.arch.speed * 0.7;
  aimAlong(e, dt);

  if (!e.goal) {
    const spot = pickSearchSpot(G, ai, e, bb);
    if (spot) { setGoal(e, spot.x, spot.y, spot.z, 'search'); SQ.claimSpot(G, bb, e, spot, 10); }
    else e.stateT += 1.5;   // nowhere left to look; give up sooner
  } else if (planarDist(e.pos, e.goal) < 1.4) {
    SQ.markSearched(G, bb, e.goal.x, e.goal.z);
    e.goal = null;
    // Stop and actually look around before moving on. A sweep that never pauses
    // reads as pathing, not as searching.
    e.patrolWait = 0.8 + G.rng() * 1.2;
  }
  if (e.patrolWait > 0) { e.patrolWait -= dt; e.speed = 0; e.aim.yaw = e.yaw + Math.sin(G.time.t * 1.1 + e.scanPhase) * 1.1; return; }
  faceMotion(e, dt, 3.0);

  if (e.stateT > SEARCH_GIVE_UP) {
    SQ.releaseSpot(bb, e);
    e.awareness = Math.min(e.awareness, 0.3);
    setState(G, ai, e, e.patrol && e.patrol.length > 1 ? 'patrol' : 'idle', 'lost-him');
  }
}

function stCombat(G, ai, e, dt) {
  const bb = SQ.getSquad(ai, e.squad);
  const p = G.player;
  const target = e.lastKnown || bb.lastKnown || p.pos;
  const dist = planarDist(e.pos, target);
  const hasLOS = e.canSee;

  if (hasLOS) SQ.requestToken(G, bb, e, SQ.TOKEN.ATTACK);
  const attacker = SQ.hasToken(bb, e, SQ.TOKEN.ATTACK);

  // ── exits, in priority order
  if (e.suppression > 0.62 && e.cover) { setState(G, ai, e, 'suppressed', 'pinned'); return; }
  if (e.wounded && bb.alive > 1 && e.stateT > 1.5 && G.rng() < dt * 0.7) { setState(G, ai, e, 'retreat', 'wounded'); return; }
  if (!hasLOS && G.time.t - e.sawT > LOST_TO_SEARCH) {
    if (G.time.t - e.lastKnownT > LOST_TO_SEARCH) { setState(G, ai, e, 'search', 'lost-contact'); return; }
  }
  if (!hasLOS && e.stateT > 2.2 && SQ.requestToken(G, bb, e, SQ.TOKEN.FLANK)) { setState(G, ai, e, 'flank', 'stalemate'); return; }
  if (e.cover && !coverStillWorks(G, e, p)) { e.cover = null; }
  if (!e.cover && e.arch.coverLove > G.rng() * 1.4 && e.stateT > 0.4) {
    const c = findCover(G, ai, e, p.pos);
    if (c) { e.cover = c; SQ.claimSpot(G, bb, e, c, 12); setState(G, ai, e, 'reposition', 'to-cover'); return; }
  }
  if (e.cover && e.stateT > 7 + G.rng() * 6 && !hasLOS) { setState(G, ai, e, 'reposition', 'stale-position'); return; }

  // ── hold or press
  const closeIn = attacker && (!e.cover || e.arch.aggression > 0.7) && dist > e.arch.band[1] * 0.9;
  const backOff = dist < e.arch.band[0] * 0.6 && e.arch.aggression < 0.5;

  if (e.cover) {
    // Peek rhythm: out, fire, back. The pause behind cover is not a handicap, it
    // is the player's turn — a burst-pause cadence is what makes a firefight a
    // conversation rather than a stream.
    const wantPeek = e.reactT <= 0 && e.burstPause <= 0 && e.ammo > 0 && e.stagger <= 0;
    if (wantPeek && e.peek < 1) e.peek = Math.min(1, e.peek + dt * 3.4);
    else if (!wantPeek) e.peek = Math.max(0, e.peek - dt * 2.6);
    const spot = e.peek > 0.5 ? { x: e.cover.px, y: e.cover.py, z: e.cover.pz } : e.cover;
    setGoal(e, spot.x, spot.y, spot.z, 'cover');
    e.speed = e.arch.speed * 0.9;
    e.stance = (e.cover.height < 1.35 && e.peek < 0.5) ? 'crouch' : 'stand';
    e.lean = e.peek * e.peekSide;
  } else if (closeIn) {
    setGoal(e, target.x, target.y, target.z, 'advance');
    e.speed = e.arch.sprint * (e.wounded ? 0.8 : 1);
    e.stance = 'stand';
  } else if (backOff) {
    const away = awayFrom(G, ai, e, target, 8);
    if (away) setGoal(e, away.x, away.y, away.z, 'backoff');
    e.speed = e.arch.speed;
  } else {
    strafe(G, ai, e, dt, target);
  }

  faceAt(e, hasLOS ? p.pos : target, dt, 5.0);
  aimTick(G, ai, e, dt, hasLOS);

  // Behind cover you only shoot while you are actually exposed; in the open you
  // shoot whenever you can see him. Without eyes on, the only thing worth firing
  // is suppression at the last place he was — which is what buys the flanker the
  // time to arrive, and what tells the player the flanker exists.
  const exposed = !e.cover || e.peek > 0.45;
  // The attack token does not decide who may shoot — an enemy who cannot shoot
  // back reads as broken. It decides who shoots *often*. Men without it fire
  // shorter, rarer bursts, so the volume of incoming fire stays inside what a
  // player can actually read no matter how many of them there are.
  if (hasLOS && exposed) tryShoot(G, ai, e, dt, false, attacker ? 1 : 2.4);
  else if (!hasLOS && e.ammo > 0 && G.time.t - e.lastKnownT < 6) suppressFire(G, ai, e, dt, bb);
}

function stSuppressed(G, ai, e, dt) {
  const bb = SQ.getSquad(ai, e.squad);
  e.stance = 'crouch';
  e.peek = Math.max(0, e.peek - dt * 4);
  e.lean = 0;
  if (e.cover) { setGoal(e, e.cover.x, e.cover.y, e.cover.z, 'cover'); e.speed = e.arch.speed * 0.85; }
  else { e.goal = null; e.speed = 0; }
  faceAt(e, e.lastKnown || bb.lastKnown || G.player.pos, dt, 2.2);
  aimTick(G, ai, e, dt, false);
  // Blind fire over the top: no chance of hitting, plenty of chance of keeping
  // the player's head down, which is the point.
  if (e.stateT > 0.6 && G.rng() < dt * 0.5) blindFire(G, ai, e);
  // Pinned and bleeding is exactly the moment a man decides he has done enough.
  // Reading the exit only out of `combat` would mean an enemy under sustained
  // fire — the one who most obviously ought to run — never does.
  if (e.wounded && e.stateT > 1.2 && SQ.getSquad(ai, e.squad).alive > 1) { setState(G, ai, e, 'retreat', 'pinned-and-hurt'); return; }
  if (e.suppression < 0.25 && e.stateT > 0.8) setState(G, ai, e, 'combat', 'unpinned');
  if (e.stateT > 6) setState(G, ai, e, 'reposition', 'pinned-too-long');
}

function stFlank(G, ai, e, dt) {
  const bb = SQ.getSquad(ai, e.squad);
  const target = e.lastKnown || bb.lastKnown;
  if (!target) { setState(G, ai, e, 'search', 'no-target'); return; }
  e.stance = 'stand';
  if (!e.goal) {
    const spot = pickFlank(G, ai, e, target, bb);
    if (!spot) { setState(G, ai, e, 'combat', 'no-flank'); return; }
    setGoal(e, spot.x, spot.y, spot.z, 'flank');
    SQ.claimSpot(G, bb, e, spot, 14);
  }
  e.speed = e.arch.sprint * (e.wounded ? 0.75 : 1);
  faceMotion(e, dt, 4.2);
  aimTick(G, ai, e, dt, e.canSee);
  // Moving fast and shooting are mutually exclusive; a man who does both is a
  // man the player cannot outmanoeuvre, and the flank stops meaning anything.
  if (e.canSee && planarDist(e.pos, G.player.pos) < e.arch.band[0] + 3) tryShoot(G, ai, e, dt, false);

  if (planarDist(e.pos, e.goal) < 1.6) { setState(G, ai, e, 'combat', 'flanked'); return; }
  if (e.stateT > 12 || e.pathFail > 2) setState(G, ai, e, 'combat', 'flank-failed');
}

function stReposition(G, ai, e, dt) {
  const bb = SQ.getSquad(ai, e.squad);
  e.stance = 'stand';
  e.peek = Math.max(0, e.peek - dt * 3);
  if (!e.goal) {
    let c = e.cover;
    if (!c || !coverStillWorks(G, e, G.player)) c = findCover(G, ai, e, (e.lastKnown || bb.lastKnown || G.player.pos));
    if (!c) {
      // Nowhere better to be. Standing still in the open is at least honest, and
      // combat will strafe.
      setState(G, ai, e, 'combat', 'no-cover');
      return;
    }
    e.cover = c;
    SQ.claimSpot(G, bb, e, c, 12);
    setGoal(e, c.x, c.y, c.z, 'cover');
  }
  e.speed = e.arch.sprint * 0.92 * (e.wounded ? 0.8 : 1);
  faceMotion(e, dt, 4.4);
  aimTick(G, ai, e, dt, false);
  if (planarDist(e.pos, e.goal) < 1.0 || e.stateT > 7 || e.pathFail > 2) setState(G, ai, e, 'combat', 'in-position');
}

function stRetreat(G, ai, e, dt) {
  const bb = SQ.getSquad(ai, e.squad);
  const threat = e.lastKnown || bb.lastKnown || G.player.pos;
  e.stance = 'stand';
  if (!e.goal) {
    const spot = findCover(G, ai, e, threat, { minDist: 12, away: true }) || awayFrom(G, ai, e, threat, 14);
    if (spot) setGoal(e, spot.x, spot.y, spot.z, 'retreat');
    else { setState(G, ai, e, 'combat', 'cornered'); return; }
  }
  e.speed = e.arch.sprint * 0.95;
  faceMotion(e, dt, 4.0);
  aimTick(G, ai, e, dt, e.canSee);
  // Fighting retreat: they still shoot, badly, over their shoulder.
  if (e.canSee && G.rng() < dt * 1.5) tryShoot(G, ai, e, dt, false);
  const arrived = planarDist(e.pos, e.goal) < 1.4;
  if (arrived || e.stateT > 8) {
    // Arrived and still hurt: hold here, out of sight, until the fight has moved
    // on or long enough has passed that going back in is the braver read. The
    // goal is deliberately left standing so he does not pick a new bolt-hole
    // every frame and retreat across the entire level.
    if (!e.wounded || e.stateT > 6) setState(G, ai, e, 'combat', 'back-in');
    else { e.speed = 0; e.stance = 'crouch'; }
  }
}

// ── cover ────────────────────────────────────────────────────────────────────
//
// `G.world.cover` is authored by the level as { pos, dir, height }: `pos` is the
// spot a body stands, `dir` is the outward normal pointing at the threat side,
// `height` is how much of a body it hides. All three are hints. A cover point is
// only cover from a specific angle, so every candidate is validated against
// where the player actually is, with a ray — a hint that turns out to be wrong
// costs a rejected candidate, never a man standing in the open thinking he is
// safe.

function findCover(G, ai, e, threat, opts = {}) {
  if (ai.coverBudget <= 0) return null;
  ai.coverBudget--;
  const nav = ai.nav;
  const bb = SQ.getSquad(ai, e.squad);
  const list = G.world.cover;
  let best = null, bestScore = -Infinity;

  const eyeThreat = { x: threat.x, y: threat.y, z: threat.z };
  const band = e.arch.band;
  const minD = opts.minDist || 0;

  const consider = (x, y, z, dirx, dirz, height, idx) => {
    const dToMe = planarDist(e.pos, { x, z });
    if (dToMe > 26) return;
    const dToThreat = Math.hypot(x - threat.x, z - threat.z);
    if (dToThreat < minD) return;
    if (SQ.spotTaken(bb, e, x, z, 2.4)) return;
    if (nav && !NAV.walkableAt(nav, x, z)) return;

    // The test that matters: from where the player is, can he see a body here?
    _v.x = x; _v.y = y + (height < 1.35 ? 0.75 : 1.2); _v.z = z;
    if (lineOfSight(G.world, eyeThreat, _v, 0.05)) return;

    // And can this body do anything from here? A hole with no firing position is
    // a hiding place, not cover.
    const px = -(z - threat.z), pz = (x - threat.x);
    const pl = Math.hypot(px, pz) || 1;
    let peek = null;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? e.peekSide : -e.peekSide;
      const qx = x + (px / pl) * 0.85 * side, qz = z + (pz / pl) * 0.85 * side;
      if (nav && !NAV.walkableAt(nav, qx, qz)) continue;
      _v2.x = qx; _v2.y = y + 1.35; _v2.z = qz;
      if (!lineOfSight(G.world, eyeThreat, _v2, 0.05)) continue;
      peek = { x: qx, y, z: qz, side };
      break;
    }
    if (!peek && !opts.away) return;

    let score = 0;
    score -= dToMe * 0.55;                                   // don't run across the map
    score -= Math.abs(dToThreat - (band[0] + band[1]) * 0.4) * 0.4;
    if (height >= 1.35) score += 3;                          // standing cover beats crouching
    if (peek) score += 5;
    if (idx >= 0) score += 2;                                // authored beats improvised
    if (dirx || dirz) {
      const tx = threat.x - x, tz = threat.z - z;
      const tl = Math.hypot(tx, tz) || 1;
      score += ((dirx * tx + dirz * tz) / tl) * 2.5;         // faces the right way
    }
    if (opts.away) score += dToThreat * 0.3;
    score += (G.rng() - 0.5) * 1.2;                          // two men pick different spots
    if (score > bestScore) {
      bestScore = score;
      best = {
        x, y, z, height,
        px: peek ? peek.x : x, py: y, pz: peek ? peek.z : z,
        side: peek ? peek.side : e.peekSide,
        srcIdx: idx, checkT: G.time.t,
      };
    }
  };

  let evaluated = 0;
  if (list && list.length) {
    for (let i = 0; i < list.length && evaluated < 20; i++) {
      const c = list[i];
      if (!c || !c.pos) continue;
      if (planarDist(e.pos, c.pos) > 26) continue;
      evaluated++;
      const d = c.dir || { x: 0, z: 0 };
      consider(c.pos.x, c.pos.y, c.pos.z, d.x || 0, d.z || 0, c.height != null ? c.height : 1.2, i);
    }
  }
  // Improvised cover: sample the nav grid between here and the threat. This is
  // what keeps the AI competent in a level whose author never placed a cover
  // point, and it costs a handful of rays because the budget is one enemy a tick.
  if (nav && evaluated < 14) {
    const want = 14 - evaluated;
    for (let k = 0; k < want; k++) {
      const a = G.rng() * Math.PI * 2;
      const r = 3 + G.rng() * 12;
      const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
      const ci = NAV.nearestWalkable(nav, x, z, 2, e.pos.y);
      if (ci < 0) continue;
      const cx = nav.x0 + ((ci % nav.nx) + 0.5) * nav.cell;
      const cz = nav.z0 + (((ci / nav.nx) | 0) + 0.5) * nav.cell;
      consider(cx, nav.h[ci], cz, 0, 0, 1.2, -1);
    }
  }
  return best;
}

// Re-validated a few times a second: cover that stops working the moment the
// player moves is exactly what should push an enemy out of it.
function coverStillWorks(G, e, p) {
  const c = e.cover;
  if (!c) return false;
  if (G.time.t - c.checkT < 0.35) return true;
  c.checkT = G.time.t;
  _v.x = c.x; _v.y = c.y + (c.height < 1.35 ? 0.75 : 1.2); _v.z = c.z;
  return !lineOfSight(G.world, p.pos, _v, 0.05);
}

function pickFlank(G, ai, e, target, bb) {
  const nav = ai.nav;
  if (!nav) return null;
  const p = G.player;
  // Aim for 60–130° off the player's current facing: far enough round that he
  // has to turn, close enough that the enemy arrives while the fight is still on.
  const base = Math.atan2(e.pos.x - target.x, e.pos.z - target.z);
  let best = null, bestScore = -Infinity;
  for (let k = 0; k < 12; k++) {
    const side = k % 2 === 0 ? 1 : -1;
    const ang = base + side * (1.05 + G.rng() * 1.2);
    const r = 8 + G.rng() * 9;
    const x = target.x + Math.sin(ang) * r, z = target.z + Math.cos(ang) * r;
    const ci = NAV.nearestWalkable(nav, x, z, 3, e.pos.y);
    if (ci < 0) continue;
    const cx = nav.x0 + ((ci % nav.nx) + 0.5) * nav.cell;
    const cz = nav.z0 + (((ci / nav.nx) | 0) + 0.5) * nav.cell;
    if (SQ.spotTaken(bb, e, cx, cz, 3)) continue;
    _v.x = cx; _v.y = nav.h[ci] + 1.4; _v.z = cz;
    if (!lineOfSight(G.world, p.pos, _v, 0.05)) continue;   // a flank with no shot is a walk
    const score = -planarDist(e.pos, { x: cx, z: cz }) * 0.4 + G.rng();
    if (score > bestScore) { bestScore = score; best = { x: cx, y: nav.h[ci], z: cz }; }
  }
  return best;
}

function pickSearchSpot(G, ai, e, bb) {
  const nav = ai.nav;
  const anchor = e.lastKnown || bb.lastKnown;
  if (!nav || !anchor) return null;
  // Likely hiding spots are the cells you cannot see from where he was last
  // seen. That is the same predicate as "cover", read from the other side.
  let best = null, bestScore = -Infinity;
  const from = { x: anchor.x, y: anchor.y + 1.4, z: anchor.z };
  for (let k = 0; k < 10; k++) {
    const a = G.rng() * Math.PI * 2;
    const r = 2.5 + G.rng() * 9;
    const x = anchor.x + Math.cos(a) * r, z = anchor.z + Math.sin(a) * r;
    const ci = NAV.nearestWalkable(nav, x, z, 2.5, anchor.y);
    if (ci < 0) continue;
    const cx = nav.x0 + ((ci % nav.nx) + 0.5) * nav.cell;
    const cz = nav.z0 + (((ci / nav.nx) | 0) + 0.5) * nav.cell;
    if (SQ.alreadySearched(bb, cx, cz, 3.5) || SQ.spotTaken(bb, e, cx, cz, 3)) continue;
    _v.x = cx; _v.y = nav.h[ci] + 1.0; _v.z = cz;
    const hidden = !lineOfSight(G.world, from, _v, 0.05);
    const score = (hidden ? 6 : 0) - planarDist(e.pos, { x: cx, z: cz }) * 0.25 + G.rng() * 1.5;
    if (score > bestScore) { bestScore = score; best = { x: cx, y: nav.h[ci], z: cz }; }
  }
  return best;
}

function awayFrom(G, ai, e, threat, want) {
  const nav = ai.nav;
  let dx = e.pos.x - threat.x, dz = e.pos.z - threat.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  for (let k = 0; k < 5; k++) {
    const a = (G.rng() - 0.5) * 1.4;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ox = dx * ca - dz * sa, oz = dx * sa + dz * ca;
    const x = e.pos.x + ox * want, z = e.pos.z + oz * want;
    if (!nav) return { x, y: e.pos.y, z };
    const ci = NAV.nearestWalkable(nav, x, z, 4, e.pos.y);
    if (ci < 0) continue;
    return {
      x: nav.x0 + ((ci % nav.nx) + 0.5) * nav.cell,
      y: nav.h[ci],
      z: nav.z0 + (((ci / nav.nx) | 0) + 0.5) * nav.cell,
    };
  }
  return null;
}

// ── movement ─────────────────────────────────────────────────────────────────

function setGoal(e, x, y, z, kind) {
  if (e.goal && e.goalKind === kind && Math.abs(e.goal.x - x) < 0.25 && Math.abs(e.goal.z - z) < 0.25) return;
  e.goal = e.goal || vec3();
  e.goal.x = x; e.goal.y = y; e.goal.z = z;
  e.goalKind = kind;
}

function ensurePath(G, ai, e) {
  if (!ai.nav || !e.goal || e.pathReq) return;
  const drift = e.pathGoal ? Math.hypot(e.pathGoal.x - e.goal.x, e.pathGoal.z - e.goal.z) : Infinity;
  const spent = !e.path || e.pathIdx >= e.path.length;
  const stale = G.time.t - e.pathT > 2.5;
  if (!spent && drift < 1.2 && !(stale && drift > 0.8)) return;
  // Very short hops do not deserve a search — walking three metres to a peek
  // position through the pathfinder would burn the whole budget on nothing.
  if (drift < 30 && planarDist(e.pos, e.goal) < 2.5 &&
      NAV.navClear(ai.nav, G.world, e.pos.x, e.pos.z, e.pos.y, e.goal.x, e.goal.z, e.goal.y)) {
    e.path = [{ x: e.pos.x, y: e.pos.y, z: e.pos.z }, { x: e.goal.x, y: e.goal.y, z: e.goal.z }];
    e.pathIdx = 1;
    e.pathGoal = { x: e.goal.x, y: e.goal.y, z: e.goal.z };
    e.pathT = G.time.t;
    return;
  }
  e.pathReq = NAV.requestPath(ai.nav, e.pos, e.goal, { owner: e.id });
  e.pathGoal = { x: e.goal.x, y: e.goal.y, z: e.goal.z };
  e.pathT = G.time.t;
  ai.stats.paths++;
}

function consumePath(G, ai, e) {
  const req = e.pathReq;
  if (!req || req.status === 'pending') return;
  e.pathReq = null;
  if (req.path && req.path.length > 1) {
    e.path = req.path;
    e.pathIdx = 1;
    e.pathFail = 0;
  } else {
    e.path = null;
    e.pathFail++;
  }
}

function locomote(G, ai, e, dt) {
  const speed = e.stagger > 0 ? 0 : (e.speed || 0) * (e.stance === 'crouch' ? 0.55 : 1);
  let wx = 0, wz = 0;

  if (speed > 0.01) {
    let tx = 0, tz = 0, have = false;
    if (e.path && e.pathIdx < e.path.length) {
      const wp = e.path[e.pathIdx];
      if (planarDist(e.pos, wp) < 0.55) {
        e.pathIdx++;
        if (e.pathIdx >= e.path.length) e.path = null;
      }
      if (e.path && e.pathIdx < e.path.length) {
        const w = e.path[e.pathIdx];
        tx = w.x - e.pos.x; tz = w.z - e.pos.z; have = true;
      }
    }
    if (!have && e.goal) {
      // No path yet — the request is still queued. Walk at the goal anyway: an
      // enemy standing frozen for six frames while A* catches up is far more
      // visible than one who sets off in roughly the right direction.
      tx = e.goal.x - e.pos.x; tz = e.goal.z - e.pos.z; have = true;
    }
    if (have) {
      const l = Math.hypot(tx, tz);
      if (l > 0.05) { wx = tx / l; wz = tz / l; }
    }
  }

  // Separation. Bodies are not allowed to occupy each other, and a soft push is
  // cheaper and steadier than resolving the overlap after the fact. It has to
  // work at zero speed too, or two men who arrive at the same doorway and stop
  // stand inside one another for the rest of the fight.
  let sep = 0, pushX = 0, pushZ = 0;
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o === e || !o.alive) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    const want = e.radius + o.radius + 0.25;
    if (d2 > want * want || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const push = (want - d) / want;
    wx += (dx / d) * push * 1.6; wz += (dz / d) * push * 1.6;
    sep = Math.max(sep, push);
    // Steering alone cannot fix an overlap that already happened — two men
    // converging on the same doorway at 5 m/s arrive interpenetrated and the
    // soft push takes half a second to undo it, which is half a second of one
    // body inside another. Deep overlap gets corrected positionally, split
    // between the pair, and the correction goes through the collision resolver
    // below so it can never shove anybody into a wall.
    const hard = e.radius + o.radius;
    if (d < hard) { pushX += (dx / d) * (hard - d) * 0.5; pushZ += (dz / d) * (hard - d) * 0.5; }
  }
  // Give the player room too — enemies that walk into your face and stop are the
  // classic tell that nobody thought about spacing.
  {
    const dx = e.pos.x - G.player.pos.x, dz = e.pos.z - G.player.pos.z;
    const d2 = dx * dx + dz * dz;
    const want = e.radius + C.CAPSULE_R + 0.3;
    if (d2 < want * want && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      wx += (dx / d) * 2.2; wz += (dz / d) * 2.2;
      sep = 1;
    }
  }

  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }

  let target = e.wounded ? speed * 0.85 : speed;
  if (sep > 0.02) target = Math.max(target, 1.1);
  const accel = 18;
  const k = 1 - Math.exp(-accel * dt / Math.max(1, target || 1));
  e.vel.x += (wx * target - e.vel.x) * k;
  e.vel.z += (wz * target - e.vel.z) * k;
  if (Math.abs(e.vel.x) < 1e-4) e.vel.x = 0;
  if (Math.abs(e.vel.z) < 1e-4) e.vel.z = 0;

  e.vel.y = Math.max(-60, e.vel.y + C.GRAVITY * dt);
  _delta.x = e.vel.x * dt + pushX; _delta.y = e.vel.y * dt; _delta.z = e.vel.z * dt + pushZ;
  const height = e.stance === 'crouch' ? e.crouchHeight : e.height;
  moveCharacter(G.world, e.pos, _delta, e.radius, height, _hit);
  e.grounded = !!_hit.ground;
  if (_hit.ground && e.vel.y < 0) e.vel.y = 0;
  if (_hit.ceiling && e.vel.y > 0) e.vel.y = 0;
  if (_hit.wall) {
    const d = e.vel.x * _hit.wallNormal.x + e.vel.z * _hit.wallNormal.z;
    if (d < 0) { e.vel.x -= _hit.wallNormal.x * d; e.vel.z -= _hit.wallNormal.z * d; }
  }

  // A body that leaves the world, or that produces a non-finite position through
  // some arithmetic nobody predicted, is recovered rather than left to poison
  // every raycast downstream.
  const b = G.world.bounds;
  if (!V.finite(e.pos) ||
      e.pos.x < b.min.x - 4 || e.pos.x > b.max.x + 4 ||
      e.pos.z < b.min.z - 4 || e.pos.z > b.max.z + 4 || e.pos.y < b.min.y - 4) {
    V.copy(e.pos, e.safePos);
    V.set(e.vel, 0, 0, 0);
    e.path = null;
  } else if (e.grounded) {
    V.copy(e.safePos, e.pos);
  }

  const moved = Math.hypot(e.vel.x, e.vel.z);
  e.gait = clamp(moved / Math.max(1, e.arch.sprint), 0, 1);
  // One place decides the rig's animation hint, and it decides it from what the
  // body actually did rather than from what the behaviour intended — a man
  // pressed against a wall should not be playing a run cycle.
  if (e.anim !== 'hit' || e.stagger <= 0) {
    e.anim = moved > e.arch.speed * 1.15 ? 'run'
      : moved > 0.35 ? (e.stance === 'crouch' ? 'crouch_walk' : 'walk')
        : (e.stance === 'crouch' ? 'crouch' : 'idle');
  }
  if (e.grounded && moved > 0.2) {
    e.stride += moved * dt;
    const len = moved > e.arch.speed * 1.15 ? 2.0 : e.stance === 'crouch' ? 1.35 : 1.7;
    if (e.stride >= len) {
      e.stride = 0;
      emit(G, 'step', {
        pos: V.clone(e.pos), surface: _hit.surface, sprint: moved > e.arch.speed * 1.15,
        source: e.id, team: e.team,
      });
    }
  }

  // Stuck detection. A pathfinder on a coarse grid will occasionally route a man
  // into a corner the collision resolver will not let him leave; the recovery is
  // to throw the path away and ask again rather than to vibrate against a wall.
  if (speed > 0.5) {
    e.stuckT += dt;
    if (e.stuckT > 0.9) {
      if (planarDist(e.pos, e.stuckRef) < 0.28) {
        e.path = null;
        e.pathGoal = null;
        e.pathT = -999;
        e.pathFail++;
        // A small deterministic sidestep breaks the symmetry that caused it.
        const a = G.rng() * Math.PI * 2;
        e.vel.x += Math.cos(a) * 2; e.vel.z += Math.sin(a) * 2;
      }
      e.stuckT = 0;
      V.copy(e.stuckRef, e.pos);
    }
  } else { e.stuckT = 0; V.copy(e.stuckRef, e.pos); }
}

function planarDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function faceMotion(e, dt, rate) {
  const l = Math.hypot(e.vel.x, e.vel.z);
  if (l < 0.25) return;
  turnTo(e, Math.atan2(-e.vel.x, -e.vel.z), rate, dt);
  e.aim.yaw = e.yaw;
}

function faceAt(e, p, dt, rate) {
  const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
  if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) return;
  turnTo(e, Math.atan2(-dx, -dz), rate, dt);
}

function turnTo(e, want, rate, dt) {
  let d = want - e.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const max = rate * dt;
  e.yaw += clamp(d, -max, max);
  if (e.yaw > Math.PI) e.yaw -= Math.PI * 2; else if (e.yaw < -Math.PI) e.yaw += Math.PI * 2;
}

function aimAlong(e, dt) {
  e.aim.yaw = e.yaw;
  e.aim.pitch = lerp(e.aim.pitch, 0, 1 - Math.exp(-4 * dt));
}

// Side-stepping in the open. A stationary silhouette is a free headshot and
// reads as a target dummy; two metres of lateral drift is enough to make the
// player track, and short enough that the goal never needs a real search.
function strafe(G, ai, e, dt, target) {
  const phase = Math.sin(G.time.t * 0.55 + e.scanPhase) > 0 ? 1 : -1;
  const settled = e.goalKind === 'strafe' && e.goal && e.strafeSign === phase &&
    planarDist(e.pos, e.goal) > 0.4;
  e.strafeSign = phase;
  if (settled) { e.speed = e.arch.speed * 0.6; return; }
  const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  const gx = e.pos.x + (-dz / l) * 2.2 * phase;
  const gz = e.pos.z + (dx / l) * 2.2 * phase;
  if (ai.nav && !NAV.walkableAt(ai.nav, gx, gz)) { e.speed = 0; e.goal = null; return; }
  setGoal(e, gx, e.pos.y, gz, 'strafe');
  e.speed = e.arch.speed * 0.6;
}

// ── gunnery ──────────────────────────────────────────────────────────────────
//
// Three separate mechanisms conspire to make an enemy dangerous but survivable:
// a reaction delay before the first shot, an aim error that starts wide and
// converges only while he can actually see you, and a burst rhythm with pauses
// long enough to move in. Remove any one and the fight stops working — no
// reaction time and you die to men you never saw; no convergence and they either
// never hit or always hit; no pauses and there is no moment to push.

function randomiseBias(G, e) {
  const a = G.rng() * Math.PI * 2;
  e.biasX = Math.cos(a) * (0.4 + G.rng() * 0.6);
  e.biasY = Math.sin(a) * (0.25 + G.rng() * 0.4);
}

function reacquire(G, ai, e) {
  // Losing sight and finding it again resets the tracking solution. This is why
  // breaking line of sight and re-peeking is a real tactic instead of a way of
  // handing the enemy a free second of settled aim.
  e.aimErr = Math.max(e.aimErr, e.weapon.errMax * 0.75);
  e.forceMiss = Math.max(e.forceMiss, 1);
  randomiseBias(G, e);
}

function aimTick(G, ai, e, dt, tracking) {
  const W = e.weapon;
  const sk = skillOf(ai, e);
  const errMin = W.errMin * (1.6 - 0.7 * sk);
  if (tracking && e.stagger <= 0) {
    const rate = W.converge * (0.6 + 0.9 * sk);
    e.aimErr += (errMin - e.aimErr) * (1 - Math.exp(-rate * dt));
    e.biasX *= Math.exp(-rate * dt * 0.8);
    e.biasY *= Math.exp(-rate * dt * 0.8);
  } else {
    e.aimErr = Math.min(W.errMax, e.aimErr + W.errMax * dt * 0.85);
  }
  // A target moving laterally is genuinely harder to track, and rewarding the
  // player for moving is most of what makes a firefight feel like a skill.
  const lateral = ai.playerSpeed;
  const floor = errMin + (W.errMax - errMin) * 0.35 * clamp(lateral / 6, 0, 1);
  e.aimErr = Math.max(e.aimErr, floor);
  e.aimErr = Math.min(W.errMax * 1.2, e.aimErr + e.flinch * 0.06 + e.suppression * 0.03);

  const p = G.player;
  const from = e.eyePos;
  const dx = p.pos.x - from.x, dy = p.pos.y - 0.15 - from.y, dz = p.pos.z - from.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.asin(clamp(dy / l, -1, 1));
  const rate = tracking ? 7.5 * (0.6 + 0.7 * sk) : 3.5;
  let d = wantYaw - e.aim.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const k = 1 - Math.exp(-rate * dt);
  e.aim.yaw += d * k;
  e.aim.pitch += (wantPitch - e.aim.pitch) * k;
}

function reloadTick(G, ai, e, dt) {
  if (e.reloadT > 0) {
    e.reloadT -= dt;
    if (e.reloadT <= 0) {
      e.ammo = e.weapon.mag;
      emit(G, 'reload', { weapon: e.kind, phase: 'end', source: e.id, team: e.team });
    }
    return;
  }
  if (e.ammo <= 0) {
    e.reloadT = e.weapon.reload;
    e.burst = 0;
    emit(G, 'reload', { weapon: e.kind, phase: 'start', duration: e.weapon.reload, source: e.id, team: e.team });
    // Reloading is loud and it is a tell. The player who counts rounds should be
    // rewarded for it.
    emit(G, 'aiCallout', { source: e.id, squad: e.squad, reason: 'reloading', pos: V.clone(e.pos) });
  }
}

function canFire(e) {
  return e.alive && e.reloadT <= 0 && e.ammo > 0 && e.reactT <= 0 && e.stagger <= 0 && e.fireT <= 0;
}

function tryShoot(G, ai, e, dt, blind, pauseMul = 1) {
  if (!canFire(e)) return false;
  if (e.burst <= 0) {
    if (e.burstPause > 0) return false;
    const b = e.weapon.burst;
    let n = b[0] + Math.floor(G.rng() * (b[1] - b[0] + 1));
    if (pauseMul > 1) n = Math.max(1, Math.round(n / 1.8));
    e.burst = n;
  }
  fireRound(G, ai, e, blind, null);
  e.burst--;
  e.fireT = 60 / e.weapon.rpm;
  if (e.burst <= 0) {
    const pz = e.weapon.pause;
    // Less skilled shooters pause longer. It is the cleanest difficulty knob
    // there is, because it changes how much room the player gets without
    // changing how accurate anybody is.
    const sk = skillOf(ai, e);
    e.burstPause = (pz[0] + G.rng() * (pz[1] - pz[0])) * (1.5 - 0.6 * sk) * pauseMul;
  }
  return true;
}

function suppressFire(G, ai, e, dt, bb) {
  // Fire on the last known position to keep the player where he is. Nobody
  // expects to hit; the point is that the player who steps out gets shot at, so
  // the flanker's arrival means something.
  if (!SQ.requestToken(G, bb, e, SQ.TOKEN.SUPPRESS)) return;
  if (!canFire(e) || e.burstPause > 0) return;
  const aimAt = e.lastKnown || bb.lastKnown;
  if (!aimAt) return;
  if (!lineOfSight(G.world, e.eyePos, { x: aimAt.x, y: aimAt.y, z: aimAt.z }, 0.1)) return;
  if (e.burst <= 0) {
    const b = e.weapon.burst;
    e.burst = b[0] + Math.floor(G.rng() * (b[1] - b[0] + 1));
  }
  fireRound(G, ai, e, true, aimAt);
  e.burst--;
  e.fireT = 60 / e.weapon.rpm;
  if (e.burst <= 0) {
    const pz = e.weapon.suppressPause;
    e.burstPause = pz[0] + G.rng() * (pz[1] - pz[0]);
  }
}

function blindFire(G, ai, e) {
  if (!canFire(e)) return;
  const aimAt = e.lastKnown;
  if (!aimAt) return;
  fireRound(G, ai, e, true, { x: aimAt.x, y: aimAt.y + 1.2, z: aimAt.z });
  e.fireT = 0.25 + G.rng() * 0.4;
}

function fireRound(G, ai, e, blind, atOverride) {
  const W = e.weapon;
  const p = G.player;
  const from = e.eyePos;

  let tx, ty, tz;
  if (atOverride) { tx = atOverride.x; ty = atOverride.y; tz = atOverride.z; }
  else {
    // Lead the target. Imperfectly: the lead factor is scaled by skill, so a
    // conscript consistently shoots behind a strafing player and an operator
    // does not, and both are legible from the tracers.
    const d = Math.hypot(p.pos.x - from.x, p.pos.y - from.y, p.pos.z - from.z);
    const tof = d / W.bulletSpeed;
    const lead = W.lead * (0.35 + 0.75 * skillOf(ai, e));
    tx = p.pos.x + ai.playerVel.x * tof * lead;
    ty = p.pos.y - 0.15 + ai.playerVel.y * tof * lead * 0.5;
    tz = p.pos.z + ai.playerVel.z * tof * lead;
  }

  let dx = tx - from.x, dy = ty - from.y, dz = tz - from.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  dx /= dist; dy /= dist; dz /= dist;

  // Build a basis around the shot so the error is a cone, not an axis-aligned
  // wobble that looks wrong when the shooter is above or below you.
  let rx = -dz, ry = 0, rz = dx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * dz - rz * dy, uy = rz * dx - rx * dz, uz = rx * dy - ry * dx;

  let ax = e.biasX * e.aimErr + (G.rng() * 2 - 1) * e.aimErr * 0.45;
  let ay = e.biasY * e.aimErr + (G.rng() * 2 - 1) * e.aimErr * 0.45;
  if (blind) { ax += (G.rng() * 2 - 1) * 0.06; ay += (G.rng() * 2 - 1) * 0.04 + 0.02; }
  if (e.forceMiss > 0) {
    // The opening rounds are guaranteed to miss, by a margin the player can see
    // kick up off the wall next to him. This is the difference between "they
    // opened fire" and "I was already dead".
    const side = G.rng() < 0.5 ? -1 : 1;
    const metres = 0.65 + G.rng() * 1.15;
    ax = side * (metres / Math.max(dist, 1)) + ax * 0.3;
    ay = (G.rng() * 0.5 + 0.15) / Math.max(dist, 1) + ay * 0.3;
    e.forceMiss--;
  }

  let sx = dx + rx * ax + ux * ay;
  let sy = dy + ry * ax + uy * ay;
  let sz = dz + rz * ax + uz * ay;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;

  e.ammo--;
  e.shotsFired++;
  e.firing = true;
  V.copy(e.muzzle, from);
  ai.stats.shots++;
  emit(G, 'shot', {
    weapon: e.kind, source: e.id, team: e.team,
    origin: V.clone(from), dir: { x: sx, y: sy, z: sz },
    range: W.range,
  });

  const wall = raycast(G.world, from, { x: sx, y: sy, z: sz }, W.range, (s) => s.solid !== false);
  const ph = rayHitsPlayer(G, from, sx, sy, sz, W.range);

  if (ph && (!wall || ph.t < wall.t)) {
    const mult = C.HITBOX[ph.part] != null ? C.HITBOX[ph.part] : 1;
    // Range falloff: the archetype's `range` is where the round stops mattering,
    // not a hard wall.
    const fall = clamp(1 - Math.max(0, ph.t - W.range * 0.5) / (W.range * 0.9), 0.35, 1);
    ai.stats.hits++;
    damagePlayer(G, W.damage * mult * fall, e.id);
    emit(G, 'impact', {
      point: ph.point, normal: { x: -sx, y: -sy, z: -sz },
      surface: C.SURFACE.FLESH, energy: W.damage * fall, source: e.id, target: 'player', part: ph.part,
    });
    return;
  }
  if (wall) {
    emit(G, 'impact', {
      point: wall.point, normal: wall.normal, surface: wall.surface,
      energy: W.damage, source: e.id,
    });
  }
  // A round that goes past close enough to hear is worth telling the FX and
  // audio layers about — the crack of a near miss is most of what makes being
  // shot at feel like being shot at.
  const miss = pointLineDist(p.pos, from, sx, sy, sz, W.range);
  if (miss < 1.8) emit(G, 'nearMiss', { pos: V.clone(p.pos), dist: miss, source: e.id });
}

// Ray against the player's collision cylinder. The player is not made of
// hitboxes — he is one capsule — but the vertical band still decides the
// multiplier, so a headshot on the player costs what a headshot should.
function rayHitsPlayer(G, o, dx, dy, dz, maxD) {
  const p = G.player;
  if (!p.alive) return null;
  const feet = p.pos.y - p.eye;
  const h = p.stance === 'stand' ? C.CAPSULE_H : C.CAPSULE_H * 0.62;
  const r = C.CAPSULE_R;
  const ox = o.x - p.pos.x, oz = o.z - p.pos.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxD) return null;
  const y = o.y + dy * t;
  if (y < feet || y > feet + h) return null;
  const rel = (y - feet) / h;
  const part = rel > 0.87 ? 'HEAD' : rel > 0.55 ? 'CHEST' : rel > 0.36 ? 'STOMACH' : 'LEG';
  return { t, part, point: { x: o.x + dx * t, y, z: o.z + dz * t } };
}

function pointLineDist(p, o, dx, dy, dz, maxD) {
  const vx = p.x - o.x, vy = p.y - o.y, vz = p.z - o.z;
  let t = vx * dx + vy * dy + vz * dz;
  t = clamp(t, 0, maxD);
  return Math.hypot(vx - dx * t, vy - dy * t, vz - dz * t);
}

// ── damage & death ───────────────────────────────────────────────────────────

/**
 * The canonical way to hurt an enemy.
 *
 *   damageEnemy(G, enemy, amount, part, source, opts)
 *
 * `amount` is the weapon's base damage; the C.HITBOX[part] multiplier is applied
 * here so callers never have to remember to. Pass `opts.premultiplied` if it
 * already was. Emits 'damage', and 'kill' if this is the fatal hit. Returns the
 * damage actually dealt.
 *
 * The weapons module may instead write `enemy.hp` directly — that works too, and
 * the reaction (flinch, alert, callout) still happens, because updateEnemy
 * notices hp moved since the last tick.
 */
export function damageEnemy(G, e, amount, part = 'CHEST', source = 'player', opts = {}) {
  if (!e || !e.alive || !(amount > 0)) return 0;
  const ai = ensureAI(G);
  const mult = opts.premultiplied ? 1 : (C.HITBOX[part] != null ? C.HITBOX[part] : 1);
  const dealt = amount * mult;
  e.hp -= dealt;
  e._hp = e.hp;
  G.stats.damage += dealt;
  ai.own.add(emit(G, 'damage', { target: e.id, amount: dealt, part, source, hp: Math.max(0, e.hp) }));
  reactToHit(G, ai, e, dealt, part);
  if (e.hp <= 0) killEnemy(G, e, source, part === 'HEAD');
  return dealt;
}

// A 'damage' event that this module did not emit came from the weapons module.
// If it already moved `hp` we only react; if it did not, we apply it. That way
// either convention works and neither double-counts.
function applyForeignDamage(G, ai, ev) {
  if (ev.target === 'player') return;
  const e = ev.enemy && ev.enemy.hitboxes ? ev.enemy : (ev.target != null ? findEnemy(G, ev.target) : null);
  if (!e || !e.alive) return;
  if (e.hp < e._hp) return;                 // hp already moved; updateEnemy reacts
  const amount = ev.amount || 0;
  if (amount <= 0) return;
  e.hp -= amount;
  G.stats.damage += amount;
  reactToHit(G, ai, e, amount, ev.part);
  if (e.hp <= 0) killEnemy(G, e, ev.source || 'player', ev.part === 'HEAD');
  e._hp = e.hp;
}

function reactToHit(G, ai, e, amount, part) {
  e.flinch = Math.min(1, e.flinch + amount / 40);
  // Stagger is short on purpose. Long stagger turns a firefight into a stunlock
  // and takes the fight away from whoever is losing it.
  e.stagger = Math.max(e.stagger, Math.min(0.28, 0.06 + amount / 260));
  e.suppression = Math.min(1, e.suppression + 0.35);
  e.anim = 'hit';
  emit(G, 'aiHit', { target: e.id, amount, part: part || null, pos: V.clone(e.pos) });

  // Being shot tells you where from — roughly. Even an enemy who never saw the
  // player now has a direction to face, which is what stops him standing there
  // while you empty a magazine into his back. The estimate is deliberately not
  // exact: you know which way the round came from, not the range, so a man shot
  // from sixty metres looks the right way and walks at the wrong spot.
  const p = G.player;
  e.awareness = Math.max(e.awareness, 0.85);
  const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  const err = Math.min(9, d * 0.16);
  _v.x = p.pos.x + (G.rng() * 2 - 1) * err;
  _v.y = p.pos.y;
  _v.z = p.pos.z + (G.rng() * 2 - 1) * err;
  noteContact(G, ai, e, _v, 0.7, 'hit');
  if (e.state === 'idle' || e.state === 'patrol' || e.state === 'alert' || e.state === 'search') {
    setState(G, ai, e, 'combat', 'shot-at');
  }
}

/**
 * killEnemy(G, enemy, source, headshot) — kill outright, skipping the damage
 * path. Emits 'kill' unless the weapons module already did (it sets
 * `killEmitted` by emitting a 'kill' event with this enemy's id, which this
 * module watches for).
 */
export function killEnemy(G, e, source = 'player', headshot = false) {
  const ai = ensureAI(G);
  // Guarded on the state, not on `alive`: another module may already have
  // cleared the flag, and this still needs to run exactly once.
  if (!e || e.state === 'dead') return;
  const bb = SQ.getSquad(ai, e.squad);
  SQ.releaseAll(G, bb, e);
  if (e.pathReq && ai.nav) NAV.cancelPath(ai.nav, e.pathReq);
  e.pathReq = null;
  e.alive = false;
  e.hp = 0;
  e.prevState = e.state;
  e.state = 'dead';
  e.stateT = 0;
  e.anim = 'death';
  e.deathT = G.time.t;
  e.removeAt = G.time.t + CORPSE_TIME;
  e.speed = 0;
  e.goal = null;
  e.path = null;
  e.canSee = false;
  V.set(e.vel, 0, 0, 0);
  bb.deaths++;
  ai.stats.killed++;
  emit(G, 'aiState', { target: e.id, from: e.prevState, to: 'dead', why: source, pos: V.clone(e.pos) });
  if (!e.killEmitted) {
    e.killEmitted = true;
    G.stats.kills++;
    if (headshot) G.stats.headshots++;
    ai.own.add(emit(G, 'kill', { target: e.id, weapon: source, headshot, pos: V.clone(e.pos) }));
  }
  // A man going down in front of you is information. The squad gets the shooter's
  // position and the survivors get nervous.
  for (const o of G.enemies) {
    if (!o.alive || o.squad !== e.squad) continue;
    if (planarDist(o.pos, e.pos) > SQ.EARSHOT) continue;
    o.suppression = Math.min(1, o.suppression + 0.2);
    if (o.state === 'idle' || o.state === 'patrol') {
      o.awareness = Math.max(o.awareness, 0.5);
      setState(G, ai, o, 'alert', 'man-down');
    }
  }
  emit(G, 'aiCallout', { source: e.id, squad: e.squad, reason: 'man-down', pos: V.clone(e.pos) });
}

// ── body & hitboxes ──────────────────────────────────────────────────────────
//
// Hitboxes live in world space and are rebuilt every tick, because ballistics
// raycasts against them and a stale box is a shot that misses a man standing in
// front of you. Each part is an AABB of the yaw-rotated part box — cheap, and at
// these sizes indistinguishable from an oriented box except at the corners.

function updateBody(e, player) {
  // A corpse is flattened rather than removed, so a body on the floor still has
  // boxes to shoot and to draw decals against, and no bullet ever passes through
  // a man who is visibly lying there.
  const crouch = e.stance === 'crouch' || !e.alive;
  const yScale = !e.alive ? 0.3 : crouch ? 0.68 : 1;
  e.eye = e.alive ? 1.58 * (crouch ? 0.68 : 1) : 0.4;
  e.eyePos.x = e.pos.x; e.eyePos.y = e.pos.y + e.eye; e.eyePos.z = e.pos.z;

  const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
  const as = Math.abs(s), ac = Math.abs(c);
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;

  for (let i = 0; i < PARTS.length; i++) {
    const P = PARTS[i], H = e.hitboxes[i];
    // Local +X is the body's right: with forward = (-sin, -cos), right is
    // (-cos, sin).
    const ox = P.ox * -c + P.oz * -s;
    const oz = P.ox * s + P.oz * -c;
    const hx = P.hx * ac + P.hz * as;
    const hz = P.hx * as + P.hz * ac;
    const y0 = e.pos.y + P.y0 * yScale;
    const y1 = e.pos.y + P.y1 * yScale;
    H.min.x = e.pos.x + ox - hx; H.max.x = e.pos.x + ox + hx;
    H.min.z = e.pos.z + oz - hz; H.max.z = e.pos.z + oz + hz;
    H.min.y = y0; H.max.y = y1;
    if (H.min.x < minx) minx = H.min.x;
    if (H.min.y < miny) miny = H.min.y;
    if (H.min.z < minz) minz = H.min.z;
    if (H.max.x > maxx) maxx = H.max.x;
    if (H.max.y > maxy) maxy = H.max.y;
    if (H.max.z > maxz) maxz = H.max.z;
  }
  e.bounds.min.x = minx; e.bounds.min.y = miny; e.bounds.min.z = minz;
  e.bounds.max.x = maxx; e.bounds.max.y = maxy; e.bounds.max.z = maxz;
  e.muzzle.x = e.eyePos.x; e.muzzle.y = e.eyePos.y - 0.12; e.muzzle.z = e.eyePos.z;

  // Fields the rig reads. `feetY` is spelled out rather than left to be inferred
  // because `pos` is the feet here and the eye for the player, and a rig that
  // guesses wrong buries the model or floats it — cheaper to be explicit than to
  // make every consumer probe the floor.
  e.feetY = e.pos.y;
  e.pitch = e.aim.pitch;
  const cp = Math.cos(e.aim.pitch);
  e.aimDir.x = -Math.sin(e.aim.yaw) * cp;
  e.aimDir.y = Math.sin(e.aim.pitch);
  e.aimDir.z = -Math.cos(e.aim.yaw) * cp;
  e.aiming = e.alive && (e.state === 'combat' || e.state === 'suppressed' ||
    e.state === 'flank' || e.state === 'reposition' || e.state === 'retreat');
  // Where the eyes go, which is not always where the gun goes: a man moving to
  // cover keeps looking at the threat.
  e.attend = e.alive ? (e.canSee ? player : e.lastKnown) : null;
}

/** Eye/muzzle position of an enemy, world space. Cached; this is the accessor
 *  other modules should use rather than re-deriving it. */
export function enemyEye(e, out = vec3()) { return V.copy(out, e.eyePos); }

/** Ray against one enemy's hitboxes. Exported for the ballistics module: it
 *  keeps the part→multiplier mapping in one place. Returns
 *  { t, part, mult, point } or null. */
export function rayEnemy(e, o, d, maxD = 500) {
  if (!e || !e.alive) return null;
  // Broadphase first: one slab test against the whole body rejects almost every
  // enemy on the map before the seven-box loop runs.
  if (rayAabb(o, d, e.bounds.min, e.bounds.max, maxD) == null) return null;
  let best = null;
  for (let i = 0; i < e.hitboxes.length; i++) {
    const h = e.hitboxes[i];
    const t = rayAabb(o, d, h.min, h.max, maxD);
    if (t == null) continue;
    if (best && t >= best.t) continue;
    best = { t, part: h.part, mult: C.HITBOX[h.part] || 1, point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t } };
  }
  return best;
}

function rayAabb(o, d, min, max, maxD) {
  let tmin = 0, tmax = maxD;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z;
    const da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const lo = a === 0 ? min.x : a === 1 ? min.y : min.z;
    const hi = a === 0 ? max.x : a === 1 ? max.y : max.z;
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
    const inv = 1 / da;
    let t1 = (lo - oa) * inv, t2 = (hi - oa) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}

export { NAV, SQ };
