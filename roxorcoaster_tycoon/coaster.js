// Coasters: track piece system, train physics, ratings.
// Simplified vs real RCT but captures the spirit:
//   - Pieces are placed tile-by-tile in 4 directions (N/E/S/W relative to current orientation)
//   - Each piece has entry/exit direction + height delta
//   - Train physics simulated with simple gravity + friction
//   - Excitement/Intensity/Nausea computed from simulated lap

import { tile, tileAvgHeight, isFlat } from './world.js';

let nextCoasterId = 1;

// Piece kinds and their orientation/height effects.
// dir: 0=N (ty-1), 1=E (tx+1), 2=S (ty+1), 3=W (tx-1)
export const PIECE_DEFS = {
  straight:  { name: 'Straight',    cost: 30, dh: 0,  turn: 0,  length: 1,    chain: false, brake: false },
  chain:     { name: 'Chain Lift',  cost: 35, dh: 0,  turn: 0,  length: 1,    chain: true, brake: false },
  slope_up:  { name: 'Slope Up',    cost: 35, dh: +2, turn: 0,  length: 1.2,  chain: false, brake: false },
  slope_dn:  { name: 'Slope Down',  cost: 32, dh: -2, turn: 0,  length: 1.2,  chain: false, brake: false },
  curve_l:   { name: 'Curve Left',  cost: 40, dh: 0,  turn: -1, length: 1.3,  chain: false, brake: false },
  curve_r:   { name: 'Curve Right', cost: 40, dh: 0,  turn: +1, length: 1.3,  chain: false, brake: false },
  brake:     { name: 'Brake',       cost: 50, dh: 0,  turn: 0,  length: 1,    chain: false, brake: true },
  station:   { name: 'Station',     cost: 60, dh: 0,  turn: 0,  length: 1,    chain: false, brake: false, station: true },
  loop:      { name: 'Vertical Loop', cost: 120, dh: 0, turn: 0, length: 3, chain: false, brake: false, inversion: true },
};

export const COASTER_TYPES = {
  wooden: { name: 'Wooden Coaster', color: '#a06030', allowed: ['straight','chain','slope_up','slope_dn','curve_l','curve_r','brake','station'] },
  steel:  { name: 'Steel Coaster',  color: '#cccccc', allowed: ['straight','chain','slope_up','slope_dn','curve_l','curve_r','brake','station','loop'] },
};

export function startCoaster(state, kind, tx, ty) {
  const type = COASTER_TYPES[kind];
  if (!type) return null;
  const t = tile(state.terrain, tx, ty);
  if (!t || !isFlat(t) || t.ride || t.path || t.water) return null;
  const id = nextCoasterId++;
  const co = {
    id,
    name: `${type.name} ${state.coasters.length + 1}`,
    type: kind,
    color: type.color,
    status: 'building',         // building | testing | open | closed | broken
    pieces: [],                 // {kind, tx, ty, dir, h}
    cursor: { tx, ty, dir: 1, h: t.hN }, // start facing East
    trains: [],
    queue: [],
    onboard: [],
    excitement: 0, intensity: 0, nausea: 0,
    maxSpeed: 0, maxG: 0, maxLateralG: 0, drops: 0, inversions: 0,
    length: 0, height: t.hN, minH: t.hN, maxH: t.hN,
    price: 5,
    totalCustomers: 0, totalProfit: 0,
    tested: false,
    entranceTx: null, entranceTy: null,
    exitTx: null, exitTy: null,
    reliability: 230,
    timeSinceInspection: 0,
    cycleTime: 0,
    cycleTicks: 0,
    category: 'thrill',
    operatingCost: 5,
    demolished: false,
    // first piece must be a station
    needsStation: true,
  };
  // Add initial station piece at start
  addPiece(state, co, 'station');
  state.coasters.push(co);
  return co;
}

