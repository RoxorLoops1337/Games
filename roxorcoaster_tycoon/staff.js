// Staff: handymen, mechanics, entertainers.
import { tile, tileAvgHeight } from './world.js';
import { pathNeighbors, nearestPath, findPath } from './paths.js';

let nextStaffId = 1;

export const STAFF_DEFS = {
  handyman:    { name: 'Handyman',    color: '#3a8a3a', wage: 50, hireCost: 0 },
  mechanic:    { name: 'Mechanic',    color: '#3a7bd0', wage: 80, hireCost: 0 },
  entertainer: { name: 'Entertainer', color: '#e63a8a', wage: 60, hireCost: 0 },
};

export function hireStaff(state, kind, tx, ty) {
  const def = STAFF_DEFS[kind];
  if (!def) return null;
  const id = nextStaffId++;
  // place near the entrance if not specified
  if (tx == null) {
    const ent = state.parkEntrance;
    tx = ent ? ent.tx : (state.terrain.size >> 1);
    ty = ent ? ent.ty : (state.terrain.size >> 1);
  }
  const s = {
    id, kind, name: `${def.name} ${id}`,
    x: tx + 0.5, y: ty + 0.5,
    state: 'idle',
    target: null,
    path: null, pathStep: 0,
    alive: true,
    energy: 220,
  };
  state.staff.push(s);
  state.notify(`Hired ${s.name}`, 'good');
  return s;
}

export function fireStaff(state, sid) {
  const idx = state.staff.findIndex(x => x.id === sid);
  if (idx >= 0) {
    state.staff[idx].alive = false;
    state.notify(`Fired ${state.staff[idx].name}`, 'warn');
    state.staff.splice(idx, 1);
  }
}

export function updateStaff(state) {
  for (const s of state.staff) {
    if (!s.alive) continue;
    // decide
    if (state.tickCount % 30 === 0) decide(s, state);
    // move
    moveStaff(s, state);
    // act
    act(s, state);
  }
  // weekly wage
}

function decide(s, state) {
  switch (s.kind) {
    case 'handyman':
      // find nearest dirty tile
      if (s.path) return;
      const dirty = nearestPath(state.terrain, Math.floor(s.x), Math.floor(s.y),
        (t) => t.path && t.litter > 30, 500);
      if (dirty) {
        const goal = new Set([`${dirty.tx},${dirty.ty}`]);
        const path = findPath(state.terrain, Math.floor(s.x), Math.floor(s.y), goal);
        if (path) { s.path = path; s.pathStep = 0; s.target = { kind: 'clean', tx: dirty.tx, ty: dirty.ty }; }
      } else if (state.tickCount % 90 === 0) {
        // wander
        const ns = pathNeighbors(state.terrain, Math.floor(s.x), Math.floor(s.y));
        if (ns.length) {
          const n = ns[Math.floor(Math.random() * ns.length)];
          s.path = [{ tx: n.tx, ty: n.ty }];
          s.pathStep = 0;
        }
      }
      break;
    case 'mechanic':
      if (s.path) return;
      // find broken ride
      const broken = [...state.rides, ...state.coasters].find(r => !r.demolished && r.status === 'broken');
      if (broken) {
        // find adjacent path tile
        const ents = [];
        if (broken.entranceTx != null) ents.push({ tx: broken.entranceTx, ty: broken.entranceTy });
        if (ents.length) {
          const goal = new Set();
          for (const e of ents) {
            for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
              const t = tile(state.terrain, e.tx + d.dx, e.ty + d.dy);
              if (t && t.path) goal.add(`${e.tx + d.dx},${e.ty + d.dy}`);
            }
          }
          const path = findPath(state.terrain, Math.floor(s.x), Math.floor(s.y), goal);
          if (path) { s.path = path; s.pathStep = 0; s.target = { kind: 'repair', rideId: broken.id }; }
        }
      } else {
        // inspect rides periodically — find any ride with high time since inspection
        const candidate = [...state.rides, ...state.coasters].sort((a, b) => (b.timeSinceInspection || 0) - (a.timeSinceInspection || 0))[0];
        if (candidate && (candidate.timeSinceInspection || 0) > 600 && state.tickCount % 90 === 0) {
          const ents = [];
          if (candidate.entranceTx != null) ents.push({ tx: candidate.entranceTx, ty: candidate.entranceTy });
          if (ents.length) {
            const goal = new Set();
            for (const e of ents) {
              for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
                const t = tile(state.terrain, e.tx + d.dx, e.ty + d.dy);
                if (t && t.path) goal.add(`${e.tx + d.dx},${e.ty + d.dy}`);
              }
            }
            const path = findPath(state.terrain, Math.floor(s.x), Math.floor(s.y), goal);
            if (path) { s.path = path; s.pathStep = 0; s.target = { kind: 'inspect', rideId: candidate.id }; }
          }
        }
      }
      break;
    case 'entertainer':
      // walk around making nearby peeps happier
      if (s.path) return;
      const ns2 = pathNeighbors(state.terrain, Math.floor(s.x), Math.floor(s.y));
      if (ns2.length) {
        const n = ns2[Math.floor(Math.random() * ns2.length)];
        s.path = [{ tx: n.tx, ty: n.ty }];
        s.pathStep = 0;
      }
      // boost nearby peeps' happiness
      if (state.tickCount % 60 === 0) {
        for (const p of state.peeps) {
          if (!p.alive) continue;
          if (Math.hypot(p.x - s.x, p.y - s.y) < 3) {
            p.happiness = Math.min(255, p.happiness + 2);
          }
        }
      }
      break;
  }
}

