// Main entry: state, game loop, input handling, UI wiring.

import {
  makeTerrain, generateTerrain, tile, tileAvgHeight, levelTile, raiseTile, SURFACE, findEdgeEntrance,
  TILE_W, TILE_H, HEIGHT_UNIT,
} from './world.js';
import { initRenderer, renderWorld, pickTile, resize } from './render.js';
import { placePath, removePath, PATH_FOOT, PATH_QUEUE } from './paths.js';
import { spawnPeep, updatePeeps, dropLitter } from './peeps.js';
import { RIDE_DEFS, placeRide, canPlaceRide, demolishRide, updateRides } from './rides.js';
import {
  COASTER_TYPES, PIECE_DEFS, startCoaster, addPiece, removeLastPiece, tryCloseCircuit,
  finalizeCoaster, updateCoasters, demolishCoaster,
} from './coaster.js';
import { hireStaff, fireStaff, updateStaff, payWages, STAFF_DEFS } from './staff.js';
import { SCENERY_DEFS, placeScenery, removeScenery, sceneryBonusForRide } from './scenery.js';
import { makeFinance } from './finance.js';
import { SCENARIOS, makeResearch, evaluateObjective } from './scenarios.js';
import {
  notify, openWindow, rideListWindow, rideDetailWindow, peepDetailWindow,
  financeWindow, parkInfoWindow, researchWindow, staffWindow, coasterBuilderWindow, gameOverWindow,
} from './ui.js';
import { saveGame, loadGame, hasSave, deserializeTerrain } from './save.js';

const canvas = document.getElementById('game');
initRenderer(canvas);

const state = {
  terrain: null,
  cam: { x: 0, y: 0, zoom: 1, rotation: 0, mapSize: 64 },
  rides: [],
  coasters: [],
  peeps: [],
  staff: [],
  finance: null,
  research: null,
  parkName: 'My Park',
  parkRating: 500,
  parkRatingHistory: [],
  scenario: null,
  time: { tick: 0, month: 0, year: 0 },
  monthsOfNegativeCash: 0,
  gameSpeed: 1,
  tickCount: 0,
  parkEntrance: null,
  ui: {
    tool: null,
    subTool: null,
    hoverTile: null,
    ghost: null,
    selectedPeepId: null,
    selectedRideId: null,
    coasterBuilding: null,
    showDebug: false,
  },
  openWindows: 0,
  nextPeepId: 1, nextRideId: 1, nextCoasterId: 1, nextStaffId: 1,
  notify(text, kind) { notify(this, text, kind); },
  time2: 0,
  _demolishCallback: null,
  _addCoasterPiece: null,
  _undoCoasterPiece: null,
  _finishCoaster: null,
  _cancelCoaster: null,
  _fireStaff: null,
};

// ----- Wire callbacks --------
state._demolishCallback = (ride) => {
  if (ride.pieces) demolishCoaster(state, ride.id);
  else demolishRide(state, ride.id);
};
state._addCoasterPiece = (co, kind) => {
  if (!addPiece(state, co, kind)) {
    notify(state, 'Cannot place piece (invalid spot or insufficient funds)', 'warn');
  }
};
state._undoCoasterPiece = (co) => removeLastPiece(state, co);
state._finishCoaster = (co) => {
  if (finalizeCoaster(state, co)) {
    state.ui.coasterBuilding = null;
    document.querySelectorAll('.win').forEach(w => {
      if (w.querySelector('.titlebar span')?.textContent?.includes(co.name)) w.remove();
    });
  }
};
state._cancelCoaster = (co) => {
  demolishCoaster(state, co.id);
  state.ui.coasterBuilding = null;
  document.querySelectorAll('.win').forEach(w => {
    if (w.querySelector('.titlebar span')?.textContent?.includes(co.name)) w.remove();
  });
};
state._fireStaff = (sid) => fireStaff(state, sid);

