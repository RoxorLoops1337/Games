// Rides: flat rides + shops. Coasters live in coaster.js but share this lifecycle.
import { tile, tileAvgHeight, isFlat } from './world.js';
import { loadPeepOntoRide, offboardPeep } from './peeps.js';

let nextRideId = 1;

export const RIDE_DEFS = {
  carousel:  { name: 'Carousel',        category: 'gentle',   w: 3, h: 3, cost: 700,  cycleTicks: 360, capacity: 12, baseExc: 4, baseInt: 2, baseNaus: 1, defaultPrice: 4 },
  ferris:    { name: 'Ferris Wheel',    category: 'gentle',   w: 2, h: 2, cost: 900,  cycleTicks: 600, capacity: 16, baseExc: 5, baseInt: 1, baseNaus: 1, defaultPrice: 5 },
  swinger:   { name: 'Swinging Ship',   category: 'moderate', w: 3, h: 1, cost: 800,  cycleTicks: 300, capacity: 24, baseExc: 6, baseInt: 5, baseNaus: 4, defaultPrice: 5 },
  twist:     { name: 'Twist',           category: 'moderate', w: 3, h: 3, cost: 1100, cycleTicks: 280, capacity: 12, baseExc: 5, baseInt: 5, baseNaus: 6, defaultPrice: 5 },
  topspin:   { name: 'Top Spin',        category: 'thrill',   w: 3, h: 3, cost: 1400, cycleTicks: 240, capacity: 12, baseExc: 8, baseInt: 8, baseNaus: 8, defaultPrice: 7 },
  haunted:   { name: 'Haunted House',   category: 'gentle',   w: 3, h: 3, cost: 1000, cycleTicks: 400, capacity: 8,  baseExc: 6, baseInt: 3, baseNaus: 2, defaultPrice: 6 },
  // shops
  burger:    { name: 'Burger Bar',      category: 'shop',     w: 1, h: 1, cost: 500,  price: 6, wholesale: 2, sells: 'burger' },
  drink:     { name: 'Drink Stall',     category: 'shop',     w: 1, h: 1, cost: 400,  price: 3, wholesale: 1, sells: 'drink' },
  icecream:  { name: 'Ice Cream Stand', category: 'shop',     w: 1, h: 1, cost: 450,  price: 4, wholesale: 1, sells: 'icecream' },
  bathroom:  { name: 'Bathroom',        category: 'shop',     w: 1, h: 1, cost: 350,  price: 1, wholesale: 0, sells: 'bathroom' },
  info:      { name: 'Info Kiosk',      category: 'shop',     w: 1, h: 1, cost: 300,  price: 1, wholesale: 0, sells: 'info' },
};

export function canPlaceRide(state, kind, tx, ty) {
  const def = RIDE_DEFS[kind];
  if (!def) return false;
  // all tiles flat & no existing structure & owned
  for (let yy = 0; yy < def.h; yy++) for (let xx = 0; xx < def.w; xx++) {
    const t = tile(state.terrain, tx + xx, ty + yy);
    if (!t) return false;
    if (!t.owned) return false;
    if (t.water) return false;
    if (!isFlat(t)) return false;
    if (t.path) return false;
    if (t.ride) return false;
    if (t.scenery) return false;
  }
  // all tiles same height
  const t0 = tile(state.terrain, tx, ty);
  const h = t0.hN;
  for (let yy = 0; yy < def.h; yy++) for (let xx = 0; xx < def.w; xx++) {
    const t = tile(state.terrain, tx + xx, ty + yy);
    if (t.hN !== h) return false;
  }
  return true;
}

