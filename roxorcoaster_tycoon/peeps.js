// Peeps (park guests): AI, needs, thoughts, movement.
import { tile, tileAvgHeight } from './world.js';
import { findPath, pathNeighbors, nearestPath } from './paths.js';

const FIRST_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Drew', 'Sky', 'Quinn', 'Ash',
  'Pat', 'Robin', 'Lee', 'Toni', 'Rene', 'Bo', 'Dakota', 'Cameron', 'Avery', 'Jamie',
  'Chris', 'Taylor', 'Charlie', 'Frankie', 'Reese', 'Hayden', 'Sage', 'Rowan', 'Eden', 'Blair'];
const LAST_NAMES = ['Smith', 'Jones', 'Garcia', 'Brown', 'Miller', 'Davis', 'Wilson', 'Moore', 'Lee', 'White',
  'Hall', 'Allen', 'Young', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams',
  'Baker', 'Hayes', 'Reed', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Cruz', 'Patel'];
const HAT_COLORS = ['#e63a3a', '#3a7bd0', '#daa520', '#3a8a3a', '#a02fd0', null, null, null];
const SHIRT_COLORS = ['#e63a3a', '#3a7bd0', '#ffd76b', '#3a8a3a', '#a02fd0', '#e89bcd', '#6bd97c', '#f08a3a'];
const PANTS_COLORS = ['#3a2a1f', '#444c5e', '#1a2030', '#5a3a26', '#252a40'];
const BALLOON_COLORS = ['#e63a3a', '#3a7bd0', '#daa520', '#a02fd0', '#3a8a3a'];

let nextPeepId = 1;

export function spawnPeep(state, tx, ty) {
  const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const peep = {
    id: nextPeepId++,
    name: `${fn} ${ln}`,
    x: tx + 0.5, y: ty + 0.5,
    targetX: tx + 0.5, targetY: ty + 0.5,
    pathHeight: 0,
    facing: 0,
    state: 'walking',                // walking | queueing | on-ride | leaving | lost | sitting | vomiting
    happiness: 180 + Math.floor(Math.random() * 40),
    hunger: 50 + Math.floor(Math.random() * 60),
    thirst: 30 + Math.floor(Math.random() * 50),
    bathroom: 20 + Math.floor(Math.random() * 30),
    nausea: 0,
    tiredness: 20 + Math.floor(Math.random() * 30),
    energy: 230,
    cash: 30 + Math.floor(Math.random() * 100),  // $
    spent: 0,
    intensityPref: 4 + Math.floor(Math.random() * 8),  // 0..15
    nauseaTol: 50 + Math.floor(Math.random() * 200),
    stinginess: Math.random(),     // 0–1, higher = pickier on price
    hasMap: false,
    inventory: [],
    hat: HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)],
    shirtColor: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
    pantsColor: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)],
    balloon: null,
    path: null,           // array of {tx,ty}
    pathStep: 0,
    target: null,         // {kind:'ride'|'shop'|'wander'|'exit', id?}
    queueTime: 0,
    rideTime: 0,
    currentRideId: null,
    thoughts: [],         // ring of recent thoughts
    recentThought: null,
    thoughtFlash: 0,
    thoughtCounts: {},    // text -> count (for diminishing returns)
    decisionCooldown: Math.floor(Math.random() * 32),
    decayCounter: 0,
    alive: true,
    riddenRides: new Set(),
    boughtFrom: new Set(),
    timeInPark: 0,
  };
  state.peeps.push(peep);
  return peep;
}

export function updatePeeps(state) {
  // Process peeps in two phases: stat decay + decision (staggered), then movement.
  for (const p of state.peeps) {
    if (!p.alive) continue;
    p.timeInPark++;
    // stat decay roughly: hunger +1/sec, thirst +1/sec, bathroom +0.5/sec, tiredness +0.3/sec, nausea -1/sec
    p.decayCounter = (p.decayCounter + 1) | 0;
    if (p.decayCounter % 40 === 0) {
      p.hunger = Math.min(255, p.hunger + 1);
      p.thirst = Math.min(255, p.thirst + 1);
      if (p.decayCounter % 80 === 0) p.bathroom = Math.min(255, p.bathroom + 1);
      if (p.decayCounter % 120 === 0) p.tiredness = Math.min(255, p.tiredness + 1);
      if (p.nausea > 0) p.nausea = Math.max(0, p.nausea - 1);
      if (p.energy > 0) p.energy = Math.max(0, p.energy - 1);
    }
    if (p.thoughtFlash > 0) p.thoughtFlash--;
  }

  // Staggered decisions: each peep ticks decision every ~32 frames
  for (const p of state.peeps) {
    if (!p.alive) continue;
    if (p.state === 'on-ride') continue;
    if (p.state === 'queueing') continue;
    p.decisionCooldown--;
    if (p.decisionCooldown <= 0) {
      p.decisionCooldown = 32 + Math.floor(Math.random() * 32);
      decide(p, state);
    }
    // Movement
    movePeep(p, state);
  }

  // Cleanup
  for (let i = state.peeps.length - 1; i >= 0; i--) {
    const p = state.peeps[i];
    if (!p.alive) state.peeps.splice(i, 1);
  }
}

