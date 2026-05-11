// Save / load via localStorage. JSON for simplicity (per-save ~few hundred KB at most).

const SAVE_KEY = 'roxor-coaster-tycoon:save:v1';

export function saveGame(state, slot = 'main') {
  const data = serializeState(state);
  const key = `${SAVE_KEY}:${slot}`;
  try {
    localStorage.setItem(key, JSON.stringify(data));
    state.notify('Game saved', 'good');
    return true;
  } catch (e) {
    state.notify('Save failed: ' + e.message, 'bad');
    return false;
  }
}

export function loadGame(slot = 'main') {
  const key = `${SAVE_KEY}:${slot}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export function hasSave(slot = 'main') {
  return !!localStorage.getItem(`${SAVE_KEY}:${slot}`);
}

function serializeState(state) {
  return {
    version: 1,
    saved: Date.now(),
    parkName: state.parkName,
    scenario: state.scenario,
    time: state.time,
    parkRating: state.parkRating,
    parkRatingHistory: state.parkRatingHistory,
    monthsOfNegativeCash: state.monthsOfNegativeCash,
    gameSpeed: state.gameSpeed,
    parkEntrance: state.parkEntrance,
    cam: { x: state.cam.x, y: state.cam.y, zoom: state.cam.zoom, rotation: state.cam.rotation, mapSize: state.cam.mapSize },
    terrain: serializeTerrain(state.terrain),
    rides: state.rides.map(serializeRide),
    coasters: state.coasters.map(serializeCoaster),
    peeps: state.peeps.map(serializePeep),
    staff: state.staff.map(serializeStaff),
    finance: {
      cash: state.finance.cash,
      loan: state.finance.loan,
      loanLimit: state.finance.loanLimit,
      transactions: state.finance.transactions.slice(-200),
      monthly: state.finance.monthly,
      parkAdmission: state.finance.parkAdmission,
      rideAdmission: state.finance.rideAdmission,
    },
    research: {
      unlocked: [...state.research.unlocked],
      progress: state.research.progress,
      budget: state.research.budget,
      category: state.research.category,
    },
    nextIds: { peep: state.nextPeepId, ride: state.nextRideId, coaster: state.nextCoasterId, staff: state.nextStaffId },
  };
}

function serializeTerrain(terrain) {
  // pack tile fields into a compact representation
  const tiles = new Array(terrain.tiles.length);
  for (let i = 0; i < terrain.tiles.length; i++) {
    const t = terrain.tiles[i];
    tiles[i] = [
      t.hN, t.hE, t.hS, t.hW, t.surface, t.water, t.owned ? 1 : 0, t.litter | 0,
      t.path ? [t.path.type === 'queue' ? 1 : 0, t.path.height] : 0,
      t.scenery ? t.scenery.type : 0,
      t.ride || 0,
      t.rideEntrance || 0,
      t.rideExit || 0,
    ];
  }
  return { size: terrain.size, tiles };
}

function serializeRide(r) {
  return {
    id: r.id, kind: r.kind, name: r.name, category: r.category,
    tx: r.tx, ty: r.ty, w: r.w, h: r.h, status: r.status,
    excitement: r.excitement, intensity: r.intensity, nausea: r.nausea,
    price: r.price, queue: r.queue, onboard: r.onboard, cycleTime: r.cycleTime,
    totalCustomers: r.totalCustomers, totalProfit: r.totalProfit,
    reliability: r.reliability, timeSinceInspection: r.timeSinceInspection,
    entranceTx: r.entranceTx, entranceTy: r.entranceTy, exitTx: r.exitTx, exitTy: r.exitTy,
    tested: r.tested, demolished: r.demolished, cycleTicks: r.cycleTicks, capacity: r.capacity,
    wholesale: r.wholesale, operatingCost: r.operatingCost,
  };
}

function serializeCoaster(c) {
  return {
    id: c.id, name: c.name, type: c.type, color: c.color, status: c.status,
    pieces: c.pieces.map(p => ({ kind: p.kind, tx: p.tx, ty: p.ty, dir: p.dir, h: p.h })),
    cursor: c.cursor,
    trains: c.trains.map(t => ({ pieceIdx: t.pieceIdx, pieceProgress: t.pieceProgress, velocity: t.velocity, capacity: t.capacity, passengers: t.passengers, waitingAtStation: t.waitingAtStation })),
    queue: c.queue, onboard: c.onboard,
    excitement: c.excitement, intensity: c.intensity, nausea: c.nausea,
    maxSpeed: c.maxSpeed, maxG: c.maxG, maxLateralG: c.maxLateralG,
    drops: c.drops, inversions: c.inversions, length: c.length,
    price: c.price, totalCustomers: c.totalCustomers, totalProfit: c.totalProfit,
    tested: c.tested, entranceTx: c.entranceTx, entranceTy: c.entranceTy,
    exitTx: c.exitTx, exitTy: c.exitTy, reliability: c.reliability,
    timeSinceInspection: c.timeSinceInspection, demolished: c.demolished,
    minH: c.minH, maxH: c.maxH, needsStation: c.needsStation, category: c.category,
  };
}

function serializePeep(p) {
  return {
    id: p.id, name: p.name, x: p.x, y: p.y, state: p.state,
    happiness: p.happiness, hunger: p.hunger, thirst: p.thirst, bathroom: p.bathroom,
    nausea: p.nausea, tiredness: p.tiredness, energy: p.energy,
    cash: p.cash, spent: p.spent,
    intensityPref: p.intensityPref, nauseaTol: p.nauseaTol, stinginess: p.stinginess,
    hat: p.hat, shirtColor: p.shirtColor, pantsColor: p.pantsColor, balloon: p.balloon,
    target: p.target, currentRideId: p.currentRideId,
    riddenRides: p.riddenRides ? [...p.riddenRides] : [],
    timeInPark: p.timeInPark,
    recentThought: p.recentThought,
  };
}

function serializeStaff(s) {
  return { id: s.id, kind: s.kind, name: s.name, x: s.x, y: s.y };
}

export function deserializeTerrain(serialized) {
  const size = serialized.size;
  const tiles = new Array(size * size);
  for (let i = 0; i < tiles.length; i++) {
    const r = serialized.tiles[i];
    tiles[i] = {
      hN: r[0], hE: r[1], hS: r[2], hW: r[3],
      surface: r[4], water: r[5], owned: !!r[6], litter: r[7],
      path: r[8] ? { type: r[8][0] ? 'queue' : 'foot', height: r[8][1] } : null,
      scenery: r[9] ? { type: r[9], rot: 0, solid: false } : null,
      ride: r[10] || null,
      rideEntrance: r[11] || null,
      rideExit: r[12] || null,
      mowed: 200, watered: 200,
    };
  }
  return { size, tiles };
}
