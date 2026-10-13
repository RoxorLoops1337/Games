// Buddies: hired helpers that follow their owner, chop, mine, farm or guard. They walk with the same body physics as
// players; routes are found with a small breadth-first search over "standing cells".
import { W, H, B, I, BLOCKS, MOBS, DT } from '../shared/data.js';
import { stepBody, K_LEFT, K_RIGHT, K_JUMP } from '../shared/physics.js';
import { damageMob } from './mobs.js';

export const JOBS = ['follow', 'chop', 'mine', 'farm', 'guard', 'stay'];
export const MAX_BUDDIES = 3;
const DUMMY = { sel: -1, inv: [], dummy: true };
const MINEABLE = new Set(['coal_ore', 'copper_ore', 'tin_ore', 'iron_ore', 'gold_ore', 'crystal', 'clay', 'gravel']);

export function spawnNpc(world, ownerName, x, y, job = 'follow') {
  const n = {
    id: world.nextEnt++, owner: ownerName, x, y, vx: 0, vy: 0, w: 0.7, h: 1.8, onGround: false, dir: 1, job,
    path: null, pi: 0, target: null, work: 0, cd: 0, think: 0, stuck: 0, lastX: x, swing: 0, hp: 40, look: lookFor(world.nextEnt),
  };
  world.npcs.set(n.id, n);
  return n;
}
function lookFor(seed) { const r = (m) => Math.floor(((Math.imul(seed, 2654435761) >>> 0) / 7 + seed * 31 * m) % 997) ; return { skin: r(1) % 6, hair: r(2) % 10, hairStyle: r(3) % 6, shirt: r(4) % 12, pants: r(5) % 8, eyes: r(6) % 5 }; }

const solid = (w, x, y) => w.solidAt(x, y);
function stand(w, x, cy) { return !solid(w, x, cy) && !solid(w, x, cy - 1) && solid(w, x, cy + 1); }

// BFS over standing cells. isGoal(x, cy) decides when to stop. Returns [[x,cy],...] or null.
export function findPath(w, sx, sy, isGoal, limit = 700) {
  const key = (x, y) => y * W + x;
  const prev = new Map([[key(sx, sy), -1]]);
  const q = [[sx, sy]];
  for (let qi = 0; qi < q.length && qi < limit; qi++) {
    const [x, y] = q[qi];
    if (isGoal(x, y)) {
      const out = [[x, y]];
      let k = prev.get(key(x, y));
      while (k !== -1 && k !== undefined) { out.push([k % W, (k / W) | 0]); k = prev.get(k); }
      return out.reverse();
    }
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (nx < 1 || nx >= W - 1) continue;
      const cand = [];
      if (stand(w, nx, y)) cand.push(y);
      else if (stand(w, nx, y - 1) && !solid(w, x, y - 2)) cand.push(y - 1);
      else if (!solid(w, nx, y) && !solid(w, nx, y - 1)) for (let k = 1; k <= 8; k++) { if (solid(w, nx, y + k - 1) && k > 1) break; if (stand(w, nx, y + k)) { cand.push(y + k); break; } }
      for (const ny of cand) { const kk = key(nx, ny); if (!prev.has(kk)) { prev.set(kk, key(x, y)); q.push([nx, ny]); } }
    }
  }
  return null;
}

export function ownerOf(world, n) {
  for (const p of world.players.values()) if (p.name.toLowerCase() === n.owner.toLowerCase()) return p;
  return null;
}
function give(world, n, owner, item, cnt) {
  if (!item) return;
  if (owner) { const left = world.addItem(owner, item, cnt); if (left) world.dropItem(n.x, n.y - 1, item, left); owner.invDirty = true; world.event('pickup', n.x, n.y - 1, item); }
  else world.dropItem(n.x, n.y - 1, item, cnt);
}