function decide(p, state) {
  // happiness adjustments
  if (p.hunger > 200) addThought(p, 'I\'m really hungry', -2);
  if (p.thirst > 200) addThought(p, 'I\'m thirsty', -2);
  if (p.bathroom > 200) addThought(p, 'I need a bathroom!', -3);
  if (p.tiredness > 230) addThought(p, 'I\'m exhausted', -2);
  if (p.nausea > 180) addThought(p, 'I feel sick', -3);

  if (p.happiness < 30 && p.state !== 'leaving') {
    addThought(p, 'This park is awful', -1);
    p.state = 'leaving';
    p.target = { kind: 'exit' };
    p.path = null;
  }

  // Random goals
  if (p.state === 'walking' && !p.path) {
    // Prioritize urgent needs
    if (p.bathroom > 180 && Math.random() < 0.95) tryTarget(p, state, 'shop', 'bathroom');
    else if (p.hunger > 170 && Math.random() < 0.85) tryTarget(p, state, 'shop', ['burger', 'icecream']);
    else if (p.thirst > 160 && Math.random() < 0.85) tryTarget(p, state, 'shop', ['drink', 'icecream']);
    else if (p.tiredness > 200 && Math.random() < 0.6) sitOnBench(p, state);
    else if (Math.random() < 0.55) tryTargetRandomRide(p, state);
    else wander(p, state);
  }

  // happiness from environment
  const t = tile(state.terrain, Math.floor(p.x), Math.floor(p.y));
  if (t) {
    if (t.litter > 120) {
      addThought(p, 'The path is dirty', -1);
    } else if (t.litter < 20 && Math.random() < 0.05) {
      addThought(p, 'The park is so clean', 1);
    }
    // scenery nearby boosts happiness
    if (Math.random() < 0.05) {
      let scenery = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = tile(state.terrain, Math.floor(p.x) + dx, Math.floor(p.y) + dy);
        if (n && n.scenery) scenery++;
      }
      if (scenery > 5) addThought(p, 'Wow, beautiful park!', 2);
    }
  }
}

function tryTarget(p, state, kind, types) {
  // find nearest shop of matching type
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  const acceptable = Array.isArray(types) ? new Set(types) : new Set([types]);
  const goalSet = new Set();
  for (const r of state.rides) {
    if (r.demolished || r.status !== 'open') continue;
    if (kind === 'shop' && r.category !== 'shop') continue;
    if (!acceptable.has(r.kind)) continue;
    // price check
    if (r.price > p.cash) continue;
    if (r.price > 10 && Math.random() < p.stinginess * 0.5) continue;
    if (r.entranceTx == null) continue;
    // approach via the path tile adjacent to entrance
    for (const adj of adjacentPathTiles(state, r.entranceTx, r.entranceTy)) {
      goalSet.add(`${adj.tx},${adj.ty}`);
    }
  }
  if (!goalSet.size) return;
  const path = findPath(state.terrain, tx, ty, goalSet);
  if (path) {
    p.path = path;
    p.pathStep = 0;
    p.target = { kind, types, rideId: null };
  }
}

function tryTargetRandomRide(p, state) {
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  // build list of open non-shop rides peep hasn't ridden recently and matches intensity tolerance
  const candidates = [];
  for (const r of [...state.rides, ...state.coasters]) {
    if (r.demolished || r.status !== 'open' || r.category === 'shop') continue;
    if (r.price > p.cash) continue;
    if (r.intensity > p.intensityPref + 4) continue; // too intense
    if (p.riddenRides.has(r.id)) continue;
    if (r.entranceTx == null) continue;
    candidates.push(r);
  }
  if (!candidates.length) return wander(p, state);
  // pick by excitement-weighted random
  candidates.sort((a, b) => b.excitement - a.excitement);
  const r = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
  const goalSet = new Set();
  for (const adj of adjacentPathTiles(state, r.entranceTx, r.entranceTy)) {
    goalSet.add(`${adj.tx},${adj.ty}`);
  }
  const path = findPath(state.terrain, tx, ty, goalSet);
  if (path) {
    p.path = path;
    p.pathStep = 0;
    p.target = { kind: 'ride', rideId: r.id };
    if (r.queue.length > 12) addThought(p, 'That\'s a long queue', -1);
  } else {
    wander(p, state);
  }
}