export function addPiece(state, co, pieceKind) {
  const def = PIECE_DEFS[pieceKind];
  if (!def) return false;
  if (!COASTER_TYPES[co.type].allowed.includes(pieceKind)) return false;
  const { tx, ty, dir, h } = co.cursor;
  const t = tile(state.terrain, tx, ty);
  if (!t) return false;
  if (t.path || t.water) return false;
  if (t.ride && !co.pieces.some(p => p.tx === tx && p.ty === ty)) return false;
  // can't overlap another coaster piece (unless inversion?)
  if (co.pieces.some(p => p.tx === tx && p.ty === ty && Math.abs(p.h - h) < 2)) return false;
  // cost check
  if (state.finance.cash < def.cost) return false;
  const piece = { kind: pieceKind, tx, ty, dir, h, def };
  co.pieces.push(piece);
  // mark tile as 'ride' so paths/rides can't overlap
  if (!t.ride) t.ride = co.id;
  // apply turn to direction
  let newDir = dir;
  if (def.turn) newDir = (dir + def.turn + 4) % 4;
  // apply position delta
  let nx = tx, ny = ty;
  switch (newDir) {
    case 0: ny--; break;
    case 1: nx++; break;
    case 2: ny++; break;
    case 3: nx--; break;
  }
  const newH = h + (def.dh || 0);
  co.cursor = { tx: nx, ty: ny, dir: newDir, h: newH };
  co.minH = Math.min(co.minH, newH);
  co.maxH = Math.max(co.maxH, newH);
  co.length += def.length || 1;
  state.finance.recordTransaction('construction', -def.cost, `${co.name} piece`);
  // station completion enables full pieces
  if (pieceKind === 'station') co.needsStation = false;
  return true;
}

export function removeLastPiece(state, co) {
  if (co.pieces.length === 0) return;
  const piece = co.pieces.pop();
  const def = PIECE_DEFS[piece.kind];
  // restore cursor
  co.cursor = { tx: piece.tx, ty: piece.ty, dir: piece.dir, h: piece.h };
  // un-mark tile if no other piece uses it
  if (!co.pieces.some(p => p.tx === piece.tx && p.ty === piece.ty)) {
    const t = tile(state.terrain, piece.tx, piece.ty);
    if (t && t.ride === co.id) t.ride = null;
  }
  state.finance.recordTransaction('construction', Math.floor(def.cost * 0.5), `Removed piece`);
}

export function tryCloseCircuit(co) {
  // Circuit is complete when cursor returns to the first piece's tx/ty/dir with same h.
  if (co.pieces.length < 4) return false;
  const start = co.pieces[0];
  const c = co.cursor;
  // close if cursor is at the start tile and same height (within 1)
  if (c.tx === start.tx && c.ty === start.ty && Math.abs(c.h - start.h) <= 1) return true;
  return false;
}

export function finalizeCoaster(state, co) {
  // close the loop and compute ratings
  if (!tryCloseCircuit(co)) {
    state.notify(`${co.name}: track must form a circuit`, 'warn');
    return false;
  }
  computeCoasterStats(co);
  co.tested = true;
  co.status = 'closed';
  // place entrance/exit adjacent to station if not yet set
  autoEntranceForCoaster(state, co);
  // create one train
  co.trains = [{ pieceIdx: 0, pieceProgress: 0, velocity: 0, capacity: 8, passengers: [], waitingAtStation: 30 }];
  // cycle ticks (for finance purposes)
  co.cycleTicks = Math.max(40, co.length * 16) | 0;
  state.notify(`${co.name} ready! Excitement ${(co.excitement).toFixed(1)} Intensity ${(co.intensity).toFixed(1)}`, 'good');
  return true;
}

function autoEntranceForCoaster(state, co) {
  const station = co.pieces.find(p => p.kind === 'station');
  if (!station) return;
  // look for adjacent empty path-suitable tile
  const candidates = [];
  for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
    const ax = station.tx + d.dx, ay = station.ty + d.dy;
    const t = tile(state.terrain, ax, ay);
    if (!t || t.water || t.ride || t.path || t.scenery) continue;
    if (!isFlat(t)) continue;
    candidates.push({ tx: ax, ty: ay });
  }
  if (candidates.length > 0) {
    const ent = candidates[0];
    co.entranceTx = ent.tx; co.entranceTy = ent.ty;
    const et = tile(state.terrain, ent.tx, ent.ty);
    et.rideEntrance = co.id;
    if (candidates.length > 1) {
      const ex = candidates[1];
      co.exitTx = ex.tx; co.exitTy = ex.ty;
      tile(state.terrain, ex.tx, ex.ty).rideExit = co.id;
    } else {
      co.exitTx = ent.tx; co.exitTy = ent.ty;
    }
  }
}

