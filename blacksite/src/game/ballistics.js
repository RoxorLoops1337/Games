// Ballistics — one hitscan bullet, from the eye to wherever it finally stops.
//
// Bullets are instant. Travel time is a lie players read as lag at the ranges
// this level is built for, so the only thing that varies with distance is how
// much the round still hurts when it arrives.
//
// The interesting part is what happens after the first surface. A round that
// hits a plasterboard partition should come out the far side and still kill; a
// round that hits a steel container should die in it. Both fall out of one loop:
// trace, spend energy on whatever was crossed, restart from the exit wound. Two
// crossings is the cap — the third is never something the player could have
// planned, so it is only cost.
//
// Pure simulation: data in, data and events out. No Three.js, no DOM.

import { PENETRATION, HITBOX, SURFACE, TEAM } from '../core/constants.js';
import { emit, clamp } from '../core/state.js';
import { raycast, rayBox } from '../world/collision.js';

// Two crossings per bullet. Anything beyond that is noise the player cannot aim.
export const MAX_PENETRATIONS = 2;

// Below this fraction of muzzle energy the round is doing less than three points
// of damage with anything in the roster — it stops inside the material instead
// of dribbling out the far side.
export const MIN_ENERGY = 0.10;

// The longest a single bullet segment is traced. Sight lines in this level top
// out around 90 m; the rest is headroom for a sniper on a roof.
export const MAX_TRACE = 320;

// A bullet crossing a slab at 60° off the normal really does chew through more
// material than the slab is thick, but a shot along the *length* of a wall would
// otherwise claim to cross twenty metres of concrete. Cap the obliquity.
const OBLIQUE_MAX = 2.5;

// Every crossing costs a little on top of the per-centimetre loss: the entry
// deformation. Without it a stack of window panes is free to shoot through.
const CROSS_TAX = 0.92;

// Nudge past the exit face so the next segment does not immediately re-hit the
// box it just left.
const EPS = 0.004;

// How close a round has to pass to be worth a supersonic crack. Four metres is
// generous on purpose: being shot at from off-screen is otherwise completely
// silent until the health bar moves, and the crack is the only cue that tells
// you which way to turn.
export const WHIZZ_RADIUS = 4;

// Nominal muzzle velocity when a weapon does not declare one. Only the audio
// layer uses it, for doppler — the bullet itself is instant.
export const DEFAULT_MUZZLE = 850;

const bulletFilter = (s) => s.solid !== false;

// ── damage over distance ─────────────────────────────────────────────────────

// A plateau, an S-curve, then a floor. Linear falloff is what makes a weapon
// feel like a spreadsheet: every metre matters slightly and none of them matter
// enough to change how you play. A plateau you can *feel* the edge of is what
// turns "which gun" into a positioning decision.
export function damageAtRange(weapon, dist) {
  const c = weapon && weapon.dmg;
  if (!c) return 0;
  if (dist <= c.d0) return c.near;
  if (dist >= c.d1) return c.far;
  const t = (dist - c.d0) / Math.max(c.d1 - c.d0, 1e-6);
  const s = t * t * (3 - 2 * t);
  return c.near + (c.far - c.near) * s;
}

// How much of the round survives `cm` of `surface`, given the weapon's
// penetration rating. A rating of 1 is the assault-rifle baseline: it clears the
// table's `maxCm` exactly, arriving with about a tenth of its energy.
export function penetrationLoss(surface, cm, pen = 1) {
  const P = PENETRATION[surface] || { loss: 0.5, maxCm: 6 };
  const p = Math.max(pen, 0.05);
  if (cm > P.maxCm * p) return 0;                 // absorbed; nothing comes out
  return Math.exp(-P.loss * cm / (2 * p)) * CROSS_TAX;
}

// ── hitboxes ─────────────────────────────────────────────────────────────────