function wander(p, state) {
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  // pick a random reachable path tile within 12 steps
  const neighbors = pathNeighbors(state.terrain, tx, ty);
  if (!neighbors.length) {
    // Stuck on non-path tile (e.g. ride). Try to find any path tile.
    const found = nearestPath(state.terrain, tx, ty, (t) => !!t.path);
    if (found) {
      p.path = [{ tx: found.tx, ty: found.ty }];
      p.pathStep = 0;
    }
    return;
  }
  const n = neighbors[Math.floor(Math.random() * neighbors.length)];
  p.path = [{ tx: n.tx, ty: n.ty }];
  p.pathStep = 0;
  p.target = { kind: 'wander' };
}

function sitOnBench(p, state) {
  // search nearby for a bench
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const t = tile(state.terrain, Math.floor(p.x) + dx, Math.floor(p.y) + dy);
    if (t && t.scenery && t.scenery.type === 'bench') {
      // sit briefly
      p.tiredness = Math.max(0, p.tiredness - 100);
      p.energy = Math.min(255, p.energy + 80);
      addThought(p, 'That bench was nice', 1);
      return;
    }
  }
  wander(p, state);
}

function adjacentPathTiles(state, tx, ty) {
  const out = [];
  for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
    const t = tile(state.terrain, tx + d.dx, ty + d.dy);
    if (t && t.path) out.push({ tx: tx + d.dx, ty: ty + d.dy });
  }
  return out;
}

function movePeep(p, state) {
  if (!p.path || p.pathStep >= p.path.length) return;
  const step = p.path[p.pathStep];
  // walk toward step center
  const tx = step.tx + 0.5, ty = step.ty + 0.5;
  const dx = tx - p.x, dy = ty - p.y;
  const dist = Math.hypot(dx, dy);
  const speed = state.gameSpeed > 0 ? 0.04 : 0;
  if (dist < speed) {
    p.x = tx; p.y = ty;
    p.pathStep++;
    if (p.pathStep >= p.path.length) {
      onReachTarget(p, state);
    }
  } else {
    p.x += (dx / dist) * speed;
    p.y += (dy / dist) * speed;
    p.facing = Math.atan2(dy, dx);
  }
}

function onReachTarget(p, state) {
  p.path = null;
  if (!p.target) return;
  // Are we adjacent to a ride entrance?
  const t = tile(state.terrain, Math.floor(p.x), Math.floor(p.y));
  if (!t) return;
  // Check 4-neighbors for ride entrance (rides or coasters)
  for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
    const n = tile(state.terrain, Math.floor(p.x) + d.dx, Math.floor(p.y) + d.dy);
    if (!n) continue;
    if (n.rideEntrance != null) {
      const ride = state.rides.find(r => r.id === n.rideEntrance) ||
                   state.coasters.find(c => c.id === n.rideEntrance);
      if (!ride || ride.status !== 'open') continue;
      if (p.target.kind === 'ride' && p.target.rideId === ride.id) {
        ride.queue.push(p.id);
        p.state = 'queueing';
        p.currentRideId = ride.id;
        return;
      }
      if (p.target.kind === 'shop' && ride.category === 'shop') {
        purchaseFromShop(p, ride, state);
        p.state = 'walking';
        p.target = null;
        return;
      }
    }
  }
  // No ride reached — clear target
  p.state = 'walking';
  if (p.target.kind === 'exit') {
    // at edge? leave
    if (p.x < 1 || p.y < 1 || p.x > state.terrain.size - 2 || p.y > state.terrain.size - 2) {
      p.alive = false;
    }
  }
  p.target = null;
}