export function placeRide(state, kind, tx, ty) {
  if (!canPlaceRide(state, kind, tx, ty)) return null;
  const def = RIDE_DEFS[kind];
  if (state.finance.cash < def.cost) return null;
  const id = nextRideId++;
  const ride = {
    id, kind, name: makeName(state, def),
    category: def.category,
    tx, ty, w: def.w, h: def.h,
    // shops are open immediately; flat rides auto-open (no test needed).
    // coasters are 'closed' initially via the coaster builder.
    status: 'open',
    tested: true,
    excitement: def.baseExc || 0,
    intensity: def.baseInt || 0,
    nausea: def.baseNaus || 0,
    cycleTicks: def.cycleTicks || 0,
    capacity: def.capacity || 0,
    price: def.defaultPrice || def.price || 0,
    wholesale: def.wholesale || 0,
    queue: [],
    onboard: [],
    cycleTime: 0,
    loading: false,
    boarding: 0,
    totalCustomers: 0,
    totalProfit: 0,
    reliability: 220,
    timeSinceInspection: 0,
    timeSinceTest: 0,
    breakdownAt: -1,
    entranceTx: null, entranceTy: null,
    exitTx: null, exitTy: null,
    needsEntrance: true,
    operatingCost: def.category === 'shop' ? 1 : 3,
  };
  // mark footprint
  for (let yy = 0; yy < def.h; yy++) for (let xx = 0; xx < def.w; xx++) {
    const t = tile(state.terrain, tx + xx, ty + yy);
    t.ride = id;
  }
  // auto-place entrance: pick first adjacent path-suitable tile
  autoEntranceExit(state, ride);
  state.rides.push(ride);
  state.finance.recordTransaction('construction', -def.cost, `Built ${ride.name}`);
  state.notify(`Built ${ride.name}`, 'good');
  return ride;
}

function autoEntranceExit(state, ride) {
  // For shops: single entrance/exit at first adjacent path or open tile.
  // For flat rides: entrance + exit on opposite sides if possible.
  // Prefer tiles that already have a path tile adjacent to them so peeps
  // can actually reach the ride.
  const candidates = [];
  const baseH = tile(state.terrain, ride.tx, ride.ty).hN;
  for (let yy = -1; yy <= ride.h; yy++) for (let xx = -1; xx <= ride.w; xx++) {
    // skip footprint interior
    if (xx >= 0 && xx < ride.w && yy >= 0 && yy < ride.h) continue;
    // skip strict corners
    const isCorner = (xx < 0 || xx >= ride.w) && (yy < 0 || yy >= ride.h);
    if (isCorner) continue;
    const ax = ride.tx + xx, ay = ride.ty + yy;
    const t = tile(state.terrain, ax, ay);
    if (!t) continue;
    if (t.water || t.ride || t.scenery || t.path) continue;
    if (!t.owned) continue;
    if (!isFlat(t)) continue;
    if (t.hN !== baseH) continue;
    // score: 1 if adjacent to existing path, else 0
    let score = 0;
    for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
      const n = tile(state.terrain, ax + d.dx, ay + d.dy);
      if (n && n.path) { score = 2; break; }
    }
    candidates.push({ tx: ax, ty: ay, score });
  }
  // Highest score first; ties broken by order found.
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length) {
    const ent = candidates.shift();
    ride.entranceTx = ent.tx; ride.entranceTy = ent.ty;
    const et = tile(state.terrain, ent.tx, ent.ty);
    et.rideEntrance = ride.id;
    if (ride.category !== 'shop' && candidates.length) {
      // exit prefers the farthest path-adjacent tile
      candidates.sort((a, b) => {
        const sa = a.score - Math.hypot(a.tx - ent.tx, a.ty - ent.ty) * 0.01;
        const sb = b.score - Math.hypot(b.tx - ent.tx, b.ty - ent.ty) * 0.01;
        return sb - sa;
      });
      const ex = candidates[0];
      ride.exitTx = ex.tx; ride.exitTy = ex.ty;
      const xt = tile(state.terrain, ex.tx, ex.ty);
      xt.rideExit = ride.id;
    } else {
      ride.exitTx = ent.tx; ride.exitTy = ent.ty;
    }
  }
}