// The AI agent owns the enemy schema and it may not be settled yet, so every
// read here is defensive: named parts are normalised, missing boxes fall back to
// a stand-in humanoid, and boxes authored in either space are accepted.
function partKey(name) {
  if (typeof name !== 'string') return 'CHEST';
  const s = name.toUpperCase();
  if (s.indexOf('HEAD') >= 0 || s.indexOf('SKULL') >= 0 || s.indexOf('NECK') >= 0) return 'HEAD';
  if (s.indexOf('ARM') >= 0 || s.indexOf('HAND') >= 0 || s.indexOf('SHOULDER') >= 0) return 'ARM';
  if (s.indexOf('LEG') >= 0 || s.indexOf('FOOT') >= 0 || s.indexOf('THIGH') >= 0 || s.indexOf('SHIN') >= 0) return 'LEG';
  if (s.indexOf('STOMACH') >= 0 || s.indexOf('PELVIS') >= 0 || s.indexOf('ABDOM') >= 0 || s.indexOf('GUT') >= 0) return 'STOMACH';
  return 'CHEST';
}

// Boxes may be authored around the origin (rig space, moved by `pos`) or already
// in world space. `space:'local'|'world'` settles it when the AI sets it;
// otherwise: a box sitting near the origin while the enemy stands forty metres
// away is obviously local. When the enemy *is* near the origin both readings
// agree, so guessing wrong there costs nothing.
function isLocalBox(min, max, pos) {
  const cx = (min.x + max.x) * 0.5, cz = (min.z + max.z) * 0.5;
  const dWorld = Math.hypot(cx - pos.x, cz - pos.z);
  const dLocal = Math.hypot(cx, cz);
  return dWorld > 1.5 && dLocal < dWorld;
}

// Pooled so a nine-pellet blast against six enemies does not allocate 200 boxes.
const _pool = [];
let _poolN = 0;
function takeBox() {
  if (_poolN >= _pool.length) _pool.push({ part: 'CHEST', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } });
  return _pool[_poolN++];
}

export function enemyHitboxes(e, out = []) {
  out.length = 0;
  if (!e) return out;
  const pos = e.pos || e.position;
  if (!pos) return out;
  _poolN = 0;

  const list = e.hitboxes;
  if (Array.isArray(list) && list.length) {
    for (let i = 0; i < list.length; i++) {
      const hb = list[i];
      if (!hb) continue;
      const mn = hb.min || hb.lo, mx = hb.max || hb.hi;
      if (!mn || !mx) continue;
      const local = hb.space ? hb.space === 'local' : isLocalBox(mn, mx, pos);
      const b = takeBox();
      b.part = partKey(hb.part || hb.name);
      const ox = local ? pos.x : 0, oy = local ? pos.y : 0, oz = local ? pos.z : 0;
      b.min.x = Math.min(mn.x, mx.x) + ox; b.max.x = Math.max(mn.x, mx.x) + ox;
      b.min.y = Math.min(mn.y, mx.y) + oy; b.max.y = Math.max(mn.y, mx.y) + oy;
      b.min.z = Math.min(mn.z, mx.z) + oz; b.max.z = Math.max(mn.z, mx.z) + oz;
      out.push(b);
    }
    if (out.length) return out;
  }

  // Fallback: a boxed humanoid standing on `pos`. Proportions are the same ones
  // the viewmodel and the AI's cover heights assume, so a rigged enemy and an
  // unrigged one shoot the same.
  const h = e.height || 1.8;
  const feet = e.feetY != null ? e.feetY : pos.y;
  const seg = (part, y0, y1, r) => {
    const b = takeBox();
    b.part = part;
    b.min.x = pos.x - r; b.max.x = pos.x + r;
    b.min.z = pos.z - r; b.max.z = pos.z + r;
    b.min.y = feet + h * y0; b.max.y = feet + h * y1;
    out.push(b);
  };
  seg('HEAD', 0.845, 1.0, 0.13);
  seg('CHEST', 0.585, 0.845, 0.24);
  seg('STOMACH', 0.455, 0.585, 0.21);
  seg('LEG', 0.0, 0.455, 0.20);
  return out;
}

// Closest approach of a point to the segment [origin, origin + dir·len], as
// { miss, at, point }. The whole traced path of a bullet is one straight line
// however many walls it went through, so this is exact rather than per-segment.
export function closestApproach(p, origin, dir, len) {
  const vx = p.x - origin.x, vy = p.y - origin.y, vz = p.z - origin.z;
  let at = vx * dir.x + vy * dir.y + vz * dir.z;
  if (at < 0) at = 0; else if (at > len) at = len;
  const px = origin.x + dir.x * at, py = origin.y + dir.y * at, pz = origin.z + dir.z * at;
  return { miss: Math.hypot(p.x - px, p.y - py, p.z - pz), at, point: { x: px, y: py, z: pz } };
}