function computeCoasterStats(co) {
  // simulate a lap from start station with simple physics
  // gravity in height-units / tick^2: tune so a long drop produces ~realistic speed
  const G = 0.04;
  const friction = 0.0008;
  const drag = 0.00005;
  let v = 0.5;
  let maxV = 0, maxG = 0, maxLatG = 0;
  let drops = 0, inversions = 0;
  let lastH = co.pieces[0].h;
  let descending = false;
  // run multiple laps to settle
  for (let lap = 0; lap < 3; lap++) {
    for (let i = 0; i < co.pieces.length; i++) {
      const p = co.pieces[i];
      const next = co.pieces[(i + 1) % co.pieces.length];
      const dh = next.h - p.h;
      const dxy = 1;
      const dist = Math.hypot(dxy, dh * 0.25);
      // chain lift: force velocity to chain speed
      if (p.def && p.def.chain) v = Math.max(v, 1.0);
      // gravity component
      const slope = dh / Math.max(0.1, dist);
      v -= G * slope * (p.def.length || 1);  // descending negative dh -> positive accel
      // brake
      if (p.def && p.def.brake) v = Math.min(v, 0.5);
      // friction/drag
      v -= v * v * drag + friction;
      if (v < 0.1) v = 0.1; // never reverse for simplicity
      if (v > maxV) maxV = v;
      // G-forces (simplified): centripetal on turn, vertical on slope changes
      const turn = p.def.turn || 0;
      const lat = Math.abs(turn) * v * v * 1.5;
      if (lat > maxLatG) maxLatG = lat;
      // drops
      if (dh < -1 && !descending) { descending = true; drops++; }
      if (dh >= 0) descending = false;
      // inversions
      if (p.def.inversion) inversions++;
      const vg = Math.abs(slope) * v * v * 1.2;
      if (vg > maxG) maxG = vg;
      lastH = p.h;
    }
  }
  co.maxSpeed = maxV * 12;        // arbitrary unit ~mph
  co.maxG = maxG * 3;
  co.maxLateralG = maxLatG * 3;
  co.drops = drops;
  co.inversions = inversions;

  const speed = co.maxSpeed;
  const heightDelta = co.maxH - co.minH;
  // ratings — RCT-flavored heuristics
  let excitement = 0;
  excitement += speed * 0.1;
  excitement += drops * 0.8;
  excitement += co.length * 0.05;
  excitement += inversions * 1.5;
  excitement += heightDelta * 0.3;
  // penalty for tracks that are too tame or too intense
  let intensity = 0;
  intensity += speed * 0.12;
  intensity += co.maxG * 1.2;
  intensity += co.maxLateralG * 0.8;
  intensity += inversions * 1.2;
  intensity += heightDelta * 0.2;
  if (intensity > 11) excitement -= (intensity - 11) * 0.5;
  let nausea = 0;
  nausea += co.maxLateralG * 1.0;
  nausea += inversions * 1.0;
  nausea += co.length * 0.02;
  // clamp 0..10ish
  co.excitement = Math.max(0, Math.min(15, excitement));
  co.intensity = Math.max(0, Math.min(15, intensity));
  co.nausea = Math.max(0, Math.min(15, nausea));
}