function makeName(state, def) {
  // dedup numbering
  let n = 1;
  while (state.rides.some(r => r.name === `${def.name} ${n}`)) n++;
  return `${def.name} ${n}`;
}

export function demolishRide(state, rideId) {
  const r = state.rides.find(x => x.id === rideId);
  if (!r) return;
  r.demolished = true;
  // refund 50%
  const def = RIDE_DEFS[r.kind];
  state.finance.recordTransaction('construction', Math.floor(def.cost * 0.5), `Demolished ${r.name}`);
  // clear tiles
  for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
    const t = tile(state.terrain, r.tx + xx, r.ty + yy);
    if (t) t.ride = null;
  }
  if (r.entranceTx != null) {
    const t = tile(state.terrain, r.entranceTx, r.entranceTy);
    if (t) t.rideEntrance = null;
  }
  if (r.exitTx != null) {
    const t = tile(state.terrain, r.exitTx, r.exitTy);
    if (t) t.rideExit = null;
  }
  // peeps on/queueing become walking again
  for (const p of state.peeps) {
    if (p.currentRideId === r.id) {
      p.state = 'walking';
      p.currentRideId = null;
      p.path = null;
      if (r.entranceTx != null) { p.x = r.entranceTx + 0.5; p.y = r.entranceTy + 0.5; }
    }
  }
}

export function openRide(ride) {
  if (ride.category === 'shop') { ride.status = 'open'; return; }
  if (!ride.tested) { ride.status = 'testing'; return; }
  ride.status = 'open';
}

export function closeRide(ride) {
  ride.status = 'closed';
}

export function testRide(ride) {
  ride.tested = true;
  ride.timeSinceTest = 0;
}

export function updateRides(state) {
  for (const ride of state.rides) {
    if (ride.demolished) continue;
    ride.timeSinceInspection++;
    ride.timeSinceTest++;
    // operating costs
    if (ride.status === 'open' || ride.status === 'testing') {
      if (state.tickCount % 40 === 0) {
        state.finance.recordTransaction('operating', -ride.operatingCost, `${ride.name} operating`, true);
      }
      // reliability decay
      if (state.tickCount % 200 === 0) ride.reliability = Math.max(0, ride.reliability - 1);
      // breakdown chance
      if (ride.category !== 'shop' && ride.status === 'open' && state.tickCount % 80 === 0) {
        const failChance = Math.max(0, (255 - ride.reliability)) / 25000;
        if (Math.random() < failChance) {
          ride.status = 'broken';
          state.notify(`${ride.name} has broken down!`, 'warn');
        }
      }
    }
    // ride cycle
    if (ride.category === 'shop') continue;
    if (ride.status !== 'open') continue;
    if (ride.cycleTime <= 0) {
      // not running — try to load
      if (ride.queue.length > 0 && ride.onboard.length < ride.capacity) {
        // load one peep per tick from queue head
        const pid = ride.queue.shift();
        const p = state.peeps.find(x => x.id === pid);
        if (p) {
          ride.onboard.push(pid);
          loadPeepOntoRide(p, ride, state);
        }
      } else if (ride.onboard.length > 0) {
        // start cycle
        ride.cycleTime = ride.cycleTicks;
      } else {
        // empty + no queue, idle
      }
    } else {
      ride.cycleTime--;
      // ride peeps' rideTime advances
      if (ride.cycleTime === 0) {
        // offboard all
        for (const pid of ride.onboard) {
          const p = state.peeps.find(x => x.id === pid);
          if (p) offboardPeep(p, ride, state);
        }
        ride.onboard = [];
      }
    }
  }
}

export function inspectRide(ride) {
  ride.timeSinceInspection = 0;
}

export function repairRide(ride) {
  ride.status = 'closed';
  ride.reliability = Math.min(255, ride.reliability + 60);
  // need to re-test? for now no, just reopen
  ride.status = 'open';
}