// The crack of a round going past your head. Emitted for anything the player did
// not fire — a bullet leaving the player's own muzzle passes within nothing of
// him by definition, so his own weapon is excluded rather than filtered by
// distance. Exported so any module that traces its own bullets (the AI does) can
// get the same event with one call instead of re-deriving the geometry.
export function emitWhizz(G, origin, dir, len, opts = {}) {
  const p = G.player;
  if (!p || !p.alive) return null;
  const ca = closestApproach(p.pos, origin, dir, len);
  const radius = opts.radius != null ? opts.radius : WHIZZ_RADIUS;
  if (ca.miss > radius) return null;
  return emit(G, 'whizz', {
    point: ca.point,
    miss: ca.miss,
    speed: opts.speed != null ? opts.speed : DEFAULT_MUZZLE,
    at: ca.at,
    weapon: opts.weapon || null,
    source: opts.source != null ? opts.source : null,
    team: opts.team != null ? opts.team : null,
    shotId: opts.shotId || 0,
  });
}

const _hb = [];
const _ids = new Set();

function enemyId(e, i) { return e.id != null ? e.id : e; void i; }

// Nearest hostile hitbox along the segment, or null. `skip` holds the enemies
// this bullet has already gone through, so a round that clips a leg and then the
// torso of the same body only bills once.
export function rayEnemies(G, o, dir, maxT, skip, team) {
  const list = G.enemies;
  if (!list || !list.length) return null;
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.alive === false) continue;
    if (typeof e.hp === 'number' && e.hp <= 0) continue;
    if (skip && skip.has(enemyId(e, i))) continue;
    if (team != null && e.team != null && e.team === team) continue;
    const p = e.pos || e.position;
    if (!p) continue;
    // Sphere reject before the four slab tests. 2 m covers any humanoid box set
    // however the AI authors it.
    const rx = p.x - o.x, ry = p.y - o.y, rz = p.z - o.z;
    const along = rx * dir.x + ry * dir.y + rz * dir.z;
    if (along < -2.5 || along > maxT + 2.5) continue;
    const perp2 = (rx * rx + ry * ry + rz * rz) - along * along;
    if (perp2 > 4.5) continue;

    enemyHitboxes(e, _hb);
    for (let j = 0; j < _hb.length; j++) {
      const b = _hb[j];
      const r = rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, b);
      if (!r) continue;
      const t = r.tmin >= 0 ? r.tmin : 0;
      if (t > maxT) continue;
      if (best && t >= best.t) continue;
      const n = { x: 0, y: 0, z: 0 };
      if (r.axis === 0) n.x = r.sign; else if (r.axis === 1) n.y = r.sign; else n.z = r.sign;
      best = { t, exit: r.tmax, part: b.part, enemy: e, index: i, normal: n };
    }
  }
  return best;
}

// ── applying damage ──────────────────────────────────────────────────────────