function purchaseFromShop(p, shop, state) {
  if (p.cash < shop.price) return;
  p.cash -= shop.price;
  p.spent += shop.price;
  shop.totalCustomers = (shop.totalCustomers || 0) + 1;
  shop.totalProfit = (shop.totalProfit || 0) + (shop.price - (shop.wholesale || 0));
  state.finance.recordTransaction('shopSale', shop.price - (shop.wholesale || 0), `${shop.name} sale`);
  p.boughtFrom.add(shop.id);
  switch (shop.kind) {
    case 'burger':
      p.hunger = Math.max(0, p.hunger - 180);
      p.thirst = Math.min(255, p.thirst + 30);
      addThought(p, 'Yum, a burger!', 2);
      break;
    case 'drink':
      p.thirst = Math.max(0, p.thirst - 180);
      addThought(p, 'Refreshing drink', 2);
      break;
    case 'icecream':
      p.hunger = Math.max(0, p.hunger - 80);
      p.thirst = Math.max(0, p.thirst - 60);
      addThought(p, 'Tasty ice cream', 3);
      break;
    case 'bathroom':
      p.bathroom = 0;
      addThought(p, 'Phew!', 2);
      break;
    case 'info':
      p.hasMap = true;
      addThought(p, 'A park map!', 1);
      break;
  }
  if (shop.price > p.cash * 2) addThought(p, `$${shop.price} for that?!`, -1);
  // small chance of litter
  if (Math.random() < 0.3 && shop.kind !== 'bathroom') {
    // peep will drop litter next decision tick
    p.dropLitterNext = true;
  }
}

function addThought(p, text, happinessDelta) {
  const count = (p.thoughtCounts[text] || 0) + 1;
  p.thoughtCounts[text] = count;
  // diminishing returns
  const factor = 1 / count;
  p.happiness = Math.max(0, Math.min(255, p.happiness + happinessDelta * factor * 4));
  p.thoughts.unshift({ text, t: Date.now() });
  if (p.thoughts.length > 5) p.thoughts.pop();
  p.recentThought = text;
  p.thoughtFlash = 90;
}

export function loadPeepOntoRide(p, ride, state) {
  p.state = 'on-ride';
  p.rideTime = 0;
  if (!p.riddenRides) p.riddenRides = new Set();
  p.riddenRides.add(ride.id);
  if (p.cash >= ride.price) {
    p.cash -= ride.price;
    p.spent += ride.price;
    ride.totalCustomers = (ride.totalCustomers || 0) + 1;
    ride.totalProfit = (ride.totalProfit || 0) + ride.price;
    state.finance.recordTransaction('rideTicket', ride.price, `${ride.name} ticket`);
  }
}

export function offboardPeep(p, ride, state) {
  // happiness based on intensity/excitement vs personality
  const excit = ride.excitement || 4;
  const intens = ride.intensity || 4;
  const naus = ride.nausea || 1;
  let delta = excit * 0.5;
  const diff = Math.abs(intens - p.intensityPref);
  delta -= diff * 0.5;
  p.nausea = Math.min(255, p.nausea + naus * 5);
  if (p.nausea > p.nauseaTol) {
    addThought(p, 'I feel really sick', -3);
  }
  p.happiness = Math.max(0, Math.min(255, p.happiness + delta * 2));
  if (excit >= 7) addThought(p, `${ride.name} was amazing!`, 3);
  else if (excit >= 4) addThought(p, `That was fun`, 1);
  else addThought(p, `That ride was boring`, -1);
  // tiredness
  p.tiredness = Math.min(255, p.tiredness + 8);
  // place at exit, then snap to nearest path tile so they can walk again
  if (ride.exitTx != null) {
    const adj = findAdjacentPath(state, ride.exitTx, ride.exitTy);
    if (adj) {
      p.x = adj.tx + 0.5;
      p.y = adj.ty + 0.5;
    } else {
      p.x = ride.exitTx + 0.5;
      p.y = ride.exitTy + 0.5;
    }
  }
  p.state = 'walking';
  p.currentRideId = null;
  p.path = null;
}

function findAdjacentPath(state, tx, ty) {
  for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
    const n = tile(state.terrain, tx + d.dx, ty + d.dy);
    if (n && n.path) return { tx: tx + d.dx, ty: ty + d.dy };
  }
  return null;
}

export function dropLitter(state) {
  // Called periodically: random eating peep drops litter on current tile.
  for (const p of state.peeps) {
    if (!p.alive || p.state !== 'walking') continue;
    if (!p.dropLitterNext) continue;
    p.dropLitterNext = false;
    const t = tile(state.terrain, Math.floor(p.x), Math.floor(p.y));
    if (t && t.path) {
      // check for nearby bin first
      let bin = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = tile(state.terrain, Math.floor(p.x) + dx, Math.floor(p.y) + dy);
        if (n && n.scenery && n.scenery.type === 'bin') { bin = true; break; }
      }
      if (!bin) t.litter = Math.min(255, t.litter + 50);
    }
  }
}