export function updateNpc(world, n) {
  const owner = ownerOf(world, n);
  n.cd = Math.max(0, n.cd - DT); n.swing = Math.max(0, n.swing - DT);
  let keys = 0;
  const cx = Math.floor(n.x), cy = Math.floor(n.y - 0.01);
  // teleport home when lost
  if (owner && !owner.dead && (Math.abs(owner.x - n.x) > 45 || Math.abs(owner.y - n.y) > 30 || n.stuck > 8) && n.job !== 'stay') {
    n.x = owner.x + (world.rng() - 0.5) * 2; n.y = owner.y; n.vx = n.vy = 0; n.path = null; n.target = null; n.stuck = 0; world.event('tp', n.x, n.y - 1);
  }
  n.think -= DT;
  if (n.think <= 0) { n.think = 0.7 + world.rng() * 0.5; if (!n.target || !n.path) choose(world, n, owner, cx, cy); }

  // follow the path
  if (n.path && n.pi < n.path.length) {
    const [px, py] = n.path[n.pi];
    const tx = px + 0.5;
    if (Math.abs(n.x - tx) < 0.28 && Math.abs((n.y - 0.01) - (py + 0.99)) < 1.2) n.pi++;
    else {
      keys |= tx > n.x ? K_RIGHT : K_LEFT;
      if (py < cy && n.onGround && Math.abs(n.x - tx) < 1.4) keys |= K_JUMP;
      if (n.hitWall && n.onGround) keys |= K_JUMP;
    }
  } else if (n.path) { n.path = null; }
  n.hitWall = false;
  stepBody(world, n, keys);
  if (n.y > H + 5) { n.y = owner ? owner.y : world.spawn.y; n.vy = 0; }
  if (keys) { n.stuck += Math.abs(n.x - n.lastX) < 0.01 ? DT : -n.stuck; } else n.stuck = Math.max(0, n.stuck - DT);
  n.lastX = n.x;

  // work when close to the target
  const t = n.target;
  if (!t) return;
  const dx = t.x + 0.5 - n.x, dy = t.y + 0.5 - (n.y - 0.9);
  if (t.kind === 'mob') {
    const m = world.mobs.get(t.id);
    if (!m) { n.target = null; n.path = null; return; }
    t.x = Math.floor(m.x); t.y = Math.floor(m.y - 0.5);
    if (Math.hypot(m.x - n.x, (m.y - 0.8) - (n.y - 0.9)) < 2.2) {
      n.dir = m.x >= n.x ? 1 : -1;
      if (n.cd <= 0) { n.cd = 0.8; n.swing = 0.25; damageMob(world, m, 4, owner, n.dir); }
    } else if (!n.path || n.pi >= n.path.length) { n.path = null; n.target = null; }
    return;
  }
  if (dx * dx + dy * dy > 2.4 * 2.4) { if (!n.path) n.target = null; return; }
  n.dir = dx >= 0 ? 1 : -1;
  const id = world.fgAt(t.x, t.y);
  const ok = (t.kind === 'chop' && id === B.log) || (t.kind === 'mine' && id && MINEABLE.has(BLOCKS[id].name)) || (t.kind === 'harvest' && id === B.wheat2) || (t.kind === 'plant' && !id);
  if (!ok) { n.target = null; n.path = null; n.work = 0; return; }
  n.work += DT; n.swing = 0.25;
  if (world.tick_n % 6 === 0 && t.kind !== 'plant') world.event('hit', t.x + 0.5, t.y + 0.5, id);
  const need = t.kind === 'chop' ? 1.6 : t.kind === 'mine' ? 2.6 : 0.6;
  if (n.work < need) return;
  n.work = 0; n.target = null; n.path = null;
  if (t.kind === 'plant') {
    const owns = owner && world.countItem(owner, I.seeds) > 0;
    const below = world.fgAt(t.x, t.y + 1);
    if (owns && (below === B.dirt || below === B.grass || below === B.farmland)) { world.takeItem(owner, I.seeds, 1); world.setTile(t.x, t.y, 0, B.wheat0); world.event('place', t.x + 0.5, t.y + 0.5, B.wheat0); }
    return;
  }
  const bd = BLOCKS[id];
  const item = t.kind === 'harvest' ? I.wheat : (bd.drop ? I[bd.drop] : I[bd.name]);
  world.setTile(t.x, t.y, 0, 0);
  world.event('break', t.x + 0.5, t.y + 0.5, id);
  const felled = t.kind === 'chop' ? world.fellAbove(t.x, t.y) : 0;
  give(world, n, owner, item, t.kind === 'harvest' ? 1 + (world.rng() < 0.4 ? 1 : 0) : 1 + felled);
  if (t.kind === 'harvest') { give(world, n, owner, I.seeds, 1); world.afterRemove(t.x, t.y); n.target = { kind: 'plant', x: t.x, y: t.y }; }
  else world.afterRemove(t.x, t.y);
}