export function damageEnemy(G, e, amount, ctx = {}) {
  if (!e || amount <= 0) return 0;
  if (e.alive === false) return 0;
  // Armour is the AI's to define; if it never sets one this is a no-op.
  if (typeof e.armor === 'number') amount *= 1 - clamp(e.armor, 0, 0.9);
  amount = Math.max(0, amount);

  const before = typeof e.hp === 'number' ? e.hp : 100;
  const after = before - amount;
  e.hp = after;
  e.lastHurt = G.time.t;
  e.lastHurtBy = ctx.source || 'player';
  if (ctx.dir) e.lastHurtDir = { x: ctx.dir.x, y: ctx.dir.y, z: ctx.dir.z };

  G.stats.damage += Math.min(amount, before > 0 ? before : amount);

  // The audio and FX layers place the flesh hit at `point`; a caller that did
  // not trace a ray (a grenade, a melee) still gets the body's own position
  // rather than a null they would have to guess around.
  const at = ctx.point ? { x: ctx.point.x, y: ctx.point.y, z: ctx.point.z }
    : (e.pos ? { x: e.pos.x, y: e.pos.y + (e.height || 1.8) * 0.62, z: e.pos.z } : null);

  emit(G, 'damage', {
    target: e.id != null ? e.id : ctx.index,
    enemy: e,
    amount,
    hp: Math.max(0, after),
    part: ctx.part || 'CHEST',
    mult: ctx.mult != null ? ctx.mult : 1,
    headshot: ctx.part === 'HEAD',
    weapon: ctx.weapon || null,
    dist: ctx.dist || 0,
    point: at,
    pos: at,
    dir: ctx.dir || null,
    penetrated: !!ctx.penetrated,
    lethal: after <= 0 && before > 0,
  });

  if (after <= 0 && before > 0) {
    e.hp = 0;
    e.alive = false;
    e.diedAt = G.time.t;
    G.stats.kills++;
    if (ctx.part === 'HEAD') G.stats.headshots++;
    emit(G, 'kill', {
      target: e.id != null ? e.id : ctx.index,
      enemy: e,
      weapon: ctx.weapon || null,
      headshot: ctx.part === 'HEAD',
      part: ctx.part || 'CHEST',
      dist: ctx.dist || 0,
      point: at,
      pos: at,
      dir: ctx.dir || null,
      overkill: -after,
    });
  }
  return amount;
}

// ── the bullet ───────────────────────────────────────────────────────────────

