// Creatures: spawning rules, AI and damage. They walk with the same body physics as players.
import { W, H, SEA, DT, TICK, MOBS, I, B, BLOCKS, L_WATER } from '../shared/data.js';
import { stepBody, K_LEFT, K_RIGHT, K_JUMP, K_UP, bodiesOverlap } from '../shared/physics.js';
import { daylight } from '../shared/util.js';

const CAP = { hostile: 7, passive: 6, cave: 5, fish: 5 };

function countNear(world, x, y, pred, r = 70) {
  let c = 0;
  for (const m of world.mobs.values()) if (Math.abs(m.x - x) < r && Math.abs(m.y - y) < r && pred(MOBS[m.type])) c++;
  return c;
}

export function spawnMob(world, type, x, y) {
  const d = MOBS[type];
  const m = {
    id: world.nextEnt++, type, x, y, vx: 0, vy: 0, w: d.w, h: d.h, hp: d.hp, dir: world.rng() < 0.5 ? -1 : 1, onGround: false,
    ai: { t: 0, keys: 0, cd: 0, target: 0, jump: 0 }, hurtT: 0, age: 0,
  };
  world.mobs.set(m.id, m);
  return m;
}

function findSurfaceSpawn(world, x) {
  const s = world.terrain.surface(x);
  if (s >= SEA - 1) return null;
  if (world.solidAt(x, s - 1) || world.solidAt(x, s - 2) || world.liqAt(x, s - 1)) return null;
  return s;
}

// called once per second
export function spawnTick(world) {
  const light = daylight(world.time);
  for (const p of world.players.values()) {
    if (p.dead) continue;
    const deep = p.y > world.terrain.surface(Math.floor(p.x)) + 24;
    const side = world.rng() < 0.5 ? -1 : 1;
    const dx = 20 + world.rng() * 26;
    const x = Math.floor(p.x + side * dx);
    if (x < 8 || x > W - 8) continue;
    if (deep) {
      if (countNear(world, p.x, p.y, (d) => d.cave, 50) >= CAP.cave || world.rng() > 0.5) continue;
      const y = Math.floor(p.y + (world.rng() - 0.5) * 20);
      if (!world.fgAt(x, y) && !world.fgAt(x, y - 1) && world.solidAt(x, y + 1) && !world.liqAt(x, y)) spawnMob(world, 'skitter', x + 0.5, y + 1);
      continue;
    }
    if (light < 0.35) {
      if (countNear(world, p.x, p.y, (d) => d.night) >= CAP.hostile || world.rng() > 0.6) continue;
      const s = findSurfaceSpawn(world, x);
      if (s !== null) spawnMob(world, 'gloomling', x + 0.5, s - 0.01);
    } else {
      if (countNear(world, p.x, p.y, (d) => d.day) < CAP.passive && world.rng() < 0.35) {
        const s = findSurfaceSpawn(world, x);
        if (s !== null && [B.grass, B.snow, B.sand].includes(world.fgAt(x, s))) spawnMob(world, world.rng() < 0.55 ? 'waddler' : 'hoppit', x + 0.5, s - 0.01);
      }
    }
    // fish in the sea
    if (countNear(world, p.x, p.y, (d) => d.swim, 60) < CAP.fish && world.rng() < 0.3) {
      const s = world.terrain.surface(x);
      if (s > SEA + 4) {
        const y = SEA + 2 + Math.floor(world.rng() * (s - SEA - 3));
        if ((world.liqAt(x, y) >> 4) === L_WATER) spawnMob(world, 'fishy', x + 0.5, y + 0.5);
      }
    }
  }
}

export function damageMob(world, m, dmg, by, dir) {
  m.hp -= dmg;
  m.hurtT = 0.4;
  m.vx = dir * 6; m.vy = -6; m.onGround = false;
  m.ai.fleeT = 3; m.ai.fleeDir = dir;
  world.event('mobhit', m.x, m.y - m.h / 2, m.type === 'stonewarden' ? 1 : 0);
  if (m.hp <= 0) killMob(world, m, by);
}

export function killMob(world, m, by) {
  world.mobs.delete(m.id);
  const d = MOBS[m.type];
  for (const [name, lo, hi, ch] of d.drops) {
    if (world.rng() <= ch) world.dropItem(m.x, m.y - m.h / 2, I[name], lo + Math.floor(world.rng() * (hi - lo + 1)));
  }
  world.event('mobdie', m.x, m.y - m.h / 2, m.type === 'stonewarden' ? 1 : 0);
  if (by && by.kills !== undefined) by.kills++;
}