// ----- Scenario list --------
const scenarioListEl = document.getElementById('scenario-list');
for (const sc of SCENARIOS) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>${sc.name}</h3>
    <div class="diff ${sc.diff === 'medium' ? 'med' : sc.diff === 'hard' ? 'hard' : ''}">${sc.diff}</div>
    <p>${sc.description}</p>
  `;
  card.onclick = () => startScenario(sc);
  scenarioListEl.appendChild(card);
}
const loadBtn = document.getElementById('load-game-btn');
loadBtn.onclick = () => {
  if (!hasSave()) { notify(state, 'No saved game found', 'warn'); return; }
  const data = loadGame();
  if (!data) { notify(state, 'Save corrupt', 'bad'); return; }
  hydrateFromSave(data);
  document.getElementById('title-screen').style.display = 'none';
};
loadBtn.style.display = hasSave() ? 'inline-block' : 'none';

function startScenario(sc) {
  state.scenario = sc;
  state.parkName = sc.parkName;
  state.terrain = makeTerrain(64);
  state.cam.mapSize = state.terrain.size;
  generateTerrain(state.terrain, sc.seed);
  state.finance = makeFinance(sc.startCash, sc.startLoan, sc.loanLimit);
  state.finance.parkAdmission = sc.parkAdmission;
  state.finance.rideAdmission = sc.rideAdmission;
  state.research = makeResearch(sc.initialUnlocks);
  state.peeps = [];
  state.staff = [];
  state.rides = [];
  state.coasters = [];
  state.parkRating = 500;
  state.time = { tick: 0, month: 0, year: 0 };
  state.monthsOfNegativeCash = 0;
  state.parkEntrance = findEdgeEntrance(state.terrain);
  // place a flat patch around entrance and a small starter path
  const e = state.parkEntrance;
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    const t = tile(state.terrain, e.tx + x, e.ty + y);
    if (t) levelTile(state.terrain, e.tx + x, e.ty + y, 2);
  }
  for (let i = 0; i < 6; i++) placePath(state.terrain, e.tx, e.ty - i, PATH_FOOT);
  // center cam on entrance
  state.cam.x = -window.innerWidth / 2 + (e.tx - e.ty) * (TILE_W / 2);
  state.cam.y = -window.innerHeight / 2 + (e.tx + e.ty) * (TILE_H / 2);
  document.getElementById('title-screen').style.display = 'none';
  notify(state, `Welcome to ${state.parkName}!`, 'good');
  setTimeout(() => notify(state, 'Click "Footpath" then click on map to lay paths', 'info'), 1500);
  setTimeout(() => notify(state, 'Then "Rides" → Carousel to place your first ride', 'info'), 4500);
  setTimeout(() => notify(state, 'Build paths to connect your rides — peeps will queue up!', 'info'), 7500);
}

function hydrateFromSave(data) {
  state.parkName = data.parkName;
  state.scenario = data.scenario;
  state.time = data.time;
  state.parkRating = data.parkRating;
  state.parkRatingHistory = data.parkRatingHistory || [];
  state.monthsOfNegativeCash = data.monthsOfNegativeCash || 0;
  state.gameSpeed = data.gameSpeed;
  state.parkEntrance = data.parkEntrance;
  state.cam = { ...data.cam };
  state.terrain = deserializeTerrain(data.terrain);
  state.rides = data.rides.map(r => ({ ...r, queue: r.queue || [], onboard: r.onboard || [] }));
  state.coasters = data.coasters.map(c => {
    return {
      ...c,
      pieces: c.pieces.map(p => ({ ...p, def: PIECE_DEFS[p.kind] })),
      trains: c.trains || [],
      queue: c.queue || [],
      onboard: c.onboard || [],
    };
  });
  state.peeps = data.peeps.map(p => ({
    ...p,
    riddenRides: new Set(p.riddenRides || []),
    boughtFrom: new Set(),
    thoughts: [],
    thoughtCounts: {},
    path: null,
    target: null,
    alive: true,
    decisionCooldown: Math.floor(Math.random() * 32),
    decayCounter: 0,
    thoughtFlash: 0,
  }));
  state.staff = data.staff.map(s => ({ ...s, alive: true, path: null, pathStep: 0, target: null }));
  state.finance = makeFinance(data.finance.cash, data.finance.loan, data.finance.loanLimit);
  state.finance.transactions = data.finance.transactions || [];
  state.finance.monthly = data.finance.monthly || [];
  state.finance.parkAdmission = data.finance.parkAdmission;
  state.finance.rideAdmission = data.finance.rideAdmission;
  state.research = makeResearch(data.research.unlocked);
  state.research.progress = data.research.progress;
  state.research.budget = data.research.budget;
  state.research.category = data.research.category;
  state.nextPeepId = data.nextIds.peep;
  state.nextRideId = data.nextIds.ride;
  state.nextCoasterId = data.nextIds.coaster;
  state.nextStaffId = data.nextIds.staff;
  notify(state, 'Game loaded', 'good');
}

// ----- Camera & input --------
const keys = new Set();
document.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') { state.ui.tool = null; state.ui.subTool = null; state.ui.ghost = null; updateToolbarUI(); }
  if (e.key === 'F3') { state.ui.showDebug = !state.ui.showDebug; document.getElementById('debug').classList.toggle('show', state.ui.showDebug); document.getElementById('help').classList.toggle('hide', state.ui.showDebug); }
  if (e.key === ' ') { state.gameSpeed = state.gameSpeed === 0 ? 1 : 0; updateSpeedUI(); e.preventDefault(); }
  if (e.key === 'q' || e.key === 'Q') state.cam.rotation = (state.cam.rotation + 3) & 3;
  if (e.key === 'e' || e.key === 'E') state.cam.rotation = (state.cam.rotation + 1) & 3;
  // sub-tool num shortcuts
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomLevels = [0.5, 0.75, 1, 1.5, 2];
  let idx = zoomLevels.indexOf(state.cam.zoom);
  if (idx < 0) idx = 2;
  idx += e.deltaY > 0 ? -1 : 1;
  idx = Math.max(0, Math.min(zoomLevels.length - 1, idx));
  // zoom around mouse
  const mx = e.clientX, my = e.clientY;
  const oldZ = state.cam.zoom;
  state.cam.zoom = zoomLevels[idx];
  // adjust cam so the point under mouse stays put
  const k = state.cam.zoom / oldZ;
  state.cam.x = (state.cam.x + mx) * k - mx;
  state.cam.y = (state.cam.y + my) * k - my;
}, { passive: false });

let dragging = false, dragX = 0, dragY = 0, dragMode = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 1 || (e.button === 0 && state.ui.tool == null)) {
    dragging = true;
    dragMode = 'pan';
    dragX = e.clientX; dragY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  } else if (e.button === 0) {
    handleClick(e);
    dragging = true;
    dragMode = 'paint';
    canvas.setPointerCapture(e.pointerId);
  } else if (e.button === 2) {
    // right-click cancels tool
    state.ui.tool = null; state.ui.subTool = null; state.ui.ghost = null;
    updateToolbarUI();
  }
});
canvas.addEventListener('pointermove', (e) => {
  // update hover tile
  const sx = e.clientX, sy = e.clientY;
  const t = pickTile(sx, sy, state);
  state.ui.hoverTile = t ? { tx: t.tx, ty: t.ty } : null;
  updateGhost();
  // panning
  if (dragging && dragMode === 'pan') {
    state.cam.x -= e.clientX - dragX;
    state.cam.y -= e.clientY - dragY;
    dragX = e.clientX; dragY = e.clientY;
  } else if (dragging && dragMode === 'paint' && state.ui.tool === 'terrain') {
    handlePaint(e);
  } else if (dragging && dragMode === 'paint' && (state.ui.tool === 'path' || state.ui.tool === 'queue')) {
    handlePaint(e);
  }
});
canvas.addEventListener('pointerup', () => { dragging = false; dragMode = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function handleClick(e) {
  if (!state.terrain) return;
  const t = state.ui.hoverTile;
  if (!t) return;
  const ttile = tile(state.terrain, t.tx, t.ty);
  if (!ttile) return;
  if (state.ui.tool === 'terrain') handleTerrainClick(t.tx, t.ty);
  else if (state.ui.tool === 'path') tryPlacePath(t.tx, t.ty, PATH_FOOT);
  else if (state.ui.tool === 'queue') tryPlacePath(t.tx, t.ty, PATH_QUEUE);
  else if (state.ui.tool === 'ride') tryPlaceRide(t.tx, t.ty);
  else if (state.ui.tool === 'shop') tryPlaceRide(t.tx, t.ty);
  else if (state.ui.tool === 'scenery') tryPlaceScenery(t.tx, t.ty);
  else if (state.ui.tool === 'coaster') handleCoasterClick(t.tx, t.ty);
  else if (state.ui.tool === 'demolish') handleDemolishClick(t.tx, t.ty);
  else if (state.ui.tool === 'staff') tryHireStaff(t.tx, t.ty);
  else {
    // selection
    const peep = state.peeps.find(p => p.alive && Math.floor(p.x) === t.tx && Math.floor(p.y) === t.ty);
    if (peep) { state.ui.selectedPeepId = peep.id; peepDetailWindow(state, peep); return; }
    if (ttile.ride) {
      const r = state.rides.find(rd => rd.id === ttile.ride) || state.coasters.find(c => c.id === ttile.ride);
      if (r) rideDetailWindow(state, r);
    }
  }
}

function handlePaint(e) {
  const t = state.ui.hoverTile;
  if (!t) return;
  if (state.ui.tool === 'terrain') handleTerrainClick(t.tx, t.ty);
  else if (state.ui.tool === 'path') tryPlacePath(t.tx, t.ty, PATH_FOOT);
  else if (state.ui.tool === 'queue') tryPlacePath(t.tx, t.ty, PATH_QUEUE);
  else if (state.ui.tool === 'demolish') handleDemolishClick(t.tx, t.ty);
}

function handleTerrainClick(tx, ty) {
  const t = tile(state.terrain, tx, ty);
  if (!t) return;
  if (t.ride || t.path || t.scenery) return;
  switch (state.ui.subTool) {
    case 'raise':
      if (state.finance.cash >= 5) {
        raiseTile(state.terrain, tx, ty, 1);
        state.finance.recordTransaction('construction', -5, 'Raise');
      }
      break;
    case 'lower':
      if (state.finance.cash >= 5) {
        raiseTile(state.terrain, tx, ty, -1);
        state.finance.recordTransaction('construction', -5, 'Lower');
      }
      break;
    case 'level': {
      const h = Math.round(tileAvgHeight(t));
      levelTile(state.terrain, tx, ty, h);
      break;
    }
    case 'grass': t.surface = SURFACE.GRASS; break;
    case 'sand': t.surface = SURFACE.SAND; break;
    case 'dirt': t.surface = SURFACE.DIRT; break;
    case 'water':
      if (!t.water) { t.water = Math.max(2, Math.round(tileAvgHeight(t))); }
      else t.water = 0;
      break;
  }
}

function tryPlacePath(tx, ty, type) {
  if (state.finance.cash < 10) { notify(state, 'Not enough cash', 'warn'); return; }
  const t = tile(state.terrain, tx, ty);
  if (!t) return;
  if (t.path) return; // already
  if (placePath(state.terrain, tx, ty, type)) {
    state.finance.recordTransaction('construction', -10, 'Path');
  }
}

function tryPlaceRide(tx, ty) {
  const kind = state.ui.subTool;
  if (!kind) return;
  const def = RIDE_DEFS[kind];
  if (!def) return;
  if (canPlaceRide(state, kind, tx, ty)) {
    placeRide(state, kind, tx, ty);
    // recalc bonus for flat rides
    const r = state.rides[state.rides.length - 1];
    if (r) {
      r.excitement += sceneryBonusForRide(state, r);
    }
  } else {
    notify(state, 'Cannot place here', 'warn');
  }
}

function tryPlaceScenery(tx, ty) {
  const kind = state.ui.subTool;
  if (!kind) return;
  if (placeScenery(state, kind, tx, ty)) {
    // ok
  } else {
    notify(state, 'Cannot place scenery here', 'warn');
  }
}

function tryHireStaff(tx, ty) {
  const kind = state.ui.subTool;
  if (!kind) return;
  hireStaff(state, kind, tx, ty);
}

function handleCoasterClick(tx, ty) {
  if (state.ui.coasterBuilding) {
    // already building — clicking placed pieces, but UI is via the window
    return;
  }
  // start a new coaster — show type chooser? for now default to wooden if research lacks steel
  const co = startCoaster(state, state.research.unlocked.has('steel') ? 'steel' : 'wooden', tx, ty);
  if (co) {
    state.ui.coasterBuilding = co;
    coasterBuilderWindow(state, co);
  } else {
    notify(state, 'Cannot start coaster here', 'warn');
  }
}

function handleDemolishClick(tx, ty) {
  const t = tile(state.terrain, tx, ty);
  if (!t) return;
  if (t.ride) {
    const ride = state.rides.find(r => r.id === t.ride);
    if (ride) { demolishRide(state, ride.id); return; }
    const co = state.coasters.find(c => c.id === t.ride);
    if (co) { demolishCoaster(state, co.id); return; }
  }
  if (t.path) {
    removePath(state.terrain, tx, ty);
    state.finance.recordTransaction('construction', 3, 'Remove path');
    return;
  }
  if (t.scenery) {
    removeScenery(state, tx, ty);
    return;
  }
}

function updateGhost() {
  const t = state.ui.hoverTile;
  if (!t || !state.terrain) { state.ui.ghost = null; return; }
  const tt = tile(state.terrain, t.tx, t.ty);
  if (!tt) return;
  switch (state.ui.tool) {
    case 'path':
    case 'queue':
      state.ui.ghost = { kind: state.ui.tool, valid: !tt.path && !tt.water && !tt.ride };
      break;
    case 'ride':
    case 'shop': {
      const kind = state.ui.subTool;
      if (!kind || !RIDE_DEFS[kind]) { state.ui.ghost = null; return; }
      const def = RIDE_DEFS[kind];
      state.ui.ghost = { kind: 'ride', w: def.w, h: def.h, valid: canPlaceRide(state, kind, t.tx, t.ty) };
      break;
    }
    case 'scenery':
      state.ui.ghost = { kind: 'scenery', valid: state.ui.subTool ? !!canPlaceScenery(state, state.ui.subTool, t.tx, t.ty) : false };
      break;
    case 'coaster':
      state.ui.ghost = { kind: 'coaster', valid: !tt.water && !tt.path };
      break;
    default:
      state.ui.ghost = null;
  }
}

function canPlaceScenery(state, kind, tx, ty) {
  // duplicate of scenery.js — small inline because module already provides function but we want consistency.
  const def = SCENERY_DEFS[kind];
  if (!def) return false;
  const t = tile(state.terrain, tx, ty);
  if (!t || !t.owned || t.water) return false;
  if (def.onPath) {
    if (!t.path || t.scenery) return false;
  } else {
    if (t.path || t.ride || t.scenery) return false;
  }
  return true;
}

// ----- Toolbar wiring --------
function updateToolbarUI() {
  document.querySelectorAll('#toolbar button[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === state.ui.tool);
  });
  document.querySelectorAll('#toolbar .sub').forEach(sub => {
    sub.classList.toggle('show', sub.dataset.sub === state.ui.tool || (state.ui.tool === 'shop' && sub.dataset.sub === 'shop'));
  });
  // also support 'ride'+'shop'+'scenery' having sub menus
  document.querySelectorAll('#toolbar .sub button').forEach(b => {
    const stKey = b.dataset.subTool || b.dataset.ride || b.dataset.shop || b.dataset.scenery || b.dataset.staff;
    b.classList.toggle('active', stKey === state.ui.subTool);
  });
}

document.getElementById('toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.tool) {
    if (state.ui.tool === btn.dataset.tool) {
      state.ui.tool = null;
      state.ui.subTool = null;
    } else {
      state.ui.tool = btn.dataset.tool;
      state.ui.subTool = null;
      // close coaster builder if switching tools
      if (state.ui.coasterBuilding && state.ui.tool !== 'coaster') {
        // keep the coaster building window — but ignore mouse on canvas
      }
    }
    state.ui.ghost = null;
    updateToolbarUI();
  } else if (btn.dataset.subTool) {
    state.ui.subTool = btn.dataset.subTool;
    updateToolbarUI();
  } else if (btn.dataset.ride) {
    state.ui.tool = 'ride'; state.ui.subTool = btn.dataset.ride; updateToolbarUI();
  } else if (btn.dataset.shop) {
    state.ui.tool = 'shop'; state.ui.subTool = btn.dataset.shop; updateToolbarUI();
  } else if (btn.dataset.scenery) {
    state.ui.tool = 'scenery'; state.ui.subTool = btn.dataset.scenery; updateToolbarUI();
  } else if (btn.dataset.staff) {
    state.ui.tool = 'staff'; state.ui.subTool = btn.dataset.staff; updateToolbarUI();
  } else if (btn.dataset.action) {
    handleAction(btn.dataset.action);
  }
});

function handleAction(action) {
  switch (action) {
    case 'finance': financeWindow(state); break;
    case 'park': parkInfoWindow(state); break;
    case 'research': researchWindow(state); break;
    case 'save': saveGame(state); break;
    case 'load': {
      const data = loadGame();
      if (data) hydrateFromSave(data);
      else notify(state, 'No save found', 'warn');
      break;
    }
    case 'menu': location.reload(); break;
  }
}

// Speed buttons
document.querySelectorAll('#hud .speed button').forEach(b => {
  b.onclick = () => { state.gameSpeed = parseInt(b.dataset.speed); updateSpeedUI(); };
});
function updateSpeedUI() {
  document.querySelectorAll('#hud .speed button').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.speed) === state.gameSpeed);
  });
}

// Side panel ride list
const rideListEl = document.getElementById('ride-list');
function updateSidePanel() {
  if (!state.terrain) return;
  const all = [...state.rides, ...state.coasters].filter(r => !r.demolished);
  if (all.length === 0) { rideListEl.textContent = 'none built yet'; return; }
  rideListEl.innerHTML = all.map(r => {
    const exc = Math.round((r.excitement || 0) / 0.15);
    return `
      <div class="ride-row" data-id="${r.id}">
        <span title="${r.name}">${escapeHtmlSmall(r.name).slice(0, 18)}</span>
        <span title="Excitement"><span class="bar"><i style="width:${exc}%"></i></span></span>
      </div>
    `;
  }).join('');
  rideListEl.querySelectorAll('.ride-row').forEach(el => {
    el.onclick = () => {
      const id = +el.dataset.id;
      const r = state.rides.find(x => x.id === id) || state.coasters.find(x => x.id === id);
      if (r) rideDetailWindow(state, r);
    };
  });
}
function escapeHtmlSmall(s) {
  return String(s).replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
}

// ----- Game tick loop --------
const TICK_HZ = 40;
const TICK_MS = 1000 / TICK_HZ;
let lastTick = performance.now();
let accumulator = 0;
let lastFrame = performance.now();
let fps = 60;

function update(dtMs) {
  state.tickCount++;
  state.time.tick++;
  // Spawn peeps based on park rating
  if (state.tickCount % Math.max(20, 200 - state.parkRating / 5) < 1) {
    if (state.parkEntrance) {
      const total = state.peeps.filter(p => p.alive).length;
      if (total < 1500 && Math.random() < 0.3 + state.parkRating / 1500) {
        const peep = spawnPeep(state, state.parkEntrance.tx, state.parkEntrance.ty);
        peep.x = state.parkEntrance.tx + 0.5;
        peep.y = state.parkEntrance.ty + 0.5;
        if (state.finance.parkAdmission > 0) {
          if (peep.cash >= state.finance.parkAdmission) {
            peep.cash -= state.finance.parkAdmission;
            state.finance.recordTransaction('admission', state.finance.parkAdmission, 'Park admission');
          } else {
            peep.alive = false; // can't afford, turn away
          }
        }
      }
    }
  }
  updatePeeps(state);
  updateRides(state);
  updateCoasters(state);
  updateStaff(state);
  // litter drop occasionally
  if (state.tickCount % 40 === 0) dropLitter(state);
  // monthly tick
  if (state.tickCount % (TICK_HZ * 30) === 0) {
    monthlyTick();
  }
  // weekly wages
  if (state.tickCount % (TICK_HZ * 7) === 0) payWages(state);
  // research progress (each 100 ticks)
  if (state.tickCount % 100 === 0) state.research.advance(state);
}

function monthlyTick() {
  state.time.month++;
  if (state.time.month >= 8) { state.time.month = 0; state.time.year++; }
  // research budget
  state.finance.recordTransaction('research', -state.research.budget, 'R&D budget');
  // finance month
  state.finance.monthlyTick();
  // negative cash counter
  if (state.finance.cash < -1000) state.monthsOfNegativeCash++;
  else state.monthsOfNegativeCash = 0;
  // park rating
  updateParkRating();
  // objective evaluation
  const result = evaluateObjective(state);
  if (result === 'won') {
    state.gameSpeed = 0;
    gameOverWindow(state, true);
  } else if (result === 'lost') {
    state.gameSpeed = 0;
    gameOverWindow(state, false);
  }
}

function updateParkRating() {
  const alive = state.peeps.filter(p => p.alive);
  let r = 0;
  if (alive.length > 0) {
    const avgHappy = alive.reduce((s, p) => s + p.happiness, 0) / alive.length;
    r += avgHappy / 255 * 600;
    // ride bonus
    const rides = state.rides.filter(rd => !rd.demolished && rd.category !== 'shop').length +
      state.coasters.filter(c => !c.demolished).length;
    r += Math.min(rides * 25, 250);
    // cleanliness
    let dirtyTiles = 0, pathTiles = 0;
    for (const t of state.terrain.tiles) {
      if (t.path) { pathTiles++; if (t.litter > 80) dirtyTiles++; }
    }
    if (pathTiles > 0) r -= (dirtyTiles / pathTiles) * 200;
  }
  state.parkRating = Math.max(0, Math.min(999, Math.round(r) || 100));
  state.parkRatingHistory.push(state.parkRating);
  if (state.parkRatingHistory.length > 100) state.parkRatingHistory.shift();
}

function handleCameraKeys() {
  const speed = 12 / state.cam.zoom;
  if (keys.has('w') || keys.has('arrowup')) state.cam.y -= speed;
  if (keys.has('s') || keys.has('arrowdown')) state.cam.y += speed;
  if (keys.has('a') || keys.has('arrowleft')) state.cam.x -= speed;
  if (keys.has('d') || keys.has('arrowright')) state.cam.x += speed;
}

function renderHud() {
  if (!state.finance) return;
  const cash = state.finance.cash;
  document.getElementById('hud-cash').textContent = `${cash.toLocaleString()}`;
  document.querySelector('#hud .cash').classList.toggle('neg', cash < 0);
  document.getElementById('hud-guests').textContent = state.peeps.filter(p => p.alive).length;
  document.getElementById('hud-rating').textContent = state.parkRating;
  document.getElementById('hud-park').textContent = state.parkName;
  document.getElementById('hud-date').textContent = `${['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct'][state.time.month] || 'Mar'} Y${state.time.year + 1}`;
  // debug overlay
  if (state.ui.showDebug) {
    document.getElementById('debug').textContent =
      `FPS ${fps.toFixed(0)} | tick ${state.tickCount} | peeps ${state.peeps.length} | rides ${state.rides.length} | coasters ${state.coasters.length} | speed ${state.gameSpeed}x`;
  }
}

let sideUpdateCount = 0;
function frame(now) {
  const dt = now - lastFrame;
  lastFrame = now;
  fps = fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1;

  if (state.terrain) {
    handleCameraKeys();
    accumulator += dt * state.gameSpeed;
    while (accumulator >= TICK_MS) {
      update(TICK_MS);
      accumulator -= TICK_MS;
    }
    state.time2 = performance.now();
    renderWorld({ ...state, time: now });
    renderHud();
    if (sideUpdateCount++ % 20 === 0) updateSidePanel();
  } else {
    // title screen still visible, no render
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Tooltips on demand (no per-frame DOM thrash)
window.addEventListener('resize', () => resize());

// Expose state for debugging
window.__state = state;