// Traces one round. `weapon` supplies the damage curve, penetration rating and
// max range; everything else that varies per pellet comes in through `opts`.
//
// Returns a summary rather than an event, because the caller (a shotgun firing
// nine of these) wants to aggregate before it decides what the *shot* did.
export function fireBullet(G, weapon, origin, dir, opts = {}) {
  const pen = weapon.pen != null ? weapon.pen : 1;
  const maxRange = Math.min(opts.range != null ? opts.range : (weapon.range || 200), MAX_TRACE);
  const team = opts.team != null ? opts.team : TEAM.PLAYER;
  const mul = opts.damageMul != null ? opts.damageMul : 1;
  const shotId = opts.shotId || 0;
  const wid = weapon.id || null;

  let energy = opts.energy != null ? opts.energy : 1;
  const o = { x: origin.x, y: origin.y, z: origin.z };
  const out = {
    dist: 0, damage: 0, hits: 0, kills: 0, headshot: false,
    penetrations: 0, stopped: 'range', end: null,
  };

  _ids.clear();
  let travelled = 0, pens = 0, guard = 0;

  while (guard++ < 8) {
    const remain = maxRange - travelled;
    if (remain <= 1e-3) { out.stopped = 'range'; break; }

    const wall = raycast(G.world, o, dir, remain, bulletFilter);
    const limit = wall ? wall.t : remain;
    const foe = rayEnemies(G, o, dir, limit, _ids, team);

    // ── flesh first, if it is nearer than the geometry ──────────────────────
    if (foe) {
      const dist = travelled + foe.t;
      const mult = HITBOX[foe.part] != null ? HITBOX[foe.part] : 1;
      const dmg = damageAtRange(weapon, dist) * mult * energy * mul;
      const point = { x: o.x + dir.x * foe.t, y: o.y + dir.y * foe.t, z: o.z + dir.z * foe.t };

      _ids.add(enemyId(foe.enemy, foe.index));
      emit(G, 'impact', {
        point, normal: foe.normal, surface: SURFACE.FLESH,
        energy, weapon: wid, shotId, dist,
        target: foe.enemy.id != null ? foe.enemy.id : foe.index,
        part: foe.part, penetrated: false, exit: false,
      });

      const dealt = damageEnemy(G, foe.enemy, dmg, {
        part: foe.part, mult, weapon: wid, dist, point, dir,
        index: foe.index, penetrated: pens > 0, source: opts.source || 'player',
      });
      out.damage += dealt;
      out.hits++;
      if (foe.part === 'HEAD') out.headshot = true;
      if (foe.enemy.alive === false && foe.enemy.diedAt === G.time.t) out.kills++;

      // Over-penetration through a body. The torso is ~30 cm of FLESH, which is
      // exactly the table's limit at rating 1 — so a carbine round just makes it
      // through a man and a pistol round just does not.
      const crossM = Math.max(foe.exit - foe.t, 0);
      const cm = Math.min(crossM * 100, 45);
      const keep = pens < MAX_PENETRATIONS ? penetrationLoss(SURFACE.FLESH, cm, pen) : 0;
      const exitT = foe.exit + EPS;

      if (keep > 0 && energy * keep >= MIN_ENERGY && travelled + exitT < maxRange) {
        energy *= keep;
        pens++; out.penetrations = pens;
        const exitPt = { x: o.x + dir.x * foe.exit, y: o.y + dir.y * foe.exit, z: o.z + dir.z * foe.exit };
        emit(G, 'impact', {
          point: exitPt, normal: { x: -foe.normal.x, y: -foe.normal.y, z: -foe.normal.z },
          surface: SURFACE.FLESH, energy, weapon: wid, shotId,
          dist: travelled + foe.exit, part: foe.part, penetrated: true, exit: true,
          target: foe.enemy.id != null ? foe.enemy.id : foe.index,
        });
        o.x += dir.x * exitT; o.y += dir.y * exitT; o.z += dir.z * exitT;
        travelled += exitT;
        continue;
      }
      out.stopped = 'flesh';
      out.end = point;
      out.dist = dist;
      break;
    }

    // ── geometry ────────────────────────────────────────────────────────────
    if (!wall) { out.stopped = 'range'; break; }

    const dist = travelled + wall.t;
    emit(G, 'impact', {
      point: wall.point, normal: wall.normal, surface: wall.surface,
      energy, weapon: wid, shotId, dist,
      penetrated: false, exit: false, tag: wall.box.tag || '',
    });
    out.end = wall.point;
    out.dist = dist;

    if (pens >= MAX_PENETRATIONS) { out.stopped = 'penlimit'; break; }

    // Path length through the slab, clamped for obliquity, then clamped again to
    // the authored thickness so an angled shot cannot claim a shortcut either.
    const pathCm = Math.max(wall.exit - wall.t, 0) * 100;
    const authored = wall.box.thickness != null ? wall.box.thickness : pathCm;
    const cm = Math.min(pathCm, authored * OBLIQUE_MAX);
    const keep = penetrationLoss(wall.surface, cm, pen);

    if (keep <= 0 || energy * keep < MIN_ENERGY) { out.stopped = 'absorbed'; break; }

    energy *= keep;
    pens++; out.penetrations = pens;
    const exitT = wall.exit + EPS;
    if (travelled + exitT >= maxRange) { out.stopped = 'range'; break; }

    const exitPt = { x: o.x + dir.x * wall.exit, y: o.y + dir.y * wall.exit, z: o.z + dir.z * wall.exit };
    emit(G, 'impact', {
      point: exitPt, normal: { x: -wall.normal.x, y: -wall.normal.y, z: -wall.normal.z },
      surface: wall.surface, energy, weapon: wid, shotId,
      dist: travelled + wall.exit, penetrated: true, exit: true, thickness: cm,
      tag: wall.box.tag || '',
    });
    o.x += dir.x * exitT; o.y += dir.y * exitT; o.z += dir.z * exitT;
    travelled += exitT;
  }

  if (out.stopped === 'range' || !out.end) {
    const rem = Math.max(maxRange - travelled, 0);
    out.end = { x: o.x + dir.x * rem, y: o.y + dir.y * rem, z: o.z + dir.z * rem };
    out.dist = maxRange;
  }

  // Incoming fire announces itself. `team` here is the *shooter's* team, so the
  // player's own rounds are excluded by identity rather than by a distance
  // fudge that would break the moment he fires past his own shoulder.
  if (team !== TEAM.PLAYER && opts.whizz !== false) {
    emitWhizz(G, origin, dir, out.dist, {
      speed: opts.speed != null ? opts.speed : (weapon.muzzle || DEFAULT_MUZZLE),
      weapon: wid, source: opts.source, team, shotId,
      radius: opts.whizzRadius,
    });
  }
  // The tracer/decal layer wants one segment per ray with a definite endpoint,
  // which the impact stream alone does not give it for a clean miss.
  emit(G, 'trace', {
    weapon: wid, shotId, pellet: opts.pellet || 0,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    dir: { x: dir.x, y: dir.y, z: dir.z },
    end: out.end, dist: out.dist, hit: out.hits > 0, stopped: out.stopped,
  });
  return out;
}