function choose(world, n, owner, cx, cy) {
  const job = n.job;
  if (job === 'stay') return;
  const ox = owner ? Math.floor(owner.x) : cx, oy = owner ? Math.floor(owner.y - 0.01) : cy;
  const goalNear = (tx, ty, r) => (x, y) => { const ddx = x + 0.5 - (tx + 0.5), ddy = y - 0.4 - (ty + 0.5); return (x !== tx || y - 1 !== ty) && ddx * ddx + ddy * ddy <= r * r; };
  const set = (target, goal) => {
    const p = findPath(world, cx, cy, goal);
    if (p) { n.target = target; n.path = p; n.pi = 1; return true; }
    return false;
  };
  if (job === 'follow') {
    if (Math.abs(ox - cx) <= 2 && Math.abs(oy - cy) <= 2) return;
    set({ kind: 'follow', x: ox, y: oy }, (x, y) => Math.abs(x - ox) <= 2 && Math.abs(y - oy) <= 2);
    return;
  }
  // keep close to the owner when idle
  if (owner && Math.abs(ox - cx) > 22) { set({ kind: 'follow', x: ox, y: oy }, (x, y) => Math.abs(x - ox) <= 3 && Math.abs(y - oy) <= 3); return; }
  const R = 12;
  if (job === 'guard') {
    let best = null, bd = 1e9;
    for (const m of world.mobs.values()) { if (!MOBS[m.type].hostile) continue; const d = Math.hypot(m.x - ox, m.y - oy); if (d < 14 && d < bd) { bd = d; best = m; } }
    if (best) { set({ kind: 'mob', id: best.id, x: Math.floor(best.x), y: Math.floor(best.y - 0.5) }, (x, y) => Math.abs(x + 0.5 - best.x) < 1.6 && Math.abs(y - best.y) < 2); }
    else if (Math.abs(ox - cx) > 3) set({ kind: 'follow', x: ox, y: oy }, (x, y) => Math.abs(x - ox) <= 2 && Math.abs(y - oy) <= 2);
    return;
  }
  // scan for work near the owner
  let best = null, bd = 1e9;
  for (let x = ox - R; x <= ox + R; x++) for (let y = oy - 8; y <= oy + 6; y++) {
    const id = world.fgAt(x, y);
    if (!id) { continue; }
    let kind = null;
    if (job === 'chop' && id === B.log && world.fgAt(x, y + 1) !== B.log) kind = 'chop';
    else if (job === 'chop' && id === B.log) kind = 'chop';
    else if (job === 'mine' && MINEABLE.has(BLOCKS[id].name)) {
      if (world.solidAt(x - 1, y) && world.solidAt(x + 1, y) && world.solidAt(x, y - 1) && world.solidAt(x, y + 1)) continue; // buried: not reachable
      kind = 'mine';
    } else if (job === 'farm' && id === B.wheat2) kind = 'harvest';
    if (!kind) continue;
    const d = Math.abs(x - cx) + Math.abs(y - cy) * 1.5 + (kind === 'chop' ? (world.fgAt(x, y + 1) === B.log ? 4 : 0) : 0);
    if (d < bd) { bd = d; best = { kind, x, y }; }
  }
  if (!best) { if (owner && Math.abs(ox - cx) > 5) set({ kind: 'follow', x: ox, y: oy }, (x, y) => Math.abs(x - ox) <= 3 && Math.abs(y - oy) <= 3); return; }
  if (!set(best, goalNear(best.x, best.y, 2.0))) { n.think = 3; }
}

export function setJob(n, job) { if (JOBS.includes(job)) { n.job = job; n.path = null; n.target = null; n.work = 0; } }
