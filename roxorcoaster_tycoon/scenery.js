// Scenery: trees, bushes, benches, bins, lamps, fountains.
import { tile, tileAvgHeight, isFlat } from './world.js';

export const SCENERY_DEFS = {
  tree:     { name: 'Tree',     cost: 20, solid: false, onPath: false, excBonus: 0.4 },
  bush:     { name: 'Bush',     cost: 10, solid: false, onPath: false, excBonus: 0.2 },
  bench:    { name: 'Bench',    cost: 50, solid: false, onPath: true,  excBonus: 0.1 },
  bin:      { name: 'Bin',      cost: 30, solid: false, onPath: true,  excBonus: 0 },
  lamp:     { name: 'Lamp',     cost: 40, solid: false, onPath: true,  excBonus: 0.1 },
  fountain: { name: 'Fountain', cost: 200, solid: true, onPath: false, excBonus: 0.8 },
};

export function canPlaceScenery(state, kind, tx, ty) {
  const def = SCENERY_DEFS[kind];
  if (!def) return false;
  const t = tile(state.terrain, tx, ty);
  if (!t) return false;
  if (!t.owned) return false;
  if (t.water) return false;
  if (def.onPath) {
    // benches, bins, lamps go on path tiles
    if (!t.path) return false;
    if (t.scenery) return false;
  } else {
    if (t.path) return false;
    if (t.ride) return false;
    if (t.scenery) return false;
    if (!isFlat(t)) return false;
  }
  return true;
}

export function placeScenery(state, kind, tx, ty) {
  if (!canPlaceScenery(state, kind, tx, ty)) return false;
  const def = SCENERY_DEFS[kind];
  if (state.finance.cash < def.cost) return false;
  const t = tile(state.terrain, tx, ty);
  t.scenery = { type: kind, rot: 0, solid: def.solid };
  state.finance.recordTransaction('construction', -def.cost, `${def.name}`);
  return true;
}

export function removeScenery(state, tx, ty) {
  const t = tile(state.terrain, tx, ty);
  if (!t || !t.scenery) return false;
  const def = SCENERY_DEFS[t.scenery.type];
  if (def) state.finance.recordTransaction('construction', Math.floor(def.cost * 0.3), `Removed`);
  t.scenery = null;
  return true;
}

// Compute scenery bonus for a ride (sum of nearby scenery excBonus within 4 tiles).
export function sceneryBonusForRide(state, ride) {
  let bonus = 0;
  const r = 4;
  const cx = ride.tx + ride.w / 2, cy = ride.ty + ride.h / 2;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const t = tile(state.terrain, x, y);
      if (t && t.scenery && Math.hypot(x - cx, y - cy) < r) {
        const def = SCENERY_DEFS[t.scenery.type];
        if (def) bonus += def.excBonus;
      }
    }
  }
  return bonus;
}