export function updateCoasters(state) {
  for (const co of state.coasters) {
    if (co.demolished) continue;
    co.timeSinceInspection++;
    if (co.status !== 'open' && co.status !== 'testing') continue;

    // operating cost
    if (state.tickCount % 40 === 0) {
      state.finance.recordTransaction('operating', -co.operatingCost, `${co.name} operating`, true);
    }
    // reliability
    if (state.tickCount % 240 === 0) co.reliability = Math.max(0, co.reliability - 1);
    if (state.tickCount % 100 === 0 && co.status === 'open') {
      const fail = Math.max(0, 255 - co.reliability) / 30000;
      if (Math.random() < fail) {
        co.status = 'broken';
        state.notify(`${co.name} has broken down!`, 'warn');
      }
    }

    // train motion
    for (const train of co.trains) {
      const piece = co.pieces[train.pieceIdx];
      if (!piece) continue;
      const def = piece.def;
      const next = co.pieces[(train.pieceIdx + 1) % co.pieces.length];
      const dh = next ? next.h - piece.h : 0;
      const dist = Math.hypot(1, dh * 0.25);
      // physics
      let v = train.velocity;
      if (def.chain) v = Math.max(v, 1.0);
      const slope = dh / Math.max(0.1, dist);
      v -= 0.04 * slope * (def.length || 1);
      if (def.brake) v = Math.min(v, 0.5);
      v -= v * v * 0.00005 + 0.0008;
      if (v < 0.1) v = 0.1;
      train.velocity = v;
      // station behavior
      if (piece.kind === 'station') {
        train.velocity = 0.5;
        if (train.waitingAtStation > 0) {
          train.waitingAtStation--;
          train.velocity = 0;
          if (train.waitingAtStation === 30 || train.waitingAtStation === 60) {
            // unload passengers
            for (const pid of train.passengers) {
              const p = state.peeps.find(x => x.id === pid);
              if (p) offboardPeepCoaster(p, co, state);
            }
            train.passengers = [];
          }
          if (train.waitingAtStation === 20) {
            // board from queue
            while (train.passengers.length < train.capacity && co.queue.length > 0) {
              const pid = co.queue.shift();
              const p = state.peeps.find(x => x.id === pid);
              if (p) {
                train.passengers.push(pid);
                loadPeepOntoCoaster(p, co, state);
              }
            }
          }
        } else if (train.passengers.length > 0 || co.queue.length > 0 && state.tickCount % 30 === 0) {
          // dispatch
          if (train.passengers.length === 0 && co.queue.length === 0) {
            train.waitingAtStation = 120;
          } else if (train.passengers.length > 0) {
            train.velocity = 0.5;
            train.pieceProgress = 1; // leave station
          }
        }
      }
      // advance
      train.pieceProgress += v / Math.max(1, def.length || 1) * 0.1;
      if (train.pieceProgress >= 1) {
        train.pieceProgress = 0;
        train.pieceIdx = (train.pieceIdx + 1) % co.pieces.length;
        // station arrival
        if (co.pieces[train.pieceIdx].kind === 'station') {
          train.waitingAtStation = 80;
        }
      }
    }
  }
}

function loadPeepOntoCoaster(p, co, state) {
  p.state = 'on-ride';
  p.currentRideId = co.id;
  p.rideTime = 0;
  if (!p.riddenRides) p.riddenRides = new Set();
  p.riddenRides.add(co.id);
  if (p.cash >= co.price) {
    p.cash -= co.price;
    p.spent += co.price;
    co.totalCustomers++;
    co.totalProfit += co.price;
    state.finance.recordTransaction('rideTicket', co.price, `${co.name} ticket`);
  }
}

function offboardPeepCoaster(p, co, state) {
  const delta = co.excitement * 0.6 - Math.abs(co.intensity - p.intensityPref) * 0.4;
  p.happiness = Math.max(0, Math.min(255, p.happiness + delta * 3));
  p.nausea = Math.min(255, p.nausea + co.nausea * 4);
  if (co.excitement >= 7) {
    p.thoughts.unshift({ text: `${co.name} was incredible!`, t: Date.now() });
    p.recentThought = `${co.name} was incredible!`;
    p.thoughtFlash = 90;
  }
  if (co.exitTx != null) {
    // try to drop peep on adjacent path tile so they can walk away
    let placed = false;
    for (const d of [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}]) {
      const n = tile(state.terrain, co.exitTx + d.dx, co.exitTy + d.dy);
      if (n && n.path) { p.x = co.exitTx + d.dx + 0.5; p.y = co.exitTy + d.dy + 0.5; placed = true; break; }
    }
    if (!placed) { p.x = co.exitTx + 0.5; p.y = co.exitTy + 0.5; }
  }
  p.state = 'walking';
  p.currentRideId = null;
  p.path = null;
}

export function demolishCoaster(state, coId) {
  const co = state.coasters.find(c => c.id === coId);
  if (!co) return;
  co.demolished = true;
  // refund half of all piece costs
  let refund = 0;
  for (const p of co.pieces) refund += (PIECE_DEFS[p.kind].cost || 0);
  state.finance.recordTransaction('construction', Math.floor(refund * 0.4), `Demolished ${co.name}`);
  for (const p of co.pieces) {
    const t = tile(state.terrain, p.tx, p.ty);
    if (t && t.ride === co.id) t.ride = null;
  }
  if (co.entranceTx != null) {
    const t = tile(state.terrain, co.entranceTx, co.entranceTy);
    if (t) t.rideEntrance = null;
  }
  if (co.exitTx != null) {
    const t = tile(state.terrain, co.exitTx, co.exitTy);
    if (t) t.rideExit = null;
  }
}