function moveStaff(s, state) {
  if (!s.path || s.pathStep >= s.path.length) return;
  const step = s.path[s.pathStep];
  const tx = step.tx + 0.5, ty = step.ty + 0.5;
  const dx = tx - s.x, dy = ty - s.y;
  const dist = Math.hypot(dx, dy);
  const speed = state.gameSpeed > 0 ? 0.045 : 0;
  if (dist < speed) {
    s.x = tx; s.y = ty;
    s.pathStep++;
    if (s.pathStep >= s.path.length) { s.path = null; }
  } else {
    s.x += (dx / dist) * speed;
    s.y += (dy / dist) * speed;
  }
}

function act(s, state) {
  if (s.kind === 'handyman') {
    const t = tile(state.terrain, Math.floor(s.x), Math.floor(s.y));
    if (t && t.path) {
      if (t.litter > 0) t.litter = Math.max(0, t.litter - 3);
    }
  } else if (s.kind === 'mechanic' && s.target) {
    if (s.target.kind === 'repair') {
      const ride = state.rides.find(r => r.id === s.target.rideId) || state.coasters.find(r => r.id === s.target.rideId);
      if (ride && Math.hypot(s.x - (ride.entranceTx ?? ride.tx) - 0.5, s.y - (ride.entranceTy ?? ride.ty) - 0.5) < 2) {
        ride.status = 'open';
        ride.reliability = Math.min(255, ride.reliability + 60);
        ride.timeSinceInspection = 0;
        state.notify(`${ride.name} repaired`, 'good');
        s.target = null;
      }
    } else if (s.target.kind === 'inspect') {
      const ride = state.rides.find(r => r.id === s.target.rideId) || state.coasters.find(r => r.id === s.target.rideId);
      if (ride && Math.hypot(s.x - (ride.entranceTx ?? ride.tx) - 0.5, s.y - (ride.entranceTy ?? ride.ty) - 0.5) < 2) {
        ride.timeSinceInspection = 0;
        ride.reliability = Math.min(255, ride.reliability + 20);
        s.target = null;
      }
    }
  }
}

export function payWages(state) {
  let total = 0;
  for (const s of state.staff) {
    if (!s.alive) continue;
    total += STAFF_DEFS[s.kind].wage;
  }
  if (total > 0) {
    state.finance.recordTransaction('wages', -total, `Weekly wages`, true);
  }
}