export function updateMob(world, m) {
  const d = MOBS[m.type];
  m.age += DT;
  m.hurtT = Math.max(0, m.hurtT - DT);
  const a = m.ai;
  a.cd = Math.max(0, a.cd - DT);
  a.t -= DT;
  // find nearest living player
  let tp = null, td = 1e9;
  for (const p of world.players.values()) {
    if (p.dead) continue;
    const dd = (p.x - m.x) ** 2 + (p.y - m.y) ** 2;
    if (dd < td) { td = dd; tp = p; }
  }
  if (!tp) { if (!d.boss) world.mobs.delete(m.id); return; }
  if (td > (d.boss ? 200 : 110) ** 2) { world.mobs.delete(m.id); return; }
  let keys = 0;
  const light = daylight(world.time);
  if (d.swim) {
    const inWater = (world.liqAt(Math.floor(m.x), Math.floor(m.y - 0.2)) >> 4) === L_WATER;
    if (!inWater) { m.vy += 30 * DT; } else {
      if (a.t <= 0) { a.t = 1 + world.rng() * 2; a.sx = (world.rng() - 0.5) * 3.6; a.sy = (world.rng() - 0.5) * 1.6; }
      m.vx += (a.sx - m.vx) * 0.1; m.vy += (a.sy - m.vy) * 0.1;
      if ((world.liqAt(Math.floor(m.x + Math.sign(m.vx) * 0.6), Math.floor(m.y - 0.2)) >> 4) !== L_WATER || world.solidAt(Math.floor(m.x + Math.sign(m.vx) * 0.6), Math.floor(m.y))) { a.sx = -a.sx; m.vx = -m.vx; }
      if (m.y < SEA + 1.2) m.vy = Math.abs(m.vy) * 0.5 + 0.4;
      m.dir = m.vx >= 0 ? 1 : -1;
    }
    m.x += m.vx * DT; m.y += m.vy * DT;
    if (world.solidAt(Math.floor(m.x), Math.floor(m.y - 0.2))) { m.x -= m.vx * DT; m.y -= m.vy * DT; m.vx = m.vy = 0; }
    return;
  }
  const hostile = d.hostile;
  const near = tp && td < (d.boss ? 36 : 18) ** 2;
  if (a.fleeT > 0) { a.fleeT -= DT; keys |= a.fleeDir > 0 ? K_RIGHT : K_LEFT; if (!hostile && m.onGround && m.hitWall) keys |= K_JUMP; }
  else if (hostile && near && !(m.type === 'gloomling' && light > 0.6)) {
    keys |= tp.x > m.x ? K_RIGHT : K_LEFT;
    if (Math.abs(tp.x - m.x) < 0.3) keys &= ~(K_LEFT | K_RIGHT);
    if ((m.hitWall || tp.y < m.y - 1.5) && m.onGround) keys |= K_JUMP;
  } else {
    // wander
    if (a.t <= 0) { a.t = 1 + world.rng() * 3; a.wd = world.rng() < 0.3 ? 0 : world.rng() < 0.5 ? -1 : 1; }
    if (a.wd) keys |= a.wd > 0 ? K_RIGHT : K_LEFT;
    if (a.wd && m.hitWall && m.onGround) keys |= K_JUMP;
  }
  if (d.hop && m.onGround && (keys & (K_LEFT | K_RIGHT)) && (m.age * 10 | 0) % 8 === 0) keys |= K_JUMP;
  // do not walk off cliffs for passive animals
  if (!hostile && m.onGround && (keys & (K_LEFT | K_RIGHT))) {
    const ax = Math.floor(m.x + (keys & K_RIGHT ? 1 : -1) * 0.8);
    if (!world.solidAt(ax, Math.floor(m.y) ) && !world.solidAt(ax, Math.floor(m.y) + 1) && !world.solidAt(ax, Math.floor(m.y) + 2)) { keys = 0; a.t = 0; a.wd = -a.wd; }
  }
  m.hitWall = false;
  stepBody(world, m, keys, { speed: d.speed, jump: d.hop ? d.hop + 6 : 13.5 });
  if (m.hitWall && m.onGround && (keys & (K_LEFT | K_RIGHT)) && !m.stepped) { /* handled by jump next tick */ }
  m.stepped = false;
  // contact damage
  if (hostile && a.cd <= 0 && tp) {
    const box = { x: m.x, y: m.y, w: m.w + 0.2, h: m.h + 0.2 };
    if (bodiesOverlap(box, tp)) {
      a.cd = 1;
      world.hurtPlayer(tp, d.dmg, d.name, Math.sign(tp.x - m.x) || 1);
    }
  }
  // the Stone Warden slams the ground: everyone standing nearby is hurt and thrown
  if (d.boss && a.cd2 !== undefined) a.cd2 -= DT; else if (d.boss) a.cd2 = 4;
  if (d.boss && a.cd2 <= 0 && m.onGround && near) {
    a.cd2 = 5;
    world.event('slam', m.x, m.y - 0.5);
    for (const p of world.players.values()) if (!p.dead && p.onGround && Math.abs(p.x - m.x) < 7 && Math.abs(p.y - m.y) < 3) world.hurtPlayer(p, d.dmg - 1, d.name, Math.sign(p.x - m.x) || 1);
  }
  // gloomlings burn in the sun
  if (m.type === 'gloomling' && light > 0.7 && world.tick_n % TICK === 0 && world.sky(Math.floor(m.x), Math.floor(m.y - 1))) {
    m.hp -= 3; m.hurtT = 0.3; world.event('mobhit', m.x, m.y - 1, 0);
    if (m.hp <= 0) { world.mobs.delete(m.id); }
  }
  const lq = world.liqAt(Math.floor(m.x), Math.floor(m.y - 0.3));
  if (lq && (lq >> 4) === 2) { m.hp -= 6 * DT * TICK / 30; if (m.hp <= 0) world.mobs.delete(m.id); }
  void H; void W; void K_UP; void BLOCKS;
}
